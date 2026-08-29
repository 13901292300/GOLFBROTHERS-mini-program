/**
 * Series LIVE 换人执行前门闩（只读编排）
 * - 调用方注入重新读取后的 Series/Match
 * - 不写 storage、不推进 journal、不执行 mutation
 */

var journalMod = require('./seriesLiveMutationJournal.js');
var recoveryMod = require('./seriesLiveMutationRecovery.js');
var evidenceMod = require('./seriesLiveAffiliationEvidence.js');
var decisionMod = require('./seriesLiveReplaceDecision.js');
var planMod = require('./seriesLiveReplacePlan.js');
var seriesFinishLock = require('../../../utils/seriesFinishLock.js');
var teamMatchFinish = require('../../../utils/teamMatchFinish.js');
var matchStatus = require('../../../utils/matchStatus.js');
var seriesRoundVisualState = require('../../../utils/seriesRoundVisualState.js');
var seriesStationMatch = require('../../../utils/seriesStationMatch.js');
var matchManageAccess = require('../../../utils/matchManageAccess.js');

var PHASE = journalMod.PHASE;
var COMBINED = recoveryMod.COMBINED;
var REC_ACTION = recoveryMod.ACTION;
var DECISION_ACTION = decisionMod.ACTION;
var STATE = evidenceMod.STATE;
var SCORE_IDENTITY_KEYS = decisionMod.SCORE_IDENTITY_KEYS;

var MODE = {
  start_station: 'start_station',
  resume_roster: 'resume_roster',
  verify_and_commit: 'verify_and_commit',
  rollback_required: 'rollback_required',
  blocked: 'blocked'
};

var AUDIT_KEYS = {
  createdAt: true,
  updatedAt: true,
  committedAt: true,
  rolledBackAt: true,
  timestamp: true
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

function fingerprintOf(value) {
  return seriesStationMatch.fingerprintOf(value);
}

function stripAudit(value) {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map(stripAudit);
  }
  if (typeof value !== 'object') return value;
  var out = {};
  Object.keys(value).forEach(function (k) {
    if (AUDIT_KEYS[k]) return;
    out[k] = stripAudit(value[k]);
  });
  return out;
}

function isValidJournal(journal) {
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)) return false;
  if (Number(journal.journalVersion) !== journalMod.JOURNAL_VERSION) return false;
  if (!asString(journal.planKey)) return false;
  if (!asString(journal.phase)) return false;
  if (!journal.fingerprints || typeof journal.fingerprints !== 'object') return false;
  if (!asString(journal.seriesId) || !asString(journal.matchId) || !asString(journal.roundId)) return false;
  return true;
}

function isRollbackPhase(phase) {
  return phase === PHASE.rollback_pending || phase === PHASE.rolling_back;
}

function isTerminalPhase(phase) {
  return phase === PHASE.committed || phase === PHASE.rolled_back || phase === PHASE.manual_review;
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

function pickScoreIdentity(player, template) {
  var src = player && typeof player === 'object' ? player : {};
  var keys =
    template && typeof template === 'object' && Object.keys(template).length
      ? Object.keys(template)
      : SCORE_IDENTITY_KEYS;
  var out = {};
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
    out[k] = src[k];
  }
  return out;
}

function planIdentity(plan) {
  var p = plan && typeof plan === 'object' ? plan : {};
  var id = p.identity && typeof p.identity === 'object' ? p.identity : {};
  return {
    planKey: asString(p.planKey),
    seriesId: asString(id.seriesId),
    roundId: asString(id.roundId),
    matchId: asString(id.matchId),
    groupId: asString(id.groupId),
    position: Number(id.position) || 0,
    publishToken: asString(id.publishToken),
    incomingUserId: asString(id.incomingUserId),
    outgoingUserId: asString(id.outgoingUserId),
    targetAffiliationId: asString(id.targetAffiliationId),
    action: asString(id.decisionAction || p.decisionAction),
    requiresConfirmation: p.requiresConfirmation === true || asString(id.decisionAction || p.decisionAction) === DECISION_ACTION.confirm_reaffiliate,
    confirmationFingerprint: p.confirmationFingerprint == null ? '' : asString(p.confirmationFingerprint)
  };
}

