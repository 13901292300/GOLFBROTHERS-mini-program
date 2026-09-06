/**
 * 海报「品牌信息」步骤：位于文字信息与贴纸之间。
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/posterBrandHeader.selftest.js
 */
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var poster = path.join(root, 'miniprogram', 'subpackages', 'poster');
var dataJs = fs.readFileSync(path.join(poster, 'utils', 'poster-data.js'), 'utf8');
var engineJs = fs.readFileSync(path.join(poster, 'utils', 'poster-engine.js'), 'utf8');
var compJs = fs.readFileSync(path.join(poster, 'components', 'golf-poster', 'index.js'), 'utf8');
var wxml = fs.readFileSync(path.join(poster, 'components', 'golf-poster', 'index.wxml'), 'utf8');

var posterData = require(path.join(poster, 'utils', 'poster-data.js'));

var passed = 0;
var failed = 0;

function assert(label, ok, detail) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
    return;
  }
  failed += 1;
  console.log('FAIL  ' + label + (detail ? ' :: ' + detail : ''));
}

assert(
  '默认品牌文案为 GOLF BROTHERS',
  posterData.DEFAULT_BRAND_TEXT === 'GOLF BROTHERS'
);

var model = posterData.createPosterModel('template1', false);
posterData.ensureBrandHeader(model);
assert('新模型含 brandHeader', model.brandHeader && model.brandHeader.text === 'GOLF BROTHERS');
assert('默认左对齐', model.brandHeader.align === 'left');
assert('默认不使用自定义 LOGO', model.brandHeader.useCustomLogo === false);

assert(
  '步骤顺序：文字 → 品牌 → 贴纸',
  /STEP_KEYS = \["template", "photo", "scorecard", "total", "identity", "brand", "stickers", "summary"\]/.test(compJs)
);
assert(
  '中文步骤含品牌信息',
  /stepTitles: \["模板", "照片", "成绩卡", "总成绩", "文字信息", "品牌信息", "贴纸", "完成海报"\]/.test(compJs)
);
assert('品牌页在 step 5', wxml.indexOf('wx:if="{{step == 5}}"') >= 0 && wxml.indexOf('copy.brandText') >= 0);
assert('贴纸页在 step 6', wxml.indexOf('wx:if="{{step == 6}}"') >= 0 && wxml.indexOf('chooseStickers') >= 0);
assert('完成页在 step 7', wxml.indexOf('wx:if="{{step == 7}}"') >= 0);
assert('完成页可跳转品牌', wxml.indexOf('data-step="brand"') >= 0);
assert('含左中右选项', wxml.indexOf('brandAlignLeft') >= 0 && wxml.indexOf('data-align="center"') >= 0);

assert('绘制使用 Playfair', engineJs.indexOf('GOLF_Playfair') >= 0 && engineJs.indexOf('italic 700') >= 0);
assert('绘制按 align 摆放', engineJs.indexOf('align === "center"') >= 0 && engineJs.indexOf('align === "right"') >= 0);
assert('空余横线', engineJs.indexOf('drawBrandRule') >= 0);
assert('不再用名校杯标题绘制', engineJs.indexOf('青花郎') < 0);
assert('默认旗标可绘制', engineJs.indexOf('drawDefaultBrandMark') >= 0);

console.log('\npassed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
