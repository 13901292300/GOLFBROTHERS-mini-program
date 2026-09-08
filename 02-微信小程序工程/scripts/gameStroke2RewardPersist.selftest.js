/**
 * stroke-2：无 reward / reward:none 必须能建档并结算；reload 后 reward 仍在。
 * 运行：node scripts/gameStroke2RewardPersist.selftest.js
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

identity.setImplementation({
  implementation: 'test',
  getCurrentUserId: function () {
    return 'tester';
  }
});
var store = memStorage();
var repo = localMod.createLocalSideGameRepository({
  storage: store,
  settingsApi: settingsMod.createLocalSideGameSettings({ storage: memStorage() }),
  idGen: (function () {
    var n = 0;
    return function () {
      n += 1;
      return 'st2rw_' + n;
    };
  })()
});
facade.setImplementation(repo);

assert(
  'ensure 缺 reward → none',
  rec.ensureStrokePlayReward('stroke-2', rec.buildRuleSnapshot('stroke-2')).reward === 'none'
);
assert(
  'ensure none 保持',
  rec.ensureStrokePlayReward('stroke-2', { catalogId: 'stroke-2', reward: 'none' }).reward === 'none'
);
assert(
  'ensure mul 保持',
  rec.ensureStrokePlayReward('stroke-2', { catalogId: 'stroke-2', reward: 'mul' }).reward === 'mul'
);

function makeHost4() {
  var ids = ['A', 'B', 'C', 'D'];
  var holeOrder = ['A1'];
  var pars = { A1: 4 };
  var rel = { A: 0, B: 1, C: -1, D: 2 };
  var official = {};
  ids.forEach(function (id) {
    official[id] = { holes: { A1: { score: 4 + rel[id] } } };
  });
  return hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: 'm-st2-rw',
      groupId: 'g1',
      scope: 'group',
      revision: 'r1',
      holeContextReady: true,
      holeOrder: holeOrder,
      pars: pars,
      allowBigPot: true,
      players: ids.map(function (id) {
        return { playerId: id, groupId: 'g1' };
      }),
      scoreParties: ids.map(function (id) {
        return { partyId: id, partyType: 'player', memberPlayerIds: [id], groupId: 'g1' };
      }),
      officialScoresByPartyId: official
    })
  );
}

function pairingsOf(ids, offIds) {
  var skip = {};
  (offIds || []).forEach(function (k) {
    skip[k] = true;
  });
  return catalog.listAllPairsOneVsOne(ids).map(function (p) {
    var key = p.leftId + '-' + p.rightId;
    return {
      id: p.id,
      leftId: p.leftId,
      rightId: p.rightId,
      on: !skip[key],
      strokes: 0
    };
  });
}

function boot() {
  var host = makeHost4();
  hostSession.clearHostContext();
  hostSession.setHostContext(host);
  bind.attachHost(host);
  bind.discardSetupDraft();
  bind.ensureSetupDraft('score');
  global.__lastToast = '';
  return host;
}

function createStroke(snap, extra) {
  extra = extra || {};
  boot();
  var ids = ['A', 'B', 'C', 'D'];
  var created = bind.addGame('score', {
    catalogId: 'stroke-2',
    name: '比杆4人',
    ruleLibId: extra.ruleLibId || 'lib-stroke-none',
    players: ids.map(function (id) {
      return { id: id };
    }),
    pairings: extra.pairings || pairingsOf(ids),
    holes: [{ label: 'A1', on: true }],
    holeOrder: ['A1'],
    multiplier: 1,
    ruleSnapshot: snap
  });
  var committed = bind.commitSetupDraft('score');
  return { created: created, committed: committed };
}

function boardCell(board, holeIndex, playerIndex) {
  var holeRow = board.holes && board.holes[holeIndex];
  return holeRow && holeRow.cells && holeRow.cells[playerIndex];
}

var capOnly = rec.buildRuleSnapshot('stroke-2');
assert('capability 快照无 reward', capOnly.reward == null);

var r1 = createStroke(capOnly);
assert('R1 创建 PASS', r1.created && !r1.created.__fail && r1.committed && r1.committed.ok);
assert(
  'R1 persisted reward=none',
  r1.created.ruleSnapshot && r1.created.ruleSnapshot.reward === 'none',
  JSON.stringify(r1.created.ruleSnapshot)
);
global.__lastToast = '';
var board1 = bind.listBoard('score', r1.created.id);
assert(
  'R1 settle 有结果且无未写入 toast',
  boardCell(board1, 0, 0) &&
    boardCell(board1, 0, 0).raw != null &&
    global.__lastToast !== '奖励配置未写入',
  String(global.__lastToast) + ' ' + JSON.stringify(boardCell(board1, 0, 0))
);
assert('R1 6 pairing', (r1.created.pairings || []).filter(function (p) { return p.on !== false; }).length === 6);

var r2 = createStroke(capOnly, { pairings: pairingsOf(['A', 'B', 'C', 'D'], ['A-D', 'B-C']) });
assert('R2 创建 PASS', r2.created && r2.committed && r2.committed.ok);
assert('R2 reward 仍完整', r2.created.ruleSnapshot.reward === 'none');
assert(
  'R2 只存 4 pairing',
  (r2.created.pairings || []).filter(function (p) { return p.on !== false; }).length === 4
);
global.__lastToast = '';
bind.listBoard('score', r2.created.id);
var g2 = bind.getGame('score', r2.created.id);
var hole2 = g2 && g2.holeResults && g2.holeResults.byHole && g2.holeResults.byHole.A1;
assert(
  'R2 settle 不算未选组合且 A 不含 AD',
  hole2 && hole2.A === 0 && global.__lastToast !== '奖励配置未写入',
  JSON.stringify(hole2)
);

var r3 = createStroke({ catalogId: 'stroke-2', reward: 'none' });
assert('R3 reward:none 创建', r3.created && r3.committed.ok);
global.__lastToast = '';
var board3 = bind.listBoard('score', r3.created.id);
assert(
  'R3 不提示未写入且有基础比杆',
  global.__lastToast !== '奖励配置未写入' && boardCell(board3, 0, 0) && boardCell(board3, 0, 0).raw != null
);

var r4 = createStroke(capOnly);
var row = repo.getById(r4.created.id);
assert('R4 storage 有记录', row.ok && row.data && row.data.ruleSnapshot.reward === 'none');
bind.discardSetupDraft();
var reloaded = bind.getGame('score', r4.created.id);
assert(
  'R4 reload reward 仍在',
  reloaded && reloaded.ruleSnapshot && reloaded.ruleSnapshot.reward === 'none'
);
global.__lastToast = '';
var board4 = bind.listBoard('score', r4.created.id);
assert(
  'R4 reload 后 settle 正常',
  boardCell(board4, 0, 0) && global.__lastToast !== '奖励配置未写入'
);

function makeHost2() {
  return hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: 'm-m2-rw',
      groupId: 'g1',
      scope: 'group',
      revision: 'r1',
      holeContextReady: true,
      holeOrder: ['A1'],
      pars: { A1: 4 },
      allowBigPot: true,
      players: [
        { playerId: 'A', groupId: 'g1' },
        { playerId: 'B', groupId: 'g1' }
      ],
      scoreParties: [
        { partyId: 'A', partyType: 'player', memberPlayerIds: ['A'], groupId: 'g1' },
        { partyId: 'B', partyType: 'player', memberPlayerIds: ['B'], groupId: 'g1' }
      ],
      officialScoresByPartyId: {
        A: { holes: { A1: { score: 4 } } },
        B: { holes: { A1: { score: 5 } } }
      }
    })
  );
}

var hostM = makeHost2();
hostSession.clearHostContext();
hostSession.setHostContext(hostM);
bind.attachHost(hostM);
bind.discardSetupDraft();
bind.ensureSetupDraft('score');
global.__lastToast = '';
var m2 = bind.addGame('score', {
  catalogId: 'match-2',
  name: '比洞',
  ruleLibId: 'lib-match',
  players: [{ id: 'A' }, { id: 'B' }],
  pairings: [{ id: 'A|B', leftId: 'A', rightId: 'B', on: true, strokes: 0 }],
  holes: [{ label: 'A1', on: true }],
  holeOrder: ['A1'],
  multiplier: 1,
  ruleSnapshot: rec.buildRuleSnapshot('match-2')
});
var m2c = bind.commitSetupDraft('score');
assert('R5 match-2 创建', m2 && !m2.__fail && m2c && m2c.ok);
assert('R5 match-2 persisted reward=none', m2.ruleSnapshot && m2.ruleSnapshot.reward === 'none');
global.__lastToast = '';
var boardM = bind.listBoard('score', m2.id);
assert(
  'R5 match-2 无倍率未写入 toast',
  global.__lastToast !== '倍率配置未写入' && global.__lastToast !== '奖励配置未写入',
  String(global.__lastToast)
);
assert('R5 match-2 有结果', !!(boardM && boardM.holes));

assert('R2 子集仍有洞结果', !!(hole2 && hole2.A != null));

console.log('---');
console.log('passed ' + passed + ' failed ' + failed);
if (failed) process.exit(1);
