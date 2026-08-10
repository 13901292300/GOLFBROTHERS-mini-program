/**
 * reaction 人气记账（本地 MVP）。
 * 人气值 = 用户收到的有效 reaction 金币快照累计（永久 totalsByTarget）。
 * 不声称真实扣费；不读聊天倒推；不追溯历史动画。
 *
 * 主包模块：可由 detail/score 宿主调用；reaction 分包不得同步 require 本模块。
 *
 * Storage 结构 v2：
 * {
 *   version: 2,
 *   totalsByTarget: { [userId]: number },
 *   processedEventIds: string[],
 *   entries: Entry[]  // 最近明细，有上限；截断不影响 totals
 * }
 */

const STORAGE_KEY = 'gb_reaction_popularity_ledger_v1';
const DOC_VERSION = 2;
const MAX_ENTRIES = 200;
const MAX_PROCESSED_IDS = 500;

const playerIdentityGuard = require('./playerIdentityGuard.js');
const reactionPanelConfig = require('./reactionPanelConfig.js');

const LEDGER_DEBUG = false;
function ledgerDebug() {
  if (!LEDGER_DEBUG) return;
  try {
    console['log'].apply(console, arguments);
  } catch (e) { /* ignore */ }
}

function _now() {
  return Date.now();
}

function _trim(v) {
  return v == null ? '' : String(v).trim();
}

function _emptyDoc() {
  return {
    version: DOC_VERSION,
    totalsByTarget: {},
    processedEventIds: [],
    entries: []
  };
}

function _normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const eventId = _trim(raw.eventId);
  const senderUserId = playerIdentityGuard.normalizePlayerUserId(raw.senderUserId);
  const targetUserId = playerIdentityGuard.normalizePlayerUserId(raw.targetUserId);
  const reactionKey = _trim(raw.reactionKey);
  const coinValue = Number(raw.coinValue);
  const status = _trim(raw.status) || 'valid';
  if (!eventId || !senderUserId || !targetUserId || !reactionKey) return null;
  if (!Number.isFinite(coinValue) || coinValue < 0) return null;
  return {
    eventId: eventId,
    senderUserId: senderUserId,
    targetUserId: targetUserId,
    reactionKey: reactionKey,
    coinValue: Math.floor(coinValue),
    sourceType: _trim(raw.sourceType) || 'player_action',
    sourceId: _trim(raw.sourceId),
    status: status === 'invalid' ? 'invalid' : 'valid',
    createdAt: Number(raw.createdAt) || _now()
  };
}

function _capList(list, max) {
  const arr = Array.isArray(list) ? list : [];
  if (arr.length <= max) return arr;
  return arr.slice(arr.length - max);
}

/**
 * 旧 v1（仅 entries）幂等迁移到 v2：重算 totals + processedEventIds。
 * 截断明细不减少 totals。
 */
function _migrateDoc(raw) {
  const base = _emptyDoc();
  if (!raw || typeof raw !== 'object') return base;

  const entriesIn = Array.isArray(raw.entries) ? raw.entries : [];
  const seen = {};
  const entries = [];
  entriesIn.forEach((item) => {
    const e = _normalizeEntry(item);
    if (!e || seen[e.eventId]) return;
    seen[e.eventId] = true;
    entries.push(e);
  });

  let totalsByTarget = {};
  if (raw.totalsByTarget && typeof raw.totalsByTarget === 'object') {
    Object.keys(raw.totalsByTarget).forEach((k) => {
      const id = playerIdentityGuard.normalizePlayerUserId(k);
      if (!playerIdentityGuard.isStablePublicUserId(id)) return;
      const n = Number(raw.totalsByTarget[k]);
      if (!Number.isFinite(n) || n < 0) return;
      totalsByTarget[id] = Math.floor(n);
    });
  }

  // 无 totals 或 version<2：从 entries 幂等累计（同 eventId 只一次）
  const needRebuildTotals =
    Number(raw.version) !== DOC_VERSION ||
    !raw.totalsByTarget ||
    typeof raw.totalsByTarget !== 'object';
  if (needRebuildTotals) {
    totalsByTarget = {};
    entries.forEach((e) => {
      if (!e || e.status !== 'valid') return;
      totalsByTarget[e.targetUserId] =
        (totalsByTarget[e.targetUserId] || 0) + (Number(e.coinValue) || 0);
    });
  }

  let processedEventIds = [];
  if (Array.isArray(raw.processedEventIds)) {
    const pidSeen = {};
    raw.processedEventIds.forEach((id) => {
      const s = _trim(id);
      if (!s || pidSeen[s]) return;
      pidSeen[s] = true;
      processedEventIds.push(s);
    });
  }
  // 保证 entries 内 eventId 都在 processed 中
  entries.forEach((e) => {
    if (e && e.eventId && processedEventIds.indexOf(e.eventId) < 0) {
      processedEventIds.push(e.eventId);
    }
  });

  return {
    version: DOC_VERSION,
    totalsByTarget: totalsByTarget,
    processedEventIds: _capList(processedEventIds, MAX_PROCESSED_IDS),
    entries: _capList(entries, MAX_ENTRIES)
  };
}

