/**
 * Series LIVE 换人原子计划（纯函数，不执行）
 * 运行：node scripts/seriesLiveReplacePlan.selftest.js
 */

var seriesTestPaths = require('./lib/seriesTestPaths.js');
var path = require('path');
var evidenceMod = require(seriesTestPaths.util('seriesLiveAffiliationEvidence.js'));
var decisionMod = require(seriesTestPaths.util('seriesLiveReplaceDecision.js'));
var planMod = require(seriesTestPaths.util('seriesLiveReplacePlan.js'));
var seriesRyderCup = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'seriesRyderCup.js'));

var decide = decisionMod.decideSeriesLiveReplace;
var ACTION = decisionMod.ACTION;
var STATE = evidenceMod.STATE;
var buildPlan = planMod.buildSeriesLiveReplacePlan;
var PLAN_STATUS = planMod.PLAN_STATUS;
var OP_TYPE = planMod.OP_TYPE;
var BLOCK_CODE = planMod.BLOCK_CODE;

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

function seriesOf(extra) {
  return Object.assign(
    {
      seriesId: 'ser-1',
      hostMode: 'organization',
      publishToken: 'tok-1',
      participants: [red(), blue()],
      roster: [],
      scoringRule: { allowRepeat: false }
    },
    extra || {}
  );
}

function rosterEntryB(extra) {
  return Object.assign(
    {
      rosterEntryId: 're-B',
      playerId: 'B',
      seriesParticipantId: 'part-red',
      registrationStatus: 'registered',
      playerNameSnapshot: '球员B',
      playerAvatarSnapshot: 'a-B'
    },
    extra || {}
  );
}

function seriesWithRosterB(extra, rosterExtra) {
  return seriesOf(
    Object.assign(
      {
        roster: [rosterEntryB(rosterExtra)]
      },
      extra || {}
    )
  );
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
      scorePlayerId: extra && extra.scorePlayerId != null ? extra.scorePlayerId : id,
      entityId: extra && extra.entityId ? extra.entityId : '',
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

function unlocked() {
  return { ok: true, state: STATE.unlocked, affiliationId: '', evidence: [] };
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
    if (o.requirePairing) {
      var list = payload.pairings && payload.pairings[g.groupId];
      if (!Array.isArray(list) || list.length !== 2) {
        return { ok: false, reason: 'pairing' };
      }
      for (var p = 0; p < list.length; p++) {
        if (!list[p] || !list[p].pairingId) return { ok: false, reason: 'pairing' };
        if (!Array.isArray(list[p].playerIds) || list[p].playerIds.length !== 2) {
          return { ok: false, reason: 'pairing' };
        }
      }
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
      if (o.g8 && (teams[ids[0]] !== 2 || teams[ids[1]] !== 2)) {
        return { ok: false, reason: 'affiliation' };
      }
    }
    return { ok: true };
  };
}

function targetOf(extra) {
  return Object.assign(
    {
      seriesId: 'ser-1',
      roundId: 'r1',
      matchId: 'm1',
      groupId: 'g1',
      position: 1,
      targetAffiliationId: 'part-red',
      publishToken: 'tok-1'
    },
    extra || {}
  );
}

function decideWith(cfg) {
  return decide({
    series: cfg.series,
    evidenceResult: cfg.evidenceResult,
    groups: cfg.groups,
    pairingDraft: cfg.pairingDraft || {},
    target: cfg.target,
    incomingPlayer: cfg.incomingPlayer,
    rosterAffiliationId: cfg.rosterAffiliationId,
    validateCandidate: cfg.validateCandidate
  });
}

function planWith(cfg) {
  var decision = cfg.decision || decideWith(cfg);
  return buildPlan({
    decision: decision,
    series: cfg.series,
    groups: cfg.groups,
    pairingDraft: cfg.pairingDraft || {},
    target: cfg.target,
    incomingPlayer: cfg.incomingPlayer,
    rosterAffiliationId: cfg.rosterAffiliationId,
    stationIndex: cfg.stationIndex
  });
}

function g5Groups() {
  return [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        seat('A', 1, 'part-red', { scorePlayerId: 'A', entityId: 'm1__g1__1' }),
        seat('C', 2, 'part-blue', { scorePlayerId: 'C' })
      ]
    }
  ];
}

