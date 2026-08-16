/**
 * Series 整体结束最终化（自动 / 手动同一入口）
 * - 事实字段：competitionPhaseCache = completed
 * - 单次 upsertSeriesChecked：关报名 + 写完赛审计，避免部分关闭
 * - 不改各轮 match.status / 成绩
 * - 已完成请求幂等，不改写 completedAt
 */

var seriesModel = require('./seriesModel.js');
var seriesStoreMod = require('./seriesStore.js');
var seriesStationIndexMod = require('./seriesStationIndex.js');
var teamMatchStore = require('./teamMatchStore.js');
var seriesRoundPhaseAggregate = require('./seriesRoundPhaseAggregate.js');
var seriesFinishLock = require('./seriesFinishLock.js');
var seriesManageAccess = require('./seriesManageAccess.js');
var seriesRoundDisplayLabels = require('./seriesRoundDisplayLabels.js');

var DANGER_CONFIRM_COLOR = '#dc2626';
var DANGER_WARNING_ICON = '⚠';

var STATION_FINISH_TITLE = '结束本轮比赛';
var STATION_FINISH_CONFIRM = '确定结束';
var FIRST_CONFIRM_CONTINUE = '继续';

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function resolveActorId(actor) {
  if (actor == null) return '';
  if (typeof actor === 'string') return asString(actor);
  return asString(actor.userId || actor.playerId || actor.id);
}

function defaultGetMatchById(id) {
  return teamMatchStore.getMatchById(id);
}

function listUnfinishedValidRounds(series, getMatchById) {
  var teamMatchFinish = require('./teamMatchFinish.js');
  var valid = seriesRoundPhaseAggregate.listValidRoundVisuals(series, getMatchById);
  var out = [];
  for (var i = 0; i < valid.length; i++) {
    if (!teamMatchFinish.isMatchCompleted(valid[i] && valid[i].match)) {
      out.push(valid[i]);
    }
  }
  return out;
}

function findRoundById(series, roundId) {
  var id = asString(roundId);
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  for (var i = 0; i < rounds.length; i++) {
    if (asString(rounds[i] && rounds[i].roundId) === id) return rounds[i];
  }
  return null;
}

function resolveRoundDisplayLabel(series, roundId) {
  var id = asString(roundId);
  if (!id) return '';
  var labels = seriesRoundDisplayLabels.buildSeriesRoundDisplayLabels(series);
  if (labels[id]) return labels[id];
  var round = findRoundById(series, id);
  if (round) return seriesRoundDisplayLabels.rxFallbackLabel(round, null, 0);
  return '';
}

function listUnfinishedRoundLabels(series, getMatchById) {
  var unfinished = listUnfinishedValidRounds(series, getMatchById || defaultGetMatchById);
  var labels = seriesRoundDisplayLabels.buildSeriesRoundDisplayLabels(series);
  var out = [];
  for (var i = 0; i < unfinished.length; i++) {
    var id = asString(unfinished[i] && unfinished[i].roundId);
    if (!id) continue;
    var label = labels[id];
    if (!label) {
      label = seriesRoundDisplayLabels.rxFallbackLabel(
        unfinished[i].round || findRoundById(series, id),
        unfinished[i],
        0
      );
    }
    out.push({
      roundId: id,
      label: label,
      match: unfinished[i].match || null
    });
  }
  return out;
}

function formatUnfinishedLabelText(items) {
  var labels = [];
  for (var i = 0; i < (items || []).length; i++) {
    if (items[i] && items[i].label) labels.push(items[i].label);
  }
  return labels.join('、');
}

function unfinishedRoundIdsOf(items) {
  var ids = [];
  for (var i = 0; i < (items || []).length; i++) {
    if (items[i] && items[i].roundId) ids.push(items[i].roundId);
  }
  return ids;
}

function sameIdList(a, b) {
  var left = Array.isArray(a) ? a : [];
  var right = Array.isArray(b) ? b : [];
  if (left.length !== right.length) return false;
  var map = Object.create(null);
  for (var i = 0; i < left.length; i++) map[asString(left[i])] = true;
  for (var j = 0; j < right.length; j++) {
    if (!map[asString(right[j])]) return false;
  }
  return true;
}

function getStationFinishModalContent(series, roundId) {
  var label = resolveRoundDisplayLabel(series, roundId) || '本';
  return {
    title: STATION_FINISH_TITLE,
    content:
      '您正在操作 ' +
      label +
      ' 轮次的结束比赛，一旦结束，所有成绩将不可修改，是否确定？',
    cancelText: '取消',
    confirmText: STATION_FINISH_CONFIRM,
    roundId: asString(roundId),
    roundLabel: label
  };
}

