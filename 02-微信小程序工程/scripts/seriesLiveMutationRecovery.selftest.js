/**
 * Series LIVE mutation recovery classifier（只分类，不执行）
 * 运行：node scripts/seriesLiveMutationRecovery.selftest.js
 */

var path = require('path');
var seriesTestPaths = require('./lib/seriesTestPaths.js');
var journalMod = require(seriesTestPaths.util('seriesLiveMutationJournal.js'));
var recovery = require(seriesTestPaths.util('seriesLiveMutationRecovery.js'));
var seriesRyderCup = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'seriesRyderCup.js'));

var PHASE = journalMod.PHASE;
var inspect = recovery.inspectSeriesLiveMutationRecovery;
var passed = 0;
var failed = [];
var results = [];

function assert(name, cond) {
  if (cond) {
    passed += 1;
    return;
  }
  failed.push(name);
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function stationSnap(person, extra) {
  var e = extra || {};
  return {
    matchId: 'm1',
    seriesContext: {
      managed: true,
      seriesId: 'ser-1',
      roundId: 'r1',
      matchId: 'm1',
      publishToken: 'tok-1'
    },
    status: 'ongoing',
    groupId: 'g1',
    position: 1,
    group: {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        {
          position: 1,
          userId: person,
          playerId: person,
          id: person,
          scorePlayerId: e.scorePlayerId != null ? e.scorePlayerId : 'A',
          entityId: e.entityId || 'ent-a',
          pairingId: 'p1'
        },
        { position: 2, userId: 'C', playerId: 'C', id: 'C' }
      ]
    },
    pairings: e.pairings || [
      { pairingId: 'p1', entityId: 'pe1', playerIds: [person === 'B' ? 'B' : 'A', 'C'] }
    ],
    scoreEntities: e.scoreEntities || [{ entityId: 'ent-a', memberIds: [person === 'B' ? 'B' : 'A'] }],
    scoreIdentitySummary: {
      scorePlayerId: e.scorePlayerId != null ? e.scorePlayerId : 'A',
      entityId: e.entityId || 'ent-a',
      pairingId: 'p1'
    }
  };
}

function rosterSnap(spid, extra) {
  var e = extra || {};
  return {
    rosterEntryId: e.rosterEntryId || 're-B',
    playerId: e.playerId || 'B',
    registrationStatus: e.registrationStatus || 'registered',
    seriesParticipantId: spid,
    registrationRevision: e.registrationRevision != null ? e.registrationRevision : 3,
    lifecycleStatus: e.lifecycleStatus || 'published'
  };
}

function makeJournal(opts) {
  var o = opts || {};
  var beforeSt = journalMod.freezeStation(o.beforeStation || stationSnap('A'));
  var afterSt = journalMod.freezeStation(o.afterStation || stationSnap('B'));
  var withRoster = o.withRoster === true;
  var beforeRo = withRoster ? journalMod.freezeRoster(o.beforeRoster || rosterSnap('aff-wrong')) : null;
  var afterRo = withRoster ? journalMod.freezeRoster(o.afterRoster || rosterSnap('aff-B')) : null;
  var fps = {
    stationBefore: journalMod.fingerprintOf(beforeSt),
    stationAfter: journalMod.fingerprintOf(afterSt)
  };
  if (withRoster) {
    fps.rosterBefore = journalMod.fingerprintOf(beforeRo);
    fps.rosterAfter = journalMod.fingerprintOf(afterRo);
  }
  return {
    journalVersion: 1,
    planKey: 'k1',
    phase: o.phase || PHASE.prepared,
    seriesId: 'ser-1',
    roundId: 'r1',
    matchId: 'm1',
    groupId: 'g1',
    position: 1,
    publishToken: 'tok-1',
    requiresRosterMutation: withRoster,
    operationKinds: withRoster
      ? ['replace_station_seat', 'repair_series_roster_affiliation']
      : ['replace_station_seat'],
    before: { station: beforeSt, roster: beforeRo },
    expectedAfter: { station: afterSt, roster: afterRo },
    fingerprints: fps
  };
}

