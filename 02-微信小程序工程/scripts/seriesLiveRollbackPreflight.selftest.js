/**
 * Series LIVE mutation 只读回滚门闩
 * 运行：node scripts/seriesLiveRollbackPreflight.selftest.js
 */

var path = require('path');
var seriesTestPaths = require('./lib/seriesTestPaths.js');
var journalMod = require(seriesTestPaths.util('seriesLiveMutationJournal.js'));
var evidenceMod = require(seriesTestPaths.util('seriesLiveAffiliationEvidence.js'));
var rb = require(seriesTestPaths.util('seriesLiveRollbackPreflight.js'));
var seriesRyderCup = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'seriesRyderCup.js'));

var PHASE = journalMod.PHASE;
var STATE = evidenceMod.STATE;
var run = rb.runSeriesLiveRollbackPreflight;
var MODE = rb.MODE;

var passed = 0;
var failed = [];

function assert(name, cond) {
  if (cond) {
    passed += 1;
    return;
  }
  failed.push(name);
}

function clone(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

function allowPerm() {
  return function () {
    return true;
  };
}

function denyPerm() {
  return function () {
    return false;
  };
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
    status: e.status || 'ongoing',
    groupId: 'g1',
    position: 1,
    group: {
      groupId: 'g1',
      groupName: '第1组',
      status: e.groupStatus,
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
    seriesParticipantId: spid
  };
}

function makeJournal(opts) {
  var o = opts || {};
  var beforeSt = journalMod.freezeStation(o.beforeStation || stationSnap('A'));
  var afterSt = journalMod.freezeStation(o.afterStation || stationSnap('B'));
  var withRoster = o.withRoster === true;
  var beforeRo = withRoster ? journalMod.freezeRoster(o.beforeRoster || rosterSnap('part-red')) : null;
  var afterRo = withRoster ? journalMod.freezeRoster(o.afterRoster || rosterSnap('part-blue')) : null;
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
    phase: o.phase || PHASE.rollback_pending,
    seriesId: 'ser-1',
    roundId: 'r1',
    matchId: 'm1',
    groupId: 'g1',
    position: 1,
    publishToken: 'tok-1',
    incomingUserId: 'B',
    outgoingUserId: 'A',
    targetAffiliationId: 'part-blue',
    action: 'direct_replace',
    requiresRosterMutation: withRoster,
    requiresConfirmation: o.requiresConfirmation === true,
    confirmationFingerprint: o.confirmationFingerprint || null,
    confirmationAcceptedFingerprint: o.confirmationAcceptedFingerprint || null,
    before: { station: beforeSt, roster: beforeRo },
    expectedAfter: { station: afterSt, roster: afterRo },
    fingerprints: fps
  };
}

function matchFrom(station) {
  return {
    matchId: station.matchId,
    status: station.status,
    seriesContext: clone(station.seriesContext),
    groups: [clone(station.group)],
    pairings: { g1: clone(station.pairings) },
    scoreEntities: { g1: clone(station.scoreEntities) }
  };
}

function seriesOf(roster, extra) {
  var e = extra || {};
  return Object.assign(
    {
      seriesId: 'ser-1',
      publishToken: 'tok-1',
      lifecycleStatus: 'published',
      competitionPhaseCache: 'live',
      registrationRevision: 3,
      rounds: [{ roundId: 'r1', matchId: 'm1', roundStatus: 'live' }],
      participants: [
        { seriesParticipantId: 'part-red', kind: 'team', sourceTeamId: 'red' },
        { seriesParticipantId: 'part-blue', kind: 'team', sourceTeamId: 'blue' }
      ],
      roster: roster ? [clone(roster)] : []
    },
    e
  );
}

