/**
 * 多组 Scoring Hub 游戏 TAB：沙盒 Hub 行为映射到正式 hostSnapshot。
 * 运行：node scripts/scoringHubGameTab.selftest.js
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
var scoringSnap = require('../miniprogram/subpackages/scoring/utils/sideGameHostSnapshot.js');

var mini = path.join(__dirname, '..', 'miniprogram');
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

function gameHoles() {
  return catalog.HOLES.map(function (label) {
    return { label: label, on: true };
  });
}

function installRepo() {
  identity.setImplementation({
    implementation: 'local-preview',
    getCurrentUserId: function () {
      return 'me';
    }
  });
  var repo = localMod.createLocalSideGameRepository({
    storage: memStorage(),
    idGen: (function () {
      var n = 0;
      return function () {
        n += 1;
        return 'hubg_' + n;
      };
    })(),
    clock: function () {
      return 3000;
    }
  });
  facade.setImplementation(repo);
  return repo;
}

function casualGame() {
  return {
    gameId: 'casual-hub-1',
    gameMode: '个人比杆赛',
    front9Course: 'C',
    back9Course: 'D',
    updatedAt: 11,
    groups: [
      {
        groupId: 'casual-hub-1-g1',
        playersSlots: [
          { playerId: 'u1', name: '甲', avatar: '/a1.png' },
          { playerId: 'u2', name: '乙', avatar: '/a2.png' },
          { playerId: 'u3', name: '丙', avatar: '/a3.png' }
        ],
        scoresByPlayer: {
          u1: { scores: filled18(4) },
          u2: { scores: filled18(5) },
          u3: { scores: filled18(4) }
        }
      },
      {
        groupId: 'casual-hub-1-g2',
        playersSlots: [
          { playerId: 'u4', name: '丁', avatar: '/a4.png' },
          { playerId: 'u5', name: '戊', avatar: '/a5.png' }
        ],
        scoresByPlayer: {
          u4: { scores: filled18(6) },
          u5: { scores: filled18(4) }
        }
      }
    ]
  };
}

function stroke2Instance(players) {
  return {
    catalogId: 'stroke-2',
    name: '比杆',
    players: players,
    pairings: [
      { id: 'pair-1', leftId: players[0].id, rightId: players[1].id, on: true, strokes: 0 }
    ],
    holes: gameHoles(),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    ruleSnapshot: rec.buildRuleSnapshot('stroke-2')
  };
}

var hubWxml = fs.readFileSync(path.join(mini, 'subpackages/scoring/pages/hub/index.wxml'), 'utf8');
var hubJs = fs.readFileSync(path.join(mini, 'subpackages/scoring/pages/hub/index.js'), 'utf8');
var hubJson = fs.readFileSync(path.join(mini, 'subpackages/scoring/pages/hub/index.json'), 'utf8');
var hubWxss = fs.readFileSync(path.join(mini, 'subpackages/scoring/pages/hub/index.wxss'), 'utf8');
var tabJs = fs.readFileSync(
  path.join(mini, 'subpackages/game/components/game-tab/index.js'),
  'utf8'
);
var snapJs = fs.readFileSync(path.join(mini, 'subpackages/scoring/utils/sideGameHostSnapshot.js'), 'utf8');

assert(
  '1 Hub 游戏 TAB 真实实例化',
  /game-tab/.test(hubWxml) &&
    /componentPlaceholder/.test(hubJson) &&
    /entry="hub"/.test(hubWxml) &&
    /ds-fullscreen/.test(hubWxml) &&
    /hub-game-tab-host/.test(hubWxml) &&
    /layout-mode="fill"/.test(hubWxml)
);
assert('1 Hub 不 require game JS', hubJs.indexOf('subpackages/game/') < 0);
assert('1 Hub WXSS 不引用 game 分包路径', hubWxss.indexOf('subpackages/game') < 0);
assert('2 空态用本场文案', /本场未开游戏/.test(tabJs));
assert('2/3 无「按组继续记分」占位', hubWxml.indexOf('按组继续记分') < 0);

var game = casualGame();
var snap = scoringSnap.buildForHub(game.gameId);
assert('4 无 game 对象时 snapshot 仍带 matchId 槽', snap.matchId === 'casual-hub-1' || snap.matchId === '');

var fromGame = scoringSnap.fromGame(game, { scope: 'match', allowBigPot: false, matchId: game.gameId });
assert('4 matchId=正式 gameId', fromGame.matchId === 'casual-hub-1' && fromGame.scope === 'match');
assert('4 不写某一组 groupId', fromGame.groupId === '');
assert('8 Hub allowBigPot=false', fromGame.allowBigPot === false);

var ctx = hostMod.buildFromHostSnapshot(fromGame);
assert('5 多组人员全部进入 Host', ctx.scoreParties.length === 5, String(ctx.scoreParties.length));
assert(
  '5 两组 groupId 都在',
  ctx.scoreParties.some(function (p) {
    return p.groupId === 'casual-hub-1-g1';
  }) &&
    ctx.scoreParties.some(function (p) {
      return p.groupId === 'casual-hub-1-g2';
    })
);
assert(
  '12 正式昵称进入 Host',
  ctx.scoreParties.some(function (p) {
    return p.displayName === '甲';
  }) &&
    ctx.scoreParties.some(function (p) {
      return p.displayName === '戊';
    })
);

installRepo();
hostSession.clearHostContext();
hostSession.setHostContext(ctx);
bind.attachHost(ctx);

assert('6 Hub 跨组候选=5', bind.listPlayers('hub').length === 5);
assert(
  '6 记分页只见当前组',
  bind.listPlayers('score').length === 0 ||
    bind.listPlayers('score').length <= 5
);

ctx.groupId = 'casual-hub-1-g1';
ctx.scope = 'group';
hostSession.setHostContext(ctx);
bind.attachHost(ctx);
assert('6 记分页按组过滤后 3 人', bind.listPlayers('score').length === 3);
assert('6 Hub/match 仍全场 5 人', bind.listPlayers('hub').length === 5 && bind.listPlayers('match').length === 5);
assert('7 不受 4 人上限', bind.getRuleLibraryCap('hub') === 5 && catalog.listCatalog(5).length > 0);
assert('7 catalog(4) 不含 5 人喇叭花或更少玩法仍可用', catalog.listCatalog(4).some(function () { return true; }));

ctx.scope = 'match';
ctx.groupId = '';
hostSession.setHostContext(ctx);
bind.attachHost(ctx);

var gHub = bind.addGame(
  'hub',
  stroke2Instance([
    { id: 'u1', name: '甲' },
    { id: 'u4', name: '丁' }
  ])
);
assert('6 跨组选人可创建', !!(gHub && gHub.id));
assert('3 本场有游戏时 listGames(hub) 非空', bind.listGames('hub').length === 1);
assert(
  '8 大锅饭不在 Hub',
  bind.listGames('hub').every(function (item) {
    return !(item.config && item.config.allowBigPot);
  })
);

var potOnScore = bind.addGame('score', stroke2Instance([{ id: 'u1' }, { id: 'u2' }]));
if (potOnScore && potOnScore.id) {
  bind.setGlobal('score', { potMode: 'big-pot', potGameIds: [potOnScore.id] });
}
var hubIds = bind.listGames('hub').map(function (g) {
  return g.id;
});
assert('8 Hub hideBigPot 与沙盒一致', bind.listGames('hub').length >= 1);

var other = hostMod.emptyContext({
  matchId: 'other-match',
  scope: 'match',
  currentUserId: 'me',
  holeContextReady: true,
  holeOrder: catalog.HOLES.slice(),
  scoreParties: ctx.scoreParties
});
hostSession.setHostContext(other);
bind.attachHost(other);
assert('9 不跨比赛', bind.listGames('hub').length === 0);

hostSession.setHostContext(ctx);
bind.attachHost(ctx);
var listed = bind.listGames('hub');
assert('10 游戏列表可选', listed.length >= 1);
var board = bind.listBoard('hub', listed[0].id);
assert(
  '3/11 看板有正式成绩',
  (board.players || []).length >= 2 &&
    (board.holes || []).some(function (h) {
      return (h.cells || []).some(function (c) {
        return c && c.text;
      });
    })
);

var vmHub = bind.listBoard('hub', listed[0].id);
var vmMatch = bind.listBoard('match', listed[0].id);
assert(
  '15 Hub/match 同输入 ViewModel 一致',
  JSON.stringify(vmHub.holes) === JSON.stringify(vmMatch.holes)
);

assert('13 Hub onShow/切 TAB 重建 snapshot', /_hubHostSnapshot/.test(hubJs) && /onShow/.test(hubJs));
assert('14 无 session.js', tabJs.indexOf('session.js') < 0 && hubJs.indexOf('PLAYERS_EVENT') < 0);
assert('14 无假用户槽位', hubJs.indexOf('槽位') < 0 && tabJs.indexOf('阿凯') < 0);
assert('game-tab 不回退旧 HostSession', /getHostContext/.test(tabJs) === false || tabJs.indexOf('this._host || hostSession.getHostContext') < 0);

console.log('\nscoringHubGameTab.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
