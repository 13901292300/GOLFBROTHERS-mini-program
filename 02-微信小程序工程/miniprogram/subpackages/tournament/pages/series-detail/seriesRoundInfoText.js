/**
 * Series 轮次 dock 说明行纯函数（ROUND-DOCK）
 * 总榜 / 赛程共用。不显示开球时刻；缺字段不产生连续分隔符。
 * TOT / cumulative：空串（容器仍由组件占位）。
 */

var CUMULATIVE_KEY = 'cumulative';

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
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.exec(s);
  if (!m) return null;
  var year = Number(m[1]);
  var month = Number(m[2]);
  var day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year: year, month: month, day: day };
}

function formatRoundInfoMonthDay(parts) {
  if (!parts || !parts.month || !parts.day) return '';
  var mon = ROUND_INFO_MONTH_LABELS[parts.month - 1];
  var dd = pad2(parts.day);
  if (!mon || !dd) return '';
  return mon + ' ' + dd;
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
  if (key === CUMULATIVE_KEY) return '';
  var src = findRoundInfoSource(key, roundStates, series);
  if (!src) return '';
  var dateText = formatRoundInfoMonthDay(parseRoundInfoDateParts(src.dateTime));
  return [src.label, dateText, src.courseName, src.courseHalfText]
    .filter(Boolean)
    .join(' · ');
}

module.exports = {
  CUMULATIVE_KEY: CUMULATIVE_KEY,
  pad2: pad2,
  parseRoundInfoDateParts: parseRoundInfoDateParts,
  formatRoundInfoMonthDay: formatRoundInfoMonthDay,
  findRoundInfoSource: findRoundInfoSource,
  buildSeriesRoundInfoText: buildSeriesRoundInfoText,
  buildStandingsRoundInfoText: buildSeriesRoundInfoText
};
