/**
 * 组合昵称唯一入口 + / 连接规范。
 */
var combo = require('../miniprogram/utils/comboDisplayName.js');
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

function present(map) {
  return function (id) {
    return map[id] || { playerId: id, displayName: '', avatar: '' };
  };
}

var people = present({
  A: { playerId: 'A', displayName: '张三', avatar: 'a' },
  B: { playerId: 'B', displayName: '李四', avatar: 'b' },
  C: { playerId: 'C', displayName: '王五', avatar: 'c' },
  D: { playerId: 'D', displayName: '赵六', avatar: 'd' }
});

assert('sep 为 /', combo.COMBO_MEMBER_SEP === '/');
assert(
  '双人拼接',
  combo.joinMemberDisplayNames(['张三', '李四']) === '张三/李四'
);
assert(
  '三人拼接',
  combo.joinMemberDisplayNames(['张三', '李四', '王五']) === '张三/李四/王五'
);
assert(
  '历史 + 且匹配成员 → /',
  combo.formatComboDisplayName({
    savedName: '张三 + 李四',
    members: ['张三', '李四']
  }) === '张三/李四'
);
assert(
  '历史 spaced / 归一',
  combo.normalizeComboDisplayName('张三 / 李四', ['张三', '李四']) === '张三/李四'
);
assert(
  '真实名不拆解',
  combo.formatComboDisplayName({
    savedName: '铁三角',
    members: ['张三', '李四', '王五']
  }) === '铁三角'
);
assert(
  'Team 回退成员',
  combo.formatComboDisplayName({
    savedName: 'Team 1',
    members: ['张三', '李四']
  }) === '张三/李四'
);

var s22a = subject.buildParticipantSubject(
  { partyId: 'e1', playerIds: ['A', 'B'], displayName: 'Team 1' },
  { presentPlayer: people }
);
var s22b = subject.buildParticipantSubject(
  { partyId: 'e2', playerIds: ['C', 'D'], displayName: '张三 + 李四' },
  { presentPlayer: people }
);
assert('2+2 A', s22a.displayName === '张三/李四');
assert('2+2 B 应以本组成员为准', s22b.displayName === '王五/赵六');

var s31 = subject.buildParticipantSubject(
  { partyId: 'e3', playerIds: ['A', 'B', 'C'], displayName: '组合2' },
  { presentPlayer: people }
);
assert('3+1 组合', s31.displayName === '张三/李四/王五');

var sPerson = subject.buildParticipantSubject(
  { partyId: 'D', playerIds: ['D'] },
  { presentPlayer: people }
);
assert('个人不变', sPerson.displayName === '赵六');

var long = subject.buildParticipantSubject(
  {
    partyId: 'long',
    playerIds: ['A', 'B'],
    displayName: '超长组合昵称用于省略号验证ABCDEFG'
  },
  { presentPlayer: people }
);
assert(
  '长自定义名保留',
  long.displayName === '超长组合昵称用于省略号验证ABCDEFG'
);
assert(
  '长名单行字段存在',
  typeof long.displayName === 'string' && long.displayName.length > 10
);

assert(
  'A→B 后过期斜杠自动名按新成员重建',
  combo.formatComboDisplayName({
    savedName: '张三/李四',
    members: ['Bee', '李四']
  }) === 'Bee/李四'
);
assert(
  '结果快照 A + 队友 投影为 /',
  combo.formatComboDisplayName({
    savedName: 'Aye + 队友',
    members: ['Bee', '队友']
  }) === 'Bee/队友'
);
assert(
  '三人顺序保留 /',
  combo.formatComboDisplayName({
    savedName: '张三 + 李四 + 王五',
    members: ['Bee', '李四', '王五']
  }) === 'Bee/李四/王五'
);
assert(
  '自定义名不覆盖',
  combo.formatComboDisplayName({
    savedName: '铁三角',
    members: ['Bee', '李四', '王五']
  }) === '铁三角'
);
assert(
  'applyComboDisplayNameToPerson 走统一入口',
  combo.applyComboDisplayNameToPerson({
    partyType: 'combination',
    name: 'Aye + 队友',
    displayName: 'Aye + 队友',
    members: [
      { playerId: 'B', displayName: 'Bee' },
      { playerId: 'C', displayName: '队友' }
    ]
  }).displayName === 'Bee/队友'
);

assert('球员是内部占位', combo.isInternalPartyLabel('球员'));
assert(
  '快照球员不挡住成员名',
  combo.formatComboDisplayName({
    savedName: '球员',
    members: ['Bee', '李四']
  }) === 'Bee/李四'
);

var overlay = subject.buildParticipantSubject(
  { partyId: 'B', playerIds: ['B'], displayName: '球员', name: '球员' },
  { presentPlayer: people }
);
assert('个人快照球员被当前GAME昵称替换', overlay.displayName === '李四');

var afterFix = subject.buildParticipantSubject(
  { partyId: 'B', playerIds: ['B'], subjectId: 'B', displayName: '球员' },
  {
    presentPlayer: present({
      B: { playerId: 'B', displayName: 'Bee', avatar: 'b' }
    })
  }
);
assert('A→B 后按 B 读取真实昵称', afterFix.displayName === 'Bee');

var comboPlaceholder = subject.buildParticipantSubject(
  { partyId: 'c1', playerIds: ['A', 'B'], displayName: '球员' },
  { presentPlayer: people }
);
assert('组合快照球员回退真实成员 /', comboPlaceholder.displayName === '张三/李四');

var comboTeam = subject.buildParticipantSubject(
  { partyId: 'c2', playerIds: ['A', 'B', 'C'], displayName: 'Team 2' },
  { presentPlayer: people }
);
assert('Team N 不覆盖组合成员', comboTeam.displayName === '张三/李四/王五');

var missing = subject.buildParticipantSubject(
  { partyId: 'Z', playerIds: ['Z'], displayName: '球员' },
  { presentPlayer: present({}) }
);
assert('无身份资料才显示球员', missing.displayName === '球员');

console.log('\ncomboDisplayName.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
