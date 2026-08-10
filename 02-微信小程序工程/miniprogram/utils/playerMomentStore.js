/**
 * 球友圈动态 Store（本地 MVP）。
 * Storage: gb_player_moments_v1
 * 不保存备注名；公开动态全体可见（非好友门控）；软删除 status=deleted。
 */

const STORAGE_KEY = 'gb_player_moments_v1';
const DOC_VERSION = 1;
const CONTENT_MAX_CHARS = 2000;
const IMAGES_MAX = 9;
const PAGE_SIZE = 20;

const playerIdentityGuard = require('./playerIdentityGuard.js');
const socialRelationStore = require('./socialRelationStore.js');
const publicPlayerProfile = require('./publicPlayerProfile.js');
const playerDisplayName = require('./playerDisplayName.js');
const playerMomentMedia = require('./playerMomentMedia.js');
const playerMomentImageLayout = require('./playerMomentImageLayout.js');
const playerMomentPublishContext = require('./playerMomentPublishContext.js');

const MOMENT_DEBUG = false;
function momentDebug() {
  if (!MOMENT_DEBUG) return;
  try {
    console['warn'].apply(console, arguments);
  } catch (e) { /* ignore */ }
}

function _now() {
  return Date.now();
}

function _trim(v) {
  return v == null ? '' : String(v).trim();
}

function countChars(text) {
  return Array.from(String(text == null ? '' : text)).length;
}

function sliceChars(text, max) {
  const arr = Array.from(String(text == null ? '' : text));
  if (arr.length <= max) return arr.join('');
  return arr.slice(0, max).join('');
}

function _emptyDoc() {
  return { version: DOC_VERSION, moments: [], revision: 1 };
}

function _normalizeImage(raw) {
  // 兼容：字符串路径 / 旧字段 url|src|filePath|localPath|tempFilePath
  if (typeof raw === 'string') {
    const p = _trim(raw);
    if (!p) return null;
    return {
      mediaId: 'mimg_' + Math.random().toString(36).slice(2, 10),
      path: p,
      width: 0,
      height: 0,
      storageMode: 'local_user_data'
    };
  }
  if (!raw || typeof raw !== 'object') return null;
  const path = _trim(
    raw.path || raw.url || raw.src || raw.filePath || raw.localPath || raw.tempFilePath
  );
  if (!path) return null;
  return {
    mediaId: _trim(raw.mediaId) || 'mimg_' + Math.random().toString(36).slice(2, 10),
    path: path,
    width: Number(raw.width) || 0,
    height: Number(raw.height) || 0,
    storageMode: _trim(raw.storageMode) || 'local_user_data'
  };
}

function _normalizeMoment(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const momentId = _trim(raw.momentId);
  const authorUserId = playerIdentityGuard.normalizePlayerUserId(raw.authorUserId);
  if (!momentId || !authorUserId) return null;
  const snap =
    raw.authorSnapshot && typeof raw.authorSnapshot === 'object'
      ? raw.authorSnapshot
      : {};
  const images = Array.isArray(raw.images)
    ? raw.images.map(_normalizeImage).filter(Boolean).slice(0, IMAGES_MAX)
    : [];
  const content = String(raw.content == null ? '' : raw.content);
  const status = _trim(raw.status) === 'deleted' ? 'deleted' : 'active';
  const relatedGame = playerMomentPublishContext.normalizeRelatedGame(raw.relatedGame);
  const moderationStatus = _trim(raw.moderationStatus) || 'local_unreviewed';
  return {
    momentId: momentId,
    authorUserId: authorUserId,
    authorSnapshot: {
      nickname: _trim(snap.nickname),
      avatar: _trim(snap.avatar)
    },
    content: content,
    images: images,
    location: raw.location == null ? null : raw.location,
    relatedGame: relatedGame,
    visibility: 'public',
    status: status,
    // 本地 MVP：无真实审核服务，明确未审核，不伪装已过审
    moderationStatus: moderationStatus,
    moderationTaskId:
      raw.moderationTaskId == null || raw.moderationTaskId === ''
        ? null
        : _trim(raw.moderationTaskId),
    moderatedAt: raw.moderatedAt == null ? null : Number(raw.moderatedAt) || null,
    rejectReasonCode:
      raw.rejectReasonCode == null || raw.rejectReasonCode === ''
        ? null
        : _trim(raw.rejectReasonCode),
    createdAt: Number(raw.createdAt) || 0,
    updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || 0,
    deletedAt: status === 'deleted' ? Number(raw.deletedAt) || 0 : null
  };
}

