/**
 * 球队管理角色 vs 身份标签。
 *
 * 管理角色（role，互斥，决定权限）：
 *   super_admin | admin | member
 *
 * 身份标签（tags，与权限无关）：
 *   captain 队长 — 仅展示，不授予任何管理权限
 *
 * 禁止根据 captain 判断任何管理操作；一律看 role 或后端 permissions。
 */

const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MEMBER: 'member'
};

const TAGS = {
  CAPTAIN: 'captain'
};

const ROLE_LABELS = {
  super_admin: '超级管理员',
  admin: '管理员',
  member: '成员'
};

const TAG_LABELS = {
  captain: '队长'
};

function normalizeRole(raw) {
  const r = String(raw == null ? '' : raw).trim();
  const lower = r.toLowerCase();
  if (
    lower === 'super_admin' ||
    lower === 'owner' ||
    r === '超级管理员' ||
    r === '创建者'
  ) {
    return ROLES.SUPER_ADMIN;
  }
  if (lower === 'admin' || r === '管理员') return ROLES.ADMIN;
  return ROLES.MEMBER;
}

function normalizeTags(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = {};
  for (let i = 0; i < raw.length; i++) {
    const tag = String(raw[i] || '')
      .trim()
      .toLowerCase();
    if (!tag || seen[tag]) continue;
    if (tag === TAGS.CAPTAIN || tag === '队长') {
      seen[TAGS.CAPTAIN] = true;
      out.push(TAGS.CAPTAIN);
    }
  }
  return out;
}

function hasTag(tags, tag) {
  const list = normalizeTags(Array.isArray(tags) ? tags : tags && tags.tags);
  return list.indexOf(String(tag || '').trim()) >= 0;
}

/** 队长只是身份标签，不代表管理权限 */
function isCaptain(memberOrTags) {
  if (!memberOrTags) return false;
  if (Array.isArray(memberOrTags)) return hasTag(memberOrTags, TAGS.CAPTAIN);
  return hasTag(memberOrTags.tags, TAGS.CAPTAIN);
}

const PERMISSION_KEYS = {
  TEAM_APPLICATION_REVIEW: 'team_application.review'
};

function normalizeGrants(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = {};
  for (let i = 0; i < raw.length; i++) {
    const key = String(raw[i] || '').trim();
    if (!key || seen[key]) continue;
    seen[key] = true;
    out.push(key);
  }
  return out;
}

function hasGrant(grants, key) {
  const want = String(key || '').trim();
  if (!want) return false;
  return normalizeGrants(grants).indexOf(want) >= 0;
}

/**
 * 入队申请审核权：超级管理员与管理员默认拥有。
 * 管理员也可通过正式 grant `team_application.review` 表达该权限（本地默认已具备）。
 * 普通成员 / 非成员不能审核。不读取 captain 标签。
 */
function canReviewTeamApplication(role, grants) {
  const r = normalizeRole(role);
  if (r === ROLES.SUPER_ADMIN) return true;
  if (r === ROLES.ADMIN) return true;
  return false;
}

function emptyPermissions() {
  return {
    canEditTeamProfile: false,
    canInviteMember: false,
    canCreateTeamMatch: false,
    canManageAdmins: false,
    canTransferSuperAdmin: false,
    canSetCaptain: false,
    canRemoveMember: false,
    canRemoveOrdinaryMember: false,
    canReviewJoinRequests: false,
    canShareTeam: false
  };
}

/**
 * 权限只从 role + 后端 grants 推导。第一版前端按此显隐按钮，提交仍须服务端校验。
 * 不得读取 tags / captain。
 * 非正式成员（未入队）得到空权限。
 */
function derivePermissions(role, options) {
  const isMember = !options || options.isMember !== false;
  if (!isMember) return emptyPermissions();
  const r = normalizeRole(role);
  const isSuper = r === ROLES.SUPER_ADMIN;
  const isAdmin = r === ROLES.ADMIN;
  const canManage = isSuper || isAdmin;
  const grants = options && options.grants;
  return {
    canEditTeamProfile: canManage,
    canInviteMember: canManage,
    canCreateTeamMatch: canManage,
    canManageAdmins: isSuper,
    canTransferSuperAdmin: isSuper,
    canSetCaptain: isSuper,
    canRemoveMember: isSuper,
    canRemoveOrdinaryMember: canManage,
    canReviewJoinRequests: canReviewTeamApplication(r, grants),
    canShareTeam: true
  };
}

