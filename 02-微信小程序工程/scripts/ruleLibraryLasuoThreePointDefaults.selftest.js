/**
 * 「我的规则库」首次默认四人拉丝 = 拉丝三点。
 * 运行：node scripts/ruleLibraryLasuoThreePointDefaults.selftest.js
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
  });
}

function rowVal(rows, id) {
  var hit = (rows || []).filter(function (row) {
    return row && row.id === id;
  })[0];
  return hit ? String(hit.value) : '';
}

function meatOf(s) {
  return {
    worse: rowVal(s.meatRows, 'ge-1'),
    par: rowVal(s.meatRows, 'par'),
    birdie: rowVal(s.meatRows, 'm1'),
    eagle: rowVal(s.meatRows, 'le-2')
  };
}

var emptyLib = createLib();
var first = emptyLib.listAll();
var items = first.data.items;
var lasuoAll = byTemplate(items, 'lasuo-4');
var lasuo = lasuoAll[0];
var snap = lasuo && lasuo.ruleSnapshot;
var canon = ruleDefaults.defaultGameplaySnapshot('lasuo-4', {
  catalogId: 'lasuo-4',
  ruleId: 'lasuo-4'
});

assert(
  'seed 已有 lasuo-4 且不重复',
  localLib.DEFAULT_LIBRARY_RULE_IDS.filter(function (id) {
    return id === 'lasuo-4';
  }).length === 1
);

assert('CASE1 空库只有一条 lasuo-4', lasuoAll.length === 1, String(lasuoAll.length));
assert('CASE2 名称=拉丝三点', !!(lasuo && lasuo.name === '拉丝三点' && catalog.lasuoDefaultName(snap) === '拉丝三点'), lasuo && lasuo.name);
assert(
  'CASE3 三点全开',
  !!(snap && snap.pkBetter !== false && snap.pkWorse !== false && snap.pkTotal !== false) &&
    canon.pkBetter === true &&
    canon.pkWorse === true &&
    canon.pkTotal === true
);
assert(
  'CASE4 权重 1/1/1',
  String(snap.pkBetterW) === '1' &&
    String(snap.pkWorseW) === '1' &&
    String(snap.pkTotalW) === '1' &&
    String(canon.pkBetterW) === '1'
);
assert('CASE5 总成绩=和', snap.pkTotalMode === 'sum' && canon.pkTotalMode === 'sum');

var again = emptyLib.listAll();
assert('CASE6 重复进入不重复 seed', again.data.items.length === items.length);
assert('CASE6 lasuo-4 仍一条', byTemplate(again.data.items, 'lasuo-4').length === 1 && byTemplate(again.data.items, 'lasuo-4')[0].id === lasuo.id);

assert(
  'CASE7 未改其它四人默认条数',
  byTemplate(items, '8421-4').length === 1 &&
    byTemplate(items, 'three-vs-one').length === 1 &&
    byTemplate(items, 'lasuo-4').length === 1
);
assert(
  'CASE7 未给拉丝 seed 写入 8421 分值图',
  snap.scoreRows == null && snap.pushPolicy == null && snap.deductMode == null
);
assert(
  'CASE1 默认 reward=add（加法奖励，现有字段不是 additive）',
  snap.reward === 'add' && canon.reward === 'add'
);
assert(
  'CASE2 加法表 PAR0/鸟1/鹰3/HIO10',
  rowVal(snap.addRows, 'par') === '0' &&
    rowVal(snap.addRows, 'm1') === '1' &&
    rowVal(snap.addRows, 'm2') === '3' &&
    rowVal(snap.addRows, 'hio') === '10' &&
    rowVal(canon.addRows, 'par') === '0' &&
    rowVal(canon.addRows, 'm1') === '1' &&
    rowVal(canon.addRows, 'm2') === '3' &&
    rowVal(canon.addRows, 'hio') === '10'
);
assert('CASE3 加法前置=总成绩赢才奖 addPre=win', snap.addPre === 'win' && canon.addPre === 'win');
assert('CASE4 顶洞定义=得分打平 pushRule=push', snap.pushRule === 'push' && canon.pushRule === 'push');
assert(
  'CASE5 canonical 不含 reorderOnPush / pushPolicy（顶洞后排序属 settlement）',
  !Object.prototype.hasOwnProperty.call(canon, 'reorderOnPush') &&
    !Object.prototype.hasOwnProperty.call(canon, 'pushPolicy') &&
    snap.reorderOnPush == null &&
    snap.pushPolicy == null
);
assert(
  'CASE6 吃肉 worse0/par1/birdie2/eagle+3',
  meatOf(snap).worse === '0' &&
    meatOf(snap).par === '1' &&
    meatOf(snap).birdie === '2' &&
    meatOf(snap).eagle === '3',
  JSON.stringify(meatOf(snap))
);
assert(
  'CASE7 肉分值翻倍不含奖励',
  snap.meatValueType === 'double' &&
    snap.meatInclude === 'no' &&
    canon.meatValueType === 'double' &&
    canon.meatInclude === 'no'
);
assert('CASE8 肉值不封顶 meatCap=none', snap.meatCap === 'none' && canon.meatCap === 'none');
assert('CASE9 默认不包洞 baoMode=none', snap.baoMode === 'none' && canon.baoMode === 'none');
assert(
  'CASE10 三点结构三项全开 1/1/1 sum',
  snap.pkBetter === true &&
    snap.pkWorse === true &&
    snap.pkTotal === true &&
    String(snap.pkBetterW) === '1' &&
    String(snap.pkWorseW) === '1' &&
    String(snap.pkTotalW) === '1' &&
    snap.pkTotalMode === 'sum' &&
    canon.pkBetter === true &&
    canon.pkWorse === true &&
    canon.pkTotal === true &&
    String(canon.pkBetterW) === '1' &&
    String(canon.pkWorseW) === '1' &&
    String(canon.pkTotalW) === '1' &&
    canon.pkTotalMode === 'sum'
);
assert(
  'CASE7 8421-4 canonical 仍独立',
  ruleDefaults.defaultGameplaySnapshot('8421-4', { catalogId: '8421-4' }).pushRule === 'tie'
);

var existingStore = memStorage();
existingStore.setItem(localLib.STORAGE_KEY, {
  schemaVersion: 4,
  items: [
    {
      id: 'rl_old_lasuo',
      name: '头尾两点',
      catalogId: 'lasuo-4',
      ruleId: 'lasuo-4',
      sourceTemplateId: 'lasuo-4',
      players: 4,
      revision: 3,
      ruleSnapshot: {
        catalogId: 'lasuo-4',
        pkBetter: true,
        pkWorse: true,
        pkTotal: false,
        pkBetterW: '2',
        pkWorseW: '2',
        pkTotalMode: 'product'
      }
    }
  ],
  processedSourceTemplateIds: localLib.DEFAULT_LIBRARY_RULE_IDS.slice(),
  dismissedDefaultRuleIds: []
});
var after = createLib(existingStore).listAll().data.items;
var old = byTemplate(after, 'lasuo-4')[0];
assert('已有用户不补第二条 lasuo-4', after.length === 1);
assert(
  '已有用户不覆盖自定义三点',
  !!(
    old &&
    old.name === '头尾两点' &&
    old.ruleSnapshot.pkTotal === false &&
    String(old.ruleSnapshot.pkBetterW) === '2' &&
    old.ruleSnapshot.pkTotalMode === 'product' &&
    old.ruleSnapshot.reward == null &&
    old.ruleSnapshot.baoMode == null
  )
);

var defaultsSrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram/subpackages/game/utils/sideGameRuleDefaults.js'),
  'utf8'
);
var libSrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram/subpackages/game/utils/localSideGameRuleLibrary.js'),
  'utf8'
);
assert(
  'canonical helper 唯一',
  defaultsSrc.indexOf('function applyLasuoThreePointDefaults') >= 0 &&
    defaultsSrc.indexOf('id === "lasuo-4"') >= 0 &&
    libSrc.indexOf("snapshot.pkTotalMode = 'sum'") < 0
);

console.log('\nruleLibraryLasuoThreePointDefaults.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
