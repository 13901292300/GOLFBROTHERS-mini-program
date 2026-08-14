/**
 * SERIES-CANCEL-LOCK-C2：管理员选手管理删除 · 页面接线与列表置灰
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesCancelLockC2.selftest.js
 */

var path = require('path');
var fs = require('fs');

if (typeof global.Page !== 'function') {
  global.Page = function (cfg) {
    return cfg;
  };
}

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var pageDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');
var friendsDir = path.join(mini, 'subpackages', 'player', 'pages', 'friends');
var compDir = path.join(mini, 'components', 'match-player-management-sheet');
var utilsDir = path.join(mini, 'utils');

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var detailJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');
var detailWxml = fs.readFileSync(path.join(detailDir, 'index.wxml'), 'utf8');
var friendsJs = fs.readFileSync(path.join(friendsDir, 'index.js'), 'utf8');
var compJs = fs.readFileSync(path.join(compDir, 'index.js'), 'utf8');
var compWxml = fs.readFileSync(path.join(compDir, 'index.wxml'), 'utf8');
var compWxss = fs.readFileSync(path.join(compDir, 'index.wxss'), 'utf8');

var memory = {};
var modals = [];
var toasts = [];
global.wx = {
  showToast: function (opt) {
    toasts.push(opt || {});
  },
  showModal: function (opt) {
    modals.push(opt || {});
    if (opt && typeof opt.success === 'function') {
      opt.success({ confirm: !!global.__confirmModal });
    }
  },
  getStorageSync: function (k) {
    return memory['s:' + k] || null;
  },
  setStorageSync: function (k, v) {
    memory['s:' + k] = v;
  },
  removeStorageSync: function (k) {
    delete memory['s:' + k];
  },
  getSystemInfoSync: function () {
    return { windowWidth: 375, windowHeight: 667 };
  },
  makePhoneCall: function () {}
};

var pageIndex = require(path.join(pageDir, 'index.js'));
var seriesStationManageGate = require(path.join(utilsDir, 'seriesStationManageGate.js'));

var componentDef = null;
global.Component = function (def) {
  componentDef = def;
};
delete require.cache[path.join(compDir, 'index.js')];
require(path.join(compDir, 'index.js'));

var teamMatchStore = require(path.join(utilsDir, 'teamMatchStore.js'));
var playerManage = require(path.join(utilsDir, 'playerManage.js'));
var gameStore = require(path.join(utilsDir, 'gameStore.js'));

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

function freeze(o) {
  return JSON.parse(JSON.stringify(o));
}

assert(
  '只改 series-detail + 共享选手管理组件；不改普通 detail / 好友 / proxy',
  pageJs.indexOf('inspectAdminPlayerRemovalImpact') >= 0 &&
    pageJs.indexOf('removePlayerByAdminWithStationCleanup') >= 0 &&
    pageJs.indexOf('onSeriesRemovePlayer') >= 0 &&
    pageWxml.indexOf('bind:series-remove-player') >= 0 &&
    pageWxml.indexOf('series-removing') >= 0 &&
    compJs.indexOf('_onSeriesRemovePlayer') >= 0 &&
    compJs.indexOf("triggerEvent('series-remove-player'") >= 0 &&
    compWxml.indexOf('item.seriesRemovalLocked') >= 0 &&
    compWxss.indexOf('player-manage-row__remove.is-disabled') >= 0 &&
    detailJs.indexOf('removePlayerByAdminWithStationCleanup') < 0 &&
    detailJs.indexOf('inspectAdminPlayerRemovalImpact') < 0 &&
    detailWxml.indexOf('series-remove-player') < 0 &&
    friendsJs.indexOf('inspectAdminPlayerRemovalImpact') < 0 &&
    pageJs.indexOf('inspectProxyCancellationImpact') >= 0 &&
    /_applySeriesProxyCommitPlan:[\s\S]{0,4500}applyProxyCommitPlanWithStationCleanup/.test(
      pageJs
    )
);

