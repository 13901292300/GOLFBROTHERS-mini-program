/**
 * Series LIVE mutation 只读回滚门闩
 * - 不执行回滚、不推进 journal、不写 Series/Match
 * - 不调用正向 preflight，不重建 A→B plan
 */

var journalMod = require('./seriesLiveMutationJournal.js');
var recoveryMod = require('./seriesLiveMutationRecovery.js');
var evidenceMod = require('./seriesLiveAffiliationEvidence.js');
var seriesFinishLock = require('../../../utils/seriesFinishLock.js');
var teamMatchFinish = require('../../../utils/teamMatchFinish.js');
var matchStatus = require('../../../utils/matchStatus.js');
var seriesRoundVisualState = require('../../../utils/seriesRoundVisualState.js');
var seriesStationMatch = require('../../../utils/seriesStationMatch.js');
var matchManageAccess = require('../../../utils/matchManageAccess.js');

var PHASE = journalMod.PHASE;
var COMBINED = recoveryMod.COMBINED;
var STATE = evidenceMod.STATE;

var MODE = {
  rollback_station: 'rollback_station',
  rollback_roster_first: 'rollback_roster_first',
  finish_rollback_record: 'finish_rollback_record',
  idempotent_rolled_back: 'idempotent_rolled_back',
  manual_review: 'manual_review',
  journal_committed: 'journal_committed',
  rollback_not_requested: 'rollback_not_requested'
};

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function deepClone(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

function playerIdOf(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
  return asString(raw.userId) || asString(raw.playerId) || asString(raw.id);
}

function isValidJournal(journal) {
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)) return false;
  if (Number(journal.journalVersion) !== journalMod.JOURNAL_VERSION) return false;
  if (!asString(journal.planKey)) return false;
  if (!asString(journal.phase)) return false;
  if (!journal.fingerprints || typeof journal.fingerprints !== 'object') return false;
  return (
    !!asString(journal.seriesId) &&
    !!asString(journal.roundId) &&
    !!asString(journal.matchId) &&
    !!asString(journal.groupId) &&
    !!(Number(journal.position) || 0) &&
    !!asString(journal.publishToken)
  );
}

function findRoundsById(series, roundId) {
  var rid = asString(roundId);
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var hits = [];
  for (var i = 0; i < rounds.length; i++) {
    if (asString(rounds[i] && rounds[i].roundId) === rid) hits.push(rounds[i]);
  }
  return hits;
}

