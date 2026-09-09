'use strict';

/**
 * 纯函数：用 durable outbox / held 行生成字段级 pending mask，
 * 并在 cloud scoreData 写入本机前做保护 merge。
 * 不读写 storage、不 flush、不弹 UI。
 */

function isFilledScore(v) {
  if (v === null || v === undefined || v === '') return false;
  if (typeof v === 'string' && String(v).trim() === '') return false;
  var n = Number(v);
  return !Number.isNaN(n);
}

function asStr(v) {
  return v == null ? '' : String(v);
}

function fieldKey(parts) {
  return [
    asStr(parts.matchId),
    asStr(parts.roundId || 'r1'),
    asStr(parts.groupId),
    asStr(parts.entityKind || 'player'),
    asStr(parts.entityId),
    String(Number(parts.hole) || 0),
    asStr(parts.field || 'strokes')
  ].join('\u0001');
}

function maskHas(mask, spec) {
  if (!mask) return false;
  if (mask[fieldKey(spec)]) return true;
  if (spec && spec.groupId) {
    var fallback = {
      matchId: spec.matchId,
      roundId: spec.roundId,
      groupId: '',
      entityKind: spec.entityKind,
      entityId: spec.entityId,
      hole: spec.hole,
      field: spec.field
    };
    return !!mask[fieldKey(fallback)];
  }
  return false;
}

function markField(mask, row, field) {
  if (!mask || !row || !field) return;
  var hole = Number(row.hole);
  var entityId = asStr(row.entityId || '');
  if (!entityId || !hole) return;
  mask[
    fieldKey({
      matchId: row.matchId,
      roundId: row.roundId,
      groupId: row.groupId,
      entityKind: row.entityKind || 'player',
      entityId: entityId,
      hole: hole,
      field: field
    })
  ] = true;
}

function rowHasExplicit(row, field) {
  if (!row) return false;
  if (field === 'strokes') {
    if (row.strokes != null && row.strokes !== '') return true;
    if (row.localAttempt && row.localAttempt.strokes != null && row.localAttempt.strokes !== '') return true;
    return false;
  }
  if (field === 'putts') {
    if (row.putts != null && row.putts !== '') return true;
    if (row.localAttempt && row.localAttempt.putts != null && row.localAttempt.putts !== '') return true;
    return false;
  }
  return false;
}

function buildPendingFieldMask(rows, matchId) {
  var mask = Object.create(null);
  var filterId = matchId != null && String(matchId) !== '' ? String(matchId) : '';
  (rows || []).forEach(function (row) {
    if (!row) return;
    if (filterId && asStr(row.matchId) !== filterId) return;
    var mode = asStr(row.mode);
    var op = asStr(row.operationId);
    var scoreField = mode === 'score' || /:score$/.test(op) || rowHasExplicit(row, 'strokes');
    var puttField = mode === 'putt' || /:putt$/.test(op) || rowHasExplicit(row, 'putts');
    if (!scoreField && !puttField) scoreField = true;
    if (scoreField) markField(mask, row, 'strokes');
    if (puttField) markField(mask, row, 'putts');
  });
  return mask;
}

function keepLocalArray(localArr, remoteArr) {
  if (Array.isArray(localArr)) return localArr.slice();
  if (Array.isArray(remoteArr)) return remoteArr.slice();
  return localArr;
}

function mergeHoleArray(localArr, remoteArr, specBase, field, mask) {
  var local = Array.isArray(localArr) ? localArr : [];
  var remote = Array.isArray(remoteArr) ? remoteArr : [];
  var max = Math.max(local.length, remote.length);
  var out = [];
  for (var i = 0; i < max; i++) {
    var pending = maskHas(
      mask,
      Object.assign({}, specBase, { hole: i + 1, field: field })
    );
    var hasLocal = i < local.length;
    var rv = i < remote.length ? remote[i] : undefined;
    if (pending) {
      if (hasLocal) out[i] = local[i];
      continue;
    }
    if (isFilledScore(rv)) out[i] = rv;
    else if (hasLocal) out[i] = local[i];
  }
  return out;
}

function mergeScoreRecord(localRec, remoteRec, specBase, mask) {
  var local = localRec && typeof localRec === 'object' && !Array.isArray(localRec) ? localRec : {};
  var remote = remoteRec && typeof remoteRec === 'object' && !Array.isArray(remoteRec) ? remoteRec : {};
  var out = {};
  Object.keys(local).forEach(function (k) {
    var v = local[k];
    out[k] = Array.isArray(v) ? v.slice() : v;
  });
  Object.keys(remote).forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(out, k)) {
      var rv = remote[k];
      out[k] = Array.isArray(rv) ? rv.slice() : rv;
    }
  });
  out.scores = mergeHoleArray(local.scores, remote.scores, specBase, 'strokes', mask);
  out.putts = mergeHoleArray(local.putts, remote.putts, specBase, 'putts', mask);
  out.puttsManual = keepLocalArray(local.puttsManual, remote.puttsManual);
  if (Array.isArray(local.fairways) || Array.isArray(remote.fairways)) {
    out.fairways = keepLocalArray(local.fairways, remote.fairways);
  }
  if (Array.isArray(local.penalties) || Array.isArray(remote.penalties)) {
    out.penalties = keepLocalArray(local.penalties, remote.penalties);
  }
  if (Array.isArray(local.sands) || Array.isArray(remote.sands)) {
    out.sands = keepLocalArray(local.sands, remote.sands);
  }
  return out;
}

function collectPlayerIds(localMap, remoteMap) {
  var ids = [];
  var seen = Object.create(null);
  function add(map) {
    if (!map || typeof map !== 'object') return;
    Object.keys(map).forEach(function (id) {
      var k = asStr(id);
      if (!k || seen[k]) return;
      seen[k] = true;
      ids.push(k);
    });
  }
  add(localMap);
  add(remoteMap);
  return ids;
}

