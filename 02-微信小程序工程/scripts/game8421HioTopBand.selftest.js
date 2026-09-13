/**
 * 8421-2/3/4：gross=1 一律走最高档（-3 / hio），不改真实 diff。
 * 运行：node scripts/game8421HioTopBand.selftest.js
 */
var path = require('path');
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils');
var s8421 = require(path.join(utilsDir, 'settle8421.js'));
var settle2 = require(path.join(utilsDir, 'settle8421.js'));
var settle3 = require(path.join(utilsDir, 'settle8421Three.js'));
var settle4 = require(path.join(utilsDir, 'settle8421Four.js'));
var scoreMapUtil = require(path.join(utilsDir, 'sideGameScoreMap.js'));
var stroke = require(path.join(utilsDir, 'settleStroke2.js'));

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

function defaultMap() {
  return scoreMapUtil.expandScoreCode('8421');
}

function customRows(hio) {
  return [
    { id: 'hio', value: String(hio) },
    { id: 'm2', value: '16' },
    { id: 'm1', value: '8' },
    { id: 'par', value: '4' },
    { id: 'p1', value: '2' },
    { id: 'p2', value: '1' },
    { id: 'p3', value: '0' }
  ];
}

function deductOff() {
  return { deductMode: 'none', pushRule: 'none', meatEatMode: 'piece' };
}

function twoGame(players) {
  return {
    catalogId: '8421-2',
    players: players || [
      { id: 'A', scoreCode: '8421' },
      { id: 'B', scoreCode: '8421' }
    ],
    pairings: [{ id: 'ab', leftId: 'A', rightId: 'B', on: true }],
    multiplier: 1,
    holes: [{ label: '1', on: true }],
    ruleSnapshot: deductOff()
  };
}

function threeGame(players) {
  return {
    catalogId: '8421-3',
    players: players || ['A', 'B', 'C'].map(function (id) {
      return { id: id, scoreCode: '8421' };
    }),
    playerOrder: ['A', 'B', 'C'],
    groupMode: 'fixed',
    multiplier: 1,
    holes: [{ label: '1', on: true }],
    ruleSnapshot: Object.assign({ catalogId: '8421-3', baoNeg: 'none' }, deductOff())
  };
}

function fourGame(players) {
  return {
    catalogId: '8421-4',
    players: players || ['A', 'B', 'C', 'D'].map(function (id) {
      return { id: id, scoreCode: '8421' };
    }),
    playerOrder: ['A', 'B', 'C', 'D'],
    groupMode: 'fixed',
    multiplier: 1,
    holes: [{ label: '1', on: true }],
    ruleSnapshot: Object.assign({ catalogId: '8421-4', baoNeg: 'none' }, deductOff())
  };
}

function ctxOf(rels, par) {
  return {
    scores: { '1': rels },
    holeOrder: ['1'],
    pars: { '1': par },
    windOn: false
  };
}

function pts(diff, par, map) {
  return s8421.personalScore(diff, map || defaultMap(), deductOff(), par);
}

assert(
  '修改前口径：纯 diff=-2 映射仍为 m2=16',
  scoreMapUtil.mappedAt(-2, defaultMap()) === 16
);
assert(
  '共享 helper PAR3 HIO → hio 不是 m2',
  s8421.resolve8421ScoreBand({ gross: 1, par: 3, diff: -2 }) === 'hio' &&
    s8421.resolve8421MapDiff({ gross: 1, par: 3, diff: -2 }) === -3
);
assert('未改全局 scoreBand：-2 仍 m2', stroke.scoreBand(-2) === 'm2');
assert('未改 mappedAt 纯 diff：-2 仍 16', scoreMapUtil.mappedAt(-2, defaultMap()) === 16);

assert('1. 8421-2 PAR3 HIO 默认32', pts(-2, 3) === 32);
assert('2. 8421-2 PAR4 HIO 默认32', pts(-3, 4) === 32);
assert('3. 8421-2 PAR5 HIO 默认32', pts(-4, 5) === 32);

