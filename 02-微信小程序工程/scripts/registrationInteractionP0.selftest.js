/**
 * REG-P0：普通报名交互 model / 取消弹窗抽取零回归
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/registrationInteractionP0.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var model = require(path.join(mini, 'utils', 'registrationInteractionModel.js'));
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var compDir = path.join(mini, 'components', 'registration-cancel-dialog');

var detailJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');
var detailWxml = fs.readFileSync(path.join(detailDir, 'index.wxml'), 'utf8');
var detailWxss = fs.readFileSync(path.join(detailDir, 'index.wxss'), 'utf8');
var detailJson = JSON.parse(fs.readFileSync(path.join(detailDir, 'index.json'), 'utf8'));
var compJs = fs.readFileSync(path.join(compDir, 'index.js'), 'utf8');
var compWxml = fs.readFileSync(path.join(compDir, 'index.wxml'), 'utf8');
var compWxss = fs.readFileSync(path.join(compDir, 'index.wxss'), 'utf8');
var seriesJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var seriesWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');
var seriesReg = fs.readFileSync(path.join(mini, 'utils', 'seriesRegistration.js'), 'utf8');

var passed = 0;
var failed = 0;
var failures = [];

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    failures.push(name + (detail ? ' :: ' + detail : ''));
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

var closed = model.buildRegistrationClosedModal();
assert(
  'closed Modal 精确字符串',
  closed.title === '报名通道已关闭' &&
    closed.content === '报名通道已关闭，请联系组织者' &&
    closed.showCancel === false &&
    closed.confirmText === '知道了'
);

var ungrouped = model.buildSelfCancelDialogModel({ grouped: false });
assert(
  '未分组取消 dialog 文案',
  ungrouped.title === '确认取消报名？' &&
    ungrouped.desc === '取消后，你将从本场赛事报名名单中移除。' &&
    ungrouped.cancelText === '取消' &&
    ungrouped.confirmText === '确认取消'
);

var grouped = model.buildSelfCancelDialogModel({ grouped: true });
assert(
  '已分组取消 dialog 文案',
  grouped.title === '取消报名' &&
    grouped.desc === '已经被分组，是否确认取消' &&
    grouped.cancelText === '取消' &&
    grouped.confirmText === '确认取消'
);

var paid = model.buildPaidCancellationWarningModel();
assert(
  '已收款二次提醒',
  paid.title === '已收款提醒' &&
    paid.content ===
      '你已完成本场费用登记。取消报名后，请务必联系赛事组织方协商费用退还。' &&
    paid.cancelText === '我再想想' &&
    paid.confirmText === '继续取消'
);

assert(
  'CTA 三个权威字符串',
  model.resolveRegistrationCtaCopy('register') === '立即报名' &&
    model.resolveRegistrationCtaCopy('open') === '立即报名' &&
    model.resolveRegistrationCtaCopy('cancel') === '取消报名' &&
    model.resolveRegistrationCtaCopy('registered') === '取消报名' &&
    model.resolveRegistrationCtaCopy('closed') === '报名通道已关闭'
);

assert(
  '普通 detail 已消费共享 model/component',
  detailJs.indexOf("require('../../../../utils/registrationInteractionModel.js')") >= 0 &&
    detailJs.indexOf('buildRegistrationClosedModal') >= 0 &&
    detailJs.indexOf('buildSelfCancelDialogModel') >= 0 &&
    detailJs.indexOf('buildPaidCancellationWarningModel') >= 0 &&
    detailJs.indexOf('resolveRegistrationCtaCopy') >= 0 &&
    detailJs.indexOf('openCancelRegisterModal') >= 0 &&
    detailJs.indexOf('confirmCancelRegister') >= 0 &&
    detailJs.indexOf('teamMatchStore.cancelRegistration') >= 0 &&
    detailWxml.indexOf('registerCtaCopy.closed') >= 0 &&
    detailWxml.indexOf('registerCtaCopy.cancel') >= 0 &&
    detailWxml.indexOf('registerCtaCopy.register') >= 0 &&
    detailWxml.indexOf('<registration-cancel-dialog') >= 0 &&
    detailWxml.indexOf('bind:cancel="closeCancelRegisterModal"') >= 0 &&
    detailWxml.indexOf('bind:confirm="confirmCancelRegister"') >= 0 &&
    detailJson.usingComponents &&
    detailJson.usingComponents['registration-cancel-dialog'] ===
      '/components/registration-cancel-dialog/index'
);

assert(
  '页面不再保留第二份取消弹窗 DOM/文案',
  detailWxml.indexOf('class="register-cancel-modal"') < 0 &&
    detailWxml.indexOf('class="register-cancel-dialog"') < 0 &&
    detailWxss.indexOf('.register-cancel-modal') < 0 &&
    detailWxss.indexOf('.register-cancel-dialog') < 0 &&
    detailJs.indexOf("title: '确认取消报名？'") < 0 &&
    detailJs.indexOf("content: '报名通道已关闭，请联系组织者'") < 0 &&
    detailJs.indexOf("title: '已收款提醒'") < 0
);

assert(
  '组件只抛事件、不写不判',
  compWxml.indexOf('bindtap="onMaskTap"') >= 0 &&
    compWxml.indexOf('onCancelTap') >= 0 &&
    compWxml.indexOf('onConfirmTap') >= 0 &&
    compWxml.indexOf('{{cancelText}}') < compWxml.indexOf('{{confirmText}}') &&
    compWxml.indexOf('register-cancel-dialog__btn--danger') >= 0 &&
    compJs.indexOf("triggerEvent('cancel')") >= 0 &&
    compJs.indexOf("triggerEvent('confirm')") >= 0 &&
    compJs.indexOf('teamMatchStore') < 0 &&
    compJs.indexOf('cancelRegistration') < 0 &&
    compJs.indexOf('showToast') < 0 &&
    /z-index:\s*220/.test(compWxss) &&
    /max-width:\s*600rpx/.test(compWxss) &&
    /background:\s*#dc2626/.test(compWxss)
);

assert(
  '普通取消写路径仍存在',
  /confirmCancelRegister\s*\(/.test(detailJs) &&
    detailJs.indexOf('teamMatchStore.cancelRegistration') >= 0 &&
    detailJs.indexOf('deleteTeamMatchSchedule') >= 0 &&
    detailJs.indexOf('paymentManage.isUserPaymentConfirmed') >= 0 &&
    detailJs.indexOf("wx.showToast({ title: '已取消报名'") >= 0
);

assert(
  'P0 普通交互仍在；代取消写路径由后续 Patch 消费',
  detailJs.indexOf('buildRegistrationClosedModal') >= 0 &&
    seriesJs.indexOf('系列赛暂不支持在此取消代报名') < 0
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
