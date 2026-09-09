/**
 * 8421 肉分值进入捐锅：赢家每洞捐 N 随完整 stake 同比缩放。
 * 运行：node scripts/game8421DonateMeat.selftest.js
 */
var path = require('path');
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils');
var settle = require(path.join(utilsDir, 'settle.js'));
var settlePot = require(path.join(utilsDir, 'settlePot.js'));
var settle4 = require(path.join(utilsDir, 'settle8421Four.js'));

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

function meatRows(n) {
  return ['le-2', 'm1', 'par', 'p1', 'ge-2'].map(function (id) {
    return { id: id, value: String(n == null ? 1 : n) };
  });
}

function baseRule(extra) {
  return Object.assign(
    {
      catalogId: '8421-4',
      reward: 'none',
      pushRule: 'tie',
      meatEatMode: 'piece',
      meatValueType: 'double',
      meatValueN: 1,
      meatRows: meatRows(3),
      baoNeg: 'none',
      deductMode: 'on',
      deductWay: 'plus-n',
      deductPlusN: 4,
      deductCap: 'none'
    },
    extra || {}
  );
}

function fourGame(extra, players) {
  return Object.assign(
    {
      catalogId: '8421-4',
      players: (players || ['A', 'B', 'C', 'D']).map(function (id) {
        return typeof id === 'string' ? { id: id, scoreCode: '8421' } : id;
      }),
      playerOrder: ['A', 'B', 'C', 'D'],
      groupMode: 'fixed',
      multiplier: 1,
      holes: [
        { label: '1', on: true },
        { label: '2', on: true },
        { label: '3', on: true }
      ],
      ruleSnapshot: baseRule()
    },
    extra || {}
  );
}

function ctx(byHole) {
  var holeOrder = Object.keys(byHole);
  var pars = {};
  holeOrder.forEach(function (h) {
    pars[h] = 4;
  });
  return { scores: byHole, holeOrder: holeOrder, pars: pars, windOn: false };
}

function ids() {
  return ['A', 'B', 'C', 'D'];
}

function applyPot(ledger, mode, n, scale) {
  return settlePot.applyHolePot(mode || 'winner-n', n == null ? 1 : n, Infinity, ledger, ids(), scale);
}

function holeSum(ledger) {
  var s = 0;
  ids().forEach(function (id) {
    s += Number(ledger[id]) || 0;
  });
  return settle.round1(s);
}

function donateSum(applied) {
  var s = 0;
  ids().forEach(function (id) {
    s += Number(applied.donated[id]) || 0;
  });
  return settle.round1(s);
}

function afterPlusPot(applied) {
  var s = donateSum(applied);
  ids().forEach(function (id) {
    s += Number(applied.display[id]) || 0;
  });
  return settle.round1(s);
}

function winHole() {
  return { A: 0, B: 0, C: 0, D: 1 };
}

function pushHole() {
  return { A: 0, B: 0, C: 0, D: 0 };
}

var winPlayers = [
  { id: 'A', scoreCode: '8421' },
  { id: 'B', scoreCode: '8421' },
  { id: 'C', scoreCode: '8421' },
  { id: 'D', scoreCode: '8431' }
];

assert(
  '无 scale 时 winner-n 仍 min(N,正分)',
  applyPot({ A: 3, B: 3, C: -3, D: -3 }, 'winner-n', 1).donated.A === 1
);

var p1game = fourGame({ ruleSnapshot: baseRule() }, winPlayers);
var p1 = settle4.settle(p1game, ctx({ '1': winHole() }));
var p1h = p1.byHole['1'];
assert('P1 无肉无捐锅 每人±1', p1h.A === 1 && p1h.B === 1 && p1h.C === -1 && p1h.D === -1, JSON.stringify(p1h));
assert('P1 零和', holeSum(p1h) === 0);
assert('P1 scale=1', p1.donateScaleByHole['1'].A === 1);

var p2applied = applyPot(p1h, 'winner-n', 1, p1.donateScaleByHole['1']);
assert('P2 无肉捐锅量=2（两赢家各1）', donateSum(p2applied) === 2, JSON.stringify(p2applied));
assert('P2 捐锅后赢家显示0', p2applied.display.A === 0 && p2applied.display.B === 0);
assert('P2 显示+捐锅仍零和于原 ledger', afterPlusPot(p2applied) === 0);

var p3game = fourGame({ ruleSnapshot: baseRule() }, winPlayers);
var p3 = settle4.settle(p3game, ctx({ '1': pushHole(), '2': winHole() }));
var p3h = p3.byHole['2'];
assert('P3 1块肉无捐锅 每人±2', p3h.A === 2 && p3h.B === 2 && p3h.C === -2 && p3h.D === -2, JSON.stringify(p3h));
assert('P3 scale=2', p3.donateScaleByHole['2'].A === 2, JSON.stringify(p3.donateScaleByHole['2']));
assert('P3 零和', holeSum(p3h) === 0);

var p4applied = applyPot(p3h, 'winner-n', 1, p3.donateScaleByHole['2']);
assert('P4 捐锅基于 stake=2：两赢家各捐2', p4applied.donated.A === 2 && p4applied.donated.B === 2, JSON.stringify(p4applied));
assert('P4 不是只捐1再叠肉', p4applied.display.A === 0 && p4applied.donated.A !== 1, JSON.stringify(p4applied));
assert('P4 显示+捐锅零和', afterPlusPot(p4applied) === 0);

