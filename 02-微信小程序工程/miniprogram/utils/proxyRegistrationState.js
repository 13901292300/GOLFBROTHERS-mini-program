/**
 * 代报名三态判定（好友页 / 球队成员页共用）
 * - unregistered：可勾选加入 additions
 * - registered_by_me：source=proxy 且 registeredBy=当前操作者
 * - registered_locked：self / 他人 proxy / 缺 registeredBy 的历史 proxy
 */

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function resolveProxyRegistrationStateFromEntry(entry, operatorId) {
  if (!entry || typeof entry !== 'object') return 'unregistered';
  var status = asString(entry.registrationStatus);
  if (status && status !== 'registered') return 'unregistered';
  var source = asString(entry.source || entry.registrationSource) || 'self';
  var registeredBy = asString(entry.registeredBy || entry.registeredByUserId);
  if (source === 'proxy' && registeredBy && registeredBy === asString(operatorId)) {
    return 'registered_by_me';
  }
  return 'registered_locked';
}

function resolveProxyRegistrationState(friendId, registrationMap, operatorId) {
  var id = asString(friendId);
  var map = registrationMap && typeof registrationMap === 'object' ? registrationMap : {};
  return resolveProxyRegistrationStateFromEntry(id ? map[id] : null, operatorId);
}

function isProxyRemovableByActor(entry, actorId) {
  return resolveProxyRegistrationStateFromEntry(entry, actorId) === 'registered_by_me';
}

module.exports = {
  resolveProxyRegistrationState: resolveProxyRegistrationState,
  resolveProxyRegistrationStateFromEntry: resolveProxyRegistrationStateFromEntry,
  isProxyRemovableByActor: isProxyRemovableByActor
};
