/**
 * Team match join QR access.
 *
 * Owns match_join_qr token creation, lookup, and validation only. It does not
 * create users, write registerInfo, bind Slots, or touch scoreData.
 */
const STORAGE_KEY = 'gb_match_join_access_v1';

function normalizeId(value) {
  return String(value || '').trim();
}

function now() {
  return Date.now();
}

function randToken() {
  return (
    now().toString(36) +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 8)
  );
}

function readAll() {
  try {
    const list = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function writeAll(list) {
  try {
    wx.setStorageSync(STORAGE_KEY, Array.isArray(list) ? list : []);
  } catch (e) {
    /* ignore */
  }
}

function buildMatchJoinPagePath(params) {
  const input = params || {};
  const matchId = normalizeId(input.matchId);
  const groupId = normalizeId(input.groupId);
  const token = normalizeId(input.token);
  if (!matchId || !groupId || !token) return '';
  return (
    'pages/score/index?matchId=' +
    encodeURIComponent(matchId) +
    '&groupId=' +
    encodeURIComponent(groupId) +
    '&joinToken=' +
    encodeURIComponent(token)
  );
}

function normalizeMatchJoinAccess(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const token = normalizeId(raw.token);
  const matchId = normalizeId(raw.matchId);
  const groupId = normalizeId(raw.groupId);
  if (!token || !matchId || !groupId) return null;
  const createdAt = raw.createdAt != null ? Number(raw.createdAt) || 0 : 0;
  const expiresAt = raw.expiresAt != null ? Number(raw.expiresAt) || 0 : 0;
  return {
    joinId: normalizeId(raw.joinId) || ('join_' + token),
    matchId: matchId,
    groupId: groupId,
    createdBy: normalizeId(raw.createdBy),
    token: token,
    status: normalizeId(raw.status) || 'active',
    createdAt: createdAt,
    expiresAt: expiresAt
  };
}

function createMatchJoinAccess(params) {
  const input = params || {};
  const matchId = normalizeId(input.matchId);
  const groupId = normalizeId(input.groupId);
  if (!matchId || !groupId) return null;
  const token = randToken();
  const access = normalizeMatchJoinAccess({
    joinId: 'join_' + now() + '_' + Math.random().toString(36).slice(2, 8),
    matchId: matchId,
    groupId: groupId,
    createdBy: input.createdBy,
    token: token,
    status: 'active',
    createdAt: now(),
    expiresAt: 0
  });
  if (!access) return null;
  const list = readAll();
  list.unshift(access);
  writeAll(list);
  return {
    token: access.token,
    matchId: access.matchId,
    groupId: access.groupId
  };
}

function getJoinAccess(token) {
  const tok = normalizeId(token);
  if (!tok) return null;
  const found = readAll().find((item) => item && normalizeId(item.token) === tok);
  return normalizeMatchJoinAccess(found);
}

function matchHasGroup(match, groupId) {
  const gid = normalizeId(groupId);
  if (!gid || !match || !Array.isArray(match.groups)) return false;
  return match.groups.some((group) => normalizeId(group && (group.groupId || group.id)) === gid);
}

function validateMatchJoinAccess(params) {
  const input = params || {};
  const match = input.match || null;
  const token = normalizeId(input.token);
  if (!token) return { ok: false, reason: 'no_token' };
  if (!match || typeof match !== 'object') return { ok: false, reason: 'no_match' };

  const access = getJoinAccess(token);
  if (!access) return { ok: false, reason: 'not_found' };
  if (access.status !== 'active') return { ok: false, reason: 'disabled', access: access };
  if (access.expiresAt > 0 && access.expiresAt < now()) {
    return { ok: false, reason: 'expired', access: access };
  }

  const matchId = normalizeId(match.matchId || match.id);
  if (!matchId || access.matchId !== matchId) {
    return { ok: false, reason: 'match_mismatch', access: access };
  }
  if (!matchHasGroup(match, access.groupId)) {
    return { ok: false, reason: 'group_mismatch', access: access };
  }
  return { ok: true, access: access };
}

module.exports = {
  STORAGE_KEY,
  createMatchJoinAccess,
  normalizeMatchJoinAccess,
  validateMatchJoinAccess,
  buildMatchJoinPagePath,
  getJoinAccess
};
