/**
 * 系列赛报名 TAB：统一大名单 roster 的过滤投影 + CTA 矩阵（B2）
 * - 投影本身不写 Series / 分站 / storage
 * - 写操作由页面调用 B1 service；本文件只产出展示态
 * - 子 TAB 仅为同一 roster 按 seriesParticipantId 过滤
 * - 主页 ID 仅经 openPlayerProfile.resolveOpenableUserId；禁止 seriesParticipantId/rosterEntryId/entityId/unitId 冒充
 */

var openPlayerProfileUtil = require('../../../../utils/openPlayerProfile.js');
var registrationInteractionModel = require('../../../../utils/registrationInteractionModel.js');

var SERIES_SELF_REGISTER_SHEET_TITLE = '赛事报名';
var SERIES_SELF_REGISTER_SHEET_SUB = '比赛名将用于报名名单与成绩展示';

function isSeriesCompetitionPhaseCompleted(phase) {
  return asString(phase) === 'completed';
}

/** 只读权威手机号：gameStore.phone / profile.phone；不猜昵称、不用 phoneMasked */
function resolveSelfRegisterPhone(currentUser, profile) {
  var user = currentUser && typeof currentUser === 'object' ? currentUser : {};
  var p = profile && typeof profile === 'object' ? profile : {};
  var phone = asString(user.phone);
  if (phone) return phone;
  return asString(p.phone);
}

function asString(v) {
  if (v == null) return '';
  return String(v).trim();
}

function resolveParticipantMode(series) {
  var hostMode = asString(series && series.hostMode);
  if (hostMode === 'team') return 'division';
  return 'team';
}

function normalizeRegistrationState(series) {
  return asString(series && series.registrationState) === 'open' ? 'open' : 'closed';
}

function normalizeRegistrationRevision(series) {
  var n = Number(series && series.registrationRevision);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * 查找本人有效报名（registered）
 */
function findSelfRegisteredEntry(roster, playerId) {
  var pid = asString(playerId);
  if (!pid) return null;
  var list = Array.isArray(roster) ? roster : [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e) continue;
    if (asString(e.playerId) !== pid && asString(e.userId) !== pid) continue;
    if (asString(e.registrationStatus).toLowerCase() === 'registered') return e;
  }
  return null;
}

/**
 * CTA 状态矩阵
 * @param {object} input
 * @param {object} input.lifecycleAccess
 * @param {string} input.registrationState open|closed
 * @param {boolean} input.identityOk
 * @param {boolean} input.isRegistered
 * @param {number} input.eligibleCount
 * @param {string} [input.ineligibleMessage] 身份/归属失败时展示的具体文案
 * @param {string} [input.competitionPhaseCache] Series 整体 phase；仅 completed 视为完赛
 */
function resolveRegisterCta(input) {
  var src = input && typeof input === 'object' ? input : {};
  var access =
    src.lifecycleAccess && typeof src.lifecycleAccess === 'object'
      ? src.lifecycleAccess
      : src;
  if (access.isDraftPreview) {
    return { disabled: true, label: '发布后开放报名', action: 'none' };
  }
  var life = asString(access.lifecycleStatus);
  if (life === 'cancelled') {
    return { disabled: true, label: '赛事已取消', action: 'none' };
  }
  if (life === 'archived') {
    return { disabled: true, label: '赛事已归档', action: 'none' };
  }
  if (life !== 'published') {
    return { disabled: true, label: '发布后开放报名', action: 'none' };
  }

  var phase = asString(src.competitionPhaseCache || access.competitionPhaseCache);
  if (isSeriesCompetitionPhaseCompleted(phase)) {
    return { disabled: true, label: '', action: 'none' };
  }

  var regState = asString(src.registrationState) === 'open' ? 'open' : 'closed';
  if (regState === 'closed') {
    return {
      disabled: true,
      label: registrationInteractionModel.resolveRegistrationCtaCopy('closed'),
      action: 'none'
    };
  }

  if (src.isRegistered) {
    return {
      disabled: false,
      label: registrationInteractionModel.resolveRegistrationCtaCopy('cancel'),
      action: 'cancel'
    };
  }

  if (!src.identityOk) {
    return {
      disabled: true,
      label: asString(src.ineligibleMessage) || '无法确认当前用户身份',
      action: 'none'
    };
  }
  if (!(Number(src.eligibleCount) > 0)) {
    return {
      disabled: true,
      label: asString(src.ineligibleMessage) || '当前账号不属于参赛球队',
      action: 'none'
    };
  }

  return {
    disabled: false,
    label: registrationInteractionModel.resolveRegistrationCtaCopy('register'),
    action: 'register'
  };
}

