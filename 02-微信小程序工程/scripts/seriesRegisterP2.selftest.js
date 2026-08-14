/**
 * REG-P2：Series 替他人报名反馈 / 代取消写路径
 * 不写生产 storage；不进 DevTools；不进入管理员选手管理。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesRegisterP2.selftest.js
 */

var path = require('path');
var fs = require('fs');

if (typeof global.wx === 'undefined') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    removeStorageSync: function () {}
  };
}

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var pageDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');
var friendsDir = path.join(mini, 'subpackages', 'player', 'pages', 'friends');

var registrationInteractionModel = require(path.join(
  utilsDir,
  'registrationInteractionModel.js'
));
var proxyRegistrationState = require(path.join(utilsDir, 'proxyRegistrationState.js'));
var seriesRegistration = require(path.join(utilsDir, 'seriesRegistration.js'));
var proxyVm = require(path.join(pageDir, 'seriesProxyRegisterViewModel.js'));
var sheetVm = require(path.join(pageDir, 'seriesManageSheetViewModel.js'));

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var detailJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');
var friendsJs = fs.readFileSync(path.join(friendsDir, 'index.js'), 'utf8');
var regSrc = fs.readFileSync(path.join(utilsDir, 'seriesRegistration.js'), 'utf8');
var modelSrc = fs.readFileSync(path.join(utilsDir, 'seriesModel.js'), 'utf8');

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

function pickManagedSlice(match) {
  var m = match && typeof match === 'object' ? match : {};
  return {
    registerInfo: m.registerInfo || null,
    registrationStatus: m.registrationStatus || '',
    groups: m.groups || [],
    pairings: m.pairings || [],
    scores: m.scores || null,
    payment: m.payment || null,
    schedules: m.schedules || null
  };
}

function createMemoryStore(initial) {
  var mem = Object.create(null);
  if (initial && initial.seriesId) mem[initial.seriesId] = freeze(initial);
  return {
    getSeriesById: function (id) {
      return mem[id] ? freeze(mem[id]) : null;
    },
    upsertSeriesChecked: function (series, expected) {
      var id = series && series.seriesId;
      var cur = mem[id];
      var curRev = cur ? Number(cur.registrationRevision) || 0 : 0;
      if (cur && Number(expected) !== curRev) {
        return { ok: false, reason: 'registration_conflict', currentRevision: curRev };
      }
      mem[id] = freeze(series);
      return { ok: true, series: freeze(series) };
    }
  };
}

function basePublishedSeries(overrides) {
  return Object.assign(
    {
      seriesId: 'series-p2',
      lifecycleStatus: 'published',
      publishState: 'published',
      hostMode: 'organization',
      registrationState: 'open',
      registrationRevision: 1,
      competitionPhaseCache: 'registration',
      createdBy: 'creator-1',
      participants: [
        {
          seriesParticipantId: 'team:1',
          kind: 'team',
          sourceTeamId: '1',
          nameSnapshot: '甲队',
          shortNameSnapshot: '甲'
        },
        {
          seriesParticipantId: 'team:2',
          kind: 'team',
          sourceTeamId: '2',
          nameSnapshot: '乙队',
          shortNameSnapshot: '乙'
        }
      ],
      roster: []
    },
    overrides || {}
  );
}

function createService(store, canProxy) {
  var allowProxy = canProxy !== false;
  return seriesRegistration.createSeriesRegistrationService({
    seriesStore: store,
    resolveEligibleParticipantIds: function () {
      return { ok: true, ids: ['team:1', 'team:2'] };
    },
    canManageRegistration: function () {
      return { allowed: false };
    },
    canRegisterForOther: function () {
      return { allowed: allowProxy };
    },
    now: function () {
      return '2026-08-14T01:00:00.000Z';
    }
  });
}

function proxyPlayer(id, name) {
  return {
    playerId: id,
    userId: id,
    competitionName: name || id,
    gender: '男',
    phone: ''
  };
}

