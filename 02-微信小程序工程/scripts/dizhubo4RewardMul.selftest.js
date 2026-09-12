/**
 * 四人地主婆：乘法奖励按胜方较好个人真实成绩查表；平均分只用于二地主婆农民队判胜负。
 * 运行：node scripts/dizhubo4RewardMul.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
global.wx.getStorageSync = global.wx.getStorageSync || function () {
  return null;
};
global.wx.setStorageSync = global.wx.setStorageSync || function () {};
global.wx.showToast = function () {};

var fs = require('fs');
var path = require('path');
var settleDizhubo4 = require('../miniprogram/subpackages/game/utils/settleDizhubo4.js');
var core = require('../miniprogram/subpackages/game/utils/settleCore.js');

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

function mulRows() {
  return [
    { id: 'hio', value: '10' },
    { id: 'm2', value: '5' },
    { id: 'm1', value: '2' },
    { id: 'par', value: '1' },
    { id: 'p1', value: '1' },
    { id: 'ge2', value: '1' }
  ];
}

function meatRows(over) {
  over = over || {};
  return [
    { id: 'le-2', value: String(over['le-2'] != null ? over['le-2'] : 3) },
    { id: 'm1', value: String(over.m1 != null ? over.m1 : 2) },
    { id: 'par', value: String(over.par != null ? over.par : 1) },
    { id: 'ge-1', value: String(over['ge-1'] != null ? over['ge-1'] : 0) }
  ];
}

function gameOf(mode, extra) {
  extra = extra || {};
  return {
    catalogId: 'dizhubo-4',
    dizhuboMode: mode,
    groupMode: 'fixed',
    rankId: 'gross-origin',
    playerOrder: ['A', 'B', 'C', 'D'],
    players: ['A', 'B', 'C', 'D'].map(function (id) {
      return { id: id };
    }),
    multiplier: extra.k != null ? extra.k : 1,
    holes: [
      { label: 'A1', on: true },
      { label: 'A2', on: true }
    ],
    ruleSnapshot: Object.assign(
      {
        reward: 'mul',
        mulRows: mulRows(),
        pushRule: extra.pushRule != null ? extra.pushRule : 'none',
        meatInclude: extra.meatInclude != null ? extra.meatInclude : 'no',
        meatRows: extra.meatRows || meatRows()
      },
      extra.rule || {}
    )
  };
}

function settle(mode, scores, extra) {
  extra = extra || {};
  var labels = Object.keys(scores);
  return settleDizhubo4.settle(gameOf(mode, extra), {
    scores: scores,
    holeOrder: extra.holeOrder || ['A1', 'A2'],
    pars: { A1: 4, A2: 4 }
  });
}

function sameLedger(actual, expected) {
  return (
    Number(actual.A) === expected.A &&
    Number(actual.B) === expected.B &&
    Number(actual.C) === expected.C &&
    Number(actual.D) === expected.D
  );
}

function midCompare(rels) {
  var landScore = Math.min(rels.B, rels.D);
  var farmScore = core.round1((rels.A + rels.C) / 2);
  var winner = 'tie';
  if (landScore < farmScore) winner = 'land';
  else if (farmScore < landScore) winner = 'farm';
  return { landScore: landScore, farmScore: farmScore, winner: winner };
}

var src = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/utils/settleDizhubo4.js'),
  'utf8'
);

var caseExact1 = settle('mid', { A1: { A: -1, B: 2, C: 3, D: 2 } });
assert(
  'CASE 二地主婆 farmer 赢：A=-1 C=+3 均分+1，奖励用较好个人 -1 → ×2',
  midCompare({ A: -1, B: 2, C: 3, D: 2 }).winner === 'farm' &&
    midCompare({ A: -1, B: 2, C: 3, D: 2 }).farmScore === 1 &&
    /const winRel = pickBestRel\(rec, win\);/.test(src) &&
    !/Math\.round\(farmScore\)/.test(src) &&
    sameLedger(caseExact1.byHole.A1, { A: 2, C: 2, B: -2, D: -2 }),
  JSON.stringify({
    cmp: midCompare({ A: -1, B: 2, C: 3, D: 2 }),
    ledger: caseExact1.byHole.A1
  })
);

var caseExact2 = settle('mid', { A1: { A: 0, B: -2, C: 0, D: 2 } });
assert(
  'CASE 二地主婆 landlord 赢：B=-2 D=+2，奖励用较好个人 -2 → ×5',
  midCompare({ A: 0, B: -2, C: 0, D: 2 }).winner === 'land' &&
    midCompare({ A: 0, B: -2, C: 0, D: 2 }).landScore === -2 &&
    sameLedger(caseExact2.byHole.A1, { B: 5, D: 5, A: -5, C: -5 }),
  JSON.stringify({
    cmp: midCompare({ A: 0, B: -2, C: 0, D: 2 }),
    ledger: caseExact2.byHole.A1
  })
);

var caseExact3 = settle('big', { A1: { A: 0, B: -2, C: 1, D: 0 } });
assert(
  'CASE 大地主婆 farmer 赢：赢队较好个人 -2 → ×5，不走平均',
  sameLedger(caseExact3.byHole.A1, { B: 5, C: 5, A: -5, D: -5 }),
  JSON.stringify(caseExact3.byHole.A1)
);

var case1 = settle('mid', { A1: { A: -1, B: 1, C: 1, D: 2 } });
assert(
  'CASE1 二地主婆 农民小鸟+柏忌均分PAR且农民胜 → 按小鸟 ×2',
  midCompare({ A: -1, B: 1, C: 1, D: 2 }).winner === 'farm' &&
    midCompare({ A: -1, B: 1, C: 1, D: 2 }).farmScore === 0 &&
    sameLedger(case1.byHole.A1, { A: 2, C: 2, B: -2, D: -2 }),
  JSON.stringify(case1.byHole.A1)
);

var case2 = settle('mid', { A1: { A: -2, B: 1, C: 2, D: 2 } });
assert(
  'CASE2 二地主婆 农民老鹰+双柏忌农民胜 → 按老鹰 ×5，不得按平均PAR',
  midCompare({ A: -2, B: 1, C: 2, D: 2 }).winner === 'farm' &&
    midCompare({ A: -2, B: 1, C: 2, D: 2 }).farmScore === 0 &&
    sameLedger(case2.byHole.A1, { A: 5, C: 5, B: -5, D: -5 }),
  JSON.stringify(case2.byHole.A1)
);

var case3 = settle('mid', { A1: { A: -1, B: 0, C: 2, D: 1 } });
assert(
  'CASE3 二地主婆 负方有人小鸟且地主队胜 → 负方不触发',
  midCompare({ A: -1, B: 0, C: 2, D: 1 }).winner === 'land' &&
    sameLedger(case3.byHole.A1, { B: 1, D: 1, A: -1, C: -1 }),
  JSON.stringify(case3.byHole.A1)
);

var case4 = settle('mid', { A1: { A: 0, B: -1, C: 1, D: 1 } });
assert(
  'CASE4 二地主婆地主队有人小鸟且地主队胜 → ×2',
  midCompare({ A: 0, B: -1, C: 1, D: 1 }).winner === 'land' &&
    sameLedger(case4.byHole.A1, { B: 2, D: 2, A: -2, C: -2 }),
  JSON.stringify(case4.byHole.A1)
);

var case5 = settle('big', { A1: { A: -1, B: 0, C: 1, D: 0 } });
assert(
  'CASE5 大地主婆胜方有人小鸟 → ×2',
  sameLedger(case5.byHole.A1, { A: 2, D: 2, B: -2, C: -2 }),
  JSON.stringify(case5.byHole.A1)
);

var c6a = midCompare({ A: -1, B: 1, C: 1, D: 2 });
var c6b = midCompare({ A: -1, B: 0, C: 2, D: 1 });
var c6c = midCompare({ A: 0, B: 0, C: 0, D: 1 });
assert(
  'CASE6 二地主婆胜负判断与平均比较式一致',
  c6a.winner === 'farm' &&
    Number(case1.byHole.A1.A) > 0 &&
    c6b.winner === 'land' &&
    Number(case3.byHole.A1.B) > 0 &&
    c6c.winner === 'tie' &&
    sameLedger(settle('mid', { A1: { A: 0, B: 0, C: 0, D: 1 } }).byHole.A1, {
      A: 0,
      B: 0,
      C: 0,
      D: 0
    }),
  JSON.stringify({ c6a: c6a, c6b: c6b, c6c: c6c })
);

var push = settle('mid', { A1: { A: 0, B: 0, C: 0, D: 1 } }, { pushRule: 'push' });
var noPush = settle('mid', { A1: { A: 0, B: 0, C: 0, D: 1 } }, { pushRule: 'none' });
assert(
  'CASE7 顶洞逻辑不变：打平计 0，push 才入肉池',
  sameLedger(push.byHole.A1, { A: 0, B: 0, C: 0, D: 0 }) &&
    sameLedger(noPush.byHole.A1, { A: 0, B: 0, C: 0, D: 0 }) &&
    push.topHoleStates &&
    push.topHoleStates.A1 === 'pending' &&
    (!noPush.topHoleStates || noPush.topHoleStates.A1 !== 'pending'),
  JSON.stringify({ push: push.topHoleStates, noPush: noPush.topHoleStates })
);

var meat = settle(
  'mid',
  {
    A1: { A: 0, B: 0, C: 0, D: 1 },
    A2: { A: -1, B: 1, C: 1, D: 2 }
  },
  {
    pushRule: 'push',
    meatInclude: 'no',
    meatRows: meatRows({ m1: 1, par: 0, 'le-2': 0, 'ge-1': 0 })
  }
);
assert(
  'CASE8 吃肉仍按胜方较好个人成绩，不按农民平均 PAR',
  /meatWanted\(rule,\s*pickBestRel\(rec,\s*win\)/.test(src) &&
    !/Math\.round\(farmScore\)/.test(src) &&
    midCompare({ A: -1, B: 1, C: 1, D: 2 }).farmScore === 0 &&
    sameLedger(meat.byHole.A1, { A: 0, B: 0, C: 0, D: 0 }) &&
    sameLedger(meat.byHole.A2, { A: 3, C: 3, B: -3, D: -3 }) &&
    meat.topHoleStates.A1 === 'consumed',
  JSON.stringify({ A1: meat.byHole.A1, A2: meat.byHole.A2, top: meat.topHoleStates })
);

console.log('done  passed=' + passed + '  failed=' + failed);
if (failed) process.exit(1);
