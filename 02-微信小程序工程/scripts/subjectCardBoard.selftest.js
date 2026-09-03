/**
 * 游戏卡片 / 结果表头主体展示：同一投影，不拆独立组合 UI。
 * parties/matchups 身份不变；仅校验展示字段。
 */
var subject = require('../miniprogram/subpackages/game/utils/participantSubject.js');

var passed = 0;
var failed = 0;
function assert(name, cond) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name);
  }
}

function presentPlayer(id) {
  var map = {
    A: { playerId: 'A', displayName: 'A君', avatar: 'a' },
    B: { playerId: 'B', displayName: 'B君', avatar: 'b' },
    C: { playerId: 'C', displayName: 'C君', avatar: 'c' },
    D: { playerId: 'D', displayName: 'D君', avatar: 'd' }
  };
  return map[id] || { playerId: id, displayName: id, avatar: '' };
}

function projectGamePlayers(game) {
  var hints = {};
  (game.parties || []).forEach(function (p) {
    hints[p.partyId] = p;
  });
  return (game.players || []).map(function (pl) {
    var hint = hints[pl.id] || {
      partyId: pl.id,
      playerIds: pl.memberPlayerIds || [pl.id],
      displayName: pl.name
    };
    return subject.buildParticipantSubject(hint, { presentPlayer: presentPlayer });
  });
}

// 2+2：两列组合主体，非四人个人列
var g22 = {
  parties: [
    { partyId: 'entity-A', playerIds: ['A', 'B'], displayName: 'Team 1' },
    { partyId: 'entity-B', playerIds: ['C', 'D'], displayName: 'Team 2' }
  ],
  matchups: [{ leftPartyId: 'entity-A', rightPartyId: 'entity-B' }],
  players: [{ id: 'entity-A' }, { id: 'entity-B' }]
};
var p22 = projectGamePlayers(g22);
assert('2+2 仅两列主体', p22.length === 2);
assert('2+2 均为 combo', p22.every(function (s) { return s.subjectType === 'combo'; }));
assert('2+2 subjectId=partyId', p22[0].subjectId === 'entity-A' && p22[1].subjectId === 'entity-B');
assert('2+2 无 Team', p22.every(function (s) { return s.displayName.indexOf('Team') < 0; }));
assert('2+2 无 partyId 泄漏', p22.every(function (s) { return s.displayName.indexOf('entity') < 0; }));
assert('2+2 parties 未改', g22.parties.length === 2 && g22.matchups.length === 1);
assert('2+2 成员折叠用 2 人头像', p22[0].members.length === 2 && p22[1].members.length === 2);

// 3+1
var g31 = {
  parties: [
    { partyId: 'combo-3', playerIds: ['A', 'B', 'C'], displayName: '铁三角' },
    { partyId: 'D', playerIds: ['D'], displayName: 'D君' }
  ],
  players: [{ id: 'combo-3' }, { id: 'D' }]
};
var p31 = projectGamePlayers(g31);
assert('3+1 两列', p31.length === 2);
assert('3+1 组合+个人', p31[0].subjectType === 'combo' && p31[1].subjectType === 'person');
assert('3+1 真实昵称', p31[0].displayName === '铁三角' && p31[1].displayName === 'D君');
assert('3+1 stack', p31[0].faceKind === 'stack');

// 2+1+1
var g211 = {
  parties: [
    { partyId: 'pair', playerIds: ['A', 'B'], displayName: 'AB组' },
    { partyId: 'C', playerIds: ['C'] },
    { partyId: 'D', playerIds: ['D'] }
  ],
  players: [{ id: 'pair' }, { id: 'C' }, { id: 'D' }]
};
var p211 = projectGamePlayers(g211);
assert('2+1+1 三列', p211.length === 3);
assert('2+1+1 类型', p211[0].subjectType === 'combo' && p211[1].subjectType === 'person' && p211[2].subjectType === 'person');
assert('2+1+1 昵称', p211[0].displayName === 'AB组');

console.log('\nsubjectCardBoard.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
