/** 「我的统计」迁入 player 分包专项。 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var crypto = require('crypto');
var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var newDir = path.join(mini, 'subpackages', 'player', 'pages', 'me', 'statistics');
var oldDir = path.join(mini, 'pages', 'profile', 'statistics');
var target = '/subpackages/player/pages/me/statistics/index';
var passed = 0;
var failed = 0;
function read(file) { return fs.readFileSync(file, 'utf8'); }
function hash(data) { return crypto.createHash('sha256').update(data).digest('hex').toUpperCase(); }
function assert(label, ok) {
  if (ok) { passed += 1; console.log('PASS  ' + label); }
  else { failed += 1; console.log('FAIL  ' + label); }
}
assert('新页面四文件存在', ['js', 'wxml', 'wxss', 'json'].every(function (ext) {
  return fs.existsSync(path.join(newDir, 'index.' + ext));
}));
var app = JSON.parse(read(path.join(mini, 'app.json')));
var player = app.subPackages.find(function (item) { return item.root === 'subpackages/player'; });
assert('player 注册新页且旧主包路由仍注册',
  player.pages.indexOf('pages/me/statistics/index') >= 0 &&
  app.pages.indexOf('pages/profile/statistics/index') >= 0);
var home = read(path.join(mini, 'pages', 'home', 'index.js'));
assert('首页只走 statistics 新路由',
  home.indexOf("url: '" + target + "'") >= 0 &&
  home.indexOf("url: '/pages/profile/statistics/index'") < 0);
var shell = read(path.join(oldDir, 'index.js'));
assert('旧页为无业务逻辑的纯 redirect 壳',
  shell.indexOf('wx.redirectTo') >= 0 && shell.indexOf('wx.navigateTo') < 0 &&
  shell.indexOf('require(') < 0 && shell.indexOf('MOCK_GAME_POOL') < 0 &&
  read(path.join(oldDir, 'index.wxml')).length === 0 &&
  read(path.join(oldDir, 'index.wxss')).length === 0);
var definition = null;
var calls = [];
vm.runInNewContext(shell, {
  Page: function (value) { definition = value; },
  wx: { redirectTo: function (value) { calls.push(value); } },
  encodeURIComponent: encodeURIComponent,
  String: String,
  Object: Object
});
definition.onLoad({ range: '最近 10 场', empty: '', future: 'a&b=1' });
assert('全部 query 编码转发并保留空值',
  calls[0].url === target + '?range=%E6%9C%80%E8%BF%91%2010%20%E5%9C%BA&empty=&future=a%26b%3D1');
calls[0].fail();
assert('跳转失败最多回首页一次', calls.length === 2 && calls[1].url === '/pages/home/index' && !calls[1].fail);
var jsPath = path.join(newDir, 'index.js');
var js = read(jsPath);
var requires = [];
js.replace(/require\(['"]([^'"]+)['"]\)/g, function (match, request) {
  requires.push(path.resolve(newDir, request)); return match;
});
assert('headerEngine/tPosition require 可解析', requires.length === 2 && requires.every(fs.existsSync));
assert('Header、统计数据与计算入口保持',
  js.indexOf('createHeaderStyle') >= 0 && js.indexOf('MOCK_GAME_POOL') >= 0 &&
  js.indexOf('selectEligibleGames') >= 0 && js.indexOf('buildStatisticsFromGames') >= 0 &&
  js.indexOf('refreshCharts') >= 0);
assert('返回首页 fallback 保持',
  js.indexOf('wx.navigateBack') >= 0 && js.indexOf("wx.redirectTo({ url: '/pages/home/index' })") >= 0);
var hits = [];
function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js') && read(full).indexOf('MOCK_GAME_POOL') >= 0) hits.push(full);
  });
}
walk(mini);
assert('statistics 业务实现只存在于新页', hits.length === 1 && hits[0] === jsPath);
var normalized = js.replace(/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/utils\//g, '../../../utils/');
assert('业务内容除 require 外保持原哈希',
  hash(Buffer.from(normalized, 'utf8')) === 'F22E193C249261EAFBEF6B792699267C12A9943527E6677826AB98DA45031294' &&
  hash(fs.readFileSync(path.join(newDir, 'index.wxml'))) === '3FE318F354E6665BDD8C0D68B800C10B54B38C2B43548C63C8F25706C648D781' &&
  hash(fs.readFileSync(path.join(newDir, 'index.wxss'))) === 'D70EFE1CBC7A0FF968C85F1ACEB16EBE203DE4A73F3680EADD512F1EABAFF018' &&
  hash(fs.readFileSync(path.join(newDir, 'index.json'))) === '38F20314C5CD1B7AD1A9D900520CE04EA1EE0469D66D5E84884BA11FAA3E0992');
JSON.parse(read(path.join(newDir, 'index.json')));
JSON.parse(read(path.join(oldDir, 'index.json')));
assert('新旧 JSON 均可解析', true);
console.log('\npassed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
