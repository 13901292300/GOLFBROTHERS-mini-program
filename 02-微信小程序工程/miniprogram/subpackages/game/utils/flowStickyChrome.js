/**
 * 赛事详情 game-tab flow：三层吸顶 top 与底部汇总（不改玩法数据）。
 */
function shouldAlwaysDockFoot(input) {
  if (!input) return false;
  return !!(input.layoutIsFlow && input.tabIsGame && input.hasResults);
}

function computeFootSpacerPx(footHeight, fallbackReserve) {
  var h = Number(footHeight) || 0;
  if (h > 0) return Math.ceil(h);
  return Math.ceil(Number(fallbackReserve) || 0);
}

function computeFlowSticky(input) {
  var tabBottom = Number(input && input.tabBottom) || 0;
  var pinH = Math.max(0, Number(input && input.pinHeight) || 0);
  var headH = Math.max(0, Number(input && input.headHeight) || 0);
  var out = {
    pinStuck: false,
    headStuck: false,
    pinTop: tabBottom,
    headTop: tabBottom + pinH,
    pinPlaceholder: 0,
    headPlaceholder: 0
  };
  if (!input || !input.layoutIsFlow || !input.tabIsGame || !input.hasResults) {
    return out;
  }
  if (!(tabBottom > 0)) return out;
  var game = input.gameRect;
  if (!game || !(game.bottom > tabBottom)) return out;
  var pinSlot = input.pinSlotRect;
  if (pinSlot && pinSlot.top <= tabBottom + 0.5) {
    out.pinStuck = true;
    out.pinPlaceholder = pinH;
  }
  var headLimit = tabBottom + (out.pinStuck ? pinH : 0);
  out.headTop = headLimit;
  var headSlot = input.headSlotRect;
  if (out.pinStuck && headSlot && headSlot.top <= headLimit + 0.5) {
    out.headStuck = true;
    out.headPlaceholder = headH;
  }
  return out;
}

function topsAreContinuous(tabBottom, pinTop, pinH, headTop, eps) {
  var e = eps == null ? 1 : Number(eps);
  if (Math.abs(pinTop - tabBottom) > e) return false;
  if (Math.abs(headTop - (tabBottom + pinH)) > e) return false;
  return true;
}

module.exports = {
  shouldAlwaysDockFoot: shouldAlwaysDockFoot,
  computeFootSpacerPx: computeFootSpacerPx,
  computeFlowSticky: computeFlowSticky,
  topsAreContinuous: topsAreContinuous
};
