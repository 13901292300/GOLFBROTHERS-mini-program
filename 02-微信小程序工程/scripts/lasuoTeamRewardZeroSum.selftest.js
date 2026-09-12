/**
 * 头尾两点 / 头2尾1 / 头总两点：奖励进入团队净差，每洞四人积分零和。
 * 运行：node scripts/lasuoTeamRewardZeroSum.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
global.wx.getStorageSync = global.wx.getStorageSync || function () {
  return null;
};
global.wx.setStorageSync = global.wx.setStorageSync || function () {};
global.wx.showToast = function () {};

var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var ruleDefaults = require('../miniprogram/subpackages/game/utils/sideGameRuleDefaults.js');
var settleLasuo4 = require('../miniprogram/subpackages/game/utils/settleLasuo4.js');
var core = require('../miniprogram/subpackages/game/utils/settleCore.js');

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

function addRows(over) {
  over = over || {};
  return [
    { id: 'hio', value: String(over.hio != null ? over.hio : 10) },
    { id: 'm2', value: String(over.m2 != null ? over.m2 : 3) },
    { id: 'm1', value: String(over.m1 != null ? over.m1 : 1) },
    { id: 'par', value: String(over.par != null ? over.par : 0) },
    { id: 'p1', value: String(over.p1 != null ? over.p1 : 0) },
    { id: 'ge2', value: String(over.ge2 != null ? over.ge2 : 0) }
  ];
}

function mulRows(over) {
  over = over || {};
  return [
    { id: 'hio', value: String(over.hio != null ? over.hio : 10) },
    { id: 'm2', value: String(over.m2 != null ? over.m2 : 5) },
    { id: 'm1', value: String(over.m1 != null ? over.m1 : 2) },
    { id: 'par', value: String(over.par != null ? over.par : 1) },
    { id: 'p1', value: String(over.p1 != null ? over.p1 : 1) },
    { id: 'ge2', value: String(over.ge2 != null ? over.ge2 : 1) }
  ];
}

function headTail(extra) {
  return Object.assign(ruleDefaults.applyLasuoHeadTailTwoPointDefaults({}), extra || {});
}

function headTotal(extra) {
  return Object.assign(ruleDefaults.applyLasuoHeadTotalTwoPointDefaults({}), extra || {});
}

function gameOf(rule) {
  return {
    catalogId: 'lasuo-4',
    groupMode: 'random',
    rankId: 'gross-origin',
    playerOrder: ['A', 'B', 'C', 'D'],
    players: ['A', 'B', 'C', 'D'].map(function (id) {
      return { id: id };
    }),
    multiplier: 1,
    holes: [
      { label: 'A1', on: true },
      { label: 'A2', on: true }
    ],
    ruleSnapshot: rule
  };
}

function settle(rule, holeRels) {
  return settleLasuo4.settle(gameOf(rule), {
    scores: { A1: holeRels },
    holeOrder: ['A1', 'A2'],
    pars: { A1: 4, A2: 4 }
  });
}

function dbg(out) {
  return out.holeDebug.A1;
}

function pts(out) {
  return dbg(out).personalScores;
}

function sum4(out) {
  var s = pts(out);
  return core.round1(Number(s.A) + Number(s.B) + Number(s.C) + Number(s.D));
}

function mirrored(out, teamDiff) {
  var s = pts(out);
  return (
    s.A === teamDiff &&
    s.D === teamDiff &&
    s.B === -teamDiff &&
    s.C === -teamDiff
  );
}

function advantageGrew(out) {
  return Math.abs(dbg(out).rewardedTeamScore) > Math.abs(dbg(out).baseTeamScore);
}

var c1 = settle(
  headTail({ reward: 'none', pushRule: 'none', baoMode: 'none' }),
  { A: -1, B: 0, C: 2, D: 1 }
);
assert(
  'CASE1 头尾两点基础：蓝赢头尾，四人零和',
  catalog.isLasuoHeadTailTwoPoint(headTail()) === true &&
    dbg(c1).winningTeam === 'A' &&
    dbg(c1).baseTeamScore === 2 &&
    dbg(c1).rewardedTeamScore === 2 &&
    mirrored(c1, 2) &&
    sum4(c1) === 0,
  JSON.stringify(dbg(c1))
);

var c2 = settle(
  headTail({ reward: 'add', addRows: addRows({ m1: 1 }), pushRule: 'none', baoMode: 'none' }),
  { A: -1, B: 0, C: 2, D: 1 }
);
assert(
  'CASE2 头尾两点只蓝头小鸟：团队 +1，不是只给 A 个人加分',
  dbg(c2).baseTeamScore === 2 &&
    dbg(c2).addByPlayer.A === 1 &&
    dbg(c2).addByPlayer.D === 0 &&
    dbg(c2).addRewardA === 1 &&
    dbg(c2).addRewardB === 0 &&
    dbg(c2).rewardedTeamScore === 3 &&
    pts(c2).A === pts(c2).D &&
    pts(c2).A === 3 &&
    mirrored(c2, 3) &&
    sum4(c2) === 0,
  JSON.stringify(dbg(c2))
);

var c3 = settle(
  headTail({
    reward: 'add',
    addRows: addRows({ m1: 1, m2: 0 }),
    pushRule: 'none',
    baoMode: 'none'
  }),
  { A: -1, B: -2, C: -1, D: 1 }
);
assert(
  'CASE3 蓝头小鸟 + 红尾小鸟：两队奖励净差后零和',
  dbg(c3).addByPlayer.A === 1 &&
    dbg(c3).addByPlayer.C === 1 &&
    dbg(c3).addRewardA === 1 &&
    dbg(c3).addRewardB === 1 &&
    dbg(c3).rewardedTeamScore === dbg(c3).baseTeamScore + 1 - 1 &&
    pts(c3).A === pts(c3).D &&
    pts(c3).B === pts(c3).C &&
    pts(c3).A === -pts(c3).B &&
    sum4(c3) === 0,
  JSON.stringify(dbg(c3))
);

var c4head = settle(
  headTail({
    reward: 'add',
    pkBetterW: '2',
    pkWorseW: '1',
    addRows: addRows({ m1: 1 }),
    pushRule: 'none',
    baoMode: 'none'
  }),
  { A: -1, B: 1, C: 1, D: 0 }
);
assert(
  'CASE4a 头2尾1 蓝头小鸟：奖励 ×2 进团队',
  dbg(c4head).addByPlayer.A === 2 &&
    dbg(c4head).addRewardA === 2 &&
    dbg(c4head).rewardedTeamScore === dbg(c4head).baseTeamScore + 2 &&
    pts(c4head).A === pts(c4head).D &&
    sum4(c4head) === 0,
  JSON.stringify(dbg(c4head))
);

var c4tail = settle(
  headTail({
    reward: 'add',
    pkBetterW: '2',
    pkWorseW: '1',
    addRows: addRows({ m1: 1, m2: 0 }),
    pushRule: 'none',
    baoMode: 'none'
  }),
  { A: -2, B: 0, C: 2, D: -1 }
);
assert(
  'CASE4b 头2尾1 蓝尾小鸟：奖励 ×1 进团队',
  dbg(c4tail).addByPlayer.D === 1 &&
    dbg(c4tail).addRewardA === 1 &&
    dbg(c4tail).rewardedTeamScore === dbg(c4tail).baseTeamScore + 1 &&
    sum4(c4tail) === 0,
  JSON.stringify(dbg(c4tail))
);

var c4both = settle(
  headTail({
    reward: 'add',
    pkBetterW: '2',
    pkWorseW: '1',
    addRows: addRows({ m1: 1 }),
    pushRule: 'none',
    baoMode: 'none'
  }),
  { A: -1, B: 1, C: 2, D: -1 }
);
assert(
  'CASE4c 头2尾1 头尾都小鸟：团队奖励 +3，零和',
  dbg(c4both).addByPlayer.A === 2 &&
    dbg(c4both).addByPlayer.D === 1 &&
    dbg(c4both).addRewardA === 3 &&
    dbg(c4both).rewardedTeamScore === dbg(c4both).baseTeamScore + 3 &&
    mirrored(c4both, dbg(c4both).finalTeamScore) &&
    sum4(c4both) === 0,
  JSON.stringify(dbg(c4both))
);

var c5 = settle(
  headTotal({
    reward: 'add',
    pkBetterW: '2',
    pkTotalW: '1',
    addRows: addRows({ m1: 1 }),
    pushRule: 'none',
    baoMode: 'none'
  }),
  { A: -1, B: 1, C: 1, D: 0 }
);
assert(
  'CASE5 头总两点加法 rawCmp=3 较好小鸟×2 → 5，各记 ±5',
  catalog.isLasuoHeadTotalTwoPoint(headTotal()) === true &&
    dbg(c5).baseTeamScore === 3 &&
    dbg(c5).rewardedTeamScore === 5 &&
    dbg(c5).addByPlayer == null &&
    mirrored(c5, 5) &&
    sum4(c5) === 0,
  JSON.stringify(dbg(c5))
);

var c6 = settle(
  headTotal({
    reward: 'mul',
    pkBetterW: '2',
    pkTotalW: '3',
    mulRows: mulRows({ m1: 2 }),
    pushRule: 'none',
    baoMode: 'none'
  }),
  { A: -1, B: 1, C: 1, D: 0 }
);
assert(
  'CASE6 头总两点乘法 rawCmp=5 × 胜方较好倍数2 → 10',
  dbg(c6).baseTeamScore === 5 &&
    dbg(c6).multiplierSource === 'head-total-better' &&
    Number(dbg(c6).multiplier) === 2 &&
    dbg(c6).rewardedTeamScore === 10 &&
    mirrored(c6, 10) &&
    sum4(c6) === 0,
  JSON.stringify(dbg(c6))
);

var c7ht = settle(
  headTotal({
    reward: 'add',
    addRows: addRows({ m2: 3, m1: 1 }),
    pushRule: 'none',
    baoMode: 'none'
  }),
  { A: -2, B: -1, C: 2, D: 0 }
);
assert(
  'CASE7a 头总两点：负方小鸟不触发奖励',
  dbg(c7ht).winningTeam === 'A' &&
    dbg(c7ht).baseTeamScore === 2 &&
    dbg(c7ht).rewardedTeamScore === 5 &&
    dbg(c7ht).addByPlayer == null &&
    pts(c7ht).B === pts(c7ht).C &&
    mirrored(c7ht, 5) &&
    sum4(c7ht) === 0,
  JSON.stringify(dbg(c7ht))
);

var c7tail = settle(
  headTail({ reward: 'add', addRows: addRows({ m2: 3, m1: 1 }), pushRule: 'none', baoMode: 'none' }),
  { A: 0, B: -2, C: 0, D: 1 }
);
assert(
  'CASE7b 头尾两点：负方奖励进红队团队净差，不是个人凭空加分',
  dbg(c7tail).addByPlayer.B === 3 &&
    pts(c7tail).B === pts(c7tail).C &&
    pts(c7tail).A === pts(c7tail).D &&
    pts(c7tail).B === -pts(c7tail).A &&
    sum4(c7tail) === 0,
  JSON.stringify(dbg(c7tail))
);

var c8 = settle(
  headTail({
    reward: 'add',
    pkBetterW: '2',
    pkWorseW: '3',
    addRows: addRows({ m1: 1 }),
    pushRule: 'none',
    baoMode: 'none'
  }),
  { A: -1, B: 1, C: 2, D: -1 }
);
assert(
  'CASE8 头2尾3：基础与奖励都乘对应权重，零和',
  dbg(c8).indicatorWeights.better === 2 &&
    dbg(c8).indicatorWeights.worse === 3 &&
    dbg(c8).addByPlayer.A === 2 &&
    dbg(c8).addByPlayer.D === 3 &&
    dbg(c8).addRewardA === 5 &&
    dbg(c8).rewardedTeamScore === dbg(c8).baseTeamScore + 5 &&
    mirrored(c8, dbg(c8).finalTeamScore) &&
    sum4(c8) === 0,
  JSON.stringify(dbg(c8))
);

var caseA = settle(
  headTotal({
    reward: 'add',
    pkBetterW: '2',
    pkTotalW: '1',
    addRows: addRows({ m1: 1 }),
    pushRule: 'none',
    baoMode: 'none'
  }),
  { A: -1, B: 1, C: 1, D: 0 }
);
assert(
  'CASE A 头总 ADD 蓝赢：rawCmp=+3 reward=2 → +5，优势扩大',
  dbg(caseA).winningTeam === 'A' &&
    dbg(caseA).baseTeamScore === 3 &&
    dbg(caseA).rewardedTeamScore === 5 &&
    mirrored(caseA, 5) &&
    advantageGrew(caseA) &&
    sum4(caseA) === 0,
  JSON.stringify(dbg(caseA))
);

var caseB = settle(
  headTotal({
    reward: 'add',
    pkBetterW: '2',
    pkTotalW: '1',
    addRows: addRows({ m1: 1 }),
    pushRule: 'none',
    baoMode: 'none'
  }),
  { A: 1, B: -1, C: 0, D: 1 }
);
assert(
  'CASE B 头总 ADD 红赢：rawCmp=-3 reward=2 → -5，不是 -3+2=-1',
  dbg(caseB).winningTeam === 'B' &&
    dbg(caseB).baseTeamScore === -3 &&
    dbg(caseB).rewardedTeamScore === -5 &&
    dbg(caseB).rewardedTeamScore !== -1 &&
    mirrored(caseB, -5) &&
    advantageGrew(caseB) &&
    sum4(caseB) === 0,
  JSON.stringify(dbg(caseB))
);

var caseC = settle(
  headTotal({
    reward: 'mul',
    pkBetterW: '2',
    pkTotalW: '1',
    mulRows: mulRows({ m1: 2 }),
    pushRule: 'none',
    baoMode: 'none'
  }),
  { A: 1, B: -1, C: 0, D: 1 }
);
assert(
  'CASE C 头总 MUL 红赢：rawCmp=-3 ×2 → -6',
  dbg(caseC).winningTeam === 'B' &&
    dbg(caseC).baseTeamScore === -3 &&
    Number(dbg(caseC).multiplier) === 2 &&
    dbg(caseC).rewardedTeamScore === -6 &&
    mirrored(caseC, -6) &&
    advantageGrew(caseC) &&
    sum4(caseC) === 0,
  JSON.stringify(dbg(caseC))
);

var caseD = settle(
  headTail({ reward: 'add', addRows: addRows({ m1: 1 }), pushRule: 'none', baoMode: 'none' }),
  { A: 1, B: -1, C: 0, D: 2 }
);
assert(
  'CASE D 头尾 红头奖励：rawCmp=-2 红奖1 → -3',
  dbg(caseD).baseTeamScore === -2 &&
    dbg(caseD).addRewardA === 0 &&
    dbg(caseD).addRewardB === 1 &&
    dbg(caseD).addByPlayer.B === 1 &&
    dbg(caseD).rewardedTeamScore === -3 &&
    mirrored(caseD, -3) &&
    advantageGrew(caseD) &&
    sum4(caseD) === 0,
  JSON.stringify(dbg(caseD))
);

var caseE = settle(
  headTail({
    reward: 'add',
    addRows: addRows({ m1: 1, m2: 3 }),
    pushRule: 'none',
    baoMode: 'none'
  }),
  { A: -1, B: -2, C: 0, D: 2 }
);
assert(
  'CASE E 头尾双方奖励：rawCmp=-2 蓝1红3 → -4',
  dbg(caseE).baseTeamScore === -2 &&
    dbg(caseE).addRewardA === 1 &&
    dbg(caseE).addRewardB === 3 &&
    dbg(caseE).rewardedTeamScore === -4 &&
    mirrored(caseE, -4) &&
    advantageGrew(caseE) &&
    sum4(caseE) === 0,
  JSON.stringify(dbg(caseE))
);

var caseF = settle(
  headTail({
    reward: 'add',
    pkBetterW: '2',
    pkWorseW: '1',
    addRows: addRows({ m1: 1 }),
    pushRule: 'none',
    baoMode: 'none'
  }),
  { A: 1, B: -1, C: -1, D: 2 }
);
assert(
  'CASE F 头2尾1 红头×2 红尾×1：扩大红队优势',
  dbg(caseF).baseTeamScore === -3 &&
    dbg(caseF).addByPlayer.B === 2 &&
    dbg(caseF).addByPlayer.C === 1 &&
    dbg(caseF).addRewardB === 3 &&
    dbg(caseF).rewardedTeamScore === -6 &&
    mirrored(caseF, -6) &&
    advantageGrew(caseF) &&
    sum4(caseF) === 0,
  JSON.stringify(dbg(caseF))
);

var threeAdd = settle(
  Object.assign(ruleDefaults.applyLasuoThreePointDefaults({}), {
    reward: 'add',
    addPre: 'win',
    addRows: addRows(),
    pushRule: 'none',
    baoMode: 'none'
  }),
  { A: -1, B: 1, C: 1, D: 0 }
);
assert(
  '不污染拉丝三点：仍走队奖励净差且零和',
  catalog.isLasuoThreePoint(ruleDefaults.applyLasuoThreePointDefaults({})) === true &&
    dbg(threeAdd).addByPlayer == null &&
    dbg(threeAdd).rewardedTeamScore ===
      dbg(threeAdd).baseTeamScore + dbg(threeAdd).addRewardA - dbg(threeAdd).addRewardB &&
    sum4(threeAdd) === 0,
  JSON.stringify(dbg(threeAdd))
);

function sumLedger(ledger) {
  var ids = ['A', 'B', 'C', 'D'];
  var s = 0;
  ids.forEach(function (id) {
    s += Number(ledger && ledger[id]) || 0;
  });
  return core.round1(s);
}

function settleHoles(rule, scores) {
  return settleLasuo4.settle(gameOf(rule), {
    scores: scores,
    holeOrder: ['A1', 'A2'],
    pars: { A1: 4, A2: 4 }
  });
}

function ledgerHole(out, label) {
  return out.byHole[label];
}

assert(
  '生产码不再把 addByPlayer 二次写入 ledger',
  require('fs')
    .readFileSync(
      require('path').join(__dirname, '../miniprogram/subpackages/game/utils/settleLasuo4.js'),
      'utf8'
    )
    .indexOf('addPts(ledger, id, core.round1(adds.personal') < 0
);

var full1 = settle(
  headTail({ reward: 'add', addRows: addRows({ m1: 1 }), pushRule: 'none', baoMode: 'none' }),
  { A: -1, B: 0, C: 2, D: 1 }
);
assert(
  '完整 CASE1 头尾 ADD 无肉无包：A/D +3 B/C -3 sum=0',
  dbg(full1).baseTeamScore === 2 &&
    dbg(full1).addRewardA === 1 &&
    dbg(full1).rewardedTeamScore === 3 &&
    pts(full1).A === 3 &&
    pts(full1).D === 3 &&
    pts(full1).B === -3 &&
    pts(full1).C === -3 &&
    sumLedger(ledgerHole(full1, 'A1')) === 0 &&
    sum4(full1) === 0,
  JSON.stringify({ debug: dbg(full1), ledger: ledgerHole(full1, 'A1') })
);

var full2 = settleHoles(
  headTail({
    reward: 'add',
    addRows: addRows({ m1: 1 }),
    pushRule: 'push',
    baoMode: 'none',
    meatValueType: 'double',
    meatInclude: 'no'
  }),
  {
    A1: { A: 0, B: 0, C: 0, D: 0 },
    A2: { A: -1, B: 0, C: 2, D: 1 }
  }
);
var d2 = full2.holeDebug.A2;
assert(
  '完整 CASE2 头尾 ADD+吃肉：base+reward+meat 后 sum=0',
  d2.baseTeamScore === 2 &&
    d2.addRewardA === 1 &&
    d2.rewardedTeamScore === 3 &&
    d2.meatScore === 2 &&
    ledgerHole(full2, 'A2').A === 5 &&
    ledgerHole(full2, 'A2').D === 5 &&
    ledgerHole(full2, 'A2').B === -5 &&
    ledgerHole(full2, 'A2').C === -5 &&
    sumLedger(ledgerHole(full2, 'A1')) === 0 &&
    sumLedger(ledgerHole(full2, 'A2')) === 0,
  JSON.stringify({ A1: ledgerHole(full2, 'A1'), A2: ledgerHole(full2, 'A2'), debug: d2 })
);

var full3 = settle(
  headTail({
    reward: 'add',
    addRows: addRows({ m1: 1 }),
    pushRule: 'none',
    baoMode: 'plus-n',
    baoPlusN: '1',
    baoPre: 'ignore'
  }),
  { A: -1, B: 0, C: 2, D: 1 }
);
assert(
  '完整 CASE3 头尾 ADD+一人包洞：负队内重分配，sum=0',
  dbg(full3).rewardedTeamScore === 3 &&
    ledgerHole(full3, 'A1').A === 3 &&
    ledgerHole(full3, 'A1').D === 3 &&
    ledgerHole(full3, 'A1').B === -1 &&
    ledgerHole(full3, 'A1').C === -5 &&
    sumLedger(ledgerHole(full3, 'A1')) === 0,
  JSON.stringify({ debug: dbg(full3), ledger: ledgerHole(full3, 'A1') })
);

var full4 = settleHoles(
  headTail({
    reward: 'add',
    addRows: addRows({ m1: 1 }),
    pushRule: 'push',
    baoMode: 'plus-n',
    baoPlusN: '1',
    baoPre: 'ignore',
    meatValueType: 'double',
    meatInclude: 'no'
  }),
  {
    A1: { A: 0, B: 0, C: 0, D: 0 },
    A2: { A: -1, B: 0, C: 2, D: 1 }
  }
);
var d4 = full4.holeDebug.A2;
var L4 = ledgerHole(full4, 'A2');
assert(
  '完整 CASE4 头尾 ADD+肉+包：各分量后仍零和',
  d4.baseTeamScore === 2 &&
    d4.addRewardA === 1 &&
    d4.addRewardB === 0 &&
    d4.rewardedTeamScore === 3 &&
    d4.meatScore === 2 &&
    L4.A === 5 &&
    L4.D === 5 &&
    L4.B === -3 &&
    L4.C === -7 &&
    sumLedger(ledgerHole(full4, 'A1')) === 0 &&
    sumLedger(L4) === 0,
  JSON.stringify({
    base: d4.baseTeamScore,
    teamRewardA: d4.addRewardA,
    teamRewardB: d4.addRewardB,
    normalTeamDiff: d4.rewardedTeamScore,
    meatValue: d4.meatScore,
    bao: 'C covers base -2',
    finalLedger: L4
  })
);

var full5 = settleHoles(
  headTail({
    reward: 'add',
    pkBetterW: '2',
    pkWorseW: '1',
    addRows: addRows({ m1: 1 }),
    pushRule: 'push',
    baoMode: 'none',
    meatValueType: 'double',
    meatInclude: 'no'
  }),
  {
    A1: { A: 0, B: 0, C: 0, D: 0 },
    A2: { A: -1, B: 1, C: 2, D: 0 }
  }
);
var d5 = full5.holeDebug.A2;
assert(
  '完整 CASE5 头2尾1 ADD+肉：权重只进 base/reward，sum=0',
  d5.indicatorWeights.better === 2 &&
    d5.indicatorWeights.worse === 1 &&
    d5.baseTeamScore === 3 &&
    d5.addRewardA === 2 &&
    d5.rewardedTeamScore === 5 &&
    d5.meatScore === 3 &&
    ledgerHole(full5, 'A2').A === 8 &&
    ledgerHole(full5, 'A2').D === 8 &&
    ledgerHole(full5, 'A2').B === -8 &&
    ledgerHole(full5, 'A2').C === -8 &&
    sumLedger(ledgerHole(full5, 'A2')) === 0,
  JSON.stringify({ debug: d5, ledger: ledgerHole(full5, 'A2') })
);

var full6 = settleHoles(
  headTotal({
    reward: 'add',
    pkBetterW: '2',
    pkTotalW: '1',
    addRows: addRows({ m1: 1 }),
    pushRule: 'push',
    baoMode: 'none',
    meatValueType: 'double',
    meatInclude: 'no'
  }),
  {
    A1: { A: 0, B: 0, C: 0, D: 0 },
    A2: { A: 1, B: -1, C: 0, D: 1 }
  }
);
var d6 = full6.holeDebug.A2;
assert(
  '完整 CASE6 头总 ADD 红赢+肉：final=-5 再镜像吃肉，sum=0',
  d6.winningTeam === 'B' &&
    d6.baseTeamScore === -3 &&
    d6.rewardedTeamScore === -5 &&
    d6.meatScore === 3 &&
    ledgerHole(full6, 'A2').A === -8 &&
    ledgerHole(full6, 'A2').D === -8 &&
    ledgerHole(full6, 'A2').B === 8 &&
    ledgerHole(full6, 'A2').C === 8 &&
    sumLedger(ledgerHole(full6, 'A2')) === 0,
  JSON.stringify({ debug: d6, ledger: ledgerHole(full6, 'A2') })
);

var full7 = settleHoles(
  headTotal({
    reward: 'mul',
    pkBetterW: '2',
    pkTotalW: '1',
    mulRows: mulRows({ m1: 2 }),
    pushRule: 'push',
    baoMode: 'none',
    meatValueType: 'double',
    meatInclude: 'no'
  }),
  {
    A1: { A: 0, B: 0, C: 0, D: 0 },
    A2: { A: 1, B: -1, C: 0, D: 1 }
  }
);
var d7 = full7.holeDebug.A2;
assert(
  '完整 CASE7 头总 MUL 红赢 M=2 +肉：-6 后再镜像肉，sum=0',
  d7.baseTeamScore === -3 &&
    Number(d7.multiplier) === 2 &&
    d7.rewardedTeamScore === -6 &&
    d7.meatScore === 3 &&
    ledgerHole(full7, 'A2').A === -9 &&
    ledgerHole(full7, 'A2').B === 9 &&
    sumLedger(ledgerHole(full7, 'A2')) === 0,
  JSON.stringify({ debug: d7, ledger: ledgerHole(full7, 'A2') })
);

var full8 = settle(
  headTail({
    reward: 'add',
    addRows: addRows({ m1: 1 }),
    pushRule: 'none',
    baoMode: 'plus-n',
    baoPlusN: '1',
    baoPre: 'ignore'
  }),
  { A: -1, B: 2, C: 2, D: 1 }
);
assert(
  '完整 CASE8 负队两人都触发包洞：恢复平分，sum=0',
  dbg(full8).rewardedTeamScore === 3 &&
    ledgerHole(full8, 'A1').A === 3 &&
    ledgerHole(full8, 'A1').D === 3 &&
    ledgerHole(full8, 'A1').B === -3 &&
    ledgerHole(full8, 'A1').C === -3 &&
    sumLedger(ledgerHole(full8, 'A1')) === 0,
  JSON.stringify({ debug: dbg(full8), ledger: ledgerHole(full8, 'A1') })
);

console.log('lasuoTeamRewardZeroSum.selftest passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
