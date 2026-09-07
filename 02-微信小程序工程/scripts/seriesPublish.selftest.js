/**
 * Series 发布编排自测（4C-1 窄修）
 * 仅使用注入内存 storage / fake repos，不碰真实 wx storage。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesPublish.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');

var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStoreMod = require(path.join(utilsDir, 'seriesStore.js'));
var seriesStationIndexMod = require(path.join(utilsDir, 'seriesStationIndex.js'));
var seriesPublishJournalMod = require(seriesTestPaths.util('seriesPublishJournal.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var seriesPublish = require(seriesTestPaths.util('seriesPublish.js'));
var teamMatchStore = require(path.join(utilsDir, 'teamMatchStore.js'));

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

function createMemoryAdapter() {
  var bag = Object.create(null);
  return {
    getItem: function (key) {
      return { ok: true, value: bag[key] != null ? JSON.parse(JSON.stringify(bag[key])) : null };
    },
    setItem: function (key, value) {
      bag[key] = JSON.parse(JSON.stringify(value));
      return { ok: true };
    },
    _bag: bag
  };
}

function buildPublishableSeries(overrides) {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: '湘鹰队际系列赛',
    createdBy: 'publisher-user-1',
    organization: {
      organizationId: 'org-1',
      organizationName: '湘鹰机构',
      organizationLogo: '/assets/mock-avatars/default-avatar.jpg'
    }
  });
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
  s.visibility = 'public';
  s.accessCode = '';
  s.scoringRule = seriesModel.createDefaultScoringRule({
    mode: 'per_round_n',
    scoreBasis: 'gross',
    allowRepeat: false
  });
  s.rounds = s.rounds.map(function (r, idx) {
    var next = Object.assign({}, r);
    next.name = '第' + (idx + 1) + '轮';
    next.dateTime = '2030-06-0' + (idx + 1) + ' 08:00';
    next.gameMode = '个人比杆赛';
    next.courseId = 'c' + (idx + 1);
    next.courseName = '测试球场' + (idx + 1);
    next.fee = idx === 0 ? '100' : '';
    next.topN = 3;
    return next;
  });
  s.eventInfoList = [];
  s.partnerConfig = null;
  if (overrides) Object.assign(s, overrides);
  return s;
}

function createHarness(extra) {
  var seriesAdapter = createMemoryAdapter();
  var indexAdapter = createMemoryAdapter();
  var journalAdapter = createMemoryAdapter();
  var seriesStore = seriesStoreMod.createSeriesStore(seriesAdapter);
  var stationIndex = seriesStationIndexMod.createSeriesStationIndex(indexAdapter);
  var journal = seriesPublishJournalMod.createSeriesPublishJournal(journalAdapter);
  var matchRepo = seriesPublish.createMemoryMatchRepo();
  var fixedNow = new Date(2026, 5, 1, 12, 0, 0, 0).getTime();
  var deps = {
    seriesStore: seriesStore,
    stationIndex: stationIndex,
    journal: journal,
    matchRepo: matchRepo,
    now: function () {
      return fixedNow;
    }
  };
  if (extra) Object.assign(deps, extra(deps, { seriesAdapter: seriesAdapter, journalAdapter: journalAdapter, indexAdapter: indexAdapter }));
  var publisher = seriesPublish.createSeriesPublisher(deps);
  return {
    seriesStore: deps.seriesStore,
    stationIndex: deps.stationIndex,
    journal: deps.journal,
    matchRepo: deps.matchRepo,
    publisher: publisher,
    fixedNow: fixedNow,
    journalAdapter: journalAdapter,
    seriesAdapter: seriesAdapter,
    indexAdapter: indexAdapter
  };
}

function wrapJournalFailOnce(baseJournal, predicate) {
  var failed = false;
  return {
    getJournal: function (id) {
      return baseJournal.getJournal(id);
    },
    saveJournal: function (j) {
      if (!failed && predicate(j)) {
        failed = true;
        return { ok: false, reason: 'injected_journal_fail' };
      }
      return baseJournal.saveJournal(j);
    }
  };
}

// ---------- fingerprint / builder / fee / teamCompetition ----------
(function testBuilder() {
  var series = buildPublishableSeries();
  var round = series.rounds[0];
  var built = seriesStationMatch.buildMatchFromSeriesRound(series, round, {
    matchId: 'team-match-test-1',
    publishToken: series.publishToken || 'tok-test'
  });
  // ensure token
  if (!series.publishToken) {
    series.publishToken = 'tok-test';
    built = seriesStationMatch.buildMatchFromSeriesRound(series, round, {
      matchId: 'team-match-test-1',
      publishToken: 'tok-test'
    });
  }
  assert('builder ok', built.ok === true, built.reason);
  assert('标题含系列名与轮名', built.match.roundName === '湘鹰队际系列赛 · 第1轮');
  assert(
    'seriesContext 含空副标题快照',
    built.match.seriesContext.seriesSubtitleSnapshot === ''
  );
  var withSub = buildPublishableSeries({ seriesSubtitle: '正式第二行' });
  withSub.publishToken = 'tok-sub';
  var builtSub = seriesStationMatch.buildMatchFromSeriesRound(withSub, withSub.rounds[0], {
    matchId: 'team-match-sub-1',
    publishToken: 'tok-sub'
  });
  assert(
    '副标题进 context 快照且不拼 roundName',
    builtSub.ok &&
      builtSub.match.seriesContext.seriesSubtitleSnapshot === '正式第二行' &&
      builtSub.match.roundName === '湘鹰队际系列赛 · 第1轮' &&
      builtSub.match.roundName.indexOf('正式第二行') < 0
  );
  var fpBase = seriesStationMatch.computeSeriesPlanSourceFingerprint(withSub);
  var fpChanged = seriesStationMatch.computeSeriesPlanSourceFingerprint(
    Object.assign({}, withSub, { seriesSubtitle: '另一行' })
  );
  assert('指纹包含 seriesSubtitle', fpBase !== fpChanged);
  assert('seriesContext.managed', built.match.seriesContext.managed === true);
  assert('registrationStatus closed', built.match.registrationStatus === 'closed');
  assert(
    '分站 deadline 为空（不再从 Series 报名窗写入）',
    built.match.deadlineTime === '' && built.match.deadlineTimeText === ''
  );
  var stationSrc = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'utils', 'seriesStationMatch.js'),
    'utf8'
  );
  assert(
    '发布源指纹不再包含 registrationWindow',
    stationSrc.indexOf('registrationWindow') < 0
  );
  assert('费用映射报名费', built.match.feeList.length === 1 && built.match.feeList[0].name === '报名费');
  var emptyFee = seriesStationMatch.mapRoundFeeToFeeList('', round.roundId);
  assert('空费用 ok 且 []', emptyFee.ok && emptyFee.feeList.length === 0);
  assert(
    'isSeriesManagedMatch',
    seriesStationMatch.isSeriesManagedMatch(built.match) === true
  );
  assert(
    '无 context 非托管',
    seriesStationMatch.isSeriesManagedMatch({ matchId: 'x' }) === false
  );
  assert(
    'per_round_n 写入 teamCompetition.enabled',
    built.match.scoringRules.teamCompetition.enabled === true
  );
  assert(
    'per_round_n topN=round.topN',
    built.match.scoringRules.teamCompetition.topN === 3
  );

  var globalSeries = buildPublishableSeries({
    scoringRule: seriesModel.createDefaultScoringRule({
      mode: 'global_m',
      globalM: 5,
      scoreBasis: 'gross',
      allowRepeat: true
    })
  });
  globalSeries.publishToken = 'tok-g';
  var gBuilt = seriesStationMatch.buildMatchFromSeriesRound(globalSeries, globalSeries.rounds[0], {
    matchId: 'team-match-g',
    publishToken: 'tok-g'
  });
  assert('global_m teamCompetition.enabled=false', gBuilt.ok && gBuilt.match.scoringRules.teamCompetition.enabled === false);
  assert(
    'globalM 未写入分站 scoringRules',
    !gBuilt.match.scoringRules.globalM && gBuilt.match.scoringRules.allowRepeat == null
  );

  var badFee = seriesStationMatch.mapRoundFeeToFeeList('12.345', 'r1');
  assert('非法费用 fee_invalid', badFee.ok === false && badFee.reason === 'fee_invalid');
  var neg = seriesStationMatch.mapRoundFeeToFeeList('-1', 'r1');
  assert('负数 fee_invalid', neg.ok === false);
  var mix = seriesStationMatch.mapRoundFeeToFeeList('12abc', 'r1');
  assert('混合字符 fee_invalid', mix.ok === false);
  var zero = seriesStationMatch.mapRoundFeeToFeeList('0', 'r1');
  assert('0 合法', zero.ok && zero.feeList[0].amount === '0');
  assert('非法 normalizeFeeToFeeList 返回 null', seriesStationMatch.normalizeFeeToFeeList('1.234', 'r') === null);

  var feeSeries = buildPublishableSeries();
  feeSeries.publishToken = 'tok-fee';
  feeSeries.rounds[0].fee = '12.345';
  var freezeBad = seriesStationMatch.freezeRoundPlan(feeSeries, feeSeries.rounds[0], 'm-fee', {
    publishToken: 'tok-fee'
  });
  assert('freezeRoundPlan fee_invalid 失败', freezeBad.ok === false && freezeBad.reason === 'fee_invalid');
})();

// ---------- plan freeze + resume uses frozen payload ----------
(function testPlanAndPublish() {
  var h = createHarness();
  var series = buildPublishableSeries();
  var saved = h.seriesStore.saveDraft(series);
  assert('草稿可保存', saved.ok === true);
  series = saved.series;

  var planned = h.publisher.planPublish(series, { now: h.fixedNow });
  assert('首次 planPublish 成功', planned.ok === true, planned.reason);
  assert('journal 含 planFingerprint', !!(planned.journal && planned.journal.planFingerprint));
  assert('journal planVersion', planned.journal.planVersion === 1);
  assert(
    '新 journal 使用新版本指纹',
    planned.journal.fingerprintVersion === seriesStationMatch.FINGERPRINT_VERSION
  );
  assert('每轮有冻结 payload', planned.journal.rounds.every(function (r) {
    return r.matchPayload && r.payloadFingerprint;
  }));
  series = h.seriesStore.getSeriesById(series.seriesId);

  var frozenName = planned.journal.rounds[0].matchPayload.roundName;

  var drifted = Object.assign({}, series, { seriesName: '被篡改的名字' });
  h.seriesStore.saveDraft(drifted);
  var conflict = h.publisher.publishSeries(series.seriesId, { now: h.fixedNow });
  assert('草稿漂移 → plan_source_conflict', conflict.ok === false && conflict.reason === 'plan_source_conflict');

  h.seriesStore.saveDraft(series);
  var pub = h.publisher.publishSeries(series.seriesId, { now: h.fixedNow });
  assert('发布成功', pub.ok === true, pub.reason);
  assert('lifecycle published', pub.series && pub.series.lifecycleStatus === 'published');
  assert('publishState published', pub.series.publishState === 'published');
  assert('journal done', pub.journal && pub.journal.phase === 'done');
  assert('done 保留 audit', !!(pub.journal.audit && pub.journal.audit.matchIds));

  var m0 = h.matchRepo.getMatchById(planned.journal.rounds[0].matchId);
  assert('分站标题来自冻结计划而非漂移名', m0 && m0.roundName === frozenName);
  assert('分站托管标记', seriesStationMatch.isSeriesManagedMatch(m0));
  assert('分站 teamCompetition 快照', m0.scoringRules.teamCompetition.enabled === true && m0.scoringRules.teamCompetition.topN === 3);

  var again = h.publisher.publishSeries(series.seriesId, { now: h.fixedNow });
  assert('重复发布幂等', again.ok === true);
})();

// ---------- 禁止各 phase 重复冻结 ----------
(function testNoRefreezeEachPhase() {
  var phases = [
    'planned',
    'precheck',
    'writing_matches',
    'writing_index',
    'finalizing',
    'failed',
    'done'
  ];
  phases.forEach(function (phase) {
    var h = createHarness();
    var series = buildPublishableSeries();
    h.seriesStore.saveDraft(series);
    var planned = h.publisher.planPublish(series, { now: h.fixedNow });
    assert('phase用例 plan ok:' + phase, planned.ok === true);
    var j = planned.journal;
    j.phase = phase;
    h.journal.saveJournal(j);
    var tokenBefore = j.publishToken;
    var fpBefore = j.planFingerprint;
    var match0 = j.rounds[0].matchId;
    var again = h.publisher.planPublish(h.seriesStore.getSeriesById(series.seriesId), {
      now: h.fixedNow
    });
    assert(
      'phase=' + phase + ' → plan_already_frozen',
      again.ok === false && again.reason === 'plan_already_frozen'
    );
    var after = h.journal.getJournal(series.seriesId).journal;
    assert('phase=' + phase + ' token 不变', after.publishToken === tokenBefore);
    assert('phase=' + phase + ' planFingerprint 不变', after.planFingerprint === fpBefore);
    assert('phase=' + phase + ' matchId 不变', after.rounds[0].matchId === match0);
  });
})();

// ---------- 未来开球仅首次；resume 不因时间过去失败 ----------
(function testFutureOnlyOnFirstPlan() {
  var h = createHarness();
  var series = buildPublishableSeries();
  h.seriesStore.saveDraft(series);
  var planned = h.publisher.planPublish(series, { now: h.fixedNow });
  assert('plan 使用未来时间通过', planned.ok === true);

  var lateNow = new Date(2031, 0, 1, 0, 0, 0, 0).getTime();
  var pub = h.publisher.publishSeries(series.seriesId, { now: lateNow });
  assert('resume 不因时间过去失败', pub.ok === true, pub.reason);

  var h2 = createHarness();
  var pastSeries = buildPublishableSeries();
  pastSeries.rounds = pastSeries.rounds.map(function (r) {
    return Object.assign({}, r, { dateTime: '2020-01-01 08:00' });
  });
  h2.seriesStore.saveDraft(pastSeries);
  var badPlan = h2.publisher.planPublish(pastSeries, { now: h2.fixedNow });
  assert(
    '首次 plan 拒绝非未来开球',
    badPlan.ok === false && badPlan.reason === 'datetime_not_future'
  );
})();

// ---------- payload_conflict / exact canonical / index ----------
(function testConflictsAndExactPayload() {
  var h = createHarness();
  var series = buildPublishableSeries();
  h.seriesStore.saveDraft(series);
  var planned = h.publisher.planPublish(series, { now: h.fixedNow });
  var rp = planned.journal.rounds[0];

  h.matchRepo.saveMatchChecked(rp.matchPayload);
  var tweaked = Object.assign({}, rp.matchPayload, { courseName: '被改球场' });
  var pc = h.matchRepo.saveMatchChecked(tweaked);
  assert('同身份不同 payload → payload_conflict', pc.ok === false && pc.reason === 'payload_conflict');

  var idem = h.matchRepo.saveMatchChecked(rp.matchPayload);
  assert('同 fingerprint+canonical 幂等', idem.ok === true);

  var link1 = h.stationIndex.setLink(rp.matchId, series.seriesId, rp.roundId);
  var link2 = h.stationIndex.setLink(rp.matchId, series.seriesId, rp.roundId);
  assert('index 同链接幂等', link1.ok && link2.ok && link2.reason === 'idempotent');
  var linkBad = h.stationIndex.setLink(rp.matchId, 'series-other', rp.roundId);
  assert('index 异链接失败', linkBad.ok === false && linkBad.reason === 'conflict');

  var alien = Object.assign({}, rp.matchPayload, {
    seriesContext: Object.assign({}, rp.matchPayload.seriesContext, {
      seriesId: 'series-other'
    })
  });
  var occupy = h.matchRepo.saveMatchChecked(alien);
  assert('异 Series 占用同 matchId → conflict', occupy.ok === false && occupy.reason === 'conflict');

  // 人为制造相同 fingerprint 但 canonical 不同 → 仍 payload_conflict
  var origFp = seriesStationMatch.fingerprintOf;
  seriesStationMatch.fingerprintOf = function () {
    return 'fp_forced_collision';
  };
  try {
    var repo2 = seriesPublish.createMemoryMatchRepo();
    var a = JSON.parse(JSON.stringify(rp.matchPayload));
    a.matchId = 'collision-id';
    a.courseName = '球场A';
    var b = JSON.parse(JSON.stringify(a));
    b.courseName = '球场B';
    var w1 = repo2.saveMatchChecked(a);
    var w2 = repo2.saveMatchChecked(b);
    assert('碰撞 hash 写入第一场成功', w1.ok === true, w1.reason);
    assert(
      'hash相同但canonical不同 → payload_conflict',
      w2.ok === false && w2.reason === 'payload_conflict',
      w2.detail
    );
    var eq = seriesStationMatch.stationPayloadsEqual(a, b);
    assert('stationPayloadsEqual 检出 canonical_mismatch', eq.equal === false && eq.reason === 'canonical_mismatch');
  } finally {
    seriesStationMatch.fingerprintOf = origFp;
  }
})();

// ---------- 中途失败可恢复；finalize 失败保留 journal ----------
(function testResumeAfterPartial() {
  var failOnce = true;
  var h = createHarness(function (deps) {
    var matchRepo = deps.matchRepo;
    return {
      matchRepo: {
        getMatchById: function (id) {
          return matchRepo.getMatchById(id);
        },
        existsMatchId: function (id) {
          return matchRepo.existsMatchId(id);
        },
        saveMatchChecked: function (match) {
          if (failOnce && match && String(match.roundName || '').indexOf('第2轮') >= 0) {
            failOnce = false;
            return { ok: false, reason: 'injected_write_fail' };
          }
          return matchRepo.saveMatchChecked(match);
        },
        _count: function () {
          return matchRepo._count();
        }
      }
    };
  });

  var series = buildPublishableSeries();
  h.seriesStore.saveDraft(series);
  var first = h.publisher.publishSeries(series.seriesId, { now: h.fixedNow });
  assert('第二轮注入失败', first.ok === false && first.reason === 'injected_write_fail');
  assert('失败后 journal 非 done', first.journal && first.journal.phase === 'failed');
  assert('失败后 publishState=failed', first.series && first.series.publishState === 'failed');
  assert('失败后 lifecycle 仍 draft', first.series.lifecycleStatus === 'draft');
  assert('失败后保留 matchId', !!(first.series.rounds[0] && first.series.rounds[0].matchId));
  var written = first.journal.rounds.filter(function (r) {
    return r.status === 'written' || r.status === 'indexed';
  });
  assert('已有轮次写入被保留', written.length >= 1);

  var resumed = h.publisher.resumePublish(series.seriesId, { now: h.fixedNow });
  assert('失败后 resume 成功', resumed.ok === true, resumed.reason);
  assert('resume 后 done', resumed.journal.phase === 'done');
})();

(function testFinalizeFailKeepsJournal() {
  var failFinalizeOnce = true;
  var h = createHarness(function (deps) {
    var baseStore = deps.seriesStore;
    return {
      seriesStore: {
        getSeriesById: function (id) {
          return baseStore.getSeriesById(id);
        },
        saveDraft: function (s) {
          return baseStore.saveDraft(s);
        },
        upsertSeries: function (s) {
          if (failFinalizeOnce && s && s.lifecycleStatus === 'published') {
            failFinalizeOnce = false;
            return { ok: false, reason: 'injected_finalize_fail' };
          }
          return baseStore.upsertSeries(s);
        }
      }
    };
  });

  var series = buildPublishableSeries();
  h.seriesStore.saveDraft(series);
  var first = h.publisher.publishSeries(series.seriesId, { now: h.fixedNow });
  assert('finalize 注入失败', first.ok === false && first.reason === 'injected_finalize_fail');
  assert('finalize 失败 journal 保留', !!(first.journal && first.journal.planFingerprint));
  assert('finalize 失败 phase=failed', first.journal.phase === 'failed');
  assert(
    '分站已写入仍在',
    first.journal.rounds.every(function (r) {
      return h.matchRepo.getMatchById(r.matchId);
    })
  );
  var retry = h.publisher.repairHalfPublished(series.seriesId, { now: h.fixedNow });
  assert('finalize 失败后 repair 成功', retry.ok === true, retry.reason);
  assert('重试后 published', retry.series && retry.series.lifecycleStatus === 'published');
})();

// ---------- journal 写入闸门故障注入 ----------
(function testJournalGates() {
  // 1) writing_matches 阶段日志失败 → 0 场 match
  (function () {
    var base = createHarness();
    var series = buildPublishableSeries();
    base.seriesStore.saveDraft(series);
    base.publisher.planPublish(series, { now: base.fixedNow });
    var wrapped = wrapJournalFailOnce(base.journal, function (j) {
      return j && j.phase === 'writing_matches';
    });
    var publisher = seriesPublish.createSeriesPublisher({
      seriesStore: base.seriesStore,
      stationIndex: base.stationIndex,
      journal: wrapped,
      matchRepo: base.matchRepo,
      now: function () {
        return base.fixedNow;
      }
    });
    var before = base.matchRepo._count();
    var res = publisher.publishSeries(series.seriesId, { now: base.fixedNow });
    assert('wm阶段日志失败', res.ok === false && res.reason === 'journal_write_failed' && res.stage === 'writing_matches');
    assert('wm阶段日志失败 0场match', base.matchRepo._count() === before);
  })();

  // 2) 第一场 match 成功但 written 日志失败 → 不写第二场
  (function () {
    var base = createHarness();
    var series = buildPublishableSeries();
    base.seriesStore.saveDraft(series);
    var planned = base.publisher.planPublish(series, { now: base.fixedNow });
    var firstMatchId = planned.journal.rounds[0].matchId;
    var secondMatchId = planned.journal.rounds[1].matchId;
    var writtenFailArmed = false;
    var wrapped = {
      getJournal: function (id) {
        return base.journal.getJournal(id);
      },
      saveJournal: function (j) {
        var rounds = (j && j.rounds) || [];
        var firstWritten = rounds[0] && rounds[0].status === 'written';
        var secondPending = rounds[1] && rounds[1].status === 'pending';
        if (!writtenFailArmed && j.phase === 'writing_matches' && firstWritten && secondPending) {
          writtenFailArmed = true;
          return { ok: false, reason: 'injected_written_log_fail' };
        }
        return base.journal.saveJournal(j);
      }
    };
    var publisher = seriesPublish.createSeriesPublisher({
      seriesStore: base.seriesStore,
      stationIndex: base.stationIndex,
      journal: wrapped,
      matchRepo: base.matchRepo,
      now: function () {
        return base.fixedNow;
      }
    });
    var res = publisher.publishSeries(series.seriesId, { now: base.fixedNow });
    assert('written日志失败停止', res.ok === false && res.reason === 'journal_write_failed');
    assert('第一场已存在', !!base.matchRepo.getMatchById(firstMatchId));
    assert('第二场未写', !base.matchRepo.getMatchById(secondMatchId));
  })();

  // 3) writing_index 阶段日志失败 → 0 条新 index
  (function () {
    var base = createHarness();
    var series = buildPublishableSeries();
    base.seriesStore.saveDraft(series);
    base.publisher.planPublish(series, { now: base.fixedNow });
    var wrapped = wrapJournalFailOnce(base.journal, function (j) {
      return j && j.phase === 'writing_index';
    });
    var publisher = seriesPublish.createSeriesPublisher({
      seriesStore: base.seriesStore,
      stationIndex: base.stationIndex,
      journal: wrapped,
      matchRepo: base.matchRepo,
      now: function () {
        return base.fixedNow;
      }
    });
    var res = publisher.publishSeries(series.seriesId, { now: base.fixedNow });
    assert('wi阶段日志失败', res.ok === false && res.stage === 'writing_index');
    var idxCount = 0;
    plannedRounds(base).forEach(function (rp) {
      if (base.stationIndex.getByMatchId(rp.matchId)) idxCount += 1;
    });
    assert('wi阶段日志失败 0条index', idxCount === 0);

    function plannedRounds(h) {
      var j = h.journal.getJournal(series.seriesId).journal;
      return (j && j.rounds) || [];
    }
  })();

  // 4) 第一条 index 成功但 indexed 日志失败 → 停止
  (function () {
    var base = createHarness();
    var series = buildPublishableSeries();
    base.seriesStore.saveDraft(series);
    var planned = base.publisher.planPublish(series, { now: base.fixedNow });
    var m0 = planned.journal.rounds[0].matchId;
    var m1 = planned.journal.rounds[1].matchId;
    var armed = false;
    var wrapped = {
      getJournal: function (id) {
        return base.journal.getJournal(id);
      },
      saveJournal: function (j) {
        var rounds = (j && j.rounds) || [];
        if (
          !armed &&
          j.phase === 'writing_index' &&
          rounds[0] &&
          rounds[0].status === 'indexed' &&
          rounds[1] &&
          rounds[1].status === 'written'
        ) {
          armed = true;
          return { ok: false, reason: 'injected_indexed_log_fail' };
        }
        return base.journal.saveJournal(j);
      }
    };
    var publisher = seriesPublish.createSeriesPublisher({
      seriesStore: base.seriesStore,
      stationIndex: base.stationIndex,
      journal: wrapped,
      matchRepo: base.matchRepo,
      now: function () {
        return base.fixedNow;
      }
    });
    var res = publisher.publishSeries(series.seriesId, { now: base.fixedNow });
    assert('indexed日志失败停止', res.ok === false && res.reason === 'journal_write_failed');
    assert('第一条 index 已存在', !!base.stationIndex.getByMatchId(m0));
    assert('第二条 index 未写', !base.stationIndex.getByMatchId(m1));
  })();

  // 5) finalizing 阶段日志失败 → Series 不迁移
  (function () {
    var base = createHarness();
    var series = buildPublishableSeries();
    base.seriesStore.saveDraft(series);
    base.publisher.planPublish(series, { now: base.fixedNow });
    var wrapped = wrapJournalFailOnce(base.journal, function (j) {
      return j && j.phase === 'finalizing';
    });
    var publisher = seriesPublish.createSeriesPublisher({
      seriesStore: base.seriesStore,
      stationIndex: base.stationIndex,
      journal: wrapped,
      matchRepo: base.matchRepo,
      now: function () {
        return base.fixedNow;
      }
    });
    var res = publisher.publishSeries(series.seriesId, { now: base.fixedNow });
    assert('finalizing日志失败', res.ok === false && res.stage === 'finalizing');
    var s = base.seriesStore.getSeriesById(series.seriesId);
    assert('finalizing日志失败 Series 仍 draft', s.lifecycleStatus === 'draft');
  })();

  // 6) done 日志失败 → Series published，返回可恢复；重试后 done
  (function () {
    var base = createHarness();
    var series = buildPublishableSeries();
    base.seriesStore.saveDraft(series);
    base.publisher.planPublish(series, { now: base.fixedNow });
    var wrapped = wrapJournalFailOnce(base.journal, function (j) {
      return j && j.phase === 'done';
    });
    var publisher = seriesPublish.createSeriesPublisher({
      seriesStore: base.seriesStore,
      stationIndex: base.stationIndex,
      journal: wrapped,
      matchRepo: base.matchRepo,
      now: function () {
        return base.fixedNow;
      }
    });
    var res = publisher.publishSeries(series.seriesId, { now: base.fixedNow });
    assert('done日志失败 reason', res.ok === false && res.reason === 'journal_finalize_failed');
    assert('done日志失败 seriesPublished', res.seriesPublished === true);
    assert(
      'done日志失败返回 published Series 对象',
      res.series && res.series.lifecycleStatus === 'published' && res.series.publishState === 'published'
    );
    var s = base.seriesStore.getSeriesById(series.seriesId);
    assert('done日志失败后 Series published', s.lifecycleStatus === 'published');
    var insp = publisher.inspectPublishState(series.seriesId);
    assert('inspect 检出 publishedWithoutJournalDone', insp.publishedWithoutJournalDone === true);
    var repair = publisher.repairHalfPublished(series.seriesId, { now: base.fixedNow });
    assert('重试补齐 done', repair.ok === true, repair.reason);
    var j = base.journal.getJournal(series.seriesId).journal;
    assert('重试后 journal done', j.phase === 'done');
  })();
})();

// ---------- 严格 validateFrozenJournal + published 实体核验回归 ----------
(function testStrictJournalAndPublishedRepair() {
  function publishComplete(h) {
    var series = buildPublishableSeries();
    h.seriesStore.saveDraft(series);
    var pub = h.publisher.publishSeries(series.seriesId, { now: h.fixedNow });
    assert('基线发布成功', pub.ok === true, pub.reason);
    return { seriesId: series.seriesId, journal: pub.journal, series: pub.series };
  }

  function mutateJournal(h, seriesId, mutator) {
    var j = h.journal.getJournal(seriesId).journal;
    mutator(j);
    // 直接写入 adapter，允许制造 seriesId 为空等 saveJournal 会拒绝的损坏态
    var key = seriesPublishJournalMod.STORAGE_KEY;
    var map = h.journalAdapter._bag[key] || {};
    map[seriesId] = JSON.parse(JSON.stringify(j));
    h.journalAdapter._bag[key] = map;
    return j;
  }

  // 1-8 corrupt cases
  (function () {
    var cases = [
      {
        name: '缺 seriesId',
        mut: function (j) {
          j.seriesId = '';
        },
        detail: 'header_incomplete'
      },
      {
        name: '缺 token',
        mut: function (j) {
          j.publishToken = '';
        },
        detail: 'header_incomplete'
      },
      {
        name: '缺 sourceFingerprint',
        mut: function (j) {
          j.sourceFingerprint = '';
        },
        detail: 'header_incomplete'
      },
      {
        name: '非法 phase',
        mut: function (j) {
          j.phase = 'weird';
        },
        detail: 'phase_invalid'
      },
      {
        name: '重复 roundId',
        mut: function (j) {
          j.rounds[1].roundId = j.rounds[0].roundId;
          j.rounds[1].matchPayload.seriesContext.roundId = j.rounds[0].roundId;
          j.rounds[1].payloadFingerprint = seriesStationMatch.computeStationPayloadFingerprint(
            j.rounds[1].matchPayload
          );
          j.planFingerprint = seriesStationMatch.computePlanFingerprint(j.rounds);
        },
        detail: 'duplicate_roundId'
      },
      {
        name: '重复 matchId',
        mut: function (j) {
          j.rounds[1].matchId = j.rounds[0].matchId;
          j.rounds[1].matchPayload.matchId = j.rounds[0].matchId;
          j.rounds[1].payloadFingerprint = seriesStationMatch.computeStationPayloadFingerprint(
            j.rounds[1].matchPayload
          );
          j.planFingerprint = seriesStationMatch.computePlanFingerprint(j.rounds);
        },
        detail: 'duplicate_matchId'
      },
      {
        name: 'payload 缺失',
        mut: function (j) {
          j.rounds[0].matchPayload = null;
        },
        detail: 'round_fields_incomplete'
      },
      {
        name: 'seriesContext seriesId 篡改',
        mut: function (j) {
          j.rounds[0].matchPayload.seriesContext.seriesId = 'other-series';
          j.rounds[0].payloadFingerprint = seriesStationMatch.computeStationPayloadFingerprint(
            j.rounds[0].matchPayload
          );
          j.planFingerprint = seriesStationMatch.computePlanFingerprint(j.rounds);
        },
        detail: 'series_context_seriesId'
      },
      {
        name: 'seriesContext roundId 篡改',
        mut: function (j) {
          j.rounds[0].matchPayload.seriesContext.roundId = 'round-tampered';
          j.rounds[0].payloadFingerprint = seriesStationMatch.computeStationPayloadFingerprint(
            j.rounds[0].matchPayload
          );
          j.planFingerprint = seriesStationMatch.computePlanFingerprint(j.rounds);
        },
        detail: 'series_context_roundId'
      },
      {
        name: 'seriesContext token 篡改',
        mut: function (j) {
          j.rounds[0].matchPayload.seriesContext.publishToken = 'tok-tampered';
          j.rounds[0].payloadFingerprint = seriesStationMatch.computeStationPayloadFingerprint(
            j.rounds[0].matchPayload
          );
          j.planFingerprint = seriesStationMatch.computePlanFingerprint(j.rounds);
        },
        detail: 'series_context_publishToken'
      },
      {
        name: 'payload fingerprint 篡改',
        mut: function (j) {
          j.rounds[0].payloadFingerprint = 'fp_tampered';
          j.planFingerprint = seriesStationMatch.computePlanFingerprint(j.rounds);
        },
        detail: 'payload_fingerprint_mismatch'
      },
      {
        name: 'plan fingerprint 篡改',
        mut: function (j) {
          j.planFingerprint = 'fp_plan_tampered';
        },
        detail: 'plan_fingerprint_mismatch'
      }
    ];

    cases.forEach(function (c) {
      var h = createHarness();
      var base = publishComplete(h);
      // 回到非 done 以便 publish 继续路径也会校验；并清空 match 计数基线
      mutateJournal(h, base.seriesId, function (j) {
        j.phase = 'failed';
        c.mut(j);
      });
      var matchCountBefore = h.matchRepo._count();
      var seriesBefore = h.seriesStore.getSeriesById(base.seriesId);
      var v = seriesStationMatch.validateFrozenJournal(h.journal.getJournal(base.seriesId).journal);
      assert('corrupt校验:' + c.name, v.ok === false && v.reason === 'journal_corrupt', v.detail);
      if (c.detail) {
        assert('corrupt detail:' + c.name, v.detail === c.detail, v.detail);
      }
      var pub = h.publisher.publishSeries(base.seriesId, { now: h.fixedNow });
      assert('corrupt publish 停止:' + c.name, pub.ok === false && pub.reason === 'journal_corrupt');
      assert('corrupt 无新增 match:' + c.name, h.matchRepo._count() === matchCountBefore);
      var seriesAfter = h.seriesStore.getSeriesById(base.seriesId);
      assert(
        'corrupt 不改 lifecycle:' + c.name,
        seriesAfter.lifecycleStatus === seriesBefore.lifecycleStatus
      );
      var plan = h.publisher.planPublish(seriesAfter, { now: h.fixedNow });
      assert('corrupt 禁止重冻:' + c.name, plan.ok === false && plan.reason === 'journal_corrupt');
      var insp = h.publisher.inspectPublishState(base.seriesId);
      assert('inspect 报 journalCorrupt:' + c.name, insp.journalCorrupt === true);
      var resume = h.publisher.resumePublish(base.seriesId, { now: h.fixedNow });
      assert('resume corrupt:' + c.name, resume.ok === false && resume.reason === 'journal_corrupt');
      var repair = h.publisher.repairHalfPublished(base.seriesId, { now: h.fixedNow });
      assert('repair corrupt:' + c.name, repair.ok === false && repair.reason === 'journal_corrupt');
    });
  })();

  // 9 published + 缺一个分站 → 可按冻结计划补写后 done
  (function () {
    var h = createHarness();
    var base = publishComplete(h);
    mutateJournal(h, base.seriesId, function (j) {
      j.phase = 'finalizing';
    });
    var mid0 = base.journal.rounds[0].matchId;
    h.matchRepo._remove(mid0);
    var insp = h.publisher.inspectPublishState(base.seriesId);
    assert('缺分站 inspect missing', insp.missingMatches.length === 1);
    assert('缺分站 publishedWithoutJournalDone', insp.publishedWithoutJournalDone === true);
    var repair = h.publisher.repairHalfPublished(base.seriesId, { now: h.fixedNow });
    assert('缺分站可补写 done', repair.ok === true, repair.reason);
    assert('补写后分站存在', !!h.matchRepo.getMatchById(mid0));
    assert('补写后 journal done', h.journal.getJournal(base.seriesId).journal.phase === 'done');
    assert(
      '补写后 Series 仍 published',
      h.seriesStore.getSeriesById(base.seriesId).lifecycleStatus === 'published'
    );
  })();

  // 10 published + 分站 payload 冲突 → 不得覆盖、不得假 done
  (function () {
    var h = createHarness();
    var base = publishComplete(h);
    mutateJournal(h, base.seriesId, function (j) {
      j.phase = 'finalizing';
    });
    var mid0 = base.journal.rounds[0].matchId;
    var conflicted = Object.assign({}, base.journal.rounds[0].matchPayload, {
      courseName: '冲突球场'
    });
    h.matchRepo._inject(conflicted);
    var insp = h.publisher.inspectPublishState(base.seriesId);
    assert('冲突 inspect payloadConflicts', insp.payloadConflicts.length >= 1);
    var repair = h.publisher.repairHalfPublished(base.seriesId, { now: h.fixedNow });
    assert(
      '冲突不得假 done',
      repair.ok === false && repair.reason === 'published_entity_conflict',
      repair.reason
    );
    assert('冲突不覆盖分站', h.matchRepo.getMatchById(mid0).courseName === '冲突球场');
    assert('冲突 journal 非 done', h.journal.getJournal(base.seriesId).journal.phase !== 'done');
    assert(
      '冲突 Series 仍 published',
      h.seriesStore.getSeriesById(base.seriesId).lifecycleStatus === 'published'
    );
  })();

  // 11 published + 缺一个索引 → 可补
  (function () {
    var h = createHarness();
    var base = publishComplete(h);
    mutateJournal(h, base.seriesId, function (j) {
      j.phase = 'writing_index';
    });
    var mid0 = base.journal.rounds[0].matchId;
    h.stationIndex.removeByMatchId(mid0);
    var insp = h.publisher.inspectPublishState(base.seriesId);
    assert('缺索引 inspect', insp.missingIndexes.length === 1);
    var repair = h.publisher.repairHalfPublished(base.seriesId, { now: h.fixedNow });
    assert('缺索引可补 done', repair.ok === true, repair.reason);
    assert('索引已恢复', !!h.stationIndex.getByMatchId(mid0));
  })();

  // 12 published + 索引指向其他 Series/round → conflict
  (function () {
    var h = createHarness();
    var base = publishComplete(h);
    mutateJournal(h, base.seriesId, function (j) {
      j.phase = 'finalizing';
    });
    var mid0 = base.journal.rounds[0].matchId;
    h.stationIndex.removeByMatchId(mid0);
    // 强制写入异链接：先 setLink other（remove 后 set）
    var bad = h.stationIndex.setLink(mid0, 'series-other', 'round-other');
    assert('异链接写入', bad.ok === true);
    var insp = h.publisher.inspectPublishState(base.seriesId);
    assert('异链接 inspect conflict', insp.indexConflicts.length >= 1);
    var repair = h.publisher.repairHalfPublished(base.seriesId, { now: h.fixedNow });
    assert('异链接不得假 done', repair.ok === false && repair.reason === 'published_entity_conflict');
    var link = h.stationIndex.getByMatchId(mid0);
    assert('异链接不被覆盖', link.seriesId === 'series-other');
    assert('异链接 journal 非 done', h.journal.getJournal(base.seriesId).journal.phase !== 'done');
  })();

  // 13 全部实体完整才补 done
  (function () {
    var h = createHarness();
    var base = publishComplete(h);
    mutateJournal(h, base.seriesId, function (j) {
      j.phase = 'finalizing';
    });
    var insp = h.publisher.inspectPublishState(base.seriesId);
    assert('完整实体 inspect entities.ok', insp.entities && insp.entities.ok === true);
    var repair = h.publisher.repairHalfPublished(base.seriesId, { now: h.fixedNow });
    assert('完整才补 done', repair.ok === true, repair.reason);
    assert('journal 已 done', h.journal.getJournal(base.seriesId).journal.phase === 'done');
  })();
})();

// ---------- publishState / sourceFingerprint 不含运行字段 / token 先持久化 ----------
(function testPublishStateAndSourceFp() {
  var h = createHarness();
  var series = buildPublishableSeries();
  series.publishToken = '';
  h.seriesStore.saveDraft(series);
  var planned = h.publisher.planPublish(h.seriesStore.getSeriesById(series.seriesId), {
    now: h.fixedNow
  });
  assert('空 token 首次 plan 成功', planned.ok === true, planned.reason);
  var afterPlan = h.seriesStore.getSeriesById(series.seriesId);
  assert('token 已先持久化到草稿', !!(afterPlan.publishToken && afterPlan.publishToken.length > 0));
  assert(
    'sourceFingerprint 含 token',
    planned.journal.sourceFingerprint ===
      seriesStationMatch.computeSeriesPlanSourceFingerprint(afterPlan)
  );

  // 开始执行后 publishing
  var failOnce = true;
  var h2 = createHarness(function (deps) {
    var matchRepo = deps.matchRepo;
    return {
      matchRepo: {
        getMatchById: function (id) {
          return matchRepo.getMatchById(id);
        },
        existsMatchId: function (id) {
          return matchRepo.existsMatchId(id);
        },
        saveMatchChecked: function (m) {
          if (failOnce) {
            failOnce = false;
            return { ok: false, reason: 'stop_after_publishing_state' };
          }
          return matchRepo.saveMatchChecked(m);
        }
      }
    };
  });
  var s2 = buildPublishableSeries();
  h2.seriesStore.saveDraft(s2);
  h2.publisher.planPublish(s2, { now: h2.fixedNow });
  var midFail = h2.publisher.publishSeries(s2.seriesId, { now: h2.fixedNow });
  assert('执行中失败', midFail.ok === false);
  assert('失败 publishState=failed', midFail.series.publishState === 'failed');
  assert('失败 lifecycle draft', midFail.series.lifecycleStatus === 'draft');
  assert('预分配 matchId 保留', !!midFail.series.rounds[0].matchId);

  var src = seriesStationMatch.computeSeriesPlanSourceFingerprint;
  var sample = buildPublishableSeries();
  sample.publishToken = 'tok';
  sample.publishState = 'publishing';
  sample.lifecycleStatus = 'draft';
  sample.rounds[0].matchId = 'should-not-affect';
  var a = src(sample);
  sample.publishState = 'failed';
  sample.lifecycleStatus = 'published';
  sample.rounds[0].matchId = 'other';
  var b = src(sample);
  assert('sourceFingerprint 不含 publish 运行字段', a === b);

  var exportsPub = h.publisher;
  assert('导出 resumePublish', typeof exportsPub.resumePublish === 'function');
  assert('导出 inspectPublishState', typeof exportsPub.inspectPublishState === 'function');
  assert('导出 repairHalfPublished', typeof exportsPub.repairHalfPublished === 'function');
})();

// ---------- 费用预检在写 journal 前 ----------
(function testFeePrecheckBeforeJournal() {
  var h = createHarness();
  var series = buildPublishableSeries();
  series.rounds[1].fee = '12.999';
  h.seriesStore.saveDraft(series);
  var planned = h.publisher.planPublish(series, { now: h.fixedNow });
  assert('非法费用阻止 plan', planned.ok === false && planned.reason === 'fee_invalid');
  assert('未写 journal', h.journal.getJournal(series.seriesId).journal == null);
})();

// ---------- 队内赛 matchId：稳定 pending / 重试复用 / 无预设才新生 ----------
(function testMatchIdReuseContract() {
  function isLegalMatchId(id) {
    return typeof id === 'string' && /^team-match-\S+$/.test(id);
  }
  var pending = 'team-match-stable-retry';
  var first = teamMatchStore.buildMatchFromCreatePage({
    pendingMatchId: pending,
    matchType: 'team-internal',
    teamName: '甲队'
  });
  var retry = teamMatchStore.buildMatchFromCreatePage({
    pendingMatchId: pending,
    matchId: pending,
    matchType: 'team-internal',
    teamName: '甲队'
  });
  var fromMatchId = teamMatchStore.buildMatchFromCreatePage({
    matchId: pending,
    matchType: 'team-internal',
    teamName: '甲队'
  });
  assert(
    '创建使用稳定 pendingMatchId/matchId',
    !!(first && first.matchId === pending && retry.matchId === pending && fromMatchId.matchId === pending)
  );
  assert(
    '同一次提交与超时重试复用同一 matchId',
    first.matchId === retry.matchId && retry.matchId === pending
  );
  assert('重试不生成第二场 id', first.matchId === retry.matchId && first.matchId === fromMatchId.matchId);

  var generated = teamMatchStore.buildMatchFromCreatePage({
    matchType: 'team-internal',
    teamName: '乙队'
  });
  var generatedId = generated && generated.matchId;
  assert(
    '无预设 ID 才生成新 ID 且格式合法',
    isLegalMatchId(generatedId) && generatedId !== pending
  );
  var reusedGenerated = teamMatchStore.buildMatchFromCreatePage({
    pendingMatchId: generatedId,
    matchType: 'team-internal',
    teamName: '乙队'
  });
  assert('生成后回填 pending 仍复用', !!(reusedGenerated && reusedGenerated.matchId === generatedId));
  var other = teamMatchStore.buildMatchFromCreatePage({
    pendingMatchId: 'team-match-other-station',
    matchType: 'team-internal',
    teamName: '丙队'
  });
  assert(
    '不同预设 ID 互不碰撞',
    !!(other && other.matchId === 'team-match-other-station' && other.matchId !== pending && other.matchId !== generatedId)
  );

  assert('saveMatch 函数仍存在', typeof teamMatchStore.saveMatch === 'function');
  assert('saveMatchChecked 为新增导出', typeof teamMatchStore.saveMatchChecked === 'function');
  assert('existsMatchId 为新增导出', typeof teamMatchStore.existsMatchId === 'function');

  var pageSrc = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'miniprogram',
      'subpackages',
      'create',
      'pages',
      'series',
      'index.js'
    ),
    'utf8'
  );
  // 创建发布已开放：页面经 adapter 调用 publishSeries；不再断言 Step6 锁定
  assert(
    '创建发布经 adapter 挂 publishSeries',
    pageSrc.indexOf('seriesPublishAdapter') >= 0 &&
      pageSrc.indexOf('runCreatePublish') >= 0 &&
      pageSrc.indexOf('publishSeries') >= 0
  );
})();

// ---------- validateForPublish 不含未来开球规则 ----------
(function testValidateForPublishClean() {
  var validatorsSrc = fs.readFileSync(path.join(utilsDir, 'seriesValidators.js'), 'utf8');
  assert(
    'validateForPublish 无 datetime_not_future',
    validatorsSrc.indexOf('datetime_not_future') < 0
  );
  assert(
    '未来开球在 seriesPublish',
    fs.readFileSync(seriesTestPaths.util('seriesPublish.js'), 'utf8').indexOf('datetime_not_future') >= 0
  );
})();

// ---------- 报名 B1：发布默认 open / revision 与 fingerprint 边界 ----------
(function testRegistrationPublishDefaults() {
  // 1) draft closed/rev0 → 首次发布 open/rev1
  var h = createHarness();
  var series = buildPublishableSeries();
  var saved = h.seriesStore.saveDraft(series);
  assert('报名发布-草稿可保存', saved.ok === true);
  series = saved.series;
  assert(
    '报名发布-draft closed/rev0',
    series.registrationState === 'closed' && series.registrationRevision === 0
  );
  var pub = h.publisher.publishSeries(series.seriesId, { now: h.fixedNow });
  assert('报名发布-首次发布成功', pub.ok === true, pub.reason);
  assert(
    '报名发布-首次 → open/rev1',
    pub.series.registrationState === 'open' && pub.series.registrationRevision === 1
  );

  // 2) finalize 失败后 resume：series 已 open/1，不得再 +revision
  var failDoneOnce = true;
  var h2 = createHarness(function (deps) {
    var baseJournal = deps.journal;
    return {
      journal: {
        getJournal: function (id) {
          return baseJournal.getJournal(id);
        },
        saveJournal: function (j) {
          if (failDoneOnce && j && j.phase === 'done') {
            failDoneOnce = false;
            return { ok: false, reason: 'injected_journal_done_fail' };
          }
          return baseJournal.saveJournal(j);
        }
      }
    };
  });
  var s2 = buildPublishableSeries();
  h2.seriesStore.saveDraft(s2);
  var firstFail = h2.publisher.publishSeries(s2.seriesId, { now: h2.fixedNow });
  assert(
    '报名发布-finalize journal done 失败',
    firstFail.ok === false && firstFail.reason === 'journal_finalize_failed',
    firstFail.reason
  );
  assert(
    '报名发布-失败时 Series 已 open/1',
    firstFail.series &&
      firstFail.series.lifecycleStatus === 'published' &&
      firstFail.series.registrationState === 'open' &&
      firstFail.series.registrationRevision === 1
  );
  var resumed = h2.publisher.resumePublish(s2.seriesId, { now: h2.fixedNow });
  assert('报名发布-resume 成功', resumed.ok === true, resumed.reason);
  assert(
    '报名发布-resume 不重复加 revision',
    resumed.series.registrationState === 'open' &&
      resumed.series.registrationRevision === 1
  );

  // 3) published + journal 非 done repair：已 open 不加 revision
  var h3 = createHarness();
  var s3 = buildPublishableSeries();
  h3.seriesStore.saveDraft(s3);
  var pub3 = h3.publisher.publishSeries(s3.seriesId, { now: h3.fixedNow });
  assert('报名发布-基线 published', pub3.ok === true);
  var j3 = h3.journal.getJournal(s3.seriesId).journal;
  j3.phase = 'finalizing';
  h3.journal.saveJournal(j3);
  var repaired = h3.publisher.repairHalfPublished(s3.seriesId, { now: h3.fixedNow });
  assert('报名发布-repair 成功', repaired.ok === true, repaired.reason);
  assert(
    '报名发布-repair 已 open 不加 revision',
    repaired.series.registrationState === 'open' &&
      repaired.series.registrationRevision === 1
  );

  // 4) published 且 closed/rev>0 → repair 不重新打开
  var closed = JSON.parse(JSON.stringify(repaired.series));
  closed.registrationState = 'closed';
  closed.registrationRevision = 2;
  assert('报名发布-写入明确关闭', h3.seriesStore.upsertSeries(closed).ok);
  var j4 = h3.journal.getJournal(s3.seriesId).journal;
  j4.phase = 'finalizing';
  h3.journal.saveJournal(j4);
  var repairClosed = h3.publisher.repairHalfPublished(s3.seriesId, { now: h3.fixedNow });
  assert('报名发布-关闭后 repair ok', repairClosed.ok === true, repairClosed.reason);
  assert(
    '报名发布-repair 不重新打开',
    repairClosed.series.registrationState === 'closed' &&
      repairClosed.series.registrationRevision === 2
  );

  // 5) roster/state/revision 不进 station source fingerprint
  var base = buildPublishableSeries();
  base.publishToken = 'tok-reg-fp';
  var fpA = seriesStationMatch.computeSeriesPlanSourceFingerprint(base);
  base.registrationState = 'open';
  base.registrationRevision = 9;
  base.roster = [
    {
      rosterEntryId: 'e1',
      seriesId: base.seriesId,
      seriesParticipantId: base.participants[0].seriesParticipantId,
      playerId: 'u1',
      registrationStatus: 'registered'
    }
  ];
  var fpB = seriesStationMatch.computeSeriesPlanSourceFingerprint(base);
  assert('报名发布-fingerprint 忽略 roster/state/revision', fpA === fpB);
})();

(function testDivisionFourballReadbackAndResume() {
  var participantDraft = require(path.join(
    __dirname,
    '..',
    'miniprogram',
    'subpackages',
    'create',
    'pages',
    'series',
    'participantDraft.js'
  ));

  function buildDivisionFourballSeries() {
    var s = seriesModel.createEmptySeriesDraft({
      hostMode: 'team',
      templateId: 'division_series',
      seriesName: '星途俱乐部2026队内对抗赛',
      createdBy: 'u-creator-1',
      hostTeam: { teamId: 'team-host-1', teamName: '星途俱乐部', teamLogo: '' }
    });
    s = participantDraft.ensureDefaultDivisionsIfNeeded(s);
    s.visibility = 'public';
    s.scoringRule = seriesModel.createDefaultScoringRule({
      mode: 'per_round_n',
      scoreBasis: 'gross',
      allowRepeat: false
    });
    s.rounds = s.rounds.map(function (r, idx) {
      var next = Object.assign({}, r);
      next.dateTime = '2030-08-0' + (idx + 1) + ' 08:00';
      next.gameMode = '四人四球比杆赛';
      next.courseId = 'c' + (idx + 1);
      next.courseName = '球场' + (idx + 1);
      next.fee = '';
      next.topN = 2;
      return next;
    });
    return s;
  }

  var combo = buildDivisionFourballSeries();
  assert(
    '组合：队内/分队/2 轮/allowRepeat=false/topN=2',
    combo.templateId === 'division_series' &&
      combo.hostMode === 'team' &&
      combo.rounds.length === 2 &&
      combo.scoringRule.allowRepeat === false &&
      combo.rounds[0].topN === 2 &&
      combo.rounds[1].topN === 2
  );

  function createNormalizingMatchRepo() {
    return seriesPublish.createMemoryMatchRepo({ normalizeOnGet: true });
  }

  var series = buildDivisionFourballSeries();
  series.publishToken = 'tok-div-4ball';
  var built = seriesStationMatch.buildMatchFromSeriesRound(series, series.rounds[0], {
    matchId: 'team-match-div-r1',
    publishToken: series.publishToken,
    creatorId: series.createdBy
  });
  assert('分队四人四球 builder ok', built.ok === true, built.reason);
  assert(
    '冻结 payload 含 colorSnapshot',
    !!(built.match.teamGroups[0] && built.match.teamGroups[0].colorSnapshot)
  );
  var stripped = JSON.parse(JSON.stringify(built.match));
  stripped.teamGroups = teamMatchStore.cloneTeamGroups(stripped.teamGroups);
  assert(
    'getMatchById 丢掉 colorSnapshot 后指纹仍相等',
    seriesStationMatch.stationPayloadsEqual(built.match, stripped).equal === true
  );
  assert(
    'teamCompetition.topN 为 2',
    built.match.scoringRules.teamCompetition.topN === 2
  );

  var extra = function (deps) {
    return { matchRepo: createNormalizingMatchRepo() };
  };
  var h = createHarness(extra);
  var saved = h.seriesStore.saveDraft(series);
  assert('分队草稿可存', saved.ok === true);
  var pub = h.publisher.publishSeries(series.seriesId, { now: h.fixedNow });
  assert(
    '分队四人四球 topN=2 首发成功（模拟 getMatchById 规范化）',
    pub.ok === true && pub.reason === 'published',
    pub.reason
  );

  var h2 = createHarness(extra);
  var s2 = buildDivisionFourballSeries();
  h2.seriesStore.saveDraft(s2);
  var planned = h2.publisher.planPublish(s2, { now: h2.fixedNow });
  assert('分队计划冻结', planned.ok === true);
  var writes = 0;
  var innerSave = h2.matchRepo.saveMatchChecked.bind(h2.matchRepo);
  h2.matchRepo.saveMatchChecked = function (m) {
    writes += 1;
    if (writes === 2) return { ok: false, reason: 'match_write_failed' };
    return innerSave(m);
  };
  var first = h2.publisher.publishSeries(s2.seriesId, { now: h2.fixedNow });
  assert(
    'R2 失败后 journal failed',
    first.ok === false && first.reason === 'match_write_failed'
  );
  var ids1 = (h2.journal.getJournal(s2.seriesId).journal.rounds || []).map(function (r) {
    return r.matchId;
  });
  h2.matchRepo.saveMatchChecked = innerSave;
  var resumed = h2.publisher.resumePublish(s2.seriesId, { now: h2.fixedNow });
  var ids2 = (h2.journal.getJournal(s2.seriesId).journal.rounds || []).map(function (r) {
    return r.matchId;
  });
  assert(
    '分队四人四球 resume 成功且不换 matchId',
    resumed.ok === true && JSON.stringify(ids1) === JSON.stringify(ids2),
    resumed.reason
  );

  function saveJournalRaw(h, seriesId, journal) {
    var key = seriesPublishJournalMod.STORAGE_KEY;
    var map = h.journalAdapter._bag[key] || {};
    map[seriesId] = JSON.parse(JSON.stringify(journal));
    h.journalAdapter._bag[key] = map;
  }

  function toUnversionedLegacyJournal(journal) {
    var next = JSON.parse(JSON.stringify(journal));
    delete next.fingerprintVersion;
    next.rounds = (next.rounds || []).map(function (rp) {
      var row = Object.assign({}, rp);
      row.payloadFingerprint = seriesStationMatch.fingerprintOf(
        seriesStationMatch.extractStationPayloadForFingerprint(rp.matchPayload, {
          legacyRawTeamGroups: true
        })
      );
      return row;
    });
    next.planFingerprint = seriesStationMatch.computePlanFingerprint(next.rounds);
    return next;
  }

  var currentFp = seriesStationMatch.computeStationPayloadFingerprint(built.match);
  var legacyColorFp = seriesStationMatch.fingerprintOf(
    seriesStationMatch.extractStationPayloadForFingerprint(built.match, {
      legacyRawTeamGroups: true
    })
  );
  assert(
    'colorSnapshot 使新旧 payloadFingerprint 不一致',
    currentFp !== legacyColorFp
  );

  var h3 = createHarness(extra);
  var s3 = buildDivisionFourballSeries();
  h3.seriesStore.saveDraft(s3);
  var planned3 = h3.publisher.planPublish(s3, { now: h3.fixedNow });
  assert('legacy 兼容-计划冻结', planned3.ok === true);
  var legacyJ = toUnversionedLegacyJournal(planned3.journal);
  saveJournalRaw(h3, s3.seriesId, legacyJ);
  var vLegacy = seriesStationMatch.validateFrozenJournal(
    h3.journal.getJournal(s3.seriesId).journal
  );
  assert(
    '无 version 且含 colorSnapshot 的旧 journal 可通过校验',
    vLegacy.ok === true,
    vLegacy.detail
  );
  var writes3 = 0;
  var innerSave3 = h3.matchRepo.saveMatchChecked.bind(h3.matchRepo);
  h3.matchRepo.saveMatchChecked = function (m) {
    writes3 += 1;
    if (writes3 === 2) return { ok: false, reason: 'match_write_failed' };
    return innerSave3(m);
  };
  var first3 = h3.publisher.publishSeries(s3.seriesId, { now: h3.fixedNow });
  assert(
    '旧 journal 首发 R2 失败',
    first3.ok === false && first3.reason === 'match_write_failed',
    first3.reason
  );
  var ids3a = (h3.journal.getJournal(s3.seriesId).journal.rounds || []).map(function (r) {
    return r.matchId;
  });
  var frozenPayload3 = h3.journal.getJournal(s3.seriesId).journal.rounds[0].matchPayload;
  h3.matchRepo.saveMatchChecked = innerSave3;
  var resumed3 = h3.publisher.resumePublish(s3.seriesId, { now: h3.fixedNow });
  var j3 = h3.journal.getJournal(s3.seriesId).journal;
  var ids3b = (j3.rounds || []).map(function (r) {
    return r.matchId;
  });
  assert(
    '旧 journal resume 成功且不换 matchId',
    resumed3.ok === true && JSON.stringify(ids3a) === JSON.stringify(ids3b),
    resumed3.reason
  );
  assert('旧 journal resume 后 done', j3.phase === 'done');
  assert(
    '恢复不回写 fingerprintVersion / 不重算旧指纹',
    j3.fingerprintVersion == null &&
      j3.rounds[0].payloadFingerprint === legacyJ.rounds[0].payloadFingerprint &&
      JSON.stringify(j3.rounds[0].matchPayload.teamGroups) ===
        JSON.stringify(frozenPayload3.teamGroups)
  );
  assert('旧 journal R2 已写入', !!h3.matchRepo.getMatchById(ids3b[1]));
  assert(
    '旧 journal index 完成',
    !!h3.stationIndex.getByMatchId(ids3b[0]) && !!h3.stationIndex.getByMatchId(ids3b[1])
  );

  var h4 = createHarness(extra);
  var s4 = buildDivisionFourballSeries();
  h4.seriesStore.saveDraft(s4);
  var planned4 = h4.publisher.planPublish(s4, { now: h4.fixedNow });
  var tampered = toUnversionedLegacyJournal(planned4.journal);
  tampered.rounds[0].matchPayload = Object.assign({}, tampered.rounds[0].matchPayload, {
    courseName: '被篡改球场'
  });
  saveJournalRaw(h4, s4.seriesId, tampered);
  var vTamper = seriesStationMatch.validateFrozenJournal(
    h4.journal.getJournal(s4.seriesId).journal
  );
  assert(
    '篡改 matchPayload 的旧 journal 仍 journal_corrupt',
    vTamper.ok === false &&
      vTamper.reason === 'journal_corrupt' &&
      vTamper.detail === 'payload_fingerprint_mismatch',
    vTamper.detail
  );
  var resumeTamper = h4.publisher.resumePublish(s4.seriesId, { now: h4.fixedNow });
  assert(
    '篡改旧 journal 禁止 resume',
    resumeTamper.ok === false && resumeTamper.reason === 'journal_corrupt'
  );

  var h5 = createHarness(extra);
  var s5 = buildDivisionFourballSeries();
  h5.seriesStore.saveDraft(s5);
  var planned5 = h5.publisher.planPublish(s5, { now: h5.fixedNow });
  var legacy5 = toUnversionedLegacyJournal(planned5.journal);
  saveJournalRaw(h5, s5.seriesId, legacy5);
  var r1 = legacy5.rounds[0];
  var conflictMatch = Object.assign({}, r1.matchPayload, { courseName: '真实业务差异球场' });
  h5.matchRepo._inject(conflictMatch);
  var storedBefore = h5.matchRepo.getMatchById(r1.matchId).courseName;
  var resumeConflict = h5.publisher.resumePublish(s5.seriesId, { now: h5.fixedNow });
  assert(
    '已存 match 业务字段差异仍 payload_conflict',
    resumeConflict.ok === false && resumeConflict.reason === 'payload_conflict',
    resumeConflict.reason
  );
  assert(
    'payload_conflict 不覆盖已有 match',
    h5.matchRepo.getMatchById(r1.matchId).courseName === storedBefore
  );

  var h6 = createHarness(extra);
  var s6 = buildDivisionFourballSeries();
  h6.seriesStore.saveDraft(s6);
  var planned6 = h6.publisher.planPublish(s6, { now: h6.fixedNow });
  var mixed = toUnversionedLegacyJournal(planned6.journal);
  mixed.fingerprintVersion = seriesStationMatch.FINGERPRINT_VERSION;
  saveJournalRaw(h6, s6.seriesId, mixed);
  var vMixed = seriesStationMatch.validateFrozenJournal(
    h6.journal.getJournal(s6.seriesId).journal
  );
  assert(
    '带 version 的 journal 不得走旧算法',
    vMixed.ok === false && vMixed.detail === 'payload_fingerprint_mismatch',
    vMixed.detail
  );
})();

console.log('');
console.log('---- seriesPublish.selftest (4C-1 fix) ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
