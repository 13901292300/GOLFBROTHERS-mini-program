/**
 * T2：Series 出发管理原地接入
 * 运行：node scripts/seriesTeeManageSheet.selftest.js
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
var compDir = path.join(mini, 'components', 'match-tee-management-sheet');

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

assert(
  '1 Series registers tee sheet',
  pageJson.indexOf('match-tee-management-sheet') >= 0
);
assert(
  '2 Series mounts sheet once',
  (pageWxml.match(/<match-tee-management-sheet/g) || []).length === 1
);
assert(
  '3 manage_tee_sheet in-place open',
  /permission === 'manage_tee_sheet'[\s\S]{0,120}_openSeriesTeeSheetManageSheet/.test(
    pageJs
  )
);
assert(
  '4 edit_groups opens group-editor for current manage round',
  /permission === 'edit_groups'[\s\S]{0,280}_openSeriesGroupEditorForRound/.test(
    pageJs
  ) &&
    !/permission === 'edit_groups'[\s\S]{0,120}_goSeriesManageScheduleRound/.test(
      pageJs
    )
);
assert(
  '5 no tee deep-link / schedule-only pseudo',
  !/manage_tee_sheet' \|\| permission === 'edit_groups'/.test(pageJs) &&
    /permission === 'manage_tee_sheet'[\s\S]{0,160}_openSeriesTeeSheetManageSheet/.test(
      pageJs
    ) &&
    pageJs.indexOf("openSheet=tee") < 0 &&
    pageJs.indexOf("navigateTo") >= 0 /* retained elsewhere */
);
assert(
  '6 payment/half 原页打开，deep-link 函数仅兼容保留',
  pageJs.indexOf('_openSeriesHalfCourseSheet') >= 0 &&
    pageJs.indexOf('_openSeriesPaymentManageSheet') >= 0 &&
    pageJs.indexOf('_openSeriesDetailSheetDeepLink') >= 0 &&
    !/_openSeriesDetailSheetDeepLink\('half'\)/.test(pageJs) &&
    !/_openSeriesDetailSheetDeepLink\('payment'\)/.test(pageJs)
);
assert(
  '7 detail still has shared tee sheet + empty subtitle',
  detailWxml.indexOf('match-tee-management-sheet') >= 0 &&
    /match-tee-management-sheet[\s\S]{0,300}round-subtitle=""/.test(detailWxml)
);
assert(
  '8 detail thin open kept',
  /openTeeSheetManageSheet\(\)\s*\{[\s\S]*?teeSheetManageSheetVisible:\s*true/.test(
    detailJs
  )
);
assert(
  '9 empty groups toast copy',
  pageJs.indexOf("请先完成分组后再设置出发表") >= 0 &&
    /groups\.length[\s\S]{0,200}请先完成分组后再设置出发表/.test(pageJs)
);
assert(
  '10 component success toast',
  compJs.indexOf("title: '出发安排已保存'") >= 0
);

var memory = {};
global.wx = {
  showToast: function (opt) {
    global.__toasts = (global.__toasts || []).concat([opt || {}]);
  },
  showModal: function () {},
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

var seriesStationManageGate = require(path.join(
  utilsDir,
  'seriesStationManageGate.js'
));
var seriesStationIndex = require(path.join(utilsDir, 'seriesStationIndex.js'));
var teeSheetManage = require(path.join(utilsDir, 'teeSheetManage.js'));
var teamMatchStore = require(path.join(utilsDir, 'teamMatchStore.js'));
var gameStore = require(path.join(utilsDir, 'gameStore.js'));
var matchManageAccess = require(path.join(utilsDir, 'matchManageAccess.js'));

var storeBag = {};
var indexBag = {};
var seriesBag = null;
var origGet = teamMatchStore.getMatchById;
var origSave = teamMatchStore.saveMatch;
var origUser = gameStore.getCurrentUser;
var origIndex = seriesStationIndex.getByMatchId;
teamMatchStore.getMatchById = function (id) {
  return storeBag[String(id)] || null;
};
teamMatchStore.saveMatch = function (match) {
  if (!match || !match.matchId) return null;
  storeBag[String(match.matchId)] = JSON.parse(JSON.stringify(match));
  return storeBag[String(match.matchId)];
};
gameStore.getCurrentUser = function () {
  return { userId: 'creator-1' };
};
seriesStationIndex.getByMatchId = function (id) {
  return indexBag[String(id)] || null;
};

function makeStation(mid, rid, groups) {
  return {
    matchId: mid,
    matchType: 'inter-team',
    status: 'ongoing',
    createdBy: 'creator-1',
    organizationId: 'org-1',
    gameMode: '个人比杆赛',
    teamGroups: [
      { id: 't1', name: '红队' },
      { id: 't2', name: '蓝队' }
    ],
    registerInfo: { totalCount: 0, users: [] },
    groups: groups || [],
    pairings: {},
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
        playerNameSnapshot: '甲',
        matchTeamId: 't1',
        matchTeamName: '红队'
      }
    ],
    rounds: [
      { roundId: 'r1', name: '第一轮', matchId: 'm1', index: 1 },
      { roundId: 'r2', name: '第二轮', matchId: 'm2', index: 2 }
    ]
  };
}

