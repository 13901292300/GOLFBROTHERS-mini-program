'use strict';

var SCORE_SCHEMA_VERSION = 2;

function asStr(v) {
  return v == null ? '' : String(v).trim();
}

function filled(v) {
  return v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v));
}

function scoreDocId(matchId, roundId, hole, entityKind, entityId) {
  return [asStr(matchId), asStr(roundId || 'r1'), String(Number(hole) || 0), asStr(entityKind || 'player'), asStr(entityId)].join('__');
}

function walkIds(node, map) {
  if (!node) return;
  if (typeof node === 'string' || typeof node === 'number') {
    var s = asStr(node);
    if (s && s !== 'me' && s !== 'mock' && s !== 'demo') map[s] = true;
    return;
  }
  if (Array.isArray(node)) {
    node.forEach(function (n) {
      walkIds(n, map);
    });
    return;
  }
  if (typeof node !== 'object') return;
  walkIds(node.userId || node.playerId || node.id, map);
  if (Array.isArray(node.members)) walkIds(node.members, map);
  if (Array.isArray(node.playerIds)) walkIds(node.playerIds, map);
  if (Array.isArray(node.users)) walkIds(node.users, map);
}

function entityContainsUser(body, patch, userId) {
  var uid = asStr(userId);
  var entityId = asStr(patch && (patch.entityId || patch.playerId));
  var kind = asStr((patch && patch.entityKind) || 'player') || 'player';
  var groupId = asStr(patch && patch.groupId);
  if (!uid || !entityId) return false;
  if (kind === 'player') return entityId === uid;
  var b = body && typeof body === 'object' ? body : {};
  var hit = {};
  (Array.isArray(b.groups) ? b.groups : []).forEach(function (g) {
    if (!g) return;
    var gid = asStr(g.groupId || g.id);
    if (groupId && gid && gid !== groupId) return;
    (Array.isArray(g.players) ? g.players : []).concat(Array.isArray(g.playersSlots) ? g.playersSlots : []).forEach(function (p) {
      if (!p) return;
      var pid = asStr(p.id || p.entityId || p.teamId || p.userId);
      if (pid === entityId || asStr(p.userId) === entityId) walkIds(p, hit);
    });
  });
  var pairings = b.pairings && typeof b.pairings === 'object' ? b.pairings : {};
  Object.keys(pairings).forEach(function (gid) {
    if (groupId && gid !== groupId) return;
    (pairings[gid] || []).forEach(function (row) {
      var rid = asStr(row && (row.entityId || row.id || row.sideId));
      if (rid === entityId) walkIds(row, hit);
    });
  });
  return !!hit[uid];
}

function scoreRole(userId, member, matchDoc, team, matchDocLib) {
  var access = matchDocLib.writeAccess(userId, member, matchDoc, team);
  if (access === 'closeout') return 'closeout';
  if (access === 'full') return 'manage';
  if (!matchDocLib.isActiveMember(member)) return 'none';
  var parts = Array.isArray(matchDoc.participantUserIds) ? matchDoc.participantUserIds : [];
  if (parts.indexOf(String(userId)) >= 0) return 'self';
  return 'none';
}

function assertScoreWrite(userId, member, matchDoc, team, patch, mode, matchDocLib) {
  var role = scoreRole(userId, member, matchDoc, team, matchDocLib);
  if (mode === 'complete') {
    if (role === 'manage' || role === 'closeout') return null;
    return { code: 'forbidden', message: '无权完赛' };
  }
  var st = String((matchDoc && matchDoc.status) || '').toLowerCase();
  if (mode !== 'correct' && (st === 'finished' || st === 'cancelled' || st === 'canceled')) {
    return { code: 'match_closed', message: '比赛已结束，不能继续记分' };
  }
  if (role === 'closeout' || role === 'none') {
    return { code: 'forbidden', message: '无权记分' };
  }
  if (mode === 'correct' && role !== 'manage') {
    return { code: 'forbidden', message: '无权纠错' };
  }
  if (role === 'manage') return null;
  if (!entityContainsUser(matchDoc.body, patch, userId)) {
    return { code: 'forbidden', message: '只能记录自己或被授权组合的成绩' };
  }
  return null;
}

