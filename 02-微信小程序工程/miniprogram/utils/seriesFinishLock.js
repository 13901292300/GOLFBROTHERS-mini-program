/**
 * Series 终态锁定投影（纯函数）
 * 事实来源：series.competitionPhaseCache === completed|finished
 * 禁止页面私有锁定字段作为事实来源
 */

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function asLower(v) {
  return asString(v).toLowerCase();
}

var SERIES_COMPLETED_TOAST = '系列赛已经结束。';
var SERIES_COMPLETED_EDIT_TOAST = '系列赛已结束，无法修改';

function isSeriesCompleted(series) {
  if (!series || typeof series !== 'object') return false;
  var phase = asLower(series.competitionPhaseCache);
  if (phase === 'completed' || phase === 'finished') return true;
  var life = asLower(series.lifecycleStatus);
  return life === 'finished' || life === 'completed';
}

function assertSeriesWritable(series) {
  if (isSeriesCompleted(series)) {
    return {
      ok: false,
      reason: 'series_completed',
      message: SERIES_COMPLETED_TOAST
    };
  }
  return { ok: true };
}

function loadSeriesForMatch(match, getSeriesById) {
  var ctx =
    match && match.seriesContext && typeof match.seriesContext === 'object'
      ? match.seriesContext
      : null;
  if (!ctx || ctx.managed !== true) {
    return { managed: false, series: null, seriesId: '' };
  }
  var seriesId = asString(ctx.seriesId);
  if (!seriesId) return { managed: true, series: null, seriesId: '' };
  var loader = typeof getSeriesById === 'function' ? getSeriesById : null;
  if (!loader) {
    try {
      loader = require('./seriesStore.js').getSeriesById;
    } catch (eLoad) {
      loader = null;
    }
  }
  var series = loader ? loader(seriesId) : null;
  return { managed: true, series: series || null, seriesId: seriesId };
}

function assertWritableForMatch(match, options) {
  var opts = options && typeof options === 'object' ? options : {};
  var loaded = loadSeriesForMatch(match, opts.getSeriesById);
  if (!loaded.managed) return { ok: true };
  if (!loaded.series) return { ok: true };
  return assertSeriesWritable(loaded.series);
}

/**
 * 锁定优先级：
 * 1. Series 已完成 → 全系列只读
 * 2. 当前轮比赛已完成 → 仅该轮只读
 * 3. 否则可按权限管理
 */
function resolveSeriesMutationLock(series, matchCompleted) {
  if (isSeriesCompleted(series)) {
    return {
      blocked: true,
      scope: 'series',
      reason: 'series_completed',
      message: SERIES_COMPLETED_TOAST
    };
  }
  if (matchCompleted) {
    return {
      blocked: true,
      scope: 'round',
      reason: 'match_finished',
      message: '比赛已经结束。'
    };
  }
  return { blocked: false, scope: '', reason: '', message: '' };
}

module.exports = {
  SERIES_COMPLETED_TOAST: SERIES_COMPLETED_TOAST,
  SERIES_COMPLETED_EDIT_TOAST: SERIES_COMPLETED_EDIT_TOAST,
  isSeriesCompleted: isSeriesCompleted,
  assertSeriesWritable: assertSeriesWritable,
  loadSeriesForMatch: loadSeriesForMatch,
  assertWritableForMatch: assertWritableForMatch,
  resolveSeriesMutationLock: resolveSeriesMutationLock
};
