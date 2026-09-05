'use strict';

/**
 * 球队比赛索引补偿队列。索引写入失败时不得把创建伪装成全部成功。
 */

var OUTBOX_KEY = 'gb_team_match_ref_outbox_v1';

function _wx() {
  return typeof wx !== 'undefined' && wx
    ? wx
    : { getStorageSync: function () { return []; }, setStorageSync: function () {} };
}

function readOutbox() {
  var raw;
  try {
    raw = _wx().getStorageSync(OUTBOX_KEY);
  } catch (e) {
    raw = [];
  }
  return Array.isArray(raw) ? raw : [];
}

function writeOutbox(list) {
  try {
    _wx().setStorageSync(OUTBOX_KEY, list || []);
  } catch (e) {
    /* ignore */
  }
}

function enqueue(payload) {
  var list = readOutbox();
  var matchId = String((payload && payload.matchId) || '');
  var teamId = String((payload && payload.teamId) || '');
  list = list.filter(function (row) {
    return !(row && row.matchId === matchId && row.teamId === teamId);
  });
  list.push(Object.assign({}, payload, { queuedAt: Date.now(), retries: 0 }));
  writeOutbox(list);
}

function flush() {
  var service = require('./service.js');
  var list = readOutbox();
  if (!list.length) return Promise.resolve({ ok: true, flushed: 0, remain: 0 });
  var remain = [];
  var chain = Promise.resolve();
  var flushed = 0;
  list.forEach(function (row) {
    chain = chain.then(function () {
      return service.publishTeamMatchRef(row, { status: row.status }).then(function (res) {
        if (res && res.ok) {
          flushed += 1;
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
  OUTBOX_KEY: OUTBOX_KEY,
  enqueue: enqueue,
  flush: flush,
  readOutbox: readOutbox
};
