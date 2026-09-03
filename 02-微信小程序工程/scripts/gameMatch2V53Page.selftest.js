/**
 * V53 §4.1.2 比洞：原文实例 + 结果页 listBoard 链路（非仅核心函数）。
 * 运行：node scripts/gameMatch2V53Page.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
global.wx.getStorageSync = global.wx.getStorageSync || function () { return null; };
global.wx.setStorageSync = global.wx.setStorageSync || function () {};
global.wx.showToast = function (opt) {
  global.__lastToast = opt && opt.title;
};

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
  return ['hio', 'm2', 'm1', 'par', 'p1', 'ge2'].map(function (id, i) {
    return { id: id, value: String(values[i]) };
  });
}

function ruleMul(values, extra) {
  return Object.assign(
    {
      catalogId: 'match-2',
      ruleId: 'match-2',
      reward: 'mul',
      mulRows: mulRows(values)
    },
    extra || {}
  );
}

function holeActual(a, b, n, rule, k, par) {
  return settleMatch2.calculateMatchPlayHoleResult({
    playerActual: a,
    opponentActual: b,
    par: par == null ? 4 : par,
    handicapN: n,
    ruleConfig: rule,
    pointValue: k == null ? 1 : k
  });
}

var noneRule = { catalogId: 'match-2', reward: 'none', pushRule: 'none' };
var ex1 = holeActual(4, 5, 0.5, noneRule, 1, 4);
assert(
  'V53 实例一 N=0.5 A=4 B=5 A胜 ±1',
  ex1.outcome === 'win' &&
    ex1.adjustedLeft === 4 &&
    ex1.adjustedRight === 4.5 &&
    ex1.multiplier === 1 &&
    ex1.leftPts === 1 &&
    ex1.rightPts === -1
);

var ex2 = holeActual(5, 4, -1, { catalogId: 'match-2', reward: 'none', pushRule: 'push' }, 1, 4);
assert(
  'V53 实例二 N=-1 C=5 D=4 平局 0',
  ex2.outcome === 'tie' && ex2.adjustedLeft === 4 && ex2.adjustedRight === 4 && ex2.leftPts === 0 && ex2.rightPts === 0
);

var eagle = holeActual(2, 4, 0, ruleMul([10, 5, 2, 1, 1, 1]), 1, 4);
assert('验收 鹰×5', eagle.scoreType === 'eagle' && eagle.multiplier === 5 && eagle.leftPts === 5 && eagle.rightPts === -5);

var birdie = holeActual(3, 4, 0, ruleMul([10, 5, 2, 1, 1, 1]), 1, 4);
assert('验收 小鸟×2', birdie.scoreType === 'birdie' && birdie.multiplier === 2 && birdie.leftPts === 2 && birdie.rightPts === -2);

var parWin = holeActual(4, 5, 0, ruleMul([10, 5, 2, 1, 1, 1]), 1, 4);
assert('验收 PAR×1', parWin.scoreType === 'par' && parWin.multiplier === 1 && parWin.leftPts === 1);

var k2 = holeActual(4, 4.5, 0, ruleMul([10, 5, 2, 1, 1, 1]), 2, 4);
assert('验收 K=2 PAR ±2', k2.scoreType === 'par' && k2.leftPts === 2 && k2.rightPts === -2);

var iso = holeActual(4, 4, 1, ruleMul([10, 5, 2, 1, 1, 1]), 1, 4);
assert(
  '让杆与成绩隔离：B胜仍是PAR 不得±2',
  iso.outcome === 'lose' &&
    iso.adjustedLeft === 4 &&
    iso.adjustedRight === 3 &&
    iso.winnerActualDiff === 0 &&
    iso.multiplierKey === 'par' &&
    iso.multiplier === 1 &&
    iso.leftPts === -1 &&
    iso.rightPts === 1
);

identity.setImplementation({
  implementation: 'test',
  getCurrentUserId: function () {
    return 'tester';
  }
});
var repo = localMod.createLocalSideGameRepository({
  storage: memStorage(),
  settingsApi: settingsMod.createLocalSideGameSettings({ storage: memStorage() }),
  idGen: (function () {
    var n = 0;
    return function () {
      n += 1;
      return 'v53p_' + n;
    };
  })()
});
facade.setImplementation(repo);

function makeHost(scoreA, scoreB) {
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
      holes[label] = { score: idx === 0 ? scoreA : scoreB };
    });
    official[p.playerId] = { holes: holes };
  });
  return hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: 'm-v53page',
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

function installGame(scoreA, scoreB, snap, strokes) {
  var host = makeHost(scoreA, scoreB);
  hostSession.clearHostContext();
  hostSession.setHostContext(host);
  bind.attachHost(host);
  bind.discardSetupDraft();
  bind.ensureSetupDraft('score');
  global.__MATCH2_DEBUG__ = true;
  var created = bind.addGame('score', {
    catalogId: 'match-2',
    name: '比洞',
    players: [{ id: 'pA' }, { id: 'pB' }],
    pairings: [{ id: 'pA|pB', leftId: 'pA', rightId: 'pB', on: true, strokes: strokes == null ? 0 : strokes }],
    holes: catalog.HOLES.map(function (label) {
      return { label: label, on: true };
    }),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('match-2'), snap)
  });
  var committed = bind.commitSetupDraft('score');
  return { created: created, committed: committed, host: host };
}

var neu = installGame(2, 4, ruleMul([10, 5, 2, 1, 1, 1]));
assert('新比赛 commit', neu.created && !neu.created.__fail && neu.committed && neu.committed.ok);
var boardNew = bind.listBoard('score', neu.created.id);
var hole0 = boardNew.holes && boardNew.holes[0];
var totA = boardNew.totals && boardNew.totals[0] && boardNew.totals[0].raw;
var totB = boardNew.totals && boardNew.totals[1] && boardNew.totals[1].raw;
assert(
  '新比赛结果页鹰×5',
  hole0 && hole0.cells && hole0.cells[0].raw === 5 && hole0.cells[1].raw === -5
);
assert('新比赛总分=逐洞累计 5×18', totA === 90 && totB === -90);
assert('新比赛零和', totA + totB === 0);
var loadedNew = bind.getGame('score', neu.created.id);
assert(
  '新比赛快照版本 v53',
  loadedNew.holeResults.settleVersion === 'v53-4.1.2' && loadedNew.ruleSnapshot.reward === 'mul'
);
var tr = global.__MATCH2_LAST_TRACE__;
assert(
  '结果页进入 V53 核心',
  tr &&
    tr.settleVersion === 'v53-4.1.2' &&
    tr.resultSource === 'settleMatch2' &&
    tr.multiplier === 5 &&
    tr.multiplierKey === 'm2' &&
    tr.winnerActualDiff === -2
);

var histHost = makeHost(2, 4);
hostSession.setHostContext(histHost);
bind.attachHost(histHost);
var stale = {
  byHole: { A1: { __pot__: 0, pA: 1, pB: -1 } },
  catalogId: 'match-2'
};
var histRow = repo.getById(neu.created.id);
if (histRow.ok) {
  repo.update(neu.created.id, histRow.data.revision, { resultSnapshot: stale });
}
var boardHist = bind.listBoard('score', neu.created.id);
assert(
  '历史×1快照被 V53 重算为鹰×5',
  boardHist.holes[0].cells[0].raw === 5 &&
    bind.getGame('score', neu.created.id).holeResults.settleVersion === 'v53-4.1.2'
);

var miss = installGame(2, 4, rec.buildRuleSnapshot('match-2'));
global.__lastToast = '';
var boardMiss = bind.listBoard('score', miss.created.id);
var missRow = repo.getById(miss.created.id).data;
assert(
  '能力桩写入失败提示不是历史缺失',
  global.__lastToast === '倍率配置未写入' &&
    !(boardMiss.holes && boardMiss.holes[0] && boardMiss.holes[0].cells && boardMiss.holes[0].cells[0] && boardMiss.holes[0].cells[0].raw === 5) &&
    !(missRow.resultSnapshot && missRow.resultSnapshot.byHole && missRow.resultSnapshot.byHole.A1 && missRow.resultSnapshot.byHole.A1.pA === 1)
);

var restoredSnap = settle.resolveMatch2RuleSnapshot(
  { ruleSnapshot: rec.buildRuleSnapshot('match-2') },
  ruleMul([10, 5, 2, 1, 1, 1])
);
assert(
  '未改版规则库快照可恢复 mul',
  restoredSnap.mulState === 'mul' && restoredSnap.ruleSnapshot.reward === 'mul'
);

var libRow = bind.upsertMyRule(
  Object.assign({ name: '信封规则', players: 2, matchPlay: true }, ruleMul([10, 5, 2, 1, 1, 1]))
);
assert(
  '规则库信封：顶层无 reward，嵌套 ruleSnapshot 有 mul',
  libRow && libRow.reward == null && libRow.ruleSnapshot && libRow.ruleSnapshot.reward === 'mul'
);
var envelopeTrace = rec.describeMatch2MulSources({
  game: { id: 'pre-write', catalogId: 'match-2', ruleSnapshot: libRow },
  record: { sideGameId: 'pre-write', ruleId: 'match-2', ruleSnapshot: libRow, config: { instance: { ruleSnapshot: libRow } } },
  libraryRecord: libRow
});
console.log('ENVELOPE_TRACE ' + JSON.stringify(envelopeTrace));
assert(
  '丢失节点=把规则库信封当作 instance.ruleSnapshot',
  envelopeTrace.lostAt === 'library_envelope_used_as_instance_snapshot' && envelopeTrace.chosen && envelopeTrace.chosen.m2 === '5'
);
var envHost = makeHost(2, 4);
hostSession.clearHostContext();
hostSession.setHostContext(envHost);
bind.attachHost(envHost);
bind.discardSetupDraft();
bind.ensureSetupDraft('score');
global.__lastToast = '';
var envCreated = bind.addGame('score', {
  catalogId: 'match-2',
  name: '信封比洞',
  ruleLibId: libRow.id,
  players: [{ id: 'pA' }, { id: 'pB' }],
  pairings: [{ id: 'pA|pB', leftId: 'pA', rightId: 'pB', on: true, strokes: 0 }],
  holes: catalog.HOLES.map(function (label) {
    return { label: label, on: true };
  }),
  holeOrder: catalog.HOLES.slice(),
  multiplier: 1,
  ruleSnapshot: libRow
});
var envCommit = bind.commitSetupDraft('score');
assert('信封实例 commit', envCreated && !envCreated.__fail && envCommit && envCommit.ok);
var envReloaded = bind.getGame('score', envCreated.id);
var envTrace = rec.describeMatch2MulSources({
  game: envReloaded,
  record: repo.getById(envCreated.id).data,
  libraryRecord: libRow
});
console.log('SOURCE_TRACE ' + JSON.stringify(envTrace));
assert(
  'create→persist→reload reward/mulRows 仍在顶层',
  envReloaded.ruleSnapshot.reward === 'mul' &&
    String(
      envReloaded.ruleSnapshot.mulRows.filter(function (r) {
        return r.id === 'm2';
      })[0].value
    ) === '5' &&
    String(
      envReloaded.ruleSnapshot.mulRows.filter(function (r) {
        return r.id === 'm1';
      })[0].value
    ) === '2'
);
assert('丢失节点=规则库信封当实例快照', envTrace.lostAt === 'library_envelope_used_as_instance_snapshot' || envReloaded.ruleSnapshot.reward === 'mul');
var envBoard = bind.listBoard('score', envCreated.id);
assert(
  '信封历史实例恢复后结果页鹰×5 且无缺失 toast',
  envBoard.holes[0].cells[0].raw === 5 && global.__lastToast !== '历史倍率缺失' && global.__lastToast !== '该历史比赛未保存倍率配置，无法自动重算'
);

var envWx = bind.listPublishedBoard('score', envCreated.id);
assert(
  '微信结果页 listPublishedBoard 鹰×5',
  envWx && envWx.holes && envWx.holes[0].cells[0].raw === 5
);

var rankMod = require('../miniprogram/subpackages/game/utils/rankMarkProjection.js');
var envRow = repo.getById(envCreated.id).data;
var snapBefore = JSON.stringify(envRow.ruleSnapshot);
rankMod.refreshGameResults(envRow, {
  pars: envHost.pars,
  holeOrder: envHost.holeOrder,
  officialScoresByPartyId: envHost.officialScoresByPartyId
});
assert('rankMarkProjection 不覆盖完整规则', JSON.stringify(envRow.ruleSnapshot) === snapBefore);
assert(
  'rankMark 重算后仍有倍率',
  rec.unwrapGameplaySnapshot(envRow.ruleSnapshot).reward === 'mul'
);

console.log('LINEAGE ' + JSON.stringify({
  gameId: envCreated.id,
  catalogId: envReloaded.catalogId,
  instanceRuleSnapshot: envReloaded.ruleSnapshot && {
    reward: envReloaded.ruleSnapshot.reward,
    m2: rec.unwrapGameplaySnapshot(envReloaded.ruleSnapshot).mulRows
  },
  record: {
    ruleSnapshot: missRow && null,
    envRecord: (function () {
      var r = repo.getById(envCreated.id).data;
      return {
        reward: r.ruleSnapshot && r.ruleSnapshot.reward,
        instReward: r.config && r.config.instance && r.config.instance.ruleSnapshot && r.config.instance.ruleSnapshot.reward,
        resultSettleVersion: r.resultSnapshot && r.resultSnapshot.settleVersion
      };
    })()
  },
  sourceTrace: envTrace
}));

console.log('TRACE ' + JSON.stringify(tr));
console.log('SUMMARY passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
