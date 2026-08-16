/**
 * 球队赛（队内赛）创建结果 — 本地持久化，供首页「我的球队赛」卡片列表读取
 */

const STORAGE_KEY = 'gb_team_matches_v1';
const clubDateFormat = require('./clubDateFormat.js');

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
  return clubDateFormat.formatClubDate(timeString);
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
  return list.map((item, index) => {
    const name = item && item.name ? String(item.name).trim() : '';
    const sourceTeamShortName =
      item && item.sourceTeamShortName != null && String(item.sourceTeamShortName).trim() !== ''
        ? String(item.sourceTeamShortName).trim()
        : '';
    return {
      id: item && item.id != null ? item.id : index + 1,
      renderKey: item && item.renderKey
        ? String(item.renderKey)
        : ('team-group-' + (item && item.id != null ? item.id : index + 1)),
      name: name,
      // 队际赛：分队可绑定正式注册球队；队内赛缺省为空串（向后兼容，不静默裁剪）
      sourceTeamId:
        item && item.sourceTeamId != null && String(item.sourceTeamId).trim() !== ''
          ? String(item.sourceTeamId).trim()
          : '',
      sourceTeamName:
        item && item.sourceTeamName != null && String(item.sourceTeamName).trim() !== ''
          ? String(item.sourceTeamName).trim()
          : '',
      sourceTeamShortName: sourceTeamShortName,
      sourceTeamLogo:
        item && item.sourceTeamLogo != null && String(item.sourceTeamLogo).trim() !== ''
          ? String(item.sourceTeamLogo).trim()
          : ''
    };
  });
}

/**
 * 解析发起主体快照：队际赛以 organization* 为准，并同步到 team*（旧读取兼容）。
 * 参赛球队不得写入根级 teamId。
 */
function resolveOrganizerSnapshot(pageData, matchType) {
  const data = pageData || {};
  const type = String(matchType || '').trim() || 'team-internal';
  if (type === 'inter-team') {
    const organizationId = String(
      data.organizationId != null && String(data.organizationId).trim() !== ''
        ? data.organizationId
        : data.teamId || ''
    ).trim();
    const organizationName = String(
      data.organizationName != null && String(data.organizationName).trim() !== ''
        ? data.organizationName
        : data.teamName || ''
    ).trim();
    const organizationLogo = String(
      data.organizationLogo != null && String(data.organizationLogo).trim() !== ''
        ? data.organizationLogo
        : data.teamLogo || ''
    ).trim();
    return {
      organizationId: organizationId,
      organizationName: organizationName,
      organizationLogo: organizationLogo,
      teamId: organizationId,
      teamName: organizationName,
      teamLogo: organizationLogo
    };
  }
  return {
    organizationId: data.organizationId != null ? String(data.organizationId) : '',
    organizationName: data.organizationName != null ? String(data.organizationName) : '',
    organizationLogo: data.organizationLogo != null ? String(data.organizationLogo) : '',
    teamId: data.teamId || '',
    teamName: data.teamName || '',
    teamLogo: data.teamLogo || ''
  };
}

function normalizeTeamCompetition(input, groupCount) {
  const source = input && typeof input === 'object' ? input : {};
  let topN = Number(source.topN);
  if (!isFinite(topN) || topN < 1) topN = 3;
  return {
    enabled: Number(groupCount) >= 2 && source.enabled === true,
    topN: Math.floor(topN)
  };
}

function buildScoringRules(pageData, existingRules) {
  const data = pageData || {};
  const base = existingRules && typeof existingRules === 'object' ? Object.assign({}, existingRules) : {};
  const teamGroups = cloneTeamGroups(data.teamGroups);
  const input =
    data.teamCompetition ||
    (data.scoringRules && data.scoringRules.teamCompetition) ||
    (base && base.teamCompetition) ||
    {};
  base.teamCompetition = normalizeTeamCompetition(input, teamGroups.length);
  return base;
}

function normalizeScoreData(scoreData) {
  if (!scoreData || typeof scoreData !== 'object' || Array.isArray(scoreData)) return {};
  return scoreData;
}

/**
 * 组级成绩桶：写回时必须同时保留字段，避免互相覆盖丢失。
 * - scoresByPlayer：G1/G5 个人
 * - teamScoresByEntity：Entity 组合（比杆）
 * - scoresBySide：G6/G7/G8 比洞 Side（组合，非个人）
 * - matchPlayMeta：G5–G8 比洞起始洞（Phase1-D，可选）
 * - firstScoreAt：该组第一笔有效洞成绩时间戳（可选）
 * - finishedScoreAt：该组成绩主体记满 18 洞时间戳（可选；非比洞 clinch）
 */
function normalizeMatchPlayMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const sh = Number(meta.startHole);
  if (!Number.isFinite(sh) || sh < 1 || sh > 18) return null;
  // manual 优先于 auto：手动设定后禁止被自动推断覆盖
  const source = meta.source === 'manual' ? 'manual' : 'auto';
  return {
    startHole: Math.floor(sh),
    source: source
  };
}

function normalizeFirstScoreAt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isFilledHoleScore(s) {
  return s !== null && s !== undefined && s !== '';
}

function scoresArrayHasFilled(scores) {
  return Array.isArray(scores) && scores.some(isFilledHoleScore);
}

