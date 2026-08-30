/**
 * LEGACY：真实中途换人模型。正式 group-editor LIVE 保存已改走 seriesLiveIdentityCorrection。
 * 本模块仅保留给历史 journal 恢复与隔离测试，不得再接入正式保存入口。
 */

var classifierMod = require('./seriesLiveSingleReplaceClassifier.js');
var evidenceMod = require('./seriesLiveAffiliationEvidence.js');
var decisionMod = require('./seriesLiveReplaceDecision.js');
var planMod = require('./seriesLiveReplacePlan.js');
var journalMod = require('./seriesLiveMutationJournal.js');
var batchMod = require('./seriesLiveBatchReplace.js');
var seriesFinishLock = require('../../../utils/seriesFinishLock.js');
var teamMatchFinish = require('../../../utils/teamMatchFinish.js');
var matchStatus = require('../../../utils/matchStatus.js');
var seriesRoundVisualState = require('../../../utils/seriesRoundVisualState.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function playerIdOf(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
  return asString(raw.userId) || asString(raw.playerId) || asString(raw.id);
}

function rejected(code) {
  return { ok: false, status: 'rejected', code: asString(code) };
}

function liveCandidateValidatePayload(candidateMatch, series) {
  return {
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
  };
}

function groupOccupancySig(group) {
  var players = Array.isArray(group && group.players) ? group.players : [];
  return players
    .map(function (p) {
      var pos = Number(p && (p.position != null ? p.position : p.slotIndex)) || 0;
      return String(pos) + ':' + playerIdOf(p);
    })
    .sort()
    .join('|');
}

function findRound(series, roundId) {
  var rid = asString(roundId);
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  for (var i = 0; i < rounds.length; i++) {
    if (asString(rounds[i] && rounds[i].roundId) === rid) return rounds[i];
  }
  return null;
}

function assertRearrangementWritable(src, series, match, candidateMatch, stationIndex) {
  var user = src.currentUser || src.user;
  if (typeof src.hasManagePermission !== 'function') return rejected('permission_denied');
  var allowed = !!src.hasManagePermission({
    series: series,
    match: match,
    round: findRound(series, stationIndex && stationIndex.roundId),
    permission: 'edit_groups',
    user: user
  });
  if (!allowed) {
    return rejected('permission_denied');
  }
  if (!series) return rejected('series_identity_conflict');
  var life = asString(series.lifecycleStatus).toLowerCase();
  if (life === 'cancelled' || life === 'canceled' || life === 'archived') {
    return rejected('series_locked');
  }
  var seriesLock = seriesFinishLock.assertSeriesWritable(series);
  if (!seriesLock || seriesLock.ok !== true) return rejected('series_locked');
  if (teamMatchFinish.isMatchCompleted(match)) return rejected('match_completed');
  var round = findRound(series, stationIndex && stationIndex.roundId);
  if (round) {
    var visual = seriesRoundVisualState.resolveSeriesRoundVisualState(round, match);
    if (visual && visual.state === seriesRoundVisualState.STATE.cancelled) {
      return rejected('round_cancelled');
    }
    if (visual && visual.state !== seriesRoundVisualState.STATE.live) {
      return rejected('station_not_live');
    }
  }
  var beforeById = {};
  (Array.isArray(match && match.groups) ? match.groups : []).forEach(function (g) {
    var gid = asString(g && g.groupId);
    if (gid) beforeById[gid] = g;
  });
  var afterList = Array.isArray(candidateMatch && candidateMatch.groups) ? candidateMatch.groups : [];
  for (var i = 0; i < afterList.length; i++) {
    var afterG = afterList[i];
    var gid = asString(afterG && afterG.groupId);
    var beforeG = beforeById[gid];
    if (!beforeG) continue;
    if (groupOccupancySig(beforeG) === groupOccupancySig(afterG)) continue;
    if (matchStatus.isGroupConfirmedFinished(beforeG.status) || matchStatus.isGroupConfirmedFinished(afterG && afterG.status)) {
      return rejected('group_finished');
    }
  }
  if (typeof src.validateCandidate === 'function') {
    var check = src.validateCandidate(liveCandidateValidatePayload(candidateMatch, series));
    if (check && check.ok === false) {
      return rejected(check.reason || check.code || 'invalid');
    }
  }
  return { ok: true };
}

function findSeat(groups, groupId, position) {
  var gid = asString(groupId);
  var pos = Number(position) || 0;
  var list = Array.isArray(groups) ? groups : [];
  for (var i = 0; i < list.length; i++) {
    var g = list[i];
    if (asString(g && g.groupId) !== gid) continue;
    var players = Array.isArray(g && g.players) ? g.players : [];
    for (var j = 0; j < players.length; j++) {
      var p = players[j];
      var pp = Number(p && (p.position != null ? p.position : p.slotIndex)) || 0;
      if (pp === pos) return p;
    }
  }
  return null;
}

function rosterAffiliationIdOf(series, playerId) {
  var uid = asString(playerId);
  if (!uid) return '';
  var roster = Array.isArray(series && series.roster) ? series.roster : [];
  for (var i = 0; i < roster.length; i++) {
    var row = roster[i];
    if (asString(row && row.playerId) === uid || asString(row && row.userId) === uid) {
      return asString(row && row.seriesParticipantId);
    }
  }
  return '';
}

