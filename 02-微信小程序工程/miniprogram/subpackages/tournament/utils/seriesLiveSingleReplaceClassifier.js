/**
 * Series LIVE 严格单座位变更分类器（纯函数）
 * - 不生成 candidate、不写 storage、不接页面/执行器
 * - 普通单场 LIVE 不得引用本模块
 */

var seriesStationMatch = require('../../../utils/seriesStationMatch.js');

var KIND = {
  single_replacement: 'single_replacement',
  rearrangement: 'rearrangement',
  batch_replacement: 'batch_replacement',
  no_change: 'no_change',
  ambiguous: 'ambiguous',
  multiple_replacements: 'multiple_replacements',
  seat_swap: 'seat_swap',
  player_move: 'player_move',
  player_addition: 'player_addition',
  player_removal: 'player_removal',
  unsupported: 'unsupported'
};

var ROUTE = {
  single_replace_journal: 'single_replace_journal',
  rearrangement_persist: 'rearrangement_persist',
  batch_persist: 'batch_persist',
  reject_unsupported: 'reject_unsupported'
};

var SCORE_IDENTITY_KEYS = [
  'scorePlayerId',
  'slotScorePlayerId',
  'scoreOwnerId',
  'entityId',
  'slotId',
  'pairingId',
  'hasHistoryScore'
];

var DERIVED_SEAT_KEYS = {
  displayName: true,
  avatar: true,
  gender: true,
  seriesParticipantId: true,
  matchTeamId: true,
  affiliationId: true,
  teamId: true,
  divisionId: true,
  groupName: true,
  fromSeriesRoster: true
};

var CURRENT_ID_KEYS = {
  userId: true,
  playerId: true,
  id: true
};

var PAIRING_MEMBER_KEYS = ['playerIds', 'members', 'memberUserIds', 'memberIds'];

var AUDIT_KEYS = {
  updatedAt: true,
  createdAt: true,
  timestamp: true
};

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function deepClone(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

function fingerprintOf(value) {
  return seriesStationMatch.fingerprintOf(value);
}

function playerIdOf(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
  return asString(raw.userId) || asString(raw.playerId) || asString(raw.id);
}

function positionOf(p) {
  if (!p || typeof p !== 'object') return 0;
  if (p.position == null && p.slotIndex == null) return 0;
  var n = Number(p.position != null ? p.position : p.slotIndex);
  if (!isFinite(n) || n < 1) return 0;
  return n;
}

function seatKey(groupId, position) {
  return asString(groupId) + '#' + String(Number(position) || 0);
}

function pickScoreIdentity(player) {
  return Object.assign({}, pickScoreTech(player), pickScoreOwner(player));
}

function pickScoreTech(player) {
  var src = player && typeof player === 'object' ? player : {};
  return {
    entityId: src.entityId,
    slotId: src.slotId,
    pairingId: src.pairingId,
    hasHistoryScore: src.hasHistoryScore,
    holes: src.holes
  };
}

function pickScoreOwner(player) {
  var src = player && typeof player === 'object' ? player : {};
  return {
    scorePlayerId: src.scorePlayerId,
    slotScorePlayerId: src.slotScorePlayerId,
    scoreOwnerId: src.scoreOwnerId
  };
}

var EPHEMERAL_META_KEYS = {
  updatedAt: true,
  createdAt: true,
  timestamp: true,
  competitionPhaseCache: true
};

function isEphemeralMetaKey(k) {
  var key = asString(k);
  if (!key) return true;
  if (EPHEMERAL_META_KEYS[key]) return true;
  if (key.charAt(0) === '_') return true;
  if (key.indexOf('Cache') >= 0) return true;
  return false;
}

function emptyLikeMeta(v) {
  if (v == null) return true;
  if (v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') {
    return Object.keys(stripAudit(v)).filter(function (k) {
      return !isEphemeralMetaKey(k);
    }).length === 0;
  }
  return false;
}

function metaValuesEqual(a, b) {
  if (emptyLikeMeta(a) && emptyLikeMeta(b)) return true;
  return fingerprintOf(stripAudit(a)) === fingerprintOf(stripAudit(b));
}

function stripAudit(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(stripAudit);
  if (typeof value !== 'object') return value;
  var out = {};
  Object.keys(value).forEach(function (k) {
    if (AUDIT_KEYS[k]) return;
    out[k] = stripAudit(value[k]);
  });
  return out;
}

function sliceForGroup(src, groupId) {
  var gid = asString(groupId);
  if (src == null) return null;
  if (Array.isArray(src)) return src;
  if (typeof src === 'object' && Object.prototype.hasOwnProperty.call(src, gid)) {
    return src[gid];
  }
  return null;
}

function groupList(match) {
  return Array.isArray(match && match.groups) ? match.groups : [];
}

function rewriteIds(value, fromId, toId) {
  var from = asString(fromId);
  var to = asString(toId);
  if (!from) return value;
  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    return asString(value) === from ? to : value;
  }
  if (Array.isArray(value)) {
    return value.map(function (x) {
      return rewriteIds(x, from, to);
    });
  }
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'userId') || Object.prototype.hasOwnProperty.call(value, 'playerId')) {
      var pid = playerIdOf(value);
      if (pid === from) {
        var next = deepClone(value);
        if (Object.prototype.hasOwnProperty.call(next, 'userId')) next.userId = to;
        if (Object.prototype.hasOwnProperty.call(next, 'playerId')) next.playerId = to;
        if (Object.prototype.hasOwnProperty.call(next, 'id')) next.id = to;
        return next;
      }
    }
    return value;
  }
  return value;
}

