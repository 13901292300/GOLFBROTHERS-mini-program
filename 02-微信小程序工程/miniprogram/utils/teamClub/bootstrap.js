'use strict';

/**
 * 分享冷启动 / 页面入口：先云身份，再恢复 teamId 与 invite token 上下文。
 * gb_auth_session_v1 只缓存展示身份，不是鉴权依据。
 */

var factory = require('./repoFactory.js');
var identity = require('./identity.js');

function ensureCloudIdentity() {
  if (factory.getMode() === 'local') {
    var local = identity.requireUser();
    return Promise.resolve(local.ok ? { ok: true, user: local.user, source: 'local' } : local);
  }
  var repo = factory.get();
  if (typeof repo.resolveIdentity !== 'function') {
    return Promise.resolve({ ok: false, code: 'service_unavailable', message: '云服务不可用' });
  }
  return Promise.resolve(repo.resolveIdentity()).then(function (res) {
    if (res && res.ok && res.data && res.data.user) {
      identity.writeSession(res.data.user);
      try {
        require('./matchMigrate.js').runForUser(res.data.user.userId);
      } catch (eMig) {
        /* 迁移失败保留本地 */
      }
      return { ok: true, user: res.data.user, source: 'cloud' };
    }
    return res || { ok: false, code: 'need_login', message: '未登录' };
  });
}

function restoreShareContext(query) {
  var q = query || {};
  return ensureCloudIdentity().then(function (ident) {
    var ctx = {
      identity: ident,
      teamId: String(q.teamId || '').trim(),
      inviteToken: String(q.inviteToken || q.token || '').trim()
    };
    if (!ident || !ident.ok) return ctx;
    if (!ctx.inviteToken || typeof factory.get().resolveInvite !== 'function') return ctx;
    return Promise.resolve(factory.get().resolveInvite(ctx.inviteToken)).then(function (inviteRes) {
      ctx.invite = inviteRes;
      return ctx;
    });
  });
}

module.exports = {
  ensureCloudIdentity: ensureCloudIdentity,
  restoreShareContext: restoreShareContext
};