function indexFromSeries(series, stationIndex) {
  return function getIndexByMatchId(matchId) {
    var id = asString(matchId);
    if (!id) return null;
    var idx = stationIndex && typeof stationIndex === 'object' ? stationIndex : {};
    if (asString(idx.matchId) === id) {
      return {
        seriesId: asString(idx.seriesId) || asString(series && series.seriesId),
        roundId: asString(idx.roundId),
        matchId: id
      };
    }
    var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
    for (var i = 0; i < rounds.length; i++) {
      var r = rounds[i] || {};
      if (asString(r.matchId) === id) {
        return {
          seriesId: asString(series && series.seriesId),
          roundId: asString(r.roundId),
          matchId: id
        };
      }
    }
    return null;
  };
}

function previewSeriesLiveSingleReplace(input) {
  var src = input && typeof input === 'object' ? input : {};
  var beforeMatch = src.beforeMatch;
  var candidateMatch = src.candidateMatch;
  var series = src.series;
  var stationIndex = src.stationIndex && typeof src.stationIndex === 'object' ? src.stationIndex : {};
  var incomingPlayer = src.incomingPlayer;
  var editedGroupId = src.editedGroupId;

  var classification = classifierMod.classifySeriesLiveSingleReplace({
    beforeMatch: beforeMatch,
    candidateMatch: candidateMatch,
    editedGroupId: editedGroupId
  });
  if (classifierMod.isPersistableIdentityCorrection(classification)) {
    var rosterGate = batchMod.preflightNewlyBound(series, beforeMatch, candidateMatch);
    if (!rosterGate.ok) {
      return rejected(rosterGate.code);
    }
    if (typeof src.validateCandidate === 'function') {
      var batchValid = src.validateCandidate(liveCandidateValidatePayload(candidateMatch, series));
      if (batchValid && batchValid.ok === false) {
        return rejected(batchValid.reason || batchValid.code || 'invalid');
      }
    }
    if (classification.kind === classifierMod.KIND.rearrangement) {
      return {
        ok: true,
        status: 'rearrangement_ready',
        classification: classification,
        replacementCount: 0,
        recommendedRoute: classifierMod.ROUTE.rearrangement_persist
      };
    }
    if (classification.kind !== classifierMod.KIND.single_replacement) {
      return {
        ok: true,
        status: 'batch_ready',
        classification: classification,
        replacementCount: classification.replacementCount,
        recommendedRoute: classifierMod.ROUTE.batch_persist
      };
    }
  } else {
    return rejected(classification && classification.code);
  }

  var replacement = classification.replacement || {};
  var afterSeat = findSeat(candidateMatch && candidateMatch.groups, replacement.groupId, replacement.position);
  var incomingId = playerIdOf(incomingPlayer) || asString(replacement.incomingUserId);
  var target = {
    seriesId: asString(stationIndex.seriesId) || asString(series && series.seriesId),
    roundId: asString(stationIndex.roundId),
    matchId: asString(stationIndex.matchId) || asString(beforeMatch && beforeMatch.matchId),
    groupId: asString(replacement.groupId),
    position: Number(replacement.position) || 0,
    targetAffiliationId:
      asString(stationIndex.targetAffiliationId) ||
      asString(afterSeat && afterSeat.seriesParticipantId) ||
      asString(incomingPlayer && incomingPlayer.seriesParticipantId),
    publishToken: asString(stationIndex.publishToken) || asString(series && series.publishToken)
  };
  var rosterAffiliationId = rosterAffiliationIdOf(series, incomingId);

  var evidence = evidenceMod.collectSeriesLiveAffiliationEvidence({
    series: series,
    playerId: incomingId,
    currentTarget: target,
    getMatchById: src.getMatchById,
    getIndexByMatchId: indexFromSeries(series, stationIndex)
  });

  var decision = decisionMod.decideSeriesLiveReplace({
    series: series,
    groups: beforeMatch && beforeMatch.groups,
    pairingDraft: beforeMatch && beforeMatch.pairings,
    target: target,
    incomingPlayer: incomingPlayer,
    evidenceResult: evidence,
    rosterAffiliationId: rosterAffiliationId,
    validateCandidate: src.validateCandidate
  });

  var plan = planMod.buildSeriesLiveReplacePlan({
    decision: decision,
    series: series,
    groups: beforeMatch && beforeMatch.groups,
    pairingDraft: beforeMatch && beforeMatch.pairings,
    target: target,
    incomingPlayer: incomingPlayer,
    rosterAffiliationId: rosterAffiliationId,
    stationIndex: stationIndex
  });

  if (decision && decision.ok && decision.action === decisionMod.ACTION.direct_replace) {
    return { ok: true, status: 'direct_ready', plan: plan };
  }
  if (decision && decision.ok && decision.action === decisionMod.ACTION.confirm_reaffiliate) {
    return {
      ok: true,
      status: 'confirmation_required',
      plan: plan,
      confirmationFingerprint: plan && plan.confirmationFingerprint,
      confirmationDisplay: plan && plan.confirmationDisplay
    };
  }
  return rejected((decision && (decision.code || decision.reason)) || (plan && (plan.code || plan.reason)));
}

