/**
 * 清河湾测试球场合并：单主记录、A/B 新 PAR、C/D 原样、别名与 revision 兼容。
 * 运行：node scripts/qinghewanCourseMerge.selftest.js
 */
if (!global.wx) {
  var memStore = Object.create(null);
  global.wx = {
    getStorageSync: function (key) { return memStore[key]; },
    setStorageSync: function (key, value) { memStore[key] = value; },
    removeStorageSync: function (key) { delete memStore[key]; }
  };
}

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

function sameArr(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

var visible = db.listVisibleCourses();
var qhwHits = visible.filter(function (c) {
  return c.courseId === 'c-qhw' || c.courseId === 'c-honghua' || (c.courseName && c.courseName.indexOf('清河湾') >= 0);
});
assert('可见列表只有一条清河湾', qhwHits.length === 1 && qhwHits[0].courseId === 'c-qhw');
assert('COURSE_DB 无 c-honghua 主记录', db.COURSE_DB.every(function (c) { return c.courseId !== 'c-honghua'; }));
assert('c-honghua 映射到 c-qhw', db.canonicalCourseId('c-honghua') === 'c-qhw');
assert('findCourseById(c-honghua) 得到主记录', db.findCourseById('c-honghua') === db.findCourseById('c-qhw'));

var course = halfCourse.findCourseById('c-qhw');
assert('主名称为北京清河湾乡村高尔夫俱乐部', course && course.courseName === '北京清河湾乡村高尔夫俱乐部');
assert('四个半场', course && course.halfCourseCount === 4 && course.halfCourses.length === 4);

assert('A PAR', sameArr(course.halfCourses[0].par, db.QHW_PAR_A) && course.halfCourses[0].par.reduce(function (s, v) { return s + v; }, 0) === 36);
assert('B PAR', sameArr(course.halfCourses[1].par, db.QHW_PAR_B) && course.halfCourses[1].par.reduce(function (s, v) { return s + v; }, 0) === 36);
assert('C PAR 保留', sameArr(course.halfCourses[2].par, db.QHW_PAR_C));
assert('D PAR 保留', sameArr(course.halfCourses[3].par, db.QHW_PAR_D));

var catalogAB = holeLayout.buildHoleLayout(course, 'A', 'B', { courseLayoutRevision: db.COURSE_LAYOUT_REVISION });
assert('A&B 18 洞', catalogAB.holePars.length === 18);
assert('A&B 总 PAR 72', catalogAB.columnPars[catalogAB.columnPars.length - 1] === 72);
assert('catalog A 逐洞', sameArr(catalogAB.holePars.slice(0, 9), db.QHW_PAR_A));
assert('catalog B 逐洞', sameArr(catalogAB.holePars.slice(9, 18), db.QHW_PAR_B));

var legacyAB = holeLayout.buildHoleLayout(course, 'A', 'B', { courseId: 'c-qhw' });
assert('无 revision 的 A/B 用 legacy PAR', sameArr(legacyAB.holePars.slice(0, 9), db.QHW_LEGACY_AB_PAR));
assert('无 revision 的 B 用 legacy PAR', sameArr(legacyAB.holePars.slice(9, 18), db.QHW_LEGACY_AB_PAR));

var cd = holeLayout.buildHoleLayout(course, 'C', 'D', { courseId: 'c-honghua' });
assert('C/D 无 revision 仍用目录 PAR', sameArr(cd.holePars.slice(0, 9), db.QHW_PAR_C) && sameArr(cd.holePars.slice(9, 18), db.QHW_PAR_D));
var cd2 = holeLayout.buildHoleLayout(course, 'C', 'D', { courseLayoutRevision: 2 });
assert('C/D catalog 与无 revision 一致', sameArr(cd.holePars, cd2.holePars));

assert('按旧名找到球场', halfCourse.findCourseByName('清河湾 C&D') && halfCourse.findCourseByName('清河湾 C&D').courseId === 'c-qhw');
assert('按旧官方名找到球场', halfCourse.findCourseByName('北京清河湾高尔夫乡村俱乐部 A&B').courseId === 'c-qhw');
assert('无空格 C&D 可解析', halfCourse.findCourseByName('北京清河湾乡村高尔夫俱乐部C&D').courseId === 'c-qhw');

assert(
  '展示 A&B',
  halfCourse.formatCourseDisplayName({ courseId: 'c-qhw', front9Course: 'A', back9Course: 'B', courseName: '清河湾 A&B' }) ===
    '北京清河湾乡村高尔夫俱乐部 A&B'
);
assert(
  '展示 C&D',
  halfCourse.formatCourseDisplayName({ courseId: 'c-honghua', front9Course: 'C', back9Course: 'D', courseName: '清河湾 C&D' }) ===
    '北京清河湾乡村高尔夫俱乐部 C&D'
);
assert(
  '锦标赛球场不误伤',
  halfCourse.formatCourseDisplayName({
    courseName: '北京清河湾高尔夫乡村俱乐部国际锦标赛球场',
    front9Course: 'A',
    back9Course: 'B'
  }) === '北京清河湾高尔夫乡村俱乐部国际锦标赛球场 A&B'
);

db.applyQinghewanCatalogCompat();
db.applyQinghewanCatalogCompat();
assert('重复兼容不新增球场', db.COURSE_DB.filter(function (c) { return c.courseId === 'c-qhw'; }).length === 1);
assert('幂等后仍无 honghua 记录', db.COURSE_DB.filter(function (c) { return c.courseId === 'c-honghua'; }).length === 0);

var qCount = db.COURSE_DB.filter(function (c) { return String(c.courseName || '').indexOf('清河湾') >= 0; }).length;
assert('库内清河湾名称不重复', qCount === 1);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
process.exit(0);
