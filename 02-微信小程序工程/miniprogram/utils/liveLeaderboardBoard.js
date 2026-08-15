/**
 * 普通队际 LIVE 领先榜状态（G1–G4 team/all/male/female）
 * - 与 detail._buildLeaderboardViewForView / _buildTeamLeaderboardView(gross) 同一 builder
 * - 不写 wx / storage / Series
 */

var personalLeaderboardBoard = require('./personalLeaderboardBoard.js');
var teamLeaderboardView = require('./teamLeaderboardView.js');
var teamLeaderboardHost = require('./teamLeaderboardHost.js');
var leaderboardSettingViewModel = require('./leaderboardSettingViewModel.js');
var { isInterTeamMatch } = require('./teamMatchCapabilities.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function emptyState(view, scoreType, viewLabel, emptyText) {
  return {
    view: view || 'all',
    scoreType: scoreType === 'net' ? 'net' : 'gross',
    viewLabel: viewLabel || '',
    teamLeaderboard: [],
    leaderboard: [],
    showLeaderboardTeamColumn: false,
    teamGroupLogoById: {},
    avatarBadge: 'auto',
    metaMode: 'countryAge',
    showExpandGender: false,
    emptyText: emptyText || ''
  };
}

/**
 * @param {object|null} match
 * @param {{
 *   view?: string,
 *   scoreType?: string,
 *   openIndex?: number|string,
 *   host?: object,
 *   viewerRemarkCtx?: object,
 *   buildNetTeam?: Function
 * }} [options]
 */
function buildLiveLeaderboardState(match, options) {
  var opts = options && typeof options === 'object' ? options : {};
  var view = asString(opts.view) || 'all';
  if (view !== 'team' && view !== 'male' && view !== 'female') view = 'all';
  var scoreType = asString(opts.scoreType) === 'net' ? 'net' : 'gross';
  var sideLabel = isInterTeamMatch(match) ? '球队' : '分队';
  var viewLabel = leaderboardSettingViewModel.buildLeaderboardViewLabel(
    scoreType,
    view,
    sideLabel
  );
  if (!match || typeof match !== 'object') {
    return emptyState(view, scoreType, viewLabel, '');
  }

  var host =
    opts.host && typeof opts.host === 'object'
      ? opts.host
      : teamLeaderboardHost.createStandaloneHost({
          viewerRemarkCtx: opts.viewerRemarkCtx
        });

  var teamLeaderboard = [];
  if (scoreType === 'net' && typeof opts.buildNetTeam === 'function') {
    teamLeaderboard = opts.buildNetTeam(match) || [];
  } else {
    teamLeaderboard = teamLeaderboardView.buildGrossTeamLeaderboardView(match, host) || [];
  }

  var personalView = view === 'team' ? 'all' : view;
  var board = personalLeaderboardBoard.buildPersonalLeaderboardBoard(match, {
    view: personalView,
    scoreType: scoreType,
    openIndex: opts.openIndex
  });
  var matchId = match.matchId != null ? String(match.matchId).trim() : '';
  var leaderboard = stampMatchIdOnRows((board && board.leaderboard) || [], matchId);
  var teams = stampMatchIdOnTeams(teamLeaderboard, matchId);

  return {
    view: view,
    scoreType: scoreType,
    viewLabel: (board && board.viewLabel) || viewLabel,
    teamLeaderboard: teams,
    leaderboard: leaderboard,
    showLeaderboardTeamColumn: !!(board && board.showTeamColumn),
    teamGroupLogoById: (board && board.teamGroupLogoById) || {},
    avatarBadge: (board && board.avatarBadge) || 'auto',
    metaMode: (board && board.metaMode) || 'countryAge',
    showExpandGender: !!(board && board.showExpandGender),
    emptyText: '',
    matchId: matchId
  };
}

function stampMatchIdOnRows(rows, matchId) {
  if (!matchId) return Array.isArray(rows) ? rows : [];
  return (Array.isArray(rows) ? rows : []).map(function (row) {
    if (!row || typeof row !== 'object' || row.matchId) return row;
    return Object.assign({}, row, { matchId: matchId });
  });
}

function stampMatchIdOnTeams(teams, matchId) {
  if (!matchId) return Array.isArray(teams) ? teams : [];
  return (Array.isArray(teams) ? teams : []).map(function (team) {
    if (!team || typeof team !== 'object') return team;
    var next = team.matchId ? team : Object.assign({}, team, { matchId: matchId });
    if (!Array.isArray(team.players)) return next;
    var players = stampMatchIdOnRows(team.players, matchId);
    if (players === team.players && next === team) return team;
    return Object.assign({}, next, { players: players });
  });
}

module.exports = {
  buildLiveLeaderboardState: buildLiveLeaderboardState,
  emptyState: emptyState
};
