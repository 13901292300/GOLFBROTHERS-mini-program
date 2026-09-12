/**
 * 拉丝头尾两点：乘法 = combo 优先，否则胜方两人 personalMul 相乘；与 add 分离。
 * 运行：node scripts/lasuoHeadTailMul.selftest.js
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

function addRows() {
  return [
    { id: 'hio', value: '10' },
    { id: 'm2', value: '4' },
    { id: 'm1', value: '1' },
    { id: 'par', value: '0' },
    { id: 'p1', value: '0' },
    { id: 'ge2', value: '0' }
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
        pkBetter: true,
        pkWorse: true,
        pkTotal: false,
        pkBetterW: '1',
        pkWorseW: '1',
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
  'source: head-tail 早退复用 resolveComboThenPersonalProduct',
  /function resolveComboThenPersonalProduct/.test(src) &&
    /pkWorse !== false && rule\.pkTotal === false/.test(src) &&
    /return resolveComboThenPersonalProduct/.test(src)
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

var c5 = settle({ A: -4, B: -3, C: -2, D: -3 });
assert(
  'CASE5 A 赢，负方 -3 / -2 的 ×10/×5 舍弃',
  c5.winningTeam === 'A' &&
    c5.multiplierSource === 'personal-product' &&
    Number(c5.multiplier) === 100,
  JSON.stringify(c5)
);

var c6 = settle({ A: 0, B: -1, C: -2, D: 2 });
assert(
  'CASE6 B 赢 rawCmp=-2，无 combo ×10 → -20',
  c6.winningTeam === 'B' &&
    c6.baseTeamScore === -2 &&
    c6.multiplierSource === 'personal-product' &&
    Number(c6.multiplier) === 10 &&
    c6.rewardedTeamScore === -20,
  JSON.stringify(c6)
);

var holeAddMul = { A: -1, B: 1, C: 2, D: 0 };
var addDbg = settle(holeAddMul, {
  reward: 'add',
  addRows: addRows(),
  addPre: 'win'
});
var mulDbg = settle(holeAddMul);
assert(
  'CASE7 add 与 mul 路径互不影响',
  addDbg.rewardMode === 'add' &&
    Number(addDbg.multiplier) === 1 &&
    addDbg.addRewardA > 0 &&
    mulDbg.rewardMode === 'mul' &&
    mulDbg.multiplierSource === 'personal-product' &&
    Number(mulDbg.multiplier) === 2 &&
    Number(mulDbg.addRewardA) === 0,
  JSON.stringify({ add: addDbg, mul: mulDbg })
);

console.log('done  passed=' + passed + '  failed=' + failed);
if (failed) process.exit(1);
