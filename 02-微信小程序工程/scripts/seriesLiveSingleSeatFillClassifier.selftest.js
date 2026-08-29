/**
 * Series LIVE 严格单座位补录分类器
 * 运行：node scripts/seriesLiveSingleSeatFillClassifier.selftest.js
 */

var fs = require('fs');
var path = require('path');
var cls = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'seriesLiveSingleSeatFillClassifier.js'));
var seriesRyderCup = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'seriesRyderCup.js'));

var classify = cls.classifySeriesLiveSingleSeatFill;
var KIND = cls.KIND;
var ROUTE = cls.ROUTE;

var passed = 0;
var failed = [];

function assert(name, cond) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
    return;
  }
  failed.push(name);
  console.log('FAIL  ' + name);
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function player(id, pos, extra) {
  var e = extra || {};
  var row = {
    position: pos,
    userId: id,
    playerId: id,
    id: id,
    displayName: id ? '球员' + id : '',
    seriesParticipantId: e.part != null ? e.part : (id === 'C' || id === 'C2' || id === 'B' ? 'part-blue' : 'part-red'),
    matchTeamId: e.team != null ? e.team : (id === 'C' || id === 'C2' || id === 'B' ? 'blue' : 'red'),
    affiliationId: e.team != null ? e.team : (id === 'C' || id === 'C2' || id === 'B' ? 'blue' : 'red'),
    fromSeriesRoster: true
  };
  if (e.scorePlayerId != null) row.scorePlayerId = e.scorePlayerId;
  else if (id) row.scorePlayerId = id;
  if (e.entityId != null) row.entityId = e.entityId;
  if (e.pairingId != null) row.pairingId = e.pairingId;
  if (e.hasHistoryScore != null) row.hasHistoryScore = e.hasHistoryScore;
  return Object.assign(row, e.more || {});
}

function emptySeat(pos, extra) {
  var e = extra || {};
  return player('', pos, Object.assign({ scorePlayerId: '', part: '', team: e.team || 'blue' }, e));
}