function _readDoc() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    return _migrateDoc(raw);
  } catch (e) {
    return _emptyDoc();
  }
}

function _writeDoc(doc) {
  try {
    const safe = doc && typeof doc === 'object' ? doc : _emptyDoc();
    wx.setStorageSync(STORAGE_KEY, {
      version: DOC_VERSION,
      totalsByTarget: safe.totalsByTarget || {},
      processedEventIds: _capList(safe.processedEventIds, MAX_PROCESSED_IDS),
      entries: _capList(safe.entries, MAX_ENTRIES)
    });
  } catch (e) {
    ledgerDebug('[popularity] write failed');
  }
}

function resolveReactionCoinValue(reactionKey) {
  if (typeof reactionPanelConfig.getReactionCost === 'function') {
    return reactionPanelConfig.getReactionCost(reactionKey);
  }
  const key = _trim(reactionKey);
  if (!key) return null;
  const costMap = reactionPanelConfig.REACTION_COST || {};
  if (!Object.prototype.hasOwnProperty.call(costMap, key)) return null;
  const n = Number(costMap[key]);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function _isProcessed(doc, eventId) {
  const ids = doc.processedEventIds || [];
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] === eventId) return true;
  }
  const entries = doc.entries || [];
  for (let j = 0; j < entries.length; j++) {
    if (entries[j] && entries[j].eventId === eventId) return true;
  }
  return false;
}

/**
 * 幂等记账。成功返回 entry；拒绝返回 null；重复 eventId 返回已有轻量标记对象。
 */
function recordReactionPopularity(input) {
  const src = input && typeof input === 'object' ? input : {};
  const eventId = _trim(src.eventId);
  const reactionKey = _trim(src.reactionKey);
  const senderUserId = playerIdentityGuard.normalizePlayerUserId(src.senderUserId);
  // 宿主必须传入 active target 快照中的正式 userId；不信任页面任意金币值
  const targetUserId = playerIdentityGuard.normalizePlayerUserId(src.targetUserId);
  const sourceType = _trim(src.sourceType) || 'player_action';
  const sourceId = _trim(src.sourceId);

  if (!eventId) {
    ledgerDebug('[popularity] reject: no eventId');
    return null;
  }
  if (!playerIdentityGuard.isStablePublicUserId(senderUserId)) {
    ledgerDebug('[popularity] reject: bad sender');
    return null;
  }
  if (!playerIdentityGuard.isStablePublicUserId(targetUserId)) {
    ledgerDebug('[popularity] reject: bad target');
    return null;
  }
  if (senderUserId === targetUserId) {
    ledgerDebug('[popularity] reject: self');
    return null;
  }
  const coinValue = resolveReactionCoinValue(reactionKey);
  if (coinValue == null) {
    ledgerDebug('[popularity] reject: bad reactionKey');
    return null;
  }

  const doc = _readDoc();
  if (_isProcessed(doc, eventId)) {
    ledgerDebug('[popularity] idempotent hit', eventId);
    return {
      eventId: eventId,
      targetUserId: targetUserId,
      coinValue: coinValue,
      status: 'valid',
      duplicate: true
    };
  }

  const entry = {
    eventId: eventId,
    senderUserId: senderUserId,
    targetUserId: targetUserId,
    reactionKey: reactionKey,
    coinValue: coinValue,
    sourceType: sourceType,
    sourceId: sourceId,
    status: 'valid',
    createdAt: _now()
  };

  doc.totalsByTarget[targetUserId] =
    (Number(doc.totalsByTarget[targetUserId]) || 0) + coinValue;
  doc.processedEventIds.push(eventId);
  doc.entries.push(entry);
  doc.processedEventIds = _capList(doc.processedEventIds, MAX_PROCESSED_IDS);
  doc.entries = _capList(doc.entries, MAX_ENTRIES);
  _writeDoc(doc);
  ledgerDebug('[popularity] recorded', reactionKey, coinValue);
  return entry;
}

