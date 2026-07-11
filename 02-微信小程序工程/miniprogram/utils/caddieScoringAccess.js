/**
 * 本场球童记分员授权（扫码获得 manage_scoring）
 * 扫码成功后写入 match.tempAdmins（source: caddie_qr），权限仅 manage_scoring。
 */

const tempAdminPermission = require('./tempAdminPermission.js');
const mockAvatars = require('./mockAvatars.js');

function _randToken() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 8)
  );
}

function buildCaddiePagePath(opts) {
  const o = opts || {};
  const token = String(o.token || '').trim();
  if (!token) return '';
  if (o.source === 'game' || o.gameId) {
    const gameId = String(o.gameId || o.matchId || '').trim();
    return (
      'pages/game/hub/index?gameId=' +
      encodeURIComponent(gameId) +
      '&caddieToken=' +
      encodeURIComponent(token)
    );
  }
  const matchId = String(o.matchId || '').trim();
  return (
    'pages/tournament/detail/index?matchId=' +
    encodeURIComponent(matchId) +
    '&caddieToken=' +
    encodeURIComponent(token)
  );
}

function buildQrImageUrl(pagePath) {
  const data = String(pagePath || '').trim();
  if (!data) return '';
  return (
    'https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=' +
    encodeURIComponent(data) +
    '&color=000000&bgcolor=ffffff'
  );
}

function createCaddieScoringAccess(opts) {
  const o = opts || {};
  const token = _randToken();
  const accessId = 'caddie_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const pagePath = buildCaddiePagePath({
    source: o.source,
    matchId: o.matchId,
    gameId: o.gameId,
    token: token
  });
  return {
    accessId: accessId,
    token: token,
    pagePath: pagePath,
    qrCodeUrl: buildQrImageUrl(pagePath),
    createdAt: Date.now(),
    createdBy: String(o.createdBy || '').trim(),
    enabled: true,
    claimedBy: []
  };
}

function normalizeCaddieScoringAccess(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const token = String(raw.token || '').trim();
  if (!token) return null;
  const claimedBy = Array.isArray(raw.claimedBy)
    ? raw.claimedBy.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const pagePath = String(raw.pagePath || '').trim();
  const qrCodeUrl =
    String(raw.qrCodeUrl || '').trim() || (pagePath ? buildQrImageUrl(pagePath) : '');
  return {
    accessId: String(raw.accessId || '').trim() || ('caddie_' + Date.now()),
    token: token,
    pagePath: pagePath,
    qrCodeUrl: qrCodeUrl,
    createdAt: raw.createdAt != null ? Number(raw.createdAt) || 0 : 0,
    createdBy: String(raw.createdBy || '').trim(),
    enabled: raw.enabled !== false,
    claimedBy: claimedBy
  };
}

function _entryUserId(raw) {
  if (!raw || typeof raw !== 'object') return '';
  return String(raw.userId || raw.playerId || raw.id || '').trim();
}

function _hasManageScoring(permissions) {
  const list = Array.isArray(permissions) ? permissions : [];
  return list.some((p) => tempAdminPermission.isScoringCapabilityPermission(p));
}

/** 是否应出现在「球童记分员」列表 */
function isCaddieScorerEntry(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if (!_hasManageScoring(raw.permissions)) return false;
  const source = String(raw.source || '').trim();
  if (source === 'caddie_qr') return true;
  if (String(raw.role || '').trim() === 'caddie') return true;
  return false;
}

/** 临时管理员区块：排除球童扫码来源（及兼容 role=caddie） */
function filterNonCaddieTempAdmins(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((raw) => {
    if (!raw) return false;
    const source = String(raw.source || '').trim();
    if (source === 'caddie_qr') return false;
    if (String(raw.role || '').trim() === 'caddie') return false;
    return true;
  });
}

/**
 * 从 tempAdmins 筛选已扫码球童记分员（供权限页回显）
 */
function listCaddieScorers(tempAdmins) {
  if (!Array.isArray(tempAdmins)) return [];
  const out = [];
  const seen = {};
  tempAdmins.forEach((raw) => {
    if (!isCaddieScorerEntry(raw)) return;
    const userId = _entryUserId(raw);
    if (!userId || seen[userId]) return;
    seen[userId] = true;
    const nickname = String(
      raw.nickname || raw.name || raw.competitionName || raw.displayName || ''
    ).trim();
    out.push({
      userId: userId,
      nickname: nickname || userId,
      avatar: mockAvatars.resolveAvatar(raw.avatar || raw.avatarUrl || '', userId),
      source: String(raw.source || '').trim() || 'caddie_qr',
      role: String(raw.role || '').trim(),
      permissions: Array.isArray(raw.permissions) ? raw.permissions.slice() : ['manage_scoring']
    });
  });
  return out;
}

