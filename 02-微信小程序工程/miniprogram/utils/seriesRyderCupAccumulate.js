/**
 * 莱德杯系列累计分（主包纯函数）
 * - 广场卡片与详情 adapter 必须调用同一累计
 * - 禁止主包 require 分包页面模块
 */

var seriesRyderCup = require('./seriesRyderCup.js');
var seriesStationMatch = require('./seriesStationMatch.js');
var matchPlayTeamScore = require('./matchPlayTeamScore.js');
var seriesGameModeLabel = require('./seriesGameModeLabel.js');
var seriesRoundDisplayLabels = require('./seriesRoundDisplayLabels.js');
var seriesRoundVisualState = require('./seriesRoundVisualState.js');
var halfCourse = require('./halfCourse.js');

var DEFAULT_PLAZA_SUBTITLE = '两队 · 多轮比洞';

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function isCancelledRound(round) {
  return asString(round && (round.roundStatus || round.status)) === 'cancelled';
}

var CN_DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

function formatChineseRoundName(index) {
  var n = Math.floor(Number(index));
  if (!Number.isFinite(n) || n < 1) return '';
  if (n === 10) return '第十轮';
  if (n < 10) return '第' + CN_DIGITS[n] + '轮';
  if (n < 20) return '第十' + CN_DIGITS[n - 10] + '轮';
  if (n === 20) return '第二十轮';
  return '第' + n + '轮';
}

function roundOrderIndex(round, fallbackIndex) {
  if (round && round.index != null && Number.isFinite(Number(round.index))) {
    var n = Math.floor(Number(round.index));
    if (n > 0) return n;
  }
  return fallbackIndex + 1;
}

function sanitizeSubtitle(raw) {
  return asString(raw).replace(/[\r\n\u2028\u2029]+/g, '');
}

function stripTrailingRxSuffixes(text) {
  var s = sanitizeSubtitle(text);
  var re = /（R\d+）$/;
  while (re.test(s)) s = s.replace(re, '');
  return s;
}

function verifyRoundStation(series, round, deps) {
  var d = deps || {};
  if (typeof d.evaluateRoundStationGate === 'function') {
    return d.evaluateRoundStationGate(series, round, d);
  }
  var getMatchById = typeof d.getMatchById === 'function' ? d.getMatchById : function () {
    return null;
  };
  var seriesId = asString(series && series.seriesId);
  var roundId = asString(round && round.roundId);
  var matchId = asString(round && round.matchId);
  if (!matchId) {
    return { canEnterRound: false, blockReason: 'missing_match_id', match: null, matchId: '' };
  }
  var match = getMatchById(matchId);
  if (!match) {
    return { canEnterRound: false, blockReason: 'match_missing', match: null, matchId: matchId };
  }
  if (!seriesStationMatch.isSeriesManagedMatch(match)) {
    return { canEnterRound: false, blockReason: 'not_series_managed', match: match, matchId: matchId };
  }
  var ctx = match.seriesContext || {};
  if (asString(ctx.seriesId) !== seriesId) {
    return { canEnterRound: false, blockReason: 'context_series_id_conflict', match: match, matchId: matchId };
  }
  if (asString(ctx.roundId) !== roundId) {
    return { canEnterRound: false, blockReason: 'context_round_id_conflict', match: match, matchId: matchId };
  }
  if (asString(ctx.matchId) && asString(ctx.matchId) !== matchId) {
    return { canEnterRound: false, blockReason: 'context_match_id_conflict', match: match, matchId: matchId };
  }
  return { canEnterRound: true, blockReason: '', match: match, matchId: matchId };
}

