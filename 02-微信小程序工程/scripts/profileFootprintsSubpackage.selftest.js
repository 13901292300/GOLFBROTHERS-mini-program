/**
 * 「我的足迹」迁入 player 分包：实际页、首页入口与旧路由兼容壳。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/profileFootprintsSubpackage.selftest.js
 */

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var crypto = require('crypto');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var newPageDir = path.join(mini, 'subpackages', 'player', 'pages', 'me', 'footprints');
var oldPageDir = path.join(mini, 'pages', 'profile', 'footprints');
var appJsonPath = path.join(mini, 'app.json');
var homeJsPath = path.join(mini, 'pages', 'home', 'index.js');
var targetUrl = '/subpackages/player/pages/me/footprints/index';

var passed = 0;
var failed = 0;
var failures = [];

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log('PASS  ' + label);
    return;
  }
  failed += 1;
  failures.push(label);
  console.log('FAIL  ' + label);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}

var extensions = ['js', 'wxml', 'wxss', 'json'];
assert(
  '新页面四文件存在',
  extensions.every(function (ext) {
    return fs.existsSync(path.join(newPageDir, 'index.' + ext));
  })
);

var appJson = JSON.parse(read(appJsonPath));
var playerPackage = (appJson.subPackages || []).find(function (item) {
  return item && item.root === 'subpackages/player';
});
assert(
  'player app.json 注册新页面',
  !!playerPackage && playerPackage.pages.indexOf('pages/me/footprints/index') >= 0
);
assert(
  '旧主包路由仍注册',
  appJson.pages.indexOf('pages/profile/footprints/index') >= 0
);

var homeJs = read(homeJsPath);
assert(
  '首页只走新 footprints 路由',
  homeJs.indexOf("url: '" + targetUrl + "'") >= 0 &&
    homeJs.indexOf("url: '/pages/profile/footprints/index'") < 0
);

var shellJs = read(path.join(oldPageDir, 'index.js'));
assert(
  '旧页是 redirectTo 薄壳且不叠栈',
  shellJs.indexOf('wx.redirectTo') >= 0 && shellJs.indexOf('wx.navigateTo') < 0
);
assert(
  '旧壳不含地图、业务 require 或 store 逻辑',
  shellJs.indexOf('require(') < 0 &&
    shellJs.indexOf('buildFootprintMapSvgSrc') < 0 &&
    shellJs.indexOf('userProfileStore') < 0 &&
    shellJs.indexOf('setStorage') < 0
);
assert(
  '旧壳 WXML/WXSS 为空',
  read(path.join(oldPageDir, 'index.wxml')).length === 0 &&
    read(path.join(oldPageDir, 'index.wxss')).length === 0
);

var capturedPage = null;
var redirectCalls = [];
vm.runInNewContext(shellJs, {
  Page: function (definition) {
    capturedPage = definition;
  },
  wx: {
    redirectTo: function (options) {
      redirectCalls.push(options);
    }
  },
  encodeURIComponent: encodeURIComponent,
  String: String,
  Object: Object
});
capturedPage.onLoad({ scene: '好友 邀请&确认', source: '/a?b=1', empty: '' });
var forwardedUrl = redirectCalls[0] && redirectCalls[0].url;
assert(
  'query 完整安全编码转发',
  forwardedUrl ===
    targetUrl + '?scene=%E5%A5%BD%E5%8F%8B%20%E9%82%80%E8%AF%B7%26%E7%A1%AE%E8%AE%A4&source=%2Fa%3Fb%3D1&empty='
);
assert(
  '壳跳转失败只回首页且不循环重试',
  !!redirectCalls[0].fail &&
    (redirectCalls[0].fail(), redirectCalls.length === 2) &&
    redirectCalls[1].url === '/pages/home/index' &&
    !redirectCalls[1].fail
);

var newPageJsPath = path.join(newPageDir, 'index.js');
var newPageJs = read(newPageJsPath);
var requiredFiles = [];
newPageJs.replace(/require\(['"]([^'"]+)['"]\)/g, function (_, request) {
  requiredFiles.push(path.resolve(newPageDir, request));
  return _;
});
assert(
  '新页 headerEngine/userProfileStore require 可解析',
  requiredFiles.length === 2 && requiredFiles.every(fs.existsSync)
);
assert(
  '内联 SVG 地图构造仍在新页',
  newPageJs.indexOf('function buildFootprintMapSvgSrc') >= 0 &&
    newPageJs.indexOf('data:image/svg+xml') >= 0
);

var svgHashes = {
  'footprint-map-bright.svg': '2CD8F97FFB94424E67AB020CF776B843284BB7CE5D6E43F4C20B010C0FF25FD8',
  'footprint-map-dark.svg': '8C219D53E31C26C9DE6B5093196E7A95C1A1EBEA8CDFE2FCC237ADF0211E61D5',
  'world-map.svg': '9B4F5A602D6A95444D16E9F8A4A930B09D23C05D336956506992F86789F7BE6F'
};
assert(
  '三个静态 footprint SVG 原地存在且内容不变',
  Object.keys(svgHashes).every(function (name) {
    var file = path.join(mini, 'assets', 'footprints', name);
    return fs.existsSync(file) && sha256(file) === svgHashes[name];
  })
);

JSON.parse(read(path.join(newPageDir, 'index.json')));
JSON.parse(read(path.join(oldPageDir, 'index.json')));
assert('新旧页面 JSON 均可解析', true);
assert(
  '新页 navigateBack 返回，失败目标仍为首页',
  newPageJs.indexOf('wx.navigateBack') >= 0 &&
    newPageJs.indexOf("wx.redirectTo({ url: '/pages/home/index' })") >= 0
);

