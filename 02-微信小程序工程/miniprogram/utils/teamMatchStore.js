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
    logoConfig: data.logoConfig && typeof data.logoConfig === 'object'
      ? {
          type: data.logoConfig.type === 'custom' ? 'custom' : 'default',
          url: data.logoConfig.url ? String(data.logoConfig.url) : '',
          source: data.logoConfig.source ? String(data.logoConfig.source) : 'team'
        }
      : { type: 'default', url: '', source: 'team' },
    roundName: data.roundName || '',
    gameMode: data.gameMode || data.selectedGameMode || '',
    matchType: data.matchType || 'team-internal',
    organizationName: data.organizationName || '',
    feeList: cloneFeeList(data.feeList),
    eventInfoList: cloneEventInfoList(data.eventInfoList),
    teamGroups: cloneTeamGroups(data.teamGroups),
    registerInfo: createDefaultRegisterInfo(),
    groups: [],
    pairings: {},
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
    deadlineTimeText: data.deadlineTimeText || '',
    visibility: data.visibility === 'private' ? 'private' : 'public',
    accessCode: data.accessCode || '',
    groupPermission: data.groupPermission === 'player' ? 'player' : 'admin',
    registerStatus: data.registerStatus === 'closed' ? 'closed' : 'open',
    status: 'registering',
    statusLabel: '报名中',
    createdBy: creatorId,
    creatorId: creatorId,
    createdAt: Date.now()
  };
}

/**
 * 编辑保存：用创建页表单更新赛事基础配置，保留报名/状态等运行中数据。
 * @param {object} existing
 * @param {object} pageData
 * @param {{ clearGroups?: boolean }} [options] clearGroups=true 时清空正式 groups 及派生字段
 */
function updateMatchFromCreatePage(existing, pageData, options) {
  if (!existing || !existing.matchId) return null;
  const data = pageData || {};
  const opts = options || {};
  const next = Object.assign({}, existing);
  next.teamId = data.teamId || '';
  next.teamName = data.teamName || '';
  next.teamLogo = data.teamLogo || '';
  next.matchLogo = resolveMatchLogo(data);
  next.logoConfig = data.logoConfig && typeof data.logoConfig === 'object'
    ? {
        type: data.logoConfig.type === 'custom' ? 'custom' : 'default',
        url: data.logoConfig.url ? String(data.logoConfig.url) : '',
        source: data.logoConfig.source ? String(data.logoConfig.source) : 'team'
      }
    : (existing.logoConfig || { type: 'default', url: '', source: 'team' });
  next.roundName = data.roundName || '';
  next.gameMode = data.gameMode || data.selectedGameMode || existing.gameMode || '';
  next.matchType = existing.matchType || data.matchType || 'team-internal';
  next.organizationName = data.organizationName != null
    ? data.organizationName
    : (existing.organizationName || '');
  next.feeList = cloneFeeList(data.feeList);
  next.eventInfoList = cloneEventInfoList(data.eventInfoList);
  next.teamGroups = cloneTeamGroups(data.teamGroups);
  next.feeSet = !!data.feeSet;
  next.isDiamondMode = !!data.isDiamondMode;
  next.bannerImage = data.bannerImage != null ? data.bannerImage : (existing.bannerImage || '');
  next.courseId = data.courseId || '';
  next.courseName = data.courseName || '';
  next.courseLocation = data.courseLocation || '';
  next.courseHalfText = data.courseHalfText || '';
  next.teeTime = data.teeTime || '';
  next.teeTimeText = data.teeTimeText || '';
  next.deadlineTime = data.deadlineTime || '';
  next.deadlineTimeText = data.deadlineTimeText || '';
  next.visibility = data.visibility === 'private' ? 'private' : 'public';
  next.accessCode = data.accessCode || '';
  next.groupPermission = data.groupPermission === 'player' ? 'player' : 'admin';
  // 保留运行中数据
  next.matchId = existing.matchId;
  next.registerInfo = existing.registerInfo;
  next.groups = existing.groups;
  next.pairings = clonePairings(existing.pairings);
  next.registerStatus = existing.registerStatus;
  next.status = existing.status;
  next.statusLabel = existing.statusLabel;
  next.createdBy = existing.createdBy;
  next.creatorId = existing.creatorId;
  next.createdAt = existing.createdAt;
  next.updatedAt = Date.now();

  if (opts.clearGroups) {
    clearFormalGroupsOnMatch(next);
  } else if (opts.clearPairings) {
    clearFormalPairingsOnMatch(next);
  }
  return next;
}

