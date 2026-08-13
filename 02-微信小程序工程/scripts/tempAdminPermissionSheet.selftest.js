/**
 * P1：temp-admin-permission-sheet 抽取回归自测
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/tempAdminPermissionSheet.selftest.js
 */

var path = require('path');
var fs = require('fs');
var Module = require('module');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var compDir = path.join(mini, 'components', 'temp-admin-permission-sheet');
var detailDir = path.join(
  mini,
  'subpackages',
  'tournament',
  'pages',
  'detail'
);
var passed = 0;
var failed = 0;
var failures = [];

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    failures.push(name + (detail ? ' :: ' + detail : ''));
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

// ---------- 静态：组件与 detail 接入 ----------
var compJs = read(path.join(compDir, 'index.js'));
var compWxml = read(path.join(compDir, 'index.wxml'));
var compJson = read(path.join(compDir, 'index.json'));
var compWxss = read(path.join(compDir, 'index.wxss'));
var detailJs = read(path.join(detailDir, 'index.js'));
var detailWxml = read(path.join(detailDir, 'index.wxml'));
var detailJson = read(path.join(detailDir, 'index.json'));

assert('component files exist', !!(compJs && compWxml && compJson && compWxss));
assert('component title 权限管理', compWxml.indexOf('权限管理') >= 0);
assert(
  'component ordinary subtitle copy',
  compWxml.indexOf('通过二维码授权本场临时管理员与球童记分员，仅对当前 GAME 生效。') >= 0
);
assert('component has admin QR section', compWxml.indexOf('添加临时管理员') >= 0);
assert('component has caddie section', compWxml.indexOf('添加球童记分员') >= 0);
assert('component has pending list', compWxml.indexOf('已扫码临时管理员') >= 0);
assert('component has caddie list', compWxml.indexOf('已扫码球童记分员') >= 0);
assert('component has cancel/save', /取消/.test(compWxml) && /保存/.test(compWxml));
assert(
  'roundSubtitle empty not forced',
  compWxml.indexOf('wx:if="{{roundSubtitle}}"') >= 0
);
assert('freeze targetMatchId on open', compJs.indexOf('this._targetMatchId = matchId') >= 0);
assert('save uses frozen match', compJs.indexOf('_loadTargetMatch') >= 0);
assert('success toast 权限已保存', compJs.indexOf("title: '权限已保存'") >= 0);
assert('safeSetData guards unload', compJs.indexOf('_safeSetData') >= 0 && compJs.indexOf('if (!this._alive) return') >= 0);
assert('anti double-save', compJs.indexOf('this._saving') >= 0);
assert('writes via commitAdminQrDraft + saveMatch', /commitAdminQrDraft/.test(compJs) && /saveMatch/.test(compJs));
assert('reuses domain modules', /tempAdminAccess/.test(compJs) && /caddieScoringAccess/.test(compJs) && /matchManageAccess/.test(compJs));
assert('not friend picker form', !/好友选择|好友列表|friendPicker|selectFriends/.test(compWxml + compJs));

