/**
 * Series LIVE 换人：replaceOnly / replaceAndReaffiliate 纯候选与决策
 * - 不读不写 storage
 * - 不改输入 series / groups / incomingPlayer / evidenceResult
 * - 不通过错误文案判断是否归属问题：仅当「只改归属」的第二候选通过
 */

var tournamentGroupDraft = require('./tournamentGroupDraft.js');
var affiliationEvidence = require('./seriesLiveAffiliationEvidence.js');

var STATE = affiliationEvidence.STATE;

var ACTION = {
  direct_replace: 'direct_replace',
  confirm_reaffiliate: 'confirm_reaffiliate',
  invalid: 'invalid',
  blocked: 'blocked',
  blocked_reservation: 'blocked_reservation',
  blocked_confirmed_lock: 'blocked_confirmed_lock'
};

var CURRENT_IDENTITY_KEYS = [
  'userId',
  'playerId',
  'id',
  'displayName',
  'avatar',
  'gender',
  'tPosition',
  'tee'
];

var AFFILIATION_SNAPSHOT_KEYS = [
  'seriesParticipantId',
  'matchTeamId',
  'affiliationId',
  'teamId',
  'divisionId',
  'matchTeamName',
  'groupName',
  'participantNameSnapshot',
  'participantShortNameSnapshot',
  'participantColorSnapshot',
  'shortNameSnapshot',
  'colorSnapshot',
  'fromSeriesRoster'
];