function matchFrom(station) {
  var s = station;
  return {
    matchId: s.matchId,
    status: s.status,
    seriesContext: clone(s.seriesContext),
    groups: [clone(s.group)],
    pairings: { g1: clone(s.pairings) },
    scoreEntities: { g1: clone(s.scoreEntities) }
  };
}

function seriesFrom(roster, extra) {
  var e = extra || {};
  return {
    seriesId: e.seriesId || 'ser-1',
    seriesCompetitionType: e.seriesCompetitionType || '',
    registrationRevision: e.registrationRevision != null ? e.registrationRevision : 3,
    lifecycleStatus: e.lifecycleStatus || 'published',
    roster: roster ? [clone(roster)] : []
  };
}

function run(input) {
  var out = inspect(input);
  results.push(out);
  return out;
}

function memoryAdapter(box) {
  return {
    getItem: function () {
      return { ok: true, value: box.data };
    },
    setItem: function (_key, value) {
      box.writes = (box.writes || 0) + 1;
      box.data = value;
      return { ok: true };
    }
  };
}

(function station_before() {
  var j = makeJournal();
  var r = run({ journal: j, currentMatch: matchFrom(stationSnap('A')), currentSeries: seriesFrom(null) });
  assert('1 station 精确 before', r.ok && r.stationState === 'before' && r.combinedState === 'station_before');
})();

(function station_after() {
  var j = makeJournal({ phase: PHASE.station_written });
  var r = run({ journal: j, currentMatch: matchFrom(stationSnap('B')), currentSeries: seriesFrom(null) });
  assert(
    '2 station 精确 after',
    r.ok && r.stationState === 'after' && r.recommendedAction === 'eligible_to_verify_or_commit_after_revalidation'
  );
})();

(function userId_without_pairing() {
  var current = stationSnap('A');
  current.group.players[0].userId = 'B';
  current.group.players[0].playerId = 'B';
  current.group.players[0].id = 'B';
  var r = run({
    journal: makeJournal(),
    currentMatch: matchFrom(current),
    currentSeries: seriesFrom(null)
  });
  assert(
    '3 只改 userId 但 pairing 未改 → unknown',
    r.stationState === 'unknown' && r.recommendedAction === 'manual_review'
  );
})();

(function score_identity() {
  var current = stationSnap('A', { scorePlayerId: 'X' });
  var r = run({
    journal: makeJournal(),
    currentMatch: matchFrom(current),
    currentSeries: seriesFrom(null)
  });
  assert(
    '4 成绩身份变化 → unknown',
    r.stationState === 'unknown' &&
      r.traces.station.reasons.indexOf('score_identity_mismatch') >= 0
  );
})();

(function entity_drift() {
  var current = stationSnap('A', {
    scoreEntities: [{ entityId: 'ent-a', memberIds: ['Z'] }]
  });
  var r = run({
    journal: makeJournal(),
    currentMatch: matchFrom(current),
    currentSeries: seriesFrom(null)
  });
  assert(
    '5 scoreEntity 漂移 → unknown',
    r.stationState === 'unknown' && r.traces.station.reasons.indexOf('score_entity_mismatch') >= 0
  );
})();

(function group_missing() {
  var m = matchFrom(stationSnap('A'));
  m.groups = [];
  var r = run({ journal: makeJournal(), currentMatch: m, currentSeries: seriesFrom(null) });
  assert(
    '6 target group 缺失 → unknown',
    r.stationState === 'unknown' && r.traces.station.reasons.indexOf('target_group_missing') >= 0
  );
})();

(function series_ctx() {
  var m = matchFrom(stationSnap('A'));
  m.seriesContext.seriesId = 'other';
  var r = run({ journal: makeJournal(), currentMatch: m, currentSeries: seriesFrom(null) });
  assert(
    '7 Series context 冲突 → unknown',
    r.stationState === 'unknown' && r.traces.station.reasons.indexOf('series_context_conflict') >= 0
  );
})();

