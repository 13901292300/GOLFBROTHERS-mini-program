/**
 * 沙盒 listScorePad 三角 vs 主体适配后实现：同一成绩序列逐洞 triColor 必须一致。
 * 运行：node scripts/sideGameRankPadParity.selftest.js
 */
var path = require('path');

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

var sandboxSettle = require('../../04-游戏沙盒/miniprogram/subpackages/game/utils/settle.js');
var sandboxCatalog = require('../../04-游戏沙盒/miniprogram/subpackages/game/utils/catalog.js');
var officialProj = require('../miniprogram/subpackages/game/utils/rankMarkProjection.js');
var officialSettle = require('../miniprogram/subpackages/game/utils/settle.js');
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
  return sandboxCatalog.HOLES.map(function (label) {
    return { label: label, on: true };
  });
}

function parsOf(game) {
  var out = {};
  holeLabels(game).forEach(function (label) {
    out[label] = 4;
  });
  return out;
}

function holeLabels(game) {
  if (game.holeOrder && game.holeOrder.length) return game.holeOrder.slice();
  return sandboxCatalog.HOLES.slice();
}

function sandboxGameOrderForHole(game, label) {
  var frozen =
    game &&
    game.holeResults &&
    game.holeResults.orderByHole &&
    game.holeResults.orderByHole[label];
  if (frozen && frozen.length) return frozen.map(String);
  var labels = holeLabels(game);
  var start = '';
  var i;
  for (i = 0; i < labels.length; i++) {
    if (sandboxSettle.holeOn(game, labels[i])) {
      start = String(labels[i]);
      break;
    }
  }
  if (String(label) === start) {
    var order = ((game && game.playerOrder) || []).map(String).filter(Boolean);
    if (order.length) return order;
    return ((game && game.players) || [])
      .map(function (item) {
        return item && item.id != null ? String(item.id) : '';
      })
      .filter(Boolean);
  }
  return null;
}

function sandboxColor(game, label, playerId) {
  var id = sandboxSettle.catalogIdOf(game);
  if (!sandboxCatalog.usesRankMark(id)) return '';
  var inGame = ((game && game.players) || []).some(function (item) {
    return String(item.id) === String(playerId);
  });
  if (!inGame) return '';
  if (!sandboxSettle.holeOn(game, label)) return '';
  var order = sandboxGameOrderForHole(game, label);
  if (!order || !order.length) return '';
  var idx = order.indexOf(String(playerId));
  if (idx < 0) return '';
  if (sandboxCatalog.isLasuoN(id)) return sandboxSettle.lasuoNTriColor(game, order, playerId);
  if (sandboxCatalog.isHorn(id)) return sandboxSettle.hornTriColor(game, order, playerId);
  return sandboxCatalog.rankTriColor(id, order.length, game.groupMode, idx, game.dizhuboMode);
}

function sandboxPad(game, relScores) {
  var g = JSON.parse(JSON.stringify(game));
  g.holeResults = sandboxSettle.settleGame(g, {
    scores: relScores,
    holeOrder: holeLabels(g),
    pars: parsOf(g),
    windOn: false
  });
  var pids = (g.players || []).map(function (p) {
    return String(p.id);
  });
  return pids.map(function (pid) {
    return holeLabels(g).map(function (label) {
      return sandboxColor(g, label, pid);
    });
  });
}

