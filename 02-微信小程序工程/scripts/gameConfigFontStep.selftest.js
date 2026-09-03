/**
 * 游戏实例配置：头像下昵称、8421 分值数字各放大一级。
 * 运行：node scripts/gameConfigFontStep.selftest.js
 */
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game');
var ui = fs.readFileSync(path.join(root, 'styles', 'game-ui.wxss'), 'utf8');
var configWxss = fs.readFileSync(path.join(root, 'pages', 'config', 'index.wxss'), 'utf8');
var configWxml = fs.readFileSync(path.join(root, 'pages', 'config', 'index.wxml'), 'utf8');
var scoreWxml = fs.readFileSync(path.join(root, 'pages', 'score-config', 'index.wxml'), 'utf8');
var scoreWxss = fs.readFileSync(path.join(root, 'pages', 'score-config', 'index.wxss'), 'utf8');

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

function block(src, selector) {
  var re = new RegExp(selector.replace(/\./g, '\\.') + '\\s*\\{[^}]+\\}');
  var m = src.match(re);
  return m ? m[0] : '';
}

var nameBlock = block(ui, '.player-name');
assert('昵称字号 18→20', /font-size:\s*20rpx/.test(nameBlock) && !/font-size:\s*18rpx/.test(nameBlock));
assert(
  '昵称仍单行省略',
  /\.player-slot \.player-name[\s\S]{0,120}white-space:\s*nowrap/.test(configWxss) &&
    /text-overflow:\s*ellipsis/.test(configWxss)
);

var lasuoName = block(configWxss, '.player-grid--lasuo8 .player-name');
assert('8 人密网格昵称 16→18', /font-size:\s*18rpx/.test(lasuoName));

var scoreVal = block(ui, '.score-val');
assert(
  '分值码 .score-val 18→20 且高度不变',
  /font-size:\s*20rpx/.test(scoreVal) &&
    /height:\s*32rpx/.test(scoreVal) &&
    /line-height:\s*32rpx/.test(scoreVal)
);

var preset = block(ui, '.preset-btn');
assert(
  '分值格 .preset-btn 22→24 且点击区高度不变',
  /font-size:\s*24rpx/.test(preset) &&
    /height:\s*64rpx/.test(preset) &&
    /line-height:\s*64rpx/.test(preset)
);

assert(
  'config 与 score-config 共用 preset-btn / score-val',
  /class="preset-btn/.test(configWxml) &&
    /class="preset-btn/.test(scoreWxml) &&
    /score-val score-val--/.test(configWxml) &&
    /score-val score-val--/.test(scoreWxml) &&
    !/\.preset-btn[\s\S]{0,80}font-size/.test(scoreWxss) &&
    !/\.score-val[\s\S]{0,80}font-size/.test(scoreWxss)
);

assert(
  '自定义输入字号未改',
  /font-size:\s*22rpx/.test(block(ui, '.preset-custom-input'))
);

console.log('\ngameConfigFontStep.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