assert(
  '每次打开重算 inspect；失败刷新锁；成功关闭刷新',
  /_openSeriesPlayerManageSheet:[\s\S]{0,5000}_buildSeriesPlayerManageRosterSnapshot/.test(
    pageJs
  ) &&
    /_buildSeriesPlayerManageRosterSnapshot:[\s\S]{0,1600}inspectAdminPlayerRemovalImpact/.test(
      pageJs
    ) &&
    pageJs.indexOf('_refreshPlayerManageRemovalLocks') >= 0 &&
    /onSeriesRemovePlayer:[\s\S]{0,3500}_refreshPlayerManageRemovalLocks/.test(pageJs) &&
    /onSeriesRemovePlayer:[\s\S]{0,4000}已删除选手/.test(pageJs) &&
    /onSeriesRemovePlayer:[\s\S]{0,4500}reloadViewModel/.test(pageJs) &&
    pageJs.indexOf('_applySeriesProxyCommitPlan') >= 0 &&
    pageJs.indexOf('removePlayerByAdminWithStationCleanup') >= 0
);

(function () {
  var n = 0;
  var roster = [
    {
      rosterEntryId: 're-u1',
      playerId: 'u1',
      registrationStatus: 'registered'
    }
  ];
  var first = pageIndex.buildSeriesPlayerManageRosterSnapshot(
    roster,
    's1',
    'creator-1',
    function (args) {
      n += 1;
      return n === 1
        ? { ok: true, blockedReason: '' }
        : { ok: false, blockedReason: 'finalized_score' };
    }
  );
  var second = pageIndex.buildSeriesPlayerManageRosterSnapshot(
    roster,
    's1',
    'creator-1',
    function (args) {
      n += 1;
      assert(
        'inspect 参数完整',
        args.seriesId === 's1' &&
          args.playerId === 'u1' &&
          args.rosterEntryId === 're-u1' &&
          args.actorUserId === 'creator-1'
      );
      return { ok: false, blockedReason: 'finalized_score' };
    }
  );
  assert(
    '再次打开会重新 inspect',
    n === 2 &&
      first[0].seriesRemovalLocked === false &&
      second[0].seriesRemovalLocked === true
  );
})();

(function () {
  var row = pageIndex.projectSeriesAdminRemovalInspect({
    ok: false,
    blockedReason: 'finalized_score'
  });
  assert(
    'finalized 行置灰',
    row.seriesRemovalLocked === true &&
      row.seriesRemovalReason === 'finalized_score' &&
      row.seriesRemovalMessage === '已有完赛成绩，不可删除' &&
      row.seriesRemovalMessage === pageIndex.SERIES_ADMIN_REMOVE_FINALIZED
  );
})();

(function () {
  var row = pageIndex.projectSeriesAdminRemovalInspect({
    ok: false,
    blockedReason: 'managed_station_invalid'
  });
  assert(
    'managed 异常行置灰',
    row.seriesRemovalLocked === true &&
      row.seriesRemovalReason === 'managed_station_invalid' &&
      row.seriesRemovalMessage === seriesStationManageGate.GATE_FAIL_MESSAGE
  );
})();

(function () {
  var live = pageIndex.projectSeriesAdminRemovalInspect({
    ok: true,
    blockedReason: ''
  });
  assert('LIVE 有成绩可删除', live.seriesRemovalLocked === false);
})();

(function () {
  var ok = pageIndex.projectSeriesAdminRemovalInspect({
    ok: true,
    blockedReason: ''
  });
  assert('无成绩可删除', ok.seriesRemovalLocked === false);
})();

(function () {
  var denied = pageIndex.projectSeriesAdminRemovalInspect({
    ok: false,
    blockedReason: 'permission_denied'
  });
  var missing = pageIndex.buildSeriesPlayerManageRosterSnapshot(
    [{ playerId: 'x', registrationStatus: 'cancelled' }],
    's1',
    'creator-1',
    function () {
      return { ok: true, blockedReason: '' };
    }
  );
  assert(
    '权限/非 active 失败关闭',
    denied.seriesRemovalLocked === true &&
      missing[0].seriesRemovalLocked === true &&
      missing[0].seriesRemovalReason === 'not_registered'
  );
})();

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
  return { userId: 'creator-1' };
};

