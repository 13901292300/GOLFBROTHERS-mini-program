/**
 * Series LIVE 单座位换人 Preview 编排（6.2A-1）
 * 运行：node scripts/seriesLiveSingleReplaceFlow.selftest.js
 */

var fs = require('fs');
var path = require('path');
var seriesTestPaths = require('./lib/seriesTestPaths.js');
var flow = require(seriesTestPaths.util('seriesLiveSingleReplaceFlow.js'));
var planMod = require(seriesTestPaths.util('seriesLiveReplacePlan.js'));
var seriesRyderCup = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'seriesRyderCup.js'));

var preview = flow.previewSeriesLiveSingleReplace;
var buildJournalInput = flow.buildSeriesLiveSingleReplaceJournalInput;
var prepareExecution = flow.prepareSeriesLiveSingleReplaceExecution;
var executeFlow = flow.executeSeriesLiveSingleReplaceFlow;
var PLAN_STATUS = planMod.PLAN_STATUS;
var journalMod = require(seriesTestPaths.util('seriesLiveMutationJournal.js'));
var recoveryMod = require(seriesTestPaths.util('seriesLiveMutationRecovery.js'));
var PHASE = journalMod.PHASE;

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
  return JSON.parse(JSON.stringify(v));
}

function fingerprint(v) {
  return JSON.stringify(v);
}

function seat(id, pos, partId, extra) {
  return Object.assign(
    {
      position: pos,
      userId: id,
      playerId: id,
      id: id,
      displayName: '球员' + id,
      seriesParticipantId: partId,
      matchTeamId: partId === 'part-blue' ? 'blue' : 'red',
      affiliationId: partId === 'part-blue' ? 'blue' : 'red',
      scorePlayerId: extra && extra.scorePlayerId != null ? extra.scorePlayerId : id,
      entityId: extra && extra.entityId ? extra.entityId : 'ent-' + id,
      pairingId: extra && extra.pairingId ? extra.pairingId : 'p1'
    },
    extra || {}
  );
}

function incomingB() {
  return { userId: 'B', playerId: 'B', id: 'B', displayName: '球员B' };
}

function seriesOf(extra) {
  return Object.assign(
    {
      seriesId: 'ser-1',
      hostMode: 'organization',
      publishToken: 'tok-1',
      lifecycleStatus: 'published',
      competitionPhaseCache: 'live',
      registrationRevision: 3,
      participants: [
        {
          seriesParticipantId: 'part-red',
          kind: 'team',
          sourceTeamId: 'red',
          shortNameSnapshot: '红队',
          nameSnapshot: '红队',
          colorSnapshot: '#c00'
        },
        {
          seriesParticipantId: 'part-blue',
          kind: 'team',
          sourceTeamId: 'blue',
          shortNameSnapshot: '蓝队',
          nameSnapshot: '蓝队',
          colorSnapshot: '#00c'
        }
      ],
      roster: [
        {
          rosterEntryId: 're-B',
          playerId: 'B',
          seriesParticipantId: 'part-red',
          registrationStatus: 'registered'
        }
      ],
      rounds: [{ roundId: 'r1', matchId: 'm1', roundStatus: 'live' }]
    },
    extra || {}
  );
}

function matchOf() {
  return {
    matchId: 'm1',
    status: 'ongoing',
    gameMode: '个人比杆赛',
    scoreData: { keep: true },
    groups: [
      {
        groupId: 'g1',
        groupName: '第1组',
        players: [seat('A', 1, 'part-red'), seat('C', 2, 'part-blue', { scorePlayerId: 'C', entityId: 'ent-c' })]
      }
    ],
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
  };
}

function replaceSeat(match, groupId, position, fromId, toId) {
  var next = clone(match);
  next.groups.forEach(function (g) {
    if (g.groupId !== groupId) return;
    g.players = g.players.map(function (p) {
      if (Number(p.position) !== Number(position)) return p;
      return Object.assign({}, p, {
        userId: toId,
        playerId: toId,
        id: toId,
        displayName: '球员' + toId,
        scorePlayerId: toId || ''
      });
    });
  });
  if (next.pairings && next.pairings[groupId]) {
    next.pairings[groupId] = next.pairings[groupId].map(function (row) {
      var r = clone(row);
      if (Array.isArray(r.playerIds)) {
        r.playerIds = r.playerIds.map(function (id) {
          return id === fromId ? toId : id;
        });
      }
      return r;
    });
  }
  if (next.scoreEntities && next.scoreEntities[groupId]) {
    next.scoreEntities[groupId] = next.scoreEntities[groupId].map(function (row) {
      var r = clone(row);
      if (Array.isArray(r.memberIds)) {
        r.memberIds = r.memberIds.map(function (id) {
          return id === fromId ? toId : id;
        });
      }
      if (Array.isArray(r.members)) {
        r.members = r.members.map(function (id) {
          return id === fromId ? toId : id;
        });
      }
      return r;
    });
  }
  return next;
}