var SCORE_IDENTITY_KEYS = [
  'scorePlayerId',
  'slotScorePlayerId',
  'scoreOwnerId',
  'entityId',
  'slotId',
  'pairingId',
  'hasHistoryScore'
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

function findGroup(groups, groupId) {
  var gid = asString(groupId);
  var list = Array.isArray(groups) ? groups : [];
  for (var i = 0; i < list.length; i++) {
    if (asString(list[i] && list[i].groupId) === gid) return list[i];
  }
  return null;
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

function participantTeamGroupId(series, part) {
  var kind = resolveParticipantKind(series);
  if (!part) return '';
  if (kind === 'division') {
    return asString(part.divisionId) || asString(part.seriesParticipantId);
  }
  return asString(part.sourceTeamId) || asString(part.teamId) || asString(part.seriesParticipantId);
}

function participantDisplayName(part) {
  if (!part) return '';
  return (
    asString(part.shortNameSnapshot) ||
    asString(part.nameSnapshot) ||
    asString(part.fullNameSnapshot) ||
    asString(part.seriesParticipantId)
  );
}

function copyScoreIdentity(fromSeat, into) {
  var src = fromSeat && typeof fromSeat === 'object' ? fromSeat : {};
  var out = into && typeof into === 'object' ? into : {};
  for (var i = 0; i < SCORE_IDENTITY_KEYS.length; i++) {
    var k = SCORE_IDENTITY_KEYS[i];
    if (src[k] != null && src[k] !== '') out[k] = src[k];
  }
  if (!out.scorePlayerId) {
    var oldId = playerIdOf(src);
    if (oldId) out.scorePlayerId = oldId;
  }
  return out;
}

function pickBDisplay(incoming) {
  var src = incoming && typeof incoming === 'object' ? incoming : {};
  var uid = playerIdOf(src);
  var tPos = asString(src.tPosition) || asString(src.tee);
  return {
    userId: uid,
    playerId: uid,
    id: uid,
    displayName:
      asString(src.displayName) ||
      asString(src.playerNameSnapshot) ||
      asString(src.competitionName) ||
      asString(src.nickname) ||
      asString(src.nickName) ||
      '',
    avatar: asString(src.avatar) || asString(src.playerAvatarSnapshot) || '',
    gender: asString(src.gender) || asString(src.genderSnapshot) || '',
    tPosition: tPos,
    tee: tPos
  };
}

function clearAffiliationSnapshot(person) {
  var next = person && typeof person === 'object' ? Object.assign({}, person) : {};
  for (var i = 0; i < AFFILIATION_SNAPSHOT_KEYS.length; i++) {
    var k = AFFILIATION_SNAPSHOT_KEYS[i];
    next[k] = k === 'fromSeriesRoster' ? false : '';
  }
  return next;
}

function applyAffiliationSnapshot(person, series, affiliationId) {
  var next = person && typeof person === 'object' ? Object.assign({}, person) : {};
  var affId = asString(affiliationId);
  if (!affId) {
    return { ok: true, person: clearAffiliationSnapshot(next), participant: null, emptyAffiliation: true };
  }
  var part = findParticipant(series, affiliationId);
  if (!part) {
    return { ok: false, reason: 'affiliation_unmapped', person: next };
  }
  var sid = asString(part.seriesParticipantId);
  var teamGroupId = participantTeamGroupId(series, part);
  var name = participantDisplayName(part);
  var shortName = asString(part.shortNameSnapshot) || name;
  var color = asString(part.colorSnapshot);
  next.seriesParticipantId = sid;
  next.matchTeamId = teamGroupId;
  next.affiliationId = teamGroupId;
  next.teamId = asString(part.sourceTeamId) || asString(part.teamId);
  next.divisionId = asString(part.divisionId);
  next.matchTeamName = shortName;
  next.groupName = shortName;
  next.participantNameSnapshot = asString(part.nameSnapshot) || name;
  next.participantShortNameSnapshot = shortName;
  next.participantColorSnapshot = color;
  next.shortNameSnapshot = shortName;
  next.colorSnapshot = color;
  next.fromSeriesRoster = true;
  return { ok: true, person: next, participant: part };
}

function assembleSeat(oldSeat, incomingPlayer, series, affiliationId, position, flightGroupId) {
  var display = pickBDisplay(incomingPlayer);
  if (!display.userId) {
    return { ok: false, reason: 'player_id_required' };
  }
  var aff = applyAffiliationSnapshot(display, series, affiliationId);
  if (!aff.ok) return aff;
  var seat = aff.person;
  seat.position = Number(position) || 0;
  copyScoreIdentity(oldSeat, seat);
  return { ok: true, seat: seat, flightGroupId: asString(flightGroupId) };
}

function patchTargetSeat(groups, groupId, position, seat) {
  var gid = asString(groupId);
  var pos = Number(position) || 0;
  return (Array.isArray(groups) ? groups : []).map(function (g) {
    if (!g || asString(g.groupId) !== gid) return g;
    var players = (Array.isArray(g.players) ? g.players : []).map(function (p) {
      var pp = Number(p && (p.position != null ? p.position : p.slotIndex)) || 0;
      if (pp !== pos) return p;
      return Object.assign({}, seat, { position: pos });
    });
    return Object.assign({}, g, { players: players });
  });
}

function remapId(id, from, to) {
  return asString(id) === from ? to : id;
}

function remapPairings(pairings, groupId, fromId, toId) {
  var src = pairings && typeof pairings === 'object' && !Array.isArray(pairings) ? pairings : {};
  var gid = asString(groupId);
  var from = asString(fromId);
  var to = asString(toId);
  var out = {};
  var keys = Object.keys(src);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var list = src[k];
    if (!Array.isArray(list)) {
      out[k] = list;
      continue;
    }
    out[k] = list.map(function (pairing) {
      if (!pairing || typeof pairing !== 'object') return pairing;
      var next = Object.assign({}, pairing);
      if (asString(k) === gid && from && to && from !== to) {
        if (Array.isArray(next.playerIds)) {
          next.playerIds = next.playerIds.map(function (id) {
            return remapId(id, from, to);
          });
        }
        if (Array.isArray(next.memberUserIds)) {
          next.memberUserIds = next.memberUserIds.map(function (id) {
            return remapId(id, from, to);
          });
        }
        if (Array.isArray(next.members)) {
          next.members = next.members.map(function (m) {
            if (m && typeof m === 'object') {
              var mm = Object.assign({}, m);
              if (asString(mm.userId) === from) mm.userId = to;
              if (asString(mm.playerId) === from) mm.playerId = to;
              if (asString(mm.id) === from) mm.id = to;
              return mm;
            }
            return remapId(m, from, to);
          });
        }
      }
      return next;
    });
  }
  return out;
}

function isValidationOk(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.ok === true || result.valid === true) return true;
  return false;
}

