/**
 * Offline V1 Phase 4：network state + course/select UX contract.
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/networkStatus.offlineUx.selftest.js
 */

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');

var passed = 0;
var failed = 0;
function assert(label, ok) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
  } else {
    failed += 1;
    console.log('FAIL  ' + label);
  }
}

var networkStatus = require(path.join(mini, 'utils', 'networkStatus.js'));
networkStatus._resetListenersForTest();

assert(
  'CASE1 getNetworkType none → networkConnected=false',
  networkStatus.fromGetNetworkType({ networkType: 'none' }).networkConnected === false
);

assert(
  'CASE2 wifi → true',
  networkStatus.fromGetNetworkType({ networkType: 'wifi' }).networkConnected === true
);

assert(
  'CASE3 unknown → true',
  networkStatus.fromGetNetworkType({ networkType: 'unknown' }).networkConnected === true &&
    networkStatus.fromGetNetworkType({ networkType: '5g' }).networkConnected === true
);

var failGlobal = { networkConnected: true, networkType: 'unknown' };
assert(
  'CASE4 fail 保持默认非离线',
  networkStatus.readFromGlobal(failGlobal).networkConnected === true &&
    networkStatus.readFromGlobal(failGlobal).networkType === 'unknown'
);

var g = { networkConnected: true, networkType: 'wifi' };
var flushed = 0;
function simulateListener(res) {
  var state = networkStatus.fromStatusChange(res);
  networkStatus.applyToGlobalAndPublish(g, state);
  if (res && res.isConnected === true) flushed += 1;
}

var seen = [];
function pageFn(state) {
  seen.push(state);
}
networkStatus.subscribe(pageFn);
simulateListener({ isConnected: false, networkType: 'none' });
assert(
  'CASE5 断网 global=false 且不 flush',
  g.networkConnected === false && flushed === 0 && seen.length === 1 && seen[0].networkConnected === false
);

var pageData = {
  networkConnected: false,
  networkType: 'none',
  offlineModeConfirmed: false
};
function applyUi(state, data) {
  var connected = !!(state && state.networkConnected);
  data.networkConnected = connected;
  data.networkType = (state && state.networkType) || 'unknown';
  data.offlineModeConfirmed = connected ? false : !!data.offlineModeConfirmed;
}
applyUi({ networkConnected: false, networkType: 'none' }, pageData);
pageData.offlineModeConfirmed = true;
var selectJs = fs.readFileSync(
  path.join(mini, 'subpackages', 'create', 'pages', 'course', 'select', 'index.js'),
  'utf8'
);
var selectWxml = fs.readFileSync(
  path.join(mini, 'subpackages', 'create', 'pages', 'course', 'select', 'index.wxml'),
  'utf8'
);
var appJs = fs.readFileSync(path.join(mini, 'app.js'), 'utf8');
assert(
  'CASE6 确认离线是页面 session 且 CTA 复用 temporary',
  pageData.offlineModeConfirmed === true &&
    selectJs.indexOf("this.setData({ offlineModeConfirmed: true })") >= 0 &&
    selectJs.indexOf('wx.setStorageSync') < 0 &&
    selectJs.indexOf('globalData.offlineMode') < 0 &&
    selectWxml.indexOf('onCreateTemporaryCourse') >= 0 &&
    selectWxml.indexOf('进入离线模式') >= 0 &&
    selectWxml.indexOf('创建临时球场') >= 0
);

assert(
  'CASE7 未确认仍走 onSelectCourse / 本地球场库',
  selectJs.indexOf('onSelectCourse') >= 0 &&
    (selectJs.indexOf('listVisibleCourses()') >= 0 || selectJs.indexOf('COURSE_DB') >= 0) &&
    selectJs.indexOf('if (this.data.offlineModeConfirmed)') < 0 &&
    selectJs.indexOf('offlineCourses') < 0
);

assert(
  'CASE8 确认后仍无 offlineCourses 数据源',
  selectJs.indexOf('offlineCourses') < 0 &&
    selectJs.indexOf('cachedCourses') < 0 &&
    selectWxml.indexOf('已缓存球场') < 0 &&
    selectWxml.indexOf('本地球场') >= 0
);

