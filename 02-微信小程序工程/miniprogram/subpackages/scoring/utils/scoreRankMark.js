/**
 * 记分页红蓝三角适配器。不 require game 分包，不跑 settle。
 */
var rankMark = require('../../../utils/sideGameRankMark.js');

function playerIdOf(player) {
  if (!player || typeof player !== 'object') return '';
  return String(player.playerId || player.userId || player.id || '').trim();
}

function collectOfficialFromScorePage(page) {
  var source = (page && page._playersSource) || [];
  if (!source.length && page && Array.isArray(page._entitiesSource)) {
    source = page._entitiesSource;
  }
  return {
    players: source.map(function (p) {
      return {
        playerId: playerIdOf(p),
        scores: Array.isArray(p && p.scores) ? p.scores.slice() : []
      };
    }),
    pars: (page && page._rankMarkPars) || [],
    windOn: false
  };
}

module.exports = {
  playerIdOf: playerIdOf,
  collectOfficialFromScorePage: collectOfficialFromScorePage,
  hasRankMarkGames: rankMark.hasRankMarkGames,
  colorFromProjection: rankMark.colorFromProjection,
  completeProjection: rankMark.completeProjection,
  markFromProjection: rankMark.markFromProjection,
  paintCellsFromProjection: rankMark.paintCellsFromProjection,
  blankThenPaintCells: rankMark.blankThenPaintCells,
  emptyMark: rankMark.emptyMark,
  normalizeMark: rankMark.normalizeMark,
  makeScoreLookup: rankMark.makeLookup,
  projectFromStorage: rankMark.projectFromStorage,
  authoritySignature: rankMark.authoritySignature,
  inspect: rankMark.inspect,
  TRI_BLUE: rankMark.TRI_BLUE,
  TRI_RED: rankMark.TRI_RED
};
