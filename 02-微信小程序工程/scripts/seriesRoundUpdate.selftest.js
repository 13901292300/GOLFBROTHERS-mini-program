/**
 * Patch E1：Published Series 单轮编辑自测
 * 运行：node scripts/seriesRoundUpdate.selftest.js
 */

var path = require('path');
var fs = require('fs');

var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');
var createPageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'create',
  'pages',
  'series'
);
var seriesDetailDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);

var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var seriesRoundUpdate = require(path.join(utilsDir, 'seriesRoundUpdate.js'));
var seriesStationManageGate = require(path.join(utilsDir, 'seriesStationManageGate.js'));
var sheetVm = require(path.join(seriesDetailDir, 'seriesManageSheetViewModel.js'));
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

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function createMemoryStorage() {
  var bag = Object.create(null);
  return {
    getItem: function (key) {
      return { ok: true, value: bag[key] != null ? deepClone(bag[key]) : null };
    },
    setItem: function (key, value) {
      bag[key] = deepClone(value);
      return { ok: true };
    },
    removeItem: function (key) {
      delete bag[key];
      return { ok: true };
    },
    _bag: bag
  };
}

function makeSeries(overrides) {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: '测试系列赛',
    createdBy: 'admin-1',
    organization: {
      organizationId: 'org-1',
      organizationName: '测试机构',
      organizationLogo: ''
    }
  });
  s.lifecycleStatus = 'published';
  s.publishToken = 'tok-e1';
  s.updatedAt = '2026-08-01T00:00:00.000Z';
  s.participants = [
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't1',
      seriesParticipantId: 'team:t1',
      nameSnapshot: '甲队'
    }),
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't2',
      seriesParticipantId: 'team:t2',
      nameSnapshot: '乙队'
    })
  ];
  s.scoringRule = seriesModel.createDefaultScoringRule({
    mode: 'per_round_n',
    scoreBasis: 'gross',
    allowRepeat: false
  });
  s.rounds = (s.rounds || []).slice(0, 2).map(function (r, idx) {
    var next = Object.assign({}, r);
    next.roundId = 'r' + (idx + 1);
    next.index = idx + 1;
    next.name = '第' + (idx + 1) + '轮';
    next.dateTime = '2030-06-0' + (idx + 1) + ' 08:00';
    next.gameMode = '个人比杆赛';
    next.courseId = 'c' + (idx + 1);
    next.courseName = '球场' + (idx + 1);
    next.courseLocation = '城市';
    next.courseHalfText = '';
    next.front9Course = null;
    next.back9Course = null;
    next.fee = idx === 0 ? '100' : '80';
    next.topN = 3;
    next.matchId = 'm' + (idx + 1);
    return next;
  });
  if (overrides) Object.assign(s, overrides);
  return s;
}

function makeMatchFromRound(series, round, extras) {
  var built = seriesStationMatch.buildMatchFromSeriesRound(series, round, {
    matchId: round.matchId,
    publishToken: series.publishToken
  });
  if (!built.ok) throw new Error('build fail: ' + built.reason);
  var m = built.match;
  m.createdBy = 'admin-1';
  m.creatorId = 'admin-1';
  m.status = 'registering';
  m.statusLabel = '报名中';
  m.groups = [];
  m.registerInfo = { players: [{ userId: 'p1', name: '球员1' }] };
  m.teamGroups = [{ teamId: 't1', name: '甲' }];
  m.tempAdmins = [{ userId: 'tmp1' }];
  m.scoreData = {};
  if (extras) Object.assign(m, extras);
  return m;
}

