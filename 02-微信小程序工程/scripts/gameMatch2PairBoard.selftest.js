/**
 * 4 方比洞：主菜单整体汇总 vs 二级 1V1。对齐沙盒 empty activePairId。
 * 运行：node scripts/gameMatch2PairBoard.selftest.js
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
var gameRoot = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game');

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

function gameHoles() {
  return catalog.HOLES.map(function (label) {
    return { label: label, on: true };
  });
}

function pairId(a, b) {
  return String(a) + '|' + String(b);
}

function allPairs(ids) {
  var out = [];
  var i;
  var j;
  for (i = 0; i < ids.length; i++) {
    for (j = i + 1; j < ids.length; j++) {
      out.push({
        id: pairId(ids[i], ids[j]),
        leftId: ids[i],
        rightId: ids[j],
        on: true,
        strokes: 0
      });
    }
  }
  return out;
}

function match2Instance(players, pairings) {
  return {
    catalogId: 'match-2',
    name: '比洞',
    players: players,
    pairings: pairings,
    holes: gameHoles(),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('match-2'), { reward: 'none', pushRule: 'none' })
  };
}

function makeHost(parties, scores, opts) {
  opts = opts || {};
  var holeOrder = catalog.HOLES.slice();
  var pars = {};
  holeOrder.forEach(function (h) {
    pars[h] = 4;
  });
  var players = parties.map(function (p) {
    return {
      playerId: p.partyId,
      displayName: p.displayName,
      groupId: p.groupId || 'g1',
      avatar: p.avatar || ''
    };
  });
  var ctx = hostMod.emptyContext({
    matchId: opts.matchId || 'm-m2',
    groupId: opts.groupId || 'g1',
    scope: opts.scope || 'group',
    seriesId: opts.seriesId || '',
    roundId: opts.roundId || '',
    revision: 'r1',
    holeContextReady: true,
    holeOrder: holeOrder,
    pars: pars,
    allowBigPot: true,
    players: players,
    scoreParties: parties,
    officialScoresByPartyId: scores
  });
  return hostMod.buildPresentation(ctx);
}

function holesOf(n) {
  var holes = {};
  catalog.HOLES.forEach(function (label) {
    holes[label] = { score: n };
  });
  return { holes: holes };
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
        return 'm2g_' + n;
      };
    })()
  });
  facade.setImplementation(repo);
  return repo;
}

function attach(host) {
  hostSession.clearHostContext();
  hostSession.setHostContext(host);
  bind.attachHost(host);
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
    setData: function (patch, cb) {
      Object.assign(this.data, patch);
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

function findGameOpt(options, gameId) {
  var hit = null;
  (options || []).forEach(function (item) {
    if (item.id === gameId) hit = item;
    (item.children || []).forEach(function (child) {
      if (child.id === gameId) hit = child;
    });
  });
  return hit;
}

function scoreSnap(nameMap, scoreMap) {
  var scoresByPlayer = {};
  var slots = [];
  Object.keys(scoreMap).forEach(function (id) {
    scoresByPlayer[id] = { scores: filled18(scoreMap[id]) };
    slots.push({ playerId: id, name: nameMap[id] || id });
  });
  return scoringSnap.fromGame(
    {
      gameId: 'm-m2',
      groups: [
        {
          groupId: 'g1',
          playersSlots: slots,
          scoresByPlayer: scoresByPlayer
        }
      ]
    },
    { scope: 'group', groupId: 'g1', matchId: 'm-m2', allowBigPot: true }
  );
}

var nameMap = { pA: '甲', pB: '乙', pC: '丙', pD: '丁' };

var parties = [
  { partyId: 'pA', partyType: 'player', displayName: '甲', memberPlayerIds: ['pA'], groupId: 'g1' },
  { partyId: 'pB', partyType: 'player', displayName: '乙', memberPlayerIds: ['pB'], groupId: 'g1' },
  { partyId: 'pC', partyType: 'player', displayName: '丙', memberPlayerIds: ['pC'], groupId: 'g1' },
  { partyId: 'pD', partyType: 'player', displayName: '丁', memberPlayerIds: ['pD'], groupId: 'g1' }
];
var scores = {
  pA: holesOf(3),
  pB: holesOf(5),
  pC: holesOf(4),
  pD: holesOf(6)
};
var ids = ['pA', 'pB', 'pC', 'pD'];
var pairs = allPairs(ids);

installRepo();
var host = makeHost(parties, scores);
attach(host);
bind.discardSetupDraft();
var game = bind.addGame(
  'score',
  match2Instance(
    [
      { id: 'pA' },
      { id: 'pB' },
      { id: 'pC' },
      { id: 'pD' }
    ],
    pairs
  )
);

assert('1 4方比洞生成6个pair', !!(game && game.id) && pairs.length === 6 && (game.pairings || []).filter(function (p) {
  return p.on !== false;
}).length === 6);

var tab = makeTab({
  entry: 'score',
  hostSnapshot: scoreSnap(nameMap, { pA: 3, pB: 5, pC: 4, pD: 6 })
});
attachTab(tab);
attach(host);

var opt = findGameOpt(tab.data.gameOptions, game.id);
var overall = bind.listBoard('score', game.id);
var boardAB = bind.listBoard('score', game.id, pairId('pA', 'pB'));
var boardCD = bind.listBoard('score', game.id, pairId('pC', 'pD'));

assert(
  '2 初次进入 activePairId 为空，显示整体汇总',
  tab.data.activePairId === '' &&
    (tab.data.board.players || []).length === 4 &&
    (overall.players || []).length === 4
);

assert(
  '3 主比洞点击显示全部6个pair',
  tab.data.activeGameId === game.id &&
    tab.data.activeGameName === '比洞' &&
    opt &&
    opt.hasPairs &&
    (opt.pairs || []).length === 6
);

assert('4 二级菜单有6项', (opt.pairs || []).length === 6);

tab.onSelectPair({ currentTarget: { dataset: { gid: game.id, pid: pairId('pA', 'pB') } } });
assert(
  '5 点击 pair AB 只显示 AB',
  tab.data.activePairId === pairId('pA', 'pB') &&
    (tab.data.board.players || []).map(function (p) { return p.id; }).join(',') === 'pA,pB' &&
    (boardAB.players || []).length === 2
);

tab.onSelectPair({ currentTarget: { dataset: { gid: game.id, pid: pairId('pC', 'pD') } } });
assert(
  '6 点击 pair CD 切换为 CD',
  tab.data.activePairId === pairId('pC', 'pD') &&
    (tab.data.board.players || []).map(function (p) { return p.id; }).join(',') === 'pC,pD' &&
    (boardCD.players || []).map(function (p) { return p.id; }).join(',') === 'pC,pD'
);

var totalsCD = (tab.data.board.totals || []).slice();
tab.onSelectGame({ currentTarget: { dataset: { id: game.id } } });
assert(
  '7 再点击主比洞回全部汇总',
  tab.data.activePairId === '' &&
    (tab.data.board.players || []).length === 4 &&
    (tab.data.board.totals || []).length === 4 &&
    JSON.stringify(tab.data.board.totals) !== JSON.stringify(totalsCD)
);

assert(
  '8 不默认锁定第一 pair',
  tab.data.activePairId === '' &&
    !(opt.pairs || [])[0].on &&
    !/activePairId = String\(pairs\[0\]\.id\)/.test(
      fs.readFileSync(path.join(gameRoot, 'components/game-tab/index.js'), 'utf8')
    )
);

var overallIds = (overall.players || []).map(function (p) { return p.id; }).sort().join(',');
assert(
  '9 整体汇总不把6场合成四方一场',
  overallIds === 'pA,pB,pC,pD' &&
    (overall.players || []).length === 4 &&
    (boardAB.players || []).length === 2 &&
    game.catalogId === 'match-2' &&
    (game.pairings || []).length === 6
);

function hasTone(board) {
  var ok = false;
  (board.holes || []).forEach(function (h) {
    (h.cells || []).forEach(function (c) {
      if (c.cls) ok = true;
    });
  });
  (board.totals || []).forEach(function (c) {
    if (c.cls) ok = true;
  });
  return ok;
}
assert('10 正负结果颜色保持', hasTone(overall) && hasTone(boardAB) && hasTone(boardCD));

assert(
  '11 头像昵称正确',
  (overall.players || []).map(function (p) { return p.name; }).join(',') === '甲,乙,丙,丁' &&
    (opt.pairs || []).some(function (p) { return p.name.indexOf('甲') >= 0 && p.name.indexOf('乙') >= 0; })
);

function runEntry(entry) {
  var t = makeTab({
    entry: entry,
    hostSnapshot: scoreSnap(nameMap, { pA: 3, pB: 5, pC: 4, pD: 6 }),
    scope: entry === 'match' ? 'match' : 'group'
  });
  attachTab(t);
  attach(host);
  return t;
}

var hubTab = runEntry('hub');
var matchTab = runEntry('match');
assert(
  '12 记分页/Hub/赛事详情行为一致',
  tab.data.activePairId === '' &&
    hubTab.data.activePairId === '' &&
    matchTab.data.activePairId === '' &&
    (tab.data.board.players || []).length === 4 &&
    (hubTab.data.board.players || []).length === 4 &&
    (matchTab.data.board.players || []).length === 4
);

var flow = makeTab({
  entry: 'match',
  layoutMode: 'flow',
  hostSnapshot: scoreSnap(nameMap, { pA: 3, pB: 5, pC: 4, pD: 6 })
});
attachTab(flow);
attach(host);
assert('13a 球队详情整体汇总行数', (flow.data.board.totals || []).length === 4);
flow.onSelectPair({
  currentTarget: { dataset: { gid: game.id, pid: pairId('pA', 'pB') } }
});
assert(
  '13 球队详情底部汇总随整体/单pair切换',
  (flow.data.board.totals || []).length === 2 && flow.data.activePairId === pairId('pA', 'pB')
);
flow.onSelectGame({ currentTarget: { dataset: { id: game.id } } });
assert('13b 切回整体汇总', (flow.data.board.totals || []).length === 4 && flow.data.activePairId === '');

installRepo();
attach(makeHost(parties.slice(0, 2), { pA: holesOf(3), pB: holesOf(5) }));
bind.discardSetupDraft();
var two = bind.addGame(
  'score',
  match2Instance(
    [{ id: 'pA' }, { id: 'pB' }],
    [{ id: pairId('pA', 'pB'), leftId: 'pA', rightId: 'pB', on: true, strokes: 0 }]
  )
);
var twoTab = makeTab({
  entry: 'score',
  hostSnapshot: scoreSnap({ pA: '甲', pB: '乙' }, { pA: 3, pB: 5 })
});
attachTab(twoTab);
var twoOpt = findGameOpt(twoTab.data.gameOptions, two.id);
assert(
  '14 2方只有1个pair时仍按沙盒行为正常',
  twoTab.data.activePairId === '' &&
    (!twoOpt || !twoOpt.hasPairs) &&
    (twoTab.data.board.players || []).length === 2
);

var comboParties = [
  {
    partyId: 'c1',
    partyType: 'combination',
    displayName: '组合甲',
    memberPlayerIds: ['m1', 'm2'],
    groupId: 'g1'
  },
  {
    partyId: 'c2',
    partyType: 'combination',
    displayName: '组合乙',
    memberPlayerIds: ['m3', 'm4'],
    groupId: 'g1'
  },
  {
    partyId: 'c3',
    partyType: 'combination',
    displayName: '组合丙',
    memberPlayerIds: ['m5', 'm6'],
    groupId: 'g1'
  },
  {
    partyId: 'c4',
    partyType: 'combination',
    displayName: '组合丁',
    memberPlayerIds: ['m7', 'm8'],
    groupId: 'g1'
  }
];
installRepo();
attach(
  makeHost(comboParties, {
    c1: holesOf(3),
    c2: holesOf(5),
    c3: holesOf(4),
    c4: holesOf(6)
  })
);
bind.discardSetupDraft();
var comboIds = ['c1', 'c2', 'c3', 'c4'];
var comboGame = bind.addGame(
  'score',
  match2Instance(
    comboIds.map(function (id) {
      return { id: id };
    }),
    allPairs(comboIds)
  )
);
var comboBoard = bind.listBoard('score', comboGame.id);
assert(
  '组合方整体汇总 4 行且名称来自 party',
  (comboBoard.players || []).length === 4 &&
    (comboBoard.players || []).every(function (p) {
      return p.partyType === 'combination' && (p.memberNames || []).length === 2;
    })
);

var tabJs = fs.readFileSync(path.join(gameRoot, 'components/game-tab/index.js'), 'utf8');
assert(
  '点击主菜单清空 pair 与沙盒一致',
  /activeGameId: id, activePairId: ""/.test(tabJs) &&
    /setBoardView\([^,]+, id, ""\)/.test(tabJs)
);

console.log('SUMMARY passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
