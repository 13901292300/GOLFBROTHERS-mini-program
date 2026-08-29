/**
 * Series LIVE 严格单座位补录分类器（纯函数）
 * - 空座加入 B：single_seat_fill
 * - A→B 换人：player_replacement（交给既有 replace Flow）
 * - 不生成 candidate、不写 storage
 */

var seriesStationMatch = require('./seriesStationMatch.js');

var KIND = {
  single_seat_fill: 'single_seat_fill',
  player_replacement: 'player_replacement',
  player_removal: 'player_removal',
  player_move: 'player_move',
  seat_swap: 'seat_swap',
  multiple_changes: 'multiple_changes',
  incoming_already_in_round: 'incoming_already_in_round',
  ambiguous: 'ambiguous',
  unsupported: 'unsupported'
};

var ROUTE = {
  single_seat_fill_journal: 'single_seat_fill_journal',
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

var FROZEN_SCORE_KEYS = ['scorePlayerId', 'slotScorePlayerId', 'scoreOwnerId'];

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
  var src = player && typeof player === 'object' ? player : {};
  var out = {};
  for (var i = 0; i < SCORE_IDENTITY_KEYS.length; i++) {
    var k = SCORE_IDENTITY_KEYS[i];
    if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
  }
  return out;
}

function hasFrozenSeatScoreIdentity(player) {
  var src = player && typeof player === 'object' ? player : {};
  for (var i = 0; i < FROZEN_SCORE_KEYS.length; i++) {
    if (asString(src[FROZEN_SCORE_KEYS[i]])) return true;
  }
  if (src.hasHistoryScore === true) return true;
  return false;
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

function pairingStableFingerprint(row) {
  var src = row && typeof row === 'object' ? row : {};
  return fingerprintOf({
    id: src.id == null ? null : src.id,
    pairingId: src.pairingId == null ? null : src.pairingId,
    entityId: src.entityId == null ? null : src.entityId
  });
}

function pairingStableKey(row) {
  var src = row && typeof row === 'object' ? row : {};
  return (
    asString(src.pairingId) ||
    asString(src.id) ||
    asString(src.entityId)
  );
}

function entityStableFingerprint(row) {
  var src = row && typeof row === 'object' ? row : {};
  return fingerprintOf({
    id: src.id == null ? null : src.id,
    entityId: src.entityId == null ? null : src.entityId
  });
}

function entityStableKey(row) {
  var src = row && typeof row === 'object' ? row : {};
  return asString(src.entityId) || asString(src.id);
}

function entityOwnerFingerprint(row) {
  var src = row && typeof row === 'object' ? row : {};
  return fingerprintOf({
    scoreOwnerId: src.scoreOwnerId,
    ownerId: src.ownerId,
    scorePlayerId: src.scorePlayerId,
    ownerPlayerId: src.ownerPlayerId,
    slotScorePlayerId: src.slotScorePlayerId
  });
}

function collectMemberIds(row) {
  var src = row && typeof row === 'object' ? row : {};
  var ids = [];
  var seen = Object.create(null);
  function push(id) {
    var s = asString(id);
    if (!s || seen[s]) return;
    seen[s] = true;
    ids.push(s);
  }
  PAIRING_MEMBER_KEYS.forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(src, k)) return;
    var val = src[k];
    if (Array.isArray(val)) {
      val.forEach(function (item) {
        if (item && typeof item === 'object') push(playerIdOf(item));
        else push(item);
      });
    } else if (val && typeof val === 'object') {
      push(playerIdOf(val));
    } else {
      push(val);
    }
  });
  return ids;
}

function pairingRestFingerprint(row) {
  var src = row && typeof row === 'object' ? row : {};
  var rest = {};
  Object.keys(src).forEach(function (k) {
    if (PAIRING_MEMBER_KEYS.indexOf(k) >= 0) return;
    if (k === 'id' || k === 'pairingId' || k === 'entityId') return;
    rest[k] = src[k];
  });
  return fingerprintOf(rest);
}

