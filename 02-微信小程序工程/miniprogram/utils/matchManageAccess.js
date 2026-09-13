/**
 * 球队赛（队内 / 队际）赛事管理权限 — 集中出口。
 * - 全权管理者：创建者 / 发起主体组织管理员（队内=发起球队，队际=赛事机构）
 * - 联合管理员：走 tempAdminPermission 细粒度权限，不提升为全权
 * - 队际参赛球队管理员：不因参赛自动获得权限
 */

const teamDirectory = require('./teamDirectory.js');
const tempAdminPermission = require('./tempAdminPermission.js');
const {
  isInterTeamMatch,
  isTeamInternalMatch
} = require('./teamMatchCapabilities.js');

/** 与历史 MORE_ACCESS.permissions 对齐：全权时仍写入查看类权限列表 */
const PRIVILEGED_BASE_PERMISSIONS = [
  'leaderboard',
  'stats',
  'poster',
  'feedback',
  'theme',
  'export_groups'
];

/** 查看类 / 普通功能：不依赖管理者身份 */
const COMMON_VIEW_PERMISSIONS = {
  leaderboard: true,
  stats: true,
  feedback: true,
  theme: true,
  poster: true,
  export_groups: true,
  register_for_other: true,
  invite_friends_register: true
};

const PLACEHOLDER_USER_IDS = { me: true, mock: true, demo: true };

function _rawUserId(userOrId) {
  if (userOrId == null) return '';
  if (typeof userOrId === 'string' || typeof userOrId === 'number') {
    return String(userOrId).trim();
  }
  if (typeof userOrId === 'object') {
    return String(userOrId.userId || userOrId.id || userOrId.openid || '').trim();
  }
  return '';
}

function collectManageActorIds(userOrId) {
  const out = [];
  const seen = {};
  function add(id) {
    const s = String(id || '').trim();
    if (!s || seen[s]) return;
    seen[s] = true;
    out.push(s);
  }
  add(_rawUserId(userOrId));
  try {
    add(require('./teamClub/identity.js').currentUserIdOrEmpty());
  } catch (e) {
    /* ignore */
  }
  try {
    const alias = require('./userIdentityAlias.js');
    const snapshot = out.slice();
    for (let i = 0; i < snapshot.length; i++) {
      add(alias.resolveCanonicalUserId(snapshot[i]));
      const aliases = alias.getAliases(snapshot[i]) || [];
      for (let j = 0; j < aliases.length; j++) {
        const row = aliases[j];
        if (!row) continue;
        add(row.fromUserId);
        add(row.toUserId);
      }
    }
  } catch (e2) {
    /* ignore */
  }
  return out;
}

function resolveUserId(userOrId) {
  const ids = collectManageActorIds(userOrId);
  for (let i = 0; i < ids.length; i++) {
    if (!PLACEHOLDER_USER_IDS[ids[i].toLowerCase()]) return ids[i];
  }
  return ids[0] || '';
}

function isCreatorOfMatch(match, userOrId) {
  if (!match) return false;
  const actorIds = collectManageActorIds(userOrId);
  if (!actorIds.length) return false;
  const creators = [
    match.createdBy,
    match.creatorId,
    match.ownerUserId,
    match.creatorUserId
  ];
  const seen = {};
  for (let i = 0; i < actorIds.length; i++) {
    seen[actorIds[i]] = true;
  }
  for (let j = 0; j < creators.length; j++) {
    const cid = String(creators[j] || '').trim();
    if (cid && seen[cid]) return true;
  }
  return false;
}

/**
 * 发起主体组织 ID：
 * - 队际赛：organizationId（兼容旧 teamId）
 * - 队内赛：teamId（发起球队）
 * 绝不使用参赛球队 sourceTeamId。
 */
function resolveHostingOrganizationId(match) {
  if (!match || typeof match !== 'object') return '';
  if (isInterTeamMatch(match)) {
    return String(match.organizationId || match.teamId || '').trim();
  }
  return String(match.teamId || '').trim();
}

function isHostingOrgAdminOfMatch(match, userOrId) {
  const hostingOrgId = resolveHostingOrganizationId(match);
  if (!hostingOrgId) return false;
  const actorIds = collectManageActorIds(userOrId);
  if (!actorIds.length) return false;
  const org = teamDirectory.getTeamById(hostingOrgId);
  const useClub =
    isTeamInternalMatch(match) || !!(org && teamDirectory.isClubTeam(org));
  for (let i = 0; i < actorIds.length; i++) {
    const id = actorIds[i];
    if (!id) continue;
    if (useClub) {
      if (teamDirectory.isClubTeamAdminUser(hostingOrgId, id)) return true;
    } else if (teamDirectory.isOrganizationAdmin(hostingOrgId, id)) {
      return true;
    }
  }
  return false;
}

/**
 * @returns {{
 *   userId: string,
 *   isCreator: boolean,
 *   isOrgAdmin: boolean,
 *   isTeamAdmin: boolean,
 *   isHostingOrgAdmin: boolean,
 *   hostingOrgId: string,
 *   isPrivilegedUser: boolean,
 *   permissions: string[]
 * }}
 */
function resolveMatchManageAccess(match, userOrId) {
  const userId = resolveUserId(userOrId);
  const isCreator = isCreatorOfMatch(match, userOrId);
  const hostingOrgId = resolveHostingOrganizationId(match);
  const isHostingOrgAdmin = isHostingOrgAdminOfMatch(match, userOrId);
  const inter = isInterTeamMatch(match);
  const internal = isTeamInternalMatch(match);
  const isPrivilegedUser = !!(isCreator || isHostingOrgAdmin);

  return {
    userId: userId,
    isCreator: isCreator,
    isOrgAdmin: !!(inter && isHostingOrgAdmin),
    isTeamAdmin: !!(internal && isHostingOrgAdmin),
    isHostingOrgAdmin: isHostingOrgAdmin,
    hostingOrgId: hostingOrgId,
    isPrivilegedUser: isPrivilegedUser,
    permissions: PRIVILEGED_BASE_PERMISSIONS.slice()
  };
}

function isCommonViewPermission(permission) {
  return !!COMMON_VIEW_PERMISSIONS[String(permission || '').trim()];
}

/**
 * 操作级权限：
 * - 全权管理者：全部允许
 * - 查看类：始终允许（与 M 面板 common 区一致）
 * - 其余：联合管理员细粒度
 */
function hasMatchManagePermission(match, userOrId, permission) {
  const access = resolveMatchManageAccess(match, userOrId);
  const key = String(permission || '').trim();
  if (!key) return access.isPrivilegedUser;
  if (access.isPrivilegedUser) return true;
  if (isCommonViewPermission(key)) return true;
  if (key === 'edit_half') {
    return (
      tempAdminPermission.hasTempAdminPermission(match, access.userId, 'edit_match') ||
      tempAdminPermission.hasTempAdminPermission(match, access.userId, 'edit_half')
    );
  }
  return tempAdminPermission.hasTempAdminPermission(match, access.userId, key);
}

/** 权限管理入口：仅全权管理者（创建者 / 发起主体管理员），联合管理员不可进入 */
function canManageTempAdmins(match, userOrId) {
  return resolveMatchManageAccess(match, userOrId).isPrivilegedUser;
}

module.exports = {
  PRIVILEGED_BASE_PERMISSIONS,
  resolveUserId,
  collectManageActorIds,
  isCreatorOfMatch,
  resolveHostingOrganizationId,
  isHostingOrgAdminOfMatch,
  resolveMatchManageAccess,
  isCommonViewPermission,
  hasMatchManagePermission,
  canManageTempAdmins
};