(function token_conflict() {
  var m = matchFrom(stationSnap('A'));
  m.seriesContext.publishToken = 'tok-other';
  var r = run({ journal: makeJournal(), currentMatch: m, currentSeries: seriesFrom(null) });
  assert(
    '8 publishToken 冲突 → unknown',
    r.stationState === 'unknown' && r.traces.station.reasons.indexOf('publish_token_conflict') >= 0
  );
})();

(function roster_before() {
  var j = makeJournal({ withRoster: true });
  var r = run({
    journal: j,
    currentMatch: matchFrom(stationSnap('A')),
    currentSeries: seriesFrom(rosterSnap('aff-wrong'))
  });
  assert('9 roster before', r.rosterState === 'before');
})();

(function roster_after() {
  var j = makeJournal({ withRoster: true, phase: PHASE.roster_written });
  var r = run({
    journal: j,
    currentMatch: matchFrom(stationSnap('B')),
    currentSeries: seriesFrom(rosterSnap('aff-B'))
  });
  assert('10 roster after', r.rosterState === 'after');
})();

(function roster_missing() {
  var r = run({
    journal: makeJournal({ withRoster: true }),
    currentMatch: matchFrom(stationSnap('A')),
    currentSeries: seriesFrom(null)
  });
  assert(
    '11 rosterEntryId 缺失 → unknown',
    r.rosterState === 'unknown' && r.traces.roster.reasons.indexOf('roster_entry_missing') >= 0
  );
})();

(function roster_player() {
  var r = run({
    journal: makeJournal({ withRoster: true }),
    currentMatch: matchFrom(stationSnap('A')),
    currentSeries: seriesFrom(rosterSnap('aff-wrong', { playerId: 'OTHER' }))
  });
  assert(
    '12 roster playerId 冲突 → unknown',
    r.rosterState === 'unknown' && r.traces.roster.reasons.indexOf('roster_player_conflict') >= 0
  );
})();

(function roster_status() {
  var r = run({
    journal: makeJournal({ withRoster: true }),
    currentMatch: matchFrom(stationSnap('A')),
    currentSeries: seriesFrom(rosterSnap('aff-wrong', { registrationStatus: 'cancelled' }))
  });
  assert(
    '13 registered 状态变化 → unknown',
    r.rosterState === 'unknown' && r.traces.roster.reasons.indexOf('roster_status_conflict') >= 0
  );
})();

(function roster_not_required() {
  var r = run({
    journal: makeJournal({ withRoster: false }),
    currentMatch: matchFrom(stationSnap('A')),
    currentSeries: seriesFrom(rosterSnap('aff-B'))
  });
  assert('14 无 roster operation → not_required', r.rosterState === 'not_required');
})();

(function all_before() {
  var r = run({
    journal: makeJournal({ withRoster: true, phase: PHASE.prepared }),
    currentMatch: matchFrom(stationSnap('A')),
    currentSeries: seriesFrom(rosterSnap('aff-wrong'))
  });
  assert(
    '15 all_before',
    r.combinedState === 'all_before' &&
      r.recommendedAction === 'eligible_to_start_station_after_revalidation'
  );
})();

(function station_after_roster_before() {
  var r = run({
    journal: makeJournal({ withRoster: true, phase: PHASE.station_verified }),
    currentMatch: matchFrom(stationSnap('B')),
    currentSeries: seriesFrom(rosterSnap('aff-wrong'))
  });
  assert(
    '16 station_after_roster_before',
    r.combinedState === 'station_after_roster_before' &&
      r.recommendedAction === 'eligible_to_resume_roster_after_revalidation'
  );
})();

(function all_after() {
  var r = run({
    journal: makeJournal({ withRoster: true, phase: PHASE.roster_verified }),
    currentMatch: matchFrom(stationSnap('B')),
    currentSeries: seriesFrom(rosterSnap('aff-B'))
  });
  assert(
    '17 all_after',
    r.combinedState === 'all_after' &&
      r.recommendedAction === 'eligible_to_verify_or_commit_after_revalidation'
  );
})();

