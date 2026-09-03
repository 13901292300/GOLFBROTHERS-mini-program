/**
 * 17 种玩法迁移完整性：入口对照 + 沙盒/主体同输入结算一致。
 * 运行：node scripts/sideGameCatalogParity.selftest.js
 */
var fs = require('fs');
var path = require('path');

var proj = path.join(__dirname, '..');
var gameRoot = path.join(proj, 'miniprogram', 'subpackages', 'game');
var sandboxRoot = path.join(proj, '..', '04-游戏沙盒', 'miniprogram', 'subpackages', 'game');

if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {}
  };
}

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

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

var officialCatalog = require(path.join(gameRoot, 'utils', 'catalog.js'));
var officialSettle = require(path.join(gameRoot, 'utils', 'settle.js'));
var sandboxSettle = require(path.join(sandboxRoot, 'utils', 'settle.js'));
var sandboxCatalog = require(path.join(sandboxRoot, 'utils', 'catalog.js'));

var RULE_IDS = [];
(officialCatalog.CATALOG || []).forEach(function (g) {
  (g.items || []).forEach(function (item) {
    RULE_IDS.push(item.id);
  });
});
assert('主体 catalog 17', RULE_IDS.length === 17, String(RULE_IDS.length));

var sbIds = [];
(sandboxCatalog.CATALOG || []).forEach(function (g) {
  (g.items || []).forEach(function (item) {
    sbIds.push(item.id);
  });
});
assert('沙盒 catalog 17', sbIds.length === 17);
assert('catalog id 顺序一致', RULE_IDS.join(',') === sbIds.join(','));

var openIds = [];
officialCatalog.listCatalog(8).forEach(function (g) {
  (g.items || []).forEach(function (item) {
    openIds.push(item.id);
  });
});
assert('当前可用 16 种', openIds.length === 16, String(openIds.length));
assert('三局已开放', openIds.indexOf('three-set') >= 0 && !officialCatalog.isUnavailableRule('three-set'));
assert('油菜已开放', openIds.indexOf('youcai') >= 0 && !officialCatalog.isUnavailableRule('youcai'));
assert('斗小地主已开放', openIds.indexOf('landlord-small') >= 0 && !officialCatalog.isUnavailableRule('landlord-small'));
['skins'].forEach(function (id) {
  assert('未完成源码仍在 ' + id, RULE_IDS.indexOf(id) >= 0 && !!officialCatalog.findRule(id));
  assert('玩法目录隐藏 ' + id, openIds.indexOf(id) < 0);
  assert('未完成不可用标记 ' + id, officialCatalog.isUnavailableRule(id));
});

var SETTLE_FILES = [
  'settle.js',
  'settleCore.js',
  'settleStroke2.js',
  'settleMatch2.js',
  'settle8421.js',
  'settle8421Three.js',
  'settle8421Four.js',
  'settleLandlordBig.js',
  'settleLandlordMid.js',
  'settleLandlordSmall.js',
  'settleLandlordShared.js',
  'settleLasuo4.js',
  'settleThreeVsOne.js',
  'settleDizhubo4.js',
  'settleVegas.js',
  'settleLasuoN.js',
  'settleHorn.js',
  'settleThreeSet.js',
  'settleYoucai.js',
  'settlePot.js'
];
var TOP_HOLE_SETTLE_FILES = [
  'settleCore.js',
  'settleMatch2.js',
  'settle8421.js',
  'settle8421Three.js',
  'settle8421Four.js',
  'settleLandlordShared.js',
  'settleLasuo4.js',
  'settleThreeVsOne.js',
  'settleDizhubo4.js',
  'settleVegas.js',
  'settleLasuoN.js',
  'settleHorn.js'
];
SETTLE_FILES.forEach(function (name) {
  var a = read(sandboxRoot, 'utils/' + name);
  var b = read(gameRoot, 'utils/' + name);
  if (TOP_HOLE_SETTLE_FILES.indexOf(name) >= 0) {
    assert(
      '结算文件仅放行顶洞跟踪 ' + name,
      a !== b &&
        a.toLowerCase().indexOf('tophole') < 0 &&
        b.toLowerCase().indexOf('tophole') >= 0
    );
    return;
  }
  assert('结算文件未改写 ' + name, a === b);
});

