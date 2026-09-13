/**
 * 球场名称展示：原始名 + 空格 + A&D（保留选择顺序）
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/courseDisplayName.selftest.js
 */

var path = require('path');
var halfCourse = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'halfCourse.js'));

var passed = 0;
var failed = 0;
var failures = [];

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    failures.push(name + (detail ? ' :: ' + detail : ''));
    console.log('FAIL  ' + name);
  }
}

var club = '北京乡村高尔夫俱乐部';

assert(
  'A+D 保留选择顺序',
  halfCourse.formatCourseDisplayName({
    courseName: club,
    front9Course: 'A',
    back9Course: 'D'
  }) === club + ' A&D'
);

assert(
  'D+A 不排序',
  halfCourse.formatCourseDisplayName({
    courseName: club,
    front9Course: 'D',
    back9Course: 'A'
  }) === club + ' D&A'
);

assert(
  '单半场不虚构第二半场',
  halfCourse.formatCourseDisplayName({
    courseName: club,
    front9Course: 'C',
    back9Course: ''
  }) === club + ' C'
);

assert(
  '无半场只显示球场名',
  halfCourse.formatCourseDisplayName({ courseName: club }) === club
);

assert(
  '空半场不追加括号或 &',
  halfCourse.formatCourseDisplayName({
    courseName: club,
    courseHalfText: ''
  }) === club &&
    halfCourse.formatCourseDisplayName({
      courseName: club,
      courseHalfText: '（）'
    }) === club
);

assert(
  '历史（A/D）展示为 A&D',
  halfCourse.formatCourseDisplayName({
    courseName: club,
    courseHalfText: '（A/D）'
  }) === club + ' A&D'
);

assert(
  '名称已带（A/D）且字段再给 A/D 不重复',
  halfCourse.formatCourseDisplayName({
    courseName: club + '（A/D）',
    front9Course: 'A',
    back9Course: 'D'
  }) === club + ' A&D'
);

assert(
  '已是「名 A&D」再格式化不重复追加',
  halfCourse.formatCourseDisplayName({
    courseName: club + ' A&D',
    front9Course: 'A',
    back9Course: 'D'
  }) === club + ' A&D'
);

assert(
  '正式名括号不被当成半场',
  halfCourse.formatCourseDisplayName({
    courseName: '湖畔高尔夫（国际）'
  }) === '湖畔高尔夫（国际）'
);

assert(
  '清河湾官方名 A&B 兼容显示新主名',
  halfCourse.formatCourseDisplayName({
    courseName: '北京清河湾高尔夫乡村俱乐部 A&B'
  }) === '北京清河湾乡村高尔夫俱乐部 A&B'
);

assert(
  '清河湾官方名选 C&D 显示新主名加所选半场',
  halfCourse.formatCourseDisplayName({
    courseName: '北京清河湾高尔夫乡村俱乐部 A&B',
    front9Course: 'C',
    back9Course: 'D'
  }) === '北京清河湾乡村高尔夫俱乐部 C&D'
);

assert(
  '旧半场球场名 C&D 映射新主名',
  halfCourse.formatCourseDisplayName({
    courseName: '清河湾 C&D'
  }) === '北京清河湾乡村高尔夫俱乐部 C&D'
);

assert(
  '前九备注不解析成半场码',
  halfCourse.formatCourseLineForUi({
    courseName: club,
    courseHalfText: '前九'
  }) === club + ' · 前九'
);

assert(
  'undefined 不进入展示',
  halfCourse.formatCourseDisplayName({
    courseName: club,
    courseHalfText: 'undefined'
  }) === club
);

assert(
  'halfTextFromPayload 写入空格+A&D 无括号',
  halfCourse.halfTextFromPayload({
    halfText: 'A/D',
    front9Course: 'A',
    back9Course: 'D'
  }) === ' A&D'
);

assert(
  '长球场名',
  halfCourse.formatCourseDisplayName({
    courseName: '北京清河湾高尔夫乡村俱乐部国际锦标赛球场',
    front9Course: 'A',
    back9Course: 'B'
  }) === '北京清河湾高尔夫乡村俱乐部国际锦标赛球场 A&B'
);

assert(
  'temporary 空名不追加内部 A&B',
  halfCourse.formatCourseDisplayName({
    courseSource: 'temporary',
    courseName: '',
    front9Course: 'A',
    back9Course: 'B'
  }) === '临时球场'
);

assert(
  'temporary 有名称不追加内部 A&B',
  halfCourse.formatCourseDisplayName({
    courseSource: 'temporary',
    courseName: '我的临时场',
    front9Course: 'A',
    back9Course: 'B'
  }) === '我的临时场'
);

assert(
  '正式球场无 courseSource 仍追加 A&B',
  halfCourse.formatCourseDisplayName({
    courseName: club,
    front9Course: 'A',
    back9Course: 'B'
  }) === club + ' A&B'
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('FAILURES:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
