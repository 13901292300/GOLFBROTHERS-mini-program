/**
 * SERIES-NO-REPEAT-LINEUP-A：allowRepeat=false 时前序轮正式分组球员置灰 + 写前拒绝
 * 运行：node scripts/seriesNoRepeatLineupA.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

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
var groupPickDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament-manage',
  'pages',
  'group-pick'
);
var groupEditorDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament-manage',
  'pages',
  'group-editor'
);

var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var pickRoster = require(seriesTestPaths.util('seriesGroupPickRoster.js'));

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

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function rosterEntry(playerId, seriesParticipantId, extras) {
  return Object.assign(
    {
      rosterEntryId: 're-' + playerId,
      playerId: playerId,
      seriesParticipantId: seriesParticipantId,
      playerNameSnapshot: '球员' + playerId,
      registrationStatus: 'registered'
    },
    extras || {}
  );
}

function makeSeries(allowRepeat) {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: 'NoRepeatA',
    createdBy: 'admin-1',
    organization: {
      organizationId: 'org-1',
      organizationName: '机构',
      organizationLogo: ''
    }
  });
  s.lifecycleStatus = 'published';
  s.publishToken = 'tok-nr-a';
  s.scoringRule = seriesModel.createDefaultScoringRule({
    mode: 'per_round_n',
    allowRepeat: allowRepeat === true
  });
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
  s.rounds = [1, 2, 3].map(function (n) {
    return Object.assign({}, seriesModel.createBlankRound(n, null), {
      roundId: 'r' + n,
      index: n,
      name: '第' + n + '轮',
      dateTime: '2030-06-0' + n + ' 08:00',
      gameMode: '个人比杆赛',
      courseId: 'c1',
      courseName: '球场1',
      fee: '0',
      matchId: 'm-nr-' + n
    });
  });
  s.roster = [
    rosterEntry('p1', 'team:t1'),
    rosterEntry('p2', 'team:t1'),
    rosterEntry('p3', 'team:t2'),
    rosterEntry('p4', 'team:t2'),
    rosterEntry('p5', 'team:t1', { registeredBy: 'admin-1' }),
    rosterEntry('p-future', 'team:t2'),
    rosterEntry('p-roster', 'team:t1')
  ];
  return s;
}

function makeMatch(series, roundId, groups) {
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
  return m;
}

function seat(userId, extras) {
  return Object.assign(
    {
      position: 1,
      userId: userId,
      playerId: userId
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

(function testR2LocksR1() {
  var series = makeSeries(false);
  var matches = {
    'm-nr-1': makeMatch(series, 'r1', [
      { groupId: 'g1', players: [seat('p1'), seat('p2')] },
      { groupId: 'g2', players: [seat('p3')] }
    ]),
    'm-nr-2': makeMatch(series, 'r2', []),
    'm-nr-3': makeMatch(series, 'r3', [{ groupId: 'g9', players: [seat('p-future')] }])
  };
  var harness = makeHarness(series, matches);
  var lock = pickRoster.collectPriorPlayedPlayerIds(lockInput(series, 'r2', harness));
  assert('allowRepeat=false R2 启用', lock.ok === true && lock.enabled === true);
  assert('R2 锁 R1 全部正式分组球员', !!(lock.playerIds.p1 && lock.playerIds.p2 && lock.playerIds.p3));
  assert('R2 不锁未上场 p4', !lock.playerIds.p4);
  assert('R2 锁未来轮已分组 p-future', !!lock.playerIds['p-future']);
  assert('R2 不锁仅报名 p-roster', !lock.playerIds['p-roster']);
})();

(function testR3MergesR1R2() {
  var series = makeSeries(false);
  var matches = {
    'm-nr-1': makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p1'), seat('p2')] }]),
    'm-nr-2': makeMatch(series, 'r2', [{ groupId: 'g1', players: [seat('p2'), seat('p5')] }]),
    'm-nr-3': makeMatch(series, 'r3', [])
  };
  var harness = makeHarness(series, matches);
  var lock = pickRoster.collectPriorPlayedPlayerIds(lockInput(series, 'r3', harness));
  assert('R3 合并 R1+R2', !!(lock.playerIds.p1 && lock.playerIds.p2 && lock.playerIds.p5));
  assert('R3 去重 p2 仍为单键', lock.playerIds.p2 === true);
  assert('R3 不锁未上场 p3', !lock.playerIds.p3);
})();

(function testR1NoLock() {
  var series = makeSeries(false);
  var matches = {
    'm-nr-1': makeMatch(series, 'r1', []),
    'm-nr-2': makeMatch(series, 'r2', [{ groupId: 'g1', players: [seat('p1')] }]),
    'm-nr-3': makeMatch(series, 'r3', [{ groupId: 'g1', players: [seat('p2')] }])
  };
  var harness = makeHarness(series, matches);
  var lock = pickRoster.collectPriorPlayedPlayerIds(lockInput(series, 'r1', harness));
  assert('R1 启用且锁后续轮', lock.ok === true && lock.enabled === true);
  assert('R1 锁 R2/R3 已分组球员', !!(lock.playerIds.p1 && lock.playerIds.p2));
})();

(function testAllowRepeatTrue() {
  var series = makeSeries(true);
  var matches = {
    'm-nr-1': makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p1')] }]),
    'm-nr-2': makeMatch(series, 'r2', []),
    'm-nr-3': makeMatch(series, 'r3', [])
  };
  var harness = makeHarness(series, matches);
  var lock = pickRoster.collectPriorPlayedPlayerIds(lockInput(series, 'r2', harness));
  assert('allowRepeat=true 无锁', lock.ok === true && lock.enabled === false);
  assert('allowRepeat=true 空集合', Object.keys(lock.playerIds).length === 0);
})();

(function testRosterOnlyAndUngrouped() {
  var series = makeSeries(false);
  var r1 = makeMatch(series, 'r1', []);
  r1.scoreData = { ghost: { p1: { gross: 72 } } };
  var matches = {
    'm-nr-1': r1,
    'm-nr-2': makeMatch(series, 'r2', []),
    'm-nr-3': makeMatch(series, 'r3', [])
  };
  var harness = makeHarness(series, matches);
  var lock = pickRoster.collectPriorPlayedPlayerIds(lockInput(series, 'r2', harness));
  assert('前序未分组不锁', lock.ok === true && !lock.playerIds.p1 && !lock.playerIds['p-roster']);
})();

(function testProxyAndSelfSamePlayerId() {
  var series = makeSeries(false);
  var matches = {
    'm-nr-1': makeMatch(series, 'r1', [
      { groupId: 'g1', players: [seat('p1'), seat('p5')] }
    ]),
    'm-nr-2': makeMatch(series, 'r2', []),
    'm-nr-3': makeMatch(series, 'r3', [])
  };
  var harness = makeHarness(series, matches);
  var lock = pickRoster.collectPriorPlayedPlayerIds(lockInput(series, 'r2', harness));
  assert('self 报名 playerId 正常锁', !!lock.playerIds.p1);
  assert('proxy 报名 playerId 正常锁', !!lock.playerIds.p5);
})();

(function testMergeKeepsOccupied() {
  var series = makeSeries(false);
  var matches = {
    'm-nr-1': makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p1')] }]),
    'm-nr-2': makeMatch(series, 'r2', []),
    'm-nr-3': makeMatch(series, 'r3', [])
  };
  var harness = makeHarness(series, matches);
  var lock = pickRoster.collectPriorPlayedPlayerIds(lockInput(series, 'r2', harness));
  var occupied = pickRoster.mergeNoRepeatLockFields(
    { userId: 'p4', isDisabled: true, isOccupied: true, occupiedGroupName: '第2组' },
    lock
  );
  var locked = pickRoster.mergeNoRepeatLockFields(
    { userId: 'p1', isDisabled: false, isOccupied: false },
    lock
  );
  var free = pickRoster.mergeNoRepeatLockFields(
    { userId: 'p4', isDisabled: false },
    lock
  );
  assert('本轮占用 disabled 不被清掉', occupied.isDisabled === true && occupied.isOccupied === true);
  assert(
    '其他轮上场置灰并带原因',
    locked.isDisabled === true &&
      locked.noRepeatLocked === true &&
      locked.disabledReason === 'no_repeat_other_round' &&
      locked.noRepeatHint === '已在 R1 上场'
  );
  assert('未上场保持可选', free.isDisabled === false && !free.noRepeatLocked);
})();

(function testCurrentSlotCanDeselectNotReselect() {
  var series = makeSeries(false);
  var matches = {
    'm-nr-1': makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p1')] }]),
    'm-nr-2': makeMatch(series, 'r2', []),
    'm-nr-3': makeMatch(series, 'r3', [])
  };
  var harness = makeHarness(series, matches);
  var lock = pickRoster.collectPriorPlayedPlayerIds(lockInput(series, 'r2', harness));
  var inSlot = pickRoster.mergeNoRepeatLockFields(
    { userId: 'p1', checked: true, isSelected: true, isDisabled: false },
    lock
  );
  assert('当前 slot 违规球员仍标记 locked/disabled', inSlot.noRepeatLocked === true && inSlot.isDisabled === true);
  assert('取消不走 shouldBlockNoRepeatAdd', true);
  var readd = pickRoster.shouldBlockNoRepeatAdd('p1', lock);
  assert(
    '取消后不可重新选',
    readd.blocked === true && readd.message === '已在 R1 上场'
  );
})();

(function testClickRevalidate() {
  var series = makeSeries(false);
  var matches = {
    'm-nr-1': makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p2')] }]),
    'm-nr-2': makeMatch(series, 'r2', []),
    'm-nr-3': makeMatch(series, 'r3', [])
  };
  var harness = makeHarness(series, matches);
  var before = pickRoster.collectPriorPlayedPlayerIds(lockInput(series, 'r2', harness));
  assert('点击前 p1 未锁', !before.playerIds.p1);
  matches['m-nr-1'].groups = [{ groupId: 'g1', players: [seat('p2'), seat('p1')] }];
  var after = pickRoster.collectPriorPlayedPlayerIds(lockInput(series, 'r2', harness));
  var blocked = pickRoster.shouldBlockNoRepeatAdd('p1', after);
  assert('点击时重新核验后拒绝 p1', blocked.blocked === true && after.playerIds.p1 === true);
})();

(function testConfirmAndSaveRejectZeroWrite() {
  var series = makeSeries(false);
  var r1 = makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p2')] }]);
  var r2 = makeMatch(series, 'r2', []);
  var r2Before = JSON.stringify(r2);
  var matches = {
    'm-nr-1': r1,
    'm-nr-2': r2,
    'm-nr-3': makeMatch(series, 'r3', [])
  };
  var harness = makeHarness(series, matches);
  var writes = 0;
  function trySave(groups) {
    var check = pickRoster.assertPlayersNotPlayedPriorRound(
      pickRoster.collectPlayerIdsFromGroups(groups),
      lockInput(series, 'r2', harness)
    );
    if (!check.ok) return check;
    writes += 1;
    r2.groups = groups;
    return check;
  }
  r1.groups = [{ groupId: 'g1', players: [seat('p2'), seat('p1')] }];
  var confirm = pickRoster.assertPlayersNotPlayedPriorRound(['p1'], lockInput(series, 'r2', harness));
  assert(
    '确认前状态变化会拒绝',
    confirm.ok === false && confirm.reason === 'player_already_played_other_round'
  );
  var saved = trySave([{ groupId: 'g-cur', players: [seat('p1')] }]);
  assert(
    '最终保存前拒绝',
    saved.ok === false && /已在 R1 上场/.test(String(saved.message || ''))
  );
  assert('当前轮 match 零写入', writes === 0 && JSON.stringify(r2) === r2Before);
})();

(function testFailClosedPriorStation() {
  var series = makeSeries(false);
  var bad = makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p1')] }]);
  bad.seriesContext.publishToken = 'wrong';
  var matches = {
    'm-nr-1': bad,
    'm-nr-2': makeMatch(series, 'r2', []),
    'm-nr-3': makeMatch(series, 'r3', [])
  };
  var harness = makeHarness(series, matches);
  var lock = pickRoster.collectPriorPlayedPlayerIds(lockInput(series, 'r2', harness));
  assert(
    '前序 managed 异常 fail closed',
    lock.ok === false && lock.message === '本轮比赛数据异常'
  );
  var loaded = pickRoster.loadSeriesPickRegisterSource({
    fromSeries: 1,
    seriesId: series.seriesId,
    roundId: 'r2',
    matchId: 'm-nr-2',
    match: matches['m-nr-2'],
    series: series,
    getMatchById: harness.getMatchById,
    getIndexByMatchId: harness.getIndexByMatchId
  });
  assert(
    '禁止进入可写分组流程',
    loaded.ok === false && loaded.message === '本轮比赛数据异常'
  );
})();

(function testOrdinaryUnaffected() {
  var series = makeSeries(false);
  var matches = {
    'm-nr-1': makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p1')] }]),
    'm-nr-2': makeMatch(series, 'r2', []),
    'm-nr-3': makeMatch(series, 'r3', [])
  };
  var harness = makeHarness(series, matches);
  var lock = pickRoster.collectPriorPlayedPlayerIds({
    fromSeries: false,
    series: series,
    currentRoundId: 'r2',
    getMatchById: harness.getMatchById,
    getIndexByMatchId: harness.getIndexByMatchId
  });
  assert('普通比赛不启用 no-repeat', lock.ok === true && lock.enabled === false);
  var merged = pickRoster.mergeNoRepeatLockFields({ userId: 'p1', isDisabled: false }, lock);
  assert('普通比赛列表不置灰', merged.isDisabled === false && !merged.noRepeatLocked);
})();

(function testMissingIndexUsesOrder() {
  var series = makeSeries(false);
  series.rounds[0].index = undefined;
  series.rounds[1].index = undefined;
  series.rounds[2].index = undefined;
  var matches = {
    'm-nr-1': makeMatch(series, 'r1', [{ groupId: 'g1', players: [seat('p1')] }]),
    'm-nr-2': makeMatch(series, 'r2', []),
    'm-nr-3': makeMatch(series, 'r3', [])
  };
  var harness = makeHarness(series, matches);
  var lock = pickRoster.collectPriorPlayedPlayerIds(lockInput(series, 'r2', harness));
  assert('缺 index 按 rounds 顺序锁前序', lock.ok === true && !!lock.playerIds.p1);
})();

(function testWiring() {
  var lineupJs = read(seriesTestPaths.util('seriesNoRepeatLineup.js'));
  var pickJs = read(path.join(groupPickDir, 'index.js'));
  var pickWxml = read(path.join(groupPickDir, 'index.wxml'));
  var editorJs = read(path.join(groupEditorDir, 'index.js'));
  var rosterJs = read(seriesTestPaths.util('seriesGroupPickRoster.js'));

  assert(
    '锁定集合认正式 groups / pairings 成员',
    lineupJs.indexOf('collectFormalMemberIdsFromMatch') >= 0 &&
      lineupJs.indexOf('collectPlayerIdsFromPairings') >= 0 &&
      rosterJs.indexOf('seriesNoRepeatLineup') >= 0
  );
  assert(
    '选人列表合并 no-repeat 且不覆盖占用 disabled',
    pickJs.indexOf('mergeNoRepeatLockFields') >= 0 &&
      pickJs.indexOf('_collectNoRepeatLock') >= 0
  );
  assert(
    '展示占用提示走 noRepeatHint',
    pickWxml.indexOf('noRepeatHint') >= 0 && pickWxml.indexOf('noRepeatLocked') >= 0
  );
  assert(
    '点击不信任旧 isDisabled 并重新核验',
    /onTogglePlayer[\s\S]*_collectNoRepeatLock[\s\S]*shouldBlockNoRepeatAdd/.test(pickJs) &&
      pickJs.indexOf('不信任 data-user') >= 0
  );
  assert(
    '当前 slot 先允许取消再拦截重选',
    /selectedIndex >= 0[\s\S]*createEmptySlot[\s\S]*shouldBlockNoRepeatAdd/.test(pickJs)
  );
  assert(
    '确认前二次校验',
    /_validateBeforeCommit[\s\S]*assertPlayersNotPlayedPriorRound/.test(pickJs)
  );
  assert(
    '最终保存前二次校验且在 saveMatch 之前',
    /onConfirm\(\) \{[\s\S]*assertPlayersNotOccupied[\s\S]*this\.setData\(\{\s*saving:\s*true\s*\}\)/.test(
      editorJs
    )
  );
  assert(
    '普通路径仍跳过 fromSeries',
    /_collectNoRepeatLock[\s\S]*if \(!this\._fromSeries\)/.test(pickJs)
  );
})();

console.log('');
console.log('---- seriesNoRepeatLineupA.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
