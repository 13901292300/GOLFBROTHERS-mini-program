/**
 * Series → group-pick「已报名人员」只读投影
 * - 数据源：series.roster（非 match.registerInfo）
 * - 不写 Series / 不写 match.registerInfo
 */

var seriesStore = require('../../../../utils/seriesStore.js');
var seriesStationIndex = require('../../../../utils/seriesStationIndex.js');
var seriesStationManageGate = require('../../../../utils/seriesStationManageGate.js');
var teamMatchStore = require('../../../../utils/teamMatchStore.js');
var seriesScheduleGroupWrite = require('./seriesScheduleGroupWrite.js');

var STATION_DATA_INVALID_MSG =
  seriesScheduleGroupWrite.STATION_DATA_INVALID_MSG || '本轮比赛数据异常';
var NO_REPEAT_TOGGLE_MSG = '该球员已在前序轮次上场';
var NO_REPEAT_SAVE_MSG = '存在已在前序轮次上场的球员';
var NO_REPEAT_HINT = '已在前序轮次上场';
var NO_REPEAT_REASON = 'player_already_played_prior_round';
var NO_REPEAT_DISABLED_REASON = 'no_repeat_prior_round';

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function resolveParticipantMode(series) {
  return asString(series && series.hostMode) === 'team' ? 'division' : 'team';
}

function resolveParticipantDisplayName(p) {
  if (!p || typeof p !== 'object') return '';
  return (
    asString(p.shortNameSnapshot) ||
    asString(p.nameSnapshot) ||
    asString(p.fullNameSnapshot) ||
    asString(p.sourceTeamId) ||
    asString(p.divisionId) ||
    asString(p.seriesParticipantId) ||
    '未命名'
  );
}

/** teamGroups.id：organization → sourceTeamId；team → divisionId */
function resolveTeamGroupId(participant, mode) {
  if (!participant) return '';
  if (mode === 'division') {
    return (
      asString(participant.divisionId) ||
      asString(participant.seriesParticipantId).replace(/^division:/, '') ||
      asString(participant.seriesParticipantId)
    );
  }
  return (
    asString(participant.sourceTeamId) || asString(participant.seriesParticipantId)
  );
}

function indexParticipants(series) {
  var mode = resolveParticipantMode(series);
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  var byId = Object.create(null);
  var tabs = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i] || {};
    var kind = asString(p.kind);
    if (kind && kind !== mode) continue;
    var sid = asString(p.seriesParticipantId);
    if (!sid || byId[sid]) continue;
    var name = resolveParticipantDisplayName(p);
    var teamGroupId = resolveTeamGroupId(p, mode);
    byId[sid] = {
      seriesParticipantId: sid,
      kind: mode,
      name: name,
      shortName: asString(p.shortNameSnapshot) || name,
      teamGroupId: teamGroupId,
      sourceTeamId: asString(p.sourceTeamId),
      divisionId: asString(p.divisionId)
    };
    tabs.push({ id: sid, name: name, count: 0 });
  }
  return { mode: mode, byId: byId, tabs: tabs };
}

function resolveRosterPlayerId(entry) {
  return asString(entry && entry.playerId) || asString(entry && entry.userId);
}

function isFromSeriesFlag(v) {
  return v === true || v === 1 || String(v) === '1';
}

function isNoRepeatRuleActive(series, fromSeries) {
  if (!isFromSeriesFlag(fromSeries)) return false;
  var rule = series && series.scoringRule;
  return !!(rule && rule.allowRepeat === false);
}

function hasNumericRoundIndex(round) {
  if (!round || round.index == null || round.index === '') return false;
  return isFinite(Number(round.index));
}

function locateRoundAndPriors(series, currentRoundId) {
  var rid = asString(currentRoundId);
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var foundIdx = -1;
  var i;
  for (i = 0; i < rounds.length; i++) {
    if (asString(rounds[i] && rounds[i].roundId) === rid) {
      foundIdx = i;
      break;
    }
  }
  if (!rid || foundIdx < 0) {
    return { ok: false, reason: 'round_not_located', message: STATION_DATA_INVALID_MSG };
  }
  var current = rounds[foundIdx];
  var currentHasIndex = hasNumericRoundIndex(current);
  var currentIndex = currentHasIndex ? Number(current.index) : foundIdx;
  var priorRounds = [];
  for (i = 0; i < rounds.length; i++) {
    if (i === foundIdx) continue;
    var round = rounds[i];
    if (!round || !asString(round.roundId)) continue;
    var isPrior;
    if (currentHasIndex && hasNumericRoundIndex(round)) {
      isPrior = Number(round.index) < currentIndex;
    } else {
      isPrior = i < foundIdx;
    }
    if (isPrior) priorRounds.push(round);
  }
  return {
    ok: true,
    current: current,
    currentIndex: foundIdx,
    priorRounds: priorRounds
  };
}

