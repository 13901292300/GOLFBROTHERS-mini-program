/**
 * Match join identity resolver.
 *
 * Resolves the current scanner identity for match_join_qr only. It does not
 * create users, write registerInfo, create contacts, bind Slots, or touch
 * scoreData.
 */
const userDirectory = require('./userDirectory.js');
const userIdentityAlias = require('./userIdentityAlias.js');
const mockAvatars = require('./mockAvatars.js');

function normalizeId(value) {
  return String(value || '').trim();
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').trim();
}

function resolveCanonicalUserId(userId) {
  const uid = normalizeId(userId);
  if (!uid) return '';
  try {
    return normalizeId(userIdentityAlias.resolveCanonicalUserId(uid)) || uid;
  } catch (e) {
    return uid;
  }
}

function resolveCurrentUserId(user) {
  if (!user || typeof user !== 'object') return '';
  return normalizeId(user.userId || user.playerId || user.id || user.uid || user.openid);
}

function resolveCurrentPhone(user) {
  if (!user || typeof user !== 'object') return '';
  return normalizePhone(user.phone || user.mobile || user.tel);
}

function normalizeResolvedUser(result, fallback) {
  const found = result && result.found && result.user ? result : null;
  const sourceUser = found ? result.user : {};
  const fallbackUser = fallback || {};
  const rawUserId =
    normalizeId(sourceUser.userId || sourceUser.playerId || sourceUser.id) ||
    resolveCurrentUserId(fallbackUser);
  if (!rawUserId) return null;
  const userType = found
    ? (result.userType === 'registered' ? 'registered' : 'phone')
    : String(fallbackUser.userType || 'phone').trim() || 'phone';
  const identitySource = found
    ? (result.source === 'mini_program' ? 'mini_program' : 'app_import')
    : String(fallbackUser.identitySource || fallbackUser.source || 'scan_add').trim() || 'scan_add';
  const canonicalUserId = resolveCanonicalUserId(rawUserId);
  const nickname = String(
    sourceUser.nickname ||
    fallbackUser.nickname ||
    fallbackUser.name ||
    fallbackUser.displayName ||
    rawUserId
  ).trim();
  const competitionName = String(
    sourceUser.competitionName ||
    fallbackUser.competitionName ||
    fallbackUser.matchNickname ||
    nickname
  ).trim();

  return {
    userId: canonicalUserId || rawUserId,
    userType: userType,
    identitySource: identitySource,
    phone: normalizePhone(sourceUser.phone || fallbackUser.phone),
    nickname: nickname,
    competitionName: competitionName,
    avatar: sourceUser.avatar || fallbackUser.avatar || fallbackUser.avatarUrl || mockAvatars.resolveAvatar('', canonicalUserId || rawUserId),
    gender: sourceUser.gender != null ? String(sourceUser.gender) : String(fallbackUser.gender || '')
  };
}

function resolveJoinIdentity(params) {
  const input = params || {};
  const currentUser = input.currentUser || null;
  if (!currentUser || typeof currentUser !== 'object') {
    return { ok: false, reason: 'no_current_user' };
  }

  const currentUserId = resolveCurrentUserId(currentUser);
  if (!currentUserId) {
    return { ok: false, reason: 'no_current_user' };
  }

  const phone = resolveCurrentPhone(currentUser);
  if (!phone) {
    return { ok: false, reason: 'need_phone', needBindPhone: true };
  }

  const result = userDirectory.resolveUserIdentityByPhone(phone);
  const user = normalizeResolvedUser(result, currentUser);
  if (!user) {
    return { ok: false, reason: 'no_identity' };
  }
  return {
    ok: true,
    user: user
  };
}

module.exports = {
  resolveJoinIdentity
};
