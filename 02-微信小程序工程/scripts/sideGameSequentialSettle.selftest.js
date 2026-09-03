/**
 * Order-dependent side games must stop at the first enabled incomplete hole.
 * Run: node scripts/sideGameSequentialSettle.selftest.js
 */
var path = require('path');

var utilsDir = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils');
var core = require(path.join(utilsDir, 'settleCore.js'));
var HOLES = ['C1', 'C2', 'C3'];
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
    holes: HOLES.map(function (label) {
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

function context(scores, count) {
  var order = HOLES.slice(0, count == null ? HOLES.length : count);
  var pars = {};
  order.forEach(function (label) {
    pars[label] = 4;
  });
  return { holeOrder: order, scores: scores, pars: pars, windOn: false };
}

function scoreCards(ids, win) {
  var tie = {};
  ids.forEach(function (id) {
    tie[id] = 0;
  });
  return {
    C1: tie,
    C2: Object.assign({}, win),
    C3: Object.assign({}, win)
  };
}

function emptyHole(ledger) {
  var keys = Object.keys(ledger || {});
  return keys.every(function (key) {
    return key === core.POT_ID && Number(ledger[key]) === 0;
  });
}

function settledHole(ledger, ids) {
  return ids.every(function (id) {
    return Object.prototype.hasOwnProperty.call(ledger || {}, id);
  });
}

function nonZeroHole(ledger, ids) {
  return ids.some(function (id) {
    return Math.abs(Number((ledger || {})[id]) || 0) > 0;
  });
}

function zeroSum(ledger) {
  var sum = 0;
  Object.keys(ledger || {}).forEach(function (id) {
    sum += Number(ledger[id]) || 0;
  });
  return Math.abs(core.round1(sum)) < 0.05;
}

var specs = [
  {
    id: 'landlord-big',
    module: require(path.join(utilsDir, 'settleLandlordBig.js')),
    ids: ['A', 'B', 'C'],
    game: function () { return baseGame('landlord-big', this.ids); },
    win: { A: -1, B: 0, C: 0 }
  },
  {
    id: 'landlord-mid',
    module: require(path.join(utilsDir, 'settleLandlordMid.js')),
    ids: ['A', 'B', 'C'],
    game: function () { return baseGame('landlord-mid', this.ids); },
    win: { A: 0, B: -1, C: 0 }
  },
  {
    id: 'landlord-small',
    module: require(path.join(utilsDir, 'settleLandlordSmall.js')),
    ids: ['A', 'B', 'C'],
    game: function () { return baseGame('landlord-small', this.ids); },
    win: { A: 0, B: 0, C: -1 }
  },
  {
    id: '8421-3',
    module: require(path.join(utilsDir, 'settle8421Three.js')),
    ids: ['A', 'B', 'C'],
    game: function () { return baseGame('8421-3', this.ids); },
    win: { A: -1, B: 0, C: 0 }
  },
  {
    id: '8421-4',
    module: require(path.join(utilsDir, 'settle8421Four.js')),
    ids: ['A', 'B', 'C', 'D'],
    game: function () { return baseGame('8421-4', this.ids); },
    win: { A: -1, B: 0, C: 0, D: 0 }
  },
  {
    id: 'lasuo-4',
    module: require(path.join(utilsDir, 'settleLasuo4.js')),
    ids: ['A', 'B', 'C', 'D'],
    game: function () {
      return baseGame('lasuo-4', this.ids, {
        pkBetter: true,
        pkWorse: true,
        pkTotal: true,
        pkBetterW: 1,
        pkWorseW: 1,
        pkTotalW: 1,
        pkTotalMode: 'sum'
      });
    },
    win: { A: -1, B: 0, C: 1, D: 1 }
  },
  {
    id: 'dizhubo-4',
    module: require(path.join(utilsDir, 'settleDizhubo4.js')),
    ids: ['A', 'B', 'C', 'D'],
    game: function () { return baseGame('dizhubo-4', this.ids); },
    win: { A: -1, B: 0, C: 0, D: 0 }
  },
  {
    id: 'vegas',
    module: require(path.join(utilsDir, 'settleVegas.js')),
    ids: ['A', 'B', 'C', 'D'],
    game: function () { return baseGame('vegas', this.ids); },
    win: { A: 0, B: 0, C: 0, D: 1 }
  },
  {
    id: 'lasuo-n',
    module: require(path.join(utilsDir, 'settleLasuoN.js')),
    ids: ['A', 'B', 'C', 'D'],
    game: function () {
      var game = baseGame('lasuo-n', this.ids);
      game.pushRule = 'all-tie';
      game.formation = 'jianghu';
      game.pairCoeffs = [{ value: 1 }, { value: 1 }];
      return game;
    },
    win: { A: -1, B: 0, C: 0, D: 0 }
  },
  {
    id: 'horn',
    module: require(path.join(utilsDir, 'settleHorn.js')),
    ids: ['A', 'B', 'C', 'D', 'E'],
    allowsEmptyLedger: true,
    game: function () {
      var game = baseGame('horn', this.ids);
      game.pushRule = 'tie';
      game.formation = 'jianghu';
      game.rewardOn = false;
      game.flowerK = 1;
      return game;
    },
    win: { A: -2, B: -1, C: 0, D: 1, E: 2 }
  }
];

function runSpec(spec) {
  var complete = scoreCards(spec.ids, spec.win);
  var firstOnly = spec.module.settle(spec.game(), context({ C1: complete.C1 }, 1));
  var withGap = JSON.parse(JSON.stringify(complete));
  delete withGap.C2[spec.ids[spec.ids.length - 1]];
  var blocked = spec.module.settle(spec.game(), context(withGap));

  assert(
    spec.id + ' C1 settles before gap',
    (settledHole(blocked.byHole.C1, spec.ids) || spec.allowsEmptyLedger) &&
      !!blocked.orderByHole.C1 &&
      (spec.allowsEmptyLedger
        ? same(blocked.topHoleStates, {})
        : blocked.topHoleStates.C1 === 'pending'),
    JSON.stringify(blocked)
  );
  assert(
    spec.id + ' C2 remains empty/pending',
    emptyHole(blocked.byHole.C2),
    JSON.stringify(blocked.byHole.C2)
  );
  assert(
    spec.id + ' C3 stays empty without order',
    emptyHole(blocked.byHole.C3) &&
      !Object.prototype.hasOwnProperty.call(blocked.orderByHole || {}, 'C3'),
    JSON.stringify(blocked)
  );
  assert(
    spec.id + ' gap cannot mutate earlier FIFO/top-hole state',
    same(blocked.byHole.C1, firstOnly.byHole.C1) &&
      same(blocked.orderByHole.C1, firstOnly.orderByHole.C1) &&
      same(blocked.topHoleStates, firstOnly.topHoleStates),
    JSON.stringify(blocked.topHoleStates)
  );

  var throughC2 = spec.module.settle(spec.game(), context(complete, 2));
  var filled = spec.module.settle(spec.game(), context(complete));
  assert(
    spec.id + ' filled C2/C3 settle sequentially',
    (settledHole(filled.byHole.C2, spec.ids) || spec.allowsEmptyLedger) &&
      (settledHole(filled.byHole.C3, spec.ids) || spec.allowsEmptyLedger) &&
      (nonZeroHole(filled.byHole.C2, spec.ids) || spec.allowsEmptyLedger) &&
      (nonZeroHole(filled.byHole.C3, spec.ids) || spec.allowsEmptyLedger) &&
      !!filled.orderByHole.C2 &&
      !!filled.orderByHole.C3 &&
      same(filled.byHole.C2, throughC2.byHole.C2) &&
      same(filled.orderByHole.C2, throughC2.orderByHole.C2),
    JSON.stringify(filled)
  );
  assert(
    spec.id + ' filled ledgers remain zero-sum',
    HOLES.every(function (label) {
      return zeroSum(filled.byHole[label]);
    }),
    JSON.stringify(filled.byHole)
  );

  var disabledGame = spec.game();
  disabledGame.holes[1].on = false;
  var disabled = spec.module.settle(disabledGame, context(withGap));
  assert(
    spec.id + ' disabled C2 does not block C3',
    emptyHole(disabled.byHole.C2) &&
      (settledHole(disabled.byHole.C3, spec.ids) || spec.allowsEmptyLedger) &&
      (nonZeroHole(disabled.byHole.C3, spec.ids) || spec.allowsEmptyLedger) &&
      !!disabled.orderByHole.C3 &&
      zeroSum(disabled.byHole.C3),
    JSON.stringify(disabled)
  );
}

specs.forEach(runSpec);

console.log('SUMMARY passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