/** 组成绩桶是否已有任意有效洞成绩（三桶任一） */
function groupScoreBucketHasAnyFilledScore(bucket) {
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return false;
  const scoresByPlayer = bucket.scoresByPlayer;
  if (scoresByPlayer && typeof scoresByPlayer === 'object' && !Array.isArray(scoresByPlayer)) {
    const keys = Object.keys(scoresByPlayer);
    for (let i = 0; i < keys.length; i++) {
      const rec = scoresByPlayer[keys[i]];
      if (scoresArrayHasFilled(rec && rec.scores)) return true;
    }
  }
  const entities = bucket.teamScoresByEntity;
  if (Array.isArray(entities)) {
    for (let i = 0; i < entities.length; i++) {
      if (scoresArrayHasFilled(entities[i] && entities[i].scores)) return true;
    }
  }
  const scoresBySide = bucket.scoresBySide;
  if (scoresBySide && typeof scoresBySide === 'object' && !Array.isArray(scoresBySide)) {
    const sideKeys = Object.keys(scoresBySide);
    for (let i = 0; i < sideKeys.length; i++) {
      const rec = scoresBySide[sideKeys[i]];
      if (scoresArrayHasFilled(rec && rec.scores)) return true;
    }
  }
  return false;
}

/**
 * 首次有效洞成绩时写入 firstScoreAt；已有则不覆盖。
 * 就地改 bucket 并返回同一对象。
 */
function ensureGroupScoreBucketFirstScoreAt(bucket) {
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return bucket;
  if (normalizeFirstScoreAt(bucket.firstScoreAt) != null) return bucket;
  if (!groupScoreBucketHasAnyFilledScore(bucket)) return bucket;
  bucket.firstScoreAt = Date.now();
  return bucket;
}

/** scores[0..17] 是否全部为有效洞成绩（不看 clinch / thru） */
function scoresArrayHasCompleted18Holes(scores) {
  if (!Array.isArray(scores)) return false;
  for (let h = 0; h < 18; h++) {
    if (!isFilledHoleScore(scores[h])) return false;
  }
  return true;
}

/**
 * 组成绩主体是否已全部记满 18 洞。
 * 优先判定有主体的桶：scoresBySide → teamScoresByEntity → scoresByPlayer。
 * 不使用 matchPlay clinch / thru / status。
 */
function groupScoreBucketHasCompleted18Holes(bucket) {
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return false;

  const scoresBySide =
    bucket.scoresBySide && typeof bucket.scoresBySide === 'object' && !Array.isArray(bucket.scoresBySide)
      ? bucket.scoresBySide
      : null;
  if (scoresBySide) {
    const sideKeys = Object.keys(scoresBySide);
    if (sideKeys.length) {
      for (let i = 0; i < sideKeys.length; i++) {
        const rec = scoresBySide[sideKeys[i]];
        if (!scoresArrayHasCompleted18Holes(rec && rec.scores)) return false;
      }
      return true;
    }
  }

  const entities = Array.isArray(bucket.teamScoresByEntity) ? bucket.teamScoresByEntity : [];
  const entityList = entities.filter((e) => e && typeof e === 'object');
  if (entityList.length) {
    for (let i = 0; i < entityList.length; i++) {
      if (!scoresArrayHasCompleted18Holes(entityList[i].scores)) return false;
    }
    return true;
  }

  const scoresByPlayer =
    bucket.scoresByPlayer &&
    typeof bucket.scoresByPlayer === 'object' &&
    !Array.isArray(bucket.scoresByPlayer)
      ? bucket.scoresByPlayer
      : null;
  if (!scoresByPlayer) return false;
  const playerKeys = Object.keys(scoresByPlayer);
  if (!playerKeys.length) return false;
  for (let i = 0; i < playerKeys.length; i++) {
    const rec = scoresByPlayer[playerKeys[i]];
    if (!scoresArrayHasCompleted18Holes(rec && rec.scores)) return false;
  }
  return true;
}

/**
 * 成绩主体记满 18 洞时写入 finishedScoreAt；已有则不覆盖。
 * 就地改 bucket 并返回同一对象。
 */
function ensureGroupScoreBucketFinishedScoreAt(bucket) {
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return bucket;
  if (normalizeFirstScoreAt(bucket.finishedScoreAt) != null) return bucket;
  if (!groupScoreBucketHasCompleted18Holes(bucket)) return bucket;
  bucket.finishedScoreAt = Date.now();
  return bucket;
}

/**
 * 主动结束比赛时冻结 finishedScoreAt（可不打满 18 洞）。
 * - 已有 finishedScoreAt：不覆盖
 * - 无 firstScoreAt：不写（尚未开打不计时）
 * - 否则：finishedScoreAt = Date.now()
 */
function forceGroupScoreBucketFinishedScoreAt(bucket) {
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return bucket;
  if (normalizeFirstScoreAt(bucket.finishedScoreAt) != null) return bucket;
  if (normalizeFirstScoreAt(bucket.firstScoreAt) == null) return bucket;
  bucket.finishedScoreAt = Date.now();
  return bucket;
}

function normalizeGroupScoreBucket(groupScore) {
  const g = groupScore && typeof groupScore === 'object' && !Array.isArray(groupScore) ? groupScore : {};
  const scoresByPlayer =
    g.scoresByPlayer && typeof g.scoresByPlayer === 'object' && !Array.isArray(g.scoresByPlayer)
      ? g.scoresByPlayer
      : {};
  const teamScoresByEntity = Array.isArray(g.teamScoresByEntity) ? g.teamScoresByEntity : [];
  const scoresBySide =
    g.scoresBySide && typeof g.scoresBySide === 'object' && !Array.isArray(g.scoresBySide)
      ? g.scoresBySide
      : {};
  const matchPlayMeta = normalizeMatchPlayMeta(g.matchPlayMeta);
  const firstScoreAt = normalizeFirstScoreAt(g.firstScoreAt);
  const finishedScoreAt = normalizeFirstScoreAt(g.finishedScoreAt);
  const out = {
    scoresByPlayer: scoresByPlayer,
    teamScoresByEntity: teamScoresByEntity,
    scoresBySide: scoresBySide
  };
  if (matchPlayMeta) out.matchPlayMeta = matchPlayMeta;
  if (firstScoreAt != null) out.firstScoreAt = firstScoreAt;
  if (finishedScoreAt != null) out.finishedScoreAt = finishedScoreAt;
  return out;
}