function mergeScoresByPlayer(localMap, remoteMap, specBase, mask) {
  var local = localMap && typeof localMap === 'object' && !Array.isArray(localMap) ? localMap : {};
  var remote = remoteMap && typeof remoteMap === 'object' && !Array.isArray(remoteMap) ? remoteMap : {};
  var out = {};
  collectPlayerIds(local, remote).forEach(function (pid) {
    out[pid] = mergeScoreRecord(
      local[pid],
      remote[pid],
      Object.assign({}, specBase, { entityKind: 'player', entityId: pid }),
      mask
    );
  });
  return out;
}

function entityIdOf(rec) {
  if (!rec || typeof rec !== 'object') return '';
  return asStr(rec.entityId || rec.teamId);
}

function indexEntities(list) {
  var map = Object.create(null);
  (Array.isArray(list) ? list : []).forEach(function (rec) {
    var id = entityIdOf(rec);
    if (id) map[id] = rec;
  });
  return map;
}

function mergeTeamScoresByEntity(localList, remoteList, specBase, mask) {
  var local = Array.isArray(localList) ? localList : [];
  var remote = Array.isArray(remoteList) ? remoteList : [];
  var localMap = indexEntities(local);
  var remoteMap = indexEntities(remote);
  var ids = collectPlayerIds(localMap, remoteMap);
  return ids.map(function (eid) {
    var merged = mergeScoreRecord(
      localMap[eid],
      remoteMap[eid],
      Object.assign({}, specBase, { entityKind: 'entity', entityId: eid }),
      mask
    );
    var src = localMap[eid] || remoteMap[eid] || {};
    if (src.entityId != null) merged.entityId = src.entityId;
    else merged.entityId = eid;
    if (src.teamId != null && merged.teamId == null) merged.teamId = src.teamId;
    return merged;
  });
}

function mergeScoresBySide(localMap, remoteMap, specBase, mask) {
  var local = localMap && typeof localMap === 'object' && !Array.isArray(localMap) ? localMap : {};
  var remote = remoteMap && typeof remoteMap === 'object' && !Array.isArray(remoteMap) ? remoteMap : {};
  var out = {};
  collectPlayerIds(local, remote).forEach(function (sid) {
    var merged = mergeScoreRecord(
      local[sid],
      remote[sid],
      Object.assign({}, specBase, { entityKind: 'side', entityId: sid }),
      mask
    );
    var src = local[sid] || remote[sid] || {};
    if (src.sideId != null) merged.sideId = src.sideId;
    if (src.sideKey != null) merged.sideKey = src.sideKey;
    out[sid] = merged;
  });
  return out;
}

function mergeGroupBucket(groupId, localBucket, remoteBucket, specBase, mask) {
  var local = localBucket && typeof localBucket === 'object' && !Array.isArray(localBucket) ? localBucket : {};
  var remote = remoteBucket && typeof remoteBucket === 'object' && !Array.isArray(remoteBucket) ? remoteBucket : {};
  var base = Object.assign({}, specBase, { groupId: groupId });
  var out = {};
  Object.keys(local).forEach(function (k) {
    out[k] = local[k];
  });
  Object.keys(remote).forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(out, k)) out[k] = remote[k];
  });
  out.scoresByPlayer = mergeScoresByPlayer(local.scoresByPlayer, remote.scoresByPlayer, base, mask);
  out.teamScoresByEntity = mergeTeamScoresByEntity(
    local.teamScoresByEntity,
    remote.teamScoresByEntity,
    base,
    mask
  );
  out.scoresBySide = mergeScoresBySide(local.scoresBySide, remote.scoresBySide, base, mask);
  if (local.matchPlayMeta && !remote.matchPlayMeta) out.matchPlayMeta = local.matchPlayMeta;
  if (local.firstScoreAt != null && remote.firstScoreAt == null) out.firstScoreAt = local.firstScoreAt;
  if (local.finishedScoreAt != null && remote.finishedScoreAt == null) {
    out.finishedScoreAt = local.finishedScoreAt;
  }
  return out;
}

function collectGroupIds(localData, remoteData) {
  var ids = [];
  var seen = Object.create(null);
  function add(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    Object.keys(data).forEach(function (gid) {
      var k = asStr(gid);
      if (!k || seen[k]) return;
      seen[k] = true;
      ids.push(k);
    });
  }
  add(localData);
  add(remoteData);
  return ids;
}

function mergeRemoteScoreDataWithLocalProtection(localScoreData, remoteScoreData, options) {
  var opts = options || {};
  var local =
    localScoreData && typeof localScoreData === 'object' && !Array.isArray(localScoreData)
      ? localScoreData
      : {};
  var remote =
    remoteScoreData && typeof remoteScoreData === 'object' && !Array.isArray(remoteScoreData)
      ? remoteScoreData
      : {};
  var mask = opts.mask || buildPendingFieldMask(opts.pendingRows || [], opts.matchId || '');
  var matchId = opts.matchId || '';
  var out = {};
  collectGroupIds(local, remote).forEach(function (gid) {
    out[gid] = mergeGroupBucket(
      gid,
      local[gid],
      remote[gid],
      { matchId: matchId, roundId: opts.roundId || 'r1' },
      mask
    );
  });
  return out;
}

module.exports = {
  isFilledScore: isFilledScore,
  fieldKey: fieldKey,
  maskHas: maskHas,
  buildPendingFieldMask: buildPendingFieldMask,
  mergeRemoteScoreDataWithLocalProtection: mergeRemoteScoreDataWithLocalProtection
};
