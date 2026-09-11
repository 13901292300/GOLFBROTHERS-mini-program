/**
 * SideGame Storage V2 Phase 2：canonical instance/index + staging/journal。
 * 仅在 migration.status === migrated 后由 repository 使用。不写 v1。
 */
var rec = require('./sideGameRecord.js');
var v2mig = require('./sideGameStorageV2Migration.js');

var INDEX_KEY = v2mig.INDEX_KEY;
var INSTANCE_PREFIX = v2mig.INSTANCE_PREFIX;
var JOURNAL_KEY = 'gb_side_games_tx_v2';
var STAGING_PREFIX = 'gb_side_game_tx_v2:';

function instanceKey(id) {
  return v2mig.instanceKey(id);
}

function stagingKey(txId, sideGameId) {
  return STAGING_PREFIX + rec.asString(txId) + ':' + rec.asString(sideGameId);
}

function isFail(value) {
  return !!(value && typeof value === 'object' && value.__fail);
}

function isRecordLike(value) {
  return !!(value && typeof value === 'object' && !Array.isArray(value) && !isFail(value));
}

function logV2(tag, detail) {
  try {
    if (typeof console === 'undefined' || typeof console.log !== 'function') return;
    console.log('[side-game-storage-v2] ' + tag, detail || {});
  } catch (e) {}
}

function listKeys(storage) {
  if (storage && typeof storage.listKeys === 'function') {
    try {
      return storage.listKeys() || [];
    } catch (e0) {}
  }
  if (storage && storage._bag && typeof storage._bag === 'object') {
    return Object.keys(storage._bag);
  }
  try {
    if (typeof wx !== 'undefined' && typeof wx.getStorageInfoSync === 'function') {
      var info = wx.getStorageInfoSync() || {};
      return info.keys || [];
    }
  } catch (e1) {}
  return [];
}

function removeItem(storage, key) {
  if (storage && typeof storage.removeItem === 'function') {
    try {
      return storage.removeItem(key) !== false;
    } catch (e0) {
      return false;
    }
  }
  try {
    if (typeof wx !== 'undefined' && typeof wx.removeStorageSync === 'function') {
      wx.removeStorageSync(key);
      return true;
    }
  } catch (e1) {}
  return false;
}

function emptyIndex(updatedAt) {
  return { schemaVersion: 2, updatedAt: Number(updatedAt) || 0, items: [] };
}

function loadIndex(storage) {
  var raw = storage.getItem(INDEX_KEY);
  if (isFail(raw)) return { ok: false, reason: 'storage_read_failed', index: emptyIndex(0) };
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) {
    return { ok: true, reason: 'missing', index: emptyIndex(0), missing: true };
  }
  return { ok: true, reason: '', index: raw, missing: false };
}

function saveIndex(storage, index, clock) {
  var next = index && typeof index === 'object' ? rec.jsonClone(index) : emptyIndex(0);
  next.schemaVersion = 2;
  next.updatedAt = typeof clock === 'function' ? clock() : Number(next.updatedAt) || 0;
  if (!Array.isArray(next.items)) next.items = [];
  var ok = !!storage.setItem(INDEX_KEY, next);
  if (!ok) {
    logV2('index-repair', { stage: 'save', error: 'storage_write_failed', idCount: next.items.length });
  }
  return ok;
}

function getInstance(storage, sideGameId) {
  var id = rec.asString(sideGameId);
  if (!id) return { ok: false, reason: 'not_found', record: null };
  var raw = storage.getItem(instanceKey(id));
  if (isFail(raw)) return { ok: false, reason: 'storage_read_failed', record: null };
  if (!isRecordLike(raw) || !rec.asString(raw.sideGameId)) {
    return { ok: false, reason: 'not_found', record: null, missing: true };
  }
  return { ok: true, reason: '', record: rec.normalizeRecord(raw) };
}

function putInstance(storage, record) {
  var row = rec.normalizeRecord(record);
  var id = rec.asString(row.sideGameId);
  if (!id) return false;
  return !!storage.setItem(instanceKey(id), rec.jsonClone(row));
}

