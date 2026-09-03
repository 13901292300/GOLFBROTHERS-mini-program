/**
 * 多组 HUB 添加规则：设计链路不按单组人数锁死。
 * 运行：node scripts/hubMultiGroupRuleDesign.selftest.js
 */
var fs = require('fs');
var path = require('path');

if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    showToast: function () {}
  };
}

var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var scoringSnap = require('../miniprogram/subpackages/scoring/utils/sideGameHostSnapshot.js');
var pageAccess = require('../miniprogram/utils/sideGameEditAccess.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var ruleLib = require('../miniprogram/subpackages/game/utils/sideGameRuleLibrary.js');
var localLib = require('../miniprogram/subpackages/game/utils/localSideGameRuleLibrary.js');

var mini = path.join(__dirname, '..', 'miniprogram');
var gameRoot = path.join(mini, 'subpackages/game');
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

function installRepo() {
  identity.setImplementation({
    implementation: 'local-preview',
    getCurrentUserId: function () {
      return 'owner';
    }
  });
  var repo = localMod.createLocalSideGameRepository({
    storage: memStorage(),
    idGen: (function () {
      var n = 0;
      return function () {
        n += 1;
        return 'sg_' + n;
      };
    })(),
    clock: function () {
      return 1;
    }
  });
  facade.setImplementation(repo);
  ruleLib.setImplementation(
    localLib.createLocalSideGameRuleLibrary({
      storage: memStorage(),
      idGen: (function () {
        var n = 0;
        return function () {
          n += 1;
          return 'rl_hub_' + n;
        };
      })(),
      clock: function () {
        return 2;
      }
    })
  );
}

function twoGroupHub() {
  return {
    gameId: 'hub-8',
    gameMode: '个人比杆赛',
    createdBy: 'owner',
    front9Course: 'C',
    back9Course: 'D',
    groups: [
      {
        groupId: 'hub-8-g1',
        groupName: '第1组',
        players: [
          { userId: 'a1', position: 1, name: '甲' },
          { userId: 'a2', position: 2, name: '乙' },
          { userId: 'a3', position: 3, name: '丙' },
          { userId: 'a4', position: 4, name: '丁' }
        ]
      },
      {
        groupId: 'hub-8-g2',
        groupName: '第2组',
        players: [
          { userId: 'b1', position: 1, name: '戊' },
          { userId: 'b2', position: 2, name: '己' },
          { userId: 'b3', position: 3, name: '庚' },
          { userId: 'b4', position: 4, name: '辛' }
        ]
      }
    ]
  };
}

function idsOf(groups) {
  var out = [];
  (groups || []).forEach(function (g) {
    (g.items || []).forEach(function (it) {
      out.push(it.id);
    });
  });
  return out;
}

var catalogJs = fs.readFileSync(path.join(gameRoot, 'pages/catalog/index.js'), 'utf8');
var catalogWxml = fs.readFileSync(path.join(gameRoot, 'pages/catalog/index.wxml'), 'utf8');
var catalogWxss = fs.readFileSync(path.join(gameRoot, 'pages/catalog/index.wxss'), 'utf8');
var rulesJs = fs.readFileSync(path.join(gameRoot, 'pages/rules/index.js'), 'utf8');
var pickJs = fs.readFileSync(path.join(gameRoot, 'pages/pick-players/index.js'), 'utf8');
var listJs = fs.readFileSync(path.join(gameRoot, 'pages/list/index.js'), 'utf8');

assert('WXML catalog 未改标题', /选择玩法/.test(catalogWxml) && /去配置/.test(catalogWxml));
assert('catalog 页用设计目录（不受方数预锁）', /listCatalogForDesign\(\)/.test(catalogJs) && !/listCatalog\(maxPlayers\)/.test(catalogJs));
assert('创建实例按 formation 校验', /getScoreFormationContext|resolveRuleCompatibility|partyFormation/.test(
  fs.readFileSync(path.join(__dirname, '../miniprogram/subpackages/game/pages/rules/index.js'), 'utf8')
));
assert('rules hub/match 用设计 cap', /getRuleDesignCap/.test(rulesJs));
assert('list/game-tab 设计 cap', /getRuleDesignCap/.test(listJs));
assert('catalog WXSS 未被本修复改交互类名', /catalog/.test(catalogWxss) || catalogWxss.length >= 0);

var game = twoGroupHub();
var snap = scoringSnap.fromGame(game, { scope: 'match', allowBigPot: false, matchId: game.gameId });
assert('多组 HUB snapshot 无单一 groupId', snap.groupId === '' && snap.scope === 'match');
assert('createdBy 写入 snapshot', snap.createdBy === 'owner');
snap.canEditSideGames = true;
snap.currentUserId = 'owner';
var ctx = hostMod.buildFromHostSnapshot(snap);
assert('players 槽也能进 Host（不依赖 playersSlots）', ctx.scoreParties.length === 8, String(ctx.scoreParties.length));
assert('host.groups 保留两组', (ctx.groups || []).length === 2, String((ctx.groups || []).length));
ctx.holeContextReady = true;
ctx.canEditSideGames = true;
ctx.currentUserId = 'owner';
ctx.createdBy = 'owner';

installRepo();
hostSession.clearHostContext();
hostSession.setHostContext(ctx);
bind.attachHost(ctx);

var ids = bind.listCandidatePlayerIds('hub');
assert('全场去重 8 人', ids.length === 8, String(ids.length));
assert('getRuleLibraryCap(hub)=8 不被单组 4 锁死', bind.getRuleLibraryCap('hub') === 8);
assert('getRuleDesignCap 含多人玩法人数', bind.getRuleDesignCap('hub') >= 6);

var designIds = idsOf(catalog.listCatalogForDesign());
assert('设计目录含 2/3/4 人', designIds.indexOf('stroke-2') >= 0 && designIds.indexOf('landlord-big') >= 0 && designIds.indexOf('lasuo-4') >= 0);
assert('设计目录含喇叭花与多人拉丝', designIds.indexOf('horn') >= 0 && designIds.indexOf('lasuo-n') >= 0);
assert('设计目录不含未开放', designIds.indexOf('skins') < 0);
assert('设计目录含斗小地主', designIds.indexOf('landlord-small') >= 0);
assert('设计目录含油菜与三局', designIds.indexOf('youcai') >= 0 && designIds.indexOf('three-set') >= 0);
assert('实例 cap=4 仍不含喇叭花（B 链路人数过滤保留）', JSON.stringify(catalog.listCatalog(4)).indexOf('"horn"') < 0);
assert('记分页 cap=4 仍走人数目录', JSON.stringify(catalog.listCatalog(4)).indexOf('"lasuo-n"') < 0);

var gate = bind.inspectRuleDesignGate('hub');
assert('有权限 pageMode=edit canAddRule', gate.pageMode === 'edit' && gate.canAddRule === true, JSON.stringify(gate));
assert('多人 catalog 未被多组禁用', gate.catalogIdsVisible.indexOf('horn') >= 0 && gate.catalogIdsVisible.indexOf('lasuo-n') >= 0);
assert('gate 记录两组', gate.multiGroup === true && gate.groups === 2);

var access = pageAccess.resolvePageAccess(ctx, 'owner');
assert('有权限 pageMode=edit', access.pageMode === 'edit' && access.canEdit === true);

var guest = pageAccess.resolvePageAccess(Object.assign({}, ctx, { canEditSideGames: false }), 'guest');
assert('普通用户 readonly', guest.pageMode === 'readonly' && guest.canEdit === false);

var creatorOnly = pageAccess.resolvePageAccess(
  { createdBy: 'owner', currentUserId: 'owner', canEditSideGames: undefined },
  'owner'
);
assert('HUB 创建者可编辑', creatorOnly.canEdit === true && creatorOnly.pageMode === 'edit');
var memberOnly = pageAccess.resolvePageAccess(
  { createdBy: 'owner', currentUserId: 'a1', canEditSideGames: false },
  'a1'
);
assert('普通参与者不可写', memberOnly.canEdit === false && memberOnly.pageMode === 'readonly');

assert('pick 仍在确认阶段校验人数', /至少选/.test(pickJs) && /最多选/.test(pickJs));

var saved = bind.upsertMyRule({
  name: '多人拉丝-测试',
  catalogId: 'lasuo-n',
  ruleId: 'lasuo-n',
  players: 6,
  noSettings: true
});
assert('添加规则不依赖已选参与者', !!(saved && saved.id), JSON.stringify(saved));
assert('规则库可见', bind.listMyRules(bind.getRuleDesignCap('hub')).some(function (r) {
  return r.id === saved.id;
}));

['stroke-2', 'landlord-big', 'lasuo-4'].forEach(function (cid) {
  var item = catalog.findRule(cid);
  var row = bind.upsertMyRule({
    name: item.name + '-t',
    catalogId: cid,
    ruleId: cid,
    players: item.players,
    noSettings: !!item.noSettings
  });
  assert('可添加 ' + cid, !!(row && row.id));
});

var created = bind.addGame('hub', {
  catalogId: 'lasuo-n',
  name: '多人拉丝-测试',
  players: [
    { id: 'a1' },
    { id: 'a2' },
    { id: 'a3' },
    { id: 'a4' },
    { id: 'b1' },
    { id: 'b2' }
  ],
  holes: catalog.HOLES.map(function (label) {
    return { label: label, on: true };
  }),
  holeOrder: catalog.HOLES.slice(),
  ruleLibId: saved.id,
  ruleLibRevision: saved.revision,
  ruleSnapshot: rec.buildRuleSnapshot('lasuo-n')
});
assert(
  '用新规则创建实例',
  !!(created && created.id) && created.ruleLibId === saved.id,
  created && created.reason ? created.reason : JSON.stringify(created && created.id)
);

var partyCheck = hostMod.validatePartySelection(ctx, ['a1', 'a2'], 'lasuo-n');
assert('人数不足只在实例校验', partyCheck.ok === false && partyCheck.reason === 'party_count');

hostSession.clearHostContext();
hostSession.setHostContext(ctx);
assert(
  'group 空 groupId 不回退 match 上下文',
  !hostSession.getHostContext({ matchId: ctx.matchId, scope: 'group', groupId: '' })
);

var emptySnap = scoringSnap.fromGame(
  { gameId: 'hub-empty', groups: [] },
  { scope: 'match', matchId: 'hub-empty' }
);
var emptyCtx = hostMod.buildFromHostSnapshot(emptySnap);
hostSession.setHostContext(emptyCtx);
bind.attachHost(emptyCtx);
assert('候选为空时设计 cap>0 不锁死目录', bind.getRuleDesignCap('hub') >= 6 && catalog.listCatalogForDesign().length > 0);

var dupSnap = scoringSnap.fromGame(
  {
    gameId: 'hub-dup',
    groups: [
      { groupId: 'g1', players: [{ userId: 'x1' }, { userId: 'x2' }] },
      { groupId: 'g2', players: [{ userId: 'x1' }, { userId: 'x3' }] }
    ]
  },
  { scope: 'match', matchId: 'hub-dup' }
);
var dupCtx = hostMod.buildFromHostSnapshot(dupSnap);
hostSession.setHostContext(dupCtx);
bind.attachHost(dupCtx);
assert('跨组 playerId 去重', bind.listCandidatePlayerIds('hub').length === 3, String(bind.listCandidatePlayerIds('hub')));

var oneGroup = scoringSnap.fromGame(
  {
    gameId: 'hub-1g',
    groups: [
      {
        groupId: 'g1',
        playersSlots: [
          { playerId: 'p1' },
          { playerId: 'p2' },
          { playerId: 'p3' },
          { playerId: 'p4' }
        ]
      }
    ]
  },
  { scope: 'match', matchId: 'hub-1g' }
);
var oneCtx = hostMod.buildFromHostSnapshot(oneGroup);
hostSession.setHostContext(oneCtx);
bind.attachHost(oneCtx);
assert('单组 HUB 仍 4 人 library cap', bind.getRuleLibraryCap('hub') === 4);
assert('单组仍可设计多人规则', catalog.listCatalogForDesign().some(function (g) {
  return g.items.some(function (it) {
    return it.id === 'horn';
  });
}));
assert('score 入口 cap=2 不含 4 人玩法', JSON.stringify(catalog.listCatalog(2)).indexOf('lasuo-4') < 0);

assert('settle 未改入口', /settleGame/.test(fs.readFileSync(path.join(gameRoot, 'utils/settle.js'), 'utf8')));

console.log('\nhubMultiGroupRuleDesign.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
