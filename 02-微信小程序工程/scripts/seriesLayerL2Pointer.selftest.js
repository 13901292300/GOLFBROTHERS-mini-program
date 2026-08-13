/**
 * Patch M-L2-POINTER：Series M 二级共享弹窗宿主恢复 pointer-events
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesLayerL2Pointer.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var pageDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
var detailJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');
var detailWxml = fs.readFileSync(path.join(detailDir, 'index.wxml'), 'utf8');
var detailWxss = fs.readFileSync(path.join(detailDir, 'index.wxss'), 'utf8');
var detailJson = fs.readFileSync(path.join(detailDir, 'index.json'), 'utf8');

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

function extractTag(src, tag) {
  var re = new RegExp('<' + tag + '\\b[\\s\\S]*?>', 'g');
  var m = src.match(re);
  return m || [];
}

function hasHostClass(tagSrc) {
  return /\bclass="[^"]*\bseries-layer-l2-component\b/.test(tagSrc);
}

function cssBlock(src, selectorNeedle) {
  var idx = src.indexOf(selectorNeedle);
  if (idx < 0) return '';
  var brace = src.indexOf('{', idx);
  var end = src.indexOf('}', brace);
  if (brace < 0 || end < 0) return '';
  return src.slice(brace + 1, end);
}

var SHARED_TAGS = [
  'player-source-sheet',
  'leaderboard-setting-sheet',
  'temp-admin-permission-sheet',
  'match-player-management-sheet',
  'match-tee-management-sheet',
  'match-payment-management-sheet',
  'half-course-sheet'
];

var hostBlock = cssBlock(pageWxss, '.series-detail-page .series-layer-l2-host');
var compBlock = cssBlock(pageWxss, '.series-detail-page .series-layer-l2-component');

assert(
  '1 host 仍为 pointer-events:none',
  /pointer-events:\s*none/.test(hostBlock) &&
    !/pointer-events:\s*auto/.test(hostBlock)
);

SHARED_TAGS.forEach(function (tag) {
  var tags = extractTag(pageWxml, tag);
  assert(
    '2 共享弹窗挂统一 class：' + tag,
    tags.length === 1 && hasHostClass(tags[0])
  );
});

assert(
  '3 统一 class 为 pointer-events:auto',
  /pointer-events:\s*auto/.test(compBlock) &&
    !/pointer-events:\s*none/.test(compBlock)
);

assert(
  '4 不存在 .series-layer-l2-host > *',
  pageWxss.indexOf('.series-layer-l2-host > *') < 0 &&
    pageWxss.indexOf('.series-layer-l2-host>*') < 0
);

assert(
  '5 visible=false 不形成点击遮挡',
  !/position:\s*fixed/.test(compBlock) &&
    !/inset:\s*0/.test(compBlock) &&
    !/width:\s*100%/.test(compBlock) &&
    !/height:\s*100%/.test(compBlock) &&
    !/top:\s*0/.test(compBlock) &&
    pageWxml.indexOf('class="series-layer-l2-component"') >= 0 &&
    !/<view[^>]*class="[^"]*series-layer-l2-component/.test(pageWxml)
);

assert(
  '6 permission / handler / visible 未改',
  /permission === 'register_for_other'/.test(pageJs) &&
    /this\.openProxyRegisterSheet\(\)/.test(pageJs) &&
    /registerForOtherSheetVisible:\s*true/.test(pageJs) &&
    /permission === 'leaderboard'/.test(pageJs) &&
    /_openSeriesRoundLeaderboardSettingSheet/.test(pageJs) &&
    /showLeaderboardSettingSheet:\s*true/.test(pageJs) &&
    /permission === 'permission_management'/.test(pageJs) &&
    /_openSeriesTempAdminPermissionSheet/.test(pageJs) &&
    /tempAdminSheetVisible:\s*true/.test(pageJs) &&
    /permission === 'manage_players'/.test(pageJs) &&
    /_openSeriesPlayerManageSheet/.test(pageJs) &&
    /playerManageSheetVisible:\s*true/.test(pageJs) &&
    /permission === 'manage_tee_sheet'/.test(pageJs) &&
    /_openSeriesTeeSheetManageSheet/.test(pageJs) &&
    /teeSheetManageSheetVisible:\s*true/.test(pageJs) &&
    /permission === 'manage_payment'/.test(pageJs) &&
    /_openSeriesPaymentManageSheet/.test(pageJs) &&
    /paymentManageSheetVisible:\s*true/.test(pageJs) &&
    /permission === 'edit_half'/.test(pageJs) &&
    /_openSeriesHalfCourseSheet/.test(pageJs) &&
    /halfSheetVisible:\s*true/.test(pageJs)
);

assert(
  '7 普通 detail 文件零修改本补丁 class',
  detailWxml.indexOf('series-layer-l2-component') < 0 &&
    detailWxss.indexOf('series-layer-l2-component') < 0 &&
    detailJs.indexOf('series-layer-l2-component') < 0 &&
    detailJson.indexOf('series-layer-l2-component') < 0
);

assert(
  '8 Series 原生代报名后续层未改',
  /wx:if="\{\{registerForOtherManualVisible\}\}"[\s\S]{0,80}class="manual-sheet-mask series-layer-l2-overlay"/.test(
    pageWxml
  ) &&
    /wx:if="\{\{proxyMemberSourceSheetVisible\}\}"[\s\S]{0,120}class="sheet-overlay series-layer-l2-overlay"/.test(
      pageWxml
    ) &&
    /wx:if="\{\{proxyGroupSheetVisible\}\}"[\s\S]{0,120}class="sheet-overlay series-layer-l2-overlay"/.test(
      pageWxml
    ) &&
    extractTag(pageWxml, 'player-source-sheet')[0].indexOf('series-layer-l2-overlay') < 0
);

assert(
  '9 C3-Z 同帧切换未改',
  /_openFromManageSheet:[\s\S]{0,280}_buildCloseMoreSheetPatch/.test(pageJs) &&
    /patch\.isManageOverlayActive = true/.test(pageJs) &&
    /_commitManageOverlayPatch\(patch, cb\)/.test(pageJs)
);

assert(
  '10 原生 overlay/sheet 恢复规则仍在',
  /series-layer-l2-overlay\.sheet-overlay/.test(pageWxss) &&
    /series-layer-l2-overlay\.manual-sheet-mask/.test(pageWxss) &&
    /series-layer-l2-sheet\.bottom-sheet/.test(pageWxss) &&
    /series-layer-l2-sheet\.manual-sheet/.test(pageWxss) &&
    /series-layer-l2-overlay\.sheet-overlay[\s\S]{0,220}pointer-events:\s*auto/.test(
      pageWxss
    ) &&
    /series-layer-l2-sheet\.bottom-sheet[\s\S]{0,220}pointer-events:\s*auto/.test(
      pageWxss
    )
);

console.log('');
console.log(
  'M-L2-POINTER selftest: ' + passed + ' passed, ' + failed + ' failed'
);
if (failures.length) {
  console.log('');
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
  process.exit(1);
}