function upsertIndexRecords(storage, records, clock) {
  var loaded = loadIndex(storage);
  if (!loaded.ok) return false;
  var byId = {};
  var order = [];
  var items = (loaded.index.items || []).slice();
  var i;
  for (i = 0; i < items.length; i++) {
    var id = rec.asString(items[i] && items[i].sideGameId);
    if (!id) continue;
    if (!byId[id]) order.push(id);
    byId[id] = items[i];
  }
  for (i = 0; i < (records || []).length; i++) {
    var row = records[i];
    var sid = rec.asString(row && row.sideGameId);
    if (!sid) continue;
    if (!byId[sid]) order.push(sid);
    byId[sid] = v2mig.indexItemFromRecord(row);
  }
  var nextItems = [];
  for (i = 0; i < order.length; i++) {
    if (byId[order[i]]) nextItems.push(byId[order[i]]);
  }
  return saveIndex(storage, { schemaVersion: 2, items: nextItems }, clock);
}

function indexItemLightEqual(a, b) {
  if (!a || !b) return false;
  return (
    rec.asString(a.sideGameId) === rec.asString(b.sideGameId) &&
    rec.asString(a.matchId) === rec.asString(b.matchId) &&
    rec.asString(a.groupId) === rec.asString(b.groupId) &&
    rec.asString(a.scope) === rec.asString(b.scope) &&
    rec.asString(a.status) === rec.asString(b.status) &&
    rec.asString(a.visibility) === rec.asString(b.visibility) &&
    rec.asString(a.ruleId) === rec.asString(b.ruleId) &&
    rec.asString(a.title) === rec.asString(b.title) &&
    (Number(a.updatedAt) || 0) === (Number(b.updatedAt) || 0) &&
    (Number(a.revision) || 0) === (Number(b.revision) || 0)
  );
}

function persistRecord(storage, record, clock) {
  var row = rec.normalizeRecord(record);
  if (!putInstance(storage, row)) return { ok: false, reason: 'storage_write_failed', indexOk: false };
  var loaded = loadIndex(storage);
  if (!loaded.ok) {
    logV2('index-repair', { stage: 'upsert-after-instance', error: loaded.reason, idCount: 1, revision: row.revision });
    return { ok: false, reason: 'storage_write_failed', indexOk: false, instanceOk: true };
  }
  var id = rec.asString(row.sideGameId);
  var prev = null;
  var i;
  for (i = 0; i < (loaded.index.items || []).length; i++) {
    if (rec.asString(loaded.index.items[i].sideGameId) === id) {
      prev = loaded.index.items[i];
      break;
    }
  }
  var nextItem = v2mig.indexItemFromRecord(row);
  if (prev && indexItemLightEqual(prev, nextItem)) {
    return { ok: true, reason: '', indexOk: true, instanceOk: true };
  }
  if (!upsertIndexRecords(storage, [row], clock)) {
    logV2('index-repair', { stage: 'index-write-failed', error: 'storage_write_failed', idCount: 1, revision: row.revision });
    return { ok: false, reason: 'storage_write_failed', indexOk: false, instanceOk: true };
  }
  return { ok: true, reason: '', indexOk: true, instanceOk: true };
}

function filterIndexHits(items, query) {
  var q = query || {};
  var matchId = rec.asString(q.matchId);
  var listScope = q.scope === 'match' ? 'match' : 'group';
  var groupId = rec.asString(q.groupId);
  var out = [];
  var i;
  for (i = 0; i < (items || []).length; i++) {
    var it = items[i] || {};
    if (rec.asString(it.status) === 'deleted') continue;
    if (matchId && rec.asString(it.matchId) !== matchId) continue;
    if (listScope === 'match') {
      if (rec.asString(it.scope) !== 'match') continue;
    } else {
      if (rec.asString(it.scope) !== 'group') continue;
      if (groupId && rec.asString(it.groupId) !== groupId) continue;
    }
    if (q.visibility && rec.asString(it.visibility) && rec.asString(it.visibility) !== rec.asString(q.visibility)) {
      /* optional extra; viewerCanSee still applied on full record */
    }
    out.push(it);
  }
  return out;
}

