/**
 * 总榜 UI 问题 3：TOT → R 页面跳动（固定信息行高度 + 切轮不重测 dock）
 * 运行：node scripts/seriesStandingsRoundMetaJump.selftest.js
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

var standingsVm = require(path.join(pageDir, 'seriesStandingsViewModel.js'));
var wxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var wxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var dockDir = path.join(root, 'miniprogram', 'subpackages', 'tournament', 'components', 'series-round-selector-dock');
var dockWxml = fs.readFileSync(path.join(dockDir, 'index.wxml'), 'utf8');
var dockWxss = fs.readFileSync(path.join(dockDir, 'index.wxss'), 'utf8');

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

function extractRule(css, selector) {
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

var rebuildFn = (pageJs.match(
  /_rebuildStandingsProjection:\s*function\s*\([^)]*\)\s*\{[\s\S]*?\n  \},/
) || [])[0] || '';
var tapFn = (pageJs.match(
  /onStandingsRoundTap:\s*function\s*\([^)]*\)\s*\{[\s\S]*?\n  \},/
) || [])[0] || '';

var metaRule = extractRule(dockWxss, '.series-standings-round-meta {');
if (!metaRule) metaRule = extractRule(dockWxss, '.series-standings-round-meta\n');
if (!metaRule) {
  var mIdx = dockWxss.indexOf('.series-standings-round-meta');
  metaRule = mIdx >= 0 ? extractRule(dockWxss.slice(mIdx), '.series-standings-round-meta') : '';
}
var emptyRule = extractRule(dockWxss, '.series-standings-round-meta--empty');

assert(
  '1 TOT 信息行容器存在（模板常驻）',
  standingsTpl.indexOf('series-standings-round-meta') >= 0 &&
    standingsTpl.indexOf('{{roundInfoText}}') >= 0
);

assert(
  '2 TOT 文字不可见（--empty → visibility:hidden）',
  standingsTpl.indexOf("roundInfoText ? '' : 'series-standings-round-meta--empty'") >=
    0 &&
    /visibility:\s*hidden/.test(emptyRule)
);

assert(
  '3 TOT 不使用 wx:if 卸载信息行',
  !/wx:if="\{\{roundInfoText\}\}"/.test(standingsTpl) &&
    !/wx:if="\{\{selectedKey/.test(standingsTpl) &&
    standingsTpl.indexOf('series-standings-round-meta') >= 0 &&
    !/display:\s*none/.test(metaRule) &&
    !/display:\s*none/.test(emptyRule)
);

var r1 = standingsVm.buildStandingsRoundInfoText(
  'r1',
  [
    {
      roundId: 'r1',
      index: 1,
      label: 'R1',
      dateTime: '2026-08-13 08:30',
      courseName: '北京华彬高尔夫俱乐部'
    }
  ],
  null
);
assert('4 R1 显示文案', r1 === 'R1 · AUG 13 · 北京华彬高尔夫俱乐部');

assert(
  '5 TOT 与 R1 dock 高度一致（固定 52rpx）',
  /height:\s*52rpx/.test(metaRule) &&
    /min-height:\s*52rpx/.test(metaRule) &&
    /max-height:\s*52rpx/.test(metaRule)
);

assert(
  '6 inflow/fixed 共用同一组件（高度一致）',
  (wxml.match(/<series-round-selector-dock/g) || []).length >= 4 &&
    (dockWxml.match(/class="series-standings-round-meta \{\{/g) || []).length ===
      1
);

assert(
  '7 TOT → R1 不调用 dock 专用重测',
  rebuildFn.indexOf('measureRoundSelectorTop(') < 0 &&
    rebuildFn.indexOf('measureTabTop(') < 0 &&
    rebuildFn.length > 0
);

assert(
  '8 R1 → TOT 不调用 dock 专用重测（同一 rebuild 路径）',
  rebuildFn.indexOf('measureRoundSelectorTop(') < 0 &&
    tapFn.indexOf('_rebuildStandingsProjection') >= 0
);

assert(
  '9 切换不写 scrollTop',
  rebuildFn.indexOf('scrollTop:') < 0 &&
    tapFn.indexOf('_captureScrollLayoutAnchor') < 0 &&
    tapFn.indexOf('_restoreScrollLayoutAnchorIfNeeded') < 0 &&
    rebuildFn.indexOf('_restoreScrollLayoutAnchorIfNeeded') < 0
);

assert(
  '10 切轮不写 filler、不排 filler 重测',
  rebuildFn.indexOf('scrollFillerHeight: 0') < 0 &&
    rebuildFn.indexOf('scheduleStandingsContentFillerMeasure') < 0 &&
    rebuildFn.indexOf('updateScrollFillerHeight') < 0 &&
    rebuildFn.indexOf('scheduleStandingsBoardSwitchMeasure') < 0 &&
    rebuildFn.indexOf('不改 scrollTop / filler / sticky') >= 0
);

assert(
  '11 切换不完整 reload',
  rebuildFn.indexOf('reloadViewModel') < 0 &&
    tapFn.indexOf('reloadViewModel') < 0 &&
    rebuildFn.indexOf('_rebuildStandingsProjection') >= 0 &&
    rebuildFn.indexOf('不改 scrollTop / filler / sticky') >= 0
);

assert(
  '12 横向 scrollLeft 保持',
  tapFn.indexOf('不改写 roundSelectorScrollLeft') >= 0 &&
    rebuildFn.indexOf('roundSelectorScrollLeft') >= 0 &&
    rebuildFn.indexOf('roundSelectorScrollLeft:') < 0
);

assert(
  '13 二级 sticky 状态保持（不赋值 sticky top / 不重测 offset）',
  !/stickyRoundSelectorTop\s*:/.test(rebuildFn) &&
    !/roundSelectorOffsetTop\s*:/.test(rebuildFn) &&
    !/isStickyRoundSelector\s*:/.test(rebuildFn) &&
    rebuildFn.indexOf('measureRoundSelectorTop(') < 0
);

var r2 = standingsVm.buildStandingsRoundInfoText(
  'r2',
  [
    {
      roundId: 'r2',
      index: 2,
      label: 'R2',
      dateTime: '2026-09-01',
      courseName: '测试球场',
      courseHalfText: '后九'
    }
  ],
  null
);
assert(
  '14 R1/R2 文案仍正确更新',
  r1.indexOf('R1') === 0 &&
    r2 === 'R2 · SEP 01 · 测试球场 · 后九' &&
    standingsVm.buildStandingsRoundInfoText('cumulative', [], null) === '' &&
    standingsVm.buildStandingsRoundInfoText('total', [], null) === ''
);

assert(
  '15 赛程共用 round-meta；M 不受影响',
  (wxml.match(/round-info-text="\{\{schedule\.roundInfoText\}\}"/g) || [])
    .length >= 2 &&
    manageSlice.indexOf('series-standings-round-meta') < 0
);

assert(
  '16 无 height:auto；overflow 锁单行',
  !/height:\s*auto/.test(metaRule) &&
    /overflow:\s*hidden/.test(metaRule) &&
    /padding:\s*12rpx 0/.test(metaRule)
);

assert(
  '17 切换不因 meta 写 filler',
  rebuildFn.indexOf('scrollFillerHeight:') < 0 &&
    tapFn.indexOf('scrollFillerHeight:') < 0
);

var inflowData = '';
var fixedData = '';
var barRe = /round-info-text="\{\{standings\.roundInfoText\}\}"/g;
var barMatch = barRe.exec(wxml);
if (barMatch) inflowData = barMatch[0];
barMatch = barRe.exec(wxml);
if (barMatch) fixedData = barMatch[0];
assert(
  '18 inflow/fixed 使用相同 data',
  inflowData.length > 0 && inflowData === fixedData && inflowData.indexOf('roundInfoText') >= 0
);

assert(
  '19 共享个人榜不在 roundBar；TOT 文案为空',
  standingsTpl.indexOf('personal-leaderboard-board') < 0 &&
    standingsTpl.indexOf('personalLeaderboard') < 0 &&
    standingsVm.buildStandingsRoundInfoText('cumulative', [], null) === '' &&
    standingsVm.buildStandingsRoundInfoText('total', [], null) === ''
);

console.log('');
console.log('真机验收表（需真机填写）：');
console.log('| 状态 | inflow dock height | fixed dock height | scrollTop |');
console.log('|---|---:|---:|---:|');
console.log('| TOT |  |  |  |');
console.log('| R1 |  |  |  |');
console.log('| 返回 TOT |  |  |  |');
console.log('期望：dock 高度差 ≤ 1px；scrollTop 不被程序回写');

console.log('');
console.log(
  'seriesStandingsRoundMetaJump selftest: ' +
    passed +
    ' passed, ' +
    failed +
    ' failed'
);
process.exit(failed ? 1 : 0);