function pairingMemberFingerprint(row, fromId, toId) {
  var src = row && typeof row === 'object' ? row : {};
  var members = {};
  for (var i = 0; i < PAIRING_MEMBER_KEYS.length; i++) {
    var k = PAIRING_MEMBER_KEYS[i];
    if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
    members[k] = rewriteIds(src[k], fromId, toId);
  }
  return fingerprintOf(members);
}

function pairingStableFingerprint(row) {
  var src = row && typeof row === 'object' ? row : {};
  return fingerprintOf({
    id: src.id == null ? null : src.id,
    pairingId: src.pairingId == null ? null : src.pairingId,
    entityId: src.entityId == null ? null : src.entityId
  });
}

function pairingRestFingerprint(row, fromId, toId) {
  var src = row && typeof row === 'object' ? row : {};
  var rest = {};
  Object.keys(src).forEach(function (k) {
    if (PAIRING_MEMBER_KEYS.indexOf(k) >= 0) return;
    if (k === 'id' || k === 'pairingId' || k === 'entityId') return;
    rest[k] = rewriteIds(src[k], fromId, toId);
  });
  return fingerprintOf(rest);
}

function entityOwnerFingerprint(row, fromId, toId) {
  var src = row && typeof row === 'object' ? row : {};
  function own(v) {
    var s = asString(v);
    if (fromId && toId && s === asString(fromId)) return asString(toId);
    return s;
  }
  return fingerprintOf({
    scoreOwnerId: own(src.scoreOwnerId),
    ownerId: own(src.ownerId),
    scorePlayerId: own(src.scorePlayerId),
    ownerPlayerId: own(src.ownerPlayerId),
    slotScorePlayerId: own(src.slotScorePlayerId)
  });
}

function entityMemberFingerprint(row, fromId, toId) {
  var src = row && typeof row === 'object' ? row : {};
  var members = {};
  ['members', 'memberIds', 'memberUserIds', 'playerIds'].forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(src, k)) return;
    members[k] = rewriteIds(src[k], fromId, toId);
  });
  return fingerprintOf(members);
}

function entityStableFingerprint(row) {
  var src = row && typeof row === 'object' ? row : {};
  return fingerprintOf({
    id: src.id == null ? null : src.id,
    entityId: src.entityId == null ? null : src.entityId
  });
}

function asList(slice) {
  if (slice == null) return [];
  return Array.isArray(slice) ? slice : [slice];
}

function inspectGroups(groups) {
  var list = Array.isArray(groups) ? groups : [];
  var byId = Object.create(null);
  var missingGroup = false;
  var dupGroup = false;
  var missingPos = false;
  var dupPos = false;
  var seats = Object.create(null);
  var users = Object.create(null);

  for (var i = 0; i < list.length; i++) {
    var g = list[i] || {};
    var gid = asString(g.groupId);
    if (!gid) {
      missingGroup = true;
      continue;
    }
    if (byId[gid]) dupGroup = true;
    byId[gid] = g;
    var seenPos = Object.create(null);
    var players = Array.isArray(g.players) ? g.players : [];
    for (var j = 0; j < players.length; j++) {
      var p = players[j];
      var pos = positionOf(p);
      if (!pos) {
        missingPos = true;
        continue;
      }
      if (seenPos[pos]) dupPos = true;
      seenPos[pos] = true;
      var key = seatKey(gid, pos);
      var uid = playerIdOf(p);
      seats[key] = {
        groupId: gid,
        position: pos,
        userId: uid,
        player: p
      };
      if (uid) {
        if (!users[uid]) users[uid] = [];
        users[uid].push({ groupId: gid, position: pos, key: key });
      }
    }
  }
  return {
    byId: byId,
    seats: seats,
    users: users,
    groupIds: Object.keys(byId),
    missingGroup: missingGroup,
    dupGroup: dupGroup,
    missingPos: missingPos,
    dupPos: dupPos
  };
}

function sameSeat(a, b) {
  return !!(a && b && a.groupId === b.groupId && Number(a.position) === Number(b.position));
}