function loadRecordsForIndexItems(storage, items) {
  var rows = [];
  var i;
  for (i = 0; i < (items || []).length; i++) {
    var id = rec.asString(items[i] && items[i].sideGameId);
    if (!id) continue;
    var got = getInstance(storage, id);
    if (!got.ok) {
      if (got.reason === 'storage_read_failed') {
        logV2('index-repair', { stage: 'list-instance-read', error: 'storage_read_failed', idCount: 1 });
        return { ok: false, reason: 'storage_read_failed', list: [] };
      }
      logV2('index-repair', { stage: 'index-instance-gap', error: 'not_found', idCount: 1 });
      continue;
    }
    rows.push(got.record);
  }
  return { ok: true, reason: '', list: rows };
}

function instanceIdsFromKeys(storage) {
  var keys = listKeys(storage);
  var ids = [];
  var i;
  for (i = 0; i < keys.length; i++) {
    var k = rec.asString(keys[i]);
    if (k.indexOf(INSTANCE_PREFIX) !== 0) continue;
    if (k.indexOf(STAGING_PREFIX) === 0) continue;
    ids.push(k.slice(INSTANCE_PREFIX.length));
  }
  return ids;
}

function stagingKeysOf(storage, txId) {
  var prefix = STAGING_PREFIX + (txId ? rec.asString(txId) + ':' : '');
  var keys = listKeys(storage);
  var out = [];
  var i;
  for (i = 0; i < keys.length; i++) {
    var k = rec.asString(keys[i]);
    if (k.indexOf(prefix) === 0) out.push(k);
  }
  return out;
}

function loadJournal(storage) {
  var raw = storage.getItem(JOURNAL_KEY);
  if (isFail(raw)) return { ok: false, reason: 'storage_read_failed', journal: null };
  if (!raw || typeof raw !== 'object' || !rec.asString(raw.txId)) {
    return { ok: true, reason: '', journal: null };
  }
  return { ok: true, reason: '', journal: raw };
}

function saveJournal(storage, journal) {
  return !!storage.setItem(JOURNAL_KEY, rec.jsonClone(journal));
}

function deleteJournalAndStaging(storage, journal) {
  var keys = [];
  if (journal && journal.ops) {
    var i;
    for (i = 0; i < journal.ops.length; i++) {
      if (journal.ops[i].stagingKey) keys.push(journal.ops[i].stagingKey);
    }
  } else {
    keys = stagingKeysOf(storage, journal && journal.txId);
  }
  var n = 0;
  for (i = 0; i < keys.length; i++) {
    if (removeItem(storage, keys[i])) n += 1;
  }
  removeItem(storage, JOURNAL_KEY);
  return n;
}

function newTxId(clock) {
  var t = typeof clock === 'function' ? clock() : Date.now();
  return 'tx_' + String(t) + '_' + Math.random().toString(36).slice(2, 8);
}

function repairIndex(storage, clock) {
  var loaded = loadIndex(storage);
  if (!loaded.ok) {
    logV2('index-repair', { stage: 'read-index', error: loaded.reason });
    return { ok: false, reason: loaded.reason };
  }
  var ids = instanceIdsFromKeys(storage);
  var byIndex = {};
  var i;
  for (i = 0; i < (loaded.index.items || []).length; i++) {
    var iid = rec.asString(loaded.index.items[i] && loaded.index.items[i].sideGameId);
    if (iid) byIdSafeSet(byIndex, iid, loaded.index.items[i]);
  }
  var needRebuild = !!loaded.missing;
  var records = [];
  var changed = needRebuild;
  if (needRebuild) {
    for (i = 0; i < ids.length; i++) {
      var got = getInstance(storage, ids[i]);
      if (got.ok) records.push(got.record);
    }
    var saved = saveIndex(storage, v2mig.buildIndex(records, typeof clock === 'function' ? clock() : 0), clock);
    logV2('index-repair', {
      stage: 'rebuild-from-instances',
      idCount: records.length,
      error: saved ? '' : 'storage_write_failed'
    });
    return { ok: saved, reason: saved ? '' : 'storage_write_failed' };
  }
  var seen = {};
  for (i = 0; i < ids.length; i++) {
    seen[ids[i]] = true;
    var inst = getInstance(storage, ids[i]);
    if (!inst.ok) continue;
    records.push(inst.record);
    var cur = byIndex[ids[i]];
    if (!cur || (Number(inst.record.revision) || 0) !== (Number(cur.revision) || 0) || rec.asString(inst.record.status) !== rec.asString(cur.status)) {
      changed = true;
    }
  }
  var idxItems = loaded.index.items || [];
  if (idxItems.length !== records.length) changed = true;
  if (!changed) return { ok: true, reason: '' };
  var ok = saveIndex(storage, v2mig.buildIndex(records, typeof clock === 'function' ? clock() : 0), clock);
  logV2('index-repair', {
    stage: 'patch-from-instances',
    idCount: records.length,
    error: ok ? '' : 'storage_write_failed'
  });
  return { ok: ok, reason: ok ? '' : 'storage_write_failed' };
}

