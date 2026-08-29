/**
 * 赛事详情页 FAB 初始化与 onResize 窗口高度读取契约。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/tournamentDetailMoreFabWindow.selftest.js
 */

var fs = require('fs');
var path = require('path');

var detailJsPath = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'detail',
  'index.js'
);
var src = fs.readFileSync(detailJsPath, 'utf8');
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

function extractBlock(startNeedle) {
  var start = src.indexOf(startNeedle);
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

function extractMethod(name) {
  var re = new RegExp('\\n  ' + name.replace(/\$/g, '\\$') + '\\([^)]*\\) \\{');
  var match = re.exec(src);
  if (!match) return '';
  var start = match.index + 1;
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

var helperSrc = extractBlock('function readTournamentDetailWindowSize()');
var finiteSrc = extractBlock('function isPositiveFiniteNumber(value)');
var initSrc = extractMethod('_initMoreFab');
var resizeSrc = extractMethod('onResize');
var setTopSrc = extractMethod('_setFabTop');
var hitSrc = extractMethod('_updateFabHitState');

assert(
  '生产方法源码可提取',
  !!(helperSrc && finiteSrc && initSrc && resizeSrc && setTopSrc && hitSrc)
);

function compileFn(text) {
  var fnSrc = text.replace(/^\s*(_?\w+)\(/, 'function $1(');
  return new Function('return (' + fnSrc + ')')();
}

global.FAB_SIZE_RPX = 60;
global.FAB_HIDE_MARGIN_RPX = 16;
global.FAB_EDGE_GAP_RPX = 10;
global.isPositiveFiniteNumber = compileFn(finiteSrc);
global.readTournamentDetailWindowSize = compileFn(helperSrc);

function expectedMetrics(windowWidth, windowHeight) {
  var rpx2px = windowWidth / 750;
  var fabSizePx = 60 * rpx2px;
  var fabRightPx = 16 * rpx2px;
  var fabMinTopPx = 10 * rpx2px;
  var fabMaxTopPx = Math.max(fabMinTopPx, windowHeight - fabSizePx - 10 * rpx2px);
  var centerTop = (windowHeight - fabSizePx) / 2;
  return {
    rpx2px: rpx2px,
    fabSizePx: fabSizePx,
    fabRightPx: fabRightPx,
    fabMinTopPx: fabMinTopPx,
    fabMaxTopPx: fabMaxTopPx,
    centerTop: centerTop
  };
}

function metricsMatch(host, ww, wh) {
  var exp = expectedMetrics(ww, wh);
  return (
    host._rpx2px === exp.rpx2px &&
    host._fabSizePx === exp.fabSizePx &&
    host._fabRightPx === exp.fabRightPx &&
    host._fabMinTopPx === exp.fabMinTopPx &&
    host._fabMaxTopPx === exp.fabMaxTopPx &&
    host._fabWindowH === wh &&
    host._receivedCenterTop === exp.centerTop
  );
}

function makeHost(tab) {
  var order = [];
  var host = {
    data: {
      fabTopPx: 0,
      fabStyle: '',
      moreFabHitTarget: false,
      activeTab: tab || '',
      scrollYState: 12
    },
    _fabHitZones: [],
    _fabWindowH: 501,
    setData: function (patch) {
      Object.keys(patch).forEach(function (key) {
        host.data[key] = patch[key];
      });
    },
    measureTabTop: function () {
      order.push('measureTabTop');
    },
    computeRosterMinHeight: function () {
      order.push('roster');
    },
    computeGroupsPanelMinHeight: function () {
      order.push('groups');
    },
    _syncStickyByScroll: function (y) {
      order.push('sticky:' + y);
    },
    updateTabContentSpacer: function () {
      order.push('spacer');
    }
  };
  host._updateFabHitState = compileFn(hitSrc).bind(host);
  var realSetFabTop = compileFn(setTopSrc).bind(host);
  host._setFabTop = function (topPx) {
    order.push('setFabTop');
    host._receivedCenterTop = topPx;
    return realSetFabTop(topPx);
  };
  host._refreshFabHitZones = function () {
    order.push('refresh');
    host._refreshCount = (host._refreshCount || 0) + 1;
  };
  host._initMoreFab = compileFn(initSrc).bind(host);
  host.onResize = compileFn(resizeSrc).bind(host);
  host._order = order;
  return host;
}

function withWx(wxApi, fn) {
  var prev = global.wx;
  global.wx = wxApi;
  try {
    return fn();
  } finally {
    global.wx = prev;
  }
}

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 414, windowHeight: 812 };
    },
    getSystemInfoSync: function () {
      throw new Error('legacy should not run');
    }
  },
  function () {
    var got = global.readTournamentDetailWindowSize();
    assert(
      '读取函数有效宽高不为 null 且不含默认值写入',
      got.windowWidth === 414 && got.windowHeight === 812
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 0, windowHeight: '667' };
    },
    getSystemInfoSync: function () {
      return {};
    }
  },
  function () {
    var got = global.readTournamentDetailWindowSize();
    assert(
      '读取函数缺失字段返回 null 而非 375x667',
      got.windowWidth === null && got.windowHeight === null
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 375, windowHeight: 667 };
    },
    getSystemInfoSync: function () {
      throw new Error('legacy');
    }
  },
  function () {
    var sysCalls = 0;
    global.wx.getSystemInfoSync = function () {
      sysCalls += 1;
      return { windowWidth: 320, windowHeight: 500 };
    };
    var host = makeHost();
    host._initMoreFab();
    assert(
      '现代 API 有效宽高时旧 API 0 次',
      sysCalls === 0 && metricsMatch(host, 375, 667)
    );
    assert(
      '375x667 FAB 公式与修改前一致',
      host._rpx2px === 0.5 &&
        host._fabSizePx === 30 &&
        host._fabRightPx === 8 &&
        host._fabMinTopPx === 5 &&
        host._fabMaxTopPx === 632 &&
        host._receivedCenterTop === 318.5
    );
    assert(
      '_setFabTop 在 _refreshFabHitZones 之前',
      host._refreshCount === 1 &&
        host._order.indexOf('setFabTop') >= 0 &&
        host._order.indexOf('refresh') === host._order.indexOf('setFabTop') + 1
    );
  }
);

