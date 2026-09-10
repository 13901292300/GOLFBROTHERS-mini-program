/**
 * 斗二地主：顶洞只攒肉，乱斗 PUSH 仍 rerank。
 * 运行：node scripts/gameLandlordMidPushOrder.selftest.js
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

var settleMid = require('../miniprogram/subpackages/game/utils/settleLandlordMid.js');
var holeOrder = require('../miniprogram/subpackages/game/utils/resolveNextHoleOrder.js');
var mark = require('../miniprogram/utils/sideGameRankMark.js');

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

function players() {
  return [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
}

function holesOn() {
  return [
    { label: 'C1', on: true },
    { label: 'C2', on: true }
  ];
}

function game(extra) {
  return Object.assign(
    {
      catalogId: 'landlord-mid',
      players: players(),
      playerOrder: ['C', 'B', 'A'],
      groupMode: 'random',
      rankId: 'gross-origin',
      multiplier: 1,
      holes: holesOn(),
      ruleSnapshot: {
        catalogId: 'landlord-mid',
        reward: 'none',
        pushRule: 'push',
        reorderOnPush: 'no',
        baoMode: 'none',
        meatRows: [
          { id: 'le-2', value: '0' },
          { id: 'm1', value: '0' },
          { id: 'par', value: '0' },
          { id: 'ge-1', value: '0' }
        ]
      }
    },
    extra || {}
  );
}

function ctx(c1, c2) {
  return {
    holeOrder: ['C1', 'C2'],
    pars: { C1: 4, C2: 4 },
    scores: {
      C1: c1,
      C2: c2 || {}
    }
  };
}

function recFromScores(scores) {
  var rec = {};
  Object.keys(scores).forEach(function (id) {
    var rel = Number(scores[id]);
    rec[id] = { rel: rel, net: rel, pts: 0 };
  });
  return rec;
}

function expectedRerank(current, scores) {
  return holeOrder.resolveNextHoleOrder({
    currentOrder: current,
    holeScores: recFromScores(scores),
    rankingPolicy: 'dynamic',
    rankingRule: { rankId: 'gross-origin' },
    pushPolicy: 'rerank',
    isPush: true,
    tieBreakContext: { history: [] }
  });
}

function frozen(current) {
  return holeOrder.resolveNextHoleOrder({
    currentOrder: current,
    holeScores: recFromScores({ C: 5, B: 4, A: 3 }),
    rankingPolicy: 'dynamic',
    rankingRule: { rankId: 'gross-origin' },
    pushPolicy: 'keep-combination',
    isPush: true,
    tieBreakContext: { history: [] }
  });
}

var current = ['C', 'B', 'A'];
var pushScores = { C: 5, B: 4, A: 3 };
var wantRerank = expectedRerank(current, pushScores);
assert(
  'CASE3 ranking 结果与冻结不同',
  wantRerank.join(',') === 'A,B,C' && frozen(current).join(',') === 'C,B,A',
  wantRerank.join(',') + ' freeze=' + frozen(current).join(',')
);

var pushOut = settleMid.settle(game(), ctx(pushScores));
assert('CASE2 PUSH 不冻结 currentOrder', pushOut.orderByHole.C2.join(',') !== current.join(','));
assert(
  'CASE2/3 PUSH nextOrder = ranking resolver',
  pushOut.orderByHole.C2.join(',') === wantRerank.join(','),
  String(pushOut.orderByHole.C2)
);
assert('CASE2 C1 仍用开局顺序', pushOut.orderByHole.C1.join(',') === 'C,B,A');
assert(
  'snapshot reorderOnPush=no 仍 rerank',
  pushOut.orderByHole.C2.join(',') === 'A,B,C'
);

var nonPush = { C: 5, B: 5, A: 3 };
var nonPushWant = holeOrder.resolveNextHoleOrder({
  currentOrder: current,
  holeScores: recFromScores(nonPush),
  rankingPolicy: 'dynamic',
  rankingRule: { rankId: 'gross-origin' },
  pushPolicy: 'rerank',
  isPush: false,
  tieBreakContext: { history: [] }
});
var nonPushOut = settleMid.settle(game(), ctx(nonPush));
assert(
  'CASE1 乱斗非 PUSH 正常 rerank',
  nonPushOut.orderByHole.C2.join(',') === nonPushWant.join(',') &&
    nonPushOut.orderByHole.C2.join(',') === 'A,C,B',
  String(nonPushOut.orderByHole.C2)
);

var assign = pushOut.assignmentsByHole.C2 || [];
function sideOf(id) {
  var hit = assign.filter(function (row) {
    return row.playerId === id;
  })[0];
  return hit && hit.side;
}
assert(
  'CASE4 第2名单人红、第1+3双人蓝',
  sideOf('B') === 'red' && sideOf('A') === 'blue' && sideOf('C') === 'blue',
  JSON.stringify(assign)
);

var fakeGame = {
  holeResults: { assignmentsByHole: { C2: assign } }
};
assert(
  'CASE5 triangle 只读 assignment',
  mark.markForGameCell(fakeGame, 'C2', 'B').triangleClass === 'triangle-red' &&
    mark.markForGameCell(fakeGame, 'C2', 'A').triangleClass === 'triangle-blue' &&
    mark.markForGameCell(fakeGame, 'C2', 'C').triangleClass === 'triangle-blue'
);

var projSrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram/subpackages/game/utils/rankMarkProjection.js'),
  'utf8'
);
var visualSrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram/utils/rankMarkVisual.js'),
  'utf8'
);
assert(
  'CASE5 projection/visual 无 PUSH 特判',
  projSrc.indexOf('isPush') < 0 &&
    projSrc.indexOf('pushPolicy') < 0 &&
    projSrc.indexOf('keep-combination') < 0 &&
    visualSrc.indexOf('isPush') < 0 &&
    visualSrc.indexOf('landlord-mid') < 0
);

var fixedOut = settleMid.settle(
  game({ groupMode: 'fixed', sortUpdate: 'fixed', playerOrder: current }),
  ctx(pushScores)
);
assert(
  'CASE6 固斗 PUSH 也不改序',
  fixedOut.orderByHole.C1.join(',') === 'C,B,A' &&
    fixedOut.orderByHole.C2.join(',') === 'C,B,A'
);
assert(
  'CASE6 固斗非 PUSH 仍固定',
  settleMid.settle(game({ groupMode: 'fixed', playerOrder: current }), ctx(nonPush)).orderByHole.C2.join(',') ===
    'C,B,A'
);

var midSrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram/subpackages/game/utils/settleLandlordMid.js'),
  'utf8'
);
assert('已移除 keepOrderOnPush 特例', midSrc.indexOf('keepOrderOnPush') < 0 && /pushPolicy:\s*"rerank"/.test(midSrc));

console.log('\ngameLandlordMidPushOrder.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