function byIdSafeSet(map, key, val) {
  map[key] = val;
}

function applyStagingToInstances(storage, journal) {
  var ops = (journal && journal.ops) || [];
  var i;
  for (i = 0; i < ops.length; i++) {
    var op = ops[i];
    var sid = rec.asString(op.sideGameId);
    var afterRev = Number(op.afterRevision) || 0;
    var existing = getInstance(storage, sid);
    if (existing.ok && (Number(existing.record.revision) || 0) >= afterRev) continue;
    var staged = storage.getItem(op.stagingKey || stagingKey(journal.txId, sid));
    if (isFail(staged)) {
      logV2('recovery', { stage: 'pending-read-staging', error: 'storage_read_failed', opCount: ops.length });
      return { ok: false, reason: 'storage_read_failed' };
    }
    if (!isRecordLike(staged)) {
      logV2('recovery', { stage: 'pending-missing-staging', error: 'not_found', opCount: ops.length });
      return { ok: false, reason: 'storage_read_failed' };
    }
    if (!putInstance(storage, staged)) {
      logV2('recovery', { stage: 'pending-write-instance', error: 'storage_write_failed', opCount: ops.length, revision: afterRev });
      return { ok: false, reason: 'storage_write_failed' };
    }
  }
  return { ok: true, reason: '' };
}

function recoverJournal(storage, clock) {
  var loaded = loadJournal(storage);
  if (!loaded.ok) {
    logV2('recovery', { stage: 'read-journal', error: loaded.reason });
    return { ok: false, reason: loaded.reason };
  }
  var journal = loaded.journal;
  if (!journal) {
    var orphans = stagingKeysOf(storage, '');
    if (orphans.length) {
      var n = 0;
      var i;
      for (i = 0; i < orphans.length; i++) {
        if (removeItem(storage, orphans[i])) n += 1;
      }
      logV2('recovery', { stage: 'orphan-staging', opCount: n, error: '' });
    }
    return { ok: true, reason: '' };
  }
  var status = rec.asString(journal.status);
  logV2('recovery', { stage: status, txStatus: status, opCount: (journal.ops || []).length });
  if (status === 'pending') {
    var applied = applyStagingToInstances(storage, journal);
    if (!applied.ok) return applied;
    journal.status = 'instances_written';
    if (!saveJournal(storage, journal)) {
      logV2('recovery', { stage: 'pending-mark-instances', error: 'storage_write_failed', opCount: (journal.ops || []).length });
      return { ok: false, reason: 'storage_write_failed' };
    }
    status = 'instances_written';
  }
  if (status === 'instances_written') {
    var recs = [];
    var j;
    for (j = 0; j < (journal.ops || []).length; j++) {
      var got = getInstance(storage, journal.ops[j].sideGameId);
      if (got.ok) recs.push(got.record);
    }
    if (!upsertIndexRecords(storage, recs, clock)) {
      logV2('recovery', { stage: 'instances_written-index', error: 'storage_write_failed', opCount: recs.length });
      return { ok: false, reason: 'storage_write_failed' };
    }
    journal.status = 'index_written';
    if (!saveJournal(storage, journal)) return { ok: false, reason: 'storage_write_failed' };
    status = 'index_written';
  }
  if (status === 'index_written' || status === 'committed') {
    deleteJournalAndStaging(storage, journal);
    logV2('recovery', { stage: 'cleanup', txStatus: status, opCount: (journal.ops || []).length, error: '' });
  }
  return { ok: true, reason: '' };
}

