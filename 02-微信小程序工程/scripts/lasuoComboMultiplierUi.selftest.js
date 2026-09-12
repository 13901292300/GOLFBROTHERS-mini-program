/**
 * 拉丝组合倍数 UI：仅 three / total / head-tail 显示 combo，隐藏不删数据。
 * 运行：node scripts/lasuoComboMultiplierUi.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
global.wx.getStorageSync = global.wx.getStorageSync || function () {
  return null;
};
global.wx.setStorageSync = global.wx.setStorageSync || function () {};
global.wx.showToast = function () {};

var fs = require('fs');
var path = require('path');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');

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

var THREE = { pkBetter: true, pkWorse: true, pkTotal: true };
var TOTAL = { pkBetter: false, pkWorse: false, pkTotal: true };
var HEAD_TAIL = { pkBetter: true, pkWorse: true, pkTotal: false };
var HEAD_TOTAL = { pkBetter: true, pkWorse: false, pkTotal: true };
var BEST = { pkBetter: true, pkWorse: false, pkTotal: false };
var WORST = { pkBetter: false, pkWorse: true, pkTotal: false };

var catalogSrc = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/utils/catalog.js'),
  'utf8'
);
var editJs = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/pages/edit-rule/index.js'),
  'utf8'
);
var wxml = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/pages/edit-rule/index.wxml'),
  'utf8'
);
var lasuoStart = wxml.indexOf('wx:if="{{showLasuo}}"');
var vegasStart = wxml.indexOf('wx:if="{{showVegas}}"');
var lasuoBlock = lasuoStart >= 0 && vegasStart > lasuoStart ? wxml.slice(lasuoStart, vegasStart) : '';
var onPkFn = (editJs.match(/onPkChange\(e\) \{[\s\S]*?\n  onPkWeight\(/) || [''])[0];

assert('three-point → true', catalog.lasuoShowComboMultiplier(THREE) === true);
assert('total-one → true', catalog.lasuoShowComboMultiplier(TOTAL) === true);
assert('head-tail → true', catalog.lasuoShowComboMultiplier(HEAD_TAIL) === true);
assert('head-total → false', catalog.lasuoShowComboMultiplier(HEAD_TOTAL) === false);
assert('best-one → false', catalog.lasuoShowComboMultiplier(BEST) === false);
assert('worst-one → false', catalog.lasuoShowComboMultiplier(WORST) === false);

assert(
  'hidden subtype 不 delete comboMulRows',
  /hydrateComboMulRows\(existing && existing\.comboMulRows\)/.test(editJs) &&
    /comboMulRows: this\.data\.comboMulRows/.test(editJs) &&
    !/delete[\s\S]{0,40}comboMulRows/.test(editJs) &&
    onPkFn.indexOf('comboMulRows') < 0
);

assert(
  'onPkChange 不 reset combo 表（three↔best / total↔head-total 可保留自定义值）',
  onPkFn.length > 80 &&
    onPkFn.indexOf('hydrateComboMulRows') < 0 &&
    onPkFn.indexOf('comboMulRows') < 0 &&
    /lasuoShowComboMultiplier/.test(onPkFn)
);

assert(
  'reward=add 时组合区不显示',
  /wx:if="\{\{reward === 'mul' && matchFoldMul\}\}"[\s\S]{0,400}wx:if="\{\{lasuoShowComboMultiplier\}\}"[\s\S]{0,80}组合奖励/.test(
    lasuoBlock
  )
);

assert(
  'source: 条件为 !(best || worst || headTotal)',
  /function lasuoShowComboMultiplier\(rule\)/.test(catalogSrc) &&
    /isLasuoBestOnePoint\(rule\)/.test(catalogSrc) &&
    /isLasuoWorstOnePoint\(rule\)/.test(catalogSrc) &&
    /isLasuoHeadTotalTwoPoint\(rule\)/.test(catalogSrc)
);

console.log('---');
console.log(failed ? 'FAILED ' + failed + ' / ' + (passed + failed) : 'OK ' + passed);
process.exit(failed ? 1 : 0);
