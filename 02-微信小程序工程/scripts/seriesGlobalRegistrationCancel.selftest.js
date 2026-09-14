/**
 * Series 全局报名（series.roster）取消资格与清理
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesGlobalRegistrationCancel.selftest.js
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
var pageDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');

var gatePath = seriesTestPaths.util('seriesRegistrationCancellationGate.js');
var orchPath = seriesTestPaths.util('seriesSelfCancellationOrchestrator.js');
var p3aPath = seriesTestPaths.util('removePlayerFromMatchCompetitionStructure.js');
var gate = require(gatePath);
var orchMod = require(orchPath);
var p3a = require(p3aPath);
var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesRegistration = require(path.join(utilsDir, 'seriesRegistration.js'));
var seriesStationManageGate = require(path.join(utilsDir, 'seriesStationManageGate.js'));
var teamMatchFinish = require(path.join(utilsDir, 'teamMatchFinish.js'));
var registerVm = require(path.join(pageDir, 'seriesRegisterViewModel.js'));
var gateSrc = fs.readFileSync(gatePath, 'utf8');
var manageGateSrc = fs.readFileSync(path.join(utilsDir, 'seriesStationManageGate.js'), 'utf8');
var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');

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

function makeSeries(overrides) {
  return Object.assign(
    {
      seriesId: 'series-global-cancel',
      publishToken: 'tok-global-cancel',
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
  var ctx = Object.assign(
    {
      managed: o.managed != null ? o.managed : true,
      seriesId: o.seriesId || 'series-global-cancel',
      roundId: o.roundId || 'r1',
      publishToken: o.publishToken || 'tok-global-cancel'
    },
    o.seriesContextPatch || {}
  );
  if (o.dropContext) ctx = undefined;
  return {
    matchId: o.matchId || 'm1',
    status: o.status || 'registering',
    gameMode: o.gameMode || '个人比杆赛',
    seriesContext: ctx,
    groups: players.length
      ? [{ groupId: 'g1', groupName: '第1组', players: players, playersSlots: freeze(players) }]
      : [],
    pairings: o.pairings || {},
    scoreEntities: o.scoreEntities || {},
    scoreData: o.scoreData || {},
    registerInfo: o.registerInfo || { users: [], totalCount: 0 }
  };
}

function stationOf(match, indexPatch) {
  return {
    matchId: match.matchId,
    roundId: (match.seriesContext && match.seriesContext.roundId) || '',
    match: match,
    index: Object.assign(
      {
        seriesId: 'series-global-cancel',
        roundId: (match.seriesContext && match.seriesContext.roundId) || 'r1',
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

function createMemoryStorage() {
  var bag = Object.create(null);
  return {
    getItem: function (key) {
      return { ok: true, value: bag[key] != null ? freeze(bag[key]) : null };
    },
    setItem: function (key, value) {
      bag[key] = freeze(value);
      return { ok: true };
    },
    removeItem: function (key) {
      delete bag[key];
      return { ok: true };
    }
  };
}

function createHarness(opts) {
  var o = opts || {};
  var raw = Object.assign(
    {
      seriesId: 'series-global-cancel',
      lifecycleStatus: 'published',
      publishState: 'published',
      publishToken: 'tok-global-cancel',
      hostMode: 'organization',
      registrationState: 'open',
      registrationRevision: 3,
      competitionPhaseCache: 'registration',
      createdBy: 'creator-1',
      participants: [
        { seriesParticipantId: 'team:1', kind: 'team', sourceTeamId: '1', nameSnapshot: '甲队' }
      ],
      roster: [
        {
          rosterEntryId: 're-u1',
          seriesId: 'series-global-cancel',
          seriesParticipantId: 'team:1',
          playerId: 'u1',
          playerNameSnapshot: '本人',
          registrationStatus: 'registered',
          registrationSource: 'self',
          registeredByUserId: 'u1'
        }
      ],
      rounds: [
        { roundId: 'r1', index: 1, name: '第1轮', matchId: 'm1', gameMode: '个人比杆赛' },
        { roundId: 'r2', index: 2, name: '第2轮', matchId: 'm2', gameMode: '个人比杆赛' }
      ]
    },
    o.seriesPatch || {}
  );
  var series = seriesModel.normalizeSeries(raw);
  var matches = Object.create(null);
  series.rounds.forEach(function (r) {
    var spec = (o.matchSpecs && o.matchSpecs[r.roundId]) || {};
    matches[r.matchId] = makeMatch(
      Object.assign(
        {
          matchId: r.matchId,
          roundId: r.roundId,
          occupants: spec.occupants != null ? spec.occupants : ['u1', 'u2'],
          status: spec.status || 'registering',
          scoreData: spec.scoreData,
          registerInfo: spec.registerInfo,
          managed: spec.managed,
          seriesContextPatch: spec.seriesContextPatch
        },
        spec.matchPatch || {}
      )
    );
    if (spec.emptyGroups) {
      matches[r.matchId].groups = [];
    }
  });

  var seriesBag = Object.create(null);
  seriesBag[series.seriesId] = freeze(series);
  var index = Object.create(null);
  series.rounds.forEach(function (r) {
    if (!r.matchId) return;
    index[r.matchId] = {
      seriesId: series.seriesId,
      roundId: r.roundId,
      matchId: r.matchId
    };
  });

  var storage = createMemoryStorage();
  var saveLog = [];
  var teamMatchStore = {
    getMatchById: function (id) {
      return matches[id] ? freeze(matches[id]) : null;
    },
    saveMatch: function (m) {
      saveLog.push(m.matchId);
      matches[m.matchId] = freeze(m);
      return m;
    }
  };
  var seriesStore = {
    getSeriesById: function (id) {
      return seriesBag[id] ? freeze(seriesBag[id]) : null;
    },
    upsertSeries: function (input) {
      seriesBag[input.seriesId] = freeze(input);
      return { ok: true, series: freeze(input) };
    },
    upsertSeriesChecked: function (input, expected) {
      var cur = seriesBag[input.seriesId];
      var curRev = cur ? Number(cur.registrationRevision) || 0 : 0;
      if (cur && Number(expected) !== curRev) {
        return { ok: false, reason: 'registration_conflict', currentRevision: curRev };
      }
      seriesBag[input.seriesId] = freeze(input);
      return { ok: true, series: freeze(input) };
    }
  };
  var realReg = seriesRegistration.createSeriesRegistrationService({
    seriesStore: seriesStore,
    resolveEligibleParticipantIds: function () {
      return { ok: true, ids: ['team:1'] };
    },
    canManageRegistration: function () {
      return { allowed: false };
    },
    now: function () {
      return '2026-09-14T03:00:00.000Z';
    }
  });
  var svc = orchMod.createSeriesSelfCancellationOrchestrator({
    seriesStore: seriesStore,
    teamMatchStore: teamMatchStore,
    storage: storage,
    getIndexByMatchId: function (id) {
      return index[id] ? freeze(index[id]) : null;
    },
    removePlayerFromMatchCompetitionStructure: p3a.removePlayerFromMatchCompetitionStructure,
    cancelSelfRegistration: function (input) {
      return realReg.cancelSelfRegistration(input);
    },
    now: function () {
      return 1700000000100;
    }
  });
  return {
    series: series,
    seriesBag: seriesBag,
    matches: matches,
    index: index,
    svc: svc,
    saveLog: saveLog
  };
}

function args(h) {
  return {
    seriesId: h.series.seriesId,
    playerId: 'u1',
    actorUserId: 'u1',
    expectedRegistrationRevision: h.series.registrationRevision
  };
}

function rosterStatus(h, playerId) {
  var s = h.seriesBag[h.series.seriesId];
  var list = (s && s.roster) || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].playerId === playerId) return list[i].registrationStatus;
  }
  return '';
}

function occupiedIds(list) {
  return (Array.isArray(list) ? list : [])
    .map(function (p) {
      return String((p && (p.userId || p.playerId || p.id)) || '').trim();
    })
    .filter(Boolean);
}

assert(
  '不以 managed gate 作为取消资格，复用 inspectStructure / playerHasRealScore / isMatchCompleted',
  gateSrc.indexOf('verifyManagedStationForManage') < 0 &&
    gateSrc.indexOf('inspectStructure') >= 0 &&
    gateSrc.indexOf('playerHasRealScore') >= 0 &&
    gateSrc.indexOf('isMatchCompleted') >= 0 &&
    gateSrc.indexOf('completed_station_participation') >= 0 &&
    typeof p3a.inspectStructure === 'function' &&
    typeof p3a.playerHasRealScore === 'function' &&
    typeof teamMatchFinish.isMatchCompleted === 'function'
);
assert(
  'verifyManagedStationForManage 仍保留 not_managed 失败',
  manageGateSrc.indexOf("failGate('not_managed'") >= 0 &&
    manageGateSrc.indexOf('ctx.managed !== true') >= 0
);
assert(
  'toast 文案走业务规则而非数据异常',
  pageJs.indexOf('你已参加过已结束的分站比赛，无法取消报名') >= 0 &&
    pageJs.indexOf('completed_station_participation') >= 0
);

// CASE 1
(function () {
  var series = makeSeries();
  var m1 = makeMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'finished',
    occupants: ['u9']
  });
  var m2 = makeMatch({
    matchId: 'm2',
    roundId: 'r2',
    status: 'registering',
    occupants: []
  });
  var res = resolve(series, 'u1', [stationOf(m1), stationOf(m2)]);
  assert(
    'CASE1 finished Round1 本人未参加 → 允许',
    res.cancellable === true && res.reason === ''
  );
})();

// CASE 2
(function () {
  var series = makeSeries({ rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }] });
  var m1 = makeMatch({ status: 'finished', occupants: ['u1'] });
  var res = resolve(series, 'u1', [stationOf(m1)]);
  assert(
    'CASE2 finished+groups 无 score → BLOCK completed_station_participation',
    res.cancellable === false &&
      res.reason === 'completed_station_participation' &&
      res.message === '你已参加过已结束的分站比赛，无法取消报名'
  );
})();

// CASE 3
(function () {
  var series = makeSeries({ rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }] });
  var m1 = makeMatch({
    status: 'finished',
    occupants: ['u1'],
    scoreData: { g1: { scoresByPlayer: { u1: { scores: [4, 5] } } } }
  });
  var res = resolve(series, 'u1', [stationOf(m1)]);
  assert(
    'CASE3 finished+score → BLOCK completed_station_participation',
    res.cancellable === false &&
      res.reason === 'completed_station_participation' &&
      res.reason !== 'managed_station_invalid'
  );
})();

// CASE 4
(function () {
  var series = makeSeries({ rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }] });
  var m1 = makeMatch({ status: 'finished', occupants: [] });
  var res = resolve(series, 'u1', [stationOf(m1)]);
  assert(
    'CASE4 仅 series.roster 不算分站参加 → 允许',
    res.cancellable === true && res.reason === ''
  );
})();

// CASE 5
(function () {
  var series = makeSeries({ rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }] });
  var m1 = makeMatch({
    status: 'finished',
    occupants: [],
    registerInfo: { users: [{ userId: 'u1' }], totalCount: 1 }
  });
  var res = resolve(series, 'u1', [stationOf(m1)]);
  assert(
    'CASE5 仅 registerInfo.users 不算实际参赛 → 允许',
    res.cancellable === true && res.reason === ''
  );
})();

// CASE 6
(function () {
  var h = createHarness({
    matchSpecs: {
      r1: { status: 'registering', occupants: ['u1', 'u2'] },
      r2: { status: 'registering', occupants: [] }
    }
  });
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert('CASE6 upcoming 已编组 → cleanup+roster cancel', res.ok === true && res.grouped === true);
  assert('CASE6 清组', occupiedIds(h.matches.m1.groups[0].players).join(',') === 'u2');
  assert('CASE6 roster cancelled', rosterStatus(h, 'u1') === 'cancelled');
})();

// CASE 7
(function () {
  var h = createHarness({
    matchSpecs: {
      r1: { status: 'ongoing', occupants: ['u1', 'u2'] },
      r2: { status: 'registering', occupants: [] }
    }
  });
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert('CASE7 ongoing 无 score → cleanup+cancel', res.ok === true);
  assert('CASE7 清组', occupiedIds(h.matches.m1.groups[0].players).join(',') === 'u2');
  assert('CASE7 roster cancelled', rosterStatus(h, 'u1') === 'cancelled');
})();

// CASE 8
(function () {
  var h = createHarness({
    matchSpecs: {
      r1: {
        status: 'ongoing',
        occupants: ['u1', 'u2'],
        scoreData: { g1: { scoresByPlayer: { u1: { scores: [4, null, 5] } } } }
      },
      r2: { status: 'registering', occupants: [] }
    }
  });
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert('CASE8 ongoing LIVE score → 允许 cancel', res.ok === true);
  assert(
    'CASE8 LIVE 成绩已删',
    !h.matches.m1.scoreData.g1.scoresByPlayer.u1
  );
  assert('CASE8 清组', occupiedIds(h.matches.m1.groups[0].players).join(',') === 'u2');
  assert('CASE8 roster cancelled', rosterStatus(h, 'u1') === 'cancelled');
})();

// CASE 9
(function () {
  var series = makeSeries({
    rounds: [
      { roundId: 'r1', index: 1 },
      { roundId: 'r2', index: 2, matchId: 'm2' }
    ]
  });
  var m2 = makeMatch({ matchId: 'm2', roundId: 'r2', status: 'registering', occupants: [] });
  var res = resolve(series, 'u1', [stationOf(m2)]);
  assert('CASE9 无 matchId round skip 不阻断', res.cancellable === true && res.reason === '');
})();

// CASE 10
(function () {
  var series = makeSeries();
  var m1 = makeMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'finished',
    occupants: ['u9'],
    scoreData: { g1: { scoresByPlayer: { u9: { scores: [3] } } } }
  });
  var m2 = makeMatch({ matchId: 'm2', roundId: 'r2', status: 'ongoing', occupants: [] });
  var res = resolve(series, 'u1', [stationOf(m1), stationOf(m2)]);
  assert('CASE10 他人已结束参赛不阻断本人', res.cancellable === true && res.reason === '');
})();

// CASE 11
(function () {
  var series = makeSeries();
  var m1 = makeMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'finished',
    occupants: ['u9'],
    managed: false
  });
  var m2 = makeMatch({
    matchId: 'm2',
    roundId: 'r2',
    status: 'registering',
    occupants: [],
    managed: false
  });
  var res = resolve(series, 'u1', [stationOf(m1), stationOf(m2)]);
  assert(
    'CASE11 managed=false 未参加已结束 → 不因 managed 阻断',
    res.cancellable === true && res.reason !== 'managed_station_invalid'
  );
  var manageFail = seriesStationManageGate.verifyManagedStationForManage({
    series: series,
    roundId: 'r1',
    getMatchById: function () {
      return m1;
    },
    getIndexByMatchId: function () {
      return { seriesId: series.seriesId, roundId: 'r1', matchId: 'm1' };
    }
  });
  assert(
    'CASE11 manage gate 仍因 not_managed FAIL',
    manageFail.ok === false && manageFail.reason === 'not_managed'
  );
})();

// CASE 12
(function () {
  var series = makeSeries({ rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }] });
  var m1 = makeMatch({ status: 'finished', occupants: ['u1'], managed: false });
  var res = resolve(series, 'u1', [stationOf(m1)]);
  assert(
    'CASE12 managed=false 已参加 finished → completed_station_participation',
    res.cancellable === false &&
      res.reason === 'completed_station_participation' &&
      res.reason !== 'managed_station_invalid'
  );
})();

// CASE 13
(function () {
  var series = makeSeries({ rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }] });
  var m1 = makeMatch({
    status: 'registering',
    occupants: ['u1'],
    seriesContextPatch: { seriesId: 'other-series', roundId: 'other-round' }
  });
  var res = resolve(series, 'u1', [stationOf(m1)]);
  assert(
    'CASE13 seriesId/roundId 指向其它 → BLOCK integrity',
    res.cancellable === false && res.reason === 'managed_station_invalid'
  );
})();

// CASE 14
(function () {
  var h = createHarness({
    matchSpecs: {
      r1: { status: 'registering', occupants: [] },
      r2: { status: 'registering', occupants: [] }
    }
  });
  var beforeCta = registerVm.resolveRegisterCta({
    lifecycleStatus: 'published',
    registrationState: 'open',
    competitionPhaseCache: 'registration',
    isRegistered: true,
    identityOk: true,
    eligibleCount: 1
  });
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  var afterCta = registerVm.resolveRegisterCta({
    lifecycleStatus: 'published',
    registrationState: 'open',
    competitionPhaseCache: 'registration',
    isRegistered: rosterStatus(h, 'u1') === 'registered',
    identityOk: true,
    eligibleCount: 1
  });
  assert('CASE14 roster 取消成功', res.ok === true && rosterStatus(h, 'u1') === 'cancelled');
  assert(
    'CASE14 CTA 恢复报名',
    beforeCta.action === 'cancel' &&
      afterCta.action === 'register' &&
      afterCta.disabled === false
  );
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