function _readDoc() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw || typeof raw !== 'object') return _emptyDoc();
    const list = Array.isArray(raw.moments) ? raw.moments : [];
    const seen = {};
    const moments = [];
    list.forEach((item) => {
      const m = _normalizeMoment(item);
      if (!m || seen[m.momentId]) return;
      seen[m.momentId] = true;
      moments.push(m);
    });
    return {
      version: DOC_VERSION,
      moments: moments,
      revision: Number(raw.revision) > 0 ? Number(raw.revision) : 1
    };
  } catch (e) {
    return _emptyDoc();
  }
}

function _writeDoc(doc) {
  try {
    wx.setStorageSync(STORAGE_KEY, {
      version: DOC_VERSION,
      moments: Array.isArray(doc.moments) ? doc.moments : [],
      revision: Number(doc.revision) > 0 ? Number(doc.revision) : 1
    });
  } catch (e) {
    momentDebug('[moment] write failed');
  }
}

function getMomentRevision() {
  return String(_readDoc().revision || 1);
}

function _bumpRevision(doc) {
  doc.revision = (Number(doc.revision) || 0) + 1;
}

function _sortMoments(list) {
  return (list || []).slice().sort(function (a, b) {
    const ta = Number(a.createdAt) || 0;
    const tb = Number(b.createdAt) || 0;
    if (ta !== tb) return tb - ta;
    return String(b.momentId).localeCompare(String(a.momentId));
  });
}

/**
 * 审核/下架：公开规则不覆盖这些例外。
 * 本地 MVP 默认 local_unreviewed 仍公开可见；举报 pending 不走此门控。
 */
function _isModerationHidden(moment) {
  const mod = _trim(moment && moment.moderationStatus).toLowerCase();
  if (!mod || mod === 'local_unreviewed' || mod === 'approved' || mod === 'pass') {
    return false;
  }
  return (
    mod === 'rejected' ||
    mod === 'takedown' ||
    mod === 'platform_removed' ||
    mod === 'removed' ||
    mod === 'hidden'
  );
}

/**
 * 球友圈公开可见性（非好友圈）。
 * visibility='public' 且有效 → 全体可见，不读 following/followers/friend/
 * 同球队/同比赛/通讯录，也不读 socialRelationStore / contactFollowAction。
 *
 * 例外（优先级更高）：
 * 1) status=deleted
 * 2) 审核拒绝 / 平台下架
 * 3) 未来拉黑双向隔离（options.blockedUserIds）
 * 4) 内容本身不可用（无 moment）
 * 成绩卡不可用只影响成绩卡局部，不由此函数隐藏整条动态。
 */
function canViewerSeeMoment(viewerUserId, moment, options) {
  const m = moment;
  if (!m) return false;
  if (m.status === 'deleted') return false;
  if (_isModerationHidden(m)) return false;
  if (_trim(m.visibility) !== 'public') return false;
  // 预留：未来拉黑双向隐藏；当前不写入假拉黑，也不从关系 Store 推导
  const blocked =
    options && Array.isArray(options.blockedUserIds) ? options.blockedUserIds : [];
  if (blocked.length) {
    const author = _trim(m.authorUserId);
    const viewer = playerIdentityGuard.normalizePlayerUserId(viewerUserId);
    for (let i = 0; i < blocked.length; i++) {
      const b = _trim(blocked[i]);
      if (b && (b === author || b === viewer)) return false;
    }
  }
  return true;
}

function _buildAuthorSnapshot(authorUserId) {
  let nickname = '';
  let avatar = '';
  try {
    const profile = publicPlayerProfile.resolvePublicPlayerProfile(authorUserId, {});
    nickname = _trim(
      (profile && (profile.nickname || profile.displayName)) || ''
    );
    avatar = _trim((profile && profile.avatar) || '');
  } catch (e) { /* ignore */ }
  return { nickname: nickname || '球友', avatar: avatar };
}