function collectPlayerIdsFromGroups(groups) {
  var ids = Object.create(null);
  var list = Array.isArray(groups) ? groups : [];
  for (var gi = 0; gi < list.length; gi++) {
    var players = list[gi] && Array.isArray(list[gi].players) ? list[gi].players : [];
    for (var pi = 0; pi < players.length; pi++) {
      var p = players[pi];
      var pid = asString(p && p.playerId);
      var uid = asString(p && p.userId);
      if (pid) ids[pid] = true;
      if (uid) ids[uid] = true;
    }
  }
  return ids;
}

function collectPlayerIdsFromSlots(slots) {
  var ids = Object.create(null);
  var list = Array.isArray(slots) ? slots : [];
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    var pid = asString(s && s.playerId) || asString(s && s.userId);
    if (pid) ids[pid] = true;
  }
  return ids;
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

/**
 * 前序 managed 分站正式 groups[].players 上场集合。
 * allowRepeat===false 且 fromSeries 时启用；任一前序分站核验失败则 fail closed。
 */
function collectPriorPlayedPlayerIds(input) {
  var src = input && typeof input === 'object' ? input : {};
  var empty = function (extra) {
    return Object.assign(
      {
        ok: true,
        enabled: false,
        playerIds: Object.create(null),
        priorRoundIds: []
      },
      extra || {}
    );
  };
  if (!isFromSeriesFlag(src.fromSeries)) {
    return empty({ reason: 'not_from_series' });
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
      priorRoundIds: []
    };
  }
  if (!isNoRepeatRuleActive(series, src.fromSeries)) {
    return empty({ reason: 'allow_repeat' });
  }
  var located = locateRoundAndPriors(series, src.currentRoundId || src.roundId);
  if (!located.ok) {
    return {
      ok: false,
      enabled: false,
      reason: located.reason,
      message: STATION_DATA_INVALID_MSG,
      playerIds: Object.create(null),
      priorRoundIds: []
    };
  }
  var getMatchById =
    typeof src.getMatchById === 'function' ? src.getMatchById : defaultGetMatchById;
  var getIndexByMatchId =
    typeof src.getIndexByMatchId === 'function'
      ? src.getIndexByMatchId
      : defaultGetIndexByMatchId;
  var playerIds = Object.create(null);
  var priorRoundIds = [];
  for (var i = 0; i < located.priorRounds.length; i++) {
    var round = located.priorRounds[i];
    var roundId = asString(round.roundId);
    var gate = seriesStationManageGate.verifyManagedStationForManage({
      series: series,
      roundId: roundId,
      getMatchById: getMatchById,
      getIndexByMatchId: getIndexByMatchId
    });
    if (!gate || !gate.ok) {
      return {
        ok: false,
        enabled: true,
        reason: (gate && gate.reason) || 'managed_station_invalid',
        message: STATION_DATA_INVALID_MSG,
        playerIds: Object.create(null),
        priorRoundIds: priorRoundIds
      };
    }
    priorRoundIds.push(roundId);
    var fromMatch = collectPlayerIdsFromGroups(gate.match && gate.match.groups);
    var keys = Object.keys(fromMatch);
    for (var k = 0; k < keys.length; k++) {
      playerIds[keys[k]] = true;
    }
  }
  return {
    ok: true,
    enabled: true,
    playerIds: playerIds,
    priorRoundIds: priorRoundIds,
    currentRoundId: asString(src.currentRoundId || src.roundId)
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
  if (!uid || !lockResult.playerIds[uid]) return next;
  next.noRepeatLocked = true;
  next.disabledReason = NO_REPEAT_DISABLED_REASON;
  next.isDisabled = true;
  next.noRepeatHint = NO_REPEAT_HINT;
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
  if (!lockResult.enabled || !uid || !lockResult.playerIds[uid]) {
    return { blocked: false };
  }
  return {
    blocked: true,
    reason: NO_REPEAT_REASON,
    message: NO_REPEAT_TOGGLE_MSG
  };
}

