/**
 * SERIES-CANCEL-LOCK-B2A：原代报名人代取消（领域层）
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesCancelLockB2A.selftest.js
 */

var path = require('path');
var fs = require('fs');

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
var orchPath = path.join(utilsDir, 'seriesSelfCancellationOrchestrator.js');
var orchSrc = fs.readFileSync(orchPath, 'utf8');
var orchMod = require(orchPath);
var seriesRegistration = require(path.join(utilsDir, 'seriesRegistration.js'));
var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var p3a = require(path.join(utilsDir, 'removePlayerFromMatchCompetitionStructure.js'));
var pageJs = fs.readFileSync(
  path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail', 'index.js'),
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

function occupiedIds(list) {
  return (Array.isArray(list) ? list : [])
    .map(function (p) {
      return String((p && (p.userId || p.playerId || p.id)) || '').trim();
    })
    .filter(Boolean);
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
      seriesId: 'series-lock-b2a',
      lifecycleStatus: 'published',
      publishState: 'published',
      publishToken: 'tok-lock-b2a',
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
          seriesId: 'series-lock-b2a',
          seriesParticipantId: 'team:1',
          playerId: 'u1',
          playerNameSnapshot: '本人',
          registrationStatus: 'registered',
          registrationSource: 'self',
          registeredByUserId: 'u1'
        },
        {
          rosterEntryId: 're-u2',
          seriesId: 'series-lock-b2a',
          seriesParticipantId: 'team:1',
          playerId: 'u2',
          playerNameSnapshot: '被代报',
          registrationStatus: 'registered',
          registrationSource: 'proxy',
          registeredByUserId: 'op1'
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
  var occupants = Object.prototype.hasOwnProperty.call(s, 'occupants')
    ? s.occupants || []
    : [];
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
      groups: occupants.length
        ? [
            {
              groupId: 'g1',
              groupName: '第1组',
              players: players,
              playersSlots: freeze(players)
            }
          ]
        : [],
      pairings: {},
      scoreEntities: {},
      scoreData: s.scoreData || { g1: { scoresByPlayer: {}, teamScoresByEntity: [] } },
      registerInfo: { users: [{ userId: 'u1' }, { userId: 'u2' }], totalCount: 2 },
      registrationStatus: 'open',
      paymentByUserId: { u2: { paid: true, amount: 100 } },
      fee: '100'
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
  var matchWriteCount = 0;

  var teamMatchStore = {
    getMatchById: function (id) {
      return matches[id] ? freeze(matches[id]) : null;
    },
    saveMatch: function (m) {
      matchWriteCount += 1;
      if (o.failMatchWriteAt && matchWriteCount === o.failMatchWriteAt) {
        throw new Error('injected_match_fail');
      }
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
    cancelProxyRegistration: o.failProxyCancel
      ? function () {
          return { ok: false, reason: 'storage_write_failed' };
        }
      : undefined,
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

function args(h, extra) {
  return Object.assign(
    {
      seriesId: h.series.seriesId,
      playerId: 'u2',
      rosterEntryId: 're-u2',
      actorUserId: 'op1',
      expectedRegistrationRevision: h.series.registrationRevision
    },
    extra || {}
  );
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

function snapshotProtected(h) {
  var s = h.seriesBag[h.series.seriesId];
  var out = {
    participants: freeze(s.participants),
    rounds: freeze(s.rounds),
    publishToken: s.publishToken
  };
  Object.keys(h.matches).forEach(function (id) {
    var m = h.matches[id];
    out[id] = {
      registerInfo: freeze(m.registerInfo),
      registrationStatus: m.registrationStatus,
      paymentByUserId: freeze(m.paymentByUserId),
      fee: m.fee
    };
  });
  return out;
}

assert(
  '复用编排器/gate；单笔 cancelProxy 仍不接页面',
  orchSrc.indexOf('inspectProxyCancellationImpact') >= 0 &&
    orchSrc.indexOf('cancelProxyRegistrationWithStationCleanup') >= 0 &&
    orchSrc.indexOf('resolveSeriesRegistrationCancellationGate') >= 0 &&
    orchSrc.indexOf('removeRespectingLiveScores') >= 0 &&
    orchSrc.indexOf('_applySeriesProxyCommitPlan') < 0 &&
    pageJs.indexOf('cancelProxyRegistrationWithStationCleanup') < 0
);

// 1. 未分组成功
(function () {
  var h = createHarness();
  var beforeMatches = freeze(h.matches);
  var prot = snapshotProtected(h);
  var res = h.svc.cancelProxyRegistrationWithStationCleanup(args(h));
  assert('1 未分组成功', res.ok === true && res.grouped === false && res.affectedRoundIds.length === 0);
  assert('1 只软取消目标 roster', rosterStatus(h, 'u2') === 'cancelled' && rosterStatus(h, 'u1') === 'registered');
  assert('1 revision +1', res.registrationRevision === 4 && h.seriesBag[h.series.seriesId].registrationRevision === 4);
  assert('1 不写 match', h.saveLog.length === 0 && stable(h.matches) === stable(beforeMatches));
  assert('1 无 journal', journalOf(h) == null);
  assert('1 保护字段不变', stable(snapshotProtected(h)) === stable(prot));
})();

// 2. 已分组无成绩成功
(function () {
  var h = createHarness({
    matchSpecs: {
      r1: { status: 'registering', occupants: ['u1', 'u2'] },
      r2: { status: 'registering', occupants: [] }
    }
  });
  var m2Before = freeze(h.matches.m2);
  var res = h.svc.cancelProxyRegistrationWithStationCleanup(args(h));
  assert('2 已分组成功', res.ok === true && res.grouped === true);
  assert('2 只写受影响站', res.affectedRoundIds.join(',') === 'r1' && h.saveLog.join(',') === 'm1');
  assert('2 清 u2 留 u1', occupiedIds(h.matches.m1.groups[0].players).join(',') === 'u1');
  assert('2 无关站未写', stable(h.matches.m2) === stable(m2Before));
  assert('2 roster / revision', rosterStatus(h, 'u2') === 'cancelled' && res.registrationRevision === 4);
  assert('2 journal 已清', journalOf(h) == null);
})();

// 3. LIVE 有成绩：完整清理
(function () {
  var h = createHarness({
    matchSpecs: {
      r1: {
        status: 'ongoing',
        occupants: ['u1', 'u2'],
        scoreData: { g1: { scoresByPlayer: { u2: { scores: [4, null, 5] }, u1: { scores: [] } } } }
      },
      r2: { status: 'registering', occupants: [] }
    }
  });
  var insp = h.svc.inspectProxyCancellationImpact(args(h));
  var res = h.svc.cancelProxyRegistrationWithStationCleanup(args(h));
  assert('3 inspect LIVE 可取消', insp.ok === true && !insp.blockedReason);
  assert('3 cancel LIVE 成功', res.ok === true && res.grouped === true && h.saveLog.join(',') === 'm1');
  assert('3 roster 已取消', rosterStatus(h, 'u2') === 'cancelled' && rosterStatus(h, 'u1') === 'registered');
  assert('3 结构已清 u2', occupiedIds(h.matches.m1.groups[0].players).join(',') === 'u1');
  assert(
    '3 LIVE 成绩已清',
    !h.matches.m1.scoreData.g1.scoresByPlayer.u2
  );
  assert('3 journal 已清 / revision +1', journalOf(h) == null && res.registrationRevision === 4);
})();

// 4. finalized 拒绝零写入
(function () {
  var h = createHarness({
    matchSpecs: {
      r1: {
        status: 'completed',
        occupants: ['u1', 'u2'],
        scoreData: { g1: { scoresByPlayer: { u2: { scores: [4, 5, 4] } } } }
      },
      r2: { status: 'registering', occupants: [] }
    }
  });
  var beforeSeries = freeze(h.seriesBag[h.series.seriesId]);
  var beforeMatches = freeze(h.matches);
  var insp = h.svc.inspectProxyCancellationImpact(args(h));
  var res = h.svc.cancelProxyRegistrationWithStationCleanup(args(h));
  assert('4 inspect finalized_score', insp.ok === false && insp.blockedReason === 'finalized_score');
  assert('4 cancel finalized_score', res.ok === false && res.reason === 'finalized_score');
  assert(
    '4 零写入',
    stable(h.seriesBag[h.series.seriesId]) === stable(beforeSeries) &&
      stable(h.matches) === stable(beforeMatches) &&
      h.saveLog.length === 0 &&
      journalOf(h) == null
  );
})();

// 5. managed 异常拒绝零写入
(function () {
  var h = createHarness({
    matchSpecs: {
      r1: { status: 'registering', occupants: ['u1', 'u2'] },
      r2: { status: 'registering', occupants: [] }
    },
    breakTokenRound: 'r1'
  });
  var beforeSeries = freeze(h.seriesBag[h.series.seriesId]);
  var beforeMatches = freeze(h.matches);
  var res = h.svc.cancelProxyRegistrationWithStationCleanup(args(h));
  assert('5 managed_station_invalid', res.ok === false && res.reason === 'managed_station_invalid');
  assert(
    '5 零写入',
    stable(h.seriesBag[h.series.seriesId]) === stable(beforeSeries) &&
      stable(h.matches) === stable(beforeMatches) &&
      journalOf(h) == null
  );
})();

// 6. 写前变为 finalized
(function () {
  var h = createHarness({
    matchSpecs: {
      r1: { status: 'registering', occupants: ['u1', 'u2'] },
      r2: { status: 'registering', occupants: [] }
    }
  });
  var insp = h.svc.inspectProxyCancellationImpact(args(h));
  assert('6 inspect 先通过', insp.ok === true);
  h.matches.m1.status = 'finished';
  h.matches.m1.scoreData = { g1: { scoresByPlayer: { u2: { scores: [4, 5] } } } };
  var beforeSeries = freeze(h.seriesBag[h.series.seriesId]);
  var beforeMatches = freeze(h.matches);
  var res = h.svc.cancelProxyRegistrationWithStationCleanup(args(h));
  assert('6 写前 finalized 拒绝', res.ok === false && res.reason === 'finalized_score');
  assert(
    '6 零写入',
    stable(h.seriesBag[h.series.seriesId]) === stable(beforeSeries) &&
      stable(h.matches) === stable(beforeMatches) &&
      h.saveLog.length === 0 &&
      journalOf(h) == null
  );
})();

// 7. 授权拒绝
(function () {
  var h = createHarness();
  var before = freeze(h.seriesBag[h.series.seriesId]);
  var other = h.svc.cancelProxyRegistrationWithStationCleanup(args(h, { actorUserId: 'other' }));
  assert('7 非原代报名人', other.ok === false && other.reason === 'not_registered_by_me');

  var selfReg = h.svc.cancelProxyRegistrationWithStationCleanup(args(h, {
    playerId: 'u1',
    rosterEntryId: 're-u1',
    actorUserId: 'op1'
  }));
  assert('7 self 报名不可走 proxy', selfReg.ok === false && selfReg.reason === 'not_proxy');

  var selfActor = h.svc.cancelProxyRegistrationWithStationCleanup(args(h, {
    playerId: 'u1',
    rosterEntryId: 're-u1',
    actorUserId: 'u1'
  }));
  assert(
    '7 不能借 proxy 取消本人',
    selfActor.ok === false &&
      (selfActor.reason === 'proxy_target_is_self' || selfActor.reason === 'not_proxy')
  );

  var mismatch = h.svc.cancelProxyRegistrationWithStationCleanup(args(h, {
    playerId: 'u1',
    rosterEntryId: 're-u2'
  }));
  assert('7 rosterEntryId/playerId 不匹配', mismatch.ok === false && mismatch.reason === 'player_id_mismatch');
  assert('7 授权失败零写入', stable(h.seriesBag[h.series.seriesId]) === stable(before) && h.saveLog.length === 0);
})();

// 8. revision 冲突
(function () {
  var h = createHarness({
    matchSpecs: { r1: { occupants: ['u1', 'u2'] } }
  });
  var beforeSeries = freeze(h.seriesBag[h.series.seriesId]);
  var res = h.svc.cancelProxyRegistrationWithStationCleanup(args(h, { expectedRegistrationRevision: 1 }));
  assert('8 revision 冲突', res.ok === false && res.reason === 'registration_conflict');
  assert('8 零写入', stable(h.seriesBag[h.series.seriesId]) === stable(beforeSeries) && h.saveLog.length === 0);
})();

// 9. 中途写失败回滚
(function () {
  var h = createHarness({
    matchSpecs: {
      r1: { occupants: ['u1', 'u2'] },
      r2: { occupants: ['u2'] }
    },
    failMatchWriteAt: 1
  });
  var beforeSeries = freeze(h.seriesBag[h.series.seriesId]);
  var beforeMatches = freeze(h.matches);
  var res = h.svc.cancelProxyRegistrationWithStationCleanup(args(h));
  assert('9 中途失败', res.ok === false && res.reason === 'storage_failed');
  assert('9 series 未写', stable(h.seriesBag[h.series.seriesId]) === stable(beforeSeries));
  assert('9 matches 回滚', stable(h.matches) === stable(beforeMatches));
  assert('9 journal 已清', journalOf(h) == null);
})();

(function () {
  var h = createHarness({
    matchSpecs: {
      r1: { occupants: ['u1', 'u2'] },
      r2: { occupants: ['u2'] }
    },
    failProxyCancel: true
  });
  var beforeSeries = freeze(h.seriesBag[h.series.seriesId]);
  var beforeMatches = freeze(h.matches);
  var res = h.svc.cancelProxyRegistrationWithStationCleanup(args(h));
  assert('9 roster 失败回滚 match', res.ok === false && res.reason === 'storage_failed');
  assert('9 roster 失败后 matches 恢复', stable(h.matches) === stable(beforeMatches));
  assert('9 roster 仍 registered', rosterStatus(h, 'u2') === 'registered');
  assert('9 roster 失败 series 不变', stable(h.seriesBag[h.series.seriesId]) === stable(beforeSeries));
  assert('9 roster 失败 journal 已清', journalOf(h) == null);
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