function entityRestFingerprint(row) {
  var src = row && typeof row === 'object' ? row : {};
  var rest = {};
  Object.keys(src).forEach(function (k) {
    if (PAIRING_MEMBER_KEYS.indexOf(k) >= 0) return;
    if (k === 'id' || k === 'entityId') return;
    if (
      k === 'scoreOwnerId' ||
      k === 'ownerId' ||
      k === 'scorePlayerId' ||
      k === 'ownerPlayerId' ||
      k === 'slotScorePlayerId'
    ) {
      return;
    }
    rest[k] = src[k];
  });
  return fingerprintOf(rest);
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
      if (sameSeat(mv.from, other.to) && sameSeat(mv.to, other.from)) {
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
      additions.push({
        groupId: a.groupId,
        position: a.position,
        incomingUserId: aId,
        beforePlayer: b ? b.player : null,
        afterPlayer: a.player
      });
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
    var bg = bIdx.byId[id];
    var ag = aIdx.byId[id];
    if (fingerprintOf(stripAudit(bg)) !== fingerprintOf(stripAudit(ag))) {
      drifted.push({ scope: 'group', groupId: id });
    }
    if (
      fingerprintOf(stripAudit(sliceForGroup(before && before.pairings, id))) !==
      fingerprintOf(stripAudit(sliceForGroup(after && after.pairings, id)))
    ) {
      drifted.push({ scope: 'pairings', groupId: id });
    }
    if (
      fingerprintOf(stripAudit(sliceForGroup(before && before.scoreEntities, id))) !==
      fingerprintOf(stripAudit(sliceForGroup(after && after.scoreEntities, id)))
    ) {
      drifted.push({ scope: 'scoreEntities', groupId: id });
    }
  });
  return drifted;
}

function matchShellDrift(before, after) {
  var keys = ['matchId', 'seriesContext', 'gameMode', 'status', 'scoreData', 'teamScores', 'teamScoresByEntity'];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (fingerprintOf(stripAudit(before && before[k])) !== fingerprintOf(stripAudit(after && after[k]))) {
      return k;
    }
  }
  return '';
}

function groupMetaDrift(beforeGroup, afterGroup) {
  var bg = beforeGroup && typeof beforeGroup === 'object' ? beforeGroup : {};
  var ag = afterGroup && typeof afterGroup === 'object' ? afterGroup : {};
  var skip = { players: true };
  var keys = {};
  Object.keys(bg).forEach(function (k) {
    if (!skip[k]) keys[k] = true;
  });
  Object.keys(ag).forEach(function (k) {
    if (!skip[k]) keys[k] = true;
  });
  var bad = [];
  Object.keys(keys).forEach(function (k) {
    if (fingerprintOf(stripAudit(bg[k])) !== fingerprintOf(stripAudit(ag[k]))) bad.push(k);
  });
  return bad;
}

function membersOnlyAddIncoming(beforeIds, afterIds, incomingId) {
  var incoming = asString(incomingId);
  var b = Object.create(null);
  var a = Object.create(null);
  (beforeIds || []).forEach(function (id) {
    if (id) b[id] = true;
  });
  (afterIds || []).forEach(function (id) {
    if (id) a[id] = true;
  });
  var id;
  for (id in b) {
    if (!a[id]) return { ok: false, code: 'pairing_structure_drift' };
  }
  for (id in a) {
    if (!b[id] && id !== incoming) return { ok: false, code: 'pairing_structure_drift' };
  }
  return {
    ok: true,
    derived: !!(incoming && !b[incoming] && a[incoming])
  };
}

function indexByStable(list, keyFn, fpFn) {
  var map = Object.create(null);
  var missing = false;
  var dup = false;
  for (var i = 0; i < list.length; i++) {
    var key = keyFn(list[i]);
    if (!key) {
      missing = true;
      continue;
    }
    if (map[key]) dup = true;
    map[key] = { row: list[i], fp: fpFn(list[i]), index: i };
  }
  return { map: map, missing: missing, dup: dup };
}

