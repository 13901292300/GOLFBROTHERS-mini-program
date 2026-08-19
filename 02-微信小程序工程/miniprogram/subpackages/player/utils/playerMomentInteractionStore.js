/**
 * 球友圈点赞 / 评论 Store（本地 MVP）。
 * Storage: gb_player_moment_interactions_v1
 * 不写入私人备注；互动名单/评论公开全集（非好友交集）；查询经 canViewerSeeMomentInteraction。
 */

const STORAGE_KEY = 'gb_player_moment_interactions_v1';
/** v2：评论树 parent/root/depth */
const DOC_VERSION = 2;
const COMMENT_MAX_CHARS = 500;
const COMMENT_PAGE_SIZE = 20;
/** feed 点赞头像预览上限 */
const LIKE_AVATAR_PREVIEW_MAX = 8;
const COMMENT_PREVIEW_MAX = 3;
const LIKE_LIST_MAX = 200;

const playerIdentityGuard = require('../../../utils/playerIdentityGuard.js');
const socialRelationStore = require('../../../utils/socialRelationStore.js');
const publicPlayerProfile = require('./publicPlayerProfile.js');
const playerDisplayName = require('../../../utils/playerDisplayName.js');
const playerMomentStore = require('./playerMomentStore.js');
const playerMomentCommentTree = require('./playerMomentCommentTree.js');
const userProfileStore = require('../../../utils/userProfileStore.js');
const DEFAULT_PLAYER_AVATAR = userProfileStore.DEFAULT_AVATAR;

const IX_DEBUG = false;
function ixDebug() {
  if (!IX_DEBUG) return;
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

function _canon(userId) {
  return socialRelationStore.resolveCanonicalUserId(
    playerIdentityGuard.normalizePlayerUserId(userId)
  );
}

function _sameUser(a, b) {
  const ca = _canon(a);
  const cb = _canon(b);
  return !!(ca && cb && ca === cb);
}

function _isActableUser(userId) {
  const id = playerIdentityGuard.normalizePlayerUserId(userId);
  if (!playerIdentityGuard.isStablePublicUserId(id)) return false;
  if (playerIdentityGuard.isGuestPlayerId(id)) return false;
  if (playerIdentityGuard.isMaskedPlayerId(id)) return false;
  return true;
}

/**
 * 点赞/评论条目公开可见（非好友圈、不做共同好友过滤）。
 * 不读取 socialRelationStore / contactFollowAction / following / friend。
 * - 脏数据：guest/masked actor 不进入公开名单（与能否互动一致，与查看者关系无关）
 * - 预留：未来拉黑双向隔离（options.blockedUserIds）
 * 举报 pending 不隐藏互动。
 */
function canViewerSeeMomentInteraction(viewerUserId, actorUserId, options) {
  const actor = playerIdentityGuard.normalizePlayerUserId(actorUserId);
  if (!actor) return false;
  // 身份合法性，不是好友门控；对所有查看者结果一致
  if (
    !playerIdentityGuard.isStablePublicUserId(actor) ||
    playerIdentityGuard.isGuestPlayerId(actor) ||
    playerIdentityGuard.isMaskedPlayerId(actor)
  ) {
    return false;
  }
  const blocked =
    options && Array.isArray(options.blockedUserIds) ? options.blockedUserIds : [];
  if (blocked.length) {
    const viewer = playerIdentityGuard.normalizePlayerUserId(viewerUserId);
    const a = _trim(actor);
    const v = _trim(viewer);
    for (let i = 0; i < blocked.length; i++) {
      const b = _trim(blocked[i]);
      if (b && (b === a || b === v)) return false;
    }
  }
  return true;
}

function _emptyDoc() {
  return {
    version: DOC_VERSION,
    likes: [],
    comments: [],
    revision: 1,
    momentRevisions: {}
  };
}

function _normalizeUserSnapshot(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    nickname: _trim(s.nickname) || '球友',
    avatar: _trim(s.avatar)
  };
}

function _normalizeReplySnapshot(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return { nickname: _trim(s.nickname) || '球友' };
}

function _normalizeLike(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const likeId = _trim(raw.likeId);
  const momentId = _trim(raw.momentId);
  const userId = playerIdentityGuard.normalizePlayerUserId(raw.userId);
  if (!likeId || !momentId || !userId) return null;
  const status = _trim(raw.status) === 'inactive' ? 'inactive' : 'active';
  return {
    likeId: likeId,
    momentId: momentId,
    userId: userId,
    userSnapshot: _normalizeUserSnapshot(raw.userSnapshot),
    status: status,
    createdAt: Number(raw.createdAt) || 0,
    updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || 0
  };
}

