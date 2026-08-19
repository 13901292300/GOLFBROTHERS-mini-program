/**
 * REG-P3-B1：Series 本人取消领域编排
 * roster 软取消 + 受影响 managed 分站竞赛结构清理 + journal / 回滚
 * 竞赛结构清理只调用 P3-A，不复制 G1–G4 规则。
 */

var seriesRegistration = require('../../../utils/seriesRegistration.js');
var seriesStationManageGate = require('../../../utils/seriesStationManageGate.js');
var seriesStationIndex = require('../../../utils/seriesStationIndex.js');
var p3a = require('./removePlayerFromMatchCompetitionStructure.js');
var seriesRegistrationCancellationGate = require('./seriesRegistrationCancellationGate.js');
var seriesManageAccess = require('../../../utils/seriesManageAccess.js');

var JOURNAL_KEY = 'gb_series_self_cancel_journal_v1';
var KNOWN_PHASES = {
  prepared: true,
  matches_written: true,
  series_written: true
};

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

function findActiveRegisteredEntry(roster, playerId) {
  var pid = asString(playerId);
  if (!pid) return null;
  var list = Array.isArray(roster) ? roster : [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e) continue;
    if (asString(e.playerId) !== pid) continue;
    if (asString(e.registrationStatus) === 'registered') return e;
  }
  return null;
}

function locateProxyTarget(roster, src, actorUserId) {
  var actor = asString(actorUserId);
  if (!actor) return { ok: false, reason: 'not_registered_by_me' };
  var entryId = asString(src && src.rosterEntryId);
  var playerId = asString(src && src.playerId);
  var list = Array.isArray(roster) ? roster : [];
  var found = null;
  var i;
  if (entryId) {
    for (i = 0; i < list.length; i++) {
      if (asString(list[i] && list[i].rosterEntryId) === entryId) {
        found = list[i];
        break;
      }
    }
    if (!found) return { ok: false, reason: 'roster_entry_not_found' };
    if (playerId && asString(found.playerId) !== playerId) {
      return { ok: false, reason: 'player_id_mismatch' };
    }
  } else {
    if (!playerId) return { ok: false, reason: 'player_id_required' };
    found = findActiveRegisteredEntry(list, playerId);
    if (!found) return { ok: false, reason: 'not_registered' };
  }
  if (asString(found.registrationStatus) !== 'registered') {
    return { ok: false, reason: 'not_registered' };
  }
  var targetPid = asString(found.playerId);
  if (!targetPid) return { ok: false, reason: 'player_id_required' };
  if (actor === targetPid) {
    return { ok: false, reason: 'proxy_target_is_self' };
  }
  if (asString(found.registrationSource) !== 'proxy') {
    return { ok: false, reason: 'not_proxy' };
  }
  if (asString(found.registeredByUserId) !== actor) {
    return { ok: false, reason: 'not_registered_by_me' };
  }
  return { ok: true, entry: found, playerId: targetPid, rosterEntryId: asString(found.rosterEntryId) };
}

function locateAdminTarget(roster, src) {
  var entryId = asString(src && src.rosterEntryId);
  var playerId = asString(src && src.playerId);
  var list = Array.isArray(roster) ? roster : [];
  var found = null;
  var i;
  if (entryId) {
    for (i = 0; i < list.length; i++) {
      if (asString(list[i] && list[i].rosterEntryId) === entryId) {
        found = list[i];
        break;
      }
    }
    if (!found) return { ok: false, reason: 'roster_entry_not_found' };
    if (playerId && asString(found.playerId) !== playerId) {
      return { ok: false, reason: 'player_id_mismatch' };
    }
  } else {
    if (!playerId) return { ok: false, reason: 'player_id_required' };
    found = findActiveRegisteredEntry(list, playerId);
    if (!found) return { ok: false, reason: 'not_registered' };
  }
  if (asString(found.registrationStatus) !== 'registered') {
    return { ok: false, reason: 'not_registered' };
  }
  var targetPid = asString(found.playerId);
  if (!targetPid) return { ok: false, reason: 'player_id_required' };
  return {
    ok: true,
    entry: found,
    playerId: targetPid,
    rosterEntryId: asString(found.rosterEntryId)
  };
}

function findCancelledEntry(roster, playerId) {
  var pid = asString(playerId);
  if (!pid) return null;
  var list = Array.isArray(roster) ? roster : [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e) continue;
    if (asString(e.playerId) === pid && asString(e.registrationStatus) === 'cancelled') {
      return e;
    }
  }
  return null;
}

function normalizeRevision(raw) {
  var n = Number(raw);
  if (!Number.isFinite(n) || Math.floor(n) !== n || n < 0) return 0;
  return n;
}

function emptyInspect(extra) {
  return Object.assign(
    {
      ok: false,
      grouped: false,
      affectedStations: [],
      blockedReason: '',
      stationErrors: []
    },
    extra || {}
  );
}

function mapWriteReason(reason) {
  var r = asString(reason);
  if (
    r === 'storage_write_failed' ||
    r === 'journal_write_failed' ||
    r === 'match_write_failed' ||
    r === 'storage_read_failed' ||
    r === 'storage_unavailable'
  ) {
    return 'storage_failed';
  }
  if (
    r === 'self_identity_mismatch' ||
    r === 'player_id_required' ||
    r === 'self_identity_unresolved'
  ) {
    return 'not_self_registered';
  }
  if (
    r === seriesRegistrationCancellationGate.REASON_FINALIZED ||
    r === seriesRegistrationCancellationGate.REASON_STATION
  ) {
    return r;
  }
  return r || 'storage_failed';
}

/**
 * @param {object} [deps]
 * @param {object} [deps.seriesStore]
 * @param {object} [deps.teamMatchStore]
 * @param {object} [deps.storage]
 * @param {function} [deps.getIndexByMatchId]
 * @param {function} [deps.removePlayerFromMatchCompetitionStructure]
 * @param {function} [deps.verifyManagedStation]
 * @param {function} [deps.cancelSelfRegistration]
 * @param {object} [deps.registrationService]
 * @param {function} [deps.now]
 */