function compareFillPairings(beforeSlice, afterSlice, incomingId, allowNew) {
  var b = asList(beforeSlice);
  var a = asList(afterSlice);
  if (!b.length && !a.length) return { ok: true, derived: false };
  var derived = false;
  var incoming = asString(incomingId);

  if (b.length === a.length) {
    for (var i = 0; i < b.length; i++) {
      if (pairingStableFingerprint(b[i]) !== pairingStableFingerprint(a[i])) {
        return { ok: false, code: 'pairing_identity_drift' };
      }
      if (pairingRestFingerprint(b[i]) !== pairingRestFingerprint(a[i])) {
        return { ok: false, code: 'pairing_structure_drift' };
      }
      var delta = membersOnlyAddIncoming(collectMemberIds(b[i]), collectMemberIds(a[i]), incoming);
      if (!delta.ok) return { ok: false, code: 'pairing_structure_drift' };
      if (delta.derived) derived = true;
    }
    return { ok: true, derived: derived };
  }

  if (a.length < b.length) {
    return { ok: false, code: 'pairing_structure_drift' };
  }
  if (!allowNew) {
    return { ok: false, code: 'pairing_structure_drift' };
  }

  var bIdx = indexByStable(b, pairingStableKey, pairingStableFingerprint);
  var aIdx = indexByStable(a, pairingStableKey, pairingStableFingerprint);
  if (bIdx.missing || aIdx.missing || bIdx.dup || aIdx.dup) {
    return { ok: false, code: 'pairing_identity_drift' };
  }
  var bk;
  for (bk in bIdx.map) {
    if (!aIdx.map[bk]) return { ok: false, code: 'pairing_identity_drift' };
    if (bIdx.map[bk].fp !== aIdx.map[bk].fp) {
      return { ok: false, code: 'pairing_identity_drift' };
    }
    if (pairingRestFingerprint(bIdx.map[bk].row) !== pairingRestFingerprint(aIdx.map[bk].row)) {
      return { ok: false, code: 'pairing_structure_drift' };
    }
    var d2 = membersOnlyAddIncoming(
      collectMemberIds(bIdx.map[bk].row),
      collectMemberIds(aIdx.map[bk].row),
      incoming
    );
    if (!d2.ok) return { ok: false, code: 'pairing_structure_drift' };
    if (d2.derived) derived = true;
  }
  var ak;
  for (ak in aIdx.map) {
    if (bIdx.map[ak]) continue;
    var extraIds = collectMemberIds(aIdx.map[ak].row);
    if (extraIds.indexOf(incoming) < 0) {
      return { ok: false, code: 'pairing_structure_drift' };
    }
    derived = true;
  }
  return { ok: true, derived: derived };
}

function compareFillEntities(beforeSlice, afterSlice, incomingId, allowNew) {
  var b = asList(beforeSlice);
  var a = asList(afterSlice);
  if (!b.length && !a.length) return { ok: true, derived: false };
  var derived = false;
  var incoming = asString(incomingId);

  if (b.length === a.length) {
    for (var i = 0; i < b.length; i++) {
      if (entityStableFingerprint(b[i]) !== entityStableFingerprint(a[i])) {
        return { ok: false, code: 'entity_structure_drift' };
      }
      if (entityOwnerFingerprint(b[i]) !== entityOwnerFingerprint(a[i])) {
        return { ok: false, code: 'score_owner_drift' };
      }
      if (entityRestFingerprint(b[i]) !== entityRestFingerprint(a[i])) {
        return { ok: false, code: 'entity_structure_drift' };
      }
      var delta = membersOnlyAddIncoming(collectMemberIds(b[i]), collectMemberIds(a[i]), incoming);
      if (!delta.ok) return { ok: false, code: 'entity_structure_drift' };
      if (delta.derived) derived = true;
    }
    return { ok: true, derived: derived };
  }

  if (a.length < b.length) {
    return { ok: false, code: 'entity_structure_drift' };
  }
  if (!allowNew) {
    return { ok: false, code: 'entity_structure_drift' };
  }

  var bIdx = indexByStable(b, entityStableKey, entityStableFingerprint);
  var aIdx = indexByStable(a, entityStableKey, entityStableFingerprint);
  if (bIdx.missing || aIdx.missing || bIdx.dup || aIdx.dup) {
    return { ok: false, code: 'entity_structure_drift' };
  }
  var bk;
  for (bk in bIdx.map) {
    if (!aIdx.map[bk]) return { ok: false, code: 'entity_structure_drift' };
    if (bIdx.map[bk].fp !== aIdx.map[bk].fp) {
      return { ok: false, code: 'entity_structure_drift' };
    }
    if (entityOwnerFingerprint(bIdx.map[bk].row) !== entityOwnerFingerprint(aIdx.map[bk].row)) {
      return { ok: false, code: 'score_owner_drift' };
    }
    if (entityRestFingerprint(bIdx.map[bk].row) !== entityRestFingerprint(aIdx.map[bk].row)) {
      return { ok: false, code: 'entity_structure_drift' };
    }
    var d2 = membersOnlyAddIncoming(
      collectMemberIds(bIdx.map[bk].row),
      collectMemberIds(aIdx.map[bk].row),
      incoming
    );
    if (!d2.ok) return { ok: false, code: 'entity_structure_drift' };
    if (d2.derived) derived = true;
  }
  var ak;
  for (ak in aIdx.map) {
    if (bIdx.map[ak]) continue;
    var extraIds = collectMemberIds(aIdx.map[ak].row);
    if (extraIds.indexOf(incoming) < 0) {
      return { ok: false, code: 'entity_structure_drift' };
    }
    derived = true;
  }
  return { ok: true, derived: derived };
}

