/**
 * PATCH 2B：triangle 只消费 assignmentsByHole。
 * 运行：node scripts/assignmentTriangle.selftest.js
 */
var path = require('path');
var visual = require('../miniprogram/utils/rankMarkVisual.js');
var mark = require('../miniprogram/utils/sideGameRankMark.js');
var projectMod = require('../miniprogram/subpackages/game/utils/rankMarkProjection.js');
var settleLasuo4 = require('../miniprogram/subpackages/game/utils/settleLasuo4.js');
var settleVegas = require('../miniprogram/subpackages/game/utils/settleVegas.js');

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

function jsonEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

assert(
  'CASE1 blue + primary → 蓝实心',
  visual.markFromAssignment({ side: 'blue', role: 'primary' }).triangleClass === 'triangle-blue' &&
    visual.markFromAssignment({ side: 'blue', role: 'primary' }).hasWaist === false
);
assert(
  'CASE2 blue + secondary → 蓝腰线',
  visual.markFromAssignment({ side: 'blue', role: 'secondary' }).triangleClass === 'triangle-blue' &&
    visual.markFromAssignment({ side: 'blue', role: 'secondary' }).hasWaist === true
);
assert(
  'CASE3 red + primary → 红实心',
  visual.markFromAssignment({ side: 'red', role: 'primary' }).triangleClass === 'triangle-red' &&
    visual.markFromAssignment({ side: 'red', role: 'primary' }).hasWaist === false
);
assert(
  'CASE4 red + secondary → 红腰线',
  visual.markFromAssignment({ side: 'red', role: 'secondary' }).triangleClass === 'triangle-red' &&
    visual.markFromAssignment({ side: 'red', role: 'secondary' }).hasWaist === true
);

var fixedAllPrimary = {
  holeResults: {
    assignmentsByHole: {
      A1: [
        { playerId: 'A', side: 'blue', role: 'primary' },
        { playerId: 'B', side: 'blue', role: 'primary' },
        { playerId: 'C', side: 'red', role: 'primary' },
        { playerId: 'D', side: 'red', role: 'primary' }
      ]
    }
  }
};
var mA = mark.markForGameCell(fixedAllPrimary, 'A1', 'A');
var mB = mark.markForGameCell(fixedAllPrimary, 'A1', 'B');
assert(
  'CASE5 同 side 全部 primary → 全实心',
  mA.hasWaist === false &&
    mB.hasWaist === false &&
    mA.triangleClass === 'triangle-blue' &&
    mB.triangleClass === 'triangle-blue'
);

function lasuoGame() {
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
    ruleSnapshot: {
      pkBetter: true,
      pkWorse: true,
      pkTotal: true,
      pkBetterW: '1',
      pkWorseW: '1',
      pkTotalW: '1',
      pkTotalMode: 'sum',
      reward: 'none',
      pushRule: 'push'
    }
  };
}

var pushRels = { A: 5, B: 4, C: 6, D: 5 };
var lasuo = lasuoGame();
var lasuoRes = settleLasuo4.settle(lasuoGame(), {
  scores: { A1: pushRels },
  holeOrder: ['A1', 'A2'],
  pars: { A1: 4, A2: 4 }
});
var lasuoView = Object.assign({}, lasuo, { holeResults: lasuoRes });
mark.resetLegacyMarkCalls();
function holeMarks(view, hole) {
  return ['A', 'B', 'C', 'D'].map(function (pid) {
    return mark.markForGameCell(view, hole, pid);
  });
}
var triHole1 = holeMarks(lasuoView, 'A1');
var triHole2 = holeMarks(lasuoView, 'A2');
assert(
  'CASE6 rerank PUSH → N+1 assignment/triangle 变化',
  !jsonEq(lasuoRes.assignmentsByHole.A2, lasuoRes.assignmentsByHole.A1) &&
    !jsonEq(triHole1, triHole2),
  JSON.stringify({ a1: lasuoRes.assignmentsByHole.A1, a2: lasuoRes.assignmentsByHole.A2, t1: triHole1, t2: triHole2 })
);
assert('CASE8 assignment 存在 → legacy 不调用', mark.getLegacyMarkCalls() === 0, String(mark.getLegacyMarkCalls()));