function operationKinds(plan) {
  var ops = plan && Array.isArray(plan.operations) ? plan.operations : [];
  return ops.map(function (op) {
    return asString(op && op.type);
  });
}

function findOp(plan, type) {
  var ops = plan && Array.isArray(plan.operations) ? plan.operations : [];
  for (var i = 0; i < ops.length; i++) {
    if (asString(ops[i] && ops[i].type) === type) return ops[i];
  }
  return null;
}

function planImmutableSlice(plan) {
  var station = findOp(plan, planMod.OP_TYPE.replace_station_seat);
  var roster = findOp(plan, planMod.OP_TYPE.repair_series_roster_affiliation);
  return stripAudit({
    planKey: plan && plan.planKey,
    action: plan && (plan.decisionAction || (plan.identity && plan.identity.decisionAction)),
    identity: plan && plan.identity,
    operationKinds: operationKinds(plan),
    stationExpectedAfter: station
      ? {
          groups: station.groups,
          pairings: station.pairings,
          pairingCurrentIdentity: station.pairingCurrentIdentity,
          scoreIdentity: station.scoreIdentity
        }
      : null,
    roster: roster
      ? {
          rosterEntryId: roster.rosterEntryId,
          playerId: roster.playerId,
          fromSeriesParticipantId: roster.fromSeriesParticipantId,
          toSeriesParticipantId: roster.toSeriesParticipantId
        }
      : null,
    confirmationFingerprint: plan && plan.confirmationFingerprint,
    atomicScope: plan && plan.atomicScope
  });
}

function mapUnknownCode(recovery) {
  var stationReasons = (((recovery && recovery.traces) || {}).station || {}).reasons || [];
  var rosterReasons = (((recovery && recovery.traces) || {}).roster || {}).reasons || [];
  var reasons = stationReasons.concat(rosterReasons);
  if (recovery && recovery.code === 'committed_state_drift') return 'committed_state_drift';
  if (recovery && recovery.code === 'rolled_back_state_drift') return 'rolled_back_state_drift';
  if (recovery && recovery.combinedState === COMBINED.station_before_roster_after) {
    return 'station_before_roster_after';
  }
  if (reasons.indexOf('pairing_mismatch') >= 0) return 'pairing_changed';
  if (reasons.indexOf('score_identity_mismatch') >= 0) return 'score_identity_changed';
  return 'recovery_unknown';
}

function overlayTargetGroup(groups, frozenGroup, groupId) {
  var gid = asString(groupId);
  var next = Array.isArray(groups) ? deepClone(groups) : [];
  if (!frozenGroup) return next;
  var found = false;
  for (var i = 0; i < next.length; i++) {
    if (asString(next[i] && next[i].groupId) === gid) {
      next[i] = deepClone(frozenGroup);
      found = true;
    }
  }
  if (!found) next.push(deepClone(frozenGroup));
  return next;
}

function overlayPairings(matchPairings, frozenPairings, groupId) {
  var gid = asString(groupId);
  var base = matchPairings && typeof matchPairings === 'object' && !Array.isArray(matchPairings)
    ? deepClone(matchPairings)
    : {};
  base[gid] = Array.isArray(frozenPairings) ? deepClone(frozenPairings) : frozenPairings;
  return base;
}

function rosterAffiliationOf(series, playerId) {
  var pid = asString(playerId);
  var list = Array.isArray(series && series.roster) ? series.roster : [];
  var hit = '';
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e || asString(e.playerId) !== pid) continue;
    if (asString(e.registrationStatus).toLowerCase() !== 'registered') continue;
    hit = asString(e.seriesParticipantId);
  }
  return hit;
}

function checkPermission(input, series, match, round) {
  var fn = input.hasManagePermission;
  if (typeof fn === 'function') {
    var edit = !!fn({
      series: series,
      match: match,
      round: round,
      permission: 'edit_groups',
      user: input.user
    });
    var manage = !!fn({
      series: series,
      match: match,
      round: round,
      permission: 'manage_groups',
      user: input.user
    });
    return edit || manage;
  }
  try {
    var user = input.user;
    return !!(
      matchManageAccess.hasMatchManagePermission(match, user, 'edit_groups') ||
      matchManageAccess.hasMatchManagePermission(match, user, 'manage_groups')
    );
  } catch (e) {
    return false;
  }
}

