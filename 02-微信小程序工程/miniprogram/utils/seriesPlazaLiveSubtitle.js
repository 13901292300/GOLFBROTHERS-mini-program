/**
 * 广场「团体比赛」系列赛卡片副标题：LIVE 轮次赛显示投影
 * - 有原副标题：原文案 + 全角（Rx）
 * - 空/无效原副标题：第{原始轮次序号}轮
 * 只读；不写 series.seriesSubtitle / rounds。
 */

var seriesRoundVisualState = require('./seriesRoundVisualState.js');
var seriesLiveRoundSelect = require('./seriesLiveRoundSelect.js');
var seriesRoundDisplayLabels = require('./seriesRoundDisplayLabels.js');
var seriesSameDayMultiCourse = require('./seriesSameDayMultiCourse.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function sanitizeTitleSub(raw) {
  return asString(raw).replace(/[\r\n\u2028\u2029]+/g, '');
}

function buildPlazaRoundStates(series, getMatchById) {
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var getter = typeof getMatchById === 'function' ? getMatchById : function () {
    return null;
  };
  var out = [];
  for (var i = 0; i < rounds.length; i++) {
    var round = rounds[i] || {};
    var rid = asString(round.roundId);
    var mid = asString(round.matchId);
    var match = null;
    if (mid) {
      try {
        match = getter(mid);
      } catch (e) {
        match = null;
      }
    }
    var visual = seriesRoundVisualState.resolveSeriesRoundVisualState(round, match);
    var index =
      round.index != null && Number.isFinite(Number(round.index))
        ? Number(round.index)
        : i + 1;
    out.push({
      roundId: rid,
      index: index,
      dateTime: round.dateTime,
      courseId: round.courseId,
      courseName: round.courseName,
      courseHalfText: round.courseHalfText,
      courseHalf: round.courseHalf,
      front9Course: round.front9Course,
      back9Course: round.back9Course,
      roundStatus: round.roundStatus,
      state: visual.state,
      stateClass: visual.stateClass,
      statusLabel: visual.statusLabel,
      statusToken: visual.state
    });
  }
  return out;
}

function isSameDayMultiCourseSeries(series, roundStates) {
  var map = seriesSameDayMultiCourse.collectSameDayMultiCourseRoundIds(
    series && series.rounds,
    roundStates
  );
  return !!(map && Object.keys(map).length);
}

function isRxDisplayLabel(label) {
  return /^R\d+$/.test(asString(label));
}

/**
 * 轮次赛且存在未取消 LIVE 时，返回公共显示标签（如 R2）；否则 ''。
 */
function resolvePlazaLiveRoundLabel(series, getMatchById) {
  if (!series || typeof series !== 'object') return '';
  var states = buildPlazaRoundStates(series, getMatchById);
  if (!states.length) return '';
  if (isSameDayMultiCourseSeries(series, states)) return '';
  if (!seriesLiveRoundSelect.hasAnyLiveRound(states)) return '';
  var rid = seriesLiveRoundSelect.resolveDefaultTargetRoundId(states);
  if (!rid) return '';
  var liveState = '';
  for (var i = 0; i < states.length; i++) {
    if (asString(states[i] && states[i].roundId) === rid) {
      liveState = asString(states[i].state);
      break;
    }
  }
  if (liveState !== 'live') return '';
  var labels = seriesRoundDisplayLabels.buildSeriesRoundDisplayLabels(series, states);
  var label = labels && labels[rid] ? asString(labels[rid]) : '';
  if (!isRxDisplayLabel(label)) return '';
  return label;
}

/**
 * 原始系列轮次序号：读目标轮 round.index；缺省用 series.rounds 原数组位。
 * 不按 LIVE / 未取消过滤后的下标重编号。
 */
function resolveOriginalSeriesRoundIndex(series, roundId) {
  var id = asString(roundId);
  if (!id) return 0;
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  for (var i = 0; i < rounds.length; i++) {
    var round = rounds[i] || {};
    if (asString(round.roundId) !== id) continue;
    if (round.index != null && Number.isFinite(Number(round.index))) {
      var n = Math.floor(Number(round.index));
      return n > 0 ? n : 0;
    }
    return i + 1;
  }
  return 0;
}

function formatChineseRoundTitle(roundIndex) {
  var n = Math.floor(Number(roundIndex));
  if (!Number.isFinite(n) || n <= 0) return '';
  return '第' + n + '轮';
}

/**
 * 有原副标题时末尾追加全角（Rx）；空原串不造孤立括号。
 */
function appendPlazaLiveRoundSubtitle(baseTitleSub, liveLabel) {
  var base = sanitizeTitleSub(baseTitleSub);
  var label = asString(liveLabel);
  if (!base) return '';
  if (!isRxDisplayLabel(label)) return base;
  var suffix = '（' + label + '）';
  if (base.length >= suffix.length && base.slice(-suffix.length) === suffix) {
    return base;
  }
  return base + suffix;
}

function resolvePlazaLiveRoundInfo(series, getMatchById) {
  var label = resolvePlazaLiveRoundLabel(series, getMatchById);
  if (!label) {
    return { label: '', roundId: '', roundIndex: 0 };
  }
  var states = buildPlazaRoundStates(series, getMatchById);
  var rid = seriesLiveRoundSelect.resolveDefaultTargetRoundId(states);
  return {
    label: label,
    roundId: rid,
    roundIndex: resolveOriginalSeriesRoundIndex(series, rid)
  };
}

function projectPlazaSeriesTitleSub(series, getMatchById) {
  var base = sanitizeTitleSub(series && series.seriesSubtitle);
  var info = resolvePlazaLiveRoundInfo(series, getMatchById);
  if (!info.label) return base;
  if (base) return appendPlazaLiveRoundSubtitle(base, info.label);
  return formatChineseRoundTitle(info.roundIndex);
}

module.exports = {
  buildPlazaRoundStates: buildPlazaRoundStates,
  resolvePlazaLiveRoundLabel: resolvePlazaLiveRoundLabel,
  resolveOriginalSeriesRoundIndex: resolveOriginalSeriesRoundIndex,
  formatChineseRoundTitle: formatChineseRoundTitle,
  appendPlazaLiveRoundSubtitle: appendPlazaLiveRoundSubtitle,
  projectPlazaSeriesTitleSub: projectPlazaSeriesTitleSub
};
