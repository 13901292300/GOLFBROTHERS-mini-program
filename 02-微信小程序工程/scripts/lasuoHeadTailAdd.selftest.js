/**
 * 头尾两点 · 加法：四人独立查表，按头/尾权重计入本队团队奖励，再做团队净差（零和）。
 * 乘法仍 combo 优先否则胜方相乘。
 * 运行：node scripts/lasuoHeadTailAdd.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
global.wx.getStorageSync = global.wx.getStorageSync || function () {
  return null;
};
global.wx.setStorageSync = global.wx.setStorageSync || function () {};
global.wx.showToast = function () {};

var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var ruleDefaults = require('../miniprogram/subpackages/game/utils/sideGameRuleDefaults.js');
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

function addRows(over) {
  over = over || {};
  return [
    { id: 'hio', value: String(over.hio != null ? over.hio : 10) },
    { id: 'm2', value: String(over.m2 != null ? over.m2 : 3) },
    { id: 'm1', value: String(over.m1 != null ? over.m1 : 1) },
    { id: 'par', value: String(over.par != null ? over.par : 0) },
    { id: 'p1', value: String(over.p1 != null ? over.p1 : 0) },
    { id: 'ge2', value: String(over.ge2 != null ? over.ge2 : 0) }
  ];
}

function comboRows(over) {
  over = over || {};
  return [
    { id: 'm2-m2', value: String(over['m2-m2'] != null ? over['m2-m2'] : 25) },
    { id: 'm2-m1', value: String(over['m2-m1'] != null ? over['m2-m1'] : 10) },
    { id: 'm1-m1', value: String(over['m1-m1'] != null ? over['m1-m1'] : 4) }
  ];
}

function mulRows(over) {
  over = over || {};
  return [
    { id: 'hio', value: String(over.hio != null ? over.hio : 10) },
    { id: 'm2', value: String(over.m2 != null ? over.m2 : 5) },
    { id: 'm1', value: String(over.m1 != null ? over.m1 : 2) },
    { id: 'par', value: String(over.par != null ? over.par : 1) },
    { id: 'p1', value: String(over.p1 != null ? over.p1 : 1) },
    { id: 'ge2', value: String(over.ge2 != null ? over.ge2 : 1) }
  ];
}

function headTail(extra) {
  return Object.assign(ruleDefaults.applyLasuoHeadTailTwoPointDefaults({}), extra || {});
}

function gameOf(rule) {
  return {
    catalogId: 'lasuo-4',
    groupMode: 'random',
    rankId: 'gross-origin',
    playerOrder: ['A', 'B', 'C', 'D'],
    players: ['A', 'B', 'C', 'D'].map(function (id) {
      return { id: id };
    }),
    multiplier: 1,
    holes: [
      { label: 'A1', on: true },
      { label: 'A2', on: true }
    ],
    ruleSnapshot: rule
  };
}

function settle(rule, holeRels) {
  return settleLasuo4.settle(gameOf(rule), {
    scores: { A1: holeRels },
    holeOrder: ['A1', 'A2'],
    pars: { A1: 4, A2: 4 }
  });
}

function p(out) {
  return out.holeDebug.A1.personalScores;
}

function sum4(out) {
  var s = p(out);
  return Number(s.A) + Number(s.B) + Number(s.C) + Number(s.D);
}

var bothBirdie = settle(
  headTail({ reward: 'add', addRows: addRows(), pushRule: 'none', baoMode: 'none' }),
  { A: -1, B: -1, C: 0, D: 0 }
);
assert(
  'CASE1 双方鸟+PAR：查表仍记个人触发值，积分走团队净差（和为 0）',
  catalog.isLasuoHeadTailTwoPoint(headTail()) === true &&
    bothBirdie.holeDebug.A1.baseTeamScore === 0 &&
    bothBirdie.holeDebug.A1.addByPlayer.A === 1 &&
    bothBirdie.holeDebug.A1.addByPlayer.B === 1 &&
    bothBirdie.holeDebug.A1.addByPlayer.C === 0 &&
    bothBirdie.holeDebug.A1.addByPlayer.D === 0 &&
    bothBirdie.holeDebug.A1.addRewardA === 1 &&
    bothBirdie.holeDebug.A1.addRewardB === 1 &&
    bothBirdie.holeDebug.A1.rewardedTeamScore === 0 &&
    p(bothBirdie).A === 0 &&
    p(bothBirdie).B === 0 &&
    p(bothBirdie).C === 0 &&
    p(bothBirdie).D === 0 &&
    sum4(bothBirdie) === 0,
  JSON.stringify(bothBirdie.holeDebug.A1)
);

var loseEagle = settle(
  headTail({ reward: 'add', addRows: addRows(), pushRule: 'none', baoMode: 'none' }),
  { A: 0, B: -2, C: 0, D: 0 }
);
assert(
  'CASE2 负方老鹰计入红队团队奖励，同队两人同分且四人零和',
  loseEagle.holeDebug.A1.addByPlayer.B === 3 &&
    p(loseEagle).B === p(loseEagle).C &&
    p(loseEagle).A === p(loseEagle).D &&
    p(loseEagle).B === -p(loseEagle).A &&
    sum4(loseEagle) === 0 &&
    loseEagle.holeDebug.A1.baseTeamScore !== 0,
  JSON.stringify(loseEagle.holeDebug.A1)
);

var fourBands = settle(
  headTail({ reward: 'add', addRows: addRows(), pushRule: 'none', baoMode: 'none' }),
  { A: -3, B: -2, C: -1, D: 0 }
);
assert(
  'CASE3 四人不同档全部独立查表',
  fourBands.holeDebug.A1.addByPlayer.A === 10 &&
    fourBands.holeDebug.A1.addByPlayer.B === 3 &&
    fourBands.holeDebug.A1.addByPlayer.C === 1 &&
    fourBands.holeDebug.A1.addByPlayer.D === 0,
  JSON.stringify(fourBands.holeDebug.A1)
);

var zeroBand = settle(
  headTail({ reward: 'add', addRows: addRows({ par: 0, m1: 1 }), pushRule: 'none', baoMode: 'none' }),
  { A: 0, B: 0, C: 0, D: 0 }
);
assert(
  'CASE4 档位配置为 0 直接得 0',
  zeroBand.holeDebug.A1.addByPlayer.A === 0 &&
    zeroBand.holeDebug.A1.addByPlayer.B === 0 &&
    p(zeroBand).A === 0,
  JSON.stringify(zeroBand.holeDebug.A1)
);

var custom = settle(
  headTail({ reward: 'add', addRows: addRows({ m1: 7, m2: 9 }), pushRule: 'none', baoMode: 'none' }),
  { A: -1, B: -2, C: -1, D: -1 }
);
assert(
  'CASE5 自定义加分表四人分别按新值',
  custom.holeDebug.A1.addByPlayer.A === 7 &&
    custom.holeDebug.A1.addByPlayer.B === 9 &&
    custom.holeDebug.A1.addByPlayer.C === 7 &&
    custom.holeDebug.A1.addByPlayer.D === 7,
  JSON.stringify(custom.holeDebug.A1)
);

var mixed = settle(
  headTail({ reward: 'add', addRows: addRows(), pushRule: 'none', baoMode: 'none' }),
  { A: -1, B: -2, C: 0, D: 0 }
);
var mixedDiff = mixed.holeDebug.A1.baseTeamScore + mixed.holeDebug.A1.addRewardA - mixed.holeDebug.A1.addRewardB;
assert(
  'CASE6 蓝红奖励进入团队净差，不是个人凭空加分',
  mixed.holeDebug.A1.baseTeamScore === -1 &&
    mixed.holeDebug.A1.addByPlayer.A === 1 &&
    mixed.holeDebug.A1.addByPlayer.B === 3 &&
    mixed.holeDebug.A1.rewardedTeamScore === mixedDiff &&
    p(mixed).A === mixed.holeDebug.A1.finalTeamScore &&
    p(mixed).D === mixed.holeDebug.A1.finalTeamScore &&
    p(mixed).B === -mixed.holeDebug.A1.finalTeamScore &&
    p(mixed).C === -mixed.holeDebug.A1.finalTeamScore &&
    sum4(mixed) === 0,
  JSON.stringify(mixed.holeDebug.A1)
);

var mulCombo = settle(
  headTail({
    reward: 'mul',
    mulRows: mulRows(),
    comboMulRows: comboRows({ 'm1-m1': 5 }),
    pushRule: 'none',
    baoMode: 'none'
  }),
  { A: -1, B: 0, C: 2, D: -1 }
);
var mulProduct = settle(
  headTail({ reward: 'mul', mulRows: mulRows({ m2: 5, m1: 2 }), pushRule: 'none', baoMode: 'none' }),
  { A: -2, B: 0, C: 2, D: -1 }
);
assert(
  'CASE7 乘法 combo 优先，否则胜方 personalA * personalB',
  mulCombo.holeDebug.A1.winningTeam === 'A' &&
    mulCombo.holeDebug.A1.multiplierSource === 'm1-m1' &&
    Number(mulCombo.holeDebug.A1.multiplier) === 5 &&
    mulProduct.holeDebug.A1.multiplierSource === 'personal-product' &&
    Number(mulProduct.holeDebug.A1.multiplier) === 10,
  JSON.stringify({ combo: mulCombo.holeDebug.A1, product: mulProduct.holeDebug.A1 })
);

var threeAdd = settle(
  Object.assign(ruleDefaults.applyLasuoThreePointDefaults({}), {
    reward: 'add',
    addPre: 'win',
    addRows: addRows(),
    pushRule: 'none',
    baoMode: 'none'
  }),
  { A: -1, B: -2, C: -2, D: 0 }
);
assert(
  'CASE8 拉丝三点加法仍走原 addPre/队奖励，不是四人先奖',
  catalog.isLasuoThreePoint(ruleDefaults.applyLasuoThreePointDefaults({})) === true &&
    threeAdd.holeDebug.A1.addByPlayer == null &&
    threeAdd.holeDebug.A1.rewardedTeamScore ===
      threeAdd.holeDebug.A1.baseTeamScore +
        threeAdd.holeDebug.A1.addRewardA -
        threeAdd.holeDebug.A1.addRewardB,
  JSON.stringify(threeAdd.holeDebug.A1)
);

var bestMul = settle(
  Object.assign(ruleDefaults.applyLasuoBestPointDefaults({}), {
    reward: 'mul',
    mulRows: mulRows({ p1: 9 }),
    comboMulRows: comboRows({ 'm1-m1': 99 }),
    pushRule: 'none',
    baoMode: 'none'
  }),
  { A: -1, B: 0, C: 2, D: 1 }
);
assert(
  'CASE8b 最好成绩一点乘法仍不走 combo',
  bestMul.holeDebug.A1.multiplierSource === 'personal' &&
    Number(bestMul.holeDebug.A1.multiplier) === 9,
  JSON.stringify(bestMul.holeDebug.A1)
);

console.log('---');
console.log(failed ? 'FAILED ' + failed + ' / ' + (passed + failed) : 'OK ' + passed);
process.exit(failed ? 1 : 0);
