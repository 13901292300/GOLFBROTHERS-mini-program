/**
 * Phase 1C：油菜无奖励层，PAR5/PAR3/PAR4 gross=1 只做有限结算，不 Infinity。
 * 运行：node scripts/settleYoucaiHioNoInfinity.selftest.js
 */
var fs = require('fs');
var path = require('path');
var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var settleYoucai = require('../miniprogram/subpackages/game/utils/settleYoucai.js');

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

function playerKeys(ledger) {
  var out = [];
  Object.keys(ledger || {}).forEach(function (key) {
    if (key !== '__pot__') out.push(key);
  });
  return out;
}

function noSpecial(result) {
  return !result.specialByHole && JSON.stringify(result).indexOf('Infinity') < 0 && JSON.stringify(result).indexOf('NaN') < 0;
}

function gameOf(opts) {
  opts = opts || {};
  var holes = (opts.holeOrder || ['1', '5', '10']).map(function (label) {
    var off = opts.offHoles && opts.offHoles[label];
    return { label: label, on: !off };
  });
  return {
    catalogId: 'youcai',
    players: [{ id: 'A' }, { id: 'B' }],
    pairings: [
      {
        id: 'A|B',
        leftId: 'A',
        rightId: 'B',
        on: true,
        strokes: opts.strokes == null ? 0 : opts.strokes,
        handicap: opts.strokes == null ? 0 : opts.strokes
      }
    ],
    holes: holes,
    multiplier: opts.k == null ? 1 : opts.k,
    pointPerHole: opts.k == null ? 1 : opts.k
  };
}

function settleOf(opts) {
  var holeOrder = opts.holeOrder || ['1', '5', '10'];
  var pars = opts.pars || { '1': 4, '5': 5, '10': 5 };
  return settleYoucai.settle(gameOf(opts), {
    holeOrder: holeOrder,
    pars: pars,
    scores: opts.scores || {}
  });
}

var youcaiSrc = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/utils/settleYoucai.js'),
  'utf8'
);
assert(
  '油菜源码无 reward / specialResult / hio',
  !/rewardOn|mulRows|addRows|specialResult|KIND_PAR5|makePar5HioEvent|meatAllEaten/.test(youcaiSrc) &&
    !/\breward\b/.test(youcaiSrc) &&
    !/\bhio\b/.test(youcaiSrc)
);

var case1 = settleOf({
  scores: { '5': { A: -4, B: 0 } }
});
assert(
  'CASE 1 PAR5 A=1 B=5 → 有限 ±1，无 special / Infinity',
  noSpecial(case1) &&
    case1.byHole['5'].A === 1 &&
    case1.byHole['5'].B === -1 &&
    case1.byHolePairs['5']['A|B'].winner === 'left' &&
    case1.playerTotals.A === 1 &&
    playerKeys(case1.byHole['5']).length === 2
);

var case2 = settleOf({
  scores: { '5': { A: 0, B: -4 } }
});
assert(
  'CASE 2 PAR5 B=1 → 反向有限，无 special',
  noSpecial(case2) && case2.byHole['5'].A === -1 && case2.byHole['5'].B === 1 && case2.byHolePairs['5']['A|B'].winner === 'right'
);

var case3 = settleOf({
  scores: { '5': { A: -4, B: -4 } }
});
assert(
  'CASE 3 双方 PAR5=1 → 原油菜平局 0/0，无 special',
  noSpecial(case3) &&
    case3.byHole['5'].A === 0 &&
    case3.byHole['5'].B === 0 &&
    case3.byHolePairs['5']['A|B'].winner === 'tie'
);