function vegasGame(reorder) {
  return {
    catalogId: 'vegas',
    groupMode: 'random',
    rankId: 'gross-origin',
    playerOrder: ['A', 'B', 'C', 'D'],
    players: ['A', 'B', 'C', 'D'].map(function (id) {
      return { id: id };
    }),
    multiplier: 1,
    holes: [
      { label: '1', on: true },
      { label: '2', on: true }
    ],
    ruleSnapshot: {
      pushRule: 'within-n',
      pushWithinN: 100,
      reorderOnPush: reorder,
      meatValueType: 'fixed',
      meatValueN: 1
    }
  };
}
var vegasKeepRes = settleVegas.settle(vegasGame('no'), {
  scores: { '1': { A: 5, B: 3, C: 6, D: 4 } },
  holeOrder: ['1', '2'],
  pars: { '1': 4, '2': 4 }
});
var vegasKeepView = Object.assign({}, vegasGame('no'), { holeResults: vegasKeepRes });
var k1 = mark.markForGameCell(vegasKeepView, '1', 'A');
var k2 = mark.markForGameCell(vegasKeepView, '2', 'A');
assert(
  'CASE7 keep-combination PUSH → N+1 assignment/triangle 不变',
  jsonEq(vegasKeepRes.assignmentsByHole['2'], vegasKeepRes.assignmentsByHole['1']) && jsonEq(k1, k2)
);

var gold = visual.markFromAssignment({ side: 'gold', role: 'primary' });
assert(
  'gold 走通用 side，不识别游戏名',
  gold.triangleClass === 'triangle-gold' && gold.hasWaist === false
);

var legacyGame = {
  catalogId: '8421-4',
  groupMode: 'random',
  players: ['A', 'B', 'C', 'D'].map(function (id) {
    return { id: id };
  }),
  playerOrder: ['A', 'B', 'C', 'D'],
  holes: [{ label: 'A1', on: true }],
  holeOrder: ['A1'],
  holeResults: { orderByHole: { A1: ['A', 'B', 'C', 'D'] } }
};
mark.resetLegacyMarkCalls();
var legacyMark = mark.markForGameCell(legacyGame, 'A1', 'A');
assert(
  'CASE9 旧 snapshot 无 assignment → legacy fallback 仍可显示',
  mark.getLegacyMarkCalls() >= 1 && !!legacyMark.triangleClass,
  JSON.stringify(legacyMark)
);

mark.resetLegacyMarkCalls();
var shared = mark.markForGameCell(lasuoView, 'A2', 'B');
var engine = projectMod.markForGameCell(lasuoView, 'A2', 'B');
assert(
  'CASE10 主包与 engine 对同一 assignment 完全一致',
  jsonEq(shared, engine) && mark.getLegacyMarkCalls() === 0,
  JSON.stringify({ shared: shared, engine: engine, legacy: mark.getLegacyMarkCalls() })
);

var newGameNoHoleKey = {
  catalogId: 'lasuo-4',
  groupMode: 'random',
  players: ['A', 'B', 'C', 'D'].map(function (id) {
    return { id: id };
  }),
  playerOrder: ['A', 'B', 'C', 'D'],
  holes: [{ label: 'A1', on: true }],
  holeResults: {
    assignmentsByHole: {},
    orderByHole: { A1: ['A', 'B', 'C', 'D'] }
  }
};
mark.resetLegacyMarkCalls();
var skipped = mark.markForGameCell(newGameNoHoleKey, 'A1', 'A');
assert(
  '新 GAME 有 assignmentsByHole 字段 → 不走 legacy（缺洞 key 也不按 order 重算）',
  mark.getLegacyMarkCalls() === 0 && !skipped.triangleClass,
  JSON.stringify({ skipped: skipped, calls: mark.getLegacyMarkCalls() })
);

assert(
  'assignment 存在时 resolve 为 assignment 源',
  visual.resolveAssignmentForHole(lasuoView, 'A1', 'A').source === 'assignment' &&
    visual.resolveAssignmentForHole(legacyGame, 'A1', 'A').source === 'legacy'
);

var fnBody = require('fs')
  .readFileSync(path.join(__dirname, '..', 'miniprogram', 'utils', 'rankMarkVisual.js'), 'utf8')
  .split('function markFromAssignment')[1]
  .split('function holeAssignments')[0];
assert(
  'markFromAssignment 不知道 horn / isPush / catalogId',
  fnBody.indexOf('horn') < 0 && fnBody.indexOf('isPush') < 0 && fnBody.indexOf('catalogId') < 0
);

console.log('RESULT passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
