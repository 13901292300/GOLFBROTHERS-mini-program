/**
 * Series → group-pick「已报名人员」只读投影（薄适配）
 * - 投影权威在主包 seriesPickRegisterSource
 * - 本文件保留 fromSeries 核验（seriesScheduleGroupWrite）与原导出
 * - 不写 Series / 不写 match.registerInfo
 */

var seriesStore = require('../../../../utils/seriesStore.js');
var seriesStationIndex = require('../../../../utils/seriesStationIndex.js');
var seriesNoRepeatLineup = require('../../../../utils/seriesNoRepeatLineup.js');
var seriesPickRegisterSource = require('../../../../utils/seriesPickRegisterSource.js');
var seriesScheduleGroupWrite = require('../../../../utils/tournament/seriesScheduleGroupWrite.js');

var STATION_DATA_INVALID_MSG =
  seriesScheduleGroupWrite.STATION_DATA_INVALID_MSG ||
  seriesNoRepeatLineup.STATION_DATA_INVALID_MSG ||
  seriesPickRegisterSource.STATION_DATA_INVALID_MSG ||
  '本轮比赛数据异常';
var NO_REPEAT_REASON = seriesNoRepeatLineup.NO_REPEAT_REASON;
var NO_REPEAT_DISABLED_REASON = seriesNoRepeatLineup.NO_REPEAT_DISABLED_REASON;
var NO_REPEAT_HINT = '已在其他轮次上场';
var NO_REPEAT_TOGGLE_MSG = NO_REPEAT_HINT;
var NO_REPEAT_SAVE_MSG = NO_REPEAT_HINT;

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function isNoRepeatRuleActive(series, fromSeries) {
  return seriesNoRepeatLineup.isNoRepeatRuleActive(series, fromSeries);
}

function collectPlayerIdsFromGroups(groups) {
  return seriesNoRepeatLineup.collectPlayerIdsFromGroups(groups);
}

function collectPlayerIdsFromSlots(slots) {
  return seriesNoRepeatLineup.collectPlayerIdsFromSlots(slots);
}

function collectPriorPlayedPlayerIds(input) {
  return seriesNoRepeatLineup.collectOtherRoundOccupancy(input);
}

function mergeNoRepeatLockFields(user, lockResult) {
  return seriesNoRepeatLineup.mergeNoRepeatLockFields(user, lockResult);
}

function shouldBlockNoRepeatAdd(playerId, lockResult) {
  return seriesNoRepeatLineup.shouldBlockNoRepeatAdd(playerId, lockResult);
}

function assertPlayersNotPlayedPriorRound(playerIds, inputOrLock) {
  return seriesNoRepeatLineup.assertPlayersNotOccupied(playerIds, inputOrLock);
}

function verifySeriesPickContext(input) {
  var src = input && typeof input === 'object' ? input : {};
  if (!(src.fromSeries === true || src.fromSeries === 1 || String(src.fromSeries) === '1')) {
    return { ok: false, reason: 'not_from_series', message: STATION_DATA_INVALID_MSG };
  }
  var seriesId = asString(src.seriesId);
  var roundId = asString(src.roundId);
  var matchId = asString(src.matchId);
  var match = src.match || null;
  var series =
    src.series ||
    (seriesId && typeof seriesStore.getSeriesById === 'function'
      ? seriesStore.getSeriesById(seriesId)
      : null);
  if (!seriesId || !roundId || !matchId || !match || !series) {
    return { ok: false, reason: 'args_required', message: STATION_DATA_INVALID_MSG };
  }
  if (asString(series.seriesId) !== seriesId) {
    return { ok: false, reason: 'series_id_mismatch', message: STATION_DATA_INVALID_MSG };
  }
  var getIndexByMatchId =
    typeof src.getIndexByMatchId === 'function'
      ? src.getIndexByMatchId
      : function (id) {
          return seriesStationIndex.getByMatchId(id);
        };
  var check = seriesScheduleGroupWrite.verifySeriesContext(match, series, {
    roundId: roundId,
    getIndexByMatchId: getIndexByMatchId
  });
  if (!check || !check.ok) {
    return {
      ok: false,
      reason: (check && check.reason) || 'context_invalid',
      message: STATION_DATA_INVALID_MSG
    };
  }
  return {
    ok: true,
    series: series,
    match: match,
    seriesId: seriesId,
    roundId: roundId,
    matchId: matchId
  };
}

function loadSeriesPickRegisterSource(input) {
  var verified = verifySeriesPickContext(input);
  if (!verified.ok) return verified;
  return seriesPickRegisterSource.completeVerifiedPickRegisterSource(verified, input);
}

module.exports = {
  STATION_DATA_INVALID_MSG: STATION_DATA_INVALID_MSG,
  NO_REPEAT_TOGGLE_MSG: NO_REPEAT_TOGGLE_MSG,
  NO_REPEAT_SAVE_MSG: NO_REPEAT_SAVE_MSG,
  NO_REPEAT_HINT: NO_REPEAT_HINT,
  NO_REPEAT_REASON: NO_REPEAT_REASON,
  NO_REPEAT_DISABLED_REASON: NO_REPEAT_DISABLED_REASON,
  verifySeriesPickContext: verifySeriesPickContext,
  buildSeriesPickRegisterProjection: seriesPickRegisterSource.buildSeriesPickRegisterProjection,
  loadSeriesPickRegisterSource: loadSeriesPickRegisterSource,
  needsAffiliationSelection: seriesPickRegisterSource.needsAffiliationSelection,
  hasValidSeriesAffiliation: seriesPickRegisterSource.hasValidSeriesAffiliation,
  resolveRosterPlayerId: seriesPickRegisterSource.resolveRosterPlayerId,
  resolveRosterDisplayName: seriesPickRegisterSource.resolveRosterDisplayName,
  isNoRepeatRuleActive: isNoRepeatRuleActive,
  collectPlayerIdsFromGroups: collectPlayerIdsFromGroups,
  collectPlayerIdsFromSlots: collectPlayerIdsFromSlots,
  collectPriorPlayedPlayerIds: collectPriorPlayedPlayerIds,
  mergeNoRepeatLockFields: mergeNoRepeatLockFields,
  shouldBlockNoRepeatAdd: shouldBlockNoRepeatAdd,
  assertPlayersNotPlayedPriorRound: assertPlayersNotPlayedPriorRound
};