function accumulateSeriesMatchPlayScores(series, deps) {
  var traces = [];
  var redScore = 0;
  var blueScore = 0;
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  for (var i = 0; i < rounds.length; i++) {
    var round = rounds[i] || {};
    var roundId = asString(round.roundId);
    if (isCancelledRound(round)) {
      traces.push({ roundId: roundId, included: false, reason: 'cancelled' });
      continue;
    }
    var gate = verifyRoundStation(series, round, deps);
    if (!gate.canEnterRound || !gate.match) {
      traces.push({
        roundId: roundId,
        matchId: asString(round.matchId),
        included: false,
        reason: gate.blockReason || 'station_invalid'
      });
      continue;
    }
    var summary = matchPlayTeamScore.buildMatchPlayTeamScoreSummary(gate.match, deps);
    redScore += Number(summary.redScore) || 0;
    blueScore += Number(summary.blueScore) || 0;
    traces.push({
      roundId: roundId,
      matchId: gate.matchId,
      included: true,
      reason: '',
      redScore: summary.redScore,
      blueScore: summary.blueScore
    });
  }
  var includedRoundCount = 0;
  var invalidRoundCount = 0;
  var conflictRoundCount = 0;
  var cancelledRoundCount = 0;
  for (var t = 0; t < traces.length; t++) {
    var row = traces[t] || {};
    var reason = asString(row.reason);
    if (reason === 'cancelled') {
      cancelledRoundCount += 1;
      continue;
    }
    if (row.included) {
      includedRoundCount += 1;
      continue;
    }
    invalidRoundCount += 1;
    if (reason.indexOf('conflict') >= 0) conflictRoundCount += 1;
  }
  var validRoundCount = includedRoundCount + invalidRoundCount;
  return {
    redScore: redScore,
    blueScore: blueScore,
    traces: traces,
    includedRoundCount: includedRoundCount,
    invalidRoundCount: invalidRoundCount,
    conflictRoundCount: conflictRoundCount,
    cancelledRoundCount: cancelledRoundCount,
    validRoundCount: validRoundCount,
    completeProjection: validRoundCount > 0 && invalidRoundCount === 0
  };
}

function formatSeriesScorePair(redScore, blueScore) {
  return (
    matchPlayTeamScore.formatMatchPlayTeamScore(redScore) +
    '-' +
    matchPlayTeamScore.formatMatchPlayTeamScore(blueScore)
  );
}

function buildRoundStatesForLabels(series) {
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  return rounds.map(function (round, i) {
    var r = round || {};
    return {
      roundId: asString(r.roundId),
      index: r.index != null && Number.isFinite(Number(r.index)) ? Number(r.index) : i + 1,
      dateTime: r.dateTime,
      courseId: r.courseId,
      courseName: r.courseName,
      courseHalfText: r.courseHalfText,
      courseHalf: r.courseHalf,
      front9Course: r.front9Course,
      back9Course: r.back9Course,
      roundStatus: r.roundStatus
    };
  });
}

function loadRoundMatch(round, getMatchById) {
  var mid = asString(round && round.matchId);
  if (!mid || typeof getMatchById !== 'function') return null;
  try {
    var match = getMatchById(mid);
    return match && typeof match === 'object' ? match : null;
  } catch (e) {
    return null;
  }
}

/**
 * 下一有效轮：复用 seriesRoundVisualState。
 * 跳过 cancelled / completed；优先 LIVE；否则最早未完成有效轮。
 */
function findNextValidRound(series, deps) {
  var getMatchById = deps && deps.getMatchById;
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var firstLive = null;
  var earliestIncomplete = null;
  var earliestIndex = 1e9;
  for (var i = 0; i < rounds.length; i++) {
    var round = rounds[i] || {};
    if (!asString(round.roundId)) continue;
    var visual = seriesRoundVisualState.resolveSeriesRoundVisualState(
      round,
      loadRoundMatch(round, getMatchById)
    );
    if (visual.state === seriesRoundVisualState.STATE.cancelled) continue;
    if (visual.state === seriesRoundVisualState.STATE.completed) continue;
    if (visual.state === seriesRoundVisualState.STATE.live && !firstLive) {
      firstLive = round;
    }
    var idx =
      round.index != null && Number.isFinite(Number(round.index))
        ? Number(round.index)
        : i + 1;
    if (idx < earliestIndex) {
      earliestIndex = idx;
      earliestIncomplete = round;
    }
  }
  return firstLive || earliestIncomplete || null;
}

/**
 * 赛事当前进程轮：LIVE → 最早未完成有效轮 → 最后已完成有效轮。跳过取消轮。
 */
function resolveCurrentDisplayRound(series, deps) {
  var getMatchById = deps && deps.getMatchById;
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var firstLive = null;
  var earliestIncomplete = null;
  var lastCompleted = null;
  var earliestIndex = 1e9;
  for (var i = 0; i < rounds.length; i++) {
    var round = rounds[i] || {};
    if (!asString(round.roundId)) continue;
    var visual = seriesRoundVisualState.resolveSeriesRoundVisualState(
      round,
      loadRoundMatch(round, getMatchById)
    );
    if (visual.state === seriesRoundVisualState.STATE.cancelled) continue;
    var idx = roundOrderIndex(round, i);
    if (visual.state === seriesRoundVisualState.STATE.live && !firstLive) {
      firstLive = round;
    }
    if (visual.state === seriesRoundVisualState.STATE.completed) {
      lastCompleted = round;
      continue;
    }
    if (idx < earliestIndex) {
      earliestIndex = idx;
      earliestIncomplete = round;
    }
  }
  return firstLive || earliestIncomplete || lastCompleted || null;
}