function classifyOccupancy(beforeIdx, afterIdx) {
  var moves = [];
  var swaps = [];
  var seenMove = Object.create(null);
  var userIds = {};
  Object.keys(beforeIdx.users).forEach(function (id) {
    userIds[id] = true;
  });
  Object.keys(afterIdx.users).forEach(function (id) {
    userIds[id] = true;
  });

  var duplicateAfter = [];
  Object.keys(afterIdx.users).forEach(function (id) {
    if (afterIdx.users[id].length > 1) duplicateAfter.push(id);
  });

  var ids = Object.keys(userIds);
  for (var i = 0; i < ids.length; i++) {
    var uid = ids[i];
    var bSeats = beforeIdx.users[uid] || [];
    var aSeats = afterIdx.users[uid] || [];
    if (bSeats.length === 1 && aSeats.length === 1 && !sameSeat(bSeats[0], aSeats[0])) {
      moves.push({
        userId: uid,
        from: bSeats[0],
        to: aSeats[0]
      });
    }
  }

  for (var m = 0; m < moves.length; m++) {
    var mv = moves[m];
    if (seenMove[mv.userId]) continue;
    for (var n = m + 1; n < moves.length; n++) {
      var other = moves[n];
      if (seenMove[other.userId]) continue;
      if (
        sameSeat(mv.from, other.to) &&
        sameSeat(mv.to, other.from)
      ) {
        swaps.push({ a: mv, b: other });
        seenMove[mv.userId] = true;
        seenMove[other.userId] = true;
      }
    }
  }

  var leftoverMoves = moves.filter(function (mv) {
    return !seenMove[mv.userId];
  });
  var occupiedByMove = Object.create(null);
  leftoverMoves.concat(moves.filter(function (mv) { return seenMove[mv.userId]; })).forEach(function (mv) {
    occupiedByMove[mv.from.key] = true;
    occupiedByMove[mv.to.key] = true;
  });

  var replacements = [];
  var additions = [];
  var removals = [];
  var keys = {};
  Object.keys(beforeIdx.seats).forEach(function (k) {
    keys[k] = true;
  });
  Object.keys(afterIdx.seats).forEach(function (k) {
    keys[k] = true;
  });
  Object.keys(keys).forEach(function (k) {
    if (occupiedByMove[k]) return;
    var b = beforeIdx.seats[k];
    var a = afterIdx.seats[k];
    var bId = b ? asString(b.userId) : '';
    var aId = a ? asString(a.userId) : '';
    if (bId && aId && bId !== aId) {
      replacements.push({
        groupId: (a || b).groupId,
        position: (a || b).position,
        outgoingUserId: bId,
        incomingUserId: aId,
        beforePlayer: b.player,
        afterPlayer: a.player
      });
      return;
    }
    if (!bId && aId) {
      additions.push({ groupId: a.groupId, position: a.position, incomingUserId: aId });
      return;
    }
    if (bId && !aId) {
      removals.push({ groupId: b.groupId, position: b.position, outgoingUserId: bId });
    }
  });

  return {
    duplicateAfter: duplicateAfter,
    swaps: swaps,
    moves: leftoverMoves,
    replacements: replacements,
    additions: additions,
    removals: removals
  };
}

function diffPlayerSets(beforeIdx, afterIdx) {
  var exited = [];
  var entered = [];
  Object.keys(beforeIdx.users || {}).forEach(function (id) {
    if (!afterIdx.users[id]) exited.push(id);
  });
  Object.keys(afterIdx.users || {}).forEach(function (id) {
    if (!beforeIdx.users[id]) entered.push(id);
  });
  return {
    exited: exited,
    entered: entered,
    replacementCount: Math.min(exited.length, entered.length)
  };
}