function idx() {
  return { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1' };
}

function call(journal, series, match, extra) {
  return run(
    Object.assign(
      {
        journal: journal,
        currentSeries: series,
        currentMatch: match,
        stationIndex: idx(),
        hasManagePermission: allowPerm(),
        getMatchById: function () {
          return match;
        }
      },
      extra || {}
    )
  );
}

(function no_roster_after() {
  var j = makeJournal();
  var out = call(j, seriesOf(null), matchFrom(stationSnap('B')));
  assert('1 无 roster，station after → rollback_station', out.ok && out.readyToRollback && out.mode === MODE.rollback_station);
  assert('8 phase rollback_pending', j.phase === PHASE.rollback_pending && out.readyToRollback);
})();

(function no_roster_before() {
  var j = makeJournal();
  var out = call(j, seriesOf(null), matchFrom(stationSnap('A')));
  assert('2 无 roster，station before → finish record', out.ok && out.mode === MODE.finish_rollback_record && out.readyToRollback);
})();

(function roster_all_after() {
  var j = makeJournal({ withRoster: true });
  var out = call(j, seriesOf(rosterSnap('part-blue')), matchFrom(stationSnap('B')));
  assert('3 有 roster，all_after → roster first', out.ok && out.mode === MODE.rollback_roster_first && out.readyToRollback);
})();

(function mid() {
  var j = makeJournal({ withRoster: true });
  var out = call(j, seriesOf(rosterSnap('part-red')), matchFrom(stationSnap('B')));
  assert('4 station-after/roster-before → station rollback', out.ok && out.mode === MODE.rollback_station);
})();

(function all_before() {
  var j = makeJournal({ withRoster: true });
  var out = call(j, seriesOf(rosterSnap('part-red')), matchFrom(stationSnap('A')));
  assert('5 all-before → finish record', out.ok && out.mode === MODE.finish_rollback_record);
})();

(function inverted() {
  var j = makeJournal({ withRoster: true });
  var out = call(j, seriesOf(rosterSnap('part-blue')), matchFrom(stationSnap('A')));
  assert('6 station-before/roster-after → manual review', out.readyToRollback === false && out.mode === MODE.manual_review);
})();

(function unknown() {
  var j = makeJournal();
  var m = matchFrom(stationSnap('B'));
  m.groups = [];
  var out = call(j, seriesOf(null), m);
  assert('7 unknown → manual review', out.mode === MODE.manual_review && out.readyToRollback === false);
})();

(function rolling() {
  var j = makeJournal({ phase: PHASE.rolling_back });
  var out = call(j, seriesOf(null), matchFrom(stationSnap('B')));
  assert('9 phase rolling_back', out.ok && out.mode === MODE.rollback_station);
})();

(function committed() {
  var j = makeJournal({ phase: PHASE.committed });
  var out = call(j, seriesOf(null), matchFrom(stationSnap('B')), { forceRollbackCommitted: true });
  assert('10 committed 不允许普通 rollback', out.code === 'journal_committed' && out.readyToRollback === false);
})();

(function rolled_ok() {
  var j = makeJournal({ phase: PHASE.rolled_back });
  var out = call(j, seriesOf(null), matchFrom(stationSnap('A')));
  assert('11 rolled_back + all-before 幂等', out.ok && out.mode === MODE.idempotent_rolled_back && out.readyToRollback === false);
})();

(function rolled_drift() {
  var j = makeJournal({ phase: PHASE.rolled_back });
  var out = call(j, seriesOf(null), matchFrom(stationSnap('B')));
  assert('12 rolled_back drift', out.mode === MODE.manual_review && out.readyToRollback === false);
})();

(function journal_manual() {
  var j = makeJournal({ phase: PHASE.manual_review });
  var out = call(j, seriesOf(null), matchFrom(stationSnap('A')));
  assert('13 manual_review 不自动解除', out.mode === MODE.manual_review && out.code === 'journal_manual_review');
})();

(function series_completed() {
  var j = makeJournal();
  var s = seriesOf(null, { competitionPhaseCache: 'completed' });
  var out = call(j, s, matchFrom(stationSnap('B')));
  assert('14 Series completed', out.code === 'series_locked' && out.readyToRollback === false);
})();

(function series_archived() {
  var j = makeJournal();
  var a = call(j, seriesOf(null, { lifecycleStatus: 'archived' }), matchFrom(stationSnap('B')));
  var c = call(j, seriesOf(null, { lifecycleStatus: 'cancelled' }), matchFrom(stationSnap('B')));
  assert('15 Series cancelled/archived', a.code === 'series_locked' && c.code === 'series_locked');
})();

(function round_cancelled() {
  var j = makeJournal();
  var s = seriesOf(null);
  s.rounds[0].roundStatus = 'cancelled';
  var out = call(j, s, matchFrom(stationSnap('B')));
  assert('16 round cancelled', out.code === 'round_cancelled');
})();

(function match_done() {
  var after = stationSnap('B', { status: 'finished' });
  var j = makeJournal({ beforeStation: stationSnap('A', { status: 'finished' }), afterStation: after });
  var out = call(j, seriesOf(null), matchFrom(after));
  assert('17 Match completed', out.code === 'match_completed');
})();

(function group_done() {
  var after = stationSnap('B', { groupStatus: 'finished' });
  var j = makeJournal({
    beforeStation: stationSnap('A', { groupStatus: 'finished' }),
    afterStation: after
  });
  var out = call(j, seriesOf(null), matchFrom(after));
  assert('18 Group finished', out.code === 'group_finished');
})();

(function no_perm() {
  var j = makeJournal();
  var out = call(j, seriesOf(null), matchFrom(stationSnap('B')), { hasManagePermission: denyPerm() });
  assert('19 无权限', out.code === 'permission_denied');
})();

(function identity() {
  var j = makeJournal();
  var s = seriesOf(null, { seriesId: 'other' });
  var out = call(j, s, matchFrom(stationSnap('B')));
  assert('20 journal/对象身份冲突', out.code === 'identity_conflict');
})();

(function roster_missing() {
  var j = makeJournal({ withRoster: true });
  var out = call(j, seriesOf(null), matchFrom(stationSnap('B')));
  assert('21 rosterEntryId 缺失', out.mode === MODE.manual_review && (out.code === 'roster_entry_missing' || out.code === 'rollback_state_unknown'));
})();

(function roster_player() {
  var j = makeJournal({ withRoster: true });
  var out = call(j, seriesOf(rosterSnap('part-blue', { playerId: 'Z' })), matchFrom(stationSnap('B')));
  assert('22 roster playerId 冲突', out.code === 'roster_player_conflict' || out.mode === MODE.manual_review);
})();

(function roster_not_after() {
  var j = makeJournal({ withRoster: true });
  var out = call(j, seriesOf(rosterSnap('part-other')), matchFrom(stationSnap('B')));
  assert(
    '23 roster 当前不是 expectedAfter',
    out.readyToRollback === false && out.mode === MODE.manual_review
  );
})();

(function evidence_same() {
  var j = makeJournal({ withRoster: true });
  var s = seriesOf(rosterSnap('part-blue'));
  s.rounds.push({ roundId: 'r2', matchId: 'm2', roundStatus: 'live' });
  var m1 = matchFrom(stationSnap('B'));
  var m2 = matchFrom(stationSnap('B'));
  m2.matchId = 'm2';
  m2.seriesContext.roundId = 'r2';
  m2.seriesContext.matchId = 'm2';
  m2.groups[0].groupId = 'gx';
  m2.groups[0].players[0].userId = 'B';
  m2.groups[0].players[0].seriesParticipantId = 'part-red';
  m2.groups[0].players[0].matchTeamId = 'red';
  var out = call(j, s, m1, {
    getMatchById: function (id) {
      return id === 'm2' ? m2 : m1;
    }
  });
  assert('24 evidence 与 roster before 同归属，允许', out.ok && out.mode === MODE.rollback_roster_first);
})();

(function evidence_res_conflict() {
  var j = makeJournal({ withRoster: true });
  var s = seriesOf(rosterSnap('part-blue'));
  s.rounds.push({ roundId: 'r2', matchId: 'm2', roundStatus: 'live' });
  var m1 = matchFrom(stationSnap('B'));
  var m2 = matchFrom(stationSnap('B'));
  m2.matchId = 'm2';
  m2.seriesContext.roundId = 'r2';
  m2.seriesContext.matchId = 'm2';
  m2.groups[0].groupId = 'gx';
  m2.groups[0].players[0] = {
    position: 1,
    userId: 'B',
    playerId: 'B',
    seriesParticipantId: 'part-blue',
    matchTeamId: 'blue'
  };
  var out = call(j, s, m1, {
    getMatchById: function (id) {
      return id === 'm2' ? m2 : m1;
    }
  });
  assert(
    '25 evidence reservation 与 roster before 冲突',
    out.code === 'rollback_affiliation_conflict' && out.mode === MODE.manual_review
  );
})();

(function evidence_lock_conflict() {
  var j = makeJournal({ withRoster: true });
  var s = seriesOf(rosterSnap('part-blue'));
  s.rounds.push({ roundId: 'r2', matchId: 'm2', roundStatus: 'completed' });
  var m1 = matchFrom(stationSnap('B'));
  var m2 = matchFrom(stationSnap('B'));
  m2.matchId = 'm2';
  m2.status = 'finished';
  m2.seriesContext.roundId = 'r2';
  m2.seriesContext.matchId = 'm2';
  m2.groups[0].groupId = 'gx';
  m2.groups[0].status = 'finished';
  m2.groups[0].players[0] = {
    position: 1,
    userId: 'B',
    playerId: 'B',
    seriesParticipantId: 'part-blue',
    matchTeamId: 'blue'
  };
  var out = call(j, s, m1, {
    getMatchById: function (id) {
      return id === 'm2' ? m2 : m1;
    }
  });
  assert(
    '26 evidence confirmed lock 与 roster before 冲突',
    out.code === 'rollback_affiliation_conflict'
  );
})();

(function evidence_incomplete() {
  var j = makeJournal({ withRoster: true });
  var out = call(j, seriesOf(rosterSnap('part-blue')), matchFrom(stationSnap('B')), {
    getMatchById: function () {
      return null;
    }
  });
  assert('27 evidence incomplete/conflict', out.code === 'evidence_incomplete' || out.code === 'rollback_affiliation_conflict');
})();

(function seat_not_b() {
  var j = makeJournal();
  var cur = stationSnap('B');
  cur.group.players[0].userId = 'Z';
  cur.group.players[0].playerId = 'Z';
  cur.group.players[0].id = 'Z';
  var out = call(j, seriesOf(null), matchFrom(cur));
  assert('28 station 当前座位不是 B', out.code === 'rollback_station_drift' || out.mode === MODE.manual_review);
})();

(function score_drift() {
  var j = makeJournal();
  var cur = stationSnap('B', { scorePlayerId: 'X' });
  var out = call(j, seriesOf(null), matchFrom(cur));
  assert('29 score identity 漂移', out.code === 'rollback_station_drift' || out.mode === MODE.manual_review);
})();

(function pairing_drift() {
  var j = makeJournal();
  var cur = stationSnap('B', { pairings: [{ pairingId: 'p1', playerIds: ['B', 'Z'] }] });
  var out = call(j, seriesOf(null), matchFrom(cur));
  assert('30 pairing 漂移', out.code === 'rollback_station_drift' || out.mode === MODE.manual_review);
})();

(function finish_no_write() {
  var j = makeJournal();
  var s = seriesOf(null);
  var m = matchFrom(stationSnap('A'));
  var s0 = clone(s);
  var m0 = clone(m);
  var j0 = clone(j);
  var out = call(j, s, m);
  assert(
    '31 finish record 不写业务',
    out.mode === MODE.finish_rollback_record &&
      JSON.stringify(s) === JSON.stringify(s0) &&
      JSON.stringify(m) === JSON.stringify(m0) &&
      JSON.stringify(j) === JSON.stringify(j0)
  );
})();

(function no_side_effects() {
  var box = { data: {}, writes: 0 };
  var api = journalMod.createSeriesLiveMutationJournal({
    getItem: function () {
      return { ok: true, value: box.data };
    },
    setItem: function (_k, v) {
      box.writes += 1;
      box.data = v;
      return { ok: true };
    }
  });
  var j = makeJournal();
  api.prepareJournal({
    plan: {
      planKey: 'k1',
      planStatus: 'ready',
      decisionAction: 'direct_replace',
      identity: {
        seriesId: 'ser-1',
        roundId: 'r1',
        matchId: 'm1',
        groupId: 'g1',
        position: 1,
        publishToken: 'tok-1',
        incomingUserId: 'B',
        outgoingUserId: 'A',
        targetAffiliationId: 'part-blue',
        decisionAction: 'direct_replace'
      },
      operations: [{ type: 'replace_station_seat' }]
    },
    before: { station: j.before.station },
    expectedAfter: { station: j.expectedAfter.station }
  });
  var writes = box.writes;
  var data = JSON.stringify(box.data);
  run({
    journal: j,
    currentSeries: seriesOf(null),
    currentMatch: matchFrom(stationSnap('B')),
    stationIndex: idx(),
    hasManagePermission: allowPerm(),
    getMatchById: function () {
      return matchFrom(stationSnap('B'));
    }
  });
  assert('32 所有路径不推进 journal', box.writes === writes && JSON.stringify(box.data) === data);
})();

(function no_store() {
  var src = require('fs').readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'utils', 'seriesLiveRollbackPreflight.js'),
    'utf8'
  );
  assert(
    '33 所有路径不写 Series/Match',
    src.indexOf('saveMatch') < 0 &&
      src.indexOf('upsertSeries') < 0 &&
      src.indexOf('transitionJournal') < 0 &&
      src.indexOf('seriesLiveReplacePreflight') < 0 &&
      src.indexOf('buildSeriesLiveReplacePlan') < 0
  );
})();

