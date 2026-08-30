/**
 * Series LIVE 分组身份纠正（正式保存路径）
 * 不识别真实中途换人；位置与成绩数值是事实，仅纠正占用者身份。
 * 不写 Series roster。
 */

var tournamentGroupDraft = require('../../../utils/tournament/tournamentGroupDraft.js');
var teamMatchFinish = require('../../../utils/teamMatchFinish.js');

var SAVE_KIND = 'identity_correction';

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

function positionOf(p) {
  if (!p || typeof p !== 'object') return 0;
  var n = Number(p.position != null ? p.position : p.slotIndex);
  if (!isFinite(n) || n < 1) return 0;
  return n;
}

function rejected(code) {
  return { ok: false, status: 'rejected', code: asString(code), kind: SAVE_KIND };
}

function failedBefore(code) {
  return { ok: false, status: 'failed_before_write', code: asString(code), kind: SAVE_KIND };
}

function contextField(ctx, keys) {
  var src = ctx && typeof ctx === 'object' ? ctx : {};
  for (var i = 0; i < keys.length; i++) {
    if (src[keys[i]] != null) return src[keys[i]];
  }
  return null;
}

function matchRevisionOf(match) {
  if (!match || typeof match !== 'object') return '';
  if (match.updatedAt != null && String(match.updatedAt).trim()) return String(match.updatedAt);
  if (match.revision != null && String(match.revision).trim()) return String(match.revision);
  return '';
}

function indexSeats(groups) {
  var out = {};
  var list = Array.isArray(groups) ? groups : [];
  for (var i = 0; i < list.length; i++) {
    var g = list[i] || {};
    var gid = asString(g.groupId);
    if (!gid) continue;
    var players = Array.isArray(g.players) ? g.players : [];
    for (var j = 0; j < players.length; j++) {
      var pos = positionOf(players[j]);
      if (!pos) continue;
      out[gid + '#' + pos] = players[j];
    }
  }
  return out;
}

function holesFingerprint(player) {
  var holes = player && Object.prototype.hasOwnProperty.call(player, 'holes') ? player.holes : undefined;
  try {
    return JSON.stringify(holes);
  } catch (e) {
    return '';
  }
}

function anchorOf(player) {
  var p = player && typeof player === 'object' ? player : {};
  return [asString(p.entityId), asString(p.slotId), asString(p.pairingId)].join('|');
}

function assertSeatFacts(beforeMatch, candidateMatch) {
  var beforeSeats = indexSeats(beforeMatch && beforeMatch.groups);
  var afterSeats = indexSeats(candidateMatch && candidateMatch.groups);
  var beforeGroups = Array.isArray(beforeMatch && beforeMatch.groups) ? beforeMatch.groups : [];
  var afterGroups = Array.isArray(candidateMatch && candidateMatch.groups) ? candidateMatch.groups : [];
  var beforeIds = {};
  var afterIds = {};
  var i;
  for (i = 0; i < beforeGroups.length; i++) {
    var bgid = asString(beforeGroups[i] && beforeGroups[i].groupId);
    if (!bgid) return { ok: false, code: 'seat_anchor_damaged' };
    if (beforeIds[bgid]) return { ok: false, code: 'seat_anchor_damaged' };
    beforeIds[bgid] = true;
  }
  for (i = 0; i < afterGroups.length; i++) {
    var agid = asString(afterGroups[i] && afterGroups[i].groupId);
    if (!agid) return { ok: false, code: 'seat_anchor_damaged' };
    if (afterIds[agid]) return { ok: false, code: 'seat_anchor_damaged' };
    afterIds[agid] = true;
  }
  var keys = Object.keys(beforeSeats);
  for (i = 0; i < keys.length; i++) {
    var k = keys[i];
    var beforeP = beforeSeats[k];
    var afterP = afterSeats[k];
    if (!afterP) return { ok: false, code: 'seat_score_moved' };
    if (holesFingerprint(beforeP) !== holesFingerprint(afterP)) {
      return { ok: false, code: 'seat_score_moved' };
    }
    if (anchorOf(beforeP) !== anchorOf(afterP)) {
      return { ok: false, code: 'seat_anchor_damaged' };
    }
  }
  var seenPos = {};
  var pairingSeen = {};
  for (i = 0; i < afterGroups.length; i++) {
    var g = afterGroups[i] || {};
    var gid = asString(g.groupId);
    var players = Array.isArray(g.players) ? g.players : [];
    for (var j = 0; j < players.length; j++) {
      var pos = positionOf(players[j]);
      if (!pos) return { ok: false, code: 'seat_anchor_damaged' };
      var pk = gid + '#' + pos;
      if (seenPos[pk]) return { ok: false, code: 'seat_anchor_damaged' };
      seenPos[pk] = true;
      var pairId = asString(players[j] && players[j].pairingId);
      if (pairId) {
        var pairKey = gid + ':' + pairId + ':' + pos;
        if (pairingSeen[pairKey]) return { ok: false, code: 'seat_anchor_damaged' };
        pairingSeen[pairKey] = true;
      }
    }
  }
  return { ok: true };
}