(function inverted() {
  var r = run({
    journal: makeJournal({ withRoster: true, phase: PHASE.station_writing }),
    currentMatch: matchFrom(stationSnap('A')),
    currentSeries: seriesFrom(rosterSnap('aff-B'))
  });
  assert(
    '18 station_before_roster_after → manual_review',
    r.combinedState === 'station_before_roster_after' && r.recommendedAction === 'manual_review'
  );
})();

(function any_unknown() {
  var m = matchFrom(stationSnap('A'));
  m.groups = [];
  var r = run({
    journal: makeJournal({ withRoster: true }),
    currentMatch: m,
    currentSeries: seriesFrom(rosterSnap('aff-wrong'))
  });
  assert(
    '19 任一 unknown → manual_review',
    r.combinedState === 'unknown' && r.recommendedAction === 'manual_review'
  );
})();

(function rollback_all_after() {
  var r = run({
    journal: makeJournal({ withRoster: true, phase: PHASE.rolling_back }),
    currentMatch: matchFrom(stationSnap('B')),
    currentSeries: seriesFrom(rosterSnap('aff-B'))
  });
  assert(
    '20 rollback all_after → roster first',
    r.recommendedAction === 'eligible_to_rollback_roster_first_after_revalidation'
  );
})();

(function rollback_mid() {
  var r = run({
    journal: makeJournal({ withRoster: true, phase: PHASE.rollback_pending }),
    currentMatch: matchFrom(stationSnap('B')),
    currentSeries: seriesFrom(rosterSnap('aff-wrong'))
  });
  assert(
    '21 rollback station-after/roster-before → station rollback',
    r.recommendedAction === 'eligible_to_rollback_station_after_revalidation'
  );
})();

(function rollback_all_before() {
  var r = run({
    journal: makeJournal({ withRoster: true, phase: PHASE.rolling_back }),
    currentMatch: matchFrom(stationSnap('A')),
    currentSeries: seriesFrom(rosterSnap('aff-wrong'))
  });
  assert(
    '22 rollback all_before → finish rollback record',
    r.recommendedAction === 'eligible_to_finish_rollback_record'
  );
})();

(function committed_ok() {
  var r = run({
    journal: makeJournal({ withRoster: true, phase: PHASE.committed }),
    currentMatch: matchFrom(stationSnap('B')),
    currentSeries: seriesFrom(rosterSnap('aff-B'))
  });
  assert(
    '23 committed + all_after → idempotent',
    r.ok && r.recommendedAction === 'idempotent_committed'
  );
})();

(function committed_drift() {
  var r = run({
    journal: makeJournal({ withRoster: true, phase: PHASE.committed }),
    currentMatch: matchFrom(stationSnap('A')),
    currentSeries: seriesFrom(rosterSnap('aff-wrong'))
  });
  assert(
    '24 committed drift → manual_review',
    r.ok === false && r.code === 'committed_state_drift' && r.recommendedAction === 'manual_review'
  );
})();

(function rolled_ok() {
  var r = run({
    journal: makeJournal({ withRoster: true, phase: PHASE.rolled_back }),
    currentMatch: matchFrom(stationSnap('A')),
    currentSeries: seriesFrom(rosterSnap('aff-wrong'))
  });
  assert(
    '25 rolled_back + all_before → idempotent',
    r.ok && r.recommendedAction === 'idempotent_rolled_back'
  );
})();

(function rolled_drift() {
  var r = run({
    journal: makeJournal({ withRoster: true, phase: PHASE.rolled_back }),
    currentMatch: matchFrom(stationSnap('B')),
    currentSeries: seriesFrom(rosterSnap('aff-B'))
  });
  assert(
    '26 rolled_back drift → manual_review',
    r.ok === false && r.code === 'rolled_back_state_drift' && r.recommendedAction === 'manual_review'
  );
})();