function createHarness(opts) {
  var o = opts || {};
  var series = o.series || makeSeries();
  var matches = Object.create(null);
  series.rounds.forEach(function (r) {
    matches[r.matchId] = makeMatchFromRound(series, r, (o.matchExtras && o.matchExtras[r.matchId]) || null);
  });
  var seriesBag = Object.create(null);
  seriesBag[series.seriesId] = deepClone(series);
  var index = Object.create(null);
  series.rounds.forEach(function (r) {
    index[r.matchId] = {
      seriesId: series.seriesId,
      roundId: r.roundId,
      matchId: r.matchId
    };
  });
  var storage = createMemoryStorage();
  var seriesStore = {
    getSeriesById: function (id) {
      return seriesBag[id] ? deepClone(seriesBag[id]) : null;
    },
    upsertSeries: function (input) {
      if (o.failSeriesWrite) return { ok: false, reason: 'injected_series_fail' };
      seriesBag[input.seriesId] = deepClone(input);
      return { ok: true, series: deepClone(input) };
    }
  };
  var teamMatchStore = {
    getMatchById: function (id) {
      return matches[id] ? deepClone(matches[id]) : null;
    },
    saveMatch: function (m) {
      if (o.failMatchWrite) throw new Error('injected_match_fail');
      matches[m.matchId] = deepClone(m);
    }
  };
  var svc = seriesRoundUpdate.createSeriesRoundUpdateService({
    seriesStore: seriesStore,
    teamMatchStore: teamMatchStore,
    storage: storage,
    getIndexByMatchId: function (id) {
      return index[id] ? deepClone(index[id]) : null;
    },
    now: function () {
      return 1700000000000;
    }
  });
  return {
    series: series,
    seriesBag: seriesBag,
    matches: matches,
    storage: storage,
    svc: svc,
    actor: { userId: 'admin-1', name: 'Admin' }
  };
}

(function testLocks() {
  var series = makeSeries();
  var round = series.rounds[0];
  var idle = makeMatchFromRound(series, round, { status: 'registering' });
  var locksIdle = seriesRoundUpdate.resolveRoundEditLocks(series, round, idle);
  assert('未开始可改球场/时间/赛制/TopN/名称/费用', locksIdle.course.enabled && locksIdle.dateTime.enabled && locksIdle.gameMode.enabled && locksIdle.topN.enabled && locksIdle.name.enabled && locksIdle.fee.enabled);

  var live = makeMatchFromRound(series, round, {
    status: 'ongoing',
    scoreData: {
      g1: { scoresByPlayer: { u1: { scores: [4] } } }
    }
  });
  var locksLive = seriesRoundUpdate.resolveRoundEditLocks(series, round, live);
  assert(
    'LIVE/有成绩禁用敏感字段且原因具体',
    !locksLive.course.enabled &&
      locksLive.course.reason.indexOf('已开始或已有成绩') >= 0 &&
      !locksLive.dateTime.enabled &&
      !locksLive.gameMode.enabled &&
      locksLive.gameMode.reason === '本轮已开始或已有成绩，暂不可修改赛制' &&
      !locksLive.topN.enabled &&
      locksLive.fee.enabled &&
      locksLive.name.enabled
  );

  var grouped = makeMatchFromRound(series, round, {
    status: 'registering',
    groups: [{ groupId: 'g1', players: [{ userId: 'u1' }] }],
    pairings: { g1: [{ id: 'p1', playerIds: ['u1', 'u2'] }] },
    scoreEntities: { g1: [{ entityId: 'e1' }] },
    scoreData: { g1: { scoresByPlayer: {}, teamScoresByEntity: [] } }
  });
  var locksGroup = seriesRoundUpdate.resolveRoundEditLocks(series, round, grouped);
  assert(
    '首要验收：未开赛已分组（含 pairings/scoreEntities）赛制仍可用',
    locksGroup.gameMode.enabled === true &&
      locksGroup.gameMode.reason === '' &&
      locksGroup.hasGroupingStructure === true &&
      locksGroup.hasScoringStructure === true &&
      locksGroup.startedOrScored === false
  );

  var finished = makeMatchFromRound(series, round, { status: 'finished' });
  var locksFin = seriesRoundUpdate.resolveRoundEditLocks(series, round, finished);
  assert(
    '已结束费用/名称也禁用且原因含已结束',
    !locksFin.fee.enabled &&
      locksFin.fee.reason.indexOf('已结束') >= 0 &&
      !locksFin.name.enabled
  );

  var globalSeries = makeSeries({
    scoringRule: seriesModel.createDefaultScoringRule({
      mode: 'global_m',
      globalM: 10,
      scoreBasis: 'gross',
      allowRepeat: false
    })
  });
  var locksGm = seriesRoundUpdate.resolveRoundEditLocks(
    globalSeries,
    globalSeries.rounds[0],
    makeMatchFromRound(globalSeries, globalSeries.rounds[0])
  );
  assert(
    'global_m 不展示/不可编 Top N',
    locksGm.showTopN === false &&
      !locksGm.topN.enabled &&
      locksGm.topN.reason.indexOf('全局 M') >= 0
  );
})();

