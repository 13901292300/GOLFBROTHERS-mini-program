/**
 * Series LIVE 严格单座位分类器
 * 运行：node scripts/seriesLiveSingleReplaceClassifier.selftest.js
 */

var fs = require('fs');
var path = require('path');
var seriesTestPaths = require('./lib/seriesTestPaths.js');
var cls = require(seriesTestPaths.util('seriesLiveSingleReplaceClassifier.js'));
var seriesRyderCup = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'seriesRyderCup.js'));

var classify = cls.classifySeriesLiveSingleReplace;
var KIND = cls.KIND;
var ROUTE = cls.ROUTE;

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

function player(id, pos, extra) {
  var e = extra || {};
  return Object.assign(
    {
      position: pos,
      userId: id,
      playerId: id,
      id: id,
      displayName: '球员' + id,
      scorePlayerId: e.scorePlayerId != null ? e.scorePlayerId : (id || 'A'),
      entityId: e.entityId || 'ent-' + pos,
      pairingId: e.pairingId || 'p' + Math.ceil(pos / 2),
      seriesParticipantId: e.part || (id === 'C' || id === 'C2' ? 'part-blue' : 'part-red'),
      matchTeamId: e.team || (id === 'C' || id === 'C2' ? 'blue' : 'red'),
      affiliationId: e.team || (id === 'C' || id === 'C2' ? 'blue' : 'red'),
      fromSeriesRoster: true
    },
    e
  );
}

function baseMatch(gameMode, extra) {
  var o = extra || {};
  var g1Players = o.g1Players || [player('A', 1), player('C', 2)];
  var g2Players = o.g2Players || [player('X', 1, { scorePlayerId: 'X', entityId: 'ent-x', pairingId: 'p9' })];
  var m = {
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
      g1: [{ entityId: 'ent-1', members: g1Players.map(function (p) { return p.userId; }), scoreOwnerId: 'own-1' }],
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
  return m;
}

function g5() {
  return baseMatch('个人比洞赛');
}

function g6() {
  var m = baseMatch('四人四球比洞赛', {
    g1Players: [player('A', 1), player('A2', 2), player('C', 3), player('C2', 4)]
  });
  m.scoreEntities.g1 = [
    { entityId: 'ent-red', members: ['A', 'A2'], scoreOwnerId: 'own-red' },
    { entityId: 'ent-blue', members: ['C', 'C2'], scoreOwnerId: 'own-blue' }
  ];
  return m;
}

function g7() {
  var m = g6();
  m.gameMode = '最佳球位比洞赛';
  return m;
}

function g8() {
  var m = g6();
  m.gameMode = '四人两球比洞赛';
  m.pairings = {
    g1: [
      { pairingId: 'p1', entityId: 'e1', playerIds: ['A', 'A2'] },
      { pairingId: 'p2', entityId: 'e2', playerIds: ['C', 'C2'] }
    ],
    g2: [{ pairingId: 'p9', entityId: 'ex', playerIds: ['X'] }]
  };
  m.groups[0].players[0].pairingId = 'p1';
  m.groups[0].players[0].entityId = 'e1';
  m.groups[0].players[1].pairingId = 'p1';
  m.groups[0].players[1].entityId = 'e1';
  m.groups[0].players[2].pairingId = 'p2';
  m.groups[0].players[3].pairingId = 'p2';
  m.scoreEntities.g1 = [
    { entityId: 'e1', members: ['A', 'A2'], scoreOwnerId: 'own-1' },
    { entityId: 'e2', members: ['C', 'C2'], scoreOwnerId: 'own-2' }
  ];
  return m;
}

function replaceSeat(match, groupId, position, fromId, toId, extra) {
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
        seriesParticipantId: e.seriesParticipantId != null ? e.seriesParticipantId : p.seriesParticipantId,
        matchTeamId: e.matchTeamId != null ? e.matchTeamId : p.matchTeamId,
        affiliationId: e.affiliationId != null ? e.affiliationId : p.affiliationId
      });
      if (e.tee != null) row.tee = e.tee;
      if (e.tPosition != null) row.tPosition = e.tPosition;
      if (e.scorePlayerId != null) row.scorePlayerId = e.scorePlayerId;
      if (e.nickname != null) row.nickname = e.nickname;
      return row;
    });
  });
  function rewrite(val) {
    if (val === fromId) return toId;
    return val;
  }
  if (next.pairings && next.pairings[groupId]) {
    next.pairings[groupId] = next.pairings[groupId].map(function (row) {
      var r = clone(row);
      if (Array.isArray(r.playerIds)) r.playerIds = r.playerIds.map(rewrite);
      if (Array.isArray(r.members)) r.members = r.members.map(rewrite);
      return r;
    });
  }
  if (next.scoreEntities && next.scoreEntities[groupId]) {
    next.scoreEntities[groupId] = next.scoreEntities[groupId].map(function (row) {
      var r = clone(row);
      if (Array.isArray(r.members)) r.members = r.members.map(rewrite);
      if (e.entityId != null) r.entityId = e.entityId;
      if (e.scoreOwnerId != null) r.scoreOwnerId = e.scoreOwnerId;
      return r;
    });
  }
  return next;
}

