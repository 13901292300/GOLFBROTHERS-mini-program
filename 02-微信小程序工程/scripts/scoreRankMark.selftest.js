/**
 * 记分页红蓝三角：与沙盒 rankTriColorForCell 对齐。
 * 运行：node scripts/scoreRankMark.selftest.js
 */
var fs = require('fs');
var path = require('path');

if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return global.__gb_side_games || [];
    },
    setStorageSync: function () {}
  };
}

var mark = require('../miniprogram/utils/sideGameRankMark.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var settleLasuoN = require('../miniprogram/subpackages/game/utils/settleLasuoN.js');
var settleHorn = require('../miniprogram/subpackages/game/utils/settleHorn.js');

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

function holesOn() {
  return catalog.HOLES.map(function (label) {
    return { label: label, on: true };
  });
}

function fourPlayers() {
  return [
    { id: 'pA' },
    { id: 'pB' },
    { id: 'pC' },
    { id: 'pD' }
  ];
}

var lasuo4 = {
  catalogId: 'lasuo-4',
  players: fourPlayers(),
  playerOrder: ['pA', 'pB', 'pC', 'pD'],
  groupMode: 'random',
  holes: holesOn(),
  holeOrder: catalog.HOLES.slice()
};

assert(
  '1 沙盒 catalog.rankTriColor 与主包一致',
  catalog.rankTriColor('lasuo-4', 4, 'random', 0) === mark.rankTriColor('lasuo-4', 4, 'random', 0) &&
    catalog.rankTriColor('lasuo-4', 4, 'random', 1) === mark.rankTriColor('lasuo-4', 4, 'random', 1) &&
    catalog.rankTriColor('lasuo-4', 4, 'fixed', 1) === mark.rankTriColor('lasuo-4', 4, 'fixed', 1)
);

var start = catalog.HOLES[0];
assert('2 红方红三角', mark.colorForGameCell(lasuo4, start, 'pB') === mark.TRI_RED);
assert('2 蓝方蓝三角', mark.colorForGameCell(lasuo4, start, 'pA') === mark.TRI_BLUE);

var noMark = {
  catalogId: 'stroke-2',
  players: [{ id: 'pA' }, { id: 'pB' }],
  playerOrder: ['pA', 'pB'],
  holes: holesOn(),
  holeOrder: catalog.HOLES.slice()
};
assert('3 无比边玩法无三角', mark.colorForGameCell(noMark, start, 'pA') === '');

assert(
  '4 同名不同 ID 不串',
  mark.colorForGameCell(lasuo4, start, 'pA') !== mark.colorForGameCell(lasuo4, start, 'pB')
);

var combo = {
  catalogId: 'lasuo-4',
  players: [{ id: 'combo-1' }, { id: 'combo-2' }, { id: 'combo-3' }, { id: 'combo-4' }],
  parties: [
    { partyId: 'combo-1', partyType: 'combination', memberPlayerIds: ['u1', 'u2'] },
    { partyId: 'combo-2', partyType: 'combination', memberPlayerIds: ['u3', 'u4'] },
    { partyId: 'combo-3', partyType: 'combination', memberPlayerIds: ['u5', 'u6'] },
    { partyId: 'combo-4', partyType: 'combination', memberPlayerIds: ['u7', 'u8'] }
  ],
  playerOrder: ['combo-1', 'combo-2', 'combo-3', 'combo-4'],
  groupMode: 'random',
  holes: holesOn(),
  holeOrder: catalog.HOLES.slice()
};
assert(
  '5 combination 成员按 party 分边',
  mark.colorForGameCell(combo, start, 'u1') === mark.colorForGameCell(combo, start, 'combo-1') &&
    mark.colorForGameCell(combo, start, 'u1') === mark.TRI_BLUE
);

assert('6 组外人员无标记', mark.colorForGameCell(lasuo4, start, 'pZ') === '');

var updated = Object.assign({}, lasuo4, { groupMode: 'fixed' });
assert(
  '7 修改配置后面貌变化',
  mark.colorForGameCell(lasuo4, start, 'pB') === mark.TRI_RED &&
    mark.colorForGameCell(updated, start, 'pB') === mark.TRI_BLUE
);

assert(
  '8 删除后列表为空则无色',
  mark.colorForCell([], start, 'pA') === ''
);

var recA = {
  matchId: 'm1',
  groupId: 'g1',
  status: 'active',
  ruleId: 'lasuo-4',
  config: { instance: lasuo4 }
};
var recOther = {
  matchId: 'm2',
  groupId: 'g1',
  status: 'active',
  ruleId: 'lasuo-4',
  config: { instance: lasuo4 }
};
assert(
  '9 换 matchId 不串场',
  mark.recordsForScorePage([recA, recOther], { matchId: 'm2', groupId: 'g1' }).length === 1 &&
    mark.recordsForScorePage([recA], { matchId: 'm2', groupId: 'g1' }).length === 0
);

var first = {
  catalogId: 'lasuo-4',
  players: fourPlayers(),
  playerOrder: ['pA', 'pB', 'pC', 'pD'],
  groupMode: 'fixed',
  holes: holesOn(),
  holeOrder: catalog.HOLES.slice()
};
var second = lasuo4;
assert(
  '10 多游戏取列表中第一个满足条件的',
  mark.colorForCell([first, second], start, 'pB') === mark.TRI_BLUE
);

var order = ['pA', 'pB', 'pC', 'pD', 'pE', 'pF'];
var lasuoNGame = { formation: 'jianghu', bandMode: 'all' };
assert(
  '1 拉丝N 与 settle 三角一致',
  settleLasuoN.triColor(lasuoNGame, order, 'pA') === mark.lasuoNTriColor(lasuoNGame, order, 'pA') &&
    settleHorn.triColor({ formation: 'jianghu' }, ['a', 'b', 'c', 'd', 'e'], 'a') ===
      mark.hornTriColor({ formation: 'jianghu' }, ['a', 'b', 'c', 'd', 'e'], 'a')
);

var scoringRoot = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'scoring');
var scoreJs = fs.readFileSync(path.join(scoringRoot, 'pages', 'score', 'index.js'), 'utf8');
assert('11 enrich 写入三角四字段不改 scores', /cellTriMark\(player, hi/.test(scoreJs) && /triangleClass: tri.triangleClass/.test(scoreJs) && scoreJs.indexOf('player.scores[') >= 0);
assert(
  '12 记分页不 require game 分包',
  scoreJs.indexOf('subpackages/game/') < 0 &&
    fs.readFileSync(path.join(scoringRoot, 'utils', 'scoreRankMark.js'), 'utf8').indexOf('subpackages/game/') < 0
);

var wxml = fs.readFileSync(path.join(scoringRoot, 'pages', 'score', 'index.wxml'), 'utf8');
assert('WXML 使用历史贴角 class 双节点', /triangleClass/.test(wxml) && /corner-waist/.test(wxml) && !/score-rank-tri/.test(wxml) && !/border-top-color/.test(wxml));

var scoreRank = require('../miniprogram/subpackages/scoring/utils/scoreRankMark.js');
var officialCourseLabels = [
  'C1',
  'C2',
  'C3',
  'C4',
  'C5',
  'C6',
  'C7',
  'C8',
  'C9',
  'D1',
  'D2',
  'D3',
  'D4',
  'D5',
  'D6',
  'D7',
  'D8',
  'D9'
];
var officialRecord = {
  matchId: 'casual-match',
  groupId: 'casual-match-g1',
  status: 'active',
  ruleId: 'lasuo-4',
  participantParties: fourPlayers().map(function (p) {
    return { partyId: p.id, partyType: 'player', memberPlayerIds: [p.id] };
  }),
  config: {
    instance: {
      catalogId: 'lasuo-4',
      players: fourPlayers(),
      playerOrder: ['pA', 'pB', 'pC', 'pD'],
      groupMode: 'random',
      holes: holesOn(),
      holeOrder: catalog.HOLES.slice()
    }
  }
};
global.__gb_side_games = [officialRecord];

var scoreRow = { playerId: 'pA', userId: 'pA', scorePlayerId: 'slot-9' };
var lookupOfficial = scoreRank.makeScoreLookup({
  matchId: 'casual-match',
  groupId: 'casual-match-g1'
});

function makeOfficialScoreCells(player) {
  return officialCourseLabels.map(function (label, hi) {
    return {
      type: 'hole',
      label: label,
      holeIndex: hi,
      triColor: lookupOfficial(scoreRank.playerIdOf(player), hi)
    };
  });
}

var officialCells = makeOfficialScoreCells(scoreRow);
assert(
  '13 正式记分格 C1/holeIndex0 有色且不按洞标关联',
  officialCells[0].label === 'C1' &&
    officialCells[0].holeIndex === 0 &&
    officialCells[0].triColor === mark.TRI_BLUE &&
    lookupOfficial(scoreRank.playerIdOf(scoreRow), 'C1') === ''
);
assert(
  '13 WXML 绑定三角 class / 腰线',
  /wx:for="\{\{item.cells\}\}"/.test(wxml) &&
    /wx:if="\{\{cell.triangleClass\}\}"/.test(wxml) &&
    /wx:if="\{\{col.triangleClass\}\}"/.test(wxml) &&
    /wx:if="\{\{cell.hasWaist\}\}"/.test(wxml)
);
assert(
  '13 playerId 优先于 scorePlayerId',
  scoreRank.playerIdOf(scoreRow) === 'pA' &&
    scoreRank.playerIdOf({ scorePlayerId: 'slot-9' }) === ''
);

var sessionKeyLookup = scoreRank.makeScoreLookup({
  matchId: 'casual-match',
  groupId: 'casual-match:0'
});
assert(
  '13 会话键 gameId:0 不能命中正式 groupId',
  sessionKeyLookup('pA', 0) === '' &&
    scoreRank.makeScoreLookup({ matchId: 'casual-match', groupId: 'casual-match' })('pA', 0) === ''
);

var inspect = mark.inspect(
  { matchId: 'casual-match', groupId: 'casual-match-g1' },
  {
    scorePlayerId: 'pA',
    scoreHoleLabel: 'C1',
    holeIndex: 0,
    scorePlayerCount: 4,
    scoreHoleCount: 18
  }
);
assert(
  '13 inspect 洞序按下标对齐',
  inspect.storedGameCount === 1 &&
    inspect.matchedGameCount === 1 &&
    inspect.eligibleGameCount === 1 &&
    inspect.sample.scoreHoleLabel === 'C1' &&
    inspect.sample.gameHoleLabel === 'A1' &&
    inspect.sample.scoreHoleIndex === 0 &&
    inspect.sample.gamePlayerMatched === true &&
    inspect.sample.triColor === mark.TRI_BLUE &&
    JSON.stringify(inspect).indexOf('slot-9') < 0
);

global.__gb_side_games = [];
var afterDelete = scoreRank.makeScoreLookup({
  matchId: 'casual-match',
  groupId: 'casual-match-g1'
});
assert('13 删除游戏后正式格为空', afterDelete('pA', 0) === '');

var rankFn = scoreJs.slice(scoreJs.indexOf('function rankColorOptions'), scoreJs.indexOf('function cellTriColor'));
assert(
  '13 记分页用 Host 正式 groupId 且按下标查色',
  rankFn.indexOf('buildForScorePage') >= 0 &&
    rankFn.indexOf('snap.groupId') >= 0 &&
    rankFn.indexOf('data.groupId') < 0 &&
    rankFn.indexOf('markFromProjection') >= 0 &&
    /cellTriMark\(player, hi/.test(scoreJs) &&
    scoreJs.indexOf('SIDE_GAME_RANK_MARK') < 0
);

console.log('\nscoreRankMark.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
