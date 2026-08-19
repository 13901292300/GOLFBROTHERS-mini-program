/**
 * 莱德杯得分榜适配（series-detail 分包）：
 * 加载各轮 station Match，fail-closed 累计红蓝分，为所选 roundId 生成单场 G5–G8 得分榜。
 * 主包 utils 不得引用本文件。
 */

var seriesRyderCup = require('../../../../utils/seriesRyderCup.js');
var seriesRyderCupAccumulate = require('../../../../utils/seriesRyderCupAccumulate.js');
var seriesStationMatch = require('../../../../utils/seriesStationMatch.js');
var matchPlayTeamScore = require('../../../../utils/matchPlayTeamScore.js');
var matchPlayScoreboardView = require('../../utils/matchPlayScoreboardView.js');
var seriesLiveSession = require('./seriesLiveSessionProjection.js');
var seriesStandingsViewModel = require('./seriesStandingsViewModel.js');
var seriesRoundInfoText = require('./seriesRoundInfoText.js');

var verifyRoundStation = seriesRyderCupAccumulate.verifyRoundStation;
var accumulateSeriesMatchPlayScores = seriesRyderCupAccumulate.accumulateSeriesMatchPlayScores;

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function findRound(series, roundId) {
  var id = asString(roundId);
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  for (var i = 0; i < rounds.length; i++) {
    if (asString(rounds[i] && rounds[i].roundId) === id) return rounds[i];
  }
  return null;
}

function buildRyderCupStandingsView(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series && typeof src.series === 'object' ? src.series : {};
  var roundStates = Array.isArray(src.roundStates) ? src.roundStates : [];
  var deps = src.deps || src;
  var totals = accumulateSeriesMatchPlayScores(series, deps);
  var displayLabels = seriesStandingsViewModel.buildStandingsRoundDisplayLabels
    ? seriesStandingsViewModel.buildStandingsRoundDisplayLabels(series, roundStates)
    : {};
  var sessionKey = seriesLiveSession.resolveSessionSelectedRoundId({
    roundStates: roundStates,
    extraValidKeys: null,
    currentKey: asString(src.selectedKey),
    userPicked: !!src.userPicked,
    visited: !!src.visited
  });
  var parts = seriesStandingsViewModel.buildRoundSelectorParts(roundStates, sessionKey, {
    includeTot: false,
    displayLabels: displayLabels
  });
  var selectedKey = asString(parts.selectedKey);
  var selectedRound = findRound(series, selectedKey);
  var gate = selectedRound ? verifyRoundStation(series, selectedRound, deps) : { canEnterRound: false, match: null };
  var roundMatch = gate.canEnterRound ? gate.match : { teamGroups: (gate.match && gate.match.teamGroups) || [], groups: [] };
  if (!gate.canEnterRound) {
    roundMatch = {
      teamGroups: seriesStationMatch.buildTeamGroupsFromSeries(series),
      groups: [],
      matchType: asString(series.hostMode) === 'organization' ? 'inter-team' : 'team-internal'
    };
  }

  var board = matchPlayScoreboardView.buildMatchPlayScoreboard(roundMatch, {
    scoreOverride: { redScore: totals.redScore, blueScore: totals.blueScore },
    allowMockCards: false,
    resetExpanded: !!src.resetExpanded,
    prevExpandedById: src.prevExpandedById || {},
    resolveAnyPlayerId: deps.resolveAnyPlayerId,
    resolveAnyPlayerNickname: deps.resolveAnyPlayerNickname,
    resolveViewerDisplayName: deps.resolveViewerDisplayName,
    resolveGroupedPlayerAvatar: deps.resolveGroupedPlayerAvatar,
    getHolePars: deps.getHolePars,
    buildGroupPlayerLookup: deps.buildGroupPlayerLookup
  });

  return {
    ok: true,
    mode: seriesRyderCup.SCORING_MODE,
    available: true,
    isRyderCup: true,
    useRyderCupScoreboard: true,
    useLiveLeaderboard: false,
    showTot: false,
    unavailableTitle: '',
    unavailableMessage: '',
    selectedKey: selectedKey,
    totalSelector: null,
    roundSelectorItems: parts.roundSelectorItems,
    roundSelector: parts.roundSelector,
    roundInfoText: seriesRoundInfoText.buildRyderCupRoundInfoText(
      selectedKey,
      selectedRound,
      series
    ),
    teamRows: [],
    matchPlayScoreboard: board,
    seriesRedScore: totals.redScore,
    seriesBlueScore: totals.blueScore,
    seriesRedScoreText: matchPlayTeamScore.formatMatchPlayTeamScore(totals.redScore),
    seriesBlueScoreText: matchPlayTeamScore.formatMatchPlayTeamScore(totals.blueScore),
    traces: totals.traces,
    selectedRoundMatchId: gate.matchId || asString(selectedRound && selectedRound.matchId),
    selectedRoundStationOk: !!gate.canEnterRound,
    selectedRoundBlockReason: gate.blockReason || '',
    mainBoardInvariant: true,
    scrollRoundSelector: true
  };
}

module.exports = {
  verifyRoundStation: verifyRoundStation,
  accumulateSeriesMatchPlayScores: accumulateSeriesMatchPlayScores,
  buildRyderCupStandingsView: buildRyderCupStandingsView
};
