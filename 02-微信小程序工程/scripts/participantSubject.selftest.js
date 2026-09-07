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
assert(
  '组合N / Team N 均为内部标签',
  subject.isInternalPartyLabel('组合1') &&
    subject.isInternalPartyLabel('组合 1') &&
    subject.isInternalPartyLabel('Team 1')
);

var namedZh = people({
  A: { playerId: 'A', displayName: '张三', avatar: '' },
  B: { playerId: 'B', displayName: '李四', avatar: '' }
});
var emptyNames = people({
  A: { playerId: 'A', displayName: '', avatar: '' },
  B: { playerId: 'B', displayName: '', avatar: '' }
});
var triangle = people({
  A: { playerId: 'A', displayName: '张三', avatar: '' },
  B: { playerId: 'B', displayName: '李四', avatar: '' },
  C: { playerId: 'C', displayName: '王五', avatar: '' }
});
var internalMembers = people({
  A: { playerId: 'A', displayName: '组合1', avatar: '' },
  B: { playerId: 'B', displayName: '球员', avatar: '' }
});
var mixedMembers = people({
  A: { playerId: 'A', displayName: '张三', avatar: '' },
  B: { playerId: 'B', displayName: '组合1', avatar: '' }
});

var combo1Join = subject.buildParticipantSubject(
  { partyId: 'u-join-1', playerIds: ['A', 'B'], displayName: '组合1' },
  { presentPlayer: namedZh }
);
assert('组合1 + 成员名为张三/李四', combo1Join.displayName === '张三/李四');
assert('组合1 + 成员时身份键不变', combo1Join.subjectId === 'u-join-1' && combo1Join.partyId === 'u-join-1');

var combo1Spaced = subject.buildParticipantSubject(
  { partyId: 'u-join-space', playerIds: ['A', 'B'], displayName: '组合 1' },
  { presentPlayer: namedZh }
);
assert('组合 1 + 成员名为张三/李四', combo1Spaced.displayName === '张三/李四');
assert(
  '组合 1 + 成员时身份键不变',
  combo1Spaced.subjectId === 'u-join-space' && combo1Spaced.partyId === 'u-join-space'
);

var combo1Empty = subject.buildParticipantSubject(
  { partyId: 'u1', playerIds: ['A', 'B'], displayName: '组合1' },
  { presentPlayer: emptyNames }
);
assert('组合1 + 空成员名为统一占位组合', combo1Empty.displayName === '组合');
assert('组合1 + 空成员时身份键不变', combo1Empty.subjectId === 'u1' && combo1Empty.partyId === 'u1');

assert('Team 1 + 成员名为斜杠拼接', s22a.displayName === '爱丽丝/鲍勃');

var customEmpty = subject.buildParticipantSubject(
  { partyId: 'u-custom-empty', playerIds: ['A', 'B'], displayName: '双人组' },
  { presentPlayer: emptyNames }
);
assert('双人组 + 空成员名仍保留', customEmpty.displayName === '双人组');
assert(
  '双人组空成员身份键不变',
  customEmpty.subjectId === 'u-custom-empty' && customEmpty.partyId === 'u-custom-empty'
);

var iron = subject.buildParticipantSubject(
  { partyId: 'u-iron', playerIds: ['A', 'B', 'C'], displayName: '铁三角' },
  { presentPlayer: triangle }
);
assert('铁三角 + 有成员名仍保留', iron.displayName === '铁三角');
assert('铁三角身份键不变', iron.subjectId === 'u-iron' && iron.partyId === 'u-iron');

var internalJoin = subject.buildParticipantSubject(
  { partyId: 'u-internal-mem', playerIds: ['A', 'B'], displayName: '组合1' },
  { presentPlayer: internalMembers }
);
assert(
  '成员自身内部标签不混入拼接',
  internalJoin.displayName === '组合' &&
    internalJoin.displayName.indexOf('组合1') < 0 &&
    internalJoin.displayName.indexOf('球员') < 0
);
assert(
  '内部成员名时身份键不变',
  internalJoin.subjectId === 'u-internal-mem' && internalJoin.partyId === 'u-internal-mem'
);

var mixedJoin = subject.buildParticipantSubject(
  { partyId: 'u-mixed-mem', playerIds: ['A', 'B'], displayName: '组合2' },
  { presentPlayer: mixedMembers }
);
assert('仅真实成员名进入拼接', mixedJoin.displayName === '张三');
assert(
  '混合成员身份键不变',
  mixedJoin.subjectId === 'u-mixed-mem' && mixedJoin.partyId === 'u-mixed-mem'
);

console.log('\nparticipantSubject.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
