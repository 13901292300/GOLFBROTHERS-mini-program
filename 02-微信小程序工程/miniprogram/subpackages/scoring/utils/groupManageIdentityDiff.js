/**
 * 人员调整 diff：同一次删除 A + 添加 B 折成身份纠错 replace。
 */
var comboDisplayName = require('../../../utils/comboDisplayName.js');
var port = require('../../../utils/sideGameRepositoryPort.js');

function asId(v) {
  return v == null ? '' : String(v).trim();
}

function foldIdentityCorrection(diff) {
  var src = diff && typeof diff === 'object' ? diff : {};
  var added = Array.isArray(src.added) ? src.added.slice() : [];
  var removed = Array.isArray(src.removed) ? src.removed.slice() : [];
  var replaced = Array.isArray(src.replaced) ? src.replaced.slice() : [];
  var unchanged = Array.isArray(src.unchanged) ? src.unchanged.slice() : [];
  if (replaced.length !== 0 || added.length !== 1 || removed.length !== 1) {
    return {
      added: added,
      removed: removed,
      replaced: replaced,
      unchanged: unchanged,
      changeCount: added.length + removed.length + replaced.length
    };
  }
  var rm = removed[0] || {};
  var ad = added[0] || {};
  var fromId = asId(rm.fromPlayerId);
  var toId = asId(ad.toPlayerId);
  if (!fromId || !toId || fromId === toId) {
    return {
      added: added,
      removed: removed,
      replaced: replaced,
      unchanged: unchanged,
      changeCount: added.length + removed.length + replaced.length
    };
  }
  var row = {
    type: 'replace',
    preserveScores: true,
    slotIndex: rm.slotIndex,
    slotId: rm.slotId != null ? rm.slotId : ad.slotId,
    seatIndex: rm.seatIndex != null ? rm.seatIndex : ad.seatIndex,
    fromPlayerId: fromId,
    toPlayerId: toId,
    toSlotIndex: ad.slotIndex,
    from: rm.from || null,
    to: ad.to || null
  };
  return {
    added: [],
    removed: [],
    replaced: [row],
    unchanged: unchanged,
    changeCount: 1
  };
}

function rowTouchesPlayer(row, playerId) {
  var pid = asId(playerId);
  if (!row || row.status === 'deleted' || !pid) return false;
  var parties = Array.isArray(row.participantParties) ? row.participantParties : [];
  var i;
  var j;
  for (i = 0; i < parties.length; i++) {
    var p = parties[i] || {};
    if (asId(p.partyId) === pid) return true;
    var mem = Array.isArray(p.memberPlayerIds) ? p.memberPlayerIds : [];
    for (j = 0; j < mem.length; j++) {
      if (asId(mem[j]) === pid) return true;
    }
  }
  var blob = '';
  try {
    blob = JSON.stringify({ config: row.config, result: row.resultSnapshot }) || '';
  } catch (e) {
    blob = '';
  }
  return blob.indexOf('"' + pid + '"') >= 0;
}

function buildRemapTable(replaced) {
  var map = {};
  (Array.isArray(replaced) ? replaced : []).forEach(function (ch) {
    var fromId = asId(ch && ch.fromPlayerId);
    var toId = asId(ch && ch.toPlayerId);
    if (fromId && toId && fromId !== toId) map[fromId] = toId;
  });
  return map;
}

function inspectFinalOccupiedIds(ids) {
  var seen = {};
  var i;
  for (i = 0; i < (ids || []).length; i++) {
    var id = asId(ids[i]);
    if (!id) continue;
    if (seen[id]) {
      return {
        ok: false,
        reason: 'identity_conflict',
        message: '目标球员已在本场比赛中'
      };
    }
    seen[id] = true;
  }
  return { ok: true, reason: '' };
}

function collectRowPlayerIds(row) {
  var ids = [];
  var parties = row && Array.isArray(row.participantParties) ? row.participantParties : [];
  var i;
  var j;
  for (i = 0; i < parties.length; i++) {
    var p = parties[i] || {};
    if (p.partyType === 'player') {
      var pid = asId(p.partyId);
      if (pid) ids.push(pid);
      continue;
    }
    var mem = Array.isArray(p.memberPlayerIds) ? p.memberPlayerIds : [];
    for (j = 0; j < mem.length; j++) {
      var mid = asId(mem[j]);
      if (mid) ids.push(mid);
    }
  }
  return ids;
}