function invalidateReactionEntry(eventId) {
  const id = _trim(eventId);
  if (!id) return false;
  const doc = _readDoc();
  let changed = false;
  let targetUserId = '';
  let coinValue = 0;
  doc.entries = (doc.entries || []).map((e) => {
    if (!e || e.eventId !== id) return e;
    if (e.status === 'invalid') return e;
    changed = true;
    targetUserId = e.targetUserId;
    coinValue = Number(e.coinValue) || 0;
    return Object.assign({}, e, { status: 'invalid' });
  });
  if (changed && targetUserId && coinValue > 0) {
    const next = (Number(doc.totalsByTarget[targetUserId]) || 0) - coinValue;
    doc.totalsByTarget[targetUserId] = next > 0 ? next : 0;
  }
  if (changed) _writeDoc(doc);
  return changed;
}

function getPopularityValue(userId) {
  const id = playerIdentityGuard.normalizePlayerUserId(userId);
  if (!playerIdentityGuard.isStablePublicUserId(id)) return 0;
  const doc = _readDoc();
  const fromTotal = Number(doc.totalsByTarget && doc.totalsByTarget[id]);
  if (Number.isFinite(fromTotal) && fromTotal >= 0) return Math.floor(fromTotal);
  // 兜底：明细求和（截断后可能偏低，正常路径走 totals）
  let sum = 0;
  (doc.entries || []).forEach((e) => {
    if (!e || e.status !== 'valid') return;
    if (e.targetUserId !== id) return;
    sum += Number(e.coinValue) || 0;
  });
  return sum;
}

function getPopularityValues(userIds) {
  const map = {};
  const ids = Array.isArray(userIds) ? userIds : [];
  const want = {};
  ids.forEach((raw) => {
    const id = playerIdentityGuard.normalizePlayerUserId(raw);
    if (!playerIdentityGuard.isStablePublicUserId(id)) return;
    want[id] = true;
    map[id] = 0;
  });
  if (!Object.keys(want).length) return map;
  const doc = _readDoc();
  Object.keys(want).forEach((id) => {
    const n = Number(doc.totalsByTarget && doc.totalsByTarget[id]);
    map[id] = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  });
  return map;
}

function formatPopularityDisplay(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const v = Math.floor(n);
  if (v < 10000) return String(v);
  const wan = v / 10000;
  const fixed = wan >= 100 ? String(Math.round(wan)) : wan.toFixed(1).replace(/\.0$/, '');
  return fixed + '万';
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  DOC_VERSION: DOC_VERSION,
  MAX_ENTRIES: MAX_ENTRIES,
  MAX_PROCESSED_IDS: MAX_PROCESSED_IDS,
  recordReactionPopularity: recordReactionPopularity,
  invalidateReactionEntry: invalidateReactionEntry,
  getPopularityValue: getPopularityValue,
  getPopularityValues: getPopularityValues,
  formatPopularityDisplay: formatPopularityDisplay,
  resolveReactionCoinValue: resolveReactionCoinValue
};