function collectOccupiedIds(match) {
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

function buildIdentitySourceSet(series, match) {
  var set = Object.create(null);
  function add(id) {
    var uid = asString(id);
    if (uid) set[uid] = true;
  }
  var users =
    match && match.registerInfo && Array.isArray(match.registerInfo.users) ? match.registerInfo.users : [];
  var i;
  for (i = 0; i < users.length; i++) add(playerIdOf(users[i]));
  var roster = Array.isArray(series && series.roster) ? series.roster : [];
  for (i = 0; i < roster.length; i++) add(playerIdOf(roster[i]));
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  for (i = 0; i < parts.length; i++) {
    var p = parts[i] || {};
    add(p.userId);
    add(p.playerId);
    add(p.sourcePlayerId);
  }
  return set;
}

function assertOccupancyLegal(series, match) {
  var ids = collectOccupiedIds(match);
  var seen = Object.create(null);
  var source = buildIdentitySourceSet(series, match);
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    if (seen[id]) return { ok: false, code: 'duplicate' };
    seen[id] = true;
    if (!source[id]) return { ok: false, code: 'player_not_on_roster' };
  }
  return { ok: true };
}

function assertWritable(src, series, match) {
  if (typeof src.hasManagePermission !== 'function') return rejected('permission_denied');
  var allowed = !!src.hasManagePermission({
    series: series,
    match: match,
    permission: 'edit_groups',
    user: src.currentUser || src.user
  });
  if (!allowed) return rejected('permission_denied');
  var matchGuard = teamMatchFinish.assertWritable(match, {
    series: series,
    getSeriesById: src.getSeriesById
  });
  if (!matchGuard || matchGuard.ok !== true) {
    var reason = asString(matchGuard && matchGuard.reason);
    if (reason === 'series_completed') return rejected('match_completed');
    return rejected('match_completed');
  }
  return { ok: true };
}

function applyScoreOwnership(beforeMatch, candidateMatch) {
  var next = candidateMatch && typeof candidateMatch === 'object' ? candidateMatch : {};
  next.scoreData = tournamentGroupDraft.rebindLiveScoreDataToSeatPlayers(
    beforeMatch && beforeMatch.groups,
    next.groups,
    next.scoreData && typeof next.scoreData === 'object' && !Array.isArray(next.scoreData)
      ? next.scoreData
      : {}
  );
  return next;
}