function groupIdsEqual(beforeIdx, afterIdx) {
  var a = (beforeIdx.groupIds || []).slice().sort();
  var b = (afterIdx.groupIds || []).slice().sort();
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function holesFingerprint(player) {
  return fingerprintOf(player && player.holes);
}

function pickSeatTechIds(player) {
  var src = player && typeof player === 'object' ? player : {};
  return {
    entityId: asString(src.entityId),
    slotId: asString(src.slotId),
    pairingId: asString(src.pairingId)
  };
}

function scoreDataPresent(match) {
  var sd = match && match.scoreData;
  return !!(sd && typeof sd === 'object' && !Array.isArray(sd) && Object.keys(sd).length);
}

function scoreDataLost(before, after) {
  return scoreDataPresent(before) && !scoreDataPresent(after);
}

function assertSeatAnchors(beforeIdx, afterIdx) {
  var keys = {};
  Object.keys((beforeIdx && beforeIdx.seats) || {}).forEach(function (k) {
    keys[k] = true;
  });
  Object.keys((afterIdx && afterIdx.seats) || {}).forEach(function (k) {
    keys[k] = true;
  });
  var drifted = [];
  Object.keys(keys).forEach(function (k) {
    var b = beforeIdx.seats[k];
    var a = afterIdx.seats[k];
    if (b && !a) {
      drifted.push({ scope: 'seat_missing', seat: k });
      return;
    }
    if (!b || !a) return;
    if (holesFingerprint(b.player) !== holesFingerprint(a.player)) {
      drifted.push({ scope: 'holes', seat: k });
    }
    var bt = pickSeatTechIds(b.player);
    var at = pickSeatTechIds(a.player);
    ['entityId', 'slotId', 'pairingId'].forEach(function (field) {
      if (bt[field] && at[field] && bt[field] !== at[field]) {
        drifted.push({ scope: 'tech_id', field: field, seat: k });
      }
    });
  });
  if (drifted.length) {
    return { ok: false, code: 'cross_group_payload_drift', rejectedChanges: drifted };
  }
  return { ok: true };
}

function pairingStableOnlyFingerprint(row) {
  var src = row && typeof row === 'object' ? row : {};
  return fingerprintOf({
    pairingId: src.pairingId,
    entityId: src.entityId,
    slotId: src.slotId
  });
}

function entityStableOnlyFingerprint(row) {
  var src = row && typeof row === 'object' ? row : {};
  return fingerprintOf({
    entityId: src.entityId,
    slotId: src.slotId
  });
}

function otherGroupsEqual(before, after, editedGroupId) {
  var gid = asString(editedGroupId);
  var bIdx = inspectGroups(groupList(before));
  var aIdx = inspectGroups(groupList(after));
  var ids = {};
  bIdx.groupIds.forEach(function (id) {
    ids[id] = true;
  });
  aIdx.groupIds.forEach(function (id) {
    ids[id] = true;
  });
  var drifted = [];
  Object.keys(ids).forEach(function (id) {
    if (id === gid) return;
    var meta = groupMetaDrift(bIdx.byId[id], aIdx.byId[id]);
    if (meta.length) drifted.push({ scope: 'groupMeta', groupId: id, fields: meta });
    var bPairs = asList(sliceForGroup(before && before.pairings, id));
    var aPairs = asList(sliceForGroup(after && after.pairings, id));
    if (bPairs.length !== aPairs.length) {
      drifted.push({ scope: 'pairings', groupId: id });
    } else {
      for (var i = 0; i < bPairs.length; i++) {
        if (pairingStableOnlyFingerprint(bPairs[i]) !== pairingStableOnlyFingerprint(aPairs[i])) {
          drifted.push({ scope: 'pairings', groupId: id });
          break;
        }
      }
    }
    var bEnt = asList(sliceForGroup(before && before.scoreEntities, id));
    var aEnt = asList(sliceForGroup(after && after.scoreEntities, id));
    if (bEnt.length !== aEnt.length) {
      drifted.push({ scope: 'scoreEntities', groupId: id });
    } else {
      for (var j = 0; j < bEnt.length; j++) {
        if (entityStableOnlyFingerprint(bEnt[j]) !== entityStableOnlyFingerprint(aEnt[j])) {
          drifted.push({ scope: 'scoreEntities', groupId: id });
          break;
        }
      }
    }
  });
  return drifted;
}

function occupancyHasSeatChange(occ) {
  return !!(
    occ.swaps.length ||
    occ.moves.length ||
    occ.replacements.length ||
    occ.additions.length ||
    occ.removals.length
  );
}

function pairIdentityReplacements(setDiff, occ) {
  var usedOut = Object.create(null);
  var usedIn = Object.create(null);
  var replacements = [];
  (occ.replacements || []).forEach(function (rep) {
    if (!rep) return;
    if (setDiff.exited.indexOf(rep.outgoingUserId) < 0) return;
    if (setDiff.entered.indexOf(rep.incomingUserId) < 0) return;
    usedOut[rep.outgoingUserId] = true;
    usedIn[rep.incomingUserId] = true;
    replacements.push({
      groupId: rep.groupId,
      position: Number(rep.position) || 0,
      outgoingUserId: rep.outgoingUserId,
      incomingUserId: rep.incomingUserId
    });
  });
  var leftoverOut = setDiff.exited.filter(function (id) {
    return !usedOut[id];
  });
  var leftoverIn = setDiff.entered.filter(function (id) {
    return !usedIn[id];
  });
  leftoverOut.sort();
  leftoverIn.sort();
  var n = Math.min(leftoverOut.length, leftoverIn.length);
  for (var i = 0; i < n; i++) {
    replacements.push({
      groupId: '',
      position: 0,
      outgoingUserId: leftoverOut[i],
      incomingUserId: leftoverIn[i]
    });
  }
  return replacements;
}

function listRearrangements(occ) {
  var out = [];
  (occ.moves || []).forEach(function (mv) {
    out.push({
      userId: mv.userId,
      from: { groupId: mv.from && mv.from.groupId, position: mv.from && mv.from.position },
      to: { groupId: mv.to && mv.to.groupId, position: mv.to && mv.to.position }
    });
  });
  (occ.swaps || []).forEach(function (sw) {
    if (sw.a) {
      out.push({
        userId: sw.a.userId,
        from: { groupId: sw.a.from && sw.a.from.groupId, position: sw.a.from && sw.a.from.position },
        to: { groupId: sw.a.to && sw.a.to.groupId, position: sw.a.to && sw.a.to.position }
      });
    }
    if (sw.b) {
      out.push({
        userId: sw.b.userId,
        from: { groupId: sw.b.from && sw.b.from.groupId, position: sw.b.from && sw.b.from.position },
        to: { groupId: sw.b.to && sw.b.to.groupId, position: sw.b.to && sw.b.to.position }
      });
    }
  });
  return out;
}

function correctionOps(occ, setDiff, extra) {
  extra = extra || {};
  return {
    fills: extra.fills || (occ.additions || []).slice(),
    clears: extra.clears || (occ.removals || []).slice(),
    moves: extra.moves || (occ.moves || []).slice(),
    swaps: extra.swaps || (occ.swaps || []).slice(),
    replacements: extra.replacements || (occ.replacements || []).slice(),
    rearrangements: extra.rearrangements != null ? extra.rearrangements : listRearrangements(occ),
    outgoingUserIds: setDiff.exited.slice(),
    incomingUserIds: setDiff.entered.slice(),
    replacementCount: setDiff.replacementCount
  };
}

function persistableCorrection(kind, traces, occ, setDiff, extra) {
  extra = extra || {};
  traces.steps.push({ id: 'identity_correction', kind: kind });
  return finish(
    Object.assign(
      {
        ok: true,
        kind: kind,
        code: extra.code || kind,
        traces: traces,
        recommendedRoute: extra.recommendedRoute || ROUTE.batch_persist,
        rejectedChanges: []
      },
      correctionOps(occ, setDiff, extra)
    )
  );
}

function isPersistableIdentityCorrection(classification) {
  if (!classification || classification.ok !== true) return false;
  var route = asString(classification.recommendedRoute);
  if (route === ROUTE.batch_persist || route === ROUTE.rearrangement_persist) return true;
  var k = asString(classification.kind);
  return (
    k === KIND.rearrangement ||
    k === KIND.batch_replacement ||
    k === KIND.single_replacement ||
    k === KIND.player_addition ||
    k === KIND.player_removal ||
    k === KIND.player_move ||
    k === KIND.seat_swap
  );
}

function isClassicSingleSeat(setDiff, occ, editedGroupId) {
  if (setDiff.replacementCount !== 1) return false;
  if (!occ.replacements || occ.replacements.length !== 1) return false;
  if ((occ.moves && occ.moves.length) || (occ.swaps && occ.swaps.length)) return false;
  if ((occ.additions && occ.additions.length) || (occ.removals && occ.removals.length)) return false;
  if (!editedGroupId) return false;
  return asString(occ.replacements[0].groupId) === editedGroupId;
}

function matchShellDrift(before, after, opts) {
  var keys = ['matchId', 'seriesContext', 'gameMode', 'status'];
  if (!(opts && opts.ignoreScorePayload)) {
    keys = keys.concat(['scoreData', 'teamScores', 'teamScoresByEntity']);
  }
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (metaValuesEqual(before && before[k], after && after[k])) continue;
    return k;
  }
  return '';
}

