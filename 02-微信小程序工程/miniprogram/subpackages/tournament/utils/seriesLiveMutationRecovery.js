/**
 * Series LIVE mutation 恢复判定器
 * - 只读 journal + 当前 Series/Match
 * - 分类 before / after / unknown
 * - 不写入、不推进 journal、不授权执行
 */

var journalMod = require('./seriesLiveMutationJournal.js');

var PHASE = journalMod.PHASE;

var STATION_STATE = {
  before: 'before',
  after: 'after',
  unknown: 'unknown'
};

var ROSTER_STATE = {
  before: 'before',
  after: 'after',
  unknown: 'unknown',
  not_required: 'not_required'
};

var COMBINED = {
  all_before: 'all_before',
  all_after: 'all_after',
  station_after_roster_before: 'station_after_roster_before',
  station_before_roster_after: 'station_before_roster_after',
  station_before: 'station_before',
  station_after: 'station_after',
  unknown: 'unknown'
};

var ACTION = {
  eligible_to_start_station_after_revalidation: 'eligible_to_start_station_after_revalidation',
  eligible_to_verify_or_commit_after_revalidation: 'eligible_to_verify_or_commit_after_revalidation',
  eligible_to_finish_rollback_record: 'eligible_to_finish_rollback_record',
  eligible_to_rollback_station_after_revalidation: 'eligible_to_rollback_station_after_revalidation',
  eligible_to_resume_roster_after_revalidation: 'eligible_to_resume_roster_after_revalidation',
  eligible_to_rollback_roster_first_after_revalidation: 'eligible_to_rollback_roster_first_after_revalidation',
  idempotent_committed: 'idempotent_committed',
  idempotent_rolled_back: 'idempotent_rolled_back',
  manual_review: 'manual_review'
};

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function deepClone(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

function isRollbackPhase(phase) {
  return phase === PHASE.rollback_pending || phase === PHASE.rolling_back;
}

function isForwardWritePhase(phase) {
  return (
    phase === PHASE.station_writing ||
    phase === PHASE.station_written ||
    phase === PHASE.station_verified ||
    phase === PHASE.roster_writing ||
    phase === PHASE.roster_written ||
    phase === PHASE.roster_verified ||
    phase === PHASE.committing
  );
}

function findGroupsById(match, groupId) {
  var gid = asString(groupId);
  var groups = Array.isArray(match && match.groups) ? match.groups : [];
  var hits = [];
  for (var i = 0; i < groups.length; i++) {
    if (asString(groups[i] && groups[i].groupId) === gid) hits.push(groups[i]);
  }
  return hits;
}

function findPlayersByPosition(group, position) {
  var pos = Number(position) || 0;
  var players = Array.isArray(group && group.players) ? group.players : [];
  var hits = [];
  for (var i = 0; i < players.length; i++) {
    var p = players[i];
    var pp = Number(p && (p.position != null ? p.position : p.slotIndex)) || 0;
    if (pp === pos) hits.push(p);
  }
  return hits;
}

function pairingsForGroup(match, groupId) {
  var src = match && match.pairings;
  var gid = asString(groupId);
  if (Array.isArray(src)) return src;
  if (src && typeof src === 'object' && Object.prototype.hasOwnProperty.call(src, gid)) {
    return Array.isArray(src[gid]) ? src[gid] : src[gid];
  }
  return [];
}

function entitiesForGroup(match, groupId) {
  var src = match && match.scoreEntities;
  var gid = asString(groupId);
  if (Array.isArray(src)) return src;
  if (src && typeof src === 'object' && Object.prototype.hasOwnProperty.call(src, gid)) {
    return src[gid];
  }
  return [];
}

function pickScoreSummary(player, template) {
  var src = player && typeof player === 'object' ? player : {};
  var out = {};
  var keys =
    template && typeof template === 'object' && Object.keys(template).length
      ? Object.keys(template)
      : ['scorePlayerId', 'slotScorePlayerId', 'scoreOwnerId', 'entityId', 'slotId', 'pairingId', 'hasHistoryScore'];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
    out[k] = src[k];
  }
  return out;
}