function executeSeriesLiveIdentityCorrection(input) {
  var src = input && typeof input === 'object' ? input : {};
  var ctx = {};
  try {
    ctx = typeof src.reloadContext === 'function' ? src.reloadContext() || {} : {};
  } catch (eCtx) {
    return failedBefore('flow_prepare_failed');
  }
  var series = contextField(ctx, ['series', 'latestSeries', 'currentSeries']);
  var match = contextField(ctx, ['match', 'latestMatch', 'currentMatch', 'beforeMatch']);
  var stationIndex = contextField(ctx, ['stationIndex']) || {};
  if (!match || typeof match !== 'object') return failedBefore('flow_prepare_failed');

  var writable = assertWritable(src, series, match);
  if (!writable.ok) return writable;

  var latestId = asString(match.matchId) || asString(stationIndex.matchId);
  var latest = match;
  if (typeof src.getMatchById === 'function' && latestId) {
    var loaded = src.getMatchById(latestId);
    if (loaded && typeof loaded === 'object') latest = loaded;
  }
  var expectedRevision = asString(src.expectedRevision) || matchRevisionOf(match);
  var latestRevision = matchRevisionOf(latest);
  if (expectedRevision && latestRevision && expectedRevision !== latestRevision) {
    return rejected('revision_conflict');
  }

  var beforeMatch = deepClone(latest);
  var candidate;
  try {
    if (typeof src.buildCandidateFromLatestMatch !== 'function') {
      return failedBefore('flow_prepare_failed');
    }
    candidate = src.buildCandidateFromLatestMatch(latest, src.currentDraft);
  } catch (eBuild) {
    return failedBefore('flow_prepare_failed');
  }
  if (!candidate || typeof candidate !== 'object') return failedBefore('flow_prepare_failed');
  candidate = applyScoreOwnership(beforeMatch, candidate);

  var facts = assertSeatFacts(beforeMatch, candidate);
  if (!facts.ok) return rejected(facts.code);

  var occupancy = assertOccupancyLegal(series, candidate);
  if (!occupancy.ok) return rejected(occupancy.code);

  if (typeof src.validateCandidate === 'function') {
    var validated;
    try {
      validated = src.validateCandidate({
        candidateMatch: candidate,
        groups: candidate.groups,
        pairings: candidate.pairings,
        series: series,
        strokeCompositionMode: candidate.strokeCompositionMode,
        registerInfo: candidate.registerInfo,
        scoreEntities: candidate.scoreEntities,
        scoreData: candidate.scoreData,
        gameMode: candidate.gameMode,
        teamScores: candidate.teamScores,
        teamScoresByEntity: candidate.teamScoresByEntity
      });
    } catch (eVal) {
      return rejected('invalid');
    }
    if (!validated || validated.ok !== true) {
      return rejected((validated && (validated.reason || validated.code)) || 'invalid');
    }
  }

  if (typeof src.persistMatch !== 'function') return failedBefore('persist_match_required');

  var persistRes;
  try {
    persistRes = src.persistMatch(candidate, beforeMatch);
  } catch (ePersist) {
    try {
      src.persistMatch(beforeMatch, beforeMatch);
    } catch (eRestore) {
      return {
        ok: false,
        status: 'manual_review',
        requiresManualReview: true,
        code: 'restore_failed',
        kind: SAVE_KIND
      };
    }
    return {
      ok: false,
      status: 'failed_rolled_back',
      rollbackCompleted: true,
      code: 'save_failed',
      kind: SAVE_KIND
    };
  }
  if (!persistRes || persistRes.ok !== true) {
    try {
      src.persistMatch(beforeMatch, beforeMatch);
    } catch (eRestore2) {
      return {
        ok: false,
        status: 'manual_review',
        requiresManualReview: true,
        code: 'restore_failed',
        kind: SAVE_KIND
      };
    }
    return {
      ok: false,
      status: 'failed_rolled_back',
      rollbackCompleted: true,
      code: (persistRes && (persistRes.reason || persistRes.code)) || 'save_failed',
      kind: SAVE_KIND
    };
  }

  var read =
    persistRes.match ||
    (typeof src.getMatchById === 'function' ? src.getMatchById(latestId) : null);
  if (!read) {
    try {
      src.persistMatch(beforeMatch, beforeMatch);
    } catch (eRb) {
      return {
        ok: false,
        status: 'manual_review',
        requiresManualReview: true,
        code: 'restore_failed',
        kind: SAVE_KIND
      };
    }
    return {
      ok: false,
      status: 'failed_rolled_back',
      rollbackCompleted: true,
      code: 'save_failed',
      kind: SAVE_KIND
    };
  }
  var readFacts = assertSeatFacts(beforeMatch, read);
  if (!readFacts.ok) {
    try {
      src.persistMatch(beforeMatch, beforeMatch);
    } catch (eRb2) {
      return {
        ok: false,
        status: 'manual_review',
        requiresManualReview: true,
        code: 'restore_failed',
        kind: SAVE_KIND
      };
    }
    return rejected(readFacts.code);
  }
  var identOk = collectOccupiedIds(read).join('\0') === collectOccupiedIds(candidate).join('\0');
  if (!identOk) {
    try {
      src.persistMatch(beforeMatch, beforeMatch);
    } catch (eId) {
      return {
        ok: false,
        status: 'manual_review',
        requiresManualReview: true,
        code: 'restore_failed',
        kind: SAVE_KIND
      };
    }
    return rejected('readback_identity_mismatch');
  }

  return {
    ok: true,
    status: 'completed',
    kind: SAVE_KIND,
    candidateMatch: candidate,
    match: read
  };
}

module.exports = {
  SAVE_KIND: SAVE_KIND,
  executeSeriesLiveIdentityCorrection: executeSeriesLiveIdentityCorrection,
  assertSeatFacts: assertSeatFacts,
  applyScoreOwnership: applyScoreOwnership
};
