/**
 * Series LIVE 换人正向执行器
 * - 只执行 start_station / resume_roster / verify_and_commit
 * - 不实现 rollback，不接 UI
 */

var journalMod = require('./seriesLiveMutationJournal.js');
var recoveryMod = require('./seriesLiveMutationRecovery.js');
var preflightMod = require('./seriesLiveReplacePreflight.js');
var planMod = require('./seriesLiveReplacePlan.js');

var PHASE = journalMod.PHASE;
var MODE = preflightMod.MODE;
var COMBINED = recoveryMod.COMBINED;

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

function isAfterCombined(recovery, requiresRoster) {
  if (!recovery) return false;
  if (requiresRoster) return recovery.combinedState === COMBINED.all_after;
  return recovery.combinedState === COMBINED.station_after || recovery.combinedState === COMBINED.all_after;
}

function stationAfter(recovery) {
  return !!(recovery && recovery.stationState === 'after');
}

function findStationOp(plan) {
  var ops = plan && Array.isArray(plan.operations) ? plan.operations : [];
  for (var i = 0; i < ops.length; i++) {
    if (asString(ops[i] && ops[i].type) === planMod.OP_TYPE.replace_station_seat) return ops[i];
  }
  return null;
}

function incomingFromPlan(plan) {
  var ident = plan && plan.identity ? plan.identity : {};
  var uid = asString(ident.incomingUserId);
  var out = { userId: uid, playerId: uid, id: uid };
  var op = findStationOp(plan);
  if (op && op.incoming && typeof op.incoming === 'object') {
    Object.keys(op.incoming).forEach(function (k) {
      if (op.incoming[k] != null && op.incoming[k] !== '') out[k] = op.incoming[k];
    });
  }
  if (op && op.replacementSeat && op.replacementSeat.currentIdentity) {
    var cur = op.replacementSeat.currentIdentity;
    Object.keys(cur).forEach(function (k) {
      if (out[k] == null || out[k] === '') out[k] = cur[k];
    });
  }
  if (op && Array.isArray(op.groups)) {
    var gid = asString(ident.groupId);
    var pos = Number(ident.position) || 0;
    for (var i = 0; i < op.groups.length; i++) {
      var g = op.groups[i];
      if (asString(g && g.groupId) !== gid) continue;
      var players = Array.isArray(g.players) ? g.players : [];
      for (var j = 0; j < players.length; j++) {
        var p = players[j];
        var pp = Number(p && (p.position != null ? p.position : p.slotIndex)) || 0;
        if (pp !== pos) continue;
        ['displayName', 'avatar', 'gender', 'tPosition', 'tee'].forEach(function (k) {
          if (p[k] != null && p[k] !== '' && (out[k] == null || out[k] === '')) out[k] = p[k];
        });
      }
    }
  }
  return out;
}

function stationIndexOf(journal) {
  return {
    seriesId: asString(journal.seriesId),
    roundId: asString(journal.roundId),
    matchId: asString(journal.matchId)
  };
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
    runPreflight: input.runPreflight || preflightMod.runSeriesLiveReplacePreflight,
    validateCandidate: input.validateCandidate,
    hasManagePermission: input.hasManagePermission,
    currentUser: input.currentUser,
    plan: input.plan
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
      recovery: null,
      requiresRollback: false,
      requiresManualReview: false
    },
    extra || {}
  );
  if (out.recovery) out.recovery = deepClone(out.recovery);
  return out;
}