/** 规范化单条 Side 成绩（不读成员个人分） */
function normalizeSideScoreRecord(sideId, sideKey, record) {
  const id = sideId != null ? String(sideId).trim() : '';
  const rec = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
  const key =
    sideKey === 'B' || sideKey === 'A'
      ? sideKey
      : rec.sideKey === 'B' || rec.sideKey === 'A'
        ? rec.sideKey
        : '';
  return {
    sideId: id || (rec.sideId != null ? String(rec.sideId).trim() : ''),
    sideKey: key,
    scores: Array.isArray(rec.scores) ? rec.scores.slice() : [],
    putts: Array.isArray(rec.putts) ? rec.putts.slice() : [],
    fairways: Array.isArray(rec.fairways) ? rec.fairways.slice() : [],
    penalties: Array.isArray(rec.penalties) ? rec.penalties.slice() : [],
    sands: Array.isArray(rec.sands) ? rec.sands.slice() : []
  };
}

function normalizeStoredMatch(match) {
  if (!match || typeof match !== 'object') return match;
  const next = Object.assign({}, match);
  if (!next.scoreData || typeof next.scoreData !== 'object' || Array.isArray(next.scoreData)) {
    next.scoreData = {};
  }
  // Series 分组收费：保留 paymentByUserId；非法形状归一为空对象，不建第二 storage
  if (Object.prototype.hasOwnProperty.call(next, 'paymentByUserId')) {
    if (
      !next.paymentByUserId ||
      typeof next.paymentByUserId !== 'object' ||
      Array.isArray(next.paymentByUserId)
    ) {
      next.paymentByUserId = {};
    }
  }
  // 队际赛最小字段：读路径补齐缺省，不静默裁剪 teamGroups / 不改存量 matchType
  if (next.organizationId == null) next.organizationId = '';
  else next.organizationId = String(next.organizationId);
  if (next.organizationName == null) next.organizationName = '';
  else next.organizationName = String(next.organizationName);
  if (next.organizationLogo == null) next.organizationLogo = '';
  else next.organizationLogo = String(next.organizationLogo);
  if (Array.isArray(next.teamGroups)) {
    next.teamGroups = cloneTeamGroups(next.teamGroups);
  }
  return next;
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
    // 竞技展示字段：有则保留快照（0 为有效值）；无则空串，展示层格式化为 --
    floatCoef: raw.floatCoef != null && raw.floatCoef !== '' ? raw.floatCoef : '',
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
  const matchType = data.matchType || 'team-internal';
  const organizer = resolveOrganizerSnapshot(data, matchType);
  return {
    matchId,
    teamId: organizer.teamId,
    teamName: organizer.teamName,
    teamLogo: organizer.teamLogo,
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
    matchType: matchType,
    organizationId: organizer.organizationId,
    organizationName: organizer.organizationName,
    organizationLogo: organizer.organizationLogo,
    feeList: cloneFeeList(data.feeList),
    eventInfoList: cloneEventInfoList(data.eventInfoList),
    teamGroups: cloneTeamGroups(data.teamGroups),
    scoringRules: buildScoringRules(data),
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
 * @param {{ clearGroups?: boolean, clearPairings?: boolean, replaceGroups?: array }} [options]
 *   clearGroups=true 时清空正式 groups 及派生字段；
 *   replaceGroups 为数组时写入正式 groups（非法组已变为空壳）；空组剪掉 pairings
 */
function updateMatchFromCreatePage(existing, pageData, options) {
  if (!existing || !existing.matchId) return null;
  const data = pageData || {};
  const opts = options || {};
  const next = Object.assign({}, existing);
  next.matchType = existing.matchType || data.matchType || 'team-internal';
  const organizerInput = {
    teamId: data.teamId != null ? data.teamId : existing.teamId,
    teamName: data.teamName != null ? data.teamName : existing.teamName,
    teamLogo: data.teamLogo != null ? data.teamLogo : existing.teamLogo,
    organizationId: data.organizationId != null ? data.organizationId : existing.organizationId,
    organizationName: data.organizationName != null ? data.organizationName : existing.organizationName,
    organizationLogo: data.organizationLogo != null ? data.organizationLogo : existing.organizationLogo
  };
  const organizer = resolveOrganizerSnapshot(organizerInput, next.matchType);
  next.teamId = organizer.teamId;
  next.teamName = organizer.teamName;
  next.teamLogo = organizer.teamLogo;
  next.organizationId = organizer.organizationId;
  next.organizationName = organizer.organizationName;
  next.organizationLogo = organizer.organizationLogo;
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
  next.feeList = cloneFeeList(data.feeList);
  next.eventInfoList = cloneEventInfoList(data.eventInfoList);
  next.teamGroups = cloneTeamGroups(data.teamGroups);
  next.scoringRules = buildScoringRules(data, existing.scoringRules);
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

  const fromMode = existing.gameMode || '';
  const toMode = next.gameMode || '';
  // G2/G3/G4 → G1：组合成绩展开为个人成绩，并清理 scoreEntities / pairings
  if (shouldMigrateComboScoresToIndividualStroke(fromMode, toMode)) {
    next.scoreData = migrateComboScoresToIndividualStroke(existing, toMode);
    next.scoreEntities = {};
    clearFormalPairingsOnMatch(next);
  } else if (shouldClearComboArtifactsForPersonalMatchPlay(fromMode, toMode)) {
    // G2/G3/G4 → G5：保留 groups / scoreData；仅清 scoreEntities / pairings（不进 Entity）
    next.scoreEntities = {};
    clearFormalPairingsOnMatch(next);
    if (Array.isArray(opts.replaceGroups)) {
      replaceFormalGroupsOnMatch(next, opts.replaceGroups);
    }
  } else if (Array.isArray(opts.replaceGroups)) {
    replaceFormalGroupsOnMatch(next, opts.replaceGroups);
    if (opts.clearPairings) {
      clearFormalPairingsOnMatch(next);
    }
  } else if (opts.clearGroups) {
    clearFormalGroupsOnMatch(next);
  } else if (opts.clearPairings) {
    clearFormalPairingsOnMatch(next);
  }
  return next;
}

/** 个人比杆赛：任意赛制改为此项时保留已有分组 */
const INDIVIDUAL_STROKE_MODE = '个人比杆赛';
/** G5 个人比洞赛：个人记分路径（与 G1 同级；不进 scoreEntities / pairings） */
const INDIVIDUAL_MATCH_PLAY_MODE = '个人比洞赛';
const FORMAL_SLOT_COUNT = 4;

/**
 * 组合比杆赛（系统内部统一类型）
 * 四人四球比杆赛 / 最佳球位比杆赛 逻辑完全相同，仅展示文案不同
 */
const PAIRING_STROKE_FORMAT_SET = {
  '四人四球比杆赛': true,
  '最佳球位比杆赛': true,
  // G6/G7：报名分组走 G2/G3 composition UI
  '最好成绩比洞赛': true,
  '四人四球比洞赛': true,
  '最佳球位比洞赛': true
};

const PAIRING_STROKE_LABELS = {
  '四人四球比杆赛': '四人四球组合',
  '最佳球位比杆赛': '最佳球位组合',
  '最好成绩比洞赛': '最好成绩组合',
  '四人四球比洞赛': '四人四球组合',
  '最佳球位比洞赛': '最佳球位组合'
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

/**
 * 规范化 pairings：保留成绩行槽位（含空 playerIds）
 * 仅丢弃无 id 的脏数据；禁止因无人占用而删除 slot
 */
function sanitizePairings(pairings) {
  const cloned = clonePairings(pairings);
  const out = {};
  Object.keys(cloned).forEach((groupId) => {
    const list = (cloned[groupId] || []).filter((p) => p && p.id != null && String(p.id).trim() !== '');
    if (list.length) out[groupId] = list;
  });
  return out;
}

/**
 * @deprecated 组合赛制不再「一变就全清」。请用 analyzeGameModeChangeGroups。
 * 保留签名避免旧调用误清；恒返回 false。
 */
function shouldClearGroupsOnGameModeChange(/* fromMode, toMode */) {
  return false;
}

/**
 * 非法正式组 → 空组壳：保留 groupId/groupName/teeTime/startHole 等配置，只清空 players。
 */
function toEmptyFormalGroupShell(group) {
  if (!group || typeof group !== 'object') {
    return { players: [] };
  }
  const next = Object.assign({}, group);
  next.players = [];
  return next;
}

function formalGroupHasFilledPlayers(group) {
  const players = Array.isArray(group && group.players) ? group.players : [];
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p == null) continue;
    const id =
      typeof p === 'string' || typeof p === 'number'
        ? String(p).trim()
        : String((p.userId || p.playerId || p.id) != null ? p.userId || p.playerId || p.id : '').trim();
    if (id) return true;
  }
  return false;
}

/**
 * 按目标赛制对已有正式分组做逐组合法性检查。
 * 合法组原样保留；非法组改为空组（不清 group 壳）。
 * @returns {{
 *   nextGroups: array,
 *   keepGroups: array,
 *   emptiedGroups: array,
 *   removeGroups: array,
 *   illegalCount: number,
 *   legalCount: number,
 *   total: number,
 *   allLegal: boolean,
 *   allIllegal: boolean
 * }}
 */
function analyzeGameModeChangeGroups(match, toMode) {
  const strokeEntityValidator = require('./strokeEntityValidator.js');
  const groups = match && Array.isArray(match.groups) ? match.groups : [];
  const nextGroups = [];
  const emptiedGroups = [];
  let legalCount = 0;
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const checked = strokeEntityValidator.validateGroupForTargetGameMode(toMode, group, match);
    if (checked && checked.valid) {
      nextGroups.push(group);
      legalCount += 1;
    } else {
      const emptyShell = toEmptyFormalGroupShell(group);
      nextGroups.push(emptyShell);
      emptiedGroups.push(emptyShell);
    }
  }
  const illegalCount = emptiedGroups.length;
  return {
    nextGroups: nextGroups,
    // 兼容旧调用：replaceGroups 使用完整结果列表（含空组）
    keepGroups: nextGroups,
    emptiedGroups: emptiedGroups,
    removeGroups: emptiedGroups,
    illegalCount: illegalCount,
    legalCount: legalCount,
    total: groups.length,
    allLegal: illegalCount === 0,
    allIllegal: groups.length > 0 && legalCount === 0
  };
}

