/**
 * Series LIVE 原子批量替换
 * write-ahead journal：prepared → persistMatch → match_written → series_written → committed
 * 崩溃恢复走 recoverIncompleteLiveBatchMutations（现有 LIVE recovery 入口调用）
 */

var classifierMod = require('./seriesLiveSingleReplaceClassifier.js');
var journalMod = require('./seriesLiveMutationJournal.js');
var seriesStationMatch = require('../../../utils/seriesStationMatch.js');

var MUTATION_KIND = 'batch';
var PHASE = journalMod.PHASE;

var RESOLUTION_LATEST_PERSISTED_STATE_WINS = 'latest_persisted_state_wins';

var INCOMPLETE_PHASE = {};
INCOMPLETE_PHASE[PHASE.prepared] = true;
INCOMPLETE_PHASE[PHASE.match_written] = true;
INCOMPLETE_PHASE[PHASE.series_written] = true;
INCOMPLETE_PHASE[PHASE.rollback_failed] = true;

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function deepClone(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

function sanitizeSnapshot(value) {
  return canonicalizePersistSnapshot(value);
}

function playerIdOf(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
  return asString(raw.userId) || asString(raw.playerId) || asString(raw.id);
}

function fingerprintOf(value) {
  return seriesStationMatch.fingerprintOf(value);
}

var SERIES_RUNTIME_CACHE_KEYS = {
  competitionPhaseCache: true
};

function isRuntimeCacheKey(key) {
  var k = asString(key);
  if (!k) return true;
  if (k.charAt(0) === '_') return true;
  if (SERIES_RUNTIME_CACHE_KEYS[k]) return true;
  return false;
}

function stripRuntimeCache(value) {
  if (value == null) return null;
  if (typeof value === 'function') return undefined;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    var arr = [];
    for (var i = 0; i < value.length; i++) {
      var item = stripRuntimeCache(value[i]);
      if (item !== undefined) arr.push(item);
    }
    return arr;
  }
  var out = {};
  Object.keys(value).forEach(function (k) {
    if (isRuntimeCacheKey(k)) return;
    var next = stripRuntimeCache(value[k]);
    if (next !== undefined) out[k] = next;
  });
  return out;
}

function canonicalizePersistSnapshot(value) {
  if (value == null) return null;
  var cloned = JSON.parse(JSON.stringify(value));
  return stripRuntimeCache(cloned);
}

function persistWriteSetFingerprint(value) {
  return fingerprintOf(canonicalizePersistSnapshot(value));
}

function matchRevisionFingerprint(match) {
  return persistWriteSetFingerprint(match);
}

function seriesRevisionFingerprint(series) {
  return persistWriteSetFingerprint(series);
}

function estimatePersistSnapshotBytes(match, series) {
  try {
    return JSON.stringify({
      matchSnapshot: canonicalizePersistSnapshot(match),
      seriesSnapshot: canonicalizePersistSnapshot(series)
    }).length;
  } catch (e) {
    return -1;
  }
}

function isRegisteredRosterStatus(status) {
  var st = asString(status).toLowerCase();
  return !st || st === 'registered';
}

function findRosterRow(series, playerId) {
  var uid = asString(playerId);
  if (!uid) return null;
  var roster = Array.isArray(series && series.roster) ? series.roster : [];
  var hits = [];
  for (var i = 0; i < roster.length; i++) {
    var row = roster[i];
    var pid = playerIdOf(row);
    if (pid === uid && isRegisteredRosterStatus(row && row.registrationStatus)) hits.push(row);
  }
  if (hits.length === 1) return hits[0];
  return null;
}

function findSeatOfPlayer(groups, playerId) {
  var uid = asString(playerId);
  var list = Array.isArray(groups) ? groups : [];
  for (var i = 0; i < list.length; i++) {
    var g = list[i];
    var players = Array.isArray(g && g.players) ? g.players : [];
    for (var j = 0; j < players.length; j++) {
      if (playerIdOf(players[j]) === uid) {
        return { group: g, player: players[j] };
      }
    }
  }
  return null;
}

function buildBatchId(stationIndex, classification) {
  var idx = stationIndex && typeof stationIndex === 'object' ? stationIndex : {};
  return [
    'live-batch',
    asString(idx.seriesId),
    asString(idx.roundId),
    asString(idx.matchId),
    fingerprintOf({
      outgoing: (classification && classification.outgoingUserIds) || [],
      incoming: (classification && classification.incomingUserIds) || [],
      replacements: (classification && classification.replacements) || [],
      fills: (classification && classification.fills) || [],
      clears: (classification && classification.clears) || [],
      moves: (classification && classification.moves) || [],
      swaps: (classification && classification.swaps) || []
    })
  ].join(':');
}