var hole2 = settle2.settle(twoGame(), ctxOf({ A: -2, B: 0 }, 3)).byHole['1'];
assert(
  '1b. 8421-2 本洞用最高档分差 32-4=28',
  hole2.A === 28 && hole2.B === -28,
  JSON.stringify(hole2)
);

assert('4. 8421-3 PAR3 HIO 默认32', pts(-2, 3) === 32);
assert('5. 8421-3 PAR4 HIO 默认32', pts(-3, 4) === 32);
assert('6. 8421-3 PAR5 HIO 默认32', pts(-4, 5) === 32);

var hole3 = settle3.settle(threeGame(), ctxOf({ A: -2, B: 0, C: 0 }, 3)).byHole['1'];
assert(
  '4b. 8421-3 本洞双人队用 A=32',
  hole3.A === 28 && hole3.C === 28 && hole3.B === -56,
  JSON.stringify(hole3)
);

assert('7. 8421-4 PAR3 HIO 默认32', pts(-2, 3) === 32);
assert('8. 8421-4 PAR4 HIO 默认32', pts(-3, 4) === 32);
assert('9. 8421-4 PAR5 HIO 默认32', pts(-4, 5) === 32);

var hole4 = settle4.settle(fourGame(), ctxOf({ A: -2, B: 0, C: 0, D: 0 }, 3)).byHole['1'];
assert(
  '7b. 8421-4 本洞 A=32 队差 28',
  hole4.A === 28 && hole4.B === 28 && hole4.C === -28 && hole4.D === -28,
  JSON.stringify(hole4)
);

assert('10. PAR3 非HIO gross=2 仍 -1 档=8', pts(-1, 3) === 8 && s8421.resolve8421ScoreBand({ diff: -1, par: 3 }) === 'm1');
assert(
  '11. PAR5 gross=2 diff=-3 仍最高档32',
  pts(-3, 5) === 32 && s8421.resolve8421ScoreBand({ gross: 2, par: 5, diff: -3 }) === 'hio'
);

var map50 = s8421.fromScoreRows(customRows(50));
var map99 = s8421.fromScoreRows(customRows(99));
assert('12. 自定义最高档50 HIO→50', s8421.personalScore(-2, map50, deductOff(), 3) === 50);
assert('13. 自定义最高档99 HIO→99', s8421.personalScore(-2, map99, deductOff(), 3) === 99);

var customPlayers = [
  { id: 'A', scoreRows: customRows(50) },
  { id: 'B', scoreCode: '8421' }
];
var customHole = settle2.settle(twoGame(customPlayers), ctxOf({ A: -2, B: 0 }, 3)).byHole['1'];
assert(
  '12b. 实例自定义最高档50 本洞分差 50-4',
  customHole.A === 46 && customHole.B === -46,
  JSON.stringify(customHole)
);

var fact = { diff: -2, par: 3, gross: 1 };
s8421.resolve8421ScoreBand(fact);
assert('14. helper 不改写真实 diff', fact.diff === -2 && fact.gross === 1);
var scores = { A: -2, B: 0 };
settle2.settle(twoGame(), ctxOf(scores, 3));
assert('14b. settle 不改写输入 rel', scores.A === -2 && scores.B === 0);
assert(
  '14c. PAR4 老鹰 gross!=1 仍 16 不误进最高档',
  pts(-2, 4) === 16 && s8421.resolve8421ScoreBand({ diff: -2, par: 4 }) === 'm2'
);

assert(
  '未接 specialResult / Infinity',
  hole2.A !== Infinity &&
    JSON.stringify(settle2.settle(twoGame(), ctxOf({ A: -2, B: 0 }, 3))).indexOf('specialResult') < 0
);

console.log('\ngame8421HioTopBand.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
