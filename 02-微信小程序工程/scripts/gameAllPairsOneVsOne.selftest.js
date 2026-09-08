/**
 * 比杆 / 比洞 / 单挂8421：n 人 → C(n,2) 场 1V1，按 pairing 结算后汇总到球员。
 * 运行：node scripts/gameAllPairsOneVsOne.selftest.js
 */
var path = require('path');
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils');
var catalog = require(path.join(utilsDir, 'catalog.js'));
var rec = require(path.join(utilsDir, 'sideGameRecord.js'));
var hostMod = require(path.join(utilsDir, 'gameHostContext.js'));
var settleStroke2 = require(path.join(utilsDir, 'settleStroke2.js'));
var settleMatch2 = require(path.join(utilsDir, 'settleMatch2.js'));
var s8421 = require(path.join(utilsDir, 'settle8421.js'));
var core = require(path.join(utilsDir, 'settleCore.js'));
var playerScoreCfg = require(path.join(utilsDir, 'sideGame8421PlayerConfig.js'));

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

function pairKeys(pairs) {
  return (pairs || [])
    .map(function (p) {
      return p.leftId + '-' + p.rightId;
    })
    .sort()
    .join(',');
}

function expectKeys(ids) {
  return catalog
    .listAllPairsOneVsOne(ids)
    .map(function (p) {
      return p.leftId + '-' + p.rightId;
    })
    .sort()
    .join(',');
}

['stroke-2', 'match-2', '8421-2'].forEach(function (id) {
  assert(id + ' 标记为 all-pairs 1V1', catalog.isAllPairsOneVsOneCatalog(id));
});
assert('8421-4 不是 all-pairs', !catalog.isAllPairsOneVsOneCatalog('8421-4'));
assert('three-vs-one 不是 all-pairs', !catalog.isAllPairsOneVsOneCatalog('three-vs-one'));

var p1 = catalog.listAllPairsOneVsOne(['A', 'B']);
assert('P1 pairingCount=1', p1.length === 1);
assert('P1 A-B', pairKeys(p1) === 'A-B');

var p2 = catalog.listAllPairsOneVsOne(['A', 'B', 'C']);
assert('P2 pairingCount=3', p2.length === 3);
assert('P2 A-B,A-C,B-C', pairKeys(p2) === expectKeys(['A', 'B', 'C']) && pairKeys(p2) === 'A-B,A-C,B-C');

var p3 = catalog.listAllPairsOneVsOne(['A', 'B', 'C', 'D']);
assert('P3 pairingCount=6', p3.length === 6);
assert(
  'P3 四人对六场',
  pairKeys(p3) === 'A-B,A-C,A-D,B-C,B-D,C-D'
);

function partiesOf(ids) {
  return ids.map(function (id) {
    return { partyId: id, partyType: 'player', displayName: id, memberPlayerIds: [id] };
  });
}

function makeHost(ids) {
  var official = {};
  ids.forEach(function (id) {
    official[id] = { holes: { A1: { score: 4 } } };
  });
  return hostMod.emptyContext({
    matchId: 'm-pairs',
    groupId: 'g1',
    scope: 'group',
    revision: 'r1',
    holeContextReady: true,
    holeOrder: ['A1'],
    pars: { A1: 4 },
    players: ids.map(function (id) {
      return { playerId: id, groupId: 'g1' };
    }),
    scoreParties: ids.map(function (id) {
      return {
        partyId: id,
        partyType: 'player',
        memberPlayerIds: [id],
        groupId: 'g1'
      };
    }),
    officialScoresByPartyId: official
  });
}

function createInput(ruleId, ids) {
  return {
    matchId: 'm-pairs',
    groupId: 'g1',
    scope: 'group',
    ruleId: ruleId,
    ruleSnapshot: rec.buildRuleSnapshot(ruleId),
    title: ruleId,
    visibility: 'public',
    status: 'active',
    revision: 1,
    participantParties: partiesOf(ids)
  };
}

