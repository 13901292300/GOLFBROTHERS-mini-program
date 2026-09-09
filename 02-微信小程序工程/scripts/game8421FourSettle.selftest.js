/**
 * 四人 8421：扣分封顶只作用于扣分映射；包负分在肉合并后执行。
 * 运行：node scripts/game8421FourSettle.selftest.js
 */
var path = require('path');
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils');
var core = require(path.join(utilsDir, 'settleCore.js'));
var s8421 = require(path.join(utilsDir, 'settle8421.js'));
var settle4 = require(path.join(utilsDir, 'settle8421Four.js'));
var settle3 = require(path.join(utilsDir, 'settle8421Three.js'));
var settle2 = require(path.join(utilsDir, 'settle8421.js'));

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

function meatRows() {
  return ['le-2', 'm1', 'par', 'p1', 'ge-2'].map(function (id) {
    return { id: id, value: '1' };
  });
}

function baseRule(extra) {
  return Object.assign(
    {
      catalogId: '8421-4',
      reward: 'none',
      pushRule: 'tie',
      meatEatMode: 'piece',
      meatValueType: 'fixed',
      meatValueN: 1,
      meatRows: meatRows(),
      baoNeg: 'none',
      deductMode: 'on',
      deductWay: 'plus-n',
      deductPlusN: 4,
      deductCap: 'none',
      deductCapN: 3
    },
    extra || {}
  );
}

function fourGame(rule, players) {
  return {
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
    ruleSnapshot: baseRule(rule)
  };
}

function ctx(byHole) {
  var holeOrder = Object.keys(byHole);
  var pars = {};
  holeOrder.forEach(function (h) {
    pars[h] = 4;
  });
  return { scores: byHole, holeOrder: holeOrder, pars: pars, windOn: false };
}

function holeSum(ledger) {
  var ids = ['A', 'B', 'C', 'D'];
  var s = 0;
  ids.forEach(function (id) {
    s += Number(ledger && ledger[id]) || 0;
  });
  s += Number(ledger && ledger[core.POT_ID]) || 0;
  return core.round1(s);
}

function mapped(rel, deduct) {
  var map = s8421.expandScoreCode('8421');
  return s8421.personalScore(rel, map, deduct, 4);
}

var cap1 = s8421.deductCfg(
  {},
  { deductMode: 'on', deductWay: 'plus-n', deductPlusN: 4, deductCap: 'cap', deductCapN: 1 }
);
var capOff = s8421.deductCfg(
  {},
  { deductMode: 'on', deductWay: 'plus-n', deductPlusN: 4, deductCap: 'none', deductCapN: 3 }
);
var cap3 = s8421.deductCfg(
  {},
  { deductMode: 'on', deductWay: 'plus-n', deductPlusN: 4, deductCap: 'cap', deductCapN: 3 }
);

assert('Case A 扣分 raw-3 cap1 → 映射 -1', mapped(6, cap1) === -1, String(mapped(6, cap1)));
assert('Case A 未封顶 raw 仍为 -3', mapped(6, capOff) === -3, String(mapped(6, capOff)));

var playerNoCap = { deductMode: 'on', deductWay: 'plus-n', deductPlusN: 4 };
var merged = s8421.deductCfg(playerNoCap, {
  deductMode: 'on',
  deductWay: 'plus-n',
  deductPlusN: 4,
  deductCap: 'cap',
  deductCapN: 1
});
assert('Case A 球员缺 cap 时继承规则 cap', merged.deductCap === 'cap' && merged.deductCapN === 1);
assert('Case A 继承 cap 后 +6 → -1', mapped(6, merged) === -1);

var aHole = settle4.settle(
  fourGame({ deductCap: 'cap', deductCapN: 1 }),
  ctx({ '1': { A: 0, B: 0, C: 6, D: 0 } })
).byHole['1'];
assert(
  'Case A 队差按封顶后映射 D=5，非整洞 clamp',
  aHole.A === 5 && aHole.B === 5 && aHole.C === -5 && aHole.D === -5,
  JSON.stringify(aHole)
);
assert('Case A 零和', holeSum(aHole) === 0);

