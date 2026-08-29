/**
 * 系列赛详情：名单高度、讨论区高度、管理 FAB 窗口读取契约。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesDetailWindowLayout.selftest.js
 */

var fs = require('fs');
var path = require('path');

var pagePath = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail',
  'index.js'
);
var src = fs.readFileSync(pagePath, 'utf8');
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
  var re = new RegExp('\\n  ' + name.replace(/\$/g, '\\$') + ': function \\([^)]*\\) \\{');
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

var layoutSrc = extractBlock('function readSeriesDetailWindowLayout(opts)');
var pickSrc = extractBlock('function pickSeriesDetailWindowFields(info, current)');
var readySrc = extractBlock('function isSeriesDetailWindowReady(cur, needSafeArea)');
var posSrc = extractBlock('function isPositiveFiniteNumber(value)');
var finSrc = extractBlock('function isFiniteNumber(value)');
var rosterSrc = extractMethod('computeRosterMinHeight');
var discSrc = extractMethod('_computeDiscussionPanelMinHeight');
var fabSrc = extractMethod('_initMoreFab');
var setTopSrc = extractMethod('_setFabTop');
var hitSrc = extractMethod('_updateFabHitState');

assert(
  '生产方法源码可提取',
  !!(layoutSrc && pickSrc && readySrc && posSrc && finSrc && rosterSrc && discSrc && fabSrc && setTopSrc && hitSrc)
);

function compileFn(text) {
  var fnSrc = text.replace(/^\s*(_?\w+):\s*function\s*/, 'function $1');
  if (fnSrc.indexOf('function ') !== 0) {
    fnSrc = text.replace(/^\s*(function\s+\w+)/, '$1');
  }
  return new Function('return (' + fnSrc + ')')();
}

global.isPositiveFiniteNumber = compileFn(posSrc);
global.isFiniteNumber = compileFn(finSrc);
global.pickSeriesDetailWindowFields = compileFn(pickSrc);
global.isSeriesDetailWindowReady = compileFn(readySrc);
global.readSeriesDetailWindowLayout = compileFn(layoutSrc);
global.FAB_SIZE_RPX = 60;
global.FAB_HIDE_MARGIN_RPX = 16;
global.FAB_EDGE_GAP_RPX = 10;

function withWx(wxApi, fn) {
  var prev = global.wx;
  global.wx = wxApi;
  try {
    return fn();
  } finally {
    global.wx = prev;
  }
}

function expectedRoster(winW, winH, headerH, mainTabH, extH, bottomReserve) {
  var rpx2px = winW / 750;
  var gap = 40 * rpx2px;
  var h = winH - headerH - mainTabH - extH - bottomReserve - gap;
  if (!(h > 0)) h = 0;
  return Math.round(h);
}

function expectedFab(ww, wh) {
  var rpx2px = ww / 750;
  var size = 60 * rpx2px;
  return {
    rpx2px: rpx2px,
    fabSizePx: size,
    fabRightPx: 16 * rpx2px,
    fabMinTopPx: 10 * rpx2px,
    fabMaxTopPx: Math.max(10 * rpx2px, wh - size - 10 * rpx2px),
    centerTop: (wh - size) / 2
  };
}

function mockQuery(host, rects) {
  host._selectors = [];
  host.createSelectorQuery = function () {
    var chain = {
      in: function () {
        return chain;
      },
      select: function (sel) {
        host._selectors.push(sel);
        return chain;
      },
      boundingClientRect: function () {
        return chain;
      },
      exec: function (cb) {
        cb(rects);
      }
    };
    return chain;
  };
}

function makeRosterHost(extra) {
  var host = {
    _activeTab: 'register',
    _pageAlive: true,
    _rosterMeasureToken: 0,
    data: Object.assign(
      {
        headerTotalHeight: 92,
        primaryTabHeight: 50,
        rosterMinHeight: -1
      },
      extra && extra.data
    ),
    setData: function (patch) {
      host._setDataCalls = (host._setDataCalls || []).concat([patch]);
      Object.keys(patch).forEach(function (k) {
        host.data[k] = patch[k];
      });
    }
  };
  if (extra) {
    Object.keys(extra).forEach(function (k) {
      if (k !== 'data') host[k] = extra[k];
    });
  }
  host.computeRosterMinHeight = compileFn(rosterSrc).bind(host);
  return host;
}

