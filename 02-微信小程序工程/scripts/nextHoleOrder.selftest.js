/**
 * 统一 next-hole ranking contract。
 * 运行：node scripts/nextHoleOrder.selftest.js
 */
var fs = require('fs');
var path = require('path');
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils');
var holeOrder = require(path.join(utilsDir, 'resolveNextHoleOrder.js'));
var settleLasuo4 = require(path.join(utilsDir, 'settleLasuo4.js'));
var settle8421Four = require(path.join(utilsDir, 'settle8421Four.js'));
var settleVegas = require(path.join(utilsDir, 'settleVegas.js'));
var assign = require(path.join(utilsDir, 'assignmentNormalize.js'));

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

function idsOf(list) {
  return (list || [])
    .map(function (row) {
      return row.playerId;
    })
    .sort()
    .join(',');
}

var src = fs.readFileSync(path.join(utilsDir, 'resolveNextHoleOrder.js'), 'utf8');
var srcCode = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
assert(
  'resolver 不含 catalogId / triangle / assignmentsByHole',
  srcCode.indexOf('catalogId') < 0 &&
    srcCode.indexOf('triangle') < 0 &&
    srcCode.indexOf('assignmentsByHole') < 0
);
assert(
  '缺省与未知 pushPolicy 都是 rerank',
  holeOrder.pushPolicyOf(undefined) === 'rerank' &&
    holeOrder.pushPolicyOf('') === 'rerank' &&
    holeOrder.pushPolicyOf('yes') === 'rerank' &&
    holeOrder.pushPolicyFromReorderOnPush({}) === 'rerank' &&
    holeOrder.pushPolicyFromReorderOnPush({ reorderOnPush: 'yes' }) === 'rerank' &&
    holeOrder.pushPolicyFromReorderOnPush({ reorderOnPush: 'no' }) === 'keep-combination'
);

var scores = {
  A: { rel: 5, pts: 0 },
  B: { rel: 3, pts: 0 },
  D: { rel: 4, pts: 0 },
  C: { rel: 6, pts: 0 }
};
var ranked = ['B', 'D', 'A', 'C'];
var baseInput = {
  currentOrder: ['A', 'B', 'C', 'D'],
  holeScores: scores,
  rankingPolicy: 'dynamic',
  rankingRule: { rankId: 'gross-origin' },
  pushPolicy: 'rerank',
  isPush: false,
  tieBreakContext: { history: [] }
};

var case1 = holeOrder.resolveNextHoleOrder(baseInput);
assert('CASE1 正常洞 ranking 正确', jsonEq(case1, ranked), JSON.stringify(case1));

var pushCopy = Object.assign({}, baseInput, { resultStatus: 'push' });
var winCopy = Object.assign({}, baseInput, { resultStatus: 'win' });
var lossCopy = Object.assign({}, baseInput, { resultStatus: 'loss' });
assert(
  'CASE6 pushPolicy=rerank 时 WIN/LOSS/PUSH 相同成绩 → nextOrder 相同',
  jsonEq(
    holeOrder.resolveNextHoleOrder(Object.assign({}, baseInput, { isPush: true, pushPolicy: 'rerank' })),
    ranked
  ) &&
    jsonEq(holeOrder.resolveNextHoleOrder(pushCopy), holeOrder.resolveNextHoleOrder(winCopy)) &&
    jsonEq(holeOrder.resolveNextHoleOrder(lossCopy), ranked)
);
assert(
  'CASE5 旧记录没有 pushPolicy → 默认 rerank（即使 isPush）',
  jsonEq(
    holeOrder.resolveNextHoleOrder({
      currentOrder: ['A', 'B', 'C', 'D'],
      holeScores: scores,
      rankingPolicy: 'dynamic',
      rankingRule: { rankId: 'gross-origin' },
      isPush: true,
      tieBreakContext: { history: [] }
    }),
    ranked
  )
);
assert(
  'keep-combination + isPush 保持 currentOrder',
  jsonEq(
    holeOrder.resolveNextHoleOrder(
      Object.assign({}, baseInput, { pushPolicy: 'keep-combination', isPush: true })
    ),
    ['A', 'B', 'C', 'D']
  )
);
assert(
  'CASE4 keep-combination 但非 PUSH → 正常 rerank',
  jsonEq(
    holeOrder.resolveNextHoleOrder(
      Object.assign({}, baseInput, { pushPolicy: 'keep-combination', isPush: false })
    ),
    ranked
  )
);