var bHole = settle4.settle(
  fourGame({ deductCap: 'cap', deductCapN: 1 }),
  ctx({ '1': { A: 0, B: 0, C: 4, D: 0 } })
).byHole['1'];
assert('Case B raw-1 cap1 保持 -1 映射', mapped(4, cap1) === -1);
assert(
  'Case B 洞结果 ±5',
  bHole.A === 5 && bHole.C === -5 && bHole.D === -5,
  JSON.stringify(bHole)
);
assert('Case B 零和', holeSum(bHole) === 0);

assert('Case C +4 cap3 不被改坏', mapped(4, cap3) === -1);
assert('Case C +5 cap3 为 -2', mapped(5, cap3) === -2);
var cHole = settle4.settle(
  fourGame({ deductCap: 'cap', deductCapN: 3 }),
  ctx({ '1': { A: 0, B: 0, C: 4, D: 0 } })
).byHole['1'];
assert(
  'Case C 洞结果与未达封顶一致 ±5',
  cHole.A === 5 && cHole.C === -5,
  JSON.stringify(cHole)
);

var dHole = settle4.settle(
  fourGame({ deductCap: 'none' }),
  ctx({ '1': { A: 0, B: 0, C: 6, D: 0 } })
).byHole['1'];
assert('Case D 未开封顶映射 -3', mapped(6, capOff) === -3);
assert(
  'Case D 队差 D=7 保持',
  dHole.A === 7 && dHole.C === -7 && dHole.D === -7,
  JSON.stringify(dHole)
);
assert('Case D 零和', holeSum(dHole) === 0);

var e2eCapPlayers = ['A', 'B', 'C', 'D'].map(function (id) {
  return {
    id: id,
    scoreCode: '8421',
    deductMode: 'on',
    deductWay: 'plus-n',
    deductPlusN: '4',
    deductCap: 'none',
    deductCapN: '3'
  };
});
var e2eCap = settle4.settle(
  fourGame({ deductCap: 'cap', deductCapN: '1' }, e2eCapPlayers),
  ctx({ '1': { A: 6, B: 0, C: 0, D: 0 } })
).byHole['1'];
assert('E2E cap=1 字符串/球员none：A mapped 已是 -1 故 ±5', mapped(6, cap1) === -1);
assert(
  'E2E cap=1 → ±5（A+6 B/C/D PAR）',
  e2eCap.A === -5 && e2eCap.B === -5 && e2eCap.C === 5 && e2eCap.D === 5,
  JSON.stringify(e2eCap)
);
assert('E2E cap=1 零和', holeSum(e2eCap) === 0);

var e2eNone = settle4.settle(
  fourGame({ deductCap: 'none' }),
  ctx({ '1': { A: 6, B: 0, C: 0, D: 0 } })
).byHole['1'];
assert(
  'E2E cap=none → ±7',
  e2eNone.A === -7 && e2eNone.B === -7 && e2eNone.C === 7 && e2eNone.D === 7,
  JSON.stringify(e2eNone)
);

var nestedCap = s8421.deductCfg(
  {},
  {
    catalogId: '8421-4',
    reward: 'none',
    ruleSnapshot: { deductCap: 'cap', deductCapN: '1', deductMode: 'on', deductWay: 'plus-n', deductPlusN: 4 }
  }
);
assert(
  '嵌套 ruleSnapshot + reward none 仍读到 cap=1',
  nestedCap.deductCap === 'cap' && nestedCap.deductCapN === 1
);

var p1 = settle4.settle(
  fourGame({ baoNeg: 'ignore', deductCap: 'none' }),
  ctx({ '1': { A: 4, B: 0, C: 0, D: 0 } })
).byHole['1'];
assert('P1 A 映射 -1', mapped(4, capOff) === -1);
assert(
  'P1 无肉 A-6 B-4 C+5 D+5',
  p1.A === -6 && p1.B === -4 && p1.C === 5 && p1.D === 5,
  JSON.stringify(p1)
);
assert('P1 零和', holeSum(p1) === 0);
assert('P1 对方正分不变', p1.C === 5 && p1.D === 5);

