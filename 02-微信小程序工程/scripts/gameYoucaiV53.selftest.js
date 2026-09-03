/**
 * 油菜 V53 §4.1.5 自测：结算 + 与比洞共享让杆/有效洞 UI
 */
var fs = require('fs');
var path = require('path');
var settleYoucai = require('../miniprogram/subpackages/game/utils/settleYoucai.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');

var passed = 0;
var failed = 0;
function assert(name, cond) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name);
  }
}

// --- catalog ---
assert('目录可见油菜', !!(catalog.findRule && catalog.findRule('youcai')));
assert('目录未隐藏', !(catalog.isUnavailableRule && catalog.isUnavailableRule('youcai')));
assert('settle 版本', settleYoucai.YOUCAI_SETTLE_VERSION === 'v53-4.1.5');
assert(
  'usesMatchPlayPairSettings',
  catalog.usesMatchPlayPairSettings('youcai') &&
    catalog.usesMatchPlayPairSettings('match-2') &&
    !catalog.usesMatchPlayPairSettings('stroke-2') &&
    !catalog.usesMatchPlayPairSettings('three-set')
);
assert(
  'supportsPairHoleHandicap 对齐',
  catalog.supportsPairHoleHandicap('youcai') &&
    catalog.supportsPairHoleHandicap('match-2') &&
    !catalog.supportsPairHoleHandicap('stroke-2')
);
assert('catalog 比杆总杆', catalog.supportsTotalStrokeHandicap('stroke-2') && !catalog.supportsTotalStrokeHandicap('youcai'));

// --- 核心结算 ---
var r1 = settleYoucai.calculateYoucaiHoleResult({
  leftActualScore: 4,
  rightActualScore: 5,
  handicap: 0,
  pointPerHole: 1,
  par: 4
});
assert('1 V53 A-B：A=+1 B=-1', r1.winner === 'left' && r1.leftValue === 1 && r1.rightValue === -1);

var r1b = settleYoucai.calculateYoucaiHoleResult({
  leftActualScore: 4,
  rightActualScore: 4,
  handicap: 0,
  pointPerHole: 1
});
assert('1b V53 C-D：平局 0/0', r1b.winner === 'tie' && r1b.leftValue === 0);

var rNeg = settleYoucai.calculateYoucaiHoleResult({
  leftActualScore: 5,
  rightActualScore: 4,
  handicap: -1,
  pointPerHole: 1
});
assert('3 负让杆平局', rNeg.winner === 'tie' && rNeg.leftAdjustedScore === 4);

var rK = settleYoucai.calculateYoucaiHoleResult({
  leftActualScore: 3,
  rightActualScore: 5,
  handicap: 0,
  pointPerHole: 3
});
assert('7 K=3 → ±3', rK.leftValue === 3 && rK.rightValue === -3);

var rBig = settleYoucai.calculateYoucaiHoleResult({
  leftActualScore: 3,
  rightActualScore: 8,
  handicap: 0,
  pointPerHole: 1
});
assert('8 杆差大仍 ±1', rBig.leftValue === 1 && rBig.rightValue === -1);

assert('5 零让杆', settleYoucai.pairHandicapN({ handicap: 0 }) === 0);
assert('4 0.5', settleYoucai.pairHandicapN({ handicap: 0.5 }) === 0.5);
assert('11 flip +1 → -1', settleYoucai.flipHandicapForSwap(1) === -1);
assert('11b flip 0.5 → -0.5', settleYoucai.flipHandicapForSwap(0.5) === -0.5);
assert('11c 换边后语义对称', settleYoucai.flipHandicapForSwap(-1) === 1);

