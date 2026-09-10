/**
 * 规则库默认项、人数能力与本场候选筛选。
 * 运行：node scripts/ruleLibraryPlayerFilter.selftest.js
 */
var path = require('path');

if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {}
  };
}

var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var localLib = require('../miniprogram/subpackages/game/utils/localSideGameRuleLibrary.js');
var cap = require('../miniprogram/subpackages/game/utils/rulePlayerCapability.js');

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
  return {
    bag: {},
    getItem: function (key) {
      return this.bag[key];
    },
    setItem: function (key, value) {
      this.bag[key] = JSON.parse(JSON.stringify(value));
      return true;
    }
  };
}

function idsOf(items) {
  return (items || [])
    .map(function (item) {
      return item.id;
    })
    .sort()
    .join(',');
}

function namesOf(items) {
  return (items || [])
    .map(function (item) {
      return item.name;
    })
    .sort()
    .join(',');
}

assert('统一函数同源', cap.isRuleAvailableForGroupCapacity === catalog.isRuleAvailableForGroupCapacity);
assert('统一函数同源-exact', cap.isRuleCompatibleWithPlayerCount === catalog.isRuleCompatibleWithPlayerCount);

var defaults = {
  2: ['stroke-2', 'match-2', '8421-2'],
  3: ['landlord-mid'],
  4: ['8421-4', 'lasuo-4', 'three-vs-one'],
  5: ['lasuo-n', 'horn']
};

['stroke-2', 'match-2', '8421-2'].forEach(function (id) {
  var rule = catalog.findRule(id);
  var c = catalog.rulePlayerCapability(rule);
  assert(id + ' 精确 2 人', c.playerMode === 'exact' && c.playerCount === 2);
});
assert('斗二地主精确 3', catalog.rulePlayerCapability(catalog.findRule('landlord-mid')).playerCount === 3);
['8421-4', 'lasuo-4', 'three-vs-one'].forEach(function (id) {
  var c = catalog.rulePlayerCapability(catalog.findRule(id));
  assert(id + ' 精确 4 人', c.playerMode === 'exact' && c.playerCount === 4);
});
['lasuo-n', 'horn'].forEach(function (id) {
  var c = catalog.rulePlayerCapability(catalog.findRule(id));
  assert(
    id + ' 多人 5+',
    c.playerMode === 'range' && c.minPlayers === 5 && c.maxPlayers == null,
    JSON.stringify(c)
  );
});

function expectIds(count, want) {
  var got = catalog.listCatalog(count).reduce(function (acc, group) {
    (group.items || []).forEach(function (item) {
      acc.push(item.id);
    });
    return acc;
  }, []);
  want.forEach(function (id) {
    assert(count + ' 人含 ' + id, got.indexOf(id) >= 0, got.join(','));
  });
  var forbidden =
    count === 4 ? ['lasuo-n', 'horn'] : count >= 5 ? ['8421-4', 'lasuo-4', 'three-vs-one'] : [];
  forbidden.forEach(function (id) {
    assert(count + ' 人不含 ' + id, got.indexOf(id) < 0, got.join(','));
  });
}

expectIds(2, defaults[2]);
expectIds(3, defaults[3]);
expectIds(4, defaults[4]);
expectIds(5, defaults[5]);
expectIds(8, defaults[5]);

function idsFromGroups(groups) {
  var acc = [];
  (groups || []).forEach(function (group) {
    (group.items || []).forEach(function (item) {
      acc.push(item.id);
    });
  });
  return acc;
}

