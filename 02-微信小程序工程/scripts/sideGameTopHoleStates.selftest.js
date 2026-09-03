/**
 * Focused top-hole state coverage for settlement engines.
 * Run: node scripts/sideGameTopHoleStates.selftest.js
 */
var fs = require('fs');
var path = require('path');

var utilsDir = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils');
var core = require(path.join(utilsDir, 'settleCore.js'));

var passed = 0;
var failed = 0;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  var out = {};
  Object.keys(value).sort().forEach(function (key) {
    out[key] = canonical(value[key]);
  });
  return out;
}

function same(actual, expected) {
  return JSON.stringify(canonical(actual)) === JSON.stringify(canonical(expected));
}

function assert(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function players(ids, scoreCode) {
  return ids.map(function (id) {
    return { id: id, scoreCode: scoreCode || undefined };
  });
}

function rows(value) {
  return ['le-2', 'm1', 'par', 'p1', 'ge-1', 'ge-2'].map(function (id) {
    return { id: id, value: String(value) };
  });
}

function baseGame(catalogId, ids, rule) {
  return {
    catalogId: catalogId,
    players: players(ids, catalogId.indexOf('8421-') === 0 ? '8421' : ''),
    playerOrder: ids.slice(),
    groupMode: 'fixed',
    sortUpdate: 'fixed',
    multiplier: 1,
    holes: ['C1', 'C2', 'C3', 'C4'].map(function (label) {
      return { label: label, on: true };
    }),
    ruleSnapshot: Object.assign(
      {
        reward: 'none',
        pushRule: 'tie',
        meatEatMode: 'piece',
        meatValueType: 'fixed',
        meatValueN: 1,
        meatInclude: 'no',
        meatRows: rows(1),
        baoMode: 'none',
        baoNeg: 'none'
      },
      rule || {}
    )
  };
}

function context(scoreRows, count) {
  var order = ['C1', 'C2', 'C3', 'C4'].slice(0, count);
  var scores = {};
  var pars = {};
  order.forEach(function (label) {
    scores[label] = scoreRows[label];
    pars[label] = 4;
  });
  return { holeOrder: order, scores: scores, pars: pars, windOn: false };
}

function zeroSum(ledger) {
  var sum = 0;
  Object.keys(ledger || {}).forEach(function (id) {
    sum += Number(ledger[id]) || 0;
  });
  return Math.abs(core.round1(sum)) < 0.05;
}

function stateOnly(out) {
  return Object.keys(out.byHole || {}).every(function (label) {
    var ledger = out.byHole[label] || {};
    return (
      !Object.prototype.hasOwnProperty.call(ledger, 'topHoleStates') &&
      !Object.prototype.hasOwnProperty.call(ledger, label) &&
      Object.keys(ledger).every(function (key) {
        return ledger[key] !== 'pending' && ledger[key] !== 'consumed';
      })
    );
  });
}

function runCatalog(spec) {
  var one = spec.module.settle(spec.game(), context(spec.scores, 1));
  var two = spec.module.settle(spec.game(), context(spec.scores, 2));
  var three = spec.module.settle(spec.game(), context(spec.scores, 3));
  var four = spec.module.settle(spec.game(), context(spec.scores, 4));

  assert(spec.id + ' C1 push is pending', same(one.topHoleStates, { C1: 'pending' }), JSON.stringify(one.topHoleStates));
  assert(
    spec.id + ' C1+C2 pushes are pending',
    same(two.topHoleStates, { C1: 'pending', C2: 'pending' }),
    JSON.stringify(two.topHoleStates)
  );
  assert(
    spec.id + ' C3 eats exactly C1 FIFO',
    same(three.topHoleStates, { C1: 'consumed', C2: 'pending' }),
    JSON.stringify(three.topHoleStates)
  );
  assert(
    spec.id + ' C4 eats exactly C2 FIFO',
    same(four.topHoleStates, { C1: 'consumed', C2: 'consumed' }),
    JSON.stringify(four.topHoleStates)
  );
  assert(
    spec.id + ' ledgers stay zero-sum and state-free',
    ['C1', 'C2', 'C3', 'C4'].every(function (label) {
      return zeroSum(four.byHole[label]);
    }) && stateOnly(four),
    JSON.stringify(four.byHole)
  );
  if (spec.expectedC3) {
    assert(spec.id + ' exact C3 ledger', same(four.byHole.C3, spec.expectedC3), JSON.stringify(four.byHole.C3));
    assert(spec.id + ' exact C4 ledger', same(four.byHole.C4, spec.expectedC3), JSON.stringify(four.byHole.C4));
  }
}

var tie2 = { A: 0, B: 0 };
var win2 = { A: -1, B: 0 };
var tie3 = { A: 0, B: 0, C: 0 };
var tie4 = { A: 0, B: 0, C: 0, D: 0 };
var tie5 = { A: 0, B: 0, C: 0, D: 0, E: 0 };

var specs = [
  {
    id: 'match-2',
    module: require(path.join(utilsDir, 'settleMatch2.js')),
    game: function () {
      var game = baseGame('match-2', ['A', 'B']);
      game.pairings = [{ id: 'p1', leftId: 'A', rightId: 'B', on: true }];
      return game;
    },
    scores: { C1: tie2, C2: tie2, C3: win2, C4: win2 },
    expectedC3: { __pot__: 0, A: 2, B: -2 }
  },
  {
    id: '8421-2',
    module: require(path.join(utilsDir, 'settle8421.js')),
    game: function () {
      var game = baseGame('8421-2', ['A', 'B']);
      game.pairings = [{ id: 'p1', leftId: 'A', rightId: 'B', on: true }];
      return game;
    },
    scores: { C1: tie2, C2: tie2, C3: win2, C4: win2 },
    expectedC3: { __pot__: 0, A: 5, B: -5 }
  },
  {
    id: 'landlord-big',
    module: require(path.join(utilsDir, 'settleLandlordBig.js')),
    game: function () { return baseGame('landlord-big', ['A', 'B', 'C']); },
    scores: { C1: tie3, C2: tie3, C3: { A: -1, B: 0, C: 0 }, C4: { A: -1, B: 0, C: 0 } },
    expectedC3: { __pot__: 0, A: 4, B: -2, C: -2 }
  },
  {
    id: 'landlord-mid',
    module: require(path.join(utilsDir, 'settleLandlordMid.js')),
    game: function () { return baseGame('landlord-mid', ['A', 'B', 'C']); },
    scores: { C1: tie3, C2: tie3, C3: { A: 0, B: -1, C: 0 }, C4: { A: 0, B: -1, C: 0 } },
    expectedC3: { __pot__: 0, B: 4, A: -2, C: -2 }
  },
  {
    id: 'landlord-small',
    module: require(path.join(utilsDir, 'settleLandlordSmall.js')),
    game: function () { return baseGame('landlord-small', ['A', 'B', 'C']); },
    scores: { C1: tie3, C2: tie3, C3: { A: 0, B: 0, C: -1 }, C4: { A: 0, B: 0, C: -1 } },
    expectedC3: { __pot__: 0, C: 4, A: -2, B: -2 }
  },
  {
    id: '8421-3',
    module: require(path.join(utilsDir, 'settle8421Three.js')),
    game: function () { return baseGame('8421-3', ['A', 'B', 'C']); },
    scores: { C1: tie3, C2: tie3, C3: { A: -1, B: 0, C: 0 }, C4: { A: -1, B: 0, C: 0 } },
    expectedC3: { __pot__: 0, A: 5, C: 5, B: -10 }
  },
  {
    id: '8421-4',
    module: require(path.join(utilsDir, 'settle8421Four.js')),
    game: function () { return baseGame('8421-4', ['A', 'B', 'C', 'D']); },
    scores: { C1: tie4, C2: tie4, C3: { A: -1, B: 0, C: 0, D: 0 }, C4: { A: -1, B: 0, C: 0, D: 0 } },
    expectedC3: { __pot__: 0, A: 5, B: 5, C: -5, D: -5 }
  },
  {
    id: 'lasuo-4',
    module: require(path.join(utilsDir, 'settleLasuo4.js')),
    game: function () {
      return baseGame('lasuo-4', ['A', 'B', 'C', 'D'], {
        pkBetter: true,
        pkWorse: true,
        pkTotal: true,
        pkBetterW: 1,
        pkWorseW: 1,
        pkTotalW: 1,
        pkTotalMode: 'sum'
      });
    },
    scores: { C1: tie4, C2: tie4, C3: { A: -1, B: 0, C: 1, D: 1 }, C4: { A: -1, B: 0, C: 1, D: 1 } },
    expectedC3: { __pot__: 0, A: 4, B: 4, C: -4, D: -4 }
  },
  {
    id: 'three-vs-one',
    module: require(path.join(utilsDir, 'settleThreeVsOne.js')),
    game: function () { return baseGame('three-vs-one', ['A', 'B', 'C', 'D'], { tvoCompare: 'best', meatCount: 1 }); },
    scores: { C1: tie4, C2: tie4, C3: { A: -1, B: 0, C: 0, D: 0 }, C4: { A: -1, B: 0, C: 0, D: 0 } },
    expectedC3: { __pot__: 0, A: 6, B: -2, C: -2, D: -2 }
  },
  {
    id: 'dizhubo-4',
    module: require(path.join(utilsDir, 'settleDizhubo4.js')),
    game: function () { return baseGame('dizhubo-4', ['A', 'B', 'C', 'D']); },
    scores: { C1: tie4, C2: tie4, C3: { A: -1, B: 0, C: 0, D: 0 }, C4: { A: -1, B: 0, C: 0, D: 0 } },
    expectedC3: { __pot__: 0, A: 2, D: 2, B: -2, C: -2 }
  },
  {
    id: 'vegas',
    module: require(path.join(utilsDir, 'settleVegas.js')),
    game: function () { return baseGame('vegas', ['A', 'B', 'C', 'D']); },
    scores: { C1: tie4, C2: tie4, C3: { A: 0, B: 0, C: 0, D: 1 }, C4: { A: 0, B: 0, C: 0, D: 1 } },
    expectedC3: { __pot__: 0, A: 2, B: 2, C: -2, D: -2 }
  },
  {
    id: 'lasuo-n',
    module: require(path.join(utilsDir, 'settleLasuoN.js')),
    game: function () {
      var game = baseGame('lasuo-n', ['A', 'B', 'C', 'D']);
      game.pushRule = 'all-tie';
      game.formation = 'jianghu';
      game.pairCoeffs = [{ value: 1 }, { value: 1 }];
      return game;
    },
    scores: { C1: tie4, C2: tie4, C3: { A: -1, B: 0, C: 0, D: 0 }, C4: { A: -1, B: 0, C: 0, D: 0 } },
    expectedC3: { __pot__: 0, A: 2, D: 2, B: -2, C: -2 }
  }
];

specs.forEach(runCatalog);

function multiPairGame(catalogId) {
  var game = baseGame(catalogId, ['A', 'B', 'C', 'D']);
  game.pairings = [
    { id: 'ab', leftId: 'A', rightId: 'B', on: true },
    { id: 'cd', leftId: 'C', rightId: 'D', on: true }
  ];
  return game;
}

function multiPairScores() {
  var tie = { A: 0, B: 0, C: 0, D: 0 };
  var second = { A: -1, B: 0, C: 0, D: 0 };
  var third = { A: -1, B: 0, C: -1, D: 0 };
  return {
    C1: tie,
    C2: second,
    C3: third,
    C4: third
  };
}

['match-2', '8421-2'].forEach(function (id) {
  var module = id === 'match-2' ? require(path.join(utilsDir, 'settleMatch2.js')) : require(path.join(utilsDir, 'settle8421.js'));
  var game = multiPairGame(id);
  var scores = multiPairScores();
  var afterC2 = module.settle(game, context(scores, 2));
  var afterC3 = module.settle(game, context(scores, 3));
  var afterC4 = module.settle(game, context(scores, 4));
  assert(
    id + ' multi-pair pending precedence keeps C1 pending',
    same(afterC2.topHoleStates, { C1: 'pending', C2: 'pending' }),
    JSON.stringify(afterC2.topHoleStates)
  );
  assert(
    id + ' multi-pair trackers consume independently',
    same(afterC3.topHoleStates, { C1: 'consumed', C2: 'pending' }) &&
      same(afterC4.topHoleStates, { C1: 'consumed', C2: 'consumed' }),
    JSON.stringify(afterC3.topHoleStates)
  );
});

var isolatedSpec = specs[0];
var isolatedA = isolatedSpec.module.settle(isolatedSpec.game(), context(isolatedSpec.scores, 1));
var noPushScores = { C1: win2 };
var isolatedB = isolatedSpec.module.settle(isolatedSpec.game(), context(noPushScores, 1));
assert('separate invocation B starts without A pending state', same(isolatedB.topHoleStates, {}), JSON.stringify(isolatedB.topHoleStates));
assert('separate invocation B cannot mutate invocation A', same(isolatedA.topHoleStates, { C1: 'pending' }), JSON.stringify(isolatedA.topHoleStates));

var tracker = core.createTopHoleTracker();
core.enqueueTopHole(tracker, 'C1');
core.enqueueTopHole(tracker, 'C2');
core.enqueueTopHole(tracker, 'C3');
assert(
  'settleCore multi-count consume is FIFO',
  same(core.consumeTopHoles(tracker, 2), ['C1', 'C2']) &&
    same(tracker.queue, ['C3']) &&
    same(tracker.states, { C1: 'consumed', C2: 'consumed', C3: 'pending' }),
  JSON.stringify(tracker)
);
var merged = core.mergeTopHoleStates({ C1: 'pending', C2: 'consumed' }, { C1: 'consumed', C2: 'pending', C3: 'consumed' });
assert(
  'settleCore merge gives pending precedence',
  same(merged, { C1: 'pending', C2: 'pending', C3: 'consumed' }),
  JSON.stringify(merged)
);

function source(file) {
  return fs.readFileSync(path.join(utilsDir, file), 'utf8');
}

var bindSource = source('sideGameBind.js');
var boardProjection = bindSource.slice(
  bindSource.indexOf('const isConcreteGameView'),
  bindSource.indexOf('const players = [];')
);
assert(
  'sideGameBind concrete view reads topHoleStates directly',
  /selectedGame\s*\?\s*\(selectedGame\.holeResults\s*&&\s*selectedGame\.holeResults\.topHoleStates\)\s*\|\|\s*\{\}/.test(boardProjection),
  boardProjection
);
assert(
  'sideGameBind top-hole projection has no catalog whitelist',
  boardProjection.indexOf('catalogId') < 0 && boardProjection.indexOf('supports') < 0,
  boardProjection
);
assert(
  'sideGameBind summary view has null selectedGame',
  /const selectedGame\s*=\s*isConcreteGameView\s*\?\s*focusGames\[0\]\s*:\s*null/.test(boardProjection),
  boardProjection
);

['settleStroke2.js', 'settleThreeSet.js', 'settleYoucai.js'].forEach(function (file) {
  assert(file + ' remains unsupported for topHoleStates', source(file).indexOf('topHoleStates') < 0);
});

var hornSource = source('settleHorn.js');
assert(
  'horn existing push/meat paths are wired to topHoleStates',
  /enqueueTopHole\(topHoleTracker,\s*hole\)/.test(hornSource) &&
    /consumeTopHoles\(topHoleTracker,\s*eat\)/.test(hornSource) &&
    /consumeTopHoles\(topHoleTracker,\s*1\)/.test(hornSource) &&
    /topHoleStates:\s*topHoleTracker\.states/.test(hornSource)
);

console.log('SUMMARY passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
