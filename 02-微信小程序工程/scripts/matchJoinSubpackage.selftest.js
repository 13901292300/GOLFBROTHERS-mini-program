/**
 * match/join 迁入 scoring 分包：业务完整性与历史主包路由兼容壳。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/matchJoinSubpackage.selftest.js
 */

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var crypto = require('crypto');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var newPageDir = path.join(mini, 'subpackages', 'scoring', 'pages', 'match', 'join');
var oldPageDir = path.join(mini, 'pages', 'match', 'join');
var targetUrl = '/subpackages/scoring/pages/match/join/index';
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
assert(
  '旧路由壳四文件存在',
  extensions.every(function (ext) {
    return fs.existsSync(path.join(oldPageDir, 'index.' + ext));
  })
);

var appJson = JSON.parse(read(path.join(mini, 'app.json')));
var scoringPackage = (appJson.subPackages || []).find(function (item) {
  return item && item.root === 'subpackages/scoring';
});
assert(
  'scoring 分包注册新页面',
  !!scoringPackage && scoringPackage.pages.indexOf('pages/match/join/index') >= 0
);
assert('历史主包路由继续注册', appJson.pages.indexOf('pages/match/join/index') >= 0);

var shellJs = read(path.join(oldPageDir, 'index.js'));
assert(
  '旧页面为纯 redirect 壳',
  shellJs.indexOf('wx.redirectTo') >= 0 &&
    shellJs.indexOf('wx.navigateTo') < 0 &&
    shellJs.indexOf('require(') < 0 &&
    shellJs.indexOf('PENDING_BIND_KEY') < 0 &&
    shellJs.indexOf('matchJoinIdentity') < 0 &&
    shellJs.indexOf('teamMatchStore') < 0
);
assert(
  '旧壳 WXML/WXSS 为空且 JSON 最小合法',
  read(path.join(oldPageDir, 'index.wxml')).length === 0 &&
    read(path.join(oldPageDir, 'index.wxss')).length === 0 &&
    Object.keys(JSON.parse(read(path.join(oldPageDir, 'index.json')))).length === 0
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
  joinToken: 'token + %',
  token: '',
  scene: 'qr&group=1',
  source: '/share?id=2',
  futureKey: '中文'
});
assert(
  '已知及未来 query 完整编码转发并保留空值',
  redirects[0].url ===
    targetUrl +
      '?joinToken=token%20%2B%20%25&token=&scene=qr%26group%3D1&source=%2Fshare%3Fid%3D2&futureKey=%E4%B8%AD%E6%96%87'
);
assert(
  '跳转失败最多回首页一次',
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
  '八个主包业务依赖均可解析',
  requiredFiles.length === 8 && requiredFiles.every(fs.existsSync)
);
assert(
  'joinToken/token 解码与身份绑定逻辑仍在新页',
  newJs.indexOf('options.joinToken || options.token') >= 0 &&
    newJs.indexOf('matchJoinIdentity') >= 0 &&
    newJs.indexOf('resolveCanonicalUserId') >= 0
);
assert(
  'pending bind storage 与扫码来源仍在新页',
  newJs.indexOf("const PENDING_BIND_KEY = 'gb_match_join_pending_bind_v1'") >= 0 &&
    newJs.indexOf('wx.setStorageSync(PENDING_BIND_KEY') >= 0 &&
    newJs.indexOf("source: 'scan'") >= 0
);
assert(
  '进入 scoring 记分页与返回栈逻辑仍在',
  newJs.indexOf("url: '/subpackages/scoring/pages/score/index?joinToken='") >= 0 &&
    newJs.indexOf('wx.navigateBack({') >= 0 &&
    newJs.indexOf("wx.redirectTo({ url: '/pages/home/index' })") >= 0
);

var qrAccessJs = read(path.join(mini, 'utils', 'matchJoinQrAccess.js'));
assert(
  '现行二维码仍直接进入 scoring 记分页',
  qrAccessJs.indexOf("'subpackages/scoring/pages/score/index?matchId='") >= 0
);

JSON.parse(read(path.join(newPageDir, 'index.json')));
assert('新旧页面 JSON 均可解析', true);

var normalizedJs = newJs
  .replace(/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/utils\//g, '../../../utils/')
  .replace(/\r\n/g, '\n');
assert(
  '业务页面除 require 外内容保持原样',
  hashBuffer(Buffer.from(normalizedJs, 'utf8')) ===
      'E09BE6759330BF4F5ECDBD993926A3AF9AC72F0908F8255E96694DCB8E65D1FF' &&
    hashFile(path.join(newPageDir, 'index.wxml')) ===
      '9EC73957949DB67F6F5997BC8D2DE05B91B4D44FC98F41A858831E59B3919CAF' &&
    hashFile(path.join(newPageDir, 'index.wxss')) ===
      '3704B71996BDF59008890F62B60C391D9A99982FB8DE63AF4AE418B67C84C5C8' &&
    hashFile(path.join(newPageDir, 'index.json')) ===
      'B5682E54F3565EE65AF28ADE98BC20E534D28BCD1BE85468372C75126ADC26A6'
);

console.log('\npassed=' + passed + ' failed=' + failed);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