function buildBatchPlan(input) {
  var src = input && typeof input === 'object' ? input : {};
  var classification = src.classification || {};
  var beforeMatch = src.beforeMatch;
  var candidateMatch = src.candidateMatch;
  var series = src.series;
  var stationIndex = src.stationIndex && typeof src.stationIndex === 'object' ? src.stationIndex : {};
  var batchId = buildBatchId(stationIndex, classification);
  var replacements = Array.isArray(classification.replacements) ? classification.replacements.slice() : [];
  var rearrangements = Array.isArray(classification.rearrangements) ? classification.rearrangements.slice() : [];
  var fills = Array.isArray(classification.fills) ? classification.fills.slice() : [];
  var clears = Array.isArray(classification.clears) ? classification.clears.slice() : [];
  var moves = Array.isArray(classification.moves) ? classification.moves.slice() : [];
  var swaps = Array.isArray(classification.swaps) ? classification.swaps.slice() : [];
  var rosterAffiliationChanges = [];
  var incoming = Array.isArray(classification.incomingUserIds) ? classification.incomingUserIds : [];
  incoming.forEach(function (id) {
    var row = findRosterRow(series, id);
    var hit = findSeatOfPlayer(candidateMatch && candidateMatch.groups, id);
    var seatPart = asString(hit && hit.player && hit.player.seriesParticipantId);
    var rosterPart = asString(row && row.seriesParticipantId);
    if (row && seatPart && rosterPart && seatPart !== rosterPart) {
      rosterAffiliationChanges.push({
        playerId: id,
        rosterEntryId: asString(row.rosterEntryId),
        fromSeriesParticipantId: rosterPart,
        toSeriesParticipantId: seatPart
      });
    }
  });
  return {
    ok: true,
    mutationKind: MUTATION_KIND,
    batchId: batchId,
    planKey: batchId,
    kind: classification.kind || classifierMod.KIND.batch_replacement,
    replacementCount: Number(classification.replacementCount) || replacements.length,
    replacements: replacements,
    rearrangements: rearrangements,
    fills: fills,
    clears: clears,
    moves: moves,
    swaps: swaps,
    rosterAffiliationChanges: rosterAffiliationChanges,
    identity: {
      seriesId: asString(stationIndex.seriesId) || asString(series && series.seriesId),
      roundId: asString(stationIndex.roundId),
      matchId: asString(stationIndex.matchId) || asString(beforeMatch && beforeMatch.matchId),
      publishToken: asString(stationIndex.publishToken) || asString(series && series.publishToken)
    },
    matchRevision: matchRevisionFingerprint(beforeMatch),
    registrationRevision: series && series.registrationRevision,
    beforeMatch: beforeMatch,
    candidateMatch: candidateMatch
  };
}

function collectOccupiedPlayerIds(match) {
  var ids = [];
  var groups = Array.isArray(match && match.groups) ? match.groups : [];
  for (var i = 0; i < groups.length; i++) {
    var players = Array.isArray(groups[i] && groups[i].players) ? groups[i].players : [];
    for (var j = 0; j < players.length; j++) {
      var id = playerIdOf(players[j]);
      if (id) ids.push(id);
    }
  }
  return ids;
}

function preflightIncoming(series, candidateMatch, incomingIds) {
  var ids = Array.isArray(incomingIds) ? incomingIds : [];
  for (var i = 0; i < ids.length; i++) {
    var id = asString(ids[i]);
    if (!id) continue;
    var row = findRosterRow(series, id);
    if (!row) {
      return { ok: false, code: 'player_not_on_roster', playerId: id };
    }
  }
  return { ok: true };
}

function preflightNewlyBound(series, beforeMatch, candidateMatch) {
  var beforeSet = Object.create(null);
  collectOccupiedPlayerIds(beforeMatch).forEach(function (id) {
    beforeSet[id] = true;
  });
  var incoming = collectOccupiedPlayerIds(candidateMatch).filter(function (id) {
    return !beforeSet[id];
  });
  return preflightIncoming(series, candidateMatch, incoming);
}

function applyRosterChanges(series, changes) {
  if (!changes || !changes.length) return { ok: true, series: series, changed: false };
  var next = deepClone(series);
  var roster = Array.isArray(next.roster) ? next.roster : [];
  for (var i = 0; i < changes.length; i++) {
    var ch = changes[i];
    var found = false;
    for (var j = 0; j < roster.length; j++) {
      if (asString(roster[j] && roster[j].rosterEntryId) !== asString(ch.rosterEntryId)) continue;
      roster[j] = Object.assign({}, roster[j], {
        seriesParticipantId: asString(ch.toSeriesParticipantId)
      });
      found = true;
      break;
    }
    if (!found) return { ok: false, code: 'player_not_on_roster' };
  }
  next.roster = roster;
  return { ok: true, series: next, changed: true };
}

