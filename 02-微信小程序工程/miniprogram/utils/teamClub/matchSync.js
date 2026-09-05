'use strict';

/**
 * 比赛正文补偿队列。成功语义以云端 putMatch 为准，页面不得因本地缓存误报成功。
 */

var PREFIX = 'gb_team_match_body_outbox_v1__';
var LEGACY_KEY = 'gb_team_match_body_outbox_v1';

function _wx() {
  return typeof wx !== 'undefined' && wx
    ? wx
    : { getStorageSync: function () { return []; }, setStorageSync: function () {}, removeStorageSync: function () {} };
}

function trustedUid() {
  try {
    return String(require('./identity.js').currentUserIdOrEmpty() || '').trim();
  } catch (e) {
    return '';
  }
}

function outboxKey(userId) {
  return PREFIX + String(userId);
}

function readOutbox() {
  var uid = trustedUid();
  if (!uid) return [];
  var raw;
  try {
    raw = _wx().getStorageSync(outboxKey(uid));
  } catch (e) {
    raw = [];
  }
  if (!Array.isArray(raw) || !raw.length) {
    try {
      var legacy = _wx().getStorageSync(LEGACY_KEY);
      if (Array.isArray(legacy) && legacy.length) {
        var owned = legacy.filter(function (row) {
          return row && row.ownerUserId === uid;
        });
        if (owned.length) raw = owned;
      }
    } catch (e2) {
      /* ignore */
    }
  }
  return Array.isArray(raw) ? raw.filter(function (row) {
    return row && (!row.ownerUserId || row.ownerUserId === uid);
  }) : [];
}

function writeOutbox(list) {
  var uid = trustedUid();
  if (!uid) return;
  try {
    _wx().setStorageSync(outboxKey(uid), list || []);
  } catch (e) {
    /* ignore */
  }
}

function clearUser(userId) {
  var current = trustedUid();
  if (!current) return;
  var uid = String(userId || current).trim();
  if (!uid || uid !== current) return;
  try {
    _wx().removeStorageSync(PREFIX + uid);
  } catch (e) {
    /* ignore */
  }
}

function enqueue(payload) {
  var uid = trustedUid();
  if (!uid) return;
  var list = readOutbox();
  var matchId = String((payload && payload.matchId) || '');
  var operationId = String((payload && payload.operationId) || matchId);
  list = list.filter(function (row) {
    return !(row && String(row.operationId || row.matchId) === operationId);
  });
  list.push(
    Object.assign({}, payload, {
      matchId: matchId,
      operationId: operationId,
      ownerUserId: uid,
      queuedAt: Date.now(),
      retries: Number((payload && payload.retries) || 0)
    })
  );
  writeOutbox(list);
}

function remove(operationId) {
  var id = String(operationId || '');
  var uid = trustedUid();
  if (!uid) return;
  writeOutbox(
    readOutbox().filter(function (row) {
      return String((row && (row.operationId || row.matchId)) || '') !== id;
    })
  );
}

function flush() {
  var service = require('./service.js');
  var uid = trustedUid();
  if (!uid) return Promise.resolve({ ok: true, flushed: 0, remain: 0, skipped: 'no_identity' });
  var list = readOutbox();
  if (!list.length) return Promise.resolve({ ok: true, flushed: 0, remain: 0 });
  var remain = [];
  var chain = Promise.resolve();
  var flushed = 0;
  list.forEach(function (row) {
    chain = chain.then(function () {
      return service.putMatch(row.match, {
        operationId: row.operationId,
        expectedVersion: row.expectedVersion,
        writeKind: row.writeKind
      }).then(function (res) {
        if (res && res.ok) flushed += 1;
        else if (res && res.code === 'conflict') {
          row.conflict = true;
        } else {
          row.retries = Number(row.retries || 0) + 1;
          remain.push(row);
        }
      });
    });
  });
  return chain.then(function () {
    writeOutbox(remain);
    return { ok: remain.length === 0, flushed: flushed, remain: remain.length };
  });
}

module.exports = {
  enqueue: enqueue,
  remove: remove,
  flush: flush,
  readOutbox: readOutbox,
  clearUser: clearUser
};
