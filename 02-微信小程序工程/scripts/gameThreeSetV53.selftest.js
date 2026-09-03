/**
 * 三局 V53 §4.1.4 结算回归（组合级有符号三段让杆）。
 * 运行：node scripts/gameThreeSetV53.selftest.js
 */
var settleThreeSet = require('../miniprogram/subpackages/game/utils/settleThreeSet.js');
var settle = require('../miniprogram/subpackages/game/utils/settle.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var fs = require('fs');
var path = require('path');

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

function nines(a, b) {
  var out = [];
  var i;
  for (i = 1; i <= 9; i++) out.push(a + i);
  if (b) for (i = 1; i <= 9; i++) out.push(b + i);
  return out;
}

function distribute(total, n) {
  var base = Math.floor(total / n);
  var rem = total - base * n;
  var out = [];
  var i;
  for (i = 0; i < n; i++) out.push(base + (i < rem ? 1 : 0));
  return out;
}

function paintSegment(scores, labels, playerId, total, pars) {
  var absList = distribute(total, labels.length);
  labels.forEach(function (h, i) {
    if (!scores[h]) scores[h] = {};
    var parN = Number(pars[h]);
    var par = parN === 3 || parN === 4 || parN === 5 ? parN : 4;
    scores[h][playerId] = absList[i] - par;
  });
}

function makePars(labels) {
  var pars = {};
  labels.forEach(function (h) {
    pars[h] = 4;
  });
  return pars;
}

function v53Game(order) {
  return {
    catalogId: 'three-set',
    players: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
    segmentValues: { front: 1, back: 1, overall: 1 },
    pairings: [
      {
        id: 'A__B',
        leftId: 'A',
        rightId: 'B',
        on: true,
        segmentHandicaps: { front: 0, back: -1, overall: -1 }
      },
      {
        id: 'C__D',
        leftId: 'C',
        rightId: 'D',
        on: true,
        segmentHandicaps: { front: 1, back: 0, overall: 0 }
      }
    ],
    holes: order.map(function (label) {
      return { label: label, on: true };
    })
  };
}

function paintV53Scores(order, pars) {
  var front = order.slice(0, 9);
  var back = order.slice(9, 18);
  var scores = {};
  paintSegment(scores, front, 'A', 42, pars);
  paintSegment(scores, front, 'B', 43, pars);
  paintSegment(scores, front, 'C', 45, pars);
  paintSegment(scores, front, 'D', 46, pars);
  paintSegment(scores, back, 'A', 44, pars);
  paintSegment(scores, back, 'B', 43, pars);
  paintSegment(scores, back, 'C', 42, pars);
  paintSegment(scores, back, 'D', 44, pars);
  return scores;
}

assert('目录可见三局', !catalog.isUnavailableRule('three-set') && !!catalog.findRule('three-set'));
assert('目录未隐藏', !catalog.findRule('three-set').hidden);
assert('settle 版本', settle.THREE_SET_SETTLE_VERSION === 'v53-4.1.4');

// --- 方向纯函数 ---
var adjPos = settleThreeSet.applySignedHandicap(45, 46, 1);
assert('3 正数左让右', adjPos.left === 45 && adjPos.right === 45);
var adjNeg = settleThreeSet.applySignedHandicap(44, 43, -1);
assert('4 负数右让左', adjNeg.left === 43 && adjNeg.right === 43);
var adj0 = settleThreeSet.applySignedHandicap(42, 43, 0);
assert('8 零让杆', adj0.left === 42 && adj0.right === 43);
var adjHalf = settleThreeSet.applySignedHandicap(40, 41, 0.5);
assert('7 0.5让杆', adjHalf.left === 40 && adjHalf.right === 40.5);

var flipped = settleThreeSet.flipSegmentHandicaps({ front: 1, back: -0.5, overall: 0 });
assert('11 换边三段反号', flipped.front === -1 && flipped.back === 0.5 && flipped.overall === 0);

assert(
  '14 迁移 right-left',
  settleThreeSet.migrateSignedFromPlayers({ front: 1, back: 1, overall: 1 }, { front: 0, back: 0, overall: 0 }, 'back') === -1
);

// --- V53 权威实例 ---
var orderCD = nines('C', 'D');
var parsCD = makePars(orderCD);
var game = v53Game(orderCD);
var scores = paintV53Scores(orderCD, parsCD);
var out = settleThreeSet.settle(game, { scores: scores, holeOrder: orderCD, pars: parsCD });
assert('15 V53 settleVersion', out.settleVersion === 'v53-4.1.4');
assert(
  '15 V53 总分 A+2 B-2 C+2 D-2',
  out.playerTotals.A === 2 &&
    out.playerTotals.B === -2 &&
    out.playerTotals.C === 2 &&
    out.playerTotals.D === -2,
  JSON.stringify(out.playerTotals)
);
assert(
  'A-B前九 A胜',
  out.byPair.A__B.front.leftValue === 1 && out.byPair.A__B.front.signedHandicap === 0
);
assert(
  'A-B后九平',
  out.byPair.A__B.back.leftValue === 0 &&
    out.byPair.A__B.back.leftAdjustedTotal === 43 &&
    out.byPair.A__B.back.rightAdjustedTotal === 43
);
assert('A-B全场 A胜', out.byPair.A__B.overall.leftValue === 1);
assert('C-D前九平', out.byPair.C__D.front.leftValue === 0 && out.byPair.C__D.front.signedHandicap === 1);
assert('C-D后九 C胜', out.byPair.C__D.back.leftValue === 1);
assert('C-D全场 C胜', out.byPair.C__D.overall.leftValue === 1);

// --- 旧球员级迁移结算 ---
var legacyGame = {
  catalogId: 'three-set',
  players: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
  segmentValues: { front: 1, back: 1, overall: 1 },
  pairings: [
    { id: 'A__B', leftId: 'A', rightId: 'B', on: true },
    { id: 'C__D', leftId: 'C', rightId: 'D', on: true }
  ],
  playerSegmentHandicaps: {
    A: { front: 0, back: 1, overall: 1 },
    B: { front: 0, back: 0, overall: 0 },
    C: { front: 0, back: 0, overall: 0 },
    D: { front: 1, back: 0, overall: 0 }
  }
};
var legacyOut = settleThreeSet.settle(legacyGame, {
  scores: scores,
  holeOrder: orderCD,
  pars: parsCD
});
assert(
  '14b 旧数据迁移后总分一致',
  legacyOut.playerTotals.A === 2 &&
    legacyOut.playerTotals.B === -2 &&
    legacyOut.playerTotals.C === 2 &&
    legacyOut.playerTotals.D === -2
);
assert('14c 迁移后 A-B 后九 N=-1', legacyOut.byPair.A__B.segmentHandicaps.back === -1);
assert('14d 迁移后 C-D 前九 N=+1', legacyOut.byPair.C__D.segmentHandicaps.front === 1);

// --- A-B 与 A-C 独立 ---
var multi = {
  catalogId: 'three-set',
  players: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
  segmentValues: { front: 1, back: 1, overall: 1 },
  pairings: [
    { id: 'A__B', leftId: 'A', rightId: 'B', on: true, segmentHandicaps: { front: 1, back: 0, overall: 0 } },
    { id: 'A__C', leftId: 'A', rightId: 'C', on: true, segmentHandicaps: { front: -0.5, back: 0, overall: 0 } }
  ]
};
assert(
  '9/10 组合独立',
  settleThreeSet.pairSegmentHandicapsOf(multi.pairings[0], {}).front === 1 &&
    settleThreeSet.pairSegmentHandicapsOf(multi.pairings[1], {}).front === -0.5
);

// --- 分值 ---
var gameVal = v53Game(orderCD);
gameVal.segmentValues = { front: 1, back: 2, overall: 3 };
var outVal = settleThreeSet.settle(gameVal, { scores: scores, holeOrder: orderCD, pars: parsCD });
assert(
  '16 分值',
  outVal.byPair.A__B.front.leftValue === 1 &&
    outVal.byPair.A__B.overall.leftValue === 3 &&
    outVal.playerTotals.A === 4
);

// --- dispatch ---
var via = settle.settleGame(game, { scores: scores, holeOrder: orderCD, pars: parsCD });
assert('dispatch', via.settleVersion === 'v53-4.1.4' && via.playerTotals.A === 2);

// --- UI ---
var configJs = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/pages/config/index.js'),
  'utf8'
);
var configWxml = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/pages/config/index.wxml'),
  'utf8'
);
assert('1 UI 三个草稿字段', /threeSetDraftFront/.test(configWxml) && /threeSetDraftBack/.test(configWxml) && /threeSetDraftOverall/.test(configWxml));
assert('2 UI 无双侧六框', !/threeSetDraftLeftFront/.test(configWxml) && !/data-side="left"/.test(configWxml));
assert('UI 组合行让杆按钮', /openThreeSetHcap/.test(configWxml) && /pair-hcap-btn/.test(configWxml));
assert('UI 无主页平铺', !/个人段让杆/.test(configWxml));
assert('UI 保存组合级', /segmentHandicaps/.test(configJs) && /playerSegmentHandicaps = null/.test(configJs));
assert('UI 迁移函数', /migratePairSegFromPlayers/.test(configJs) && /flipPairSegmentHandicaps/.test(configJs));
assert('比洞未改', /showMatchHandicap/.test(configWxml) && /添加让杆/.test(configWxml));
assert('油菜仍用 strokes', /showYoucai/.test(configJs) && /strokes/.test(configJs));

console.log('\ngameThreeSetV53.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
