/**
 * 其他注册用户账号 nickname/avatar 的短时 directory。
 * 权威源：云端 user_profiles（getProfiles）。
 * self 不走本模块覆盖；guest / 非法 id 不请求。
 */

const playerCanonicalDisplay = require('./playerCanonicalDisplay.js');

const CACHE_TTL_MS = 30000;
const MAX_BATCH = 40;
const GENERATED_ID = /^(host-|p-\d|seat-|gm-|__empty_slot_|entity_)/i;

function isDirectoryAccountUserId(raw) {
  const id = playerCanonicalDisplay.resolveAccountUserId(
    typeof raw === 'object' && raw
      ? raw
      : { userId: raw, playerUserId: raw }
  );
  if (!id) return false;
  if (GENERATED_ID.test(id)) return false;
  if (/^me$/i.test(id)) return false;
  if (/^\d{11}$/.test(id)) return false;
  return true;
}

const _cache = Object.create(null);
let _nowMs = 0;
let _fetchImpl = null;
let _fetchCalls = 0;

function _now() {
  return _nowMs || Date.now();
}

function setNowMs(ms) {
  _nowMs = Number(ms) || 0;
}

function resetNow() {
  _nowMs = 0;
}

function resetCache() {
  Object.keys(_cache).forEach((k) => {
    delete _cache[k];
  });
  _fetchCalls = 0;
}

function setFetchImpl(fn) {
  _fetchImpl = typeof fn === 'function' ? fn : null;
}

function getFetchCallCount() {
  return _fetchCalls;
}

function resetFetchCallCount() {
  _fetchCalls = 0;
}

function collectAccountUserIds(sources) {
  const seen = Object.create(null);
  const out = [];
  function pushPlayer(raw) {
    if (raw == null) return;
    let src = raw;
    if (typeof raw === 'string' || typeof raw === 'number') {
      src = { userId: raw, playerUserId: raw };
    } else if (typeof raw !== 'object') {
      return;
    }
    if (!isDirectoryAccountUserId(src)) return;
    const id = playerCanonicalDisplay.resolveAccountUserId(src);
    if (!id || seen[id]) return;
    seen[id] = true;
    out.push(id);
  }
  function walk(item) {
    if (item == null) return;
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (typeof item === 'string' || typeof item === 'number') {
      pushPlayer(item);
      return;
    }
    if (typeof item !== 'object') return;
    pushPlayer(item);
    if (Array.isArray(item.members)) item.members.forEach(walk);
    if (Array.isArray(item.players)) item.players.forEach(walk);
    if (Array.isArray(item.users)) item.users.forEach(walk);
  }
  walk(sources);
  return out;
}

function collectFromGame(game) {
  if (!game || typeof game !== 'object') return [];
  const bag = [];
  const groups = Array.isArray(game.groups) ? game.groups : [];
  groups.forEach((g) => {
    if (Array.isArray(g && g.players)) bag.push(g.players);
    if (Array.isArray(g && g.playersSlots)) bag.push(g.playersSlots);
  });
  if (Array.isArray(game.players)) bag.push(game.players);
  if (Array.isArray(game.participants)) bag.push(game.participants);
  if (game.registerInfo && Array.isArray(game.registerInfo.users)) {
    bag.push(game.registerInfo.users);
  }
  return collectAccountUserIds(bag);
}

function normalizeIds(userIds) {
  return collectAccountUserIds(userIds).slice(0, MAX_BATCH);
}

function getCached(userId) {
  if (!isDirectoryAccountUserId({ userId: userId, playerUserId: userId })) return null;
  const id = playerCanonicalDisplay.resolveAccountUserId({
    userId: userId,
    playerUserId: userId
  });
  if (!id) return null;
  const row = _cache[id];
  if (!row || row.missing) return null;
  return {
    userId: id,
    nickname: row.nickname || '',
    avatar: row.avatar || '',
    fetchedAt: row.fetchedAt,
    stale: _now() - row.fetchedAt >= CACHE_TTL_MS
  };
}

function _writeHit(id, profile) {
  _cache[id] = {
    missing: false,
    nickname: String((profile && profile.nickname) || '').trim(),
    avatar: String((profile && profile.avatar) || '').trim(),
    fetchedAt: _now()
  };
}