function canOpenMemberManageMenu(permissions) {
  const p = permissions && typeof permissions === 'object' ? permissions : {};
  return !!(
    p.canInviteMember ||
    p.canManageAdmins ||
    p.canSetCaptain ||
    p.canTransferSuperAdmin ||
    p.canRemoveMember ||
    p.canRemoveOrdinaryMember
  );
}

const MANAGE_ACTION_META = {
  invite_member: {
    key: 'invite_member',
    label: '添加球队成员',
    title: '添加球队成员',
    needsMemberPick: false
  },
  set_admin: {
    key: 'set_admin',
    label: '设置管理员',
    title: '设置管理员',
    pickTitle: '选择要设为管理员的成员',
    emptyText: '没有可设为管理员的普通成员',
    confirmTitle: '设置管理员',
    confirmHint: '将「{name}」设为管理员？',
    needsMemberPick: true
  },
  unset_admin: {
    key: 'unset_admin',
    label: '取消管理员',
    title: '取消管理员',
    pickTitle: '选择要取消管理员的成员',
    emptyText: '当前没有管理员',
    confirmTitle: '取消管理员',
    confirmHint: '取消「{name}」的管理员身份？',
    needsMemberPick: true
  },
  set_captain: {
    key: 'set_captain',
    label: '设置队长',
    title: '设置队长',
    pickTitle: '选择新的队长',
    emptyText: '没有可设为队长的成员',
    confirmTitle: '设置队长',
    confirmHint: '将「{name}」设为队长？更换后原队长标签将自动取消。',
    needsMemberPick: true
  },
  unset_captain: {
    key: 'unset_captain',
    label: '取消队长',
    title: '取消队长',
    pickTitle: '选择要取消队长身份的成员',
    emptyText: '当前没有队长',
    confirmTitle: '取消队长',
    confirmHint: '取消「{name}」的队长身份？',
    needsMemberPick: true
  },
  transfer_super: {
    key: 'transfer_super',
    label: '转让超级管理员',
    title: '转让超级管理员',
    pickTitle: '选择新的超级管理员',
    emptyText: '没有可转让的成员',
    confirmTitle: '转让超级管理员',
    confirmHint: '将超级管理员转让给「{name}」？你将变为管理员，双方队长标签不变。',
    needsMemberPick: true
  },
  remove: {
    key: 'remove',
    label: '移出球队',
    title: '移出球队',
    pickTitle: '选择要移出的成员',
    emptyText: '没有可移出的成员',
    confirmTitle: '移出球队',
    confirmHint: '确定将「{name}」移出球队？',
    needsMemberPick: true
  }
};

function getManageActionMeta(action) {
  const key = String(action || '').trim();
  return MANAGE_ACTION_META[key] || null;
}

function fillConfirmHint(action, name) {
  const meta = getManageActionMeta(action);
  const hint = (meta && meta.confirmHint) || '';
  return hint.replace('{name}', name || '该成员');
}

/**
 * 底部管理菜单：先选功能。显隐只看 permissions，不看 captain。
 */
function buildManageMenuItems(permissions) {
  const p = permissions && typeof permissions === 'object' ? permissions : {};
  const items = [];
  const push = function (key) {
    const meta = MANAGE_ACTION_META[key];
    if (!meta) return;
    items.push({
      key: meta.key,
      label: meta.label,
      badge: '',
      needsMemberPick: !!meta.needsMemberPick
    });
  };
  if (p.canInviteMember) push('invite_member');
  if (p.canManageAdmins) {
    push('set_admin');
    push('unset_admin');
  }
  if (p.canSetCaptain) {
    push('set_captain');
    push('unset_captain');
  }
  if (p.canTransferSuperAdmin) push('transfer_super');
  if (p.canRemoveMember || p.canRemoveOrdinaryMember) push('remove');
  return items;
}

function isActiveMember(row) {
  return String((row && row.status) || 'active') === 'active';
}

/**
 * 选成员页过滤：只保留当前操作允许的目标。
 */
