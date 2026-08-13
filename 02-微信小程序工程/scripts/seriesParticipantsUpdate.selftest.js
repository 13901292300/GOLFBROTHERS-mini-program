/**
 * Patch E2 窄修：Published Series 主办/参赛主体更新自测
 * 运行：node scripts/seriesParticipantsUpdate.selftest.js
 */

var path = require('path');
var fs = require('fs');

var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');
var createPageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'create',
  'pages',
  'series'
);

var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var seriesParticipantsUpdate = require(path.join(utilsDir, 'seriesParticipantsUpdate.js'));

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

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function createMemoryStorage() {
  var bag = Object.create(null);
  return {
    getItem: function (key) {
      return { ok: true, value: bag[key] != null ? deepClone(bag[key]) : null };
    },
    setItem: function (key, value) {
      bag[key] = deepClone(value);
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
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: '参赛主体系列',
    createdBy: 'admin-1',
    organization: {
      organizationId: 'org-1',
      organizationName: '原机构',
      organizationLogo: 'logo-org-1.png'
    }
  });
  s.lifecycleStatus = 'published';
  s.publishToken = 'tok-e2p';
  s.updatedAt = '2026-08-01T00:00:00.000Z';
  s.visibility = 'public';
  s.participants = [
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't1',
      seriesParticipantId: 'team:t1',
      nameSnapshot: '甲队'
    }),
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't2',
      seriesParticipantId: 'team:t2',
      nameSnapshot: '乙队'
    })
  ];
  s.scoringRule = seriesModel.createDefaultScoringRule({
    mode: 'per_round_n',
    scoreBasis: 'gross',
    allowRepeat: false
  });
  s.rounds = (s.rounds || []).slice(0, 2).map(function (r, idx) {
    var next = Object.assign({}, r);
    next.roundId = 'r' + (idx + 1);
    next.index = idx + 1;
    next.name = '第' + (idx + 1) + '轮';
    next.dateTime = '2030-06-0' + (idx + 1) + ' 08:00';
    next.gameMode = '个人比杆赛';
    next.courseId = 'c' + (idx + 1);
    next.courseName = '球场' + (idx + 1);
    next.fee = '100';
    next.topN = 3;
    next.matchId = 'm' + (idx + 1);
    return next;
  });
  s.roster = [];
  if (overrides) Object.assign(s, overrides);
  return s;
}

function makeCleanMatch(series, round) {
  var built = seriesStationMatch.buildMatchFromSeriesRound(series, round, {
    matchId: round.matchId,
    publishToken: series.publishToken
  });
  if (!built.ok) throw new Error(built.reason);
  var m = built.match;
  m.createdBy = 'admin-1';
  m.status = 'registering';
  m.groups = [];
  m.pairings = {};
  m.scoreData = {};
  m.registerInfo = { totalCount: 0, users: [] };
  m.tempAdmins = [];
  return m;
}

function createHarness(opts) {
  var o = opts || {};
  var series = o.series || makeSeries();
  var matches = Object.create(null);
  series.rounds.forEach(function (r) {
    matches[r.matchId] = o.makeMatch
      ? o.makeMatch(series, r)
      : makeCleanMatch(series, r);
  });
  if (o.mutateMatches) o.mutateMatches(matches, series);
  var seriesBag = Object.create(null);
  seriesBag[series.seriesId] = deepClone(series);
  var index = Object.create(null);
  series.rounds.forEach(function (r) {
    index[r.matchId] = {
      seriesId: series.seriesId,
      roundId: r.roundId,
      matchId: r.matchId
    };
  });
  var storage = createMemoryStorage();
  var svc = seriesParticipantsUpdate.createSeriesParticipantsUpdateService({
    seriesStore: {
      getSeriesById: function (id) {
        return seriesBag[id] ? deepClone(seriesBag[id]) : null;
      },
      upsertSeries: function (input) {
        if (o.failSeriesWrite) return { ok: false, reason: 'injected_series_fail' };
        seriesBag[input.seriesId] = deepClone(input);
        return { ok: true, series: deepClone(input) };
      }
    },
    teamMatchStore: {
      getMatchById: function (id) {
        return matches[id] ? deepClone(matches[id]) : null;
      },
      saveMatch: function (m) {
        if (o.failMatchWrite) throw new Error('injected_match_fail');
        if (o.failSecondMatch && m.matchId === 'm2') throw new Error('injected_m2');
        matches[m.matchId] = deepClone(m);
      }
    },
    storage: storage,
    getIndexByMatchId: function (id) {
      return index[id] ? deepClone(index[id]) : null;
    },
    now: function () {
      return 1700000000099;
    }
  });
  return {
    series: series,
    seriesBag: seriesBag,
    matches: matches,
    storage: storage,
    svc: svc,
    actor: { userId: 'admin-1' }
  };
}