function commitOps(storage, input, clock) {
  var opsIn = (input && input.ops) || [];
  var txId = newTxId(clock);
  var ops = [];
  var i;
  for (i = 0; i < opsIn.length; i++) {
    var after = rec.normalizeRecord(opsIn[i].after);
    var sid = rec.asString(after.sideGameId);
    var sk = stagingKey(txId, sid);
    ops.push({
      type: rec.asString(opsIn[i].type) || 'update',
      sideGameId: sid,
      beforeRevision: Number(opsIn[i].beforeRevision) || 0,
      afterRevision: Number(after.revision) || 1,
      stagingKey: sk,
      after: after
    });
  }
  logV2('transaction', { stage: 'staging', txStatus: '', opCount: ops.length });
  for (i = 0; i < ops.length; i++) {
    if (!storage.setItem(ops[i].stagingKey, rec.jsonClone(ops[i].after))) {
      var k;
      for (k = 0; i >= 0 && k < i; k++) removeItem(storage, ops[k].stagingKey);
      if (i >= 0) removeItem(storage, ops[i].stagingKey);
      logV2('transaction', { stage: 'staging', error: 'storage_write_failed', opCount: ops.length });
      return { ok: false, reason: 'storage_write_failed' };
    }
  }
  var journal = {
    txId: txId,
    matchId: rec.asString(input && input.matchId),
    createdAt: typeof clock === 'function' ? clock() : Date.now(),
    status: 'pending',
    ops: ops.map(function (op) {
      return {
        type: op.type,
        sideGameId: op.sideGameId,
        beforeRevision: op.beforeRevision,
        afterRevision: op.afterRevision,
        stagingKey: op.stagingKey
      };
    })
  };
  if (!saveJournal(storage, journal)) {
    for (i = 0; i < ops.length; i++) removeItem(storage, ops[i].stagingKey);
    logV2('transaction', { stage: 'journal-pending', error: 'storage_write_failed', opCount: ops.length });
    return { ok: false, reason: 'storage_write_failed' };
  }
  logV2('transaction', { stage: 'pending', txStatus: 'pending', opCount: ops.length });
  for (i = 0; i < ops.length; i++) {
    var existing = getInstance(storage, ops[i].sideGameId);
    if (existing.ok && (Number(existing.record.revision) || 0) >= ops[i].afterRevision) continue;
    if (!putInstance(storage, ops[i].after)) {
      logV2('transaction', { stage: 'write-instance', error: 'storage_write_failed', opCount: ops.length, revision: ops[i].afterRevision });
      return { ok: false, reason: 'storage_write_failed', journalPending: true };
    }
  }
  journal.status = 'instances_written';
  if (!saveJournal(storage, journal)) {
    logV2('transaction', { stage: 'instances_written', error: 'storage_write_failed', opCount: ops.length });
    return { ok: false, reason: 'storage_write_failed' };
  }
  var afters = ops.map(function (op) {
    return op.after;
  });
  if (!upsertIndexRecords(storage, afters, clock)) {
    logV2('transaction', { stage: 'index', error: 'storage_write_failed', opCount: ops.length });
    return { ok: false, reason: 'storage_write_failed' };
  }
  journal.status = 'index_written';
  saveJournal(storage, journal);
  journal.status = 'committed';
  saveJournal(storage, journal);
  deleteJournalAndStaging(storage, journal);
  logV2('transaction', { stage: 'committed', txStatus: 'committed', opCount: ops.length });
  return { ok: true, reason: '' };
}

function loadAllFromIndex(storage) {
  var loaded = loadIndex(storage);
  if (!loaded.ok) return { ok: false, reason: loaded.reason, list: [] };
  return loadRecordsForIndexItems(storage, loaded.index.items || []);
}

module.exports = {
  INDEX_KEY: INDEX_KEY,
  INSTANCE_PREFIX: INSTANCE_PREFIX,
  JOURNAL_KEY: JOURNAL_KEY,
  STAGING_PREFIX: STAGING_PREFIX,
  instanceKey: instanceKey,
  stagingKey: stagingKey,
  listKeys: listKeys,
  loadIndex: loadIndex,
  saveIndex: saveIndex,
  getInstance: getInstance,
  putInstance: putInstance,
  persistRecord: persistRecord,
  upsertIndexRecords: upsertIndexRecords,
  filterIndexHits: filterIndexHits,
  loadRecordsForIndexItems: loadRecordsForIndexItems,
  loadAllFromIndex: loadAllFromIndex,
  repairIndex: repairIndex,
  recoverJournal: recoverJournal,
  commitOps: commitOps,
  loadJournal: loadJournal
};
