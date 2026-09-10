/**
 * 记分格旧版贴角三角 + 正式名次投影。
 * 运行：node scripts/scoreRankCornerVisual.selftest.js
 */
var fs = require('fs');
var path = require('path');

if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return global.__gb_side_games || [];
    },
    setStorageSync: function (_k, v) {
      global.__gb_side_games = v;
    }
  };
}

var visual = require('../miniprogram/utils/rankMarkVisual.js');
var mark = require('../miniprogram/utils/sideGameRankMark.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var projectMod = require('../miniprogram/subpackages/game/utils/rankMarkProjection.js');
var coord = require('../miniprogram/subpackages/game/utils/sideGameSettleCoordinator.js');
function settleThenProject(input) {
  coord.settleSideGamesForScoreMutation(input);
  return projectMod.project(input);
}

var mini = path.join(__dirname, '..', 'miniprogram');
var scoringRoot = path.join(mini, 'subpackages', 'scoring');
var wxml = fs.readFileSync(path.join(scoringRoot, 'pages', 'score', 'index.wxml'), 'utf8');
var wxss = fs.readFileSync(path.join(scoringRoot, 'pages', 'score', 'index.wxss'), 'utf8');
var scoreJs = fs.readFileSync(path.join(scoringRoot, 'pages', 'score', 'index.js'), 'utf8');

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
  return [{ id: 'pA' }, { id: 'pB' }, { id: 'pC' }, { id: 'pD' }];
}

var start = catalog.HOLES[0];

var random8421 = {
  catalogId: '8421-4',
  players: fourPlayers(),
  playerOrder: ['pA', 'pB', 'pC', 'pD'],
  groupMode: 'random',
  holes: holesOn(),
  holeOrder: catalog.HOLES.slice()
};

var m1 = mark.markForGameCell(random8421, start, 'pA');
var m2 = mark.markForGameCell(random8421, start, 'pB');
var m3 = mark.markForGameCell(random8421, start, 'pC');
var m4 = mark.markForGameCell(random8421, start, 'pD');

assert(
  '1. 8421-4 乱拉第1名纯蓝',
  m1.gameCornerRank === 1 && m1.triangleClass === 'triangle-blue' && m1.hasWaist === false && m1.triColor === visual.VIS_BLUE
);
assert(
  '2. 第2名纯红',
  m2.gameCornerRank === 2 && m2.triangleClass === 'triangle-red' && m2.hasWaist === false && m2.triColor === visual.VIS_RED
);
assert(
  '3. 第3名红+腰线',
  m3.gameCornerRank === 3 && m3.triangleClass === 'triangle-red' && m3.hasWaist === true && m3.triColor === visual.VIS_RED
);
assert(
  '4. 第4名蓝+腰线',
  m4.gameCornerRank === 4 && m4.triangleClass === 'triangle-blue' && m4.hasWaist === true && m4.triColor === visual.VIS_BLUE
);
assert(
  '5. 腰线只在 3/4 名出现',
  m1.hasWaist === false && m2.hasWaist === false && m3.hasWaist === true && m4.hasWaist === true
);

var fixed8421 = Object.assign({}, random8421, { groupMode: 'fixed' });
var fA = mark.markForGameCell(fixed8421, start, 'pA');
var fB = mark.markForGameCell(fixed8421, start, 'pB');
var fC = mark.markForGameCell(fixed8421, start, 'pC');
var fD = mark.markForGameCell(fixed8421, start, 'pD');
assert(
  '6. A/B 玩法无名次时只有纯蓝/纯红',
  fA.triangleClass === 'triangle-blue' &&
    fA.hasWaist === false &&
    fA.gameCornerRank == null &&
    fB.triangleClass === 'triangle-blue' &&
    fB.hasWaist === false &&
    fC.triangleClass === 'triangle-red' &&
    fC.hasWaist === false &&
    fD.triangleClass === 'triangle-red' &&
    fD.hasWaist === false
);

var goldDirect = visual.fromSandboxColor(mark.TRI_GOLD);
assert(
  '7. 金色规则保持金色贴角',
  goldDirect.triangleClass === 'triangle-gold' &&
    goldDirect.triColor === visual.VIS_GOLD &&
    goldDirect.hasWaist === false &&
    visual.fromAbSide('flower').triangleClass === 'triangle-gold' &&
    /triangle-gold/.test(wxss) &&
    /border-color:\s*transparent #ce9224/.test(wxss)
);

