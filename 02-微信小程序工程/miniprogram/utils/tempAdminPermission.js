/**
 * 本场 GAME 临时管理员权限
 * 权限项主要复用 M 面板「赛事管理」功能；
 * 额外稳定项：分组管理 manage_groups、记分权限 manage_scoring。
 */

/** 不可再授权给临时管理员（第一版不允许临时管理员管理权限） */
const TEMP_ADMIN_EXCLUDED_PERMISSIONS = {
  permission_management: true
};

/**
 * 分组能力等价 permission（展示时合并为「分组管理」manage_groups）
 */
const GROUP_CAPABILITY_PERMISSIONS = {
  manage_groups: true,
  start_grouping: true,
  edit_groups: true,
  group_management: true
};

/**
 * 记分能力等价 permission（展示为「记分权限」manage_scoring）
 * 拥有 manage_scoring 时可为本场任意参赛球员记分。
 */
const SCORING_CAPABILITY_PERMISSIONS = {
  manage_scoring: true,
  score: true,
  scoring: true,
  edit_score: true,
  manage_scorecard: true,
  score_players: true
};

const MANAGE_GROUPS_FEATURE = {
  key: 'manage_groups',
  label: '分组管理',
  tone: ''
};

const MANAGE_SCORING_FEATURE = {
  key: 'manage_scoring',
  label: '记分权限',
  tone: ''
};

const MANAGE_PAYMENT_FEATURE = {
  key: 'manage_payment',
  label: '收费管理',
  tone: ''
};

/**
 * 添加临时管理员时的默认勾选（须出现在可授权列表中）
 * 分组管理 + 记分权限必选默认；出发管理若存在则一并默认。
 * 出发管理能力等价 permission（展示 / 校验统一为 manage_tee_sheet，兼容历史 tee_management）
 */
const TEE_SHEET_CAPABILITY_PERMISSIONS = {
  manage_tee_sheet: true,
  tee_management: true
};

const PREFERRED_DEFAULT_PERMISSIONS = [
  'manage_groups',
  'manage_scoring',
  'manage_tee_sheet'
];

/** 始终保留在可授权列表、且 normalize 始终允许的稳定权限 */
const STABLE_EXTRA_PERMISSIONS = {
  manage_groups: true,
  manage_scoring: true,
  manage_payment: true
};

function isGroupCapabilityPermission(permission) {
  return !!GROUP_CAPABILITY_PERMISSIONS[String(permission || '').trim()];
}

function isScoringCapabilityPermission(permission) {
  return !!SCORING_CAPABILITY_PERMISSIONS[String(permission || '').trim()];
}

function isTeeSheetCapabilityPermission(permission) {
  return !!TEE_SHEET_CAPABILITY_PERMISSIONS[String(permission || '').trim()];
}

function isDangerOrLifecyclePermission(feature) {
  if (!feature) return false;
  const key = String(feature.key || feature.permission || '').trim();
  const tone = String(feature.tone || '');
  if (tone === 'danger' || tone === 'warning') return true;
  return key === 'cancel_match' || key === 'start_match' || key === 'finish_match';
}

function _insertBeforeDanger(out, insertAt, feature) {
  let at = insertAt;
  if (at < 0 || at > out.length) at = out.length;
  const dangerIdx = out.findIndex((item) => isDangerOrLifecyclePermission(item));
  if (dangerIdx >= 0 && at > dangerIdx) at = dangerIdx;
  out.splice(at, 0, {
    key: feature.key,
    label: feature.label,
    tone: feature.tone || ''
  });
  return at;
}

/**
 * 从 M 面板管理功能生成可授权项：
 * 1. 保持 M 面板顺序
 * 2. 排除 permission_management
 * 3. 分组等价项合并为唯一「分组管理」
 * 4. 额外稳定插入「记分权限」（紧跟分组管理之后）
 * 5. 若无分组入口，分组管理插在修改半场之后、出发管理之前
 */