function getManualFinishFirstConfirm(series, getMatchById) {
  var items = listUnfinishedRoundLabels(series, getMatchById);
  var labelText = formatUnfinishedLabelText(items);
  if (items.length) {
    return {
      title: '系列赛尚未全部完成',
      content:
        '当前仍有 ' +
        labelText +
        ' 未完成。继续结束系列赛后，所有轮次、成绩及赛事设置将立即锁定。',
      cancelText: '取消',
      confirmText: FIRST_CONFIRM_CONTINUE,
      hasUnfinishedRounds: true,
      unfinishedCount: items.length,
      unfinishedRoundIds: unfinishedRoundIdsOf(items),
      unfinishedLabels: labelText
    };
  }
  return {
    title: '结束系列赛',
    content: '系列赛结束后，所有轮次、成绩及赛事设置将被锁定且不可修改，是否继续？',
    cancelText: '取消',
    confirmText: FIRST_CONFIRM_CONTINUE,
    hasUnfinishedRounds: false,
    unfinishedCount: 0,
    unfinishedRoundIds: [],
    unfinishedLabels: ''
  };
}

function buildDangerConfirmModal(spec) {
  var src = spec && typeof spec === 'object' ? spec : {};
  var body = asString(src.content);
  var icon = asString(src.icon) || DANGER_WARNING_ICON;
  return {
    title: asString(src.title),
    content: icon + ' ' + body,
    cancelText: asString(src.cancelText) || '取消',
    confirmText: asString(src.confirmText),
    confirmColor: DANGER_CONFIRM_COLOR,
    warningIcon: icon
  };
}

function getManualFinishSecondConfirm(series, getMatchById) {
  var items = listUnfinishedRoundLabels(series, getMatchById);
  var labelText = formatUnfinishedLabelText(items);
  var copy;
  if (items.length) {
    copy = buildDangerConfirmModal({
      title: '警告：仍有轮次未完成',
      content:
        '仍有 ' +
        labelText +
        ' 未完成。强制结束后，这些轮次将无法继续分组、计分或调整，且不会自动生成缺失成绩。此操作不可撤销。',
      cancelText: '取消',
      confirmText: '强制结束'
    });
  } else {
    copy = buildDangerConfirmModal({
      title: '最终确认',
      content: '此操作不可撤销。结束后系列赛全部数据将进入只读状态，确定结束系列赛？',
      cancelText: '取消',
      confirmText: '确认结束'
    });
  }
  copy.hasUnfinishedRounds = items.length > 0;
  copy.unfinishedCount = items.length;
  copy.unfinishedRoundIds = unfinishedRoundIdsOf(items);
  copy.unfinishedLabels = labelText;
  return copy;
}

function getManualFinishModalContent(series, getMatchById) {
  return getManualFinishFirstConfirm(series, getMatchById);
}

function applyFinalFields(series, input) {
  var next = deepClone(series);
  var now = typeof input.nowIso === 'function' ? input.nowIso() : seriesModel.nowIso();
  var actorId = resolveActorId(input.actor);
  var source = asString(input.source) || 'manual';
  if (!seriesModel.COMPLETION_SOURCE[source]) source = 'manual';

  next.competitionPhaseCache = 'completed';
  next.lifecycleStatus = 'published';
  next.registrationState = 'closed';
  var rev = seriesModel.normalizeRegistrationRevision(series.registrationRevision);
  next.registrationRevision = rev + 1;
  if (!asString(series.completedAt)) {
    next.completedAt = now;
    next.completedBy = actorId;
    next.completionSource = source;
  } else {
    next.completedAt = series.completedAt;
    next.completedBy = series.completedBy;
    next.completionSource = series.completionSource;
  }
  next.updatedAt = now;
  next.rounds = deepClone(series.rounds);
  next.roster = deepClone(series.roster);
  next.participants = deepClone(series.participants);
  next.scoringRule = deepClone(series.scoringRule);
  return next;
}

/**
 * @param {object} input
 * @param {'auto'|'manual'|'backend'} input.source
 * @param {boolean} [input.requireAllRoundsCompleted] auto 默认 true；manual 默认 false
 */
