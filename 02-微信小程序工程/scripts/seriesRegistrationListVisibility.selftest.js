/**
 * Series 报名 TAB 列表可见性
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesRegistrationListVisibility.selftest.js
 */

var path = require('path');

var root = path.join(__dirname, '..');
var utilsDir = path.join(root, 'miniprogram', 'utils');
var adapter = require(path.join(utilsDir, 'seriesListCardAdapter.js'));

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

function makeSeries(over) {
  return Object.assign(
    {
      seriesId: 'series-mtfvcwlu-2-z8l4cw',
      seriesName: '可见性系列赛',
      seriesSubtitle: '副标题',
      lifecycleStatus: 'published',
      registrationState: 'open',
      publishToken: 'tok-vis',
      hostMode: 'organization',
      organization: { organizationName: '主办', organizationLogo: '' },
      createdAt: 1,
      roster: [],
      rounds: [
        {
          roundId: 'r1',
          index: 1,
          matchId: 'm1',
          roundStatus: 'scheduled',
          dateTime: '2030-06-01 08:00',
          gameMode: '个人比杆赛',
          courseId: 'c1',
          courseName: '球场1'
        },
        {
          roundId: 'r2',
          index: 2,
          matchId: 'm2',
          roundStatus: 'scheduled',
          dateTime: '2030-06-02 08:00',
          gameMode: '个人比杆赛',
          courseId: 'c1',
          courseName: '球场1'
        }
      ]
    },
    over || {}
  );
}

function station(id, roundId, status) {
  return {
    matchId: id,
    status: status,
    seriesContext: {
      managed: true,
      seriesId: 'series-mtfvcwlu-2-z8l4cw',
      roundId: roundId,
      publishToken: 'tok-vis'
    }
  };
}

function deps(series, matches) {
  var map = Object.create(null);
  (matches || []).forEach(function (m) {
    map[m.matchId] = m;
  });
  return {
    listSeries: function () {
      return [series];
    },
    listMatches: function () {
      return matches || [];
    },
    getMatchById: function (id) {
      return map[id] || null;
    },
    currentUserId: 'u1',
    currentPlayerId: 'p1',
    toOrdinaryCard: function (m) {
      return { id: m.matchId, matchId: m.matchId, status: m.status };
    }
  };
}

function hasSeries(cards) {
  return (cards || []).some(function (c) {
    return c && c.seriesId === 'series-mtfvcwlu-2-z8l4cw';
  });
}

function vis(series, matches) {
  return adapter.evaluateRegistrationListVisibility(series, {
    getMatchById: deps(series, matches).getMatchById
  });
}

(function case1() {
  var series = makeSeries();
  var matches = [
    station('m1', 'r1', 'registering'),
    station('m2', 'r2', 'registering')
  ];
  var d = deps(series, matches);
  var v = vis(series, matches);
  assert('CASE1 isRegistrationOpen', v.isRegistrationOpen === true);
  assert('CASE1 报名列表包含', hasSeries(adapter.buildRegistrationAllCards(d)));
})();

(function case2() {
  var series = makeSeries();
  var matches = [
    station('m1', 'r1', 'ongoing'),
    station('m2', 'r2', 'registering')
  ];
  var d = deps(series, matches);
  var v = vis(series, matches);
  var plaza = adapter.buildPlazaTournamentCards(d);
  assert('CASE2 listPhase=live 仍 open', v.listPhase === 'live' && v.isRegistrationOpen === true);
  assert(
    'CASE2 LIVE+upcoming+open 进入报名列表',
    v.includedInRegistrationList === true &&
      hasSeries(adapter.buildRegistrationAllCards(d))
  );
  assert(
    'CASE2 同时保留 LIVE/团体比赛列表',
    plaza.some(function (c) {
      return c && c.seriesId === 'series-mtfvcwlu-2-z8l4cw' && c.statusLabel === 'LIVE';
    })
  );
  assert(
    'CASE2 live 不单独关掉报名',
    adapter.resolveIsRegistrationOpen(series, 'live', {
      getMatchById: d.getMatchById
    }) === true
  );
})();

(function case3() {
  var series = makeSeries();
  var matches = [
    station('m1', 'r1', 'finished'),
    station('m2', 'r2', 'registering')
  ];
  var d = deps(series, matches);
  var v = vis(series, matches);
  assert('CASE3 finished+upcoming+open 进入报名', v.isRegistrationOpen === true);
  assert('CASE3 报名列表包含', hasSeries(adapter.buildRegistrationAllCards(d)));
})();

(function case4() {
  var series = makeSeries({ registrationState: 'closed' });
  var matches = [
    station('m1', 'r1', 'ongoing'),
    station('m2', 'r2', 'registering')
  ];
  var d = deps(series, matches);
  var v = vis(series, matches);
  assert('CASE4 closed 不 open', v.isRegistrationOpen === false);
  assert(
    'CASE4 不进报名列表',
    v.includedInRegistrationList === false &&
      v.excludeReason === 'registration_closed' &&
      !hasSeries(adapter.buildRegistrationAllCards(d))
  );
  assert(
    'CASE4 仍可在 LIVE 列表',
    adapter.buildPlazaTournamentCards(d).some(function (c) {
      return c && c.seriesId === 'series-mtfvcwlu-2-z8l4cw';
    })
  );
})();