function restoreSnapshot(deps, beforeMatch, beforeSeries) {
  var matchOk = true;
  var seriesOk = true;
  if (typeof deps.persistMatch === 'function' && beforeMatch) {
    try {
      var m = deps.persistMatch(beforeMatch, beforeMatch);
      if (m && m.ok === false) matchOk = false;
    } catch (eM) {
      matchOk = false;
    }
  }
  if (typeof deps.persistSeries === 'function' && beforeSeries) {
    try {
      var s = deps.persistSeries(beforeSeries, beforeSeries.registrationRevision);
      if (s && s.ok === false) seriesOk = false;
    } catch (eS) {
      seriesOk = false;
    }
  }
  return matchOk && seriesOk;
}

function verifyRestored(deps, beforeMatch, beforeSeries) {
  if (beforeMatch && typeof deps.getMatchById === 'function') {
    var live = deps.getMatchById(asString(beforeMatch.matchId));
    if (matchRevisionFingerprint(live) !== matchRevisionFingerprint(beforeMatch)) return false;
  }
  if (beforeSeries && typeof deps.getSeriesById === 'function') {
    var liveS = deps.getSeriesById(asString(beforeSeries.seriesId));
    if (seriesRevisionFingerprint(liveS) !== seriesRevisionFingerprint(beforeSeries)) return false;
  }
  return true;
}

function fingerprintIn(liveFp, a, b) {
  if (liveFp === a) return true;
  if (b && liveFp === b) return true;
  return false;
}

function detectRecoveryConflict(deps, journal) {
  var before = (journal && journal.before) || {};
  var expected = (journal && journal.expectedAfter) || {};
  var matchId = asString(journal.matchId) || asString(before.matchSnapshot && before.matchSnapshot.matchId);
  if (typeof deps.getMatchById === 'function' && matchId) {
    var liveM = deps.getMatchById(matchId);
    if (liveM) {
      var liveFp = persistWriteSetFingerprint(liveM);
      var beforeFp = persistWriteSetFingerprint(before.matchSnapshot);
      var afterFp = expected.matchSnapshot ? persistWriteSetFingerprint(expected.matchSnapshot) : '';
      if (!fingerprintIn(liveFp, beforeFp, afterFp)) {
        return { conflict: true, code: 'recovery_conflict', entity: 'match' };
      }
    }
  }
  var seriesId = asString(journal.seriesId) || asString(before.seriesSnapshot && before.seriesSnapshot.seriesId);
  if (typeof deps.getSeriesById === 'function' && seriesId && before.seriesSnapshot) {
    var liveS = deps.getSeriesById(seriesId);
    if (liveS) {
      var liveSfp = persistWriteSetFingerprint(liveS);
      var beforeSfp = persistWriteSetFingerprint(before.seriesSnapshot);
      var afterSfp = expected.seriesSnapshot
        ? persistWriteSetFingerprint(expected.seriesSnapshot)
        : beforeSfp;
      if (!fingerprintIn(liveSfp, beforeSfp, afterSfp)) {
        return { conflict: true, code: 'recovery_conflict', entity: 'series' };
      }
    }
  }
  return { conflict: false };
}

function markBatchPhase(journalApi, planKey, expectedPhase, nextPhase, patch) {
  var api = journalApi || journalMod;
  if (typeof api.transitionJournal === 'function') {
    return api.transitionJournal(planKey, expectedPhase, nextPhase, patch || null);
  }
  return journalMod.transitionJournal(planKey, expectedPhase, nextPhase, patch || null);
}

function markBatchOutcome(deps, journal, nextPhase, patch) {
  var planKey = asString(journal && journal.planKey);
  var api = deps.journalApi || journalMod;
  var loaded = typeof api.getJournal === 'function' ? api.getJournal(planKey) : journalMod.getJournal(planKey);
  var current = loaded && loaded.journal ? loaded.journal : journal;
  var from = asString(current && current.phase);
  var stepped = markBatchPhase(api, planKey, from, nextPhase, patch);
  if (stepped && stepped.ok) return stepped;
  if (nextPhase === PHASE.rolled_back || nextPhase === PHASE.recovered) {
    if (typeof api.markBatchRolledBack === 'function') {
      return api.markBatchRolledBack(planKey, nextPhase);
    }
    return journalMod.markBatchRolledBack(planKey, nextPhase);
  }
  return stepped;
}

function cannotSafelyPersist(reason) {
  var code = asString(reason) || 'journal_write_failed';
  if (
    code === 'journal_too_large' ||
    code === 'journal_serialize_failed' ||
    code === 'journal_write_failed'
  ) {
    return { ok: false, status: 'failed_before_write', code: code, cannotSafelyPersist: true };
  }
  return { ok: false, status: 'failed_before_write', code: code };
}

