/**
 * Series 整体结束 / 自动归档 / 终态锁定
 * 运行：node scripts/seriesFinalize.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

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
var utilsDir = path.join(root, 'miniprogram', 'utils');
var seriesDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);

var finalize = require(path.join(utilsDir, 'seriesFinalize.js'));
var finishLock = require(path.join(utilsDir, 'seriesFinishLock.js'));
var aggregate = require(path.join(utilsDir, 'seriesRoundPhaseAggregate.js'));
var teamMatchFinish = require(path.join(utilsDir, 'teamMatchFinish.js'));
var registration = require(path.join(utilsDir, 'seriesRegistration.js'));
var seriesRoundUpdate = require(seriesTestPaths.util('seriesRoundUpdate.js'));
var seriesInfoUpdate = require(seriesTestPaths.util('seriesInfoUpdate.js'));
var seriesParticipantsUpdate = require(seriesTestPaths.util('seriesParticipantsUpdate.js'));
var manageSheet = require(path.join(seriesDir, 'seriesManageSheetViewModel.js'));
var scheduleWrite = require(path.join(seriesDir, 'seriesScheduleGroupWrite.js'));
var listAdapter = require(path.join(utilsDir, 'seriesListCardAdapter.js'));
var standingsAssembler = require(seriesTestPaths.util('seriesStandingsAssembler.js'));
var moreMenu = require(path.join(utilsDir, 'teamMatchMoreMenu.js'));

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

function freeze(v) {
  return JSON.parse(JSON.stringify(v));
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
    },
    upsertSeries: function (series) {
      mem[series.seriesId] = freeze(series);
      return { ok: true, series: freeze(series) };
    }
  };
}

function matchOf(over) {
  return Object.assign(
    {
      matchId: 'm1',
      status: 'ongoing',
      groups: [
        {
          groupId: 'g1',
          status: 'ongoing',
          players: [{ userId: 'u1', playerId: 'u1' }]
        }
      ],
      seriesContext: { managed: true, seriesId: 's1', roundId: 'r1', publishToken: 'tok' }
    },
    over || {}
  );
}

function seriesOf(over) {
  return Object.assign(
    {
      seriesId: 's1',
      lifecycleStatus: 'published',
      competitionPhaseCache: 'live',
      registrationState: 'open',
      registrationRevision: 2,
      createdBy: 'admin',
      hostMode: 'organization',
      scoringRule: { mode: 'global_m', topM: 3 },
      rounds: [
        { roundId: 'r1', index: 1, matchId: 'm1' },
        { roundId: 'r2', index: 2, matchId: 'm2' }
      ],
      roster: [{ rosterEntryId: 'e1', playerId: 'u1' }],
      participants: [{ seriesParticipantId: 'p1' }]
    },
    over || {}
  );
}

function matchesMap(spec) {
  var map = Object.create(null);
  Object.keys(spec).forEach(function (id) {
    map[id] = matchOf(
      Object.assign({ matchId: id, seriesContext: { managed: true, seriesId: 's1', roundId: id, publishToken: 'tok' } }, spec[id])
    );
  });
  return map;
}

function getMatchFn(map) {
  return function (id) {
    return map[id] || null;
  };
}

(function lastValidRoundAutoCompletes() {
  var series = seriesOf();
  var store = createMemoryStore(series);
  var map = matchesMap({
    m1: { status: 'finished', roundId: 'r1' },
    m2: { status: 'finished', roundId: 'r2' }
  });
  var result = finalize.finalizeSeries({
    seriesId: 's1',
    source: 'auto',
    seriesStore: store,
    getMatchById: getMatchFn(map),
    nowIso: function () {
      return '2026-08-16T12:00:00.000Z';
    }
  });
  var saved = store.getSeriesById('s1');
  assert(
    '最后一个有效轮完成后 Series 自动完成',
    result.ok &&
      !result.idempotent &&
      saved.competitionPhaseCache === 'completed' &&
      saved.registrationState === 'closed' &&
      saved.completedAt === '2026-08-16T12:00:00.000Z' &&
      saved.completionSource === 'auto' &&
      saved.lifecycleStatus === 'published'
  );
})();

(function liveMixDoesNotAuto() {
  var series = seriesOf();
  var store = createMemoryStore(series);
  var map = matchesMap({
    m1: { status: 'finished', roundId: 'r1' },
    m2: { status: 'ongoing', roundId: 'r2' }
  });
  var result = finalize.finalizeSeries({
    seriesId: 's1',
    source: 'auto',
    seriesStore: store,
    getMatchById: getMatchFn(map)
  });
  assert(
    'LIVE 与已完成混合时不提前自动完成',
    !result.ok &&
      result.reason === 'rounds_incomplete' &&
      store.getSeriesById('s1').competitionPhaseCache === 'live' &&
      store.getSeriesById('s1').registrationState === 'open'
  );
})();

(function cancelledDoesNotBlock() {
  var series = seriesOf({
    rounds: [
      { roundId: 'r1', index: 1, matchId: 'm1' },
      { roundId: 'rx', index: 2, matchId: 'mx', roundStatus: 'cancelled' }
    ]
  });
  var store = createMemoryStore(series);
  var map = matchesMap({
    m1: { status: 'finished', roundId: 'r1' },
    mx: { status: 'cancelled', roundId: 'rx' }
  });
  map.mx.roundStatus = 'cancelled';
  var result = finalize.finalizeSeries({
    seriesId: 's1',
    source: 'auto',
    seriesStore: store,
    getMatchById: getMatchFn(map)
  });
  assert(
    '已取消轮不阻止自动完成',
    result.ok && store.getSeriesById('s1').competitionPhaseCache === 'completed'
  );
})();

(function zeroValidRounds() {
  var series = seriesOf({
    rounds: [{ roundId: 'rx', index: 1, matchId: 'mx', roundStatus: 'cancelled' }]
  });
  var store = createMemoryStore(series);
  var map = matchesMap({
    mx: { status: 'cancelled', roundId: 'rx' }
  });
  map.mx.roundStatus = 'cancelled';
  var result = finalize.finalizeSeries({
    seriesId: 's1',
    source: 'auto',
    seriesStore: store,
    getMatchById: getMatchFn(map)
  });
  assert(
    '零有效轮不误判完成',
    !result.ok &&
      result.reason === 'no_valid_rounds' &&
      store.getSeriesById('s1').competitionPhaseCache === 'live'
  );
})();

(function manualAllDone() {
  var series = seriesOf();
  var store = createMemoryStore(series);
  var map = matchesMap({
    m1: { status: 'finished', roundId: 'r1' },
    m2: { status: 'finished', roundId: 'r2' }
  });
  var result = finalize.finalizeSeries({
    seriesId: 's1',
    source: 'manual',
    actor: { userId: 'admin' },
    seriesStore: store,
    getMatchById: getMatchFn(map),
    nowIso: function () {
      return '2026-08-16T13:00:00.000Z';
    }
  });
  var saved = store.getSeriesById('s1');
  assert(
    '管理员手动结束全部已完成的系列赛',
    result.ok &&
      saved.competitionPhaseCache === 'completed' &&
      saved.completedBy === 'admin' &&
      saved.completionSource === 'manual'
  );
})();

(function manualWithUnfinishedDoesNotForge() {
  var series = seriesOf();
  var store = createMemoryStore(series);
  var map = matchesMap({
    m1: { status: 'finished', roundId: 'r1' },
    m2: { status: 'ongoing', roundId: 'r2' }
  });
  var before = freeze(map.m2);
  var first = finalize.getManualFinishFirstConfirm(series, getMatchFn(map));
  var second = finalize.getManualFinishSecondConfirm(series, getMatchFn(map));
  var result = finalize.finalizeSeries({
    seriesId: 's1',
    source: 'manual',
    actor: { userId: 'admin' },
    seriesStore: store,
    getMatchById: getMatchFn(map),
    expectedUnfinishedRoundIds: first.unfinishedRoundIds
  });
  assert(
    '管理员手动结束仍有未完成轮的系列赛',
    result.ok &&
      first.hasUnfinishedRounds &&
      first.title === '系列赛尚未全部完成' &&
      first.content.indexOf('R2') >= 0 &&
      second.confirmText === '强制结束' &&
      second.confirmColor === '#dc2626' &&
      map.m2.status === before.status &&
      !map.m2.scoreData
  );
})();

(function concurrentAndIdempotent() {
  var series = seriesOf();
  var store = createMemoryStore(series);
  var map = matchesMap({
    m1: { status: 'finished', roundId: 'r1' },
    m2: { status: 'finished', roundId: 'r2' }
  });
  var a = finalize.finalizeSeries({
    seriesId: 's1',
    source: 'auto',
    seriesStore: store,
    getMatchById: getMatchFn(map),
    nowIso: function () {
      return '2026-08-16T14:00:00.000Z';
    }
  });
  var firstAt = store.getSeriesById('s1').completedAt;
  var b = finalize.finalizeSeries({
    seriesId: 's1',
    source: 'manual',
    actor: { userId: 'admin' },
    seriesStore: store,
    getMatchById: getMatchFn(map),
    nowIso: function () {
      return '2026-08-16T15:00:00.000Z';
    }
  });
  var saved = store.getSeriesById('s1');
  assert(
    '自动与手动结束并发时只完成一次且重复请求幂等',
    a.ok &&
      !a.idempotent &&
      b.ok &&
      b.idempotent &&
      saved.completedAt === firstAt &&
      saved.completionSource === 'auto'
  );
})();

(function writeFailNoPartial() {
  var series = seriesOf();
  var store = createMemoryStore(series);
  store.upsertSeriesChecked = function () {
    return { ok: false, reason: 'storage_write_failed' };
  };
  var map = matchesMap({
    m1: { status: 'finished', roundId: 'r1' },
    m2: { status: 'finished', roundId: 'r2' }
  });
  var result = finalize.finalizeSeries({
    seriesId: 's1',
    source: 'manual',
    actor: { userId: 'admin' },
    seriesStore: store,
    getMatchById: getMatchFn(map)
  });
  assert(
    '保存失败不产生部分关闭',
    !result.ok &&
      result.reason === 'storage_write_failed' &&
      store.getSeriesById('s1').registrationState === 'open' &&
      store.getSeriesById('s1').competitionPhaseCache === 'live' &&
      !store.getSeriesById('s1').completedAt
  );
})();

(function writesRejectedAfterComplete() {
  var series = seriesOf({
    competitionPhaseCache: 'completed',
    registrationState: 'closed',
    registrationRevision: 3,
    completedAt: '2026-08-16T12:00:00.000Z'
  });
  var store = createMemoryStore(series);
  var svc = registration.createSeriesRegistrationService({
    seriesStore: store,
    canManageRegistration: function () {
      return true;
    }
  });
  var reg = svc.setRegistrationState({
    seriesId: 's1',
    state: 'open',
    actor: { userId: 'admin' },
    expectedRegistrationRevision: 3
  });
  var roundSvc = seriesRoundUpdate.createSeriesRoundUpdateService({
    seriesStore: store,
    teamMatchStore: {
      getMatchById: function () {
        return matchOf({ status: 'ongoing' });
      },
      saveMatch: function () {}
    },
    getIndexByMatchId: function () {
      return { seriesId: 's1', roundId: 'r1', matchId: 'm1' };
    }
  });
  var round = roundSvc.updatePublishedSeriesRound({
    seriesId: 's1',
    roundId: 'r1',
    actor: { userId: 'admin' },
    patch: { name: 'x' }
  });
  var infoSvc = seriesInfoUpdate.createSeriesInfoUpdateService({
    seriesStore: store,
    teamMatchStore: { getMatchById: function () { return null; }, saveMatch: function () {} }
  });
  var info = infoSvc.updatePublishedSeriesInfo({
    seriesId: 's1',
    actor: { userId: 'admin' },
    patch: { seriesName: 'new' }
  });
  var partSvc = seriesParticipantsUpdate.createSeriesParticipantsUpdateService({
    seriesStore: store,
    teamMatchStore: { getMatchById: function () { return null; }, saveMatch: function () {} }
  });
  var part = partSvc.updatePublishedSeriesParticipants({
    seriesId: 's1',
    actor: { userId: 'admin' },
    participants: []
  });
  var groups = scheduleWrite.saveStationGroups({
    matchId: 'm1',
    series: series,
    groupDraft: [],
    getMatchById: function () {
      return matchOf({ status: 'ongoing' });
    },
    saveMatch: function () {}
  });
  var lock = finishLock.resolveSeriesMutationLock(series, false);
  var oddRound = finishLock.resolveSeriesMutationLock(
    series,
    false
  );
  assert(
    'Series 完成后人员/分组/规则/报名写入被拒绝',
    reg.reason === 'series_completed' &&
      round.reason === 'series_completed' &&
      info.reason === 'series_completed' &&
      part.reason === 'series_completed' &&
      groups.reason === 'series_completed' &&
      lock.scope === 'series' &&
      oddRound.blocked
  );
})();

(function stalePageCannotBypass() {
  var series = seriesOf({
    competitionPhaseCache: 'completed',
    registrationState: 'closed'
  });
  var match = matchOf({ status: 'ongoing', matchId: 'm-stale' });
  var saved = teamMatchFinish.saveMatchIfWritable(match, {
    getMatchById: function () {
      return matchOf({ status: 'ongoing', matchId: 'm-stale' });
    },
    getSeriesById: function () {
      return series;
    },
    saveMatch: function () {
      throw new Error('should_not_write');
    }
  });
  assert(
    '陈旧页面和直接调用保存函数不能绕过',
    saved.ok === false && saved.reason === 'series_completed'
  );
})();

(function manageButtonsAndPlaza() {
  var done = seriesOf({
    competitionPhaseCache: 'completed',
    registrationState: 'closed'
  });
  var sheet = manageSheet.buildSeriesScopeFeatures({
    series: done,
    user: { userId: 'admin' },
    canManageSeries: true
  });
  var finishFeat = sheet.featuresManage.filter(function (f) {
    return f.permission === 'finish_series';
  })[0];
  var editFeat = sheet.featuresManage.filter(function (f) {
    return f.permission === 'edit_series';
  })[0];
  var hide = aggregate.shouldHideSeriesFromPlazaRegistration(done, function () {
    return matchOf({ status: 'ongoing' });
  });
  var phase = listAdapter.deriveSeriesListPhase(done, function () {
    return matchOf({ status: 'ongoing' });
  });
  var finishDisabled = moreMenu.getMoreFeatureDisabledState(
    matchOf({ status: 'ongoing' }),
    { permission: 'finish_match' },
    true
  );
  var groupsDisabled = moreMenu.getMoreFeatureDisabledState(
    matchOf({ status: 'ongoing' }),
    { permission: 'edit_groups' },
    true
  );
  assert(
    '所有管理按钮置灰且结束入口不可再执行，广场报名移除',
    finishFeat &&
      finishFeat.disabled &&
      finishFeat.label === '已结束' &&
      editFeat &&
      editFeat.disabled &&
      hide === true &&
      phase === 'finished' &&
      finishDisabled &&
      groupsDisabled
  );
})();

(function standingsStillReadable() {
  var gm = seriesOf({
    competitionPhaseCache: 'completed',
    scoringRule: { mode: 'global_m', topM: 2 }
  });
  var pr = seriesOf({
    competitionPhaseCache: 'completed',
    scoringRule: { mode: 'per_round_n' }
  });
  var builtGm = standingsAssembler.buildStandingsResult({
    series: gm,
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  var builtPr = standingsAssembler.buildStandingsResult({
    series: pr,
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert(
    'global_m TOT 与 per_round_n TOTAL 最终榜仍可读取',
    builtGm &&
      builtGm.standingsResult &&
      builtPr &&
      builtPr.standingsResult &&
      gm.scoringRule.mode === 'global_m' &&
      pr.scoringRule.mode === 'per_round_n'
  );
})();

(function seriesLockWinsOddRound() {
  var series = seriesOf({ competitionPhaseCache: 'completed' });
  var lock = finishLock.resolveSeriesMutationLock(series, false);
  assert(
    '已完成 Series 下单轮异常状态不能解除整体锁',
    lock.blocked && lock.scope === 'series' && lock.reason === 'series_completed'
  );
})();

(function ordinaryFinishUnchanged() {
  var match = {
    matchId: 'plain',
    status: 'ongoing',
    groups: [{ groupId: 'g1', status: 'ongoing', players: [{ userId: 'a' }] }]
  };
  var confirmed = teamMatchFinish.confirmFinishWholeTeamMatch(match);
  assert(
    '普通单场队内赛/队际赛结束流程不退化',
    confirmed.ok && match.status === 'finished' && !match.seriesContext
  );
})();

(function maybeFinalizeAfterLastStation() {
  var series = seriesOf();
  var store = createMemoryStore(series);
  var map = matchesMap({
    m1: { status: 'finished', roundId: 'r1' },
    m2: { status: 'finished', roundId: 'r2' }
  });
  var r = finalize.maybeFinalizeAfterStationPersisted(map.m2, {
    seriesStore: store,
    getMatchById: getMatchFn(map)
  });
  assert(
    '分站完成后同一公共流程检查 Series',
    r.ok && store.getSeriesById('s1').competitionPhaseCache === 'completed'
  );
})();

(function backendFinishedAlias() {
  assert(
    '后端 finished/completed 语义视为终态',
    finishLock.isSeriesCompleted({ competitionPhaseCache: 'finished' }) &&
      finishLock.isSeriesCompleted({ lifecycleStatus: 'completed' })
  );
})();

var pageJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
assert(
  '详情页接通 finish_series 且走 finalizeSeries',
  pageJs.indexOf("permission === 'finish_series'") >= 0 &&
    pageJs.indexOf('finalizeSeries') >= 0 &&
    pageJs.indexOf('maybeFinalizeAfterStationPersisted') >= 0 &&
    pageJs.indexOf('isSeriesLocked') < 0
);

assert(
  '锁定投影禁止页面私有 isSeriesLocked 事实源',
  pageJs.indexOf('isSeriesLocked') < 0 &&
    fs
      .readFileSync(path.join(utilsDir, 'seriesFinishLock.js'), 'utf8')
      .indexOf('function isSeriesLocked') < 0 &&
    fs
      .readFileSync(path.join(utilsDir, 'seriesFinishLock.js'), 'utf8')
      .indexOf('isSeriesLocked:') < 0
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
  process.exit(1);
}
