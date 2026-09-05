'use strict';

/**
 * 球队域 UI 会话缓存。不是云端鉴权依据。
 * 生产写操作必须走云函数 OPENID；本缓存仅用于展示与本地测试。
 */
var SESSION_STORAGE_KEY = 'gb_auth_session_v1';
var FORBIDDEN_IDS = { me: true, mock: true, demo: true };

var _sessionOverride = null;

function _storage() {
  return typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function'
    ? wx
    : { getStorageSync: function () { return ''; }, setStorageSync: function () {} };
}

function _normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var userId = String(raw.userId || raw.openid || '').trim();
  if (!userId || FORBIDDEN_IDS[userId.toLowerCase()]) return null;
  return {
    userId: userId,
    displayName: String(raw.displayName || raw.nickName || raw.name || '').trim() || userId,
    avatar: String(raw.avatar || raw.avatarUrl || '').trim(),
    source: String(raw.source || 'session')
  };
}

function readSession() {
  if (_sessionOverride) return _sessionOverride;
  var raw;
  try {
    raw = _storage().getStorageSync(SESSION_STORAGE_KEY);
  } catch (e) {
    raw = null;
  }
  if (typeof raw === 'string' && raw) {
    try {
      raw = JSON.parse(raw);
    } catch (e2) {
      raw = null;
    }
  }
  var fromKey = _normalize(raw);
  if (fromKey) return fromKey;
  return _hydrateFromQrAuth();
}

function _hydrateFromQrAuth() {
  var auth;
  try {
    auth = _storage().getStorageSync('gb_qr_access_auth_v1');
  } catch (e) {
    return null;
  }
  if (!auth || typeof auth !== 'object') return null;
  if (auth.registered === false) return null;
  return _normalize({
    userId: auth.userId,
    displayName: auth.displayName || auth.nickName,
    avatar: auth.avatar,
    source: 'qr_auth'
  });
}

function writeSession(session) {
  var next = _normalize(session);
  _sessionOverride = next;
  if (!next) {
    try {
      _storage().setStorageSync(SESSION_STORAGE_KEY, '');
    } catch (e) {
      /* ignore */
    }
    return null;
  }
  try {
    _storage().setStorageSync(SESSION_STORAGE_KEY, JSON.stringify(next));
  } catch (e2) {
    /* ignore */
  }
  return next;
}

var LOGOUT_UNSYNCED_HINT = '还有成绩尚未同步，退出后将在下次登录继续同步。';

function pendingScoreCount() {
  try {
    return require('./scoreSync.js').countPending();
  } catch (e) {
    return 0;
  }
}

function prepareLogout() {
  var n = pendingScoreCount();
  return {
    pendingCount: n,
    shouldPrompt: n > 0,
    message: n > 0 ? LOGOUT_UNSYNCED_HINT : ''
  };
}

function discardLocalAccountData(options) {
  var uid = currentUserIdOrEmpty();
  var n = pendingScoreCount();
  var confirmText = '将放弃 ' + n + ' 条未同步成绩，此操作不可恢复。';
  if (!uid) {
    return { ok: false, code: 'need_login', pendingCount: 0, message: '未登录' };
  }
  if (!options || options.confirmed !== true) {
    return { ok: false, code: 'need_confirm', pendingCount: n, message: confirmText };
  }
  try {
    require('./scoreSync.js').clearUser(uid);
  } catch (e) {
    /* ignore */
  }
  try {
    require('./matchSync.js').clearUser(uid);
  } catch (e2) {
    /* ignore */
  }
  logout();
  return { ok: true, discarded: n };
}

/**
 * 退出当前账号：清内存会话与页面缓存，默认保留持久化 outbox。
 */
function logout() {
  var uid = currentUserIdOrEmpty();
  _sessionOverride = null;
  try {
    _storage().setStorageSync(SESSION_STORAGE_KEY, '');
  } catch (e) {
    /* ignore */
  }
  try {
    require('./snapshot.js').reset();
  } catch (e2) {
    /* ignore */
  }
  try {
    require('../teamMatchStore.js').clearUserMatchCache(uid);
  } catch (e3) {
    /* ignore */
  }
}

function clearSession(options) {
  if (options && options.discardOutbox === true) {
    return discardLocalAccountData({ confirmed: true });
  }
  logout();
}

/** 测试注入；生产页面勿调用 */
function setTestSession(session) {
  _sessionOverride = _normalize(session);
  return _sessionOverride;
}

function requireUser() {
  var s = readSession();
  if (!s) {
    return { ok: false, code: 'need_login', message: '未登录' };
  }
  return { ok: true, user: s };
}

function currentUserIdOrEmpty() {
  var s = readSession();
  return s ? s.userId : '';
}

module.exports = {
  SESSION_STORAGE_KEY: SESSION_STORAGE_KEY,
  LOGOUT_UNSYNCED_HINT: LOGOUT_UNSYNCED_HINT,
  readSession: readSession,
  writeSession: writeSession,
  clearSession: clearSession,
  logout: logout,
  prepareLogout: prepareLogout,
  discardLocalAccountData: discardLocalAccountData,
  setTestSession: setTestSession,
  requireUser: requireUser,
  currentUserIdOrEmpty: currentUserIdOrEmpty
};