function findRoundOrderIndex(series, roundId) {
  var id = asString(roundId);
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  for (var i = 0; i < rounds.length; i++) {
    if (asString(rounds[i] && rounds[i].roundId) === id) {
      return roundOrderIndex(rounds[i], i);
    }
  }
  return 0;
}

function resolveRoundGameModeLabel(series, round, deps) {
  var fromRound = seriesGameModeLabel.resolveSeriesGameModeLabel(round && round.gameMode);
  if (fromRound) return fromRound;
  var match = loadRoundMatch(round, deps && deps.getMatchById);
  return seriesGameModeLabel.resolveSeriesGameModeLabel(
    match && (match.gameMode || match.selectedGameMode)
  );
}

/**
 * 莱德杯展示副标题。不写 series.seriesSubtitle。
 */
function buildRyderCupDisplaySubtitle(series, deps) {
  var empty = {
    text: '',
    roundId: '',
    roundLabel: '',
    gameModeLabel: '',
    source: 'fallback'
  };
  if (!seriesRyderCup.isRyderCupSeries(series)) return empty;
  var original = sanitizeSubtitle(series && series.seriesSubtitle);
  var round = resolveCurrentDisplayRound(series, deps);
  if (!round || !asString(round.roundId)) {
    return {
      text: original,
      roundId: '',
      roundLabel: '',
      gameModeLabel: '',
      source: original ? 'user_subtitle' : 'fallback'
    };
  }
  var orderIndex = findRoundOrderIndex(series, round.roundId) - 1;
  if (orderIndex < 0) orderIndex = 0;
  var roundLabel = seriesRoundDisplayLabels.rxFallbackLabel(round, null, orderIndex);
  var chineseName = formatChineseRoundName(roundOrderIndex(round, orderIndex));
  var gameModeLabel = resolveRoundGameModeLabel(series, round, deps);
  if (original) {
    var base = stripTrailingRxSuffixes(original);
    return {
      text: base + '（' + roundLabel + '）',
      roundId: asString(round.roundId),
      roundLabel: roundLabel,
      gameModeLabel: gameModeLabel,
      source: 'user_subtitle'
    };
  }
  var modeText = chineseName;
  if (gameModeLabel) modeText = chineseName + ' · ' + gameModeLabel;
  return {
    text: modeText,
    roundId: asString(round.roundId),
    roundLabel: roundLabel,
    gameModeLabel: gameModeLabel,
    source: modeText ? 'round_mode' : 'fallback'
  };
}

function buildNextValidRoundHint(series, deps) {
  var round = findNextValidRound(series, deps);
  if (!round) return '';
  var labels = seriesRoundDisplayLabels.buildSeriesRoundDisplayLabels(
    series,
    buildRoundStatesForLabels(series)
  );
  var parts = [];
  var label = labels && labels[asString(round.roundId)] ? asString(labels[asString(round.roundId)]) : '';
  if (label) parts.push(label);
  if (asString(round.dateTime)) parts.push(asString(round.dateTime));
  var courseLine = halfCourse.formatCourseLineForUi(round);
  if (courseLine) parts.push(courseLine);
  return parts.join(' · ');
}

/**
 * 广场现有 Series 卡装饰：不新建卡片类型，不重算比分。
 * 仅 completeProjection 时展示红蓝分，避免把无法验证展示成 0-0。
 */
function decoratePlazaSeriesCard(card, series, listPhase, options) {
  if (!card || !seriesRyderCup.isRyderCupSeries(series)) return card;
  var phase = asString(listPhase);
  if (phase === 'live' || phase === 'finished') {
    var totals = accumulateSeriesMatchPlayScores(series, {
      getMatchById: options && options.getMatchById
    });
    if (!totals.completeProjection) return card;
    card.ryderRedScore = totals.redScore;
    card.ryderBlueScore = totals.blueScore;
    card.ryderScoreText = formatSeriesScorePair(totals.redScore, totals.blueScore);
  }
  return card;
}

module.exports = {
  DEFAULT_PLAZA_SUBTITLE: DEFAULT_PLAZA_SUBTITLE,
  verifyRoundStation: verifyRoundStation,
  accumulateSeriesMatchPlayScores: accumulateSeriesMatchPlayScores,
  formatSeriesScorePair: formatSeriesScorePair,
  findNextValidRound: findNextValidRound,
  resolveCurrentDisplayRound: resolveCurrentDisplayRound,
  formatChineseRoundName: formatChineseRoundName,
  buildRyderCupDisplaySubtitle: buildRyderCupDisplaySubtitle,
  buildNextValidRoundHint: buildNextValidRoundHint,
  decoratePlazaSeriesCard: decoratePlazaSeriesCard
};
