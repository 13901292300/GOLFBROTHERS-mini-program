/**
 * tournament-tools 横屏 Header metrics 与两页包装契约。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/tournamentToolsLandscapeHeader.selftest.js
 */

var fs = require('fs');
var path = require('path');

var toolsRoot = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament-tools'
);
var utilPath = path.join(toolsRoot, 'utils', 'landscapeHeaderMetrics.js');
var scorecardPath = path.join(toolsRoot, 'pages', 'scorecard', 'index.js');
var statsPath = path.join(toolsRoot, 'pages', 'stats', 'index.js');
var scorecardSrc = fs.readFileSync(scorecardPath, 'utf8');
var statsSrc = fs.readFileSync(statsPath, 'utf8');
var passed = 0;
var failed = 0;

function assert(label, ok) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
    return;
  }
  failed += 1;
  console.log('FAIL  ' + label);
}

function extractFn(src, needle) {
  var start = src.indexOf(needle);
  if (start < 0) return '';
  var braceAt = src.indexOf('{', start);
  var depth = 0;
  for (var i = braceAt; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}

function extractMethod(src, name) {
  var re = new RegExp('\\n  ' + name + '\\(\\) \\{');
  var match = re.exec(src);
  if (!match) return '';
  return extractFn(src.slice(match.index + 1), name + '() {');
}

delete require.cache[require.resolve(utilPath)];
var computeLandscapeHeaderMetrics = require(utilPath).computeLandscapeHeaderMetrics;

var scorecardWrapSrc = extractFn(scorecardSrc, 'function measureHeaderSafeArea()');
var statsWrapSrc = extractFn(statsSrc, 'function measureHeaderSafeArea()');
var scorecardSyncSrc = extractMethod(scorecardSrc, '_syncHeaderSafeArea');
var statsSyncSrc = extractMethod(statsSrc, '_syncHeaderSafeArea');

assert(
  '公共工具与两页包装可加载',
  typeof computeLandscapeHeaderMetrics === 'function' &&
    !!scorecardWrapSrc &&
    !!statsWrapSrc &&
    !!scorecardSyncSrc &&
    !!statsSyncSrc
);

var scorecardMeasure = new Function(
  'computeLandscapeHeaderMetrics',
  'return (' + scorecardWrapSrc + ')'
)(computeLandscapeHeaderMetrics);
var statsMeasure = new Function(
  'computeLandscapeHeaderMetrics',
  'return (' + statsWrapSrc + ')'
)(computeLandscapeHeaderMetrics);

function withWx(wxApi, fn) {
  var prev = global.wx;
  global.wx = wxApi;
  try {
    return fn();
  } finally {
    global.wx = prev;
  }
}

var FALLBACK = {
  headerPadY: 6,
  headerPadRight: 96,
  headerInnerH: 32,
  headerChrome: 46
};

var SAMPLE_MENU = { top: 24, height: 32, left: 281, width: 86 };

function expectedFrom(windowWidth, menu) {
  var capTop = Math.max(0, Number(menu.top) || 0);
  var capH = Math.max(32, Number(menu.height) || 32);
  var padRight = 96;
  if (menu.left > 0 && windowWidth > menu.left) {
    padRight = Math.max(16, windowWidth - menu.left + 8);
  }
  return {
    headerPadY: capTop,
    headerPadRight: padRight,
    headerInnerH: capH,
    headerChrome: capTop * 2 + capH + 2
  };
}

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 812, screenWidth: 375 };
    },
    getSystemInfoSync: function () {
      throw new Error('legacy');
    },
    getMenuButtonBoundingClientRect: function () {
      return SAMPLE_MENU;
    }
  },
  function () {
    var sysCalls = 0;
    global.wx.getSystemInfoSync = function () {
      sysCalls += 1;
      return { windowWidth: 320 };
    };
    var m = computeLandscapeHeaderMetrics();
    var exp = expectedFrom(812, SAMPLE_MENU);
    assert(
      '现代 windowWidth 有效时旧 API 0 次',
      sysCalls === 0 &&
        m.headerPadRight === exp.headerPadRight &&
        m.headerChrome === exp.headerChrome
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 0, screenWidth: 844 };
    },
    getSystemInfoSync: function () {
      throw new Error('legacy');
    },
    getMenuButtonBoundingClientRect: function () {
      return SAMPLE_MENU;
    }
  },
  function () {
    var sysCalls = 0;
    global.wx.getSystemInfoSync = function () {
      sysCalls += 1;
      return {};
    };
    var m = computeLandscapeHeaderMetrics();
    assert(
      '现代 windowWidth 无效时使用 screenWidth 且旧 API 0 次',
      sysCalls === 0 && m.headerPadRight === expectedFrom(844, SAMPLE_MENU).headerPadRight
    );
  }
);

