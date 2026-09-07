/**
 * match-2 比洞棋盘：恰好 2 方、1 条对决。4 个个人方非法。
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

function onPairings(game) {
  return ((game && game.pairings) || []).filter(function (p) {
    return p && p.on !== false && p.leftId && p.rightId;
  });
}

function createdOk(game) {
  return !!(game && game.id && !game.__fail);
}

function failReason(game) {
  if (!game) return 'null';
  if (game.__fail) return String(game.reason || 'failed');
  return 'unexpected_ok';
}

function match2Instance(players, pairings, extra) {
  extra = extra || {};
  var inst = {
    catalogId: 'match-2',
    name: '比洞',
    players: players,
    pairings: pairings,
    holes: gameHoles(),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('match-2'), { reward: 'none', pushRule: 'none' })
  };
  if (extra.parties) inst.parties = extra.parties;
  return inst;
}

function hostPlayersFromParties(parties) {
  var out = [];
  var seen = {};
  (parties || []).forEach(function (p) {
    var ids = p.memberPlayerIds && p.memberPlayerIds.length ? p.memberPlayerIds : [p.partyId];
    ids.forEach(function (id) {
      if (seen[id]) return;
      seen[id] = true;
      out.push({
        playerId: id,
        displayName: p.partyType === 'combination' ? String(id) : p.displayName || String(id),
        groupId: p.groupId || 'g1',
        avatar: p.avatar || ''
      });
    });
  });
  return out;
}

function makeHost(parties, scores, opts) {
  opts = opts || {};
  var holeOrder = catalog.HOLES.slice();
  var pars = {};
  holeOrder.forEach(function (h) {
    pars[h] = 4;
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
    players: hostPlayersFromParties(parties),
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
  if (!gameId) return hit;
  (options || []).forEach(function (item) {
    if (item.id === gameId) hit = item;
    (item.children || []).forEach(function (child) {
      if (child.id === gameId) hit = child;
    });
  });
  return hit;
}

function scoreSnap(nameMap, scoreMap, matchId) {
  var scoresByPlayer = {};
  var slots = [];
  Object.keys(scoreMap).forEach(function (id) {
    scoresByPlayer[id] = { scores: filled18(scoreMap[id]) };
    slots.push({ playerId: id, name: nameMap[id] || id });
  });
  var mid = matchId || 'm-m2';
  return scoringSnap.fromGame(
    {
      gameId: mid,
      groups: [
        {
          groupId: 'g1',
          playersSlots: slots,
          scoresByPlayer: scoresByPlayer
        }
      ]
    },
    { scope: 'group', groupId: 'g1', matchId: mid, allowBigPot: true }
  );
}

function pairingEnds(game) {
  return onPairings(game).map(function (p) {
    return [p.leftId, p.rightId].sort().join('|');
  });
}

function hasTone(board) {
  var ok = false;
  ((board && board.holes) || []).forEach(function (h) {
    (h.cells || []).forEach(function (c) {
      if (c.cls) ok = true;
    });
  });
  ((board && board.totals) || []).forEach(function (c) {
    if (c.cls) ok = true;
  });
  return ok;
}

function playerIds(board) {
  return ((board && board.players) || []).map(function (p) {
    return p.id;
  });
}

function playerNames(board) {
  return ((board && board.players) || []).map(function (p) {
    return p.name;
  });
}

try {
  var fourParties = [
    { partyId: 'pA', partyType: 'player', displayName: '甲', memberPlayerIds: ['pA'], groupId: 'g1' },
    { partyId: 'pB', partyType: 'player', displayName: '乙', memberPlayerIds: ['pB'], groupId: 'g1' },
    { partyId: 'pC', partyType: 'player', displayName: '丙', memberPlayerIds: ['pC'], groupId: 'g1' },
    { partyId: 'pD', partyType: 'player', displayName: '丁', memberPlayerIds: ['pD'], groupId: 'g1' }
  ];
  installRepo();
  attach(
    makeHost(fourParties, {
      pA: holesOf(3),
      pB: holesOf(5),
      pC: holesOf(4),
      pD: holesOf(6)
    })
  );
  bind.discardSetupDraft();
  var four = bind.addGame(
    'score',
    match2Instance(
      [{ id: 'pA' }, { id: 'pB' }, { id: 'pC' }, { id: 'pD' }],
      [{ id: pairId('pA', 'pB'), leftId: 'pA', rightId: 'pB', on: true, strokes: 0 }]
    )
  );
  assert(
    '4个个人方创建 match-2 返回 party_count',
    !!(four && four.__fail === true && four.reason === 'party_count'),
    failReason(four)
  );
  if (createdOk(four)) {
    assert('4个个人方不得当作合法局继续读棋盘', false, four.id);
  }

  var twoParties = fourParties.slice(0, 2);
  installRepo();
  var twoHost = makeHost(twoParties, { pA: holesOf(3), pB: holesOf(5) });
  attach(twoHost);
  bind.discardSetupDraft();
  var two = bind.addGame(
    'score',
    match2Instance(
      [{ id: 'pA' }, { id: 'pB' }],
      [{ id: pairId('pA', 'pB'), leftId: 'pA', rightId: 'pB', on: true, strokes: 0 }]
    )
  );
  assert('2个个人方创建成功', createdOk(two), failReason(two));
  if (createdOk(two)) {
    var twoPairs = onPairings(two);
    var twoBoard = bind.listBoard('score', two.id);
    var twoTab = makeTab({
      entry: 'score',
      hostSnapshot: scoreSnap({ pA: '甲', pB: '乙' }, { pA: 3, pB: 5 })
    });
    attachTab(twoTab);
    attach(twoHost);
    var twoOpt = findGameOpt(twoTab.data.gameOptions, two.id);
    assert('2个个人方棋盘2行', playerIds(twoBoard).length === 2 && playerIds(twoTab.data.board).length === 2);
    assert(
      '2个个人方仅1条对决',
      twoPairs.length === 1 && pairingEnds(two).join(',') === 'pA|pB'
    );
    assert(
      '2个个人方无6项笛卡尔积菜单',
      twoTab.data.activePairId === '' &&
        (!twoOpt || twoOpt.hasPairs !== true) &&
        ((twoOpt && twoOpt.pairs) || []).length < 2
    );
    assert('2个个人方显示名来自球员', playerNames(twoBoard).join(',') === '甲,乙');
    assert('2个个人方结果色保持', hasTone(twoBoard));
  }

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
    }
  ];
  installRepo();
  var comboHost = makeHost(comboParties, { c1: holesOf(3), c2: holesOf(5) }, { matchId: 'm-m2c' });
  attach(comboHost);
  bind.discardSetupDraft();
  var comboGame = bind.addGame(
    'score',
    match2Instance(
      [{ id: 'c1' }, { id: 'c2' }],
      [{ id: pairId('c1', 'c2'), leftId: 'c1', rightId: 'c2', on: true, strokes: 0 }],
      { parties: comboParties }
    )
  );
  assert('2个combination创建成功', createdOk(comboGame), failReason(comboGame));
  if (createdOk(comboGame)) {
    var comboPairs = onPairings(comboGame);
    var comboBoard = bind.listBoard('score', comboGame.id);
    var comboTab = makeTab({
      entry: 'score',
      hostSnapshot: scoreSnap(
        { m1: '甲1', m2: '甲2', m3: '乙1', m4: '乙2' },
        { m1: 3, m2: 3, m3: 5, m4: 5 },
        'm-m2c'
      )
    });
    attachTab(comboTab);
    attach(comboHost);
    var comboOpt = findGameOpt(comboTab.data.gameOptions, comboGame.id);
    var comboPlayers = comboBoard.players || [];
    assert('2个combination棋盘2行', comboPlayers.length === 2 && playerIds(comboTab.data.board).length === 2);
    assert(
      '2个combination仅1条party对决',
      comboPairs.length === 1 && pairingEnds(comboGame).join(',') === 'c1|c2'
    );
    assert(
      '对决两端是partyId不是球员笛卡尔积',
      comboPairs[0].leftId !== 'm1' &&
        comboPairs[0].rightId !== 'm2' &&
        ['c1', 'c2'].indexOf(comboPairs[0].leftId) >= 0 &&
        ['c1', 'c2'].indexOf(comboPairs[0].rightId) >= 0
    );
    assert(
      '组合显示名来自party或成员',
      comboPlayers.every(function (p) {
        var name = String(p.name || '');
        var fromParty = name.indexOf('组合') >= 0;
        var fromMembers = (p.memberNames || []).length === 2;
        return p.partyType === 'combination' && (fromParty || fromMembers);
      })
    );
    assert(
      'combination无6项球员菜单',
      comboTab.data.activePairId === '' &&
        (!comboOpt || comboOpt.hasPairs !== true) &&
        ((comboOpt && comboOpt.pairs) || []).length < 2
    );
  }

  var tabJs = fs.readFileSync(path.join(gameRoot, 'components/game-tab/index.js'), 'utf8');
  assert(
    '主菜单点击清空 activePairId',
    /activeGameId: id, activePairId: ""/.test(tabJs) && /setBoardView\([^,]+, id, ""\)/.test(tabJs)
  );
  assert(
    '不默认锁定第一 pair',
    !/activePairId = String\(pairs\[0\]\.id\)/.test(tabJs)
  );
} catch (err) {
  failed += 1;
  console.log('FAIL  unexpected throw :: ' + (err && err.stack ? err.stack : err));
}

console.log('SUMMARY passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