function _normalizeComment(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const commentId = _trim(raw.commentId);
  const momentId = _trim(raw.momentId);
  const authorUserId = playerIdentityGuard.normalizePlayerUserId(raw.authorUserId);
  if (!commentId || !momentId || !authorUserId) return null;
  const status = _trim(raw.status) === 'deleted' ? 'deleted' : 'active';
  const parentCommentId = _trim(raw.parentCommentId || raw.replyToCommentId);
  const replyToCommentId = parentCommentId || _trim(raw.replyToCommentId) || '';
  const replyToUserId = replyToCommentId
    ? playerIdentityGuard.normalizePlayerUserId(raw.replyToUserId) || null
    : null;
  let rootCommentId = _trim(raw.rootCommentId);
  if (!rootCommentId) rootCommentId = parentCommentId ? '' : commentId;
  let depth = Number(raw.depth);
  if (!(depth >= 0) || !Number.isFinite(depth)) {
    depth = parentCommentId ? -1 : 0; // -1：待迁移
  }
  return {
    commentId: commentId,
    momentId: momentId,
    authorUserId: authorUserId,
    authorSnapshot: _normalizeUserSnapshot(raw.authorSnapshot),
    content: String(raw.content == null ? '' : raw.content),
    parentCommentId: parentCommentId,
    rootCommentId: rootCommentId,
    depth: depth,
    orphan: !!raw.orphan,
    replyToCommentId: replyToCommentId || null,
    replyToUserId: replyToUserId,
    replyToSnapshot: replyToCommentId
      ? _normalizeReplySnapshot(raw.replyToSnapshot)
      : null,
    status: status,
    createdAt: Number(raw.createdAt) || 0,
    updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || 0,
    deletedAt: status === 'deleted' ? Number(raw.deletedAt) || 0 : null
  };
}

function _needsCommentTreeMigration(comments, version) {
  if (Number(version) < DOC_VERSION) return true;
  for (let i = 0; i < comments.length; i++) {
    const c = comments[i];
    if (!c) continue;
    if (!c.rootCommentId) return true;
    if (!(c.depth >= 0) || c.depth === -1) return true;
  }
  return false;
}

function _readDoc() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw || typeof raw !== 'object') return _emptyDoc();
    const likeSeen = {};
    const likes = [];
    (Array.isArray(raw.likes) ? raw.likes : []).forEach(function (item) {
      const like = _normalizeLike(item);
      if (!like) return;
      const key = like.momentId + '\0' + _canon(like.userId);
      if (likeSeen[key]) return;
      likeSeen[key] = true;
      likes.push(like);
    });
    const commentSeen = {};
    let comments = [];
    (Array.isArray(raw.comments) ? raw.comments : []).forEach(function (item) {
      const c = _normalizeComment(item);
      if (!c || commentSeen[c.commentId]) return;
      commentSeen[c.commentId] = true;
      comments.push(c);
    });
    const storedVersion = Number(raw.version) || 1;
    let version = storedVersion;
    let migrated = false;
    if (_needsCommentTreeMigration(comments, storedVersion)) {
      comments = playerMomentCommentTree.migrateFlatComments(comments);
      version = DOC_VERSION;
      migrated = true;
    }
    const momentRevisions =
      raw.momentRevisions && typeof raw.momentRevisions === 'object'
        ? raw.momentRevisions
        : {};
    const doc = {
      version: version,
      likes: likes,
      comments: comments,
      revision: Number(raw.revision) > 0 ? Number(raw.revision) : 1,
      momentRevisions: momentRevisions
    };
    if (migrated) {
      _writeDoc(doc);
    }
    return doc;
  } catch (e) {
    return _emptyDoc();
  }
}

function _writeDoc(doc) {
  try {
    wx.setStorageSync(STORAGE_KEY, {
      version: DOC_VERSION,
      likes: Array.isArray(doc.likes) ? doc.likes : [],
      comments: Array.isArray(doc.comments) ? doc.comments : [],
      revision: Number(doc.revision) > 0 ? Number(doc.revision) : 1,
      momentRevisions:
        doc.momentRevisions && typeof doc.momentRevisions === 'object'
          ? doc.momentRevisions
          : {}
    });
  } catch (e) {
    ixDebug('[moment-ix] write failed');
  }
}

function _bump(doc, momentId) {
  doc.revision = (Number(doc.revision) || 0) + 1;
  if (momentId) {
    if (!doc.momentRevisions || typeof doc.momentRevisions !== 'object') {
      doc.momentRevisions = {};
    }
    const prev = Number(doc.momentRevisions[momentId]) || 0;
    doc.momentRevisions[momentId] = prev + 1;
  }
}

function getInteractionRevision() {
  return String(_readDoc().revision || 1);
}

function getMomentInteractionRevision(momentId) {
  const id = _trim(momentId);
  if (!id) return '0';
  const doc = _readDoc();
  return String((doc.momentRevisions && doc.momentRevisions[id]) || 0);
}

