/**
 * course/select 迁入 create 分包：路由、依赖与选场契约。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/courseSelectSubpackage.selftest.js
 */

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var newPageDir = path.join(mini, 'subpackages', 'create', 'pages', 'course', 'select');
var oldPageDir = path.join(mini, 'pages', 'course', 'select');
var targetUrl = '/subpackages/create/pages/course/select/index';
var oldUrl = '/pages/course/select/index';
var courseDbPath = path.join(mini, 'utils', 'courseDatabase.js');
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

function walkFiles(dir, acc) {
  acc = acc || [];
  if (!fs.existsSync(dir)) return acc;
  fs.readdirSync(dir).forEach(function (name) {
    var abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) walkFiles(abs, acc);
    else acc.push(abs);
  });
  return acc;
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

var extensions = ['js', 'wxml', 'wxss', 'json'];
assert(
  '新页面四文件存在',
  extensions.every(function (ext) {
    return fs.existsSync(path.join(newPageDir, 'index.' + ext));
  })
);

var courseSelectDirs = [];
walkFiles(mini).forEach(function (abs) {
  var rel = path.relative(mini, abs).replace(/\\/g, '/');
  if (/pages\/course\/select\/index\.(js|json|wxml|wxss)$/.test(rel)) {
    var dir = path.dirname(abs);
    if (courseSelectDirs.indexOf(dir) < 0) courseSelectDirs.push(dir);
  }
});
assert(
  'course/select 只存在于 create 分包',
  courseSelectDirs.length === 1 &&
    path.resolve(courseSelectDirs[0]) === path.resolve(newPageDir)
);

var appJson;
var jsonOk = false;
try {
  appJson = JSON.parse(read(path.join(mini, 'app.json')));
  jsonOk = true;
} catch (e) {
  appJson = { pages: [], subPackages: [] };
}
assert('app.json 可解析', jsonOk);
var createPackage = (appJson.subPackages || []).find(function (item) {
  return item && item.root === 'subpackages/create';
});
assert(
  'create 分包注册新页面',
  !!createPackage && createPackage.pages.indexOf('pages/course/select/index') >= 0
);
assert('主包旧声明已移除', appJson.pages.indexOf('pages/course/select/index') < 0);
assert('旧物理页面目录不存在', !fs.existsSync(oldPageDir));