function occupantEmpty(player) {
  return !playerIdOf(player);
}

function seatMetadataDrift(beforePlayer, afterPlayer, fromId, toId) {
  var a = beforePlayer && typeof beforePlayer === 'object' ? beforePlayer : {};
  var b = afterPlayer && typeof afterPlayer === 'object' ? afterPlayer : {};
  var keys = {};
  Object.keys(a).forEach(function (k) {
    if (!isEphemeralMetaKey(k)) keys[k] = true;
  });
  Object.keys(b).forEach(function (k) {
    if (!isEphemeralMetaKey(k)) keys[k] = true;
  });
  var bad = [];
  Object.keys(keys).forEach(function (k) {
    if (CURRENT_ID_KEYS[k] || DERIVED_SEAT_KEYS[k] || SCORE_IDENTITY_KEYS.indexOf(k) >= 0) return;
    if (k === 'position' || k === 'slotIndex') return;
    if (metaValuesEqual(a[k], b[k])) return;
    bad.push(k);
  });
  Object.keys(CURRENT_ID_KEYS).forEach(function (k) {
    var bv = a[k] == null ? '' : asString(a[k]);
    var av = b[k] == null ? '' : asString(b[k]);
    if (!bv && !av) return;
    if (bv === fromId && av === toId) return;
    if (bv === av) return;
    if (bv && av && bv !== av && bv !== fromId && av !== toId) bad.push(k);
    if (bv === fromId && av && av !== toId) bad.push(k);
    if (av === toId && bv && bv !== fromId && bv !== toId) bad.push(k);
  });
  return bad;
}

function groupMetaDrift(beforeGroup, afterGroup) {
  var bg = beforeGroup && typeof beforeGroup === 'object' ? beforeGroup : {};
  var ag = afterGroup && typeof afterGroup === 'object' ? afterGroup : {};
  var skip = { players: true };
  var keys = {};
  Object.keys(bg).forEach(function (k) {
    if (!skip[k] && !isEphemeralMetaKey(k)) keys[k] = true;
  });
  Object.keys(ag).forEach(function (k) {
    if (!skip[k] && !isEphemeralMetaKey(k)) keys[k] = true;
  });
  var bad = [];
  Object.keys(keys).forEach(function (k) {
    if (!metaValuesEqual(bg[k], ag[k])) bad.push(k);
  });
  return bad;
}