var closedModal = registrationInteractionModel.buildRegistrationClosedModal();
assert(
  'closed 按钮不置灰；点击共享 Modal 不是 toast',
  (function () {
    var closedSheet = sheetVm.buildSeriesManageSheetViewModel({
      series: basePublishedSeries({ registrationState: 'closed' }),
      user: { userId: 'op1' },
      canManageSeries: false,
      canRegisterForOther: true
    });
    var feat = closedSheet.seriesScope.featuresCommon.filter(function (f) {
      return f.permission === 'register_for_other';
    })[0];
    return (
      feat &&
      !feat.disabled &&
      pageJs.indexOf('_showRegistrationClosedModal') >= 0 &&
      /openProxyRegisterSheet:[\s\S]{0,1400}_showRegistrationClosedModal/.test(pageJs) &&
      /openProxyRegisterSheet:[\s\S]{0,800}title:\s*'报名通道已关闭'/.test(pageJs) ===
        false &&
      closedModal.title === '报名通道已关闭' &&
      closedModal.content === '报名通道已关闭，请联系组织者' &&
      closedModal.confirmText === '知道了'
    );
  })()
);

assert(
  'Series 整体 completed 隐藏入口且页面/领域拦截；单轮 completed 不影响',
  (function () {
    var doneSheet = sheetVm.buildSeriesManageSheetViewModel({
      series: basePublishedSeries({ competitionPhaseCache: 'completed' }),
      user: { userId: 'op1' },
      canManageSeries: false,
      canRegisterForOther: true
    });
    var liveSheet = sheetVm.buildSeriesManageSheetViewModel({
      series: basePublishedSeries({
        competitionPhaseCache: 'live',
        rounds: [{ status: 'completed' }, { status: 'live' }]
      }),
      user: { userId: 'op1' },
      canManageSeries: false,
      canRegisterForOther: true
    });
    var doneFeat = doneSheet.seriesScope.featuresCommon.some(function (f) {
      return f.permission === 'register_for_other';
    });
    var liveFeat = liveSheet.seriesScope.featuresCommon.some(function (f) {
      return f.permission === 'register_for_other' && !f.disabled;
    });
    return (
      doneFeat === false &&
      liveFeat === true &&
      /openProxyRegisterSheet:[\s\S]{0,900}_showOrdinaryFinishedUnavailable/.test(
        pageJs
      ) &&
      pageJs.indexOf("title: '功能开发中'") >= 0 &&
      pageJs.indexOf('_isSeriesOverallCompleted') >= 0
    );
  })()
);

assert(
  '好友/成员页共用同一三态纯函数',
  friendsJs.indexOf('proxyRegistrationState') >= 0 &&
    friendsJs.indexOf('resolveProxyRegistrationState') >= 0 &&
    proxyVm.resolveProxyRegistrationState ===
      proxyRegistrationState.resolveProxyRegistrationState &&
    proxyRegistrationState.resolveProxyRegistrationStateFromEntry(
      {
        registrationStatus: 'registered',
        registrationSource: 'proxy',
        registeredByUserId: 'op1'
      },
      'op1'
    ) === 'registered_by_me' &&
    proxyRegistrationState.resolveProxyRegistrationStateFromEntry(
      {
        registrationStatus: 'registered',
        registrationSource: 'self',
        registeredByUserId: 'op1'
      },
      'op1'
    ) === 'registered_locked' &&
    proxyRegistrationState.resolveProxyRegistrationStateFromEntry(
      {
        registrationStatus: 'registered',
        registrationSource: 'proxy',
        registeredByUserId: 'other'
      },
      'op1'
    ) === 'registered_locked' &&
    proxyRegistrationState.resolveProxyRegistrationStateFromEntry(
      {
        registrationStatus: 'registered',
        registrationSource: 'proxy',
        registeredByUserId: ''
      },
      'op1'
    ) === 'registered_locked' &&
    proxyRegistrationState.resolveProxyRegistrationStateFromEntry(
      {
        registrationStatus: 'cancelled',
        registrationSource: 'proxy',
        registeredByUserId: 'op1'
      },
      'op1'
    ) === 'unregistered'
);

var matches = {
  m1: {
    matchId: 'm1',
    registerInfo: { users: [{ userId: 'station-user' }] },
    registrationStatus: 'open',
    groups: [{ groupId: 'g1' }],
    pairings: [{ hole: 1 }],
    scores: { a: 1 },
    payment: { a: { status: 'paid' } },
    schedules: [{ tee: 1 }]
  }
};
var frozenMatches = freeze(matches);

