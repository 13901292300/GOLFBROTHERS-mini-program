/**
 * 球员头像互动中央弹窗：目标组装 / 度量格式（记分页与赛事详情共用）。
 * 不承载 reaction 动画；宿主负责可见性与互动副作用。
 */

const userProfileStore = require('./userProfileStore.js');
const userIdentityAlias = require('./userIdentityAlias.js');
const { getGenderById } = require('./playerDirectory.js');
const socialRelationStore = require('./socialRelationStore.js');
const playerDisplayName = require('./playerDisplayName.js');
const playerIdentityGuard = require('./playerIdentityGuard.js');

function resolveCanonicalUserId(userId) {
  const id = String(userId || '').trim();
  if (!id) return '';
  try {
    return String(userIdentityAlias.resolveCanonicalUserId(id) || id).trim() || id;
  } catch (e) {
    return id;
  }
}

function isSameUserIdentity(leftUserId, rightUserId) {
  const left = String(leftUserId || '').trim();
  const right = String(rightUserId || '').trim();
  if (!left || !right) return false;
  if (left === right) return true;
  return resolveCanonicalUserId(left) === resolveCanonicalUserId(right);
}

function resolveDisplayGender(player, playerId) {
  const raw = player && player.gender;
  if (raw === 'female' || raw === 'male') return raw;
  const id = String(playerId || '').trim();
  if (!id) return '';
  try {
    const g = getGenderById(id, '');
    if (g === 'female' || g === 'male') return g;
  } catch (e) {}
  return '';
}

function formatPlayerActionMetric(value) {
  if (value == null || value === '') return '--';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return String(n);
}