withWx(
  {
    getSystemInfoSync: function () {
      return { windowWidth: 390, windowHeight: 844 };
    }
  },
  function () {
    var sysCalls = 0;
    global.wx.getSystemInfoSync = function () {
      sysCalls += 1;
      return { windowWidth: 390, windowHeight: 844 };
    };
    var host = makeHost();
    host._initMoreFab();
    assert(
      '现代 API 不存在时回退旧 API',
      sysCalls === 1 && metricsMatch(host, 390, 844)
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      throw new Error('boom');
    },
    getSystemInfoSync: function () {
      return { windowWidth: 360, windowHeight: 780 };
    }
  },
  function () {
    var host = makeHost();
    host._initMoreFab();
    assert('现代 API 抛错时回退旧 API', metricsMatch(host, 360, 780));
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 390, windowHeight: 0 };
    },
    getSystemInfoSync: function () {
      return { windowWidth: 320, windowHeight: 800 };
    }
  },
  function () {
    var host = makeHost();
    host._initMoreFab();
    assert(
      '字段级合并：保留现代宽度、旧 API 只补高度',
      metricsMatch(host, 390, 800)
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: NaN, windowHeight: 812 };
    },
    getSystemInfoSync: function () {
      return { windowWidth: 414, windowHeight: 100 };
    }
  },
  function () {
    var host = makeHost();
    host._initMoreFab();
    assert(
      '字段级合并：保留现代高度、旧 API 只补宽度',
      metricsMatch(host, 414, 812)
    );
  }
);

var invalidPairs = [
  [{}, {}],
  [{ windowWidth: 0, windowHeight: 0 }, { windowWidth: 0, windowHeight: 0 }],
  [{ windowWidth: -8, windowHeight: -20 }, { windowWidth: -1, windowHeight: -2 }],
  [{ windowWidth: NaN, windowHeight: NaN }, { windowWidth: NaN, windowHeight: NaN }],
  [{ windowWidth: Infinity, windowHeight: Infinity }, { windowWidth: Infinity, windowHeight: Infinity }],
  [{ windowWidth: '375', windowHeight: '667' }, { windowWidth: '390', windowHeight: '844' }]
];
var invalidOk = invalidPairs.every(function (pair) {
  var host = makeHost();
  global.wx = {
    getWindowInfo: function () {
      return pair[0];
    },
    getSystemInfoSync: function () {
      return pair[1];
    }
  };
  host._initMoreFab();
  return metricsMatch(host, 375, 667);
});
assert('空对象/0/负数/NaN/Infinity/字符串视为无效并回落 375x667', invalidOk);

