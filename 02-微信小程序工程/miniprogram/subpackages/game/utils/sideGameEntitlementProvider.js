/**
 * SideGame 写权限。不复用赛事管理 / 记分 / 分组权限。
 * LocalPreviewEntitlementProvider：本机 UI 验收临时放行，不是正式付费资格。
 */
var rec = require('./sideGameRecord.js');
var identity = require('./sideGameIdentityProvider.js');

var IMPLEMENTATION = 'local-preview';
var boundHost = null;

function bindHostContext(host) {
  boundHost = host && typeof host === 'object' ? host : null;
}

function hostReadonly(context) {
  var h = (context && context.hostContext) || boundHost;
  return !!(h && h.canEditSideGames === false);
}

function isParticipant(record, userId) {
  var uid = rec.asString(userId);
  var parties = (record && record.participantParties) || [];
  var i;
  var j;
  for (i = 0; i < parties.length; i++) {
    var members = (parties[i] && parties[i].memberPlayerIds) || [];
    for (j = 0; j < members.length; j++) {
      if (rec.asString(members[j]) === uid) return true;
    }
  }
  return false;
}

function previewAllow(context, action) {
  var ctx = context || {};
  var userId = rec.asString(ctx.userId) || identity.getCurrentUserId();
  var record = ctx.record || null;
  var participant = record ? isParticipant(record, userId) : false;
  if (action !== 'view' && hostReadonly(ctx)) {
    return {
      ok: false,
      reason: 'no_entitlement',
      action: action,
      userId: userId,
      participant: participant,
      relaxed: false,
      implementation: IMPLEMENTATION
    };
  }
  return {
    ok: true,
    reason: '',
    action: action,
    userId: userId,
    participant: participant,
    relaxed: !participant && !!record,
    implementation: IMPLEMENTATION
  };
}

var impl = {
  implementation: IMPLEMENTATION,
  canCreate: function (context) {
    return previewAllow(context, 'create');
  },
  canUpdate: function (context) {
    return previewAllow(context, 'update');
  },
  canRemove: function (context) {
    return previewAllow(context, 'remove');
  }
};

function setImplementation(next) {
  if (
    !next ||
    typeof next.canCreate !== 'function' ||
    typeof next.canUpdate !== 'function' ||
    typeof next.canRemove !== 'function'
  ) {
    throw new Error('invalid_entitlement_provider');
  }
  impl = next;
}

function getImplementation() {
  return impl;
}

function denyWrite(action) {
  return { ok: false, reason: 'no_entitlement', action: action, implementation: IMPLEMENTATION };
}

function canCreate(context) {
  if (hostReadonly(context)) return denyWrite('create');
  return impl.canCreate(context || {});
}

function canUpdate(context) {
  if (hostReadonly(context)) return denyWrite('update');
  return impl.canUpdate(context || {});
}

function canRemove(context) {
  if (hostReadonly(context)) return denyWrite('remove');
  return impl.canRemove(context || {});
}

function canView(context) {
  if (typeof impl.canView === 'function') return impl.canView(context || {});
  return { ok: true, reason: '', action: 'view', implementation: IMPLEMENTATION };
}

function canEdit(context) {
  if (hostReadonly(context)) {
    return { ok: false, reason: 'readonly', action: 'edit', implementation: IMPLEMENTATION };
  }
  if (typeof impl.canEdit === 'function') return impl.canEdit(context || {});
  return impl.canUpdate(context || {});
}

module.exports = {
  IMPLEMENTATION: IMPLEMENTATION,
  canCreate: canCreate,
  canUpdate: canUpdate,
  canRemove: canRemove,
  canView: canView,
  canEdit: canEdit,
  bindHostContext: bindHostContext,
  setImplementation: setImplementation,
  getImplementation: getImplementation,
  isParticipant: isParticipant
};
