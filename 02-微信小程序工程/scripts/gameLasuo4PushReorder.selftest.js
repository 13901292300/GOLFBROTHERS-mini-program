/**
 * 四人拉丝：顶洞仍按 rankId + 既有 tie-break 生成 nextOrder。
 * 运行：node scripts/gameLasuo4PushReorder.selftest.js
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

function baseRule(extra) {
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

function gameOf(extra) {
  extra = extra || {};
  var ids = extra.order || ['A', 'B', 'C', 'D'];
  return {
    catalogId: 'lasuo-4',
    groupMode: extra.groupMode || 'random',
    rankId: extra.rankId || 'gross-origin',
    playerOrder: ids,
    players: ['A', 'B', 'C', 'D'].map(function (id) {
      return { id: id };
    }),
    multiplier: 1,
    holes: extra.holes || [
      { label: 'A1', on: true },
      { label: 'A2', on: true }
    ],
    ruleSnapshot: baseRule(extra.rule)
  };
}

function ctxOf(holeRels, extra) {
  extra = extra || {};
  var scores = extra.scores || {};
  if (!extra.scores) {
    Object.keys(holeRels || {}).forEach(function (hole) {
      scores[hole] = holeRels[hole];
    });
  }
  return {
    scores: scores,
    holeOrder: extra.holeOrder || ['A1', 'A2'],
    pars: extra.pars || { A1: 4, A2: 4 }
  };
}

function settle(extra, holeRels) {
  return settleLasuo4.settle(gameOf(extra), ctxOf(holeRels));
}

var PUSH_RELS = { A: 5, B: 4, C: 6, D: 5 };
var WIN_RELS = { A: 6, B: 3, C: 4, D: 7 };

var randomWin = settle({ groupMode: 'random', rule: { reorderOnPush: 'no' } }, { A1: WIN_RELS });
assert(
  'CASE1 random + 非push 仍生成 nextOrder',
  JSON.stringify(randomWin.orderByHole.A1) === JSON.stringify(['A', 'B', 'C', 'D']) &&
    JSON.stringify(randomWin.orderByHole.A2) === JSON.stringify(['B', 'C', 'A', 'D']) &&
    randomWin.holeDebug.A1.finalTeamScore !== 0,
  JSON.stringify({
    o1: randomWin.orderByHole.A1,
    o2: randomWin.orderByHole.A2,
    dbg: randomWin.holeDebug.A1
  })
);

var randomPush = settle({ groupMode: 'random', rule: { reorderOnPush: 'no' } }, { A1: PUSH_RELS });
assert(
  'CASE2 random + push 仍执行 rankId 排序',
  JSON.stringify(randomPush.orderByHole.A2) === JSON.stringify(['B', 'A', 'D', 'C']),
  JSON.stringify(randomPush.orderByHole)
);

assert(
  'CASE3 random + push 同杆走既有 tie-break',
  JSON.stringify(randomPush.orderByHole.A2) === JSON.stringify(['B', 'A', 'D', 'C']) &&
    randomPush.orderByHole.A2.indexOf('A') < randomPush.orderByHole.A2.indexOf('D'),
  JSON.stringify(randomPush.orderByHole.A2)
);

assert(
  'CASE4 push 后 orderByHole[N+1] 为新 nextOrder',
  JSON.stringify(randomPush.orderByHole.A1) === JSON.stringify(['A', 'B', 'C', 'D']) &&
    JSON.stringify(randomPush.orderByHole.A2) === JSON.stringify(['B', 'A', 'D', 'C']),
  JSON.stringify(randomPush.orderByHole)
);

assert(
  'CASE5 push 本洞积分/攒肉不变',
  randomPush.holeDebug.A1.finalTeamScore === 0 &&
    randomPush.holeDebug.A1.winningTeam === 'none' &&
    randomPush.topHoleStates.A1 === 'pending' &&
    randomPush.byHole.A1.A === 0 &&
    randomPush.byHole.A1.B === 0 &&
    randomPush.byHole.A1.C === 0 &&
    randomPush.byHole.A1.D === 0,
  JSON.stringify({
    dbg: randomPush.holeDebug.A1,
    ledger: randomPush.byHole.A1,
    top: randomPush.topHoleStates
  })
);

var fixedPush = settle({ groupMode: 'fixed', rule: { reorderOnPush: 'yes' } }, { A1: PUSH_RELS });
assert(
  'CASE6 fixed + push 保持固定 order',
  JSON.stringify(fixedPush.orderByHole.A1) === JSON.stringify(['A', 'B', 'C', 'D']) &&
    JSON.stringify(fixedPush.orderByHole.A2) === JSON.stringify(['A', 'B', 'C', 'D']),
  JSON.stringify(fixedPush.orderByHole)
);

var fixedWin = settle({ groupMode: 'fixed', rule: { reorderOnPush: 'yes' } }, { A1: WIN_RELS });
assert(
  'CASE7 fixed + 非push 保持固定 order',
  JSON.stringify(fixedWin.orderByHole.A2) === JSON.stringify(['A', 'B', 'C', 'D']) &&
    fixedWin.holeDebug.A1.finalTeamScore !== 0,
  JSON.stringify({ o2: fixedWin.orderByHole.A2, score: fixedWin.holeDebug.A1.finalTeamScore })
);

var splitPush = settle({ groupMode: 'split-high', rule: { reorderOnPush: 'no' } }, { A1: PUSH_RELS });
var splitNext = splitPush.orderByHole.A2;
var highBefore = ['A', 'B'].slice().sort();
var highAfter = splitNext.slice(0, 2).slice().sort();
var lowBefore = ['C', 'D'].slice().sort();
var lowAfter = splitNext.slice(2, 4).slice().sort();
assert(
  'CASE8 split-high + push 只在分区内重排',
  JSON.stringify(splitNext) === JSON.stringify(['B', 'A', 'D', 'C']) &&
    JSON.stringify(highBefore) === JSON.stringify(highAfter) &&
    JSON.stringify(lowBefore) === JSON.stringify(lowAfter),
  JSON.stringify(splitNext)
);

var pushNo = settle({ groupMode: 'random', rule: { reorderOnPush: 'no' } }, { A1: PUSH_RELS });
var pushYes = settle({ groupMode: 'random', rule: { reorderOnPush: 'yes' } }, { A1: PUSH_RELS });
assert(
  'CASE9 旧实例 reorderOnPush=no 仍重排',
  JSON.stringify(pushNo.orderByHole.A2) === JSON.stringify(['B', 'A', 'D', 'C']),
  JSON.stringify(pushNo.orderByHole.A2)
);
assert(
  'CASE10 reorderOnPush=yes 与统一逻辑一致',
  JSON.stringify(pushYes.orderByHole.A2) === JSON.stringify(pushNo.orderByHole.A2) &&
    JSON.stringify(pushYes.holeDebug.A1.finalTeamScore) === JSON.stringify(pushNo.holeDebug.A1.finalTeamScore),
  JSON.stringify({ yes: pushYes.orderByHole.A2, no: pushNo.orderByHole.A2 })
);

var srcSettle = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils', 'settleLasuo4.js'),
  'utf8'
);
assert(
  'settleLasuo4 下一洞排序走公共 resolver，且不以 isPush 早退',
  srcSettle.indexOf('resolveNextHoleOrder') >= 0 &&
    srcSettle.indexOf('if (isPush && !reorderOnPush)') < 0,
  'early-return still present'
);

var srcWxml = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'pages', 'edit-rule', 'index.wxml'),
  'utf8'
);
var lasuoStart = srcWxml.indexOf('wx:if="{{showLasuo}}"');
var vegasStart = srcWxml.indexOf('wx:if="{{showVegas}}"');
var lasuoBlock = lasuoStart >= 0 && vegasStart > lasuoStart ? srcWxml.slice(lasuoStart, vegasStart) : '';
assert(
  'lasuo-4 规则 UI 不再展示顶洞换组合',
  lasuoBlock.indexOf('顶洞不换组合') < 0 &&
    lasuoBlock.indexOf('顶洞也按成绩调整组合') < 0 &&
    lasuoBlock.indexOf('顶洞时是否重新排序') < 0,
  lasuoBlock.slice(0, 200)
);

var vegasBlock = vegasStart >= 0 ? srcWxml.slice(vegasStart, srcWxml.indexOf('wx:if="{{showLandlordBig}}"')) : '';
var landlordStart = srcWxml.indexOf('wx:if="{{showLandlordBig}}"');
var landlordBlock = landlordStart >= 0 ? srcWxml.slice(landlordStart, srcWxml.indexOf('wx:if="{{showDizhubo}}"')) : '';
assert(
  'Vegas / 斗地主仍保留顶洞换组合配置',
  vegasBlock.indexOf('顶洞不换组合') >= 0 &&
    landlordBlock.indexOf('showLandlordReorder') >= 0 &&
    srcWxml.indexOf('wx:if="{{showLandlordReorder}}"') >= 0,
  'shared reorder UI missing'
);

var srcMark = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'utils', 'sideGameRankMark.js'),
  'utf8'
);
var srcProj = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils', 'rankMarkProjection.js'),
  'utf8'
);
assert(
  'triangle 文件存在且本轮测试不依赖改投影',
  /fromRank|markForGameCell/.test(srcMark) && /recordToGame/.test(srcProj)
);

console.log('RESULT passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
