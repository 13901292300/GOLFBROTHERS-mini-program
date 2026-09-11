/**
 * SideGame Storage V2 Phase 1：只读迁移。
 * 从 gb_side_games_v1 复制 instance + 轻量 index。
 * 不切换业务读写；不删除 v1。
 */
var rec = require('./sideGameRecord.js');

var SOURCE_KEY = 'gb_side_games_v1';
var INDEX_KEY = 'gb_side_games_index_v2';
var INSTANCE_PREFIX = 'gb_side_game_v2:';
var MIGRATION_KEY = 'gb_side_games_migration_v2';

var FAT_INDEX_FIELDS = {
  ruleSnapshot: true,
  resultSnapshot: true,
  config: true,
  players: true,
  participantParties: true
};

function instanceKey(sideGameId) {
  return INSTANCE_PREFIX + rec.asString(sideGameId);
}

function idleState() {
  return {
    status: 'idle',
    sourceKey: SOURCE_KEY,
    sourceCount: 0,
    migratedCount: 0,
    idHash: '',
    completedAt: 0,
    lastError: ''
  };
}

function identityTuple(row) {
  var r = row && typeof row === 'object' ? row : {};
  return rec.asString(r.sideGameId) + '\t' + String(Number(r.revision) || 0) + '\t' + rec.asString(r.status);
}