/** 个人比杆赛：任意赛制改为此项时保留已有分组 */
const INDIVIDUAL_STROKE_MODE = '个人比杆赛';

/**
 * 组合比杆赛（系统内部统一类型）
 * 四人四球比杆赛 / 最佳球位比杆赛 逻辑完全相同，仅展示文案不同
 */
const PAIRING_STROKE_FORMAT_SET = {
  '四人四球比杆赛': true,
  '最佳球位比杆赛': true
};

const PAIRING_STROKE_LABELS = {
  '四人四球比杆赛': '四人四球组合',
  '最佳球位比杆赛': '最佳球位组合'
};

function isPairingStrokeFormat(format) {
  return !!PAIRING_STROKE_FORMAT_SET[String(format || '')];
}

function getPairingStrokeLabel(format) {
  const key = String(format || '');
  return PAIRING_STROKE_LABELS[key] || '组合';
}

/** 需要组内组合分配的赛制（含组合比杆及其它组合类，用于赛制切换清空 groups） */
const COMBO_GAME_MODE_SET = {
  '四人四球比杆赛': true,
  '最佳球位比杆赛': true,
  '四人两球比杆赛': true,
  '四人四球比洞赛': true,
  '最佳球位比洞赛': true,
  '四人两球比洞赛': true
};

function isComboGameMode(mode) {
  return !!COMBO_GAME_MODE_SET[String(mode || '')];
}

function hasFormalGroups(match) {
  return !!(match && Array.isArray(match.groups) && match.groups.length > 0);
}

function clonePairings(pairings) {
  const src = pairings && typeof pairings === 'object' && !Array.isArray(pairings) ? pairings : {};
  const out = {};
  Object.keys(src).forEach((groupId) => {
    const list = Array.isArray(src[groupId]) ? src[groupId] : [];
    out[String(groupId)] = list.map((p, idx) => ({
      id: p && p.id != null ? String(p.id) : ('pairing_' + (idx + 1)),
      playerIds: Array.isArray(p && p.playerIds)
        ? p.playerIds.map((id) => String(id || '').trim()).filter(Boolean)
        : []
    }));
  });
  return out;
}

/** 去掉空组合（无 playerIds） */
function sanitizePairings(pairings) {
  const cloned = clonePairings(pairings);
  const out = {};
  Object.keys(cloned).forEach((groupId) => {
    const list = (cloned[groupId] || []).filter((p) => p && Array.isArray(p.playerIds) && p.playerIds.length > 0);
    if (list.length) out[groupId] = list;
  });
  return out;
}

/**
 * 赛制变更是否会导致分组/组合关系失效而需要清空正式 groups。
 * 规则：
 * 1. 任意 → 个人比杆赛：不清空 groups
 * 2. 个人比杆赛 → 组合赛制：清空
 * 3. 组合赛制 ↔ 组合赛制：清空
 * 4. 无正式分组：由调用方跳过提示
 */
function shouldClearGroupsOnGameModeChange(fromMode, toMode) {
  const from = String(fromMode || '');
  const to = String(toMode || '');
  if (!to || from === to) return false;
  if (to === INDIVIDUAL_STROKE_MODE) return false;
  if (to === '个人比洞赛') return false;
  if (!isComboGameMode(to)) return false;
  return true;
}

/**
 * 赛制变更是否需要清空正式 pairings（可保留 groups）
 * - 组合比杆赛 → 个人比杆赛：保留 groups，清空 pairings
 * - 清空 groups 时一并清空 pairings（由 clearFormalGroupsOnMatch 处理）
 */
function shouldClearPairingsOnGameModeChange(fromMode, toMode) {
  const from = String(fromMode || '');
  const to = String(toMode || '');
  if (!from || !to || from === to) return false;
  if (shouldClearGroupsOnGameModeChange(from, to)) return true;
  if (isPairingStrokeFormat(from) && !isPairingStrokeFormat(to)) return true;
  return false;
}

