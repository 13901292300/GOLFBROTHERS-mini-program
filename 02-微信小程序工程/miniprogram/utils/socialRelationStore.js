/**
 * 关注关系唯一持久化源（本地 MVP，结构可替换云端 API）。
 * 边：followerUserId → targetUserId；friend 由双向 active 推导，不落盘。
 */

const STORAGE_KEY = 'gb_social_relations_v1';
const userIdentityAlias = require('./userIdentityAlias.js');
const userProfileStore = require('./userProfileStore.js');
const gameStore = require('./gameStore.js');
const playerIdentityGuard = require('./playerIdentityGuard.js');

/**
 * 演示互关种子（仅首次空库幂等写入一次；不覆盖用户后续操作）。
 * id 与通讯录 MOCK_FRIENDS / MOCK_FOLLOWERS_EXTRA 对齐。
 */
const DEMO_MUTUAL_IDS = [
  'c-1001',
  'c-1013',
  'c-1002',
  'c-1004',
  'c-1005',
  'c-1006',
  'c-1007',
  'c-1008',
  'c-1009',
  'c-1010',
  'c-1011',
  'c-1012'
];
/** 单向粉丝：对方关注我，我未回关 */
const DEMO_FOLLOWER_ONLY_IDS = ['c-x01'];
/** 单向关注：我关注对方，对方未回关 */
const DEMO_FOLLOWING_ONLY_IDS = ['fo-3001', 'fo-3002'];

function _trim(v) {
  return v == null ? '' : String(v).trim();
}

function _now() {
  return Date.now();
}

function resolveCanonicalUserId(userId) {
  const id = _trim(userId);
  if (!id) return '';
  try {
    return _trim(userIdentityAlias.resolveCanonicalUserId(id)) || id;
  } catch (e) {
    return id;
  }
}

function resolveCurrentUserId() {
  try {
    const u = gameStore.getCurrentUser() || {};
    if (u.userId) return resolveCanonicalUserId(u.userId);
  } catch (e) { /* ignore */ }
  try {
    const p = userProfileStore.loadProfile() || {};
    if (p.userId) return resolveCanonicalUserId(p.userId);
  } catch (e) { /* ignore */ }
  return 'me';
}

/** 关注边合法目标：与公开主页主键同一规则源 */
function isStableRelationUserId(userId, options) {
  return playerIdentityGuard.isStablePublicUserId(userId, options);
}

function _emptyDoc() {
  return {
    version: 1,
    seededDemoAt: 0,
    edges: []
  };
}

function _readDoc() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw || typeof raw !== 'object') return _emptyDoc();
    const edges = Array.isArray(raw.edges) ? raw.edges : [];
    return {
      version: 1,
      seededDemoAt: Number(raw.seededDemoAt) || 0,
      edges: edges
    };
  } catch (e) {
    return _emptyDoc();
  }
}

function _writeDoc(doc) {
  try {
    wx.setStorageSync(STORAGE_KEY, doc || _emptyDoc());
  } catch (e) {
    /* ignore */
  }
}

function _normalizeEdge(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const followerUserId = resolveCanonicalUserId(raw.followerUserId);
  const targetUserId = resolveCanonicalUserId(raw.targetUserId);
  if (!isStableRelationUserId(followerUserId) || !isStableRelationUserId(targetUserId)) {
    return null;
  }
  if (followerUserId === targetUserId) return null;
  const status = String(raw.status || 'active').trim() === 'active' ? 'active' : 'inactive';
  const createdAt = Number(raw.createdAt) || _now();
  const updatedAt = Number(raw.updatedAt) || createdAt;
  return {
    followerUserId: followerUserId,
    targetUserId: targetUserId,
    status: status,
    createdAt: createdAt,
    updatedAt: updatedAt
  };
}

function _edgeKey(followerUserId, targetUserId) {
  return followerUserId + '=>' + targetUserId;
}