function failPrepare(code) {
  return { ok: false, code: asString(code) || 'invalid' };
}

function hasOwn(obj, key) {
  return !!(obj && Object.prototype.hasOwnProperty.call(obj, key));
}

function opsOfType(plan, type) {
  var want = asString(type);
  var ops = plan && Array.isArray(plan.operations) ? plan.operations : [];
  var out = [];
  for (var i = 0; i < ops.length; i++) {
    if (asString(ops[i] && ops[i].type) === want) out.push(ops[i]);
  }
  return out;
}

function groupsById(groups, groupId) {
  var gid = asString(groupId);
  var list = Array.isArray(groups) ? groups : [];
  var hits = [];
  for (var i = 0; i < list.length; i++) {
    if (asString(list[i] && list[i].groupId) === gid) hits.push(list[i]);
  }
  return hits;
}

function seatsByPosition(group, position) {
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

function sliceGroupField(src, groupId) {
  var gid = asString(groupId);
  if (src == null) return [];
  if (Array.isArray(src)) return src;
  if (typeof src !== 'object') return null;
  if (hasOwn(src, gid)) {
    if (src[gid] == null) return null;
    return src[gid];
  }
  return [];
}

function assertUniquePositionPairing(list, seat) {
  var rows = Array.isArray(list) ? list : [];
  if (!rows.length) return { ok: true };
  var pairingId = asString(seat && seat.pairingId);
  var slotId = asString(seat && seat.slotId);
  if (!pairingId && !slotId) return { ok: true };
  var hits = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row || typeof row !== 'object') continue;
    var rid = asString(row.pairingId || row.id);
    var sid = asString(row.slotId);
    if ((pairingId && rid === pairingId) || (slotId && sid === slotId)) hits.push(row);
  }
  if (!hits.length) return failPrepare('pairing_snapshot_missing');
  if (hits.length > 1) return failPrepare('pairing_snapshot_missing');
  return { ok: true };
}

function ownerlessScoreTemplate(template) {
  var src = template && typeof template === 'object' ? template : {};
  var out = {};
  Object.keys(src).forEach(function (k) {
    if (k === 'scorePlayerId' || k === 'slotScorePlayerId' || k === 'scoreOwnerId') return;
    out[k] = src[k];
  });
  return out;
}

function scoreSummary(player, template) {
  var keys =
    template && typeof template === 'object' && Object.keys(template).length
      ? Object.keys(template)
      : decisionMod.SCORE_IDENTITY_KEYS;
  var src = player && typeof player === 'object' ? player : {};
  var out = {};
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (!hasOwn(src, k)) continue;
    out[k] = src[k];
  }
  return out;
}

function sameFingerprint(a, b) {
  return journalMod.fingerprintOf(a) === journalMod.fingerprintOf(b);
}

function locateUniqueGroup(groups, groupId, missingCode, ambiguousCode) {
  var hits = groupsById(groups, groupId);
  if (!hits.length) return { ok: false, code: missingCode };
  if (hits.length > 1) return { ok: false, code: ambiguousCode };
  return { ok: true, group: hits[0] };
}

function locateUniqueSeat(group, position, missingCode, ambiguousCode) {
  var hits = seatsByPosition(group, position);
  if (!hits.length) return { ok: false, code: missingCode };
  if (hits.length > 1) return { ok: false, code: ambiguousCode };
  return { ok: true, player: hits[0] };
}

function assertMatchIdentity(match, identity) {
  if (!match || typeof match !== 'object') return failPrepare('match_missing');
  if (asString(match.matchId) !== identity.matchId) return failPrepare('identity_conflict');
  var ctx = match.seriesContext && typeof match.seriesContext === 'object' ? match.seriesContext : {};
  if (asString(ctx.seriesId) !== identity.seriesId) return failPrepare('identity_conflict');
  if (asString(ctx.roundId) !== identity.roundId) return failPrepare('identity_conflict');
  if (asString(ctx.matchId) && asString(ctx.matchId) !== identity.matchId) return failPrepare('identity_conflict');
  if (asString(ctx.publishToken) !== identity.publishToken) return failPrepare('identity_conflict');
  return null;
}

function freezeBeforeStation(match, identity, scoreTemplate) {
  var identErr = assertMatchIdentity(match, identity);
  if (identErr) return identErr;
  var groupRes = locateUniqueGroup(match.groups, identity.groupId, 'target_group_missing', 'target_group_ambiguous');
  if (!groupRes.ok) return failPrepare(groupRes.code);
  var seatRes = locateUniqueSeat(
    groupRes.group,
    identity.position,
    'target_position_missing',
    'target_position_ambiguous'
  );
  if (!seatRes.ok) return failPrepare(seatRes.code);
  if (playerIdOf(seatRes.player) !== identity.outgoingUserId) {
    return failPrepare('stale_outgoing_person');
  }
  var techTemplate = ownerlessScoreTemplate(scoreTemplate);
  var currentScore = scoreSummary(seatRes.player, techTemplate);
  if (techTemplate && Object.keys(techTemplate).length && !sameFingerprint(currentScore, techTemplate)) {
    return failPrepare('score_identity_changed');
  }
  return {
    ok: true,
    station: journalMod.freezeStation({
      matchId: match.matchId,
      seriesContext: match.seriesContext,
      status: match.status,
      groupId: identity.groupId,
      position: identity.position,
      group: groupRes.group,
      pairings: sliceGroupField(match.pairings, identity.groupId),
      scoreEntities: sliceGroupField(match.scoreEntities, identity.groupId),
      scoreIdentitySummary: currentScore
    })
  };
}