function officialPad(record, relScores) {
  global.__gb_side_games = [JSON.parse(JSON.stringify(record))];
  var projection = officialProj.project({
    matchId: record.matchId,
    groupId: record.groupId,
    relScores: relScores
  });
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

function padTones(pad) {
  return (pad || []).map(function (row) {
    return (row || []).map(toneCell);
  });
}

function samePad(a, b) {
  return JSON.stringify(padTones(a)) === JSON.stringify(padTones(b));
}

function lasuoRecord(groupMode) {
  var players = [{ id: 'pA' }, { id: 'pB' }, { id: 'pC' }, { id: 'pD' }];
  var instance = {
    catalogId: 'lasuo-4',
    players: players,
    playerOrder: ['pA', 'pB', 'pC', 'pD'],
    groupMode: groupMode,
    holes: holesOn(),
    holeOrder: sandboxCatalog.HOLES.slice()
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

function compareSeq(name, record, game, completeCount, vals) {
  var rel = fillRel(game, completeCount, vals);
  var sb = sandboxPad(game, rel);
  var of = officialPad(record, rel);
  assert(name, samePad(sb, of), JSON.stringify({ sb: sb, of: of }).slice(0, 400));
}

compareSeq('初始开球洞', recRandom, gameRandom, 0, randomVals);
compareSeq('完成第1洞 → 第2洞', recRandom, gameRandom, 1, randomVals);
compareSeq('完成第2洞 → 第3洞', recRandom, gameRandom, 2, randomVals);
compareSeq('连续完成到第5洞', recRandom, gameRandom, 5, randomVals);

var rel5 = fillRel(gameRandom, 5, randomVals);
var relClear2 = JSON.parse(JSON.stringify(rel5));
delete relClear2.A2;
var ofClear2 = officialPad(recRandom, relClear2);
var afterGapEmpty = ofClear2.every(function (row) {
  return row.slice(2).every(function (c) {
    return !c;
  });
});
assert(
  '清除第2洞后缺口之后正式格全空',
  afterGapEmpty && toneCell(ofClear2[0][0]) === toneCell(sandboxPad(gameRandom, relClear2)[0][0])
);

var relFill2 = JSON.parse(JSON.stringify(relClear2));
relFill2.A2 = { pA: 1, pB: 0, pC: 2, pD: 1 };
assert(
  '补录第2洞后向后恢复',
  samePad(sandboxPad(gameRandom, relFill2), officialPad(recRandom, relFill2))
);

var relEdit = JSON.parse(JSON.stringify(rel5));
relEdit.A2 = { pA: -1, pB: 2, pC: 0, pD: 1 };
assert(
  '修改第2洞旧成绩',
  samePad(sandboxPad(gameRandom, relEdit), officialPad(recRandom, relEdit))
);

var recFixed = lasuoRecord('fixed');
var gameFixed = lasuoGame('fixed');
compareSeq('固序连续5洞', recFixed, gameFixed, 5, randomVals);

var nPlayers = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }];
var lasuoNInst = {
  catalogId: 'lasuo-n',
  players: nPlayers,
  playerOrder: ['a', 'b', 'c', 'd', 'e', 'f'],
  sortUpdate: 'random',
  formation: 'jianghu',
  holes: holesOn(),
  holeOrder: sandboxCatalog.HOLES.slice()
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
compareSeq('拉丝N 连续5洞', recN, gameN, 5, nVals);

var hornPlayers = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
var hornInst = {
  catalogId: 'horn',
  players: hornPlayers,
  playerOrder: ['a', 'b', 'c', 'd', 'e'],
  formation: 'jianghu',
  holes: holesOn(),
  holeOrder: sandboxCatalog.HOLES.slice()
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
compareSeq('喇叭花 连续5洞含轮空', recHorn, gameHorn, 5, hornVals);

global.__gb_side_games = [];
var emptyProj = officialProj.project({
  matchId: 'm-parity',
  groupId: 'casual-match-g1',
  relScores: {}
});
assert(
  '删除游戏后三角全空',
  officialProj.colorAt(emptyProj, 'pA', 0) === '' && officialProj.colorAt(emptyProj, 'pA', 2) === ''
);

assert(
  '主体 settle 只在 game 分包',
  typeof officialSettle.settleGame === 'function' &&
    typeof sandboxSettle.settleGame === 'function'
);

var fs = require('fs');
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
  'scoring 异步引用 rank-mark-engine',
  /rank-mark-engine/.test(scoreJson) &&
    /componentPlaceholder/.test(scoreJson) &&
    /wx:if="\{\{rankMarkEngineOn\}\}"/.test(scoreWxml)
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

global.__gb_side_games = [JSON.parse(JSON.stringify(recRandom))];
assert(
  '有分边游戏时检测为真',
  officialMark.hasRankMarkGames({ matchId: 'm-parity', groupId: 'casual-match-g1' }) === true
);
global.__gb_side_games = [
  {
    matchId: 'm-parity',
    groupId: 'casual-match-g1',
    status: 'active',
    ruleId: 'stroke-2',
    config: { instance: { catalogId: 'stroke-2' } }
  }
];
assert(
  '无分边游戏时检测为假',
  officialMark.hasRankMarkGames({ matchId: 'm-parity', groupId: 'casual-match-g1' }) === false
);
assert('记分页按 hasRankMarkGames 决定实例化', /hasRankMarkGames/.test(scoreJs) && /rankMarkEngineOn/.test(scoreJs));

var engineJs = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'components', 'rank-mark-engine', 'index.js'),
  'utf8'
);
assert('计算组件调用 project 并回传', /project\.project/.test(engineJs) && /rankmarkchange/.test(engineJs));
assert('组件失败回传空投影', /ok: false/.test(engineJs) && /projection: \{\}/.test(engineJs));
assert('换 match/group 清除旧投影', /_rankMarkScopeKey/.test(scoreJs) && /replaceRankMarkProjection\(page, \{\}\)/.test(scoreJs));
assert('组件失败不影响正式记分', /onRankMarkChange/.test(scoreJs) && scoreJs.indexOf('player.scores[') >= 0);

console.log('\nsideGameRankPadParity.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
