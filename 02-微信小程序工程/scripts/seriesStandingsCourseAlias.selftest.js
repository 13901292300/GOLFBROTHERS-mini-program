/**
 * 总榜同日多场地 Cx 显示别名
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsCourseAlias.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var createDir = path.join(mini, 'subpackages', 'create', 'pages', 'series');

var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));
var scheduleVm = require(path.join(seriesDir, 'seriesScheduleViewModel.js'));
var managePicker = require(path.join(seriesDir, 'seriesManageRoundPicker.js'));
var detailVm = require(path.join(seriesDir, 'seriesDetailViewModel.js'));

var pageJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');
var createWxml = fs.readFileSync(path.join(createDir, 'index.wxml'), 'utf8');
var scheduleSrc = fs.readFileSync(path.join(seriesDir, 'seriesScheduleViewModel.js'), 'utf8');
var manageSrc = fs.readFileSync(path.join(seriesDir, 'seriesManageRoundPicker.js'), 'utf8');
var vmSrc = fs.readFileSync(path.join(seriesDir, 'seriesStandingsViewModel.js'), 'utf8');
var labelsSrc = fs.readFileSync(
  path.join(mini, 'utils', 'seriesRoundDisplayLabels.js'),
  'utf8'
);

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
      name: '第' + index + '轮',
      dateTime: dateTime,
      roundStatus: 'scheduled',
      gameMode: 'individual_stroke'
    },
    courseSpec || {},
    extra || {}
  );
}

function statesFromRounds(rounds) {
  return rounds.map(function (r) {
    return {
      roundId: r.roundId,
      index: r.index,
      label: 'R' + r.index,
      roundStatus: r.roundStatus || 'scheduled',
      dateTime: r.dateTime,
      courseId: r.courseId,
      courseName: r.courseName,
      courseHalfText: r.courseHalfText,
      front9Course: r.front9Course,
      back9Course: r.back9Course,
      state: r.roundStatus === 'cancelled' ? 'cancelled' : 'upcoming'
    };
  });
}

function seriesOf(mode, rounds) {
  return {
    seriesId: 's-cx',
    scoringRule: {
      mode: mode,
      scoreBasis: 'gross',
      allowRepeat: false,
      ruleVersion: 1,
      globalM: 6
    },
    participants: [{ seriesParticipantId: 'team:a', nameSnapshot: '甲队' }],
    rounds: rounds
  };
}

function labelsOf(mode, rounds) {
  var series = seriesOf(mode, rounds);
  return standingsVm.buildStandingsRoundDisplayLabels(series, statesFromRounds(rounds));
}

function vmOf(mode, rounds, selectedKey) {
  var series = seriesOf(mode, rounds);
  return standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: selectedKey,
    roundStates: statesFromRounds(rounds),
    standingsResult: standingsVm.emptyStandingsResult()
  });
}

function selectorLabels(vm) {
  return (vm.roundSelectorItems || []).map(function (x) {
    return x.key + ':' + x.label;
  });
}

var sameDaySingle = [
  round('r1', 1, '2026-08-11 08:00', course('east'))
];
assert(
  '同日单场仍为 R1',
  labelsOf('global_m', sameDaySingle).r1 === 'R1' &&
    vmOf('per_round_n', sameDaySingle, 'r1').headScoreLabel === 'R1'
);

var sameDayTwo = [
  round('r1', 1, '2026-08-11 08:00', course('east')),
  round('r2', 2, '2026-08-11 13:00', course('west'))
];
var sameDayTwoLabels = labelsOf('global_m', sameDayTwo);
assert(
  '同日两场为 C1/C2',
  sameDayTwoLabels.r1 === 'C1' && sameDayTwoLabels.r2 === 'C2'
);
var gmTwo = vmOf('global_m', sameDayTwo, 'r1');
var prnTwo = vmOf('per_round_n', sameDayTwo, 'r1');
assert(
  'global_m 与 per_round_n 同一套别名',
  selectorLabels(gmTwo).join(',') === 'r1:C1,r2:C2' &&
    selectorLabels(prnTwo).join(',') === 'r1:C1,r2:C2' &&
    gmTwo.totalSelector.label === 'TOT' &&
    gmTwo.selectedKey === 'r1' &&
    prnTwo.headScoreLabel === 'C1'
);

var twoDays = [
  round('r1', 1, '2026-08-11 08:00', course('east')),
  round('r2', 2, '2026-08-11 13:00', course('west')),
  round('r3', 3, '2026-08-12 08:00', course('north')),
  round('r4', 4, '2026-08-12 14:00', course('south'))
];
var twoDaysLabels = labelsOf('per_round_n', twoDays);
assert(
  '第二个多场地日期继续为 C3/C4',
  twoDaysLabels.r1 === 'C1' &&
    twoDaysLabels.r2 === 'C2' &&
    twoDaysLabels.r3 === 'C3' &&
    twoDaysLabels.r4 === 'C4'
);

var sameCourse = [
  round('r1', 1, '2026-08-11 08:00', course('east')),
  round('r2', 2, '2026-08-11 13:00', course('east'))
];
assert(
  '同日但相同场地不触发 C',
  labelsOf('global_m', sameCourse).r1 === 'R1' &&
    labelsOf('global_m', sameCourse).r2 === 'R2'
);

var withCancelled = [
  round('r1', 1, '2026-08-11 08:00', course('east')),
  round('r2', 2, '2026-08-11 10:00', course('west'), { roundStatus: 'cancelled' }),
  round('r3', 3, '2026-08-11 13:00', course('north'))
];
var cancelledLabels = labelsOf('global_m', withCancelled);
assert(
  '取消轮不参与判断和编号',
  cancelledLabels.r1 === 'C1' &&
    cancelledLabels.r2 === 'R2' &&
    cancelledLabels.r3 === 'C2'
);

var invalids = [
  round('r1', 1, 'bad-date', course('east')),
  round('r2', 2, '2026-08-11 08:00', { courseId: '', courseName: '' }),
  round('r3', 3, '2026-08-11 13:00', course('west')),
  round('r4', 4, '2026-08-12 08:00', course('east'))
];
var invalidLabels = labelsOf('global_m', invalids);
assert(
  '无效日期/场地安全回退 Rx',
  invalidLabels.r1 === 'R1' &&
    invalidLabels.r2 === 'R2' &&
    invalidLabels.r3 === 'R3' &&
    invalidLabels.r4 === 'R4'
);

var switched = vmOf('per_round_n', sameDayTwo, 'r2');
assert(
  '切换选择器后第四列表头同步 Cx',
  prnTwo.selectedKey === 'r1' &&
    prnTwo.headScoreLabel === 'C1' &&
    prnTwo.roundSelectorItems[0].isSelected === true &&
    switched.selectedKey === 'r2' &&
    switched.headScoreLabel === 'C2' &&
    switched.roundSelectorItems[1].isSelected === true &&
    switched.roundInfoText.indexOf('C2') === 0
);

assert(
  '底层 selectedKey 和记分卡 roundId 不变',
  gmTwo.selectedKey === 'r1' &&
    gmTwo.roundSelectorItems[0].key === 'r1' &&
    gmTwo.roundSelectorItems[1].key === 'r2' &&
    standingsVm.resolveStandingsScorecardRoundId({ roundId: 'r2' }, 'r1') === '' &&
    standingsVm.resolveStandingsScorecardRoundId({ roundId: 'r1' }, 'r1') === 'r1'
);

assert(
  'TOT 保持 TOT',
  vmOf('global_m', sameDayTwo, 'cumulative').totalSelector.label === 'TOT' &&
    vmOf('global_m', sameDayTwo, 'cumulative').selectedRoundDisplayLabel === 'TOT' &&
    vmOf('global_m', sameDayTwo, 'cumulative').headScoreLabel === 'TO PAR'
);

var schedule = scheduleVm.buildSeriesScheduleViewModel({
  series: seriesOf('global_m', sameDayTwo),
  roundStates: statesFromRounds(sameDayTwo),
  getMatchById: function () {
    return null;
  },
  getIndexByMatchId: function () {
    return null;
  }
});
assert(
  '出发表 TAB 与总榜 Cx 一致',
  schedule.roundSelectorItems[0].label === 'C1' &&
    schedule.roundSelectorItems[1].label === 'C2' &&
    schedule.roundSelectorItems[0].key === 'r1'
);

var manage = managePicker.buildManageRoundPickerViewModel({
  series: seriesOf('global_m', sameDayTwo),
  getMatchById: function () {
    return null;
  }
});
assert(
  '管理页仍为 R 标签',
  manage.items[0].label === 'R1' && manage.items[1].label === 'R2'
);

var card = detailVm.buildRoundCard(
  seriesOf('global_m', sameDayTwo),
  sameDayTwo[0],
  {},
  0
);
assert(
  '详情 roundCard 仍 ROUND',
  card.roundLabel === 'ROUND 1'
);

assert(
  '创建页仍 ROUND',
  createWxml.indexOf('ROUND {{item.index}}') >= 0 &&
    pageWxml.indexOf('standings.roundSelectorItems') >= 0 &&
    pageJs.indexOf('resolveStandingsRoundDisplayLabel') >= 0 &&
    vmSrc.indexOf('seriesRoundDisplayLabels') >= 0 &&
    vmSrc.indexOf('buildStandingsRoundDisplayLabels') >= 0 &&
    manageSrc.indexOf("label: 'R' + index") >= 0
);

var sameDaySrc = fs.readFileSync(
  path.join(mini, 'utils', 'seriesSameDayMultiCourse.js'),
  'utf8'
);
assert(
  '本地日期解析、无 UTC Date 跨日',
  labelsOf('global_m', [
    round('r1', 1, '2026-08-11 23:30', course('east')),
    round('r2', 2, '2026-08-11 23:45', course('west'))
  ]).r1 === 'C1' &&
    vmSrc.indexOf('new Date(') < 0 &&
    sameDaySrc.indexOf('new Date(') < 0 &&
    sameDaySrc.indexOf('Date.UTC') < 0 &&
    labelsSrc.indexOf('collectSameDayMultiCourseRoundIds') >= 0 &&
    sameDaySrc.indexOf('buildSeriesCourseIdentityKey') >= 0
);

var halfDiff = [
  round('r1', 1, '2026-08-11 08:00', course('club', { front: 'A', back: 'B' })),
  round('r2', 2, '2026-08-11 13:00', course('club', { front: 'C', back: 'D' }))
];
assert(
  '同 courseId 不同半场视为不同场地',
  labelsOf('global_m', halfDiff).r1 === 'C1' && labelsOf('global_m', halfDiff).r2 === 'C2'
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
process.exit(0);