/**
 * @param {{ content?: string, images?: array, authorUserId?: string }} input
 *   images 须为已持久化的 { mediaId, path, width, height, storageMode }
 */
function createMoment(input) {
  const src = input && typeof input === 'object' ? input : {};
  // 作者必须是当前正式用户，忽略伪造的 authorUserId
  const currentUserId = playerIdentityGuard.normalizePlayerUserId(
    socialRelationStore.resolveCurrentUserId()
  );
  const authorUserId = currentUserId;
  if (!playerIdentityGuard.isStablePublicUserId(authorUserId)) {
    return { ok: false, error: 'invalid_author' };
  }
  if (
    playerIdentityGuard.isGuestPlayerId(authorUserId) ||
    playerIdentityGuard.isMaskedPlayerId(authorUserId)
  ) {
    return { ok: false, error: 'guest_or_masked' };
  }
  if (
    src.authorUserId &&
    playerIdentityGuard.normalizePlayerUserId(src.authorUserId) &&
    socialRelationStore.resolveCanonicalUserId(src.authorUserId) !==
      socialRelationStore.resolveCanonicalUserId(authorUserId)
  ) {
    return { ok: false, error: 'author_mismatch' };
  }
  const contentRaw = src.content == null ? '' : String(src.content);
  const content = contentRaw.replace(/^\s+|\s+$/g, '');
  if (countChars(content) > CONTENT_MAX_CHARS) {
    return { ok: false, error: 'content_too_long' };
  }
  const images = Array.isArray(src.images)
    ? src.images.map(_normalizeImage).filter(Boolean).slice(0, IMAGES_MAX)
    : [];
  if (!content && !images.length) {
    return { ok: false, error: 'empty_moment' };
  }
  if (images.length > IMAGES_MAX) {
    return { ok: false, error: 'too_many_images' };
  }

  // 强制关联本场有效 relatedGame（含无权限 publicScorecardId）
  const relatedCheck = playerMomentPublishContext.assertRelatedGameForCreate(
    src.relatedGame,
    authorUserId
  );
  if (!relatedCheck.ok) {
    return { ok: false, error: relatedCheck.error || 'related_game_required' };
  }

  const momentId =
    'mom_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  const ts = _now();
  const moment = {
    momentId: momentId,
    authorUserId: authorUserId,
    authorSnapshot: _buildAuthorSnapshot(authorUserId),
    content: content,
    images: images,
    location: null,
    relatedGame: relatedCheck.relatedGame,
    visibility: 'public',
    status: 'active',
    moderationStatus: 'local_unreviewed',
    moderationTaskId: null,
    moderatedAt: null,
    rejectReasonCode: null,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null
  };

  const doc = _readDoc();
  doc.moments.unshift(moment);
  _bumpRevision(doc);
  _writeDoc(doc);
  return { ok: true, moment: moment, revision: String(doc.revision) };
}

function getMomentById(momentId, options) {
  const id = _trim(momentId);
  if (!id) return null;
  const doc = _readDoc();
  for (let i = 0; i < doc.moments.length; i++) {
    const m = doc.moments[i];
    if (m && m.momentId === id) {
      if (options && options.includeDeleted) return m;
      if (m.status === 'deleted') return null;
      return m;
    }
  }
  return null;
}

function listMomentsByAuthor(authorUserId, options) {
  const author = playerIdentityGuard.normalizePlayerUserId(authorUserId);
  const opts = options && typeof options === 'object' ? options : {};
  // 查询链不读 socialRelationStore；viewer 仅用于拉黑等显式 options
  const viewer = playerIdentityGuard.normalizePlayerUserId(opts.viewerUserId || '');
  const limit = opts.limit > 0 ? Math.floor(opts.limit) : PAGE_SIZE;
  const cursor = opts.cursor != null ? Math.max(0, Math.floor(Number(opts.cursor) || 0)) : 0;

  const doc = _readDoc();
  const filtered = _sortMoments(
    doc.moments.filter(function (m) {
      if (!m) return false;
      const midAuthor = playerIdentityGuard.normalizePlayerUserId(m.authorUserId);
      if (!author || midAuthor !== author) return false;
      return canViewerSeeMoment(viewer, m, opts);
    })
  );
  const slice = filtered.slice(cursor, cursor + limit);
  const nextCursor = cursor + slice.length;
  return {
    items: slice,
    nextCursor: nextCursor,
    hasMore: nextCursor < filtered.length,
    revision: String(doc.revision)
  };
}

