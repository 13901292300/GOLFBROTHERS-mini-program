/**
 * SERIES-HERO-DATE-AUTOFIT：系列赛详情 Hero 周期字号三档
 * 不改日期格式；普通队内/队际赛 Hero、创建页、首页卡片零改动。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesHeroDateAutofit.selftest.js
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
var createSeriesPath = path.join(
  mini,
  'subpackages',
  'create',
  'pages',
  'series',
  'index.wxml'
);
var homeAdapterPath = path.join(mini, 'utils', 'seriesListCardAdapter.js');

var viewModel = require(path.join(pageDir, 'seriesDetailViewModel.js'));
var vmSrc = fs.readFileSync(path.join(pageDir, 'seriesDetailViewModel.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var ordinaryWxml = fs.readFileSync(path.join(ordinaryDir, 'index.wxml'), 'utf8');
var ordinaryWxss = fs.readFileSync(path.join(ordinaryDir, 'index.wxss'), 'utf8');
var createWxml = fs.readFileSync(createSeriesPath, 'utf8');
var homeAdapter = fs.readFileSync(homeAdapterPath, 'utf8');

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

function fontSizeRpx(rule) {
  var m = String(rule || '').match(/font-size:\s*(\d+(?:\.\d+)?)rpx/);
  return m ? Number(m[1]) : NaN;
}

function eventDateClassAttr(wxml) {
  var m = String(wxml || '').match(/<text\s+class="(event-date[^"]*)"/);
  return m ? m[1] : '';
}

function heroDateBindsSizeClass(wxml) {
  var cls = eventDateClassAttr(wxml);
  return (
    cls.indexOf('{{hero.dateRangeSizeClass}}') >= 0 &&
    String(wxml || '').indexOf('hero.dateText.length') < 0 &&
    String(wxml || '').indexOf('dateText.length') < 0 &&
    !/\{\{[^}]*length[^}]*event-date--/.test(String(wxml || ''))
  );
}

function accessPublished() {
  return {
    ok: true,
    lifecycleLabel: '已发布',
    lifecycleStatus: 'published',
    isDraftPreview: false
  };
}

function accessDraft() {
  return {
    ok: true,
    lifecycleLabel: '草稿',
    lifecycleStatus: 'draft',
    isDraftPreview: true
  };
}

function seriesWithRounds(rounds, extra) {
  var s = {
    seriesId: 's1',
    lifecycleStatus: 'published',
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: '测试系列赛',
    organization: {
      organizationId: 'o1',
      organizationName: '机构',
      organizationLogo: ''
    },
    hostTeam: {},
    participants: [],
    scoringRule: {
      mode: 'per_round_n',
      globalM: 10,
      allowRepeat: false,
      scoreBasis: 'gross'
    },
    visibility: 'public',
    rounds: rounds || []
  };
  if (extra) {
    Object.keys(extra).forEach(function (k) {
      s[k] = extra[k];
    });
  }
  return s;
}

var sameDay = [{ dateTime: '2026-08-11 08:00' }, { dateTime: '2026-08-11 14:30' }];
var sameYear = [{ dateTime: '2026-08-11 08:00' }, { dateTime: '2026-08-13 09:00' }];
var crossYear = [{ dateTime: '2026-12-31 08:00' }, { dateTime: '2027-01-02 09:00' }];
var extreme = [{ dateTime: '2026-09-28 08:00' }, { dateTime: '2027-09-30 08:00' }];
var startOnly = [{ dateTime: '2026-08-20 08:00' }, { dateTime: '' }];
var endOnly = [{ dateTime: '' }, { dateTime: '2026-05-18 08:00' }];

var sameDayText = viewModel.formatSeriesDateRange(sameDay);
var sameYearText = viewModel.formatSeriesDateRange(sameYear);
var crossYearText = viewModel.formatSeriesDateRange(crossYear);
var extremeText = viewModel.formatSeriesDateRange(extreme);
var startOnlyText = viewModel.formatSeriesDateRange(startOnly);
var endOnlyText = viewModel.formatSeriesDateRange(endOnly);
var pendingText = viewModel.formatSeriesDateRange([]);

assert('同日日期输出锁定', sameDayText === 'AUG 11 2026');
assert('同年跨日输出锁定', sameYearText === 'AUG 11-13 2026');
assert('跨年输出锁定', crossYearText === 'DEC 31 2026-JAN 02 2027');
assert(
  '极端月份跨年输出锁定',
  extremeText === 'SEP 28 2026-SEP 30 2027'
);
assert('无日期 → 比赛时间待定', pendingText === '比赛时间待定');
assert(
  '仅开始日期无多余分隔符',
  startOnlyText === 'AUG 20 2026' && startOnlyText.indexOf('-') < 0
);
assert(
  '仅结束日期无多余分隔符',
  endOnlyText === 'MAY 18 2026' && endOnlyText.indexOf('-') < 0
);

assert(
  '短档：同日/同年/待定为空 class',
  viewModel.resolveHeroDateRangeSizeClass(sameDayText) === '' &&
    viewModel.resolveHeroDateRangeSizeClass(sameYearText) === '' &&
    viewModel.resolveHeroDateRangeSizeClass(pendingText) === ''
);
assert(
  '中档：长度 18–22',
  viewModel.resolveHeroDateRangeSizeClass(new Array(18 + 1).join('x')) ===
    'event-date--md' &&
    viewModel.resolveHeroDateRangeSizeClass(new Array(22 + 1).join('x')) ===
      'event-date--md' &&
    viewModel.resolveHeroDateRangeSizeClass(new Array(17 + 1).join('x')) === ''
);
assert(
  '长档：跨年与极端月份',
  viewModel.resolveHeroDateRangeSizeClass(crossYearText) === 'event-date--lg' &&
    viewModel.resolveHeroDateRangeSizeClass(extremeText) === 'event-date--lg'
);
assert(
  '空串不给档位 class',
  viewModel.resolveHeroDateRangeSizeClass('') === '' &&
    viewModel.resolveHeroDateRangeSizeClass('   ') === ''
);

var publishedHero = viewModel.buildHeroView(
  seriesWithRounds(sameYear),
  accessPublished()
);
var draftHero = viewModel.buildHeroView(
  seriesWithRounds(sameYear, { lifecycleStatus: 'draft', seriesName: '草稿名' }),
  accessDraft()
);
var longNameHero = viewModel.buildHeroView(
  seriesWithRounds(sameYear, {
    seriesName: '超长中文赛事名称湘鹰队际系列赛第二季公开组'
  }),
  accessPublished()
);
var crossHero = viewModel.buildHeroView(
  seriesWithRounds(crossYear),
  accessPublished()
);

assert(
  'Hero 接线：dateRangeSizeClass 来自同一 dateText',
  publishedHero.dateText === sameYearText &&
    publishedHero.dateRangeSizeClass ===
      viewModel.resolveHeroDateRangeSizeClass(publishedHero.dateText)
);
assert(
  '草稿预览与已发布日期/档位一致',
  draftHero.dateText === publishedHero.dateText &&
    draftHero.dateRangeSizeClass === publishedHero.dateRangeSizeClass
);
assert(
  '赛事名称长度不影响日期容器投影',
  longNameHero.dateText === publishedHero.dateText &&
    longNameHero.dateRangeSizeClass === publishedHero.dateRangeSizeClass
);
assert(
  '跨年 Hero 使用长档且年份完整',
  crossHero.dateText === crossYearText &&
    crossHero.dateRangeSizeClass === 'event-date--lg' &&
    crossHero.dateText.indexOf('2026') >= 0 &&
    crossHero.dateText.indexOf('2027') >= 0 &&
    crossHero.dateText.indexOf('…') < 0 &&
    crossHero.dateText.indexOf('...') < 0
);

assert(
  '不复制 formatSeriesDateRange；月份走 clubDateFormat',
  (vmSrc.match(/function formatSeriesDateRange\s*\(/g) || []).length === 1 &&
    vmSrc.indexOf("require('../../../../utils/clubDateFormat.js')") >= 0 &&
    vmSrc.indexOf('clubDateFormat.formatDateRangeFromParts') >= 0 &&
    vmSrc.indexOf('function resolveHeroDateRangeSizeClass') >= 0 &&
    vmSrc.indexOf('dateRangeSizeClass: resolveHeroDateRangeSizeClass(dateText)') >= 0
);

assert(
  'WXML 使用 dateRangeSizeClass，无长度表达式',
  heroDateBindsSizeClass(pageWxml) &&
    eventDateClassAttr(pageWxml).indexOf('event-date--gold') >= 0 &&
    eventDateClassAttr(pageWxml).indexOf('event-date--live') >= 0
);
assert(
  '页面不用测量缩放日期',
  pageJs.indexOf('event-date') < 0 ||
    (pageJs.indexOf('createSelectorQuery') >= 0
      ? pageJs.indexOf("select('.event-date')") < 0 &&
        pageJs.indexOf('select(".event-date")') < 0
      : true)
);

var dateRule = extractRule(pageWxss, '.event-date');
var mdRule = extractRule(pageWxss, '.event-date--md');
var lgRule = extractRule(pageWxss, '.event-date--lg');
var baseSize = fontSizeRpx(dateRule);
var mdSize = fontSizeRpx(mdRule);
var lgSize = fontSizeRpx(lgRule);

assert(
  '容器 nowrap / overflow visible / 无横向滚动 / 无省略',
  /white-space:\s*nowrap/.test(dateRule) &&
    /overflow:\s*visible/.test(dateRule) &&
    !/overflow-x:\s*(auto|scroll)/.test(dateRule) &&
    !/text-overflow:\s*ellipsis/.test(dateRule) &&
    !/marquee/.test(dateRule) &&
    pageWxss.indexOf('@keyframes') < 0
);
assert(
  '日期区宽度不撑开（100% 且 intro padding 不变）',
  /width:\s*100%/.test(dateRule) &&
    /max-width:\s*100%/.test(dateRule) &&
    pageWxss.indexOf('.event-intro { padding: 128rpx 48rpx 0;') >= 0
);
assert(
  '三档字号：短=60，中略小，长再小且 ≥36rpx',
  baseSize === 60 &&
    mdSize < baseSize &&
    lgSize < mdSize &&
    lgSize >= 36
);
assert(
  '档位只改字号/字距，保留金色',
  /color:\s*var\(--champion-gold\)/.test(dateRule) &&
    /font-weight:\s*900/.test(dateRule) &&
    /font-style:\s*italic/.test(dateRule) &&
    /font-size:/.test(mdRule) &&
    /font-size:/.test(lgRule) &&
    !/color:/.test(mdRule) &&
    !/color:/.test(lgRule)
);

assert(
  '普通队内/队际赛 Hero 零改动',
  ordinaryWxml.indexOf('class="event-date">{{match.dateText}}</text>') >= 0 &&
    ordinaryWxml.indexOf('dateRangeSizeClass') < 0 &&
    ordinaryWxss.indexOf('event-date--md') < 0 &&
    ordinaryWxss.indexOf('event-date--lg') < 0 &&
    /font-size:\s*60rpx/.test(extractRule(ordinaryWxss, '.event-date'))
);
assert(
  '创建页与首页卡片不接线 Hero 档位',
  createWxml.indexOf('dateRangeSizeClass') < 0 &&
    createWxml.indexOf('event-date--md') < 0 &&
    homeAdapter.indexOf('resolveHeroDateRangeSizeClass') < 0 &&
    homeAdapter.indexOf('event-date--lg') < 0
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