function buildGrantableFeatures(featureList) {
  const list = Array.isArray(featureList) ? featureList : [];
  const out = [];
  const seen = {};

  list.forEach((f) => {
    if (!f || f.empty) return;
    const key = String(f.permission || '').trim();
    if (!key || TEMP_ADMIN_EXCLUDED_PERMISSIONS[key] || seen[key]) return;

    // 记分相关 M 面板项（若有）折叠进 manage_scoring，稍后统一插入位置
    if (isScoringCapabilityPermission(key)) {
      seen.manage_scoring = true; // 标记存在，位置仍由统一插入控制
      return;
    }

    if (isGroupCapabilityPermission(key)) {
      if (!seen.manage_groups) {
        seen.manage_groups = true;
        out.push({
          key: MANAGE_GROUPS_FEATURE.key,
          label: MANAGE_GROUPS_FEATURE.label,
          tone: MANAGE_GROUPS_FEATURE.tone
        });
      }
      return;
    }

    // 出发管理：历史 tee_management 合并为 manage_tee_sheet
    if (isTeeSheetCapabilityPermission(key)) {
      if (!seen.manage_tee_sheet) {
        seen.manage_tee_sheet = true;
        out.push({
          key: 'manage_tee_sheet',
          label: f.label != null ? String(f.label) : '出发管理',
          tone: f.tone ? String(f.tone) : ''
        });
      }
      return;
    }

    seen[key] = true;
    out.push({
      key: key,
      label: f.label != null ? String(f.label) : key,
      tone: f.tone ? String(f.tone) : ''
    });
  });

  // 确保「分组管理」存在且位置合理
  let groupsIdx = out.findIndex((item) => item.key === 'manage_groups');
  if (groupsIdx < 0) {
    let insertAt = out.length;
    const afterHalf = out.findIndex((item) => item.key === 'edit_half');
    const beforeTee = out.findIndex((item) => item.key === 'manage_tee_sheet');
    if (beforeTee >= 0) insertAt = beforeTee;
    else if (afterHalf >= 0) insertAt = afterHalf + 1;
    groupsIdx = _insertBeforeDanger(out, insertAt, MANAGE_GROUPS_FEATURE);
    seen.manage_groups = true;
  }

  // 「记分权限」紧跟「分组管理」之后（避开危险操作区）
  const scoringIdx = out.findIndex((item) => item.key === 'manage_scoring');
  if (scoringIdx < 0) {
    _insertBeforeDanger(out, groupsIdx + 1, MANAGE_SCORING_FEATURE);
    seen.manage_scoring = true;
  }

  if (!seen.manage_payment && out.every((item) => item.key !== 'manage_payment')) {
    const afterPlayers = out.findIndex((item) => item.key === 'manage_players');
    const afterTee = out.findIndex((item) => item.key === 'manage_tee_sheet');
    _insertBeforeDanger(out, Math.max(afterPlayers, afterTee) + 1, MANAGE_PAYMENT_FEATURE);
    seen.manage_payment = true;
  }

  return out;
}

function resolveDefaultPermissions(grantableFeatures) {
  const grantable = Array.isArray(grantableFeatures) ? grantableFeatures : [];
  const allowed = {};
  grantable.forEach((f) => {
    if (f && f.key) allowed[f.key] = true;
  });
  const defaults = PREFERRED_DEFAULT_PERMISSIONS.filter(
    (k) => STABLE_EXTRA_PERMISSIONS[k] || !!allowed[k]
  );
  if (defaults.indexOf('manage_groups') < 0) defaults.unshift('manage_groups');
  if (defaults.indexOf('manage_scoring') < 0) {
    const gi = defaults.indexOf('manage_groups');
    defaults.splice(gi >= 0 ? gi + 1 : 0, 0, 'manage_scoring');
  }
  return defaults;
}

function _allowedKeySet(grantableFeatures) {
  const set = {};
  (grantableFeatures || []).forEach((f) => {
    if (f && f.key) set[f.key] = true;
  });
  return set;
}

/**
 * 规范化 permissions：
 * - 分组等价项折叠为 manage_groups
 * - 记分等价项折叠为 manage_scoring
 * - manage_groups / manage_scoring 始终允许写入
 */