var tied = {
  A: { rel: 4, pts: 1 },
  B: { rel: 4, pts: 8 },
  C: { rel: 4, pts: 3 },
  D: { rel: 4, pts: 2 }
};
var tieOut = holeOrder.resolveNextHoleOrder({
  currentOrder: ['A', 'B', 'C', 'D'],
  holeScores: tied,
  rankingPolicy: 'dynamic',
  rankingRule: { rankId: 'gross-result' },
  tieBreakContext: { history: [] }
});
assert(
  'CASE3 raw score tie → tie-break 得唯一顺序',
  jsonEq(tieOut, ['B', 'C', 'D', 'A']) &&
    tieOut.slice().sort().join(',') === 'A,B,C,D',
  JSON.stringify(tieOut)
);

var h1 = holeOrder.resolveNextHoleOrder(baseInput);
var h2 = holeOrder.resolveNextHoleOrder({
  currentOrder: h1,
  holeScores: {
    B: { rel: 6 },
    D: { rel: 5 },
    A: { rel: 4 },
    C: { rel: 3 }
  },
  rankingPolicy: 'dynamic',
  rankingRule: { rankId: 'gross-origin' },
  tieBreakContext: { history: [scores] }
});
assert(
  'CASE4 连续多洞：每洞 nextOrder 根据上一洞成绩生成',
  jsonEq(h1, ranked) && jsonEq(h2, ['C', 'A', 'D', 'B']),
  JSON.stringify({ h1: h1, h2: h2 })
);

assert(
  'CASE5 固定 rankingPolicy 保持 currentOrder',
  jsonEq(
    holeOrder.resolveNextHoleOrder(Object.assign({}, baseInput, { rankingPolicy: 'fixed' })),
    ['A', 'B', 'C', 'D']
  )
);

function lasuoGame(groupMode) {
  return {
    catalogId: 'lasuo-4',
    groupMode: groupMode || 'random',
    rankId: 'gross-origin',
    playerOrder: ['A', 'B', 'C', 'D'],
    players: ['A', 'B', 'C', 'D'].map(function (id) {
      return { id: id };
    }),
    multiplier: 1,
    holes: [
      { label: 'A1', on: true },
      { label: 'A2', on: true },
      { label: 'A3', on: true }
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

var WIN = { A: 6, B: 3, C: 4, D: 7 };
var PUSH = { A: 5, B: 4, C: 6, D: 5 };
var winSettle = settleLasuo4.settle(lasuoGame('random'), {
  scores: { A1: WIN },
  holeOrder: ['A1', 'A2'],
  pars: { A1: 4, A2: 4 }
});
var pushSettle = settleLasuo4.settle(lasuoGame('random'), {
  scores: { A1: PUSH },
  holeOrder: ['A1', 'A2'],
  pars: { A1: 4, A2: 4 }
});

assert(
  'lasuo-4 非push：orderByHole[A2] 为 ranking 结果',
  jsonEq(winSettle.orderByHole.A2, ['B', 'C', 'A', 'D']),
  JSON.stringify(winSettle.orderByHole)
);

assert(
  'CASE1 无 push config 的 lasuo-4 + PUSH → rerank',
  jsonEq(pushSettle.orderByHole.A2, ['B', 'A', 'D', 'C']),
  JSON.stringify(pushSettle.orderByHole)
);

function fourGame(mode) {
  return {
    catalogId: '8421-4',
    groupMode: mode || 'random',
    rankId: 'gross-origin',
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
      reward: 'none',
      pushRule: 'tie',
      meatEatMode: 'piece',
      meatValueType: 'fixed',
      meatValueN: 1,
      baoNeg: 'none'
    }
  };
}

var fourRels = { A: 5, B: 3, C: 6, D: 4 };
var fourWin = settle8421Four.settle(fourGame('random'), {
  scores: { '1': fourRels },
  holeOrder: ['1', '2'],
  pars: { '1': 4, '2': 4 }
});
var expectedFour = holeOrder.resolveNextHoleOrder({
  currentOrder: ['A', 'B', 'C', 'D'],
  holeScores: {
    A: { rel: 5 },
    B: { rel: 3 },
    C: { rel: 6 },
    D: { rel: 4 }
  },
  rankingPolicy: 'dynamic',
  rankingRule: { rankId: 'gross-origin' },
  tieBreakContext: { history: [] }
});
assert(
  '8421-4 不再因 push/输赢冻结：orderByHole[2] 等于公共 resolver',
  jsonEq(fourWin.orderByHole['2'], expectedFour) && jsonEq(expectedFour, ['B', 'D', 'A', 'C']),
  JSON.stringify({ got: fourWin.orderByHole, expected: expectedFour })
);

assert(
  'CASE7 assignment 使用新 order，player 集合一致',
  jsonEq(fourWin.orderByHole['2'], ['B', 'D', 'A', 'C']) &&
    idsOf(fourWin.assignmentsByHole['2']) === 'A,B,C,D' &&
    jsonEq(
      fourWin.assignmentsByHole['2'],
      assign.fromAbTeams(['B', 'C'], ['D', 'A'])
    ),
  JSON.stringify(fourWin.assignmentsByHole)
);

var multi = settleLasuo4.settle(lasuoGame('random'), {
  scores: { A1: WIN, A2: { A: 4, B: 6, C: 3, D: 5 } },
  holeOrder: ['A1', 'A2', 'A3'],
  pars: { A1: 4, A2: 4, A3: 4 }
});
assert(
  'CASE4 集成：A3 order 来自 A2 成绩而非开球序',
  jsonEq(multi.orderByHole.A1, ['A', 'B', 'C', 'D']) &&
    !jsonEq(multi.orderByHole.A3, ['A', 'B', 'C', 'D']) &&
    idsOf(multi.assignmentsByHole.A3) === multi.orderByHole.A3.slice().sort().join(','),
  JSON.stringify(multi.orderByHole)
);

var fixed = settle8421Four.settle(fourGame('fixed'), {
  scores: { '1': fourRels },
  holeOrder: ['1', '2'],
  pars: { '1': 4, '2': 4 }
});
assert(
  'fixed rankingPolicy 保持开球序',
  jsonEq(fixed.orderByHole['2'], ['A', 'B', 'C', 'D'])
);

function vegasGame(reorderOnPush, extra) {
  extra = extra || {};
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
      pushRule: extra.pushRule || 'push',
      pushWithinN: extra.pushWithinN,
      reorderOnPush: reorderOnPush,
      meatValueType: 'fixed',
      meatValueN: 1
    }
  };
}

