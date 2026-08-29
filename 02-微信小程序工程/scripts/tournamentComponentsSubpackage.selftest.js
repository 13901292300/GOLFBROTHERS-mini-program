/**
 * tournament 专属组件迁入分包：match-play-scoreboard / series-round-selector-dock。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/tournamentComponentsSubpackage.selftest.js
 */

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var paths = require('./lib/seriesTestPaths.js');
var sbDir = path.join(paths.TOUR_COMPONENTS, 'match-play-scoreboard');
var dockDir = path.join(paths.TOUR_COMPONENTS, 'series-round-selector-dock');
var styleFile = path.join(paths.TOUR_STYLES, 'match-play-scoreboard.wxss');
var detailJson = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail', 'index.json');
var seriesJson = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail', 'index.json');
var seriesJs = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail', 'index.js');
var newSb = '/subpackages/tournament/components/match-play-scoreboard/index';
var newDock = '/subpackages/tournament/components/series-round-selector-dock/index';
var relativeStyleImport = '@import "../../styles/match-play-scoreboard.wxss";'

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

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
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

assert('match-play-scoreboard 四文件在 tournament', ['js', 'json', 'wxml', 'wxss'].every(function (ext) {
  return fs.existsSync(path.join(sbDir, 'index.' + ext));
}));
assert(
  'series-round-selector-dock 四文件 + overflowArrows 在 tournament',
  ['js', 'json', 'wxml', 'wxss'].every(function (ext) {
    return fs.existsSync(path.join(dockDir, 'index.' + ext));
  }) && fs.existsSync(path.join(dockDir, 'overflowArrows.js'))
);
assert('专用样式已迁入 tournament/styles', fs.existsSync(styleFile));
assert('主包旧组件目录已移除', !fs.existsSync(path.join(mini, 'components', 'match-play-scoreboard')));
assert('主包旧 dock 目录已移除', !fs.existsSync(path.join(mini, 'components', 'series-round-selector-dock')));
assert('主包旧专用样式已移除', !fs.existsSync(path.join(mini, 'styles', 'match-play-scoreboard.wxss')));

var hashes = {
  'match-play-scoreboard/index.js': '9FCDF099F388367C89ACDE3F17DB0C5A769075C2FB95E58FF57096DB6C7858D6',
  'match-play-scoreboard/index.json': 'FEBDF1A7672F8C47DCCF1072165A6FEB332E7CDFE418F7B3345249206824FE5A',
  'match-play-scoreboard/index.wxml': 'A5816A4121444FA75D2DC183DAC6B4F3F91D92E043B2C757894D99C1DE413225',
  'series-round-selector-dock/index.js': '5729FA8EAE31D59DE05C831133AF3BCC45813FF70870151EB81524A611E43AD4',
  'series-round-selector-dock/index.json': 'FEBDF1A7672F8C47DCCF1072165A6FEB332E7CDFE418F7B3345249206824FE5A',
  'series-round-selector-dock/index.wxml': '02C3755829B4DC3672F5C3E8951A22D806E3CD68770B7A50337510EAE76CF390',
  'series-round-selector-dock/index.wxss': '97F4AE38C92C763AAFEDFCE5E180E474A7997E954E95C77439B985BDE5E31348',
  'series-round-selector-dock/overflowArrows.js': '54C2C136A750E3E8AB60E49B59F3688D8D9D398B2E30AEB9F2AE5039B9353B44'
};
Object.keys(hashes).forEach(function (rel) {
  assert(rel + ' 除路径外内容哈希不变', hashFile(path.join(paths.TOUR_COMPONENTS, rel)) === hashes[rel]);
});
assert(
  '专用样式文件哈希不变',
  hashFile(styleFile) === '0276868E1CD3B136115B56A5FAC70065E78FC229C8B0A3AB69740EE217759288'
);
var sbWxss = read(path.join(sbDir, 'index.wxss'));
var detailWxssPath = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail', 'index.wxss');
var seriesWxssPath = path.join(
  mini,
  'subpackages',
  'tournament',
  'pages',
  'series-detail',
  'index.wxss'
);
var detailWxss = read(detailWxssPath);
var seriesWxss = read(seriesWxssPath);
assert(
  'scoreboard 组件 wxss 使用分包内相对 @import',
  sbWxss.trim() === relativeStyleImport
);
assert(
  '三处 @import 均为 ../../styles/match-play-scoreboard.wxss',
  sbWxss.indexOf(relativeStyleImport) >= 0 &&
    detailWxss.indexOf(relativeStyleImport) >= 0 &&
    seriesWxss.indexOf(relativeStyleImport) >= 0
);
assert(
  '相对路径可解析到 tournament/styles',
  path.resolve(sbDir, '../../styles/match-play-scoreboard.wxss') === styleFile &&
    path.resolve(path.dirname(detailWxssPath), '../../styles/match-play-scoreboard.wxss') ===
      styleFile &&
    path.resolve(path.dirname(seriesWxssPath), '../../styles/match-play-scoreboard.wxss') ===
      styleFile
);

