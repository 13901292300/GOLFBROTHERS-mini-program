/**
 * 拉丝总成绩一点：乘法 = combo 优先，否则胜方两人 personalMul 相乘。
 * 运行：node scripts/lasuoTotalOneMul.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
global.wx.getStorageSync = global.wx.getStorageSync || function () {
  return null;
};
global.wx.setStorageSync = global.wx.setStorageSync || function () {};
global.wx.showToast = function () {};

var fs = require('fs');
var path = require('path');
var settleLasuo4 = require('../miniprogram/subpackages/game/utils/settleLasuo4.js');

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

function comboRows() {
  return [
    { id: 'm2-m2', value: '25' },
    { id: 'm2-m1', value: '10' },
    { id: 'm1-m1', value: '4' }
  ];
}

function gameOf(extraRule) {
  extraRule = extraRule || {};
  return {
    catalogId: 'lasuo-4',
    groupMode: 'random',
    rankId: 'gross-origin',
    playerOrder: ['A', 'B', 'C', 'D'],
    players: ['A', 'B', 'C', 'D'].map(function (id) {
      return { id: id };
    }),
    multiplier: 1,
    holes: [{ label: 'A1', on: true }],
    ruleSnapshot: Object.assign(
      {
        pkBetter: false,
        pkWorse: false,
        pkTotal: true,
        pkTotalW: '1',
        pkTotalMode: 'sum',
        reward: 'mul',
        mulRows: mulRows(),
        comboMulRows: [],
        pushRule: 'none',
        baoMode: 'none'
      },
      extraRule
    )
  };
}

function settle(hole, extraRule) {
  return settleLasuo4.settle(gameOf(extraRule), {
    scores: { A1: hole },
    holeOrder: ['A1'],
    pars: { A1: 4 }
  }).holeDebug.A1;
}

var src = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/utils/settleLasuo4.js'),
  'utf8'
);
assert(
  'source: resolveComboThenPersonalProduct 且 total-one 早退',
  /function resolveComboThenPersonalProduct/.test(src) &&
    /return resolveComboThenPersonalProduct/.test(src) &&
    /source: "personal-product"/.test(src)
);

var c1 = settle({ A: -2, B: 1, C: 2, D: 0 });
assert(
  'CASE1 胜方 -2 / 0 无 combo → 5×1 = ×5',
  c1.winningTeam === 'A' &&
    c1.multiplierSource === 'personal-product' &&
    Number(c1.multiplier) === 5,
  JSON.stringify(c1)
);

var c2 = settle({ A: -1, B: 0, C: 2, D: -2 });
assert(
  'CASE2 胜方 -1 / -2 无 combo → 2×5 = ×10，不是 max ×5',
  c2.winningTeam === 'A' &&
    c2.multiplierSource === 'personal-product' &&
    Number(c2.multiplier) === 10,
  JSON.stringify(c2)
);

var c3 = settle({ A: -1, B: 1, C: 2, D: -1 }, { comboMulRows: comboRows() });
assert(
  'CASE3 双 -1 combo m1-m1=×4，source 是组合不是 product',
  c3.winningTeam === 'A' &&
    c3.multiplierSource === 'm1-m1' &&
    Number(c3.multiplier) === 4,
  JSON.stringify(c3)
);

var c4 = settle({ A: -2, B: 0, C: 2, D: -2 });
assert(
  'CASE4 胜方 -2 / -2 无 combo → 5×5 = ×25',
  c4.winningTeam === 'A' &&
    c4.multiplierSource === 'personal-product' &&
    Number(c4.multiplier) === 25,
  JSON.stringify(c4)
);

var c5 = settle({ A: 0, B: -3, C: 4, D: 0 });
assert(
  'CASE5 A 赢，负方 -3/-2 的 ×10/×5 舍弃',
  c5.winningTeam === 'A' &&
    c5.multiplierSource === 'personal-product' &&
    Number(c5.multiplier) === 1,
  JSON.stringify(c5)
);

var c6 = settle({ A: 0, B: -1, C: -2, D: 2 }, { pkTotalW: '2' });
assert(
  'CASE6 B 赢 rawCmp=-2，无 combo 2×5=×10 → -20',
  c6.winningTeam === 'B' &&
    c6.baseTeamScore === -2 &&
    c6.multiplierSource === 'personal-product' &&
    Number(c6.multiplier) === 10 &&
    c6.rewardedTeamScore === -20,
  JSON.stringify(c6)
);

var hole7 = { A: -1, B: 1, C: 1, D: 3 };
var sum7 = settle(hole7, { pkTotalMode: 'sum' });
var prod7 = settle(hole7, { pkTotalMode: 'product' });
assert(
  'CASE7 pkTotalMode=product 只改 rawCmp，倍率仍是 personal product',
  sum7.winningTeam === 'none' &&
    sum7.baseTeamScore === 0 &&
    prod7.winningTeam === 'A' &&
    prod7.baseTeamScore === 1 &&
    prod7.multiplierSource === 'personal-product' &&
    Number(prod7.multiplier) === 2,
  JSON.stringify({ sum: sum7, product: prod7 })
);

console.log('done  passed=' + passed + '  failed=' + failed);
if (failed) process.exit(1);