function flattenScoreData(matchId, teamId, scoreData, roundId) {
  var out = [];
  var data = scoreData && typeof scoreData === 'object' && !Array.isArray(scoreData) ? scoreData : {};
  Object.keys(data).forEach(function (groupId) {
    var bucket = data[groupId];
    if (!bucket || typeof bucket !== 'object') return;
    var sbp = bucket.scoresByPlayer && typeof bucket.scoresByPlayer === 'object' ? bucket.scoresByPlayer : {};
    Object.keys(sbp).forEach(function (pid) {
      var rec = sbp[pid] || {};
      var scores = Array.isArray(rec.scores) ? rec.scores : [];
      var putts = Array.isArray(rec.putts) ? rec.putts : [];
      for (var i = 0; i < Math.max(scores.length, putts.length); i++) {
        if (!filled(scores[i]) && !filled(putts[i])) continue;
        out.push({
          matchId: matchId,
          teamId: teamId,
          roundId: roundId || 'r1',
          hole: i + 1,
          entityKind: 'player',
          entityId: pid,
          groupId: groupId,
          strokes: filled(scores[i]) ? Number(scores[i]) : null,
          putts: filled(putts[i]) ? Number(putts[i]) : null
        });
      }
    });
    var entities = Array.isArray(bucket.teamScoresByEntity) ? bucket.teamScoresByEntity : [];
    entities.forEach(function (rec) {
      if (!rec) return;
      var eid = asStr(rec.entityId || rec.teamId);
      var scores = Array.isArray(rec.scores) ? rec.scores : [];
      var putts = Array.isArray(rec.putts) ? rec.putts : [];
      for (var j = 0; j < Math.max(scores.length, putts.length); j++) {
        if (!filled(scores[j]) && !filled(putts[j])) continue;
        out.push({
          matchId: matchId,
          teamId: teamId,
          roundId: roundId || 'r1',
          hole: j + 1,
          entityKind: 'entity',
          entityId: eid,
          groupId: groupId,
          strokes: filled(scores[j]) ? Number(scores[j]) : null,
          putts: filled(putts[j]) ? Number(putts[j]) : null
        });
      }
    });
    var sides = bucket.scoresBySide && typeof bucket.scoresBySide === 'object' ? bucket.scoresBySide : {};
    Object.keys(sides).forEach(function (sid) {
      var rec = sides[sid] || {};
      var scores = Array.isArray(rec.scores) ? rec.scores : [];
      var putts = Array.isArray(rec.putts) ? rec.putts : [];
      for (var k = 0; k < Math.max(scores.length, putts.length); k++) {
        if (!filled(scores[k]) && !filled(putts[k])) continue;
        out.push({
          matchId: matchId,
          teamId: teamId,
          roundId: roundId || 'r1',
          hole: k + 1,
          entityKind: 'side',
          entityId: sid,
          groupId: groupId,
          strokes: filled(scores[k]) ? Number(scores[k]) : null,
          putts: filled(putts[k]) ? Number(putts[k]) : null
        });
      }
    });
  });
  return out;
}

