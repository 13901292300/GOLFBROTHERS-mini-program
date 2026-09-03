/**
 * 参赛主体投影：组合昵称不暴露 Team/partyId。
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

function people(map) {
  return function (id) {
    return map[id] || { playerId: id, displayName: id, avatar: 'av/' + id };
  };
}

var present = people({
  A: { playerId: 'A', displayName: '爱丽丝', avatar: 'av/A' },
  B: { playerId: 'B', displayName: '鲍勃', avatar: 'av/B' },
  C: { playerId: 'C', displayName: '陈', avatar: 'av/C' },
  D: { playerId: 'D', displayName: '丁', avatar: 'av/D' }
});

var s22a = subject.buildParticipantSubject(
  { partyId: 'team-1', playerIds: ['A', 'B'], displayName: 'Team 1' },
  { presentPlayer: present, selected: true, required: true }
);
assert('2+2 主体类型 combo', s22a.subjectType === 'combo');
assert('2+2 subjectId=partyId', s22a.subjectId === 'team-1');
assert('2+2 不显示 Team 1', s22a.displayName !== 'Team 1' && s22a.displayName.indexOf('Team') < 0);
assert('2+2 昵称为成员简称', s22a.displayName === '爱丽丝/鲍勃');
assert('2+2 组合头像成员数', s22a.members.length === 2);
assert('2+2 required', s22a.required === true && s22a.selected === true);

var s22b = subject.buildParticipantSubject(
  { partyId: 'party-2', playerIds: ['C', 'D'], displayName: '组合2' },
  { presentPlayer: present }
);
assert('不显示 组合2', s22b.displayName.indexOf('组合') < 0);
assert('不显示 party-2', s22b.displayName.indexOf('party') < 0);
assert('成员简称 C/D', s22b.displayName === '陈/丁');

var s31 = subject.buildParticipantSubject(
  { partyId: 'p3', playerIds: ['A', 'B', 'C'], name: '队伍 1' },
  { presentPlayer: present }
);
assert('3人 combo', s31.subjectType === 'combo' && s31.faceKind === 'stack');
assert('3人昵称不含队伍', s31.displayName.indexOf('队伍') < 0);
assert('3人成员简称', s31.displayName === '爱丽丝/鲍勃/陈');

var s1 = subject.buildParticipantSubject(
  { partyId: 'D', playerIds: ['D'] },
  { presentPlayer: present }
);
assert('单人 person', s1.subjectType === 'person' && s1.faceKind === 'single');
assert('单人昵称', s1.displayName === '丁');
assert('单人结算仍用 partyId', s1.subjectId === 'D');

var named = subject.buildParticipantSubject(
  { partyId: 'x', playerIds: ['A', 'B'], displayName: '双人组' },
  { presentPlayer: present }
);
assert('保留合法组合名', named.displayName === '双人组');

assert('内部标签过滤', subject.isInternalPartyLabel('Team 2') && subject.isInternalPartyLabel('party-1'));

var userCombo1 = subject.buildParticipantSubject(
  { partyId: 'u1', playerIds: ['A', 'B'], displayName: '组合1' },
  {
    presentPlayer: people({
      A: { playerId: 'A', displayName: '', avatar: '' },
      B: { playerId: 'B', displayName: '', avatar: '' }
    })
  }
);
assert('用户名组合1在无成员简称时可显示', userCombo1.displayName === '组合1');

console.log('\nparticipantSubject.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