function makeDiscHost(extra) {
  var host = Object.assign(
    {
      data: { headerTotalHeight: 92, primaryTabHeight: 44 },
      _lastViewportHeight: 0
    },
    extra || {}
  );
  host._computeDiscussionPanelMinHeight = compileFn(discSrc).bind(host);
  return host;
}

function makeFabHost() {
  var order = [];
  var host = {
    data: { fabTopPx: 0, fabStyle: '', moreFabHitTarget: false },
    _fabHitZones: [],
    _safeSetData: function (patch) {
      Object.keys(patch).forEach(function (k) {
        host.data[k] = patch[k];
      });
    }
  };
  host._updateFabHitState = compileFn(hitSrc).bind(host);
  var realSet = compileFn(setTopSrc).bind(host);
  host._setFabTop = function (topPx) {
    order.push('setFabTop');
    host._receivedCenterTop = topPx;
    return realSet(topPx);
  };
  host._refreshFabHitZones = function () {
    order.push('refresh');
  };
  host._initMoreFab = compileFn(fabSrc).bind(host);
  host._order = order;
  return host;
}

var FULL = {
  windowWidth: 390,
  windowHeight: 844,
  screenHeight: 844,
  safeArea: { bottom: 810 }
};

withWx(
  {
    getWindowInfo: function () {
      return FULL;
    },
    getSystemInfoSync: function () {
      throw new Error('legacy');
    }
  },
  function () {
    var sysCalls = 0;
    global.wx.getSystemInfoSync = function () {
      sysCalls += 1;
      return {};
    };
    var hostR = makeRosterHost();
    mockQuery(hostR, [{ height: 92 }, { height: 50 }, { height: 60 }, { height: 88 }]);
    hostR.computeRosterMinHeight();
    var hostD = makeDiscHost();
    var minH = hostD._computeDiscussionPanelMinHeight();
    var hostF = makeFabHost();
    hostF._initMoreFab();
    assert(
      '三函数现代 API 成功时旧 API 0 次',
      sysCalls === 0 &&
        hostR.data.rosterMinHeight === expectedRoster(390, 844, 92, 50, 60, 88) &&
        minH === Math.max(280, Math.ceil(844 - 92 - 44)) &&
        hostF._fabWindowH === 844
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 390, windowHeight: 844 };
    },
    getSystemInfoSync: function () {
      return {
        windowWidth: 320,
        windowHeight: 500,
        screenHeight: 812,
        safeArea: { bottom: 778 }
      };
    }
  },
  function () {
    var layout = global.readSeriesDetailWindowLayout({ needSafeArea: true });
    assert(
      '字段级降级：现代宽高不被覆盖，旧 API 只补 safeArea',
      layout.windowWidth === 390 &&
        layout.windowHeight === 844 &&
        layout.screenHeight === 812 &&
        layout.safeBottom === 34
    );
  }
);

var invalids = [
  { windowWidth: 0, windowHeight: 0, screenHeight: 0, safeArea: { bottom: 0 } },
  { windowWidth: -1, windowHeight: -2, screenHeight: -3, safeArea: { bottom: -4 } },
  { windowWidth: NaN, windowHeight: NaN, screenHeight: NaN, safeArea: { bottom: NaN } },
  { windowWidth: Infinity, windowHeight: Infinity, screenHeight: Infinity, safeArea: { bottom: Infinity } },
  { windowWidth: '390', windowHeight: '844', screenHeight: '844', safeArea: { bottom: '810' } }
];
var invalidOk = invalids.every(function (info) {
  global.wx = {
    getWindowInfo: function () {
      return info;
    },
    getSystemInfoSync: function () {
      return info;
    }
  };
  var layout = global.readSeriesDetailWindowLayout({ needSafeArea: true });
  var host = makeFabHost();
  host._initMoreFab();
  return (
    layout.windowWidth == null &&
    layout.windowHeight == null &&
    layout.safeBottom === 0 &&
    host._fabWindowH === 667 &&
    host._rpx2px === 0.5
  );
});
assert('无效值 0/负数/NaN/Infinity/字符串不进入公式', invalidOk);

