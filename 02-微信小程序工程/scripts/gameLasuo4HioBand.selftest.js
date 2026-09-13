/**
 * Lasuo4：gross=1 一律 hio 档（不按数学 diff）。
 * 运行：node scripts/gameLasuo4HioBand.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
global.wx.getStorageSync = global.wx.getStorageSync || function () { return null; };
global.wx.setStorageSync = global.wx.setStorageSync || function () {};
global.wx.showToast = function () {};

var settleLasuo4 = require('../miniprogram/subpackages/game/utils/settleLasuo4.js');
var settleStroke2 = require('../miniprogram/subpackages/game/utils/settleStroke2.js');

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

function bands(m1, m2, hio) {
  return [
    { id: 'hio', value: String(hio == null ? 10 : hio) },
    { id: 'm2', value: String(m2 == null ? 4 : m2) },
    { id: 'm1', value: String(m1) },
    { id: 'par', value: '0' },
    { id: 'p1', value: '0' },
    { id: 'ge2', value: '0' }
  ];
}

function mulBands(m1, m2, hio) {
  return [
    { id: 'hio', value: String(hio == null ? 10 : hio) },
    { id: 'm2', value: String(m2 == null ? 5 : m2) },
    { id: 'm1', value: String(m1) },
    { id: 'par', value: '1' },
    { id: 'p1', value: '1' },
    { id: 'ge2', value: '1' }
  ];
}

function combos(a, b, c) {
  return [
    { id: 'm2-m2', value: String(a) },
    { id: 'm2-m1', value: String(b) },
    { id: 'm1-m1', value: String(c) }
  ];
}

function betterOnly(extra) {
  return Object.assign(
    {
      pkBetter: true,
      pkWorse: false,
      pkTotal: false,
      pkBetterW: '1',
      pkWorseW: '1',
      pkTotalW: '1',
      addPre: 'win',
      pushRule: 'none',
      baoMode: 'none'
    },
    extra || {}
  );
}

function gameOf(extra) {
  extra = extra || {};
  return {
    catalogId: 'lasuo-4',
    groupMode: extra.groupMode || 'fixed',
    playerOrder: extra.order || ['A', 'D', 'B', 'C'],
    players: ['A', 'B', 'C', 'D'].map(function (id) {
      return { id: id };
    }),
    multiplier: extra.k == null ? 1 : extra.k,
    holes: extra.holes || [{ label: 'A1', on: true }],
    ruleSnapshot: extra.ruleSnapshot || extra.rule
  };
}

function ctxOf(rels, par) {
  return {
    scores: { A1: rels },
    holeOrder: ['A1'],
    pars: { A1: par }
  };
}

function ledger(out) {
  return out.byHole && out.byHole.A1;
}

assert('CASE1 helper PAR3 gross=1 → hio 不得 m2', settleLasuo4.resolveLasuo4Band({ gross: 1, par: 3, rel: -2 }) === 'hio');
assert('CASE1 共享 scoreBand(-2) 仍为 m2', settleStroke2.scoreBand(-2) === 'm2');

assert('CASE2 PAR4 gross=1 → hio', settleLasuo4.resolveLasuo4Band({ gross: 1, par: 4, rel: -3 }) === 'hio');
assert('CASE3 PAR5 gross=1 → hio', settleLasuo4.resolveLasuo4Band({ gross: 1, par: 5, rel: -4 }) === 'hio');

assert(
  'CASE4 PAR3 gross=2 原档 m1 不得强制 hio',
  settleLasuo4.resolveLasuo4Band({ gross: 2, par: 3, rel: -1 }) === 'm1' &&
    settleLasuo4.resolveLasuo4Band({ gross: 2, par: 3, rel: -1 }) === settleStroke2.scoreBand(-1)
);

assert(
  'CASE5 PAR5 gross=2 diff=-3 仍走 <=-3 档',
  settleLasuo4.resolveLasuo4Band({ gross: 2, par: 5, rel: -3 }) === 'hio' &&
    settleStroke2.scoreBand(-3) === 'hio'
);

assert(
  'gross 可由 rel+par 判定',
  settleLasuo4.resolveLasuo4Band({ rel: -2, par: 3 }) === 'hio'
);

var addHio = settleLasuo4.settle(
  gameOf({
    rule: betterOnly({
      reward: 'add',
      addRows: bands(1, 3, 17)
    })
  }),
  ctxOf({ A: -2, B: 0, C: 1, D: 0 }, 3)
);
assert(
  'CASE6 add 自定义 hio=17 PAR3 HIO 用 17 不是 10',
  addHio.holeDebug.A1.addRewardA === 17 && ledger(addHio).A === 18,
  JSON.stringify({ add: addHio.holeDebug.A1.addRewardA, A: ledger(addHio).A })
);

var mulHio = settleLasuo4.settle(
  gameOf({
    rule: betterOnly({
      reward: 'mul',
      mulRows: mulBands(2, 5, 13),
      comboMulRows: []
    })
  }),
  ctxOf({ A: -2, B: 0, C: 1, D: 0 }, 3)
);
assert(
  'CASE7 mul 自定义 hio×13 PAR3 HIO 用 13 不是 10',
  mulHio.holeDebug.A1.multiplier === 13 && ledger(mulHio).A === 13,
  JSON.stringify({ m: mulHio.holeDebug.A1.multiplier, A: ledger(mulHio).A })
);

var oldSnap = {
  pkBetter: true,
  pkWorse: false,
  pkTotal: false,
  pkBetterW: '1',
  reward: 'add',
  addPre: 'win',
  addRows: bands(1, 3, 19),
  mulRows: mulBands(2, 5, 21),
  comboMulRows: combos(25, 10, 4),
  pushRule: 'none',
  baoMode: 'none'
};
var oldInst = settleLasuo4.settle(gameOf({ ruleSnapshot: oldSnap }), ctxOf({ A: -2, B: 0, C: 1, D: 0 }, 3));
assert(
  'CASE8 旧实例 snapshot 自定义 hio=19 仍用 19',
  oldInst.holeDebug.A1.addRewardA === 19,
  JSON.stringify(oldInst.holeDebug.A1)
);

var eagle = settleLasuo4.settle(
  gameOf({
    rule: betterOnly({
      reward: 'add',
      addRows: bands(1, 3, 10)
    })
  }),
  ctxOf({ A: -2, B: 0, C: 1, D: 0 }, 4)
);
assert(
  'CASE9 非 HIO eagle（PAR4 -2）仍走 m2=3 不回归成 hio=10',
  eagle.holeDebug.A1.addRewardA === 3 && settleLasuo4.resolveLasuo4Band({ rel: -2, par: 4 }) === 'm2',
  JSON.stringify({ add: eagle.holeDebug.A1.addRewardA })
);

var combo = settleLasuo4.settle(
  gameOf({
    rule: {
      pkBetter: true,
      pkWorse: true,
      pkTotal: true,
      pkBetterW: '1',
      pkWorseW: '1',
      pkTotalW: '1',
      reward: 'mul',
      comboMulRows: combos(25, 10, 4),
      mulRows: mulBands(2, 5, 10)
    }
  }),
  ctxOf({ A: -2, B: 0, C: 2, D: -2 }, 4)
);
assert(
  'CASE10 组合 m2-m2 不因 HIO band 修复被破坏',
  combo.holeDebug.A1.multiplierSource === 'm2-m2' && combo.holeDebug.A1.multiplier === 25,
  JSON.stringify(combo.holeDebug.A1)
);

assert(
  '未接入 specialResult / Infinity',
  addHio.holeDebug.A1.specialResult == null &&
    ledger(addHio).A !== Infinity &&
    JSON.stringify(addHio).indexOf('specialResult') < 0
);

console.log('\ngameLasuo4HioBand.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
