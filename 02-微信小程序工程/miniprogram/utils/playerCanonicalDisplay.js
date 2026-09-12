/**
 * 局内球员展示契约：playerId 是 GAME 主键；accountUserId 只表示注册账号。
 * 不写回 gameStore / matchStore / side-game V2。
 */

const playerIdentityGuard = require('./playerIdentityGuard.js');
const mockAvatars = require('./mockAvatars.js');
const userProfileStore = require('./userProfileStore.js');
const gameStore = require('./gameStore.js');

function _trim(value) {
  return playerIdentityGuard.normalizePlayerUserId(value);
}

function _asString(value) {
  return value == null ? '' : String(value).trim();
}

function isManualPlayerId(value) {
  const id = _trim(value);
  return !!id && /^m_/i.test(id);
}

function isFriendLikeId(value) {
  const id = _trim(value);
  return !!id && /^fr-/i.test(id);
}

function isGuestAccountId(value) {
  return playerIdentityGuard.isGuestPlayerId(value);
}

/** guest_m_xxx → m_x（仅此前缀形态；不把任意 guest_* 当成账号） */
function manualPlayerIdFromGuestUserId(userId) {
  const uid = _trim(userId);
  if (!isGuestAccountId(uid)) return '';
  const rest = uid.slice(6);
  if (isManualPlayerId(rest)) return rest;
  return '';
}

/**
 * 局内参与者主键。优先 slot.playerId / id。
 * guest_* 不得抢在 m_* 前面。
 */
function resolveRosterPlayerId(player) {
  const p = player && typeof player === 'object' ? player : {};
  const pid = _trim(p.playerId);
  if (pid && !isGuestAccountId(pid)) return pid;
  const sid = _trim(p.id);
  if (sid && !isGuestAccountId(sid) && !/^__empty_slot_/i.test(sid)) return sid;
  const fromGuest = manualPlayerIdFromGuestUserId(p.userId);
  if (fromGuest) return fromGuest;
  if (pid) return pid;
  const uid = _trim(p.userId);
  if (uid && !isGuestAccountId(uid)) return uid;
  if (sid && !/^__empty_slot_/i.test(sid)) return sid;
  return uid || '';
}

function resolveAccountUserId(player) {
  const p = player && typeof player === 'object' ? player : {};
  const userType = p.userType;
  const candidates = [_trim(p.userId), _trim(p.playerUserId), _trim(p.accountUserId)];
  for (let i = 0; i < candidates.length; i++) {
    const id = candidates[i];
    if (!id) continue;
    if (isGuestAccountId(id)) continue;
    if (isManualPlayerId(id)) continue;
    if (isFriendLikeId(id)) continue;
    if (!playerIdentityGuard.isStablePublicUserId(id, { userType: userType })) continue;
    return id;
  }
  return '';
}

function currentAccountUserId() {
  try {
    const profile = userProfileStore.loadProfile() || {};
    const fromProfile = _trim(profile.userId);
    if (fromProfile) return fromProfile;
  } catch (e) {
    /* ignore */
  }
  try {
    const user = gameStore.getCurrentUser() || {};
    const fromUser = _trim(user.userId);
    if (fromUser) return fromUser;
  } catch (e2) {
    /* ignore */
  }
  return '';
}

function resolveIdentityType(player, accountUserId, rosterPlayerId, currentUserId) {
  const p = player && typeof player === 'object' ? player : {};
  const source = _asString(p.source).toLowerCase();
  const sourceKind = _asString(p.sourceKind).toLowerCase();
  const userType = _asString(p.userType).toLowerCase();
  const identitySource = _asString(p.identitySource).toLowerCase();
  if (source === 'manual' || userType === 'guest' || identitySource === 'manual_add' || isManualPlayerId(rosterPlayerId)) {
    return 'manual';
  }
  if (source === 'friend' || isFriendLikeId(rosterPlayerId)) return 'friend';
  if (source === 'combo' || sourceKind === 'combo') return 'combo';
  const acct = _trim(accountUserId);
  const me = _trim(currentUserId);
  if (acct && me && acct === me) return 'self';
  if (acct) return 'registered';
  return 'registered';
}

