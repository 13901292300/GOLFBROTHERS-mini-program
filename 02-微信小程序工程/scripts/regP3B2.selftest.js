/**
 * REG-P3-B2：Series 本人取消页面薄接线
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/regP3B2.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var pageDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');
var utilsDir = path.join(mini, 'utils');

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageJson = JSON.parse(fs.readFileSync(path.join(pageDir, 'index.json'), 'utf8'));
var detailJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');
var model = require(seriesTestPaths.util('registrationInteractionModel.js'));

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

function sliceFn(src, name, nextName) {
  var start = src.indexOf(name + ': function');
  if (start < 0) return '';
  var end = nextName ? src.indexOf(nextName + ': function', start + 1) : src.length;
  if (end < 0) end = src.length;
  return src.slice(start, end);
}

var onLoadBody = sliceFn(pageJs, 'onLoad', 'onUnload');
var openBody = sliceFn(pageJs, 'openCancelRegisterModal', 'closeCancelRegisterModal');
var closeBody = sliceFn(pageJs, 'closeCancelRegisterModal', 'confirmCancelRegistration');
var confirmBody = sliceFn(pageJs, 'confirmCancelRegistration', '_measureStandingsExpandedPanelHeight');
var reloadBody = sliceFn(pageJs, 'reloadViewModel', '_cacheFillerForActiveTab');
var proxyConfirm = sliceFn(pageJs, 'confirmProxyRegistration', 'setRegistrationState');

var ungrouped = model.buildSelfCancelDialogModel({ grouped: false });
var grouped = model.buildSelfCancelDialogModel({ grouped: true });

assert(
  '消费 B1 orchestrator',
  pageJs.indexOf('seriesSelfCancellationOrchestrator') >= 0 &&
    pageJs.indexOf('createSeriesSelfCancellationOrchestrator') >= 0
);

assert(
  '首次加载 VM 前恢复 journal',
  onLoadBody.indexOf('_recoverInterruptedSelfCancellationOnce') >= 0 &&
    onLoadBody.indexOf('recoverInterruptedSelfCancellation') >= 0 &&
    onLoadBody.indexOf('_recoverInterruptedSelfCancellationOnce') <
      onLoadBody.indexOf('_beginAccessGateFlow') &&
    reloadBody.indexOf('recoverInterruptedSelfCancellation') < 0
);

assert(
  '点取消先 inspect',
  openBody.indexOf('inspectSelfCancellationImpact') >= 0 ||
    openBody.indexOf('_inspectSelfCancelImpact') >= 0
);

assert(
  'grouped 文案走共享弹窗',
  pageJs.indexOf('REG_SELF_CANCEL_UNGROUPED') >= 0 &&
    pageJs.indexOf('REG_SELF_CANCEL_GROUPED') >= 0 &&
    openBody.indexOf('REG_SELF_CANCEL_GROUPED') >= 0 &&
    openBody.indexOf('REG_SELF_CANCEL_UNGROUPED') >= 0 &&
    ungrouped.desc === '取消后，你将从本场赛事报名名单中移除。' &&
    grouped.desc === '已经被分组，是否确认取消' &&
    openBody.indexOf('wx.showModal') < 0
);

assert(
  '成绩 / managed 失败不开弹窗',
  openBody.indexOf('player_has_real_score') >= 0 &&
    openBody.indexOf('managed_station_invalid') >= 0 &&
    pageJs.indexOf('该球员已有比赛成绩，暂不可取消报名') >= 0 &&
    pageJs.indexOf('本轮比赛数据异常') >= 0 &&
    /player_has_real_score[\s\S]{0,180}registerCancelModalVisible:\s*true/.test(openBody) ===
      false
);

assert(
  '确认走 B1 编排，不再直接 cancelSelfRegistration',
  confirmBody.indexOf('cancelSelfRegistrationWithStationCleanup') >= 0 &&
    confirmBody.indexOf('_registrationService.cancelSelfRegistration') < 0 &&
    /_registrationService\s*\.\s*cancelSelfRegistration\s*\(/.test(pageJs) === false
);

assert(
  '成功 toast + 轻量刷新保持滚动',
  confirmBody.indexOf("title: '已取消报名'") >= 0 &&
    confirmBody.indexOf("icon: 'success'") >= 0 &&
    confirmBody.indexOf('reloadViewModel({ resetScroll: false })') >= 0 &&
    confirmBody.indexOf('reLaunch') < 0
);

assert(
  '冲突/关闭/completed/storage/recovery 走现有映射',
  confirmBody.indexOf('_handleRegistrationConflict') >= 0 &&
    confirmBody.indexOf('_toastRegisterFailure') >= 0 &&
    pageJs.indexOf('storage_failed') >= 0 &&
    pageJs.indexOf('recovery_required') >= 0 &&
    pageJs.indexOf("registration_closed: registrationInteractionModel.resolveRegistrationCtaCopy('closed')") >= 0 &&
    pageJs.indexOf("series_completed: '赛事已完赛'") >= 0
);

assert(
  '取消/遮罩零写入；连点锁与 unload 保留',
  closeBody.indexOf('cancelSelfRegistration') < 0 &&
    closeBody.indexOf('cancelSelfRegistrationWithStationCleanup') < 0 &&
    closeBody.indexOf('upsertSeries') < 0 &&
    openBody.indexOf('_registerWriteLock') >= 0 &&
    confirmBody.indexOf('_registerWriteLock') >= 0 &&
    confirmBody.indexOf('_pageAlive') >= 0 &&
    openBody.indexOf('_pageAlive') >= 0
);

assert(
  '不进代取消、不改普通 detail / WXML 组件',
  confirmBody.indexOf('cancelRegistrationForOther') < 0 &&
    confirmBody.indexOf('applyProxyCommitPlan') < 0 &&
    proxyConfirm.indexOf('cancelSelfRegistrationWithStationCleanup') < 0 &&
    detailJs.indexOf('seriesSelfCancellationOrchestrator') < 0 &&
    pageJson.usingComponents['registration-cancel-dialog'] ===
      '/components/registration-cancel-dialog/index' &&
    pageWxml.indexOf('bind:cancel="closeCancelRegisterModal"') >= 0 &&
    pageWxml.indexOf('bind:confirm="confirmCancelRegistration"') >= 0
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failures.length) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
