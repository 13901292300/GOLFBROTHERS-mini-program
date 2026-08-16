/**
 * Published Series 单轮更新编排（E1）
 * - 同步 Series.round + managed match 允许字段
 * - 本地 storage 无事务：写前 journal + 失败回滚，禁止单边成功
 * - 不改 publish journal；赛制变更确认后仅清当前轮赛制派生结构
 */

var seriesModel = require('./seriesModel.js');
var seriesStationMatch = require('./seriesStationMatch.js');
var seriesStationIndex = require('./seriesStationIndex.js');
var seriesManageAccess = require('./seriesManageAccess.js');
var teamMatchFinish = require('./teamMatchFinish.js');
var seriesFinishLock = require('./seriesFinishLock.js');

var JOURNAL_KEY = 'gb_series_round_edit_journal_v1';

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function findRound(series, roundId) {
  var rid = asString(roundId);
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  for (var i = 0; i < rounds.length; i++) {
    if (rounds[i] && asString(rounds[i].roundId) === rid) return rounds[i];
  }
  return null;
}

function matchStatusToken(match) {
  return asString(match && match.status).toLowerCase();
}

function isMatchFinished(match) {
  return teamMatchFinish.isMatchCompleted(match);
}

function isMatchStarted(match) {
  var s = matchStatusToken(match);
  return s === 'ongoing' || s === 'live' || isMatchFinished(match);
}

/**
 * 真实成绩：复用 teamMatchStore.groupScoreBucketHasAnyFilledScore
 *（覆盖 scoresByPlayer / teamScoresByEntity / scoresBySide 三桶）
 */
function matchHasScores(match) {
  var m = match || {};
  var sd = m.scoreData;
  if (sd && typeof sd === 'object' && !Array.isArray(sd)) {
    var bucketHasFilled = null;
    try {
      bucketHasFilled = require('./teamMatchStore.js').groupScoreBucketHasAnyFilledScore;
    } catch (eReq) {
      bucketHasFilled = null;
    }
    var keys = Object.keys(sd);
    for (var i = 0; i < keys.length; i++) {
      var bucket = sd[keys[i]];
      if (typeof bucketHasFilled === 'function') {
        if (bucketHasFilled(bucket)) return true;
        if (bucket != null && typeof bucket !== 'object') return true;
      } else if (bucket && typeof bucket === 'object') {
        // 极端降级：仅识别常见 scores 数组有填充
        var sbp = bucket.scoresByPlayer;
        if (sbp && typeof sbp === 'object') {
          var pids = Object.keys(sbp);
          for (var p = 0; p < pids.length; p++) {
            var scores = sbp[pids[p]] && sbp[pids[p]].scores;
            if (Array.isArray(scores) && scores.some(function (x) {
              return x !== null && x !== undefined && x !== '';
            })) {
              return true;
            }
          }
        }
      }
    }
  }
  if (m.peoriaResult && typeof m.peoriaResult === 'object') {
    var st = asString(m.peoriaResult.status);
    if (st && st !== 'idle' && st !== 'none') return true;
  }
  return false;
}

/** 是否存在需确认清空的分组/搭档结构（空壳组不算） */
function matchHasGroupingStructure(match) {
  var groups = Array.isArray(match && match.groups) ? match.groups : [];
  for (var i = 0; i < groups.length; i++) {
    var players = groups[i] && groups[i].players;
    if (!Array.isArray(players)) continue;
    for (var j = 0; j < players.length; j++) {
      var p = players[j];
      if (p && (asString(p.userId) || asString(p.playerId))) return true;
    }
  }
  var pairings = match && match.pairings;
  if (pairings && typeof pairings === 'object' && !Array.isArray(pairings)) {
    var gids = Object.keys(pairings);
    for (var k = 0; k < gids.length; k++) {
      var list = pairings[gids[k]];
      if (!Array.isArray(list) || !list.length) continue;
      for (var n = 0; n < list.length; n++) {
        var ids = list[n] && list[n].playerIds;
        if (Array.isArray(ids) && ids.some(function (id) {
          return asString(id);
        })) {
          return true;
        }
      }
    }
  }
  return false;
}