function getMomentInteractionRevisions(momentIds) {
  const ids = Array.isArray(momentIds) ? momentIds : [];
  const doc = _readDoc();
  const out = {};
  ids.forEach(function (raw) {
    const id = _trim(raw);
    if (!id) return;
    out[id] = String((doc.momentRevisions && doc.momentRevisions[id]) || 0);
  });
  return { revision: String(doc.revision || 1), momentRevisions: out };
}

function _buildPublicSnapshot(userId) {
  let nickname = '';
  let avatar = '';
  try {
    const profile = publicPlayerProfile.resolvePublicPlayerProfile(userId, {});
    nickname = _trim((profile && (profile.nickname || profile.displayName)) || '');
    avatar = _trim((profile && profile.avatar) || '');
  } catch (e) { /* ignore */ }
  return { nickname: nickname || '球友', avatar: avatar };
}

function _resolveVisibleMoment(momentId, viewerUserId) {
  const id = _trim(momentId);
  if (!id) return { ok: false, error: 'invalid_moment' };
  const moment = playerMomentStore.getMomentById(id, { includeDeleted: true });
  if (!moment) return { ok: false, error: 'not_found' };
  if (moment.status === 'deleted') return { ok: false, error: 'deleted' };
  if (!playerMomentStore.canViewerSeeMoment(viewerUserId, moment)) {
    return { ok: false, error: 'invisible' };
  }
  return { ok: true, moment: moment };
}

function _findLike(doc, momentId, userId) {
  const mid = _trim(momentId);
  const uid = _canon(userId);
  for (let i = 0; i < doc.likes.length; i++) {
    const like = doc.likes[i];
    if (like && like.momentId === mid && _canon(like.userId) === uid) {
      return { like: like, index: i };
    }
  }
  return null;
}

function likeMoment(momentId, currentUserId) {
  const uid = playerIdentityGuard.normalizePlayerUserId(
    currentUserId || socialRelationStore.resolveCurrentUserId()
  );
  if (!_isActableUser(uid)) return { ok: false, error: 'invalid_user' };
  const visible = _resolveVisibleMoment(momentId, uid);
  if (!visible.ok) return { ok: false, error: visible.error };
  const mid = _trim(momentId);
  const doc = _readDoc();
  const found = _findLike(doc, mid, uid);
  const ts = _now();
  if (found) {
    if (found.like.status === 'active') {
      return {
        ok: true,
        idempotent: true,
        like: found.like,
        revision: String(doc.revision),
        momentRevision: String((doc.momentRevisions && doc.momentRevisions[mid]) || 0)
      };
    }
    doc.likes[found.index] = Object.assign({}, found.like, {
      status: 'active',
      updatedAt: ts,
      userSnapshot: _buildPublicSnapshot(uid)
    });
  } else {
    doc.likes.push({
      likeId: 'like_' + ts.toString(36) + '_' + Math.random().toString(36).slice(2, 8),
      momentId: mid,
      userId: uid,
      userSnapshot: _buildPublicSnapshot(uid),
      status: 'active',
      createdAt: ts,
      updatedAt: ts
    });
  }
  _bump(doc, mid);
  _writeDoc(doc);
  return {
    ok: true,
    like: _findLike(doc, mid, uid).like,
    revision: String(doc.revision),
    momentRevision: String(doc.momentRevisions[mid] || 0)
  };
}

function unlikeMoment(momentId, currentUserId) {
  const uid = playerIdentityGuard.normalizePlayerUserId(
    currentUserId || socialRelationStore.resolveCurrentUserId()
  );
  if (!_isActableUser(uid)) return { ok: false, error: 'invalid_user' };
  const mid = _trim(momentId);
  if (!mid) return { ok: false, error: 'invalid_moment' };
  // 取消点赞：动态已删时仍允许幂等 inactive，避免卡死
  const doc = _readDoc();
  const found = _findLike(doc, mid, uid);
  if (!found || found.like.status === 'inactive') {
    return {
      ok: true,
      idempotent: true,
      revision: String(doc.revision),
      momentRevision: String((doc.momentRevisions && doc.momentRevisions[mid]) || 0)
    };
  }
  const ts = _now();
  doc.likes[found.index] = Object.assign({}, found.like, {
    status: 'inactive',
    updatedAt: ts
  });
  _bump(doc, mid);
  _writeDoc(doc);
  return {
    ok: true,
    revision: String(doc.revision),
    momentRevision: String(doc.momentRevisions[mid] || 0)
  };
}

function _activeLikesForMoment(doc, momentId, viewerUserId, options) {
  const mid = _trim(momentId);
  const list = [];
  doc.likes.forEach(function (like) {
    if (!like || like.momentId !== mid || like.status !== 'active') return;
    if (!canViewerSeeMomentInteraction(viewerUserId, like.userId, options)) return;
    list.push(like);
  });
  // 最新点赞在前：createdAt 降序，likeId 兜底（feed/详情一致）
  list.sort(function (a, b) {
    const ta = Number(a.createdAt) || 0;
    const tb = Number(b.createdAt) || 0;
    if (ta !== tb) return tb - ta;
    return String(b.likeId || '').localeCompare(String(a.likeId || ''));
  });
  return list;
}

