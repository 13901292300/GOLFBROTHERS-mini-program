/**
 * 8421 个人分值：规则默认 vs 显式 scoreOverrides。
 * 运行：node scripts/game8421PlayerScoreConfig.selftest.js
 */
var path = require('path');
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils');
var cfg = require(path.join(utilsDir, 'sideGame8421PlayerConfig.js'));
var s8421 = require(path.join(utilsDir, 'settle8421.js'));
var settle4 = require(path.join(utilsDir, 'settle8421Four.js'));
var settle3 = require(path.join(utilsDir, 'settle8421Three.js'));
var core = require(path.join(utilsDir, 'settleCore.js'));

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

function ruleOf(extra) {
  return Object.assign(
    {
      catalogId: '8421-4',
      deductMode: 'on',
      deductWay: 'plus-n',
      deductPlusN: 4,
      deductDoubleN: 0,
      deductCap: 'none',
      deductCapN: 3
    },
    extra || {}
  );
}

function fourGame(rule, players) {
  return {
    catalogId: '8421-4',
    players: (players || ['A', 'B', 'C', 'D']).map(function (id) {
      return typeof id === 'string' ? { id: id, scoreCode: '8421' } : id;
    }),
    playerOrder: ['A', 'B', 'C', 'D'],
    groupMode: 'fixed',
    multiplier: 1,
    holes: [{ label: '1', on: true }],
    ruleSnapshot: ruleOf(rule)
  };
}

function ctxHole(rel) {
  return {
    scores: { '1': rel },
    holeOrder: ['1'],
    pars: { '1': 4 },
    windOn: false
  };
}

function uiOf(rule, player) {
  return cfg.resolve8421PlayerScoreConfig(rule, player);
}

function settleOf(rule, player) {
  return s8421.deductCfg(player, rule);
}

function sameCap(ui, settle) {
  return ui.deductCap === settle.deductCap && Number(ui.deductCapN) === settle.deductCapN;
}

var noneRule = ruleOf({ deductCap: 'none' });
var cap1 = ruleOf({ deductCap: 'cap', deductCapN: 1 });
var cap2 = ruleOf({ deductCap: 'cap', deductCapN: 2, deductDoubleN: 5 });

var blank = { id: 'A' };
var stamped = {
  id: 'B',
  deductCap: 'none',
  deductCapN: '3',
  deductMode: 'on',
  deductWay: 'plus-n',
  deductPlusN: '4'
};

assert('Case1 创建 none：未编辑跟随 none', uiOf(noneRule, blank).deductCap === 'none');
assert('Case1 规则改 cap=1：未编辑 UI cap=1', uiOf(cap1, blank).deductCap === 'cap' && uiOf(cap1, blank).deductCapN === '1');
assert('Case1 规则改 cap=1：settle 同 UI', sameCap(uiOf(cap1, blank), settleOf(cap1, blank)));

var aOverrideNone = {
  id: 'A',
  scoreOverrides: { deductCap: 'none', deductCapN: '3' }
};
assert('Case2 A override none', uiOf(cap1, aOverrideNone).deductCap === 'none');
assert('Case2 B 跟随 cap=1', uiOf(cap1, { id: 'B' }).deductCap === 'cap' && uiOf(cap1, { id: 'B' }).deductCapN === '1');
assert('Case2 C/D 跟随 cap=1', uiOf(cap1, { id: 'C' }).deductCap === 'cap' && uiOf(cap1, { id: 'D' }).deductCap === 'cap');

assert('Case3 规则 cap=2：A 仍 none', uiOf(cap2, aOverrideNone).deductCap === 'none');
assert('Case3 B/C/D cap=2', uiOf(cap2, { id: 'B' }).deductCapN === '2' && uiOf(cap2, { id: 'C' }).deductCapN === '2');