['stroke-2', 'match-2', '8421-2'].forEach(function (id) {
  assert(id + ' 1人 FAIL', !rec.validateCreateInput(createInput(id, ['A']), makeHost(['A', 'B'])).ok);
  assert(id + ' 2人 PASS', rec.validateCreateInput(createInput(id, ['A', 'B']), makeHost(['A', 'B'])).ok);
  assert(id + ' 3人 PASS', rec.validateCreateInput(createInput(id, ['A', 'B', 'C']), makeHost(['A', 'B', 'C'])).ok);
  var four = rec.validateCreateInput(createInput(id, ['A', 'B', 'C', 'D']), makeHost(['A', 'B', 'C', 'D']));
  assert(id + ' 4人 PASS', four.ok, four.reason);
});

assert(
  '8421-4 仍必须恰好 4 方',
  !rec.validateCreateInput(createInput('8421-4', ['A', 'B']), makeHost(['A', 'B', 'C', 'D'])).ok
);

var fourSel = hostMod.validatePartySelection(makeHost(['A', 'B', 'C', 'D']), ['A', 'B', 'C', 'D'], 'stroke-2');
assert('validatePartySelection 4 人比杆 PASS', fourSel.ok, fourSel.message);

function pairingsOf(ids) {
  return catalog.listAllPairsOneVsOne(ids).map(function (p) {
    return Object.assign({}, p, { on: true, leftPartyId: p.leftId, rightPartyId: p.rightId });
  });
}

var fourIds = ['A', 'B', 'C', 'D'];
var six = pairingsOf(fourIds);
assert('4 人生成 6 pairing 供结算', six.length === 6);

var strokeGame = {
  catalogId: 'stroke-2',
  players: fourIds.map(function (id) {
    return { id: id };
  }),
  pairings: six,
  multiplier: 1,
  holes: [{ label: '1', on: true }],
  ruleSnapshot: { catalogId: 'stroke-2', reward: 'none' }
};
var strokeHole = settleStroke2.settle(strokeGame, {
  scores: { '1': { A: 0, B: 1, C: -1, D: 2 } },
  holeOrder: ['1'],
  pars: { '1': 4 }
}).byHole['1'];

assert('聚合 A-B=+1 A-C=-1 A-D=+2 → A=+2', strokeHole.A === 2, JSON.stringify(strokeHole));
assert(
  '比杆 4 人洞零和',
  core.round1(
    (strokeHole.A || 0) + (strokeHole.B || 0) + (strokeHole.C || 0) + (strokeHole.D || 0) + (strokeHole[core.POT_ID] || 0)
  ) === 0,
  JSON.stringify(strokeHole)
);

var matchGame = {
  catalogId: 'match-2',
  players: fourIds.map(function (id) {
    return { id: id };
  }),
  pairings: six,
  multiplier: 1,
  holes: [{ label: '1', on: true }],
  ruleSnapshot: { catalogId: 'match-2', reward: 'none', pushRule: 'none' }
};
var matchHole = settleMatch2.settle(matchGame, {
  scores: { '1': { A: 0, B: 1, C: -1, D: 2 } },
  holeOrder: ['1'],
  pars: { '1': 4 }
}).byHole['1'];
assert(
  '比洞 4 人 6 pairing 零和',
  core.round1(
    (matchHole.A || 0) + (matchHole.B || 0) + (matchHole.C || 0) + (matchHole.D || 0) + (matchHole[core.POT_ID] || 0)
  ) === 0,
  JSON.stringify(matchHole)
);

var g8421 = {
  catalogId: '8421-2',
  players: [
    { id: 'A', scoreCode: '8421' },
    { id: 'B', scoreCode: '8421', scoreOverrides: { deductCap: 'none', deductCapN: '3' } },
    { id: 'C', scoreCode: '8421' },
    { id: 'D', scoreCode: '8421' }
  ],
  pairings: six,
  multiplier: 1,
  holes: [{ label: '1', on: true }],
  ruleSnapshot: {
    catalogId: '8421-2',
    deductMode: 'on',
    deductWay: 'plus-n',
    deductPlusN: 4,
    deductCap: 'cap',
    deductCapN: 1,
    pushRule: 'tie'
  }
};
var h8421 = s8421.settle(g8421, {
  scores: { '1': { A: 0, B: 1, C: 0, D: 0 } },
  holeOrder: ['1'],
  pars: { '1': 4 },
  windOn: false
}).byHole['1'];
assert(
  '8421-2 4 人 6 pairing 零和',
  core.round1((h8421.A || 0) + (h8421.B || 0) + (h8421.C || 0) + (h8421.D || 0) + (h8421[core.POT_ID] || 0)) === 0,
  JSON.stringify(h8421)
);
var ruleCap = { deductCap: 'cap', deductCapN: 1, deductMode: 'on', deductWay: 'plus-n', deductPlusN: 4 };
assert(
  '同一 A 的 effective config 在所有 pairing 共用',
  playerScoreCfg.resolve8421PlayerScoreConfig(ruleCap, { id: 'A' }).deductCap === 'cap'
);
assert(
  'B override none 在所有 pairing 一致',
  s8421.deductCfg({ id: 'B', scoreOverrides: { deductCap: 'none', deductCapN: '3' } }, ruleCap).deductCap ===
    'none'
);

