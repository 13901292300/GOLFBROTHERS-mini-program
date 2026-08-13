/**
 * Series M 入口可见性（保守）
 * - organization：机构管理员 / 分站创建者（via matchManageAccess）
 * - team：球队管理员（adminUserIds / 花名册 owner|admin），禁止用 isOrganizationAdmin 冒充
 * - 选轮后按钮权限仍以该轮 matchManageAccess 为准
 */

var teamDirectory = require('./teamDirectory.js');
var matchManageAccess = require('./matchManageAccess.js');
var seriesStationManageGate = require('./seriesStationManageGate.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function resolveUserId(userOrId) {
  return matchManageAccess.resolveUserId(userOrId);
}

/**
 * 球队管理员（俱乐部球队）：adminUserIds 或花名册 owner/admin。
 * 不调用 isOrganizationAdmin。
 */
function isClubTeamAdminUser(teamId, userId) {
  var tid = asString(teamId);
  var uid = asString(userId);
  if (!tid || !uid) return false;
  var team = teamDirectory.getTeamById(tid);
  if (!team || !teamDirectory.isClubTeam(team)) return false;

  var admins = teamDirectory.normalizeAdminUserIds(team.adminUserIds);
  if (admins.indexOf(uid) >= 0) return true;

  var members = teamDirectory.getTeamMembers(tid) || [];
  for (var i = 0; i < members.length; i++) {
    var m = members[i];
    if (!m) continue;
    var mid = asString(m.userId || m.playerId);
    if (mid !== uid) continue;
    var st = asString(m.memberStatus || 'active') || 'active';
    if (st !== 'active') continue;
    var role = teamDirectory.normalizeTeamMemberRole(m.role, team, uid);
    if (role === 'owner' || role === 'admin') return true;
  }
  return false;
}

function isSeriesEventOrgAdmin(series, userId) {
  var uid = asString(userId);
  if (!uid || !series) return false;
  var orgId = asString(series.organization && series.organization.organizationId);
  if (!orgId) return false;
  return !!teamDirectory.isOrganizationAdmin(orgId, uid);
}

function isSeriesCreator(series, userOrId) {
  var uid = resolveUserId(userOrId);
  var createdBy = asString(series && series.createdBy);
  return !!(uid && createdBy && uid === createdBy);
}

function isSeriesHostPrivileged(series, userOrId) {
  var uid = resolveUserId(userOrId);
  if (!uid || !series) return false;
  // Series 创建者：可显示 M 入口；选轮后按钮仍走该分站 matchManageAccess
  if (isSeriesCreator(series, uid)) return true;
  var hostMode = asString(series.hostMode);
  if (hostMode === 'team') {
    var teamId = asString(series.hostTeam && series.hostTeam.teamId);
    return isClubTeamAdminUser(teamId, uid);
  }
  return isSeriesEventOrgAdmin(series, uid);
}

/**
 * 当前用户是否对核验通过的 managed 分站具备 M 管理资格（特权或任一非查看权限）
 */
function hasMatchManageEntryQualification(match, userOrId) {
  if (!match) return false;
  var access = matchManageAccess.resolveMatchManageAccess(match, userOrId);
  if (access.isPrivilegedUser) return true;
  // 联合管理员：任一管理权限键即可视为有入口资格（查看类不算）
  var uid = access.userId;
  var probe = [
    'edit_match',
    'manage_players',
    'manage_tee_sheet',
    'edit_groups',
    'manage_payment',
    'start_match',
    'finish_match',
    'permission_management',
    'net_score'
  ];
  for (var i = 0; i < probe.length; i++) {
    if (matchManageAccess.hasMatchManagePermission(match, uid, probe[i])) {
      // hasMatchManagePermission 对 common view 也返回 true；排除查看类
      if (!matchManageAccess.isCommonViewPermission(probe[i])) return true;
    }
  }
  // 更精确：联合管理员细粒度
  try {
    var tempAdminPermission = require('./tempAdminPermission.js');
    for (var j = 0; j < probe.length; j++) {
      if (tempAdminPermission.hasTempAdminPermission(match, uid, probe[j])) {
        return true;
      }
    }
  } catch (e) {
    /* ignore */
  }
  return false;
}

