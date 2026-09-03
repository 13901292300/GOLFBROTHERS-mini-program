/**
 * 游戏 TAB 选人：赛事分组投影，隔离通讯录 A–Z。
 * 运行：node scripts/pickPlayersEventGroups.selftest.js
 */
var fs = require('fs');
var path = require('path');
var proj = require('../miniprogram/subpackages/game/utils/pickPlayersEventGroups.js');

var gameRoot = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game');
var pickJs = fs.readFileSync(path.join(gameRoot, 'pages/pick-players/index.js'), 'utf8');
var pickWxml = fs.readFileSync(path.join(gameRoot, 'pages/pick-players/index.wxml'), 'utf8');
var pickWxss = fs.readFileSync(path.join(gameRoot, 'pages/pick-players/index.wxss'), 'utf8');
var scoreWxml = fs.readFileSync(path.join(gameRoot, 'pages/score-config/index.wxml'), 'utf8');
var scoreJs = fs.readFileSync(path.join(gameRoot, 'pages/score-config/index.js'), 'utf8');
var contactsJs = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram/subpackages/player/pages/me/contacts/index.js'),
  'utf8'
);
var letterJs = fs.readFileSync(path.join(gameRoot, 'utils/letter.js'), 'utf8');
var settleJs = fs.readFileSync(path.join(gameRoot, 'utils/settle.js'), 'utf8');
var configJs = fs.readFileSync(path.join(gameRoot, 'pages/config/index.js'), 'utf8');

var passed = 0;
var failed = 0;

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function person(id, name, groupId) {
  return { id: id, name: name, groupId: groupId || '', selected: false };
}

var eventGroups = [
  {
    groupId: 'g1',
    groupNo: 1,
    groupName: '第1组',
    playersSlots: [{ playerId: 'A' }, { playerId: 'B' }, { playerId: 'C' }, { playerId: 'D' }]
  },
  {
    groupId: 'g2',
    groupNo: 2,
    groupName: '第2组',
    playersSlots: [{ playerId: 'E' }, { playerId: 'F' }, { playerId: 'G' }]
  },
  {
    groupId: 'g3',
    groupNo: 3,
    groupName: '第3组',
    playersSlots: [
      { playerId: 'H' },
      { playerId: 'I' },
      { playerId: 'J' },
      { playerId: 'K' },
      { playerId: 'L' }
    ]
  }
];

var roster = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map(function (id, i) {
  var gid = id <= 'D' ? 'g1' : id <= 'G' ? 'g2' : 'g3';
  return person(id, id === 'A' ? '张三' : id === 'B' ? 'Alex' : '球员' + id, gid);
});

var view = proj.buildSelectionGroups({
  eventGroups: eventGroups,
  players: roster,
  selectedIds: ['C']
});

assert('1 不再出现 A–Z letter 字段', view.groups.every(function (g) { return !g.letter; }));
assert('1 WXML 无 pick-letter', pickWxml.indexOf('pick-letter') < 0 && pickWxml.indexOf('item.letter') < 0);
assert('2 中英文姓名不参与排序：组1仍 A B C D', view.groups[0].members.map(function (m) { return m.id; }).join(',') === 'A,B,C,D');
assert('3 多组按赛事组序', view.groups.map(function (g) { return g.groupLabel; }).slice(0, 3).join('|') === '第1组|第2组|第3组');
assert('4 组内原始顺序 第2组 E F G', view.groups[1].members.map(function (m) { return m.id; }).join(',') === 'E,F,G');
assert('5 第1组 4 人', view.groups[0].members.length === 4);
assert('6 第2组 3 人', view.groups[1].members.length === 3);
assert('7 第3组 5 人（4+1 换行由 CSS 网格承担）', view.groups[2].members.length === 5);
assert('8 组独立：第2组不以 D 续接', view.groups[1].members[0].id === 'E');

var ten = [];
var i;
for (i = 1; i <= 10; i++) ten.push(i);
var shuffledNos = [1, 10, 11, 2, 3, 4, 5, 6, 7, 8, 9];
var tenGroups = shuffledNos.map(function (n) {
  return {
    groupId: 'g-' + n,
    groupNo: n,
    playersSlots: [{ playerId: 'p' + n }]
  };
});
var tenPlayers = shuffledNos.map(function (n) {
  return person('p' + n, '名' + n, 'g-' + n);
});
var tenView = proj.buildSelectionGroups({ eventGroups: tenGroups, players: tenPlayers, selectedIds: [] });
assert(
  '9 组号 1、10、11、2 按数字而非字典序',
  tenView.groups.map(function (g) { return g.groupNo; }).join(',') === '1,2,3,4,5,6,7,8,9,10,11'
);

var withLoose = proj.buildSelectionGroups({
  eventGroups: eventGroups,
  players: roster.concat([person('Z', '未挂', '')]),
  selectedIds: []
});
assert('10 未分组在最后', withLoose.groups[withLoose.groups.length - 1].groupLabel === '未分组' && withLoose.groups[withLoose.groups.length - 1].members[0].id === 'Z');