(function testLocksClean() {
  var h = createHarness();
  var locks = h.svc.resolveParticipantsEditLocks(
    h.seriesBag[h.series.seriesId],
    [h.matches.m1, h.matches.m2]
  );
  assert('未开始无业务数据可编辑', locks.editable === true && !locks.reason);
  assert('hostMode 始终锁定', locks.hostModeLocked === true);
})();

(function testLocksWithGroups() {
  var h = createHarness({
    mutateMatches: function (matches) {
      matches.m1.groups = [{ players: [{ userId: 'u1' }] }];
    }
  });
  var locks = h.svc.resolveParticipantsEditLocks(h.series, [h.matches.m1, h.matches.m2]);
  assert('有分组则锁定', !locks.editable && locks.reason === seriesParticipantsUpdate.STRUCTURE_BUSY_MSG);
})();

(function testLocksWithScores() {
  var h = createHarness({
    mutateMatches: function (matches) {
      matches.m2.scoreData = { hole1: 4 };
    }
  });
  var locks = h.svc.resolveParticipantsEditLocks(h.series, [h.matches.m1, h.matches.m2]);
  assert('有成绩则锁定', !locks.editable);
})();

(function testLocksWithTeamGroupPlayers() {
  var h = createHarness({
    mutateMatches: function (matches) {
      matches.m1.teamGroups = [
        { id: 't1', name: '甲队', players: [{ userId: 'p9' }] },
        { id: 't2', name: '乙队', players: [] }
      ];
    }
  });
  assert(
    'teamGroups 真实分组锁定',
    !h.svc.resolveParticipantsEditLocks(h.series, [h.matches.m1, h.matches.m2]).editable
  );
})();

(function testHappyPathHostAndAddTeam() {
  var h = createHarness();
  var beforeToken = h.series.publishToken;
  var beforeCreated = h.series.createdBy;
  var beforeRounds = deepClone(h.series.rounds);
  var beforeRoster = deepClone(h.series.roster);
  var beforeFee = deepClone(h.matches.m1.feeList);
  var beforeGameMode = h.matches.m1.gameMode;
  var beforeGroups = deepClone(h.matches.m1.groups);
  var beforeCtx = deepClone(h.matches.m1.seriesContext);

  var res = h.svc.updatePublishedSeriesParticipants({
    seriesId: h.series.seriesId,
    hostPatch: {
      organization: {
        organizationId: 'org-2',
        organizationName: '新机构',
        organizationLogo: 'logo-org-2.png'
      }
    },
    participants: [
      seriesModel.createParticipant({
        kind: 'team',
        sourceTeamId: 't1',
        seriesParticipantId: 'team:t1',
        nameSnapshot: '甲队'
      }),
      seriesModel.createParticipant({
        kind: 'team',
        sourceTeamId: 't2',
        seriesParticipantId: 'team:t2',
        nameSnapshot: '乙队'
      }),
      seriesModel.createParticipant({
        kind: 'team',
        sourceTeamId: 't3',
        seriesParticipantId: 'team:t3',
        nameSnapshot: '丙队'
      })
    ],
    actor: h.actor,
    expectedUpdatedAt: h.series.updatedAt
  });
  assert('可改主办并增加参赛球队', res.ok === true, res.reason);
  var after = h.seriesBag[h.series.seriesId];
  assert(
    'Series 主办与 participants 更新',
    after.organization.organizationId === 'org-2' &&
      after.participants.length === 3 &&
      after.participants[2].seriesParticipantId === 'team:t3'
  );
  assert(
    '身份字段不变',
    after.seriesId === h.series.seriesId &&
      after.publishToken === beforeToken &&
      after.createdBy === beforeCreated &&
      JSON.stringify(after.rounds) === JSON.stringify(beforeRounds) &&
      JSON.stringify(after.roster) === JSON.stringify(beforeRoster)
  );
  assert(
    '分站主办快照同步',
    h.matches.m1.organizationId === 'org-2' &&
      h.matches.m1.organizationName === '新机构' &&
      h.matches.m2.organizationId === 'org-2' &&
      h.matches.m1.teamGroups.length === 3 &&
      h.matches.m1.teamGroups[2].id === 't3'
  );
  assert(
    '分站运行态保护',
    JSON.stringify(h.matches.m1.feeList) === JSON.stringify(beforeFee) &&
      h.matches.m1.gameMode === beforeGameMode &&
      JSON.stringify(h.matches.m1.groups) === JSON.stringify(beforeGroups) &&
      h.matches.m1.matchId === 'm1' &&
      h.matches.m1.seriesContext.publishToken === beforeCtx.publishToken &&
      h.matches.m1.seriesContext.seriesId === beforeCtx.seriesId &&
      h.matches.m1.seriesContext.roundId === beforeCtx.roundId &&
      h.matches.m1.seriesContext.managed === true
  );
  assert('同步分站数=2', res.syncedMatchCount === 2);
})();

