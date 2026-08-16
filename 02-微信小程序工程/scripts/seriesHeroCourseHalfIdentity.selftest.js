/**
 * SERIES-HERO-COURSE-HALF-IDENTITY
 * Hero 球场条目带半场组合；去重身份 = 球场主体 + 半场，不只 courseId。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesHeroCourseHalfIdentity.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var detailJs = fs.readFileSync(
  path.join(mini, 'subpackages', 'tournament', 'pages', 'detail', 'index.js'),
  'utf8'
);
var viewModel = require(path.join(seriesDir, 'seriesDetailViewModel.js'));

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
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

var club = '北京乡村高尔夫俱乐部';

assert(
  '单轮默认 A/B 明确显示（A/B）',
  viewModel.buildSeriesCourseLines([
    { courseId: 'c1', courseName: club, front9Course: 'A', back9Course: 'B' }
  ]).lines[0] === club + '（A/B）'
);

var acBd = viewModel.buildSeriesCourseLines([
  { courseId: 'c1', courseName: club, front9Course: 'A', back9Course: 'C' },
  { courseId: 'c1', courseName: club, front9Course: 'B', back9Course: 'D' }
]);
assert(
  '同一 courseId：A/C 与 B/D 两个条目，且按轮次首次出现序',
  acBd.lines.length === 2 &&
    acBd.lines[0] === club + '（A/C）' &&
    acBd.lines[1] === club + '（B/D）'
);

var sameAc = viewModel.buildSeriesCourseLines([
  { courseId: 'c1', courseName: club, front9Course: 'A', back9Course: 'C' },
  { courseId: 'c1', courseName: club + ' 东区', front9Course: 'A', back9Course: 'C' }
]);
assert(
  '同一 courseId、同一 A/C 跨多轮去重为一个',
  sameAc.lines.length === 1 && sameAc.lines[0] === club + '（A/C）'
);

var diffId = viewModel.buildSeriesCourseLines([
  { courseId: 'c-east', courseName: club, front9Course: 'A', back9Course: 'B' },
  { courseId: 'c-west', courseName: club, front9Course: 'A', back9Course: 'B' }
]);
assert(
  '不同 courseId、同名、同半场保留两个',
  diffId.lines.length === 2 &&
    diffId.lines[0] === club + '（A/B）' &&
    diffId.lines[1] === club + '（A/B）'
);

var oldName = viewModel.buildSeriesCourseLines([
  { courseId: '', courseName: club + '（A/C）' },
  { courseId: '', courseName: club + '(A/C)' }
]);
assert(
  '无 courseId 旧数据从名称半场后缀 fallback，且中英文括号去重为一个',
  oldName.lines.length === 1 && oldName.lines[0] === club + '（A/C）'
);

assert(
  'courseName 已带（A/C）不重复拼接',
  viewModel.formatSeriesCourseDisplayName({
    courseId: 'c1',
    courseName: club + '（A/C）',
    front9Course: 'A',
    back9Course: 'C'
  }) === club + '（A/C）'
);

var spaced = viewModel.buildSeriesCourseLines([
  { courseId: 'c1', courseName: club, courseHalfText: '（ A / C ）' },
  { courseId: 'c1', courseName: club, courseHalfText: '(A/C)' }
]);
assert(
  '中文/英文括号与空格规范化后同一身份',
  spaced.lines.length === 1 && spaced.lines[0] === club + '（A/C）'
);

assert(
  'C/A 不擅自排成 A/C',
  viewModel.buildSeriesCourseIdentityKey({
    courseId: 'c1',
    courseName: club,
    front9Course: 'C',
    back9Course: 'A'
  }) === 'id:c1|half:C/A' &&
    viewModel.formatSeriesCourseDisplayName({
      courseId: 'c1',
      courseName: club,
      front9Course: 'C',
      back9Course: 'A'
    }) === club + '（C/A）'
);

assert(
  '缺半场字段不编造 A/B',
  viewModel.buildSeriesCourseLines([
    { courseId: 'c1', courseName: club }
  ]).lines[0] === club &&
    viewModel.resolveSeriesRoundHalves({ courseId: 'c1', courseName: club }).source === ''
);

var order = viewModel.buildSeriesCourseLines([
  { courseId: 'c2', courseName: '二号球场', front9Course: 'A', back9Course: 'B' },
  { courseId: 'c1', courseName: '一号球场', front9Course: 'A', back9Course: 'C' },
  { courseId: 'c2', courseName: '二号球场', front9Course: 'A', back9Course: 'B' }
]);
assert(
  '轮次首次出现顺序稳定',
  order.lines.length === 2 &&
    order.lines[0] === '二号球场（A/B）' &&
    order.lines[1] === '一号球场（A/C）'
);

assert(
  '无 courseId 用主体名称+半场 fallback，不同半场不合并',
  viewModel.buildSeriesCourseLines([
    { courseId: '', courseName: club, front9Course: 'A', back9Course: 'C' },
    { courseId: '', courseName: club, front9Course: 'B', back9Course: 'D' }
  ]).lines.length === 2
);

assert(
  '普通 detail 球场标题仍用自身 front9/back9 拼接，不走 Series Hero 投影',
  detailJs.indexOf('_buildScorecardCourseTitle(match)') >= 0 &&
    detailJs.indexOf("return courseName + '（' + front9Course + '/' + back9Course + '）'") >= 0 &&
    detailJs.indexOf('buildSeriesCourseLines') < 0
);

var roundsSnap = [
  { courseId: 'c1', courseName: club, front9Course: 'A', back9Course: 'B' }
];
var before = JSON.stringify(roundsSnap);
viewModel.buildSeriesCourseLines(roundsSnap);
assert('不修改 rounds 输入', JSON.stringify(roundsSnap) === before);

console.log('');
console.log('---- seriesHeroCourseHalfIdentity.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
