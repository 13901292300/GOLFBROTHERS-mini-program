/**
 * REG-P3-A：removePlayerFromMatchCompetitionStructure 纯函数
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/regP3A.selftest.js
 */

var path = require('path');
var fs = require('fs');

if (typeof global.wx === 'undefined') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    removeStorageSync: function () {}
  };
}

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var srcPath = path.join(utilsDir, 'removePlayerFromMatchCompetitionStructure.js');
var storePath = path.join(utilsDir, 'teamMatchStore.js');

var fnMod = require(srcPath);
var teamMatchStore = require(storePath);
var removePlayerFromMatchCompetitionStructure = fnMod.removePlayerFromMatchCompetitionStructure;

var src = fs.readFileSync(srcPath, 'utf8');
var storeSrc = fs.readFileSync(storePath, 'utf8');

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

function freeze(o) {
  return JSON.parse(JSON.stringify(o));
}

function stable(o) {
  return JSON.stringify(o);
}

function slotId(p) {
  if (p == null) return '';
  if (typeof p === 'string' || typeof p === 'number') return String(p).trim();
  return String((p && (p.userId || p.playerId || p.id)) || '').trim();
}

function occupiedIds(list) {
  return (Array.isArray(list) ? list : []).map(slotId).filter(Boolean);
}

function entityMembers(ids) {
  return (ids || []).map(function (id) {
    return { userId: id };
  });
}

function emptySlots(occupied) {
  var players = [];
  var i;
  for (i = 1; i <= 4; i++) {
    players.push({
      position: i,
      userId: occupied[i - 1] || '',
      playerId: occupied[i - 1] || ''
    });
  }
  return players;
}

function baseMatch(patch) {
  return Object.assign(
    {
      matchId: 'm-p3a',
      gameMode: '个人比杆赛',
      groups: [],
      playersSlots: undefined,
      pairings: {},
      scoreEntities: {},
      scoreData: {},
      registerInfo: { users: [{ userId: 'u1' }, { userId: 'u2' }] }
    },
    patch || {}
  );
}

function fixtureG1Single() {
  var players = emptySlots(['u1']);
  return baseMatch({
    matchId: 'm-g1-single',
    gameMode: '个人比杆赛',
    groups: [
      {
        groupId: 'g1',
        groupName: '第1组',
        players: players,
        playersSlots: freeze(players)
      }
    ],
    scoreData: { g1: { scoresByPlayer: {} } }
  });
}

function fixtureG1MultiRoundNoise() {
  var match = fixtureG1Single();
  match.seriesId = 'series-noise';
  match.rounds = [
    {
      roundId: 'r2',
      matchId: 'm-other',
      groups: [{ groupId: 'g9', players: emptySlots(['u1', 'u9']) }],
      scoreData: {
        g9: { scoresByPlayer: { u1: { scores: [4, 5, 4] } } }
      }
    }
  ];
  match.foreignRoundMatch = {
    matchId: 'm-foreign',
    groups: [{ groupId: 'gx', players: emptySlots(['u1']) }],
    scoreEntities: { gx: [{ entityId: 'e-x', members: ['u1'] }] },
    scoreData: { gx: { scoresByPlayer: { u1: { scores: [3] } } } }
  };
  return match;
}

function fixtureG2() {
  var players = emptySlots(['u1', 'u2', 'u3', 'u4']);
  return baseMatch({
    matchId: 'm-g2',
    gameMode: '四人四球比杆赛',
    groups: [
      {
        groupId: 'g1',
        groupName: '第1组',
        players: players,
        playersSlots: freeze(players)
      }
    ],
    scoreEntities: {
      g1: [
        {
          entityId: 'e-red',
          entityType: 'team',
          compositionMode: '2+2',
          teamGroupId: 'red',
          members: entityMembers(['u1', 'u2'])
        },
        {
          entityId: 'e-blue',
          entityType: 'team',
          compositionMode: '2+2',
          teamGroupId: 'blue',
          members: entityMembers(['u3', 'u4'])
        }
      ]
    },
    scoreData: {
      g1: {
        teamScoresByEntity: [
          { teamId: 'e-red', scores: [] },
          { teamId: 'e-blue', scores: [] }
        ]
      }
    }
  });
}