(function case5() {
  var series = makeSeries({
    registrationState: 'open',
    competitionPhaseCache: 'completed'
  });
  var matches = [
    station('m1', 'r1', 'finished'),
    station('m2', 'r2', 'finished')
  ];
  var d = deps(series, matches);
  var v = vis(series, matches);
  assert('CASE5 全部 completed 排除', v.includedInRegistrationList === false);
  assert('CASE5 报名列表无卡', !hasSeries(adapter.buildRegistrationAllCards(d)));
})();

(function case5b() {
  var series = makeSeries({ registrationState: 'open' });
  var matches = [
    station('m1', 'r1', 'finished'),
    station('m2', 'r2', 'completed')
  ];
  var d = deps(series, matches);
  var v = vis(series, matches);
  assert(
    'CASE5 脏 open 但无 upcoming 排除',
    v.hasUpcomingRound === false &&
      v.includedInRegistrationList === false &&
      !hasSeries(adapter.buildRegistrationAllCards(d))
  );
})();

(function case6() {
  var series = makeSeries({ lifecycleStatus: 'cancelled', registrationState: 'open' });
  var d = deps(series, []);
  var v = vis(series, []);
  assert(
    'CASE6 cancelled 排除',
    v.excludeReason === 'cancelled' &&
      !hasSeries(adapter.buildRegistrationAllCards(d))
  );
})();

(function case7() {
  var series = makeSeries({ lifecycleStatus: 'archived', registrationState: 'open' });
  var d = deps(series, []);
  var v = vis(series, []);
  assert(
    'CASE7 archived 排除',
    v.excludeReason === 'archived' &&
      !hasSeries(adapter.buildRegistrationAllCards(d))
  );
})();

function hasUpcoming(series, matches) {
  return adapter.hasUpcomingRound(series, {
    getMatchById: deps(series, matches).getMatchById
  });
}

(function caseA() {
  var series = makeSeries();
  var matches = [
    station('m1', 'r1', 'ongoing'),
    station('m2', 'r2', 'registering')
  ];
  assert('CASE A live+registering upcoming', hasUpcoming(series, matches) === true);
})();

(function caseB() {
  var series = makeSeries();
  var matches = [
    station('m1', 'r1', 'finished'),
    station('m2', 'r2', 'registering')
  ];
  assert('CASE B finished+registering upcoming', hasUpcoming(series, matches) === true);
})();

(function caseC() {
  var series = makeSeries();
  var matches = [
    station('m1', 'r1', 'ongoing'),
    Object.assign(station('m2', 'r2', 'registering'), {
      groups: [{ players: [{ userId: 'u1' }] }]
    })
  ];
  assert('CASE C grouped 未开始 upcoming', hasUpcoming(series, matches) === true);
})();

(function caseD() {
  var series = makeSeries();
  var matches = [
    station('m1', 'r1', 'ongoing'),
    station('m2', 'r2', 'registering')
  ];
  assert('CASE D unassigned upcoming', hasUpcoming(series, matches) === true);
})();

(function caseE() {
  var series = makeSeries();
  var matches = [
    station('m1', 'r1', 'ongoing'),
    station('m2', 'r2', 'finished')
  ];
  assert('CASE E live+completed 无 upcoming', hasUpcoming(series, matches) === false);
})();

(function caseF() {
  var series = makeSeries();
  var matches = [
    station('m1', 'r1', 'finished'),
    station('m2', 'r2', 'completed')
  ];
  assert('CASE F 全部 completed 无 upcoming', hasUpcoming(series, matches) === false);
})();

(function caseG() {
  var series = makeSeries();
  series.rounds[1].roundStatus = 'scheduled';
  series.rounds[1].status = 'configured';
  var matches = [
    station('m1', 'r1', 'ongoing'),
    station('m2', 'r2', 'scheduled')
  ];
  assert(
    'CASE G match.status=scheduled 且 round 非 upcoming',
    series.rounds[1].status !== 'upcoming' && hasUpcoming(series, matches) === true
  );
})();

(function caseH() {
  var series = makeSeries();
  series.rounds[1].roundStatus = 'ready';
  series.rounds[1].status = 'published';
  var matches = [
    station('m1', 'r1', 'ongoing'),
    station('m2', 'r2', 'scheduled')
  ];
  assert(
    'CASE H round 非 upcoming 字符串仍 upcoming',
    series.rounds[1].status !== 'upcoming' &&
      series.rounds[1].roundStatus !== 'upcoming' &&
      hasUpcoming(series, matches) === true
  );
})();

(function staleRoundLive() {
  var series = makeSeries();
  series.rounds[1].roundStatus = 'live';
  var matches = [
    station('m1', 'r1', 'ongoing'),
    station('m2', 'r2', 'registering')
  ];
  assert(
    'station registering 覆盖过期 roundStatus=live',
    hasUpcoming(series, matches) === true
  );
})();

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
  process.exit(1);
}
console.log('seriesRegistrationListVisibility.selftest OK');
