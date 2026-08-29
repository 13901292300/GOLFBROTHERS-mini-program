/**
 * SERIES-HERO-META-ALIGN-R2：Hero 主办/球队/球场纵向三行 + Logo 左上叠放
 * 不改日期档位、数据投影、普通赛事页。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesHeroMetaAlign.selftest.js
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
var heroMetaStart = pageWxml.indexOf('series-hero-meta-list');
var heroMetaSlice = pageWxml.slice(
  heroMetaStart,
  pageWxml.indexOf('section-divider')
);
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

function sliceHeroMetaWxss(wxss) {
  var start = wxss.indexOf('/* Hero 三项');
  if (start < 0) start = wxss.indexOf('.series-hero-meta-list');
  var end = wxss.indexOf('.hero-logo-stack');
  if (start < 0) return '';
  return wxss.slice(start, end > start ? end : start + 2500);
}

var metaWxss = sliceHeroMetaWxss(pageWxss);
var listRule = extractRule(pageWxss, '.series-hero-meta-list');
var rowRule = extractRule(pageWxss, '.series-hero-meta-row');
var labelRule = extractRule(pageWxss, '.series-hero-meta-label');
var contentRule = extractRule(pageWxss, '.series-hero-meta-content');
var textRule = extractRule(pageWxss, '.series-hero-meta-text');
var courseRowRule = extractRule(pageWxss, '.series-hero-meta-row--courses');
var courseListRule = extractRule(pageWxss, '.series-hero-course-list');
var courseItemRule = extractRule(pageWxss, '.series-hero-course-item');

assert(
  '容器为纵向三行',
  pageWxml.indexOf('class="series-hero-meta-list"') >= 0 &&
    /flex-direction:\s*column/.test(listRule) &&
    /row-gap:/.test(listRule) &&
    (pageWxml.match(/class="series-hero-meta-row"/g) || []).length >= 3
);
assert(
  '三行使用同一 row class',
  pageWxml.indexOf('series-hero-meta-item') < 0 &&
    (pageWxml.match(/class="series-hero-meta-row"/g) || []).length >= 3 &&
    (pageWxml.match(/class="series-hero-meta-label"/g) || []).length >= 3 &&
    (pageWxml.match(/class="series-hero-meta-content"/g) || []).length >= 3
);
assert(
  'label 固定宽度且 flex:none',
  /width:\s*84rpx/.test(labelRule) &&
    /flex:\s*none/.test(labelRule) &&
    !/margin-bottom:/.test(labelRule) &&
    !/margin-top:/.test(labelRule)
);
assert(
  'row 使用 align-items:center，统一 min-height，无各行 margin',
  /display:\s*flex/.test(rowRule) &&
    /align-items:\s*center/.test(rowRule) &&
    /min-height:\s*56rpx/.test(rowRule) &&
    !/margin-top:/.test(rowRule) &&
    !/margin-bottom:/.test(rowRule) &&
    /flex:\s*1/.test(contentRule) &&
    /min-width:\s*0/.test(contentRule)
);
assert(
  '不存在三列布局',
  pageWxml.indexOf('series-hero-meta-item') < 0 &&
    pageWxss.indexOf('series-hero-meta-item') < 0 &&
    pageWxss.indexOf('series-hero-meta-content--teams') < 0 &&
    pageWxss.indexOf('series-hero-meta-content--courses') < 0 &&
    !/grid-template-columns/.test(metaWxss) &&
    !/flex-direction:\s*column/.test(rowRule) &&
    !/max-height:\s*56rpx/.test(contentRule) &&
    !/translateY/.test(metaWxss)
);
assert(
  '球场单行省略仅球场项，列表本身纵向',
  pageWxml.indexOf('series-hero-course-list') >= 0 &&
    pageWxml.indexOf('series-hero-course-item') >= 0 &&
    pageWxml.indexOf('wx:for="{{item.courseLines}}"') >= 0 &&
    /flex-direction:\s*column/.test(courseListRule) &&
    !/white-space:\s*nowrap/.test(courseListRule) &&
    !/overflow-x:\s*(auto|scroll)/.test(courseListRule) &&
    /white-space:\s*nowrap/.test(courseItemRule) &&
    /overflow:\s*hidden/.test(courseItemRule) &&
    /text-overflow:\s*ellipsis/.test(courseItemRule) &&
    /min-width:\s*0/.test(courseItemRule) &&
    /width:\s*100%/.test(courseItemRule) &&
    !/text-overflow:\s*ellipsis/.test(textRule) &&
    !/white-space:\s*nowrap/.test(textRule) &&
    !/overflow:\s*hidden/.test(contentRule)
);
assert(
  '多球场标题对齐第一项而非列表中线',
  pageWxml.indexOf('series-hero-meta-row--courses') >= 0 &&
    /align-items:\s*flex-start/.test(courseRowRule) &&
    /align-items:\s*center/.test(rowRule) &&
    /line-height:\s*1\.45/.test(labelRule) &&
    /line-height:\s*1\.45/.test(courseItemRule) &&
    !/translateY/.test(courseRowRule) &&
    !/margin-top:\s*-/.test(courseRowRule)
);
assert(
  '无球场名称拼接 / +N',
  pageWxml.indexOf('courseLines.join') < 0 &&
    !/courseLines\.join/.test(pageJs) &&
    pageWxml.indexOf('+N') < 0 &&
    pageWxml.indexOf('hiddenCount') < 0 &&
    heroMetaSlice.indexOf('、') < 0 &&
    heroMetaSlice.indexOf(' / ') < 0
);

var threeCourses = viewModel.buildSeriesCourseLines([
  { courseId: 'c1', courseName: '球场一' },
  { courseId: 'c2', courseName: '球场二' },
  { courseId: 'c3', courseName: '球场三' }
]);
var oneCourse = viewModel.buildSeriesCourseLines([
  { courseId: 'c1', courseName: '北京雁栖湖高尔夫俱乐部' }
]);
assert(
  '单球场一行、多球场逐项且顺序不反转',
  oneCourse.lines.length === 1 &&
    oneCourse.lines[0] === '北京雁栖湖高尔夫俱乐部' &&
    threeCourses.lines.length === 3 &&
    threeCourses.lines[0] === '球场一' &&
    threeCourses.lines[1] === '球场二' &&
    threeCourses.lines[2] === '球场三'
);

var z4 = viewModel.resolveLogoStackZIndexes(4);
assert(
  'Logo 左侧层级最高',
  z4[0] === 4 &&
    z4[1] === 3 &&
    z4[3] === 1 &&
    z4[0] > z4[z4.length - 1] &&
    z4.every(function (z) {
      return z >= 1;
    })
);

var normal4 = viewModel.calculateLogoStackLayout({
  count: 4,
  availableWidth: 200,
  logoSize: 28,
  normalGap: 12
});
var collapsed8 = viewModel.calculateLogoStackLayout({
  count: 8,
  availableWidth: 120,
  logoSize: 28,
  normalGap: 12
});
var stackRule = extractRule(pageWxss, '.hero-logo-stack');
assert(
  'Logo 正常靠左、折叠才铺满且不反转',
  normal4.mode === 'normal' &&
    Math.abs(normal4.step - 40) < 1e-6 &&
    normal4.positions[0] === 0 &&
    Math.abs(normal4.positions[3] + 28 - (4 * 28 + 3 * 12)) < 1e-6 &&
    collapsed8.mode === 'collapsed' &&
    collapsed8.step < 28 &&
    collapsed8.zIndexes[0] > collapsed8.zIndexes[7] &&
    pageJs.indexOf('buildHeroTeamLogoStackState') >= 0 &&
    !/teamItems\.reverse\s*\(/.test(pageJs) &&
    pageJs.indexOf('HERO_LOGO_SIZE_RPX = 56') >= 0 &&
    pageJs.indexOf('HERO_LOGO_GAP_RPX = 12') >= 0 &&
    !/(?:^|[^-])width:\s*100%/.test(stackRule) &&
    /overflow:\s*visible/.test(stackRule) &&
    !/margin-left:\s*-/.test(stackRule) &&
    /border:\s*1\.5px solid/.test(extractRule(pageWxss, '.hero-logo-stack__item'))
);

var accessOk = {
  ok: true,
  lifecycleLabel: '已发布',
  lifecycleStatus: 'published',
  isDraftPreview: false
};
var orgHero = viewModel.buildHeroView(
  {
    hostMode: 'organization',
    organization: { organizationName: '湘鹰高球' },
    participants: [
      { kind: 'team', seriesParticipantId: 't1', nameSnapshot: '甲队', logoSnapshot: 'a.png' },
      { kind: 'team', seriesParticipantId: 't2', nameSnapshot: '乙队', logoSnapshot: 'b.png' }
    ],
    rounds: [
      { courseId: 'c1', courseName: '球场一' },
      { courseId: 'c2', courseName: '球场二' }
    ]
  },
  accessOk
);
var clubHero = viewModel.buildHeroView(
  {
    hostMode: 'team',
    templateId: 'intra_team_series',
    hostTeam: { teamName: '主办队', teamLogo: 'host.png' },
    participants: [
      { kind: 'division', seriesParticipantId: 'd1', nameSnapshot: '红队', colorSnapshot: '#f00' }
    ]
  },
  accessOk
);
assert(
  'infoRows 主办→参赛主体→球场，ORG/CLUB 分流',
  orgHero.infoRows[0].label === '主办' &&
    orgHero.infoRows[0].value === '湘鹰高球' &&
    orgHero.infoRows[1].kind === 'team_logos' &&
    orgHero.infoRows[2].kind === 'courses' &&
    orgHero.infoRows[2].courseLines[0] === '球场一' &&
    orgHero.infoRows[2].courseLines[1] === '球场二' &&
    orgHero.dividerText === 'ORG' &&
    clubHero.dividerText === 'CLUB' &&
    clubHero.infoRows[1].kind === 'division_tags' &&
    clubHero.participantDisplay.teamItems.length === 0 &&
    pageWxml.indexOf("hero.hostMode === 'team' ? 'CLUB' : 'ORG'") >= 0
);

assert(
  '日期自适应接线仍存在',
  /<text\s+class="event-date[^"]*\{\{hero\.dateRangeSizeClass\}\}/.test(pageWxml) &&
    pageWxml.indexOf('hero.dateText.length') < 0 &&
    pageWxml.indexOf('dateText.length') < 0 &&
    pageWxss.indexOf('.event-date--md') >= 0 &&
    pageWxss.indexOf('.event-date--lg') >= 0
);
assert(
  '普通赛事页面零改动',
  ordinaryWxml.indexOf('class="info-row"><text class="info-row-label">主办</text>') >= 0 &&
    ordinaryWxml.indexOf('series-hero-meta') < 0 &&
    ordinaryWxss.indexOf('series-hero-meta') < 0 &&
    ordinaryWxss.indexOf('hero-logo-stack') < 0
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
