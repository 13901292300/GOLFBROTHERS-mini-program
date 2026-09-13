/**
 * Phase 1A：两人比杆 PAR3/PAR4 信天翁档 + PAR5 HIO special。
 * 运行：node scripts/settleStroke2Par5Hio.selftest.js
 */
var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var settleStroke2 = require('../miniprogram/subpackages/game/utils/settleStroke2.js');
var specialResult = require('../miniprogram/subpackages/game/utils/specialResult.js');
var resultFormat = require('../miniprogram/subpackages/game/utils/resultFormat.js');
var resultTone = require('../miniprogram/subpackages/game/utils/resultTone.js');

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

function mulRows(values) {
  return ['hio', 'm2', 'm1', 'par', 'p1', 'ge2'].map(function (id, i) {
    return { id: id, value: String(values[i]) };
  });
}

function ruleMul(values) {
  return {
    catalogId: 'stroke-2',
    reward: 'mul',
    mulRows: mulRows(values || [10, 5, 2, 1, 1, 1]),
    addRows: mulRows([10, 4, 1, 0, 0, 0])
  };
}

function ruleAdd(values) {
  return {
    catalogId: 'stroke-2',
    reward: 'add',
    addRows: mulRows(values || [10, 4, 1, 0, 0, 0]),
    mulRows: mulRows([10, 5, 2, 1, 1, 1])
  };
}

var noneRule = { catalogId: 'stroke-2', reward: 'none' };

function hole(leftActual, rightActual, par, k, snap) {
  return settleStroke2.calculateStrokePlayHoleResult({
    leftActualScore: leftActual,
    rightActualScore: rightActual,
    par: par,
    pointPerStroke: k == null ? 1 : k,
    ruleSnapshot: snap
  });
}

function playerKeys(ledger) {
  var out = [];
  Object.keys(ledger || {}).forEach(function (key) {
    if (key !== '__pot__') out.push(key);
  });
  return out;
}

function gameOf(opts) {
  opts = opts || {};
  var holes = (opts.holeOrder || ['1', '5', '10']).map(function (label) {
    var off = opts.offHoles && opts.offHoles[label];
    return { label: label, on: !off };
  });
  return {
    catalogId: 'stroke-2',
    players: [{ id: 'A' }, { id: 'B' }],
    pairings: [
      {
        leftId: 'A',
        rightId: 'B',
        on: true,
        strokes: opts.strokes || 0
      }
    ],
    holes: holes,
    multiplier: opts.k == null ? 1 : opts.k,
    ruleSnapshot: opts.rule || noneRule
  };
}

function settleOf(opts) {
  var holeOrder = opts.holeOrder || ['1', '5', '10'];
  var pars = opts.pars || { '1': 4, '5': 5, '10': 5 };
  return settleStroke2.settle(gameOf(opts), {
    holeOrder: holeOrder,
    pars: pars,
    scores: opts.scores || {}
  });
}

function boardTotals(result, playerIds) {
  playerIds = playerIds || ['A', 'B'];
  var labels = Object.keys(result.byHole || {});
  Object.keys(result.specialByHole || {}).forEach(function (h) {
    if (labels.indexOf(h) < 0) labels.push(h);
  });
  labels.sort(function (a, b) {
    return Number(a) - Number(b);
  });
  return playerIds.map(function (id) {
    var raw = 0;
    var plus = 0;
    var minus = 0;
    var settledCount = 0;
    labels.forEach(function (label) {
      var infSign = specialResult.infSignForPlayer(result.specialByHole, label, id);
      var frozen = result.byHole && result.byHole[label];
      var hasFinite = frozen && Object.prototype.hasOwnProperty.call(frozen, id);
      if (infSign) {
        settledCount += 1;
        if (infSign === 1) plus += 1;
        else minus += 1;
        return;
      }
      if (!hasFinite) return;
      var n = Number(frozen[id]);
      if (!isFinite(n)) return;
      settledCount += 1;
      raw += n;
    });
    var sign = specialResult.netInfinitySign(plus, minus);
    return resultFormat.formatBoardTotal({
      settledCount: settledCount,
      value: raw,
      infSign: sign
    });
  });
}