function finishRollback(deps, journal, restored, reason) {
  var before = (journal && journal.before) || {};
  var verified = restored && verifyRestored(deps, before.matchSnapshot, before.seriesSnapshot);
  var patch = {
    recovery: { reason: asString(reason) || 'crash_recovery' }
  };
  if (!restored || !verified) {
    var failed = markBatchOutcome(deps, journal, PHASE.rollback_failed, {
      recovery: { reason: asString(reason) || 'crash_recovery' },
      failure: { code: 'rollback_failed' }
    });
    return {
      ok: false,
      status: 'rollback_failed',
      code: 'rollback_failed',
      journal: failed && failed.journal,
      cannotDisguiseSuccess: true
    };
  }
  var nextPhase = asString(reason) === 'crash_recovery' ? PHASE.recovered : PHASE.rolled_back;
  var marked = markBatchOutcome(deps, journal, nextPhase, patch);
  if (!marked || marked.ok !== true) {
    markBatchOutcome(deps, journal, PHASE.rollback_failed, {
      recovery: patch.recovery,
      failure: { code: 'journal_rollback_failed' }
    });
    return {
      ok: false,
      status: 'rollback_failed',
      code: 'rollback_failed',
      cannotDisguiseSuccess: true
    };
  }
  return {
    ok: true,
    status: marked.journal && marked.journal.phase ? marked.journal.phase : nextPhase,
    journal: marked.journal,
    recoveryReason: patch.recovery.reason
  };
}

function autoResolveLatestPersistedConflict(deps, journal, entity) {
  var api = (deps && deps.journalApi) || journalMod;
  var current = journal;
  var phase = asString(journal && journal.phase);
  if (phase !== PHASE.recovery_conflict && phase !== PHASE.conflict_resolved) {
    var markedConflict = markBatchOutcome(deps, journal, PHASE.recovery_conflict, {
      recovery: {
        reason: 'crash_recovery',
        conflict: true,
        policy: RESOLUTION_LATEST_PERSISTED_STATE_WINS
      },
      failure: { code: 'recovery_conflict', entity: entity || 'match' }
    });
    if (markedConflict && markedConflict.journal) current = markedConflict.journal;
  }
  var matchId = asString(current && current.matchId);
  var seriesId = asString(current && current.seriesId);
  var match = typeof deps.getMatchById === 'function' ? deps.getMatchById(matchId) : null;
  var series = typeof deps.getSeriesById === 'function' ? deps.getSeriesById(seriesId) : null;
  var resolution = {
    kind: RESOLUTION_LATEST_PERSISTED_STATE_WINS,
    reason: RESOLUTION_LATEST_PERSISTED_STATE_WINS,
    entity: entity || (current && current.failure && current.failure.entity) || 'match',
    matchFingerprint: persistWriteSetFingerprint(match),
    seriesFingerprint: persistWriteSetFingerprint(series),
    matchRevision: match && match.updatedAt,
    registrationRevision: series && series.registrationRevision
  };
  var marked =
    typeof api.markBatchConflictResolved === 'function'
      ? api.markBatchConflictResolved(current.planKey, resolution)
      : journalMod.markBatchConflictResolved(current.planKey, resolution);
  return {
    ok: true,
    status: PHASE.conflict_resolved,
    code: 'recovery_conflict',
    autoResolved: true,
    journal: marked && marked.journal ? marked.journal : current,
    match: match,
    series: series,
    resolution: RESOLUTION_LATEST_PERSISTED_STATE_WINS
  };
}

function recoverOneBatchJournal(journal, deps) {
  var phase = asString(journal && journal.phase);
  if (asString(journal && journal.mutationKind) !== MUTATION_KIND) {
    return { ok: true, skipped: true, reason: 'not_batch' };
  }
  if (phase === PHASE.committed) {
    return { ok: true, skipped: true, reason: 'committed' };
  }
  if (phase === PHASE.rolled_back || phase === PHASE.recovered || phase === PHASE.conflict_resolved) {
    return { ok: true, skipped: true, reason: phase };
  }
  if (journal.phase === PHASE.corrupted_discarded) {
    return { ok: true, skipped: true, reason: 'corrupted_discarded' };
  }
  if (phase === PHASE.recovery_conflict) {
    return autoResolveLatestPersistedConflict(deps, journal, journal.failure && journal.failure.entity);
  }
  if (!INCOMPLETE_PHASE[phase]) {
    return { ok: true, skipped: true, reason: 'not_incomplete' };
  }
  var conflict = detectRecoveryConflict(deps, journal);
  if (conflict.conflict) {
    return autoResolveLatestPersistedConflict(deps, journal, conflict.entity);
  }
  var before = journal.before || {};
  var restored = restoreSnapshot(deps, before.matchSnapshot, before.seriesSnapshot);
  return finishRollback(deps, journal, restored, 'crash_recovery');
}

