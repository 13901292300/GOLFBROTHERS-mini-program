/**
 * 总榜 UI 问题 2：轮次选择器与轮信息整体二次吸顶
 * 运行：node scripts/seriesStandingsRoundInfoDock.selftest.js
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
var dockDir = path.join(root, 'miniprogram', 'components', 'series-round-selector-dock');
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

var standingsTpl = dockWxml;
var scheduleTpl = dockWxml;
var manageStart = wxml.indexOf('series-manage-round-card');
var manageSlice =
  manageStart >= 0 ? wxml.slice(manageStart, manageStart + 900) : '';

var infoOutsideScroll =
  standingsTpl.indexOf('series-standings-round-meta') >
    standingsTpl.indexOf('</scroll-view>') &&
  standingsTpl.indexOf('series-standings-round-meta') >= 0;

assert(
  '1 信息行位于共享 dock 组件内',
  standingsTpl.indexOf('series-standings-round-meta') >= 0 &&
    standingsTpl.indexOf('{{roundInfoText}}') >= 0
);

assert(
  '2 inflow/fixed 通过同一组件获得信息行',
  (wxml.match(/<series-round-selector-dock/g) || []).length >= 4 &&
    (wxml.match(/round-info-text="\{\{standings\.roundInfoText\}\}"/g) || [])
      .length >= 2
);

assert(
  '3 页面不存在第二套手写信息 DOM',
  (wxml.match(/class="series-standings-round-meta /g) || []).length === 0 &&
    wxml.indexOf('standings-round-info--inflow') < 0 &&
    wxml.indexOf('standings-round-info--fixed') < 0
);

assert(
  '4 选择器与信息行同在 dock-body（一起二次吸顶）',
  standingsTpl.indexOf('series-standings-round-dock-body') >= 0 &&
    standingsTpl.indexOf('series-standings-round-bar') >= 0 &&
    standingsTpl.indexOf('series-standings-round-meta') >= 0 &&
    /activeTab === 'standings'/.test(wxml)
);

assert(
  '5 fixed/inflow 同字段 roundInfoText',
  wxml.indexOf('round-info-text="{{standings.roundInfoText}}"') >= 0
);

assert(
  '6 信息行不进入横向 scroll 内容',
  infoOutsideScroll &&
    !/<scroll-view[\s\S]*series-standings-round-meta[\s\S]*<\/scroll-view>/.test(
      standingsTpl
    )
);

var r1Text = standingsVm.buildStandingsRoundInfoText(
  'r1',
  [
    {
      roundId: 'r1',
      index: 1,
      label: 'R1',
      dateTime: '2026-08-13 08:30',
      courseName: '北京华彬高尔夫俱乐部',
      courseHalfText: ''
    }
  ],
  { rounds: [] }
);
assert(
  '7 R 文案格式正确',
  r1Text === 'R1 · AUG 13 · 北京华彬高尔夫俱乐部'
);

var halfText = standingsVm.buildStandingsRoundInfoText(
  'r2',
  [
    {
      roundId: 'r2',
      index: 2,
      label: 'R2',
      dateTime: '2026-01-05',
      courseName: '测试球场',
      courseHalfText: '前九'
    }
  ],
  null
);
assert(
  '7b 半场可追加且无空分隔',
  halfText === 'R2 · JAN 05 · 测试球场 · 前九'
);

var totText = standingsVm.buildStandingsRoundInfoText(
  standingsVm.CUMULATIVE_KEY,
  [{ roundId: 'r1', label: 'R1', dateTime: '2026-08-13', courseName: 'X' }],
  null
);
var missingVm = standingsVm.buildSeriesStandingsViewModel({
  series: {
    scoringRule: { mode: 'global_m' },
    participants: [],
    rounds: [{ roundId: 'r1', index: 1, name: 'R1' }]
  },
  selectedKey: 'r1',
  roundStates: [{ roundId: 'r1', index: 1, label: 'R1' }],
  standingsResult: standingsVm.emptyStandingsResult()
});
assert(
  '8 TOT 不虚构轮信息；缺字段不造日期球场',
  totText === '' &&
    missingVm.roundInfoText === 'R1' &&
    missingVm.roundInfoText.indexOf('AUG') < 0
);

assert(
  '9 dock 完整高度通过实测 .series-round-dock--inflow 获得',
  pageJs.indexOf(".select('.series-round-dock--inflow')") >= 0 &&
    pageJs.indexOf('measureRoundSelectorTop') >= 0
);

assert(
  '10 fixed top 仍为 Header + 一级 TAB',
  /stickyRoundSelectorTop:\s*headerTotalHeight\s*\+\s*primaryH/.test(pageJs) ||
    /stickyRoundTop\s*=\s*headerH\s*\+\s*primaryH/.test(pageJs)
);

assert(
  '11 不把信息行高度错误加入 stickyRoundSelectorTop',
  !/stickyRoundSelectorTop[^\n]{0,80}roundInfo/.test(pageJs) &&
    !/stickyRoundSelectorTop[^\n]{0,80}infoHeight/.test(pageJs) &&
    pageJs.indexOf('不把信息行高度计入 fixed top') >= 0
);

var rebuildFn = (pageJs.match(
  /_rebuildStandingsProjection:\s*function\s*\([^)]*\)\s*\{[\s\S]*?\n  \},/
) || [])[0] || '';
var tapFn = (pageJs.match(
  /onStandingsRoundTap:\s*function\s*\([^)]*\)\s*\{[\s\S]*?\n  \},/
) || [])[0] || '';

assert(
  '12 TOT/R 切换不重置纵向、横向滚动',
  rebuildFn.indexOf('不改 scrollTop / filler / sticky') >= 0 &&
    tapFn.indexOf('不改写 roundSelectorScrollLeft') >= 0 &&
    tapFn.indexOf('_rebuildStandingsProjection') >= 0 &&
    tapFn.indexOf('_captureScrollLayoutAnchor') < 0
);

assert(
  '13 切轮不重测 dock；不写 filler',
  rebuildFn.indexOf('measureRoundSelectorTop(') < 0 &&
    rebuildFn.indexOf('scheduleStandingsContentFillerMeasure') < 0 &&
    rebuildFn.indexOf('updateScrollFillerHeight') < 0 &&
    rebuildFn.indexOf('scrollFillerHeight: 0') < 0
);

assert(
  '14 fixed 背景不透明',
  /\.series-round-dock--fixed\s*\{[^}]*background:\s*var\(--bg-primary\)/.test(
    wxss
  ) &&
    /\.series-round-dock--fixed\s*\{[^}]*opacity:\s*1/.test(wxss)
);

assert(
  '15 赛程与总榜共用 round-meta；M 选择器不受影响',
  (wxml.match(/round-info-text="\{\{schedule\.roundInfoText\}\}"/g) || [])
    .length >= 2 &&
    manageSlice.indexOf('series-standings-round-meta') < 0 &&
    dockWxss.indexOf('series-standings-round-meta') >= 0
);

assert(
  '附加 信息行固定单行高度 52rpx',
  /\.series-standings-round-meta\s*\{[\s\S]{0,180}height:\s*52rpx/.test(dockWxss) &&
    /\.series-standings-round-meta--empty\s*\{[\s\S]{0,80}visibility:\s*hidden/.test(
      dockWxss
    )
);

console.log('');
console.log(
  'seriesStandingsRoundInfoDock selftest: ' +
    passed +
    ' passed, ' +
    failed +
    ' failed'
);
process.exit(failed ? 1 : 0);