var doubleMeat = { baoNeg: 'ignore', deductCap: 'none', meatValueType: 'double' };
var p2res = settle4.settle(
  fourGame(doubleMeat),
  ctx({
    '1': { A: 0, B: 0, C: 0, D: 0 },
    '2': { A: 4, B: 0, C: 0, D: 0 }
  })
);
var p2 = p2res.byHole['2'];
assert('P2 第1洞攒1块肉', holeSum(p2res.byHole['1']) === 0);
assert(
  'P2 1块肉翻倍 A-12 B-8 C+10 D+10',
  p2.A === -12 && p2.B === -8 && p2.C === 10 && p2.D === 10,
  JSON.stringify(p2)
);
assert('P3 P2 零和', holeSum(p2) === 0);
assert(
  'P4 不得把同伴整块肉搬走成 A-16 B-4',
  !(p2.A === -16 && p2.B === -4),
  JSON.stringify(p2)
);

var p5res = settle4.settle(
  fourGame(
    Object.assign({}, doubleMeat, {
      meatRows: ['le-2', 'm1', 'par', 'p1', 'ge-2'].map(function (id) {
        return { id: id, value: '2' };
      })
    })
  ),
  ctx({
    '1': { A: 0, B: 0, C: 0, D: 0 },
    '2': { A: 0, B: 0, C: 0, D: 0 },
    '3': { A: 4, B: 0, C: 0, D: 0 }
  })
);
var p5 = p5res.byHole['3'];
assert(
  'P5 两块肉翻倍 M=3：normal±15 baoTransfer=3 → A-18 B-12 C+15 D+15',
  p5.A === -18 && p5.B === -12 && p5.C === 15 && p5.D === 15,
  JSON.stringify(p5)
);
assert('P5 零和', holeSum(p5) === 0);
assert(
  'P5 不是 baseBao+同伴肉损（会得到 A-26）',
  p5.A !== -26 && p5.B !== -4,
  JSON.stringify(p5)
);

var two = settle2.settle(
  {
    catalogId: '8421-2',
    players: [
      { id: 'A', scoreCode: '8421' },
      { id: 'B', scoreCode: '8421' }
    ],
    pairings: [{ id: 'p', leftId: 'A', rightId: 'B', on: true }],
    multiplier: 1,
    holes: [{ label: '1', on: true }],
    ruleSnapshot: baseRule({ catalogId: '8421-2', deductCap: 'cap', deductCapN: 1 })
  },
  ctx({ '1': { A: 0, B: 6 } })
).byHole['1'];
assert(
  '8421-2 regression 封顶后分差 4-(-1)=5',
  two.A === 5 && two.B === -5,
  JSON.stringify(two)
);

var t3 = settle3.settle(
  {
    catalogId: '8421-3',
    players: [
      { id: 'A', scoreCode: '8421' },
      { id: 'B', scoreCode: '8421' },
      { id: 'C', scoreCode: '8421' }
    ],
    playerOrder: ['A', 'B', 'C'],
    groupMode: 'fixed',
    multiplier: 1,
    holes: [
      { label: '1', on: true },
      { label: '2', on: true }
    ],
    ruleSnapshot: baseRule({ catalogId: '8421-3', baoNeg: 'ignore', meatValueType: 'double' })
  },
  ctx({
    '1': { A: 0, B: 0, C: 0 },
    '2': { A: 4, B: 0, C: 0 }
  })
);
var t32 = t3.byHole['2'];
assert(
  '8421-3 双人队包负分随倍率：A-12 C-8 B+20',
  t32.B === 20 && t32.A === -12 && t32.C === -8,
  JSON.stringify(t32)
);
assert(
  '8421-3 零和',
  core.round1((t32.A || 0) + (t32.B || 0) + (t32.C || 0) + (t32[core.POT_ID] || 0)) === 0
);