function inspectStation(journal, match) {
  var traces = { reasons: [] };
  var beforeSnap = journal && journal.before && journal.before.station;
  var afterSnap = journal && journal.expectedAfter && journal.expectedAfter.station;
  var fps = (journal && journal.fingerprints) || {};

  if (!match || typeof match !== 'object') {
    traces.reasons.push('station_missing');
    return { state: STATION_STATE.unknown, traces: traces };
  }

  var expectedMatchId = asString(journal.matchId);
  if (asString(match.matchId) !== expectedMatchId) {
    traces.reasons.push('station_identity_conflict');
    return { state: STATION_STATE.unknown, traces: traces };
  }

  var ctx = match.seriesContext && typeof match.seriesContext === 'object' ? match.seriesContext : {};
  if (asString(ctx.seriesId) !== asString(journal.seriesId) || asString(ctx.roundId) !== asString(journal.roundId)) {
    traces.reasons.push('series_context_conflict');
    return { state: STATION_STATE.unknown, traces: traces };
  }
  if (asString(ctx.matchId) && asString(ctx.matchId) !== expectedMatchId) {
    traces.reasons.push('series_context_conflict');
    return { state: STATION_STATE.unknown, traces: traces };
  }
  if (asString(ctx.publishToken) !== asString(journal.publishToken)) {
    traces.reasons.push('publish_token_conflict');
    return { state: STATION_STATE.unknown, traces: traces };
  }

  var groupHits = findGroupsById(match, journal.groupId);
  if (!groupHits.length) {
    traces.reasons.push('target_group_missing');
    return { state: STATION_STATE.unknown, traces: traces };
  }
  if (groupHits.length > 1) {
    traces.reasons.push('target_group_ambiguous');
    return { state: STATION_STATE.unknown, traces: traces };
  }
  var group = groupHits[0];
  var posHits = findPlayersByPosition(group, journal.position);
  if (!posHits.length) {
    traces.reasons.push('target_position_missing');
    return { state: STATION_STATE.unknown, traces: traces };
  }
  if (posHits.length > 1) {
    traces.reasons.push('target_position_ambiguous');
    return { state: STATION_STATE.unknown, traces: traces };
  }

  var template = (beforeSnap && beforeSnap.scoreIdentitySummary) || (afterSnap && afterSnap.scoreIdentitySummary);
  var extracted = journalMod.freezeStation({
    matchId: match.matchId,
    seriesContext: ctx,
    status: match.status,
    groupId: journal.groupId,
    position: journal.position,
    group: group,
    pairings: pairingsForGroup(match, journal.groupId),
    scoreEntities: entitiesForGroup(match, journal.groupId),
    scoreIdentitySummary: pickScoreSummary(posHits[0], template)
  });
  traces.currentFingerprint = journalMod.fingerprintOf(extracted);

  var beforeFp = asString(fps.stationBefore) || journalMod.fingerprintOf(journalMod.freezeStation(beforeSnap));
  var afterFp = asString(fps.stationAfter) || journalMod.fingerprintOf(journalMod.freezeStation(afterSnap));

  var frozenBefore = journalMod.freezeStation(beforeSnap);
  var frozenAfter = journalMod.freezeStation(afterSnap);
  if (journalMod.fingerprintOf(extracted.pairings) !== journalMod.fingerprintOf(frozenBefore.pairings) &&
      journalMod.fingerprintOf(extracted.pairings) !== journalMod.fingerprintOf(frozenAfter.pairings)) {
    traces.reasons.push('pairing_mismatch');
  }
  if (journalMod.fingerprintOf(extracted.scoreEntities) !== journalMod.fingerprintOf(frozenBefore.scoreEntities) &&
      journalMod.fingerprintOf(extracted.scoreEntities) !== journalMod.fingerprintOf(frozenAfter.scoreEntities)) {
    traces.reasons.push('score_entity_mismatch');
  }
  if (
    journalMod.fingerprintOf(extracted.scoreIdentitySummary) !==
      journalMod.fingerprintOf(frozenBefore.scoreIdentitySummary) &&
    journalMod.fingerprintOf(extracted.scoreIdentitySummary) !==
      journalMod.fingerprintOf(frozenAfter.scoreIdentitySummary)
  ) {
    traces.reasons.push('score_identity_mismatch');
  }

  if (traces.currentFingerprint === beforeFp) {
    return { state: STATION_STATE.before, traces: traces, snapshot: extracted };
  }
  if (traces.currentFingerprint === afterFp) {
    return { state: STATION_STATE.after, traces: traces, snapshot: extracted };
  }
  if (traces.reasons.indexOf('pairing_mismatch') < 0 &&
      traces.reasons.indexOf('score_entity_mismatch') < 0 &&
      traces.reasons.indexOf('score_identity_mismatch') < 0) {
    traces.reasons.push('station_snapshot_mismatch');
  }
  return { state: STATION_STATE.unknown, traces: traces, snapshot: extracted };
}

