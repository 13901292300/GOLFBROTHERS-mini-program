/**
 * game-tab 逐洞表列宽（与记分页同一套公式）。
 * 不负责玩法结算；仅布局。
 */
var VISIBLE_COLS = 4;
var HOLE_RPX = 168;

function buildBoardLayout(playerCount, winW) {
  var w = Number(winW) || 375;
  var holePx = (HOLE_RPX / 750) * w;
  var rightPx = Math.max(120, w - holePx);
  var cols = Math.max(1, Number(playerCount) || 1);
  var needHScroll = cols > VISIBLE_COLS;
  var colPx = needHScroll ? rightPx / VISIBLE_COLS : rightPx / cols;
  var bodyWidthPx = Math.floor(colPx * cols * 100) / 100;
  var hole = Math.floor(holePx * 100) / 100;
  var col = Math.floor(colPx * 100) / 100;
  return {
    needHScroll: needHScroll,
    colPx: col,
    bodyWidthPx: bodyWidthPx,
    holePx: hole,
    tableWidthPx: needHScroll ? hole + bodyWidthPx : w,
    visibleCols: VISIBLE_COLS
  };
}

module.exports = {
  VISIBLE_COLS: VISIBLE_COLS,
  HOLE_RPX: HOLE_RPX,
  buildBoardLayout: buildBoardLayout
};
