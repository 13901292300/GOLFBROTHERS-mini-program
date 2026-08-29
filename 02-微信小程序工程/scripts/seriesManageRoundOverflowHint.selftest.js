/**
 * M-ROUND-OVERFLOW-HINT：M 面板轮次选择器轻量溢出箭头
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesManageRoundOverflowHint.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var pageDir = path.join(
  mini,
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);
var dockDir = path.join(mini, 'subpackages', 'tournament', 'components', 'series-round-selector-dock');
var overflow = require(path.join(dockDir, 'overflowArrows.js'));

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
var dockJs = fs.readFileSync(path.join(dockDir, 'index.js'), 'utf8');
var dockWxml = fs.readFileSync(path.join(dockDir, 'index.wxml'), 'utf8');
var dockWxss = fs.readFileSync(path.join(dockDir, 'index.wxss'), 'utf8');

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

function extractFn(src, name) {
  var re = new RegExp(name + ':\\s*function\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n  \\},');
  var m = src.match(re);
  return m ? m[0] : '';
}

function sliceManageRoundWrap(wxml) {
  var start = wxml.indexOf('series-manage-round-wrap');
  if (start < 0) return '';
  return wxml.slice(start, start + 1600);
}

var manageSlice = sliceManageRoundWrap(pageWxml);
var openFn = extractFn(pageJs, 'openSeriesManageSheet');
var pickFn = extractFn(pageJs, 'onManageRoundPick');
var scrollFn = extractFn(pageJs, 'onManageRoundPickerHScroll');
var refreshFn = extractFn(pageJs, '_refreshSeriesManageSheet');
var closeFn = extractFn(pageJs, '_buildCloseMoreSheetPatch');
var resizeFn = extractFn(pageJs, '_bindWindowResize');
var measureFn = extractFn(pageJs, '_measureManageRoundOverflow');

var none = overflow.resolveOverflowArrows(0, 300, 280);
var left = overflow.resolveOverflowArrows(0, 300, 800);
var mid = overflow.resolveOverflowArrows(200, 300, 800);
var end = overflow.resolveOverflowArrows(500, 300, 800);
var endTol = overflow.resolveOverflowArrows(498.5, 300, 800, 2);
var almostEnd = overflow.resolveOverflowArrows(496, 300, 800, 2);

assert(
  '1 无溢出：左右箭头均不显示',
  none.showLeft === false && none.showRight === false
);
assert(
  '2 初始最左：仅右箭头',
  left.showLeft === false && left.showRight === true
);
assert(
  '3 中间：左右箭头',
  mid.showLeft === true && mid.showRight === true
);
assert(
  '4 末端：仅左箭头',
  end.showLeft === true &&
    end.showRight === false &&
    endTol.showLeft === true &&
    endTol.showRight === false &&
    almostEnd.showRight === true
);

assert(
  '5 容差公式 atEnd = scrollLeft + viewport >= scrollWidth - 2',
  overflow.EPS === 2 &&
    pageJs.indexOf('manageRoundOverflowArrows.resolveOverflowArrows') >= 0 &&
    scrollFn.indexOf('left + 40') < 0 &&
    scrollFn.indexOf('left > 8') < 0
);

assert(
  '6 M 使用轻量箭头，不用蓝色 tab-overflow-hint',
  manageSlice.indexOf('series-manage-round-overflow') >= 0 &&
    manageSlice.indexOf('tab-overflow-hint') < 0 &&
    /\.series-manage-round-overflow\s*\{[\s\S]{0,280}pointer-events:\s*none/.test(
      pageWxss
    ) &&
    !/\.series-manage-round-overflow[^{]*\{[^}]*#002d62/.test(pageWxss) &&
    !/\.series-manage-round-overflow[^{]*\{[^}]*linear-gradient/.test(pageWxss)
);

assert(
  '7 只在溢出时渲染箭头，不用轮次数量阈值',
  /wx:if="\{\{manageRoundShowLeftIndicator\}\}"/.test(manageSlice) &&
    /wx:if="\{\{manageRoundShowRightIndicator\}\}"/.test(manageSlice) &&
    !/manageRoundPicker\.items\.length\s*>\s*\d/.test(pageJs) &&
    measureFn.indexOf('.series-manage-round-scroll') >= 0 &&
    measureFn.indexOf('.series-manage-round-row') >= 0
);

assert(
  '8 打开后重测；关闭清理运行时与箭头',
  openFn.indexOf('_scheduleManageRoundOverflowMeasure') >= 0 &&
    openFn.indexOf('_clearManageRoundOverflowRuntime') >= 0 &&
    closeFn.indexOf('_clearManageRoundOverflowRuntime') >= 0 &&
    closeFn.indexOf('manageRoundShowLeftIndicator: false') >= 0 &&
    closeFn.indexOf('manageRoundShowRightIndicator: false') >= 0 &&
    closeFn.indexOf('manageRoundPickerScrollLeft: 0') >= 0
);

assert(
  '9 选轮不重置 scrollLeft',
  pickFn.indexOf('delete patch.manageRoundPickerScrollLeft') >= 0 &&
    pickFn.indexOf('manageRoundPickerScrollLeft: 0') < 0 &&
    refreshFn.indexOf('delete patch.manageRoundPickerScrollLeft') >= 0 &&
    refreshFn.indexOf('manageRoundPickerScrollLeft: 0') < 0
);

assert(
  '10 横向滚动只记录位置，箭头不写回 0',
  scrollFn.indexOf('_lastManageRoundScrollLeft') >= 0 &&
    scrollFn.indexOf('manageRoundPickerScrollLeft: 0') < 0 &&
    scrollFn.indexOf('resolveOverflowArrows') >= 0
);

assert(
  '11 窗口尺寸变化时重测',
  resizeFn.indexOf('showMoreSheet') >= 0 &&
    resizeFn.indexOf('_scheduleManageRoundOverflowMeasure') >= 0
);

assert(
  '12 总榜/赛程共享 dock 零改动（本 Patch 不改接 M）',
  dockWxml.indexOf('srd-overflow') >= 0 &&
    dockJs.indexOf("require('./overflowArrows.js')") >= 0 &&
    pageWxml.indexOf('series-round-selector-dock') >= 0 &&
    pageJs.indexOf(
      "require('../../components/series-round-selector-dock/overflowArrows.js')"
    ) >= 0 &&
    pageWxml.indexOf('onManageRoundPick') >= 0 &&
    manageSlice.indexOf('round-selector-item--suggested') >= 0 &&
    manageSlice.indexOf('round-selector-item__check') >= 0
);

assert(
  '13 一级 TAB 蓝色提示条仍在，M 不再占用该类',
  (pageWxml.match(/tab-overflow-hint--left/g) || []).length === 2 &&
    (pageWxml.match(/tab-overflow-hint--right/g) || []).length === 2
);

console.log('');
console.log(
  'seriesManageRoundOverflowHint selftest: ' +
    passed +
    ' passed, ' +
    failed +
    ' failed'
);
if (failures.length) {
  console.log('');
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
  process.exit(1);
}
process.exit(0);
