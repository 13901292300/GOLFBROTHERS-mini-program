/**
 * 海报创建页 page.json：分享走 Page.onShareAppMessage，禁止无效 enableShareAppMessage。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/posterCreatePageJson.selftest.js
 */

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var pageDir = path.join(root, 'miniprogram', 'subpackages', 'poster', 'pages', 'create');
var jsonPath = path.join(pageDir, 'index.json');
var jsPath = path.join(pageDir, 'index.js');
var passed = 0;
var failed = 0;

function assert(label, ok) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
    return;
  }
  failed += 1;
  console.log('FAIL  ' + label);
}

function walkJsonFiles(dir, acc) {
  acc = acc || [];
  if (!fs.existsSync(dir)) return acc;
  fs.readdirSync(dir).forEach(function (name) {
    var abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) walkJsonFiles(abs, acc);
    else if (/\.json$/i.test(name)) acc.push(abs);
  });
  return acc;
}

var jsonText = fs.readFileSync(jsonPath, 'utf8');
var pageJson = null;
var parseOk = false;
try {
  pageJson = JSON.parse(jsonText);
  parseOk = true;
} catch (e) {
  pageJson = {};
}
assert('海报页 JSON 可解析', parseOk);
assert(
  '海报页 JSON 不含 enableShareAppMessage',
  parseOk && !Object.prototype.hasOwnProperty.call(pageJson, 'enableShareAppMessage') &&
    jsonText.indexOf('enableShareAppMessage') < 0
);
assert(
  '保留 usingComponents / navigationStyle / navigationBarTitleText',
  pageJson.usingComponents &&
    pageJson.usingComponents['golf-poster'] === '../../components/golf-poster/index' &&
    pageJson.navigationStyle === 'custom' &&
    pageJson.navigationBarTitleText === '高尔夫海报'
);

var js = fs.readFileSync(jsPath, 'utf8');
assert(
  '海报页 JS 实现 onShareAppMessage()',
  /onShareAppMessage\s*\(\s*\)\s*\{/.test(js) &&
    js.indexOf("path: '/subpackages/poster/pages/create/index") >= 0
);

var hits = [];
walkJsonFiles(path.join(root, 'miniprogram'), hits);
var invalid = hits.filter(function (abs) {
  return fs.readFileSync(abs, 'utf8').indexOf('enableShareAppMessage') >= 0;
}).map(function (abs) {
  return path.relative(root, abs).replace(/\\/g, '/');
});
assert('miniprogram 内 JSON 无 enableShareAppMessage', invalid.length === 0);

console.log('\npassed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