function pickSnapshotAvatar(player) {
  const p = player && typeof player === 'object' ? player : {};
  return _asString(p.avatar || p.avatarUrl || p.canonicalAvatar);
}

function displayAvatarOf(obj) {
  return _asString(obj && obj.displayAvatar);
}

function avatarScheme(src) {
  const s = _asString(src);
  if (!s) return 'empty';
  if (/^cloud:\/\//i.test(s)) return 'cloud';
  if (/^wxfile:\/\/usr/i.test(s) || mockAvatars.isDurableLocalUserFile(s)) return 'usr';
  if (/^https:\/\//i.test(s)) {
    if (s === mockAvatars.DEFAULT_AVATAR || /\/default-avatar\.(jpg|png)$/i.test(s)) return 'default';
    return 'https';
  }
  if (mockAvatars.isDurableLocalUserFile(s)) return 'usr';
  return 'other';
}

function resolveCanonicalAvatar(player) {
  const raw = pickSnapshotAvatar(player);
  if (mockAvatars.isDurableLocalUserFile(raw)) return '';
  if (mockAvatars.isDurableAvatarSrc(raw)) return raw;
  return raw;
}

function resolveSeededDisplayAvatar(raw, rosterPlayerId) {
  const id = _trim(rosterPlayerId);
  return mockAvatars.resolveAvatar(raw, id || undefined);
}

function resolvePlayerPresentation(player, ctx) {
  const p = player && typeof player === 'object' ? player : {};
  const currentUserId = _trim(ctx && ctx.currentUserId) || currentAccountUserId();
  const playerId = resolveRosterPlayerId(p) || _trim(ctx && ctx.playerId);
  const accountUserIdRaw = resolveAccountUserId(p);
  const accountUserId = accountUserIdRaw || null;
  const identityType = resolveIdentityType(p, accountUserIdRaw, playerId, currentUserId);
  const displayName =
    _asString(p.displayName || p.nickname || p.matchNickname || p.name || p.competitionName) ||
    playerId;
  const canonicalAvatar = resolveCanonicalAvatar(p);
  let displayAvatar = resolveSeededDisplayAvatar(canonicalAvatar, playerId);
  if (!displayAvatar) displayAvatar = resolveSeededDisplayAvatar('', playerId);
  return {
    playerId: playerId,
    accountUserId: accountUserId,
    identityType: identityType,
    displayName: displayName,
    canonicalAvatar: canonicalAvatar,
    displayAvatar: displayAvatar
  };
}

function buildLegacyAliasToPlayerId(player) {
  const p = player && typeof player === 'object' ? player : {};
  const rosterId = resolveRosterPlayerId(p);
  const map = {};
  if (!rosterId) return map;
  const uid = _trim(p.userId);
  if (isGuestAccountId(uid) && uid !== rosterId) map[uid] = rosterId;
  const fromGuest = manualPlayerIdFromGuestUserId(uid);
  if (fromGuest && fromGuest === rosterId && uid) map[uid] = rosterId;
  return map;
}

function lookupPresentation(maps, aliases, playerId) {
  const id = _trim(playerId);
  const table = maps && typeof maps === 'object' ? maps : {};
  const alias = aliases && typeof aliases === 'object' ? aliases : {};
  if (id && table[id]) return table[id];
  const mapped = id && alias[id] ? alias[id] : '';
  if (mapped && table[mapped]) return table[mapped];
  return null;
}

function avatarAuditKind(identityType) {
  if (identityType === 'self') return 'self';
  if (identityType === 'friend' || identityType === 'combo') return 'friend';
  if (identityType === 'manual') return 'manual';
  return 'registered';
}

module.exports = {
  resolveRosterPlayerId,
  resolveAccountUserId,
  resolveIdentityType,
  resolvePlayerPresentation,
  resolveSeededDisplayAvatar,
  buildLegacyAliasToPlayerId,
  lookupPresentation,
  manualPlayerIdFromGuestUserId,
  isManualPlayerId,
  isGuestAccountId,
  avatarScheme,
  displayAvatarOf,
  avatarAuditKind,
  currentAccountUserId
};