var callers = [
  ['普通创建', path.join(mini, 'subpackages', 'create', 'pages', 'normal', 'index.js')],
  ['队内创建', path.join(mini, 'subpackages', 'create', 'pages', 'team-internal', 'index.js')],
  ['队际创建', path.join(mini, 'subpackages', 'create', 'pages', 'team-inter', 'index.js')],
  ['Series 创建', path.join(mini, 'subpackages', 'create', 'pages', 'series', 'index.js')]
];
var callerSources = callers.map(function (item) {
  return [item[0], read(item[1])];
});
var allCallerSource = callerSources.map(function (item) { return item[1]; }).join('\n');
assert(
  '普通创建/队内/队际/Series 四类调用不缺失',
  callerSources.every(function (item) {
    return item[1].indexOf(targetUrl) >= 0;
  })
);
assert('四个生产入口全部更新', allCallerSource.split(targetUrl).length - 1 === 4);
assert(
  '创建入口旧生产路由为 0',
  !new RegExp("['\"]" + oldUrl.replace(/\//g, '\\/')).test(allCallerSource)
);
assert(
  'selectedId 与 Series query 编码保留',
  callerSources.slice(0, 3).every(function (item) {
    return item[1].indexOf(targetUrl + "?selectedId=' + (this.data.courseId || '')") >= 0;
  }) &&
    callerSources[3][1].indexOf(targetUrl + "?selectedId=' + encodeURIComponent(selectedId || '')") >= 0
);
assert(
  '四个入口保持 navigateTo 与 courseSelected events',
  callerSources.every(function (item) {
    var routeAt = item[1].indexOf(targetUrl);
    var before = item[1].slice(Math.max(0, routeAt - 100), routeAt);
    var after = item[1].slice(routeAt, routeAt + 500);
    return before.indexOf('wx.navigateTo({') >= 0 && after.indexOf('courseSelected') >= 0;
  })
);

var productionOldHits = [];
walkFiles(mini).forEach(function (abs) {
  if (!/\.(js|json|wxml)$/i.test(abs)) return;
  var text = read(abs);
  if (new RegExp("['\"]" + oldUrl.replace(/\//g, '\\/')).test(text)) {
    productionOldHits.push(path.relative(mini, abs).replace(/\\/g, '/'));
  }
});
assert('miniprogram 生产源码旧选场路由为 0', productionOldHits.length === 0);

var newJsPath = path.join(newPageDir, 'index.js');
var newJs = read(newJsPath);
var newWxml = read(path.join(newPageDir, 'index.wxml'));
assert(
  'courseSelected eventChannel 与返回栈保留',
  newJs.indexOf("channel.emit('courseSelected', payload)") >= 0 &&
    newJs.indexOf('wx.navigateBack({ delta: 1') >= 0
);
assert(
  '定位、搜索与半场处理入口保留',
  newJs.indexOf('wx.getLocation({') >= 0 &&
    methodSource(newJs, 'onSearchInput').length > 0 &&
    newWxml.indexOf('bindinput="onSearchInput"') >= 0 &&
    newWxml.indexOf('bindtap="onSelectCourse"') >= 0 &&
    methodSource(newJs, 'onSelectCourse').indexOf('openHalfPopup') >= 0
);

var requiredFiles = [];
var requiredMap = {};
newJs.replace(/require\(['"]([^'"]+)['"]\)/g, function (match, request) {
  var abs = path.resolve(newPageDir, request);
  requiredFiles.push(abs);
  requiredMap[path.basename(abs)] = { request: request, abs: abs };
  return match;
});
assert(
  'headerEngine/courseDatabase/halfCourse require 均可解析',
  requiredFiles.length === 3 &&
    requiredFiles.every(fs.existsSync) &&
    requiredMap['headerEngine.js'] &&
    requiredMap['courseDatabase.js'] &&
    requiredMap['halfCourse.js']
);

var dbImport = newJs.match(/\{([^}]*)\}\s*=\s*require\(['"]([^'"]*courseDatabase\.js)['"]\)/);
var importedNames = dbImport ? dbImport[1] : '';
var importedDbPath = dbImport ? path.resolve(newPageDir, dbImport[2]) : '';
assert(
  'resolveFirstTwoCourses 从 courseDatabase.js 解构导入',
  !!dbImport &&
    /\bresolveFirstTwoCourses\b/.test(importedNames) &&
    importedDbPath === courseDbPath &&
    fs.existsSync(importedDbPath)
);

var courseDb = require(courseDbPath);
assert(
  'courseDatabase 真实导出 resolveFirstTwoCourses',
  typeof courseDb.resolveFirstTwoCourses === 'function'
);

var selectSrc = methodSource(newJs, 'onSelectCourse');
assert(
  '选场流程调用 resolveFirstTwoCourses',
  selectSrc.indexOf('resolveFirstTwoCourses(') >= 0 &&
    selectSrc.indexOf('halfCourses') >= 0 &&
    selectSrc.indexOf('_returnCourse') >= 0
);

var emptyHalves = courseDb.resolveFirstTwoCourses(null);
assert(
  '空球场半场结果为空',
  emptyHalves &&
    emptyHalves.front9Course == null &&
    emptyHalves.back9Course == null &&
    emptyHalves.halfText === ''
);
var namedHalves = courseDb.resolveFirstTwoCourses({
  halfCourses: [{ code: 'C' }, { code: 'D' }]
});
assert(
  '具名半场取前两个 COURSE 代码',
  namedHalves.front9Course === 'C' &&
    namedHalves.back9Course === 'D' &&
    namedHalves.halfText === 'C/D'
);
var countedHalves = courseDb.resolveFirstTwoCourses({ halfCourseCount: 2 });
assert(
  '按数量推导 A/B 半场',
  countedHalves.front9Course === 'A' &&
    countedHalves.back9Course === 'B' &&
    countedHalves.halfText === 'A/B'
);
var singleHalf = courseDb.resolveFirstTwoCourses({ halfCourseCount: 1 });
assert(
  '单半场只填前九',
  singleHalf.front9Course === 'A' &&
    singleHalf.back9Course == null &&
    singleHalf.halfText === 'A'
);

var pageJsonOk = false;
try {
  JSON.parse(read(path.join(newPageDir, 'index.json')));
  pageJsonOk = true;
} catch (e) {
  pageJsonOk = false;
}
assert('页面 JSON 可解析', pageJsonOk);
assert('未保留 redirect 兼容壳', !fs.existsSync(oldPageDir));

console.log('\npassed=' + passed + ' failed=' + failed);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
