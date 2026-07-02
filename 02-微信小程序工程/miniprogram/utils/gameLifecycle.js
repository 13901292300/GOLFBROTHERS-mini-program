/**
 * 普通球局生命周期：硬删除比赛及所有本地关联数据。
 */
const gameStore = require('./gameStore.js');
const matchState = require('./matchState.js');

/** 硬删除 game 实体，并清除 matchState / 会话缓存等所有本地引用 */
function purgeGameCompletely(gameId) {
  if (!gameId) return false;

  gameStore.removeGame(gameId);

  const ms = matchState.getMatchState();
  if (ms && ms.gameId === gameId) {
    matchState.clearMatchState();
  }

  try {
    const app = getApp();
    const sessions = app.globalData && app.globalData.scoreSessions;
    if (sessions && typeof sessions === 'object') {
      Object.keys(sessions).forEach((key) => {
        if (key.indexOf(gameId) !== -1) delete sessions[key];
      });
    }
  } catch (e) {
    // 忽略 globalData 清理异常
  }

  return true;
}

module.exports = {
  purgeGameCompletely
};
