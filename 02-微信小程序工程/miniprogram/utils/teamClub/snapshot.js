'use strict';

/**
 * 短暂展示缓存。不是写依据，云失败时不得冒充最新数据。
 * 键包含当前 userId 与 teamId。
 */

var identity = require('./identity.js');

var STALE_MS = 15000;
var _byUser = {};

function userKey() {
  return identity.currentUserIdOrEmpty() || '_anon';
}

function bucket() {
  var uid = userKey();
  if (!_byUser[uid]) {
    _byUser[uid] = { teams: {}, members: {}, asOf: {}, stale: {} };
  }
  return _byUser[uid];
}

function reset() {
  _byUser = {};
}

function clearUser(userId) {
  var uid = String(userId || userKey());
  delete _byUser[uid];
}

function markStale(teamId) {
  var b = bucket();
  if (teamId) b.stale[String(teamId)] = true;
  else {
    Object.keys(b.teams).forEach(function (id) {
      b.stale[id] = true;
    });
  }
}

function isStale(teamId) {
  var b = bucket();
  var id = String(teamId || '');
  if (b.stale[id]) return true;
  var at = Number(b.asOf[id] || 0);
  if (!at) return true;
  return Date.now() - at > STALE_MS;
}

function putTeam(team) {
  if (!team || !(team.teamId || team.id)) return;
  var id = String(team.teamId || team.id);
  var b = bucket();
  var prev = b.teams[id];
  var next = Object.assign({}, team);
  var nextLogo = String(next.logo || '').trim();
  var prevLogo = prev ? String(prev.logo || '').trim() : '';
  if (prevLogo.indexOf('cloud://') === 0 && nextLogo.indexOf('cloud://') !== 0) {
    next.logo = prevLogo;
  }
  b.teams[id] = next;
  b.asOf[id] = Date.now();
  b.stale[id] = false;
}

function putMembers(teamId, list) {
  var b = bucket();
  b.members[String(teamId)] = Array.isArray(list) ? list.slice() : [];
}

function peekTeam(teamId) {
  var id = String(teamId || '').trim();
  var b = bucket();
  var team = b.teams[id];
  if (!team) return null;
  return Object.assign({}, team, {
    _stale: isStale(id),
    _asOf: b.asOf[id] || 0,
    _cacheUserId: userKey()
  });
}

function peekMembers(teamId) {
  return (bucket().members[String(teamId)] || []).slice();
}

function listTeams() {
  var b = bucket();
  return Object.keys(b.teams).map(function (k) {
    return peekTeam(k);
  });
}

function applyResult(action, result) {
  if (!result || !result.ok) {
    markStale();
    return;
  }
  var data = result.data;
  if (action === 'listMyTeams' && Array.isArray(data)) {
    data.forEach(putTeam);
  }
  if (action === 'getTeam' && data) putTeam(data);
  if (action === 'createTeam' && data) putTeam(data);
  if (action === 'updateTeam' && data) putTeam(data);
  if (action === 'listMembers' && result._teamId) putMembers(result._teamId, data);
}

module.exports = {
  reset: reset,
  clearUser: clearUser,
  markStale: markStale,
  isStale: isStale,
  putTeam: putTeam,
  putMembers: putMembers,
  peekTeam: peekTeam,
  peekMembers: peekMembers,
  listTeams: listTeams,
  applyResult: applyResult,
  STALE_MS: STALE_MS
};
