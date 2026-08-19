/**
 * 中断发布草稿的安全放弃（plan_source_conflict / failed publishing）
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesPublishDiscard.selftest.js
 */

var path = require('path');
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');

var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStoreMod = require(path.join(utilsDir, 'seriesStore.js'));
var seriesStationIndexMod = require(path.join(utilsDir, 'seriesStationIndex.js'));
var seriesPublishJournalMod = require(path.join(utilsDir, 'seriesPublishJournal.js'));
var seriesPublish = require(path.join(utilsDir, 'seriesPublish.js'));

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
    seriesName: '2026红运郎隔壁杯清北联谊赛',
    createdBy: 'publisher-user-1',
    organization: {
      organizationId: 'org-1',
      organizationName: '清北联谊',
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
  s.scoringRule = seriesModel.createDefaultScoringRule({
    mode: 'per_round_n',
    scoreBasis: 'gross',
    allowRepeat: false
  });
  s.rounds = s.rounds.map(function (r, idx) {
    var next = Object.assign({}, r);
    next.dateTime = '2030-09-0' + (idx + 1) + ' 08:00';
    next.gameMode = '个人比杆赛';
    next.courseId = 'c' + (idx + 1);
    next.courseName = '球场' + (idx + 1);
    next.fee = '';
    next.topN = 3;
    return next;
  });
  if (overrides) Object.assign(s, overrides);
  return s;
}

function createHarness() {
  var seriesAdapter = createMemoryAdapter();
  var indexAdapter = createMemoryAdapter();
  var journalAdapter = createMemoryAdapter();
  var seriesStore = seriesStoreMod.createSeriesStore(seriesAdapter);
  var stationIndex = seriesStationIndexMod.createSeriesStationIndex(indexAdapter);
  var journal = seriesPublishJournalMod.createSeriesPublishJournal(journalAdapter);
  var matchRepo = seriesPublish.createMemoryMatchRepo();
  var fixedNow = new Date(2026, 5, 1, 12, 0, 0, 0).getTime();
  var publisher = seriesPublish.createSeriesPublisher({
    seriesStore: seriesStore,
    stationIndex: stationIndex,
    journal: journal,
    matchRepo: matchRepo,
    now: function () {
      return fixedNow;
    }
  });
  return {
    seriesStore: seriesStore,
    stationIndex: stationIndex,
    journal: journal,
    matchRepo: matchRepo,
    publisher: publisher,
    fixedNow: fixedNow,
    actor: { actorUserId: 'publisher-user-1' }
  };
}

function driftDraft(h, series) {
  var next = Object.assign({}, series, { seriesName: series.seriesName + '-已改' });
  h.seriesStore.saveDraft(next);
  return h.seriesStore.getSeriesById(series.seriesId);
}

function leftoverMatches(h, ids) {
  return ids.filter(function (id) {
    return !!h.matchRepo.getMatchById(id);
  });
}

(function testDriftNoStations() {
  var h = createHarness();
  var series = buildPublishableSeries();
  h.seriesStore.saveDraft(series);
  var planned = h.publisher.planPublish(series, { now: h.fixedNow });
  assert('无分站-计划冻结', planned.ok === true);
  driftDraft(h, series);
  var pub = h.publisher.publishSeries(series.seriesId, { now: h.fixedNow });
  assert('无分站-plan_source_conflict', pub.ok === false && pub.reason === 'plan_source_conflict');
  assert('无分站-尚未写 match', h.matchRepo._count() === 0);
  var ids = planned.journal.rounds.map(function (r) {
    return r.matchId;
  });
  var discarded = h.publisher.discardInterruptedPublishSafely(series.seriesId, h.actor);
  assert('无分站-放弃成功', discarded.ok === true && discarded.reason === 'discarded', discarded.reason);
  assert('无分站-草稿已删', !h.seriesStore.getSeriesById(series.seriesId));
  assert('无分站-journal 已删', !h.journal.getJournal(series.seriesId).journal);
  assert('无分站-无残留 match', leftoverMatches(h, ids).length === 0);
})();

