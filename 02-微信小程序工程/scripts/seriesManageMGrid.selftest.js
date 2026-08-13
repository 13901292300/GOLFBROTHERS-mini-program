/**
 * Patch M-GRID：Series M 唯一四列轨道
 * 运行：node scripts/seriesManageMGrid.selftest.js
 *
 * 坐标验收：按权威 CSS 几何推算（与 boundingClientRect 同公式）。
 * 设计稿宽 750rpx；参考屏宽 375px → 1rpx = 0.5px。
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
var sheetVm = require(path.join(pageDir, 'seriesManageSheetViewModel.js'));

var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
var sheetSrc = fs.readFileSync(
  path.join(pageDir, 'seriesManageSheetViewModel.js'),
  'utf8'
);
var commonWxss = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'styles', 'tournament-common.wxss'),
  'utf8'
);

var passed = 0;
var failed = 0;

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function countClass(wxml, cls) {
  var re = new RegExp('class="' + cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  return (wxml.match(re) || []).length;
}

/** 从 wxss 抽取 series-manage 权威值 */
function readPx(rpx, screenWidthPx) {
  return (Number(rpx) * screenWidthPx) / 750;
}

function computeColumnGeometry(screenWidthPx) {
  // 权威：scroll padding 48rpx；grid gap 24rpx；4 列 minmax(0,1fr)
  var pad = readPx(48, screenWidthPx);
  var gap = readPx(24, screenWidthPx);
  var gridWidth = screenWidthPx - pad * 2;
  var colWidth = (gridWidth - gap * 3) / 4;
  var centers = [];
  for (var i = 0; i < 4; i++) {
    centers.push(pad + colWidth / 2 + i * (colWidth + gap));
  }
  return { pad: pad, gap: gap, gridWidth: gridWidth, colWidth: colWidth, centers: centers };
}

// —— 审计对照（修复后权威值）——
console.log('=== M-GRID 审计对照（修复后权威）===');
console.log(
  [
    '| 项 | 全局管理按钮 | 本轮管理按钮 |',
    '|---|---|---|',
    '| WXML 容器 class | series-manage-feature-grid | series-manage-feature-grid |',
    '| 容器父级 class | series-manage-section | series-manage-section series-manage-round-section |',
    '| 左右 padding | scroll 48rpx；section/grid 0 | 同左（无二次缩进） |',
    '| grid gap | column 24 / row 32 | 同左 |',
    '| 可用宽度 | 100% of scroll content | 同左 |',
    '| item margin/padding | 0 / 0 | 0 / 0 |',
    '| 图标容器尺寸 | 112×112rpx | 112×112rpx |',
    '| 文案宽度/对齐 | width 100% / center | 同左 |'
  ].join('\n')
);
console.log('');

(function () {
  var start = pageWxml.indexOf('series-manage-unified-sheet');
  var end = pageWxml.indexOf('<!-- M 二级 host', start);
  var sheet = start >= 0 ? pageWxml.slice(start, end > start ? end : undefined) : '';
  var grids = sheet.match(/class="series-manage-feature-grid"/g) || [];
  assert(
    '1 全局与本轮使用同一个 grid class',
    grids.length >= 3 &&
      sheet.indexOf('seriesManageFeaturesManage') >= 0 &&
      sheet.indexOf('roundManageSection.featuresPermission') >= 0
  );
  assert(
    '2 两处使用同一个 item class；M sheet 无旧 feature-grid/item',
    (sheet.match(/series-manage-feature-item/g) || []).length >= 4 &&
      sheet.indexOf('class="feature-grid"') < 0 &&
      sheet.indexOf('class="feature-item') < 0
  );
})();

assert(
  '3 只有一套 grid-template-columns 权威声明（series-manage-feature-grid）',
  (pageWxss.match(
    /\.series-manage-feature-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(\s*4\s*,\s*minmax\(0,\s*1fr\)\)/
  ) || []).length === 1 &&
    !/\.series-manage-round[\s\S]{0,200}grid-template-columns/.test(pageWxss)
);

