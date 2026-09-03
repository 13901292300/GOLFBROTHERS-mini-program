/**
 * V53 §4.1.1 两人比杆：信封拆解 + 结果页 listBoard 链路。
 * 运行：node scripts/gameStroke2V53Page.selftest.js
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
var settleStroke2 = require('../miniprogram/subpackages/game/utils/settleStroke2.js');
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

function addRows(values) {
  return mulRows(values);
}

function ruleMul(values) {
  return {
    catalogId: 'stroke-2',
    ruleId: 'stroke-2',
    reward: 'mul',
    mulRows: mulRows(values),
    addRows: addRows([10, 4, 1, 0, 0, 0])
  };
}

function ruleAdd(values) {
  return {
    catalogId: 'stroke-2',
    ruleId: 'stroke-2',
    reward: 'add',
    addRows: addRows(values),
    mulRows: mulRows([10, 5, 2, 1, 1, 1])
  };
}

function hole(leftActual, rightActual, par, k, snap) {
  return settleStroke2.calculateStrokePlayHoleResult({
    leftActualScore: leftActual,
    rightActualScore: rightActual,
    par: par == null ? 4 : par,
    pointPerStroke: k == null ? 1 : k,
    ruleSnapshot: snap
  });
}

var birdieMul = hole(4, 3, 4, 1, ruleMul([10, 5, 2, 1, 1, 1]));
assert(
  '1 V53 原文小鸟×2：par4 4对3 → B ±2',
  birdieMul.winner === 'right' &&
    birdieMul.baseGap === 1 &&
    birdieMul.winnerActualDiff === -1 &&
    birdieMul.rewardMode === 'mul' &&
    birdieMul.rewardKey === 'm1' &&
    birdieMul.rewardValue === 2 &&
    birdieMul.adjustedGap === 2 &&
    birdieMul.finalValue === 2 &&
    birdieMul.leftValue === -2 &&
    birdieMul.rightValue === 2
);

var eagleMul = hole(4, 2, 4, 1, ruleMul([10, 5, 2, 1, 1, 1]));
assert(
  '2 老鹰×5：杆差2 → ±10 不是比洞±5',
  eagleMul.winner === 'right' &&
    eagleMul.baseGap === 2 &&
    eagleMul.rewardKey === 'm2' &&
    eagleMul.rewardValue === 5 &&
    eagleMul.adjustedGap === 10 &&
    eagleMul.leftValue === -10 &&
    eagleMul.rightValue === 10
);

var birdieAdd = hole(5, 3, 4, 1, ruleAdd([10, 4, 1, 0, 0, 0]));
assert(
  '3 小鸟加法+1：杆差2+1=3',
  birdieAdd.winner === 'right' &&
    birdieAdd.baseGap === 2 &&
    birdieAdd.rewardMode === 'add' &&
    birdieAdd.rewardValue === 1 &&
    birdieAdd.adjustedGap === 3 &&
    birdieAdd.leftValue === -3 &&
    birdieAdd.rightValue === 3
);

var addK2 = hole(5, 3, 4, 2, ruleAdd([10, 4, 1, 0, 0, 0]));
assert(
  '4 K≠1 加法先加杆差再乘K：3×2=6',
  addK2.adjustedGap === 3 && addK2.finalValue === 6 && addK2.leftValue === -6 && addK2.rightValue === 6
);

var twoStrokeMul = hole(5, 3, 4, 1, ruleMul([10, 5, 2, 1, 1, 1]));
assert(
  '5 两杆获胜且乘法×2 → 4K',
  twoStrokeMul.baseGap === 2 &&
    twoStrokeMul.winnerActualDiff === -1 &&
    twoStrokeMul.rewardValue === 2 &&
    twoStrokeMul.adjustedGap === 4 &&
    twoStrokeMul.finalValue === 4
);

var parWin = hole(4, 5, 4, 1, ruleMul([10, 5, 2, 1, 1, 1]));
assert(
  '6 PAR 按配置 ×1',
  parWin.winner === 'left' && parWin.rewardKey === 'par' && parWin.rewardValue === 1 && parWin.leftValue === 1
);

var noneRule = { catalogId: 'stroke-2', reward: 'none', mulRows: mulRows([10, 5, 2, 1, 1, 1]) };
var tie = hole(3, 3, 4, 1, ruleMul([10, 5, 2, 1, 1, 1]));
assert('7 平局始终 0（双方小鸟也不奖）', tie.winner === '' && tie.baseGap === 0 && tie.leftValue === 0 && tie.rightValue === 0);

var loserBirdie = hole(3, 5, 4, 1, ruleMul([10, 5, 2, 1, 1, 1]));
assert(
  '8 负者成绩不触发奖励：A小鸟胜，用A的×2',
  loserBirdie.winner === 'left' && loserBirdie.winnerActualDiff === -1 && loserBirdie.leftValue === 4
);

var noReward = hole(4, 3, 4, 1, noneRule);
assert('9 无奖励保持原杆差 ±1', noReward.rewardMode === 'none' && noReward.adjustedGap === 1 && noReward.rightValue === 1);

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
      return 'st2_' + n;
    };
  })()
});
facade.setImplementation(repo);

function makeHost(scoreA, scoreB, holeScores) {
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
    holeOrder.forEach(function (label, hi) {
      var recScore;
      if (holeScores && holeScores[hi]) recScore = holeScores[hi][idx];
      else recScore = idx === 0 ? scoreA : scoreB;
      holes[label] = { score: recScore };
    });
    official[p.playerId] = { holes: holes };
  });
  return hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: 'm-st2page',
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

function installGame(scoreA, scoreB, snap, extra) {
  extra = extra || {};
  var host = extra.host || makeHost(scoreA, scoreB, extra.holeScores);
  hostSession.clearHostContext();
  hostSession.setHostContext(host);
  bind.attachHost(host);
  bind.discardSetupDraft();
  bind.ensureSetupDraft('score');
  global.__STROKE2_DEBUG__ = true;
  var holes = catalog.HOLES.map(function (label, i) {
    var on = extra.onlyFirst ? i === 0 : true;
    return { label: label, on: on };
  });
  var created = bind.addGame('score', {
    catalogId: 'stroke-2',
    name: extra.name || '比杆',
    players: [{ id: 'pA' }, { id: 'pB' }],
    pairings: [
      {
        id: 'pA|pB',
        leftId: 'pA',
        rightId: 'pB',
        on: true,
        strokes: extra.strokes == null ? 0 : extra.strokes
      }
    ],
    holes: holes,
    holeOrder: catalog.HOLES.slice(),
    multiplier: extra.k == null ? 1 : extra.k,
    ruleLibId: extra.ruleLibId || "",
    ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('stroke-2'), snap)
  });
  var committed = bind.commitSetupDraft('score');
  return { created: created, committed: committed, host: host };
}

function boardCell(board, holeIndex, playerIndex) {
  var holeRow = board.holes && board.holes[holeIndex];
  return holeRow && holeRow.cells && holeRow.cells[playerIndex];
}

var v53 = installGame(4, 3, ruleMul([10, 5, 2, 1, 1, 1]));
assert('新比赛 commit', v53.created && !v53.created.__fail && v53.committed && v53.committed.ok);
var boardV53 = bind.listBoard('score', v53.created.id);
var trV53 = global.__STROKE2_LAST_TRACE__;
var wxV53 = bind.listPublishedBoard('score', v53.created.id);
assert(
  '17 结果页 listBoard 小鸟×2 ±2',
  boardCell(boardV53, 0, 0) &&
    boardCell(boardV53, 0, 0).raw === -2 &&
    boardCell(boardV53, 0, 1).raw === 2
);
assert(
  '微信 listPublishedBoard 与纯函数一致',
  boardCell(wxV53, 0, 0) && boardCell(wxV53, 0, 0).raw === birdieMul.leftValue && boardCell(wxV53, 0, 1).raw === birdieMul.rightValue
);
assert(
  '18 双方零和（结果页第一洞）',
  boardCell(boardV53, 0, 0).raw + boardCell(boardV53, 0, 1).raw === 0
);
var loadedV53 = bind.getGame('score', v53.created.id);
assert(
  'create persist reload 保留 reward/mulRows',
  loadedV53.ruleSnapshot.reward === 'mul' &&
    loadedV53.holeResults.settleVersion === 'v53-4.1.1' &&
    String(
      loadedV53.ruleSnapshot.mulRows.filter(function (r) {
        return r.id === 'm1';
      })[0].value
    ) === '2'
);

var eaglePage = installGame(4, 2, ruleMul([10, 5, 2, 1, 1, 1]));
var boardEagle = bind.listBoard('score', eaglePage.created.id);
assert(
  '结果页老鹰×5 杆差2 → ±10',
  boardCell(boardEagle, 0, 0).raw === -10 && boardCell(boardEagle, 0, 1).raw === 10
);

var addPage = installGame(5, 3, ruleAdd([10, 4, 1, 0, 0, 0]), { k: 2 });
var boardAdd = bind.listBoard('score', addPage.created.id);
assert(
  '结果页加法 (2+1)×2 = ±6',
  boardCell(boardAdd, 0, 0).raw === -6 && boardCell(boardAdd, 0, 1).raw === 6
);
var loadedAdd = bind.getGame('score', addPage.created.id);
assert(
  'reload 加法表保留',
  loadedAdd.ruleSnapshot.reward === 'add' &&
    String(
      loadedAdd.ruleSnapshot.addRows.filter(function (r) {
        return r.id === 'm1';
      })[0].value
    ) === '1'
);

function sumHoles(board, pi) {
  var n = 0;
  (board.holes || []).forEach(function (h) {
    if (h && h.cells && h.cells[pi]) n += Number(h.cells[pi].raw) || 0;
  });
  return n;
}

var hcapPos = installGame(4, 4, noneRule, { strokes: 2 });
var boardHcapPos = bind.listBoard('score', hcapPos.created.id);
assert(
  '10 正让杆 N=2：初始 A=-2 B=+2，平局洞 0，总分即初始',
  boardHcapPos.totals[0].raw === -2 && boardHcapPos.totals[1].raw === 2
);

var hcapNeg = installGame(4, 4, noneRule, { strokes: -1 });
var boardHcapNeg = bind.listBoard('score', hcapNeg.created.id);
assert(
  '10 负让杆 N=-1：初始 A=+1 B=-1',
  boardHcapNeg.totals[0].raw === 1 && boardHcapNeg.totals[1].raw === -1
);

var hcap0 = installGame(4, 4, noneRule, { strokes: 0 });
assert('10 零让杆总分 0', bind.listBoard('score', hcap0.created.id).totals[0].raw === 0);

var hcapReward = installGame(4, 3, ruleMul([10, 5, 2, 1, 1, 1]), { strokes: 2, onlyFirst: true });
var boardHR = bind.listBoard('score', hcapReward.created.id);
assert(
  '11 奖励不放大初始让杆：初始±2 + 洞±2 → 总分 A=-4 B=+4',
  boardHR.totals[0].raw === -4 && boardHR.totals[1].raw === 4 && boardCell(boardHR, 0, 0).raw === -2
);

var rangeGame = installGame(4, 3, ruleMul([10, 5, 2, 1, 1, 1]), { onlyFirst: true });
var boardRange = bind.listBoard('score', rangeGame.created.id);
assert(
  '12 有效洞范围外不计分',
  boardCell(boardRange, 0, 1).raw === 2 &&
    (boardCell(boardRange, 1, 1) == null || boardCell(boardRange, 1, 1).raw === 0 || boardCell(boardRange, 1, 1).raw == null)
);

assert(
  '13 多洞总分=初始让杆+逐洞',
  boardHR.totals[0].raw === -2 + sumHoles(boardHR, 0) && boardHR.totals[1].raw === 2 + sumHoles(boardHR, 1)
);

var libRow = bind.upsertMyRule(Object.assign({ name: '信封比杆', players: 2 }, ruleMul([10, 5, 2, 1, 1, 1])));
assert(
  '14 规则库信封：顶层无 reward，嵌套有 mul',
  libRow && libRow.reward == null && libRow.ruleSnapshot && libRow.ruleSnapshot.reward === 'mul'
);
var envTrace = rec.describeStroke2RewardSources({
  game: { id: 'pre', catalogId: 'stroke-2', ruleSnapshot: libRow },
  record: { sideGameId: 'pre', ruleId: 'stroke-2', ruleSnapshot: libRow, config: { instance: { ruleSnapshot: libRow } } },
  libraryRecord: libRow
});
assert(
  '14 信封误当作实例仍可拆解',
  envTrace.lostAt === 'library_envelope_used_as_instance_snapshot' && envTrace.chosen && envTrace.chosen.reward === 'mul'
);

hostSession.clearHostContext();
hostSession.setHostContext(makeHost(4, 3));
bind.attachHost(makeHost(4, 3));
bind.discardSetupDraft();
bind.ensureSetupDraft('score');
global.__lastToast = '';
var envCreated = bind.addGame('score', {
  catalogId: 'stroke-2',
  name: '信封比杆赛',
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
assert(
  '15 create→persist→reload reward/mulRows 保留',
  envReloaded.ruleSnapshot.reward === 'mul' &&
    String(
      envReloaded.ruleSnapshot.mulRows.filter(function (r) {
        return r.id === 'm1';
      })[0].value
    ) === '2'
);
var envBoard = bind.listBoard('score', envCreated.id);
assert(
  '信封恢复后结果页小鸟×2 无静默基础杆差',
  boardCell(envBoard, 0, 0).raw === -2 && global.__lastToast !== '奖励配置未写入'
);

var addLib = bind.upsertMyRule(Object.assign({ name: '信封加法比杆', players: 2 }, ruleAdd([10, 4, 1, 0, 0, 0])));
bind.discardSetupDraft();
bind.ensureSetupDraft('score');
var addEnv = bind.addGame('score', {
  catalogId: 'stroke-2',
  name: '信封加法',
  ruleLibId: addLib.id,
  players: [{ id: 'pA' }, { id: 'pB' }],
  pairings: [{ id: 'pA|pB', leftId: 'pA', rightId: 'pB', on: true, strokes: 0 }],
  holes: catalog.HOLES.map(function (label) {
    return { label: label, on: true };
  }),
  holeOrder: catalog.HOLES.slice(),
  multiplier: 1,
  ruleSnapshot: addLib
});
bind.commitSetupDraft('score');
var addEnvLoaded = bind.getGame('score', addEnv.id);
assert(
  '15 reload 加法配置保留',
  addEnvLoaded.ruleSnapshot.reward === 'add' &&
    String(
      addEnvLoaded.ruleSnapshot.addRows.filter(function (r) {
        return r.id === 'm1';
      })[0].value
    ) === '1'
);

var histHost = makeHost(4, 2);
hostSession.setHostContext(histHost);
bind.attachHost(histHost);
var stale = { byHole: { A1: { __pot__: 0, pA: 2, pB: -2 } }, catalogId: 'stroke-2' };
var histRow = repo.getById(eaglePage.created.id);
if (histRow.ok) {
  repo.update(eaglePage.created.id, histRow.data.revision, { resultSnapshot: stale, status: 'ended' });
}
var boardHist = bind.listBoard('score', eaglePage.created.id);
assert(
  '16 历史快照受控重算为鹰×5 ±10',
  boardCell(boardHist, 0, 0).raw === -10 &&
    bind.getGame('score', eaglePage.created.id).holeResults.settleVersion === 'v53-4.1.1'
);

var miss = installGame(4, 3, rec.buildRuleSnapshot('stroke-2'), { ruleLibId: 'rl_missing_stroke' });
global.__lastToast = '';
var boardMiss = bind.listBoard('score', miss.created.id);
var missRow = repo.getById(miss.created.id).data;
assert(
  '写入失败提示 奖励配置未写入 且不存错误快照',
  global.__lastToast === '奖励配置未写入' &&
    !(boardCell(boardMiss, 0, 0) && boardCell(boardMiss, 0, 0).raw === -1) &&
    !(missRow.resultSnapshot && missRow.resultSnapshot.rewardMissing)
);

var restored = settle.resolveStroke2RuleSnapshot(
  { ruleSnapshot: rec.buildRuleSnapshot('stroke-2') },
  ruleMul([10, 5, 2, 1, 1, 1])
);
assert(
  '未改版规则库可恢复 mul',
  restored.rewardState === 'mul' && restored.ruleSnapshot.reward === 'mul'
);

var tr = trV53;
assert(
  '结果页进入 V53 比杆核心',
  tr &&
    tr.settleVersion === 'v53-4.1.1' &&
    tr.resultSource === 'settleStroke2' &&
    tr.rewardMode === 'mul' &&
    tr.rewardValue === 2 &&
    tr.baseGap === 1 &&
    tr.adjustedGap === 2
);

console.log('BOARD_V53 ' + JSON.stringify({
  hole0: boardV53.holes && boardV53.holes[0] && boardV53.holes[0].cells,
  totals: boardV53.totals
}));
console.log('BOARD_EAGLE ' + JSON.stringify({
  hole0: boardEagle.holes && boardEagle.holes[0] && boardEagle.holes[0].cells
}));
console.log('BOARD_ADD_K2 ' + JSON.stringify({
  hole0: boardAdd.holes && boardAdd.holes[0] && boardAdd.holes[0].cells
}));
console.log('TRACE ' + JSON.stringify(tr));
console.log('SUMMARY passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