function filterMembersForAction(members, action, actorUserId, permissions) {
  const perm = permissions && typeof permissions === 'object' ? permissions : {};
  const actor = String(actorUserId || '').trim();
  const key = String(action || '').trim();
  const list = (members || []).filter(isActiveMember);
  const notSelf = function (m) {
    const uid = String((m && (m.userId || m.id)) || '').trim();
    return !actor || !uid || uid !== actor;
  };
  if (key === 'set_admin') {
    if (!perm.canManageAdmins) return [];
    return list.filter(function (m) {
      return notSelf(m) && normalizeRole(m.role) === ROLES.MEMBER;
    });
  }
  if (key === 'unset_admin') {
    if (!perm.canManageAdmins) return [];
    return list.filter(function (m) {
      return notSelf(m) && normalizeRole(m.role) === ROLES.ADMIN;
    });
  }
  if (key === 'set_captain') {
    if (!perm.canSetCaptain) return [];
    return list.filter(function (m) {
      return !isCaptain(m);
    });
  }
  if (key === 'unset_captain') {
    if (!perm.canSetCaptain) return [];
    return list.filter(function (m) {
      return isCaptain(m);
    });
  }
  if (key === 'transfer_super') {
    if (!perm.canTransferSuperAdmin) return [];
    return list.filter(function (m) {
      return notSelf(m) && normalizeRole(m.role) !== ROLES.SUPER_ADMIN;
    });
  }
  if (key === 'remove') {
    return list.filter(function (m) {
      if (!notSelf(m)) return false;
      const role = normalizeRole(m.role);
      if (role === ROLES.SUPER_ADMIN) return false;
      if (perm.canRemoveMember) return true;
      return !!(perm.canRemoveOrdinaryMember && role === ROLES.MEMBER);
    });
  }
  return [];
}

function canPerformMemberAction(permissions, actorUserId, action, target) {
  if (!target) return false;
  return filterMembersForAction([target], action, actorUserId, permissions).length > 0;
}

function roleLabel(role) {
  return ROLE_LABELS[normalizeRole(role)] || ROLE_LABELS.member;
}

function tagLabel(tag) {
  const t = String(tag || '')
    .trim()
    .toLowerCase();
  return TAG_LABELS[t] || '';
}

/**
 * 展示用徽章：管理角色与队长标签分开展示。
 * member 且非队长时不打「成员」章，避免列表噪音。
 */
function buildBadges(role, tags) {
  const badges = [];
  const r = normalizeRole(role);
  if (r === ROLES.SUPER_ADMIN) {
    badges.push({ key: 'super_admin', kind: 'role', label: ROLE_LABELS.super_admin });
  } else if (r === ROLES.ADMIN) {
    badges.push({ key: 'admin', kind: 'role', label: ROLE_LABELS.admin });
  }
  if (isCaptain(tags)) {
    badges.push({ key: 'captain', kind: 'tag', label: TAG_LABELS.captain });
  }
  return badges;
}

function _cloneMembers(members) {
  if (!Array.isArray(members)) return [];
  return members.map(function (m) {
    const row = m && typeof m === 'object' ? m : {};
    return Object.assign({}, row, {
      role: normalizeRole(row.role),
      tags: normalizeTags(row.tags)
    });
  });
}

function _matchUser(member, userId) {
  const uid = String(userId || '').trim();
  if (!uid || !member) return false;
  return (
    String(member.userId || '').trim() === uid ||
    String(member.id || '').trim() === uid
  );
}

/**
 * 转让超级管理员：仅改双方 role。
 * - 原 super_admin → admin
 * - 新成员 → super_admin
 * - 双方 captain 标签不变
 */
function transferSuperAdmin(members, fromUserId, toUserId) {
  const fromId = String(fromUserId || '').trim();
  const toId = String(toUserId || '').trim();
  const list = _cloneMembers(members);
  if (!fromId || !toId || fromId === toId) {
    return { ok: false, reason: 'invalid_user', members: list };
  }
  let from = null;
  let to = null;
  for (let i = 0; i < list.length; i++) {
    if (_matchUser(list[i], fromId)) from = list[i];
    if (_matchUser(list[i], toId)) to = list[i];
  }
  if (!from || normalizeRole(from.role) !== ROLES.SUPER_ADMIN) {
    return { ok: false, reason: 'from_not_super_admin', members: list };
  }
  if (!to || String(to.status || 'active') !== 'active') {
    return { ok: false, reason: 'to_not_active_member', members: list };
  }
  const fromTags = from.tags.slice();
  const toTags = to.tags.slice();
  from.role = ROLES.ADMIN;
  to.role = ROLES.SUPER_ADMIN;
  from.tags = fromTags;
  to.tags = toTags;
  return { ok: true, members: list };
}