function _findEdgeIndex(edges, followerUserId, targetUserId) {
  const f = resolveCanonicalUserId(followerUserId);
  const t = resolveCanonicalUserId(targetUserId);
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (!e) continue;
    if (
      resolveCanonicalUserId(e.followerUserId) === f &&
      resolveCanonicalUserId(e.targetUserId) === t
    ) {
      return i;
    }
  }
  return -1;
}

function listActiveEdges() {
  const doc = _readDoc();
  return (doc.edges || [])
    .map(_normalizeEdge)
    .filter((e) => e && e.status === 'active');
}

function hasActiveFollow(followerUserId, targetUserId) {
  const f = resolveCanonicalUserId(followerUserId);
  const t = resolveCanonicalUserId(targetUserId);
  if (!isStableRelationUserId(f) || !isStableRelationUserId(t) || f === t) return false;
  const edges = listActiveEdges();
  return edges.some(
    (e) => e.followerUserId === f && e.targetUserId === t
  );
}

/**
 * @returns {'none'|'following'|'friend'}
 */
function getRelationStatus(currentUserId, targetUserId) {
  let viewer = currentUserId;
  let target = targetUserId;
  if (arguments.length < 2) {
    target = currentUserId;
    viewer = resolveCurrentUserId();
  }
  const v = resolveCanonicalUserId(viewer);
  const t = resolveCanonicalUserId(target);
  if (!isStableRelationUserId(v) || !isStableRelationUserId(t) || v === t) {
    return 'none';
  }
  const iFollow = hasActiveFollow(v, t);
  const theyFollow = hasActiveFollow(t, v);
  if (iFollow && theyFollow) return 'friend';
  if (iFollow) return 'following';
  return 'none';
}

function buildRelationMap(currentUserId, ids) {
  let viewer = currentUserId;
  let list = ids;
  if (arguments.length < 2 || !Array.isArray(ids)) {
    list = currentUserId;
    viewer = resolveCurrentUserId();
  }
  const map = {};
  (list || []).forEach((id) => {
    const key = _trim(id);
    if (!key) return;
    map[key] = getRelationStatus(viewer, key);
  });
  return map;
}

/**
 * 关注：幂等。
 * @returns {'following'|'friend'|null}
 */
function follow(followerUserId, targetUserId) {
  const f = resolveCanonicalUserId(followerUserId || resolveCurrentUserId());
  const t = resolveCanonicalUserId(targetUserId);
  if (!isStableRelationUserId(f) || !isStableRelationUserId(t) || f === t) {
    return null;
  }
  const doc = _readDoc();
  const edges = Array.isArray(doc.edges) ? doc.edges.slice() : [];
  const idx = _findEdgeIndex(edges, f, t);
  const ts = _now();
  if (idx >= 0) {
    const prev = _normalizeEdge(edges[idx]) || edges[idx];
    edges[idx] = {
      followerUserId: f,
      targetUserId: t,
      status: 'active',
      createdAt: prev.createdAt || ts,
      updatedAt: ts
    };
  } else {
    edges.push({
      followerUserId: f,
      targetUserId: t,
      status: 'active',
      createdAt: ts,
      updatedAt: ts
    });
  }
  doc.edges = edges;
  _writeDoc(doc);
  return hasActiveFollow(t, f) ? 'friend' : 'following';
}

/**
 * 取消关注：幂等。
 * @returns {boolean} 是否已不存在 active 关注
 */
function unfollow(followerUserId, targetUserId) {
  const f = resolveCanonicalUserId(followerUserId || resolveCurrentUserId());
  const t = resolveCanonicalUserId(targetUserId);
  if (!isStableRelationUserId(f) || !isStableRelationUserId(t) || f === t) {
    return true;
  }
  const doc = _readDoc();
  const edges = Array.isArray(doc.edges) ? doc.edges.slice() : [];
  const idx = _findEdgeIndex(edges, f, t);
  if (idx < 0) return true;
  const prev = edges[idx] || {};
  edges[idx] = {
    followerUserId: f,
    targetUserId: t,
    status: 'inactive',
    createdAt: Number(prev.createdAt) || _now(),
    updatedAt: _now()
  };
  doc.edges = edges;
  _writeDoc(doc);
  return true;
}

