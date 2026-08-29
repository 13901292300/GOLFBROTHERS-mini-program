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
  pageJs.indexOf('buildHeroTeamLogoStackState') >= 0 &&
    !/teamItems\.reverse\s*\(/.test(pageJs) &&
    pageJs.indexOf('HERO_LOGO_SIZE_RPX = 56') >= 0 &&
    pageJs.indexOf('HERO_LOGO_GAP_RPX = 12') >= 0 &&
    pageJs.indexOf('_heroLogoFitKey') >= 0 &&
    !/margin-left:\s*-/.test(extractRule(pageWxss, '.hero-logo-stack')) &&
    !/(?:^|[^-])width:\s*100%/.test(extractRule(pageWxss, '.hero-logo-stack')) &&
    pageWxml.indexOf('stackWidthPx') >= 0 &&
    pageWxml.indexOf('+N') < 0
);

function rpxToPx(rpx, screenPx) {
  return (Number(rpx) / 750) * screenPx;
}

function heroLogoContentWidth(screenPx) {
  return screenPx - rpxToPx(48 * 2 + 32 * 2 + 84 + 24, screenPx);
}

function layoutAtScreen(count, screenPx) {
  return layout(count, heroLogoContentWidth(screenPx), rpxToPx(56, screenPx), rpxToPx(12, screenPx));
}

function matrixSafe(count, screenPx) {
  var box = heroLogoContentWidth(screenPx);
  var size = rpxToPx(56, screenPx);
  var laid = layoutAtScreen(count, screenPx);
  if (count === 0) return laid.items.length === 0 && laid.groupWidth === 0;
  if (laid.items[0].left !== 0) return false;
  var last = laid.items[count - 1];
  if (last.left < 0) return false;
  if (last.left + size - box > 1e-6) return false;
  if (laid.mode === 'normal' && laid.groupWidth - box > 1e-6) return false;
  for (var i = 1; i < count; i++) {
    if (laid.items[i].left < laid.items[i - 1].left) return false;
  }
  return true;
}

var m375_5 = layoutAtScreen(5, 375);
var m375_10 = layoutAtScreen(10, 375);
var m430_20 = layoutAtScreen(20, 430);
assert(
  '375/430 宽 × 0/1/5/10/20 支队：首项靠左、末项不越界、顺序不反转',
  matrixSafe(0, 375) &&
    matrixSafe(1, 375) &&
    matrixSafe(5, 375) &&
    matrixSafe(10, 375) &&
    matrixSafe(20, 375) &&
    matrixSafe(5, 430) &&
    matrixSafe(10, 430) &&
    matrixSafe(20, 430) &&
    m375_5.mode === 'normal' &&
    m375_10.mode === 'collapsed' &&
    m375_10.step < rpxToPx(56, 375) &&
    m430_20.mode === 'collapsed' &&
    Math.abs(m430_20.items[19].left + rpxToPx(56, 430) - heroLogoContentWidth(430)) < 1e-6 &&
    !/row-reverse/.test(pageWxss) &&
    !/row-reverse/.test(pageWxml)
);

var divisionHero = viewModel.buildHeroView(
  {
    hostMode: 'team',
    templateId: 'division_series',
    hostTeam: { teamLogo: 'https://host.example/logo.png', teamName: '主办队' },
    participants: [
      {
        kind: 'division',
        seriesParticipantId: 'd1',
        nameSnapshot: '红队',
        colorSnapshot: '#e11'
      },
      {
        kind: 'division',
        seriesParticipantId: 'd2',
        nameSnapshot: '蓝队',
        colorSnapshot: '#11e'
      }
    ]
  },
  { ok: true, lifecycleLabel: '已发布', lifecycleStatus: 'published', isDraftPreview: false }
);
var twoTeamHero = viewModel.buildHeroView(
  {
    hostMode: 'organization',
    organization: { organizationName: '机构' },
    participants: [
      { kind: 'team', seriesParticipantId: 'a', nameSnapshot: 'A', logoSnapshot: 'a.png' },
      { kind: 'team', seriesParticipantId: 'b', nameSnapshot: 'B', logoSnapshot: 'b.png' }
    ]
  },
  { ok: true, lifecycleLabel: '已发布', lifecycleStatus: 'published', isDraftPreview: false }
);
assert(
  '分队色块不吃主办 Logo；两队顺序与 participants 一致',
  divisionHero.participantDisplay.mode === 'team_logos' &&
    divisionHero.participantDisplay.teamItems.length === 2 &&
    divisionHero.participantDisplay.teamItems[0].logo === '' &&
    divisionHero.participantDisplay.teamItems[1].logo === '' &&
    divisionHero.participantDisplay.teamItems[0].color === '#e11' &&
    twoTeamHero.participantDisplay.teamItems.length === 2 &&
    twoTeamHero.participantDisplay.teamItems[0].participantId === 'a' &&
    twoTeamHero.participantDisplay.teamItems[1].participantId === 'b'
);

assert(
  'Hero 分队项去边框；真实球队 Logo 保留分隔边框；bright/dark 填充圆同径',
  /border:\s*1\.5px solid var\(--bg-card\)/.test(
    extractRule(pageWxss, '.hero-logo-stack__item')
  ) &&
    /border:\s*0/.test(extractRule(pageWxss, '.hero-logo-stack__item--division')) &&
    /border:\s*0/.test(extractRule(pageWxss, '.detail-page.dark-mode .hero-logo-stack__item--division')) &&
    /border:\s*none/.test(extractRule(pageWxss, '.participant-row__logo')) &&
    /width:\s*100%/.test(extractRule(pageWxss, '.series-division-logo-mark')) &&
    /height:\s*100%/.test(extractRule(pageWxss, '.series-division-logo-mark')) &&
    pageJs.indexOf('HERO_LOGO_SIZE_RPX = 56') >= 0 &&
    !/transform:\s*scale/.test(pageWxss)
);

var internalPlainHero = viewModel.buildHeroParticipantDisplay({
  hostMode: 'team',
  templateId: 'individual_tour',
  participants: [
    { kind: 'division', seriesParticipantId: 'd1', nameSnapshot: '红队', colorSnapshot: '#e11' },
    { kind: 'division', seriesParticipantId: 'd2', nameSnapshot: '蓝队', colorSnapshot: '#11e' }
  ]
});
assert(
  '非 division_series 的队内 Series 不被强制改成 Logo 栈',
  internalPlainHero.mode === 'division_tags' &&
    internalPlainHero.teamItems.length === 0 &&
    internalPlainHero.divisionItems.length === 2
);

assert(
  '2/5/10/20 个分队 Logo 栈不溢出且顺序不反转',
  matrixSafe(2, 375) &&
    matrixSafe(2, 430) &&
    matrixSafe(5, 375) &&
    matrixSafe(10, 375) &&
    matrixSafe(20, 375) &&
    matrixSafe(20, 430)
);

assert(
  'Hero 其他区域与普通页不受影响',
  pageWxml.indexOf('series-hero-meta-list') >= 0 &&
    pageWxml.indexOf('series-hero-course-list') >= 0 &&
    /<text\s+class="event-date[^"]*\{\{hero\.dateRangeSizeClass\}\}/.test(pageWxml) &&
    pageWxml.indexOf('event-title__line--main') >= 0 &&
    pageWxml.indexOf('leftPx') >= 0 &&
    pageWxml.indexOf('stackWidthPx') >= 0 &&
    ordinaryWxml.indexOf('hero-logo-stack') < 0 &&
    ordinaryWxss.indexOf('hero-logo-stack') < 0
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
