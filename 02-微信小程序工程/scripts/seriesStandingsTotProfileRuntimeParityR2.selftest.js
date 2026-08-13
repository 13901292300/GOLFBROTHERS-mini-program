/**
 * TOT-PROFILE-RUNTIME-PARITY-R2
 * 资料栏真实视觉由 leaderboard-player-identity/index.wxss 自己保证。
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsTotProfileRuntimeParityR2.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..', 'miniprogram');
var pageWxml = fs.readFileSync(
  path.join(root, 'subpackages', 'tournament', 'pages', 'series-detail', 'index.wxml'),
  'utf8'
);
var identityWxml = fs.readFileSync(
  path.join(root, 'components', 'leaderboard-player-identity', 'index.wxml'),
  'utf8'
);
var identityJs = fs.readFileSync(
  path.join(root, 'components', 'leaderboard-player-identity', 'index.js'),
  'utf8'
);
var identityWxss = fs.readFileSync(
  path.join(root, 'components', 'leaderboard-player-identity', 'index.wxss'),
  'utf8'
);
var panelDir = path.join(root, 'components', 'leaderboard-player-profile-panel');
var panelWxml = fs.readFileSync(path.join(panelDir, 'index.wxml'), 'utf8');
var panelWxss = fs.readFileSync(path.join(panelDir, 'index.wxss'), 'utf8');
var panelJs = fs.readFileSync(path.join(panelDir, 'index.js'), 'utf8');
var panelJson = fs.readFileSync(path.join(panelDir, 'index.json'), 'utf8');
var personalWxml = fs.readFileSync(
  path.join(root, 'components', 'personal-leaderboard-board', 'index.wxml'),
  'utf8'
);
var personalWxss = fs.readFileSync(
  path.join(root, 'components', 'personal-leaderboard-board', 'index.wxss'),
  'utf8'
);
var personalJson = fs.readFileSync(
  path.join(root, 'components', 'personal-leaderboard-board', 'index.json'),
  'utf8'
);
var pageJson = fs.readFileSync(
  path.join(root, 'subpackages', 'tournament', 'pages', 'series-detail', 'index.json'),
  'utf8'
);

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

function countRe(src, re) {
  var n = 0;
  var copy = new RegExp(re.source, re.flags.indexOf('g') >= 0 ? re.flags : re.flags + 'g');
  while (copy.exec(src)) n += 1;
  return n;
}

function extractTag(src, tagName, fromIndex) {
  var token = '<' + tagName;
  var start = src.indexOf(token, fromIndex || 0);
  if (start < 0) return '';
  var selfClose = src.indexOf('/>', start);
  var openClose = src.indexOf('>', start);
  if (selfClose >= 0 && (openClose < 0 || selfClose < openClose)) {
    return src.slice(start, selfClose + 2);
  }
  var endToken = '</' + tagName + '>';
  var end = src.indexOf(endToken, start);
  if (end < 0) return src.slice(start, openClose + 1);
  return src.slice(start, end + endToken.length);
}

function attrNames(tag) {
  var names = [];
  var re = /(^|\s)([A-Za-z0-9_:-]+)(?:=)/g;
  var m;
  while ((m = re.exec(tag))) {
    var name = m[2];
    if (name === 'wx:if' || name === 'wx:else' || name === 'wx:for' || name === 'wx:for-item' || name === 'wx:key' || name === 'wx:for-index') {
      continue;
    }
    names.push(name);
  }
  return names.sort();
}

function sliceBetween(src, startNeedle, endNeedle) {
  var start = src.indexOf(startNeedle);
  if (start < 0) return '';
  var end = endNeedle ? src.indexOf(endNeedle, start + startNeedle.length) : src.length;
  if (end < 0) end = src.length;
  return src.slice(start, end);
}

var teamWrapStart = pageWxml.indexOf('team-leaderboard-players-wrap');
var teamWrap = teamWrapStart >= 0 ? pageWxml.slice(teamWrapStart) : '';
var totExpand = sliceBetween(
  teamWrap,
  'wx:if="{{openStandingsScorecardKey === player.scorecardKey}}"',
  'scorecard-dark-panel'
);
var totRanking = sliceBetween(teamWrap, 'team-leaderboard-player-row', 'TOT/R 球队行展开');
var r1Ranking = sliceBetween(personalWxml, 'leaderboard-row leaderboard-row--personal', '展开成绩卡');
var r1Expand = sliceBetween(personalWxml, 'wx:if="{{item.expanded}}"', 'prestartExpandMode');
var totMount = sliceBetween(
  teamWrap,
  'wx:if="{{openStandingsScorecardKey === player.scorecardKey}}"',
  'tour-scorecard'
);
var r1Mount = sliceBetween(personalWxml, 'wx:if="{{item.expanded}}"', 'tour-scorecard');
var totPanel = extractTag(totExpand, 'leaderboard-player-profile-panel');
var r1G1Panel = '';
(function () {
  var elseAt = personalWxml.indexOf('<leaderboard-player-profile-panel\n      wx:else');
  if (elseAt < 0) elseAt = personalWxml.indexOf('wx:else');
  r1G1Panel = extractTag(personalWxml, 'leaderboard-player-profile-panel', elseAt >= 0 ? elseAt : 0);
  if (r1G1Panel.indexOf('wx:else') < 0) {
    var second = personalWxml.indexOf('<leaderboard-player-profile-panel', personalWxml.indexOf('<leaderboard-player-profile-panel') + 1);
    r1G1Panel = extractTag(personalWxml, 'leaderboard-player-profile-panel', second);
  }
})();

assert(
  '1 TOT 展开头像 DOM 只出现在共享面板链路，宿主展开区 0 次',
  totExpand.indexOf('<leaderboard-player-profile-panel') >= 0 &&
    countRe(totExpand, /<leaderboard-player-profile-panel/g) === 1 &&
    totExpand.indexOf('<leaderboard-player-identity') < 0 &&
    totExpand.indexOf('class="scorecard-profile"') < 0 &&
    totExpand.indexOf('sc-avatar') < 0 &&
    totExpand.indexOf('<image') < 0
);

assert(
  '1 R1 G1 展开宿主同样 0 次资料头像 DOM',
  r1Expand.indexOf('<leaderboard-player-profile-panel') >= 0 &&
    r1Expand.indexOf('<leaderboard-player-identity') < 0 &&
    r1Expand.indexOf('class="scorecard-profile"') < 0 &&
    r1Expand.indexOf('sc-avatar') < 0 &&
    r1Expand.indexOf('<image') < 0
);

assert(
  '1 共享链路头像只出现一次：panel→identity→.sc-avatar',
  countRe(panelWxml, /<leaderboard-player-identity/g) === 1 &&
    panelWxml.indexOf('sc-avatar') < 0 &&
    panelWxml.indexOf('scorecard-profile') < 0 &&
    countRe(identityWxml, /class="scorecard-profile"/g) === 1 &&
    countRe(identityWxml, /class="sc-avatar"/g) === 1 &&
    /<image[\s\S]*?class="sc-avatar"/.test(identityWxml)
);

assert(
  '6 排名行没有展开资料头像，不计入重复',
  totRanking.indexOf('<image') < 0 &&
    totRanking.indexOf('sc-avatar') < 0 &&
    totRanking.indexOf('leaderboard-player-profile-panel') < 0 &&
    r1Ranking.indexOf('<image') < 0 &&
    r1Ranking.indexOf('sc-avatar') < 0 &&
    r1Ranking.indexOf('leaderboard-player-profile-panel') < 0
);

var totAttrs = attrNames(totPanel);
var r1Attrs = attrNames(r1G1Panel);
assert(
  '2 TOT 与 R1 宿主标签及 props 签名一致',
  totPanel.indexOf('<leaderboard-player-profile-panel') === 0 &&
    r1G1Panel.indexOf('<leaderboard-player-profile-panel') === 0 &&
    totAttrs.join(',') === r1Attrs.join(','),
  'tot=' + totAttrs.join(',') + ' r1=' + r1Attrs.join(',')
);

assert(
  '3 .scorecard-profile 权威结构只存在于共享 identity',
  identityWxml.indexOf('class="scorecard-profile"') >= 0 &&
    pageWxml.indexOf('class="scorecard-profile"') < 0 &&
    personalWxml.indexOf('class="scorecard-profile"') < 0 &&
    panelWxml.indexOf('class="scorecard-profile"') < 0
);

assert(
  '4 TOT/R 宿主不存在资料区专用头像 DOM',
  pageWxml.indexOf('class="sc-avatar"') < 0 &&
    pageWxml.indexOf('sc-avatar-wrap') < 0 &&
    pageWxml.indexOf('<leaderboard-player-identity') < 0 &&
    personalWxml.indexOf('class="sc-avatar"') < 0 &&
    personalWxml.indexOf('sc-avatar-wrap') < 0 &&
    personalWxml.indexOf('<leaderboard-player-identity') < 0
);

var identityCss = identityWxss.replace(/\/\*[\s\S]*?\*\//g, '');
var panelCss = panelWxss.replace(/\/\*[\s\S]*?\*\//g, '');

assert(
  '样式归属：.sc-avatar 160rpx 圆形规则写在 identity/index.wxss',
  !/@import/.test(identityCss) &&
    /\.sc-avatar\s*\{[^}]*width:\s*160rpx/.test(identityCss) &&
    /\.sc-avatar\s*\{[^}]*height:\s*160rpx/.test(identityCss) &&
    /\.sc-avatar\s*\{[^}]*border-radius:\s*50%/.test(identityCss) &&
    /\.scorecard-profile\s*\{[^}]*display:\s*flex/.test(identityCss) &&
    /\.scorecard-profile\s*\{[^}]*padding:\s*32rpx/.test(identityCss) &&
    /\.scorecard-profile\s*\{[^}]*width:\s*100%/.test(identityCss) &&
    /\.sc-profile-left\s*\{/.test(identityCss) &&
    /\.sc-avatar-wrap\s*\{/.test(identityCss) &&
    /\.sc-flag\s*\{/.test(identityCss) &&
    /\.sc-profile-meta\s*\{/.test(identityCss) &&
    /\.sc-name\s*\{/.test(identityCss) &&
    /\.sc-name-gender/.test(identityCss) &&
    /\.sc-sub\s*\{/.test(identityCss) &&
    /\.sc-chevron\s*\{/.test(identityCss) &&
    /\.sc-rel-tag\s*\{/.test(identityCss) &&
    identityCss.indexOf('.detail-page') < 0 &&
    identityCss.indexOf('personal-leaderboard') < 0
);

assert(
  '父 panel 不包含对子组件内部 .sc-* 的样式控制',
  !fs.existsSync(path.join(panelDir, 'profile-shell.wxss')) &&
    panelWxss.indexOf('@import') < 0 &&
    !/\.sc-[a-zA-Z]/.test(panelCss) &&
    panelCss.indexOf('scorecard-profile') < 0 &&
    panelJs.indexOf('profile-shell') < 0 &&
    identityJs.indexOf('virtualHost') < 0
);

assert(
  'identity 自身 isolated，头像尺寸写在真实 image 节点上（不依赖父 WXSS / 页面祖先）',
  /"styleIsolation":\s*"isolated"/.test(
    fs.readFileSync(path.join(root, 'components', 'leaderboard-player-identity', 'index.json'), 'utf8')
  ) &&
    identityJs.indexOf("styleIsolation: 'isolated'") >= 0 &&
    /<image[\s\S]*class="sc-avatar"[\s\S]*style="[^"]*width:160rpx[\s\S]*height:160rpx[\s\S]*border-radius:50%/.test(
      identityWxml
    )
);

assert(
  'lazyCodeLoading 下页面/R1 宿主声明 identity，确保子组件 WXSS 被打包',
  /"leaderboard-player-identity"/.test(pageJson) &&
    /"leaderboard-player-identity"/.test(personalJson) &&
    pageWxml.indexOf('<leaderboard-player-identity') < 0 &&
    personalWxml.indexOf('<leaderboard-player-identity') < 0
);

assert(
  'TOT 与 R1 均引用同一 panel → identity',
  /leaderboard-player-profile-panel/.test(pageJson) &&
    /leaderboard-player-profile-panel/.test(personalJson) &&
    /leaderboard-player-identity/.test(panelJson) &&
    /<leaderboard-player-identity/.test(panelWxml) &&
    totExpand.indexOf('<leaderboard-player-profile-panel') >= 0 &&
    personalWxml.indexOf('<leaderboard-player-profile-panel') >= 0
);

assert(
  'TOT/R1 均不传 themeClass / 头像尺寸分叉',
  totPanel.indexOf('themeClass') < 0 &&
    r1G1Panel.indexOf('themeClass') < 0 &&
    totPanel.indexOf('theme-class') < 0 &&
    r1G1Panel.indexOf('theme-class') < 0 &&
    totPanel.indexOf('160rpx') < 0 &&
    r1G1Panel.indexOf('160rpx') < 0 &&
    totPanel.indexOf('avatar-badge') >= 0 &&
    r1G1Panel.indexOf('avatar-badge') >= 0
);

assert(
  '挂法同构：panel → 状态/逐洞卡，宿主不包 .scorecard-profile',
  totMount.indexOf('<leaderboard-player-profile-panel') >= 0 &&
    totMount.indexOf('scorecard-dark-panel') > totMount.indexOf('<leaderboard-player-profile-panel') &&
    r1Mount.indexOf('<leaderboard-player-profile-panel') >= 0 &&
    r1Mount.indexOf('scorecard-dark-panel') > r1Mount.indexOf('<leaderboard-player-profile-panel') &&
    totExpand.indexOf('class="scorecard-profile"') < 0 &&
    r1Expand.indexOf('class="scorecard-profile"') < 0
);

assert(
  'personal-leaderboard-board 不再充当资料外壳样式源',
  personalWxss.indexOf('scorecard-profile') < 0 &&
    personalWxss.indexOf('.sc-avatar') < 0
);

console.log('');
console.log('--- seriesStandingsTotProfileRuntimeParityR2.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exitCode = 1;
}
process.exit(failed ? 1 : 0);
