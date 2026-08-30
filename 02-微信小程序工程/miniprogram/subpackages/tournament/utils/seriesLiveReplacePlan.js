/**
 * Series LIVE 换人：原子变更计划（只生成、不执行）
 * - 不读不写 storage / journal
 * - 不调用 saveSeries / saveMatch / saveStationGroups
 * - 不改变 decideSeriesLiveReplace 语义
 */

var decisionMod = require('./seriesLiveReplaceDecision.js');

var ACTION = decisionMod.ACTION;
var SCORE_IDENTITY_KEYS = decisionMod.SCORE_IDENTITY_KEYS;
var AFFILIATION_SNAPSHOT_KEYS = decisionMod.AFFILIATION_SNAPSHOT_KEYS;

var PLAN_STATUS = {
  ready: 'ready',
  awaiting_confirmation: 'awaiting_confirmation',
  blocked: 'blocked'
};

var OP_TYPE = {
  replace_station_seat: 'replace_station_seat',
  repair_series_roster_affiliation: 'repair_series_roster_affiliation'
};

var BLOCK_CODE = {
  stale_outgoing_person: 'stale_outgoing_person',
  score_identity_changed: 'score_identity_changed',
  pairing_changed: 'pairing_changed',
  target_affiliation_id_required: 'target_affiliation_id_required',
  publish_token_missing: 'publish_token_missing',
  current_target_identity_incomplete: 'current_target_identity_incomplete',
  stale_plan: 'stale_plan',
  incoming_user_id_required: 'incoming_user_id_required',
  outgoing_user_id_required: 'outgoing_user_id_required',
  replacement_snapshot_missing: 'replacement_snapshot_missing',
  registered_roster_entry_missing: 'registered_roster_entry_missing',
  registered_roster_entry_ambiguous: 'registered_roster_entry_ambiguous',
  roster_entry_id_required: 'roster_entry_id_required'
};

var ROSTER_WRITE_KEYS = [
  'rosterEntryId',
  'playerId',
  'fromSeriesParticipantId',
  'toSeriesParticipantId'
];

var SEAT_AFFILIATION_PROJECTION_KEYS = AFFILIATION_SNAPSHOT_KEYS.slice();

var LOCK_PRECONDITION_IDS = [
  'target_group_not_confirmed_finished',
  'station_match_not_completed',
  'round_not_cancelled',
  'series_not_completed_cancelled_or_archived',
  'manager_has_edit_groups_permission'
];

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

function hasOwn(obj, key) {
  return !!(obj && Object.prototype.hasOwnProperty.call(obj, key));
}

function findGroup(groups, groupId) {
  var gid = asString(groupId);
  var list = Array.isArray(groups) ? groups : [];
  for (var i = 0; i < list.length; i++) {
    if (asString(list[i] && list[i].groupId) === gid) return list[i];
  }
  return null;
}

function findSeat(groups, groupId, position) {
  var group = findGroup(groups, groupId);
  if (!group) return { group: null, player: null };
  var pos = Number(position) || 0;
  var players = Array.isArray(group.players) ? group.players : [];
  for (var i = 0; i < players.length; i++) {
    var p = players[i];
    var pp = Number(p && (p.position != null ? p.position : p.slotIndex)) || 0;
    if (pp === pos) return { group: group, player: p };
  }
  return { group: group, player: null };
}

function resolveParticipantKind(series) {
  return asString(series && series.hostMode) === 'team' ? 'division' : 'team';
}

function findParticipant(series, affiliationId) {
  var key = asString(affiliationId);
  if (!key) return null;
  var kind = resolveParticipantKind(series);
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (!p || typeof p !== 'object') continue;
    var pKind = asString(p.kind) || kind;
    if (pKind && pKind !== kind) continue;
    var sid = asString(p.seriesParticipantId);
    var sourceTeamId = asString(p.sourceTeamId) || asString(p.teamId);
    var divisionId = asString(p.divisionId);
    if (sid === key) return p;
    if (kind === 'division' && divisionId && divisionId === key) return p;
    if (kind !== 'division' && sourceTeamId && sourceTeamId === key) return p;
  }
  return null;
}