assert(
  'CASE9 CTA 复用现有 temporary 页',
  /onCreateTemporaryCourse\(\)\s*\{[\s\S]*pages\/course\/temporary\/index/.test(selectJs)
);

flushed = 0;
simulateListener({ isConnected: true, networkType: 'wifi' });
applyUi({ networkConnected: true, networkType: 'wifi' }, pageData);
assert(
  'CASE10 恢复在线 flush 一次且清确认',
  g.networkConnected === true &&
    flushed === 1 &&
    pageData.offlineModeConfirmed === false &&
    pageData.networkConnected === true
);

var helperSrc = fs.readFileSync(path.join(mini, 'utils', 'networkStatus.js'), 'utf8');
assert(
  'CASE11 网络模块不改 temporary snapshot/holePars',
  helperSrc.indexOf('holePars') < 0 &&
    helperSrc.indexOf('temporaryCourse') < 0 &&
    helperSrc.indexOf("require('./utils/teamClub/scoreSync.js')") < 0 &&
    appJs.indexOf('holePars') < 0
);

assert(
  'CASE12 在线搜索无结果仍有 Phase3 Temporary CTA',
  selectWxml.indexOf('searchResults.length === 0') >= 0 &&
    selectWxml.indexOf('未找到匹配的球场，换个关键词试试') >= 0 &&
    selectWxml.indexOf('当前无网络') >= 0
);

assert(
  'App 冷启动探测 + 单 listener + 订阅不碰选场路由',
  appJs.indexOf('wx.getNetworkType') >= 0 &&
    appJs.indexOf('_probeInitialNetworkType') >= 0 &&
    appJs.indexOf('networkStatus.subscribe') < 0 &&
    (appJs.split('wx.onNetworkStatusChange(function').length - 1) === 1 &&
    appJs.indexOf('pages/course/select') < 0 &&
    selectJs.indexOf('networkStatus.subscribe') >= 0 &&
    selectJs.indexOf('onUnload') >= 0 &&
    selectJs.indexOf('networkStatus.unsubscribe') >= 0
);

networkStatus.unsubscribe(pageFn);
networkStatus._resetListenersForTest();

function loadAppDef() {
  var appPath = require.resolve(path.join(mini, 'app.js'));
  var prevApp = global.App;
  var prevWx = global.wx;
  var def;
  global.App = function (d) {
    def = d;
  };
  global.wx = global.wx || {};
  delete require.cache[appPath];
  require(appPath);
  global.App = prevApp;
  global.wx = prevWx;
  return def;
}

function makeWxHold() {
  var api = {
    getOpts: null,
    onChange: null,
    getNetworkType: function (opts) {
      api.getOpts = opts;
    },
    onNetworkStatusChange: function (fn) {
      api.onChange = fn;
    }
  };
  return api;
}

function makeAppInst(def, wxApi) {
  global.wx = wxApi;
  var inst = Object.create(def);
  inst.globalData = {
    networkConnected: true,
    networkType: 'unknown'
  };
  inst._networkEpoch = 0;
  inst._scoreSyncNetworkBound = false;
  inst.flushCount = 0;
  inst._tryFlushScoreSync = function () {
    inst.flushCount += 1;
  };
  return inst;
}

var appDef = loadAppDef();
var prevWxHarness = global.wx;

var wx14 = makeWxHold();
var app14 = makeAppInst(appDef, wx14);
app14._bindScoreSyncNetworkListener();
app14._probeInitialNetworkType();
wx14.onChange({ isConnected: true, networkType: 'wifi' });
wx14.getOpts.success({ networkType: 'none' });
assert(
  'CASE14 旧 probe none 不覆盖已收到的 wifi live event',
  !!(wx14.getOpts && wx14.onChange) &&
    app14._networkEpoch === 1 &&
    app14.globalData.networkConnected === true &&
    app14.globalData.networkType === 'wifi'
);

var wx15 = makeWxHold();
var app15 = makeAppInst(appDef, wx15);
app15._bindScoreSyncNetworkListener();
app15._probeInitialNetworkType();
wx15.onChange({ isConnected: false, networkType: 'none' });
wx15.getOpts.success({ networkType: 'wifi' });
assert(
  'CASE15 旧 probe wifi 不覆盖已收到的 none live event',
  app15._networkEpoch === 1 &&
    app15.globalData.networkConnected === false &&
    app15.globalData.networkType === 'none'
);

var wx16 = makeWxHold();
var app16 = makeAppInst(appDef, wx16);
app16._bindScoreSyncNetworkListener();
app16._probeInitialNetworkType();
wx16.getOpts.success({ networkType: 'none' });
assert(
  'CASE16 无 live event 时 probe none 生效',
  app16._networkEpoch === 0 &&
    app16.globalData.networkConnected === false &&
    app16.globalData.networkType === 'none' &&
    app16.flushCount === 0
);

var wx17 = makeWxHold();
var app17 = makeAppInst(appDef, wx17);
app17._bindScoreSyncNetworkListener();
app17._probeInitialNetworkType();
wx17.getOpts.success({ networkType: 'wifi' });
assert(
  'CASE17 无 live event 时 probe wifi 生效',
  app17._networkEpoch === 0 &&
    app17.globalData.networkConnected === true &&
    app17.globalData.networkType === 'wifi' &&
    app17.flushCount === 0
);

networkStatus._resetListenersForTest();
var throwCount = 0;
var bSeen = 0;
networkStatus.subscribe(function () {
  throwCount += 1;
  throw new Error('subscriber A');
});
networkStatus.subscribe(function (state) {
  if (state && state.networkConnected === true) bSeen += 1;
});
var wx18 = makeWxHold();
var app18 = makeAppInst(appDef, wx18);
app18._bindScoreSyncNetworkListener();
app18._probeInitialNetworkType();
wx18.onChange({ isConnected: true, networkType: 'wifi' });
assert(
  'CASE18 subscriber throw 隔离且 flush 仍执行',
  throwCount === 1 &&
    bSeen === 1 &&
    app18.flushCount === 1 &&
    app18.globalData.networkConnected === true &&
    app18.globalData.networkType === 'wifi'
);

networkStatus._resetListenersForTest();
global.wx = prevWxHarness;

console.log('\n---- networkStatus.offlineUx.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
