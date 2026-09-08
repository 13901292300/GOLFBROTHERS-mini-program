/**
 * Mock 头像（COS HTTPS）
 *
 * 规则：
 * - 虚拟球员使用 mock-avatar-01 ~ 10
 * - 同一 playerId / 昵称稳定映射到同一头像
 * - 仅空值 / 非法路径 / 加载失败时使用 default-avatar
 */
const COS_BASE =
  (require('../config.js').cdnBaseUrl ||
    'https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com').replace(
    /\/$/,
    ''
  );
const MOCK_AVATAR_BASE = COS_BASE + '/miniprogram/mock-avatars';
const DEFAULT_AVATAR = MOCK_AVATAR_BASE + '/default-avatar.jpg';

const MOCK_AVATAR_COUNT = 10;

const MOCK_AVATAR_PATHS = Array.from({ length: MOCK_AVATAR_COUNT }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return MOCK_AVATAR_BASE + '/mock-avatar-' + n + '.jpg';
});

function stableHash(str) {
  let h = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function avatarByIndex(index) {
  const n = Number(index);
  if (isNaN(n)) return MOCK_AVATAR_PATHS[0];
  const idx = ((n % MOCK_AVATAR_PATHS.length) + MOCK_AVATAR_PATHS.length) % MOCK_AVATAR_PATHS.length;
  return MOCK_AVATAR_PATHS[idx];
}

/** 按 playerId / 昵称 / 数字种子稳定选取虚拟人物头像（非 default） */
function pickMockAvatar(seed) {
  if (typeof seed === 'number' && !isNaN(seed)) {
    return avatarByIndex(seed);
  }
  const s = String(seed || '').trim();
  if (!s) return DEFAULT_AVATAR;
  return avatarByIndex(stableHash(s));
}

function isLocalAvatarPath(s) {
  return /^\/(assets|images)\//.test(s) || /^(assets|images)\//.test(s);
}

function isTempWeChatFile(s) {
  const v = String(s || '').trim();
  if (!v) return false;
  if (/^wxfile:\/\/tmp/i.test(v)) return true;
  if (/^https?:\/\/tmp\b/i.test(v)) return true;
  if (/\/tmp(?:[_/]|$)/i.test(v) && /^(wxfile:|https?:)/i.test(v)) return true;
  return false;
}

function _userDataRoot() {
  try {
    const root = typeof wx !== 'undefined' && wx.env && wx.env.USER_DATA_PATH;
    return root ? String(root).replace(/\/$/, '') : '';
  } catch (e) {
    return '';
  }
}

/** 用户目录持久文件：usr / USER_DATA_PATH。不含「非 tmp 即持久」。 */
function isDurableLocalUserFile(s) {
  const v = String(s || '').trim();
  if (!v || isTempWeChatFile(v)) return false;
  if (/^[A-Za-z]:[\\/]/.test(v) || /^file:\/\//i.test(v)) return false;
  const root = _userDataRoot();
  if (root && (v === root || v.indexOf(root + '/') === 0 || v.indexOf(root + '\\') === 0)) {
    return true;
  }
  if (/^wxfile:\/\/usr/i.test(v)) return true;
  if (/^https?:\/\/usr(?:\/|$)/i.test(v)) return true;
  if (/^https?:\/\/127\.0\.0\.1(?::\d+)?\/usr\b/i.test(v)) return true;
  if (/^https?:\/\/localhost(?::\d+)?\/usr\b/i.test(v)) return true;
  return false;
}

function isHttpsNetworkAvatar(s) {
  const v = String(s || '').trim();
  return /^https:\/\//i.test(v) && !isTempWeChatFile(v);
}

function isCloudFileId(s) {
  return /^cloud:\/\//i.test(String(s || '').trim());
}

/** 资料/记分可长期使用的头像：https、cloud://、包内资源、用户目录文件 */
function isDurableAvatarSrc(s) {
  const v = String(s || '').trim();
  if (!v) return false;
  if (isTempWeChatFile(v)) return false;
  if (isCloudFileId(v)) return true;
  if (isHttpsNetworkAvatar(v)) return true;
  if (isLocalAvatarPath(v)) return true;
  if (isDurableLocalUserFile(v)) return true;
  return false;
}

function isInvalidAvatarSrc(s) {
  if (!s) return true;
  if (isDurableAvatarSrc(s)) return false;
  return true;
}

function normalizeLocalPath(s) {
  const norm = s.startsWith('/') ? s : '/' + s;
  const legacy = norm.match(/\/mock-avatar-(\d+)\.(png|jpg)$/);
  if (legacy) {
    return avatarByIndex(parseInt(legacy[1], 10) - 1);
  }
  if (/\/default-avatar\.(png|jpg)$/.test(norm)) {
    return DEFAULT_AVATAR;
  }
  return norm;
}

/** 将头像字段规范为小程序可访问路径 */
function resolveAvatar(src, seed) {
  const s = String(src || '').trim();
  if (isDurableLocalUserFile(s) || isHttpsNetworkAvatar(s)) {
    return s;
  }
  if (isLocalAvatarPath(s)) {
    return normalizeLocalPath(s);
  }
  if (isInvalidAvatarSrc(s)) {
    return seed != null && String(seed).trim() ? pickMockAvatar(seed) : DEFAULT_AVATAR;
  }
  return DEFAULT_AVATAR;
}

/** 为球员对象补全可展示头像（各页面统一入口） */
function enrichPlayerAvatar(player, seed) {
  if (!player || typeof player !== 'object') return player;
  const key = seed || player.playerId || player.id || player.name;
  return Object.assign({}, player, {
    avatar: resolveAvatar(player.avatar, key)
  });
}

module.exports = {
  DEFAULT_AVATAR,
  MOCK_AVATAR_COUNT,
  MOCK_AVATAR_PATHS,
  avatarByIndex,
  pickMockAvatar,
  resolveAvatar,
  enrichPlayerAvatar,
  isTempWeChatFile,
  isDurableLocalUserFile,
  isDurableAvatarSrc
};
