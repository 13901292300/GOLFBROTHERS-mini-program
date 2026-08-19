/**
 * 球友圈评论树：迁移 / 构树 / DFS 展平。
 * 不写私人备注；不递归读 Storage。
 */

const MAX_WALK_DEPTH = 64;
const MAX_VISUAL_DEPTH = 3;
const DEFAULT_DIRECT_PREVIEW = 2;
/** 评论总数不超过此值时详情默认全部展开 */
const AUTO_EXPAND_TOTAL = 40;

function _trim(v) {
  return v == null ? '' : String(v).trim();
}

function _num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function _sortByCreated(a, b) {
  const ta = _num(a && a.createdAt, 0);
  const tb = _num(b && b.createdAt, 0);
  if (ta !== tb) return ta - tb;
  return String((a && a.commentId) || '').localeCompare(String((b && b.commentId) || ''));
}

/**
 * 幂等迁移扁平评论 → parent/root/depth。
 * 保留正文；循环安全断开；父缺失降级为一级并标记 orphan。
 */
function migrateFlatComments(comments) {
  const list = Array.isArray(comments) ? comments.slice() : [];
  const byId = {};
  list.forEach(function (c) {
    if (c && c.commentId) byId[c.commentId] = c;
  });

  const resolved = {};

  function resolveOne(commentId, stack) {
    const id = _trim(commentId);
    if (!id || !byId[id]) {
      return { parentCommentId: '', rootCommentId: id, depth: 0, orphan: false };
    }
    if (resolved[id]) return resolved[id];
    if (stack[id]) {
      // 循环：断开为一级
      const broken = {
        parentCommentId: '',
        rootCommentId: id,
        depth: 0,
        orphan: true
      };
      resolved[id] = broken;
      return broken;
    }
    stack[id] = true;
    const c = byId[id];
    const rawParent = _trim(c.parentCommentId || c.replyToCommentId);
    if (!rawParent) {
      const rootSelf = {
        parentCommentId: '',
        rootCommentId: id,
        depth: 0,
        orphan: false
      };
      resolved[id] = rootSelf;
      delete stack[id];
      return rootSelf;
    }
    if (!byId[rawParent] || rawParent === id) {
      const orphan = {
        parentCommentId: '',
        rootCommentId: id,
        depth: 0,
        orphan: true
      };
      resolved[id] = orphan;
      delete stack[id];
      return orphan;
    }
    if ((stack._depth || 0) > MAX_WALK_DEPTH) {
      const deep = {
        parentCommentId: '',
        rootCommentId: id,
        depth: 0,
        orphan: true
      };
      resolved[id] = deep;
      delete stack[id];
      return deep;
    }
    stack._depth = (stack._depth || 0) + 1;
    const parentMeta = resolveOne(rawParent, stack);
    stack._depth -= 1;
    const meta = {
      parentCommentId: rawParent,
      rootCommentId: parentMeta.rootCommentId || rawParent,
      depth: Math.max(0, (_num(parentMeta.depth, 0) || 0) + 1),
      orphan: !!parentMeta.orphan
    };
    resolved[id] = meta;
    delete stack[id];
    return meta;
  }

  return list.map(function (c) {
    if (!c || !c.commentId) return c;
    const meta = resolveOne(c.commentId, {});
    const parentCommentId = meta.parentCommentId || '';
    let replyToUserId = null;
    let replyToSnapshot = null;
    if (parentCommentId && byId[parentCommentId]) {
      const p = byId[parentCommentId];
      replyToUserId =
        c.replyToUserId ||
        (p.authorUserId != null ? p.authorUserId : null);
      replyToSnapshot =
        c.replyToSnapshot ||
        (p.authorSnapshot
          ? { nickname: _trim(p.authorSnapshot.nickname) || '球友' }
          : { nickname: '球友' });
    }
    return Object.assign({}, c, {
      parentCommentId: parentCommentId,
      rootCommentId: meta.rootCommentId || c.commentId,
      depth: _num(meta.depth, 0),
      orphan: !!meta.orphan,
      // 本批与 parent 对齐
      replyToCommentId: parentCommentId || null,
      replyToUserId: replyToUserId,
      replyToSnapshot: replyToSnapshot
    });
  });
}

/**
 * @param {array} comments 同一 moment 的评论（可含 deleted）
 * @returns {array} 根节点，各含 children[]
 */