(function testHappyPathSync() {
  var h = createHarness();
  var series = h.seriesBag[h.series.seriesId];
  var r1 = series.rounds[0];
  var r2Before = deepClone(series.rounds[1]);
  var m1Before = deepClone(h.matches.m1);
  var fp = seriesStationMatch.computeStationPayloadFingerprint(m1Before);

  var res = h.svc.updatePublishedSeriesRound({
    seriesId: series.seriesId,
    roundId: r1.roundId,
    patch: {
      name: '开幕轮',
      fee: '120',
      topN: 5,
      dateTime: '2030-06-01 09:30',
      courseName: '新球场',
      courseId: 'c9',
      courseLocation: '新区',
      courseHalfText: '（前九）',
      gameMode: '四人四球比杆赛'
    },
    actor: h.actor,
    expectedSeriesUpdatedAt: series.updatedAt,
    expectedMatchFingerprint: fp
  });
  assert('保存成功', res.ok === true, res.reason);
  var afterSeries = h.seriesBag[series.seriesId];
  var afterR1 = afterSeries.rounds[0];
  var afterR2 = afterSeries.rounds[1];
  var afterM1 = h.matches.m1;
  assert('Series R1 名称已更新', afterR1.name === '开幕轮');
  assert('R2 未被覆盖', JSON.stringify(afterR2) === JSON.stringify(r2Before));
  assert(
    'match 映射：roundName/tee/course/gameMode/fee/topN',
    afterM1.roundName === '测试系列赛 · 开幕轮' &&
      afterM1.teeTime === '2030-06-01 09:30' &&
      afterM1.courseId === 'c9' &&
      afterM1.courseName === '新球场' &&
      afterM1.courseHalfText === '（前九）' &&
      afterM1.gameMode === '四人四球比杆赛' &&
      afterM1.feeList &&
      afterM1.feeList[0] &&
      String(afterM1.feeList[0].amount) === '120' &&
      afterM1.scoringRules.teamCompetition.topN === 5
  );
  assert(
    '身份与运行态不变',
    afterM1.matchId === m1Before.matchId &&
      afterM1.seriesContext.publishToken === m1Before.seriesContext.publishToken &&
      afterM1.seriesContext.seriesId === m1Before.seriesContext.seriesId &&
      afterM1.seriesContext.roundId === m1Before.seriesContext.roundId &&
      afterM1.seriesContext.managed === true &&
      JSON.stringify(afterM1.registerInfo) === JSON.stringify(m1Before.registerInfo) &&
      JSON.stringify(afterM1.teamGroups) === JSON.stringify(m1Before.teamGroups) &&
      JSON.stringify(afterM1.tempAdmins) === JSON.stringify(m1Before.tempAdmins) &&
      afterM1.createdBy === m1Before.createdBy &&
      afterM1.registrationStatus === m1Before.registrationStatus
  );
  assert('journal 已清理', h.storage.getItem(seriesRoundUpdate.JOURNAL_KEY).value == null);
})();

(function testPerRoundTopNOnly() {
  var h = createHarness();
  var series = h.seriesBag[h.series.seriesId];
  var r2 = series.rounds[1];
  var r1Top = series.rounds[0].topN;
  var res = h.svc.updatePublishedSeriesRound({
    seriesId: series.seriesId,
    roundId: r2.roundId,
    patch: { topN: 7 },
    actor: h.actor
  });
  assert('per_round_n 可改当前 Top N', res.ok && h.seriesBag[series.seriesId].rounds[1].topN === 7);
  assert('不改 R1 Top N / 全局规则', h.seriesBag[series.seriesId].rounds[0].topN === r1Top && h.seriesBag[series.seriesId].scoringRule.mode === 'per_round_n');
  assert(
    'match topN 同步当前轮',
    h.matches.m2.scoringRules.teamCompetition.topN === 7
  );
})();

(function testGlobalMNoTopNPatch() {
  var series = makeSeries({
    scoringRule: seriesModel.createDefaultScoringRule({
      mode: 'global_m',
      globalM: 12,
      scoreBasis: 'gross',
      allowRepeat: false
    })
  });
  var h = createHarness({ series: series });
  var res = h.svc.updatePublishedSeriesRound({
    seriesId: series.seriesId,
    roundId: 'r1',
    patch: { topN: 9 },
    actor: h.actor
  });
  assert('global_m 拒绝 Top N patch', !res.ok && res.reason === 'field_locked');
  assert('全局 M 未变', h.seriesBag[series.seriesId].scoringRule.globalM === 12);
})();