assert('8. 组外人员无三角', visual.isEmptyMark(mark.markForGameCell(random8421, start, 'pZ')));
assert(
  '8. 未开球后续洞无三角',
  visual.isEmptyMark(mark.markForGameCell(random8421, catalog.HOLES[1], 'pA'))
);

var lasuoN = {
  catalogId: 'lasuo-n',
  players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
  playerOrder: ['a', 'b', 'c', 'd', 'e'],
  formation: 'jianghu',
  holes: holesOn(),
  holeOrder: catalog.HOLES.slice()
};
assert('8. 拉丝N 轮空无三角', visual.isEmptyMark(mark.markForGameCell(lasuoN, start, 'e')));

function filledScores(n) {
  var a = [];
  var i;
  for (i = 0; i < 18; i++) a.push(i < n ? 4 : '');
  return a;
}

function makeRecord(catalogId, groupMode) {
  return {
    matchId: 'm-visual',
    groupId: 'g1',
    status: 'active',
    ruleId: catalogId,
    participantParties: fourPlayers().map(function (p) {
      return { partyId: p.id, partyType: 'player', memberPlayerIds: [p.id] };
    }),
    config: {
      instance: {
        catalogId: catalogId,
        players: fourPlayers(),
        playerOrder: ['pA', 'pB', 'pC', 'pD'],
        groupMode: groupMode,
        holes: holesOn(),
        holeOrder: catalog.HOLES.slice()
      }
    }
  };
}

function officialInput(scoresByPid) {
  return {
    matchId: 'm-visual',
    groupId: 'g1',
    pars: catalog.HOLES.map(function () {
      return 4;
    }),
    players: fourPlayers().map(function (p) {
      return { playerId: p.id, scores: scoresByPid[p.id] || filledScores(0) };
    })
  };
}

global.__gb_side_games = [makeRecord('8421-4', 'random')];
var filled5 = {
  pA: filledScores(5),
  pB: filledScores(5),
  pC: filledScores(5),
  pD: filledScores(5)
};
var proj5 = mark.completeProjection(settleThenProject(officialInput(filled5)), ['pA', 'pB', 'pC', 'pD']);
var cells5 = [];
var hi;
for (hi = 0; hi < 18; hi++) {
  cells5.push({ type: 'hole', holeIndex: hi });
}
var painted5 = mark.blankThenPaintCells(cells5, 'pC', proj5);
assert(
  '投影第3名带腰线',
  painted5[0].hasWaist === true && painted5[0].triangleClass === 'triangle-red'
);

var afterClear = {
  pA: filledScores(5),
  pB: filledScores(5),
  pC: filledScores(5),
  pD: filledScores(5)
};
afterClear.pA[1] = '';
afterClear.pB[1] = '';
afterClear.pC[1] = '';
afterClear.pD[1] = '';
global.__gb_side_games = [makeRecord('8421-4', 'random')];
var projClear = mark.completeProjection(settleThenProject(officialInput(afterClear)), ['pA', 'pB', 'pC', 'pD']);
var paintedClear = mark.blankThenPaintCells(painted5, 'pC', projClear);
var laterEmpty = true;
for (hi = 2; hi < 18; hi++) {
  if (paintedClear[hi].triangleClass || paintedClear[hi].hasWaist || paintedClear[hi].triColor) {
    laterEmpty = false;
  }
}
assert(
  '9. 清空中间洞后后续三角和腰线全部清除',
  laterEmpty &&
    paintedClear[0].triangleClass === 'triangle-red' &&
    paintedClear[0].hasWaist === true &&
    (!paintedClear[1].triangleClass ? paintedClear[1].hasWaist === false : true) &&
    !projClear.pC['2'].hasWaist &&
    !projClear.pC['2'].triangleClass
);

global.__gb_side_games = [makeRecord('8421-4', 'random')];
var restored = mark.completeProjection(settleThenProject(officialInput(filled5)), ['pC']);
var paintedRestored = mark.blankThenPaintCells(paintedClear, 'pC', restored);
assert(
  '10. 补录后正确恢复',
  paintedRestored[1].triangleClass === 'triangle-red' &&
    paintedRestored[1].hasWaist === true &&
    paintedRestored[4].hasWaist === true
);