var cap4 = idsFromGroups(catalog.listCatalogForGroupCapacity(4));
assert('容量 4 含 2 人', cap4.indexOf('stroke-2') >= 0);
assert('容量 4 含 3 人', cap4.indexOf('landlord-mid') >= 0);
assert('容量 4 含 4 人', cap4.indexOf('8421-4') >= 0);
assert('容量 4 无多人', cap4.indexOf('horn') < 0 && cap4.indexOf('lasuo-n') < 0);
assert('容量 2 无 3 人', idsFromGroups(catalog.listCatalogForGroupCapacity(2)).indexOf('landlord-mid') < 0);
assert('容量 0 空', catalog.listCatalogForGroupCapacity(0).length === 0);
assert('容量 1 空', catalog.listCatalogForGroupCapacity(1).length === 0);
assert(
  '候选覆盖不等于保存恰好',
  catalog.isRuleAvailableForGroupCapacity(catalog.findRule('stroke-2'), 4) &&
    !catalog.isExactEntityCount(catalog.findRule('stroke-2'), 4) &&
    catalog.isExactEntityCount(catalog.findRule('stroke-2'), 2)
);

var store = memStorage();
var lib = localLib.createLocalSideGameRuleLibrary({
  storage: store,
  clock: function () {
    return 1;
  }
});
var first = lib.listAll();
assert('空库初始化 9 条默认', first.ok && first.data.items.length === 9, String(first.data.items.length));
assert(
  '默认实例不是模板锁定 ID',
  first.data.items.every(function (item) {
    return item.id && item.id !== item.sourceTemplateId && String(item.id).indexOf('rl_') === 0;
  }),
  idsOf(first.data.items)
);
assert(
  'sourceTemplateId 覆盖全部默认模板',
  first.data.items
    .map(function (item) {
      return item.sourceTemplateId;
    })
    .sort()
    .join(',') === localLib.DEFAULT_LIBRARY_RULE_IDS.slice().sort().join(',')
);
assert('拉丝三点复用 lasuo-4 模板', first.data.items.some(function (item) {
  return item.sourceTemplateId === 'lasuo-4' && item.name === '拉丝三点' && item.catalogId === 'lasuo-4';
}));
var second = lib.listAll();
assert('二次初始化不重复', second.data.items.length === 9);
assert('schemaVersion=4', second.data.schemaVersion === localLib.RULE_LIBRARY_SCHEMA_VERSION);
assert(
  'processedSourceTemplateIds 覆盖默认模板',
  (second.data.processedSourceTemplateIds || []).slice().sort().join(',') ===
    localLib.DEFAULT_LIBRARY_RULE_IDS.slice().sort().join(',')
);

function namesAt(n) {
  return namesOf(lib.listCompatible(n).data.items);
}

assert('库 2 人', namesAt(2) === '单挂8421,比杆,比洞');
assert('库 3 人含 2 人', namesAt(3).indexOf('比杆') >= 0 && namesAt(3).indexOf('斗二地主') >= 0);
assert('库 3 人无 4 人', namesAt(3).indexOf('4人8421') < 0 && namesAt(3).indexOf('拉丝三点') < 0);
assert('库 4 人含 2 人', namesAt(4).indexOf('比杆') >= 0);
assert('库 4 人含 3 人', namesAt(4).indexOf('斗二地主') >= 0);
assert('库 4 人含 4 人', namesAt(4).indexOf('4人8421') >= 0 && namesAt(4).indexOf('拉丝三点') >= 0);
assert('库 4 人无多人', lib.listCompatible(4).data.items.every(function (item) {
  return item.sourceTemplateId !== 'horn' && item.sourceTemplateId !== 'lasuo-n';
}));
assert('库 5 人仍无多人', namesAt(5).indexOf('喇叭花') < 0 && namesAt(5).indexOf('多人拉丝') < 0);
assert('库 5 人仍含 2 人规则', namesAt(5).indexOf('比杆') >= 0);
assert('人数 0 不展示', lib.listCompatible(0).data.items.length === 0);
assert('人数 1 不展示', lib.listCompatible(1).data.items.length === 0);

