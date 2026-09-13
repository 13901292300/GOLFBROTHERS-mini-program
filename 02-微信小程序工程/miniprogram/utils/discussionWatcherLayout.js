/**
 * 围观一行容量：按实测/换算宽度，不按固定人数。
 * 放得下全部则不显示「更多」；否则预留「更多」宽度，只放能完整容纳的用户。
 */

function rpxToPx(rpx, windowWidth) {
  var w = Number(windowWidth);
  if (!Number.isFinite(w) || w <= 0) w = 375;
  return ((Number(rpx) || 0) / 750) * w;
}

/** 与 discussion / detail 围观行样式对齐的设计尺寸（rpx） */
var TOKENS = {
  padRpx: 28,
  gapRpx: 20,
  avatarRpx: 72,
  moreFallbackRpx: 128,
  labelFallbackRpx: 48
};

function itemWidthFromTokens(windowWidth) {
  return rpxToPx(TOKENS.avatarRpx, windowWidth);
}

function fallbackMetrics(windowWidth) {
  return {
    padPx: rpxToPx(TOKENS.padRpx * 2, windowWidth),
    gapPx: rpxToPx(TOKENS.gapRpx, windowWidth),
    itemWidth: itemWidthFromTokens(windowWidth),
    moreWidth: rpxToPx(TOKENS.moreFallbackRpx, windowWidth),
    labelWidth: rpxToPx(TOKENS.labelFallbackRpx, windowWidth)
  };
}

/**
 * @param {{
 *   total: number,
 *   containerWidth: number,
 *   padPx: number,
 *   labelWidth: number,
 *   itemWidth: number,
 *   gapPx: number,
 *   moreWidth: number
 * }} input
 * @returns {{ visible: number, showMore: boolean }}
 */
function computeVisibleCount(input) {
  var o = input || {};
  var n = Math.max(0, Math.floor(Number(o.total) || 0));
  var inner = Math.max(0, (Number(o.containerWidth) || 0) - (Number(o.padPx) || 0));
  var label = Math.max(0, Number(o.labelWidth) || 0);
  var item = Math.max(0, Number(o.itemWidth) || 0);
  var gap = Math.max(0, Number(o.gapPx) || 0);
  var more = Math.max(0, Number(o.moreWidth) || 0);
  if (n <= 0) return { visible: 0, showMore: false };
  if (inner <= 0 || item <= 0) return { visible: 0, showMore: true };
  var start = label + (label > 0 ? gap : 0);
  var allW = start + n * item + Math.max(0, n - 1) * gap;
  if (allW <= inner + 0.5) return { visible: n, showMore: false };
  var budget = inner - start - more - (more > 0 ? gap : 0);
  if (budget < item) return { visible: 0, showMore: true };
  var visible = 1;
  var used = item;
  while (visible < n) {
    var next = used + gap + item;
    if (next > budget + 0.5) break;
    used = next;
    visible += 1;
  }
  if (visible >= n) return { visible: n, showMore: false };
  return { visible: visible, showMore: true };
}

function sliceVisible(list, layout) {
  var arr = Array.isArray(list) ? list : [];
  var vis = Math.max(0, layout && layout.visible != null ? layout.visible : 0);
  return {
    visibleWatchers: arr.slice(0, vis),
    showWatchersMore: !!(layout && layout.showMore)
  };
}

module.exports = {
  TOKENS: TOKENS,
  rpxToPx: rpxToPx,
  fallbackMetrics: fallbackMetrics,
  computeVisibleCount: computeVisibleCount,
  sliceVisible: sliceVisible
};
