/**
 * 游戏 TAB 白屏回归：真实跑 component attached → reload → setData。
 * 运行：node scripts/gameTabWhiteScreen.selftest.js
 */
var fs = require('fs');
var path = require('path');

if (typeof global.wx !== 'object') global.wx = {};
global.wx.getStorageSync = global.wx.getStorageSync || function () { return null; };
global.wx.setStorageSync = global.wx.setStorageSync || function () {};
global.wx.showToast = function () {};
global.wx.navigateTo = function () {};
global.wx.nextTick = function (fn) { fn(); };
global.wx.getSystemInfoSync = function () {
  return {
    windowWidth: 375,
    windowHeight: 667,
    statusBarHeight: 20,
    safeArea: { bottom: 647 }
  };
};
global.Component = function (opt) {
  global.__GameTabDef = opt;
};

var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var scoringSnap = require('../miniprogram/subpackages/scoring/utils/sideGameHostSnapshot.js');

require('../miniprogram/subpackages/game/components/game-tab/index.js');

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

function stroke2(players) {
  return {
    catalogId: 'stroke-2',
    name: '比杆',
    players: players,
    pairings: [{ id: 'pair-1', leftId: players[0].id, rightId: players[1].id, on: true, strokes: 0 }],
    holes: catalog.HOLES.map(function (label) {
      return { label: label, on: true };
    }),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    ruleSnapshot: rec.buildRuleSnapshot('stroke-2')
  };
}

function makeHost(opts) {
  opts = opts || {};
  var holeOrder = catalog.HOLES.slice();
  var pars = {};
  holeOrder.forEach(function (h) {
    pars[h] = 4;
  });
  var players = opts.players || [
    { playerId: 'pA', displayName: '甲', groupId: 'g1' },
    { playerId: 'pB', displayName: '乙', groupId: 'g1' }
  ];
  var parties = players.map(function (p) {
    return {
      partyId: p.playerId,
      partyType: 'player',
      displayName: p.displayName,
      memberPlayerIds: [p.playerId],
      groupId: p.groupId || 'g1'
    };
  });
  var official = {};
  players.forEach(function (p) {
    var holes = {};
    holeOrder.forEach(function (label) {
      holes[label] = { score: 4 };
    });
    official[p.playerId] = { holes: holes };
  });
  var ctx = hostMod.emptyContext({
    matchId: opts.matchId || 'm-tab',
    groupId: opts.groupId || 'g1',
    scope: opts.scope || 'group',
    revision: 'r1',
    holeContextReady: true,
    holeOrder: holeOrder,
    pars: pars,
    allowBigPot: true,
    players: players,
    scoreParties: parties,
    officialScoresByPartyId: official
  });
  return hostMod.buildPresentation(ctx);
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
        return 'tabg_' + n;
      };
    })(),
    clock: function () {
      return 5000;
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

function wxmlBranch(inst) {
  if (!inst.data.hasGames) return inst.data.loadError ? 'error' : 'empty';
  return 'board';
}

function makeTab(props) {
  var def = global.__GameTabDef;
  var inst = {
    properties: Object.assign(
      {
        entry: 'score',
        maxPlayers: 4,
        matchId: '',
        groupId: '',
        scope: 'group',
        hostSnapshot: {},
        layoutMode: 'fill',
        ctaHidden: false
      },
      props || {}
    ),
    data: JSON.parse(JSON.stringify(def.data)),
    _sets: [],
    setData: function (patch, cb) {
      Object.assign(this.data, patch);
      this._sets.push(JSON.parse(JSON.stringify(patch)));
      if (typeof cb === 'function') cb();
    },
    createSelectorQuery: function () {
      var q = {
        select: function () {
          return q;
        },
        boundingClientRect: function () {
          return q;
        },
        exec: function (cb) {
          if (cb) cb([]);
        }
      };
      return q;
    }
  };
  Object.keys(def.methods).forEach(function (k) {
    inst[k] = def.methods[k];
  });
  return inst;
}

function attachTab(inst) {
  global.__GameTabDef.lifetimes.attached.call(inst);
}

assert('runPublished 同步返回', bind.runPublished(function () { return 7; }) === 7);
assert('runPublished 非 Promise', typeof bind.runPublished(function () { return 1; }).then !== 'function');
assert('TAB 未调用 requireSetupDraft', fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram/subpackages/game/components/game-tab/index.js'),
  'utf8'
).indexOf('requireSetupDraft') < 0);

var repo = installRepo();
var host = makeHost();
attach(host);
bind.discardSetupDraft();

function scoreSnap() {
  return scoringSnap.fromGame(
    {
      gameId: 'm-tab',
      groups: [
        {
          groupId: 'g1',
          playersSlots: [
            { playerId: 'pA', name: '甲' },
            { playerId: 'pB', name: '乙' }
          ],
          scoresByPlayer: {
            pA: { scores: filled18(4) },
            pB: { scores: filled18(4) }
          }
        }
      ]
    },
    { scope: 'group', groupId: 'g1', matchId: 'm-tab', allowBigPot: true }
  );
}
var emptyTab = makeTab({ entry: 'score', hostSnapshot: scoreSnap() });
attachTab(emptyTab);
attach(host);
assert('1 无游戏不抛错', emptyTab._sets.length > 0 && emptyTab.data.loading === false);
assert('1 无游戏空态分支', wxmlBranch(emptyTab) === 'empty' && emptyTab.data.hasGames === false);
assert('1 空态标题存在', !!emptyTab.data.emptyTitle);

