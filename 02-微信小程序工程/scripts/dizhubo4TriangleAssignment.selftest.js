/**
 * 四人地主婆：二地主婆记分页 assignment side（farm=蓝 / land=红）。
 * 不改结算 land/farm。运行：node scripts/dizhubo4TriangleAssignment.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
global.wx.getStorageSync = global.wx.getStorageSync || function () {
  return null;
};
global.wx.setStorageSync = global.wx.setStorageSync || function () {};

var fs = require('fs');
var path = require('path');
var settleDizhubo4 = require('../miniprogram/subpackages/game/utils/settleDizhubo4.js');
var assign = require('../miniprogram/subpackages/game/utils/assignmentNormalize.js');
var visual = require('../miniprogram/utils/rankMarkVisual.js');
var core = require('../miniprogram/subpackages/game/utils/settleCore.js');

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

function byId(list, pid) {
  var i;
  for (i = 0; i < (list || []).length; i++) {
    if (String(list[i].playerId) === String(pid)) return list[i];
  }
  return null;
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

function gameOf(mode, groupMode, extra) {
  extra = extra || {};
  return {
    catalogId: 'dizhubo-4',
    dizhuboMode: mode,
    groupMode: groupMode || 'random',
    rankId: 'gross-origin',
    playerOrder: ['A', 'B', 'C', 'D'],
    players: ['A', 'B', 'C', 'D'].map(function (id) {
      return { id: id };
    }),
    multiplier: extra.k != null ? extra.k : 1,
    holes: [
      { label: 'A1', on: true },
      { label: 'A2', on: true }
    ],
    ruleSnapshot: Object.assign(
      {
        reward: extra.reward != null ? extra.reward : 'mul',
        mulRows: mulRows(),
        pushRule: extra.pushRule != null ? extra.pushRule : 'none'
      },
      extra.rule || {}
    )
  };
}

function settle(mode, groupMode, scores, extra) {
  extra = extra || {};
  return settleDizhubo4.settle(gameOf(mode, groupMode, extra), {
    scores: scores,
    holeOrder: extra.holeOrder || ['A1', 'A2'],
    pars: { A1: 4, A2: 4 }
  });
}

function sameLedger(actual, expected) {
  return (
    Number(actual.A) === expected.A &&
    Number(actual.B) === expected.B &&
    Number(actual.C) === expected.C &&
    Number(actual.D) === expected.D
  );
}

function fieldsOf(list) {
  return (list || [])
    .map(function (a) {
      return {
        playerId: a.playerId,
        side: a.side,
        role: a.role
      };
    })
    .sort(function (x, y) {
      return String(x.playerId).localeCompare(String(y.playerId));
    });
}

var src = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/utils/settleDizhubo4.js'),
  'utf8'
);
var assignSrc = fs.readFileSync(
  path.join(__dirname, '../miniprogram/utils/assignmentNormalize.js'),
  'utf8'
);

assert(
  'sidesOf 结算组队未改：mid land=[1,D] farm=[0,2]',
  /if \(mid\) \{[\s\S]*return \{ land: \[order\[1\], d\], farm: \[order\[0\], order\[2\]\] \}/.test(src)
);
assert(
  'stamp 走公共 holeSidesFromOrder，结算仍 sidesOf',
  src.indexOf('holeSidesFromOrder(game, order)') >= 0 &&
    src.indexOf('const sides = sidesOf(order, mid);') >= 0 &&
    src.indexOf('const land = sides.land;') >= 0 &&
    src.indexOf('assignmentHoleSides(settleSides, mid)') < 0
);
assert(
  '未全局改 fromHoleSides land→blue',
  /if \(Array.isArray\(sides.land\) && Array.isArray\(sides.farm\)\) \{[\s\S]*return fromAbTeams\(sides.land, sides.farm/.test(
    assignSrc
  )
);

var midRandom = settle('mid', 'random', { A1: { A: 0, B: 1, C: 2, D: 3 } });
var midAssign = midRandom.assignmentsByHole.A1;
var a = byId(midAssign, 'A');
var b = byId(midAssign, 'B');
var c = byId(midAssign, 'C');
var d = byId(midAssign, 'D');

assert(
  'CASE1 mid+random A/B/C/D side+role',
  a &&
    a.side === 'blue' &&
    a.role === 'primary' &&
    b &&
    b.side === 'red' &&
    b.role === 'primary' &&
    c &&
    c.side === 'blue' &&
    c.role === 'secondary' &&
    d &&
    d.side === 'red' &&
    d.role === 'secondary',
  JSON.stringify(midAssign)
);

function tri(pid) {
  return visual.markFromAssignment(byId(midAssign, pid));
}

assert(
  'CASE2 最终 triangle A蓝实心 B红实心 C蓝腰线 D红腰线',
  tri('A').triangleClass === 'triangle-blue' &&
    tri('A').hasWaist === false &&
    tri('B').triangleClass === 'triangle-red' &&
    tri('B').hasWaist === false &&
    tri('C').triangleClass === 'triangle-blue' &&
    tri('C').hasWaist === true &&
    tri('D').triangleClass === 'triangle-red' &&
    tri('D').hasWaist === true
);

var bigRandom = settle('big', 'random', { A1: { A: 0, B: 1, C: 2, D: 3 } });
var bigAssign = bigRandom.assignmentsByHole.A1;
assert(
  'CASE3 big+random 不回归 A+D蓝 B+C红',
  byId(bigAssign, 'A').side === 'blue' &&
    byId(bigAssign, 'A').role === 'primary' &&
    byId(bigAssign, 'D').side === 'blue' &&
    byId(bigAssign, 'D').role === 'secondary' &&
    byId(bigAssign, 'B').side === 'red' &&
    byId(bigAssign, 'B').role === 'primary' &&
    byId(bigAssign, 'C').side === 'red' &&
    byId(bigAssign, 'C').role === 'secondary',
  JSON.stringify(bigAssign)
);

var farmWin = settle('mid', 'random', { A1: { A: -1, B: 1, C: 1, D: 2 } });
assert(
  'CASE4 二地主婆结算胜负与 land/farm 比较式一致（农民胜）',
  core.round1(((-1) + 1) / 2) === 0 &&
    Math.min(1, 2) > 0 &&
    sameLedger(farmWin.byHole.A1, { A: 2, C: 2, B: -2, D: -2 }),
  JSON.stringify(farmWin.byHole.A1)
);

var landWinMul = settle('mid', 'random', { A1: { A: 0, B: -1, C: 1, D: 1 } });
assert(
  'CASE5 奖励结果：地主队小鸟胜 ×2',
  sameLedger(landWinMul.byHole.A1, { B: 2, D: 2, A: -2, C: -2 }),
  JSON.stringify(landWinMul.byHole.A1)
);

assert(
  'CASE6 orderByHole 仍为出发序 A,B,C,D',
  JSON.stringify(midRandom.orderByHole.A1) === JSON.stringify(['A', 'B', 'C', 'D']) &&
    JSON.stringify(bigRandom.orderByHole.A1) === JSON.stringify(['A', 'B', 'C', 'D'])
);

var invertedMid = assign.fromAbTeams(['B', 'D'], ['A', 'C']);
var expectedMid = assign.fromAbTeams(['A', 'C'], ['B', 'D']);
assert(
  'CASE7 mid 只换 side：playerId/role 与 land/farm 组内顺序相同',
  JSON.stringify(fieldsOf(midAssign).map(function (x) {
    return { playerId: x.playerId, role: x.role };
  })) ===
    JSON.stringify(
      fieldsOf(invertedMid).map(function (x) {
        return { playerId: x.playerId, role: x.role };
      })
    ) &&
    JSON.stringify(fieldsOf(midAssign)) === JSON.stringify(fieldsOf(expectedMid)),
  JSON.stringify({ got: fieldsOf(midAssign), oldSides: fieldsOf(invertedMid) })
);

var midFixed = settle('mid', 'fixed', { A1: { A: 0, B: 1, C: 2, D: 3 } });
assert(
  'fixed 本轮不改：mid 仍 all-primary，仅 side 已对调',
  byId(midFixed.assignmentsByHole.A1, 'A').side === 'blue' &&
    byId(midFixed.assignmentsByHole.A1, 'A').role === 'primary' &&
    byId(midFixed.assignmentsByHole.A1, 'C').role === 'primary' &&
    byId(midFixed.assignmentsByHole.A1, 'B').side === 'red' &&
    byId(midFixed.assignmentsByHole.A1, 'D').role === 'primary'
);

console.log('dizhubo4TriangleAssignment.selftest passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