function expectedScrollLeft(yearCount, winW) {
  var canScroll = yearCount > 8;
  var start = canScroll ? yearCount - 8 : 0;
  if (!canScroll || start <= 0) return 0;
  return Math.round(start * ((80 * winW) / 750));
}

function loadChartModule(wxMock) {
  var pagePath = require.resolve(newPageJsPath);
  delete require.cache[pagePath];
  global.Page = function () {};
  global.getApp = function () {
    return { getTheme: function () { return 'bright'; } };
  };
  global.wx = Object.assign({
    getStorageSync: function () { return {}; },
    setStorageSync: function () {},
    getMenuButtonBoundingClientRect: function () {
      return { top: 48, height: 32, bottom: 80, left: 281 };
    }
  }, wxMock);
  return require(pagePath);
}

(function chartWindowWidthCompat() {
  var winCalls = 0;
  var sysCalls = 0;
  var mod = loadChartModule({
    getWindowInfo: function () {
      winCalls += 1;
      return { windowWidth: 390, windowHeight: 844 };
    },
    getSystemInfoSync: function () {
      sysCalls += 1;
      return { windowWidth: 375 };
    }
  });
  var modern = mod.buildYearStatsChart('all', false);
  assert(
    '现代路径使用 getWindowInfo 宽度且不调用旧 API',
    winCalls === 1 &&
      sysCalls === 0 &&
      modern.chartCanScroll === true &&
      modern.chartScrollLeft === expectedScrollLeft(modern.yearStats.length, 390)
  );

  winCalls = 0;
  sysCalls = 0;
  mod = loadChartModule({
    getSystemInfoSync: function () {
      sysCalls += 1;
      return { windowWidth: 414 };
    }
  });
  var legacy = mod.buildYearStatsChart('all', false);
  assert(
    '无 getWindowInfo 时使用 getSystemInfoSync',
    winCalls === 0 &&
      sysCalls === 1 &&
      legacy.chartScrollLeft === expectedScrollLeft(legacy.yearStats.length, 414)
  );

  sysCalls = 0;
  mod = loadChartModule({
    getWindowInfo: function () {
      throw new Error('window info fail');
    },
    getSystemInfoSync: function () {
      sysCalls += 1;
      return { windowWidth: 360 };
    }
  });
  var afterThrow = mod.buildYearStatsChart('all', false);
  assert(
    'getWindowInfo 抛错后回退旧 API',
    sysCalls === 1 &&
      afterThrow.chartScrollLeft === expectedScrollLeft(afterThrow.yearStats.length, 360)
  );

  var invalidModern = [{}, { windowWidth: 0 }, { windowWidth: -10 }, { windowWidth: '375' }];
  var invalidOk = invalidModern.every(function (info) {
    sysCalls = 0;
    mod = loadChartModule({
      getWindowInfo: function () { return info; },
      getSystemInfoSync: function () {
        sysCalls += 1;
        return { windowWidth: 400 };
      }
    });
    var chart = mod.buildYearStatsChart('all', false);
    return sysCalls === 1 &&
      chart.chartScrollLeft === expectedScrollLeft(chart.yearStats.length, 400);
  });
  assert('现代 API 无效宽度时回退旧 API', invalidOk);

  mod = loadChartModule({
    getWindowInfo: function () {
      throw new Error('modern fail');
    },
    getSystemInfoSync: function () {
      return { windowWidth: 0 };
    }
  });
  var invalidLegacy = mod.buildYearStatsChart('all', false);
  assert(
    '旧 API 无效宽度使用默认 375',
    invalidLegacy.chartScrollLeft === expectedScrollLeft(invalidLegacy.yearStats.length, 375)
  );

  mod = loadChartModule({
    getWindowInfo: function () {
      throw new Error('modern fail');
    },
    getSystemInfoSync: function () {
      throw new Error('legacy fail');
    }
  });
  var bothThrow = mod.buildYearStatsChart('all', false);
  assert('两个 API 都抛错时 chartScrollLeft 为 0', bothThrow.chartScrollLeft === 0);

  winCalls = 0;
  sysCalls = 0;
  mod = loadChartModule({
    getWindowInfo: function () {
      winCalls += 1;
      return { windowWidth: 390 };
    },
    getSystemInfoSync: function () {
      sysCalls += 1;
      return { windowWidth: 375 };
    }
  });
  var shortRange = mod.buildYearStatsChart('5y', false);
  assert(
    '不足 8 年不读窗口 API 且不可滚动',
    winCalls === 0 &&
      sysCalls === 0 &&
      shortRange.yearStats.length === 5 &&
      shortRange.chartCanScroll === false &&
      shortRange.chartScrollLeft === 0
  );

  mod = loadChartModule({
    getWindowInfo: function () {
      return { windowWidth: 375 };
    },
    getSystemInfoSync: function () {
      throw new Error('should not run');
    }
  });
  var classic = mod.buildYearStatsChart('all', false);
  var n = classic.yearStats.length;
  var start = n - 8;
  var expected = Math.round(start * ((80 * 375) / 750));
  assert(
    '超过 8 年时列宽公式与 Math.round 与修改前一致',
    n > 8 &&
      classic.chartCanScroll === true &&
      classic.chartColWidthRpx === 80 &&
      classic.chartTrackWidthRpx === n * 80 &&
      classic.chartScrollLeft === expected &&
      expected === 160
  );
})();

delete global.Page;
delete global.getApp;

console.log('\npassed=' + passed + ' failed=' + failed);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
