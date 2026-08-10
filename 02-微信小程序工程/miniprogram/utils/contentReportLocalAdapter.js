/**
 * 内容举报本地适配器。
 * 底层仍用 playerContentReportStore；不声称已通知系统审核中心。
 *
 * 远端协议对齐（未来 remote adapter）：
 * submitReport({ targetType, targetId, momentId, reasonCode, description })
 * → { ok, reportId, status: 'pending'|'accepted'|'rejected'|'sync_pending', idempotent, error }
 */
const playerContentReportStore = require('./playerContentReportStore.js');

function _mapSubmitResult(result) {
  if (!result || !result.ok) {
    return {
      ok: false,
      reportId: '',
      status: '',
      idempotent: false,
      error: (result && result.error) || 'submit_failed'
    };
  }
  const report = result.report || {};
  return {
    ok: true,
    reportId: report.reportId || '',
    // 本地 MVP：受理态统一为 pending，不伪造成系统已审核
    status: 'pending',
    idempotent: !!result.idempotent,
    error: ''
  };
}

function submitReport(input) {
  const src = input && typeof input === 'object' ? input : {};
  // 不信任页面传入的 targetAuthorUserId / reporterUserId；Store 自行解析作者与当前用户
  const result = playerContentReportStore.createContentReport({
    targetType: src.targetType,
    targetId: src.targetId,
    momentId: src.momentId,
    reasonCode: src.reasonCode,
    description: src.description
  });
  return _mapSubmitResult(result);
}

function getReportState(targetType, targetId) {
  return playerContentReportStore.getReportState(targetType, targetId);
}

function getReportStateMap(targets) {
  return playerContentReportStore.getReportStateMap(targets);
}

function getReportRevision() {
  return playerContentReportStore.getReportRevision();
}

function getTargetReportRevision(targetType, targetId) {
  return playerContentReportStore.getTargetReportRevision(targetType, targetId);
}

function attachMomentReportStates(cards) {
  return playerContentReportStore.attachMomentReportStates(cards);
}

function attachCommentReportStates(comments) {
  return playerContentReportStore.attachCommentReportStates(comments);
}

module.exports = {
  submitReport: submitReport,
  getReportState: getReportState,
  getReportStateMap: getReportStateMap,
  getReportRevision: getReportRevision,
  getTargetReportRevision: getTargetReportRevision,
  attachMomentReportStates: attachMomentReportStates,
  attachCommentReportStates: attachCommentReportStates,
  REPORT_REASONS: playerContentReportStore.REPORT_REASONS,
  DESCRIPTION_MAX_CHARS: playerContentReportStore.DESCRIPTION_MAX_CHARS,
  countChars: playerContentReportStore.countChars,
  sliceChars: playerContentReportStore.sliceChars
};