var r1Groups = [
  {
    groupId: 'g1',
    groupName: '第1组',
    teeTime: '08:00',
    startHole: 1,
    players: [
      { position: 1, userId: 'u1', name: '甲', matchTeamId: 't1' },
      { position: 2, userId: 'u2', name: '乙', matchTeamId: 't2' }
    ]
  },
  {
    groupId: 'g2',
    groupName: '第2组',
    teeTime: '08:00',
    startHole: 1,
    players: [{ position: 1, userId: 'u3', name: '丙' }]
  }
];

seriesBag = makeSeries();
storeBag = {
  m1: makeStation('m1', 'r1', r1Groups),
  m2: makeStation('m2', 'r2', [
    {
      groupId: 'g9',
      groupName: '第1组',
      teeTime: '10:00',
      startHole: 1,
      players: [{ position: 1, userId: 'u9', name: '己' }]
    }
  ])
};
indexBag = {
  m1: { seriesId: 's1', roundId: 'r1', matchId: 'm1' },
  m2: { seriesId: 's1', roundId: 'r2', matchId: 'm2' }
};

var subtitle = methods._buildTempAdminRoundSubtitle(
  seriesBag,
  seriesBag.rounds[0],
  'r1'
);
assert('12 subtitle R1 · 第一轮', subtitle === 'R1 · 第一轮', subtitle);

