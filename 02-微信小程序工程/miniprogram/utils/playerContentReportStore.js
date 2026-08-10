/**
 * 球友圈内容举报 Store（本地 MVP）。
 * Storage: gb_player_content_reports_v1
 * 仅用户投诉入口；不替代内容审核；不通知作者；不删内容。
 */

const STORAGE_KEY = 'gb_player_content_reports_v1';
const DOC_VERSION = 1;
const DESCRIPTION_MAX_CHARS = 200;

const REPORT_REASONS = [
  { code: 'illegal', label: '违法违规' },
  { code: 'porn', label: '色情低俗' },
  { code: 'fraud', label: '欺诈或广告' },
  { code: 'abuse', label: '人身攻击' },
  { code: 'spam', label: '垃圾内容' },
  { code: 'other', label: '其他' }
];

const playerIdentityGuard = require('./playerIdentityGuard.js');
const socialRelationStore = require('./socialRelationStore.js');
const playerMomentStore = require('./playerMomentStore.js');

const REPORT_DEBUG = false;
function reportDebug() {
  if (!REPORT_DEBUG) return;
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
  return { version: DOC_VERSION, reports: [], revision: 1, targetRevisions: {} };
}

function _sameUser(a, b) {
  const ca = socialRelationStore.resolveCanonicalUserId
    ? socialRelationStore.resolveCanonicalUserId(a)
    : _trim(a);
  const cb = socialRelationStore.resolveCanonicalUserId
    ? socialRelationStore.resolveCanonicalUserId(b)
    : _trim(b);
  return !!(ca && cb && ca === cb);
}

function _isActableReporter(userId) {
  const id = playerIdentityGuard.normalizePlayerUserId(userId);
  if (!playerIdentityGuard.isStablePublicUserId(id)) return false;
  if (playerIdentityGuard.isGuestPlayerId(id)) return false;
  if (playerIdentityGuard.isMaskedPlayerId(id)) return false;
  return true;
}

function _reasonByCode(code) {
  const c = _trim(code);
  for (let i = 0; i < REPORT_REASONS.length; i++) {
    if (REPORT_REASONS[i].code === c) return REPORT_REASONS[i];
  }
  return null;
}

function _targetKey(targetType, targetId) {
  return _trim(targetType) + ':' + _trim(targetId);
}

function _normalizeReport(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const reportId = _trim(raw.reportId);
  const reporterUserId = playerIdentityGuard.normalizePlayerUserId(raw.reporterUserId);
  const targetType = _trim(raw.targetType);
  const targetId = _trim(raw.targetId);
  if (!reportId || !reporterUserId || !targetId) return null;
  if (targetType !== 'moment' && targetType !== 'comment') return null;
  const status = _trim(raw.status);
  return {
    reportId: reportId,
    reporterUserId: reporterUserId,
    targetType: targetType,
    targetId: targetId,
    targetAuthorUserId: playerIdentityGuard.normalizePlayerUserId(raw.targetAuthorUserId) || '',
    momentId: _trim(raw.momentId) || '',
    reasonCode: _trim(raw.reasonCode),
    reasonLabel: _trim(raw.reasonLabel),
    description: String(raw.description == null ? '' : raw.description),
    status:
      status === 'resolved' || status === 'rejected' || status === 'pending'
        ? status
        : 'pending',
    createdAt: Number(raw.createdAt) || 0,
    updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || 0
  };
}

function _readDoc() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw || typeof raw !== 'object') return _emptyDoc();
    const list = Array.isArray(raw.reports) ? raw.reports : [];
    const seen = {};
    const reports = [];
    list.forEach(function (item) {
      const r = _normalizeReport(item);
      if (!r || seen[r.reportId]) return;
      seen[r.reportId] = true;
      reports.push(r);
    });
    return {
      version: DOC_VERSION,
      reports: reports,
      revision: Number(raw.revision) > 0 ? Number(raw.revision) : 1,
      targetRevisions:
        raw.targetRevisions && typeof raw.targetRevisions === 'object'
          ? raw.targetRevisions
          : {}
    };
  } catch (e) {
    return _emptyDoc();
  }
}

function _writeDoc(doc) {
  try {
    wx.setStorageSync(STORAGE_KEY, {
      version: DOC_VERSION,
      reports: Array.isArray(doc.reports) ? doc.reports : [],
      revision: Number(doc.revision) > 0 ? Number(doc.revision) : 1,
      targetRevisions:
        doc.targetRevisions && typeof doc.targetRevisions === 'object'
          ? doc.targetRevisions
          : {}
    });
  } catch (e) {
    reportDebug('[report] write failed');
  }
}

function _bump(doc, targetType, targetId) {
  doc.revision = (Number(doc.revision) || 0) + 1;
  if (!doc.targetRevisions || typeof doc.targetRevisions !== 'object') {
    doc.targetRevisions = {};
  }
  const key = _targetKey(targetType, targetId);
  doc.targetRevisions[key] = (Number(doc.targetRevisions[key]) || 0) + 1;
}

function getReportRevision() {
  return String(_readDoc().revision || 1);
}

