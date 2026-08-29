/** 「我的历史」迁入 player 分包专项。 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var crypto = require('crypto');
var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var newDir = path.join(mini, 'subpackages', 'player', 'pages', 'me', 'history');
var oldDir = path.join(mini, 'pages', 'profile', 'history');
var target = '/subpackages/player/pages/me/history/index';
var passed = 0;
var failed = 0;
function read(file) { return fs.readFileSync(file, 'utf8'); }
function hash(data) { return crypto.createHash('sha256').update(data).digest('hex').toUpperCase(); }
function assert(label, ok) {
  if (ok) { passed += 1; console.log('PASS  ' + label); }
  else { failed += 1; console.log('FAIL  ' + label); }
}
assert('history 新页面四文件存在', ['js', 'wxml', 'wxss', 'json'].every(function (ext) {
  return fs.existsSync(path.join(newDir, 'index.' + ext));
}));
var app = JSON.parse(read(path.join(mini, 'app.json')));
var player = app.subPackages.find(function (item) { return item.root === 'subpackages/player'; });
assert('player 注册新页且旧主包路由仍注册',
  player.pages.indexOf('pages/me/history/index') >= 0 && app.pages.indexOf('pages/profile/history/index') >= 0);
var home = read(path.join(mini, 'pages', 'home', 'index.js'));
assert('首页 history 入口只走新路由',
  home.indexOf("url: '" + target + "'") >= 0 && home.indexOf("url: '/pages/profile/history/index'") < 0);
var shell = read(path.join(oldDir, 'index.js'));
assert('旧页为无 history 业务的纯 redirect 壳',
  shell.indexOf('wx.redirectTo') >= 0 && shell.indexOf('wx.navigateTo') < 0 &&
  shell.indexOf('require(') < 0 && shell.indexOf('MOCK_ROUNDS') < 0 &&
  read(path.join(oldDir, 'index.wxml')).length === 0 && read(path.join(oldDir, 'index.wxss')).length === 0);
var definition = null;
var calls = [];
vm.runInNewContext(shell, {
  Page: function (value) { definition = value; },
  wx: { redirectTo: function (value) { calls.push(value); } },
  encodeURIComponent: encodeURIComponent,
  String: String,
  Object: Object
});
definition.onLoad({ filter: '个人 比杆', empty: '', future: 'a&b=1' });
assert('全部 query 编码转发并保留空值',
  calls[0].url === target + '?filter=%E4%B8%AA%E4%BA%BA%20%E6%AF%94%E6%9D%86&empty=&future=a%26b%3D1');
calls[0].fail();
assert('失败最多回首页一次', calls.length === 2 && calls[1].url === '/pages/home/index' && !calls[1].fail);
var jsPath = path.join(newDir, 'index.js');
var js = read(jsPath);
var requires = [];
js.replace(/require\(['"]([^'"]+)['"]\)/g, function (match, request) {
  requires.push(path.resolve(newDir, request)); return match;
});
assert('headerEngine/tPosition require 可解析', requires.length === 2 && requires.every(fs.existsSync));
assert('mock 数据、展示、Header 与返回逻辑保持',
  js.indexOf('MOCK_ROUNDS') >= 0 && js.indexOf('buildSortedList') >= 0 &&
  js.indexOf('createHeaderStyle') >= 0 && js.indexOf('wx.navigateBack') >= 0 &&
  js.indexOf("wx.redirectTo({ url: '/pages/home/index' })") >= 0);
assert('没有新增比赛详情跳转',
  js.indexOf('wx.navigateTo') < 0 && js.indexOf('openDetail') < 0 && js.indexOf('navigateToDetail') < 0);
var hits = [];
function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js') && read(full).indexOf('MOCK_ROUNDS') >= 0) hits.push(full);
  });
}
walk(path.join(mini, 'pages', 'profile'));
walk(path.join(mini, 'subpackages', 'player', 'pages', 'me'));
assert('history 业务实现只存在于新页', hits.length === 1 && hits[0] === jsPath);
var normalized = js.replace(/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/utils\//g, '../../../utils/');
assert('业务内容除 require 外保持原哈希',
  hash(Buffer.from(normalized, 'utf8')) === '739C7D372690B74056DBFED80905E9ADBC07B375FE343CFCE151BE66AA4576B3' &&
  hash(fs.readFileSync(path.join(newDir, 'index.wxml'))) === '595726A39633BCFE46408C06A827439A3C0E09DDAADC1D25041CCA7AB37D6C07' &&
  hash(fs.readFileSync(path.join(newDir, 'index.wxss'))) === '22D3B580B78A64E659A74D2A51442E2C089F9B324E9AE3C2EA4161BFB2855E2F' &&
  hash(fs.readFileSync(path.join(newDir, 'index.json'))) === '38F20314C5CD1B7AD1A9D900520CE04EA1EE0469D66D5E84884BA11FAA3E0992');
JSON.parse(read(path.join(newDir, 'index.json')));
JSON.parse(read(path.join(oldDir, 'index.json')));
assert('新旧 JSON 均可解析', true);
console.log('\npassed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
