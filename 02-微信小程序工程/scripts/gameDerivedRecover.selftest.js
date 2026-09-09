/**
 * derived recover：notify 丢失后 bind attachHost 凭 fingerprint 恢复。
 * 运行：node scripts/gameDerivedRecover.selftest.js
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
var derivedNotify = require('../miniprogram/utils/sideGameDerivedNotify.js');

var passed = 0;
var failed = 0;
var IDS = ['A', 'B', 'C', 'D'];
var MATCH = 'm-recover';
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
      return 'grec_' + n;
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
  bind.attachHost(host, { skipDerivedRecover: true });
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
  return { id: created && created.id, ok: !!(committed && committed.ok) };
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
  var uniq = [];
  list.forEach(function (id) {
    if (uniq.indexOf(id) < 0) uniq.push(id);
  });
  if (uniq.length !== expected.length) return false;
  return expected.every(function (id) {
    return uniq.indexOf(id) >= 0;
  });
}

function publishTrio() {
  MATCH = 'm-recover-' + (++matchSeq);
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

function muteNotify(fn) {
  var prev = derivedNotify.swapListeners([]);
  try {
    return fn();
  } finally {
    derivedNotify.swapListeners(prev);
  }
}

var trio = publishTrio();
assert('REC setup', trio.g8421.ok && trio.gStroke.ok && trio.gMatch.ok);
var allIds = [trio.g8421.id, trio.gStroke.id, trio.gMatch.id];

muteNotify(function () {
  var hostPar = makeHost(5);
  hostSession.setHostContext(hostPar);
  bind.attachHost(hostPar, { skipDerivedRecover: true });
});
bind.takeDerivedReplayLog();
bind.attachHost(makeHost(5));
var log1 = bind.takeDerivedReplayLog();
assert(
  'REC-1 attachHost 发现 stale 全场 replay',
  onlyIds(idsOf(log1, 'ALL_GAMES'), allIds),
  JSON.stringify(log1)
);
assert(
  'REC-1 未先 listPublishedBoard 已写入新 PAR fp',
  allIds.every(function (id) {
    var fp = repoRow(id).resultSnapshot && repoRow(id).resultSnapshot.hostStructureFp;
    return fp && JSON.parse(fp).pars.A1 === 5;
  })
);

trio = publishTrio();
var row8421 = repoRow(trio.g8421.id);
var inst = rec.jsonClone(row8421.config && row8421.config.instance);
inst.players = [
  { id: 'A', scoreCode: '8431', scoreRows: null },
  { id: 'B', scoreCode: '8421' },
  { id: 'C', scoreCode: '8421' },
  { id: 'D', scoreCode: '8421' }
];
var oldSnap = rec.jsonClone(row8421.resultSnapshot);
repo.update(trio.g8421.id, row8421.revision, {
  config: Object.assign({}, row8421.config, { instance: inst }),
  resultSnapshot: oldSnap
});
var strokeRev0 = repoRow(trio.gStroke.id).resultRevision;
var matchRev0 = repoRow(trio.gMatch.id).resultRevision;
bind.takeDerivedReplayLog();
bind.attachHost(makeHost());
var log2 = bind.takeDerivedReplayLog();
assert(
  'REC-2 仅 8421 CURRENT_GAME',
  onlyIds(idsOf(log2, 'CURRENT_GAME'), [trio.g8421.id]) && idsOf(log2, 'ALL_GAMES').length === 0,
  JSON.stringify(log2)
);
assert(
  'REC-2 其他游戏未 replay',
  repoRow(trio.gStroke.id).resultRevision === strokeRev0 &&
    repoRow(trio.gMatch.id).resultRevision === matchRev0
);
bind.takeDerivedReplayLog();
bind.attachHost(makeHost());
assert('REC-2 二次 attach 0 replay', bind.takeDerivedReplayLog().length === 0);

trio = publishTrio();
bind.takeDerivedReplayLog();
bind.attachHost(makeHost());
var log3 = bind.takeDerivedReplayLog();
assert('REC-3 已最新 0 replay', log3.length === 0, JSON.stringify(log3));
bind.attachHost(makeHost());
assert('REC-3 再次 attach 仍 0', bind.takeDerivedReplayLog().length === 0);

trio = publishTrio();
muteNotify(function () {
  hostSession.setHostContext(makeHost(5));
  bind.attachHost(makeHost(5), { skipDerivedRecover: true });
});
var gMatchUi = bind.runPublished(function () {
  return bind.getGame('score', trio.gMatch.id);
});
assert(
  'REC-4 未修补前三者 host 均 stale',
  bind.derivedResultsStale('score', bind.runPublished(function () {
    return bind.getGame('score', trio.g8421.id);
  })) &&
    bind.derivedResultsStale('score', bind.runPublished(function () {
      return bind.getGame('score', trio.gStroke.id);
    })) &&
    bind.derivedResultsStale('score', gMatchUi)
);
var matchRow = repoRow(trio.gMatch.id);
var patchedSnap = rec.jsonClone(matchRow.resultSnapshot);
patchedSnap.hostStructureFp = bind.hostStructureFingerprint('score', gMatchUi);
repo.update(trio.gMatch.id, matchRow.revision, { resultSnapshot: patchedSnap });
bind.takeDerivedReplayLog();
bind.attachHost(makeHost(5));
var log4 = bind.takeDerivedReplayLog();
assert(
  'REC-4 只 replay host stale 的两场',
  onlyIds(idsOf(log4, 'ALL_GAMES'), [trio.g8421.id, trio.gStroke.id]) &&
    idsOf(log4, 'ALL_GAMES').indexOf(trio.gMatch.id) < 0 &&
    idsOf(log4, 'CURRENT_GAME').indexOf(trio.gMatch.id) < 0,
  JSON.stringify(log4)
);

trio = publishTrio();
muteNotify(function () {
  hostSession.setHostContext(makeHost(5));
  bind.attachHost(makeHost(5), { skipDerivedRecover: true });
});
bind.takeDerivedReplayLog();
bind.listPublishedBoard('score', trio.g8421.id);
var log5 = bind.takeDerivedReplayLog();
assert(
  'REC-5 board fallback 仍修正',
  log5.some(function (item) {
    return item.gameId === trio.g8421.id && (item.scope === 'FALLBACK' || item.scope === 'ALL_GAMES');
  }),
  JSON.stringify(log5)
);
assert(
  'REC-5 snapshot PAR=5',
  JSON.parse(repoRow(trio.g8421.id).resultSnapshot.hostStructureFp).pars.A1 === 5
);

console.log('---');
console.log('passed ' + passed + '  failed ' + failed);
if (failed) process.exit(1);
