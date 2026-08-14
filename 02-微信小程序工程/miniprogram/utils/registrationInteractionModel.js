/**
 * 普通单场报名交互文案权威（REG-P0）
 * 只冻结 Modal / Dialog / CTA 字符串，不判断 lifecycle、不写 storage。
 */

var CTA_REGISTER = '立即报名';
var CTA_CANCEL = '取消报名';
var CTA_CLOSED = '报名通道已关闭';

function buildRegistrationClosedModal() {
  return {
    title: '报名通道已关闭',
    content: '报名通道已关闭，请联系组织者',
    showCancel: false,
    confirmText: '知道了'
  };
}

function buildSelfCancelDialogModel(opts) {
  var grouped = !!(opts && opts.grouped);
  if (grouped) {
    return {
      title: '取消报名',
      desc: '已经被分组，是否确认取消',
      cancelText: '取消',
      confirmText: '确认取消'
    };
  }
  return {
    title: '确认取消报名？',
    desc: '取消后，你将从本场赛事报名名单中移除。',
    cancelText: '取消',
    confirmText: '确认取消'
  };
}

function buildPaidCancellationWarningModel() {
  return {
    title: '已收款提醒',
    content: '你已完成本场费用登记。取消报名后，请务必联系赛事组织方协商费用退还。',
    cancelText: '我再想想',
    confirmText: '继续取消'
  };
}

/**
 * @param {string} state register|open|cancel|registered|closed
 */
function resolveRegistrationCtaCopy(state) {
  var s = state != null ? String(state).trim() : '';
  if (s === 'closed') return CTA_CLOSED;
  if (s === 'cancel' || s === 'registered') return CTA_CANCEL;
  return CTA_REGISTER;
}

module.exports = {
  CTA_REGISTER: CTA_REGISTER,
  CTA_CANCEL: CTA_CANCEL,
  CTA_CLOSED: CTA_CLOSED,
  buildRegistrationClosedModal: buildRegistrationClosedModal,
  buildSelfCancelDialogModel: buildSelfCancelDialogModel,
  buildPaidCancellationWarningModel: buildPaidCancellationWarningModel,
  resolveRegistrationCtaCopy: resolveRegistrationCtaCopy
};
