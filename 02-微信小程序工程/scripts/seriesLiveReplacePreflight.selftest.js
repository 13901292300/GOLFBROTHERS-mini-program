/**
 * Series LIVE 换人执行前门闩（只读）
 * 运行：node scripts/seriesLiveReplacePreflight.selftest.js
 */

var path = require('path');
var seriesTestPaths = require('./lib/seriesTestPaths.js');
var journalMod = require(seriesTestPaths.util('seriesLiveMutationJournal.js'));
var evidenceMod = require(seriesTestPaths.util('seriesLiveAffiliationEvidence.js'));
var decisionMod = require(seriesTestPaths.util('seriesLiveReplaceDecision.js'));
var planMod = require(seriesTestPaths.util('seriesLiveReplacePlan.js'));
var preflight = require(seriesTestPaths.util('seriesLiveReplacePreflight.js'));
var seriesRyderCup = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'seriesRyderCup.js'));

var PHASE = journalMod.PHASE;
var STATE = evidenceMod.STATE;
var run = preflight.runSeriesLiveReplacePreflight;
var MODE = preflight.MODE;

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

function red() {
  return {
    seriesParticipantId: 'part-red',
    kind: 'team',
    sourceTeamId: 'red',
    shortNameSnapshot: '红队',
    nameSnapshot: '红队',
    colorSnapshot: '#c00'
  };
}
function blue() {
  return {
    seriesParticipantId: 'part-blue',
    kind: 'team',
    sourceTeamId: 'blue',
    shortNameSnapshot: '蓝队',
    nameSnapshot: '蓝队',
    colorSnapshot: '#00c'
  };
}

function seat(id, pos, partId, extra) {
  return Object.assign(
    {
      position: pos,
      userId: id,
      playerId: id,
      id: id,
      displayName: '球员' + id,
      avatar: 'a-' + id,
      gender: id === 'A' ? 'male' : 'female',
      seriesParticipantId: partId,
      matchTeamId: partId === 'part-blue' ? 'blue' : 'red',
      affiliationId: partId === 'part-blue' ? 'blue' : 'red',
      colorSnapshot: partId === 'part-blue' ? '#00c' : '#c00',
      scorePlayerId: extra && extra.scorePlayerId != null ? extra.scorePlayerId : 'A',
      entityId: extra && extra.entityId ? extra.entityId : 'ent-a',
      pairingId: 'p1',
      tPosition: extra && extra.tPosition ? extra.tPosition : 'M'
    },
    extra || {}
  );
}

function incomingB(extra) {
  return Object.assign(
    {
      userId: 'B',
      playerId: 'B',
      id: 'B',
      displayName: '球员B',
      avatar: 'a-B',
      gender: 'female',
      tPosition: 'W',
      playerNameSnapshot: '球员B'
    },
    extra || {}
  );
}

function g5Validate() {
  return function () {
    return { ok: true };
  };
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

function seriesBase(extra) {
  return Object.assign(
    {
      seriesId: 'ser-1',
      hostMode: 'organization',
      publishToken: 'tok-1',
      lifecycleStatus: 'published',
      competitionPhaseCache: 'live',
      participants: [red(), blue()],
      roster: [
        {
          rosterEntryId: 're-B',
          playerId: 'B',
          seriesParticipantId: 'part-red',
          registrationStatus: 'registered'
        }
      ],
      scoringRule: { allowRepeat: false },
      rounds: [
        {
          roundId: 'r1',
          matchId: 'm1',
          roundStatus: 'live'
        }
      ]
    },
    extra || {}
  );
}

function matchBase(extra) {
  var groups = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        seat('A', 1, 'part-red'),
        seat('C', 2, 'part-blue', { scorePlayerId: 'C', entityId: 'ent-c' })
      ]
    }
  ];
  return Object.assign(
    {
      matchId: 'm1',
      status: 'ongoing',
      gameMode: '个人比杆赛',
      groups: groups,
      pairings: {
        g1: [{ pairingId: 'p1', entityId: 'pe1', playerIds: ['A', 'C'] }]
      },
      scoreEntities: {
        g1: [{ entityId: 'ent-a', memberIds: ['A'] }]
      },
      seriesContext: {
        managed: true,
        seriesId: 'ser-1',
        roundId: 'r1',
        matchId: 'm1',
        publishToken: 'tok-1'
      }
    },
    extra || {}
  );
}