var store = createMemoryStore(
  basePublishedSeries({
    rounds: [{ managedMatchId: 'm1', status: 'completed' }]
  })
);
var svc = createService(store);
var op = { playerId: 'op1', userId: 'op1', name: '操作者' };

var addOnly = svc.applyProxyCommitPlan({
  seriesId: 'series-p2',
  expectedRegistrationRevision: 1,
  actor: op,
  seriesParticipantId: 'team:1',
  removals: [],
  additions: [proxyPlayer('p-a', '甲')]
});
assert(
  '仅 additions：proxy 写入 + revision+1',
  addOnly.ok &&
    addOnly.addedCount === 1 &&
    addOnly.removedCount === 0 &&
    addOnly.series.registrationRevision === 2 &&
    addOnly.series.roster[0].registrationSource === 'proxy' &&
    addOnly.series.roster[0].registeredByUserId === 'op1'
);

var closedStore = createMemoryStore(
  basePublishedSeries({ registrationState: 'closed', registrationRevision: 3 })
);
var closedSvc = createService(closedStore);
assert(
  'closed 零写入',
  closedSvc.applyProxyCommitPlan({
    seriesId: 'series-p2',
    expectedRegistrationRevision: 3,
    actor: op,
    seriesParticipantId: 'team:1',
    additions: [proxyPlayer('p-closed')]
  }).reason === 'registration_closed' &&
    closedStore.getSeriesById('series-p2').registrationRevision === 3 &&
    (closedStore.getSeriesById('series-p2').roster || []).length === 0
);

var doneStore = createMemoryStore(
  basePublishedSeries({ competitionPhaseCache: 'completed' })
);
assert(
  'overall completed 不可写入代报名/代取消',
  createService(doneStore).applyProxyCommitPlan({
    seriesId: 'series-p2',
    expectedRegistrationRevision: 1,
    actor: op,
    seriesParticipantId: 'team:1',
    additions: [proxyPlayer('p-done')]
  }).reason === 'series_completed' &&
    createService(doneStore).cancelRegistrationForOther({
      seriesId: 'series-p2',
      expectedRegistrationRevision: 1,
      actor: op,
      playerId: 'p-a'
    }).reason === 'series_completed'
);

var liveStore = createMemoryStore(
  basePublishedSeries({
    competitionPhaseCache: 'live',
    rounds: [{ status: 'completed' }, { status: 'live' }]
  })
);
assert(
  'live+open 且存在已结束轮次仍可代报名',
  createService(liveStore).applyProxyCommitPlan({
    seriesId: 'series-p2',
    expectedRegistrationRevision: 1,
    actor: op,
    seriesParticipantId: 'team:1',
    additions: [proxyPlayer('p-live', '直播')]
  }).ok === true
);

var entryId = addOnly.series.roster[0].rosterEntryId;
var createdAt = addOnly.series.roster[0].createdAt;
var cancelOwn = svc.cancelRegistrationForOther({
  seriesId: 'series-p2',
  expectedRegistrationRevision: 2,
  actor: op,
  rosterEntryId: entryId,
  playerId: 'p-a'
});
assert(
  '原操作者取消自己代报：软取消且快照保留',
  cancelOwn.ok &&
    cancelOwn.series.registrationRevision === 3 &&
    cancelOwn.series.roster.length === 1 &&
    cancelOwn.series.roster[0].registrationStatus === 'cancelled' &&
    cancelOwn.series.roster[0].rosterEntryId === entryId &&
    cancelOwn.series.roster[0].playerId === 'p-a' &&
    cancelOwn.series.roster[0].seriesParticipantId === 'team:1' &&
    cancelOwn.series.roster[0].registrationSource === 'proxy' &&
    cancelOwn.series.roster[0].registeredByUserId === 'op1' &&
    cancelOwn.series.roster[0].createdAt === createdAt &&
    !!cancelOwn.series.roster[0].cancelledAt
);

