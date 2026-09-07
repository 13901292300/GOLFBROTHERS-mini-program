/**
 * team/select 迁入 create 分包：页面完整性、路由、eventChannel 与球队云仓储契约。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/teamSelectSubpackage.selftest.js
 */

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var newPageDir = path.join(mini, 'subpackages', 'create', 'pages', 'team', 'select');
var oldPageDir = path.join(mini, 'pages', 'team', 'select');
var targetUrl = '/subpackages/create/pages/team/select/index';
var oldUrl = '/pages/team/select/index';
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

var extensions = ['js', 'wxml', 'wxss', 'json'];
assert(
  '新页面四文件存在',
  extensions.every(function (ext) {
    return fs.existsSync(path.join(newPageDir, 'index.' + ext));
  })
);

var appJson = JSON.parse(read(path.join(mini, 'app.json')));
var createPackage = (appJson.subPackages || []).find(function (item) {
  return item && item.root === 'subpackages/create';
});
assert(
  'create 分包注册新页面',
  !!createPackage && createPackage.pages.indexOf('pages/team/select/index') >= 0
);
assert('主包旧声明已移除', appJson.pages.indexOf('pages/team/select/index') < 0);
assert('旧物理页面目录不存在', !fs.existsSync(oldPageDir));

var teamInternalJs = read(path.join(mini, 'subpackages', 'create', 'pages', 'team-internal', 'index.js'));
var teamInterJs = read(path.join(mini, 'subpackages', 'create', 'pages', 'team-inter', 'index.js'));
var seriesJs = read(path.join(mini, 'subpackages', 'create', 'pages', 'series', 'index.js'));
var entrySources = teamInternalJs + '\n' + teamInterJs + '\n' + seriesJs;
var targetHits = entrySources.split(targetUrl).length - 1;
assert('六类生产入口全部指向新路由', targetHits === 6);
assert(
  '旧生产路由搜索为 0',
  !new RegExp("['\"]" + oldUrl.replace(/\//g, '\\/')).test(entrySources)
);
assert(
  'selectedId query 保留',
  teamInternalJs.indexOf(targetUrl + "?selectedId=' + (this.data.teamId || '')") >= 0 &&
    seriesJs.indexOf(targetUrl + "?selectedId=' + encodeURIComponent(currentId || '')") >= 0
);
assert(
  'event_org query 保留',
  teamInterJs.indexOf(targetUrl + '?mode=event_org') >= 0 &&
    seriesJs.indexOf(targetUrl + '?mode=event_org') >= 0
);
assert(
  'inter_team_participants query 保留',
  teamInterJs.indexOf(targetUrl + '?mode=inter_team_participants') >= 0 &&
    seriesJs.indexOf(targetUrl + '?mode=inter_team_participants') >= 0
);
assert(
  '动态 query 与编码保持',
  teamInterJs.indexOf("url += '&maxCount=2'") >= 0 &&
    seriesJs.indexOf("encodeURIComponent(currentId || '')") >= 0
);

var newJsPath = path.join(newPageDir, 'index.js');
var newJs = read(newJsPath);
['teamSelected', 'participantsSelected', 'organizationSelected'].forEach(function (eventName) {
  assert('保留输出 eventChannel：' + eventName, newJs.indexOf("channel.emit('" + eventName + "'") >= 0);
});
['initParticipants', 'initOrganization'].forEach(function (eventName) {
  assert('保留初始化 eventChannel：' + eventName, newJs.indexOf("channel.on('" + eventName + "'") >= 0);
});

var requiredFiles = [];
var requireSpecs = [];
newJs.replace(/require\(['"]([^'"]+)['"]\)/g, function (match, request) {
  requireSpecs.push(request.replace(/\\/g, '/'));
  requiredFiles.push(path.resolve(newPageDir, request));
  return match;
});
assert(
  '选球队页 require 均可解析',
  requiredFiles.length > 0 && requiredFiles.every(fs.existsSync)
);
assert(
  '使用正式 teamClub/service 云仓储路径',
  requireSpecs.some(function (r) {
    return /utils\/teamClub\/service(?:\.js)?$/.test(r);
  })
);

delete global.__TEAM_CLUB_REPO_MODE;
var factory = require(path.join(mini, 'utils', 'teamClub', 'repoFactory.js'));
var flags = require(path.join(mini, 'utils', 'teamClub', 'devFlags.js'));
assert(
  '生产默认云仓储且不回落 mock/local',
  factory.getMode() === 'cloud' &&
    flags.USE_LOCAL_REPOSITORY === false &&
    requireSpecs.indexOf('../../../../../utils/teamClub/repository.js') < 0 &&
    requireSpecs.indexOf('../../../../../utils/teamClub/mock.js') < 0 &&
    newJs.indexOf("require('./mock") < 0
);

var wxml = read(path.join(newPageDir, 'index.wxml'));
JSON.parse(read(path.join(newPageDir, 'index.json')));
assert('页面 JSON 可解析', true);
assert(
  '页面四件套与空态结构完整',
  ['js', 'wxml', 'wxss', 'json'].every(function (ext) {
    return fs.existsSync(path.join(newPageDir, 'index.' + ext));
  }) &&
    wxml.indexOf('showEmptyState') >= 0 &&
    wxml.indexOf('team-empty') >= 0
);

var utilsRoot = path.join(mini, 'utils') + path.sep;
var createRoot = path.join(mini, 'subpackages', 'create') + path.sep;
var heavyRoots = [
  path.join(mini, 'subpackages', 'poster') + path.sep,
  path.join(mini, 'subpackages', 'game') + path.sep,
  path.join(mini, 'subpackages', 'tournament') + path.sep,
  path.join(mini, 'subpackages', 'tournament-manage') + path.sep,
  path.join(mini, 'subpackages', 'scoring') + path.sep,
  path.join(mini, 'subpackages', 'player', 'pages') + path.sep
];
var heavyHits = requiredFiles.filter(function (abs) {
  return heavyRoots.some(function (rootDir) {
    return abs.indexOf(rootDir) === 0;
  });
});
assert(
  '不依赖海报/游戏/赛事等大型无关分包',
  heavyHits.length === 0 &&
    requiredFiles.every(function (abs) {
      return abs.indexOf(utilsRoot) === 0 || abs.indexOf(createRoot) === 0;
    })
);
assert(
  '公开契约：列表刷新与确认入口仍存在',
  newJs.indexOf('refreshTeams') >= 0 && newJs.indexOf('onConfirm') >= 0
);
assert(
  '空态/加载态/错误态可处理',
  newJs.indexOf('showEmptyState') >= 0 &&
    newJs.indexOf('emptyVisible') >= 0 &&
    /createTeam\s*\(/.test(newJs) &&
    /\.then\s*\(/.test(newJs) &&
    newJs.indexOf("title: (res && res.message) || '创建失败'") >= 0
);
assert('未保留 redirect 兼容壳', !fs.existsSync(oldPageDir));

console.log('\npassed=' + passed + ' failed=' + failed);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