function pickPresentScoreIdentity(seat) {
  var src = seat && typeof seat === 'object' ? seat : {};
  var out = {};
  for (var i = 0; i < SCORE_IDENTITY_KEYS.length; i++) {
    var k = SCORE_IDENTITY_KEYS[i];
    if (!hasOwn(src, k)) continue;
    out[k] = src[k];
  }
  return out;
}

function currentIdentityOf(person) {
  var uid = playerIdOf(person);
  var src = person && typeof person === 'object' ? person : {};
  var out = { userId: uid };
  if (hasOwn(src, 'playerId')) out.playerId = src.playerId;
  if (hasOwn(src, 'id')) out.id = src.id;
  return out;
}

function joinKey(parts) {
  return parts
    .map(function (p) {
      return asString(p);
    })
    .join('\u001f');
}

function buildPlanKey(identity) {
  return joinKey([
    identity.seriesId,
    identity.roundId,
    identity.matchId,
    identity.groupId,
    identity.position,
    identity.outgoingUserId,
    identity.incomingUserId,
    identity.publishToken
  ]);
}

function buildConfirmationFingerprint(identity, planKey) {
  return joinKey([
    planKey,
    identity.incomingUserId,
    identity.targetAffiliationId,
    identity.roundId,
    identity.matchId,
    identity.groupId,
    identity.position,
    identity.publishToken
  ]);
}

function blockedPlan(extra) {
  return Object.assign(
    {
      ok: false,
      planStatus: PLAN_STATUS.blocked,
      requiresConfirmation: false,
      executable: false,
      operations: [],
      planKey: '',
      confirmationFingerprint: null,
      identity: null,
      preconditions: [],
      atomicScope: null,
      reason: '',
      code: ''
    },
    extra || {}
  );
}

function isBlockedDecisionAction(action) {
  return (
    action === ACTION.invalid ||
    action === ACTION.blocked ||
    action === ACTION.blocked_reservation ||
    action === ACTION.blocked_confirmed_lock
  );
}

function pairingStableList(pairings, groupId) {
  var gid = asString(groupId);
  var list;
  if (Array.isArray(pairings)) list = pairings;
  else if (pairings && typeof pairings === 'object' && hasOwn(pairings, gid)) list = pairings[gid];
  else list = [];
  if (!Array.isArray(list)) return [];
  return list.map(function (p) {
    var row = {};
    if (p && hasOwn(p, 'id')) row.id = p.id;
    if (p && hasOwn(p, 'pairingId')) row.pairingId = p.pairingId;
    if (p && hasOwn(p, 'slotId')) row.slotId = p.slotId;
    if (p && hasOwn(p, 'entityId')) row.entityId = p.entityId;
    if (p && Array.isArray(p.playerIds)) row.playerIds = p.playerIds.slice();
    return row;
  });
}

function participantDisplaySnapshot(part) {
  if (!part || typeof part !== 'object') {
    return {
      name: '',
      shortName: '',
      color: '',
      notUsedForRosterWrite: true
    };
  }
  var name =
    asString(part.nameSnapshot) ||
    asString(part.fullNameSnapshot) ||
    asString(part.shortNameSnapshot) ||
    asString(part.seriesParticipantId);
  return {
    name: name,
    shortName: asString(part.shortNameSnapshot) || name,
    color: asString(part.colorSnapshot),
    notUsedForRosterWrite: true
  };
}

function pickSeatAffiliationProjection(seat) {
  var src = seat && typeof seat === 'object' ? seat : {};
  var out = {};
  for (var i = 0; i < SEAT_AFFILIATION_PROJECTION_KEYS.length; i++) {
    var k = SEAT_AFFILIATION_PROJECTION_KEYS[i];
    if (!hasOwn(src, k)) continue;
    out[k] = src[k];
  }
  return out;
}

