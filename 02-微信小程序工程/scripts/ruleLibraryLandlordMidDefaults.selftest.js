/**
 * 「我的规则库」3 人首次默认：斗二地主。
 * 运行：node scripts/ruleLibraryLandlordMidDefaults.selftest.js
 */
var fs = require('fs');
var path = require('path');

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

function threePlayerExact(items) {
  return (items || []).filter(function (item) {
    var cap = catalog.rulePlayerCapability(item);
    return cap.playerMode === 'exact' && Number(cap.playerCount) === 3;
  });
}

function rowVal(rows, id) {
  var hit = (rows || []).filter(function (row) {
    return row && row.id === id;
  })[0];
  return hit ? String(hit.value) : '';
}

function meatOf(snap) {
  return {
    worse: rowVal(snap.meatRows, 'ge-1'),
    par: rowVal(snap.meatRows, 'par'),
    birdie: rowVal(snap.meatRows, 'm1'),
    eagle: rowVal(snap.meatRows, 'le-2')
  };
}

var emptyLib = createLib();
var first = emptyLib.listAll();
var items = first.data.items;
var three = threePlayerExact(items);
var threeIds = three.map(function (item) {
  return item.sourceTemplateId || item.catalogId;
});

assert(
  'CASE1 空库首次 seed 含 landlord-mid',
  !!byTemplate(items, 'landlord-mid') && threeIds.indexOf('landlord-mid') >= 0,
  threeIds.join(',')
);
assert(
  'CASE1 3人默认顺序仅斗二地主',
  threeIds.join(',') === 'landlord-mid' && three[0] && three[0].name === '斗二地主',
  threeIds.join(',')
);
assert(
  '现状：首次 seed 不含斗大地主/斗小地主/3人8421',
  !byTemplate(items, 'landlord-big') &&
    !byTemplate(items, 'landlord-small') &&
    !byTemplate(items, '8421-3')
);

var mid = byTemplate(items, 'landlord-mid');
var snap = mid && mid.ruleSnapshot;
var canon = ruleDefaults.defaultGameplaySnapshot('landlord-mid', {
  catalogId: 'landlord-mid',
  ruleId: 'landlord-mid'
});

assert('CASE4 默认 reward=mul', !!(snap && snap.reward === 'mul' && canon.reward === 'mul'));
assert(
  'CASE5 默认倍数 PAR1/鸟2/鹰5/HIO10',
  rowVal(snap.mulRows, 'par') === '1' &&
    rowVal(snap.mulRows, 'm1') === '2' &&
    rowVal(snap.mulRows, 'm2') === '5' &&
    rowVal(snap.mulRows, 'hio') === '10' &&
    rowVal(canon.mulRows, 'par') === '1' &&
    rowVal(canon.mulRows, 'm1') === '2' &&
    rowVal(canon.mulRows, 'm2') === '5' &&
    rowVal(canon.mulRows, 'hio') === '10',
  JSON.stringify({
    par: rowVal(snap.mulRows, 'par'),
    m1: rowVal(snap.mulRows, 'm1'),
    m2: rowVal(snap.mulRows, 'm2'),
    hio: rowVal(snap.mulRows, 'hio')
  })
);
assert(
  'CASE6 默认顶洞=得分打平',
  snap.pushRule === 'push' || snap.pushRule === 'tie',
  String(snap && snap.pushRule)
);
assert(
  'CASE7 默认吃肉 worse0/par1/birdie2/eagle+3',
  meatOf(snap).worse === '0' &&
    meatOf(snap).par === '1' &&
    meatOf(snap).birdie === '2' &&
    meatOf(snap).eagle === '3',
  JSON.stringify(meatOf(snap))
);
assert('CASE8 默认肉不含奖励', snap.meatInclude === 'no');
assert('CASE9 默认不包洞', snap.baoMode === 'none');
assert(
  'canonical 不含 reorderOnPush 产品字段',
  !Object.prototype.hasOwnProperty.call(canon, 'reorderOnPush')
);

