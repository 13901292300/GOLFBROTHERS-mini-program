/**
 * Published Series 主办/参赛主体更新编排（E2 窄修）
 * - 同 hostMode 内更换主办方与参赛球队/分队
 * - 全部分站同步 host 快照 + teamGroups 空壳目录
 * - 不碰 groups/pairings/scores/roster/权限/轮次字段
 * - journal 整批回滚；不 publish / plan / 重建分站
 */

var seriesModel = require('./seriesModel.js');
var seriesStationMatch = require('./seriesStationMatch.js');
var seriesStationIndex = require('./seriesStationIndex.js');
var seriesManageAccess = require('./seriesManageAccess.js');
var seriesRoundUpdate = require('./seriesRoundUpdate.js');
var seriesFinishLock = require('./seriesFinishLock.js');

var JOURNAL_KEY = 'gb_series_participants_edit_journal_v1';
var STRUCTURE_BUSY_MSG = '系列赛已有分组或比赛数据，暂不可修改主办方及参赛球队';
var ROSTER_BLOCK_MSG = '该球队已有报名球员，请先调整报名名单';
var HOST_MODE_LOCKED_MSG = '系列赛发布后暂不支持切换主办场景';

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function asString(v) {
  return v == null ? '' : String(v).trim();
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

function isActiveRosterEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  var st = asString(entry.registrationStatus).toLowerCase();
  if (st === 'cancelled' || st === 'canceled' || st === 'withdrawn') return false;
  if (asString(entry.cancelledAt)) return false;
  return true;
}

function hasActiveRosterForParticipant(series, seriesParticipantId) {
  var pid = asString(seriesParticipantId);
  if (!pid) return false;
  var roster = Array.isArray(series && series.roster) ? series.roster : [];
  for (var i = 0; i < roster.length; i++) {
    var e = roster[i];
    if (!e) continue;
    if (asString(e.seriesParticipantId) !== pid) continue;
    if (isActiveRosterEntry(e)) return true;
  }
  return false;
}

function participantKey(p) {
  if (!p) return '';
  var sid = asString(p.seriesParticipantId);
  if (sid) return sid;
  if (asString(p.kind) === 'division') {
    return 'division:' + asString(p.divisionId);
  }
  return 'team:' + asString(p.sourceTeamId);
}

function listParticipantIds(participants) {
  var list = Array.isArray(participants) ? participants : [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var k = participantKey(list[i]);
    if (k) out.push(k);
  }
  return out;
}

/**
 * teamGroups 是否已承载真实分组（有球员），而非参赛主体空壳目录
 */
function teamGroupsHaveRealGrouping(match) {
  var tgs = Array.isArray(match && match.teamGroups) ? match.teamGroups : [];
  for (var i = 0; i < tgs.length; i++) {
    var g = tgs[i];
    if (!g || typeof g !== 'object') continue;
    var buckets = [g.players, g.members, g.roster, g.entries];
    for (var b = 0; b < buckets.length; b++) {
      var arr = buckets[b];
      if (!Array.isArray(arr)) continue;
      for (var j = 0; j < arr.length; j++) {
        var p = arr[j];
        if (p && (asString(p.userId) || asString(p.playerId) || asString(p.openId))) {
          return true;
        }
      }
    }
  }
  return false;
}

function matchHasEntities(match) {
  var ent = match && match.entities;
  if (!ent || typeof ent !== 'object' || Array.isArray(ent)) return false;
  return Object.keys(ent).length > 0;
}

/**
 * 是否存在已开始/结束或分组/成绩结构（任一站）
 */
function stationsBlockStructureEdit(matches) {
  var list = Array.isArray(matches) ? matches : [];
  for (var i = 0; i < list.length; i++) {
    var m = list[i];
    if (!m) continue;
    if (seriesRoundUpdate.isMatchStarted(m)) return true;
    if (seriesRoundUpdate.matchHasScoringStructure(m)) return true;
    if (teamGroupsHaveRealGrouping(m)) return true;
    if (matchHasEntities(m)) return true;
  }
  return false;
}