function listRecentMomentsByAuthor(authorUserId, limit, options) {
  const n = limit > 0 ? Math.floor(limit) : 2;
  const page = listMomentsByAuthor(authorUserId, Object.assign({}, options, { limit: n, cursor: 0 }));
  return page.items;
}

function deleteMoment(momentId, currentUserId) {
  const id = _trim(momentId);
  const uid = playerIdentityGuard.normalizePlayerUserId(currentUserId);
  if (!id || !uid) return { ok: false, error: 'invalid_args' };
  const doc = _readDoc();
  let target = null;
  let idx = -1;
  for (let i = 0; i < doc.moments.length; i++) {
    if (doc.moments[i] && doc.moments[i].momentId === id) {
      target = doc.moments[i];
      idx = i;
      break;
    }
  }
  if (!target) return { ok: false, error: 'not_found' };
  if (target.status === 'deleted') return { ok: true, alreadyDeleted: true };
  if (
    socialRelationStore.resolveCanonicalUserId(target.authorUserId) !==
    socialRelationStore.resolveCanonicalUserId(uid)
  ) {
    return { ok: false, error: 'forbidden' };
  }
  const images = (target.images || []).slice();
  doc.moments[idx] = Object.assign({}, target, {
    status: 'deleted',
    deletedAt: _now(),
    updatedAt: _now()
  });
  _bumpRevision(doc);
  _writeDoc(doc);
  // 清理本地文件；失败不恢复动态
  try {
    playerMomentMedia.cleanupMomentLocalFiles(images);
  } catch (e) {
    momentDebug('[moment] cleanup failed after delete');
  }
  return { ok: true, revision: String(doc.revision) };
}

function _previewText(content, maxChars) {
  const max = maxChars > 0 ? maxChars : 120;
  const full = String(content == null ? '' : content);
  const arr = Array.from(full);
  if (arr.length <= max) {
    return { preview: full, collapsed: false };
  }
  return { preview: arr.slice(0, max).join('') + '…', collapsed: true };
}

function _formatTimeLabel(ts) {
  const n = Number(ts) || 0;
  if (!n) return '';
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m0 = d.getMonth() + 1;
  const day0 = d.getDate();
  const hh = d.getHours();
  const mm = d.getMinutes();
  const pad = function (x) {
    return x < 10 ? '0' + x : String(x);
  };
  return y + '.' + pad(m0) + '.' + pad(day0) + ' ' + pad(hh) + ':' + pad(mm);
}

/**
 * 批量投影 View Model（备注 map 一次构建）。
 */
