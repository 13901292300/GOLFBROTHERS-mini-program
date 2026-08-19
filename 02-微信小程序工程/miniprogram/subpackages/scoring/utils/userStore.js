/**
 * Long-lived user identity store adapter.
 *
 * This store owns local phone-user persistence only. Phone lookup orchestration
 * belongs to userDirectory; match registration, Slot binding, contacts, and
 * profile mutation are intentionally out of scope.
 */
const mockAvatars = require('../../../utils/mockAvatars.js');
const userIdentityAlias = require('../../../utils/userIdentityAlias.js');

const STORAGE_KEY = 'gb_user_store_v1';

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').trim();
}

function buildPhoneUserId(phone) {
  const normalizedPhone = normalizePhone(phone);
  return normalizedPhone ? 'phone_' + normalizedPhone : '';
}

function normalizeId(value) {
  return String(value || '').trim();
}

function now() {
  return Date.now();
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

function normalizePhoneUser(raw, existing) {
  const source = raw || {};
  const prev = existing || {};
  const phone = normalizePhone(source.phone || prev.phone);
  if (!phone) return null;
  const userId = prev.userId || source.userId || buildPhoneUserId(phone);
  const nickname = String(source.nickname || prev.nickname || phone).trim();
  const createdAt = prev.createdAt || source.createdAt || now();
  return {
    userId: userId,
    userType: 'phone',
    phone: phone,
    nickname: nickname,
    avatar: source.avatar || prev.avatar || mockAvatars.resolveAvatar('', userId),
    gender: source.gender != null ? String(source.gender) : (prev.gender || ''),
    source: source.source || prev.source || 'manual_add',
    phoneVerified: false,
    wechatBound: false,
    createdAt: createdAt,
    updatedAt: now()
  };
}

function getUserByPhone(phone) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;
  return readAll().find((user) => normalizePhone(user && user.phone) === normalizedPhone) || null;
}

function createPhoneUser(profile) {
  const input = profile || {};
  const phone = normalizePhone(input.phone);
  if (!phone) return null;
  const list = readAll();
  const index = list.findIndex((user) => normalizePhone(user && user.phone) === phone);
  const existing = index >= 0 ? list[index] : null;
  const next = normalizePhoneUser(Object.assign({}, input, { phone: phone }), existing);
  if (!next) return null;
  if (index >= 0) list[index] = next;
  else list.push(next);
  writeAll(list);
  return next;
}

function upgradeToRegistered(phoneUserId, registeredProfile) {
  const uid = normalizeId(phoneUserId);
  const profile = registeredProfile || {};
  const registeredUserId = normalizeId(profile.userId || profile.playerId || profile.id);
  if (!uid) {
    return {
      ok: false,
      reason: 'no_phone_user_id',
      phoneUserId: ''
    };
  }
  if (!registeredUserId) {
    return {
      ok: false,
      reason: 'no_registered_user_id',
      phoneUserId: uid
    };
  }
  const list = readAll();
  const index = list.findIndex((user) => user && normalizeId(user.userId) === uid);
  if (index < 0) {
    return {
      ok: false,
      reason: 'phone_user_not_found',
      phoneUserId: uid
    };
  }
  const existing = list[index] || {};
  const nickname = String(profile.nickname || existing.nickname || registeredUserId).trim();
  const next = Object.assign({}, existing, {
    userType: 'registered',
    registeredUserId: registeredUserId,
    phone: normalizePhone(profile.phone || existing.phone),
    nickname: nickname,
    competitionName: String(profile.competitionName || existing.competitionName || nickname).trim(),
    avatar: profile.avatar || existing.avatar || mockAvatars.resolveAvatar('', registeredUserId),
    gender: profile.gender != null ? String(profile.gender) : (existing.gender || ''),
    openid: normalizeId(profile.openid || existing.openid),
    unionid: normalizeId(profile.unionid || existing.unionid),
    phoneVerified: existing.phoneVerified != null ? !!existing.phoneVerified : false,
    wechatBound: true,
    updatedAt: now()
  });
  list[index] = next;
  writeAll(list);
  const alias = userIdentityAlias.addAlias({
    fromUserId: uid,
    toUserId: registeredUserId,
    type: 'phone_to_registered'
  });
  return {
    ok: true,
    user: next,
    alias: alias
      ? {
          fromUserId: alias.fromUserId,
          toUserId: alias.toUserId,
          type: alias.type
        }
      : null
  };
}

module.exports = {
  STORAGE_KEY,
  createPhoneUser,
  getUserByPhone,
  upgradeToRegistered
};
