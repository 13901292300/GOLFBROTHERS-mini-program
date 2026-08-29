/**
 * Series round dock 横向溢出箭头纯投影。
 * 箭头只作提示，不改 scrollLeft。
 */

var EPS = 2;

function asNum(v, fallback) {
  var n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

/**
 * @param {number} scrollLeft
 * @param {number} viewportWidth
 * @param {number} contentWidth
 * @param {number} [epsilon]
 * @returns {{ showLeft: boolean, showRight: boolean }}
 */
function resolveOverflowArrows(scrollLeft, viewportWidth, contentWidth, epsilon) {
  var eps = epsilon == null ? EPS : asNum(epsilon, EPS);
  if (!(eps >= 0)) eps = EPS;
  var left = asNum(scrollLeft, 0);
  var view = asNum(viewportWidth, 0);
  var content = asNum(contentWidth, 0);
  if (!(view > 0) || !(content > 0) || content <= view + eps) {
    return { showLeft: false, showRight: false };
  }
  return {
    showLeft: left > eps,
    showRight: left + view < content - eps
  };
}

module.exports = {
  EPS: EPS,
  resolveOverflowArrows: resolveOverflowArrows
};