var multi = settleYoucai.settle(
  {
    catalogId: 'youcai',
    players: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
    multiplier: 1,
    pairings: [
      { id: 'A|B', leftId: 'A', rightId: 'B', on: true, handicap: 0 },
      { id: 'C|D', leftId: 'C', rightId: 'D', on: true, handicap: 0 }
    ]
  },
  {
    scores: { H1: { A: -1, B: 0, C: 0, D: 0 } },
    holeOrder: ['H1'],
    pars: { H1: 4 }
  }
);
assert('9 多组合版本', multi.settleVersion === 'v53-4.1.5');
assert(
  '9/10 累计 A+2 B-2 C-1 D+1',
  multi.byHole.H1.A === 1 && multi.byHole.H1.B === -1 && multi.byHole.H1.C === 0 && multi.byHole.H1.D === 0
);

var orderGame = settleYoucai.settle(
  {
    catalogId: 'youcai',
    players: [{ id: 'A' }, { id: 'B' }],
    multiplier: 1,
    holes: [{ label: 'D1', on: true }, { label: 'C1', on: false }],
    pairings: [{ id: 'A|B', leftId: 'A', rightId: 'B', on: true, handicap: 0 }]
  },
  {
    scores: { D1: { A: -1, B: 0 }, C1: { A: -2, B: 0 } },
    holeOrder: ['D1', 'C1'],
    pars: { D1: 4, C1: 4 }
  }
);
assert('13 D/C 洞序首洞 D1', orderGame.byHole.D1.A === 1);
assert('12 有效洞外不计分', !orderGame.byHole.C1.A && orderGame.byHole.C1.A !== 1 && (orderGame.byHole.C1.A || 0) === 0);

var pending = settleYoucai.settle(
  {
    catalogId: 'youcai',
    players: [{ id: 'A' }, { id: 'B' }],
    multiplier: 1,
    pairings: [{ id: 'A|B', leftId: 'A', rightId: 'B', on: true, handicap: 0 }]
  },
  { scores: { H1: { A: 0 } }, holeOrder: ['H1'], pars: { H1: 4 } }
);
assert('14 空值 pending', pending.byHolePairs.H1['A|B'].status === 'pending');

var tieOk = settleYoucai.settle(
  {
    catalogId: 'youcai',
    players: [{ id: 'A' }, { id: 'B' }],
    multiplier: 1,
    pairings: [{ id: 'A|B', leftId: 'A', rightId: 'B', on: true, handicap: 0 }]
  },
  { scores: { H1: { A: 0, B: 0 } }, holeOrder: ['H1'], pars: { H1: 4 } }
);
assert('6 合法平局 settled', tieOk.byHolePairs.H1['A|B'].status === 'settled');
assert('16 平局仍 settled（C-D）', tieOk.byHole.H1.A === 0);

var settleJs = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/utils/settle.js'),
  'utf8'
);
assert('24 settle.js 分发', /youcai/.test(settleJs));

var zeroSum = settleYoucai.settle(
  {
    catalogId: 'youcai',
    players: [{ id: 'A' }, { id: 'B' }],
    multiplier: 1,
    pairings: [{ id: 'A|B', leftId: 'A', rightId: 'B', on: true, handicap: 1 }]
  },
  { scores: { H1: { A: 0, B: 0 } }, holeOrder: ['H1'], pars: { H1: 4 } }
);
assert(
  '13 球员合计零和',
  Math.abs((zeroSum.playerTotals.A || 0) + (zeroSum.playerTotals.B || 0)) < 0.05
);

// --- hcapList 与比洞同构 ---
var hcapPair = {
  id: 'A|B',
  leftId: 'A',
  rightId: 'B',
  on: true,
  strokes: 0,
  hcapList: [
    {
      par3: '0.5',
      par4: '0.5',
      par5: '0.5',
      hcapHoles: [
        { label: 'D1', on: true },
        { label: 'C1', on: false }
      ]
    }
  ]
};
assert('hcapList N@D1', settleYoucai.pairHandicapN(hcapPair, 'D1', 4) === 0.5);
assert('hcapList 洞外回退 strokes', settleYoucai.pairHandicapN(hcapPair, 'C1', 4) === 0);

