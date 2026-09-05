'use strict';

var crypto = require('crypto');

function sha256(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function hashOpenid(openid) {
  return sha256('teamclub:openid:' + String(openid || ''));
}

function hashToken(token) {
  return sha256('teamclub:invite:' + String(token || ''));
}

function userIdFromOpenid(openid) {
  return 'u_' + sha256('teamclub:uid:' + String(openid || '')).slice(0, 20);
}

function randomInviteToken() {
  return 'inv_' + crypto.randomBytes(24).toString('hex');
}

function newId(prefix) {
  return String(prefix || 'id') + '_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function migrationKeyFor(teamId, actorUserId) {
  return sha256('migrate:' + String(actorUserId || '') + ':' + String(teamId || ''));
}

module.exports = {
  sha256: sha256,
  hashOpenid: hashOpenid,
  hashToken: hashToken,
  userIdFromOpenid: userIdFromOpenid,
  randomInviteToken: randomInviteToken,
  newId: newId,
  migrationKeyFor: migrationKeyFor
};