function fixtureG3() {
  var m = fixtureG2();
  m.matchId = 'm-g3';
  m.gameMode = '最佳球位比杆赛';
  m.scoreEntities.g1[0].compositionMode = '4+0';
  m.scoreEntities.g1[1].compositionMode = '4+0';
  return m;
}

function fixtureG4() {
  var players = emptySlots(['u1', 'u2', 'u3', 'u4']);
  return baseMatch({
    matchId: 'm-g4',
    gameMode: '四人两球比杆赛',
    groups: [
      {
        groupId: 'g1',
        groupName: '第1组',
        players: players,
        playersSlots: freeze(players)
      }
    ],
    pairings: {
      g1: [
        { id: 'pair-1', playerIds: ['u1', 'u2'] },
        { id: 'pair-2', playerIds: ['u3', 'u4'] }
      ]
    },
    pairingMap: {
      g1: [
        { id: 'pair-1', playerIds: ['u1', 'u2'] },
        { id: 'pair-2', playerIds: ['u3', 'u4'] }
      ]
    },
    scoreEntities: {
      g1: [
        {
          entityId: 'pair-1',
          entityType: 'pair',
          members: entityMembers(['u1', 'u2'])
        },
        {
          entityId: 'pair-2',
          entityType: 'pair',
          members: entityMembers(['u3', 'u4'])
        }
      ]
    },
    scoreData: {
      g1: {
        teamScoresByEntity: [
          { teamId: 'pair-1', scores: [] },
          { teamId: 'pair-2', scores: [] }
        ]
      }
    }
  });
}

function fixtureEmptyGroupLastSeat() {
  var players = emptySlots(['u1']);
  return baseMatch({
    matchId: 'm-empty-group',
    groups: [
      {
        groupId: 'g1',
        groupName: '第1组',
        teeTime: '08:00',
        players: players,
        playersSlots: freeze(players)
      }
    ],
    pairings: {
      g1: [{ id: 'pair-keep', playerIds: ['u1'] }]
    }
  });
}

function ordinaryCleanup(match, uid) {
  var copy = freeze(match);
  teamMatchStore.clearUserFromFormalGroups(copy, uid);
  teamMatchStore.clearUserFromPairings(copy, uid);
  return copy;
}

function apply(match, uid) {
  return removePlayerFromMatchCompetitionStructure(match, uid);
}

// ---- source / signature freeze ----
assert(
  '复用普通 clearUserFromFormalGroups / clearUserFromPairings',
  src.indexOf('clearUserFromFormalGroups') >= 0 && src.indexOf('clearUserFromPairings') >= 0
);
assert(
  '不写 Series / storage / 落盘 / journal',
  src.indexOf('saveMatch(') < 0 &&
    src.indexOf('seriesRegistration') < 0 &&
    src.indexOf('getSeries') < 0 &&
    src.indexOf('setStorageSync') < 0 &&
    src.indexOf('journal') < 0
);
assert(
  '普通 store 仍导出同名清组/清 pairing',
  typeof teamMatchStore.clearUserFromFormalGroups === 'function' &&
    typeof teamMatchStore.clearUserFromPairings === 'function' &&
    storeSrc.indexOf('function clearUserFromFormalGroups') >= 0 &&
    storeSrc.indexOf('function clearUserFromPairings') >= 0
);

var sigMatch = fixtureEmptyGroupLastSeat();
var sigRef = teamMatchStore.clearUserFromFormalGroups(sigMatch, 'u1');
assert('普通 clearUserFromFormalGroups 仍就地改并返回同一引用', sigRef === sigMatch);
assert(
  '普通清组保留空组与席位长度',
  sigMatch.groups.length === 1 &&
    sigMatch.groups[0].players.length === 4 &&
    occupiedIds(sigMatch.groups[0].players).length === 0 &&
    sigMatch.groups[0].teeTime === '08:00'
);
var sigPair = teamMatchStore.clearUserFromPairings(sigMatch, 'u1');
assert('普通 clearUserFromPairings 仍就地改并返回同一引用', sigPair === sigMatch);
assert(
  '普通清 pairing 保留空成员行',
  sigMatch.pairings.g1 &&
    sigMatch.pairings.g1.length === 1 &&
    sigMatch.pairings.g1[0].id === 'pair-keep' &&
    sigMatch.pairings.g1[0].playerIds.length === 0
);

