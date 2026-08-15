/**
 * LEADERBOARD-NAME-GENDER-INLINE-FIX
 * 共享身份格：昵称不 flex:1，性别紧跟昵称。
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsLeaderboardNameGenderInline.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..', 'miniprogram');
var cellDir = path.join(root, 'components', 'leaderboard-player-name-cell');

function read(name) {
  return fs.readFileSync(path.join(cellDir, name), 'utf8');
}

var wxss = read('index.wxss');
var wxml = read('index.wxml');
var json = read('index.json');
var js = read('index.js');
var liveWxml = fs.readFileSync(
  path.join(root, 'components', 'live-leaderboard-board', 'index.wxml'),
  'utf8'
);
var seriesWxml = fs.readFileSync(
  path.join(root, 'subpackages', 'tournament', 'pages', 'series-detail', 'index.wxml'),
  'utf8'
);
var detailWxss = fs.readFileSync(
  path.join(root, 'subpackages', 'tournament', 'pages', 'detail', 'index.wxss'),
  'utf8'
);
var seriesWxss = fs.readFileSync(
  path.join(root, 'subpackages', 'tournament', 'pages', 'series-detail', 'index.wxss'),
  'utf8'
);

var passed = 0;
var failed = 0;
var failures = [];

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    failures.push(name + (detail ? ' :: ' + detail : ''));
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

assert(
  '根容器从左排列，不把性别顶到列右',
  /justify-content:\s*flex-start/.test(wxss) &&
    /display:\s*flex/.test(wxss) &&
    /align-items:\s*center/.test(wxss) &&
    /min-width:\s*0/.test(wxss)
);

assert(
  '昵称 flex:0 1 auto，禁止 flex:1',
  /flex:\s*0 1 auto/.test(wxss) &&
    /max-width:\s*100%/.test(wxss) &&
    wxss.indexOf('text-overflow: ellipsis') >= 0 &&
    !/\.player-name\s*\{[^}]*flex:\s*1/.test(wxss) &&
    wxss.indexOf('flex: 1') < 0 &&
    wxss.indexOf('flex:1') < 0
);

assert(
  '性别/标签 flex:none，紧跟前项，无 margin-left:auto / 绝对定位',
  /flex:\s*none/.test(wxss) &&
    /margin-left:\s*6rpx/.test(wxss) &&
    wxss.indexOf('margin-left: auto') < 0 &&
    wxss.indexOf('margin-left:auto') < 0 &&
    wxss.indexOf('position: absolute') < 0 &&
    wxss.indexOf('grid-template-columns') < 0
);

assert(
  '未知性别不占位；轮次在性别之后',
  wxml.indexOf('wx:if="{{genderIcon}}"') >= 0 &&
    wxml.indexOf('class="player-name"') < wxml.indexOf('gender-icon') &&
    wxml.indexOf('gender-icon') < wxml.indexOf('series-standings-round-tag')
);

assert(
  'host 用 virtualHost，不在三处宿主写专用身份格 CSS',
  json.indexOf('"virtualHost": true') >= 0 &&
    js.indexOf('virtualHost: true') >= 0 &&
    json.indexOf('apply-shared') >= 0 &&
    detailWxss.indexOf('leaderboard-player-name-cell') < 0 &&
    seriesWxss.indexOf('leaderboard-player-name-cell') < 0 &&
    liveWxml.indexOf('<leaderboard-player-name-cell') >= 0 &&
    seriesWxml.indexOf('<leaderboard-player-name-cell') >= 0
);

console.log('');
console.log('--- seriesStandingsLeaderboardNameGenderInline.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exitCode = 1;
}
process.exit(failed ? 1 : 0);
