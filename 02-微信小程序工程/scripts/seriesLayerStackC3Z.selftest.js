/**
 * Patch C3-Z：M 面板层级 + isManageOverlayActive
 * 运行：node scripts/seriesLayerStackC3Z.selftest.js
 */

var path = require('path');
var fs = require('fs');

var pageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);
var detailDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'detail'
);
var componentsDir = path.join(__dirname, '..', 'miniprogram', 'components');

var layer = require(path.join(pageDir, 'seriesLayerStack.js'));
var dock = require(path.join(pageDir, 'seriesBottomDockVisibility.js'));

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
var commonWxss = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'styles', 'tournament-common.wxss'),
  'utf8'
);

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

assert(
  '层级常量相对顺序锁定',
  layer.Z_TAB_FIXED_CTA === 140 &&
    layer.Z_M_FAB === 150 &&
    layer.Z_M_L1_OVERLAY === 300 &&
    layer.Z_M_L1_SHEET === 301 &&
    layer.Z_M_L2_HOST === 320 &&
    layer.Z_M_L2_SHEET === 321 &&
    layer.Z_TAB_FIXED_CTA < layer.Z_M_FAB &&
    layer.Z_M_FAB < layer.Z_M_L1_OVERLAY &&
    layer.Z_M_L1_SHEET < layer.Z_M_L2_HOST
);

assert(
  '1/2 WXML：M L1 覆盖 CTA class；CTA 抬升 140',
  pageWxml.indexOf('series-layer-l1-overlay') >= 0 &&
    pageWxml.indexOf('series-layer-l1-sheet') >= 0 &&
    pageWxml.indexOf('series-layer-tab-cta') >= 0 &&
    /z-index:\s*140/.test(pageWxss) &&
    pageWxml.indexOf('!isManageOverlayActive') >= 0
);

assert(
  '3-7 二级组件均在 series-layer-l2-host',
  pageWxml.indexOf('series-layer-l2-host') >= 0 &&
    /series-layer-l2-host[\s\S]*temp-admin-permission-sheet/.test(pageWxml) &&
    /series-layer-l2-host[\s\S]*match-player-management-sheet/.test(pageWxml) &&
    /series-layer-l2-host[\s\S]*match-tee-management-sheet/.test(pageWxml) &&
    /series-layer-l2-host[\s\S]*match-payment-management-sheet/.test(pageWxml) &&
    /series-layer-l2-host[\s\S]*half-course-sheet/.test(pageWxml)
);

assert(
  '8 代报名二级层 class / host',
  pageWxml.indexOf('player-source-sheet') >= 0 &&
    pageWxml.indexOf('series-layer-l2-overlay') >= 0 &&
    pageWxml.indexOf('series-layer-l2-sheet') >= 0 &&
    pageJs.indexOf('registerForOtherSheetVisible') >= 0 &&
    layer.resolveIsManageOverlayActive({ registerForOtherSheetVisible: true }) === true
);

assert(
  '9 一级→二级同帧：_openFromManageSheet = 关一级 + 开二级 + overlay',
  pageJs.indexOf('_openFromManageSheet') >= 0 &&
    pageJs.indexOf('_buildCloseMoreSheetPatch') >= 0 &&
    /_openFromManageSheet:[\s\S]{0,400}_buildCloseMoreSheetPatch/.test(pageJs) &&
    pageJs.indexOf('_openSeriesTempAdminPermissionSheet') >= 0 &&
    /_openSeriesTempAdminPermissionSheet:[\s\S]{0,1200}_openFromManageSheet/.test(
      pageJs
    ) &&
    /_openSeriesHalfCourseSheet:[\s\S]{0,1200}_openFromManageSheet/.test(pageJs)
);

