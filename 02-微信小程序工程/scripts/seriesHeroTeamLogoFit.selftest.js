/**
 * SERIES-HERO-TEAM-LOGO-FIT：正常固定间距靠左；装不下才 collapsed 铺满
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesHeroTeamLogoFit.selftest.js
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
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var ordinaryWxml = fs.readFileSync(path.join(ordinaryDir, 'index.wxml'), 'utf8');
var ordinaryWxss = fs.readFileSync(path.join(ordinaryDir, 'index.wxss'), 'utf8');

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

function extractRule(wxss, selector) {
  var re = new RegExp(
    selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'
  );
  var m = wxss.match(re);
  return m ? m[1] : '';
}

function layout(count, width, size, gap) {
  return viewModel.resolveTeamLogoLayout({
    containerWidth: width,
    logoDiameter: size,
    normalGap: gap == null ? 12 : gap,
    count: count
  });
}

var empty = layout(0, 200, 28, 12);
assert(
  '0 个不渲染',
  empty.mode === 'normal' && empty.items.length === 0 && empty.groupWidth === 0
);

var one = layout(1, 200, 28, 12);
assert(
  '1 个靠左',
  one.mode === 'normal' &&
    one.items[0].left === 0 &&
    one.groupWidth === 28 &&
    one.step === 0
);

var two = layout(2, 200, 28, 12);
var three = layout(3, 300, 28, 12);
var four = layout(4, 300, 28, 12);
assert(
  '2–4 个装得下：固定间距、右侧留空、不铺满',
  two.mode === 'normal' &&
    three.mode === 'normal' &&
    four.mode === 'normal' &&
    Math.abs(two.step - 40) < 1e-6 &&
    Math.abs(three.step - 40) < 1e-6 &&
    four.items[0].left === 0 &&
    Math.abs(four.groupWidth - (4 * 28 + 3 * 12)) < 1e-6 &&
    four.groupWidth < 300 &&
    Math.abs(four.items[3].left + 28 - four.groupWidth) < 1e-6
);

var exact = layout(5, 5 * 28 + 4 * 12, 28, 12);
assert(
  '正常宽度刚好等于容器：不折叠',
  exact.mode === 'normal' &&
    Math.abs(exact.step - 40) < 1e-6 &&
    Math.abs(exact.groupWidth - (5 * 28 + 4 * 12)) < 1e-6
);

var shrinkGap = layout(5, 160, 28, 12);
assert(
  'gap 装不下但本体仍装得下：缩小间距不覆盖',
  shrinkGap.mode === 'collapsed' &&
    5 * 28 <= 160 &&
    shrinkGap.step >= 28 &&
    shrinkGap.step < 28 + 12 &&
    shrinkGap.items[0].left === 0 &&
    Math.abs(shrinkGap.items[4].left + 28 - 160) < 1e-6 &&
    Math.abs(shrinkGap.groupWidth - 160) < 1e-6
);

var overlap = layout(8, 120, 28, 12);
assert(
  '本体也装不下：重叠且首尾贴边铺满',
  overlap.mode === 'collapsed' &&
    overlap.step < 28 &&
    overlap.items[0].left === 0 &&
    Math.abs(overlap.items[7].left + 28 - 120) < 1e-6 &&
    Math.abs(overlap.groupWidth - 120) < 1e-6 &&
    overlap.items[0].zIndex > overlap.items[1].zIndex &&
    overlap.items[1].zIndex > overlap.items[7].zIndex &&
    overlap.items[7].zIndex === 1
);

assert(
  '数据顺序不反转、尺寸不变',
  pageJs.indexOf('teamItems.map') >= 0 &&
    !/teamItems\.reverse\s*\(/.test(pageJs) &&
    pageJs.indexOf('HERO_LOGO_SIZE_RPX = 56') >= 0 &&
    pageJs.indexOf('HERO_LOGO_GAP_RPX = 12') >= 0 &&
    pageJs.indexOf('resolveTeamLogoLayout') >= 0 &&
    pageJs.indexOf('_heroLogoFitKey') >= 0 &&
    !/margin-left:\s*-/.test(extractRule(pageWxss, '.hero-logo-stack')) &&
    !/(?:^|[^-])width:\s*100%/.test(extractRule(pageWxss, '.hero-logo-stack')) &&
    pageWxml.indexOf('stackWidthPx') >= 0 &&
    pageWxml.indexOf('+N') < 0
);

assert(
  'Hero 其他区域与普通页不受影响',
  pageWxml.indexOf('series-hero-meta-list') >= 0 &&
    pageWxml.indexOf('series-hero-course-list') >= 0 &&
    pageWxml.indexOf('class="event-date {{hero.dateRangeSizeClass}}"') >= 0 &&
    pageWxml.indexOf('event-title__line--main') >= 0 &&
    ordinaryWxml.indexOf('hero-logo-stack') < 0 &&
    ordinaryWxss.indexOf('hero-logo-stack') < 0
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