/**
 * 扫码成功：写入 / 补充 tempAdmins（仅 manage_scoring，不覆盖其它权限）
 */
function upsertCaddieTempAdmin(matchOrGame, profile, access) {
  if (!matchOrGame || typeof matchOrGame !== 'object') return null;
  const p = profile || {};
  const uid = String(p.userId || '').trim();
  const phone = String(p.phone || '').trim();
  if (!uid) return null;
  // 无手机号不允许写入球童记分员
  if (!phone) return null;
  if (!Array.isArray(matchOrGame.tempAdmins)) matchOrGame.tempAdmins = [];

  const nickname =
    String(
      p.nickname || p.name || p.competitionName || p.displayName || ''
    ).trim() || '微信用户';
  const avatarRaw = p.avatar != null ? p.avatar : p.avatarUrl;
  const avatar = mockAvatars.resolveAvatar(avatarRaw || '', uid);
  const addedBy =
    access && access.createdBy != null ? String(access.createdBy).trim() : '';

  const idx = matchOrGame.tempAdmins.findIndex((a) => _entryUserId(a) === uid);
  if (idx >= 0) {
    const existing = matchOrGame.tempAdmins[idx] || {};
    const normalized = tempAdminPermission.normalizeTempAdmin(existing) || {};
    const perms = (normalized.permissions || []).slice();
    if (perms.indexOf('manage_scoring') < 0) perms.push('manage_scoring');
    const prevSource = String(existing.source || normalized.source || '').trim();
    const mergedPhone = phone || String(existing.phone || '').trim();
    const next = {
      userId: uid,
      phone: mergedPhone,
      nickname: normalized.nickname || nickname,
      avatar: normalized.avatar || avatar,
      permissions: perms,
      // 已是管理员二维码来源时保留 admin_qr，并标记球童角色以便两边列表都能展示
      source: prevSource === 'admin_qr' ? 'admin_qr' : prevSource || 'caddie_qr',
      status: 'approved',
      addedBy: normalized.addedBy || addedBy,
      addedAt: normalized.addedAt || Date.now()
    };
    if (prevSource === 'admin_qr' || existing.role || normalized.role) {
      next.role =
        prevSource === 'admin_qr'
          ? 'caddie'
          : String(existing.role || normalized.role || '').trim();
    }
    matchOrGame.tempAdmins[idx] = next;
    return next;
  }

  const created = {
    userId: uid,
    phone: phone,
    nickname: nickname,
    avatar: avatar,
    permissions: ['manage_scoring'],
    source: 'caddie_qr',
    status: 'approved',
    addedBy: addedBy,
    addedAt: Date.now()
  };
  matchOrGame.tempAdmins.push(created);
  return created;
}

/**
 * 移除球童本场 manage_scoring。
 * - 只删记分权限，不碰其它权限
 * - source===caddie_qr 且权限清空时删除整条
 * - 同步从 claimedBy 去掉 userId
 */
function removeCaddieScoringPermission(matchOrGame, userId) {
  if (!matchOrGame || typeof matchOrGame !== 'object') {
    return { ok: false, reason: 'no_match' };
  }
  const uid = String(userId || '').trim();
  if (!uid) return { ok: false, reason: 'no_user' };
  if (!Array.isArray(matchOrGame.tempAdmins)) {
    return { ok: false, reason: 'not_found' };
  }

  const idx = matchOrGame.tempAdmins.findIndex((a) => _entryUserId(a) === uid);
  if (idx < 0) return { ok: false, reason: 'not_found' };

  const existing = matchOrGame.tempAdmins[idx] || {};
  const normalized = tempAdminPermission.normalizeTempAdmin(existing);
  if (!normalized) return { ok: false, reason: 'not_found' };

  const nextPerms = (normalized.permissions || []).filter(
    (p) => !tempAdminPermission.isScoringCapabilityPermission(p)
  );
  const source = String(existing.source || normalized.source || '').trim();

  if (source === 'caddie_qr' && nextPerms.length === 0) {
    matchOrGame.tempAdmins.splice(idx, 1);
  } else {
    const next = {
      userId: normalized.userId,
      nickname: normalized.nickname,
      avatar: normalized.avatar,
      permissions: nextPerms,
      source: source || normalized.source || '',
      addedBy: normalized.addedBy || '',
      addedAt: normalized.addedAt || Date.now()
    };
    if (existing.role || normalized.role) {
      next.role = String(existing.role || normalized.role || '').trim();
    }
    matchOrGame.tempAdmins[idx] = next;
  }

  const access = normalizeCaddieScoringAccess(matchOrGame.caddieScoringAccess);
  if (access) {
    access.claimedBy = access.claimedBy.filter((id) => id !== uid);
    matchOrGame.caddieScoringAccess = access;
  }

  return { ok: true };
}

