/**
 * team/select 迁入 create 分包：页面完整性、路由与 eventChannel 契约。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/teamSelectSubpackage.selftest.js
 */

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

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
newJs.replace(/require\(['"]([^'"]+)['"]\)/g, function (match, request) {
  requiredFiles.push(path.resolve(newPageDir, request));
  return match;
});
assert(
  '四个主包 utils require 均可解析',
  requiredFiles.length === 4 && requiredFiles.every(fs.existsSync)
);

JSON.parse(read(path.join(newPageDir, 'index.json')));
assert('页面 JSON 可解析', true);

var normalizedJs = newJs
  .replace(/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/utils\//g, '../../../utils/')
  .replace(/\r\n/g, '\n');
assert(
  '业务页面除 require 外内容保持原样',
  hashBuffer(Buffer.from(normalizedJs, 'utf8')) ===
      'C27F1D819501C666780196A72AEEBBE836B6EFF00D984F7DC54BF62F558B9B49' &&
    hashFile(path.join(newPageDir, 'index.wxml')) ===
      '1E01F82357F0E18B96D1993C5EB59120C9E0A6DAD4B2B6779CFC4DC52F1DEC8F' &&
    hashFile(path.join(newPageDir, 'index.wxss')) ===
      '1574170DA9D3FDAFA183F864A9F6A3E978A8F5A62F75F2D38EBEB357CFEAB8A4' &&
    hashFile(path.join(newPageDir, 'index.json')) ===
      '38F20314C5CD1B7AD1A9D900520CE04EA1EE0469D66D5E84884BA11FAA3E0992'
);
assert('未保留 redirect 兼容壳', !fs.existsSync(oldPageDir));

console.log('\npassed=' + passed + ' failed=' + failed);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
