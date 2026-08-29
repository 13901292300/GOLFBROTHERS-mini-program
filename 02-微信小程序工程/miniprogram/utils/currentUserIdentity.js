/**
 * 把「我的」资料（昵称 / 头像 / 性别）同步到当前用户身份，并回写已有 GAME / 球队赛。
 */

const gameStore = require('./gameStore.js');

const SKIP_KEYS = {
  scores: true,
  putts: true,
  fairways: true,
  penalties: true,
  sands: true,
  holePars: true,
  scoresByPlayer: true
};

function isPlayerLike(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  return !!(node.playerId || node.userId || node.playerUserId);
}

function isSelfPlayer(node, userId) {
  const uid = String(userId || 'me').trim() || 'me';
  const ids = [node.playerId, node.userId, node.playerUserId, node.id];
  for (let i = 0; i < ids.length; i++) {
    const id = String(ids[i] || '').trim();
    if (id && (id === uid || id === 'me')) return true;
  }
  return false;
}

function patchSelfPlayer(node, identity) {
  const name = String((identity && identity.name) || '').trim();
  const displayName = String((identity && identity.displayName) || name).trim();
  const nickname = String((identity && identity.nickname) || name).trim();
  const avatar = String((identity && identity.avatar) || '').trim();
  const gender = String((identity && identity.gender) || '').trim();

  if (name) node.name = name;
  if (nickname) node.nickname = nickname;
  if (displayName) {
    node.displayName = displayName;
    node.matchNickname = displayName;
    node.competitionName = displayName;
  }
  if (avatar) node.avatar = avatar;
  if (gender) node.gender = gender;
}

function walk(node, userId, identity) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item) => walk(item, userId, identity));
    return;
  }
  if (isPlayerLike(node) && isSelfPlayer(node, userId)) {
    patchSelfPlayer(node, identity);
  }
  Object.keys(node).forEach((key) => {
    if (SKIP_KEYS[key]) return;
    walk(node[key], userId, identity);
  });
}

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

function applySavedProfile(profile) {
  const identity = identityFromProfile(profile);
  if (gameStore.applyCurrentUserIdentity) {
    gameStore.applyCurrentUserIdentity({
      name: identity.name,
      avatar: identity.avatar,
      gender: identity.gender
    });
  }

  const games = gameStore.listGames() || [];
  games.forEach((game) => {
    walk(game, identity.userId, identity);
    gameStore.saveGame(game);
  });

  try {
    const teamMatchStore = require('./teamMatchStore.js');
    const matches = teamMatchStore.listMatches() || [];
    matches.forEach((match) => {
      walk(match, identity.userId, identity);
      teamMatchStore.saveMatch(match);
    });
  } catch (e) {
    /* ignore */
  }

  return identity;
}

module.exports = {
  applySavedProfile,
  identityFromProfile
};
