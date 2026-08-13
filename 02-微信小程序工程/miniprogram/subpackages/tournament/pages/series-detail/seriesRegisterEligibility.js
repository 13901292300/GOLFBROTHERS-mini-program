/**
 * 系列赛报名页面适配层（B2/B3）
 * - 只服务 series-detail；不进 B1 领域服务
 * - 成员资格只读调用 teamDirectory.listActiveClubTeamsForUser
 * - 不使用 isMine、不默认固定 me、不伪造测试用户
 * - 不得静默放宽为「任意选队」
 */

var teamDirectory = require('../../../../utils/teamDirectory.js');

function asString(v) {
  if (v == null) return '';
  return String(v).trim();
}

var MSG_IDENTITY = '无法确认当前用户身份';
var MSG_NOT_PARTICIPANT_TEAM = '当前账号不属于参赛球队';
var MSG_NOT_HOST_MEMBER = '仅主办球队成员可以报名';

/**
 * 页面身份解析矩阵：
 * - profile.userId 与 currentUser.userId 均存在且相同 → 使用
 * - 仅一方存在 → 使用该值
 * - 双方缺失 / 双方存在但不一致 → identity_unresolved
 * 不把空串或固定占位当作第二源硬塞。
 */
function resolvePagePlayerIdentity(profile, currentUser) {
  var pId = asString(profile && profile.userId);
  var uId = asString(currentUser && currentUser.userId);
  if (pId && uId) {
    if (pId === uId) {
      return { ok: true, playerId: pId, reason: '' };
    }
    return { ok: false, playerId: '', reason: 'identity_unresolved' };
  }
  if (pId) return { ok: true, playerId: pId, reason: '' };
  if (uId) return { ok: true, playerId: uId, reason: '' };
  return { ok: false, playerId: '', reason: 'identity_unresolved' };
}

function listUserTeamIds(playerId, deps) {
  var listTeams =
    deps && typeof deps.listActiveClubTeamsForUser === 'function'
      ? deps.listActiveClubTeamsForUser
      : deps && typeof deps.getTeamsByUserId === 'function'
        ? deps.getTeamsByUserId
        : teamDirectory.listActiveClubTeamsForUser;
  var pid = asString(playerId);
  if (!pid) return [];
  var teams;
  try {
    teams = listTeams(pid);
  } catch (e) {
    return [];
  }
  if (!Array.isArray(teams)) return [];
  var out = [];
  var seen = Object.create(null);
  for (var i = 0; i < teams.length; i++) {
    var tid = asString(teams[i] && teams[i].teamId);
    if (!tid || seen[tid]) continue;
    seen[tid] = true;
    out.push(tid);
  }
  return out;
}

function buildParticipantOption(p) {
  var id = asString(p && p.seriesParticipantId);
  var name =
    asString(p && p.shortNameSnapshot) ||
    asString(p && p.nameSnapshot) ||
    id;
  return {
    id: id,
    seriesParticipantId: id,
    name: name,
    logo: asString(p && p.logoSnapshot),
    kind: asString(p && p.kind)
  };
}

/**
 * organization：参赛球队 sourceTeamId ∩ 用户所属球队
 * team：须属主办球队，再可选全部参赛分队（首版自由选分队，不默认）
 *
 * @param {object} input
 * @param {object} input.series
 * @param {string} input.playerId 已解析的同一 playerId
 * @param {object} [deps]
 * @param {function} [deps.listActiveClubTeamsForUser]
 * @param {function} [deps.getTeamsByUserId] 测试注入别名
 */
