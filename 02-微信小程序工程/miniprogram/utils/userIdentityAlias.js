/**
 * User identity alias mapping.
 *
 * Provides a lightweight read layer for identity upgrades such as
 * phone user -> registered user. It does not migrate matches, contacts,
 * scoreData, Slots, or user profiles.
 */
const STORAGE_KEY = 'gb_user_identity_alias_v1';

function normalizeUserId(userId) {
  return String(userId || '').trim();
}

function normalizeType(type) {
  const value = String(type || '').trim();
  return value || 'phone_to_registered';
}

function now() {
  return Date.now();
}

function buildAliasId(fromUserId) {
  const from = normalizeUserId(fromUserId);
  return from ? 'alias_' + from : '';
}

function readAll() {
  try {
    const list = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function writeAll(list) {
  try {
    wx.setStorageSync(STORAGE_KEY, Array.isArray(list) ? list : []);
  } catch (e) {
    /* ignore */
  }
}

function normalizeAlias(raw, existing) {
  const source = raw || {};
  const prev = existing || {};
  const fromUserId = normalizeUserId(source.fromUserId || prev.fromUserId);
  const toUserId = normalizeUserId(source.toUserId || prev.toUserId);
  if (!fromUserId || !toUserId) return null;
  const createdAt = prev.createdAt || source.createdAt || now();
  return {
    aliasId: prev.aliasId || source.aliasId || buildAliasId(fromUserId),
    fromUserId: fromUserId,
    toUserId: toUserId,
    type: normalizeType(source.type || prev.type),
    createdAt: createdAt,
    updatedAt: now()
  };
}

function addAlias(params) {
  const input = params || {};
  const fromUserId = normalizeUserId(input.fromUserId);
  if (!fromUserId) return null;
  const list = readAll();
  const existing = list.find((alias) => alias && alias.fromUserId === fromUserId);
  if (existing) return existing;
  const alias = normalizeAlias(input);
  if (!alias) return null;
  list.push(alias);
  writeAll(list);
  return alias;
}

function getAliases(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return [];
  return readAll().filter((alias) =>
    alias && (alias.fromUserId === uid || alias.toUserId === uid)
  );
}

function hasAlias(userId) {
  return getAliases(userId).length > 0;
}

function resolveCanonicalUserId(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return '';
  const alias = readAll().find((item) => item && item.fromUserId === uid);
  return alias && alias.toUserId ? alias.toUserId : uid;
}

module.exports = {
  STORAGE_KEY,
  addAlias,
  resolveCanonicalUserId,
  hasAlias,
  getAliases
};
