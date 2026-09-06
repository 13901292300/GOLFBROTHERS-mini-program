'use strict';

/**
 * 微信分享邀请：预签发短期 token，有效期内复用。不在 onShareAppMessage 里现创。
 */

var service = require('./service.js');
var teamLogo = require('./teamLogo.js');
var routes = require('./routes.js');

var PENDING_KEY = 'gb_pending_team_invite_v1';
var _byTeam = {};

function maskToken(token) {
  var s = String(token || '');
  if (s.length < 10) return s ? 'inv_****' : '';
  return s.slice(0, 6) + '****' + s.slice(-4);
}

function logShare(stage, info) {
  var row = {
    stage: String(stage || ''),
    teamId: info && info.teamId ? String(info.teamId) : '',
    inviteId: info && info.inviteId ? String(info.inviteId) : '',
    token: maskToken(info && info.token),
    expiresAt: info && info.expiresAt ? Number(info.expiresAt) : 0
  };
  try {
    console.log('[teamClub:share]', row);
  } catch (e) {
    /* ignore */
  }
  return row;
}

function cacheKey(teamId) {
  return String(teamId || '').trim();
}

function readCache(teamId) {
  var row = _byTeam[cacheKey(teamId)];
  if (!row || !row.token) return null;
  if (Number(row.expiresAt) <= Date.now() + 60 * 1000) return null;
  return row;
}

function writeCache(teamId, invite) {
  var id = cacheKey(teamId);
  if (!id || !invite || !invite.token) return;
  _byTeam[id] = {
    token: String(invite.token),
    inviteId: String(invite.inviteId || ''),
    expiresAt: Number(invite.expiresAt) || 0,
    teamId: id
  };
}

function resetCache() {
  _byTeam = {};
}

function pendingStorage() {
  if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') return null;
  return wx;
}

function savePendingToken(token) {
  var t = String(token || '').trim();
  var api = pendingStorage();
  if (!t || !api) return;
  try {
    api.setStorageSync(PENDING_KEY, { token: t, at: Date.now() });
  } catch (e) {
    /* ignore */
  }
}

function readPendingToken() {
  var api = pendingStorage();
  if (!api) return '';
  try {
    var row = api.getStorageSync(PENDING_KEY);
    return row && row.token ? String(row.token).trim() : '';
  } catch (e) {
    return '';
  }
}

function clearPendingToken() {
  var api = pendingStorage();
  if (!api) return;
  try {
    api.removeStorageSync(PENDING_KEY);
  } catch (e) {
    /* ignore */
  }
}

function inviteLandingPath(token) {
  return routes.buildInviteSharePath(token);
}

function buildShareMessage(team, invite) {
  var row = team && typeof team === 'object' ? team : {};
  var name = String(row.fullName || row.name || '').trim();
  var token = invite && invite.token ? String(invite.token).trim() : '';
  var path = inviteLandingPath(token);
  var share = {
    ok: !!path,
    title: name ? '邀请你加入「' + name + '」' : '邀请你加入球队',
    path: path || routes.TEAM_INVITE_PAGE
  };
  var imageUrl = String(row.logoSrc || '').trim();
  if (imageUrl.indexOf('https://') === 0 && imageUrl !== teamLogo.PLACEHOLDER) {
    share.imageUrl = imageUrl;
  }
  return share;
}

function prepare(teamId) {
  var id = cacheKey(teamId);
  if (!id) {
    return Promise.resolve({ ok: false, code: 'invalid_args', message: '缺少球队' });
  }
  var hit = readCache(id);
  if (hit) {
    logShare('reuse', hit);
    return Promise.resolve({ ok: true, invite: hit, reused: true });
  }
  return service.prepareShareInvite(id).then(function (res) {
    if (!res || !res.ok || !res.invite || !res.invite.token) {
      return res && res.ok === false ? res : { ok: false, code: 'upload_failed', message: '邀请未准备好' };
    }
    writeCache(id, res.invite);
    logShare('create', res.invite);
    return { ok: true, invite: readCache(id) || res.invite, reused: false };
  });
}

function current(teamId) {
  return readCache(teamId);
}

module.exports = {
  PENDING_KEY: PENDING_KEY,
  maskToken: maskToken,
  logShare: logShare,
  prepare: prepare,
  current: current,
  resetCache: resetCache,
  buildShareMessage: buildShareMessage,
  inviteLandingPath: inviteLandingPath,
  savePendingToken: savePendingToken,
  readPendingToken: readPendingToken,
  clearPendingToken: clearPendingToken
};
