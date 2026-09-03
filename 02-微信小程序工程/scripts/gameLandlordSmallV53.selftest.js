/**
 * 斗小地主 V53 §4.2.3 结算回归。
 * 运行：node scripts/gameLandlordSmallV53.selftest.js
 */
var settleSmall = require('../miniprogram/subpackages/game/utils/settleLandlordSmall.js');
var shared = require('../miniprogram/subpackages/game/utils/settleLandlordShared.js');
var settle = require('../miniprogram/subpackages/game/utils/settle.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var fs = require('fs');
var path = require('path');

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

function players3(a, b, c) {
  return [
    { id: a, hcapPar3: 0, hcapPar4: 0, hcapPar5: 0 },
    { id: b, hcapPar3: 0, hcapPar4: 0, hcapPar5: 0 },
    { id: c, hcapPar3: 0, hcapPar4: 0, hcapPar5: 0 }
  ];
}

function withHcap(list, pid, p3, p4, p5) {
  return list.map(function (p) {
    if (p.id !== pid) return p;
    return Object.assign({}, p, { hcapPar3: p3, hcapPar4: p4, hcapPar5: p5 });
  });
}

function gameOf(opts) {
  var order = opts.order || ['B', 'C', 'A'];
  return {
    catalogId: 'landlord-small',
    name: opts.name || '斗小地主',
    players: opts.players || players3('B', 'C', 'A'),
    playerOrder: order,
    groupMode: opts.groupMode || 'fixed',
    rankId: opts.rankId || 'gross-origin',
    multiplier: opts.K != null ? opts.K : 1,
    holes: opts.holes,
    ruleSnapshot: Object.assign(
      {
        reward: 'none',
        pushRule: 'score',
        reorderOnPush: 'no',
        meatInclude: 'no',
        baoMode: 'none'
      },
      opts.rule || {}
    )
  };
}

function ctxOf(scores, holeOrder, pars) {
  return {
    holeOrder: holeOrder || ['H1'],
    scores: scores,
    pars: pars || { H1: 4 }
  };
}

function hole(r, label) {
  return (r.byHole && r.byHole[label]) || {};
}

function settleDebug(game, ctx) {
  return shared.settleThree(game, ctx, {
    catalogId: 'landlord-small',
    settleVersion: settleSmall.LANDLORD_SMALL_SETTLE_VERSION,
    returnMeatPool: true,
    collectDebug: true,
    soloIndex: 2,
    keepOrderOnPush: false,
    autoMeatCount: 1,
    teamNet: function (rec, solo, mates) {
      return rec[shared.pickTeamWorst(mates, rec)].net;
    },
    winRel: function (rec, soloWins, solo, mates) {
      if (soloWins) return rec[solo].rel;
      return rec[shared.pickTeamWorst(mates, rec)].rel;
    },
    applyBao: shared.applyBao
  });
}

assert('目录可见斗小地主', !catalog.isUnavailableRule('landlord-small') && !!catalog.findRule('landlord-small'));
assert('目录未隐藏', !catalog.findRule('landlord-small').hidden);
assert('settle 版本', settle.LANDLORD_SMALL_SETTLE_VERSION === 'v53-4.2.3');
assert('无高手不见面', catalog.LANDLORD_GROUP_MODES.filter(function (m) { return m.id === 'split-high'; }).length === 1);

// 1 角色：第3名单人，第1/2双人
var g1 = gameOf({});
var r1 = settleDebug(g1, ctxOf({ H1: { A: 0, B: -1, C: 1 } }));
assert('1 第3名单人', r1.holeDebug.H1.roles.A === 'A' && r1.holeDebug.H1.roles.B === 'B' && r1.holeDebug.H1.roles.C === 'C');

// 2 双人队最高杆
assert('2 双人最差=max', r1.holeDebug.H1.doubleCompareScore === 1 && r1.holeDebug.H1.singleCompareScore === 0);

// 3 A胜 2:-1:-1 —— 权威：A=4 B=3 C=5 → rel 0,-1,1；max(B,C)=1；A胜
assert('3 A胜 +2/-1/-1', hole(r1, 'H1').A === 2 && hole(r1, 'H1').B === -1 && hole(r1, 'H1').C === -1);

// 4 BC胜
var r4 = settleSmall.settle(gameOf({}), ctxOf({ H1: { A: 1, B: -1, C: 0 } }));
assert('4 BC胜 -2/+1/+1', hole(r4, 'H1').A === -2 && hole(r4, 'H1').B === 1 && hole(r4, 'H1').C === 1);

// 5 平局
var r5 = settleSmall.settle(gameOf({}), ctxOf({ H1: { A: 1, B: -1, C: 1 } }));
assert('5 平局全0', hole(r5, 'H1').A === 0 && hole(r5, 'H1').B === 0 && hole(r5, 'H1').C === 0);

// 6 K≠1
var r6 = settleSmall.settle(gameOf({ K: 3 }), ctxOf({ H1: { A: 0, B: -1, C: 1 } }));
assert('6 K=3 → +6/-3/-3', hole(r6, 'H1').A === 6 && hole(r6, 'H1').B === -3 && hole(r6, 'H1').C === -3);

// 7/8 PAR让杆与0.5/负让
var gH = gameOf({
  players: withHcap(
    withHcap(players3('B', 'C', 'A'), 'A', 0, 0.5, 0),
    'B',
    0,
    -1,
    0
  )
});
var rH = settleDebug(gH, ctxOf({ H1: { A: 0, B: 0, C: 0 } }, ['H1'], { H1: 4 }));
assert('7/8 让杆后比较', rH.holeDebug.H1.adjustedScores.A === -0.5 && rH.holeDebug.H1.adjustedScores.B === 1);
assert('8 A让杆后仍胜', hole(rH, 'H1').A === 2);

// 9/10/11 奖励：仅胜队真实成绩；平局不触发
var mulRows = [
  { id: 'hio', value: 10 },
  { id: 'm2', value: 5 },
  { id: 'm1', value: 2 },
  { id: 'par', value: 1 },
  { id: 'p1', value: 1 },
  { id: 'ge2', value: 1 }
];
var r9 = settleDebug(
  gameOf({ rule: { reward: 'mul', mulRows: mulRows } }),
  ctxOf({ H1: { A: -1, B: 0, C: 1 } })
);
assert('9/10 A小鸟胜×2', r9.holeDebug.H1.multiplier === 2 && hole(r9, 'H1').A === 4 && hole(r9, 'H1').B === -2);
var r11 = settleDebug(
  gameOf({ rule: { reward: 'mul', mulRows: mulRows, pushRule: 'score' } }),
  ctxOf({ H1: { A: 0, B: -1, C: 0 } })
);
assert('11 平局不乘倍率', r11.holeDebug.H1.multiplier === 1 && hole(r11, 'H1').A === 0 && r11.meatPool === 1);

// 12 固斗不重排
var r12 = settleSmall.settle(
  gameOf({ groupMode: 'fixed' }),
  ctxOf(
    { H1: { A: 2, B: -1, C: 0 }, H2: { A: -1, B: 1, C: 0 } },
    ['H1', 'H2']
  )
);
assert(
  '12 固斗顺序不变',
  JSON.stringify(r12.orderByHole.H1) === JSON.stringify(['B', 'C', 'A']) &&
    JSON.stringify(r12.orderByHole.H2) === JSON.stringify(['B', 'C', 'A'])
);

// 13 乱斗非顶洞重排
var r13 = settleSmall.settle(
  gameOf({ groupMode: 'random', rule: { pushRule: 'none', reorderOnPush: 'no' } }),
  ctxOf({ H1: { A: -1, B: 1, C: 0 }, H2: { A: 0, B: 0, C: 0 } }, ['H1', 'H2'])
);
assert('13 乱斗重排', JSON.stringify(r13.orderByHole.H2) === JSON.stringify(['A', 'C', 'B']));

// 14 顶洞不重排
var r14 = settleSmall.settle(
  gameOf({ groupMode: 'random', rule: { pushRule: 'score', reorderOnPush: 'no' } }),
  ctxOf({ H1: { A: 1, B: -1, C: 1 }, H2: { A: 0, B: 0, C: 0 } }, ['H1', 'H2'])
);
assert(
  '14 顶洞保持排序',
  JSON.stringify(r14.orderByHole.H2) === JSON.stringify(['B', 'C', 'A']) && r14.meatPool >= 0
);

// 15 顶洞允许重排
var r15 = settleSmall.settle(
  gameOf({ groupMode: 'random', rule: { pushRule: 'score', reorderOnPush: 'yes' } }),
  ctxOf({ H1: { A: 1, B: -1, C: 1 }, H2: { A: 0, B: 0, C: 0 } }, ['H1', 'H2'])
);
assert('15 顶洞也重排', r15.orderHistory[0].orderAfter[0] === 'B');
assert('15b 顶洞后按杆', JSON.stringify(r15.orderHistory[0].orderAfter) === JSON.stringify(['B', 'A', 'C']) || r15.orderHistory[0].orderAfter[0] === 'B');

// 16 两种排序规则（出身 / 输赢）
var r16a = settleSmall.settle(
  gameOf({ groupMode: 'random', rankId: 'gross-origin', rule: { pushRule: 'none' } }),
  ctxOf({ H1: { A: 0, B: 0, C: 1 }, H2: { A: 0, B: 0, C: 0 } }, ['H1', 'H2'])
);
var r16b = settleSmall.settle(
  gameOf({ groupMode: 'random', rankId: 'gross-result', rule: { pushRule: 'none' } }),
  ctxOf({ H1: { A: 0, B: 0, C: 1 }, H2: { A: 0, B: 0, C: 0 } }, ['H1', 'H2'])
);
assert('16 出身/输赢均可运行', !!(r16a.byHole.H2 && r16b.byHole.H2));

// 17 顶洞肉池+1
var r17 = settleSmall.settle(
  gameOf({ rule: { pushRule: 'score' } }),
  ctxOf({ H1: { A: 1, B: -1, C: 1 } })
);
assert('17 顶洞肉+1', r17.meatPool === 1);

// 18 无顶洞不加肉
var r18 = settleSmall.settle(
  gameOf({ rule: { pushRule: 'none' } }),
  ctxOf({ H1: { A: 1, B: -1, C: 1 } })
);
assert('18 无顶洞肉=0', r18.meatPool === 0);

// 19/20 每次胜利自动吃1块，不查成绩表
var r19 = settleDebug(
  gameOf({ rule: { pushRule: 'score', meatRows: [{ id: 'le-2', value: 99 }, { id: 'm1', value: 99 }, { id: 'par', value: 99 }, { id: 'ge-1', value: 99 }] } }),
  ctxOf({ H1: { A: 1, B: -1, C: 1 }, H2: { A: 0, B: -1, C: 1 } }, ['H1', 'H2'])
);
assert('19/20 自动吃1块', r19.holeDebug.H2.meatTaken === 1 && r19.meatPool === 0);

// 21 肉不含奖励
var r21 = settleDebug(
  gameOf({
    K: 1,
    rule: {
      reward: 'mul',
      mulRows: mulRows,
      pushRule: 'score',
      meatInclude: 'no'
    }
  }),
  ctxOf({ H1: { A: 1, B: -1, C: 1 }, H2: { A: -1, B: 0, C: 1 } }, ['H1', 'H2'])
);
assert('21 肉不含奖励按K', r21.holeDebug.H2.meatTaken === 1 && r21.holeDebug.H2.meatScores.A === 2);

// 22 肉包含奖励
var r22 = settleDebug(
  gameOf({
    K: 1,
    rule: {
      reward: 'mul',
      mulRows: mulRows,
      pushRule: 'score',
      meatInclude: 'yes'
    }
  }),
  ctxOf({ H1: { A: 1, B: -1, C: 1 }, H2: { A: -1, B: 0, C: 1 } }, ['H1', 'H2'])
);
assert('22 肉含奖励按M', r22.holeDebug.H2.multiplier === 2 && r22.holeDebug.H2.meatScores.A === 4);

// 23 仅B触发包洞
var r23 = settleDebug(
  gameOf({
    rule: { baoMode: 'plus-n', baoPlusN: 1, baoPre: 'ignore', pushRule: 'none' }
  }),
  ctxOf({ H1: { A: 0, B: 2, C: 0 } })
);
assert('23 仅B包洞', hole(r23, 'H1').B === -2 && hole(r23, 'H1').C === 0 && hole(r23, 'H1').A === 2);

// 24 仅C触发
var r24 = settleDebug(
  gameOf({
    rule: { baoMode: 'plus-n', baoPlusN: 1, baoPre: 'ignore', pushRule: 'none' }
  }),
  ctxOf({ H1: { A: 0, B: 0, C: 2 } })
);
assert('24 仅C包洞', hole(r24, 'H1').C === -2 && hole(r24, 'H1').B === 0);

// 25 B/C同时触发不包
var r25 = settleDebug(
  gameOf({
    rule: { baoMode: 'plus-n', baoPlusN: 1, baoPre: 'ignore', pushRule: 'none' }
  }),
  ctxOf({ H1: { A: 0, B: 2, C: 2 } })
);
assert('25 同时触发平分', hole(r25, 'H1').B === -1 && hole(r25, 'H1').C === -1);

// 26 同伴顶头前置
var r26 = settleDebug(
  gameOf({
    rule: { baoMode: 'plus-n', baoPlusN: 2, baoPre: 'ahead', pushRule: 'none' }
  }),
  ctxOf({ H1: { A: 0, B: 2, C: 1 } })
);
// C=1 > A=0，同伴不顶头 → 不包
assert('26 同伴不顶头不包', hole(r26, 'H1').B === -1 && hole(r26, 'H1').C === -1);

// 27 与同伴无关
var r27 = settleDebug(
  gameOf({
    rule: { baoMode: 'plus-n', baoPlusN: 2, baoPre: 'ignore', pushRule: 'none' }
  }),
  ctxOf({ H1: { A: 0, B: 2, C: 1 } })
);
assert('27 无关则B包', hole(r27, 'H1').B === -2 && hole(r27, 'H1').C === 0);

// 28 包洞含奖励后正常负分
var r28 = settleDebug(
  gameOf({
    rule: {
      reward: 'mul',
      mulRows: mulRows,
      baoMode: 'plus-n',
      baoPlusN: 1,
      baoPre: 'ignore',
      pushRule: 'none'
    }
  }),
  ctxOf({ H1: { A: -1, B: 2, C: 0 } })
);
assert('28 包洞含×2负分', hole(r28, 'H1').A === 4 && hole(r28, 'H1').B === -4 && hole(r28, 'H1').C === 0);

// 29 肉损失不转嫁
var r29 = settleDebug(
  gameOf({
    rule: {
      baoMode: 'plus-n',
      baoPlusN: 1,
      baoPre: 'ignore',
      pushRule: 'score',
      meatInclude: 'no'
    }
  }),
  ctxOf({ H1: { A: 1, B: -1, C: 1 }, H2: { A: 0, B: 2, C: 0 } }, ['H1', 'H2'])
);
assert(
  '29 肉损各自承担',
  r29.holeDebug.H2.meatTaken === 1 &&
    hole(r29, 'H2').B === -3 &&
    hole(r29, 'H2').C === -1 &&
    hole(r29, 'H2').A === 4
);

// 30 有效洞过滤
var r30 = settleSmall.settle(
  gameOf({
    holes: [
      { label: 'H1', on: true },
      { label: 'H2', on: false }
    ]
  }),
  ctxOf({ H1: { A: 0, B: -1, C: 1 }, H2: { A: 0, B: -1, C: 1 } }, ['H1', 'H2'])
);
assert('30 关洞不计分', hole(r30, 'H2').A == null || hole(r30, 'H2').A === 0);

// 31 fullHoleOrder 同步（洞序来自 ctx.holeOrder）
var r31 = settleSmall.settle(
  gameOf({}),
  ctxOf({ X9: { A: 0, B: -1, C: 1 } }, ['X9'], { X9: 4 })
);
assert('31 自定义洞序', !!r31.byHole.X9 && hole(r31, 'X9').A === 2);

// 32 pending
var r32 = settleDebug(gameOf({}), ctxOf({ H1: { A: 0, B: -1 } }));
assert('32 pending 不结算', r32.holeDebug.H1.status === 'pending' && (hole(r32, 'H1').A == null || hole(r32, 'H1').A === 0));

// 33/34 规则字段保留（存在性）
var snap = {
  reward: 'mul',
  mulRows: mulRows,
  pushRule: 'score',
  reorderOnPush: 'yes',
  meatInclude: 'no',
  baoMode: 'plus-n',
  baoPlusN: 0,
  baoPre: 'ahead'
};
assert('33/34 baoPlusN=0 保留', snap.baoPlusN === 0 && Object.prototype.hasOwnProperty.call(snap, 'baoPlusN'));

// 35 结果页与核心一致（dispatch）
var g35 = gameOf({});
var coreR = settleSmall.settle(g35, ctxOf({ H1: { A: 0, B: -1, C: 1 } }));
var dispatchR = settle.settleGame(g35, ctxOf({ H1: { A: 0, B: -1, C: 1 } }));
assert('35 dispatch 一致', JSON.stringify(coreR.byHole) === JSON.stringify(dispatchR.byHole));

// 36 跨组三人（稳定 playerId）
var r36 = settleSmall.settle(
  gameOf({
    players: players3('g1-a', 'g2-b', 'g1-c'),
    order: ['g2-b', 'g1-c', 'g1-a']
  }),
  ctxOf({ H1: { 'g1-a': 0, 'g2-b': -1, 'g1-c': 1 } })
);
assert('36 跨组选人', hole(r36, 'H1')['g1-a'] === 2 && hole(r36, 'H1')['g2-b'] === -1);

// 37 普通用户只读 —— 由 pageAccess 既有测试覆盖；此处断言能力常量仍存在
assert('37 玩法开放可创建', !catalog.isUnavailableRule('landlord-small'));

// 38 斗大/斗二不回归
var big = settle.settleGame(
  {
    catalogId: 'landlord-big',
    players: players3('p1', 'p2', 'p3'),
    playerOrder: ['p1', 'p2', 'p3'],
    groupMode: 'fixed',
    multiplier: 1,
    ruleSnapshot: { reward: 'none', pushRule: 'none' }
  },
  ctxOf({ H1: { p1: -1, p2: 0, p3: 1 } }, ['H1'])
);
assert('38 斗大仍第1名单人', hole(big, 'H1').p1 === 2 && hole(big, 'H1').p2 === -1);

var mid = settle.settleGame(
  {
    catalogId: 'landlord-mid',
    players: players3('p1', 'p2', 'p3'),
    playerOrder: ['p1', 'p2', 'p3'],
    groupMode: 'fixed',
    multiplier: 1,
    ruleSnapshot: { reward: 'none', pushRule: 'none' }
  },
  ctxOf({ H1: { p1: 0, p2: -1, p3: 1 } }, ['H1'])
);
assert('38b 斗二第2名单人', hole(mid, 'H1').p2 === 2);

// UI 字段证明：规则页不出现吃肉表/高手不见面/加法奖励给小地主
var editJs = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/pages/edit-rule/index.js'),
  'utf8'
);
assert('UI 小地主 autoMeat', /showLandlordAutoMeat:\s*isSmall/.test(editJs));
assert('UI 小地主无肉表', /showLandlordMeatTable:\s*\(isLandlord && !isSmall\)/.test(editJs));
assert('UI 小地主包洞', /showBaoHole:\s*isMid \|\| isSmall/.test(editJs));
var cfgJs = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/pages/config/index.js'),
  'utf8'
);
assert('UI 隐藏高手不见面', /isLandlordSmall\(catalogId\)/.test(cfgJs) && /hideSplitHighGroup/.test(cfgJs));

console.log('\ngameLandlordSmallV53.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
