/**
 * 记分页头像互动（reaction）能力门控（主包轻量模块）。
 *
 * 打开动作面板时即可同步使用，不触发 reaction 分包下载。
 * 不再以 demo-weekend-amateur 作为 reaction 启用条件。
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
