/**
 * 系列赛分站反向索引（独立 storage）
 * 存储键：gb_series_station_index_v1
 * - 一个 matchId 只能对应一个 seriesId + roundId
 * - 相同映射幂等成功；冲突明确失败
 * - 写失败返回 storage_write_failed；读失败不写回空映射
 */

var STORAGE_KEY = 'gb_series_station_index_v1';

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

function createSeriesStationIndex(storageAdapter) {
  if (!storageAdapter || typeof storageAdapter.getItem !== 'function' || typeof storageAdapter.setItem !== 'function') {
    throw new Error('series_station_index_adapter_required');
  }

  function _readMapSafe() {
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

  function _writeMapSafe(map) {
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

  function getByMatchId(matchId) {
    var mid = matchId != null ? String(matchId).trim() : '';
    if (!mid) return null;
    var read = _readMapSafe();
    if (!read.ok) return null;
    var row = read.map[mid];
    if (!row || typeof row !== 'object') return null;
    return deepClone({
      matchId: mid,
      seriesId: row.seriesId != null ? String(row.seriesId) : '',
      roundId: row.roundId != null ? String(row.roundId) : ''
    });
  }

  function setLink(matchId, seriesId, roundId) {
    var mid = matchId != null ? String(matchId).trim() : '';
    var sid = seriesId != null ? String(seriesId).trim() : '';
    var rid = roundId != null ? String(roundId).trim() : '';
    if (!mid || !sid || !rid) {
      return { ok: false, reason: 'invalid_args' };
    }
    var read = _readMapSafe();
    if (!read.ok) {
      return { ok: false, reason: 'storage_read_failed' };
    }
    var map = read.map;
    var prev = map[mid];
    if (prev && typeof prev === 'object') {
      var prevSid = prev.seriesId != null ? String(prev.seriesId).trim() : '';
      var prevRid = prev.roundId != null ? String(prev.roundId).trim() : '';
      if (prevSid === sid && prevRid === rid) {
        return {
          ok: true,
          reason: 'idempotent',
          link: { matchId: mid, seriesId: sid, roundId: rid }
        };
      }
      return {
        ok: false,
        reason: 'conflict',
        link: { matchId: mid, seriesId: prevSid, roundId: prevRid }
      };
    }
    var nextMap = {};
    Object.keys(map).forEach(function (k) {
      nextMap[k] = map[k];
    });
    nextMap[mid] = { seriesId: sid, roundId: rid };
    var wrote = _writeMapSafe(nextMap);
    if (!wrote.ok) {
      return { ok: false, reason: 'storage_write_failed' };
    }
    return {
      ok: true,
      reason: 'created',
      link: { matchId: mid, seriesId: sid, roundId: rid }
    };
  }

  /**
   * 按 matchId 删除索引。
   * - 映射不存在：幂等成功（reason: absent）
   * - 本批不接受 expectedSeriesId / expectedRoundId；后续清理分站索引前
   *   必须先 getByMatchId 并核对所有权，不能盲删，以免误删其他系列的映射
   */
  function removeByMatchId(matchId) {
    var mid = matchId != null ? String(matchId).trim() : '';
    if (!mid) return { ok: false, reason: 'invalid_args' };
    var read = _readMapSafe();
    if (!read.ok) return { ok: false, reason: 'storage_read_failed' };
    if (!read.map[mid]) return { ok: true, reason: 'absent' };
    var nextMap = {};
    Object.keys(read.map).forEach(function (k) {
      if (k !== mid) nextMap[k] = read.map[k];
    });
    var wrote = _writeMapSafe(nextMap);
    if (!wrote.ok) {
      return { ok: false, reason: 'storage_write_failed' };
    }
    return { ok: true, reason: 'removed' };
  }

  function listBySeriesId(seriesId) {
    var sid = seriesId != null ? String(seriesId).trim() : '';
    if (!sid) return [];
    var read = _readMapSafe();
    if (!read.ok) return [];
    var out = [];
    Object.keys(read.map).forEach(function (mid) {
      var row = read.map[mid];
      if (!row || typeof row !== 'object') return;
      if (String(row.seriesId || '').trim() !== sid) return;
      out.push({
        matchId: mid,
        seriesId: sid,
        roundId: row.roundId != null ? String(row.roundId) : ''
      });
    });
    return out;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    getByMatchId: getByMatchId,
    setLink: setLink,
    removeByMatchId: removeByMatchId,
    listBySeriesId: listBySeriesId
  };
}

var defaultIndex = createSeriesStationIndex(createWxStorageAdapter());

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  createSeriesStationIndex: createSeriesStationIndex,
  createWxStorageAdapter: createWxStorageAdapter,
  getByMatchId: function (matchId) {
    return defaultIndex.getByMatchId(matchId);
  },
  setLink: function (matchId, seriesId, roundId) {
    return defaultIndex.setLink(matchId, seriesId, roundId);
  },
  removeByMatchId: function (matchId) {
    return defaultIndex.removeByMatchId(matchId);
  },
  listBySeriesId: function (seriesId) {
    return defaultIndex.listBySeriesId(seriesId);
  }
};
