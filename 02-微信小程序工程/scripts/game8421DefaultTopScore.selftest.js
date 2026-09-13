/**
 * 8421-2/3/4 默认最高档统一 diff<=-3 → 32。
 * 运行：node scripts/game8421DefaultTopScore.selftest.js
 *
 * 不迁移已有自定义映射；缺省 / fallback / 默认模板才是 32。
 */
if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {}
  };
}

var path = require('path');
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils');
var ruleDefaults = require(path.join(utilsDir, 'sideGameRuleDefaults.js'));
var localLib = require(path.join(utilsDir, 'localSideGameRuleLibrary.js'));
var scoreMapUtil = require(path.join(utilsDir, 'sideGameScoreMap.js'));
var s8421 = require(path.join(utilsDir, 'settle8421.js'));
var settle4 = require(path.join(utilsDir, 'settle8421Four.js'));
var settle3 = require(path.join(utilsDir, 'settle8421Three.js'));

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

var canon2 = ruleDefaults.defaultGameplaySnapshot('8421-2', { catalogId: '8421-2' });
var canon3 = ruleDefaults.defaultGameplaySnapshot('8421-3', { catalogId: '8421-3' });
var canon4 = ruleDefaults.defaultGameplaySnapshot('8421-4', { catalogId: '8421-4' });
var codeMap = scoreMapUtil.expandScoreCode('8421');

assert(
  '8421-2 默认 <=-3 = 32',
  rowVal(canon2.scoreRows, 'hio') === '32' &&
    s8421.personalScore(-3, s8421.fromScoreRows(canon2.scoreRows), canon2, 4) === 32
);
assert(
  '8421-3 默认 <=-3 = 32',
  rowVal(canon3.scoreRows, 'hio') === '32' &&
    s8421.personalScore(-3, s8421.fromScoreRows(canon3.scoreRows), canon3, 4) === 32
);
assert(
  '8421-4 默认 <=-3 = 32',
  rowVal(canon4.scoreRows, 'hio') === '32' &&
    s8421.personalScore(-3, s8421.fromScoreRows(canon4.scoreRows), canon4, 4) === 32
);
assert(
  '快捷码 8421 fallback hio=32',
  codeMap.hio === 32 && s8421.personalScore(-3, codeMap, canon2, 4) === 32
);
assert(
  '三者默认表同一套 32/16/8/4/2/1/0',
  rowVal(canon2.scoreRows, 'hio') === rowVal(canon3.scoreRows, 'hio') &&
    rowVal(canon3.scoreRows, 'hio') === rowVal(canon4.scoreRows, 'hio') &&
    String(ruleDefaults.SCORE_MAP_VALUES[0]) === '32'
);

var customRows = [
  { id: 'hio', value: '50' },
  { id: 'm2', value: '16' },
  { id: 'm1', value: '8' },
  { id: 'par', value: '4' },
  { id: 'p1', value: '2' },
  { id: 'p2', value: '1' },
  { id: 'p3', value: '0' }
];
var customMap = s8421.fromScoreRows(customRows);
assert('自定义 <=-3=50 仍按 50 结算', s8421.personalScore(-3, customMap, canon4, 4) === 50);
assert(
  '自定义其它值 99 不被默认 32 替换',
  s8421.personalScore(-3, s8421.fromScoreRows([{ id: 'hio', value: '99' }]), canon2, 4) === 99
);

var fourCustom = settle4.settle(
  {
    catalogId: '8421-4',
    players: ['A', 'B', 'C', 'D'].map(function (id) {
      return { id: id, scoreRows: customRows };
    }),
    playerOrder: ['A', 'B', 'C', 'D'],
    groupMode: 'fixed',
    multiplier: 1,
    holes: [{ label: 'H1', on: true }],
    ruleSnapshot: Object.assign({}, canon4, { scoreRows: customRows, pushRule: 'none' })
  },
  {
    holeOrder: ['H1'],
    pars: { H1: 4 },
    scores: { H1: { A: -3, B: 0, C: 0, D: 0 } },
    windOn: false
  }
);
assert(
  '已有实例自定义 50：四人洞 A<=-3 映射 50 不是 32',
  scoreMapUtil.resolveScoreMap({}, { scoreRows: customRows }, canon4).hio === 50 &&
    Number(fourCustom.byHole.H1.A) === 46 &&
    Number(fourCustom.byHole.H1.B) === 46,
  JSON.stringify(fourCustom.byHole.H1)
);

var threeCustom = settle3.settle(
  {
    catalogId: '8421-3',
    players: ['A', 'B', 'C'].map(function (id) {
      return { id: id, scoreRows: customRows };
    }),
    playerOrder: ['A', 'B', 'C'],
    groupMode: 'fixed',
    multiplier: 1,
    holes: [{ label: 'H1', on: true }],
    ruleSnapshot: Object.assign({}, canon3, { scoreRows: customRows, pushRule: 'none' })
  },
  {
    holeOrder: ['H1'],
    pars: { H1: 4 },
    scores: { H1: { A: -3, B: 0, C: 0 } },
    windOn: false
  }
);
assert(
  '已有实例自定义 50：三人洞不被默认 32 覆盖',
  Number(threeCustom.byHole.H1.A) !== 0 &&
    scoreMapUtil.resolveScoreMap({}, { id: 'A', scoreRows: customRows }, canon3).hio === 50,
  JSON.stringify(threeCustom.byHole.H1)
);

var existingStore = memStorage();
existingStore.setItem(localLib.STORAGE_KEY, {
  schemaVersion: 4,
  items: [
    {
      id: 'rl_custom_8421_4',
      name: '自定义四人',
      catalogId: '8421-4',
      ruleId: '8421-4',
      sourceTemplateId: '8421-4',
      players: 4,
      revision: 3,
      ruleSnapshot: { catalogId: '8421-4', scoreRows: [{ id: 'hio', value: '50' }] }
    }
  ],
  processedSourceTemplateIds: localLib.DEFAULT_LIBRARY_RULE_IDS.slice(),
  dismissedDefaultRuleIds: []
});
var lib = localLib.createLocalSideGameRuleLibrary({
  storage: existingStore,
  clock: function () {
    return 1;
  }
});
var kept = lib.listAll().data.items.filter(function (item) {
  return item.id === 'rl_custom_8421_4';
})[0];
assert(
  '规则库已有自定义 50 不被默认 32 覆盖',
  !!(kept && rowVal(kept.ruleSnapshot.scoreRows, 'hio') === '50' && kept.revision === 3)
);

console.log('passed ' + passed + ' / failed ' + failed);
if (failed) process.exit(1);
