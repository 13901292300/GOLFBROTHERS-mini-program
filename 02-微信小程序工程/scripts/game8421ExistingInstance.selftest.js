/**
 * 已有 4 人 8421：编辑 8431 必须写回仓库并让旧 resultSnapshot 失效。
 * 运行：node scripts/game8421ExistingInstance.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
global.wx.getStorageSync = global.wx.getStorageSync || function () { return null; };
global.wx.setStorageSync = global.wx.setStorageSync || function () {};
global.wx.showToast = function () {};

var path = require('path');
var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var settingsMod = require('../miniprogram/subpackages/game/utils/localSideGameSettings.js');
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
      return 'g8421e_' + n;
    };
  })()
});
facade.setImplementation(repo);

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

function makeHost() {
  var holeOrder = catalog.HOLES.slice();
  var pars = {};
  holeOrder.forEach(function (h) {
    pars[h] = 4;
  });
  var rel = { A: 7, B: 5, C: 7, D: 5 };
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
      holes[label] = { score: i === 0 ? rel[p.playerId] : rel[p.playerId] };
    });
    official[p.playerId] = { holes: holes };
  });
  return hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: 'm-8421-exist',
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

function boot() {
  var host = makeHost();
  hostSession.clearHostContext();
  hostSession.setHostContext(host);
  bind.attachHost(host);
  bind.discardSetupDraft();
  bind.ensureSetupDraft('score');
  return host;
}

function payload(players) {
  return {
    catalogId: '8421-4',
    name: '4人8421',
    players: players,
    playerOrder: IDS.slice(),
    groupMode: 'fixed',
    holes: catalog.HOLES.map(function (label, i) {
      return { label: label, on: i === 0 };
    }),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    defaultScoreCode: '8421',
    ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('8421-4'), {
      catalogId: '8421-4',
      scoreCode: '8421',
      pushRule: 'tie',
      baoNeg: 'none',
      reward: 'none',
      deductMode: 'on',
      deductWay: 'plus-n',
      deductPlusN: 4
    })
  };
}

function hole0(board) {
  var row = board.holes && board.holes[0];
  var out = {};
  IDS.forEach(function (id, i) {
    out[id] = row && row.cells && row.cells[i] ? row.cells[i].raw : null;
  });
  return out;
}

function playerOf(game, id) {
  return ((game && game.players) || []).find(function (p) {
    return String(p.id) === String(id);
  });
}

boot();
var createdOld = bind.addGame(
  'score',
  payload([
    { id: 'A', scoreRows: staleRows },
    { id: 'B', scoreCode: '8421' },
    { id: 'C', scoreCode: '8421' },
    { id: 'D', scoreCode: '8421' }
  ])
);
var committedOld = bind.commitSetupDraft('score');
assert('E1 旧实例已提交', !!(createdOld && createdOld.id && committedOld && committedOld.ok));

var oldBoard = bind.listPublishedBoard('score', createdOld.id);
var oldHole = hole0(oldBoard);
assert(
  'E1 旧实例当前 ±2',
  oldHole.A === 2 && oldHole.B === 2 && oldHole.C === -2 && oldHole.D === -2,
  JSON.stringify(oldHole)
);

bind.ensureSetupDraft('score');
var edited = bind.persistLivePlayerScores('score', createdOld.id, [
  { id: 'A', scoreCode: '8431', scoreRows: null },
  { id: 'B', scoreCode: '8421' },
  { id: 'C', scoreCode: '8421' },
  { id: 'D', scoreCode: '8421' }
]);
assert('E1 save 返回游戏', !!(edited && edited.id));

bind.discardSetupDraft();
var reloaded = bind.runPublished(function () {
  return bind.getGame('score', createdOld.id);
});
var aReloaded = playerOf(reloaded, 'A');
assert(
  'E1 reload A.scoreCode=8431',
  aReloaded && String(aReloaded.scoreCode) === '8431',
  JSON.stringify(aReloaded && { scoreCode: aReloaded.scoreCode, scoreRows: aReloaded.scoreRows })
);
assert(
  'E1 reload A.scoreRows=null',
  !aReloaded.scoreRows,
  JSON.stringify(aReloaded && aReloaded.scoreRows)
);

var afterBoard = bind.listPublishedBoard('score', createdOld.id);
var afterHole = hole0(afterBoard);
assert(
  'E1 编辑后 fresh 0/0/0/0',
  afterHole.A === 0 && afterHole.B === 0 && afterHole.C === 0 && afterHole.D === 0,
  JSON.stringify(afterHole)
);
assert(
  'E1 零和',
  core.round1(afterHole.A + afterHole.B + afterHole.C + afterHole.D) === 0
);

boot();
var createdSnap = bind.addGame(
  'score',
  payload([
    { id: 'A', scoreRows: staleRows },
    { id: 'B', scoreCode: '8421' },
    { id: 'C', scoreCode: '8421' },
    { id: 'D', scoreCode: '8421' }
  ])
);
bind.commitSetupDraft('score');
var snapBoard = bind.listPublishedBoard('score', createdSnap.id);
assert('E2 先有旧 ±2 snapshot', hole0(snapBoard).A === 2);

var frozen = bind.getGame('score', createdSnap.id);
frozen.status = 'ended';
frozen.holeResults = JSON.parse(JSON.stringify(snapBoard && { byHole: {} }));
var gotRow = repo.getById(createdSnap.id);
if (gotRow.ok) {
  frozen.holeResults = gotRow.data.resultSnapshot;
  frozen.status = 'ended';
}
bind.ensureSetupDraft('score');
bind.persistLivePlayerScores('score', createdSnap.id, [
  { id: 'A', scoreCode: '8431', scoreRows: null },
  { id: 'B', scoreCode: '8421' },
  { id: 'C', scoreCode: '8421' },
  { id: 'D', scoreCode: '8421' }
]);
var endedView = bind.runPublished(function () {
  var g = bind.getGame('score', createdSnap.id);
  g.status = 'ended';
  return g;
});
bind.refreshGameResults && bind.refreshGameResults('score', endedView);
var e2board = bind.listPublishedBoard('score', createdSnap.id);
var e2hole = hole0(e2board);
assert(
  'E2 改 8431 后 listBoard 不得继续 ±2',
  !(e2hole.A === 2 && e2hole.C === -2),
  JSON.stringify(e2hole)
);
assert(
  'E2 fresh 为 0',
  e2hole.A === 0 && e2hole.B === 0 && e2hole.C === 0 && e2hole.D === 0,
  JSON.stringify(e2hole)
);

boot();
var createdNew = bind.addGame(
  'score',
  payload([
    { id: 'A', scoreCode: '8431', scoreRows: null },
    { id: 'B', scoreCode: '8421' },
    { id: 'C', scoreCode: '8421' },
    { id: 'D', scoreCode: '8421' }
  ])
);
bind.commitSetupDraft('score');
var e3 = hole0(bind.listPublishedBoard('score', createdNew.id));
assert(
  'E3 新实例 A=8431 为 0/0/0/0',
  e3.A === 0 && e3.B === 0 && e3.C === 0 && e3.D === 0,
  JSON.stringify(e3)
);
assert('E3 零和', core.round1(e3.A + e3.B + e3.C + e3.D) === 0);

console.log('---');
console.log('passed ' + passed + '  failed ' + failed);
if (failed) process.exit(1);