function run(before, after, editedGroupId) {
  return classify({
    beforeMatch: before,
    candidateMatch: after,
    editedGroupId: editedGroupId || 'g1'
  });
}

(function g5_single() {
  var b = g5();
  var a = replaceSeat(b, 'g1', 1, 'A', 'B');
  var out = run(b, a);
  assert(
    '1 严格单座位 G5 A→B',
    out.ok &&
      out.kind === KIND.single_replacement &&
      out.recommendedRoute === ROUTE.single_replace_journal &&
      out.replacement.outgoingUserId === 'A' &&
      out.replacement.incomingUserId === 'B'
  );
})();

(function g6_single() {
  var b = g6();
  var out = run(b, replaceSeat(b, 'g1', 1, 'A', 'B'));
  assert('2 G6', out.ok && out.kind === KIND.single_replacement);
})();

(function g7_single() {
  var b = g7();
  var out = run(b, replaceSeat(b, 'g1', 1, 'A', 'B'));
  assert('3 G7', out.ok && out.kind === KIND.single_replacement);
})();

(function g8_single() {
  var b = g8();
  var a = replaceSeat(b, 'g1', 1, 'A', 'B');
  var out = run(b, a);
  assert(
    '4 G8',
    out.ok && out.kind === KIND.single_replacement && out.replacement.incomingUserId === 'B'
  );
  assert(
    '5 成绩身份继承',
    out.ok &&
      JSON.stringify(out.replacement.beforeScoreIdentity) === JSON.stringify(out.replacement.afterScoreIdentity) &&
      out.replacement.afterScoreIdentity.scorePlayerId === 'A'
  );
})();

(function score_drift() {
  var b = g5();
  var a = replaceSeat(b, 'g1', 1, 'A', 'B', { scorePlayerId: 'B' });
  var out = run(b, a);
  assert('6 成绩身份漂移拒绝', out.ok === false && out.code === 'score_identity_drift');
})();

(function g8_pairing_members() {
  var b = g8();
  var a = replaceSeat(b, 'g1', 1, 'A', 'B');
  var out = run(b, a);
  assert(
    '7 G8 pairing 仅当前成员 A→B 允许',
    out.ok &&
      out.derivedChanges.some(function (d) {
        return d.type === 'pairing_current_identity';
      })
  );
})();

(function pairing_id() {
  var b = g8();
  var a = replaceSeat(b, 'g1', 1, 'A', 'B');
  a.pairings.g1[0].pairingId = 'p-new';
  var out = run(b, a);
  assert('8 pairing 稳定 ID 变化拒绝', out.ok === false && out.code === 'pairing_identity_drift');
})();

(function pairing_partner() {
  var b = g8();
  var a = replaceSeat(b, 'g1', 1, 'A', 'B');
  a.pairings.g1[0].playerIds = ['B', 'C'];
  var out = run(b, a);
  assert('9 pairing 搭档变化拒绝', out.ok === false && out.code === 'pairing_structure_drift');
})();

(function pairing_only() {
  var b = g8();
  var a = clone(b);
  a.pairings.g1[0].playerIds = ['A2', 'A'];
  var out = run(b, a);
  assert('10 pairing-only 拒绝', out.ok === false && out.code === 'pairing_only_change' && out.recommendedRoute === ROUTE.reject_unsupported);
})();

(function entity_members() {
  var b = g5();
  var a = replaceSeat(b, 'g1', 1, 'A', 'B');
  var out = run(b, a);
  assert(
    '11 entity 当前成员派生允许',
    out.ok &&
      out.derivedChanges.some(function (d) {
        return d.type === 'entity_current_identity';
      })
  );
})();

