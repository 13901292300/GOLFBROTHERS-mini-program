/**
 * 星河湾国际高尔夫俱乐部：球场库条目与半场标准杆。
 * 标准杆来源为产品提供的 A/B/C 数字串，不是 TEE 码或官方导入表。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/xinghewanCourse.selftest.js
 */
var db = require('../miniprogram/utils/courseDatabase.js');
var halfCourse = require('../miniprogram/utils/halfCourse.js');
var holeLayout = require('../miniprogram/utils/holeLayout.js');

var passed = 0;
var failed = 0;

function assert(label, ok, detail) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
    return;
  }
  failed += 1;
  console.log('FAIL  ' + label + (detail ? ' :: ' + detail : ''));
}

function parFromDigits(s) {
  return String(s).split('').map(function (ch) {
    return Number(ch);
  });
}

var SOURCE_PAR = {
  A: parFromDigits('434544534'),
  B: parFromDigits('454534434'),
  C: parFromDigits('434454345')
};

var ids = db.COURSE_DB.map(function (c) { return c.courseId; });
var unique = {};
var dup = [];
ids.forEach(function (id) {
  if (unique[id]) dup.push(id);
  unique[id] = true;
});
assert('COURSE_DB courseId 唯一', dup.length === 0, String(dup));
assert('未占用已有 ID', ids.indexOf('c-xinghewan') === ids.lastIndexOf('c-xinghewan') && ids.indexOf('c-xinghewan') >= 0);

var course = halfCourse.findCourseById('c-xinghewan');
assert('可按 ID 找到星河湾', !!(course && course.courseName === '星河湾国际高尔夫俱乐部'));
assert('地区为湖南 · 长沙', course && course.location === '湖南 · 长沙');
assert('拼音为星河湾而非星河汪', course && course.pinyin === 'xinghewan' + 'guojigaoerfujulebu');
assert('halfCourseCount 为 3', course && course.halfCourseCount === 3);
assert('halfCourses 长度 3', course && course.halfCourses && course.halfCourses.length === 3);
assert('无猜测坐标', course && course.lat == null && course.lng == null);
assert('searchKeys 不含龙湖/望城', function () {
  var blob = JSON.stringify(course);
  return blob.indexOf('龙湖') < 0 && blob.indexOf('望城') < 0;
}());
assert('searchKeys 仅由名称和地区推导', course && course.searchKeys === '星河湾 星河湾国际 长沙 湖南 xinghewan');

var halves = halfCourse.buildHalves(course);
assert('buildHalves 三项 A/B/C', halves.length === 3 && halves[0].key === 'A' && halves[1].key === 'B' && halves[2].key === 'C');

['A', 'B', 'C'].forEach(function (code, idx) {
  var h = course.halfCourses[idx];
  assert(code + ' 场 9 洞', h.holes === 9 && h.par.length === 9);
  assert(code + ' 场洞号隐含 1-9 且 par 合法', h.par.every(function (p) { return p >= 3 && p <= 5; }));
  assert(code + ' 场 PAR 与产品数字串一致', JSON.stringify(h.par) === JSON.stringify(SOURCE_PAR[code]));
  var tot = h.par.reduce(function (s, v) { return s + v; }, 0);
  assert(code + ' 场总标准杆 36', tot === 36);
});

var layout = holeLayout.buildHoleLayout(course, 'A', 'B');
assert('默认 A/B 布局 18 洞', layout.holePars.length === 18);
assert('A/B 总标准杆 72', layout.columnPars[layout.columnPars.length - 1] === 72);
assert('前九标签 A1-A9', layout.columnLabels[0] === 'A1' && layout.columnLabels[8] === 'A9');
assert('后九标签 B1-B9', layout.columnLabels[10] === 'B1' && layout.columnLabels[18] === 'B9');

var ac = holeLayout.buildHoleLayout(course, 'A', 'C');
assert('可选 A/C 组合总标准杆 72', ac.columnPars[ac.columnPars.length - 1] === 72);

