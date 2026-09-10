/**
 * 「我的规则库」4 人首次默认：4人8421。
 * 运行：node scripts/ruleLibrary8421FourDefaults.selftest.js
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

assert(
  'seed 已有 8421-4 且不重复',
  localLib.DEFAULT_LIBRARY_RULE_IDS.filter(function (id) {
    return id === '8421-4';
  }).length === 1
);

var emptyLib = createLib();
var first = emptyLib.listAll();
var items = first.data.items;
var seeded = byTemplate(items, '8421-4');
var snap = seeded && seeded.ruleSnapshot;
var canon = ruleDefaults.defaultGameplaySnapshot('8421-4', {
  catalogId: '8421-4',
  ruleId: '8421-4'
});
var canon2 = ruleDefaults.defaultGameplaySnapshot('8421-2', { catalogId: '8421-2' });
var canon3 = ruleDefaults.defaultGameplaySnapshot('8421-3', { catalogId: '8421-3' });

assert('CASE1 空库首次 seed 含 8421-4', !!(seeded && seeded.name === '4人8421'), seeded && seeded.name);
assert('CASE1 总数仍为 10', items.length === 10, String(items.length));

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
    settle8421.deductScore(6, deduct, 4) === -2
);

assert('CASE4 顶洞=tie', canon.pushRule === 'tie' && snap.pushRule === 'tie' && settle8421.pushKind(canon) === 'tie');

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
assert('CASE8 8421-4 仍一条', byTemplate(again.data.items, '8421-4').id === seeded.id);

assert(
  'CASE9 8421-2/3/4 共用 helper 且默认一致',
  rowVal(canon2.scoreRows, 'hio') === '32' &&
    rowVal(canon3.scoreRows, 'hio') === '32' &&
    rowVal(canon.scoreRows, 'hio') === '32' &&
    String(canon2.deductCapN) === '2' &&
    String(canon3.deductCapN) === '2' &&
    String(canon.deductCapN) === '2' &&
    canon2.pushRule === 'tie' &&
    canon3.pushRule === 'tie' &&
    canon.pushRule === 'tie' &&
    canon2.meatValueType === 'double' &&
    canon3.meatValueType === 'double' &&
    canon.meatValueType === 'double' &&
    canon2.meatCap === 'none' &&
    canon3.meatCap === 'none' &&
    rowVal(canon2.meatRows, 'par') === '1' &&
    rowVal(canon3.meatRows, 'par') === '1'
);

var existingStore = memStorage();
existingStore.setItem(localLib.STORAGE_KEY, {
  schemaVersion: 4,
  items: [
    {
      id: 'rl_old_8421_4',
      name: '旧四人8421',
      catalogId: '8421-4',
      ruleId: '8421-4',
      sourceTemplateId: '8421-4',
      players: 4,
      revision: 6,
      ruleSnapshot: {
        catalogId: '8421-4',
        scoreRows: [{ id: 'hio', value: '99' }],
        deductCap: 'none',
        baoNeg: 'ahead',
        meatValueType: 'fixed',
        meatRows: [{ id: 'par', value: '7' }]
      }
    }
  ],
  processedSourceTemplateIds: localLib.DEFAULT_LIBRARY_RULE_IDS.slice(),
  dismissedDefaultRuleIds: []
});
var existingLib = createLib(existingStore);
var afterItems = existingLib.listAll().data.items;
var old = byTemplate(afterItems, '8421-4');
assert('已有用户不补第二条 8421-4', afterItems.length === 1);
assert(
  '已有用户不覆盖自定义 snapshot',
  !!(
    old &&
    old.id === 'rl_old_8421_4' &&
    old.revision === 6 &&
    old.ruleSnapshot.deductCap === 'none' &&
    old.ruleSnapshot.baoNeg === 'ahead' &&
    rowVal(old.ruleSnapshot.scoreRows, 'hio') === '99' &&
    rowVal(old.ruleSnapshot.meatRows, 'par') === '7'
  )
);

var defaultsSrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram/subpackages/game/utils/sideGameRuleDefaults.js'),
  'utf8'
);
assert(
  '8421-4 走 apply8421GameplayDefaults',
  defaultsSrc.indexOf('function apply8421GameplayDefaults') >= 0 &&
    defaultsSrc.indexOf('id === "8421-4"') >= 0
);

var editSrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram/subpackages/game/pages/edit-rule/index.js'),
  'utf8'
);
assert(
  '新建页 8421-4 初值走 canonical',
  editSrc.indexOf('is8421Canon') >= 0 && editSrc.indexOf('is8421Four') >= 0
);

console.log('\nruleLibrary8421FourDefaults.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
