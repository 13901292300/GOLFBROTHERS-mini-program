/**
 * Series LIVE 换人决策：replaceOnly / replaceAndReaffiliate（纯函数）
 * 运行：node scripts/seriesLiveReplaceDecision.selftest.js
 */

var seriesTestPaths = require('./lib/seriesTestPaths.js');
var path = require('path');
var evidenceMod = require(seriesTestPaths.util('seriesLiveAffiliationEvidence.js'));
var decisionMod = require(seriesTestPaths.util('seriesLiveReplaceDecision.js'));
var seriesRyderCup = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'seriesRyderCup.js'));

var decide = decisionMod.decideSeriesLiveReplace;
var ACTION = decisionMod.ACTION;
var STATE = evidenceMod.STATE;

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

var g5Groups = [
  {
    groupId: 'g1',
    groupName: '第1组',
    players: [
      seat('A', 1, 'part-red', { scorePlayerId: 'A', entityId: 'm1__g1__1' }),
      seat('C', 2, 'part-blue', { scorePlayerId: 'C' })
    ]
  }
];

(function same_affil_direct() {
  var series = seriesOf();
  var groups = clone(g5Groups);
  var out = decideWith({
    series: series,
    evidenceResult: unlocked(),
    groups: groups,
    target: {
      seriesId: 'ser-1',
      roundId: 'r1',
      matchId: 'm1',
      groupId: 'g1',
      position: 1,
      targetAffiliationId: 'part-red'
    },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert('1 同归属replaceOnly合法→direct', out.ok && out.action === ACTION.direct_replace);
  assert('14 B当前userId更新', out.candidateGroups[0].players[0].userId === 'B');
  assert('15 A稳定scorePlayerId保持', out.candidateGroups[0].players[0].scorePlayerId === 'A');
  assert(
    '16 entityId/groupId/position保持',
    out.candidateGroups[0].players[0].entityId === 'm1__g1__1' &&
      out.candidateGroups[0].groupId === 'g1' &&
      out.candidateGroups[0].players[0].position === 1
  );
})();

(function diff_affil_still_direct() {
  var series = seriesOf();
  var groups = clone(g5Groups);
  var out = decideWith({
    series: series,
    evidenceResult: unlocked(),
    groups: groups,
    target: {
      groupId: 'g1',
      position: 1,
      targetAffiliationId: 'part-red'
    },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-blue',
    validateCandidate: g5Validate({ requireCount: 2 })
  });
  var b = out.candidateGroups[0].players[0];
  assert(
    '2 异归属replaceOnly合法→direct，不确认、不改归属',
    out.ok &&
      out.action === ACTION.direct_replace &&
      out.requiresConfirmation === false &&
      b.seriesParticipantId === 'part-blue'
  );
})();

(function confirm_when_only_affil_fixes() {
  var series = seriesOf();
  var groups = [
    {
      groupId: 'g1',
      players: [
        seat('A', 1, 'part-red', { scorePlayerId: 'A', entityId: 'e-a' }),
        seat('C', 2, 'part-blue', { scorePlayerId: 'C' })
      ]
    }
  ];
  var out = decideWith({
    series: series,
    evidenceResult: unlocked(),
    groups: groups,
    target: {
      groupId: 'g1',
      position: 2,
      targetAffiliationId: 'part-blue'
    },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '3 replaceOnly非法改归属后合法 unlocked→confirm',
    out.ok &&
      out.action === ACTION.confirm_reaffiliate &&
      out.requiresConfirmation === true &&
      out.candidateGroups[0].players[1].seriesParticipantId === 'part-blue'
  );
  var onlySeat = decisionMod.assembleSeat(
    groups[0].players[1],
    incomingB(),
    series,
    'part-red',
    2,
    'g1'
  ).seat;
  var adjSeat = decisionMod.assembleSeat(
    groups[0].players[1],
    incomingB(),
    series,
    'part-blue',
    2,
    'g1'
  ).seat;
  assert('20 第二候选与第一候选只有归属字段不同', decisionMod.onlyAffiliationDiffers(onlySeat, adjSeat));
})();

(function both_invalid() {
  var series = seriesOf();
  var groups = [
    {
      groupId: 'g1',
      players: [
        seat('A', 1, 'part-red'),
        seat('C', 2, 'part-blue'),
        seat('D', 3, 'part-red')
      ]
    }
  ];
  var out = decideWith({
    series: series,
    evidenceResult: unlocked(),
    groups: groups,
    target: { groupId: 'g1', position: 1, targetAffiliationId: 'part-blue' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '4/6 两候选都非法/人数错误不确认',
    out.ok === false &&
      out.action === ACTION.invalid &&
      out.requiresConfirmation === false &&
      out.reason === 'player_count'
  );
})();

(function duplicate_not_bypassed() {
  var series = seriesOf();
  var groups = [
    {
      groupId: 'g1',
      players: [seat('A', 1, 'part-red'), seat('B', 2, 'part-blue')]
    }
  ];
  var out = decideWith({
    series: series,
    evidenceResult: unlocked(),
    groups: groups,
    target: { groupId: 'g1', position: 1, targetAffiliationId: 'part-red' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-blue',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '5 重复球员错误不能靠改归属绕过',
    out.action === ACTION.invalid && out.reason === 'duplicate'
  );
})();

(function pairing_not_bypassed() {
  var series = seriesOf();
  var groups = [
    {
      groupId: 'g1',
      players: [
        seat('A', 1, 'part-red'),
        seat('A2', 2, 'part-red'),
        seat('C', 3, 'part-blue'),
        seat('C2', 4, 'part-blue')
      ]
    }
  ];
  var out = decideWith({
    series: series,
    evidenceResult: unlocked(),
    groups: groups,
    pairingDraft: { g1: [{ playerIds: ['A', 'A2'] }] },
    target: { groupId: 'g1', position: 1, targetAffiliationId: 'part-red' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 4, sides: 2, requirePairing: true, g8: true })
  });
  assert('7 pairing错误不能靠改归属绕过', out.action === ACTION.invalid && out.reason === 'pairing');
})();

(function blocked_reservation() {
  var series = seriesOf();
  var groups = clone(g5Groups);
  var out = decideWith({
    series: series,
    evidenceResult: {
      ok: true,
      state: STATE.participation_reservation,
      affiliationId: 'part-red'
    },
    groups: groups,
    target: { groupId: 'g1', position: 2, targetAffiliationId: 'part-blue' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert('8 reservation与目标不同→blocked_reservation', out.action === ACTION.blocked_reservation);
})();

(function blocked_lock() {
  var series = seriesOf();
  var groups = clone(g5Groups);
  var out = decideWith({
    series: series,
    evidenceResult: {
      ok: true,
      state: STATE.confirmed_affiliation_lock,
      affiliationId: 'part-red'
    },
    groups: groups,
    target: { groupId: 'g1', position: 2, targetAffiliationId: 'part-blue' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert('9 confirmed lock与目标不同→blocked_confirmed_lock', out.action === ACTION.blocked_confirmed_lock);
})();

(function lock_same_repair() {
  var series = seriesOf();
  var groups = clone(g5Groups);
  var out = decideWith({
    series: series,
    evidenceResult: {
      ok: true,
      state: STATE.confirmed_affiliation_lock,
      affiliationId: 'part-red'
    },
    groups: groups,
    target: { groupId: 'g1', position: 1, targetAffiliationId: 'part-red' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-blue',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '10 reservation/lock与目标相同→direct+needsRosterRepair',
    out.ok &&
      out.action === ACTION.direct_replace &&
      out.needsRosterRepair === true &&
      out.requiresConfirmation === false &&
      out.candidateGroups[0].players[0].seriesParticipantId === 'part-red'
  );
})();

(function conflict_blocked() {
  var out = decideWith({
    series: seriesOf(),
    evidenceResult: { ok: false, state: STATE.affiliation_conflict },
    groups: clone(g5Groups),
    target: { groupId: 'g1', position: 1, targetAffiliationId: 'part-red' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert('11 conflict→blocked', out.action === ACTION.blocked && out.reason === 'affiliation_conflict');
})();

(function incomplete_blocked() {
  var out = decideWith({
    series: seriesOf(),
    evidenceResult: { ok: false, state: STATE.projection_incomplete },
    groups: clone(g5Groups),
    target: { groupId: 'g1', position: 1, targetAffiliationId: 'part-red' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert('12 incomplete→blocked', out.action === ACTION.blocked && out.reason === 'projection_incomplete');
})();

(function effective_priority() {
  var lock = decisionMod.resolveEffectiveAffiliation(
    { state: STATE.confirmed_affiliation_lock, affiliationId: 'part-red' },
    'part-blue'
  );
  var res = decisionMod.resolveEffectiveAffiliation(
    { state: STATE.participation_reservation, affiliationId: 'part-blue' },
    'part-red'
  );
  var un = decisionMod.resolveEffectiveAffiliation({ state: STATE.unlocked, affiliationId: '' }, 'part-red');
  assert(
    '13 effective归属优先级 lock > reservation > roster',
    lock.effectiveAffiliationId === 'part-red' &&
      lock.needsRosterRepair === true &&
      res.effectiveAffiliationId === 'part-blue' &&
      un.effectiveAffiliationId === 'part-red'
  );
})();

(function no_a_display_or_affil_leak() {
  var series = seriesOf();
  var groups = clone(g5Groups);
  var out = decideWith({
    series: series,
    evidenceResult: unlocked(),
    groups: groups,
    target: { groupId: 'g1', position: 1, targetAffiliationId: 'part-red' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-blue',
    validateCandidate: g5Validate({ requireCount: 2 })
  });
  var b = out.candidateGroups[0].players[0];
  assert('17 不残留A的displayName/avatar/gender', b.displayName === '球员B' && b.avatar === 'a-B' && b.gender === 'female');
  assert(
    '18 不残留A的seriesParticipantId/matchTeamId/颜色快照',
    b.seriesParticipantId === 'part-blue' && b.matchTeamId === 'blue' && b.colorSnapshot === '#00c'
  );
})();

(function missing_display_not_fallback_a() {
  var series = seriesOf();
  var groups = clone(g5Groups);
  var out = decideWith({
    series: series,
    evidenceResult: unlocked(),
    groups: groups,
    target: { groupId: 'g1', position: 1, targetAffiliationId: 'part-red' },
    incomingPlayer: { userId: 'B', playerId: 'B' },
    rosterAffiliationId: 'part-blue',
    validateCandidate: g5Validate({ requireCount: 2 })
  });
  var b = out.candidateGroups[0].players[0];
  assert(
    '19 B缺展示字段时不回退A',
    b.displayName === '' && b.avatar === '' && b.gender === '' && b.displayName !== '球员A'
  );
})();

(function inputs_frozen() {
  var series = seriesOf();
  var groups = clone(g5Groups);
  var incoming = incomingB();
  var evidence = unlocked();
  var s0 = clone(series);
  var g0 = clone(groups);
  var i0 = clone(incoming);
  var e0 = clone(evidence);
  var pairingDraft = {};
  var p0 = clone(pairingDraft);
  decideWith({
    series: series,
    evidenceResult: evidence,
    groups: groups,
    pairingDraft: pairingDraft,
    target: { groupId: 'g1', position: 1, targetAffiliationId: 'part-red' },
    incomingPlayer: incoming,
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '21 输入对象不变',
    JSON.stringify(series) === JSON.stringify(s0) &&
      JSON.stringify(groups) === JSON.stringify(g0) &&
      JSON.stringify(incoming) === JSON.stringify(i0) &&
      JSON.stringify(evidence) === JSON.stringify(e0) &&
      JSON.stringify(pairingDraft) === JSON.stringify(p0)
  );
})();

(function g5_shape() {
  var groups = clone(g5Groups);
  var out = decideWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: groups,
    target: { groupId: 'g1', position: 1, targetAffiliationId: 'part-red' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var filled = (out.candidateGroups[0].players || []).filter(function (p) {
    return p && p.userId;
  });
  var b = out.candidateGroups[0].players[0];
  assert(
    '22 G5单人候选',
    out.ok &&
      filled.length === 2 &&
      filled[0].userId === 'B' &&
      filled[1].userId === 'C' &&
      filled[0].position === 1 &&
      filled[1].position === 2 &&
      b.scorePlayerId === 'A' &&
      b.entityId === 'm1__g1__1'
  );
})();

(function g6_shape() {
  var groups = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        seat('A', 1, 'part-red', {
          entityId: 'ent-keep',
          scorePlayerId: 'A',
          slotScorePlayerId: 'A-slot',
          scoreOwnerId: 'A-own',
          slotId: 'slot-1',
          pairingId: 'pair-keep',
          hasHistoryScore: true
        }),
        seat('A2', 2, 'part-red'),
        seat('C', 3, 'part-blue'),
        seat('C2', 4, 'part-blue')
      ]
    }
  ];
  var out = decideWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: groups,
    target: { groupId: 'g1', position: 1, targetAffiliationId: 'part-red' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 4, sides: 2 })
  });
  var ps = out.candidateGroups[0].players;
  assert(
    '23 G6/G7组合候选',
    out.ok &&
      ps.length === 4 &&
      ps[0].entityId === 'ent-keep' &&
      ps[0].userId === 'B' &&
      ps[0].scorePlayerId === 'A' &&
      ps[0].slotScorePlayerId === 'A-slot' &&
      ps[0].scoreOwnerId === 'A-own' &&
      ps[0].slotId === 'slot-1' &&
      ps[0].pairingId === 'pair-keep' &&
      ps[0].hasHistoryScore === true &&
      ps[0].position === 1 &&
      ps[1].userId === 'A2' &&
      ps[2].userId === 'C' &&
      ps[3].userId === 'C2'
  );
})();

(function g8_pairing() {
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
  var groupsFrozen = clone(groups);
  var pairingsFrozen = clone(pairings);
  var out = decideWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: groups,
    pairingDraft: pairings,
    target: { groupId: 'g1', position: 1, targetAffiliationId: 'part-red' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 4, sides: 2, requirePairing: true, g8: true })
  });
  var p0 = out.candidatePairings.g1[0];
  var p1 = out.candidatePairings.g1[1];
  var b = out.candidateGroups[0].players[0];
  assert(
    '24 G8 pairing候选',
    out.ok &&
      p0.pairingId === 'p1' &&
      p0.id === 'pair-ent-1' &&
      p0.entityId === 'pair-ent-1' &&
      p0.playerIds[0] === 'B' &&
      p0.playerIds[1] === 'A2' &&
      p1.pairingId === 'p2' &&
      p1.playerIds[0] === 'C' &&
      p1.playerIds[1] === 'C2' &&
      out.candidatePairings.g1.length === 2 &&
      b.userId === 'B' &&
      b.scorePlayerId === 'A' &&
      b.entityId === 'ent-a' &&
      b.pairingId === 'p1' &&
      JSON.stringify(groups) === JSON.stringify(groupsFrozen) &&
      JSON.stringify(pairings) === JSON.stringify(pairingsFrozen)
  );
})();

(function ryder_same_fn() {
  var series = seriesOf({
    seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
    scoringRule: seriesRyderCup.createRyderCupScoringRule()
  });
  var out = decideWith({
    series: series,
    evidenceResult: unlocked(),
    groups: clone(g5Groups),
    target: { groupId: 'g1', position: 1, targetAffiliationId: 'part-red' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-blue',
    validateCandidate: g5Validate({ requireCount: 2 })
  });
  assert(
    '25 莱德杯与普通Series共用决策函数',
    out.ok && out.action === ACTION.direct_replace && series.scoringRule.allowRepeat === true
  );
})();

(function non_affiliation_drift_rejects_confirm() {
  var orig = decisionMod.onlyAffiliationDiffers;
  decisionMod.onlyAffiliationDiffers = function () {
    return false;
  };
  var out;
  try {
    out = decideWith({
      series: seriesOf(),
      evidenceResult: unlocked(),
      groups: [
        {
          groupId: 'g1',
          groupName: '第1组',
          players: [
            seat('A', 1, 'part-red', { scorePlayerId: 'A', entityId: 'e-a' }),
            seat('C', 2, 'part-blue', { scorePlayerId: 'C' })
          ]
        }
      ],
      target: { groupId: 'g1', position: 2, targetAffiliationId: 'part-blue' },
      incomingPlayer: incomingB(),
      rosterAffiliationId: 'part-red',
      validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
    });
  } finally {
    decisionMod.onlyAffiliationDiffers = orig;
  }
  assert(
    '26 非归属字段差异拒绝确认',
    out.action === ACTION.invalid &&
      out.ok === false &&
      out.reason === 'candidate_non_affiliation_drift' &&
      out.code === 'candidate_non_affiliation_drift' &&
      out.requiresConfirmation === false
  );

  var drifted = decisionMod.guardAffiliationOnlyCandidates(
    { userId: 'B', playerId: 'B', id: 'B', position: 1, scorePlayerId: 'A', matchTeamId: 'red' },
    { userId: 'X', playerId: 'B', id: 'B', position: 1, scorePlayerId: 'A', matchTeamId: 'blue' }
  );
  assert(
    '26b 完整差异含userId时 fail closed',
    drifted.ok === false && drifted.reason === 'candidate_non_affiliation_drift'
  );
})();

(function affiliation_only_allows_confirm() {
  var series = seriesOf();
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
  var out = decideWith({
    series: series,
    evidenceResult: unlocked(),
    groups: groups,
    target: { groupId: 'g1', position: 2, targetAffiliationId: 'part-blue' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var onlySeat = decisionMod.assembleSeat(groups[0].players[1], incomingB(), series, 'part-red', 2, 'g1').seat;
  var adjSeat = decisionMod.assembleSeat(groups[0].players[1], incomingB(), series, 'part-blue', 2, 'g1').seat;
  var stableOk =
    onlySeat.userId === adjSeat.userId &&
    onlySeat.playerId === adjSeat.playerId &&
    onlySeat.id === adjSeat.id &&
    onlySeat.position === adjSeat.position &&
    onlySeat.scorePlayerId === adjSeat.scorePlayerId &&
    onlySeat.entityId === adjSeat.entityId &&
    onlySeat.slotScorePlayerId === adjSeat.slotScorePlayerId &&
    onlySeat.scoreOwnerId === adjSeat.scoreOwnerId &&
    onlySeat.slotId === adjSeat.slotId &&
    onlySeat.pairingId === adjSeat.pairingId &&
    onlySeat.hasHistoryScore === adjSeat.hasHistoryScore;
  assert(
    '27 仅归属字段变化允许confirm_reaffiliate',
    out.ok &&
      out.action === ACTION.confirm_reaffiliate &&
      decisionMod.onlyAffiliationDiffers(onlySeat, adjSeat) &&
      stableOk &&
      out.affiliationDiffKeys.indexOf('userId') < 0
  );
})();

(function roster_repair_matrix() {
  var emptyRes = decisionMod.resolveEffectiveAffiliation(
    { state: STATE.participation_reservation, affiliationId: 'part-red' },
    ''
  );
  var emptyLock = decisionMod.resolveEffectiveAffiliation(
    { state: STATE.confirmed_affiliation_lock, affiliationId: 'part-red' },
    ''
  );
  var same = decisionMod.resolveEffectiveAffiliation(
    { state: STATE.participation_reservation, affiliationId: 'part-red' },
    'part-red'
  );
  var unlockedRepair = decisionMod.resolveEffectiveAffiliation(
    { state: STATE.unlocked, affiliationId: 'part-red' },
    ''
  );
  var unlockedDiff = decisionMod.resolveEffectiveAffiliation({ state: STATE.unlocked, affiliationId: '' }, 'part-blue');
  var oldFieldNorm = decisionMod.resolveEffectiveAffiliation(
    { state: STATE.confirmed_affiliation_lock, affiliationId: 'part-red' },
    'red'
  );
  assert('28 roster空+reservation→needsRosterRepair', emptyRes.needsRosterRepair === true);
  assert('29 roster空+confirmed lock→needsRosterRepair', emptyLock.needsRosterRepair === true);
  assert('30 roster与evidence相同→false', same.needsRosterRepair === false);
  assert(
    '31 unlocked不自动repair',
    unlockedRepair.needsRosterRepair === false && unlockedDiff.needsRosterRepair === false
  );
  assert('32 roster旧字段归一后不同→repair', oldFieldNorm.needsRosterRepair === true);
})();

(function groupName_is_affiliation_short_name() {
  var series = seriesOf();
  var groups = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        seat('A', 1, 'part-red', { scorePlayerId: 'A', groupName: '红队' }),
        seat('C', 2, 'part-blue', { scorePlayerId: 'C', groupName: '蓝队' })
      ]
    }
  ];
  var out = decideWith({
    series: series,
    evidenceResult: unlocked(),
    groups: groups,
    target: { groupId: 'g1', position: 2, targetAffiliationId: 'part-blue' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-red',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  var onlySeat = decisionMod.assembleSeat(groups[0].players[1], incomingB(), series, 'part-red', 2, 'g1').seat;
  var adjSeat = decisionMod.assembleSeat(groups[0].players[1], incomingB(), series, 'part-blue', 2, 'g1').seat;
  assert(
    '33 player.groupName是球队/分队简称，group.groupName是出发组名',
    out.ok &&
      out.action === ACTION.confirm_reaffiliate &&
      out.candidateGroups[0].groupName === '第1组' &&
      adjSeat.groupName === '蓝队' &&
      onlySeat.groupName === '红队' &&
      decisionMod.AFFILIATION_SNAPSHOT_KEYS.indexOf('groupName') >= 0 &&
      decisionMod.onlyAffiliationDiffers(onlySeat, adjSeat)
  );
})();

(function g8_reaffiliate_pairing_identity() {
  var groups = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        seat('A', 1, 'part-red', {
          scorePlayerId: 'A',
          entityId: 'ent-a',
          pairingId: 'p1',
          hasHistoryScore: true
        }),
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
  var g0 = clone(groups);
  var p0 = clone(pairings);
  var out = decideWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: groups,
    pairingDraft: pairings,
    target: { groupId: 'g1', position: 1, targetAffiliationId: 'part-red' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: 'part-blue',
    validateCandidate: g5Validate({ requireCount: 4, sides: 2, requirePairing: true, g8: true })
  });
  var onlySeat = decisionMod.assembleSeat(groups[0].players[0], incomingB(), seriesOf(), 'part-blue', 1, 'g1').seat;
  var adjSeat = decisionMod.assembleSeat(groups[0].players[0], incomingB(), seriesOf(), 'part-red', 1, 'g1').seat;
  var pair = out.candidatePairings.g1[0];
  var b = out.candidateGroups[0].players[0];
  assert(
    '34 G8 pairing当前身份更新、稳定身份不变',
    out.ok &&
      out.action === ACTION.confirm_reaffiliate &&
      pair.playerIds.join(',') === 'B,A2' &&
      pair.pairingId === 'p1' &&
      pair.entityId === 'pair-ent-1' &&
      pair.id === 'pair-ent-1' &&
      b.userId === 'B' &&
      b.scorePlayerId === 'A' &&
      b.entityId === 'ent-a' &&
      b.pairingId === 'p1' &&
      out.candidatePairings.g1[1].playerIds.join(',') === 'C,C2' &&
      decisionMod.onlyAffiliationDiffers(onlySeat, adjSeat) &&
      JSON.stringify(groups) === JSON.stringify(g0) &&
      JSON.stringify(pairings) === JSON.stringify(p0)
  );
})();

(function missing_roster_affiliation_confirm() {
  var groups = clone(g5Groups);
  var out = decideWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: groups,
    target: { groupId: 'g1', position: 1, targetAffiliationId: 'part-red' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: '',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '35 缺roster归属且target可成合法候选→confirm_reaffiliate',
    out.ok &&
      out.action === ACTION.confirm_reaffiliate &&
      out.requiresConfirmation === true &&
      out.needsRosterRepair === false &&
      out.candidateGroups[0].players[0].seriesParticipantId === 'part-red' &&
      out.candidateGroups[0].players[0].userId === 'B' &&
      out.candidateGroups[0].players[0].scorePlayerId === 'A'
  );

  var missingTarget = decideWith({
    series: seriesOf(),
    evidenceResult: unlocked(),
    groups: clone(g5Groups),
    target: { groupId: 'g1', position: 1, targetAffiliationId: '' },
    incomingPlayer: incomingB(),
    rosterAffiliationId: '',
    validateCandidate: g5Validate({ requireCount: 2, sides: 2 })
  });
  assert(
    '36 缺roster且无target→roster_affiliation_missing',
    missingTarget.ok === false &&
      missingTarget.action === ACTION.invalid &&
      missingTarget.reason === 'roster_affiliation_missing' &&
      missingTarget.code === 'roster_affiliation_missing'
  );
})();

if (failed.length) {
  console.error('FAIL ' + failed.length + ' / ' + (passed + failed.length));
  failed.forEach(function (n) {
    console.error(' - ' + n);
  });
  process.exit(1);
}
console.log('ok ' + passed + ' assertions seriesLiveReplaceDecision.selftest');