function recoverIncompleteLiveBatchMutations(input) {
  var src = input && typeof input === 'object' ? input : {};
  var listFn =
    typeof src.listUnfinishedJournals === 'function'
      ? src.listUnfinishedJournals
      : src.journalApi && typeof src.journalApi.listUnfinishedJournals === 'function'
        ? src.journalApi.listUnfinishedJournals.bind(src.journalApi)
        : journalMod.listUnfinishedJournals;
  var listed = listFn();
  if (!listed || listed.ok === false) {
    return { ok: false, reason: (listed && listed.reason) || 'journal_read_failed', results: [] };
  }
  if (typeof src.persistMatch !== 'function') {
    return { ok: true, skipped: true, reason: 'persist_match_required', results: [] };
  }
  var wantMatch = asString(src.matchId);
  var wantSeries = asString(src.seriesId);
  var wantRound = asString(src.roundId);
  var byKey = {};
  var rows = Array.isArray(listed.journals) ? listed.journals : [];
  var i;
  for (i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].planKey) byKey[rows[i].planKey] = rows[i];
  }
  var journalApi = src.journalApi || journalMod;
  if (typeof journalApi.listBlockingBatchJournals === 'function') {
    var blocked = journalApi.listBlockingBatchJournals({
      matchId: src.matchId,
      seriesId: src.seriesId
    });
    var extra = (blocked && blocked.journals) || [];
    for (i = 0; i < extra.length; i++) {
      if (extra[i] && extra[i].planKey) byKey[extra[i].planKey] = extra[i];
    }
  }
  var results = [];
  Object.keys(byKey).forEach(function (key) {
    var row = byKey[key];
    if (asString(row.mutationKind) !== MUTATION_KIND) return;
    if (wantMatch && asString(row.matchId) !== wantMatch) return;
    if (wantSeries && asString(row.seriesId) !== wantSeries) return;
    if (wantRound && asString(row.roundId) !== wantRound) return;
    results.push(
      recoverOneBatchJournal(row, {
        persistMatch: src.persistMatch,
        persistSeries: src.persistSeries,
        getMatchById: src.getMatchById,
        getSeriesById: src.getSeriesById,
        journalApi: src.journalApi
      })
    );
  });
  return { ok: true, results: results };
}

function maybeCrash(src, point) {
  if (src && src.__crashAfter === point) {
    var err = new Error('process_crash:' + point);
    err.processCrash = true;
    err.crashPoint = point;
    throw err;
  }
}