function resolveSeriesRegistrationEligibility(input, deps) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series && typeof src.series === 'object' ? src.series : null;
  var playerId = asString(src.playerId);
  if (!series) {
    return {
      ok: false,
      reason: 'series_required',
      eligibleParticipantIds: [],
      options: [],
      ineligibleMessage: MSG_NOT_PARTICIPANT_TEAM,
      hostMode: '',
      defaultSheetParticipantId: ''
    };
  }
  if (!playerId) {
    return {
      ok: false,
      reason: 'identity_unresolved',
      eligibleParticipantIds: [],
      options: [],
      ineligibleMessage: MSG_IDENTITY,
      hostMode: asString(series.hostMode),
      defaultSheetParticipantId: ''
    };
  }

  var hostMode = asString(series.hostMode);
  var userTeamIds = listUserTeamIds(playerId, deps);
  var userSet = Object.create(null);
  for (var u = 0; u < userTeamIds.length; u++) {
    userSet[userTeamIds[u]] = true;
  }

  var parts = Array.isArray(series.participants) ? series.participants : [];
  var options = [];
  var ids = [];

  if (hostMode === 'team') {
    var hostTeamId = asString(series.hostTeam && series.hostTeam.teamId);
    if (!hostTeamId || !userSet[hostTeamId]) {
      return {
        ok: true,
        reason: 'not_host_member',
        eligibleParticipantIds: [],
        options: [],
        ineligibleMessage: MSG_NOT_HOST_MEMBER,
        hostMode: hostMode,
        defaultSheetParticipantId: ''
      };
    }
    for (var di = 0; di < parts.length; di++) {
      var dp = parts[di] || {};
      if (asString(dp.kind) !== 'division') continue;
      var dOpt = buildParticipantOption(dp);
      if (!dOpt.id) continue;
      ids.push(dOpt.id);
      options.push(dOpt);
    }
    // team：即使仅一分队也不默认；必须手选
    return {
      ok: true,
      reason: ids.length ? '' : 'no_division_participants',
      eligibleParticipantIds: ids,
      options: options,
      ineligibleMessage: ids.length ? '' : MSG_NOT_HOST_MEMBER,
      hostMode: hostMode,
      defaultSheetParticipantId: ''
    };
  }

  // organization（及未知 hostMode 按队际球队交集，失败则空）
  for (var ti = 0; ti < parts.length; ti++) {
    var tp = parts[ti] || {};
    if (asString(tp.kind) !== 'team') continue;
    var sourceTeamId = asString(tp.sourceTeamId);
    if (!sourceTeamId || !userSet[sourceTeamId]) continue;
    var tOpt = buildParticipantOption(tp);
    if (!tOpt.id) continue;
    ids.push(tOpt.id);
    options.push(tOpt);
  }

  var defaultId = ids.length === 1 ? ids[0] : '';
  return {
    ok: true,
    reason: ids.length ? '' : 'no_eligible_team',
    eligibleParticipantIds: ids,
    options: options,
    ineligibleMessage: ids.length ? '' : MSG_NOT_PARTICIPANT_TEAM,
    hostMode: hostMode || 'organization',
    defaultSheetParticipantId: defaultId
  };
}

/** B1 resolveEligibleParticipantIds 注入形态 */
function resolveEligibleParticipantIdsForService(ctx, deps) {
  var src = ctx && typeof ctx === 'object' ? ctx : {};
  var result = resolveSeriesRegistrationEligibility(
    {
      series: src.series,
      playerId: asString(src.playerId)
    },
    deps
  );
  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason || 'affiliation_unresolved'
    };
  }
  return {
    ok: true,
    ids: result.eligibleParticipantIds.slice()
  };
}

module.exports = {
  resolvePagePlayerIdentity: resolvePagePlayerIdentity,
  resolveSeriesRegistrationEligibility: resolveSeriesRegistrationEligibility,
  resolveEligibleParticipantIdsForService: resolveEligibleParticipantIdsForService,
  listUserTeamIds: listUserTeamIds,
  MSG_IDENTITY: MSG_IDENTITY,
  MSG_NOT_PARTICIPANT_TEAM: MSG_NOT_PARTICIPANT_TEAM,
  MSG_NOT_HOST_MEMBER: MSG_NOT_HOST_MEMBER
};