(function testOnlyR1Written() {
  var h = createHarness();
  var series = buildPublishableSeries();
  h.seriesStore.saveDraft(series);
  var planned = h.publisher.planPublish(series, { now: h.fixedNow });
  var r1 = planned.journal.rounds[0];
  var r2 = planned.journal.rounds[1];
  var wr = h.matchRepo.saveMatchChecked(r1.matchPayload);
  assert('仅 R1-写入成功', wr.ok === true, wr.reason);
  var j = h.journal.getJournal(series.seriesId).journal;
  j.phase = 'failed';
  j.lastError = 'match_write_failed';
  j.rounds[0].status = 'written';
  h.journal.saveJournal(j);
  driftDraft(h, series);
  var discarded = h.publisher.discardInterruptedPublishSafely(series.seriesId, h.actor);
  assert('仅 R1-放弃成功', discarded.ok === true, discarded.reason);
  assert('仅 R1-已写分站删除', !h.matchRepo.getMatchById(r1.matchId));
  assert('仅 R1-未写分站仍不存在', !h.matchRepo.getMatchById(r2.matchId));
  assert('仅 R1-草稿与 journal 清空', !h.seriesStore.getSeriesById(series.seriesId) && !h.journal.getJournal(series.seriesId).journal);
})();

(function testBothMatchesPartialIndex() {
  var h = createHarness();
  var series = buildPublishableSeries();
  h.seriesStore.saveDraft(series);
  var planned = h.publisher.planPublish(series, { now: h.fixedNow });
  var r1 = planned.journal.rounds[0];
  var r2 = planned.journal.rounds[1];
  h.matchRepo.saveMatchChecked(r1.matchPayload);
  h.matchRepo.saveMatchChecked(r2.matchPayload);
  h.stationIndex.setLink(r1.matchId, series.seriesId, r1.roundId);
  var j = h.journal.getJournal(series.seriesId).journal;
  j.phase = 'failed';
  j.rounds[0].status = 'indexed';
  j.rounds[1].status = 'written';
  h.journal.saveJournal(j);
  var discarded = h.publisher.discardInterruptedPublishSafely(series.seriesId, h.actor);
  assert('部分 index-放弃成功', discarded.ok === true, discarded.reason);
  assert('部分 index-两场 match 删除', !h.matchRepo.getMatchById(r1.matchId) && !h.matchRepo.getMatchById(r2.matchId));
  assert('部分 index-索引解除', !h.stationIndex.getByMatchId(r1.matchId) && !h.stationIndex.getByMatchId(r2.matchId));
})();

(function testIdempotentRepeat() {
  var h = createHarness();
  var series = buildPublishableSeries();
  h.seriesStore.saveDraft(series);
  h.publisher.planPublish(series, { now: h.fixedNow });
  var first = h.publisher.discardInterruptedPublishSafely(series.seriesId, h.actor);
  var second = h.publisher.discardInterruptedPublishSafely(series.seriesId, h.actor);
  assert('首次放弃成功', first.ok === true);
  assert(
    '重复点击幂等为无冻结计划',
    second.ok === false && second.reason === 'no_frozen_plan',
    second.reason
  );
})();

(function testConflictZeroDelete() {
  var h = createHarness();
  var series = buildPublishableSeries();
  h.seriesStore.saveDraft(series);
  var planned = h.publisher.planPublish(series, { now: h.fixedNow });
  var r1 = planned.journal.rounds[0];
  var r2 = planned.journal.rounds[1];
  h.matchRepo.saveMatchChecked(r1.matchPayload);
  h.matchRepo.saveMatchChecked(r2.matchPayload);
  var hijack = JSON.parse(JSON.stringify(r1.matchPayload));
  hijack.seriesContext = Object.assign({}, hijack.seriesContext, {
    seriesId: 'other-series',
    publishToken: 'tok-other'
  });
  h.matchRepo._inject(hijack);
  var beforeCount = h.matchRepo._count();
  var discarded = h.publisher.discardInterruptedPublishSafely(series.seriesId, h.actor);
  assert(
    '身份不符零删除',
    discarded.ok === false && discarded.reason === 'station_conflict',
    discarded.reason
  );
  assert('冲突提示明确', discarded.message === '存在冲突分站，无法自动取消');
  assert('冲突后 match 仍在', h.matchRepo._count() === beforeCount);
  assert('冲突后 journal 保留', !!h.journal.getJournal(series.seriesId).journal);
  assert('冲突后草稿保留', !!h.seriesStore.getSeriesById(series.seriesId));
})();

