/**
 * 记分页三角：完整 18 洞投影替换，禁止稀疏合并残留。
 * 运行：node scripts/scoreRankMarkReplace.selftest.js
 */
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

var fs = require('fs');
var path = require('path');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var mark = require('../miniprogram/utils/sideGameRankMark.js');
var scoreRank = require('../miniprogram/subpackages/scoring/utils/scoreRankMark.js');
var projectMod = require('../miniprogram/subpackages/game/utils/rankMarkProjection.js');
var coord = require('../miniprogram/subpackages/game/utils/sideGameSettleCoordinator.js');

function settleThenProject(input) {
  coord.settleSideGamesForScoreMutation(input);
  return projectMod.project(input);
}

var mini = path.join(__dirname, '..', 'miniprogram');
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

function filledScores(n) {
  var a = [];
  var i;
  for (i = 0; i < 18; i++) a.push(i < n ? 4 : '');
  return a;
}

function makeRecord() {
  return {
    matchId: 'm-replace',
    groupId: 'g1',
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
}

function officialInput(scoresByPid) {
  return {
    matchId: 'm-replace',
    groupId: 'g1',
    pars: catalog.HOLES.map(function () {
      return 4;
    }),
    players: fourPlayers().map(function (p) {
      return { playerId: p.id, scores: scoresByPid[p.id] || filledScores(0) };
    })
  };
}

function makeCells(projection, pid) {
  var cells = [];
  var hi;
  for (hi = 0; hi < 18; hi++) {
    cells.push({
      type: 'hole',
      holeIndex: hi,
      triColor: mark.colorFromProjection(projection, pid, hi)
    });
  }
  return cells;
}

function holeColors(cells) {
  return (cells || []).map(function (c) {
    return c && c.triColor ? '1' : '';
  });
}

function holeEmpty(cell) {
  return !(cell && (cell.triColor || cell.triangleClass || cell.hasWaist));
}

function allEmptyFrom(cells, fromHi) {
  var i;
  for (i = fromHi; i < 18; i++) {
    if (!holeEmpty(cells[i])) return false;
  }
  return true;
}

var scoreJs = fs.readFileSync(path.join(mini, 'subpackages/scoring/pages/score/index.js'), 'utf8');
var projJs = fs.readFileSync(
  path.join(mini, 'subpackages/game/utils/rankMarkProjection.js'),
  'utf8'
);

assert(
  '不与旧 projection Object.assign 合并',
  !/Object\.assign\(\s*this\._rankMarkProjection/.test(scoreJs) &&
    /replaceRankMarkProjection/.test(scoreJs) &&
    /completeProjection/.test(scoreJs)
);
assert(
  'onRankMarkChange 成功时不以 engine 覆盖 storage',
  /onRankMarkChange/.test(scoreJs) &&
    !/replaceRankMarkProjection\(this, d\.projection/.test(scoreJs)
);
assert(
  '成绩成功写入后调用 side-game settle',
  /_settleSideGamesAfterScoreMutation/.test(scoreJs) &&
    /_afterScoresPersisted[\s\S]{0,400}_settleSideGamesAfterScoreMutation/.test(scoreJs)
);
assert('刷新前 blankThenPaint cells', /blankThenPaintCells/.test(scoreJs));
assert('首屏同步 projectFromStorage', /projectFromStorage\(official\)/.test(scoreJs));
assert(
  'scope 切换不先清空投影',
  !/_rankMarkScopeKey !== scopeKey[\s\S]{0,180}replaceRankMarkProjection\(page, \{\}/.test(scoreJs)
);
assert('投影写入全部 18 洞含空 mark', /holes\[String\(hi\)\] = visual\.normalizeMark/.test(projJs));
assert('rankMarkProjection 不再 emitGuard/persist 写盘', !/engineEmitGuard/.test(projJs) && !/persistWanted/.test(projJs));

global.__gb_side_games = [makeRecord()];
var filled5 = {
  pA: filledScores(5),
  pB: filledScores(5),
  pC: filledScores(5),
  pD: filledScores(5)
};
var proj5 = settleThenProject(officialInput(filled5));
var keys5 = Object.keys(proj5.pA || {});
assert(
  '完整投影每个 player 都有 0..17',
  keys5.length === 18 &&
    ['0', '1', '2', '3', '4', '17'].every(function (k) {
      return Object.prototype.hasOwnProperty.call(proj5.pA, k);
    })
);

var cells5 = makeCells(proj5, 'pA');
assert(
  '1. 洞1–5 连续完整有三角',
  cells5[0].triColor &&
    cells5[1].triColor &&
    cells5[2].triColor &&
    cells5[3].triColor &&
    cells5[4].triColor,
  holeColors(cells5).join('')
);

var sparseKeep = {};
Object.keys(proj5.pA).forEach(function (k) {
  if (proj5.pA[k]) sparseKeep[k] = proj5.pA[k];
});
var afterClearHole2Scores = {
  pA: filledScores(5),
  pB: filledScores(5),
  pC: filledScores(5),
  pD: filledScores(5)
};
afterClearHole2Scores.pA[1] = '';
afterClearHole2Scores.pB[1] = '';
afterClearHole2Scores.pC[1] = '';
afterClearHole2Scores.pD[1] = '';

global.__gb_side_games = [makeRecord()];
var projAfter = settleThenProject(officialInput(afterClearHole2Scores));
var completeAfter = mark.completeProjection(projAfter, ['pA', 'pB', 'pC', 'pD']);

var staleMerged = Object.assign({}, sparseKeep);
Object.keys(projAfter.pA || {}).forEach(function (k) {
  if (projAfter.pA[k]) staleMerged[k] = projAfter.pA[k];
  else if (projAfter.pA[k] === '') {
    /* sparse 旧实现不会写空键，缺失键沿用 staleMerged */
  }
});
assert(
  '稀疏合并会留下洞3+旧色（对照 bug）',
  !!(staleMerged['2'] || staleMerged['3'] || staleMerged['4']) ||
    Object.keys(sparseKeep).length > Object.keys(projAfter.pA).filter(function (k) {
      return projAfter.pA[k];
    }).length
);

assert(
  '3. 新完整投影洞3–18 为空',
  mark.colorFromProjection(completeAfter, 'pA', 2) === '' &&
    mark.colorFromProjection(completeAfter, 'pA', 3) === '' &&
    mark.colorFromProjection(completeAfter, 'pA', 4) === '' &&
    mark.colorFromProjection(completeAfter, 'pA', 17) === '' &&
    !mark.markFromProjection(completeAfter, 'pA', 2).hasWaist &&
    !mark.markFromProjection(completeAfter, 'pA', 17).triangleClass
);

var paintedOld = makeCells(proj5, 'pA');
var paintedNew = mark.blankThenPaintCells(paintedOld, 'pA', completeAfter);
assert(
  '4. 页面 cells 洞3/4/5 实际 triColor 为空',
  paintedNew[2].triColor === '' &&
    paintedNew[3].triColor === '' &&
    paintedNew[4].triColor === '' &&
    paintedNew[2].hasWaist === false &&
    paintedNew[17].hasWaist === false &&
    paintedNew[2].triangleClass === ''
);
assert('4. 洞6–18 页面 cells 全空', allEmptyFrom(paintedNew, 2));
assert(
  '5. 洞1 按当前沙盒结果保留',
  paintedNew[0].triColor === mark.colorFromProjection(completeAfter, 'pA', 0) &&
    !!paintedNew[0].triColor
);

global.__gb_side_games = [makeRecord()];
var restored = settleThenProject(officialInput(filled5));
var paintedRestored = mark.blankThenPaintCells(paintedNew, 'pA', mark.completeProjection(proj5, ['pA']));
assert(
  '6. 补全洞2 后后续三角恢复',
  paintedRestored[1].triColor && paintedRestored[2].triColor && paintedRestored[4].triColor
);

global.__gb_side_games = [makeRecord()];
var clearHole1 = {
  pA: filledScores(5),
  pB: filledScores(5),
  pC: filledScores(5),
  pD: filledScores(5)
};
clearHole1.pA[0] = '';
clearHole1.pB[0] = '';
clearHole1.pC[0] = '';
clearHole1.pD[0] = '';
var projClear1 = mark.completeProjection(settleThenProject(officialInput(clearHole1)), ['pA']);
var paintedClear1 = mark.blankThenPaintCells(cells5, 'pA', projClear1);
assert('7. 清除洞1 后洞2–18 旧三角清除', allEmptyFrom(paintedClear1, 1));

global.__gb_side_games = [makeRecord()];
var clearMid = {
  pA: filledScores(5),
  pB: filledScores(5),
  pC: filledScores(5),
  pD: filledScores(5)
};
clearMid.pA[2] = '';
clearMid.pB[2] = '';
clearMid.pC[2] = '';
clearMid.pD[2] = '';
clearMid.pA[3] = '';
clearMid.pB[3] = '';
clearMid.pC[3] = '';
clearMid.pD[3] = '';
var projTwoGap = mark.completeProjection(settleThenProject(officialInput(clearMid)), ['pA']);
var paintedGap = mark.blankThenPaintCells(cells5, 'pA', projTwoGap);
assert(
  '8. 连续清除两个中间洞无跨缺口残留',
  paintedGap[4].triColor === '' &&
    paintedGap[5].triColor === '' &&
    paintedGap[17].triColor === ''
);

var flipped = mark.completeProjection({ pA: { '0': mark.TRI_RED } }, ['pA']);
var afterFlip = mark.blankThenPaintCells(cells5, 'pA', flipped);
assert(
  '9. 颜色变化时旧色被替换',
  afterFlip[0].triangleClass === 'triangle-red' &&
    afterFlip[0].triColor === mark.VIS_RED &&
    afterFlip[1].triColor === '' &&
    afterFlip[1].hasWaist === false
);

var emptyAll = mark.completeProjection({}, ['pA', 'pB']);
var paintedFail = mark.blankThenPaintCells(cells5, 'pA', emptyAll);
assert(
  '10. 失败/无游戏时 18 洞全空',
  allEmptyFrom(paintedFail, 0) && mark.colorFromProjection(emptyAll, 'pA', 0) === ''
);

global.__gb_side_games = [makeRecord()];
assert(
  '11. 完整投影与 colorAt 一致',
  projectMod.colorAt(proj5, 'pA', 0) === mark.colorFromProjection(proj5, 'pA', 0) &&
    projectMod.colorAt(completeAfter, 'pA', 2) === ''
);

var summary = [];
var hi;
for (hi = 0; hi < 18; hi++) {
  summary.push(hi + ':' + (paintedNew[hi].triColor ? 'T' : '-'));
}
assert(
  '清洞2后 18 洞摘要仅洞1有三角或按沙盒',
  paintedNew[2].triColor === '' && paintedNew[17].triColor === '',
  summary.join(',')
);

console.log('清洞2后18洞 triColor 摘要 ' + summary.join(' '));

console.log('\nscoreRankMarkReplace.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
