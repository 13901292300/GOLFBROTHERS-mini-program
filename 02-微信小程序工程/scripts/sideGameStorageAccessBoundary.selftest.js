/**
 * 生产业务不得直读写 side-game v1/v2 storage key。
 * 运行：node scripts/sideGameStorageAccessBoundary.selftest.js
 */
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..', 'miniprogram');
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

var ALLOW_FILES = {
  'localSideGameRepository.js': true,
  'sideGameStorageV2Migration.js': true,
  'sideGameStorageV2Store.js': true
};

var NEEDLES = ['gb_side_games_v1', 'gb_side_game_v2:', 'gb_side_games_index_v2'];

var FOCUS = [
  'rankMarkProjection.js',
  'sideGameRankMark.js',
  'matchHoleOrderRebuild.js',
  'groupManageIdentityDiff.js'
];

function walk(dir, out) {
  fs.readdirSync(dir).forEach(function (name) {
    if (name === 'node_modules' || name === '.git') return;
    var full = path.join(dir, name);
    var st = fs.statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
      return;
    }
    if (!/\.(js|wxml|json)$/.test(name)) return;
    out.push(full);
  });
}

function isTestFile(file) {
  return /selftest|\.test\.|spec\.js$/.test(file.replace(/\\/g, '/'));
}

var files = [];
walk(root, files);

var hits = [];
files.forEach(function (file) {
  if (isTestFile(file)) return;
  var base = path.basename(file);
  if (ALLOW_FILES[base]) return;
  var text = fs.readFileSync(file, 'utf8');
  NEEDLES.forEach(function (needle) {
    if (text.indexOf(needle) >= 0) {
      hits.push({ file: path.relative(root, file), needle: needle });
    }
  });
});

assert('生产业务无 v1/v2 key 直引用', hits.length === 0, JSON.stringify(hits.slice(0, 20)));

FOCUS.forEach(function (name) {
  var hit = hits.filter(function (h) {
    return path.basename(h.file) === name;
  });
  assert(name + ' 无 storage key', hit.length === 0, JSON.stringify(hit));
});

var scorePage = path.join(root, 'subpackages', 'scoring', 'pages', 'score', 'index.js');
var scoreText = fs.readFileSync(scorePage, 'utf8');
assert('score/index.js 无 gb_side_games_v1', scoreText.indexOf('gb_side_games_v1') < 0);
assert('score/index.js 无 v2 instance prefix', scoreText.indexOf('gb_side_game_v2:') < 0);
assert('score/index.js 无 v2 index key', scoreText.indexOf('gb_side_games_index_v2') < 0);
assert(
  'score 走 inspectPlayerIdsRemap 门面',
  scoreText.indexOf('inspectPlayerIdsRemap') >= 0
);

console.log('\nsideGameStorageAccessBoundary.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