function createSeriesSelfCancellationOrchestrator(deps) {
  var d = deps && typeof deps === 'object' ? deps : {};
  var seriesStore = d.seriesStore || require('../../../utils/seriesStore.js');
  var teamMatchStore = d.teamMatchStore || require('../../../utils/teamMatchStore.js');
  var storage = d.storage || createDefaultStorage();
  var getIndexByMatchId =
    typeof d.getIndexByMatchId === 'function'
      ? d.getIndexByMatchId
      : function (id) {
          return seriesStationIndex.getByMatchId(id);
        };
  var removeFromStructure =
    typeof d.removePlayerFromMatchCompetitionStructure === 'function'
      ? d.removePlayerFromMatchCompetitionStructure
      : p3a.removePlayerFromMatchCompetitionStructure;
  var verifyStation =
    typeof d.verifyManagedStation === 'function'
      ? d.verifyManagedStation
      : function (input) {
          return seriesStationManageGate.verifyManagedStationForManage(input);
        };
  var nowFn =
    typeof d.now === 'function'
      ? d.now
      : function () {
          return Date.now();
        };

  var registrationService =
    d.registrationService ||
    seriesRegistration.createSeriesRegistrationService({
      seriesStore: seriesStore,
      resolveEligibleParticipantIds:
        d.resolveEligibleParticipantIds ||
        function () {
          return { ok: true, ids: [] };
        },
      canManageRegistration:
        d.canManageRegistration ||
        function () {
          return { allowed: false };
        },
      canRegisterForOther:
        d.canRegisterForOther ||
        function () {
          return { allowed: false };
        },
      now: nowFn
    });

  var applyProxyPlan =
    typeof d.applyProxyCommitPlan === 'function'
      ? d.applyProxyCommitPlan
      : function (input) {
          return registrationService.applyProxyCommitPlan(input);
        };

  var cancelSelf =
    typeof d.cancelSelfRegistration === 'function'
      ? d.cancelSelfRegistration
      : function (input) {
          return registrationService.cancelSelfRegistration(input);
        };

  function defaultCancelProxyRoster(input) {
    var src = input && typeof input === 'object' ? input : {};
    var loaded = loadSeries(src.seriesId);
    if (!loaded.ok) return loaded;
    var actorUserId = asString(src.actorUserId || (src.actor && (src.actor.userId || src.actor.playerId)));
    var located = locateProxyTarget(loaded.series.roster, src, actorUserId);
    if (!located.ok) return located;
    var currentRevision = normalizeRevision(loaded.series.registrationRevision);
    if (src.expectedRegistrationRevision != null && src.expectedRegistrationRevision !== '') {
      var expN = Number(src.expectedRegistrationRevision);
      if (!Number.isFinite(expN) || Math.floor(expN) !== expN || expN < 0) {
        return { ok: false, reason: 'expected_revision_invalid' };
      }
      if (Math.floor(expN) !== currentRevision) {
        return { ok: false, reason: 'registration_conflict', currentRevision: currentRevision };
      }
    }
    var ts = nowFn();
    var next = deepClone(loaded.series);
    next.roster = (Array.isArray(next.roster) ? next.roster : []).map(function (e) {
      if (asString(e && e.rosterEntryId) !== located.rosterEntryId) return e;
      return Object.assign({}, e, {
        registrationStatus: 'cancelled',
        updatedAt: ts,
        cancelledAt: ts
      });
    });
    next.registrationRevision = currentRevision + 1;
    if (!seriesStore || typeof seriesStore.upsertSeriesChecked !== 'function') {
      return { ok: false, reason: 'storage_failed' };
    }
    try {
      var wrote = seriesStore.upsertSeriesChecked(next, currentRevision);
      if (!wrote || !wrote.ok) {
        return {
          ok: false,
          reason: (wrote && wrote.reason) || 'storage_failed',
          currentRevision: wrote && wrote.currentRevision
        };
      }
      return { ok: true, series: wrote.series };
    } catch (eWrite) {
      return { ok: false, reason: 'storage_failed' };
    }
  }

  var cancelProxyRoster =
    typeof d.cancelProxyRegistration === 'function'
      ? d.cancelProxyRegistration
      : defaultCancelProxyRoster;

  function defaultAdminCancelRoster(input) {
    var src = input && typeof input === 'object' ? input : {};
    var loaded = loadSeries(src.seriesId);
    if (!loaded.ok) return loaded;
    var actorPack = normalizeActor(src);
    if (!actorPack.actorUserId) return { ok: false, reason: 'permission_denied' };
    if (!isHostPrivileged(loaded.series, actorPack.actorUserId)) {
      return { ok: false, reason: 'permission_denied' };
    }
    var located = locateAdminTarget(loaded.series.roster, src);
    if (!located.ok) return located;
    var currentRevision = normalizeRevision(loaded.series.registrationRevision);
    if (src.expectedRegistrationRevision != null && src.expectedRegistrationRevision !== '') {
      var expN = Number(src.expectedRegistrationRevision);
      if (!Number.isFinite(expN) || Math.floor(expN) !== expN || expN < 0) {
        return { ok: false, reason: 'expected_revision_invalid' };
      }
      if (Math.floor(expN) !== currentRevision) {
        return { ok: false, reason: 'registration_conflict', currentRevision: currentRevision };
      }
    }
    var ts = nowFn();
    var next = deepClone(loaded.series);
    next.roster = (Array.isArray(next.roster) ? next.roster : []).map(function (e) {
      if (asString(e && e.rosterEntryId) !== located.rosterEntryId) return e;
      return Object.assign({}, e, {
        registrationStatus: 'cancelled',
        updatedAt: ts,
        cancelledAt: ts
      });
    });
    next.registrationRevision = currentRevision + 1;
    if (!seriesStore || typeof seriesStore.upsertSeriesChecked !== 'function') {
      return { ok: false, reason: 'storage_failed' };
    }
    try {
      var wrote = seriesStore.upsertSeriesChecked(next, currentRevision);
      if (!wrote || !wrote.ok) {
        return {
          ok: false,
          reason: (wrote && wrote.reason) || 'storage_failed',
          currentRevision: wrote && wrote.currentRevision
        };
      }
      return { ok: true, series: wrote.series };
    } catch (eWrite) {
      return { ok: false, reason: 'storage_failed' };
    }
  }

  var cancelAdminRoster =
    typeof d.cancelAdminPlayerRemoval === 'function'
      ? d.cancelAdminPlayerRemoval
      : defaultAdminCancelRoster;

  var resolveCancellationGate =
    typeof d.resolveSeriesRegistrationCancellationGate === 'function'
      ? d.resolveSeriesRegistrationCancellationGate
      : seriesRegistrationCancellationGate.resolveSeriesRegistrationCancellationGate;

  var isHostPrivileged =
    typeof d.isSeriesHostPrivileged === 'function'
      ? d.isSeriesHostPrivileged
      : function (series, actor) {
          return seriesManageAccess.isSeriesHostPrivileged(series, actor);
        };

  function collectStations(series) {
    var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
    var stations = [];
    var i;
    for (i = 0; i < rounds.length; i++) {
      var round = rounds[i];
      if (!round) continue;
      var matchId = asString(round.matchId);
      var match = null;
      try {
        match = matchId && teamMatchStore && typeof teamMatchStore.getMatchById === 'function'
          ? teamMatchStore.getMatchById(matchId)
          : null;
      } catch (e) {
        match = null;
      }
      var index = null;
      try {
        index = matchId ? getIndexByMatchId(matchId) : null;
      } catch (err) {
        index = null;
      }
      stations.push({
        matchId: matchId,
        roundId: asString(round.roundId),
        match: match,
        index: index
      });
    }
    return stations;
  }

  function evaluateCancellationGate(series, playerId) {
    return resolveCancellationGate({
      series: series,
      playerId: playerId,
      stations: collectStations(series)
    });
  }

  function blockFromGate(gateRes) {
    if (!gateRes || gateRes.cancellable) return '';
    var r = asString(gateRes.reason);
    if (r === seriesRegistrationCancellationGate.REASON_FINALIZED) {
      return seriesRegistrationCancellationGate.REASON_FINALIZED;
    }
    return seriesRegistrationCancellationGate.REASON_STATION;
  }

  function resolveGateBlockReason(series, playerId) {
    return blockFromGate(evaluateCancellationGate(series, playerId));
  }

  function isFinalizedMatch(match) {
    var s = asString(match && match.status).toLowerCase();
    return s === 'finished' || s === 'completed';
  }

  function isLiveInProgressMatch(match) {
    var s = asString(match && match.status).toLowerCase();
    return (
      s === 'ongoing' ||
      s === 'live' ||
      s === 'in_progress' ||
      s === 'playing' ||
      s === 'started'
    );
  }

  function memberMatchesPlayer(member, playerId) {
    var pid = asString(playerId);
    if (!pid) return false;
    if (member == null) return false;
    if (typeof member === 'string' || typeof member === 'number') {
      return asString(member) === pid;
    }
    if (typeof member !== 'object') return false;
    return (
      asString(member.userId) === pid ||
      asString(member.playerId) === pid ||
      asString(member.id) === pid
    );
  }

  function prepareLiveMatchForRemoval(match, playerId) {
    var next = deepClone(match);
    var pid = asString(playerId);
    var scoreData = next && next.scoreData;
    if (scoreData && typeof scoreData === 'object' && !Array.isArray(scoreData)) {
      Object.keys(scoreData).forEach(function (key) {
        var bucket = scoreData[key];
        if (!bucket || typeof bucket !== 'object') return;
        var byPlayer = bucket.scoresByPlayer;
        if (byPlayer && typeof byPlayer === 'object' && !Array.isArray(byPlayer)) {
          Object.keys(byPlayer).forEach(function (k) {
            if (asString(k) === pid) delete byPlayer[k];
          });
        }
      });
    }
    var catalog = next && next.scoreEntities;
    if (catalog && typeof catalog === 'object' && !Array.isArray(catalog)) {
      Object.keys(catalog).forEach(function (gid) {
        var list = catalog[gid];
        if (!Array.isArray(list)) return;
        catalog[gid] = list.map(function (entity) {
          if (!entity || !Array.isArray(entity.members)) return entity;
          return Object.assign({}, entity, {
            members: entity.members.filter(function (m) {
              return !memberMatchesPlayer(m, pid);
            })
          });
        });
      });
    }
    return next;
  }

  function removeRespectingLiveScores(match, playerId) {
    var cleaned = removeFromStructure(match, playerId);
    if (!cleaned || asString(cleaned.blockedReason) !== 'player_has_real_score') {
      return cleaned;
    }
    if (isFinalizedMatch(match) || !isLiveInProgressMatch(match)) {
      return cleaned;
    }
    return removeFromStructure(prepareLiveMatchForRemoval(match, playerId), playerId);
  }

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
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    return v;
  }

  function loadSeries(seriesId) {
    var sid = asString(seriesId);
    if (!sid) return { ok: false, reason: 'series_id_required' };
    if (!seriesStore || typeof seriesStore.getSeriesById !== 'function') {
      return { ok: false, reason: 'storage_failed' };
    }
    var series = seriesStore.getSeriesById(sid);
    if (!series) return { ok: false, reason: 'series_not_found' };
    return { ok: true, series: series };
  }

  function writeMatch(match) {
    try {
      var res = teamMatchStore.saveMatch(match);
      if (res && typeof res === 'object' && res.ok === false) {
        return { ok: false, reason: res.reason || 'storage_failed' };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'storage_failed' };
    }
  }

  function restoreSeriesSnapshot(seriesBefore) {
    if (!seriesBefore || !asString(seriesBefore.seriesId)) {
      return { ok: false, reason: 'rollback_series_missing' };
    }
    if (!seriesStore || typeof seriesStore.upsertSeries !== 'function') {
      return { ok: false, reason: 'storage_failed' };
    }
    try {
      var wrote = seriesStore.upsertSeries(deepClone(seriesBefore));
      if (!wrote || !wrote.ok) {
        return { ok: false, reason: (wrote && wrote.reason) || 'storage_failed' };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'storage_failed' };
    }
  }

  function matchIdentityTriple(match) {
    var ctx = (match && match.seriesContext) || {};
    return {
      seriesId: asString(ctx.seriesId),
      roundId: asString(ctx.roundId),
      matchId: asString(match && match.matchId),
      publishToken: asString(ctx.publishToken)
    };
  }

  function identitiesMatch(a, b) {
    return (
      asString(a && a.seriesId) === asString(b && b.seriesId) &&
      asString(a && a.roundId) === asString(b && b.roundId) &&
      asString(a && a.matchId) === asString(b && b.matchId) &&
      asString(a && a.publishToken) === asString(b && b.publishToken)
    );
  }

  function assertSnapshotBelongsToJournal(journal, matchSnap) {
    var jid = asString(journal && journal.seriesId);
    var triple = matchIdentityTriple(matchSnap);
    if (!jid || triple.seriesId !== jid) return false;
    if (triple.matchId && asString(matchSnap.matchId) !== triple.matchId) return false;
    return !!(triple.roundId && triple.matchId && triple.publishToken);
  }

  function restoreMatchSnapshot(journal, matchSnap) {
    if (!assertSnapshotBelongsToJournal(journal, matchSnap)) {
      return { ok: false, reason: 'identity_drift' };
    }
    var mid = asString(matchSnap.matchId);
    var current = null;
    try {
      current = teamMatchStore.getMatchById(mid);
    } catch (e) {
      current = null;
    }
    if (current) {
      var curTriple = matchIdentityTriple(current);
      var snapTriple = matchIdentityTriple(matchSnap);
      if (curTriple.seriesId && curTriple.seriesId !== asString(journal.seriesId)) {
        return { ok: false, reason: 'identity_drift' };
      }
      if (curTriple.matchId && !identitiesMatch(curTriple, snapTriple)) {
        return { ok: false, reason: 'identity_drift' };
      }
    }
    return writeMatch(deepClone(matchSnap));
  }

  function restoreMatches(journal, matchesBefore) {
    var list = Array.isArray(matchesBefore) ? matchesBefore : [];
    var i;
    for (i = 0; i < list.length; i++) {
      var restored = restoreMatchSnapshot(journal, list[i]);
      if (!restored.ok) return restored;
    }
    return { ok: true };
  }

  function verifyRestoredMatches(journal, matchesBefore) {
    var list = Array.isArray(matchesBefore) ? matchesBefore : [];
    var i;
    for (i = 0; i < list.length; i++) {
      var snap = list[i];
      var mid = asString(snap && snap.matchId);
      var current = teamMatchStore.getMatchById(mid);
      if (!current) return { ok: false, reason: 'rollback_verify_failed' };
      if (!identitiesMatch(matchIdentityTriple(current), matchIdentityTriple(snap))) {
        return { ok: false, reason: 'rollback_verify_failed' };
      }
    }
    return { ok: true };
  }

  function verifyRestoredSeries(seriesBefore) {
    if (!seriesBefore) return { ok: false, reason: 'rollback_verify_failed' };
    var current = seriesStore.getSeriesById(asString(seriesBefore.seriesId));
    if (!current) return { ok: false, reason: 'rollback_verify_failed' };
    if (asString(current.seriesId) !== asString(seriesBefore.seriesId)) {
      return { ok: false, reason: 'rollback_verify_failed' };
    }
    if (asString(current.publishToken) !== asString(seriesBefore.publishToken)) {
      return { ok: false, reason: 'rollback_verify_failed' };
    }
    if (normalizeRevision(current.registrationRevision) !== normalizeRevision(seriesBefore.registrationRevision)) {
      return { ok: false, reason: 'rollback_verify_failed' };
    }
    return { ok: true };
  }

  function inspectSelfCancellationImpact(args) {
    var src = args && typeof args === 'object' ? args : {};
    var playerId = asString(src.playerId);
    var actorUserId = asString(src.actorUserId);
    var loaded = loadSeries(src.seriesId);
    if (!loaded.ok) {
      return emptyInspect({ blockedReason: loaded.reason });
    }
    var series = loaded.series;
    if (!playerId || !actorUserId || actorUserId !== playerId) {
      return emptyInspect({ blockedReason: 'not_self_registered' });
    }
    var active = findActiveRegisteredEntry(series.roster, playerId);
    if (!active) {
      return emptyInspect({ blockedReason: 'not_self_registered' });
    }
    return inspectStationImpact(series, playerId);
  }

  function inspectProxyCancellationImpact(args) {
    var src = args && typeof args === 'object' ? args : {};
    var loaded = loadSeries(src.seriesId);
    if (!loaded.ok) {
      return emptyInspect({ blockedReason: loaded.reason });
    }
    var actorUserId = asString(src.actorUserId);
    if (!actorUserId) {
      return emptyInspect({ blockedReason: 'not_registered_by_me' });
    }
    var located = locateProxyTarget(loaded.series.roster, src, actorUserId);
    if (!located.ok) {
      return emptyInspect({ blockedReason: located.reason });
    }
    return inspectStationImpact(loaded.series, located.playerId);
  }

  function inspectAdminPlayerRemovalImpact(args) {
    var src = args && typeof args === 'object' ? args : {};
    var loaded = loadSeries(src.seriesId);
    if (!loaded.ok) {
      return emptyInspect({ blockedReason: loaded.reason });
    }
    var actorPack = normalizeActor(src);
    if (!actorPack.actorUserId) {
      return emptyInspect({ blockedReason: 'permission_denied' });
    }
    if (!isHostPrivileged(loaded.series, actorPack.actorUserId)) {
      return emptyInspect({ blockedReason: 'permission_denied' });
    }
    var located = locateAdminTarget(loaded.series.roster, src);
    if (!located.ok) {
      return emptyInspect({ blockedReason: located.reason });
    }
    return inspectStationImpact(loaded.series, located.playerId);
  }

  function inspectStationImpact(series, playerId) {
    var gateReason = resolveGateBlockReason(series, playerId);
    if (gateReason) {
      return emptyInspect({
        blockedReason: gateReason,
        grouped: gateReason !== seriesRegistrationCancellationGate.REASON_STATION
      });
    }

    var rounds = Array.isArray(series.rounds) ? series.rounds : [];
    var affectedStations = [];
    var stationErrors = [];
    var grouped = false;
    var scoreBlocked = false;
    var i;
    for (i = 0; i < rounds.length; i++) {
      var round = rounds[i];
      if (!round) continue;
      var roundId = asString(round.roundId);
      var gate = verifyStation({
        series: series,
        roundId: roundId,
        getMatchById: function (id) {
          return teamMatchStore.getMatchById(id);
        },
        getIndexByMatchId: getIndexByMatchId
      });
      if (!gate.ok) {
        stationErrors.push({
          roundId: roundId,
          matchId: asString(round.matchId),
          reason: gate.reason || 'managed_station_invalid'
        });
        continue;
      }
      var cleaned = removeRespectingLiveScores(gate.match, playerId);
      var blocked = asString(cleaned && cleaned.blockedReason);
      if (blocked === 'player_has_real_score') {
        scoreBlocked = true;
        grouped = true;
        affectedStations.push({
          roundId: gate.roundId,
          matchId: gate.matchId,
          publishToken: asString(series.publishToken),
          changed: false
        });
        continue;
      }
      if (cleaned && cleaned.changed) {
        grouped = true;
        affectedStations.push({
          roundId: gate.roundId,
          matchId: gate.matchId,
          publishToken: asString(series.publishToken),
          changed: true
        });
      }
    }

    if (stationErrors.length) {
      return {
        ok: false,
        grouped: grouped,
        affectedStations: affectedStations,
        blockedReason: 'managed_station_invalid',
        stationErrors: stationErrors
      };
    }
    if (scoreBlocked) {
      return {
        ok: false,
        grouped: true,
        affectedStations: affectedStations,
        blockedReason: 'player_has_real_score',
        stationErrors: []
      };
    }
    return {
      ok: true,
      grouped: grouped,
      affectedStations: affectedStations,
      blockedReason: '',
      stationErrors: []
    };
  }

  function assertWriteGates(src) {
    var loaded = loadSeries(src.seriesId);
    if (!loaded.ok) return loaded;
    var series = loaded.series;
    if (asString(series.lifecycleStatus) !== 'published') {
      return { ok: false, reason: 'series_not_published' };
    }
    if (asString(series.registrationState) !== 'open') {
      return { ok: false, reason: 'registration_closed' };
    }
    if (asString(series.competitionPhaseCache) === 'completed') {
      return { ok: false, reason: 'series_completed' };
    }
    var currentRevision = normalizeRevision(series.registrationRevision);
    if (src.expectedRegistrationRevision != null && src.expectedRegistrationRevision !== '') {
      var expN = Number(src.expectedRegistrationRevision);
      if (!Number.isFinite(expN) || Math.floor(expN) !== expN || expN < 0) {
        return { ok: false, reason: 'expected_revision_invalid' };
      }
      if (Math.floor(expN) !== currentRevision) {
        return { ok: false, reason: 'registration_conflict', currentRevision: currentRevision };
      }
    }
    var playerId = asString(src.playerId);
    var actorUserId = asString(src.actorUserId);
    if (!playerId || !actorUserId || actorUserId !== playerId) {
      return { ok: false, reason: 'not_self_registered' };
    }
    if (!findActiveRegisteredEntry(series.roster, playerId)) {
      return { ok: false, reason: 'not_self_registered' };
    }
    return {
      ok: true,
      series: series,
      currentRevision: currentRevision,
      playerId: playerId,
      actorUserId: actorUserId
    };
  }

  function assertProxyWriteGates(src) {
    var loaded = loadSeries(src.seriesId);
    if (!loaded.ok) return loaded;
    var series = loaded.series;
    if (asString(series.lifecycleStatus) !== 'published') {
      return { ok: false, reason: 'series_not_published' };
    }
    if (asString(series.registrationState) !== 'open') {
      return { ok: false, reason: 'registration_closed' };
    }
    if (asString(series.competitionPhaseCache) === 'completed') {
      return { ok: false, reason: 'series_completed' };
    }
    var currentRevision = normalizeRevision(series.registrationRevision);
    if (src.expectedRegistrationRevision != null && src.expectedRegistrationRevision !== '') {
      var expN = Number(src.expectedRegistrationRevision);
      if (!Number.isFinite(expN) || Math.floor(expN) !== expN || expN < 0) {
        return { ok: false, reason: 'expected_revision_invalid' };
      }
      if (Math.floor(expN) !== currentRevision) {
        return { ok: false, reason: 'registration_conflict', currentRevision: currentRevision };
      }
    }
    var actorUserId = asString(src.actorUserId);
    if (!actorUserId) return { ok: false, reason: 'not_registered_by_me' };
    var located = locateProxyTarget(series.roster, src, actorUserId);
    if (!located.ok) return located;
    return {
      ok: true,
      series: series,
      currentRevision: currentRevision,
      playerId: located.playerId,
      actorUserId: actorUserId,
      rosterEntryId: located.rosterEntryId
    };
  }

  function assertAdminWriteGates(src) {
    var loaded = loadSeries(src.seriesId);
    if (!loaded.ok) return loaded;
    var series = loaded.series;
    if (asString(series.lifecycleStatus) !== 'published') {
      return { ok: false, reason: 'series_not_published' };
    }
    var currentRevision = normalizeRevision(series.registrationRevision);
    if (src.expectedRegistrationRevision != null && src.expectedRegistrationRevision !== '') {
      var expN = Number(src.expectedRegistrationRevision);
      if (!Number.isFinite(expN) || Math.floor(expN) !== expN || expN < 0) {
        return { ok: false, reason: 'expected_revision_invalid' };
      }
      if (Math.floor(expN) !== currentRevision) {
        return { ok: false, reason: 'registration_conflict', currentRevision: currentRevision };
      }
    }
    var actorPack = normalizeActor(src);
    if (!actorPack.actorUserId) return { ok: false, reason: 'permission_denied' };
    if (!isHostPrivileged(series, actorPack.actorUserId)) {
      return { ok: false, reason: 'permission_denied' };
    }
    var located = locateAdminTarget(series.roster, src);
    if (!located.ok) return located;
    return {
      ok: true,
      series: series,
      currentRevision: currentRevision,
      playerId: located.playerId,
      actorUserId: actorPack.actorUserId,
      rosterEntryId: located.rosterEntryId
    };
  }

  function buildPlan(src) {
    return buildPlanFromInspect(src, inspectSelfCancellationImpact(src));
  }

  function buildPlanFromInspect(src, insp) {
    if (!insp.ok) {
      return {
        ok: false,
        reason: insp.blockedReason || 'inspect_failed',
        inspect: insp
      };
    }
    var loaded = loadSeries(src.seriesId);
    if (!loaded.ok) return loaded;
    var series = loaded.series;
    var matchesBefore = [];
    var matchesAfter = [];
    var affectedRoundIds = [];
    var i;
    for (i = 0; i < insp.affectedStations.length; i++) {
      var st = insp.affectedStations[i];
      if (!st || !st.changed) continue;
      var match = teamMatchStore.getMatchById(st.matchId);
      if (!match) {
        return { ok: false, reason: 'managed_station_invalid' };
      }
      var cleaned = removeRespectingLiveScores(match, src.playerId);
      if (cleaned && cleaned.blockedReason === 'player_has_real_score') {
        return {
          ok: false,
          reason: 'player_has_real_score',
          inspect: insp
        };
      }
      if (!cleaned || !cleaned.changed) continue;
      matchesBefore.push(deepClone(match));
      matchesAfter.push(deepClone(cleaned.match));
      affectedRoundIds.push(st.roundId);
    }
    return {
      ok: true,
      inspect: insp,
      seriesBefore: deepClone(series),
      matchesBefore: matchesBefore,
      matchesAfter: matchesAfter,
      affectedRoundIds: affectedRoundIds,
      grouped: !!insp.grouped
    };
  }

  function verifyAfterWrite(plan, src, expectedRevision) {
    var series = seriesStore.getSeriesById(asString(src.seriesId));
    if (!series) return { ok: false, reason: 'verify_failed' };
    if (findActiveRegisteredEntry(series.roster, src.playerId)) {
      return { ok: false, reason: 'verify_failed' };
    }
    if (!findCancelledEntry(series.roster, src.playerId)) {
      return { ok: false, reason: 'verify_failed' };
    }
    if (normalizeRevision(series.registrationRevision) !== expectedRevision + 1) {
      return { ok: false, reason: 'verify_failed' };
    }
    var i;
    for (i = 0; i < plan.matchesAfter.length; i++) {
      var expected = plan.matchesAfter[i];
      var current = teamMatchStore.getMatchById(asString(expected.matchId));
      if (!current) return { ok: false, reason: 'verify_failed' };
      if (!identitiesMatch(matchIdentityTriple(current), matchIdentityTriple(expected))) {
        return { ok: false, reason: 'verify_failed' };
      }
      if (!identitiesMatch(matchIdentityTriple(current), matchIdentityTriple(plan.matchesBefore[i]))) {
        return { ok: false, reason: 'verify_failed' };
      }
      var leftover = removeRespectingLiveScores(current, src.playerId);
      if (leftover && leftover.changed) return { ok: false, reason: 'verify_failed' };
      if (leftover && leftover.blockedReason === 'player_has_real_score') {
        return { ok: false, reason: 'verify_failed' };
      }
    }
    return { ok: true, series: series };
  }

  function rollback(journal, opts) {
    var o = opts || {};
    var restoreSeriesToo = !!o.restoreSeries;
    var matchIds = o.matchIds;
    var snaps = Array.isArray(journal.matchesBefore) ? journal.matchesBefore : [];
    if (Array.isArray(matchIds)) {
      snaps = snaps.filter(function (m) {
        return matchIds.indexOf(asString(m && m.matchId)) >= 0;
      });
    }
    var matchRes = restoreMatches(journal, snaps);
    if (!matchRes.ok) return { ok: false, reason: 'recovery_required' };
    if (restoreSeriesToo) {
      var seriesRes = restoreSeriesSnapshot(journal.seriesBefore);
      if (!seriesRes.ok) return { ok: false, reason: 'recovery_required' };
      var seriesVerify = verifyRestoredSeries(journal.seriesBefore);
      if (!seriesVerify.ok) return { ok: false, reason: 'recovery_required' };
    }
    var matchVerify = verifyRestoredMatches(journal, snaps);
    if (!matchVerify.ok) return { ok: false, reason: 'recovery_required' };
    var cleared = clearJournal();
    if (!cleared || !cleared.ok) return { ok: false, reason: 'recovery_required' };
    return { ok: true };
  }

  function failAfterRollback(journal, reason, rollbackOpts) {
    var rb = rollback(journal, rollbackOpts || {});
    if (!rb.ok) {
      return { ok: false, reason: 'recovery_required' };
    }
    return { ok: false, reason: mapWriteReason(reason) };
  }

  function recoverInterruptedSelfCancellation() {
    var journal = readJournal();
    if (!journal) return { ok: true, reason: 'idle' };
    var phase = asString(journal.phase);
    if (!KNOWN_PHASES[phase]) {
      return { ok: false, reason: 'journal_phase_unknown' };
    }
    if (!asString(journal.seriesId) || !journal.seriesBefore) {
      return { ok: false, reason: 'journal_corrupt' };
    }
    if (asString(journal.seriesBefore.seriesId) !== asString(journal.seriesId)) {
      return { ok: false, reason: 'identity_drift' };
    }

    if (phase === 'prepared') {
      var prepRestore = restoreMatches(journal, journal.matchesBefore);
      if (!prepRestore.ok) return { ok: false, reason: 'recovery_required' };
      var prepVerify = verifyRestoredMatches(journal, journal.matchesBefore);
      if (!prepVerify.ok) return { ok: false, reason: 'recovery_required' };
      var prepClear = clearJournal();
      if (!prepClear || !prepClear.ok) return { ok: false, reason: 'recovery_required' };
      return { ok: true, reason: 'recovered_prepared' };
    }

    if (phase === 'matches_written') {
      var mRestore = restoreMatches(journal, journal.matchesBefore);
      if (!mRestore.ok) return { ok: false, reason: 'recovery_required' };
      var mVerify = verifyRestoredMatches(journal, journal.matchesBefore);
      if (!mVerify.ok) return { ok: false, reason: 'recovery_required' };
      var mClear = clearJournal();
      if (!mClear || !mClear.ok) return { ok: false, reason: 'recovery_required' };
      return { ok: true, reason: 'recovered_matches' };
    }

    var sRestore = restoreSeriesSnapshot(journal.seriesBefore);
    if (!sRestore.ok) return { ok: false, reason: 'recovery_required' };
    var sMatchRestore = restoreMatches(journal, journal.matchesBefore);
    if (!sMatchRestore.ok) return { ok: false, reason: 'recovery_required' };
    var sVerify = verifyRestoredSeries(journal.seriesBefore);
    if (!sVerify.ok) return { ok: false, reason: 'recovery_required' };
    var sMatchVerify = verifyRestoredMatches(journal, journal.matchesBefore);
    if (!sMatchVerify.ok) return { ok: false, reason: 'recovery_required' };
    var sClear = clearJournal();
    if (!sClear || !sClear.ok) return { ok: false, reason: 'recovery_required' };
    return { ok: true, reason: 'recovered_series' };
  }

  function normalizeActor(src) {
    var actor = src && src.actor && typeof src.actor === 'object' ? src.actor : null;
    var actorUserId = asString(src && src.actorUserId);
    if (!actorUserId && actor) {
      actorUserId = asString(actor.userId || actor.playerId);
    }
    if (!actor && actorUserId) {
      actor = { userId: actorUserId, playerId: actorUserId };
    }
    return { actorUserId: actorUserId, actor: actor || {} };
  }

  function resolveRemovalTargets(roster, removals, actorUserId) {
    var list = Array.isArray(removals) ? removals : [];
    var seenEntry = Object.create(null);
    var seenPlayer = Object.create(null);
    var targets = [];
    var i;
    for (i = 0; i < list.length; i++) {
      var located = locateProxyTarget(roster, list[i] || {}, actorUserId);
      if (!located.ok) return located;
      if (seenEntry[located.rosterEntryId] || seenPlayer[located.playerId]) continue;
      seenEntry[located.rosterEntryId] = true;
      seenPlayer[located.playerId] = true;
      targets.push({
        playerId: located.playerId,
        rosterEntryId: located.rosterEntryId,
        entry: located.entry
      });
    }
    return { ok: true, targets: targets };
  }

  function toApplyProxyInput(src, expectedRevision) {
    var a = normalizeActor(src);
    return {
      seriesId: asString(src.seriesId),
      expectedRegistrationRevision: expectedRevision,
      actor: a.actor,
      actorUserId: a.actorUserId,
      seriesParticipantId: asString(src.seriesParticipantId),
      removals: Array.isArray(src.removals) ? src.removals : [],
      additions: Array.isArray(src.additions) ? src.additions : []
    };
  }

  function previewProxyCommitPlan(src, expectedRevision) {
    if (
      !registrationService ||
      typeof registrationService.previewProxyCommitPlan !== 'function'
    ) {
      return { ok: false, reason: 'storage_failed' };
    }
    return registrationService.previewProxyCommitPlan(
      toApplyProxyInput(src, expectedRevision)
    );
  }

  function assertBatchProxyWriteGates(src) {
    var loaded = loadSeries(src.seriesId);
    if (!loaded.ok) return loaded;
    var series = loaded.series;
    if (asString(series.lifecycleStatus) !== 'published') {
      return { ok: false, reason: 'series_not_published' };
    }
    if (asString(series.registrationState) !== 'open') {
      return { ok: false, reason: 'registration_closed' };
    }
    if (asString(series.competitionPhaseCache) === 'completed') {
      return { ok: false, reason: 'series_completed' };
    }
    var currentRevision = normalizeRevision(series.registrationRevision);
    if (src.expectedRegistrationRevision != null && src.expectedRegistrationRevision !== '') {
      var expN = Number(src.expectedRegistrationRevision);
      if (!Number.isFinite(expN) || Math.floor(expN) !== expN || expN < 0) {
        return { ok: false, reason: 'expected_revision_invalid' };
      }
      if (Math.floor(expN) !== currentRevision) {
        return { ok: false, reason: 'registration_conflict', currentRevision: currentRevision };
      }
    }
    var a = normalizeActor(src);
    if (!a.actorUserId) return { ok: false, reason: 'not_registered_by_me' };
    var located = resolveRemovalTargets(series.roster, src.removals, a.actorUserId);
    if (!located.ok) return located;
    return {
      ok: true,
      series: series,
      currentRevision: currentRevision,
      actorUserId: a.actorUserId,
      actor: a.actor,
      targets: located.targets
    };
  }

  function inspectTargetsStationImpact(series, targets) {
    var i;
    var grouped = false;
    var affectedStations = [];
    var seenMatch = Object.create(null);
    for (i = 0; i < targets.length; i++) {
      var insp = inspectStationImpact(series, targets[i].playerId);
      if (!insp.ok) {
        return {
          ok: false,
          grouped: !!insp.grouped,
          affectedStations: insp.affectedStations || [],
          blockedReason: insp.blockedReason || 'inspect_failed',
          stationErrors: insp.stationErrors || [],
          targets: targets
        };
      }
      if (insp.grouped) grouped = true;
      var j;
      for (j = 0; j < (insp.affectedStations || []).length; j++) {
        var st = insp.affectedStations[j];
        var key = asString(st && st.matchId);
        if (!key || seenMatch[key]) continue;
        seenMatch[key] = true;
        affectedStations.push(st);
      }
    }
    return {
      ok: true,
      grouped: grouped,
      affectedStations: affectedStations,
      blockedReason: '',
      stationErrors: [],
      targets: targets
    };
  }

  function inspectProxyCancellationBatchImpact(args) {
    var src = args && typeof args === 'object' ? args : {};
    var loaded = loadSeries(src.seriesId);
    if (!loaded.ok) return emptyInspect({ blockedReason: loaded.reason });
    var a = normalizeActor(src);
    if (!a.actorUserId) return emptyInspect({ blockedReason: 'not_registered_by_me' });
    var located = resolveRemovalTargets(loaded.series.roster, src.removals, a.actorUserId);
    if (!located.ok) return emptyInspect({ blockedReason: located.reason });
    return inspectTargetsStationImpact(loaded.series, located.targets);
  }

  function buildMergedStationPlan(series, playerIds) {
    var ids = Array.isArray(playerIds) ? playerIds : [];
    var matchesBefore = [];
    var matchesAfter = [];
    var affectedRoundIds = [];
    var grouped = false;
    var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
    var i;
    var p;
    for (i = 0; i < rounds.length; i++) {
      var round = rounds[i];
      if (!round) continue;
      var roundId = asString(round.roundId);
      var gate = verifyStation({
        series: series,
        roundId: roundId,
        getMatchById: function (id) {
          return teamMatchStore.getMatchById(id);
        },
        getIndexByMatchId: getIndexByMatchId
      });
      if (!gate.ok) {
        return { ok: false, reason: 'managed_station_invalid' };
      }
      var before = deepClone(gate.match);
      var working = deepClone(gate.match);
      var changed = false;
      for (p = 0; p < ids.length; p++) {
        var cleaned = removeRespectingLiveScores(working, ids[p]);
        if (cleaned && cleaned.blockedReason === 'player_has_real_score') {
          return { ok: false, reason: 'player_has_real_score' };
        }
        if (cleaned && cleaned.changed && cleaned.match) {
          working = deepClone(cleaned.match);
          changed = true;
        }
      }
      if (!changed) continue;
      grouped = true;
      matchesBefore.push(before);
      matchesAfter.push(working);
      affectedRoundIds.push(gate.roundId || roundId);
    }
    return {
      ok: true,
      matchesBefore: matchesBefore,
      matchesAfter: matchesAfter,
      affectedRoundIds: affectedRoundIds,
      grouped: grouped
    };
  }

  function verifyBatchAfterWrite(plan, src, targets, expectedRevision) {
    var series = seriesStore.getSeriesById(asString(src.seriesId));
    if (!series) return { ok: false, reason: 'verify_failed' };
    if (normalizeRevision(series.registrationRevision) !== expectedRevision + 1) {
      return { ok: false, reason: 'verify_failed' };
    }
    var i;
    for (i = 0; i < targets.length; i++) {
      if (findActiveRegisteredEntry(series.roster, targets[i].playerId)) {
        return { ok: false, reason: 'verify_failed' };
      }
      if (!findCancelledEntry(series.roster, targets[i].playerId)) {
        return { ok: false, reason: 'verify_failed' };
      }
    }
    var additions = Array.isArray(src.additions) ? src.additions : [];
    for (i = 0; i < additions.length; i++) {
      var raw = additions[i] && typeof additions[i] === 'object' ? additions[i] : {};
      var player = raw.player && typeof raw.player === 'object' ? raw.player : raw;
      var addId = asString(player.playerId || player.userId);
      if (!addId) continue;
      if (!findActiveRegisteredEntry(series.roster, addId)) {
        return { ok: false, reason: 'verify_failed' };
      }
    }
    for (i = 0; i < plan.matchesAfter.length; i++) {
      var expected = plan.matchesAfter[i];
      var current = teamMatchStore.getMatchById(asString(expected.matchId));
      if (!current) return { ok: false, reason: 'verify_failed' };
      if (!identitiesMatch(matchIdentityTriple(current), matchIdentityTriple(expected))) {
        return { ok: false, reason: 'verify_failed' };
      }
      if (!identitiesMatch(matchIdentityTriple(current), matchIdentityTriple(plan.matchesBefore[i]))) {
        return { ok: false, reason: 'verify_failed' };
      }
      var t;
      for (t = 0; t < targets.length; t++) {
        var leftover = removeRespectingLiveScores(current, targets[t].playerId);
        if (leftover && leftover.changed) return { ok: false, reason: 'verify_failed' };
        if (leftover && leftover.blockedReason === 'player_has_real_score') {
          return { ok: false, reason: 'verify_failed' };
        }
      }
    }
    return { ok: true, series: series };
  }

  function applyProxyCommitPlanWithStationCleanup(args) {
    var src = args && typeof args === 'object' ? args : {};
    var recovered = recoverExistingJournal();
    if (!recovered.ok) return recovered;

    function precheck() {
      var gates = assertBatchProxyWriteGates(src);
      if (!gates.ok) return gates;
      var i;
      for (i = 0; i < gates.targets.length; i++) {
        var gateReason = resolveGateBlockReason(gates.series, gates.targets[i].playerId);
        if (gateReason) return { ok: false, reason: gateReason };
      }
      var insp = inspectTargetsStationImpact(gates.series, gates.targets);
      if (!insp.ok) return { ok: false, reason: insp.blockedReason || 'inspect_failed' };
      var playerIds = gates.targets.map(function (t) {
        return t.playerId;
      });
      var merged = buildMergedStationPlan(gates.series, playerIds);
      if (!merged.ok) return merged;
      var preview = previewProxyCommitPlan(src, gates.currentRevision);
      if (!preview || !preview.ok) {
        return { ok: false, reason: mapWriteReason(preview && preview.reason) };
      }
      return {
        ok: true,
        gates: gates,
        inspect: insp,
        plan: merged,
        preview: preview
      };
    }

    var first = precheck();
    if (!first.ok) return { ok: false, reason: mapWriteReason(first.reason) };

    var second = precheck();
    if (!second.ok) return { ok: false, reason: mapWriteReason(second.reason) };

    var gates = second.gates;
    var plan = second.plan;
    var preview = second.preview;

    if ((!plan.matchesAfter || !plan.matchesAfter.length) && preview.idempotent) {
      return {
        ok: true,
        idempotent: true,
        grouped: false,
        affectedRoundIds: [],
        registrationRevision: gates.currentRevision,
        addedCount: preview.addedCount || 0,
        removedCount: preview.removedCount || 0
      };
    }

    if (!plan.matchesAfter.length) {
      var rosterOnly = applyProxyPlan(toApplyProxyInput(src, gates.currentRevision));
      if (!rosterOnly || !rosterOnly.ok) {
        return { ok: false, reason: mapWriteReason(rosterOnly && rosterOnly.reason) };
      }
      var afterOnly = seriesStore.getSeriesById(asString(src.seriesId)) || rosterOnly.series;
      return {
        ok: true,
        idempotent: !!rosterOnly.idempotent,
        grouped: false,
        affectedRoundIds: [],
        registrationRevision: normalizeRevision(afterOnly && afterOnly.registrationRevision),
        addedCount: rosterOnly.addedCount || 0,
        removedCount: rosterOnly.removedCount || 0
      };
    }

    var journal = {
      operationId: 'spc_' + nowFn(),
      seriesId: asString(src.seriesId),
      playerId: gates.targets.map(function (t) {
        return t.playerId;
      }).join(','),
      actorUserId: gates.actorUserId,
      expectedRegistrationRevision: gates.currentRevision,
      phase: 'prepared',
      seriesBefore: deepClone(gates.series),
      matchesBefore: plan.matchesBefore,
      affectedRoundIds: plan.affectedRoundIds.slice(),
      createdAt: nowFn()
    };
    var jw = writeJournal(journal);
    if (!jw || !jw.ok) return { ok: false, reason: 'storage_failed' };

    var writtenIds = [];
    var mi;
    for (mi = 0; mi < plan.matchesAfter.length; mi++) {
      var saved = writeMatch(plan.matchesAfter[mi]);
      if (!saved.ok) {
        return failAfterRollback(journal, 'storage_failed', { matchIds: writtenIds });
      }
      writtenIds.push(asString(plan.matchesAfter[mi].matchId));
    }

    journal.phase = 'matches_written';
    var jw2 = writeJournal(journal);
    if (!jw2 || !jw2.ok) {
      return failAfterRollback(journal, 'storage_failed', { matchIds: writtenIds });
    }

    var seriesWrite = applyProxyPlan(toApplyProxyInput(src, gates.currentRevision));
    if (!seriesWrite || !seriesWrite.ok) {
      return failAfterRollback(journal, seriesWrite && seriesWrite.reason, {
        matchIds: writtenIds
      });
    }

    journal.phase = 'series_written';
    var jw3 = writeJournal(journal);
    if (!jw3 || !jw3.ok) {
      return failAfterRollback(journal, 'storage_failed', {
        restoreSeries: true,
        matchIds: writtenIds
      });
    }

    var verified = verifyBatchAfterWrite(plan, src, gates.targets, gates.currentRevision);
    if (!verified.ok) {
      return failAfterRollback(journal, verified.reason, {
        restoreSeries: true,
        matchIds: writtenIds
      });
    }

    var cleared = clearJournal();
    if (!cleared || !cleared.ok) {
      return failAfterRollback(journal, 'storage_failed', {
        restoreSeries: true,
        matchIds: writtenIds
      });
    }

    return {
      ok: true,
      idempotent: false,
      grouped: true,
      affectedRoundIds: plan.affectedRoundIds.slice(),
      registrationRevision: normalizeRevision(verified.series && verified.series.registrationRevision),
      addedCount: seriesWrite.addedCount || 0,
      removedCount: seriesWrite.removedCount || 0
    };
  }

  function recoverExistingJournal() {
    var existing = readJournal();
    if (!existing) return { ok: true };
    var recovered = recoverInterruptedSelfCancellation();
    if (!recovered.ok) return { ok: false, reason: 'recovery_required' };
    return { ok: true };
  }

  function executeCleanupWrite(src, gates, plan, rosterCancelFn) {
    var latest = loadSeries(src.seriesId);
    if (!latest.ok) {
      return { ok: false, reason: mapWriteReason(latest.reason) };
    }
    var writeGateReason = resolveGateBlockReason(latest.series, gates.playerId);
    if (writeGateReason) {
      return { ok: false, reason: writeGateReason };
    }

    var cancelInput = {
      seriesId: asString(src.seriesId),
      playerId: gates.playerId,
      rosterEntryId: asString(gates.rosterEntryId || src.rosterEntryId),
      actorUserId: gates.actorUserId,
      actor: { userId: gates.actorUserId, playerId: gates.actorUserId },
      expectedRegistrationRevision: gates.currentRevision
    };

    if (!plan.matchesAfter.length) {
      var rosterOnly = rosterCancelFn(cancelInput);
      if (!rosterOnly || !rosterOnly.ok) {
        return { ok: false, reason: mapWriteReason(rosterOnly && rosterOnly.reason) };
      }
      var afterOnly = seriesStore.getSeriesById(asString(src.seriesId)) || rosterOnly.series;
      return {
        ok: true,
        grouped: false,
        affectedRoundIds: [],
        registrationRevision: normalizeRevision(afterOnly && afterOnly.registrationRevision)
      };
    }

    var journal = {
      operationId: 'ssc_' + nowFn(),
      seriesId: asString(src.seriesId),
      playerId: gates.playerId,
      actorUserId: gates.actorUserId,
      expectedRegistrationRevision: gates.currentRevision,
      phase: 'prepared',
      seriesBefore: plan.seriesBefore,
      matchesBefore: plan.matchesBefore,
      affectedRoundIds: plan.affectedRoundIds.slice(),
      createdAt: nowFn()
    };
    var jw = writeJournal(journal);
    if (!jw || !jw.ok) {
      return { ok: false, reason: 'storage_failed' };
    }

    var writtenIds = [];
    var mi;
    for (mi = 0; mi < plan.matchesAfter.length; mi++) {
      var saved = writeMatch(plan.matchesAfter[mi]);
      if (!saved.ok) {
        return failAfterRollback(journal, 'storage_failed', { matchIds: writtenIds });
      }
      writtenIds.push(asString(plan.matchesAfter[mi].matchId));
    }

    journal.phase = 'matches_written';
    var jw2 = writeJournal(journal);
    if (!jw2 || !jw2.ok) {
      return failAfterRollback(journal, 'storage_failed', { matchIds: writtenIds });
    }

    var seriesWrite = rosterCancelFn(cancelInput);
    if (!seriesWrite || !seriesWrite.ok) {
      return failAfterRollback(journal, seriesWrite && seriesWrite.reason, {
        matchIds: writtenIds
      });
    }

    journal.phase = 'series_written';
    var jw3 = writeJournal(journal);
    if (!jw3 || !jw3.ok) {
      return failAfterRollback(journal, 'storage_failed', {
        restoreSeries: true,
        matchIds: writtenIds
      });
    }

    var verified = verifyAfterWrite(
      plan,
      { seriesId: src.seriesId, playerId: gates.playerId },
      gates.currentRevision
    );
    if (!verified.ok) {
      return failAfterRollback(journal, verified.reason, {
        restoreSeries: true,
        matchIds: writtenIds
      });
    }

    var cleared = clearJournal();
    if (!cleared || !cleared.ok) {
      return failAfterRollback(journal, 'storage_failed', {
        restoreSeries: true,
        matchIds: writtenIds
      });
    }

    return {
      ok: true,
      grouped: true,
      affectedRoundIds: plan.affectedRoundIds.slice(),
      registrationRevision: normalizeRevision(verified.series && verified.series.registrationRevision)
    };
  }

  function cancelSelfRegistrationWithStationCleanup(args) {
    var src = args && typeof args === 'object' ? args : {};
    var recovered = recoverExistingJournal();
    if (!recovered.ok) return recovered;

    var gates = assertWriteGates(src);
    if (!gates.ok) return { ok: false, reason: mapWriteReason(gates.reason) };

    var plan = buildPlan({
      seriesId: src.seriesId,
      playerId: gates.playerId,
      actorUserId: gates.actorUserId
    });
    if (!plan.ok) {
      return { ok: false, reason: mapWriteReason(plan.reason) };
    }
    return executeCleanupWrite(src, gates, plan, cancelSelf);
  }

  function cancelProxyRegistrationWithStationCleanup(args) {
    var src = args && typeof args === 'object' ? args : {};
    var recovered = recoverExistingJournal();
    if (!recovered.ok) return recovered;

    var gates = assertProxyWriteGates(src);
    if (!gates.ok) return { ok: false, reason: mapWriteReason(gates.reason) };

    var plan = buildPlanFromInspect(
      {
        seriesId: src.seriesId,
        playerId: gates.playerId,
        actorUserId: gates.actorUserId,
        rosterEntryId: gates.rosterEntryId
      },
      inspectProxyCancellationImpact({
        seriesId: src.seriesId,
        playerId: gates.playerId,
        actorUserId: gates.actorUserId,
        rosterEntryId: gates.rosterEntryId
      })
    );
    if (!plan.ok) {
      return { ok: false, reason: mapWriteReason(plan.reason) };
    }

    var again = assertProxyWriteGates(src);
    if (!again.ok) return { ok: false, reason: mapWriteReason(again.reason) };
    return executeCleanupWrite(src, again, plan, cancelProxyRoster);
  }

  function removePlayerByAdminWithStationCleanup(args) {
    var src = args && typeof args === 'object' ? args : {};
    var recovered = recoverExistingJournal();
    if (!recovered.ok) return recovered;

    var gates = assertAdminWriteGates(src);
    if (!gates.ok) return { ok: false, reason: mapWriteReason(gates.reason) };

    var plan = buildPlanFromInspect(
      {
        seriesId: src.seriesId,
        playerId: gates.playerId,
        actorUserId: gates.actorUserId,
        rosterEntryId: gates.rosterEntryId
      },
      inspectAdminPlayerRemovalImpact({
        seriesId: src.seriesId,
        playerId: gates.playerId,
        actorUserId: gates.actorUserId,
        rosterEntryId: gates.rosterEntryId
      })
    );
    if (!plan.ok) {
      return { ok: false, reason: mapWriteReason(plan.reason) };
    }

    var again = assertAdminWriteGates(src);
    if (!again.ok) return { ok: false, reason: mapWriteReason(again.reason) };
    return executeCleanupWrite(src, again, plan, cancelAdminRoster);
  }

  return {
    JOURNAL_KEY: JOURNAL_KEY,
    inspectSelfCancellationImpact: inspectSelfCancellationImpact,
    inspectProxyCancellationImpact: inspectProxyCancellationImpact,
    inspectProxyCancellationBatchImpact: inspectProxyCancellationBatchImpact,
    inspectAdminPlayerRemovalImpact: inspectAdminPlayerRemovalImpact,
    cancelSelfRegistrationWithStationCleanup: cancelSelfRegistrationWithStationCleanup,
    cancelProxyRegistrationWithStationCleanup: cancelProxyRegistrationWithStationCleanup,
    applyProxyCommitPlanWithStationCleanup: applyProxyCommitPlanWithStationCleanup,
    removePlayerByAdminWithStationCleanup: removePlayerByAdminWithStationCleanup,
    recoverInterruptedSelfCancellation: recoverInterruptedSelfCancellation
  };
}

