/**
 * 海报比赛日期：日历日（年月日），不是时间点。
 * 禁止 new Date("YYYY-MM-DD") / toISOString() / UTC getter，避免时区换日。
 *
 * 比赛日期字段契约（仅这些进入回退链）：
 * - 普通赛 game.teeTime = 创建页 teeTimeText（中文「YYYY年MM月DD日 …」）
 * - 队内/队际 match.teeTime = 「YYYY-MM-DD HH:mm」，teeTimeText 为展示文案
 * - 系列赛分站：round.dateTime → match.teeTime / teeTimeText（「YYYY-MM-DD HH:mm」）
 * 不使用：createdAt、deadlineTime、schedule.date、matchDate、无开球语义的 date
 */

const DATE_MISSING_PLACEHOLDER = '日期待填';

function pad2(n) {
  const i = Math.floor(Number(n));
  if (!Number.isFinite(i)) return '';
  return i < 10 ? '0' + i : String(i);
}

function ymd(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { year: y, month: m, day: d };
}

function formatYmd(parts) {
  if (!parts) return '';
  return parts.year + '-' + pad2(parts.month) + '-' + pad2(parts.day);
}

function formatDotted(parts) {
  if (!parts) return '';
  return parts.year + '.' + pad2(parts.month) + '.' + pad2(parts.day);
}

/**
 * 只从日历字符串拆年月日。不接受 Date / 时间戳 / createdAt。
 */
function parseCalendarDateParts(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || value instanceof Date) return null;

  const s = String(value).trim();
  if (!s) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return ymd(iso[1], iso[2], iso[3]);

  const dotted = /^(\d{4})[./](\d{1,2})[./](\d{1,2})/.exec(s);
  if (dotted) return ymd(dotted[1], dotted[2], dotted[3]);

  const cn = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(s);
  if (cn) return ymd(cn[1], cn[2], cn[3]);

  return null;
}

function formatCalendarDateYMD(value) {
  return formatYmd(parseCalendarDateParts(value));
}

function formatCalendarDateDotted(value) {
  const parts = parseCalendarDateParts(value);
  if (parts) return formatDotted(parts);
  return '';
}

function hasPosterMatchDate(value) {
  return !!parseCalendarDateParts(value);
}

function resolvePosterMatchDate(game) {
  const host = game && typeof game === 'object' ? game : {};
  const fields = [host.teeTime, host.teeTimeText];
  for (let i = 0; i < fields.length; i++) {
    const ymdStr = formatCalendarDateYMD(fields[i]);
    if (ymdStr) return ymdStr;
  }
  console.warn('[poster-date] match calendar date missing', {
    gameId: host.gameId || host.matchId || '',
    matchType: host.matchType || '',
    teeTime: host.teeTime,
    teeTimeText: host.teeTimeText,
    createdAt: host.createdAt
  });
  return '';
}

module.exports = {
  DATE_MISSING_PLACEHOLDER,
  parseCalendarDateParts,
  formatCalendarDateYMD,
  formatCalendarDateDotted,
  hasPosterMatchDate,
  resolvePosterMatchDate
};
