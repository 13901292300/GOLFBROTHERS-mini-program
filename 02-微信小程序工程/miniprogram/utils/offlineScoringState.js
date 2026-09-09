/**
 * 离线记分产品 session（非网络事实）。
 * 不 showModal / 不导航 / 不调 cloud / 不写成绩。
 */

const STORAGE_KEY = 'gb_offline_scoring_session_v1';
const MODE_ONLINE = 'ONLINE';
const MODE_OFFLINE = 'OFFLINE';
const MODE_SYNCING = 'SYNCING';
const MODE_SYNC_FAILED = 'SYNC_FAILED';

const ACTIVE_MODES = {};
ACTIVE_MODES[MODE_OFFLINE] = true;
ACTIVE_MODES[MODE_SYNCING] = true;
ACTIVE_MODES[MODE_SYNC_FAILED] = true;

var _listeners = [];

function _wx() {
  return typeof wx !== 'undefined' && wx
    ? wx
    : {
        getStorageSync: function () {
          return null;
        },
        setStorageSync: function () {},
        removeStorageSync: function () {}
      };
}

function _trim(v) {
  return v == null ? '' : String(v).trim();
}

function isActiveMode(mode) {
  return !!ACTIVE_MODES[_trim(mode)];
}

function matchesContext(session, context) {
  if (!session || !context) return false;
  var sType = _trim(session.contextType) || 'game';
  var cType = _trim(context.contextType) || 'game';
  return sType === cType && _trim(session.contextId) === _trim(context.contextId);
}

function _readRaw() {
  try {
    var raw = _wx().getStorageSync(STORAGE_KEY);
    return raw && typeof raw === 'object' ? raw : null;
  } catch (e) {
    return null;
  }
}

function _writeRaw(session) {
  try {
    if (!session) _wx().removeStorageSync(STORAGE_KEY);
    else _wx().setStorageSync(STORAGE_KEY, session);
  } catch (e) {
    /* ignore */
  }
}

function _normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var mode = _trim(raw.mode);
  if (!isActiveMode(mode)) return null;
  var contextId = _trim(raw.contextId);
  if (!contextId) return null;
  var contextType = _trim(raw.contextType) || 'game';
  return {
    version: 1,
    mode: mode,
    contextType: contextType,
    contextId: contextId,
    title: _trim(raw.title),
    enteredAt: Number(raw.enteredAt) || 0,
    lastSyncAttemptAt: Number(raw.lastSyncAttemptAt) || 0,
    lastFailReason: _trim(raw.lastFailReason)
  };
}

function _publish(snapshot) {
  var list = _listeners.slice();
  var i;
  for (i = 0; i < list.length; i++) {
    try {
      list[i](snapshot);
    } catch (e) {
      /* ignore */
    }
  }
}

function get() {
  var session = _normalize(_readRaw());
  if (!session) return { mode: MODE_ONLINE, session: null };
  return { mode: session.mode, session: session };
}

function _set(session) {
  if (!session) _writeRaw(null);
  else _writeRaw(_normalize(session) || null);
  var snap = get();
  _publish(snap);
  return snap;
}

function enter(context) {
  var src = context && typeof context === 'object' ? context : {};
  var contextId = _trim(src.contextId);
  var cur = get().session;
  if (!contextId) {
    return { ok: false, reason: 'INVALID_CONTEXT', session: cur };
  }
  if (cur) {
    if (matchesContext(cur, src)) {
      return { ok: true, reason: 'ALREADY_ACTIVE', session: cur };
    }
    return { ok: false, reason: 'OTHER_CONTEXT_ACTIVE', session: cur };
  }
  var snap = _set({
    version: 1,
    mode: MODE_OFFLINE,
    contextType: _trim(src.contextType) || 'game',
    contextId: contextId,
    title: _trim(src.title),
    enteredAt: Date.now(),
    lastSyncAttemptAt: 0,
    lastFailReason: ''
  });
  return { ok: true, session: snap.session };
}

function markSyncing(context) {
  var cur = get().session;
  if (!cur) return get();
  if (context && _trim(context.contextId) && !matchesContext(cur, context)) {
    return get();
  }
  cur.mode = MODE_SYNCING;
  cur.lastSyncAttemptAt = Date.now();
  return _set(cur);
}

function markSyncFailed(info, context) {
  var cur = get().session;
  if (!cur) return get();
  if (context && _trim(context.contextId) && !matchesContext(cur, context)) {
    return get();
  }
  var extra = info && typeof info === 'object' ? info : {};
  cur.mode = MODE_SYNC_FAILED;
  cur.lastSyncAttemptAt = Date.now();
  cur.lastFailReason = _trim(extra.reason) || _trim(extra.lastFailReason);
  return _set(cur);
}

function revertToOffline(context) {
  var cur = get().session;
  if (!cur) return get();
  if (context && _trim(context.contextId) && !matchesContext(cur, context)) {
    return get();
  }
  if (cur.mode === MODE_OFFLINE) return get();
  cur.mode = MODE_OFFLINE;
  return _set(cur);
}

function clearAfterSync(context) {
  var cur = get().session;
  if (!cur) return get();
  if (context && _trim(context.contextId) && !matchesContext(cur, context)) {
    return get();
  }
  return _set(null);
}

function subscribe(fn) {
  if (typeof fn !== 'function') return;
  if (_listeners.indexOf(fn) >= 0) return;
  _listeners.push(fn);
}

function unsubscribe(fn) {
  _listeners = _listeners.filter(function (item) {
    return item !== fn;
  });
}

function _resetForTest() {
  _listeners = [];
  _writeRaw(null);
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  MODE_ONLINE: MODE_ONLINE,
  MODE_OFFLINE: MODE_OFFLINE,
  MODE_SYNCING: MODE_SYNCING,
  MODE_SYNC_FAILED: MODE_SYNC_FAILED,
  isActiveMode: isActiveMode,
  matchesContext: matchesContext,
  get: get,
  enter: enter,
  markSyncing: markSyncing,
  markSyncFailed: markSyncFailed,
  revertToOffline: revertToOffline,
  clearAfterSync: clearAfterSync,
  subscribe: subscribe,
  unsubscribe: unsubscribe,
  _resetForTest: _resetForTest
};