function rosterCompareSlice(frozen, basis) {
  if (!frozen || typeof frozen !== 'object') return null;
  var src = basis && typeof basis === 'object' ? basis : frozen;
  var out = {
    rosterEntryId: frozen.rosterEntryId,
    playerId: frozen.playerId,
    registrationStatus: frozen.registrationStatus,
    seriesParticipantId: frozen.seriesParticipantId
  };
  if (Object.prototype.hasOwnProperty.call(src, 'lifecycleStatus')) {
    out.lifecycleStatus = frozen.lifecycleStatus;
  }
  return out;
}

function inspectRoster(journal, series) {
  var traces = { reasons: [] };
  if (!journal || !journal.requiresRosterMutation) {
    return { state: ROSTER_STATE.not_required, traces: traces };
  }
  if (!series || typeof series !== 'object') {
    traces.reasons.push('series_missing');
    return { state: ROSTER_STATE.unknown, traces: traces };
  }
  if (asString(series.seriesId) !== asString(journal.seriesId)) {
    traces.reasons.push('series_identity_conflict');
    return { state: ROSTER_STATE.unknown, traces: traces };
  }

  var before = journal.before && journal.before.roster;
  var after = journal.expectedAfter && journal.expectedAfter.roster;
  var wantId = asString(before && before.rosterEntryId) || asString(after && after.rosterEntryId);
  var wantPlayer = asString(before && before.playerId) || asString(after && after.playerId);
  if (!wantId) {
    traces.reasons.push('roster_entry_missing');
    return { state: ROSTER_STATE.unknown, traces: traces };
  }

  var list = Array.isArray(series.roster) ? series.roster : [];
  var hits = [];
  for (var i = 0; i < list.length; i++) {
    if (asString(list[i] && list[i].rosterEntryId) === wantId) hits.push(list[i]);
  }
  if (!hits.length) {
    traces.reasons.push('roster_entry_missing');
    return { state: ROSTER_STATE.unknown, traces: traces };
  }
  if (hits.length > 1) {
    traces.reasons.push('roster_entry_ambiguous');
    return { state: ROSTER_STATE.unknown, traces: traces };
  }
  var entry = hits[0];
  if (asString(entry.playerId) !== wantPlayer) {
    traces.reasons.push('roster_player_conflict');
    return { state: ROSTER_STATE.unknown, traces: traces };
  }

  var status = asString(entry.registrationStatus).toLowerCase();
  traces.registrationStatus = status;
  traces.registrationRevision = series.registrationRevision;
  if (status && status !== 'registered') {
    traces.reasons.push('roster_status_conflict');
  }

  var patch = {};
  if (Object.prototype.hasOwnProperty.call(before || {}, 'registrationRevision') ||
      Object.prototype.hasOwnProperty.call(after || {}, 'registrationRevision')) {
    patch.registrationRevision = series.registrationRevision;
  }
  if (Object.prototype.hasOwnProperty.call(before || {}, 'lifecycleStatus') ||
      Object.prototype.hasOwnProperty.call(after || {}, 'lifecycleStatus')) {
    patch.lifecycleStatus = series.lifecycleStatus;
  }
  var currentFrozen = journalMod.freezeRoster(Object.assign({}, entry, patch));
  var currentSlice = rosterCompareSlice(currentFrozen, before || after);
  var beforeSlice = rosterCompareSlice(journalMod.freezeRoster(before), before);
  var afterSlice = rosterCompareSlice(journalMod.freezeRoster(after), after);
  var curFp = journalMod.fingerprintOf(currentSlice);
  var beforeFp = journalMod.fingerprintOf(beforeSlice);
  var afterFp = journalMod.fingerprintOf(afterSlice);
  traces.currentFingerprint = curFp;
  traces.revisionDrift =
    currentFrozen &&
    before &&
    Object.prototype.hasOwnProperty.call(currentFrozen, 'registrationRevision') &&
    String(currentFrozen.registrationRevision) !== String(before.registrationRevision) &&
    String(currentFrozen.registrationRevision) !== String(after && after.registrationRevision);

  if (curFp === beforeFp) {
    return { state: ROSTER_STATE.before, traces: traces };
  }
  if (curFp === afterFp) {
    return { state: ROSTER_STATE.after, traces: traces };
  }
  if (traces.reasons.indexOf('roster_status_conflict') < 0) {
    traces.reasons.push('roster_snapshot_mismatch');
  }
  return { state: ROSTER_STATE.unknown, traces: traces };
}