function validationReason(result) {
  if (!result || typeof result !== 'object') return 'invalid';
  return asString(result.reason) || asString(result.message) || 'invalid';
}

function normalizeDiffValue(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch (e) {
      return String(v);
    }
  }
  return String(v);
}

function listAllSeatDiffKeys(a, b) {
  var left = a && typeof a === 'object' ? a : {};
  var right = b && typeof b === 'object' ? b : {};
  var diffs = [];
  var seen = Object.create(null);
  var keys = Object.keys(left).concat(Object.keys(right));
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (seen[k]) continue;
    seen[k] = true;
    if (normalizeDiffValue(left[k]) === normalizeDiffValue(right[k])) continue;
    diffs.push(k);
  }
  return diffs;
}

function affiliationKeysDiffer(a, b) {
  return listAllSeatDiffKeys(a, b).filter(function (k) {
    return AFFILIATION_SNAPSHOT_KEYS.indexOf(k) >= 0;
  });
}

function onlyAffiliationDiffers(seatA, seatB) {
  var diffs = listAllSeatDiffKeys(seatA, seatB);
  for (var i = 0; i < diffs.length; i++) {
    if (AFFILIATION_SNAPSHOT_KEYS.indexOf(diffs[i]) < 0) return false;
  }
  var stable = CURRENT_IDENTITY_KEYS.concat(SCORE_IDENTITY_KEYS, ['position']);
  for (var j = 0; j < stable.length; j++) {
    var k = stable[j];
    if (normalizeDiffValue(seatA && seatA[k]) !== normalizeDiffValue(seatB && seatB[k])) {
      return false;
    }
  }
  return true;
}

function guardAffiliationOnlyCandidates(onlySeat, reSeat) {
  var allDiffs = listAllSeatDiffKeys(onlySeat, reSeat);
  var affDiffs = allDiffs.filter(function (k) {
    return AFFILIATION_SNAPSHOT_KEYS.indexOf(k) >= 0;
  });
  var otherDiffs = allDiffs.filter(function (k) {
    return AFFILIATION_SNAPSHOT_KEYS.indexOf(k) < 0;
  });
  var affiliationOnly = module.exports.onlyAffiliationDiffers(onlySeat, reSeat);
  if (!affiliationOnly || otherDiffs.length) {
    return {
      ok: false,
      reason: 'candidate_non_affiliation_drift',
      affiliationDiffKeys: affDiffs,
      otherDiffKeys: otherDiffs
    };
  }
  return {
    ok: true,
    reason: '',
    affiliationDiffKeys: affDiffs,
    otherDiffKeys: []
  };
}

function groupPlayerOrder(group) {
  return (Array.isArray(group && group.players) ? group.players : []).map(function (p) {
    return playerIdOf(p);
  });
}

function stableCandidateShape(onlyGroups, adjustedGroups, onlyPairings, adjustedPairings) {
  var left = Array.isArray(onlyGroups) ? onlyGroups : [];
  var right = Array.isArray(adjustedGroups) ? adjustedGroups : [];
  if (left.length !== right.length) return false;
  for (var i = 0; i < left.length; i++) {
    var lg = left[i] || {};
    var rg = right[i] || {};
    if (asString(lg.groupId) !== asString(rg.groupId)) return false;
    if (asString(lg.groupName) !== asString(rg.groupName)) return false;
    if ((lg.players || []).length !== (rg.players || []).length) return false;
    if (groupPlayerOrder(lg).join('\0') !== groupPlayerOrder(rg).join('\0')) return false;
    var lp = lg.players || [];
    var rp = rg.players || [];
    for (var j = 0; j < lp.length; j++) {
      if (Number(lp[j] && lp[j].position) !== Number(rp[j] && rp[j].position)) return false;
    }
  }
  return JSON.stringify(onlyPairings || {}) === JSON.stringify(adjustedPairings || {});
}

function findTargetSeat(groups, groupId, position) {
  var group = findGroup(groups, groupId);
  if (!group) return { group: null, player: null };
  var player = tournamentGroupDraft.findPlayerEntryByPosition(group, position);
  return { group: group, player: player || null };
}

