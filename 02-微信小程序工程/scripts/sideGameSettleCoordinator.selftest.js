/**
 * Side-game settlement 与三角投影职责分离。
 * 运行：node scripts/sideGameSettleCoordinator.selftest.js
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
var bind = require('./sideGameRepoTestBind.js');
var mark = require('../miniprogram/utils/sideGameRankMark.js');
var projectMod = require('../miniprogram/subpackages/game/utils/rankMarkProjection.js');
var coord = require('../miniprogram/subpackages/game/utils/sideGameSettleCoordinator.js');
var scoreSettle = require('../miniprogram/subpackages/scoring/utils/scoreSideGameSettle.js');

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

function makeRecord(ruleId) {
  return {
    matchId: 'm-coord',
    groupId: 'g1',
    status: 'active',
    ruleId: ruleId,
    resultRevision: 0,
    participantParties: fourPlayers().map(function (p) {
      return { partyId: p.id, partyType: 'player', memberPlayerIds: [p.id] };
    }),
    config: {
      instance: {
        catalogId: ruleId,
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
    matchId: 'm-coord',
    groupId: 'g1',
    pars: catalog.HOLES.map(function () {
      return 4;
    }),
    holeLabels: catalog.HOLES.slice(),
    players: fourPlayers().map(function (p) {
      return {
        playerId: p.id,
        scores: (scoresByPid && scoresByPid[p.id]) || filledScores(5)
      };
    })
  };
}

function freeze(row) {
  return {
    resultRevision: Number(row.resultRevision) || 0,
    resultSnapshot: JSON.stringify(row.resultSnapshot || null),
    orderByHole: JSON.stringify((row.resultSnapshot && row.resultSnapshot.orderByHole) || null)
  };
}

function hole0(proj) {
  return JSON.stringify(
    ['pA', 'pB', 'pC', 'pD'].map(function (id) {
      var m = mark.markFromProjection(proj, id, 0);
      return { id: id, cls: (m && m.triangleClass) || '', waist: !!(m && m.hasWaist) };
    })
  );
}

function holeN(proj, hi) {
  return JSON.stringify(
    ['pA', 'pB', 'pC', 'pD'].map(function (id) {
      var m = mark.markFromProjection(proj, id, hi);
      return { id: id, cls: (m && m.triangleClass) || '', waist: !!(m && m.hasWaist) };
    })
  );
}

var scores5 = {
  pA: filledScores(5),
  pB: filledScores(5),
  pC: filledScores(5),
  pD: filledScores(5)
};

coord.resetSettleCallCount();
bind.seed([makeRecord('lasuo-4')]);
var input = officialInput(scores5);
coord.settleSideGamesForScoreMutation(input);
var afterFirst = freeze(bind.row0('m-coord'));
var marks1 = hole0(mark.completeProjection(mark.projectFromStorage(input), ['pA', 'pB', 'pC', 'pD']));
assert('CASE5 真实成绩变化 coordinator 执行', coord.getSettleCallCount() === 1);
assert('CASE5 revision +1', afterFirst.resultRevision === 1);

var i;
for (i = 0; i < 10; i++) {
  projectMod.project(input);
  mark.projectFromStorage(input);
}
assert(
  'CASE1 进入/投影 10 次不改 snapshot',
  freeze(bind.row0('m-coord')).resultRevision === afterFirst.resultRevision &&
    freeze(bind.row0('m-coord')).resultSnapshot === afterFirst.resultSnapshot &&
    freeze(bind.row0('m-coord')).orderByHole === afterFirst.orderByHole
);
assert('CASE1 triangle 完全一致', hole0(mark.completeProjection(mark.projectFromStorage(input), ['pA', 'pB', 'pC', 'pD'])) === marks1);

assert('CASE2 头像无关：投影不读 avatar', projectMod.project.toString().indexOf('avatar') < 0);
assert('CASE3 refreshPlayers 等价 project 不写盘', coord.getSettleCallCount() === 1);

var beforeTab = freeze(bind.row0('m-coord'));
projectMod.project(input);
assert('CASE4 切 TAB 不 settle', coord.getSettleCallCount() === 1 && freeze(bind.row0('m-coord')).resultRevision === beforeTab.resultRevision);

var nextLabel = catalog.HOLES[projectMod.lastCompleteHoleIndex(input) + 1];
var beforeNext = (bind.row0('m-coord').resultSnapshot.orderByHole || {})[nextLabel];
var changed = {
  pA: filledScores(5),
  pB: filledScores(5),
  pC: filledScores(5),
  pD: filledScores(5)
};
changed.pA[0] = 6;
var changedInput = officialInput(changed);
var callsBefore = coord.getSettleCallCount();
coord.settleSideGamesForScoreMutation(changedInput);
var afterPush = freeze(bind.row0('m-coord'));
var storageNext = (bind.row0('m-coord').resultSnapshot.orderByHole || {})[nextLabel];
var projNext = holeN(mark.completeProjection(mark.projectFromStorage(changedInput), ['pA', 'pB', 'pC', 'pD']), 1);
var engineNext = holeN(mark.completeProjection(projectMod.project(changedInput), ['pA', 'pB', 'pC', 'pD']), 1);
assert('CASE5/6 lasuo 成绩变化再 settle 一次', coord.getSettleCallCount() === callsBefore + 1);
assert('CASE6 orderByHole[N+1] 更新', JSON.stringify(storageNext) !== JSON.stringify(beforeNext));
assert('CASE6 triangle 与 storage 一致', projNext === engineNext);
assert('CASE6 revision 再 +1', afterPush.resultRevision === afterFirst.resultRevision + 1);

coord.resetSettleCallCount();
bind.seed([makeRecord('8421-4')]);
var input8421 = officialInput(scores5);
coord.settleSideGamesForScoreMutation(input8421);
assert('CASE7 8421 coordinator settle', coord.getSettleCallCount() === 1 && (bind.row0('m-coord').resultRevision || 0) === 1);
var marks8421 = hole0(mark.completeProjection(mark.projectFromStorage(input8421), ['pA', 'pB', 'pC', 'pD']));
assert('CASE7 8421 triangle 有值', marks8421.indexOf('triangle') >= 0);
var changed8421 = officialInput(scores5);
changed8421.players[0].scores[0] = 6;
coord.settleSideGamesForScoreMutation(changed8421);
assert('CASE7 8421 再 settle revision+1', (bind.row0('m-coord').resultRevision || 0) === 2);

coord.resetSettleCallCount();
bind.seed([makeRecord('lasuo-4')]);
var once = officialInput(scores5);
coord.settleSideGamesForScoreMutation(once);
var c1 = coord.getSettleCallCount();
projectMod.project(once);
projectMod.project(once);
assert('CASE8 project 不重复 settle', coord.getSettleCallCount() === c1);

var hostCalls = 0;
var fakeHost = {
  settleForOfficial: function (official) {
    hostCalls += 1;
    return coord.settleSideGamesForScoreMutation(official);
  }
};
coord.resetSettleCallCount();
bind.seed([makeRecord('lasuo-4')]);
scoreSettle.settleSideGamesForScoreMutation(officialInput(scores5), fakeHost);
assert('score adapter 经 host 只 settle 一次', hostCalls === 1 && coord.getSettleCallCount() === 1);

var scoreJs = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/scoring/pages/score/index.js'),
  'utf8'
);
var engineJs = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/components/rank-mark-engine/index.js'),
  'utf8'
);
var projJs = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/utils/rankMarkProjection.js'),
  'utf8'
);
assert('engine 不再 settle/persist', engineJs.indexOf('refreshGameResults') < 0 && engineJs.indexOf('saveRecords') < 0);
assert('projection.project 不 saveRecords', /function project\(input\)[\s\S]{0,400}refreshActiveGames/.test(projJs) && !/function project\(input\)[\s\S]{0,800}saveRecords/.test(projJs));
assert('score 唯一 mutation settle', (scoreJs.match(/_settleSideGamesAfterScoreMutation/g) || []).length >= 2);
assert('score 不 require game 分包路径', scoreJs.indexOf('subpackages/game/') < 0);
assert('refreshPlayers 不调用 coordinator', !/refreshPlayers\(\)[\s\S]{0,200}settleSideGamesForScoreMutation/.test(scoreJs));

console.log('\nsideGameSettleCoordinator.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
