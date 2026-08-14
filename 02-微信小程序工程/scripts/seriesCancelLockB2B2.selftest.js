/**
 * SERIES-CANCEL-LOCK-B2B2：原代报名人代取消 · 页面接线与列表置灰
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesCancelLockB2B2.selftest.js
 */

var path = require('path');
var fs = require('fs');

if (typeof global.Page !== 'function') {
  global.Page = function (cfg) {
    return cfg;
  };
}
if (typeof global.wx === 'undefined') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    removeStorageSync: function () {},
    getSystemInfoSync: function () {
      return { windowWidth: 375, windowHeight: 667 };
    },
    showToast: function () {}
  };
}

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var pageDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');
var friendsDir = path.join(mini, 'subpackages', 'player', 'pages', 'friends');
var membersDir = path.join(mini, 'subpackages', 'player', 'pages', 'team-members');
var utilsDir = path.join(mini, 'utils');

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
var detailJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');
var friendsJs = fs.readFileSync(path.join(friendsDir, 'index.js'), 'utf8');
var membersJs = fs.existsSync(path.join(membersDir, 'index.js'))
  ? fs.readFileSync(path.join(membersDir, 'index.js'), 'utf8')
  : '';
var pageIndex = require(path.join(pageDir, 'index.js'));
var seriesStationManageGate = require(path.join(utilsDir, 'seriesStationManageGate.js'));

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

function mineProxy(overrides) {
  return Object.assign(
    {
      rosterEntryId: 're-p2',
      userId: 'p2',
      playerId: 'p2',
      registrationStatus: 'registered',
      registrationSource: 'proxy',
      source: 'proxy',
      registeredBy: 'op1',
      registrationState: 'registered_by_me',
      locked: false,
      disabled: false,
      canSelfCancel: true
    },
    overrides || {}
  );
}

