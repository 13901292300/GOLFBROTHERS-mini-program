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
catalog.listCatalogForDesign().forEach(function (g) {
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

function idsOf(groups) {
  var out = [];
  (groups || []).forEach(function (g) {
    (g.items || []).forEach(function (item) {
      out.push(item.id);
    });
  });
  return out;
}

var two = idsOf(catalog.listCatalog(2));
var three = idsOf(catalog.listCatalog(3));
var four = idsOf(catalog.listCatalog(4));
var five = idsOf(catalog.listCatalog(5));
assert('2 人目录仅精确 2 人', two.indexOf('stroke-2') >= 0 && two.indexOf('landlord-mid') < 0 && two.indexOf('lasuo-4') < 0 && two.indexOf('horn') < 0);
assert('3 人目录仅精确 3 人', three.indexOf('landlord-mid') >= 0 && three.indexOf('stroke-2') < 0 && three.indexOf('8421-4') < 0);
assert('4 人目录不含多人', four.indexOf('8421-4') >= 0 && four.indexOf('lasuo-4') >= 0 && four.indexOf('horn') < 0 && four.indexOf('lasuo-n') < 0);
assert('5 人目录仅多人', five.indexOf('horn') >= 0 && five.indexOf('lasuo-n') >= 0 && five.indexOf('lasuo-4') < 0 && five.indexOf('stroke-2') < 0);
assert('人数 0 不展示目录', catalog.listCatalog(0).length === 0);
assert('isRuleCompatibleWithPlayerCount 存在', typeof catalog.isRuleCompatibleWithPlayerCount === 'function');
assert('喇叭花不兼容 4 人', catalog.isRuleCompatibleWithPlayerCount(catalog.findRule('horn'), 4) === false);
assert('拉丝三点兼容 4 人', catalog.isRuleCompatibleWithPlayerCount(catalog.findRule('lasuo-4'), 4) === true);

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