function _canOpenLikeProfile(userId) {
  return (
    playerIdentityGuard.isStablePublicUserId(userId) &&
    !playerIdentityGuard.isGuestPlayerId(userId) &&
    !playerIdentityGuard.isMaskedPlayerId(userId)
  );
}

function _resolveLikeAvatarUrl(snapshotAvatar) {
  const a = _trim(snapshotAvatar);
  return a || DEFAULT_PLAYER_AVATAR;
}

function _projectLikeAvatar(like) {
  const uid = like && like.userId;
  return {
    userId: uid,
    avatar: _resolveLikeAvatarUrl(like && like.userSnapshot && like.userSnapshot.avatar),
    canOpenProfile: _canOpenLikeProfile(uid)
  };
}

/**
 * 当前用户点赞/取消的乐观头像投影（最新在前；preview≤8；失败由页面回滚）。
 */
function projectOptimisticLikeAvatars(input) {
  const src = input && typeof input === 'object' ? input : {};
  const me = playerIdentityGuard.normalizePlayerUserId(src.userId || '');
  const liked = !!src.liked;
  const prevAvatars = Array.isArray(src.likeAvatars) ? src.likeAvatars : [];
  const prevCount = Math.max(0, Number(src.likeCount) || 0);
  const hasComments = !!src.hasComments;
  let avatars = prevAvatars.filter(function (a) {
    return a && a.userId && !_sameUser(a.userId, me);
  });
  let likeCount = prevCount;
  if (liked && me) {
    const snap = _buildPublicSnapshot(me);
    avatars.unshift({
      userId: me,
      avatar: _resolveLikeAvatarUrl(snap && snap.avatar),
      canOpenProfile: _canOpenLikeProfile(me)
    });
    likeCount = Math.max(prevCount + 1, avatars.length);
  } else if (!liked) {
    likeCount = Math.max(0, prevCount - 1);
  }
  if (avatars.length > LIKE_LIST_MAX) {
    avatars = avatars.slice(0, LIKE_LIST_MAX);
  }
  const likeAvatarPreview = avatars.slice(0, LIKE_AVATAR_PREVIEW_MAX);
  const hiddenLikeCount = Math.max(0, likeCount - likeAvatarPreview.length);
  return {
    likeCount: likeCount,
    likedByCurrentUser: liked,
    likeAvatars: avatars,
    likeAvatarPreview: likeAvatarPreview,
    hiddenLikeCount: hiddenLikeCount,
    hasInteraction: likeCount > 0 || hasComments
  };
}

function getMomentLikeState(momentId, currentUserId) {
  const uid = playerIdentityGuard.normalizePlayerUserId(currentUserId || '');
  const mid = _trim(momentId);
  const doc = _readDoc();
  const likes = _activeLikesForMoment(doc, mid, uid, {});
  const liked = !!(uid && likes.some(function (l) {
    return _sameUser(l.userId, uid);
  }));
  return {
    likeCount: likes.length,
    likedByCurrentUser: liked,
    momentRevision: String((doc.momentRevisions && doc.momentRevisions[mid]) || 0),
    revision: String(doc.revision || 1)
  };
}

function _projectActorName(viewerUserId, actorUserId, snapshotName, remarkMap) {
  const publicName = _trim(snapshotName);
  const named = playerDisplayName.resolvePlayerDisplayNameForViewer({
    viewerUserId: viewerUserId,
    targetUserId: actorUserId,
    publicName: publicName,
    snapshotName: publicName,
    remarkNameMap: remarkMap,
    defaultName: '球友'
  });
  const isSelf = viewerUserId && actorUserId && _sameUser(viewerUserId, actorUserId);
  return {
    displayName: isSelf ? publicName || named.displayName : named.displayName,
    publicName: publicName || '球友',
    canOpenProfile:
      playerIdentityGuard.isStablePublicUserId(actorUserId) &&
      !playerIdentityGuard.isGuestPlayerId(actorUserId) &&
      !playerIdentityGuard.isMaskedPlayerId(actorUserId)
  };
}

function getMomentLikeSummary(momentId, viewerUserId, options) {
  const map = getMomentInteractionSummaryMap([momentId], viewerUserId, options);
  return map[_trim(momentId)] || {
    likeCount: 0,
    likedByCurrentUser: false,
    likeAvatars: [],
    likeAvatarPreview: [],
    hiddenLikeCount: 0,
    commentCount: 0,
    commentPreview: [],
    hasInteraction: false,
    momentRevision: '0'
  };
}

