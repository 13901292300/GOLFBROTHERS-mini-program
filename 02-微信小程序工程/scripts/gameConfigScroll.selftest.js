/**
 * 游戏实例配置页滚动契约：page 定高使 gb-body 可滚。
 * 运行：node scripts/gameConfigScroll.selftest.js
 */
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var gamePages = path.join(mini, 'subpackages', 'game', 'pages', 'config');
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

function read(abs) {
  return fs.readFileSync(abs, 'utf8');
}

var wxml = read(path.join(gamePages, 'index.wxml'));
var wxss = read(path.join(gamePages, 'index.wxss'));
var json = JSON.parse(read(path.join(gamePages, 'index.json')));
var js = read(path.join(gamePages, 'index.js'));
var shell = read(path.join(mini, 'subpackages', 'game', 'styles', 'gb-shell.wxss'));
var ui = read(path.join(mini, 'subpackages', 'game', 'styles', 'game-ui.wxss'));
var appWxss = read(path.join(mini, 'app.wxss'));

function skeleton(src) {
  var lines = src.split(/\r?\n/).map(function (l) {
    return l.trim();
  });
  var keys = [];
  lines.forEach(function (l) {
    if (/^<view class="gb-page/.test(l)) keys.push('gb-page');
    if (/^<view class="gb-header"/.test(l)) keys.push('gb-header');
    if (/^<scroll-view class="gb-body"/.test(l)) keys.push('scroll-view.gb-body');
    if (/^<view class="page-pad">/.test(l)) keys.push('page-pad');
    if (/^<\/scroll-view>/.test(l)) keys.push('/scroll-view');
    if (/^<view class="bottom-bar">/.test(l) && keys.indexOf('bottom-bar') < 0) {
      keys.push('bottom-bar');
    }
  });
  return keys.join('>');
}

function pageHeightRule(css) {
  return /page\s*,\s*\.gb-page\s*\{[^}]*height:\s*100%\s*;/.test(css) ||
    /page\s*\{[^}]*height:\s*100%\s*;/.test(css);
}

var mainSkel = skeleton(wxml);

assert(
  '1 主体滚动节点结构',
  mainSkel === 'gb-page>gb-header>scroll-view.gb-body>page-pad>/scroll-view>bottom-bar',
  mainSkel
);

var scrollMatches = wxml.match(/<scroll-view\b[^>]*>/g) || [];
assert(
  '2 唯一纵向 scroll-view 带 scroll-y',
  scrollMatches.length === 1 && /scroll-y/.test(scrollMatches[0]),
  String(scrollMatches)
);

var bodyBlock = shell.match(/\.gb-body\s*\{[^}]+\}/);
assert(
  '3 滚动容器 flex 高度有效',
  pageHeightRule(wxss) &&
    bodyBlock &&
    /flex:\s*1/.test(bodyBlock[0]) &&
    /height:\s*0/.test(bodyBlock[0]) &&
    /min-height:\s*0/.test(bodyBlock[0]) &&
    /overflow:\s*hidden/.test(shell.match(/\.gb-page\s*\{[^}]+\}/)[0]) &&
    json.disableScroll === true &&
    !/page\s*\{[^}]*height:\s*100%/.test(appWxss),
  'page height on config wxss; gb-body flex chain; host app has no page height'
);

var scrollOpen = wxml.indexOf('<scroll-view class="gb-body" scroll-y>');
var scrollClose = wxml.indexOf('</scroll-view>');
var inner = wxml.slice(scrollOpen, scrollClose);
assert(
  '4 长配置内容在唯一 scroll-view 内（scrollHeight 可超过 clientHeight）',
  scrollOpen >= 0 &&
    scrollClose > scrollOpen &&
    inner.indexOf('lasuo-n-block.wxml') >= 0 &&
    inner.indexOf('showLasuoFamily') >= 0 &&
    inner.indexOf('showTwoParty') >= 0 &&
    /include src="player-pick-block/.test(inner) &&
    /include src="order-board/.test(inner) &&
    /include src="rank-fold/.test(inner)
);

