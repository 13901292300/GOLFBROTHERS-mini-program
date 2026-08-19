/**
 * 系列赛「不可重复上场」参赛资格（纯函数）
 * - 配置：series.scoringRule.allowRepeat !== true（与 global_m / per_round_n 无关）
 * - 莱德杯：跨轮允许（allowRepeat:true）；同轮重复由分组编辑器拒绝
 * - 显式莱德杯不走跨轮占用锁
 * - 身份：稳定 userId / playerId；Rx/Cx 仅用于提示
 * - 占用：其他未取消有效轮次的正式分组成员（含 G2–G4 每一位真实成员）
 * - 候选过滤与保存校验必须调用同一套收集 / 判定
 */

var seriesRyderCup = require('../../../utils/seriesRyderCup.js');
var seriesStore = require('../../../utils/seriesStore.js');
var seriesStationIndex = require('../../../utils/seriesStationIndex.js');
var teamMatchStore = require('../../../utils/teamMatchStore.js');
var seriesRoundDisplayLabels = require('../../../utils/seriesRoundDisplayLabels.js');
var seriesRoundVisualState = require('../../../utils/seriesRoundVisualState.js');

var STATION_DATA_INVALID_MSG = '本轮比赛数据异常';
var NO_REPEAT_REASON = 'player_already_played_other_round';
var NO_REPEAT_DISABLED_REASON = 'no_repeat_other_round';
var NO_REPEAT_REASON_LEGACY = 'player_already_played_prior_round';
var NO_REPEAT_DISABLED_REASON_LEGACY = 'no_repeat_prior_round';

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function isFromSeriesFlag(v) {
  return v === true || v === 1 || String(v) === '1';
}

function isNoRepeatRuleActive(series, fromSeries) {
  if (!isFromSeriesFlag(fromSeries)) return false;
  if (seriesRyderCup.isRyderCupSeries(series)) return false;
  var rule = series && series.scoringRule;
  if (!rule || typeof rule !== 'object') return true;
  return rule.allowRepeat !== true;
}

function resolveSeatDisplayName(src) {
  if (!src || typeof src !== 'object') return '';
  return (
    asString(src.displayName) ||
    asString(src.competitionName) ||
    asString(src.playerNameSnapshot) ||
    asString(src.nameSnapshot) ||
    asString(src.nickname) ||
    asString(src.nickName) ||
    asString(src.name) ||
    ''
  );
}

function absorbStableIds(src, into) {
  if (!src || typeof src !== 'object' || !into) return;
  var uid = asString(src.userId);
  var pid = asString(src.playerId);
  if (uid) into[uid] = true;
  if (pid) into[pid] = true;
}

function collectStableIdsFromPlayerLike(src, into) {
  if (!src || typeof src !== 'object') return;
  absorbStableIds(src, into);
  var members = src.members;
  if (Array.isArray(members)) {
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      if (m && typeof m === 'object') absorbStableIds(m, into);
      else if (asString(m)) into[asString(m)] = true;
    }
  }
  var memberUserIds = src.memberUserIds;
  if (Array.isArray(memberUserIds)) {
    for (var j = 0; j < memberUserIds.length; j++) {
      var mid = asString(memberUserIds[j]);
      if (mid) into[mid] = true;
    }
  }
}

function collectPlayerIdsFromGroups(groups) {
  var ids = Object.create(null);
  var list = Array.isArray(groups) ? groups : [];
  for (var gi = 0; gi < list.length; gi++) {
    var group = list[gi];
    if (!group || typeof group !== 'object') continue;
    var players = Array.isArray(group.players) ? group.players : [];
    for (var pi = 0; pi < players.length; pi++) {
      collectStableIdsFromPlayerLike(players[pi], ids);
    }
  }
  return ids;
}

function collectPlayerIdsFromSlots(slots) {
  var ids = Object.create(null);
  var list = Array.isArray(slots) ? slots : [];
  for (var i = 0; i < list.length; i++) {
    collectStableIdsFromPlayerLike(list[i], ids);
  }
  return ids;
}

