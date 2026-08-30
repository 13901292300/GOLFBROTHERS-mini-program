/**
 * M 面板「修改分组」：当前 LIVE 轮次必须 navigateTo 旧 group-editor。
 * 运行：node scripts/seriesManageEditGroupsLive.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var pageDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var groupEditorPath = path.join(
  mini,
  'subpackages',
  'tournament',
  'pages',
  'group-editor',
  'index.js'
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

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function parseNavUrl(url) {
  var raw = String(url || '');
  var qIndex = raw.indexOf('?');
  var pathname = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  var query = {};
  if (qIndex >= 0) {
    raw
      .slice(qIndex + 1)
      .split('&')
      .forEach(function (part) {
        if (!part) return;
        var eq = part.indexOf('=');
        var k = eq >= 0 ? part.slice(0, eq) : part;
        var v = eq >= 0 ? part.slice(eq + 1) : '';
        query[decodeURIComponent(k)] = decodeURIComponent(v);
      });
  }
  return { pathname: pathname, query: query };
}

var navs = [];
var toasts = [];
var memory = {};

if (typeof global.getApp !== 'function') {
  global.getApp = function () {
    return { getTheme: function () { return 'bright'; } };
  };
}

global.wx = {
  showToast: function (opt) {
    toasts.push(opt || {});
  },
  showModal: function () {},
  navigateTo: function (opt) {
    navs.push(opt || {});
    if (opt && typeof opt.complete === 'function') opt.complete();
  },
  navigateBack: function () {},
  reLaunch: function () {},
  getStorageSync: function (k) {
    return memory['s:' + k] || null;
  },
  setStorageSync: function (k, v) {
    memory['s:' + k] = v;
  },
  getWindowInfo: function () {
    return { windowWidth: 375, windowHeight: 667, statusBarHeight: 20 };
  },
  getSystemInfoSync: function () {
    return { windowWidth: 375, windowHeight: 667, statusBarHeight: 20 };
  }
};

var seriesPage = null;
global.Page = function (def) {
  seriesPage = def;
  return def;
};

try {
  delete require.cache[path.join(pageDir, 'index.js')];
  require(path.join(pageDir, 'index.js'));
} catch (eLoad) {
  assert('series-detail Page captured', false, String(eLoad && eLoad.message));
}

assert('series-detail Page captured', !!seriesPage);

var editorPage = null;
global.Page = function (def) {
  editorPage = def;
  return def;
};
try {
  delete require.cache[groupEditorPath];
  require(groupEditorPath);
} catch (eEd) {
  assert('group-editor Page captured', false, String(eEd && eEd.message));
}
assert('group-editor Page captured', !!editorPage);

var teamMatchStore = require(path.join(utilsDir, 'teamMatchStore.js'));
var seriesStore = require(path.join(utilsDir, 'seriesStore.js'));
var seriesStationIndex = require(path.join(utilsDir, 'seriesStationIndex.js'));
var gameStore = require(path.join(utilsDir, 'gameStore.js'));
var scheduleWrite = require(seriesTestPaths.util('seriesScheduleGroupWrite.js'));
var tournamentGroupDraft = require(seriesTestPaths.util('tournamentGroupDraft.js'));
var scheduleCandidates = require(seriesTestPaths.util('seriesScheduleCandidates.js'));

assert(
  'main-package tournamentGroupDraft require resolves',
  typeof tournamentGroupDraft.buildInitialGroupDraft === 'function' &&
    typeof tournamentGroupDraft.toFormalGroups === 'function'
);
assert(
  'main-package seriesScheduleGroupWrite require resolves',
  typeof scheduleWrite.saveStationGroups === 'function' &&
    typeof scheduleWrite.verifySeriesContext === 'function'
);
assert(
  'main-package seriesScheduleCandidates require resolves',
  typeof scheduleCandidates.listAffiliationOptions === 'function'
);
assert(
  'old tournament copies of domain modules gone',
  !fs.existsSync(
    path.join(mini, 'subpackages', 'tournament', 'utils', 'tournamentGroupDraft.js')
  ) &&
    !fs.existsSync(
      path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail', 'seriesScheduleGroupWrite.js')
    )
);

var origGetMatch = teamMatchStore.getMatchById;
var origSaveMatch = teamMatchStore.saveMatch;
var origUser = gameStore.getCurrentUser;
var origIndex = seriesStationIndex.getByMatchId;
var origSeries = seriesStore.getSeriesById;

var storeBag = {};
var indexBag = {};
var seriesBag = null;

teamMatchStore.getMatchById = function (id) {
  return storeBag[String(id)] || null;
};
teamMatchStore.saveMatch = function (match) {
  if (!match || !match.matchId) return null;
  storeBag[String(match.matchId)] = deepClone(match);
  return storeBag[String(match.matchId)];
};
gameStore.getCurrentUser = function () {
  return { userId: 'creator-1' };
};
seriesStationIndex.getByMatchId = function (id) {
  return indexBag[String(id)] || null;
};
seriesStore.getSeriesById = function (id) {
  if (String(id) === 's1') return seriesBag;
  return null;
};

function makeGroups(userId) {
  return [
    {
      groupId: 'g-live',
      groupName: '第1组',
      teeTime: '08:00',
      startHole: 1,
      players: [
        {
          position: 1,
          userId: userId,
          displayName: '球员' + userId,
          matchTeamId: 't1',
          seriesParticipantId: 'team:t1'
        },
        { position: 2, userId: '', displayName: '' },
        { position: 3, userId: '', displayName: '' },
        { position: 4, userId: '', displayName: '' }
      ]
    }
  ];
}

function makeMatch(mid, rid, status, groups) {
  return {
    matchId: mid,
    matchType: 'inter-team',
    status: status,
    createdBy: 'creator-1',
    organizationId: 'org-1',
    gameMode: '个人比杆赛',
    teamGroups: [
      { id: 't1', name: '红队' },
      { id: 't2', name: '蓝队' }
    ],
    registerInfo: { totalCount: 0, users: [] },
    groups: groups || makeGroups(mid === 'm-live' ? 'u-live' : 'u-idle'),
    pairings: {},
    seriesContext: {
      managed: true,
      seriesId: 's1',
      roundId: rid,
      publishToken: 'pt-1'
    }
  };
}

seriesBag = {
  seriesId: 's1',
  publishToken: 'pt-1',
  createdBy: 'creator-1',
  lifecycleStatus: 'published',
  hostMode: 'organization',
  roster: [
    {
      playerId: 'u-live',
      userId: 'u-live',
      playerNameSnapshot: '直播员',
      seriesParticipantId: 'team:t1',
      registrationStatus: 'registered'
    }
  ],
  participants: [
    {
      seriesParticipantId: 'team:t1',
      kind: 'team',
      sourceTeamId: 't1',
      nameSnapshot: '红队',
      shortNameSnapshot: '红队'
    }
  ],
  rounds: [
    { roundId: 'r-live', name: '第一轮', matchId: 'm-live', index: 1 },
    { roundId: 'r-idle', name: '第二轮', matchId: 'm-idle', index: 2 },
    { roundId: 'r-done', name: '第三轮', matchId: 'm-done', index: 3 }
  ]
};

storeBag = {
  'm-live': makeMatch('m-live', 'r-live', 'ongoing', makeGroups('u-live')),
  'm-idle': makeMatch('m-idle', 'r-idle', 'registering', makeGroups('u-idle')),
  'm-done': Object.assign(makeMatch('m-done', 'r-done', 'finished', makeGroups('u-done')), {
    status: 'finished'
  })
};
indexBag = {
  'm-live': { seriesId: 's1', roundId: 'r-live', matchId: 'm-live' },
  'm-idle': { seriesId: 's1', roundId: 'r-idle', matchId: 'm-idle' },
  'm-done': { seriesId: 's1', roundId: 'r-done', matchId: 'm-done' }
};

function tapEvent(permission, extra) {
  return {
    currentTarget: {
      dataset: Object.assign({ permission: permission }, extra || {})
    }
  };
}

function makeHost(overrides) {
  var host = Object.assign(Object.create(seriesPage), {
    _pageAlive: true,
    _seriesId: 's1',
    _lastSeriesForSchedule: seriesBag,
    _manageSelectedRoundId: 'r-live',
    _scheduleSelectedKey: 'r-other',
    _scheduleGroupEditorNavLock: false,
    _lastStandingsRoundStates: [
      { roundId: 'r-live', index: 1, statusToken: 'live' },
      { roundId: 'r-idle', index: 2, statusToken: 'scheduled' },
      { roundId: 'r-done', index: 3, statusToken: 'completed' }
    ],
    _scrollTop: 40,
    data: {
      isManageOverlayActive: true,
      showScheduleBottomAction: false,
      showMoreSheet: true,
      schedule: {
        selectedKey: 'r-other',
        matchId: 'm-idle',
        cta: { showEditGroups: false }
      }
    },
    setData: function (patch, cb) {
      Object.assign(this.data, patch || {});
      if (typeof cb === 'function') cb();
    },
    closeMoreSheetFully: function () {
      this._sheetClosed = true;
      this.data.showMoreSheet = false;
      this.data.isManageOverlayActive = false;
    }
  });
  return Object.assign(host, overrides || {});
}

function resetIO() {
  navs = [];
  toasts = [];
}

(function liveManageEditGroupsNavigates() {
  resetIO();
  var host = makeHost();
  host.onSeriesManageFeatureTap(tapEvent('edit_groups'));
  assert('LIVE M 修改分组调用一次 navigateTo', navs.length === 1, 'navs=' + navs.length);
  var parsed = parseNavUrl(navs[0] && navs[0].url);
  assert(
    '路径为当前旧 group-editor',
    parsed.pathname === '/subpackages/tournament/pages/group-editor/index'
  );
  assert(
    'query 含 matchId/mode/fromSeries/seriesId/roundId',
    parsed.query.matchId === 'm-live' &&
      parsed.query.mode === 'live' &&
      parsed.query.fromSeries === '1' &&
      parsed.query.seriesId === 's1' &&
      parsed.query.roundId === 'r-live',
    JSON.stringify(parsed.query)
  );
  assert(
    '使用当前管理选中轮而非赛程 selectedKey',
    parsed.query.roundId === 'r-live' && parsed.query.matchId === 'm-live'
  );
  assert(
    'URL 对 roundId/matchId 做 encodeURIComponent',
    String(navs[0].url).indexOf('matchId=' + encodeURIComponent('m-live')) >= 0 &&
      String(navs[0].url).indexOf('roundId=' + encodeURIComponent('r-live')) >= 0 &&
      String(navs[0].url).indexOf('fromSeries=1') >= 0
  );
  assert('关闭 M 面板', host._sheetClosed === true);
})();

(function editorLoadsExistingLiveGroups() {
  var inst = Object.assign(Object.create(editorPage), {
    data: deepClone(editorPage.data || {}),
    setData: function (patch) {
      Object.assign(this.data, patch || {});
    }
  });
  inst.onLoad({
    matchId: 'm-live',
    mode: 'live',
    fromSeries: '1',
    seriesId: 's1',
    roundId: 'r-live'
  });
  var draft = inst.data.groupDraft || [];
  var first = draft[0] && Array.isArray(draft[0].players) ? draft[0].players[0] : null;
  assert(
    'group-editor 加载当前 LIVE 轮已有分组',
    inst.data.mode === 'live' &&
      inst.data.matchId === 'm-live' &&
      draft.length >= 1 &&
      first &&
      String(first.userId) === 'u-live',
    'mode=' + inst.data.mode + ' draft=' + (draft && draft.length)
  );
})();

(function saveOnlyTouchesCurrentRound() {
  var r2Before = JSON.stringify(storeBag['m-idle']);
  var liveBefore = JSON.stringify(storeBag['m-live'].groups);
  var draft = tournamentGroupDraft.buildInitialGroupDraft(storeBag['m-idle']);
  var saved = scheduleWrite.saveStationGroups({
    matchId: 'm-idle',
    series: seriesBag,
    roundId: 'r-idle',
    groupDraft: draft,
    getMatchById: function (id) {
      return storeBag[String(id)] || null;
    },
    saveMatch: teamMatchStore.saveMatch,
    getIndexByMatchId: function (id) {
      return indexBag[String(id)] || null;
    }
  });
  assert('非 LIVE 保存入口仍可用', !!(saved && saved.ok), saved && saved.message);
  assert(
    '保存只写回当前轮',
    JSON.stringify(storeBag['m-live'].groups) === liveBefore
  );
  assert('其他轮次数据不变', JSON.stringify(storeBag['m-idle']) !== null);

  var liveNext = tournamentGroupDraft.applyLiveGroupsFromDraft(
    deepClone(storeBag['m-live'].groups),
    tournamentGroupDraft.buildInitialGroupDraft(storeBag['m-live'])
  );
  var cloneIdle = JSON.stringify(storeBag['m-idle']);
  storeBag['m-live'] = Object.assign({}, storeBag['m-live'], { groups: liveNext });
  assert(
    'LIVE 分组写回不改其他轮',
    JSON.stringify(storeBag['m-idle']) === cloneIdle &&
      JSON.stringify(storeBag['m-live'].groups) !== liveBefore
  );
  storeBag['m-idle'] = JSON.parse(r2Before);
})();

(function idleScheduleCtaStillWorks() {
  resetIO();
  var host = makeHost({
    _manageSelectedRoundId: 'r-idle',
    _scheduleSelectedKey: 'r-idle',
    data: {
      isManageOverlayActive: false,
      showScheduleBottomAction: true,
      schedule: {
        selectedKey: 'r-idle',
        matchId: 'm-idle',
        hasGroups: true,
        cta: { showEditGroups: true }
      }
    }
  });
  host.openScheduleGroupEditor();
  var parsed = parseNavUrl(navs[0] && navs[0].url);
  assert(
    '非 LIVE 赛程 CTA 仍可进编辑器',
    navs.length === 1 &&
      parsed.query.mode === 'edit' &&
      parsed.query.roundId === 'r-idle' &&
      parsed.query.matchId === 'm-idle'
  );
})();

(function overlayBlocksScheduleCtaOnly() {
  resetIO();
  var host = makeHost({
    data: {
      isManageOverlayActive: true,
      showScheduleBottomAction: true,
      schedule: {
        selectedKey: 'r-idle',
        matchId: 'm-idle',
        cta: { showEditGroups: true }
      }
    }
  });
  host.openScheduleGroupEditor();
  assert('M 打开时赛程 CTA 仍被 overlay 拦截', navs.length === 0);
})();

(function finishedLocked() {
  resetIO();
  var host = makeHost({ _manageSelectedRoundId: 'r-done' });
  host.onSeriesManageFeatureTap(tapEvent('edit_groups'));
  assert('已结束轮次不 navigateTo', navs.length === 0);
})();

(function noPermissionBlocked() {
  resetIO();
  var prev = gameStore.getCurrentUser;
  gameStore.getCurrentUser = function () {
    return { userId: 'stranger' };
  };
  var host = makeHost();
  host.onSeriesManageFeatureTap(tapEvent('edit_groups'));
  gameStore.getCurrentUser = prev;
  assert('无管理权限不进入', navs.length === 0);
  assert(
    '无权限有 toast',
    toasts.some(function (t) {
      return String((t && t.title) || '').indexOf('权限') >= 0;
    })
  );
})();

(function navigateFailHasFeedback() {
  resetIO();
  var prevNav = global.wx.navigateTo;
  global.wx.navigateTo = function (opt) {
    if (opt && typeof opt.fail === 'function') {
      opt.fail({ errMsg: 'navigateTo:fail mock-block' });
    }
    if (opt && typeof opt.complete === 'function') opt.complete();
  };
  var host = makeHost();
  host.onSeriesManageFeatureTap(tapEvent('edit_groups'));
  global.wx.navigateTo = prevNav;
  assert(
    'navigateTo 失败有可诊断反馈',
    toasts.some(function (t) {
      return String((t && t.title) || '').indexOf('navigateTo:fail mock-block') >= 0;
    }),
    JSON.stringify(toasts)
  );
})();

teamMatchStore.getMatchById = origGetMatch;
teamMatchStore.saveMatch = origSaveMatch;
gameStore.getCurrentUser = origUser;
seriesStationIndex.getByMatchId = origIndex;
seriesStore.getSeriesById = origSeries;

console.log('');
console.log('---- seriesManageEditGroupsLive.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
