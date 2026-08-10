/**
 * 当前查看者视角下的球员显示名统一 Resolver。
 *
 * 优先级：
 *   匿名安全投影 → 私人备注名 → 公开昵称 → 赛事快照昵称 → 默认名称
 *
 * 只生成展示层 displayName，绝不写回赛事 Store / 分享数据 / 公开资料。
 */

const contactStore = require('./contactStore.js');
const socialRelationStore = require('./socialRelationStore.js');
const playerIdentityGuard = require('./playerIdentityGuard.js');

const DEFAULT_DISPLAY_NAME = '未知球员';
/** 预留：identityMasked 时使用，绝不可回落备注名 */
const ANONYMOUS_DISPLAY_NAME = '匿名球员';

function _trim(v) {
  return playerIdentityGuard.normalizePlayerUserId(v);
}

function isStablePublicUserId(userId, options) {
  return playerIdentityGuard.isStablePublicUserId(userId, options);
}

/**
 * @param {object} input
 * @param {string} [input.viewerUserId]
 * @param {string} [input.targetUserId]
 * @param {string} [input.publicName]
 * @param {string} [input.snapshotName]
 * @param {boolean} [input.identityMasked]
 * @param {string} [input.anonymousName]
 * @param {Record<string,string>} [input.remarkNameMap] 批量备注名（同次列表构建传入，避免逐行 Storage）
 * @param {string} [input.defaultName]
 * @returns {{
 *   displayName: string,
 *   originalName: string,
 *   hasRemark: boolean,
 *   nameSource: 'anonymous'|'remark'|'public'|'snapshot'|'default'|'self'
 * }}
 */
function resolvePlayerDisplayNameForViewer(input) {
  const src = input || {};
  const identityMasked = src.identityMasked === true;
  const anonymousName =
    String(src.anonymousName != null ? src.anonymousName : ANONYMOUS_DISPLAY_NAME).trim() ||
    ANONYMOUS_DISPLAY_NAME;
  const defaultName =
    String(src.defaultName != null ? src.defaultName : DEFAULT_DISPLAY_NAME).trim() ||
    DEFAULT_DISPLAY_NAME;

  const publicName = _trim(src.publicName);
  const snapshotName = _trim(src.snapshotName);
  const originalName = publicName || snapshotName || defaultName;

  if (identityMasked) {
    return {
      displayName: anonymousName,
      originalName: originalName,
      hasRemark: false,
      nameSource: 'anonymous'
    };
  }

  const viewer = _resolveViewerId(src.viewerUserId);
  const target = _resolveTargetId(src.targetUserId);

  if (!target) {
    return {
      displayName: originalName,
      originalName: originalName,
      hasRemark: false,
      nameSource: publicName ? 'public' : snapshotName ? 'snapshot' : 'default'
    };
  }

  if (viewer && _sameIdentity(viewer, target)) {
    const selfName = publicName || snapshotName || defaultName;
    return {
      displayName: selfName,
      originalName: selfName,
      hasRemark: false,
      nameSource: 'self'
    };
  }

  let remarkName = '';
  if (viewer && isStablePublicUserId(viewer) && isStablePublicUserId(target)) {
    const map = src.remarkNameMap && typeof src.remarkNameMap === 'object' ? src.remarkNameMap : null;
    if (map) {
      remarkName = _lookupRemark(map, target);
    } else {
      try {
        remarkName = _trim((contactStore.getPrivateRemark(viewer, target) || {}).remarkName);
      } catch (e) {
        remarkName = '';
      }
    }
  }

  if (remarkName) {
    return {
      displayName: remarkName,
      originalName: originalName,
      hasRemark: true,
      nameSource: 'remark'
    };
  }

  if (publicName) {
    return {
      displayName: publicName,
      originalName: originalName,
      hasRemark: false,
      nameSource: 'public'
    };
  }
  if (snapshotName) {
    return {
      displayName: snapshotName,
      originalName: originalName,
      hasRemark: false,
      nameSource: 'snapshot'
    };
  }
  return {
    displayName: defaultName,
    originalName: originalName,
    hasRemark: false,
    nameSource: 'default'
  };
}