/**
 * 普通用户是否至少有一个可见的 Series common 功能（代报名/邀请）。
 * - published 且非历史 → 邀请可见（报名 closed 仍可见，对齐单场）
 * - 代报名入口同区展示（closed 时 disabled，仍算可见入口）
 */
function hasSeriesCommonFeatureVisibility(series, userOrId) {
  if (!series) return false;
  var life = asString(series.lifecycleStatus);
  if (life !== 'published') return false;
  if (life === 'cancelled' || life === 'archived') return false;
  // common 能力对齐 matchManageAccess：register_for_other / invite 为查看类
  if (!matchManageAccess.isCommonViewPermission('register_for_other')) return false;
  if (!matchManageAccess.isCommonViewPermission('invite_friends_register')) {
    return false;
  }
  // 需可解析用户身份（与代报名 actor 门闩一致）；无身份则无 common 入口
  return !!matchManageAccess.resolveUserId(userOrId);
}

/**
 * @param {object} input
 * @param {object} input.series
 * @param {object} input.user
 * @param {boolean} input.accessContentReady
 * @param {object} [input.lifecycleAccess]
 * @param {function} input.getMatchById
 * @param {function} input.getIndexByMatchId
 */
function resolveSeriesManageFabVisible(input) {
  var src = input && typeof input === 'object' ? input : {};
  if (!src.accessContentReady) {
    return { visible: false, reason: 'access_gate' };
  }
  var series = src.series;
  if (!series) return { visible: false, reason: 'series_missing' };

  var life =
    src.lifecycleAccess && typeof src.lifecycleAccess === 'object'
      ? src.lifecycleAccess
      : {};
  var lifeStatus = asString(life.lifecycleStatus || series.lifecycleStatus);
  if (life.isDraftPreview || lifeStatus === 'draft') {
    return { visible: false, reason: 'draft' };
  }
  if (life.isHistorical || lifeStatus === 'cancelled' || lifeStatus === 'archived') {
    return { visible: false, reason: 'historical_readonly' };
  }
  if (lifeStatus !== 'published') {
    return { visible: false, reason: 'lifecycle_blocked' };
  }

  var user = src.user || {};

  // 普通功能可见 → 显示 M（不要求 Series 管理身份）
  if (hasSeriesCommonFeatureVisibility(series, user)) {
    return { visible: true, reason: 'common_features' };
  }

  // Series 管理资格
  if (isSeriesHostPrivileged(series, user)) {
    return { visible: true, reason: 'host_privileged' };
  }

  var rounds = Array.isArray(series.rounds) ? series.rounds : [];
  for (var i = 0; i < rounds.length; i++) {
    var rid = asString(rounds[i] && rounds[i].roundId);
    if (!rid) continue;
    var gate = seriesStationManageGate.verifyManagedStationForManage({
      series: series,
      roundId: rid,
      getMatchById: src.getMatchById,
      getIndexByMatchId: src.getIndexByMatchId
    });
    if (!gate.ok) continue;
    if (hasMatchManageEntryQualification(gate.match, user)) {
      return { visible: true, reason: 'match_privileged', matchId: gate.matchId };
    }
  }
  return { visible: false, reason: 'no_visible_features' };
}

module.exports = {
  isClubTeamAdminUser: isClubTeamAdminUser,
  isSeriesEventOrgAdmin: isSeriesEventOrgAdmin,
  isSeriesCreator: isSeriesCreator,
  isSeriesHostPrivileged: isSeriesHostPrivileged,
  hasMatchManageEntryQualification: hasMatchManageEntryQualification,
  hasSeriesCommonFeatureVisibility: hasSeriesCommonFeatureVisibility,
  resolveSeriesManageFabVisible: resolveSeriesManageFabVisible
};
