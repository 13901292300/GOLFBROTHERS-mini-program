'use strict';

/**
 * 登录后迁移本人有权迁移的本地球队比赛。不上传 mock/demo。失败保留本地原数据。
 */

var STORAGE_KEY = 'gb_team_matches_v1';

function isDemoMatch(match) {
  var id = String((match && match.matchId) || '');
  var teamId = String((match && match.teamId) || '');
  if (!id) return true;
  if (id.indexOf('demo') >= 0 || id.indexOf('jiaobei') >= 0 || id === '1') return true;
  if (/^(1|2|3|4|5)$/.test(teamId)) return true;
  return false;
}

function canClaim(match, userId) {
  var uid = String(userId || '');
  if (!uid || !match) return false;
  var created = String(match.createdBy || match.creatorId || match.ownerUserId || '');
  if (!created || created === 'me' || created === 'mock') return false;
  return created === uid;
}

function readLegacyList() {
  var raw;
  try {
    raw = wx.getStorageSync(STORAGE_KEY);
  } catch (e) {
    raw = [];
  }
  return Array.isArray(raw) ? raw : [];
}

function runForUser(userId) {
  var factory = require('./repoFactory.js');
  if (factory.getMode() !== 'cloud') return Promise.resolve({ ok: true, migrated: 0, skipped: 0 });
  var service = require('./service.js');
  var uid = String(userId || '');
  var list = [];
  try {
    list = list.concat(require('../teamMatchStore.js').listMatches() || []);
  } catch (e) {
    /* ignore */
  }
  readLegacyList().forEach(function (row) {
    if (!row || !row.matchId) return;
    var seen = list.some(function (m) {
      return m && m.matchId === row.matchId;
    });
    if (!seen) list.push(row);
  });
  var migrated = 0;
  var skipped = 0;
  var chain = Promise.resolve();
  list.forEach(function (match) {
    chain = chain.then(function () {
      if (isDemoMatch(match) || !canClaim(match, uid) || !match.teamId) {
        skipped += 1;
        return;
      }
      var key = 'match:' + match.matchId + ':' + uid;
      return service
        .confirmMatchMigration({
          matchId: match.matchId,
          teamId: match.teamId,
          matchSnapshot: match,
          migrationKey: key
        })
        .then(function (res) {
          if (res && res.ok) migrated += 1;
        });
    });
  });
  return chain.then(function () {
    return { ok: true, migrated: migrated, skipped: skipped };
  });
}

module.exports = {
  runForUser: runForUser,
  isDemoMatch: isDemoMatch,
  canClaim: canClaim
};
