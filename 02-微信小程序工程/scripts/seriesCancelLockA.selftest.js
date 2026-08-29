/**
 * SERIES-CANCEL-LOCK-A：Series 报名取消资格只读门闩
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesCancelLockA.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

if (typeof global.wx === 'undefined') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    removeStorageSync: function () {}
  };
}

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var gatePath = seriesTestPaths.util('seriesRegistrationCancellationGate.js');
var gateSrc = fs.readFileSync(gatePath, 'utf8');
var gate = require(gatePath);
var pageJs = fs.readFileSync(
  path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail', 'index.js'),
  'utf8'
);
var detailJs = fs.readFileSync(
  path.join(mini, 'subpackages', 'tournament', 'pages', 'detail', 'index.js'),
  'utf8'
);

var passed = 0;
var failed = 0;
var failures = [];

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    failures.push(name + (detail ? ' :: ' + detail : ''));
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function freeze(o) {
  return JSON.parse(JSON.stringify(o));
}

function stable(o) {
  return JSON.stringify(o);
}

function emptySlots(occupied) {
  var players = [];
  var i;
  for (i = 1; i <= 4; i++) {
    players.push({
      position: i,
      userId: occupied[i - 1] || '',
      playerId: occupied[i - 1] || ''
    });
  }
  return players;
}

function entityMembers(ids) {
  return (ids || []).map(function (id) {
    return { userId: id };
  });
}

function makeSeries(overrides) {
  return Object.assign(
    {
      seriesId: 'series-lock-a',
      publishToken: 'tok-lock-a',
      lifecycleStatus: 'published',
      registrationState: 'open',
      rounds: [
        { roundId: 'r1', index: 1, matchId: 'm1' },
        { roundId: 'r2', index: 2, matchId: 'm2' }
      ]
    },
    overrides || {}
  );
}

function makeMatch(opts) {
  var o = opts || {};
  var occupants = o.occupants || [];
  var players = occupants.length ? emptySlots(occupants) : [];
  return {
    matchId: o.matchId || 'm1',
    status: o.status || 'registering',
    gameMode: o.gameMode || '个人比杆赛',
    seriesContext: {
      managed: true,
      seriesId: 'series-lock-a',
      roundId: o.roundId || 'r1',
      publishToken: o.publishToken || 'tok-lock-a'
    },
    groups: players.length
      ? [{ groupId: 'g1', groupName: '第1组', players: players, playersSlots: freeze(players) }]
      : [],
    pairings: o.pairings || {},
    scoreEntities: o.scoreEntities || {},
    scoreData: o.scoreData || {}
  };
}

function stationOf(match, indexPatch) {
  return {
    matchId: match.matchId,
    roundId: match.seriesContext.roundId,
    match: match,
    index: Object.assign(
      {
        seriesId: 'series-lock-a',
        roundId: match.seriesContext.roundId,
        matchId: match.matchId
      },
      indexPatch || {}
    )
  };
}

function resolve(series, playerId, stations) {
  return gate.resolveSeriesRegistrationCancellationGate({
    series: series,
    playerId: playerId,
    stations: stations
  });
}

function g1LiveScored() {
  return makeMatch({
    status: 'ongoing',
    occupants: ['u1', 'u2'],
    scoreData: { g1: { scoresByPlayer: { u1: { scores: [4, null, 5] } } } }
  });
}

function g2Match(status, redScores, blueScores) {
  return makeMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: status,
    gameMode: '四人四球比杆赛',
    occupants: ['u1', 'u2', 'u3', 'u4'],
    scoreEntities: {
      g1: [
        { entityId: 'e-red', entityType: 'team', members: entityMembers(['u1', 'u2']) },
        { entityId: 'e-blue', entityType: 'team', members: entityMembers(['u3', 'u4']) }
      ]
    },
    scoreData: {
      g1: {
        teamScoresByEntity: [
          { teamId: 'e-red', scores: redScores || [] },
          { teamId: 'e-blue', scores: blueScores || [] }
        ]
      }
    }
  });
}

assert(
  '只读：不写 storage / 不接页面 / 复用 P3-A 与 managed 核验',
  gateSrc.indexOf('removePlayerFromMatchCompetitionStructure') >= 0 &&
    gateSrc.indexOf('verifyManagedStationForManage') >= 0 &&
    gateSrc.indexOf('saveMatch') < 0 &&
    gateSrc.indexOf('setStorageSync') < 0 &&
    gateSrc.indexOf('cancelSelfRegistration') < 0 &&
    gateSrc.indexOf('applyProxyCommitPlan') < 0 &&
    pageJs.indexOf('seriesRegistrationCancellationGate') < 0 &&
    detailJs.indexOf('seriesRegistrationCancellationGate') < 0 &&
    gateSrc.indexOf('REASON_LIVE') < 0 &&
    gateSrc.indexOf('MSG_LIVE') < 0 &&
    gateSrc.indexOf('live_score') < 0
);

// 1. 未分组
(function () {
  var series = makeSeries({ rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }] });
  var match = makeMatch({ status: 'registering' });
  var res = resolve(series, 'u1', [stationOf(match)]);
  assert('1 未分组可取消', res.cancellable === true && res.disabled === false && res.reason === '');
})();

// 2. 已分组无成绩
(function () {
  var series = makeSeries({ rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }] });
  var match = makeMatch({ status: 'registering', occupants: ['u1', 'u2'] });
  var res = resolve(series, 'u1', [stationOf(match)]);
  assert('2 已分组无成绩可取消', res.cancellable === true && res.reason === '');
})();

// 3. G1 LIVE 有成绩
(function () {
  var series = makeSeries({ rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }] });
  var match = g1LiveScored();
  var res = resolve(series, 'u1', [stationOf(match)]);
  assert(
    '3 G1 LIVE 有成绩可取消',
    res.cancellable === true &&
      res.disabled === false &&
      res.reason === '' &&
      res.lockedRoundIds.length === 0
  );
  assert('3 同组无成绩球员可取消', resolve(series, 'u2', [stationOf(match)]).cancellable === true);
})();

// 4. G1 completed 有成绩
(function () {
  var series = makeSeries({ rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }] });
  var match = makeMatch({
    status: 'completed',
    occupants: ['u1'],
    scoreData: { g1: { scoresByPlayer: { u1: { scores: [4, 5, 4] } } } }
  });
  var res = resolve(series, 'u1', [stationOf(match)]);
  assert(
    '4 G1 completed 永久锁定',
    res.cancellable === false &&
      res.reason === 'finalized_score' &&
      res.message === '该选手已有完赛成绩，不可取消报名' &&
      res.lockedRoundIds.join(',') === 'r1'
  );
})();

// 5. completed 但空成绩
(function () {
  var series = makeSeries({ rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }] });
  var match = makeMatch({
    status: 'completed',
    occupants: ['u1'],
    scoreData: { g1: { scoresByPlayer: { u1: { scores: [null, '', null] } } } }
  });
  var res = resolve(series, 'u1', [stationOf(match)]);
  assert('5 completed 空成绩可取消', res.cancellable === true && res.reason === '');
})();

// 6. G2 四球只锁 entity 成员
(function () {
  var series = makeSeries({ rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }] });
  var match = g2Match('ongoing', [4, 5], []);
  assert(
    '6 G2 红队成员 LIVE 可取消',
    resolve(series, 'u1', [stationOf(match)]).cancellable === true &&
      resolve(series, 'u2', [stationOf(match)]).cancellable === true
  );
  assert('6 G2 蓝队成员可取消', resolve(series, 'u3', [stationOf(match)]).cancellable === true);
})();

// 7. G3
(function () {
  var series = makeSeries({ rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }] });
  var match = g2Match('ongoing', [3, 3], []);
  match.gameMode = '最佳球位比杆赛';
  match.scoreEntities.g1[0].compositionMode = '4+0';
  match.scoreEntities.g1[1].compositionMode = '4+0';
  assert('7 G3 所属 entity LIVE 可取消', resolve(series, 'u1', [stationOf(match)]).cancellable === true);
  assert('7 G3 其他 entity 可取消', resolve(series, 'u4', [stationOf(match)]).cancellable === true);
})();

// 8. G4 pair
(function () {
  var series = makeSeries({ rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }] });
  var match = makeMatch({
    status: 'ongoing',
    gameMode: '四人两球比杆赛',
    occupants: ['u1', 'u2', 'u3', 'u4'],
    pairings: {
      g1: [
        { id: 'pair-1', playerIds: ['u1', 'u2'] },
        { id: 'pair-2', playerIds: ['u3', 'u4'] }
      ]
    },
    scoreEntities: {
      g1: [
        { entityId: 'pair-1', entityType: 'pair', members: entityMembers(['u1', 'u2']) },
        { entityId: 'pair-2', entityType: 'pair', members: entityMembers(['u3', 'u4']) }
      ]
    },
    scoreData: {
      g1: {
        teamScoresByEntity: [
          { teamId: 'pair-1', scores: [4, 4] },
          { teamId: 'pair-2', scores: [] }
        ]
      }
    }
  });
  assert('8 G4 pair 成员 LIVE 可取消', resolve(series, 'u1', [stationOf(match)]).cancellable === true);
  assert('8 G4 另一 pair 可取消', resolve(series, 'u3', [stationOf(match)]).cancellable === true);
})();

// 9. 同组其他 entity 有成绩不误锁
(function () {
  var series = makeSeries({ rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }] });
  var match = g2Match('ongoing', [], [5, 5, 4]);
  var res = resolve(series, 'u1', [stationOf(match)]);
  assert('9 同组其他 entity 有成绩不误锁', res.cancellable === true && res.reason === '');
  assert('9 有成绩 entity 成员 LIVE 可取消', resolve(series, 'u3', [stationOf(match)]).cancellable === true);
})();

// 10. 多轮中任一轮完赛有成绩即全局锁
(function () {
  var series = makeSeries();
  var m1 = makeMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'ongoing',
    occupants: ['u1'],
    scoreData: { g1: { scoresByPlayer: { u1: { scores: [3] } } } }
  });
  var m2 = makeMatch({
    matchId: 'm2',
    roundId: 'r2',
    status: 'finished',
    occupants: ['u1'],
    scoreData: { g1: { scoresByPlayer: { u1: { scores: [4] } } } }
  });
  var res = resolve(series, 'u1', [stationOf(m1), stationOf(m2)]);
  assert(
    '10 LIVE 成绩不掩盖其他轮 finalized 全局锁',
    res.cancellable === false &&
      res.reason === 'finalized_score' &&
      res.lockedRoundIds.join(',') === 'r2'
  );
})();

// 11. 单轮 completed 无该球员成绩不锁
(function () {
  var series = makeSeries({ rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }] });
  var match = makeMatch({
    status: 'completed',
    occupants: ['u1', 'u2'],
    scoreData: { g1: { scoresByPlayer: { u2: { scores: [4, 5] } } } }
  });
  assert('11 completed 无该球员成绩不锁', resolve(series, 'u1', [stationOf(match)]).cancellable === true);
})();

// 12. managed 异常不可取消
(function () {
  var series = makeSeries({ rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }] });
  var badToken = makeMatch({ status: 'registering', occupants: ['u1'] });
  badToken.seriesContext.publishToken = 'tok-wrong';
  var resTok = resolve(series, 'u1', [stationOf(badToken)]);
  assert(
    '12 token 异常不可取消',
    resTok.cancellable === false && resTok.reason === 'managed_station_invalid'
  );

  var badIndex = makeMatch({ status: 'registering', occupants: ['u1'] });
  var resIdx = resolve(series, 'u1', [
    stationOf(badIndex, { seriesId: 'other-series' })
  ]);
  assert(
    '12 index 异常不可取消',
    resIdx.cancellable === false && resIdx.reason === 'managed_station_invalid'
  );

  var missing = resolve(series, 'u1', []);
  assert(
    '12 缺站不可当成无成绩可取消',
    missing.cancellable === false && missing.reason === 'managed_station_invalid'
  );
})();

// 13. 输入不被修改
(function () {
  var series = makeSeries();
  var m1 = g1LiveScored();
  var m2 = makeMatch({ matchId: 'm2', roundId: 'r2', status: 'registering', occupants: ['u1'] });
  var stations = [stationOf(m1), stationOf(m2)];
  var frozenSeries = stable(series);
  var frozenStations = stable(stations);
  var res = resolve(series, 'u1', stations);
  assert('13 有 LIVE 成绩仍可取消', res.cancellable === true && res.reason === '');
  assert('13 series 未被改', stable(series) === frozenSeries);
  assert('13 stations 未被改', stable(stations) === frozenStations);
  assert('13 match 引用仍含原成绩', m1.scoreData.g1.scoresByPlayer.u1.scores[0] === 4);
})();

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failures.length) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
