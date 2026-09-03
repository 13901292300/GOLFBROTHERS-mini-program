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

var eastSouth = [];
var i;
for (i = 1; i <= 9; i++) eastSouth.push('东' + i);
for (i = 1; i <= 9; i++) eastSouth.push('南' + i);
assert(
  '2 创建 A/C 不会被 normalize 成 A/B',
  holeOrder.normalizeHoleOrder(['A1', 'C1', 'A2', 'C2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9']).indexOf('B1') < 0
);
assert(
  '自定义洞号不被默认词表吞掉',
  holeOrder.normalizeHoleOrder(eastSouth).join(',') === eastSouth.join(',')
);
assert(
  'resolve 优先已保存调整',
  holeOrder.resolveHoleOrder({
    created: eastSouth,
    adjusted: eastSouth.slice(9).concat(eastSouth.slice(0, 9))
  })[0] === '南1'
);
assert(
  '无调整用创建快照',
  holeOrder.resolveHoleOrder({ created: eastSouth, adjusted: [] })[0] === '东1'
);
assert(
  '15 全空才兜底 A/B',
  holeOrder.usedDefaultAbFallback({}) && holeOrder.resolveHoleOrder({})[0] === 'A1'
);
assert(
  '过期 A/B 调整不能覆盖真实创建洞号',
  holeOrder.resolveHoleOrder({ created: eastSouth, adjusted: full })[0] === '东1'
);

var recs = holeOrder.buildHoleRecords(eastSouth, { pars: { 东1: 3, 南1: 5 } });
var moved = holeOrder.moveHoleOrderIndex(eastSouth, 0, 9);
var ordered = holeOrder.orderRecordsByIds(recs, moved);
assert(
  '10 拖动后 par 跟随 holeId',
  ordered[0].holeId === '东2' && ordered[8].holeId === '南1' && ordered[8].par === 5 && ordered[9].holeId === '东1' && ordered[9].par === 3
);

console.log('\nsideGameHoleOrder.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
