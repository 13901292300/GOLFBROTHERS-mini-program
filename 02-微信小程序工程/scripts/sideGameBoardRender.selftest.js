/**
 * 看板渲染契约：固定实例 + 正式成绩 → listBoard ViewModel。
 * 运行：node scripts/sideGameBoardRender.selftest.js
 */
var fs = require('fs');
var path = require('path');

if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    showToast: function () {}
  };
}

var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var officialSettle = require('../miniprogram/subpackages/game/utils/settle.js');

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

function memStorage() {
  var bag = {};
  return {
    getItem: function (key) {
      return bag[key];
    },
    setItem: function (key, value) {
      bag[key] = JSON.parse(JSON.stringify(value));
      return true;
    }
  };
}

function filled18(n) {
  var a = [];
  var i;
  for (i = 0; i < 18; i++) a.push(n);
  return a;
}

function hostHoleOrder() {
  var out = [];
  var i;
  for (i = 1; i <= 9; i++) out.push('C' + i);
  for (i = 1; i <= 9; i++) out.push('D' + i);
  return out;
}

function holes18(score) {
  var holes = {};
  hostHoleOrder().forEach(function (label) {
    holes[label] = { score: score };
  });
  return { holes: holes };
}

function gameHoles() {
  return catalog.HOLES.map(function (label) {
    return { label: label, on: true };
  });
}

function makeHost(parties, scoreMap) {
  var holeOrder = hostHoleOrder();
  var pars = {};
  holeOrder.forEach(function (h) {
    pars[h] = 4;
  });
  var official = {};
  Object.keys(scoreMap).forEach(function (id) {
    var arr = scoreMap[id];
    var holes = {};
    holeOrder.forEach(function (label, i) {
      holes[label] = { score: arr[i] };
    });
    official[id] = { holes: holes };
  });
  return hostMod.emptyContext({
    matchId: 'm-board',
    groupId: 'g1',
    scope: 'group',
    revision: 'r2',
    holeContextReady: true,
    holeOrder: holeOrder,
    pars: pars,
    allowBigPot: true,
    scoreParties: parties,
    officialScoresByPartyId: official,
    players: parties
      .filter(function (p) {
        return p.partyType === 'player';
      })
      .map(function (p) {
        return { playerId: p.partyId, displayName: p.displayName, groupId: 'g1' };
      })
  });
}

function installRepo() {
  identity.setImplementation({
    implementation: 'test',
    getCurrentUserId: function () {
      return 'tester';
    }
  });
  var repo = localMod.createLocalSideGameRepository({
    storage: memStorage(),
    idGen: (function () {
      var n = 0;
      return function () {
        n += 1;
        return 'board_' + n;
      };
    })(),
    clock: function () {
      return 2000;
    }
  });
  facade.setImplementation(repo);
  return repo;
}

function attach(host) {
  hostSession.clearHostContext();
  hostSession.setHostContext(host);
  bind.attachHost(host);
}

function stroke2Instance(players, pairings) {
  return {
    catalogId: 'stroke-2',
    name: '比杆',
    players: players,
    pairings: pairings,
    holes: gameHoles(),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    ruleSnapshot: rec.buildRuleSnapshot('stroke-2')
  };
}

function cellTexts(board) {
  var out = [];
  (board.holes || []).forEach(function (hole) {
    (hole.cells || []).forEach(function (cell) {
      out.push(cell && cell.text);
    });
  });
  return out;
}

function nonEmptyCount(board) {
  var n = 0;
  (board.holes || []).forEach(function (hole) {
    (hole.cells || []).forEach(function (cell) {
      if (cell && cell.text && cell.text !== '-' && cell.text !== '—' && cell.text !== '') n += 1;
    });
  });
  return n;
}

function withoutTopHoleStates(result) {
  var legacy = JSON.parse(JSON.stringify(result || {}));
  delete legacy.topHoleStates;
  return legacy;
}

installRepo();

