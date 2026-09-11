/**
 * 记分页红蓝三角：主体 project/colorAt 随成绩序列推进、缺口截断、补录恢复。
 * 运行：node scripts/sideGameRankPadParity.selftest.js
 */
var path = require('path');
var fs = require('fs');

if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return global.__gb_side_games || [];
    },
    setStorageSync: function (key, value) {
      global.__gb_side_games = value;
    }
  };
}

var officialSettle = require('../miniprogram/subpackages/game/utils/settle.js');
var bind = require('./sideGameRepoTestBind.js');
var officialCatalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var officialProj = require('../miniprogram/subpackages/game/utils/rankMarkProjection.js');
var coord = require('../miniprogram/subpackages/game/utils/sideGameSettleCoordinator.js');
var officialMark = require('../miniprogram/utils/sideGameRankMark.js');
var visual = require('../miniprogram/utils/rankMarkVisual.js');

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
  return officialCatalog.HOLES.map(function (label) {
    return { label: label, on: true };
  });
}

function holeLabels(game) {
  if (game.holeOrder && game.holeOrder.length) return game.holeOrder.slice();
  return officialCatalog.HOLES.slice();
}

function officialPad(record, relScores) {
  bind.seed([JSON.parse(JSON.stringify(record))]);
  var official = {
    matchId: record.matchId,
    groupId: record.groupId,
    relScores: relScores
  };
  coord.settleSideGamesForScoreMutation(official);
  var projection = officialProj.project(official);
  var game = officialProj.recordToGame(record);
  var pids = (game.players || []).map(function (p) {
    return String(p.id);
  });
  return pids.map(function (pid) {
    return holeLabels(game).map(function (label, hi) {
      return officialProj.colorAt(projection, pid, hi);
    });
  });
}

function fillRel(game, completeCount, valuesByPlayer) {
  var labels = holeLabels(game);
  var out = {};
  var n = completeCount == null ? 0 : completeCount;
  labels.forEach(function (label, i) {
    if (i >= n) return;
    out[label] = {};
    Object.keys(valuesByPlayer).forEach(function (pid) {
      var arr = valuesByPlayer[pid];
      var v = Array.isArray(arr) ? arr[i] : arr;
      if (v == null || v === '') return;
      out[label][pid] = Number(v);
    });
  });
  return out;
}

function toneCell(c) {
  if (c && typeof c === 'object') return visual.toneOfMark(c);
  return visual.toneOfColor(c);
}

function hasTone(c) {
  return !!toneCell(c);
}

function unfinishedEmpty(pad, completeCount) {
  return (pad || []).every(function (row) {
    return (row || []).slice(completeCount).every(function (c) {
      return !hasTone(c);
    });
  });
}

function anyMark(pad, start, end) {
  return (pad || []).some(function (row) {
    return (row || []).slice(start, end).some(hasTone);
  });
}

function lasuoRecord(groupMode) {
  var players = [{ id: 'pA' }, { id: 'pB' }, { id: 'pC' }, { id: 'pD' }];
  var instance = {
    catalogId: 'lasuo-4',
    players: players,
    playerOrder: ['pA', 'pB', 'pC', 'pD'],
    groupMode: groupMode,
    holes: holesOn(),
    holeOrder: officialCatalog.HOLES.slice()
  };
  return {
    matchId: 'm-parity',
    groupId: 'casual-match-g1',
    status: 'active',
    ruleId: 'lasuo-4',
    config: { instance: instance }
  };
}

function lasuoGame(groupMode) {
  return officialProj.recordToGame(lasuoRecord(groupMode));
}

var randomVals = {
  pA: [0, 1, -1, 0, 2, 0],
  pB: [1, 0, 0, 1, 1, 1],
  pC: [0, 2, 1, -1, 0, 0],
  pD: [2, 1, 0, 0, 1, 2]
};

var recRandom = lasuoRecord('random');
var gameRandom = lasuoGame('random');

function assertSeq(name, record, game, completeCount, vals) {
  var rel = fillRel(game, completeCount, vals);
  var of = officialPad(record, rel);
  var nPlayers = (game.players || []).length;
  assert(
    name,
    Array.isArray(of) && of.length === nPlayers && of[0] && of[0].length === holeLabels(game).length
  );
}

