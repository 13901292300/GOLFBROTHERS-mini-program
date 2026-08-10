/**
 * 统一「加关注」关系行为（适配层）。
 * 权威持久化：socialRelationStore；boundStore 仅服务通讯录 UI 卡片。
 * - 关注 / 取消关注写 Storage
 * - friend 由互相关注推导
 * - getRelationStatus / buildRelationMap / 计数均读同一 Store
 */
const contactNotifyStore = require('./contactNotifyStore.js');
const socialRelationStore = require('./socialRelationStore.js');

let boundStore = null;

function cloneRaw(user) {
  return Object.assign({}, user || {});
}

function idSet(list) {
  const map = {};
  (list || []).forEach((item) => {
    const id = item && item.id;
    if (id) map[id] = true;
  });
  return map;
}

function createEmptyStore() {
  return {
    friends: [],
    following: [],
    followers: [],
    newFollowers: [],
    recommendations: []
  };
}

function bindStore(store) {
  boundStore = store || null;
}

function getStore() {
  return boundStore;
}

function ensureStore() {
  socialRelationStore.ensureDemoSeedOnce();
  if (!boundStore) boundStore = createEmptyStore();
  return boundStore;
}

function normalizeUser(input) {
  const src = input || {};
  const id = String(src.id || src.playerId || src.userId || '').trim();
  const nickname = String(src.nickname || src.name || id).trim();
  const remark = String(src.remark || '').trim();
  const pinyinSeed = String(
    src.nicknamePinyin || src.remarkPinyin || nickname || id
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  return {
    id: id,
    nickname: nickname,
    remark: remark,
    nicknamePinyin: String(src.nicknamePinyin || pinyinSeed).trim().toLowerCase(),
    remarkPinyin: String(src.remarkPinyin || '').trim().toLowerCase(),
    gender: src.gender === 'female' ? 'female' : src.gender === 'male' ? 'male' : src.gender || '',
    handicap: src.handicap != null ? src.handicap : '',
    floatCoef: src.floatCoef != null ? src.floatCoef : 0,
    signature: String(src.signature || '').trim(),
    avatarIndex: src.avatarIndex,
    avatar: src.avatar || '',
    mutual: !!src.mutual,
    isNew: false,
    relation: src.relation || ''
  };
}

function syncMutualFriends(store) {
  if (!store) return;
  const followingIds = idSet(store.following);
  const next = [];
  const seen = {};
  (store.followers || []).forEach((f) => {
    const id = f && f.id;
    if (!id || !followingIds[id] || seen[id]) return;
    seen[id] = true;
    next.push(Object.assign({}, f, { mutual: true, isNew: false }));
  });
  store.friends = next;
}

function _collectCardIndex(store) {
  const map = {};
  if (!store) return map;
  const buckets = [
    store.friends,
    store.following,
    store.followers,
    store.newFollowers,
    store.recommendations
  ];
  buckets.forEach((list) => {
    (list || []).forEach((u) => {
      if (u && u.id && !map[u.id]) map[u.id] = u;
    });
  });
  return map;
}

/**
 * 用持久化边重建 boundStore 的 following / followers / friends（保留卡片资料）。
 */
function hydrateBoundStoreFromPersistence(store) {
  const s = store || ensureStore();
  socialRelationStore.ensureDemoSeedOnce();
  const me = socialRelationStore.resolveCurrentUserId();
  const cards = _collectCardIndex(s);
  const followingIds = socialRelationStore.listFollowingIds(me);
  const followerIds = socialRelationStore.listFollowerIds(me);

  const toCard = (id) => {
    const prev = cards[id];
    if (prev) return Object.assign({}, prev, { id: id, isNew: false });
    return normalizeUser({ id: id, userId: id, nickname: id });
  };

  s.following = followingIds.map((id) => {
    const card = toCard(id);
    const mutual = followerIds.indexOf(id) >= 0;
    return Object.assign({}, card, { mutual: mutual, isNew: false });
  });
  s.followers = followerIds.map((id) => {
    const card = toCard(id);
    const mutual = followingIds.indexOf(id) >= 0;
    return Object.assign({}, card, {
      mutual: mutual,
      isNew: false,
      relation: 'follower'
    });
  });
  syncMutualFriends(s);
  return s;
}

/**
 * @returns {'friend'|'following'|null}
 */
function applyFollow(store, rawUser) {
  const s = store || ensureStore();
  const user = normalizeUser(rawUser);
  if (!user.id || !socialRelationStore.isStableRelationUserId(user.id)) return null;

  const me = socialRelationStore.resolveCurrentUserId();
  if (socialRelationStore.resolveCanonicalUserId(user.id) === socialRelationStore.resolveCanonicalUserId(me)) {
    return null;
  }

  const status = socialRelationStore.follow(me, user.id);
  if (!status) return null;

  s.recommendations = (s.recommendations || []).filter(
    (r) => String(r.id) !== user.id
  );

  const newIdx = (s.newFollowers || []).findIndex((f) => String(f.id) === user.id);
  const fromNewFollower = newIdx >= 0;
  if (fromNewFollower) {
    s.newFollowers.splice(newIdx, 1);
    contactNotifyStore.markReadByTypeAndUser(
      contactNotifyStore.TYPE.NEW_FOLLOWER,
      user.id
    );
  }

  hydrateBoundStoreFromPersistence(s);

  // 用最新用户卡片补全 following 中的展示字段
  s.following = (s.following || []).map((f) =>
    String(f.id) === user.id
      ? Object.assign({}, f, user, {
          mutual: status === 'friend',
          isNew: false
        })
      : f
  );
  syncMutualFriends(s);
  return status;
}

function followUser(rawUser) {
  ensureStore();
  return applyFollow(boundStore, rawUser);
}

/**
 * 取消关注（幂等）。
 * @param {string} [currentUserIdOrTarget]
 * @param {string} [targetUserId]
 * @returns {boolean}
 */
function unfollowUser(currentUserIdOrTarget, targetUserId) {
  let follower = currentUserIdOrTarget;
  let target = targetUserId;
  if (arguments.length < 2) {
    target = currentUserIdOrTarget;
    follower = socialRelationStore.resolveCurrentUserId();
  }
  const ok = socialRelationStore.unfollow(follower, target);
  if (boundStore) hydrateBoundStoreFromPersistence(boundStore);
  return ok;
}

/**
 * none | following | friend
 * 兼容：getRelationStatus(targetId) 或 getRelationStatus(currentId, targetId)
 */
function getRelationStatus(currentUserIdOrTarget, targetUserId) {
  socialRelationStore.ensureDemoSeedOnce();
  if (arguments.length >= 2) {
    return socialRelationStore.getRelationStatus(currentUserIdOrTarget, targetUserId);
  }
  return socialRelationStore.getRelationStatus(
    socialRelationStore.resolveCurrentUserId(),
    currentUserIdOrTarget
  );
}

function buildRelationMap(ids) {
  socialRelationStore.ensureDemoSeedOnce();
  return socialRelationStore.buildRelationMap(
    socialRelationStore.resolveCurrentUserId(),
    ids
  );
}

function getFollowingCount(userId) {
  socialRelationStore.ensureDemoSeedOnce();
  return socialRelationStore.getFollowingCount(userId);
}

function getFollowerCount(userId) {
  socialRelationStore.ensureDemoSeedOnce();
  return socialRelationStore.getFollowerCount(userId);
}

function getSocialCounts(userId) {
  socialRelationStore.ensureDemoSeedOnce();
  return socialRelationStore.getSocialCounts(userId);
}

module.exports = {
  bindStore,
  getStore,
  ensureStore,
  createEmptyStore,
  applyFollow,
  followUser,
  unfollowUser,
  getRelationStatus,
  buildRelationMap,
  syncMutualFriends,
  hydrateBoundStoreFromPersistence,
  getFollowingCount,
  getFollowerCount,
  getSocialCounts,
  normalizeUser
};
