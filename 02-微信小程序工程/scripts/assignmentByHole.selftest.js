/**
 * PATCH 2A：assignmentsByHole dual-write 契约。
 * 运行：node scripts/assignmentByHole.selftest.js
 */
var fs = require('fs');
var path = require('path');
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils');
var assign = require(path.join(utilsDir, 'assignmentNormalize.js'));
var settleLasuo4 = require(path.join(utilsDir, 'settleLasuo4.js'));
var settle8421Four = require(path.join(utilsDir, 'settle8421Four.js'));
var settleVegas = require(path.join(utilsDir, 'settleVegas.js'));

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

function idsOf(list) {
  return (list || []).map(function (row) {
    return row.playerId;
  }).sort().join(',');
}

function jsonEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

var srcNorm = fs.readFileSync(path.join(utilsDir, 'assignmentNormalize.js'), 'utf8');
var srcNormCode = srcNorm.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
assert(
  'normalize 不含 catalogId / nextOrder / teamsOf',
  srcNormCode.indexOf('catalogId') < 0 &&
    srcNormCode.indexOf('nextOrder') < 0 &&
    srcNormCode.indexOf('teamsOf') < 0,
  'public normalize reimplements game rules'
);

assert(
  'schema: fromAbTeams 只做 aTeam=blue / bTeam=red',
  jsonEq(assign.fromAbTeams(['A', 'D'], ['B', 'C']), [
    { playerId: 'A', side: 'blue', role: 'primary' },
    { playerId: 'D', side: 'blue', role: 'secondary' },
    { playerId: 'B', side: 'red', role: 'primary' },
    { playerId: 'C', side: 'red', role: 'secondary' }
  ])
);

function lasuoGame(extra) {
  extra = extra || {};
  return {
    catalogId: 'lasuo-4',
    groupMode: extra.groupMode || 'random',
    rankId: extra.rankId || 'gross-origin',
    playerOrder: ['A', 'B', 'C', 'D'],
    players: ['A', 'B', 'C', 'D'].map(function (id) {
      return { id: id };
    }),
    multiplier: 1,
    holes: [
      { label: 'A1', on: true },
      { label: 'A2', on: true }
    ],
    ruleSnapshot: Object.assign(
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
      extra.rule || {}
    )
  };
}

function lasuoCtx(hole1) {
  return {
    scores: { A1: hole1 },
    holeOrder: ['A1', 'A2'],
    pars: { A1: 4, A2: 4 }
  };
}

function fourGame(groupMode) {
  return {
    catalogId: '8421-4',
    groupMode: groupMode || 'random',
    playerOrder: ['A', 'B', 'C', 'D'],
    players: ['A', 'B', 'C', 'D'].map(function (id) {
      return { id: id, scoreCode: '8421' };
    }),
    multiplier: 1,
    holes: [
      { label: '1', on: true },
      { label: '2', on: true }
    ],
    ruleSnapshot: {
      catalogId: '8421-4',
      reward: 'none',
      pushRule: 'tie',
      meatEatMode: 'piece',
      meatValueType: 'fixed',
      meatValueN: 1,
      baoNeg: 'none'
    }
  };
}

var PUSH_RELS = { A: 5, B: 4, C: 6, D: 5 };
var lasuoPush = settleLasuo4.settle(lasuoGame({ groupMode: 'random' }), lasuoCtx(PUSH_RELS));
var cloned = JSON.parse(JSON.stringify(lasuoPush));

assert(
  'lasuo-4 同一次 settle 同时写出 orderByHole 与 assignmentsByHole',
  lasuoPush.orderByHole &&
    lasuoPush.assignmentsByHole &&
    lasuoPush.orderByHole.A1 &&
    lasuoPush.assignmentsByHole.A1 &&
    lasuoPush.orderByHole.A2 &&
    lasuoPush.assignmentsByHole.A2
);

assert(
  'lasuo-4 A1/A2 assignment 玩家集合等于同洞 order（不跨洞补偿）',
  idsOf(lasuoPush.assignmentsByHole.A1) === lasuoPush.orderByHole.A1.slice().sort().join(',') &&
    idsOf(lasuoPush.assignmentsByHole.A2) === lasuoPush.orderByHole.A2.slice().sort().join(',')
);

var a2Order = lasuoPush.orderByHole.A2;
var expectedA2 = assign.fromAbTeams([a2Order[0], a2Order[3]], [a2Order[1], a2Order[2]]);
assert(
  'lasuo-4 random：assignmentsByHole[A2] 来自该洞 order 已确定的 1+4 / 2+3 分边',
  jsonEq(lasuoPush.assignmentsByHole.A2, expectedA2),
  JSON.stringify({ got: lasuoPush.assignmentsByHole.A2, order: a2Order })
);

assert(
  'jsonClone 后 assignmentsByHole 仍在（与 resultSnapshot 同对象持久化）',
  jsonEq(cloned.assignmentsByHole, lasuoPush.assignmentsByHole) &&
    jsonEq(cloned.orderByHole, lasuoPush.orderByHole)
);

var equalRel = { A: 0, B: 0, C: 0, D: 0 };
var fourPush = settle8421Four.settle(fourGame('random'), {
  scores: { '1': equalRel },
  holeOrder: ['1', '2'],
  pars: { '1': 4, '2': 4 },
  windOn: false
});

assert(
  '8421-4 全员同杆：下一洞 order 由 ranking 稳定得到，assignment 玩家集合一致',
  jsonEq(fourPush.orderByHole['1'], ['A', 'B', 'C', 'D']) &&
    jsonEq(fourPush.orderByHole['2'], fourPush.orderByHole['1']) &&
    idsOf(fourPush.assignmentsByHole['2']) === fourPush.orderByHole['2'].slice().sort().join(','),
  JSON.stringify(fourPush.orderByHole)
);

var fourFixed = settle8421Four.settle(fourGame('fixed'), {
  scores: { '1': equalRel },
  holeOrder: ['1', '2'],
  pars: { '1': 4, '2': 4 }
});
assert(
  '8421-4 fixed：stamp 使用 settle 自己的 1-2 vs 3-4，同侧全 primary',
  jsonEq(
    fourFixed.assignmentsByHole['1'],
    assign.fromAbTeams(['A', 'B'], ['C', 'D'], { roleMode: 'all-primary' })
  )
);

var vegasPush = settleVegas.settle(
  {
    catalogId: 'vegas',
    groupMode: 'random',
    playerOrder: ['A', 'B', 'C', 'D'],
    players: ['A', 'B', 'C', 'D'].map(function (id) {
      return { id: id };
    }),
    multiplier: 1,
    holes: [
      { label: '1', on: true },
      { label: '2', on: true }
    ],
    ruleSnapshot: { pushRule: 'zero', meatValueType: 'fixed', meatValueN: 1 }
  },
  {
    scores: { '1': { A: 4, B: 4, C: 4, D: 4 } },
    holeOrder: ['1', '2'],
    pars: { '1': 4, '2': 4 }
  }
);
assert(
  'vegas 同一次 settle 含 assignmentsByHole[N+1]',
  !!vegasPush.assignmentsByHole &&
    idsOf(vegasPush.assignmentsByHole['2']) === (vegasPush.orderByHole['2'] || []).slice().sort().join(',')
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
  'triangle 已切换到 assignmentsByHole',
  srcMark.indexOf('markFromAssignment') >= 0 &&
    srcMark.indexOf('resolveAssignmentForHole') >= 0 &&
    srcProj.indexOf('sideGameRankMark.markForGameCell') >= 0
);

console.log('RESULT passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