withWx(
  {
    getSystemInfoSync: function () {
      return { windowWidth: 780, screenWidth: 375 };
    },
    getMenuButtonBoundingClientRect: function () {
      return SAMPLE_MENU;
    }
  },
  function () {
    var sysCalls = 0;
    global.wx.getSystemInfoSync = function () {
      sysCalls += 1;
      return { windowWidth: 780, screenWidth: 375 };
    };
    var m = computeLandscapeHeaderMetrics();
    assert(
      '现代 API 缺失时回退旧 API windowWidth',
      sysCalls === 1 && m.headerPadRight === expectedFrom(780, SAMPLE_MENU).headerPadRight
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      throw new Error('boom');
    },
    getSystemInfoSync: function () {
      return { windowWidth: NaN, screenWidth: 700 };
    },
    getMenuButtonBoundingClientRect: function () {
      return SAMPLE_MENU;
    }
  },
  function () {
    var m = computeLandscapeHeaderMetrics();
    assert(
      '现代抛错后旧 API 使用 screenWidth',
      m.headerPadRight === expectedFrom(700, SAMPLE_MENU).headerPadRight
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 0, screenWidth: -1 };
    },
    getSystemInfoSync: function () {
      return { windowWidth: Infinity, screenWidth: '812' };
    },
    getMenuButtonBoundingClientRect: function () {
      return SAMPLE_MENU;
    }
  },
  function () {
    var m = computeLandscapeHeaderMetrics();
    assert(
      '两套宽度均无效时 padRight 保持默认 96',
      m.headerPadRight === 96 && m.headerPadY === 24 && m.headerInnerH === 32
    );
  }
);

var badWidths = [0, -8, NaN, Infinity, '812'];
var badWidthOk = badWidths.every(function (w) {
  global.wx = {
    getWindowInfo: function () {
      return { windowWidth: w, screenWidth: w };
    },
    getSystemInfoSync: function () {
      return { windowWidth: w, screenWidth: w };
    },
    getMenuButtonBoundingClientRect: function () {
      return SAMPLE_MENU;
    }
  };
  return computeLandscapeHeaderMetrics().headerPadRight === 96;
});
assert('0/负数/NaN/Infinity/字符串宽度无效', badWidthOk);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 812 };
    }
  },
  function () {
    assert(
      '胶囊 API 缺失时完整 fallback',
      JSON.stringify(computeLandscapeHeaderMetrics()) === JSON.stringify(FALLBACK)
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 812 };
    },
    getMenuButtonBoundingClientRect: function () {
      throw new Error('menu');
    }
  },
  function () {
    var m = computeLandscapeHeaderMetrics();
    assert(
      '胶囊抛错时完整 fallback',
      m.headerPadY === 6 && m.headerPadRight === 96 && m.headerInnerH === 32 && m.headerChrome === 46
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 812 };
    },
    getMenuButtonBoundingClientRect: function () {
      return {};
    }
  },
  function () {
    assert('胶囊空对象时完整 fallback', computeLandscapeHeaderMetrics().headerChrome === 46);
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 812 };
    },
    getMenuButtonBoundingClientRect: function () {
      return { top: 24, height: 0, left: 281 };
    }
  },
  function () {
    assert('胶囊无效高度时完整 fallback', computeLandscapeHeaderMetrics().headerInnerH === 32 && computeLandscapeHeaderMetrics().headerPadY === 6);
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 812 };
    },
    getMenuButtonBoundingClientRect: function () {
      return { top: -12, height: 40, left: 281 };
    }
  },
  function () {
    var m = computeLandscapeHeaderMetrics();
    assert('capTop 小于 0 时归零', m.headerPadY === 0 && m.headerChrome === 0 * 2 + 40 + 2);
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 812 };
    },
    getMenuButtonBoundingClientRect: function () {
      return { top: 20, height: 20, left: 281 };
    }
  },
  function () {
    var m = computeLandscapeHeaderMetrics();
    assert('capH 小于 32 时取 32', m.headerInnerH === 32 && m.headerChrome === 20 * 2 + 32 + 2);
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 812 };
    },
    getMenuButtonBoundingClientRect: function () {
      return { top: 24, height: 32, left: 281 };
    }
  },
  function () {
    var m = computeLandscapeHeaderMetrics();
    assert(
      'padRight 原公式 max(16, width-left+8)',
      m.headerPadRight === Math.max(16, 812 - 281 + 8)
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 812 };
    },
    getMenuButtonBoundingClientRect: function () {
      return { top: 24, height: 32, left: 0 };
    }
  },
  function () {
    assert('menu.left 不可用时保持 96', computeLandscapeHeaderMetrics().headerPadRight === 96);
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 812 };
    },
    getMenuButtonBoundingClientRect: function () {
      return SAMPLE_MENU;
    }
  },
  function () {
    var shared = computeLandscapeHeaderMetrics();
    var sc = scorecardMeasure();
    var st = statsMeasure();
    assert('Scorecard 返回 headerChrome', sc.headerChrome === shared.headerChrome && sc.headerChrome === 24 * 2 + 32 + 2);
    assert(
      'Stats 返回 statsHeaderChrome 且等于公共 headerChrome',
      st.statsHeaderChrome === shared.headerChrome && st.headerChrome === undefined
    );
    assert(
      '两页 padding/高度结果一致',
      sc.headerPadY === st.headerPadY &&
        sc.headerPadRight === st.headerPadRight &&
        sc.headerInnerH === st.headerInnerH &&
        sc.headerChrome === st.statsHeaderChrome
    );
  }
);

