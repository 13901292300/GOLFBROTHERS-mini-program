/**
 * 拉丝较差一点：乘法 = rawCmp × worse-slot personalMul；不 combo、不 max 搭档。
 * 运行：node scripts/lasuoWorstOneMul.selftest.js
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

function gameOf(extraRule, players) {
  extraRule = extraRule || {};
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
    ruleSnapshot: Object.assign(
      {
        pkBetter: false,
        pkWorse: true,
        pkTotal: false,
        pkWorseW: '1',
        reward: 'mul',
        mulRows: mulRows(),
        comboMulRows: comboRows(),
        pushRule: 'none',
        baoMode: 'none'
      },
      extraRule
    )
  };
}

function settle(hole, players, extraRule) {
  return settleLasuo4.settle(gameOf(extraRule, players), {
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
  'source: resolveWorstPersonalMultiplier 存在且 worst-one 早退',
  /function resolveWorstPersonalMultiplier/.test(src) &&
    /return resolveWorstPersonalMultiplier/.test(src) &&
    /pickSlotPlayer\(rec, winTeam, true\)/.test(src)
);

var c1 = settle({ A: -2, B: 3, C: 4, D: 2 });
assert(
  'CASE1 胜方 -2 / +2，worse-slot=+2 → ×1，搭档鹰不抬倍',
  c1.winningTeam === 'A' &&
    Number(c1.multiplier) === 1 &&
    c1.multiplierSource === 'worst' &&
    Number(c1.multiplier) !== 5,
  JSON.stringify(c1)
);

var c2 = settle({ A: -3, B: 2, C: 3, D: 1 });
assert(
  'CASE2 胜方 -3 / +1，worse-slot=+1 → ×1，不能 ×10',
  c2.winningTeam === 'A' &&
    Number(c2.multiplier) === 1 &&
    c2.multiplierSource === 'worst',
  JSON.stringify(c2)
);

var c3 = settle(
  { A: -2, B: 1, C: 2, D: 0 },
  [
    { id: 'A', hcapPar4: 10 },
    { id: 'B' },
    { id: 'C' },
    { id: 'D' }
  ]
);
assert(
  'CASE3 net 选出 worse-slot gross=0，搭档 -2 不能抬到 ×5',
  c3.winningTeam === 'A' &&
    Number(c3.multiplier) === 1,
  JSON.stringify(c3)
);

var c4 = settle({ A: -1, B: 1, C: 1, D: -1 });
assert(
  'CASE4 双 -1 即使 combo m1-m1=4 → ×2',
  c4.winningTeam === 'A' &&
    Number(c4.multiplier) === 2 &&
    c4.multiplierSource === 'worst' &&
    c4.multiplierSource !== 'm1-m1',
  JSON.stringify(c4)
);

var c5 = settle({ A: 0, B: -3, C: 5, D: 1 });
assert(
  'CASE5 A 赢，负方 rel=-3 的 ×10 舍弃',
  c5.winningTeam === 'A' &&
    Number(c5.multiplier) === 1,
  JSON.stringify(c5)
);

var c6 = settle({ A: 2, B: -1, C: -1, D: 2 }, null, { pkWorseW: '3' });
assert(
  'CASE6 B 赢 worse-slot=-1 ×2，rawCmp=-3 → -6',
  c6.winningTeam === 'B' &&
    c6.baseTeamScore === -3 &&
    Number(c6.multiplier) === 2 &&
    c6.rewardedTeamScore === -6,
  JSON.stringify(c6)
);

console.log('done  passed=' + passed + '  failed=' + failed);
if (failed) process.exit(1);
