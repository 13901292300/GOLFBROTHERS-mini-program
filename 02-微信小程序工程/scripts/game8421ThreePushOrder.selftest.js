/**
 * 三人 8421：顶洞是否更换组合。
 * 运行：node scripts/game8421ThreePushOrder.selftest.js
 *
 * 关键：CASE2/3 within 缺字段或 no → keep；CASE8 tie+no 仍 rerank；
 * CASE10 非 PUSH 不冻结；CASE13 PUSH keep 后下一洞沿用身份。
 */
var fs = require('fs');
var path = require('path');

if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {}
  };
}

var utilsDir = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils');
var settle3 = require(path.join(utilsDir, 'settle8421Three.js'));
var threePush = require(path.join(utilsDir, 'gameplay8421ThreePushOrder.js'));
var holeOrder = require(path.join(utilsDir, 'resolveNextHoleOrder.js'));

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

function ruleOf(extra) {
  return Object.assign(
    {
      catalogId: '8421-3',
      pushRule: 'tie',
      meatEatMode: 'by-score',
      meatValueType: 'double',
      meatCap: 'none',
      meatRows: ['le-2', 'm1', 'par', 'p1', 'ge-2'].map(function (id) {
        return { id: id, value: '0' };
      }),
      baoNeg: 'none',
      deductMode: 'on',
      deductWay: 'plus-n',
      deductPlusN: '4',
      deductCap: 'cap',
      deductCapN: '2'
    },
    extra || {}
  );
}

function gameOf(ruleExtra, groupMode) {
  return {
    catalogId: '8421-3',
    players: [{ id: 'A', scoreCode: '8421' }, { id: 'B', scoreCode: '8421' }, { id: 'C', scoreCode: '8421' }],
    playerOrder: ['C', 'B', 'A'],
    groupMode: groupMode || 'random',
    rankId: 'gross-origin',
    multiplier: 1,
    holes: [
      { label: 'C1', on: true },
      { label: 'C2', on: true }
    ],
    ruleSnapshot: ruleOf(ruleExtra)
  };
}

function ctxOf(c1, c2) {
  return {
    holeOrder: ['C1', 'C2'],
    pars: { C1: 4, C2: 4 },
    scores: { C1: c1, C2: c2 || {} },
    windOn: false
  };
}

function sideOf(list, id) {
  var hit = (list || []).filter(function (row) {
    return row.playerId === id;
  })[0];
  return hit ? hit.side : '';
}

var settleSrc = fs.readFileSync(path.join(utilsDir, 'settle8421Three.js'), 'utf8');
assert(
  '未调用 pushPolicyFromReorderOnPush',
  settleSrc.indexOf('pushPolicyFromReorderOnPush') < 0
);

assert('policy tie → rerank', threePush.nextHolePushPolicy(ruleOf({ pushRule: 'tie' })) === 'rerank');
assert(
  'policy tie+no → rerank',
  threePush.nextHolePushPolicy(ruleOf({ pushRule: 'tie', reorderOnPush: 'no' })) === 'rerank'
);
assert(
  'policy within-1 missing → keep',
  threePush.nextHolePushPolicy(ruleOf({ pushRule: 'within-1' })) === 'keep-combination'
);
assert(
  'policy within-1 yes → rerank',
  threePush.nextHolePushPolicy(ruleOf({ pushRule: 'within-1', reorderOnPush: 'yes' })) === 'rerank'
);

var keepScores = { C: 2, B: 0, A: -1 };
var tieSwap = { C: 3, B: 0, A: -1 };
var nonPushSwap = { C: 1, B: -1, A: 0 };

var keepOut = settle3.settle(gameOf({ pushRule: 'within-1' }), ctxOf(keepScores));
assert(
  'CASE2 within-1 缺字段 PUSH keep',
  keepOut.orderByHole.C1.join(',') === 'C,B,A' && keepOut.orderByHole.C2.join(',') === 'C,B,A',
  String(keepOut.orderByHole.C2)
);

var keepNo = settle3.settle(gameOf({ pushRule: 'within-1', reorderOnPush: 'no' }), ctxOf(keepScores));
assert(
  'CASE3 within-1 no PUSH keep',
  keepNo.orderByHole.C2.join(',') === 'C,B,A',
  String(keepNo.orderByHole.C2)
);

var withinYes = settle3.settle(gameOf({ pushRule: 'within-1', reorderOnPush: 'yes' }), ctxOf(keepScores));
assert(
  'CASE4 within-1 yes PUSH rerank',
  withinYes.orderByHole.C2.join(',') === 'A,B,C',
  String(withinYes.orderByHole.C2)
);

var w2miss = settle3.settle(gameOf({ pushRule: 'within-2' }), ctxOf({ C: 2, B: 0, A: -1 }));
assert(
  'CASE5 within-2 缺字段 PUSH keep',
  w2miss.orderByHole.C2.join(',') === 'C,B,A',
  String(w2miss.orderByHole.C2)
);

var w2yes = settle3.settle(gameOf({ pushRule: 'within-2', reorderOnPush: 'yes' }), ctxOf({ C: 2, B: 0, A: -1 }));
assert(
  'CASE6 within-2 yes PUSH rerank',
  w2yes.orderByHole.C2.join(',') === 'A,B,C',
  String(w2yes.orderByHole.C2)
);