/**
 * @returns {{ editable: boolean, reason: string, hostModeLocked: boolean, hostModeLockReason: string }}
 */
function resolveParticipantsEditLocks(series, matches) {
  var busy = stationsBlockStructureEdit(matches);
  return {
    editable: !busy,
    reason: busy ? STRUCTURE_BUSY_MSG : '',
    hostModeLocked: true,
    hostModeLockReason: HOST_MODE_LOCKED_MSG
  };
}

function buildHostIdentityPatch(series) {
  var hostMode = asString(series && series.hostMode);
  var org = (series && series.organization) || {};
  var host = (series && series.hostTeam) || {};
  var patch = {
    teamGroups: seriesStationMatch.buildTeamGroupsFromSeries(series)
  };
  if (hostMode === 'organization') {
    var oid = asString(org.organizationId);
    patch.organizationId = oid;
    patch.organizationName = asString(org.organizationName);
    patch.organizationLogo = asString(org.organizationLogo);
    patch.teamId = oid;
    patch.teamName = asString(org.organizationName);
    patch.teamLogo = asString(org.organizationLogo);
  } else {
    patch.teamId = asString(host.teamId);
    patch.teamName = asString(host.teamName);
    patch.teamLogo = asString(host.teamLogo);
  }
  return patch;
}

function applyHostMatchPatchPreservingRuntime(existingMatch, fieldPatch, series) {
  var next = deepClone(existingMatch);
  Object.keys(fieldPatch || {}).forEach(function (k) {
    next[k] = deepClone(fieldPatch[k]);
  });
  var ctx = deepClone(existingMatch.seriesContext || {});
  ctx.seriesParticipantMode = seriesStationMatch.resolveSeriesParticipantMode
    ? seriesStationMatch.resolveSeriesParticipantMode(series)
    : ctx.seriesParticipantMode;
  // 身份字段硬保留
  ctx.managed = existingMatch.seriesContext && existingMatch.seriesContext.managed === true;
  ctx.seriesId = asString(existingMatch.seriesContext && existingMatch.seriesContext.seriesId);
  ctx.roundId = asString(existingMatch.seriesContext && existingMatch.seriesContext.roundId);
  ctx.publishToken = asString(
    existingMatch.seriesContext && existingMatch.seriesContext.publishToken
  );
  ctx.registrationAuthority =
    (existingMatch.seriesContext && existingMatch.seriesContext.registrationAuthority) ||
    'series';
  ctx.seriesNameSnapshot = asString(
    existingMatch.seriesContext && existingMatch.seriesContext.seriesNameSnapshot
  );
  ctx.seriesSubtitleSnapshot = asString(
    existingMatch.seriesContext && existingMatch.seriesContext.seriesSubtitleSnapshot
  );
  next.seriesContext = ctx;

  next.matchId = existingMatch.matchId;
  next.createdBy = existingMatch.createdBy;
  next.creatorId = existingMatch.creatorId;
  next.createdAt = existingMatch.createdAt;
  next.registrationStatus = existingMatch.registrationStatus;
  next.registerInfo = deepClone(existingMatch.registerInfo);
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
  next.gameMode = existingMatch.gameMode;
  next.feeList = deepClone(existingMatch.feeList);
  next.courseId = existingMatch.courseId;
  next.courseName = existingMatch.courseName;
  next.courseLocation = existingMatch.courseLocation;
  next.courseHalfText = existingMatch.courseHalfText;
  next.front9Course = deepClone(existingMatch.front9Course);
  next.back9Course = deepClone(existingMatch.back9Course);
  next.teeTime = existingMatch.teeTime;
  next.teeTimeText = existingMatch.teeTimeText;
  next.scoringRules = deepClone(existingMatch.scoringRules);
  next.roundName = existingMatch.roundName;
  next.eventInfoList = deepClone(existingMatch.eventInfoList);
  next.visibility = existingMatch.visibility;
  next.accessCode = existingMatch.accessCode;
  next.matchType = existingMatch.matchType;
  return next;
}