var custom = lib.upsert({
  id: 'rl_custom_4',
  name: '我的四人局',
  catalogId: 'vegas',
  ruleId: 'vegas',
  players: 4,
  ruleSnapshot: { catalogId: 'vegas', k: 7 }
});
assert('自定义 4 人可写入', !!(custom && custom.ok));
assert('4 人显示自定义', lib.listCompatible(4).data.items.some(function (item) {
  return item.id === 'rl_custom_4' && item.ruleSnapshot && item.ruleSnapshot.k === 7;
}));
assert('完整库含多人', lib.listAll().data.items.some(function (item) {
  return item.sourceTemplateId === 'horn';
}));

var oldStore = memStorage();
oldStore.setItem(localLib.STORAGE_KEY, [
  {
    id: 'stroke-2',
    name: '我的比杆改名',
    catalogId: 'stroke-2',
    ruleId: 'stroke-2',
    players: 2,
    revision: 4,
    ruleSnapshot: { catalogId: 'stroke-2', reward: 'mul', k: 99 }
  },
  {
    id: 'rl_keep',
    name: '自定义油菜',
    catalogId: 'youcai',
    ruleId: 'youcai',
    players: 2,
    noSettings: true
  }
]);
var oldLib = localLib.createLocalSideGameRuleLibrary({
  storage: oldStore,
  clock: function () {
    return 2;
  }
});
var migrated = oldLib.listAll().data.items;
var stroke = migrated.filter(function (item) {
  return item.id === 'stroke-2';
})[0];
assert('同 ID 保留用户配置', stroke && stroke.name === '我的比杆改名' && stroke.revision === 4 && stroke.ruleSnapshot.k === 99);
assert('同 ID 补齐人数元数据', stroke.playerMode === 'exact' && stroke.playerCount === 2);
assert(
  '自定义规则不被删除',
  migrated.some(function (item) {
    return item.id === 'rl_keep' && item.name === '自定义油菜';
  })
);
assert(
  '老用户不补缺失默认模板',
  !localLib.DEFAULT_LIBRARY_RULE_IDS.every(function (id) {
    return migrated.some(function (item) {
      return item.sourceTemplateId === id || item.id === id || item.catalogId === id;
    });
  }) &&
    migrated.length === 2 &&
    stroke &&
    stroke.ruleSnapshot &&
    stroke.ruleSnapshot.reward === 'mul' &&
    stroke.ruleSnapshot.k === 99
);
assert('旧实例 ID 保留', stroke && stroke.id === 'stroke-2');
assert(
  '旧实例补 sourceTemplateId',
  stroke && stroke.sourceTemplateId === 'stroke-2'
);

var again = oldLib.listAll().data.items;
assert('老用户二次进入不重复', again.length === migrated.length);

var horn = lib.listAll().data.items.filter(function (item) {
  return item.sourceTemplateId === 'horn';
})[0];
assert('可删除默认规则', !!(horn && lib.remove(horn.id).ok));
var afterDel = lib.listAll();
assert(
  '删除后立即消失',
  afterDel.data.items.every(function (item) {
    return item.sourceTemplateId !== 'horn' && item.id !== horn.id;
  })
);
assert(
  'tombstone 记录模板',
  (afterDel.data.dismissedDefaultRuleIds || []).indexOf('horn') >= 0
);
var restarted = localLib.createLocalSideGameRuleLibrary({
  storage: store,
  clock: function () {
    return 9;
  }
});
var afterRestart = restarted.listAll();
assert(
  '重启不恢复已删默认规则',
  afterRestart.data.items.length === afterDel.data.items.length &&
    afterRestart.data.items.every(function (item) {
      return item.sourceTemplateId !== 'horn';
    })
);

