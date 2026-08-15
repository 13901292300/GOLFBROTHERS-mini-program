/**
 * LIVE 领先榜记分卡交互（detail / Series Rn 共用）
 * - 组件 emit 结构
 * - openIndex 切换（同行再点关闭）
 * - 按 stationMatch + 点击行构建 openScorecard
 * - 不写 storage / Series / TOT
 */

var teamMatchScorecard = require('./teamMatchScorecard.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function findTeamPlayerByScorecardKey(teams, key) {
  var k = asString(key);
  if (!k) return null;
  var list = Array.isArray(teams) ? teams : [];
  for (var i = 0; i < list.length; i++) {
    var players = list[i] && Array.isArray(list[i].players) ? list[i].players : [];
    for (var j = 0; j < players.length; j++) {
      var row = players[j];
      if (row && asString(row.scorecardKey) === k) return row;
    }
  }
  return null;
}

function pickPlayerObject(raw) {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
}

function isClosedOpenIndex(openIndex) {
  return openIndex === -1 || openIndex === '' || openIndex == null;
}

/**
 * 组件 scorecardtap / 测试共用：从 dataset + 当前球队榜还原完整 payload
 */
function buildTeamScorecardTapEvent(dataset, teamLeaderboard) {
  var ds = dataset && typeof dataset === 'object' ? dataset : {};
  var key = asString(ds.scorecardKey || ds.index);
  var fromBoard = findTeamPlayerByScorecardKey(teamLeaderboard, key);
  var player = fromBoard || pickPlayerObject(ds.player);
  if (player && !key) key = asString(player.scorecardKey);
  var matchId = asString(
    ds.matchId || (player && (player.stationMatchId || player.matchId))
  );
  var entityId = asString(ds.entityId || (player && player.entityId));
  var playerId = asString(
    ds.playerId || (player && (player.playerId || player.userId))
  );
  var groupId = asString(ds.groupId || (player && player.groupId));
  return {
    mode: 'team',
    index: key,
    scorecardKey: key,
    player: player,
    matchId: matchId,
    stationMatchId: matchId,
    entityId: entityId,
    playerId: playerId,
    groupId: groupId,
    roundId: asString(ds.roundId || (player && player.roundId)),
    members: player && Array.isArray(player.members) ? player.members : []
  };
}

function normalizeScorecardTapDetail(detail, teamLeaderboard) {
  var d = detail && typeof detail === 'object' ? detail : {};
  if (d.mode === 'team' || d.scorecardKey || (d.index != null && String(d.index).indexOf(':') >= 0)) {
    return buildTeamScorecardTapEvent(
      {
        index: d.scorecardKey || d.index,
        scorecardKey: d.scorecardKey || d.index,
        player: d.player,
        matchId: d.matchId || d.stationMatchId,
        entityId: d.entityId,
        playerId: d.playerId,
        groupId: d.groupId,
        roundId: d.roundId
      },
      teamLeaderboard
    );
  }
  var player = pickPlayerObject(d.player);
  return {
    mode: 'personal',
    index: d.index,
    scorecardKey: asString(d.scorecardKey || (player && player.scorecardKey)),
    player: player,
    matchId: asString(d.matchId || d.stationMatchId || (player && (player.stationMatchId || player.matchId))),
    stationMatchId: asString(d.stationMatchId || d.matchId || (player && (player.stationMatchId || player.matchId))),
    entityId: asString(d.entityId || (player && player.entityId)),
    playerId: asString(d.playerId || (player && (player.playerId || player.userId))),
    groupId: asString(d.groupId || (player && player.groupId)),
    roundId: asString(d.roundId || (player && player.roundId)),
    members: player && Array.isArray(player.members) ? player.members : []
  };
}

function closedPatch() {
  return {
    openIndex: -1,
    openScorecard: null,
    scorecardCourseTitle: '',
    scorePanel: 'technical',
    activeRow: null
  };
}

function applyLiveScorecardTap(state, detail) {
  var st = state && typeof state === 'object' ? state : {};
  var view = asString(st.view) === 'team' ? 'team' : 'all';
  var tap = normalizeScorecardTapDetail(detail, st.teamLeaderboard);
  var match = st.match && typeof st.match === 'object' ? st.match : null;
  var mode = st.scoreDisplayMode === 'diff' ? 'diff' : 'gross';

  if (view === 'team' || tap.mode === 'team') {
    var key = asString(tap.scorecardKey || tap.index);
    if (!key) return closedPatch();
    var current = st.openIndex;
    if (!isClosedOpenIndex(current) && String(current) === key) {
      return closedPatch();
    }
    var row = tap.player || findTeamPlayerByScorecardKey(st.teamLeaderboard, key);
    var built = teamMatchScorecard.buildLeaderboardExpandScorecard(match, row, mode);
    return {
      openIndex: key,
      openScorecard: built && built.scorecard ? built.scorecard : null,
      scorecardCourseTitle: teamMatchScorecard.buildScorecardCourseTitle(match),
      scorePanel: 'technical',
      activeRow: row || null
    };
  }

  var idx = Number(tap.index);
  if (!Number.isFinite(idx)) return closedPatch();
  if (st.openIndex === idx) return closedPatch();
  var list = Array.isArray(st.leaderboard) ? st.leaderboard : [];
  var prow = tap.player || list[idx] || null;
  var pbuilt = teamMatchScorecard.buildLeaderboardExpandScorecard(match, prow, mode);
  return {
    openIndex: idx,
    openScorecard: pbuilt && pbuilt.scorecard ? pbuilt.scorecard : null,
    scorecardCourseTitle: teamMatchScorecard.buildScorecardCourseTitle(match),
    scorePanel: 'technical',
    activeRow: prow
  };
}

function clearedLiveScorecardState() {
  return closedPatch();
}

function scorecardShape(scorecard) {
  if (!scorecard || typeof scorecard !== 'object') return null;
  return {
    frontHead: Array.isArray(scorecard.frontHead) ? scorecard.frontHead.length : 0,
    backHead: Array.isArray(scorecard.backHead) ? scorecard.backHead.length : 0,
    frontScore: Array.isArray(scorecard.frontScore) ? scorecard.frontScore.length : 0,
    backScore: Array.isArray(scorecard.backScore) ? scorecard.backScore.length : 0,
    frontPar: Array.isArray(scorecard.frontPar) ? scorecard.frontPar.length : 0,
    backPar: Array.isArray(scorecard.backPar) ? scorecard.backPar.length : 0,
    scorecardStatus: scorecard.scorecardStatus || ''
  };
}

module.exports = {
  findTeamPlayerByScorecardKey: findTeamPlayerByScorecardKey,
  buildTeamScorecardTapEvent: buildTeamScorecardTapEvent,
  normalizeScorecardTapDetail: normalizeScorecardTapDetail,
  applyLiveScorecardTap: applyLiveScorecardTap,
  clearedLiveScorecardState: clearedLiveScorecardState,
  scorecardShape: scorecardShape
};
