/**
 * Series Rn LIVE 领先榜：核验分站后直接调用共享 liveLeaderboardBoard。
 * 不 remap 展示字段、不走 TOT、不写 Series / match / storage。
 */

var liveLeaderboardBoard = require('../../../../utils/liveLeaderboardBoard.js');
var seriesStandingsAssembler = require('../../../../utils/seriesStandingsAssembler.js');
var teamLeaderboardHost = require('../../../../utils/teamLeaderboardHost.js');
var standingsViewModel = require('./seriesStandingsViewModel.js');
var seriesPersonalLeaderboardAdapter = require('./seriesPersonalLeaderboardAdapter.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function packLiveOverlay(state, extra) {
  var sharedEmpty = seriesPersonalLeaderboardAdapter.emptySharedPersonalBoardFields();
  var view = (state && state.view) || 'all';
  var scoreType = state && state.scoreType === 'net' ? 'net' : 'gross';
  return Object.assign({}, sharedEmpty, extra || {}, {
    useLiveLeaderboard: true,
    showTeamBoard: false,
    showSharedPersonalBoard: false,
    showEntityAllBoard: false,
    listRows: [],
    listEmptyText: '',
    boardView: view,
    selection: { view: view, scoreType: scoreType },
    leaderboardViewLabel: (state && state.viewLabel) || '',
    liveView: view,
    liveScoreType: scoreType,
    liveTeamLeaderboard: (state && state.teamLeaderboard) || [],
    liveLeaderboard: (state && state.leaderboard) || [],
    showLeaderboardTeamColumn: !!(state && state.showLeaderboardTeamColumn),
    liveTeamGroupLogoById: (state && state.teamGroupLogoById) || {},
    liveAvatarBadge: (state && state.avatarBadge) || 'auto',
    liveMetaMode: (state && state.metaMode) || 'countryAge',
    liveShowExpandGender: !!(state && state.showExpandGender),
    liveEmptyText: (extra && extra.liveEmptyText) || (state && state.emptyText) || '',
    liveMatchId: (state && state.matchId) || '',
    liveScorePanel: 'technical',
    personalLeaderboard: (state && state.leaderboard) || []
  });
}

function projectSeriesRnLiveLeaderboard(input) {
  var src = input && typeof input === 'object' ? input : {};
  var selectedKey = asString(src.selectedKey) || standingsViewModel.CUMULATIVE_KEY;
  var rawSel = src.selection && typeof src.selection === 'object' ? src.selection : {};
  var view = asString(rawSel.view) || 'all';
  if (view !== 'team' && view !== 'male' && view !== 'female') view = 'all';
  var scoreType = asString(rawSel.scoreType) === 'net' ? 'net' : 'gross';

  if (selectedKey === standingsViewModel.CUMULATIVE_KEY) {
    return {
      useLive: false,
      reason: 'tot',
      calledShared: false,
      verifiedOk: true,
      overlay: seriesPersonalLeaderboardAdapter.emptySharedPersonalBoardFields()
    };
  }

  var match = src.match && typeof src.match === 'object' ? src.match : null;
  var verified = seriesStandingsAssembler.verifyManagedStation(
    src.series,
    src.round,
    match,
    src.indexLink
  );
  if (!verified || !verified.ok) {
    var failState = liveLeaderboardBoard.emptyState(view, scoreType, '', '本轮比赛数据异常');
    return {
      useLive: true,
      reason: 'managed_fail',
      calledShared: false,
      verifiedOk: false,
      overlay: packLiveOverlay(failState, { liveEmptyText: '本轮比赛数据异常' })
    };
  }

  var host = teamLeaderboardHost.createStandaloneHost({
    viewerRemarkCtx: src.viewerRemarkCtx
  });
  var state = liveLeaderboardBoard.buildLiveLeaderboardState(match, {
    view: view,
    scoreType: scoreType,
    openIndex: src.openIndex,
    host: host,
    viewerRemarkCtx: src.viewerRemarkCtx
  });
  return {
    useLive: true,
    reason: 'shared',
    calledShared: true,
    verifiedOk: true,
    overlay: packLiveOverlay(state)
  };
}

module.exports = {
  projectSeriesRnLiveLeaderboard: projectSeriesRnLiveLeaderboard,
  packLiveOverlay: packLiveOverlay
};