var parties2 = [
  { partyId: 'pA', partyType: 'player', displayName: '甲', memberPlayerIds: ['pA'], groupId: 'g1' },
  { partyId: 'pB', partyType: 'player', displayName: '乙', memberPlayerIds: ['pB'], groupId: 'g1' }
];
var host2 = makeHost(parties2, { pA: filled18(4), pB: filled18(5) });
attach(host2);

var created2 = bind.addGame(
  'score',
  stroke2Instance(
    [
      { id: 'pA', name: '甲' },
      { id: 'pB', name: '乙' }
    ],
    [{ id: 'pair-ab', leftId: 'pA', rightId: 'pB', on: true, strokes: 0 }]
  )
);
assert('创建 2 方玩法', !!(created2 && created2.id));

var board2 = bind.listBoard('score', created2.id);
assert('表头有实际洞', Array.isArray(board2.holes) && board2.holes.length === 18, String(board2.holes && board2.holes.length));
assert('players 非空', (board2.players || []).length === 2);
assert(
  '已录洞 cell 有展示值',
  nonEmptyCount(board2) > 0,
  'nonEmpty=' + nonEmptyCount(board2)
);
assert(
  '汇总有值',
  (board2.totals || []).length === 2 &&
    board2.totals.every(function (item) {
      return item && item.text != null && String(item.text) !== '';
    })
);
assert('WXML 字段 holes/cells/totals/players', !!(board2.holes[0] && board2.holes[0].label && board2.holes[0].cells));
assert('洞标用全程洞序 C1 而非实例 A1', board2.holes[0].label === 'C1');

var live = created2.holeResults || bind.getGame('score', created2.id).holeResults;
var snap = facade.getById(created2.id);
assert(
  'resultSnapshot 含完整 byHole',
  !!(snap.ok && snap.data.resultSnapshot && snap.data.resultSnapshot.byHole && Object.keys(snap.data.resultSnapshot.byHole).length === 18)
);
assert(
  'settleGame 字段 byHole+initial',
  !!(live && live.byHole && live.initial)
);

var parityScores = {};
catalog.HOLES.forEach(function (label) {
  parityScores[label] = { pA: 0, pB: 1 };
});
var engineOut = officialSettle.settleGame(
  {
    catalogId: 'match-2',
    players: [{ id: 'pA' }, { id: 'pB' }],
    pairings: [{ id: 'pair-ab', leftId: 'pA', rightId: 'pB', on: true }],
    holes: gameHoles(),
    ruleSnapshot: rec.buildRuleSnapshot('match-2'),
    multiplier: 1
  },
  {
    scores: parityScores,
    holeOrder: catalog.HOLES.slice(),
    pars: catalog.defaultHolePars(),
    windOn: false
  }
);
assert(
  'match-2 settleGame 产出 byHole+initial',
  !!(withoutTopHoleStates(engineOut) && engineOut.byHole && engineOut.initial)
);
assert(
  '主体 settleGame 显式提供 topHoleStates',
  Object.prototype.hasOwnProperty.call(engineOut, 'topHoleStates') &&
    !!engineOut.topHoleStates &&
    typeof engineOut.topHoleStates === 'object' &&
    !Array.isArray(engineOut.topHoleStates)
);
assert(
  'ViewModel 含看板关键字段',
  ['hasGames', 'gameCount', 'players', 'holes', 'totals', 'showPot', 'potRowLabel', 'pots'].every(function (k) {
    return Object.prototype.hasOwnProperty.call(board2, k);
  })
);