function assembleScoreData(rows) {
  var scoreData = {};
  (rows || []).forEach(function (row) {
    if (!row) return;
    var gid = asStr(row.groupId) || '_';
    if (!scoreData[gid]) {
      scoreData[gid] = { scoresByPlayer: {}, teamScoresByEntity: [], scoresBySide: {} };
    }
    var bucket = scoreData[gid];
    var hole = Number(row.hole) || 0;
    var idx = hole > 0 ? hole - 1 : 0;
    var kind = asStr(row.entityKind) || 'player';
    if (kind === 'player') {
      if (!bucket.scoresByPlayer[row.entityId]) bucket.scoresByPlayer[row.entityId] = { scores: [], putts: [] };
      var rec = bucket.scoresByPlayer[row.entityId];
      rec.scores[idx] = row.strokes;
      if (row.putts != null) rec.putts[idx] = row.putts;
    } else if (kind === 'side') {
      if (!bucket.scoresBySide[row.entityId]) bucket.scoresBySide[row.entityId] = { scores: [], putts: [] };
      var side = bucket.scoresBySide[row.entityId];
      side.scores[idx] = row.strokes;
      if (row.putts != null) side.putts[idx] = row.putts;
    } else {
      var found = null;
      bucket.teamScoresByEntity.forEach(function (e) {
        if (e && asStr(e.entityId) === asStr(row.entityId)) found = e;
      });
      if (!found) {
        found = { entityId: row.entityId, scores: [], putts: [] };
        bucket.teamScoresByEntity.push(found);
      }
      found.scores[idx] = row.strokes;
      if (row.putts != null) found.putts[idx] = row.putts;
    }
  });
  return scoreData;
}

function assembleScoreVersions(rows) {
  var map = {};
  (rows || []).forEach(function (row) {
    if (!row) return;
    map[scoreDocId(row.matchId, row.roundId, row.hole, row.entityKind, row.entityId)] = Number(row.version || 0);
  });
  return map;
}

function computeSummary(rows) {
  var playerGross = {};
  var holesPlayed = 0;
  var lastUpdatedAt = 0;
  (rows || []).forEach(function (row) {
    if (!row) return;
    holesPlayed += 1;
    lastUpdatedAt = Math.max(lastUpdatedAt, Number(row.updatedAt || 0));
    if (asStr(row.entityKind) === 'player' && filled(row.strokes)) {
      var id = asStr(row.entityId);
      playerGross[id] = Number(playerGross[id] || 0) + Number(row.strokes);
    }
  });
  return { holesPlayed: holesPlayed, playerGross: playerGross, lastUpdatedAt: lastUpdatedAt };
}

function stripClientScoreData(body) {
  if (!body || typeof body !== 'object') return body;
  var next = Object.assign({}, body);
  delete next.scoreData;
  delete next.scoreSummary;
  return next;
}

function diffScorePatches(prevMatch, nextMatch) {
  var prev = flattenScoreData(
    nextMatch && nextMatch.matchId,
    nextMatch && nextMatch.teamId,
    prevMatch && prevMatch.scoreData,
    'r1'
  );
  var next = flattenScoreData(
    nextMatch && nextMatch.matchId,
    nextMatch && nextMatch.teamId,
    nextMatch && nextMatch.scoreData,
    'r1'
  );
  var prevMap = {};
  prev.forEach(function (row) {
    prevMap[scoreDocId(row.matchId, row.roundId, row.hole, row.entityKind, row.entityId)] = row;
  });
  var patches = [];
  next.forEach(function (row) {
    var id = scoreDocId(row.matchId, row.roundId, row.hole, row.entityKind, row.entityId);
    var old = prevMap[id];
    if (!old || Number(old.strokes) !== Number(row.strokes) || Number(old.putts) !== Number(row.putts)) {
      patches.push(row);
    }
  });
  return patches;
}

module.exports = {
  SCORE_SCHEMA_VERSION: SCORE_SCHEMA_VERSION,
  scoreDocId: scoreDocId,
  entityContainsUser: entityContainsUser,
  scoreRole: scoreRole,
  assertScoreWrite: assertScoreWrite,
  flattenScoreData: flattenScoreData,
  assembleScoreData: assembleScoreData,
  assembleScoreVersions: assembleScoreVersions,
  computeSummary: computeSummary,
  stripClientScoreData: stripClientScoreData,
  diffScorePatches: diffScorePatches
};
