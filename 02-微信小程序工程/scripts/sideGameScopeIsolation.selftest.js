/**
 * 多组 HUB / 球队赛：单组与中间页游戏实例作用域隔离。
 * 运行：node scripts/sideGameScopeIsolation.selftest.js
 */
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

function holesFor(ids) {
  var map = {};
  ids.forEach(function (id) {
    var scores = {};
    catalog.HOLES.forEach(function (h) {
      scores[h] = 4;
    });
    map[id] = { scores: scores };
  });
  return map;
}

function makeGroupHost(matchId, groupId, playerIds) {
  var parties = playerIds.map(function (id) {
    return {
      partyId: id,
      partyType: 'player',
      displayName: id,
      memberPlayerIds: [id],
      groupId: groupId
    };
  });
  return hostMod.emptyContext({
    matchId: matchId,
    groupId: groupId,
    scope: 'group',
    currentUserId: 'me',
    holeContextReady: true,
    holeOrder: catalog.HOLES.slice(),
    allowBigPot: true,
    players: playerIds.map(function (id) {
      return { playerId: id, groupId: groupId };
    }),
    scoreParties: parties,
    officialScoresByPartyId: holesFor(playerIds)
  });
}

function makeMatchHost(matchId, groups) {
  var parties = [];
  var players = [];
  Object.keys(groups).forEach(function (gid) {
    groups[gid].forEach(function (id) {
      parties.push({
        partyId: id,
        partyType: 'player',
        displayName: id,
        memberPlayerIds: [id],
        groupId: gid
      });
      players.push({ playerId: id, groupId: gid });
    });
  });
  return hostMod.emptyContext({
    matchId: matchId,
    groupId: '',
    scope: 'match',
    currentUserId: 'me',
    holeContextReady: true,
    holeOrder: catalog.HOLES.slice(),
    allowBigPot: false,
    players: players,
    scoreParties: parties,
    officialScoresByPartyId: holesFor(players.map(function (p) {
      return p.playerId;
    }))
  });
}

function stroke2(players, title) {
  return {
    catalogId: 'stroke-2',
    name: title || '比杆',
    players: players,
    pairings: [
      { id: 'pair-1', leftId: players[0].id, rightId: players[1].id, on: true, strokes: 0 }
    ],
    holes: catalog.HOLES.map(function (label) {
      return { label: label, on: true };
    }),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    ruleSnapshot: rec.buildRuleSnapshot('stroke-2')
  };
}

identity.setImplementation({
  implementation: 'test',
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
      return 'iso_' + n;
    };
  })(),
  clock: function () {
    return 4000;
  }
});
facade.setImplementation(repo);
hostSession.clearHostContext();

var matchId = 'm-iso';
var hostA = makeGroupHost(matchId, 'gA', ['a1', 'a2']);
var hostB = makeGroupHost(matchId, 'gB', ['b1', 'b2']);
var hostMatch = makeMatchHost(matchId, { gA: ['a1', 'a2'], gB: ['b1', 'b2'] });

hostSession.setHostContext(hostA);
bind.attachHost(hostA);
var gameA = bind.addGame('score', stroke2([{ id: 'a1' }, { id: 'a2' }], 'A组比杆'));
assert('A组写入成功', !!(gameA && gameA.id), gameA && gameA.reason);
var recA = repo.getById(gameA.id).data;
assert(
  'A组写入 scope=group + groupId=gA',
  recA.scope === 'group' && recA.groupId === 'gA' && recA.matchId === matchId
);

hostSession.setHostContext(hostB);
bind.attachHost(hostB);
var gameB = bind.addGame('score', stroke2([{ id: 'b1' }, { id: 'b2' }], 'B组比杆'));
assert('B组写入成功', !!(gameB && gameB.id));
var recB = repo.getById(gameB.id).data;
assert('B组写入 scope=group + groupId=gB', recB.scope === 'group' && recB.groupId === 'gB');

hostSession.setHostContext(hostMatch);
bind.attachHost(hostMatch);
var gameM = bind.addGame('hub', stroke2([{ id: 'a1' }, { id: 'b1' }], '中间页比杆'));
assert('中间页写入成功', !!(gameM && gameM.id), gameM && gameM.reason);
var recM = repo.getById(gameM.id).data;
assert(
  '中间页写入 scope=match 且不带 groupId',
  recM.scope === 'match' && recM.groupId === '' && recM.matchId === matchId
);