assert(
  '只接线 series-detail：复用同一编排器，不改好友/成员/WXML/WXSS/普通 detail',
  pageJs.indexOf('inspectProxyCancellationImpact') >= 0 &&
    pageJs.indexOf('applyProxyCommitPlanWithStationCleanup') >= 0 &&
    pageJs.indexOf('projectProxyRegisterUsersWithCancelLocks') >= 0 &&
    /createSeriesSelfCancellationOrchestrator\s*\(/.test(pageJs) &&
    (pageJs.split('createSeriesSelfCancellationOrchestrator').length - 1) === 1 &&
    pageJs.indexOf('_recoverInterruptedSelfCancellationOnce') >= 0 &&
    pageJs.indexOf('inspectProxyCancellationBatchImpact') < 0 &&
    pageJs.indexOf('cancelProxyRegistrationWithStationCleanup') < 0 &&
    friendsJs.indexOf('inspectProxyCancellationImpact') < 0 &&
    friendsJs.indexOf('applyProxyCommitPlanWithStationCleanup') < 0 &&
    membersJs.indexOf('inspectProxyCancellationImpact') < 0 &&
    pageWxml.indexOf('inspectProxyCancellationImpact') < 0 &&
    pageWxss.indexOf('proxyCancelLock') < 0 &&
    detailJs.indexOf('applyProxyCommitPlanWithStationCleanup') < 0 &&
    detailJs.indexOf('inspectProxyCancellationImpact') < 0
);

assert(
  '好友与球队成员共用同一 builder；每次打开重算',
  /_openRegisterForOtherFriendsPicker:[\s\S]{0,800}_buildSeriesProxyRegisterUsers/.test(
    pageJs
  ) &&
    /_navigateProxyTeamMembersPicker:[\s\S]{0,800}_buildSeriesProxyRegisterUsers/.test(
      pageJs
    ) &&
    /_buildSeriesProxyRegisterUsers:[\s\S]{0,900}inspectProxyCancellationImpact/.test(
      pageJs
    ) &&
    /_buildSeriesProxyRegisterUsers:[\s\S]{0,1200}projectProxyRegisterUsersWithCancelLocks/.test(
      pageJs
    )
);

assert(
  '提交改走编排器批量入口，不再直接 applyProxyCommitPlan',
  /_applySeriesProxyCommitPlan:[\s\S]{0,4500}_selfCancelOrchestrator\.applyProxyCommitPlanWithStationCleanup\(/.test(
    pageJs
  ) &&
    /_applySeriesProxyCommitPlan:[\s\S]{0,4500}_registrationService\.applyProxyCommitPlan\(/.test(
      pageJs
    ) === false &&
    /_applySeriesProxyCommitPlan:[\s\S]{0,4500}removals:\s*removals/.test(pageJs) &&
    /_applySeriesProxyCommitPlan:[\s\S]{0,4500}additions:\s*additions/.test(pageJs) &&
    /_applySeriesProxyCommitPlan:[\s\S]{0,4500}seriesParticipantId:\s*targetPid/.test(
      pageJs
    ) &&
    /_applySeriesProxyCommitPlan:[\s\S]{0,4500}expectedRegistrationRevision:\s*expectedRevision/.test(
      pageJs
    ) &&
    /_applySeriesProxyCommitPlan:[\s\S]{0,4500}actor:\s*\{/.test(pageJs) &&
    pageJs.indexOf('代报名已更新') >= 0 &&
    /finalized_score:\s*SELF_CANCEL_CTA_FINALIZED/.test(pageJs)
);

(function () {
  var user = mineProxy();
  var next = pageIndex.projectProxyCancelLockUser(user, {
    ok: false,
    blockedReason: 'finalized_score'
  });
  assert(
    'finalized 原代报对象投影为已选且 locked',
    next.selected === true &&
      next.locked === true &&
      next.disabled === true &&
      next.canSelfCancel === false &&
      next.registrationState === 'registered_locked' &&
      next.lockReason === 'finalized_score' &&
      next.lockMessage === '已有完赛成绩，不可取消报名' &&
      next.lockMessage === pageIndex.SELF_CANCEL_CTA_FINALIZED
  );
})();

(function () {
  var user = mineProxy({ playerId: 'p3', userId: 'p3', rosterEntryId: 're-p3' });
  var next = pageIndex.projectProxyCancelLockUser(user, {
    ok: false,
    blockedReason: 'managed_station_invalid'
  });
  assert(
    'managed 异常对象 locked',
    next.locked === true &&
      next.disabled === true &&
      next.selected === true &&
      next.lockReason === 'managed_station_invalid' &&
      next.lockMessage === seriesStationManageGate.GATE_FAIL_MESSAGE &&
      next.lockMessage === '本轮比赛数据异常'
  );
})();

(function () {
  var user = mineProxy();
  var live = pageIndex.projectProxyCancelLockUser(user, {
    ok: true,
    blockedReason: ''
  });
  var liveScore = pageIndex.projectProxyCancelLockUser(user, {
    ok: false,
    blockedReason: 'player_has_real_score'
  });
  assert(
    'LIVE 有成绩仍可反选',
    live.locked === false &&
      live.canSelfCancel === true &&
      live.registrationState === 'registered_by_me' &&
      liveScore.locked === false &&
      liveScore.registrationState === 'registered_by_me'
  );
})();

(function () {
  var user = mineProxy();
  var next = pageIndex.projectProxyCancelLockUser(user, {
    ok: true,
    blockedReason: ''
  });
  assert(
    '可取消对象仍可反选',
    next.locked === false &&
      next.disabled === false &&
      next.canSelfCancel === true &&
      next.registrationState === 'registered_by_me'
  );
})();

(function () {
  var other = mineProxy({
    registeredBy: 'op-other',
    registrationState: 'registered_locked',
    locked: true,
    canSelfCancel: false
  });
  var selfReg = {
    rosterEntryId: 're-self',
    userId: 'op1',
    playerId: 'op1',
    registrationStatus: 'registered',
    registrationSource: 'self',
    source: 'self',
    registeredBy: '',
    registrationState: 'registered_locked',
    locked: true,
    canSelfCancel: false
  };
  var missingBy = mineProxy({
    registeredBy: '',
    registrationState: 'registered_locked',
    locked: true,
    canSelfCancel: false
  });
  var inspectCalls = [];
  var out = pageIndex.projectProxyRegisterUsersWithCancelLocks(
    [other, selfReg, missingBy],
    'op1',
    's1',
    function (args) {
      inspectCalls.push(args);
      return { ok: true, blockedReason: '' };
    }
  );
  assert(
    '非原操作者/self/缺 registeredBy 保持锁定且不 inspect',
    inspectCalls.length === 0 &&
      pageIndex.isActiveProxyRegistrationByActor(other, 'op1') === false &&
      pageIndex.isActiveProxyRegistrationByActor(selfReg, 'op1') === false &&
      pageIndex.isActiveProxyRegistrationByActor(missingBy, 'op1') === false &&
      out[0].locked === true &&
      out[1].locked === true &&
      out[2].locked === true &&
      out[0].registrationState === 'registered_locked' &&
      out[1].registrationState === 'registered_locked' &&
      out[2].registrationState === 'registered_locked'
  );
})();

(function () {
  var unreg = {
    userId: 'new1',
    playerId: 'new1',
    registrationStatus: '',
    registrationSource: '',
    registeredBy: '',
    registrationState: 'unregistered',
    locked: false
  };
  var out = pageIndex.projectProxyRegisterUsersWithCancelLocks(
    [unreg],
    'op1',
    's1',
    function () {
      return { ok: false, blockedReason: 'finalized_score' };
    }
  );
  assert(
    '未报名对象仍可新增',
    out[0].locked === false &&
      out[0].registrationState === 'unregistered' &&
      pageIndex.isActiveProxyRegistrationByActor(unreg, 'op1') === false
  );
})();

(function () {
  var seen = [];
  var users = [mineProxy()];
  var inspectFn = function (args) {
    seen.push(args);
    return { ok: false, blockedReason: 'finalized_score' };
  };
  var friends = pageIndex.projectProxyRegisterUsersWithCancelLocks(
    users,
    'op1',
    's1',
    inspectFn
  );
  var members = pageIndex.projectProxyRegisterUsersWithCancelLocks(
    users,
    'op1',
    's1',
    inspectFn
  );
  assert(
    '好友和球队成员来源共享状态',
    seen.length === 2 &&
      JSON.stringify(friends[0].lockReason) === JSON.stringify(members[0].lockReason) &&
      friends[0].locked === true &&
      members[0].locked === true &&
      seen[0].seriesId === 's1' &&
      seen[0].playerId === 'p2' &&
      seen[0].rosterEntryId === 're-p2' &&
      seen[0].actorUserId === 'op1'
  );
})();

(function () {
  var n = 0;
  var users = [mineProxy()];
  var first = pageIndex.projectProxyRegisterUsersWithCancelLocks(
    users,
    'op1',
    's1',
    function () {
      n += 1;
      return { ok: true, blockedReason: '' };
    }
  );
  var second = pageIndex.projectProxyRegisterUsersWithCancelLocks(
    users,
    'op1',
    's1',
    function () {
      n += 1;
      return { ok: false, blockedReason: 'finalized_score' };
    }
  );
  assert(
    '再次打开会重新 inspect',
    n === 2 &&
      first[0].locked === false &&
      second[0].locked === true &&
      second[0].lockReason === 'finalized_score'
  );
})();

(function () {
  var toasts = [];
  var refresh = [];
  var page = {
    _pageAlive: true,
    _registrationService: {},
    _selfCancelOrchestrator: {
      applyProxyCommitPlanWithStationCleanup: function (args) {
        page._lastApplyArgs = args;
        return page._applyResult;
      }
    },
    _seriesId: 's1',
    _registerWriteLock: false,
    data: { registerSubmitting: false },
    _seriesProxyCommitPlan: {
      pickChannel: 'friends',
      seriesParticipantId: 'sp1',
      removals: [{ rosterEntryId: 're-p2', playerId: 'p2' }],
      additions: []
    },
    _proxyPickChannel: 'friends',
    _registerActiveParticipantId: 'sp1',
    _isSeriesOverallCompleted: function () {
      return false;
    },
    _resolveRegisterIdentity: function () {
      return { identity: { ok: true, playerId: 'op1' }, profile: { competitionName: 'Op' } };
    },
    _clearProxyRegistrationTempState: function () {
      refresh.push('clear');
    },
    _applyRegisterWriteSuccess: function () {
      refresh.push('success');
    },
    _closeManageSecondaryPatch: function () {
      refresh.push('close');
    },
    _handleRegistrationConflict: function () {},
    _showOrdinaryFinishedUnavailable: function () {},
    _showRegistrationClosedModal: function () {},
    _toastRegisterFailure: function (reason) {
      toasts.push('fail:' + reason);
    },
    _safeSetData: function () {},
    _applySeriesProxyCommitPlan: null
  };

  var applySrc = pageJs.match(
    /_applySeriesProxyCommitPlan:\s*function\s*\(\)\s*\{[\s\S]*?\n  \},/
  );
  assert('能定位提交函数', !!(applySrc && applySrc[0]));
  if (!applySrc) return;

  var seriesStore = {
    getSeriesById: function () {
      return {
        seriesId: 's1',
        registrationState: 'open',
        registrationRevision: 3
      };
    }
  };
  var gameStore = {
    getCurrentUser: function () {
      return { userId: 'op1', playerId: 'op1', name: 'Op' };
    }
  };
  var seriesProxyRegisterViewModel = {
    mapPickerPlayerToProxyPayload: function (p) {
      return p;
    }
  };
  var wx = {
    showToast: function (opt) {
      toasts.push((opt && opt.title) || '');
    }
  };

  function runApply(result) {
    toasts.length = 0;
    refresh.length = 0;
    page._applyResult = result;
    page._lastApplyArgs = null;
    page._registerWriteLock = false;
    page.data.registerSubmitting = false;
    var fn = new Function(
      'seriesStore',
      'gameStore',
      'seriesProxyRegisterViewModel',
      'wx',
      'return function () { ' +
        applySrc[0].replace(/^_applySeriesProxyCommitPlan:\s*function\s*\(\)\s*\{/, '').replace(/\n  \},$/, '') +
        ' };'
    );
    var bound = fn(seriesStore, gameStore, seriesProxyRegisterViewModel, wx);
    bound.call(page);
  }

  runApply({
    ok: true,
    addedCount: 0,
    removedCount: 1,
    series: { seriesId: 's1' }
  });
  assert(
    'removals 调用新批量 orchestrator 且参数完整',
    page._lastApplyArgs &&
      page._lastApplyArgs.seriesId === 's1' &&
      page._lastApplyArgs.expectedRegistrationRevision === 3 &&
      page._lastApplyArgs.seriesParticipantId === 'sp1' &&
      page._lastApplyArgs.actor &&
      page._lastApplyArgs.actor.playerId === 'op1' &&
      Array.isArray(page._lastApplyArgs.removals) &&
      page._lastApplyArgs.removals.length === 1 &&
      Array.isArray(page._lastApplyArgs.additions) &&
      page._lastApplyArgs.additions.length === 0
  );
  assert(
    '成功后原有刷新与关闭行为不变',
    refresh.join(',') === 'clear,success,close' &&
      toasts.indexOf('代报名已更新') >= 0
  );

  page._seriesProxyCommitPlan = {
    pickChannel: 'friends',
    seriesParticipantId: 'sp1',
    removals: [],
    additions: [{ playerId: 'new1', name: 'New' }]
  };
  runApply({
    ok: true,
    addedCount: 1,
    removedCount: 0,
    series: { seriesId: 's1' }
  });
  assert(
    'additions-only 也走新入口且参数完整',
    page._lastApplyArgs &&
      page._lastApplyArgs.removals.length === 0 &&
      page._lastApplyArgs.additions.length === 1 &&
      page._lastApplyArgs.additions[0].playerId === 'new1' &&
      page._lastApplyArgs.expectedRegistrationRevision === 3
  );

  page._seriesProxyCommitPlan = {
    pickChannel: 'friends',
    seriesParticipantId: 'sp1',
    removals: [{ rosterEntryId: 're-p2', playerId: 'p2' }],
    additions: [{ playerId: 'new1', name: 'New' }]
  };
  runApply({
    ok: true,
    addedCount: 1,
    removedCount: 1,
    series: { seriesId: 's1' }
  });
  assert(
    'mixed plan 参数完整',
    page._lastApplyArgs &&
      page._lastApplyArgs.removals.length === 1 &&
      page._lastApplyArgs.additions.length === 1 &&
      page._lastApplyArgs.actor.userId === 'op1'
  );

  page._seriesProxyCommitPlan = {
    pickChannel: 'friends',
    seriesParticipantId: 'sp1',
    removals: [{ rosterEntryId: 're-p2', playerId: 'p2' }],
    additions: []
  };
  runApply({ ok: false, reason: 'finalized_score' });
  assert(
    'finalized 失败不显示成功',
    toasts.indexOf('代报名已更新') < 0 &&
      toasts.indexOf('fail:finalized_score') >= 0 &&
      refresh.length === 0
  );

  runApply({ ok: false, reason: 'managed_station_invalid' });
  assert(
    'managed 失败不显示成功',
    toasts.indexOf('代报名已更新') < 0 &&
      toasts.indexOf('fail:managed_station_invalid') >= 0 &&
      refresh.length === 0
  );
})();

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failures.length) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