function freezeAfterStation(match, identity, stationOp) {
  var identErr = assertMatchIdentity(match, identity);
  if (identErr) return identErr;
  if (asString(stationOp.groupId) !== identity.groupId || Number(stationOp.position) !== Number(identity.position)) {
    return failPrepare('identity_conflict');
  }
  var groupRes = locateUniqueGroup(
    stationOp.groups,
    identity.groupId,
    'replacement_snapshot_missing',
    'target_group_ambiguous'
  );
  if (!groupRes.ok) return failPrepare(groupRes.code);
  var seatRes = locateUniqueSeat(
    groupRes.group,
    identity.position,
    'replacement_snapshot_missing',
    'target_position_ambiguous'
  );
  if (!seatRes.ok) return failPrepare(seatRes.code);
  if (playerIdOf(seatRes.player) !== identity.incomingUserId) {
    return failPrepare('incoming_person_mismatch');
  }
  var afterScore = stationOp.scoreIdentity
    ? scoreSummary(seatRes.player, stationOp.scoreIdentity)
    : scoreSummary(seatRes.player, stationOp.replacementSeat && stationOp.replacementSeat.scoreIdentity);
  if (stationOp.scoreIdentity && !sameFingerprint(afterScore, stationOp.scoreIdentity)) {
    return failPrepare('score_identity_changed');
  }
  if (
    stationOp.replacementSeat &&
    stationOp.replacementSeat.scoreIdentity &&
    !sameFingerprint(afterScore, stationOp.replacementSeat.scoreIdentity)
  ) {
    return failPrepare('score_identity_changed');
  }
  var pairings = sliceGroupField(stationOp.pairings, identity.groupId);
  if (pairings == null) {
    pairings = sliceGroupField(match && match.pairings, identity.groupId);
  }
  if (pairings == null) return failPrepare('pairing_snapshot_missing');
  var pairGuard = assertUniquePositionPairing(pairings, seatRes.player);
  if (!pairGuard.ok) return pairGuard;
  var entities = hasOwn(stationOp, 'scoreEntities')
    ? sliceGroupField(stationOp.scoreEntities, identity.groupId)
    : [];
  return {
    ok: true,
    station: journalMod.freezeStation({
      matchId: identity.matchId,
      seriesContext: match.seriesContext,
      status: match.status,
      groupId: identity.groupId,
      position: identity.position,
      group: groupRes.group,
      pairings: pairings,
      scoreEntities: entities,
      scoreIdentitySummary: afterScore
    })
  };
}

function freezeRosterPair(series, rosterOp) {
  if (!series || typeof series !== 'object') return failPrepare('series_missing');
  var wantId = asString(rosterOp.rosterEntryId);
  if (!wantId) return failPrepare('roster_entry_id_required');
  var list = Array.isArray(series.roster) ? series.roster : [];
  var hits = [];
  for (var i = 0; i < list.length; i++) {
    if (asString(list[i] && list[i].rosterEntryId) === wantId) hits.push(list[i]);
  }
  if (!hits.length) return failPrepare('registered_roster_entry_missing');
  if (hits.length > 1) return failPrepare('registered_roster_entry_ambiguous');
  var row = hits[0];
  if (asString(row.playerId) !== asString(rosterOp.playerId)) {
    return failPrepare('roster_player_conflict');
  }
  if (asString(row.registrationStatus).toLowerCase() !== 'registered') {
    return failPrepare('roster_status_conflict');
  }
  if (asString(row.seriesParticipantId) !== asString(rosterOp.fromSeriesParticipantId)) {
    return failPrepare('roster_from_conflict');
  }
  var beforeRaw = {
    rosterEntryId: row.rosterEntryId,
    playerId: row.playerId,
    registrationStatus: row.registrationStatus,
    seriesParticipantId: row.seriesParticipantId,
    registrationRevision: series.registrationRevision,
    lifecycleStatus: series.lifecycleStatus
  };
  var afterRaw = {
    rosterEntryId: row.rosterEntryId,
    playerId: row.playerId,
    registrationStatus: row.registrationStatus,
    seriesParticipantId: rosterOp.toSeriesParticipantId,
    registrationRevision: series.registrationRevision,
    lifecycleStatus: series.lifecycleStatus
  };
  return {
    ok: true,
    before: journalMod.freezeRoster(beforeRaw),
    expectedAfter: journalMod.freezeRoster(afterRaw)
  };
}