function collectPlayerIdsFromPairings(pairings) {
  var ids = Object.create(null);
  var src = pairings && typeof pairings === 'object' && !Array.isArray(pairings) ? pairings : {};
  var keys = Object.keys(src);
  for (var k = 0; k < keys.length; k++) {
    var list = src[keys[k]];
    if (!Array.isArray(list)) continue;
    for (var i = 0; i < list.length; i++) {
      var pairing = list[i];
      if (!pairing || typeof pairing !== 'object') continue;
      var playerIds = Array.isArray(pairing.playerIds) ? pairing.playerIds : [];
      for (var p = 0; p < playerIds.length; p++) {
        var id = asString(playerIds[p]);
        if (id) ids[id] = true;
      }
    }
  }
  return ids;
}

function collectPlayerIdsFromEntities(entities) {
  var ids = Object.create(null);
  var list = Array.isArray(entities) ? entities : [];
  for (var i = 0; i < list.length; i++) {
    var entity = list[i];
    if (!entity || typeof entity !== 'object') continue;
    var members = Array.isArray(entity.members) ? entity.members : [];
    for (var m = 0; m < members.length; m++) {
      collectStableIdsFromPlayerLike(members[m], ids);
    }
    var memberUserIds = Array.isArray(entity.memberUserIds) ? entity.memberUserIds : [];
    for (var u = 0; u < memberUserIds.length; u++) {
      var mid = asString(memberUserIds[u]);
      if (mid) ids[mid] = true;
    }
  }
  return ids;
}

function mergeIdMaps(target) {
  var out = target && typeof target === 'object' ? target : Object.create(null);
  for (var i = 1; i < arguments.length; i++) {
    var map = arguments[i];
    if (!map) continue;
    var keys = Object.keys(map);
    for (var k = 0; k < keys.length; k++) {
      if (map[keys[k]]) out[keys[k]] = true;
    }
  }
  return out;
}

function collectFormalMemberIdsFromMatch(match) {
  if (!match || typeof match !== 'object') return Object.create(null);
  return mergeIdMaps(
    collectPlayerIdsFromGroups(match.groups),
    collectPlayerIdsFromPairings(match.pairings),
    collectPlayerIdsFromEntities(match.scoreEntities)
  );
}

function collectSeatNameById(match) {
  var names = Object.create(null);
  function note(src) {
    if (!src || typeof src !== 'object') return;
    var name = resolveSeatDisplayName(src);
    if (!name) return;
    var uid = asString(src.userId);
    var pid = asString(src.playerId);
    if (uid && !names[uid]) names[uid] = name;
    if (pid && !names[pid]) names[pid] = name;
  }
  var groups = match && Array.isArray(match.groups) ? match.groups : [];
  for (var g = 0; g < groups.length; g++) {
    var players = groups[g] && Array.isArray(groups[g].players) ? groups[g].players : [];
    for (var p = 0; p < players.length; p++) note(players[p]);
  }
  return names;
}

