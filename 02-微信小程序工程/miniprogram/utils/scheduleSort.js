/**
 * scheduleSort — 日程展示排序（不改 store 结构）
 *
 * 规则：
 * 1. 有 startTime：按 startTime 升序
 * 2. 时间相同（含均无 startTime）：sourceType 优先级
 *    team_match > friend_reminder > self
 * 3. 仍相同：按 createdAt 升序
 */

/** @type {Record<string, number>} 数值越小优先级越高 */
var SOURCE_PRIORITY = {
  team_match: 0,
  friend_reminder: 1,
  self: 2
};

/**
 * "HH:mm" / "HH:mm:ss" → 分钟数；无效返回 null
 * @param {*} value
 * @returns {number|null}
 */
function parseStartTimeMinutes(value) {
  if (value == null || value === '') return null;
  var s = String(value).trim();
  if (!s) return null;
  var m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return null;
  var h = Number(m[1]);
  var min = Number(m[2]);
  if (isNaN(h) || isNaN(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * @param {*} item
 * @returns {number}
 */
function sourceRank(item) {
  var t = item && item.sourceType != null ? String(item.sourceType).trim() : 'self';
  if (!t) t = 'self';
  return SOURCE_PRIORITY.hasOwnProperty(t) ? SOURCE_PRIORITY[t] : 99;
}

/**
 * @param {*} item
 * @returns {number}
 */
function createdAtValue(item) {
  if (!item || item.createdAt == null || item.createdAt === '') return 0;
  var n = Number(item.createdAt);
  if (!isNaN(n)) return n;
  var t = Date.parse(String(item.createdAt));
  return isNaN(t) ? 0 : t;
}

/**
 * 稳定排序：不修改原数组，返回新数组
 * @param {Array} list
 * @returns {Array}
 */
function sortSchedules(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return Array.isArray(list) ? list.slice() : [];
  }

  return list.slice().sort(function (a, b) {
    var ta = parseStartTimeMinutes(a && a.startTime);
    var tb = parseStartTimeMinutes(b && b.startTime);

    // 一方有 startTime、一方无：有时间的排前面
    if (ta != null && tb == null) return -1;
    if (ta == null && tb != null) return 1;

    // 双方都有：按时间升序
    if (ta != null && tb != null && ta !== tb) {
      return ta - tb;
    }

    // 时间相同（含双方都无）：sourceType 优先级
    var ra = sourceRank(a);
    var rb = sourceRank(b);
    if (ra !== rb) return ra - rb;

    // 再按 createdAt 升序
    return createdAtValue(a) - createdAtValue(b);
  });
}

module.exports = {
  sortSchedules: sortSchedules,
  parseStartTimeMinutes: parseStartTimeMinutes
};
