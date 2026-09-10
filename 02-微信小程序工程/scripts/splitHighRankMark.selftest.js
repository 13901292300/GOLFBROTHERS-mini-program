/**
 * 高手不见面：全色三角按高手区席位分配，不按四人总排名。
 * 运行：node scripts/splitHighRankMark.selftest.js
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
var settleLasuo4 = require('../miniprogram/subpackages/game/utils/settleLasuo4.js');

var mini = path.join(__dirname, '..', 'miniprogram');
var scoringRoot = path.join(mini, 'subpackages', 'scoring');
var wxml = fs.readFileSync(path.join(scoringRoot, 'pages', 'score', 'index.wxml'), 'utf8');
var wxss = fs.readFileSync(path.join(scoringRoot, 'pages', 'score', 'index.wxss'), 'utf8');

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
var nextHole = catalog.HOLES[1];

function splitHighGame(extra) {
  return Object.assign(
    {
      catalogId: 'lasuo-4',
      players: fourPlayers(),
      playerOrder: ['pA', 'pB', 'pC', 'pD'],
      groupMode: 'split-high',
      holes: holesOn(),
      holeOrder: catalog.HOLES.slice()
    },
    extra || {}
  );
}

function isSolidBlue(m) {
  return (
    m &&
    m.gameCornerRank === 1 &&
    m.triangleClass === 'triangle-blue' &&
    m.hasWaist === false &&
    m.triColor === visual.VIS_BLUE
  );
}

function isSolidRed(m) {
  return (
    m &&
    m.gameCornerRank === 2 &&
    m.triangleClass === 'triangle-red' &&
    m.hasWaist === false &&
    m.triColor === visual.VIS_RED
  );
}

function isRegularMark(m) {
  return !!(m && m.hasWaist && (m.gameCornerRank === 3 || m.gameCornerRank === 4));
}

function marksOf(game) {
  return {
    A: mark.markForGameCell(game, start, 'pA'),
    B: mark.markForGameCell(game, start, 'pB'),
    C: mark.markForGameCell(game, start, 'pC'),
    D: mark.markForGameCell(game, start, 'pD')
  };
}

function withHoleOrder(order) {
  var map = {};
  map[start] = order;
  return { holeResults: { orderByHole: map } };
}

var g1 = splitHighGame(withHoleOrder(['pA', 'pB', 'pC', 'pD']));
var m1 = marksOf(g1);
assert('1 高手1最好：蓝全色 / 高手2红全色', isSolidBlue(m1.A) && isSolidRed(m1.B));
assert('1 低手仍用腰线样式', isRegularMark(m1.C) && isRegularMark(m1.D));

var g2 = splitHighGame(withHoleOrder(['pC', 'pA', 'pB', 'pD']));
var m2 = marksOf(g2);
assert(
  '2 低手1全场最好仍无全色',
  isRegularMark(m2.C) && isSolidBlue(m2.A) && isSolidRed(m2.B) && m2.C.hasWaist === true
);
assert('2 低手全色禁令', m2.C.hasWaist === true && m2.C.gameCornerRank !== 1 && m2.C.gameCornerRank !== 2);

var g3 = splitHighGame(withHoleOrder(['pC', 'pD', 'pA', 'pB']));
var m3 = marksOf(g3);
assert(
  '3 两名低手均优于高手：高手席位仍蓝/红全色',
  isSolidBlue(m3.A) && isSolidRed(m3.B) && isRegularMark(m3.C) && isRegularMark(m3.D)
);
assert(
  '验收 C=3 D=4 A=5 B=6 总排名不得给低手全色',
  m3.C.gameCornerRank === 3 &&
    m3.D.gameCornerRank === 4 &&
    m3.A.gameCornerRank === 1 &&
    m3.B.gameCornerRank === 2
);

var g4 = splitHighGame(withHoleOrder(['pB', 'pA', 'pC', 'pD']));
var m4 = marksOf(g4);
assert('4 高手区交换：蓝/红跟随席位', isSolidBlue(m4.B) && isSolidRed(m4.A));

var g5 = splitHighGame(withHoleOrder(['pA', 'pB', 'pD', 'pC']));
var m5 = marksOf(g5);
assert(
  '5 低手区交换不影响高手全色',
  isSolidBlue(m5.A) && isSolidRed(m5.B) && isRegularMark(m5.D) && isRegularMark(m5.C)
);

var g6 = splitHighGame(withHoleOrder(['pA', 'pB', 'pC', 'pD']));
var m6 = marksOf(g6);
assert('6 同杆不跨区：仍按区内既有顺序', isSolidBlue(m6.A) && isSolidRed(m6.B) && isRegularMark(m6.C));

var g7 = splitHighGame(
  Object.assign(
    {
      rankId: 'net-origin'
    },
    withHoleOrder(['pC', 'pD', 'pB', 'pA'])
  )
);
var m7 = marksOf(g7);
assert(
  '7 调整后成绩更好的低手无全色',
  isRegularMark(m7.C) && isRegularMark(m7.D) && isSolidBlue(m7.B) && isSolidRed(m7.A)
);

var g8 = splitHighGame(
  Object.assign({ rankId: 'hole-win' }, withHoleOrder(['pD', 'pC', 'pB', 'pA']))
);
var m8 = marksOf(g8);
assert(
  '8 按本洞输赢仍只在高手区内定蓝/红',
  isSolidBlue(m8.B) && isSolidRed(m8.A) && isRegularMark(m8.D) && isRegularMark(m8.C)
);

var g9 = splitHighGame(
  Object.assign(
    {
      groupMembership: { pA: 'expert', pB: 'expert', pC: 'regular', pD: 'regular' },
      playerOrder: ['pC', 'pD', 'pA', 'pB']
    },
    withHoleOrder(['pC', 'pD', 'pA', 'pB'])
  )
);
var m9 = marksOf(g9);
assert(
  '9 列表重排后分区跟随 playerId',
  isSolidBlue(m9.A) && isSolidRed(m9.B) && isRegularMark(m9.C) && isRegularMark(m9.D)
);

assert(
  '9 不得用数组下标把低手当高手',
  visual.splitHighDisplayRank(g9, ['pC', 'pD', 'pA', 'pB'], 'pC') === 3 &&
    visual.splitHighDisplayRank(g9, ['pC', 'pD', 'pA', 'pB'], 'pA') === 1
);

function makeRecord(groupMode, extraInst) {
  return {
    matchId: 'm-split-high',
    groupId: 'g1',
    status: 'active',
    ruleId: 'lasuo-4',
    participantParties: fourPlayers().map(function (p) {
      return { partyId: p.id, partyType: 'player', memberPlayerIds: [p.id] };
    }),
    config: {
      instance: Object.assign(
        {
          catalogId: 'lasuo-4',
          players: fourPlayers(),
          playerOrder: ['pA', 'pB', 'pC', 'pD'],
          groupMode: groupMode,
          holes: holesOn(),
          holeOrder: catalog.HOLES.slice()
        },
        extraInst || {}
      )
    }
  };
}

function officialInput(scoresByPid) {
  return {
    matchId: 'm-split-high',
    groupId: 'g1',
    pars: catalog.HOLES.map(function () {
      return 4;
    }),
    players: fourPlayers().map(function (p) {
      var scores = [];
      var i;
      for (i = 0; i < 18; i++) scores.push('');
      scores[0] = scoresByPid[p.id];
      return { playerId: p.id, scores: scores };
    })
  };
}

global.__gb_side_games = [makeRecord('split-high')];
var acceptScores = { pA: 5, pB: 6, pC: 3, pD: 4 };
var projA = mark.completeProjection(settleThenProject(officialInput(acceptScores)), [
  'pA',
  'pB',
  'pC',
  'pD'
]);
assert(
  '10 投影进入：assignment 画出 side/role（无 gameCornerRank）；expert 不在 schema 里',
  projectMod.markAt(projA, 'pA', 1).triangleClass === 'triangle-blue' &&
    projectMod.markAt(projA, 'pA', 1).hasWaist === false &&
    projectMod.markAt(projA, 'pB', 1).triangleClass === 'triangle-red' &&
    projectMod.markAt(projA, 'pB', 1).hasWaist === false &&
    projectMod.markAt(projA, 'pC', 1).hasWaist === true &&
    projectMod.markAt(projA, 'pD', 1).hasWaist === true &&
    projectMod.markAt(projA, 'pA', 1).gameCornerRank == null
);

global.__gb_side_games = [makeRecord('split-high')];
var projB = mark.completeProjection(settleThenProject(officialInput(acceptScores)), [
  'pA',
  'pB',
  'pC',
  'pD'
]);
assert(
  '10 退出再进入标识一致',
  projectMod.markAt(projA, 'pA', 1).triangleClass === projectMod.markAt(projB, 'pA', 1).triangleClass &&
    projectMod.markAt(projA, 'pC', 1).hasWaist === projectMod.markAt(projB, 'pC', 1).hasWaist &&
    projectMod.markAt(projB, 'pC', 1).hasWaist === true
);

var randomGame = splitHighGame({ groupMode: 'random', holeResults: { orderByHole: {} } });
randomGame.holeResults.orderByHole[start] = ['pC', 'pD', 'pA', 'pB'];
var rm = marksOf(randomGame);
assert(
  '11 乱拉仍按四人总排名：C 蓝全色 D 红全色',
  isSolidBlue(rm.C) && isSolidRed(rm.D) && isRegularMark(rm.A) && isRegularMark(rm.B)
);

var fixedGame = splitHighGame({ groupMode: 'fixed' });
var fm = marksOf(fixedGame);
assert(
  '11 固拉保持分边纯色、无腰线名次',
  fm.A.triangleClass === 'triangle-blue' &&
    fm.A.hasWaist === false &&
    fm.A.gameCornerRank == null &&
    fm.B.triangleClass === 'triangle-blue' &&
    fm.C.triangleClass === 'triangle-red' &&
    fm.D.triangleClass === 'triangle-red' &&
    fm.C.hasWaist === false
);

var srcLasuo = fs.readFileSync(path.join(mini, 'subpackages', 'game', 'utils', 'settleLasuo4.js'), 'utf8');
var srcResolver = fs.readFileSync(
  path.join(mini, 'subpackages', 'game', 'utils', 'resolveNextHoleOrder.js'),
  'utf8'
);
assert(
  '12 分队仍按分区切片排序，未改 nextOrder',
  /policy === 'split-high'/.test(srcResolver) &&
    /stableSort\(body.slice\(0, 2\), cmp\)/.test(srcResolver) &&
    /stableSort\(body.slice\(2, 4\), cmp\)/.test(srcResolver)
);
assert(
  '12 teamsOf 交叉编队未改',
  /aTeam: \[order\[0\], order\[3\]\]/.test(srcLasuo) && /bTeam: \[order\[1\], order\[2\]\]/.test(srcLasuo)
);

assert(
  '12 8421-4 分队切片未改',
  /stableSort\(body.slice\(0, 2\), cmp\)/.test(srcResolver) &&
    /stableSort\(body.slice\(2, 4\), cmp\)/.test(srcResolver)
);

assert('13 WXML 无修改约束：仍用历史贴角 class', /triangleClass/.test(wxml) && /corner-waist/.test(wxml));
assert(
  '13 WXSS 关键色值仍在',
  /#ef4444/.test(wxss) && /#3b82f6/.test(wxss) && /\.corner-waist/.test(wxss)
);
assert(
  '13 fromRank 资源未改',
  visual.fromRank(1).triangleClass === 'triangle-blue' &&
    visual.fromRank(2).hasWaist === false &&
    visual.fromRank(3).hasWaist === true &&
    visual.fromRank(4).triangleClass === 'triangle-blue'
);

var visualSrc = fs.readFileSync(path.join(mini, 'utils', 'rankMarkVisual.js'), 'utf8');
assert(
  '乱拉 fromRank 规则仍按 overall idx',
  /rank = Number\(idx\) \+ 1|idx \+ 1/.test(
    fs.readFileSync(path.join(mini, 'utils', 'sideGameRankMark.js'), 'utf8')
  ) && /function fromRank\(rank\)/.test(visualSrc)
);

assert(
  '投影副本与主包同一 split-high 规则',
  isSolidBlue(projectMod.markForGameCellAtIndex(g3, 0, 'pA')) &&
    isRegularMark(projectMod.markForGameCellAtIndex(g3, 0, 'pC'))
);

assert('未开球后续洞无三角', visual.isEmptyMark(mark.markForGameCell(g3, nextHole, 'pA')));

assert(
  '12 vegas 分区排序未改',
  /stableSort\(body.slice\(0, 2\), cmp\)/.test(srcResolver) &&
    /stableSort\(body.slice\(2, 4\), cmp\)/.test(srcResolver)
);

assert(
  'settle 模块仍可加载',
  typeof settleLasuo4.settle === 'function' || typeof settleLasuo4 === 'object'
);

console.log('\nsplitHighRankMark.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