assert('11 C 选中跟随 playerId', view.groups[0].members.filter(function (m) { return m.id === 'C'; })[0].selected === true);
var rebuilt = proj.rebuildFromFlat(view.groups, view.flat.map(function (m) {
  return Object.assign({}, m, { selected: m.id === 'G' });
}));
assert('11 换布局后按 id 保持选中', rebuilt.flat.filter(function (m) { return m.selected; }).map(function (m) { return m.id; }).join(',') === 'G');
assert('12 确认集合仍是 playerId', rebuilt.flat.some(function (m) { return m.id === 'G' && m.selected; }));

var disabled = proj.buildSelectionGroups({
  eventGroups: eventGroups,
  players: roster.map(function (p) {
    return Object.assign({}, p, { disabled: p.id === 'A' });
  }),
  selectedIds: []
});
assert('13 A 禁选字段保留', disabled.groups[0].members[0].disabled === true);

assert('14 pick-players 仍校验 min/max toast', /至少选/.test(pickJs) && /最多选/.test(pickJs));
assert('15 config 入口带 layoutMode=event-groups', /layoutMode=event-groups/.test(configJs));
assert('16 单组只生成一组', proj.buildSelectionGroups({
  eventGroups: [eventGroups[0]],
  players: roster.slice(0, 4),
  selectedIds: []
}).groups.length === 1);

assert('17 score-config 仍 A–Z', /pick-letter/.test(scoreWxml) && /groupByLetter/.test(scoreJs));
assert('17 通讯录仍有字母索引逻辑', /letterFromPinyin|A–Z index/.test(contactsJs) || /letterFromPinyin/.test(contactsJs));
assert('17 letter.js 未被删除', /function groupByLetter/.test(letterJs));
assert('17 pick-players 不再 require letter', pickJs.indexOf('utils/letter') < 0);

assert('18 昵称省略号', /text-overflow:\s*ellipsis/.test(fs.readFileSync(path.join(gameRoot, 'components/party-face/index.wxss'), 'utf8')));
assert('19 四列 minmax(0,1fr) 且格 min-width:0', /repeat\(4, minmax\(0, 1fr\)\)/.test(pickWxss) && /min-width:\s*0/.test(pickWxss));
assert('空组不展示', proj.buildSelectionGroups({
  eventGroups: eventGroups.concat([{ groupId: 'empty', groupNo: 4, playersSlots: [] }]),
  players: roster,
  selectedIds: []
}).groups.every(function (g) { return g.groupId !== 'empty'; }));

var dup = proj.buildSelectionGroups({
  eventGroups: [eventGroups[0]],
  players: [person('A', '一', 'g1'), person('A', '二', 'g1')],
  selectedIds: []
});
assert('重复 playerId 只显示一次', dup.groups[0].members.length === 1 && dup.anomalies[0].type === 'duplicate_playerId');

assert('不改 settle', /settleGame/.test(settleJs));
assert('WXML 按 partyId 点选', /data-id="\{\{person.id\}\}"/.test(pickWxml));
assert(
  '选择状态 class 拆分 selected/disabled',
  /player-slot--selected/.test(pickWxml) &&
    /player-slot--idle/.test(pickWxml) &&
    /player-slot--disabled/.test(pickWxml) &&
    !/person\.selected \? '' : 'off'/.test(pickWxml)
);
assert(
  '选人页取消 selected 置灰',
  /\.player-slot--selected\s*\{[^}]*opacity:\s*1/.test(pickWxss) &&
    /\.player-slot--idle\s*\{[^}]*opacity:\s*1/.test(pickWxss) &&
    /\.player-slot--disabled\s*\{[^}]*opacity:\s*0\.4/.test(pickWxss)
);
assert('选人页不再依赖全局 off 类', pickWxml.indexOf("'off'") < 0 && pickWxml.indexOf('"off"') < 0);

var mutated = JSON.parse(JSON.stringify(eventGroups));
proj.buildSelectionGroups({ eventGroups: mutated, players: roster, selectedIds: ['A'] });
assert('不修改原始分组数组', JSON.stringify(mutated) === JSON.stringify(eventGroups));

var teamGroups = [
  {
    groupId: 'tg1',
    groupNo: 1,
    players: [
      { userId: 'u2', position: 2 },
      { userId: 'u1', position: 1 },
      { userId: 'u3', position: 3 }
    ]
  }
];
var teamView = proj.buildSelectionGroups({
  eventGroups: teamGroups,
  players: [person('u1', '甲', 'tg1'), person('u2', '乙', 'tg1'), person('u3', '丙', 'tg1')],
  selectedIds: []
});
assert('球队组内按 position 而非姓名', teamView.groups[0].members.map(function (m) { return m.id; }).join(',') === 'u1,u2,u3');

console.log('\npickPlayersEventGroups.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
