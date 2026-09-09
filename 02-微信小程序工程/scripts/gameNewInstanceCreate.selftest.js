/**
 * 新建 side-game 首次保存 E2E（config 确认添加 → commit）。
 * 运行：node scripts/gameNewInstanceCreate.selftest.js
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

var fs = require('fs');
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

var passed = 0;
var failed = 0;
var IDS = ['A', 'B', 'C', 'D'];
var MATCH = 'm-newcreate';
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
      return 'gnew_' + n;
    };
  })()
});
facade.setImplementation(repo);

function makeHost() {
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

function boot() {
  MATCH = 'm-newcreate-' + (++matchSeq);
  var host = makeHost();
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

function listed() {
  var out = repo.listVisible({
    matchId: MATCH,
    groupId: 'g1',
    scope: 'group',
    hostContext: makeHost(),
    viewerUserId: 'tester'
  });
  return (out.ok && out.data && out.data.items) || [];
}

function repoRow(id) {
  var got = repo.getById(id);
  return got.ok ? got.data : null;
}

boot();
var strokeDraft = bind.addGame('score', {
  id: 'g-stroke-new',
  catalogId: 'stroke-2',
  name: '比杆',
  players: IDS.map(function (id) {
    return { id: id };
  }),
  playerOrder: IDS.slice(),
  pairings: [{ id: 'ab', leftId: 'A', rightId: 'B', on: true }],
  holes: holesOn(2),
  holeOrder: catalog.HOLES.slice(),
  multiplier: 1,
  ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('stroke-2'), {
    catalogId: 'stroke-2',
    reward: 'none'
  })
});
assert('N1 addGame 不失败', strokeDraft && !strokeDraft.__fail, JSON.stringify(strokeDraft && strokeDraft.reason));
assert('N1 add 后 repo 仍空（仅草稿）', listed().length === 0, String(listed().length));
assert('N3 expectedRevision 缺席', strokeDraft.revision == null || strokeDraft.revision === 1);
var n1commit = bind.commitSetupDraft('score');
assert('N1 commit PASS', n1commit && n1commit.ok, JSON.stringify(n1commit));
assert('N1 repo 仅 1 条', listed().length === 1, String(listed().length));
var n1row = listed()[0];
assert('N1 resultSnapshot', !!(n1row && n1row.resultSnapshot && n1row.resultSnapshot.byHole));
assert('N1 draft id 即 published id', n1row && n1row.sideGameId === 'g-stroke-new');
assert('N1 无幽灵：失败后不应有 row 但本次成功', n1commit.ok);

boot();
var g8421 = bind.addGame('score', {
  id: 'g-8421-new',
  catalogId: '8421-4',
  name: '8421',
  players: [
    { id: 'A', scoreCode: '', scoreRows: staleRows },
    { id: 'B', scoreCode: '8421' },
    { id: 'C', scoreCode: '8421' },
    { id: 'D', scoreCode: '8421' }
  ],
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
assert('N2 add PASS', g8421 && !g8421.__fail, JSON.stringify(g8421 && g8421.reason));
var n2commit = bind.commitSetupDraft('score');
assert('N2 commit PASS', n2commit && n2commit.ok, JSON.stringify(n2commit));
var n2row = repoRow('g-8421-new');
assert('N2 players', !!(n2row && n2row.config && n2row.config.instance && n2row.config.instance.players));
assert('N2 ruleSnapshot', !!(n2row && n2row.ruleSnapshot));
assert('N2 resultSnapshot', !!(n2row && n2row.resultSnapshot && n2row.resultSnapshot.byHole));

boot();
var n3add = bind.addGame('score', {
  id: 'g-n3',
  catalogId: 'stroke-2',
  name: 'n3',
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
var setup3 = require('../miniprogram/subpackages/game/utils/sideGameDraft.js').getSetupDraftRaw();
assert('N3 added 含新 id', setup3 && (setup3.added || []).indexOf('g-n3') >= 0);
assert('N3 不在 updated', setup3 && (setup3.updated || []).indexOf('g-n3') < 0);
assert('N3 expectedRevisions 无旧 CAS', !setup3.expectedRevisions || setup3.expectedRevisions['g-n3'] == null);
var n3commit = bind.commitSetupDraft('score');
assert('N3 无 revision_conflict', n3commit && n3commit.ok && n3commit.reason !== 'revision_conflict', JSON.stringify(n3commit));

boot();
bind.addGame('score', {
  id: 'g-n4',
  catalogId: 'stroke-2',
  name: 'n4',
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
var n4commit = bind.commitSetupDraft('score');
var n4row = repoRow('g-n4');
assert('N4 commit', n4commit && n4commit.ok);
assert('N4 create 后 revision>=1', n4row && Number(n4row.revision) >= 1);
assert('N4 resultRevision>=1', n4row && Number(n4row.resultRevision) >= 1);
assert('N4 snapshot fp', !!(n4row && n4row.resultSnapshot && n4row.resultSnapshot.hostStructureFp));

boot();
var impl = facade.getImplementation();
var origCommit = impl.commitSetupDraft;
impl.commitSetupDraft = function () {
  return { ok: false, reason: 'storage_write_failed', data: null, revision: 0 };
};
bind.addGame('score', {
  id: 'g-n5',
  catalogId: 'stroke-2',
  name: 'n5',
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
var n5commit = bind.commitSetupDraft('score');
impl.commitSetupDraft = origCommit;
assert('N5 commit FAIL', n5commit && !n5commit.ok, JSON.stringify(n5commit));
assert('N5 文案保存失败', !!(n5commit && n5commit.message && String(n5commit.message).indexOf('保存失败') >= 0), n5commit && n5commit.message);
assert('N5 repo 无 row', !repoRow('g-n5'));
assert('N5 listed 空', listed().length === 0);
var setup5 = require('../miniprogram/subpackages/game/utils/sideGameDraft.js').getSetupDraftRaw();
assert('N5 setup 仍在（未当成功清掉）', !!(setup5 && (setup5.added || []).indexOf('g-n5') >= 0));

boot();
bind.addGame('score', {
  id: 'g-n6',
  catalogId: 'stroke-2',
  name: 'n6',
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
global.__gbSideGameReplayFail = true;
var n6commit = bind.commitSetupDraft('score');
global.__gbSideGameReplayFail = false;
assert('N6 create 成功不因 replay 把 UI 打成失败', n6commit && n6commit.ok, JSON.stringify(n6commit));
assert('N6 仅 1 条', listed().length === 1);
assert('N6 无重复', listed().filter(function (r) { return r.sideGameId === 'g-n6'; }).length === 1);
bind.attachHost(makeHost());
var n6after = repoRow('g-n6');
assert('N6 恢复后仍有 snapshot 或可恢复', !!(n6after && n6after.config));

var configJs = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'pages', 'config', 'index.js'),
  'utf8'
);
var listJs = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'pages', 'list', 'index.js'),
  'utf8'
);
assert('N7 config 防重入', configJs.indexOf('_confirmAdding') >= 0);
assert('N7 list 防重入', listJs.indexOf('_setupSaving') >= 0);
assert(
  'persistToSetup 不再用 existingId||id',
  fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils', 'sideGameBind.js'),
    'utf8'
  ).indexOf('persistToSetup(entry, game, existingId || id)') < 0
);

console.log('---');
console.log('passed ' + passed + '  failed ' + failed);
if (failed) process.exit(1);