function executeBatchReplace(input) {
  var src = input && typeof input === 'object' ? input : {};
  var classification = src.classification;
  var beforeMatch = src.beforeMatch;
  var candidateMatch = src.candidateMatch;
  var series = src.series;
  var stationIndex = src.stationIndex || {};

  if (!classifierMod.isPersistableIdentityCorrection(classification)) {
    return { ok: false, status: 'rejected', code: (classification && classification.code) || 'invalid' };
  }

  var incomingCheck = preflightNewlyBound(series, beforeMatch, candidateMatch);
  if (!incomingCheck.ok) {
    return { ok: false, status: 'rejected', code: incomingCheck.code };
  }

  if (typeof src.validateCandidate === 'function') {
    var v = src.validateCandidate({
      candidateMatch: candidateMatch,
      groups: candidateMatch && candidateMatch.groups,
      pairings: candidateMatch && candidateMatch.pairings,
      series: series,
      strokeCompositionMode: candidateMatch && candidateMatch.strokeCompositionMode,
      registerInfo: candidateMatch && candidateMatch.registerInfo,
      scoreEntities: candidateMatch && candidateMatch.scoreEntities,
      scoreData: candidateMatch && candidateMatch.scoreData,
      gameMode: candidateMatch && candidateMatch.gameMode,
      teamScores: candidateMatch && candidateMatch.teamScores,
      teamScoresByEntity: candidateMatch && candidateMatch.teamScoresByEntity
    });
    if (v && v.ok === false) {
      var reason = asString(v.reason || v.code);
      var code = 'invalid';
      if (reason === 'duplicate' || reason.indexOf('duplicate') >= 0) code = 'incoming_already_in_round';
      else if (reason === 'player_count' || reason.indexOf('count') >= 0 || reason.indexOf('capacity') >= 0) {
        code = 'group_over_capacity';
      } else if (reason.indexOf('affiliation') >= 0) code = 'affiliation_mismatch';
      else code = reason || 'invalid';
      return { ok: false, status: 'rejected', code: code };
    }
  }

  if (typeof src.getMatchById === 'function') {
    var live = src.getMatchById(asString(beforeMatch && beforeMatch.matchId));
    if (matchRevisionFingerprint(live) !== matchRevisionFingerprint(beforeMatch)) {
      return { ok: false, status: 'rejected', code: 'revision_conflict' };
    }
  }

  var plan = buildBatchPlan({
    classification: classification,
    beforeMatch: beforeMatch,
    candidateMatch: candidateMatch,
    series: series,
    stationIndex: stationIndex
  });

  var journalApi = src.journalApi || journalMod;
  src.journalApi = journalApi;

  recoverIncompleteLiveBatchMutations({
    matchId: plan.identity.matchId,
    seriesId: plan.identity.seriesId,
    roundId: plan.identity.roundId,
    persistMatch: src.persistMatch,
    persistSeries: src.persistSeries,
    getMatchById: src.getMatchById,
    getSeriesById: src.getSeriesById,
    journalApi: journalApi,
    listUnfinishedJournals: src.listUnfinishedJournals
  });

  var listBlocking =
    typeof journalApi.listBlockingBatchJournals === 'function'
      ? journalApi.listBlockingBatchJournals.bind(journalApi)
      : journalMod.listBlockingBatchJournals;
  if (typeof listBlocking === 'function') {
    var blocked = listBlocking(plan.identity.matchId);
    var rows = (blocked && blocked.journals) || [];
        for (var bi = 0; bi < rows.length; bi++) {
      var row = rows[bi];
      if (row.phase === PHASE.recovery_conflict) continue;
      return { ok: false, status: 'rejected', code: 'incomplete_batch_exists' };
    }
  }

  if (typeof src.persistMatch !== 'function') {
    return { ok: false, status: 'failed_before_write', code: 'persist_match_required' };
  }

  var existingWrap = typeof journalApi.getJournal === 'function' ? journalApi.getJournal(plan.planKey) : journalMod.getJournal(plan.planKey);
  var existing = existingWrap && existingWrap.journal;
  if (existing && existing.phase === PHASE.committed && asString(existing.batchId) === plan.batchId) {
    return {
      ok: true,
      status: 'completed',
      replacementCount: plan.replacementCount,
      planKey: plan.planKey,
      batchId: plan.batchId,
      journalAttemptKey: existing.journalAttemptKey,
      idempotent: true,
      recommendedRoute: classifierMod.ROUTE.batch_persist
    };
  }
  if (existing && existing.phase === PHASE.conflict_resolved && asString(existing.batchId) === plan.batchId) {
    return { ok: false, status: 'rejected', code: 'batch_superseded' };
  }

  var beforeSeries;
  var matchSnap;
  var seriesSnap;
  var afterSnap;
  try {
    beforeSeries = sanitizeSnapshot(series);
    matchSnap = sanitizeSnapshot(beforeMatch);
    seriesSnap = sanitizeSnapshot(series);
    afterSnap = sanitizeSnapshot(candidateMatch);
  } catch (eSer) {
    return cannotSafelyPersist('journal_serialize_failed');
  }

  var rosterApply = applyRosterChanges(series, plan.rosterAffiliationChanges);
  if (!rosterApply.ok) {
    return { ok: false, status: 'rejected', code: rosterApply.code };
  }
  var nextSeries = rosterApply.changed ? rosterApply.series : series;
  var seriesAfterSnap;
  try {
    seriesAfterSnap = sanitizeSnapshot(nextSeries);
  } catch (eSer2) {
    return cannotSafelyPersist('journal_serialize_failed');
  }

  var journalPayload = {
    planKey: plan.planKey,
    batchId: plan.batchId,
    identity: plan.identity,
    seriesId: plan.identity.seriesId,
    roundId: plan.identity.roundId,
    matchId: plan.identity.matchId,
    publishToken: plan.identity.publishToken,
    incomingUserId: (classification.incomingUserIds || []).join(','),
    outgoingUserId: (classification.outgoingUserIds || []).join(','),
    replacements: plan.replacements,
    rearrangements: plan.rearrangements,
    rosterAffiliationChanges: plan.rosterAffiliationChanges,
    requiresRosterMutation: !!rosterApply.changed,
    before: {
      matchSnapshot: matchSnap,
      seriesSnapshot: seriesSnap,
      registrationRevision: series && series.registrationRevision,
      matchRevision: plan.matchRevision
    },
    expectedAfter: {
      matchSnapshot: afterSnap,
      seriesSnapshot: seriesAfterSnap,
      registrationRevision: nextSeries && nextSeries.registrationRevision
    },
    fingerprints: {
      matchBefore: plan.matchRevision,
      matchAfter: matchRevisionFingerprint(candidateMatch),
      seriesBefore: seriesRevisionFingerprint(series),
      seriesAfter: seriesRevisionFingerprint(nextSeries)
    }
  };

  var preparedWriter =
    typeof src.writePreparedBatchJournal === 'function'
      ? src.writePreparedBatchJournal
      : typeof src.writeBatchJournal === 'function'
        ? src.writeBatchJournal
        : function (payload) {
            return journalApi.writePreparedBatchJournal
              ? journalApi.writePreparedBatchJournal(payload)
              : journalMod.writePreparedBatchJournal(payload);
          };

  var journalRes = preparedWriter(journalPayload);
  if (src.writeBatchJournal && !src.writePreparedBatchJournal) {
    /* counted by adapter */
  }
  if (!journalRes || journalRes.ok !== true) {
    var failReason = asString(journalRes && journalRes.reason) || 'journal_write_failed';
    if (failReason === 'recovery_conflict') {
      return { ok: false, status: 'recovery_conflict', code: 'recovery_conflict' };
    }
    if (failReason === 'batch_superseded') {
      return { ok: false, status: 'rejected', code: 'batch_superseded' };
    }
    if (failReason === 'incomplete_batch_exists' || failReason === 'journal_incomplete') {
      return { ok: false, status: 'rejected', code: failReason === 'journal_incomplete' ? 'incomplete_batch_exists' : failReason };
    }
    return cannotSafelyPersist(failReason);
  }
  if (journalRes.alreadyCommitted) {
    return {
      ok: true,
      status: 'completed',
      replacementCount: plan.replacementCount,
      planKey: plan.planKey,
      batchId: plan.batchId,
      journalAttemptKey: journalRes.journal && journalRes.journal.journalAttemptKey,
      idempotent: true,
      recommendedRoute: classifierMod.ROUTE.batch_persist
    };
  }

  var journal = journalRes.journal;
  var matchWritten = false;
  var seriesWritten = false;

  try {
    maybeCrash(src, 'prepared');

    var persisted = src.persistMatch(candidateMatch, beforeMatch);
    if (!persisted || persisted.ok !== true) {
      var rbFail = restoreSnapshot(src, matchSnap, null);
      finishRollback(src, journal, rbFail, 'persist_match_failed');
      return {
        ok: false,
        status: 'failed_rolled_back',
        code: (persisted && persisted.reason) || 'save_failed'
      };
    }
    matchWritten = true;
    maybeCrash(src, 'match_persist');

    var toMatchWritten = markBatchPhase(journalApi, plan.planKey, PHASE.prepared, PHASE.match_written, null);
    if (!toMatchWritten || toMatchWritten.ok !== true) {
      var rbMw = restoreSnapshot(src, matchSnap, seriesSnap);
      finishRollback(src, journal, rbMw, 'phase_match_written_failed');
      return { ok: false, status: 'failed_rolled_back', code: (toMatchWritten && toMatchWritten.reason) || 'journal_write_failed' };
    }
    journal = toMatchWritten.journal;
    maybeCrash(src, 'match_written');

    if (rosterApply.changed) {
      if (typeof src.persistSeries !== 'function') {
        var rbNeed = restoreSnapshot(src, matchSnap, seriesSnap);
        finishRollback(src, journal, rbNeed, 'persist_series_required');
        return { ok: false, status: 'failed_rolled_back', code: 'persist_series_required' };
      }
      var seriesRes = src.persistSeries(rosterApply.series, series && series.registrationRevision);
      if (!seriesRes || seriesRes.ok !== true) {
        var rbSer = restoreSnapshot(src, matchSnap, seriesSnap);
        finishRollback(src, journal, rbSer, 'persist_series_failed');
        return {
          ok: false,
          status: 'failed_rolled_back',
          code: (seriesRes && seriesRes.reason) === 'registration_conflict' ? 'revision_conflict' : 'roster_save_failed'
        };
      }
      seriesWritten = true;
      maybeCrash(src, 'series_persist');
    }

    var toSeriesWritten = markBatchPhase(journalApi, plan.planKey, PHASE.match_written, PHASE.series_written, null);
    if (!toSeriesWritten || toSeriesWritten.ok !== true) {
      var rbSw = restoreSnapshot(src, matchSnap, seriesSnap);
      finishRollback(src, journal, rbSw, 'phase_series_written_failed');
      return {
        ok: false,
        status: 'failed_rolled_back',
        code: (toSeriesWritten && toSeriesWritten.reason) || 'journal_write_failed'
      };
    }
    journal = toSeriesWritten.journal;
    maybeCrash(src, 'series_written');

    if (typeof src.getMatchById === 'function') {
      var liveAfter = src.getMatchById(plan.identity.matchId);
      if (matchRevisionFingerprint(liveAfter) !== matchRevisionFingerprint(candidateMatch)) {
        var rbV = restoreSnapshot(src, matchSnap, seriesSnap);
        finishRollback(src, journal, rbV, 'final_verify_failed');
        return { ok: false, status: 'failed_rolled_back', code: 'revision_conflict' };
      }
    }

    var committed = markBatchPhase(journalApi, plan.planKey, PHASE.series_written, PHASE.committed, null);
    if (!committed || committed.ok !== true) {
      var rbC = restoreSnapshot(src, matchSnap, seriesSnap);
      finishRollback(src, journal, rbC, 'commit_phase_failed');
      return {
        ok: false,
        status: 'failed_rolled_back',
        code: (committed && committed.reason) || 'journal_write_failed'
      };
    }
    return {
      ok: true,
      status: 'completed',
      replacementCount: plan.replacementCount,
      planKey: plan.planKey,
      batchId: plan.batchId,
      journalAttemptKey: committed.journal && committed.journal.journalAttemptKey,
      recommendedRoute: classifierMod.ROUTE.batch_persist
    };
  } catch (eRun) {
    if (eRun && eRun.processCrash) throw eRun;
    var rbThrow = restoreSnapshot(src, matchSnap, seriesSnap);
    finishRollback(src, journal, rbThrow, 'batch_persist_throw');
    return {
      ok: false,
      status: 'failed_rolled_back',
      code: 'batch_persist_throw'
    };
  }
}