function baseMatch(gameMode, extra) {
  var o = extra || {};
  var g1Players = o.g1Players || [player('A', 1), emptySeat(2)];
  var g2Players = o.g2Players || [player('X', 1, { scorePlayerId: 'X', entityId: 'ent-x', pairingId: 'p9' })];
  return {
    matchId: 'm1',
    status: 'ongoing',
    gameMode: gameMode,
    scoreData: { keep: true },
    groups: [
      { groupId: 'g1', groupName: '第1组', players: g1Players },
      { groupId: 'g2', groupName: '第2组', players: g2Players }
    ],
    pairings: o.pairings || {},
    scoreEntities: o.scoreEntities || {
      g1: [{ entityId: 'ent-1', members: ['A'], scoreOwnerId: 'own-1' }],
      g2: [{ entityId: 'ent-x', members: ['X'], scoreOwnerId: 'own-x' }]
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

function fillSeat(match, groupId, position, toId, extra) {
  var next = clone(match);
  var e = extra || {};
  next.groups.forEach(function (g) {
    if (g.groupId !== groupId) return;
    g.players = g.players.map(function (p) {
      if (Number(p.position) !== Number(position)) return p;
      var row = Object.assign({}, p, {
        userId: toId,
        playerId: toId,
        id: toId,
        displayName: e.displayName != null ? e.displayName : '球员' + toId,
        seriesParticipantId: e.seriesParticipantId != null ? e.seriesParticipantId : 'part-blue',
        matchTeamId: e.matchTeamId != null ? e.matchTeamId : 'blue',
        affiliationId: e.affiliationId != null ? e.affiliationId : 'blue'
      });
      if (e.scorePlayerId != null) row.scorePlayerId = e.scorePlayerId;
      if (e.entityId != null) row.entityId = e.entityId;
      return row;
    });
  });
  if (next.pairings && next.pairings[groupId]) {
    next.pairings[groupId] = next.pairings[groupId].map(function (row, idx) {
      var r = clone(row);
      if (e.pairingIndex != null && idx !== e.pairingIndex) return r;
      if (Array.isArray(r.playerIds) && r.playerIds.indexOf(toId) < 0) {
        r.playerIds = r.playerIds.concat([toId]);
      }
      if (Array.isArray(r.members) && r.members.indexOf(toId) < 0) {
        r.members = r.members.concat([toId]);
      }
      return r;
    });
  }
  if (e.newPairing && next.pairings) {
    if (!next.pairings[groupId]) next.pairings[groupId] = [];
    next.pairings[groupId] = next.pairings[groupId].concat([e.newPairing]);
  }
  if (next.scoreEntities && next.scoreEntities[groupId]) {
    next.scoreEntities[groupId] = next.scoreEntities[groupId].map(function (row, idx) {
      var r = clone(row);
      if (e.entityIndex != null && idx !== e.entityIndex) return r;
      if (e.skipEntityMember) return r;
      if (Array.isArray(r.members) && r.members.indexOf(toId) < 0) {
        r.members = r.members.concat([toId]);
      }
      return r;
    });
  }
  if (e.newEntity && next.scoreEntities) {
    if (!next.scoreEntities[groupId]) next.scoreEntities[groupId] = [];
    next.scoreEntities[groupId] = next.scoreEntities[groupId].concat([e.newEntity]);
  }
  return next;
}

function run(before, after, editedGroupId, targetPosition) {
  return classify({
    beforeMatch: before,
    candidateMatch: after,
    editedGroupId: editedGroupId || 'g1',
    targetPosition: targetPosition != null ? targetPosition : 2
  });
}

(function vacuumFill() {
  var before = baseMatch('个人比洞赛');
  var frozen = clone(before);
  var after = fillSeat(before, 'g1', 2, 'B', {
    scorePlayerId: 'B',
    skipEntityMember: true,
    newEntity: { entityId: 'ent-b', members: ['B'], scoreOwnerId: 'own-b' }
  });
  var r = run(before, after, 'g1', 2);
  assert('1 真空位加入 B', r.ok === true && r.kind === KIND.single_seat_fill);
  assert('1 recommendedRoute', r.recommendedRoute === ROUTE.single_seat_fill_journal);
  assert('2 真空位 scorePlayerId=B', r.fill.scoreIdentityMode === 'new' && r.fill.afterScoreIdentity.scorePlayerId === 'B');
  assert('1 incoming B', r.fill.incomingUserId === 'B' && r.fill.position === 2);
  assert('16 输入不变', JSON.stringify(before) === JSON.stringify(frozen));
})();

(function historyFill() {
  var before = baseMatch('个人比洞赛', {
    g1Players: [player('C', 1), emptySeat(2, { scorePlayerId: 'A', entityId: 'ent-hist' })]
  });
  before.scoreEntities.g1 = [{ entityId: 'ent-hist', members: [], scoreOwnerId: 'own-a' }];
  var after = fillSeat(before, 'g1', 2, 'B', {
    scorePlayerId: 'A',
    entityId: 'ent-hist',
    entityIndex: 0
  });
  var r = run(before, after, 'g1', 2);
  assert('3 历史空座加入 B', r.ok === true && r.fill.scoreIdentityMode === 'inherited');
  assert('4 历史 scorePlayerId=A 保留', r.fill.afterScoreIdentity.scorePlayerId === 'A');
})();

(function historyMutatedToB() {
  var before = baseMatch('个人比洞赛', {
    g1Players: [player('C', 1), emptySeat(2, { scorePlayerId: 'A' })]
  });
  var after = fillSeat(before, 'g1', 2, 'B', { scorePlayerId: 'B' });
  var r = run(before, after, 'g1', 2);
  assert('5 历史成绩身份改成 B 拒绝', r.ok === false && r.code === 'score_identity_drift');
})();

(function replacementNotFill() {
  var before = baseMatch('个人比洞赛', {
    g1Players: [player('A', 1), player('C', 2)]
  });
  var after = clone(before);
  after.groups[0].players[0] = player('B', 1, { scorePlayerId: 'A', entityId: 'ent-1' });
  after.scoreEntities.g1[0].members = ['B'];
  var r = run(before, after, 'g1', 1);
  assert('6 A→B 返回 player_replacement', r.ok === false && r.code === 'player_replacement');
})();

(function twoAdds() {
  var before = baseMatch('个人比洞赛', {
    g1Players: [emptySeat(1), emptySeat(2)]
  });
  before.scoreEntities.g1 = [];
  var after = clone(before);
  after.groups[0].players[0] = player('B', 1, { scorePlayerId: 'B' });
  after.groups[0].players[1] = player('C', 2, { scorePlayerId: 'C' });
  var r = run(before, after, 'g1', 1);
  assert('7 两个空位同时加入拒绝', r.ok === false && r.code === 'multiple_changes');
})();

(function addRemove() {
  var before = baseMatch('个人比洞赛', {
    g1Players: [player('A', 1), emptySeat(2)]
  });
  var after = clone(before);
  after.groups[0].players[0] = emptySeat(1, { scorePlayerId: 'A' });
  after.groups[0].players[1] = player('B', 2, { scorePlayerId: 'B' });
  var r = run(before, after, 'g1', 2);
  assert('8 add+remove 拒绝', r.ok === false && (r.code === 'player_move' || r.code === 'player_removal' || r.code === 'multiple_changes'));
})();

(function swapMove() {
  var before = baseMatch('个人比洞赛', {
    g1Players: [player('A', 1), player('C', 2)]
  });
  var after = clone(before);
  after.groups[0].players[0] = player('C', 1, { scorePlayerId: 'C' });
  after.groups[0].players[1] = player('A', 2, { scorePlayerId: 'A' });
  var r = run(before, after, 'g1', 2);
  assert('9 swap 拒绝', r.ok === false && r.code === 'seat_swap');

  var moved = clone(before);
  moved.groups[0].players[0] = emptySeat(1, { scorePlayerId: 'A' });
  moved.groups[0].players[1] = player('A', 2, { scorePlayerId: 'A' });
  var r2 = run(before, moved, 'g1', 2);
  assert('9 move 拒绝', r2.ok === false && r2.code === 'player_move');
})();

(function alreadySeated() {
  var before = baseMatch('个人比洞赛', {
    g1Players: [player('B', 1, { scorePlayerId: 'B' }), emptySeat(2)]
  });
  var after = fillSeat(before, 'g1', 2, 'B', { scorePlayerId: 'B' });
  var r = run(before, after, 'g1', 2);
  assert('10 B 已在其它座位', r.ok === false && r.code === 'incoming_already_in_round');
})();

(function g5ok() {
  var before = baseMatch('个人比洞赛');
  var after = fillSeat(before, 'g1', 2, 'B', {
    scorePlayerId: 'B',
    skipEntityMember: true,
    newEntity: { entityId: 'ent-b', members: ['B'], scoreOwnerId: 'own-b' }
  });
  var r = run(before, after, 'g1', 2);
  assert('11 G5 真空位补录', r.ok === true && r.kind === KIND.single_seat_fill);
})();

(function g6g7() {
  var before = baseMatch('四人四球比洞赛', {
    g1Players: [
      player('A', 1),
      player('A2', 2),
      player('C', 3),
      emptySeat(4, { team: 'blue' })
    ],
    scoreEntities: {
      g1: [
        { entityId: 'ent-red', members: ['A', 'A2'], scoreOwnerId: 'own-red' },
        { entityId: 'ent-blue', members: ['C'], scoreOwnerId: 'own-blue' }
      ],
      g2: [{ entityId: 'ent-x', members: ['X'], scoreOwnerId: 'own-x' }]
    }
  });
  var after = fillSeat(before, 'g1', 4, 'B', { scorePlayerId: 'B', entityIndex: 1 });
  var r = run(before, after, 'g1', 4);
  assert('12 G6 必要 entity 成员增加 B', r.ok === true && r.fill.scoreIdentityMode === 'new');

  var g7 = clone(before);
  g7.gameMode = '最佳球位比洞赛';
  var after7 = fillSeat(g7, 'g1', 4, 'B', { scorePlayerId: 'B', entityIndex: 1 });
  var r7 = run(g7, after7, 'g1', 4);
  assert('12 G7 同样可补录', r7.ok === true);
})();

(function g8pairing() {
  var before = baseMatch('四人两球比洞赛', {
    g1Players: [
      player('A', 1, { pairingId: 'p1', entityId: 'e1' }),
      emptySeat(2, { pairingId: 'p1', entityId: 'e1', team: 'red' }),
      player('C', 3, { pairingId: 'p2', entityId: 'e2' }),
      player('C2', 4, { pairingId: 'p2', entityId: 'e2' })
    ],
    pairings: {
      g1: [
        { pairingId: 'p1', entityId: 'e1', playerIds: ['A'] },
        { pairingId: 'p2', entityId: 'e2', playerIds: ['C', 'C2'] }
      ],
      g2: [{ pairingId: 'p9', entityId: 'ex', playerIds: ['X'] }]
    },
    scoreEntities: {
      g1: [
        { entityId: 'e1', members: ['A'], scoreOwnerId: 'own-1' },
        { entityId: 'e2', members: ['C', 'C2'], scoreOwnerId: 'own-2' }
      ],
      g2: [{ entityId: 'ent-x', members: ['X'], scoreOwnerId: 'own-x' }]
    }
  });
  var after = fillSeat(before, 'g1', 2, 'B', {
    scorePlayerId: 'B',
    pairingIndex: 0,
    entityIndex: 0,
    seriesParticipantId: 'part-red',
    matchTeamId: 'red',
    affiliationId: 'red'
  });
  after.groups[0].players[1].pairingId = 'p1';
  after.groups[0].players[1].entityId = 'e1';
  var r = run(before, after, 'g1', 2);
  assert('13 G8 pairing 必要派生', r.ok === true && r.fill.incomingUserId === 'B');
  assert(
    '13 pairing 稳定 ID 仍在 derived',
    (r.derivedChanges || []).some(function (d) {
      return d.type === 'pairing_current_members';
    })
  );
})();

(function pairingEntityDrift() {
  var before = baseMatch('四人两球比洞赛', {
    g1Players: [player('A', 1, { pairingId: 'p1' }), emptySeat(2, { pairingId: 'p1' })],
    pairings: {
      g1: [{ pairingId: 'p1', entityId: 'e1', playerIds: ['A'] }],
      g2: [{ pairingId: 'p9', entityId: 'ex', playerIds: ['X'] }]
    }
  });
  var after = fillSeat(before, 'g1', 2, 'B', { scorePlayerId: 'B', pairingIndex: 0 });
  after.pairings.g1[0].pairingId = 'p-new';
  var r = run(before, after, 'g1', 2);
  assert('14 pairing 稳定 ID 漂移拒绝', r.ok === false && r.code === 'pairing_identity_drift');

  var after2 = fillSeat(before, 'g1', 2, 'B', { scorePlayerId: 'B', pairingIndex: 0 });
  after2.pairings.g1[0].playerIds = ['B', 'Z'];
  var r2 = run(before, after2, 'g1', 2);
  assert('14 pairing 非必要成员漂移拒绝', r2.ok === false && r2.code === 'pairing_structure_drift');

  var hist = baseMatch('个人比洞赛', {
    g1Players: [player('C', 1), emptySeat(2, { scorePlayerId: 'A', entityId: 'ent-hist' })]
  });
  hist.scoreEntities.g1 = [{ entityId: 'ent-hist', members: [], scoreOwnerId: 'own-a' }];
  var afterE = fillSeat(hist, 'g1', 2, 'B', {
    scorePlayerId: 'A',
    skipEntityMember: true,
    newEntity: { entityId: 'ent-new', members: ['B'], scoreOwnerId: 'own-b' }
  });
  var r3 = run(hist, afterE, 'g1', 2);
  assert('14 历史空座新建 entity 拒绝', r3.ok === false && r3.code === 'entity_structure_drift');
})();

(function otherGroup() {
  var before = baseMatch('个人比洞赛');
  var after = fillSeat(before, 'g1', 2, 'B', {
    scorePlayerId: 'B',
    skipEntityMember: true,
    newEntity: { entityId: 'ent-b', members: ['B'], scoreOwnerId: 'own-b' }
  });
  after.groups[1].players[0].displayName = '被改';
  var r = run(before, after, 'g1', 2);
  assert('15 其它 group 漂移拒绝', r.ok === false && r.code === 'cross_group_payload_drift');
})();

(function ryderParity() {
  var before = baseMatch('个人比洞赛');
  var after = fillSeat(before, 'g1', 2, 'B', {
    scorePlayerId: 'B',
    skipEntityMember: true,
    newEntity: { entityId: 'ent-b', members: ['B'], scoreOwnerId: 'own-b' }
  });
  var ordinary = run(before, after, 'g1', 2);
  var ryderBefore = clone(before);
  ryderBefore.seriesContext.seriesCompetitionType = seriesRyderCup.COMPETITION_TYPE;
  var ryderAfter = clone(after);
  ryderAfter.seriesContext.seriesCompetitionType = seriesRyderCup.COMPETITION_TYPE;
  var ryder = run(ryderBefore, ryderAfter, 'g1', 2);
  assert(
    '17 普通 Series / 显式莱德杯分类相同',
    ordinary.ok === ryder.ok && ordinary.kind === ryder.kind && ordinary.fill.incomingUserId === ryder.fill.incomingUserId
  );
})();

(function wiring() {
  var src = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'utils', 'seriesLiveSingleSeatFillClassifier.js'),
    'utf8'
  );
  assert(
    '18 主包无分包 require',
    src.indexOf('subpackages/') < 0 && src.indexOf("require('./seriesStationMatch.js')") >= 0
  );
  assert(
    '19 不写 storage',
    src.indexOf('saveMatch') < 0 &&
      src.indexOf('upsertSeries') < 0 &&
      src.indexOf('wx.setStorage') < 0
  );
})();

console.log('');
console.log('---- seriesLiveSingleSeatFillClassifier.selftest ----');
console.log('passed=' + passed + ' failed=' + failed.length);
if (failed.length) {
  failed.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