var SETTLE_BRANCHES = [
  'stroke-2',
  'match-2',
  '8421-2',
  'landlord-big',
  'landlord-mid',
  'landlord-small',
  '8421-3',
  '8421-4',
  'lasuo-4',
  'three-vs-one',
  'dizhubo-4',
  'vegas',
  'lasuo-n',
  'horn',
  'three-set',
  'youcai'
];
var settleSrc = read(gameRoot, 'utils/settle.js');
SETTLE_BRANCHES.forEach(function (id) {
  assert('settle 分发 ' + id, settleSrc.indexOf('"' + id + '"') >= 0);
});

var UI_HELPERS = [
  ['pages/config/index.js', 'function buildPairs'],
  ['pages/config/index.js', 'function pairId'],
  ['pages/config/index.js', 'function twoPartyPairsPatch'],
  ['pages/config/index.js', 'function lasuoNPairMatches'],
  ['pages/config/index.js', 'function hornPairMatches'],
  ['pages/config/index.js', 'function orderPatch'],
  ['components/game-tab/index.js', 'function allowPairSubmenu'],
  ['components/game-tab/index.js', 'function onPairsOf'],
  ['components/game-tab/index.js', 'function mapGameItem']
];
UI_HELPERS.forEach(function (row) {
  assert('UI helper ' + row[1], read(gameRoot, row[0]).indexOf(row[1]) >= 0);
});

assert(
  'config 仍含沙盒 buildPairs 循环',
  /for \(let i = 0; i < selected.length; i\+\+\)/.test(read(gameRoot, 'pages/config/index.js')) &&
    /for \(let j = i \+ 1; j < selected.length; j\+\+\)/.test(read(gameRoot, 'pages/config/index.js'))
);

var INCLUDES = [
  'pages/config/hcap-lasuo.wxml',
  'pages/config/hcap-recv.wxml',
  'pages/config/hole-order-card.wxml',
  'pages/config/lasuo-n-block.wxml',
  'pages/config/name-edit.wxml',
  'pages/config/order-board.wxml',
  'pages/config/player-pick-block.wxml',
  'pages/config/rank-fold.wxml'
];
INCLUDES.forEach(function (rel) {
  assert('include ' + rel, fs.existsSync(path.join(gameRoot, rel)));
});

assert('无 session.js 文件', !fs.existsSync(path.join(gameRoot, 'utils', 'session.js')));
assert('无 host-frame', !fs.existsSync(path.join(gameRoot, 'components', 'host-frame')));
assert('无 score-pad', !fs.existsSync(path.join(gameRoot, 'components', 'score-pad')));

var bind = read(gameRoot, 'utils/sideGameBind.js');
assert('无假名单 PLAYERS_SCORE', bind.indexOf('PLAYERS_SCORE') < 0 && bind.indexOf('阿凯') < 0);
assert('无 6 人场编组预设', bind.indexOf('players: 6') < 0 && bind.indexOf('slots: 6') < 0);
assert('无 8 人测试预设', bind.indexOf('players: 8') < 0 && bind.indexOf('slots: 8') < 0);
assert('记分页按组过滤', /entry\) === "score" \? "group"/.test(bind));
assert('名单来自 scoreParties', bind.indexOf('scoreParties') >= 0);
assert('成绩来自 officialScoresByPartyId', bind.indexOf('officialScoresByPartyId') >= 0);
assert('看板不改写 pairings', bind.indexOf('leftId: ids[0]') < 0);
assert(
  'repository 不合成单场对决',
  read(gameRoot, 'utils/localSideGameRepository.js').indexOf('pairings.push({ leftId: ids[0]') < 0
);

function holeOrder() {
  return ['A1', 'A2', 'A3'];
}

function scoresOf(ids) {
  var holes = holeOrder();
  var out = {};
  holes.forEach(function (h, hi) {
    out[h] = {};
    ids.forEach(function (id, pi) {
      out[h][id] = (pi + 1) * 0.5 + hi * 0.1;
    });
  });
  return out;
}

function pairId(a, b) {
  return String(a) + '|' + String(b);
}

function allPairs(ids) {
  var pairs = [];
  var i;
  var j;
  for (i = 0; i < ids.length; i++) {
    for (j = i + 1; j < ids.length; j++) {
      pairs.push({
        id: pairId(ids[i], ids[j]),
        leftId: ids[i],
        rightId: ids[j],
        on: true,
        strokes: '0'
      });
    }
  }
  return pairs;
}