withWx(
  {
    getWindowInfo: function () {
      return FULL;
    }
  },
  function () {
    var host = makeRosterHost();
    mockQuery(host, [{ height: 92 }, { height: 50 }, { height: 60 }, { height: 0 }]);
    host.computeRosterMinHeight();
    assert(
      'roster 无 CTA 时使用 safeBottom 公式',
      host.data.rosterMinHeight === expectedRoster(390, 844, 92, 50, 60, 34)
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return FULL;
    }
  },
  function () {
    var host = makeRosterHost();
    mockQuery(host, [{ height: 92 }, { height: 50 }, { height: 60 }, { height: 88 }]);
    host.computeRosterMinHeight();
    assert(
      'roster 有 CTA 时不叠加 safeBottom',
      host.data.rosterMinHeight === expectedRoster(390, 844, 92, 50, 60, 88)
    );
    assert(
      'roster SelectorQuery 顺序不变',
      host._selectors.join(',') ===
        '.gb-header,.tab-scroll-wrap--inflow,.register-ext-wrap--inflow,.register-cta-bar'
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return FULL;
    }
  },
  function () {
    var host = makeRosterHost();
    mockQuery(host, [{ height: 92 }, { height: 50 }, { height: 60 }, { height: 88 }]);
    host.computeRosterMinHeight();
    var first = host.data.rosterMinHeight;
    host._setDataCalls = [];
    host.computeRosterMinHeight();
    assert('roster 高度未变化时不 setData', host._setDataCalls.length === 0 && host.data.rosterMinHeight === first);
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 375, windowHeight: 667, screenHeight: 667, safeArea: { bottom: 667 } };
    }
  },
  function () {
    var host = makeRosterHost();
    mockQuery(host, [{ height: 400 }, { height: 200 }, { height: 200 }, { height: 200 }]);
    host.computeRosterMinHeight();
    assert('roster 高度 <= 0 时归零', host.data.rosterMinHeight === 0);
  }
);

withWx(
  {
    getWindowInfo: function () {
      return FULL;
    }
  },
  function () {
    var host = makeRosterHost();
    mockQuery(host, [
      { height: 91.6 },
      { height: 50.4 },
      { height: 60.2 },
      { height: 88.1 }
    ]);
    host.computeRosterMinHeight();
    assert(
      'roster Math.round 时机与原公式一致',
      host.data.rosterMinHeight === expectedRoster(390, 844, 91.6, 50.4, 60.2, 88.1)
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return FULL;
    }
  },
  function () {
    var host = makeRosterHost();
    var fired = false;
    host.createSelectorQuery = function () {
      var chain = {
        in: function () {
          return chain;
        },
        select: function () {
          return chain;
        },
        boundingClientRect: function () {
          return chain;
        },
        exec: function (cb) {
          host._rosterMeasureToken += 1;
          fired = true;
          cb([{ height: 92 }, { height: 50 }, { height: 60 }, { height: 88 }]);
        }
      };
      return chain;
    };
    host.computeRosterMinHeight();
    assert('roster token 过期不写状态', fired && !host._setDataCalls);
  }
);

withWx(
  {
    getWindowInfo: function () {
      return FULL;
    }
  },
  function () {
    var host = makeRosterHost();
    host.createSelectorQuery = function () {
      var chain = {
        in: function () {
          return chain;
        },
        select: function () {
          return chain;
        },
        boundingClientRect: function () {
          return chain;
        },
        exec: function (cb) {
          host._pageAlive = false;
          cb([{ height: 92 }, { height: 50 }, { height: 60 }, { height: 88 }]);
        }
      };
      return chain;
    };
    host.computeRosterMinHeight();
    assert('roster 页面销毁不写状态', !host._setDataCalls);
  }
);

withWx(
  {
    getWindowInfo: function () {
      return FULL;
    }
  },
  function () {
    var host = makeRosterHost();
    host.createSelectorQuery = function () {
      var chain = {
        in: function () {
          return chain;
        },
        select: function () {
          return chain;
        },
        boundingClientRect: function () {
          return chain;
        },
        exec: function (cb) {
          host._activeTab = 'info';
          cb([{ height: 92 }, { height: 50 }, { height: 60 }, { height: 88 }]);
        }
      };
      return chain;
    };
    host.computeRosterMinHeight();
    assert('roster TAB 切换后回调不写状态', !host._setDataCalls);
  }
);

withWx(
  {
    getWindowInfo: function () {
      return FULL;
    }
  },
  function () {
    var host = makeDiscHost();
    var minH = host._computeDiscussionPanelMinHeight();
    assert(
      'discussion 使用现代窗口高度公式',
      minH === Math.max(280, Math.ceil(844 - 92 - 44))
    );
  }
);