function combine(stationState, rosterState, requiresRoster) {
  if (stationState === STATION_STATE.unknown) return COMBINED.unknown;
  if (!requiresRoster || rosterState === ROSTER_STATE.not_required) {
    if (stationState === STATION_STATE.before) return COMBINED.station_before;
    if (stationState === STATION_STATE.after) return COMBINED.station_after;
    return COMBINED.unknown;
  }
  if (rosterState === ROSTER_STATE.unknown) return COMBINED.unknown;
  if (stationState === STATION_STATE.before && rosterState === ROSTER_STATE.before) {
    return COMBINED.all_before;
  }
  if (stationState === STATION_STATE.after && rosterState === ROSTER_STATE.after) {
    return COMBINED.all_after;
  }
  if (stationState === STATION_STATE.after && rosterState === ROSTER_STATE.before) {
    return COMBINED.station_after_roster_before;
  }
  if (stationState === STATION_STATE.before && rosterState === ROSTER_STATE.after) {
    return COMBINED.station_before_roster_after;
  }
  return COMBINED.unknown;
}

function isAllAfter(combined, requiresRoster) {
  if (!requiresRoster) return combined === COMBINED.station_after;
  return combined === COMBINED.all_after;
}

function isAllBefore(combined, requiresRoster) {
  if (!requiresRoster) return combined === COMBINED.station_before;
  return combined === COMBINED.all_before;
}

