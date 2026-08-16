/**
 * Published Series 展示信息更新编排（E2）
 * - 白名单字段写入 Series
 * - seriesName/seriesSubtitle 变更时批量同步 managed match 派生标题/快照
 * - journal：seriesBefore + matchesBefore[]，失败整批回滚
 * - 不 publish / 不 plan / 不新建分站
 */

var seriesModel = require('./seriesModel.js');
var seriesStationMatch = require('./seriesStationMatch.js');
var seriesStationIndex = require('./seriesStationIndex.js');
var seriesManageAccess = require('./seriesManageAccess.js');
var seriesFinishLock = require('./seriesFinishLock.js');

var JOURNAL_KEY = 'gb_series_info_edit_journal_v1';
var PUBLISHED_STRUCTURE_LOCKED_MSG = '系列赛发布后暂不支持修改此项';

var ALLOWED_PATCH_KEYS = {
  seriesName: true,
  seriesSubtitle: true,
  eventInfoList: true,
  partnerConfig: true,
  bannerImageSnapshot: true,
  visibility: true,
  accessCode: true
};

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function isValidAccessCode(code) {
  return /^\d{6}$/.test(asString(code));
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

function sanitizeInfoPatch(patch) {
  var src = patch && typeof patch === 'object' ? patch : {};
  var out = {};
  var rejected = [];
  Object.keys(src).forEach(function (key) {
    if (!ALLOWED_PATCH_KEYS[key]) {
      rejected.push({ key: key, reason: 'field_not_allowed', message: PUBLISHED_STRUCTURE_LOCKED_MSG });
      return;
    }
    out[key] = src[key];
  });
  return { ok: rejected.length === 0, patch: out, rejected: rejected };
}

function normalizeVisibilityPatch(patch, current) {
  var next = deepClone(patch);
  var hasVis = Object.prototype.hasOwnProperty.call(next, 'visibility');
  var hasCode = Object.prototype.hasOwnProperty.call(next, 'accessCode');
  if (!hasVis && !hasCode) return { ok: true, patch: next };

  var vis = hasVis
    ? next.visibility === 'private'
      ? 'private'
      : 'public'
    : current.visibility === 'private'
      ? 'private'
      : 'public';
  next.visibility = vis;
  if (vis === 'public') {
    next.accessCode = '';
  } else {
    var code = hasCode ? asString(next.accessCode) : asString(current.accessCode);
    if (!isValidAccessCode(code)) {
      return { ok: false, reason: 'access_code_invalid' };
    }
    next.accessCode = code;
  }
  return { ok: true, patch: next };
}

function applyInfoPatch(series, patch) {
  var next = deepClone(series);
  Object.keys(patch || {}).forEach(function (k) {
    next[k] = deepClone(patch[k]);
  });
  if (next.visibility !== 'private') {
    next.visibility = 'public';
    next.accessCode = '';
  }
  next.updatedAt = seriesModel.nowIso ? seriesModel.nowIso() : new Date().toISOString();
  return next;
}

function titleNeedsStationSync(before, after) {
  return (
    asString(before.seriesName) !== asString(after.seriesName) ||
    asString(before.seriesSubtitle) !== asString(after.seriesSubtitle)
  );
}

function buildStationTitlePatch(series, round, match) {
  var roundName = seriesStationMatch.buildStationRoundName(series.seriesName, round.name);
  var ctx = deepClone(match.seriesContext || {});
  ctx.seriesNameSnapshot = asString(series.seriesName);
  ctx.seriesSubtitleSnapshot = asString(series.seriesSubtitle);
  return {
    roundName: roundName,
    seriesContext: ctx
  };
}

function applyMatchTitlePatch(existingMatch, fieldPatch) {
  var next = deepClone(existingMatch);
  next.roundName = fieldPatch.roundName;
  next.seriesContext = deepClone(fieldPatch.seriesContext);
  // 身份与运行态硬保留
  next.matchId = existingMatch.matchId;
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
  next.gameMode = existingMatch.gameMode;
  next.feeList = deepClone(existingMatch.feeList);
  next.courseId = existingMatch.courseId;
  next.courseName = existingMatch.courseName;
  next.teeTime = existingMatch.teeTime;
  next.scoringRules = deepClone(existingMatch.scoringRules);
  next.eventInfoList = deepClone(existingMatch.eventInfoList);
  next.visibility = existingMatch.visibility;
  next.accessCode = existingMatch.accessCode;
  return next;
}

/**
 * @param {object} deps
 * @param {object} deps.seriesStore
 * @param {object} deps.teamMatchStore
 * @param {object} [deps.storage]
 * @param {function} [deps.getIndexByMatchId]
 * @param {function} [deps.now]
 */
function createSeriesInfoUpdateService(deps) {
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
    var i;
    for (i = 0; i < list.length; i++) {
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
    var phase = asString(journal.phase);
    if (phase === 'done') {
      clearJournal();
      return { ok: true, reason: 'cleared_done' };
    }
    var seriesRestored = restoreSeries(journal.seriesBefore);
    var matchRestored = restoreMatches(journal.matchesBefore);
    clearJournal();
    return {
      ok: !!(seriesRestored && seriesRestored.ok && matchRestored && matchRestored.ok),
      reason: 'rolled_back',
      seriesRestored: !!(seriesRestored && seriesRestored.ok),
      matchRestored: !!(matchRestored && matchRestored.ok)
    };
  }

  function loadManagedStations(series) {
    var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
    var stations = [];
    var i;
    for (i = 0; i < rounds.length; i++) {
      var round = rounds[i];
      if (!round) continue;
      var matchId = asString(round.matchId);
      var roundId = asString(round.roundId);
      if (!matchId || !roundId) {
        return { ok: false, reason: 'station_missing' };
      }
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

  function updatePublishedSeriesInfo(input) {
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

    var expectedUpdatedAt = asString(src.expectedUpdatedAt || src.expectedSeriesUpdatedAt);
    if (expectedUpdatedAt && asString(series.updatedAt) !== expectedUpdatedAt) {
      return { ok: false, reason: 'series_conflict' };
    }

    if (!seriesManageAccess.isSeriesHostPrivileged(series, src.actor || {})) {
      return { ok: false, reason: 'permission_denied' };
    }

    var sanitized = sanitizeInfoPatch(src.patch);
    if (!sanitized.ok) {
      return {
        ok: false,
        reason: 'field_not_allowed',
        rejected: sanitized.rejected,
        message: PUBLISHED_STRUCTURE_LOCKED_MSG
      };
    }
    if (!Object.keys(sanitized.patch).length) {
      return { ok: false, reason: 'empty_patch' };
    }

    var visNorm = normalizeVisibilityPatch(sanitized.patch, series);
    if (!visNorm.ok) return { ok: false, reason: visNorm.reason };

    // 名称校验
    if (Object.prototype.hasOwnProperty.call(visNorm.patch, 'seriesName')) {
      var name = asString(visNorm.patch.seriesName);
      if (!name || Array.from(name).length > 40) {
        return { ok: false, reason: 'series_name_invalid' };
      }
      visNorm.patch.seriesName = name;
    }
    if (Object.prototype.hasOwnProperty.call(visNorm.patch, 'seriesSubtitle')) {
      var sub = asString(visNorm.patch.seriesSubtitle).replace(/[\r\n\u2028\u2029]+/g, '');
      if (Array.from(sub).length > 40) {
        return { ok: false, reason: 'series_subtitle_invalid' };
      }
      visNorm.patch.seriesSubtitle = sub;
    }

    var nextSeries = applyInfoPatch(series, visNorm.patch);
    // 硬冻结禁止字段
    nextSeries.seriesId = series.seriesId;
    nextSeries.createdBy = series.createdBy;
    nextSeries.publishToken = series.publishToken;
    nextSeries.lifecycleStatus = 'published';
    nextSeries.hostMode = series.hostMode;
    nextSeries.templateId = series.templateId;
    nextSeries.scoringRule = deepClone(series.scoringRule);
    nextSeries.organization = deepClone(series.organization);
    nextSeries.hostTeam = deepClone(series.hostTeam);
    nextSeries.participants = deepClone(series.participants);
    nextSeries.rounds = deepClone(series.rounds);
    nextSeries.roster = deepClone(series.roster);
    nextSeries.registrationState = series.registrationState;
    nextSeries.registrationRevision = series.registrationRevision;

    var needTitleSync = titleNeedsStationSync(series, nextSeries);
    var stationsLoad = loadManagedStations(series);
    if (!stationsLoad.ok) return { ok: false, reason: stationsLoad.reason };

    var matchPatches = [];
    if (needTitleSync) {
      var si;
      for (si = 0; si < stationsLoad.stations.length; si++) {
        var st = stationsLoad.stations[si];
        var fieldPatch = buildStationTitlePatch(nextSeries, st.round, st.match);
        matchPatches.push({
          matchId: st.match.matchId,
          nextMatch: applyMatchTitlePatch(st.match, fieldPatch),
          before: deepClone(st.match)
        });
      }
    }

    var matchesBefore = matchPatches.map(function (p) {
      return p.before;
    });
    var journal = {
      journalId: 'sie_' + nowFn(),
      phase: 'pending_series',
      seriesId: seriesId,
      seriesBefore: deepClone(series),
      matchesBefore: matchesBefore,
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

    var mi;
    for (mi = 0; mi < matchPatches.length; mi++) {
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
      syncedMatchCount: matchPatches.length
    };
  }

  return {
    JOURNAL_KEY: JOURNAL_KEY,
    PUBLISHED_STRUCTURE_LOCKED_MSG: PUBLISHED_STRUCTURE_LOCKED_MSG,
    ALLOWED_PATCH_KEYS: ALLOWED_PATCH_KEYS,
    updatePublishedSeriesInfo: updatePublishedSeriesInfo,
    recoverInterruptedEdit: recoverInterruptedEdit,
    sanitizeInfoPatch: sanitizeInfoPatch
  };
}

module.exports = {
  JOURNAL_KEY: JOURNAL_KEY,
  PUBLISHED_STRUCTURE_LOCKED_MSG: PUBLISHED_STRUCTURE_LOCKED_MSG,
  ALLOWED_PATCH_KEYS: ALLOWED_PATCH_KEYS,
  createSeriesInfoUpdateService: createSeriesInfoUpdateService
};