(function testPublishedForbidden() {
  var h = createHarness();
  var series = buildPublishableSeries();
  h.seriesStore.saveDraft(series);
  var pub = h.publisher.publishSeries(series.seriesId, { now: h.fixedNow });
  assert('正式发布成功', pub.ok === true, pub.reason);
  var ids = h.journal.getJournal(series.seriesId).journal.rounds.map(function (r) {
    return r.matchId;
  });
  var discarded = h.publisher.discardInterruptedPublishSafely(series.seriesId, h.actor);
  assert(
    '已 published 禁止取消',
    discarded.ok === false && discarded.reason === 'published_not_allowed',
    discarded.reason
  );
  assert('published 分站仍在', leftoverMatches(h, ids).length === ids.length);
  assert('published Series 仍在', !!h.seriesStore.getSeriesById(series.seriesId));
})();

(function testResumeAfterInterrupt() {
  var h = createHarness();
  var series = buildPublishableSeries();
  h.seriesStore.saveDraft(series);
  var planned = h.publisher.planPublish(series, { now: h.fixedNow });
  var r1 = planned.journal.rounds[0];
  var r2 = planned.journal.rounds[1];
  h.matchRepo.saveMatchChecked(r1.matchPayload);
  h.matchRepo.saveMatchChecked(r2.matchPayload);
  h.stationIndex.setLink(r1.matchId, series.seriesId, r1.roundId);
  h.stationIndex.setLink(r2.matchId, series.seriesId, r2.roundId);
  var inner = h.matchRepo.removeMatch.bind(h.matchRepo);
  var n = 0;
  h.matchRepo.removeMatch = function (id) {
    n += 1;
    if (n === 1) return inner(id);
    return { ok: false, reason: 'injected_match_remove_fail' };
  };
  var first = h.publisher.discardInterruptedPublishSafely(series.seriesId, h.actor);
  assert(
    '清理中断失败并保留 journal',
    first.ok === false && !!h.journal.getJournal(series.seriesId).journal,
    first.reason
  );
  assert(
    '中断后 phase=discarding',
    h.journal.getJournal(series.seriesId).journal.phase === 'discarding'
  );
  h.matchRepo.removeMatch = inner;
  var second = h.publisher.discardInterruptedPublishSafely(series.seriesId, h.actor);
  assert('中断后可继续清理', second.ok === true, second.reason);
  assert('继续清理后两场皆无', !h.matchRepo.getMatchById(r1.matchId) && !h.matchRepo.getMatchById(r2.matchId));
  assert('继续清理后 journal 清空', !h.journal.getJournal(series.seriesId).journal);
})();

(function testNewSeriesAfterDiscard() {
  var h = createHarness();
  var series = buildPublishableSeries();
  h.seriesStore.saveDraft(series);
  h.publisher.planPublish(series, { now: h.fixedNow });
  driftDraft(h, series);
  var discarded = h.publisher.discardInterruptedPublishSafely(series.seriesId, h.actor);
  assert('清理后可再开新草稿', discarded.ok === true);
  var fresh = buildPublishableSeries({ seriesName: '新的系列赛' });
  var saved = h.seriesStore.saveDraft(fresh);
  assert('新草稿可存', saved.ok === true);
  var planned = h.publisher.planPublish(saved.series, { now: h.fixedNow });
  assert('新系列赛可正常冻结创建', planned.ok === true, planned.reason);
  var pub = h.publisher.publishSeries(saved.series.seriesId, { now: h.fixedNow });
  assert('新系列赛可正常发布', pub.ok === true, pub.reason);
})();

(function testNonCreatorDenied() {
  var h = createHarness();
  var series = buildPublishableSeries();
  h.seriesStore.saveDraft(series);
  var planned = h.publisher.planPublish(series, { now: h.fixedNow });
  var r1 = planned.journal.rounds[0];
  h.matchRepo.saveMatchChecked(r1.matchPayload);
  var denied = h.publisher.discardInterruptedPublishSafely(series.seriesId, {
    actorUserId: 'other-user'
  });
  assert('非创建者禁止', denied.ok === false && denied.reason === 'permission_denied', denied.reason);
  assert('非创建者零删除', !!h.matchRepo.getMatchById(r1.matchId));
  assert('非创建者 journal 保留', !!h.journal.getJournal(series.seriesId).journal);
})();

console.log('');
console.log('---- seriesPublishDiscard.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