function makeOrdinaryMatch() {
  return {
    matchId: 'm-ord',
    matchType: 'inter-team',
    status: 'registering',
    createdBy: 'creator-1',
    organizationId: 'org-1',
    gameMode: '个人比杆赛',
    teamGroups: [
      { id: 't1', name: '红队' },
      { id: 't2', name: '蓝队' }
    ],
    registerInfo: {
      totalCount: 1,
      users: [
        {
          userId: 'u1',
          matchNickname: '甲',
          matchGender: 'male',
          matchTeamId: 't1',
          matchTeamName: '红队',
          phone: '13800000001'
        }
      ]
    },
    groups: [],
    pairings: {}
  };
}

function makeSeriesMatch() {
  return {
    matchId: 'm-series',
    matchType: 'inter-team',
    status: 'registering',
    createdBy: 'creator-1',
    organizationId: 'org-1',
    gameMode: '个人比杆赛',
    teamGroups: [{ id: 't1', name: '红队' }],
    registerInfo: { totalCount: 0, users: [] },
    groups: [
      {
        groupId: 'g1',
        groupName: '第1组',
        players: [
          { position: 1, userId: 'u1', name: '甲', matchTeamId: 't1', matchTeamName: '红队' },
          { position: 2, userId: '' },
          { position: 3, userId: '' },
          { position: 4, userId: '' }
        ]
      }
    ],
    pairings: {},
    seriesContext: {
      managed: true,
      seriesId: 's1',
      roundId: 'r1',
      publishToken: 'tok'
    }
  };
}