hostSession.setHostContext(hostA);
bind.attachHost(hostA);
var idsA = bind.listGames('score').map(function (g) {
  return g.id;
});
assert('A组列表只有A组游戏', idsA.length === 1 && idsA[0] === gameA.id, JSON.stringify(idsA));
assert('A组列表不含中间页', idsA.indexOf(gameM.id) < 0);

hostSession.setHostContext(hostB);
bind.attachHost(hostB);
var idsB = bind.listGames('score').map(function (g) {
  return g.id;
});
assert('B组列表只有B组游戏', idsB.length === 1 && idsB[0] === gameB.id, JSON.stringify(idsB));
assert('B组不显示A组', idsB.indexOf(gameA.id) < 0);

hostSession.setHostContext(hostMatch);
bind.attachHost(hostMatch);
var idsHub = bind.listGames('hub').map(function (g) {
  return g.id;
});
var idsMatch = bind.listGames('match').map(function (g) {
  return g.id;
});
assert('中间页 hub 只有 match 实例', idsHub.length === 1 && idsHub[0] === gameM.id, JSON.stringify(idsHub));
assert('球队赛 match 入口同样隔离', idsMatch.length === 1 && idsMatch[0] === gameM.id);
assert('中间页不显示A/B组', idsHub.indexOf(gameA.id) < 0 && idsHub.indexOf(gameB.id) < 0);

hostSession.setHostContext(hostA);
bind.attachHost(hostA);
bind.removeGame('score', gameA.id);
assert('删A组不影响B组', !!repo.getById(gameB.id).ok);
assert('删A组不影响中间页', !!repo.getById(gameM.id).ok);

hostSession.setHostContext(hostMatch);
bind.attachHost(hostMatch);
var stillHub = bind.listGames('hub').map(function (g) {
  return g.id;
});
assert('删A后中间页仍只有自己', stillHub.length === 1 && stillHub[0] === gameM.id);

var samePeopleMatch = bind.addGame('hub', stroke2([{ id: 'a1' }, { id: 'a2' }], '中间页同人'));
assert('同一玩法同一人两边是独立实例', !!(samePeopleMatch && samePeopleMatch.id) && samePeopleMatch.id !== gameA.id);

hostSession.setHostContext(hostA);
bind.attachHost(hostA);
var afterTwin = bind.listGames('score');
assert('A组不出现中间页同人实例', afterTwin.every(function (g) {
  return g.id !== samePeopleMatch.id;
}));

var amb = repo.create({
  matchId: matchId,
  groupId: '',
  scope: 'group',
  ruleId: 'stroke-2',
  ruleSnapshot: rec.buildRuleSnapshot('stroke-2'),
  title: '来源不明',
  participantParties: [
    { partyId: 'a1', partyType: 'player', memberPlayerIds: ['a1'] },
    { partyId: 'a2', partyType: 'player', memberPlayerIds: ['a2'] }
  ],
  config: rec.emptyConfig(),
  visibility: 'public',
  hostContext: hostA,
  idempotencyKey: 'amb_1'
});
assert('无 groupId 的 group 实例创建被拒绝或被隔离', !amb.ok || amb.reason === 'missing_group');

var hubListed = repo.listVisible({
  matchId: matchId,
  groupId: '',
  scope: 'match',
  hostContext: hostMatch,
  viewerUserId: 'me'
});
assert(
  '歧义 group+空groupId 不进入任一 TAB',
  (hubListed.data.items || []).every(function (x) {
    return x.scope === 'match';
  }) &&
    repo.listVisible({
      matchId: matchId,
      groupId: '',
      scope: 'group',
      hostContext: hostA,
      viewerUserId: 'me'
    }).data.items.length === 0
);

hostSession.setHostContext(hostMatch);
assert(
  '查询空 group 不回退 match host',
  !hostSession.getHostContext({ matchId: matchId, scope: 'group', groupId: '' })
);

hostSession.setHostContext(hostA);
bind.attachHost(hostA);
var leakedHubWhileGroupAttached = bind.listGames('hub').map(function (g) {
  return g.id;
});
assert(
  '即使当前 attach 在A组，hub 入口仍只读 match',
  leakedHubWhileGroupAttached.indexOf(gameB.id) < 0 &&
    leakedHubWhileGroupAttached.indexOf(samePeopleMatch.id) >= 0,
  JSON.stringify(leakedHubWhileGroupAttached)
);

console.log('\nsideGameScopeIsolation.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