assertSeq('初始开球洞', recRandom, gameRandom, 0, randomVals);
assertSeq('完成第1洞 → 第2洞', recRandom, gameRandom, 1, randomVals);
assertSeq('完成第2洞 → 第3洞', recRandom, gameRandom, 2, randomVals);
assertSeq('连续完成到第5洞', recRandom, gameRandom, 5, randomVals);
assert(
  '连续完成到第5洞后出现三角',
  anyMark(officialPad(recRandom, fillRel(gameRandom, 5, randomVals)), 0, 5)
);

var rel5 = fillRel(gameRandom, 5, randomVals);
var relClear2 = JSON.parse(JSON.stringify(rel5));
delete relClear2.A2;
var ofClear2 = officialPad(recRandom, relClear2);
var afterGapEmpty = ofClear2.every(function (row) {
  return row.slice(2).every(function (c) {
    return !hasTone(c);
  });
});
assert('清除第2洞后缺口之后正式格全空', afterGapEmpty);
assert('清除第2洞后第1洞仍有三角', hasTone(ofClear2[0][0]));

var relFill2 = JSON.parse(JSON.stringify(relClear2));
relFill2.A2 = { pA: 1, pB: 0, pC: 2, pD: 1 };
var ofFill2 = officialPad(recRandom, relFill2);
assert(
  '补录第2洞后向后恢复',
  anyMark(ofFill2, 0, 5)
);

var relEdit = JSON.parse(JSON.stringify(rel5));
relEdit.A2 = { pA: -1, pB: 2, pC: 0, pD: 1 };
var ofEdit = officialPad(recRandom, relEdit);
var ofOrig = officialPad(recRandom, rel5);
assert(
  '修改第2洞后仍保持已完成洞有三角',
  anyMark(ofEdit, 0, 5)
);
assert(
  '修改第2洞后三角投影变化',
  JSON.stringify(ofEdit.map(function (row) { return row.map(toneCell); })) !==
    JSON.stringify(ofOrig.map(function (row) { return row.map(toneCell); }))
);

var recFixed = lasuoRecord('fixed');
var gameFixed = lasuoGame('fixed');
assertSeq('固序连续5洞', recFixed, gameFixed, 5, randomVals);
assert('固序连续5洞后出现三角', anyMark(officialPad(recFixed, fillRel(gameFixed, 5, randomVals)), 0, 5));

var nPlayers = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }];
var lasuoNInst = {
  catalogId: 'lasuo-n',
  players: nPlayers,
  playerOrder: ['a', 'b', 'c', 'd', 'e', 'f'],
  sortUpdate: 'random',
  formation: 'jianghu',
  holes: holesOn(),
  holeOrder: officialCatalog.HOLES.slice()
};
var recN = {
  matchId: 'm-n',
  groupId: 'g-n',
  status: 'active',
  ruleId: 'lasuo-n',
  config: { instance: lasuoNInst }
};
var gameN = officialProj.recordToGame(recN);
var nVals = {
  a: [0, 1, 0, 1, 0],
  b: [1, 0, 1, 0, 1],
  c: [0, 0, 1, 1, 0],
  d: [1, 1, 0, 0, 1],
  e: [2, 1, 2, 1, 2],
  f: [0, 2, 0, 2, 0]
};
assertSeq('拉丝N 连续5洞', recN, gameN, 5, nVals);
assert('拉丝N 连续5洞后出现三角', anyMark(officialPad(recN, fillRel(gameN, 5, nVals)), 0, 5));