function identityHash(rows) {
  var parts = (rows || []).map(identityTuple);
  parts.sort();
  var s = parts.join('\n');
  var h = 5381;
  var i;
  for (i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return 'h' + h.toString(16);
}

function indexItemFromRecord(row) {
  var r = rec.normalizeRecord(row);
  return {
    sideGameId: rec.asString(r.sideGameId),
    matchId: rec.asString(r.matchId),
    groupId: rec.asString(r.groupId),
    scope: rec.asString(r.scope) === 'match' ? 'match' : 'group',
    status: rec.asString(r.status) || 'active',
    visibility: rec.asString(r.visibility),
    ruleId: rec.asString(r.ruleId),
    title: rec.asString(r.title),
    updatedAt: Number(r.updatedAt) || 0,
    revision: Number(r.revision) || 1
  };
}

function buildIndex(records, updatedAt) {
  return {
    schemaVersion: 2,
    updatedAt: Number(updatedAt) || 0,
    items: (records || []).map(indexItemFromRecord)
  };
}

function indexHasFatFields(index) {
  var json;
  try {
    json = JSON.stringify(index || {});
  } catch (e) {
    return true;
  }
  var names = Object.keys(FAT_INDEX_FIELDS);
  var i;
  for (i = 0; i < names.length; i++) {
    if (json.indexOf('"' + names[i] + '"') >= 0) return true;
  }
  return false;
}

function isFail(value) {
  return !!(value && typeof value === 'object' && value.__fail);
}

function isRecordLike(value) {
  return !!(value && typeof value === 'object' && !Array.isArray(value) && !isFail(value));
}

function readMigration(storage) {
  var raw = storage.getItem(MIGRATION_KEY);
  if (isFail(raw)) return { ok: false, reason: 'storage_read_failed', state: idleState() };
  if (!raw || typeof raw !== 'object') return { ok: true, reason: '', state: idleState() };
  var state = idleState();
  state.status = rec.asString(raw.status) || 'idle';
  state.sourceKey = rec.asString(raw.sourceKey) || SOURCE_KEY;
  state.sourceCount = Number(raw.sourceCount) || 0;
  state.migratedCount = Number(raw.migratedCount) || 0;
  state.idHash = rec.asString(raw.idHash);
  state.completedAt = Number(raw.completedAt) || 0;
  state.lastError = rec.asString(raw.lastError);
  return { ok: true, reason: '', state: state };
}

function persistMigration(storage, state) {
  return !!storage.setItem(MIGRATION_KEY, rec.jsonClone(state));
}

function readV1List(storage) {
  var raw = storage.getItem(SOURCE_KEY);
  if (isFail(raw)) return { ok: false, reason: 'storage_read_failed', list: [], missing: false };
  if (raw == null || raw === '') return { ok: true, reason: '', list: [], missing: true };
  if (!Array.isArray(raw)) return { ok: true, reason: '', list: [], missing: false };
  return { ok: true, reason: '', list: raw, missing: false };
}

function uniqueV1Records(list) {
  var order = [];
  var byId = {};
  var i;
  for (i = 0; i < (list || []).length; i++) {
    var row = rec.normalizeRecord(list[i]);
    var id = rec.asString(row.sideGameId);
    if (!id) continue;
    if (!byId[id]) order.push(id);
    byId[id] = row;
  }
  return order.map(function (id) {
    return byId[id];
  });
}

function logMigration(detail) {
  try {
    if (typeof console === 'undefined' || typeof console.log !== 'function') return;
    var payload;
    if (detail && detail.skipped) {
      payload = {
        status: 'migrated',
        skipped: true,
        sourceCount: detail.sourceCount,
        migratedCount: detail.migratedCount,
        completedAt: Number(detail.completedAt) || 0,
        lastError: rec.asString(detail.lastError)
      };
    } else {
      payload = {
        status: detail && detail.status,
        sourceCount: detail && detail.sourceCount,
        migratedCount: detail && detail.migratedCount,
        indexCount: detail && detail.indexCount,
        verified: !!detail && !!detail.verified,
        hashMatch: !!detail && !!detail.hashMatch,
        error: rec.asString(detail && detail.error)
      };
    }
    console.log('[side-game-storage-v2] migration', payload);
  } catch (eLog) {}
}

function spotIndexes(n) {
  var out = [];
  var seen = {};
  function add(i) {
    if (i < 0 || i >= n || seen[i]) return;
    seen[i] = true;
    out.push(i);
  }
  if (n <= 0) return out;
  add(0);
  if (n > 1) add(n - 1);
  if (n > 2) add(Math.floor(n / 2));
  if (n > 8) add(3);
  if (n > 8) add(n - 4);
  return out;
}

function failState(storage, state, reason, counts) {
  if (state.status === 'migrated' || state.status === 'verified') {
    state.status = 'indexed';
  }
  if (!state.status) state.status = 'idle';
  state.lastError = rec.asString(reason) || 'storage_write_failed';
  if (counts) {
    if (counts.sourceCount != null) state.sourceCount = counts.sourceCount;
    if (counts.migratedCount != null) state.migratedCount = counts.migratedCount;
  }
  persistMigration(storage, state);
  logMigration({
    status: state.status,
    sourceCount: state.sourceCount,
    migratedCount: state.migratedCount,
    indexCount: counts && counts.indexCount,
    verified: false,
    hashMatch: false,
    error: state.lastError
  });
  return state;
}

function ensureMigrated(storage, clock, opts) {
  var now = typeof clock === 'function' ? clock : rec.nowMs;
  var options = opts || {};
  var logSkipped = options.logSkipped !== false;
  var loaded = readMigration(storage);
  if (!loaded.ok) {
    var blocked = idleState();
    blocked.lastError = loaded.reason;
    logMigration({
      status: 'idle',
      sourceCount: 0,
      migratedCount: 0,
      indexCount: 0,
      verified: false,
      hashMatch: false,
      error: loaded.reason
    });
    return blocked;
  }
  var state = loaded.state;
  if (state.status === 'migrated') {
    if (logSkipped) {
      logMigration({
        status: 'migrated',
        skipped: true,
        sourceCount: state.sourceCount,
        migratedCount: state.migratedCount,
        completedAt: state.completedAt,
        lastError: state.lastError
      });
    }
    return state;
  }

  var v1 = readV1List(storage);
  if (!v1.ok) {
    return failState(storage, state, v1.reason, { sourceCount: 0, migratedCount: 0, indexCount: 0 });
  }

  var records = uniqueV1Records(v1.list);
  state.status = 'copying';
  state.sourceKey = SOURCE_KEY;
  state.sourceCount = records.length;
  state.migratedCount = 0;
  state.idHash = '';
  state.completedAt = 0;
  state.lastError = '';
  persistMigration(storage, state);

  var canonical = [];
  var i;
  for (i = 0; i < records.length; i++) {
    var v1Row = records[i];
    var key = instanceKey(v1Row.sideGameId);
    var existing = storage.getItem(key);
    if (isFail(existing)) {
      return failState(storage, state, 'storage_read_failed', {
        sourceCount: records.length,
        migratedCount: canonical.length,
        indexCount: 0
      });
    }
    var keepExisting = false;
    if (isRecordLike(existing) && rec.asString(existing.sideGameId)) {
      var ev = Number(existing.revision) || 0;
      var nv = Number(v1Row.revision) || 0;
      if (ev > nv) keepExisting = true;
      else if (ev === nv) keepExisting = true;
    }
    if (keepExisting) {
      canonical.push(rec.normalizeRecord(existing));
      continue;
    }
    var payload = rec.jsonClone(v1Row);
    if (!storage.setItem(key, payload)) {
      return failState(storage, state, 'storage_write_failed', {
        sourceCount: records.length,
        migratedCount: canonical.length,
        indexCount: 0
      });
    }
    canonical.push(v1Row);
  }

  state.migratedCount = canonical.length;
  var index = buildIndex(canonical, now());
  if (indexHasFatFields(index)) {
    return failState(storage, state, 'index_contains_fat_fields', {
      sourceCount: records.length,
      migratedCount: canonical.length,
      indexCount: 0
    });
  }
  if (!storage.setItem(INDEX_KEY, rec.jsonClone(index))) {
    return failState(storage, state, 'storage_write_failed', {
      sourceCount: records.length,
      migratedCount: canonical.length,
      indexCount: 0
    });
  }

  state.status = 'indexed';
  persistMigration(storage, state);

  var storedIndex = storage.getItem(INDEX_KEY);
  if (isFail(storedIndex) || !storedIndex || !Array.isArray(storedIndex.items)) {
    return failState(storage, state, 'index_verify_failed', {
      sourceCount: records.length,
      migratedCount: canonical.length,
      indexCount: 0
    });
  }

  var indexItems = storedIndex.items;
  var sourceCount = records.length;
  var migratedCount = canonical.length;
  var indexCount = indexItems.length;
  var countsOk = sourceCount === migratedCount && migratedCount === indexCount;

  var instanceRows = [];
  for (i = 0; i < canonical.length; i++) {
    var inst = storage.getItem(instanceKey(canonical[i].sideGameId));
    if (isFail(inst) || !isRecordLike(inst)) {
      return failState(storage, state, 'instance_verify_failed', {
        sourceCount: sourceCount,
        migratedCount: migratedCount,
        indexCount: indexCount
      });
    }
    instanceRows.push(rec.normalizeRecord(inst));
  }

  var hashIndex = identityHash(indexItems);
  var hashInst = identityHash(instanceRows);
  var hashMatch = countsOk && hashIndex === hashInst && hashIndex === identityHash(canonical);
  var samples = spotIndexes(indexCount);
  var sampleOk = true;
  for (i = 0; i < samples.length; i++) {
    var idx = samples[i];
    var item = indexItems[idx];
    var instRow = instanceRows[idx];
    if (!item || !instRow) {
      sampleOk = false;
      break;
    }
    if (rec.asString(item.sideGameId) !== rec.asString(instRow.sideGameId)) sampleOk = false;
    if ((Number(item.revision) || 0) !== (Number(instRow.revision) || 0)) sampleOk = false;
    if (rec.asString(item.status) !== rec.asString(instRow.status)) sampleOk = false;
  }

  var verified = countsOk && hashMatch && sampleOk && !indexHasFatFields(storedIndex);
  if (!verified) {
    state.status = 'indexed';
    state.idHash = hashInst;
    return failState(storage, state, 'verify_failed', {
      sourceCount: sourceCount,
      migratedCount: migratedCount,
      indexCount: indexCount
    });
  }

  state.status = 'verified';
  state.sourceCount = sourceCount;
  state.migratedCount = migratedCount;
  state.idHash = hashInst;
  state.lastError = '';
  persistMigration(storage, state);

  state.status = 'migrated';
  state.completedAt = now();
  if (!persistMigration(storage, state)) {
    state.status = 'verified';
    return failState(storage, state, 'storage_write_failed', {
      sourceCount: sourceCount,
      migratedCount: migratedCount,
      indexCount: indexCount
    });
  }

  logMigration({
    status: state.status,
    sourceCount: sourceCount,
    migratedCount: migratedCount,
    indexCount: indexCount,
    verified: true,
    hashMatch: true,
    error: ''
  });
  return state;
}

function runOnInit(storage, clock, opts) {
  try {
    return ensureMigrated(storage, clock, opts);
  } catch (e) {
    var state = idleState();
    state.lastError = rec.asString(e && (e.message || e.errMsg)) || 'migration_exception';
    logMigration({
      status: 'idle',
      sourceCount: 0,
      migratedCount: 0,
      indexCount: 0,
      verified: false,
      hashMatch: false,
      error: state.lastError
    });
    try {
      persistMigration(storage, state);
    } catch (e2) {}
    return state;
  }
}

module.exports = {
  SOURCE_KEY: SOURCE_KEY,
  INDEX_KEY: INDEX_KEY,
  INSTANCE_PREFIX: INSTANCE_PREFIX,
  MIGRATION_KEY: MIGRATION_KEY,
  instanceKey: instanceKey,
  identityHash: identityHash,
  indexItemFromRecord: indexItemFromRecord,
  buildIndex: buildIndex,
  indexHasFatFields: indexHasFatFields,
  idleState: idleState,
  ensureMigrated: ensureMigrated,
  runOnInit: runOnInit
};