assert(
  '10 overlay 时 pointer-events / 底栏隐藏',
  /pointer-events:\s*none/.test(pageWxss) &&
    pageJs.indexOf('isManageOverlayActive') >= 0 &&
    dock.resolveSeriesBottomDockVisibility({
      activeTab: 'register',
      isStickyTab: true,
      scrollTop: 500,
      tabOffsetTop: 200,
      tabBarHeight: 50,
      headerTotalHeight: 92,
      screenHeight: 667,
      isManageOverlayActive: true,
      register: { cta: { label: '立即报名' } }
    }).showRegisterBottomAction === false
);

assert(
  '11 handler 二次拦截 isManageOverlayActive',
  /onRegisterCtaTap:[\s\S]{0,200}isManageOverlayActive/.test(pageJs) &&
    /openScheduleGroupEditor:[\s\S]{0,200}isManageOverlayActive/.test(pageJs)
);

assert(
  '12 关闭后恢复：_closeManageSecondaryPatch → _syncStickyByScroll',
  /_closeManageSecondaryPatch:[\s\S]{0,350}_syncStickyByScroll/.test(pageJs)
);

assert(
  '13 关闭弹层不重置 TAB/轮次/scroll（reload resetScroll:false 路径保留）',
  pageJs.indexOf('reloadViewModel({ resetScroll: false })') >= 0 &&
    pageJs.indexOf('_openFromManageSheet') >= 0 &&
    !/_openFromManageSheet:[\s\S]{0,500}resetScroll:\s*true/.test(pageJs)
);

assert(
  '14 共享组件默认 z-index 未改（detail 不回归）',
  (function () {
    var ta = fs.readFileSync(
      path.join(componentsDir, 'temp-admin-permission-sheet', 'index.wxss'),
      'utf8'
    );
    var pm = fs.readFileSync(
      path.join(componentsDir, 'match-player-management-sheet', 'index.wxss'),
      'utf8'
    );
    var half = fs.readFileSync(
      path.join(componentsDir, 'half-course-sheet', 'index.wxss'),
      'utf8'
    );
    return (
      ta.indexOf('z-index: 220') >= 0 &&
      pm.indexOf('z-index: 220') >= 0 &&
      half.indexOf('z-index: 210') >= 0 &&
      /tab-scroll-wrap--fixed[\s\S]*?z-index:\s*130/.test(commonWxss)
    );
  })()
);

assert(
  '15 不修改系统 modal 行为（无 wx.showModal z-index 劫持）',
  pageJs.indexOf('showModal') >= 0 &&
    pageJs.indexOf('cover-view') < 0
);

assert(
  'resolveIsManageOverlayActive 覆盖矩阵',
  layer.resolveIsManageOverlayActive({ showMoreSheet: true }) &&
    layer.resolveIsManageOverlayActive({ tempAdminSheetVisible: true }) &&
    layer.resolveIsManageOverlayActive({ playerManageSheetVisible: true }) &&
    layer.resolveIsManageOverlayActive({ teeSheetManageSheetVisible: true }) &&
    layer.resolveIsManageOverlayActive({ paymentManageSheetVisible: true }) &&
    layer.resolveIsManageOverlayActive({ halfSheetVisible: true }) &&
    layer.resolveIsManageOverlayActive({ showLeaderboardSettingSheet: true }) &&
    layer.resolveIsManageOverlayActive({}) === false
);

assert(
  'WXSS L1/L2 数值',
  /series-layer-l1-overlay[\s\S]*?z-index:\s*300/.test(pageWxss) &&
    /series-layer-l1-sheet[\s\S]*?z-index:\s*301/.test(pageWxss) &&
    /series-layer-l2-host[\s\S]*?z-index:\s*320/.test(pageWxss) &&
    /series-layer-m-fab[\s\S]*?z-index:\s*150/.test(pageWxss)
);

assert(
  '一级切二级顺序：先 overlay 再关一级（_openFromManageSheet 注释/实现）',
  pageJs.indexOf('同帧 isManageOverlayActive=true + 关一级 + 开二级') >= 0 ||
    pageJs.indexOf('强制先占住 overlay') >= 0
);

console.log('');
console.log('C3-Z selftest: passed=' + passed + ' failed=' + failed);
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