// 1. G1 单席位
var g1 = fixtureG1Single();
var g1Frozen = stable(g1);
var g1Res = apply(g1, 'u1');
assert('1 G1 单席位 changed', g1Res.changed === true && g1Res.blockedReason === '');
assert(
  '1 G1 单席位清空目标且保留 4 席',
  g1Res.match.groups[0].players.length === 4 &&
    occupiedIds(g1Res.match.groups[0].players).length === 0 &&
    occupiedIds(g1Res.match.groups[0].playersSlots).length === 0
);
assert('1 G1 单席位输入未被改', stable(g1) === g1Frozen);

// 2. G1 多轮无关数据不在本函数范围
var g1Noise = fixtureG1MultiRoundNoise();
var noiseFrozenRounds = stable(g1Noise.rounds);
var noiseFrozenForeign = stable(g1Noise.foreignRoundMatch);
var g1NoiseRes = apply(g1Noise, 'u1');
assert('2 多轮噪声不阻断（成绩在别轮）', g1NoiseRes.changed === true && g1NoiseRes.blockedReason === '');
assert('2 不扫描 / 不改 rounds', stable(g1NoiseRes.match.rounds) === noiseFrozenRounds);
assert(
  '2 不扫描 / 不改 foreignRoundMatch',
  stable(g1NoiseRes.match.foreignRoundMatch) === noiseFrozenForeign
);
assert('2 本场席位已清', occupiedIds(g1NoiseRes.match.groups[0].players).length === 0);

// 3. G2 四球 entity
var g2 = fixtureG2();
var g2Res = apply(g2, 'u1');
assert('3 G2 changed', g2Res.changed === true && g2Res.blockedReason === '');
assert(
  '3 G2 目标离开 groups',
  occupiedIds(g2Res.match.groups[0].players).join(',') === 'u2,u3,u4'
);
assert(
  '3 G2 entity 只移出目标、保留 entityId',
  g2Res.match.scoreEntities.g1.length === 2 &&
    g2Res.match.scoreEntities.g1[0].entityId === 'e-red' &&
    g2Res.match.scoreEntities.g1[0].members.map(slotId).join(',') === 'u2' &&
    g2Res.match.scoreEntities.g1[1].members.map(slotId).join(',') === 'u3,u4'
);
assert(
  '3 G2 不删成绩桶',
  Array.isArray(g2Res.match.scoreData.g1.teamScoresByEntity) &&
    g2Res.match.scoreData.g1.teamScoresByEntity.length === 2
);

// 4. G3 最佳球位 entity
var g3 = fixtureG3();
var g3Res = apply(g3, 'u3');
assert('4 G3 changed', g3Res.changed === true && g3Res.blockedReason === '');
assert(
  '4 G3 entity 只移出目标',
  g3Res.match.scoreEntities.g1[0].members.map(slotId).join(',') === 'u1,u2' &&
    g3Res.match.scoreEntities.g1[1].entityId === 'e-blue' &&
    g3Res.match.scoreEntities.g1[1].members.map(slotId).join(',') === 'u4'
);

// 5. G4 pair
var g4 = fixtureG4();
var g4Res = apply(g4, 'u1');
assert('5 G4 changed', g4Res.changed === true && g4Res.blockedReason === '');
assert(
  '5 G4 pairing 保留行并移出目标',
  g4Res.match.pairings.g1.length === 2 &&
    g4Res.match.pairings.g1[0].id === 'pair-1' &&
    g4Res.match.pairings.g1[0].playerIds.join(',') === 'u2' &&
    g4Res.match.pairings.g1[1].playerIds.join(',') === 'u3,u4'
);
assert(
  '5 G4 pairingMap 同步',
  g4Res.match.pairingMap.g1[0].playerIds.join(',') === 'u2'
);
assert(
  '5 G4 pair entity 移出目标且保留 entityId',
  g4Res.match.scoreEntities.g1[0].entityId === 'pair-1' &&
    g4Res.match.scoreEntities.g1[0].members.map(slotId).join(',') === 'u2' &&
    g4Res.match.scoreEntities.g1[1].members.map(slotId).join(',') === 'u3,u4'
);

