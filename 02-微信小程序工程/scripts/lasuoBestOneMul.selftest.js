/**
 * 拉丝较好一点：乘法 = rawCmp × 胜方两人 personalMul 的 max；不 combo。
 * 运行：node scripts/lasuoBestOneMul.selftest.js
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

function gameOf(players) {
  return {
    catalogId: 'lasuo-4',
    groupMode: 'random',
    rankId: 'gross-origin',
    playerOrder: ['A', 'B', 'C', 'D'],
    players: players || ['A', 'B', 'C', 'D'].map(function (id) {
      return { id: id };
    }),
    multiplier: 1,
    holes: [{ label: 'A1', on: true }],
    ruleSnapshot: {
      pkBetter: true,
      pkWorse: false,
      pkTotal: false,
      reward: 'mul',
      mulRows: mulRows(),
      comboMulRows: comboRows(),
      pushRule: 'none',
      baoMode: 'none'
    }
  };
}

function settle(hole, players) {
  return settleLasuo4.settle(gameOf(players), {
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
  'source: resolveBestPersonalMultiplier 存在且 best-one 早退',
  /function resolveBestPersonalMultiplier/.test(src) &&
    /return resolveBestPersonalMultiplier/.test(src)
);

var c1 = settle({ A: -2, B: 0, C: 1, D: 2 });
assert(
  'CASE1 胜方 -2 / +2 → ×5',
  c1.winningTeam === 'A' &&
    Number(c1.multiplier) === 5 &&
    c1.multiplierSource !== 'm2-m2' &&
    c1.rewardedTeamScore === c1.baseTeamScore * 5,
  JSON.stringify(c1)
);

var c2 = settle({ A: -1, B: 0, C: 1, D: -3 });
assert(
  'CASE2 胜方 -1 / -3 → ×10',
  c2.winningTeam === 'A' &&
    Number(c2.multiplier) === 10 &&
    c2.multiplierSource !== 'personal-product',
  JSON.stringify(c2)
);

var c3 = settle(
  { A: -1, B: 0, C: 1, D: -2 },
  [
    { id: 'A', hcapPar4: 10 },
    { id: 'B' },
    { id: 'C' },
    { id: 'D' }
  ]
);
assert(
  'CASE3 较好 net 是 -1，搭档 rel=-2 → 仍 ×5，不是 better-only ×2',
  c3.winningTeam === 'A' &&
    Number(c3.multiplier) === 5,
  JSON.stringify(c3)
);

var c4 = settle({ A: -1, B: 1, C: 1, D: -1 });
assert(
  'CASE4 双 -1 即使 combo m1-m1=4 → ×2',
  c4.winningTeam === 'A' &&
    Number(c4.multiplier) === 2 &&
    c4.multiplierSource !== 'm1-m1',
  JSON.stringify(c4)
);

var c5 = settle(
  { A: -1, B: -3, C: 0, D: 0 },
  [
    { id: 'A', hcapPar4: 20 },
    { id: 'B' },
    { id: 'C' },
    { id: 'D' }
  ]
);
assert(
  'CASE5 A 凭 net 赢，负方 rel=-3 的 ×10 舍弃',
  c5.winningTeam === 'A' &&
    Number(c5.multiplier) === 2,
  JSON.stringify(c5)
);

console.log('done  passed=' + passed + '  failed=' + failed);
if (failed) process.exit(1);
