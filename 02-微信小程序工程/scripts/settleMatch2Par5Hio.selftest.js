/**
 * Phase 1B：两人比洞 PAR5 HIO 仅 reward=mul 才 Infinity；reward=none 回原有限比洞。
 * 运行：node scripts/settleMatch2Par5Hio.selftest.js
 */
var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var settleMatch2 = require('../miniprogram/subpackages/game/utils/settleMatch2.js');
var settleStroke2 = require('../miniprogram/subpackages/game/utils/settleStroke2.js');
var specialResult = require('../miniprogram/subpackages/game/utils/specialResult.js');
var resultFormat = require('../miniprogram/subpackages/game/utils/resultFormat.js');

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

function ruleMul(extra) {
  return Object.assign(
    {
      catalogId: 'match-2',
      reward: 'mul',
      mulRows: mulRows([10, 5, 2, 1, 1, 1]),
      pushRule: 'push',
      meatInclude: 'yes'
    },
    extra || {}
  );
}

var nonePush = {
  catalogId: 'match-2',
  reward: 'none',
  pushRule: 'push',
  meatInclude: 'no'
};

var noneMeatYes = {
  catalogId: 'match-2',
  reward: 'none',
  pushRule: 'push',
  meatInclude: 'yes'
};

function hole(a, b, n, rule, k, par) {
  return settleMatch2.calculateMatchPlayHoleResult({
    playerActual: a,
    opponentActual: b,
    par: par == null ? 4 : par,
    handicapN: n,
    ruleConfig: rule,
    pointValue: k == null ? 1 : k
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
    catalogId: 'match-2',
    players: [{ id: 'A' }, { id: 'B' }],
    pairings: [
      {
        id: 'pA|pB',
        leftId: 'A',
        rightId: 'B',
        on: true,
        strokes: opts.strokes == null ? 0 : opts.strokes
      }
    ],
    holes: holes,
    multiplier: opts.k == null ? 1 : opts.k,
    ruleSnapshot: opts.rule || nonePush
  };
}

function settleOf(opts) {
  var holeOrder = opts.holeOrder || ['1', '5', '10'];
  var pars = opts.pars || { '1': 4, '5': 5, '10': 5 };
  return settleMatch2.settle(gameOf(opts), {
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
    return resultFormat.formatBoardTotal({
      settledCount: settledCount,
      value: raw,
      infSign: specialResult.netInfinitySign(plus, minus)
    });
  });
}

var case1 = settleOf({
  scores: { '5': { A: -4, B: 0 } }
});
assert(
  'CASE 1 reward=none PAR5 A=1 B>1 → 无 special，普通 adjusted 比洞',
  !case1.specialByHole['5'] &&
    case1.byHole['5'].A === 1 &&
    case1.byHole['5'].B === -1 &&
    playerKeys(case1.byHole['5']).length === 2
);

var case2 = settleOf({
  strokes: 5,
  scores: { '5': { A: -4, B: 0 } }
});
var hole2 = hole(1, 5, 5, nonePush, 1, 5);
assert(
  'CASE 2 reward=none PAR5 A=1 让杆后 B 可胜',
  !case2.specialByHole['5'] &&
    hole2.outcome === 'lose' &&
    hole2.adjustedLeft === 1 &&
    hole2.adjustedRight === 0 &&
    case2.byHole['5'].B === 1 &&
    case2.byHole['5'].A === -1
);

var case3 = settleOf({
  rule: ruleMul(),
  scores: { '5': { A: -4, B: 0 } }
});
var ev3 = case3.specialByHole && case3.specialByHole['5'] && case3.specialByHole['5'][0];
assert(
  'CASE 3 reward=mul PAR5 A=1 → A +∞ / B -∞',
  !!(
    ev3 &&
    ev3.plusIds[0] === 'A' &&
    ev3.minusIds[0] === 'B' &&
    ev3.meatAllEaten === true &&
    playerKeys(case3.byHole['5']).length === 0 &&
    specialResult.infSignForPlayer(case3.specialByHole, '5', 'A') === 1
  )
);

var case4 = settleOf({
  rule: ruleMul(),
  scores: { '5': { A: 0, B: -4 } }
});
assert(
  'CASE 4 reward=mul PAR5 B=1 → 反向 Infinity',
  case4.specialByHole['5'][0].plusIds[0] === 'B' && case4.specialByHole['5'][0].minusIds[0] === 'A'
);

var case5 = settleOf({
  rule: { catalogId: 'match-2' },
  scores: { '5': { A: -4, B: 0 } }
});
assert(
  'CASE 5 reward missing → mulMissing 不结算不发 special',
  case5.mulMissing === true &&
    case5.mulState === 'missing' &&
    case5.resultSource === 'mul_config_missing' &&
    !case5.specialByHole &&
    Object.keys(case5.byHole).length === 0
);

var case6 = settleOf({
  rule: ruleMul(),
  scores: { '5': { A: -4, B: -4 } }
});
assert(
  'CASE 6 reward=mul 双方 PAR5=1 → 无 special，原 adjusted',
  !case6.specialByHole['5'] && case6.byHole['5'].A === 0 && case6.byHole['5'].B === 0
);

var case7 = settleOf({
  scores: { '5': { A: -4, B: -4 } }
});
assert(
  'CASE 7 reward=none 双方 PAR5=1 → 原 adjusted',
  !case7.specialByHole['5'] &&
    case7.byHole['5'].A === 0 &&
    case7.byHole['5'].B === 0 &&
    case7.topHoleStates['5'] === 'pending'
);

var case8 = settleOf({
  rule: ruleMul(),
  holeOrder: ['1', '5'],
  pars: { '1': 4, '5': 5 },
  scores: {
    '1': { A: 0, B: 0 },
    '5': { A: -4, B: 0 }
  }
});
assert(
  'CASE 8 reward=mul 已有肉 + 单方 PAR5 HIO → 全吃、顶洞 consumed、无有限肉分',
  case8.specialByHole['5'][0].meatAllEaten === true &&
    case8.topHoleStates['1'] === 'consumed' &&
    playerKeys(case8.byHole['5']).length === 0 &&
    case8.byHole['1'].A === 0
);

var case9 = settleOf({
  rule: noneMeatYes,
  holeOrder: ['1', '5'],
  pars: { '1': 4, '5': 5 },
  scores: {
    '1': { A: 0, B: 0 },
    '5': { A: -4, B: 0 }
  }
});
assert(
  'CASE 9 reward=none 已有肉 + PAR5 A=1 → 不 special 全吃，原 meat',
  !case9.specialByHole['5'] &&
    case9.byHole['5'].A === 2 &&
    case9.byHole['5'].B === -2 &&
    case9.topHoleStates['1'] === 'consumed'
);

var case10 = settleOf({
  rule: ruleMul({ meatInclude: 'yes' }),
  holeOrder: ['1', '5'],
  pars: { '1': 4, '5': 5 },
  scores: {
    '1': { A: 0, B: 0 },
    '5': { A: -4, B: 0 }
  }
});
assert(
  'CASE 10 reward=mul meatInclude=yes → Infinity 洞不写有限肉',
  case10.specialByHole['5'] && playerKeys(case10.byHole['5']).length === 0
);

var case11 = settleOf({
  rule: ruleMul({ meatInclude: 'no' }),
  holeOrder: ['1', '5'],
  pars: { '1': 4, '5': 5 },
  scores: {
    '1': { A: 0, B: 0 },
    '5': { A: -4, B: 0 }
  }
});
assert(
  'CASE 11 reward=mul meatInclude=no → Infinity 洞不写有限肉',
  case11.specialByHole['5'] && playerKeys(case11.byHole['5']).length === 0
);

var case12 = settleOf({
  rule: ruleMul(),
  k: 3,
  scores: { '5': { A: -4, B: 0 } }
});
assert(
  'CASE 12 reward=mul + coefficient → 仍 Infinity，不变有限数',
  case12.specialByHole['5'] && playerKeys(case12.byHole['5']).length === 0
);

var case13 = settleOf({
  k: 3,
  scores: { '5': { A: -4, B: 0 } }
});
assert(
  'CASE 13 reward=none + coefficient → 有限结果乘 coefficient',
  !case13.specialByHole['5'] && case13.byHole['5'].A === 3 && case13.byHole['5'].B === -3
);

var par3None = hole(1, 3, 0, nonePush, 1, 3);
assert(
  'CASE 14 PAR3 gross=1 + reward=none → 普通 adjusted，无 hio tier',
  par3None.outcome === 'win' &&
    par3None.multiplier === 1 &&
    par3None.multiplierKey !== 'hio' &&
    par3None.multiplierKey === settleStroke2.scoreBand(-2)
);

var par3Ace = hole(1, 3, 0, ruleMul(), 1, 3);
assert(
  'CASE 15 PAR3 gross=1 + reward=mul + 胜者 → hio',
  par3Ace.outcome === 'win' &&
    par3Ace.winnerActualDiff === -2 &&
    par3Ace.multiplierKey === 'hio' &&
    par3Ace.scoreType === 'albatross' &&
    par3Ace.multiplier === 10 &&
    settleStroke2.scoreBand(-2) === 'm2'
);

var par3Lose = hole(1, 3, 3, ruleMul(), 1, 3);
assert(
  'CASE 16 PAR3 gross=1 + reward=mul + 未赢 → 不给 hio winner reward',
  par3Lose.outcome === 'lose' &&
    par3Lose.adjustedLeft === 1 &&
    par3Lose.adjustedRight === 0 &&
    par3Lose.multiplierKey !== 'hio' &&
    par3Lose.winnerActualDiff === 0
);

var eagle = hole(2, 4, 0, ruleMul(), 1, 4);
assert(
  'CASE 17 普通 diff=-2 且 gross!=1 → 仍 eagle/m2',
  eagle.multiplierKey === 'm2' && eagle.scoreType === 'eagle' && eagle.multiplier === 5
);

var case18 = settleOf({
  rule: ruleMul(),
  offHoles: { '5': true },
  scores: { '5': { A: -4, B: 0 } }
});
assert(
  'CASE 18 有效洞关闭 → 不 special',
  !case18.specialByHole['5'] && playerKeys(case18.byHole['5']).length === 0
);

var case19 = settleOf({
  rule: ruleMul(),
  holeOrder: ['1', '5', '10'],
  pars: { '1': 4, '5': 5, '10': 5 },
  scores: {
    '1': { A: -1, B: 0 },
    '5': { A: -4, B: 0 },
    '10': { A: 0, B: -4 }
  }
});
var tot19 = boardTotals(case19);
assert(
  'CASE 19 A一次 / B一次 mul HIO → Infinity 抵消，finite remainder',
  case19.specialByHole['5'] &&
    case19.specialByHole['10'] &&
    case19.byHole['1'].A === 2 &&
    tot19[0].infSign === 0 &&
    tot19[0].raw === 2 &&
    tot19[1].raw === -2
);

var case20 = settleOf({
  rule: ruleMul(),
  holeOrder: ['1', '5', '10'],
  pars: { '1': 5, '5': 5, '10': 5 },
  scores: {
    '1': { A: -4, B: 0 },
    '5': { A: -4, B: 0 },
    '10': { A: 0, B: -4 }
  }
});
var tot20 = boardTotals(case20);
assert(
  'CASE 20 A两次 / B一次 → A 仍 Infinity',
  tot20[0].text === '∞' && tot20[1].text === '-∞'
);

var case21 = settleOf({
  rule: ruleMul(),
  holeOrder: ['1', '5', '10'],
  pars: { '1': 4, '5': 5, '10': 5 },
  scores: {
    '1': { A: 0, B: 0 },
    '5': { A: -4, B: 0 },
    '10': { A: 0, B: -4 }
  }
});
var tot21 = boardTotals(case21);
assert(
  'CASE 21 Infinity 抵消后此前 meat consume 不恢复',
  tot21[0].infSign === 0 &&
    tot21[0].raw === 0 &&
    case21.topHoleStates['1'] === 'consumed' &&
    case21.specialByHole['5'][0].meatAllEaten === true &&
    case21.specialByHole['10'][0].meatAllEaten === true &&
    playerKeys(case21.byHole['5']).length === 0
);

var v53 = hole(4, 5, 0.5, { catalogId: 'match-2', reward: 'none', pushRule: 'none' }, 1, 4);
assert(
  'CASE 22 普通 match2 fixture 与 HEAD 原结果一致',
  v53.outcome === 'win' &&
    v53.leftPts === 1 &&
    v53.rightPts === -1 &&
    settleMatch2.MATCH2_SETTLE_VERSION === 'v53-4.1.2'
);

var cloned = rec.jsonClone(case8);
var json = JSON.stringify(cloned);
var parsed = JSON.parse(json);
assert(
  'CASE 23 JSON roundtrip 不持久化 Infinity/NaN',
  parsed.specialByHole['5'][0].kind === 'par5_hio' &&
    parsed.specialByHole['5'][0].meatAllEaten === true &&
    parsed.topHoleStates['1'] === 'consumed' &&
    json.indexOf('Infinity') < 0 &&
    json.indexOf('NaN') < 0 &&
    boardTotals(parsed)[0].text === '∞'
);

if (failed) {
  console.log('FAIL ' + failed + ' / ' + (passed + failed));
  process.exit(1);
}
console.log('OK ' + passed + ' passed');