function buildSeriesLiveSingleReplaceJournalInput(input) {
  var src = input && typeof input === 'object' ? input : {};
  var plan = src.plan;
  if (!plan || typeof plan !== 'object') return failPrepare('plan_invalid');
  var identity = plan.identity && typeof plan.identity === 'object' ? plan.identity : {};
  var ident = {
    seriesId: asString(identity.seriesId),
    roundId: asString(identity.roundId),
    matchId: asString(identity.matchId),
    groupId: asString(identity.groupId),
    position: Number(identity.position) || 0,
    publishToken: asString(identity.publishToken),
    incomingUserId: asString(identity.incomingUserId),
    outgoingUserId: asString(identity.outgoingUserId),
    decisionAction: asString(identity.decisionAction || plan.decisionAction)
  };
  if (!ident.seriesId || !ident.roundId || !ident.matchId || !ident.groupId || !ident.position) {
    return failPrepare('identity_conflict');
  }
  if (!ident.outgoingUserId || !ident.incomingUserId) return failPrepare('identity_conflict');

  var requiresConfirmation =
    plan.requiresConfirmation === true || ident.decisionAction === decisionMod.ACTION.confirm_reaffiliate;
  var prepareInput = {
    plan: plan,
    before: {},
    expectedAfter: {}
  };
  if (requiresConfirmation) {
    var accepted = asString(src.confirmationAcceptedFingerprint);
    var expectedFp = asString(plan.confirmationFingerprint);
    if (!accepted) return failPrepare('confirmation_required');
    if (!expectedFp || accepted !== expectedFp) return failPrepare('confirmation_fingerprint_conflict');
    prepareInput.confirmation = { confirmationAcceptedFingerprint: accepted };
  }

  var stationOps = opsOfType(plan, planMod.OP_TYPE.replace_station_seat);
  if (!stationOps.length) return failPrepare('station_operation_missing');
  if (stationOps.length > 1) return failPrepare('station_operation_duplicate');

  var rosterOps = opsOfType(plan, planMod.OP_TYPE.repair_series_roster_affiliation);
  if (rosterOps.length > 1) return failPrepare('roster_operation_duplicate');

  var beforeStation = freezeBeforeStation(src.currentMatch, ident, stationOps[0].scoreIdentity);
  if (!beforeStation.ok) return beforeStation;
  var afterStation = freezeAfterStation(src.currentMatch, ident, stationOps[0]);
  if (!afterStation.ok) return afterStation;

  prepareInput.before.station = beforeStation.station;
  prepareInput.expectedAfter.station = afterStation.station;

  if (rosterOps.length === 1) {
    var rosterPair = freezeRosterPair(src.currentSeries, rosterOps[0]);
    if (!rosterPair.ok) return rosterPair;
    prepareInput.before.roster = rosterPair.before;
    prepareInput.expectedAfter.roster = rosterPair.expectedAfter;
  }

  return { ok: true, prepareInput: prepareInput };
}

function unwrapJournal(res) {
  if (!res) return { ok: false, journal: null };
  if (res.journal) {
    return { ok: res.ok !== false, reason: res.reason, alreadyCommitted: !!res.alreadyCommitted, idempotent: !!res.idempotent, journal: res.journal };
  }
  if (res.ok === false) return { ok: false, reason: res.reason, journal: null };
  if (res.planKey && res.phase) return { ok: true, journal: res };
  return { ok: res.ok !== false, reason: res.reason || 'absent', journal: null };
}

function contextField(ctx, names) {
  var src = ctx && typeof ctx === 'object' ? ctx : {};
  for (var i = 0; i < names.length; i++) {
    if (src[names[i]] != null) return src[names[i]];
  }
  return null;
}

function finishPrepared(plan, journalRes) {
  var wrapped = unwrapJournal(journalRes);
  var journal = wrapped.journal;
  if (wrapped.alreadyCommitted || (journal && journal.phase === journalMod.PHASE.committed)) {
    return {
      ok: true,
      status: 'already_committed',
      plan: plan,
      planKey: journal && journal.planKey,
      journalAttemptKey: journal && journal.journalAttemptKey,
      attemptNumber: journal && journal.attemptNumber,
      idempotent: true
    };
  }
  if (!wrapped.ok || !journal) {
    return {
      ok: false,
      status: 'rejected',
      code: asString(wrapped.reason) || 'journal_prepare_failed',
      plan: plan
    };
  }
  if (journal.phase === journalMod.PHASE.manual_review) {
    return {
      ok: false,
      status: 'manual_review',
      plan: plan,
      planKey: journal.planKey,
      journalAttemptKey: journal.journalAttemptKey,
      attemptNumber: journal.attemptNumber
    };
  }
  return {
    ok: true,
    status: 'prepared',
    plan: plan,
    planKey: journal.planKey,
    journalAttemptKey: journal.journalAttemptKey,
    attemptNumber: journal.attemptNumber,
    idempotent: !!wrapped.idempotent
  };
}