var restore = svc.applyProxyCommitPlan({
  seriesId: 'series-p2',
  expectedRegistrationRevision: 3,
  actor: { playerId: 'op2', userId: 'op2', name: '另一人' },
  seriesParticipantId: 'team:1',
  additions: [proxyPlayer('p-a', '甲-新')]
});
assert(
  '软取消后重新代报：复用旧 entry，更新 registeredBy，无重复 active',
  restore.ok &&
    restore.series.roster.filter(function (e) {
      return e.registrationStatus === 'registered' && e.playerId === 'p-a';
    }).length === 1 &&
    restore.series.roster.length === 1 &&
    restore.series.roster[0].rosterEntryId === entryId &&
    restore.series.roster[0].registeredByUserId === 'op2' &&
    restore.series.roster[0].playerNameSnapshot === '甲-新'
);

var users = proxyVm.buildProxyRegisterUsersFromRoster(restore.series, 'op1');
assert(
  'cancelled 历史不投影为已报名锁定；当前 active 对非原操作者锁定',
  users.length === 1 &&
    users[0].locked === true &&
    users[0].registrationState === 'registered_locked'
);

assert(
  '其他普通用户 / 创建者 / 主办管理员 非原操作者均拒绝',
  (function () {
    var stranger = svc.cancelRegistrationForOther({
      seriesId: 'series-p2',
      expectedRegistrationRevision: 4,
      actor: { playerId: 'stranger', userId: 'stranger' },
      playerId: 'p-a'
    });
    var creator = svc.cancelRegistrationForOther({
      seriesId: 'series-p2',
      expectedRegistrationRevision: 4,
      actor: { playerId: 'creator-1', userId: 'creator-1' },
      playerId: 'p-a'
    });
    var adminStore = createMemoryStore(restore.series);
    var adminSvc = seriesRegistration.createSeriesRegistrationService({
      seriesStore: adminStore,
      resolveEligibleParticipantIds: function () {
        return { ok: true, ids: ['team:1', 'team:2'] };
      },
      canManageRegistration: function () {
        return { allowed: true };
      },
      canRegisterForOther: function () {
        return { allowed: true };
      }
    });
    var admin = adminSvc.cancelRegistrationForOther({
      seriesId: 'series-p2',
      expectedRegistrationRevision: 4,
      actor: { playerId: 'host-admin', userId: 'host-admin' },
      playerId: 'p-a'
    });
    return (
      stranger.reason === 'not_registered_by_me' &&
      creator.reason === 'not_registered_by_me' &&
      admin.reason === 'not_registered_by_me' &&
      adminStore.getSeriesById('series-p2').registrationRevision === 4
    );
  })()
);

var selfStore = createMemoryStore(
  basePublishedSeries({
    roster: [
      {
        rosterEntryId: 'e-self',
        seriesId: 'series-p2',
        seriesParticipantId: 'team:1',
        playerId: 'self-1',
        registrationStatus: 'registered',
        registrationSource: 'self',
        registeredByUserId: 'self-1',
        createdAt: 't0'
      },
      {
        rosterEntryId: 'e-other-proxy',
        seriesId: 'series-p2',
        seriesParticipantId: 'team:1',
        playerId: 'p-b',
        registrationStatus: 'registered',
        registrationSource: 'proxy',
        registeredByUserId: 'someone-else',
        createdAt: 't1'
      },
      {
        rosterEntryId: 'e-legacy',
        seriesId: 'series-p2',
        seriesParticipantId: 'team:1',
        playerId: 'p-c',
        registrationStatus: 'registered',
        registrationSource: 'proxy',
        registeredByUserId: '',
        createdAt: 't2'
      }
    ]
  })
);
var selfSvc = createService(selfStore);
assert(
  'self / 他人 proxy / 缺 registeredBy 均锁定且领域拒绝',
  selfSvc.cancelRegistrationForOther({
    seriesId: 'series-p2',
    expectedRegistrationRevision: 1,
    actor: op,
    playerId: 'self-1'
  }).reason === 'not_proxy' &&
    selfSvc.cancelRegistrationForOther({
      seriesId: 'series-p2',
      expectedRegistrationRevision: 1,
      actor: op,
      playerId: 'p-b'
    }).reason === 'not_registered_by_me' &&
    selfSvc.cancelRegistrationForOther({
      seriesId: 'series-p2',
      expectedRegistrationRevision: 1,
      actor: op,
      playerId: 'p-c'
    }).reason === 'not_registered_by_me'
);