var again = emptyLib.listAll();
assert('CASE2 重复进入不重复 seed landlord-mid', again.data.items.length === items.length);
assert(
  'CASE2 landlord-mid 仍一条且 ID 稳定',
  byTemplate(again.data.items, 'landlord-mid').id === mid.id
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
  processedSourceTemplateIds: ['stroke-2', 'match-2', '8421-2'],
  dismissedDefaultRuleIds: []
});
var missingLib = createLib(missingStore);
var missingItems = missingLib.listAll().data.items;
assert('CASE3 已有库缺 landlord-mid 不补种', !byTemplate(missingItems, 'landlord-mid'));
assert('CASE3 条数仍为 1', missingItems.length === 1);

var customStore = memStorage();
customStore.setItem(localLib.STORAGE_KEY, {
  schemaVersion: 4,
  items: [
    {
      id: 'rl_custom_mid',
      name: '旧斗二地主',
      catalogId: 'landlord-mid',
      ruleId: 'landlord-mid',
      sourceTemplateId: 'landlord-mid',
      players: 3,
      revision: 9,
      ruleSnapshot: {
        catalogId: 'landlord-mid',
        reward: 'none',
        pushRule: 'none',
        meatInclude: 'yes',
        baoMode: 'plus-n',
        baoPlusN: '6',
        meatRows: [
          { id: 'le-2', value: '全部' },
          { id: 'm1', value: '9' },
          { id: 'par', value: '8' },
          { id: 'ge-1', value: '7' }
        ]
      }
    }
  ],
  processedSourceTemplateIds: localLib.DEFAULT_LIBRARY_RULE_IDS.slice(),
  dismissedDefaultRuleIds: []
});
var customLib = createLib(customStore);
var customItems = customLib.listAll().data.items;
var custom = byTemplate(customItems, 'landlord-mid');
var cs = custom && custom.ruleSnapshot;
assert('CASE10 条数不变', customItems.length === 1);
assert(
  'CASE10 不覆盖自定义 snapshot',
  !!(
    custom &&
    custom.id === 'rl_custom_mid' &&
    custom.revision === 9 &&
    cs.reward === 'none' &&
    cs.pushRule === 'none' &&
    cs.meatInclude === 'yes' &&
    cs.baoMode === 'plus-n' &&
    String(cs.baoPlusN) === '6' &&
    rowVal(cs.meatRows, 'm1') === '9' &&
    rowVal(cs.meatRows, 'par') === '8'
  ),
  JSON.stringify(cs)
);

var editSrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram/subpackages/game/pages/edit-rule/index.js'),
  'utf8'
);
var editWxml = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram/subpackages/game/pages/edit-rule/index.wxml'),
  'utf8'
);

assert(
  'CASE11 新建页初值来自 defaultGameplaySnapshot',
  editSrc.indexOf('defaultGameplaySnapshot(ruleId') >= 0 &&
    editSrc.indexOf('landlordMidMeatRows') >= 0 &&
    editSrc.indexOf('isMid') >= 0 &&
    editSrc.indexOf('canonSnap') >= 0
);
assert(
  'CASE11 seed snapshot 与 canonical 一致',
  snap.reward === canon.reward &&
    snap.pushRule === canon.pushRule &&
    snap.meatInclude === canon.meatInclude &&
    snap.baoMode === canon.baoMode &&
    rowVal(snap.mulRows, 'hio') === rowVal(canon.mulRows, 'hio') &&
    rowVal(snap.meatRows, 'le-2') === rowVal(canon.meatRows, 'le-2') &&
    rowVal(snap.meatRows, 'ge-1') === rowVal(canon.meatRows, 'ge-1')
);

assert(
  'CASE12 斗二地主无顶洞重排可编辑项',
  editSrc.indexOf('showLandlordReorder: (isLandlord && !isMid)') >= 0 &&
    editWxml.indexOf('wx:if="{{showLandlordReorder}}"') >= 0 &&
    editWxml.indexOf('顶洞时固定不换组合') < 0
);

assert(
  'buildDefaultRule 走 canonical',
  fs
    .readFileSync(
      path.join(__dirname, '..', 'miniprogram/subpackages/game/utils/localSideGameRuleLibrary.js'),
      'utf8'
    )
    .indexOf('ruleDefaults.defaultGameplaySnapshot') >= 0
);

console.log('\nruleLibraryLandlordMidDefaults.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