var p5game = fourGame({ ruleSnapshot: baseRule() }, winPlayers);
var p5 = settle4.settle(p5game, ctx({ '1': pushHole(), '2': pushHole(), '3': winHole() }));
var p5h = p5.byHole['3'];
assert('P5 2块肉 每人±3', p5h.A === 3 && p5h.B === 3 && p5h.C === -3 && p5h.D === -3, JSON.stringify(p5h));
assert('P5 scale=3', p5.donateScaleByHole['3'].A === 3, JSON.stringify(p5.donateScaleByHole['3']));
var p5applied = applyPot(p5h, 'winner-n', 1, p5.donateScaleByHole['3']);
assert('P5 捐锅各3', p5applied.donated.A === 3 && p5applied.donated.B === 3, JSON.stringify(p5applied));
assert('P5 显示+捐锅零和', afterPlusPot(p5applied) === 0);

var p6 = settle4.settle(fourGame({ ruleSnapshot: baseRule() }, winPlayers), ctx({ '1': pushHole(), '2': pushHole() }));
assert('P6 顶洞未吃肉 ledger=0', holeSum(p6.byHole['1']) === 0 && holeSum(p6.byHole['2']) === 0);
var p6a = applyPot(p6.byHole['1'], 'winner-n', 1, p6.donateScaleByHole['1']);
assert('P6 顶洞不捐锅', donateSum(p6a) === 0, JSON.stringify(p6a));

var baoGame = fourGame(
  {
    ruleSnapshot: baseRule({
      baoNeg: 'always',
      deductMode: 'on',
      deductWay: 'plus-n',
      deductPlusN: 4
    })
  },
  [
    { id: 'A', scoreCode: '8421' },
    { id: 'B', scoreCode: '8421' },
    { id: 'C', scoreCode: '8421' },
    { id: 'D', scoreCode: '8421' }
  ]
);
var bao = settle4.settle(
  baoGame,
  ctx({
    '1': pushHole(),
    '2': { A: 6, B: 0, C: 0, D: 0 }
  })
);
var baoH = bao.byHole['2'];
assert('P7 包负分后仍零和', holeSum(baoH) === 0, JSON.stringify(baoH));
var baoPot = applyPot(baoH, 'winner-n', 1, bao.donateScaleByHole['2']);
assert('P7 捐锅后 display+donated 仍对齐原 ledger 零和', afterPlusPot(baoPot) === 0, JSON.stringify(baoPot));

var p8a = settle4.settle(
  fourGame({ ruleSnapshot: baseRule() }, [
    { id: 'A', scoreCode: '8421' },
    { id: 'B', scoreCode: '8421' },
    { id: 'C', scoreCode: '8421' },
    { id: 'D', scoreCode: '8431' }
  ]),
  ctx({ '1': pushHole(), '2': winHole() })
);
var p8b = settle4.settle(
  fourGame({ ruleSnapshot: baseRule() }, [
    { id: 'A', scoreCode: '8432' },
    { id: 'B', scoreCode: '8421' },
    { id: 'C', scoreCode: '8421' },
    { id: 'D', scoreCode: '8431' }
  ]),
  ctx({ '1': pushHole(), '2': winHole() })
);
assert(
  'P8 相同 team diff：肉后 ledger 一致',
  JSON.stringify(p8a.byHole['2']) === JSON.stringify(p8b.byHole['2'])
);
var p8ap = applyPot(p8a.byHole['2'], 'winner-n', 1, p8a.donateScaleByHole['2']);
var p8bp = applyPot(p8b.byHole['2'], 'winner-n', 1, p8b.donateScaleByHole['2']);
assert('P8 捐锅量一致', JSON.stringify(p8ap.donated) === JSON.stringify(p8bp.donated));

var allModeMeat = applyPot(p3h, 'all', 1, p3.donateScaleByHole['2']);
assert('全捐仍抽走含肉正分', allModeMeat.display.A === 0 && allModeMeat.donated.A === 2);

var noScaleOld = applyPot(p1h, 'winner-n', 1, null);
assert('缺 scale 的旧结果：P2 口径不变', noScaleOld.donated.A === 1 && noScaleOld.display.A === 0);

var two = settle.settleGame(
  {
    catalogId: '8421-2',
    players: [
      { id: 'A', scoreCode: '8421' },
      { id: 'B', scoreCode: '8431' }
    ],
    pairings: [{ id: 'p', leftId: 'A', rightId: 'B', on: true }],
    multiplier: 1,
    holes: [
      { label: '1', on: true },
      { label: '2', on: true }
    ],
    ruleSnapshot: baseRule({ catalogId: '8421-2' })
  },
  ctx({
    '1': { A: 0, B: 0 },
    '2': { A: 0, B: 1 }
  })
);
var twoH = two.byHole['2'];
assert('8421-2 吃1肉后 ±2', twoH.A === 2 && twoH.B === -2, JSON.stringify(twoH));
assert('8421-2 scale=2', two.donateScaleByHole['2'].A === 2, JSON.stringify(two.donateScaleByHole));
var twoPot = settlePot.applyHolePot('winner-n', 1, Infinity, twoH, ['A', 'B'], two.donateScaleByHole['2']);
assert('8421-2 捐锅抽2不是1', twoPot.donated.A === 2 && twoPot.display.A === 0, JSON.stringify(twoPot));

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
process.exit(0);
