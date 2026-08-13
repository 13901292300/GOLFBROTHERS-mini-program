/**
 * Series R 总杆球队榜 → 共享投影（R-TEAM-B1）
 * - 仅 R1…Rn + view=team：消费 teamLeaderboardView.buildGrossTeamLeaderboardView
 * - TOT 不调用本模块
 * - 净杆球队榜本轮不接
 * - 不写 Series / match / storage
 */

var teamLeaderboardView = require('../../../../utils/teamLeaderboardView.js');
var teamLeaderboardHost = require('../../../../utils/teamLeaderboardHost.js');
var seriesStandingsAssembler = require('../../../../utils/seriesStandingsAssembler.js');
var standingsViewModel = require('./seriesStandingsViewModel.js');
var seriesPersonalLeaderboardAdapter = require('./seriesPersonalLeaderboardAdapter.js');
var leaderboardSettingViewModel = require('../../../../utils/leaderboardSettingViewModel.js');
var { isInterTeamMatch } = require('../../../../utils/teamMatchCapabilities.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function isStationStarted(match) {
  var st = asString(match && match.status).toLowerCase();
  return st === 'ongoing' || st === 'finished' || st === 'completed';
}

function mapPlayer(p, roundId, matchId) {
  var row = p && typeof p === 'object' ? p : {};
  var playerId = asString(row.playerId || row.userId);
  var entityId = asString(row.entityId);
  return Object.assign({}, row, {
    roundId: roundId,
    matchId: matchId,
    showRoundTag: false,
    roundLabel: '',
    pendingLabel: '',
    fromLineup: false,
    canOpenScorecard: !!roundId && (!!playerId || !!entityId),
    occurrenceKey: roundId + ':' + (playerId || entityId || asString(row.scorecardKey)),
    userId: playerId || asString(row.userId)
  });
}

function mapTeam(team, roundId, matchId, match) {
  var src = team && typeof team === 'object' ? team : {};
  var players = Array.isArray(src.players)
    ? src.players.map(function (p) {
        return mapPlayer(p, roundId, matchId);
      })
    : [];
  var started = isStationStarted(match);
  return {
    teamId: asString(src.teamId),
    seriesParticipantId: asString(src.teamId),
    pos: src.pos == null ? '-' : String(src.pos),
    teamName: asString(src.teamName),
    grossTotal: src.grossTotal,
    toPar: src.toPar,
    total: src.total,
    hasScore: src.hasScore === true,
    scoreStr: src.scoreStr == null ? '-' : String(src.scoreStr),
    scoreClass: asString(src.scoreClass) || 'score-even',
    scoringPlayersCount: src.scoringPlayersCount == null ? 0 : src.scoringPlayersCount,
    players: players,
    expandEmptyHint: players.length ? '' : '本轮暂无该队球员',
    expandStatusHint: !started && players.length ? 'TEEING OFF SOON' : ''
  };
}

function emptyOverlay(viewLabel) {
  var sharedEmpty = seriesPersonalLeaderboardAdapter.emptySharedPersonalBoardFields();
  return Object.assign({}, sharedEmpty, {
    boardView: 'team',
    selection: { view: 'team', scoreType: 'gross' },
    showTeamBoard: true,
    listRows: [],
    listEmptyText: '',
    leaderboardViewLabel: viewLabel || '',
    headPlayerLabel: 'TEAM',
    teamRows: [],
    mainBoardInvariant: false
  });
}

function headerSignature(teams) {
  var list = Array.isArray(teams) ? teams : [];
  return list
    .map(function (t) {
      return [asString(t.teamId), asString(t.pos), asString(t.teamName), String(t.grossTotal), asString(t.scoreStr)].join('|');
    })
    .join(';;');
}

/**
 * @param {object} input
 */
function projectSeriesStandingsTeamBoard(input) {
  var src = input && typeof input === 'object' ? input : {};
  var selectedKey = asString(src.selectedKey) || standingsViewModel.CUMULATIVE_KEY;
  var sharedEmpty = seriesPersonalLeaderboardAdapter.emptySharedPersonalBoardFields();

  if (selectedKey === standingsViewModel.CUMULATIVE_KEY) {
    return {
      useShared: false,
      reason: 'tot',
      calledShared: false,
      verifiedOk: true,
      overlay: null
    };
  }

  var match = src.match && typeof src.match === 'object' ? src.match : null;
  var verified = seriesStandingsAssembler.verifyManagedStation(
    src.series,
    src.round,
    match,
    src.indexLink
  );
  var sideLabel = isInterTeamMatch(match) ? '球队' : '分队';
  var viewLabel = leaderboardSettingViewModel.buildLeaderboardViewLabel('gross', 'team', sideLabel);

  if (!verified || !verified.ok) {
    return {
      useShared: false,
      reason: 'managed_fail',
      calledShared: false,
      verifiedOk: false,
      overlay: Object.assign({}, emptyOverlay(viewLabel), {
        listEmptyText: '本轮比赛数据异常'
      })
    };
  }

  var host = teamLeaderboardHost.createStandaloneHost({
    viewerRemarkCtx: src.viewerRemarkCtx
  });
  var teams = teamLeaderboardView.buildGrossTeamLeaderboardView(match, host) || [];
  var matchId = match && match.matchId != null ? String(match.matchId).trim() : '';
  var teamRows = teams.map(function (team) {
    return mapTeam(team, selectedKey, matchId, match);
  });

  return {
    useShared: true,
    reason: 'shared',
    calledShared: true,
    verifiedOk: true,
    overlay: Object.assign({}, sharedEmpty, {
      boardView: 'team',
      selection: { view: 'team', scoreType: 'gross' },
      showTeamBoard: true,
      listRows: [],
      listEmptyText: teamRows.length ? '' : '暂无榜单数据',
      leaderboardViewLabel: viewLabel,
      headPlayerLabel: 'TEAM',
      teamRows: teamRows,
      mainBoardInvariant: false
    })
  };
}

module.exports = {
  projectSeriesStandingsTeamBoard: projectSeriesStandingsTeamBoard,
  headerSignature: headerSignature
};