function bindSync(measureFn, syncSrc, initial) {
  var host = {
    data: Object.assign(
      {
        headerPadY: 6,
        headerPadRight: 96,
        headerInnerH: 32
      },
      initial
    ),
    _setDataCalls: [],
    setData: function (patch) {
      host._setDataCalls.push(Object.assign({}, patch));
      Object.keys(patch).forEach(function (k) {
        host.data[k] = patch[k];
      });
    }
  };
  var fnSrc = syncSrc.replace(/^\s*_syncHeaderSafeArea\(/, 'function _syncHeaderSafeArea(');
  host._syncHeaderSafeArea = new Function(
    'measureHeaderSafeArea',
    'return (' + fnSrc + ')'
  )(measureFn).bind(host);
  return host;
}

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 812 };
    },
    getMenuButtonBoundingClientRect: function () {
      return SAMPLE_MENU;
    }
  },
  function () {
    var nextSc = scorecardMeasure();
    var hostSc = bindSync(scorecardMeasure, scorecardSyncSrc, nextSc);
    hostSc._syncHeaderSafeArea();
    assert('Scorecard 数值未变化时不 setData', hostSc._setDataCalls.length === 0);

    var nextSt = statsMeasure();
    var hostSt = bindSync(statsMeasure, statsSyncSrc, nextSt);
    hostSt._syncHeaderSafeArea();
    assert('Stats 数值未变化时不 setData', hostSt._setDataCalls.length === 0);

    hostSc.data.headerPadY = 0;
    hostSc._syncHeaderSafeArea();
    assert(
      'Scorecard 变化时只写原有 Header 字段',
      hostSc._setDataCalls.length === 1 &&
        Object.keys(hostSc._setDataCalls[0]).sort().join(',') ===
          'headerChrome,headerInnerH,headerPadRight,headerPadY'
    );

    hostSt.data.headerPadY = 0;
    hostSt._syncHeaderSafeArea();
    assert(
      'Stats 变化时只写原有 Header 字段',
      hostSt._setDataCalls.length === 1 &&
        Object.keys(hostSt._setDataCalls[0]).sort().join(',') ===
          'headerInnerH,headerPadRight,headerPadY,statsHeaderChrome' &&
        hostSt._setDataCalls[0].headerChrome === undefined
    );
  }
);

assert(
  'resize 绑定/解绑与横屏锁定源码未改业务',
  scorecardSrc.indexOf("orientation: 'landscape'") >= 0 &&
    statsSrc.indexOf("orientation: 'landscape'") >= 0 &&
    scorecardSrc.indexOf('setTimeout(() => this._syncHeaderSafeArea(), 80)') >= 0 &&
    statsSrc.indexOf('setTimeout(() => this._syncHeaderSafeArea(), 80)') >= 0 &&
    scorecardSrc.indexOf('_bindWindowResize() {') >= 0 &&
    scorecardSrc.indexOf('if (this._onWindowResize) return;') >= 0 &&
    statsSrc.indexOf('if (this._onWindowResize) return;') >= 0 &&
    scorecardSrc.indexOf('_restorePortrait(done)') >= 0 &&
    statsSrc.indexOf("orientation: 'portrait'") >= 0 &&
    scorecardSrc.indexOf('wx.onWindowResize(this._onWindowResize)') >= 0 &&
    scorecardSrc.indexOf('wx.offWindowResize(this._onWindowResize)') >= 0
);

assert(
  '两页不再以 getSystemInfoSync 为主路径',
  scorecardSrc.indexOf('wx.getSystemInfoSync') < 0 &&
    statsSrc.indexOf('wx.getSystemInfoSync') < 0 &&
    scorecardSrc.indexOf('computeLandscapeHeaderMetrics') >= 0 &&
    statsSrc.indexOf('statsHeaderChrome: metrics.headerChrome') >= 0
);

console.log('\npassed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