function normalizePermissionList(list, grantableFeatures) {
  const src = Array.isArray(list) ? list : [];
  const allowed =
    grantableFeatures && grantableFeatures.length
      ? _allowedKeySet(grantableFeatures)
      : null;
  const out = [];
  const seen = {};
  let needManageGroups = false;
  let needManageScoring = false;
  let needManageTeeSheet = false;

  src.forEach((raw) => {
    const key = String(raw || '').trim();
    if (!key || TEMP_ADMIN_EXCLUDED_PERMISSIONS[key]) return;
    if (isGroupCapabilityPermission(key)) {
      needManageGroups = true;
      return;
    }
    if (isScoringCapabilityPermission(key)) {
      needManageScoring = true;
      return;
    }
    if (isTeeSheetCapabilityPermission(key)) {
      needManageTeeSheet = true;
      return;
    }
    if (allowed && !allowed[key] && !STABLE_EXTRA_PERMISSIONS[key]) return;
    if (seen[key]) return;
    seen[key] = true;
    out.push(key);
  });

  if (needManageGroups && !seen.manage_groups) {
    if (!allowed || allowed.manage_groups || STABLE_EXTRA_PERMISSIONS.manage_groups) {
      out.push('manage_groups');
      seen.manage_groups = true;
    }
  }

  if (needManageScoring && !seen.manage_scoring) {
    if (!allowed || allowed.manage_scoring || STABLE_EXTRA_PERMISSIONS.manage_scoring) {
      out.push('manage_scoring');
      seen.manage_scoring = true;
    }
  }

  if (needManageTeeSheet && !seen.manage_tee_sheet) {
    if (!allowed || allowed.manage_tee_sheet || allowed.tee_management) {
      out.push('manage_tee_sheet');
      seen.manage_tee_sheet = true;
    }
  }

  return out;
}

function normalizeTempAdmin(raw, fallbackAddedBy, grantableFeatures) {
  if (!raw || typeof raw !== 'object') return null;
  const userId = String(raw.userId || raw.playerId || raw.id || '').trim();
  if (!userId) return null;
  const nickname = String(
    raw.nickname || raw.name || raw.competitionName || raw.displayName || ''
  ).trim();
  const out = {
    userId: userId,
    nickname: nickname || userId,
    avatar: raw.avatar != null ? String(raw.avatar) : '',
    permissions: normalizePermissionList(raw.permissions, grantableFeatures),
    addedBy: String(raw.addedBy || fallbackAddedBy || '').trim(),
    addedAt: raw.addedAt != null ? Number(raw.addedAt) || Date.now() : Date.now()
  };
  const phone = String(raw.phone || '').trim();
  if (phone) out.phone = phone;
  const source = String(raw.source || '').trim();
  if (source) out.source = source;
  const role = String(raw.role || '').trim();
  if (role) out.role = role;
  const status = String(raw.status || '').trim();
  if (status) out.status = status;
  // 球童记分可选组范围：缺失/空 = 全场；有值则保留
  const groupId = raw.groupId != null ? String(raw.groupId).trim() : '';
  if (groupId) out.groupId = groupId;
  return out;
}

function cloneTempAdmins(list, grantableFeatures) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = {};
  list.forEach((item) => {
    const normalized = normalizeTempAdmin(item, '', grantableFeatures);
    if (!normalized || seen[normalized.userId]) return;
    seen[normalized.userId] = true;
    out.push(normalized);
  });
  return out;
}

/** 列表展示用：permissionOptions 来自可授权功能（含 selected / tone） */
function enrichTempAdminsForView(list, grantableFeatures) {
  const options = Array.isArray(grantableFeatures) ? grantableFeatures : [];
  return cloneTempAdmins(list, options).map((admin) => {
    const set = {};
    (admin.permissions || []).forEach((k) => {
      set[k] = true;
    });
    return Object.assign({}, admin, {
      permissionOptions: options.map((d) => ({
        key: d.key,
        label: d.label,
        tone: d.tone || '',
        selected: !!set[d.key]
      }))
    });
  });
}

function stripTempAdminsForSave(list, grantableFeatures) {
  return cloneTempAdmins(list, grantableFeatures).map((admin) => {
    const item = {
      userId: admin.userId,
      nickname: admin.nickname,
      avatar: admin.avatar,
      permissions: normalizePermissionList(admin.permissions, grantableFeatures),
      addedBy: admin.addedBy || '',
      addedAt: admin.addedAt || Date.now()
    };
    if (admin.phone) item.phone = String(admin.phone).trim();
    if (admin.source) item.source = String(admin.source).trim();
    if (admin.role) item.role = String(admin.role).trim();
    if (admin.status) item.status = String(admin.status).trim();
    const groupId = admin.groupId != null ? String(admin.groupId).trim() : '';
    if (groupId) item.groupId = groupId;
    return item;
  });
}

