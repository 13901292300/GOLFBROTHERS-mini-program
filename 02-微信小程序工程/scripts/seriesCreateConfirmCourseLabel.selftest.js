/**
 * 创建系列赛最后一页「轮次摘要」：同日多场地 ROUND → COURSE
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesCreateConfirmCourseLabel.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var createDir = path.join(mini, 'subpackages', 'create', 'pages', 'series');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');

var basicInfoDraft = require(path.join(createDir, 'basicInfoDraft.js'));
var sameDay = require(path.join(mini, 'utils', 'seriesSameDayMultiCourse.js'));
var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));

var pageJs = fs.readFileSync(path.join(createDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(createDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(createDir, 'index.wxss'), 'utf8');
var draftSrc = fs.readFileSync(path.join(createDir, 'basicInfoDraft.js'), 'utf8');
var labelsSrc = fs.readFileSync(
  path.join(mini, 'utils', 'seriesRoundDisplayLabels.js'),
  'utf8'
);
var manageSrc = fs.readFileSync(path.join(seriesDir, 'seriesManageRoundPicker.js'), 'utf8');
var scheduleSrc = fs.readFileSync(path.join(seriesDir, 'seriesScheduleViewModel.js'), 'utf8');

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

function course(id, halves) {
  var h = halves || { front: 'A', back: 'B' };
  return {
    courseId: id,
    courseName: '球场' + id,
    front9Course: h.front,
    back9Course: h.back
  };
}

function round(id, index, dateTime, courseSpec, extra) {
  return Object.assign(
    {
      roundId: id,
      index: index,
      name: 'ROUND ' + index,
      dateTime: dateTime,
      gameMode: '个人比杆赛',
      fee: '100'
    },
    courseSpec || {},
    extra || {}
  );
}

function titles(rows) {
  return (rows || []).map(function (r) {
    return r.roundId + ':' + r.name;
  });
}

var twoCourses = [
  round('r1', 1, '2026-08-11 08:00', course('east')),
  round('r2', 2, '2026-08-11 13:00', course('west'))
];
var twoSnap = JSON.parse(JSON.stringify(twoCourses));
var twoRows = basicInfoDraft.summarizeRoundsForConfirm(twoCourses, 'per_round_n');
assert(
  '同日两个不同球场 → COURSE 1/2',
  twoRows[0].name === 'COURSE 1' &&
    twoRows[1].name === 'COURSE 2' &&
    twoRows[0].index === 1 &&
    twoRows[1].index === 2
);
assert(
  '原轮次编号、roundId 和保存数据不变',
  twoRows[0].roundId === 'r1' &&
    twoRows[1].roundId === 'r2' &&
    twoCourses[0].name === 'ROUND 1' &&
    twoCourses[1].name === 'ROUND 2' &&
    JSON.stringify(twoCourses) === JSON.stringify(twoSnap)
);

var halfDiff = [
  round('r1', 1, '2026-08-11 08:00', course('club', { front: 'A', back: 'B' })),
  round('r2', 2, '2026-08-11 13:00', course('club', { front: 'C', back: 'D' }))
];
assert(
  '同日同 courseId 不同前九/后九 → COURSE',
  titles(basicInfoDraft.summarizeRoundsForConfirm(halfDiff, 'per_round_n')).join(',') ===
    'r1:COURSE 1,r2:COURSE 2'
);

var sameVenue = [
  round('r1', 1, '2026-08-11 08:00', course('east')),
  round('r2', 2, '2026-08-11 13:00', course('east'))
];
assert(
  '同日同场地 → ROUND',
  titles(basicInfoDraft.summarizeRoundsForConfirm(sameVenue, 'per_round_n')).join(',') ===
    'r1:ROUND 1,r2:ROUND 2'
);

var differentDays = [
  round('r1', 1, '2026-08-11 08:00', course('east')),
  round('r2', 2, '2026-08-12 08:00', course('west'))
];
assert(
  '不同日期各一个场地 → ROUND',
  titles(basicInfoDraft.summarizeRoundsForConfirm(differentDays, 'global_m')).join(',') ===
    'r1:ROUND 1,r2:ROUND 2'
);

var invalids = [
  round('r1', 1, 'bad-date', course('east')),
  round('r2', 2, '2026-08-11 08:00', { courseId: '', courseName: '' }),
  round('r3', 3, '2026-08-11 13:00', course('west'))
];
assert(
  '无效日期或无效场地 → ROUND',
  titles(basicInfoDraft.summarizeRoundsForConfirm(invalids, 'per_round_n')).join(',') ===
    'r1:ROUND 1,r2:ROUND 2,r3:ROUND 3'
);

var mixed = [
  round('r1', 1, '2026-08-11 08:00', course('east')),
  round('r2', 2, '2026-08-11 13:00', course('west')),
  round('r3', 3, '2026-08-12 08:00', course('north')),
  round('r4', 4, '2026-08-13 08:00', course('south')),
  round('r5', 5, '2026-08-13 14:00', course('lake'))
];
assert(
  '混合轮次只转换符合条件的同日多场地轮次',
  titles(basicInfoDraft.summarizeRoundsForConfirm(mixed, 'per_round_n')).join(',') ===
    'r1:COURSE 1,r2:COURSE 2,r3:ROUND 3,r4:COURSE 4,r5:COURSE 5'
);

var lateNight = [
  round('r1', 1, '2026-08-11 23:30', course('east')),
  round('r2', 2, '2026-08-11 23:45', course('west'))
];
assert(
  '本地自然日、不因 UTC 跨日',
  titles(basicInfoDraft.summarizeRoundsForConfirm(lateNight, 'per_round_n')).join(',') ===
    'r1:COURSE 1,r2:COURSE 2' &&
    sameDay.parseLocalDateKeyParts('2026-08-11 23:45').day === 11
);

var standingsLabels = standingsVm.buildStandingsRoundDisplayLabels(
  { rounds: twoCourses },
  twoCourses.map(function (r) {
    return { roundId: r.roundId, index: r.index, label: 'R' + r.index };
  })
);
var confirmMulti = sameDay.collectSameDayMultiCourseRoundIds(twoCourses);
assert(
  '与总榜同日多场地判定一致',
  confirmMulti.r1 === true &&
    confirmMulti.r2 === true &&
    standingsLabels.r1 === 'C1' &&
    standingsLabels.r2 === 'C2'
);

assert(
  '只改确认摘要投影，编辑页仍 ROUND {{item.index}}',
  pageWxml.indexOf('ROUND {{item.index}}') >= 0 &&
    pageWxml.indexOf('{{item.name}}') >= 0 &&
    pageJs.indexOf('summarizeRoundsForConfirm') >= 0 &&
    draftSrc.indexOf('collectSameDayMultiCourseRoundIds') >= 0 &&
    labelsSrc.indexOf('collectSameDayMultiCourseRoundIds') >= 0 &&
    pageWxss.indexOf('series-confirm-round__course') < 0
);

assert(
  '管理页仍为 R 标签；赛程多分队复用总榜别名模块',
  manageSrc.indexOf("label: 'R' + index") >= 0 &&
    scheduleSrc.indexOf('buildSeriesRoundDisplayLabels') >= 0
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
process.exit(0);