function getFollowingCount(userId) {
  const id = resolveCanonicalUserId(userId || resolveCurrentUserId());
  if (!isStableRelationUserId(id)) return 0;
  let n = 0;
  listActiveEdges().forEach((e) => {
    if (e.followerUserId === id) n += 1;
  });
  return n;
}

function getFollowerCount(userId) {
  const id = resolveCanonicalUserId(userId || resolveCurrentUserId());
  if (!isStableRelationUserId(id)) return 0;
  let n = 0;
  listActiveEdges().forEach((e) => {
    if (e.targetUserId === id) n += 1;
  });
  return n;
}

function getSocialCounts(userId) {
  const id = resolveCanonicalUserId(userId || resolveCurrentUserId());
  return {
    followingCount: getFollowingCount(id),
    followerCount: getFollowerCount(id)
  };
}

function listFollowingIds(userId) {
  const id = resolveCanonicalUserId(userId || resolveCurrentUserId());
  if (!isStableRelationUserId(id)) return [];
  const out = [];
  const seen = {};
  listActiveEdges().forEach((e) => {
    if (e.followerUserId !== id) return;
    if (seen[e.targetUserId]) return;
    seen[e.targetUserId] = true;
    out.push(e.targetUserId);
  });
  return out;
}

function listFollowerIds(userId) {
  const id = resolveCanonicalUserId(userId || resolveCurrentUserId());
  if (!isStableRelationUserId(id)) return [];
  const out = [];
  const seen = {};
  listActiveEdges().forEach((e) => {
    if (e.targetUserId !== id) return;
    if (seen[e.followerUserId]) return;
    seen[e.followerUserId] = true;
    out.push(e.followerUserId);
  });
  return out;
}

/**
 * 首次空库幂等种子演示互关 / 单向粉丝；已 seed 或已有边则跳过。
 */
function ensureDemoSeedOnce() {
  const doc = _readDoc();
  if (doc.seededDemoAt) return false;
  if ((doc.edges || []).length > 0) {
    doc.seededDemoAt = _now();
    _writeDoc(doc);
    return false;
  }
  const me = resolveCurrentUserId() || 'me';
  const ts = _now();
  const edges = [];
  const push = (f, t) => {
    if (!isStableRelationUserId(f) || !isStableRelationUserId(t) || f === t) return;
    edges.push({
      followerUserId: f,
      targetUserId: t,
      status: 'active',
      createdAt: ts,
      updatedAt: ts
    });
  };
  DEMO_MUTUAL_IDS.forEach((id) => {
    push(me, id);
    push(id, me);
  });
  DEMO_FOLLOWER_ONLY_IDS.forEach((id) => {
    push(id, me);
  });
  DEMO_FOLLOWING_ONLY_IDS.forEach((id) => {
    push(me, id);
  });
  doc.edges = edges;
  doc.seededDemoAt = ts;
  _writeDoc(doc);
  return true;
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  DEMO_MUTUAL_IDS: DEMO_MUTUAL_IDS,
  resolveCurrentUserId: resolveCurrentUserId,
  resolveCanonicalUserId: resolveCanonicalUserId,
  isStableRelationUserId: isStableRelationUserId,
  listActiveEdges: listActiveEdges,
  hasActiveFollow: hasActiveFollow,
  getRelationStatus: getRelationStatus,
  buildRelationMap: buildRelationMap,
  follow: follow,
  unfollow: unfollow,
  getFollowingCount: getFollowingCount,
  getFollowerCount: getFollowerCount,
  getSocialCounts: getSocialCounts,
  listFollowingIds: listFollowingIds,
  listFollowerIds: listFollowerIds,
  ensureDemoSeedOnce: ensureDemoSeedOnce
};
