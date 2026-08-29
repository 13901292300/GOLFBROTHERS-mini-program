/**
 * Series LIVE 严格单座位变更分类器（纯函数）
 * - 不生成 candidate、不写 storage、不接页面/执行器
 * - 普通单场 LIVE 不得引用本模块
 */

var seriesStationMatch = require('../../../utils/seriesStationMatch.js');

var KIND = {
  single_replacement: 'single_replacement',
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
  var src = player && typeof player === 'object' ? player : {};
  var out = {};
  for (var i = 0; i < SCORE_IDENTITY_KEYS.length; i++) {
    var k = SCORE_IDENTITY_KEYS[i];
    if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
  }
  return out;
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
    if (fingerprintOf(stripAudit(sliceForGroup(before && before.pairings, id))) !==
      fingerprintOf(stripAudit(sliceForGroup(after && after.pairings, id)))) {
      drifted.push({ scope: 'pairings', groupId: id });
    }
    if (fingerprintOf(stripAudit(sliceForGroup(before && before.scoreEntities, id))) !==
      fingerprintOf(stripAudit(sliceForGroup(after && after.scoreEntities, id)))) {
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

function seatMetadataDrift(beforePlayer, afterPlayer, fromId, toId) {
  var a = beforePlayer && typeof beforePlayer === 'object' ? beforePlayer : {};
  var b = afterPlayer && typeof afterPlayer === 'object' ? afterPlayer : {};
  var keys = {};
  Object.keys(a).forEach(function (k) {
    keys[k] = true;
  });
  Object.keys(b).forEach(function (k) {
    keys[k] = true;
  });
  var bad = [];
  Object.keys(keys).forEach(function (k) {
    if (CURRENT_ID_KEYS[k] || DERIVED_SEAT_KEYS[k] || SCORE_IDENTITY_KEYS.indexOf(k) >= 0) return;
    if (fingerprintOf(a[k]) !== fingerprintOf(b[k])) bad.push(k);
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
    if (entityOwnerFingerprint(b[i]) !== entityOwnerFingerprint(a[i])) {
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
    out.recommendedRoute = ROUTE.single_replace_journal;
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
  if (!editedGroupId) {
    return reject('ambiguous_group', { traces: traces, kind: KIND.ambiguous });
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
  if (occ.replacements.length > 1) {
    return reject('multiple_replacements', { traces: traces, rejectedChanges: occ.replacements });
  }
  if (occ.additions.length) {
    return reject('player_addition', { traces: traces, rejectedChanges: occ.additions.concat(occ.replacements) });
  }
  if (occ.removals.length) {
    return reject('player_removal', { traces: traces, rejectedChanges: occ.removals.concat(occ.replacements) });
  }

  var cross = otherGroupsEqual(before, after, editedGroupId);
  if (cross.length) {
    return reject('cross_group_payload_drift', { traces: traces, rejectedChanges: cross });
  }

  var shell = matchShellDrift(before, after);
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
    return reject('cross_group_payload_drift', { traces: traces, rejectedChanges: [rep] });
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
  if (fingerprintOf(beforeScore) !== fingerprintOf(afterScore)) {
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

  return finish({
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
    derivedChanges: derivedChanges,
    traces: traces,
    recommendedRoute: ROUTE.single_replace_journal
  });
}

module.exports = {
  KIND: KIND,
  ROUTE: ROUTE,
  SCORE_IDENTITY_KEYS: SCORE_IDENTITY_KEYS,
  classifySeriesLiveSingleReplace: classifySeriesLiveSingleReplace
};
