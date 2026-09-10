/**
 * 新建编队默认：乱拉 / 乱斗；地主婆 = 二地主婆。
 * 运行：node scripts/ruleLibraryFormationDefaults.selftest.js
 */
if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {}
  };
}

var ruleDefaults = require('../miniprogram/subpackages/game/utils/sideGameRuleDefaults.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var localLib = require('../miniprogram/subpackages/game/utils/localSideGameRuleLibrary.js');

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

function rowVal(rows, id) {
  var hit = (rows || []).filter(function (row) {
    return row && row.id === id;
  })[0];
  return hit ? String(hit.value) : '';
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

var dizCanon = ruleDefaults.defaultGameplaySnapshot('dizhubo-4', {
  catalogId: 'dizhubo-4',
  ruleId: 'dizhubo-4'
});

assert('CASE1 新建地主婆 dizhuboMode=mid（二地主婆）', dizCanon.dizhuboMode === 'mid');
assert(
  'CASE1 与 defaultDizhuboMode(无 existing) 同源',
  ruleDefaults.defaultDizhuboMode(null) === 'mid' &&
    ruleDefaults.defaultDizhuboMode(undefined) === 'mid'
);
assert('CASE2 地主婆 groupMode=random（乱斗）', dizCanon.groupMode === 'random');
assert(
  'CASE2 与 defaultGroupMode(dizhubo-4) 同源',
  ruleDefaults.defaultGroupMode('dizhubo-4') === 'random'
);
assert('地主婆 reward=mul', dizCanon.reward === 'mul');
assert(
  '地主婆倍数 PAR1/鸟2/鹰5/HIO10',
  rowVal(dizCanon.mulRows, 'par') === '1' &&
    rowVal(dizCanon.mulRows, 'm1') === '2' &&
    rowVal(dizCanon.mulRows, 'm2') === '5' &&
    rowVal(dizCanon.mulRows, 'hio') === '10'
);

ruleDefaults.PULL_FORMATION_TEMPLATE_IDS.forEach(function (id) {
  if (ruleDefaults.usesSortUpdateFormation(id)) {
    assert(
      'CASE3 ' + id + ' 新建 sortUpdate=dynamic（乱拉）',
      ruleDefaults.defaultSortUpdate(null) === 'dynamic' &&
        ruleDefaults.defaultGameplaySnapshot(id, { catalogId: id }).sortUpdate === 'dynamic'
    );
  } else {
    assert(
      'CASE3 ' + id + ' 新建默认乱拉 groupMode=random',
      ruleDefaults.defaultGroupMode(id) === 'random'
    );
  }
});

ruleDefaults.FIGHT_FORMATION_TEMPLATE_IDS.forEach(function (id) {
  assert(
    'CASE4 ' + id + ' 新建默认乱斗 groupMode=random',
    ruleDefaults.defaultGroupMode(id) === 'random',
    String(ruleDefaults.defaultGroupMode(id))
  );
});

function hasId(list, id) {
  return (list || []).some(function (item) {
    return item && item.id === id;
  });
}

assert(
  'CASE5 GROUP_MODES 仍含 乱拉/固拉/高手不见面',
  hasId(catalog.GROUP_MODES, 'random') &&
    hasId(catalog.GROUP_MODES, 'fixed') &&
    hasId(catalog.GROUP_MODES, 'split-high')
);
assert(
  'CASE5 LANDLORD_GROUP_MODES 仍含 乱斗/固斗/高手不见面',
  hasId(catalog.LANDLORD_GROUP_MODES, 'random') &&
    hasId(catalog.LANDLORD_GROUP_MODES, 'fixed') &&
    hasId(catalog.LANDLORD_GROUP_MODES, 'split-high')
);
assert(
  'CASE5 DIZHUBO_GROUP_MODES 仍含 乱斗/固斗',
  hasId(catalog.DIZHUBO_GROUP_MODES, 'random') && hasId(catalog.DIZHUBO_GROUP_MODES, 'fixed')
);

assert(
  'CASE6 existing 地主婆保持 big+fixed',
  ruleDefaults.defaultDizhuboMode({ dizhuboMode: 'big' }) === 'big' &&
    ruleDefaults.defaultGroupMode('dizhubo-4', { groupMode: 'fixed' }) === 'fixed'
);
assert(
  'CASE6 existing 拉丝保持固拉',
  ruleDefaults.defaultGroupMode('lasuo-4', { groupMode: 'fixed' }) === 'fixed'
);
assert(
  'CASE6 existing 缺 groupMode 的旧地主婆仍 implicit 固斗',
  ruleDefaults.defaultGroupMode('dizhubo-4', { id: 'old' }) === 'fixed'
);
assert(
  'CASE6 existing lasuo-n 保持固拉 sortUpdate',
  ruleDefaults.defaultSortUpdate({ sortUpdate: 'fixed' }) === 'fixed'
);

var emptyLib = localLib.createLocalSideGameRuleLibrary({
  storage: memStorage(),
  clock: function () {
    return 1;
  }
});
var seeded = emptyLib.listAll().data.items;
var lasuoSeed = (seeded || []).filter(function (item) {
  return item.sourceTemplateId === 'lasuo-4' || item.catalogId === 'lasuo-4';
})[0];
assert(
  'CASE7 首次 seed 拉丝三点与新建 defaultGroupMode 同为乱拉',
  ruleDefaults.defaultGroupMode('lasuo-4') === 'random' &&
    ruleDefaults.defaultGroupMode('lasuo-4', null) ===
      ruleDefaults.defaultGroupMode('lasuo-4', undefined)
);
assert(
  'CASE7 地主婆 canonical 与新建 helper 一致',
  dizCanon.dizhuboMode === ruleDefaults.defaultDizhuboMode() &&
    dizCanon.groupMode === ruleDefaults.defaultGroupMode('dizhubo-4')
);
assert('CASE7 空库 seed 仍含 lasuo-4', !!lasuoSeed);

console.log('\nruleLibraryFormationDefaults.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
