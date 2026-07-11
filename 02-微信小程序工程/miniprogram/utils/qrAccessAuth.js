/**
 * 二维码权限入口：注册 / 手机号绑定闸门
 * 在写入 tempAdmins 之前调用；头像/昵称仅展示兜底，不作硬条件。
 */

const gameStore = require('./gameStore.js');
const mockAvatars = require('./mockAvatars.js');

const AUTH_STORAGE_KEY = 'gb_qr_access_auth_v1';

const COPY = {
  admin_qr: {
    needPhoneTitle: '需要绑定手机号',
    needPhoneContent: '临时管理员功能必须绑定手机号',
    cancelToast: '未绑定手机号，无法申请临时管理员权限',
    needLoginTitle: '需要登录',
    needLoginContent: '请先完成注册登录后再申请临时管理员'
  },
  caddie_qr: {
    needPhoneTitle: '需要绑定手机号',
    needPhoneContent: '记分功能必须绑定手机号',
    cancelToast: '未绑定手机号，无法获得记分权限',
    needLoginTitle: '需要登录',
    needLoginContent: '请先完成注册登录后再获取记分权限'
  }
};

function _readAuthRaw() {
  try {
    const data = wx.getStorageSync(AUTH_STORAGE_KEY);
    return data && typeof data === 'object' ? data : {};
  } catch (e) {
    return {};
  }
}

function _writeAuthRaw(patch) {
  const next = Object.assign({}, _readAuthRaw(), patch || {});
  try {
    wx.setStorageSync(AUTH_STORAGE_KEY, next);
  } catch (e) {
    /* ignore */
  }
  return next;
}

function isValidPhone(phone) {
  const p = String(phone || '').trim();
  return /^1\d{10}$/.test(p);
}

function getCopy(entryType) {
  return COPY[entryType] || COPY.admin_qr;
}

/**
 * 读取有效手机号。
 * mockPhoneBound === false 时强制视为未绑定（开发态可测拦截）。
 */
function getBoundPhone(user) {
  const auth = _readAuthRaw();
  if (auth.mockPhoneBound === false) return '';
  const fromAuth = String(auth.phone || '').trim();
  if (fromAuth) return isValidPhone(fromAuth) ? fromAuth : '';
  const u = user || gameStore.getCurrentUser() || {};
  const fromUser = String(u.phone || '').trim();
  return isValidPhone(fromUser) ? fromUser : '';
}

function isRegistered(user) {
  const auth = _readAuthRaw();
  if (auth.registered === false) return false;
  const u = user || gameStore.getCurrentUser() || {};
  return !!String(u.userId || auth.userId || '').trim();
}

function hasPhoneBound(user) {
  return !!getBoundPhone(user);
}

/**
 * 绑定成功后写入本地身份（不新建另一套账号体系，叠在 currentUser 上）
 */
function bindPhone(phone) {
  const p = String(phone || '').trim();
  if (!isValidPhone(p)) return { ok: false, reason: 'invalid_phone' };
  if (typeof gameStore.setCurrentUserPhone === 'function') {
    gameStore.setCurrentUserPhone(p);
  }
  if (typeof gameStore.ensureCurrentUserRegistered === 'function') {
    gameStore.ensureCurrentUserRegistered();
  }
  _writeAuthRaw({
    phone: p,
    mockPhoneBound: true,
    registered: true,
    userId: String((gameStore.getCurrentUser() || {}).userId || 'me')
  });
  return { ok: true, phone: p };
}

/** 开发态：强制开关是否视为已绑手机 */
function setMockPhoneBound(flag) {
  _writeAuthRaw({ mockPhoneBound: !!flag });
  if (!flag) {
    // 清空 auth.phone，避免误判
    const auth = _readAuthRaw();
    _writeAuthRaw({ phone: '', mockPhoneBound: false, registered: auth.registered });
  }
  return !!flag;
}

function getAuthDebugState() {
  const user = gameStore.getCurrentUser() || {};
  return {
    registered: isRegistered(user),
    phone: getBoundPhone(user),
    mockPhoneBound: _readAuthRaw().mockPhoneBound,
    userId: String(user.userId || '')
  };
}

function resolveDisplayNickname(user, entryType) {
  const u = user || {};
  const name = String(
    u.nickname || u.name || u.competitionName || u.displayName || ''
  ).trim();
  if (name) return name;
  return entryType === 'admin_qr' ? '临时管理员' : '微信用户';
}

function resolveDisplayAvatar(user, userId) {
  const u = user || {};
  const raw = u.avatar != null ? u.avatar : u.avatarUrl;
  return mockAvatars.resolveAvatar(raw || '', userId || 'me');
}

/**
 * 写入 tempAdmins 用的身份快照（含 phone；昵称/头像可兜底）
 */
function buildClaimProfile(entryType, user) {
  const u = user || gameStore.getCurrentUser() || {};
  const userId = String(u.userId || '').trim();
  const phone = getBoundPhone(u);
  return {
    userId: userId,
    phone: phone,
    nickname: resolveDisplayNickname(u, entryType),
    avatar: resolveDisplayAvatar(u, userId),
    name: resolveDisplayNickname(u, entryType)
  };
}

/**
 * 闸门：注册 + 手机号
 * @returns {{ ok: true, user: object } | { ok: false, reason: 'need_login'|'need_phone'|'no_entry', copy: object, message: string }}
 */
function ensureRegisteredAndPhoneBound(entryType) {
  const type = entryType === 'caddie_qr' ? 'caddie_qr' : 'admin_qr';
  const copy = getCopy(type);
  const user = gameStore.getCurrentUser() || {};

  if (!isRegistered(user)) {
    return {
      ok: false,
      reason: 'need_login',
      copy: copy,
      message: copy.needLoginContent
    };
  }
  if (!hasPhoneBound(user)) {
    return {
      ok: false,
      reason: 'need_phone',
      copy: copy,
      message: copy.needPhoneContent
    };
  }
  const profile = buildClaimProfile(type, user);
  if (!profile.userId || !profile.phone) {
    return {
      ok: false,
      reason: 'need_phone',
      copy: copy,
      message: copy.needPhoneContent
    };
  }
  return { ok: true, user: profile, entryType: type, copy: copy };
}

module.exports = {
  AUTH_STORAGE_KEY,
  COPY,
  isValidPhone,
  getCopy,
  getBoundPhone,
  isRegistered,
  hasPhoneBound,
  bindPhone,
  setMockPhoneBound,
  getAuthDebugState,
  resolveDisplayNickname,
  resolveDisplayAvatar,
  buildClaimProfile,
  ensureRegisteredAndPhoneBound
};
