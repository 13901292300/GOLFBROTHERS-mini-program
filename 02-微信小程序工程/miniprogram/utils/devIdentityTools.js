/**
 * Development-only identity helpers.
 *
 * This module is for local debugging of phone -> registered identity upgrade
 * scenarios. It does not connect to match registration, contacts, Slots, or
 * scoreData.
 */
const userIdentityAlias = require('./userIdentityAlias.js');
const userStore = require('./userStore.js');
const mockAvatars = require('./mockAvatars.js');

const TEST_ALIAS_INDEX_KEY = 'gb_dev_identity_test_alias_ids_v1';

function normalizeId(value) {
  return String(value || '').trim();
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').trim();
}

function nowSuffix() {
  return String(Date.now());
}

function readStorageList(key) {
  try {
    const list = wx.getStorageSync(key);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function writeStorageList(key, list) {
  try {
    wx.setStorageSync(key, Array.isArray(list) ? list : []);
  } catch (e) {
    /* ignore */
  }
}

function readAliasList() {
  return readStorageList(userIdentityAlias.STORAGE_KEY);
}

function writeAliasList(list) {
  writeStorageList(userIdentityAlias.STORAGE_KEY, list);
}

function readTestAliasIds() {
  return readStorageList(TEST_ALIAS_INDEX_KEY)
    .map((id) => normalizeId(id))
    .filter(Boolean);
}

function writeTestAliasIds(ids) {
  const seen = {};
  const list = (Array.isArray(ids) ? ids : [])
    .map((id) => normalizeId(id))
    .filter((id) => {
      if (!id || seen[id]) return false;
      seen[id] = true;
      return true;
    });
  writeStorageList(TEST_ALIAS_INDEX_KEY, list);
}

function rememberTestAlias(alias) {
  if (!alias || !alias.aliasId) return alias || null;
  const ids = readTestAliasIds();
  ids.push(alias.aliasId);
  writeTestAliasIds(ids);
  return alias;
}

function createTestAlias(params) {
  const input = params || {};
  const suffix = nowSuffix();
  const alias = userIdentityAlias.addAlias({
    fromUserId: normalizeId(input.fromUserId) || ('phone_test_' + suffix),
    toUserId: normalizeId(input.toUserId) || ('wx_test_' + suffix),
    type: 'phone_to_registered'
  });
  return rememberTestAlias(alias);
}

function getTestAliases() {
  const ids = readTestAliasIds();
  if (!ids.length) return [];
  const idMap = {};
  ids.forEach((id) => { idMap[id] = true; });
  return readAliasList().filter((alias) => alias && idMap[alias.aliasId]);
}

function clearTestAliases() {
  const ids = readTestAliasIds();
  if (!ids.length) return [];
  const idMap = {};
  ids.forEach((id) => { idMap[id] = true; });
  const removed = [];
  const kept = readAliasList().filter((alias) => {
    if (alias && idMap[alias.aliasId]) {
      removed.push(alias);
      return false;
    }
    return true;
  });
  writeAliasList(kept);
  writeTestAliasIds([]);
  return removed;
}

function createTestPhoneUser(profile) {
  const input = profile || {};
  const suffix = nowSuffix();
  const phone = normalizePhone(input.phone) || ('188' + suffix.slice(-8));
  return userStore.createPhoneUser({
    userId: normalizeId(input.userId) || ('phone_test_' + phone),
    phone: phone,
    nickname: String(input.nickname || '测试手机用户').trim(),
    avatar: input.avatar || mockAvatars.resolveAvatar('', 'phone_test_' + phone),
    gender: input.gender || '',
    source: 'manual_add'
  });
}

function createTestRegisteredUser(profile) {
  const input = profile || {};
  const suffix = nowSuffix();
  const userId = normalizeId(input.userId) || ('wx_test_' + suffix);
  return {
    userId: userId,
    userType: 'registered',
    nickname: String(input.nickname || '测试微信用户').trim(),
    competitionName: String(input.competitionName || input.nickname || '测试微信用户').trim(),
    avatar: input.avatar || mockAvatars.resolveAvatar('', userId),
    gender: input.gender || '',
    phone: normalizePhone(input.phone)
  };
}

module.exports = {
  createTestAlias,
  clearTestAliases,
  getTestAliases,
  createTestPhoneUser,
  createTestRegisteredUser
};