function matchHasScoringStructure(match) {
  return matchHasScores(match) || matchHasGroupingStructure(match);
}

/**
 * 赛制变更确认后：仅清当前 match 上实际存在的赛制派生字段。
 * 源码存在字段（managed 站 / 运行期）：
 * - groups / pairings / scoreData（站创建默认）
 * - scoreEntities（组合赛制运行期）
 * - groupCount / teeGroups / groupSummary / pairingMap（若已挂上）
 * teamScoresByEntity / scoresBySide / scoresByPlayer 位于 scoreData 桶内，随 scoreData={} 一并清掉。
 */
function clearGameModeDerivedStructureOnMatch(match) {
  if (!match || typeof match !== 'object') return match;
  match.groups = [];
  match.pairings = {};
  match.scoreData = {};
  if (Object.prototype.hasOwnProperty.call(match, 'scoreEntities')) {
    match.scoreEntities = {};
  }
  if (Object.prototype.hasOwnProperty.call(match, 'groupCount')) {
    match.groupCount = 0;
  }
  if (Object.prototype.hasOwnProperty.call(match, 'teeGroups')) {
    match.teeGroups = [];
  }
  if (Object.prototype.hasOwnProperty.call(match, 'groupSummary')) {
    match.groupSummary = null;
  }
  if (Object.prototype.hasOwnProperty.call(match, 'pairingMap')) {
    match.pairingMap = {};
  }
  return match;
}

/**
 * 字段可编辑矩阵（具体禁用原因）
 * 赛制门闩（产品死路修复）：
 *   disabled ⇔ started || hasRealScores || finished
 *   hasGroupingStructure / hasScoringStructure 仅供保存时判断是否弹「清空分组」确认，
 *   绝不可用于禁用赛制选择器（用户无其他入口可先清分组）。
 */
function resolveRoundEditLocks(series, round, match) {
  var scoringMode = asString(
    series && series.scoringRule && series.scoringRule.mode
  );
  var finished =
    isMatchFinished(match) || seriesFinishLock.isSeriesCompleted(series);
  var startedOrScored = isMatchStarted(match) || matchHasScores(match);
  var hasStruct = matchHasScoringStructure(match);
  var hasGroups = matchHasGroupingStructure(match);
  var showTopN = scoringMode === 'per_round_n';

  function lock(enabled, reason) {
    return { enabled: !!enabled, reason: enabled ? '' : reason || '不可编辑' };
  }

  return {
    finished: finished,
    startedOrScored: startedOrScored,
    hasScoringStructure: hasStruct,
    hasGroupingStructure: hasGroups,
    showTopN: showTopN,
    name: lock(!finished, '比赛已结束，无法编辑轮次名称'),
    course: lock(
      !finished && !startedOrScored,
      finished
        ? '比赛已结束，无法编辑球场'
        : '本轮已开始或已有成绩，暂不可修改球场/半场'
    ),
    dateTime: lock(
      !finished && !startedOrScored,
      finished
        ? '比赛已结束，无法编辑开球时间'
        : '本轮已开始或已有成绩，暂不可修改日期和开球时间'
    ),
    gameMode: lock(
      !finished && !startedOrScored,
      finished
        ? '比赛已结束，无法编辑赛制'
        : '本轮已开始或已有成绩，暂不可修改赛制'
    ),
    topN: lock(
      showTopN && !finished && !startedOrScored,
      !showTopN
        ? '当前为全局 M 模式，本轮 Top N 不可编辑'
        : finished
          ? '比赛已结束，无法编辑 Top N'
          : '本轮已开始或已有成绩，暂不可修改 Top N'
    ),
    // 费用：对齐单场——结束态整页不可编辑；进行中仍可改费用
    fee: lock(!finished, '比赛已结束，无法编辑费用')
  };
}