function comparePairings(beforeSlice, afterSlice, fromId, toId) {
  var b = asList(beforeSlice);
  var a = asList(afterSlice);
  if (!b.length && !a.length) return { ok: true, derived: false };
  if (b.length !== a.length) {
    return { ok: false, code: fromId ? 'pairing_structure_drift' : 'pairing_only_change' };
  }
  var derived = false;
  for (var i = 0; i < b.length; i++) {
    if (pairingStableFingerprint(b[i]) !== pairingStableFingerprint(a[i])) {
      return { ok: false, code: fromId ? 'pairing_identity_drift' : 'pairing_only_change' };
    }
    if (pairingMemberFingerprint(b[i], fromId, toId) !== pairingMemberFingerprint(a[i], '', '')) {
      return { ok: false, code: fromId ? 'pairing_structure_drift' : 'pairing_only_change' };
    }
    if (pairingRestFingerprint(b[i], fromId, toId) !== pairingRestFingerprint(a[i], '', '')) {
      return { ok: false, code: fromId ? 'pairing_structure_drift' : 'pairing_only_change' };
    }
    if (fromId && pairingMemberFingerprint(b[i], '', '') !== pairingMemberFingerprint(a[i], '', '')) {
      derived = true;
    }
  }
  return { ok: true, derived: derived };
}

function compareEntities(beforeSlice, afterSlice, fromId, toId) {
  var b = asList(beforeSlice);
  var a = asList(afterSlice);
  if (!b.length && !a.length) return { ok: true, derived: false };
  if (b.length !== a.length) {
    return { ok: false, code: fromId ? 'entity_structure_drift' : 'entity_only_change' };
  }
  var derived = false;
  for (var i = 0; i < b.length; i++) {
    if (entityStableFingerprint(b[i]) !== entityStableFingerprint(a[i])) {
      return { ok: false, code: fromId ? 'entity_structure_drift' : 'entity_only_change' };
    }
    if (entityOwnerFingerprint(b[i], fromId, toId) !== entityOwnerFingerprint(a[i], '', '')) {
      return { ok: false, code: 'score_owner_drift' };
    }
    if (entityMemberFingerprint(b[i], fromId, toId) !== entityMemberFingerprint(a[i], '', '')) {
      return { ok: false, code: fromId ? 'entity_structure_drift' : 'entity_only_change' };
    }
    if (fromId && entityMemberFingerprint(b[i], '', '') !== entityMemberFingerprint(a[i], '', '')) {
      derived = true;
    }
  }
  return { ok: true, derived: derived };
}

function finish(extra) {
  var out = Object.assign(
    {
      ok: false,
      kind: KIND.unsupported,
      code: '',
      replacement: null,
      derivedChanges: [],
      rejectedChanges: [],
      traces: { steps: [] },
      recommendedRoute: ROUTE.reject_unsupported
    },
    extra || {}
  );
  if (out.ok === true) {
    out.recommendedRoute =
      extra && extra.recommendedRoute
        ? extra.recommendedRoute
        : ROUTE.batch_persist;
  } else {
    out.recommendedRoute = ROUTE.reject_unsupported;
    out.ok = false;
  }
  return out;
}

function reject(code, extra) {
  var kind = KIND.unsupported;
  if (code === 'ambiguous_group' || code === 'ambiguous_position') kind = KIND.ambiguous;
  if (code === 'no_live_group_change') kind = KIND.no_change;
  if (code === 'multiple_replacements') kind = KIND.multiple_replacements;
  if (code === 'rearrangement') kind = KIND.rearrangement;
  if (code === 'batch_replacement') kind = KIND.batch_replacement;
  if (code === 'seat_swap') kind = KIND.seat_swap;
  if (code === 'player_move') kind = KIND.player_move;
  if (code === 'player_addition') kind = KIND.player_addition;
  if (code === 'player_removal') kind = KIND.player_removal;
  return finish(
    Object.assign(
      {
        ok: false,
        kind: kind,
        code: code
      },
      extra || {}
    )
  );
}

