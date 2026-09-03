/**
 * 选择玩法页滚动：page 定高 + scroll-view 可滚高度。
 * 运行：node scripts/catalogScroll.selftest.js
 */
var fs = require('fs');
var path = require('path');

if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    showToast: function () {}
  };
}

var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var root = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'pages', 'catalog');
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

var wxml = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8');
var wxss = fs.readFileSync(path.join(root, 'index.wxss'), 'utf8');
var js = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
var json = fs.readFileSync(path.join(root, 'index.json'), 'utf8');
var shell = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'styles', 'gb-shell.wxss'),
  'utf8'
);
var configWxss = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'pages', 'config', 'index.wxss'),
  'utf8'
);

assert('disableScroll 仍开启（依赖 scroll-view）', /"disableScroll"\s*:\s*true/.test(json));
assert('scroll-view 带 scroll-y', /scroll-view[^>]*scroll-y/.test(wxml));
assert('scroll-view 使用 catalog-scroll', /class="gb-body catalog-scroll"/.test(wxml));
assert('page 定高', /page\s*,\s*\n\s*\.gb-page\s*\{[\s\S]*height:\s*100%/.test(wxss) || /page,\s*\.gb-page\s*\{[\s\S]*height:\s*100%/.test(wxss));
assert('catalog-scroll 有 min-height:0', /\.catalog-scroll\s*\{[\s\S]*min-height:\s*0/.test(wxss));
assert('catalog-scroll 有 height:0 flex 约束', /\.catalog-scroll\s*\{[\s\S]*height:\s*0/.test(wxss));
assert('底部含 safe-area', /safe-area-inset-bottom/.test(wxss));
assert('未改标题文案', /选择玩法/.test(wxml) && /选一种玩法/.test(wxml));
assert('卡片仍 catchtap 选择', /catchtap="onCatalogTap"/.test(wxml));
assert('gb-shell 仍 overflow:hidden 于 page', /\.gb-page[^{]*\{[^}]*overflow:\s*hidden/.test(shell));
assert('与 config 同一定高策略', /page,\s*\n?\.gb-page|page,\s*\.gb-page/.test(configWxss));

var design = catalog.listCatalogForDesign();
var ids = [];
design.forEach(function (g) {
  (g.items || []).forEach(function (it) {
    ids.push(it.id);
  });
});
assert('设计目录含 lasuo-n', ids.indexOf('lasuo-n') >= 0);
assert('设计目录含 horn', ids.indexOf('horn') >= 0);
assert('玩法顺序多人在末组', design[design.length - 1].groupId === 'multi');
assert(
  'JS 直接量测滚动及末组玩法可达状态',
  /select\(["']\.catalog-scroll["']\)/.test(js) &&
    /select\(["']#catalog-row-lasuo-n["']\)/.test(js) &&
    /select\(["']#catalog-row-horn["']\)/.test(js) &&
    /canScroll:\s*contentHeight\s*>\s*clientHeight\s*\+\s*1/.test(js) &&
    /hornRendered:\s*!!hornRect/.test(js)
);
assert('行 id 便于量测 Y', /id="catalog-row-\{\{rule\.id\}\}"/.test(wxml));
assert('未改 card 视觉类名', /catalog-row/.test(wxml) && /catalog-group__head/.test(wxml));
assert('未引入 catchtouchmove', wxml.indexOf('catchtouchmove') < 0);

console.log('\ncatalogScroll.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