function makeHost(seriesMode) {
  var host = {
    _alive: true,
    _targetMatchId: '',
    _draft: null,
    _seriesMode: false,
    _rosterSnapshot: [],
    _saving: false,
    _openSeq: 0,
    _searchTimer: null,
    properties: {
      visible: false,
      matchId: seriesMode ? 'm-series' : 'm-ord',
      roundSubtitle: '',
      themeClass: '',
      seriesMode: !!seriesMode,
      rosterSnapshot: [],
      seriesRemoving: false
    },
    data: Object.assign({}, componentDef.data),
    setData: function (patch) {
      Object.assign(this.data, patch || {});
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

storeBag = { 'm-ord': makeOrdinaryMatch() };
modals = [];
toasts = [];
global.__confirmModal = true;
var ordinary = makeHost(false);
ordinary._openSheet();
var ordinaryDraftBefore = freeze(ordinary._draft);
ordinary.__events = [];
ordinary.onRemovePlayer({ currentTarget: { dataset: { userid: 'u1' } } });
assert(
  '普通模式完全不受影响',
  ordinary._seriesMode === false &&
    modals.length === 1 &&
    (ordinary.__events || []).every(function (e) {
      return e.name !== 'series-remove-player';
    }) &&
    (ordinary._draft.players || []).every(function (p) {
      return p.userId !== 'u1';
    }) &&
    JSON.stringify(ordinaryDraftBefore.players) !== JSON.stringify(ordinary._draft.players)
);

storeBag = { 'm-series': makeSeriesMatch() };
var lockedSnap = [
  {
    rosterEntryId: 're-u1',
    playerId: 'u1',
    userId: 'u1',
    registrationStatus: 'registered',
    seriesRemovalLocked: true,
    seriesRemovalReason: 'finalized_score',
    seriesRemovalMessage: '已有完赛成绩，不可删除'
  }
];
modals = [];
toasts = [];
global.__confirmModal = true;
var lockedHost = makeHost(true);
lockedHost.properties.rosterSnapshot = lockedSnap;
lockedHost._openSheet();
lockedHost.__events = [];
var draftBeforeLock = freeze(lockedHost._draft);
lockedHost.onRemovePlayer({ currentTarget: { dataset: { userid: 'u1' } } });
assert(
  'locked 点击不弹确认、不触发事件',
  modals.length === 0 &&
    (lockedHost.__events || []).length === 0 &&
    JSON.stringify(lockedHost._draft) === JSON.stringify(draftBeforeLock) &&
    (toasts[0] && toasts[0].title) === '已有完赛成绩，不可删除'
);

var openSnap = [
  {
    rosterEntryId: 're-u1',
    playerId: 'u1',
    userId: 'u1',
    registrationStatus: 'registered',
    seriesRemovalLocked: false,
    seriesRemovalReason: '',
    seriesRemovalMessage: ''
  }
];
modals = [];
toasts = [];
global.__confirmModal = true;
var openHost = makeHost(true);
openHost.properties.rosterSnapshot = openSnap;
openHost._openSheet();
openHost.__events = [];
var draftBeforeOpen = freeze(openHost._draft);
openHost.onRemovePlayer({ currentTarget: { dataset: { userid: 'u1' } } });
assert(
  'unlocked 确认后只触发专用事件，Series draft 不先删除',
  modals.length === 1 &&
    String(modals[0].title || '').indexOf('系列赛') >= 0 &&
    String(modals[0].content || '').indexOf('整个系列赛报名') >= 0 &&
    (openHost.__events || []).length === 1 &&
    openHost.__events[0].name === 'series-remove-player' &&
    openHost.__events[0].detail.playerId === 'u1' &&
    openHost.__events[0].detail.rosterEntryId === 're-u1' &&
    JSON.stringify(openHost._draft.players) === JSON.stringify(draftBeforeOpen.players)
);

(function () {
  var applyArgs = null;
  var toasts2 = [];
  var refresh = [];
  var page = {
    _pageAlive: true,
    _seriesId: 's1',
    _adminPlayerRemoveLock: false,
    _adminPlayerRemoveToken: 1,
    _lastSeriesForSchedule: { seriesId: 's1', registrationRevision: 3 },
    data: { playerManageRemoving: false, playerManageSheetVisible: true },
    _selfCancelOrchestrator: {
      removePlayerByAdminWithStationCleanup: function (args) {
        applyArgs = args;
        return page._applyResult;
      }
    },
    _safeSetData: function (patch) {
      Object.assign(this.data, patch || {});
    },
    _toastAdminPlayerRemoveFailure: function (reason) {
      toasts2.push('fail:' + reason);
    },
    _refreshPlayerManageRemovalLocks: function () {
      refresh.push('locks');
    },
    _clearAdminPlayerRemoveSession: function () {
      refresh.push('clear');
    },
    _closeManageSecondaryPatch: function (patch, cb) {
      refresh.push('close');
      if (typeof cb === 'function') cb();
    },
    _canLoadBusinessContent: function () {
      return true;
    },
    reloadViewModel: function () {
      refresh.push('reload');
    }
  };

  var src = pageJs.match(
    /onSeriesRemovePlayer:\s*function\s*\(e\)\s*\{[\s\S]*?\n  \},/
  );
  assert('能定位父页面删除处理', !!(src && src[0]));
  if (!src) return;

  var seriesStore = {
    getSeriesById: function () {
      return { seriesId: 's1', registrationRevision: 3 };
    }
  };
  var gameStoreLocal = {
    getCurrentUser: function () {
      return { userId: 'creator-1', playerId: 'creator-1', name: 'C' };
    }
  };
  var wxLocal = {
    showToast: function (opt) {
      toasts2.push((opt && opt.title) || '');
    }
  };

  function run(result) {
    applyArgs = null;
    toasts2.length = 0;
    refresh.length = 0;
    page._applyResult = result;
    page._adminPlayerRemoveLock = false;
    page.data.playerManageRemoving = false;
    page._pageAlive = true;
    page._adminPlayerRemoveToken = 1;
    var fn = new Function(
      'seriesStore',
      'gameStore',
      'wx',
      'canApplyAdminPlayerRemoveResult',
      'return function (e) { ' +
        src[0]
          .replace(/^onSeriesRemovePlayer:\s*function\s*\(e\)\s*\{/, '')
          .replace(/\n  \},$/, '') +
        ' };'
    );
    fn(
      seriesStore,
      gameStoreLocal,
      wxLocal,
      pageIndex.canApplyAdminPlayerRemoveResult
    ).call(page, {
      detail: { playerId: 'u1', rosterEntryId: 're-u1' }
    });
  }

  run({ ok: true });
  assert(
    '父页面调用 C1 入口且参数完整',
    applyArgs &&
      applyArgs.seriesId === 's1' &&
      applyArgs.playerId === 'u1' &&
      applyArgs.rosterEntryId === 're-u1' &&
      applyArgs.actorUserId === 'creator-1' &&
      applyArgs.actor &&
      applyArgs.actor.userId === 'creator-1' &&
      applyArgs.expectedRegistrationRevision === 3
  );
  assert(
    '成功关闭、刷新并提示',
    refresh.join(',') === 'clear,close,reload' && toasts2.indexOf('已删除选手') >= 0
  );

  run({ ok: false, reason: 'finalized_score' });
  assert(
    'finalized 失败不伪造成功',
    toasts2.indexOf('已删除选手') < 0 &&
      toasts2.indexOf('fail:finalized_score') >= 0 &&
      refresh.join(',') === 'locks'
  );

  run({ ok: false, reason: 'managed_station_invalid' });
  assert(
    'managed 失败不伪造成功',
    toasts2.indexOf('已删除选手') < 0 &&
      toasts2.indexOf('fail:managed_station_invalid') >= 0 &&
      refresh.indexOf('close') < 0
  );

  run({ ok: false, reason: 'permission_denied' });
  assert(
    'permission 失败不伪造成功',
    toasts2.indexOf('fail:permission_denied') >= 0 && refresh.indexOf('reload') < 0
  );

  run({ ok: false, reason: 'registration_conflict' });
  assert(
    'revision 失败不伪造成功',
    toasts2.indexOf('fail:registration_conflict') >= 0 && refresh.indexOf('close') < 0
  );

  run({ ok: false, reason: 'storage_failed' });
  assert(
    'storage 失败不伪造成功',
    toasts2.indexOf('fail:storage_failed') >= 0 && refresh.indexOf('reload') < 0
  );

  page._adminPlayerRemoveLock = true;
  applyArgs = null;
  page._applyResult = { ok: true };
  var fnLocked = new Function(
    'seriesStore',
    'gameStore',
    'wx',
    'canApplyAdminPlayerRemoveResult',
    'return function (e) { ' +
      src[0]
        .replace(/^onSeriesRemovePlayer:\s*function\s*\(e\)\s*\{/, '')
        .replace(/\n  \},$/, '') +
      ' };'
  );
  fnLocked(
    seriesStore,
    gameStoreLocal,
    wxLocal,
    pageIndex.canApplyAdminPlayerRemoveResult
  ).call(page, { detail: { playerId: 'u1', rosterEntryId: 're-u1' } });
  assert('连点锁生效', applyArgs === null);

  var t1 = pageIndex.bumpAdminPlayerRemoveToken(0);
  var t2 = pageIndex.bumpAdminPlayerRemoveToken(t1);
  assert(
    '旧回调保护',
    t1 === 1 &&
      t2 === 2 &&
      pageIndex.canApplyAdminPlayerRemoveResult(t2, t1) === false &&
      pageIndex.canApplyAdminPlayerRemoveResult(t2, t2) === true
  );
})();

assert(
  '不调用旧的单站 Series remove/commit 路径',
  /_onSeriesRemovePlayer:[\s\S]*?onRemovePlayer:/.test(compJs) &&
    !/_onSeriesRemovePlayer:[\s\S]*?removePlayerFromDraft[\s\S]*?onRemovePlayer:/.test(
      compJs
    ) &&
    !/_onSeriesRemovePlayer:[\s\S]*?commitSeriesPlayerManageDraft[\s\S]*?onRemovePlayer:/.test(
      compJs
    ) &&
    /onSeriesRemovePlayer:[\s\S]{0,4000}commitSeriesPlayerManageDraft/.test(pageJs) ===
      false &&
    /onSeriesRemovePlayer:[\s\S]{0,4000}removePlayerFromDraft/.test(pageJs) === false &&
    compJs.indexOf("triggerEvent('series-remove-player'") >= 0 &&
    compJs.indexOf('不会影响系列赛报名名单') >= 0
);

teamMatchStore.getMatchById = origGet;
teamMatchStore.saveMatch = origSave;
gameStore.getCurrentUser = origUser;

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failures.length) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
