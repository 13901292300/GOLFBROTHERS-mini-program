/**
 * 第一批 A 固化 fixture。运行时不得读取 04-游戏沙盒。
 * 数值已与沙盒 settleGame 对照一致后冻结。
 */
function ids(n) {
  var out = [];
  for (var i = 1; i <= n; i++) out.push({ id: 'p' + i });
  return out;
}

function order(n) {
  var out = [];
  for (var i = 1; i <= n; i++) out.push('p' + i);
  return out;
}

function card(n, rels) {
  var o = {};
  for (var i = 0; i < n; i++) o['p' + (i + 1)] = rels[i];
  return o;
}

function scoresN(n, holeOrder, rows) {
  var scores = {};
  holeOrder.forEach(function (h, hi) {
    scores[h] = card(n, rows[hi] || rows[0]);
  });
  return scores;
}

var HOLES2 = ['A1', 'A2'];
var FRONT9 = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9'];
var BACK9 = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'];

var ALL_RULE_IDS = [
  'stroke-2',
  'match-2',
  '8421-2',
  'three-set',
  'youcai',
  'landlord-big',
  'landlord-mid',
  'landlord-small',
  '8421-3',
  'lasuo-4',
  '8421-4',
  'three-vs-one',
  'dizhubo-4',
  'vegas',
  'skins',
  'lasuo-n',
  'horn'
];

var UNSUPPORTED_SETTLE_IDS = ['skins'];