function patchStationMatch(latestMatch, journal) {
  var after = journal && journal.expectedAfter && journal.expectedAfter.station;
  if (!after || !after.group || asString(after.group.groupId) !== asString(journal.groupId)) {
    return { ok: false, reason: 'expected_after_station_missing' };
  }
  if (after.pairings == null) {
    return { ok: false, reason: 'expected_after_pairings_missing' };
  }
  if (after.scoreEntities == null) {
    return { ok: false, reason: 'expected_after_score_entities_missing' };
  }
  var next = deepClone(latestMatch);
  var gid = asString(journal.groupId);
  var groups = Array.isArray(next.groups) ? next.groups.slice() : [];
  var replaced = false;
  for (var i = 0; i < groups.length; i++) {
    if (asString(groups[i] && groups[i].groupId) === gid) {
      groups[i] = deepClone(after.group);
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
    next.pairings[gid] = deepClone(after.pairings);
  } else if (Array.isArray(next.pairings)) {
    next.pairings = deepClone(after.pairings);
  } else {
    var pairObj = {};
    pairObj[gid] = deepClone(after.pairings);
    next.pairings = pairObj;
  }

  if (next.scoreEntities && typeof next.scoreEntities === 'object' && !Array.isArray(next.scoreEntities)) {
    next.scoreEntities = deepClone(next.scoreEntities);
    next.scoreEntities[gid] = deepClone(after.scoreEntities);
  } else if (Array.isArray(next.scoreEntities)) {
    next.scoreEntities = deepClone(after.scoreEntities);
  } else {
    var entObj = {};
    entObj[gid] = deepClone(after.scoreEntities);
    next.scoreEntities = entObj;
  }
  return { ok: true, match: next };
}

function patchRosterSeries(latestSeries, journal) {
  var before = journal && journal.before && journal.before.roster;
  var after = journal && journal.expectedAfter && journal.expectedAfter.roster;
  if (!before || !after || !asString(after.rosterEntryId)) {
    return { ok: false, reason: 'expected_after_roster_missing' };
  }
  var wantId = asString(after.rosterEntryId);
  var wantPlayer = asString(after.playerId) || asString(before.playerId);
  var fromSp = asString(before.seriesParticipantId);
  var toSp = asString(after.seriesParticipantId);
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
      return { ok: true, alreadyAfter: true, series: deepClone(latestSeries) };
    }
    return { ok: false, reason: 'roster_from_conflict' };
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

function executeSeriesLiveReplace(input) {
  var src = input && typeof input === 'object' ? input : {};
  var deps = resolveDeps(src);
  bindProductionDefaults(deps);
  var plan = src.plan;
  var planKey = asString(src.planKey) || asString(plan && plan.planKey);
  if (!planKey) return finish({ code: 'plan_key_required' });
  if (!plan || typeof plan !== 'object') return finish({ code: 'plan_invalid' });

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

  function preflightOf(journal, series, match) {
    return deps.runPreflight({
      journal: journal,
      plan: plan,
      currentSeries: series,
      currentMatch: match,
      stationIndex: stationIndexOf(journal),
      incomingPlayer: incomingFromPlan(plan),
      validateCandidate: deps.validateCandidate,
      getMatchById: deps.getMatchById,
      hasManagePermission: deps.hasManagePermission,
      user: deps.currentUser
    });
  }

  function readWorld(journal) {
    var series = deps.getSeriesById(journal.seriesId);
    var match = deps.getMatchById(journal.matchId);
    return { series: series, match: match };
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

  function transAfterWrite(from, to, recovery, requiresRoster) {
    var res = trans(from, to);
    if (res && res.ok) return { ok: true, journal: res.journal };
    var loaded = loadJournal();
    var journal = loaded.journal;
    var world = journal ? readWorld(journal) : {};
    var rec = journal ? recoveryOf(journal, world.series, world.match) : recovery;
    if (journal && journal.phase === to) {
      return { ok: true, idempotent: true, journal: journal, recovery: rec };
    }
    if (isAfterCombined(rec, requiresRoster) || (from.indexOf('station') === 0 && stationAfter(rec))) {
      return {
        ok: false,
        afterWrite: true,
        code: 'journal_transition_failed_after_write',
        journal: journal,
        recovery: rec
      };
    }
    var reviewed = journal
      ? trans(journal.phase, PHASE.manual_review, { failure: { reason: 'journal_transition_failed' } })
      : { ok: false };
    return {
      ok: false,
      code: 'journal_transition_failed_after_write',
      requiresManualReview: true,
      journal: reviewed.journal || journal,
      recovery: rec
    };
  }

  function toManual(journal, recovery, code) {
    if (journal && journal.phase !== PHASE.manual_review && journal.phase !== PHASE.committed && journal.phase !== PHASE.rolled_back) {
      trans(journal.phase, PHASE.manual_review, { failure: { reason: code || 'manual_review' }, recovery: recovery });
    }
    var loaded = loadJournal();
    return finish({
      ok: false,
      code: code || 'manual_review',
      mode: MODE.blocked,
      journalPhase: (loaded.journal && loaded.journal.phase) || PHASE.manual_review,
      recovery: recovery,
      requiresManualReview: true
    });
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
      if (isAfterCombined(recovery, requiresRoster)) {
        return finish({
          ok: true,
          idempotent: true,
          mode: MODE.verify_and_commit,
          journalPhase: PHASE.committed,
          recovery: recovery
        });
      }
      return finish({
        ok: false,
        code: recovery.code || 'committed_state_drift',
        journalPhase: PHASE.committed,
        recovery: recovery,
        requiresManualReview: true
      });
    }
    if (journal.phase === PHASE.manual_review) {
      return finish({
        ok: false,
        code: 'journal_manual_review',
        journalPhase: PHASE.manual_review,
        recovery: recovery,
        requiresManualReview: true
      });
    }
    if (
      journal.phase === PHASE.rollback_pending ||
      journal.phase === PHASE.rolling_back ||
      journal.phase === PHASE.rolled_back
    ) {
      return finish({
        ok: false,
        code: 'rollback_required',
        mode: MODE.rollback_required,
        journalPhase: journal.phase,
        recovery: recovery,
        requiresRollback: true
      });
    }

    var pf = preflightOf(journal, world.series, world.match);

    if (journal.phase === PHASE.prepared) {
      if (!pf.readyToExecute || pf.mode !== MODE.start_station) {
        return finish({
          ok: false,
          code: pf.code || 'preflight_rejected',
          mode: pf.mode || MODE.blocked,
          journalPhase: journal.phase,
          recovery: pf.recovery || recovery
        });
      }
      var t0 = trans(PHASE.prepared, PHASE.station_writing);
      if (!t0.ok) {
        return finish({
          ok: false,
          code: t0.reason || 'journal_transition_failed',
          journalPhase: journal.phase,
          recovery: recovery
        });
      }
      continue;
    }

    if (journal.phase === PHASE.station_writing) {
      if (recovery.stationState === 'unknown' || recovery.combinedState === COMBINED.unknown) {
        return toManual(journal, recovery, 'station_write_unknown');
      }
      if (stationAfter(recovery)) {
        var a1 = transAfterWrite(PHASE.station_writing, PHASE.station_written, recovery, requiresRoster);
        if (!a1.ok) {
          return finish({
            ok: false,
            code: a1.code,
            journalPhase: a1.journal && a1.journal.phase,
            recovery: a1.recovery || recovery,
            requiresManualReview: !!a1.requiresManualReview
          });
        }
        continue;
      }
      if (!pf.readyToExecute || pf.mode !== MODE.start_station) {
        return finish({
          ok: false,
          code: pf.code || 'preflight_rejected',
          mode: pf.mode,
          journalPhase: journal.phase,
          recovery: pf.recovery || recovery
        });
      }
      var patched = patchStationMatch(world.match, journal);
      if (!patched.ok) {
        return finish({
          ok: false,
          code: patched.reason,
          journalPhase: journal.phase,
          recovery: recovery
        });
      }
      try {
        deps.saveMatch(patched.match);
      } catch (eSave) {
        var afterErr = readWorld(journal);
        var recErr = recoveryOf(journal, afterErr.series, afterErr.match);
        if (recErr.stationState === 'after') {
          continue;
        }
        if (recErr.stationState === 'unknown' || recErr.combinedState === COMBINED.unknown) {
          return toManual(journal, recErr, 'station_write_unknown');
        }
        return finish({
          ok: false,
          code: 'station_write_failed_before',
          mode: MODE.start_station,
          journalPhase: PHASE.station_writing,
          recovery: recErr,
          requiresRollback: false
        });
      }
      var afterSave = readWorld(journal);
      var recSave = recoveryOf(journal, afterSave.series, afterSave.match);
      if (recSave.stationState !== 'after') {
        if (recSave.stationState === 'unknown' || recSave.combinedState === COMBINED.unknown) {
          return toManual(journal, recSave, 'station_readback_unknown');
        }
        return finish({
          ok: false,
          code: 'station_write_failed_before',
          mode: MODE.start_station,
          journalPhase: PHASE.station_writing,
          recovery: recSave,
          requiresRollback: false
        });
      }
      var a2 = transAfterWrite(PHASE.station_writing, PHASE.station_written, recSave, requiresRoster);
      if (!a2.ok) {
        return finish({
          ok: false,
          code: a2.code,
          journalPhase: a2.journal && a2.journal.phase,
          recovery: a2.recovery || recSave,
          requiresManualReview: !!a2.requiresManualReview
        });
      }
      continue;
    }

    if (journal.phase === PHASE.station_written) {
      if (!stationAfter(recovery)) {
        if (recovery.stationState === 'unknown') return toManual(journal, recovery, 'station_readback_unknown');
        return finish({
          ok: false,
          code: 'station_write_failed_before',
          journalPhase: journal.phase,
          recovery: recovery
        });
      }
      var v1 = transAfterWrite(PHASE.station_written, PHASE.station_verified, recovery, requiresRoster);
      if (!v1.ok) {
        return finish({
          ok: false,
          code: v1.code,
          journalPhase: v1.journal && v1.journal.phase,
          recovery: v1.recovery || recovery,
          requiresManualReview: !!v1.requiresManualReview
        });
      }
      continue;
    }

    if (journal.phase === PHASE.station_verified) {
      if (!requiresRoster) {
        if (!pf.readyToExecute || pf.mode !== MODE.verify_and_commit) {
          return finish({
            ok: false,
            code: pf.code || 'preflight_rejected',
            mode: pf.mode,
            journalPhase: journal.phase,
            recovery: pf.recovery || recovery
          });
        }
        var c0 = trans(PHASE.station_verified, PHASE.committing);
        if (!c0.ok) {
          return finish({
            ok: false,
            code: c0.reason || 'journal_transition_failed',
            journalPhase: journal.phase,
            recovery: recovery
          });
        }
        continue;
      }
      if (recovery.combinedState === COMBINED.all_after) {
        var cSkip = trans(PHASE.station_verified, PHASE.committing);
        if (!cSkip.ok) {
          return finish({
            ok: false,
            code: cSkip.reason || 'journal_transition_failed',
            journalPhase: journal.phase,
            recovery: recovery
          });
        }
        continue;
      }
      if (!pf.readyToExecute || pf.mode !== MODE.resume_roster) {
        return finish({
          ok: false,
          code: pf.code || 'preflight_rejected',
          mode: pf.mode,
          journalPhase: journal.phase,
          recovery: pf.recovery || recovery
        });
      }
      var r0 = trans(PHASE.station_verified, PHASE.roster_writing);
      if (!r0.ok) {
        return finish({
          ok: false,
          code: r0.reason || 'journal_transition_failed',
          journalPhase: journal.phase,
          recovery: recovery
        });
      }
      continue;
    }

    if (journal.phase === PHASE.roster_writing) {
      if (recovery.combinedState === COMBINED.unknown || recovery.rosterState === 'unknown') {
        return toManual(journal, recovery, 'roster_write_unknown');
      }
      if (recovery.combinedState === COMBINED.all_after) {
        var rw = transAfterWrite(PHASE.roster_writing, PHASE.roster_written, recovery, true);
        if (!rw.ok) {
          return finish({
            ok: false,
            code: rw.code,
            journalPhase: rw.journal && rw.journal.phase,
            recovery: rw.recovery || recovery,
            requiresManualReview: !!rw.requiresManualReview
          });
        }
        continue;
      }
      if (!pf.readyToExecute || pf.mode !== MODE.resume_roster) {
        return finish({
          ok: false,
          code: pf.code || 'preflight_rejected',
          mode: pf.mode,
          journalPhase: journal.phase,
          recovery: pf.recovery || recovery
        });
      }
      var rosterPatched = patchRosterSeries(world.series, journal);
      if (!rosterPatched.ok) {
        return finish({
          ok: false,
          code: rosterPatched.reason,
          journalPhase: journal.phase,
          recovery: recovery
        });
      }
      if (!rosterPatched.alreadyAfter) {
        try {
          var up = deps.upsertSeriesChecked(rosterPatched.series, rosterPatched.expectedRevision);
          if (up && up.ok === false) {
            throw new Error(up.reason || 'roster_write_failed');
          }
        } catch (eRoster) {
          var afterR = readWorld(journal);
          var recR = recoveryOf(journal, afterR.series, afterR.match);
          if (recR.combinedState === COMBINED.all_after) {
            continue;
          }
          if (recR.combinedState === COMBINED.station_after_roster_before) {
            trans(PHASE.roster_writing, PHASE.rollback_pending, {
              failure: { reason: 'roster_write_failed_before' }
            });
            var afterPend = loadJournal();
            return finish({
              ok: false,
              code: 'roster_write_failed_before',
              mode: MODE.rollback_required,
              journalPhase: (afterPend.journal && afterPend.journal.phase) || PHASE.rollback_pending,
              recovery: recR,
              requiresRollback: true
            });
          }
          return toManual(journal, recR, 'roster_write_unknown');
        }
      }
      var afterRoster = readWorld(journal);
      var recRoster = recoveryOf(journal, afterRoster.series, afterRoster.match);
      if (recRoster.combinedState !== COMBINED.all_after) {
        if (recRoster.combinedState === COMBINED.station_after_roster_before) {
          trans(PHASE.roster_writing, PHASE.rollback_pending, {
            failure: { reason: 'roster_write_failed_before' }
          });
          var pend2 = loadJournal();
          return finish({
            ok: false,
            code: 'roster_write_failed_before',
            mode: MODE.rollback_required,
            journalPhase: (pend2.journal && pend2.journal.phase) || PHASE.rollback_pending,
            recovery: recRoster,
            requiresRollback: true
          });
        }
        return toManual(journal, recRoster, 'roster_readback_unknown');
      }
      var rw2 = transAfterWrite(PHASE.roster_writing, PHASE.roster_written, recRoster, true);
      if (!rw2.ok) {
        return finish({
          ok: false,
          code: rw2.code,
          journalPhase: rw2.journal && rw2.journal.phase,
          recovery: rw2.recovery || recRoster,
          requiresManualReview: !!rw2.requiresManualReview
        });
      }
      continue;
    }

    if (journal.phase === PHASE.roster_written) {
      if (recovery.combinedState !== COMBINED.all_after) {
        return toManual(journal, recovery, 'roster_readback_unknown');
      }
      var rv = transAfterWrite(PHASE.roster_written, PHASE.roster_verified, recovery, true);
      if (!rv.ok) {
        return finish({
          ok: false,
          code: rv.code,
          journalPhase: rv.journal && rv.journal.phase,
          recovery: rv.recovery || recovery,
          requiresManualReview: !!rv.requiresManualReview
        });
      }
      continue;
    }

    if (journal.phase === PHASE.roster_verified) {
      if (!pf.readyToExecute || pf.mode !== MODE.verify_and_commit) {
        return finish({
          ok: false,
          code: pf.code || 'preflight_rejected',
          mode: pf.mode,
          journalPhase: journal.phase,
          recovery: pf.recovery || recovery
        });
      }
      if (!isAfterCombined(recovery, true)) {
        return toManual(journal, recovery, recovery.code || 'verify_drift');
      }
      var c1 = trans(PHASE.roster_verified, PHASE.committing);
      if (!c1.ok) {
        return finish({
          ok: false,
          code: c1.reason || 'journal_transition_failed',
          journalPhase: journal.phase,
          recovery: recovery
        });
      }
      continue;
    }

    if (journal.phase === PHASE.committing) {
      if (!isAfterCombined(recovery, requiresRoster)) {
        return toManual(journal, recovery, recovery.code || 'committed_state_drift');
      }
      var c2 = trans(PHASE.committing, PHASE.committed);
      if (!c2.ok) {
        var failC = transAfterWrite(PHASE.committing, PHASE.committed, recovery, requiresRoster);
        if (!failC.ok) {
          return finish({
            ok: false,
            code: failC.code || 'journal_transition_failed_after_write',
            journalPhase: failC.journal && failC.journal.phase,
            recovery: failC.recovery || recovery,
            requiresManualReview: true
          });
        }
      }
      var done = loadJournal();
      return finish({
        ok: true,
        mode: MODE.verify_and_commit,
        journalPhase: (done.journal && done.journal.phase) || PHASE.committed,
        recovery: recovery
      });
    }

    return finish({
      ok: false,
      code: 'unsupported_phase',
      journalPhase: journal.phase,
      recovery: recovery
    });
  }

  return finish({ code: 'execute_step_limit' });
}

module.exports = {
  executeSeriesLiveReplace: executeSeriesLiveReplace,
  patchStationMatch: patchStationMatch,
  patchRosterSeries: patchRosterSeries
};
