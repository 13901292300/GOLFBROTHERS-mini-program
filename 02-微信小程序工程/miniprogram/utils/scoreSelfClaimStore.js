/**
 * 记分页「这是我」手动认领：仅本机、本场、当前本地用户。
 * 不写入 game.userId，导出比赛不会把发送者认领带给接收者。
 *
 * 与 gb_user_profile_v1.userId=me、gb_auth_session_v1 的会话 id 分开：
 * 会话 id 只服务球队展示，不是记分认领主键。
 */

const STORAGE_KEY = 'gb_score_self_claims_v1';
const OWNER_KEY = 'gb_local_owner_v1';

function _trim(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null') return '';
  return s;
}

function getLocalOwnerId() {
  try {
    const existing = _trim(wx.getStorageSync(OWNER_KEY));
    if (existing) return existing;
  } catch (e) {
    /* ignore */
  }
  const next =
    'lo_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 10);
  try {
    wx.setStorageSync(OWNER_KEY, next);
  } catch (e2) {
    /* ignore */
  }
  return next;
}

function _readDoc() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw || typeof raw !== 'object') {
      return { version: 1, claims: [] };
    }
    return {
      version: 1,
      claims: Array.isArray(raw.claims) ? raw.claims : []
    };
  } catch (e) {
    return { version: 1, claims: [] };
  }
}

function _writeDoc(doc) {
  try {
    wx.setStorageSync(STORAGE_KEY, {
      version: 1,
      claims: Array.isArray(doc && doc.claims) ? doc.claims : []
    });
  } catch (e) {
    /* ignore */
  }
}

function _normalizeClaim(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ownerId = _trim(raw.ownerId);
  const gameId = _trim(raw.gameId);
  const playerId = _trim(raw.playerId);
  if (!ownerId || !gameId || !playerId) return null;
  if (raw.source !== 'manual_self_claim') return null;
  return {
    ownerId: ownerId,
    gameId: gameId,
    playerId: playerId,
    source: 'manual_self_claim',
    confirmedAt: Number(raw.confirmedAt) || Date.now()
  };
}

function listOwnerClaims() {
  const ownerId = getLocalOwnerId();
  return _readDoc()
    .claims.map(_normalizeClaim)
    .filter((c) => c && c.ownerId === ownerId);
}

function getClaim(gameId, playerId) {
  const gid = _trim(gameId);
  const pid = _trim(playerId);
  if (!gid || !pid) return null;
  const list = listOwnerClaims();
  for (let i = 0; i < list.length; i++) {
    if (list[i].gameId === gid && list[i].playerId === pid) return list[i];
  }
  return null;
}

function findClaimInGame(gameId) {
  const gid = _trim(gameId);
  if (!gid) return null;
  const list = listOwnerClaims();
  for (let i = 0; i < list.length; i++) {
    if (list[i].gameId === gid) return list[i];
  }
  return null;
}

function hasActiveClaim(gameId, playerId) {
  return !!getClaim(gameId, playerId);
}

function putClaim(gameId, playerId) {
  const gid = _trim(gameId);
  const pid = _trim(playerId);
  if (!gid || !pid) return null;
  const ownerId = getLocalOwnerId();
  const next = {
    ownerId: ownerId,
    gameId: gid,
    playerId: pid,
    source: 'manual_self_claim',
    confirmedAt: Date.now()
  };
  const doc = _readDoc();
  const kept = [];
  for (let i = 0; i < doc.claims.length; i++) {
    const c = _normalizeClaim(doc.claims[i]);
    if (!c) continue;
    if (c.ownerId === ownerId && c.gameId === gid) continue;
    kept.push(c);
  }
  kept.push(next);
  _writeDoc({ version: 1, claims: kept });
  return next;
}

function removeClaim(gameId, playerId) {
  const gid = _trim(gameId);
  const pid = _trim(playerId);
  if (!gid || !pid) return false;
  const ownerId = getLocalOwnerId();
  const doc = _readDoc();
  let removed = false;
  const kept = [];
  for (let i = 0; i < doc.claims.length; i++) {
    const c = _normalizeClaim(doc.claims[i]);
    if (!c) continue;
    if (c.ownerId === ownerId && c.gameId === gid && c.playerId === pid) {
      removed = true;
      continue;
    }
    kept.push(c);
  }
  if (removed) _writeDoc({ version: 1, claims: kept });
  return removed;
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  OWNER_KEY: OWNER_KEY,
  getLocalOwnerId: getLocalOwnerId,
  getClaim: getClaim,
  findClaimInGame: findClaimInGame,
  hasActiveClaim: hasActiveClaim,
  putClaim: putClaim,
  removeClaim: removeClaim,
  listOwnerClaims: listOwnerClaims
};