function resolveGenderDisplay(entry) {
  var raw =
    asString(entry && entry.genderSnapshot) ||
    asString(entry && entry.matchGender) ||
    asString(entry && entry.gender);
  var g = raw.toLowerCase();
  if (g === 'male' || g === 'm' || raw === '男') {
    return { icon: '♂', className: 'gender-male' };
  }
  if (g === 'female' || g === 'f' || raw === '女') {
    return { icon: '♀', className: 'gender-female' };
  }
  return { icon: '', className: '' };
}

function listRegisterParticipants(series, mode) {
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i] || {};
    var kind = asString(p.kind);
    if (kind && kind !== mode) continue;
    var id = asString(p.seriesParticipantId);
    if (!id) continue;
    var nameSnapshot = asString(p.nameSnapshot);
    var shortName = asString(p.shortNameSnapshot) || nameSnapshot;
    // 报名子 TAB 对齐队际赛：纯文字（简称/分队名 + 人数），不投影 logo
    out.push({
      id: id,
      seriesParticipantId: id,
      name: shortName || nameSnapshot || id,
      kind: mode
    });
  }
  return out;
}

/**
 * 有效报名：可归属到 participants，且非 cancelled；未知/无法归属忽略
 */
function isCountableRosterEntry(entry, participantIdSet) {
  if (!entry || typeof entry !== 'object') return false;
  var pid = asString(entry.seriesParticipantId);
  if (!pid || !participantIdSet[pid]) return false;
  var status = asString(entry.registrationStatus).toLowerCase();
  if (status === 'cancelled') return false;
  return true;
}

/**
 * 展示用户身份契约：主页主键只认稳定 userId/playerId（经 resolveOpenableUserId）
 */
function projectDisplayUser(entry, index) {
  var src = entry && typeof entry === 'object' ? entry : {};
  var name =
    asString(src.playerNameSnapshot) ||
    asString(src.competitionName) ||
    asString(src.matchNickname) ||
    asString(src.nickname) ||
    asString(src.displayName) ||
    asString(src.name) ||
    '-';
  var avatar =
    asString(src.playerAvatarSnapshot) ||
    asString(src.avatarUrl) ||
    asString(src.avatar);
  var handicapRaw =
    src.handicapSnapshot != null && src.handicapSnapshot !== ''
      ? src.handicapSnapshot
      : src.handicap;
  var handicap =
    handicapRaw != null && handicapRaw !== '' ? String(handicapRaw) : '-';
  var floatRaw =
    src.floatCoefSnapshot != null && src.floatCoefSnapshot !== ''
      ? src.floatCoefSnapshot
      : src.handicapFloat != null && src.handicapFloat !== ''
        ? src.handicapFloat
        : handicapRaw;
  var handicapFloat =
    floatRaw != null && floatRaw !== ''
      ? Number.isFinite(Number(floatRaw))
        ? Number(floatRaw)
        : asString(floatRaw)
      : '';
  var gender = resolveGenderDisplay(src);
  var genderRaw =
    asString(src.genderSnapshot) ||
    asString(src.matchGender) ||
    asString(src.gender);
  // 仅 playerId / userId；绝不取 seriesParticipantId / rosterEntryId / entityId / unitId
  var playerId = asString(src.playerId) || asString(src.userId);
  var userId = asString(src.userId) || playerId;
  var userType = asString(src.userType);
  var identitySource = asString(src.identitySource) || 'seriesRoster';
  var profileUserId = openPlayerProfileUtil.resolveOpenableUserId({
    userId: userId,
    playerId: playerId,
    userType: userType
  });
  var seriesParticipantId = asString(src.seriesParticipantId);
  var listKey =
    asString(src.rosterEntryId) ||
    (playerId ? playerId + '@' + seriesParticipantId : '') ||
    'row-' + index;
  return {
    listKey: listKey,
    playerId: playerId,
    userId: userId,
    profileUserId: profileUserId,
    name: name,
    displayName: name,
    competitionName: name,
    avatar: avatar,
    avatarUrl: avatar,
    gender: genderRaw,
    genderIcon: gender.icon,
    genderClass: gender.className,
    handicap: handicap,
    handicapFloat: handicapFloat,
    seriesParticipantId: seriesParticipantId,
    registrationStatus: asString(src.registrationStatus),
    registrationSource: asString(src.registrationSource),
    userType: userType,
    identitySource: identitySource,
    profileAvailable: !!profileUserId
  };
}