installRepo();
var parties3 = [
  { partyId: 'pA', partyType: 'player', displayName: '甲', memberPlayerIds: ['pA'], groupId: 'g1' },
  { partyId: 'pB', partyType: 'player', displayName: '乙', memberPlayerIds: ['pB'], groupId: 'g1' },
  { partyId: 'pC', partyType: 'player', displayName: '丙', memberPlayerIds: ['pC'], groupId: 'g1' }
];
var host3 = makeHost(parties3, {
  pA: filled18(4),
  pB: filled18(5),
  pC: filled18(6)
});
attach(host3);
var multiDraft = stroke2Instance(
  [
    { id: 'pA', name: '甲' },
    { id: 'pB', name: '乙' },
    { id: 'pC', name: '丙' }
  ],
  [
    { id: 'pair-ab', leftId: 'pA', rightId: 'pB', on: true, strokes: 0 },
    { id: 'pair-ac', leftId: 'pA', rightId: 'pC', on: true, strokes: 0 },
    { id: 'pair-bc', leftId: 'pB', rightId: 'pC', on: true, strokes: 0 }
  ]
);
assert('2方规则三方草稿默认第一对', bind.defaultPairId(multiDraft) === 'pair-ab');
var multi = bind.addGame('score', multiDraft);
assert(
  '三方比杆落库受 party_count 约束',
  !!(multi && multi.__fail && multi.reason === 'party_count')
);

installRepo();
var comboParties = [
  {
    partyId: 'combo-1',
    partyType: 'combination',
    displayName: '组合1',
    memberPlayerIds: ['m1', 'm2'],
    groupId: 'g1'
  },
  {
    partyId: 'combo-2',
    partyType: 'combination',
    displayName: '组合2',
    memberPlayerIds: ['m3', 'm4'],
    groupId: 'g1'
  }
];
var hostCombo = makeHost(comboParties, { 'combo-1': filled18(4), 'combo-2': filled18(6) });
attach(hostCombo);
var comboGame = bind.addGame(
  'score',
  stroke2Instance(
    [
      { id: 'combo-1', name: '组合1', partyType: 'combination' },
      { id: 'combo-2', name: '组合2', partyType: 'combination' }
    ],
    [{ id: 'pair-c', leftId: 'combo-1', rightId: 'combo-2', on: true, strokes: 0 }]
  )
);
var boardCombo = bind.listBoard('score', comboGame.id);
assert(
  'combination 产生表格行',
  (boardCombo.players || []).length === 2 && nonEmptyCount(boardCombo) > 0
);

installRepo();
var sideParties = [
  { partyId: 'side-A', partyType: 'side', displayName: '红', memberPlayerIds: ['m1'], groupId: 'g1' },
  { partyId: 'side-B', partyType: 'side', displayName: '蓝', memberPlayerIds: ['m2'], groupId: 'g1' }
];
var hostSide = makeHost(sideParties, { 'side-A': filled18(4), 'side-B': filled18(5) });
attach(hostSide);
var sideGame = bind.addGame(
  'score',
  stroke2Instance(
    [
      { id: 'side-A', name: '红', partyType: 'side' },
      { id: 'side-B', name: '蓝', partyType: 'side' }
    ],
    [{ id: 'pair-s', leftId: 'side-A', rightId: 'side-B', on: true, strokes: 0 }]
  )
);
var boardSide = bind.listBoard('score', sideGame.id);
assert('side 产生表格行', (boardSide.players || []).length === 2 && nonEmptyCount(boardSide) > 0);

var firstBoard = bind.listBoard('score', sideGame.id);
var reopened = bind.listBoard('score', sideGame.id);
assert(
  '关闭重开重建同一表格',
  cellTexts(firstBoard).join('|') === cellTexts(reopened).join('|') &&
    (facade.getById(sideGame.id).data.resultSnapshot.byHole != null)
);

var tabJs = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'components', 'game-tab', 'index.js'),
  'utf8'
);
var tabWxml = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'components', 'game-tab', 'index.wxml'),
  'utf8'
);
assert(
  'game-tab 不默认锁第一 pair',
  /onPairsOf\(game\)/.test(tabJs) &&
    !/activePairId = String\(pairs\[0\]\.id\)/.test(tabJs) &&
    /activePairId: ""/.test(tabJs) &&
    /onSelectGame/.test(tabJs)
);
assert('WXML 读 board.holes/cells/totals', /board\.holes/.test(tabWxml) && /cell\.text/.test(tabWxml) && /board\.totals/.test(tabWxml));
assert('0 分可展示', /signedText/.test(fs.readFileSync(path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils', 'sideGameBind.js'), 'utf8')));

console.log('\nsideGameBoardRender.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