function incomingElsewhere(groups, incomingUserId, groupId, position) {
  var uid = asString(incomingUserId);
  if (!uid) return false;
  var list = Array.isArray(groups) ? groups : [];
  for (var i = 0; i < list.length; i++) {
    var g = list[i] || {};
    var players = Array.isArray(g.players) ? g.players : [];
    for (var j = 0; j < players.length; j++) {
      var p = players[j];
      var pos = Number(p && (p.position != null ? p.position : p.slotIndex)) || 0;
      if (asString(g.groupId) === asString(groupId) && pos === (Number(position) || 0)) continue;
      if (playerIdOf(p) === uid) return true;
    }
  }
  return false;
}

function runSeriesLiveReplacePreflight(input) {
  var src = input && typeof input === 'object' ? input : {};
  var journal = src.journal;
  var plan = src.plan;
  var series = src.currentSeries;
  var match = src.currentMatch;
  var traces = { steps: [] };

  function finish(extra) {
    var out = Object.assign(
      {
        ok: false,
        readyToExecute: false,
        mode: MODE.blocked,
        code: '',
        recovery: null,
        evidence: null,
        decision: null,
        rebuiltPlan: null,
        traces: traces
      },
      extra || {}
    );
    out.readyToExecute = extra && extra.readyToExecute === true;
    out.traces = deepClone(out.traces || traces);
    if (out.recovery) out.recovery = deepClone(out.recovery);
    if (out.evidence) out.evidence = deepClone(out.evidence);
    if (out.decision) out.decision = deepClone(out.decision);
    if (out.rebuiltPlan) out.rebuiltPlan = deepClone(out.rebuiltPlan);
    return out;
  }

  function reject(code, extra) {
    traces.steps.push({ ok: false, code: code });
    return finish(Object.assign({ ok: false, readyToExecute: false, mode: MODE.blocked, code: code }, extra || {}));
  }

  traces.steps.push({ id: 'journal_plan_identity' });
  if (!isValidJournal(journal)) {
    return reject('journal_invalid');
  }
  if (!plan || typeof plan !== 'object' || !asString(plan.planKey)) {
    return reject('plan_invalid');
  }
  if (asString(journal.planKey) !== asString(plan.planKey)) {
    return reject('plan_key_conflict');
  }
  var ident = planIdentity(plan);
  if (
    asString(journal.seriesId) !== ident.seriesId ||
    asString(journal.roundId) !== ident.roundId ||
    asString(journal.matchId) !== ident.matchId ||
    asString(journal.groupId) !== ident.groupId ||
    (Number(journal.position) || 0) !== ident.position ||
    asString(journal.publishToken) !== ident.publishToken ||
    asString(journal.incomingUserId) !== ident.incomingUserId ||
    asString(journal.outgoingUserId) !== ident.outgoingUserId ||
    asString(journal.action) !== ident.action ||
    asString(journal.targetAffiliationId) !== ident.targetAffiliationId
  ) {
    return reject('identity_conflict');
  }
  if (journal.phase === PHASE.manual_review) {
    return reject('journal_manual_review');
  }
  if (journal.phase === PHASE.committed) {
    return reject('journal_committed');
  }
  if (journal.phase === PHASE.rolled_back) {
    return reject('journal_rolled_back');
  }
  if (ident.requiresConfirmation || journal.requiresConfirmation) {
    var accepted = asString(journal.confirmationAcceptedFingerprint);
    var journalFp = asString(journal.confirmationFingerprint);
    var planFp = ident.confirmationFingerprint;
    if (!accepted || !journalFp || !planFp) {
      return reject('confirmation_required');
    }
    if (accepted !== journalFp || journalFp !== planFp) {
      return reject('confirmation_fingerprint_conflict');
    }
  }

  traces.steps.push({ id: 'recovery' });
  var recovery = recoveryMod.inspectSeriesLiveMutationRecovery({
    journal: journal,
    currentSeries: series,
    currentMatch: match
  });
  traces.recovery = {
    combinedState: recovery.combinedState,
    recommendedAction: recovery.recommendedAction,
    stationState: recovery.stationState,
    rosterState: recovery.rosterState
  };
  if (recovery.combinedState === COMBINED.unknown || recovery.recommendedAction === REC_ACTION.manual_review) {
    if (recovery.combinedState === COMBINED.station_before_roster_after) {
      return reject('station_before_roster_after', { recovery: recovery });
    }
    var mapped = mapUnknownCode(recovery);
    if (mapped === 'recovery_unknown' && recovery.stationState === 'unknown') {
      var seatPeek = findPlayersByPosition(
        (findGroupsById(match && match.groups, journal.groupId)[0]) || {},
        journal.position
      )[0];
      if (seatPeek && playerIdOf(seatPeek) && playerIdOf(seatPeek) !== asString(journal.outgoingUserId) &&
          recovery.combinedState === COMBINED.unknown) {
        var pairingHit = ((((recovery.traces || {}).station || {}).reasons) || []).indexOf('pairing_mismatch') >= 0;
        var scoreHit = ((((recovery.traces || {}).station || {}).reasons) || []).indexOf('score_identity_mismatch') >= 0;
        if (!pairingHit && !scoreHit) mapped = 'stale_outgoing_person';
      }
    }
    return reject(mapped, { recovery: recovery });
  }
  if (recovery.combinedState === COMBINED.station_before_roster_after) {
    return reject('station_before_roster_after', { recovery: recovery });
  }
  if (recovery.code === 'committed_state_drift' || recovery.code === 'rolled_back_state_drift') {
    return reject(recovery.code, { recovery: recovery });
  }

  var phase = journal.phase;
  var combined = recovery.combinedState;
  var recAction = recovery.recommendedAction;
  var mode = MODE.blocked;
  if (isRollbackPhase(phase)) {
    return finish({
      ok: true,
      readyToExecute: false,
      mode: MODE.rollback_required,
      code: 'rollback_required',
      recovery: recovery
    });
  }

  var firstOk =
    (combined === COMBINED.all_before || combined === COMBINED.station_before) &&
    recAction === REC_ACTION.eligible_to_start_station_after_revalidation;
  var resumeOk =
    combined === COMBINED.station_after_roster_before &&
    recAction === REC_ACTION.eligible_to_resume_roster_after_revalidation &&
    !!journal.requiresRosterMutation;
  var verifyOk =
    (combined === COMBINED.all_after || combined === COMBINED.station_after) &&
    recAction === REC_ACTION.eligible_to_verify_or_commit_after_revalidation;

  if (firstOk) {
    if (phase !== PHASE.prepared && phase !== PHASE.station_writing) {
      return reject('journal_phase_mismatch', { recovery: recovery });
    }
    mode = MODE.start_station;
  } else if (resumeOk) {
    mode = MODE.resume_roster;
  } else if (verifyOk) {
    mode = MODE.verify_and_commit;
  } else {
    return reject('recovery_phase_mismatch', { recovery: recovery });
  }

  traces.steps.push({ id: 'series_round_station_identity' });
  if (!series || asString(series.seriesId) !== ident.seriesId) {
    return reject('series_identity_conflict', { recovery: recovery });
  }
  var roundHits = findRoundsById(series, ident.roundId);
  if (!roundHits.length) return reject('round_missing', { recovery: recovery });
  if (roundHits.length > 1) return reject('round_ambiguous', { recovery: recovery });
  var round = roundHits[0];
  if (asString(round.matchId) !== ident.matchId) {
    return reject('round_match_conflict', { recovery: recovery });
  }
  if (!match || typeof match !== 'object') {
    return reject('station_identity_mismatch', { recovery: recovery });
  }
  if (!seriesStationMatch.isSeriesManagedMatch(match)) {
    return reject('station_identity_mismatch', { recovery: recovery });
  }
  var ctx = match.seriesContext;
  var indexRow = src.stationIndex && typeof src.stationIndex === 'object' ? src.stationIndex : null;
  if (!indexRow) {
    return reject('index_missing', { recovery: recovery });
  }
  if (
    asString(ctx.seriesId) !== ident.seriesId ||
    asString(ctx.roundId) !== ident.roundId ||
    asString(ctx.matchId || match.matchId) !== ident.matchId ||
    asString(ctx.publishToken) !== ident.publishToken ||
    asString(match.matchId) !== ident.matchId
  ) {
    return reject('station_identity_mismatch', { recovery: recovery });
  }
  if (
    asString(indexRow.seriesId) !== ident.seriesId ||
    asString(indexRow.roundId) !== ident.roundId ||
    asString(indexRow.matchId) !== ident.matchId
  ) {
    return reject('station_identity_mismatch', { recovery: recovery });
  }
  if (indexRow.index != null && ctx.index != null && String(indexRow.index) !== String(ctx.index)) {
    return reject('station_identity_mismatch', { recovery: recovery });
  }

  traces.steps.push({ id: 'lifecycle_locks' });
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
  var groupHits = findGroupsById(match.groups, ident.groupId);
  if (!groupHits.length) return reject('target_group_missing', { recovery: recovery });
  if (groupHits.length > 1) return reject('target_group_ambiguous', { recovery: recovery });
  if (matchStatus.isGroupConfirmedFinished(groupHits[0] && groupHits[0].status)) {
    return reject('group_finished', { recovery: recovery });
  }
  if (visual && visual.state !== seriesRoundVisualState.STATE.live) {
    return reject('station_not_live', { recovery: recovery });
  }

  traces.steps.push({ id: 'permission' });
  if (!checkPermission(src, series, match, round)) {
    return reject('permission_denied', { recovery: recovery });
  }

  traces.steps.push({ id: 'seat_score_pairing' });
  var posHits = findPlayersByPosition(groupHits[0], ident.position);
  if (!posHits.length) return reject('target_seat_missing', { recovery: recovery });
  if (posHits.length > 1) return reject('target_position_ambiguous', { recovery: recovery });
  var seat = posHits[0];
  var currentUid = playerIdOf(seat);
  var expectBefore = mode === MODE.start_station;
  if (expectBefore && currentUid !== ident.outgoingUserId) {
    return reject('stale_outgoing_person', { recovery: recovery });
  }
  if (!expectBefore && currentUid !== ident.incomingUserId) {
    return reject('stale_outgoing_person', { recovery: recovery });
  }
  var frozenScore = (journal.before && journal.before.station && journal.before.station.scoreIdentitySummary) || {};
  var liveScore = pickScoreIdentity(seat, frozenScore);
  if (fingerprintOf(liveScore) !== fingerprintOf(frozenScore)) {
    return reject('score_identity_changed', { recovery: recovery });
  }
  var expectedPairings = expectBefore
    ? (journal.before && journal.before.station && journal.before.station.pairings)
    : (journal.expectedAfter && journal.expectedAfter.station && journal.expectedAfter.station.pairings);
  var livePairings = journalMod.freezeStation({
    matchId: match.matchId,
    seriesContext: ctx,
    status: match.status,
    groupId: ident.groupId,
    position: ident.position,
    group: groupHits[0],
    pairings: pairingsOf(match, ident.groupId),
    scoreEntities: [],
    scoreIdentitySummary: {}
  }).pairings;
  if (fingerprintOf(livePairings) !== fingerprintOf(expectedPairings || [])) {
    return reject('pairing_changed', { recovery: recovery });
  }
  if (incomingElsewhere(match.groups, ident.incomingUserId, ident.groupId, ident.position)) {
    return reject('incoming_already_in_round', { recovery: recovery });
  }

  traces.steps.push({ id: 'evidence' });
  var getMatchById = src.getMatchById;
  if (typeof getMatchById !== 'function') {
    return reject('evidence_incomplete', { recovery: recovery });
  }
  var getIndexByMatchId =
    typeof src.getIndexByMatchId === 'function'
      ? src.getIndexByMatchId
      : function (matchId) {
          var mid = asString(matchId);
          if (mid === asString(indexRow.matchId)) return indexRow;
          var rounds = Array.isArray(series.rounds) ? series.rounds : [];
          for (var i = 0; i < rounds.length; i++) {
            if (asString(rounds[i] && rounds[i].matchId) === mid) {
              return {
                seriesId: ident.seriesId,
                roundId: asString(rounds[i].roundId),
                matchId: mid
              };
            }
          }
          return null;
        };
  var evidence = evidenceMod.collectSeriesLiveAffiliationEvidence({
    series: series,
    playerId: ident.incomingUserId,
    currentTarget: {
      seriesId: ident.seriesId,
      roundId: ident.roundId,
      matchId: ident.matchId,
      groupId: ident.groupId,
      position: ident.position
    },
    getMatchById: getMatchById,
    getIndexByMatchId: getIndexByMatchId
  });
  if (evidence.state === STATE.affiliation_conflict) {
    return reject('affiliation_conflict', { recovery: recovery, evidence: evidence });
  }
  if (!evidence.ok || evidence.state === STATE.projection_incomplete) {
    return reject('evidence_incomplete', { recovery: recovery, evidence: evidence });
  }

  traces.steps.push({ id: 'decision' });
  if (typeof src.validateCandidate !== 'function') {
    return reject('validate_candidate_required', { recovery: recovery, evidence: evidence });
  }
  var afterLike = mode === MODE.resume_roster || mode === MODE.verify_and_commit;
  var decisionGroups = afterLike
    ? overlayTargetGroup(match.groups, journal.before && journal.before.station && journal.before.station.group, ident.groupId)
    : deepClone(match.groups);
  var decisionPairings = afterLike
    ? overlayPairings(
        match.pairings,
        journal.before && journal.before.station && journal.before.station.pairings,
        ident.groupId
      )
    : deepClone(match.pairings || {});
  var decision = decisionMod.decideSeriesLiveReplace({
    series: series,
    groups: decisionGroups,
    pairingDraft: decisionPairings,
    target: {
      seriesId: ident.seriesId,
      roundId: ident.roundId,
      matchId: ident.matchId,
      groupId: ident.groupId,
      position: ident.position,
      targetAffiliationId: ident.targetAffiliationId,
      publishToken: ident.publishToken
    },
    incomingPlayer: src.incomingPlayer,
    evidenceResult: evidence,
    rosterAffiliationId: rosterAffiliationOf(series, ident.incomingUserId),
    validateCandidate: src.validateCandidate
  });
  if (!decision.ok) {
    var dCode = asString(decision.code || decision.reason || decision.action) || 'stale_plan';
    if (decision.action === DECISION_ACTION.blocked_confirmed_lock) dCode = 'confirmed_affiliation_lock';
    if (decision.action === DECISION_ACTION.blocked_reservation) dCode = 'participation_reservation';
    return reject(dCode, { recovery: recovery, evidence: evidence, decision: decision });
  }
  if (decision.action !== ident.action) {
    return reject('stale_plan', { recovery: recovery, evidence: evidence, decision: decision });
  }
  if (asString(decision.targetAffiliationId) !== ident.targetAffiliationId) {
    return reject('stale_plan', { recovery: recovery, evidence: evidence, decision: decision });
  }

  traces.steps.push({ id: 'rebuild_plan' });
  var rebuilt = planMod.buildSeriesLiveReplacePlan({
    decision: decision,
    series: series,
    groups: decisionGroups,
    pairingDraft: decisionPairings,
    target: {
      seriesId: ident.seriesId,
      roundId: ident.roundId,
      matchId: ident.matchId,
      groupId: ident.groupId,
      position: ident.position,
      targetAffiliationId: ident.targetAffiliationId,
      publishToken: ident.publishToken
    },
    incomingPlayer: src.incomingPlayer,
    rosterAffiliationId: rosterAffiliationOf(series, ident.incomingUserId),
    stationIndex: indexRow
  });
  if (!rebuilt.ok) {
    return reject(asString(rebuilt.code || rebuilt.reason) || 'stale_plan', {
      recovery: recovery,
      evidence: evidence,
      decision: decision,
      rebuiltPlan: rebuilt
    });
  }
  if (mode !== MODE.verify_and_commit) {
    if (fingerprintOf(planImmutableSlice(rebuilt)) !== fingerprintOf(planImmutableSlice(plan))) {
      return reject('stale_plan', {
        recovery: recovery,
        evidence: evidence,
        decision: decision,
        rebuiltPlan: rebuilt
      });
    }
  }

  traces.mode = mode;
  return finish({
    ok: true,
    readyToExecute: true,
    mode: mode,
    recovery: recovery,
    evidence: evidence,
    decision: decision,
    rebuiltPlan: rebuilt
  });
}

module.exports = {
  MODE: MODE,
  runSeriesLiveReplacePreflight: runSeriesLiveReplacePreflight,
  planImmutableSlice: planImmutableSlice
};
