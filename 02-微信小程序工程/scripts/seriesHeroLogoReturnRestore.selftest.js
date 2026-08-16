/**
 * SERIES-HERO-LOGO-RETURN-RESTORE：返回后重建 Logo 布局，不因同宽缓存跳过
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesHeroLogoReturnRestore.selftest.js
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
var ordinaryDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');

var viewModel = require(path.join(pageDir, 'seriesDetailViewModel.js'));
var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var ordinaryJs = fs.readFileSync(path.join(ordinaryDir, 'index.js'), 'utf8');
var ordinaryWxml = fs.readFileSync(path.join(ordinaryDir, 'index.wxml'), 'utf8');

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

var raw = [
  { participantId: 't1', logo: 'a.png', fallbackText: '甲' },
  { participantId: 't2', logo: 'b.png', fallbackText: '乙' },
  { participantId: 't3', logo: 'c.png', fallbackText: '丙' }
];

assert(
  'onShow → reload 完成 → nextTick 测量，无 300/500 硬延时',
  /onShow\s*:\s*function[\s\S]*reloadViewModel\(\{\s*resetScroll:\s*false\s*\}\)/.test(pageJs) &&
    /_safeSetData\(patch,\s*function\s*\(\)\s*\{[\s\S]*wx\.nextTick\(function\s*\(\)\s*\{[\s\S]*_scheduleHeroTeamLogoLayout\(\)/.test(
      pageJs
    ) &&
    !/_scheduleHeroTeamLogoLayout[\s\S]{0,200}setTimeout\(\s*[^,]+,\s*300\s*\)/.test(pageJs) &&
    !/_layoutHeroTeamLogoStack[\s\S]{0,400}setTimeout\(\s*[^,]+,\s*500\s*\)/.test(pageJs)
);

var keyA = viewModel.buildHeroTeamLogoLayoutCacheKey({
  containerWidth: 200,
  logoDiameter: 28,
  normalGap: 12,
  teamItems: raw
});
var keyB = viewModel.buildHeroTeamLogoLayoutCacheKey({
  containerWidth: 200,
  logoDiameter: 28,
  normalGap: 12,
  teamItems: raw.slice().reverse()
});
var keyWidthOnly = String(200);
assert(
  '布局缓存键包含宽度 + 数量 + 身份签名，不只是宽度',
  keyA.indexOf('200') === 0 &&
    keyA.indexOf('|3|') >= 0 &&
    keyA.indexOf('t1:a.png') >= 0 &&
    keyA.indexOf('t2:b.png') >= 0 &&
    keyA !== keyB &&
    keyA !== keyWidthOnly &&
    pageJs.indexOf('resolveHeroTeamLogoReturnRestore') >= 0
);

var hiddenStack = { visible: false, stackWidthPx: 0, logoSizePx: 0, items: [] };
assert(
  '相同宽度但新数组缺布局字段时不得跳过',
  viewModel.shouldReuseHeroTeamLogoLayout({
    cacheKey: keyA,
    currentKey: keyA,
    currentStack: hiddenStack,
    teamItems: raw
  }) === false &&
    viewModel.heroTeamLogoStackHasValidLayout(hiddenStack, raw) === false
);

var projected = viewModel.buildHeroTeamLogoStackState({
  mode: 'team_logos',
  teamItems: raw,
  containerWidth: 200,
  logoDiameter: 28,
  normalGap: 12
});
assert(
  '有效布局且签名一致才允许复用',
  projected.items.length === 3 &&
    Number.isFinite(projected.items[0].leftPx) &&
    viewModel.shouldReuseHeroTeamLogoLayout({
      cacheKey: keyA,
      currentKey: keyA,
      currentStack: projected,
      teamItems: raw
    }) === true
);

var width0 = viewModel.resolveHeroTeamLogoReturnRestore({
  pageAlive: true,
  token: 2,
  currentToken: 2,
  seriesId: 's1',
  currentSeriesId: 's1',
  mode: 'team_logos',
  teamItems: raw,
  measuredWidth: 0,
  retryUsed: true,
  logoDiameter: 28,
  normalGap: 12,
  cacheKey: '',
  currentStack: hiddenStack
});
assert(
  '宽度 0 不清空 Logo，走 normal 靠左降级',
  width0.apply === true &&
    width0.clearLogos === false &&
    width0.stack.items.length === 3 &&
    width0.stack.items[0].leftPx === 0 &&
    width0.stack.visible === true &&
    pageJs.indexOf('teamLogos=[]') < 0 &&
    !/heroTeamLogoStack:\s*\{\s*visible:\s*false[\s\S]{0,80}items:\s*\[\s*\]/.test(
      pageJs.slice(pageJs.indexOf('reloadViewModel'))
    )
);

var stale = viewModel.resolveHeroTeamLogoReturnRestore({
  pageAlive: true,
  token: 1,
  currentToken: 2,
  seriesId: 's1',
  currentSeriesId: 's1',
  mode: 'team_logos',
  teamItems: raw,
  measuredWidth: 200,
  retryUsed: true,
  logoDiameter: 28,
  normalGap: 12,
  cacheKey: '',
  currentStack: hiddenStack
});
var dead = viewModel.resolveHeroTeamLogoReturnRestore({
  pageAlive: false,
  token: 2,
  currentToken: 2,
  seriesId: 's1',
  currentSeriesId: 's1',
  mode: 'team_logos',
  teamItems: raw,
  measuredWidth: 200,
  retryUsed: true,
  logoDiameter: 28,
  normalGap: 12
});
assert(
  '过期测量结果不能覆盖当前数据',
  stale.apply === false &&
    stale.reason === 'stale' &&
    stale.clearLogos === false &&
    dead.apply === false &&
    pageJs.indexOf('_heroLogoLayoutRevision') >= 0 &&
    /onUnload[\s\S]*_heroLogoLayoutRevision/.test(pageJs)
);

var retry = viewModel.resolveHeroTeamLogoReturnRestore({
  pageAlive: true,
  token: 3,
  currentToken: 3,
  seriesId: 's1',
  currentSeriesId: 's1',
  mode: 'team_logos',
  teamItems: raw,
  measuredWidth: 0,
  retryUsed: false,
  logoDiameter: 28,
  normalGap: 12
});
assert(
  '宽度 0 允许一次 nextTick 重试且不写空数组',
  retry.retry === true && retry.clearLogos === false && retry.apply === false
);

assert(
  '返回不重置 TAB、轮次和滚动',
  /reloadViewModel\(\{\s*resetScroll:\s*false\s*\}\)/.test(pageJs) &&
    /opts\.resetScroll[\s\S]*_skipScrollReset\s*=\s*true/.test(pageJs) &&
    /activeTab:\s*this\._activeTab/.test(pageJs) &&
    pageJs.indexOf('_standingsSelectedKey') >= 0
);

assert(
  '测量完成前不因 visible 整组卸载',
  pageWxml.indexOf('wx:elif="{{heroTeamLogoStack.items.length}}"') >= 0 &&
    pageWxml.indexOf('wx:elif="{{heroTeamLogoStack.visible}}"') < 0 &&
    pageWxml.indexOf('layoutReady') < 0
);

assert(
  'reload 用原始 Logo 投影首帧，不依赖上次测量才有数据',
  pageJs.indexOf('_heroTeamLogosRaw') >= 0 &&
    pageJs.indexOf('buildHeroTeamLogoStackState') >= 0 &&
    /_heroLogoLayoutRevision\s*=\s*\([\s\S]*\)\s*\+\s*1/.test(pageJs)
);

var normal = viewModel.resolveTeamLogoLayout({
  containerWidth: 300,
  logoDiameter: 28,
  normalGap: 12,
  count: 4
});
var collapsed = viewModel.resolveTeamLogoLayout({
  containerWidth: 120,
  logoDiameter: 28,
  normalGap: 12,
  count: 8
});
assert(
  '既有 Logo 口径不变：装得下靠左，装不下才 collapsed',
  normal.mode === 'normal' &&
    normal.groupWidth < 300 &&
    collapsed.mode === 'collapsed' &&
    collapsed.items[0].zIndex > collapsed.items[7].zIndex &&
    !/teamItems\.reverse\s*\(/.test(pageJs)
);

assert(
  '普通队际赛/队内赛页面不改',
  ordinaryWxml.indexOf('heroTeamLogoStack') < 0 &&
    ordinaryJs.indexOf('resolveHeroTeamLogoReturnRestore') < 0 &&
    ordinaryJs.indexOf('_heroLogoLayoutRevision') < 0
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