function prepareSeriesLiveSingleReplaceExecution(input) {
  var src = input && typeof input === 'object' ? input : {};
  if (typeof src.reloadContext !== 'function') {
    return { ok: false, status: 'rejected', code: 'reload_context_required' };
  }
  if (typeof src.buildCandidateFromLatestMatch !== 'function') {
    return { ok: false, status: 'rejected', code: 'rebuild_candidate_required' };
  }

  var ctx = src.reloadContext() || {};
  var latestSeries = contextField(ctx, ['series', 'latestSeries', 'currentSeries']);
  var latestMatch = contextField(ctx, ['match', 'latestMatch', 'currentMatch', 'beforeMatch']);
  var stationIndex = contextField(ctx, ['stationIndex']) || {};
  var incomingPlayer = contextField(ctx, ['incomingPlayer']);
  var getMatchById = contextField(ctx, ['getMatchById']);
  var editedGroupId = src.editedGroupId || contextField(ctx, ['editedGroupId']);
  var candidateMatch = src.buildCandidateFromLatestMatch(latestMatch, src.currentDraft);

  var preview = previewSeriesLiveSingleReplace({
    beforeMatch: latestMatch,
    candidateMatch: candidateMatch,
    editedGroupId: editedGroupId,
    series: latestSeries,
    stationIndex: stationIndex,
    incomingPlayer: incomingPlayer,
    getMatchById: getMatchById,
    validateCandidate: src.validateCandidate
  });

  if (!preview || preview.status === 'rejected' || preview.ok === false) {
    return {
      ok: false,
      status: 'rejected',
      code: preview && preview.code
    };
  }

  if (preview.status === 'rearrangement_ready') {
    var gate = assertRearrangementWritable(src, latestSeries, latestMatch, candidateMatch, stationIndex);
    if (!gate || gate.ok !== true) {
      return {
        ok: false,
        status: 'rejected',
        code: gate && gate.code
      };
    }
    return {
      ok: true,
      status: 'rearrangement_prepared',
      classification: preview.classification,
      candidateMatch: candidateMatch,
      beforeMatch: latestMatch,
      replacementCount: 0
    };
  }

  if (preview.status === 'batch_ready') {
    var batchGate = assertRearrangementWritable(src, latestSeries, latestMatch, candidateMatch, stationIndex);
    if (!batchGate || batchGate.ok !== true) {
      return {
        ok: false,
        status: 'rejected',
        code: batchGate && batchGate.code
      };
    }
    return {
      ok: true,
      status: 'batch_prepared',
      classification: preview.classification,
      candidateMatch: candidateMatch,
      beforeMatch: latestMatch,
      series: latestSeries,
      stationIndex: stationIndex,
      replacementCount: preview.replacementCount
    };
  }

  var accepted = asString(src.acceptedConfirmationFingerprint);
  if (preview.status === 'confirmation_required') {
    if (!accepted) {
      return {
        ok: preview.ok !== false,
        status: 'confirmation_required',
        plan: preview.plan,
        confirmationFingerprint: preview.confirmationFingerprint,
        confirmationDisplay: preview.confirmationDisplay
      };
    }
    if (accepted !== asString(preview.plan && preview.plan.confirmationFingerprint)) {
      return {
        ok: false,
        status: 'stale_confirmation',
        code: 'confirmation_fingerprint_conflict',
        plan: preview.plan
      };
    }
  }

  var latestPlan = preview.plan;
  var built = buildSeriesLiveSingleReplaceJournalInput({
    plan: latestPlan,
    currentSeries: latestSeries,
    currentMatch: latestMatch,
    confirmationAcceptedFingerprint: preview.status === 'confirmation_required' ? accepted : undefined
  });
  if (!built || !built.ok) {
    return {
      ok: false,
      status: 'rejected',
      code: built && built.code,
      plan: latestPlan
    };
  }

  var planKey = asString(latestPlan && latestPlan.planKey);
  var existingWrap = unwrapJournal(typeof src.getJournal === 'function' ? src.getJournal(planKey) : null);
  var existing = existingWrap.journal;
  var phase = existing && existing.phase;

  if (phase === journalMod.PHASE.manual_review) {
    return {
      ok: false,
      status: 'manual_review',
      plan: latestPlan,
      planKey: existing.planKey,
      journalAttemptKey: existing.journalAttemptKey,
      attemptNumber: existing.attemptNumber
    };
  }

  if (phase === journalMod.PHASE.rolled_back) {
    if (typeof src.inspectRecovery !== 'function') {
      return { ok: false, status: 'retry_not_safe', code: 'recovery_inspect_required', plan: latestPlan };
    }
    var recovery = src.inspectRecovery({
      journal: existing,
      currentSeries: latestSeries,
      currentMatch: latestMatch
    }) || {};
    var action = asString(recovery.recommendedAction || recovery.action);
    if (action !== 'idempotent_rolled_back') {
      return {
        ok: false,
        status: action === 'manual_review' ? 'manual_review' : 'retry_not_safe',
        code: recovery.code,
        plan: latestPlan,
        planKey: existing.planKey,
        journalAttemptKey: existing.journalAttemptKey,
        attemptNumber: existing.attemptNumber
      };
    }
    if (typeof src.prepareNextAttemptAfterRollback !== 'function') {
      return { ok: false, status: 'rejected', code: 'prepare_next_attempt_required', plan: latestPlan };
    }
    var nextRes = src.prepareNextAttemptAfterRollback(
      Object.assign({}, built.prepareInput, { recovery: recovery })
    );
    return finishPrepared(latestPlan, nextRes);
  }

  if (typeof src.prepareJournal !== 'function') {
    return { ok: false, status: 'rejected', code: 'prepare_journal_required', plan: latestPlan };
  }
  var prepared = src.prepareJournal(built.prepareInput);
  return finishPrepared(latestPlan, prepared);
}