var hRels = { '1': { A: 3, B: 1, C: 3, D: 1 } };

function mappedOf(code, rel) {
  var player = { id: 'x', scoreCode: code };
  var rule = baseRule();
  return s8421.personalScore(
    rel,
    s8421.scoreMapFor(player, rule, { players: [player] }),
    s8421.deductCfg(player, rule),
    4
  );
}

assert('对照 8421 PAR→4', mappedOf('8421', 0) === 4);
assert('对照 8431 PAR→4', mappedOf('8431', 0) === 4);
assert('对照 8421 +1→2', mappedOf('8421', 1) === 2);
assert('对照 8431 +1→3', mappedOf('8431', 1) === 3);
assert('对照 8421 +2→1', mappedOf('8421', 2) === 1);
assert('对照 8431 +2→1', mappedOf('8431', 2) === 1);
assert('对照 8421 +3→0', mappedOf('8421', 3) === 0);
assert('对照 8431 +3→0', mappedOf('8431', 3) === 0);
assert('对照 8421 +4→-1', mappedOf('8421', 4) === -1);
assert('对照 8431 +4→-1', mappedOf('8431', 4) === -1);

var h2 = settle4.settle(fourGame(), ctx(hRels)).byHole['1'];
assert(
  'H2 全员8421 +3/+1/+3/+1 打平',
  h2.A === 0 && h2.B === 0 && h2.C === 0 && h2.D === 0,
  JSON.stringify(h2)
);
assert('H2 零和', holeSum(h2) === 0);

var h1players = [
  { id: 'A', scoreCode: '8431' },
  { id: 'B', scoreCode: '8421' },
  { id: 'C', scoreCode: '8421' },
  { id: 'D', scoreCode: '8421' }
];
var h1 = settle4.settle(fourGame({}, h1players), ctx(hRels)).byHole['1'];
assert(
  'H1 A=8431 其余8421 必须打平 0',
  h1.A === 0 && h1.B === 0 && h1.C === 0 && h1.D === 0,
  JSON.stringify(h1)
);
assert('H1 零和', holeSum(h1) === 0);

var h3 = settle4.settle(fourGame({}, h1players), ctx(hRels)).byHole['1'];
assert(
  'H3 仅改 A 的 scoreCode 仍打平',
  h3.A === 0 && h3.B === 0 && h3.C === 0 && h3.D === 0,
  JSON.stringify(h3)
);

var staleRows = [
  { id: 'hio', value: 32 },
  { id: 'm2', value: 16 },
  { id: 'm1', value: 8 },
  { id: 'par', value: 4 },
  { id: 'p1', value: 2 },
  { id: 'p2', value: 1 },
  { id: 'p3', value: 2 }
];
var h1stale = settle4.settle(
  fourGame({}, [
    { id: 'A', scoreCode: '8431', scoreRows: staleRows },
    { id: 'B', scoreCode: '8421' },
    { id: 'C', scoreCode: '8421' },
    { id: 'D', scoreCode: '8421' }
  ]),
  ctx(hRels)
).byHole['1'];
assert(
  'H1 scoreCode 优先于残留 scoreRows',
  h1stale.A === 0 && h1stale.B === 0 && h1stale.C === 0 && h1stale.D === 0,
  JSON.stringify(h1stale)
);

var fork = settle4.settle(
  fourGame({}, [
    { id: 'A', scoreRows: staleRows },
    { id: 'B', scoreCode: '8421' },
    { id: 'C', scoreCode: '8421' },
    { id: 'D', scoreCode: '8421' }
  ]),
  ctx(hRels)
).byHole['1'];
assert(
  '无 scoreCode 且 rows.p3=2 才会出现历史 ±2',
  fork.A === 2 && fork.B === 2 && fork.C === -2 && fork.D === -2,
  JSON.stringify(fork)
);
assert('该分叉仍零和', holeSum(fork) === 0);

console.log('---');
console.log('passed ' + passed + '  failed ' + failed);
if (failed) process.exit(1);