function stationIndex() {
  return { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1' };
}

function freezeFromMatch(match, ident) {
  var group = (match.groups || []).filter(function (g) {
    return String(g.groupId) === String(ident.groupId);
  })[0];
  var player = ((group && group.players) || []).filter(function (p) {
    return Number(p.position) === Number(ident.position);
  })[0];
  return journalMod.freezeStation({
    matchId: match.matchId,
    seriesContext: match.seriesContext,
    status: match.status,
    groupId: ident.groupId,
    position: ident.position,
    group: group,
    pairings: match.pairings && match.pairings[ident.groupId],
    scoreEntities: match.scoreEntities && match.scoreEntities[ident.groupId],
    scoreIdentitySummary: {
      scorePlayerId: player && player.scorePlayerId,
      entityId: player && player.entityId,
      pairingId: player && player.pairingId
    }
  });
}

function applyIncoming(match, position) {
  var pos = Number(position) || 1;
  var next = clone(match);
  var g = next.groups[0];
  var outgoing = '';
  for (var i = 0; i < g.players.length; i++) {
    if (Number(g.players[i].position) === pos) {
      outgoing = g.players[i].userId;
      g.players[i].userId = 'B';
      g.players[i].playerId = 'B';
      g.players[i].id = 'B';
      g.players[i].displayName = '球员B';
    }
  }
  if (next.pairings && next.pairings.g1 && next.pairings.g1[0] && Array.isArray(next.pairings.g1[0].playerIds)) {
    next.pairings.g1[0].playerIds = next.pairings.g1[0].playerIds.map(function (id) {
      return id === outgoing ? 'B' : id;
    });
  }
  if (pos === 1 && next.scoreEntities && next.scoreEntities.g1 && next.scoreEntities.g1[0]) {
    next.scoreEntities.g1[0].memberIds = ['B'];
  }
  return next;
}

function sidesValidate() {
  return function (payload) {
    var groups = payload.groups || [];
    var g = groups[0] || {};
    var players = (g.players || []).filter(function (p) {
      return p && (p.userId || p.playerId);
    });
    var teams = {};
    players.forEach(function (pl) {
      var t = String(pl.matchTeamId || '');
      if (!t) {
        teams.__missing = true;
        return;
      }
      teams[t] = (teams[t] || 0) + 1;
    });
    if (teams.__missing) return { ok: false, reason: 'affiliation' };
    var ids = Object.keys(teams).filter(function (k) {
      return k !== '__missing';
    });
    if (ids.length !== 2) return { ok: false, reason: 'affiliation' };
    return { ok: true };
  };
}

function buildConfirmBundle() {
  var series = seriesBase();
  var match = matchBase();
  var incoming = incomingB();
  var target = {
    seriesId: 'ser-1',
    roundId: 'r1',
    matchId: 'm1',
    groupId: 'g1',
    position: 2,
    targetAffiliationId: 'part-blue',
    publishToken: 'tok-1'
  };
  var evidence = { ok: true, state: STATE.unlocked, affiliationId: '', evidence: [] };
  var decision = decisionMod.decideSeriesLiveReplace({
    series: series,
    groups: match.groups,
    pairingDraft: match.pairings,
    target: target,
    incomingPlayer: incoming,
    evidenceResult: evidence,
    rosterAffiliationId: 'part-red',
    validateCandidate: sidesValidate()
  });
  var plan = planMod.buildSeriesLiveReplacePlan({
    decision: decision,
    series: series,
    groups: match.groups,
    pairingDraft: match.pairings,
    target: target,
    incomingPlayer: incoming,
    rosterAffiliationId: 'part-red',
    stationIndex: stationIndex()
  });
  var ident = { groupId: 'g1', position: 2 };
  var box = { data: {}, writes: 0 };
  var api = journalMod.createSeriesLiveMutationJournal(memoryAdapter(box));
  var afterMatch = applyIncoming(match, 2);
  var prepared = api.prepareJournal({
    plan: plan,
    before: { station: freezeFromMatch(match, ident), roster: series.roster[0] },
    expectedAfter: { station: freezeFromMatch(afterMatch, ident), roster: Object.assign({}, series.roster[0], { seriesParticipantId: 'part-blue' }) },
    confirmation: { confirmationAcceptedFingerprint: plan.confirmationFingerprint }
  });
  return {
    series: series,
    match: match,
    afterMatch: afterMatch,
    incoming: incoming,
    decision: decision,
    plan: plan,
    journal: prepared.journal,
    prepared: prepared,
    box: box,
    getMatchById: function () {
      return match;
    }
  };
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

function buildLiveBundle(opts) {
  var o = opts || {};
  var series = o.series || seriesBase(o.seriesExtra);
  var match = o.match || matchBase(o.matchExtra);
  var incoming = o.incomingPlayer || incomingB();
  var target = Object.assign(
    {
      seriesId: 'ser-1',
      roundId: 'r1',
      matchId: 'm1',
      groupId: 'g1',
      position: 1,
      targetAffiliationId: o.targetAffiliationId || 'part-red',
      publishToken: 'tok-1'
    },
    o.target || {}
  );
  var matches = o.matches || { m1: match };
  function getMatchById(id) {
    return matches[id] || null;
  }
  var evidence =
    o.evidence ||
    evidenceMod.collectSeriesLiveAffiliationEvidence({
      series: series,
      playerId: 'B',
      currentTarget: target,
      getMatchById: getMatchById,
      getIndexByMatchId: function (id) {
        var rounds = Array.isArray(series.rounds) ? series.rounds : [];
        for (var i = 0; i < rounds.length; i++) {
          if (String(rounds[i] && rounds[i].matchId) === String(id)) {
            return {
              seriesId: series.seriesId,
              roundId: rounds[i].roundId,
              matchId: id
            };
          }
        }
        return null;
      }
    });
  var decision = decisionMod.decideSeriesLiveReplace({
    series: series,
    groups: match.groups,
    pairingDraft: match.pairings,
    target: target,
    incomingPlayer: incoming,
    evidenceResult: evidence,
    rosterAffiliationId: o.rosterAffiliationId != null ? o.rosterAffiliationId : 'part-red',
    validateCandidate: o.validateCandidate || g5Validate()
  });
  var plan = planMod.buildSeriesLiveReplacePlan({
    decision: decision,
    series: series,
    groups: match.groups,
    pairingDraft: match.pairings,
    target: target,
    incomingPlayer: incoming,
    rosterAffiliationId: o.rosterAffiliationId != null ? o.rosterAffiliationId : 'part-red',
    stationIndex: stationIndex()
  });
  var ident = {
    groupId: target.groupId,
    position: target.position
  };
  var beforeSt = freezeFromMatch(match, ident);
  var afterMatch = applyIncoming(match, target.position);
  var afterSt = freezeFromMatch(afterMatch, ident);
  var box = { data: {}, writes: 0 };
  var api = journalMod.createSeriesLiveMutationJournal(memoryAdapter(box));
  var beforeBundle = { station: beforeSt };
  var afterBundle = { station: afterSt };
  var rosterOp = (plan.operations || []).filter(function (op) {
    return op && op.type === 'repair_series_roster_affiliation';
  })[0];
  if (rosterOp) {
    beforeBundle.roster = {
      rosterEntryId: rosterOp.rosterEntryId,
      playerId: rosterOp.playerId,
      registrationStatus: 'registered',
      seriesParticipantId: rosterOp.fromSeriesParticipantId,
      lifecycleStatus: series.lifecycleStatus || 'published'
    };
    afterBundle.roster = {
      rosterEntryId: rosterOp.rosterEntryId,
      playerId: rosterOp.playerId,
      registrationStatus: 'registered',
      seriesParticipantId: rosterOp.toSeriesParticipantId,
      lifecycleStatus: series.lifecycleStatus || 'published'
    };
  }
  var prepared = api.prepareJournal({
    plan: plan,
    before: beforeBundle,
    expectedAfter: afterBundle,
    confirmation: o.confirmation
  });
  return {
    series: series,
    match: match,
    afterMatch: afterMatch,
    incoming: incoming,
    evidence: evidence,
    decision: decision,
    plan: plan,
    journal: prepared.journal,
    prepared: prepared,
    box: box,
    api: api,
    getMatchById: getMatchById
  };
}

function preflightArgs(bundle, extra) {
  return Object.assign(
    {
      journal: bundle.journal,
      plan: bundle.plan,
      currentSeries: bundle.series,
      currentMatch: bundle.match,
      stationIndex: stationIndex(),
      incomingPlayer: bundle.incoming,
      validateCandidate: g5Validate(),
      getMatchById: bundle.getMatchById,
      hasManagePermission: allowPerm()
    },
    extra || {}
  );
}

(function happy_start() {
  var b = buildLiveBundle();
  var out = run(preflightArgs(b));
  assert(
    '1 完整合法首次执行',
    b.prepared.ok &&
      b.plan.ok &&
      out.ok &&
      out.readyToExecute === true &&
      out.mode === MODE.start_station
  );
  assert('32 start_station mode', out.mode === MODE.start_station);
})();

(function plan_key() {
  var b = buildLiveBundle();
  var plan = clone(b.plan);
  plan.planKey = 'other-key';
  var out = run(preflightArgs(b, { plan: plan }));
  assert('2 journal/plan key 冲突', out.ok === false && out.code === 'plan_key_conflict');
})();

(function identity() {
  var b = buildLiveBundle();
  var plan = clone(b.plan);
  plan.identity.seriesId = 'ser-other';
  var out = run(preflightArgs(b, { plan: plan }));
  assert('3 identity 冲突', out.ok === false && out.code === 'identity_conflict');
})();

(function confirm_missing() {
  var b = buildConfirmBundle();
  var journal = clone(b.journal);
  journal.confirmationAcceptedFingerprint = '';
  var out = run({
    journal: journal,
    plan: b.plan,
    currentSeries: b.series,
    currentMatch: b.match,
    stationIndex: stationIndex(),
    incomingPlayer: b.incoming,
    validateCandidate: sidesValidate(),
    getMatchById: b.getMatchById,
    hasManagePermission: allowPerm()
  });
  assert(
    '4 confirm 指纹缺失',
    b.prepared.ok && b.plan.requiresConfirmation === true && out.ok === false && out.code === 'confirmation_required'
  );
})();

(function confirm_mismatch() {
  var b = buildConfirmBundle();
  var journal = clone(b.journal);
  journal.confirmationAcceptedFingerprint = 'other-fp';
  var out = run({
    journal: journal,
    plan: b.plan,
    currentSeries: b.series,
    currentMatch: b.match,
    stationIndex: stationIndex(),
    incomingPlayer: b.incoming,
    validateCandidate: sidesValidate(),
    getMatchById: b.getMatchById,
    hasManagePermission: allowPerm()
  });
  assert('5 confirm 指纹不一致', out.ok === false && out.code === 'confirmation_fingerprint_conflict');
})();

(function journal_manual() {
  var b = buildLiveBundle();
  var journal = clone(b.journal);
  journal.phase = PHASE.manual_review;
  var out = run(preflightArgs(b, { journal: journal }));
  assert('6 journal manual_review', out.ok === false && out.code === 'journal_manual_review' && out.readyToExecute === false);
})();

(function terminal() {
  var b = buildLiveBundle();
  var committed = clone(b.journal);
  committed.phase = PHASE.committed;
  var a = run(preflightArgs(b, { journal: committed }));
  var rolled = clone(b.journal);
  rolled.phase = PHASE.rolled_back;
  var c = run(preflightArgs(b, { journal: rolled }));
  assert(
    '7 committed/rolled_back 不重复写',
    a.code === 'journal_committed' && c.code === 'journal_rolled_back' && !a.readyToExecute && !c.readyToExecute
  );
})();

(function recovery_unknown() {
  var b = buildLiveBundle();
  var match = clone(b.match);
  match.groups = [];
  var out = run(preflightArgs(b, { currentMatch: match }));
  assert('8 recovery unknown', out.ok === false && out.code === 'recovery_unknown');
})();

(function inverted_combo() {
  var b = buildLiveBundle();
  var journal = clone(b.journal);
  journal.requiresRosterMutation = true;
  journal.before.roster = {
    rosterEntryId: 're-B',
    playerId: 'B',
    registrationStatus: 'registered',
    seriesParticipantId: 'part-red',
    lifecycleStatus: 'published'
  };
  journal.expectedAfter.roster = {
    rosterEntryId: 're-B',
    playerId: 'B',
    registrationStatus: 'registered',
    seriesParticipantId: 'part-blue',
    lifecycleStatus: 'published'
  };
  journal.fingerprints.rosterBefore = journalMod.fingerprintOf(journal.before.roster);
  journal.fingerprints.rosterAfter = journalMod.fingerprintOf(journal.expectedAfter.roster);
  var series = clone(b.series);
  series.roster[0].seriesParticipantId = 'part-blue';
  series.lifecycleStatus = 'published';
  var out = run(preflightArgs(b, { journal: journal, currentSeries: series }));
  assert(
    '9 station_before_roster_after',
    out.ok === false && out.code === 'station_before_roster_after'
  );
})();

(function series_completed() {
  var b = buildLiveBundle();
  var series = clone(b.series);
  series.competitionPhaseCache = 'completed';
  var out = run(preflightArgs(b, { currentSeries: series }));
  assert('10 Series completed', out.code === 'series_locked');
})();

(function series_archived() {
  var b = buildLiveBundle();
  var series = clone(b.series);
  series.lifecycleStatus = 'archived';
  var a = run(preflightArgs(b, { currentSeries: series }));
  series.lifecycleStatus = 'cancelled';
  var c = run(preflightArgs(b, { currentSeries: series }));
  assert('11 Series cancelled/archived', a.code === 'series_locked' && c.code === 'series_locked');
})();

(function round_cancelled() {
  var b = buildLiveBundle();
  var series = clone(b.series);
  series.rounds[0].roundStatus = 'cancelled';
  var out = run(preflightArgs(b, { currentSeries: series }));
  assert('12 round cancelled', out.code === 'round_cancelled');
})();

(function not_live() {
  var match = matchBase({ status: 'upcoming' });
  var b = buildLiveBundle({ match: match, matches: { m1: match } });
  var series = clone(b.series);
  series.rounds[0].roundStatus = 'grouped';
  var out = run(preflightArgs(b, { currentSeries: series }));
  assert('13 station 非 LIVE', out.code === 'station_not_live');
})();

(function match_done() {
  var match = matchBase({ status: 'finished' });
  var b = buildLiveBundle({ match: match, matches: { m1: match } });
  var out = run(preflightArgs(b));
  assert('14 Match completed', out.code === 'match_completed');
})();

(function group_done() {
  var match = matchBase();
  match.groups[0].status = 'finished';
  var b = buildLiveBundle({ match: match, matches: { m1: match } });
  var out = run(preflightArgs(b));
  assert('15 Group finished', out.code === 'group_finished');
})();

(function no_perm() {
  var b = buildLiveBundle();
  var out = run(preflightArgs(b, { hasManagePermission: denyPerm() }));
  assert('16 无权限', out.code === 'permission_denied');
})();

(function outgoing_changed() {
  var b = buildLiveBundle();
  var match = clone(b.match);
  match.groups[0].players[0].userId = 'Z';
  match.groups[0].players[0].playerId = 'Z';
  match.groups[0].players[0].id = 'Z';
  var out = run(preflightArgs(b, { currentMatch: match }));
  assert('17 outgoing 已变化', out.code === 'stale_outgoing_person');
})();

(function score_changed() {
  var b = buildLiveBundle();
  var match = clone(b.match);
  match.groups[0].players[0].scorePlayerId = 'X';
  var out = run(preflightArgs(b, { currentMatch: match }));
  assert('18 score identity 变化', out.code === 'score_identity_changed');
})();

(function pairing_changed() {
  var b = buildLiveBundle();
  var match = clone(b.match);
  match.pairings.g1[0].playerIds = ['A', 'Z'];
  var out = run(preflightArgs(b, { currentMatch: match }));
  assert('19 pairing 变化', out.code === 'pairing_changed');
})();

(function b_elsewhere() {
  var b = buildLiveBundle();
  var match = clone(b.match);
  match.groups.push({
    groupId: 'g2',
    groupName: '第2组',
    players: [seat('B', 1, 'part-red', { scorePlayerId: 'B', entityId: 'ent-b' })]
  });
  var out = run(preflightArgs(b, { currentMatch: match }));
  assert('20 B 已在同轮其它座位', out.code === 'incoming_already_in_round');
})();

(function evidence_incomplete() {
  var b = buildLiveBundle();
  var out = run(
    preflightArgs(b, {
      getMatchById: function () {
        return null;
      }
    })
  );
  assert('21 evidence incomplete', out.code === 'evidence_incomplete');
})();

(function evidence_conflict() {
  var b = buildLiveBundle();
  var series = clone(b.series);
  series.rounds.push({ roundId: 'r2', matchId: 'm2', roundStatus: 'live' });
  series.rounds.push({ roundId: 'r3', matchId: 'm3', roundStatus: 'live' });
  function extraMatch(id, roundId, partId) {
    var m = matchBase();
    m.matchId = id;
    m.seriesContext.roundId = roundId;
    m.seriesContext.matchId = id;
    m.groups[0].groupId = 'g-' + id;
    m.groups[0].players[0] = seat('B', 1, partId);
    m.pairings = {};
    return m;
  }
  var m2 = extraMatch('m2', 'r2', 'part-red');
  var m3 = extraMatch('m3', 'r3', 'part-blue');
  var matches = { m1: b.match, m2: m2, m3: m3 };
  var out = run(
    preflightArgs(b, {
      currentSeries: series,
      getMatchById: function (id) {
        return matches[id];
      }
    })
  );
  assert('22 evidence affiliation conflict', out.code === 'affiliation_conflict');
})();

(function reservation_same() {
  var b = buildLiveBundle();
  var series = clone(b.series);
  series.rounds.push({ roundId: 'r2', matchId: 'm2', roundStatus: 'live' });
  var m2 = matchBase();
  m2.matchId = 'm2';
  m2.status = 'ongoing';
  m2.seriesContext.roundId = 'r2';
  m2.seriesContext.matchId = 'm2';
  m2.groups[0].groupId = 'gx';
  m2.groups[0].players[0] = seat('B', 1, 'part-red');
  m2.pairings = { gx: [{ pairingId: 'px', playerIds: ['B', 'C'] }] };
  var matches = { m1: b.match, m2: m2 };
  var out = run(
    preflightArgs(b, {
      currentSeries: series,
      getMatchById: function (id) {
        return matches[id];
      }
    })
  );
  assert('23 reservation 同归属允许继续', out.ok === true && out.readyToExecute === true);
})();

(function reservation_other() {
  var b = buildLiveBundle();
  var series = clone(b.series);
  series.rounds.push({ roundId: 'r2', matchId: 'm2', roundStatus: 'live' });
  var m2 = matchBase();
  m2.matchId = 'm2';
  m2.seriesContext.roundId = 'r2';
  m2.seriesContext.matchId = 'm2';
  m2.groups[0].groupId = 'gx';
  m2.groups[0].players[0] = seat('B', 1, 'part-blue');
  var matches = { m1: b.match, m2: m2 };
  var out = run(
    preflightArgs(b, {
      currentSeries: series,
      getMatchById: function (id) {
        return matches[id];
      }
    })
  );
  assert(
    '24 reservation 异归属阻止/决策变化',
    out.ok === false && (out.code === 'participation_reservation' || out.code === 'stale_plan' || out.code === 'affiliation_conflict')
  );
})();

(function lock_same() {
  var b = buildLiveBundle();
  var series = clone(b.series);
  series.rounds.push({ roundId: 'r2', matchId: 'm2', roundStatus: 'completed' });
  var m2 = matchBase();
  m2.matchId = 'm2';
  m2.status = 'finished';
  m2.seriesContext.roundId = 'r2';
  m2.seriesContext.matchId = 'm2';
  m2.groups[0].groupId = 'gx';
  m2.groups[0].status = 'finished';
  m2.groups[0].players[0] = seat('B', 1, 'part-red');
  var matches = { m1: b.match, m2: m2 };
  var out = run(
    preflightArgs(b, {
      currentSeries: series,
      getMatchById: function (id) {
        return matches[id];
      }
    })
  );
  assert('25 confirmed lock 同归属允许继续', out.ok === true && out.readyToExecute === true);
})();

(function lock_other() {
  var b = buildLiveBundle();
  var series = clone(b.series);
  series.rounds.push({ roundId: 'r2', matchId: 'm2', roundStatus: 'completed' });
  var m2 = matchBase();
  m2.matchId = 'm2';
  m2.status = 'finished';
  m2.seriesContext.roundId = 'r2';
  m2.seriesContext.matchId = 'm2';
  m2.groups[0].groupId = 'gx';
  m2.groups[0].status = 'finished';
  m2.groups[0].players[0] = seat('B', 1, 'part-blue');
  var matches = { m1: b.match, m2: m2 };
  var out = run(
    preflightArgs(b, {
      currentSeries: series,
      getMatchById: function (id) {
        return matches[id];
      }
    })
  );
  assert('26 confirmed lock 异归属阻止', out.ok === false && (out.code === 'confirmed_affiliation_lock' || out.code === 'stale_plan'));
})();

(function direct_to_confirm() {
  var b = buildLiveBundle();
  var series = clone(b.series);
  series.roster = [];
  var out = run(preflightArgs(b, { currentSeries: series }));
  assert('27 direct 最新变 confirm → stale', out.ok === false && out.code === 'stale_plan');
})();

(function confirm_to_direct() {
  var b = buildConfirmBundle();
  var out = run({
    journal: b.journal,
    plan: b.plan,
    currentSeries: b.series,
    currentMatch: b.match,
    stationIndex: stationIndex(),
    incomingPlayer: b.incoming,
    validateCandidate: g5Validate(),
    getMatchById: b.getMatchById,
    hasManagePermission: allowPerm()
  });
  assert('28 confirm 最新变 direct → stale', b.prepared.ok && out.ok === false && out.code === 'stale_plan');
})();

(function target_aff_change() {
  var b = buildLiveBundle();
  var plan = clone(b.plan);
  plan.identity.targetAffiliationId = 'part-blue';
  delete plan.identity.scorePlayerId;
  var journal = clone(b.journal);
  journal.targetAffiliationId = 'part-blue';
  var out = run(preflightArgs(b, { plan: plan, journal: journal }));
  assert('29 target affiliation 变化 → stale', out.ok === false && out.code === 'stale_plan');
})();

(function op_change() {
  var b = buildLiveBundle();
  var plan = clone(b.plan);
  plan.operations.push({
    type: 'repair_series_roster_affiliation',
    rosterEntryId: 're-B',
    playerId: 'B',
    fromSeriesParticipantId: 'part-red',
    toSeriesParticipantId: 'part-red'
  });
  var out = run(preflightArgs(b, { plan: plan }));
  assert('30 rebuilt plan operation 变化 → stale', out.ok === false && out.code === 'stale_plan');
})();

(function roster_entry_change() {
  var b = buildLiveBundle();
  var plan = clone(b.plan);
  if (!plan.operations.some(function (op) {
    return op.type === 'repair_series_roster_affiliation';
  })) {
    plan.needsRosterRepair = true;
    plan.identity.rosterEntryId = 're-B';
    plan.operations.push({
      type: 'repair_series_roster_affiliation',
      rosterEntryId: 're-OLD',
      playerId: 'B',
      fromSeriesParticipantId: 'part-red',
      toSeriesParticipantId: 'part-red'
    });
  } else {
    plan.operations.forEach(function (op) {
      if (op.type === 'repair_series_roster_affiliation') op.rosterEntryId = 're-OLD';
    });
  }
  var out = run(preflightArgs(b, { plan: plan }));
  assert('31 rosterEntryId 变化 → stale', out.ok === false && (out.code === 'stale_plan' || out.code === 'identity_conflict'));
})();

(function resume_roster() {
  var series = seriesBase({
    roster: [
      {
        rosterEntryId: 're-B',
        playerId: 'B',
        seriesParticipantId: 'part-blue',
        registrationStatus: 'registered'
      }
    ],
    rounds: [
      { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
      { roundId: 'r2', matchId: 'm2', roundStatus: 'live' }
    ]
  });
  var match = matchBase();
  var m2 = matchBase();
  m2.matchId = 'm2';
  m2.seriesContext.roundId = 'r2';
  m2.seriesContext.matchId = 'm2';
  m2.groups[0].groupId = 'gx';
  m2.groups[0].players[0] = seat('B', 1, 'part-red');
  m2.pairings = { gx: [{ pairingId: 'px', playerIds: ['B', 'C'] }] };
  var matches = { m1: match, m2: m2 };
  var b = buildLiveBundle({
    series: series,
    match: match,
    matches: matches,
    rosterAffiliationId: 'part-blue',
    targetAffiliationId: 'part-red'
  });
  if (!b.prepared || !b.prepared.ok || !b.journal) {
    assert(
      '33 resume_roster mode prep=' +
        ((b.prepared && b.prepared.reason) || (b.plan && b.plan.reason) || (b.decision && b.decision.action)),
      false
    );
    return;
  }
  var journal = clone(b.journal);
  journal.phase = PHASE.station_verified;
  var after = b.afterMatch;
  var matchesAfter = { m1: after, m2: m2 };
  var out = run(
    preflightArgs(b, {
      journal: journal,
      currentSeries: series,
      currentMatch: after,
      getMatchById: function (id) {
        return matchesAfter[id];
      }
    })
  );
  assert(
    '33 resume_roster mode',
    b.plan.ok &&
      b.prepared.ok &&
      b.plan.operations.length === 2 &&
      out.mode === MODE.resume_roster &&
      out.readyToExecute === true
  );
})();

(function verify_commit() {
  var b = buildLiveBundle();
  var journal = clone(b.journal);
  journal.phase = PHASE.committing;
  var out = run(
    preflightArgs(b, {
      journal: journal,
      currentMatch: b.afterMatch,
      getMatchById: function () {
        return b.afterMatch;
      }
    })
  );
  assert('34 all-after → verify_and_commit', out.mode === MODE.verify_and_commit && out.readyToExecute === true);
})();

(function rollback_mode() {
  var b = buildLiveBundle();
  var journal = clone(b.journal);
  journal.phase = PHASE.rollback_pending;
  var out = run(preflightArgs(b, { journal: journal }));
  assert(
    '35 rollback phase → rollback_required',
    out.mode === MODE.rollback_required && out.readyToExecute === false
  );
})();

(function missing_perm_fn() {
  var b = buildLiveBundle();
  var args = preflightArgs(b);
  delete args.hasManagePermission;
  var out = run(args);
  assert('36 缺权限函数不默认允许', out.ok === false && out.readyToExecute === false && out.code === 'permission_denied');
})();

(function missing_validator() {
  var b = buildLiveBundle();
  var args = preflightArgs(b);
  delete args.validateCandidate;
  var out = run(args);
  assert(
    '37 缺合法性 validator 不默认允许',
    out.ok === false && out.readyToExecute === false && out.code === 'validate_candidate_required'
  );
})();

(function ordinary_vs_ryder() {
  var b = buildLiveBundle();
  var ryderSeries = clone(b.series);
  ryderSeries.seriesCompetitionType = 'ryder_cup';
  var a = run(preflightArgs(b));
  var c = run(preflightArgs(b, { currentSeries: ryderSeries }));
  assert(
    '38 普通 Series 与显式莱德杯同路径',
    seriesRyderCup.isRyderCupSeries(ryderSeries) &&
      a.mode === c.mode &&
      a.readyToExecute === c.readyToExecute &&
      a.ok === c.ok
  );
})();

(function inputs_frozen() {
  var b = buildLiveBundle();
  var args = preflightArgs(b);
  var snap = clone(args);
  run(args);
  assert(
    '39 输入对象不变',
    JSON.stringify(args.journal) === JSON.stringify(snap.journal) &&
      JSON.stringify(args.plan) === JSON.stringify(snap.plan) &&
      JSON.stringify(args.currentSeries) === JSON.stringify(snap.currentSeries) &&
      JSON.stringify(args.currentMatch) === JSON.stringify(snap.currentMatch)
  );
})();

(function no_storage() {
  var b = buildLiveBundle();
  var writes = b.box.writes;
  var data = clone(b.box.data);
  run(preflightArgs(b));
  assert(
    '40 不写 storage、不推进 journal',
    b.box.writes === writes &&
      JSON.stringify(b.box.data) === JSON.stringify(data) &&
      b.journal.phase === PHASE.prepared
  );
})();

if (failed.length) {
  console.error('FAIL ' + failed.length + ' / ' + (passed + failed.length));
  failed.forEach(function (n) {
    console.error(' - ' + n);
  });
  process.exit(1);
}
console.log('ok ' + passed + ' assertions seriesLiveReplacePreflight.selftest');
