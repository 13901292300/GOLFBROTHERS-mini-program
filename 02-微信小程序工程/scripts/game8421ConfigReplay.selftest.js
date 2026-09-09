/**
 * 8421 配置变更后必须整场顺序 replay，整体覆盖 derived holeResults。
 * 运行：node scripts/game8421ConfigReplay.selftest.js
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
      return 'g8421r_' + n;
    };
  })()
});
facade.setImplementation(repo);

function makeHost(strokeMap) {
  var holeOrder = catalog.HOLES.slice();
  var pars = {};
  holeOrder.forEach(function (h) {
    pars[h] = 4;
  });
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
  players.forEach(function (p) {
    var holes = {};
    holeOrder.forEach(function (label, i) {
      var relMap = strokeMap && strokeMap[label];
      var rel = relMap && relMap[p.playerId] != null ? relMap[p.playerId] : 3;
      if (p.playerId === 'B' || p.playerId === 'D') {
        if (!relMap) rel = 1;
      }
      holes[label] = { score: 4 + Number(rel) };
    });
    official[p.playerId] = { holes: holes };
  });
  return hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: 'm-8421-replay',
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

function boot(strokeMap) {
  var host = makeHost(strokeMap);
  hostSession.clearHostContext();
  hostSession.setHostContext(host);
  bind.attachHost(host);
  bind.discardSetupDraft();
  bind.ensureSetupDraft('score');
  return host;
}

function oldPlayers() {
  return [
    { id: 'A', scoreCode: '', scoreRows: staleRows },
    { id: 'B', scoreCode: '8421' },
    { id: 'C', scoreCode: '8421' },
    { id: 'D', scoreCode: '8421' }
  ];
}

function codePlayers(code) {
  return IDS.map(function (id) {
    return { id: id, scoreCode: code };
  });
}

function payload(players, extra) {
  extra = extra || {};
  var onCount = extra.onCount == null ? 2 : extra.onCount;
  return {
    catalogId: '8421-4',
    name: '4人8421',
    players: players,
    playerOrder: IDS.slice(),
    groupMode: extra.groupMode || 'fixed',
    holes: catalog.HOLES.map(function (label, i) {
      return { label: label, on: i < onCount };
    }),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    defaultScoreCode: '8421',
    ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('8421-4'), {
      catalogId: '8421-4',
      scoreCode: '8421',
      pushRule: extra.pushRule || 'tie',
      baoNeg: 'none',
      reward: 'none',
      meatEatMode: extra.meatEatMode || 'piece',
      meatValueType: 'fixed',
      meatValueN: 1,
      meatRows: ['le-2', 'm1', 'par', 'p1', 'ge-2'].map(function (id) {
        return { id: id, value: '1' };
      }),
      deductMode: extra.deductMode || 'on',
      deductWay: 'plus-n',
      deductPlusN: extra.deductPlusN != null ? extra.deductPlusN : 4,
      deductCap: extra.deductCap || 'none',
      deductCapN: extra.deductCapN != null ? extra.deductCapN : 3
    })
  };
}

function holeN(board, i) {
  var row = board.holes && board.holes[i];
  var out = {};
  IDS.forEach(function (id, pi) {
    out[id] = row && row.cells && row.cells[pi] ? row.cells[pi].raw : null;
  });
  return out;
}

function repoRow(id) {
  var got = repo.getById(id);
  return got.ok ? got.data : null;
}

function byHole(id) {
  var row = repoRow(id);
  return (row && row.resultSnapshot && row.resultSnapshot.byHole) || {};
}

function publish(players, extra) {
  bind.discardSetupDraft();
  bind.ensureSetupDraft('score');
  var created = bind.addGame('score', payload(players, extra));
  var committed = bind.commitSetupDraft('score');
  return { id: created && created.id, committed: committed };
}

function savePlayers(id, players) {
  bind.ensureSetupDraft('score');
  var rev = repoRow(id).revision;
  return bind.persistLivePlayerScores('score', id, players, { expectedRevision: rev });
}

function savePatch(id, patch) {
  bind.ensureSetupDraft('score');
  var rev = repoRow(id).revision;
  return bind.updateGame('score', id, patch, { expectedRevision: rev });
}

function sameLedger(a, b) {
  return IDS.every(function (id) {
    return Number(a && a[id]) === Number(b && b[id]);
  });
}

var hostKeep = boot();
var r1 = publish(oldPlayers(), { onCount: 2 });
assert('R1 已发布', !!(r1.id && r1.committed && r1.committed.ok));
var r1board0 = bind.listPublishedBoard('score', r1.id);
var h1 = holeN(r1board0, 0);
var h2 = holeN(r1board0, 1);
assert('R1 H0 hole1 ±2', h1.A === 2 && h1.B === 2 && h1.C === -2 && h1.D === -2, JSON.stringify(h1));
assert('R1 H0 hole2 ±2', h2.A === 2 && h2.C === -2, JSON.stringify(h2));

var snap0 = byHole(r1.id);
snap0.holeX = { A: 99, B: 99, C: -99, D: -99, __pot__: 0 };
repo.update(r1.id, repoRow(r1.id).revision, { resultSnapshot: Object.assign({}, repoRow(r1.id).resultSnapshot, { byHole: snap0 }) });
assert('R5 注入 holeX 残留', !!(byHole(r1.id).holeX && byHole(r1.id).holeX.A === 99));

var saved = savePlayers(r1.id, [
  { id: 'A', scoreCode: '8431', scoreRows: null },
  { id: 'B', scoreCode: '8421' },
  { id: 'C', scoreCode: '8421' },
  { id: 'D', scoreCode: '8421' }
]);
assert('R1 保存 8431', saved && !saved.__fail, JSON.stringify(saved && saved.reason));

var r1after = bind.listPublishedBoard('score', r1.id);
var a1 = holeN(r1after, 0);
var a2 = holeN(r1after, 1);
assert('R1 hole1 = 0', a1.A === 0 && a1.B === 0 && a1.C === 0 && a1.D === 0, JSON.stringify(a1));
assert('R1 hole2 = 0', a2.A === 0 && a2.B === 0 && a2.C === 0 && a2.D === 0, JSON.stringify(a2));
assert('R1 不得 hole1±2 hole2=0', !(a1.A === 2 && a2.A === 0));
var snap1 = byHole(r1.id);
assert('R5 holeX 不得残留', !snap1.holeX, JSON.stringify(Object.keys(snap1)));
assert('R5 replace 含 A1', !!snap1.A1);
assert('R1 原始成绩仍在 host', !!(hostKeep && hostKeep.officialScoresByPartyId && hostKeep.officialScoresByPartyId.A.holes.A1.score === 7));

boot();
var r2 = publish(oldPlayers(), { onCount: 2, groupMode: 'fixed' });
bind.listPublishedBoard('score', r2.id);
var beforePair = holeN(bind.listPublishedBoard('score', r2.id), 0);
assert('R2 初始 AB/CD ±2', beforePair.A === 2 && beforePair.B === 2 && beforePair.C === -2, JSON.stringify(beforePair));
var patched = savePatch(r2.id, { groupMode: 'random' });
assert('R2 改分边保存', patched && !patched.__fail, JSON.stringify(patched && patched.reason));
var afterPair = holeN(bind.listPublishedBoard('score', r2.id), 0);
var afterPair2 = holeN(bind.listPublishedBoard('score', r2.id), 1);
assert('R2 hole1 按 AD/BC', afterPair.A === 2 && afterPair.D === 2 && afterPair.B === -2 && afterPair.C === -2, JSON.stringify(afterPair));
assert('R2 hole2 同步', sameLedger(afterPair, afterPair2), JSON.stringify(afterPair2));
assert('R2 不是只改下一洞', afterPair.B === -2 && afterPair2.B === -2);

var deductStrokes = {};
catalog.HOLES.forEach(function (label, i) {
  if (i > 1) return;
  deductStrokes[label] = { A: 6, B: 6, C: 1, D: 1 };
});
boot(deductStrokes);
var r3 = publish(codePlayers('8421'), { onCount: 2, deductCap: 'none' });
var cap0 = holeN(bind.listPublishedBoard('score', r3.id), 0);
var cap0b = holeN(bind.listPublishedBoard('score', r3.id), 1);
assert('R3 两洞都有结果', cap0.A != null && cap0b.A != null, JSON.stringify({ cap0: cap0, cap0b: cap0b }));
var game3 = bind.runPublished(function () {
  return bind.getGame('score', r3.id);
});
game3.ruleSnapshot = rec.mergeRuleSnapshot(game3.ruleSnapshot, { deductCap: 'cap', deductCapN: 1 });
var capSave = savePatch(r3.id, { ruleSnapshot: game3.ruleSnapshot });
assert('R3 改 cap 保存', capSave && !capSave.__fail, JSON.stringify(capSave && capSave.reason));
var cap1 = holeN(bind.listPublishedBoard('score', r3.id), 0);
var cap1b = holeN(bind.listPublishedBoard('score', r3.id), 1);
assert('R3 两洞同步变化', JSON.stringify(cap1) === JSON.stringify(cap1b), JSON.stringify({ cap1: cap1, cap1b: cap1b }));
assert('R3 结果相对 cap 前变化', JSON.stringify(cap1) !== JSON.stringify(cap0), JSON.stringify({ before: cap0, after: cap1 }));

var meatStrokes = {
  A1: { A: 0, B: 0, C: 0, D: 0 },
  A2: { A: 0, B: 0, C: 0, D: 0 },
  A3: { A: 1, B: 1, C: 3, D: 3 }
};
boot(meatStrokes);
var r4 = publish(codePlayers('8421'), { onCount: 3, meatEatMode: 'piece', pushRule: 'tie' });
bind.listPublishedBoard('score', r4.id);
var g4 = bind.runPublished(function () {
  return bind.getGame('score', r4.id);
});
g4.ruleSnapshot = rec.mergeRuleSnapshot(g4.ruleSnapshot, { meatEatMode: 'all-double' });
var meatSave = savePatch(r4.id, { ruleSnapshot: g4.ruleSnapshot });
assert('R4 改肉保存', meatSave && !meatSave.__fail, JSON.stringify(meatSave && meatSave.reason));
bind.listPublishedBoard('score', r4.id);
var persisted = byHole(r4.id);
var freshGame = bind.runPublished(function () {
  return bind.getGame('score', r4.id);
});
freshGame.holeResults = null;
var engineFresh = settle4.settle(freshGame, {
  holeOrder: catalog.HOLES.slice(),
  pars: catalog.defaultHolePars(),
  windOn: false,
  scores: {
    A1: { A: 0, B: 0, C: 0, D: 0 },
    A2: { A: 0, B: 0, C: 0, D: 0 },
    A3: { A: 1, B: 1, C: 3, D: 3 }
  }
});
assert('R4 A1 与空状态 replay 一致', sameLedger(persisted.A1, engineFresh.byHole.A1), JSON.stringify({ repo: persisted.A1, fresh: engineFresh.byHole.A1 }));
assert('R4 A2 与空状态 replay 一致', sameLedger(persisted.A2, engineFresh.byHole.A2), JSON.stringify({ repo: persisted.A2, fresh: engineFresh.byHole.A2 }));
assert('R4 A3 与空状态 replay 一致', sameLedger(persisted.A3, engineFresh.byHole.A3), JSON.stringify({ repo: persisted.A3, fresh: engineFresh.byHole.A3 }));

console.log('---');
console.log('passed ' + passed + '  failed ' + failed);
if (failed) process.exit(1);
