/**
 * 本场临时管理员二维码（扫码申请制）
 * 扫码后写入 tempAdmins：permissions=[]、status=pending
 * 管理者在权限管理中展开勾选并保存后才生效。
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

function buildAdminPagePath(opts) {
  const o = opts || {};
  const token = String(o.token || '').trim();
  if (!token) return '';
  if (o.source === 'game' || o.gameId) {
    const gameId = String(o.gameId || o.matchId || '').trim();
    return (
      'pages/game/hub/index?gameId=' +
      encodeURIComponent(gameId) +
      '&adminToken=' +
      encodeURIComponent(token)
    );
  }
  const matchId = String(o.matchId || '').trim();
  return (
    'pages/tournament/detail/index?matchId=' +
    encodeURIComponent(matchId) +
    '&adminToken=' +
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

function createTempAdminAccess(opts) {
  const o = opts || {};
  const token = _randToken();
  const accessId = 'admin_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const pagePath = buildAdminPagePath({
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

function normalizeTempAdminAccess(raw) {
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
    accessId: String(raw.accessId || '').trim() || ('admin_' + Date.now()),
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

function isAdminQrEntry(raw) {
  if (!raw || typeof raw !== 'object') return false;
  return String(raw.source || '').trim() === 'admin_qr';
}

function resolveAdminStatus(raw) {
  const perms = Array.isArray(raw && raw.permissions) ? raw.permissions : [];
  if (perms.length > 0) return 'approved';
  const status = String((raw && raw.status) || '').trim();
  return status === 'approved' ? 'approved' : 'pending';
}

function buildPermissionDraftOptions(grantableFeatures, selectedKeys) {
  const selected = {};
  (Array.isArray(selectedKeys) ? selectedKeys : []).forEach((k) => {
    const key = String(k || '').trim();
    if (key) selected[key] = true;
  });
  return (Array.isArray(grantableFeatures) ? grantableFeatures : []).map((f) => ({
    key: f.key,
    label: f.label,
    tone: f.tone || '',
    selected: !!selected[f.key]
  }));
}

function selectedKeysFromOptions(options) {
  return (Array.isArray(options) ? options : [])
    .filter((o) => o && o.selected && o.key)
    .map((o) => String(o.key));
}

/**
 * 已扫码临时管理员列表（草稿/展示）
 * 排序：pending 在前，同状态按 addedAt 升序
 */
function listAdminQrAdmins(tempAdmins, grantableFeatures) {
  if (!Array.isArray(tempAdmins)) return [];
  const out = [];
  const seen = {};
  tempAdmins.forEach((raw) => {
    if (!isAdminQrEntry(raw)) return;
    const userId = _entryUserId(raw);
    if (!userId || seen[userId]) return;
    seen[userId] = true;
    const normalized = tempAdminPermission.normalizeTempAdmin(
      raw,
      '',
      grantableFeatures
    );
    if (!normalized) return;
    const permissions = Array.isArray(normalized.permissions)
      ? normalized.permissions.slice()
      : [];
    const status = resolveAdminStatus({ permissions: permissions, status: raw.status });
    out.push({
      userId: normalized.userId,
      nickname: normalized.nickname,
      avatar: mockAvatars.resolveAvatar(normalized.avatar, normalized.userId),
      source: 'admin_qr',
      role: String(raw.role || normalized.role || '').trim(),
      permissions: permissions,
      status: status,
      statusLabel: status === 'approved' ? '已授权' : '待授权',
      addedBy: normalized.addedBy || '',
      addedAt: normalized.addedAt || 0,
      permissionOptions: buildPermissionDraftOptions(grantableFeatures, permissions),
      expanded: false
    });
  });
  out.sort((a, b) => {
    const ap = a.status === 'pending' ? 0 : 1;
    const bp = b.status === 'pending' ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return (a.addedAt || 0) - (b.addedAt || 0);
  });
  return out;
}

/**
 * 扫码成功：写入 pending 申请（permissions 默认 []，不覆盖已有非空权限）
 */