var par3Ace = hole(1, 3, 3, 1, ruleMul());
assert(
  'CASE 1 PAR3 A=1 B=3 用 hio 不是 eagle',
  par3Ace.winner === 'left' &&
    par3Ace.baseGap === 2 &&
    par3Ace.winnerActualDiff === -2 &&
    par3Ace.rewardKey === 'hio' &&
    par3Ace.rewardValue === 10 &&
    par3Ace.adjustedGap === 20 &&
    settleStroke2.scoreBand(-2) === 'm2'
);

var par4Ace = hole(1, 4, 4, 1, ruleMul());
assert(
  'CASE 2 PAR4 A=1 用 hio / 信天翁档',
  par4Ace.winner === 'left' &&
    par4Ace.winnerActualDiff === -3 &&
    par4Ace.rewardKey === 'hio' &&
    par4Ace.rewardValue === 10
);

var eagleNotAce = hole(2, 4, 4, 1, ruleMul());
assert(
  'CASE 3 普通 eagle gross!=1 仍 m2',
  eagleNotAce.rewardKey === 'm2' &&
    eagleNotAce.rewardValue === 5 &&
    settleStroke2.scoreBand(-2) === 'm2'
);

var case4 = settleOf({
  scores: {
    '5': { A: -4, B: 0 }
  }
});
var ev4 = case4.specialByHole && case4.specialByHole['5'] && case4.specialByHole['5'][0];
assert(
  'CASE 4 PAR5 A=1 → special plus A minus B，byHole omit',
  !!(
    ev4 &&
    ev4.kind === 'par5_hio' &&
    ev4.plusIds[0] === 'A' &&
    ev4.minusIds[0] === 'B' &&
    ev4.matchup.sideAIds[0] === 'A' &&
    ev4.matchup.sideBIds[0] === 'B' &&
    playerKeys(case4.byHole['5']).length === 0 &&
    specialResult.infSignForPlayer(case4.specialByHole, '5', 'A') === 1 &&
    specialResult.infSignForPlayer(case4.specialByHole, '5', 'B') === -1
  )
);

var case5 = settleOf({
  scores: {
    '5': { A: 0, B: -4 }
  }
});
var ev5 = case5.specialByHole['5'][0];
assert(
  'CASE 5 PAR5 B=1 反向 special',
  ev5.plusIds[0] === 'B' && ev5.minusIds[0] === 'A' && playerKeys(case5.byHole['5']).length === 0
);

var case6 = settleOf({
  scores: {
    '5': { A: -4, B: -4 }
  }
});
assert(
  'CASE 6 双方 PAR5 都 1 杆 → 无 special，有限 0/0',
  !case6.specialByHole['5'] &&
    case6.byHole['5'].A === 0 &&
    case6.byHole['5'].B === 0
);

var case7 = settleOf({
  holeOrder: ['1', '5'],
  scores: {
    '1': { A: -1, B: 0 },
    '5': { A: -4, B: 1 }
  }
});
var tot7 = boardTotals(case7);
assert(
  'CASE 7 A 一次 PAR5 HIO → total ∞ / -∞',
  tot7[0].text === '∞' &&
    tot7[0].infSign === 1 &&
    tot7[0].raw === null &&
    tot7[1].text === '-∞' &&
    tot7[1].infSign === -1 &&
    resultTone.resultToneClass(null, 1) === 'result-positive' &&
    resultTone.resultToneClass(null, -1) === 'result-negative'
);

var case8 = settleOf({
  holeOrder: ['1', '5', '10'],
  scores: {
    '1': { A: -1, B: 0 },
    '5': { A: -4, B: 0 },
    '10': { A: 0, B: -4 }
  }
});
var tot8 = boardTotals(case8);
assert(
  'CASE 8 A 一次 B 一次 → 抵消，总分等于剩余有限洞',
  !!(
    case8.specialByHole['5'] &&
    case8.specialByHole['10'] &&
    playerKeys(case8.byHole['5']).length === 0 &&
    playerKeys(case8.byHole['10']).length === 0 &&
    case8.byHole['1'].A === 1 &&
    tot8[0].infSign === 0 &&
    tot8[0].raw === 1 &&
    tot8[1].raw === -1 &&
    tot8[0].text === '+1'
  )
);