var strokeLive = lib.listAll().data.items.filter(function (item) {
  return item.sourceTemplateId === 'stroke-2';
})[0];
var edited = lib.upsert({
  id: strokeLive.id,
  name: '杆数私房规则',
  catalogId: 'stroke-2',
  ruleId: 'stroke-2',
  sourceTemplateId: 'stroke-2',
  players: 2,
  ruleSnapshot: { catalogId: 'stroke-2', reward: 'mul', k: 3 }
});
assert('默认可编辑', !!(edited && edited.ok && edited.data.name === '杆数私房规则'));
var afterEditRestart = localLib
  .createLocalSideGameRuleLibrary({
    storage: store,
    clock: function () {
      return 10;
    }
  })
  .listAll().data.items.filter(function (item) {
    return item.id === strokeLive.id;
  })[0];
assert(
  '重启保留编辑结果',
  afterEditRestart &&
    afterEditRestart.name === '杆数私房规则' &&
    afterEditRestart.ruleSnapshot.k === 3 &&
    afterEditRestart.revision >= 2
);

var migrateAgain = restarted.listAll();
assert(
  '再次迁移不覆盖编辑、不复活删除项',
  migrateAgain.data.items.some(function (item) {
    return item.id === strokeLive.id && item.name === '杆数私房规则';
  }) &&
    migrateAgain.data.items.every(function (item) {
      return item.sourceTemplateId !== 'horn';
    })
);

var sameName = lib.upsert({
  name: '喇叭花',
  catalogId: 'horn',
  ruleId: 'horn',
  sourceTemplateId: 'horn',
  noSettings: true
});
assert('删除后可新建同名用户实例', !!(sameName && sameName.ok && sameName.data.id !== horn.id));
assert(
  '同名新建不去重覆盖其它规则',
  lib.listAll().data.items.filter(function (item) {
    return item.name === '喇叭花';
  }).length === 1 && sameName.data.id.indexOf('rl_') === 0
);

var v2Empty = memStorage();
v2Empty.setItem(localLib.STORAGE_KEY, { schemaVersion: 2, items: [] });
var v2Lib = localLib.createLocalSideGameRuleLibrary({
  storage: v2Empty,
  clock: function () {
    return 11;
  }
});
assert(
  '已初始化空库不复活默认项',
  v2Lib.listAll().data.items.length === 0
);

var partyFormation = require('../miniprogram/subpackages/game/utils/partyFormation.js');
assert(
  '两名独立球员=2 实体',
  partyFormation.resolveAvailableGameEntityCount({
    parties: [
      { partyId: 'A', playerIds: ['A'] },
      { partyId: 'B', playerIds: ['B'] }
    ]
  }) === 2
);
assert(
  '两个组合=2 实体',
  partyFormation.resolveAvailableGameEntityCount({
    parties: [
      { partyId: 'AB', playerIds: ['A', 'B'] },
      { partyId: 'CD', playerIds: ['C', 'D'] }
    ]
  }) === 2
);
assert(
  '四人各自=4 实体',
  partyFormation.resolveAvailableGameEntityCount({
    parties: [
      { partyId: 'A', playerIds: ['A'] },
      { partyId: 'B', playerIds: ['B'] },
      { partyId: 'C', playerIds: ['C'] },
      { partyId: 'D', playerIds: ['D'] }
    ]
  }) === 4
);

var fs = require('fs');
var rulesWxml = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'pages', 'rules', 'index.wxml'),
  'utf8'
);
var rulesJs = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'pages', 'rules', 'index.js'),
  'utf8'
);
var rulesWxss = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'styles', 'game-ui.wxss'),
  'utf8'
);
var DELETE_HINT =
  "长按规则可删除。删除仅从‘我的规则库’移除，不影响之前已设置的游戏。如需添加其他规则，可点击底部‘添加规则’进行配置。";