function opTypes(plan) {
  return (plan.operations || []).map(function (op) {
    return op.type;
  });
}

function hasPre(plan, id) {
  return (plan.preconditions || []).some(function (p) {
    return p.id === id;
  });
}

(function direct_station_only() {
  var series = seriesOf();
  var groups = g5Groups();
  var incoming = incomingB();
  var target = targetOf();
  var plan = planWith({
    series: series,
    evidenceResult: unlocked(),
    groups: groups,
    target: target,
    incomingPlayer: incoming,
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '1 direct_replace 仅生成 station operation',
    plan.ok &&
      plan.planStatus === PLAN_STATUS.ready &&
      plan.requiresConfirmation === false &&
      opTypes(plan).join(',') === OP_TYPE.replace_station_seat
  );
})();

(function direct_with_roster_repair() {
  var series = seriesWithRosterB({}, { seriesParticipantId: 'part-blue' });
  var groups = g5Groups();
  var plan = planWith({
    series: series,
    evidenceResult: {
      ok: true,
      state: STATE.confirmed_affiliation_lock,
      affiliationId: 'part-red'
    },
    groups: groups,
    target: targetOf({ targetAffiliationId: 'part-red' }),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-blue',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '2 direct + needsRosterRepair 同时两个 operation',
    plan.ok &&
      plan.planStatus === PLAN_STATUS.ready &&
      plan.operations.length === 2 &&
      plan.operations[0].type === OP_TYPE.replace_station_seat &&
      plan.operations[1].type === OP_TYPE.repair_series_roster_affiliation
  );
})();

(function confirm_awaiting() {
  var series = seriesWithRosterB();
  var groups = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        seat('A', 1, 'part-red', { scorePlayerId: 'A', entityId: 'e-a' }),
        seat('C', 2, 'part-blue', { scorePlayerId: 'C' })
      ]
    }
  ];
  var plan = planWith({
    series: series,
    evidenceResult: unlocked(),
    groups: groups,
    target: targetOf({ position: 2, targetAffiliationId: 'part-blue' }),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '3 confirm_reaffiliate 为 awaiting_confirmation',
    plan.ok &&
      plan.planStatus === PLAN_STATUS.awaiting_confirmation &&
      plan.requiresConfirmation === true &&
      !!plan.confirmationFingerprint &&
      plan.executable === false
  );
})();