/**
 * 第一版：每队仅一名队长。更换时原队长标签自动取消。
 * 不改变任何人的 role。
 */
function assignCaptain(members, newCaptainUserId) {
  const uid = String(newCaptainUserId || '').trim();
  const list = _cloneMembers(members);
  if (!uid) return { ok: false, reason: 'invalid_user', members: list };
  let found = false;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    const tags = normalizeTags(m.tags).filter(function (t) {
      return t !== TAGS.CAPTAIN;
    });
    if (_matchUser(m, uid)) {
      if (String(m.status || 'active') !== 'active') {
        return { ok: false, reason: 'to_not_active_member', members: _cloneMembers(members) };
      }
      tags.push(TAGS.CAPTAIN);
      found = true;
    }
    m.tags = tags;
  }
  if (!found) return { ok: false, reason: 'member_not_found', members: _cloneMembers(members) };
  return { ok: true, members: list };
}

function clearCaptain(members, userId) {
  const uid = String(userId || '').trim();
  const list = _cloneMembers(members);
  if (!uid) return { ok: false, reason: 'invalid_user', members: list };
  let found = false;
  for (let i = 0; i < list.length; i++) {
    if (!_matchUser(list[i], uid)) continue;
    found = true;
    list[i].tags = normalizeTags(list[i].tags).filter(function (t) {
      return t !== TAGS.CAPTAIN;
    });
  }
  if (!found) return { ok: false, reason: 'member_not_found', members: list };
  return { ok: true, members: list };
}

function removeMember(members, userId) {
  const uid = String(userId || '').trim();
  const list = _cloneMembers(members);
  if (!uid) return { ok: false, reason: 'invalid_user', members: list };
  let target = null;
  for (let i = 0; i < list.length; i++) {
    if (_matchUser(list[i], uid)) {
      target = list[i];
      break;
    }
  }
  if (!target) return { ok: false, reason: 'member_not_found', members: list };
  if (normalizeRole(target.role) === ROLES.SUPER_ADMIN) {
    return { ok: false, reason: 'cannot_remove_super_admin', members: list };
  }
  return {
    ok: true,
    members: list.filter(function (m) {
      return !_matchUser(m, uid);
    })
  };
}

/**
 * 针对单个成员仍可用的操作（与选人过滤同一规则）。
 */
function buildMemberManageActions(permissions, actorUserId, target) {
  if (!target) return [];
  const keys = ['set_admin', 'unset_admin', 'set_captain', 'unset_captain', 'transfer_super', 'remove'];
  const actions = [];
  for (let i = 0; i < keys.length; i++) {
    if (!canPerformMemberAction(permissions, actorUserId, keys[i], target)) continue;
    const meta = MANAGE_ACTION_META[keys[i]];
    if (meta) actions.push({ key: meta.key, label: meta.label });
  }
  return actions;
}

function setAdminRole(members, userId, makeAdmin) {
  const uid = String(userId || '').trim();
  const list = _cloneMembers(members);
  if (!uid) return { ok: false, reason: 'invalid_user', members: list };
  let found = false;
  for (let i = 0; i < list.length; i++) {
    if (!_matchUser(list[i], uid)) continue;
    found = true;
    if (normalizeRole(list[i].role) === ROLES.SUPER_ADMIN) {
      return { ok: false, reason: 'cannot_change_super_admin', members: list };
    }
    list[i].role = makeAdmin ? ROLES.ADMIN : ROLES.MEMBER;
  }
  if (!found) return { ok: false, reason: 'member_not_found', members: list };
  return { ok: true, members: list };
}

module.exports = {
  ROLES,
  TAGS,
  ROLE_LABELS,
  TAG_LABELS,
  MANAGE_ACTION_META,
  PERMISSION_KEYS,
  normalizeRole,
  normalizeTags,
  normalizeGrants,
  hasGrant,
  hasTag,
  isCaptain,
  canReviewTeamApplication,
  emptyPermissions,
  derivePermissions,
  canOpenMemberManageMenu,
  getManageActionMeta,
  fillConfirmHint,
  buildManageMenuItems,
  filterMembersForAction,
  canPerformMemberAction,
  roleLabel,
  tagLabel,
  buildBadges,
  transferSuperAdmin,
  assignCaptain,
  clearCaptain,
  removeMember,
  setAdminRole,
  buildMemberManageActions
};