function resolveOccupancyStation(series, round, getMatchById, getIndexByMatchId) {
  var roundId = asString(round && round.roundId);
  if (!roundId) return { skip: true, reason: 'round_id_missing' };
  if (isCancelledRound(round, null)) return { skip: true, reason: 'cancelled_round' };
  var matchId = asString(round.matchId);
  if (!matchId) return { skip: true, reason: 'match_id_missing' };
  var match = null;
  try {
    match = getMatchById(matchId);
  } catch (e) {
    match = null;
  }
  if (!match || typeof match !== 'object') {
    return { skip: true, reason: 'match_not_found' };
  }
  if (isCancelledRound(round, match)) return { skip: true, reason: 'cancelled_match' };
  var ctx = match.seriesContext && typeof match.seriesContext === 'object' ? match.seriesContext : null;
  if (!ctx || ctx.managed !== true) {
    return {
      ok: false,
      reason: 'not_managed',
      message: STATION_DATA_INVALID_MSG
    };
  }
  if (asString(ctx.seriesId) !== asString(series && series.seriesId)) {
    return { ok: false, reason: 'series_id_mismatch', message: STATION_DATA_INVALID_MSG };
  }
  if (asString(ctx.roundId) !== roundId) {
    return { ok: false, reason: 'round_id_mismatch', message: STATION_DATA_INVALID_MSG };
  }
  var seriesToken = asString(series && series.publishToken);
  var ctxToken = asString(ctx.publishToken);
  if (seriesToken && ctxToken && seriesToken !== ctxToken) {
    return { ok: false, reason: 'publish_token_mismatch', message: STATION_DATA_INVALID_MSG };
  }
  if (typeof getIndexByMatchId === 'function') {
    var indexRow = null;
    try {
      indexRow = getIndexByMatchId(matchId);
    } catch (e2) {
      indexRow = null;
    }
    if (indexRow && typeof indexRow === 'object') {
      if (asString(indexRow.seriesId) && asString(indexRow.seriesId) !== asString(series.seriesId)) {
        return { ok: false, reason: 'index_series_mismatch', message: STATION_DATA_INVALID_MSG };
      }
      if (asString(indexRow.roundId) && asString(indexRow.roundId) !== roundId) {
        return { ok: false, reason: 'index_round_mismatch', message: STATION_DATA_INVALID_MSG };
      }
      if (asString(indexRow.matchId) && asString(indexRow.matchId) !== matchId) {
        return { ok: false, reason: 'index_match_mismatch', message: STATION_DATA_INVALID_MSG };
      }
    }
  }
  return { ok: true, match: match, matchId: matchId, roundId: roundId };
}

function defaultGetMatchById(matchId) {
  return typeof teamMatchStore.getMatchById === 'function'
    ? teamMatchStore.getMatchById(matchId)
    : null;
}

function defaultGetIndexByMatchId(matchId) {
  return typeof seriesStationIndex.getByMatchId === 'function'
    ? seriesStationIndex.getByMatchId(matchId)
    : null;
}

function isCancelledRound(round, match) {
  var visual = seriesRoundVisualState.resolveSeriesRoundVisualState(round, match);
  return !!(visual && visual.state === seriesRoundVisualState.STATE.cancelled);
}

function formatOccupiedHint(label) {
  var tag = asString(label);
  return tag ? '已在 ' + tag + ' 上场' : '已在其他轮次上场';
}

function formatOccupiedSaveMessage(conflict) {
  var row = conflict && typeof conflict === 'object' ? conflict : {};
  var hint = formatOccupiedHint(row.label);
  var name = asString(row.playerName);
  if (name) return name + hint.replace(/^已在/, '已在');
  return hint;
}

function lookupOccupancy(playerId, lockResult) {
  var uid = asString(playerId);
  if (!uid || !lockResult || !lockResult.enabled) return null;
  if (lockResult.occupancy && lockResult.occupancy[uid]) return lockResult.occupancy[uid];
  if (lockResult.playerIds && lockResult.playerIds[uid]) {
    return {
      roundId: asString(lockResult.roundId),
      label: '',
      playerName: '',
      matchId: ''
    };
  }
  return null;
}

function emptyOccupancy(extra) {
  return Object.assign(
    {
      ok: true,
      enabled: false,
      playerIds: Object.create(null),
      occupancy: Object.create(null),
      otherRoundIds: [],
      priorRoundIds: []
    },
    extra || {}
  );
}

/**
 * 收集当前轮以外、未取消有效轮次的正式上场占用。
 * 当前轮成员不会进入占用表（可回显）；跨轮重复由「其他轮」占用表达。
 */