function isRegisteredRosterStatus(status) {
  return asString(status).toLowerCase() === 'registered';
}

function listRegisteredRosterEntriesForPlayer(series, playerId) {
  var pid = asString(playerId);
  var list = Array.isArray(series && series.roster) ? series.roster : [];
  var hits = [];
  if (!pid) return hits;
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e || typeof e !== 'object') continue;
    if (!isRegisteredRosterStatus(e.registrationStatus)) continue;
    if (asString(e.playerId) !== pid) continue;
    hits.push(e);
  }
  return hits;
}

function resolveRegisteredRosterEntry(series, playerId) {
  var hits = listRegisteredRosterEntriesForPlayer(series, playerId);
  if (!hits.length) {
    return { ok: false, reason: BLOCK_CODE.registered_roster_entry_missing };
  }
  if (hits.length > 1) {
    return { ok: false, reason: BLOCK_CODE.registered_roster_entry_ambiguous };
  }
  var entry = hits[0];
  var rosterEntryId = asString(entry.rosterEntryId);
  if (!rosterEntryId) {
    return { ok: false, reason: BLOCK_CODE.roster_entry_id_required };
  }
  return {
    ok: true,
    entry: entry,
    rosterEntryId: rosterEntryId,
    playerId: asString(entry.playerId),
    fromSeriesParticipantId: asString(entry.seriesParticipantId)
  };
}

function buildPreconditions(identity, snapshots) {
  return [
    {
      id: 'series_exists',
      blockCode: 'series_missing',
      expected: { seriesId: identity.seriesId }
    },
    {
      id: 'round_not_cancelled',
      blockCode: 'round_cancelled',
      cannotBypassViaConfirmation: true,
      planBuilderDoesNotInfer: true,
      executorMustInjectAuthority: true,
      expected: { roundId: identity.roundId }
    },
    {
      id: 'station_identity_match',
      blockCode: 'station_identity_mismatch',
      expected: {
        seriesId: identity.seriesId,
        roundId: identity.roundId,
        matchId: identity.matchId,
        publishToken: identity.publishToken,
        index: snapshots.index || null
      }
    },
    {
      id: 'station_managed_series',
      blockCode: 'station_not_managed',
      expected: { managed: true, seriesId: identity.seriesId }
    },
    {
      id: 'series_round_not_terminal',
      blockCode: 'series_or_round_terminal',
      expected: { seriesId: identity.seriesId, roundId: identity.roundId }
    },
    {
      id: 'target_group_not_confirmed_finished',
      blockCode: 'group_finished',
      cannotBypassViaConfirmation: true,
      planBuilderDoesNotInfer: true,
      executorMustInjectAuthority: true,
      expected: { groupId: identity.groupId }
    },
    {
      id: 'station_match_not_completed',
      blockCode: 'match_finished',
      cannotBypassViaConfirmation: true,
      planBuilderDoesNotInfer: true,
      executorMustInjectAuthority: true,
      expected: { matchId: identity.matchId }
    },
    {
      id: 'series_not_completed_cancelled_or_archived',
      blockCode: 'series_lifecycle_locked',
      cannotBypassViaConfirmation: true,
      planBuilderDoesNotInfer: true,
      executorMustInjectAuthority: true,
      expected: { seriesId: identity.seriesId }
    },
    {
      id: 'manager_has_edit_groups_permission',
      blockCode: 'edit_groups_denied',
      cannotBypassViaConfirmation: true,
      planBuilderDoesNotInferPermission: true,
      executorMustInjectAuthority: true,
      permission: 'edit_groups'
    },
    {
      id: 'seat_exists',
      blockCode: 'target_seat_missing',
      expected: { groupId: identity.groupId, position: identity.position }
    },
    {
      id: 'seat_current_person_is_outgoing',
      blockCode: BLOCK_CODE.stale_outgoing_person,
      expected: { userId: identity.outgoingUserId, groupId: identity.groupId, position: identity.position }
    },
    {
      id: 'score_identity_unchanged',
      blockCode: BLOCK_CODE.score_identity_changed,
      expected: snapshots.scoreIdentity
    },
    {
      id: 'pairing_structure_unchanged',
      blockCode: BLOCK_CODE.pairing_changed,
      expected: snapshots.pairingsBefore
    },
    {
      id: 'incoming_not_elsewhere_in_round',
      blockCode: 'incoming_already_seated',
      expected: { incomingUserId: identity.incomingUserId, roundId: identity.roundId }
    },
    {
      id: 'recollect_series_live_affiliation_evidence',
      module: 'seriesLiveAffiliationEvidence',
      reuseFrozenEvidence: false,
      blockCode: 'evidence_conflict_or_incomplete',
      rules: {
        conflictOrIncompleteBlocks: true,
        newLockOrReservationMustMatchTarget: true,
        sameTargetMayContinue: true,
        reevaluateRosterRepairFromFreshEvidence: true,
        silentTargetChangeForbidden: true
      }
    },
    {
      id: 'redecide_series_live_replace',
      module: 'decideSeriesLiveReplace',
      blockCode: BLOCK_CODE.stale_plan,
      compatibility: {
        originalAction: identity.decisionAction,
        directMustNotAutoUpgradeToConfirmExecute: true,
        confirmMustKeepTargetAffiliationId: identity.targetAffiliationId,
        actionOrTargetChange: BLOCK_CODE.stale_plan
      }
    }
  ];
}

