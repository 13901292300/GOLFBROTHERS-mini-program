/**
 * settle 前三角：preview assignment 与第一次 settle 同源。
 * 运行：node scripts/sideGamePreSettleTriangle.selftest.js
 */
if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return global.__gb_side_games || [];
    },
    setStorageSync: function (_k, v) {
      global.__gb_side_games = v;
    }
  };
}

var path = require('path');
var fs = require('fs');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var bind = require('./sideGameRepoTestBind.js');
var mark = require('../miniprogram/utils/sideGameRankMark.js');
var scoreRank = require('../miniprogram/subpackages/scoring/utils/scoreRankMark.js');
var assign = require('../miniprogram/utils/assignmentNormalize.js');
var assignmentForHole = require('../miniprogram/utils/assignmentForHole.js');
var settleLasuo4 = require('../miniprogram/subpackages/game/utils/settleLasuo4.js');
var settleDizhubo4 = require('../miniprogram/subpackages/game/utils/settleDizhubo4.js');

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

function byId(list, pid) {
  var i;
  for (i = 0; i < (list || []).length; i++) {
    if (String(list[i].playerId) === String(pid)) return list[i];
  }
  return null;
}

function holesOn() {
  return catalog.HOLES.map(function (label) {
    return { label: label, on: true };
  });
}

