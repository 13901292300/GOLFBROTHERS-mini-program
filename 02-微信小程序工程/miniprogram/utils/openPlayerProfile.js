/**
 * 球员主页统一导航（主包轻量）。
 * 页面只调本 API，不复制 guest / scorecard 身份判断。
 *
 * 支持短生命周期 navigation context：赛事快照可信字段经 token 传递，不塞 URL JSON。
 */

const playerIdentityGuard = require('./playerIdentityGuard.js');

const PROFILE_PAGE_URL = '/subpackages/player/pages/profile/index';
const CONTEXT_TTL_MS = 2 * 60 * 1000;
const CONTEXT_STORAGE_PREFIX = 'player-profile-context:';

/** @type {Record<string, { userId: string, expiresAt: number, snapshot: object }>} */
const memoryContexts = {};
let contextSeq = 0;

function _trim(v) {
  return playerIdentityGuard.normalizePlayerUserId(v);
}

function _now() {
  return Date.now();
}

/**
 * 解析可打开主页的稳定 userId。
 * @param {{ userId?: string, playerId?: string, userType?: string }} raw
 * @returns {string}
 */
function resolveOpenableUserId(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const id = _trim(src.userId || src.playerId);
  if (!playerIdentityGuard.isStablePublicUserId(id, { userType: src.userType })) {
    return '';
  }
  return id;
}

/**
 * 公开昵称快照：禁止使用备注展示名。
 * 优先 publicName / nickname / matchNickname / competitionName，最后才回退 name。
 */
function resolvePublicSnapshotName(opts) {
  const src = opts && typeof opts === 'object' ? opts : {};
  return _trim(
    src.publicName ||
      src.nickname ||
      src.matchNickname ||
      src.competitionName ||
      src.snapshotName ||
      src.name ||
      src.displayName
  );
}

function _purgeExpiredContexts() {
  const ts = _now();
  Object.keys(memoryContexts).forEach((token) => {
    const row = memoryContexts[token];
    if (!row || !row.expiresAt || row.expiresAt <= ts) {
      delete memoryContexts[token];
      try {
        wx.removeStorageSync(CONTEXT_STORAGE_PREFIX + token);
      } catch (e) { /* ignore */ }
    }
  });
}

/**
 * 创建短生命周期导航上下文（内存 + 可选 Storage 备份）。
 * guest / masked / 非法 ID / userType=guest 拒绝。
 * @returns {string} contextToken，失败返回 ''
 */
function createPlayerProfileNavigationContext(input) {
  _purgeExpiredContexts();
  const src = input && typeof input === 'object' ? input : {};
  const userType = _trim(src.userType).toLowerCase();
  if (userType === 'guest') return '';
  const userId = resolveOpenableUserId(src);
  if (!userId) return '';

  contextSeq += 1;
  const token = 'ppc_' + _now().toString(36) + '_' + contextSeq;
  const snapshot = {
    userId: userId,
    // 公开/赛事快照昵称：不含私人备注
    name: resolvePublicSnapshotName(src),
    nickname: _trim(src.nickname || src.matchNickname || ''),
    avatar: _trim(src.avatar),
    gender: src.gender != null ? src.gender : '',
    handicap: src.handicap != null && src.handicap !== '' ? src.handicap : null,
    floatCoef: src.floatCoef != null && src.floatCoef !== '' ? src.floatCoef : null,
    userType: _trim(src.userType),
    identitySource: _trim(src.identitySource) || 'matchSnapshot'
  };

  const row = {
    userId: userId,
    expiresAt: _now() + CONTEXT_TTL_MS,
    snapshot: snapshot
  };
  memoryContexts[token] = row;
  try {
    wx.setStorageSync(CONTEXT_STORAGE_PREFIX + token, row);
  } catch (e) { /* ignore */ }
  return token;
}

/**
 * 消费导航上下文（校验 userId + 未过期）。默认一次性清除。
 * @param {string} token
 * @param {string} expectedUserId
 * @param {{ consume?: boolean }} [options]
 * @returns {object|null} fallbackSnapshot
 */
