/**
 * 「我的规则库」2 人首次默认模板。
 * 运行：node scripts/ruleLibraryTwoPlayerDefaults.selftest.js
 */
if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {}
  };
}

var localLib = require('../miniprogram/subpackages/game/utils/localSideGameRuleLibrary.js');
var ruleDefaults = require('../miniprogram/subpackages/game/utils/sideGameRuleDefaults.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var settle8421 = require('../miniprogram/subpackages/game/utils/settle8421.js');
var settleCore = require('../miniprogram/subpackages/game/utils/settleCore.js');

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

function createLib(storage) {
  return localLib.createLocalSideGameRuleLibrary({
    storage: storage || memStorage(),
    clock: function () {
      return 1;
    }
  });
}

function byTemplate(items, tid) {
  return (items || []).filter(function (item) {
    return item.sourceTemplateId === tid || item.catalogId === tid;
  })[0];
}

function twoPlayer(items) {
  return (items || []).filter(function (item) {
    return catalog.rulePlayerCapability(item).playerCount === 2;
  });
}

function rowVal(rows, id) {
  var hit = (rows || []).filter(function (row) {
    return row && row.id === id;
  })[0];
  return hit ? String(hit.value) : '';
}

var emptyLib = createLib();
var first = emptyLib.listAll();
var items = first.data.items;
var two = twoPlayer(items);
var twoNames = two.map(function (item) {
  return item.name;
});
var twoIds = two.map(function (item) {
  return item.sourceTemplateId;
});

assert(
  'CASE1 2人默认恰好三局且顺序正确',
  twoIds.join(',') === 'stroke-2,match-2,8421-2' &&
    twoNames.join(',') === '比杆,比洞,单挂8421',
  twoNames.join(',') + ' / ' + twoIds.join(',')
);
assert(
  'CASE1 不含三局油菜',
  two.every(function (item) {
    return item.catalogId !== 'three-set' && item.catalogId !== 'youcai' && item.name !== '三局' && item.name !== '油菜';
  })
);
assert(
  'CASE1 添加规则仍可看到三局油菜',
  !!(catalog.findRule('three-set') && catalog.findRule('youcai'))
);

var stroke = byTemplate(items, 'stroke-2');
var strokeSnap = stroke && stroke.ruleSnapshot;
assert('CASE2 比杆 reward=none', !!(strokeSnap && strokeSnap.reward === 'none'));
assert(
  'CASE2 比杆奖励表仍为隐藏预设',
  rowVal(strokeSnap.addRows, 'hio') === '10' &&
    rowVal(strokeSnap.addRows, 'm2') === '3' &&
    rowVal(strokeSnap.addRows, 'm1') === '1' &&
    rowVal(strokeSnap.mulRows, 'hio') === '10' &&
    rowVal(strokeSnap.mulRows, 'm2') === '5' &&
    rowVal(strokeSnap.mulRows, 'm1') === '2' &&
    rowVal(strokeSnap.mulRows, 'par') === '1'
);

var match = byTemplate(items, 'match-2');
var matchSnap = match && match.ruleSnapshot;
assert('CASE3 比洞 reward=mul', !!(matchSnap && matchSnap.reward === 'mul'));
assert(
  'CASE3 比洞倍数',
  rowVal(matchSnap.mulRows, 'par') === '1' &&
    rowVal(matchSnap.mulRows, 'm1') === '2' &&
    rowVal(matchSnap.mulRows, 'm2') === '5' &&
    rowVal(matchSnap.mulRows, 'hio') === '10'
);
assert('CASE3 比洞顶洞=得分打平', matchSnap.pushRule === 'push' || matchSnap.pushRule === 'tie');
assert(
  'CASE3 吃肉数量',
  rowVal(matchSnap.meatRows, 'ge-1') === '0' &&
    rowVal(matchSnap.meatRows, 'par') === '1' &&
    rowVal(matchSnap.meatRows, 'm1') === '2' &&
    rowVal(matchSnap.meatRows, 'le-2') === '3'
);
assert('CASE3 肉不含奖励', matchSnap.meatInclude === 'no');

var g8421 = byTemplate(items, '8421-2');
var s8421 = g8421 && g8421.ruleSnapshot;
assert('单挂展示名', g8421 && g8421.name === '单挂8421' && g8421.catalogId === '8421-2');

var map = settle8421.fromScoreRows(s8421.scoreRows);
assert(
  'CASE4 映射 32/16/8/4/2/1/0',
  settle8421.personalScore(-3, map, s8421, 4) === 32 &&
    settle8421.personalScore(-2, map, s8421, 4) === 16 &&
    settle8421.personalScore(-1, map, s8421, 4) === 8 &&
    settle8421.personalScore(0, map, s8421, 4) === 4 &&
    settle8421.personalScore(1, map, s8421, 4) === 2 &&
    settle8421.personalScore(2, map, s8421, 4) === 1 &&
    settle8421.personalScore(3, map, s8421, 4) === 0,
  JSON.stringify({
    m3: settle8421.personalScore(-3, map, s8421, 4),
    p3: settle8421.personalScore(3, map, s8421, 4)
  })
);

var deduct = {
  deductMode: s8421.deductMode,
  deductWay: s8421.deductWay,
  deductPlusN: s8421.deductPlusN,
  deductCap: s8421.deductCap,
  deductCapN: s8421.deductCapN
};
assert(
  'CASE5 扣分 +4=-1 +5起封顶-2',
  settle8421.deductScore(4, deduct, 4) === -1 &&
    settle8421.deductScore(5, deduct, 4) === -2 &&
    settle8421.deductScore(6, deduct, 4) === -2 &&
    settle8421.deductScore(7, deduct, 4) === -2,
  JSON.stringify({
    d4: settle8421.deductScore(4, deduct, 4),
    d5: settle8421.deductScore(5, deduct, 4),
    d6: settle8421.deductScore(6, deduct, 4),
    d7: settle8421.deductScore(7, deduct, 4),
    cap: s8421.deductCap,
    capN: s8421.deductCapN
  })
);

assert('CASE6 8421 顶洞=得分打平', s8421.pushRule === 'tie' && settle8421.pushKind(s8421) === 'tie');

assert(
  'CASE7 8421 各档吃1块',
  settle8421.meatWanted(s8421, -3) === 1 &&
    settle8421.meatWanted(s8421, -2) === 1 &&
    settle8421.meatWanted(s8421, -1) === 1 &&
    settle8421.meatWanted(s8421, 0) === 1 &&
    settle8421.meatWanted(s8421, 1) === 1 &&
    settle8421.meatWanted(s8421, 2) === 1 &&
    settle8421.meatWanted(s8421, 5) === 1
);

assert('CASE8 肉值类型=本洞分值', s8421.meatValueType === 'double' && s8421.meatCap === 'none');
assert(
  'CASE8 N分肉值N且不封顶',
  settleCore.meatPieceValue(s8421, 1, 1) === 1 &&
    settleCore.meatPieceValue(s8421, 4, 1) === 4 &&
    settleCore.meatPieceValue(s8421, 8, 1) === 8 &&
    settleCore.meatPieceValue(s8421, 16, 1) === 16 &&
    settleCore.meatPieceValue(s8421, 99, 1) === 99
);

var existingStore = memStorage();
existingStore.setItem(localLib.STORAGE_KEY, {
  schemaVersion: 4,
  items: [
    {
      id: 'rl_custom_stroke',
      name: '我的比杆',
      catalogId: 'stroke-2',
      ruleId: 'stroke-2',
      sourceTemplateId: 'stroke-2',
      players: 2,
      revision: 3,
      ruleSnapshot: { catalogId: 'stroke-2', reward: 'add', k: 7 }
    },
    {
      id: 'rl_custom_match',
      name: '我的比洞',
      catalogId: 'match-2',
      ruleId: 'match-2',
      sourceTemplateId: 'match-2',
      players: 2,
      revision: 2,
      ruleSnapshot: {
        catalogId: 'match-2',
        reward: 'none',
        pushRule: 'none',
        meatInclude: 'yes',
        meatRows: [{ id: 'le-2', value: '全部' }]
      }
    },
    {
      id: 'rl_custom_8421',
      name: '旧8421',
      catalogId: '8421-2',
      ruleId: '8421-2',
      sourceTemplateId: '8421-2',
      players: 2,
      revision: 5,
      ruleSnapshot: {
        catalogId: '8421-2',
        scoreRows: [{ id: 'hio', value: '50' }],
        deductCap: 'none',
        meatValueType: 'fixed',
        meatRows: [{ id: 'par', value: '9' }]
      }
    }
  ],
  processedSourceTemplateIds: ['stroke-2', 'match-2', '8421-2'],
  dismissedDefaultRuleIds: []
});
var before = JSON.stringify(existingStore.getItem(localLib.STORAGE_KEY).items);
var existingLib = createLib(existingStore);
var afterItems = existingLib.listAll().data.items;
var after = JSON.stringify(
  afterItems.map(function (item) {
    return {
      id: item.id,
      name: item.name,
      revision: item.revision,
      reward: item.ruleSnapshot && item.ruleSnapshot.reward,
      k: item.ruleSnapshot && item.ruleSnapshot.k,
      pushRule: item.ruleSnapshot && item.ruleSnapshot.pushRule,
      meatInclude: item.ruleSnapshot && item.ruleSnapshot.meatInclude,
      scoreHio: rowVal(item.ruleSnapshot && item.ruleSnapshot.scoreRows, 'hio'),
      deductCap: item.ruleSnapshot && item.ruleSnapshot.deductCap,
      meatValueType: item.ruleSnapshot && item.ruleSnapshot.meatValueType,
      meatPar: rowVal(item.ruleSnapshot && item.ruleSnapshot.meatRows, 'par')
    };
  })
);
assert('CASE9 条数不变', afterItems.length === 3);
assert(
  'CASE9 不改自定义值',
  afterItems.length === 3 &&
    afterItems[0].ruleSnapshot.reward === 'add' &&
    afterItems[0].ruleSnapshot.k === 7 &&
    afterItems[1].ruleSnapshot.reward === 'none' &&
    afterItems[1].ruleSnapshot.pushRule === 'none' &&
    afterItems[2].ruleSnapshot.deductCap === 'none' &&
    rowVal(afterItems[2].ruleSnapshot.scoreRows, 'hio') === '50' &&
    afterItems[2].ruleSnapshot.meatValueType === 'fixed' &&
    rowVal(afterItems[2].ruleSnapshot.meatRows, 'par') === '9',
  after
);
assert('CASE9 不补第四条', afterItems.every(function (item) {
  return item.id === 'rl_custom_stroke' || item.id === 'rl_custom_match' || item.id === 'rl_custom_8421';
}));

var again = emptyLib.listAll();
assert('CASE10 重复进入不重复 seed', again.data.items.length === items.length);
var ids1 = items
  .map(function (item) {
    return item.id;
  })
  .join(',');
var ids2 = again.data.items
  .map(function (item) {
    return item.id;
  })
  .join(',');
assert('CASE10 同库实例 ID 稳定', ids1 === ids2);

var canon = ruleDefaults.defaultGameplaySnapshot('match-2', { catalogId: 'match-2' });
assert('canonical 比洞 mul', canon.reward === 'mul' && canon.meatInclude === 'no');
var canon8421 = ruleDefaults.defaultGameplaySnapshot('8421-2', { catalogId: '8421-2' });
assert('canonical 8421 32与扣分封顶2', rowVal(canon8421.scoreRows, 'hio') === '32' && canon8421.deductCap === 'cap' && String(canon8421.deductCapN) === '2');

void before;

console.log('\nruleLibraryTwoPlayerDefaults.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
