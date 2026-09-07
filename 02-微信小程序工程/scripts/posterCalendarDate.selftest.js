/**
 * 海报比赛日期：日历日解析，禁止 YYYY-MM-DD 经 Date/UTC 换日。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/posterCalendarDate.selftest.js
 */

var path = require('path');
var fs = require('fs');
var calendarDate = require('../miniprogram/subpackages/poster/utils/calendar-date.js');

var passed = 0;
var failed = 0;

function assert(label, ok) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
    return;
  }
  failed += 1;
  console.log('FAIL  ' + label);
}

function ymd(value) {
  return calendarDate.formatCalendarDateYMD(value);
}

function dotted(value) {
  return calendarDate.formatCalendarDateDotted(value);
}

assert('YYYY-MM-DD 原样保留 9月3日', ymd('2026-09-03') === '2026-09-03');
assert('带时刻的开球时间只取日历日', ymd('2026-09-03 17:10') === '2026-09-03');
assert('ISO 前缀不经 Date 解析', ymd('2026-09-03T00:00:00.000Z') === '2026-09-03');
assert('中文开球文案', ymd('2026年09月03日 星期三 17:10') === '2026-09-03');
assert('点分日期', ymd('2026.09.03') === '2026-09-03');

assert('月初', ymd('2026-01-01') === '2026-01-01');
assert('月末', ymd('2026-01-31') === '2026-01-31');
assert('年末', ymd('2026-12-31') === '2026-12-31');
assert('闰年 2月29日', ymd('2024-02-29') === '2024-02-29');
assert('非闰年 2月28日', ymd('2025-02-28') === '2025-02-28');

assert('预览点分与表单同一天', dotted('2026-09-03') === '2026.09.03');
assert('已是点分不换日', dotted('2026.09.03') === '2026.09.03');

var utcParsed = new Date('2026-09-03');
assert('日历解析始终为 2026-09-03', ymd('2026-09-03') === '2026-09-03');
if (!Number.isNaN(utcParsed.getTime())) {
  var mm = utcParsed.getMonth() + 1;
  var dd = utcParsed.getDate();
  var localFromUtcCtor =
    utcParsed.getFullYear() +
    '-' +
    (mm < 10 ? '0' + mm : String(mm)) +
    '-' +
    (dd < 10 ? '0' + dd : String(dd));
  if (localFromUtcCtor !== '2026-09-03') {
    assert(
      '本机 new Date(YYYY-MM-DD) 会换日，日历解析不跟随',
      ymd('2026-09-03') === '2026-09-03' && localFromUtcCtor !== ymd('2026-09-03')
    );
  } else {
    assert('本机 UTC+ 时区下 Date 解析当天仍一致（字符串路径不依赖它）', true);
  }
}

var game = {
  teeTime: '2026-09-03 07:30',
  teeTimeText: '2026年09月03日 星期三 07:30',
  createdAt: Date.UTC(2026, 8, 2, 16, 0, 0),
  deadlineTime: '2026-09-01 18:00'
};
assert('优先 teeTime 而非 createdAt', calendarDate.resolvePosterMatchDate(game) === '2026-09-03');

var normalGame = {
  teeTime: '2026年09月03日 星期三 17:10',
  createdAt: Date.now()
};
assert('普通赛中文 teeTime', calendarDate.resolvePosterMatchDate(normalGame) === '2026-09-03');

var teamDisplay = {
  teeTime: '2026-09-03 07:30',
  teeTimeText: '2026/09/03 星期三 07:30'
};
assert('队内斜杠展示文案', calendarDate.resolvePosterMatchDate(teamDisplay) === '2026-09-03');

var seriesStation = {
  matchType: 'team-internal',
  teeTime: '2026-09-03 08:00',
  teeTimeText: '2026-09-03 08:00'
};
assert('系列分站 dateTime→teeTime', calendarDate.resolvePosterMatchDate(seriesStation) === '2026-09-03');

var warns = [];
var origWarn = console.warn;
console.warn = function () {
  warns.push(Array.prototype.slice.call(arguments));
};
var noTee = {
  gameId: 'g-missing',
  createdAt: new Date(2026, 8, 5, 12, 0, 0).getTime(),
  date: '2020-01-01',
  matchDate: '2020-02-02'
};
var missing = calendarDate.resolvePosterMatchDate(noTee);
console.warn = origWarn;
assert('缺失比赛日期返回空串', missing === '');
assert('createdAt 时间戳不能当比赛日', calendarDate.formatCalendarDateYMD(noTee.createdAt) === '');
assert('Date 对象不能当比赛日', calendarDate.formatCalendarDateYMD(new Date(2026, 8, 3)) === '');
assert('未确认语义的 date/matchDate 不进回退链', missing === '');
assert(
  '缺失时写出可定位告警',
  warns.some(function (args) {
    return String(args[0]).indexOf('[poster-date] match calendar date missing') >= 0
      && args[1]
      && args[1].gameId === 'g-missing';
  })
);
assert('hasPosterMatchDate 空值为 false', calendarDate.hasPosterMatchDate('') === false);
assert('hasPosterMatchDate 9月3日为 true', calendarDate.hasPosterMatchDate('2026-09-03') === true);

var ignoreDeadline = {
  deadlineTime: '2026-09-01 18:00',
  teeTime: '2026-09-03 08:00'
};
assert('不读报名截止', calendarDate.resolvePosterMatchDate(ignoreDeadline) === '2026-09-03');

var engineSrc = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/poster/utils/poster-engine.js'),
  'utf8'
);
var scoreSrc = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/poster/utils/score-data.js'),
  'utf8'
);
var posterJs = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/poster/components/golf-poster/index.js'),
  'utf8'
);
assert('海报引擎使用统一日历格式化', engineSrc.indexOf('formatCalendarDateDotted') >= 0);
assert('缺失日期画占位', engineSrc.indexOf('DATE_MISSING_PLACEHOLDER') >= 0);
assert('成绩数据使用比赛日期解析', scoreSrc.indexOf('resolvePosterMatchDate') >= 0);
assert('成绩数据不再 new Date(value)', /new Date\(\s*value\s*\)/.test(scoreSrc) === false);
assert('成绩数据不把 createdAt 当比赛日', scoreSrc.indexOf('createdAt') < 0 || scoreSrc.indexOf('formatDateYMD(game.createdAt)') < 0);
assert('导出前校验比赛日期', posterJs.indexOf('export blocked: match date missing') >= 0);

console.log('');
console.log(failed ? 'FAILED ' + failed + ' / ' + (passed + failed) : 'OK  ' + passed + ' passed');
process.exit(failed ? 1 : 0);