var planStore = createMemoryStore(
  basePublishedSeries({
    roster: [
      {
        rosterEntryId: 'e-keep',
        seriesId: 'series-p2',
        seriesParticipantId: 'team:1',
        playerId: 'p-old',
        playerNameSnapshot: '旧',
        registrationStatus: 'registered',
        registrationSource: 'proxy',
        registeredByUserId: 'op1',
        createdAt: 't-old'
      }
    ]
  })
);
var planSvc = createService(planStore);
var mixed = planSvc.applyProxyCommitPlan({
  seriesId: 'series-p2',
  expectedRegistrationRevision: 1,
  actor: op,
  seriesParticipantId: 'team:2',
  removals: [{ rosterEntryId: 'e-keep', playerId: 'p-old' }],
  additions: [proxyPlayer('p-new', '新')]
});
assert(
  '同时 add + remove：一次 revision+1，无半写',
  mixed.ok &&
    mixed.addedCount === 1 &&
    mixed.removedCount === 1 &&
    mixed.series.registrationRevision === 2 &&
    mixed.series.roster.filter(function (e) {
      return e.registrationStatus === 'registered';
    }).length === 1 &&
    mixed.series.roster.some(function (e) {
      return e.playerId === 'p-old' && e.registrationStatus === 'cancelled';
    }) &&
    mixed.series.roster.some(function (e) {
      return e.playerId === 'p-new' && e.registrationStatus === 'registered';
    })
);

var noChange = planSvc.applyProxyCommitPlan({
  seriesId: 'series-p2',
  expectedRegistrationRevision: 2,
  actor: op,
  seriesParticipantId: 'team:2',
  removals: [],
  additions: [proxyPlayer('p-new', '新')]
});
assert(
  '没有变化 / 重复点击：不 bump revision',
  noChange.ok &&
    noChange.idempotent === true &&
    noChange.reason === 'no_change' &&
    noChange.series.registrationRevision === 2
);

var conflict = planSvc.applyProxyCommitPlan({
  seriesId: 'series-p2',
  expectedRegistrationRevision: 1,
  actor: op,
  removals: [{ rosterEntryId: 'e-keep', playerId: 'p-old' }]
});
assert(
  'revision 冲突不伪造成功',
  conflict.ok === false && conflict.reason === 'registration_conflict'
);

var gone = planSvc.cancelRegistrationForOther({
  seriesId: 'series-p2',
  expectedRegistrationRevision: 2,
  actor: op,
  rosterEntryId: 'e-keep',
  playerId: 'p-old'
});
assert(
  '目标已被取消：拒绝且不伪造整体成功',
  gone.ok === false && gone.reason === 'not_registered'
);

assert(
  '报名后 managed matches 深比较不变',
  JSON.stringify(pickManagedSlice(matches.m1)) ===
    JSON.stringify(pickManagedSlice(frozenMatches.m1))
);

assert(
  '页面走批量计划；遇 removals 不再提前 return；无新 UI',
  pageJs.indexOf('_applySeriesProxyCommitPlan') >= 0 &&
    pageJs.indexOf('_buildSeriesProxyRemovePlan') >= 0 &&
    pageJs.indexOf('系列赛暂不支持在此取消代报名') < 0 &&
    /_onSeriesProxyFriendsSelected:[\s\S]{0,1600}_applySeriesProxyCommitPlan/.test(
      pageJs
    ) &&
    pageJs.indexOf('applyProxyCommitPlan') >= 0 &&
    pageJs.indexOf('代报名已更新') >= 0 &&
    pageJs.indexOf('没有可更新的报名') >= 0 &&
    pageWxml.indexOf('player-source-sheet') >= 0 &&
    pageJs.indexOf('buildPaidCancellationWarningModel') < 0 &&
    /_buildSeriesProxyRemovePlan:[\s\S]{0,2200}grouped:\s*true/.test(pageJs) ===
      false &&
    detailJs.indexOf('_buildProxyRemovePlan') >= 0 &&
    detailJs.indexOf('_applyProxyCommitPlan') >= 0 &&
    /function cancelRegistrationForOther[\s\S]{0,2000}teamMatchStore/.test(regSrc) ===
      false &&
    modelSrc.indexOf('cancelledByUserId') < 0
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
