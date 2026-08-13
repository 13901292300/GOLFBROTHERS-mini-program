/**
 * Patch ST-JUMP-4：总榜 TAB 吸顶后切换 TOT/R 不跳动
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsBoardSwitchJump.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var pageDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var compDir = path.join(mini, 'components', 'personal-leaderboard-board');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');

global.Page = function () {};
global.getApp = function () {
  return null;
};
var page = require(path.join(pageDir, 'index.js'));

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
var adapterSrc = fs.readFileSync(
  path.join(pageDir, 'seriesPersonalLeaderboardAdapter.js'),
  'utf8'
);
var vmSrc = fs.readFileSync(path.join(pageDir, 'seriesStandingsViewModel.js'), 'utf8');
var compJs = fs.readFileSync(path.join(compDir, 'index.js'), 'utf8');
var detailJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');

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

var tapFn = extractFn(pageJs, 'onStandingsRoundTap');
var rebuildFn = extractFn(pageJs, '_rebuildStandingsProjection');
var syncFn = extractFn(pageJs, '_syncStickyByScroll');
var switchFn = extractFn(pageJs, '_performSwitchTab');
var resizeFn = extractFn(pageJs, '_bindWindowResize');
var showFn = extractFn(pageJs, 'onShow');
var holdFn = page.computeStickyContentHostHoldMinHeight;

assert(
  '1 保护高度只升不降',
  typeof holdFn === 'function' &&
    holdFn(320, 180) === 320 &&
    holdFn(0, 240) === 240 &&
    holdFn(200, 200) === 200 &&
    holdFn(-1, 50) === 50
);

assert(
  '2 吸顶才启用保护高度；未吸顶直接 rebuild',
  /isStickyRoundSelector/.test(tapFn) &&
    tapFn.indexOf('applyRebuild(extraBase)') >= 0 &&
    tapFn.indexOf('_measureStandingsContentHostHeight') >= 0 &&
    tapFn.indexOf('_stJumpBoardSwitch') < 0
);

assert(
  '3 吸顶切轮同帧写入 contentHostMinHeight，禁止 nextTick 补高',
  tapFn.indexOf('contentHostMinHeight') >= 0 &&
    rebuildFn.indexOf('contentHostMinHeight') >= 0 &&
    rebuildFn.indexOf('wx.nextTick') < 0 &&
    rebuildFn.indexOf('scheduleStandingsBoardSwitchMeasure') < 0 &&
    pageJs.indexOf('_convergeStandingsEmptyBoardMinHeight') < 0
);

assert(
  '4 切轮后不再走 filler 链',
  rebuildFn.indexOf('scheduleStandingsContentFillerMeasure') < 0 &&
    rebuildFn.indexOf('updateScrollFillerHeight') < 0 &&
    tapFn.indexOf('updateScrollFillerHeight') < 0 &&
    tapFn.indexOf('scrollFillerHeight') < 0 &&
    rebuildFn.indexOf('delete patch.scrollFillerHeight') >= 0 &&
    rebuildFn.indexOf('delete patch.scrollRectTop') >= 0
);

assert(
  '5 切轮不主动改 sticky / 不重测 TAB 与 dock',
  rebuildFn.indexOf('delete patch.isStickyRoundSelector') >= 0 &&
    rebuildFn.indexOf('delete patch.isStickyTab') >= 0 &&
    rebuildFn.indexOf('measureTabTop(') < 0 &&
    rebuildFn.indexOf('measureRoundSelectorTop(') < 0 &&
    tapFn.indexOf('measureTabTop(') < 0 &&
    tapFn.indexOf('measureRoundSelectorTop(') < 0
);

assert(
  '6 切轮不写 scrollTop',
  rebuildFn.indexOf('scrollTop:') < 0 &&
    tapFn.indexOf('scrollTop:') < 0 &&
    tapFn.indexOf('_captureScrollLayoutAnchor') < 0 &&
    rebuildFn.indexOf('_restoreStandingsCollapseScrollIfNeeded') < 0
);

assert(
  '7 保护高度仅页面态；TOT/R 同一吸顶路径',
  /contentHostMinHeight: 0/.test(pageJs) &&
    vmSrc.indexOf('contentHostMinHeight') < 0 &&
    adapterSrc.indexOf('contentHostMinHeight') < 0 &&
    tapFn.indexOf('fromKey === tot') < 0 &&
    tapFn.indexOf('_resolveStandingsBoardViewForKey') >= 0
);

assert(
  '8 正文壳 series-standings-content-host 不包 TAB/dock/filler/fixed',
  /id="series-standings-content-host"/.test(pageWxml) &&
    /class="series-standings-content-host"/.test(pageWxml) &&
    /\.series-standings-content-host/.test(pageWxss) &&
    pageWxml.indexOf('series-standings-board-content') < 0 &&
    !/series-round-dock[\s\S]{0,220}series-standings-content-host/.test(pageWxml) &&
    pageWxml.indexOf('series-scroll-filler') >
      pageWxml.indexOf('series-standings-content-host')
);

assert(
  '9 解吸顶 / 离总榜 TAB / 进页非吸顶 / 窗口变化才释放',
  syncFn.indexOf('justUnstuckRound') >= 0 &&
    syncFn.indexOf('contentHostMinHeight') >= 0 &&
    switchFn.indexOf("prevTab === 'standings'") >= 0 &&
    switchFn.indexOf('contentHostMinHeight') >= 0 &&
    showFn.indexOf('_releaseStandingsContentHostHold') >= 0 &&
    resizeFn.indexOf('_releaseStandingsContentHostHold') >= 0 &&
    rebuildFn.indexOf('_releaseStandingsContentHostHold') < 0
);

assert(
  '10 切轮后只缓存高度，不释放、不写 filler',
  rebuildFn.indexOf('_cacheStandingsContentHostHeight') >= 0 &&
    pageJs.indexOf('只更新缓存，不写 min-height / filler / sticky') >= 0 &&
    extractFn(pageJs, '_cacheStandingsContentHostHeight').indexOf('setData') < 0
);

assert(
  '11 ST-JUMP-3 旧链路已删除',
  pageJs.indexOf('scheduleStandingsBoardSwitchMeasure') < 0 &&
    pageJs.indexOf('_applyStandingsBoardSwitchCompensation') < 0 &&
    pageJs.indexOf('standingsBoardMinHeight') < 0 &&
    pageJs.indexOf('_standingsSwitchRetainScrollTop') < 0 &&
    pageJs.indexOf('_stJumpBoardSwitch') < 0
);

assert(
  '12 inflow 始终占位；fixed 仅 show/hide，切轮不卸载',
  /series-round-dock--inflow \{\{isStickyRoundSelector \? 'series-round-dock--covered'/.test(
    pageWxml
  ) &&
    /series-round-dock--fixed \{\{activeTab === 'standings' && standings.available && isStickyRoundSelector \? 'series-round-dock--show' : 'series-round-dock--hide'\}/.test(
      pageWxml
    ) &&
    pageWxml.indexOf('wx:if="{{isStickyRoundSelector}}"') < 0
);

assert(
  '13 不写 Series/match/storage',
  tapFn.indexOf('setStorageSync') < 0 &&
    rebuildFn.indexOf('setStorageSync') < 0 &&
    tapFn.indexOf('seriesStore') < 0 &&
    rebuildFn.indexOf('teamMatchStore') < 0
);

assert(
  '14 共享个人榜与普通详情不改',
  compJs.indexOf('contentHostMinHeight') < 0 &&
    compJs.indexOf('series-standings-content-host') < 0 &&
    detailJs.indexOf('contentHostMinHeight') < 0 &&
    detailJs.indexOf('standingsBoardMinHeight') < 0
);

assert(
  '15 filler 仍保留给 TAB/窗口/展开，只是切轮不用',
  pageJs.indexOf('scheduleScrollFillerMeasure') >= 0 &&
    extractFn(pageJs, '_applyStandingsExpandChange').indexOf(
      'scheduleStandingsContentFillerMeasure'
    ) >= 0 &&
    extractFn(pageJs, 'onStandingsTeamTap').indexOf(
      'scheduleStandingsContentFillerMeasure'
    ) < 0 &&
    rebuildFn.indexOf('scheduleStandingsContentFillerMeasure') < 0
);

console.log('');
console.log('真机验收（吸顶切轮，期望三帧值不变）：');
console.log('scrollTop / isStickyTab / isStickyRoundSelector / scrollFillerHeight / contentHostMinHeight');
console.log('切轮前 | 首次 setData 后 | nextTick 后');
console.log('contentHostMinHeight：未吸顶=0；吸顶=持有且不降');

console.log('');
console.log(
  'ST-JUMP-4 selftest: ' + passed + ' passed, ' + failed + ' failed'
);
if (failures.length) {
  console.log('');
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
  process.exit(1);
}
