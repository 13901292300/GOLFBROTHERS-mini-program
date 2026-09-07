/**
 * 架构守卫：主体运行时与正式测试不得引用隔离沙盒目录。
 * 运行：node scripts/sandboxIsolation.selftest.js
 */
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var posterBox = '03-' + '海报沙盒';
var gameBox = '04-' + '游戏沙盒';
var passed = 0;
var failed = 0;

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function walk(dir, acc) {
  acc = acc || [];
  if (!fs.existsSync(dir)) return acc;
  fs.readdirSync(dir).forEach(function (name) {
    if (name === 'node_modules' || name === '.git') return;
    var abs = path.join(dir, name);
    var st = fs.statSync(abs);
    if (st.isDirectory()) walk(abs, acc);
    else acc.push(abs);
  });
  return acc;
}

function hitsIn(text) {
  var n = String(text || '').replace(/\\/g, '/');
  var hits = [];
  if (n.indexOf(posterBox) >= 0) hits.push(posterBox);
  if (n.indexOf(gameBox) >= 0) hits.push(gameBox);
  if (n.indexOf('03/' + '海报沙盒') >= 0) hits.push('03/' + '海报沙盒');
  if (n.indexOf('04/' + '游戏沙盒') >= 0) hits.push('04/' + '游戏沙盒');
  if (/['"]03-['"]\s*\+\s*['"]海报沙盒['"]/.test(n)) hits.push('concat:' + posterBox);
  if (/['"]04-['"]\s*\+\s*['"]游戏沙盒['"]/.test(n)) hits.push('concat:' + gameBox);
  return hits;
}

var scanRoots = [
  path.join(root, 'miniprogram'),
  path.join(root, 'cloudfunctions'),
  path.join(root, 'scripts'),
  path.join(root, 'project.config.json'),
  path.join(root, 'project.private.config.json')
];

var files = [];
scanRoots.forEach(function (p) {
  if (!fs.existsSync(p)) return;
  if (fs.statSync(p).isDirectory()) walk(p, files);
  else files.push(p);
});

var runtimeHits = [];
var testHits = [];
files.forEach(function (abs) {
  if (!/\.(js|json|wxml|wxss|md|html)$/i.test(abs)) return;
  var rel = path.relative(root, abs).replace(/\\/g, '/');
  if (rel === 'scripts/sandboxIsolation.selftest.js') return;
  var text = fs.readFileSync(abs, 'utf8');
  var found = hitsIn(text);
  if (!found.length) return;
  var row = rel + ' → ' + found.join(',');
  if (rel.indexOf('scripts/') === 0) testHits.push(row);
  else runtimeHits.push(row);
});

assert('主体运行时不引用隔离沙盒路径', runtimeHits.length === 0, runtimeHits.join(' | '));
assert('正式测试不引用隔离沙盒路径', testHits.length === 0, testHits.join(' | '));

var appJson = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram', 'app.json'), 'utf8'));
var appText = JSON.stringify(appJson);
assert('app.json 不注册沙盒路径', hitsIn(appText).length === 0);

var pack = fs.readFileSync(path.join(root, 'project.config.json'), 'utf8');
assert('project.config.json 不引用沙盒', hitsIn(pack).length === 0);

assert(
  '仓库内小程序工程不是沙盒目录',
  !fs.existsSync(path.join(root, posterBox)) && !fs.existsSync(path.join(root, gameBox))
);

console.log('\nsandboxIsolation.selftest passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
