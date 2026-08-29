/**
 * headerEngine：优先 getWindowInfo，胶囊安全读取，布局契约不变。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/headerEngine.selftest.js
 */

var path = require('path');
var enginePath = path.join(__dirname, '..', 'miniprogram', 'utils', 'headerEngine.js');
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

function loadEngine(wxMock) {
  delete require.cache[require.resolve(enginePath)];
  global.wx = wxMock;
  return require(enginePath);
}

var SAMPLE_MENU = { top: 48, height: 32, bottom: 80, left: 281, right: 367, width: 86 };
var SAMPLE_WINDOW = { statusBarHeight: 44, windowWidth: 375, screenWidth: 375 };

var METRIC_KEYS = [
  'statusBarHeight',
  'capsuleHeight',
  'capsuleTop',
  'capsuleLeft',
  'headerPaddingTop',
  'headerPaddingRight',
  'headerContentHeight',
  'headerTotalHeight'
];

function expectedFrom(win, menu) {
  var statusBarHeight = win.statusBarHeight || 24;
  var windowWidth = win.windowWidth || win.screenWidth;
  var headerPaddingTop = menu.top;
  var headerContentHeight = Math.max(menu.height, 32);
  var headerTotalHeight = Math.max(
    menu.bottom + 16,
    headerPaddingTop + headerContentHeight + 16
  );
  var headerPaddingRight = Math.max(windowWidth - menu.left + 8, 96);
  return {
    statusBarHeight: statusBarHeight,
    capsuleHeight: menu.height,
    capsuleTop: menu.top,
    capsuleLeft: menu.left,
    headerPaddingTop: headerPaddingTop,
    headerPaddingRight: headerPaddingRight,
    headerContentHeight: headerContentHeight,
    headerTotalHeight: headerTotalHeight
  };
}

function fallbackExpected() {
  var statusBarHeight = 24;
  var contentHeight = 32;
  var paddingTop = statusBarHeight + 8;
  var totalHeight = paddingTop + contentHeight + 16;
  return {
    statusBarHeight: statusBarHeight,
    capsuleHeight: contentHeight,
    capsuleTop: paddingTop,
    capsuleLeft: 0,
    headerPaddingTop: paddingTop,
    headerPaddingRight: 96,
    headerContentHeight: contentHeight,
    headerTotalHeight: totalHeight
  };
}

function sameMetrics(actual, expected) {
  return METRIC_KEYS.every(function (key) {
    return actual.metrics[key] === expected[key];
  });
}

function hasContractShape(result) {
  return result &&
    typeof result.headerRootStyle === 'string' &&
    result.headerRootStyle.indexOf('px') >= 0 &&
    result.headerRootStyle.indexOf('rpx') < 0 &&
    typeof result.headerBarStyle === 'string' &&
    result.headerBarStyle.indexOf('padding-left:16px') >= 0 &&
    result.metrics &&
    METRIC_KEYS.every(function (key) { return Object.prototype.hasOwnProperty.call(result.metrics, key); });
}

(function modernPath() {
  var sysCalls = 0;
  var winCalls = 0;
  var menuCalls = 0;
  var engine = loadEngine({
    getWindowInfo: function () {
      winCalls += 1;
      return SAMPLE_WINDOW;
    },
    getSystemInfoSync: function () {
      sysCalls += 1;
      return SAMPLE_WINDOW;
    },
    getMenuButtonBoundingClientRect: function () {
      menuCalls += 1;
      return SAMPLE_MENU;
    }
  });
  var result = engine.createHeaderStyle();
  var expected = expectedFrom(SAMPLE_WINDOW, SAMPLE_MENU);
  assert('现代环境不调用 getSystemInfoSync', sysCalls === 0 && winCalls === 1 && menuCalls === 1);
  assert('现代环境输出字段完整且为 px', hasContractShape(result));
  assert('现代环境计算结果与原公式一致', sameMetrics(result, expected));
  assert(
    '现代环境高度与胶囊对齐',
    result.metrics.headerPaddingTop === 48 &&
      result.metrics.headerTotalHeight === 96 &&
      result.metrics.headerPaddingRight === 102 &&
      result.metrics.statusBarHeight === 44
  );
})();

