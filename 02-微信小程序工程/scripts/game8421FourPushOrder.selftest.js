/**
 * 四人 8421：顶洞是否重新排序。
 * 运行：node scripts/game8421FourPushOrder.selftest.js
 *
 * tie 忽略遗留 reorderOnPush；within-1/2 仅显式 yes 才 rerank；
 * 非 PUSH / 固拉不受该开关冻结；高手不见面仍走 split-high。
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
var pagesDir = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'pages', 'edit-rule');
var settle4 = require(path.join(utilsDir, 'settle8421Four.js'));
var pushOrder = require(path.join(utilsDir, 'gameplay8421ThreePushOrder.js'));
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
      catalogId: '8421-4',
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
    catalogId: '8421-4',
    players: [
      { id: 'A', scoreCode: '8421' },
      { id: 'B', scoreCode: '8421' },
      { id: 'C', scoreCode: '8421' },
      { id: 'D', scoreCode: '8421' }
    ],
    playerOrder: ['C', 'D', 'B', 'A'],
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

function pairKey(a, b) {
  return [a, b].slice().sort().join('+');
}

function comboKey(order, mode) {
  var sides;
  if (mode === 'fixed') {
    sides = [
      pairKey(order[0], order[1]),
      pairKey(order[2], order[3])
    ];
  } else {
    sides = [
      pairKey(order[0], order[3]),
      pairKey(order[1], order[2])
    ];
  }
  return sides.slice().sort().join('|');
}

var settleSrc = fs.readFileSync(path.join(utilsDir, 'settle8421Four.js'), 'utf8');
assert(
  '未调用 pushPolicyFromReorderOnPush',
  settleSrc.indexOf('pushPolicyFromReorderOnPush') < 0 &&
    settleSrc.indexOf('nextHolePushPolicy') >= 0
);

var editJs = fs.readFileSync(path.join(pagesDir, 'index.js'), 'utf8');
var editWxml = fs.readFileSync(path.join(pagesDir, 'index.wxml'), 'utf8');
assert(
  'CASE1 tie 不显示 reorder option',
  pushOrder.showReorderOnPushUi('8421-4', 'tie') === false &&
    pushOrder.showReorderOnPushUi('8421-4', 'none') === false
);
assert(
  'CASE2 within-1 UI 显示且默认 no',
  pushOrder.showReorderOnPushUi('8421-4', 'within-1') === true &&
    pushOrder.nextHolePushPolicy(ruleOf({ pushRule: 'within-1' })) === 'keep-combination'
);
assert(
  'CASE3 within-2 UI 显示且默认 no',
  pushOrder.showReorderOnPushUi('8421-4', 'within-2') === true &&
    pushOrder.nextHolePushPolicy(ruleOf({ pushRule: 'within-2' })) === 'keep-combination'
);
assert(
  '四人文案为顶洞是否重新排序，三人文案未改成该句',
  editWxml.indexOf('is8421FourRule ? "顶洞是否重新排序"') >= 0 &&
    editWxml.indexOf('顶洞是否更换组合') >= 0 &&
    editJs.indexOf('is8421FourRule') >= 0
);

/* 乱拉 A,B,C,D → A+D vs B+C。A=0(4), B=-1(8), C=+2(1), D=0(4) → 8 vs 9，分差 1。 */
var withinScores = { A: 0, B: -1, C: 2, D: 0 };

assert(
  'policy tie+legacy no → rerank',
  pushOrder.nextHolePushPolicy(ruleOf({ pushRule: 'tie', reorderOnPush: 'no' })) === 'rerank'
);

var withinGameNo = gameOf({ pushRule: 'within-1', reorderOnPush: 'no' });
withinGameNo.playerOrder = ['A', 'B', 'C', 'D'];
var keepNo = settle4.settle(withinGameNo, ctxOf(withinScores));
assert(
  'CASE4 within-1 PUSH + no 保持组合',
  keepNo.orderByHole.C1.join(',') === 'A,B,C,D' &&
    keepNo.orderByHole.C2.join(',') === 'A,B,C,D' &&
    comboKey(keepNo.orderByHole.C2, 'random') === comboKey(['A', 'B', 'C', 'D'], 'random'),
  String(keepNo.orderByHole.C2)
);

var withinGameYes = gameOf({ pushRule: 'within-1', reorderOnPush: 'yes' });
withinGameYes.playerOrder = ['A', 'B', 'C', 'D'];
var withinYes = settle4.settle(withinGameYes, ctxOf(withinScores));
assert(
  'CASE5 within-1 PUSH + yes rerank',
  withinYes.orderByHole.C2.join(',') === 'B,A,D,C',
  String(withinYes.orderByHole.C2)
);

var w2noGame = gameOf({ pushRule: 'within-2', reorderOnPush: 'no' });
w2noGame.playerOrder = ['A', 'B', 'C', 'D'];
var w2no = settle4.settle(w2noGame, ctxOf(withinScores));
assert(
  'CASE6 within-2 PUSH + no 保持',
  w2no.orderByHole.C2.join(',') === 'A,B,C,D',
  String(w2no.orderByHole.C2)
);

