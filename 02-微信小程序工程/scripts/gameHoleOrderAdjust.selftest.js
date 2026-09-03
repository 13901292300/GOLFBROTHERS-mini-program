/**
 * 全局设置「调整洞序」读取当前 GAME 真实洞号。
 * 运行：node scripts/gameHoleOrderAdjust.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
var bag = {};
global.wx.getStorageSync = function (key) {
  return bag[key];
};
global.wx.setStorageSync = function (key, value) {
  bag[key] = JSON.parse(JSON.stringify(value));
};
global.wx.showToast = function () {};

var holeOrder = require('../miniprogram/subpackages/game/utils/holeOrder.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var settingsMod = require('../miniprogram/subpackages/game/utils/localSideGameSettings.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var settleCore = require('../miniprogram/subpackages/game/utils/settleCore.js');
var mark = require('../miniprogram/utils/sideGameRankMark.js');
var fs = require('fs');
var path = require('path');

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
  var store = {};
  return {
    getItem: function (key) {
      return store[key];
    },
    setItem: function (key, value) {
      store[key] = JSON.parse(JSON.stringify(value));
      return true;
    }
  };
}

identity.setImplementation({
  implementation: 'test',
  getCurrentUserId: function () {
    return 'tester';
  }
});
var repo = localMod.createLocalSideGameRepository({
  storage: memStorage(),
  settingsApi: settingsMod.createLocalSideGameSettings({ storage: memStorage() }),
  idGen: (function () {
    var n = 0;
    return function () {
      n += 1;
      return 'ho_' + n;
    };
  })()
});
facade.setImplementation(repo);

function nines(a, b) {
  var out = [];
  var i;
  for (i = 1; i <= 9; i++) out.push(a + i);
  if (b) for (i = 1; i <= 9; i++) out.push(b + i);
  return out;
}

function parsOf(labels, special) {
  var map = {};
  (labels || []).forEach(function (id) {
    map[id] = 4;
  });
  Object.keys(special || {}).forEach(function (k) {
    map[k] = special[k];
  });
  return map;
}

function makeHost(matchId, labels, pars, skipLabels) {
  var skip = skipLabels || {};
  var players = ['A', 'B', 'C', 'D'].map(function (id) {
    return { playerId: id, displayName: id, groupId: 'g1' };
  });
  var official = {};
  players.forEach(function (p) {
    official[p.playerId] = { holes: {} };
    labels.forEach(function (label) {
      if (skip[label]) return;
      var abs = 4;
      if (label === '东1') abs = 2;
      if (label === '南1') abs = 6;
      official[p.playerId].holes[label] = { score: abs };
    });
  });
  return hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: matchId,
      groupId: 'g1',
      scope: 'group',
      revision: 'r1',
      holeContextReady: true,
      holeOrder: labels.slice(),
      pars: parsOf(labels, pars),
      allowBigPot: true,
      canEditSideGames: true,
      currentUserId: 'tester',
      players: players,
      scoreParties: players.map(function (p) {
        return {
          partyId: p.playerId,
          partyType: 'player',
          displayName: p.displayName,
          memberPlayerIds: [p.playerId],
          groupId: 'g1'
        };
      }),
      officialScoresByPartyId: official
    })
  );
}

function boot(matchId, labels, extraPars) {
  var host = makeHost(matchId, labels, extraPars);
  hostSession.setHostContext(host);
  bind.attachHost(host);
  bind.discardSetupDraft();
  bind.ensureSetupDraft('score');
  return host;
}

function addStroke(labels) {
  return bind.addGame('score', {
    catalogId: 'stroke-2',
    name: '洞序',
    players: [{ id: 'A' }, { id: 'B' }],
    holes: labels.map(function (label) {
      return { label: label, on: true };
    }),
    holeOrder: labels.slice(),
    multiplier: 1,
    ruleSnapshot: { catalogId: 'stroke-2', reward: 'none' }
  });
}

var eastSouth = nines('东', '南');
var southEast = nines('南', '东');
var numeric = [];
for (var n = 1; n <= 18; n++) numeric.push(String(n));
var ac = nines('A', 'C');
var nine = nines('东');
var custom = ['金鸡1', '金鸡2', '金鸡3', '金鸡4', '金鸡5', '金鸡6', '金鸡7', '金鸡8', '金鸡9', '梧桐1', '梧桐2', '梧桐3', '梧桐4', '梧桐5', '梧桐6', '梧桐7', '梧桐8', '梧桐9'];

boot('m-num', numeric);
assert('1 创建 1–18 初始即 1–18', bind.getHoleOrder('score').join(',') === numeric.join(','));

boot('m-ac', ac);
assert('2 创建 A/C 不变成 A/B', bind.getHoleOrder('score').join(',') === ac.join(',') && bind.getHoleOrder('score').indexOf('B1') < 0);

boot('m-custom', custom);
assert('3 自定义洞号完整保留', bind.getHoleOrder('score').join(',') === custom.join(','));

boot('m-9', nine);
assert('4 9洞只显示9洞', bind.getHoleOrder('score').length === 9 && bind.getHoleOrder('score')[8] === '东9');

boot('m-12', numeric.slice(0, 12));
assert('5 非18洞按实际洞数', bind.getHoleOrder('score').length === 12);

boot('m-east', eastSouth, { 东1: 3, 南1: 5 });
var gA = addStroke(eastSouth);
assert('7 无调整显示创建原始顺序', bind.getHoleOrder('score')[0] === '东1' && bind.getHoleOrder('score')[9] === '南1');

var draftBefore = [];
assert('13 打开前 draft 不是 A/B 默认', draftBefore.length === 0 && bind.getHoleOrder('score')[0] !== 'A1');

var gBefore = bind.getGlobal('score');
assert(
  '11 未调整时 full 等于 created，且已初始化',
  gBefore.fullHoleOrder &&
    gBefore.createdHoleOrder &&
    gBefore.fullHoleOrder.join(',') === gBefore.createdHoleOrder.join(',') &&
    gBefore.fullHoleOrder[0] === '东1'
);
var rev0 = Number(gBefore.fullHoleOrderRevision) || 0;
bind.setHoleOrder('score', southEast);
assert(
  '6/12 保存调整后南区在前且 revision 增加',
  bind.getHoleOrder('score').join(',') === southEast.join(',') &&
    Number(bind.getGlobal('score').fullHoleOrderRevision) > rev0
);
var reenter = bind.getHoleOrder('score');
assert('验收 南1–南9 东1–东9', reenter[0] === '南1' && reenter[9] === '东1');

var recs = holeOrder.buildHoleRecords(eastSouth, { pars: { 东1: 3, 南1: 5 } });
var after = holeOrder.orderRecordsByIds(recs, reenter);
assert(
  '10 调整后 par/holeId 仍对应原洞',
  after[0].holeId === '南1' && after[0].par === 5 && after[9].holeId === '东1' && after[9].par === 3
);

var createdKeep = (bind.getGame('score', gA.id) || {}).createdHoleOrder;
assert(
  '创建时原始洞号未被改写',
  createdKeep && createdKeep[0] === '东1' && createdKeep[9] === '南1'
);

var pad = bind.listScorePad('score');
assert(
  '16 记分卡洞序与调整一致',
  pad.holes[0].label === '南1' && pad.holes[9].label === '东1' && pad.holes[0].par === 5 && pad.holes[9].par === 3
);

var board = bind.listBoard('score', gA.id);
assert(
  '16b 结果页洞序一致',
  board.holes && board.holes[0] && board.holes[0].label === '南1'
);

var labels = bind.getHoleOrder('score');
assert('17 有效洞范围仍是原 holeId', labels.indexOf('东1') >= 0 && labels.indexOf('A1') < 0);

var last = settleCore.lastOnLabel({ holes: southEast.map(function (id) { return { label: id, on: true }; }) }, southEast);
assert('18 大风吹最后一洞为调整后最后一洞', last === '东9');

assert(
  '19 分段语义不按显示下标串洞',
  pad.holes[0].label === '南1' && pad.holes[0].par === 5 && pad.holes[9].label === '东1' && pad.holes[9].par === 3
);

var card = bind.getScorecard('score', bind.getGame('score', gA.id));
assert(
  '计分跟随 holeId 不跟下标',
  card.南1 && card.东1 && Number(card.南1.A) === 1 && Number(card.东1.A) === -1
);

bind.setHoleOrder('score', eastSouth);
assert('未再保存前已写入的顺序可改回', bind.getHoleOrder('score')[0] === '东1');

boot('m-b', numeric);
var gB = addStroke(numeric);
assert('8 GAME B 不受 GAME A 调整影响', bind.getHoleOrder('score').join(',') === numeric.join(','));
bind.setHoleOrder('score', numeric.slice().reverse());
function addLasuo(labels) {
  return bind.addGame('score', {
    catalogId: 'lasuo-4',
    name: '拉索',
    players: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
    playerOrder: ['A', 'B', 'C', 'D'],
    groupMode: 'random',
    holes: labels.map(function (label) {
      return { label: label, on: true };
    }),
    holeOrder: labels.slice()
  });
}

function setHostHoleScores(host, label, scores) {
  Object.keys(scores || {}).forEach(function (id) {
    host.officialScoresByPartyId[id].holes[label] = { score: scores[id] };
  });
  return host;
}

function resultHoleUnsettled(result, label) {
  var ledger = result && result.byHole && result.byHole[label];
  return !!ledger && ['A', 'B', 'C', 'D'].every(function (id) {
    return !Object.prototype.hasOwnProperty.call(ledger, id);
  });
}

function boardHoleUnsettled(boardValue, label) {
  var hole = (boardValue.holes || []).filter(function (item) {
    return item.label === label;
  })[0];
  return !!hole && (hole.cells || []).every(function (cell) {
    return !cell || (!cell.played && cell.text === '');
  });
}

function boardRawByPlayer(boardValue, label) {
  var out = {};
  var hole = (boardValue.holes || []).filter(function (item) {
    return item.label === label;
  })[0];
  (boardValue.players || []).forEach(function (player, index) {
    out[player.id] = hole && hole.cells && hole.cells[index] && hole.cells[index].raw;
  });
  return out;
}

hostSession.setHostContext(makeHost('m-east', eastSouth, { 东1: 3, 南1: 5 }));
bind.attachHost(makeHost('m-east', eastSouth, { 东1: 3, 南1: 5 }));
assert('8b 切回 GAME A 仍是东/南词表', bind.getHoleOrder('score').indexOf('东1') >= 0 && bind.getHoleOrder('score').indexOf('18') < 0);

boot('m-live', eastSouth, { 东1: 3, 南1: 5 });
bind.discardSetupDraft();
var gLive = addLasuo(eastSouth);
var gLiveSibling = addLasuo(eastSouth);
var boardBefore = bind.listBoard('score', gLive.id);
var east1Before = (boardBefore.holes || []).filter(function (h) {
  return h.label === '东1';
})[0];
assert(
  '调整前已有游戏结果',
  east1Before && east1Before.cells && east1Before.cells.some(function (c) {
    return c && c.played && c.text !== '';
  })
);
var hostPending = makeHost('m-live', eastSouth, { 东1: 3, 南1: 5 }, { 南1: true });
hostSession.setHostContext(hostPending);
bind.attachHost(hostPending);
bind.setHoleOrder('score', southEast);
var liveGame = bind.getGame('score', gLive.id);
var liveSibling = bind.getGame('score', gLiveSibling.id);
var card = bind.getScorecard('score', liveGame);
assert('原始杆数仍按 holeId', card.东1 && Number(card.东1.A) === -1 && (card.南1 == null || card.南1.A == null));
assert(
  '全局改序同步所有 live 拉索结果',
  bind.getHoleOrder('score').slice(0, 2).join(',') === '南1,南2' &&
    [liveGame, liveSibling].every(function (game) {
      return game &&
        game.holeResults &&
        game.holeResults.orderByHole &&
        game.holeResults.orderByHole.南1 &&
        !game.holeResults.orderByHole.东1;
    }) &&
    [gLive, gLiveSibling].every(function (game) {
      var stored = facade.getById(game.id);
      return stored.ok &&
        stored.data.resultSnapshot &&
        stored.data.resultSnapshot.orderByHole &&
        stored.data.resultSnapshot.orderByHole.南1 &&
        !stored.data.resultSnapshot.orderByHole.东1;
    })
);
assert(
  '新起始洞无成绩时 pending',
  [liveGame, liveSibling].every(function (game) {
    return game.holeResults && game.holeResults.pendingStart === true;
  })
);
assert(
  '仅起始洞有初始分边',
  liveGame.holeResults.orderByHole &&
    liveGame.holeResults.orderByHole.南1 &&
    !liveGame.holeResults.orderByHole.东1
);
assert(
  '仅新起始洞有三角',
  !!mark.colorForGameCell(liveGame, '南1', 'A') && !mark.colorForGameCell(liveGame, '东1', 'A')
);
var boardAfter = bind.listBoard('score', gLive.id);
liveGame = bind.getGame('score', gLive.id);
liveSibling = bind.getGame('score', gLiveSibling.id);
var pendingStored = facade.getById(gLive.id);
var pendingSiblingStored = facade.getById(gLiveSibling.id);
assert(
  '前洞缺杆时后洞 live 仍未结算',
  resultHoleUnsettled(liveGame.holeResults, '南2') &&
    resultHoleUnsettled(liveSibling.holeResults, '南2')
);
assert('前洞缺杆时后洞 board 为空', boardHoleUnsettled(boardAfter, '南2'));
assert(
  '前洞缺杆时后洞 persisted snapshot 为空',
  pendingStored.ok &&
    pendingSiblingStored.ok &&
    resultHoleUnsettled(pendingStored.data.resultSnapshot, '南2') &&
    resultHoleUnsettled(pendingSiblingStored.data.resultSnapshot, '南2')
);
var emptyHoles = (boardAfter.holes || []).every(function (h) {
  return (h.cells || []).every(function (c) {
    return !c || c.text === '' || c.status === 'pending' || c.status === 'not-applicable';
  });
});
var emptyTotals = (boardAfter.totals || []).every(function (c) {
  return !c || c.text === '' || c.status === 'pending';
});
assert('游戏TAB结果与合计为空', emptyHoles && emptyTotals);
assert(
  '不展示 0',
  (boardAfter.totals || []).every(function (c) {
    return !c || c.text === '';
  })
);

var pendingResultRevision = pendingStored.data.resultRevision;
var pendingSiblingResultRevision = pendingSiblingStored.data.resultRevision;
var hostCompleted = makeHost('m-live', eastSouth, { 东1: 3, 南1: 5 });
setHostHoleScores(hostCompleted, '南1', { A: 2, B: 5, C: 6, D: 3 });
setHostHoleScores(hostCompleted, '南2', { A: 2, B: 6, C: 3, D: 5 });
hostCompleted.revision = 'r2';
hostSession.setHostContext(hostCompleted);
bind.attachHost(hostCompleted);
var boardCompleted = bind.listBoard('score', gLive.id);
var completedGame = bind.getGame('score', gLive.id);
var completedSibling = bind.getGame('score', gLiveSibling.id);
var completedStored = facade.getById(gLive.id);
var completedSiblingStored = facade.getById(gLiveSibling.id);
var south2Board = boardRawByPlayer(boardCompleted, '南2');
assert(
  '补齐前洞后按新洞序连续结算',
  [completedGame, completedSibling].every(function (game) {
    return game.holeResults &&
      game.holeResults.orderByHole &&
      game.holeResults.orderByHole.南1.join(',') === 'A,B,C,D' &&
      game.holeResults.orderByHole.南2.join(',') === 'A,D,B,C';
  })
);
assert(
  '后洞按上一洞排序后的正确分边结算',
  completedGame.holeResults.byHole.南2.A > 0 &&
    completedGame.holeResults.byHole.南2.C > 0 &&
    completedGame.holeResults.byHole.南2.B < 0 &&
    completedGame.holeResults.byHole.南2.D < 0 &&
    south2Board.A > 0 &&
    south2Board.C > 0 &&
    south2Board.B < 0 &&
    south2Board.D < 0
);
assert(
  '补分 refresh 更新所有 persisted snapshots',
  completedStored.ok &&
    completedSiblingStored.ok &&
    completedStored.data.resultRevision > pendingResultRevision &&
    completedSiblingStored.data.resultRevision > pendingSiblingResultRevision &&
    completedStored.data.hostRevisionAtSettle === 'r2' &&
    completedSiblingStored.data.hostRevisionAtSettle === 'r2' &&
    completedStored.data.resultSnapshot.orderByHole.南2.join(',') === 'A,D,B,C' &&
    completedSiblingStored.data.resultSnapshot.orderByHole.南2.join(',') === 'A,D,B,C' &&
    completedStored.data.resultSnapshot.byHole.南2.A > 0 &&
    completedSiblingStored.data.resultSnapshot.byHole.南2.A > 0
);

var twin = ['东1-a', '东1-b'];
assert(
  '9 同显示名不同 holeId 不串',
  holeOrder.resolveHoleOrder({ created: twin, adjusted: ['东1-b', '东1-a'] }).join(',') === '东1-b,东1-a'
);
assert(
  '14 历史仅 holes 可恢复',
  holeOrder.resolveHoleOrder({ holes: eastSouth.map(function (label) { return { label: label }; }) })[0] === '东1'
);
assert(
  '14b 球场快照可恢复',
  holeOrder.resolveHoleOrder({ courseSnapshot: { holes: custom } })[0] === '金鸡1'
);

var srcList = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'components', 'game-list', 'index.js'),
  'utf8'
);
assert(
  '调整洞序打开走 getHoleOrder 而非 normalize(global)',
  /onHoleOrder[\s\S]{0,400}getHoleOrder/.test(srcList) &&
    !/onHoleOrder[\s\S]{0,200}normalizeHoleOrder\(this\.data\.global\.holeOrder\)/.test(srcList)
);

var wxml = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'components', 'game-list', 'index.wxml'),
  'utf8'
);
assert('WXML 仍为 holeOrderDraft 字符串格子', wxml.indexOf('wx:for="{{holeOrderDraft}}"') >= 0);

console.log('SUMMARY passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