function rowHasDuplicatePlayers(row) {
  return inspectFinalOccupiedIds(collectRowPlayerIds(row)).ok === false;
}

function remapIdentityInMap(value, idMap) {
  if (value == null || !idMap) return value;
  if (typeof value === 'string') return idMap[value] || value;
  if (Array.isArray(value)) {
    return value.map(function (item) {
      return remapIdentityInMap(item, idMap);
    });
  }
  if (typeof value === 'object') {
    var out = {};
    Object.keys(value).forEach(function (key) {
      var nextKey = idMap[key] || key;
      out[nextKey] = remapIdentityInMap(value[key], idMap);
    });
    return out;
  }
  return value;
}

function remapRecordMap(row, idMap, profiles) {
  var rec = JSON.parse(JSON.stringify(row || {}));
  rec.participantParties = (Array.isArray(rec.participantParties) ? rec.participantParties : []).map(
    function (p) {
      var party = p || {};
      var partyId = asId(party.partyId);
      if (party.partyType === 'player' && idMap[partyId]) partyId = idMap[partyId];
      return Object.assign({}, party, {
        partyId: partyId,
        memberPlayerIds: (Array.isArray(party.memberPlayerIds) ? party.memberPlayerIds : []).map(
          function (id) {
            var k = asId(id);
            return idMap[k] || k;
          }
        )
      });
    }
  );
  rec.config = remapIdentityInMap(rec.config, idMap);
  rec.resultSnapshot = remapIdentityInMap(rec.resultSnapshot, idMap);
  rec.hostRevisionAtSettle = '';
  rec.participantParties = (rec.participantParties || []).map(function (p) {
    if (!p || p.partyType !== 'combination') return p;
    return Object.assign({}, p, { displayName: '' });
  });
  Object.keys(idMap || {}).forEach(function (fromId) {
    var toId = idMap[fromId];
    var profile = profiles && profiles[toId] ? profiles[toId] : null;
    stampProfileDeep(rec.config, toId, profile);
    stampProfileDeep(rec.resultSnapshot, toId, profile);
  });
  refreshComboNamesDeep(rec.config);
  refreshComboNamesDeep(rec.resultSnapshot);
  return rec;
}

function inspectStorageRemap(records, matchId, replaced) {
  var mid = asId(matchId);
  var list = Array.isArray(records) ? records : [];
  var idMap = buildRemapTable(replaced);
  var fromIds = Object.keys(idMap);
  if (!fromIds.length) return { ok: true, reason: '' };
  var i;
  for (i = 0; i < list.length; i++) {
    var row = list[i];
    if (!row || asId(row.matchId) !== mid || row.status === 'deleted') continue;
    var touched = fromIds.some(function (fromId) {
      return rowTouchesPlayer(row, fromId);
    });
    if (!touched) continue;
    var mapped = remapRecordMap(row, idMap, {});
    if (rowHasDuplicatePlayers(mapped)) {
      return {
        ok: false,
        reason: 'identity_conflict',
        message: '目标球员已在本场比赛中'
      };
    }
  }
  return { ok: true, reason: '' };
}

function stampProfileDeep(value, toId, profile) {
  if (!value || typeof value !== 'object' || !profile) return;
  if (Array.isArray(value)) {
    value.forEach(function (item) {
      stampProfileDeep(item, toId, profile);
    });
    return;
  }
  var id = asId(value.playerId || ((value.partyType === 'player' || value.subjectType === 'person') && value.id));
  if (id && id === toId) {
    if (profile.displayName || profile.name) {
      value.displayName = profile.displayName || profile.name;
      if (value.name != null) value.name = profile.displayName || profile.name;
    }
    if (profile.avatar != null) value.avatar = profile.avatar;
  }
  Object.keys(value).forEach(function (key) {
    stampProfileDeep(value[key], toId, profile);
  });
}

function refreshComboNamesDeep(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(refreshComboNamesDeep);
    return;
  }
  if (Array.isArray(value.members) && value.members.length > 1) {
    var looksLikePeople = value.members.some(function (m) {
      return m && typeof m === 'object' && (m.displayName || m.name || m.playerId);
    });
    if (looksLikePeople) comboDisplayName.applyComboDisplayNameToPerson(value);
  }
  Object.keys(value).forEach(function (key) {
    if (key === 'members') return;
    refreshComboNamesDeep(value[key]);
  });
}