function _activeCommentsForMoment(doc, momentId, viewerUserId, options) {
  const mid = _trim(momentId);
  const list = [];
  doc.comments.forEach(function (c) {
    if (!c || c.momentId !== mid || c.status !== 'active') return;
    if (!canViewerSeeMomentInteraction(viewerUserId, c.authorUserId, options)) return;
    list.push(c);
  });
  list.sort(function (a, b) {
    const ta = Number(a.createdAt) || 0;
    const tb = Number(b.createdAt) || 0;
    if (ta !== tb) return ta - tb;
    return String(a.commentId).localeCompare(String(b.commentId));
  });
  return list;
}

/** 含已删除：用于构树（父删子留） */
function _commentsForMomentTree(doc, momentId, viewerUserId, options) {
  const mid = _trim(momentId);
  const list = [];
  doc.comments.forEach(function (c) {
    if (!c || c.momentId !== mid) return;
    if (!canViewerSeeMomentInteraction(viewerUserId, c.authorUserId, options)) return;
    list.push(c);
  });
  return list;
}

function _projectCommentRow(c, viewer, momentAuthorId, remarkMap, byId) {
  const named = _projectActorName(
    viewer,
    c.authorUserId,
    c.authorSnapshot && c.authorSnapshot.nickname,
    remarkMap
  );
  const parentId = _trim(c.parentCommentId || c.replyToCommentId);
  const isReply = !!parentId;
  let replyToDisplayName = '';
  let replyToCanOpenProfile = false;
  let replyToDeleted = false;
  let replyToUserId = c.replyToUserId || '';
  if (isReply) {
    const parent = parentId ? byId[parentId] : null;
    if (!parent || parent.status === 'deleted') {
      replyToDeleted = true;
    }
    if (c.replyToUserId) {
      const rn = _projectActorName(
        viewer,
        c.replyToUserId,
        c.replyToSnapshot && c.replyToSnapshot.nickname,
        remarkMap
      );
      replyToDisplayName = rn.displayName;
      replyToCanOpenProfile = !replyToDeleted && !!rn.canOpenProfile;
      replyToUserId = c.replyToUserId;
    } else if (!parent) {
      replyToDeleted = true;
    } else {
      const rn2 = _projectActorName(
        viewer,
        parent.authorUserId,
        parent.authorSnapshot && parent.authorSnapshot.nickname,
        remarkMap
      );
      replyToDisplayName = rn2.displayName;
      replyToCanOpenProfile = parent.status !== 'deleted' && !!rn2.canOpenProfile;
      replyToUserId = parent.authorUserId;
    }
  }
  const isCommentAuthor = _sameUser(viewer, c.authorUserId);
  const isMomentAuthor = _sameUser(viewer, momentAuthorId);
  const isDeleted = c.status === 'deleted';
  const canDelete = !isDeleted && (isCommentAuthor || isMomentAuthor);
  const canReportBase =
    !isDeleted && !!viewer && !isCommentAuthor && _isActableUser(viewer);
  const depth = Math.max(0, Number(c.depth) || 0);
  return {
    commentId: c.commentId,
    momentId: c.momentId,
    authorUserId: c.authorUserId,
    authorDisplayName: named.displayName,
    authorPublicName: named.publicName,
    authorCanOpenProfile: named.canOpenProfile,
    avatar: _trim(c.authorSnapshot && c.authorSnapshot.avatar),
    content: isDeleted ? '' : c.content,
    contentPreview: isDeleted ? '' : _trim(c.content),
    isDeleted: isDeleted,
    deletedPlaceholder: isDeleted ? '该评论已删除' : '',
    isReply: isReply,
    parentCommentId: parentId,
    rootCommentId: c.rootCommentId || c.commentId,
    depth: depth,
    visualDepth: Math.min(depth, playerMomentCommentTree.MAX_VISUAL_DEPTH),
    isRoot: !parentId || depth === 0,
    replyToCommentId: parentId || null,
    replyToUserId: replyToUserId,
    replyToDisplayName: replyToDisplayName,
    replyTargetDisplayName: replyToDisplayName,
    replyToCanOpenProfile: replyToCanOpenProfile,
    replyToDeleted: replyToDeleted,
    createdAt: c.createdAt,
    canDelete: canDelete,
    isCommentAuthor: isCommentAuthor,
    isMomentAuthor: isMomentAuthor,
    canReport: canReportBase,
    canOpenProfile: named.canOpenProfile
  };
}

function getMomentCommentCount(momentId, viewerUserId, options) {
  const doc = _readDoc();
  return _activeCommentsForMoment(
    doc,
    momentId,
    playerIdentityGuard.normalizePlayerUserId(viewerUserId || ''),
    options
  ).length;
}

/**
 * 批量摘要：一次读 Store，供 feed 第一页多卡使用。
 */