function validateParticipantsPatch(beforeSeries, nextHostMode, nextOrg, nextHost, nextParts) {
  if (asString(nextHostMode) !== asString(beforeSeries.hostMode)) {
    return { ok: false, reason: 'host_mode_locked', message: HOST_MODE_LOCKED_MSG };
  }
  var hostMode = asString(nextHostMode);
  var parts = Array.isArray(nextParts) ? nextParts : [];
  if (hostMode === 'organization') {
    if (!asString(nextOrg && nextOrg.organizationId)) {
      return { ok: false, reason: 'organization_required' };
    }
    var teamCount = 0;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] && (!parts[i].kind || parts[i].kind === 'team')) teamCount += 1;
    }
    if (teamCount < 2) return { ok: false, reason: 'participants_min' };
  } else if (hostMode === 'team') {
    if (!asString(nextHost && nextHost.teamId)) {
      return { ok: false, reason: 'host_team_required' };
    }
    var divCount = 0;
    for (var j = 0; j < parts.length; j++) {
      if (parts[j] && parts[j].kind === 'division') divCount += 1;
    }
    if (divCount < 2) return { ok: false, reason: 'participants_min' };
  } else {
    return { ok: false, reason: 'host_mode_invalid' };
  }

  // 删除保护：被移除的 participant 不得有 active roster
  var beforeIds = listParticipantIds(beforeSeries.participants);
  var nextIds = listParticipantIds(parts);
  var nextSet = {};
  for (var n = 0; n < nextIds.length; n++) nextSet[nextIds[n]] = true;
  for (var b = 0; b < beforeIds.length; b++) {
    var id = beforeIds[b];
    if (nextSet[id]) continue;
    if (hasActiveRosterForParticipant(beforeSeries, id)) {
      return { ok: false, reason: 'roster_block', message: ROSTER_BLOCK_MSG };
    }
  }

  // 同 sourceTeamId / divisionId 不得冲突生成重复 ID
  var seen = {};
  for (var p = 0; p < parts.length; p++) {
    var key = participantKey(parts[p]);
    if (!key) continue;
    if (seen[key]) {
      return { ok: false, reason: 'participant_id_conflict' };
    }
    seen[key] = true;
  }

  return { ok: true };
}