var hornPlayers = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
var hornInst = {
  catalogId: 'horn',
  players: hornPlayers,
  playerOrder: ['a', 'b', 'c', 'd', 'e'],
  formation: 'jianghu',
  holes: holesOn(),
  holeOrder: officialCatalog.HOLES.slice()
};
var recHorn = {
  matchId: 'm-h',
  groupId: 'g-h',
  status: 'active',
  ruleId: 'horn',
  config: { instance: hornInst }
};
var gameHorn = officialProj.recordToGame(recHorn);
var hornVals = {
  a: [0, 1, 0, 1, 0],
  b: [1, 0, 1, 0, 1],
  c: [0, 0, 1, 1, 0],
  d: [1, 1, 0, 0, 1],
  e: [2, 1, 2, 1, 2]
};
assertSeq('喇叭花 连续5洞含轮空', recHorn, gameHorn, 5, hornVals);
assert(
  '喇叭花 连续5洞后出现三角或轮空截断',
  anyMark(officialPad(recHorn, fillRel(gameHorn, 5, hornVals)), 0, 5)
);

bind.seed([]);
var emptyProj = officialProj.project({
  matchId: 'm-parity',
  groupId: 'casual-match-g1',
  relScores: {}
});
assert(
  '删除游戏后三角全空',
  officialProj.colorAt(emptyProj, 'pA', 0) === '' && officialProj.colorAt(emptyProj, 'pA', 2) === ''
);

assert('主体 settle 只在 game 分包', typeof officialSettle.settleGame === 'function');

var scoringRoot = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'scoring');
var scoreJs = fs.readFileSync(path.join(scoringRoot, 'pages', 'score', 'index.js'), 'utf8');
var scoreJson = fs.readFileSync(path.join(scoringRoot, 'pages', 'score', 'index.json'), 'utf8');
var scoreWxml = fs.readFileSync(path.join(scoringRoot, 'pages', 'score', 'index.wxml'), 'utf8');
var mainUtils = path.join(__dirname, '..', 'miniprogram', 'utils');
assert('scoring JS 不 require game 分包', scoreJs.indexOf('subpackages/game/') < 0);
assert(
  'scoring WXSS 不引用 game',
  fs.readFileSync(path.join(scoringRoot, 'pages', 'score', 'index.wxss'), 'utf8').indexOf('subpackages/game') < 0
);
assert(
  'scoring 异步引用 side-game-settle-host',
  /side-game-settle-host/.test(scoreJson) &&
    /componentPlaceholder/.test(scoreJson) &&
    /id="sideGameSettleHost"/.test(scoreWxml)
);
assert(
  '主包无 sideGameSettle 副本',
  !fs.existsSync(path.join(mainUtils, 'sideGameSettle'))
);
assert(
  'settle 实现只在 game 分包一份',
  fs.existsSync(path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils', 'settleLasuo4.js')) &&
    fs.readFileSync(
      path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils', 'settle.js'),
      'utf8'
    ).indexOf('settleLasuo4') >= 0
);

bind.seed([JSON.parse(JSON.stringify(recRandom))]);
assert(
  '有分边游戏时检测为真',
  officialMark.hasRankMarkGames({ matchId: 'm-parity', groupId: 'casual-match-g1' }) === true
);
bind.seed([
  {
    matchId: 'm-parity',
    groupId: 'casual-match-g1',
    status: 'active',
    ruleId: 'stroke-2',
    config: { instance: { catalogId: 'stroke-2' } }
  }
]);
assert(
  '无分边游戏时检测为假',
  officialMark.hasRankMarkGames({ matchId: 'm-parity', groupId: 'casual-match-g1' }) === false
);
assert('记分页按 hasRankMarkGames 决定着色', /hasRankMarkGames/.test(scoreJs) && /projectFromStorage/.test(scoreJs));

var engineJs = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'components', 'rank-mark-engine', 'index.js'),
  'utf8'
);
var hostJs = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'components', 'side-game-settle-host', 'index.js'),
  'utf8'
);
assert('rank-mark-engine 只 project 不 saveRecords', /project\.project/.test(engineJs) && engineJs.indexOf('saveRecords') < 0);
assert('settle-host 只提供显式 settleForOfficial', /settleForOfficial/.test(hostJs));
assert('换 match/group 清除旧投影', /_rankMarkScopeKey/.test(scoreJs) && /replaceRankMarkProjection\(page, \{\}\)/.test(scoreJs));
assert('组件失败不影响正式记分', /_afterScoresPersisted/.test(scoreJs) && /persistSession/.test(scoreJs));

console.log('\nsideGameRankPadParity.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