function getMomentInteractionSummaryMap(momentIds, viewerUserId, options) {
  const ids = Array.isArray(momentIds)
    ? momentIds.map(_trim).filter(Boolean)
    : [];
  // 摘要查询不读 socialRelationStore；viewer 仅用于备注投影与 likedByCurrentUser
  const viewer = playerIdentityGuard.normalizePlayerUserId(viewerUserId || '');
  const opts = options && typeof options === 'object' ? options : {};
  const doc = _readDoc();
  const actorIds = [];
  const out = {};

  ids.forEach(function (mid) {
    const likes = _activeLikesForMoment(doc, mid, viewer, opts);
    const comments = _activeCommentsForMoment(doc, mid, viewer, opts);
    likes.forEach(function (l) {
      if (l.userId) actorIds.push(l.userId);
    });
    comments.forEach(function (c) {
      if (c.authorUserId) actorIds.push(c.authorUserId);
      if (c.replyToUserId) actorIds.push(c.replyToUserId);
    });
    out[mid] = { likes: likes, comments: comments };
  });

  let remarkMap = {};
  try {
    remarkMap = playerDisplayName.buildRemarkNameMap(viewer, actorIds) || {};
  } catch (e) {
    remarkMap = {};
  }

  const result = {};
  ids.forEach(function (mid) {
    const pack = out[mid] || { likes: [], comments: [] };
    const likes = pack.likes;
    const comments = pack.comments;
    const likedByCurrentUser = !!(
      viewer &&
      likes.some(function (l) {
        return _sameUser(l.userId, viewer);
      })
    );
    const likeAvatars = likes.slice(0, LIKE_LIST_MAX).map(_projectLikeAvatar);
    const likeAvatarPreview = likeAvatars.slice(0, LIKE_AVATAR_PREVIEW_MAX);
    const hiddenLikeCount = Math.max(0, likes.length - likeAvatarPreview.length);
    // feed：最多 3 条一级评论；子回复不伪装成一级
    const treeComments = _commentsForMomentTree(doc, mid, viewer, opts);
    const tree = playerMomentCommentTree.buildMomentCommentTree(treeComments);
    const rootPreview = [];
    for (let ri = 0; ri < tree.length && rootPreview.length < COMMENT_PREVIEW_MAX; ri++) {
      const root = tree[ri];
      if (!root || root.status === 'deleted') continue;
      const named = _projectActorName(
        viewer,
        root.authorUserId,
        root.authorSnapshot && root.authorSnapshot.nickname,
        remarkMap
      );
      const replyCount = playerMomentCommentTree.countActiveDescendants(root);
      rootPreview.push({
        commentId: root.commentId,
        authorUserId: root.authorUserId,
        authorDisplayName: named.displayName,
        authorPublicName: named.publicName,
        authorCanOpenProfile: named.canOpenProfile,
        contentPreview: _trim(root.content),
        isReply: false,
        isRoot: true,
        depth: 0,
        visualDepth: 0,
        rootCommentId: root.commentId,
        replyCount: replyCount,
        replyCountLabel: replyCount > 0 ? '查看' + replyCount + '条回复' : ''
      });
    }
    result[mid] = {
      likeCount: likes.length,
      likedByCurrentUser: likedByCurrentUser,
      likeAvatars: likeAvatars,
      likeAvatarPreview: likeAvatarPreview,
      hiddenLikeCount: hiddenLikeCount,
      commentCount: comments.length,
      commentPreview: rootPreview,
      hasInteraction: likes.length > 0 || comments.length > 0,
      momentRevision: String((doc.momentRevisions && doc.momentRevisions[mid]) || 0)
    };
  });
  return result;
}

function createMomentComment(input, currentUserId) {
  const src = input && typeof input === 'object' ? input : {};
  const uid = playerIdentityGuard.normalizePlayerUserId(
    currentUserId || socialRelationStore.resolveCurrentUserId()
  );
  if (!_isActableUser(uid)) return { ok: false, error: 'invalid_user' };
  if (src.authorUserId && !_sameUser(src.authorUserId, uid)) {
    return { ok: false, error: 'author_mismatch' };
  }
  const mid = _trim(src.momentId);
  const visible = _resolveVisibleMoment(mid, uid);
  if (!visible.ok) return { ok: false, error: visible.error };

  let content = String(src.content == null ? '' : src.content).replace(/^\s+|\s+$/g, '');
  if (!content) return { ok: false, error: 'empty_content' };
  if (countChars(content) > COMMENT_MAX_CHARS) {
    return { ok: false, error: 'content_too_long' };
  }

  // 页面只传 parentCommentId（兼容 replyToCommentId）；忽略伪造 depth/root/replyToUserId
  const parentId = _trim(src.parentCommentId || src.replyToCommentId);
  const doc = _readDoc();
  let parentCommentId = '';
  let rootCommentId = '';
  let depth = 0;
  let replyToUserId = null;
  let replyToSnapshot = null;

  if (parentId) {
    const found = _findComment(doc, parentId);
    const parent = found && found.comment;
    if (!parent || parent.momentId !== mid) {
      return { ok: false, error: 'invalid_reply_target' };
    }
    // 允许回复已删除父节点（线程入口仍在）；UI 显示「原评论已删除」
    parentCommentId = parent.commentId;
    rootCommentId = _trim(parent.rootCommentId) || parent.commentId;
    depth = Math.max(0, Number(parent.depth) || 0) + 1;
    if (depth > 64) return { ok: false, error: 'depth_exceeded' };
    replyToUserId = parent.authorUserId;
    replyToSnapshot = {
      nickname: _trim(parent.authorSnapshot && parent.authorSnapshot.nickname) || '球友'
    };
  }

  const ts = _now();
  const commentId =
    'cmt_' + ts.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  if (!parentCommentId) {
    rootCommentId = commentId;
    depth = 0;
  }
  const comment = {
    commentId: commentId,
    momentId: mid,
    authorUserId: uid,
    authorSnapshot: _buildPublicSnapshot(uid),
    content: content,
    parentCommentId: parentCommentId,
    rootCommentId: rootCommentId,
    depth: depth,
    orphan: false,
    replyToCommentId: parentCommentId || null,
    replyToUserId: replyToUserId,
    replyToSnapshot: replyToSnapshot,
    status: 'active',
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null
  };
  doc.comments.push(comment);
  _bump(doc, mid);
  _writeDoc(doc);
  return {
    ok: true,
    comment: comment,
    revision: String(doc.revision),
    momentRevision: String(doc.momentRevisions[mid] || 0)
  };
}