/**
 * lock > reservation > roster；evidence 与 roster 不一致时 effective 用 evidence。
 */
function resolveEffectiveAffiliation(evidenceResult, rosterAffiliationId) {
  var ev = evidenceResult && typeof evidenceResult === 'object' ? evidenceResult : {};
  var state = asString(ev.state) || STATE.unlocked;
  if (state === STATE.affiliation_conflict) {
    return {
      blocked: true,
      action: ACTION.blocked,
      reason: 'affiliation_conflict',
      state: state,
      effectiveAffiliationId: '',
      needsRosterRepair: false
    };
  }
  if (state === STATE.projection_incomplete) {
    return {
      blocked: true,
      action: ACTION.blocked,
      reason: 'projection_incomplete',
      state: state,
      effectiveAffiliationId: '',
      needsRosterRepair: false
    };
  }
  var rosterId = asString(rosterAffiliationId);
  var evidenceId = asString(ev.affiliationId);
  var effectiveId = rosterId;
  if (state === STATE.confirmed_affiliation_lock) {
    effectiveId = evidenceId;
  } else if (state === STATE.participation_reservation) {
    effectiveId = evidenceId;
  }
  var needsRosterRepair = !!(
    effectiveId &&
    rosterId !== effectiveId &&
    (state === STATE.confirmed_affiliation_lock || state === STATE.participation_reservation)
  );
  return {
    blocked: false,
    state: state,
    effectiveAffiliationId: effectiveId,
    needsRosterRepair: needsRosterRepair
  };
}

function runValidate(validateCandidate, payload) {
  if (typeof validateCandidate !== 'function') {
    return { ok: false, reason: 'validate_candidate_required' };
  }
  try {
    return validateCandidate(payload) || { ok: false, reason: 'invalid' };
  } catch (e) {
    return { ok: false, reason: 'invalid' };
  }
}

function baseResult(extra) {
  return Object.assign(
    {
      ok: false,
      action: ACTION.invalid,
      requiresConfirmation: false,
      needsRosterRepair: false,
      effectiveAffiliationId: '',
      targetAffiliationId: '',
      candidateGroups: null,
      candidatePairings: null,
      originalValidation: null,
      adjustedValidation: null,
      affiliationDiffKeys: []
    },
    extra || {}
  );
}

