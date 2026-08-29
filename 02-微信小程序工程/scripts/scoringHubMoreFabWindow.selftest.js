/**
 * Scoring Hub 更多 FAB：窗口尺寸读取与初始化契约。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/scoringHubMoreFabWindow.selftest.js
 */

var fs = require('fs');
var path = require('path');

var hubJsPath = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'scoring',
  'pages',
  'hub',
  'index.js'
);
var src = fs.readFileSync(hubJsPath, 'utf8');
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

var helperSrc = extractBlock('function readHubFabWindowSize()');
var finiteSrc = extractBlock('function isPositiveFiniteNumber(value)');
var initSrc = extractMethod('_initMoreFab');
var setTopSrc = extractMethod('_setFabTop');
var hitSrc = extractMethod('_updateFabHitState');

assert(
  '生产方法源码可提取',
  !!(helperSrc && finiteSrc && initSrc && setTopSrc && hitSrc)
);

function compileFn(text) {
  var fnSrc = text.replace(/^\s*(_\w+)\(/, 'function $1(');
  return new Function('return (' + fnSrc + ')')();
}

global.FAB_SIZE_RPX = 60;
global.FAB_HIDE_MARGIN_RPX = 16;
global.FAB_EDGE_GAP_RPX = 10;
global.isPositiveFiniteNumber = compileFn(finiteSrc);
global.readHubFabWindowSize = compileFn(helperSrc);

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

function makeHost() {
  var order = [];
  var setDataCalls = [];
  var host = {
    data: {
      fabTopPx: 0,
      fabStyle: '',
      moreFabHitTarget: false
    },
    _fabHitZones: [],
    setData: function (patch) {
      setDataCalls.push(patch);
      Object.keys(patch).forEach(function (key) {
        host.data[key] = patch[key];
      });
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
  host._order = order;
  host._setDataCalls = setDataCalls;
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

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 375, windowHeight: 667 };
    },
    getSystemInfoSync: function () {
      throw new Error('legacy should not run');
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
    var exp = expectedMetrics(375, 667);
    assert(
      '现代 API 375x667 且旧 API 0 次',
      sysCalls === 0 && metricsMatch(host, 375, 667)
    );
    assert(
      '默认 375x667 的 FAB metrics 与修改前一致',
      host._rpx2px === 0.5 &&
        host._fabSizePx === 30 &&
        host._fabRightPx === 8 &&
        host._fabMinTopPx === 5 &&
        host._fabMaxTopPx === 632 &&
        host._receivedCenterTop === 318.5
    );
    assert(
      '_setFabTop 收到准确 centerTop',
      host._receivedCenterTop === exp.centerTop
    );
    assert(
      '_refreshFabHitZones 调用一次且在 _setFabTop 之后',
      host._refreshCount === 1 &&
        host._order.length === 2 &&
        host._order[0] === 'setFabTop' &&
        host._order[1] === 'refresh'
    );
    assert(
      '_setFabTop 样式字符串保持 px + toFixed(1)',
      host.data.fabStyle === 'top:318.5px;right:8.0px;' &&
        host.data.fabTopPx === 318.5
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 390, windowHeight: 844 };
    },
    getSystemInfoSync: function () {
      throw new Error('no');
    }
  },
  function () {
    var host = makeHost();
    host._initMoreFab();
    assert('其它有效宽高公式正确', metricsMatch(host, 390, 844));
  }
);

withWx(
  {
    getSystemInfoSync: function () {
      return { windowWidth: 414, windowHeight: 896 };
    }
  },
  function () {
    var sysCalls = 0;
    global.wx.getSystemInfoSync = function () {
      sysCalls += 1;
      return { windowWidth: 414, windowHeight: 896 };
    };
    var host = makeHost();
    host._initMoreFab();
    assert(
      '无 getWindowInfo 时使用旧 API',
      sysCalls === 1 && metricsMatch(host, 414, 896)
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
    var sysCalls = 0;
    global.wx.getSystemInfoSync = function () {
      sysCalls += 1;
      return { windowWidth: 360, windowHeight: 780 };
    };
    var host = makeHost();
    host._initMoreFab();
    assert(
      '现代 API 抛错后使用旧 API',
      sysCalls === 1 && metricsMatch(host, 360, 780)
    );
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
    var sysCalls = 0;
    global.wx.getSystemInfoSync = function () {
      sysCalls += 1;
      return { windowWidth: 320, windowHeight: 800 };
    };
    var host = makeHost();
    host._initMoreFab();
    assert(
      '现代宽度有效时保留宽度、旧 API 只补高度',
      sysCalls === 1 && metricsMatch(host, 390, 800)
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: '375', windowHeight: 812 };
    },
    getSystemInfoSync: function () {
      return { windowWidth: 414, windowHeight: 100 };
    }
  },
  function () {
    var sysCalls = 0;
    global.wx.getSystemInfoSync = function () {
      sysCalls += 1;
      return { windowWidth: 414, windowHeight: 100 };
    };
    var host = makeHost();
    host._initMoreFab();
    assert(
      '现代高度有效时保留高度、旧 API 只补宽度',
      sysCalls === 1 && metricsMatch(host, 414, 812)
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
assert('两边无效宽高最终使用 375x667', invalidOk);

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
      '两个 API 都抛错时用 375x667 且不中断',
      !threw && metricsMatch(host, 375, 667) && host._refreshCount === 1
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
    var exp = expectedMetrics(320, 80);
    assert(
      '小窗口 maxTop 不小于 minTop',
      host._fabMaxTopPx >= host._fabMinTopPx &&
        host._fabMaxTopPx === exp.fabMaxTopPx &&
        host.data.fabTopPx === Math.max(host._fabMinTopPx, Math.min(host._fabMaxTopPx, exp.centerTop))
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 375, windowHeight: 667 };
    }
  },
  function () {
    var host = makeHost();
    host._initMoreFab();
    host._setFabTop(-40);
    assert(
      '_setFabTop 仍按 min/max 夹取',
      host.data.fabTopPx === host._fabMinTopPx
    );
    host._setFabTop(9999);
    assert(
      '_setFabTop 上界夹取与样式格式不变',
      host.data.fabTopPx === host._fabMaxTopPx &&
        host.data.fabStyle ===
          'top:' + host._fabMaxTopPx.toFixed(1) + 'px;right:' + host._fabRightPx.toFixed(1) + 'px;'
    );
  }
);

assert(
  'FAB 常量与初始化调用顺序源码保持不变',
  src.indexOf('const FAB_HIDE_MARGIN_RPX = 16') >= 0 &&
    src.indexOf('const FAB_SIZE_RPX = 60') >= 0 &&
    src.indexOf('const FAB_EDGE_GAP_RPX = 10') >= 0 &&
    initSrc.indexOf('this._setFabTop(centerTop)') >= 0 &&
    initSrc.indexOf('this._refreshFabHitZones()') >= 0 &&
    initSrc.indexOf('_rpx2px = (sys.windowWidth || 375) / 750') >= 0
);

assert(
  '_initMoreFab 正常路径不再直接调用旧 API',
  /_initMoreFab\(\) \{[\s\S]*?_refreshFabHitZones\(\);/.exec(src) &&
    !/_initMoreFab\(\) \{[\s\S]*?wx\.getSystemInfoSync/.test(src)
);

console.log('\npassed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