var PREPARE_PASS_THROUGH = {
  rejected: true,
  confirmation_required: true,
  stale_confirmation: true,
  manual_review: true,
  retry_not_safe: true
};

function invalidFlow(extra) {
  return Object.assign(
    { ok: false, status: 'flow_result_invalid', code: 'flow_result_invalid' },
    extra || {}
  );
}

function mergeForwardInput(src, prepared) {
  var adapters = src.storeAdapters && typeof src.storeAdapters === 'object' ? src.storeAdapters : {};
  return Object.assign({}, adapters, {
    plan: prepared.plan,
    planKey: prepared.planKey,
    journalAttemptKey: prepared.journalAttemptKey,
    currentUser: src.currentUser,
    hasManagePermission: src.hasManagePermission,
    validateCandidate: src.validateCandidate
  });
}

function mergeRollbackInput(src, prepared) {
  var adapters = src.storeAdapters && typeof src.storeAdapters === 'object' ? src.storeAdapters : {};
  return Object.assign({}, adapters, {
    planKey: prepared.planKey,
    journalAttemptKey: prepared.journalAttemptKey,
    currentUser: src.currentUser,
    hasManagePermission: src.hasManagePermission
  });
}

function mapRollback(prepared, forward, rollbackRes) {
  if (!rollbackRes || typeof rollbackRes !== 'object') {
    return invalidFlow({
      forwardCode: forward && forward.code,
      planKey: prepared.planKey,
      journalAttemptKey: prepared.journalAttemptKey
    });
  }
  if (rollbackRes.ok === true && asString(rollbackRes.journalPhase) === journalMod.PHASE.rolled_back) {
    return {
      ok: false,
      status: 'failed_rolled_back',
      rollbackCompleted: true,
      planKey: prepared.planKey,
      journalAttemptKey: prepared.journalAttemptKey,
      code: forward && forward.code
    };
  }
  return {
    ok: false,
    status: 'manual_review',
    requiresManualReview: true,
    forwardCode: forward && forward.code,
    rollbackCode: rollbackRes.code,
    planKey: prepared.planKey,
    journalAttemptKey: prepared.journalAttemptKey
  };
}

