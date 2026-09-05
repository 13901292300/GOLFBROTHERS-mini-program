'use strict';

/**
 * 逐洞成绩补偿队列。按云端映射后的可信 userId 分桶。
 * logout 不删除持久化 outbox；无身份时不读取任何分桶。
 */

var PREFIX = 'gb_team_score_outbox_v1__';
var CONFLICT_PREFIX = 'gb_team_score_conflicts_v1__';
var HELD_PREFIX = 'gb_team_score_held_v1__';

var CONFLICT_PAGE_MESSAGE =
  '该洞成绩已被其他成员更新。\n当前显示已刷新为云端最新值。\n你本次未同步的修改没有覆盖云端。';

function _wx() {
  return typeof wx !== 'undefined' && wx
    ? wx
    : {
        getStorageSync: function () {
          return [];
        },
        setStorageSync: function () {},
        removeStorageSync: function () {}
      };
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

function conflictKey(userId) {
  return CONFLICT_PREFIX + String(userId);
}

function heldKey(userId) {
  return HELD_PREFIX + String(userId);
}

function readList(key) {
  var raw;
  try {
    raw = _wx().getStorageSync(key);
  } catch (e) {
    raw = [];
  }
  return Array.isArray(raw) ? raw : [];
}

function writeList(key, list) {
  try {
    _wx().setStorageSync(key, list || []);
  } catch (e) {
    /* ignore */
  }
}

function readOutbox() {
  var uid = trustedUid();
  if (!uid) return [];
  return readList(outboxKey(uid)).filter(function (row) {
    return row && (!row.ownerUserId || row.ownerUserId === uid);
  });
}

function writeOutbox(list) {
  var uid = trustedUid();
  if (!uid) return;
  writeList(outboxKey(uid), list || []);
}

function readConflicts() {
  var uid = trustedUid();
  if (!uid) return [];
  return readList(conflictKey(uid));
}

function writeConflicts(list) {
  var uid = trustedUid();
  if (!uid) return;
  writeList(conflictKey(uid), list || []);
}

function readHeld() {
  var uid = trustedUid();
  if (!uid) return [];
  return readList(heldKey(uid));
}

function writeHeld(list) {
  var uid = trustedUid();
  if (!uid) return;
  writeList(heldKey(uid), list || []);
}

function countPending() {
  return readOutbox().length;
}

function hasPending(matchId) {
  var id = String(matchId || '');
  if (!id) return countPending() > 0;
  return readOutbox().some(function (row) {
    return row && String(row.matchId) === id;
  });
}

function clearUser(userId) {
  var current = trustedUid();
  if (!current) return;
  var uid = String(userId || current).trim();
  if (!uid || uid !== current) return;
  try {
    _wx().removeStorageSync(PREFIX + uid);
    _wx().removeStorageSync(CONFLICT_PREFIX + uid);
    _wx().removeStorageSync(HELD_PREFIX + uid);
  } catch (e) {
    /* ignore */
  }
}

function scoreOpId(row) {
  return [
    String(row.matchId || ''),
    String(row.roundId || 'r1'),
    String(row.hole || ''),
    String(row.entityKind || 'player'),
    String(row.entityId || ''),
    row.putts != null && row.strokes == null ? 'putt' : 'score'
  ].join(':');
}

function enqueue(payload) {
  var uid = trustedUid();
  if (!uid || !payload) return 0;
  var list = readOutbox();
  var operationId = String((payload && payload.operationId) || scoreOpId(payload));
  list = list.filter(function (row) {
    return !(row && String(row.operationId) === operationId);
  });
  list.push(
    Object.assign({}, payload, {
      operationId: operationId,
      ownerUserId: uid,
      queuedAt: Date.now(),
      retries: Number((payload && payload.retries) || 0)
    })
  );
  writeOutbox(list);
  return 1;
}

function matchClosed(match) {
  if (!match) return false;
  var st = String(match.status || match.cloudStatus || '').toLowerCase();
  return st === 'finished' || st === 'cancelled' || st === 'canceled' || st === 'completed' || st === 'ended';
}

function holdRow(row, reason, extra) {
  var held = readHeld();
  held.push(
    Object.assign({}, extra || {}, {
      reason: reason,
      matchId: row && row.matchId,
      hole: row && row.hole,
      entityId: row && row.entityId,
      entityKind: row && row.entityKind,
      localAttempt: {
        strokes: row && row.strokes,
        putts: row && row.putts
      },
      queuedAt: row && row.queuedAt,
      heldAt: Date.now(),
      autoReplay: false
    })
  );
  writeHeld(held);
}

function recordConflict(row, res) {
  var cloud = (res && (res.current || (res.data && res.data.current))) || null;
  var list = readConflicts();
  list.push({
    matchId: row.matchId,
    hole: row.hole,
    entityKind: row.entityKind,
    entityId: row.entityId,
    localAttempt: { strokes: row.strokes, putts: row.putts },
    cloud: cloud
      ? { strokes: cloud.strokes, putts: cloud.putts, version: cloud.version }
      : null,
    message: CONFLICT_PAGE_MESSAGE,
    at: Date.now(),
    autoReplay: false
  });
  writeConflicts(list);
}

function takeConflicts(matchId) {
  var uid = trustedUid();
  if (!uid) return [];
  var id = String(matchId || '');
  var all = readConflicts();
  var taken = [];
  var rest = [];
  all.forEach(function (row) {
    if (row && (!id || String(row.matchId) === id)) taken.push(row);
    else rest.push(row);
  });
  writeConflicts(rest);
  return taken;
}

function notifyConflictsOnPage(matchId) {
  var items = takeConflicts(matchId);
  if (!items.length) return items;
  var holes = [];
  items.forEach(function (row) {
    var h = Number(row.hole);
    if (h && holes.indexOf(h) < 0) holes.push(h);
  });
  var holeText = holes.length ? '第' + holes.join('、') + '洞。' : '';
  var content = CONFLICT_PAGE_MESSAGE + (holeText ? '\n' + holeText : '');
  try {
    if (typeof wx !== 'undefined' && wx && typeof wx.showModal === 'function') {
      wx.showModal({
        title: '成绩已更新',
        content: content,
        showCancel: false
      });
    }
  } catch (e) {
    /* ignore */
  }
  return items;
}

function defaultHandlers() {
  var service = require('./service.js');
  return {
    getMatch: function (matchId) {
      return service.getMatch(matchId);
    },
    submit: function (row) {
      var fn =
        row.mode === 'putt'
          ? service.updatePutt
          : row.mode === 'correct'
            ? service.correctScore
            : service.submitHoleScore;
      return fn(row);
    }
  };
}

function flush(handlers) {
  var uid = trustedUid();
  if (!uid) {
    return Promise.resolve({ ok: true, flushed: 0, remain: 0, skipped: 'no_identity' });
  }
  var h = handlers || defaultHandlers();
  var list = readOutbox();
  if (!list.length) {
    return Promise.resolve({ ok: true, flushed: 0, remain: 0 });
  }
  var remain = [];
  var flushed = 0;
  var held = 0;
  var conflicts = 0;
  var chain = Promise.resolve();
  list.forEach(function (row) {
    chain = chain.then(function () {
      if (!row || row.ownerUserId && row.ownerUserId !== uid) return null;
      return Promise.resolve(h.getMatch ? h.getMatch(row.matchId) : { ok: true, match: { status: 'live' } }).then(
        function (got) {
          var match = (got && (got.match || got.data)) || null;
          if (got && got.ok && matchClosed(match)) {
            holdRow(row, 'match_closed');
            held += 1;
            return null;
          }
          if (got && !got.ok && (got.code === 'forbidden' || got.code === 'need_login')) {
            holdRow(row, 'permission_lost');
            held += 1;
            return null;
          }
          return Promise.resolve(h.submit(row)).then(function (res) {
            if (res && res.ok) {
              flushed += 1;
              return null;
            }
            if (res && res.code === 'conflict') {
              conflicts += 1;
              recordConflict(row, res);
              if (row.matchId && h.getMatch) {
                return Promise.resolve(h.getMatch(row.matchId)).then(function () {
                  notifyConflictsOnPage(row.matchId);
                  return res;
                });
              }
              notifyConflictsOnPage(row.matchId);
              return res;
            }
            if (res && (res.code === 'forbidden' || res.code === 'permission_lost')) {
              holdRow(row, 'permission_lost');
              held += 1;
              return null;
            }
            if (res && res.code === 'match_closed') {
              holdRow(row, 'match_closed');
              held += 1;
              return null;
            }
            row.retries = Number(row.retries || 0) + 1;
            remain.push(row);
            return res;
          });
        }
      );
    });
  });
  return chain.then(function () {
    writeOutbox(remain);
    return {
      ok: remain.length === 0,
      flushed: flushed,
      remain: remain.length,
      held: held,
      conflicts: conflicts
    };
  });
}

function flatten(match) {
  var out = [];
  if (!match || !match.scoreData || typeof match.scoreData !== 'object') return out;
  var scoreData = match.scoreData;
  Object.keys(scoreData).forEach(function (groupId) {
    var bucket = scoreData[groupId] || {};
    var sbp = bucket.scoresByPlayer || {};
    Object.keys(sbp).forEach(function (pid) {
      var rec = sbp[pid] || {};
      var scores = rec.scores || [];
      for (var i = 0; i < scores.length; i++) {
        if (scores[i] === '' || scores[i] == null) continue;
        out.push({
          matchId: match.matchId,
          teamId: match.teamId,
          groupId: groupId,
          hole: i + 1,
          entityKind: 'player',
          entityId: pid,
          strokes: Number(scores[i]),
          putts: rec.putts && rec.putts[i] != null ? Number(rec.putts[i]) : null,
          roundId: 'r1'
        });
      }
    });
    (bucket.teamScoresByEntity || []).forEach(function (rec) {
      if (!rec) return;
      var eid = String(rec.entityId || rec.teamId || '');
      var scores = rec.scores || [];
      for (var j = 0; j < scores.length; j++) {
        if (scores[j] === '' || scores[j] == null) continue;
        out.push({
          matchId: match.matchId,
          teamId: match.teamId,
          groupId: groupId,
          hole: j + 1,
          entityKind: 'entity',
          entityId: eid,
          strokes: Number(scores[j]),
          putts: rec.putts && rec.putts[j] != null ? Number(rec.putts[j]) : null,
          roundId: 'r1'
        });
      }
    });
  });
  return out;
}

function enqueueFromMatchDiff(prevMatch, nextMatch) {
  if (!trustedUid()) return 0;
  var prevMap = {};
  flatten(prevMatch).forEach(function (row) {
    prevMap[scoreOpId(row)] = row;
  });
  var patches = [];
  flatten(nextMatch).forEach(function (row) {
    var old = prevMap[scoreOpId(row)];
    if (!old || Number(old.strokes) !== Number(row.strokes) || Number(old.putts) !== Number(row.putts)) {
      patches.push(row);
    }
  });
  var vers = (nextMatch && nextMatch.scoreVersions) || (prevMatch && prevMatch.scoreVersions) || {};
  patches.forEach(function (row) {
    var sid = [
      String(row.matchId || ''),
      String(row.roundId || 'r1'),
      String(row.hole || 0),
      String(row.entityKind || 'player'),
      String(row.entityId || '')
    ].join('__');
    var patch = Object.assign({ mode: 'score', operationId: scoreOpId(row) }, row);
    if (vers[sid] != null) patch.expectedVersion = Number(vers[sid]);
    else if (!prevMap[scoreOpId(row)]) patch.expectedVersion = 0;
    enqueue(patch);
  });
  if (patches.length) flush();
  return patches.length;
}

module.exports = {
  PREFIX: PREFIX,
  CONFLICT_PREFIX: CONFLICT_PREFIX,
  HELD_PREFIX: HELD_PREFIX,
  CONFLICT_PAGE_MESSAGE: CONFLICT_PAGE_MESSAGE,
  enqueue: enqueue,
  flush: flush,
  readOutbox: readOutbox,
  hasPending: hasPending,
  countPending: countPending,
  clearUser: clearUser,
  enqueueFromMatchDiff: enqueueFromMatchDiff,
  scoreOpId: scoreOpId,
  readConflicts: readConflicts,
  readHeld: readHeld,
  takeConflicts: takeConflicts,
  notifyConflictsOnPage: notifyConflictsOnPage
};
