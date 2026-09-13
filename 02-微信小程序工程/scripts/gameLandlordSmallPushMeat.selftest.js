/**
 * 斗小地主：PUSH = 入肉池；每次 WIN 最多吃 1 块；余肉留池。
 * 运行：node scripts/gameLandlordSmallPushMeat.selftest.js
 */
var fs = require('fs');
var path = require('path');
var settleSmall = require('../miniprogram/subpackages/game/utils/settleLandlordSmall.js');
var shared = require('../miniprogram/subpackages/game/utils/settleLandlordShared.js');

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

function players3() {
  return [
    { id: 'B', hcapPar3: 0, hcapPar4: 0, hcapPar5: 0 },
    { id: 'C', hcapPar3: 0, hcapPar4: 0, hcapPar5: 0 },
    { id: 'A', hcapPar3: 0, hcapPar4: 0, hcapPar5: 0 }
  ];
}

function gameOf(opts) {
  var rule = Object.assign(
    {
      reward: 'none',
      pushRule: 'push',
      meatInclude: 'no',
      baoMode: 'none'
    },
    opts && opts.rule ? opts.rule : {}
  );
  if (opts && opts.omitPushRule) delete rule.pushRule;
  return {
    catalogId: 'landlord-small',
    name: '斗小地主',
    players: (opts && opts.players) || players3(),
    playerOrder: (opts && opts.order) || ['B', 'C', 'A'],
    groupMode: (opts && opts.groupMode) || 'fixed',
    rankId: (opts && opts.rankId) || 'gross-origin',
    multiplier: opts && opts.K != null ? opts.K : 1,
    ruleSnapshot: rule
  };
}

function ctxOf(scores, holeOrder) {
  var order = holeOrder || Object.keys(scores);
  var pars = {};
  order.forEach(function (h) {
    pars[h] = 4;
  });
  return { holeOrder: order, scores: scores, pars: pars };
}

function settleDebug(game, ctx) {
  return shared.settleThree(game, ctx, {
    catalogId: 'landlord-small',
    settleVersion: settleSmall.LANDLORD_SMALL_SETTLE_VERSION,
    returnMeatPool: true,
    collectDebug: true,
    soloIndex: 2,
    keepOrderOnPush: false,
    allowSplitHigh: false,
    autoMeatCount: 1,
    teamNet: function (rec, solo, mates) {
      return rec[shared.pickTeamWorst(mates, rec)].net;
    },
    winRel: function (rec, soloWins, solo, mates) {
      if (soloWins) return rec[solo].rel;
      return rec[shared.pickTeamWorst(mates, rec)].rel;
    },
    applyBao: shared.applyBao
  });
}

function dbg(r, label) {
  return (r.holeDebug && r.holeDebug[label]) || {};
}

function meatAfter(d) {
  var before = Number(d.meatBefore) || 0;
  if (d.winner === 'tie') return before + 1;
  return before - (Number(d.meatTaken) || 0);
}

var srcSmall = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/utils/settleLandlordSmall.js'),
  'utf8'
);
var srcShared = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/utils/settleLandlordShared.js'),
  'utf8'
);
assert('autoMeatCount 仍为 1', /autoMeatCount:\s*1/.test(srcSmall));
assert(
  'WIN 吃肉走 autoMeat 而非一次清空池',
  /autoMeat != null \? autoMeat : meatWanted/.test(srcShared) &&
    /meatPool -= eat/.test(srcShared) &&
    !/autoMeatCount:\s*meatPool/.test(srcSmall)
);

var scores4 = {
  H1: { A: 0, B: -1, C: 0 },
  H2: { A: 1, B: 0, C: 1 },
  H3: { A: -1, B: 0, C: 0 },
  H4: { A: 1, B: -1, C: 0 }
};
var r4 = settleDebug(gameOf({}), ctxOf(scores4, ['H1', 'H2', 'H3', 'H4']));
var d1 = dbg(r4, 'H1');
var d2 = dbg(r4, 'H2');
var d3 = dbg(r4, 'H3');
var d4 = dbg(r4, 'H4');
assert('CASE1 H1 PUSH meat 0→1', d1.winner === 'tie' && d1.meatBefore === 0 && meatAfter(d1) === 1 && d1.meatTaken === 0);
assert('CASE1 H2 PUSH meat 1→2', d2.winner === 'tie' && d2.meatBefore === 1 && meatAfter(d2) === 2 && d2.meatTaken === 0);
assert('CASE1 H3 WIN meatTaken=1 pool=1', d3.winner === 'A' && d3.meatTaken === 1 && meatAfter(d3) === 1);
assert('CASE1 第一次 WIN 未一次吃光两块', d3.meatTaken === 1 && meatAfter(d3) === 1 && d3.meatBefore === 2);
assert('CASE1 H4 WIN meatTaken=1 pool=0', d4.winner === 'BC' && d4.meatTaken === 1 && meatAfter(d4) === 0 && r4.meatPool === 0);