/**
 * 保存临时管理员草稿时，合并保留球童扫码条目（避免被草稿覆盖删除）
 */
function mergeTempAdminsPreservingCaddies(draftList, existingTempAdmins, grantableFeatures) {
  const stripped = tempAdminPermission.stripTempAdminsForSave(draftList, grantableFeatures);
  const draftIds = {};
  stripped.forEach((a) => {
    if (a && a.userId) draftIds[String(a.userId)] = true;
  });
  const preserved = [];
  (Array.isArray(existingTempAdmins) ? existingTempAdmins : []).forEach((raw) => {
    const uid = _entryUserId(raw);
    if (!uid || draftIds[uid]) return;
    const source = String(raw.source || '').trim();
    const role = String(raw.role || '').trim();
    if (source !== 'caddie_qr' && role !== 'caddie') return;
    const normalized = tempAdminPermission.normalizeTempAdmin(raw);
    if (!normalized) return;
    const item = {
      userId: normalized.userId,
      nickname: normalized.nickname,
      avatar: normalized.avatar,
      permissions: normalized.permissions,
      source: source || 'caddie_qr',
      addedBy: normalized.addedBy || '',
      addedAt: normalized.addedAt || Date.now()
    };
    if (role) item.role = role;
    preserved.push(item);
  });
  return stripped.concat(preserved);
}

function hasCaddieScoringAccess(matchOrGame, userId) {
  const uid = String(userId || '').trim();
  if (!uid || !matchOrGame) return false;
  const list = Array.isArray(matchOrGame.tempAdmins) ? matchOrGame.tempAdmins : [];
  if (list.some((a) => _entryUserId(a) === uid && isCaddieScorerEntry(a))) {
    return true;
  }
  const access = normalizeCaddieScoringAccess(matchOrGame.caddieScoringAccess);
  if (!access || !access.enabled) return false;
  return access.claimedBy.indexOf(uid) >= 0;
}

/**
 * 是否可为本场任意球员记分：
 * - 临时管理员 manage_scoring
 * - 或球童扫码领取成功
 */
function canManageScoring(matchOrGame, userId) {
  if (tempAdminPermission.hasTempAdminPermission(matchOrGame, userId, 'manage_scoring')) {
    return true;
  }
  return hasCaddieScoringAccess(matchOrGame, userId);
}

/**
 * 球童扫码领取本场记分权限，并写入 tempAdmins。
 * @param {object} [userProfile] nickname / avatar / name
 * @returns {{ ok: boolean, reason?: string, already?: boolean, access?: object, admin?: object }}
 */
function claimCaddieScoringAccess(matchOrGame, token, userId, userProfile) {
  if (!matchOrGame || typeof matchOrGame !== 'object') {
    return { ok: false, reason: 'no_match' };
  }
  const uid = String(userId || '').trim();
  const tok = String(token || '').trim();
  if (!uid) return { ok: false, reason: 'no_user' };
  if (!tok) return { ok: false, reason: 'no_token' };

  const access = normalizeCaddieScoringAccess(matchOrGame.caddieScoringAccess);
  if (!access || !access.enabled) return { ok: false, reason: 'disabled' };
  if (access.token !== tok) return { ok: false, reason: 'invalid_token' };

  const profile = Object.assign({}, userProfile || {}, { userId: uid });
  if (!String(profile.phone || '').trim()) {
    return { ok: false, reason: 'no_phone' };
  }

  const already = access.claimedBy.indexOf(uid) >= 0;
  if (!already) {
    access.claimedBy = access.claimedBy.concat([uid]);
  }
  matchOrGame.caddieScoringAccess = access;
  const admin = upsertCaddieTempAdmin(matchOrGame, profile, access);
  if (!admin) return { ok: false, reason: 'no_phone' };
  return { ok: true, already: already, access: access, admin: admin };
}

module.exports = {
  createCaddieScoringAccess,
  normalizeCaddieScoringAccess,
  buildCaddiePagePath,
  buildQrImageUrl,
  hasCaddieScoringAccess,
  canManageScoring,
  claimCaddieScoringAccess,
  upsertCaddieTempAdmin,
  listCaddieScorers,
  isCaddieScorerEntry,
  filterNonCaddieTempAdmins,
  removeCaddieScoringPermission,
  mergeTempAdminsPreservingCaddies
};