function atomicScope(hasRosterOp) {
  var withRoster = [
    'journal_prepared',
    'station_write',
    'station_readback',
    'roster_write',
    'roster_readback',
    'combined_verification',
    'journal_committed'
  ];
  var stationOnly = [
    'journal_prepared',
    'station_write',
    'station_readback',
    'journal_committed'
  ];
  return {
    items: [
      'station_seat_replacement',
      'pairing_current_identity_replacement',
      'optional_series_roster_affiliation_repair'
    ],
    executionOrderNotImplied: true,
    recommendedExecutionOrder: hasRosterOp ? withRoster : stationOnly,
    stationAndRosterSingleTransaction: !!hasRosterOp,
    allSucceedOrAllRollback: true,
    forbidRosterChangedStationUnchanged: true,
    forbidStationChangedRosterUnrepaired: !!hasRosterOp,
    journal: 'dedicated_series_live_mutation_journal',
    implementJournalInThisBatch: false
  };
}

function buildSeriesLiveReplacePlan(input) {
  var src = input && typeof input === 'object' ? input : {};
  var decision = src.decision && typeof src.decision === 'object' ? src.decision : {};
  var series = src.series;
  var groups = src.groups;
  var pairingDraft = src.pairingDraft;
  var target = src.target && typeof src.target === 'object' ? src.target : {};
  var incomingPlayer = src.incomingPlayer;
  var action = asString(decision.action) || ACTION.invalid;
  var reason = asString(decision.reason) || asString(decision.code);
  var code = asString(decision.code) || asString(decision.reason);

  if (isBlockedDecisionAction(action)) {
    return blockedPlan({
      reason: reason || action,
      code: code || action,
      decisionAction: action,
      requiresConfirmation: false
    });
  }

  var seriesId = asString(target.seriesId) || asString(series && series.seriesId);
  var roundId = asString(target.roundId);
  var matchId = asString(target.matchId);
  var groupId = asString(target.groupId);
  var position = Number(target.position) || 0;
  var publishToken =
    asString(target.publishToken) || asString(series && series.publishToken);
  var targetAffiliationId = asString(target.targetAffiliationId);

  if (!seriesId || !roundId || !matchId || !groupId || !position) {
    return blockedPlan({
      reason: BLOCK_CODE.current_target_identity_incomplete,
      code: BLOCK_CODE.current_target_identity_incomplete,
      decisionAction: action
    });
  }
  if (!publishToken) {
    return blockedPlan({
      reason: BLOCK_CODE.publish_token_missing,
      code: BLOCK_CODE.publish_token_missing,
      decisionAction: action
    });
  }
  if (!targetAffiliationId) {
    return blockedPlan({
      reason: BLOCK_CODE.target_affiliation_id_required,
      code: BLOCK_CODE.target_affiliation_id_required,
      decisionAction: action
    });
  }

  var incomingUserId = playerIdOf(incomingPlayer);
  if (!incomingUserId) {
    return blockedPlan({
      reason: BLOCK_CODE.incoming_user_id_required,
      code: BLOCK_CODE.incoming_user_id_required,
      decisionAction: action
    });
  }

  var located = findSeat(groups, groupId, position);
  var outgoingUserId = playerIdOf(located.player);
  if (!outgoingUserId) {
    return blockedPlan({
      reason: BLOCK_CODE.outgoing_user_id_required,
      code: BLOCK_CODE.outgoing_user_id_required,
      decisionAction: action
    });
  }

  if (!decision.candidateGroups || !Array.isArray(decision.candidateGroups)) {
    return blockedPlan({
      reason: BLOCK_CODE.replacement_snapshot_missing,
      code: BLOCK_CODE.replacement_snapshot_missing,
      decisionAction: action
    });
  }

  var replacementSeatLocated = findSeat(decision.candidateGroups, groupId, position);
  var replacementSeat = replacementSeatLocated.player;
  var scoreIdentity = pickPresentScoreIdentity(replacementSeat || located.player);
  if (incomingUserId) {
    scoreIdentity = Object.assign({}, scoreIdentity || {}, { scorePlayerId: incomingUserId });
  }
  var groupsSnapshot = deepClone(decision.candidateGroups);
  var pairingsSnapshot = deepClone(
    decision.candidatePairings != null ? decision.candidatePairings : pairingDraft || {}
  );
  var pairingsBefore = deepClone(pairingDraft || {});

  var fromAffiliationId = asString(src.rosterAffiliationId);
  var identity = {
    seriesId: seriesId,
    roundId: roundId,
    matchId: matchId,
    groupId: groupId,
    position: position,
    publishToken: publishToken,
    decisionAction: action,
    incomingUserId: incomingUserId,
    outgoingUserId: outgoingUserId,
    fromAffiliationId: fromAffiliationId,
    targetAffiliationId: targetAffiliationId
  };
  if (hasOwn(scoreIdentity, 'scorePlayerId')) identity.scorePlayerId = scoreIdentity.scorePlayerId;
  if (hasOwn(scoreIdentity, 'entityId')) identity.entityId = scoreIdentity.entityId;
  if (hasOwn(scoreIdentity, 'pairingId')) identity.pairingId = scoreIdentity.pairingId;

  var planKey = buildPlanKey(identity);
  var needsRoster =
    action === ACTION.confirm_reaffiliate ||
    (action === ACTION.direct_replace && decision.needsRosterRepair === true);

  var toAffiliationId =
    action === ACTION.confirm_reaffiliate
      ? targetAffiliationId
      : asString(decision.effectiveAffiliationId) || targetAffiliationId;
  var toPart = findParticipant(series, toAffiliationId);
  var toSeriesParticipantId = asString(toPart && toPart.seriesParticipantId) || asString(toAffiliationId);

  var rosterResolved = null;
  if (needsRoster) {
    rosterResolved = resolveRegisteredRosterEntry(
      series,
      asString(incomingPlayer && incomingPlayer.playerId) || incomingUserId
    );
    if (!rosterResolved.ok) {
      return blockedPlan({
        reason: rosterResolved.reason,
        code: rosterResolved.reason,
        decisionAction: action
      });
    }
    identity.rosterEntryId = rosterResolved.rosterEntryId;
    identity.fromSeriesParticipantId = rosterResolved.fromSeriesParticipantId;
    identity.toSeriesParticipantId = toSeriesParticipantId;
  }

  var stationOp = {
    type: OP_TYPE.replace_station_seat,
    groupId: groupId,
    position: position,
    outgoing: currentIdentityOf(located.player),
    incoming: currentIdentityOf(incomingPlayer),
    scoreIdentity: scoreIdentity,
    replacementSeat: replacementSeat
      ? {
          currentIdentity: currentIdentityOf(replacementSeat),
          scoreIdentity: scoreIdentity,
          affiliationProjection: pickSeatAffiliationProjection(replacementSeat)
        }
      : null,
    groups: groupsSnapshot,
    pairings: pairingsSnapshot,
    pairingCurrentIdentity: {
      fromUserId: outgoingUserId,
      toUserId: incomingUserId
    },
    pairingStableIdentity: pairingStableList(pairingsSnapshot, groupId)
  };

  var operations = [stationOp];
  var display = participantDisplaySnapshot(toPart);

  if (needsRoster && rosterResolved) {
    operations.push({
      type: OP_TYPE.repair_series_roster_affiliation,
      rosterEntryId: rosterResolved.rosterEntryId,
      playerId: rosterResolved.playerId,
      fromSeriesParticipantId: rosterResolved.fromSeriesParticipantId,
      toSeriesParticipantId: toSeriesParticipantId,
      participantDisplay: display,
      writeFieldAllowlist: ROSTER_WRITE_KEYS.slice(),
      matchAllMatchingRows: false,
      forbidden: {
        globalTeamDirectory: true,
        otherSeries: true,
        outgoingPlayerRoster: true,
        nonAffiliationProfile: true,
        bulkRosterRewrite: true,
        otherPlayers: true,
        cancelledOrRemovedHistory: true,
        seatProjectionFields: true
      }
    });
  }

  var awaiting = action === ACTION.confirm_reaffiliate;
  var indexSnap = src.stationIndex && typeof src.stationIndex === 'object' ? deepClone(src.stationIndex) : null;
  if (!indexSnap) {
    indexSnap = { seriesId: seriesId, roundId: roundId, matchId: matchId };
  }

  var plan = {
    ok: true,
    planStatus: awaiting ? PLAN_STATUS.awaiting_confirmation : PLAN_STATUS.ready,
    requiresConfirmation: awaiting,
    executable: false,
    reason: '',
    code: '',
    decisionAction: action,
    needsRosterRepair: !!decision.needsRosterRepair,
    identity: identity,
    planKey: planKey,
    confirmationFingerprint: awaiting ? buildConfirmationFingerprint(identity, planKey) : null,
    confirmationDisplay: {
      notUsedForBusinessDecision: true,
      notUsedForRosterWrite: true,
      incomingUserId: incomingUserId,
      targetAffiliationId: targetAffiliationId,
      participant: display
    },
    operations: operations,
    preconditions: buildPreconditions(identity, {
      scoreIdentity: scoreIdentity,
      pairingsBefore: pairingStableList(pairingsBefore, groupId),
      index: indexSnap
    }),
    atomicScope: atomicScope(needsRoster)
  };
  return plan;
}

module.exports = {
  PLAN_STATUS: PLAN_STATUS,
  OP_TYPE: OP_TYPE,
  BLOCK_CODE: BLOCK_CODE,
  ROSTER_WRITE_KEYS: ROSTER_WRITE_KEYS,
  SEAT_AFFILIATION_PROJECTION_KEYS: SEAT_AFFILIATION_PROJECTION_KEYS,
  LOCK_PRECONDITION_IDS: LOCK_PRECONDITION_IDS,
  buildSeriesLiveReplacePlan: buildSeriesLiveReplacePlan,
  buildPlanKey: buildPlanKey,
  buildConfirmationFingerprint: buildConfirmationFingerprint
};
