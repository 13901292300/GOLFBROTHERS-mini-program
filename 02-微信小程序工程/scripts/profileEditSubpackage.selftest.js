/** 「编辑资料」迁入 player 分包：路由壳、资料读写与头像选择契约。 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var newDir = path.join(mini, 'subpackages', 'player', 'pages', 'me', 'edit');
var oldDir = path.join(mini, 'pages', 'profile', 'edit');
var target = '/subpackages/player/pages/me/edit/index';
var passed = 0;
var failed = 0;
function read(file) { return fs.readFileSync(file, 'utf8'); }
function assert(label, ok) {
  if (ok) { passed += 1; console.log('PASS  ' + label); }
  else { failed += 1; console.log('FAIL  ' + label); }
}

function methodSource(src, name) {
  var re = new RegExp('\\b' + name + '\\s*\\([^)]*\\)\\s*\\{');
  var match = re.exec(src);
  if (!match) return '';
  var start = match.index;
  var i = match.index + match[0].length - 1;
  var depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}

assert('新页面四文件存在', ['js', 'wxml', 'wxss', 'json'].every(function (ext) {
  return fs.existsSync(path.join(newDir, 'index.' + ext));
}));
var app;
var appOk = false;
try {
  app = JSON.parse(read(path.join(mini, 'app.json')));
  appOk = true;
} catch (e) {
  app = { pages: [], subPackages: [] };
}
assert('app.json 可解析', appOk);
var player = (app.subPackages || []).find(function (item) { return item.root === 'subpackages/player'; });
assert('player 注册新页且旧主包路由仍注册',
  !!player && player.pages.indexOf('pages/me/edit/index') >= 0 && app.pages.indexOf('pages/profile/edit/index') >= 0);
var home = read(path.join(mini, 'pages', 'home', 'index.js'));
assert('首页只走 edit 新路由',
  home.indexOf("url: '" + target + "'") >= 0 && home.indexOf("url: '/pages/profile/edit/index'") < 0);
var shell = read(path.join(oldDir, 'index.js'));
assert('旧页为无业务逻辑的纯 redirect 壳',
  shell.indexOf('wx.redirectTo') >= 0 && shell.indexOf('wx.navigateTo') < 0 &&
  shell.indexOf('require(') < 0 && shell.indexOf('userProfileStore') < 0 &&
  shell.indexOf('chooseAvatar') < 0 && shell.indexOf('_pickLocalAvatar') < 0 &&
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
definition.onLoad({ field: 'display name', empty: '', future: '中国&CN=1' });
assert('全部 query 编码转发并保留空值',
  calls[0].url === target + '?field=display%20name&empty=&future=%E4%B8%AD%E5%9B%BD%26CN%3D1');
calls[0].fail();
assert('跳转失败最多回首页一次', calls.length === 2 && calls[1].url === '/pages/home/index' && !calls[1].fail);
var jsPath = path.join(newDir, 'index.js');
var js = read(jsPath);
var wxml = read(path.join(newDir, 'index.wxml'));
var requireSpecs = [];
js.replace(/require\(['"]([^'"]+)['"]\)/g, function (match, request) {
  requireSpecs.push(request);
  return match;
});
var resolvedRequires = requireSpecs.map(function (request) {
  return path.resolve(newDir, request);
});
var utilsRoot = path.join(mini, 'utils') + path.sep;
var playerRoot = path.join(mini, 'subpackages', 'player') + path.sep;
var forbiddenRoots = [
  path.join(mini, 'subpackages', 'poster') + path.sep,
  path.join(mini, 'subpackages', 'game') + path.sep,
  path.join(mini, 'subpackages', 'tournament') + path.sep,
  path.join(mini, 'subpackages', 'tournament-manage') + path.sep,
  path.join(mini, 'subpackages', 'tournament-tools') + path.sep,
  path.join(mini, 'subpackages', 'scoring') + path.sep,
  path.join(mini, 'subpackages', 'create') + path.sep
];
function under(file, rootDir) {
  return file.indexOf(rootDir) === 0;
}
var missing = resolvedRequires.filter(function (abs) {
  return !fs.existsSync(abs);
});
var outside = resolvedRequires.filter(function (abs) {
  return !under(abs, utilsRoot) && !under(abs, playerRoot);
});
var heavy = resolvedRequires.filter(function (abs) {
  return forbiddenRoots.some(function (rootDir) {
    return under(abs, rootDir);
  });
});
var rels = requireSpecs.map(function (request) {
  return request.replace(/\\/g, '/');
});
assert('资料编辑页全部 require 可解析', missing.length === 0 && resolvedRequires.length > 0, missing.join(','));
assert(
  '主包依赖仅轻量 utils 或本分包',
  outside.length === 0 && heavy.length === 0,
  outside.concat(heavy).join(',')
);
assert(
  '建档闭环允许 profileOnboard/profileFields',
  rels.some(function (r) { return /teamClub\/profileOnboard(?:\.js)?$/.test(r); }) &&
    rels.some(function (r) { return /teamClub\/profileFields(?:\.js)?$/.test(r); })
);
assert(
  '资料页不反向引用大型页面模块',
  !rels.some(function (r) {
    return /\/pages\//.test(r) || /subpackages\/(poster|game|tournament|scoring)\//.test(r);
  })
);
assert('资料编辑不形成跨分包循环 require', heavy.length === 0 && outside.length === 0);
assert('资料读取、编辑、校验与保存入口保持',
  js.indexOf('userProfileStore.loadProfile') >= 0 && js.indexOf('userProfileStore.updateProfile') >= 0 &&
  js.indexOf('昵称不能为空') >= 0 && js.indexOf('genderNormalize') >= 0 &&
  js.indexOf('geoCatalog') >= 0 && methodSource(js, 'refreshProfile').indexOf('buildUserProfileView') >= 0);
assert('Header、取消与返回首页 fallback 保持',
  js.indexOf('createHeaderStyle') >= 0 && methodSource(js, 'onPickerCancel').length > 0 &&
  js.indexOf('wx.navigateBack') >= 0 && js.indexOf("wx.redirectTo({ url: '/pages/home/index' })") >= 0);
assert('首页 onShow 刷新资料契约保持',
  /onShow\(\)[\s\S]*?refreshUserProfile\(\)/.test(home) &&
  home.indexOf('userProfileStore.loadProfile') >= 0);
var hits = [];
function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js') && read(full).indexOf("title: '编辑个人签名'") >= 0) hits.push(full);
  });
}
walk(mini);
assert('edit 业务实现只存在于新页', hits.length === 1 && hits[0] === jsPath);

assert(
  'WXML chooseAvatar 绑定 onChooseAvatar',
  /open-type=["']chooseAvatar["']/.test(wxml) &&
    /bindchooseavatar=["']onChooseAvatar["']/.test(wxml) &&
    /bindtap=["']onTapAvatar["']/.test(wxml)
);
assert(
  '_pickLocalAvatar 存在且被头像入口调用',
  methodSource(js, '_pickLocalAvatar').indexOf('wx.chooseMedia') >= 0 &&
    methodSource(js, 'updateAvatar').indexOf('this._pickLocalAvatar()') >= 0 &&
    methodSource(js, 'onTapAvatar').indexOf('this._pickLocalAvatar()') >= 0 &&
    methodSource(js, 'onChooseAvatar').indexOf('_commitAvatar') >= 0
);

function loadEditPage(wxApi, store) {
  var pageDef = null;
  var src = fs.readFileSync(jsPath, 'utf8');
  vm.runInNewContext(src, {
    require: function (request) {
      var abs = path.resolve(newDir, request);
      if (path.basename(abs) === 'userProfileStore.js') return store;
      if (path.basename(abs) === 'headerEngine.js') {
        return {
          createHeaderStyle: function () {
            return { headerRootStyle: '', headerBarStyle: '', metrics: { headerTotalHeight: 88 } };
          }
        };
      }
      if (!fs.existsSync(abs)) throw new Error('missing require ' + request);
      return require(abs);
    },
    Page: function (value) { pageDef = value; },
    getApp: function () { return { getTheme: function () { return 'bright'; } }; },
    wx: wxApi,
    console: console,
    setTimeout: function (fn) { fn(); },
    clearTimeout: function () {},
    String: String,
    Object: Object,
    Array: Array,
    Number: Number,
    Boolean: Boolean,
    JSON: JSON
  });
  pageDef.setData = function (patch) {
    Object.keys(patch).forEach(function (key) {
      pageDef.data[key] = patch[key];
    });
  };
  return pageDef;
}

var keptAvatar = '/kept/avatar.png';
var profileState = { avatar: keptAvatar, nickname: '测' };
var updates = [];
var store = {
  IDENTITY_PLAYER: 'PLAYER',
  IDENTITY_CADDIE: 'CADDIE',
  DEFAULT_AVATAR: '/default/avatar.png',
  loadProfile: function () { return profileState; },
  updateProfile: function (patch) {
    updates.push(patch);
    Object.keys(patch).forEach(function (key) {
      profileState[key] = patch[key];
    });
  }
};
var wxApi = {
  showToast: function () {},
  navigateBack: function (opts) { if (opts && opts.fail) opts.fail(); },
  redirectTo: function () {},
  chooseMedia: function (opts) { opts.fail({ errMsg: 'chooseMedia:fail cancel' }); },
  chooseImage: function () {},
  saveFile: function (opts) { opts.success({ savedFilePath: '/saved/' + path.basename(opts.tempFilePath) }); }
};
var page = loadEditPage(wxApi, store);
page.onLoad();
assert(
  'onLoad 读取资料且保留已有头像',
  page.data.userProfile && page.data.userProfile.avatar === keptAvatar && updates.length === 0
);

page.onChooseAvatar({});
page.onChooseAvatar({ detail: {} });
page.onChooseAvatar({ detail: { avatarUrl: '' } });
assert(
  'chooseAvatar 空结果不改已有头像',
  updates.length === 0 && profileState.avatar === keptAvatar && page.data.userProfile.avatar === keptAvatar
);

page._pickLocalAvatar();
assert(
  '本地选图取消/失败不改已有头像',
  updates.length === 0 && profileState.avatar === keptAvatar
);

wxApi.chooseMedia = function (opts) {
  opts.success({ tempFiles: [{ tempFilePath: '/tmp/new-avatar.jpg' }] });
};
page._pickLocalAvatar();
assert(
  '本地选图成功才写入头像',
  updates.length === 1 &&
    updates[0].avatar === '/saved/new-avatar.jpg' &&
    profileState.avatar === '/saved/new-avatar.jpg' &&
    page.data.userProfile.avatar === '/saved/new-avatar.jpg'
);

updates.length = 0;
profileState.avatar = keptAvatar;
page.refreshProfile();
page.onChooseAvatar({ detail: { avatarUrl: '/wx/avatar.png' } });
assert(
  'onChooseAvatar 成功写入微信头像',
  updates.length === 1 &&
    updates[0].avatar === '/saved/avatar.png' &&
    profileState.avatar === '/saved/avatar.png'
);

var jsonOk = false;
try {
  JSON.parse(read(path.join(newDir, 'index.json')));
  JSON.parse(read(path.join(oldDir, 'index.json')));
  jsonOk = true;
} catch (e) {
  jsonOk = false;
}
assert('新旧 JSON 均可解析', jsonOk);
console.log('\npassed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