/** 清空正式分组及与 groups 强绑定的派生字段（不碰报名/赛事基础信息） */
function clearFormalGroupsOnMatch(match) {
  if (!match || typeof match !== 'object') return match;
  match.groups = [];
  match.pairings = {};
  if (Object.prototype.hasOwnProperty.call(match, 'groupCount')) match.groupCount = 0;
  if (Object.prototype.hasOwnProperty.call(match, 'teeGroups')) match.teeGroups = [];
  if (Object.prototype.hasOwnProperty.call(match, 'groupSummary')) match.groupSummary = null;
  if (Object.prototype.hasOwnProperty.call(match, 'pairingMap')) match.pairingMap = {};
  return match;
}

function clearFormalPairingsOnMatch(match) {
  if (!match || typeof match !== 'object') return match;
  match.pairings = {};
  if (Object.prototype.hasOwnProperty.call(match, 'pairingMap')) match.pairingMap = {};
  return match;
}

const GAME_MODE_CHANGE_CLEAR_GROUPS_TIP = '修改赛制后，需要重新分配组合，已有分组将被清空。';


/**
 * 将已存赛事回填为创建页表单字段（缺省用空/默认，由页面再兜底）
 */
function hydrateCreatePageFromMatch(match) {
  if (!match) return null;
  const gameMode = match.gameMode || '个人比杆赛';
  let logoConfig = match.logoConfig && typeof match.logoConfig === 'object'
    ? {
        type: match.logoConfig.type === 'custom' ? 'custom' : 'default',
        url: match.logoConfig.url ? String(match.logoConfig.url) : '',
        source: match.logoConfig.source ? String(match.logoConfig.source) : 'team'
      }
    : null;
  if (!logoConfig) {
    const matchLogo = match.matchLogo ? String(match.matchLogo).trim() : '';
    logoConfig = matchLogo
      ? { type: 'custom', url: matchLogo, source: 'custom' }
      : { type: 'default', url: '', source: 'team' };
  }
  return {
    teamId: match.teamId || '',
    teamName: match.teamName || '',
    teamLogo: match.teamLogo || '',
    roundName: match.roundName || '',
    courseId: match.courseId || '',
    courseName: match.courseName || '',
    courseLocation: match.courseLocation || '',
    courseHalfText: match.courseHalfText || '',
    teeTime: match.teeTime || '',
    teeTimeText: match.teeTimeText || '',
    deadlineTime: match.deadlineTime || '',
    deadlineTimeText: match.deadlineTimeText || '',
    selectedGameMode: gameMode,
    gameMode: gameMode,
    feeList: cloneFeeList(match.feeList),
    eventInfoList: cloneEventInfoList(match.eventInfoList),
    teamGroups: cloneTeamGroups(match.teamGroups),
    feeSet: match.feeSet != null ? !!match.feeSet : true,
    isDiamondMode: !!match.isDiamondMode,
    bannerImage: match.bannerImage || '',
    visibility: match.visibility === 'private' ? 'private' : 'public',
    accessCode: match.accessCode || '',
    groupPermission: match.groupPermission === 'player' ? 'player' : 'admin',
    logoConfig: logoConfig
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
  INDIVIDUAL_STROKE_MODE,
  GAME_MODE_CHANGE_CLEAR_GROUPS_TIP,
  isPairingStrokeFormat,
  getPairingStrokeLabel,
  isComboGameMode,
  hasFormalGroups,
  clonePairings,
  sanitizePairings,
  shouldClearGroupsOnGameModeChange,
  shouldClearPairingsOnGameModeChange,
  clearFormalGroupsOnMatch,
  clearFormalPairingsOnMatch,
  buildMatchFromCreatePage,
  updateMatchFromCreatePage,
  hydrateCreatePageFromMatch,
  saveMatch,
  listMatches,
  getMatchById,
  toTournamentCard,
  formatClubDate,
  normalizeRegisterUser,
  normalizeRegisterInfo,
  createDefaultRegisterInfo
};
