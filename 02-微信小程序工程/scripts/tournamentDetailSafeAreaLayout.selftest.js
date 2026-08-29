/**
 * 赛事详情报名/分组高度：safeArea 布局读取与三处公式契约。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/tournamentDetailSafeAreaLayout.selftest.js
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

var posSrc = extractBlock('function isPositiveFiniteNumber(value)');
var finSrc = extractBlock('function isFiniteNumber(value)');
var pickSrc = extractBlock('function pickTournamentDetailLayoutFields(info, current)');
var completeSrc = extractBlock('function isTournamentDetailLayoutComplete(cur)');
var layoutSrc = extractBlock('function readTournamentDetailSafeAreaLayout()');
var lockSrc = extractMethod('updateRegisterContentLockMetrics');
var rosterSrc = extractMethod('computeRosterMinHeight');
var groupsSrc = extractMethod('computeGroupsPanelMinHeight');
var resolveSrc = extractMethod('_resolveRegistrationContentLocked');
var clampSrc = extractMethod('_clampRegisterScrollAfterSticky');
var lockMaxSrc = extractMethod('_getRegisterScrollLockMax');

assert(
  '生产方法源码可提取',
  !!(posSrc && finSrc && pickSrc && completeSrc && layoutSrc && lockSrc && rosterSrc && groupsSrc && resolveSrc && clampSrc && lockMaxSrc)
);

function compileFn(text) {
  var fnSrc = text.replace(/^\s*(_?\w+)\(/, 'function $1(');
  return new Function('return (' + fnSrc + ')')();
}

global.isPositiveFiniteNumber = compileFn(posSrc);
global.isFiniteNumber = compileFn(finSrc);
global.pickTournamentDetailLayoutFields = compileFn(pickSrc);
global.isTournamentDetailLayoutComplete = compileFn(completeSrc);
global.readTournamentDetailSafeAreaLayout = compileFn(layoutSrc);
global.REGISTER_CONTENT_LOCK_EPS = 4;

function expectedSafeBottom(screenHeight, bottom) {
  return Math.max(0, screenHeight - bottom);
}

function expectedAvailable(winW, winH, headerH, mainTabH, extH, bottomReserve) {
  var rpx2px = winW / 750;
  var gap = 40 * rpx2px;
  var h = winH - headerH - mainTabH - extH - bottomReserve - gap;
  if (!(h > 0)) h = 0;
  return Math.round(h);
}

function expectedGroups(winW, winH, headerH, mainTabH, safeBottom) {
  var rpx2px = winW / 750;
  var gap = 40 * rpx2px;
  var h = winH - headerH - mainTabH - gap - safeBottom;
  if (!(h > 0)) h = 0;
  return Math.round(h);
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

function makeHost(tab, extraData) {
  var clampCalls = [];
  var setDataCalls = [];
  var host = {
    data: Object.assign(
      {
        activeTab: tab,
        headerTotalHeight: 92,
        tabBarHeight: 50,
        isStickyTab: false,
        availableRegisterViewportHeight: -1,
        registerContentHeight: -1,
        registrationContentLocked: false,
        rosterMinHeight: -1,
        groupsPanelMinHeight: -1,
        scrollYState: 0,
        tabOffsetTop: 80,
        registerExtOffsetTop: 0,
        stickyRegisterExtTop: 0,
        detailScrollTop: 0
      },
      extraData || {}
    ),
    setData: function (patch, cb) {
      setDataCalls.push({ patch: patch, hasCb: typeof cb === 'function' });
      Object.keys(patch).forEach(function (key) {
        host.data[key] = patch[key];
      });
      if (typeof cb === 'function') cb();
    }
  };
  host._resolveRegistrationContentLocked = compileFn(resolveSrc).bind(host);
  host._getRegisterScrollLockMax = compileFn(lockMaxSrc).bind(host);
  var realClamp = compileFn(clampSrc).bind(host);
  host._clampRegisterScrollAfterSticky = function (scrollTop, forcedLocked) {
    clampCalls.push({ scrollTop: scrollTop, forcedLocked: forcedLocked });
    return realClamp(scrollTop, forcedLocked);
  };
  host.updateRegisterContentLockMetrics = compileFn(lockSrc).bind(host);
  host.computeRosterMinHeight = compileFn(rosterSrc).bind(host);
  host.computeGroupsPanelMinHeight = compileFn(groupsSrc).bind(host);
  host._clampCalls = clampCalls;
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

var FULL_MODERN = {
  windowWidth: 390,
  windowHeight: 844,
  screenHeight: 844,
  safeArea: { top: 47, bottom: 810, left: 0, right: 390 }
};

withWx(
  {
    getWindowInfo: function () {
      return FULL_MODERN;
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
    var layout = global.readTournamentDetailSafeAreaLayout();
    assert(
      '现代 API 完整时旧 API 0 次',
      sysCalls === 0 &&
        layout.windowWidth === 390 &&
        layout.windowHeight === 844 &&
        layout.safeBottom === expectedSafeBottom(844, 810)
    );
    assert('safeBottom 公式为 max(0, screenHeight - safeArea.bottom)', layout.safeBottom === 34);
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
    var sysCalls = 0;
    global.wx.getSystemInfoSync = function () {
      sysCalls += 1;
      return {
        windowWidth: 320,
        windowHeight: 500,
        screenHeight: 812,
        safeArea: { bottom: 778 }
      };
    };
    var layout = global.readTournamentDetailSafeAreaLayout();
    assert(
      '缺少 safeArea/screenHeight 时旧 API 只补缺失且不覆盖窗口',
      sysCalls === 1 &&
        layout.windowWidth === 390 &&
        layout.windowHeight === 844 &&
        layout.screenHeight === 812 &&
        layout.safeBottom === 34
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      throw new Error('boom');
    },
    getSystemInfoSync: function () {
      return FULL_MODERN;
    }
  },
  function () {
    var layout = global.readTournamentDetailSafeAreaLayout();
    assert(
      '现代 API 抛错时完整回退旧 API',
      layout.windowWidth === 390 && layout.windowHeight === 844 && layout.safeBottom === 34
    );
  }
);

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
    var layout = global.readTournamentDetailSafeAreaLayout();
    assert(
      '两套 API 失败时 375x667 且 safeBottom 0',
      layout.windowWidth === 375 && layout.windowHeight === 667 && layout.safeBottom === 0
    );
  }
);

var invalidInfos = [
  { windowWidth: 0, windowHeight: 0, screenHeight: 0, safeArea: { bottom: 0 } },
  { windowWidth: -8, windowHeight: -20, screenHeight: -1, safeArea: { bottom: -4 } },
  { windowWidth: NaN, windowHeight: NaN, screenHeight: NaN, safeArea: { bottom: NaN } },
  { windowWidth: Infinity, windowHeight: Infinity, screenHeight: Infinity, safeArea: { bottom: Infinity } },
  { windowWidth: '375', windowHeight: '667', screenHeight: '812', safeArea: { bottom: '778' } }
];
var invalidLayoutOk = invalidInfos.every(function (info) {
  global.wx = {
    getWindowInfo: function () {
      return info;
    },
    getSystemInfoSync: function () {
      return info;
    }
  };
  var layout = global.readTournamentDetailSafeAreaLayout();
  return layout.windowWidth === 375 && layout.windowHeight === 667 && layout.safeBottom === 0;
});
assert('无效数值不进入布局公式，回落 375x667 / safeBottom 0', invalidLayoutOk);

function runLock(wxApi, rects, extraData, opts) {
  return withWx(wxApi, function () {
    var host = makeHost('register', extraData);
    mockQuery(host, rects);
    host.updateRegisterContentLockMetrics(opts);
    return host;
  });
}

var ctaRects = [
  { height: 92 },
  { height: 50 },
  { height: 60 },
  { height: 88 },
  { height: 200 }
];
var noCtaRects = [
  { height: 92 },
  { height: 50 },
  { height: 60 },
  { height: 0 },
  { height: 200 }
];

withWx(
  {
    getWindowInfo: function () {
      return FULL_MODERN;
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
    var host = makeHost('register', { isStickyTab: true });
    mockQuery(host, ctaRects);
    host.updateRegisterContentLockMetrics();
    var expectH = expectedAvailable(390, 844, 92, 50, 60, 88);
    assert(
      '有 CTA 时用 CTA 高度且不叠加 safeBottom',
      sysCalls === 0 &&
        host._availableRegisterViewportHeight === expectH &&
        host.data.availableRegisterViewportHeight === expectH
    );
    assert(
      'lock 选择器数量与顺序不变',
      host._selectors.join(',') ===
        '.gb-header,.tab-scroll-wrap--inflow,.register-ext-wrap--inflow,.register-cta-bar,.register-roster-card'
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return FULL_MODERN;
    }
  },
  function () {
    var host = makeHost('register');
    mockQuery(host, noCtaRects);
    host.updateRegisterContentLockMetrics();
    var expectH = expectedAvailable(390, 844, 92, 50, 60, 34);
    assert(
      '无 CTA 时使用 safeBottom',
      host._availableRegisterViewportHeight === expectH
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return FULL_MODERN;
    }
  },
  function () {
    var host = makeHost('register');
    mockQuery(host, [
      { height: 92 },
      { height: 50 },
      { height: 60 },
      { height: 88 },
      { height: 10.4 }
    ]);
    host.computeRosterMinHeight();
    var expectH = expectedAvailable(390, 844, 92, 50, 60, 88);
    assert(
      'roster 高度公式与 lock 一致且同时更新两字段',
      host.data.rosterMinHeight === expectH &&
        host.data.availableRegisterViewportHeight === expectH &&
        host._availableRegisterViewportHeight === expectH
    );
    assert(
      'roster 选择器数量与顺序不变',
      host._selectors.join(',') ===
        '.gb-header,.tab-scroll-wrap--inflow,.register-ext-wrap--inflow,.register-cta-bar'
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return FULL_MODERN;
    }
  },
  function () {
    var host = makeHost('groups');
    mockQuery(host, [{ height: 92 }, { height: 50 }]);
    host.computeGroupsPanelMinHeight();
    var expectH = expectedGroups(390, 844, 92, 50, 34);
    assert(
      'groups 高度公式保持 window-header-tab-gap-safeBottom',
      host.data.groupsPanelMinHeight === expectH
    );
    assert(
      'groups 选择器数量与顺序不变',
      host._selectors.join(',') === '.gb-header,.tab-scroll-wrap--inflow'
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 375, windowHeight: 667, screenHeight: 667, safeArea: { bottom: 667 } };
    }
  },
  function () {
    var host = makeHost('register');
    mockQuery(host, [
      { height: 400 },
      { height: 200 },
      { height: 200 },
      { height: 200 },
      { height: 10 }
    ]);
    host.updateRegisterContentLockMetrics();
    host.computeRosterMinHeight();
    var hostG = makeHost('groups');
    mockQuery(hostG, [{ height: 400 }, { height: 400 }]);
    hostG.computeGroupsPanelMinHeight();
    assert(
      '高度 <= 0 时三处均归零',
      host._availableRegisterViewportHeight === 0 &&
        host.data.rosterMinHeight === 0 &&
        hostG.data.groupsPanelMinHeight === 0
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return FULL_MODERN;
    }
  },
  function () {
    var host = makeHost('register');
    mockQuery(host, [
      { height: 91.6 },
      { height: 50.4 },
      { height: 60.2 },
      { height: 88.1 },
      { height: 123.6 }
    ]);
    host.updateRegisterContentLockMetrics();
    var expectH = expectedAvailable(390, 844, 91.6, 50.4, 60.2, 88.1);
    assert(
      'Math.round 时机与原逻辑一致',
      host._availableRegisterViewportHeight === expectH &&
        host._registerContentHeight === Math.round(123.6)
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return FULL_MODERN;
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
      return FULL_MODERN;
    };
    global.wx.getSystemInfoSync = function () {
      sysCalls += 1;
      return {};
    };
    var host = makeHost('details');
    mockQuery(host, []);
    host.updateRegisterContentLockMetrics();
    host.computeRosterMinHeight();
    host.computeGroupsPanelMinHeight();
    assert(
      '非对应 activeTab 立即返回且不调用系统 API',
      winCalls === 0 && sysCalls === 0 && host._selectors.length === 0
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return FULL_MODERN;
    }
  },
  function () {
    var host = makeHost('register', { isStickyTab: true });
    mockQuery(host, [
      { height: 92 },
      { height: 50 },
      { height: 60 },
      { height: 88 },
      { height: 120 }
    ]);
    host.updateRegisterContentLockMetrics();
    var avail = host._availableRegisterViewportHeight;
    assert(
      'locked true：内容未超出可视区',
      host.data.registrationContentLocked === true && 120 <= avail + 4
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return FULL_MODERN;
    }
  },
  function () {
    var host = makeHost('register', { isStickyTab: true });
    mockQuery(host, [
      { height: 92 },
      { height: 50 },
      { height: 60 },
      { height: 88 },
      { height: 900 }
    ]);
    host.updateRegisterContentLockMetrics();
    assert(
      'locked false：内容超出可视区',
      host.data.registrationContentLocked === false
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return FULL_MODERN;
    }
  },
  function () {
    var host = makeHost('register', {
      isStickyTab: true,
      availableRegisterViewportHeight: expectedAvailable(390, 844, 92, 50, 60, 88),
      registerContentHeight: 120,
      registrationContentLocked: true,
      scrollYState: 10
    });
    mockQuery(host, [
      { height: 92 },
      { height: 50 },
      { height: 60 },
      { height: 88 },
      { height: 120 }
    ]);
    host.updateRegisterContentLockMetrics();
    assert(
      '无 patch 时仍走 clamp',
      host._setDataCalls.length === 0 &&
        host._clampCalls.length === 1 &&
        host._clampCalls[0].forcedLocked === true
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return FULL_MODERN;
    }
  },
  function () {
    var host = makeHost('register', { isStickyTab: false });
    mockQuery(host, [
      { height: 92 },
      { height: 50 },
      { height: 60 },
      { height: 88 },
      { height: 120 }
    ]);
    host.updateRegisterContentLockMetrics({ forceSticky: true });
    assert(
      '有 patch 时 setData 回调仍 clamp',
      host.data.registrationContentLocked === true &&
        host._setDataCalls.length === 1 &&
        host._setDataCalls[0].hasCb === true &&
        host._clampCalls.length === 1
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      return FULL_MODERN;
    }
  },
  function () {
    var expectH = expectedGroups(390, 844, 92, 50, 34);
    var host = makeHost('groups', { groupsPanelMinHeight: expectH });
    mockQuery(host, [{ height: 92 }, { height: 50 }]);
    host.computeGroupsPanelMinHeight();
    assert('groups 高度未变化时不 setData', host._setDataCalls.length === 0);
    host.data.groupsPanelMinHeight = expectH - 1;
    mockQuery(host, [{ height: 92 }, { height: 50 }]);
    host.computeGroupsPanelMinHeight();
    assert(
      'groups 高度变化时才 setData',
      host._setDataCalls.length === 1 && host.data.groupsPanelMinHeight === expectH
    );
  }
);

assert(
  '三处不再无条件调用 getSystemInfoSync',
  lockSrc.indexOf('wx.getSystemInfoSync') < 0 &&
    rosterSrc.indexOf('wx.getSystemInfoSync') < 0 &&
    groupsSrc.indexOf('wx.getSystemInfoSync') < 0 &&
    lockSrc.indexOf('readTournamentDetailSafeAreaLayout()') >= 0 &&
    rosterSrc.indexOf('readTournamentDetailSafeAreaLayout()') >= 0 &&
    groupsSrc.indexOf('readTournamentDetailSafeAreaLayout()') >= 0
);

assert(
  '上一轮窗口读取函数契约未改（仍返回 null 而非默认宽高）',
  extractBlock('function readTournamentDetailWindowSize()').indexOf('windowWidth: isPositiveFiniteNumber(width) ? width : null') >= 0
);

console.log('\npassed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
