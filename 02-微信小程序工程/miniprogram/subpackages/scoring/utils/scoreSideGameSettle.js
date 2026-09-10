/**
 * 记分页成绩 mutation 后调用 side-game settlement。
 * 真机通过 game 分包 host 组件调用（分包不可直接 require 游戏 JS）。
 * Node 测试可回退 require coordinator。
 */
function settleSideGamesForScoreMutation(official, host) {
  if (host && typeof host.settleForOfficial === 'function') {
    try {
      return host.settleForOfficial(official || {});
    } catch (e) {
      return {
        ok: false,
        error: String((e && e.message) || e),
        keptOfficialScores: true
      };
    }
  }
  try {
    var coord = require('../../game/utils/sideGameSettleCoordinator.js');
    return coord.settleSideGamesForScoreMutation(official || {});
  } catch (e) {
    return {
      ok: false,
      error: 'coordinator-unavailable',
      keptOfficialScores: true
    };
  }
}

module.exports = {
  settleSideGamesForScoreMutation: settleSideGamesForScoreMutation
};