function inputOf(name) {
  var map = {
    'stroke-2': {
      matchId: 'm1',
      sideGameId: 'sg-stroke-2',
      ruleId: 'stroke-2',
      holeOrder: HOLES2,
      sideGame: {
        players: ids(2),
        pairings: [{ leftId: 'p1', rightId: 'p2', on: true }],
        multiplier: 1,
        ruleSnapshot: { reward: 'none' }
      },
      scores: scoresN(2, HOLES2, [[-1, 0], [0, 0]])
    },
    'match-2': {
      matchId: 'm1',
      sideGameId: 'sg-match-2',
      ruleId: 'match-2',
      holeOrder: HOLES2,
      sideGame: {
        players: ids(2),
        pairings: [{ leftId: 'p1', rightId: 'p2', on: true, strokes: 0 }],
        multiplier: 1,
        ruleSnapshot: { reward: 'none', pushRule: 'none' }
      },
      scores: scoresN(2, HOLES2, [[-1, 0], [1, 0]])
    },
    '8421-2': {
      matchId: 'm1',
      sideGameId: 'sg-8421-2',
      ruleId: '8421-2',
      holeOrder: HOLES2,
      sideGame: {
        players: ids(2),
        pairings: [{ leftId: 'p1', rightId: 'p2', on: true }],
        multiplier: 1,
        ruleSnapshot: { scoreCode: '8421', pushRule: 'none' }
      },
      scores: scoresN(2, HOLES2, [[-1, 0], [0, 1]])
    },
    'landlord-big': {
      matchId: 'm1',
      sideGameId: 'sg-landlord-big',
      ruleId: 'landlord-big',
      holeOrder: HOLES2,
      sideGame: {
        players: ids(3),
        playerOrder: order(3),
        groupMode: 'fixed',
        multiplier: 1,
        ruleSnapshot: { reward: 'none', pushRule: 'none' }
      },
      scores: scoresN(3, HOLES2, [[-1, 0, 1], [0, 0, 1]])
    },
    'landlord-mid': {
      matchId: 'm1',
      sideGameId: 'sg-landlord-mid',
      ruleId: 'landlord-mid',
      holeOrder: HOLES2,
      sideGame: {
        players: ids(3),
        playerOrder: order(3),
        groupMode: 'fixed',
        multiplier: 1,
        ruleSnapshot: { reward: 'none', pushRule: 'none' }
      },
      scores: scoresN(3, HOLES2, [[0, -1, 1], [1, 0, 1]])
    },
    'landlord-small': {
      matchId: 'm1',
      sideGameId: 'sg-landlord-small',
      ruleId: 'landlord-small',
      holeOrder: HOLES2,
      sideGame: {
        players: ids(3),
        playerOrder: order(3),
        groupMode: 'fixed',
        multiplier: 1,
        ruleSnapshot: { reward: 'none', pushRule: 'none' }
      },
      scores: scoresN(3, HOLES2, [[-1, 0, 1], [0, 0, 1]])
    },
    '8421-3': {
      matchId: 'm1',
      sideGameId: 'sg-8421-3',
      ruleId: '8421-3',
      holeOrder: HOLES2,
      sideGame: {
        players: ids(3),
        playerOrder: order(3),
        groupMode: 'fixed',
        multiplier: 1,
        ruleSnapshot: { scoreCode: '8421', pushRule: 'none' }
      },
      scores: scoresN(3, HOLES2, [[-1, 0, 0], [0, -1, 1]])
    },
    'lasuo-4': {
      matchId: 'm1',
      sideGameId: 'sg-lasuo-4',
      ruleId: 'lasuo-4',
      holeOrder: HOLES2,
      sideGame: {
        players: ids(4),
        playerOrder: order(4),
        groupMode: 'fixed',
        multiplier: 1,
        ruleSnapshot: {
          reward: 'none',
          pushRule: 'none',
          pkBetter: true,
          pkWorse: false,
          pkTotal: false
        }
      },
      scores: scoresN(4, HOLES2, [[-1, 0, 1, 2], [0, 0, 1, 1]])
    },
    '8421-4': {
      matchId: 'm1',
      sideGameId: 'sg-8421-4',
      ruleId: '8421-4',
      holeOrder: HOLES2,
      sideGame: {
        players: ids(4),
        playerOrder: order(4),
        groupMode: 'fixed',
        multiplier: 1,
        ruleSnapshot: { scoreCode: '8421', pushRule: 'none' }
      },
      scores: scoresN(4, HOLES2, [[-1, 0, 1, 2], [0, 0, 0, 1]])
    },
    'three-vs-one': {
      matchId: 'm1',
      sideGameId: 'sg-three-vs-one',
      ruleId: 'three-vs-one',
      holeOrder: HOLES2,
      sideGame: {
        players: ids(4),
        playerOrder: order(4),
        groupMode: 'fixed',
        multiplier: 1,
        ruleSnapshot: { reward: 'none', pushRule: 'none' }
      },
      scores: scoresN(4, HOLES2, [[-1, 0, 1, 2], [0, 1, 1, 1]])
    },
    'dizhubo-4': {
      matchId: 'm1',
      sideGameId: 'sg-dizhubo-4',
      ruleId: 'dizhubo-4',
      holeOrder: HOLES2,
      sideGame: {
        players: ids(4),
        playerOrder: order(4),
        dizhuboMode: 'big',
        groupMode: 'fixed',
        multiplier: 1,
        ruleSnapshot: { reward: 'none', pushRule: 'none' }
      },
      scores: scoresN(4, HOLES2, [[-1, 0, 1, 2], [0, 0, 1, 2]])
    },
    vegas: {
      matchId: 'm1',
      sideGameId: 'sg-vegas',
      ruleId: 'vegas',
      holeOrder: HOLES2,
      sideGame: {
        players: ids(4),
        playerOrder: order(4),
        groupMode: 'fixed',
        multiplier: 1,
        ruleSnapshot: { reward: 'none', pushRule: 'none' }
      },
      scores: scoresN(4, HOLES2, [[-1, 0, 1, 2], [0, 0, 0, 1]])
    },
    horn: {
      matchId: 'm1',
      sideGameId: 'sg-horn',
      ruleId: 'horn',
      holeOrder: HOLES2,
      sideGame: {
        players: ids(5),
        playerOrder: order(5),
        sortUpdate: 'fixed',
        formation: 'jianghu',
        multiplier: 1,
        rewardOn: false,
        pushRule: 'none',
        flowerK: 1
      },
      scores: scoresN(5, HOLES2, [[-2, -1, 0, 1, 2], [0, 0, 1, 1, 2]])
    },
    'lasuo-n': {
      matchId: 'm1',
      sideGameId: 'sg-lasuo-n',
      ruleId: 'lasuo-n',
      holeOrder: HOLES2,
      sideGame: {
        players: ids(6),
        playerOrder: order(6),
        sortUpdate: 'fixed',
        formation: 'jianghu',
        multiplier: 1,
        rewardOn: false,
        pushRule: 'none',
        pairCoeffs: [1, 1, 1]
      },
      scores: scoresN(6, HOLES2, [[-2, -1, 0, 1, 1, 2], [0, 0, 0, 1, 1, 2]])
    },
    'front9-stroke': {
      matchId: 'm1',
      sideGameId: 'sg-front9',
      ruleId: 'stroke-2',
      holeOrder: FRONT9,
      sideGame: {
        players: ids(2),
        pairings: [{ leftId: 'p1', rightId: 'p2', on: true }],
        multiplier: 1,
        ruleSnapshot: { reward: 'none' }
      },
      scores: scoresN(2, FRONT9, [[-1, 0]])
    },
    'back9-stroke': {
      matchId: 'm1',
      sideGameId: 'sg-back9',
      ruleId: 'stroke-2',
      holeOrder: BACK9,
      sideGame: {
        players: ids(2),
        pairings: [{ leftId: 'p1', rightId: 'p2', on: true }],
        multiplier: 1,
        ruleSnapshot: { reward: 'none' }
      },
      scores: scoresN(2, BACK9, [[0, 1]])
    }
  };
  return JSON.parse(JSON.stringify(map[name]));
}