(function blocked_no_ops() {
  var invalid = planWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: [
      {
        groupId: 'g1',
        players: [seat('A', 1, 'part-red'), seat('C', 2, 'part-blue'), seat('D', 3, 'part-red')]
      }
    ],
    target: targetOf(),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var blocked = planWith({
    series: seriesOf(),
    evidenceResult: { ok: false, state: STATE.affiliation_conflict },
    groups: g5Groups(),
    target: targetOf(),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var reservation = planWith({
    series: seriesOf(),
    evidenceResult: {
      ok: true,
      state: STATE.participation_reservation,
      affiliationId: 'part-red'
    },
    groups: g5Groups(),
    target: targetOf({ position: 2, targetAffiliationId: 'part-blue' }),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '4 blocked/invalid 不生成 operation',
    invalid.planStatus === PLAN_STATUS.blocked &&
      invalid.operations.length === 0 &&
      invalid.reason === 'player_count' &&
      blocked.operations.length === 0 &&
      blocked.reason === 'affiliation_conflict' &&
      reservation.planStatus === PLAN_STATUS.blocked &&
      reservation.operations.length === 0 &&
      reservation.reason === 'participation_reservation'
  );
})();

(function plan_key_stable() {
  var cfg = {
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: g5Groups(),
    target: targetOf(),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  };
  var a = planWith(cfg);
  var b = planWith(cfg);
  var now = String(Date.now());
  assert(
    '5 planKey 稳定且不含时间戳',
    a.planKey &&
      a.planKey === b.planKey &&
      a.planKey.indexOf(now) < 0 &&
      a.planKey.indexOf('ser-1') >= 0 &&
      a.planKey.indexOf('r1') >= 0 &&
      a.planKey.indexOf('m1') >= 0 &&
      a.planKey.indexOf('g1') >= 0 &&
      a.planKey.indexOf('A') >= 0 &&
      a.planKey.indexOf('B') >= 0 &&
      a.planKey.indexOf('tok-1') >= 0
  );
})();

(function fingerprint_covers_identity() {
  var plan = planWith({
    series: seriesWithRosterB(),
    evidenceResult: unlocked(),
    groups: [
      {
        groupId: 'g1',
        players: [
          seat('A', 1, 'part-red', { scorePlayerId: 'A' }),
          seat('C', 2, 'part-blue', { scorePlayerId: 'C' })
        ]
      }
    ],
    target: targetOf({ position: 2, targetAffiliationId: 'part-blue' }),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var fp = plan.confirmationFingerprint || '';
  assert(
    '6 confirmationFingerprint 覆盖冻结身份',
    plan.planStatus === PLAN_STATUS.awaiting_confirmation &&
      fp.indexOf(plan.planKey) >= 0 &&
      fp.indexOf('B') >= 0 &&
      fp.indexOf('part-blue') >= 0 &&
      fp.indexOf('r1') >= 0 &&
      fp.indexOf('m1') >= 0 &&
      fp.indexOf('g1') >= 0 &&
      fp.indexOf('tok-1') >= 0
  );
})();

(function current_identity_a_to_b() {
  var plan = planWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: g5Groups(),
    target: targetOf(),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var op = plan.operations[0];
  assert(
    '7 A→B 当前身份正确',
    plan.identity.outgoingUserId === 'A' &&
      plan.identity.incomingUserId === 'B' &&
      op.outgoing.userId === 'A' &&
      op.incoming.userId === 'B' &&
      op.replacementSeat.currentIdentity.userId === 'B'
  );
})();

(function score_identity_kept() {
  var groups = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        seat('A', 1, 'part-red', {
          scorePlayerId: 'A',
          slotScorePlayerId: 'A-slot',
          scoreOwnerId: 'A-own',
          entityId: 'ent-a',
          slotId: 'slot-a',
          pairingId: 'p1',
          hasHistoryScore: true
        }),
        seat('C', 2, 'part-blue', { scorePlayerId: 'C' })
      ]
    }
  ];
  var plan = planWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: groups,
    target: targetOf(),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var score = plan.operations[0].scoreIdentity;
  assert(
    '8 成绩归属为当前球员 B，技术位置标识保留',
    score.scorePlayerId === 'B' &&
      score.slotScorePlayerId === 'A-slot' &&
      score.scoreOwnerId === 'A-own' &&
      score.entityId === 'ent-a' &&
      score.slotId === 'slot-a' &&
      score.pairingId === 'p1' &&
      score.hasHistoryScore === true &&
      plan.identity.scorePlayerId === 'B' &&
      plan.identity.entityId === 'ent-a' &&
      plan.identity.incomingUserId === plan.identity.scorePlayerId
  );
})();

(function pairing_current_vs_stable() {
  var groups = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        seat('A', 1, 'part-red', { scorePlayerId: 'A', pairingId: 'p1', entityId: 'ent-a' }),
        seat('A2', 2, 'part-red'),
        seat('C', 3, 'part-blue'),
        seat('C2', 4, 'part-blue')
      ]
    }
  ];
  var pairings = {
    g1: [
      { id: 'pair-ent-1', pairingId: 'p1', entityId: 'pair-ent-1', playerIds: ['A', 'A2'] },
      { id: 'pair-ent-2', pairingId: 'p2', entityId: 'pair-ent-2', playerIds: ['C', 'C2'] }
    ]
  };
  var plan = planWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: groups,
    pairingDraft: pairings,
    target: targetOf(),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 4, sides: 2, requirePairing: true, g8: true })
  });
  var op = plan.operations[0];
  assert(
    '9 pairing 当前成员变 B，稳定 pairing 身份不变',
    op.pairings.g1[0].playerIds.join(',') === 'B,A2' &&
      op.pairings.g1[0].pairingId === 'p1' &&
      op.pairings.g1[0].entityId === 'pair-ent-1' &&
      op.pairings.g1[0].id === 'pair-ent-1' &&
      op.pairingCurrentIdentity.fromUserId === 'A' &&
      op.pairingCurrentIdentity.toUserId === 'B'
  );
})();