var cand4 = catalog.syncAllPairsOnState(['A', 'B', 'C', 'D'], []);
assert('Case1 候选 6', cand4.length === 6);
assert(
  'Case1 键名',
  pairKeys(cand4) === 'A-B,A-C,A-D,B-C,B-D,C-D'
);
assert('Case2 默认全选', catalog.selectedAllPairs(cand4).length === 6);

var afterOff = cand4.map(function (p) {
  if (p.id === 'A|D' || p.id === 'B|C') return Object.assign({}, p, { on: false });
  return p;
});
var selected4 = catalog.selectedAllPairs(afterOff);
assert('Case3 取消 AD/BC 后剩 4', selected4.length === 4);
assert(
  'Case3 选中 AB AC BD CD',
  pairKeys(selected4) === 'A-B,A-C,B-D,C-D'
);
assert('Case4 保存只写选中', selected4.length === 4 && afterOff.length === 6);

['stroke-2', 'match-2', '8421-2'].forEach(function (id) {
  assert(
    'Case8 ' + id + ' 共用 builder',
    catalog.isAllPairsOneVsOneCatalog(id) &&
      catalog.syncAllPairsOnState(['A', 'B', 'C', 'D'], []).length === 6
  );
});

var dropD = catalog.syncAllPairsOnState(['A', 'B', 'C'], afterOff);
assert('Case6 取消 D 后候选 3', dropD.length === 3);
assert('Case6 无 D pairing', pairKeys(dropD).indexOf('D') < 0);
assert(
  'Case6 保留 BC 取消状态',
  dropD.filter(function (p) {
    return p.id === 'B|C';
  })[0].on === false
);
var readdD = catalog.syncAllPairsOnState(['A', 'B', 'C', 'D'], dropD);
var adRow = readdD.filter(function (p) {
  return p.id === 'A|D';
})[0];
assert('重选 D 时新 pairing 默认勾选', !!(adRow && adRow.on));
assert(
  '重选 D 后 BC 仍取消',
  readdD.filter(function (p) {
    return p.id === 'B|C';
  })[0].on === false
);

var noneOn = cand4.map(function (p) {
  return Object.assign({}, p, { on: false });
});
assert('Case7 全取消 selected=0', catalog.selectedAllPairs(noneOn).length === 0);

var subsetPairs = selected4.map(function (p) {
  return Object.assign({}, p, { leftPartyId: p.leftId, rightPartyId: p.rightId });
});
var subsetGame = {
  catalogId: 'stroke-2',
  players: fourIds.map(function (id) {
    return { id: id };
  }),
  pairings: subsetPairs,
  multiplier: 1,
  holes: [{ label: '1', on: true }],
  ruleSnapshot: { catalogId: 'stroke-2', reward: 'none' }
};
var subsetHole = settleStroke2.settle(subsetGame, {
  scores: { '1': { A: 0, B: 1, C: -1, D: 2 } },
  holeOrder: ['1'],
  pars: { '1': 4 }
}).byHole['1'];
assert(
  'Case5 未选 AD 则 A 不含 AD 的 +2',
  subsetHole.A === 0,
  JSON.stringify(subsetHole)
);
assert(
  'Case5 子集仍零和',
  core.round1(
    (subsetHole.A || 0) +
      (subsetHole.B || 0) +
      (subsetHole.C || 0) +
      (subsetHole.D || 0) +
      (subsetHole[core.POT_ID] || 0)
  ) === 0,
  JSON.stringify(subsetHole)
);

console.log('---');
console.log('passed ' + passed + '  failed ' + failed);
if (failed) process.exit(1);
