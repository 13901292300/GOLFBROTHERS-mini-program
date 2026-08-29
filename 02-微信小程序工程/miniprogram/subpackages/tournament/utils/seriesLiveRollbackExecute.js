/**
 * Series LIVE mutation 回滚执行器
 * - 只执行 rollback preflight 已授权的 rollback_roster_first / rollback_station / finish_rollback_record
 * - 不接 UI，不撤销 committed
 */

var journalMod = require('./seriesLiveMutationJournal.js');
var recoveryMod = require('./seriesLiveMutationRecovery.js');
var preflightMod = require('./seriesLiveRollbackPreflight.js');

var PHASE = journalMod.PHASE;
var MODE = preflightMod.MODE;
var COMBINED = recoveryMod.COMBINED;

var LOCK_CODES = {
  series_locked: true,
  round_cancelled: true,
  match_completed: true,
  group_finished: true,
  permission_denied: true
};

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function deepClone(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

function unwrapJournal(res) {
  if (!res) return { ok: false, reason: 'journal_missing', journal: null };
  if (res.journal) {
    return { ok: res.ok !== false, reason: res.reason, journal: res.journal };
  }
  if (res.ok === false) return { ok: false, reason: res.reason || 'journal_missing', journal: null };
  if (res.planKey && res.phase) return { ok: true, journal: res };
  return { ok: false, reason: 'journal_missing', journal: null };
}

function stationIndexOf(journal) {
  return {
    seriesId: asString(journal.seriesId),
    roundId: asString(journal.roundId),
    matchId: asString(journal.matchId)
  };
}

function isAllBefore(recovery, requiresRoster) {
  if (!recovery) return false;
  if (requiresRoster) return recovery.combinedState === COMBINED.all_before;
  return (
    recovery.combinedState === COMBINED.station_before ||
    recovery.combinedState === COMBINED.all_before
  );
}

function rosterBeforeStationAfter(recovery) {
  return !!(recovery && recovery.combinedState === COMBINED.station_after_roster_before);
}

function resolveDeps(src) {
  var input = src && typeof src === 'object' ? src : {};
  return {
    getMatchById: input.getMatchById,
    saveMatch: input.saveMatch,
    getSeriesById: input.getSeriesById,
    upsertSeriesChecked: input.upsertSeriesChecked,
    getJournal: input.getJournal,
    transitionJournal: input.transitionJournal,
    runRollbackPreflight: input.runRollbackPreflight || preflightMod.runSeriesLiveRollbackPreflight,
    hasManagePermission: input.hasManagePermission,
    currentUser: input.currentUser
  };
}

function bindProductionDefaults(deps) {
  if (typeof deps.getMatchById !== 'function' || typeof deps.saveMatch !== 'function') {
    var teamMatchStore = require('../../../utils/teamMatchStore.js');
    if (typeof deps.getMatchById !== 'function') {
      deps.getMatchById = function (id) {
        return teamMatchStore.getMatchById(id);
      };
    }
    if (typeof deps.saveMatch !== 'function') {
      deps.saveMatch = function (match) {
        return teamMatchStore.saveMatch(match);
      };
    }
  }
  if (typeof deps.getSeriesById !== 'function' || typeof deps.upsertSeriesChecked !== 'function') {
    var seriesStore = require('../../../utils/seriesStore.js');
    if (typeof deps.getSeriesById !== 'function') {
      deps.getSeriesById = function (id) {
        return seriesStore.getSeriesById(id);
      };
    }
    if (typeof deps.upsertSeriesChecked !== 'function') {
      deps.upsertSeriesChecked = function (series, rev) {
        return seriesStore.upsertSeriesChecked(series, rev);
      };
    }
  }
  if (typeof deps.getJournal !== 'function' || typeof deps.transitionJournal !== 'function') {
    if (typeof deps.getJournal !== 'function') {
      deps.getJournal = function (planKey) {
        return journalMod.getJournal(planKey);
      };
    }
    if (typeof deps.transitionJournal !== 'function') {
      deps.transitionJournal = function (planKey, from, to, patch) {
        return journalMod.transitionJournal(planKey, from, to, patch);
      };
    }
  }
}

function finish(extra) {
  var out = Object.assign(
    {
      ok: false,
      code: '',
      mode: '',
      idempotent: false,
      journalPhase: '',
      requiresManualReview: false
    },
    extra || {}
  );
  if (out.recovery) out.recovery = deepClone(out.recovery);
  return out;
}

function patchStationMatchBefore(latestMatch, journal) {
  var before = journal && journal.before && journal.before.station;
  if (!before || !before.group || asString(before.group.groupId) !== asString(journal.groupId)) {
    return { ok: false, reason: 'before_station_missing' };
  }
  if (before.pairings == null) {
    return { ok: false, reason: 'before_pairings_missing' };
  }
  if (before.scoreEntities == null) {
    return { ok: false, reason: 'before_score_entities_missing' };
  }
  var next = deepClone(latestMatch);
  var gid = asString(journal.groupId);
  var groups = Array.isArray(next.groups) ? next.groups.slice() : [];
  var replaced = false;
  for (var i = 0; i < groups.length; i++) {
    if (asString(groups[i] && groups[i].groupId) === gid) {
      groups[i] = deepClone(before.group);
      replaced = true;
    }
  }
  if (!replaced) {
    return { ok: false, reason: 'target_group_missing' };
  }
  next.groups = groups;
  next.matchId = asString(latestMatch.matchId);
  next.seriesContext = deepClone(latestMatch.seriesContext);

  if (next.pairings && typeof next.pairings === 'object' && !Array.isArray(next.pairings)) {
    next.pairings = deepClone(next.pairings);
    next.pairings[gid] = deepClone(before.pairings);
  } else if (Array.isArray(next.pairings)) {
    next.pairings = deepClone(before.pairings);
  } else {
    var pairObj = {};
    pairObj[gid] = deepClone(before.pairings);
    next.pairings = pairObj;
  }

  if (next.scoreEntities && typeof next.scoreEntities === 'object' && !Array.isArray(next.scoreEntities)) {
    next.scoreEntities = deepClone(next.scoreEntities);
    next.scoreEntities[gid] = deepClone(before.scoreEntities);
  } else if (Array.isArray(next.scoreEntities)) {
    next.scoreEntities = deepClone(before.scoreEntities);
  } else {
    var entObj = {};
    entObj[gid] = deepClone(before.scoreEntities);
    next.scoreEntities = entObj;
  }
  return { ok: true, match: next };
}

function patchRosterSeriesBefore(latestSeries, journal) {
  var before = journal && journal.before && journal.before.roster;
  var after = journal && journal.expectedAfter && journal.expectedAfter.roster;
  if (!before || !after || !asString(after.rosterEntryId)) {
    return { ok: false, reason: 'roster_entry_missing' };
  }
  var wantId = asString(after.rosterEntryId);
  var wantPlayer = asString(after.playerId) || asString(before.playerId);
  var fromSp = asString(after.seriesParticipantId);
  var toSp = asString(before.seriesParticipantId);
  var list = Array.isArray(latestSeries.roster) ? latestSeries.roster : [];
  var hits = [];
  for (var i = 0; i < list.length; i++) {
    if (asString(list[i] && list[i].rosterEntryId) === wantId) hits.push(i);
  }
  if (!hits.length) return { ok: false, reason: 'roster_entry_missing' };
  if (hits.length > 1) return { ok: false, reason: 'roster_entry_ambiguous' };
  var idx = hits[0];
  var row = list[idx];
  if (asString(row.playerId) !== wantPlayer) return { ok: false, reason: 'roster_player_conflict' };
  if (asString(row.registrationStatus).toLowerCase() !== 'registered') {
    return { ok: false, reason: 'roster_status_conflict' };
  }
  if (asString(row.seriesParticipantId) !== fromSp) {
    if (asString(row.seriesParticipantId) === toSp) {
      return { ok: true, alreadyBefore: true, series: deepClone(latestSeries) };
    }
    return { ok: false, reason: 'roster_not_expected_after' };
  }
  var next = deepClone(latestSeries);
  var nextRow = deepClone(next.roster[idx]);
  nextRow.seriesParticipantId = toSp;
  next.roster[idx] = nextRow;
  var curRev = Number(next.registrationRevision);
  if (!isFinite(curRev) || curRev < 0) curRev = 0;
  next.registrationRevision = curRev + 1;
  return { ok: true, series: next, expectedRevision: curRev };
}

function executeSeriesLiveRollback(input) {
  var src = input && typeof input === 'object' ? input : {};
  var deps = resolveDeps(src);
  bindProductionDefaults(deps);
  var planKey = asString(src.planKey);
  if (!planKey) return finish({ code: 'plan_key_required' });

  function loadJournal() {
    return unwrapJournal(deps.getJournal(planKey));
  }

  function recoveryOf(journal, series, match) {
    return recoveryMod.inspectSeriesLiveMutationRecovery({
      journal: journal,
      currentSeries: series,
      currentMatch: match
    });
  }

  function readWorld(journal) {
    var series = deps.getSeriesById(journal.seriesId);
    var match = deps.getMatchById(journal.matchId);
    return { series: series, match: match };
  }

  function preflightOf(journal, series, match) {
    return deps.runRollbackPreflight({
      journal: journal,
      currentSeries: series,
      currentMatch: match,
      stationIndex: stationIndexOf(journal),
      getMatchById: deps.getMatchById,
      currentUser: deps.currentUser,
      hasManagePermission: deps.hasManagePermission
    });
  }

  function trans(from, to, patch) {
    var res = deps.transitionJournal(planKey, from, to, patch || {});
    if (res && res.ok) return res;
    var again = loadJournal();
    if (again.ok && again.journal && again.journal.phase === to) {
      return { ok: true, idempotent: true, journal: again.journal };
    }
    if (again.ok && again.journal && again.journal.phase === from) {
      res = deps.transitionJournal(planKey, from, to, patch || {});
      if (res && res.ok) return res;
    }
    return res || { ok: false, reason: 'journal_transition_failed' };
  }

  function toManual(journal, recovery, code) {
    if (
      journal &&
      journal.phase !== PHASE.manual_review &&
      journal.phase !== PHASE.committed &&
      journal.phase !== PHASE.rolled_back
    ) {
      trans(journal.phase, PHASE.manual_review, { failure: { reason: code || 'manual_review' }, recovery: recovery });
    }
    var loaded = loadJournal();
    return finish({
      ok: false,
      code: code || 'manual_review',
      mode: MODE.manual_review,
      journalPhase: (loaded.journal && loaded.journal.phase) || PHASE.manual_review,
      recovery: recovery,
      requiresManualReview: true
    });
  }

  function finishRecord(journal, recovery, requiresRoster) {
    var from = journal.phase;
    if (from === PHASE.rollback_pending) {
      var t0 = trans(PHASE.rollback_pending, PHASE.rolling_back);
      if (!t0.ok) {
        return finish({
          ok: false,
          code: t0.reason || 'journal_transition_failed',
          mode: MODE.finish_rollback_record,
          journalPhase: journal.phase,
          recovery: recovery
        });
      }
      from = PHASE.rolling_back;
    }
    var t1 = trans(from, PHASE.rolled_back);
    if (t1 && t1.ok) {
      return finish({
        ok: true,
        mode: MODE.finish_rollback_record,
        journalPhase: PHASE.rolled_back,
        recovery: recovery
      });
    }
    var loaded = loadJournal();
    var j2 = loaded.journal;
    var world = j2 ? readWorld(j2) : {};
    var rec = j2 ? recoveryOf(j2, world.series, world.match) : recovery;
    if (j2 && j2.phase === PHASE.rolled_back) {
      return finish({
        ok: true,
        idempotent: true,
        mode: MODE.finish_rollback_record,
        journalPhase: PHASE.rolled_back,
        recovery: rec
      });
    }
    if (j2 && isAllBefore(rec, requiresRoster) && j2.phase === PHASE.rolling_back) {
      var t2 = trans(PHASE.rolling_back, PHASE.rolled_back);
      if (t2 && t2.ok) {
        return finish({
          ok: true,
          mode: MODE.finish_rollback_record,
          journalPhase: PHASE.rolled_back,
          recovery: rec
        });
      }
      return finish({
        ok: false,
        code: 'journal_transition_failed_after_rollback',
        mode: MODE.finish_rollback_record,
        journalPhase: (loadJournal().journal && loadJournal().journal.phase) || PHASE.rolling_back,
        recovery: rec,
        requiresManualReview: true
      });
    }
    return toManual(j2 || journal, rec, 'journal_transition_failed_after_rollback');
  }

  var guard = 0;
  while (guard++ < 20) {
    var loaded = loadJournal();
    if (!loaded.ok || !loaded.journal) {
      return finish({ code: loaded.reason || 'journal_missing' });
    }
    var journal = loaded.journal;
    var world = readWorld(journal);
    var recovery = recoveryOf(journal, world.series, world.match);
    var requiresRoster = !!journal.requiresRosterMutation;

    if (journal.phase === PHASE.committed) {
      return finish({
        ok: false,
        code: 'journal_committed',
        mode: MODE.journal_committed,
        journalPhase: PHASE.committed,
        recovery: recovery
      });
    }
    if (journal.phase === PHASE.manual_review) {
      return finish({
        ok: false,
        code: 'journal_manual_review',
        mode: MODE.manual_review,
        journalPhase: PHASE.manual_review,
        recovery: recovery,
        requiresManualReview: true
      });
    }
    if (journal.phase === PHASE.rolled_back) {
      if (isAllBefore(recovery, requiresRoster)) {
        return finish({
          ok: true,
          idempotent: true,
          mode: MODE.idempotent_rolled_back,
          journalPhase: PHASE.rolled_back,
          recovery: recovery
        });
      }
      return toManual(journal, recovery, recovery.code || 'rolled_back_state_drift');
    }

    var pf = preflightOf(journal, world.series, world.match);

    if (pf.mode === MODE.journal_committed || pf.code === 'journal_committed') {
      return finish({
        ok: false,
        code: 'journal_committed',
        mode: MODE.journal_committed,
        journalPhase: journal.phase,
        recovery: pf.recovery || recovery
      });
    }
    if (pf.mode === MODE.idempotent_rolled_back) {
      return finish({
        ok: true,
        idempotent: true,
        mode: MODE.idempotent_rolled_back,
        journalPhase: journal.phase,
        recovery: pf.recovery || recovery
      });
    }
    if (pf.mode === MODE.rollback_not_requested || pf.code === 'rollback_not_requested') {
      return finish({
        ok: false,
        code: 'rollback_not_requested',
        mode: MODE.rollback_not_requested,
        journalPhase: journal.phase,
        recovery: pf.recovery || recovery
      });
    }

    if (!pf.readyToRollback) {
      var failCode = pf.code || 'preflight_rejected';
      if (LOCK_CODES[failCode] || pf.mode === MODE.manual_review) {
        return toManual(journal, pf.recovery || recovery, failCode);
      }
      return finish({
        ok: false,
        code: failCode,
        mode: pf.mode || MODE.manual_review,
        journalPhase: journal.phase,
        recovery: pf.recovery || recovery
      });
    }

    if (
      pf.mode !== MODE.rollback_roster_first &&
      pf.mode !== MODE.rollback_station &&
      pf.mode !== MODE.finish_rollback_record
    ) {
      return toManual(journal, pf.recovery || recovery, pf.code || 'preflight_rejected');
    }

    if (journal.phase === PHASE.rollback_pending) {
      var enter = trans(PHASE.rollback_pending, PHASE.rolling_back);
      if (!enter.ok) {
        return finish({
          ok: false,
          code: enter.reason || 'journal_transition_failed',
          mode: pf.mode,
          journalPhase: journal.phase,
          recovery: pf.recovery || recovery
        });
      }
      continue;
    }

    if (pf.mode === MODE.finish_rollback_record) {
      return finishRecord(journal, pf.recovery || recovery, requiresRoster);
    }

    if (pf.mode === MODE.rollback_roster_first) {
      if (journal.phase !== PHASE.rolling_back && journal.phase !== PHASE.rollback_pending) {
        return finish({
          ok: false,
          code: 'rollback_not_requested',
          journalPhase: journal.phase,
          recovery: pf.recovery || recovery
        });
      }
      var rosterPatched = patchRosterSeriesBefore(world.series, journal);
      if (!rosterPatched.ok) {
        return toManual(journal, pf.recovery || recovery, rosterPatched.reason);
      }
      if (!rosterPatched.alreadyBefore) {
        try {
          var up = deps.upsertSeriesChecked(rosterPatched.series, rosterPatched.expectedRevision);
          if (up && up.ok === false) {
            throw new Error(up.reason || 'roster_rollback_failed');
          }
        } catch (eRoster) {
          var afterR = readWorld(journal);
          var recR = recoveryOf(journal, afterR.series, afterR.match);
          if (recR.combinedState === COMBINED.all_after) {
            return finish({
              ok: false,
              code: 'roster_rollback_failed_after',
              mode: MODE.rollback_roster_first,
              journalPhase: PHASE.rolling_back,
              recovery: recR
            });
          }
          if (rosterBeforeStationAfter(recR)) {
            continue;
          }
          return toManual(journal, recR, 'roster_rollback_unknown');
        }
      }
      var afterRoster = readWorld(journal);
      var recRoster = recoveryOf(journal, afterRoster.series, afterRoster.match);
      if (rosterBeforeStationAfter(recRoster)) {
        continue;
      }
      if (recRoster.combinedState === COMBINED.all_after) {
        return finish({
          ok: false,
          code: 'roster_rollback_failed_after',
          mode: MODE.rollback_roster_first,
          journalPhase: PHASE.rolling_back,
          recovery: recRoster
        });
      }
      return toManual(journal, recRoster, 'roster_rollback_unknown');
    }

    if (pf.mode === MODE.rollback_station) {
      var patched = patchStationMatchBefore(world.match, journal);
      if (!patched.ok) {
        return toManual(journal, pf.recovery || recovery, patched.reason);
      }
      try {
        deps.saveMatch(patched.match);
      } catch (eSave) {
        var afterErr = readWorld(journal);
        var recErr = recoveryOf(journal, afterErr.series, afterErr.match);
        if (recErr.stationState === 'after') {
          return finish({
            ok: false,
            code: 'station_rollback_failed_after',
            mode: MODE.rollback_station,
            journalPhase: PHASE.rolling_back,
            recovery: recErr
          });
        }
        if (isAllBefore(recErr, requiresRoster)) {
          continue;
        }
        return toManual(journal, recErr, 'station_rollback_unknown');
      }
      var afterSave = readWorld(journal);
      var recSave = recoveryOf(journal, afterSave.series, afterSave.match);
      if (isAllBefore(recSave, requiresRoster)) {
        continue;
      }
      if (recSave.stationState === 'after') {
        return finish({
          ok: false,
          code: 'station_rollback_failed_after',
          mode: MODE.rollback_station,
          journalPhase: PHASE.rolling_back,
          recovery: recSave
        });
      }
      return toManual(journal, recSave, 'station_rollback_unknown');
    }
  }

  return finish({ code: 'rollback_loop_exceeded' });
}

module.exports = {
  executeSeriesLiveRollback: executeSeriesLiveRollback
};