var rulesPageWxss = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'pages', 'rules', 'index.wxss'),
  'utf8'
);
var gameListJs = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'components', 'game-list', 'index.js'),
  'utf8'
);
var rulesPageSrc = rulesJs + '\n' + rulesWxml;
assert('无本场可用 TAB', rulesWxml.indexOf('本场可用') < 0);
assert('无全部规则 TAB', rulesWxml.indexOf('全部规则') < 0);
assert('单页标题我的规则库', rulesWxml.indexOf('我的规则库') >= 0);
assert('无显式删除按钮', rulesWxml.indexOf('rule-row__delete') < 0 && !/>删除</.test(rulesWxml));
assert('删除说明常量', rulesJs.indexOf(DELETE_HINT) >= 0 && rulesJs.indexOf('deleteHint: DELETE_HINT') >= 0);
assert(
  '常驻删除说明',
  rulesWxml.indexOf('library-delete-hint') >= 0 &&
    rulesWxml.indexOf('{{deleteHint}}') >= 0 &&
    !/wx:if=.*deleteHint/.test(rulesWxml)
);
assert('无动态人数说明节点', rulesWxml.indexOf('sceneHint') < 0 && rulesJs.indexOf('sceneHint') < 0 && rulesJs.indexOf('sceneHintOf') < 0);
assert(
  '提示在标题下列表上',
  rulesWxml.indexOf('gb-header__title') < rulesWxml.indexOf('library-delete-hint') &&
    rulesWxml.indexOf('library-delete-hint') < rulesWxml.indexOf('myRules.length === 0') &&
    rulesWxml.indexOf('library-delete-hint') < rulesWxml.indexOf('ruleGroups')
);
assert('空库也显示删除说明', /library-delete-hint[\s\S]*wx:if="\{\{myRules\.length === 0\}\}"/.test(rulesWxml));
assert('说明不依赖有规则', rulesWxml.indexOf('wx:if="{{myRules.length}}"') < 0);
assert('页面无硬编码长按文案', rulesWxml.indexOf('长按规则可删除') < 0);
assert('长按提示只出现一次', (rulesJs.match(/长按规则可删除/g) || []).length === 1);
assert('无当前参与方说明', !/当前[^。\n]{0,12}个参与方/.test(rulesPageSrc));
assert('无可使用人数范围说明', !/可使用[^。\n]{0,12}人规则/.test(rulesPageSrc));
assert('页面无新建规则', rulesPageSrc.indexOf('新建规则') < 0);
assert(
  '底部添加规则按钮',
  /class="fab-wrap"[\s\S]*bindtap="onAddRule">＋ 添加规则</.test(rulesWxml) &&
    DELETE_HINT.indexOf('添加规则') >= 0
);
assert(
  '说明可换行不横滑',
  /library-delete-hint \{[\s\S]*?white-space:\s*normal;[\s\S]*?overflow-x:\s*hidden;/.test(rulesPageWxss)
);
assert(
  '两入口同页常驻提示',
  gameListJs.indexOf('/subpackages/game/pages/rules/index?entry=') >= 0 &&
    gameListJs.indexOf('this.properties.entry') >= 0 &&
    rulesJs.indexOf('isManageEntry(entry)') >= 0 &&
    rulesJs.indexOf('deleteHint:') >= 0 &&
    rulesJs.indexOf('reloadRules') >= 0 &&
    !/this\.setData\(\{[\s\S]*deleteHint/.test(rulesJs.split('reloadRules')[1] || '')
);
assert(
  '提示非警告红',
  /library-delete-hint \{[\s\S]*?color:\s*var\(--text-muted\)/.test(rulesPageWxss) &&
    !/library-delete-hint \{[\s\S]*?(--danger|--error|--warning|#e|#f|rgb\(\s*2)/.test(rulesPageWxss)
);
assert('长按绑定删除', rulesWxml.indexOf('bindlongpress="startDelete"') >= 0);
assert('编辑在名称后', /rule-row__name[\s\S]*rule-row__edit/.test(rulesWxml));
assert('编辑 catchtap 隔离', /catchtap="editMine"/.test(rulesWxml));
assert('编辑 catchlongpress 隔离', /class="rule-row__edit"[\s\S]*?catchlongpress="onControlLongPress"/.test(rulesWxml));
assert('加号 catchlongpress 隔离', /class="rule-row__add"[\s\S]*?catchlongpress="onControlLongPress"/.test(rulesWxml));
assert('控件长按不删除', /onControlLongPress\(\) \{\s*skipTap\.arm\(\);\s*\}/.test(rulesJs) && rulesJs.indexOf('onEditLongPress') < 0);
assert('删除仅卡片 bindlongpress', /class="rule-row"[\s\S]*?bindlongpress="startDelete"/.test(rulesWxml));
assert('删除确认含规则名', rulesJs.indexOf('从规则库移除「') >= 0);
assert(
  '编辑按钮不 flex 占满',
  /rule-row__edit \{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?width:\s*auto;/.test(rulesWxss)
);

var gestures = require('../miniprogram/subpackages/game/utils/ruleCardGestures.js');
var t = 1000;
var guard = gestures.createSkipTapGuard(function () { return t; }, 280);
guard.arm();
assert('合成 tap 被消费', guard.consume() === true);
assert('消费后立即复位', guard.consume() === false);
t = 2000;
guard.arm();
t = 2290;
assert('窗口外不吞后续点击', guard.consume() === false);

var recUtil = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var historic = recUtil.resolveHistoricRuleSnapshot(
  { catalogId: 'stroke-2' },
  {
    ruleId: 'stroke-2',
    title: '杆数私房规则',
    ruleSnapshot: { catalogId: 'stroke-2', reward: 'mul', k: 3 },
    config: { instance: { name: '杆数私房规则', ruleLibId: 'rl_gone' } }
  }
);
assert(
  '历史游戏读快照不依赖规则库',
  historic && historic.catalogId === 'stroke-2' && historic.reward === 'mul' && historic.k === 3
);
assert(
  '历史游戏标题保留',
  recUtil.resolveHistoricRuleTitle(
    { ruleId: 'stroke-2', title: '杆数私房规则' },
    { ruleLibId: 'rl_gone' }
  ) === '杆数私房规则'
);
var thin = recUtil.resolveHistoricRuleSnapshot(
  {},
  { ruleId: 'match-2', title: '旧比洞', config: { instance: { ruleLibId: 'rl_gone' } } }
);
assert(
  '无完整快照时回退目录模板',
  thin && thin.catalogId === 'match-2' && thin.name === '比洞'
);
var bindSrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils', 'sideGameBind.js'),
  'utf8'
);
assert(
  '结算不读当前规则库',
  (bindSrc.match(/libraryRuleSnapshot:\s*null/g) || []).length >= 2 &&
    bindSrc.indexOf('buildInstancePayload') >= 0 &&
    !/ruleSnapshot:\s*getMyRuleById/.test(bindSrc)
);

var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var localRepoMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var settleStroke2 = require('../miniprogram/subpackages/game/utils/settleStroke2.js');
var settle = require('../miniprogram/subpackages/game/utils/settle.js');
var savedIdentity = identity.getImplementation();
identity.setImplementation({
  implementation: 'test',
  getCurrentUserId: function () {
    return 'tester';
  }
});

var customPlay = {
  catalogId: 'stroke-2',
  reward: 'mul',
  k: 3,
  mulRows: [
    { id: 'hio', value: 10 },
    { id: 'm2', value: 5 },
    { id: 'm1', value: 7 },
    { id: 'par', value: 1 },
    { id: 'p1', value: 1 },
    { id: 'ge2', value: 1 }
  ]
};
var historicLib = localLib.createLocalSideGameRuleLibrary({
  storage: memStorage(),
  clock: function () {
    return 30;
  },
  idGen: function () {
    return 'rl_private_stroke';
  }
});
var libRow = historicLib.upsert({
  id: 'rl_private_stroke',
  name: '杆数私房规则',
  catalogId: 'stroke-2',
  ruleId: 'stroke-2',
  players: 2,
  ruleSnapshot: customPlay
});
assert('个人规则写入成功', libRow.ok && libRow.data && libRow.data.id === 'rl_private_stroke');

var repoHost = hostMod.emptyContext({
  matchId: 'm_hist',
  groupId: 'g1',
  scope: 'group',
  revision: 'r1',
  holeContextReady: true,
  holeOrder: ['A1'],
  pars: { A1: 4 },
  players: [
    { playerId: 'A', groupId: 'g1' },
    { playerId: 'B', groupId: 'g1' }
  ],
  scoreParties: [
    { partyId: 'A', partyType: 'player', displayName: '甲', memberPlayerIds: ['A'], groupId: 'g1' },
    { partyId: 'B', partyType: 'player', displayName: '乙', memberPlayerIds: ['B'], groupId: 'g1' }
  ]
});
var gameRepo = localRepoMod.createLocalSideGameRepository({
  storage: memStorage(),
  idGen: function () {
    return 'sg_hist_1';
  },
  clock: function () {
    return 40;
  }
});
var mergedSnap = recUtil.mergeRuleSnapshot(recUtil.buildRuleSnapshot('stroke-2'), customPlay);
var createdGame = gameRepo.create({
  matchId: 'm_hist',
  groupId: 'g1',
  scope: 'group',
  ruleId: 'stroke-2',
  ruleSnapshot: mergedSnap,
  title: '杆数私房规则',
  participantParties: [
    { partyId: 'A', partyType: 'player', displayName: '甲', memberPlayerIds: ['A'] },
    { partyId: 'B', partyType: 'player', displayName: '乙', memberPlayerIds: ['B'] }
  ],
  config: recUtil.emptyConfig({
    instance: {
      name: '杆数私房规则',
      catalogId: 'stroke-2',
      ruleLibId: 'rl_private_stroke',
      ruleSnapshot: recUtil.jsonClone(mergedSnap),
      players: [{ id: 'A' }, { id: 'B' }],
      pairings: [{ leftId: 'A', rightId: 'B', on: true }]
    }
  }),
  visibility: 'group',
  hostContext: repoHost,
  idempotencyKey: 'hist_create'
});
assert(
  '创建游戏保存独立快照',
  createdGame.ok &&
    createdGame.data &&
    createdGame.data.ruleSnapshot &&
    createdGame.data.ruleSnapshot.reward === 'mul' &&
    createdGame.data.ruleSnapshot.k === 3 &&
    String(
      (createdGame.data.ruleSnapshot.mulRows || []).filter(function (row) {
        return row.id === 'm1';
      })[0].value
    ) === '7'
);

historicLib.upsert({
  id: 'rl_private_stroke',
  name: '杆数私房规则已改',
  catalogId: 'stroke-2',
  ruleId: 'stroke-2',
  players: 2,
  ruleSnapshot: { catalogId: 'stroke-2', reward: 'add', k: 99, addRows: [{ id: 'm1', value: 99 }] }
});
var removedLib = historicLib.remove('rl_private_stroke');
assert('删除个人规则成功', removedLib.ok && !historicLib.getById('rl_private_stroke').ok);

var persisted = gameRepo.getById('sg_hist_1');
assert(
  '删库后记录仍带独立快照',
  persisted.ok &&
    persisted.data.title === '杆数私房规则' &&
    persisted.data.ruleSnapshot.reward === 'mul' &&
    persisted.data.ruleSnapshot.k === 3
);

var uiGame = bind.recordToGame(persisted.data);
assert(
  '删库后界面仍显示名称与配置',
  uiGame &&
    uiGame.name === '杆数私房规则' &&
    uiGame.catalogId === 'stroke-2' &&
    uiGame.ruleSnapshot.reward === 'mul' &&
    uiGame.ruleSnapshot.k === 3 &&
    String(
      (uiGame.ruleSnapshot.mulRows || []).filter(function (row) {
        return row.id === 'm1';
      })[0].value
    ) === '7'
);

var settleCtx = {
  holeOrder: ['A1'],
  scores: { A1: { A: 0, B: -1 } },
  pars: { A1: 4 },
  libraryRuleSnapshot: null
};
var settledDirect = settleStroke2.settle(uiGame, settleCtx);
var settledVia = settle.settleGame(uiGame, settleCtx);
assert(
  '删库后结算不依赖个人规则',
  settledDirect &&
    !settledDirect.error &&
    !settledDirect.rewardMissing &&
    settledDirect.rewardState === 'mul' &&
    settledDirect.byHole &&
    settledDirect.byHole.A1 &&
    settledVia &&
    settledVia.rewardState === 'mul'
);
var liveLibWouldMix = settleStroke2.settle(uiGame, {
  holeOrder: ['A1'],
  scores: { A1: { A: 0, B: -1 } },
  pars: { A1: 4 },
  libraryRuleSnapshot: { catalogId: 'stroke-2', reward: 'add', k: 99 }
});
assert(
  '产品路径不传入当前库快照',
  settleCtx.libraryRuleSnapshot === null &&
    settledDirect.rewardState !== liveLibWouldMix.rewardState
);

var thinUi = bind.recordToGame({
  sideGameId: 'sg_old_match',
  ruleId: 'match-2',
  title: '旧比洞',
  config: { instance: { ruleLibId: 'rl_gone', name: '旧比洞' } }
});
assert(
  '旧数据缺快照时按目录回退',
  thinUi &&
    thinUi.name === '旧比洞' &&
    thinUi.catalogId === 'match-2' &&
    thinUi.ruleSnapshot &&
    thinUi.ruleSnapshot.catalogId === 'match-2' &&
    thinUi.ruleSnapshot.name === '比洞' &&
    thinUi.ruleSnapshot.reward !== 'mul'
);
var nestedEnvelope = recUtil.resolveHistoricRuleSnapshot(
  {},
  {
    ruleId: 'stroke-2',
    title: '嵌套信封',
    ruleSnapshot: { ruleSnapshot: { catalogId: 'stroke-2', reward: 'none' } }
  }
);
assert(
  '嵌套快照可解开',
  nestedEnvelope && nestedEnvelope.catalogId === 'stroke-2' && nestedEnvelope.reward === 'none'
);
var unknownSafe = recUtil.resolveHistoricRuleSnapshot({}, { ruleId: 'not-a-rule', title: '' });
var unknownTitle = recUtil.resolveHistoricRuleTitle({ ruleId: 'not-a-rule' }, {});
assert(
  '未知规则安全降级',
  unknownTitle === 'not-a-rule' &&
    unknownSafe &&
    (unknownSafe.catalogId === 'not-a-rule' || unknownSafe.catalogId === '') &&
    unknownSafe.reward !== 'mul'
);

identity.setImplementation(savedIdentity);

var newTemplateStore = memStorage();
newTemplateStore.setItem(localLib.STORAGE_KEY, {
  schemaVersion: 1,
  items: first.data.items.filter(function (item) {
    return item.sourceTemplateId !== 'horn';
  }),
  processedSourceTemplateIds: localLib.DEFAULT_LIBRARY_RULE_IDS.filter(function (id) {
    return id !== 'horn';
  }),
  dismissedDefaultRuleIds: []
});
var newTemplateLib = localLib.createLocalSideGameRuleLibrary({
  storage: newTemplateStore,
  clock: function () {
    return 20;
  }
});
assert(
  '已有库不因 processed 缺项而补种',
  newTemplateLib.listAll().data.items.every(function (item) {
    return item.sourceTemplateId !== 'horn';
  }) &&
    newTemplateLib.listAll().data.items.length ===
      first.data.items.filter(function (item) {
        return item.sourceTemplateId !== 'horn';
      }).length
);

console.log('\nruleLibraryPlayerFilter.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