function fourPlayers() {
  return [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
}

function lasuoGame(extra) {
  extra = extra || {};
  return {
    catalogId: 'lasuo-4',
    groupMode: extra.groupMode || 'random',
    rankId: 'gross-origin',
    playerOrder: extra.playerOrder || ['A', 'B', 'C', 'D'],
    players: fourPlayers(),
    multiplier: 1,
    holes: [
      { label: 'A1', on: true },
      { label: 'A2', on: true }
    ],
    holeOrder: ['A1', 'A2'],
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

function dizGame(mode, groupMode) {
  return {
    catalogId: 'dizhubo-4',
    dizhuboMode: mode,
    groupMode: groupMode || 'random',
    rankId: 'gross-origin',
    playerOrder: ['A', 'B', 'C', 'D'],
    players: fourPlayers(),
    multiplier: 1,
    holes: [
      { label: 'A1', on: true },
      { label: 'A2', on: true }
    ],
    holeOrder: ['A1', 'A2'],
    ruleSnapshot: { reward: 'none', pushRule: 'none' }
  };
}

function emptyScores() {
  return fourPlayers().map(function (p) {
    var scores = [];
    var i;
    for (i = 0; i < 18; i++) scores.push('');
    return { playerId: p.id, scores: scores };
  });
}

bind.seed([
  {
    matchId: 'm-tri',
    groupId: 'grp-1',
    status: 'active',
    ruleId: 'lasuo-4',
    revision: 1,
    resultRevision: 0,
    resultSnapshot: null,
    participantParties: fourPlayers().map(function (p) {
      return { partyId: p.id, partyType: 'player', memberPlayerIds: [p.id] };
    }),
    config: {
      instance: {
        catalogId: 'lasuo-4',
        players: fourPlayers(),
        playerOrder: ['A', 'B', 'C', 'D'],
        groupMode: 'random',
        holes: holesOn(),
        holeOrder: catalog.HOLES.slice()
      }
    }
  }
]);

var official0 = {
  matchId: 'm-tri',
  groupId: 'grp-1',
  pars: catalog.HOLES.map(function () {
    return 4;
  }),
  players: emptyScores()
};

var proj0 = scoreRank.projectFromStorage(official0);
assert(
  'CASE1 0 洞成绩第一洞立即有三角',
  scoreRank.markFromProjection(proj0, 'A', 0).triangleClass === 'triangle-blue' &&
    scoreRank.markFromProjection(proj0, 'B', 0).triangleClass === 'triangle-red' &&
    scoreRank.markFromProjection(proj0, 'C', 0).triangleClass === 'triangle-red' &&
    scoreRank.markFromProjection(proj0, 'D', 0).triangleClass === 'triangle-blue'
);

var pendingGame = Object.assign({}, lasuoGame(), {
  holeResults: {
    pendingStart: true,
    assignmentsByHole: {},
    orderByHole: { A1: ['A', 'B', 'C', 'D'] }
  }
});
var pendingResolved = assignmentForHole.resolveAssignmentForHole(pendingGame, 'A1', 'A');
assert(
  'CASE2 assignmentsByHole 为空仍从 instance/pending order preview',
  pendingResolved.source === 'preview' &&
    pendingResolved.assignment &&
    pendingResolved.assignment.side === 'blue' &&
    !assignmentForHole.settledListForHole(pendingGame, 'A1')
);

var lasuo = lasuoGame();
var previewA1 = assign.deriveAssignmentsFromOrder(lasuo, lasuo.playerOrder);
var lasuoRes = settleLasuo4.settle(lasuoGame(), {
  scores: { A1: { A: 5, B: 4, C: 6, D: 5 } },
  holeOrder: ['A1', 'A2'],
  pars: { A1: 4, A2: 4 }
});
assert(
  'CASE3 第一洞 settle 后 assignment 与 preview 完全一致',
  jsonEq(previewA1, lasuoRes.assignmentsByHole.A1),
  JSON.stringify({ preview: previewA1, settled: lasuoRes.assignmentsByHole.A1 })
);

var afterHole1 = Object.assign({}, lasuoGame(), { holeResults: lasuoRes });
assert(
  'CASE3 settled 优先于 preview',
  assignmentForHole.resolveAssignmentForHole(afterHole1, 'A1', 'A').source === 'settled'
);

assert(
  'CASE4 第一洞 settle 后第二洞未记分已有三角',
  !!lasuoRes.assignmentsByHole.A2 &&
    lasuoRes.assignmentsByHole.A2.length === 4 &&
    mark.markForGameCell(afterHole1, 'A2', 'A').triangleClass
);

var previewA2 = assign.deriveAssignmentsFromOrder(lasuo, lasuoRes.orderByHole.A2);
assert(
  'CASE4/5 第二洞 preview(orderByHole[2]) === settled A2',
  jsonEq(previewA2, lasuoRes.assignmentsByHole.A2),
  JSON.stringify({ preview: previewA2, settled: lasuoRes.assignmentsByHole.A2 })
);

var midGame = dizGame('mid', 'random');
var midPreview = assign.deriveAssignmentsFromOrder(midGame, ['A', 'B', 'C', 'D']);
var midRes = settleDizhubo4.settle(dizGame('mid', 'random'), {
  scores: { A1: { A: 4, B: 5, C: 4, D: 6 } },
  holeOrder: ['A1', 'A2'],
  pars: { A1: 4, A2: 4 }
});
assert(
  'CASE6 二地主婆 preview A蓝实心 B红实心 C蓝腰线 D红腰线',
  byId(midPreview, 'A').side === 'blue' &&
    byId(midPreview, 'A').role === 'primary' &&
    byId(midPreview, 'B').side === 'red' &&
    byId(midPreview, 'B').role === 'primary' &&
    byId(midPreview, 'C').side === 'blue' &&
    byId(midPreview, 'C').role === 'secondary' &&
    byId(midPreview, 'D').side === 'red' &&
    byId(midPreview, 'D').role === 'secondary'
);
assert(
  'CASE6 preview === 第一次 settle assignment',
  jsonEq(midPreview, midRes.assignmentsByHole.A1)
);

var bigGame = dizGame('big', 'random');
var bigPreview = assign.deriveAssignmentsFromOrder(bigGame, ['A', 'B', 'C', 'D']);
var bigRes = settleDizhubo4.settle(dizGame('big', 'random'), {
  scores: { A1: { A: 4, B: 5, C: 4, D: 6 } },
  holeOrder: ['A1', 'A2'],
  pars: { A1: 4, A2: 4 }
});
assert(
  'CASE7 大地主婆 preview === settle',
  jsonEq(bigPreview, bigRes.assignmentsByHole.A1) &&
    byId(bigPreview, 'A').side === 'blue' &&
    byId(bigPreview, 'D').side === 'blue'
);

['random', 'fixed'].forEach(function (mode) {
  var g = lasuoGame({ groupMode: mode });
  var p = assign.deriveAssignmentsFromOrder(g, g.playerOrder);
  var s = settleLasuo4.settle(lasuoGame({ groupMode: mode }), {
    scores: { A1: { A: 4, B: 4, C: 5, D: 5 } },
    holeOrder: ['A1', 'A2'],
    pars: { A1: 4, A2: 4 }
  });
  assert(
    'CASE8 拉丝 ' + mode + ' preview === settle',
    jsonEq(p, s.assignmentsByHole.A1),
    JSON.stringify({ mode: mode, preview: p, settled: s.assignmentsByHole.A1 })
  );
});

bind.seed([]);
var noGame = scoreRank.projectFromStorage(official0);
assert(
  'CASE9 没有 side-game 不显示三角',
  !scoreRank.colorFromProjection(noGame, 'A', 0)
);

var shortOrder = lasuoGame({ playerOrder: ['A', 'B'] });
shortOrder.holeResults = null;
var shortMark = mark.markForGameCell(shortOrder, 'A1', 'A');
assert(
  'CASE10 order 不完整不猜队伍',
  !shortMark.triangleClass &&
    assignmentForHole.resolveAssignmentForHole(shortOrder, 'A1', 'A').source === 'none'
);

var hole2NoOrder = Object.assign({}, lasuoGame(), {
  holeResults: {
    assignmentsByHole: { A1: previewA1 },
    orderByHole: { A1: ['A', 'B', 'C', 'D'] }
  }
});
assert(
  'hole 2 不回退 hole 1 初始 order',
  assignmentForHole.gameOrderForHole(hole2NoOrder, 'A2') == null &&
    !mark.markForGameCell(hole2NoOrder, 'A2', 'A').triangleClass
);

var midFixed = dizGame('mid', 'fixed');
var midFixedPreview = assign.deriveAssignmentsFromOrder(midFixed, ['A', 'B', 'C', 'D']);
var midFixedRes = settleDizhubo4.settle(dizGame('mid', 'fixed'), {
  scores: { A1: { A: 4, B: 5, C: 4, D: 6 } },
  holeOrder: ['A1', 'A2'],
  pars: { A1: 4, A2: 4 }
});
assert(
  'fixed 二地主婆 preview 全 primary 且与 settle 一致',
  jsonEq(midFixedPreview, midFixedRes.assignmentsByHole.A1) &&
    byId(midFixedPreview, 'A').role === 'primary' &&
    byId(midFixedPreview, 'C').role === 'primary'
);

var bigFixedPreview = assign.deriveAssignmentsFromOrder(dizGame('big', 'fixed'), ['A', 'B', 'C', 'D']);
var bigFixedRes = settleDizhubo4.settle(dizGame('big', 'fixed'), {
  scores: { A1: { A: 4, B: 5, C: 4, D: 6 } },
  holeOrder: ['A1', 'A2'],
  pars: { A1: 4, A2: 4 }
});
assert(
  'fixed 大地主婆 preview === settle 且全 primary',
  jsonEq(bigFixedPreview, bigFixedRes.assignmentsByHole.A1) &&
    byId(bigFixedPreview, 'A').role === 'primary' &&
    byId(bigFixedPreview, 'B').role === 'primary' &&
    byId(bigFixedPreview, 'C').role === 'primary' &&
    byId(bigFixedPreview, 'D').role === 'primary'
);

function previewEqualsSettle(name, preview, settled) {
  assert(
    'previewAssignment deepEqual settleStamp ' + name,
    jsonEq(preview, settled),
    JSON.stringify({ preview: preview, settled: settled })
  );
}
previewEqualsSettle('lasuo random', previewA1, lasuoRes.assignmentsByHole.A1);
previewEqualsSettle(
  'lasuo fixed',
  assign.deriveAssignmentsFromOrder(lasuoGame({ groupMode: 'fixed' }), ['A', 'B', 'C', 'D']),
  settleLasuo4.settle(lasuoGame({ groupMode: 'fixed' }), {
    scores: { A1: { A: 4, B: 4, C: 5, D: 5 } },
    holeOrder: ['A1', 'A2'],
    pars: { A1: 4, A2: 4 }
  }).assignmentsByHole.A1
);
previewEqualsSettle('dizhubo big random', bigPreview, bigRes.assignmentsByHole.A1);
previewEqualsSettle('dizhubo mid random', midPreview, midRes.assignmentsByHole.A1);
previewEqualsSettle('dizhubo mid fixed', midFixedPreview, midFixedRes.assignmentsByHole.A1);
previewEqualsSettle('dizhubo big fixed', bigFixedPreview, bigFixedRes.assignmentsByHole.A1);

var lasuoSrc = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/utils/settleLasuo4.js'),
  'utf8'
);
var dizSrc = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/utils/settleDizhubo4.js'),
  'utf8'
);
assert(
  '拉丝 stamp 用 holeSidesFromOrder，比分仍 teamsOf',
  /stamp\([\s\S]*holeSidesFromOrder\(game, order\)/.test(lasuoSrc) &&
    lasuoSrc.indexOf('const sides = teamsOf(order,') >= 0
);
assert(
  '地主婆 stamp 用 holeSidesFromOrder，比分仍 sidesOf',
  dizSrc.indexOf('holeSidesFromOrder(game, order)') >= 0 &&
    dizSrc.indexOf('const sides = sidesOf(order, mid);') >= 0 &&
    /function sidesOf\(order, mid\)/.test(dizSrc)
);

var scoreJs = require('fs').readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/scoring/pages/score/index.js'),
  'utf8'
);
assert(
  'score page 无玩法 if/else 算三角',
  scoreJs.indexOf('dizhuboMode') < 0 || scoreJs.indexOf('function rankColorOptions') >= 0
);
assert(
  'score page 不直接 deriveAssignment',
  scoreJs.indexOf('deriveAssignmentsFromOrder') < 0 &&
    scoreJs.indexOf('holeSidesFromOrder') < 0
);

console.log('RESULT passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