(function testPrimaryAcceptanceGroupedEditableThenClearOnConfirm() {
  // 产品死路修复：第一轮已分组但未开赛 → 编辑本轮可选赛制 → 保存才确认 → 清空后「开始分组」
  var h = createHarness({
    matchExtras: {
      m1: {
        status: 'registering',
        groups: [{ groupId: 'g1', players: [{ userId: 'u1' }, { userId: 'u2' }] }],
        pairings: { g1: [{ id: 'p1', playerIds: ['u1', 'u2'] }] },
        scoreEntities: { g1: [{ entityId: 'e1', playerIds: ['u1', 'u2'] }] }
      }
    }
  });
  var series = h.seriesBag[h.series.seriesId];
  var locks = seriesRoundUpdate.resolveRoundEditLocks(
    series,
    series.rounds[0],
    h.matches.m1
  );
  assert('首要：选择器可用（非 disabled）', locks.gameMode.enabled === true);
  assert(
    '首要：hasGrouping 只作确认信号、不禁用',
    locks.hasGroupingStructure === true && locks.gameMode.enabled === true
  );

  var withoutConfirm = h.svc.updatePublishedSeriesRound({
    seriesId: series.seriesId,
    roundId: 'r1',
    patch: { gameMode: '四人两球比杆赛' },
    actor: h.actor
  });
  assert(
    '首要：改变赛制保存才要求确认',
    !withoutConfirm.ok &&
      withoutConfirm.reason === 'game_mode_clear_confirm_required'
  );
  assert(
    '首要：未确认前分组仍在',
    h.matches.m1.groups.length === 1 &&
      h.seriesBag[series.seriesId].rounds[0].gameMode === '个人比杆赛'
  );

  var withConfirm = h.svc.updatePublishedSeriesRound({
    seriesId: series.seriesId,
    roundId: 'r1',
    patch: { gameMode: '四人两球比杆赛' },
    actor: h.actor,
    confirmClearGameModeStructure: true
  });
  assert('首要：确认后写入新赛制', withConfirm.ok === true, withConfirm.reason);
  assert(
    '首要：确认后清空分组，赛程可恢复「开始分组」',
    h.seriesBag[series.seriesId].rounds[0].gameMode === '四人两球比杆赛' &&
      h.matches.m1.gameMode === '四人两球比杆赛' &&
      h.matches.m1.groups.length === 0 &&
      !seriesRoundUpdate.matchHasGroupingStructure(h.matches.m1)
  );
})();

