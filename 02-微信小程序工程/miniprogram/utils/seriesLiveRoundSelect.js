/**
 * 系列赛 LIVE 轮选择（主包）
 * 与详情首次进入总榜/出发表默认轮同一口径。
 */

var seriesRoundVisualState = require('./seriesRoundVisualState.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function visualOfRoundState(row) {
  return seriesRoundVisualState.normalizeRoundVisualFromStateRow(row || {});
}

function hasAnyLiveRound(roundStates) {
  var list = Array.isArray(roundStates) ? roundStates : [];
  for (var i = 0; i < list.length; i++) {
    if (visualOfRoundState(list[i]).state === 'live') return true;
  }
  return false;
}

/**
 * 默认目标轮：LIVE（系列原顺序最靠前）→ 已分组未开始 → 最后已完成 → 首个未取消。
 */
function resolveDefaultTargetRoundId(roundStates) {
  var list = Array.isArray(roundStates) ? roundStates : [];
  var firstLive = '';
  var firstGrouped = '';
  var lastCompleted = '';
  var firstAvailable = '';
  for (var i = 0; i < list.length; i++) {
    var r = list[i] || {};
    var rid = asString(r.roundId);
    if (!rid) continue;
    var visual = visualOfRoundState(r);
    if (visual.state === 'cancelled') continue;
    if (!firstAvailable) firstAvailable = rid;
    if (visual.state === 'live' && !firstLive) firstLive = rid;
    if (visual.state === 'grouped' && !firstGrouped) firstGrouped = rid;
    if (visual.state === 'completed') lastCompleted = rid;
  }
  return firstLive || firstGrouped || lastCompleted || firstAvailable;
}

module.exports = {
  hasAnyLiveRound: hasAnyLiveRound,
  resolveDefaultTargetRoundId: resolveDefaultTargetRoundId
};