function projectMomentsForViewer(moments, viewerUserId, options) {
  const list = Array.isArray(moments) ? moments : [];
  // 可见性过滤不依赖关系 Store；viewer 仅用于备注名 / canDelete 等差异字段
  const viewer = playerIdentityGuard.normalizePlayerUserId(viewerUserId || '');
  const opts = options && typeof options === 'object' ? options : {};
  const authorIds = [];
  list.forEach(function (m) {
    if (m && m.authorUserId) authorIds.push(m.authorUserId);
  });
  let remarkMap = {};
  try {
    remarkMap = playerDisplayName.buildRemarkNameMap(viewer, authorIds) || {};
  } catch (e) {
    remarkMap = {};
  }

  return list
    .filter(function (m) {
      return canViewerSeeMoment(viewer, m, opts);
    })
    .map(function (m) {
      const authorId = m.authorUserId;
      const publicName =
        _trim(m.authorSnapshot && m.authorSnapshot.nickname) || '球友';
      const named = playerDisplayName.resolvePlayerDisplayNameForViewer({
        viewerUserId: viewer,
        targetUserId: authorId,
        publicName: publicName,
        snapshotName: publicName,
        remarkNameMap: remarkMap,
        defaultName: '球友'
      });
      const isSelf =
        viewer &&
        authorId &&
        socialRelationStore.resolveCanonicalUserId
          ? socialRelationStore.resolveCanonicalUserId(viewer) ===
            socialRelationStore.resolveCanonicalUserId(authorId)
          : viewer === authorId;
      const preview = _previewText(m.content, opts.previewMaxChars || 120);
      const canOpenProfile = playerIdentityGuard.isStablePublicUserId(authorId) &&
        !playerIdentityGuard.isGuestPlayerId(authorId) &&
        !playerIdentityGuard.isMaskedPlayerId(authorId);
      // omitFullContent 只省略长正文；图片宫格字段必须保留（含 storageMode）
      const hydrated = playerMomentMedia.hydrateMomentImagesForView(m.images || []);
      const imageVm = playerMomentImageLayout.buildMomentImageLayout(hydrated);
      const relatedView = playerMomentPublishContext.projectRelatedGameForViewer(
        m.relatedGame
      );
      return {
        momentId: m.momentId,
        authorUserId: authorId,
        authorDisplayName: isSelf ? publicName : named.displayName,
        authorPublicName: publicName,
        avatar: _trim(m.authorSnapshot && m.authorSnapshot.avatar),
        content: opts.omitFullContent ? '' : m.content,
        contentPreview: preview.preview,
        isContentCollapsed: preview.collapsed,
        images: imageVm.images,
        imageCount: imageVm.imageCount,
        imageLayout: imageVm.imageLayout,
        singleImageClass: imageVm.singleImageClass,
        singleImageStyle: imageVm.singleImageStyle,
        relatedGame: relatedView,
        moderationStatus: m.moderationStatus || 'local_unreviewed',
        createdAt: m.createdAt,
        timeLabel: _formatTimeLabel(m.createdAt),
        canDelete: !!isSelf,
        canOpenProfile: canOpenProfile,
        showOriginName: !isSelf && !!named.hasRemark,
        originalNickname: named.hasRemark ? named.originalName : ''
      };
    });
}

/**
 * 后台补齐旧图宽高（不改 path/文件）。仅当原 width/height 缺失时写入。
 */
function patchMomentImageDimensions(momentId, mediaId, width, height) {
  const mid = _trim(momentId);
  const midMedia = _trim(mediaId);
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (!mid || !midMedia || !(w > 0) || !(h > 0)) {
    return { ok: false, error: 'invalid' };
  }
  const doc = _readDoc();
  let changed = false;
  for (let i = 0; i < doc.moments.length; i++) {
    const m = doc.moments[i];
    if (!m || m.momentId !== mid) continue;
    const images = Array.isArray(m.images) ? m.images.slice() : [];
    for (let j = 0; j < images.length; j++) {
      const img = images[j];
      if (!img || _trim(img.mediaId) !== midMedia) continue;
      if ((Number(img.width) || 0) > 0 && (Number(img.height) || 0) > 0) {
        return { ok: true, changed: false };
      }
      images[j] = Object.assign({}, img, { width: w, height: h });
      changed = true;
      break;
    }
    if (changed) {
      doc.moments[i] = Object.assign({}, m, {
        images: images,
        updatedAt: _now()
      });
      // 元数据补齐不 bump 列表 revision，避免 feed 全量重载
      _writeDoc(doc);
      return { ok: true, changed: true };
    }
    break;
  }
  return { ok: false, error: 'not_found' };
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  CONTENT_MAX_CHARS: CONTENT_MAX_CHARS,
  IMAGES_MAX: IMAGES_MAX,
  PAGE_SIZE: PAGE_SIZE,
  countChars: countChars,
  sliceChars: sliceChars,
  canViewerSeeMoment: canViewerSeeMoment,
  createMoment: createMoment,
  getMomentById: getMomentById,
  listMomentsByAuthor: listMomentsByAuthor,
  listRecentMomentsByAuthor: listRecentMomentsByAuthor,
  deleteMoment: deleteMoment,
  getMomentRevision: getMomentRevision,
  projectMomentsForViewer: projectMomentsForViewer,
  patchMomentImageDimensions: patchMomentImageDimensions
};
