/**
 * 单一全程洞序 fullHoleOrder。
 * 运行：node scripts/gameFullHoleOrder.selftest.js
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

var fs = require('fs');
var path = require('path');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var settingsMod = require('../miniprogram/subpackages/game/utils/localSideGameSettings.js');
var holeOrder = require('../miniprogram/subpackages/game/utils/holeOrder.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');

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
facade.setImplementation(
  localMod.createLocalSideGameRepository({
    storage: memStorage(),
    settingsApi: settingsMod.createLocalSideGameSettings({ storage: memStorage() }),
    idGen: (function () {
      var n = 0;
      return function () {
        n += 1;
        return 'fho_' + n;
      };
    })()
  })
);

function nines(a, b) {
  var out = [];
  var i;
  for (i = 1; i <= 9; i++) out.push(a + i);
  if (b) for (i = 1; i <= 9; i++) out.push(b + i);
  return out;
}

function makeHost(matchId, labels, pars) {
  var players = ['A', 'B'].map(function (id) {
    return { playerId: id, displayName: id, groupId: 'g1' };
  });
  var official = {};
  players.forEach(function (p) {
    official[p.playerId] = { holes: {} };
    labels.forEach(function (label) {
      official[p.playerId].holes[label] = { score: label === 'C1' ? 3 : 4 };
    });
  });
  var parMap = {};
  labels.forEach(function (id) {
    parMap[id] = 4;
  });
  Object.keys(pars || {}).forEach(function (k) {
    parMap[k] = pars[k];
  });
  return hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: matchId,
      groupId: 'g1',
      scope: 'group',
      revision: 'r1',
      holeContextReady: true,
      holeOrder: labels.slice(),
      pars: parMap,
      allowBigPot: true,
      canEditSideGames: true,
      currentUserId: 'tester',
      players: players,
      officialScoresByPartyId: official
    })
  );
}

function boot(matchId, labels, pars) {
  var host = makeHost(matchId, labels, pars);
  hostSession.setHostContext(host);
  bind.attachHost(host);
  bind.discardSetupDraft();
  bind.ensureSetupDraft('score');
  return host;
}

function idsOf(view) {
  return (view.holes || []).map(function (h) {
    return h.holeId;
  });
}

var cd = nines('C', 'D');
var dc = nines('D', 'C');
boot('m-cd', cd, { C1: 3, D1: 5 });
bind.addGame('score', {
  catalogId: 'stroke-2',
  name: 'CD',
  players: [{ id: 'A' }, { id: 'B' }],
  holes: catalog.HOLES.map(function (label) {
    return { label: label, on: true };
  }),
  holeOrder: catalog.HOLES.slice(),
  multiplier: 1,
  ruleSnapshot: { catalogId: 'stroke-2', reward: 'none' }
});

var full = bind.getFullHoleOrder('score');
assert('1 创建时 C/D 初始化 fullHoleOrder', idsOf(full).join(',') === cd.join(','));
assert('2 全程洞序显示 C/D', bind.getHoleOrder('score')[0] === 'C1' && bind.getHoleOrder('score')[9] === 'D1');

var pad = bind.listScorePad('score');
assert('4 记分卡显示 C/D', pad.holes[0].label === 'C1' && pad.holes[9].label === 'D1');

var game = bind.listGames('score')[0];
assert('3 游戏 TAB / 实例镜像 C/D', game.fullHoleOrder[0] === 'C1' && game.holes[0].label === 'C1');

var kicks = game.holes.map(function (h) {
  return h.label;
});
assert('5 踢一脚候选 C/D', kicks[0] === 'C1' && kicks[9] === 'D1');
assert('6 有效洞候选 C/D', game.holes[2].label === 'C3');

var board = bind.listBoard('score', game.id);
assert('7 结果看板 C/D', board.holes[0].label === 'C1' && board.holes[9].label === 'D1');

var rev = full.revision;
assert('8 同一 revision', pad.holes.length === full.holes.length && board.holes[0].label === full.holes[0].holeId);

bind.setHoleOrder('score', dc);
var after = bind.getFullHoleOrder('score');
assert('9 调整为 D/C 后 revision 增加且全模块同步', after.revision > rev && after.holes[0].holeId === 'D1');
assert('记分卡同步 D/C', bind.listScorePad('score').holes[0].label === 'D1');
assert('看板同步 D/C', bind.listBoard('score', game.id).holes[0].label === 'D1');
assert('踢一脚/有效洞镜像同步', bind.listGames('score')[0].holes[0].label === 'D1');

assert(
  '10 par 跟随 holeId',
  after.holes.filter(function (h) {
    return h.holeId === 'C1';
  })[0].par === 3 &&
    after.holes.filter(function (h) {
      return h.holeId === 'D1';
    })[0].par === 5
);

assert('created 未改', bind.getGlobal('score').createdHoleOrder[0] === 'C1');

console.log('EVIDENCE ' + JSON.stringify({
  matchId: bind.getFullHoleOrder('score').matchId,
  createdHoleOrder: bind.getGlobal('score').createdHoleOrder,
  fullHoleOrder: bind.getHoleOrder('score'),
  fullHoleOrderRevision: bind.getFullHoleOrder('score').revision,
  全程洞序: bind.getHoleOrder('score'),
  记分卡: bind.listScorePad('score').holes.map(function (h) { return h.label; }),
  结果看板: bind.listBoard('score', bind.listGames('score')[0].id).holes.map(function (h) { return h.label; }),
  有效洞: (bind.listGames('score')[0].holes || []).map(function (h) { return h.label; }),
  踢一脚: (bind.listGames('score')[0].holes || []).map(function (h) { return h.label; })
}));

var migrated = holeOrder.migrateAbOrderToCreated(catalog.HOLES.slice(), cd);
assert('14 历史 A/B 污染可按 originalIndex 迁到 C/D', migrated[0] === 'C1' && migrated[9] === 'D1');
assert(
  '14 只在污染时迁移',
  holeOrder.shouldMigrateAbPollution(catalog.HOLES.slice(), cd) &&
    !holeOrder.shouldMigrateAbPollution(cd, cd)
);

boot('m-ab', catalog.HOLES.slice());
assert('15 真实 A/B 比赛保持 A/B', bind.getHoleOrder('score')[0] === 'A1' && bind.getHoleOrder('score')[17] === 'B9');

boot('m-9', nines('C'));
assert('16 9洞', bind.getHoleOrder('score').length === 9 && bind.getHoleOrder('score')[0] === 'C1');

boot('m-iso', nines('C', 'D'));
assert('13 match 隔离：C/D 不受 A/B 比赛影响', bind.getHoleOrder('score')[0] === 'C1');

var gameRoot = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game');
function walk(dir, acc) {
  fs.readdirSync(dir).forEach(function (name) {
    var p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(js|wxml)$/.test(name)) acc.push(p);
  });
}
var files = [];
walk(path.join(gameRoot, 'pages'), files);
walk(path.join(gameRoot, 'components'), files);
var settleFiles = fs.readdirSync(path.join(gameRoot, 'utils')).filter(function (n) {
  return /^settle.+\.js$/.test(n);
});
settleFiles.forEach(function (n) {
  files.push(path.join(gameRoot, 'utils', n));
});
var banned = files.filter(function (p) {
  var src = fs.readFileSync(p, 'utf8');
  return /catalog\.HOLES/.test(src) || /defaultHoleOrder\s*\(/.test(src);
});
assert(
  '17 运行期页面/组件/结算未直接引用 catalog.HOLES 或 defaultHoleOrder()',
  banned.length === 0,
  banned.join(',')
);

console.log('SUMMARY passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
