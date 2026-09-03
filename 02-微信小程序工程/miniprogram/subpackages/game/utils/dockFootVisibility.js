/**
 * 赛事详情游戏 TAB：吸附汇总行显隐（布局计算，不改玩法/结果数据）。
 * 自然汇总行仍用 game-tab 同一份 board.totals。
 */
function shouldShowDockFoot(input) {
  if (!input) return false;
  if (!input.layoutIsFlow || !input.tabIsGame || !input.hasResults) return false;
  var vpTop = Number(input.viewportTop);
  var vpBottom = Number(input.viewportBottom);
  if (!(vpBottom > vpTop)) return false;
  var game = input.gameRect;
  if (!game) return false;
  if (!(game.bottom > vpTop) || !(game.top < vpBottom)) return false;
  var reserve = Number(input.bottomReserve) || 0;
  var visibleBottom = vpBottom - Math.max(0, reserve);
  var foot = input.footRect;
  if (!foot) return false;
  var footInView = foot.top < visibleBottom && foot.bottom > vpTop;
  return !footInView;
}

function resolveBottomReserve(sys) {
  var info = sys || {};
  var safe = 0;
  if (info.safeAreaInsets && typeof info.safeAreaInsets.bottom === 'number') {
    safe = info.safeAreaInsets.bottom;
  } else if (info.safeArea && typeof info.screenHeight === 'number') {
    safe = Math.max(0, info.screenHeight - info.safeArea.bottom);
  }
  var nav = Number(info.tabBarHeight) || 0;
  return safe + nav;
}

/** 逐洞表自然高度（rpx 行高换算），不依赖 flex 父级。 */
function estimateFlowBoardMinHeightPx(board, winW) {
  var holes = ((board && board.holes) || []).length;
  var w = Number(winW) || 375;
  var rpx = (w / 750) * (120 + holes * 80 + 80);
  return Math.round(rpx);
}

module.exports = {
  shouldShowDockFoot: shouldShowDockFoot,
  resolveBottomReserve: resolveBottomReserve,
  estimateFlowBoardMinHeightPx: estimateFlowBoardMinHeightPx
};