function playersOf(ids) {
  return ids.map(function (id) {
    return { id: id, name: id, selected: true };
  });
}

function gameFor(ruleId, n) {
  var ids = [];
  var i;
  for (i = 0; i < n; i++) ids.push('pty' + (i + 1));
  var game = {
    catalogId: ruleId,
    ruleId: ruleId,
    ruleSnapshot: { catalogId: ruleId },
    players: playersOf(ids),
    playerOrder: ids.slice(),
    pairings: n >= 2 ? allPairs(ids) : [],
    multiplier: 1,
    holes: holeOrder().map(function (label) {
      return { label: label, on: true };
    })
  };
  return { game: game, ids: ids };
}

var TOP_HOLE_IDS = [
  'match-2',
  '8421-2',
  'landlord-big',
  'landlord-mid',
  'landlord-small',
  '8421-3',
  '8421-4',
  'lasuo-4',
  'three-vs-one',
  'dizhubo-4',
  'vegas',
  'lasuo-n',
  'horn'
];

RULE_IDS.forEach(function (id) {
  var cap = Number(officialCatalog.findRule(id).players) || 2;
  var built = gameFor(id, cap);
  var ctx = {
    scores: scoresOf(built.ids),
    holeOrder: holeOrder(),
    pars: { A1: 4, A2: 4, A3: 3 },
    windOn: false
  };
  var a = sandboxSettle.settleGame(built.game, ctx);
  var b = officialSettle.settleGame(built.game, ctx);
  var legacyB = JSON.parse(JSON.stringify(b || {}));
  delete legacyB.topHoleStates;
  assert('同输入旧结算字段一致 ' + id, JSON.stringify(a) === JSON.stringify(legacyB));
  if (TOP_HOLE_IDS.indexOf(id) >= 0) {
    assert(
      '主体提供 topHoleStates ' + id,
      Object.prototype.hasOwnProperty.call(b, 'topHoleStates') &&
        !!b.topHoleStates &&
        typeof b.topHoleStates === 'object' &&
        !Array.isArray(b.topHoleStates)
    );
  } else {
    assert(
      '非顶洞跟踪输出保持不变 ' + id,
      !Object.prototype.hasOwnProperty.call(b, 'topHoleStates')
    );
  }
});
assert(
  'emptyResults 不代表开放',
  !officialCatalog.isUnavailableRule('three-set') &&
    !officialCatalog.isUnavailableRule('youcai') &&
    !officialCatalog.isUnavailableRule('landlord-small') &&
    officialCatalog.isUnavailableRule('skins')
);

var four = gameFor('stroke-2', 4);
assert('4 方 C(4,2)=6 对决', four.game.pairings.length === 6);
var strokeCtx = {
  scores: scoresOf(four.ids),
  holeOrder: holeOrder(),
  pars: {},
  windOn: false
};
var onePair = JSON.parse(JSON.stringify(four.game));
onePair.pairings = [four.game.pairings[0]];
var full = officialSettle.settleGame(four.game, strokeCtx);
var sub = officialSettle.settleGame(onePair, strokeCtx);
assert('单对决结果不等于六对叠加', JSON.stringify(full.byHole) !== JSON.stringify(sub.byHole));

var shuffled = gameFor('stroke-2', 4);
shuffled.game.players = shuffled.game.players.slice().reverse();
var samePairs = officialSettle.settleGame(four.game, strokeCtx);
var shuffledRes = officialSettle.settleGame(shuffled.game, strokeCtx);
assert(
  '输入顺序不串位（pair id 稳定）',
  JSON.stringify(samePairs.byHole) === JSON.stringify(shuffledRes.byHole)
);

var comboGame = gameFor('stroke-2', 2);
comboGame.game.players = [
  { id: 'sideA', name: '甲组', partyType: 'combination', selected: true },
  { id: 'sideB', name: '乙组', partyType: 'side', selected: true }
];
comboGame.game.pairings = [
  { id: 'sideA|sideB', leftId: 'sideA', rightId: 'sideB', on: true, strokes: '0' }
];
var comboCtx = {
  scores: scoresOf(['sideA', 'sideB']),
  holeOrder: holeOrder(),
  pars: {},
  windOn: false
};
var comboOut = officialSettle.settleGame(comboGame.game, comboCtx);
assert('combination/side 各算一方', !!(comboOut && comboOut.byHole && comboOut.byHole.A1));

console.log('sideGameCatalogParity.selftest passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
