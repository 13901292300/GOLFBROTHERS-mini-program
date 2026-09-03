/**
 * 比洞乘法奖励必须进入正式计分核心（非固定 +1/-1）。
 * 运行：node scripts/gameMatch2Multiplier.selftest.js
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
var settle = require('../miniprogram/subpackages/game/utils/settle.js');
var settleMatch2 = require('../miniprogram/subpackages/game/utils/settleMatch2.js');
var settingsMod = require('../miniprogram/subpackages/game/utils/localSideGameSettings.js');

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

function mulRows(values) {
  var ids = ['hio', 'm2', 'm1', 'par', 'p1', 'ge2'];
  return ids.map(function (id, i) {
    return { id: id, value: String(values[i]) };
  });
}

function ruleMul(values) {
  return {
    catalogId: 'match-2',
    ruleId: 'match-2',
    reward: 'mul',
    mulRows: mulRows(values)
  };
}

function holeResult(playerRel, oppRel, rule, k) {
  return settleMatch2.calculateMatchPlayHoleResult({
    playerScore: playerRel,
    opponentScore: oppRel,
    par: 4,
    ruleConfig: rule,
    pointValue: k == null ? 1 : k
  });
}

var defaultMul = ruleMul([10, 5, 2, 1, 1, 1]);
var eagle5 = holeResult(-2, 0, defaultMul, 1);
assert('1 鹰 ×5 获胜应用 ×5', eagle5.outcome === 'win' && eagle5.scoreType === 'eagle' && eagle5.multiplier === 5 && eagle5.finalValue === 5);

var birdie3 = holeResult(-1, 0, ruleMul([10, 5, 3, 1, 1, 1]), 1);
assert('2 小鸟 ×3 获胜应用 ×3', birdie3.outcome === 'win' && birdie3.scoreType === 'birdie' && birdie3.multiplier === 3 && birdie3.finalValue === 3);

var bands = [
  { rel: -3, type: 'albatross', id: 'hio', mul: 10 },
  { rel: -2, type: 'eagle', id: 'm2', mul: 5 },
  { rel: -1, type: 'birdie', id: 'm1', mul: 2 },
  { rel: 0, type: 'par', id: 'par', mul: 7 },
  { rel: 1, type: 'bogey', id: 'p1', mul: 4 },
  { rel: 2, type: 'doubleBogey', id: 'ge2', mul: 8 }
];
var custom = ruleMul([10, 5, 2, 7, 4, 8]);
bands.forEach(function (b) {
  var opp = b.rel === 2 ? 3 : 2;
  var r = holeResult(b.rel, opp, custom, 1);
  assert(
    '3/11 ' + b.type + ' 读自己的倍率 ' + b.mul,
    r.outcome === 'win' && r.scoreType === b.type && r.multiplier === b.mul && r.finalValue === b.mul
  );
});

var a = holeResult(-2, 0, ruleMul([1, 5, 1, 1, 1, 1]), 1);
var b = holeResult(-2, 0, ruleMul([1, 9, 1, 1, 1, 1]), 1);
assert('4 不同倍率配置产生不同最终值', a.finalValue === 5 && b.finalValue === 9 && a.finalValue !== 1);

var tie = holeResult(-2, -2, defaultMul, 1);
assert('5 平局不因倍率得分', tie.outcome === 'tie' && tie.finalValue === 0 && tie.multiplier === 1);

var lose = holeResult(0, -2, defaultMul, 1);
assert('6 输洞倍率为负向', lose.outcome === 'lose' && lose.scoreType === 'eagle' && lose.multiplier === 5 && lose.finalValue === -5);

var noneRule = { catalogId: 'match-2', reward: 'none', mulRows: mulRows([10, 5, 2, 1, 1, 1]) };
var noneHit = holeResult(-2, 0, noneRule, 1);
assert('7 未开乘法奖励时倍率为 1', noneHit.multiplier === 1 && noneHit.finalValue === 1);

var emptyMul = holeResult(-2, 0, { catalogId: 'match-2', reward: 'mul', mulRows: [] }, 1);
assert('7b 无行时用产品默认鹰 ×5', emptyMul.multiplier === 5 && emptyMul.finalValue === 5);

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
    return 'm2mul_1';
  }
});
facade.setImplementation(repo);

function makeHost() {
  var holeOrder = catalog.HOLES.slice();
  var pars = {};
  holeOrder.forEach(function (h) {
    pars[h] = 4;
  });
  var players = [
    { playerId: 'pA', displayName: '甲', groupId: 'g1' },
    { playerId: 'pB', displayName: '乙', groupId: 'g1' }
  ];
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
  players.forEach(function (p, idx) {
    var holes = {};
    holeOrder.forEach(function (label) {
      holes[label] = { score: idx === 0 ? 2 : 4 };
    });
    official[p.playerId] = { holes: holes };
  });
  return hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: 'm-m2mul',
      groupId: 'g1',
      scope: 'group',
      revision: 'r1',
      holeContextReady: true,
      holeOrder: holeOrder,
      pars: pars,
      allowBigPot: true,
      players: players,
      scoreParties: parties,
      officialScoresByPartyId: official
    })
  );
}

var host = makeHost();
hostSession.clearHostContext();
hostSession.setHostContext(host);
bind.attachHost(host);
bind.discardSetupDraft();
bind.ensureSetupDraft('score');

var savedSnap = rec.mergeRuleSnapshot(rec.buildRuleSnapshot('match-2'), ruleMul([10, 5, 3, 1, 1, 1]));
var created = bind.addGame('score', {
  catalogId: 'match-2',
  name: '比洞',
  players: [{ id: 'pA' }, { id: 'pB' }],
  pairings: [{ id: 'pA|pB', leftId: 'pA', rightId: 'pB', on: true, strokes: 0 }],
  holes: catalog.HOLES.map(function (label) {
    return { label: label, on: true };
  }),
  holeOrder: catalog.HOLES.slice(),
  multiplier: 1,
  ruleSnapshot: savedSnap
});
assert('addGame 成功', created && !created.__fail && created.id);

var serialized = JSON.parse(JSON.stringify(created.ruleSnapshot));
assert(
  '8 序列化后倍率类型仍正确',
  serialized.reward === 'mul' &&
    typeof serialized.mulRows.filter(function (r) {
      return r.id === 'm2';
    })[0].value === 'string' &&
    serialized.mulRows.filter(function (r) {
      return r.id === 'm2';
    })[0].value === '5' &&
    serialized.mulRows.filter(function (r) {
      return r.id === 'm1';
    })[0].value === '3'
);

var committed = bind.commitSetupDraft('score');
assert('commitSetupDraft 成功', committed && committed.ok, committed && committed.reason);
var loaded = bind.getGame('score', created.id);
assert(
  '8 保存/重载后倍率仍在',
  loaded &&
    loaded.ruleSnapshot &&
    loaded.ruleSnapshot.reward === 'mul' &&
    loaded.ruleSnapshot.mulRows &&
    loaded.ruleSnapshot.mulRows.filter(function (r) {
      return r.id === 'm2';
    })[0].value === '5' &&
    loaded.ruleSnapshot.mulRows.filter(function (r) {
      return r.id === 'm1';
    })[0].value === '3'
);

var card = bind.getScorecard('score', loaded);
assert('记分卡相对杆 鹰 vs 标准杆', card.A1.pA === -2 && card.A1.pB === 0);

var ctx = {
  scores: card,
  holeOrder: catalog.HOLES.slice(),
  pars: catalog.defaultHolePars(),
  windOn: false
};
var viaSettle = settle.settleGame(loaded, ctx);
var viaMatch = settleMatch2.settle(loaded, ctx);
var viaCore = settle.calculateMatchPlayHoleResult({
  playerScore: -2,
  opponentScore: 0,
  par: 4,
  ruleConfig: loaded.ruleSnapshot,
  pointValue: 1
});
assert(
  '9 模拟器与正式入口同一结果',
  JSON.stringify(viaSettle.byHole.A1) === JSON.stringify(viaMatch.byHole.A1) &&
    viaSettle.byHole.A1.pA === viaCore.finalValue &&
    viaCore.finalValue === 5
);

var persisted = loaded.holeResults && loaded.holeResults.byHole && loaded.holeResults.byHole.A1;
assert(
  '9b 仓库 refreshResult 与正式计分一致',
  persisted && persisted.pA === 5 && persisted.pB === -5
);

var sumA = 0;
catalog.HOLES.forEach(function (label) {
  sumA += Number(viaSettle.byHole[label].pA) || 0;
});
assert(
  '10 汇总等于各洞 finalValue 累计',
  sumA === 5 * 18 && viaSettle.byHole.A1.pA === 5 && viaSettle.byHole.A1.pB === -5
);

var stripped = rec.buildRuleSnapshot('match-2');
assert(
  '能力快照本身不含倍率，必须 merge',
  stripped.reward == null && !stripped.mulRows
);
assert(
  'merge 后含倍率和能力字段',
  rec.mergeRuleSnapshot(stripped, savedSnap).reward === 'mul' &&
    rec.mergeRuleSnapshot(stripped, savedSnap).requiredPartyCount === 2
);

var mergedSnap = rec.mergeRuleSnapshot(stripped, savedSnap);
var m2row = mergedSnap.mulRows.filter(function (r) { return r.id === 'm2'; })[0];
var m1row = mergedSnap.mulRows.filter(function (r) { return r.id === 'm1'; })[0];
assert('证据 reward===mul', mergedSnap.reward === 'mul');
assert('证据 mulRows.m2===5', m2row && String(m2row.value) === '5');
assert('证据 mulRows.m1===3', m1row && String(m1row.value) === '3');
assert(
  '用户快照含倍率时能力桩字段仍正确',
  mergedSnap.requiredPartyCount === 2 &&
    mergedSnap.requiresIndividualScores === false &&
    Array.isArray(mergedSnap.scoreFields) &&
    mergedSnap.scoreFields.indexOf('holes.score') >= 0
);

var hist = rec.mergeRuleSnapshot(stripped, { catalogId: 'match-2' });
assert(
  '历史实例无 reward/mulRows',
  hist.reward == null && !hist.mulRows && hist.requiredPartyCount === 2
);
var histHit = holeResult(-2, 0, hist, 1);
assert('历史实例无 reward 时核心仍可读（页面层禁止静默×1）', histHit.multiplier === 1 && histHit.finalValue === 1);

var absOnce = settle.scoresToRelative({ A1: { pA: 2, pB: 4 } }, { A1: 4 }, ['A1']);
assert('证据 par4 绝对杆2 → 相对 -2', absOnce.A1.pA === -2 && absOnce.A1.pB === 0);
var absTwice = settle.scoresToRelative(absOnce, { A1: 4 }, ['A1']);
assert('相对杆不会再次减 par', absTwice.A1.pA == null && absTwice.A1.pB == null);
assert('记分卡只转换一次：相对 -2 计鹰 ×5 而非二次转换后的一杆进洞 ×10', viaCore.finalValue === 5 && viaSettle.byHole.A1.pA === 5);

var skipCard = settle.scoresToRelative(
  { A1: { pA: 0, pB: 4 }, A2: { pA: '', pB: 4 }, A3: { pA: 'NS', pB: 4 } },
  { A1: 4, A2: 4, A3: 4 },
  ['A1', 'A2', 'A3']
);
assert('绝对杆 0 不转成一杆进洞/鹰', skipCard.A1.pA == null && skipCard.A1.pB === 0);
assert('空值不转成绩', skipCard.A2.pA == null);
assert('未完赛标识不转成绩', skipCard.A3.pA == null);
var skipGame = {
  catalogId: 'match-2',
  players: [{ id: 'pA' }, { id: 'pB' }],
  pairings: [{ id: 'pA|pB', leftId: 'pA', rightId: 'pB', on: true, strokes: 0 }],
  multiplier: 1,
  ruleSnapshot: defaultMul,
  holes: [
    { label: 'A1', on: true },
    { label: 'A2', on: true },
    { label: 'A3', on: true }
  ]
};
var skipSettle = settle.settleGame(skipGame, {
  scores: skipCard,
  holeOrder: ['A1', 'A2', 'A3'],
  pars: { A1: 4, A2: 4, A3: 4 },
  windOn: false
});
assert(
  '缺杆洞不计鹰/一杆进洞分',
  (!skipSettle.byHole.A1.pA || skipSettle.byHole.A1.pA === 0) &&
    (!skipSettle.byHole.A2.pA || skipSettle.byHole.A2.pA === 0) &&
    (!skipSettle.byHole.A3.pA || skipSettle.byHole.A3.pA === 0)
);

var mixedScores = {
  A1: { pA: -2, pB: 0 },
  A2: { pA: -1, pB: 0 },
  A3: { pA: -2, pB: -2 }
};
var mixedGame = {
  catalogId: 'match-2',
  players: [{ id: 'pA' }, { id: 'pB' }],
  pairings: [{ id: 'pA|pB', leftId: 'pA', rightId: 'pB', on: true, strokes: 0 }],
  multiplier: 1,
  ruleSnapshot: ruleMul([10, 5, 3, 1, 1, 1]),
  holes: [
    { label: 'A1', on: true },
    { label: 'A2', on: true },
    { label: 'A3', on: true }
  ]
};
var mixedCtx = {
  scores: mixedScores,
  holeOrder: ['A1', 'A2', 'A3'],
  pars: { A1: 4, A2: 4, A3: 4 },
  windOn: false
};
var mixedSettle = settle.settleGame(mixedGame, mixedCtx);
var mixedMatch = settleMatch2.settle(mixedGame, mixedCtx);
var mixedEagle = settle.calculateMatchPlayHoleResult({
  playerScore: -2,
  opponentScore: 0,
  par: 4,
  ruleConfig: mixedGame.ruleSnapshot,
  pointValue: 1
});
var mixedBirdie = settle.calculateMatchPlayHoleResult({
  playerScore: -1,
  opponentScore: 0,
  par: 4,
  ruleConfig: mixedGame.ruleSnapshot,
  pointValue: 1
});
var mixedTie = settle.calculateMatchPlayHoleResult({
  playerScore: -2,
  opponentScore: -2,
  par: 4,
  ruleConfig: mixedGame.ruleSnapshot,
  pointValue: 1
});
assert('证据 鹰×5 逐洞', mixedEagle.finalValue === 5 && mixedSettle.byHole.A1.pA === 5 && mixedSettle.byHole.A1.pB === -5);
assert('证据 小鸟×3 逐洞', mixedBirdie.finalValue === 3 && mixedSettle.byHole.A2.pA === 3 && mixedSettle.byHole.A2.pB === -3);
assert('证据 平局×0 逐洞', mixedTie.finalValue === 0 && mixedSettle.byHole.A3.pA === 0 && mixedSettle.byHole.A3.pB === 0);
assert(
  '多洞总分等于 byHole 之和',
  mixedSettle.byHole.A1.pA + mixedSettle.byHole.A2.pA + mixedSettle.byHole.A3.pA === 8
);
assert(
  'settleGame / settleMatch2 / core 一致',
  JSON.stringify(mixedSettle.byHole) === JSON.stringify(mixedMatch.byHole) &&
    mixedSettle.byHole.A1.pA === mixedEagle.finalValue &&
    mixedSettle.byHole.A2.pA === mixedBirdie.finalValue &&
    mixedSettle.byHole.A3.pA === mixedTie.finalValue
);

var firstRefresh = repo.refreshResult(created.id, host);
var snap1 = JSON.stringify(firstRefresh.ok && firstRefresh.data && firstRefresh.data.resultSnapshot);
var secondRefresh = repo.refreshResult(created.id, host);
var snap2 = JSON.stringify(secondRefresh.ok && secondRefresh.data && secondRefresh.data.resultSnapshot);
assert('refreshResult 连续两次结果不变', firstRefresh.ok && secondRefresh.ok && snap1 === snap2 && snap1.indexOf('"pA":5') >= 0);

var reloaded = bind.getGame('score', created.id);
assert(
  '重启加载后逐洞与总分不变',
  reloaded &&
    reloaded.holeResults &&
    reloaded.holeResults.byHole.A1.pA === 5 &&
    reloaded.holeResults.byHole.A1.pB === -5
);
var totalReload = 0;
catalog.HOLES.forEach(function (label) {
  totalReload += Number(reloaded.holeResults.byHole[label].pA) || 0;
});
assert('仓库刷新后总分仍为各洞之和', totalReload === 5 * 18);

console.log('EVIDENCE reward=' + mergedSnap.reward + ' m2=' + m2row.value + ' m1=' + m1row.value);
console.log('EVIDENCE abs2→rel=' + absOnce.A1.pA + ' settleA1=' + viaSettle.byHole.A1.pA);
console.log('EVIDENCE eagle=' + mixedEagle.finalValue + ' birdie=' + mixedBirdie.finalValue + ' tie=' + mixedTie.finalValue);
console.log('SUMMARY passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