/** 赛制变更分组提示：部分非法 */
function buildGameModeChangeGroupsPartialTip(illegalCount) {
  const n = Number(illegalCount) || 0;
  return (
    '当前分组中有' + n + '组不符合新赛制要求。\n\n' +
    '继续修改后，这' + n + '组的球员将被清空并保留为空组，其他合法分组将保留。'
  );
}

/** 赛制变更分组提示：全部非法 */
function buildGameModeChangeGroupsAllIllegalTip() {
  return (
    '当前所有分组均不符合新赛制要求。\n\n' +
    '继续修改后，各组球员将被清空，分组空壳将保留。'
  );
}

/**
 * 写入正式 groups（含非法组清空后的空壳），并清理空组 / 已不存在组的 pairings。
 * 不碰 scoreData / scoreEntities / registerInfo / teamGroups。
 */
function replaceFormalGroupsOnMatch(match, nextGroups) {
  if (!match || typeof match !== 'object') return match;
  const groups = Array.isArray(nextGroups) ? nextGroups.slice() : [];
  match.groups = groups;
  const keepIds = {};
  const emptyIds = {};
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (!g || g.groupId == null) continue;
    const gid = String(g.groupId);
    keepIds[gid] = true;
    if (!formalGroupHasFilledPlayers(g)) emptyIds[gid] = true;
  }
  const pairings = clonePairings(match.pairings);
  const nextPairings = {};
  Object.keys(pairings).forEach((gid) => {
    const key = String(gid);
    if (keepIds[key] && !emptyIds[key]) nextPairings[key] = pairings[gid];
  });
  match.pairings = nextPairings;
  if (Object.prototype.hasOwnProperty.call(match, 'groupCount')) {
    match.groupCount = groups.length;
  }
  if (Object.prototype.hasOwnProperty.call(match, 'pairingMap')) {
    const nextMap = {};
    const srcMap =
      match.pairingMap && typeof match.pairingMap === 'object' && !Array.isArray(match.pairingMap)
        ? match.pairingMap
        : {};
    Object.keys(srcMap).forEach((gid) => {
      const key = String(gid);
      if (keepIds[key] && !emptyIds[key]) nextMap[key] = srcMap[gid];
    });
    match.pairingMap = nextMap;
  }
  return match;
}

