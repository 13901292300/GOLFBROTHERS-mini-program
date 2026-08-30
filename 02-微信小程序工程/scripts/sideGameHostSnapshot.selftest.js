/**
 * 宿主 snapshot 提取器：只选当前数据，不归一化 party。
 * 运行：node scripts/sideGameHostSnapshot.selftest.js
 */
var path = require('path');
var fs = require('fs');

if (typeof global.wx === 'undefined') {
  global.wx = {
    getStorageSync: function () {
      return '';
    },
    setStorageSync: function () {}
  };
}

var scoringSnap = require('../miniprogram/subpackages/scoring/utils/sideGameHostSnapshot.js');
var tournamentSnap = require('../miniprogram/subpackages/tournament/utils/sideGameHostSnapshot.js');
var host = require('../miniprogram/subpackages/game/utils/gameHostContext.js');

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

function filled18(n) {
  var a = [];
  for (var i = 0; i < 18; i++) a.push(n);
  return a;
}

function hasFn(value) {
  if (!value || typeof value !== 'object') return false;
  if (typeof value === 'function') return true;
  if (Array.isArray(value)) {
    return value.some(hasFn);
  }
  return Object.keys(value).some(function (k) {
    return typeof value[k] === 'function' || hasFn(value[k]);
  });
}

var game = {
  gameId: 'g-casual',
  gameMode: '个人比杆赛',
  front9Course: 'C',
  back9Course: 'D',
  updatedAt: 9,
  groups: [
    {
      groupId: 'g1',
      playersSlots: [
        { playerId: 'u1', name: 'A' },
        { playerId: 'u2', name: 'B' }
      ],
      scoresByPlayer: {
        u1: { scores: filled18(4) },
        u2: { scores: filled18(5) }
      }
    }
  ]
};

var gameSnap = scoringSnap.fromGame(game, { scope: 'group', groupId: 'g1', allowBigPot: true });
assert('scoring fromGame source=gameStore', gameSnap.source === 'gameStore');
assert('scoring fromGame matchId', gameSnap.matchId === 'g-casual');
assert('scoring fromGame allowBigPot', gameSnap.allowBigPot === true);
assert('scoring snapshot 可 JSON', JSON.stringify(gameSnap).length > 10);
assert('scoring snapshot 无函数', hasFn(gameSnap) === false);
assert('scoring 不含 store 句柄', gameSnap.getGame == null && gameSnap.saveGame == null);

game.groups[0].playersSlots[0].name = 'MUTATED';
assert('改原 game 不污染 snapshot', gameSnap.groups[0].playersSlots[0].name === 'A');
gameSnap.groups[0].playersSlots[0].name = 'SNAP';
assert('改 snapshot 不污染原 game', game.groups[0].playersSlots[0].name === 'MUTATED');

var viaHost = host.buildFromHostSnapshot(gameSnap);
assert('提取器+归一化器仍得 2 player 方', viaHost.scoreParties.length === 2);
assert('归一化后仍有个人便利视图', !!viaHost.officialScoresByPlayerId.u1);

var match = {
  matchId: 'team-match-1',
  gameMode: '四人两球比杆赛',
  front9Course: 'C',
  back9Course: 'D',
  seriesContext: { seriesId: 's1', roundId: 'r1' },
  groups: [
    {
      groupId: 'g1',
      players: [
        { userId: 'u1', position: 1 },
        { userId: 'u2', position: 2 },
        { userId: 'u3', position: 3 },
        { userId: 'u4', position: 4 }
      ]
    }
  ],
  scoreEntities: {
    g1: [
      { entityId: 'c1', members: ['u1', 'u2'] },
      { entityId: 'c2', members: ['u3', 'u4'] }
    ]
  },
  scoreData: {
    g1: {
      teamScoresByEntity: [
        { teamId: 'c1', scores: filled18(4) },
        { teamId: 'c2', scores: filled18(5) }
      ]
    }
  }
};

var tSnap = tournamentSnap.buildFromMatch(match, { scope: 'match', allowBigPot: false });
assert('tournament source=teamMatch', tSnap.source === 'teamMatch');
assert('tournament 只带当前 matchId', tSnap.matchId === 'team-match-1');
assert('tournament seriesId/roundId 来自当前 match', tSnap.seriesId === 's1' && tSnap.roundId === 'r1');
assert('tournament snapshot 可 JSON', JSON.stringify(tSnap).indexOf('team-match-1') >= 0);
assert('tournament 无函数', hasFn(tSnap) === false);
assert('tournament 不读其它轮次字段', tSnap.rounds == null && tSnap.stations == null);

var comboCtx = host.buildFromHostSnapshot(tSnap);
assert('tournament snapshot 归一化为 combination', comboCtx.scoreKind === 'combination');
assert('tournament snapshot 2 方', comboCtx.scoreParties.length === 2, String(comboCtx.scoreParties.length));

match.groups[0].groupId = 'g-hack';
assert('改原 match 不污染 snapshot', tSnap.groups[0].groupId === 'g1');
tSnap.groups[0].groupId = 'g-snap';
assert('改 snapshot 不污染原 match', match.groups[0].groupId === 'g-hack');

var scoringJs = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'scoring', 'utils', 'sideGameHostSnapshot.js'),
  'utf8'
);
var tournamentJs = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'utils', 'sideGameHostSnapshot.js'),
  'utf8'
);
assert(
  '提取器不做 party 归一化',
  scoringJs.indexOf('scoreParties') < 0 &&
    tournamentJs.indexOf('scoreParties') < 0 &&
    scoringJs.indexOf('officialScoresByPartyId') < 0 &&
    tournamentJs.indexOf('holeOrder') < 0
);
assert(
  '提取器不 require game 分包',
  scoringJs.indexOf('subpackages/game') < 0 && tournamentJs.indexOf('subpackages/game') < 0
);
assert(
  '主包无完整适配器',
  !fs.existsSync(path.join(__dirname, '..', 'miniprogram', 'utils', 'gameHostContext.js'))
);

console.log('\nsideGameHostSnapshot.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