/**
 * @param {object} input
 * @param {object} input.series
 * @param {object} [input.lifecycleAccess] resolveLifecycleAccess 结果
 * @param {string} [input.activeParticipantId] 当前子 TAB；空则首次默认第一个有效主体
 * @param {object} [input.registrationContext] 页面装配的身份/资格（resolved=true 时参与 CTA）
 */
function buildSeriesRegisterViewModel(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series && typeof src.series === 'object' ? src.series : {};
  var access =
    src.lifecycleAccess && typeof src.lifecycleAccess === 'object'
      ? src.lifecycleAccess
      : {};
  var requestedActive = asString(src.activeParticipantId);
  var ctx =
    src.registrationContext && typeof src.registrationContext === 'object'
      ? src.registrationContext
      : {};
  var contextResolved = ctx.resolved === true;

  var mode = resolveParticipantMode(series);
  var participants = listRegisterParticipants(series, mode);
  var participantIdSet = Object.create(null);
  for (var i = 0; i < participants.length; i++) {
    participantIdSet[participants[i].id] = true;
  }

  var activeParticipantId = requestedActive;
  if (!activeParticipantId || !participantIdSet[activeParticipantId]) {
    activeParticipantId = participants.length ? participants[0].id : '';
  }

  var roster = Array.isArray(series.roster) ? series.roster : [];
  var counts = Object.create(null);
  for (var c = 0; c < participants.length; c++) {
    counts[participants[c].id] = 0;
  }

  var registerDisplayUsers = [];
  var registerTotalCount = 0;
  for (var r = 0; r < roster.length; r++) {
    var entry = roster[r];
    if (!isCountableRosterEntry(entry, participantIdSet)) continue;
    var pid = asString(entry.seriesParticipantId);
    counts[pid] = (counts[pid] || 0) + 1;
    registerTotalCount += 1;
    if (pid === activeParticipantId) {
      registerDisplayUsers.push(projectDisplayUser(entry, registerDisplayUsers.length));
    }
  }

  var registerSubTabs = participants.map(function (p) {
    return {
      id: p.id,
      name: p.name,
      count: counts[p.id] || 0,
      isActive: p.id === activeParticipantId
    };
  });

  var countsSum = 0;
  for (var s = 0; s < registerSubTabs.length; s++) {
    countsSum += registerSubTabs[s].count;
  }

  var registrationState = normalizeRegistrationState(series);
  var registrationRevision = normalizeRegistrationRevision(series);
  var playerId = contextResolved ? asString(ctx.playerId) : '';
  var identityOk = contextResolved ? ctx.identityOk === true : false;
  var eligibleIds = contextResolved && Array.isArray(ctx.eligibleParticipantIds)
    ? ctx.eligibleParticipantIds.map(asString).filter(Boolean)
    : [];
  var selfEntry = contextResolved ? findSelfRegisteredEntry(roster, playerId) : null;
  var isRegistered = !!selfEntry;
  var selfParticipantId = selfEntry
    ? asString(selfEntry.seriesParticipantId)
    : '';

  var ineligibleMessage = contextResolved
    ? asString(ctx.ineligibleMessage)
    : '';
  var cta;
  if (contextResolved) {
    cta = resolveRegisterCta({
      lifecycleAccess: access,
      registrationState: registrationState,
      identityOk: identityOk,
      isRegistered: isRegistered,
      eligibleCount: eligibleIds.length,
      ineligibleMessage: ineligibleMessage,
      competitionPhaseCache: series.competitionPhaseCache
    });
  } else {
    // 未装配身份上下文：仅生命周期/开关门控；交互 CTA 由页面 reload 覆盖
    cta = resolveRegisterCta({
      lifecycleAccess: access,
      registrationState: registrationState,
      identityOk: false,
      isRegistered: false,
      eligibleCount: 0,
      ineligibleMessage: '无法确认当前用户身份',
      competitionPhaseCache: series.competitionPhaseCache
    });
  }

  return {
    ok: true,
    available: true,
    participantMode: mode,
    registerTotalCount: registerTotalCount,
    registerSubTabs: registerSubTabs,
    activeParticipantId: activeParticipantId,
    registerDisplayUsers: registerDisplayUsers,
    emptyText: '暂无报名人员',
    registrationState: registrationState,
    registrationRevision: registrationRevision,
    currentUserRegistration: {
      identityOk: identityOk,
      playerId: playerId,
      isRegistered: isRegistered,
      seriesParticipantId: selfParticipantId,
      eligibleParticipantIds: eligibleIds.slice(),
      ineligibleMessage: ineligibleMessage
    },
    cta: cta,
    // 自测用：总人数必须等于各子 TAB count 之和
    countsSumEqualsTotal: countsSum === registerTotalCount
  };
}