function getTargetReportRevision(targetType, targetId) {
  const doc = _readDoc();
  const key = _targetKey(targetType, targetId);
  return String((doc.targetRevisions && doc.targetRevisions[key]) || 0);
}

function _findActiveReport(doc, reporterUserId, targetType, targetId) {
  const reporter = playerIdentityGuard.normalizePlayerUserId(reporterUserId);
  const type = _trim(targetType);
  const tid = _trim(targetId);
  if (!reporter || !type || !tid) return null;
  for (let i = 0; i < doc.reports.length; i++) {
    const r = doc.reports[i];
    if (
      r &&
      r.targetType === type &&
      r.targetId === tid &&
      _sameUser(r.reporterUserId, reporter)
    ) {
      return r;
    }
  }
  return null;
}

/**
 * @returns {{ reported: boolean, reportId?: string, status?: string, canReport: boolean }}
 */
function getReportState(targetType, targetId, reporterUserId) {
  const reporter = playerIdentityGuard.normalizePlayerUserId(
    reporterUserId || socialRelationStore.resolveCurrentUserId()
  );
  const type = _trim(targetType);
  const tid = _trim(targetId);
  const canReportBase = _isActableReporter(reporter) && !!type && !!tid;
  if (!canReportBase) {
    return { reported: false, canReport: false };
  }
  const existing = _findActiveReport(_readDoc(), reporter, type, tid);
  if (existing) {
    return {
      reported: true,
      reportId: existing.reportId,
      status: existing.status,
      canReport: false
    };
  }
  return { reported: false, canReport: true };
}

/**
 * @param {Array<{ targetType: string, targetId: string }>} targets
 */
function getReportStateMap(targets, reporterUserId) {
  const list = Array.isArray(targets) ? targets : [];
  const reporter = playerIdentityGuard.normalizePlayerUserId(
    reporterUserId || socialRelationStore.resolveCurrentUserId()
  );
  const map = {};
  if (!list.length) return map;
  const doc = _readDoc();
  const actable = _isActableReporter(reporter);
  list.forEach(function (t) {
    if (!t) return;
    const type = _trim(t.targetType);
    const tid = _trim(t.targetId);
    if (!type || !tid) return;
    const key = _targetKey(type, tid);
    if (map[key]) return;
    if (!actable) {
      map[key] = { reported: false, canReport: false };
      return;
    }
    const existing = _findActiveReport(doc, reporter, type, tid);
    if (existing) {
      map[key] = {
        reported: true,
        reportId: existing.reportId,
        status: existing.status,
        canReport: false
      };
    } else {
      map[key] = { reported: false, canReport: true };
    }
  });
  return map;
}

function _resolveTarget(input) {
  const type = _trim(input && input.targetType);
  const tid = _trim(input && input.targetId);
  if (type === 'moment') {
    const moment = playerMomentStore.getMomentById(tid);
    if (!moment || moment.status === 'deleted') {
      return { ok: false, error: 'target_missing' };
    }
    return {
      ok: true,
      targetType: 'moment',
      targetId: moment.momentId,
      targetAuthorUserId: moment.authorUserId,
      momentId: moment.momentId
    };
  }
  if (type === 'comment') {
    // 运行时加载，避免与 interactionStore 循环依赖
    let comment = null;
    try {
      const ix = require('./playerMomentInteractionStore.js');
      comment = ix.getMomentCommentById ? ix.getMomentCommentById(tid) : null;
    } catch (e) {
      comment = null;
    }
    if (!comment || comment.status === 'deleted') {
      return { ok: false, error: 'target_missing' };
    }
    const momentId = _trim((input && input.momentId) || comment.momentId);
    if (!momentId || momentId !== _trim(comment.momentId)) {
      return { ok: false, error: 'comment_moment_mismatch' };
    }
    const moment = playerMomentStore.getMomentById(momentId, { includeDeleted: true });
    if (!moment || moment.status === 'deleted') {
      return { ok: false, error: 'moment_missing' };
    }
    return {
      ok: true,
      targetType: 'comment',
      targetId: comment.commentId,
      targetAuthorUserId: comment.authorUserId,
      momentId: comment.momentId
    };
  }
  return { ok: false, error: 'invalid_target_type' };
}

/**
 * 创建举报。忽略 input.targetAuthorUserId（防伪造）；作者从 Store 读取。
 * 同一 reporter+type+id 幂等。
 */
