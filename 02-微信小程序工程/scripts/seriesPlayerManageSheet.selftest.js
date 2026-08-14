/**
 * S2：Series 选手管理原地接入
 * 运行：node scripts/seriesPlayerManageSheet.selftest.js
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

assert(
  'Series registers player sheet',
  pageJson.indexOf('match-player-management-sheet') >= 0
);
assert(
  'Series mounts sheet once',
  (pageWxml.match(/<match-player-management-sheet/g) || []).length === 1
);
assert(
  'Series series-mode true',
  pageWxml.indexOf('series-mode="{{true}}"') >= 0
);
assert(
  'manage_players in-place open',
  /permission === 'manage_players'[\s\S]{0,120}_openSeriesPlayerManageSheet/.test(
    pageJs
  )
);
assert(
  'no players deep-link in permission branch',
  !/permission === 'manage_players'[\s\S]{0,200}_openSeriesDetailSheetDeepLink\('players'\)/.test(
    pageJs
  ) && pageJs.indexOf("openSheet=players") < 0
);
assert(
  'payment/tee 仍走原地 sheet',
  pageJs.indexOf('_openSeriesTeeSheetManageSheet') >= 0 &&
    pageJs.indexOf('_openSeriesPaymentManageSheet') >= 0 &&
    pageJs.indexOf('_openSeriesDetailSheetDeepLink') >= 0
);
assert(
  'detail still has shared player sheet',
  detailWxml.indexOf('match-player-management-sheet') >= 0 &&
    detailWxml.indexOf('round-subtitle=""') >= 0
);
assert(
  'detail keeps players openSheet compat',
  /openSheetRaw === 'players'|sheet === 'players'/.test(detailJs)
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
assert('Page captured', !loadErr && !!pageDef, loadErr && String(loadErr.message));
var methods = pageDef || {};

var seriesStationManageGate = require(path.join(
  utilsDir,
  'seriesStationManageGate.js'
));
var playerManage = require(path.join(utilsDir, 'playerManage.js'));
var teamMatchStore = require(path.join(utilsDir, 'teamMatchStore.js'));
var gameStore = require(path.join(utilsDir, 'gameStore.js'));

var storeBag = {};
var indexBag = {};
var seriesBag = null;
var origGet = teamMatchStore.getMatchById;
var origSave = teamMatchStore.saveMatch;
var origUser = gameStore.getCurrentUser;
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

function makeStation(mid, rid, groups) {
  return {
    matchId: mid,
    matchType: 'inter-team',
    status: 'registering',
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
        userId: 'roster-only',
        playerNameSnapshot: '未分组报名',
        matchTeamId: 't1',
        matchTeamName: '红队'
      },
      {
        userId: 'u1',
        playerNameSnapshot: '席位甲-roster',
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
    players: [
      { position: 1, userId: 'u1', name: '甲', matchTeamId: 't1', matchTeamName: '红队' },
      { position: 2, userId: 'u2', name: '乙', matchTeamId: 't2', matchTeamName: '蓝队' },
      { position: 3, userId: '' },
      { position: 4, userId: '' }
    ]
  }
];

seriesBag = makeSeries();
storeBag = {
  m1: makeStation('m1', 'r1', r1Groups),
  m2: makeStation('m2', 'r2', [
    {
      groupId: 'g2',
      groupName: '第1组',
      players: [
        { position: 1, userId: 'u9', name: '己' },
        { position: 2, userId: '' },
        { position: 3, userId: '' },
        { position: 4, userId: '' }
      ]
    }
  ])
};
indexBag = {
  m1: { seriesId: 's1', roundId: 'r1', matchId: 'm1' },
  m2: { seriesId: 's1', roundId: 'r2', matchId: 'm2' }
};

// domain: groups draft + empty + roster not listed
var draft = playerManage.buildSeriesPlayerManageDraft(storeBag.m1, seriesBag.roster);
assert('list from groups seats', draft.players.length === 2, 'len=' + draft.players.length);
assert(
  'roster-only excluded',
  !draft.players.some(function (p) {
    return p.userId === 'roster-only';
  })
);
assert(
  'dedupe userId',
  draft.players.filter(function (p) {
    return p.userId === 'u1';
  }).length === 1
);

var emptyDraft = playerManage.buildSeriesPlayerManageDraft(
  makeStation('m-empty', 'r1', []),
  seriesBag.roster
);
assert('empty groups empty list', emptyDraft.players.length === 0);

var subtitle = methods._buildTempAdminRoundSubtitle(
  seriesBag,
  seriesBag.rounds[0],
  'r1'
);
assert('subtitle R1 · 第一轮', subtitle === 'R1 · 第一轮', subtitle);

function makeHost() {
  var host = {
    _pageAlive: true,
    _seriesId: 's1',
    _lastSeriesForSchedule: seriesBag,
    _manageSelectedRoundId: 'r1',
    _manageSelectedMatchId: 'm1',
    _playerManageFrozen: null,
    _playerManageSheetOpening: false,
    _tempAdminFrozen: null,
    _tempAdminSheetOpening: false,
    _activeTab: 'schedule',
    _scheduleSelectedKey: 'r1',
    _scrollTop: 88,
    data: {
      showMoreSheet: true,
      playerManageSheetVisible: false,
      playerManageSheetMatchId: '',
      playerManageSheetRoundSubtitle: '',
      playerManageRosterSnapshot: [],
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
    _buildTempAdminRoundSubtitle: methods._buildTempAdminRoundSubtitle
  };

  // in-memory open (same gates as page, local stores)
  host._openSeriesPlayerManageSheet = function (gateIn) {
    var self = this;
    if (!self._pageAlive) return;
    if (
      self.data.playerManageSheetVisible ||
      self._playerManageSheetOpening ||
      self.data.tempAdminSheetVisible
    ) {
      return;
    }
    var series = self._lastSeriesForSchedule;
    var roundId =
      (gateIn && gateIn.roundId) || self._manageSelectedRoundId || '';
    roundId = roundId != null ? String(roundId).trim() : '';
    var gate = seriesStationManageGate.verifyManagedStationForManage({
      series: series,
      roundId: roundId,
      getMatchById: function (id) {
        return teamMatchStore.getMatchById(id);
      },
      getIndexByMatchId: function (id) {
        return indexBag[String(id)] || null;
      }
    });
    if (!gate || !gate.ok) {
      global.wx.showToast({
        title:
          (gate && gate.message) || seriesStationManageGate.GATE_FAIL_MESSAGE,
        icon: 'none'
      });
      return;
    }
    var user = gameStore.getCurrentUser() || {};
    var access = require(path.join(utilsDir, 'matchManageAccess.js')).resolveMatchManageAccess(
      gate.match,
      user
    );
    if (
      !playerManage.canManagePlayers(
        gate.match,
        user.userId,
        !!(access && access.isPrivilegedUser)
      )
    ) {
      global.wx.showToast({ title: '暂无选手管理权限', icon: 'none' });
      return;
    }
    self._playerManageFrozen = {
      seriesId: gate.seriesId,
      roundId: gate.roundId,
      matchId: gate.matchId,
      publishToken: String(series.publishToken || '')
    };
    var subtitleText = self._buildTempAdminRoundSubtitle(
      series,
      gate.round,
      gate.roundId
    );
    self._playerManageSheetOpening = true;
    self.closeMoreSheetFully();
    self._safeSetData(
      {
        playerManageSheetVisible: true,
        playerManageSheetMatchId: gate.matchId,
        playerManageSheetRoundSubtitle: subtitleText,
        playerManageRosterSnapshot: Array.isArray(series.roster)
          ? series.roster.slice()
          : []
      },
      function () {
        self._playerManageSheetOpening = false;
      }
    );
  };
  host.onPlayerManageSheetClose = methods.onPlayerManageSheetClose;
  host.onPlayerManageSheetSaved = methods.onPlayerManageSheetSaved;
  host._closeManageSecondaryPatch = function (patch, cb) {
    this.setData(patch || {}, cb);
  };
  return host;
}

global.__toasts = [];
global.__navs = [];
var host = makeHost();
host._openSeriesPlayerManageSheet({ roundId: 'r1' });
assert('opens sheet', host.data.playerManageSheetVisible === true);
assert('M closed', host.data.showMoreSheet === false);
assert('matchId m1', host.data.playerManageSheetMatchId === 'm1');
assert(
  'subtitle set',
  host.data.playerManageSheetRoundSubtitle === 'R1 · 第一轮'
);
assert('no navigateTo', (global.__navs || []).length === 0);

host._manageSelectedRoundId = 'r2';
assert(
  'selection drift ignored',
  host.data.playerManageSheetMatchId === 'm1'
);

host._openSeriesPlayerManageSheet({ roundId: 'r1' });
assert('double-open ignored', host.data.playerManageSheetMatchId === 'm1');

var seriesBefore = deepClone(seriesBag);
var r2Before = deepClone(storeBag.m2);
var regBefore = deepClone(storeBag.m1.registerInfo);
host.onPlayerManageSheetClose();
assert('cancel closes', host.data.playerManageSheetVisible === false);
assert('cancel keeps tab', host.data.activeTab === 'schedule');
assert('cancel keeps scroll', host.data.scrollTop === 88);
assert('cancel no M reopen', host.data.showMoreSheet === false);

// save only R1 groups fields, not registerInfo / roster / R2
var d = playerManage.buildSeriesPlayerManageDraft(storeBag.m1, seriesBag.roster);
d.players = playerManage.updatePlayerField(
  d.players,
  'u1',
  { matchNickname: '甲新' },
  d.teamOptions
);
var commit = playerManage.commitSeriesPlayerManageDraft(storeBag.m1, d);
assert('series commit ok', !!(commit && commit.ok));
teamMatchStore.saveMatch(storeBag.m1);
assert(
  'R1 seat name synced',
  JSON.stringify(storeBag.m1.groups).indexOf('甲新') >= 0
);
assert(
  'registerInfo unchanged',
  JSON.stringify(storeBag.m1.registerInfo) === JSON.stringify(regBefore)
);
assert(
  'Series.roster unchanged',
  JSON.stringify(seriesBag.roster) === JSON.stringify(seriesBefore.roster)
);
assert('R2 deep-equal', JSON.stringify(storeBag.m2) === JSON.stringify(r2Before));
assert(
  'seriesContext untouched',
  storeBag.m1.seriesContext.publishToken === 'pt-1' &&
    storeBag.m1.seriesContext.roundId === 'r1'
);

// gate fail
host = makeHost();
storeBag.m1.seriesContext.publishToken = 'BAD';
global.__toasts = [];
global.__navs = [];
host._openSeriesPlayerManageSheet({ roundId: 'r1' });
assert('gate fail no open', host.data.playerManageSheetVisible === false);
assert(
  'gate toast',
  (global.__toasts || []).some(function (t) {
    return t && t.title === '本轮比赛数据异常';
  })
);
assert('gate no nav', (global.__navs || []).length === 0);
storeBag.m1.seriesContext.publishToken = 'pt-1';

// permission fail
host = makeHost();
storeBag.m1.createdBy = 'other';
storeBag.m1.organizationId = 'ox';
gameStore.getCurrentUser = function () {
  return { userId: 'stranger' };
};
global.__toasts = [];
host._openSeriesPlayerManageSheet({ roundId: 'r1' });
assert('denied no open', host.data.playerManageSheetVisible === false);
assert(
  'denied toast',
  (global.__toasts || []).some(function (t) {
    return t && t.title === '暂无选手管理权限';
  })
);
gameStore.getCurrentUser = function () {
  return { userId: 'creator-1' };
};
storeBag.m1.createdBy = 'creator-1';
storeBag.m1.organizationId = 'org-1';

// saved reload
host = makeHost();
host.data.playerManageSheetVisible = true;
host.data.playerManageSheetMatchId = 'm1';
host.onPlayerManageSheetSaved();
assert('saved closes', host.data.playerManageSheetVisible === false);
assert(
  'saved reload resetScroll false',
  host.__reload && host.__reload.resetScroll === false
);
assert('saved keeps tab/scroll', host.data.activeTab === 'schedule' && host.data.scrollTop === 88);

// unload no setData（close 早退；不写）
host = makeHost();
host.data.playerManageSheetVisible = true;
host.data.playerManageSheetMatchId = 'm1';
host._pageAlive = false;
var setCalls = 0;
host.setData = function () {
  setCalls += 1;
};
host.onPlayerManageSheetClose();
assert('unload blocks setData', setCalls === 0);
assert(
  'unload leaves sheet data untouched',
  host.data.playerManageSheetVisible === true &&
    host.data.playerManageSheetMatchId === 'm1'
);

teamMatchStore.getMatchById = origGet;
teamMatchStore.saveMatch = origSave;
gameStore.getCurrentUser = origUser;

console.log('\n--- seriesPlayerManageSheet.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
