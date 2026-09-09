/**
 * 广场「团体比赛」系列赛卡片副标题投影
 * - 有用户副标题 + 有效 LIVE：原文 + 「【Rx】」
 * - 空副标题 + 有效 LIVE：「【Rx】」
 * - 无 LIVE：只显示 canonical 副标题
 * 只读；不写 series.subtitle / series.seriesSubtitle / rounds。
 */

var seriesRoundVisualState = require('./seriesRoundVisualState.js');
var seriesLiveRoundSelect = require('./seriesLiveRoundSelect.js');
var seriesRoundDisplayLabels = require('./seriesRoundDisplayLabels.js');
var seriesSameDayMultiCourse = require('./seriesSameDayMultiCourse.js');
var seriesStationMatch = require('./seriesStationMatch.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function sanitizeTitleSub(raw) {
  return asString(raw).replace(/[\r\n\u2028\u2029]+/g, '');
}

function resolvePlazaDeps(getMatchByIdOrOptions) {
  if (typeof getMatchByIdOrOptions === 'function') {
    return { getMatchById: getMatchByIdOrOptions };
  }
  if (getMatchByIdOrOptions && typeof getMatchByIdOrOptions === 'object') {
    return getMatchByIdOrOptions;
  }
  return {};
}

function isPlazaSubtitleContext(options) {
  var ctx = asString(options && options.context);
  return ctx === 'standings' || ctx === 'plaza';
}

function readUserPlazaSubtitle(series) {
  if (!series || typeof series !== 'object') return '';
  var raw =
    series.subtitle != null && String(series.subtitle).trim() !== ''
      ? series.subtitle
      : series.seriesSubtitle;
  return sanitizeTitleSub(raw);
}

function loadMatch(getter, matchId) {
  var mid = asString(matchId);
  if (!mid || typeof getter !== 'function') return null;
  try {
    var match = getter(mid);
    return match && typeof match === 'object' ? match : null;
  } catch (e) {
    return null;
  }
}

/**
 * 分站身份：managed + seriesId/roundId/publishToken。
 * getIndexByMatchId 缺失不挡 LIVE；显式 index 冲突不算 LIVE。
 */
function plazaStationIdentityOk(series, round, match, options) {
  if (!match || !seriesStationMatch.isSeriesManagedMatch(match)) return false;
  var ctx = match.seriesContext || {};
  var seriesId = asString(series && series.seriesId);
  var roundId = asString(round && round.roundId);
  var publishToken = asString(series && series.publishToken);
  if (asString(ctx.seriesId) !== seriesId) return false;
  if (asString(ctx.roundId) !== roundId) return false;
  if (asString(ctx.publishToken) !== publishToken) return false;
  var getIndexByMatchId = options && options.getIndexByMatchId;
  if (typeof getIndexByMatchId !== 'function') return true;
  var link = null;
  try {
    link = getIndexByMatchId(asString(round && round.matchId));
  } catch (e) {
    link = null;
  }
  if (!link) return true;
  if (asString(link.seriesId) !== seriesId || asString(link.roundId) !== roundId) {
    return false;
  }
  return true;
}

function roundForUnverifiedVisual(round) {
  var copy = {};
  var key;
  for (key in round) {
    if (Object.prototype.hasOwnProperty.call(round, key)) copy[key] = round[key];
  }
  var rs = asString(copy.roundStatus).toLowerCase();
  if (rs === 'live' || rs === 'ongoing') copy.roundStatus = 'scheduled';
  var st = asString(copy.state).toLowerCase();
  if (st === 'live' || st === 'ongoing') copy.state = 'scheduled';
  return copy;
}

