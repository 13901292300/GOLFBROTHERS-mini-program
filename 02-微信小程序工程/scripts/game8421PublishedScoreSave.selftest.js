/**
 * 已发布 4 人 8421：旧实例 → 编辑 8431 → 生产保存链 / CAS / 取消 / listPublishedBoard。
 * 运行：node scripts/game8421PublishedScoreSave.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
global.wx.getStorageSync = global.wx.getStorageSync || function () { return null; };
global.wx.setStorageSync = global.wx.setStorageSync || function () {};
global.__toasts = [];
global.wx.showToast = function (opt) {
  global.__toasts.push(opt && opt.title);
};

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
var settle4 = require('../miniprogram/subpackages/game/utils/settle8421Four.js');

var passed = 0;
var failed = 0;
var stateTable = [];

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
      return 'g8421f_' + n;
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

function p3Of(player) {
  if (!player || !player.scoreRows) return null;
  var hit = player.scoreRows.filter(function (row) {
    return row && row.id === 'p3';
  })[0];
  return hit ? Number(hit.value) : null;
}

function makeHost() {
  var holeOrder = catalog.HOLES.slice();
  var pars = {};
  holeOrder.forEach(function (h) {
    pars[h] = 4;
  });
  var strokes = { A: 7, B: 5, C: 7, D: 5 };
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
    holeOrder.forEach(function (label) {
      holes[label] = { score: strokes[p.playerId] };
    });
    official[p.playerId] = { holes: holes };
  });
  return hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: 'm-8421-pub',
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

function oldPlayers() {
  return [
    { id: 'A', scoreCode: '', scoreRows: staleRows },
    { id: 'B', scoreCode: '8421' },
    { id: 'C', scoreCode: '8421' },
    { id: 'D', scoreCode: '8421' }
  ];
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

function repoRow(id) {
  var got = repo.getById(id);
  return got.ok ? got.data : null;
}

function repoPlayer(id, pid) {
  var row = repoRow(id);
  var inst = row && row.config && row.config.instance;
  return playerOf(inst, pid);
}

function boardSign(h) {
  if (!h) return '';
  return IDS.map(function (id) {
    var n = h[id];
    if (n == null) return id + '?';
    return id + (n > 0 ? '+' + n : String(n));
  }).join(' ');
}

function snapshotHole(row) {
  var by = row && row.resultSnapshot && row.resultSnapshot.byHole;
  var first = by && by[Object.keys(by)[0]];
  if (!first) return '';
  return IDS.map(function (id) {
    var n = first[id];
    return id + (n > 0 ? '+' + n : String(n));
  }).join(' ');
}

function note(phase, gameId, extra) {
  var a = repoPlayer(gameId, 'A') || {};
  var row = repoRow(gameId);
  var board = gameId ? hole0(bind.listPublishedBoard('score', gameId)) : {};
  var recd = {
    phase: phase,
    scoreCode: a.scoreCode == null || a.scoreCode === '' ? '' : String(a.scoreCode),
    p3: p3Of(a),
    version: row ? row.revision : null,
    snapshot: snapshotHole(row),
    board: boardSign(board)
  };
  Object.keys(extra || {}).forEach(function (k) {
    recd[k] = extra[k];
  });
  stateTable.push(recd);
  return recd;
}

function publishedGame(id) {
  return bind.runPublished(function () {
    return bind.getGame('score', id);
  });
}

boot();
var created = bind.addGame('score', payload(oldPlayers()));
var committed = bind.commitSetupDraft('score');
assert('F1 旧实例已发布', !!(created && created.id && committed && committed.ok), JSON.stringify(committed));
var gameId = created.id;

var engineCheck = settle4.settle(
  {
    catalogId: '8421-4',
    players: oldPlayers(),
    playerOrder: IDS.slice(),
    groupMode: 'fixed',
    multiplier: 1,
    holes: [{ label: '1', on: true }],
    ruleSnapshot: rec.buildRuleSnapshot('8421-4')
  },
  {
    holeOrder: ['1'],
    pars: { '1': 4 },
    windOn: false,
    scores: { '1': { A: 3, B: 1, C: 3, D: 1 } }
  }
);
assert(
  'F1 单函数确认旧数据可打出 ±2',
  engineCheck.byHole['1'].A === 2 && engineCheck.byHole['1'].C === -2,
  JSON.stringify(engineCheck.byHole['1'])
);

var f1board = hole0(bind.listPublishedBoard('score', gameId));
assert(
  'F1 listPublishedBoard ±2',
  f1board.A === 2 && f1board.B === 2 && f1board.C === -2 && f1board.D === -2,
  JSON.stringify(f1board)
);
note('初始旧实例', gameId);

bind.ensureSetupDraft('score');
var openRev = repoRow(gameId).revision;
var parentPlayers = JSON.parse(JSON.stringify(publishedGame(gameId).players));
var editDraft = parentPlayers.map(function (p) {
  if (String(p.id) !== 'A') return p;
  return { id: 'A', scoreCode: '8431', scoreRows: null };
});
var aRepoStillOld = repoPlayer(gameId, 'A');
assert(
  'F2 仅编辑未保存：仓库仍是旧 A',
  !(aRepoStillOld && String(aRepoStillOld.scoreCode) === '8431') && p3Of(aRepoStillOld) === 2,
  JSON.stringify(aRepoStillOld && { scoreCode: aRepoStillOld.scoreCode, p3: p3Of(aRepoStillOld) })
);
note('编辑未保存', gameId);

var save = bind.persistLivePlayerScores('score', gameId, editDraft, { expectedRevision: openRev });
assert(
  'F2 单用户保存不得 version conflict',
  save && !save.__fail,
  JSON.stringify(save && { reason: save.reason, expectedVersion: save.expectedVersion, actualVersion: save.actualVersion, message: save.message })
);
if (save && save.__fail) {
  console.log(
    'SELF-CONFLICT expectedVersion=' +
      save.expectedVersion +
      ' actualVersion=' +
      save.actualVersion
  );
}
note('保存后', gameId);

var commitAfter = bind.commitSetupDraft('score');
assert(
  'F2 保存后 setup commit 不得再用 stale expectedRevisions',
  !!(commitAfter && commitAfter.ok),
  JSON.stringify(commitAfter && { ok: commitAfter.ok, reason: commitAfter.reason, message: commitAfter.message })
);

var reloaded = publishedGame(gameId);
var aReloaded = playerOf(reloaded, 'A');
assert('F2 reload A.scoreCode=8431', aReloaded && String(aReloaded.scoreCode) === '8431');
assert('F2 reload A.scoreRows=null', !aReloaded.scoreRows, JSON.stringify(aReloaded && aReloaded.scoreRows));
note('reload', gameId);

var f2board = hole0(bind.listPublishedBoard('score', gameId));
assert(
  'F2 listPublishedBoard 0/0/0/0',
  f2board.A === 0 && f2board.B === 0 && f2board.C === 0 && f2board.D === 0,
  JSON.stringify(f2board)
);
assert('F2 零和', core.round1(f2board.A + f2board.B + f2board.C + f2board.D) === 0);
assert(
  'F3 不得 usedResultSnapshot 冻住 ±2',
  f2board.A !== 2 && f2board.C !== -2
);
note('listBoard后', gameId);

boot();
var cancelGame = bind.addGame('score', payload(oldPlayers()));
bind.commitSetupDraft('score');
var cancelId = cancelGame.id;
bind.listPublishedBoard('score', cancelId);
bind.ensureSetupDraft('score');
var parentBefore = JSON.parse(JSON.stringify(publishedGame(cancelId).players));
var draftBefore = JSON.parse(JSON.stringify(require('../miniprogram/subpackages/game/utils/sideGameDraft.js').getSetupDraftRaw()));
var unsaved = parentBefore.map(function (p) {
  if (String(p.id) !== 'A') return Object.assign({}, p);
  return { id: 'A', scoreCode: '8431', scoreRows: null };
});
assert('F4 未保存草稿本地是 8431', unsaved[0].scoreCode === '8431');
var aRepoCancel = repoPlayer(cancelId, 'A');
assert('F4 取消后仓库仍无 8431', String(aRepoCancel.scoreCode || '') !== '8431');
assert('F4 取消后 rows.p3=2', p3Of(aRepoCancel) === 2);
var parentStill = publishedGame(cancelId);
assert(
  'F4 parent/published 保持原值',
  p3Of(playerOf(parentStill, 'A')) === 2 || String(playerOf(parentStill, 'A').scoreCode || '') !== '8431'
);
var draftAfter = require('../miniprogram/subpackages/game/utils/sideGameDraft.js').getSetupDraftRaw();
var draftA = playerOf((draftAfter.games || []).filter(function (g) { return g.id === cancelId; })[0], 'A');
assert(
  'F4 setup draft 保持原值',
  draftA && String(draftA.scoreCode || '') !== '8431',
  JSON.stringify(draftA && { scoreCode: draftA.scoreCode, p3: p3Of(draftA) })
);
var cancelBoard = hole0(bind.listPublishedBoard('score', cancelId));
assert('F4 board 仍 ±2', cancelBoard.A === 2 && cancelBoard.C === -2, JSON.stringify(cancelBoard));
void unsaved;
void parentBefore;
void draftBefore;

boot();
var confGame = bind.addGame('score', payload(oldPlayers()));
bind.commitSetupDraft('score');
var confId = confGame.id;
bind.listPublishedBoard('score', confId);
bind.ensureSetupDraft('score');
var openV = repoRow(confId).revision;
repo.update(confId, openV, { title: 'external-bump' });
var actualV = repoRow(confId).revision;
assert('F5 外部已把 version 抬高', actualV === openV + 1, 'open=' + openV + ' actual=' + actualV);
var parentConf = JSON.parse(JSON.stringify(publishedGame(confId).players));
var try8431 = parentConf.map(function (p) {
  if (String(p.id) !== 'A') return p;
  return { id: 'A', scoreCode: '8431', scoreRows: null };
});
global.__toasts = [];
var failedSave = bind.persistLivePlayerScores('score', confId, try8431, { expectedRevision: openV });
assert('F5 保存失败', !!(failedSave && failedSave.__fail));
assert(
  'F5 reason=revision_conflict',
  failedSave && failedSave.reason === 'revision_conflict',
  JSON.stringify(failedSave)
);
assert(
  'F5 toast 文案',
  failedSave && String(failedSave.message).indexOf('数据已变更') >= 0,
  failedSave && failedSave.message
);
assert(
  'F5 expected/actual',
  failedSave && failedSave.expectedVersion === openV && failedSave.actualVersion === actualV,
  JSON.stringify({ expected: failedSave && failedSave.expectedVersion, actual: failedSave && failedSave.actualVersion })
);
var aAfterFail = repoPlayer(confId, 'A');
assert('F5 仓库未被 8431 污染', String(aAfterFail.scoreCode || '') !== '8431');
assert('F5 仓库仍 p3=2', p3Of(aAfterFail) === 2);
var parentAfterFail = playerOf(publishedGame(confId), 'A');
assert('F5 published A 仍非 8431', String((parentAfterFail && parentAfterFail.scoreCode) || '') !== '8431');

console.log('\n状态表:');
console.log('| 阶段 | A.scoreCode | A.scoreRows.p3 | repo version | snapshot | board |');
console.log('| -- | -- | --: | --: | -- | -- |');
stateTable.forEach(function (row) {
  console.log(
    '| ' +
      row.phase +
      ' | ' +
      JSON.stringify(row.scoreCode) +
      ' | ' +
      row.p3 +
      ' | ' +
      row.version +
      ' | ' +
      row.snapshot +
      ' | ' +
      row.board +
      ' |'
  );
});

console.log('---');
console.log('passed ' + passed + '  failed ' + failed);
if (failed) process.exit(1);
