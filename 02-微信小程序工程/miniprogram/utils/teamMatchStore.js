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

function normalizeScoreData(scoreData) {
  if (!scoreData || typeof scoreData !== 'object' || Array.isArray(scoreData)) return {};
  return scoreData;
}

function normalizeStoredMatch(match) {
  if (!match || typeof match !== 'object') return match;
  if (!match.scoreData || typeof match.scoreData !== 'object' || Array.isArray(match.scoreData)) {
    return Object.assign({}, match, { scoreData: {} });
  }
  return match;
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
  const identitySource = raw.identitySource != null ? String(raw.identitySource) : '';
  const realName = raw.realName != null ? String(raw.realName) : '';
  const remarkName = raw.remarkName != null ? String(raw.remarkName) : '';

  return {
    userId: userId,
    nickname: nickname,
    competitionName: competitionName || (raw.matchNickname != null ? String(raw.matchNickname) : ''),
    matchNickname:
      raw.matchNickname != null && String(raw.matchNickname).trim() !== ''
        ? String(raw.matchNickname).trim()
        : competitionName,
    gender: raw.gender != null ? String(raw.gender) : '',
    matchGender:
      raw.matchGender != null && String(raw.matchGender).trim() !== ''
        ? String(raw.matchGender).trim()
        : raw.gender != null
          ? String(raw.gender)
          : '',
    handicap: raw.handicap != null ? raw.handicap : '',
    avatar: raw.avatar != null ? String(raw.avatar) : '',
    phone: raw.phone != null ? String(raw.phone) : '',
    groupId: raw.groupId != null ? raw.groupId : '',
    groupName: raw.groupName != null ? String(raw.groupName) : '',
    matchTeamId:
      raw.matchTeamId != null && String(raw.matchTeamId).trim() !== ''
        ? String(raw.matchTeamId).trim()
        : raw.groupId != null
          ? String(raw.groupId)
          : '',
    matchTeamName:
      raw.matchTeamName != null && String(raw.matchTeamName).trim() !== ''
        ? String(raw.matchTeamName).trim()
        : raw.groupName != null
          ? String(raw.groupName)
          : '',
    registeredAt: raw.registeredAt != null ? raw.registeredAt : '',
    source: source,
    registeredBy: registeredBy,
    registeredByName: registeredByName,
    subjectType: subjectType,
    pickChannel: pickChannel,
    canSelfCancel: canSelfCancel,
    locked: locked,
    userType: userType,
    identitySource: identitySource,
    realName: realName,
    remarkName: remarkName,
    paymentConfirmed: raw.paymentConfirmed,
    paidAmount: raw.paidAmount != null ? raw.paidAmount : (raw.cashPaidAmount != null ? raw.cashPaidAmount : ''),
    cashPaidAmount: raw.cashPaidAmount != null ? raw.cashPaidAmount : (raw.paidAmount != null ? raw.paidAmount : ''),
    paymentRemark: raw.paymentRemark != null ? String(raw.paymentRemark) : ''
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
    scoreData: {},
    feeSet: !!data.feeSet,
    isDiamondMode: !!data.isDiamondMode,
    bannerImage: data.bannerImage || '',
    courseId: data.courseId || '',
    courseName: data.courseName || '',
    courseLocation: data.courseLocation || '',
    courseHalfText: data.courseHalfText || '',
    front9Course: data.front9Course || null,
    back9Course: data.back9Course || null,
    teeTime: data.teeTime || '',
    teeTimeText: data.teeTimeText || '',
    deadlineTime: data.deadlineTime || '',
    deadlineTimeText: data.deadlineTimeText || '',
    visibility: data.visibility === 'private' ? 'private' : 'public',
    accessCode: data.accessCode || '',
    groupPermission: data.groupPermission === 'player' ? 'player' : 'admin',
    registrationStatus: data.registrationStatus === 'closed' || data.registerStatus === 'closed' ? 'closed' : 'open',
    registrationLogs: [],
    status: 'registering',
    statusLabel: '报名中',
    tempAdmins: [],
    caddieScoringAccess: null,
    tempAdminAccess: null,
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
  next.front9Course = data.front9Course != null ? data.front9Course : (existing.front9Course || null);
  next.back9Course = data.back9Course != null ? data.back9Course : (existing.back9Course || null);
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
  next.scoreData = normalizeScoreData(existing.scoreData);
  next.registrationStatus = existing.registrationStatus === 'closed' || existing.registerStatus === 'closed' ? 'closed' : 'open';
  next.registrationLogs = Array.isArray(existing.registrationLogs) ? existing.registrationLogs : [];
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
const FORMAL_SLOT_COUNT = 4;

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

/** 分组位球员 id（兼容对象多字段 / 字符串） */
function resolveGroupSlotPlayerId(player) {
  if (player == null) return '';
  if (typeof player === 'string' || typeof player === 'number') {
    return String(player).trim();
  }
  if (typeof player !== 'object') return '';
  const id = player.userId || player.playerId || player.id;
  return id != null ? String(id).trim() : '';
}

function resolveSlotPosition(raw, fallback) {
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  return fallback;
}

function buildSlotId(groupId, position) {
  const gid = String(groupId || '').trim();
  const pos = Number(position) || 0;
  return (gid || 'group') + '-slot-' + pos;
}

function resolveSlotScorePlayerId(source) {
  if (!source || typeof source !== 'object') return '';
  const id = source.scorePlayerId || source.slotScorePlayerId || source.scoreOwnerId || '';
  return id != null ? String(id).trim() : '';
}

function keepSlotScorePlayerFields(target, source) {
  const out = target || {};
  if (!source || typeof source !== 'object') return out;
  const scorePlayerId = resolveSlotScorePlayerId(source);
  if (scorePlayerId) out.scorePlayerId = scorePlayerId;
  if (source.slotScorePlayerId != null && String(source.slotScorePlayerId).trim()) {
    out.slotScorePlayerId = String(source.slotScorePlayerId).trim();
  }
  if (source.scoreOwnerId != null && String(source.scoreOwnerId).trim()) {
    out.scoreOwnerId = String(source.scoreOwnerId).trim();
  }
  return out;
}

function createResolvedSlot(position, groupId, source) {
  const raw = source && typeof source === 'object' ? source : {};
  const userId = resolveGroupSlotPlayerId(source);
  return keepSlotScorePlayerFields({
    slotId: raw.slotId != null && String(raw.slotId).trim()
      ? String(raw.slotId).trim()
      : buildSlotId(groupId, position),
    position: position,
    userId: userId,
    playerId: userId
  }, source);
}

/**
 * 将现有正式 players[] 转成 Slot 视图。
 * Patch 1 只做转换：正式保存来源仍是 groups[].players[]。
 */
function playersToSlots(players, groupId) {
  const slots = Array.from({ length: FORMAL_SLOT_COUNT }, (_, index) =>
    createResolvedSlot(index + 1, groupId, null)
  );
  (Array.isArray(players) ? players : []).forEach((player, index) => {
    const rawPosition = player && typeof player === 'object'
      ? (player.position != null ? player.position : player.slotIndex)
      : null;
    const position = resolveSlotPosition(rawPosition, index + 1);
    if (position < 1) return;
    const slot = createResolvedSlot(position, groupId, player);
    const slotIndex = position - 1;
    if (slotIndex < slots.length) {
      slots[slotIndex] = slot;
    } else {
      slots.push(slot);
    }
  });
  return slots;
}

/**
 * 从 group 解析 Slot 视图。当前阶段不把 slots 持久化为新真源。
 */
function resolveGroupSlots(group) {
  const groupId = group && group.groupId != null ? String(group.groupId) : '';
  const players = Array.isArray(group && group.players) ? group.players : [];
  return playersToSlots(players, groupId);
}

/**
 * Slot 视图回落到旧正式 players[] 结构。
 */
function slotsToPlayers(slots) {
  return (Array.isArray(slots) ? slots : []).map((slot, index) => {
    const position = resolveSlotPosition(
      slot && slot.position != null ? slot.position : slot && slot.slotIndex,
      index + 1
    );
    return keepSlotScorePlayerFields({
      position: position,
      userId: resolveGroupSlotPlayerId(slot)
    }, slot);
  });
}

function resolveSlotPlayer(slot) {
  const userId = resolveGroupSlotPlayerId(slot);
  if (!userId) return null;
  return {
    userId: userId,
    playerId: userId
  };
}

function getAvailableSlots(group) {
  return resolveGroupSlots(group).filter((slot) => !resolveGroupSlotPlayerId(slot));
}

function summarizeSlotsForVerify(slots) {
  return (Array.isArray(slots) ? slots : []).map((slot) => ({
    position: slot.position,
    userId: slot.userId,
    slotId: slot.slotId,
    scorePlayerId: slot.scorePlayerId || ''
  }));
}

/**
 * Patch 1.5 临时验证入口：仅手动调用时输出日志，不接入业务流程。
 */
function verifySlotHelperScenarios() {
  const scenarios = [
    {
      name: 'normal_4_players',
      group: {
        groupId: 'verify-group-1',
        players: [
          { position: 1, userId: 'A' },
          { position: 2, userId: 'B' },
          { position: 3, userId: 'C' },
          { position: 4, userId: 'D' }
        ]
      },
      expectedUsers: ['A', 'B', 'C', 'D']
    },
    {
      name: 'normal_3_players',
      group: {
        groupId: 'verify-group-2',
        players: [
          { position: 1, userId: 'A' },
          { position: 2, userId: 'B' },
          { position: 3, userId: 'C' }
        ]
      },
      expectedUsers: ['A', 'B', 'C', '']
    },
    {
      name: 'empty_after_remove',
      group: {
        groupId: 'verify-group-3',
        players: [
          { position: 1, userId: 'A' },
          { position: 2, userId: 'B' },
          { position: 3, userId: 'C' },
          { position: 4, userId: '' }
        ]
      },
      expectedUsers: ['A', 'B', 'C', '']
    },
    {
      name: 'non_continuous_position',
      group: {
        groupId: 'verify-group-4',
        players: [
          { position: 1, userId: 'A' },
          { position: 3, userId: 'C' }
        ]
      },
      expectedUsers: ['A', '', 'C', '']
    },
    {
      name: 'available_slots',
      group: {
        groupId: 'verify-group-5',
        players: [
          { position: 1, userId: 'A' },
          { position: 2, userId: 'B' },
          { position: 3, userId: '' },
          { position: 4, userId: '' }
        ]
      },
      expectedUsers: ['A', 'B', '', ''],
      expectedAvailable: [3, 4]
    }
  ];

  return scenarios.map((scenario) => {
    const slots = resolveGroupSlots(scenario.group);
    const users = slots.map((slot) => slot.userId);
    const available = getAvailableSlots(scenario.group).map((slot) => slot.position);
    const usersOk = JSON.stringify(users) === JSON.stringify(scenario.expectedUsers);
    const availableOk = scenario.expectedAvailable
      ? JSON.stringify(available) === JSON.stringify(scenario.expectedAvailable)
      : true;
    const result = {
      name: scenario.name,
      ok: usersOk && availableOk,
      slots: summarizeSlotsForVerify(slots),
      availableSlots: available
    };
    console.log('[slot-helper-verify]', result);
    return result;
  });
}

/** 正式 groups 中是否已包含该 userId */
function isUserInFormalGroups(match, userId) {
  const uid = String(userId || '').trim();
  if (!uid || !match || !Array.isArray(match.groups)) return false;
  for (let i = 0; i < match.groups.length; i++) {
    const g = match.groups[i];
    if (!g) continue;
    const lists = [];
    if (Array.isArray(g.players)) lists.push(g.players);
    if (Array.isArray(g.playersSlots)) lists.push(g.playersSlots);
    for (let li = 0; li < lists.length; li++) {
      const players = lists[li];
      for (let j = 0; j < players.length; j++) {
        if (resolveGroupSlotPlayerId(players[j]) === uid) return true;
      }
    }
  }
  return false;
}

/**
 * 从正式 groups 清空该球员所在位（保留 position，不压缩、不删组）
 */
function clearUserFromFormalGroups(match, userId) {
  const uid = String(userId || '').trim();
  if (!uid || !match || !Array.isArray(match.groups)) return match;
  match.groups = match.groups.map((g) => {
    if (!g || !Array.isArray(g.players)) return g;
    const players = g.players.map((p) => {
      if (resolveGroupSlotPlayerId(p) !== uid) return p;
      if (typeof p === 'string' || typeof p === 'number') return '';
      const next = Object.assign({}, p);
      next.userId = '';
      if (Object.prototype.hasOwnProperty.call(next, 'playerId')) next.playerId = '';
      if (Object.prototype.hasOwnProperty.call(next, 'id') && String(next.id) === uid) {
        next.id = '';
      }
      return next;
    });
    return Object.assign({}, g, { players: players });
  });
  return match;
}

/**
 * 从 pairings 移除该 userId；清空的组合删除；组下无组合则去掉该 group key
 */
function clearUserFromPairings(match, userId) {
  const uid = String(userId || '').trim();
  if (!uid || !match) return match;
  const cloned = clonePairings(match.pairings);
  const out = {};
  Object.keys(cloned).forEach((groupId) => {
    const list = (cloned[groupId] || [])
      .map((p) => ({
        id: p.id,
        playerIds: (p.playerIds || []).filter((id) => String(id) !== uid)
      }))
      .filter((p) => p.playerIds.length > 0);
    if (list.length) out[groupId] = list;
  });
  match.pairings = out;
  if (Object.prototype.hasOwnProperty.call(match, 'pairingMap')) {
    match.pairingMap = out;
  }
  return match;
}

/**
 * 从报名名单移除 targetUserId，并同步清空正式 groups 位 / pairings（不写盘）。
 * @returns {{ ok: boolean, reason?: string, wasGrouped?: boolean }}
 */
function removeRegisteredUserAndCleanupGroups(match, targetUserId) {
  const uid = String(targetUserId || '').trim();
  if (!match || typeof match !== 'object') return { ok: false, reason: 'no_match' };
  if (!uid) return { ok: false, reason: 'no_user' };

  const wasGrouped = isUserInFormalGroups(match, uid);

  if (!match.registerInfo || typeof match.registerInfo !== 'object') {
    match.registerInfo = createDefaultRegisterInfo();
  }
  if (!Array.isArray(match.registerInfo.users)) {
    match.registerInfo.users = [];
  }
  match.registerInfo.users = match.registerInfo.users.filter((item) => {
    if (!item) return false;
    const id = String(item.userId || item.playerId || item.id || '').trim();
    return id !== uid;
  });
  match.registerInfo.totalCount = match.registerInfo.users.length;

  clearUserFromFormalGroups(match, uid);
  clearUserFromPairings(match, uid);

  return { ok: true, wasGrouped: wasGrouped };
}

/**
 * 取消报名并同步清理正式 groups / pairings（写盘）。
 * targetUserId = 真正被取消报名的球员（自己或代报名好友）。
 * @returns {{ ok: boolean, reason?: string, match?: object, wasGrouped?: boolean }}
 */
function cancelRegistration(matchId, targetUserId) {
  const uid = String(targetUserId || '').trim();
  if (!matchId) return { ok: false, reason: 'no_match_id' };
  if (!uid) return { ok: false, reason: 'no_user' };
  const match = getMatchById(matchId);
  if (!match) return { ok: false, reason: 'not_found' };

  const result = removeRegisteredUserAndCleanupGroups(match, uid);
  if (!result.ok) return result;
  saveMatch(match);

  return { ok: true, match: match, wasGrouped: !!result.wasGrouped };
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
    front9Course: match.front9Course || null,
    back9Course: match.back9Course || null,
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
  match.scoreData = normalizeScoreData(match.scoreData);
  const list = _readAll();
  const next = [match].concat(list.filter((item) => item && item.matchId !== match.matchId));
  _writeAll(next);
  return match;
}

function listMatches() {
  return _readAll()
    .filter((item) => item && item.matchId)
    .map(normalizeStoredMatch)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function getMatchById(matchId) {
  if (!matchId) return null;
  return normalizeStoredMatch(_readAll().find((item) => item && item.matchId === matchId) || null);
}

/** 硬删除球队赛（与 gameStore.removeGame 对齐） */
function removeMatch(matchId) {
  if (!matchId) return false;
  const list = _readAll();
  const existed = list.some((item) => item && item.matchId === matchId);
  if (!existed) return false;
  _writeAll(list.filter((item) => item && item.matchId !== matchId));
  return true;
}

/** 转为首页球队赛卡片（ds-card-club）数据结构 */
function resolveTournamentCardStatusLabel(match) {
  const status = String((match && match.status) || '').trim().toLowerCase();
  if (status === 'ongoing') return 'LIVE';
  if (status === 'registering') return '报名中';
  return (match && match.statusLabel) || '报名中';
}

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
    statusLabel: resolveTournamentCardStatusLabel(match),
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
  resolveGroupSlots,
  playersToSlots,
  slotsToPlayers,
  resolveSlotPlayer,
  getAvailableSlots,
  verifySlotHelperScenarios,
  isUserInFormalGroups,
  clearUserFromFormalGroups,
  clearUserFromPairings,
  removeRegisteredUserAndCleanupGroups,
  cancelRegistration,
  buildMatchFromCreatePage,
  updateMatchFromCreatePage,
  hydrateCreatePageFromMatch,
  saveMatch,
  listMatches,
  getMatchById,
  removeMatch,
  toTournamentCard,
  formatClubDate,
  normalizeRegisterUser,
  normalizeRegisterInfo,
  createDefaultRegisterInfo
};