(function legacyPath() {
  var sysCalls = 0;
  var engine = loadEngine({
    getSystemInfoSync: function () {
      sysCalls += 1;
      return SAMPLE_WINDOW;
    },
    getMenuButtonBoundingClientRect: function () {
      return SAMPLE_MENU;
    }
  });
  var result = engine.createHeaderStyle();
  assert('旧环境回退 getSystemInfoSync', sysCalls === 1);
  assert('旧环境结果与原公式一致', sameMetrics(result, expectedFrom(SAMPLE_WINDOW, SAMPLE_MENU)));
})();

(function windowInfoThrows() {
  var sysCalls = 0;
  var engine = loadEngine({
    getWindowInfo: function () {
      throw new Error('boom');
    },
    getSystemInfoSync: function () {
      sysCalls += 1;
      return SAMPLE_WINDOW;
    },
    getMenuButtonBoundingClientRect: function () {
      return SAMPLE_MENU;
    }
  });
  var result = engine.createHeaderStyle();
  assert('getWindowInfo 抛错后回退', sysCalls === 1);
  assert('抛错回退结果与原公式一致', sameMetrics(result, expectedFrom(SAMPLE_WINDOW, SAMPLE_MENU)));
})();

(function windowInfoMissingWidth() {
  var sysCalls = 0;
  var engine = loadEngine({
    getWindowInfo: function () {
      return { statusBarHeight: 44 };
    },
    getSystemInfoSync: function () {
      sysCalls += 1;
      return SAMPLE_WINDOW;
    },
    getMenuButtonBoundingClientRect: function () {
      return SAMPLE_MENU;
    }
  });
  var result = engine.createHeaderStyle();
  assert('getWindowInfo 缺 windowWidth 时回退', sysCalls === 1);
  assert('缺字段回退结果与原公式一致', sameMetrics(result, expectedFrom(SAMPLE_WINDOW, SAMPLE_MENU)));
})();

(function screenWidthOnly() {
  var engine = loadEngine({
    getWindowInfo: function () {
      return { statusBarHeight: 20, screenWidth: 390 };
    },
    getSystemInfoSync: function () {
      throw new Error('should not run');
    },
    getMenuButtonBoundingClientRect: function () {
      return SAMPLE_MENU;
    }
  });
  var result = engine.createHeaderStyle();
  assert(
    '仅有 screenWidth 视为可用窗口宽度',
    result.metrics.headerPaddingRight === Math.max(390 - 281 + 8, 96) &&
      result.metrics.statusBarHeight === 20
  );
})();

(function menuMissing() {
  var engine = loadEngine({
    getWindowInfo: function () {
      return SAMPLE_WINDOW;
    },
    getSystemInfoSync: function () {
      return SAMPLE_WINDOW;
    }
  });
  var result = engine.createHeaderStyle();
  assert('胶囊 API 不存在时返回兜底布局', sameMetrics(result, fallbackExpected()) && hasContractShape(result));
})();

(function menuThrows() {
  var engine = loadEngine({
    getWindowInfo: function () {
      return SAMPLE_WINDOW;
    },
    getMenuButtonBoundingClientRect: function () {
      throw new Error('menu fail');
    }
  });
  var result = engine.createHeaderStyle();
  assert('胶囊 API 抛错时返回兜底布局', sameMetrics(result, fallbackExpected()));
})();

(function menuIncomplete() {
  var engine = loadEngine({
    getWindowInfo: function () {
      return SAMPLE_WINDOW;
    },
    getMenuButtonBoundingClientRect: function () {
      return { top: 0, height: 32, bottom: 32, left: 281 };
    }
  });
  var result = engine.createHeaderStyle();
  assert('胶囊关键字段无效时返回兜底布局', sameMetrics(result, fallbackExpected()));
})();

(function modernEqualsLegacy() {
  var modern = loadEngine({
    getWindowInfo: function () { return SAMPLE_WINDOW; },
    getSystemInfoSync: function () { throw new Error('no'); },
    getMenuButtonBoundingClientRect: function () { return SAMPLE_MENU; }
  }).createHeaderStyle();
  var legacy = loadEngine({
    getSystemInfoSync: function () { return SAMPLE_WINDOW; },
    getMenuButtonBoundingClientRect: function () { return SAMPLE_MENU; }
  }).createHeaderStyle();
  assert(
    '同一输入下现代/旧路径结果一致',
    JSON.stringify(modern.metrics) === JSON.stringify(legacy.metrics) &&
      modern.headerRootStyle === legacy.headerRootStyle &&
      modern.headerBarStyle === legacy.headerBarStyle
  );
})();

delete require.cache[require.resolve(enginePath)];
delete global.wx;

console.log('\npassed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