function rollbackBatchReplace(input) {
  var src = input && typeof input === 'object' ? input : {};
  var planKey = asString(src.planKey);
  var wrapped = src.journal;
  if (!wrapped && typeof src.getJournal === 'function') {
    var got = src.getJournal(planKey);
    wrapped = got && got.journal ? got.journal : got;
  }
  if (!wrapped && src.journalApi && typeof src.journalApi.getJournal === 'function') {
    var got2 = src.journalApi.getJournal(planKey);
    wrapped = got2 && got2.journal ? got2.journal : got2;
  }
  var journal = wrapped && wrapped.journal ? wrapped.journal : wrapped;
  if (!journal || asString(journal.mutationKind) !== MUTATION_KIND) {
    return { ok: false, code: 'not_batch_journal' };
  }
  if (journal.phase === PHASE.committed) {
    return { ok: false, code: 'journal_committed' };
  }
  var conflict = detectRecoveryConflict(src, journal);
  if (conflict.conflict) {
    markBatchOutcome(src, journal, PHASE.recovery_conflict, {
      recovery: { reason: 'crash_recovery', conflict: true },
      failure: { code: 'recovery_conflict' }
    });
    return { ok: false, code: 'recovery_conflict' };
  }
  var before = journal.before || {};
  var restored = restoreSnapshot(
    {
      persistMatch: src.persistMatch,
      persistSeries: src.persistSeries
    },
    before.matchSnapshot,
    before.seriesSnapshot
  );
  var done = finishRollback(src, journal, restored, src.recoveryReason || 'explicit_rollback');
  if (done.status === 'rolled_back') {
    return { ok: true, status: 'rolled_back', journal: done.journal };
  }
  return { ok: false, code: done.code || 'rollback_failed', status: done.status };
}

