/**
 * scheduleAdapter — 业务对象 → scheduleStore 创建参数
 *
 * 首页日程：球队赛事报名同步等（不写盘，仅转换）。
 */

const halfCourse = require('./halfCourse.js');

/**
 * 从 match.teeTime 解析 YYYY-MM-DD
 * @param {string|number} teeTime
 * @returns {string}
 */
function resolveTeamMatchDateKey(teeTime) {
  const raw = teeTime != null ? String(teeTime).trim() : '';
  if (!raw) {
    console.warn('[scheduleAdapter] teeTime empty, date will be blank');
    return '';
  }
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];

  const ts = Number(raw);
  if (!isNaN(ts) && ts > 0) {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const mo = d.getMonth() + 1;
      const day = d.getDate();
      const pad = function (n) {
        return n < 10 ? '0' + n : '' + n;
      };
      return y + '-' + pad(mo) + '-' + pad(day);
    }
  }

  console.warn('[scheduleAdapter] cannot parse teeTime:', raw);
  return '';
}

/**
 * 赛事日程正文：roundName + courseName + teeTimeText（跳过空段）
 * @param {object} match
 * @returns {string}
 */
function buildTeamMatchScheduleContent(match) {
  const m = match && typeof match === 'object' ? match : {};
  const parts = [
    m.roundName != null ? String(m.roundName).trim() : '',
    halfCourse.formatCourseDisplayName(m),
    m.teeTimeText != null ? String(m.teeTimeText).trim() : ''
  ].filter(Boolean);
  return parts.join(' ');
}

/**
 * 球队赛事报名用户 → scheduleStore.createSchedule 入参
 * @param {object} match
 * @param {object} user registerInfo.users 项
 * @returns {object}
 */
function createTeamMatchSchedule(match, user) {
  const m = match && typeof match === 'object' ? match : {};
  const u = user && typeof user === 'object' ? user : {};
  const ownerId = String(
    u.userId != null ? u.userId : u.playerId != null ? u.playerId : u.id != null ? u.id : ''
  ).trim();
  const sourceId = String(m.matchId != null ? m.matchId : '').trim();
  const date = resolveTeamMatchDateKey(m.teeTime);

  return {
    type: 'manual',
    ownerId: ownerId,
    sourceType: 'team_match',
    sourceId: sourceId,
    date: date,
    content: buildTeamMatchScheduleContent(m),
    members: []
  };
}

module.exports = {
  resolveTeamMatchDateKey: resolveTeamMatchDateKey,
  buildTeamMatchScheduleContent: buildTeamMatchScheduleContent,
  createTeamMatchSchedule: createTeamMatchSchedule
};
