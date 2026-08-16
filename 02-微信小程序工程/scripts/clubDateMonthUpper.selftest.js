/**
 * 首页三类赛事卡片 + 详情 Hero 月份：大写 JAN–DEC，共用 clubDateFormat
 * 不依赖 locale；不改创建页滚轮、赛程 dock、存储格式。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/clubDateMonthUpper.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var seriesDetailDir = path.join(
  mini,
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);
var detailJsPath = path.join(
  mini,
  'subpackages',
  'tournament',
  'pages',
  'detail',
  'index.js'
);
var createPickerPath = path.join(mini, 'components', 'time-wheel-picker', 'index.js');
var roundInfoPath = path.join(seriesDetailDir, 'seriesRoundInfoText.js');
var scheduleVmPath = path.join(seriesDetailDir, 'seriesScheduleViewModel.js');
var managePickerPath = path.join(seriesDetailDir, 'seriesManageRoundPicker.js');

if (!global.wx) {
  var memStore = Object.create(null);
  global.wx = {
    getStorageSync: function (key) {
      return memStore[key];
    },
    setStorageSync: function (key, value) {
      memStore[key] = value;
    }
  };
}

var clubDateFormat = require(path.join(utilsDir, 'clubDateFormat.js'));
var teamMatchStore = require(path.join(utilsDir, 'teamMatchStore.js'));
var seriesAdapter = require(path.join(utilsDir, 'seriesListCardAdapter.js'));
var seriesVm = require(path.join(seriesDetailDir, 'seriesDetailViewModel.js'));

var clubSrc = fs.readFileSync(path.join(utilsDir, 'clubDateFormat.js'), 'utf8');
var storeSrc = fs.readFileSync(path.join(utilsDir, 'teamMatchStore.js'), 'utf8');
var adapterSrc = fs.readFileSync(path.join(utilsDir, 'seriesListCardAdapter.js'), 'utf8');
var vmSrc = fs.readFileSync(path.join(seriesDetailDir, 'seriesDetailViewModel.js'), 'utf8');
var detailJs = fs.readFileSync(detailJsPath, 'utf8');
var pickerSrc = fs.readFileSync(createPickerPath, 'utf8');
var roundInfoSrc = fs.readFileSync(roundInfoPath, 'utf8');
var scheduleVmSrc = fs.readFileSync(scheduleVmPath, 'utf8');
var managePickerSrc = fs.readFileSync(managePickerPath, 'utf8');

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

var EXPECTED_MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC'
];

assert(
  '共用标签表 JAN–DEC',
  clubDateFormat.CLUB_MONTH_LABELS.join(',') === EXPECTED_MONTHS.join(',')
);

assert(
  '不依赖 locale API',
  clubSrc.indexOf('toLocaleDateString') < 0 &&
    clubSrc.indexOf('toLocaleString') < 0 &&
    clubSrc.indexOf('Intl.') < 0 &&
    storeSrc.indexOf('toLocaleDateString') < 0
);

assert(
  '首页/Hero 走同一 clubDateFormat 入口',
  storeSrc.indexOf("require('./clubDateFormat.js')") >= 0 &&
    storeSrc.indexOf('clubDateFormat.formatClubDate') >= 0 &&
    adapterSrc.indexOf("require('./clubDateFormat.js')") >= 0 &&
    adapterSrc.indexOf('clubDateFormat.formatDateRangeFromParts') >= 0 &&
    vmSrc.indexOf("require('../../../../utils/clubDateFormat.js')") >= 0 &&
    vmSrc.indexOf('clubDateFormat.formatDateRangeFromParts') >= 0 &&
    adapterSrc.indexOf("'Jan'") < 0 &&
    vmSrc.indexOf("'Jan'") < 0 &&
    storeSrc.indexOf("['Jan'") < 0
);

assert(
  '队内/队际 Hero 仍用 formatClubDate',
  detailJs.indexOf('teamMatchStore.formatClubDate(match.teeTime)') >= 0
);

var monthIso = [
  '2026-01-05',
  '2026-02-05',
  '2026-03-05',
  '2026-04-05',
  '2026-05-05',
  '2026-06-05',
  '2026-07-05',
  '2026-08-05',
  '2026-09-05',
  '2026-10-05',
  '2026-11-05',
  '2026-12-05'
];
var allMonthsOk = true;
for (var i = 0; i < 12; i++) {
  var expected = EXPECTED_MONTHS[i] + '/05/2026';
  var a = clubDateFormat.formatClubDate(monthIso[i] + ' 08:00');
  var b = teamMatchStore.formatClubDate(monthIso[i] + ' 08:00');
  if (a !== expected || b !== expected) allMonthsOk = false;
}
assert('十二个月单日 MON/DD/YYYY 且 store 与入口一致', allMonthsOk);

assert(
  '空/非法日期：队内口径空串',
  clubDateFormat.formatClubDate('') === '' &&
    clubDateFormat.formatClubDate(null) === '' &&
    clubDateFormat.formatClubDate('bad') === '' &&
    clubDateFormat.formatClubDate('2026-13-01') === ''
);

assert(
  '系列空/非法 → 比赛时间待定',
  seriesVm.formatSeriesDateRange([]) === '比赛时间待定' &&
    seriesVm.formatSeriesDateRange([{ dateTime: '' }]) === '比赛时间待定' &&
    seriesVm.formatSeriesDateRange([{ dateTime: 'bad' }]) === '比赛时间待定' &&
    seriesAdapter.formatSeriesDateRange([]) === '比赛时间待定'
);

assert(
  '同月范围月份只出现一次',
  seriesVm.formatSeriesDateRange([
    { dateTime: '2026-08-11 08:00' },
    { dateTime: '2026-08-13 09:00' }
  ]) === 'AUG/11-13  (2026)' &&
    seriesAdapter.formatSeriesDateRange([
      { dateTime: '2026-08-13 09:00' },
      { dateTime: '2026-08-11 08:00' }
    ]) === 'AUG/11-13  (2026)'
);

assert(
  '跨月起止月份均转换',
  seriesVm.formatSeriesDateRange([
    { dateTime: '2026-08-11 08:00' },
    { dateTime: '2026-09-16 08:00' }
  ]) === 'AUG/11-SEP/16  (2026)' &&
    seriesAdapter.formatSeriesDateRange([
      { dateTime: '2026-08-11 08:00' },
      { dateTime: '2026-09-16 08:00' }
    ]) === 'AUG/11-SEP/16  (2026)'
);

assert(
  '跨年起止月份均转换',
  seriesVm.formatSeriesDateRange([
    { dateTime: '2026-12-31 08:00' },
    { dateTime: '2027-01-02 08:00' }
  ]) === 'DEC/31 (2026)-JAN/02 (2027)'
);

var internalCard = teamMatchStore.toTournamentCard({
  matchId: 'm-internal',
  matchType: 'team-internal',
  teeTime: '2026-03-09 07:30',
  courseName: '测试球场',
  courseHalfText: '',
  roundName: '队内公开赛',
  teamName: '测试队',
  status: 'registering'
});
var interCard = teamMatchStore.toTournamentCard({
  matchId: 'm-inter',
  matchType: 'inter-team',
  teeTime: '2026-11-02 13:00',
  courseName: '测试球场',
  courseHalfText: '',
  roundName: '队际对抗',
  teamName: '主办机构',
  status: 'registering'
});

assert(
  '首页队内卡月份大写且日/年不变',
  internalCard &&
    internalCard.clubDate === 'MAR/09/2026' &&
    internalCard.clubDate.indexOf('07:30') < 0
);
assert(
  '首页队际卡月份大写且日/年不变',
  interCard &&
    interCard.clubDate === 'NOV/02/2026' &&
    interCard.clubDate.indexOf('13:00') < 0
);

var seriesCard = seriesAdapter.toSeriesClubCard(
  {
    seriesId: 's1',
    seriesName: '系列公开赛',
    lifecycleStatus: 'published',
    registrationState: 'open',
    visibility: 'public',
    hostMode: 'organization',
    organization: { organizationName: '主办', organizationLogo: '' },
    rounds: [
      { roundId: 'r1', dateTime: '2026-04-01 08:00', gameMode: 'individual_stroke' },
      { roundId: 'r2', dateTime: '2026-04-03 09:00', gameMode: 'individual_stroke' }
    ]
  },
  'registration'
);
var seriesHero = seriesVm.buildHeroView(
  {
    seriesName: '系列公开赛',
    seriesSubtitle: '',
    hostMode: 'organization',
    organization: { organizationName: '主办' },
    rounds: [
      { dateTime: '2026-04-01 08:00' },
      { dateTime: '2026-04-03 09:00' }
    ]
  },
  { ok: true, lifecycleLabel: '已发布', lifecycleStatus: 'published', isDraftPreview: false }
);

assert(
  '首页系列卡与 Series Hero 同月范围一致',
  seriesCard.clubDate === 'APR/01-03  (2026)' &&
    seriesHero.dateText === seriesCard.clubDate
);

assert(
  '队内 Hero 文案与首页卡同一入口',
  teamMatchStore.formatClubDate('2026-03-09 07:30') === internalCard.clubDate
);
assert(
  '队际 Hero 文案与首页卡同一入口',
  teamMatchStore.formatClubDate('2026-11-02 13:00') === interCard.clubDate
);

assert(
  '创建页滚轮月份保持 Title Case',
  pickerSrc.indexOf(
    "monthLabels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']"
  ) >= 0
);

assert(
  '赛程 dock / 管理轮次选择不改接 clubDateFormat',
  roundInfoSrc.indexOf('clubDateFormat') < 0 &&
    scheduleVmSrc.indexOf('clubDateFormat') < 0 &&
    managePickerSrc.indexOf('clubDateFormat') < 0 &&
    managePickerSrc.indexOf('raw.slice(0, 10)') >= 0
);

assert(
  '不改存储：teeTime 原样 ISO',
  (function () {
    var tee = '2026-08-11 08:00';
    teamMatchStore.formatClubDate(tee);
    return tee === '2026-08-11 08:00';
  })()
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
process.exit(0);