var ALLOWED_PATCH_KEYS = {
  name: true,
  courseId: true,
  courseName: true,
  courseLocation: true,
  courseHalfText: true,
  front9Course: true,
  back9Course: true,
  dateTime: true,
  gameMode: true,
  topN: true,
  fee: true
};

function sanitizeRoundPatch(patch, locks) {
  var src = patch && typeof patch === 'object' ? patch : {};
  var out = {};
  var rejected = [];
  Object.keys(src).forEach(function (key) {
    if (!ALLOWED_PATCH_KEYS[key]) {
      rejected.push({ key: key, reason: 'field_not_allowed' });
      return;
    }
    var lock = locks[key];
    if (key === 'front9Course' || key === 'back9Course' || key === 'courseHalfText') {
      lock = locks.course;
    }
    if (lock && !lock.enabled) {
      rejected.push({ key: key, reason: lock.reason || 'field_locked' });
      return;
    }
    out[key] = src[key];
  });
  return { ok: rejected.length === 0, patch: out, rejected: rejected };
}

function applyRoundPatch(round, patch) {
  var next = deepClone(round || {});
  Object.keys(patch || {}).forEach(function (k) {
    next[k] = patch[k];
  });
  next.updatedAt = seriesModel.nowIso ? seriesModel.nowIso() : new Date().toISOString();
  return next;
}

function buildMatchFieldPatch(series, nextRound, existingMatch) {
  var feeMapped = seriesStationMatch.mapRoundFeeToFeeList(nextRound.fee, nextRound.roundId);
  if (!feeMapped.ok) {
    return { ok: false, reason: 'fee_invalid' };
  }
  var competition = seriesStationMatch.buildTeamCompetitionForStation(series, nextRound);
  if (!competition.ok) {
    return { ok: false, reason: competition.reason || 'team_competition_invalid' };
  }
  var tee = asString(nextRound.dateTime);
  var roundName = seriesStationMatch.buildStationRoundName(
    series.seriesName,
    nextRound.name
  );
  var scoringRules = deepClone(existingMatch.scoringRules || {});
  if (!scoringRules.teamCompetition || typeof scoringRules.teamCompetition !== 'object') {
    scoringRules.teamCompetition = {};
  }
  scoringRules.teamCompetition.enabled = !!competition.teamCompetition.enabled;
  scoringRules.teamCompetition.topN = competition.teamCompetition.topN;

  return {
    ok: true,
    patch: {
      roundName: roundName,
      gameMode: asString(nextRound.gameMode),
      feeList: feeMapped.feeList,
      feeSet: feeMapped.feeList.length > 0,
      courseId: asString(nextRound.courseId),
      courseName: asString(nextRound.courseName),
      courseLocation: asString(nextRound.courseLocation),
      courseHalfText: asString(nextRound.courseHalfText),
      front9Course:
        nextRound.front9Course != null ? deepClone(nextRound.front9Course) : null,
      back9Course:
        nextRound.back9Course != null ? deepClone(nextRound.back9Course) : null,
      teeTime: tee,
      teeTimeText: tee,
      scoringRules: scoringRules
    }
  };
}

function applyMatchPatchPreservingRuntime(existingMatch, fieldPatch) {
  var next = deepClone(existingMatch);
  Object.keys(fieldPatch || {}).forEach(function (k) {
    next[k] = fieldPatch[k];
  });
  // 显式保留身份与运行态（防止 patch 误伤）
  next.matchId = existingMatch.matchId;
  next.seriesContext = deepClone(existingMatch.seriesContext);
  next.createdBy = existingMatch.createdBy;
  next.creatorId = existingMatch.creatorId;
  next.createdAt = existingMatch.createdAt;
  next.registrationStatus = existingMatch.registrationStatus;
  next.registerInfo = deepClone(existingMatch.registerInfo);
  next.teamGroups = deepClone(existingMatch.teamGroups);
  next.groups = deepClone(existingMatch.groups);
  next.pairings = deepClone(existingMatch.pairings);
  next.scoreData = deepClone(existingMatch.scoreData);
  if (existingMatch.scoreEntities != null) {
    next.scoreEntities = deepClone(existingMatch.scoreEntities);
  }
  if (existingMatch.peoriaResult != null) {
    next.peoriaResult = deepClone(existingMatch.peoriaResult);
  }
  next.tempAdmins = deepClone(existingMatch.tempAdmins);
  next.tempAdminAccess = deepClone(existingMatch.tempAdminAccess);
  next.caddieScoringAccess = deepClone(existingMatch.caddieScoringAccess);
  next.status = existingMatch.status;
  next.statusLabel = existingMatch.statusLabel;
  return next;
}

