/**
 * 球队赛（队内赛）创建结果 — 本地持久化，供首页「我的球队赛」卡片列表读取
 */

const STORAGE_KEY = 'gb_team_matches_v1';
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function _readAll() {
  try {
    const list = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function _writeAll(list) {
  try {
    wx.setStorageSync(STORAGE_KEY, list || []);
  } catch (e) {
    /* ignore */
  }
}

function formatClubDate(timeString) {
  const m = String(timeString || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const month = parseInt(m[2], 10);
  return MONTH_LABELS[month - 1] + '/' + m[3] + '/' + m[1];
}

function buildVenueLabel(courseName, courseHalfText) {
  const name = String(courseName || '').trim();
  const half = String(courseHalfText || '').trim();
  return name + half;
}

function resolveMatchLogo(pageData) {
  const data = pageData || {};
  const logoConfig = data.logoConfig || {};
  if (logoConfig.type === 'custom' && logoConfig.url) {
    return String(logoConfig.url).trim();
  }
  return '';
}

function cloneFeeList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => ({
    id: item && item.id,
    name: item && item.name ? String(item.name).trim() : '',
    amount: item && item.amount != null ? String(item.amount) : ''
  }));
}

function cloneEventInfoList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => ({
    id: item && item.id != null ? item.id : '',
    title: item && item.title ? String(item.title) : '',
    type: item && item.type ? String(item.type) : '',
    content: item && item.content != null ? String(item.content) : '',
    imageData: item && item.imageData != null ? String(item.imageData) : '',
    status: item && item.status ? String(item.status) : ''
  }));
}

/**
 * 从创建队内赛页 data 构建球队赛记录（复用现有卡片字段语义）
 */
function buildMatchFromCreatePage(pageData) {
  const data = pageData || {};
  const matchId = 'team-match-' + Date.now();
  return {
    matchId,
    teamId: data.teamId || '',
    teamName: data.teamName || '',
    teamLogo: data.teamLogo || '',
    matchLogo: resolveMatchLogo(data),
    roundName: data.roundName || '',
    gameMode: data.gameMode || data.selectedGameMode || '',
    matchType: data.matchType || 'team-internal',
    organizationName: data.organizationName || '',
    feeList: cloneFeeList(data.feeList),
    eventInfoList: cloneEventInfoList(data.eventInfoList),
    feeSet: !!data.feeSet,
    isDiamondMode: !!data.isDiamondMode,
    bannerImage: data.bannerImage || '',
    courseId: data.courseId || '',
    courseName: data.courseName || '',
    courseLocation: data.courseLocation || '',
    courseHalfText: data.courseHalfText || '',
    teeTime: data.teeTime || '',
    teeTimeText: data.teeTimeText || '',
    deadlineTime: data.deadlineTime || '',
    status: 'registering',
    statusLabel: '报名中',
    createdAt: Date.now()
  };
}

function saveMatch(match) {
  if (!match || !match.matchId) return null;
  const list = _readAll();
  const next = [match].concat(list.filter((item) => item && item.matchId !== match.matchId));
  _writeAll(next);
  return match;
}

function listMatches() {
  return _readAll()
    .filter((item) => item && item.matchId)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function getMatchById(matchId) {
  if (!matchId) return null;
  return _readAll().find((item) => item && item.matchId === matchId) || null;
}

/** 转为首页球队赛卡片（ds-card-club）数据结构 */
function toTournamentCard(match) {
  if (!match) return null;
  const venue = buildVenueLabel(match.courseName, match.courseHalfText);
  return {
    id: match.matchId,
    matchId: match.matchId,
    favorited: false,
    clubLogo: match.matchLogo || match.teamLogo || '',
    clubDate: formatClubDate(match.teeTime),
    title: match.roundName || match.teamName || '球队赛',
    teamName: match.teamName || '',
    venue: venue,
    views: '0',
    statusLabel: match.statusLabel || '报名中',
    navUrl: '/pages/tournament/detail/index?matchId=' + encodeURIComponent(match.matchId)
  };
}

module.exports = {
  STORAGE_KEY,
  buildMatchFromCreatePage,
  saveMatch,
  listMatches,
  getMatchById,
  toTournamentCard,
  formatClubDate
};