assert(
  '5 可滚到最后一个配置项（内容未移出 scroll-view）',
  inner.indexOf('rank-fold.wxml') >= 0 &&
    wxml.indexOf('rank-fold.wxml') < scrollClose &&
    wxml.indexOf('bottom-bar') > scrollClose
);

assert(
  '6 底部 CTA 不遮挡最后内容',
  /\.gb-body\s*\{\s*padding-bottom:\s*160rpx/.test(wxss) &&
    /\.page-pad\s*\{[^}]*padding:[^}]*180rpx/.test(ui) &&
    /class="bottom-bar"/.test(wxml) &&
    /确认添加/.test(wxml) &&
    /确认修改/.test(wxml) &&
    /position:\s*fixed/.test(ui.match(/\.bottom-bar\s*\{[^}]+\}/)[0])
);

assert(
  '7 safeArea spacer 存在',
  /env\(safe-area-inset-bottom\)/.test(ui.match(/\.bottom-bar\s*\{[^}]+\}/)[0]) &&
    /\.gb-body\s*\{\s*padding-bottom:\s*160rpx/.test(wxss)
);

var maskOpens = wxml.match(/<view wx:if="\{\{show[A-Za-z]+Sheet\}\}" class="sheet-mask/g) || [];
var maskAlways = /<view class="sheet-mask/.test(wxml.replace(/<view wx:if="\{\{show[^}]+}}" class="sheet-mask/g, ''));
var catchOnMask = /sheet-mask[^>]*>[\s\S]{0,80}catchtouchmove/.test(wxml);
assert(
  '8 sheet 关闭后不拦截滑动',
  maskOpens.length >= 4 &&
    !maskAlways &&
    !catchOnMask &&
    /wx:if="\{\{showHoleSheet\}\}"/.test(wxml) &&
    /wx:if="\{\{showScoreSheet\}\}"/.test(wxml) &&
    /wx:if="\{\{showHcapSheet\}\}"/.test(wxml) &&
    /catchtouchmove="onHoleOrderTouchMove"/.test(wxml) &&
    /wx:if="\{\{showHoleOrderSheet\}\}"/.test(wxml) &&
    /catchtouchmove="onOrderTouchMove"/.test(read(path.join(gamePages, 'order-board.wxml'))) &&
    /wx:if="\{\{showOrderDrag\}\}"/.test(read(path.join(gamePages, 'order-board.wxml')))
);

assert(
  '9 短配置不出现高度 0',
  /height:\s*100%/.test(wxss) &&
    /min-height:\s*0/.test(bodyBlock[0]) &&
    /flex:\s*1/.test(bodyBlock[0]) &&
    !/100vh/.test(wxss) &&
    /wx:if="\{\{showTwoParty\}\}"/.test(wxml) &&
    /wx:elif="\{\{showLasuoFamily\}\}"/.test(wxml) &&
    scrollMatches.length === 1
);

assert(
  '10 新增/修改模式都可滚',
  /isEditing \? '修改实例配置' : '游戏实例配置'/.test(wxml) &&
    /isEditing \? "确认修改" : "确认添加"/.test(wxml) &&
    /isEditing: !!existing/.test(js) &&
    /query\.gameId/.test(js)
);

assert(
  '11 setup 草稿保持',
  /requireSetupDraft\(entry\)/.test(js) &&
    /confirmAdd/.test(wxml)
);

assert(
  '12 页面级无固定透明层盖住 scroll-view；无双竖向 scroll-view',
  !/position:\s*fixed[\s\S]{0,80}inset:\s*0/.test(wxss) &&
    scrollMatches.length === 1 &&
    !/catchtouchmove/.test(wxml.slice(0, scrollClose))
);

assert(
  'WXML 骨架 header 后即 gb-body',
  /gb-header[\s\S]*<scroll-view class="gb-body" scroll-y>/.test(wxml)
);

console.log('SUMMARY passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