(function entity_id() {
  var b = g5();
  var a = replaceSeat(b, 'g1', 1, 'A', 'B', { entityId: 'ent-new' });
  a.groups[0].players[0].entityId = b.groups[0].players[0].entityId;
  a.scoreEntities.g1[0].entityId = 'ent-new';
  var out = run(b, a);
  assert('12 entity 稳定 ID 变化拒绝', out.ok === false && out.code === 'entity_structure_drift');
})();

(function owner() {
  var b = g5();
  var a = replaceSeat(b, 'g1', 1, 'A', 'B');
  a.scoreEntities.g1[0].scoreOwnerId = 'own-other';
  var out = run(b, a);
  assert('13 score owner 变化拒绝', out.ok === false && out.code === 'score_owner_drift');
})();

(function two_rep() {
  var b = g5();
  var a = replaceSeat(b, 'g1', 1, 'A', 'B');
  a = replaceSeat(a, 'g1', 2, 'C', 'D');
  var out = run(b, a);
  assert('14 两处 replacement 拒绝', out.ok === false && out.code === 'multiple_replacements');
})();

(function swap_same() {
  var b = g5();
  var a = clone(b);
  a.groups[0].players[0].userId = 'C';
  a.groups[0].players[0].playerId = 'C';
  a.groups[0].players[0].id = 'C';
  a.groups[0].players[1].userId = 'A';
  a.groups[0].players[1].playerId = 'A';
  a.groups[0].players[1].id = 'A';
  var out = run(b, a);
  assert('15 同组 swap', out.ok === false && out.code === 'seat_swap' && out.kind === KIND.seat_swap);
})();

(function swap_cross() {
  var b = g5();
  var a = clone(b);
  a.groups[0].players[0].userId = 'X';
  a.groups[0].players[0].playerId = 'X';
  a.groups[0].players[0].id = 'X';
  a.groups[1].players[0].userId = 'A';
  a.groups[1].players[0].playerId = 'A';
  a.groups[1].players[0].id = 'A';
  var out = run(b, a);
  assert('16 跨组 swap', out.ok === false && out.code === 'seat_swap');
})();

(function move_same() {
  var b = g5();
  b.groups[0].players[1].userId = '';
  b.groups[0].players[1].playerId = '';
  b.groups[0].players[1].id = '';
  var a = clone(b);
  a.groups[0].players[0].userId = '';
  a.groups[0].players[0].playerId = '';
  a.groups[0].players[0].id = '';
  a.groups[0].players[1].userId = 'A';
  a.groups[0].players[1].playerId = 'A';
  a.groups[0].players[1].id = 'A';
  var out = run(b, a);
  assert('17 同组 move', out.ok === false && out.code === 'player_move');
})();

(function move_cross() {
  var b = g5();
  b.groups[1].players[0].userId = '';
  b.groups[1].players[0].playerId = '';
  b.groups[1].players[0].id = '';
  var a = clone(b);
  a.groups[0].players[0].userId = '';
  a.groups[0].players[0].playerId = '';
  a.groups[0].players[0].id = '';
  a.groups[1].players[0].userId = 'A';
  a.groups[1].players[0].playerId = 'A';
  a.groups[1].players[0].id = 'A';
  var out = run(b, a);
  assert('18 跨组 move', out.ok === false && out.code === 'player_move');
})();

(function addition() {
  var b = g5();
  b.groups[0].players[1].userId = '';
  b.groups[0].players[1].playerId = '';
  b.groups[0].players[1].id = '';
  var a = clone(b);
  a.groups[0].players[1].userId = 'D';
  a.groups[0].players[1].playerId = 'D';
  a.groups[0].players[1].id = 'D';
  var out = run(b, a);
  assert('19 addition', out.ok === false && out.code === 'player_addition');
})();

(function removal() {
  var b = g5();
  var a = clone(b);
  a.groups[0].players[1].userId = '';
  a.groups[0].players[1].playerId = '';
  a.groups[0].players[1].id = '';
  var out = run(b, a);
  assert('20 removal', out.ok === false && out.code === 'player_removal');
})();

(function rep_and_removal() {
  var b = g6();
  var a = replaceSeat(b, 'g1', 1, 'A', 'B');
  a.groups[0].players[3].userId = '';
  a.groups[0].players[3].playerId = '';
  a.groups[0].players[3].id = '';
  var out = run(b, a);
  assert('21 replacement + removal', out.ok === false && (out.code === 'player_removal' || out.code === 'player_addition'));
})();

(function b_elsewhere() {
  var b = g5();
  var a = replaceSeat(b, 'g1', 1, 'A', 'C');
  var out = run(b, a);
  assert('22 B 已在其它座位', out.ok === false && out.code === 'incoming_already_in_round');
})();