function collectOtherRoundOccupancy(input) {
  var src = input && typeof input === 'object' ? input : {};
  if (!isFromSeriesFlag(src.fromSeries)) {
    return emptyOccupancy({ reason: 'not_from_series' });
  }
  var series =
    src.series && typeof src.series === 'object'
      ? src.series
      : asString(src.seriesId) && typeof seriesStore.getSeriesById === 'function'
        ? seriesStore.getSeriesById(src.seriesId)
        : null;
  if (!series) {
    return {
      ok: false,
      enabled: false,
      reason: 'series_required',
      message: STATION_DATA_INVALID_MSG,
      playerIds: Object.create(null),
      occupancy: Object.create(null),
      otherRoundIds: [],
      priorRoundIds: []
    };
  }
  if (!isNoRepeatRuleActive(series, src.fromSeries)) {
    return emptyOccupancy({ reason: 'allow_repeat' });
  }
  var currentRoundId = asString(src.currentRoundId || src.roundId);
  var rounds = Array.isArray(series.rounds) ? series.rounds : [];
  var found = false;
  var ri;
  for (ri = 0; ri < rounds.length; ri++) {
    if (asString(rounds[ri] && rounds[ri].roundId) === currentRoundId) {
      found = true;
      break;
    }
  }
  if (!currentRoundId || !found) {
    return {
      ok: false,
      enabled: false,
      reason: 'round_not_located',
      message: STATION_DATA_INVALID_MSG,
      playerIds: Object.create(null),
      occupancy: Object.create(null),
      otherRoundIds: [],
      priorRoundIds: []
    };
  }

  var getMatchById =
    typeof src.getMatchById === 'function' ? src.getMatchById : defaultGetMatchById;
  var getIndexByMatchId =
    typeof src.getIndexByMatchId === 'function'
      ? src.getIndexByMatchId
      : defaultGetIndexByMatchId;
  var labels = seriesRoundDisplayLabels.buildSeriesRoundDisplayLabels(series);
  var playerIds = Object.create(null);
  var occupancy = Object.create(null);
  var otherRoundIds = [];

  for (ri = 0; ri < rounds.length; ri++) {
    var round = rounds[ri];
    var roundId = asString(round && round.roundId);
    if (!roundId || roundId === currentRoundId) continue;
    var station = resolveOccupancyStation(series, round, getMatchById, getIndexByMatchId);
    if (station && station.skip) continue;
    if (!station || station.ok === false) {
      return {
        ok: false,
        enabled: true,
        reason: (station && station.reason) || 'managed_station_invalid',
        message: STATION_DATA_INVALID_MSG,
        playerIds: Object.create(null),
        occupancy: Object.create(null),
        otherRoundIds: otherRoundIds,
        priorRoundIds: otherRoundIds
      };
    }

    otherRoundIds.push(roundId);
    var ids = collectFormalMemberIdsFromMatch(station.match);
    var names = collectSeatNameById(station.match);
    var label = asString(labels[roundId]) || asString(round.name) || roundId;
    var matchId = asString(station.matchId);
    var keys = Object.keys(ids);
    for (var k = 0; k < keys.length; k++) {
      var id = keys[k];
      if (!id || occupancy[id]) continue;
      playerIds[id] = true;
      occupancy[id] = {
        playerId: id,
        playerName: names[id] || '',
        roundId: roundId,
        matchId: matchId,
        label: label
      };
    }
  }

  return {
    ok: true,
    enabled: true,
    playerIds: playerIds,
    occupancy: occupancy,
    otherRoundIds: otherRoundIds,
    priorRoundIds: otherRoundIds,
    currentRoundId: currentRoundId
  };
}

function mergeNoRepeatLockFields(user, lockResult) {
  var next = user && typeof user === 'object' ? Object.assign({}, user) : {};
  var uid = asString(next.userId) || asString(next.playerId);
  var checked = !!(next.isSelected || next.checked);
  if (!lockResult || !lockResult.ok) {
    if (!checked) next.isDisabled = true;
    return next;
  }
  if (!lockResult.enabled) return next;
  var occ = lookupOccupancy(uid, lockResult);
  if (!occ) return next;
  next.noRepeatLocked = true;
  next.disabledReason = NO_REPEAT_DISABLED_REASON;
  next.isDisabled = true;
  next.noRepeatHint = formatOccupiedHint(occ.label);
  next.noRepeatRoundId = asString(occ.roundId);
  next.noRepeatRoundLabel = asString(occ.label);
  return next;
}

