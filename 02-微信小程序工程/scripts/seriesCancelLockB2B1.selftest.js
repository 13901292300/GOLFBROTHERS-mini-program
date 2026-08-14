/**
 * SERIES-CANCEL-LOCK-B2B1：原代报名人批量代取消（领域层）
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesCancelLockB2B1.selftest.js
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
var regSrc = fs.readFileSync(path.join(utilsDir, 'seriesRegistration.js'), 'utf8');
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

function proxyEntry(id, name) {
  return {
    rosterEntryId: 're-' + id,
    seriesId: 'series-lock-b2b1',
    seriesParticipantId: 'team:1',
    playerId: id,
    playerNameSnapshot: name,
    registrationStatus: 'registered',
    registrationSource: 'proxy',
    registeredByUserId: 'op1'
  };
}

function makeSeries(overrides) {
  var raw = Object.assign(
    {
      seriesId: 'series-lock-b2b1',
      lifecycleStatus: 'published',
      publishState: 'published',
      publishToken: 'tok-lock-b2b1',
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
          seriesId: 'series-lock-b2b1',
          seriesParticipantId: 'team:1',
          playerId: 'u1',
          playerNameSnapshot: '本人',
          registrationStatus: 'registered',
          registrationSource: 'self',
          registeredByUserId: 'u1'
        },
        proxyEntry('u2', '代报A'),
        proxyEntry('u3', '代报B')
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
  var occupants = Object.prototype.hasOwnProperty.call(s, 'occupants') ? s.occupants || [] : [];
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
      paymentByUserId: { u2: { paid: true } },
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
    index[r.matchId] = { seriesId: series.seriesId, roundId: r.roundId, matchId: r.matchId };
  });
  if (o.breakTokenRound) {
    var bt = series.rounds.filter(function (r) {
      return r.roundId === o.breakTokenRound;
    })[0];
    if (bt && matches[bt.matchId]) matches[bt.matchId].seriesContext.publishToken = 'tok-wrong';
  }

  var storage = createMemoryStorage();
  var saveLog = [];
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
    canRegisterForOther: function (ctx) {
      var actor = (ctx && ctx.actor) || {};
      var uid = String(actor.userId || actor.playerId || '').trim();
      return { allowed: uid !== 'stranger' };
    },
    now: function () {
      return '2026-08-14T03:00:00.000Z';
    }
  });

  var applyPlan = function (input) {
    var res = realReg.applyProxyCommitPlan(input);
    if (res && res.ok && o.corruptAfterSeriesWrite) {
      if (matches.m1 && matches.m1.groups && matches.m1.groups[0]) {
        matches.m1.groups[0].players = emptySlots(['u1', 'u2']);
      }
    }
    return res;
  };

  var svc = orchMod.createSeriesSelfCancellationOrchestrator({
    seriesStore: seriesStore,
    teamMatchStore: teamMatchStore,
    storage: storage,
    getIndexByMatchId: function (id) {
      return index[id] ? freeze(index[id]) : null;
    },
    removePlayerFromMatchCompetitionStructure: p3a.removePlayerFromMatchCompetitionStructure,
    registrationService: realReg,
    applyProxyCommitPlan: o.failProxyPlan
      ? function () {
          return { ok: false, reason: 'storage_write_failed' };
        }
      : applyPlan,
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
    saveLog: saveLog
  };
}

function planArgs(h, extra) {
  return Object.assign(
    {
      seriesId: h.series.seriesId,
      expectedRegistrationRevision: h.series.registrationRevision,
      actorUserId: 'op1',
      actor: { userId: 'op1', playerId: 'op1' },
      seriesParticipantId: 'team:1',
      removals: [{ rosterEntryId: 're-u2', playerId: 'u2' }],
      additions: []
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
  '批量领域入口存在；预演复用 registration service 权限；页面不走 batch inspect',
  orchSrc.indexOf('inspectProxyCancellationBatchImpact') >= 0 &&
    orchSrc.indexOf('applyProxyCommitPlanWithStationCleanup') >= 0 &&
    orchSrc.indexOf('buildMergedStationPlan') >= 0 &&
    orchSrc.indexOf('registrationService.previewProxyCommitPlan') >= 0 &&
    orchSrc.indexOf('previewSvc') < 0 &&
    regSrc.indexOf('previewProxyCommitPlan') >= 0 &&
    pageJs.indexOf('inspectProxyCancellationBatchImpact') < 0
);

// 1. 单个 removal
(function () {
  var h = createHarness();
  var res = h.svc.applyProxyCommitPlanWithStationCleanup(planArgs(h));
  assert('1 单个 removal 成功', res.ok === true && res.idempotent !== true);
  assert('1 只取消 u2', rosterStatus(h, 'u2') === 'cancelled' && rosterStatus(h, 'u1') === 'registered');
  assert('1 revision +1', res.registrationRevision === 4);
  assert('1 无 match 写 / 无 journal', h.saveLog.length === 0 && journalOf(h) == null);
})();

// 2. 同一 match 多名 removal 只写一次
(function () {
  var h = createHarness({
    matchSpecs: {
      r1: { occupants: ['u1', 'u2', 'u3'] },
      r2: { occupants: [] }
    }
  });
  var res = h.svc.applyProxyCommitPlanWithStationCleanup(
    planArgs(h, {
      removals: [
        { rosterEntryId: 're-u2', playerId: 'u2' },
        { rosterEntryId: 're-u3', playerId: 'u3' }
      ]
    })
  );
  assert('2 多名同站成功', res.ok === true && res.affectedRoundIds.join(',') === 'r1');
  assert('2 同一 match 只写一次', h.saveLog.join(',') === 'm1');
  assert('2 清 u2/u3 留 u1', occupiedIds(h.matches.m1.groups[0].players).join(',') === 'u1');
  assert('2 两人 cancelled / revision +1', rosterStatus(h, 'u2') === 'cancelled' && rosterStatus(h, 'u3') === 'cancelled' && res.registrationRevision === 4);
})();

// 3. 跨 match
(function () {
  var h = createHarness({
    matchSpecs: {
      r1: { occupants: ['u1', 'u2'] },
      r2: { occupants: ['u3'] }
    }
  });
  var res = h.svc.applyProxyCommitPlanWithStationCleanup(
    planArgs(h, {
      removals: [
        { rosterEntryId: 're-u2', playerId: 'u2' },
        { rosterEntryId: 're-u3', playerId: 'u3' }
      ]
    })
  );
  assert('3 跨 match 成功', res.ok && res.affectedRoundIds.join(',') === 'r1,r2');
  assert('3 两站各写一次', h.saveLog.join(',') === 'm1,m2');
  assert('3 各站清目标', occupiedIds(h.matches.m1.groups[0].players).join(',') === 'u1' && occupiedIds(h.matches.m2.groups[0].players).join(',') === '');
})();

// 4. removal + addition 混合，revision 只 +1
(function () {
  var h = createHarness({
    matchSpecs: { r1: { occupants: ['u1', 'u2'] } }
  });
  var res = h.svc.applyProxyCommitPlanWithStationCleanup(
    planArgs(h, {
      additions: [{ playerId: 'u4', userId: 'u4', name: '新代报' }]
    })
  );
  assert('4 混合成功', res.ok === true && res.addedCount === 1 && res.removedCount === 1);
  assert('4 revision 只 +1', res.registrationRevision === 4);
  assert('4 u2 取消 u4 已报名', rosterStatus(h, 'u2') === 'cancelled' && rosterStatus(h, 'u4') === 'registered');
  assert('4 journal 已清', journalOf(h) == null);
})();

(function () {
  var h = createHarness();
  var beforeS = freeze(h.seriesBag[h.series.seriesId]);
  var beforeM = freeze(h.matches);
  var res = h.svc.applyProxyCommitPlanWithStationCleanup(
    planArgs(h, {
      removals: [],
      additions: [{ playerId: 'u4', userId: 'u4', name: '新代报' }]
    })
  );
  assert(
    '4b 有权限 additions-only 成功',
    res.ok === true && res.addedCount === 1 && res.removedCount === 0
  );
  assert('4b revision +1', res.registrationRevision === 4);
  assert('4b 无 match 写', h.saveLog.length === 0 && journalOf(h) == null);
  assert('4b u4 已报名 u2 仍在', rosterStatus(h, 'u4') === 'registered' && rosterStatus(h, 'u2') === 'registered');
  assert(
    '4b 预演未改无关 match',
    JSON.stringify(h.matches) === JSON.stringify(beforeM)
  );
  assert(
    '4b 正式写入后 revision 仅一次',
    h.seriesBag[h.series.seriesId].registrationRevision === 4 &&
      JSON.stringify(beforeS.registrationRevision) === JSON.stringify(3)
  );
})();

(function () {
  var h = createHarness();
  var beforeS = freeze(h.seriesBag[h.series.seriesId]);
  var beforeM = freeze(h.matches);
  var res = h.svc.applyProxyCommitPlanWithStationCleanup(
    planArgs(h, {
      removals: [],
      additions: [{ playerId: 'u4', userId: 'u4', name: '新代报' }],
      actorUserId: 'stranger',
      actor: { userId: 'stranger', playerId: 'stranger' }
    })
  );
  assert(
    '4c 无权限 actor 仍 permission_denied',
    res.ok === false && res.reason === 'permission_denied'
  );
  assert(
    '4c 零写入',
    JSON.stringify(h.seriesBag[h.series.seriesId]) === JSON.stringify(beforeS) &&
      JSON.stringify(h.matches) === JSON.stringify(beforeM) &&
      h.saveLog.length === 0 &&
      journalOf(h) == null
  );
})();

// 5. LIVE 多人完整清理
(function () {
  var h = createHarness({
    matchSpecs: {
      r1: {
        status: 'ongoing',
        occupants: ['u1', 'u2', 'u3'],
        scoreData: {
          g1: {
            scoresByPlayer: {
              u2: { scores: [4, 5] },
              u3: { scores: [3, null, 4] }
            }
          }
        }
      }
    }
  });
  var insp = h.svc.inspectProxyCancellationBatchImpact(
    planArgs(h, {
      removals: [
        { rosterEntryId: 're-u2', playerId: 'u2' },
        { rosterEntryId: 're-u3', playerId: 'u3' }
      ]
    })
  );
  var res = h.svc.applyProxyCommitPlanWithStationCleanup(
    planArgs(h, {
      removals: [
        { rosterEntryId: 're-u2', playerId: 'u2' },
        { rosterEntryId: 're-u3', playerId: 'u3' }
      ]
    })
  );
  assert('5 inspect LIVE 可取消', insp.ok === true);
  assert('5 LIVE 批量成功', res.ok === true && h.saveLog.join(',') === 'm1');
  assert('5 结构只留 u1', occupiedIds(h.matches.m1.groups[0].players).join(',') === 'u1');
  assert(
    '5 LIVE 成绩已清',
    !h.matches.m1.scoreData.g1.scoresByPlayer.u2 && !h.matches.m1.scoreData.g1.scoresByPlayer.u3
  );
  assert('5 roster 已取消', rosterStatus(h, 'u2') === 'cancelled' && rosterStatus(h, 'u3') === 'cancelled');
})();

// 6. 任一 finalized 整批零写入
(function () {
  var h = createHarness({
    matchSpecs: {
      r1: {
        status: 'completed',
        occupants: ['u1', 'u2'],
        scoreData: { g1: { scoresByPlayer: { u2: { scores: [4, 5] } } } }
      },
      r2: { occupants: ['u3'] }
    }
  });
  var beforeS = freeze(h.seriesBag[h.series.seriesId]);
  var beforeM = freeze(h.matches);
  var res = h.svc.applyProxyCommitPlanWithStationCleanup(
    planArgs(h, {
      removals: [
        { rosterEntryId: 're-u2', playerId: 'u2' },
        { rosterEntryId: 're-u3', playerId: 'u3' }
      ]
    })
  );
  assert('6 finalized 整批拒绝', res.ok === false && res.reason === 'finalized_score');
  assert('6 零写入', stable(h.seriesBag[h.series.seriesId]) === stable(beforeS) && stable(h.matches) === stable(beforeM) && journalOf(h) == null);
})();

// 7. managed 异常整批零写入
(function () {
  var h = createHarness({
    matchSpecs: { r1: { occupants: ['u2'] } },
    breakTokenRound: 'r1'
  });
  var beforeS = freeze(h.seriesBag[h.series.seriesId]);
  var res = h.svc.applyProxyCommitPlanWithStationCleanup(planArgs(h));
  assert('7 managed 整批拒绝', res.ok === false && res.reason === 'managed_station_invalid');
  assert('7 零写入', stable(h.seriesBag[h.series.seriesId]) === stable(beforeS) && h.saveLog.length === 0);
})();

// 8. 非原代报名人整批零写入
(function () {
  var h = createHarness({ matchSpecs: { r1: { occupants: ['u2'] } } });
  var beforeS = freeze(h.seriesBag[h.series.seriesId]);
  var res = h.svc.applyProxyCommitPlanWithStationCleanup(planArgs(h, { actorUserId: 'other', actor: { userId: 'other', playerId: 'other' } }));
  assert('8 非原代报名人', res.ok === false && res.reason === 'not_registered_by_me');
  assert('8 零写入', stable(h.seriesBag[h.series.seriesId]) === stable(beforeS) && h.saveLog.length === 0);
})();

// 9. 重复 removal 去重
(function () {
  var h = createHarness({ matchSpecs: { r1: { occupants: ['u1', 'u2'] } } });
  var res = h.svc.applyProxyCommitPlanWithStationCleanup(
    planArgs(h, {
      removals: [
        { rosterEntryId: 're-u2', playerId: 'u2' },
        { rosterEntryId: 're-u2', playerId: 'u2' }
      ]
    })
  );
  assert('9 去重后成功', res.ok === true && res.removedCount === 1 && res.registrationRevision === 4);
  assert('9 只清一次 u2', occupiedIds(h.matches.m1.groups[0].players).join(',') === 'u1');
})();

// 10. rosterEntryId/playerId 不匹配
(function () {
  var h = createHarness();
  var beforeS = freeze(h.seriesBag[h.series.seriesId]);
  var res = h.svc.applyProxyCommitPlanWithStationCleanup(
    planArgs(h, { removals: [{ rosterEntryId: 're-u2', playerId: 'u3' }] })
  );
  assert('10 不匹配拒绝', res.ok === false && res.reason === 'player_id_mismatch');
  assert('10 零写入', stable(h.seriesBag[h.series.seriesId]) === stable(beforeS));
})();

// 11. revision 冲突
(function () {
  var h = createHarness({ matchSpecs: { r1: { occupants: ['u2'] } } });
  var beforeS = freeze(h.seriesBag[h.series.seriesId]);
  var res = h.svc.applyProxyCommitPlanWithStationCleanup(planArgs(h, { expectedRegistrationRevision: 1 }));
  assert('11 revision 冲突', res.ok === false && res.reason === 'registration_conflict');
  assert('11 零写入', stable(h.seriesBag[h.series.seriesId]) === stable(beforeS) && h.saveLog.length === 0);
})();

// 12. 写前变 finalized
(function () {
  var h = createHarness({ matchSpecs: { r1: { occupants: ['u1', 'u2'] } } });
  var insp = h.svc.inspectProxyCancellationBatchImpact(planArgs(h));
  assert('12 inspect 先通过', insp.ok === true);
  h.matches.m1.status = 'finished';
  h.matches.m1.scoreData = { g1: { scoresByPlayer: { u2: { scores: [4] } } } };
  var beforeS = freeze(h.seriesBag[h.series.seriesId]);
  var beforeM = freeze(h.matches);
  var res = h.svc.applyProxyCommitPlanWithStationCleanup(planArgs(h));
  assert('12 写前 finalized', res.ok === false && res.reason === 'finalized_score');
  assert('12 零写入', stable(h.seriesBag[h.series.seriesId]) === stable(beforeS) && stable(h.matches) === stable(beforeM) && journalOf(h) == null);
})();

// 13. match 中途失败回滚
(function () {
  var h = createHarness({
    matchSpecs: {
      r1: { occupants: ['u2'] },
      r2: { occupants: ['u3'] }
    },
    failMatchWriteAt: 1
  });
  var beforeS = freeze(h.seriesBag[h.series.seriesId]);
  var beforeM = freeze(h.matches);
  var res = h.svc.applyProxyCommitPlanWithStationCleanup(
    planArgs(h, {
      removals: [
        { rosterEntryId: 're-u2', playerId: 'u2' },
        { rosterEntryId: 're-u3', playerId: 'u3' }
      ]
    })
  );
  assert('13 match 失败', res.ok === false && res.reason === 'storage_failed');
  assert('13 回滚', stable(h.seriesBag[h.series.seriesId]) === stable(beforeS) && stable(h.matches) === stable(beforeM));
  assert('13 journal 已清', journalOf(h) == null);
})();

// 14. roster 批量提交失败回滚
(function () {
  var h = createHarness({
    matchSpecs: { r1: { occupants: ['u1', 'u2'] } },
    failProxyPlan: true
  });
  var beforeS = freeze(h.seriesBag[h.series.seriesId]);
  var beforeM = freeze(h.matches);
  var res = h.svc.applyProxyCommitPlanWithStationCleanup(planArgs(h));
  assert('14 roster 失败', res.ok === false && res.reason === 'storage_failed');
  assert('14 matches 回滚', stable(h.matches) === stable(beforeM));
  assert('14 series 未写', stable(h.seriesBag[h.series.seriesId]) === stable(beforeS) && rosterStatus(h, 'u2') === 'registered');
  assert('14 journal 已清', journalOf(h) == null);
})();

// 15. 写后核验失败回滚
(function () {
  var h = createHarness({
    matchSpecs: { r1: { occupants: ['u1', 'u2'] } },
    corruptAfterSeriesWrite: true
  });
  var beforeM = freeze(h.matches);
  var res = h.svc.applyProxyCommitPlanWithStationCleanup(planArgs(h));
  assert('15 核验失败', res.ok === false && (res.reason === 'verify_failed' || res.reason === 'storage_failed'));
  assert('15 matches 回滚', stable(h.matches) === stable(beforeM));
  assert('15 roster 回滚', rosterStatus(h, 'u2') === 'registered');
  assert('15 revision 回滚', h.seriesBag[h.series.seriesId].registrationRevision === 3);
  assert('15 journal 已清', journalOf(h) == null);
})();

// 16. journal 恢复与幂等
(function () {
  var h = createHarness({ matchSpecs: { r1: { occupants: ['u1', 'u2'] } } });
  var before = freeze(h.matches.m1);
  h.storage.setItem(orchMod.JOURNAL_KEY, {
    operationId: 'spc_plant',
    seriesId: h.series.seriesId,
    playerId: 'u2',
    actorUserId: 'op1',
    expectedRegistrationRevision: 3,
    phase: 'matches_written',
    seriesBefore: freeze(h.seriesBag[h.series.seriesId]),
    matchesBefore: [freeze(h.matches.m1)],
    affectedRoundIds: ['r1'],
    createdAt: 1700000000100
  });
  h.matches.m1 = freeze(p3a.removePlayerFromMatchCompetitionStructure(h.matches.m1, 'u2').match);
  var rec = h.svc.recoverInterruptedSelfCancellation();
  assert('16 恢复成功', rec.ok === true);
  assert('16 恢复 match', stable(h.matches.m1) === stable(before));
  assert('16 恢复后无 journal', journalOf(h) == null);
  var idle = h.svc.recoverInterruptedSelfCancellation();
  assert('16 再次恢复幂等', idle.ok === true && idle.reason === 'idle');
  var empty = h.svc.applyProxyCommitPlanWithStationCleanup(
    planArgs(h, { removals: [], additions: [] })
  );
  assert('16 空计划幂等不 bump', empty.ok === true && empty.idempotent === true && h.seriesBag[h.series.seriesId].registrationRevision === 3);
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