function emptyRegisterViewModel() {
  return {
    ok: true,
    available: true,
    participantMode: 'team',
    registerTotalCount: 0,
    registerSubTabs: [],
    activeParticipantId: '',
    registerDisplayUsers: [],
    emptyText: '暂无报名人员',
    registrationState: 'closed',
    registrationRevision: 0,
    currentUserRegistration: {
      identityOk: false,
      playerId: '',
      isRegistered: false,
      seriesParticipantId: '',
      eligibleParticipantIds: [],
      ineligibleMessage: ''
    },
    cta: { disabled: true, label: '发布后开放报名', action: 'none' },
    countsSumEqualsTotal: true
  };
}

module.exports = {
  SERIES_SELF_REGISTER_SHEET_TITLE: SERIES_SELF_REGISTER_SHEET_TITLE,
  SERIES_SELF_REGISTER_SHEET_SUB: SERIES_SELF_REGISTER_SHEET_SUB,
  buildSeriesRegisterViewModel: buildSeriesRegisterViewModel,
  emptyRegisterViewModel: emptyRegisterViewModel,
  resolveParticipantMode: resolveParticipantMode,
  resolveRegisterCta: resolveRegisterCta,
  isSeriesCompetitionPhaseCompleted: isSeriesCompetitionPhaseCompleted,
  resolveSelfRegisterPhone: resolveSelfRegisterPhone,
  isCountableRosterEntry: isCountableRosterEntry,
  findSelfRegisteredEntry: findSelfRegisteredEntry,
  projectDisplayUser: projectDisplayUser,
  resolveGenderDisplay: resolveGenderDisplay
};