function _findComment(doc, commentId) {
  const id = _trim(commentId);
  for (let i = 0; i < doc.comments.length; i++) {
    if (doc.comments[i] && doc.comments[i].commentId === id) {
      return { comment: doc.comments[i], index: i };
    }
  }
  return null;
}

/**
 * 只读取评论实体（供举报等校验）。默认不含已删除。
 */
function getMomentCommentById(commentId, options) {
  const id = _trim(commentId);
  if (!id) return null;
  const doc = _readDoc();
  const found = _findComment(doc, id);
  if (!found) return null;
  const c = found.comment;
  if (!(options && options.includeDeleted) && c.status === 'deleted') return null;
  return c;
}

function deleteMomentComment(commentId, currentUserId) {
  const uid = playerIdentityGuard.normalizePlayerUserId(
    currentUserId || socialRelationStore.resolveCurrentUserId()
  );
  if (!_isActableUser(uid)) return { ok: false, error: 'invalid_user' };
  const doc = _readDoc();
  const found = _findComment(doc, commentId);
  if (!found) return { ok: false, error: 'not_found' };
  const comment = found.comment;
  if (comment.status === 'deleted') {
    return {
      ok: true,
      alreadyDeleted: true,
      revision: String(doc.revision),
      momentRevision: String((doc.momentRevisions && doc.momentRevisions[comment.momentId]) || 0)
    };
  }
  const moment = playerMomentStore.getMomentById(comment.momentId, {
    includeDeleted: true
  });
  const isCommentAuthor = _sameUser(uid, comment.authorUserId);
  const isMomentAuthor = !!(moment && _sameUser(uid, moment.authorUserId));
  if (!isCommentAuthor && !isMomentAuthor) {
    return { ok: false, error: 'forbidden' };
  }
  const ts = _now();
  doc.comments[found.index] = Object.assign({}, comment, {
    status: 'deleted',
    deletedAt: ts,
    updatedAt: ts,
    content: ''
  });
  _bump(doc, comment.momentId);
  _writeDoc(doc);
  return {
    ok: true,
    momentId: comment.momentId,
    revision: String(doc.revision),
    momentRevision: String(doc.momentRevisions[comment.momentId] || 0)
  };
}

/**
 * 详情：一次读集合 → 构树 → DFS 展平 VM。
 * options.expandedRootIds / expandAll 控制线程展开。
 */
