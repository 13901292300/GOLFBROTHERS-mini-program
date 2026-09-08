/**
 * 把「我的」资料（昵称 / 头像 / 性别）同步到当前登录用户身份（新建比赛用）。
 * 已有比赛的头像/昵称展示由 playerLiveDisplay 在记分页覆盖，不批量改写历史赛事。
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
