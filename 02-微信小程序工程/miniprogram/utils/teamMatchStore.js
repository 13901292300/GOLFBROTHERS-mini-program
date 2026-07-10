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
    brightImage: item && (item.brightImage != null || item.imageData != null)
      ? String(item.brightImage != null ? item.brightImage : item.imageData)
      : '',
    darkImage: item && (item.darkImage != null || item.imageData != null)
      ? String(item.darkImage != null ? item.darkImage : item.imageData)
      : '',
    status: item && item.status ? String(item.status) : ''
  }));
}

function cloneTeamGroups(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item, index) => ({
    id: item && item.id != null ? item.id : index + 1,
    renderKey: item && item.renderKey
      ? String(item.renderKey)
      : ('team-group-' + (item && item.id != null ? item.id : index + 1)),
    name: item && item.name ? String(item.name).trim() : ''
  }));
}

function createDefaultRegisterInfo() {
  return {
    totalCount: 0,
    users: []
  };
}

const REGISTER_SOURCES = { SELF: 'self', PROXY: 'proxy', ADMIN: 'admin' };
const REGISTER_SUBJECT_TYPES = { SELF: 'self', OTHER: 'other' };
const REGISTER_PICK_CHANNELS = {
  FRIENDS: 'friends',
  TEAM_MEMBERS: 'team_members',
  MANUAL: 'manual',
  NONE: ''
};

function _normalizeRegisterSource(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === REGISTER_SOURCES.PROXY || v === REGISTER_SOURCES.ADMIN || v === REGISTER_SOURCES.SELF) {
    return v;
  }
  return REGISTER_SOURCES.SELF;
}

function _normalizeSubjectType(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === REGISTER_SUBJECT_TYPES.OTHER ? REGISTER_SUBJECT_TYPES.OTHER : REGISTER_SUBJECT_TYPES.SELF;
}

function _normalizePickChannel(value) {
  const v = String(value || '').trim().toLowerCase();
  if (
    v === REGISTER_PICK_CHANNELS.FRIENDS ||
    v === REGISTER_PICK_CHANNELS.TEAM_MEMBERS ||
    v === REGISTER_PICK_CHANNELS.MANUAL
  ) {
    return v;
  }
  return REGISTER_PICK_CHANNELS.NONE;
}

/**
 * 报名记录 normalize（旧数据兼容）：
 * 缺省字段一律按「本人报名」补齐，不改动已有显式值语义。
 */
function normalizeRegisterUser(user) {
  const raw = user && typeof user === 'object' ? user : {};
  const userId = raw.userId != null ? String(raw.userId) : '';
  const competitionName = raw.competitionName != null ? String(raw.competitionName) : '';
  const nickname = raw.nickname != null ? String(raw.nickname) : '';
  const name = raw.name != null ? String(raw.name) : '';
  const displayFallback = competitionName || nickname || name || '';

  const hasSource = raw.source != null && String(raw.source).trim() !== '';
  const source = hasSource ? _normalizeRegisterSource(raw.source) : REGISTER_SOURCES.SELF;

  const registeredBy =
    raw.registeredBy != null && String(raw.registeredBy).trim() !== ''
      ? String(raw.registeredBy)
      : userId;

  const registeredByName =
    raw.registeredByName != null && String(raw.registeredByName).trim() !== ''
      ? String(raw.registeredByName)
      : displayFallback;

  const hasSubjectType = raw.subjectType != null && String(raw.subjectType).trim() !== '';
  const subjectType = hasSubjectType
    ? _normalizeSubjectType(raw.subjectType)
    : REGISTER_SUBJECT_TYPES.SELF;

  const pickChannel =
    raw.pickChannel != null ? _normalizePickChannel(raw.pickChannel) : REGISTER_PICK_CHANNELS.NONE;

  const canSelfCancel = raw.canSelfCancel != null ? !!raw.canSelfCancel : true;
  const locked = raw.locked != null ? !!raw.locked : false;

  // Patch 6：手工代报名预留字段（旧数据缺省为空串）
  const userType = raw.userType != null ? String(raw.userType) : '';
  const realName = raw.realName != null ? String(raw.realName) : '';
  const remarkName = raw.remarkName != null ? String(raw.remarkName) : '';

  return {
    userId: userId,
    nickname: nickname,
    competitionName: competitionName,
    gender: raw.gender != null ? String(raw.gender) : '',
    handicap: raw.handicap != null ? raw.handicap : '',
    avatar: raw.avatar != null ? String(raw.avatar) : '',
    phone: raw.phone != null ? String(raw.phone) : '',
    groupId: raw.groupId != null ? raw.groupId : '',
    groupName: raw.groupName != null ? String(raw.groupName) : '',
    registeredAt: raw.registeredAt != null ? raw.registeredAt : '',
    source: source,
    registeredBy: registeredBy,
    registeredByName: registeredByName,
    subjectType: subjectType,
    pickChannel: pickChannel,
    canSelfCancel: canSelfCancel,
    locked: locked,
    userType: userType,
    realName: realName,
    remarkName: remarkName
  };
}

function normalizeRegisterInfo(info) {
  if (!info || typeof info !== 'object') return createDefaultRegisterInfo();
  const users = Array.isArray(info.users) ? info.users.map(normalizeRegisterUser) : [];
  // Patch 8：totalCount 始终以 users.length 为准，避免旧数据/脏数据漂移
  return {
    totalCount: users.length,
    users: users
  };
}

function cloneRegisterInfo(info) {
  return normalizeRegisterInfo(info);
}

/**
 * 从创建队内赛页 data 构建球队赛记录（复用现有卡片字段语义）
 */
function buildMatchFromCreatePage(pageData) {
  const data = pageData || {};
  const gameStore = require('./gameStore.js');
  const creator = gameStore.getCurrentUser();
  const creatorId = data.createdBy || data.creatorId || (creator && creator.userId) || '';
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
    teamGroups: cloneTeamGroups(data.teamGroups),
    registerInfo: createDefaultRegisterInfo(),
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
    registerStatus: data.registerStatus === 'closed' ? 'closed' : 'open',
    status: 'registering',
    statusLabel: '报名中',
    createdBy: creatorId,
    creatorId: creatorId,
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
  REGISTER_SOURCES,
  REGISTER_SUBJECT_TYPES,
  REGISTER_PICK_CHANNELS,
  buildMatchFromCreatePage,
  saveMatch,
  listMatches,
  getMatchById,
  toTournamentCard,
  formatClubDate,
  normalizeRegisterUser,
  normalizeRegisterInfo,
  createDefaultRegisterInfo
};