(function journal_manual() {
  var r = run({
    journal: makeJournal({ withRoster: true, phase: PHASE.manual_review }),
    currentMatch: matchFrom(stationSnap('B')),
    currentSeries: seriesFrom(rosterSnap('aff-B'))
  });
  assert(
    '27 journal manual_review 不自动解除',
    r.recommendedAction === 'manual_review' && r.combinedState === 'all_after'
  );
})();

(function flags() {
  var allFalse = results.every(function (x) {
    return x.executionAllowed === false;
  });
  assert('28 所有返回 executionAllowed=false', allFalse && results.length >= 27);
  var nonTerminalNeed = results.every(function (x) {
    if (!x.requiresDomainRevalidation) return false;
    return true;
  });
  assert('29 所有非终态建议要求 domain revalidation', nonTerminalNeed);
})();

(function inputs_frozen() {
  var j = makeJournal({ withRoster: true });
  var m = matchFrom(stationSnap('A'));
  var s = seriesFrom(rosterSnap('aff-wrong'));
  var j0 = clone(j);
  var m0 = clone(m);
  var s0 = clone(s);
  inspect({ journal: j, currentMatch: m, currentSeries: s });
  assert(
    '30 输入对象不变',
    JSON.stringify(j) === JSON.stringify(j0) &&
      JSON.stringify(m) === JSON.stringify(m0) &&
      JSON.stringify(s) === JSON.stringify(s0)
  );
})();

(function no_storage() {
  var box = { data: {}, writes: 0 };
  var api = journalMod.createSeriesLiveMutationJournal(memoryAdapter(box));
  var beforeSt = journalMod.freezeStation(stationSnap('A'));
  var afterSt = journalMod.freezeStation(stationSnap('B'));
  var plan = {
    planKey: 'k-store',
    planStatus: 'ready',
    requiresConfirmation: false,
    confirmationFingerprint: null,
    decisionAction: 'direct_replace',
    needsRosterRepair: false,
    identity: {
      seriesId: 'ser-1',
      roundId: 'r1',
      matchId: 'm1',
      groupId: 'g1',
      position: 1,
      publishToken: 'tok-1',
      incomingUserId: 'B',
      outgoingUserId: 'A',
      targetAffiliationId: 'aff-B',
      decisionAction: 'direct_replace'
    },
    operations: [{ type: 'replace_station_seat' }]
  };
  var prepared = api.prepareJournal({
    plan: plan,
    before: { station: beforeSt },
    expectedAfter: { station: afterSt }
  });
  var writesAfterPrepare = box.writes;
  var snap = clone(box.data);
  inspect({
    journal: prepared.journal,
    currentMatch: matchFrom(stationSnap('A')),
    currentSeries: seriesFrom(null)
  });
  assert(
    '31 不写 storage',
    prepared.ok && box.writes === writesAfterPrepare && JSON.stringify(box.data) === JSON.stringify(snap)
  );
})();

(function ordinary_vs_ryder() {
  var j = makeJournal({ withRoster: true });
  var m = matchFrom(stationSnap('B'));
  var ordinary = seriesFrom(rosterSnap('aff-B'));
  var ryder = seriesFrom(rosterSnap('aff-B'), { seriesCompetitionType: 'ryder_cup' });
  var a = inspect({ journal: j, currentMatch: m, currentSeries: ordinary });
  var b = inspect({ journal: clone(j), currentMatch: clone(m), currentSeries: ryder });
  assert(
    '32 普通 Series/显式莱德杯相同',
    seriesRyderCup.isRyderCupSeries(ryder) &&
      !seriesRyderCup.isRyderCupSeries(ordinary) &&
      a.stationState === b.stationState &&
      a.rosterState === b.rosterState &&
      a.combinedState === b.combinedState &&
      a.recommendedAction === b.recommendedAction &&
      a.executionAllowed === false &&
      b.executionAllowed === false
  );
})();

if (failed.length) {
  console.error('FAIL ' + failed.length + ' / ' + (passed + failed.length));
  failed.forEach(function (n) {
    console.error(' - ' + n);
  });
  process.exit(1);
}
console.log('ok ' + passed + ' assertions seriesLiveMutationRecovery.selftest');
