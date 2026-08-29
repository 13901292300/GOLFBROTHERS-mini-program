/**
 * REG-P3-B1：Series 本人取消编排（roster 软取消 + 分站结构清理 + journal）
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/regP3B1.selftest.js
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

function entityMembers(ids) {
  return (ids || []).map(function (id) {
    return { userId: id };
  });
}

function occupiedIds(list) {
  return (Array.isArray(list) ? list : [])
    .map(function (p) {
      if (p == null) return '';
      if (typeof p === 'string' || typeof p === 'number') return String(p).trim();
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
    },
    _bag: bag
  };
}

function makeSeries(overrides) {
  var raw = Object.assign(
    {
      seriesId: 'series-p3b1',
      lifecycleStatus: 'published',
      publishState: 'published',
      publishToken: 'tok-p3b1',
      hostMode: 'organization',
      registrationState: 'open',
      registrationRevision: 3,
      competitionPhaseCache: 'registration',
      createdBy: 'creator-1',
      participants: [
        { seriesParticipantId: 'team:1', kind: 'team', sourceTeamId: '1', nameSnapshot: '甲队' },
        { seriesParticipantId: 'team:2', kind: 'team', sourceTeamId: '2', nameSnapshot: '乙队' }
      ],
      roster: [
        {
          rosterEntryId: 're-u1',
          seriesId: 'series-p3b1',
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
        { roundId: 'r2', index: 2, name: '第2轮', matchId: 'm2', gameMode: '个人比杆赛' },
        { roundId: 'r3', index: 3, name: '第3轮', matchId: 'm3', gameMode: '个人比杆赛' }
      ]
    },
    overrides || {}
  );
  return seriesModel.normalizeSeries(raw);
}

function structureFor(mode, occupant) {
  var others = occupant === 'u1' ? ['u1', 'u2'] : [occupant, 'u8'];
  var players = emptySlots(others);
  var base = {
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
    scoreData: { g1: { scoresByPlayer: {}, teamScoresByEntity: [] } }
  };
  if (mode === 'g2' || mode === 'g3') {
    base.gameMode = mode === 'g3' ? '最佳球位比杆赛' : '四人四球比杆赛';
    base.scoreEntities = {
      g1: [
        {
          entityId: 'e-red',
          entityType: 'team',
          compositionMode: mode === 'g3' ? '4+0' : '2+2',
          members: entityMembers(others)
        },
        {
          entityId: 'e-blue',
          entityType: 'team',
          compositionMode: mode === 'g3' ? '4+0' : '2+2',
          members: entityMembers(['u3', 'u4'])
        }
      ]
    };
    return base;
  }
  if (mode === 'g4') {
    base.gameMode = '四人两球比杆赛';
    base.pairings = {
      g1: [
        { id: 'pair-1', playerIds: others.slice() },
        { id: 'pair-2', playerIds: ['u3', 'u4'] }
      ]
    };
    base.scoreEntities = {
      g1: [
        { entityId: 'pair-1', entityType: 'pair', members: entityMembers(others) },
        { entityId: 'pair-2', entityType: 'pair', members: entityMembers(['u3', 'u4']) }
      ]
    };
    return base;
  }
  base.gameMode = '个人比杆赛';
  return base;
}

function makeMatch(series, round, spec) {
  var s = spec || {};
  var mode = s.mode || null;
  var occupant = s.occupant || (mode ? 'u1' : '');
  var struct = mode
    ? structureFor(mode, occupant)
    : {
        gameMode: round.gameMode || '个人比杆赛',
        groups: [],
        pairings: {},
        scoreEntities: {},
        scoreData: {}
      };
  return Object.assign(
    {
      matchId: round.matchId,
      gameMode: struct.gameMode,
      seriesContext: {
        managed: true,
        seriesId: series.seriesId,
        roundId: round.roundId,
        publishToken: series.publishToken
      },
      groups: struct.groups,
      playersSlots: undefined,
      pairings: struct.pairings,
      scoreEntities: struct.scoreEntities,
      scoreData: struct.scoreData,
      registerInfo: { users: [{ userId: 'u1' }, { userId: 'u2' }], totalCount: 2 },
      registrationStatus: 'open',
      paymentByUserId: { u1: { paid: true, amount: 100 } },
      fee: '100',
      feeList: [{ id: 'f1', amount: 100 }]
    },
    s.patch || {}
  );
}

function createHarness(opts) {
  var o = opts || {};
  var series = o.series || makeSeries(o.seriesPatch);
  var modes = o.modes || {};
  var matches = Object.create(null);
  series.rounds.forEach(function (r) {
    matches[r.matchId] = makeMatch(series, r, {
      mode: modes[r.roundId] || null,
      occupant: o.occupants && o.occupants[r.roundId]
    });
  });
  if (o.scoreRound) {
    var sid = series.rounds.filter(function (r) {
      return r.roundId === o.scoreRound;
    })[0];
    if (sid && matches[sid.matchId]) {
      matches[sid.matchId].scoreData = {
        g1: { scoresByPlayer: { u1: { scores: [4, 5, 3] } } }
      };
    }
  }
  if (o.entityScoreRound) {
    var es = series.rounds.filter(function (r) {
      return r.roundId === o.entityScoreRound;
    })[0];
    if (es && matches[es.matchId]) {
      matches[es.matchId].scoreData = {
        g1: { teamScoresByEntity: [{ teamId: 'e-red', scores: [4, 4, 5] }] }
      };
    }
  }

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

  var storage = o.storage || createMemoryStorage();
  if (o.failJournalWrite) {
    storage.setItem = function () {
      return { ok: false, reason: 'storage_write_failed' };
    };
  }

  var saveLog = [];
  var seriesWriteLog = [];
  var matchWriteCount = 0;

  var teamMatchStore = {
    getMatchById: function (id) {
      return matches[id] ? freeze(matches[id]) : null;
    },
    saveMatch: function (m) {
      matchWriteCount += 1;
      if (o.failRestore && o._restoring) throw new Error('injected_restore_fail');
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
      if (o.failRestore && o._restoring) return { ok: false, reason: 'injected_restore_fail' };
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
      return { ok: true, ids: ['team:1', 'team:2'] };
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
      if (o.failCancel) return { ok: false, reason: 'storage_write_failed' };
      var res = realReg.cancelSelfRegistration(input);
      if (res && res.ok && o.corruptAfterSeriesWrite) {
        var first = series.rounds[0];
        if (first && matches[first.matchId] && matches[first.matchId].groups[0]) {
          matches[first.matchId].groups[0].players = emptySlots(['u1', 'u2']);
        }
      }
      return res;
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
    seriesWriteLog: seriesWriteLog,
    index: index,
    beginRestore: function () {
      o._restoring = true;
    },
    snapshotForbidden: function () {
      var out = {
        seriesParticipants: freeze(seriesBag[series.seriesId].participants),
        seriesRounds: freeze(seriesBag[series.seriesId].rounds),
        publishToken: seriesBag[series.seriesId].publishToken
      };
      Object.keys(matches).forEach(function (id) {
        var m = matches[id];
        out[id] = {
          registerInfo: freeze(m.registerInfo),
          registrationStatus: m.registrationStatus,
          paymentByUserId: freeze(m.paymentByUserId),
          fee: m.fee,
          feeList: freeze(m.feeList),
          scoreData: freeze(m.scoreData)
        };
      });
      return out;
    }
  };
}

function args(h, extra) {
  return Object.assign(
    {
      seriesId: h.series.seriesId,
      playerId: 'u1',
      actorUserId: 'u1',
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

assert(
  '消费 P3-A / cancelSelfRegistration / managed 核验',
  orchSrc.indexOf('removePlayerFromMatchCompetitionStructure') >= 0 &&
    orchSrc.indexOf('cancelSelfRegistration') >= 0 &&
    orchSrc.indexOf('verifyManagedStationForManage') >= 0
);
assert(
  '不复制 P3-A 清组实现、不 toast、不接页面',
  orchSrc.indexOf('clearUserFromFormalGroups') < 0 &&
    orchSrc.indexOf('wx.showToast') < 0 &&
    orchSrc.indexOf('series-detail') < 0
);
assert('独立 journal key', orchMod.JOURNAL_KEY === 'gb_series_self_cancel_journal_v1');

// 1. 未分组：只软取消 roster
(function () {
  var h = createHarness();
  var beforeMatches = freeze(h.matches);
  var forb = h.snapshotForbidden();
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert('1 未分组成功', res.ok === true && res.grouped === false && res.affectedRoundIds.length === 0);
  assert('1 只软取消 roster', rosterStatus(h, 'u1') === 'cancelled');
  assert('1 revision +1', res.registrationRevision === 4);
  assert('1 不写任何 match', h.saveLog.length === 0 && stable(h.matches) === stable(beforeMatches));
  assert('1 无 journal', journalOf(h) == null);
  assert('1 禁止字段不变', stable(h.snapshotForbidden()) === stable(forb));
})();

// 2. R1 分组：写 R1 + roster
(function () {
  var h = createHarness({ modes: { r1: 'g1' } });
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert('2 R1 成功', res.ok === true && res.grouped === true);
  assert('2 只写 R1', res.affectedRoundIds.join(',') === 'r1' && h.saveLog.join(',') === 'm1');
  assert('2 roster 已取消', rosterStatus(h, 'u1') === 'cancelled');
  assert('2 R1 已清 u1', occupiedIds(h.matches.m1.groups[0].players).join(',') === 'u2');
  assert('2 R2/R3 未写', occupiedIds((h.matches.m2.groups[0] && h.matches.m2.groups[0].players) || []).join(',') === '');
  assert('2 journal 已清', journalOf(h) == null);
})();

// 3. R1/R2 分组：两轮均写
(function () {
  var h = createHarness({ modes: { r1: 'g1', r2: 'g1' } });
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert('3 两轮成功', res.ok && res.affectedRoundIds.join(',') === 'r1,r2');
  assert('3 两轮均写', h.saveLog.join(',') === 'm1,m2');
  assert('3 两轮都清 u1', occupiedIds(h.matches.m1.groups[0].players).join(',') === 'u2' && occupiedIds(h.matches.m2.groups[0].players).join(',') === 'u2');
})();

// 4. 无关轮不写
(function () {
  var h = createHarness({
    modes: { r1: 'g1', r3: 'g1' },
    occupants: { r3: 'u9' }
  });
  var m3Before = freeze(h.matches.m3);
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert('4 只影响 R1', res.ok && res.affectedRoundIds.join(',') === 'r1');
  assert('4 不写无关轮', h.saveLog.join(',') === 'm1' && stable(h.matches.m3) === stable(m3Before));
  assert('4 无关轮仍有 u9', occupiedIds(h.matches.m3.groups[0].players).indexOf('u9') >= 0);
})();

// 5. G1
(function () {
  var h = createHarness({ modes: { r1: 'g1' } });
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert('5 G1 清席位', res.ok && occupiedIds(h.matches.m1.groups[0].players).join(',') === 'u2');
  assert('5 G1 空组保留', h.matches.m1.groups.length === 1 && h.matches.m1.groups[0].players.length === 4);
})();

// 6. G2/G3
(function () {
  var h2 = createHarness({
    seriesPatch: {
      rounds: [
        { roundId: 'r1', index: 1, name: '第1轮', matchId: 'm1', gameMode: '四人四球比杆赛' },
        { roundId: 'r2', index: 2, name: '第2轮', matchId: 'm2', gameMode: '最佳球位比杆赛' },
        { roundId: 'r3', index: 3, name: '第3轮', matchId: 'm3', gameMode: '个人比杆赛' }
      ]
    },
    modes: { r1: 'g2', r2: 'g3' }
  });
  var res = h2.svc.cancelSelfRegistrationWithStationCleanup(args(h2));
  assert('6 G2/G3 成功', res.ok && res.affectedRoundIds.join(',') === 'r1,r2');
  assert(
    '6 G2 entity 移出 u1 保留 id',
    h2.matches.m1.scoreEntities.g1[0].entityId === 'e-red' &&
      h2.matches.m1.scoreEntities.g1[0].members.map(function (m) { return m.userId; }).join(',') === 'u2'
  );
  assert(
    '6 G3 entity 移出 u1',
    h2.matches.m2.scoreEntities.g1[0].members.map(function (m) { return m.userId; }).join(',') === 'u2'
  );
})();

// 7. G4
(function () {
  var h = createHarness({
    seriesPatch: {
      rounds: [
        { roundId: 'r1', index: 1, name: '第1轮', matchId: 'm1', gameMode: '四人两球比杆赛' },
        { roundId: 'r2', index: 2, name: '第2轮', matchId: 'm2', gameMode: '个人比杆赛' },
        { roundId: 'r3', index: 3, name: '第3轮', matchId: 'm3', gameMode: '个人比杆赛' }
      ]
    },
    modes: { r1: 'g4' }
  });
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert('7 G4 成功', res.ok);
  assert('7 G4 pairing 保留行', h.matches.m1.pairings.g1[0].id === 'pair-1' && h.matches.m1.pairings.g1[0].playerIds.join(',') === 'u2');
  assert(
    '7 G4 pair entity 移出 u1',
    h.matches.m1.scoreEntities.g1[0].entityId === 'pair-1' &&
      h.matches.m1.scoreEntities.g1[0].members.map(function (m) { return m.userId; }).join(',') === 'u2'
  );
})();

// 8. 有真实成绩：零写入
(function () {
  var h = createHarness({ modes: { r1: 'g1' }, scoreRound: 'r1' });
  var beforeSeries = freeze(h.seriesBag[h.series.seriesId]);
  var beforeMatches = freeze(h.matches);
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert('8 成绩 blocked', res.ok === false && res.reason === 'player_has_real_score');
  assert('8 零写入 series', stable(h.seriesBag[h.series.seriesId]) === stable(beforeSeries));
  assert('8 零写入 matches', stable(h.matches) === stable(beforeMatches) && h.saveLog.length === 0);
  assert('8 无 journal', journalOf(h) == null);
})();

// 9. revision 冲突：零写入
(function () {
  var h = createHarness({ modes: { r1: 'g1' } });
  var beforeSeries = freeze(h.seriesBag[h.series.seriesId]);
  var beforeMatches = freeze(h.matches);
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h, { expectedRegistrationRevision: 1 }));
  assert('9 revision 冲突', res.ok === false && res.reason === 'registration_conflict');
  assert('9 零写入', stable(h.seriesBag[h.series.seriesId]) === stable(beforeSeries) && stable(h.matches) === stable(beforeMatches));
})();

// 10. managed token/index 错误：零写入
(function () {
  var hTok = createHarness({ modes: { r1: 'g1' }, breakTokenRound: 'r2' });
  var beforeTok = freeze(hTok.seriesBag[hTok.series.seriesId]);
  var beforeTokM = freeze(hTok.matches);
  var resTok = hTok.svc.cancelSelfRegistrationWithStationCleanup(args(hTok));
  assert('10 token 错误', resTok.ok === false && resTok.reason === 'managed_station_invalid');
  assert('10 token 零写入', stable(hTok.seriesBag[hTok.series.seriesId]) === stable(beforeTok) && stable(hTok.matches) === stable(beforeTokM));

  var hIdx = createHarness({ modes: { r1: 'g1' }, breakIndexRound: 'r1' });
  var beforeIdx = freeze(hIdx.seriesBag[hIdx.series.seriesId]);
  var resIdx = hIdx.svc.cancelSelfRegistrationWithStationCleanup(args(hIdx));
  assert('10 index 错误', resIdx.ok === false && resIdx.reason === 'managed_station_invalid');
  assert('10 index 零写入', stable(hIdx.seriesBag[hIdx.series.seriesId]) === stable(beforeIdx) && hIdx.saveLog.length === 0);
})();

// 11. 第一站保存失败：全零写入
(function () {
  var h = createHarness({ modes: { r1: 'g1', r2: 'g1' }, failMatchWriteAt: 1 });
  var beforeSeries = freeze(h.seriesBag[h.series.seriesId]);
  var beforeMatches = freeze(h.matches);
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert('11 第一站失败', res.ok === false && res.reason === 'storage_failed');
  assert('11 series 未写', stable(h.seriesBag[h.series.seriesId]) === stable(beforeSeries));
  assert('11 matches 未变', stable(h.matches) === stable(beforeMatches));
  assert('11 journal 已清', journalOf(h) == null);
})();

// 12. 第二站保存失败：恢复第一站
(function () {
  var h = createHarness({ modes: { r1: 'g1', r2: 'g1' }, failMatchWriteAt: 2 });
  var m1Before = freeze(h.matches.m1);
  var m2Before = freeze(h.matches.m2);
  var beforeSeries = freeze(h.seriesBag[h.series.seriesId]);
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert('12 第二站失败', res.ok === false && res.reason === 'storage_failed');
  assert('12 恢复第一站', stable(h.matches.m1) === stable(m1Before));
  assert('12 第二站未留下半成品', stable(h.matches.m2) === stable(m2Before));
  assert('12 series 未写', stable(h.seriesBag[h.series.seriesId]) === stable(beforeSeries));
  assert('12 journal 已清', journalOf(h) == null);
})();

// 13. roster 取消失败：恢复全部 match
(function () {
  var h = createHarness({ modes: { r1: 'g1', r2: 'g1' }, failCancel: true });
  var beforeMatches = freeze(h.matches);
  var beforeSeries = freeze(h.seriesBag[h.series.seriesId]);
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert('13 roster 失败', res.ok === false && res.reason === 'storage_failed');
  assert('13 恢复全部 match', stable(h.matches) === stable(beforeMatches));
  assert('13 series 仍 registered', rosterStatus(h, 'u1') === 'registered');
  assert('13 series 深比较不变', stable(h.seriesBag[h.series.seriesId]) === stable(beforeSeries));
  assert('13 journal 已清', journalOf(h) == null);
})();

// 14. 写后核验失败：恢复 Series + matches
(function () {
  var h = createHarness({ modes: { r1: 'g1' }, corruptAfterSeriesWrite: true });
  var beforeMatches = freeze(h.matches);
  var beforeSeries = freeze(h.seriesBag[h.series.seriesId]);
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert('14 核验失败', res.ok === false && (res.reason === 'verify_failed' || res.reason === 'storage_failed'));
  assert('14 恢复 matches', stable(h.matches) === stable(beforeMatches));
  assert('14 恢复 Series roster', rosterStatus(h, 'u1') === 'registered');
  assert('14 恢复 revision', h.seriesBag[h.series.seriesId].registrationRevision === beforeSeries.registrationRevision);
  assert('14 journal 已清', journalOf(h) == null);
})();

function plantJournal(h, phase, extra) {
  var matchesBefore = [];
  var affectedRoundIds = [];
  Object.keys(h.matches).forEach(function (id) {
    var m = h.matches[id];
    if (occupiedIds((m.groups[0] && m.groups[0].players) || []).indexOf('u1') >= 0) {
      matchesBefore.push(freeze(m));
      affectedRoundIds.push(m.seriesContext.roundId);
    }
  });
  h.storage.setItem(orchMod.JOURNAL_KEY, Object.assign({
    operationId: 'ssc_plant',
    seriesId: h.series.seriesId,
    playerId: 'u1',
    actorUserId: 'u1',
    expectedRegistrationRevision: h.series.registrationRevision,
    phase: phase,
    seriesBefore: freeze(h.seriesBag[h.series.seriesId]),
    matchesBefore: matchesBefore,
    affectedRoundIds: affectedRoundIds,
    createdAt: 1700000000100
  }, extra || {}));
  return matchesBefore;
}

// 15. prepared 恢复
(function () {
  var h = createHarness({ modes: { r1: 'g1' } });
  var before = freeze(h.matches.m1);
  plantJournal(h, 'prepared');
  var rec = h.svc.recoverInterruptedSelfCancellation();
  assert('15 prepared 恢复成功', rec.ok === true);
  assert('15 prepared 后无 journal', journalOf(h) == null);
  assert('15 prepared match 仍是 before', stable(h.matches.m1) === stable(before));
  assert('15 roster 未动', rosterStatus(h, 'u1') === 'registered');
})();

// 16. matches_written 恢复
(function () {
  var h = createHarness({ modes: { r1: 'g1' } });
  var before = freeze(h.matches.m1);
  plantJournal(h, 'matches_written');
  var cleaned = p3a.removePlayerFromMatchCompetitionStructure(h.matches.m1, 'u1');
  h.matches.m1 = freeze(cleaned.match);
  assert('16 预置已写成 after', occupiedIds(h.matches.m1.groups[0].players).indexOf('u1') < 0);
  var rec = h.svc.recoverInterruptedSelfCancellation();
  assert('16 matches_written 恢复成功', rec.ok === true);
  assert('16 恢复 R1 before', stable(h.matches.m1) === stable(before));
  assert('16 roster 未动', rosterStatus(h, 'u1') === 'registered');
  assert('16 journal 已清', journalOf(h) == null);
})();

// 17. series_written 恢复
(function () {
  var h = createHarness({ modes: { r1: 'g1' } });
  var beforeMatch = freeze(h.matches.m1);
  var beforeSeries = freeze(h.seriesBag[h.series.seriesId]);
  plantJournal(h, 'series_written');
  var cleaned = p3a.removePlayerFromMatchCompetitionStructure(h.matches.m1, 'u1');
  h.matches.m1 = freeze(cleaned.match);
  h.seriesBag[h.series.seriesId].roster[0].registrationStatus = 'cancelled';
  h.seriesBag[h.series.seriesId].registrationRevision = 4;
  var rec = h.svc.recoverInterruptedSelfCancellation();
  assert('17 series_written 恢复成功', rec.ok === true);
  assert('17 恢复 match', stable(h.matches.m1) === stable(beforeMatch));
  assert('17 恢复 series', rosterStatus(h, 'u1') === 'registered' && h.seriesBag[h.series.seriesId].registrationRevision === beforeSeries.registrationRevision);
  assert('17 journal 已清', journalOf(h) == null);
})();

// 18. recovery 失败保留 journal
(function () {
  var h = createHarness({ modes: { r1: 'g1' }, failRestore: true });
  plantJournal(h, 'matches_written');
  var cleaned = p3a.removePlayerFromMatchCompetitionStructure(h.matches.m1, 'u1');
  h.matches.m1 = freeze(cleaned.match);
  h.beginRestore();
  var rec = h.svc.recoverInterruptedSelfCancellation();
  assert('18 recovery 失败', rec.ok === false && rec.reason === 'recovery_required');
  assert('18 保留 journal', journalOf(h) != null && journalOf(h).phase === 'matches_written');
})();

// 19. 重复恢复幂等
(function () {
  var h = createHarness({ modes: { r1: 'g1' } });
  var before = freeze(h.matches.m1);
  plantJournal(h, 'matches_written');
  h.matches.m1 = freeze(p3a.removePlayerFromMatchCompetitionStructure(h.matches.m1, 'u1').match);
  var rec1 = h.svc.recoverInterruptedSelfCancellation();
  var rec2 = h.svc.recoverInterruptedSelfCancellation();
  assert('19 第一次恢复成功', rec1.ok === true);
  assert('19 第二次 idle 幂等', rec2.ok === true && rec2.reason === 'idle');
  assert('19 数据仍是 before', stable(h.matches.m1) === stable(before));
  assert('19 无 journal', journalOf(h) == null);
})();

// 20. 所有禁止字段深比较不变
(function () {
  var h = createHarness({
    seriesPatch: {
      rounds: [
        { roundId: 'r1', index: 1, name: '第1轮', matchId: 'm1', gameMode: '四人两球比杆赛' },
        { roundId: 'r2', index: 2, name: '第2轮', matchId: 'm2', gameMode: '个人比杆赛' },
        { roundId: 'r3', index: 3, name: '第3轮', matchId: 'm3', gameMode: '个人比杆赛' }
      ]
    },
    modes: { r1: 'g4', r2: 'g1', r3: 'g1' },
    occupants: { r3: 'u9' }
  });
  var forb = h.snapshotForbidden();
  var m3Before = freeze(h.matches.m3);
  var otherBefore = occupiedIds(h.matches.m1.groups[0].players).concat(occupiedIds(h.matches.m2.groups[0].players));
  var res = h.svc.cancelSelfRegistrationWithStationCleanup(args(h));
  assert('20 成功', res.ok === true);
  assert('20 禁止字段深比较不变', stable(h.snapshotForbidden()) === stable(forb));
  assert('20 无关轮不变', stable(h.matches.m3) === stable(m3Before));
  assert('20 其他球员仍在', occupiedIds(h.matches.m1.groups[0].players).join(',') === 'u2' && occupiedIds(h.matches.m2.groups[0].players).join(',') === 'u2');
  assert('20 其他球员预置包含 u2', otherBefore.indexOf('u2') >= 0);
})();

// inspect 只读 + 缺席轮跳过
(function () {
  var h = createHarness({ modes: { r1: 'g1' } });
  var before = freeze(h.matches);
  var beforeSeries = freeze(h.seriesBag[h.series.seriesId]);
  var insp = h.svc.inspectSelfCancellationImpact({
    seriesId: h.series.seriesId,
    playerId: 'u1',
    actorUserId: 'u1'
  });
  assert('inspect ok grouped', insp.ok === true && insp.grouped === true);
  assert('inspect 只列需写站', insp.affectedStations.length === 1 && insp.affectedStations[0].roundId === 'r1');
  assert('inspect 只读', stable(h.matches) === stable(before) && stable(h.seriesBag[h.series.seriesId]) === stable(beforeSeries));
})();

// 未知 phase 不猜测
(function () {
  var h = createHarness({ modes: { r1: 'g1' } });
  plantJournal(h, 'weird_phase');
  var rec = h.svc.recoverInterruptedSelfCancellation();
  assert('未知 phase 保留 journal', rec.ok === false && rec.reason === 'journal_phase_unknown' && journalOf(h) != null);
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
