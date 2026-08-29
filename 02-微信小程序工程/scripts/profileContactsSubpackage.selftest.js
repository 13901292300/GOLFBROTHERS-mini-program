/**
 * 「我的联系人」迁入 player 分包：业务完整性、依赖、路由与旧路径兼容壳。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/profileContactsSubpackage.selftest.js
 */

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var crypto = require('crypto');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var newPageDir = path.join(mini, 'subpackages', 'player', 'pages', 'me', 'contacts');
var oldPageDir = path.join(mini, 'pages', 'profile', 'contacts');
var targetUrl = '/subpackages/player/pages/me/contacts/index';
var oldUrl = '/pages/profile/contacts/index';
var passed = 0;
var failed = 0;
var failures = [];

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log('PASS  ' + label);
    return;
  }
  failed += 1;
  failures.push(label);
  console.log('FAIL  ' + label);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

function hashFile(file) {
  return hashBuffer(fs.readFileSync(file));
}

var extensions = ['js', 'wxml', 'wxss', 'json'];
assert(
  '新页面四文件存在',
  extensions.every(function (ext) {
    return fs.existsSync(path.join(newPageDir, 'index.' + ext));
  })
);

var appJson = JSON.parse(read(path.join(mini, 'app.json')));
var playerPackage = (appJson.subPackages || []).find(function (item) {
  return item && item.root === 'subpackages/player';
});
assert(
  'player 分包注册新页面',
  !!playerPackage && playerPackage.pages.indexOf('pages/me/contacts/index') >= 0
);
assert('旧主包路由仍注册', appJson.pages.indexOf('pages/profile/contacts/index') >= 0);

var homeJs = read(path.join(mini, 'pages', 'home', 'index.js'));
assert(
  '首页联系人入口只走新路由',
  homeJs.indexOf("url: '" + targetUrl + "'") >= 0 &&
    homeJs.indexOf("url: '" + oldUrl + "'") < 0
);

var shellJs = read(path.join(oldPageDir, 'index.js'));
assert(
  '旧页面为纯 redirect 壳',
  shellJs.indexOf('wx.redirectTo') >= 0 &&
    shellJs.indexOf('wx.navigateTo') < 0 &&
    shellJs.indexOf('require(') < 0 &&
    shellJs.indexOf('Store') < 0 &&
    shellJs.indexOf('buildContactRows') < 0 &&
    shellJs.indexOf('resolveIsSelectionMode') < 0
);
assert(
  '旧壳 WXML/WXSS 为空',
  read(path.join(oldPageDir, 'index.wxml')).length === 0 &&
    read(path.join(oldPageDir, 'index.wxss')).length === 0
);

var pageDefinition = null;
var redirects = [];
vm.runInNewContext(shellJs, {
  Page: function (definition) {
    pageDefinition = definition;
  },
  wx: {
    redirectTo: function (options) {
      redirects.push(options);
    }
  },
  encodeURIComponent: encodeURIComponent,
  String: String,
  Object: Object
});
pageDefinition.onLoad({
  mode: 'select players',
  scene: 'add_member&team=1',
  source: '/create?round=2',
  selectMode: '',
  futureKey: '中文 + %'
});
assert(
  '已知及未来 query 完整编码转发并保留空值',
  redirects[0].url ===
    targetUrl +
      '?mode=select%20players&scene=add_member%26team%3D1&source=%2Fcreate%3Fround%3D2&selectMode=&futureKey=%E4%B8%AD%E6%96%87%20%2B%20%25'
);
assert(
  '失败最多回首页一次且不循环',
  !!redirects[0].fail &&
    (redirects[0].fail(), redirects.length === 2) &&
    redirects[1].url === '/pages/home/index' &&
    !redirects[1].fail
);

var newJsPath = path.join(newPageDir, 'index.js');
var newJs = read(newJsPath);
var requiredFiles = [];
newJs.replace(/require\(['"]([^'"]+)['"]\)/g, function (match, request) {
  requiredFiles.push(path.resolve(newPageDir, request));
  return match;
});
assert(
  '新页面七个主包 utils require 均可解析',
  requiredFiles.length === 7 && requiredFiles.every(fs.existsSync)
);

var newJson = JSON.parse(read(path.join(newPageDir, 'index.json')));
var followComponent = newJson.usingComponents && newJson.usingComponents['follow-action-btn'];
var followBase = path.join(mini, String(followComponent || '').replace(/^\//, ''));
assert(
  'follow-action-btn 主包组件路径合法',
  followComponent === '/components/follow-action-btn/index' &&
    fs.existsSync(followBase + '.js') &&
    fs.existsSync(followBase + '.json')
);

assert(
  '联系人列表、通知、关注与刷新入口仍在',
  newJs.indexOf('buildContactRows') >= 0 &&
    newJs.indexOf('contactNotifyStore') >= 0 &&
    newJs.indexOf('markNewFollowersSeen') >= 0 &&
    newJs.indexOf('contactFollowAction.applyFollow') >= 0 &&
    newJs.indexOf('rebuildRowsFromStore') >= 0 &&
    newJs.indexOf('onShow()') >= 0
);
assert(
  '选择模式与球员主页跳转仍在',
  newJs.indexOf('resolveIsSelectionMode') >= 0 &&
    newJs.indexOf('togglePlayerSelection') >= 0 &&
    newJs.indexOf('openPlayerProfileUtil.openPlayerProfile') >= 0
);
assert(
  '自定义 Header 与返回首页 fallback 仍在',
  newJs.indexOf('createHeaderStyle') >= 0 &&
    newJs.indexOf('wx.navigateBack') >= 0 &&
    newJs.indexOf("wx.redirectTo({ url: '/pages/home/index' })") >= 0
);

var implementationHits = [];
function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|wxml|wxss)$/.test(entry.name)) {
      var body = read(full);
      if (body.indexOf('resolveIsSelectionMode') >= 0 || body.indexOf('buildContactRows') >= 0) {
        implementationHits.push(full);
      }
    }
  });
}
walk(mini);
assert(
  'contacts 业务实现只存在于新分包页',
  implementationHits.length === 1 && implementationHits[0] === newJsPath
);

var normalizedJs = newJs.replace(/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/utils\//g, '../../../utils/');
assert(
  '迁移前页面内容未被格式化或改写',
  hashBuffer(Buffer.from(normalizedJs, 'utf8')) ===
    'FEC33AD365767888B0BFF4C0AE91882765922088208CAC67B5285643363B6F1B' &&
    hashFile(path.join(newPageDir, 'index.wxml')) ===
      '1394F83A769A4A1CBE0703EA83C1EE36A9850A71734FB17328CB1407C7C6290E' &&
    hashFile(path.join(newPageDir, 'index.wxss')) ===
      '4B1356C6CAE7753E4349FB4E77075E95961D13248C40E69F223FB66AECAFE1DD' &&
    hashFile(path.join(newPageDir, 'index.json')) ===
      '574D10DEE63AB08C63D7D49A68C3E1090E888EF0B93577077669AA19B17BC28F'
);

JSON.parse(read(path.join(oldPageDir, 'index.json')));
assert('新旧 JSON 均可解析', true);

console.log('\npassed=' + passed + ' failed=' + failed);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
