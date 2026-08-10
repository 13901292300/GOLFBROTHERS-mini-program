/**
 * Contact relationship store.
 *
 * Owns "who has whom as a contact" + private remark fields.
 * Does not resolve identities for public profiles or mutate match data.
 */
const CONTACT_STORAGE_KEY = 'gb_contacts_v1';
const userIdentityAlias = require('./userIdentityAlias.js');
const playerIdentityGuard = require('./playerIdentityGuard.js');

const REMARK_NAME_MAX = 12;
const REMARK_NOTE_MAX = 200;

/** 备注变更版本号：列表 onShow 可据此判断是否重建名称 View Model */
let remarkRevision = 0;

function normalizeId(value) {
  return playerIdentityGuard.normalizePlayerUserId(value);
}

function isStablePublicUserId(userId, options) {
  return playerIdentityGuard.isStablePublicUserId(userId, options);
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

/** 中文 / emoji 按码点计数字符 */
function countChars(text) {
  return Array.from(String(text == null ? '' : text)).length;
}

function clipChars(text, max) {
  const chars = Array.from(String(text == null ? '' : text));
  if (chars.length <= max) return chars.join('');
  return chars.slice(0, max).join('');
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

function getRemarkRevision() {
  return remarkRevision;
}

function bumpRemarkRevision() {
  remarkRevision += 1;
  return remarkRevision;
}

/**
 * 一次读取 Storage，返回 owner 视角下 targetUserId → remarkName。
 * 仅含非空备注名；guest / 非法 id 不会出现。
 */
function getRemarkNameMap(ownerUserId) {
  const owner = normalizeId(ownerUserId);
  const map = {};
  if (!owner || !isStablePublicUserId(owner)) return map;
  const ownerCanon = resolveCanonicalId(owner) || owner;
  readAll().forEach((contact) => {
    if (!contact) return;
    if (!isSameIdentity(contact.ownerUserId, ownerCanon)) return;
    const remarkName = String(contact.remarkName || '').trim();
    if (!remarkName) return;
    const target = normalizeId(contact.targetUserId);
    if (!target || !isStablePublicUserId(target)) return;
    const targetCanon = resolveCanonicalId(target) || target;
    map[target] = remarkName;
    if (targetCanon && targetCanon !== target) map[targetCanon] = remarkName;
  });
  return map;
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
  const remarkNameRaw =
    input.remarkName != null ? String(input.remarkName) : prev.remarkName != null ? String(prev.remarkName) : '';
  const remarkNoteRaw =
    input.remarkNote != null ? String(input.remarkNote) : prev.remarkNote != null ? String(prev.remarkNote) : '';
  const remarkName = clipChars(remarkNameRaw.trim(), REMARK_NAME_MAX);
  const remarkNote = clipChars(remarkNoteRaw, REMARK_NOTE_MAX);
  let remarkUpdatedAt = prev.remarkUpdatedAt || 0;
  if (
    Object.prototype.hasOwnProperty.call(input, 'remarkName') ||
    Object.prototype.hasOwnProperty.call(input, 'remarkNote')
  ) {
    remarkUpdatedAt = input.remarkUpdatedAt != null ? Number(input.remarkUpdatedAt) || now() : now();
  } else if (input.remarkUpdatedAt != null) {
    remarkUpdatedAt = Number(input.remarkUpdatedAt) || remarkUpdatedAt;
  }
  return {
    contactId: contactId,
    ownerUserId: ownerUserId,
    targetUserId: targetUserId,
    phone: normalizePhone(input.phone || prev.phone),
    remarkName: remarkName,
    remarkNote: remarkNote,
    remarkUpdatedAt: remarkUpdatedAt || 0,
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
  return upsertPrivateRemark(ownerUserId, targetUserId, {
    remarkName: remarkName != null ? String(remarkName) : ''
  });
}

/**
 * 读取私人备注（owner → target）；无记录返回空字段。
 */
function getPrivateRemark(ownerUserId, targetUserId) {
  const c = findContact(ownerUserId, targetUserId);
  if (!c) {
    return {
      remarkName: '',
      remarkNote: '',
      remarkUpdatedAt: 0,
      canEditRemark: false
    };
  }
  return {
    remarkName: String(c.remarkName || '').trim(),
    remarkNote: String(c.remarkNote || ''),
    remarkUpdatedAt: Number(c.remarkUpdatedAt) || 0,
    canEditRemark: true
  };
}

/**
 * 写入/清空私人备注。两项皆空时清空字段（保留联系人实体）。
 * guest / 非法 id / 本人 → null
 */
function upsertPrivateRemark(ownerUserId, targetUserId, patch) {
  const owner = normalizeId(ownerUserId);
  const target = normalizeId(targetUserId);
  if (!owner || !target) return null;
  if (!isStablePublicUserId(owner)) return null;
  if (!isStablePublicUserId(target)) return null;
  if (isSameIdentity(owner, target)) return null;

  const input = patch || {};
  let remarkName =
    Object.prototype.hasOwnProperty.call(input, 'remarkName')
      ? String(input.remarkName == null ? '' : input.remarkName).trim()
      : null;
  let remarkNote =
    Object.prototype.hasOwnProperty.call(input, 'remarkNote')
      ? String(input.remarkNote == null ? '' : input.remarkNote)
      : null;

  if (remarkName != null && countChars(remarkName) > REMARK_NAME_MAX) return null;
  if (remarkNote != null && countChars(remarkNote) > REMARK_NOTE_MAX) return null;

  const list = readAll();
  const index = list.findIndex((contact) =>
    contact &&
    isSameIdentity(contact.ownerUserId, owner) &&
    isSameIdentity(contact.targetUserId, target)
  );

  const prev = index >= 0 ? list[index] : null;
  const nextName = remarkName != null ? remarkName : String((prev && prev.remarkName) || '').trim();
  const nextNote = remarkNote != null ? remarkNote : String((prev && prev.remarkNote) || '');

  const payload = {
    ownerUserId: owner,
    targetUserId: target,
    phone: prev && prev.phone,
    source: (prev && prev.source) || 'manual_add',
    remarkName: nextName,
    remarkNote: nextNote,
    remarkUpdatedAt: now(),
    createdAt: prev && prev.createdAt
  };

  const next = normalizeContact(payload, prev || {});
  if (!next) return null;

  if (index >= 0) {
    list[index] = next;
  } else {
    list.push(next);
  }
  writeAll(list);
  bumpRemarkRevision();
  return next;
}

function canEditPrivateRemark(ownerUserId, targetUserId) {
  const owner = normalizeId(ownerUserId);
  const target = normalizeId(targetUserId);
  if (!owner || !target) return false;
  if (!isStablePublicUserId(owner)) return false;
  if (!isStablePublicUserId(target)) return false;
  if (isSameIdentity(owner, target)) return false;
  return true;
}

module.exports = {
  CONTACT_STORAGE_KEY,
  REMARK_NAME_MAX,
  REMARK_NOTE_MAX,
  countChars,
  clipChars,
  addContact,
  getContacts,
  findContact,
  hasContact,
  updateRemarkName,
  getPrivateRemark,
  upsertPrivateRemark,
  canEditPrivateRemark,
  getRemarkNameMap,
  getRemarkRevision,
  bumpRemarkRevision
};