var case4 = settleOf({
  strokes: 5,
  scores: { '5': { A: -4, B: 0 } }
});
var hole4 = settleYoucai.calculateYoucaiHoleResult({
  leftActualScore: 1,
  rightActualScore: 5,
  handicap: 5,
  pointPerHole: 1,
  par: 5
});
assert(
  'CASE 4 PAR5 A=1 让杆后 B 可胜，gross HIO 不压过 handicap',
  noSpecial(case4) &&
    hole4.winner === 'right' &&
    hole4.leftAdjustedScore === 1 &&
    hole4.rightAdjustedScore === 0 &&
    case4.byHole['5'].A === -1 &&
    case4.byHole['5'].B === 1
);

var par3 = settleYoucai.calculateYoucaiHoleResult({
  leftActualScore: 1,
  rightActualScore: 3,
  handicap: 0,
  pointPerHole: 1,
  par: 3
});
assert(
  'CASE 5 PAR3 gross=1 → 真实 1 杆，有限 ±1，无 hio 档',
  par3.winner === 'left' &&
    par3.leftActualScore === 1 &&
    par3.leftValue === 1 &&
    par3.rightValue === -1 &&
    par3.multiplierKey == null &&
    par3.scoreType == null
);

var par4 = settleYoucai.calculateYoucaiHoleResult({
  leftActualScore: 1,
  rightActualScore: 4,
  handicap: 0,
  pointPerHole: 1,
  par: 4
});
assert(
  'CASE 6 PAR4 gross=1 → 同上有限 ±1',
  par4.winner === 'left' && par4.leftActualScore === 1 && par4.leftValue === 1 && par4.rightValue === -1
);

var case7 = settleOf({
  offHoles: { '5': true },
  scores: { '5': { A: -4, B: 0 } }
});
assert(
  'CASE 7 有效洞关闭 → 该洞不结算，无 special',
  noSpecial(case7) &&
    playerKeys(case7.byHole['5']).length === 0 &&
    (!case7.byHolePairs['5'] || !case7.byHolePairs['5']['A|B'] || case7.byHolePairs['5']['A|B'].status !== 'settled')
);

var case8 = settleOf({
  k: 3,
  scores: { '5': { A: -4, B: 0 } }
});
assert(
  'CASE 8 K=3 → 有限 ±3，不变 Infinity',
  noSpecial(case8) && case8.byHole['5'].A === 3 && case8.byHole['5'].B === -3 && case8.pointPerHole === 3
);

var case9 = settleOf({
  holeOrder: ['1', '5'],
  pars: { '1': 4, '5': 5 },
  scores: {
    '1': { A: -1, B: 0 },
    '5': { A: -4, B: 0 }
  }
});
assert(
  'CASE 9 多洞含 PAR5 gross=1 → aggregate 仍有限',
  noSpecial(case9) &&
    case9.byHole['1'].A === 1 &&
    case9.byHole['5'].A === 1 &&
    case9.playerTotals.A === 2 &&
    case9.playerTotals.B === -2
);

var cloned = rec.jsonClone(case1);
var json = JSON.stringify(cloned);
var parsed = JSON.parse(json);
var recomputed = settleOf({
  scores: { '5': { A: -4, B: 0 } }
});
assert(
  'CASE 10 JSON roundtrip / 重算仍无 specialByHole',
  json.indexOf('Infinity') < 0 &&
    json.indexOf('NaN') < 0 &&
    parsed.specialByHole == null &&
    recomputed.specialByHole == null &&
    JSON.stringify(recomputed.byHole) === JSON.stringify(case1.byHole)
);

var v53 = settleYoucai.calculateYoucaiHoleResult({
  leftActualScore: 4,
  rightActualScore: 5,
  handicap: 0,
  pointPerHole: 1,
  par: 4
});
assert(
  'CASE 11 普通油菜 fixture 与 HEAD 一致',
  v53.winner === 'left' &&
    v53.leftValue === 1 &&
    v53.rightValue === -1 &&
    settleYoucai.YOUCAI_SETTLE_VERSION === 'v53-4.1.5'
);

if (failed) {
  console.log('FAIL ' + failed + ' / ' + (passed + failed));
  process.exit(1);
}
console.log('OK ' + passed + ' passed');
