/**
 * 系列赛有效轮次聚合（纯函数）
 * - 广场报名 TAB 过滤与开赛成功提示共用
 * - 不按「当前轮」或 Cx 标签判断整体阶段
 */

var seriesRoundVisualState = require('./seriesRoundVisualState.js');
var teamMatchFinish = require('./teamMatchFinish.js');
var seriesFinishLock = require('./seriesFinishLock.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function loadMatch(round, getMatchById) {
  var mid = asString(round && round.matchId);
  if (!mid || typeof getMatchById !== 'function') return null;
  try {
    var match = getMatchById(mid);
    return match && typeof match === 'object' ? match : null;
  } catch (e) {
    return null;
  }
}

function listValidRoundVisuals(series, getMatchById) {
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var out = [];
  for (var i = 0; i < rounds.length; i++) {
    var round = rounds[i];
    if (!round || typeof round !== 'object') continue;
    if (!asString(round.roundId)) continue;
    var match = loadMatch(round, getMatchById);
    var visual = seriesRoundVisualState.resolveSeriesRoundVisualState(round, match);
    if (!visual || visual.state === seriesRoundVisualState.STATE.cancelled) continue;
    out.push({
      round: round,
      match: match,
      roundId: asString(round.roundId),
      index: resolveOriginalRoundIndex(round, i),
      state: visual.state
    });
  }
  return out;
}

function hasValidRounds(series, getMatchById) {
  return listValidRoundVisuals(series, getMatchById).length > 0;
}

function isStartedOrCompletedState(state) {
  return (
    state === seriesRoundVisualState.STATE.live ||
    state === seriesRoundVisualState.STATE.completed
  );
}

function allValidRoundsStartedOrCompleted(series, getMatchById) {
  var valid = listValidRoundVisuals(series, getMatchById);
  if (!valid.length) return false;
  for (var i = 0; i < valid.length; i++) {
    if (!isStartedOrCompletedState(valid[i].state)) return false;
  }
  return true;
}

function shouldHideSeriesFromPlazaRegistration(series, getMatchById) {
  if (seriesFinishLock.isSeriesCompleted(series)) return true;
  return allValidRoundsStartedOrCompleted(series, getMatchById);
}

/** 有效轮（非取消）全部 match.status 完成；零有效轮不视为整体完赛 */
function allValidRoundsCompleted(series, getMatchById) {
  var valid = listValidRoundVisuals(series, getMatchById);
  if (!valid.length) return false;
  for (var i = 0; i < valid.length; i++) {
    if (!teamMatchFinish.isMatchCompleted(valid[i].match)) return false;
  }
  return true;
}

function anyValidRoundCompleted(series, getMatchById) {
  var valid = listValidRoundVisuals(series, getMatchById);
  for (var i = 0; i < valid.length; i++) {
    if (teamMatchFinish.isMatchCompleted(valid[i].match)) return true;
  }
  return false;
}

function resolveOriginalRoundIndex(round, orderIndex) {
  if (round && round.index != null && String(round.index).trim() !== '') {
    var n = Number(round.index);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  var fallback = Number(orderIndex);
  if (Number.isFinite(fallback) && fallback >= 0) return Math.floor(fallback) + 1;
  return 1;
}

function findRoundById(series, roundId) {
  var rid = asString(roundId);
  if (!rid) return null;
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  for (var i = 0; i < rounds.length; i++) {
    if (asString(rounds[i] && rounds[i].roundId) === rid) return rounds[i];
  }
  return null;
}

function formatSeriesRoundEnteredLiveNotice(series, roundId) {
  var round = findRoundById(series, roundId);
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var orderIndex = 0;
  for (var i = 0; i < rounds.length; i++) {
    if (asString(rounds[i] && rounds[i].roundId) === asString(roundId)) {
      orderIndex = i;
      break;
    }
  }
  var x = resolveOriginalRoundIndex(round, orderIndex);
  return '第' + x + '轮比赛已进入LIVE状态，请到广场-团体比赛内查看。';
}

module.exports = {
  listValidRoundVisuals: listValidRoundVisuals,
  hasValidRounds: hasValidRounds,
  allValidRoundsStartedOrCompleted: allValidRoundsStartedOrCompleted,
  allValidRoundsCompleted: allValidRoundsCompleted,
  anyValidRoundCompleted: anyValidRoundCompleted,
  shouldHideSeriesFromPlazaRegistration: shouldHideSeriesFromPlazaRegistration,
  resolveOriginalRoundIndex: resolveOriginalRoundIndex,
  formatSeriesRoundEnteredLiveNotice: formatSeriesRoundEnteredLiveNotice
};