/**
 * 一次 Storage 读取，构建 owner→targets 的 remarkName map。
 * @param {string} [viewerUserId]
 * @param {string[]|null} [targetUserIds] 可选过滤；缺省返回该查看者全部非空备注名
 * @returns {Record<string,string>}
 */
function buildRemarkNameMap(viewerUserId, targetUserIds) {
  const viewer = _resolveViewerId(viewerUserId);
  if (!viewer || !isStablePublicUserId(viewer)) return {};
  let map = {};
  try {
    map = contactStore.getRemarkNameMap(viewer) || {};
  } catch (e) {
    map = {};
  }
  if (!Array.isArray(targetUserIds) || !targetUserIds.length) return map;

  const out = {};
  const seen = {};
  targetUserIds.forEach((rawId) => {
    const id = _trim(rawId);
    if (!id || seen[id]) return;
    seen[id] = true;
    const name = _lookupRemark(map, id);
    if (name) {
      out[id] = name;
      const canon = _canonical(id);
      if (canon && canon !== id) out[canon] = name;
    }
  });
  return out;
}

function getRemarkRevision() {
  try {
    return contactStore.getRemarkRevision();
  } catch (e) {
    return 0;
  }
}

/**
 * 将消息列表作者名投影为查看者视角（不改写原数组对象以外的存储）。
 * @param {Array} messages
 * @param {{ viewerUserId?: string, remarkNameMap?: object }} [options]
 * @returns {Array}
 */
function mapMessageAuthorsForViewer(messages, options) {
  const list = Array.isArray(messages) ? messages : [];
  const opts = options || {};
  const viewer = _resolveViewerId(opts.viewerUserId);
  const map =
    opts.remarkNameMap && typeof opts.remarkNameMap === 'object'
      ? opts.remarkNameMap
      : buildRemarkNameMap(viewer);
  return list.map((msg) => {
    if (!msg || typeof msg !== 'object') return msg;
    if (msg.type === 'system') return msg;
    if (msg.self === true) return msg;
    const targetId = _trim(msg.userId || msg.playerId || msg.authorId);
    if (!targetId || !isStablePublicUserId(targetId)) return msg;
    const publicName = _trim(msg.name || msg.nickname || msg.displayName);
    const resolved = resolvePlayerDisplayNameForViewer({
      viewerUserId: viewer,
      targetUserId: targetId,
      publicName: publicName,
      snapshotName: publicName,
      remarkNameMap: map
    });
    if (!resolved.hasRemark || resolved.displayName === publicName) return msg;
    return Object.assign({}, msg, { name: resolved.displayName });
  });
}

function _canonical(userId) {
  const id = _trim(userId);
  if (!id) return '';
  try {
    return _trim(socialRelationStore.resolveCanonicalUserId(id)) || id;
  } catch (e) {
    return id;
  }
}

function _resolveViewerId(viewerUserId) {
  const raw = _trim(viewerUserId);
  if (raw) return _canonical(raw) || raw;
  try {
    return _trim(socialRelationStore.resolveCurrentUserId());
  } catch (e) {
    return '';
  }
}

function _resolveTargetId(targetUserId) {
  const id = _trim(targetUserId);
  if (!id) return '';
  return _canonical(id) || id;
}

function _sameIdentity(a, b) {
  const left = _trim(a);
  const right = _trim(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return _canonical(left) === _canonical(right);
}

function _lookupRemark(map, targetUserId) {
  if (!map || typeof map !== 'object') return '';
  const id = _trim(targetUserId);
  if (!id) return '';
  const direct = _trim(map[id]);
  if (direct) return direct;
  const canon = _canonical(id);
  if (canon && canon !== id) {
    const viaCanon = _trim(map[canon]);
    if (viaCanon) return viaCanon;
  }
  return '';
}

module.exports = {
  DEFAULT_DISPLAY_NAME,
  ANONYMOUS_DISPLAY_NAME,
  resolvePlayerDisplayNameForViewer,
  buildRemarkNameMap,
  getRemarkRevision,
  mapMessageAuthorsForViewer
};
