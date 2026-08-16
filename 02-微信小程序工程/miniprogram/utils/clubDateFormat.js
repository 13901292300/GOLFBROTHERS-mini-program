/**
 * 首页赛事卡片 / 详情 Hero 共用月份格式（大写英文三字母 JAN–DEC）
 * 手工映射，不读设备 locale；不改存储、创建页滚轮、赛程 dock。
 */

var CLUB_MONTH_LABELS = [
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

function clubMonthLabel(month) {
  var i = parseInt(month, 10);
  if (!Number.isFinite(i) || i < 1 || i > 12) return '';
  return CLUB_MONTH_LABELS[i - 1];
}

function pad2(n) {
  var v = Number(n);
  if (!Number.isFinite(v)) return '';
  var i = Math.floor(v);
  return i < 10 ? '0' + i : String(i);
}

function formatClubMonthDay(parts) {
  if (!parts) return '';
  var month = clubMonthLabel(parts.month);
  var day = pad2(parts.day);
  if (!month || !day) return '';
  return month + '/' + day;
}

function formatClubDateFromParts(parts) {
  var md = formatClubMonthDay(parts);
  if (!md || !parts || parts.year == null || String(parts.year).trim() === '') return '';
  return md + '/' + parts.year;
}

/** 单日：MON/DD/YYYY；无法解析则空串（队内/队际卡片与 Hero） */
function formatClubDate(timeString) {
  var m = String(timeString || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  var month = clubMonthLabel(m[2]);
  if (!month) return '';
  return month + '/' + m[3] + '/' + m[1];
}

/**
 * 已解析起止日期 → 展示文案
 * - 同日：MON/DD/YYYY
 * - 同年同月跨日：MON/DD-DD  (YYYY)（月份只出现一次）
 * - 同年跨月：MON/DD-MON/DD  (YYYY)
 * - 跨年：MON/DD (YYYY)-MON/DD (YYYY)
 */
function formatDateRangeFromParts(minP, maxP, emptyText) {
  var empty = emptyText == null ? '' : String(emptyText);
  if (!minP || !maxP) return empty;
  var sameDay =
    minP.year === maxP.year && minP.month === maxP.month && minP.day === maxP.day;
  if (sameDay) return formatClubDateFromParts(minP);
  if (minP.year === maxP.year) {
    if (minP.month === maxP.month) {
      return formatClubMonthDay(minP) + '-' + pad2(maxP.day) + '  (' + minP.year + ')';
    }
    return (
      formatClubMonthDay(minP) +
      '-' +
      formatClubMonthDay(maxP) +
      '  (' +
      minP.year +
      ')'
    );
  }
  return (
    formatClubMonthDay(minP) +
    ' (' +
    minP.year +
    ')-' +
    formatClubMonthDay(maxP) +
    ' (' +
    maxP.year +
    ')'
  );
}

module.exports = {
  CLUB_MONTH_LABELS: CLUB_MONTH_LABELS,
  clubMonthLabel: clubMonthLabel,
  formatClubMonthDay: formatClubMonthDay,
  formatClubDateFromParts: formatClubDateFromParts,
  formatClubDate: formatClubDate,
  formatDateRangeFromParts: formatDateRangeFromParts
};
