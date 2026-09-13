/**
 * 讨论区头像：谁可以 @。
 * 本人、演示用户不触发 @；需要稳定 userId，不只凭昵称。
 */

var userIdentityAlias = require('./userIdentityAlias.js');

function _trim(v) {
  return v == null ? '' : String(v).trim();
}

function _truthy(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
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

function isDemoIdentity(fields) {
  var f = fields || {};
  if (_truthy(f.demo) || _truthy(f.isDemo) || _truthy(f.seed)) return true;
  var src = _trim(f.identitySource || f.identitysource).toLowerCase();
  if (src === 'demo' || src === 'seed' || src === 'preset') return true;
  var uid = canonicalUserId(f.userId || f.userid || f.playerUserId);
  if (/^demo[-_]/i.test(uid) || /^chat-demo/i.test(uid)) return true;
  return false;
}

function isSelfIdentity(fields, currentUserId) {
  var f = fields || {};
  if (_truthy(f.self)) return true;
  var uid = canonicalUserId(f.userId || f.userid || f.playerUserId);
  var me = canonicalUserId(currentUserId);
  if (!uid) return false;
  if (!me) me = 'me';
  if (uid === me) return true;
  if (uid === 'me' && me === 'me') return true;
  return false;
}

/**
 * @returns {{ ok: boolean, reason?: string }}
 * reason: self | demo | no_user_id
 */
function canMentionUser(fields, currentUserId) {
  if (isDemoIdentity(fields)) return { ok: false, reason: 'demo' };
  if (isSelfIdentity(fields, currentUserId)) return { ok: false, reason: 'self' };
  var uid = _trim(fields && (fields.userId || fields.userid || fields.playerUserId));
  if (!uid) return { ok: false, reason: 'no_user_id' };
  return { ok: true };
}

function fieldsFromDataset(ds) {
  var d = ds || {};
  return {
    userId: d.userid != null ? d.userid : d.userId,
    userid: d.userid,
    playerUserId: d.playeruserid,
    name: d.name,
    avatar: d.avatar,
    self: d.self,
    demo: d.demo,
    identitySource: d.identitysource
  };
}

module.exports = {
  canonicalUserId: canonicalUserId,
  isDemoIdentity: isDemoIdentity,
  isSelfIdentity: isSelfIdentity,
  canMentionUser: canMentionUser,
  fieldsFromDataset: fieldsFromDataset
};
