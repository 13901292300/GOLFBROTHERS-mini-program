/**
 * SERIES-HERO-TITLE-RESTORE：比赛名称恢复换行，日期 nowrap 与球场 ellipsis 不外溢
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesHeroTitleRestore.selftest.js
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

var introRule = extractRule(pageWxss, '.event-intro');
var dateRule = extractRule(pageWxss, '.event-date');
var titleRule = extractRule(pageWxss, '.event-title');
var titleLineRule = extractRule(pageWxss, '.event-title__line');
var contentRule = extractRule(pageWxss, '.series-hero-meta-content');
var textRule = extractRule(pageWxss, '.series-hero-meta-text');
var courseRule = extractRule(pageWxss, '.series-hero-course-item');
var courseListRule = extractRule(pageWxss, '.series-hero-course-list');

assert(
  '标题保持原换行契约，无单行 ellipsis',
  pageWxml.indexOf('class="event-title__line event-title__line--main"') >= 0 &&
    /display:\s*block/.test(titleLineRule) &&
    /font-size:\s*40rpx/.test(titleLineRule) &&
    !/white-space:\s*nowrap/.test(titleLineRule) &&
    !/text-overflow:\s*ellipsis/.test(titleLineRule) &&
    !/overflow:\s*hidden/.test(titleLineRule) &&
    !/-webkit-line-clamp/.test(titleLineRule) &&
    !/white-space:\s*nowrap/.test(titleRule) &&
    !/white-space:\s*nowrap/.test(introRule)
);

assert(
  '日期 nowrap 仅日期节点',
  /white-space:\s*nowrap/.test(dateRule) &&
    pageWxss.indexOf('.event-date--lg') >= 0 &&
    pageWxml.indexOf('class="event-date {{hero.dateRangeSizeClass}}"') >= 0 &&
    !/white-space:\s*nowrap/.test(introRule)
);

assert(
  '球场 ellipsis 仅球场项，列表可纵向增长',
  pageWxml.indexOf('series-hero-course-item') >= 0 &&
    /text-overflow:\s*ellipsis/.test(courseRule) &&
    /white-space:\s*nowrap/.test(courseRule) &&
    /overflow:\s*hidden/.test(courseRule) &&
    /min-width:\s*0/.test(courseRule) &&
    /flex-direction:\s*column/.test(courseListRule) &&
    !/white-space:\s*nowrap/.test(courseListRule) &&
    !/text-overflow:\s*ellipsis/.test(textRule) &&
    !/overflow:\s*hidden/.test(contentRule)
);

assert(
  'meta 仍为纵向三行',
  pageWxml.indexOf('series-hero-meta-list') >= 0 &&
    pageWxml.indexOf('series-hero-meta-row') >= 0 &&
    pageWxml.indexOf('series-hero-meta-item') < 0 &&
    /flex-direction:\s*column/.test(extractRule(pageWxss, '.series-hero-meta-list'))
);

var hero = viewModel.buildHeroView(
  {
    seriesName: '湘鹰队际系列赛超长中文名称测试',
    seriesSubtitle: '',
    hostMode: 'organization',
    organization: { organizationName: '主办' },
    rounds: [{ dateTime: '2026-12-31 08:00' }, { dateTime: '2027-01-02 09:00' }]
  },
  { ok: true, lifecycleLabel: '已发布', lifecycleStatus: 'published', isDraftPreview: false }
);
assert(
  '比赛名称完整投影且跨年日期仍走长档',
  hero.titleMain === '湘鹰队际系列赛超长中文名称测试' &&
    hero.dateText === 'Dec/31 (2026)-Jan/02 (2027)' &&
    hero.dateRangeSizeClass === 'event-date--lg'
);

assert(
  '普通赛事页面零改动',
  ordinaryWxml.indexOf('class="event-title__line">{{match.titleMain}}</text>') >= 0 &&
    ordinaryWxml.indexOf('dateRangeSizeClass') < 0 &&
    !/text-overflow:\s*ellipsis/.test(extractRule(ordinaryWxss, '.event-title__line')) &&
    ordinaryWxss.indexOf('series-hero-meta') < 0
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