function classifySeriesLiveSingleReplace(input) {
  var src = input && typeof input === 'object' ? input : {};
  var before = src.beforeMatch;
  var after = src.candidateMatch;
  var editedGroupId = asString(src.editedGroupId);
  var traces = { steps: [] };

  traces.steps.push({ id: 'identity_index' });
  var beforeIdx = inspectGroups(groupList(before));
  var afterIdx = inspectGroups(groupList(after));
  if (beforeIdx.missingGroup || afterIdx.missingGroup) {
    return reject('ambiguous_group', { traces: traces, kind: KIND.ambiguous });
  }
  if (beforeIdx.dupGroup || afterIdx.dupGroup) {
    return reject('ambiguous_group', { traces: traces, kind: KIND.ambiguous });
  }
  if (beforeIdx.missingPos || afterIdx.missingPos) {
    return reject('ambiguous_position', { traces: traces, kind: KIND.ambiguous });
  }
  if (beforeIdx.dupPos || afterIdx.dupPos) {
    return reject('ambiguous_position', { traces: traces, kind: KIND.ambiguous });
  }

  traces.steps.push({ id: 'occupancy' });
  var occ = classifyOccupancy(beforeIdx, afterIdx);
  var setDiff = diffPlayerSets(beforeIdx, afterIdx);
  traces.occupancy = {
    replacements: occ.replacements.length,
    moves: occ.moves.length,
    swaps: occ.swaps.length,
    additions: occ.additions.length,
    removals: occ.removals.length
  };
  traces.playerSet = {
    exited: setDiff.exited.slice(),
    entered: setDiff.entered.slice(),
    replacementCount: setDiff.replacementCount
  };

  if (occ.duplicateAfter.length) {
    return reject('incoming_already_in_round', {
      traces: traces,
      rejectedChanges: occ.duplicateAfter.map(function (id) {
        return { kind: 'duplicate_after', userId: id };
      })
    });
  }
  if (!groupIdsEqual(beforeIdx, afterIdx)) {
    return reject('cross_group_payload_drift', {
      traces: traces,
      rejectedChanges: [{ scope: 'groupIds' }]
    });
  }
  if (scoreDataLost(before, after)) {
    return reject('cross_group_payload_drift', {
      traces: traces,
      rejectedChanges: [{ scope: 'scoreData' }]
    });
  }
  var anchors = assertSeatAnchors(beforeIdx, afterIdx);
  if (!anchors.ok) {
    return reject(anchors.code, {
      traces: traces,
      rejectedChanges: anchors.rejectedChanges
    });
  }

  var samePlayerSet = !setDiff.exited.length && !setDiff.entered.length;
  if (samePlayerSet && occupancyHasSeatChange(occ)) {
    traces.steps.push({ id: 'rearrangement' });
    var shellRearrange = matchShellDrift(before, after, { ignoreScorePayload: true });
    if (shellRearrange) {
      return reject('metadata_change', {
        traces: traces,
        rejectedChanges: [{ field: shellRearrange }]
      });
    }
    return persistableCorrection(KIND.rearrangement, traces, occ, setDiff, {
      code: 'rearrangement',
      recommendedRoute: ROUTE.rearrangement_persist
    });
  }

  if (setDiff.entered.length && !setDiff.exited.length) {
    return persistableCorrection(KIND.player_addition, traces, occ, setDiff, { code: 'player_addition' });
  }
  if (setDiff.exited.length && !setDiff.entered.length) {
    return persistableCorrection(KIND.player_removal, traces, occ, setDiff, { code: 'player_removal' });
  }
  if (setDiff.entered.length !== setDiff.exited.length) {
    var mixedKind =
      setDiff.entered.length > setDiff.exited.length ? KIND.player_addition : KIND.player_removal;
    return persistableCorrection(mixedKind, traces, occ, setDiff, { code: mixedKind });
  }

  if (setDiff.replacementCount >= 1 && !isClassicSingleSeat(setDiff, occ, editedGroupId)) {
    traces.steps.push({ id: 'batch_or_cross' });
    var shellBatch = matchShellDrift(before, after, { ignoreScorePayload: true });
    if (shellBatch) {
      return reject('metadata_change', {
        traces: traces,
        rejectedChanges: [{ field: shellBatch }]
      });
    }
    var batchReps = pairIdentityReplacements(setDiff, occ);
    var rearrs = listRearrangements(occ);
    return persistableCorrection(KIND.batch_replacement, traces, occ, setDiff, {
      code: 'batch_replacement',
      replacements: batchReps,
      rearrangements: rearrs
    });
  }

  var cross = otherGroupsEqual(before, after, editedGroupId);
  if (cross.length) {
    return reject('cross_group_payload_drift', { traces: traces, rejectedChanges: cross });
  }

  var shell = matchShellDrift(before, after, { ignoreScorePayload: true });
  if (shell) {
    var personChanged = occ.replacements.length > 0;
    return reject(personChanged ? 'metadata_change' : 'metadata_change', {
      traces: traces,
      rejectedChanges: [{ field: shell }]
    });
  }

  if (!occ.replacements.length) {
    traces.steps.push({ id: 'no_person_change' });
    var pOnly = comparePairings(
      sliceForGroup(before && before.pairings, editedGroupId),
      sliceForGroup(after && after.pairings, editedGroupId),
      '',
      ''
    );
    if (!pOnly.ok) {
      return reject('pairing_only_change', { traces: traces });
    }
    var eOnly = compareEntities(
      sliceForGroup(before && before.scoreEntities, editedGroupId),
      sliceForGroup(after && after.scoreEntities, editedGroupId),
      '',
      ''
    );
    if (!eOnly.ok) {
      return reject(eOnly.code === 'score_owner_drift' ? 'score_owner_drift' : 'entity_only_change', {
        traces: traces
      });
    }
    var bg = beforeIdx.byId[editedGroupId];
    var ag = afterIdx.byId[editedGroupId];
    if (fingerprintOf(stripAudit(bg)) !== fingerprintOf(stripAudit(ag))) {
      return reject('metadata_change', { traces: traces });
    }
    return finish({
      ok: false,
      kind: KIND.no_change,
      code: 'no_live_group_change',
      traces: traces,
      recommendedRoute: ROUTE.reject_unsupported
    });
  }

  var rep = occ.replacements[0];
  if (asString(rep.groupId) !== editedGroupId) {
    return persistableCorrection(KIND.batch_replacement, traces, occ, setDiff, {
      code: 'batch_replacement',
      replacements: occ.replacements.slice(),
      rearrangements: listRearrangements(occ)
    });
  }
  if (!asString(rep.outgoingUserId) || !asString(rep.incomingUserId)) {
    return reject('ambiguous_position', { traces: traces, kind: KIND.ambiguous });
  }
  if (rep.outgoingUserId === rep.incomingUserId) {
    return reject('no_live_group_change', { traces: traces, kind: KIND.no_change });
  }

  traces.steps.push({ id: 'score_identity' });
  var beforeScore = pickScoreIdentity(rep.beforePlayer);
  var afterScore = pickScoreIdentity(rep.afterPlayer);
  if (fingerprintOf(pickScoreTech(rep.beforePlayer)) !== fingerprintOf(pickScoreTech(rep.afterPlayer))) {
    return reject('score_identity_drift', {
      traces: traces,
      replacement: {
        groupId: rep.groupId,
        position: rep.position,
        outgoingUserId: rep.outgoingUserId,
        incomingUserId: rep.incomingUserId,
        beforeScoreIdentity: beforeScore,
        afterScoreIdentity: afterScore
      }
    });
  }
  var afterOwner = asString(rep.afterPlayer && (rep.afterPlayer.scorePlayerId || playerIdOf(rep.afterPlayer)));
  if (afterOwner !== asString(rep.incomingUserId)) {
    return reject('score_identity_drift', {
      traces: traces,
      replacement: {
        groupId: rep.groupId,
        position: rep.position,
        outgoingUserId: rep.outgoingUserId,
        incomingUserId: rep.incomingUserId,
        beforeScoreIdentity: beforeScore,
        afterScoreIdentity: afterScore
      }
    });
  }

  traces.steps.push({ id: 'edited_group_meta' });
  var metaKeys = groupMetaDrift(beforeIdx.byId[editedGroupId], afterIdx.byId[editedGroupId]);
  if (metaKeys.length) {
    return reject('metadata_change', { traces: traces, rejectedChanges: metaKeys });
  }

  var bgPlayers = Array.isArray(beforeIdx.byId[editedGroupId] && beforeIdx.byId[editedGroupId].players)
    ? beforeIdx.byId[editedGroupId].players
    : [];
  var otherSeatBad = [];
  bgPlayers.forEach(function (p) {
    var pos = positionOf(p);
    if (pos === Number(rep.position)) return;
    var ak = seatKey(editedGroupId, pos);
    var bs = beforeIdx.seats[ak];
    var as = afterIdx.seats[ak];
    if (!bs || !as) {
      if ((!bs && occupantEmpty(as && as.player)) || (!as && occupantEmpty(bs && bs.player))) return;
      otherSeatBad.push(ak);
      return;
    }
    if (playerIdOf(bs.player) === playerIdOf(as.player) && occupantEmpty(bs.player) && occupantEmpty(as.player)) {
      return;
    }
    if (fingerprintOf(stripAudit(bs.player)) !== fingerprintOf(stripAudit(as.player))) {
      otherSeatBad.push(ak);
    }
  });
  if (otherSeatBad.length) {
    return reject('metadata_change', { traces: traces, rejectedChanges: otherSeatBad });
  }

  var seatBad = seatMetadataDrift(rep.beforePlayer, rep.afterPlayer, rep.outgoingUserId, rep.incomingUserId);
  if (seatBad.length) {
    return reject('metadata_change', { traces: traces, rejectedChanges: seatBad });
  }

  traces.steps.push({ id: 'pairing_entity' });
  var derivedChanges = [];
  var pairCmp = comparePairings(
    sliceForGroup(before && before.pairings, editedGroupId),
    sliceForGroup(after && after.pairings, editedGroupId),
    rep.outgoingUserId,
    rep.incomingUserId
  );
  if (!pairCmp.ok) {
    return reject(pairCmp.code, { traces: traces });
  }
  if (pairCmp.derived) {
    derivedChanges.push({ type: 'pairing_current_identity', groupId: editedGroupId });
  }
  var entCmp = compareEntities(
    sliceForGroup(before && before.scoreEntities, editedGroupId),
    sliceForGroup(after && after.scoreEntities, editedGroupId),
    rep.outgoingUserId,
    rep.incomingUserId
  );
  if (!entCmp.ok) {
    return reject(entCmp.code, { traces: traces });
  }
  if (entCmp.derived) {
    derivedChanges.push({ type: 'entity_current_identity', groupId: editedGroupId });
  }
  derivedChanges.push({
    type: 'seat_display_affiliation',
    groupId: rep.groupId,
    position: rep.position
  });

  return finish(
    Object.assign(
      {
        ok: true,
        kind: KIND.single_replacement,
        replacement: {
          groupId: rep.groupId,
          position: Number(rep.position),
          outgoingUserId: rep.outgoingUserId,
          incomingUserId: rep.incomingUserId,
          beforeScoreIdentity: deepClone(beforeScore),
          afterScoreIdentity: deepClone(afterScore)
        },
        replacementCount: 1,
        derivedChanges: derivedChanges,
        traces: traces,
        recommendedRoute: ROUTE.single_replace_journal
      },
      correctionOps(occ, setDiff, { replacements: [rep] })
    )
  );
}

module.exports = {
  KIND: KIND,
  ROUTE: ROUTE,
  SCORE_IDENTITY_KEYS: SCORE_IDENTITY_KEYS,
  classifySeriesLiveSingleReplace: classifySeriesLiveSingleReplace,
  isPersistableIdentityCorrection: isPersistableIdentityCorrection
};