var EXPECTED = {
  'stroke-2': {
    byHole: {
      A1: { __pot__: 0, p1: 1, p2: -1 },
      A2: { __pot__: 0, p1: 0, p2: 0 }
    },
    initial: { p1: 0, p2: 0, __pot__: 0 },
    catalogId: 'stroke-2',
    settleVersion: 'v53-4.1.1',
    rewardState: 'none'
  },
  'match-2': {
    byHole: {
      A1: { __pot__: 0, p1: 1, p2: -1 },
      A2: { __pot__: 0, p2: 1, p1: -1 }
    },
    initial: { p1: 0, p2: 0, __pot__: 0 },
    catalogId: 'match-2',
    settleVersion: 'v53-4.1.2',
    mulState: 'none',
    topHoleStates: {}
  },
  '8421-2': {
    byHole: {
      A1: { __pot__: 0, p1: 4, p2: -4 },
      A2: { __pot__: 0, p1: 2, p2: -2 }
    },
    initial: { p1: 0, p2: 0, __pot__: 0 },
    catalogId: '8421-2',
    settleVersion: 'v53-4.1.3',
    topHoleStates: {}
  },
  'landlord-big': {
    byHole: {
      A1: { __pot__: 0, p1: 2, p2: -1, p3: -1 },
      A2: { __pot__: 0, p1: 0, p2: 0, p3: 0 }
    },
    orderByHole: { A1: ['p1', 'p2', 'p3'], A2: ['p1', 'p2', 'p3'] },
    initial: { p1: 0, p2: 0, p3: 0, __pot__: 0 },
    catalogId: 'landlord-big',
    topHoleStates: {}
  },
  'landlord-mid': {
    byHole: {
      A1: { __pot__: 0, p2: 2, p1: -1, p3: -1 },
      A2: { __pot__: 0, p2: 2, p1: -1, p3: -1 }
    },
    orderByHole: { A1: ['p1', 'p2', 'p3'], A2: ['p1', 'p2', 'p3'] },
    initial: { p1: 0, p2: 0, p3: 0, __pot__: 0 },
    catalogId: 'landlord-mid',
    topHoleStates: {}
  },
  'landlord-small': {
    byHole: {
      A1: { __pot__: 0, p3: -2, p1: 1, p2: 1 },
      A2: { __pot__: 0, p3: -2, p1: 1, p2: 1 }
    },
    orderByHole: { A1: ['p1', 'p2', 'p3'], A2: ['p1', 'p2', 'p3'] },
    initial: { p1: 0, p2: 0, p3: 0, __pot__: 0 },
    catalogId: 'landlord-small',
    topHoleStates: {},
    settleVersion: 'v53-4.2.3',
    meatPool: 0,
    orderHistory: [
      { hole: 'A1', orderBefore: ['p1', 'p2', 'p3'], orderAfter: ['p1', 'p2', 'p3'] },
      { hole: 'A2', orderBefore: ['p1', 'p2', 'p3'], orderAfter: ['p1', 'p2', 'p3'] }
    ],
    playerTotals: { p1: 2, p2: 2, p3: -4, __pot__: 0 }
  },
  '8421-3': {
    byHole: {
      A1: { __pot__: 0, p1: 4, p3: 4, p2: -8 },
      A2: { __pot__: 0, p2: 20, p1: -10, p3: -10 }
    },
    orderByHole: { A1: ['p1', 'p2', 'p3'], A2: ['p1', 'p2', 'p3'] },
    initial: { p1: 0, p2: 0, p3: 0, __pot__: 0 },
    catalogId: '8421-3',
    settleVersion: 'v53-4.1.3',
    topHoleStates: {}
  },
  'lasuo-4': {
    byHole: {
      A1: { __pot__: 0, p1: 1, p2: 1, p3: -1, p4: -1 },
      A2: { __pot__: 0, p1: 1, p2: 1, p3: -1, p4: -1 }
    },
    orderByHole: { A1: ['p1', 'p2', 'p3', 'p4'], A2: ['p1', 'p2', 'p3', 'p4'] },
    initial: { p1: 0, p2: 0, p3: 0, p4: 0, __pot__: 0 },
    catalogId: 'lasuo-4',
    settleVersion: 'v53-4.3.1',
    topHoleStates: {},
    holeDebug: {
      A1: {
        selectedIndicators: { better: true, worse: false, total: false },
        indicatorWeights: { better: 1, worse: 0, total: 0 },
        indicatorResults: { better: 1, worse: 0, total: 0, sum: 1 },
        baseTeamScore: 1,
        rewardMode: 'none',
        addRewardA: 0,
        addRewardB: 0,
        winningTeam: 'A',
        multiplierSource: 'none',
        multiplier: 1,
        rewardedTeamScore: 1,
        K: 1,
        finalTeamScore: 1,
        settleVersion: 'v53-4.3.1',
        personalScores: { p1: 1, p2: 1, p3: -1, p4: -1 }
      },
      A2: {
        selectedIndicators: { better: true, worse: false, total: false },
        indicatorWeights: { better: 1, worse: 0, total: 0 },
        indicatorResults: { better: 1, worse: 0, total: 0, sum: 1 },
        baseTeamScore: 1,
        rewardMode: 'none',
        addRewardA: 0,
        addRewardB: 0,
        winningTeam: 'A',
        multiplierSource: 'none',
        multiplier: 1,
        rewardedTeamScore: 1,
        K: 1,
        finalTeamScore: 1,
        settleVersion: 'v53-4.3.1',
        personalScores: { p1: 1, p2: 1, p3: -1, p4: -1 }
      }
    }
  },
  '8421-4': {
    byHole: {
      A1: { __pot__: 0, p1: 9, p2: 9, p3: -9, p4: -9 },
      A2: { __pot__: 0, p1: 2, p2: 2, p3: -2, p4: -2 }
    },
    orderByHole: { A1: ['p1', 'p2', 'p3', 'p4'], A2: ['p1', 'p2', 'p3', 'p4'] },
    initial: { p1: 0, p2: 0, p3: 0, p4: 0, __pot__: 0 },
    catalogId: '8421-4',
    settleVersion: 'v53-4.1.3',
    topHoleStates: {}
  },
  'three-vs-one': {
    byHole: {
      A1: { __pot__: 0, p1: 3, p2: -1, p3: -1, p4: -1 },
      A2: { __pot__: 0, p1: 3, p2: -1, p3: -1, p4: -1 }
    },
    orderByHole: { A1: ['p1', 'p2', 'p3', 'p4'], A2: ['p1', 'p2', 'p3', 'p4'] },
    initial: { p1: 0, p2: 0, p3: 0, p4: 0, __pot__: 0 },
    catalogId: 'three-vs-one',
    topHoleStates: {}
  },
  'dizhubo-4': {
    byHole: {
      A1: { __pot__: 0, p1: 1, p4: 1, p2: -1, p3: -1 },
      A2: { __pot__: 0, p1: 0, p2: 0, p3: 0, p4: 0 }
    },
    orderByHole: { A1: ['p1', 'p2', 'p3', 'p4'], A2: ['p1', 'p2', 'p3', 'p4'] },
    initial: { p1: 0, p2: 0, p3: 0, p4: 0, __pot__: 0 },
    catalogId: 'dizhubo-4',
    topHoleStates: {}
  },
  vegas: {
    byHole: {
      A1: { __pot__: 0, p1: 31, p2: 31, p3: -31, p4: -31 },
      A2: { __pot__: 0, p1: 1, p2: 1, p3: -1, p4: -1 }
    },
    orderByHole: { A1: ['p1', 'p2', 'p3', 'p4'], A2: ['p1', 'p2', 'p3', 'p4'] },
    initial: { p1: 0, p2: 0, p3: 0, p4: 0, __pot__: 0 },
    catalogId: 'vegas',
    topHoleStates: {}
  },
  horn: {
    byHole: { A1: { __pot__: 0 }, A2: { __pot__: 0 } },
    totals: { p1: 0, p2: 0, p3: 0, p4: 0, p5: 0, __pot__: 0 },
    orderByHole: {
      A1: ['p1', 'p2', 'p3', 'p4', 'p5'],
      A2: ['p1', 'p2', 'p3', 'p4', 'p5']
    },
    meatEatCount: 0,
    topHoleStates: {}
  },
  'lasuo-n': {
    byHole: {
      A1: { __pot__: 0, p1: -1, p2: 1, p3: 1, p4: -1, p5: 1, p6: -1 },
      A2: { __pot__: 0, p1: -2, p2: 2, p3: 2, p4: -2, p5: 2, p6: -2 }
    },
    totals: { p1: -3, p2: 3, p3: 3, p4: -3, p5: 3, p6: -3, __pot__: 0 },
    orderByHole: {
      A1: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
      A2: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
    },
    meatEatCount: 0,
    topHoleStates: {}
  }
};

module.exports = {
  ids: ids,
  order: order,
  HOLES2: HOLES2,
  FRONT9: FRONT9,
  BACK9: BACK9,
  ALL_RULE_IDS: ALL_RULE_IDS,
  UNSUPPORTED_SETTLE_IDS: UNSUPPORTED_SETTLE_IDS,
  inputOf: inputOf,
  EXPECTED: EXPECTED
};
