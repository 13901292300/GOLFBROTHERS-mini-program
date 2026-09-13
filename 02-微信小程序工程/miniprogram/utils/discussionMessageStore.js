/**
 * 讨论区本地消息存储（单设备）。
 * - 按稳定房间键隔离：series:{id} / match:{id} / game:{id}
 * - 不宣称多人同步；不写云
 * - 不保存演示种子（demo/isDemo）
 */

const STORAGE_KEY = 'gb_discussion_messages_v1';
const MAX_MESSAGES_PER_ROOM = 400;

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

function isDemoMessage(msg) {
  if (!msg || typeof msg !== 'object') return false;
  if (msg.demo === true || msg.isDemo === true || msg.seed === true) return true;
  var src = _trim(msg.identitySource).toLowerCase();
  if (src === 'demo' || src === 'seed' || src === 'preset') return true;
  var uid = _trim(msg.userId) || _trim(msg.playerUserId);
  if (/^demo[-_]/i.test(uid) || /^chat-demo/i.test(uid)) return true;
  return false;
}

/**
 * 讨论范围：系列赛整场共用 seriesId；队际/队内详情与记分（有 matchId）共用 matchId；
 * Hub / 无 matchId 的记分共用 gameId。不用标题、昵称、临时 TAB。
 */
function resolveRoomKey(input) {
  var o = input || {};
  var seriesId = _trim(o.seriesId);
  if (seriesId) return 'series:' + seriesId;
  var matchId = _trim(o.matchId);
  if (matchId) return 'match:' + matchId;
  var gameId = _trim(o.gameId);
  if (gameId) return 'game:' + gameId;
  return '';
}

function createMessageId(createdAt) {
  var t = Number(createdAt);
  if (!Number.isFinite(t) || t <= 0) t = Date.now();
  return 'dm_' + t.toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function _readDoc() {
  var io = _io();
  if (!io || typeof io.getStorageSync !== 'function') {
    return { version: 1, rooms: {} };
  }
  try {
    var raw = io.getStorageSync(STORAGE_KEY);
    return _normalizeDoc(raw);
  } catch (e) {
    return { version: 1, rooms: {} };
  }
}

function _normalizeDoc(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { version: 1, rooms: {} };
  }
  var rooms = {};
  var src = raw.rooms && typeof raw.rooms === 'object' && !Array.isArray(raw.rooms) ? raw.rooms : raw;
  Object.keys(src).forEach(function (key) {
    if (key === 'version' || key === 'v') return;
    var bucket = src[key];
    var list = [];
    if (Array.isArray(bucket)) list = bucket;
    else if (bucket && Array.isArray(bucket.messages)) list = bucket.messages;
    rooms[key] = _normalizeList(list);
  });
  return { version: 1, rooms: rooms };
}

function _normalizeList(list) {
  var out = [];
  var seen = {};
  (Array.isArray(list) ? list : []).forEach(function (item) {
    var msg = _normalizeStoredMessage(item);
    if (!msg || !msg.id) return;
    if (seen[msg.id]) return;
    seen[msg.id] = true;
    out.push(msg);
  });
  out.sort(_byTimeThenId);
  return out;
}

function _byTimeThenId(a, b) {
  var ta = Number(a && a.createdAt) || 0;
  var tb = Number(b && b.createdAt) || 0;
  if (ta !== tb) return ta - tb;
  var ia = a && a.id != null ? String(a.id) : '';
  var ib = b && b.id != null ? String(b.id) : '';
  if (ia < ib) return -1;
  if (ia > ib) return 1;
  return 0;
}

function _normalizeMention(item) {
  if (!item || typeof item !== 'object') return null;
  var userId = _trim(item.userId);
  if (!userId) return null;
  var userName = _trim(item.userName || item.name || item.nickname);
  var displayText = _trim(item.displayText);
  if (!displayText && userName) displayText = '@' + userName;
  return {
    userId: userId,
    userName: userName,
    displayText: displayText
  };
}

function _normalizeMentions(list) {
  var out = [];
  var seen = {};
  (Array.isArray(list) ? list : []).forEach(function (item) {
    var m = _normalizeMention(item);
    if (!m) return;
    var stamp = m.userId + '\n' + (m.displayText || m.userName);
    if (seen[stamp]) return;
    seen[stamp] = true;
    out.push(m);
  });
  return out;
}

