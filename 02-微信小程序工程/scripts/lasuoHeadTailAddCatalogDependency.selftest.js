/**
 * 头尾加法：addRewards 用本地 pk 形状判断，不依赖 catalog.isLasuoHeadTailTwoPoint。
 * 运行：node scripts/lasuoHeadTailAddCatalogDependency.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
global.wx.getStorageSync = global.wx.getStorageSync || function () {
  return null;
};
global.wx.setStorageSync = global.wx.setStorageSync || function () {};
global.wx.showToast = function () {};

var fs = require('fs');
var path = require('path');
var settleLasuo4 = require('../miniprogram/subpackages/game/utils/settleLasuo4.js');

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

function addRows() {
  return [
    { id: 'hio', value: '10' },
    { id: 'm2', value: '3' },
    { id: 'm1', value: '1' },
    { id: 'par', value: '0' },
    { id: 'p1', value: '0' },
    { id: 'ge2', value: '0' }
  ];
}

function gameOf(rule) {
  return {
    catalogId: 'lasuo-4',
    groupMode: 'random',
    rankId: 'gross-origin',
    playerOrder: ['A', 'B', 'C', 'D'],
    players: ['A', 'B', 'C', 'D'].map(function (id) {
      return { id: id };
    }),
    multiplier: 1,
    holes: [{ label: 'A1', on: true }],
    ruleSnapshot: rule
  };
}

function settle(rule, holeRels) {
  return settleLasuo4.settle(gameOf(rule), {
    scores: { A1: holeRels },
    holeOrder: ['A1'],
    pars: { A1: 4 }
  }).holeDebug.A1;
}

var src = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/utils/settleLasuo4.js'),
  'utf8'
);
var addRewardsFn = (src.match(/function addRewards\([\s\S]*?\nfunction /) || [''])[0];

assert(
  'source: addRewards 不调用 catalog.isLasuoHeadTailTwoPoint',
  /function addRewards/.test(src) &&
    /function isHeadTailTwoPoint\(rule\)/.test(src) &&
    /pkBetter !== false/.test(src) &&
    /pkWorse !== false/.test(src) &&
    /pkTotal === false/.test(src) &&
    /if \(isHeadTailTwoPoint\(rule\)\)/.test(src) &&
    addRewardsFn.indexOf('catalog.isLasuoHeadTailTwoPoint') < 0
);

assert(
  'source: 头尾专用路径仍是 headTailPersonalAdds',
  /function headTailPersonalAdds/.test(src) &&
    /if \(isHeadTailTwoPoint\(rule\)\) \{\r?\n    const personal = Object\.assign\(\r?\n      \{\},\r?\n      headTailPersonalAdds/.test(src)
);

var headTail = settle(
  {
    pkBetter: true,
    pkWorse: true,
    pkTotal: false,
    pkBetterW: '1',
    pkWorseW: '1',
    reward: 'add',
    addRows: addRows(),
    pushRule: 'none',
    baoMode: 'none'
  },
  { A: -1, B: 0, C: 0, D: 0 }
);
assert(
  'head-tail add 进入 personal 路径且可执行',
  headTail.addByPlayer != null &&
    headTail.addByPlayer.A === 1 &&
    headTail.addRewardA === 1,
  JSON.stringify(headTail)
);

var three = settle(
  {
    pkBetter: true,
    pkWorse: true,
    pkTotal: true,
    pkBetterW: '1',
    pkWorseW: '1',
    pkTotalW: '1',
    pkTotalMode: 'sum',
    reward: 'add',
    addPre: 'ignore',
    addRows: addRows(),
    pushRule: 'none',
    baoMode: 'none'
  },
  { A: -1, B: 0, C: 0, D: 0 }
);
assert(
  'three-point 不误入 headTailPersonalAdds',
  three.addByPlayer == null,
  JSON.stringify(three)
);

console.log('---');
console.log(failed ? 'FAILED ' + failed + ' / ' + (passed + failed) : 'OK ' + passed);
process.exit(failed ? 1 : 0);