function finish(extra) {
  var out = Object.assign(
    {
      ok: false,
      kind: KIND.unsupported,
      code: '',
      fill: null,
      derivedChanges: [],
      rejectedChanges: [],
      traces: { steps: [] },
      recommendedRoute: ROUTE.reject_unsupported
    },
    extra || {}
  );
  if (out.ok === true) {
    out.recommendedRoute = ROUTE.single_seat_fill_journal;
    out.kind = KIND.single_seat_fill;
  } else {
    out.recommendedRoute = ROUTE.reject_unsupported;
    out.ok = false;
  }
  return out;
}

function reject(code, extra) {
  var kind = KIND.unsupported;
  if (code === 'ambiguous_group' || code === 'ambiguous_position') kind = KIND.ambiguous;
  if (code === 'player_replacement') kind = KIND.player_replacement;
  if (code === 'player_removal') kind = KIND.player_removal;
  if (code === 'player_move') kind = KIND.player_move;
  if (code === 'seat_swap') kind = KIND.seat_swap;
  if (code === 'multiple_changes') kind = KIND.multiple_changes;
  if (code === 'incoming_already_in_round') kind = KIND.incoming_already_in_round;
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

function classifySeriesLiveSingleSeatFill(input) {
  var src = input && typeof input === 'object' ? input : {};
  var before = src.beforeMatch;
  var after = src.candidateMatch;
  var editedGroupId = asString(src.editedGroupId);
  var targetPosition = Number(src.targetPosition);
  var traces = { steps: [] };

  traces.steps.push({ id: 'identity_index' });
  var beforeIdx = inspectGroups(groupList(before));
  var afterIdx = inspectGroups(groupList(after));
  if (beforeIdx.missingGroup || afterIdx.missingGroup || beforeIdx.dupGroup || afterIdx.dupGroup) {
    return reject('ambiguous_group', { traces: traces, kind: KIND.ambiguous });
  }
  if (beforeIdx.missingPos || afterIdx.missingPos || beforeIdx.dupPos || afterIdx.dupPos) {
    return reject('ambiguous_position', { traces: traces, kind: KIND.ambiguous });
  }
  if (!editedGroupId || !beforeIdx.byId[editedGroupId] || !afterIdx.byId[editedGroupId]) {
    return reject('ambiguous_group', { traces: traces, kind: KIND.ambiguous });
  }
  if (!isFinite(targetPosition) || targetPosition < 1) {
    return reject('ambiguous_position', { traces: traces, kind: KIND.ambiguous });
  }
  var targetKey = seatKey(editedGroupId, targetPosition);
  if (!beforeIdx.seats[targetKey] || !afterIdx.seats[targetKey]) {
    return reject('ambiguous_position', { traces: traces, kind: KIND.ambiguous });
  }

  traces.steps.push({ id: 'occupancy' });
  var occ = classifyOccupancy(beforeIdx, afterIdx);
  traces.occupancy = {
    replacements: occ.replacements.length,
    moves: occ.moves.length,
    swaps: occ.swaps.length,
    additions: occ.additions.length,
    removals: occ.removals.length
  };

  if (occ.duplicateAfter.length) {
    return reject('incoming_already_in_round', {
      traces: traces,
      rejectedChanges: occ.duplicateAfter.map(function (id) {
        return { kind: 'duplicate_after', userId: id };
      })
    });
  }
  if (occ.swaps.length) {
    return reject('seat_swap', { traces: traces, rejectedChanges: occ.swaps });
  }
  if (occ.moves.length) {
    return reject('player_move', { traces: traces, rejectedChanges: occ.moves });
  }
  if (occ.replacements.length && occ.additions.length) {
    return reject('multiple_changes', {
      traces: traces,
      rejectedChanges: occ.replacements.concat(occ.additions)
    });
  }
  if (occ.replacements.length) {
    return reject('player_replacement', { traces: traces, rejectedChanges: occ.replacements });
  }
  if (occ.removals.length) {
    return reject('player_removal', { traces: traces, rejectedChanges: occ.removals.concat(occ.additions) });
  }
  if (occ.additions.length !== 1) {
    return reject('multiple_changes', { traces: traces, rejectedChanges: occ.additions });
  }

  var add = occ.additions[0];
  if (asString(add.groupId) !== editedGroupId || Number(add.position) !== Number(targetPosition)) {
    return reject('multiple_changes', { traces: traces, rejectedChanges: [add] });
  }
  var beforeSeat = beforeIdx.seats[targetKey];
  var afterSeat = afterIdx.seats[targetKey];
  if (asString(beforeSeat.userId)) {
    return reject('not_empty_before', { traces: traces });
  }
  var incomingUserId = asString(afterSeat.userId);
  if (!incomingUserId) {
    return reject('ambiguous_position', { traces: traces, kind: KIND.ambiguous });
  }
  if (asString(add.incomingUserId) !== incomingUserId) {
    return reject('ambiguous_position', { traces: traces, kind: KIND.ambiguous });
  }
  if (beforeIdx.users[incomingUserId] && beforeIdx.users[incomingUserId].length) {
    return reject('incoming_already_in_round', {
      traces: traces,
      rejectedChanges: [{ userId: incomingUserId }]
    });
  }

  var cross = otherGroupsEqual(before, after, editedGroupId);
  if (cross.length) {
    return reject('cross_group_payload_drift', { traces: traces, rejectedChanges: cross });
  }

  var shell = matchShellDrift(before, after);
  if (shell) {
    return reject('metadata_change', { traces: traces, rejectedChanges: [{ field: shell }] });
  }

  traces.steps.push({ id: 'edited_group_meta' });
  var metaKeys = groupMetaDrift(beforeIdx.byId[editedGroupId], afterIdx.byId[editedGroupId]);
  if (metaKeys.length) {
    return reject('metadata_change', { traces: traces, rejectedChanges: metaKeys });
  }

  var bgPlayers = Array.isArray(beforeIdx.byId[editedGroupId].players)
    ? beforeIdx.byId[editedGroupId].players
    : [];
  var otherSeatBad = [];
  bgPlayers.forEach(function (p) {
    var pos = positionOf(p);
    if (pos === Number(targetPosition)) return;
    var ak = seatKey(editedGroupId, pos);
    var bs = beforeIdx.seats[ak];
    var as = afterIdx.seats[ak];
    if (!bs || !as) {
      otherSeatBad.push(ak);
      return;
    }
    if (fingerprintOf(stripAudit(bs.player)) !== fingerprintOf(stripAudit(as.player))) {
      otherSeatBad.push(ak);
    }
  });
  if (otherSeatBad.length) {
    return reject('metadata_change', { traces: traces, rejectedChanges: otherSeatBad });
  }

  traces.steps.push({ id: 'score_identity' });
  var beforePlayer = beforeSeat.player;
  var afterPlayer = afterSeat.player;
  var inherited = hasFrozenSeatScoreIdentity(beforePlayer);
  var beforeScore = pickScoreIdentity(beforePlayer);
  var afterScore = pickScoreIdentity(afterPlayer);
  var scoreIdentityMode = inherited ? 'inherited' : 'new';

  if (inherited) {
    for (var fi = 0; fi < FROZEN_SCORE_KEYS.length; fi++) {
      var fk = FROZEN_SCORE_KEYS[fi];
      var bv = asString(beforePlayer && beforePlayer[fk]);
      if (!bv) continue;
      if (asString(afterPlayer && afterPlayer[fk]) !== bv) {
        return reject('score_identity_drift', {
          traces: traces,
          fill: {
            groupId: editedGroupId,
            position: targetPosition,
            incomingUserId: incomingUserId,
            scoreIdentityMode: scoreIdentityMode,
            beforeScoreIdentity: beforeScore,
            afterScoreIdentity: afterScore
          }
        });
      }
    }
    if (asString(afterPlayer && afterPlayer.scorePlayerId) === incomingUserId &&
        asString(beforePlayer && beforePlayer.scorePlayerId) &&
        asString(beforePlayer.scorePlayerId) !== incomingUserId) {
      return reject('score_identity_drift', { traces: traces });
    }
    if (asString(beforePlayer && beforePlayer.entityId) &&
        asString(afterPlayer && afterPlayer.entityId) !== asString(beforePlayer.entityId)) {
      return reject('score_identity_drift', { traces: traces });
    }
  } else {
    if (asString(afterPlayer && afterPlayer.scorePlayerId) !== incomingUserId) {
      return reject('score_identity_drift', {
        traces: traces,
        fill: {
          groupId: editedGroupId,
          position: targetPosition,
          incomingUserId: incomingUserId,
          scoreIdentityMode: scoreIdentityMode,
          beforeScoreIdentity: beforeScore,
          afterScoreIdentity: afterScore
        }
      });
    }
  }

  traces.steps.push({ id: 'pairing_entity' });
  var allowNew = !inherited;
  var derivedChanges = [];
  var pairCmp = compareFillPairings(
    sliceForGroup(before && before.pairings, editedGroupId),
    sliceForGroup(after && after.pairings, editedGroupId),
    incomingUserId,
    allowNew
  );
  if (!pairCmp.ok) {
    return reject(pairCmp.code, { traces: traces });
  }
  if (pairCmp.derived) {
    derivedChanges.push({ type: 'pairing_current_members', groupId: editedGroupId });
  }
  var entCmp = compareFillEntities(
    sliceForGroup(before && before.scoreEntities, editedGroupId),
    sliceForGroup(after && after.scoreEntities, editedGroupId),
    incomingUserId,
    allowNew
  );
  if (!entCmp.ok) {
    return reject(entCmp.code, { traces: traces });
  }
  if (entCmp.derived) {
    derivedChanges.push({ type: 'entity_current_members', groupId: editedGroupId });
  }
  derivedChanges.push({
    type: 'seat_current_identity',
    groupId: editedGroupId,
    position: targetPosition
  });

  var afterPart = asString(afterPlayer && afterPlayer.seriesParticipantId);

  return finish({
    ok: true,
    kind: KIND.single_seat_fill,
    fill: {
      groupId: editedGroupId,
      position: Number(targetPosition),
      incomingUserId: incomingUserId,
      seriesParticipantId: afterPart,
      scoreIdentityMode: scoreIdentityMode,
      beforeScoreIdentity: deepClone(beforeScore),
      afterScoreIdentity: deepClone(afterScore)
    },
    derivedChanges: derivedChanges,
    traces: traces,
    recommendedRoute: ROUTE.single_seat_fill_journal
  });
}

module.exports = {
  KIND: KIND,
  ROUTE: ROUTE,
  SCORE_IDENTITY_KEYS: SCORE_IDENTITY_KEYS,
  classifySeriesLiveSingleSeatFill: classifySeriesLiveSingleSeatFill
};