function recommend(phase, combined, requiresRoster) {
  if (phase === PHASE.manual_review) {
    return { action: ACTION.manual_review };
  }
  if (combined === COMBINED.unknown || combined === COMBINED.station_before_roster_after) {
    return { action: ACTION.manual_review };
  }
  if (phase === PHASE.committed) {
    if (isAllAfter(combined, requiresRoster)) {
      return { action: ACTION.idempotent_committed };
    }
    return { action: ACTION.manual_review, code: 'committed_state_drift', ok: false };
  }
  if (phase === PHASE.rolled_back) {
    if (isAllBefore(combined, requiresRoster)) {
      return { action: ACTION.idempotent_rolled_back };
    }
    return { action: ACTION.manual_review, code: 'rolled_back_state_drift', ok: false };
  }

  if (isRollbackPhase(phase)) {
    if (!requiresRoster) {
      if (combined === COMBINED.station_before) return { action: ACTION.eligible_to_finish_rollback_record };
      if (combined === COMBINED.station_after) {
        return { action: ACTION.eligible_to_rollback_station_after_revalidation };
      }
      return { action: ACTION.manual_review };
    }
    if (combined === COMBINED.all_after) {
      return { action: ACTION.eligible_to_rollback_roster_first_after_revalidation };
    }
    if (combined === COMBINED.station_after_roster_before) {
      return { action: ACTION.eligible_to_rollback_station_after_revalidation };
    }
    if (combined === COMBINED.all_before) {
      return { action: ACTION.eligible_to_finish_rollback_record };
    }
    return { action: ACTION.manual_review };
  }

  if (!requiresRoster) {
    if (combined === COMBINED.station_before) {
      return { action: ACTION.eligible_to_start_station_after_revalidation };
    }
    if (combined === COMBINED.station_after && (isForwardWritePhase(phase) || phase === PHASE.prepared)) {
      if (phase === PHASE.prepared) return { action: ACTION.manual_review };
      return { action: ACTION.eligible_to_verify_or_commit_after_revalidation };
    }
    if (combined === COMBINED.station_after) {
      return { action: ACTION.eligible_to_verify_or_commit_after_revalidation };
    }
    return { action: ACTION.manual_review };
  }

  if (combined === COMBINED.all_before) {
    return { action: ACTION.eligible_to_start_station_after_revalidation };
  }
  if (combined === COMBINED.station_after_roster_before) {
    return { action: ACTION.eligible_to_resume_roster_after_revalidation };
  }
  if (combined === COMBINED.all_after) {
    return { action: ACTION.eligible_to_verify_or_commit_after_revalidation };
  }
  return { action: ACTION.manual_review };
}

function inspectSeriesLiveMutationRecovery(input) {
  var src = input && typeof input === 'object' ? input : {};
  var journal = src.journal;
  var series = src.currentSeries;
  var match = src.currentMatch;

  function finish(extra) {
    var out = Object.assign(
      {
        ok: true,
        journalPhase: journal && journal.phase,
        stationState: STATION_STATE.unknown,
        rosterState: ROSTER_STATE.unknown,
        combinedState: COMBINED.unknown,
        recommendedAction: ACTION.manual_review,
        requiresDomainRevalidation: true,
        executionAllowed: false,
        traces: {}
      },
      extra || {}
    );
    out.executionAllowed = false;
    out.requiresDomainRevalidation = true;
    out.traces = deepClone(out.traces || {});
    return out;
  }

  if (!journal || typeof journal !== 'object') {
    return finish({
      ok: false,
      code: 'journal_missing',
      journalPhase: ''
    });
  }

  var station = inspectStation(journal, match);
  var roster = inspectRoster(journal, series);
  var combined = combine(station.state, roster.state, !!journal.requiresRosterMutation);
  var rec = recommend(journal.phase, combined, !!journal.requiresRosterMutation);

  return finish({
    ok: rec.ok === false ? false : true,
    code: rec.code,
    journalPhase: journal.phase,
    stationState: station.state,
    rosterState: roster.state,
    combinedState: combined,
    recommendedAction: rec.action,
    traces: {
      station: station.traces,
      roster: roster.traces
    }
  });
}

module.exports = {
  STATION_STATE: STATION_STATE,
  ROSTER_STATE: ROSTER_STATE,
  COMBINED: COMBINED,
  ACTION: ACTION,
  inspectSeriesLiveMutationRecovery: inspectSeriesLiveMutationRecovery
};
