/**
 * V53 §4.3.1 四人拉丝奖励结算。
 * 运行：node scripts/gameLasuo4RewardSettle.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
global.wx.getStorageSync = global.wx.getStorageSync || function () { return null; };
global.wx.setStorageSync = global.wx.setStorageSync || function () {};
global.wx.showToast = function () {};

var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var settleLasuo4 = require('../miniprogram/subpackages/game/utils/settleLasuo4.js');
var settingsMod = require('../miniprogram/subpackages/game/utils/localSideGameSettings.js');
var fs = require('fs');
var path = require('path');

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

function memStorage() {
  var bag = {};
  return {
    getItem: function (key) {
      return bag[key];
    },
    setItem: function (key, value) {
      bag[key] = JSON.parse(JSON.stringify(value));
      return true;
    }
  };
}

function bands(m1, m2, hio) {
  return [
    { id: 'hio', value: String(hio == null ? 10 : hio) },
    { id: 'm2', value: String(m2 == null ? 4 : m2) },
    { id: 'm1', value: String(m1) },
    { id: 'par', value: '0' },
    { id: 'p1', value: '0' },
    { id: 'ge2', value: '0' }
  ];
}

function mulBands(m1, m2, hio) {
  return [
    { id: 'hio', value: String(hio == null ? 10 : hio) },
    { id: 'm2', value: String(m2 == null ? 5 : m2) },
    { id: 'm1', value: String(m1) },
    { id: 'par', value: '1' },
    { id: 'p1', value: '1' },
    { id: 'ge2', value: '1' }
  ];
}

function combos(a, b, c) {
  return [
    { id: 'm2-m2', value: String(a) },
    { id: 'm2-m1', value: String(b) },
    { id: 'm1-m1', value: String(c) }
  ];
}

function baseRule(extra) {
  return Object.assign(
    {
      pkBetter: true,
      pkWorse: true,
      pkTotal: true,
      pkBetterW: '1',
      pkWorseW: '1',
      pkTotalW: '1',
      pkTotalMode: 'sum',
      reward: 'none',
      addPre: 'win',
      addRows: bands(1, 3, 10),
      mulRows: mulBands(2, 5, 10),
      comboMulRows: combos(25, 10, 4),
      pushRule: 'none',
      baoMode: 'none',
      meatValueType: 'double'
    },
    extra || {}
  );
}

function gameOf(rels, extra) {
  extra = extra || {};
  var ids = extra.order || ['A', 'D', 'B', 'C'];
  var hole = extra.hole || 'A1';
  return {
    catalogId: 'lasuo-4',
    groupMode: extra.groupMode || 'fixed',
    playerOrder: ids,
    players: ['A', 'B', 'C', 'D'].map(function (id) {
      return { id: id };
    }),
    multiplier: extra.k == null ? 1 : extra.k,
    holes: extra.holes || [{ label: hole, on: true }],
    ruleSnapshot: baseRule(extra.rule)
  };
}

function ctxOf(rels, extra) {
  extra = extra || {};
  var hole = extra.hole || 'A1';
  var scores = extra.scores || {};
  if (!extra.scores) scores[hole] = rels;
  var pars = extra.pars || {};
  if (!extra.pars) pars[hole] = 4;
  return {
    scores: scores,
    holeOrder: extra.holeOrder || [hole],
    pars: pars
  };
}

function v53Rels() {
  return { A: -1, B: 0, C: 2, D: 0 };
}

function ledger(out, hole) {
  return out.byHole && out.byHole[hole || 'A1'];
}

function zeroSum(row) {
  var s = 0;
  Object.keys(row || {}).forEach(function (k) {
    if (k === '__pot__') return;
    s += Number(row[k]) || 0;
  });
  return Math.abs(s) < 0.05;
}

identity.setImplementation({
  implementation: 'test',
  getCurrentUserId: function () {
    return 'tester';
  }
});
var repo = localMod.createLocalSideGameRepository({
  storage: memStorage(),
  settingsApi: settingsMod.createLocalSideGameSettings({ storage: memStorage() }),
  idGen: function () {
    return 'g_lasuo_r1';
  }
});
facade.setImplementation(repo);

var v53 = settleLasuo4.settle(
  gameOf(v53Rels(), { rule: { reward: 'add', addPre: 'win', addRows: bands(1, 3, 10) } }),
  ctxOf(v53Rels())
);
var v53Hole = ledger(v53);
assert(
  '1 V53加法权威实例 3+1=4',
  v53Hole.A === 4 && v53Hole.D === 4 && v53Hole.B === -4 && v53Hole.C === -4,
  JSON.stringify(v53Hole)
);
assert('2 加法是额外分不是替换', v53.holeDebug.A1.baseTeamScore === 3 && v53.holeDebug.A1.addRewardA === 1);
assert('21 零和', zeroSum(v53Hole));

var noReward = settleLasuo4.settle(gameOf(v53Rels(), { rule: { reward: 'none' } }), ctxOf(v53Rels()));
assert('无奖励保持基础 ±3', ledger(noReward).A === 3 && ledger(noReward).B === -3);

var bothBirdie = { A: -1, B: -1, C: 0, D: 0 };
var ignoreBoth = settleLasuo4.settle(
  gameOf(bothBirdie, { rule: { reward: 'add', addPre: 'ignore', addRows: bands(1, 3, 10) } }),
  ctxOf(bothBirdie)
);
assert(
  '3 双方触发净奖励零和',
  zeroSum(ledger(ignoreBoth)) &&
    ignoreBoth.holeDebug.A1.addRewardA === 1 &&
    ignoreBoth.holeDebug.A1.addRewardB === 1
);

var loseTotal = { A: -1, B: -3, C: -3, D: 2 };
var winPre = settleLasuo4.settle(
  gameOf(loseTotal, { rule: { reward: 'add', addPre: 'win', addRows: bands(1, 3, 10) } }),
  ctxOf(loseTotal)
);
assert('4 addPre=win 负总成绩队小鸟不奖', winPre.holeDebug.A1.addRewardA === 0);

var tieTotal = { A: -1, B: 0, C: 0, D: 1 };
var notLose = settleLasuo4.settle(
  gameOf(tieTotal, { rule: { reward: 'add', addPre: 'not-lose', addRows: bands(1, 3, 10) } }),
  ctxOf(tieTotal)
);
assert('5 addPre=not-lose 平局可奖', notLose.holeDebug.A1.addRewardA === 1);

var ignoreA = settleLasuo4.settle(
  gameOf(loseTotal, { rule: { reward: 'add', addPre: 'ignore', addRows: bands(1, 3, 10) } }),
  ctxOf(loseTotal)
);
assert('6 addPre=ignore 与总成绩无关仍奖', ignoreA.holeDebug.A1.addRewardA === 1);

var zeroAdd = settleLasuo4.settle(
  gameOf(v53Rels(), { rule: { reward: 'add', addPre: 'win', addRows: bands(0, 3, 10) } }),
  ctxOf(v53Rels())
);
assert('7 加法值0不产生额外分', ledger(zeroAdd).A === 3 && zeroAdd.holeDebug.A1.addRewardA === 0);

var weighted = settleLasuo4.settle(
  gameOf(v53Rels(), {
    rule: {
      reward: 'none',
      pkBetterW: '2',
      pkWorseW: '3',
      pkTotalW: '4'
    }
  }),
  ctxOf(v53Rels())
);
assert('8 三指标不同权重基础 2+3+4=9', weighted.holeDebug.A1.baseTeamScore === 9 && ledger(weighted).A === 9);

var mulOnce = settleLasuo4.settle(
  gameOf(v53Rels(), { rule: { reward: 'mul', mulRows: mulBands(2, 5, 10), comboMulRows: [] } }),
  ctxOf(v53Rels())
);
assert(
  '9 乘法汇总后只乘一次 3×2=6',
  ledger(mulOnce).A === 6 && ledger(mulOnce).B === -6 && mulOnce.holeDebug.A1.multiplier === 2
);

var loseEagle = { A: 0, B: -2, C: 5, D: 1 };
var mulWinOnly = settleLasuo4.settle(
  gameOf(loseEagle, { rule: { reward: 'mul', mulRows: mulBands(2, 5, 10), comboMulRows: [] } }),
  ctxOf(loseEagle)
);
assert(
  '10 乘法只由胜队触发，负队老鹰无效',
  mulWinOnly.holeDebug.A1.baseTeamScore > 0 &&
    mulWinOnly.holeDebug.A1.multiplier === 1 &&
    ledger(mulWinOnly).A === mulWinOnly.holeDebug.A1.baseTeamScore
);

var tieMul = settleLasuo4.settle(
  gameOf({ A: 0, B: 0, C: 0, D: 0 }, { rule: { reward: 'mul', mulRows: mulBands(2, 5, 10) } }),
  ctxOf({ A: 0, B: 0, C: 0, D: 0 })
);
assert('11 平局不触发乘法', tieMul.holeDebug.A1.multiplier === 1 && ledger(tieMul).A === 0);

assert('12 个人倍率小鸟×2', mulOnce.holeDebug.A1.multiplierSource === 'personal-product');

var ee = settleLasuo4.settle(
  gameOf({ A: -2, B: 0, C: 2, D: -2 }, { rule: { reward: 'mul', comboMulRows: combos(25, 10, 4), mulRows: mulBands(2, 5, 10) } }),
  ctxOf({ A: -2, B: 0, C: 2, D: -2 })
);
assert('13a 组合 m2-m2', ee.holeDebug.A1.multiplierSource === 'm2-m2' && ee.holeDebug.A1.multiplier === 25);

var eb = settleLasuo4.settle(
  gameOf({ A: -2, B: 0, C: 2, D: -1 }, { rule: { reward: 'mul', comboMulRows: combos(25, 10, 4), mulRows: mulBands(2, 5, 10) } }),
  ctxOf({ A: -2, B: 0, C: 2, D: -1 })
);
assert('13b 组合 m2-m1', eb.holeDebug.A1.multiplierSource === 'm2-m1' && eb.holeDebug.A1.multiplier === 10);

var bb = settleLasuo4.settle(
  gameOf({ A: -1, B: 0, C: 2, D: -1 }, { rule: { reward: 'mul', comboMulRows: combos(25, 10, 4), mulRows: mulBands(2, 5, 10) } }),
  ctxOf({ A: -1, B: 0, C: 2, D: -1 })
);
assert(
  '13c/14 组合 m1-m1 不与个人叠乘',
  bb.holeDebug.A1.multiplierSource === 'm1-m1' && bb.holeDebug.A1.multiplier === 4
);

var parBogey = settleLasuo4.settle(
  gameOf({ A: 0, B: 1, C: 2, D: 1 }, { rule: { reward: 'mul', mulRows: mulBands(2, 5, 10), comboMulRows: [] } }),
  ctxOf({ A: 0, B: 1, C: 2, D: 1 })
);
assert('胜队 PAR+柏忌 默认×1', parBogey.holeDebug.A1.multiplier === 1);

var wMul = settleLasuo4.settle(
  gameOf(v53Rels(), {
    rule: {
      reward: 'mul',
      pkBetterW: '2',
      pkWorseW: '3',
      pkTotalW: '4',
      mulRows: mulBands(2, 5, 10),
      comboMulRows: []
    }
  }),
  ctxOf(v53Rels())
);
assert('带权重 9×2=18', wMul.holeDebug.A1.baseTeamScore === 9 && ledger(wMul).A === 18 && ledger(wMul).B === -18);

var mixRels = { A: -1, B: 1, C: 2, D: 3 };
var mix = settleLasuo4.settle(
  gameOf(mixRels, {
    rule: {
      reward: 'mul',
      pkBetterW: '2',
      pkWorseW: '3',
      pkTotalW: '4',
      mulRows: mulBands(5, 5, 10),
      comboMulRows: []
    }
  }),
  ctxOf(mixRels)
);
assert(
  '部分输赢倍率作用于净汇总 3×5=15',
  mix.holeDebug.A1.baseTeamScore === 3 && mix.holeDebug.A1.multiplier === 5 && ledger(mix).A === 15 && ledger(mix).B === -15
);

var k2 = settleLasuo4.settle(
  gameOf(v53Rels(), { k: 2, rule: { reward: 'add', addPre: 'win', addRows: bands(1, 3, 10) } }),
  ctxOf(v53Rels())
);
assert('15 K=2 只乘一次 4×2=8', ledger(k2).A === 8 && k2.holeDebug.A1.K === 2 && k2.holeDebug.A1.rewardedTeamScore === 4);

var meatHoles = ['A1', 'A2'];
var meatScores = {
  A1: { A: 0, B: 0, C: 0, D: 0 },
  A2: v53Rels()
};
var meatPars = { A1: 4, A2: 4 };
var meatGameExtra = {
  holes: [
    { label: 'A1', on: true },
    { label: 'A2', on: true }
  ]
};
function meatRule(include) {
  return {
    reward: 'add',
    addPre: 'win',
    addRows: bands(1, 3, 10),
    pushRule: 'tie',
    meatValueType: 'double',
    meatInclude: include,
    meatRows: [
      { id: 'le-2', value: '3' },
      { id: 'm1', value: '2' },
      { id: 'par', value: '1' },
      { id: 'ge-1', value: '0' }
    ]
  };
}
var meatNo = settleLasuo4.settle(
  gameOf(v53Rels(), Object.assign({}, meatGameExtra, { rule: meatRule('no') })),
  ctxOf(v53Rels(), { scores: meatScores, holeOrder: meatHoles, pars: meatPars })
);
var meatYes = settleLasuo4.settle(
  gameOf(v53Rels(), Object.assign({}, meatGameExtra, { rule: meatRule('yes') })),
  ctxOf(v53Rels(), { scores: meatScores, holeOrder: meatHoles, pars: meatPars })
);
assert(
  '16 肉不含奖励用基础绝对值',
  meatNo.holeDebug.A2.meatScore === 3 && ledger(meatNo, 'A2').A === 7
);
assert(
  '17 肉包含奖励用奖励后绝对值',
  meatYes.holeDebug.A2.meatScore === 4 && ledger(meatYes, 'A2').A === 8
);

var bao = settleLasuo4.settle(
  gameOf(
    { A: 0, B: 4, C: 1, D: 0 },
    {
      rule: {
        reward: 'none',
        baoMode: 'plus-n',
        baoPlusN: '4',
        baoPre: 'ignore',
        pushRule: 'none'
      }
    }
  ),
  ctxOf({ A: 0, B: 4, C: 1, D: 0 })
);
assert(
  '18 包洞只重分配正常负分',
  ledger(bao).A === 3 && ledger(bao).D === 3 && ledger(bao).B === -6 && ledger(bao).C === 0,
  JSON.stringify(ledger(bao))
);

var swapCombo = settleLasuo4.settle(
  gameOf({ A: -1, B: 0, C: 2, D: -2 }, { rule: { reward: 'mul', comboMulRows: combos(25, 10, 4), mulRows: mulBands(2, 5, 10) } }),
  ctxOf({ A: -1, B: 0, C: 2, D: -2 })
);
assert('同队顺序不影响组合档', swapCombo.holeDebug.A1.multiplierSource === 'm2-m1' && swapCombo.holeDebug.A1.multiplier === 10);

assert('21b 乘法零和', zeroSum(ledger(mulOnce)));
assert('22 其他拉丝 settleLasuoN 未改奖励版本', !fs.readFileSync(path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils', 'settleLasuoN.js'), 'utf8').includes('SETTLE_LASUO4_VERSION'));

assert('settleVersion v53-4.3.1', v53.settleVersion === 'v53-4.3.1');

var srcWxml = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'pages', 'edit-rule', 'index.wxml'),
  'utf8'
);
assert('UI冻结证明占位（WXML 文件本次测试未作为修改目标）', srcWxml.indexOf('加法奖励') >= 0);

function makeHost(rels) {
  var holeOrder = ['A1'];
  var players = ['A', 'B', 'C', 'D'].map(function (id) {
    return { playerId: id, displayName: id, groupId: 'g1' };
  });
  var parties = players.map(function (p) {
    return {
      partyId: p.playerId,
      partyType: 'player',
      displayName: p.displayName,
      memberPlayerIds: [p.playerId],
      groupId: 'g1'
    };
  });
  var official = {};
  players.forEach(function (p) {
    official[p.playerId] = {
      holes: {
        A1: { score: 4 + Number(rels[p.playerId]) }
      }
    };
  });
  return hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: 'm-lasuo-r',
      groupId: 'g1',
      scope: 'group',
      revision: 'r1',
      holeContextReady: true,
      holeOrder: holeOrder,
      pars: { A1: 4 },
      allowBigPot: true,
      players: players,
      scoreParties: parties,
      officialScoresByPartyId: official
    })
  );
}

var host = makeHost(v53Rels());
hostSession.setHostContext(host);
bind.attachHost(host);
bind.discardSetupDraft();
bind.ensureSetupDraft('score');
var created = bind.addGame('score', {
  catalogId: 'lasuo-4',
  name: '奖励结算',
  players: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
  playerOrder: ['A', 'D', 'B', 'C'],
  groupMode: 'fixed',
  holes: [{ label: 'A1', on: true }],
  holeOrder: ['A1'],
  multiplier: 1,
  ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('lasuo-4'), baseRule({ reward: 'add', addPre: 'win', addRows: bands(1, 3, 10) }))
});
bind.commitSetupDraft('score');
var loaded = bind.getGame('score', created.id);
assert(
  '19 实例快照保留 reward/addRows',
  loaded.ruleSnapshot.reward === 'add' &&
    String(loaded.ruleSnapshot.addRows.filter(function (r) { return r.id === 'm1'; })[0].value) === '1'
);
var board = bind.listBoard('score', created.id);
var cell0 = board.holes && board.holes[0] && board.holes[0].cells;
assert(
  '20 结果页与核心一致 ±4',
  cell0 && cell0[0] && Number(cell0[0].raw) === 4,
  JSON.stringify(cell0)
);
loaded.holeResults = {
  byHole: { A1: { A: 3, D: 3, B: -3, C: -3, __pot__: 0 } },
  catalogId: 'lasuo-4',
  settleVersion: 'legacy'
};
var board2 = bind.listBoard('score', created.id);
var cellReload = board2.holes && board2.holes[0] && board2.holes[0].cells;
assert(
  '旧快照规则完整时受控重算仍为 ±4',
  cellReload && Number(cellReload[0].raw) === 4
);

console.log('SUMMARY passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