var garbage = settle3.settle(gameOf({ pushRule: 'within-1', reorderOnPush: 'legacy-keep' }), ctxOf(keepScores));
assert(
  'CASE7 within-1 异常值按不换组合',
  garbage.orderByHole.C2.join(',') === 'C,B,A',
  String(garbage.orderByHole.C2)
);

var tieNo = settle3.settle(gameOf({ pushRule: 'tie', reorderOnPush: 'no' }), ctxOf(tieSwap));
assert(
  'CASE8 tie + reorderOnPush=no 仍 rerank',
  tieNo.orderByHole.C2.join(',') === 'A,B,C',
  String(tieNo.orderByHole.C2)
);

var tieMiss = settle3.settle(gameOf({ pushRule: 'tie' }), ctxOf(tieSwap));
assert(
  'CASE1/9 tie 缺字段 PUSH rerank',
  tieMiss.orderByHole.C2.join(',') === 'A,B,C',
  String(tieMiss.orderByHole.C2)
);

var nonPush = settle3.settle(
  gameOf({ pushRule: 'within-1', reorderOnPush: 'no' }),
  ctxOf(nonPushSwap)
);
assert(
  'CASE10 非 PUSH + no 仍 rerank',
  nonPush.orderByHole.C2.join(',') === 'B,A,C',
  String(nonPush.orderByHole.C2)
);

var fixed = settle3.settle(
  gameOf({ pushRule: 'within-1', reorderOnPush: 'yes' }, 'fixed'),
  ctxOf(keepScores)
);
assert(
  'CASE11 固斗不受 reorderOnPush 影响',
  fixed.orderByHole.C2.join(',') === 'C,B,A',
  String(fixed.orderByHole.C2)
);

var noneRule = settle3.settle(gameOf({ pushRule: 'none', reorderOnPush: 'no' }), ctxOf(nonPushSwap));
assert(
  'CASE12 无顶洞仍 rerank',
  noneRule.orderByHole.C2.join(',') === 'B,A,C',
  String(noneRule.orderByHole.C2)
);

var c13 = settle3.settle(gameOf({ pushRule: 'within-2', reorderOnPush: 'no' }), ctxOf({ C: 2, B: 0, A: -1 }, { C: 1, B: -1, A: 0 }));
assert(
  'CASE13 PUSH keep 后下一洞仍用 C,B,A',
  c13.orderByHole.C1.join(',') === 'C,B,A' &&
    c13.orderByHole.C2.join(',') === 'C,B,A' &&
    sideOf(c13.assignmentsByHole.C2, 'B') === 'red' &&
    sideOf(c13.assignmentsByHole.C2, 'C') === 'blue' &&
    sideOf(c13.assignmentsByHole.C2, 'A') === 'blue',
  JSON.stringify({
    o1: c13.orderByHole.C1,
    o2: c13.orderByHole.C2,
    a: sideOf(c13.assignmentsByHole.C2, 'A'),
    b: sideOf(c13.assignmentsByHole.C2, 'B'),
    c: sideOf(c13.assignmentsByHole.C2, 'C')
  })
);

var savedWithin = { catalogId: '8421-3', reorderOnPush: 'yes', pushRule: 'tie' };
threePush.persistReorderOnPush(savedWithin, '8421-3', 'within-1', 'no');
assert('persist within 写入 no', savedWithin.reorderOnPush === 'no');

var savedTie = { catalogId: '8421-3', reorderOnPush: 'no', pushRule: 'tie' };
threePush.persistReorderOnPush(savedTie, '8421-3', 'tie', 'no');
assert('persist tie 删除 reorderOnPush', !Object.prototype.hasOwnProperty.call(savedTie, 'reorderOnPush'));

var lasuo = { catalogId: 'lasuo-4', reorderOnPush: 'yes' };
threePush.persistReorderOnPush(lasuo, 'lasuo-4', 'push', 'no');
assert('persist 不改其它玩法', lasuo.reorderOnPush === 'yes');

var four = { catalogId: '8421-4', reorderOnPush: 'no', pushRule: 'tie' };
threePush.persistReorderOnPush(four, '8421-4', 'tie', 'no');
assert('persist 四人 tie 删除 reorderOnPush', !Object.prototype.hasOwnProperty.call(four, 'reorderOnPush'));

assert(
  'UI 仅 within 显示',
  threePush.showReorderOnPushUi('8421-3', 'within-1') === true &&
    threePush.showReorderOnPushUi('8421-3', 'within-2') === true &&
    threePush.showReorderOnPushUi('8421-3', 'tie') === false &&
    threePush.showReorderOnPushUi('8421-3', 'none') === false &&
    threePush.showReorderOnPushUi('8421-4', 'tie') === false &&
    threePush.showReorderOnPushUi('8421-4', 'within-1') === true
);

var keepResolver = holeOrder.resolveNextHoleOrder({
  currentOrder: ['C', 'B', 'A'],
  holeScores: { C: { score: 1 }, B: { score: 4 }, A: { score: 8 } },
  rankingPolicy: 'dynamic',
  rankingRule: { rankId: 'gross-origin', metric: 'score' },
  pushPolicy: 'keep-combination',
  isPush: true,
  tieBreakContext: { history: [] }
});
assert('resolver keep 仅在 isPush', keepResolver.join(',') === 'C,B,A');

console.log('passed ' + passed + ' / failed ' + failed);
if (failed) process.exit(1);