function _normalizeStoredMessage(item) {
  if (!item || typeof item !== 'object') return null;
  if (isDemoMessage(item)) return null;
  var createdAt = Number(item.createdAt != null ? item.createdAt : item.timestamp);
  if (!Number.isFinite(createdAt) || createdAt <= 0) createdAt = Date.now();
  var id = _trim(item.id);
  if (!id) id = 'dm_legacy_' + createdAt + '_' + _trim(item.userId || item.text).slice(0, 12);
  var type = item.type != null ? String(item.type) : '';
  var text = item.text != null ? String(item.text) : '';
  if (type !== 'system' && !text.trim()) return null;
  var out = {
    id: id,
    userId: _trim(item.userId),
    playerUserId: _trim(item.playerUserId),
    text: text,
    createdAt: createdAt,
    mention: item.mention != null ? String(item.mention) : '',
    mentions: _normalizeMentions(item.mentions),
    name: item.name != null ? String(item.name) : '',
    nickname: item.nickname != null ? String(item.nickname) : '',
    avatar: item.avatar != null ? String(item.avatar) : '',
    gender: item.gender != null ? String(item.gender) : '',
    self: !!item.self
  };
  if (type) {
    out.type = type;
    if (item.action != null) out.action = String(item.action);
    if (item.timestamp != null) out.timestamp = Number(item.timestamp) || createdAt;
  }
  return out;
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
      rooms: (doc && doc.rooms) || {}
    });
    return true;
  } catch (e) {
    return false;
  }
}

function listMessages(roomKey) {
  var key = _trim(roomKey);
  if (!key) return [];
  var doc = _readDoc();
  var list = doc.rooms && doc.rooms[key];
  return Array.isArray(list) ? list.slice() : [];
}

/**
 * @returns {{ ok: boolean, message?: object, error?: string }}
 */
function appendMessage(roomKey, raw) {
  var key = _trim(roomKey);
  if (!key) return { ok: false, error: '讨论无法保存' };
  if (isDemoMessage(raw)) return { ok: false, error: '演示内容不能作为发言保存' };
  var createdAt = Number(raw && (raw.createdAt != null ? raw.createdAt : raw.timestamp));
  if (!Number.isFinite(createdAt) || createdAt <= 0) createdAt = Date.now();
  var type = raw && raw.type != null ? String(raw.type) : '';
  var text = raw && raw.text != null ? String(raw.text) : '';
  if (type !== 'system' && !String(text).trim()) {
    return { ok: false, error: '请输入内容' };
  }
  var msg = _normalizeStoredMessage(
    Object.assign({}, raw || {}, {
      id: _trim(raw && raw.id) || createMessageId(createdAt),
      createdAt: createdAt,
      text: text,
      demo: false
    })
  );
  if (!msg) return { ok: false, error: '发送失败，请重试' };

  var doc = _readDoc();
  if (!doc.rooms || typeof doc.rooms !== 'object') doc.rooms = {};
  var list = Array.isArray(doc.rooms[key]) ? doc.rooms[key].slice() : [];
  var exists = false;
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].id === msg.id) {
      exists = true;
      break;
    }
  }
  if (!exists) {
    list.push(msg);
    list.sort(_byTimeThenId);
    if (list.length > MAX_MESSAGES_PER_ROOM) {
      list = list.slice(list.length - MAX_MESSAGES_PER_ROOM);
    }
  }
  doc.rooms[key] = list;
  if (!_writeDoc(doc)) {
    return { ok: false, error: '发送失败，请重试' };
  }
  return { ok: true, message: msg };
}

function viewSource(roomKey, demoSeeds) {
  var stored = listMessages(roomKey);
  if (stored.length) return stored;
  return Array.isArray(demoSeeds) ? demoSeeds.slice() : [];
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  MAX_MESSAGES_PER_ROOM: MAX_MESSAGES_PER_ROOM,
  resolveRoomKey: resolveRoomKey,
  createMessageId: createMessageId,
  isDemoMessage: isDemoMessage,
  listMessages: listMessages,
  appendMessage: appendMessage,
  viewSource: viewSource,
  setStorageAdapter: setStorageAdapter,
  failNextWrite: failNextWrite
};
