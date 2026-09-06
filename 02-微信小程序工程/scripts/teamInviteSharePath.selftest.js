/**
 * 球队邀请分享 path：必须从真实 app.json 算出已注册路由，禁止只匹配字符串。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/teamInviteSharePath.selftest.js
 */
var fs = require('fs');
var path = require('path');

if (typeof global.wx !== 'object' || !global.wx) {
  global.wx = {
    getStorageSync: function () { return ''; },
    setStorageSync: function () {},
    removeStorageSync: function () {}
  };
}

var root = path.join(__dirname, '..');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var appJsonPath = path.join(mini, 'app.json');
var projectConfigPath = path.join(root, 'project.config.json');
var privateConfigPath = path.join(root, 'project.private.config.json');
var routes = require(path.join(mini, 'utils', 'teamClub', 'routes.js'));
var shareInvite = require(path.join(mini, 'utils', 'teamClub', 'shareInvite.js'));

var passed = 0;
var failed = 0;

function assert(label, ok, detail) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
    return;
  }
  failed += 1;
  console.log('FAIL  ' + label + (detail ? ' :: ' + detail : ''));
}

function pageFilesExist(dir) {
  return ['index.js', 'index.json', 'index.wxml', 'index.wxss'].every(function (name) {
    return fs.existsSync(path.join(dir, name));
  });
}

function ignoreHitsPage(ignoreList, rel) {
  var target = String(rel || '').replace(/\\/g, '/');
  return (ignoreList || []).some(function (item) {
    if (!item || !item.value) return false;
    var value = String(item.value).replace(/\\/g, '/').replace(/^\/+/, '');
    if (item.type === 'folder') {
      return target === value || target.indexOf(value.replace(/\/+$/, '') + '/') === 0;
    }
    if (item.type === 'file') return target === value;
    if (item.type === 'suffix') return target.slice(-value.length) === value;
    if (item.type === 'prefix') return target.indexOf(value) === 0;
    if (item.type === 'glob' || item.type === 'regexp') {
      try {
        return new RegExp(String(item.value)).test(target);
      } catch (e) {
        return target.indexOf(value) >= 0;
      }
    }
    return target.indexOf(value) >= 0;
  });
}

function collectRegisteredPaths(app) {
  var paths = [];
  (app.pages || []).forEach(function (p) {
    paths.push('/' + String(p).replace(/^\/+/, ''));
  });
  var packs = app.subPackages || app.subpackages || [];
  packs.forEach(function (sub) {
    var rootSeg = String((sub && sub.root) || '').replace(/^\/+|\/+$/g, '');
    (sub && sub.pages ? sub.pages : []).forEach(function (p) {
      paths.push('/' + rootSeg + '/' + String(p).replace(/^\/+/, ''));
    });
  });
  return paths;
}

var appRaw = fs.readFileSync(appJsonPath, 'utf8');
var app = JSON.parse(appRaw);
var registered = collectRegisteredPaths(app);
var helperPaths = routes.listRegisteredPagePaths(app);

assert('解析 miniprogram/app.json 成功', Array.isArray(app.pages) && Array.isArray(app.subPackages));
assert(
  'listRegisteredPagePaths 与现场解析一致',
  helperPaths.length === registered.length &&
    helperPaths.every(function (p, i) {
      return p === registered[i];
    })
);

var player = (app.subPackages || []).find(function (item) {
  return item && item.root === 'subpackages/player';
});
assert('分包 root 为 subpackages/player', !!player);
assert(
  '分包 pages 含 pages/me/team-invite/index',
  !!(player && player.pages && player.pages.indexOf('pages/me/team-invite/index') >= 0)
);
assert(
  '主包 pages 含 pages/team-invite/index',
  (app.pages || []).indexOf('pages/team-invite/index') >= 0
);

var computedSub = '/' + player.root + '/' + 'pages/me/team-invite/index';
var computedMain = '/pages/team-invite/index';
assert(
  '计算后的分包完整路径已注册',
  registered.indexOf(computedSub) >= 0,
  computedSub
);
assert(
  '计算后的主包完整路径已注册',
  registered.indexOf(computedMain) >= 0,
  computedMain
);
assert('分享常量等于主包完整路径', routes.TEAM_INVITE_PAGE === computedMain);
assert('运行时常量等于分包完整路径', routes.TEAM_INVITE_RUNTIME_PAGE === computedSub);
assert(
  '分享常量未重复拼接分包 root',
  routes.TEAM_INVITE_PAGE.indexOf('/subpackages/player/subpackages/player') < 0 &&
    routes.TEAM_INVITE_RUNTIME_PAGE.indexOf('/subpackages/player/subpackages/player') < 0
);

var token = 'inv_share_token_abcdef';
var sharePath = shareInvite.inviteLandingPath(token);
var shareBase = sharePath.split('?')[0];
assert('分享 path 去掉 query 后在注册表中', registered.indexOf(shareBase) >= 0, sharePath);
assert('分享 path 以 / 开头', sharePath.charAt(0) === '/');
assert(
  'token 经过 encodeURIComponent',
  sharePath.indexOf('token=' + encodeURIComponent(token)) > 0 &&
    sharePath === routes.buildInviteSharePath(token)
);
assert(
  'path 总长度符合微信限制',
  sharePath.length <= routes.WECHAT_SHARE_PATH_MAX &&
    sharePath.length <= 1024
);

var msg = shareInvite.buildShareMessage({ fullName: '测试队' }, { token: token });
assert('buildShareMessage 使用同一分享 path', msg.ok && msg.path === sharePath);
var empty = shareInvite.buildShareMessage({ fullName: '测试队' }, {});
assert(
  '无 token 不降级首页',
  empty.path === routes.TEAM_INVITE_PAGE && empty.path.indexOf('/pages/home/index') !== 0
);

var mainDir = path.join(mini, 'pages', 'team-invite');
var subDir = path.join(mini, 'subpackages', 'player', 'pages', 'me', 'team-invite');
assert('主包邀请入口四文件存在', pageFilesExist(mainDir));
assert('分包邀请页四文件存在', pageFilesExist(subDir));

var project = JSON.parse(fs.readFileSync(projectConfigPath, 'utf8'));
var ignore = (project.packOptions && project.packOptions.ignore) || [];
assert(
  'packOptions 未排除主包邀请页',
  !ignoreHitsPage(ignore, 'pages/team-invite/index.js') &&
    !ignoreHitsPage(ignore, 'pages/team-invite')
);
assert(
  'packOptions 未排除分包邀请页',
  !ignoreHitsPage(ignore, 'subpackages/player/pages/me/team-invite/index.js') &&
    !ignoreHitsPage(ignore, 'subpackages/player/pages/me/team-invite')
);

var privateCfg = JSON.parse(fs.readFileSync(privateConfigPath, 'utf8'));
assert(
  'private 配置未覆盖 packOptions 忽略邀请页',
  !privateCfg.packOptions || !ignoreHitsPage(privateCfg.packOptions.ignore || [], 'pages/team-invite')
);
assert('无 .wxignore', !fs.existsSync(path.join(root, '.wxignore')) && !fs.existsSync(path.join(mini, '.wxignore')));

var shareJs = fs.readFileSync(path.join(mini, 'utils', 'teamClub', 'shareInvite.js'), 'utf8');
assert(
  'shareInvite 不手写分包邀请 path',
  shareJs.indexOf('/subpackages/player/pages/me/team-invite/index') < 0 &&
    shareJs.indexOf('routes.buildInviteSharePath') >= 0
);

console.log('\nregistered=' + registered.length + ' sharePath=' + sharePath);
console.log('passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