function finalizeSeries(input) {
  var src = input && typeof input === 'object' ? input : {};
  var seriesId = asString(src.seriesId);
  if (!seriesId) return { ok: false, reason: 'series_id_required' };

  var store = src.seriesStore || seriesStoreMod;
  var getMatchById =
    typeof src.getMatchById === 'function' ? src.getMatchById : defaultGetMatchById;

  var series =
    typeof store.getSeriesById === 'function' ? store.getSeriesById(seriesId) : null;
  if (!series) return { ok: false, reason: 'series_not_found' };

  var life = asString(series.lifecycleStatus);
  if (life === 'cancelled' || life === 'archived') {
    return { ok: false, reason: 'lifecycle_readonly' };
  }
  if (life !== 'published') {
    return { ok: false, reason: 'series_not_published' };
  }

  if (seriesFinishLock.isSeriesCompleted(series)) {
    return {
      ok: true,
      idempotent: true,
      series: series,
      reason: 'already_completed'
    };
  }

  if (src.source === 'manual') {
    if (!seriesManageAccess.isSeriesHostPrivileged(series, src.actor || {})) {
      return { ok: false, reason: 'permission_denied', message: '暂无管理权限' };
    }
  }

  var requireAll =
    src.requireAllRoundsCompleted != null
      ? !!src.requireAllRoundsCompleted
      : src.source === 'auto';
  if (requireAll) {
    if (!seriesRoundPhaseAggregate.hasValidRounds(series, getMatchById)) {
      return { ok: false, reason: 'no_valid_rounds' };
    }
    if (!seriesRoundPhaseAggregate.allValidRoundsCompleted(series, getMatchById)) {
      return { ok: false, reason: 'rounds_incomplete' };
    }
  }

  if (src.expectedUnfinishedRoundIds != null) {
    var latestUnfinished = unfinishedRoundIdsOf(
      listUnfinishedRoundLabels(series, getMatchById)
    );
    if (!sameIdList(src.expectedUnfinishedRoundIds, latestUnfinished)) {
      return {
        ok: false,
        reason: 'unfinished_rounds_changed',
        message: '轮次状态已变化，请重试',
        unfinishedRoundIds: latestUnfinished
      };
    }
  }

  var expectedRev = seriesModel.normalizeRegistrationRevision(series.registrationRevision);
  var next = applyFinalFields(series, src);
  var wrote;
  try {
    if (typeof store.upsertSeriesChecked === 'function') {
      wrote = store.upsertSeriesChecked(next, expectedRev);
    } else if (typeof store.upsertSeries === 'function') {
      wrote = store.upsertSeries(next);
    } else {
      return { ok: false, reason: 'storage_write_failed' };
    }
  } catch (eWrite) {
    return { ok: false, reason: 'storage_write_failed' };
  }
  if (!wrote || !wrote.ok) {
    var latestAfterFail =
      typeof store.getSeriesById === 'function' ? store.getSeriesById(seriesId) : null;
    if (latestAfterFail && seriesFinishLock.isSeriesCompleted(latestAfterFail)) {
      return {
        ok: true,
        idempotent: true,
        series: latestAfterFail,
        reason: 'already_completed'
      };
    }
    return {
      ok: false,
      reason: (wrote && wrote.reason) || 'storage_write_failed',
      currentRevision: wrote && wrote.currentRevision
    };
  }
  return {
    ok: true,
    idempotent: false,
    series: wrote.series,
    reason: src.source === 'auto' ? 'auto_completed' : 'manual_completed'
  };
}

function maybeFinalizeAfterStationPersisted(match, options) {
  var opts = options && typeof options === 'object' ? options : {};
  var m = match && typeof match === 'object' ? match : null;
  var ctx = m && m.seriesContext && typeof m.seriesContext === 'object' ? m.seriesContext : null;
  if (!ctx || ctx.managed !== true) {
    return { ok: true, skipped: true, reason: 'not_series_managed' };
  }
  var seriesId = asString(ctx.seriesId);
  if (!seriesId) return { ok: true, skipped: true, reason: 'series_id_missing' };

  var getMatchById =
    typeof opts.getMatchById === 'function' ? opts.getMatchById : defaultGetMatchById;
  var latestMatch = m.matchId ? getMatchById(m.matchId) || m : m;
  var teamMatchFinish = require('./teamMatchFinish.js');
  if (!teamMatchFinish.isMatchCompleted(latestMatch)) {
    return { ok: true, skipped: true, reason: 'station_not_completed' };
  }

  return finalizeSeries({
    seriesId: seriesId,
    source: 'auto',
    requireAllRoundsCompleted: true,
    actor: opts.actor || {},
    seriesStore: opts.seriesStore,
    getMatchById: getMatchById,
    nowIso: opts.nowIso
  });
}

module.exports = {
  DANGER_CONFIRM_COLOR: DANGER_CONFIRM_COLOR,
  DANGER_WARNING_ICON: DANGER_WARNING_ICON,
  listUnfinishedValidRounds: listUnfinishedValidRounds,
  listUnfinishedRoundLabels: listUnfinishedRoundLabels,
  resolveRoundDisplayLabel: resolveRoundDisplayLabel,
  getStationFinishModalContent: getStationFinishModalContent,
  getManualFinishFirstConfirm: getManualFinishFirstConfirm,
  getManualFinishSecondConfirm: getManualFinishSecondConfirm,
  getManualFinishModalContent: getManualFinishModalContent,
  buildDangerConfirmModal: buildDangerConfirmModal,
  finalizeSeries: finalizeSeries,
  maybeFinalizeAfterStationPersisted: maybeFinalizeAfterStationPersisted
};