var w2yesGame = gameOf({ pushRule: 'within-2', reorderOnPush: 'yes' });
w2yesGame.playerOrder = ['A', 'B', 'C', 'D'];
var w2yes = settle4.settle(w2yesGame, ctxOf(withinScores));
assert(
  'CASE7 within-2 PUSH + yes rerank',
  w2yes.orderByHole.C2.join(',') === 'B,A,D,C',
  String(w2yes.orderByHole.C2)
);

var farGame = gameOf({ pushRule: 'within-2', reorderOnPush: 'no' });
farGame.playerOrder = ['D', 'C', 'B', 'A'];
var farOut = settle4.settle(farGame, ctxOf({ D: 0, C: 0, B: 0, A: -2 }));
assert(
  'CASE8 非 PUSH + no 仍 rerank',
  farOut.orderByHole.C2.join(',') === 'A,D,C,B',
  String(farOut.orderByHole.C2)
);

var tieGame = gameOf({ pushRule: 'tie', reorderOnPush: 'no' });
tieGame.playerOrder = ['A', 'B', 'C', 'D'];
/* A=0, B=-1, C=0, D=-1 teams A+D=4+8=12, B+C=8+4=12 tie
 * rerank: B, D, A, C (B and D both -1, B before D in original? original A,B,C,D → B then D; A then C)
 */
var tieOut = settle4.settle(tieGame, ctxOf({ A: 0, B: -1, C: 0, D: -1 }));
assert(
  'CASE9b tie + legacy no 按杆数 rerank',
  tieOut.orderByHole.C2.join(',') === 'B,D,A,C',
  String(tieOut.orderByHole.C2)
);

var fixedGame = gameOf({ pushRule: 'within-1', reorderOnPush: 'yes' }, 'fixed');
fixedGame.playerOrder = ['A', 'B', 'C', 'D'];
var fixed = settle4.settle(fixedGame, ctxOf(withinScores));
assert(
  'CASE10 固拉 + yes 仍固定',
  fixed.orderByHole.C2.join(',') === 'A,B,C,D' &&
    comboKey(fixed.orderByHole.C2, 'fixed') === comboKey(['A', 'B', 'C', 'D'], 'fixed'),
  String(fixed.orderByHole.C2)
);

var savedYes = { catalogId: '8421-4', pushRule: 'within-1' };
pushOrder.persistReorderOnPush(savedYes, '8421-4', 'within-1', 'yes');
assert('CASE11 保存 yes', savedYes.reorderOnPush === 'yes');
assert(
  'CASE11 reopen yes',
  (savedYes.reorderOnPush === 'yes' ? 'yes' : 'no') === 'yes'
);

var savedNo = { catalogId: '8421-4', pushRule: 'within-1' };
pushOrder.persistReorderOnPush(savedNo, '8421-4', 'within-1', 'no');
assert('CASE12 保存 no → reopen no', savedNo.reorderOnPush === 'no');

var savedTie = { catalogId: '8421-4', reorderOnPush: 'no', pushRule: 'within-1' };
pushOrder.persistReorderOnPush(savedTie, '8421-4', 'tie', 'no');
assert(
  'CASE13 改回 tie 删除字段且 UI 隐藏',
  !Object.prototype.hasOwnProperty.call(savedTie, 'reorderOnPush') &&
    pushOrder.showReorderOnPushUi('8421-4', 'tie') === false
);
assert(
  'CASE13 旧 no 不改变 tie 正式 rerank',
  pushOrder.nextHolePushPolicy({ catalogId: '8421-4', pushRule: 'tie', reorderOnPush: 'no' }) === 'rerank' &&
    tieOut.orderByHole.C2.join(',') === 'B,D,A,C'
);

var splitKeep = gameOf({ pushRule: 'within-1', reorderOnPush: 'no' }, 'split-high');
splitKeep.playerOrder = ['A', 'B', 'C', 'D'];
var splitKeepOut = settle4.settle(splitKeep, ctxOf({ A: 0, B: -1, C: 2, D: 0 }));
assert(
  '高手不见面 PUSH no 保持高低分区',
  splitKeepOut.orderByHole.C2.join(',') === 'A,B,C,D',
  String(splitKeepOut.orderByHole.C2)
);

var splitYes = gameOf({ pushRule: 'within-1', reorderOnPush: 'yes' }, 'split-high');
splitYes.playerOrder = ['A', 'B', 'C', 'D'];
var splitYesOut = settle4.settle(splitYes, ctxOf({ A: 0, B: -1, C: 2, D: 0 }));
assert(
  '高手不见面 PUSH yes 仅区内重排',
  splitYesOut.orderByHole.C2.join(',') === 'B,A,D,C',
  String(splitYesOut.orderByHole.C2)
);

var keepResolver = holeOrder.resolveNextHoleOrder({
  currentOrder: ['C', 'D', 'B', 'A'],
  holeScores: {
    C: { rel: -1, score: 8 },
    D: { rel: 0, score: 4 },
    B: { rel: 0, score: 4 },
    A: { rel: 2, score: 1 }
  },
  rankingPolicy: 'dynamic',
  rankingRule: { rankId: 'gross-origin' },
  pushPolicy: 'keep-combination',
  isPush: true,
  tieBreakContext: { history: [] }
});
assert('resolver keep 仅在 isPush', keepResolver.join(',') === 'C,D,B,A');

console.log('passed ' + passed + ' / failed ' + failed);
if (failed) process.exit(1);