function normalizePlayerActionAvatarRect(rect) {
  if (!rect || typeof rect !== 'object') return null;
  const left = Number(rect.left);
  const top = Number(rect.top);
  const width = Number(rect.width);
  const height = Number(rect.height);
  if (
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { left: left, top: top, width: width, height: height };
}

/**
 * 讨论区等非名单用户：缺差点/浮动显示 --；空 userId 降级为 chat:昵称（与记分页一致）。
 */
function buildPlayerActionTargetFromPartial(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const name = String(src.name || '').trim() || '球员';
  const userId =
    String(src.userId || src.playerId || '').trim() ||
    'chat:' + name;
  const genderRaw = src.gender;
  const gender =
    genderRaw === 'female' || genderRaw === 'male'
      ? genderRaw
      : resolveDisplayGender({ gender: genderRaw }, userId);
  const handicap =
    src.handicap != null && src.handicap !== '' ? src.handicap : null;
  const floatCoef =
    src.floatCoef != null && src.floatCoef !== '' ? src.floatCoef : null;
  return {
    playerId: userId,
    userId: userId,
    name: name,
    avatar: src.avatar || '',
    gender: gender,
    genderLabel: gender === 'female' ? '女' : gender === 'male' ? '男' : '未设置',
    genderSymbol: gender === 'female' ? '♀' : gender === 'male' ? '♂' : '',
    handicap: handicap,
    floatCoef: floatCoef,
    handicapText: formatPlayerActionMetric(handicap),
    floatCoefText: formatPlayerActionMetric(floatCoef),
    index: src.index,
    avatarRect: normalizePlayerActionAvatarRect(src.avatarRect)
  };
}

/**
 * 从可选名单解析完整 target。
 * @param {string} playerId
 * @param {{
 *   findMemberById?: (id: string) => object|null,
 *   findSourceById?: (id: string) => object|null
 * }} [hooks]
 */
function resolvePlayerActionTarget(playerId, hooks) {
  const key = playerId != null ? String(playerId).trim() : '';
  if (!key) return null;
  const h = hooks && typeof hooks === 'object' ? hooks : {};
  const member =
    typeof h.findMemberById === 'function' ? h.findMemberById(key) : null;
  const source =
    typeof h.findSourceById === 'function' ? h.findSourceById(key) : null;
  if (!member && !source && !isSameUserIdentity(key, 'me')) {
    return null;
  }

  const publicName =
    (source && (source.nickname || source.matchNickname || source.competitionName || source.name || source.displayName)) ||
    (member && (member.nickname || member.matchNickname || member.competitionName || member.name || member.displayName)) ||
    (isSameUserIdentity(key, 'me') ? '我' : '') ||
    '球员';
  let name = String(publicName || '').trim() || '球员';
  let avatar =
    (member && member.avatar) ||
    (source && source.avatar) ||
    '';
  const genderRaw =
    (member && member.gender) ||
    (source && source.gender) ||
    '';
  const gender =
    genderRaw === 'female' || genderRaw === 'male'
      ? genderRaw
      : resolveDisplayGender({ gender: genderRaw }, key);
  const genderLabel = gender === 'female' ? '女' : gender === 'male' ? '男' : '未设置';
  const genderSymbol = gender === 'female' ? '♀' : gender === 'male' ? '♂' : '';

  let handicap =
    source && source.handicap != null && source.handicap !== ''
      ? source.handicap
      : member && member.handicap != null && member.handicap !== ''
        ? member.handicap
        : null;
  let floatCoef =
    source && source.floatCoef != null && source.floatCoef !== ''
      ? source.floatCoef
      : member && member.floatCoef != null && member.floatCoef !== ''
        ? member.floatCoef
        : null;

  if (isSameUserIdentity(key, 'me')) {
    try {
      const profile = userProfileStore.loadProfile() || {};
      if (profile.handicap != null && profile.handicap !== '') {
        handicap = profile.handicap;
      }
      if (profile.floatCoef != null && profile.floatCoef !== '') {
        floatCoef = profile.floatCoef;
      }
      const profileName = String(
        profile.nickname || profile.displayName || ''
      ).trim();
      if (profileName) name = profileName;
      if (!avatar && profile.avatar) avatar = profile.avatar;
    } catch (e) {}
  } else if (handicap == null || floatCoef == null) {
    const demoMetrics = {
      'fr-1003': { handicap: 8.0, floatCoef: 0.6 },
      'fr-1005': { handicap: 15.6, floatCoef: 2.0 },
      'fr-1008': { handicap: 12.4, floatCoef: 1.3 }
    };
    const fallback = demoMetrics[key];
    if (fallback) {
      if (handicap == null) handicap = fallback.handicap;
      if (floatCoef == null) floatCoef = fallback.floatCoef;
    }
  }

  // 查看者私人备注名（展示层）；不写回 source/member；保留 publicName 供主页导航快照
  const snapshotPublicName = name;
  if (playerIdentityGuard.isStablePublicUserId(key)) {
    try {
      const viewer = socialRelationStore.resolveCurrentUserId();
      const named = playerDisplayName.resolvePlayerDisplayNameForViewer({
        viewerUserId: viewer,
        targetUserId: key,
        publicName: snapshotPublicName,
        snapshotName: snapshotPublicName,
        identityMasked: !!(source && source.identityMasked) || !!(member && member.identityMasked)
      });
      if (named && named.displayName) name = named.displayName;
    } catch (e) { /* ignore display overlay */ }
  }

  return {
    playerId: key,
    userId: key,
    name: name,
    /** 公开/赛事快照昵称（不含私人备注），供 openPlayerProfile context */
    publicName: snapshotPublicName,
    avatar: avatar,
    gender: gender,
    genderLabel: genderLabel,
    genderSymbol: genderSymbol,
    handicap: handicap,
    floatCoef: floatCoef,
    handicapText: formatPlayerActionMetric(handicap),
    floatCoefText: formatPlayerActionMetric(floatCoef)
  };
}

/**
 * 统一打开入参 → playerActionTarget（不写页面 data）。
 * @param {object} targetUser
 * @param {{
 *   resolveById?: (id: string) => object|null,
 *   resolveByName?: (name: string) => object|null
 * }} [hooks]
 */
function buildPlayerActionTarget(targetUser, hooks) {
  const raw = targetUser && typeof targetUser === 'object' ? targetUser : {};
  const userId = String(raw.userId || raw.playerId || '').trim();
  const nameHint = String(raw.name || '').trim();
  const h = hooks && typeof hooks === 'object' ? hooks : {};
  let target = null;
  if (userId && typeof h.resolveById === 'function') {
    target = h.resolveById(userId);
  }
  if (!target && nameHint && typeof h.resolveByName === 'function') {
    target = h.resolveByName(nameHint);
  }
  if (!target) {
    target = buildPlayerActionTargetFromPartial(raw);
  } else {
    if (nameHint) target.name = nameHint;
    if (raw.avatar) target.avatar = raw.avatar;
    if (raw.gender === 'female' || raw.gender === 'male') {
      target.gender = raw.gender;
      target.genderLabel = raw.gender === 'female' ? '女' : '男';
      target.genderSymbol = raw.gender === 'female' ? '♀' : '♂';
    }
    if (raw.handicap != null && raw.handicap !== '') {
      target.handicap = raw.handicap;
      target.handicapText = formatPlayerActionMetric(raw.handicap);
    }
    if (raw.floatCoef != null && raw.floatCoef !== '') {
      target.floatCoef = raw.floatCoef;
      target.floatCoefText = formatPlayerActionMetric(raw.floatCoef);
    }
  }
  if (!target) return null;
  target.userId = target.userId || target.playerId;
  target.playerId = target.playerId || target.userId;
  if (raw.index != null) target.index = raw.index;
  target.avatarRect = normalizePlayerActionAvatarRect(
    raw.avatarRect || target.avatarRect
  );
  return target;
}

/**
 * 关闭动作面板前拷贝目标快照（避免 panel 清空 playerActionTarget 后播放丢目标）。
 * @param {object|null|undefined} target
 * @returns {object|null}
 */
function snapshotPlayerActionTarget(target) {
  const t = target && typeof target === 'object' ? target : null;
  if (!t) return null;
  const userId = String(t.userId || t.playerId || '').trim();
  const playerId = String(t.playerId || t.userId || '').trim();
  if (!userId && !playerId && (t.index == null || t.index === '')) {
    return null;
  }
  return {
    userId: userId || playerId,
    playerId: playerId || userId,
    name: t.name != null ? String(t.name) : '',
    avatar:
      t.avatar != null
        ? String(t.avatar)
        : t.avatarUrl != null
          ? String(t.avatarUrl)
          : '',
    avatarRect: normalizePlayerActionAvatarRect(t.avatarRect),
    index: t.index,
    gender: t.gender,
    genderLabel: t.genderLabel,
    genderSymbol: t.genderSymbol,
    handicap: t.handicap,
    floatCoef: t.floatCoef,
    handicapText: t.handicapText,
    floatCoefText: t.floatCoefText
  };
}

/**
 * 讨论区 reaction：按消息 index 定位要 detach 的头像实例（userId 辅助校验）。
 * 不按昵称匹配；index 无效或不匹配时返回 messageIndex < 0。
 * @param {Array} chat
 * @param {object|null} target playerActionTarget（须含 index）
 * @param {string} playerId
 * @returns {{ messageIndex: number, userId: string }}
 */
function resolveDiscussionReactionDetachSlot(chat, target, playerId) {
  const pid = playerId != null ? String(playerId).trim() : '';
  if (!pid) return { messageIndex: -1, userId: '' };
  const src = target && typeof target === 'object' ? target : null;
  if (!src || src.index == null || src.index === '') {
    return { messageIndex: -1, userId: '' };
  }
  const n = Number(src.index);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    return { messageIndex: -1, userId: '' };
  }
  const tid = String(src.userId || src.playerId || '').trim();
  if (tid && !isSameUserIdentity(tid, pid)) {
    return { messageIndex: -1, userId: '' };
  }
  const list = Array.isArray(chat) ? chat : [];
  const msg = list[n];
  if (!msg || msg.type === 'system') {
    return { messageIndex: -1, userId: '' };
  }
  const mid = String(
    msg.userId || msg.playerId || (msg.self ? 'me' : '')
  ).trim();
  if (mid) {
    const ok =
      isSameUserIdentity(mid, pid) ||
      (!!msg.self && isSameUserIdentity(pid, 'me'));
    if (!ok) return { messageIndex: -1, userId: '' };
  }
  // userId 优先用消息上的 id，便于宿主二次校验；index 才是隐藏主键
  return { messageIndex: n, userId: mid || pid };
}

module.exports = {
  isSameUserIdentity: isSameUserIdentity,
  formatPlayerActionMetric: formatPlayerActionMetric,
  normalizePlayerActionAvatarRect: normalizePlayerActionAvatarRect,
  buildPlayerActionTargetFromPartial: buildPlayerActionTargetFromPartial,
  resolvePlayerActionTarget: resolvePlayerActionTarget,
  buildPlayerActionTarget: buildPlayerActionTarget,
  snapshotPlayerActionTarget: snapshotPlayerActionTarget,
  resolveDiscussionReactionDetachSlot: resolveDiscussionReactionDetachSlot
};
