/**
 * 统一「加关注」关系行为
 * - 推荐移除并进入 following；若对方已粉我 → 好友
 * - 粉丝/新粉丝加关注 → 互关好友
 * - 领先榜加关注 → following；互关则好友
 */
const contactNotifyStore = require('./contactNotifyStore.js');

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
    gender: src.gender === 'female' ? 'female' : 'male',
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

/**
 * @returns {'friend'|'following'|null}
 */
function applyFollow(store, rawUser) {
  if (!store) return null;
  const user = normalizeUser(rawUser);
  if (!user.id) return null;

  store.recommendations = (store.recommendations || []).filter(
    (r) => String(r.id) !== user.id
  );

  const newIdx = (store.newFollowers || []).findIndex((f) => String(f.id) === user.id);
  const fromNewFollower = newIdx >= 0;
  if (fromNewFollower) {
    store.newFollowers.splice(newIdx, 1);
    contactNotifyStore.markReadByTypeAndUser(
      contactNotifyStore.TYPE.NEW_FOLLOWER,
      user.id
    );
  }

  let inFollowers = (store.followers || []).some((f) => String(f.id) === user.id);
  if (fromNewFollower && !inFollowers) {
    store.followers.push(
      Object.assign({}, user, {
        mutual: true,
        isNew: false,
        relation: 'follower'
      })
    );
    inFollowers = true;
  } else if (inFollowers) {
    store.followers = (store.followers || []).map((f) =>
      String(f.id) === user.id
        ? Object.assign({}, f, { mutual: true, isNew: false })
        : f
    );
  }

  const alreadyFollowing = (store.following || []).some((f) => String(f.id) === user.id);
  if (!alreadyFollowing) {
    store.following.push(
      Object.assign({}, user, {
        mutual: !!inFollowers,
        isNew: false,
        remark: user.remark || '',
        remarkPinyin: user.remarkPinyin || ''
      })
    );
  } else {
    store.following = (store.following || []).map((f) =>
      String(f.id) === user.id
        ? Object.assign({}, f, { mutual: !!inFollowers, isNew: false })
        : f
    );
  }

  syncMutualFriends(store);
  return inFollowers ? 'friend' : 'following';
}

function followUser(rawUser) {
  return applyFollow(ensureStore(), rawUser);
}

/** none | following | friend */
function getRelationStatus(userId) {
  const store = boundStore;
  const id = String(userId || '').trim();
  if (!store || !id) return 'none';
  const following = (store.following || []).some((f) => String(f.id) === id);
  const follower = (store.followers || []).some((f) => String(f.id) === id);
  if (following && follower) return 'friend';
  if (following) return 'following';
  return 'none';
}

function buildRelationMap(ids) {
  const map = {};
  (ids || []).forEach((id) => {
    const key = String(id || '').trim();
    if (!key) return;
    map[key] = getRelationStatus(key);
  });
  return map;
}

module.exports = {
  bindStore,
  getStore,
  ensureStore,
  createEmptyStore,
  applyFollow,
  followUser,
  getRelationStatus,
  buildRelationMap,
  syncMutualFriends
};