function buildTempAdminFromFriend(friend, addedBy, grantableFeatures) {
  const f = friend || {};
  const userId = String(f.userId || f.playerId || f.id || '').trim();
  if (!userId) return null;
  const mockAvatars = require('./mockAvatars.js');
  const features = Array.isArray(grantableFeatures) ? grantableFeatures : [];
  return normalizeTempAdmin(
    {
      userId: userId,
      nickname: f.nickname || f.name || f.competitionName || f.displayName || '',
      avatar: mockAvatars.resolveAvatar(f.avatar, userId),
      permissions: resolveDefaultPermissions(features),
      source: 'manual',
      addedBy: addedBy || '',
      addedAt: Date.now()
    },
    addedBy,
    features
  );
}

function _adminHasGroupCapability(permissions) {
  const list = Array.isArray(permissions) ? permissions : [];
  return list.some((p) => isGroupCapabilityPermission(p));
}

function _adminHasScoringCapability(permissions) {
  const list = Array.isArray(permissions) ? permissions : [];
  return list.some((p) => isScoringCapabilityPermission(p));
}

function _adminHasTeeSheetCapability(permissions) {
  const list = Array.isArray(permissions) ? permissions : [];
  return list.some((p) => isTeeSheetCapabilityPermission(p));
}

/**
 * 临时管理员是否拥有某功能权限。
 * - 普通项：permissions.includes(permission)
 * - 分组相关：拥有 manage_groups（或任一分组等价项）即通过
 * - 记分相关：拥有 manage_scoring（或任一记分等价项）即通过
 *   → 表示可为本场任意参赛球员记分
 * - 出发管理：拥有 manage_tee_sheet / tee_management 即通过
 */
function hasTempAdminPermission(matchOrGame, userId, permission) {
  const uid = String(userId || '').trim();
  const perm = String(permission || '').trim();
  if (!uid || !perm || !matchOrGame) return false;
  if (TEMP_ADMIN_EXCLUDED_PERMISSIONS[perm]) return false;
  const rawList = Array.isArray(matchOrGame.tempAdmins) ? matchOrGame.tempAdmins : [];
  const raw = rawList.find(
    (a) => String((a && (a.userId || a.playerId || a.id)) || '').trim() === uid
  );
  if (!raw) return false;
  // pending 或空权限：不通过（审批制）
  const status = String(raw.status || '').trim();
  const perms = Array.isArray(raw.permissions) ? raw.permissions : [];
  if (!perms.length) return false;
  if (status === 'pending') return false;
  const hit = normalizeTempAdmin(raw);
  if (!hit) return false;
  const list = hit.permissions || [];
  if (list.indexOf(perm) >= 0) return true;
  if (isGroupCapabilityPermission(perm) && _adminHasGroupCapability(list)) return true;
  if (isScoringCapabilityPermission(perm) && _adminHasScoringCapability(list)) return true;
  if (isTeeSheetCapabilityPermission(perm) && _adminHasTeeSheetCapability(list)) return true;
  return false;
}

function isTempAdmin(matchOrGame, userId) {
  const uid = String(userId || '').trim();
  if (!uid || !matchOrGame) return false;
  return cloneTempAdmins(matchOrGame.tempAdmins).some((a) => a.userId === uid);
}

module.exports = {
  TEMP_ADMIN_EXCLUDED_PERMISSIONS,
  GROUP_CAPABILITY_PERMISSIONS,
  SCORING_CAPABILITY_PERMISSIONS,
  TEE_SHEET_CAPABILITY_PERMISSIONS,
  MANAGE_GROUPS_FEATURE,
  MANAGE_SCORING_FEATURE,
  MANAGE_PAYMENT_FEATURE,
  PREFERRED_DEFAULT_PERMISSIONS,
  isGroupCapabilityPermission,
  isScoringCapabilityPermission,
  isTeeSheetCapabilityPermission,
  buildGrantableFeatures,
  resolveDefaultPermissions,
  normalizePermissionList,
  normalizeTempAdmin,
  cloneTempAdmins,
  enrichTempAdminsForView,
  stripTempAdminsForSave,
  buildTempAdminFromFriend,
  hasTempAdminPermission,
  isTempAdmin
};
