/**
 * 讨论区围观访问记录（单设备）。
 *
 * 产品要的是「点过本场卡片的所有用户」。当前客户端只有本机资料 / CURRENT_USER，
 * 稳定 id 常为占位符 me，且没有围观云集合。因此本模块只保存本机访问，
 * sharedStatus 恒为 local_only，不得当成多用户围观已完成。
 *
 * 不读 gb_auth_session_v1（球队 UI 会话）。不写入演示用户。
 */

const STORAGE_KEY = 'gb_discussion_visits_v1';
const SHARED_STATUS = 'local_only';
const SHARED_BLOCKER =
  'no_cross_device_identity_or_shared_store';

var userIdentityAlias = require('./userIdentityAlias.js');

var _storageAdapter = null;
var _failNextWrite = false;

function setStorageAdapter(adapter) {
  _storageAdapter = adapter || null;
}

function failNextWrite() {
  _failNextWrite = true;
}

function _io() {
  if (_storageAdapter) return _storageAdapter;
  if (typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function') {
    return wx;
  }
  return null;
}

function _trim(v) {
  return v == null ? '' : String(v).trim();
}

function canonicalUserId(userId) {
  var id = _trim(userId);
  if (!id) return '';
  try {
    return _trim(userIdentityAlias.resolveCanonicalUserId(id)) || id;
  } catch (e) {
    return id;
  }
}

function _readDoc() {
  var io = _io();
  if (!io || typeof io.getStorageSync !== 'function') {
    return { version: 1, sharedStatus: SHARED_STATUS, rooms: {} };
  }
  try {
    return _normalizeDoc(io.getStorageSync(STORAGE_KEY));
  } catch (e) {
    return { version: 1, sharedStatus: SHARED_STATUS, rooms: {} };
  }
}

function _normalizeDoc(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { version: 1, sharedStatus: SHARED_STATUS, rooms: {} };
  }
  var rooms = {};
  var src =
    raw.rooms && typeof raw.rooms === 'object' && !Array.isArray(raw.rooms)
      ? raw.rooms
      : {};
  Object.keys(src).forEach(function (key) {
    rooms[key] = _normalizeList(src[key]);
  });
  return {
    version: 1,
    sharedStatus: SHARED_STATUS,
    rooms: rooms
  };
}

function _isDemoVisitor(item) {
  if (!item || typeof item !== 'object') return true;
  if (item.demo === true || item.isDemo === true || item.seed === true) return true;
  var src = _trim(item.identitySource).toLowerCase();
  if (src === 'demo' || src === 'seed' || src === 'preset') return true;
  var uid = canonicalUserId(item.userId || item.playerUserId);
  if (/^demo[-_]/i.test(uid) || /^chat-demo/i.test(uid)) return true;
  return false;
}

function _normalizeVisitor(item) {
  if (_isDemoVisitor(item)) return null;
  var userId = canonicalUserId(item.userId || item.playerUserId);
  if (!userId) return null;
  var enteredAt = Number(item.enteredAt);
  if (!Number.isFinite(enteredAt) || enteredAt <= 0) enteredAt = Date.now();
  var name = _trim(item.name || item.nickname || item.displayName);
  return {
    userId: userId,
    playerUserId: _trim(item.playerUserId) || userId,
    name: name,
    nickname: _trim(item.nickname) || name,
    avatar: _trim(item.avatar || item.avatarUrl),
    gender: _trim(item.gender),
    enteredAt: enteredAt,
    identityKind: _trim(item.identityKind) || (userId === 'me' ? 'local_me' : 'account')
  };
}

function _byEnteredAtDesc(a, b) {
  var ta = Number(a && a.enteredAt) || 0;
  var tb = Number(b && b.enteredAt) || 0;
  if (ta !== tb) return tb - ta;
  var ia = a && a.userId != null ? String(a.userId) : '';
  var ib = b && b.userId != null ? String(b.userId) : '';
  if (ia < ib) return -1;
  if (ia > ib) return 1;
  return 0;
}

function _normalizeList(list) {
  var map = {};
  (Array.isArray(list) ? list : []).forEach(function (item) {
    var v = _normalizeVisitor(item);
    if (!v) return;
    var prev = map[v.userId];
    if (!prev || v.enteredAt >= prev.enteredAt) {
      if (prev) {
        if (!v.name) v.name = prev.name;
        if (!v.avatar) v.avatar = prev.avatar;
        if (!v.nickname) v.nickname = prev.nickname;
      }
      map[v.userId] = v;
    }
  });
  return Object.keys(map)
    .map(function (k) {
      return map[k];
    })
    .sort(_byEnteredAtDesc);
}

function _writeDoc(doc) {
  if (_failNextWrite) {
    _failNextWrite = false;
    return false;
  }
  var io = _io();
  if (!io || typeof io.setStorageSync !== 'function') return false;
  try {
    io.setStorageSync(STORAGE_KEY, {
      version: 1,
      sharedStatus: SHARED_STATUS,
      rooms: (doc && doc.rooms) || {}
    });
    return true;
  } catch (e) {
    return false;
  }
}

function cloneRoom(roomKey) {
  return listWatchers(roomKey);
}

function replaceRoom(roomKey, list) {
  var key = _trim(roomKey);
  if (!key) return false;
  var doc = _readDoc();
  if (!doc.rooms) doc.rooms = {};
  doc.rooms[key] = _normalizeList(list);
  return _writeDoc(doc);
}

function listWatchers(roomKey) {
  var key = _trim(roomKey);
  if (!key) return [];
  var doc = _readDoc();
  var list = doc.rooms && doc.rooms[key];
  return Array.isArray(list) ? list.slice() : [];
}

/**
 * 按稳定 userId 去重；再次进入更新 enteredAt 并排到最前。
 * @returns {{ ok: boolean, watcher?: object, error?: string, sharedStatus: string }}
 */
function recordVisit(roomKey, actor, enteredAt) {
  var key = _trim(roomKey);
  if (!key) return { ok: false, skipped: true, error: '缺少比赛范围', sharedStatus: SHARED_STATUS };
  var raw = Object.assign({}, actor || {}, {
    enteredAt: enteredAt != null ? enteredAt : Date.now()
  });
  var visitor = _normalizeVisitor(raw);
  if (!visitor) {
    return { ok: false, error: '无法识别访问者', sharedStatus: SHARED_STATUS };
  }
  var doc = _readDoc();
  if (!doc.rooms) doc.rooms = {};
  var next = [visitor].concat(doc.rooms[key] || []);
  doc.rooms[key] = _normalizeList(next);
  if (!_writeDoc(doc)) {
    return { ok: false, error: '围观记录保存失败', sharedStatus: SHARED_STATUS };
  }
  return {
    ok: true,
    watcher: doc.rooms[key][0],
    sharedStatus: SHARED_STATUS,
    sharedReady: false,
    blocker: SHARED_BLOCKER
  };
}

function sharedMeta() {
  return {
    sharedStatus: SHARED_STATUS,
    sharedReady: false,
    blocker: SHARED_BLOCKER,
    hint: '当前仅本机访问记录，其他账号进入不会出现在此名单'
  };
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  SHARED_STATUS: SHARED_STATUS,
  SHARED_BLOCKER: SHARED_BLOCKER,
  canonicalUserId: canonicalUserId,
  listWatchers: listWatchers,
  recordVisit: recordVisit,
  cloneRoom: cloneRoom,
  replaceRoom: replaceRoom,
  sharedMeta: sharedMeta,
  setStorageAdapter: setStorageAdapter,
  failNextWrite: failNextWrite
};
