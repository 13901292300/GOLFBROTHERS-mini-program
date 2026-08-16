/**
 * 系列赛不可重复上场：双向占用 + 保存二次校验
 * 运行：node scripts/seriesNoRepeatLineup.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var utilsDir = path.join(root, 'miniprogram', 'utils');
var pageDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);

var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var lineup = require(path.join(utilsDir, 'seriesNoRepeatLineup.js'));
var labels = require(path.join(utilsDir, 'seriesRoundDisplayLabels.js'));
var pickRoster = require(path.join(pageDir, 'seriesGroupPickRoster.js'));
var scheduleWrite = require(path.join(pageDir, 'seriesScheduleGroupWrite.js'));

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

function rosterEntry(playerId, seriesParticipantId, extras) {
  return Object.assign(
    {
      rosterEntryId: 're-' + playerId,
      playerId: playerId,
      userId: playerId,
      seriesParticipantId: seriesParticipantId,
      playerNameSnapshot: '球员' + playerId,
      registrationStatus: 'registered'
    },
    extras || {}
  );
}

function makeSeries(opts) {
  var o = opts || {};
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: o.hostMode || 'organization',
    templateId: o.hostMode === 'team' ? 'internal_team_series' : 'inter_team_series',
    seriesName: o.name || 'NoRepeatBidirect',
    createdBy: 'admin-1',
    organization: {
      organizationId: 'org-1',
      organizationName: '机构',
      organizationLogo: ''
    },
    team: { teamId: 'host-team', teamName: '主队', teamLogo: '' }
  });
  s.lifecycleStatus = 'published';
  s.publishToken = 'tok-nr-b';
  s.scoringRule = seriesModel.createDefaultScoringRule({
    mode: o.mode || 'per_round_n',
    globalM: o.globalM || 8,
    allowRepeat: o.allowRepeat === true
  });
  if (o.hostMode === 'team') {
    s.participants = [
      seriesModel.createParticipant({
        kind: 'division',
        divisionId: 'd1',
        seriesParticipantId: 'division:d1',
        nameSnapshot: '红队'
      }),
      seriesModel.createParticipant({
        kind: 'division',
        divisionId: 'd2',
        seriesParticipantId: 'division:d2',
        nameSnapshot: '蓝队'
      })
    ];
  } else {
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
  }
  var roundCount = o.roundCount || 2;
  var sameDay = !!o.sameDay;
  s.rounds = [];
  for (var n = 1; n <= roundCount; n++) {
    s.rounds.push(
      Object.assign({}, seriesModel.createBlankRound(n, null), {
        roundId: 'r' + n,
        index: n,
        name: '第' + n + '轮',
        dateTime: sameDay ? '2030-06-01 08:00' : '2030-06-0' + n + ' 08:00',
        gameMode: o.gameMode || '个人比杆赛',
        courseId: sameDay ? 'c' + n : 'c1',
        courseName: sameDay ? '球场' + n : '球场1',
        fee: '0',
        matchId: 'm-nr-b-' + n
      })
    );
  }
  s.roster = o.roster || [
    rosterEntry('p1', s.participants[0].seriesParticipantId, { playerNameSnapshot: '张三' }),
    rosterEntry('p2', s.participants[0].seriesParticipantId),
    rosterEntry('p3', s.participants[1].seriesParticipantId),
    rosterEntry('p-same-name-a', s.participants[0].seriesParticipantId, {
      playerNameSnapshot: '同名'
    }),
    rosterEntry('p-same-name-b', s.participants[1].seriesParticipantId, {
      playerNameSnapshot: '同名'
    })
  ];
  return s;
}

function makeMatch(series, roundId, groups, extra) {
  var round = null;
  (series.rounds || []).forEach(function (r) {
    if (String(r.roundId) === String(roundId)) round = r;
  });
  if (!round) throw new Error('round missing ' + roundId);
  var built = seriesStationMatch.buildMatchFromSeriesRound(series, round, {
    matchId: round.matchId,
    publishToken: series.publishToken
  });
  if (!built.ok) throw new Error(built.reason);
  var m = built.match;
  m.status = 'registering';
  m.registerInfo = { totalCount: 0, users: [] };
  m.groups = Array.isArray(groups) ? groups : [];
  if (extra && extra.pairings) m.pairings = extra.pairings;
  if (extra && extra.scoreEntities) m.scoreEntities = extra.scoreEntities;
  if (extra && extra.status) m.status = extra.status;
  return m;
}

function seat(userId, extras) {
  return Object.assign(
    {
      position: 1,
      userId: userId,
      playerId: userId,
      displayName: extras && extras.displayName ? extras.displayName : '球员' + userId
    },
    extras || {}
  );
}

function makeHarness(series, matches) {
  return {
    getMatchById: function (id) {
      return matches[id] || null;
    },
    getIndexByMatchId: function (id) {
      var m = matches[id];
      if (!m) return null;
      var ctx = m.seriesContext || {};
      return {
        seriesId: series.seriesId,
        roundId: ctx.roundId,
        matchId: id
      };
    }
  };
}

function lockInput(series, roundId, harness) {
  return {
    fromSeries: true,
    series: series,
    seriesId: series.seriesId,
    currentRoundId: roundId,
    getMatchById: harness.getMatchById,
    getIndexByMatchId: harness.getIndexByMatchId
  };
}

(function testC2ThenC1() {
  var series = makeSeries({ sameDay: true, roundCount: 2 });
  var matches = {
    'm-nr-b-1': makeMatch(series, 'r1', []),
    'm-nr-b-2': makeMatch(series, 'r2', [{ groupId: 'g1', players: [seat('p1', { displayName: '张三' })] }])
  };
  var harness = makeHarness(series, matches);
  var lock = lineup.collectOtherRoundOccupancy(lockInput(series, 'r1', harness));
  assert('C2 先分组后 C1 启用', lock.ok === true && lock.enabled === true);
  assert('C2 先分组后 C1 不能选同一人', !!lock.playerIds.p1);
  var merged = lineup.mergeNoRepeatLockFields({ userId: 'p1', isDisabled: false }, lock);
  assert('C1 候选提示走 Cx', merged.noRepeatHint === '已在 C2 上场');
  assert('占用 roundId 是 r2 不是 C2', lock.occupancy.p1.roundId === 'r2');
})();

(function testC1ThenC2() {
  var series = makeSeries({ sameDay: true, roundCount: 2 });
  var matches = {
    'm-nr-b-1': makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p1')] }]),
    'm-nr-b-2': makeMatch(series, 'r2', [])
  };
  var harness = makeHarness(series, matches);
  var lock = lineup.collectOtherRoundOccupancy(lockInput(series, 'r2', harness));
  assert('C1 先分组后 C2 不能选同一人', !!lock.playerIds.p1);
  var merged = lineup.mergeNoRepeatLockFields({ userId: 'p1' }, lock);
  assert('C2 候选提示 C1', merged.noRepeatHint === '已在 C1 上场');
})();

(function testR1R2() {
  var series = makeSeries({ roundCount: 2 });
  var matches = {
    'm-nr-b-1': makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p1')] }]),
    'm-nr-b-2': makeMatch(series, 'r2', [])
  };
  var harness = makeHarness(series, matches);
  var lockC2 = lineup.collectOtherRoundOccupancy(lockInput(series, 'r2', harness));
  var lockC1emptyR2 = lineup.collectOtherRoundOccupancy(lockInput(series, 'r1', harness));
  matches['m-nr-b-2'] = makeMatch(series, 'r2', [{ groupId: 'g1', players: [seat('p2')] }]);
  var lockR1afterR2 = lineup.collectOtherRoundOccupancy(lockInput(series, 'r1', harness));
  assert('R2 受 R1 约束', !!lockC2.playerIds.p1);
  assert('R1 编辑时不把本轮 p1 当冲突', !lockC1emptyR2.playerIds.p1);
  assert('R1 受后分组的 R2 约束', !!lockR1afterR2.playerIds.p2);
  assert('Rx 标签', lockC2.occupancy.p1.label === 'R1');
})();

(function testCurrentRoundEchoAndSave() {
  var series = makeSeries({ roundCount: 2 });
  var matches = {
    'm-nr-b-1': makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p1'), seat('p2')] }]),
    'm-nr-b-2': makeMatch(series, 'r2', [])
  };
  var harness = makeHarness(series, matches);
  var lock = lineup.collectOtherRoundOccupancy(lockInput(series, 'r1', harness));
  assert('当前轮原成员不在占用表', !lock.playerIds.p1 && !lock.playerIds.p2);
  var save = lineup.assertPlayersNotOccupied(['p1', 'p2'], lock);
  assert('当前轮原成员可保存', save.ok === true);
})();

(function testRemoveThenSelectable() {
  var series = makeSeries({ roundCount: 2 });
  var matches = {
    'm-nr-b-1': makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p1')] }]),
    'm-nr-b-2': makeMatch(series, 'r2', [])
  };
  var harness = makeHarness(series, matches);
  assert(
    '移除前另一轮不可选',
    !!lineup.collectOtherRoundOccupancy(lockInput(series, 'r2', harness)).playerIds.p1
  );
  matches['m-nr-b-1'].groups = [];
  assert(
    '从原轮移除后可选',
    !lineup.collectOtherRoundOccupancy(lockInput(series, 'r2', harness)).playerIds.p1
  );
})();

(function testCancelledDoesNotOccupy() {
  var series = makeSeries({ roundCount: 2 });
  series.rounds[0].roundStatus = 'cancelled';
  var matches = {
    'm-nr-b-1': makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p1')] }], {
      status: 'cancelled'
    }),
    'm-nr-b-2': makeMatch(series, 'r2', [])
  };
  var harness = makeHarness(series, matches);
  var lock = lineup.collectOtherRoundOccupancy(lockInput(series, 'r2', harness));
  assert('取消轮不占资格', lock.ok === true && !lock.playerIds.p1);
})();

(function testEmptyAndPlaceholder() {
  var series = makeSeries({ roundCount: 2 });
  var matches = {
    'm-nr-b-1': makeMatch(series, 'r1', [
      { groupId: 'empty', players: [] },
      { groupId: 'ph', players: [{ position: 1, userId: '', playerId: '' }] }
    ]),
    'm-nr-b-2': makeMatch(series, 'r2', [])
  };
  var harness = makeHarness(series, matches);
  var lock = lineup.collectOtherRoundOccupancy(lockInput(series, 'r2', harness));
  assert('空组/占位不占资格', Object.keys(lock.playerIds).length === 0);
})();

(function testG2MembersNotPairId() {
  var series = makeSeries({ roundCount: 2, gameMode: '四人四球赛' });
  var matches = {
    'm-nr-b-1': makeMatch(
      series,
      'r1',
      [
        {
          groupId: 'g1',
          players: [seat('p-first'), seat('p-second'), seat('p-third'), seat('p-fourth')]
        }
      ],
      {
        pairings: {
          g1: [{ id: 'pair-only-id', playerIds: ['p-first', 'p-second'] }]
        },
        scoreEntities: [
          { entityId: 'ent-1', memberUserIds: ['p-third', 'p-fourth'] }
        ]
      }
    ),
    'm-nr-b-2': makeMatch(series, 'r2', [])
  };
  var harness = makeHarness(series, matches);
  var lock = lineup.collectOtherRoundOccupancy(lockInput(series, 'r2', harness));
  assert('G2 第一成员占用', !!lock.playerIds['p-first']);
  assert('G2 第二成员占用，不能只认 Pair ID', !!lock.playerIds['p-second']);
  assert('Pair ID 本身不占用', !lock.playerIds['pair-only-id']);
  assert('G2/G4 entity 全体成员占用', !!(lock.playerIds['p-third'] && lock.playerIds['p-fourth']));
  var addSecond = lineup.shouldBlockNoRepeatAdd('p-second', lock);
  assert('任意成员再入新组合被拒', addSecond.blocked === true);
})();

(function testSameNameDifferentId() {
  var series = makeSeries({ roundCount: 2 });
  var matches = {
    'm-nr-b-1': makeMatch(series, 'r1', [
      { groupId: 'g1', players: [seat('p-same-name-a', { displayName: '同名' })] }
    ]),
    'm-nr-b-2': makeMatch(series, 'r2', [])
  };
  var harness = makeHarness(series, matches);
  var lock = lineup.collectOtherRoundOccupancy(lockInput(series, 'r2', harness));
  assert('同名不同 userId 不误判', !lock.playerIds['p-same-name-b'] && !!lock.playerIds['p-same-name-a']);
})();

(function testRenameSameId() {
  var series = makeSeries({ roundCount: 2 });
  var matches = {
    'm-nr-b-1': makeMatch(series, 'r1', [
      { groupId: 'g1', players: [seat('p1', { displayName: '新名字' })] }
    ]),
    'm-nr-b-2': makeMatch(series, 'r2', [])
  };
  var harness = makeHarness(series, matches);
  var lock = lineup.collectOtherRoundOccupancy(lockInput(series, 'r2', harness));
  assert('同 userId 改名仍识别', !!lock.playerIds.p1);
  var blocked = lineup.shouldBlockNoRepeatAdd('p1', lock);
  assert('改名后提示含冲突轮', /已在 R1 上场/.test(blocked.message));
})();

(function testDivisionBoundary() {
  var series = makeSeries({ hostMode: 'team', roundCount: 2 });
  var matches = {
    'm-nr-b-1': makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p1')] }]),
    'm-nr-b-2': makeMatch(series, 'r2', [])
  };
  var harness = makeHarness(series, matches);
  var proj = pickRoster.buildSeriesPickRegisterProjection(series);
  var d1 = proj.registerInfo.users.filter(function (u) {
    return u.seriesParticipantId === 'division:d1';
  });
  var d2 = proj.registerInfo.users.filter(function (u) {
    return u.seriesParticipantId === 'division:d2';
  });
  assert('分队候选不串队', d1.every(function (u) {
    return u.groupId === 'division:d1';
  }) && d2.every(function (u) {
    return u.groupId === 'division:d2';
  }));
  var lock = lineup.collectOtherRoundOccupancy(lockInput(series, 'r2', harness));
  var mapped = d1.concat(d2).map(function (u) {
    return lineup.mergeNoRepeatLockFields(Object.assign({}, u), lock);
  });
  var p1row = mapped.filter(function (u) {
    return u.userId === 'p1';
  })[0];
  var p3row = mapped.filter(function (u) {
    return u.userId === 'p3';
  })[0];
  assert('占用只锁同一身份，不按分队清空名单', p1row.noRepeatLocked === true && !p3row.noRepeatLocked);
})();

(function testAllowRepeatUnchanged() {
  var series = makeSeries({ allowRepeat: true, roundCount: 2 });
  var matches = {
    'm-nr-b-1': makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p1')] }]),
    'm-nr-b-2': makeMatch(series, 'r2', [])
  };
  var harness = makeHarness(series, matches);
  var lock = lineup.collectOtherRoundOccupancy(lockInput(series, 'r2', harness));
  assert('允许重复上场保持可选', lock.ok === true && lock.enabled === false && !lock.playerIds.p1);
  var save = lineup.assertPlayersNotOccupied(['p1'], lockInput(series, 'r2', harness));
  assert('允许重复上场保存不拦截', save.ok === true);
})();

(function testScoringModeIndependent() {
  ['per_round_n', 'global_m'].forEach(function (mode) {
    var series = makeSeries({ mode: mode, allowRepeat: false, roundCount: 2 });
    var matches = {
      'm-nr-b-1': makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p1')] }]),
      'm-nr-b-2': makeMatch(series, 'r2', [])
    };
    var harness = makeHarness(series, matches);
    var lock = lineup.collectOtherRoundOccupancy(lockInput(series, 'r2', harness));
    assert(mode + ' 仍执行不可重复', lock.enabled === true && !!lock.playerIds.p1);
  });
})();

(function testCxLabelDoesNotAffectIdentity() {
  var series = makeSeries({ sameDay: true, roundCount: 2 });
  var display = labels.buildSeriesRoundDisplayLabels(series);
  assert('同日多场 Cx 标签', display.r1 === 'C1' && display.r2 === 'C2');
  var matches = {
    'm-nr-b-1': makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p1')] }]),
    'm-nr-b-2': makeMatch(series, 'r2', [])
  };
  var harness = makeHarness(series, matches);
  var lock = lineup.collectOtherRoundOccupancy(lockInput(series, 'r2', harness));
  assert('身份键是 p1/roundId', lock.occupancy.p1.roundId === 'r1' && lock.occupancy.p1.matchId === 'm-nr-b-1');
})();

(function testLegacyConflictBlocksSaveNoRewrite() {
  var series = makeSeries({ roundCount: 2 });
  var r1 = makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p1', { displayName: '张三' })] }]);
  var r2 = makeMatch(series, 'r2', [{ groupId: 'g2', players: [seat('p1', { displayName: '张三' })] }]);
  var r1Before = JSON.stringify(r1.groups);
  var r2Before = JSON.stringify(r2.groups);
  var matches = { 'm-nr-b-1': r1, 'm-nr-b-2': r2 };
  var harness = makeHarness(series, matches);
  var lock = lineup.collectOtherRoundOccupancy(lockInput(series, 'r2', harness));
  assert('旧数据跨轮重复在编辑占用中标识', !!lock.playerIds.p1);
  var save = lineup.assertPlayersNotOccupied(['p1'], lock);
  assert('保存阻止继续提交', save.ok === false && /张三已在 R1 上场/.test(save.message));
  assert('读取不改写分组', JSON.stringify(r1.groups) === r1Before && JSON.stringify(r2.groups) === r2Before);
})();

(function testSaveStationGroupsIntercept() {
  var series = makeSeries({ roundCount: 2 });
  var r1 = makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p1')] }]);
  var r2 = makeMatch(series, 'r2', []);
  var r2Before = JSON.stringify(r2);
  var matches = { 'm-nr-b-1': r1, 'm-nr-b-2': r2 };
  var harness = makeHarness(series, matches);
  var writes = 0;
  var res = scheduleWrite.saveStationGroups({
    matchId: 'm-nr-b-2',
    series: series,
    roundId: 'r2',
    groupDraft: [
      {
        groupId: 'g-new',
        groupName: '第1组',
        players: [
          Object.assign(seat('p1'), {
            matchTeamId: 't1',
            seriesParticipantId: 'team:t1',
            affiliationId: 't1'
          })
        ]
      }
    ],
    getMatchById: harness.getMatchById,
    getIndexByMatchId: harness.getIndexByMatchId,
    saveMatch: function (m) {
      writes += 1;
      matches[m.matchId] = m;
      return m;
    }
  });
  assert('保存端拦截陈旧/并发重复', res.ok === false && writes === 0);
  assert('不产生部分保存', JSON.stringify(r2) === r2Before);
  assert('不覆盖其他轮次', r1.groups[0].players[0].userId === 'p1');
})();

(function testFilterAndSaveShareModule() {
  var src = fs.readFileSync(path.join(utilsDir, 'seriesNoRepeatLineup.js'), 'utf8');
  var rosterSrc = fs.readFileSync(path.join(pageDir, 'seriesGroupPickRoster.js'), 'utf8');
  var writeSrc = fs.readFileSync(path.join(pageDir, 'seriesScheduleGroupWrite.js'), 'utf8');
  var editorSrc = fs.readFileSync(
    path.join(root, 'miniprogram', 'subpackages', 'tournament', 'pages', 'group-editor', 'index.js'),
    'utf8'
  );
  assert(
    '候选与保存共用 seriesNoRepeatLineup',
    rosterSrc.indexOf('collectOtherRoundOccupancy') >= 0 &&
      writeSrc.indexOf('assertPlayersNotOccupied') >= 0 &&
      editorSrc.indexOf('assertPlayersNotOccupied') >= 0 &&
      src.indexOf('collectOtherRoundOccupancy') >= 0
  );
  assert(
    '不按姓名/下标做身份',
    src.indexOf('userId') >= 0 && src.indexOf('playerId') >= 0 && src.indexOf('localeCompare') < 0
  );
})();

console.log('');
console.log('---- seriesNoRepeatLineup.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
