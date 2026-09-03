/**
 * 三局重新选人后 PK 默认勾选：主体集合变化才重建并全选。
 * 运行：node scripts/gameThreeSetPairReset.selftest.js
 */
var path = require('path');
var fs = require('fs');
var reset = require('../miniprogram/subpackages/game/utils/threeSetPairReset.js');
var partyFormation = require('../miniprogram/subpackages/game/utils/partyFormation.js');

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

function subj(id, selected, extra) {
  return Object.assign({ id: id, selected: selected !== false }, extra || {});
}

function pairKey(p) {
  var a = String(p.leftId || p.leftPartyId);
  var b = String(p.rightId || p.rightPartyId);
  return a < b ? a + '|' + b : b + '|' + a;
}

function buildPairsLikeConfig(players) {
  var selected = (players || []).filter(function (item) {
    return item.selected;
  });
  var pairs = [];
  var i;
  var j;
  for (i = 0; i < selected.length; i++) {
    for (j = i + 1; j < selected.length; j++) {
      pairs.push({
        id: selected[i].id + '|' + selected[j].id,
        leftId: selected[i].id,
        rightId: selected[j].id,
        on: true
      });
    }
  }
  return pairs;
}

function applyThreeSetAction(prevPlayers, prevPairs, nextPlayers) {
  var action = reset.resolveThreeSetPairAction(prevPlayers, nextPlayers);
  if (action.keepPairs) return { action: action, pairs: prevPairs.slice() };
  var rebuilt = buildPairsLikeConfig(nextPlayers).map(function (p) {
    return Object.assign({}, p, { on: true });
  });
  return { action: action, pairs: rebuilt };
}

// —— 主体集合比较 ——
assert(
  '同集合忽略昵称/头像/顺序',
  reset.sameSelectedSubjectSet(
    [subj('A', true, { name: '旧名', avatar: '1' }), subj('B', true)],
    [subj('B', true, { name: '新名', avatar: '2' }), subj('A', true, { displayName: 'X' })]
  )
);
assert(
  '优先 subjectId/partyId/playerId',
  reset.stableSubjectId({ subjectId: 'S1', partyId: 'P1', playerId: 'U1', id: 'X' }) === 'S1' &&
    reset.stableSubjectId({ partyId: 'P1', id: 'X' }) === 'P1' &&
    reset.stableSubjectId({ playerId: 'U1', id: 'X' }) === 'U1'
);
assert(
  '集合变化可检测',
  !reset.sameSelectedSubjectSet([subj('A'), subj('B')], [subj('A'), subj('B'), subj('C')])
);
assert(
  '未选中不计入集合',
  reset.sameSelectedSubjectSet(
    [subj('A', true), subj('B', false), subj('C', true)],
    [subj('C', true), subj('A', true)]
  )
);

var keep = reset.resolveThreeSetPairAction([subj('A'), subj('B')], [subj('B'), subj('A')]);
assert('未变主体 → keepPairs', keep.keepPairs && !keep.forceAllOn);

var rebuild = reset.resolveThreeSetPairAction([subj('A'), subj('B')], [subj('A'), subj('B'), subj('C')]);
assert('增加主体 → rebuild+forceAllOn', rebuild.rebuild && rebuild.forceAllOn);

// —— 2/3/4 方条数与全选 ——
var two = applyThreeSetAction(
  [subj('A'), subj('B')],
  [{ id: 'A|B', leftId: 'A', rightId: 'B', on: false }],
  [subj('A'), subj('B')]
);
assert('未变保留手动取消勾选', two.action.keepPairs && two.pairs.length === 1 && two.pairs[0].on === false);

var addC = applyThreeSetAction(
  [subj('A'), subj('B')],
  [{ id: 'A|B', leftId: 'A', rightId: 'B', on: false }],
  [subj('A'), subj('B'), subj('C')]
);
assert('两方→三方生成3条', addC.pairs.length === 3);
assert(
  '三方全部勾选',
  addC.pairs.every(function (p) {
    return p.on;
  })
);
var keys3 = addC.pairs.map(pairKey).sort().join(',');
assert('三方对为 AB/AC/BC', keys3 === 'A|B,A|C,B|C');

var four = applyThreeSetAction([], [], [subj('A'), subj('B'), subj('C'), subj('D')]);
assert('四方生成6条并全选', four.pairs.length === 6 && four.pairs.every(function (p) { return p.on; }));

var drop = applyThreeSetAction(
  [subj('A'), subj('B'), subj('C')],
  [
    { id: 'A|B', leftId: 'A', rightId: 'B', on: true },
    { id: 'A|C', leftId: 'A', rightId: 'C', on: true },
    { id: 'B|C', leftId: 'B', rightId: 'C', on: false }
  ],
  [subj('A'), subj('B')]
);
assert('删除C后仅剩1条PK', drop.pairs.length === 1 && pairKey(drop.pairs[0]) === 'A|B');
assert('删除后重建全选', drop.pairs[0].on === true);

// —— 组合方：不拆成员 ——
var parties = [
  { partyId: 'entity-1', playerIds: ['p1', 'p2'] },
  { partyId: 'entity-2', playerIds: ['p3', 'p4'] }
];
var matchups22 = partyFormation.buildPartyMatchups(parties);
assert('2+2 仅1条组合PK', matchups22.length === 1);
assert(
  '2+2 不出现球员笛卡尔',
  matchups22[0].leftPartyId === 'entity-1' && matchups22[0].rightPartyId === 'entity-2'
);

var parties211 = [
  { partyId: 'entity-1', playerIds: ['p1', 'p2'] },
  { partyId: 'entity-2', playerIds: ['p3'] },
  { partyId: 'entity-3', playerIds: ['p4'] }
];
var matchups211 = partyFormation.buildPartyMatchups(parties211);
assert('2+1+1 三条主体PK', matchups211.length === 3);
assert(
  '2+1+1 不含成员拆分对',
  matchups211.every(function (m) {
    return String(m.leftPartyId).indexOf('entity-') === 0 && String(m.rightPartyId).indexOf('entity-') === 0;
  })
);

// —— 接线：config 仅三局走 threeSetPairsPatch ——
var configJs = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/pages/config/index.js'),
  'utf8'
);
assert('config 引入 threeSetPairReset', /threeSetPairReset/.test(configJs));
assert('applyPlayerPick 三局分支', /showThreeSet\s*\?\s*threeSetPairsPatch/.test(configJs));
assert('toggle 三局分支', /showThreeSet\s*\?\s*threeSetPairsPatch/.test(configJs));
assert('回显保留三局 on', /showThreeSet \? hit\.on !== false : true/.test(configJs));
assert('forceAllOn 仅经 opts', /forceAllOn/.test(configJs));

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