withWx({}, function () {
  var host = makeDiscHost({
    _lastViewportHeight: 900,
    data: { headerTotalHeight: 92, primaryTabHeight: 44 }
  });
  var minH = host._computeDiscussionPanelMinHeight();
  assert(
    'discussion 无 API 时回退 _lastViewportHeight',
    minH === Math.max(280, Math.ceil(900 - 92 - 44))
  );
});

withWx(
  {
    getWindowInfo: function () {
      throw new Error('m');
    },
    getSystemInfoSync: function () {
      throw new Error('l');
    }
  },
  function () {
    var host = makeDiscHost({ _lastViewportHeight: 900 });
    assert(
      'discussion 两个 API 都抛错时返回 0',
      host._computeDiscussionPanelMinHeight() === 0
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 320, windowHeight: 300 };
    }
  },
  function () {
    var host = makeDiscHost();
    assert(
      'discussion 最低高度 280',
      host._computeDiscussionPanelMinHeight() === 280
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 390, windowHeight: 844 };
    },
    getSystemInfoSync: function () {
      return { windowWidth: 320, windowHeight: 500 };
    }
  },
  function () {
    var sysCalls = 0;
    global.wx.getSystemInfoSync = function () {
      sysCalls += 1;
      return { windowWidth: 320, windowHeight: 500 };
    };
    var host = makeFabHost();
    host._initMoreFab();
    var exp = expectedFab(390, 844);
    assert(
      'FAB 现代有效宽高不调用旧 API 且公式正确',
      sysCalls === 0 &&
        host._rpx2px === exp.rpx2px &&
        host._fabSizePx === exp.fabSizePx &&
        host._fabRightPx === exp.fabRightPx &&
        host._fabMinTopPx === exp.fabMinTopPx &&
        host._fabMaxTopPx === exp.fabMaxTopPx &&
        host._receivedCenterTop === exp.centerTop &&
        host._order.join(',') === 'setFabTop,refresh'
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 390, windowHeight: 0 };
    },
    getSystemInfoSync: function () {
      return { windowWidth: 320, windowHeight: 780 };
    }
  },
  function () {
    var host = makeFabHost();
    host._initMoreFab();
    assert(
      'FAB 字段级合并保留现代宽度、旧 API 补高度',
      host._rpx2px === 390 / 750 && host._fabWindowH === 780
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      throw new Error('x');
    },
    getSystemInfoSync: function () {
      throw new Error('y');
    }
  },
  function () {
    var host = makeFabHost();
    host._initMoreFab();
    var exp = expectedFab(375, 667);
    assert(
      'FAB 双失败使用 375x667',
      host._fabWindowH === 667 &&
        host._rpx2px === 0.5 &&
        host._receivedCenterTop === exp.centerTop
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      throw new Error('no');
    },
    getSystemInfoSync: function () {
      throw new Error('no');
    }
  },
  function () {
    var winCalls = 0;
    var sysCalls = 0;
    global.wx.getWindowInfo = function () {
      winCalls += 1;
      return FULL;
    };
    global.wx.getSystemInfoSync = function () {
      sysCalls += 1;
      return FULL;
    };
    var host = makeRosterHost({ _activeTab: 'info' });
    host.computeRosterMinHeight();
    var host2 = makeRosterHost();
    delete host2.createSelectorQuery;
    host2.computeRosterMinHeight();
    assert(
      '非 register / 无 SelectorQuery 不触发系统读取',
      winCalls === 0 && sysCalls === 0
    );
  }
);

assert(
  '三处正常路径不再直接调用旧 API',
  rosterSrc.indexOf('wx.getSystemInfoSync') < 0 &&
    discSrc.indexOf('wx.getSystemInfoSync') < 0 &&
    fabSrc.indexOf('wx.getSystemInfoSync') < 0 &&
    rosterSrc.indexOf('readSeriesDetailWindowLayout') >= 0 &&
    discSrc.indexOf('readSeriesDetailWindowLayout') >= 0 &&
    fabSrc.indexOf('readSeriesDetailWindowLayout') >= 0
);

assert(
  'seriesRegister 契约所需符号仍在源码中',
  src.indexOf('computeRosterMinHeight') >= 0 &&
    src.indexOf('_rosterMeasureToken') >= 0 &&
    src.indexOf('rosterMinHeight') >= 0 &&
    src.indexOf('registerSelf') >= 0
);

console.log('\npassed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