(function no_change() {
  var b = g5();
  var out = run(b, clone(b));
  assert(
    '23 no_change',
    out.ok === false && out.kind === KIND.no_change && out.code === 'no_live_group_change' && out.recommendedRoute === ROUTE.reject_unsupported
  );
})();

(function meta_only() {
  var b = g5();
  var a = clone(b);
  a.groups[0].players[0].tee = '红T';
  var out = run(b, a);
  assert('24 metadata-only', out.ok === false && out.code === 'metadata_change');
})();

(function rep_tee() {
  var b = g5();
  var a = replaceSeat(b, 'g1', 1, 'A', 'B', { tee: '蓝T' });
  var out = run(b, a);
  assert('25 replacement + tee变化', out.ok === false && out.code === 'metadata_change');
})();

(function rep_nickname() {
  var b = g5();
  var a = replaceSeat(b, 'g1', 1, 'A', 'B', { nickname: '别名' });
  var out = run(b, a);
  assert('26 replacement + 非派生展示变化', out.ok === false && out.code === 'metadata_change');
})();

(function other_group() {
  var b = g5();
  var a = replaceSeat(b, 'g1', 1, 'A', 'B');
  a.groups[1].groupName = '被改了';
  var out = run(b, a);
  assert('27 其它 group 变化', out.ok === false && out.code === 'cross_group_payload_drift');
})();

(function dup_group() {
  var b = g5();
  b.groups.push({ groupId: 'g1', players: [player('Z', 1)] });
  var out = run(b, clone(b));
  assert('28 重复 groupId', out.ok === false && out.code === 'ambiguous_group' && out.kind === KIND.ambiguous);
})();

(function dup_pos() {
  var b = g5();
  b.groups[0].players[1].position = 1;
  var out = run(b, clone(b));
  assert('29 重复 position', out.ok === false && out.code === 'ambiguous_position');
})();

(function miss_group() {
  var b = g5();
  delete b.groups[0].groupId;
  var out = run(b, clone(b), 'g1');
  assert('30 缺 groupId', out.ok === false && out.code === 'ambiguous_group');
})();

(function miss_pos() {
  var b = g5();
  delete b.groups[0].players[0].position;
  var out = run(b, clone(b));
  assert('31 缺 position', out.ok === false && out.code === 'ambiguous_position');
})();

(function frozen() {
  var b = g5();
  var a = replaceSeat(b, 'g1', 1, 'A', 'B');
  var b0 = clone(b);
  var a0 = clone(a);
  classify({ beforeMatch: b, candidateMatch: a, editedGroupId: 'g1' });
  assert('32 输入不变', JSON.stringify(b) === JSON.stringify(b0) && JSON.stringify(a) === JSON.stringify(a0));
})();

(function ryder() {
  var b = g5();
  b.seriesCompetitionType = 'ryder_cup';
  var ordinary = g5();
  var o1 = run(ordinary, replaceSeat(ordinary, 'g1', 1, 'A', 'B'));
  var o2 = run(b, replaceSeat(b, 'g1', 1, 'A', 'B'));
  assert(
    '33 普通 Series/莱德杯相同',
    seriesRyderCup.isRyderCupSeries({ seriesCompetitionType: 'ryder_cup' }) &&
      o1.ok &&
      o2.ok &&
      o1.kind === o2.kind &&
      o1.replacement.incomingUserId === o2.replacement.incomingUserId
  );
})();

(function isolation() {
  var editor = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'pages', 'group-editor', 'index.js'),
    'utf8'
  );
  var draft = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'utils', 'tournamentGroupDraft.js'),
    'utf8'
  );
  var clsSrc = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'utils', 'seriesLiveSingleReplaceClassifier.js'),
    'utf8'
  );
  assert(
    '34 普通单场生产路径未引用本模块',
    editor.indexOf('seriesLiveSingleReplaceClassifier') < 0 &&
      draft.indexOf('seriesLiveSingleReplaceClassifier') < 0 &&
      clsSrc.indexOf('saveMatch') < 0 &&
      clsSrc.indexOf('upsertSeries') < 0 &&
      clsSrc.indexOf('executeSeriesLive') < 0
  );
})();

if (failed.length) {
  console.error('FAIL ' + failed.length + ' / ' + (passed + failed.length));
  failed.forEach(function (n) {
    console.error(' - ' + n);
  });
  process.exit(1);
}
console.log('ok ' + passed + ' assertions seriesLiveSingleReplaceClassifier.selftest');
