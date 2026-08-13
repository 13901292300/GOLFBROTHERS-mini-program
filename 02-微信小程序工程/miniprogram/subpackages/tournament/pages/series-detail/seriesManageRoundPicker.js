/**
 * Series M 第一层：轮次选择投影（纯函数，无写入）
 * R-STATE：状态色走 seriesRoundVisualState；选中/建议独立于 stateClass
 */

var seriesRoundVisualState = require('./seriesRoundVisualState.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function formatRoundDate(round) {
  var raw =
    asString(round && (round.dateTime || round.teeTime || round.date)) || '';
  if (!raw) return '';
  if (raw.length >= 10 && raw.charAt(4) === '-') return raw.slice(0, 10);
  return raw.length > 16 ? raw.slice(0, 16) : raw;
}

/**
 * @param {object} input
 * @param {object} input.series
 * @param {string} [input.suggestedRoundId] 建议高亮，不自动确认
 * @param {function} [input.getMatchById]
 */
function buildManageRoundPickerViewModel(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series && typeof src.series === 'object' ? src.series : {};
  var suggested = asString(src.suggestedRoundId);
  var getMatchById =
    typeof src.getMatchById === 'function' ? src.getMatchById : function () {
      return null;
    };
  var rounds = Array.isArray(series.rounds) ? series.rounds : [];
  var items = [];
  for (var i = 0; i < rounds.length; i++) {
    var r = rounds[i] || {};
    var rid = asString(r.roundId);
    if (!rid) continue;
    var index =
      r.index != null && Number.isFinite(Number(r.index))
        ? Number(r.index)
        : i + 1;
    var matchId = asString(r.matchId);
    var match = matchId ? getMatchById(matchId) : null;
    var visual = seriesRoundVisualState.resolveSeriesRoundVisualState(r, match);
    var name = asString(r.name);
    items.push({
      key: rid,
      roundId: rid,
      index: index,
      label: 'R' + index,
      name: name,
      dateText: formatRoundDate(r),
      statusLabel: visual.statusLabel,
      state: visual.state,
      stateClass: visual.stateClass,
      // 兼容旧读法：statusToken ≡ state
      statusToken: visual.state,
      isLive: visual.state === 'live',
      // 建议 ≠ 选中；有选中时由宿主清空 suggestedRoundId
      isSuggested: !!(suggested && suggested === rid),
      matchId: matchId
    });
  }
  return {
    ok: true,
    items: items,
    suggestedRoundId: suggested,
    emptyText: items.length ? '' : '暂无轮次'
  };
}

module.exports = {
  buildManageRoundPickerViewModel: buildManageRoundPickerViewModel,
  resolveStationStatusLabel: function (match) {
    var visual = seriesRoundVisualState.resolveSeriesRoundVisualState(null, match);
    return visual.statusLabel;
  }
};
