/**
 * 本地 mock 头像（真机 / 预览 / 体验版可用，不依赖外网域名）
 *
 * 规则：
 * - 虚拟球员使用 mock-avatar-01 ~ 10 等不同人物头像
 * - 同一 playerId / 昵称稳定映射到同一头像
 * - 仅空值 / 非法路径 / 加载失败时使用 default-avatar
 */
const DEFAULT_AVATAR = '/assets/mock-avatars/default-avatar.png';

const MOCK_AVATAR_COUNT = 10;

const MOCK_AVATAR_PATHS = Array.from({ length: MOCK_AVATAR_COUNT }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return '/assets/mock-avatars/mock-avatar-' + n + '.png';
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

function isInvalidAvatarSrc(s) {
  return (
    !s ||
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('file:') ||
    /^[A-Za-z]:[\\/]/.test(s) ||
    /wxfile:\/\//.test(s) ||
    /tmp\//.test(s)
  );
}

function normalizeLocalPath(s) {
  const norm = s.startsWith('/') ? s : '/' + s;
  const legacy = norm.match(/\/mock-avatar-(\d)\.png$/);
  if (legacy) {
    return avatarByIndex(parseInt(legacy[1], 10) - 1);
  }
  return norm;
}

/** 将头像字段规范为小程序可访问路径 */
function resolveAvatar(src, seed) {
  const s = String(src || '').trim();
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
  enrichPlayerAvatar
};