var defaultOrch = null;
function getDefault() {
  if (!defaultOrch) defaultOrch = createSeriesSelfCancellationOrchestrator({});
  return defaultOrch;
}

module.exports = {
  JOURNAL_KEY: JOURNAL_KEY,
  createSeriesSelfCancellationOrchestrator: createSeriesSelfCancellationOrchestrator,
  inspectSelfCancellationImpact: function (args) {
    return getDefault().inspectSelfCancellationImpact(args);
  },
  inspectProxyCancellationImpact: function (args) {
    return getDefault().inspectProxyCancellationImpact(args);
  },
  inspectProxyCancellationBatchImpact: function (args) {
    return getDefault().inspectProxyCancellationBatchImpact(args);
  },
  cancelSelfRegistrationWithStationCleanup: function (args) {
    return getDefault().cancelSelfRegistrationWithStationCleanup(args);
  },
  cancelProxyRegistrationWithStationCleanup: function (args) {
    return getDefault().cancelProxyRegistrationWithStationCleanup(args);
  },
  applyProxyCommitPlanWithStationCleanup: function (args) {
    return getDefault().applyProxyCommitPlanWithStationCleanup(args);
  },
  inspectAdminPlayerRemovalImpact: function (args) {
    return getDefault().inspectAdminPlayerRemovalImpact(args);
  },
  removePlayerByAdminWithStationCleanup: function (args) {
    return getDefault().removePlayerByAdminWithStationCleanup(args);
  },
  recoverInterruptedSelfCancellation: function (args) {
    return getDefault().recoverInterruptedSelfCancellation(args);
  }
};
