/**
 * 拉丝头总两点：乘法 = rawCmp × 胜方两人 personalMul 的 max；不 combo、不 product。
 * 运行：node scripts/lasuoHeadTotalMul.selftest.js
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

function htMul(extra) {
  extra = extra || {};
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
        pkWorse: false,
        pkTotal: true,
        pkBetterW: extra.pkBetterW != null ? extra.pkBetterW : '1',
        pkTotalW: extra.pkTotalW != null ? extra.pkTotalW : '1',
        reward: 'mul',
        mulRows: mulRows(),
        comboMulRows: extra.comboMulRows || comboRows(),
        pushRule: 'none',
        baoMode: 'none'
      },
      extra.rule || {}
    )
  };
}

function settle(extra, hole) {
  return settleLasuo4.settle(htMul(extra), {
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
  'head-total mul 源码：独立 resolver，标记 head-total-max',
  /function resolveHeadTotalMultiplier/.test(src) && /source: "head-total-max"/.test(src)
);

var c1 = settle({}, { A: -2, B: 1, C: 1, D: 0 });
assert(
  'CASE1 胜方 -2 / 0 → ×5',
  c1.winningTeam === 'A' &&
    c1.multiplierSource === 'head-total-max' &&
    Number(c1.multiplier) === 5 &&
    c1.rewardedTeamScore === c1.baseTeamScore * 5,
  JSON.stringify(c1)
);

var c2 = settle({}, { A: -1, B: 1, C: 1, D: -2 });
assert(
  'CASE2 胜方 -1 / -2 → ×5',
  c2.winningTeam === 'A' &&
    Number(c2.multiplier) === 5 &&
    c2.multiplierSource === 'head-total-max',
  JSON.stringify(c2)
);

var c3 = settle({}, { A: -2, B: 2, C: 2, D: -1 });
assert(
  'CASE3 胜方 -2 / -1 → ×5，不是 product ×10',
  c3.winningTeam === 'A' &&
    Number(c3.multiplier) === 5 &&
    c3.rewardedTeamScore === c3.baseTeamScore * 5 &&
    c3.multiplierSource !== 'personal-product',
  JSON.stringify(c3)
);

var c4 = settle({}, { A: -1, B: 1, C: 1, D: -1 });
assert(
  'CASE4 双 -1 即使 combo m1-m1=4 → ×2',
  c4.winningTeam === 'A' &&
    Number(c4.multiplier) === 2 &&
    c4.multiplierSource === 'head-total-max' &&
    c4.multiplierSource !== 'm1-m1',
  JSON.stringify(c4)
);

var c5 = settle({}, { A: 0, B: 2, C: 2, D: 1 });
assert(
  'CASE5 胜方 0 / +1 → ×1，负方不参与',
  c5.winningTeam === 'A' &&
    Number(c5.multiplier) === 1 &&
    c5.rewardedTeamScore === c5.baseTeamScore,
  JSON.stringify(c5)
);

var c6 = settle(
  { pkBetterW: '2', pkTotalW: '1' },
  { A: 1, B: -1, C: 2, D: 1 }
);
assert(
  'CASE6 B 胜 rawCmp=-3 ×2 → -6',
  c6.winningTeam === 'B' &&
    c6.baseTeamScore === -3 &&
    Number(c6.multiplier) === 2 &&
    c6.rewardedTeamScore === -6,
  JSON.stringify(c6)
);

console.log('done  passed=' + passed + '  failed=' + failed);
if (failed) process.exit(1);