function shouldBlockNoRepeatAdd(playerId, lockResult) {
  var uid = asString(playerId);
  if (!lockResult || !lockResult.ok) {
    return {
      blocked: true,
      reason: (lockResult && lockResult.reason) || 'managed_station_invalid',
      message: (lockResult && lockResult.message) || STATION_DATA_INVALID_MSG
    };
  }
  if (!lockResult.enabled || !uid) return { blocked: false };
  var occ = lookupOccupancy(uid, lockResult);
  if (!occ) return { blocked: false };
  return {
    blocked: true,
    reason: NO_REPEAT_REASON,
    message: formatOccupiedSaveMessage(occ),
    conflict: occ
  };
}

function normalizeIdList(playerIds) {
  if (playerIds && typeof playerIds === 'object' && !Array.isArray(playerIds)) {
    return Object.keys(playerIds).filter(function (k) {
      return !!playerIds[k];
    });
  }
  return Array.isArray(playerIds) ? playerIds : [];
}

function assertPlayersNotOccupied(playerIds, inputOrLock) {
  var lock =
    inputOrLock &&
    inputOrLock.playerIds &&
    Object.prototype.hasOwnProperty.call(inputOrLock, 'ok')
      ? inputOrLock
      : collectOtherRoundOccupancy(inputOrLock);
  if (!lock || !lock.ok) {
    return {
      ok: false,
      reason: (lock && lock.reason) || 'managed_station_invalid',
      message: (lock && lock.message) || STATION_DATA_INVALID_MSG
    };
  }
  if (!lock.enabled) return { ok: true, enabled: false };
  var list = normalizeIdList(playerIds);
  var conflicts = [];
  var seen = Object.create(null);
  for (var i = 0; i < list.length; i++) {
    var uid = asString(list[i]);
    if (!uid || seen[uid]) continue;
    var occ = lookupOccupancy(uid, lock);
    if (!occ) continue;
    seen[uid] = true;
    conflicts.push(occ);
  }
  if (!conflicts.length) return { ok: true, enabled: true };
  return {
    ok: false,
    reason: NO_REPEAT_REASON,
    message: formatOccupiedSaveMessage(conflicts[0]),
    conflicts: conflicts
  };
}

function collectDraftMemberIds(groups, pairings) {
  return mergeIdMaps(
    collectPlayerIdsFromGroups(groups),
    collectPlayerIdsFromPairings(pairings)
  );
}

module.exports = {
  STATION_DATA_INVALID_MSG: STATION_DATA_INVALID_MSG,
  NO_REPEAT_REASON: NO_REPEAT_REASON,
  NO_REPEAT_DISABLED_REASON: NO_REPEAT_DISABLED_REASON,
  NO_REPEAT_REASON_LEGACY: NO_REPEAT_REASON_LEGACY,
  NO_REPEAT_DISABLED_REASON_LEGACY: NO_REPEAT_DISABLED_REASON_LEGACY,
  isFromSeriesFlag: isFromSeriesFlag,
  isNoRepeatRuleActive: isNoRepeatRuleActive,
  formatOccupiedHint: formatOccupiedHint,
  formatOccupiedSaveMessage: formatOccupiedSaveMessage,
  collectPlayerIdsFromGroups: collectPlayerIdsFromGroups,
  collectPlayerIdsFromSlots: collectPlayerIdsFromSlots,
  collectPlayerIdsFromPairings: collectPlayerIdsFromPairings,
  collectFormalMemberIdsFromMatch: collectFormalMemberIdsFromMatch,
  collectDraftMemberIds: collectDraftMemberIds,
  collectOtherRoundOccupancy: collectOtherRoundOccupancy,
  collectPriorPlayedPlayerIds: collectOtherRoundOccupancy,
  lookupOccupancy: lookupOccupancy,
  mergeNoRepeatLockFields: mergeNoRepeatLockFields,
  shouldBlockNoRepeatAdd: shouldBlockNoRepeatAdd,
  assertPlayersNotOccupied: assertPlayersNotOccupied,
  assertPlayersNotPlayedPriorRound: assertPlayersNotOccupied
};
