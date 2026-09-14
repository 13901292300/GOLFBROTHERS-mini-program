/**
 * 把「我的」资料同步到 CURRENT_USER 兼容缓存（新建比赛默认值）。
 * 这不是账号资料权威源；权威仍是 userProfileStore.loadProfile / resolveCurrentAccountProfile。
 * applySavedProfile 可继续复制 nickname / avatar / gender / displayName，供旧读取路径使用。
 */

const gameStore = require('./gameStore.js');

function identityFromProfile(profile) {
  const p = profile || {};
  const nickname = String(p.nickname || '').trim();
  const displayName = String(p.displayName || p.competitionName || nickname).trim();
  return {
    userId: String(p.userId || 'me').trim() || 'me',
    name: nickname || displayName,
    nickname: nickname,
    displayName: displayName || nickname,
    avatar: String(p.avatar || '').trim(),
    gender: String(p.gender || '').trim()
  };
}

function getDisplayIdentity() {
  try {
    const userProfileStore = require('./userProfileStore.js');
    return identityFromProfile(userProfileStore.loadProfile() || {});
  } catch (e) {
    return identityFromProfile({});
  }
}

function applySavedProfile(profile) {
  const identity = identityFromProfile(profile);
  if (gameStore.applyCurrentUserIdentity) {
    gameStore.applyCurrentUserIdentity({
      name: identity.name,
      avatar: identity.avatar,
      gender: identity.gender
    });
  }
  try {
    const clubIdentity = require('./teamClub/identity.js');
    const uid = String(clubIdentity.currentUserIdOrEmpty() || '').trim();
    if (uid) {
      clubIdentity.writeSession({
        userId: uid,
        displayName: identity.nickname || identity.displayName,
        avatar: identity.avatar
      });
    }
  } catch (e) {
    /* ignore */
  }
  return identity;
}

module.exports = {
  applySavedProfile,
  identityFromProfile,
  getDisplayIdentity
};