function executeSeriesLiveSingleReplaceFlow(input) {
  var src = input && typeof input === 'object' ? input : {};
  try {
    if (typeof src.reloadContext === 'function') {
      var recCtx = src.reloadContext() || {};
      var recSeries = contextField(recCtx, ['series', 'latestSeries', 'currentSeries']);
      var recMatch = contextField(recCtx, ['match', 'latestMatch', 'currentMatch', 'beforeMatch']);
      var recIndex = contextField(recCtx, ['stationIndex']) || {};
      batchMod.recoverIncompleteLiveBatchMutations({
        matchId: asString(recMatch && recMatch.matchId) || asString(recIndex.matchId),
        seriesId: asString(recSeries && recSeries.seriesId) || asString(recIndex.seriesId),
        roundId: asString(recIndex.roundId),
        persistMatch: src.persistMatch,
        persistSeries: src.persistSeries,
        getMatchById: src.getMatchById,
        getSeriesById:
          src.getSeriesById ||
          function (id) {
            if (recSeries && asString(recSeries.seriesId) === asString(id)) return recSeries;
            return null;
          },
        journalApi: src.journalApi,
        listUnfinishedJournals: src.listUnfinishedJournals
      });
      var journalApi = src.journalApi || journalMod;
      var blockMatchId = asString(recMatch && recMatch.matchId) || asString(recIndex.matchId);
      if (blockMatchId && typeof journalApi.listBlockingBatchJournals === 'function') {
        var blocked = journalApi.listBlockingBatchJournals(blockMatchId);
        var rows = (blocked && blocked.journals) || [];
        for (var bi = 0; bi < rows.length; bi++) {
          if (rows[bi].phase === journalMod.PHASE.recovery_conflict) continue;
          return { ok: false, status: 'rejected', code: 'incomplete_batch_exists' };
        }
      }
    }
  } catch (eRec) {
    if (eRec && eRec.processCrash) throw eRec;
    /* 恢复失败不得阻断后续单人路径；rollback_failed 保留在 journal */
  }
  var prepared;
  try {
    prepared = prepareSeriesLiveSingleReplaceExecution(src);
  } catch (ePrep) {
    return { ok: false, status: 'flow_prepare_failed', code: 'flow_prepare_failed' };
  }
  if (!prepared || typeof prepared !== 'object' || !asString(prepared.status)) {
    return invalidFlow();
  }
  if (PREPARE_PASS_THROUGH[prepared.status]) {
    return prepared;
  }
  if (prepared.status === 'rearrangement_prepared') {
    if (typeof src.persistMatch !== 'function') {
      return { ok: false, status: 'failed_before_write', code: 'persist_match_required' };
    }
    var persistRes;
    try {
      persistRes = src.persistMatch(prepared.candidateMatch, prepared.beforeMatch);
    } catch (ePersist) {
      try {
        src.persistMatch(prepared.beforeMatch, prepared.beforeMatch);
      } catch (eRestore) {
        return {
          ok: false,
          status: 'manual_review',
          requiresManualReview: true,
          code: 'rearrangement_persist_throw'
        };
      }
      return {
        ok: false,
        status: 'failed_rolled_back',
        rollbackCompleted: true,
        code: 'rearrangement_persist_throw'
      };
    }
    if (persistRes && persistRes.ok === true) {
      return {
        ok: true,
        status: 'completed',
        replacementCount: 0,
        recommendedRoute: classifierMod.ROUTE.rearrangement_persist
      };
    }
    return {
      ok: false,
      status: persistRes && persistRes.reason === 'save_failed' ? 'failed_before_write' : 'failed_before_write',
      code: (persistRes && persistRes.reason) || 'save_failed'
    };
  }
  if (prepared.status === 'batch_prepared') {
    var batchOut = batchMod.executeBatchReplace({
      classification: prepared.classification,
      beforeMatch: prepared.beforeMatch,
      candidateMatch: prepared.candidateMatch,
      series: prepared.series,
      stationIndex: prepared.stationIndex,
      persistMatch: src.persistMatch,
      persistSeries: src.persistSeries,
      writeBatchJournal: src.writeBatchJournal,
      writePreparedBatchJournal: src.writePreparedBatchJournal,
      journalApi: src.journalApi,
      getSeriesById: src.getSeriesById,
      listUnfinishedJournals: src.listUnfinishedJournals,
      __crashAfter: src.__crashAfter,
      getMatchById: src.getMatchById || (src.reloadContext && function () {
        var ctx = src.reloadContext() || {};
        return ctx.match || ctx.latestMatch;
      }),
      validateCandidate: src.validateCandidate
    });
    return batchOut;
  }
  if (prepared.status === 'already_committed') {
    return {
      ok: true,
      status: 'completed',
      idempotent: true,
      planKey: prepared.planKey,
      journalAttemptKey: prepared.journalAttemptKey
    };
  }
  if (prepared.status !== 'prepared') {
    return invalidFlow({ code: prepared.status, plan: prepared.plan });
  }

  if (typeof src.executeForward !== 'function') {
    return invalidFlow({ code: 'execute_forward_required', planKey: prepared.planKey });
  }

  var forward;
  try {
    forward = src.executeForward(mergeForwardInput(src, prepared));
  } catch (eFwd) {
    return {
      ok: false,
      status: 'manual_review',
      requiresManualReview: true,
      code: 'flow_forward_throw',
      planKey: prepared.planKey,
      journalAttemptKey: prepared.journalAttemptKey
    };
  }
  if (!forward || typeof forward !== 'object') {
    return invalidFlow({
      planKey: prepared.planKey,
      journalAttemptKey: prepared.journalAttemptKey
    });
  }

  if (forward.ok === true && asString(forward.journalPhase) === journalMod.PHASE.committed) {
    return {
      ok: true,
      status: 'completed',
      idempotent: !!forward.idempotent,
      planKey: prepared.planKey,
      journalAttemptKey: prepared.journalAttemptKey
    };
  }
  if (forward.requiresManualReview === true || asString(forward.journalPhase) === journalMod.PHASE.manual_review) {
    return {
      ok: false,
      status: 'manual_review',
      requiresManualReview: true,
      code: forward.code,
      planKey: prepared.planKey,
      journalAttemptKey: prepared.journalAttemptKey
    };
  }
  if (forward.requiresRollback === true) {
    if (typeof src.executeRollback !== 'function') {
      return {
        ok: false,
        status: 'manual_review',
        requiresManualReview: true,
        forwardCode: forward.code,
        rollbackCode: 'execute_rollback_required',
        planKey: prepared.planKey,
        journalAttemptKey: prepared.journalAttemptKey
      };
    }
    var rollbackRes;
    try {
      rollbackRes = src.executeRollback(mergeRollbackInput(src, prepared));
    } catch (eRb) {
      return {
        ok: false,
        status: 'manual_review',
        requiresManualReview: true,
        forwardCode: forward.code,
        rollbackCode: 'flow_rollback_throw',
        planKey: prepared.planKey,
        journalAttemptKey: prepared.journalAttemptKey
      };
    }
    return mapRollback(prepared, forward, rollbackRes);
  }
  if (forward.ok === false) {
    return {
      ok: false,
      status: 'failed_before_write',
      code: forward.code,
      planKey: prepared.planKey,
      journalAttemptKey: prepared.journalAttemptKey
    };
  }
  return {
    ok: false,
    status: 'manual_review',
    requiresManualReview: true,
    code: forward.code || 'flow_result_invalid',
    planKey: prepared.planKey,
    journalAttemptKey: prepared.journalAttemptKey
  };
}

module.exports = {
  previewSeriesLiveSingleReplace: previewSeriesLiveSingleReplace,
  buildSeriesLiveSingleReplaceJournalInput: buildSeriesLiveSingleReplaceJournalInput,
  prepareSeriesLiveSingleReplaceExecution: prepareSeriesLiveSingleReplaceExecution,
  executeSeriesLiveSingleReplaceFlow: executeSeriesLiveSingleReplaceFlow
};