function createDefaultStorage() {
  return {
    getItem: function (key) {
      try {
        if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') {
          return { ok: false, reason: 'storage_unavailable' };
        }
        return { ok: true, value: wx.getStorageSync(key) };
      } catch (e) {
        return { ok: false, reason: 'storage_read_failed' };
      }
    },
    setItem: function (key, value) {
      try {
        if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') {
          return { ok: false, reason: 'storage_unavailable' };
        }
        wx.setStorageSync(key, value);
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: 'storage_write_failed' };
      }
    },
    removeItem: function (key) {
      try {
        if (typeof wx !== 'undefined' && typeof wx.removeStorageSync === 'function') {
          wx.removeStorageSync(key);
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: 'storage_write_failed' };
      }
    }
  };
}

/**
 * @param {object} deps
 * @param {object} deps.seriesStore
 * @param {object} deps.teamMatchStore
 * @param {object} [deps.storage]
 * @param {function} [deps.getIndexByMatchId]
 * @param {function} [deps.now]
 */
function createSeriesRoundUpdateService(deps) {
  var d = deps && typeof deps === 'object' ? deps : {};
  var seriesStore = d.seriesStore;
  var teamMatchStore = d.teamMatchStore;
  var storage = d.storage || createDefaultStorage();
  var getIndexByMatchId =
    typeof d.getIndexByMatchId === 'function'
      ? d.getIndexByMatchId
      : function (id) {
          return seriesStationIndex.getByMatchId(id);
        };
  var nowFn =
    typeof d.now === 'function'
      ? d.now
      : function () {
          return Date.now();
        };

  function writeJournal(journal) {
    return storage.setItem(JOURNAL_KEY, journal);
  }

  function clearJournal() {
    return storage.removeItem(JOURNAL_KEY);
  }

  function readJournal() {
    var res = storage.getItem(JOURNAL_KEY);
    if (!res || !res.ok) return null;
    var v = res.value;
    if (!v || typeof v !== 'object') return null;
    return v;
  }

  function restoreSeries(seriesBefore) {
    if (!seriesBefore) return { ok: false, reason: 'rollback_series_missing' };
    return seriesStore.upsertSeries(deepClone(seriesBefore));
  }

  function restoreMatch(matchBefore) {
    if (!matchBefore) return { ok: false, reason: 'rollback_match_missing' };
    try {
      teamMatchStore.saveMatch(deepClone(matchBefore));
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'rollback_match_failed' };
    }
  }

  /**
   * 启动时恢复中断的半写：优先回滚到 before 快照。
   */
  function recoverInterruptedEdit() {
    var journal = readJournal();
    if (!journal) return { ok: true, reason: 'idle' };
    var phase = asString(journal.phase);
    if (phase === 'done') {
      clearJournal();
      return { ok: true, reason: 'cleared_done' };
    }
    var seriesRestored = restoreSeries(journal.seriesBefore);
    var matchRestored = restoreMatch(journal.matchBefore);
    clearJournal();
    return {
      ok: !!(seriesRestored && seriesRestored.ok && matchRestored && matchRestored.ok),
      reason: 'rolled_back',
      seriesRestored: !!(seriesRestored && seriesRestored.ok),
      matchRestored: !!(matchRestored && matchRestored.ok)
    };
  }

  function updatePublishedSeriesRound(input) {
    var src = input && typeof input === 'object' ? input : {};
    recoverInterruptedEdit();

    var seriesId = asString(src.seriesId);
    var roundId = asString(src.roundId);
    if (!seriesId) return { ok: false, reason: 'series_id_required' };
    if (!roundId) return { ok: false, reason: 'round_id_required' };

    var series = seriesStore.getSeriesById(seriesId);
    if (!series) return { ok: false, reason: 'series_not_found' };
    if (asString(series.lifecycleStatus) !== 'published') {
      return { ok: false, reason: 'series_not_published' };
    }
    var seriesLock = seriesFinishLock.assertSeriesWritable(series);
    if (!seriesLock.ok) {
      return { ok: false, reason: 'series_completed', message: seriesLock.message };
    }

    var expectedUpdatedAt = asString(src.expectedSeriesUpdatedAt);
    if (expectedUpdatedAt && asString(series.updatedAt) !== expectedUpdatedAt) {
      return { ok: false, reason: 'round_conflict' };
    }

    var round = findRound(series, roundId);
    if (!round) return { ok: false, reason: 'round_not_found' };

    var matchId = asString(round.matchId);
    if (!matchId) return { ok: false, reason: 'station_missing' };

    var index = getIndexByMatchId(matchId);
    if (
      !index ||
      asString(index.seriesId) !== seriesId ||
      asString(index.roundId) !== roundId ||
      asString(index.matchId) !== matchId
    ) {
      return { ok: false, reason: 'station_data_invalid' };
    }

    var match = teamMatchStore.getMatchById(matchId);
    if (!match) return { ok: false, reason: 'station_data_invalid' };

    var ctx = match.seriesContext || {};
    if (
      ctx.managed !== true ||
      asString(ctx.seriesId) !== seriesId ||
      asString(ctx.roundId) !== roundId ||
      asString(ctx.publishToken) !== asString(series.publishToken)
    ) {
      return { ok: false, reason: 'station_data_invalid' };
    }

    var expectedFp = asString(src.expectedMatchFingerprint);
    var currentFp = seriesStationMatch.computeStationPayloadFingerprint(match);
    if (expectedFp && expectedFp !== currentFp) {
      return { ok: false, reason: 'round_conflict' };
    }

    if (!seriesManageAccess.isSeriesHostPrivileged(series, src.actor || {})) {
      return { ok: false, reason: 'permission_denied' };
    }

    var locks = resolveRoundEditLocks(series, round, match);
    if (locks.finished) {
      return { ok: false, reason: 'match_finished', locks: locks };
    }

    var sanitized = sanitizeRoundPatch(src.patch, locks);
    if (!sanitized.ok) {
      return {
        ok: false,
        reason: 'field_locked',
        rejected: sanitized.rejected,
        locks: locks
      };
    }
    if (!Object.keys(sanitized.patch).length) {
      return { ok: false, reason: 'empty_patch' };
    }

    var nextRound = applyRoundPatch(round, sanitized.patch);
    // fee 非法不得静默清空
    var feeCheck = seriesStationMatch.mapRoundFeeToFeeList(nextRound.fee, nextRound.roundId);
    if (!feeCheck.ok) return { ok: false, reason: 'fee_invalid' };

    var gameModeChanged =
      sanitized.patch.gameMode != null &&
      asString(sanitized.patch.gameMode) !== asString(round.gameMode);
    if (gameModeChanged && (isMatchStarted(match) || matchHasScores(match))) {
      return {
        ok: false,
        reason: 'game_mode_blocked',
        message: '本轮已开始或已有成绩，暂不可修改赛制'
      };
    }
    var needsClearGroups =
      gameModeChanged && matchHasGroupingStructure(match);
    if (needsClearGroups && !src.confirmClearGameModeStructure) {
      return {
        ok: false,
        reason: 'game_mode_clear_confirm_required',
        message: '修改赛制后，本轮现有分组将被清空，需要重新分组。是否继续？',
        hasGroupingStructure: true
      };
    }

    var matchFields = buildMatchFieldPatch(series, nextRound, match);
    if (!matchFields.ok) return { ok: false, reason: matchFields.reason };

    var nextSeries = deepClone(series);
    nextSeries.rounds = (nextSeries.rounds || []).map(function (r) {
      if (!r || asString(r.roundId) !== roundId) return r;
      return nextRound;
    });
    nextSeries.updatedAt = seriesModel.nowIso
      ? seriesModel.nowIso()
      : new Date().toISOString();

    var nextMatch = applyMatchPatchPreservingRuntime(match, matchFields.patch);
    if (needsClearGroups) {
      clearGameModeDerivedStructureOnMatch(nextMatch);
    }

    var journal = {
      journalId: 'sre_' + nowFn(),
      phase: 'pending_series',
      seriesId: seriesId,
      roundId: roundId,
      matchId: matchId,
      seriesBefore: deepClone(series),
      matchBefore: deepClone(match),
      createdAt: nowFn()
    };
    var jw = writeJournal(journal);
    if (!jw || !jw.ok) {
      return { ok: false, reason: 'journal_write_failed' };
    }

    var seriesWrite = seriesStore.upsertSeries(nextSeries);
    if (!seriesWrite || !seriesWrite.ok) {
      clearJournal();
      return {
        ok: false,
        reason: (seriesWrite && seriesWrite.reason) || 'series_write_failed'
      };
    }

    journal.phase = 'pending_match';
    journal.seriesAfter = deepClone(seriesWrite.series || nextSeries);
    writeJournal(journal);

    try {
      teamMatchStore.saveMatch(nextMatch);
    } catch (eMatch) {
      restoreSeries(journal.seriesBefore);
      clearJournal();
      return { ok: false, reason: 'match_write_failed' };
    }

    var readback = teamMatchStore.getMatchById(matchId);
    if (!readback) {
      restoreSeries(journal.seriesBefore);
      restoreMatch(journal.matchBefore);
      clearJournal();
      return { ok: false, reason: 'match_readback_missing' };
    }
    var rbCtx = readback.seriesContext || {};
    if (
      rbCtx.managed !== true ||
      asString(rbCtx.seriesId) !== seriesId ||
      asString(rbCtx.roundId) !== roundId ||
      asString(rbCtx.publishToken) !== asString(series.publishToken) ||
      asString(readback.matchId) !== matchId
    ) {
      restoreSeries(journal.seriesBefore);
      restoreMatch(journal.matchBefore);
      clearJournal();
      return { ok: false, reason: 'identity_drift' };
    }

    clearJournal();
    return {
      ok: true,
      series: seriesWrite.series || nextSeries,
      match: readback,
      locks: locks
    };
  }

  return {
    JOURNAL_KEY: JOURNAL_KEY,
    resolveRoundEditLocks: resolveRoundEditLocks,
    updatePublishedSeriesRound: updatePublishedSeriesRound,
    recoverInterruptedEdit: recoverInterruptedEdit,
    matchHasScores: matchHasScores,
    matchHasGroupingStructure: matchHasGroupingStructure,
    matchHasScoringStructure: matchHasScoringStructure,
    clearGameModeDerivedStructureOnMatch: clearGameModeDerivedStructureOnMatch
  };
}

module.exports = {
  JOURNAL_KEY: JOURNAL_KEY,
  resolveRoundEditLocks: resolveRoundEditLocks,
  matchHasScores: matchHasScores,
  matchHasGroupingStructure: matchHasGroupingStructure,
  matchHasScoringStructure: matchHasScoringStructure,
  clearGameModeDerivedStructureOnMatch: clearGameModeDerivedStructureOnMatch,
  isMatchFinished: isMatchFinished,
  isMatchStarted: isMatchStarted,
  createSeriesRoundUpdateService: createSeriesRoundUpdateService
};