// 6. 空组处理与普通一致
var emptyIn = fixtureEmptyGroupLastSeat();
var ordinary = ordinaryCleanup(emptyIn, 'u1');
var emptyRes = apply(emptyIn, 'u1');
assert('6 空组仍保留', emptyRes.match.groups.length === 1 && ordinary.groups.length === 1);
assert(
  '6 players 与普通清组一致',
  stable(emptyRes.match.groups[0].players) === stable(ordinary.groups[0].players)
);
assert('6 pairings 与普通清 pairing 一致', stable(emptyRes.match.pairings) === stable(ordinary.pairings));
assert(
  '6 不删组、不压缩席位',
  emptyRes.match.groups[0].players.length === 4 &&
    emptyRes.match.groups[0].groupName === '第1组' &&
    emptyRes.match.groups[0].teeTime === '08:00'
);

// 7. 其他球员不变
var others = fixtureG2();
var othersRes = apply(others, 'u1');
assert(
  '7 其他球员 groups 不变',
  occupiedIds(othersRes.match.groups[0].players).join(',') === 'u2,u3,u4'
);
assert(
  '7 其他球员 entity 不变',
  othersRes.match.scoreEntities.g1[1].members.map(slotId).join(',') === 'u3,u4' &&
    othersRes.match.scoreEntities.g1[0].members.map(slotId).join(',') === 'u2'
);
assert(
  '7 registerInfo 不动',
  stable(othersRes.match.registerInfo) === stable(others.registerInfo)
);

// 8. 无目标时幂等
var miss = fixtureG1Single();
var missFrozen = stable(miss);
var missRes = apply(miss, 'u-missing');
assert('8 无目标 changed=false', missRes.changed === false && missRes.blockedReason === '');
assert('8 无目标深比较不变', stable(missRes.match) === missFrozen);
assert('8 无目标输入不变', stable(miss) === missFrozen);
assert('8 无目标返回原引用', missRes.match === miss);

// 9. 有真实成绩 blocked 且深比较 match 不变
var scored = fixtureG1Single();
scored.scoreData = {
  g1: { scoresByPlayer: { u1: { scores: [4, null, 5] } } }
};
var scoredFrozen = stable(scored);
var scoredRes = apply(scored, 'u1');
assert(
  '9 个人真实成绩 blocked',
  scoredRes.changed === false && scoredRes.blockedReason === 'player_has_real_score'
);
assert('9 blocked 深比较 match 不变', stable(scoredRes.match) === scoredFrozen);
assert('9 blocked 输入不变', stable(scored) === scoredFrozen);
assert('9 blocked 不删成绩', scoredRes.match.scoreData.g1.scoresByPlayer.u1.scores[0] === 4);

var scoredG2 = fixtureG2();
scoredG2.scoreData.g1.teamScoresByEntity[0].scores = [4, 5, 4];
var scoredG2Frozen = stable(scoredG2);
var scoredG2Res = apply(scoredG2, 'u1');
assert(
  '9 entity 真实成绩 blocked',
  scoredG2Res.changed === false && scoredG2Res.blockedReason === 'player_has_real_score'
);
assert('9 entity blocked 深比较不变', stable(scoredG2Res.match) === scoredG2Frozen);

// 10. 原 match 输入对象不被原地修改
var mut = fixtureG4();
var mutFrozen = stable(mut);
var mutGroupsRef = mut.groups;
var mutPlayersRef = mut.groups[0].players;
var mutPairRef = mut.pairings;
var mutEntRef = mut.scoreEntities;
var mutRes = apply(mut, 'u1');
assert('10 成功路径返回新对象', mutRes.changed === true && mutRes.match !== mut);
assert('10 输入 JSON 不变', stable(mut) === mutFrozen);
assert(
  '10 输入引用未被换掉',
  mut.groups === mutGroupsRef &&
    mut.groups[0].players === mutPlayersRef &&
    mut.pairings === mutPairRef &&
    mut.scoreEntities === mutEntRef
);
assert('10 输入席位仍在', occupiedIds(mut.groups[0].players).join(',') === 'u1,u2,u3,u4');
assert('10 输入 pairing 仍在', mut.pairings.g1[0].playerIds.join(',') === 'u1,u2');
assert('10 输入 entity 仍在', mut.scoreEntities.g1[0].members.map(slotId).join(',') === 'u1,u2');

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failures.length) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