function createContentReport(input, reporterUserId) {
  const src = input && typeof input === 'object' ? input : {};
  const currentUserId = playerIdentityGuard.normalizePlayerUserId(
    socialRelationStore.resolveCurrentUserId()
  );
  let reporter = playerIdentityGuard.normalizePlayerUserId(
    reporterUserId || currentUserId
  );
  // 必须以当前正式用户为准，忽略伪造 reporter
  if (!_sameUser(reporter, currentUserId)) {
    reporter = currentUserId;
  }
  if (!_isActableReporter(reporter)) {
    return { ok: false, error: 'invalid_reporter' };
  }

  const reason = _reasonByCode(src.reasonCode);
  if (!reason) {
    return { ok: false, error: 'reason_required' };
  }
  let description = src.description == null ? '' : String(src.description);
  description = description.replace(/^\s+|\s+$/g, '');
  // 「其他」可填说明，非必填；超长截断
  if (countChars(description) > DESCRIPTION_MAX_CHARS) {
    description = sliceChars(description, DESCRIPTION_MAX_CHARS);
  }

  const resolved = _resolveTarget(src);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error || 'target_invalid' };
  }
  if (_sameUser(reporter, resolved.targetAuthorUserId)) {
    return { ok: false, error: 'cannot_report_self' };
  }

  const doc = _readDoc();
  const existing = _findActiveReport(
    doc,
    reporter,
    resolved.targetType,
    resolved.targetId
  );
  if (existing) {
    return {
      ok: true,
      idempotent: true,
      report: existing,
      revision: String(doc.revision),
      targetRevision: getTargetReportRevision(resolved.targetType, resolved.targetId)
    };
  }

  const ts = _now();
  const report = {
    reportId:
      'rpt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10),
    reporterUserId: reporter,
    targetType: resolved.targetType,
    targetId: resolved.targetId,
    // 仅存作者公开 id，不存备注名
    targetAuthorUserId: resolved.targetAuthorUserId,
    momentId: resolved.momentId,
    reasonCode: reason.code,
    reasonLabel: reason.label,
    description: description,
    status: 'pending',
    createdAt: ts,
    updatedAt: ts
  };
  doc.reports.unshift(report);
  _bump(doc, resolved.targetType, resolved.targetId);
  _writeDoc(doc);
  return {
    ok: true,
    idempotent: false,
    report: report,
    revision: String(doc.revision),
    targetRevision: String(
      (doc.targetRevisions &&
        doc.targetRevisions[_targetKey(resolved.targetType, resolved.targetId)]) ||
        0
    )
  };
}

/**
 * 批量挂载动态卡举报态（feed 一次取，禁止逐卡读 Store）。
 */
function attachMomentReportStates(cards, reporterUserId) {
  const list = Array.isArray(cards) ? cards : [];
  if (!list.length) return list;
  const reporter = playerIdentityGuard.normalizePlayerUserId(
    reporterUserId || socialRelationStore.resolveCurrentUserId()
  );
  const targets = list.map(function (c) {
    return c && c.momentId
      ? { targetType: 'moment', targetId: c.momentId }
      : null;
  }).filter(Boolean);
  const stateMap = getReportStateMap(targets, reporter);
  const doc = _readDoc();
  const actable = _isActableReporter(reporter);

  return list.map(function (card) {
    if (!card || !card.momentId) return card;
    const key = _targetKey('moment', card.momentId);
    const st = stateMap[key] || { reported: false, canReport: false };
    const isSelf = !!(
      card.canDelete ||
      (card.authorUserId && _sameUser(reporter, card.authorUserId))
    );
    const canReport = !!(actable && !isSelf && !st.reported);
    return Object.assign({}, card, {
      canReport: canReport,
      reportedByCurrentUser: !!st.reported,
      reportStatus: st.status || '',
      reportRevision: String((doc.targetRevisions && doc.targetRevisions[key]) || 0)
    });
  });
}

/**
 * 批量为评论投影挂载举报态。
 */
function attachCommentReportStates(comments, reporterUserId) {
  const list = Array.isArray(comments) ? comments : [];
  if (!list.length) return list;
  const reporter = playerIdentityGuard.normalizePlayerUserId(
    reporterUserId || socialRelationStore.resolveCurrentUserId()
  );
  const targets = list.map(function (c) {
    return c && c.commentId
      ? { targetType: 'comment', targetId: c.commentId }
      : null;
  }).filter(Boolean);
  const stateMap = getReportStateMap(targets, reporter);
  const actable = _isActableReporter(reporter);

  return list.map(function (c) {
    if (!c || !c.commentId) return c;
    if (c.rowType === 'thread_toggle' || c.isDeleted) {
      return Object.assign({}, c, {
        canReport: false,
        reportedByCurrentUser: false,
        reportStatus: ''
      });
    }
    const key = _targetKey('comment', c.commentId);
    const st = stateMap[key] || { reported: false, canReport: false };
    const isSelf = !!(c.authorUserId && _sameUser(reporter, c.authorUserId));
    const canReport = !!(actable && !isSelf && !st.reported);
    return Object.assign({}, c, {
      canReport: canReport,
      reportedByCurrentUser: !!st.reported,
      reportStatus: st.status || ''
    });
  });
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  DESCRIPTION_MAX_CHARS: DESCRIPTION_MAX_CHARS,
  REPORT_REASONS: REPORT_REASONS,
  countChars: countChars,
  sliceChars: sliceChars,
  getReportRevision: getReportRevision,
  getTargetReportRevision: getTargetReportRevision,
  getReportState: getReportState,
  getReportStateMap: getReportStateMap,
  createContentReport: createContentReport,
  attachMomentReportStates: attachMomentReportStates,
  attachCommentReportStates: attachCommentReportStates
};
