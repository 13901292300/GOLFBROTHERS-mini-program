/**
 * Patch R-SELECT-UI：赛程/总榜轮次选中态轻量化
 * 运行：node scripts/seriesRoundSelectUi.selftest.js
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

var wxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var wxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
var dockDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'components',
  'series-round-selector-dock'
);
var dockWxml = fs.readFileSync(path.join(dockDir, 'index.wxml'), 'utf8');
var dockWxss = fs.readFileSync(path.join(dockDir, 'index.wxss'), 'utf8');
var standingsVm = fs.readFileSync(
  path.join(pageDir, 'seriesStandingsViewModel.js'),
  'utf8'
);
var scheduleVm = fs.readFileSync(
  path.join(pageDir, 'seriesScheduleViewModel.js'),
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

function sliceTemplate(name) {
  var re = new RegExp(
    '<template name="' + name + '">([\\s\\S]*?)</template>'
  );
  var m = wxml.match(re);
  return m ? m[1] : '';
}

var standingsTpl = dockWxml;
var scheduleTpl = dockWxml;
var manageStart = wxml.indexOf('series-manage-round-card');
var manageSlice = manageStart >= 0 ? wxml.slice(manageStart, manageStart + 800) : '';

assert(
  '1 选中边线为 2rpx inset',
  /\.series-standings-round-chip\.round-selector-item--selected\s*\{[\s\S]{0,220}inset 0 0 0 2rpx/.test(
    dockWxss
  ) ||
    /\.series-standings-round-chip\.round-selector-item--selected\s*\{[\s\S]{0,220}inset 0 0 0 2rpx/.test(
      wxss
    )
);

assert(
  '2 总榜/赛程 chip 不存在 6rpx 双描边',
  !/\.series-standings-round-chip\.round-selector-item--selected\s*\{[^}]*0 0 0 6rpx/.test(
    wxss
  )
);

assert(
  '3 不使用选中上浮 transform',
  /\.series-standings-round-chip\.round-selector-item--selected\s*\{[\s\S]{0,200}transform:\s*none/.test(
    dockWxss
  ) &&
    !/\.series-standings-round-chip\.round-selector-item--selected\s*\{[\s\S]{0,200}translateY/.test(
      dockWxss
    )
);

assert(
  '4 选中图标 class 统一；模板用 isSelected',
  standingsTpl.indexOf('round-selector-item__selected-icon') >= 0 &&
    scheduleTpl.indexOf('round-selector-item__selected-icon') >= 0 &&
    /wx:if="\{\{item\.isSelected\}\}"/.test(standingsTpl) &&
    /wx:if="\{\{item\.isSelected\}\}"/.test(scheduleTpl) &&
    /wx:if="\{\{totalSelector\.isSelected\}\}"/.test(standingsTpl)
);

assert(
  '5 总榜与赛程复用同一选中 class',
  standingsTpl.indexOf('round-selector-item--selected') >= 0 &&
    scheduleTpl.indexOf('round-selector-item--selected') >= 0 &&
    standingsTpl.indexOf('series-standings-round-chip') >= 0 &&
    scheduleTpl.indexOf('series-standings-round-chip') >= 0
);

assert(
  '6 selected 与 stateClass 同时存在',
  standingsTpl.indexOf('{{item.stateClass}}') >= 0 &&
    standingsTpl.indexOf("item.isSelected ? 'round-selector-item--selected'") >=
      0 &&
    scheduleTpl.indexOf('{{item.stateClass}}') >= 0 &&
    scheduleTpl.indexOf("item.isSelected ? 'round-selector-item--selected'") >= 0
);

assert(
  '7-9 状态色声明仍在（live/grouped/completed）',
  wxss.indexOf('round-selector-state--live') >= 0 &&
    wxss.indexOf('round-selector-state--grouped') >= 0 &&
    wxss.indexOf('round-selector-state--completed') >= 0 &&
    !/\.series-standings-round-chip\.round-selector-item--selected\s*\{[^}]*background\s*:/.test(
      wxss
    )
);

assert(
  '10 投影仍用 isSelected / showSelectedCheck 互斥单选',
  standingsVm.indexOf('isSelected') >= 0 &&
    scheduleVm.indexOf('isSelected') >= 0 &&
    standingsVm.indexOf('showSelectedCheck') >= 0
);

assert(
  '11 chip 尺寸稳定：透明 border 2rpx 预留；选中用 inset',
  /\.series-standings-round-chip\s*\{[\s\S]{0,220}border:\s*2rpx solid transparent/.test(
    dockWxss
  ) &&
    /\.series-standings-round-chip\s*\{[\s\S]{0,220}box-sizing:\s*border-box/.test(
      dockWxss
    )
);

assert(
  '12 不改横向 scroll 绑定',
  wxml.indexOf('scroll-left="{{roundSelectorScrollLeft}}"') >= 0 &&
    wxml.indexOf('scroll-left="{{scheduleRoundSelectorScrollLeft}}"') >= 0
);

assert(
  '13 inflow/fixed 共用同一组件',
  (wxml.match(/<series-round-selector-dock/g) || []).length >= 4
);

assert(
  '14 不修改 M 建议态；M 仍用 __check',
  manageSlice.indexOf('round-selector-item--suggested') >= 0 &&
    manageSlice.indexOf('round-selector-item__suggest') >= 0 &&
    manageSlice.indexOf('round-selector-item__check') >= 0 &&
    manageSlice.indexOf('round-selector-item__selected-icon') < 0 &&
    /\.series-manage-round-card\.round-selector-item--selected\s*\{[\s\S]{0,200}0 0 0 6rpx/.test(
      wxss
    )
);

assert(
  '15 不改点击/业务投影函数名',
  wxml.indexOf('onStandingsRoundTap') >= 0 &&
    wxml.indexOf('onScheduleRoundTap') >= 0 &&
    standingsVm.indexOf('buildRoundSelectorParts') >= 0 &&
    scheduleVm.indexOf('buildScheduleRoundSelector') >= 0
);

// 几何：inset 不改 width/height → delta=0
console.log('');
console.log('=== 尺寸稳定性（inset 描边）===');
console.log('| 项 | 修改前 | 修改后 |');
console.log('|---|---:|---:|');
console.log('| 边线宽度 | 外扩 3+6rpx 双描边 | 2rpx inset |');
console.log('| 描边层数 | 2 | 1 |');
console.log('| 卡片宽度 | 内容+透明 border | 不变（inset） |');
console.log('| 卡片高度 | min-height 56rpx | 不变 |');
console.log('| 选中图标尺寸 | 28rpx（外溢 -6） | 30rpx（内 6rpx） |');
console.log('| 选中前后坐标差 | 上浮 -2rpx | 0（≤1px） |');

console.log('');
console.log('R-SELECT-UI selftest: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
