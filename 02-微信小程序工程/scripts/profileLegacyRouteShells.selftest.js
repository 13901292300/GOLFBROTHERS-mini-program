/** 五个 profile 旧路由兼容壳一致性矩阵。 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var names = ['footprints', 'contacts', 'statistics', 'edit', 'history'];
var passed = 0;
var failed = 0;
function read(file) { return fs.readFileSync(file, 'utf8'); }
function assert(label, ok) {
  if (ok) { passed += 1; console.log('PASS  ' + label); }
  else { failed += 1; console.log('FAIL  ' + label); }
}
var app = JSON.parse(read(path.join(mini, 'app.json')));
var player = app.subPackages.find(function (item) { return item.root === 'subpackages/player'; });
var home = read(path.join(mini, 'pages', 'home', 'index.js'));
var shellBodies = [];
var matrixOk = true;
var queryOk = true;
var purityOk = true;
var jsonOk = true;
names.forEach(function (name) {
  var oldRoute = 'pages/profile/' + name + '/index';
  var newRoute = 'pages/me/' + name + '/index';
  var target = '/subpackages/player/' + newRoute;
  var dir = path.join(mini, 'pages', 'profile', name);
  var js = read(path.join(dir, 'index.js'));
  shellBodies.push(js.replace(target, '__TARGET__'));
  matrixOk = matrixOk && app.pages.indexOf(oldRoute) >= 0 && player.pages.indexOf(newRoute) >= 0;
  matrixOk = matrixOk && home.indexOf("url: '" + target + "'") >= 0;
  matrixOk = matrixOk && js.indexOf("const TARGET_URL = '" + target + "';") >= 0;
  purityOk = purityOk && js.indexOf('wx.navigateTo') < 0 && js.indexOf('require(') < 0;
  purityOk = purityOk && js.indexOf('setStorage') < 0 && js.indexOf('getStorage') < 0;
  purityOk = purityOk && read(path.join(dir, 'index.wxml')).length === 0;
  purityOk = purityOk && read(path.join(dir, 'index.wxss')).length === 0;
  try { JSON.parse(read(path.join(dir, 'index.json'))); } catch (e) { jsonOk = false; }
  var definition = null;
  var calls = [];
  vm.runInNewContext(js, {
    Page: function (value) { definition = value; },
    wx: { redirectTo: function (value) { calls.push(value); } },
    encodeURIComponent: encodeURIComponent,
    String: String,
    Object: Object
  });
  definition.onLoad({ known: name + ' 中文', empty: '', future: 'a&b=1' });
  queryOk = queryOk && calls[0].url === target + '?known=' + encodeURIComponent(name + ' 中文') + '&empty=&future=a%26b%3D1';
  calls[0].fail();
  queryOk = queryOk && calls.length === 2 && calls[1].url === '/pages/home/index' && !calls[1].fail;
});
assert('五个壳跳转目标、app.json 与首页入口矩阵正确', matrixOk);
assert('五个壳 query 编码和 fallback 行为正确', queryOk);
assert('五个壳无业务、storage、navigateTo，且 WXML/WXSS 为空', purityOk);
assert('五个壳 JSON 均可解析', jsonOk);
assert('五个壳除 TARGET_URL 外实现结构完全一致', shellBodies.every(function (body) {
  return body === shellBodies[0];
}));
var profileDirs = fs.readdirSync(path.join(mini, 'pages', 'profile'), { withFileTypes: true })
  .filter(function (entry) { return entry.isDirectory(); })
  .map(function (entry) { return entry.name; })
  .sort();
assert('主包 pages/profile 只剩五个兼容壳目录',
  JSON.stringify(profileDirs) === JSON.stringify(names.slice().sort()));
console.log('\npassed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