function _writeMissing(id) {
  _cache[id] = {
    missing: true,
    nickname: '',
    avatar: '',
    fetchedAt: _now()
  };
}

function _defaultFetch(userIds) {
  try {
    const cloudRepository = require('./teamClub/cloudRepository.js');
    if (!cloudRepository || typeof cloudRepository.getProfiles !== 'function') {
      return Promise.resolve({ ok: false, code: 'unsupported' });
    }
    return Promise.resolve(cloudRepository.getProfiles({ userIds: userIds }));
  } catch (e) {
    return Promise.resolve({ ok: false, code: 'unsupported' });
  }
}

function resolveAccountProfiles(userIds) {
  const ids = normalizeIds(userIds);
  const profilesByUserId = {};
  const missingUserIds = [];
  const need = [];
  const now = _now();

  ids.forEach((id) => {
    const row = _cache[id];
    if (row && now - row.fetchedAt < CACHE_TTL_MS) {
      if (row.missing) missingUserIds.push(id);
      else {
        profilesByUserId[id] = {
          userId: id,
          nickname: row.nickname,
          avatar: row.avatar
        };
      }
      return;
    }
    need.push(id);
    if (row && !row.missing) {
      profilesByUserId[id] = {
        userId: id,
        nickname: row.nickname,
        avatar: row.avatar
      };
    }
  });

  if (!need.length) {
    return Promise.resolve({
      ok: true,
      fetched: false,
      profilesByUserId: profilesByUserId,
      missingUserIds: missingUserIds
    });
  }

  _fetchCalls += 1;
  const fetchFn = _fetchImpl || _defaultFetch;
  return Promise.resolve(fetchFn(need))
    .then((res) => {
      if (!res || res.ok === false) {
        need.forEach((id) => {
          if (!profilesByUserId[id]) missingUserIds.push(id);
        });
        return {
          ok: false,
          fetched: true,
          profilesByUserId: profilesByUserId,
          missingUserIds: missingUserIds
        };
      }
      const data = res.data && typeof res.data === 'object' ? res.data : res;
      const map =
        data.profilesByUserId && typeof data.profilesByUserId === 'object'
          ? data.profilesByUserId
          : {};
      const missing = Array.isArray(data.missingUserIds) ? data.missingUserIds : [];
      need.forEach((id) => {
        const hit = map[id];
        if (hit && (hit.nickname || hit.avatar || hit.userId)) {
          const nickname = String(hit.nickname || hit.displayName || '').trim();
          const avatar = String(hit.avatar || '').trim();
          _writeHit(id, { nickname: nickname, avatar: avatar });
          profilesByUserId[id] = { userId: id, nickname: nickname, avatar: avatar };
        } else {
          _writeMissing(id);
          if (missingUserIds.indexOf(id) < 0) missingUserIds.push(id);
        }
      });
      missing.forEach((id) => {
        const sid = String(id || '').trim();
        if (!sid) return;
        if (!profilesByUserId[sid] && missingUserIds.indexOf(sid) < 0) missingUserIds.push(sid);
      });
      return {
        ok: true,
        fetched: true,
        profilesByUserId: profilesByUserId,
        missingUserIds: missingUserIds
      };
    })
    .catch(() => {
      need.forEach((id) => {
        if (!profilesByUserId[id] && missingUserIds.indexOf(id) < 0) missingUserIds.push(id);
      });
      return {
        ok: false,
        fetched: true,
        profilesByUserId: profilesByUserId,
        missingUserIds: missingUserIds
      };
    });
}

module.exports = {
  CACHE_TTL_MS: CACHE_TTL_MS,
  MAX_BATCH: MAX_BATCH,
  collectAccountUserIds: collectAccountUserIds,
  collectFromGame: collectFromGame,
  normalizeIds: normalizeIds,
  getCached: getCached,
  resolveAccountProfiles: resolveAccountProfiles,
  resetCache: resetCache,
  setFetchImpl: setFetchImpl,
  getFetchCallCount: getFetchCallCount,
  resetFetchCallCount: resetFetchCallCount,
  setNowMs: setNowMs,
  resetNow: resetNow
};
