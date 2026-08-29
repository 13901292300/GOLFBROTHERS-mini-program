/**
 * Series 轮次 dock 说明行纯函数（ROUND-DOCK）
 * 总榜 / 赛程共用。不显示开球时刻；缺字段不产生连续分隔符。
 * TOT / cumulative：空串（容器仍由组件占位）。
 */

var CUMULATIVE_KEY = 'cumulative';
var TIME_PENDING = '比赛时间待定';
var GAME_MODE_PENDING = '赛制待定';

var seriesGameModeLabel = require('../../../../utils/seriesGameModeLabel.js');
var seriesRyderCupAccumulate = require('../../../../utils/seriesRyderCupAccumulate.js');

var ROUND_INFO_MONTH_LABELS = [
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

function asString(v) {
  return v == null ? '' : String(v);
}

function pad2(n) {
  var num = Number(n);
  if (!Number.isFinite(num)) return '';
  return num < 10 ? '0' + num : String(num);
}

/**
 * 本地日期片段解析（禁止 new Date(字符串)）
 * 支持 YYYY-MM-DD / YYYY-MM-DD HH:mm[:ss]（空格或 T）
 */
function parseRoundInfoDateParts(input) {
  var s = asString(input).trim();
  if (!s) return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (!m) return null;
  var year = Number(m[1]);
  var month = Number(m[2]);
  var day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  var hour = m[4] != null ? Number(m[4]) : 0;
  var minute = m[5] != null ? Number(m[5]) : 0;
  return {
    year: year,
    month: month,
    day: day,
    hour: hour,
    minute: minute,
    hasTime: m[4] != null
  };
}

function formatRoundInfoMonthDay(parts) {
  if (!parts || !parts.month || !parts.day) return '';
  var mon = ROUND_INFO_MONTH_LABELS[parts.month - 1];
  var dd = pad2(parts.day);
  if (!mon || !dd) return '';
  return mon + ' ' + dd;
}

/** 下拉日期：AUG 20；不带年、不带时分 */
function formatRoundSelectorDate(dateTime) {
  return formatRoundInfoMonthDay(parseRoundInfoDateParts(dateTime)) || '';
}

function resolveRoundSelectorFormatName(round, stateRow) {
  var r = round && typeof round === 'object' ? round : {};
  var st = stateRow && typeof stateRow === 'object' ? stateRow : {};
  var tokens = [
    r.matchType,
    r.gameMode,
    r.selectedGameMode,
    r.formatType,
    r.playFormat,
    st.gameMode,
    st.matchType
  ];
  for (var i = 0; i < tokens.length; i++) {
    var raw = asString(tokens[i]).trim();
    if (!raw) continue;
    var fromTable = seriesGameModeLabel.resolveSeriesGameModeLabel(raw);
    if (fromTable) return fromTable;
    if (raw.indexOf('比杆') >= 0 || raw.indexOf('比洞') >= 0) return raw;
  }
  return GAME_MODE_PENDING;
}

/**
 * 得分榜 / 出发表下拉唯一文案：R1 · SEP 08 · 四人四球比洞赛
 * 缺日期省略；缺赛制 → 赛制待定；不产生连续分隔符。TOTAL 不得调用。
 */
function buildSeriesRoundSelectorDisplayText(round, stateRow, fallbackIndex) {
  var r = round && typeof round === 'object' ? round : {};
  var st = stateRow && typeof stateRow === 'object' ? stateRow : {};
  var idxRaw = r.index != null ? r.index : st.index;
  var roundNum =
    idxRaw != null && Number.isFinite(Number(idxRaw)) && Number(idxRaw) > 0
      ? Math.floor(Number(idxRaw))
      : fallbackIndex > 0
        ? fallbackIndex
        : 1;
  var dateStr = formatRoundSelectorDate(
    r.startTime || r.dateTime || r.teeTime || st.startTime || st.dateTime
  );
  var formatName = resolveRoundSelectorFormatName(r, st) || GAME_MODE_PENDING;
  var parts = ['R' + roundNum];
  if (dateStr) parts.push(dateStr);
  if (formatName) parts.push(formatName);
  return parts.join(' · ');
}

/** 莱德杯得分榜时间：2026年8月20日 08:00；缺失走比赛时间待定 */
function formatSeriesRoundDateTimeText(dateTime, emptyText) {
  var pending = emptyText == null ? TIME_PENDING : String(emptyText);
  var parts = parseRoundInfoDateParts(dateTime);
  if (!parts) return pending;
  var date = parts.year + '年' + parts.month + '月' + parts.day + '日';
  if (!parts.hasTime) return date;
  return date + ' ' + pad2(parts.hour) + ':' + pad2(parts.minute);
}

function findSeriesRoundById(series, roundId) {
  var rid = asString(roundId).trim();
  if (!rid) return null;
  var rounds = series && Array.isArray(series.rounds) ? series.rounds : [];
  for (var i = 0; i < rounds.length; i++) {
    var r = rounds[i] || {};
    if (asString(r.roundId).trim() === rid) return r;
  }
  return null;
}

function resolveRyderCupRoundDisplayIndex(round, series, roundId) {
  if (round && round.index != null && Number.isFinite(Number(round.index))) {
    var n = Math.floor(Number(round.index));
    if (n > 0) return n;
  }
  var rid = asString(roundId).trim();
  var rounds = series && Array.isArray(series.rounds) ? series.rounds : [];
  for (var i = 0; i < rounds.length; i++) {
    if (asString(rounds[i] && rounds[i].roundId).trim() === rid) return i + 1;
  }
  return 0;
}

/**
 * 莱德杯得分榜：第一轮 · 时间 · 赛制。身份只用 roundId。
 */
function buildRyderCupRoundInfoText(selectedKey, selectedRound, series) {
  var rid = asString(selectedKey).trim();
  if (!rid || rid === CUMULATIVE_KEY || rid === 'total') return '';
  var round = selectedRound && asString(selectedRound.roundId).trim() === rid
    ? selectedRound
    : findSeriesRoundById(series, rid);
  if (!round || asString(round.roundId).trim() !== rid) return '';
  var chineseName = seriesRyderCupAccumulate.formatChineseRoundName(
    resolveRyderCupRoundDisplayIndex(round, series, rid)
  );
  var timeText = formatSeriesRoundDateTimeText(round.dateTime, TIME_PENDING);
  var modeText = seriesGameModeLabel.resolveSeriesGameModeLabel(round.gameMode);
  if (!modeText) modeText = GAME_MODE_PENDING;
  if (!chineseName) return '';
  return [chineseName, timeText, modeText].join(' · ');
}

function findRoundInfoSource(roundId, roundStates, series) {
  var rid = asString(roundId).trim();
  if (!rid) return null;
  var list = Array.isArray(roundStates) ? roundStates : [];
  var fromState = null;
  for (var i = 0; i < list.length; i++) {
    var st = list[i] || {};
    if (asString(st.roundId).trim() === rid) {
      fromState = st;
      break;
    }
  }
  var fromSeries = null;
  var rounds = series && Array.isArray(series.rounds) ? series.rounds : [];
  for (var j = 0; j < rounds.length; j++) {
    var r = rounds[j] || {};
    if (asString(r.roundId).trim() === rid) {
      fromSeries = r;
      break;
    }
  }
  if (!fromState && !fromSeries) return null;
  var st0 = fromState || {};
  var sr0 = fromSeries || {};
  var index =
    st0.index != null && Number.isFinite(Number(st0.index))
      ? Number(st0.index)
      : sr0.index != null && Number.isFinite(Number(sr0.index))
        ? Number(sr0.index)
        : null;
  var label = asString(st0.label).trim();
  if (!label && index != null) label = 'R' + index;
  if (!label) label = asString(sr0.name).trim();
  return {
    label: label,
    dateTime: asString(st0.dateTime).trim() || asString(sr0.dateTime).trim(),
    courseName: asString(st0.courseName).trim() || asString(sr0.courseName).trim(),
    courseHalfText:
      asString(st0.courseHalfText).trim() || asString(sr0.courseHalfText).trim()
  };
}

/**
 * 当前轮信息：R1 · AUG 13 · 球场 · 半场
 * 开球时刻不进入 dock 文案。TOT / 无轮：空串。
 */
function buildSeriesRoundInfoText(selectedKey, roundStates, series) {
  var key = asString(selectedKey).trim() || CUMULATIVE_KEY;
  if (key === CUMULATIVE_KEY || key === 'total') return '';
  var src = findRoundInfoSource(key, roundStates, series);
  if (!src) return '';
  var dateText = formatRoundInfoMonthDay(parseRoundInfoDateParts(src.dateTime));
  return [src.label, dateText, src.courseName, src.courseHalfText]
    .filter(Boolean)
    .join(' · ');
}

function resolveScheduleGameModeLabel(selectedKey, series, stationGameMode) {
  var fromStation = seriesGameModeLabel.resolveSeriesGameModeLabel(stationGameMode);
  if (fromStation) return fromStation;
  var round = findSeriesRoundById(series, selectedKey);
  var fromRound = seriesGameModeLabel.resolveSeriesGameModeLabel(
    round && (round.gameMode || round.selectedGameMode)
  );
  if (fromRound) return fromRound;
  return GAME_MODE_PENDING;
}

/** 莱德杯赛程 TAB：在现有 roundInfoText 末尾追加 G5–G8 展示名 */
function appendRyderCupScheduleGameMode(baseText, selectedKey, series, stationGameMode) {
  var rid = asString(selectedKey).trim();
  if (!rid || rid === CUMULATIVE_KEY || rid === 'total') return asString(baseText).trim();
  var mode = resolveScheduleGameModeLabel(rid, series, stationGameMode);
  var base = asString(baseText).trim();
  if (!base) return mode;
  return base + ' · ' + mode;
}

module.exports = {
  CUMULATIVE_KEY: CUMULATIVE_KEY,
  pad2: pad2,
  parseRoundInfoDateParts: parseRoundInfoDateParts,
  formatRoundInfoMonthDay: formatRoundInfoMonthDay,
  findRoundInfoSource: findRoundInfoSource,
  buildSeriesRoundInfoText: buildSeriesRoundInfoText,
  buildStandingsRoundInfoText: buildSeriesRoundInfoText,
  TIME_PENDING: TIME_PENDING,
  GAME_MODE_PENDING: GAME_MODE_PENDING,
  formatSeriesRoundDateTimeText: formatSeriesRoundDateTimeText,
  formatRoundSelectorDate: formatRoundSelectorDate,
  resolveRoundSelectorFormatName: resolveRoundSelectorFormatName,
  buildSeriesRoundSelectorDisplayText: buildSeriesRoundSelectorDisplayText,
  buildRyderCupRoundInfoText: buildRyderCupRoundInfoText,
  resolveScheduleGameModeLabel: resolveScheduleGameModeLabel,
  appendRyderCupScheduleGameMode: appendRyderCupScheduleGameMode
};