function takePlayerProfileNavigationContext(token, expectedUserId, options) {
  const key = _trim(token);
  const expectId = _trim(expectedUserId);
  if (!key || !expectId) return null;
  if (!playerIdentityGuard.isStablePublicUserId(expectId)) return null;

  let row = memoryContexts[key] || null;
  if (!row) {
    try {
      row = wx.getStorageSync(CONTEXT_STORAGE_PREFIX + key) || null;
    } catch (e) {
      row = null;
    }
  }
  if (!row || typeof row !== 'object') return null;
  if (!row.expiresAt || Number(row.expiresAt) <= _now()) {
    delete memoryContexts[key];
    try {
      wx.removeStorageSync(CONTEXT_STORAGE_PREFIX + key);
    } catch (e) { /* ignore */ }
    return null;
  }
  if (_trim(row.userId) !== expectId) return null;
  const snap = row.snapshot && typeof row.snapshot === 'object' ? row.snapshot : null;
  if (!snap) return null;
  if (_trim(snap.userId) && _trim(snap.userId) !== expectId) return null;

  const consume = !options || options.consume !== false;
  if (consume) {
    delete memoryContexts[key];
    try {
      wx.removeStorageSync(CONTEXT_STORAGE_PREFIX + key);
    } catch (e) { /* ignore */ }
  }
  return {
    name: _trim(snap.name || snap.nickname),
    nickname: _trim(snap.nickname || snap.name),
    avatar: _trim(snap.avatar),
    gender: snap.gender,
    handicap: snap.handicap,
    floatCoef: snap.floatCoef,
    userType: _trim(snap.userType),
    identitySource: _trim(snap.identitySource) || 'matchSnapshot'
  };
}

/**
 * @param {{
 *   userId?: string,
 *   playerId?: string,
 *   name?: string,
 *   publicName?: string,
 *   nickname?: string,
 *   matchNickname?: string,
 *   competitionName?: string,
 *   avatar?: string,
 *   gender?: string,
 *   handicap?: *,
 *   floatCoef?: *,
 *   userType?: string,
 *   identitySource?: string,
 *   tab?: 'home'|'history'|'feed',
 *   silent?: boolean
 * }} options
 * @returns {boolean} 是否已发起导航
 */
function openPlayerProfile(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const userId = resolveOpenableUserId(opts);
  if (!userId) {
    if (!opts.silent) {
      /* 无稳定 ID：静默拒绝（领先榜/报名已隐藏入口） */
    }
    return false;
  }

  const contextToken = createPlayerProfileNavigationContext(opts);
  const q = ['userId=' + encodeURIComponent(userId)];
  if (contextToken) {
    q.push('contextToken=' + encodeURIComponent(contextToken));
  } else {
    // 无 context 时仍传轻量公开字段（兼容）；禁止把备注展示名当公开昵称
    const publicName = resolvePublicSnapshotName(opts);
    const avatar = _trim(opts.avatar);
    const identitySource = _trim(opts.identitySource);
    if (publicName) q.push('name=' + encodeURIComponent(publicName));
    if (avatar) q.push('avatar=' + encodeURIComponent(avatar));
    if (identitySource) q.push('identitySource=' + encodeURIComponent(identitySource));
  }
  // 可选初始 TAB（测试 / 深链）：home | history | feed
  const tab = _trim(opts.tab).toLowerCase();
  if (tab === 'home' || tab === 'history' || tab === 'feed') {
    q.push('tab=' + encodeURIComponent(tab));
  }

  const url = PROFILE_PAGE_URL + '?' + q.join('&');
  wx.navigateTo({
    url: url,
    fail: function () {
      wx.showToast({ title: '暂时无法打开球员主页', icon: 'none', duration: 1200 });
    }
  });
  return true;
}

module.exports = {
  PROFILE_PAGE_URL: PROFILE_PAGE_URL,
  resolveOpenableUserId: resolveOpenableUserId,
  resolvePublicSnapshotName: resolvePublicSnapshotName,
  createPlayerProfileNavigationContext: createPlayerProfileNavigationContext,
  takePlayerProfileNavigationContext: takePlayerProfileNavigationContext,
  openPlayerProfile: openPlayerProfile
};