function assertPlayersNotPlayedPriorRound(playerIds, inputOrLock) {
  var lock =
    inputOrLock && inputOrLock.playerIds && Object.prototype.hasOwnProperty.call(inputOrLock, 'ok')
      ? inputOrLock
      : collectPriorPlayedPlayerIds(inputOrLock);
  if (!lock || !lock.ok) {
    return {
      ok: false,
      reason: (lock && lock.reason) || 'managed_station_invalid',
      message: (lock && lock.message) || STATION_DATA_INVALID_MSG
    };
  }
  if (!lock.enabled) return { ok: true, enabled: false };
  var ids = playerIds;
  if (ids && typeof ids === 'object' && !Array.isArray(ids)) {
    ids = Object.keys(ids).filter(function (k) {
      return !!ids[k];
    });
  }
  var list = Array.isArray(ids) ? ids : [];
  for (var i = 0; i < list.length; i++) {
    var uid = asString(list[i]);
    if (uid && lock.playerIds[uid]) {
      return {
        ok: false,
        reason: NO_REPEAT_REASON,
        message: NO_REPEAT_SAVE_MSG
      };
    }
  }
  return { ok: true, enabled: true };
}

function resolveRosterDisplayName(entry) {
  return (
    asString(entry && entry.nameSnapshot) ||
    asString(entry && entry.playerNameSnapshot) ||
    asString(entry && entry.competitionName) ||
    asString(entry && entry.matchNickname) ||
    asString(entry && entry.nickname) ||
    asString(entry && entry.displayName) ||
    ''
  );
}

function resolveRosterAvatar(entry) {
  return (
    asString(entry && entry.avatarSnapshot) ||
    asString(entry && entry.playerAvatarSnapshot) ||
    asString(entry && entry.avatar) ||
    ''
  );
}

function resolveRosterGender(entry) {
  return (
    asString(entry && entry.genderSnapshot) ||
    asString(entry && entry.gender) ||
    asString(entry && entry.sex) ||
    ''
  );
}

function resolveRosterHandicap(entry) {
  if (entry && entry.handicapSnapshot != null && entry.handicapSnapshot !== '') {
    return String(entry.handicapSnapshot);
  }
  if (entry && entry.handicap != null && entry.handicap !== '') {
    return String(entry.handicap);
  }
  return '-';
}

function isRegisteredRosterEntry(entry, participantById) {
  if (!entry || typeof entry !== 'object') return false;
  var playerId = resolveRosterPlayerId(entry);
  if (!playerId) return false;
  var status = asString(entry.registrationStatus).toLowerCase();
  if (status && status !== 'registered') return false;
  var sid = asString(entry.seriesParticipantId);
  if (!sid || !participantById[sid]) return false;
  return true;
}

function hasValidSeriesAffiliation(entry, series) {
  var indexed = indexParticipants(series);
  var sid = asString(entry && entry.seriesParticipantId);
  return !!(sid && indexed.byId[sid]);
}

/**
 * 合法 roster 归属 → 不弹归属选择；非 roster / 归属失效 → 须手选
 */