(function testStableParticipantId() {
  var h = createHarness();
  var res = h.svc.updatePublishedSeriesParticipants({
    seriesId: h.series.seriesId,
    participants: [
      seriesModel.createParticipant({
        kind: 'team',
        sourceTeamId: 't2',
        seriesParticipantId: 'team:t2',
        nameSnapshot: '乙队改名'
      }),
      seriesModel.createParticipant({
        kind: 'team',
        sourceTeamId: 't1',
        seriesParticipantId: 'team:t1',
        nameSnapshot: '甲队改名'
      })
    ],
    actor: h.actor
  });
  assert('同 sourceTeamId 保持 ID', res.ok && h.seriesBag[h.series.seriesId].participants[0].seriesParticipantId === 'team:t2' && h.seriesBag[h.series.seriesId].participants[1].seriesParticipantId === 'team:t1');
})();

(function testDeleteWithoutRoster() {
  var h = createHarness({
    series: makeSeries({
      participants: [
        seriesModel.createParticipant({
          kind: 'team',
          sourceTeamId: 't1',
          seriesParticipantId: 'team:t1',
          nameSnapshot: '甲队'
        }),
        seriesModel.createParticipant({
          kind: 'team',
          sourceTeamId: 't2',
          seriesParticipantId: 'team:t2',
          nameSnapshot: '乙队'
        }),
        seriesModel.createParticipant({
          kind: 'team',
          sourceTeamId: 't3',
          seriesParticipantId: 'team:t3',
          nameSnapshot: '丙队'
        })
      ]
    })
  });
  var res = h.svc.updatePublishedSeriesParticipants({
    seriesId: h.series.seriesId,
    participants: [
      seriesModel.createParticipant({
        kind: 'team',
        sourceTeamId: 't1',
        seriesParticipantId: 'team:t1',
        nameSnapshot: '甲队'
      }),
      seriesModel.createParticipant({
        kind: 'team',
        sourceTeamId: 't2',
        seriesParticipantId: 'team:t2',
        nameSnapshot: '乙队'
      })
    ],
    actor: h.actor
  });
  assert('无报名可删除参赛主体', res.ok && h.seriesBag[h.series.seriesId].participants.length === 2);
})();

(function testDeleteWithActiveRosterBlocked() {
  var h = createHarness({
    series: makeSeries({
      roster: [
        {
          userId: 'u1',
          seriesParticipantId: 'team:t2',
          registrationStatus: 'registered'
        }
      ]
    })
  });
  var before = deepClone(h.seriesBag[h.series.seriesId].participants);
  var res = h.svc.updatePublishedSeriesParticipants({
    seriesId: h.series.seriesId,
    participants: [
      seriesModel.createParticipant({
        kind: 'team',
        sourceTeamId: 't1',
        seriesParticipantId: 'team:t1',
        nameSnapshot: '甲队'
      }),
      seriesModel.createParticipant({
        kind: 'team',
        sourceTeamId: 't3',
        seriesParticipantId: 'team:t3',
        nameSnapshot: '丙队'
      })
    ],
    actor: h.actor
  });
  assert(
    '有 active roster 阻止删除',
    !res.ok &&
      res.reason === 'roster_block' &&
      res.message === seriesParticipantsUpdate.ROSTER_BLOCK_MSG &&
      JSON.stringify(h.seriesBag[h.series.seriesId].participants) === JSON.stringify(before) &&
      JSON.stringify(h.seriesBag[h.series.seriesId].roster) ===
        JSON.stringify(h.series.roster)
  );
})();

(function testStructureBusyBlocked() {
  var h = createHarness({
    mutateMatches: function (matches) {
      matches.m1.status = 'ongoing';
    }
  });
  var res = h.svc.updatePublishedSeriesParticipants({
    seriesId: h.series.seriesId,
    hostPatch: {
      organization: {
        organizationId: 'org-x',
        organizationName: 'X',
        organizationLogo: ''
      }
    },
    actor: h.actor
  });
  assert(
    '已开始阻止结构修改',
    !res.ok &&
      res.reason === 'structure_busy' &&
      h.seriesBag[h.series.seriesId].organization.organizationId === 'org-1'
  );
})();