function upsertAdminQrTempAdmin(matchOrGame, profile, access) {
  if (!matchOrGame || typeof matchOrGame !== 'object') return null;
  const p = profile || {};
  const uid = String(p.userId || '').trim();
  const phone = String(p.phone || '').trim();
  if (!uid) return null;
  // 无手机号不允许写入临时管理员
  if (!phone) return null;
  if (!Array.isArray(matchOrGame.tempAdmins)) matchOrGame.tempAdmins = [];

  const nickname =
    String(
      p.nickname || p.name || p.competitionName || p.displayName || ''
    ).trim() || '临时管理员';
  const avatarRaw = p.avatar != null ? p.avatar : p.avatarUrl;
  const avatar = mockAvatars.resolveAvatar(avatarRaw || '', uid);
  const addedBy =
    access && access.createdBy != null ? String(access.createdBy).trim() : '';

  const idx = matchOrGame.tempAdmins.findIndex((a) => _entryUserId(a) === uid);
  if (idx >= 0) {
    const existing = matchOrGame.tempAdmins[idx] || {};
    const normalized = tempAdminPermission.normalizeTempAdmin(existing) || {};
    const prevPerms = Array.isArray(normalized.permissions)
      ? normalized.permissions.slice()
      : [];
    const prevSource = String(existing.source || normalized.source || '').trim();
    const wasCaddie =
      prevSource === 'caddie_qr' || String(existing.role || '').trim() === 'caddie';
    const mergedPhone = phone || String(existing.phone || '').trim();

    // 已有权限：不清空；仅确保出现在 admin_qr 列表
    if (prevPerms.length > 0) {
      const next = {
        userId: uid,
        phone: mergedPhone,
        nickname: normalized.nickname || nickname,
        avatar: normalized.avatar || avatar,
        permissions: prevPerms,
        source: 'admin_qr',
        status: 'approved',
        addedBy: normalized.addedBy || addedBy,
        addedAt: normalized.addedAt || Date.now()
      };
      if (wasCaddie || existing.role) next.role = wasCaddie ? 'caddie' : String(existing.role || '');
      matchOrGame.tempAdmins[idx] = next;
      return next;
    }

    // permissions 为空：保持 pending
    const next = {
      userId: uid,
      phone: mergedPhone,
      nickname: normalized.nickname || nickname,
      avatar: normalized.avatar || avatar,
      permissions: [],
      source: 'admin_qr',
      status: 'pending',
      addedBy: normalized.addedBy || addedBy,
      addedAt: normalized.addedAt || Date.now()
    };
    if (wasCaddie) next.role = 'caddie';
    matchOrGame.tempAdmins[idx] = next;
    return next;
  }

  const created = {
    userId: uid,
    phone: phone,
    nickname: nickname,
    avatar: avatar,
    permissions: [],
    source: 'admin_qr',
    status: 'pending',
    addedBy: addedBy,
    addedAt: Date.now()
  };
  matchOrGame.tempAdmins.push(created);
  return created;
}

function _shouldKeepAsCaddie(existing, matchOrGame) {
  const role = String((existing && existing.role) || '').trim();
  if (role === 'caddie') return true;
  const uid = _entryUserId(existing);
  const caddieAccess = matchOrGame && matchOrGame.caddieScoringAccess;
  return !!(
    caddieAccess &&
    Array.isArray(caddieAccess.claimedBy) &&
    caddieAccess.claimedBy.map(String).indexOf(uid) >= 0
  );
}

/**
 * 从草稿列表移除 admin_qr；若同时是球童则返回 demoted 条目
 */
function removeAdminQrFromDraftList(draftList, userId, matchOrGame) {
  const uid = String(userId || '').trim();
  const list = Array.isArray(draftList) ? draftList.slice() : [];
  if (!uid) return { ok: false, reason: 'no_user', list: list, demoted: null };
  const idx = list.findIndex((a) => String((a && a.userId) || '') === uid);
  if (idx < 0) return { ok: false, reason: 'not_found', list: list, demoted: null };
  const existing = list[idx] || {};
  list.splice(idx, 1);
  let demoted = null;
  if (_shouldKeepAsCaddie(existing, matchOrGame)) {
    demoted = {
      userId: uid,
      phone: String(existing.phone || '').trim(),
      nickname: existing.nickname || uid,
      avatar: existing.avatar || '',
      permissions: ['manage_scoring'],
      source: 'caddie_qr',
      status: 'approved',
      role: 'caddie',
      addedBy: existing.addedBy || '',
      addedAt: existing.addedAt || Date.now()
    };
    if (!demoted.phone) delete demoted.phone;
  }
  return { ok: true, list: list, demoted: demoted };
}