var case9 = settleOf({
  holeOrder: ['1', '5', '10'],
  pars: { '1': 5, '5': 5, '10': 5 },
  scores: {
    '1': { A: -4, B: 0 },
    '5': { A: -4, B: 0 },
    '10': { A: 0, B: -4 }
  }
});
var tot9 = boardTotals(case9);
assert(
  'CASE 9 A 两次 B 一次 → 仍 ∞ / -∞',
  tot9[0].text === '∞' && tot9[1].text === '-∞' && tot9[0].infSign === 1 && tot9[1].infSign === -1
);

var case10 = settleOf({
  rule: ruleAdd(),
  scores: { '5': { A: -4, B: 0 } }
});
assert(
  'CASE 10 PAR5 HIO + additive 仍 special，无有限 reward',
  case10.specialByHole['5'] && playerKeys(case10.byHole['5']).length === 0
);

var case11 = settleOf({
  rule: ruleMul(),
  scores: { '5': { A: -4, B: 0 } }
});
assert(
  'CASE 11 PAR5 HIO + multiplier 仍 special',
  case11.specialByHole['5'] && playerKeys(case11.byHole['5']).length === 0
);

var case12 = settleOf({
  k: 3,
  scores: { '5': { A: -4, B: 0 } }
});
assert(
  'CASE 12 PAR5 HIO + coefficient 仍 special',
  case12.specialByHole['5'] && playerKeys(case12.byHole['5']).length === 0
);

var case13 = settleOf({
  offHoles: { '5': true },
  scores: { '5': { A: -4, B: 0 } }
});
assert(
  'CASE 13 有效洞关闭 → 不产生 special',
  !case13.specialByHole['5'] && playerKeys(case13.byHole['5']).length === 0
);

var cloned = rec.jsonClone(case7);
var json = JSON.stringify(cloned);
var parsed = JSON.parse(json);
var tot14 = boardTotals(parsed);
assert(
  'CASE 14 JSON roundtrip 保留 event，仍 ±∞',
  parsed.specialByHole['5'][0].kind === 'par5_hio' &&
    parsed.specialByHole['5'][0].plusIds[0] === 'A' &&
    json.indexOf('Infinity') < 0 &&
    json.indexOf('NaN') < 0 &&
    tot14[0].text === '∞' &&
    tot14[1].text === '-∞'
);

var birdie = hole(4, 3, 4, 1, ruleMul());
assert(
  'CASE 15 普通比杆小鸟×2 与 HEAD 一致',
  birdie.winner === 'right' &&
    birdie.baseGap === 1 &&
    birdie.rewardKey === 'm1' &&
    birdie.rewardValue === 2 &&
    birdie.leftValue === -2 &&
    birdie.rightValue === 2 &&
    settleStroke2.STROKE2_SETTLE_VERSION === 'v53-4.1.1'
);

assert(
  'scoreBand 语义未改',
  settleStroke2.scoreBand(-3) === 'hio' &&
    settleStroke2.scoreBand(-2) === 'm2' &&
    settleStroke2.scoreBand(-1) === 'm1'
);

assert(
  'net 2:1 helper',
  specialResult.netInfinitySign(2, 1) === 1 &&
    specialResult.netInfinitySign(1, 1) === 0 &&
    specialResult.netInfinitySignForPlayer(case9.specialByHole, 'A') === 1 &&
    specialResult.netInfinitySignForPlayer(case8.specialByHole, 'A') === 0
);

if (failed) {
  console.log('FAIL ' + failed + ' / ' + (passed + failed));
  process.exit(1);
}
console.log('OK ' + passed + ' passed');