global.__gb_side_games = [makeRecord('8421-4', 'random')];
var beforeScores = {
  pA: [4].concat(filledScores(0).slice(1)),
  pB: [5].concat(filledScores(0).slice(1)),
  pC: [6].concat(filledScores(0).slice(1)),
  pD: [7].concat(filledScores(0).slice(1))
};
var before = mark.completeProjection(settleThenProject(officialInput(beforeScores)), ['pA', 'pD']);
assert(
  '开球洞后一洞名次 1=A 蓝 4=D 蓝腰',
  projectMod.markAt(before, 'pA', 1).triangleClass === 'triangle-blue' &&
    projectMod.markAt(before, 'pA', 1).hasWaist === false &&
    projectMod.markAt(before, 'pD', 1).triangleClass === 'triangle-blue' &&
    projectMod.markAt(before, 'pD', 1).hasWaist === true
);
var flippedScores = {
  pA: [7].concat(filledScores(0).slice(1)),
  pB: [6].concat(filledScores(0).slice(1)),
  pC: [5].concat(filledScores(0).slice(1)),
  pD: [4].concat(filledScores(0).slice(1))
};
global.__gb_side_games = [makeRecord('8421-4', 'random')];
var afterFlip = mark.completeProjection(settleThenProject(officialInput(flippedScores)), ['pA', 'pD']);
var paintedFlip = mark.blankThenPaintCells(
  mark.blankThenPaintCells(cells5, 'pA', before),
  'pA',
  afterFlip
);
assert(
  '11. 修改成绩导致名次变化时 class 与腰线同时更新',
  paintedFlip[1].triangleClass === 'triangle-blue' &&
    paintedFlip[1].hasWaist === true &&
    projectMod.markAt(afterFlip, 'pD', 1).triangleClass === 'triangle-blue' &&
    projectMod.markAt(afterFlip, 'pD', 1).hasWaist === false
);

assert(
  '12. 三角不影响 onScoreCellTap',
  /onScoreCellTap/.test(scoreJs) &&
    /pointer-events:\s*none/.test(wxss) &&
    /class="\{\{cell.triangleClass\}\}"/.test(wxml) &&
    /bindtap="onScoreCellTap"|bindtap="onMatchSideScoreCellTap"/.test(wxml)
);

assert(
  '13. 记分页格子尺寸不变',
  /width:\s*144rpx/.test(wxss) && /min-height:\s*156rpx/.test(wxss)
);

assert(
  '14. 与历史 CSS 关键尺寸/色值一致',
  /top:\s*0/.test(wxss) &&
    /right:\s*0/.test(wxss) &&
    /border-width:\s*0 28rpx 28rpx 0/.test(wxss) &&
    /#ef4444/.test(wxss) &&
    /#3b82f6/.test(wxss) &&
    /\.corner-waist/.test(wxss) &&
    /z-index:\s*5/.test(wxss) &&
    /z-index:\s*6/.test(wxss) &&
    !/COLUMN_TRIANGLES/.test(scoreJs) &&
    !/border-top-color/.test(wxml)
);

var combo = {
  catalogId: '8421-4',
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
  'combination 按 party 映射名次',
  mark.markForGameCell(combo, start, 'u1').gameCornerRank === 1 &&
    mark.markForGameCell(combo, start, 'u5').gameCornerRank === 3 &&
    mark.markForGameCell(combo, start, 'u5').hasWaist === true
);

var three = {
  catalogId: '8421-3',
  players: [{ id: 'pA' }, { id: 'pB' }, { id: 'pC' }],
  playerOrder: ['pA', 'pB', 'pC'],
  groupMode: 'random',
  holes: holesOn(),
  holeOrder: catalog.HOLES.slice()
};
assert(
  '3 人玩法不自行添加腰线',
  mark.markForGameCell(three, start, 'pC').hasWaist === false &&
    mark.markForGameCell(three, start, 'pC').gameCornerRank == null
);

assert(
  '父格 relative + overflow hidden',
  /\.scoreboard-cell[\s\S]{0,280}position:\s*relative/.test(wxss) &&
    /\.scoreboard-cell[\s\S]{0,320}overflow:\s*hidden/.test(wxss)
);

assert('记分页不 require game 分包', scoreJs.indexOf('subpackages/game/') < 0);

console.log('\nscoreRankCornerVisual.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