var scores3 = {
  H1: { A: 0, B: -1, C: 0 },
  H2: { A: -1, B: 0, C: 0 },
  H3: { A: -1, B: 0, C: 0 }
};
var r3 = settleDebug(gameOf({}), ctxOf(scores3, ['H1', 'H2', 'H3']));
assert(
  'CASE2 H1 PUSH 0→1',
  dbg(r3, 'H1').winner === 'tie' && dbg(r3, 'H1').meatBefore === 0 && meatAfter(dbg(r3, 'H1')) === 1
);
assert(
  'CASE2 H2 WIN meatTaken=1 pool=0',
  dbg(r3, 'H2').winner === 'A' && dbg(r3, 'H2').meatTaken === 1 && meatAfter(dbg(r3, 'H2')) === 0
);
assert(
  'CASE2 H3 WIN 不继承已吃 PUSH',
  dbg(r3, 'H3').winner === 'A' && dbg(r3, 'H3').meatTaken === 0 && meatAfter(dbg(r3, 'H3')) === 0 && r3.meatPool === 0
);

var tieScores = { H1: { A: 0, B: -1, C: 0 } };
var rPush = settleDebug(gameOf({ rule: { pushRule: 'push' } }), ctxOf(tieScores, ['H1']));
assert('pushRule=push tie 入池', rPush.meatPool === 1 && dbg(rPush, 'H1').winner === 'tie');

var rMissing = settleDebug(gameOf({ omitPushRule: true }), ctxOf(tieScores, ['H1']));
assert('缺 pushRule 仍顶洞入池', rMissing.meatPool === 1 && dbg(rMissing, 'H1').winner === 'tie');

var rNone = settleDebug(gameOf({ rule: { pushRule: 'none' } }), ctxOf(tieScores, ['H1']));
assert('pushRule=none tie 不入池', rNone.meatPool === 0 && dbg(rNone, 'H1').winner === 'tie' && dbg(rNone, 'H1').meatTaken === 0);

var rDyn = settleDebug(
  gameOf({
    groupMode: 'random',
    players: [
      { id: 'B', hcapPar3: 0, hcapPar4: 0, hcapPar5: 0 },
      { id: 'C', hcapPar3: 0, hcapPar4: 0, hcapPar5: 0 },
      { id: 'A', hcapPar3: 0, hcapPar4: -0.5, hcapPar5: 0 }
    ],
    rule: { pushRule: 'push', reorderOnPush: 'yes' }
  }),
  ctxOf(
    {
      H1: { A: -0.5, B: -1, C: 0 },
      H2: { A: 0, B: 0, C: -1 }
    },
    ['H1', 'H2']
  )
);
var dyn1 = dbg(rDyn, 'H1');
var dyn2 = dbg(rDyn, 'H2');
assert('dynamic PUSH 后发生重排', dyn1.winner === 'tie' && JSON.stringify(dyn1.orderAfter) !== JSON.stringify(dyn1.orderBefore));
assert(
  'dynamic 肉仍公共池：新 rank3 可吃旧 PUSH',
  dyn1.roles.A === 'A' &&
    dyn2.roles.A !== 'A' &&
    dyn2.meatTaken === 1 &&
    meatAfter(dyn2) === 0 &&
    rDyn.meatPool === 0
);

var mulRows = [
  { id: 'hio', value: 10 },
  { id: 'm2', value: 5 },
  { id: 'm1', value: 2 },
  { id: 'par', value: 1 },
  { id: 'p1', value: 1 },
  { id: 'ge2', value: 1 }
];
var winAfterPush = ctxOf(
  {
    H1: { A: 0, B: -1, C: 0 },
    H2: { A: -1, B: 0, C: 0 }
  },
  ['H1', 'H2']
);
var rNonePay = settleDebug(gameOf({}), winAfterPush);
var rMul = settleDebug(
  gameOf({
    rule: {
      reward: 'mul',
      mulRows: mulRows,
      meatInclude: 'yes',
      pushRule: 'push'
    }
  }),
  winAfterPush
);
assert(
  'reward=mul 不改变 meat 数量',
  dbg(rMul, 'H1').meatBefore === 0 &&
    meatAfter(dbg(rMul, 'H1')) === 1 &&
    dbg(rMul, 'H2').meatTaken === 1 &&
    rMul.meatPool === 0 &&
    dbg(rNonePay, 'H2').meatTaken === 1 &&
    rNonePay.meatPool === 0
);
assert(
  'reward 只允许改肉 payout',
  dbg(rMul, 'H2').meatScores.A !== dbg(rNonePay, 'H2').meatScores.A
);

var rBao = settleDebug(
  gameOf({
    rule: { baoMode: 'plus-n', baoPlusN: 1, baoPre: 'ignore', pushRule: 'push' }
  }),
  ctxOf(
    {
      H1: { A: 0, B: -1, C: 0 },
      H2: { A: 0, B: 2, C: 0 }
    },
    ['H1', 'H2']
  )
);
assert(
  'bao 不改变 meatPool/meatTaken',
  dbg(rBao, 'H1').winner === 'tie' &&
    meatAfter(dbg(rBao, 'H1')) === 1 &&
    dbg(rBao, 'H2').meatTaken === 1 &&
    rBao.meatPool === 0 &&
    dbg(rBao, 'H2').packageTriggers[0] === true
);

if (failed) {
  console.log('\nFAILED ' + failed + ' / ' + (passed + failed));
  process.exit(1);
}
console.log('\nOK ' + passed + ' / ' + (passed + failed));