(function no_fabricated_score_keys() {
  var groups = [
    {
      groupId: 'g1',
      players: [
        {
          position: 1,
          userId: 'A',
          playerId: 'A',
          id: 'A',
          seriesParticipantId: 'part-red',
          matchTeamId: 'red',
          affiliationId: 'red'
        },
        seat('C', 2, 'part-blue', { scorePlayerId: 'C' })
      ]
    }
  ];
  var plan = planWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: groups,
    target: targetOf(),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var score = plan.operations[0].scoreIdentity;
  assert(
    '10 成绩归属为当前球员，不伪造技术位置字段',
    score.scorePlayerId === 'B' &&
      !Object.prototype.hasOwnProperty.call(score, 'entityId') &&
      plan.identity.scorePlayerId === 'B' &&
      plan.identity.incomingUserId === 'B'
  );
})();

(function roster_patch_only_b_affiliation() {
  var plan = planWith({
    series: seriesWithRosterB(),
    evidenceResult: unlocked(),
    groups: [
      {
        groupId: 'g1',
        groupName: '第1组',
        players: [
          seat('A', 1, 'part-red', { scorePlayerId: 'A' }),
          seat('C', 2, 'part-blue', { scorePlayerId: 'C' })
        ]
      }
    ],
    target: targetOf({ position: 2, targetAffiliationId: 'part-blue' }),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var roster = plan.operations[1];
  var writeKeys = ['rosterEntryId', 'playerId', 'fromSeriesParticipantId', 'toSeriesParticipantId'];
  var extraWrite = writeKeys.some(function (k) {
    return roster[k] == null;
  });
  var blob = JSON.stringify(roster);
  var seatFields = ['groupName', 'fromSeriesRoster', 'matchTeamId', 'affiliationId', 'teamId', 'divisionId'];
  var leaked = seatFields.some(function (k) {
    return Object.prototype.hasOwnProperty.call(roster, k) || (roster.writeFieldAllowlist || []).indexOf(k) >= 0;
  });
  assert(
    '11 roster operation 仅含 rosterEntryId/playerId/from/to seriesParticipantId',
    roster &&
      roster.type === OP_TYPE.repair_series_roster_affiliation &&
      roster.rosterEntryId === 're-B' &&
      roster.playerId === 'B' &&
      roster.fromSeriesParticipantId === 'part-red' &&
      roster.toSeriesParticipantId === 'part-blue' &&
      extraWrite === false &&
      leaked === false &&
      roster.matchAllMatchingRows === false
  );
  assert(
    '12 不包含全局 team write',
    roster.forbidden.globalTeamDirectory === true &&
      roster.forbidden.otherSeries === true &&
      roster.forbidden.seatProjectionFields === true &&
      blob.indexOf('saveTeam') < 0
  );
})();

(function missing_target_affiliation() {
  var decision = decideWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: g5Groups(),
    target: { groupId: 'g1', position: 1, targetAffiliationId: 'part-red' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var plan = buildPlan({
    decision: decision,
    series: seriesOf(),
    groups: g5Groups(),
    pairingDraft: {},
    target: targetOf({ targetAffiliationId: '' }),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red'
  });
  assert(
    '13 targetAffiliationId 缺失 fail closed',
    plan.planStatus === PLAN_STATUS.blocked &&
      plan.operations.length === 0 &&
      plan.code === BLOCK_CODE.target_affiliation_id_required
  );
})();

(function missing_publish_token() {
  var series = seriesOf({ publishToken: '' });
  var decision = decideWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: g5Groups(),
    target: { groupId: 'g1', position: 1, targetAffiliationId: 'part-red' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var plan = buildPlan({
    decision: decision,
    series: series,
    groups: g5Groups(),
    target: targetOf({ publishToken: '' }),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red'
  });
  assert(
    '14 publishToken 缺失 fail closed',
    plan.planStatus === PLAN_STATUS.blocked &&
      plan.operations.length === 0 &&
      plan.code === BLOCK_CODE.publish_token_missing
  );
})();

(function incomplete_target_identity() {
  var decision = decideWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: g5Groups(),
    target: { groupId: 'g1', position: 1, targetAffiliationId: 'part-red' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var plan = buildPlan({
    decision: decision,
    series: seriesOf(),
    groups: g5Groups(),
    target: {
      seriesId: 'ser-1',
      roundId: '',
      matchId: 'm1',
      groupId: 'g1',
      position: 1,
      targetAffiliationId: 'part-red',
      publishToken: 'tok-1'
    },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red'
  });
  assert(
    '15 current target 四元身份不完整 fail closed',
    plan.planStatus === PLAN_STATUS.blocked &&
      plan.operations.length === 0 &&
      plan.code === BLOCK_CODE.current_target_identity_incomplete
  );
})();

(function no_shared_mutable_refs() {
  var groups = g5Groups();
  var pairings = {};
  var decision = decideWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: groups,
    pairingDraft: pairings,
    target: targetOf(),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var plan = buildPlan({
    decision: decision,
    series: seriesOf(),
    groups: groups,
    pairingDraft: pairings,
    target: targetOf(),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red'
  });
  var op = plan.operations[0];
  op.groups[0].players[0].userId = 'MUTATED';
  op.pairings.__mut = true;
  assert(
    '16 replacement 与输入不共享可变引用',
    groups[0].players[0].userId === 'A' &&
      decision.candidateGroups[0].players[0].userId === 'B' &&
      op !== decision.candidateGroups &&
      !pairings.__mut
  );
})();

(function inputs_frozen() {
  var series = seriesOf();
  var groups = g5Groups();
  var incoming = incomingB();
  var evidence = unlocked();
  var target = targetOf();
  var pairings = { g1: [] };
  var s0 = clone(series);
  var g0 = clone(groups);
  var i0 = clone(incoming);
  var e0 = clone(evidence);
  var t0 = clone(target);
  var p0 = clone(pairings);
  planWith({
    series: series,
    evidenceResult: evidence,
    groups: groups,
    pairingDraft: pairings,
    target: target,
    incomingPlayer: incoming,
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '17 输入对象不变',
    JSON.stringify(series) === JSON.stringify(s0) &&
      JSON.stringify(groups) === JSON.stringify(g0) &&
      JSON.stringify(incoming) === JSON.stringify(i0) &&
      JSON.stringify(evidence) === JSON.stringify(e0) &&
      JSON.stringify(target) === JSON.stringify(t0) &&
      JSON.stringify(pairings) === JSON.stringify(p0)
  );
})();

(function g5_g8_plans() {
  var g5 = planWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: g5Groups(),
    target: targetOf(),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var g6groups = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        seat('A', 1, 'part-red', { entityId: 'ent-keep', scorePlayerId: 'A' }),
        seat('A2', 2, 'part-red'),
        seat('C', 3, 'part-blue'),
        seat('C2', 4, 'part-blue')
      ]
    }
  ];
  var g6 = planWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: g6groups,
    target: targetOf(),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 4, sides: 2 })
  });
  var g8 = planWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: g6groups,
    pairingDraft: {
      g1: [
        { pairingId: 'p1', entityId: 'pe1', playerIds: ['A', 'A2'] },
        { pairingId: 'p2', entityId: 'pe2', playerIds: ['C', 'C2'] }
      ]
    },
    target: targetOf(),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 4, sides: 2, requirePairing: true, g8: true })
  });
  assert(
    '18 G5–G8 均能生成计划',
    g5.planStatus === PLAN_STATUS.ready &&
      g6.planStatus === PLAN_STATUS.ready &&
      g8.planStatus === PLAN_STATUS.ready &&
      g6.operations[0].replacementSeat.scoreIdentity.entityId === 'ent-keep' &&
      g8.operations[0].pairings.g1[0].playerIds[0] === 'B'
  );
})();

