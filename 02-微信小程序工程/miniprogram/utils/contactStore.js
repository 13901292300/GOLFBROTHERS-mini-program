/**
 * Contact relationship store.
 *
 * Owns "who has whom as a contact" only. It does not resolve identities,
 * create users, register matches, mutate profiles, or read demo directories.
 */
const CONTACT_STORAGE_KEY = 'gb_contacts_v1';
const userIdentityAlias = require('./userIdentityAlias.js');

function normalizeId(value) {
  return String(value || '').trim();
}

function resolveCanonicalId(userId) {
  const id = normalizeId(userId);
  if (!id) return '';
  try {
    return normalizeId(userIdentityAlias.resolveCanonicalUserId(id)) || id;
  } catch (e) {
    return id;
  }
}

function isSameIdentity(leftUserId, rightUserId) {
  const left = normalizeId(leftUserId);
  const right = normalizeId(rightUserId);
  if (!left || !right) return false;
  if (left === right) return true;
  return resolveCanonicalId(left) === resolveCanonicalId(right);
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').trim();
}

function now() {
  return Date.now();
}

function buildContactId(ownerUserId, targetUserId) {
  const owner = normalizeId(ownerUserId);
  const target = normalizeId(targetUserId);
  return owner && target ? owner + '__' + target : '';
}

function readAll() {
  try {
    const list = wx.getStorageSync(CONTACT_STORAGE_KEY);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function writeAll(list) {
  try {
    wx.setStorageSync(CONTACT_STORAGE_KEY, Array.isArray(list) ? list : []);
  } catch (e) {
    /* ignore */
  }
}

function normalizeSource(source) {
  const value = String(source || '').trim();
  if (value === 'scan_add' || value === 'match_add') return value;
  return 'manual_add';
}

function normalizeContact(raw, existing) {
  const input = raw || {};
  const prev = existing || {};
  const ownerUserId = normalizeId(input.ownerUserId || prev.ownerUserId);
  const targetUserId = normalizeId(input.targetUserId || prev.targetUserId);
  const contactId = buildContactId(ownerUserId, targetUserId);
  if (!contactId) return null;
  const createdAt = prev.createdAt || input.createdAt || now();
  return {
    contactId: contactId,
    ownerUserId: ownerUserId,
    targetUserId: targetUserId,
    phone: normalizePhone(input.phone || prev.phone),
    remarkName: input.remarkName != null ? String(input.remarkName) : (prev.remarkName || ''),
    source: normalizeSource(input.source || prev.source),
    createdAt: createdAt,
    updatedAt: now()
  };
}

function findContact(ownerUserId, targetUserId) {
  const owner = normalizeId(ownerUserId);
  const target = normalizeId(targetUserId);
  if (!owner || !target) return null;
  return readAll().find((contact) =>
    contact &&
    isSameIdentity(contact.ownerUserId, owner) &&
    isSameIdentity(contact.targetUserId, target)
  ) || null;
}

function hasContact(ownerUserId, targetUserId) {
  return !!findContact(ownerUserId, targetUserId);
}

function getContacts(userId) {
  const ownerUserId = normalizeId(userId);
  if (!ownerUserId) return [];
  return readAll().filter((contact) => contact && isSameIdentity(contact.ownerUserId, ownerUserId));
}

function addContact(params) {
  const input = params || {};
  const contactId = buildContactId(input.ownerUserId, input.targetUserId);
  if (!contactId) return null;
  const list = readAll();
  const index = list.findIndex((contact) => contact && contact.contactId === contactId);
  if (index >= 0) return list[index];
  const contact = normalizeContact(input);
  if (!contact) return null;
  list.push(contact);
  writeAll(list);
  return contact;
}

function updateRemarkName(ownerUserId, targetUserId, remarkName) {
  const owner = normalizeId(ownerUserId);
  const target = normalizeId(targetUserId);
  if (!owner || !target) return null;
  const list = readAll();
  const index = list.findIndex((contact) =>
    contact &&
    isSameIdentity(contact.ownerUserId, owner) &&
    isSameIdentity(contact.targetUserId, target)
  );
  if (index < 0) return null;
  const next = normalizeContact(
    Object.assign({}, list[index], {
      remarkName: remarkName != null ? String(remarkName) : ''
    }),
    list[index]
  );
  if (!next) return null;
  list[index] = next;
  writeAll(list);
  return next;
}

module.exports = {
  CONTACT_STORAGE_KEY,
  addContact,
  getContacts,
  findContact,
  hasContact,
  updateRemarkName
};
