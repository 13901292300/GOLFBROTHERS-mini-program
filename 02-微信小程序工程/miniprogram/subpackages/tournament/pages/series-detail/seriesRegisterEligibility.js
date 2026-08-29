/**
 * 系列赛报名页面适配层（B2/B3）
 * - 只服务 series-detail；不进 B1 领域服务
 * - 报名不校验用户俱乐部球队归属；可选全部参赛主体
 * - 不使用 isMine、不默认固定 me、不伪造测试用户
 */

var teamDirectory = require('../../../../utils/teamDirectory.js');

function asString(v) {
  if (v == null) return '';
  return String(v).trim();
}

var MSG_IDENTITY = '无法确认当前用户身份';
var MSG_NOT_PARTICIPANT_TEAM = '当前账号不属于参赛球队';
var MSG_NOT_HOST_MEMBER = '仅主办球队成员可以报名';
var MSG_NO_TEAM_PARTICIPANTS = '暂无参赛球队';
var MSG_NO_DIVISION_PARTICIPANTS = '暂无参赛分队';

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

function isEligibleSeriesParticipant(p) {
  if (!p || typeof p !== 'object') return false;
  if (!asString(p.seriesParticipantId)) return false;
  if (p.cancelled === true || p.invalid === true) return false;
  var st = asString(p.status || p.lifecycleStatus || p.participantStatus).toLowerCase();
  if (st === 'cancelled' || st === 'canceled' || st === 'invalid' || st === 'removed') {
    return false;
  }
  return true;
}

function collectParticipantOptions(series, kind) {
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  var options = [];
  var ids = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i] || {};
    if (asString(p.kind) !== kind) continue;
    if (!isEligibleSeriesParticipant(p)) continue;
    var opt = buildParticipantOption(p);
    if (!opt.id) continue;
    ids.push(opt.id);
    options.push(opt);
  }
  return { ids: ids, options: options };
}

/**
 * 可选全部参赛主体，不按用户俱乐部球队过滤。
 * organization：全部 kind=team；team：全部 kind=division。
 * 仅一个可选主体时默认选中；两个及以上必须用户手动选择。
 *
 * @param {object} input
 * @param {object} input.series
 * @param {string} input.playerId 已解析的同一 playerId
 * @param {object} [deps]
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
      ineligibleMessage: MSG_NO_TEAM_PARTICIPANTS,
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
  if (hostMode === 'team') {
    var divs = collectParticipantOptions(series, 'division');
    return {
      ok: true,
      reason: divs.ids.length ? '' : 'no_division_participants',
      eligibleParticipantIds: divs.ids,
      options: divs.options,
      ineligibleMessage: divs.ids.length ? '' : MSG_NO_DIVISION_PARTICIPANTS,
      hostMode: hostMode,
      defaultSheetParticipantId: divs.ids.length === 1 ? divs.ids[0] : ''
    };
  }

  var teams = collectParticipantOptions(series, 'team');
  var defaultId = teams.ids.length === 1 ? teams.ids[0] : '';
  return {
    ok: true,
    reason: teams.ids.length ? '' : 'no_participants',
    eligibleParticipantIds: teams.ids,
    options: teams.options,
    ineligibleMessage: teams.ids.length ? '' : MSG_NO_TEAM_PARTICIPANTS,
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
      reason: result.reason || 'identity_unresolved'
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
  MSG_NOT_HOST_MEMBER: MSG_NOT_HOST_MEMBER,
  MSG_NO_TEAM_PARTICIPANTS: MSG_NO_TEAM_PARTICIPANTS,
  MSG_NO_DIVISION_PARTICIPANTS: MSG_NO_DIVISION_PARTICIPANTS
};