/**
 * 将草稿写回 match.tempAdmins（保留非 admin_qr 条目 + demotions + draft admins）
 */
function commitAdminQrDraft(matchOrGame, draftList, demotedList, grantableFeatures) {
  if (!matchOrGame || typeof matchOrGame !== 'object') return false;
  const demotedMap = {};
  (Array.isArray(demotedList) ? demotedList : []).forEach((d) => {
    const id = _entryUserId(d);
    if (id) demotedMap[id] = d;
  });

  const kept = (Array.isArray(matchOrGame.tempAdmins) ? matchOrGame.tempAdmins : []).filter(
    (raw) => {
      const uid = _entryUserId(raw);
      if (!uid) return false;
      if (isAdminQrEntry(raw)) return false;
      if (demotedMap[uid]) return false;
      return true;
    }
  );

  const admins = (Array.isArray(draftList) ? draftList : [])
    .map((raw) => {
      const normalized = tempAdminPermission.normalizeTempAdmin(
        raw,
        '',
        grantableFeatures
      );
      if (!normalized) return null;
      const permissions = tempAdminPermission.normalizePermissionList(
        raw.permissions,
        grantableFeatures
      );
      const item = {
        userId: normalized.userId,
        nickname: normalized.nickname,
        avatar: normalized.avatar,
        permissions: permissions,
        source: 'admin_qr',
        status: permissions.length > 0 ? 'approved' : 'pending',
        addedBy: normalized.addedBy || '',
        addedAt: normalized.addedAt || Date.now()
      };
      if (normalized.phone || raw.phone) {
        item.phone = String(normalized.phone || raw.phone || '').trim();
      }
      if (raw.role) item.role = String(raw.role).trim();
      return item;
    })
    .filter(Boolean);

  const demoted = Object.keys(demotedMap).map((k) => demotedMap[k]);
  matchOrGame.tempAdmins = kept.concat(demoted).concat(admins);

  // 同步 claimedBy：仅保留仍在 admin 草稿中的用户
  const access = normalizeTempAdminAccess(matchOrGame.tempAdminAccess);
  if (access) {
    const keepIds = {};
    admins.forEach((a) => {
      keepIds[a.userId] = true;
    });
    access.claimedBy = access.claimedBy.filter((id) => keepIds[String(id)]);
    matchOrGame.tempAdminAccess = access;
  }
  return true;
}

function claimTempAdminAccess(matchOrGame, token, userId, userProfile) {
  if (!matchOrGame || typeof matchOrGame !== 'object') {
    return { ok: false, reason: 'no_match' };
  }
  const uid = String(userId || '').trim();
  const tok = String(token || '').trim();
  if (!uid) return { ok: false, reason: 'no_user' };
  if (!tok) return { ok: false, reason: 'no_token' };

  const access = normalizeTempAdminAccess(matchOrGame.tempAdminAccess);
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
  matchOrGame.tempAdminAccess = access;
  const admin = upsertAdminQrTempAdmin(matchOrGame, profile, access);
  if (!admin) return { ok: false, reason: 'no_phone' };
  return { ok: true, already: already, access: access, admin: admin };
}

module.exports = {
  createTempAdminAccess,
  normalizeTempAdminAccess,
  buildAdminPagePath,
  buildQrImageUrl,
  isAdminQrEntry,
  resolveAdminStatus,
  listAdminQrAdmins,
  upsertAdminQrTempAdmin,
  removeAdminQrFromDraftList,
  commitAdminQrDraft,
  claimTempAdminAccess,
  buildPermissionDraftOptions,
  selectedKeysFromOptions
};
