/**
 * SERIES-CANCEL-LOCK-B1A：编排器接入报名取消资格门闩
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesCancelLockB1A.selftest.js
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
var orchPath = seriesTestPaths.util('seriesSelfCancellationOrchestrator.js');
var orchSrc = fs.readFileSync(orchPath, 'utf8');
var orchMod = require(orchPath);
var seriesRegistration = require(path.join(utilsDir, 'seriesRegistration.js'));
var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var p3a = require(seriesTestPaths.util('removePlayerFromMatchCompetitionStructure.js'));

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

function makeSeries(overrides) {
  var raw = Object.assign(
    {
      seriesId: 'series-lock-b1a',
      lifecycleStatus: 'published',
      publishState: 'published',
      publishToken: 'tok-lock-b1a',
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
          seriesId: 'series-lock-b1a',
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
    overrides || {}
  );
  return seriesModel.normalizeSeries(raw);
}

function makeMatch(series, round, spec) {
  var s = spec || {};
  var occupants = s.occupants || ['u1', 'u2'];
  var players = emptySlots(occupants);
  return Object.assign(
    {
      matchId: round.matchId,
      status: s.status || 'registering',
      gameMode: '个人比杆赛',
      seriesContext: {
        managed: true,
        seriesId: series.seriesId,
        roundId: round.roundId,
        publishToken: series.publishToken
      },
      groups: [
        {
          groupId: 'g1',
          groupName: '第1组',
          players: players,
          playersSlots: freeze(players)
        }
      ],
      pairings: {},
      scoreEntities: {},
      scoreData: s.scoreData || { g1: { scoresByPlayer: {}, teamScoresByEntity: [] } },
      registerInfo: { users: [{ userId: 'u1' }, { userId: 'u2' }], totalCount: 2 },
      registrationStatus: 'open'
    },
    s.patch || {}
  );
}

function createHarness(opts) {
  var o = opts || {};
  var series = o.series || makeSeries(o.seriesPatch);
  var matches = Object.create(null);
  series.rounds.forEach(function (r) {
    matches[r.matchId] = makeMatch(series, r, o.matchSpecs && o.matchSpecs[r.roundId]);
  });

  var seriesBag = Object.create(null);
  seriesBag[series.seriesId] = freeze(series);
  var index = Object.create(null);
  series.rounds.forEach(function (r) {
    index[r.matchId] = {
      seriesId: series.seriesId,
      roundId: r.roundId,
      matchId: r.matchId
    };
  });
  if (o.breakIndexRound) {
    var br = series.rounds.filter(function (r) {
      return r.roundId === o.breakIndexRound;
    })[0];
    if (br) index[br.matchId] = { seriesId: 'other-series', roundId: br.roundId, matchId: br.matchId };
  }
  if (o.breakTokenRound) {
    var bt = series.rounds.filter(function (r) {
      return r.roundId === o.breakTokenRound;
    })[0];
    if (bt && matches[bt.matchId]) {
      matches[bt.matchId].seriesContext.publishToken = 'tok-wrong';
    }
  }

  var storage = createMemoryStorage();
  var saveLog = [];
  var seriesWriteLog = [];

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
      seriesWriteLog.push('upsert');
      seriesBag[input.seriesId] = freeze(input);
      return { ok: true, series: freeze(input) };
    },
    upsertSeriesChecked: function (input, expected) {
      var cur = seriesBag[input.seriesId];
      var curRev = cur ? Number(cur.registrationRevision) || 0 : 0;
      if (cur && Number(expected) !== curRev) {
        return { ok: false, reason: 'registration_conflict', currentRevision: curRev };
      }
      seriesWriteLog.push('checked');
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
      return '2026-08-14T03:00:00.000Z';
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
    storage: storage,
    svc: svc,
    saveLog: saveLog,
    seriesWriteLog: seriesWriteLog
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

function journalOf(h) {
  return h.storage.getItem(orchMod.JOURNAL_KEY).value;
}

function occupiedIds(list) {
  return (Array.isArray(list) ? list : [])
    .map(function (p) {
      return String((p && (p.userId || p.playerId || p.id)) || '').trim();
    })
    .filter(Boolean);
}

assert(
  '接入 LOCK-A 门闩，保留 P3-A 第二层，不接页面',
  orchSrc.indexOf("require('./seriesRegistrationCancellationGate.js')") >= 0 &&
    orchSrc.indexOf('resolveSeriesRegistrationCancellationGate') >= 0 &&
    orchSrc.indexOf('inspectSelfCancellationImpact') >= 0 &&
    orchSrc.indexOf('player_has_real_score') >= 0 &&
    orchSrc.indexOf('series-detail') < 0 &&
    orchSrc.indexOf('wx.showToast') < 0
);

// 1. finalized：精确原因 + 零写入
(function () {
  var h = createHarness({
    matchSpecs: {
      r1: {
        status: 'completed',
        occupants: ['u1', 'u2'],
        scoreData: { g1: { scoresByPlayer: { u1: { scores: [4, 5, 4] } } } }
      },
      r2: { status: 'registering', occupants: ['u1', 'u2'] }
    }
  });
  var beforeSeries = freeze(h.seriesBag[h.series.seriesId]);
  var beforeMatches = freeze(h.matches);
  var insp = h.svc.inspectSelfCancellationImpact(args(h));
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert(
    '1 inspect finalized_score',
    insp.ok === false && insp.blockedReason === 'finalized_score'
  );
  assert('1 cancel finalized_score', res.ok === false && res.reason === 'finalized_score');
  assert('1 零写入 series', stable(h.seriesBag[h.series.seriesId]) === stable(beforeSeries));
  assert('1 零写入 matches', stable(h.matches) === stable(beforeMatches) && h.saveLog.length === 0);
  assert('1 无 journal', journalOf(h) == null);
  assert('1 roster 仍 registered', rosterStatus(h, 'u1') === 'registered');
})();

// 2. live：inspect / 写入均成功，取消与分站清理落地
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
  var insp = h.svc.inspectSelfCancellationImpact(args(h));
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert('2 inspect LIVE 可取消', insp.ok === true && !insp.blockedReason);
  assert('2 cancel LIVE 成功', res.ok === true && res.grouped === true);
  assert('2 只写受影响站', res.affectedRoundIds.join(',') === 'r1' && h.saveLog.join(',') === 'm1');
  assert('2 roster 已取消', rosterStatus(h, 'u1') === 'cancelled');
  assert('2 R1 已清 u1', occupiedIds(h.matches.m1.groups[0].players).join(',') === 'u2');
  assert('2 journal 已清', journalOf(h) == null);
  assert('2 revision +1', res.registrationRevision === 4);
})();

// 3. 已分组无成绩：继续原 B1 流程
(function () {
  var h = createHarness({
    matchSpecs: {
      r1: { status: 'registering', occupants: ['u1', 'u2'] },
      r2: { status: 'registering', occupants: [] }
    }
  });
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert('3 已分组无成绩成功', res.ok === true && res.grouped === true);
  assert('3 只写受影响站', res.affectedRoundIds.join(',') === 'r1' && h.saveLog.join(',') === 'm1');
  assert('3 roster 已取消', rosterStatus(h, 'u1') === 'cancelled');
  assert('3 R1 已清 u1', occupiedIds(h.matches.m1.groups[0].players).join(',') === 'u2');
  assert('3 journal 已清', journalOf(h) == null);
})();

// 4. 写前状态变化：inspect 通过后变为 finalized，二次 gate 拦截且零写入
(function () {
  var h = createHarness({
    matchSpecs: {
      r1: { status: 'registering', occupants: ['u1', 'u2'] },
      r2: { status: 'registering', occupants: ['u1', 'u2'] }
    }
  });
  var insp = h.svc.inspectSelfCancellationImpact(args(h));
  assert('4 inspect 先通过', insp.ok === true && insp.grouped === true);
  h.matches.m1.status = 'completed';
  h.matches.m1.scoreData = { g1: { scoresByPlayer: { u1: { scores: [4, 5] } } } };
  var beforeSeries = freeze(h.seriesBag[h.series.seriesId]);
  var beforeMatches = freeze(h.matches);
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert('4 写前变为 finalized_score', res.ok === false && res.reason === 'finalized_score');
  assert('4 零写入 series', stable(h.seriesBag[h.series.seriesId]) === stable(beforeSeries));
  assert('4 零写入 matches', stable(h.matches) === stable(beforeMatches) && h.saveLog.length === 0);
  assert('4 无 journal', journalOf(h) == null);
})();

// 5. managed 异常：精确原因 + 零写入
(function () {
  var hTok = createHarness({
    matchSpecs: {
      r1: { status: 'registering', occupants: ['u1', 'u2'] },
      r2: { status: 'registering', occupants: ['u1', 'u2'] }
    },
    breakTokenRound: 'r2'
  });
  var beforeTok = freeze(hTok.seriesBag[hTok.series.seriesId]);
  var beforeTokM = freeze(hTok.matches);
  var inspTok = hTok.svc.inspectSelfCancellationImpact(args(hTok));
  var resTok = hTok.svc.cancelSelfRegistrationWithStationCleanup(args(hTok));
  assert(
    '5 token inspect managed_station_invalid',
    inspTok.ok === false && inspTok.blockedReason === 'managed_station_invalid'
  );
  assert('5 token cancel managed_station_invalid', resTok.ok === false && resTok.reason === 'managed_station_invalid');
  assert(
    '5 token 零写入',
    stable(hTok.seriesBag[hTok.series.seriesId]) === stable(beforeTok) &&
      stable(hTok.matches) === stable(beforeTokM) &&
      hTok.saveLog.length === 0
  );

  var hIdx = createHarness({
    matchSpecs: {
      r1: { status: 'registering', occupants: ['u1', 'u2'] },
      r2: { status: 'registering', occupants: ['u1', 'u2'] }
    },
    breakIndexRound: 'r1'
  });
  var beforeIdx = freeze(hIdx.seriesBag[hIdx.series.seriesId]);
  var resIdx = hIdx.svc.cancelSelfRegistrationWithStationCleanup(args(hIdx));
  assert('5 index managed_station_invalid', resIdx.ok === false && resIdx.reason === 'managed_station_invalid');
  assert(
    '5 index 零写入',
    stable(hIdx.seriesBag[hIdx.series.seriesId]) === stable(beforeIdx) && hIdx.saveLog.length === 0
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
