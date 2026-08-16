/**
 * 队内多分队系列赛「赛程」TAB：轮次标签与总榜 Cx 一致
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesScheduleCourseAlias.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');

var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));
var scheduleVm = require(path.join(seriesDir, 'seriesScheduleViewModel.js'));
var labelsUtil = require(path.join(mini, 'utils', 'seriesRoundDisplayLabels.js'));

var pageJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var scheduleSrc = fs.readFileSync(path.join(seriesDir, 'seriesScheduleViewModel.js'), 'utf8');
var standingsSrc = fs.readFileSync(path.join(seriesDir, 'seriesStandingsViewModel.js'), 'utf8');
var labelsSrc = fs.readFileSync(path.join(mini, 'utils', 'seriesRoundDisplayLabels.js'), 'utf8');
var manageSrc = fs.readFileSync(path.join(seriesDir, 'seriesManageRoundPicker.js'), 'utf8');

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

function seriesOf(overrides, rounds) {
  return Object.assign(
    {
      seriesId: 's-sched-cx',
      hostMode: 'team',
      templateId: 'division_series',
      scoringRule: { mode: 'global_m', globalM: 2, allowRepeat: true },
      participants: [{ seriesParticipantId: 'division:d1', kind: 'division', nameSnapshot: '先锋' }],
      rounds: rounds
    },
    overrides || {}
  );
}

function scheduleOf(series, rounds, selectedRoundId) {
  return scheduleVm.buildSeriesScheduleViewModel({
    series: series,
    selectedRoundId: selectedRoundId,
    roundStates: statesFromRounds(rounds),
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
}

function selectorMap(vm) {
  var out = {};
  (vm.roundSelectorItems || []).forEach(function (it) {
    out[it.key] = it.label;
  });
  return out;
}

var sameDayTwo = [
  round('r1', 1, '2026-08-11 08:00', course('east')),
  round('r2', 2, '2026-08-11 13:00', course('west'))
];
var divSeries = seriesOf({}, sameDayTwo);
var standingsLabels = standingsVm.buildStandingsRoundDisplayLabels(
  divSeries,
  statesFromRounds(sameDayTwo)
);
var sharedLabels = labelsUtil.buildSeriesRoundDisplayLabels(
  divSeries,
  statesFromRounds(sameDayTwo)
);
var schedSame = scheduleOf(divSeries, sameDayTwo, 'r1');
assert(
  '同日不同场地：赛程标签与总榜 Cx 完全一致',
  standingsLabels.r1 === 'C1' &&
    standingsLabels.r2 === 'C2' &&
    sharedLabels.r1 === 'C1' &&
    selectorMap(schedSame).r1 === 'C1' &&
    selectorMap(schedSame).r2 === 'C2' &&
    schedSame.roundInfoText.indexOf('C1') === 0 &&
    schedSame.roundInfoText.indexOf('R1') < 0 &&
    schedSame.roundSelector[0].label === 'C1'
);

var halfDiff = [
  round('r1', 1, '2026-08-11 08:00', course('club', { front: 'A', back: 'B' })),
  round('r2', 2, '2026-08-11 13:00', course('club', { front: 'C', back: 'D' }))
];
var schedHalf = scheduleOf(seriesOf({}, halfDiff), halfDiff);
assert(
  '同一 courseId 的前九/后九可区分',
  selectorMap(schedHalf).r1 === 'C1' && selectorMap(schedHalf).r2 === 'C2'
);

var twoDays = [
  round('r1', 1, '2026-08-11 08:00', course('east')),
  round('r2', 2, '2026-08-11 13:00', course('west')),
  round('r3', 3, '2026-08-12 08:00', course('north')),
  round('r4', 4, '2026-08-12 14:00', course('south'))
];
var schedDays = scheduleOf(seriesOf({}, twoDays), twoDays, 'r3');
var standingsDays = standingsVm.buildStandingsRoundDisplayLabels(
  seriesOf({}, twoDays),
  statesFromRounds(twoDays)
);
assert(
  '跨多个日期时 C 编号连续且与总榜一致',
  standingsDays.r1 === 'C1' &&
    standingsDays.r2 === 'C2' &&
    standingsDays.r3 === 'C3' &&
    standingsDays.r4 === 'C4' &&
    selectorMap(schedDays).r3 === 'C3' &&
    schedDays.roundInfoText.indexOf('C3') === 0 &&
    schedDays.selectedKey === 'r3'
);

var mixed = [
  round('r1', 1, '2026-08-11 08:00', course('east')),
  round('r2', 2, '2026-08-11 13:00', course('west')),
  round('r3', 3, '2026-08-12 08:00', course('east')),
  round('r4', 4, '2026-08-12 13:00', course('east'))
];
var schedMixed = scheduleOf(seriesOf({}, mixed), mixed);
var standingsMixed = standingsVm.buildStandingsRoundDisplayLabels(
  seriesOf({}, mixed),
  statesFromRounds(mixed)
);
assert(
  '混合 R/C 轮次与总榜一致',
  standingsMixed.r1 === 'C1' &&
    standingsMixed.r2 === 'C2' &&
    standingsMixed.r3 === 'R3' &&
    standingsMixed.r4 === 'R4' &&
    selectorMap(schedMixed).r1 === 'C1' &&
    selectorMap(schedMixed).r2 === 'C2' &&
    selectorMap(schedMixed).r3 === 'R3' &&
    selectorMap(schedMixed).r4 === 'R4'
);

var withCancelled = [
  round('r1', 1, '2026-08-11 08:00', course('east')),
  round('r2', 2, '2026-08-11 10:00', course('west'), { roundStatus: 'cancelled' }),
  round('r3', 3, '2026-08-11 13:00', course('north'))
];
var schedCancel = scheduleOf(seriesOf({}, withCancelled), withCancelled);
var invalids = [
  round('r1', 1, 'bad-date', course('east')),
  round('r2', 2, '2026-08-11 08:00', { courseId: '', courseName: '' }),
  round('r3', 3, '2026-08-11 13:00', course('west')),
  round('r4', 4, '2026-08-12 08:00', course('east'))
];
var schedInvalid = scheduleOf(seriesOf({}, invalids), invalids);
assert(
  '取消轮、无效日期和无效场地仍为 Rx',
  selectorMap(schedCancel).r1 === 'C1' &&
    selectorMap(schedCancel).r2 === 'R2' &&
    selectorMap(schedCancel).r3 === 'C2' &&
    selectorMap(schedInvalid).r1 === 'R1' &&
    selectorMap(schedInvalid).r2 === 'R2' &&
    selectorMap(schedInvalid).r3 === 'R3' &&
    selectorMap(schedInvalid).r4 === 'R4'
);

var tapped = scheduleOf(divSeries, sameDayTwo, 'r2');
assert(
  '点击、选中态及跳转仍使用原 roundId',
  tapped.selectedKey === 'r2' &&
    tapped.roundSelectorItems[1].key === 'r2' &&
    tapped.roundSelectorItems[1].isSelected === true &&
    tapped.roundSelectorItems[0].isSelected === false &&
    tapped.roundSelectorItems[1].label === 'C2' &&
    pageJs.indexOf('onScheduleRoundTap') >= 0 &&
    pageJs.indexOf('readRoundDockEventKey') >= 0 &&
    scheduleSrc.indexOf('selectedRoundId') >= 0 &&
    labelsSrc.indexOf('不改 roundId') >= 0
);

var orgSeries = seriesOf(
  { hostMode: 'organization', templateId: 'inter_team_series' },
  sameDayTwo
);
var orgSched = scheduleOf(orgSeries, sameDayTwo);
var plainSeries = seriesOf({ templateId: 'individual_tour' }, sameDayTwo);
var plainSched = scheduleOf(plainSeries, sameDayTwo);
assert(
  '普通系列赛出发表 Cx 与总榜一致；管理页仍为 R',
  selectorMap(orgSched).r1 === 'C1' &&
    selectorMap(orgSched).r2 === 'C2' &&
    selectorMap(plainSched).r1 === 'C1' &&
    selectorMap(plainSched).r2 === 'C2' &&
    manageSrc.indexOf("label: 'R' + index") >= 0
);

assert(
  '复用公共别名投影，赛程不自行编号；总榜仍走同一模块',
  scheduleSrc.indexOf('buildSeriesRoundDisplayLabels') >= 0 &&
    scheduleSrc.indexOf('cIndex') < 0 &&
    standingsSrc.indexOf('seriesRoundDisplayLabels') >= 0 &&
    labelsSrc.indexOf('collectSameDayMultiCourseRoundIds') >= 0 &&
    standingsVm.buildStandingsRoundDisplayLabels(divSeries, statesFromRounds(sameDayTwo)).r1 ===
      'C1'
);

if (failed) {
  console.log('\npassed=' + passed + ' failed=' + failed);
  failures.forEach(function (f) {
    console.log(f);
  });
  process.exit(1);
}
console.log('\npassed=' + passed + ' failed=' + failed);
process.exit(0);
