/**
 * 新建比赛时的开球/截止日期时间：每次调用按设备本地墙钟取一次快照。
 * 禁止在模块加载时取时后长期复用；禁止 Date.parse / toISOString / UTC 换日。
 */

var WEEK_NAMES_LONG = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
var WEEK_NAMES_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
var MINUTE_VALUES = [0, 10, 20, 30, 40, 50];
var ISO_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/;
var FLEX_LOCAL_RE = /(\d{4})[/\-年](\d{1,2})[/\-月](\d{1,2})[日号]?[^\d]*(\d{1,2}):(\d{1,2})/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function clampInt(n, min, max) {
  var v = Math.floor(Number(n));
  if (!isFinite(v)) return min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function clampDraft(parts) {
  var p = cloneParts(parts || { year: 0, month: 1, day: 1, hour: 0, minute: 0 });
  p.month = clampInt(p.month, 1, 12);
  p.hour = clampInt(p.hour, 0, 23);
  p.minute = clampInt(p.minute, 0, 59);
  var dim = new Date(p.year, p.month, 0).getDate();
  p.day = clampInt(p.day, 1, dim || 31);
  return p;
}

function cloneParts(p) {
  return {
    year: p.year,
    month: p.month,
    day: p.day,
    hour: p.hour,
    minute: p.minute
  };
}

function resolveNow(now) {
  if (now instanceof Date) {
    if (!isNaN(now.getTime())) return now;
    return new Date();
  }
  if (now == null || now === '') return new Date();
  var d = new Date(now);
  if (isNaN(d.getTime())) return new Date();
  return d;
}

/** 本地年月日时分；不取整。创建默认 / 滚轮映射用 roundDraftToTenMinutes。 */
function partsFromDate(now) {
  var d = resolveNow(now);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes()
  };
}

/**
 * 按最近 10 分钟四舍五入（以 5 为界）。
 * 00–04→00，05–14→10，…，45–54→50，55–59→下一小时 00。
 * 跨小时/跨日/月末/年末一律走 Date 进位。
 */
function roundDraftToTenMinutes(parts) {
  var p = clampDraft(parts);
  var d = new Date(p.year, p.month - 1, p.day, p.hour, 0, 0, 0);
  var m = clampInt(p.minute, 0, 59);
  if (m <= 4) d.setMinutes(0);
  else if (m <= 14) d.setMinutes(10);
  else if (m <= 24) d.setMinutes(20);
  else if (m <= 34) d.setMinutes(30);
  else if (m <= 44) d.setMinutes(40);
  else if (m <= 54) d.setMinutes(50);
  else {
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
  }
  return partsFromDate(d);
}

function formatIsoLocal(parts) {
  return (
    parts.year +
    '-' +
    pad2(parts.month) +
    '-' +
    pad2(parts.day) +
    ' ' +
    pad2(parts.hour) +
    ':' +
    pad2(parts.minute)
  );
}

function weekdayName(parts, weekNames) {
  var names = weekNames || WEEK_NAMES_LONG;
  return names[new Date(parts.year, parts.month - 1, parts.day).getDay()];
}

function formatSlashDisplay(parts, weekNames) {
  return (
    parts.year +
    '/' +
    pad2(parts.month) +
    '/' +
    pad2(parts.day) +
    ' ' +
    weekdayName(parts, weekNames || WEEK_NAMES_LONG) +
    ' ' +
    pad2(parts.hour) +
    ':' +
    pad2(parts.minute)
  );
}

function formatChineseTeeText(parts, weekNames) {
  return (
    parts.year +
    '年' +
    pad2(parts.month) +
    '月' +
    pad2(parts.day) +
    '日 ' +
    weekdayName(parts, weekNames || WEEK_NAMES_SHORT) +
    ' ' +
    pad2(parts.hour) +
    ':' +
    pad2(parts.minute)
  );
}

/** 报名截止：同一快照的开球日历日的前一天 18:00（本地）。 */
function deadlinePartsFromTee(teeParts) {
  var d = new Date(teeParts.year, teeParts.month - 1, teeParts.day);
  d.setDate(d.getDate() - 1);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: 18,
    minute: 0
  };
}

function snapshot(now) {
  var tee = roundDraftToTenMinutes(partsFromDate(now));
  return {
    tee: tee,
    deadline: deadlinePartsFromTee(tee)
  };
}

function buildCreateTimes(now, weekNames) {
  var snap = snapshot(now);
  var names = weekNames || WEEK_NAMES_LONG;
  return {
    tee: snap.tee,
    deadline: snap.deadline,
    dataPatch: {
      teeTime: formatIsoLocal(snap.tee),
      teeTimeText: formatSlashDisplay(snap.tee, names),
      deadlineTime: formatIsoLocal(snap.deadline),
      deadlineTimeText: formatSlashDisplay(snap.deadline, names),
      timeDraft: cloneParts(snap.tee),
      teeYear: snap.tee.year
    }
  };
}

function parseIsoLocalParts(timeString) {
  var m = String(timeString == null ? '' : timeString).match(ISO_LOCAL_RE);
  if (!m) return null;
  return {
    year: parseInt(m[1], 10),
    month: parseInt(m[2], 10),
    day: parseInt(m[3], 10),
    hour: parseInt(m[4], 10),
    minute: parseInt(m[5], 10)
  };
}

function parseFlexibleLocalParts(timeString) {
  var iso = parseIsoLocalParts(timeString);
  if (iso) return iso;
  var raw = String(timeString == null ? '' : timeString).trim();
  if (!raw) return null;
  var m = raw.match(FLEX_LOCAL_RE);
  if (!m) return null;
  return {
    year: parseInt(m[1], 10),
    month: parseInt(m[2], 10),
    day: parseInt(m[3], 10),
    hour: parseInt(m[4], 10),
    minute: parseInt(m[5], 10)
  };
}

/**
 * 滚轮打开时解析：映射到最近合法 10 分钟档（以 5 为界）。
 * 空串/无法解析时当场取本地现在再取整，不回落到写死日期。
 */
function parseTimeToDraftForWheel(timeString, now) {
  var exact = parseIsoLocalParts(timeString);
  if (!exact) exact = parseFlexibleLocalParts(timeString);
  if (!exact) exact = partsFromDate(now);
  return roundDraftToTenMinutes(exact);
}

function resolveStoredDraft(iso, displayText) {
  return parseIsoLocalParts(iso) || parseFlexibleLocalParts(displayText) || null;
}

module.exports = {
  WEEK_NAMES_LONG: WEEK_NAMES_LONG,
  WEEK_NAMES_SHORT: WEEK_NAMES_SHORT,
  MINUTE_VALUES: MINUTE_VALUES,
  pad2: pad2,
  clampInt: clampInt,
  clampDraft: clampDraft,
  cloneParts: cloneParts,
  partsFromDate: partsFromDate,
  roundDraftToTenMinutes: roundDraftToTenMinutes,
  formatIsoLocal: formatIsoLocal,
  formatSlashDisplay: formatSlashDisplay,
  formatChineseTeeText: formatChineseTeeText,
  deadlinePartsFromTee: deadlinePartsFromTee,
  snapshot: snapshot,
  buildCreateTimes: buildCreateTimes,
  parseIsoLocalParts: parseIsoLocalParts,
  parseFlexibleLocalParts: parseFlexibleLocalParts,
  parseTimeToDraftForWheel: parseTimeToDraftForWheel,
  resolveStoredDraft: resolveStoredDraft
};
