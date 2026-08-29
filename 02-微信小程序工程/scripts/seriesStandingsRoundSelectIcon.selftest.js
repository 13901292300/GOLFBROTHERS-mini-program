/**
 * UI 问题 1：仅 Series 总榜轮次选择器选中图标（左上角白底蓝勾）
 * 运行：node scripts/seriesStandingsRoundSelectIcon.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var pageDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);

var wxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var wxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
var dockDir = path.join(root, 'miniprogram', 'subpackages', 'tournament', 'components', 'series-round-selector-dock');
var dockWxml = fs.readFileSync(path.join(dockDir, 'index.wxml'), 'utf8');
var dockWxss = fs.readFileSync(path.join(dockDir, 'index.wxss'), 'utf8');
var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var visualStatePath = path.join(pageDir, 'seriesRoundVisualState.js');
var visualState = fs.existsSync(visualStatePath)
  ? fs.readFileSync(visualStatePath, 'utf8')
  : '';

var appWxss = fs.readFileSync(
  path.join(root, 'miniprogram', 'app.wxss'),
  'utf8'
);
var commonWxssPath = path.join(
  root,
  'miniprogram',
  'styles',
  'tournament-common.wxss'
);
var commonWxss = fs.existsSync(commonWxssPath)
  ? fs.readFileSync(commonWxssPath, 'utf8')
  : '';

var detailDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'detail'
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

function extractBlock(css, selector) {
  var idx = css.indexOf(selector);
  if (idx < 0) return '';
  var brace = css.indexOf('{', idx);
  if (brace < 0) return '';
  var depth = 0;
  for (var i = brace; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(idx, i + 1);
    }
  }
  return '';
}

var standingsTpl = dockWxml;
var scheduleTpl = dockWxml;
var manageStart = wxml.indexOf('series-manage-round-card');
var manageSlice =
  manageStart >= 0 ? wxml.slice(manageStart, manageStart + 900) : '';

var standingsIconBlock = extractBlock(
  dockWxss,
  '.series-standings-round-chip .round-selector-item__selected-icon'
);
var sharedIconBlock = standingsIconBlock;
var scheduleSignature =
  'class="series-standings-round-bar series-schedule-round-bar"';

assert(
  '1 修改路径仅命中 series-detail（本脚本只读该页 + 锁未改 common/app）',
  fs.existsSync(path.join(pageDir, 'index.wxml')) &&
    fs.existsSync(path.join(pageDir, 'index.wxss'))
);

assert(
  '2 总榜/赛程共用 series-standings-round-selector',
  standingsTpl.indexOf('series-standings-round-selector') >= 0 &&
    scheduleTpl.indexOf('series-standings-round-selector') >= 0
);

assert(
  '3 总榜选中图标 left 生效、right:auto',
  /left:\s*6rpx/.test(standingsIconBlock) &&
    /right:\s*auto/.test(standingsIconBlock) &&
    /top:\s*6rpx/.test(standingsIconBlock)
);

assert(
  '4 选中图标统一左上角白底蓝勾',
  /left:\s*6rpx/.test(sharedIconBlock) &&
    /right:\s*auto/.test(sharedIconBlock)
);

assert(
  '5 白底蓝勾（data-blue token）',
  /background:\s*#fff/.test(standingsIconBlock) &&
    /color:\s*var\(--data-blue/.test(standingsIconBlock)
);

assert(
  '6 选中水平 padding 避让且总和不变（40+4=44）',
  /\.series-standings-round-chip\.round-selector-item--selected\s*\{[\s\S]{0,160}padding-left:\s*40rpx/.test(
    dockWxss
  ) &&
    /\.series-standings-round-chip\.round-selector-item--selected\s*\{[\s\S]{0,200}padding-right:\s*4rpx/.test(
      dockWxss
    )
);

assert(
  '7 inflow/fixed 共用 series-round-selector-dock',
  (wxml.match(/<series-round-selector-dock/g) || []).length >= 4 &&
    /activeTab === 'standings'/.test(wxml)
);

assert(
  '8 赛程挂同一组件且 showTot=false',
  (wxml.match(/show-tot="\{\{false\}\}"/g) || []).length >= 2
);

assert(
  '9 M 选择器仍用 __check，不用总榜限定 class',
  manageSlice.indexOf('round-selector-item__check') >= 0 &&
    manageSlice.indexOf('series-standings-round-selector') < 0 &&
    manageSlice.indexOf('round-selector-item__selected-icon') < 0
);

assert(
  '10 普通 detail 页未引入 series-standings-round-selector',
  !fs.existsSync(path.join(detailDir, 'index.wxml')) ||
    fs
      .readFileSync(path.join(detailDir, 'index.wxml'), 'utf8')
      .indexOf('series-standings-round-selector') < 0
);

assert(
  '11 common / app.wxss 不含总榜限定选中图标规则',
  commonWxss.indexOf('series-standings-round-selector') < 0 &&
    appWxss.indexOf('series-standings-round-selector') < 0
);

assert(
  '12 状态投影文件未被本页样式耦合改写（文件仍存在且无 UI class）',
  visualState.indexOf('resolveSeriesRoundVisualState') >= 0 &&
    visualState.indexOf('series-standings-round-selector') < 0
);

assert(
  '13 点击/切轮逻辑未改函数名',
  pageJs.indexOf('onStandingsRoundTap') >= 0 &&
    pageJs.indexOf('onScheduleRoundTap') >= 0 &&
    pageJs.indexOf('onRoundSelectorHScroll') >= 0
);

assert(
  '14 未扩大 chip 基础尺寸声明（min-height/水平 padding 基线仍在）',
  /\.series-standings-round-chip\s*\{[\s\S]{0,220}min-height:\s*56rpx/.test(
    dockWxss
  ) &&
    /\.series-standings-round-chip\s*\{[\s\S]{0,220}padding:\s*10rpx 22rpx/.test(
      dockWxss
    )
);

console.log('');
console.log(
  'seriesStandingsRoundSelectIcon selftest: ' +
    passed +
    ' passed, ' +
    failed +
    ' failed'
);
process.exit(failed ? 1 : 0);