function buildMomentCommentTree(comments) {
  const list = Array.isArray(comments) ? comments.filter(Boolean) : [];
  const nodes = {};
  list.forEach(function (c) {
    nodes[c.commentId] = Object.assign({}, c, { children: [] });
  });
  const roots = [];
  list.forEach(function (c) {
    const node = nodes[c.commentId];
    const pid = _trim(c.parentCommentId);
    if (pid && nodes[pid] && pid !== c.commentId) {
      nodes[pid].children.push(node);
    } else {
      roots.push(node);
    }
  });
  function sortRec(n) {
    if (!n || !n.children) return;
    n.children.sort(_sortByCreated);
    n.children.forEach(sortRec);
  }
  roots.sort(_sortByCreated);
  roots.forEach(sortRec);
  return roots;
}

function countActiveDescendants(node) {
  if (!node || !node.children) return 0;
  let n = 0;
  const stack = node.children.slice();
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    if (cur.status !== 'deleted') n += 1;
    if (cur.children && cur.children.length) {
      for (let i = 0; i < cur.children.length; i++) stack.push(cur.children[i]);
    }
  }
  return n;
}

function countDirectChildren(node) {
  if (!node || !node.children) return 0;
  return node.children.length;
}

/**
 * 深度优先展平。
 * options:
 * - expandedRootIds: { [rootId]: true }
 * - expandAll: boolean
 * - directPreview: number 未展开时每线程直接子评论条数
 * - includeDeletedLeaves: 默认 false（无子的已删节点隐藏）
 */
function flattenMomentCommentTree(tree, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const expanded = opts.expandedRootIds && typeof opts.expandedRootIds === 'object'
    ? opts.expandedRootIds
    : {};
  const expandAll = !!opts.expandAll;
  const directPreview =
    opts.directPreview > 0 ? Math.floor(opts.directPreview) : DEFAULT_DIRECT_PREVIEW;
  const includeDeletedLeaves = !!opts.includeDeletedLeaves;
  const roots = Array.isArray(tree) ? tree : [];
  const out = [];

  function pushNode(node, logicalDepth) {
    if (!node) return;
    const depth = Math.max(0, _num(logicalDepth, node.depth) || 0);
    const childCount = countDirectChildren(node);
    const activeDesc = countActiveDescendants(node);
    const isDeleted = node.status === 'deleted';
    if (isDeleted && childCount === 0 && !includeDeletedLeaves) return;

    out.push({
      comment: node,
      depth: depth,
      visualDepth: Math.min(depth, MAX_VISUAL_DEPTH),
      isRoot: depth === 0 || !node.parentCommentId,
      hasChildren: childCount > 0,
      childCount: childCount,
      activeReplyCount: activeDesc,
      isDeleted: isDeleted
    });
  }

  function dfsAll(node, depth) {
    pushNode(node, depth);
    const kids = (node && node.children) || [];
    for (let i = 0; i < kids.length; i++) {
      dfsAll(kids[i], depth + 1);
    }
  }

  roots.forEach(function (root) {
    const rootId = root.commentId;
    const kids = root.children || [];
    const activeDesc = countActiveDescendants(root);
    const shouldExpand = expandAll || !!expanded[rootId] || kids.length <= directPreview;

    pushNode(root, 0);

    if (shouldExpand) {
      for (let i = 0; i < kids.length; i++) {
        dfsAll(kids[i], 1);
      }
      out.push({
        type: 'thread_meta',
        rootCommentId: rootId,
        expanded: true,
        hiddenReplyCount: 0,
        activeReplyCount: activeDesc,
        canCollapse: kids.length > directPreview && !expandAll
      });
    } else {
      const shown = kids.slice(0, directPreview);
      for (let j = 0; j < shown.length; j++) {
        // 折叠态只露出直接子评，不展开其更深子树
        pushNode(shown[j], 1);
      }
      const hidden = Math.max(0, activeDesc - shown.filter(function (k) {
        return k && k.status !== 'deleted';
      }).length);
      out.push({
        type: 'thread_meta',
        rootCommentId: rootId,
        expanded: false,
        hiddenReplyCount: hidden,
        activeReplyCount: activeDesc,
        canCollapse: false
      });
    }
  });

  return out;
}

function shouldAutoExpandAll(activeTotal) {
  return (_num(activeTotal, 0) || 0) <= AUTO_EXPAND_TOTAL;
}

module.exports = {
  MAX_VISUAL_DEPTH: MAX_VISUAL_DEPTH,
  DEFAULT_DIRECT_PREVIEW: DEFAULT_DIRECT_PREVIEW,
  AUTO_EXPAND_TOTAL: AUTO_EXPAND_TOTAL,
  migrateFlatComments: migrateFlatComments,
  buildMomentCommentTree: buildMomentCommentTree,
  flattenMomentCommentTree: flattenMomentCommentTree,
  countActiveDescendants: countActiveDescendants,
  shouldAutoExpandAll: shouldAutoExpandAll
};