assert(
  'detail registers component',
  detailJson.indexOf('temp-admin-permission-sheet') >= 0
);
assert(
  'detail wxml uses shared component once',
  (detailWxml.match(/<temp-admin-permission-sheet/g) || []).length === 1
);
assert(
  'detail has no inline temp-admin sheet',
  detailWxml.indexOf('class="bottom-sheet register-sheet temp-admin-sheet"') < 0 &&
    detailWxml.indexOf('bindtap="cancelTempAdminSheet"') < 0 &&
    detailWxml.indexOf('bindtap="saveTempAdminSheet"') < 0
);
assert(
  'detail thin openTempAdminSheet',
  /openTempAdminSheet\s*\(\)\s*\{[\s\S]*?tempAdminSheetVisible:\s*true/.test(detailJs) &&
    detailJs.indexOf('adminQrAdminList:') < 0
);
assert('detail keeps canManageTempAdmins gate', detailJs.indexOf('canManageTempAdmins') >= 0);
assert(
  'detail keeps fromSeries openSheet=temp_admin',
  detailJs.indexOf("sheet === 'temp_admin'") >= 0
);
assert(
  'detail handles close/saved',
  detailJs.indexOf('onTempAdminPermissionSheetClose') >= 0 &&
    detailJs.indexOf('onTempAdminPermissionSheetSaved') >= 0
);
assert(
  'detail removed migrated handlers',
  detailJs.indexOf('saveTempAdminSheet') < 0 &&
    detailJs.indexOf('cancelTempAdminSheet') < 0 &&
    detailJs.indexOf('generateTempAdminQr') < 0 &&
    detailJs.indexOf('onRemoveCaddieScoringPermission') < 0
);

// P1 组件契约仍成立；Series 接入属 P2，此处仅确认组件未被改造成好友选择
assert(
  'shared sheet still not friend-picker form',
  !/好友选择|好友列表|friendPicker|selectFriends/.test(compWxml + compJs)
);

// ---------- 运行态：冻结 matchId / 取消不写 / 保存写字段 / 失败不 saved ----------
var memory = {};
var toasts = [];
var events = [];

global.wx = {
  showToast: function (opt) {
    toasts.push(opt || {});
  },
  showModal: function () {},
  showLoading: function () {},
  hideLoading: function () {},
  downloadFile: function () {},
  saveImageToPhotosAlbum: function () {},
  openSetting: function () {},
  getStorageSync: function (k) {
    return memory['s:' + k] || null;
  },
  setStorageSync: function (k, v) {
    memory['s:' + k] = v;
  },
  removeStorageSync: function (k) {
    delete memory['s:' + k];
  }
};

var componentDef = null;
global.Component = function (def) {
  componentDef = def;
};

// Ensure relative requires from component resolve
var compPath = path.join(compDir, 'index.js');
delete require.cache[compPath];
require(compPath);
assert('Component() captured', !!(componentDef && componentDef.methods));

var teamMatchStore = require(path.join(utilsDir, 'teamMatchStore.js'));
var matchManageAccess = require(path.join(utilsDir, 'matchManageAccess.js'));
var tempAdminAccess = require(path.join(utilsDir, 'tempAdminAccess.js'));
var caddieScoringAccess = require(path.join(utilsDir, 'caddieScoringAccess.js'));
var gameStore = require(path.join(utilsDir, 'gameStore.js'));

var storeBag = {};
var origGet = teamMatchStore.getMatchById;
var origSave = teamMatchStore.saveMatch;
var origUser = gameStore.getCurrentUser;

teamMatchStore.getMatchById = function (id) {
  return storeBag[String(id)] || null;
};
teamMatchStore.saveMatch = function (match) {
  if (!match || !match.matchId) return null;
  storeBag[String(match.matchId)] = match;
  return match;
};
gameStore.getCurrentUser = function () {
  return { userId: 'creator-1', name: 'Creator' };
};

function makeMatch(id) {
  return {
    matchId: id,
    matchType: 'inter-team',
    status: 'registering',
    createdBy: 'creator-1',
    organizationId: 'org-1',
    tempAdmins: [],
    tempAdminAccess: null,
    caddieScoringAccess: null
  };
}

function makeHost() {
  var host = {
    _alive: true,
    _targetMatchId: '',
    _grantableFeatures: null,
    _adminDraftDemotions: [],
    _saving: false,
    _openSeq: 0,
    properties: {
      visible: false,
      matchId: 'm-a',
      roundSubtitle: '',
      themeClass: ''
    },
    data: Object.assign({}, componentDef.data),
    setData: function (patch) {
      Object.assign(this.data, patch || {});
    },
    triggerEvent: function (name, detail) {
      events.push({ name: name, detail: detail || {} });
    }
  };
  Object.keys(componentDef.methods).forEach(function (k) {
    host[k] = componentDef.methods[k];
  });
  return host;
}

function snapshotAuthFields(match) {
  return JSON.stringify({
    tempAdmins: match.tempAdmins || null,
    tempAdminAccess: match.tempAdminAccess || null,
    caddieScoringAccess: match.caddieScoringAccess || null
  });
}

// 1) 打开弹窗冻结 matchId
storeBag = { 'm-a': makeMatch('m-a'), 'm-b': makeMatch('m-b') };
events = [];
toasts = [];
var host = makeHost();
host.properties.visible = true;
host.properties.matchId = 'm-a';
host._openSheet();
assert('open freezes m-a', host._targetMatchId === 'm-a');
assert('open loads sheetReady', !!host.data.sheetReady);
assert(
  'open gate uses canManageTempAdmins',
  matchManageAccess.canManageTempAdmins(storeBag['m-a'], { userId: 'creator-1' }) === true
);

// 联合管理员不可管理（非 creator / 非 org admin 且仅为联合）
var jointDenied = matchManageAccess.canManageTempAdmins(
  Object.assign({}, storeBag['m-a'], { createdBy: 'other', organizationId: 'org-x' }),
  { userId: 'joint-1' }
);
assert('non-privileged cannot manage', jointDenied === false);

// 2) 取消不写入
var beforeCancel = snapshotAuthFields(storeBag['m-a']);
host.data.adminQrAdminList = [
  {
    userId: 'u-pending',
    nickname: 'P',
    avatar: '',
    status: 'pending',
    statusLabel: '待授权',
    permissions: [],
    permissionOptions: [{ key: 'manage_scoring', label: '记分', selected: true }]
  }
];
events = [];
host.onCancel();
assert('cancel triggers close', events.some(function (e) { return e.name === 'close'; }));
assert('cancel does not trigger saved', !events.some(function (e) { return e.name === 'saved'; }));
assert('cancel does not write auth fields', snapshotAuthFields(storeBag['m-a']) === beforeCancel);

// 3) 保存写入三字段 + saved；打开后 matchId 属性漂移仍写冻结场
storeBag = { 'm-a': makeMatch('m-a'), 'm-b': makeMatch('m-b') };
host = makeHost();
host.properties.matchId = 'm-a';
host._openSheet();
var adminAccess = tempAdminAccess.createTempAdminAccess({
  source: 'team_match',
  matchId: 'm-a',
  createdBy: 'creator-1'
});
var caddieAccess = caddieScoringAccess.createCaddieScoringAccess({
  source: 'team_match',
  matchId: 'm-a',
  createdBy: 'creator-1'
});
storeBag['m-a'].tempAdminAccess = adminAccess;
storeBag['m-a'].caddieScoringAccess = caddieAccess;
host.data.adminQrHasQr = true;
host.data.adminQrUrl = adminAccess.qrCodeUrl;
host.data.adminQrAdminList = [
  {
    userId: 'u1',
    nickname: 'U1',
    avatar: '',
    status: 'pending',
    statusLabel: '待授权',
    permissions: [],
    permissionOptions: [{ key: 'manage_scoring', label: '记分', selected: true }]
  }
];
// 页面 matchId 漂移
host.properties.matchId = 'm-b';
events = [];
toasts = [];
host.onSave();
assert('save triggers saved', events.some(function (e) { return e.name === 'saved' && e.detail.matchId === 'm-a'; }));
assert(
  'success toast unchanged',
  toasts.some(function (t) { return t && t.title === '权限已保存'; })
);
assert('writes tempAdmins on frozen match', Array.isArray(storeBag['m-a'].tempAdmins) && storeBag['m-a'].tempAdmins.length > 0);
assert('keeps tempAdminAccess on frozen match', !!(storeBag['m-a'].tempAdminAccess && storeBag['m-a'].tempAdminAccess.token));
assert('keeps caddieScoringAccess on frozen match', !!(storeBag['m-a'].caddieScoringAccess && storeBag['m-a'].caddieScoringAccess.token));
assert('does not write drifted match m-b', !(storeBag['m-b'].tempAdmins && storeBag['m-b'].tempAdmins.length));

// 4) 写失败不触发 saved
storeBag = { 'm-a': makeMatch('m-a') };
host = makeHost();
host.properties.matchId = 'm-a';
host._openSheet();
host.data.adminQrAdminList = [];
events = [];
toasts = [];
var failOnce = true;
teamMatchStore.saveMatch = function () {
  if (failOnce) {
    failOnce = false;
    throw new Error('disk full');
  }
  return null;
};
host.onSave();
assert('save failure no saved event', !events.some(function (e) { return e.name === 'saved'; }));
assert('save failure toast', toasts.some(function (t) { return t && t.title === '保存失败'; }));

// restore saveMatch for double-click test
teamMatchStore.saveMatch = function (match) {
  if (!match || !match.matchId) return null;
  storeBag[String(match.matchId)] = match;
  return match;
};

// 5) 连点不重复保存
storeBag = { 'm-a': makeMatch('m-a') };
host = makeHost();
host.properties.matchId = 'm-a';
host._openSheet();
host.data.adminQrAdminList = [];
var saveCount = 0;
var realSave = teamMatchStore.saveMatch;
teamMatchStore.saveMatch = function (match) {
  saveCount += 1;
  return realSave(match);
};
events = [];
host.onSave();
host.onSave();
assert('double-click save once', saveCount === 1, 'count=' + saveCount);

// 6) 卸载后不 setData
storeBag = { 'm-a': makeMatch('m-a') };
host = makeHost();
host.properties.matchId = 'm-a';
host._openSheet();
host._alive = false;
var setCalls = 0;
host.setData = function () {
  setCalls += 1;
};
host._safeSetData({ adminQrExpanded: false });
assert('detached skips setData', setCalls === 0);

// 7) 权限不足无法打开
storeBag = {
  'm-a': Object.assign(makeMatch('m-a'), { createdBy: 'other', organizationId: 'org-x' })
};
host = makeHost();
host.properties.matchId = 'm-a';
gameStore.getCurrentUser = function () {
  return { userId: 'stranger', name: 'X' };
};
events = [];
toasts = [];
host._openSheet();
assert('denied open triggers close', events.some(function (e) { return e.name === 'close'; }));
assert('denied open toast', toasts.some(function (t) { return t && String(t.title).indexOf('权限') >= 0; }));
assert('denied open not ready', !host.data.sheetReady);

// restore
teamMatchStore.getMatchById = origGet;
teamMatchStore.saveMatch = origSave;
gameStore.getCurrentUser = origUser;

console.log('\n--- tempAdminPermissionSheet.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
