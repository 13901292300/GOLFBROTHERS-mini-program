/**
 * derived replay scope：CURRENT_GAME / ALL_GAMES / fingerprint fallback。
 * 运行：node scripts/gameDerivedScope.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
var wxStore = {};
global.wx.getStorageSync = function (key) {
  return wxStore[key];
};
global.wx.setStorageSync = function (key, value) {
  wxStore[key] = value == null ? value : JSON.parse(JSON.stringify(value));
};
global.wx.showToast = function () {};

var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var settingsMod = require('../miniprogram/subpackages/game/utils/localSideGameSettings.js');

var passed = 0;
var failed = 0;
var IDS = ['A', 'B', 'C', 'D'];
var MATCH = 'm-scope';
var matchSeq = 0;
var staleRows = [
  { id: 'hio', value: 32 },
  { id: 'm2', value: 16 },
  { id: 'm1', value: 8 },
  { id: 'par', value: 4 },
  { id: 'p1', value: 2 },
  { id: 'p2', value: 1 },
  { id: 'p3', value: 2 }
];

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
      return 'gscope_' + n;
    };
  })()
});
facade.setImplementation(repo);

function makeHost(parA1) {
  var holeOrder = catalog.HOLES.slice();
  var pars = {};
  holeOrder.forEach(function (h) {
    pars[h] = 4;
  });
  if (parA1) pars.A1 = parA1;
  var players = IDS.map(function (id) {
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
  var rel = { A: 3, B: 1, C: 3, D: 1 };
  players.forEach(function (p) {
    var holes = {};
    holeOrder.forEach(function (label) {
      holes[label] = { score: 4 + rel[p.playerId] };
    });
    official[p.playerId] = { holes: holes };
  });
  return hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: MATCH,
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

function boot(parA1) {
  var host = makeHost(parA1);
  hostSession.clearHostContext();
  hostSession.setHostContext(host);
  bind.attachHost(host);
  bind.discardSetupDraft();
  bind.ensureSetupDraft('score');
  return host;
}

function holesOn(n) {
  return catalog.HOLES.map(function (label, i) {
    return { label: label, on: i < n };
  });
}

function old8421Players() {
  return [
    { id: 'A', scoreCode: '', scoreRows: staleRows },
    { id: 'B', scoreCode: '8421' },
    { id: 'C', scoreCode: '8421' },
    { id: 'D', scoreCode: '8421' }
  ];
}

function publish(game) {
  bind.ensureSetupDraft('score');
  var created = bind.addGame('score', game);
  var committed = bind.commitSetupDraft('score');
  return { id: created && created.id, ok: !!(committed && committed.ok), created: created, committed: committed };
}

function repoRow(id) {
  var got = repo.getById(id);
  return got.ok ? got.data : null;
}

function idsOf(log, scope) {
  return log
    .filter(function (item) {
      return item.scope === scope;
    })
    .map(function (item) {
      return item.gameId;
    });
}

function onlyIds(list, expected) {
  if (list.length !== expected.length) return false;
  return expected.every(function (id) {
    return list.indexOf(id) >= 0;
  });
}

function publishTrio() {
  MATCH = 'm-scope-' + (++matchSeq);
  boot();
  var g8421 = publish({
    catalogId: '8421-4',
    name: '8421',
    players: old8421Players(),
    playerOrder: IDS.slice(),
    groupMode: 'fixed',
    holes: holesOn(2),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('8421-4'), {
      catalogId: '8421-4',
      scoreCode: '8421',
      pushRule: 'tie',
      baoNeg: 'none',
      reward: 'none',
      meatEatMode: 'piece',
      deductMode: 'on',
      deductWay: 'plus-n',
      deductPlusN: 4
    })
  });
  var gStroke = publish({
    catalogId: 'stroke-2',
    name: 'stroke-2',
    players: IDS.map(function (id) {
      return { id: id };
    }),
    playerOrder: IDS.slice(),
    pairings: [
      { id: 'ab', leftId: 'A', rightId: 'B', on: true },
      { id: 'ac', leftId: 'A', rightId: 'C', on: true }
    ],
    holes: holesOn(2),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('stroke-2'), { catalogId: 'stroke-2', reward: 'none' })
  });
  var gMatch = publish({
    catalogId: 'match-2',
    name: 'match-2',
    players: [
      { id: 'A' },
      { id: 'B' }
    ],
    playerOrder: ['A', 'B'],
    pairings: [{ id: 'ab', leftId: 'A', rightId: 'B', on: true }],
    holes: holesOn(2),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('match-2'), { catalogId: 'match-2', reward: 'none' })
  });
  bind.discardSetupDraft();
  bind.takeDerivedReplayLog();
  return { g8421: g8421, gStroke: gStroke, gMatch: gMatch };
}

var trio = publishTrio();
assert('SCOPE setup 三游戏', trio.g8421.ok && trio.gStroke.ok && trio.gMatch.ok);

var strokeRev0 = repoRow(trio.gStroke.id).resultRevision;
var matchRev0 = repoRow(trio.gMatch.id).resultRevision;
var saveCode = bind.persistLivePlayerScores(
  'score',
  trio.g8421.id,
  [
    { id: 'A', scoreCode: '8431', scoreRows: null },
    { id: 'B', scoreCode: '8421' },
    { id: 'C', scoreCode: '8421' },
    { id: 'D', scoreCode: '8421' }
  ],
  { expectedRevision: repoRow(trio.g8421.id).revision }
);
var log1 = bind.takeDerivedReplayLog();
assert('SCOPE-1 保存成功', saveCode && !saveCode.__fail, JSON.stringify(saveCode && saveCode.reason));
assert(
  'SCOPE-1 仅 8421 CURRENT_GAME',
  onlyIds(idsOf(log1, 'CURRENT_GAME'), [trio.g8421.id]) && idsOf(log1, 'ALL_GAMES').length === 0,
  JSON.stringify(log1)
);
assert(
  'SCOPE-1 其他游戏未 replay',
  repoRow(trio.gStroke.id).resultRevision === strokeRev0 && repoRow(trio.gMatch.id).resultRevision === matchRev0
);

trio = publishTrio();
var strokeRev1 = repoRow(trio.gStroke.id).resultRevision;
var a8421Rev1 = repoRow(trio.g8421.id).resultRevision;
var matchRev1 = repoRow(trio.gMatch.id).resultRevision;
bind.ensureSetupDraft('score');
var savePair = bind.updateGame(
  'score',
  trio.gStroke.id,
  { pairings: [{ id: 'ab', leftId: 'A', rightId: 'B', on: true }] },
  { expectedRevision: repoRow(trio.gStroke.id).revision }
);
var log2 = bind.takeDerivedReplayLog();
assert('SCOPE-2 保存成功', savePair && !savePair.__fail, JSON.stringify(savePair && savePair.reason));
assert(
  'SCOPE-2 仅 stroke-2 CURRENT_GAME',
  onlyIds(idsOf(log2, 'CURRENT_GAME'), [trio.gStroke.id]) && idsOf(log2, 'ALL_GAMES').length === 0,
  JSON.stringify(log2)
);
assert(
  'SCOPE-2 其他游戏未 replay',
  repoRow(trio.g8421.id).resultRevision === a8421Rev1 &&
    repoRow(trio.gMatch.id).resultRevision === matchRev1 &&
    repoRow(trio.gStroke.id).resultRevision !== strokeRev1
);

trio = publishTrio();
var newOrder = catalog.HOLES.slice();
var tmp = newOrder[0];
newOrder[0] = newOrder[1];
newOrder[1] = tmp;
bind.setHoleOrder('score', newOrder);
var log3 = bind.takeDerivedReplayLog();
var all3 = [trio.g8421.id, trio.gStroke.id, trio.gMatch.id];
assert(
  'SCOPE-3 三游戏 ALL_GAMES',
  onlyIds(idsOf(log3, 'ALL_GAMES'), all3) && idsOf(log3, 'CURRENT_GAME').length === 0,
  JSON.stringify(log3)
);

trio = publishTrio();
var fpBefore = all3.map(function () {
  return null;
});
fpBefore = [trio.g8421.id, trio.gStroke.id, trio.gMatch.id].map(function (id) {
  return repoRow(id).resultSnapshot && repoRow(id).resultSnapshot.hostStructureFp;
});
var hostPar = makeHost(5);
hostSession.setHostContext(hostPar);
bind.attachHost(hostPar);
var log4 = bind.takeDerivedReplayLog();
assert(
  'SCOPE-4 改 PAR 立即 ALL_GAMES（未先 listPublishedBoard）',
  onlyIds(idsOf(log4, 'ALL_GAMES'), [trio.g8421.id, trio.gStroke.id, trio.gMatch.id]),
  JSON.stringify(log4)
);
assert(
  'SCOPE-4 fingerprint 已更新 PAR=5',
  [trio.g8421.id, trio.gStroke.id, trio.gMatch.id].every(function (id, i) {
    var fp = repoRow(id).resultSnapshot && repoRow(id).resultSnapshot.hostStructureFp;
    return fp && fp !== fpBefore[i] && JSON.parse(fp).pars.A1 === 5;
  })
);

trio = publishTrio();
var failCur = bind.updateGame(
  'score',
  trio.g8421.id,
  { multiplier: 2 },
  { expectedRevision: repoRow(trio.g8421.id).revision - 1 }
);
var log5a = bind.takeDerivedReplayLog();
assert('SCOPE-5 CURRENT_GAME 保存失败', failCur && failCur.__fail);
assert('SCOPE-5 CURRENT_GAME 0 replay', log5a.length === 0, JSON.stringify(log5a));

bind.ensureSetupDraft('score');
var setup = require('../miniprogram/subpackages/game/utils/sideGameDraft.js').getSetupDraftRaw();
if (setup && setup.globalSettings) {
  setup.globalSettings.fullHoleOrderRevision = (Number(setup.globalSettings.fullHoleOrderRevision) || 1) + 1;
  setup.updated = [trio.gStroke.id];
  setup.expectedRevisions[trio.gStroke.id] = 0;
}
var failAll = bind.commitSetupDraft('score');
var log5b = bind.takeDerivedReplayLog();
assert('SCOPE-5 ALL_GAMES 保存失败', failAll && !failAll.ok, JSON.stringify(failAll && failAll.reason));
assert('SCOPE-5 ALL_GAMES 0 replay', log5b.length === 0, JSON.stringify(log5b));

trio = publishTrio();
var snap = JSON.parse(JSON.stringify(repoRow(trio.g8421.id).resultSnapshot));
snap.scoreConfigFp = 'stale-fp-for-fallback';
repo.update(trio.g8421.id, repoRow(trio.g8421.id).revision, { resultSnapshot: snap });
bind.takeDerivedReplayLog();
bind.listPublishedBoard('score', trio.g8421.id);
var log6 = bind.takeDerivedReplayLog();
assert(
  'SCOPE-6 fingerprint fallback 仍 full replay',
  log6.some(function (item) {
    return item.scope === 'FALLBACK' && item.gameId === trio.g8421.id;
  }),
  JSON.stringify(log6)
);

console.log('---');
console.log('passed ' + passed + '  failed ' + failed);
if (failed) process.exit(1);
