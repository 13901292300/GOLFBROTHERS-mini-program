/**
 * holeOrder 纯洞序专项。
 * 运行：node scripts/sideGameHoleOrder.selftest.js
 */
var holeOrder = require('../miniprogram/subpackages/game/utils/holeOrder.js');
var fixtures = require('./lib/sideGameFixtures.js');

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

var full = holeOrder.defaultHoleOrder();
assert('词表 18 洞 A1–B9', full.length === 18 && full[0] === 'A1' && full[17] === 'B9');

var injected = holeOrder.uniqueLabels(['B9', 'B9', ' A1 ', '', 'A2']);
assert(
  'uniqueLabels 不去词表补洞',
  JSON.stringify(injected) === JSON.stringify(['B9', 'A1', 'A2'])
);

var normalized = holeOrder.normalizeHoleOrder(['B1', 'A1']);
assert(
  'normalize 正序补齐词表',
  normalized.length === 18 && normalized[0] === 'B1' && normalized[1] === 'A1' && normalized[2] === 'A2'
);

var front = holeOrder.normalizeHoleOrder(['A3', 'A1'], fixtures.FRONT9);
assert(
  '前九注入 vocab 不补后九',
  JSON.stringify(front) === JSON.stringify(['A3', 'A1', 'A2', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9'])
);

var back = holeOrder.normalizeHoleOrder(['B9'], fixtures.BACK9);
assert('后九注入 vocab', back[0] === 'B9' && back.length === 9 && back.indexOf('A1') < 0);

var rotated = holeOrder.rotateHoleOrderToStart(full, 'B1');
assert(
  '后九起：B1 起接 A 面',
  rotated[0] === 'B1' && rotated[8] === 'B9' && rotated[9] === 'A1' && rotated[17] === 'A9'
);

assert('holeOrderTextOf 正序', holeOrder.holeOrderTextOf(full) === 'A1起');
assert(
  'orderHoles fillMissing',
  holeOrder.orderHoles([], fixtures.FRONT9, true).map(function (h) {
    return h.label;
  }).join(',') === fixtures.FRONT9.join(',')
);

console.log('\nsideGameHoleOrder.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