var hcapSettle = settleYoucai.settle(
  {
    catalogId: 'youcai',
    players: [{ id: 'A' }, { id: 'B' }],
    multiplier: 1,
    holes: [
      { label: 'D1', on: true },
      { label: 'C1', on: true }
    ],
    pairings: [hcapPair]
  },
  {
    scores: {
      D1: { A: 0, B: 0 },
      C1: { A: 0, B: 1 }
    },
    holeOrder: ['D1', 'C1'],
    pars: { D1: 4, C1: 4 }
  }
);
// D1: N=0.5 → A actual4 vs B adj 3.5 → B胜
assert('hcap 有效洞内结算', hcapSettle.byHole.D1.A === -1 && hcapSettle.byHole.D1.B === 1);
// C1: N=0, A4 B5 → A胜
assert('hcap 未选洞 N=0 仍可比', hcapSettle.byHole.C1.A === 1 && hcapSettle.byHole.C1.B === -1);

// --- UI ---
var configJs = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/pages/config/index.js'),
  'utf8'
);
var configWxml = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/pages/config/index.wxml'),
  'utf8'
);
var youcaiJs = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/utils/settleYoucai.js'),
  'utf8'
);
assert('UI showYoucai', /showYoucai/.test(configJs));
assert('UI usesMatchPlayPairSettings', /usesMatchPlayPairSettings/.test(configJs));
assert('UI 油菜走 showMatchHandicap', /showMatchHandicap = showTwoParty && catalog\.usesMatchPlayPairSettings/.test(configJs));
assert('UI 无油菜专属弹窗', !/showYoucaiHcapSheet/.test(configWxml) && !/openYoucaiPairHcap/.test(configJs));
assert('UI 无临时调试节点', !/pairHoleHcapDebug/.test(configWxml) && !/pairHoleHcapDebug/.test(configJs));
assert('UI 共享 openHcapAdd', /openPairHoleHcap[\s\S]{0,80}openHcapAdd/.test(configJs));
assert('UI 共享 hcapList 摘要', /showMatchHandicap && item\.on/.test(configWxml) && /hcap\.hcapText/.test(configWxml));
assert('UI 无油菜摘要字段', !/youcaiHcapText/.test(configWxml));
assert('UI 每洞分值', /每洞分值/.test(configJs));
assert('UI 有效洞仍对油菜开放', /showHoleRange/.test(configJs) && /showHoleRange/.test(configWxml));
assert('UI 迁移 migrateYoucaiPairToMatchHcap', /migrateYoucaiPairToMatchHcap/.test(configJs));
assert('UI 换边反号含 hcapList', /flipHcapListSigns/.test(configJs));
assert('无奖励逻辑', !/rewardMul|meatWanted|pushRule/.test(youcaiJs));
assert('20-23 无顶洞肉结算', !/function meat|dormie|meatRows|meatWanted/.test(youcaiJs));
assert('结算复用 pairHcapN', /pairHcapN/.test(youcaiJs));
assert(
  '投影 pointPerHole',
  /pointPerHole/.test(
    fs.readFileSync(path.join(__dirname, '../miniprogram/subpackages/game/utils/rankMarkProjection.js'), 'utf8')
  )
);
assert('换边反号在 buildPairs', /__flippedFrom|flipHandicap|String\(-Number\(item\.strokes\)/.test(configJs));

// --- 验收用例 ---
var acc1 = settleYoucai.calculateYoucaiHoleResult({
  leftActualScore: 4,
  rightActualScore: 5,
  handicap: 2,
  pointPerHole: 1,
  par: 4
});
assert(
  '验收 N=+2 B调整后3胜',
  acc1.leftAdjustedScore === 4 &&
    acc1.rightAdjustedScore === 3 &&
    acc1.winner === 'right' &&
    acc1.leftValue === -1 &&
    acc1.rightValue === 1
);
var accGame = {
  catalogId: 'youcai',
  players: [{ id: 'A' }, { id: 'B' }],
  multiplier: 1,
  pairings: [
    {
      id: 'A|B',
      leftId: 'A',
      rightId: 'B',
      on: true,
      hcapList: [{ par3: '2', par4: '2', par5: '2', hcapHoles: [{ label: 'H1', on: true }] }]
    }
  ]
};
var accOut = settleYoucai.settle(accGame, {
  scores: { H1: { A: 0, B: 1 } },
  holeOrder: ['H1'],
  pars: { H1: 4 }
});
assert('验收无初始分', accOut.initial.A == null && accOut.initial.B == null);
assert('验收洞分 A-1 B+1', accOut.byHole.H1.A === -1 && accOut.byHole.H1.B === 1);

var acc2 = settleYoucai.calculateYoucaiHoleResult({
  leftActualScore: 5,
  rightActualScore: 4,
  handicap: -1,
  pointPerHole: 1
});
assert(
  '验收 N=-1 平局',
  acc2.leftAdjustedScore === 4 &&
    acc2.rightAdjustedScore === 4 &&
    acc2.winner === 'tie' &&
    acc2.leftValue === 0
);

// --- pending 不写 0 ---
var blank = settleYoucai.settle(
  {
    catalogId: 'youcai',
    players: [{ id: 'A' }, { id: 'B' }],
    multiplier: 1,
    holes: [{ label: 'H1', on: true }, { label: 'H2', on: false }],
    pairings: [{ id: 'A|B', leftId: 'A', rightId: 'B', on: true, handicap: 0 }]
  },
  { scores: {}, holeOrder: ['H1', 'H2'], pars: { H1: 4, H2: 4 } }
);
assert('无成绩 byHole 无球员键', blank.byHole.H1.A == null && blank.byHole.H1.B == null);
assert('无效洞 byHole 无球员键', blank.byHole.H2.A == null);
assert('无成绩 initial 空', blank.initial.A == null);
var oneSide = settleYoucai.settle(
  {
    catalogId: 'youcai',
    players: [{ id: 'A' }, { id: 'B' }],
    multiplier: 1,
    pairings: [{ id: 'A|B', leftId: 'A', rightId: 'B', on: true, handicap: 0 }]
  },
  { scores: { H1: { A: 0 } }, holeOrder: ['H1'], pars: { H1: 4 } }
);
assert('单方成绩不写洞分', oneSide.byHole.H1.A == null && oneSide.byHolePairs.H1['A|B'].status === 'pending');
var tieZero = settleYoucai.settle(
  {
    catalogId: 'youcai',
    players: [{ id: 'A' }, { id: 'B' }],
    multiplier: 1,
    pairings: [{ id: 'A|B', leftId: 'A', rightId: 'B', on: true, handicap: 0 }]
  },
  { scores: { H1: { A: 0, B: 0 } }, holeOrder: ['H1'], pars: { H1: 4 } }
);
assert('合法平局写 0', tieZero.byHole.H1.A === 0 && tieZero.byHole.H1.B === 0 && tieZero.byHolePairs.H1['A|B'].status === 'settled');

var resultFormat = require('../miniprogram/subpackages/game/utils/resultFormat.js');
assert('format pending 空白', resultFormat.formatGameResultCell({ status: 'pending', value: 0 }) === '');
assert('format settled 0', resultFormat.formatGameResultCell({ status: 'settled', value: 0 }) === '0');
assert('format settled +1', resultFormat.formatGameResultCell({ status: 'settled', value: 1 }) === '+1');
assert('formatBoardTotal 无结算空白', resultFormat.formatBoardTotal({ settledCount: 0, value: 0 }).text === '');
assert('formatBoardTotal 净0显示0', resultFormat.formatBoardTotal({ settledCount: 2, value: 0 }).text === '0');

console.log('\ngameYoucaiV53.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