function resolveRecoveryConflict(input) {
  var src = input && typeof input === 'object' ? input : {};
  var planKey = asString(src.planKey);
  var journalApi = src.journalApi || journalMod;
  var wrapped = src.journal;
  if (!wrapped && planKey && typeof journalApi.getJournal === 'function') {
    var got = journalApi.getJournal(planKey);
    wrapped = got && got.journal ? got.journal : got;
  }
  var journal = wrapped && wrapped.journal ? wrapped.journal : wrapped;
  if (!journal || asString(journal.mutationKind) !== MUTATION_KIND) {
    return { ok: false, code: 'not_batch_journal' };
  }
  if (journal.phase === PHASE.conflict_resolved) {
    return { ok: true, status: PHASE.conflict_resolved, idempotent: true, journal: journal };
  }
  return autoResolveLatestPersistedConflict(
    {
      getMatchById: src.getMatchById,
      getSeriesById: src.getSeriesById,
      journalApi: journalApi
    },
    journal,
    src.entity
  );
}

module.exports = {
  MUTATION_KIND: MUTATION_KIND,
  RESOLUTION_LATEST_PERSISTED_STATE_WINS: RESOLUTION_LATEST_PERSISTED_STATE_WINS,
  persistWriteSetFingerprint: persistWriteSetFingerprint,
  canonicalizePersistSnapshot: canonicalizePersistSnapshot,
  estimatePersistSnapshotBytes: estimatePersistSnapshotBytes,
  matchRevisionFingerprint: matchRevisionFingerprint,
  buildBatchPlan: buildBatchPlan,
  preflightIncoming: preflightIncoming,
  preflightNewlyBound: preflightNewlyBound,
  preflightFinalRoster: preflightNewlyBound,
  executeBatchReplace: executeBatchReplace,
  rollbackBatchReplace: rollbackBatchReplace,
  recoverIncompleteLiveBatchMutations: recoverIncompleteLiveBatchMutations,
  recoverOneBatchJournal: recoverOneBatchJournal,
  resolveRecoveryConflict: resolveRecoveryConflict
};
