/**
 * 系列赛轻量存储
 * 存储键：gb_series_v1
 *
 * - saveDraft：仅接受空/draft 输入；不得覆盖非 draft 已存对象；不强制改写非 draft 输入
 * - upsertSeries：受控生命周期迁移（非发布 API）
 * - 写失败返回 storage_write_failed；读失败不写回空数据
 */

var model = require('./seriesModel.js');
var validators = require('./seriesValidators.js');

var STORAGE_KEY = 'gb_series_v1';

var LIFECYCLE_TRANSITIONS = {
  draft: { draft: true, published: true, cancelled: true },
  published: { published: true, cancelled: true, archived: true },
  cancelled: { cancelled: true, archived: true },
  archived: { archived: true }
};

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function isLifecycleTransitionAllowed(fromStatus, toStatus) {
  var to = toStatus != null ? String(toStatus).trim() : '';
  if (!to) return false;
  if (fromStatus == null || fromStatus === '') {
    return to === 'draft';
  }
  var from = String(fromStatus).trim();
  return !!(LIFECYCLE_TRANSITIONS[from] && LIFECYCLE_TRANSITIONS[from][to]);
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
  // 旧式 adapter 无返回值：视为成功（自测应使用显式 envelope）
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

function createSeriesStore(storageAdapter) {
  if (!storageAdapter || typeof storageAdapter.getItem !== 'function' || typeof storageAdapter.setItem !== 'function') {
    throw new Error('series_store_adapter_required');
  }

  function _readAllSafe() {
    var res = unwrapGet(storageAdapter.getItem(STORAGE_KEY));
    if (!res.ok) {
      return { ok: false, reason: res.reason || 'storage_read_failed', list: null };
    }
    var raw = res.value;
    if (raw == null) return { ok: true, list: [] };
    if (!Array.isArray(raw)) return { ok: true, list: [] };
    return { ok: true, list: raw };
  }

  function _writeAllSafe(list) {
    try {
      var res = unwrapSet(storageAdapter.setItem(STORAGE_KEY, Array.isArray(list) ? list : []));
      if (!res.ok) {
        return { ok: false, reason: res.reason || 'storage_write_failed' };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'storage_write_failed' };
    }
  }

  function normalizeSeries(raw) {
    return model.normalizeSeries(raw);
  }

  function findRawById(list, seriesId) {
    var id = String(seriesId || '').trim();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].seriesId || '').trim() === id) return list[i];
    }
    return null;
  }

  function listSeries() {
    var read = _readAllSafe();
    if (!read.ok) return [];
    return read.list
      .map(function (item) {
        return deepClone(normalizeSeries(item));
      })
      .filter(function (s) {
        return s && s.seriesId;
      })
      .sort(function (a, b) {
        return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      });
  }

  function getSeriesById(seriesId) {
    var id = seriesId != null ? String(seriesId).trim() : '';
    if (!id) return null;
    var read = _readAllSafe();
    if (!read.ok) return null;
    var item = findRawById(read.list, id);
    if (!item) return null;
    return deepClone(normalizeSeries(item));
  }

  /**
   * 保存草稿
   * @returns {{ ok: boolean, series?: object, errors?: Array, reason?: string }}
   */
  function saveDraft(seriesInput) {
    var inputLife =
      seriesInput && seriesInput.lifecycleStatus != null && String(seriesInput.lifecycleStatus).trim() !== ''
        ? String(seriesInput.lifecycleStatus).trim()
        : '';
    if (inputLife && inputLife !== 'draft') {
      return { ok: false, reason: 'not_draft_input' };
    }

    var normalized = normalizeSeries(seriesInput);
    if (normalized.lifecycleStatus !== 'draft') {
      return { ok: false, reason: 'not_draft_input' };
    }
    normalized.updatedAt = model.nowIso();
    if (!normalized.createdAt) normalized.createdAt = normalized.updatedAt;

    var check = validators.validateDraftStructure(normalized);
    if (!check.ok) {
      return { ok: false, reason: 'draft_invalid', errors: check.errors };
    }

    var read = _readAllSafe();
    if (!read.ok) {
      return { ok: false, reason: 'storage_read_failed' };
    }
    var existing = findRawById(read.list, normalized.seriesId);
    if (existing) {
      var existingLife = String(existing.lifecycleStatus || '').trim();
      if (existingLife && existingLife !== 'draft') {
        return { ok: false, reason: 'existing_not_draft' };
      }
      // 已落盘非空 createdBy 锁定，禁止被当前保存覆盖/清空
      var lockedCreator = model.resolveCreatedByField(existing);
      if (lockedCreator) normalized.createdBy = lockedCreator;
    }

    var next = [normalized].concat(
      read.list.filter(function (item) {
        return item && String(item.seriesId || '').trim() !== normalized.seriesId;
      })
    );
    var wrote = _writeAllSafe(next);
    if (!wrote.ok) {
      return { ok: false, reason: 'storage_write_failed' };
    }
    return { ok: true, series: deepClone(normalized) };
  }

  /**
   * 领域层受控写入（非发布）。
   * 生命周期迁移见 isLifecycleTransitionAllowed。
   */
  function upsertSeries(seriesInput) {
    var normalized = normalizeSeries(seriesInput);
    if (!normalized.seriesId) {
      return {
        ok: false,
        reason: 'series_id_required',
        errors: [{ code: 'series_id_required', message: 'seriesId 缺失', path: 'seriesId' }]
      };
    }

    var read = _readAllSafe();
    if (!read.ok) {
      return { ok: false, reason: 'storage_read_failed' };
    }
    var existing = findRawById(read.list, normalized.seriesId);
    var fromStatus = existing ? String(existing.lifecycleStatus || '').trim() : '';
    var toStatus = String(normalized.lifecycleStatus || '').trim();

    if (!isLifecycleTransitionAllowed(fromStatus || null, toStatus)) {
      return {
        ok: false,
        reason: 'lifecycle_transition_denied',
        from: fromStatus || null,
        to: toStatus || null
      };
    }

    if (existing) {
      var lockedCreatorUpsert = model.resolveCreatedByField(existing);
      if (lockedCreatorUpsert) normalized.createdBy = lockedCreatorUpsert;
    }

    normalized.updatedAt = model.nowIso();
    if (!normalized.createdAt) {
      normalized.createdAt = existing && existing.createdAt ? String(existing.createdAt) : normalized.updatedAt;
    }

    var check = validators.validateDraftStructure(normalized);
    if (!check.ok) {
      return { ok: false, reason: 'structure_invalid', errors: check.errors };
    }

    var next = [normalized].concat(
      read.list.filter(function (item) {
        return item && String(item.seriesId || '').trim() !== normalized.seriesId;
      })
    );
    var wrote = _writeAllSafe(next);
    if (!wrote.ok) {
      return { ok: false, reason: 'storage_write_failed' };
    }
    return { ok: true, series: deepClone(normalized) };
  }

  /**
   * 报名域 checked 写入：读最新 → 校验 expectedRegistrationRevision → upsert。
   * 仅防本地陈旧写入；非跨设备 CAS。不改变 upsertSeries 语义。
   * @returns {{ ok, series?, reason?, currentRevision? }}
   */
  function upsertSeriesChecked(seriesInput, expectedRegistrationRevision) {
    var input = seriesInput && typeof seriesInput === 'object' ? seriesInput : {};
    var sid = input.seriesId != null ? String(input.seriesId).trim() : '';
    if (!sid) {
      return { ok: false, reason: 'series_id_required' };
    }
    var read = _readAllSafe();
    if (!read.ok) {
      return { ok: false, reason: 'storage_read_failed' };
    }
    var existingRaw = findRawById(read.list, sid);
    if (existingRaw) {
      var existing = normalizeSeries(existingRaw);
      var currentRev = model.normalizeRegistrationRevision(existing.registrationRevision);
      var expected = expectedRegistrationRevision;
      if (expected != null && expected !== '') {
        var expN = Number(expected);
        if (!Number.isFinite(expN) || Math.floor(expN) !== expN || expN < 0) {
          return { ok: false, reason: 'expected_revision_invalid' };
        }
        if (currentRev !== Math.floor(expN)) {
          return {
            ok: false,
            reason: 'registration_conflict',
            currentRevision: currentRev
          };
        }
      }
    }
    return upsertSeries(input);
  }

  function removeDraft(seriesId) {
    var id = seriesId != null ? String(seriesId).trim() : '';
    if (!id) return { ok: false, reason: 'series_id_required' };
    var read = _readAllSafe();
    if (!read.ok) return { ok: false, reason: 'storage_read_failed' };
    var found = findRawById(read.list, id);
    if (!found) return { ok: false, reason: 'not_found' };
    var life = String(found.lifecycleStatus || '').trim();
    if (life !== 'draft') {
      return { ok: false, reason: 'not_draft' };
    }
    var next = read.list.filter(function (item) {
      return !(item && String(item.seriesId || '').trim() === id);
    });
    var wrote = _writeAllSafe(next);
    if (!wrote.ok) {
      return { ok: false, reason: 'storage_write_failed' };
    }
    return { ok: true, reason: 'removed' };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    listSeries: listSeries,
    getSeriesById: getSeriesById,
    saveDraft: saveDraft,
    upsertSeries: upsertSeries,
    upsertSeriesChecked: upsertSeriesChecked,
    removeDraft: removeDraft,
    normalizeSeries: normalizeSeries,
    isLifecycleTransitionAllowed: isLifecycleTransitionAllowed
  };
}

var defaultStore = createSeriesStore(createWxStorageAdapter());

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  LIFECYCLE_TRANSITIONS: LIFECYCLE_TRANSITIONS,
  isLifecycleTransitionAllowed: isLifecycleTransitionAllowed,
  createSeriesStore: createSeriesStore,
  createWxStorageAdapter: createWxStorageAdapter,
  listSeries: function () {
    return defaultStore.listSeries();
  },
  getSeriesById: function (seriesId) {
    return defaultStore.getSeriesById(seriesId);
  },
  saveDraft: function (series) {
    return defaultStore.saveDraft(series);
  },
  upsertSeries: function (series) {
    return defaultStore.upsertSeries(series);
  },
  upsertSeriesChecked: function (series, expectedRegistrationRevision) {
    return defaultStore.upsertSeriesChecked(series, expectedRegistrationRevision);
  },
  removeDraft: function (seriesId) {
    return defaultStore.removeDraft(seriesId);
  },
  normalizeSeries: function (raw) {
    return defaultStore.normalizeSeries(raw);
  }
};