var detail = JSON.parse(read(detailJson));
var series = JSON.parse(read(seriesJson));
JSON.parse(read(path.join(sbDir, 'index.json')));
JSON.parse(read(path.join(dockDir, 'index.json')));
assert('全部相关 JSON 可解析', true);
assert(
  '普通比洞赛详情注册新 scoreboard',
  detail.usingComponents && detail.usingComponents['match-play-scoreboard'] === newSb
);
assert(
  'Series 莱德杯详情注册新 scoreboard',
  series.usingComponents && series.usingComponents['match-play-scoreboard'] === newSb
);
assert(
  'Rx selector dock 注册新路径',
  series.usingComponents && series.usingComponents['series-round-selector-dock'] === newDock
);
assert('detail 未注册 dock', !detail.usingComponents['series-round-selector-dock']);

assert(
  'series-detail overflowArrows require 指向分包组件且文件存在',
  read(seriesJs).indexOf("require('../../components/series-round-selector-dock/overflowArrows.js')") >= 0 &&
    fs.existsSync(path.join(dockDir, 'overflowArrows.js'))
);

var dockJs = read(path.join(dockDir, 'index.js'));
var reqs = [];
dockJs.replace(/require\(['"]([^'"]+)['"]\)/g, function (m, req) {
  reqs.push(path.resolve(dockDir, req));
  return m;
});
assert('dock 内部 require 均可解析', reqs.length > 0 && reqs.every(fs.existsSync));
assert(
  '组件未 require 其他分包',
  read(path.join(sbDir, 'index.js')).indexOf('subpackages/') < 0 &&
    dockJs.indexOf("require('") >= 0 &&
    dockJs.indexOf('/subpackages/') < 0
);

var oldNeedles = [
  '"/components/match-play-scoreboard',
  "'/components/match-play-scoreboard",
  '"/components/series-round-selector-dock',
  "'/components/series-round-selector-dock",
  '../../../../components/series-round-selector-dock',
  '../../../../components/match-play-scoreboard',
  '@import "/styles/match-play-scoreboard.wxss"',
  '@import "/subpackages/tournament/styles/match-play-scoreboard.wxss"'
];
var productionHits = [];
walkFiles(mini).forEach(function (abs) {
  if (!/\.(js|json|wxml|wxss)$/i.test(abs)) return;
  var rel = path.relative(mini, abs).replace(/\\/g, '/');
  var text = read(abs);
  var hit = oldNeedles.some(function (n) {
    return text.indexOf(n) >= 0;
  });
  if (hit) productionHits.push(rel);
});
assert('主包旧组件/旧样式生产引用为 0', productionHits.length === 0);
if (productionHits.length) console.log('OLD_HITS=' + productionHits.join(','));

assert(
  '三处禁止主包绝对路径与分包绝对 WXSS 路径',
  sbWxss.indexOf('@import "/styles/match-play-scoreboard.wxss"') < 0 &&
    detailWxss.indexOf('@import "/styles/match-play-scoreboard.wxss"') < 0 &&
    seriesWxss.indexOf('@import "/styles/match-play-scoreboard.wxss"') < 0 &&
    sbWxss.indexOf('/subpackages/tournament/styles/match-play-scoreboard.wxss') < 0 &&
    detailWxss.indexOf('/subpackages/tournament/styles/match-play-scoreboard.wxss') < 0 &&
    seriesWxss.indexOf('/subpackages/tournament/styles/match-play-scoreboard.wxss') < 0
);

console.log('\npassed=' + passed + ' failed=' + failed);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
