/**
 * SERIES-CANCEL-LOCK-C1：Series 管理员选手管理删除（领域层）
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesCancelLockC1.selftest.js
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
var seriesManageAccess = require(path.join(utilsDir, 'seriesManageAccess.js'));
var p3a = require(seriesTestPaths.util('removePlayerFromMatchCompetitionStructure.js'));
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
      seriesId: 'series-lock-c1',
      lifecycleStatus: 'published',
      publishState: 'published',
      publishToken: 'tok-lock-c1',
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
          seriesId: 'series-lock-c1',
          seriesParticipantId: 'team:1',
          playerId: 'u1',
          playerNameSnapshot: '本人',
          playerAvatarSnapshot: 'a1',
          registrationStatus: 'registered',
          registrationSource: 'self',
          registeredByUserId: 'u1'
        },
        {
          rosterEntryId: 're-u2',
          seriesId: 'series-lock-c1',
          seriesParticipantId: 'team:1',
          playerId: 'u2',
          playerNameSnapshot: '被代报',
          playerAvatarSnapshot: 'a2',
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
  var privilege = typeof o.privilege === 'function' ? o.privilege : null;

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
      if (o.corruptAfterSeriesWrite) {
        seriesBag[input.seriesId].roster = freeze(series.roster);
        seriesBag[input.seriesId].registrationRevision = series.registrationRevision;
      }
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
    canRegisterForOther: function () {
      return { allowed: true };
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
    canRegisterForOther: function () {
      return { allowed: true };
    },
    isSeriesHostPrivileged: privilege
      ? function (s, actor) {
          return privilege(s, actor);
        }
      : function (s, actor) {
          return seriesManageAccess.isSeriesHostPrivileged(s, actor);
        },
    cancelAdminPlayerRemoval: o.failAdminCancel
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

function adminArgs(h, extra) {
  return Object.assign(
    {
      seriesId: h.series.seriesId,
      playerId: 'u1',
      rosterEntryId: 're-u1',
      actorUserId: 'creator-1',
      expectedRegistrationRevision: h.seriesBag[h.series.seriesId].registrationRevision
    },
    extra || {}
  );
}

function rosterEntry(h, playerId) {
  var s = h.seriesBag[h.series.seriesId];
  var list = (s && s.roster) || [];
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i] && list[i].playerId === playerId) return list[i];
  }
  return null;
}

function rosterStatus(h, playerId) {
  var e = rosterEntry(h, playerId);
  return e ? e.registrationStatus : '';
}

function journalOf(h) {
  return h.storage.getItem(orchMod.JOURNAL_KEY).value;
}

assert(
  '管理员入口在编排器；复用 isSeriesHostPrivileged',
  orchSrc.indexOf('inspectAdminPlayerRemovalImpact') >= 0 &&
    orchSrc.indexOf('removePlayerByAdminWithStationCleanup') >= 0 &&
    orchSrc.indexOf('locateAdminTarget') >= 0 &&
    orchSrc.indexOf('seriesManageAccess.isSeriesHostPrivileged') >= 0 &&
    /require\(['"][^'"]*seriesManageAccess\.js['"]\)/.test(orchSrc) &&
    orchSrc.indexOf('resolveSeriesRegistrationCancellationGate') >= 0 &&
    pageJs.indexOf('cancelProxyRegistrationWithStationCleanup') < 0 &&
    pageJs.indexOf('removePlayerByAdminWithStationCleanup') >= 0 &&
    orchSrc.indexOf('inspectSelfCancellationImpact') >= 0 &&
    orchSrc.indexOf('inspectProxyCancellationImpact') >= 0 &&
    orchSrc.indexOf('applyProxyCommitPlanWithStationCleanup') >= 0
);

(function () {
  var h = createHarness();
  var res = h.svc.removePlayerByAdminWithStationCleanup(adminArgs(h));
  var e = rosterEntry(h, 'u1');
  assert('创建者删除 self 报名成功', res.ok === true && rosterStatus(h, 'u1') === 'cancelled');
  assert(
    'self 历史来源保留',
    e.registrationSource === 'self' && e.registeredByUserId === 'u1' && e.playerNameSnapshot === '本人'
  );
  assert('self 删除 revision +1', res.registrationRevision === 4 && rosterStatus(h, 'u2') === 'registered');
})();

(function () {
  var h = createHarness();
  var res = h.svc.removePlayerByAdminWithStationCleanup(
    adminArgs(h, { playerId: 'u2', rosterEntryId: 're-u2' })
  );
  var e = rosterEntry(h, 'u2');
  assert('创建者删除 proxy 报名成功', res.ok === true && rosterStatus(h, 'u2') === 'cancelled');
  assert(
    'proxy 历史 registeredBy 保留',
    e.registrationSource === 'proxy' &&
      e.registeredByUserId === 'op1' &&
      e.playerNameSnapshot === '被代报'
  );
})();

(function () {
  var h = createHarness({
    privilege: function (series, actor) {
      var uid = String(actor && (actor.userId || actor.playerId) ? actor.userId || actor.playerId : actor || '');
      return uid === 'admin-2';
    }
  });
  var res = h.svc.removePlayerByAdminWithStationCleanup(
    adminArgs(h, { actorUserId: 'admin-2' })
  );
  assert(
    '现有非创建者管理员权限通过时成功',
    res.ok === true && rosterStatus(h, 'u1') === 'cancelled' && res.registrationRevision === 4
  );
})();

(function () {
  var h = createHarness();
  var before = freeze(h.seriesBag[h.series.seriesId]);
  var res = h.svc.removePlayerByAdminWithStationCleanup(
    adminArgs(h, { actorUserId: 'stranger' })
  );
  assert('非管理员拒绝', res.ok === false && res.reason === 'permission_denied');
  assert(
    '非管理员零写入',
    stable(h.seriesBag[h.series.seriesId]) === stable(before) && h.saveLog.length === 0
  );
})();

(function () {
  var h = createHarness();
  var beforeM = freeze(h.matches);
  var res = h.svc.removePlayerByAdminWithStationCleanup(adminArgs(h));
  assert(
    '未分组成功',
    res.ok === true && res.grouped === false && res.affectedRoundIds.length === 0
  );
  assert('未分组不写 match', h.saveLog.length === 0 && stable(h.matches) === stable(beforeM));
})();

(function () {
  var h = createHarness({
    matchSpecs: {
      r1: { status: 'registering', occupants: ['u1', 'u2'] },
      r2: { status: 'registering', occupants: [] }
    }
  });
  var m2 = freeze(h.matches.m2);
  var res = h.svc.removePlayerByAdminWithStationCleanup(adminArgs(h));
  assert('已分组无成绩成功', res.ok === true && res.grouped === true);
  assert('已分组只写受影响站', res.affectedRoundIds.join(',') === 'r1' && h.saveLog.join(',') === 'm1');
  assert('已分组清 u1 留 u2', occupiedIds(h.matches.m1.groups[0].players).join(',') === 'u2');
  assert('无关站未写', stable(h.matches.m2) === stable(m2));
})();

(function () {
  var h = createHarness({
    matchSpecs: {
      r1: {
        status: 'ongoing',
        occupants: ['u1', 'u2'],
        scoreData: { g1: { scoresByPlayer: { u1: { scores: [4, null, 5] }, u2: { scores: [] } } } }
      },
      r2: { status: 'registering', occupants: [] }
    }
  });
  var insp = h.svc.inspectAdminPlayerRemovalImpact(adminArgs(h));
  var res = h.svc.removePlayerByAdminWithStationCleanup(adminArgs(h));
  assert('LIVE inspect 可删除', insp.ok === true && !insp.blockedReason);
  assert('LIVE 有成绩成功', res.ok === true && res.grouped === true && h.saveLog.join(',') === 'm1');
  assert('LIVE 结构已清', occupiedIds(h.matches.m1.groups[0].players).join(',') === 'u2');
  assert('LIVE 成绩已清', !h.matches.m1.scoreData.g1.scoresByPlayer.u1);
  assert('LIVE roster 已取消', rosterStatus(h, 'u1') === 'cancelled' && rosterStatus(h, 'u2') === 'registered');
})();

(function () {
  var h = createHarness({
    matchSpecs: {
      r1: {
        status: 'completed',
        occupants: ['u1', 'u2'],
        scoreData: { g1: { scoresByPlayer: { u1: { scores: [4, 5, 4] } } } }
      },
      r2: { status: 'registering', occupants: [] }
    }
  });
  var beforeS = freeze(h.seriesBag[h.series.seriesId]);
  var beforeM = freeze(h.matches);
  var insp = h.svc.inspectAdminPlayerRemovalImpact(adminArgs(h));
  var res = h.svc.removePlayerByAdminWithStationCleanup(adminArgs(h));
  assert('finalized inspect', insp.ok === false && insp.blockedReason === 'finalized_score');
  assert('finalized 拒绝', res.ok === false && res.reason === 'finalized_score');
  assert(
    'finalized 零写入',
    stable(h.seriesBag[h.series.seriesId]) === stable(beforeS) &&
      stable(h.matches) === stable(beforeM) &&
      h.saveLog.length === 0 &&
      journalOf(h) == null
  );
})();

(function () {
  var h = createHarness({
    matchSpecs: {
      r1: { status: 'registering', occupants: ['u1', 'u2'] },
      r2: { status: 'registering', occupants: [] }
    },
    breakTokenRound: 'r1'
  });
  var beforeS = freeze(h.seriesBag[h.series.seriesId]);
  var beforeM = freeze(h.matches);
  var res = h.svc.removePlayerByAdminWithStationCleanup(adminArgs(h));
  assert('managed 异常拒绝', res.ok === false && res.reason === 'managed_station_invalid');
  assert(
    'managed 零写入',
    stable(h.seriesBag[h.series.seriesId]) === stable(beforeS) &&
      stable(h.matches) === stable(beforeM) &&
      journalOf(h) == null
  );
})();

(function () {
  var h = createHarness();
  var before = freeze(h.seriesBag[h.series.seriesId]);
  var mismatch = h.svc.removePlayerByAdminWithStationCleanup(
    adminArgs(h, { playerId: 'u1', rosterEntryId: 're-u2' })
  );
  assert(
    'rosterEntryId/playerId 不匹配',
    mismatch.ok === false && mismatch.reason === 'player_id_mismatch'
  );
  var gone = h.svc.removePlayerByAdminWithStationCleanup(
    adminArgs(h, { playerId: 'no-such', rosterEntryId: 're-missing' })
  );
  assert(
    '不存在目标',
    gone.ok === false && gone.reason === 'roster_entry_not_found'
  );
  h.seriesBag[h.series.seriesId].roster[0].registrationStatus = 'cancelled';
  var cancelled = h.svc.removePlayerByAdminWithStationCleanup(adminArgs(h));
  assert(
    '已取消目标',
    cancelled.ok === false && cancelled.reason === 'not_registered'
  );
  assert(
    '定位失败零写入',
    h.saveLog.length === 0 &&
      h.seriesBag[h.series.seriesId].registrationRevision === before.registrationRevision
  );
})();

(function () {
  var h = createHarness({
    matchSpecs: { r1: { occupants: ['u1', 'u2'] } }
  });
  var beforeS = freeze(h.seriesBag[h.series.seriesId]);
  var res = h.svc.removePlayerByAdminWithStationCleanup(
    adminArgs(h, { expectedRegistrationRevision: 1 })
  );
  assert('revision 冲突', res.ok === false && res.reason === 'registration_conflict');
  assert('revision 冲突零写入', stable(h.seriesBag[h.series.seriesId]) === stable(beforeS) && h.saveLog.length === 0);
})();

(function () {
  var h = createHarness({
    matchSpecs: {
      r1: { status: 'registering', occupants: ['u1', 'u2'] },
      r2: { status: 'registering', occupants: [] }
    }
  });
  var insp = h.svc.inspectAdminPlayerRemovalImpact(adminArgs(h));
  assert('inspect 先通过', insp.ok === true);
  h.matches.m1.status = 'finished';
  h.matches.m1.scoreData = { g1: { scoresByPlayer: { u1: { scores: [4, 5] } } } };
  var beforeS = freeze(h.seriesBag[h.series.seriesId]);
  var beforeM = freeze(h.matches);
  var res = h.svc.removePlayerByAdminWithStationCleanup(adminArgs(h));
  assert('inspect 后写前变 finalized', res.ok === false && res.reason === 'finalized_score');
  assert(
    '写前 finalized 零写入',
    stable(h.seriesBag[h.series.seriesId]) === stable(beforeS) &&
      stable(h.matches) === stable(beforeM) &&
      h.saveLog.length === 0
  );
})();

(function () {
  var allowed = true;
  var h = createHarness({
    privilege: function () {
      return allowed;
    }
  });
  var insp = h.svc.inspectAdminPlayerRemovalImpact(adminArgs(h, { actorUserId: 'admin-2' }));
  assert('权限撤销前 inspect 通过', insp.ok === true);
  allowed = false;
  var beforeS = freeze(h.seriesBag[h.series.seriesId]);
  var res = h.svc.removePlayerByAdminWithStationCleanup(adminArgs(h, { actorUserId: 'admin-2' }));
  assert('inspect 后权限被撤销', res.ok === false && res.reason === 'permission_denied');
  assert(
    '权限撤销零写入',
    stable(h.seriesBag[h.series.seriesId]) === stable(beforeS) && h.saveLog.length === 0
  );
})();

(function () {
  var h = createHarness({
    matchSpecs: {
      r1: { occupants: ['u1', 'u2'] },
      r2: { occupants: ['u1'] }
    },
    failMatchWriteAt: 1
  });
  var beforeS = freeze(h.seriesBag[h.series.seriesId]);
  var beforeM = freeze(h.matches);
  var res = h.svc.removePlayerByAdminWithStationCleanup(adminArgs(h));
  assert('match 写失败', res.ok === false && res.reason === 'storage_failed');
  assert(
    'match 失败回滚',
    stable(h.seriesBag[h.series.seriesId]) === stable(beforeS) &&
      stable(h.matches) === stable(beforeM) &&
      journalOf(h) == null
  );
})();

(function () {
  var h = createHarness({
    matchSpecs: { r1: { occupants: ['u1', 'u2'] } },
    failAdminCancel: true
  });
  var beforeS = freeze(h.seriesBag[h.series.seriesId]);
  var beforeM = freeze(h.matches);
  var res = h.svc.removePlayerByAdminWithStationCleanup(adminArgs(h));
  assert('roster 写失败', res.ok === false && res.reason === 'storage_failed');
  assert('roster 失败 matches 回滚', stable(h.matches) === stable(beforeM));
  assert(
    'roster 失败 series 未写',
    stable(h.seriesBag[h.series.seriesId]) === stable(beforeS) &&
      rosterStatus(h, 'u1') === 'registered' &&
      journalOf(h) == null
  );
})();

(function () {
  var h = createHarness({
    matchSpecs: { r1: { occupants: ['u1', 'u2'] } },
    corruptAfterSeriesWrite: true
  });
  var beforeM = freeze(h.matches);
  var res = h.svc.removePlayerByAdminWithStationCleanup(adminArgs(h));
  assert(
    '核验失败',
    res.ok === false && (res.reason === 'verify_failed' || res.reason === 'storage_failed')
  );
  assert('核验失败 matches 回滚', stable(h.matches) === stable(beforeM));
  assert('核验失败 roster 回滚', rosterStatus(h, 'u1') === 'registered');
  assert('核验失败 revision 回滚', h.seriesBag[h.series.seriesId].registrationRevision === 3);
  assert('核验失败 journal 已清', journalOf(h) == null);
})();

(function () {
  var h = createHarness({ matchSpecs: { r1: { occupants: ['u1', 'u2'] } } });
  var before = freeze(h.matches.m1);
  h.storage.setItem(orchMod.JOURNAL_KEY, {
    operationId: 'ssc_plant',
    seriesId: h.series.seriesId,
    playerId: 'u1',
    actorUserId: 'creator-1',
    expectedRegistrationRevision: 3,
    phase: 'matches_written',
    seriesBefore: freeze(h.seriesBag[h.series.seriesId]),
    matchesBefore: [freeze(h.matches.m1)],
    affectedRoundIds: ['r1'],
    createdAt: 1700000000100
  });
  h.matches.m1 = freeze(p3a.removePlayerFromMatchCompetitionStructure(h.matches.m1, 'u1').match);
  var rec = h.svc.recoverInterruptedSelfCancellation();
  assert('journal 恢复成功', rec.ok === true);
  assert('journal 恢复 match', stable(h.matches.m1) === stable(before));
  assert('恢复后无 journal', journalOf(h) == null);
  var idle = h.svc.recoverInterruptedSelfCancellation();
  assert('再次恢复幂等', idle.ok === true && idle.reason === 'idle');
})();

(function () {
  var h = createHarness();
  var selfInsp = h.svc.inspectSelfCancellationImpact({
    seriesId: h.series.seriesId,
    playerId: 'u1',
    actorUserId: 'u1'
  });
  var proxyInsp = h.svc.inspectProxyCancellationImpact({
    seriesId: h.series.seriesId,
    playerId: 'u2',
    rosterEntryId: 're-u2',
    actorUserId: 'op1'
  });
  var batchInsp = h.svc.inspectProxyCancellationBatchImpact({
    seriesId: h.series.seriesId,
    actorUserId: 'op1',
    removals: [{ rosterEntryId: 're-u2', playerId: 'u2' }]
  });
  var hProxy = createHarness();
  var proxyCancel = hProxy.svc.cancelProxyRegistrationWithStationCleanup({
    seriesId: hProxy.series.seriesId,
    playerId: 'u2',
    rosterEntryId: 're-u2',
    actorUserId: 'op1',
    expectedRegistrationRevision: 3
  });
  var hBatch = createHarness();
  var batch = hBatch.svc.applyProxyCommitPlanWithStationCleanup({
    seriesId: hBatch.series.seriesId,
    expectedRegistrationRevision: 3,
    actorUserId: 'op1',
    actor: { userId: 'op1', playerId: 'op1' },
    seriesParticipantId: 'team:1',
    removals: [{ rosterEntryId: 're-u2', playerId: 'u2' }],
    additions: []
  });
  assert(
    'self/proxy/B2 批量链路不回归',
    selfInsp.ok === true &&
      proxyInsp.ok === true &&
      batchInsp.ok === true &&
      proxyCancel.ok === true &&
      rosterStatus(hProxy, 'u2') === 'cancelled' &&
      rosterStatus(hProxy, 'u1') === 'registered' &&
      batch.ok === true &&
      rosterStatus(hBatch, 'u2') === 'cancelled' &&
      rosterStatus(h, 'u1') === 'registered' &&
      rosterStatus(h, 'u2') === 'registered'
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