(function ryder() {
  var j = makeJournal({ withRoster: true });
  var ordinary = seriesOf(rosterSnap('part-blue'));
  var ryder = seriesOf(rosterSnap('part-blue'), { seriesCompetitionType: 'ryder_cup' });
  var m = matchFrom(stationSnap('B'));
  var a = call(j, ordinary, m);
  var c = call(clone(j), ryder, clone(m));
  assert(
    '34 普通 Series/显式莱德杯同路径',
    seriesRyderCup.isRyderCupSeries(ryder) && a.mode === c.mode && a.readyToRollback === c.readyToRollback
  );
})();

(function inputs_frozen() {
  var j = makeJournal({ withRoster: true });
  var s = seriesOf(rosterSnap('part-blue'));
  var m = matchFrom(stationSnap('B'));
  var j0 = clone(j);
  var s0 = clone(s);
  var m0 = clone(m);
  run({
    journal: j,
    currentSeries: s,
    currentMatch: m,
    stationIndex: idx(),
    hasManagePermission: allowPerm(),
    getMatchById: function () {
      return m;
    }
  });
  assert(
    '35 输入不变',
    JSON.stringify(j) === JSON.stringify(j0) && JSON.stringify(s) === JSON.stringify(s0) && JSON.stringify(m) === JSON.stringify(m0)
  );
})();

if (failed.length) {
  console.error('FAIL ' + failed.length + ' / ' + (passed + failed.length));
  failed.forEach(function (n) {
    console.error(' - ' + n);
  });
  process.exit(1);
}
console.log('ok ' + passed + ' assertions seriesLiveRollbackPreflight.selftest');