(function testGameModeClearConfirm() {
  var h = createHarness({
    matchExtras: {
      m1: {
        groups: [{ groupId: 'g1', players: [{ userId: 'u1' }] }],
        pairings: { g1: [{ id: 'p1', playerIds: ['u1', 'u2'] }] },
        scoreData: { g1: { scoresByPlayer: {} } },
        scoreEntities: { g1: [{ entityId: 'e1' }] },
        pairingMap: { g1: true }
      }
    }
  });
  var beforeSeries = deepClone(h.seriesBag[h.series.seriesId]);
  var beforeMatch = deepClone(h.matches.m1);
  var denied = h.svc.updatePublishedSeriesRound({
    seriesId: h.series.seriesId,
    roundId: 'r1',
    patch: { gameMode: '四人四球比杆赛' },
    actor: h.actor
  });
  assert(
    '有分组改赛制未确认 → confirm_required',
    !denied.ok && denied.reason === 'game_mode_clear_confirm_required'
  );
  assert(
    '取消确认后 Series/match/groups 全不变',
    JSON.stringify(h.seriesBag[h.series.seriesId]) === JSON.stringify(beforeSeries) &&
      JSON.stringify(h.matches.m1) === JSON.stringify(beforeMatch)
  );

  var sameMode = h.svc.updatePublishedSeriesRound({
    seriesId: h.series.seriesId,
    roundId: 'r1',
    patch: { gameMode: '个人比杆赛', name: '同赛制改名' },
    actor: h.actor
  });
  assert(
    '同一赛制保存不弹窗不清分组',
    sameMode.ok &&
      h.matches.m1.groups.length === 1 &&
      h.matches.m1.groups[0].players[0].userId === 'u1' &&
      h.seriesBag[h.series.seriesId].rounds[0].name === '同赛制改名'
  );

  var confirmed = h.svc.updatePublishedSeriesRound({
    seriesId: h.series.seriesId,
    roundId: 'r1',
    patch: { gameMode: '四人四球比杆赛' },
    actor: h.actor,
    confirmClearGameModeStructure: true
  });
  assert('确认后赛制写入 Series+match', confirmed.ok === true, confirmed.reason);
  var afterM = h.matches.m1;
  var afterR1 = h.seriesBag[h.series.seriesId].rounds[0];
  var afterR2 = h.seriesBag[h.series.seriesId].rounds[1];
  assert(
    '确认后清空 groups/pairings/scoreData/scoreEntities/pairingMap',
    afterR1.gameMode === '四人四球比杆赛' &&
      afterM.gameMode === '四人四球比杆赛' &&
      Array.isArray(afterM.groups) &&
      afterM.groups.length === 0 &&
      JSON.stringify(afterM.pairings) === '{}' &&
      JSON.stringify(afterM.scoreData) === '{}' &&
      JSON.stringify(afterM.scoreEntities) === '{}' &&
      JSON.stringify(afterM.pairingMap) === '{}'
  );
  assert(
    '其他轮次 / roster / participants / 费用球场时间不变',
    afterR2.gameMode === beforeSeries.rounds[1].gameMode &&
      JSON.stringify(h.seriesBag[h.series.seriesId].roster || []) ===
        JSON.stringify(beforeSeries.roster || []) &&
      JSON.stringify(h.seriesBag[h.series.seriesId].participants) ===
        JSON.stringify(beforeSeries.participants) &&
      afterR1.fee === beforeSeries.rounds[0].fee &&
      afterR1.courseId === beforeSeries.rounds[0].courseId &&
      afterR1.dateTime === beforeSeries.rounds[0].dateTime &&
      afterM.seriesContext.publishToken === beforeMatch.seriesContext.publishToken &&
      afterM.matchId === beforeMatch.matchId
  );
  assert(
    '清空后赛程应显示开始分组（无有效分组）',
    !seriesRoundUpdate.matchHasGroupingStructure(afterM)
  );
})();

(function testGameModeBlockedByStartOrScores() {
  var started = createHarness({
    matchExtras: { m1: { status: 'ongoing' } }
  });
  var resStarted = started.svc.updatePublishedSeriesRound({
    seriesId: started.series.seriesId,
    roundId: 'r1',
    patch: { gameMode: '四人四球比杆赛' },
    actor: started.actor,
    confirmClearGameModeStructure: true
  });
  assert(
    '已开始禁止改赛制',
    !resStarted.ok &&
      (resStarted.reason === 'field_locked' || resStarted.reason === 'game_mode_blocked')
  );

  var scoreShapes = [
    {
      name: 'scoresByPlayer',
      scoreData: { g1: { scoresByPlayer: { u1: { scores: [4, '', ''] } } } }
    },
    {
      name: 'teamScoresByEntity',
      scoreData: { g1: { teamScoresByEntity: [{ scores: [5] }] } }
    },
    {
      name: 'scoresBySide',
      scoreData: { g1: { scoresBySide: { A: { scores: [3] } } } }
    },
    {
      name: '四人两球 entity bucket',
      scoreData: {
        g1: {
          scoresByPlayer: {},
          teamScoresByEntity: [{ entityId: 'e1', scores: [4, 5] }]
        }
      }
    }
  ];
  scoreShapes.forEach(function (shape) {
    var h = createHarness({
      matchExtras: {
        m1: {
          status: 'registering',
          groups: [{ players: [{ userId: 'u1' }] }],
          scoreData: shape.scoreData
        }
      }
    });
    var locks = seriesRoundUpdate.resolveRoundEditLocks(
      h.seriesBag[h.series.seriesId],
      h.seriesBag[h.series.seriesId].rounds[0],
      h.matches.m1
    );
    var res = h.svc.updatePublishedSeriesRound({
      seriesId: h.series.seriesId,
      roundId: 'r1',
      patch: { gameMode: '最佳球位比杆赛' },
      actor: h.actor,
      confirmClearGameModeStructure: true
    });
    assert(
      '真实成绩禁止改赛制：' + shape.name,
      locks.gameMode.enabled === false &&
        !res.ok &&
        (res.reason === 'field_locked' || res.reason === 'game_mode_blocked')
    );
  });
})();