function g5Validate(opts) {
  var o = opts || {};
  return function (payload) {
    var groups = payload.groups || [];
    var g = groups[0] || {};
    var players = (g.players || []).filter(function (p) {
      return p && (p.userId || p.playerId);
    });
    if (o.requireCount != null && players.length !== o.requireCount) {
      return { ok: false, reason: 'player_count' };
    }
    var seen = Object.create(null);
    for (var i = 0; i < players.length; i++) {
      var id = String(players[i].userId || players[i].playerId);
      if (seen[id]) return { ok: false, reason: 'duplicate' };
      seen[id] = true;
    }
    if (o.sides === 2 && players.length >= 2) {
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
    }
    return { ok: true };
  };
}

function stationIndex() {
  return { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1' };
}

function getters(matches) {
  var box = matches || {};
  return function getMatchById(id) {
    return box[id] || null;
  };
}

function runPreview(cfg) {
  return preview({
    beforeMatch: cfg.beforeMatch,
    candidateMatch: cfg.candidateMatch,
    editedGroupId: cfg.editedGroupId || 'g1',
    series: cfg.series,
    stationIndex: cfg.stationIndex || stationIndex(),
    incomingPlayer: cfg.incomingPlayer || incomingB(),
    getMatchById: cfg.getMatchById,
    validateCandidate: cfg.validateCandidate
  });
}

(function classifier_rejected() {
  var before = matchOf();
  var after = replaceSeat(before, 'g1', 1, 'A', 'B');
  after.groups[0].players[0].scorePlayerId = 'A';
  var out = runPreview({
    beforeMatch: before,
    candidateMatch: after,
    series: seriesOf(),
    getMatchById: getters({ m1: before }),
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '1 classifier rejected',
    out.ok === false && out.status === 'rejected' && out.code === 'score_identity_drift'
  );
})();

(function evidence_incomplete() {
  var before = matchOf();
  var after = replaceSeat(before, 'g1', 1, 'A', 'B');
  var series = seriesOf({
    rounds: [
      { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
      { roundId: 'r2', matchId: 'm2', roundStatus: 'live' }
    ]
  });
  var out = runPreview({
    beforeMatch: before,
    candidateMatch: after,
    series: series,
    getMatchById: getters({ m1: before }),
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '2 evidence incomplete',
    out.ok === false && out.status === 'rejected' && (out.code === 'match_missing' || out.code === 'projection_incomplete')
  );
})();

(function decision_invalid() {
  var before = matchOf();
  var after = replaceSeat(before, 'g1', 1, 'A', 'B');
  var out = runPreview({
    beforeMatch: before,
    candidateMatch: after,
    series: seriesOf(),
    getMatchById: getters({ m1: before }),
    validateCandidate: function () {
      return { ok: false, reason: 'player_count' };
    }
  });
  assert(
    '3 decision invalid',
    out.ok === false && out.status === 'rejected' && !!out.code
  );
})();

(function direct_ready() {
  var before = matchOf();
  var after = replaceSeat(before, 'g1', 1, 'A', 'B');
  var out = runPreview({
    beforeMatch: before,
    candidateMatch: after,
    series: seriesOf(),
    getMatchById: getters({ m1: before }),
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '4 direct_ready',
    out.ok === true &&
      out.status === 'direct_ready' &&
      out.plan &&
      out.plan.planStatus === PLAN_STATUS.ready &&
      out.plan.decisionAction === 'direct_replace'
  );
})();

(function confirmation_required() {
  var before = matchOf();
  var after = replaceSeat(before, 'g1', 2, 'C', 'B');
  var out = runPreview({
    beforeMatch: before,
    candidateMatch: after,
    series: seriesOf(),
    getMatchById: getters({ m1: before }),
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '5 confirmation_required',
    out.ok === true &&
      out.status === 'confirmation_required' &&
      out.plan &&
      out.plan.planStatus === PLAN_STATUS.awaiting_confirmation &&
      out.plan.decisionAction === 'confirm_reaffiliate' &&
      !!out.confirmationFingerprint &&
      !!out.confirmationDisplay
  );
  assert(
    '6 fingerprint 原样来自 plan',
    out.confirmationFingerprint === out.plan.confirmationFingerprint &&
      out.confirmationDisplay === out.plan.confirmationDisplay
  );
})();

(function preview_no_write_no_wx() {
  var src = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'utils', 'seriesLiveSingleReplaceFlow.js'),
    'utf8'
  );
  var writes = 0;
  var before = matchOf();
  var after = replaceSeat(before, 'g1', 1, 'A', 'B');
  runPreview({
    beforeMatch: before,
    candidateMatch: after,
    series: seriesOf(),
    getMatchById: getters({ m1: before }),
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '7 preview 零写入、无 wx API',
    src.indexOf('wx.') < 0 &&
      src.indexOf('wx[') < 0 &&
      src.indexOf('wx.showModal') < 0 &&
      src.indexOf('wx.showToast') < 0 &&
      src.indexOf('executeSeriesLiveReplace') < 0 &&
      src.indexOf('executeSeriesLiveRollback') < 0 &&
      src.indexOf("seriesLiveReplace.js") < 0 &&
      src.indexOf('saveMatch') < 0 &&
      src.indexOf('upsertSeriesChecked') < 0 &&
      Object.keys(flow).join(',') ===
        'previewSeriesLiveSingleReplace,buildSeriesLiveSingleReplaceJournalInput,prepareSeriesLiveSingleReplaceExecution,executeSeriesLiveSingleReplaceFlow' &&
      writes === 0
  );
})();

(function inputs_unchanged() {
  var before = matchOf();
  var after = replaceSeat(before, 'g1', 1, 'A', 'B');
  var series = seriesOf();
  var incoming = incomingB();
  var index = stationIndex();
  var snap = {
    before: fingerprint(before),
    after: fingerprint(after),
    series: fingerprint(series),
    incoming: fingerprint(incoming),
    index: fingerprint(index)
  };
  preview({
    beforeMatch: before,
    candidateMatch: after,
    editedGroupId: 'g1',
    series: series,
    stationIndex: index,
    incomingPlayer: incoming,
    getMatchById: getters({ m1: before }),
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '8 输入不变',
    snap.before === fingerprint(before) &&
      snap.after === fingerprint(after) &&
      snap.series === fingerprint(series) &&
      snap.incoming === fingerprint(incoming) &&
      snap.index === fingerprint(index)
  );
})();

function seatLeak(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return ['groupName', 'fromSeriesRoster', 'matchTeamId', 'affiliationId', 'teamId', 'divisionId'].some(
    function (k) {
      return Object.prototype.hasOwnProperty.call(obj, k);
    }
  );
}

function playerOf(match, groupId, position) {
  var g = (match.groups || []).filter(function (row) {
    return row.groupId === groupId;
  })[0];
  return ((g && g.players) || []).filter(function (p) {
    return Number(p.position) === Number(position);
  })[0];
}

function directPreview(extra) {
  var o = extra || {};
  var before = o.match || matchOf();
  var series = o.series || seriesOf();
  var after = replaceSeat(before, 'g1', 1, 'A', 'B');
  var matches = o.matches || { m1: before };
  var out = runPreview({
    beforeMatch: before,
    candidateMatch: after,
    series: series,
    getMatchById: getters(matches),
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  return { preview: out, plan: out.plan, series: series, match: before, candidate: after };
}

function confirmPreview() {
  var before = matchOf();
  var after = replaceSeat(before, 'g1', 2, 'C', 'B');
  var series = seriesOf();
  var out = runPreview({
    beforeMatch: before,
    candidateMatch: after,
    series: series,
    getMatchById: getters({ m1: before }),
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  return { preview: out, plan: out.plan, series: series, match: before };
}

function rosterRepairPreview() {
  var before = matchOf();
  var after = replaceSeat(before, 'g1', 1, 'A', 'B');
  var series = seriesOf({
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
  var m2 = matchOf();
  m2.matchId = 'm2';
  m2.status = 'ongoing';
  m2.seriesContext = {
    managed: true,
    seriesId: 'ser-1',
    roundId: 'r2',
    matchId: 'm2',
    publishToken: 'tok-1'
  };
  m2.groups = [
    {
      groupId: 'g2',
      groupName: '第2组',
      status: 'finished',
      players: [seat('B', 1, 'part-red', { scorePlayerId: 'B', entityId: 'ent-b' })]
    }
  ];
  m2.pairings = { g2: [{ pairingId: 'p2', entityId: 'pe2', playerIds: ['B'] }] };
  m2.scoreEntities = { g2: [{ entityId: 'ent-b', memberIds: ['B'] }] };
  var out = runPreview({
    beforeMatch: before,
    candidateMatch: after,
    series: series,
    getMatchById: getters({ m1: before, m2: m2 }),
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  return { preview: out, plan: out.plan, series: series, match: before };
}

(function journal_direct_station_only() {
  var b = directPreview();
  var out = buildJournalInput({
    plan: b.plan,
    currentSeries: b.series,
    currentMatch: b.match
  });
  var beforeSeat = playerOf(
    { groups: [out.prepareInput && out.prepareInput.before.station.group] },
    'g1',
    1
  );
  var afterSeat = playerOf(
    { groups: [out.prepareInput && out.prepareInput.expectedAfter.station.group] },
    'g1',
    1
  );
  assert(
    '9 journal direct station-only',
    b.preview.status === 'direct_ready' &&
      out.ok &&
      out.prepareInput.plan === b.plan &&
      !out.prepareInput.confirmation &&
      !Object.prototype.hasOwnProperty.call(out.prepareInput.before, 'roster') &&
      !Object.prototype.hasOwnProperty.call(out.prepareInput.expectedAfter, 'roster') &&
      beforeSeat &&
      beforeSeat.userId === 'A' &&
      afterSeat &&
      afterSeat.userId === 'B' &&
      afterSeat.scorePlayerId === 'B' &&
      journalMod.fingerprintOf(out.prepareInput.before.station) ===
        journalMod.fingerprintOf(journalMod.freezeStation(out.prepareInput.before.station))
  );
})();

(function journal_direct_roster_repair() {
  var b = rosterRepairPreview();
  var out = buildJournalInput({
    plan: b.plan,
    currentSeries: b.series,
    currentMatch: b.match
  });
  var rosterOp = (b.plan.operations || []).filter(function (op) {
    return op.type === 'repair_series_roster_affiliation';
  })[0];
  assert(
    '10 journal direct + roster repair',
    b.preview.status === 'direct_ready' &&
      !!rosterOp &&
      out.ok &&
      out.prepareInput.before.roster.seriesParticipantId === rosterOp.fromSeriesParticipantId &&
      out.prepareInput.expectedAfter.roster.seriesParticipantId === rosterOp.toSeriesParticipantId &&
      out.prepareInput.before.roster.playerId === rosterOp.playerId &&
      out.prepareInput.expectedAfter.roster.registrationStatus === 'registered' &&
      Object.prototype.hasOwnProperty.call(out.prepareInput.before.roster, 'registrationRevision') &&
      Object.prototype.hasOwnProperty.call(out.prepareInput.before.roster, 'lifecycleStatus')
  );
})();

(function journal_confirm_ok() {
  var b = confirmPreview();
  var out = buildJournalInput({
    plan: b.plan,
    currentSeries: b.series,
    currentMatch: b.match,
    confirmationAcceptedFingerprint: b.plan.confirmationFingerprint
  });
  assert(
    '11 journal confirm 正确 fingerprint',
    b.preview.status === 'confirmation_required' &&
      out.ok &&
      out.prepareInput.confirmation.confirmationAcceptedFingerprint === b.plan.confirmationFingerprint &&
      !Object.prototype.hasOwnProperty.call(out.prepareInput.confirmation, 'confirmed')
  );
})();

(function journal_confirm_missing() {
  var b = confirmPreview();
  var out = buildJournalInput({
    plan: b.plan,
    currentSeries: b.series,
    currentMatch: b.match
  });
  assert('12 journal confirm 缺 fingerprint', out.ok === false && out.code === 'confirmation_required');
})();

(function journal_confirm_conflict() {
  var b = confirmPreview();
  var out = buildJournalInput({
    plan: b.plan,
    currentSeries: b.series,
    currentMatch: b.match,
    confirmationAcceptedFingerprint: b.plan.confirmationFingerprint + '-x'
  });
  assert(
    '13 journal confirm fingerprint 冲突',
    out.ok === false && out.code === 'confirmation_fingerprint_conflict'
  );
})();

(function journal_outgoing_changed() {
  var b = directPreview();
  var match = clone(b.match);
  match.groups[0].players[0].userId = 'X';
  match.groups[0].players[0].playerId = 'X';
  match.groups[0].players[0].id = 'X';
  var out = buildJournalInput({
    plan: b.plan,
    currentSeries: b.series,
    currentMatch: match
  });
  assert('14 journal outgoing A 已变化', out.ok === false && out.code === 'stale_outgoing_person');
})();

(function journal_station_op_bad() {
  var b = directPreview();
  var missing = clone(b.plan);
  missing.operations = [];
  var dup = clone(b.plan);
  dup.operations = dup.operations.concat(dup.operations[0]);
  var missOut = buildJournalInput({
    plan: missing,
    currentSeries: b.series,
    currentMatch: b.match
  });
  var dupOut = buildJournalInput({
    plan: dup,
    currentSeries: b.series,
    currentMatch: b.match
  });
  assert(
    '15 journal station operation 缺失/重复',
    missOut.code === 'station_operation_missing' && dupOut.code === 'station_operation_duplicate'
  );
})();

(function journal_roster_entry_bad() {
  var b = rosterRepairPreview();
  var missing = clone(b.series);
  missing.roster = [];
  var dup = clone(b.series);
  dup.roster = dup.roster.concat(clone(dup.roster[0]));
  var fromBad = clone(b.series);
  fromBad.roster[0].seriesParticipantId = 'part-other';
  var missOut = buildJournalInput({
    plan: b.plan,
    currentSeries: missing,
    currentMatch: b.match
  });
  var dupOut = buildJournalInput({
    plan: b.plan,
    currentSeries: dup,
    currentMatch: b.match
  });
  var fromOut = buildJournalInput({
    plan: b.plan,
    currentSeries: fromBad,
    currentMatch: b.match
  });
  assert(
    '16 journal roster entry 缺失/重复或 from 不一致',
    missOut.code === 'registered_roster_entry_missing' &&
      dupOut.code === 'registered_roster_entry_ambiguous' &&
      fromOut.code === 'roster_from_conflict'
  );
})();

(function journal_roster_no_seat_fields() {
  var b = rosterRepairPreview();
  var out = buildJournalInput({
    plan: b.plan,
    currentSeries: b.series,
    currentMatch: b.match
  });
  assert(
    '17 journal roster 快照不含 seat 字段',
    out.ok &&
      seatLeak(out.prepareInput.before.roster) === false &&
      seatLeak(out.prepareInput.expectedAfter.roster) === false
  );
})();

(function journal_inputs_unchanged() {
  var b = rosterRepairPreview();
  var planSnap = fingerprint(b.plan);
  var seriesSnap = fingerprint(b.series);
  var matchSnap = fingerprint(b.match);
  buildJournalInput({
    plan: b.plan,
    currentSeries: b.series,
    currentMatch: b.match
  });
  assert(
    '18 journal 输入 plan/Series/Match 不变',
    planSnap === fingerprint(b.plan) &&
      seriesSnap === fingerprint(b.series) &&
      matchSnap === fingerprint(b.match)
  );
})();

void seriesRyderCup;

function memoryJournal() {
  var box = { data: {}, writes: 0 };
  var api = journalMod.createSeriesLiveMutationJournal({
    getItem: function () {
      return { ok: true, value: box.data };
    },
    setItem: function (_key, value) {
      box.writes += 1;
      box.data = value;
      return { ok: true };
    }
  });
  return { api: api, box: box };
}

function walkPhases(api, planKey, chain) {
  for (var i = 0; i < chain.length - 1; i++) {
    var res = api.transitionJournal(planKey, chain[i], chain[i + 1]);
    if (!res.ok) return res;
  }
  return { ok: true };
}

function makeWorld(kind) {
  var before = matchOf();
  var series = seriesOf();
  var candidate =
    kind === 'confirm' ? replaceSeat(before, 'g1', 2, 'C', 'B') : replaceSeat(before, 'g1', 1, 'A', 'B');
  var incoming = incomingB();
  return {
    series: series,
    match: before,
    candidate: candidate,
    incoming: incoming,
    index: stationIndex(),
    kind: kind || 'direct'
  };
}

function runPrepare(world, extra) {
  var o = extra || {};
  var stats = {
    reload: 0,
    candidate: 0,
    prepare: 0,
    nextAttempt: 0,
    inspect: 0
  };
  var journal = o.journal || memoryJournal();
  var writesBefore = journal.box.writes;
  var out = prepareExecution({
    currentDraft: o.currentDraft != null ? o.currentDraft : world.candidate,
    editedGroupId: o.editedGroupId || 'g1',
    acceptedConfirmationFingerprint: o.acceptedConfirmationFingerprint,
    reloadContext: function () {
      stats.reload += 1;
      return {
        series: o.series || world.series,
        latestMatch: o.match || world.match,
        stationIndex: world.index,
        incomingPlayer: world.incoming,
        getMatchById: getters(o.matches || { m1: o.match || world.match })
      };
    },
    buildCandidateFromLatestMatch: function (latestMatch, currentDraft) {
      stats.candidate += 1;
      if (typeof o.buildCandidate === 'function') return o.buildCandidate(latestMatch, currentDraft);
      return o.candidate || currentDraft || world.candidate;
    },
    prepareJournal: function (input) {
      stats.prepare += 1;
      return journal.api.prepareJournal(input);
    },
    prepareNextAttemptAfterRollback: function (input) {
      stats.nextAttempt += 1;
      return journal.api.prepareNextAttemptAfterRollback(input);
    },
    getJournal: function (planKey) {
      return journal.api.getJournal(planKey);
    },
    inspectRecovery: function (input) {
      stats.inspect += 1;
      if (typeof o.inspectRecovery === 'function') return o.inspectRecovery(input);
      return recoveryMod.inspectSeriesLiveMutationRecovery(input);
    },
    validateCandidate: o.validateCandidate || g5Validate({ requireCount: 2, sides: 2 })
  });
  stats.journalWrites = journal.box.writes - writesBefore;
  return { out: out, stats: stats, journal: journal };
}

(function prepare_reload_each_time() {
  var world = makeWorld('direct');
  var a = runPrepare(world);
  var b = runPrepare(world, { journal: a.journal });
  assert('19 每次 reloadContext', a.stats.reload === 1 && b.stats.reload === 1 && a.stats.reload + b.stats.reload === 2);
  assert('20 每次重建 candidate', a.stats.candidate === 1 && b.stats.candidate === 1);
})();

(function prepare_rejected_no_journal() {
  var world = makeWorld('direct');
  var bad = clone(world.candidate);
  bad.groups[0].players[0].scorePlayerId = 'A';
  var r = runPrepare(world, { candidate: bad });
  assert(
    '21 rejected 零 journal',
    r.out.status === 'rejected' && r.stats.prepare === 0 && r.stats.nextAttempt === 0 && r.stats.journalWrites === 0
  );
})();

(function prepare_confirm_missing_fp() {
  var world = makeWorld('confirm');
  var r = runPrepare(world);
  assert(
    '22 confirm 缺 fingerprint',
    r.out.status === 'confirmation_required' && r.stats.prepare === 0 && r.stats.journalWrites === 0
  );
})();

(function prepare_confirm_stale_fp() {
  var world = makeWorld('confirm');
  var first = runPreview({
    beforeMatch: world.match,
    candidateMatch: world.candidate,
    series: world.series,
    getMatchById: getters({ m1: world.match }),
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var r = runPrepare(world, { acceptedConfirmationFingerprint: first.confirmationFingerprint + '-old' });
  assert(
    '23 confirm stale fingerprint',
    r.out.status === 'stale_confirmation' &&
      r.out.code === 'confirmation_fingerprint_conflict' &&
      r.stats.prepare === 0 &&
      r.stats.journalWrites === 0
  );
})();

(function prepare_confirm_ok_fp() {
  var world = makeWorld('confirm');
  var first = runPreview({
    beforeMatch: world.match,
    candidateMatch: world.candidate,
    series: world.series,
    getMatchById: getters({ m1: world.match }),
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var r = runPrepare(world, { acceptedConfirmationFingerprint: first.confirmationFingerprint });
  assert(
    '24 confirm 正确 fingerprint',
    r.out.ok &&
      r.out.status === 'prepared' &&
      r.out.attemptNumber === 1 &&
      r.stats.prepare === 1 &&
      r.stats.journalWrites > 0
  );
})();

(function prepare_direct_ignores_fp() {
  var world = makeWorld('direct');
  var r = runPrepare(world, { acceptedConfirmationFingerprint: 'stale-fp' });
  assert(
    '25 direct 不需要 fingerprint',
    r.out.ok &&
      r.out.status === 'prepared' &&
      r.out.plan.decisionAction === 'direct_replace' &&
      r.out.attemptNumber === 1 &&
      !r.journal.api.getJournal(r.out.planKey).journal.requiresConfirmation
  );
})();

(function prepare_first_attempt() {
  var world = makeWorld('direct');
  var r = runPrepare(world);
  assert(
    '26 首次 attempt prepared',
    r.out.ok &&
      r.out.status === 'prepared' &&
      r.out.attemptNumber === 1 &&
      r.out.journalAttemptKey === r.out.planKey + '::attempt:1' &&
      r.out.idempotent !== true
  );
})();

(function prepare_unfinished_idempotent() {
  var world = makeWorld('direct');
  var first = runPrepare(world);
  var second = runPrepare(world, { journal: first.journal });
  assert(
    '27 unfinished 同 fingerprint 幂等',
    first.out.status === 'prepared' &&
      second.out.status === 'prepared' &&
      second.out.idempotent === true &&
      second.out.attemptNumber === 1 &&
      second.out.journalAttemptKey === first.out.journalAttemptKey &&
      second.stats.nextAttempt === 0
  );
})();

(function prepare_rolled_back_attempt_two() {
  var world = makeWorld('direct');
  var first = runPrepare(world);
  walkPhases(first.journal.api, first.out.planKey, [
    PHASE.prepared,
    PHASE.rollback_pending,
    PHASE.rolling_back,
    PHASE.rolled_back
  ]);
  var second = runPrepare(world, { journal: first.journal });
  assert(
    '28 rolled_back + idempotent recovery → attempt 2',
    second.out.ok &&
      second.out.status === 'prepared' &&
      second.out.attemptNumber === 2 &&
      second.out.journalAttemptKey === second.out.planKey + '::attempt:2' &&
      second.stats.nextAttempt === 1 &&
      second.stats.inspect === 1 &&
      first.journal.box.data[first.out.planKey].history.length === 1
  );
})();

(function prepare_rolled_back_drift() {
  var world = makeWorld('direct');
  var first = runPrepare(world);
  walkPhases(first.journal.api, first.out.planKey, [
    PHASE.prepared,
    PHASE.rollback_pending,
    PHASE.rolling_back,
    PHASE.rolled_back
  ]);
  var drifted = clone(world.match);
  drifted.groups[0].players[0].userId = 'B';
  drifted.groups[0].players[0].playerId = 'B';
  drifted.groups[0].players[0].id = 'B';
  var second = runPrepare(world, { journal: first.journal, match: drifted, candidate: world.candidate });
  assert(
    '29 rolled_back drift → 不开新 attempt',
    (second.out.status === 'manual_review' || second.out.status === 'retry_not_safe' || second.out.status === 'rejected') &&
      second.stats.nextAttempt === 0 &&
      first.journal.api.getJournal(first.out.planKey).journal.attemptNumber === 1
  );
})();

(function prepare_committed_and_manual() {
  var world = makeWorld('direct');
  var committed = runPrepare(world);
  walkPhases(committed.journal.api, committed.out.planKey, [
    PHASE.prepared,
    PHASE.station_writing,
    PHASE.station_written,
    PHASE.station_verified,
    PHASE.committing,
    PHASE.committed
  ]);
  var again = runPrepare(world, { journal: committed.journal });
  var mrWorld = makeWorld('direct');
  var mr = runPrepare(mrWorld);
  mr.journal.api.transitionJournal(mr.out.planKey, PHASE.prepared, PHASE.manual_review);
  var mrAgain = runPrepare(mrWorld, { journal: mr.journal });
  assert(
    '30 committed/manual_review 不开新 attempt',
    again.out.status === 'already_committed' &&
      again.stats.nextAttempt === 0 &&
      mrAgain.out.status === 'manual_review' &&
      mrAgain.stats.nextAttempt === 0 &&
      mrAgain.stats.prepare === 0
  );
})();

function runExecute(world, extra) {
  var o = extra || {};
  var stats = {
    reload: 0,
    candidate: 0,
    prepare: 0,
    nextAttempt: 0,
    inspect: 0,
    forward: 0,
    rollback: 0
  };
  var journal = o.journal || memoryJournal();
  var out = executeFlow({
    currentDraft: o.currentDraft != null ? o.currentDraft : world.candidate,
    editedGroupId: o.editedGroupId || 'g1',
    acceptedConfirmationFingerprint: o.acceptedConfirmationFingerprint,
    reloadContext: function () {
      stats.reload += 1;
      return {
        series: o.series || world.series,
        latestMatch: o.match || world.match,
        stationIndex: world.index,
        incomingPlayer: world.incoming,
        getMatchById: getters(o.matches || { m1: o.match || world.match })
      };
    },
    buildCandidateFromLatestMatch: function (latestMatch, currentDraft) {
      stats.candidate += 1;
      if (typeof o.buildCandidate === 'function') return o.buildCandidate(latestMatch, currentDraft);
      return o.candidate || currentDraft || world.candidate;
    },
    prepareJournal: function (input) {
      stats.prepare += 1;
      return journal.api.prepareJournal(input);
    },
    prepareNextAttemptAfterRollback: function (input) {
      stats.nextAttempt += 1;
      return journal.api.prepareNextAttemptAfterRollback(input);
    },
    getJournal: function (planKey) {
      return journal.api.getJournal(planKey);
    },
    inspectRecovery: function (input) {
      stats.inspect += 1;
      if (typeof o.inspectRecovery === 'function') return o.inspectRecovery(input);
      return recoveryMod.inspectSeriesLiveMutationRecovery(input);
    },
    validateCandidate: o.validateCandidate || g5Validate({ requireCount: 2, sides: 2 }),
    executeForward: function (args) {
      stats.forward += 1;
      if (typeof o.executeForward === 'function') return o.executeForward(args);
      return {
        ok: true,
        journalPhase: PHASE.committed,
        idempotent: false
      };
    },
    executeRollback: function (args) {
      stats.rollback += 1;
      if (typeof o.executeRollback === 'function') return o.executeRollback(args);
      return {
        ok: true,
        journalPhase: PHASE.rolled_back
      };
    },
    currentUser: o.currentUser || { userId: 'admin' },
    hasManagePermission: o.hasManagePermission || function () {
      return true;
    },
    storeAdapters: o.storeAdapters || {
      getJournal: function (planKey) {
        return journal.api.getJournal(planKey);
      },
      transitionJournal: function (planKey, from, to, patch) {
        return journal.api.transitionJournal(planKey, from, to, patch);
      }
    }
  });
  return { out: out, stats: stats, journal: journal };
}

(function execute_rejected_no_forward() {
  var world = makeWorld('direct');
  var bad = clone(world.candidate);
  bad.groups[0].players[0].scorePlayerId = 'A';
  var r = runExecute(world, { candidate: bad });
  assert('31 prepare rejected → 不调 forward', r.out.status === 'rejected' && r.stats.forward === 0 && r.stats.rollback === 0);
})();

(function execute_confirm_required_no_forward() {
  var world = makeWorld('confirm');
  var r = runExecute(world);
  assert(
    '32 confirmation_required → 不调 forward',
    r.out.status === 'confirmation_required' && r.stats.forward === 0 && r.stats.rollback === 0
  );
})();

(function execute_stale_confirm_no_forward() {
  var world = makeWorld('confirm');
  var first = runPreview({
    beforeMatch: world.match,
    candidateMatch: world.candidate,
    series: world.series,
    getMatchById: getters({ m1: world.match }),
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var r = runExecute(world, { acceptedConfirmationFingerprint: first.confirmationFingerprint + '-old' });
  assert(
    '33 stale_confirmation → 不调 forward',
    r.out.status === 'stale_confirmation' && r.stats.forward === 0 && r.stats.rollback === 0
  );
})();

(function execute_already_committed() {
  var world = makeWorld('direct');
  var first = runPrepare(world);
  walkPhases(first.journal.api, first.out.planKey, [
    PHASE.prepared,
    PHASE.station_writing,
    PHASE.station_written,
    PHASE.station_verified,
    PHASE.committing,
    PHASE.committed
  ]);
  var r = runExecute(world, { journal: first.journal });
  assert(
    '34 already_committed → completed 幂等',
    r.out.ok &&
      r.out.status === 'completed' &&
      r.out.idempotent === true &&
      r.stats.forward === 0 &&
      r.stats.rollback === 0
  );
})();

(function execute_prepared_forward_committed() {
  var world = makeWorld('direct');
  var r = runExecute(world);
  assert('35 prepared → forward', r.stats.forward === 1);
  assert(
    '36 forward committed → completed',
    r.out.ok &&
      r.out.status === 'completed' &&
      r.out.planKey &&
      r.out.journalAttemptKey &&
      r.stats.rollback === 0
  );
})();

(function execute_failed_before() {
  var world = makeWorld('direct');
  var r = runExecute(world, {
    executeForward: function () {
      return { ok: false, code: 'station_write_failed_before', requiresRollback: false, journalPhase: PHASE.station_writing };
    }
  });
  assert(
    '37 forward failed-before → 不 rollback',
    r.out.status === 'failed_before_write' && r.out.code === 'station_write_failed_before' && r.stats.rollback === 0
  );
})();

(function execute_requires_rollback_success() {
  var world = makeWorld('direct');
  var r = runExecute(world, {
    executeForward: function () {
      return { ok: false, code: 'roster_write_failed_before', requiresRollback: true, journalPhase: PHASE.rollback_pending };
    },
    executeRollback: function () {
      return { ok: true, journalPhase: PHASE.rolled_back };
    }
  });
  assert('38 forward requiresRollback → 调 rollback 一次', r.stats.forward === 1 && r.stats.rollback === 1);
  assert(
    '39 rollback 成功 → failed_rolled_back',
    r.out.ok === false && r.out.status === 'failed_rolled_back' && r.out.rollbackCompleted === true
  );
})();

(function execute_rollback_manual_or_throw() {
  var world = makeWorld('direct');
  var manual = runExecute(world, {
    executeForward: function () {
      return { ok: false, code: 'fwd-x', requiresRollback: true };
    },
    executeRollback: function () {
      return { ok: false, code: 'rb-y', requiresManualReview: true, journalPhase: PHASE.manual_review };
    }
  });
  var threw = runExecute(world, {
    executeForward: function () {
      return { ok: false, code: 'fwd-x', requiresRollback: true };
    },
    executeRollback: function () {
      throw new Error('rb-boom');
    }
  });
  assert(
    '40 rollback manual/throw → manual_review',
    manual.out.status === 'manual_review' &&
      manual.out.requiresManualReview === true &&
      manual.out.forwardCode === 'fwd-x' &&
      manual.out.rollbackCode === 'rb-y' &&
      threw.out.status === 'manual_review' &&
      threw.out.requiresManualReview === true &&
      threw.out.rollbackCode === 'flow_rollback_throw'
  );
})();

(function execute_forward_unknown_or_throw() {
  var world = makeWorld('direct');
  var unknown = runExecute(world, {
    executeForward: function () {
      return { ok: true, journalPhase: PHASE.station_written };
    }
  });
  var threw = runExecute(world, {
    executeForward: function () {
      throw new Error('fwd-boom');
    }
  });
  assert(
    '41 forward unknown/throw → manual_review',
    unknown.out.status === 'manual_review' &&
      unknown.out.requiresManualReview === true &&
      threw.out.status === 'manual_review' &&
      threw.out.requiresManualReview === true &&
      unknown.stats.rollback === 0 &&
      threw.stats.rollback === 0
  );
})();

(function execute_once_each() {
  var world = makeWorld('direct');
  var r = runExecute(world, {
    executeForward: function () {
      return { ok: false, code: 'need-rb', requiresRollback: true };
    },
    executeRollback: function () {
      return { ok: true, journalPhase: PHASE.rolled_back };
    }
  });
  assert(
    '42 同一次最多 forward 一次、rollback 一次',
    r.stats.forward === 1 && r.stats.rollback === 1 && r.out.status === 'failed_rolled_back'
  );
})();

if (failed.length) {
  console.error('FAIL ' + failed.length + ' ' + failed.join(' | '));
  process.exit(1);
}
console.log('ok ' + passed + ' assertions seriesLiveSingleReplaceFlow.selftest');