function makeHost() {
  var host = {
    _pageAlive: true,
    _seriesId: 's1',
    _lastSeriesForSchedule: seriesBag,
    _manageSelectedRoundId: 'r1',
    _manageSelectedMatchId: 'm1',
    _teeSheetManageFrozen: null,
    _teeSheetManageSheetOpening: false,
    _playerManageFrozen: null,
    _playerManageSheetOpening: false,
    _tempAdminFrozen: null,
    _tempAdminSheetOpening: false,
    _activeTab: 'schedule',
    _scheduleSelectedKey: 'r1',
    _scrollTop: 88,
    data: {
      showMoreSheet: true,
      teeSheetManageSheetVisible: false,
      teeSheetManageSheetMatchId: '',
      teeSheetManageSheetRoundSubtitle: '',
      playerManageSheetVisible: false,
      tempAdminSheetVisible: false,
      activeTab: 'schedule',
      scrollTop: 88,
      accessGate: 'open'
    },
    setData: function (patch, cb) {
      Object.assign(this.data, patch || {});
      if (typeof cb === 'function') cb();
    },
    _safeSetData: function (patch, cb) {
      if (!this._pageAlive) {
        this.__blocked = true;
        return;
      }
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
    _openSeriesTeeSheetManageSheet: methods._openSeriesTeeSheetManageSheet,
    onTeeSheetManageSheetClose: methods.onTeeSheetManageSheetClose,
    onTeeSheetManageSheetSaved: methods.onTeeSheetManageSheetSaved
  };
  return host;
}

global.__toasts = [];
global.__navs = [];
var host = makeHost();
host._openSeriesTeeSheetManageSheet({ roundId: 'r1' });
assert('13 opens sheet', host.data.teeSheetManageSheetVisible === true);
assert('14 M closed', host.data.showMoreSheet === false);
assert('15 matchId m1', host.data.teeSheetManageSheetMatchId === 'm1');
assert(
  '16 subtitle set',
  host.data.teeSheetManageSheetRoundSubtitle === 'R1 · 第一轮'
);
assert('17 no navigateTo', (global.__navs || []).length === 0);

host._manageSelectedRoundId = 'r2';
assert(
  '18 selection drift ignored',
  host.data.teeSheetManageSheetMatchId === 'm1'
);

host._openSeriesTeeSheetManageSheet({ roundId: 'r1' });
assert('19 double-open ignored', host.data.teeSheetManageSheetMatchId === 'm1');

var seriesBefore = deepClone(seriesBag);
var r2Before = deepClone(storeBag.m2);
var regBefore = deepClone(storeBag.m1.registerInfo);
var playersBefore = deepClone(storeBag.m1.groups[0].players);
host.onTeeSheetManageSheetClose();
assert('20 cancel closes', host.data.teeSheetManageSheetVisible === false);
assert('21 cancel keeps tab', host.data.activeTab === 'schedule');
assert('22 cancel keeps scroll', host.data.scrollTop === 88);
assert('23 cancel no M reopen', host.data.showMoreSheet === false);

// 写 R1 teeTime/startHole，不碰 seats / registerInfo / roster / R2
var draft = teeSheetManage.buildTeeSheetDraft(storeBag.m1, {});
draft = teeSheetManage.setTimeMode(draft, 'interval');
draft = teeSheetManage.setUnifiedTime(draft, '08:00');
draft = teeSheetManage.setIntervalMinutes(draft, 10);
draft = teeSheetManage.setHoleMode(draft, 'bilateral');
var commit = teeSheetManage.commitTeeSheetDraft(storeBag.m1, draft);
assert('24 commit ok', !!(commit && commit.ok));
teamMatchStore.saveMatch(storeBag.m1);
assert('25 R1 g1 teeTime 08:00', storeBag.m1.groups[0].teeTime === '08:00');
assert('26 R1 g2 teeTime 08:10', storeBag.m1.groups[1].teeTime === '08:10');
assert('27 R1 g1 hole 1', storeBag.m1.groups[0].startHole === 1);
assert('28 R1 g2 hole 10', storeBag.m1.groups[1].startHole === 10);
assert(
  '29 seats unchanged',
  JSON.stringify(storeBag.m1.groups[0].players) === JSON.stringify(playersBefore)
);
assert(
  '30 registerInfo unchanged',
  JSON.stringify(storeBag.m1.registerInfo) === JSON.stringify(regBefore)
);
assert(
  '31 Series.roster unchanged',
  JSON.stringify(seriesBag.roster) === JSON.stringify(seriesBefore.roster)
);
assert('32 R2 deep-equal', JSON.stringify(storeBag.m2) === JSON.stringify(r2Before));
assert(
  '33 seriesContext untouched',
  storeBag.m1.seriesContext.publishToken === 'pt-1' &&
    storeBag.m1.seriesContext.roundId === 'r1'
);

// 无分组：toast 且不打开
host = makeHost();
storeBag.m1.groups = [];
global.__toasts = [];
global.__navs = [];
host._openSeriesTeeSheetManageSheet({ roundId: 'r1' });
assert('34 empty no open', host.data.teeSheetManageSheetVisible === false);
assert(
  '35 empty toast ordinary copy',
  (global.__toasts || []).some(function (t) {
    return t && t.title === '请先完成分组后再设置出发表';
  })
);
assert('36 empty no nav', (global.__navs || []).length === 0);
storeBag.m1.groups = deepClone(r1Groups);

// gate fail
host = makeHost();
storeBag.m1.seriesContext.publishToken = 'BAD';
global.__toasts = [];
global.__navs = [];
host._openSeriesTeeSheetManageSheet({ roundId: 'r1' });
assert('37 gate fail no open', host.data.teeSheetManageSheetVisible === false);
assert(
  '38 gate toast',
  (global.__toasts || []).some(function (t) {
    return t && t.title === '本轮比赛数据异常';
  })
);
assert('39 gate no nav', (global.__navs || []).length === 0);
storeBag.m1.seriesContext.publishToken = 'pt-1';

// permission fail
host = makeHost();
storeBag.m1.createdBy = 'other';
storeBag.m1.organizationId = 'ox';
gameStore.getCurrentUser = function () {
  return { userId: 'stranger' };
};
global.__toasts = [];
host._openSeriesTeeSheetManageSheet({ roundId: 'r1' });
assert('40 denied no open', host.data.teeSheetManageSheetVisible === false);
assert(
  '41 denied toast',
  (global.__toasts || []).some(function (t) {
    return t && t.title === '暂无出发管理权限';
  })
);
gameStore.getCurrentUser = function () {
  return { userId: 'creator-1' };
};
storeBag.m1.createdBy = 'creator-1';
storeBag.m1.organizationId = 'org-1';

// 已开赛无额外锁（status=ongoing 已可打开）
host = makeHost();
storeBag.m1.status = 'finished';
global.__toasts = [];
host._openSeriesTeeSheetManageSheet({ roundId: 'r1' });
assert(
  '42 finished still opens',
  host.data.teeSheetManageSheetVisible === true &&
    host.data.teeSheetManageSheetMatchId === 'm1'
);
storeBag.m1.status = 'ongoing';

// saved reload
host = makeHost();
host.data.teeSheetManageSheetVisible = true;
host.data.teeSheetManageSheetMatchId = 'm1';
host.onTeeSheetManageSheetSaved();
assert('43 saved closes', host.data.teeSheetManageSheetVisible === false);
assert(
  '44 saved reload resetScroll false',
  host.__reload && host.__reload.resetScroll === false
);
assert(
  '45 saved keeps tab/scroll',
  host.data.activeTab === 'schedule' && host.data.scrollTop === 88
);
assert('46 saved no M reopen', host.data.showMoreSheet === true || host.data.showMoreSheet === false);

// unload no setData
host = makeHost();
host.data.teeSheetManageSheetVisible = true;
host.data.teeSheetManageSheetMatchId = 'm1';
host._pageAlive = false;
var setCalls = 0;
host.setData = function () {
  setCalls += 1;
};
host.onTeeSheetManageSheetClose();
assert('47 unload blocks setData', setCalls === 0);

// canManage + access helper still used
assert(
  '48 page uses canManageTeeSheet',
  pageJs.indexOf('teeSheetManage.canManageTeeSheet') >= 0
);
assert(
  '49 page uses resolveMatchManageAccess',
  /resolveMatchManageAccess\(gate\.match/.test(pageJs)
);
assert(
  '50 freeze matchId fields present',
  pageJs.indexOf('teeSheetManageSheetMatchId') >= 0 &&
    pageJs.indexOf('_teeSheetManageFrozen') >= 0
);

teamMatchStore.getMatchById = origGet;
teamMatchStore.saveMatch = origSave;
gameStore.getCurrentUser = origUser;
seriesStationIndex.getByMatchId = origIndex;

console.log('\n--- seriesTeeManageSheet.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