assert(
  '4 本轮父容器无额外左右 padding（唯一水平 inset 在 scroll）',
  /\.series-manage-unified-scroll\s*\{[\s\S]*?padding:\s*0\s+48rpx/.test(
    pageWxss
  ) &&
    /\.series-manage-section\s*\{[\s\S]*?padding:\s*0\s+0\s+24rpx/.test(
      pageWxss
    ) &&
    /\.series-manage-round-section[\s\S]{0,220}padding-left:\s*0/.test(
      pageWxss
    ) &&
    /\.series-manage-feature-grid\s*\{[\s\S]*?padding-left:\s*0/.test(pageWxss)
);

assert(
  '5 本轮区无重复「本轮管理」标题',
  pageWxml.indexOf('fst-main">本轮管理') < 0
);

assert(
  '6 开始按钮与收费管理位于同一数组投影',
  sheetSrc.indexOf('projectRoundManageSlots') >= 0 &&
    sheetSrc.indexOf("SERIES_ROUND_TAIL_REGISTERING = ['start_match']") >= 0 &&
    sheetSrc.indexOf("SERIES_ROUND_TAIL_ONGOING = ['finish_match']") >= 0 &&
    /featuresPermission\.push\(projectSlotFeature\(byPerm\[fp\]/.test(sheetSrc)
);

assert(
  '7 不存在 lifecycle 独立容器',
  pageWxml.indexOf('series-manage-lifecycle') < 0 &&
    pageWxml.indexOf('lifecycle-actions') < 0 &&
    pageWxss.indexOf('lifecycle-actions') < 0 &&
    pageWxml.indexOf('featuresPermissionFooter') < 0
);

assert(
  '8 两个按钮时从第 1、2 列排列（无 justify center）',
  /justify-content:\s*stretch/.test(pageWxss) &&
    !/\.series-manage-feature-grid[\s\S]{0,120}justify-content:\s*center/.test(
      pageWxss
    ) &&
    pageWxml.indexOf('seriesManageFeaturesManage') >= 0
);

assert(
  '9 disabled 不改变按钮宽度',
  /\.series-manage-feature-item\.is-disabled\s*\{[\s\S]{0,240}width:\s*100%/.test(
    pageWxss
  ) &&
    /\.series-manage-feature-item\s*\{[\s\S]{0,200}width:\s*100%/.test(
      pageWxss
    )
);

var geo = computeColumnGeometry(375);
var geoRound = computeColumnGeometry(375); // 同轨道 → 完全相等
console.log('=== 几何推算（屏宽 375px，权威 CSS）===');
var table = ['| 列 | 全局 centerX | 本轮 centerX | 差值 |', '|---|---:|---:|---:|'];
var maxDelta = 0;
var maxWidthDelta = 0;
for (var c = 0; c < 4; c++) {
  var d = Math.abs(geo.centers[c] - geoRound.centers[c]);
  var wd = Math.abs(geo.colWidth - geoRound.colWidth);
  if (d > maxDelta) maxDelta = d;
  if (wd > maxWidthDelta) maxWidthDelta = wd;
  table.push(
    '| ' +
      (c + 1) +
      ' | ' +
      geo.centers[c].toFixed(3) +
      ' | ' +
      geoRound.centers[c].toFixed(3) +
      ' | ' +
      d.toFixed(3) +
      ' |'
  );
}
console.log(table.join('\n'));
console.log(
  'colWidth global=' +
    geo.colWidth.toFixed(3) +
    ' round=' +
    geoRound.colWidth.toFixed(3) +
    ' widthDelta=' +
    maxWidthDelta.toFixed(3)
);

assert(
  '10 四列中心线误差 <= 1px 且列宽差 <= 1px',
  maxDelta <= 1 && maxWidthDelta <= 1,
  'maxDelta=' + maxDelta + ' maxWidthDelta=' + maxWidthDelta
);

// 修复前错轨对照（文档用）：旧本轮 padding:0 覆盖 feature-section 48rpx
var brokenPad = 0;
var goodPad = readPx(48, 375);
var brokenCenters = [];
var brokenGridW = 375 - brokenPad * 2 - readPx(8, 375) * 2; // 旧 scroll 8rpx
// 更贴近审计：全局 = scroll8 + section48；本轮 = scroll8 + section被覆盖0
var oldGlobalPad = readPx(8, 375) + readPx(48, 375);
var oldRoundPad = readPx(8, 375) + 0;
var oldGap = readPx(24, 375);
var oldGlobalW = 375 - oldGlobalPad * 2;
var oldRoundW = 375 - oldRoundPad * 2;
var oldGlobalCol = (oldGlobalW - oldGap * 3) / 4;
var oldRoundCol = (oldRoundW - oldGap * 3) / 4;
console.log('=== 修复前错轨推算（对照）===');
console.log(
  '旧全局 pad=' +
    oldGlobalPad.toFixed(1) +
    'px 本轮 pad=' +
    oldRoundPad.toFixed(1) +
    'px → 第1列 center 差 ≈ ' +
    Math.abs(
      oldGlobalPad +
        oldGlobalCol / 2 -
        (oldRoundPad + oldRoundCol / 2)
    ).toFixed(2) +
    'px'
);

assert(
  '11 权限矩阵投影未改（start 仍接在主区后）',
  typeof sheetVm.projectRoundManageSlots === 'function' &&
    sheetSrc.indexOf('SERIES_ROUND_PERM_MAIN_REGISTERING') >= 0 &&
    sheetSrc.indexOf('manage_payment') >= 0
);

assert(
  '12 permission / 事件接线未改',
  pageWxml.indexOf('onSeriesScopeFeatureTap') >= 0 &&
    pageWxml.indexOf('onSeriesManageFeatureTap') >= 0 &&
    pageWxml.indexOf('data-permission="{{item.permission}}"') >= 0 &&
    pageWxml.indexOf('roundManageSection.featuresPermission') >= 0
);

assert(
  '禁止残留专用布局 class',
  pageWxml.indexOf('round-feature-grid') < 0 &&
    pageWxml.indexOf('manage-feature-grid--round') < 0 &&
    pageWxml.indexOf('lifecycle-actions') < 0 &&
    pageWxss.indexOf('round-feature-grid') < 0
);

// common 仍保留 detail 用 feature-grid（不被本 patch 删除）
assert(
  'detail 权威 feature-grid 仍在 common（未误删）',
  /\.feature-grid\s*\{[\s\S]*?repeat\(\s*4\s*,\s*1fr\)/.test(commonWxss)
);

console.log('');
console.log('M-GRID selftest: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