function findGroupsById(groups, groupId) {
  var gid = asString(groupId);
  var list = Array.isArray(groups) ? groups : [];
  var hits = [];
  for (var i = 0; i < list.length; i++) {
    if (asString(list[i] && list[i].groupId) === gid) hits.push(list[i]);
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

function pairingsOf(match, groupId) {
  var src = match && match.pairings;
  var gid = asString(groupId);
  if (Array.isArray(src)) return src;
  if (src && typeof src === 'object' && Object.prototype.hasOwnProperty.call(src, gid)) {
    return src[gid];
  }
  return [];
}

function checkPermission(input, match) {
  var fn = input.hasManagePermission;
  if (typeof fn === 'function') {
    return !!(
      fn({
        match: match,
        series: input.currentSeries,
        permission: 'edit_groups',
        user: input.currentUser
      }) ||
      fn({
        match: match,
        series: input.currentSeries,
        permission: 'manage_groups',
        user: input.currentUser
      })
    );
  }
  try {
    return !!(
      matchManageAccess.hasMatchManagePermission(match, input.currentUser, 'edit_groups') ||
      matchManageAccess.hasMatchManagePermission(match, input.currentUser, 'manage_groups')
    );
  } catch (e) {
    return false;
  }
}

function mapMode(recovery, requiresRoster) {
  if (!recovery) return { mode: MODE.manual_review, ready: false, code: 'rollback_state_unknown' };
  if (recovery.combinedState === COMBINED.unknown || recovery.stationState === 'unknown') {
    return { mode: MODE.manual_review, ready: false, code: 'rollback_state_unknown' };
  }
  if (!requiresRoster) {
    if (recovery.stationState === 'after') {
      return { mode: MODE.rollback_station, ready: true };
    }
    if (recovery.stationState === 'before') {
      return { mode: MODE.finish_rollback_record, ready: true };
    }
    return { mode: MODE.manual_review, ready: false, code: 'rollback_state_unknown' };
  }
  if (recovery.combinedState === COMBINED.all_after) {
    return { mode: MODE.rollback_roster_first, ready: true };
  }
  if (recovery.combinedState === COMBINED.station_after_roster_before) {
    return { mode: MODE.rollback_station, ready: true };
  }
  if (recovery.combinedState === COMBINED.all_before) {
    return { mode: MODE.finish_rollback_record, ready: true };
  }
  if (recovery.combinedState === COMBINED.station_before_roster_after) {
    return { mode: MODE.manual_review, ready: false, code: 'station_before_roster_after' };
  }
  return { mode: MODE.manual_review, ready: false, code: 'rollback_state_unknown' };
}

function unknownCode(recovery, match, journal) {
  var reasons = ((((recovery || {}).traces || {}).station || {}).reasons || []).concat(
    ((((recovery || {}).traces || {}).roster || {}).reasons || [])
  );
  if (reasons.indexOf('roster_entry_missing') >= 0) return 'roster_entry_missing';
  if (reasons.indexOf('roster_player_conflict') >= 0) return 'roster_player_conflict';
  if (reasons.indexOf('pairing_mismatch') >= 0 || reasons.indexOf('score_identity_mismatch') >= 0) {
    return 'rollback_station_drift';
  }
  var groups = findGroupsById(match && match.groups, journal && journal.groupId);
  var seat = groups[0] ? findPlayersByPosition(groups[0], journal.position)[0] : null;
  if (seat && playerIdOf(seat) && playerIdOf(seat) !== asString(journal.incomingUserId) &&
      playerIdOf(seat) !== asString(journal.outgoingUserId)) {
    return 'rollback_station_drift';
  }
  if (seat && asString(journal.incomingUserId) && playerIdOf(seat) !== asString(journal.incomingUserId) &&
      recovery && recovery.stationState !== 'before') {
    return 'rollback_station_drift';
  }
  return 'rollback_state_unknown';
}

function runSeriesLiveRollbackPreflight(input) {
  var src = input && typeof input === 'object' ? input : {};
  var journal = src.journal;
  var series = src.currentSeries;
  var match = src.currentMatch;
  var traces = { steps: [] };

  function finish(extra) {
    var out = Object.assign(
      {
        ok: false,
        readyToRollback: false,
        code: '',
        mode: MODE.manual_review,
        recovery: null,
        traces: traces
      },
      extra || {}
    );
    out.readyToRollback = extra && extra.readyToRollback === true;
    out.traces = deepClone(out.traces || traces);
    if (out.recovery) out.recovery = deepClone(out.recovery);
    return out;
  }

  function reject(code, extra) {
    traces.steps.push({ ok: false, code: code });
    return finish(
      Object.assign(
        {
          ok: false,
          readyToRollback: false,
          mode: MODE.manual_review,
          code: code
        },
        extra || {}
      )
    );
  }

  traces.steps.push({ id: 'journal_identity' });
  if (!isValidJournal(journal)) {
    return reject('journal_invalid');
  }
  if (
    !asString(journal.incomingUserId) ||
    !asString(journal.outgoingUserId) ||
    !asString(journal.targetAffiliationId)
  ) {
    return reject('identity_conflict');
  }
  if (src.forceRollbackCommitted === true) {
    traces.ignoredForceCommitted = true;
  }

  var phase = journal.phase;
  if (phase === PHASE.committed) {
    return finish({
      ok: false,
      readyToRollback: false,
      mode: MODE.journal_committed,
      code: 'journal_committed'
    });
  }
  if (phase === PHASE.manual_review) {
    var recManual = recoveryMod.inspectSeriesLiveMutationRecovery({
      journal: journal,
      currentSeries: series,
      currentMatch: match
    });
    return finish({
      ok: false,
      readyToRollback: false,
      mode: MODE.manual_review,
      code: 'journal_manual_review',
      recovery: recManual
    });
  }
  if (
    phase !== PHASE.rollback_pending &&
    phase !== PHASE.rolling_back &&
    phase !== PHASE.rolled_back
  ) {
    return finish({
      ok: false,
      readyToRollback: false,
      mode: MODE.rollback_not_requested,
      code: 'rollback_not_requested',
      journalPhase: phase
    });
  }

  if (journal.requiresConfirmation) {
    var accepted = asString(journal.confirmationAcceptedFingerprint);
    var fp = asString(journal.confirmationFingerprint);
    if (!accepted || !fp || accepted !== fp) {
      return reject('confirmation_fingerprint_conflict');
    }
  }

  traces.steps.push({ id: 'identity_live' });
  if (!series || asString(series.seriesId) !== asString(journal.seriesId)) {
    return reject('identity_conflict');
  }
  if (!match || asString(match.matchId) !== asString(journal.matchId)) {
    return reject('identity_conflict');
  }
  if (!seriesStationMatch.isSeriesManagedMatch(match)) {
    return reject('identity_conflict');
  }
  var ctx = match.seriesContext || {};
  if (
    asString(ctx.seriesId) !== asString(journal.seriesId) ||
    asString(ctx.roundId) !== asString(journal.roundId) ||
    asString(ctx.publishToken) !== asString(journal.publishToken)
  ) {
    return reject('identity_conflict');
  }
  var indexRow = src.stationIndex && typeof src.stationIndex === 'object' ? src.stationIndex : null;
  if (!indexRow) return reject('index_missing');
  if (
    asString(indexRow.seriesId) !== asString(journal.seriesId) ||
    asString(indexRow.roundId) !== asString(journal.roundId) ||
    asString(indexRow.matchId) !== asString(journal.matchId)
  ) {
    return reject('identity_conflict');
  }

  traces.steps.push({ id: 'recovery' });
  var recovery = recoveryMod.inspectSeriesLiveMutationRecovery({
    journal: journal,
    currentSeries: series,
    currentMatch: match
  });

  if (phase === PHASE.rolled_back) {
    var requiresRoster = !!journal.requiresRosterMutation;
    var allBefore =
      recovery.combinedState === COMBINED.all_before ||
      (!requiresRoster && recovery.combinedState === COMBINED.station_before);
    if (allBefore) {
      return finish({
        ok: true,
        readyToRollback: false,
        mode: MODE.idempotent_rolled_back,
        recovery: recovery
      });
    }
    return finish({
      ok: false,
      readyToRollback: false,
      mode: MODE.manual_review,
      code: recovery.code || 'rolled_back_state_drift',
      recovery: recovery
    });
  }

  var mapped = mapMode(recovery, !!journal.requiresRosterMutation);
  if (!mapped.ready) {
    var code = mapped.code || 'rollback_state_unknown';
    if (recovery.combinedState === COMBINED.unknown) {
      code = unknownCode(recovery, match, journal);
    }
    return finish({
      ok: false,
      readyToRollback: false,
      mode: MODE.manual_review,
      code: code,
      recovery: recovery
    });
  }

  traces.steps.push({ id: 'lifecycle_locks' });
  var roundHits = findRoundsById(series, journal.roundId);
  if (!roundHits.length || roundHits.length > 1) {
    return reject('identity_conflict', { recovery: recovery });
  }
  var round = roundHits[0];
  if (asString(round.matchId) !== asString(journal.matchId)) {
    return reject('identity_conflict', { recovery: recovery });
  }
  var visual = seriesRoundVisualState.resolveSeriesRoundVisualState(round, match);
  var life = asString(series.lifecycleStatus).toLowerCase();
  if (life === 'cancelled' || life === 'canceled' || life === 'archived') {
    return reject('series_locked', { recovery: recovery });
  }
  var seriesLock = seriesFinishLock.assertSeriesWritable(series);
  if (!seriesLock.ok) {
    return reject('series_locked', { recovery: recovery });
  }
  if (visual && visual.state === seriesRoundVisualState.STATE.cancelled) {
    return reject('round_cancelled', { recovery: recovery });
  }
  if (teamMatchFinish.isMatchCompleted(match)) {
    return reject('match_completed', { recovery: recovery });
  }
  var groupHits = findGroupsById(match.groups, journal.groupId);
  if (!groupHits.length) {
    return reject('rollback_state_unknown', { recovery: recovery });
  }
  if (matchStatus.isGroupConfirmedFinished(groupHits[0] && groupHits[0].status)) {
    return reject('group_finished', { recovery: recovery });
  }

  traces.steps.push({ id: 'permission' });
  if (!checkPermission(src, match)) {
    return reject('permission_denied', { recovery: recovery });
  }

  if (mapped.mode === MODE.rollback_station) {
    traces.steps.push({ id: 'station_slice' });
    var beforeSt = journal.before && journal.before.station;
    var afterSt = journal.expectedAfter && journal.expectedAfter.station;
    if (!beforeSt || !beforeSt.group || beforeSt.pairings == null || beforeSt.scoreEntities == null) {
      return reject('rollback_station_drift', { recovery: recovery });
    }
    var posHits = findPlayersByPosition(groupHits[0], journal.position);
    if (posHits.length !== 1) {
      return reject('rollback_station_drift', { recovery: recovery });
    }
    if (playerIdOf(posHits[0]) !== asString(journal.incomingUserId)) {
      return reject('rollback_station_drift', { recovery: recovery });
    }
    var afterScore = (afterSt && afterSt.scoreIdentitySummary) || {};
    var liveScore = {};
    Object.keys(afterScore).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(posHits[0], k)) liveScore[k] = posHits[0][k];
    });
    if (journalMod.fingerprintOf(liveScore) !== journalMod.fingerprintOf(afterScore)) {
      return reject('rollback_station_drift', { recovery: recovery });
    }
    var livePairings = journalMod.freezeStation({
      matchId: match.matchId,
      seriesContext: ctx,
      status: match.status,
      groupId: journal.groupId,
      position: journal.position,
      group: groupHits[0],
      pairings: pairingsOf(match, journal.groupId),
      scoreEntities: [],
      scoreIdentitySummary: {}
    }).pairings;
    if (journalMod.fingerprintOf(livePairings) !== journalMod.fingerprintOf(afterSt.pairings || [])) {
      return reject('rollback_station_drift', { recovery: recovery });
    }
  }

  if (mapped.mode === MODE.rollback_roster_first) {
    traces.steps.push({ id: 'roster_slice' });
    var beforeRo = journal.before && journal.before.roster;
    var afterRo = journal.expectedAfter && journal.expectedAfter.roster;
    if (!beforeRo || !afterRo || !asString(afterRo.rosterEntryId)) {
      return reject('roster_entry_missing', { recovery: recovery });
    }
    var wantId = asString(afterRo.rosterEntryId);
    var list = Array.isArray(series.roster) ? series.roster : [];
    var hits = [];
    for (var i = 0; i < list.length; i++) {
      if (asString(list[i] && list[i].rosterEntryId) === wantId) hits.push(list[i]);
    }
    if (!hits.length) return reject('roster_entry_missing', { recovery: recovery });
    if (hits.length > 1) return reject('roster_entry_ambiguous', { recovery: recovery });
    var entry = hits[0];
    if (asString(entry.playerId) !== asString(afterRo.playerId || beforeRo.playerId)) {
      return reject('roster_player_conflict', { recovery: recovery });
    }
    if (asString(entry.registrationStatus).toLowerCase() !== 'registered') {
      return reject('roster_status_conflict', { recovery: recovery });
    }
    if (asString(entry.seriesParticipantId) !== asString(afterRo.seriesParticipantId)) {
      return reject('roster_not_expected_after', { recovery: recovery });
    }
    traces.rosterRollbackTarget = asString(beforeRo.seriesParticipantId);
    traces.registrationRevisionMustIncrement = true;

    traces.steps.push({ id: 'rollback_evidence' });
    if (typeof src.getMatchById !== 'function') {
      return reject('evidence_incomplete', { recovery: recovery });
    }
    var getIndexByMatchId =
      typeof src.getIndexByMatchId === 'function'
        ? src.getIndexByMatchId
        : function (matchId) {
            var mid = asString(matchId);
            if (mid === asString(indexRow.matchId)) return indexRow;
            var rounds = Array.isArray(series.rounds) ? series.rounds : [];
            for (var r = 0; r < rounds.length; r++) {
              if (asString(rounds[r] && rounds[r].matchId) === mid) {
                return {
                  seriesId: asString(journal.seriesId),
                  roundId: asString(rounds[r].roundId),
                  matchId: mid
                };
              }
            }
            return null;
          };
    var evidence = evidenceMod.collectSeriesLiveAffiliationEvidence({
      series: series,
      playerId: journal.incomingUserId,
      currentTarget: {
        seriesId: journal.seriesId,
        roundId: journal.roundId,
        matchId: journal.matchId,
        groupId: journal.groupId,
        position: journal.position
      },
      getMatchById: src.getMatchById,
      getIndexByMatchId: getIndexByMatchId
    });
    traces.evidenceState = evidence && evidence.state;
    if (!evidence.ok || evidence.state === STATE.projection_incomplete) {
      return reject('evidence_incomplete', { recovery: recovery });
    }
    if (evidence.state === STATE.affiliation_conflict) {
      return reject('rollback_affiliation_conflict', { recovery: recovery });
    }
    if (
      (evidence.state === STATE.participation_reservation ||
        evidence.state === STATE.confirmed_affiliation_lock) &&
      asString(evidence.affiliationId) &&
      asString(evidence.affiliationId) !== asString(beforeRo.seriesParticipantId)
    ) {
      return reject('rollback_affiliation_conflict', { recovery: recovery });
    }
  }

  if (mapped.mode === MODE.finish_rollback_record) {
    var reqR = !!journal.requiresRosterMutation;
    var okBefore =
      recovery.combinedState === COMBINED.all_before ||
      (!reqR && recovery.combinedState === COMBINED.station_before);
    if (!okBefore) {
      return reject('rollback_state_unknown', { recovery: recovery });
    }
  }

  traces.mode = mapped.mode;
  return finish({
    ok: true,
    readyToRollback: true,
    mode: mapped.mode,
    recovery: recovery
  });
}

module.exports = {
  MODE: MODE,
  runSeriesLiveRollbackPreflight: runSeriesLiveRollbackPreflight
};