function createSeriesParticipantsUpdateService(deps) {
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

  function restoreMatches(matchesBefore) {
    var list = Array.isArray(matchesBefore) ? matchesBefore : [];
    for (var i = 0; i < list.length; i++) {
      try {
        teamMatchStore.saveMatch(deepClone(list[i]));
      } catch (e) {
        return { ok: false, reason: 'rollback_match_failed' };
      }
    }
    return { ok: true };
  }

  function recoverInterruptedEdit() {
    var journal = readJournal();
    if (!journal) return { ok: true, reason: 'idle' };
    if (asString(journal.phase) === 'done') {
      clearJournal();
      return { ok: true, reason: 'cleared_done' };
    }
    var seriesRestored = restoreSeries(journal.seriesBefore);
    var matchRestored = restoreMatches(journal.matchesBefore);
    clearJournal();
    return {
      ok: !!(seriesRestored && seriesRestored.ok && matchRestored && matchRestored.ok),
      reason: 'rolled_back'
    };
  }

  function loadManagedStations(series) {
    var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
    var stations = [];
    for (var i = 0; i < rounds.length; i++) {
      var round = rounds[i];
      if (!round) continue;
      var matchId = asString(round.matchId);
      var roundId = asString(round.roundId);
      if (!matchId || !roundId) return { ok: false, reason: 'station_missing' };
      var index = getIndexByMatchId(matchId);
      if (
        !index ||
        asString(index.seriesId) !== asString(series.seriesId) ||
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
        asString(ctx.seriesId) !== asString(series.seriesId) ||
        asString(ctx.roundId) !== roundId ||
        asString(ctx.publishToken) !== asString(series.publishToken)
      ) {
        return { ok: false, reason: 'station_data_invalid' };
      }
      stations.push({ round: round, match: match });
    }
    return { ok: true, stations: stations };
  }

  /**
   * @param {object} input
   * @param {string} input.seriesId
   * @param {object} [input.hostPatch] { organization?, hostTeam? } — hostMode 不可改
   * @param {object[]} [input.participants]
   * @param {object} input.actor
   * @param {string} [input.expectedUpdatedAt]
   */
  function updatePublishedSeriesParticipants(input) {
    var src = input && typeof input === 'object' ? input : {};
    recoverInterruptedEdit();

    var seriesId = asString(src.seriesId);
    if (!seriesId) return { ok: false, reason: 'series_id_required' };

    var series = seriesStore.getSeriesById(seriesId);
    if (!series) return { ok: false, reason: 'series_not_found' };
    if (asString(series.lifecycleStatus) !== 'published') {
      return { ok: false, reason: 'series_not_published' };
    }
    var seriesLock = seriesFinishLock.assertSeriesWritable(series);
    if (!seriesLock.ok) {
      return { ok: false, reason: 'series_completed', message: seriesLock.message };
    }

    var expectedUpdatedAt = asString(src.expectedUpdatedAt);
    if (expectedUpdatedAt && asString(series.updatedAt) !== expectedUpdatedAt) {
      return { ok: false, reason: 'series_conflict' };
    }

    if (!seriesManageAccess.isSeriesHostPrivileged(series, src.actor || {})) {
      return { ok: false, reason: 'permission_denied' };
    }

    var stationsLoad = loadManagedStations(series);
    if (!stationsLoad.ok) return { ok: false, reason: stationsLoad.reason };
    var matches = stationsLoad.stations.map(function (s) {
      return s.match;
    });

    var locks = resolveParticipantsEditLocks(series, matches);
    if (!locks.editable) {
      return { ok: false, reason: 'structure_busy', message: locks.reason || STRUCTURE_BUSY_MSG };
    }

    var hostPatch = src.hostPatch && typeof src.hostPatch === 'object' ? src.hostPatch : {};
    var nextOrg =
      hostPatch.organization != null
        ? deepClone(hostPatch.organization)
        : deepClone(series.organization);
    var nextHost =
      hostPatch.hostTeam != null
        ? deepClone(hostPatch.hostTeam)
        : deepClone(series.hostTeam);
    var nextParts =
      src.participants != null ? deepClone(src.participants) : deepClone(series.participants);
    var nextHostMode = asString(series.hostMode);

    var validated = validateParticipantsPatch(
      series,
      nextHostMode,
      nextOrg,
      nextHost,
      nextParts
    );
    if (!validated.ok) {
      return {
        ok: false,
        reason: validated.reason,
        message: validated.message || ''
      };
    }

    var teamGroups = seriesStationMatch.buildTeamGroupsFromSeries({
      hostMode: nextHostMode,
      participants: nextParts
    });
    if (!teamGroups || teamGroups.length < 2) {
      return { ok: false, reason: 'participants_min' };
    }

    var nextSeries = deepClone(series);
    nextSeries.hostMode = nextHostMode;
    nextSeries.organization = nextOrg;
    nextSeries.hostTeam = nextHost;
    nextSeries.participants = nextParts;
    // 硬冻结
    nextSeries.seriesId = series.seriesId;
    nextSeries.createdBy = series.createdBy;
    nextSeries.publishToken = series.publishToken;
    nextSeries.lifecycleStatus = 'published';
    nextSeries.templateId = series.templateId;
    nextSeries.scoringRule = deepClone(series.scoringRule);
    nextSeries.rounds = deepClone(series.rounds);
    nextSeries.roster = deepClone(series.roster);
    nextSeries.registrationState = series.registrationState;
    nextSeries.registrationRevision = series.registrationRevision;
    nextSeries.seriesName = series.seriesName;
    nextSeries.seriesSubtitle = series.seriesSubtitle;
    nextSeries.visibility = series.visibility;
    nextSeries.accessCode = series.accessCode;
    nextSeries.eventInfoList = deepClone(series.eventInfoList);
    nextSeries.partnerConfig = deepClone(series.partnerConfig);
    nextSeries.bannerImageSnapshot = series.bannerImageSnapshot;
    nextSeries.updatedAt = seriesModel.nowIso
      ? seriesModel.nowIso()
      : new Date().toISOString();

    var hostFieldPatch = buildHostIdentityPatch(nextSeries);
    var matchPatches = [];
    var si;
    for (si = 0; si < stationsLoad.stations.length; si++) {
      var st = stationsLoad.stations[si];
      matchPatches.push({
        matchId: st.match.matchId,
        before: deepClone(st.match),
        nextMatch: applyHostMatchPatchPreservingRuntime(st.match, hostFieldPatch, nextSeries)
      });
    }

    var journal = {
      journalId: 'spe_' + nowFn(),
      phase: 'pending_series',
      seriesId: seriesId,
      seriesBefore: deepClone(series),
      matchesBefore: matchPatches.map(function (p) {
        return p.before;
      }),
      createdAt: nowFn()
    };
    var jw = writeJournal(journal);
    if (!jw || !jw.ok) return { ok: false, reason: 'journal_write_failed' };

    var seriesWrite = seriesStore.upsertSeries(nextSeries);
    if (!seriesWrite || !seriesWrite.ok) {
      clearJournal();
      return {
        ok: false,
        reason: (seriesWrite && seriesWrite.reason) || 'series_write_failed'
      };
    }

    journal.phase = 'pending_matches';
    journal.seriesAfter = deepClone(seriesWrite.series || nextSeries);
    writeJournal(journal);

    for (var mi = 0; mi < matchPatches.length; mi++) {
      try {
        teamMatchStore.saveMatch(matchPatches[mi].nextMatch);
      } catch (eMatch) {
        restoreSeries(journal.seriesBefore);
        restoreMatches(journal.matchesBefore);
        clearJournal();
        return { ok: false, reason: 'match_write_failed' };
      }
      var readback = teamMatchStore.getMatchById(matchPatches[mi].matchId);
      if (!readback) {
        restoreSeries(journal.seriesBefore);
        restoreMatches(journal.matchesBefore);
        clearJournal();
        return { ok: false, reason: 'match_readback_missing' };
      }
      var rbCtx = readback.seriesContext || {};
      if (
        rbCtx.managed !== true ||
        asString(rbCtx.seriesId) !== seriesId ||
        asString(rbCtx.publishToken) !== asString(series.publishToken) ||
        asString(readback.matchId) !== asString(matchPatches[mi].matchId)
      ) {
        restoreSeries(journal.seriesBefore);
        restoreMatches(journal.matchesBefore);
        clearJournal();
        return { ok: false, reason: 'identity_drift' };
      }
    }

    clearJournal();
    return {
      ok: true,
      series: seriesWrite.series || nextSeries,
      syncedMatchCount: matchPatches.length,
      locks: locks
    };
  }

  return {
    JOURNAL_KEY: JOURNAL_KEY,
    STRUCTURE_BUSY_MSG: STRUCTURE_BUSY_MSG,
    ROSTER_BLOCK_MSG: ROSTER_BLOCK_MSG,
    HOST_MODE_LOCKED_MSG: HOST_MODE_LOCKED_MSG,
    resolveParticipantsEditLocks: resolveParticipantsEditLocks,
    hasActiveRosterForParticipant: hasActiveRosterForParticipant,
    updatePublishedSeriesParticipants: updatePublishedSeriesParticipants,
    recoverInterruptedEdit: recoverInterruptedEdit,
    validateParticipantsPatch: validateParticipantsPatch
  };
}

module.exports = {
  JOURNAL_KEY: JOURNAL_KEY,
  STRUCTURE_BUSY_MSG: STRUCTURE_BUSY_MSG,
  ROSTER_BLOCK_MSG: ROSTER_BLOCK_MSG,
  HOST_MODE_LOCKED_MSG: HOST_MODE_LOCKED_MSG,
  resolveParticipantsEditLocks: resolveParticipantsEditLocks,
  hasActiveRosterForParticipant: hasActiveRosterForParticipant,
  stationsBlockStructureEdit: stationsBlockStructureEdit,
  createSeriesParticipantsUpdateService: createSeriesParticipantsUpdateService
};