function decideSeriesLiveReplace(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series;
  var groups = src.groups;
  var pairingDraft = src.pairingDraft;
  var target = src.target && typeof src.target === 'object' ? src.target : {};
  var incomingPlayer = src.incomingPlayer;
  var evidenceResult = src.evidenceResult;
  var rosterAffiliationId = asString(src.rosterAffiliationId);
  var targetAffiliationId = asString(target.targetAffiliationId);
  var groupId = asString(target.groupId);
  var position = Number(target.position) || 0;

  var effective = resolveEffectiveAffiliation(evidenceResult, rosterAffiliationId);
  if (effective.blocked) {
    return baseResult({
      ok: false,
      action: ACTION.blocked,
      reason: effective.reason,
      effectiveAffiliationId: '',
      targetAffiliationId: targetAffiliationId,
      needsRosterRepair: false,
      requiresConfirmation: false
    });
  }

  var located = findTargetSeat(groups, groupId, position);
  if (!located.player) {
    return baseResult({
      ok: false,
      action: ACTION.invalid,
      reason: 'target_seat_missing',
      effectiveAffiliationId: effective.effectiveAffiliationId,
      targetAffiliationId: targetAffiliationId,
      needsRosterRepair: effective.needsRosterRepair
    });
  }

  var rosterMissingUnlocked =
    effective.state === STATE.unlocked && !rosterAffiliationId;
  if (rosterMissingUnlocked && !targetAffiliationId) {
    return baseResult({
      ok: false,
      action: ACTION.invalid,
      reason: 'roster_affiliation_missing',
      code: 'roster_affiliation_missing',
      requiresConfirmation: false,
      effectiveAffiliationId: effective.effectiveAffiliationId,
      targetAffiliationId: targetAffiliationId,
      needsRosterRepair: false
    });
  }

  var onlyBuilt = assembleSeat(
    located.player,
    incomingPlayer,
    series,
    effective.effectiveAffiliationId,
    position,
    located.group && located.group.groupId
  );
  if (!onlyBuilt.ok) {
    return baseResult({
      ok: false,
      action: ACTION.invalid,
      reason: onlyBuilt.reason || 'invalid',
      code: onlyBuilt.reason || 'invalid',
      effectiveAffiliationId: effective.effectiveAffiliationId,
      targetAffiliationId: targetAffiliationId,
      needsRosterRepair: effective.needsRosterRepair
    });
  }

  var fromId = playerIdOf(located.player);
  var toId = playerIdOf(onlyBuilt.seat);
  var groupsClone = deepClone(groups);
  var draftStub = deepClone(groups);
  draftStub = patchTargetSeat(draftStub, groupId, position, {
    position: position,
    userId: toId,
    playerId: toId,
    id: toId
  });
  var merged = tournamentGroupDraft.applyLiveGroupsFromDraft(groupsClone, draftStub);
  var onlyGroups = patchTargetSeat(merged, groupId, position, onlyBuilt.seat);
  var onlyPairings = remapPairings(deepClone(pairingDraft || {}), groupId, fromId, toId);

  var originalValidation = runValidate(src.validateCandidate, {
    kind: 'replaceOnly',
    groups: onlyGroups,
    pairings: onlyPairings,
    series: series,
    affiliationId: effective.effectiveAffiliationId,
    playerId: toId,
    target: target
  });

  if (isValidationOk(originalValidation) && !rosterMissingUnlocked) {
    return baseResult({
      ok: true,
      action: ACTION.direct_replace,
      reason: '',
      requiresConfirmation: false,
      needsRosterRepair: effective.needsRosterRepair,
      effectiveAffiliationId: effective.effectiveAffiliationId,
      targetAffiliationId: targetAffiliationId,
      candidateGroups: onlyGroups,
      candidatePairings: onlyPairings,
      originalValidation: originalValidation,
      adjustedValidation: null,
      affiliationDiffKeys: []
    });
  }

  if (rosterMissingUnlocked && isValidationOk(originalValidation)) {
    originalValidation = { ok: false, reason: 'roster_affiliation_missing' };
  }

  var reBuilt = assembleSeat(
    located.player,
    incomingPlayer,
    series,
    targetAffiliationId,
    position,
    located.group && located.group.groupId
  );
  if (!reBuilt.ok) {
    return baseResult({
      ok: false,
      action: ACTION.invalid,
      reason: reBuilt.reason || validationReason(originalValidation),
      code: reBuilt.reason || validationReason(originalValidation),
      adjustedReason: reBuilt.reason || 'invalid',
      requiresConfirmation: false,
      needsRosterRepair: effective.needsRosterRepair,
      effectiveAffiliationId: effective.effectiveAffiliationId,
      targetAffiliationId: targetAffiliationId,
      candidateGroups: onlyGroups,
      candidatePairings: onlyPairings,
      originalValidation: originalValidation,
      adjustedValidation: { ok: false, reason: reBuilt.reason }
    });
  }

  var pairGuard = module.exports.guardAffiliationOnlyCandidates(onlyBuilt.seat, reBuilt.seat);
  var adjustedGroups = patchTargetSeat(deepClone(onlyGroups), groupId, position, reBuilt.seat);
  var adjustedPairings = deepClone(onlyPairings);
  if (
    !pairGuard.ok ||
    !stableCandidateShape(onlyGroups, adjustedGroups, onlyPairings, adjustedPairings)
  ) {
    return baseResult({
      ok: false,
      action: ACTION.invalid,
      reason: 'candidate_non_affiliation_drift',
      code: 'candidate_non_affiliation_drift',
      requiresConfirmation: false,
      needsRosterRepair: effective.needsRosterRepair,
      effectiveAffiliationId: effective.effectiveAffiliationId,
      targetAffiliationId: targetAffiliationId,
      candidateGroups: onlyGroups,
      candidatePairings: onlyPairings,
      originalValidation: originalValidation,
      adjustedValidation: null,
      affiliationDiffKeys: pairGuard.affiliationDiffKeys || [],
      otherDiffKeys: pairGuard.otherDiffKeys || []
    });
  }

  var adjustedValidation = runValidate(src.validateCandidate, {
    kind: 'replaceAndReaffiliate',
    groups: adjustedGroups,
    pairings: adjustedPairings,
    series: series,
    affiliationId: targetAffiliationId,
    playerId: toId,
    target: target
  });
  var diffKeys = pairGuard.affiliationDiffKeys || [];

  if (!isValidationOk(adjustedValidation)) {
    return baseResult({
      ok: false,
      action: ACTION.invalid,
      reason: validationReason(originalValidation),
      adjustedReason: validationReason(adjustedValidation),
      requiresConfirmation: false,
      needsRosterRepair: effective.needsRosterRepair,
      effectiveAffiliationId: effective.effectiveAffiliationId,
      targetAffiliationId: targetAffiliationId,
      candidateGroups: onlyGroups,
      candidatePairings: onlyPairings,
      originalValidation: originalValidation,
      adjustedValidation: adjustedValidation,
      affiliationDiffKeys: diffKeys
    });
  }

  var evState = effective.state;
  if (evState === STATE.unlocked) {
    return baseResult({
      ok: true,
      action: ACTION.confirm_reaffiliate,
      requiresConfirmation: true,
      needsRosterRepair: false,
      effectiveAffiliationId: effective.effectiveAffiliationId,
      targetAffiliationId: targetAffiliationId,
      candidateGroups: adjustedGroups,
      candidatePairings: adjustedPairings,
      originalValidation: originalValidation,
      adjustedValidation: adjustedValidation,
      affiliationDiffKeys: diffKeys
    });
  }

  if (evState === STATE.participation_reservation || evState === STATE.confirmed_affiliation_lock) {
    if (effective.effectiveAffiliationId && effective.effectiveAffiliationId === targetAffiliationId) {
      return baseResult({
        ok: true,
        action: ACTION.direct_replace,
        requiresConfirmation: false,
        needsRosterRepair: true,
        effectiveAffiliationId: effective.effectiveAffiliationId,
        targetAffiliationId: targetAffiliationId,
        candidateGroups: adjustedGroups,
        candidatePairings: adjustedPairings,
        originalValidation: originalValidation,
        adjustedValidation: adjustedValidation,
        affiliationDiffKeys: diffKeys
      });
    }
    return baseResult({
      ok: false,
      action:
        evState === STATE.confirmed_affiliation_lock
          ? ACTION.blocked_confirmed_lock
          : ACTION.blocked_reservation,
      reason:
        evState === STATE.confirmed_affiliation_lock
          ? 'confirmed_affiliation_lock'
          : 'participation_reservation',
      requiresConfirmation: false,
      needsRosterRepair: false,
      effectiveAffiliationId: effective.effectiveAffiliationId,
      targetAffiliationId: targetAffiliationId,
      candidateGroups: onlyGroups,
      candidatePairings: onlyPairings,
      originalValidation: originalValidation,
      adjustedValidation: adjustedValidation,
      affiliationDiffKeys: diffKeys
    });
  }

  return baseResult({
    ok: false,
    action: ACTION.blocked,
    reason: evState || 'blocked',
    effectiveAffiliationId: effective.effectiveAffiliationId,
    targetAffiliationId: targetAffiliationId,
    originalValidation: originalValidation,
    adjustedValidation: adjustedValidation
  });
}

module.exports = {
  ACTION: ACTION,
  CURRENT_IDENTITY_KEYS: CURRENT_IDENTITY_KEYS,
  AFFILIATION_SNAPSHOT_KEYS: AFFILIATION_SNAPSHOT_KEYS,
  SCORE_IDENTITY_KEYS: SCORE_IDENTITY_KEYS,
  decideSeriesLiveReplace: decideSeriesLiveReplace,
  resolveEffectiveAffiliation: resolveEffectiveAffiliation,
  assembleSeat: assembleSeat,
  onlyAffiliationDiffers: onlyAffiliationDiffers,
  affiliationKeysDiffer: affiliationKeysDiffer,
  listAllSeatDiffKeys: listAllSeatDiffKeys,
  guardAffiliationOnlyCandidates: guardAffiliationOnlyCandidates
};