(function testHostModeSwitchBlocked() {
  var h = createHarness();
  var validated = h.svc.validateParticipantsPatch(
    h.series,
    'team',
    h.series.organization,
    { teamId: 'ht1', teamName: '主办队' },
    [
      seriesModel.createParticipant({
        kind: 'division',
        divisionId: 'd1',
        seriesParticipantId: 'division:d1',
        nameSnapshot: 'A'
      }),
      seriesModel.createParticipant({
        kind: 'division',
        divisionId: 'd2',
        seriesParticipantId: 'division:d2',
        nameSnapshot: 'B'
      })
    ]
  );
  assert(
    '跨 hostMode 校验拒绝',
    !validated.ok && validated.reason === 'host_mode_locked'
  );
})();

(function testMatchFailRollback() {
  var h = createHarness({ failSecondMatch: true });
  var beforeOrg = h.seriesBag[h.series.seriesId].organization.organizationId;
  var beforeM1Org = h.matches.m1.organizationId;
  var beforeTg = deepClone(h.matches.m1.teamGroups);
  var res = h.svc.updatePublishedSeriesParticipants({
    seriesId: h.series.seriesId,
    hostPatch: {
      organization: {
        organizationId: 'org-rollback',
        organizationName: '应回滚',
        organizationLogo: ''
      }
    },
    actor: h.actor
  });
  assert('第二站失败不成功', !res.ok && res.reason === 'match_write_failed');
  assert('Series 回滚', h.seriesBag[h.series.seriesId].organization.organizationId === beforeOrg);
  assert(
    '已写分站回滚',
    h.matches.m1.organizationId === beforeM1Org &&
      JSON.stringify(h.matches.m1.teamGroups) === JSON.stringify(beforeTg)
  );
  assert(
    'journal 清理',
    h.storage.getItem(seriesParticipantsUpdate.JOURNAL_KEY).value == null
  );
})();

(function testNoPublishPlanInModule() {
  var src = fs.readFileSync(path.join(utilsDir, 'seriesParticipantsUpdate.js'), 'utf8');
  assert(
    '编排不调用 publish/plan',
    src.indexOf('publishSeries') < 0 &&
      src.indexOf('planPublish') < 0 &&
      src.indexOf('buildMatchFromSeriesRound') < 0
  );
})();

(function testWizardWiring() {
  var wizardJs = fs.readFileSync(path.join(createPageDir, 'index.js'), 'utf8');
  var wizardWxml = fs.readFileSync(path.join(createPageDir, 'index.wxml'), 'utf8');
  assert(
    'edit_series 可打开选择器接线',
    wizardJs.indexOf('_assertParticipantsEditable') >= 0 &&
      wizardJs.indexOf('onSelectOrganization') >= 0 &&
      /onSelectOrganization\(\)[\s\S]{0,120}_assertParticipantsEditable/.test(wizardJs) &&
      /onSelectParticipants\(\)[\s\S]{0,120}_assertParticipantsEditable/.test(wizardJs) &&
      /onSelectHostTeam\(\)[\s\S]{0,120}_assertParticipantsEditable/.test(wizardJs)
  );
  assert(
    '保存走 participants 编排且不 publish',
    /_saveEditSeries:[\s\S]{0,3500}updatePublishedSeriesParticipants/.test(wizardJs) &&
      !/_saveEditSeries:[\s\S]{0,3500}publishSeries/.test(wizardJs) &&
      !/_saveEditSeries:[\s\S]{0,3500}planPublish/.test(wizardJs)
  );
  assert(
    '无旧「发布后不支持修改」主办提示',
    wizardWxml.indexOf('主办与参赛主体发布后锁定') < 0 &&
      wizardWxml.indexOf('participantsLockReason') >= 0 &&
      wizardWxml.indexOf('participantsEditable') >= 0
  );
  assert(
    'hostMode 仍锁定',
    wizardJs.indexOf('HOST_MODE_LOCKED_MSG') >= 0 &&
      /onSelectHostMode[\s\S]{0,200}HOST_MODE_LOCKED_MSG/.test(wizardJs)
  );
  assert(
    'roster 删除保护接线',
    wizardJs.indexOf('ROSTER_BLOCK_MSG') >= 0 &&
      wizardJs.indexOf('hasActiveRosterForParticipant') >= 0
  );
})();

console.log('');
console.log('---- seriesParticipantsUpdate.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