var nearest = db.findNearestCourse(db.FALLBACK_ORIGIN);
assert('北京默认原点附近不是星河湾', nearest && nearest.courseId !== 'c-xinghewan');
assert('findNearestCourse 跳过无坐标球场', db.hasCoords(course) === false && nearest && db.hasCoords(nearest));
assert('useCount 为 0 不进常去', course.useCount === 0);

var views = db.buildCourseDistanceViews(db.FALLBACK_ORIGIN, db.COURSE_DB);
var xhFmt = views.distanceMap['c-xinghewan'];
assert('星河湾 distanceText 为距离未知', xhFmt && xhFmt.distanceText === db.UNKNOWN_DISTANCE_TEXT && xhFmt.known === false && xhFmt.distance == null);
assert('搜索词星河湾仍能命中条目', (course.searchKeys || '').indexOf('星河湾') >= 0 && course.courseName.indexOf('星河湾') >= 0);
var searchItemMeta = course.location + ' · ' + xhFmt.metaText;
assert('搜索星河湾展示距离未知', searchItemMeta === '湖南 · 长沙 · 距离未知');

var nearbyIds = views.nearbyCourses.map(function (item) { return item.courseId; });
assert('有效球场满额时未知坐标不挤占附近列表', nearbyIds.indexOf('c-xinghewan') < 0);
assert('附近列表均为有限距离', views.nearbyCourses.every(function (item) {
  return item.distanceText !== db.UNKNOWN_DISTANCE_TEXT && Number.isFinite(item.distance) && /\d+\.\d km/.test(item.distanceText);
}));

var village = db.COURSE_DB.find(function (c) { return c.courseId === 'BJCC_GOLF_001'; });
var villageFmt = views.distanceMap['BJCC_GOLF_001'];
assert('已有球场仍显示有限距离', village && villageFmt && villageFmt.known && Number.isFinite(villageFmt.distance) && villageFmt.distanceText.indexOf('km') >= 0 && villageFmt.distanceText.indexOf('Infinity') < 0);

var mixed = db.buildCourseDistanceViews(db.FALLBACK_ORIGIN, [course, village], 10);
assert('未知坐标排在有效坐标之后', mixed.nearbyCourses.length === 2 && mixed.nearbyCourses[0].courseId === 'BJCC_GOLF_001' && mixed.nearbyCourses[1].courseId === 'c-xinghewan' && mixed.nearbyCourses[1].distanceText === '距离未知');

var capped = db.buildCourseDistanceViews(db.FALLBACK_ORIGIN, db.COURSE_DB.filter(function (c) {
  return c.courseId !== 'c-xinghewan';
}).slice(0, 9).concat([course]), 10);
assert('有效球场不足上限时未知距离可出现在末位', capped.nearbyCourses.length === 10 && capped.nearbyCourses[9].courseId === 'c-xinghewan' && capped.nearbyCourses[9].distanceText === '距离未知' && capped.nearbyCourses.slice(0, 9).every(function (item) {
  return Number.isFinite(item.distance);
}));

var uiPack = [views.nearbyCourses, Object.keys(views.distanceMap).map(function (id) { return views.distanceMap[id]; }), searchItemMeta];
assert('UI 数据不含 Infinity km / NaN km', function () {
  var text = JSON.stringify(uiPack);
  return text.indexOf('Infinity km') < 0 && text.indexOf('NaN km') < 0 && text.indexOf('"Infinity"') < 0;
}());
assert('formatDistanceMeta 拒绝非有限值', db.formatDistanceMeta(Infinity).distanceText === '距离未知' && db.formatDistanceMeta(NaN).distanceText === '距离未知');

assert('条目不含 TEE/码数字段（本库消费者只用 par）', course.halfCourses.every(function (h) {
  return h.tees == null && h.yardage == null && h.distance == null;
}));

console.log('\npassed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