function listMomentComments(momentId, options) {
  const mid = _trim(momentId);
  const opts = options && typeof options === 'object' ? options : {};
  const viewer = playerIdentityGuard.normalizePlayerUserId(opts.viewerUserId || '');
  const doc = _readDoc();
  const moment = playerMomentStore.getMomentById(mid, { includeDeleted: true });
  const momentAuthorId = moment ? moment.authorUserId : '';

  const treeSrc = _commentsForMomentTree(doc, mid, viewer, opts);
  const byId = {};
  treeSrc.forEach(function (c) {
    if (c && c.commentId) byId[c.commentId] = c;
  });
  const activeTotal = treeSrc.filter(function (c) {
    return c && c.status === 'active';
  }).length;

  const tree = playerMomentCommentTree.buildMomentCommentTree(treeSrc);
  const expandAll =
    opts.expandAll != null
      ? !!opts.expandAll
      : playerMomentCommentTree.shouldAutoExpandAll(activeTotal);
  const flat = playerMomentCommentTree.flattenMomentCommentTree(tree, {
    expandedRootIds: opts.expandedRootIds || {},
    expandAll: expandAll,
    directPreview: opts.directPreview
  });

  const actorIds = [];
  treeSrc.forEach(function (c) {
    if (!c) return;
    if (c.authorUserId) actorIds.push(c.authorUserId);
    if (c.replyToUserId) actorIds.push(c.replyToUserId);
  });
  let remarkMap = {};
  try {
    remarkMap = playerDisplayName.buildRemarkNameMap(viewer, actorIds) || {};
  } catch (e) {
    remarkMap = {};
  }

  const items = [];
  flat.forEach(function (row) {
    if (!row) return;
    if (row.type === 'thread_meta') {
      if (row.hiddenReplyCount > 0 || row.canCollapse) {
        items.push({
          rowType: 'thread_toggle',
          commentId: 'toggle_' + row.rootCommentId,
          rootCommentId: row.rootCommentId,
          expanded: !!row.expanded,
          hiddenReplyCount: row.hiddenReplyCount || 0,
          activeReplyCount: row.activeReplyCount || 0,
          canCollapse: !!row.canCollapse,
          toggleLabel: row.expanded
            ? '收起回复'
            : '展开其余' + (row.hiddenReplyCount || 0) + '条回复'
        });
      }
      return;
    }
    const c = row.comment;
    if (!c) return;
    const vm = _projectCommentRow(c, viewer, momentAuthorId, remarkMap, byId);
    vm.depth = row.depth;
    vm.visualDepth = row.visualDepth;
    vm.isRoot = !!row.isRoot;
    vm.hasChildren = !!row.hasChildren;
    vm.childCount = row.childCount || 0;
    vm.activeReplyCount = row.activeReplyCount || 0;
    vm.rowType = 'comment';
    items.push(vm);
  });

  return {
    items: items,
    tree: tree,
    nextCursor: 0,
    hasMore: false,
    total: activeTotal,
    expandAll: expandAll,
    momentRevision: String((doc.momentRevisions && doc.momentRevisions[mid]) || 0),
    revision: String(doc.revision || 1)
  };
}

function attachSummariesToMomentCards(cards, viewerUserId) {
  const list = Array.isArray(cards) ? cards : [];
  if (!list.length) return list;
  const viewer = playerIdentityGuard.normalizePlayerUserId(viewerUserId || '');
  const canInteract = _isActableUser(viewer);
  const ids = list.map(function (c) {
    return c && c.momentId;
  });
  const map = getMomentInteractionSummaryMap(ids, viewer);
  return list.map(function (card) {
    if (!card || !card.momentId) return card;
    const s = map[card.momentId] || {
      likeCount: 0,
      likedByCurrentUser: false,
      likeAvatars: [],
      likeAvatarPreview: [],
      hiddenLikeCount: 0,
      commentCount: 0,
      commentPreview: [],
      momentRevision: '0'
    };
    return Object.assign({}, card, {
      likeCount: s.likeCount,
      likedByCurrentUser: canInteract ? !!s.likedByCurrentUser : false,
      likeAvatars: s.likeAvatars || [],
      likeAvatarPreview: s.likeAvatarPreview || [],
      hiddenLikeCount: s.hiddenLikeCount || 0,
      commentCount: s.commentCount,
      commentPreview: s.commentPreview || [],
      hasInteraction: !!s.hasInteraction,
      interactionRevision: s.momentRevision,
      canInteract: canInteract
    });
  });
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  DOC_VERSION: DOC_VERSION,
  COMMENT_MAX_CHARS: COMMENT_MAX_CHARS,
  COMMENT_PAGE_SIZE: COMMENT_PAGE_SIZE,
  LIKE_AVATAR_PREVIEW_MAX: LIKE_AVATAR_PREVIEW_MAX,
  DEFAULT_PLAYER_AVATAR: DEFAULT_PLAYER_AVATAR,
  countChars: countChars,
  sliceChars: sliceChars,
  canViewerSeeMomentInteraction: canViewerSeeMomentInteraction,
  likeMoment: likeMoment,
  unlikeMoment: unlikeMoment,
  getMomentLikeState: getMomentLikeState,
  getMomentLikeSummary: getMomentLikeSummary,
  getMomentInteractionSummaryMap: getMomentInteractionSummaryMap,
  projectOptimisticLikeAvatars: projectOptimisticLikeAvatars,
  createMomentComment: createMomentComment,
  listMomentComments: listMomentComments,
  getMomentCommentById: getMomentCommentById,
  deleteMomentComment: deleteMomentComment,
  getMomentCommentCount: getMomentCommentCount,
  getInteractionRevision: getInteractionRevision,
  getMomentInteractionRevision: getMomentInteractionRevision,
  getMomentInteractionRevisions: getMomentInteractionRevisions,
  attachSummariesToMomentCards: attachSummariesToMomentCards,
  buildMomentCommentTree: playerMomentCommentTree.buildMomentCommentTree,
  flattenMomentCommentTree: playerMomentCommentTree.flattenMomentCommentTree
};
