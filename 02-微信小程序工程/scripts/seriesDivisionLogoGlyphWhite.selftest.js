/**
 * 队内多分队圆形 LOGO 首字符统一纯白
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesDivisionLogoGlyphWhite.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var pageDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');

var viewModel = require(path.join(pageDir, 'seriesDetailViewModel.js'));
var seriesColorMark = require(path.join(mini, 'utils', 'seriesColorMark.js'));

var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
var commonWxss = fs.readFileSync(path.join(mini, 'styles', 'tournament-common.wxss'), 'utf8');
var identityWxss = fs.readFileSync(
  path.join(mini, 'components', 'leaderboard-player-identity', 'index.wxss'),
  'utf8'
);
var identityWxml = fs.readFileSync(
  path.join(mini, 'components', 'leaderboard-player-identity', 'index.wxml'),
  'utf8'
);
var liveWxml = fs.readFileSync(
  path.join(mini, 'components', 'live-leaderboard-board', 'index.wxml'),
  'utf8'
);
var colorMarkSrc = fs.readFileSync(path.join(mini, 'utils', 'seriesColorMark.js'), 'utf8');
var vmSrc = fs.readFileSync(path.join(pageDir, 'seriesDetailViewModel.js'), 'utf8');

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

function isOpaqueWhite(decl) {
  var s = String(decl || '');
  return (
    /color:\s*#FFFFFF\b/i.test(s) &&
    !/color:\s*rgba?\(/i.test(s) &&
    !/opacity\s*:/.test(s)
  );
}

var sharedGlyphRule = extractRule(
  commonWxss,
  '.hero-logo-stack__fallback.series-division-logo-glyph,\n.sc-flag__text'
);
if (!sharedGlyphRule) {
  sharedGlyphRule = extractRule(
    commonWxss.replace(/\r\n/g, '\n'),
    '.hero-logo-stack__fallback.series-division-logo-glyph,\n.sc-flag__text'
  );
}

assert(
  '共用样式把 Hero/列表与展开角标首字符定为纯白',
  /hero-logo-stack__fallback\.series-division-logo-glyph/.test(commonWxss) &&
    /color:\s*#FFFFFF/.test(commonWxss) &&
    commonWxss.indexOf('.sc-flag__text') >= 0 &&
    isOpaqueWhite(sharedGlyphRule || commonWxss.slice(
      commonWxss.indexOf('.hero-logo-stack__fallback.series-division-logo-glyph'),
      commonWxss.indexOf('.hero-logo-stack__fallback.series-division-logo-glyph') + 280
    ))
);

assert(
  'Hero 色块首字符挂上共用纯白类',
  pageWxml.indexOf(
    'hero-logo-stack__fallback {{item.color ? \'series-division-logo-glyph\' : \'\'}}'
  ) >= 0
);

assert(
  '参赛分队列表色块首字符挂上共用纯白类',
  /hero-logo-stack__fallback series-division-logo-glyph/.test(pageWxml) &&
    pageWxml.indexOf('item.colorMark.fallbackText') >= 0
);

var identityFlagText = extractRule(identityWxss, '.sc-flag__text');
assert(
  '总榜展开身份卡角标文字为纯白（isolated 组件镜像共用色）',
  isOpaqueWhite(identityFlagText) &&
    identityWxml.indexOf('sc-flag__text') >= 0 &&
    liveWxml.indexOf('sc-flag__text') >= 0
);

var glyphSliceStart = commonWxss.indexOf('.hero-logo-stack__fallback.series-division-logo-glyph');
var glyphSlice = glyphSliceStart >= 0 ? commonWxss.slice(glyphSliceStart, glyphSliceStart + 280) : '';
assert(
  '不按底色切换深色字、不降低白色透明度',
  colorMarkSrc.indexOf('luminance') < 0 &&
    colorMarkSrc.indexOf('contrast') < 0 &&
    vmSrc.indexOf('luminance') < 0 &&
    /color:\s*#FFFFFF/.test(glyphSlice) &&
    !/rgba\(/i.test(glyphSlice) &&
    !/opacity/i.test(glyphSlice)
);

var light = seriesColorMark.buildColorMark({ name: '先锋', color: '#F5F5F5' });
var dark = seriesColorMark.buildColorMark({ name: 'alpha', color: '#112233' });
assert(
  '背景仍用创建时分队颜色，投影不写入文字色',
  light.color === '#F5F5F5' &&
    dark.color === '#112233' &&
    light.backgroundStyle.indexOf('#F5F5F5') >= 0 &&
    dark.fallbackText === 'A' &&
    !Object.prototype.hasOwnProperty.call(light, 'textColor') &&
    !Object.prototype.hasOwnProperty.call(light, 'textStyle') &&
    colorMarkSrc.indexOf('colorSnapshot') < 0
);

var fallbackRule = extractRule(pageWxss, '.hero-logo-stack__fallback');
assert(
  '尺寸字重布局保持：fallback 仍 22rpx/700，队际无图走次级灰字',
  /font-size:\s*22rpx/.test(fallbackRule) &&
    /font-weight:\s*700/.test(fallbackRule) &&
    /color:\s*var\(--text-secondary/.test(fallbackRule)
);

var org = viewModel.buildHeroParticipantDisplay({
  hostMode: 'organization',
  templateId: 'inter_team_series',
  participants: [
    {
      kind: 'team',
      seriesParticipantId: 'team:red',
      nameSnapshot: '红队',
      logoSnapshot: 'https://cdn/red.png'
    }
  ]
});
var orgList = viewModel.buildParticipantsView({
  hostMode: 'organization',
  templateId: 'inter_team_series',
  participants: [
    {
      kind: 'team',
      seriesParticipantId: 'team:red',
      nameSnapshot: '红队',
      logoSnapshot: 'https://cdn/red.png'
    }
  ]
});
assert(
  '队际系列赛仍走球队 LOGO，不套分队纯白字类',
  org.mode === 'team_logos' &&
    org.teamItems[0].logo === 'https://cdn/red.png' &&
    !org.teamItems[0].color &&
    orgList.items[0].logo === 'https://cdn/red.png' &&
    !orgList.items[0].colorMark &&
    pageWxml.indexOf("item.color ? 'series-division-logo-glyph'") >= 0
);

if (failed) {
  console.log('\npassed=' + passed + ' failed=' + failed);
  failures.forEach(function (f) {
    console.log(f);
  });
  process.exit(1);
}
console.log('\npassed=' + passed + ' failed=' + failed);
process.exit(0);