function needsAffiliationSelection(playerLike, series) {
  if (!playerLike || typeof playerLike !== 'object') return true;
  if (playerLike.fromSeriesRoster === true || playerLike.isSeriesRoster === true) {
    return !hasValidSeriesAffiliation(playerLike, series);
  }
  var sid = asString(playerLike.seriesParticipantId);
  if (!sid) return true;
  var indexed = indexParticipants(series);
  return !indexed.byId[sid];
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

function buildSeriesPickRegisterProjection(series) {
  var indexed = indexParticipants(series);
  var roster = Array.isArray(series && series.roster) ? series.roster : [];
  var users = [];
  var counts = Object.create(null);
  for (var t = 0; t < indexed.tabs.length; t++) {
    counts[indexed.tabs[t].id] = 0;
  }

  for (var i = 0; i < roster.length; i++) {
    var entry = roster[i];
    if (!isRegisteredRosterEntry(entry, indexed.byId)) continue;
    var playerId = resolveRosterPlayerId(entry);
    var sid = asString(entry.seriesParticipantId);
    var part = indexed.byId[sid];
    var teamGroupId = asString(part.teamGroupId) || sid;
    var teamName = asString(part.name);
    var shortName = asString(part.shortName) || teamName;
    var partRaw = null;
    var parts = Array.isArray(series && series.participants) ? series.participants : [];
    for (var pi = 0; pi < parts.length; pi++) {
      if (asString(parts[pi] && parts[pi].seriesParticipantId) === sid) {
        partRaw = parts[pi];
        break;
      }
    }
    var nameSnap =
      asString(partRaw && partRaw.nameSnapshot) ||
      asString(partRaw && partRaw.fullNameSnapshot) ||
      teamName;
    var shortSnap = asString(partRaw && partRaw.shortNameSnapshot) || shortName;
    var colorSnap = asString(partRaw && partRaw.colorSnapshot);
    counts[sid] = (counts[sid] || 0) + 1;
    users.push({
      userId: playerId,
      playerId: playerId,
      competitionName: resolveRosterDisplayName(entry) || playerId,
      displayName: resolveRosterDisplayName(entry) || playerId,
      nickname: resolveRosterDisplayName(entry) || playerId,
      avatar: resolveRosterAvatar(entry),
      gender: resolveRosterGender(entry),
      handicap: resolveRosterHandicap(entry),
      groupId: sid,
      groupName: shortSnap || teamName,
      matchTeamId: teamGroupId,
      matchTeamName: shortSnap || teamName,
      seriesParticipantId: sid,
      affiliationId: teamGroupId,
      participantNameSnapshot: nameSnap,
      participantShortNameSnapshot: shortSnap,
      participantColorSnapshot: colorSnap,
      shortNameSnapshot: shortSnap,
      colorSnapshot: colorSnap,
      fromSeriesRoster: true,
      isSeriesRoster: true
    });
  }

  var tabs = indexed.tabs.map(function (tab) {
    return {
      id: tab.id,
      name: tab.name,
      count: counts[tab.id] || 0
    };
  });

  return {
    registerInfo: {
      totalCount: users.length,
      users: users
    },
    registerSubTabs: tabs,
    emptyText: '暂无报名人员'
  };
}

function loadSeriesPickRegisterSource(input) {
  var verified = verifySeriesPickContext(input);
  if (!verified.ok) return verified;
  var src = input && typeof input === 'object' ? input : {};
  var noRepeat = collectPriorPlayedPlayerIds({
    fromSeries: true,
    series: verified.series,
    seriesId: verified.seriesId,
    currentRoundId: verified.roundId,
    getMatchById: src.getMatchById,
    getIndexByMatchId: src.getIndexByMatchId
  });
  if (!noRepeat.ok) {
    return {
      ok: false,
      reason: noRepeat.reason,
      message: noRepeat.message || STATION_DATA_INVALID_MSG
    };
  }
  var projection = buildSeriesPickRegisterProjection(verified.series);
  return {
    ok: true,
    series: verified.series,
    match: verified.match,
    seriesId: verified.seriesId,
    roundId: verified.roundId,
    matchId: verified.matchId,
    registerInfo: projection.registerInfo,
    registerSubTabs: projection.registerSubTabs,
    emptyText: projection.emptyText,
    noRepeat: noRepeat
  };
}

module.exports = {
  STATION_DATA_INVALID_MSG: STATION_DATA_INVALID_MSG,
  NO_REPEAT_TOGGLE_MSG: NO_REPEAT_TOGGLE_MSG,
  NO_REPEAT_SAVE_MSG: NO_REPEAT_SAVE_MSG,
  NO_REPEAT_HINT: NO_REPEAT_HINT,
  NO_REPEAT_REASON: NO_REPEAT_REASON,
  NO_REPEAT_DISABLED_REASON: NO_REPEAT_DISABLED_REASON,
  verifySeriesPickContext: verifySeriesPickContext,
  buildSeriesPickRegisterProjection: buildSeriesPickRegisterProjection,
  loadSeriesPickRegisterSource: loadSeriesPickRegisterSource,
  needsAffiliationSelection: needsAffiliationSelection,
  hasValidSeriesAffiliation: hasValidSeriesAffiliation,
  resolveRosterPlayerId: resolveRosterPlayerId,
  resolveRosterDisplayName: resolveRosterDisplayName,
  isNoRepeatRuleActive: isNoRepeatRuleActive,
  locateRoundAndPriors: locateRoundAndPriors,
  collectPlayerIdsFromGroups: collectPlayerIdsFromGroups,
  collectPlayerIdsFromSlots: collectPlayerIdsFromSlots,
  collectPriorPlayedPlayerIds: collectPriorPlayedPlayerIds,
  mergeNoRepeatLockFields: mergeNoRepeatLockFields,
  shouldBlockNoRepeatAdd: shouldBlockNoRepeatAdd,
  assertPlayersNotPlayedPriorRound: assertPlayersNotPlayedPriorRound
};