/**
 * 赛制变更是否需要清空正式 pairings（可保留 groups）
 * - 组合比杆赛 → 个人比杆赛：保留 groups，清空 pairings
 * - G2/G3/G4（含最好成绩 / 四人两球）→ 个人比杆赛 / 个人比洞赛：保留 groups，清空 pairings
 * - 清空 groups 时一并清空 pairings（由 clearFormalGroupsOnMatch 处理）
 */
function shouldClearPairingsOnGameModeChange(fromMode, toMode) {
  const from = String(fromMode || '');
  const to = String(toMode || '');
  if (!from || !to || from === to) return false;
  if (shouldClearGroupsOnGameModeChange(from, to)) return true;
  if (isStrokeEntityGameMode(from) && isIndividualPersonalScoreMode(to)) return true;
  if (isPairingStrokeFormat(from) && !isPairingStrokeFormat(to)) return true;
  return false;
}

/** Stroke Entity 赛制：G2（最好成绩/四人四球）/ G3（最佳球位）/ G4（四人两球） */
function isStrokeEntityGameMode(mode) {
  const m = String(mode || '');
  return (
    m === '最好成绩比杆赛' ||
    m === '四人四球比杆赛' ||
    m === '最佳球位比杆赛' ||
    m === '四人两球比杆赛'
  );
}

/** G1 个人比杆 / G5 个人比洞：个人成绩路径（非 stroke_entity） */
function isIndividualPersonalScoreMode(mode) {
  const m = String(mode || '').trim();
  return m === INDIVIDUAL_STROKE_MODE || m === INDIVIDUAL_MATCH_PLAY_MODE;
}

function shouldMigrateComboScoresToIndividualStroke(fromMode, toMode) {
  return isStrokeEntityGameMode(fromMode) && String(toMode || '') === INDIVIDUAL_STROKE_MODE;
}

/**
 * G2/G3/G4 → G5：清 scoreEntities / pairings；保留 groups / scoreData（不改 G1 迁移逻辑）
 */
function shouldClearComboArtifactsForPersonalMatchPlay(fromMode, toMode) {
  return isStrokeEntityGameMode(fromMode) && String(toMode || '').trim() === INDIVIDUAL_MATCH_PLAY_MODE;
}

function clonePlayerScoreRecord(rec) {
  if (!rec || typeof rec !== 'object') {
    return { scores: [], putts: [], fairways: [], penalties: [], sands: [] };
  }
  return {
    scores: Array.isArray(rec.scores) ? rec.scores.slice() : [],
    putts: Array.isArray(rec.putts) ? rec.putts.slice() : [],
    fairways: Array.isArray(rec.fairways) ? rec.fairways.slice() : [],
    penalties: Array.isArray(rec.penalties) ? rec.penalties.slice() : [],
    sands: Array.isArray(rec.sands) ? rec.sands.slice() : []
  };
}

function hasMeaningfulPlayerScores(rec) {
  if (!rec || typeof rec !== 'object') return false;
  const scores = rec.scores;
  if (!Array.isArray(scores) || !scores.length) return false;
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    if (s == null || s === '') continue;
    if (typeof s === 'number' && isNaN(s)) continue;
    return true;
  }
  return false;
}

/**
 * 成绩归属 ID：scorePlayerId > playerId > userId；禁止姓名匹配
 */
