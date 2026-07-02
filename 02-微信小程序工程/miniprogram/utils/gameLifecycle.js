/**
 * 普通球局生命周期：硬删除比赛及所有本地关联数据。
 */
const gameStore = require('./gameStore.js');
const matchState = require('./matchState.js');

/** 清除 globalData 中与 gameId 相关的会话缓存 */
function _purgeGlobalSessions(gameId) {
  try {
    const app = getApp();
    if (!app || !app.globalData) return;
    const sessions = app.globalData.scoreSessions;
    if (!sessions || typeof sessions !== 'object') return;
    Object.keys(sessions).forEach((key) => {
      if (key.indexOf(gameId) !== -1) delete sessions[key];
    });
  } catch (e) {
    // 忽略 globalData 清理异常
  }
}

/** 硬删除 game 实体，并清除 matchState / 会话缓存等所有本地引用 */
function purgeGameCompletely(gameId) {
  if (!gameId) return false;

  const existed = !!gameStore.getGame(gameId);
  gameStore.removeGame(gameId);

  const ms = matchState.getMatchState();
  if (ms && ms.gameId === gameId) {
    matchState.clearMatchState();
  }

  _purgeGlobalSessions(gameId);

  try {
    const app = getApp();
    if (app) {
      app.globalData = app.globalData || {};
      app.globalData.gamesDirty = true;
    }
  } catch (e) {
    // 忽略
  }

  return existed;
}

module.exports = {
  purgeGameCompletely
};