(function ryder_same_shape() {
  var ordinary = planWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: g5Groups(),
    target: targetOf(),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var ryder = planWith({
    series: seriesOf({
      seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
      scoringRule: seriesRyderCup.createRyderCupScoringRule()
    }),
    evidenceResult: unlocked(),
    groups: g5Groups(),
    target: targetOf(),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '19 普通 Series 与显式莱德杯计划结构相同',
    ordinary.planStatus === ryder.planStatus &&
      JSON.stringify(opTypes(ordinary)) === JSON.stringify(opTypes(ryder)) &&
      ordinary.identity.decisionAction === ryder.identity.decisionAction &&
      !!ordinary.atomicScope &&
      !!ryder.atomicScope &&
      ordinary.preconditions.length === ryder.preconditions.length
  );
})();

(function preconditions_recollect_redecide() {
  var plan = planWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: g5Groups(),
    target: targetOf(),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var ev = (plan.preconditions || []).filter(function (p) {
    return p.id === 'recollect_series_live_affiliation_evidence';
  })[0];
  var dec = (plan.preconditions || []).filter(function (p) {
    return p.id === 'redecide_series_live_replace';
  })[0];
  assert(
    '20 计划包含重新收集 evidence 和重新计算 decision 的前置要求',
    ev &&
      ev.reuseFrozenEvidence === false &&
      ev.module === 'seriesLiveAffiliationEvidence' &&
      dec &&
      dec.module === 'decideSeriesLiveReplace' &&
      dec.compatibility.directMustNotAutoUpgradeToConfirmExecute === true
  );
})();

(function distinct_block_codes() {
  var plan = planWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: g5Groups(),
    pairingDraft: {
      g1: [{ pairingId: 'p1', playerIds: ['A', 'C'] }]
    },
    target: targetOf(),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var codes = {};
  (plan.preconditions || []).forEach(function (p) {
    codes[p.id] = p.blockCode;
  });
  assert(
    '21 stale A、成绩身份变化、pairing 变化分别有明确阻止码',
    codes.seat_current_person_is_outgoing === BLOCK_CODE.stale_outgoing_person &&
      codes.score_identity_unchanged === BLOCK_CODE.score_identity_changed &&
      codes.pairing_structure_unchanged === BLOCK_CODE.pairing_changed &&
      BLOCK_CODE.stale_outgoing_person !== BLOCK_CODE.score_identity_changed &&
      BLOCK_CODE.score_identity_changed !== BLOCK_CODE.pairing_changed
  );
})();

(function atomic_scope() {
  var plan = planWith({
    series: seriesWithRosterB({}, { seriesParticipantId: 'part-blue' }),
    evidenceResult: {
      ok: true,
      state: STATE.confirmed_affiliation_lock,
      affiliationId: 'part-red'
    },
    groups: g5Groups(),
    target: targetOf(),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-blue',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '22 roster + station 被声明为同一 atomic scope',
    plan.atomicScope.stationAndRosterSingleTransaction === true &&
      plan.atomicScope.allSucceedOrAllRollback === true &&
      plan.atomicScope.forbidRosterChangedStationUnchanged === true &&
      plan.atomicScope.forbidStationChangedRosterUnrepaired === true &&
      plan.atomicScope.implementJournalInThisBatch === false &&
      plan.atomicScope.executionOrderNotImplied === true &&
      plan.operations.length === 2
  );
})();

(function roster_contract_41() {
  var unique = planWith({
    series: seriesWithRosterB(),
    evidenceResult: unlocked(),
    groups: [
      {
        groupId: 'g1',
        groupName: '第1组',
        players: [
          seat('A', 1, 'part-red', { scorePlayerId: 'A', groupName: '红队' }),
          seat('C', 2, 'part-blue', { scorePlayerId: 'C', groupName: '蓝队' })
        ]
      }
    ],
    target: targetOf({ position: 2, targetAffiliationId: 'part-blue' }),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var roster = unique.operations[1];
  var seatB = unique.operations[0].groups[0].players[1];
  var display = roster.participantDisplay || {};
  assert(
    '23 participantDisplay 明确只读',
    display.notUsedForRosterWrite === true &&
      display.shortName === '蓝队' &&
      unique.confirmationDisplay.notUsedForRosterWrite === true
  );
  assert('24 唯一 registered roster entry 可生成计划', unique.ok && roster.rosterEntryId === 're-B');

  var missing = planWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: [
      {
        groupId: 'g1',
        players: [
          seat('A', 1, 'part-red', { scorePlayerId: 'A' }),
          seat('C', 2, 'part-blue', { scorePlayerId: 'C' })
        ]
      }
    ],
    target: targetOf({ position: 2, targetAffiliationId: 'part-blue' }),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '25 零 registered entry → registered_roster_entry_missing',
    missing.planStatus === PLAN_STATUS.blocked &&
      missing.operations.length === 0 &&
      missing.code === BLOCK_CODE.registered_roster_entry_missing
  );

  var amb = planWith({
    series: seriesOf({
      roster: [
        rosterEntryB({ rosterEntryId: 're-B1' }),
        rosterEntryB({ rosterEntryId: 're-B2', seriesParticipantId: 'part-blue' })
      ]
    }),
    evidenceResult: unlocked(),
    groups: [
      {
        groupId: 'g1',
        players: [
          seat('A', 1, 'part-red', { scorePlayerId: 'A' }),
          seat('C', 2, 'part-blue', { scorePlayerId: 'C' })
        ]
      }
    ],
    target: targetOf({ position: 2, targetAffiliationId: 'part-blue' }),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '26 多 registered entry → registered_roster_entry_ambiguous',
    amb.code === BLOCK_CODE.registered_roster_entry_ambiguous && amb.operations.length === 0
  );

  var cancelledIgnored = planWith({
    series: seriesOf({
      roster: [
        rosterEntryB({
          rosterEntryId: 're-old',
          registrationStatus: 'cancelled',
          seriesParticipantId: 'part-blue'
        }),
        rosterEntryB({ rosterEntryId: 're-live', seriesParticipantId: 'part-red' })
      ]
    }),
    evidenceResult: unlocked(),
    groups: [
      {
        groupId: 'g1',
        players: [
          seat('A', 1, 'part-red', { scorePlayerId: 'A' }),
          seat('C', 2, 'part-blue', { scorePlayerId: 'C' })
        ]
      }
    ],
    target: targetOf({ position: 2, targetAffiliationId: 'part-blue' }),
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '27 cancelled 历史条目不被选中',
    cancelledIgnored.ok && cancelledIgnored.operations[1].rosterEntryId === 're-live'
  );

  var emptyAff = planWith({
    series: seriesWithRosterB({}, { seriesParticipantId: '' }),
    evidenceResult: unlocked(),
    groups: [
      {
        groupId: 'g1',
        players: [
          seat('A', 1, 'part-red', { scorePlayerId: 'A' }),
          seat('C', 2, 'part-blue', { scorePlayerId: 'C' })
        ]
      }
    ],
    target: targetOf({ position: 2, targetAffiliationId: 'part-blue' }),
    incomingPlayer: incomingB(),
    rosterAffiliationId: '',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '28 roster 归属为空但唯一 registered entry 存在时允许 confirm plan',
    emptyAff.ok &&
      emptyAff.planStatus === PLAN_STATUS.awaiting_confirmation &&
      emptyAff.operations[1].fromSeriesParticipantId === '' &&
      emptyAff.operations[1].toSeriesParticipantId === 'part-blue' &&
      emptyAff.operations[1].rosterEntryId === 're-B'
  );

  assert(
    '29 station seat 仍保留所需归属展示字段',
    seatB.seriesParticipantId === 'part-blue' &&
      seatB.matchTeamId === 'blue' &&
      seatB.groupName === '蓝队' &&
      unique.operations[0].replacementSeat.affiliationProjection.groupName === '蓝队'
  );
  assert('30 group.groupName 不变', unique.operations[0].groups[0].groupName === '第1组');
  assert(
    '31 plan 声明 executionOrderNotImplied',
    unique.atomicScope.executionOrderNotImplied === true &&
      unique.atomicScope.recommendedExecutionOrder.indexOf('station_write') === 1 &&
      unique.atomicScope.recommendedExecutionOrder.indexOf('roster_write') > 0
  );
  var lockIds = planMod.LOCK_PRECONDITION_IDS;
  var preIds = (unique.preconditions || []).map(function (p) {
    return p.id;
  });
  var allLocks = lockIds.every(function (id) {
    return preIds.indexOf(id) >= 0;
  });
  var perm = unique.preconditions.filter(function (p) {
    return p.id === 'manager_has_edit_groups_permission';
  })[0];
  var finished = unique.preconditions.filter(function (p) {
    return p.id === 'target_group_not_confirmed_finished';
  })[0];
  assert(
    '32 计划包含五项领域锁前置条件',
    allLocks &&
      perm.planBuilderDoesNotInferPermission === true &&
      finished.cannotBypassViaConfirmation === true
  );
})();

if (failed.length) {
  console.error('FAIL ' + failed.length + ' / ' + (passed + failed.length));
  failed.forEach(function (n) {
    console.error(' - ' + n);
  });
  process.exit(1);
}
console.log('ok ' + passed + ' assertions seriesLiveReplacePlan.selftest');