var onlyCapPlayer = { id: 'A' };
cfg.applyScoreOverridesFromForm(
  onlyCapPlayer,
  Object.assign({}, uiOf(cap1, {}), { deductCap: 'none', deductCapN: '3' }),
  uiOf(cap1, {})
);
assert('Case4 只改 cap 组写入 override', onlyCapPlayer.scoreOverrides.deductCap === 'none');
assert('Case4 未锁 deductWay 组', onlyCapPlayer.scoreOverrides.deductDoubleN == null);
var laterWay = ruleOf({ deductCap: 'cap', deductCapN: 1, deductWay: 'doublepar-n', deductDoubleN: 7 });
assert(
  'Case4 A 的 deductDoubleN 仍跟规则',
  uiOf(laterWay, onlyCapPlayer).deductWay === 'doublepar-n' && uiOf(laterWay, onlyCapPlayer).deductDoubleN === '7'
);
assert('Case4 A cap 仍 none', uiOf(laterWay, onlyCapPlayer).deductCap === 'none');

var ui5 = uiOf(cap1, stamped);
var st5 = settleOf(cap1, stamped);
assert('Case5 同一 resolver：UI cap 与 settle cap 一致', sameCap(ui5, st5) && ui5.deductCap === 'cap');
assert(
  'Case5 resolve 导出与 deductCfg 同源',
  s8421.resolve8421PlayerScoreConfig === cfg.resolve8421PlayerScoreConfig
);

assert('Case6 历史副本 none + 无 metadata → 跟规则 cap', uiOf(cap1, stamped).deductCap === 'cap');
assert('Case6 settle 同样 cap', settleOf(cap1, stamped).deductCap === 'cap');

var explicit = {
  id: 'A',
  deductCap: 'none',
  deductCapN: '3',
  scoreOverrides: { deductCap: 'none', deductCapN: '3' }
};
assert('Case7 显式 override none → effective none', uiOf(cap1, explicit).deductCap === 'none');
assert('Case7 settle none', settleOf(cap1, explicit).deductCap === 'none');
assert(
  'Case7 mapped：override none +6 → -3',
  s8421.personalScore(6, s8421.expandScoreCode('8421'), settleOf(cap1, explicit), 4) === -3
);
assert(
  'Case6 mapped：历史 none 副本 +6 仍 cap → -1',
  s8421.personalScore(6, s8421.expandScoreCode('8421'), settleOf(cap1, stamped), 4) === -1
);

var holeFollow = settle4.settle(
  fourGame({ deductCap: 'cap', deductCapN: 1, baoNeg: 'none' }, [
    { id: 'A', scoreCode: '8421', deductCap: 'none' },
    { id: 'B', scoreCode: '8421', deductCap: 'none' },
    { id: 'C', scoreCode: '8421' },
    { id: 'D', scoreCode: '8421' }
  ]),
  ctxHole({ A: 6, B: 0, C: 0, D: 0 })
).byHole['1'];
assert(
  'Case5/6 四人洞：历史副本跟随 cap=1 → ±5',
  holeFollow.A === -5 && holeFollow.B === -5 && holeFollow.C === 5 && holeFollow.D === 5,
  JSON.stringify(holeFollow)
);

var t3 = settle3.settle(
  {
    catalogId: '8421-3',
    players: [
      { id: 'A', scoreCode: '8421', scoreOverrides: { deductCap: 'none', deductCapN: '3' } },
      { id: 'B', scoreCode: '8421' },
      { id: 'C', scoreCode: '8421' }
    ],
    playerOrder: ['A', 'B', 'C'],
    holes: [{ label: '1', on: true }],
    multiplier: 1,
    ruleSnapshot: ruleOf({ catalogId: '8421-3', deductCap: 'cap', deductCapN: 1, baoNeg: 'none' })
  },
  ctxHole({ A: 6, B: 0, C: 0 })
).byHole['1'];
assert(
  '8421-3 共用 resolver：A override none 与 B 跟规则不同',
  settleOf(cap1, { scoreOverrides: { deductCap: 'none', deductCapN: '3' } }).deductCap === 'none' &&
    settleOf(cap1, { id: 'B' }).deductCap === 'cap'
);
assert('8421-3 零和存在', core.round1((t3.A || 0) + (t3.B || 0) + (t3.C || 0) + (t3[core.POT_ID] || 0)) === 0);

console.log('---');
console.log('passed ' + passed + '  failed ' + failed);
if (failed) process.exit(1);
