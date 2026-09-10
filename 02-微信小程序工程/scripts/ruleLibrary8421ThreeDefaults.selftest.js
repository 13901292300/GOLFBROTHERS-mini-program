/**
 * 「我的规则库」3 人首次默认：3人8421。
 * 运行：node scripts/ruleLibrary8421ThreeDefaults.selftest.js
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
var settle8421 = require('../miniprogram/subpackages/game/utils/settle8421.js');
var fs = require('fs');
var path = require('path');

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

function rowVal(rows, id) {
  var hit = (rows || []).filter(function (row) {
    return row && row.id === id;
  })[0];
  return hit ? String(hit.value) : '';
}

var emptyLib = createLib();
var first = emptyLib.listAll();
var items = first.data.items;
var seeded = byTemplate(items, '8421-3');
var snap = seeded && seeded.ruleSnapshot;
var canon = ruleDefaults.defaultGameplaySnapshot('8421-3', {
  catalogId: '8421-3',
  ruleId: '8421-3'
});
var canon2 = ruleDefaults.defaultGameplaySnapshot('8421-2', { catalogId: '8421-2' });

assert('CASE1 空库首次 seed 含 8421-3', !!(seeded && seeded.name === '3人8421'), seeded && seeded.name);
assert(
  'CASE1 seed 顺序 landlord-mid 后接 8421-3',
  localLib.DEFAULT_LIBRARY_RULE_IDS.indexOf('landlord-mid') >= 0 &&
    localLib.DEFAULT_LIBRARY_RULE_IDS.indexOf('8421-3') ===
      localLib.DEFAULT_LIBRARY_RULE_IDS.indexOf('landlord-mid') + 1
);

assert(
  'CASE2 映射 32/16/8/4/2/1/0',
  rowVal(canon.scoreRows, 'hio') === '32' &&
    rowVal(canon.scoreRows, 'm2') === '16' &&
    rowVal(canon.scoreRows, 'm1') === '8' &&
    rowVal(canon.scoreRows, 'par') === '4' &&
    rowVal(canon.scoreRows, 'p1') === '2' &&
    rowVal(canon.scoreRows, 'p2') === '1' &&
    rowVal(canon.scoreRows, 'p3') === '0' &&
    rowVal(snap.scoreRows, 'hio') === '32' &&
    rowVal(snap.scoreRows, 'p3') === '0'
);

var map = settle8421.fromScoreRows(canon.scoreRows);
assert(
  'CASE2 personalScore 32/16/8/4/2/1/0',
  settle8421.personalScore(-3, map, canon, 4) === 32 &&
    settle8421.personalScore(-2, map, canon, 4) === 16 &&
    settle8421.personalScore(-1, map, canon, 4) === 8 &&
    settle8421.personalScore(0, map, canon, 4) === 4 &&
    settle8421.personalScore(1, map, canon, 4) === 2 &&
    settle8421.personalScore(2, map, canon, 4) === 1 &&
    settle8421.personalScore(3, map, canon, 4) === 0
);

var deduct = {
  deductMode: canon.deductMode,
  deductWay: canon.deductWay,
  deductPlusN: canon.deductPlusN,
  deductCap: canon.deductCap,
  deductCapN: canon.deductCapN
};
assert(
  'CASE3 扣分 +4=-1 +5/+6=-2',
  settle8421.deductScore(4, deduct, 4) === -1 &&
    settle8421.deductScore(5, deduct, 4) === -2 &&
    settle8421.deductScore(6, deduct, 4) === -2,
  JSON.stringify({
    d4: settle8421.deductScore(4, deduct, 4),
    d5: settle8421.deductScore(5, deduct, 4),
    d6: settle8421.deductScore(6, deduct, 4)
  })
);

assert('CASE4 顶洞=得分打平', canon.pushRule === 'tie' && snap.pushRule === 'tie' && settle8421.pushKind(canon) === 'tie');

assert(
  'CASE5 各档吃1块',
  rowVal(canon.meatRows, 'le-2') === '1' &&
    rowVal(canon.meatRows, 'm1') === '1' &&
    rowVal(canon.meatRows, 'par') === '1' &&
    rowVal(canon.meatRows, 'p1') === '1' &&
    rowVal(canon.meatRows, 'ge-2') === '1' &&
    settle8421.meatWanted(canon, -3) === 1 &&
    settle8421.meatWanted(canon, 0) === 1 &&
    settle8421.meatWanted(canon, 5) === 1
);

assert('CASE6 meatValueType=double 且不封顶', canon.meatValueType === 'double' && canon.meatCap === 'none' && snap.meatCap === 'none');
assert('CASE7 包负分默认 none', (canon.baoNeg || 'none') === 'none' && (snap.baoNeg || 'none') === 'none');

var again = emptyLib.listAll();
assert('CASE8 重复进入不重复 seed', again.data.items.length === items.length);
assert('CASE8 8421-3 仍一条', byTemplate(again.data.items, '8421-3').id === seeded.id);

assert(
  '与 8421-2 共用同一套成绩/扣分/肉默认',
  rowVal(canon2.scoreRows, 'hio') === rowVal(canon.scoreRows, 'hio') &&
    String(canon2.deductCapN) === String(canon.deductCapN) &&
    canon2.pushRule === canon.pushRule &&
    canon2.meatValueType === canon.meatValueType &&
    rowVal(canon2.meatRows, 'par') === '1'
);

var existingStore = memStorage();
existingStore.setItem(localLib.STORAGE_KEY, {
  schemaVersion: 4,
  items: [
    {
      id: 'rl_old_8421_3',
      name: '旧三人8421',
      catalogId: '8421-3',
      ruleId: '8421-3',
      sourceTemplateId: '8421-3',
      players: 3,
      revision: 4,
      ruleSnapshot: {
        catalogId: '8421-3',
        scoreRows: [{ id: 'hio', value: '50' }],
        deductCap: 'none',
        baoNeg: 'ahead',
        meatValueType: 'fixed',
        meatRows: [{ id: 'par', value: '9' }]
      }
    }
  ],
  processedSourceTemplateIds: ['stroke-2', 'match-2', '8421-2', 'landlord-mid'],
  dismissedDefaultRuleIds: []
});
var existingLib = createLib(existingStore);
var afterItems = existingLib.listAll().data.items;
var old = byTemplate(afterItems, '8421-3');
assert('已有用户不补第二条 8421-3', afterItems.length === 1);
assert(
  '已有用户不覆盖自定义 snapshot',
  !!(
    old &&
    old.id === 'rl_old_8421_3' &&
    old.revision === 4 &&
    old.ruleSnapshot.deductCap === 'none' &&
    old.ruleSnapshot.baoNeg === 'ahead' &&
    rowVal(old.ruleSnapshot.scoreRows, 'hio') === '50' &&
    rowVal(old.ruleSnapshot.meatRows, 'par') === '9'
  )
);

var missingStore = memStorage();
missingStore.setItem(localLib.STORAGE_KEY, {
  schemaVersion: 4,
  items: [
    {
      id: 'rl_custom_stroke',
      name: '我的比杆',
      catalogId: 'stroke-2',
      ruleId: 'stroke-2',
      sourceTemplateId: 'stroke-2',
      players: 2,
      revision: 1,
      ruleSnapshot: { catalogId: 'stroke-2', reward: 'add' }
    }
  ],
  processedSourceTemplateIds: ['stroke-2', 'match-2', '8421-2', 'landlord-mid'],
  dismissedDefaultRuleIds: []
});
assert('已有库缺 8421-3 不补种', !byTemplate(createLib(missingStore).listAll().data.items, '8421-3'));

var defaultsSrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram/subpackages/game/utils/sideGameRuleDefaults.js'),
  'utf8'
);
assert(
  '8421-2/3 走 apply8421GameplayDefaults',
  defaultsSrc.indexOf('function apply8421GameplayDefaults') >= 0 &&
    defaultsSrc.indexOf('if (id === "8421-3")') >= 0
);

var editSrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram/subpackages/game/pages/edit-rule/index.js'),
  'utf8'
);
assert(
  '新建页 8421-3 初值走 canonical',
  editSrc.indexOf('is8421Canon') >= 0 && editSrc.indexOf('canonSnap.deductCap') >= 0
);

console.log('\nruleLibrary8421ThreeDefaults.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