function buildPlazaRoundStates(series, getMatchByIdOrOptions) {
  var options = resolvePlazaDeps(getMatchByIdOrOptions);
  var getter = typeof options.getMatchById === 'function' ? options.getMatchById : function () {
    return null;
  };
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var out = [];
  for (var i = 0; i < rounds.length; i++) {
    var round = rounds[i] || {};
    var rid = asString(round.roundId);
    var match = loadMatch(getter, round.matchId);
    var identityOk = plazaStationIdentityOk(series, round, match, options);
    var visualRound = identityOk ? round : roundForUnverifiedVisual(round);
    var visualMatch = identityOk ? match : null;
    var visual = seriesRoundVisualState.resolveSeriesRoundVisualState(
      visualRound,
      visualMatch
    );
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
      statusToken: visual.state,
      stationIdentityOk: identityOk
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
 * 轮次赛且存在未取消、身份有效的 LIVE 时，返回公共显示标签（如 R2）；否则 ''。
 * 不按同日 COURSE / 日期猜 LIVE；多 LIVE 取系列顺序最早一轮。
 */
function resolvePlazaLiveRoundLabel(series, getMatchByIdOrOptions) {
  if (!series || typeof series !== 'object') return '';
  var states = buildPlazaRoundStates(series, getMatchByIdOrOptions);
  if (!states.length) return '';
  if (!seriesLiveRoundSelect.hasAnyLiveRound(states)) return '';
  var rid = seriesLiveRoundSelect.resolveDefaultTargetRoundId(states);
  if (!rid) return '';
  var liveState = '';
  var identityOk = false;
  for (var i = 0; i < states.length; i++) {
    if (asString(states[i] && states[i].roundId) === rid) {
      liveState = asString(states[i].state);
      identityOk = states[i].stationIdentityOk !== false;
      break;
    }
  }
  if (liveState !== 'live' || !identityOk) return '';
  var roundIndex = resolveOriginalSeriesRoundIndex(series, rid);
  if (!roundIndex) return '';
  var labels = seriesRoundDisplayLabels.buildSeriesRoundDisplayLabels(series, states);
  var fromLabel = labels && labels[rid] ? asString(labels[rid]) : '';
  if (isRxDisplayLabel(fromLabel)) return fromLabel;
  return 'R' + roundIndex;
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

var TRAILING_PLAZA_RX_SUFFIX = /(?:[（(]R\d+[）)]| · R\d+|【R\d+】)\s*$/;

/** 只剥字符串末尾明确系统轮次尾缀，不改正文中间的 R1。 */
function stripTrailingPlazaLiveSuffixes(text) {
  var s = sanitizeTitleSub(text);
  var next;
  while (TRAILING_PLAZA_RX_SUFFIX.test(s)) {
    next = s.replace(TRAILING_PLAZA_RX_SUFFIX, '');
    next = sanitizeTitleSub(next);
    if (next === s) break;
    s = next;
  }
  return s;
}

/**
 * 有 canonical 时末尾追加「【Rx】」；空 canonical 仅输出「【Rx】」。
 */
function appendPlazaLiveRoundSubtitle(baseTitleSub, liveLabel) {
  var base = stripTrailingPlazaLiveSuffixes(baseTitleSub);
  var label = asString(liveLabel);
  if (!isRxDisplayLabel(label)) return base;
  var wrapped = '【' + label + '】';
  return base ? base + wrapped : wrapped;
}

function resolvePlazaLiveRoundInfo(series, getMatchByIdOrOptions) {
  var label = resolvePlazaLiveRoundLabel(series, getMatchByIdOrOptions);
  if (!label) {
    return { label: '', roundId: '', roundIndex: 0 };
  }
  var states = buildPlazaRoundStates(series, getMatchByIdOrOptions);
  var rid = seriesLiveRoundSelect.resolveDefaultTargetRoundId(states);
  return {
    label: label,
    roundId: rid,
    roundIndex: resolveOriginalSeriesRoundIndex(series, rid)
  };
}

function projectPlazaSeriesTitleSub(series, getMatchByIdOrOptions) {
  var base = readUserPlazaSubtitle(series);
  var info = resolvePlazaLiveRoundInfo(series, getMatchByIdOrOptions);
  if (!info.label) return base;
  return appendPlazaLiveRoundSubtitle(base, info.label);
}

/**
 * 广场卡片副标题权威入口。
 * 仅 context === standings/plaza 且存在真实 LIVE 时追加【Rx】。
 * 无 LIVE 时返回 canonical；空 canonical + LIVE 返回【Rx】。
 */
function buildPlazaSeriesSubtitle(series, options) {
  var opts = resolvePlazaDeps(options);
  var userSub = readUserPlazaSubtitle(series);
  if (!isPlazaSubtitleContext(opts)) return userSub;
  var liveLabel = resolvePlazaLiveRoundLabel(series, opts);
  if (!liveLabel) return userSub;
  return appendPlazaLiveRoundSubtitle(userSub, liveLabel);
}

module.exports = {
  buildPlazaRoundStates: buildPlazaRoundStates,
  resolvePlazaLiveRoundLabel: resolvePlazaLiveRoundLabel,
  resolveOriginalSeriesRoundIndex: resolveOriginalSeriesRoundIndex,
  formatChineseRoundTitle: formatChineseRoundTitle,
  stripTrailingPlazaLiveSuffixes: stripTrailingPlazaLiveSuffixes,
  appendPlazaLiveRoundSubtitle: appendPlazaLiveRoundSubtitle,
  projectPlazaSeriesTitleSub: projectPlazaSeriesTitleSub,
  buildPlazaSeriesSubtitle: buildPlazaSeriesSubtitle
};