function resolveMigrationScoreOwnerId(group, memberRaw) {
  let memberKey = '';
  if (memberRaw != null && (typeof memberRaw === 'string' || typeof memberRaw === 'number')) {
    memberKey = String(memberRaw).trim();
  } else if (memberRaw && typeof memberRaw === 'object') {
    memberKey = String(
      memberRaw.userId || memberRaw.playerId || memberRaw.id || ''
    ).trim();
  }

  const players = group && Array.isArray(group.players) ? group.players : [];
  let found = null;
  if (memberKey) {
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p) continue;
      const uid = resolveGroupSlotPlayerId(p);
      const pid = p.playerId != null ? String(p.playerId).trim() : '';
      const sp = resolveSlotScorePlayerId(p);
      if (uid === memberKey || pid === memberKey || (sp && sp === memberKey)) {
        found = p;
        break;
      }
    }
  }

  if (found) {
    const sp = resolveSlotScorePlayerId(found);
    if (sp) return sp;
    if (found.playerId != null && String(found.playerId).trim()) {
      return String(found.playerId).trim();
    }
    const uid = resolveGroupSlotPlayerId(found);
    if (uid) return uid;
  }

  if (memberRaw && typeof memberRaw === 'object') {
    const sp = resolveSlotScorePlayerId(memberRaw);
    if (sp) return sp;
    if (memberRaw.playerId != null && String(memberRaw.playerId).trim()) {
      return String(memberRaw.playerId).trim();
    }
    if (memberRaw.userId != null && String(memberRaw.userId).trim()) {
      return String(memberRaw.userId).trim();
    }
  }
  return memberKey;
}

/**
 * 将 G2/G3/G4 LIVE 组合成绩展开为 G1 个人成绩。
 * 输入：旧 match + 目标 gameMode；输出：迁移后的 scoreData（各组 teamScoresByEntity 已清空）。
 * 不修改 match.groups / registerInfo；scoreEntities / pairings 由调用方清理。
 */