(function testGameModeNoGroupsDirect() {
  var h = createHarness();
  var res = h.svc.updatePublishedSeriesRound({
    seriesId: h.series.seriesId,
    roundId: 'r1',
    patch: { gameMode: '最佳球位比杆赛' },
    actor: h.actor
  });
  assert(
    '未开始无分组可直接改赛制',
    res.ok &&
      h.seriesBag[h.series.seriesId].rounds[0].gameMode === '最佳球位比杆赛' &&
      h.matches.m1.gameMode === '最佳球位比杆赛'
  );
})();

(function testGameModeMatchFailRollbackKeepsGroups() {
  var h = createHarness({
    failMatchWrite: true,
    matchExtras: {
      m1: { groups: [{ players: [{ userId: 'u1' }] }] }
    }
  });
  var beforeSeries = deepClone(h.seriesBag[h.series.seriesId]);
  var beforeMatch = deepClone(h.matches.m1);
  var res = h.svc.updatePublishedSeriesRound({
    seriesId: h.series.seriesId,
    roundId: 'r1',
    patch: { gameMode: '四人两球比杆赛' },
    actor: h.actor,
    confirmClearGameModeStructure: true
  });
  assert('赛制变更 match 写失败', !res.ok && res.reason === 'match_write_failed');
  assert(
    '写 match 失败 → Series 回滚且分组仍在',
    h.seriesBag[h.series.seriesId].rounds[0].gameMode ===
      beforeSeries.rounds[0].gameMode &&
      JSON.stringify(h.matches.m1.groups) === JSON.stringify(beforeMatch.groups)
  );
})();

(function testMatchWriteFailRollback() {
  var h = createHarness({ failMatchWrite: true });
  var beforeSeries = deepClone(h.seriesBag[h.series.seriesId]);
  var beforeMatch = deepClone(h.matches.m1);
  var res = h.svc.updatePublishedSeriesRound({
    seriesId: h.series.seriesId,
    roundId: 'r1',
    patch: { name: '应回滚' },
    actor: h.actor
  });
  assert('match 写失败不成功', !res.ok && res.reason === 'match_write_failed');
  assert(
    'Series 已回滚',
    JSON.stringify(h.seriesBag[h.series.seriesId].rounds[0].name) ===
      JSON.stringify(beforeSeries.rounds[0].name)
  );
  assert(
    'match 未残留',
    h.matches.m1.roundName === beforeMatch.roundName
  );
  assert('失败后无 journal', h.storage.getItem(seriesRoundUpdate.JOURNAL_KEY).value == null);
})();

(function testConflict() {
  var h = createHarness();
  var res = h.svc.updatePublishedSeriesRound({
    seriesId: h.series.seriesId,
    roundId: 'r1',
    patch: { name: '冲突测' },
    actor: h.actor,
    expectedSeriesUpdatedAt: 'stale-ts'
  });
  assert('指纹/修订冲突', !res.ok && res.reason === 'round_conflict');
})();

(function testStationInvalid() {
  var h = createHarness();
  h.matches.m1.seriesContext.publishToken = 'BAD';
  var res = h.svc.updatePublishedSeriesRound({
    seriesId: h.series.seriesId,
    roundId: 'r1',
    patch: { name: '坏站' },
    actor: h.actor
  });
  assert('站数据异常', !res.ok && res.reason === 'station_data_invalid');
})();

(function testPermission() {
  var h = createHarness();
  var res = h.svc.updatePublishedSeriesRound({
    seriesId: h.series.seriesId,
    roundId: 'r1',
    patch: { name: '无权限' },
    actor: { userId: 'stranger' }
  });
  assert('无权限拒绝', !res.ok && res.reason === 'permission_denied');
})();

(function testFeeInvalid() {
  var h = createHarness();
  var res = h.svc.updatePublishedSeriesRound({
    seriesId: h.series.seriesId,
    roundId: 'r1',
    patch: { fee: 'abc' },
    actor: h.actor
  });
  assert('非法费用不静默清空', !res.ok && res.reason === 'fee_invalid');
  assert('费用原值保留', h.seriesBag[h.series.seriesId].rounds[0].fee === '100');
})();

(function testRecoverInterrupted() {
  var h = createHarness();
  var beforeSeries = deepClone(h.seriesBag[h.series.seriesId]);
  var beforeMatch = deepClone(h.matches.m1);
  h.storage.setItem(seriesRoundUpdate.JOURNAL_KEY, {
    phase: 'pending_match',
    seriesBefore: beforeSeries,
    matchBefore: beforeMatch
  });
  // 模拟半写：Series 已被改坏
  h.seriesBag[h.series.seriesId].rounds[0].name = '半写脏数据';
  var recovered = h.svc.recoverInterruptedEdit();
  assert('中断半写可恢复', recovered.ok && recovered.reason === 'rolled_back');
  assert(
    '恢复后 Series 名称正确',
    h.seriesBag[h.series.seriesId].rounds[0].name === beforeSeries.rounds[0].name
  );
})();