withWx(
  {
    getWindowInfo: function () {
      throw new Error('modern');
    },
    getSystemInfoSync: function () {
      throw new Error('legacy');
    }
  },
  function () {
    var host = makeHost();
    var threw = false;
    try {
      host._initMoreFab();
    } catch (e) {
      threw = true;
    }
    assert(
      '两套 API 失败时 FAB 使用 375x667 且不中断',
      !threw && metricsMatch(host, 375, 667)
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 320, windowHeight: 80 };
    }
  },
  function () {
    var host = makeHost();
    host._initMoreFab();
    assert(
      '小窗口 maxTop 不低于 minTop',
      host._fabMaxTopPx >= host._fabMinTopPx &&
        host._fabMaxTopPx === expectedMetrics(320, 80).fabMaxTopPx
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 375, windowHeight: 720 };
    },
    getSystemInfoSync: function () {
      throw new Error('legacy');
    },
    nextTick: function (cb) {
      cb();
    }
  },
  function () {
    var sysCalls = 0;
    global.wx.getSystemInfoSync = function () {
      sysCalls += 1;
      return { windowHeight: 100 };
    };
    var host = makeHost();
    host._fabWindowH = 501;
    host.onResize();
    assert(
      'onResize 现代有效高度更新且旧 API 0 次',
      sysCalls === 0 && host._fabWindowH === 720
    );
    assert(
      'onResize 仍执行 measureTabTop 与 updateTabContentSpacer',
      host._order[0] === 'measureTabTop' &&
        host._order.indexOf('spacer') === host._order.length - 1
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 375, windowHeight: 0 };
    },
    getSystemInfoSync: function () {
      return { windowWidth: 320, windowHeight: 900 };
    },
    nextTick: function (cb) {
      cb();
    }
  },
  function () {
    var host = makeHost();
    host._fabWindowH = 501;
    host.onResize();
    assert(
      'onResize 现代高度无效时使用旧 API 有效高度',
      host._fabWindowH === 900
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      throw new Error('modern');
    },
    getSystemInfoSync: function () {
      throw new Error('legacy');
    },
    nextTick: function (cb) {
      cb();
    }
  },
  function () {
    var host = makeHost();
    host._fabWindowH = 501;
    var threw = false;
    try {
      host.onResize();
    } catch (e) {
      threw = true;
    }
    assert(
      'onResize 两套失败时保留旧 _fabWindowH 且不中断',
      !threw && host._fabWindowH === 501 && host._order[0] === 'measureTabTop' && host._order.indexOf('spacer') >= 0
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowHeight: NaN };
    },
    getSystemInfoSync: function () {
      return { windowHeight: '800' };
    },
    nextTick: function (cb) {
      cb();
    }
  },
  function () {
    var host = makeHost();
    host._fabWindowH = 501;
    host.onResize();
    assert('onResize 高度无效时不清空也不写入 667', host._fabWindowH === 501);
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 375, windowHeight: 667 };
    },
    nextTick: function (cb) {
      cb();
    }
  },
  function () {
    var host = makeHost('register');
    host.onResize();
    assert(
      'register 激活时 nextTick 工作流不变',
      host._order.join(',') === 'measureTabTop,roster,sticky:12,spacer'
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 375, windowHeight: 667 };
    },
    nextTick: function (cb) {
      cb();
    }
  },
  function () {
    var host = makeHost('groups');
    host.onResize();
    assert(
      'groups 激活时 nextTick 工作流不变',
      host._order.join(',') === 'measureTabTop,groups,sticky:12,spacer'
    );
  }
);

assert(
  '_initMoreFab 与 onResize 正常路径不再直接调用旧 API',
  initSrc.indexOf('wx.getSystemInfoSync') < 0 &&
    resizeSrc.indexOf('wx.getSystemInfoSync') < 0 &&
    initSrc.indexOf('readTournamentDetailWindowSize()') >= 0 &&
    resizeSrc.indexOf('readTournamentDetailWindowSize()') >= 0
);

assert(
  'readTournamentDetailWindowSize 仍返回 null 且不写入 375x667',
  extractBlock('function readTournamentDetailWindowSize()').indexOf(
    'windowWidth: isPositiveFiniteNumber(width) ? width : null'
  ) >= 0 &&
    extractBlock('function readTournamentDetailWindowSize()').indexOf(
      'windowHeight: isPositiveFiniteNumber(height) ? height : null'
    ) >= 0
);

console.log('\npassed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