function migrateComboScoresToIndividualStroke(match, targetGameMode) {
  const target = targetGameMode != null ? String(targetGameMode).trim() : INDIVIDUAL_STROKE_MODE;
  const raw =
    match && match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : {};
  let out;
  try {
    out = JSON.parse(JSON.stringify(raw));
  } catch (e) {
    out = {};
  }
  if (target !== INDIVIDUAL_STROKE_MODE) return out;

  const scoreEntities =
    match && match.scoreEntities && typeof match.scoreEntities === 'object' && !Array.isArray(match.scoreEntities)
      ? match.scoreEntities
      : {};

  const groupsById = {};
  (Array.isArray(match && match.groups) ? match.groups : []).forEach((g) => {
    if (g && g.groupId != null) groupsById[String(g.groupId)] = g;
  });

  const groupIds = {};
  Object.keys(scoreEntities).forEach((gid) => {
    groupIds[String(gid)] = true;
  });
  Object.keys(out).forEach((gid) => {
    groupIds[String(gid)] = true;
  });

  Object.keys(groupIds).forEach((gid) => {
    const groupScore = out[gid] && typeof out[gid] === 'object' ? out[gid] : {};
    const scoresByPlayer =
      groupScore.scoresByPlayer && typeof groupScore.scoresByPlayer === 'object'
        ? Object.assign({}, groupScore.scoresByPlayer)
        : {};
    const entityScores = Array.isArray(groupScore.teamScoresByEntity)
      ? groupScore.teamScoresByEntity
      : [];
    const byEntityId = {};
    entityScores.forEach((rec) => {
      if (!rec || typeof rec !== 'object') return;
      const key =
        rec.teamId != null && String(rec.teamId).trim() !== ''
          ? String(rec.teamId).trim()
          : rec.entityId != null && String(rec.entityId).trim() !== ''
            ? String(rec.entityId).trim()
            : '';
      if (key) byEntityId[key] = rec;
    });

    const entities = Array.isArray(scoreEntities[gid]) ? scoreEntities[gid] : [];
    const group = groupsById[gid];

    entities.forEach((entity) => {
      if (!entity) return;
      const eid = entity.entityId != null ? String(entity.entityId).trim() : '';
      if (!eid) return;
      const rec = byEntityId[eid];
      if (!rec) return;
      const payload = clonePlayerScoreRecord(rec);
      const members = Array.isArray(entity.members) ? entity.members : [];
      members.forEach((memberRaw) => {
        const ownerId = resolveMigrationScoreOwnerId(group, memberRaw);
        if (!ownerId) return;
        // 已有个人成绩则保留（成绩继承），不覆盖
        if (hasMeaningfulPlayerScores(scoresByPlayer[ownerId])) return;
        scoresByPlayer[ownerId] = clonePlayerScoreRecord(payload);
      });
    });

    const preserved = normalizeGroupScoreBucket(groupScore);
    out[gid] = {
      scoresByPlayer: scoresByPlayer,
      teamScoresByEntity: [],
      scoresBySide: preserved.scoresBySide
    };
    if (preserved.matchPlayMeta) out[gid].matchPlayMeta = preserved.matchPlayMeta;
    if (preserved.firstScoreAt != null) out[gid].firstScoreAt = preserved.firstScoreAt;
    if (preserved.finishedScoreAt != null) out[gid].finishedScoreAt = preserved.finishedScoreAt;
  });

  return out;
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
 * 从 pairings 移除该 userId；清空成员但保留成绩行槽位（含空 playerIds）
 */
function clearUserFromPairings(match, userId) {
  const uid = String(userId || '').trim();
  if (!uid || !match) return match;
  const cloned = clonePairings(match.pairings);
  const out = {};
  Object.keys(cloned).forEach((groupId) => {
    const list = (cloned[groupId] || []).map((p) => ({
      id: p.id,
      playerIds: (p.playerIds || []).filter((id) => String(id) !== uid)
    }));
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

/** @deprecated 旧「全清」文案；改赛制请用 buildGameModeChangeGroups*Tip */
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
    matchType: match.matchType || 'team-internal',
    organizationId: match.organizationId != null ? String(match.organizationId) : '',
    organizationName: match.organizationName || '',
    organizationLogo: match.organizationLogo != null ? String(match.organizationLogo) : '',
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
    teamCompetition: normalizeTeamCompetition(
      match.scoringRules && match.scoringRules.teamCompetition,
      cloneTeamGroups(match.teamGroups).length
    ),
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
  var seriesGuard = require('./seriesFinishLock.js').assertWritableForMatch(match);
  if (seriesGuard && !seriesGuard.ok) {
    var err = new Error(seriesGuard.message || seriesGuard.reason || 'series_completed');
    err.reason = seriesGuard.reason;
    throw err;
  }
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

/**
 * 按正式球队 ID 查询其作为参赛方的队际赛（含已完赛）。
 * - 只匹配 match.teamGroups[].sourceTeamId
 * - 不用根级 teamId（根级为赛事机构）
 * - 不修改记录、不双写关联表
 */
function listInterTeamMatchesByParticipatingTeamId(teamId) {
  const tid = String(teamId || '').trim();
  if (!tid) return [];
  const seen = {};
  const out = [];
  const list = listMatches();
  for (let i = 0; i < list.length; i++) {
    const match = list[i];
    if (!match || String(match.matchType || '').trim() !== 'inter-team') continue;
    const matchId = match.matchId != null ? String(match.matchId) : '';
    if (!matchId || seen[matchId]) continue;
    const groups = Array.isArray(match.teamGroups) ? match.teamGroups : [];
    let hit = false;
    for (let g = 0; g < groups.length; g++) {
      const sid =
        groups[g] && groups[g].sourceTeamId != null
          ? String(groups[g].sourceTeamId).trim()
          : '';
      if (sid && sid === tid) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;
    seen[matchId] = true;
    out.push(match);
  }
  return out;
}

function getMatchById(matchId) {
  if (!matchId) return null;
  return normalizeStoredMatch(_readAll().find((item) => item && item.matchId === matchId) || null);
}

/** Series 发布：是否存在 matchId（不改旧 API） */
function existsMatchId(matchId) {
  const mid = matchId != null ? String(matchId).trim() : '';
  if (!mid) return false;
  return _readAll().some((item) => item && String(item.matchId || '').trim() === mid);
}

/**
 * Series 专用安全写入（不改变 saveMatch 语义）
 * - 预分配 matchId 幂等：同 seriesId/roundId/publishToken 且 payload fingerprint 一致 → 成功
 * - 同身份不同 payload → payload_conflict（禁止覆盖）
 * - 异 Series / 无 seriesContext 占用 → conflict
 * - 写后回读校验
 *
 * @param {object} match
 * @param {{ getMatchById?: Function, writeMatch?: Function }} [hooks] 自测注入
 * @returns {{ ok: boolean, reason?: string, match?: object }}
 */
function saveMatchChecked(match, hooks) {
  const h = hooks || {};
  if (!match || !match.matchId) {
    return { ok: false, reason: 'match_id_required' };
  }
  const seriesStationMatch = require('./seriesStationMatch.js');
  const mid = String(match.matchId).trim();
  const incomingCanon = seriesStationMatch.extractStationPayloadForFingerprint(match);
  const incomingFp = seriesStationMatch.fingerprintOf(incomingCanon);
  const ctx = match.seriesContext || {};
  if (ctx.managed !== true) {
    return { ok: false, reason: 'series_context_required' };
  }
  const seriesId = ctx.seriesId != null ? String(ctx.seriesId).trim() : '';
  const roundId = ctx.roundId != null ? String(ctx.roundId).trim() : '';
  const publishToken = ctx.publishToken != null ? String(ctx.publishToken).trim() : '';
  if (!seriesId || !roundId || !publishToken) {
    return { ok: false, reason: 'series_context_incomplete' };
  }

  const getter = typeof h.getMatchById === 'function' ? h.getMatchById : getMatchById;
  const existing = getter(mid);
  if (existing) {
    const ect = existing.seriesContext || {};
    const sameIdentity =
      ect.managed === true &&
      String(ect.seriesId || '').trim() === seriesId &&
      String(ect.roundId || '').trim() === roundId &&
      String(ect.publishToken || '').trim() === publishToken;
    if (!sameIdentity) {
      return { ok: false, reason: 'conflict', matchId: mid };
    }
    // fingerprint 不同直接冲突；相同也须 canonical 字符串完全相等
    const eq = seriesStationMatch.stationPayloadsEqual(existing, match);
    if (!eq.equal) {
      return {
        ok: false,
        reason: 'payload_conflict',
        matchId: mid,
        detail: eq.reason
      };
    }
    const again = getter(mid);
    if (!again) return { ok: false, reason: 'readback_missing' };
    return { ok: true, reason: 'idempotent', match: again };
  }

  const toWrite = Object.assign({}, match, { matchId: mid });
  toWrite.scoreData = normalizeScoreData(toWrite.scoreData);

  if (typeof h.writeMatch === 'function') {
    const wr = h.writeMatch(toWrite);
    if (!wr || !wr.ok) {
      return { ok: false, reason: (wr && wr.reason) || 'storage_write_failed' };
    }
  } else {
    const list = _readAll();
    const next = [toWrite].concat(list.filter((item) => item && item.matchId !== mid));
    try {
      wx.setStorageSync(STORAGE_KEY, next || []);
    } catch (e) {
      return { ok: false, reason: 'storage_write_failed' };
    }
  }

  const readback = getter(mid);
  if (!readback) {
    return { ok: false, reason: 'readback_missing' };
  }
  const rbCtx = readback.seriesContext || {};
  if (
    rbCtx.managed !== true ||
    String(rbCtx.seriesId || '').trim() !== seriesId ||
    String(rbCtx.roundId || '').trim() !== roundId ||
    String(rbCtx.publishToken || '').trim() !== publishToken
  ) {
    return { ok: false, reason: 'readback_identity_mismatch' };
  }
  const rbEq = seriesStationMatch.stationPayloadsEqual(readback, match);
  if (!rbEq.equal) {
    return { ok: false, reason: 'readback_payload_mismatch', detail: rbEq.reason };
  }
  return { ok: true, reason: 'created', match: readback, fingerprint: incomingFp };
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
  const caps = require('./teamMatchCapabilities.js');
  const org = caps.resolveOrganizerDisplay(match);
  const matchType = String((match && match.matchType) || '').trim();
  const typeLabel =
    matchType === 'inter-team' ? '队际赛' : matchType === 'team-internal' ? '队内赛' : '';
  return {
    id: match.matchId,
    matchId: match.matchId,
    matchType: matchType,
    typeLabel: typeLabel,
    // 卡片底部主体类型标签（CLUB / ORG.）；名称与 LOGO 仍走 org 快照
    organizerKindLabel: caps.resolveOrganizerKindLabel(match),
    favorited: false,
    clubLogo: match.matchLogo || org.logo || '',
    clubDate: formatClubDate(match.teeTime),
    title: match.roundName || org.name || '球队赛',
    // 发起主体快照（队际=机构；队内=球队）；不含参赛球队列表
    teamName: org.name || match.teamName || '',
    venue: venue,
    views: '0',
    statusLabel: resolveTournamentCardStatusLabel(match),
    navUrl: '/subpackages/tournament/pages/detail/index?matchId=' + encodeURIComponent(match.matchId)
  };
}

const {
  validateTeamMatchSideGroups: validateTeamMatchSideGroupsFn
} = require('./teamMatchCapabilities.js');

module.exports = {
  STORAGE_KEY,
  REGISTER_SOURCES,
  REGISTER_SUBJECT_TYPES,
  REGISTER_PICK_CHANNELS,
  INDIVIDUAL_STROKE_MODE,
  INDIVIDUAL_MATCH_PLAY_MODE,
  GAME_MODE_CHANGE_CLEAR_GROUPS_TIP,
  validateTeamMatchSideGroups: validateTeamMatchSideGroupsFn,
  cloneTeamGroups,
  isPairingStrokeFormat,
  getPairingStrokeLabel,
  isComboGameMode,
  isStrokeEntityGameMode,
  isIndividualPersonalScoreMode,
  hasFormalGroups,
  clonePairings,
  sanitizePairings,
  shouldClearGroupsOnGameModeChange,
  shouldClearPairingsOnGameModeChange,
  analyzeGameModeChangeGroups,
  toEmptyFormalGroupShell,
  buildGameModeChangeGroupsPartialTip,
  buildGameModeChangeGroupsAllIllegalTip,
  replaceFormalGroupsOnMatch,
  shouldMigrateComboScoresToIndividualStroke,
  shouldClearComboArtifactsForPersonalMatchPlay,
  migrateComboScoresToIndividualStroke,
  normalizeGroupScoreBucket: normalizeGroupScoreBucket,
  normalizeMatchPlayMeta: normalizeMatchPlayMeta,
  normalizeSideScoreRecord: normalizeSideScoreRecord,
  normalizeFirstScoreAt: normalizeFirstScoreAt,
  groupScoreBucketHasAnyFilledScore: groupScoreBucketHasAnyFilledScore,
  ensureGroupScoreBucketFirstScoreAt: ensureGroupScoreBucketFirstScoreAt,
  groupScoreBucketHasCompleted18Holes: groupScoreBucketHasCompleted18Holes,
  ensureGroupScoreBucketFinishedScoreAt: ensureGroupScoreBucketFinishedScoreAt,
  forceGroupScoreBucketFinishedScoreAt: forceGroupScoreBucketFinishedScoreAt,
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
  saveMatchChecked,
  existsMatchId,
  listMatches,
  listInterTeamMatchesByParticipatingTeamId,
  getMatchById,
  removeMatch,
  toTournamentCard,
  formatClubDate,
  normalizeRegisterUser,
  normalizeRegisterInfo,
  createDefaultRegisterInfo
};

// 显式挂载：避免部分运行时未拿到 object shorthand 导出
module.exports.ensureGroupScoreBucketFirstScoreAt = ensureGroupScoreBucketFirstScoreAt;
module.exports.ensureGroupScoreBucketFinishedScoreAt = ensureGroupScoreBucketFinishedScoreAt;
module.exports.forceGroupScoreBucketFinishedScoreAt = forceGroupScoreBucketFinishedScoreAt;
module.exports.groupScoreBucketHasCompleted18Holes = groupScoreBucketHasCompleted18Holes;
module.exports.normalizeFirstScoreAt = normalizeFirstScoreAt;
module.exports.groupScoreBucketHasAnyFilledScore = groupScoreBucketHasAnyFilledScore;