(function testMenuLabelsAndNav() {
  var detailMenu = moreMenu.buildMoreMenuViewModel({
    match: {
      matchId: 'solo1',
      matchType: 'inter-team',
      status: 'registering',
      createdBy: 'admin-1',
      organizationId: 'org-1',
      registrationStatus: 'open',
      gameMode: '个人比杆赛'
    },
    user: { userId: 'admin-1' },
    options: { managedSeriesMode: false }
  });
  var editFeat = (detailMenu.featuresPermission || []).find(function (f) {
    return f && f.permission === 'edit_match';
  });
  assert('普通 detail 仍为修改比赛', !!editFeat && editFeat.label === '修改比赛');

  var seriesForSheet = {
    seriesId: 's1',
    hostMode: 'organization',
    lifecycleStatus: 'published',
    createdBy: 'admin-1',
    publishToken: 'tok',
    organization: { organizationId: 'org-1' },
    registrationState: 'open',
    rounds: [{ roundId: 'r1', matchId: 'm1', name: 'R1', index: 1 }]
  };
  var stationMatch = {
    matchId: 'm1',
    matchType: 'inter-team',
    status: 'registering',
    createdBy: 'admin-1',
    organizationId: 'org-1',
    registrationStatus: 'closed',
    gameMode: '个人比杆赛',
    seriesContext: {
      managed: true,
      seriesId: 's1',
      roundId: 'r1',
      publishToken: 'tok'
    }
  };
  var gateOk = seriesStationManageGate.verifyManagedStationForManage({
    series: seriesForSheet,
    roundId: 'r1',
    getMatchById: function () {
      return stationMatch;
    },
    getIndexByMatchId: function () {
      return { seriesId: 's1', roundId: 'r1', matchId: 'm1' };
    }
  });
  var seriesSheet = sheetVm.buildSeriesManageSheetViewModel({
    series: seriesForSheet,
    user: { userId: 'admin-1' },
    canManageSeries: true,
    selectedRoundId: 'r1',
    gate: gateOk,
    getMatchById: function () {
      return stationMatch;
    }
  });
  var seriesEdit = (seriesSheet.roundSection.featuresPermission || []).find(function (f) {
    return f && f.permission === 'edit_match';
  });
  assert('Series M 显示编辑本轮', !!seriesEdit && seriesEdit.label === '编辑本轮');

  var pageJs = fs.readFileSync(path.join(seriesDetailDir, 'index.js'), 'utf8');
  var wizardJs = fs.readFileSync(path.join(createPageDir, 'index.js'), 'utf8');
  var wizardWxml = fs.readFileSync(path.join(createPageDir, 'index.wxml'), 'utf8');
  assert(
    'edit_match 分支进系列赛向导',
    /permission === 'edit_match'[\s\S]{0,2500}create\/pages\/series\/index\?mode=edit_round/.test(
      pageJs
    ) &&
      pageJs.indexOf('gb_series_edit_round_return_v1') >= 0
  );
  assert(
    '向导支持 edit_round 直达轮次步且无上一步',
    wizardJs.indexOf("_bootstrapEditRound") >= 0 &&
      wizardJs.indexOf("mode === 'edit_round'") >= 0 &&
      wizardJs.indexOf('_saveEditRound') >= 0 &&
      wizardJs.indexOf('updatePublishedSeriesRound') >= 0 &&
      wizardWxml.indexOf('editRoundMode') >= 0 &&
      wizardWxml.indexOf('edit-round-banner') >= 0 &&
      wizardWxml.indexOf('hideWizardProgress') >= 0
  );
  assert(
    'edit_round 禁止 R1 批量覆盖与级联',
    wizardJs.indexOf('edit_round：禁止 R1 同步全部轮次') >= 0 &&
      wizardJs.indexOf('edit_round：只改当前轮，禁止向后级联') >= 0 &&
      wizardJs.indexOf('edit_round：只改当前轮，禁止 +24h 级联') >= 0
  );
  assert(
    '返回上下文恢复接线',
    pageJs.indexOf('_consumeEditRoundReturnContext') >= 0
  );
  assert(
    'edit_round 赛制变更确认弹窗与 confirmClear 接线',
    wizardJs.indexOf('修改本轮赛制') >= 0 &&
      wizardJs.indexOf('修改赛制后，本轮现有分组将被清空，需要重新分组。是否继续？') >=
        0 &&
      wizardJs.indexOf('继续修改') >= 0 &&
      wizardJs.indexOf('confirmClearGameModeStructure') >= 0 &&
      wizardJs.indexOf('matchHasGroupingStructure') >= 0
  );
  var roundUpdateSrc = fs.readFileSync(
    path.join(utilsDir, 'seriesRoundUpdate.js'),
    'utf8'
  );
  var gameModeLockBlock = roundUpdateSrc.match(
    /gameMode:\s*lock\(\s*([\s\S]*?),\s*finished/
  );
  assert(
    '源码守卫：gameMode 禁用条件不含 hasStruct/hasGroups',
    !!gameModeLockBlock &&
      gameModeLockBlock[1].indexOf('hasStruct') < 0 &&
      gameModeLockBlock[1].indexOf('hasGroups') < 0 &&
      gameModeLockBlock[1].indexOf('hasScoringStructure') < 0 &&
      gameModeLockBlock[1].indexOf('hasGroupingStructure') < 0 &&
      gameModeLockBlock[1].indexOf('startedOrScored') >= 0 &&
      roundUpdateSrc.indexOf('本轮已存在分组或计分结构，暂不可修改赛制') < 0
  );
  assert(
    '普通队际编辑仍走 analyzeGameModeChangeGroups（无 Series 清空确认文案）',
    (function () {
      var interJs = fs.readFileSync(
        path.join(
          __dirname,
          '..',
          'miniprogram',
          'subpackages',
          'create',
          'pages',
          'team-inter',
          'index.js'
        ),
        'utf8'
      );
      return (
        interJs.indexOf('analyzeGameModeChangeGroups') >= 0 &&
        interJs.indexOf('修改本轮赛制') < 0
      );
    })()
  );
})();

(function testIdentityDriftRollbackOnGameModeClear() {
  var h = createHarness({
    matchExtras: {
      m1: { groups: [{ players: [{ userId: 'u1' }] }] }
    }
  });
  var beforeSeries = deepClone(h.seriesBag[h.series.seriesId]);
  var beforeMatch = deepClone(h.matches.m1);
  var bag = h.matches;
  var driftOnce = true;
  var svc = seriesRoundUpdate.createSeriesRoundUpdateService({
    seriesStore: {
      getSeriesById: function (id) {
        return h.seriesBag[id] ? deepClone(h.seriesBag[id]) : null;
      },
      upsertSeries: function (s) {
        h.seriesBag[s.seriesId] = deepClone(s);
        return { ok: true, series: deepClone(s) };
      }
    },
    teamMatchStore: {
      getMatchById: function (id) {
        return bag[id] ? deepClone(bag[id]) : null;
      },
      saveMatch: function (m) {
        var copy = deepClone(m);
        if (driftOnce) {
          copy.seriesContext = Object.assign({}, copy.seriesContext, {
            publishToken: 'DRIFT'
          });
          driftOnce = false;
        }
        bag[m.matchId] = copy;
      }
    },
    storage: h.storage,
    getIndexByMatchId: function (id) {
      return id === 'm1'
        ? { seriesId: h.series.seriesId, roundId: 'r1', matchId: 'm1' }
        : null;
    },
    now: function () {
      return 1700000000001;
    }
  });
  var res = svc.updatePublishedSeriesRound({
    seriesId: h.series.seriesId,
    roundId: 'r1',
    patch: { gameMode: '四人四球比杆赛' },
    actor: h.actor,
    confirmClearGameModeStructure: true
  });
  assert('回读身份漂移 → 失败', !res.ok && res.reason === 'identity_drift');
  assert(
    '身份漂移全部回滚',
    h.seriesBag[h.series.seriesId].rounds[0].gameMode ===
      beforeSeries.rounds[0].gameMode &&
      JSON.stringify(bag.m1.groups) === JSON.stringify(beforeMatch.groups) &&
      bag.m1.seriesContext.publishToken === beforeMatch.seriesContext.publishToken
  );
})();

console.log('');
console.log('---- seriesRoundUpdate.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
