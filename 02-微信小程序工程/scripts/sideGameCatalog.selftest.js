/**
 * catalog 纯数据查找专项。
 * 运行：node scripts/sideGameCatalog.selftest.js
 */
var path = require('path');
var fs = require('fs');
var fixtures = require('./lib/sideGameFixtures.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var engine = require('../miniprogram/subpackages/game/utils/sideGameEngine.js');

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

var rules = engine.listRules();
var ids = rules.map(function (item) {
  return item.id;
});
assert('正式规则数量为 17', rules.length === 17 && fixtures.ALL_RULE_IDS.length === 17);
assert(
  'ruleId 清单与固化表一致',
  JSON.stringify(ids) === JSON.stringify(fixtures.ALL_RULE_IDS)
);

var seen = {};
var unique = true;
ids.forEach(function (id) {
  if (seen[id]) unique = false;
  seen[id] = true;
  var hit = catalog.findRule(id);
  var viaEngine = engine.findRule(id);
  assert('findRule 唯一命中 ' + id, !!hit && hit.id === id && viaEngine && viaEngine.id === id);
});
assert('无重复 ruleId', unique);
assert('未知 ruleId 返回空', catalog.findRule('not-a-rule') == null);

assert('listCatalog(2) 不含 hidden skins', !JSON.stringify(catalog.listCatalog(2)).includes('skins'));
assert('listCatalog(4) 仍不含 hidden skins', !JSON.stringify(catalog.listCatalog(4)).includes('"id":"skins"'));

var openIds = [];
catalog.listCatalog(8).forEach(function (g) {
  (g.items || []).forEach(function (item) {
    openIds.push(item.id);
  });
});
assert('当前可用 16 种', openIds.length === 16, String(openIds.length));
assert('三局已开放', openIds.indexOf('three-set') >= 0 && !catalog.isUnavailableRule('three-set'));
assert('油菜已开放', openIds.indexOf('youcai') >= 0 && !catalog.isUnavailableRule('youcai'));
assert('斗小地主已开放', openIds.indexOf('landlord-small') >= 0 && !catalog.isUnavailableRule('landlord-small'));
['skins'].forEach(function (id) {
  assert('未完成仍可 findRule ' + id, !!catalog.findRule(id));
  assert('目录隐藏 ' + id, openIds.indexOf(id) < 0);
  assert('isUnavailableRule ' + id, catalog.isUnavailableRule(id));
});
assert('比杆仍开放', !catalog.isUnavailableRule('stroke-2') && openIds.indexOf('stroke-2') >= 0);

var src = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils', 'catalog.js'),
  'utf8'
);
assert('catalog 无 require', src.indexOf('require(') < 0);
assert('catalog 无 session', src.indexOf('session') < 0);
assert('catalog 无 Storage', src.indexOf('Storage') < 0 && src.indexOf('getStorage') < 0);

assert('summarizeRule 为纯函数', typeof catalog.summarizeRule === 'function');
assert('rankTriColor 为纯函数', typeof catalog.rankTriColor === 'function');
assert('listCatalog 为纯函数', typeof catalog.listCatalog === 'function');

console.log('\nsideGameCatalog.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
