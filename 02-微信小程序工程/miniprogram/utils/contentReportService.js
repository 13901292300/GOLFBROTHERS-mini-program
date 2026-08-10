/**
 * 内容举报统一服务（球友圈正式边界）。
 *
 * 页面只依赖本模块，不得直接调用 playerContentReportStore。
 * 当前固定本地适配器；未来接入远端时仅替换 adapter，不改页面。
 *
 * 远端 submitReport 约定：
 *   input: { targetType: 'moment'|'comment', targetId, momentId?, reasonCode, description? }
 *   result: { ok, reportId, status: 'pending'|'accepted'|'rejected'|'sync_pending', idempotent, error }
 *
 * 安全（由适配器/Store 落实，本层不信任页面作者字段）：
 * - 举报人取当前正式身份
 * - 不能举报自己
 * - 作者从真实 Store 解析
 * - 忽略 targetAuthorUserId
 * - 同一举报人+目标幂等
 * - description 长度限制 / reasonCode 必须有效
 */
const localAdapter = require('./contentReportLocalAdapter.js');

let _adapter = localAdapter;

/**
 * 预留：切换适配器。当前产品路径不调用；默认始终为本地适配器。
 * @param {object} adapter
 */
function setAdapter(adapter) {
  if (!adapter || typeof adapter.submitReport !== 'function') {
    throw new Error('contentReportService.setAdapter: invalid adapter');
  }
  _adapter = adapter;
}

function _currentAdapter() {
  return _adapter || localAdapter;
}

/**
 * @param {{
 *   targetType: 'moment'|'comment',
 *   targetId: string,
 *   momentId?: string,
 *   reasonCode: string,
 *   description?: string
 * }} input
 * @returns {Promise<{
 *   ok: boolean,
 *   reportId: string,
 *   status: string,
 *   idempotent: boolean,
 *   error: string
 * }>}
 */
function submitReport(input) {
  const src = input && typeof input === 'object' ? input : {};
  // 剥离不可信字段，防止页面伪造作者/举报人
  const safeInput = {
    targetType: src.targetType,
    targetId: src.targetId,
    momentId: src.momentId,
    reasonCode: src.reasonCode,
    description: src.description
  };
  const adapter = _currentAdapter();
  return Promise.resolve()
    .then(function () {
      return adapter.submitReport(safeInput);
    })
    .then(function (result) {
      if (!result || typeof result !== 'object') {
        return {
          ok: false,
          reportId: '',
          status: '',
          idempotent: false,
          error: 'submit_failed'
        };
      }
      return {
        ok: !!result.ok,
        reportId: result.reportId || '',
        status: result.status || '',
        idempotent: !!result.idempotent,
        error: result.error || ''
      };
    });
}

function getReportState(targetType, targetId) {
  return _currentAdapter().getReportState(targetType, targetId);
}

function getReportStateMap(targets) {
  return _currentAdapter().getReportStateMap(targets);
}

function getReportRevision() {
  return _currentAdapter().getReportRevision();
}

function getTargetReportRevision(targetType, targetId) {
  return _currentAdapter().getTargetReportRevision(targetType, targetId);
}

function attachMomentReportStates(cards) {
  return _currentAdapter().attachMomentReportStates(cards);
}

function attachCommentReportStates(comments) {
  return _currentAdapter().attachCommentReportStates(comments);
}

/** UI 元数据（原因列表 / 字数工具），不暴露 Store */
const REPORT_REASONS = localAdapter.REPORT_REASONS;
const DESCRIPTION_MAX_CHARS = localAdapter.DESCRIPTION_MAX_CHARS;

function countChars(text) {
  return localAdapter.countChars(text);
}

function sliceChars(text, max) {
  return localAdapter.sliceChars(text, max);
}

function formatSubmitError(error) {
  const err = error || '';
  if (err === 'cannot_report_self') return '不能举报自己';
  if (err === 'invalid_reporter') return '当前身份无法举报';
  if (err === 'reason_required') return '请选择举报原因';
  return '举报失败，请重试';
}

module.exports = {
  setAdapter: setAdapter,
  submitReport: submitReport,
  getReportState: getReportState,
  getReportStateMap: getReportStateMap,
  getReportRevision: getReportRevision,
  getTargetReportRevision: getTargetReportRevision,
  attachMomentReportStates: attachMomentReportStates,
  attachCommentReportStates: attachCommentReportStates,
  REPORT_REASONS: REPORT_REASONS,
  DESCRIPTION_MAX_CHARS: DESCRIPTION_MAX_CHARS,
  countChars: countChars,
  sliceChars: sliceChars,
  formatSubmitError: formatSubmitError
};
