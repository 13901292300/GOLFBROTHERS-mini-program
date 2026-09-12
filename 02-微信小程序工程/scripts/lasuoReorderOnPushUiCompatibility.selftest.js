/**
 * 拉丝 reorderOnPush UI：best/worst 显示；legacy missing 保持 missing（不静默写成 no）。
 * 运行：node scripts/lasuoReorderOnPushUiCompatibility.selftest.js
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

function sliceFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  var brace = src.indexOf('{', start);
  var depth = 0;
  for (var i = brace; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
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

eval(
  sliceFn(editJs, 'isExplicitReorderOnPush') +
    '\n' +
    sliceFn(editJs, 'hydrateLasuoReorderOnPushState') +
    '\n' +
    sliceFn(editJs, 'applySavedLasuoReorderOnPush')
);

function bestPage(extra) {
  return Object.assign(
    {
      showLasuo: true,
      lasuoBestOnePoint: true,
      lasuoWorstOnePoint: false,
      pkBetter: true,
      pkWorse: false,
      pkTotal: false
    },
    extra || {}
  );
}

function worstPage(extra) {
  return Object.assign(
    {
      showLasuo: true,
      lasuoBestOnePoint: false,
      lasuoWorstOnePoint: true,
      pkBetter: false,
      pkWorse: true,
      pkTotal: false
    },
    extra || {}
  );
}

function otherPage(extra) {
  return Object.assign(
    {
      showLasuo: true,
      lasuoBestOnePoint: false,
      lasuoWorstOnePoint: false,
      pkBetter: true,
      pkWorse: true,
      pkTotal: true
    },
    extra || {}
  );
}

assert('best-one → 显示', catalog.lasuoShowReorderOnPush(BEST) === true);
assert('worst-one → 显示', catalog.lasuoShowReorderOnPush(WORST) === true);
assert('total-one → 隐藏', catalog.lasuoShowReorderOnPush(TOTAL) === false);
assert('three-point → 隐藏', catalog.lasuoShowReorderOnPush(THREE) === false);
assert('head-tail → 隐藏', catalog.lasuoShowReorderOnPush(HEAD_TAIL) === false);
assert('head-total → 隐藏', catalog.lasuoShowReorderOnPush(HEAD_TOTAL) === false);

assert(
  'WXML：best/worst 且 pushRule!==none',
  /wx:if="\{\{lasuoShowReorderOnPush && pushRule !== 'none'\}\}"/.test(lasuoBlock) &&
    lasuoBlock.indexOf('顶洞是否更换组合') >= 0 &&
    lasuoBlock.indexOf('不更换组合') >= 0 &&
    lasuoBlock.indexOf('更换组合') >= 0
);

assert(
  'flag 条件为 best || worst',
  /function lasuoShowReorderOnPush\(rule\)/.test(catalogSrc) &&
    /isLasuoBestOnePoint\(rule\)/.test(catalogSrc) &&
    /isLasuoWorstOnePoint\(rule\)/.test(catalogSrc)
);

var bestMiss = hydrateLasuoReorderOnPushState({}, true);
assert(
  '1 best missing → display yes + explicit false',
  bestMiss.reorderOnPush === 'yes' && bestMiss.reorderOnPushExplicit === false
);

var outMiss = { reorderOnPush: 'yes' };
applySavedLasuoReorderOnPush(
  outMiss,
  bestPage({ reorderOnPush: 'yes', reorderOnPushExplicit: false }),
  {}
);
assert('2 best missing 未操作保存 → missing', !Object.prototype.hasOwnProperty.call(outMiss, 'reorderOnPush'));

var outClickNo = {};
applySavedLasuoReorderOnPush(
  outClickNo,
  bestPage({ reorderOnPush: 'no', reorderOnPushExplicit: true }),
  {}
);
assert('3 best missing 点 no → no', outClickNo.reorderOnPush === 'no');

var outClickYes = {};
applySavedLasuoReorderOnPush(
  outClickYes,
  bestPage({ reorderOnPush: 'yes', reorderOnPushExplicit: true }),
  {}
);
assert('4 best missing 点 yes → yes', outClickYes.reorderOnPush === 'yes');

var bestNo = hydrateLasuoReorderOnPushState({ reorderOnPush: 'no' }, true);
var outKeepNo = {};
applySavedLasuoReorderOnPush(
  outKeepNo,
  bestPage({ reorderOnPush: 'no', reorderOnPushExplicit: true }),
  { reorderOnPush: 'no' }
);
assert(
  '5 best explicit no → 保留 no',
  bestNo.reorderOnPush === 'no' && bestNo.reorderOnPushExplicit === true && outKeepNo.reorderOnPush === 'no'
);

var worstYes = hydrateLasuoReorderOnPushState({ reorderOnPush: 'yes' }, true);
var outKeepYes = {};
applySavedLasuoReorderOnPush(
  outKeepYes,
  worstPage({ reorderOnPush: 'yes', reorderOnPushExplicit: true }),
  { reorderOnPush: 'yes' }
);
assert(
  '6 worst explicit yes → 保留 yes',
  worstYes.reorderOnPush === 'yes' && worstYes.reorderOnPushExplicit === true && outKeepYes.reorderOnPush === 'yes'
);

var newBest = hydrateLasuoReorderOnPushState(null, true);
var newWorst = hydrateLasuoReorderOnPushState(null, true);
assert(
  '7 new best → 默认 no + explicit true',
  newBest.reorderOnPush === 'no' &&
    newBest.reorderOnPushExplicit === true &&
    /reorderOnPushExplicit = true/.test(onPkFn) &&
    /if \(!this\.data\.isEditing\)/.test(onPkFn)
);
assert(
  '8 new worst → 默认 no + explicit true',
  newWorst.reorderOnPush === 'no' && newWorst.reorderOnPushExplicit === true
);

var outSwitch = { reorderOnPush: 'yes' };
applySavedLasuoReorderOnPush(
  outSwitch,
  bestPage({ reorderOnPush: 'yes', reorderOnPushExplicit: false }),
  {}
);
assert(
  '9 best missing → three → best → 仍 missing',
  !Object.prototype.hasOwnProperty.call(outSwitch, 'reorderOnPush') && /if \(!this\.data\.isEditing\)/.test(onPkFn)
);

var threeKeep = { reorderOnPush: 'yes' };
applySavedLasuoReorderOnPush(threeKeep, otherPage(), { reorderOnPush: 'no' });
assert(
  '10 three legacy no → 隐藏且保存仍 no',
  catalog.lasuoShowReorderOnPush(THREE) === false && threeKeep.reorderOnPush === 'no'
);

var otherMiss = { reorderOnPush: 'yes' };
applySavedLasuoReorderOnPush(otherMiss, otherPage(), {});
assert(
  '11 non-best missing → 保存仍 missing',
  !Object.prototype.hasOwnProperty.call(otherMiss, 'reorderOnPush')
);

assert(
  'setReorder 才把 missing 转成 explicit',
  /setReorder\(e\) \{\s*this\.setData\(\{\s*reorderOnPush: e\.currentTarget\.dataset\.value,\s*reorderOnPushExplicit: true/.test(
    editJs
  )
);

assert(
  'onLoad 走 hydrateLasuoReorderOnPushState',
  /const lasuoReorderHydrate = hydrateLasuoReorderOnPushState\(/.test(editJs)
);

assert(
  'selftest 不 require sideGameRuleDefaults',
  fs.readFileSync(__filename, 'utf8').indexOf("require('../miniprogram/subpackages/game/utils/sideGameRuleDefaults.js')") < 0
);

console.log('---');
console.log(failed ? 'FAILED ' + failed + ' / ' + (passed + failed) : 'OK ' + passed);
process.exit(failed ? 1 : 0);
