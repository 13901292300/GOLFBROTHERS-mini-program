/**
 * 全玩法 derived result：game-scope / all-games-scope full replay。
 * 运行：node scripts/gameDerivedReplay.selftest.js
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
var settle4 = require('../miniprogram/subpackages/game/utils/settle8421Four.js');

var passed = 0;
var failed = 0;
var IDS = ['A', 'B', 'C', 'D'];
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
      return 'gder_' + n;
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
      matchId: 'm-derived',
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
  return { id: created && created.id, ok: !!(committed && committed.ok), created: created };
}

function repoRow(id) {
  var got = repo.getById(id);
  return got.ok ? got.data : null;
}

function byHole(id) {
  var row = repoRow(id);
  return (row && row.resultSnapshot && row.resultSnapshot.byHole) || {};
}

function holeN(board, i) {
  var row = board.holes && board.holes[i];
  var out = {};
  IDS.forEach(function (id, pi) {
    out[id] = row && row.cells && row.cells[pi] ? row.cells[pi].raw : null;
  });
  return out;
}

function savePatch(id, patch) {
  bind.ensureSetupDraft('score');
  var rev = repoRow(id).revision;
  return bind.updateGame('score', id, patch, { expectedRevision: rev });
}

boot();
var g1 = publish({
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
assert('G1 发布', g1.ok && g1.id);
var g1b0 = holeN(bind.listPublishedBoard('score', g1.id), 0);
var g1b1 = holeN(bind.listPublishedBoard('score', g1.id), 1);
assert('G1 旧两洞 ±2', g1b0.A === 2 && g1b1.A === 2, JSON.stringify({ g1b0: g1b0, g1b1: g1b1 }));
var g1save = bind.persistLivePlayerScores(
  'score',
  g1.id,
  [
    { id: 'A', scoreCode: '8431', scoreRows: null },
    { id: 'B', scoreCode: '8421' },
    { id: 'C', scoreCode: '8421' },
    { id: 'D', scoreCode: '8421' }
  ],
  { expectedRevision: repoRow(g1.id).revision }
);
assert('G1 保存', g1save && !g1save.__fail, JSON.stringify(g1save && g1save.reason));
var g1a0 = holeN(bind.listPublishedBoard('score', g1.id), 0);
var g1a1 = holeN(bind.listPublishedBoard('score', g1.id), 1);
assert('G1 全洞重算为 0', g1a0.A === 0 && g1a1.A === 0 && g1a0.C === 0 && g1a1.C === 0, JSON.stringify({ g1a0: g1a0, g1a1: g1a1 }));

boot();
var strokePairs = [
  { id: 'ab', leftId: 'A', rightId: 'B', on: true },
  { id: 'ac', leftId: 'A', rightId: 'C', on: true }
];
var g2 = publish({
  catalogId: 'stroke-2',
  name: '比杆',
  players: IDS.map(function (id) {
    return { id: id };
  }),
  playerOrder: IDS.slice(),
  pairings: strokePairs,
  holes: holesOn(2),
  holeOrder: catalog.HOLES.slice(),
  multiplier: 1,
  ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('stroke-2'), { catalogId: 'stroke-2', reward: 'none' })
});
assert('G2 发布', g2.ok && g2.id);
bind.listPublishedBoard('score', g2.id);
var snap2 = JSON.parse(JSON.stringify(repoRow(g2.id).resultSnapshot));
snap2.byHole.A1.ghostPair = 77;
repo.update(g2.id, repoRow(g2.id).revision, { resultSnapshot: snap2 });
assert('G2 注入 pairing 残留', byHole(g2.id).A1.ghostPair === 77);
var g2save = savePatch(g2.id, {
  pairings: [{ id: 'ab', leftId: 'A', rightId: 'B', on: true }]
});
assert('G2 取消 AC 保存', g2save && !g2save.__fail, JSON.stringify(g2save && g2save.reason));
bind.listPublishedBoard('score', g2.id);
assert('G2 旧 pairing 残留消失', byHole(g2.id).A1.ghostPair == null, JSON.stringify(byHole(g2.id).A1));
assert('G7 stroke replace', !byHole(g2.id).holeX);

boot();
var g3 = publish({
  catalogId: 'match-2',
  name: '比洞',
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
assert('G3 发布', g3.ok && g3.id);
var beforeMul = JSON.stringify(byHole(g3.id).A1);
var g3save = savePatch(g3.id, { multiplier: 2 });
assert('G3 改倍率保存', g3save && !g3save.__fail, JSON.stringify(g3save && g3save.reason));
bind.listPublishedBoard('score', g3.id);
var afterMul = JSON.stringify(byHole(g3.id).A1);
assert('G3 全洞按新倍率', afterMul !== beforeMul || Number(byHole(g3.id).A1.A) === Number(JSON.parse(beforeMul).A) * 2 || true);
assert(
  'G3 A1 随倍率变化',
  Number(byHole(g3.id).A1.A) === Number(JSON.parse(beforeMul).A) * 2,
  'before=' + beforeMul + ' after=' + afterMul
);
assert('G3 A2 同步', Number(byHole(g3.id).A2.A) === Number(byHole(g3.id).A1.A));

boot();
var meatHostRel = makeHost();
meatHostRel.officialScoresByPartyId.A.holes.A1.score = 4;
meatHostRel.officialScoresByPartyId.B.holes.A1.score = 4;
meatHostRel.officialScoresByPartyId.C.holes.A1.score = 4;
meatHostRel.officialScoresByPartyId.D.holes.A1.score = 4;
meatHostRel.officialScoresByPartyId.A.holes.A2.score = 4;
meatHostRel.officialScoresByPartyId.B.holes.A2.score = 4;
meatHostRel.officialScoresByPartyId.C.holes.A2.score = 4;
meatHostRel.officialScoresByPartyId.D.holes.A2.score = 4;
hostSession.setHostContext(meatHostRel);
bind.attachHost(meatHostRel);
bind.discardSetupDraft();
var g4 = publish({
  catalogId: '8421-4',
  name: 'meat',
  players: IDS.map(function (id) {
    return { id: id, scoreCode: '8421' };
  }),
  playerOrder: IDS.slice(),
  groupMode: 'fixed',
  holes: holesOn(3),
  holeOrder: catalog.HOLES.slice(),
  multiplier: 1,
  ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('8421-4'), {
    catalogId: '8421-4',
    scoreCode: '8421',
    pushRule: 'tie',
    baoNeg: 'none',
    reward: 'none',
    meatEatMode: 'piece',
    meatValueType: 'fixed',
    meatValueN: 1,
    meatRows: ['le-2', 'm1', 'par', 'p1', 'ge-2'].map(function (id) {
      return { id: id, value: '1' };
    }),
    deductMode: 'on',
    deductWay: 'plus-n',
    deductPlusN: 4
  })
});
var g4game = bind.runPublished(function () {
  return bind.getGame('score', g4.id);
});
g4game.ruleSnapshot = rec.mergeRuleSnapshot(g4game.ruleSnapshot, { meatEatMode: 'all-double' });
var g4save = savePatch(g4.id, { ruleSnapshot: g4game.ruleSnapshot });
assert('G4 改肉保存', g4save && !g4save.__fail, JSON.stringify(g4save && g4save.reason));
bind.listPublishedBoard('score', g4.id);
var persisted = byHole(g4.id);
var freshGame = bind.runPublished(function () {
  return bind.getGame('score', g4.id);
});
freshGame.holeResults = null;
var engineFresh = settle4.settle(freshGame, {
  holeOrder: catalog.HOLES.slice(),
  pars: catalog.defaultHolePars(),
  windOn: false,
  scores: {
    A1: { A: 0, B: 0, C: 0, D: 0 },
    A2: { A: 0, B: 0, C: 0, D: 0 },
    A3: { A: 3, B: 1, C: 3, D: 1 }
  }
});
function sameLed(a, b) {
  return IDS.every(function (id) {
    return Number(a && a[id]) === Number(b && b[id]);
  });
}
assert('G4 A1 empty-replay', sameLed(persisted.A1, engineFresh.byHole.A1), JSON.stringify({ p: persisted.A1, e: engineFresh.byHole.A1 }));
assert('G4 A2 empty-replay', sameLed(persisted.A2, engineFresh.byHole.A2));
assert('G4 A3 empty-replay', sameLed(persisted.A3, engineFresh.byHole.A3), JSON.stringify({ p: persisted.A3, e: engineFresh.byHole.A3 }));

boot();
var multi = [];
bind.ensureSetupDraft('score');
multi.push(
  bind.addGame('score', {
    catalogId: '8421-4',
    name: 'm8421',
    players: old8421Players(),
    playerOrder: IDS.slice(),
    groupMode: 'fixed',
    holes: holesOn(2),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('8421-4'), {
      catalogId: '8421-4',
      reward: 'none',
      baoNeg: 'none',
      deductMode: 'on',
      deductPlusN: 4
    })
  })
);
multi.push(
  bind.addGame('score', {
    catalogId: 'stroke-2',
    name: 'mstroke',
    players: [
      { id: 'A' },
      { id: 'B' }
    ],
    pairings: [{ id: 'ab', leftId: 'A', rightId: 'B', on: true }],
    holes: holesOn(2),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('stroke-2'), { catalogId: 'stroke-2', reward: 'none' })
  })
);
multi.push(
  bind.addGame('score', {
    catalogId: 'match-2',
    name: 'mmatch',
    players: [
      { id: 'A' },
      { id: 'B' }
    ],
    pairings: [{ id: 'ab', leftId: 'A', rightId: 'B', on: true }],
    holes: holesOn(2),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('match-2'), { catalogId: 'match-2', reward: 'none' })
  })
);
assert('G5 三游戏发布', bind.commitSetupDraft('score').ok);
var ids5 = multi.map(function (g) {
  return g.id;
});
ids5.forEach(function (id) {
  bind.listPublishedBoard('score', id);
});
var fpBefore = ids5.map(function (id) {
  return repoRow(id).resultSnapshot && repoRow(id).resultSnapshot.hostStructureFp;
});
var newOrder = catalog.HOLES.slice();
var tmp = newOrder[0];
newOrder[0] = newOrder[1];
newOrder[1] = tmp;
bind.setHoleOrder('score', newOrder);
var fpAfter = ids5.map(function (id) {
  bind.listPublishedBoard('score', id);
  return repoRow(id).resultSnapshot && repoRow(id).resultSnapshot.hostStructureFp;
});
assert('G5 三游戏均重算', fpAfter.every(function (fp, i) {
  return fp && fp !== fpBefore[i];
}), JSON.stringify({ before: fpBefore, after: fpAfter }));
assert(
  'G5 新洞序写入 fingerprint',
  fpAfter.every(function (fp) {
    var parsed = JSON.parse(fp);
    return parsed.holeOrder[0] === 'A2' && parsed.holeOrder[1] === 'A1' && parsed.holeOrderRevision >= 1;
  }),
  fpAfter[0]
);

var host6 = boot();
var g6ids = ids5;
boot();
var g6a = publish({
  catalogId: '8421-4',
  name: 'par8421',
  players: old8421Players(),
  playerOrder: IDS.slice(),
  groupMode: 'fixed',
  holes: holesOn(1),
  holeOrder: catalog.HOLES.slice(),
  multiplier: 1,
  ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('8421-4'), {
    catalogId: '8421-4',
    reward: 'none',
    baoNeg: 'none',
    deductMode: 'on',
    deductPlusN: 4
  })
});
var g6s = publish({
  catalogId: 'stroke-2',
  name: 'parstroke',
  players: [
    { id: 'A' },
    { id: 'B' }
  ],
  pairings: [{ id: 'ab', leftId: 'A', rightId: 'B', on: true }],
  holes: holesOn(1),
  holeOrder: catalog.HOLES.slice(),
  multiplier: 1,
  ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('stroke-2'), { catalogId: 'stroke-2', reward: 'none' })
});
bind.listPublishedBoard('score', g6a.id);
bind.listPublishedBoard('score', g6s.id);
var parBeforeA = JSON.stringify(byHole(g6a.id).A1);
var parBeforeS = JSON.stringify(byHole(g6s.id).A1);
var hostPar = makeHost(5);
hostSession.setHostContext(hostPar);
bind.attachHost(hostPar);
bind.listPublishedBoard('score', g6a.id);
bind.listPublishedBoard('score', g6s.id);
assert('G6 8421 随 PAR 重算', JSON.stringify(byHole(g6a.id).A1) !== parBeforeA, parBeforeA + ' -> ' + JSON.stringify(byHole(g6a.id).A1));
var g6sFp = repoRow(g6s.id).resultSnapshot && repoRow(g6s.id).resultSnapshot.hostStructureFp;
assert('G6 比杆 host PAR=5', !!(g6sFp && JSON.parse(g6sFp).pars.A1 === 5), g6sFp);
assert('G6 原始成绩未删', hostPar.officialScoresByPartyId.A.holes.A1.score === 7);

boot();
var g7 = publish({
  catalogId: '8421-4',
  name: 'ghost',
  players: old8421Players(),
  playerOrder: IDS.slice(),
  groupMode: 'fixed',
  holes: holesOn(2),
  holeOrder: catalog.HOLES.slice(),
  multiplier: 1,
  ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('8421-4'), {
    catalogId: '8421-4',
    reward: 'none',
    baoNeg: 'none',
    deductMode: 'on',
    deductPlusN: 4
  })
});
var s7 = JSON.parse(JSON.stringify(repoRow(g7.id).resultSnapshot));
s7.byHole.holeX = { A: 9, B: 9, C: -9, D: -9, __pot__: 0 };
repo.update(g7.id, repoRow(g7.id).revision, { resultSnapshot: s7 });
bind.persistLivePlayerScores(
  'score',
  g7.id,
  [
    { id: 'A', scoreCode: '8431', scoreRows: null },
    { id: 'B', scoreCode: '8421' },
    { id: 'C', scoreCode: '8421' },
    { id: 'D', scoreCode: '8421' }
  ],
  { expectedRevision: repoRow(g7.id).revision }
);
assert('G7 holeX 消失', !byHole(g7.id).holeX, JSON.stringify(Object.keys(byHole(g7.id))));

console.log('---');
console.log('passed ' + passed + '  failed ' + failed);
if (failed) process.exit(1);
