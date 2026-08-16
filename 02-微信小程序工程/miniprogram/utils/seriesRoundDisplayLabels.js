/**
 * 系列赛轮次面向用户的显示别名（纯投影）
 * - 同日多场地 → Cx（按系列原顺序连续编号）
 * - 其余 / 取消 / 无效日期或场地 → Rx
 * - 不改 roundId / selectedKey；判定复用 seriesSameDayMultiCourse
 */

var seriesSameDayMultiCourse = require('./seriesSameDayMultiCourse.js');

function asString(v) {
  return v == null ? '' : String(v);
}

function rxFallbackLabel(round, state, orderIndex) {
  var index =
    round && round.index != null && Number.isFinite(Number(round.index))
      ? Number(round.index)
      : state && state.index != null && Number.isFinite(Number(state.index))
        ? Number(state.index)
        : orderIndex + 1;
  return 'R' + index;
}

/**
 * 总榜 / 队内多分队赛程共用。
 * @returns {Object<string, string>} roundId → C{n} | R{n}
 */
function buildSeriesRoundDisplayLabels(series, roundStates) {
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var states = Array.isArray(roundStates) ? roundStates : [];
  var stateById = Object.create(null);
  for (var s = 0; s < states.length; s++) {
    var st = states[s] || {};
    var sid = asString(st.roundId).trim();
    if (sid) stateById[sid] = st;
  }
  var source = rounds.length ? rounds : states;
  var eligibleById = seriesSameDayMultiCourse.collectSameDayMultiCourseRoundIds(rounds, states);
  var labels = Object.create(null);
  var cIndex = 0;
  for (var i = 0; i < source.length; i++) {
    var item = source[i] || {};
    var id = asString(item.roundId).trim();
    if (!id) continue;
    var stItem = stateById[id] || (rounds.length ? {} : item);
    var roundItem = rounds.length ? item : {};
    if (eligibleById[id]) {
      cIndex += 1;
      labels[id] = 'C' + cIndex;
    } else {
      labels[id] = rxFallbackLabel(roundItem, stItem, i);
    }
  }
  return labels;
}

function applySeriesRoundDisplayLabelsToStates(roundStates, displayLabels) {
  var list = Array.isArray(roundStates) ? roundStates : [];
  var labels = displayLabels && typeof displayLabels === 'object' ? displayLabels : {};
  return list.map(function (row) {
    var next = row && typeof row === 'object' ? Object.assign({}, row) : {};
    var rid = asString(next.roundId).trim();
    if (rid && labels[rid]) next.label = labels[rid];
    return next;
  });
}

module.exports = {
  rxFallbackLabel: rxFallbackLabel,
  buildSeriesRoundDisplayLabels: buildSeriesRoundDisplayLabels,
  applySeriesRoundDisplayLabelsToStates: applySeriesRoundDisplayLabelsToStates
};