function clearAutoComboName(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(clearAutoComboName);
    return;
  }
  if (Array.isArray(value.members) && value.members.length > 1) {
    value.displayName = '';
    if (typeof value.name === 'string' && value.name.indexOf('+') >= 0) value.name = '';
  }
  Object.keys(value).forEach(function (key) {
    if (key === 'members') return;
    clearAutoComboName(value[key]);
  });
}

function snapshotMatchRows(matchId) {
  var listed = port.listByMatchId({ matchId: matchId, includeDeleted: true });
  if (listed && listed.ok && listed.data && Array.isArray(listed.data.items)) {
    return listed.data.items;
  }
  return [];
}

function applyGroupManageStorageDiff(wxApi, matchId, diff, opts) {
  opts = opts || {};
  var mid = asId(matchId);
  if (!mid) {
    return { ok: false, reason: 'invalid_args', message: '缺少比赛' };
  }
  var snapshot = snapshotMatchRows(mid);
  var replaced = (diff && diff.replaced) || [];
  var idMap = buildRemapTable(replaced);
  if (Object.keys(idMap).length) {
    var inspected = port.inspectPlayerIdsRemap(mid, idMap);
    if (!inspected || inspected.ok === false) {
      return {
        ok: false,
        reason: (inspected && inspected.reason) || 'identity_conflict',
        message: '目标球员已在本场比赛中'
      };
    }
  }
  var profiles = opts.profiles || {};
  Object.keys(idMap).forEach(function (fromId) {
    var toId = idMap[fromId];
    if (profiles[toId]) return;
    var i;
    for (i = 0; i < replaced.length; i++) {
      if (asId(replaced[i].toPlayerId) === toId && replaced[i].to) {
        profiles[toId] = {
          displayName: replaced[i].to.name || '',
          name: replaced[i].to.name || '',
          avatar: ''
        };
        break;
      }
    }
  });
  if (Object.keys(idMap).length) {
    var remapped = port.remapPlayerIds(mid, idMap, profiles);
    if (!remapped || !remapped.ok) {
      return { ok: false, reason: (remapped && remapped.reason) || 'storage_write_failed', message: '保存失败' };
    }
    var updatedIds = (remapped.data && remapped.data.updatedSideGameIds) || [];
    var u;
    for (u = 0; u < updatedIds.length; u++) {
      var got = port.getById(updatedIds[u]);
      var live = got && got.data;
      if (!live) continue;
      live.participantParties = (live.participantParties || []).map(function (p) {
        if (!p || p.partyType !== 'combination') return p;
        return Object.assign({}, p, { displayName: '' });
      });
      Object.keys(idMap).forEach(function (fromId) {
        var toId = idMap[fromId];
        stampProfileDeep(live.config, toId, profiles[toId] || null);
        stampProfileDeep(live.resultSnapshot, toId, profiles[toId] || null);
      });
      clearAutoComboName(live.config);
      clearAutoComboName(live.resultSnapshot);
      refreshComboNamesDeep(live.config);
      refreshComboNamesDeep(live.resultSnapshot);
      port.update(live.sideGameId, live.revision, {
        config: live.config,
        resultSnapshot: live.resultSnapshot,
        participantParties: live.participantParties
      });
    }
  }
  var stillPresent = opts.stillPresentIds || {};
  var dropped = (diff && diff.removed) || [];
  var i;
  for (i = 0; i < dropped.length; i++) {
    var pid = asId(dropped[i].fromPlayerId);
    if (!pid || stillPresent[pid]) continue;
    var del = port.removeGamesTouchingPlayer(mid, pid);
    if (!del || !del.ok) {
      return { ok: false, reason: (del && del.reason) || 'storage_write_failed', message: '保存失败' };
    }
  }
  return { ok: true, reason: '', snapshot: snapshot };
}

function restoreSideGameSnapshot(wxApi, snapshot) {
  var rows = Array.isArray(snapshot) ? snapshot : snapshot == null ? [] : [];
  var out = port.restoreExactRecords(rows);
  return !!(out && out.ok);
}

module.exports = {
  foldIdentityCorrection: foldIdentityCorrection,
  buildRemapTable: buildRemapTable,
  inspectFinalOccupiedIds: inspectFinalOccupiedIds,
  inspectStorageRemap: inspectStorageRemap,
  rowTouchesPlayer: rowTouchesPlayer,
  applyGroupManageStorageDiff: applyGroupManageStorageDiff,
  restoreSideGameSnapshot: restoreSideGameSnapshot
};