var noHost = makeTab({ entry: 'score', hostSnapshot: {} });
attachTab(noHost);
attach(host);
assert('7 Host 未到安全空态', wxmlBranch(noHost) === 'empty' && noHost.data.hasGames === false);

var g1 = bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
assert('发布 1 局', !!(g1 && g1.id));
var oneTab = makeTab({
  entry: 'score',
  hostSnapshot: scoreSnap()
});
attachTab(oneTab);
attach(host);
assert('2 一局看板可见', wxmlBranch(oneTab) === 'board' && oneTab.data.hasGames === true);
assert('2 board 存在且有洞', !!(oneTab.data.board && (oneTab.data.board.holes || []).length));
assert('2 gameCount>=1', Number(oneTab.data.board.gameCount || 0) >= 1);

var g2 = bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
assert('发布第 2 局', !!(g2 && g2.id));
var multiTab = makeTab({
  entry: 'score',
  hostSnapshot: scoreSnap()
});
attachTab(multiTab);
attach(host);
assert('3 多局看板可见', wxmlBranch(multiTab) === 'board');
assert('3 默认汇总或首局', !!multiTab.data.activeGameId && (multiTab.data.board.holes || []).length > 0);

bind.ensureSetupDraft('score');
bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
assert('草稿多于正式', bind.listGames('score').length > bind.listRepoGames('score').length);
var draftTab = makeTab({
  entry: 'score',
  hostSnapshot: scoreSnap()
});
attachTab(draftTab);
attach(host);
assert('4 草稿未确定 TAB 仍正式局数', Number(draftTab.data.board.gameCount) === 2);
assert('4 TAB 看板仍在', wxmlBranch(draftTab) === 'board');

bind.discardSetupDraft();
draftTab.reload();
assert('5 取消草稿 TAB 不变', Number(draftTab.data.board.gameCount) === 2 && wxmlBranch(draftTab) === 'board');

bind.ensureSetupDraft('score');
bind.addGame('score', stroke2([{ id: 'pA' }, { id: 'pB' }]));
var committed = bind.commitSetupDraft('score');
assert('6 确定成功', !!(committed && committed.ok));
draftTab.reload();
assert('6 确定后 TAB 刷新新游戏', Number(draftTab.data.board.gameCount) === 3 && wxmlBranch(draftTab) === 'board');

var boomRepo = {
  implementation: 'boom',
  listVisible: function () {
    throw new Error('repo_down');
  },
  create: function () {
    return { ok: false, reason: 'repo_down', data: null, revision: 0 };
  },
  getById: function () {
    return { ok: false, reason: 'repo_down', data: null, revision: 0 };
  },
  update: function () {
    return { ok: false, reason: 'repo_down', data: null, revision: 0 };
  },
  remove: function () {
    return { ok: false, reason: 'repo_down', data: null, revision: 0 };
  }
};
var savedRepo = facade.getImplementation();
facade.setImplementation(boomRepo);
var failTab = makeTab({
  entry: 'score',
  hostSnapshot: scoreSnap()
});
attachTab(failTab);
assert('8 Repository 失败不白屏', wxmlBranch(failTab) === 'error' || wxmlBranch(failTab) === 'empty');
assert('8 失败 hasGames=false', failTab.data.hasGames === false && failTab.data.loading === false);
facade.setImplementation(savedRepo);

function runEntry(entry, snap) {
  var tab = makeTab({ entry: entry, hostSnapshot: snap });
  attachTab(tab);
  return wxmlBranch(tab) === 'empty' || wxmlBranch(tab) === 'board' || wxmlBranch(tab) === 'error';
}

var scoreSnap = { matchId: host.matchId, groupId: host.groupId, scope: 'group' };
assert('10 记分页入口不白屏', runEntry('score', scoreSnap));

var hubGame = {
  gameId: 'casual-hub-tab',
  gameMode: '个人比杆赛',
  groups: [
    {
      groupId: 'g1',
      playersSlots: [
        { playerId: 'pA', name: '甲' },
        { playerId: 'pB', name: '乙' }
      ],
      scoresByPlayer: { pA: { scores: filled18(4) }, pB: { scores: filled18(5) } }
    }
  ]
};
var hubSnap = scoringSnap.fromGame(hubGame, { scope: 'match', allowBigPot: false, matchId: hubGame.gameId });
assert('10 Hub 入口不白屏', runEntry('hub', hubSnap));
assert('10 赛事详情入口不白屏', runEntry('match', hubSnap));

var wxml = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram/subpackages/game/components/game-tab/index.wxml'),
  'utf8'
);
assert('WXML 空态优先 !hasGames', /wx:if="\{\{!hasGames\}\}"/.test(wxml));
assert('WXML 失败文案', /加载失败，请重试/.test(wxml));

console.log('\ngameTabWhiteScreen.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
