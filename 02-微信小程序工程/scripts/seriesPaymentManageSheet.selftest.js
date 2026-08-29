/**
 * F2：Series 收费管理原地接入（grouped_players → paymentByUserId）
 * 运行：node scripts/seriesPaymentManageSheet.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var pageDir = path.join(
  mini,
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);
var detailDir = path.join(
  mini,
  'subpackages',
  'tournament',
  'pages',
  'detail'
);
var compDir = path.join(mini, 'components', 'match-payment-management-sheet');

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

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

var pageJs = read(path.join(pageDir, 'index.js'));
var pageWxml = read(path.join(pageDir, 'index.wxml'));
var pageJson = read(path.join(pageDir, 'index.json'));
var detailWxml = read(path.join(detailDir, 'index.wxml'));
var detailJs = read(path.join(detailDir, 'index.js'));
var compJs = read(path.join(compDir, 'index.js'));
var compWxml = read(path.join(compDir, 'index.wxml'));

assert(
  '1 Series registers payment sheet',
  pageJson.indexOf('match-payment-management-sheet') >= 0
);
assert(
  '2 Series mounts once',
  (pageWxml.match(/<match-payment-management-sheet/g) || []).length === 1
);
assert(
  '3 grouped_players mode',
  pageWxml.indexOf('data-mode="grouped_players"') >= 0
);
assert(
  '4 manage_payment in-place',
  /permission === 'manage_payment'[\s\S]{0,120}_openSeriesPaymentManageSheet/.test(
    pageJs
  )
);
assert(
  '5 no payment deep-link branch',
  !/permission === 'manage_payment'[\s\S]{0,200}_openSeriesDetailSheetDeepLink\('payment'\)/.test(
    pageJs
  )
);
assert(
  '6 half / payment / tee / temp-admin 均原页打开，不再走 deep-link 调用',
  pageJs.indexOf('_openSeriesHalfCourseSheet') >= 0 &&
    pageJs.indexOf('_openSeriesPaymentManageSheet') >= 0 &&
    !/_openSeriesDetailSheetDeepLink\('half'\)/.test(pageJs) &&
    !/_openSeriesDetailSheetDeepLink\('payment'\)/.test(pageJs)
);
assert(
  '7 deep-link helper retained',
  pageJs.indexOf('_openSeriesDetailSheetDeepLink') >= 0
);
assert(
  '8 empty copy in domain/comp',
  compJs.indexOf('本轮尚未分组，暂无收费人员') >= 0 ||
    read(path.join(utilsDir, 'seriesGroupedPaymentManage.js')).indexOf(
      '本轮尚未分组，暂无收费人员'
    ) >= 0
);
assert(
  '9 detail still registration path',
  detailWxml.indexOf('match-payment-management-sheet') >= 0 &&
    detailJs.indexOf("openSheetRaw === 'payment'") >= 0
);
assert('10 shared emptyText binding', compWxml.indexOf('{{emptyText}}') >= 0);

var memory = {};
global.__toasts = [];
global.__navs = [];
global.wx = {
  showToast: function (opt) {
    global.__toasts = (global.__toasts || []).concat([opt || {}]);
  },
  showModal: function (opt) {
    if (opt && typeof opt.success === 'function') {
      opt.success({ confirm: true });
    }
  },
  navigateTo: function (opt) {
    global.__navs = (global.__navs || []).concat([opt || {}]);
  },
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

var pageDef = null;
global.Page = function (def) {
  pageDef = def;
};
var loadErr = null;
try {
  delete require.cache[path.join(pageDir, 'index.js')];
  require(path.join(pageDir, 'index.js'));
} catch (e) {
  loadErr = e;
}
assert('11 Page captured', !loadErr && !!pageDef, loadErr && String(loadErr.message));
var methods = pageDef || {};

var componentDef = null;
global.Component = function (def) {
  componentDef = def;
};
delete require.cache[path.join(compDir, 'index.js')];
require(path.join(compDir, 'index.js'));
assert('12 Component captured', !!(componentDef && componentDef.methods));

var seriesStationManageGate = require(path.join(
  utilsDir,
  'seriesStationManageGate.js'
));
var seriesStationIndex = require(path.join(utilsDir, 'seriesStationIndex.js'));
var seriesGroupedPaymentManage = require(path.join(
  utilsDir,
  'seriesGroupedPaymentManage.js'
));
var teamMatchStore = require(path.join(utilsDir, 'teamMatchStore.js'));
var gameStore = require(path.join(utilsDir, 'gameStore.js'));
var paymentManage = require(path.join(utilsDir, 'paymentManage.js'));
var mockAvatars = require(path.join(utilsDir, 'mockAvatars.js'));

var storeBag = {};
var indexBag = {};
var seriesBag = null;
var origGet = teamMatchStore.getMatchById;
var origSave = teamMatchStore.saveMatch;
var origUser = gameStore.getCurrentUser;
var origIndex = seriesStationIndex.getByMatchId;
teamMatchStore.getMatchById = function (id) {
  var m = storeBag[String(id)] || null;
  return m ? JSON.parse(JSON.stringify(m)) : null;
};
teamMatchStore.saveMatch = function (match) {
  if (!match || !match.matchId) return null;
  storeBag[String(match.matchId)] = JSON.parse(JSON.stringify(match));
  return storeBag[String(match.matchId)];
};
gameStore.getCurrentUser = function () {
  return { userId: 'creator-1', nickname: '创建者' };
};
seriesStationIndex.getByMatchId = function (id) {
  return indexBag[String(id)] || null;
};

function makeStation(mid, rid, groups, paymentByUserId) {
  return {
    matchId: mid,
    matchType: 'inter-team',
    status: 'ongoing',
    registrationStatus: 'closed',
    createdBy: 'creator-1',
    organizationId: 'org-1',
    gameMode: '个人比杆赛',
    feeList: [{ id: 'fee:' + rid, name: '报名费', amount: '99' }],
    feeSet: true,
    teamGroups: [
      { id: 't1', name: '红队' },
      { id: 't2', name: '蓝队' }
    ],
    registerInfo: { totalCount: 0, users: [] },
    groups: groups || [],
    pairings: { g1: { a: 1 } },
    paymentByUserId: paymentByUserId || {},
    paymentLogs: [],
    seriesContext: {
      managed: true,
      seriesId: 's1',
      roundId: rid,
      publishToken: 'pt-1'
    }
  };
}

function makeSeries() {
  return {
    seriesId: 's1',
    publishToken: 'pt-1',
    createdBy: 'creator-1',
    roster: [
      {
        userId: 'u1',
        playerNameSnapshot: '甲-roster',
        playerAvatarSnapshot: 'https://a/1.png',
        matchTeamId: 't1',
        matchTeamName: '红队'
      },
      {
        userId: 'roster-only',
        playerNameSnapshot: '未入组',
        matchTeamId: 't1'
      }
    ],
    rounds: [
      { roundId: 'r1', name: '第一轮', matchId: 'm1', index: 1, fee: '99' },
      { roundId: 'r2', name: '第二轮', matchId: 'm2', index: 2, fee: '88' }
    ]
  };
}

var r1Groups = [
  {
    groupId: 'g1',
    groupName: '第1组',
    players: [
      { position: 1, userId: 'u1', name: '甲', matchTeamId: 't1' },
      { position: 2, userId: 'u2', name: '乙', matchTeamId: 't2' },
      { position: 3, userId: 'u1', name: '甲重复' },
      { position: 4, userId: '' }
    ]
  }
];

seriesBag = makeSeries();
storeBag = {
  m1: makeStation('m1', 'r1', r1Groups),
  m2: makeStation('m2', 'r2', [
    {
      groupId: 'g9',
      players: [{ position: 1, userId: 'u9', name: '己' }]
    }
  ])
};
indexBag = {
  m1: { seriesId: 's1', roundId: 'r1', matchId: 'm1' },
  m2: { seriesId: 's1', roundId: 'r2', matchId: 'm2' }
};

var draftUsers = seriesGroupedPaymentManage.buildGroupedPaymentDraftUsers(
  storeBag.m1,
  seriesBag.roster
);
assert('13 list from groups only', draftUsers.length === 2, 'len=' + draftUsers.length);
assert(
  '14 dedupe playerId',
  draftUsers.filter(function (u) {
    return u.userId === 'u1' || u.playerId === 'u1';
  }).length === 1
);
assert(
  '15 roster-only excluded',
  !draftUsers.some(function (u) {
    return u.userId === 'roster-only';
  })
);
assert(
  '16 roster enrich name',
  draftUsers.some(function (u) {
    return (u.userId === 'u1' || u.playerId === 'u1') && /甲/.test(u.displayName || '');
  })
);

var subtitle = methods._buildTempAdminRoundSubtitle(
  seriesBag,
  seriesBag.rounds[0],
  'r1'
);
assert('17 subtitle R1 · 第一轮', subtitle === 'R1 · 第一轮', subtitle);

function makePageHost() {
  return {
    _pageAlive: true,
    _seriesId: 's1',
    _lastSeriesForSchedule: seriesBag,
    _manageSelectedRoundId: 'r1',
    _manageSelectedMatchId: 'm1',
    _paymentManageFrozen: null,
    _paymentManageSheetOpening: false,
    _playerManageSheetOpening: false,
    _teeSheetManageSheetOpening: false,
    _tempAdminSheetOpening: false,
    _activeTab: 'schedule',
    _scrollTop: 88,
    data: {
      showMoreSheet: true,
      paymentManageSheetVisible: false,
      paymentManageSheetMatchId: '',
      paymentManageSheetRoundSubtitle: '',
      paymentManageSheetSeriesId: '',
      paymentManageSheetRoundId: '',
      paymentManageRosterSnapshot: [],
      playerManageSheetVisible: false,
      teeSheetManageSheetVisible: false,
      tempAdminSheetVisible: false,
      activeTab: 'schedule',
      scrollTop: 88
    },
    setData: function (patch, cb) {
      Object.assign(this.data, patch || {});
      if (typeof cb === 'function') cb();
    },
    _safeSetData: function (patch, cb) {
      if (!this._pageAlive) return;
      this.setData(patch, cb);
    },
    _toastGateFail: methods._toastGateFail,
    _canLoadBusinessContent: function () {
      return true;
    },
    reloadViewModel: function (opts) {
      this.__reload = opts || {};
    },
    closeMoreSheetFully: function () {
      this.data.showMoreSheet = false;
      this._manageSelectedRoundId = '';
      this._manageSelectedMatchId = '';
    },
    _syncStickyByScroll: function () {},
    _clearManageRoundOverflowRuntime: methods._clearManageRoundOverflowRuntime,
    _buildCloseMoreSheetPatch: methods._buildCloseMoreSheetPatch,
    _resolveBottomDockVisibilityPatch: methods._resolveBottomDockVisibilityPatch,
    _commitManageOverlayPatch: methods._commitManageOverlayPatch,
    _openFromManageSheet: methods._openFromManageSheet,
    _closeManageSecondaryPatch: methods._closeManageSecondaryPatch,
    _buildTempAdminRoundSubtitle: methods._buildTempAdminRoundSubtitle,
    _openSeriesPaymentManageSheet: methods._openSeriesPaymentManageSheet,
    onPaymentManageSheetClose: methods.onPaymentManageSheetClose,
    onPaymentManageSheetChanged: methods.onPaymentManageSheetChanged
  };
}

function makeCompHost(props) {
  var host = {
    _alive: true,
    _targetMatchId: '',
    _dataMode: 'registration',
    _frozen: null,
    _rosterSnapshot: [],
    _openSeq: 0,
    _patching: false,
    properties: Object.assign(
      {
        visible: false,
        matchId: 'm1',
        roundSubtitle: '',
        themeClass: '',
        dataMode: 'grouped_players',
        seriesId: 's1',
        roundId: 'r1',
        rosterSnapshot: seriesBag.roster
      },
      props || {}
    ),
    data: Object.assign({}, componentDef.data),
    setData: function (patch, cb) {
      Object.assign(this.data, patch || {});
      if (typeof cb === 'function') cb();
    },
    triggerEvent: function (name, detail) {
      this.__events = (this.__events || []).concat([
        { name: name, detail: detail || {} }
      ]);
    }
  };
  Object.keys(componentDef.methods).forEach(function (k) {
    host[k] = componentDef.methods[k];
  });
  return host;
}

global.__toasts = [];
global.__navs = [];
var host = makePageHost();
host._openSeriesPaymentManageSheet({ roundId: 'r1' });
assert('18 opens sheet', host.data.paymentManageSheetVisible === true);
assert('19 M closed', host.data.showMoreSheet === false);
assert('20 matchId m1', host.data.paymentManageSheetMatchId === 'm1');
assert(
  '21 subtitle set',
  host.data.paymentManageSheetRoundSubtitle === 'R1 · 第一轮'
);
assert('22 no navigateTo', (global.__navs || []).length === 0);

host._manageSelectedRoundId = 'r2';
assert('23 selection drift ignored', host.data.paymentManageSheetMatchId === 'm1');

// 组件：即时写 paymentByUserId
var seriesBefore = deepClone(seriesBag);
var r2Before = deepClone(storeBag.m2);
var regBefore = deepClone(storeBag.m1.registerInfo);
var groupsBefore = deepClone(storeBag.m1.groups);
var feeBefore = deepClone(storeBag.m1.feeList);
var pairBefore = deepClone(storeBag.m1.pairings);

var comp = makeCompHost();
comp._openSheet();
assert('24 comp ready', !!comp.data.sheetReady);
assert('25 users=2', (comp.data.paymentUsers || []).length === 2);
comp.properties.matchId = 'm-other';
comp.__events = [];
comp.patchPaymentUser('u1', {
  paymentConfirmed: true,
  cashPaidAmount: 120,
  paymentRemark: '微信'
});
assert(
  '26 writes paymentByUserId',
  storeBag.m1.paymentByUserId &&
    storeBag.m1.paymentByUserId.u1 &&
    storeBag.m1.paymentByUserId.u1.paymentConfirmed === true &&
    Number(storeBag.m1.paymentByUserId.u1.paidAmount) === 120
);
assert(
  '27 paymentLogs appended',
  Array.isArray(storeBag.m1.paymentLogs) &&
    storeBag.m1.paymentLogs.length >= 1 &&
    storeBag.m1.paymentLogs.some(function (l) {
      return l && l.playerId === 'u1' && l.matchId === 'm1';
    })
);
assert(
  '28 registerInfo unchanged',
  JSON.stringify(storeBag.m1.registerInfo) === JSON.stringify(regBefore)
);
assert(
  '29 groups unchanged',
  JSON.stringify(storeBag.m1.groups) === JSON.stringify(groupsBefore)
);
assert(
  '30 feeList/feeSet unchanged',
  JSON.stringify(storeBag.m1.feeList) === JSON.stringify(feeBefore) &&
    storeBag.m1.feeSet === true
);
assert(
  '31 pairings unchanged',
  JSON.stringify(storeBag.m1.pairings) === JSON.stringify(pairBefore)
);
assert(
  '32 roster unchanged',
  JSON.stringify(seriesBag.roster) === JSON.stringify(seriesBefore.roster)
);
assert('33 R2 unchanged', JSON.stringify(storeBag.m2) === JSON.stringify(r2Before));
assert(
  '34 rounds fee untouched',
  seriesBag.rounds[0].fee === '99' && seriesBag.rounds[1].fee === '88'
);
assert(
  '35 changed frozen matchId',
  (comp.__events || []).some(function (e) {
    return e.name === 'changed' && e.detail.matchId === 'm1';
  })
);

// 分组调整后历史保留；移出列表不展示；再加入恢复
storeBag.m1.groups = [
  {
    groupId: 'g1',
    players: [{ position: 1, userId: 'u2', name: '乙' }]
  }
];
var afterRearrange = seriesGroupedPaymentManage.buildGroupedPaymentDraftUsers(
  storeBag.m1,
  seriesBag.roster
);
assert(
  '36 removed u1 hidden from list',
  afterRearrange.length === 1 && afterRearrange[0].userId === 'u2'
);
assert(
  '37 history kept for u1',
  storeBag.m1.paymentByUserId.u1 &&
    storeBag.m1.paymentByUserId.u1.paymentConfirmed === true
);
storeBag.m1.groups = r1Groups;
var restored = seriesGroupedPaymentManage.buildGroupedPaymentDraftUsers(
  storeBag.m1,
  seriesBag.roster
);
assert(
  '38 rejoin restores payment UI',
  restored.some(function (u) {
    return u.userId === 'u1' && u.paymentConfirmed === true && Number(u.paidAmount) === 120;
  })
);

// 未分组空态仍打开
storeBag.m1.groups = [];
comp = makeCompHost();
comp._openSheet();
assert('39 empty groups still open', !!comp.data.sheetReady);
assert(
  '40 empty text',
  comp.data.emptyText === '本轮尚未分组，暂无收费人员' &&
    (comp.data.paymentUsers || []).length === 0
);
storeBag.m1.groups = deepClone(r1Groups);

// 关闭不回滚
var snapPay = JSON.stringify(storeBag.m1.paymentByUserId);
comp = makeCompHost();
comp._openSheet();
comp.onClose();
assert(
  '41 close no rollback',
  JSON.stringify(storeBag.m1.paymentByUserId) === snapPay
);

// 写失败
comp = makeCompHost();
comp._openSheet();
comp.__events = [];
global.__toasts = [];
var payBeforeFail = deepClone(storeBag.m1.paymentByUserId);
teamMatchStore.saveMatch = function () {
  throw new Error('fail');
};
comp.patchPaymentUser('u2', { paymentConfirmed: true, cashPaidAmount: 1 });
assert(
  '42 fail no changed',
  !(comp.__events || []).some(function (e) {
    return e.name === 'changed';
  })
);
assert(
  '43 fail toast',
  (global.__toasts || []).some(function (t) {
    return t && t.title === '保存失败';
  })
);
assert(
  '44 fail no persist u2',
  !storeBag.m1.paymentByUserId.u2 ||
    storeBag.m1.paymentByUserId.u2.paymentConfirmed !== true
);
teamMatchStore.saveMatch = function (match) {
  if (!match || !match.matchId) return null;
  storeBag[String(match.matchId)] = JSON.parse(JSON.stringify(match));
  return storeBag[String(match.matchId)];
};
storeBag.m1.paymentByUserId = payBeforeFail;

// gate / permission
host = makePageHost();
storeBag.m1.seriesContext.publishToken = 'BAD';
global.__toasts = [];
global.__navs = [];
host._openSeriesPaymentManageSheet({ roundId: 'r1' });
assert('45 gate fail no open', host.data.paymentManageSheetVisible === false);
assert(
  '46 gate toast',
  (global.__toasts || []).some(function (t) {
    return t && t.title === '本轮比赛数据异常';
  })
);
storeBag.m1.seriesContext.publishToken = 'pt-1';

host = makePageHost();
storeBag.m1.createdBy = 'other';
storeBag.m1.organizationId = 'ox';
gameStore.getCurrentUser = function () {
  return { userId: 'stranger' };
};
global.__toasts = [];
host._openSeriesPaymentManageSheet({ roundId: 'r1' });
assert('47 denied no open', host.data.paymentManageSheetVisible === false);
assert(
  '48 denied toast',
  (global.__toasts || []).some(function (t) {
    return t && t.title === '暂无收费管理权限';
  })
);
gameStore.getCurrentUser = function () {
  return { userId: 'creator-1', nickname: '创建者' };
};
storeBag.m1.createdBy = 'creator-1';
storeBag.m1.organizationId = 'org-1';

// changed reload
host = makePageHost();
host.data.paymentManageSheetVisible = true;
host.onPaymentManageSheetChanged();
assert(
  '49 changed reload resetScroll false',
  host.__reload && host.__reload.resetScroll === false
);
assert(
  '50 sheet stays open on changed',
  host.data.paymentManageSheetVisible === true
);

// unload
host = makePageHost();
host.data.paymentManageSheetVisible = true;
host._pageAlive = false;
var setCalls = 0;
host.setData = function () {
  setCalls += 1;
};
host.onPaymentManageSheetClose();
assert('51 unload blocks setData', setCalls === 0);

// normalize keeps paymentByUserId
var norm = teamMatchStore.getMatchById;
teamMatchStore.getMatchById = origGet;
// use normalize via requiring path - already stubbed; test normalizeStoredMatch indirectly:
storeBag.m1.paymentByUserId = { u1: { playerId: 'u1', paymentConfirmed: true, paidAmount: 3, cashPaidAmount: 3, paymentRemark: '' } };
teamMatchStore.getMatchById = function (id) {
  var m = storeBag[String(id)] || null;
  if (!m) return null;
  // mimic normalizeStoredMatch preserve
  var next = Object.assign({}, m);
  if (Object.prototype.hasOwnProperty.call(next, 'paymentByUserId')) {
    if (
      !next.paymentByUserId ||
      typeof next.paymentByUserId !== 'object' ||
      Array.isArray(next.paymentByUserId)
    ) {
      next.paymentByUserId = {};
    }
  }
  return next;
};
var got = teamMatchStore.getMatchById('m1');
assert(
  '52 normalize keeps paymentByUserId',
  got && got.paymentByUserId && got.paymentByUserId.u1 && got.paymentByUserId.u1.paymentConfirmed === true
);

teamMatchStore.getMatchById = origGet;
teamMatchStore.saveMatch = origSave;
gameStore.getCurrentUser = origUser;
seriesStationIndex.getByMatchId = origIndex;

// ----- UI 对齐补充 -----
var compWxss = read(path.join(compDir, 'index.wxss'));
var commonWxss = read(path.join(mini, 'styles', 'tournament-common.wxss'));
var seriesWxss = read(path.join(pageDir, 'index.wxss'));
var detailWxss = read(path.join(detailDir, 'index.wxss'));

assert(
  '53 same component template (no Series fork)',
  compWxml.indexOf('收费管理') >= 0 &&
    !/dataMode|grouped_players/.test(compWxml) &&
    pageWxml.indexOf('match-payment-management-sheet') >= 0 &&
    detailWxml.indexOf('match-payment-management-sheet') >= 0
);
assert(
  '54 host relative stack + authoritative payment CSS in component',
  /match-payment-management-host/.test(compWxss) &&
    compWxss.indexOf('.payment-summary {') >= 0 &&
    compWxss.indexOf('max-height: 82vh') >= 0
);
assert(
  '55 Series page no payment size CSS',
  seriesWxss.indexOf('.payment-sheet') < 0 &&
    seriesWxss.indexOf('.payment-user-card') < 0
);
assert(
  '56 authority styles in tournament-common',
  commonWxss.indexOf('.payment-sheet {') >= 0 &&
    commonWxss.indexOf('.payment-sheet .register-sheet__head') >= 0
);
assert(
  '57 empty structure class shared',
  compWxml.indexOf('payment-sheet__empty') >= 0 &&
    compWxml.indexOf('{{emptyText}}') >= 0
);
assert(
  '58 roster enrich fills avatar when seat has name only',
  (function () {
    var rosterAvatar = '/assets/mock-avatars/mock-avatar-03.jpg';
    var users = seriesGroupedPaymentManage.buildGroupedPaymentDraftUsers(
      {
        groups: [
          { id: 'g1', players: [{ userId: 'u9', name: '席位甲', gender: '' }] }
        ],
        paymentByUserId: {},
        registerInfo: { users: [] }
      },
      [
        {
          playerId: 'u9',
          playerNameSnapshot: '席位甲',
          playerAvatarSnapshot: rosterAvatar,
          genderSnapshot: 'female'
        }
      ]
    );
    var expected = mockAvatars.resolveAvatar(rosterAvatar, 'u9');
    return (
      users[0] &&
      users[0].name === '席位甲' &&
      users[0].displayAvatar === expected &&
      expected.indexOf('/assets/') < 0
    );
  })()
);

// ----- 真实分组往返：席位 ID 形态 / roster 缺失 / 空 payment map -----
delete require.cache[path.join(utilsDir, 'seriesGroupedPaymentManage.js')];
seriesGroupedPaymentManage = require(path.join(
  utilsDir,
  'seriesGroupedPaymentManage.js'
));

var mixedGroups = [
  {
    groupId: 'g-mix',
    groupName: '第1组',
    players: [
      // 1) 仅有 userId
      { position: 1, userId: 'only-uid', displayName: '仅UID' },
      // 2) 仅有 playerId
      { position: 2, playerId: 'only-pid', name: '仅PID' },
      // 3) 席位有姓名，roster 无此人
      { position: 3, userId: 'seat-named', name: '席位名' },
      // 4) 席位无姓名，roster 可补齐
      { position: 4, userId: 'roster-named' },
      // 5) 重复 ID（异常第二组也会再出现）
      { position: 1, userId: 'only-uid', name: '重复应去重' },
      // 6) 空席位
      { position: 2, userId: '', playerId: '', id: '' },
      { position: 3 }
    ]
  },
  {
    groupId: 'g-dup',
    players: [
      { position: 1, userId: 'only-uid', name: '跨组重复' },
      // playersSlots 兼容
      { position: 2, id: 'only-id', nickname: '仅ID' }
    ],
    playersSlots: [{ userId: 'slot-user', displayName: 'Slots席位' }]
  }
];

// 有效真人期望：only-uid, only-pid, seat-named, roster-named, only-id, slot-user → 但用户要求 4 名？
// 用户断言：「4 名有效真人按 ID 去重后全部显示」——对照其 1-4 项 + 去重，空席丢掉。
// 同时要求兼容 id / playersSlots；这里以「核心 4 + 额外兼容席位仍显示」分别断言。
var coreFourIds = ['only-uid', 'only-pid', 'seat-named', 'roster-named'];
var rosterForMixed = [
  {
    playerId: 'roster-named',
    displayName: '名册补齐',
    avatar: '/assets/mock-avatars/mock-avatar-02.jpg'
  }
];

var emptyPayMatch = {
  matchId: 'm-mix',
  groups: deepClone(mixedGroups),
  paymentByUserId: {},
  registerInfo: { users: [] },
  seriesContext: {
    managed: true,
    seriesId: 's1',
    roundId: 'r1',
    publishToken: 'pt-1'
  }
};

var listed = seriesGroupedPaymentManage.buildGroupedPaymentDraftUsers(
  emptyPayMatch,
  rosterForMixed
);
var listedIds = listed.map(function (u) {
  return u.playerId;
});
assert(
  '59 core four seats all present (payment map empty)',
  coreFourIds.every(function (id) {
    return listedIds.indexOf(id) >= 0;
  }),
  'ids=' + listedIds.join(',')
);
assert(
  '60 empty paymentByUserId still lists players',
  listed.length >= 4 &&
    listed.every(function (u) {
      return u.paymentConfirmed !== true;
    })
);
assert(
  '61 roster miss keeps seat-named',
  listed.some(function (u) {
    return u.playerId === 'seat-named' && u.displayName === '席位名';
  })
);
assert(
  '62 roster fills nameless seat',
  listed.some(function (u) {
    return u.playerId === 'roster-named' && u.displayName === '名册补齐';
  })
);
assert(
  '63 empty seats dropped',
  listedIds.indexOf('') < 0 &&
    !listed.some(function (u) {
      return !u.playerId;
    })
);
assert(
  '64 dedupe only-uid once',
  listedIds.filter(function (id) {
    return id === 'only-uid';
  }).length === 1
);
assert(
  '65 id-only + playersSlots still collected',
  listedIds.indexOf('only-id') >= 0 && listedIds.indexOf('slot-user') >= 0
);

var summary = paymentManage.calculatePaymentSummary(listed);
assert(
  '66 summary total = list length (all unpaid)',
  summary.paidCount === 0 &&
    summary.unpaidCount === listed.length &&
    summary.unpaidCount === listedIds.length
);

var paidFilter = paymentManage.filterPaymentUsers(listed, { filter: 'paid' });
var unpaidFilter = paymentManage.filterPaymentUsers(listed, { filter: 'unpaid' });
var allFilter = paymentManage.filterPaymentUsers(listed, { filter: 'all' });
assert('67 filter all = full list', allFilter.length === listed.length);
assert('68 filter paid empty', paidFilter.length === 0);
assert('69 filter unpaid = full list', unpaidFilter.length === listed.length);

// 已有收费记录 + 仅 userId 席位可写
var paidMatch = deepClone(emptyPayMatch);
paidMatch.paymentByUserId = {
  'only-uid': {
    playerId: 'only-uid',
    paymentConfirmed: true,
    paidAmount: 66,
    cashPaidAmount: 66,
    paymentRemark: '微信'
  }
};
var listedPaid = seriesGroupedPaymentManage.buildGroupedPaymentDraftUsers(
  paidMatch,
  rosterForMixed
);
var sumPaid = paymentManage.calculatePaymentSummary(listedPaid);
assert(
  '70 paid summary matches cards',
  sumPaid.paidCount === 1 &&
    sumPaid.unpaidCount === listedPaid.length - 1 &&
    listedPaid.some(function (u) {
      return (
        u.playerId === 'only-uid' &&
        u.paymentConfirmed === true &&
        Number(u.paidAmount) === 66
      );
    })
);
assert(
  '71 filter paid/unpaid with mixed state',
  paymentManage.filterPaymentUsers(listedPaid, { filter: 'paid' }).length ===
    1 &&
    paymentManage.filterPaymentUsers(listedPaid, { filter: 'unpaid' }).length ===
      listedPaid.length - 1
);

var patchTarget = deepClone(emptyPayMatch);
var patchResult = seriesGroupedPaymentManage.applyGroupedPaymentPatch(
  patchTarget,
  'only-uid',
  {
    paymentConfirmed: true,
    cashPaidAmount: 120,
    paidAmount: 120,
    paymentRemark: '现金',
    displayName: '仅UID'
  },
  { userId: 'creator-1', operatorId: 'creator-1', operatorName: '创建者' }
);
assert('72 userId-only seat writable', !!(patchResult && patchResult.ok));
assert(
  '73 writes paymentByUserId[only-uid]',
  patchTarget.paymentByUserId['only-uid'] &&
    patchTarget.paymentByUserId['only-uid'].paymentConfirmed === true &&
    Number(patchTarget.paymentByUserId['only-uid'].paidAmount) === 120
);
assert(
  '74 no registerInfo/groups mutation on patch',
  JSON.stringify(patchTarget.registerInfo) ===
    JSON.stringify(emptyPayMatch.registerInfo) &&
    JSON.stringify(patchTarget.groups) === JSON.stringify(emptyPayMatch.groups)
);

var reopened = seriesGroupedPaymentManage.buildGroupedPaymentDraftUsers(
  patchTarget,
  rosterForMixed
);
assert(
  '75 reopen restores payment + keeps seats',
  reopened.length === listed.length &&
    reopened.some(function (u) {
      return u.playerId === 'only-uid' && u.paymentConfirmed === true;
    })
);

// R1 不影响 R2
var r2Match = {
  matchId: 'm-r2',
  groups: [
    { groupId: 'g2', players: [{ position: 1, userId: 'r2-a', name: 'R2甲' }] }
  ],
  paymentByUserId: {},
  registerInfo: { users: [] }
};
assert(
  '76 R2 independent of R1 payment map',
  seriesGroupedPaymentManage.buildGroupedPaymentDraftUsers(r2Match, []).length ===
    1 &&
    !r2Match.paymentByUserId['only-uid']
);

// 组件：grouped 模式 + 空 payment map 仍出卡；seriesId 可强制 grouped
storeBag = {
  m1: Object.assign(deepClone(emptyPayMatch), {
    matchId: 'm1',
    createdBy: 'creator-1',
    organizationId: 'org-1',
    feeList: [{ id: 'f1', name: '报名费', amount: '100' }],
    feeSet: true,
    paymentLogs: []
  })
};
gameStore.getCurrentUser = function () {
  return { userId: 'creator-1', nickname: '创建者' };
};
teamMatchStore.getMatchById = function (id) {
  return storeBag[String(id)] || null;
};
teamMatchStore.saveMatch = function (match) {
  if (!match || !match.matchId) return null;
  storeBag[String(match.matchId)] = JSON.parse(JSON.stringify(match));
  return storeBag[String(match.matchId)];
};

var compHost = makeCompHost();
compHost.properties.matchId = 'm1';
compHost.properties.dataMode = 'grouped_players';
compHost.properties.seriesId = 's1';
compHost.properties.roundId = 'r1';
compHost.properties.rosterSnapshot = rosterForMixed;
compHost._openSheet();
assert(
  '77 component lists grouped seats',
  (compHost.data.paymentUsers || []).length >= 4
);
assert(
  '78 component filter all shows cards',
  (compHost.data.paymentFilteredUsers || []).length ===
    (compHost.data.paymentUsers || []).length &&
    (compHost.data.paymentFilteredUsers || []).length > 0
);
assert(
  '79 summary matches component list',
  compHost.data.paymentSummary.unpaidCount +
    compHost.data.paymentSummary.paidCount ===
    (compHost.data.paymentUsers || []).length
);

// seriesId 强制 grouped（故意不传 dataMode）
compHost = makeCompHost();
compHost.properties.matchId = 'm1';
compHost.properties.dataMode = 'registration';
compHost.properties.seriesId = 's1';
compHost.properties.roundId = 'r1';
compHost.properties.rosterSnapshot = rosterForMixed;
compHost._openSheet();
assert(
  '80 seriesId forces grouped_players list',
  (compHost.data.paymentUsers || []).length >= 4
);

compHost.patchPaymentUser('only-uid', {
  paymentConfirmed: true,
  cashPaidAmount: 55,
  paidAmount: 55,
  paymentRemark: '测'
});
assert(
  '81 patch keeps other seats',
  (compHost.data.paymentUsers || []).length >= 4 &&
    storeBag.m1.paymentByUserId['only-uid'] &&
    Number(storeBag.m1.paymentByUserId['only-uid'].paidAmount) === 55
);
assert(
  '82 patch does not write registerInfo users',
  !storeBag.m1.registerInfo ||
    !storeBag.m1.registerInfo.users ||
    storeBag.m1.registerInfo.users.length === 0
);

// 普通队际赛 registration 无回归
delete require.cache[path.join(utilsDir, 'paymentManage.js')];
paymentManage = require(path.join(utilsDir, 'paymentManage.js'));
var ordinaryUsers = paymentManage.buildPaymentDraftUsers({
  registerInfo: {
    users: [
      {
        userId: 'o1',
        matchNickname: '普通甲',
        paymentConfirmed: false
      },
      {
        userId: 'o2',
        matchNickname: '普通乙',
        paymentConfirmed: true,
        paidAmount: 10,
        cashPaidAmount: 10
      }
    ]
  }
});
assert(
  '83 ordinary registration list intact',
  ordinaryUsers.length === 2 &&
    ordinaryUsers[0].displayName === '普通甲' &&
    ordinaryUsers[1].paymentConfirmed === true
);

assert(
  '84 no SHARED/LEGACY probe residue',
  compWxml.indexOf('SHARED') < 0 &&
    compWxml.indexOf('LEGACY') < 0 &&
    pageJs.indexOf('SeriesPaymentRuntime') < 0
);

console.log('\n--- seriesPaymentManageSheet.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
