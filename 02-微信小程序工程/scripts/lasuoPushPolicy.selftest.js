/**
 * 拉丝 PUSH 后下一洞排序：best/worst 读 reorderOnPush；三点及其余 rerank。
 * 运行：node scripts/lasuoPushPolicy.selftest.js
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

function gameOf(rule, extra) {
  extra = extra || {};
  return {
    catalogId: 'lasuo-4',
    groupMode: extra.groupMode || 'random',
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

function settle(rule, holeRels, extra) {
  return settleLasuo4.settle(gameOf(rule, extra), {
    scores: { A1: holeRels },
    holeOrder: ['A1', 'A2'],
    pars: { A1: 4, A2: 4 }
  });
}

function shape(extra) {
  return Object.assign(
    {
      pkBetter: true,
      pkWorse: true,
      pkTotal: true,
      pkBetterW: '1',
      pkWorseW: '1',
      pkTotalW: '1',
      pkTotalMode: 'sum',
      reward: 'none',
      pushRule: 'push'
    },
    extra || {}
  );
}

var src = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/utils/settleLasuo4.js'),
  'utf8'
);
assert(
  'source: nextPushPolicy 且 nextOrder 使用它',
  /function nextPushPolicy/.test(src) &&
    /pushPolicy:\s*nextPushPolicy\(game\)/.test(src) &&
    /pushPolicyFromReorderOnPush/.test(src)
);

var THREE_PUSH = { A: 5, B: 4, C: 6, D: 5 };
var BEST_PUSH = { A: 5, B: 4, C: 5, D: 4 };
var WIN = { A: 6, B: 3, C: 4, D: 7 };
var ORIGIN = ['A', 'B', 'C', 'D'];
var THREE_NEXT = ['B', 'A', 'D', 'C'];

var c1 = settle(
  shape({
    pkBetter: true,
    pkWorse: true,
    pkTotal: true,
    reorderOnPush: 'no'
  }),
  THREE_PUSH
);
assert(
  'CASE1 三点 PUSH 强制 rerank，忽略 legacy reorderOnPush=no',
  c1.holeDebug.A1.finalTeamScore === 0 &&
    JSON.stringify(c1.orderByHole.A1) === JSON.stringify(ORIGIN) &&
    JSON.stringify(c1.orderByHole.A2) === JSON.stringify(THREE_NEXT),
  JSON.stringify(c1.orderByHole)
);

var bestYes = settle(
  shape({
    pkBetter: true,
    pkWorse: false,
    pkTotal: false,
    reorderOnPush: 'yes'
  }),
  BEST_PUSH
);
assert(
  'CASE2 best-one PUSH reorderOnPush=yes → rerank',
  bestYes.holeDebug.A1.finalTeamScore === 0 &&
    JSON.stringify(bestYes.orderByHole.A2) !== JSON.stringify(ORIGIN),
  JSON.stringify(bestYes.orderByHole)
);

var bestNo = settle(
  shape({
    pkBetter: true,
    pkWorse: false,
    pkTotal: false,
    reorderOnPush: 'no'
  }),
  BEST_PUSH
);
assert(
  'CASE3 best-one PUSH reorderOnPush=no → keep currentOrder',
  bestNo.holeDebug.A1.finalTeamScore === 0 &&
    JSON.stringify(bestNo.orderByHole.A2) === JSON.stringify(ORIGIN),
  JSON.stringify(bestNo.orderByHole)
);

var worstYes = settle(
  shape({
    pkBetter: false,
    pkWorse: true,
    pkTotal: false,
    reorderOnPush: 'yes'
  }),
  BEST_PUSH
);
var worstNo = settle(
  shape({
    pkBetter: false,
    pkWorse: true,
    pkTotal: false,
    reorderOnPush: 'no'
  }),
  BEST_PUSH
);
assert(
  'CASE4 worst-one PUSH yes rerank / no keep',
  worstYes.holeDebug.A1.finalTeamScore === 0 &&
    JSON.stringify(worstYes.orderByHole.A2) !== JSON.stringify(ORIGIN) &&
    worstNo.holeDebug.A1.finalTeamScore === 0 &&
    JSON.stringify(worstNo.orderByHole.A2) === JSON.stringify(ORIGIN),
  JSON.stringify({ yes: worstYes.orderByHole, no: worstNo.orderByHole })
);

var headTail = settle(
  shape({
    pkBetter: true,
    pkWorse: true,
    pkTotal: false,
    reorderOnPush: 'no'
  }),
  THREE_PUSH
);
assert(
  'CASE5 头尾 PUSH → rerank',
  headTail.holeDebug.A1.finalTeamScore === 0 &&
    JSON.stringify(headTail.orderByHole.A2) === JSON.stringify(THREE_NEXT),
  JSON.stringify(headTail.orderByHole)
);

var HT_PUSH = { A: 5, B: 5, C: 4, D: 4 };
var headTotal = settle(
  shape({
    pkBetter: true,
    pkWorse: false,
    pkTotal: true,
    reorderOnPush: 'no'
  }),
  HT_PUSH
);
assert(
  'CASE6 头总 PUSH → rerank',
  headTotal.holeDebug.A1.finalTeamScore === 0 &&
    JSON.stringify(headTotal.orderByHole.A2) !== JSON.stringify(ORIGIN),
  JSON.stringify(headTotal.orderByHole)
);

var totalOne = settle(
  shape({
    pkBetter: false,
    pkWorse: false,
    pkTotal: true,
    reorderOnPush: 'no'
  }),
  THREE_PUSH
);
assert(
  'CASE7 总成绩一点 PUSH → rerank',
  totalOne.holeDebug.A1.finalTeamScore === 0 &&
    JSON.stringify(totalOne.orderByHole.A2) === JSON.stringify(THREE_NEXT),
  JSON.stringify(totalOne.orderByHole)
);

var fixedPush = settle(
  shape({
    pkBetter: true,
    pkWorse: true,
    pkTotal: true,
    reorderOnPush: 'yes'
  }),
  THREE_PUSH,
  { groupMode: 'fixed' }
);
assert(
  'CASE8 fixed + PUSH → currentOrder 不变',
  JSON.stringify(fixedPush.orderByHole.A1) === JSON.stringify(ORIGIN) &&
    JSON.stringify(fixedPush.orderByHole.A2) === JSON.stringify(ORIGIN),
  JSON.stringify(fixedPush.orderByHole)
);

var bestWinKeep = settle(
  shape({
    pkBetter: true,
    pkWorse: false,
    pkTotal: false,
    reorderOnPush: 'no'
  }),
  WIN
);
assert(
  'CASE9 best-one reorderOnPush=no 非 PUSH 仍 rerank',
  bestWinKeep.holeDebug.A1.finalTeamScore !== 0 &&
    JSON.stringify(bestWinKeep.orderByHole.A2) !== JSON.stringify(ORIGIN),
  JSON.stringify(bestWinKeep.orderByHole)
);

console.log('done  passed=' + passed + '  failed=' + failed);
if (failed) process.exit(1);
