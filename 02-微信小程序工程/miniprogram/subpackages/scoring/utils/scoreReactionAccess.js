/**
 * 记分页头像互动（reaction）能力门控。
 *
 * 全站正式记分共用 subpackages/scoring/pages/score/index；
 * 不再以 demo-weekend-amateur 作为 reaction 启用条件。
 * 演示赛显示风格（elite/classic）等 UI 仍由 demoWeekendAmateurGame 单独门控。
 */

/**
 * @param {string|number|null|undefined} gameId
 * @param {{ matchId?: string|number|null } } [ctx]
 * @returns {boolean}
 */
function isScoreReactionEnabled(gameId, ctx) {
  const gid = gameId != null ? String(gameId).trim() : '';
  if (gid) return true;
  const mid =
    ctx && ctx.matchId != null ? String(ctx.matchId).trim() : '';
  return !!mid;
}

module.exports = {
  isScoreReactionEnabled: isScoreReactionEnabled
};
