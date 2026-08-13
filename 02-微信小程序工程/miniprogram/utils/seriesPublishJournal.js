/**
 * Series 发布日志（独立 storage）
 * 键：gb_series_publish_journal_v1
 * 结构：{ [seriesId]: JournalRecord }
 *
 * 冻结计划后，resume 只读本 journal，不得用当前草稿重建分站。
 */

var STORAGE_KEY = 'gb_series_publish_journal_v1';

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function unwrapGet(res) {
  if (res && typeof res === 'object' && Object.prototype.hasOwnProperty.call(res, 'ok')) {
    return res;
  }
  return { ok: true, value: res };
}

function unwrapSet(res) {
  if (res && typeof res === 'object' && Object.prototype.hasOwnProperty.call(res, 'ok')) {
    return res;
  }
  return { ok: true };
}

function createWxStorageAdapter() {
  return {
    getItem: function (key) {
      var wxRef = typeof wx !== 'undefined' ? wx : null;
      if (!wxRef || typeof wxRef.getStorageSync !== 'function') {
        return { ok: true, value: null };
      }
      try {
        return { ok: true, value: wxRef.getStorageSync(key) };
      } catch (e) {
        return { ok: false, reason: 'storage_read_failed' };
      }
    },
    setItem: function (key, value) {
      var wxRef = typeof wx !== 'undefined' ? wx : null;
      if (!wxRef || typeof wxRef.setStorageSync !== 'function') {
        return { ok: false, reason: 'storage_write_failed' };
      }
      try {
        wxRef.setStorageSync(key, value);
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: 'storage_write_failed' };
      }
    }
  };
}

/**
 * JournalRecord:
 * {
 *   seriesId, publishToken, planVersion, planFingerprint, sourceFingerprint,
 *   phase, nowAtPlan,
 *   rounds: [{ roundId, matchId, payloadFingerprint, matchPayload, status, lastError }],
 *   createdAt, updatedAt, lastError, doneAt, audit
 * }
 */
function createSeriesPublishJournal(storageAdapter) {
  if (!storageAdapter || typeof storageAdapter.getItem !== 'function' || typeof storageAdapter.setItem !== 'function') {
    throw new Error('series_publish_journal_adapter_required');
  }

  function _readAllSafe() {
    var res = unwrapGet(storageAdapter.getItem(STORAGE_KEY));
    if (!res.ok) {
      return { ok: false, reason: res.reason || 'storage_read_failed', map: null };
    }
    var raw = res.value;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: true, map: {} };
    }
    return { ok: true, map: raw };
  }

  function _writeAllSafe(map) {
    try {
      var res = unwrapSet(storageAdapter.setItem(STORAGE_KEY, map && typeof map === 'object' ? map : {}));
      if (!res.ok) {
        return { ok: false, reason: res.reason || 'storage_write_failed' };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'storage_write_failed' };
    }
  }

  function getJournal(seriesId) {
    var sid = seriesId != null ? String(seriesId).trim() : '';
    if (!sid) return { ok: false, reason: 'series_id_required', journal: null };
    var read = _readAllSafe();
    if (!read.ok) return { ok: false, reason: 'storage_read_failed', journal: null };
    var row = read.map[sid];
    if (!row || typeof row !== 'object') {
      return { ok: true, reason: 'absent', journal: null };
    }
    return { ok: true, reason: 'found', journal: deepClone(row) };
  }

  function saveJournal(journal) {
    if (!journal || typeof journal !== 'object') {
      return { ok: false, reason: 'invalid_journal' };
    }
    var sid = journal.seriesId != null ? String(journal.seriesId).trim() : '';
    if (!sid) return { ok: false, reason: 'series_id_required' };
    var read = _readAllSafe();
    if (!read.ok) return { ok: false, reason: 'storage_read_failed' };
    var next = {};
    Object.keys(read.map).forEach(function (k) {
      next[k] = read.map[k];
    });
    var stamp = new Date().toISOString();
    var row = deepClone(journal);
    row.seriesId = sid;
    row.updatedAt = stamp;
    if (!row.createdAt) row.createdAt = stamp;
    next[sid] = row;
    var wrote = _writeAllSafe(next);
    if (!wrote.ok) return { ok: false, reason: 'storage_write_failed' };
    return { ok: true, journal: deepClone(row) };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    getJournal: getJournal,
    saveJournal: saveJournal
  };
}

var defaultJournal = createSeriesPublishJournal(createWxStorageAdapter());

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  createSeriesPublishJournal: createSeriesPublishJournal,
  createWxStorageAdapter: createWxStorageAdapter,
  getJournal: function (seriesId) {
    return defaultJournal.getJournal(seriesId);
  },
  saveJournal: function (journal) {
    return defaultJournal.saveJournal(journal);
  }
};