var vegasPushRels = { A: 5, B: 3, C: 6, D: 4 };
var vegasPushCfg = { pushRule: 'within-n', pushWithinN: 100 };
var vegasKeep = settleVegas.settle(vegasGame('no', vegasPushCfg), {
  scores: { '1': vegasPushRels },
  holeOrder: ['1', '2'],
  pars: { '1': 4, '2': 4 }
});
var vegasRerank = settleVegas.settle(vegasGame('yes', vegasPushCfg), {
  scores: { '1': vegasPushRels },
  holeOrder: ['1', '2'],
  pars: { '1': 4, '2': 4 }
});
var vegasWin = settleVegas.settle(vegasGame('no'), {
  scores: { '1': vegasPushRels },
  holeOrder: ['1', '2'],
  pars: { '1': 4, '2': 4 }
});

assert(
  'CASE3 配置顶洞不更换组合 + PUSH → assignment N+1 === assignment N',
  jsonEq(vegasKeep.orderByHole['1'], ['A', 'B', 'C', 'D']) &&
    jsonEq(vegasKeep.orderByHole['2'], ['A', 'B', 'C', 'D']) &&
    jsonEq(vegasKeep.assignmentsByHole['2'], vegasKeep.assignmentsByHole['1']),
  JSON.stringify({
    order: vegasKeep.orderByHole,
    a1: vegasKeep.assignmentsByHole['1'],
    a2: vegasKeep.assignmentsByHole['2']
  })
);

assert(
  'CASE2 配置顶洞更换组合 + PUSH → rerank',
  jsonEq(vegasRerank.orderByHole['2'], ['B', 'D', 'A', 'C']) &&
    !jsonEq(vegasRerank.assignmentsByHole['2'], vegasRerank.assignmentsByHole['1']),
  JSON.stringify({
    order: vegasRerank.orderByHole,
    a1: vegasRerank.assignmentsByHole['1'],
    a2: vegasRerank.assignmentsByHole['2']
  })
);

assert(
  'CASE4 集成：顶洞不更换组合但本洞非 PUSH → 正常 rerank',
  jsonEq(vegasWin.orderByHole['2'], ['B', 'D', 'A', 'C']),
  JSON.stringify(vegasWin.orderByHole)
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
  'CASE7 triangle 不判断 PUSH，只读投影；相同 assignment 即相同三角',
  srcMark.indexOf('isPush') < 0 &&
    srcProj.indexOf('isPush') < 0 &&
    srcMark.indexOf('assignmentsByHole') < 0 &&
    jsonEq(vegasKeep.assignmentsByHole['2'], vegasKeep.assignmentsByHole['1'])
);

console.log('RESULT passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
