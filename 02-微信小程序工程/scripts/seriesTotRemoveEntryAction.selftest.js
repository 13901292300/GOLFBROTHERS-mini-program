/**
 * SERIES-TOT-REMOVE-ENTRY-ACTION
 * TOT 展开组合行去掉右侧进入箭头，TO PAR 回到最右列；整行点击保留。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesTotRemoveEntryAction.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');
var liveDir = path.join(mini, 'components', 'live-leaderboard-board');

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

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function sliceBetween(src, beginToken, endToken) {
  var from = src.indexOf(beginToken);
  if (from < 0) return '';
  var end = endToken ? src.indexOf(endToken, from) : -1;
  return end < 0 ? src.slice(from, from + 2200) : src.slice(from, end);
}

var seriesWxml = read(path.join(seriesDir, 'index.wxml'));
var seriesWxss = read(path.join(seriesDir, 'index.wxss'));
var seriesJs = read(path.join(seriesDir, 'index.js'));
var detailWxml = read(path.join(detailDir, 'index.wxml'));
var liveWxml = read(path.join(liveDir, 'index.wxml'));
var liveJs = read(path.join(liveDir, 'index.js'));
var commonWxss = read(path.join(mini, 'styles', 'tournament-common.wxss'));

var totBlock = sliceBetween(
  seriesWxml,
  '<!-- 球队榜：主榜固定序 + R/TOT 展开 -->',
  '<block wx:if="{{activeTab === \'register\'}}">'
);
var totRow = sliceBetween(
  totBlock,
  'catchtap="onStandingsPlayerTap"',
  'class="scorecard-row"'
);

assert(
  'TOT 不再渲染进入组合按钮/箭头',
  totBlock.indexOf('进入组合') < 0 &&
    totBlock.indexOf('series-standings-scorecard-chevron') < 0 &&
    totRow.indexOf('›') < 0 &&
    totRow.indexOf('⌃') < 0
);

assert(
  'TO PAR 是组合行最后一个成绩列，与表头 lh-total 同宽契约',
  /lh-total">TO PAR/.test(totBlock) &&
    /class="lr-total leaderboard-total \{\{player\.scoreClass\}\}"/.test(totRow) &&
    totRow.lastIndexOf('lr-total') > totRow.lastIndexOf('lr-thru') &&
    totRow.indexOf('lr-total') >= 0 &&
    !/lr-total[\s\S]{0,200}series-standings-scorecard-chevron/.test(totRow) &&
    /\.lh-total\s*\{\s*width:\s*20%/.test(commonWxss) &&
    /\.lr-total\s*\{\s*width:\s*20%/.test(commonWxss)
);

var tapHandler = seriesJs.slice(
  seriesJs.indexOf('onStandingsPlayerTap:'),
  seriesJs.indexOf('onStandingsPlayerTap:') + 2200
);

assert(
  '组合行整行点击仍打开记分卡，不跳转页面',
  totRow.indexOf('catchtap="onStandingsPlayerTap"') >= 0 &&
    totRow.indexOf('data-player="{{player}}"') >= 0 &&
    /onStandingsPlayerTap:\s*function/.test(seriesJs) &&
    /_openStandingsPlayerScorecard:\s*function/.test(seriesJs) &&
    tapHandler.indexOf('_openStandingsPlayerScorecard') >= 0 &&
    tapHandler.indexOf('navigateTo') < 0 &&
    tapHandler.indexOf('redirectTo') < 0 &&
    tapHandler.indexOf('reLaunch') < 0
);

assert(
  '专用 chevron 样式已删除',
  seriesWxss.indexOf('.series-standings-scorecard-chevron') < 0
);

assert(
  'R1/R2 共享 live-leaderboard-board 无该按钮',
  liveWxml.indexOf('进入组合') < 0 &&
    liveWxml.indexOf('series-standings-scorecard-chevron') < 0 &&
    liveJs.indexOf('进入组合') < 0
);

assert(
  '普通 detail 未改该入口',
  detailWxml.indexOf('series-standings-scorecard-chevron') < 0 &&
    detailWxml.indexOf('进入组合') < 0
);

console.log('');
console.log('---- seriesTotRemoveEntryAction.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
