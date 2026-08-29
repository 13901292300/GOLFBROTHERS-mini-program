/**
 * Series 记分页：开赛后新报名必须出现在「报名列表」候选
 * 运行：node scripts/seriesScoreLateRegisterSource.selftest.js
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
var scoreJs = path.join(
  root,
  'miniprogram',
  'subpackages',
  'scoring',
  'pages',
  'score',
  'index.js'
);

var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var seriesRyderCup = require(path.join(utilsDir, 'seriesRyderCup.js'));
var src = require(path.join(utilsDir, 'seriesPickRegisterSource.js'));
var pickRoster = require(path.join(pageDir, 'seriesGroupPickRoster.js'));

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

function snapshot(obj) {
  return JSON.stringify(obj);
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

function makeTwoRoundSeries(opts) {
  var o = opts || {};
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: o.name || '记分页晚报名',
    createdBy: 'admin-1',
    organization: {
      organizationId: 'org-1',
      organizationName: '机构',
      organizationLogo: ''
    }
  });
  s.lifecycleStatus = 'published';
  s.publishToken = o.publishToken || 'tok-late-reg';
  if (o.ryder) {
    s.seriesCompetitionType = seriesRyderCup.COMPETITION_TYPE;
    s.scoringRule = Object.assign({}, s.scoringRule || {}, { allowRepeat: true });
  } else {
    s.scoringRule = Object.assign({}, s.scoringRule || {}, { allowRepeat: false });
  }
  s.participants = [
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't1',
      seriesParticipantId: 'team:t1',
      nameSnapshot: '甲队',
      shortNameSnapshot: '甲'
    }),
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't2',
      seriesParticipantId: 'team:t2',
      nameSnapshot: '乙队',
      shortNameSnapshot: '乙'
    })
  ];
  s.rounds = [
    Object.assign({}, (s.rounds && s.rounds[0]) || {}, {
      roundId: 'r1',
      index: 1,
      name: '第1轮',
      dateTime: '2030-06-01 08:00',
      gameMode: '个人比杆赛',
      courseId: 'c1',
      courseName: '球场1',
      fee: '0',
      matchId: 'm-late-r1'
    }),
    Object.assign({}, (s.rounds && s.rounds[1]) || {}, {
      roundId: 'r2',
      index: 2,
      name: '第2轮',
      dateTime: '2030-06-08 08:00',
      gameMode: '个人比杆赛',
      courseId: 'c1',
      courseName: '球场1',
      fee: '0',
      matchId: 'm-late-r2'
    })
  ];
  s.roster = [];
  return s;
}

function buildMatch(series, roundId) {
  var round = null;
  (series.rounds || []).forEach(function (r) {
    if (r.roundId === roundId) round = r;
  });
  var built = seriesStationMatch.buildMatchFromSeriesRound(series, round, {
    matchId: round.matchId,
    publishToken: series.publishToken
  });
  if (!built.ok) throw new Error(built.reason);
  var m = built.match;
  m.registerInfo = { totalCount: 0, users: [] };
  m.groups = [];
  return m;
}

function harness(series, matches) {
  return {
    getSeriesById: function (id) {
      return id === series.seriesId ? series : null;
    },
    getIndexByMatchId: function (id) {
      var i;
      for (i = 0; i < series.rounds.length; i++) {
        if (series.rounds[i].matchId === id) {
          return {
            seriesId: series.seriesId,
            roundId: series.rounds[i].roundId,
            matchId: id
          };
        }
      }
      return null;
    },
    getMatchById: function (id) {
      return matches[id] || null;
    }
  };
}

function loadR2(series, matches) {
  var h = harness(series, matches);
  return src.loadScoreRegisterCandidates({
    match: matches['m-late-r2'],
    getSeriesById: h.getSeriesById,
    getIndexByMatchId: h.getIndexByMatchId,
    getMatchById: h.getMatchById
  });
}

function idsOf(users) {
  return (users || []).map(function (u) {
    return String(u.userId || u.playerId);
  });
}

function applyUsedMap(users, usedIds) {
  var used = Object.create(null);
  (usedIds || []).forEach(function (id) {
    used[String(id)] = true;
  });
  return (users || []).filter(function (u) {
    var id = String((u && (u.userId || u.playerId)) || '');
    return !id || !used[id];
  });
}

(function testLateRegisterVisible() {
  var series = makeTwoRoundSeries();
  series.roster = [
    rosterEntry('p-r1', 'team:t1'),
    rosterEntry('p-new', 'team:t1'),
    rosterEntry('p-seat', 'team:t1')
  ];
  var m1 = buildMatch(series, 'r1');
  m1.status = 'finished';
  m1.groups = [
    {
      groupId: 'g1',
      players: [{ userId: 'p-r1', playerId: 'p-r1', position: 1 }]
    }
  ];
  var m2 = buildMatch(series, 'r2');
  m2.status = 'live';
  m2.registerInfo = {
    totalCount: 1,
    users: [{ userId: 'p-r1', playerId: 'p-r1', competitionName: '快照老人' }]
  };
  m2.groups = [
    {
      groupId: 'g2',
      players: [{ userId: 'p-seat', playerId: 'p-seat', position: 1 }]
    }
  ];
  var matches = { 'm-late-r1': m1, 'm-late-r2': m2 };
  var beforeSeries = snapshot(series);
  var beforeM1 = snapshot(m1);
  var beforeM2 = snapshot(m2);

  var loaded = loadR2(series, matches);
  assert('1/2 R1 finished R2 LIVE 可读', loaded.ok === true && loaded.kind === 'series');
  assert(
    '3 roster 含新人且 2 registerInfo 不含新人',
    series.roster.some(function (e) {
      return e.playerId === 'p-new' && e.registrationStatus === 'registered';
    }) &&
      m2.registerInfo.users.every(function (u) {
        return u.userId !== 'p-new';
      })
  );
  var visible = applyUsedMap(loaded.users, ['p-seat']);
  var visIds = idsOf(visible);
  assert('4 R2 候选看得到从未上场新人', visIds.indexOf('p-new') >= 0);
  assert('5 当前轮已占位 p-seat 不出现', visIds.indexOf('p-seat') < 0);
  assert('6 普通 Series R1 上场者 no-repeat 不出现', visIds.indexOf('p-r1') < 0);
  assert('7 新报名未上场者出现', visIds.indexOf('p-new') >= 0);
  assert(
    '13 不写 Series/Match',
    snapshot(series) === beforeSeries && snapshot(m1) === beforeM1 && snapshot(m2) === beforeM2
  );
  assert('14 输入不变', snapshot(series) === beforeSeries && snapshot(m2) === beforeM2);
})();

(function testRyderAllowRepeat() {
  var series = makeTwoRoundSeries({ ryder: true, publishToken: 'tok-ryder' });
  series.roster = [
    rosterEntry('p-r1', 'team:t1'),
    rosterEntry('p-new', 'team:t1'),
    rosterEntry('p-same', 'team:t1')
  ];
  var m1 = buildMatch(series, 'r1');
  m1.status = 'finished';
  m1.groups = [
    {
      groupId: 'g1',
      players: [{ userId: 'p-r1', playerId: 'p-r1', position: 1 }]
    }
  ];
  var m2 = buildMatch(series, 'r2');
  m2.status = 'live';
  m2.registerInfo = { totalCount: 0, users: [] };
  m2.groups = [
    {
      groupId: 'g2',
      players: [{ userId: 'p-same', playerId: 'p-same', position: 1 }]
    }
  ];
  var matches = { 'm-late-r1': m1, 'm-late-r2': m2 };
  var loaded = loadR2(series, matches);
  assert('8 莱德杯 R1 上场者可出现在 R2 候选', loaded.ok && idsOf(loaded.users).indexOf('p-r1') >= 0);
  var visible = applyUsedMap(loaded.users, ['p-same']);
  assert(
    '9 莱德杯同轮其它座位已使用者仍不出现',
    idsOf(visible).indexOf('p-same') < 0 && idsOf(visible).indexOf('p-r1') >= 0
  );
})();

(function testFailClosedToken() {
  var series = makeTwoRoundSeries();
  series.roster = [rosterEntry('p-new', 'team:t1')];
  var m1 = buildMatch(series, 'r1');
  var m2 = buildMatch(series, 'r2');
  m2.registerInfo = {
    totalCount: 1,
    users: [{ userId: 'ghost-from-registerInfo', playerId: 'ghost-from-registerInfo' }]
  };
  m2.seriesContext.publishToken = 'wrong-token';
  var loaded = loadR2(series, { 'm-late-r1': m1, 'm-late-r2': m2 });
  assert('10 token 冲突 fail closed', loaded.ok === false);
  assert(
    '10 不回退 registerInfo',
    !loaded.users && loaded.message === src.SCORE_REGISTER_READ_FAIL_MSG
  );
})();

(function testOrdinaryMatch() {
  var match = {
    matchId: 'ordinary-1',
    registerInfo: {
      totalCount: 2,
      users: [
        { userId: 'a1', competitionName: '甲' },
        { userId: 'a2', competitionName: '乙' }
      ]
    }
  };
  var loaded = src.loadScoreRegisterCandidates({ match: match });
  assert('11 普通单场 kind=ordinary', loaded.ok === true && loaded.kind === 'ordinary');
  assert(
    '11 只读 match.registerInfo',
    idsOf(loaded.users).join(',') === 'a1,a2'
  );
})();

(function testGroupPickUnchanged() {
  var series = makeTwoRoundSeries({ publishToken: 'tok-pick' });
  series.roster = [
    rosterEntry('p1', 'team:t1'),
    rosterEntry('p2', 'team:t1', { registrationStatus: 'cancelled' })
  ];
  var m2 = buildMatch(series, 'r2');
  m2.registerInfo = { totalCount: 9, users: [{ userId: 'ghost' }] };
  var loaded = pickRoster.loadSeriesPickRegisterSource({
    fromSeries: 1,
    seriesId: series.seriesId,
    roundId: 'r2',
    matchId: m2.matchId,
    match: m2,
    series: series,
    getIndexByMatchId: function () {
      return { seriesId: series.seriesId, roundId: 'r2', matchId: m2.matchId };
    },
    getMatchById: function () {
      return null;
    }
  });
  assert('12 group-pick 仍投影 roster', loaded.ok === true);
  assert(
    '12 仍忽略 match.registerInfo 且 cancelled 过滤',
    loaded.registerInfo.users.length === 1 &&
      loaded.registerInfo.users[0].userId === 'p1'
  );
})();

(function testEmptySeatDoesNotExcludeSelf() {
  var series = makeTwoRoundSeries();
  series.roster = [rosterEntry('p-new', 'team:t1')];
  var m1 = buildMatch(series, 'r1');
  var m2 = buildMatch(series, 'r2');
  m2.groups = [{ groupId: 'g2', players: [{ userId: '', position: 2 }] }];
  var loaded = loadR2(series, { 'm-late-r1': m1, 'm-late-r2': m2 });
  var visible = applyUsedMap(loaded.users, []);
  assert(
    '点击空位自身不排除新人',
    loaded.ok && idsOf(visible).indexOf('p-new') >= 0
  );
})();

(function testWiring() {
  var scoreSrc = fs.readFileSync(scoreJs, 'utf8');
  var pickSrc = fs.readFileSync(path.join(pageDir, 'seriesGroupPickRoster.js'), 'utf8');
  assert(
    'scoring 用主包投影且不 require tournament seriesGroupPickRoster',
    scoreSrc.indexOf('seriesPickRegisterSource') >= 0 &&
      scoreSrc.indexOf('loadScoreRegisterCandidates') >= 0 &&
      scoreSrc.indexOf('series-detail/seriesGroupPickRoster') < 0
  );
  assert(
    'group-pick 薄适配转发主包',
    pickSrc.indexOf('seriesPickRegisterSource') >= 0 &&
      pickSrc.indexOf('completeVerifiedPickRegisterSource') >= 0
  );
  var rosterFn = scoreSrc.match(
    /_onSeriesRosterPlayerPicked\([\s\S]*?\n  \},/
  );
  rosterFn = rosterFn && rosterFn[0] ? rosterFn[0] : '';
  assert(
    '点击 Series roster 直接 bind draft，不走普通注册',
    rosterFn.indexOf('_bindDraftPlayerToSlot') >= 0 &&
      rosterFn.indexOf('assertScoreSeriesRosterPick') >= 0 &&
      rosterFn.indexOf('_ensureMatchParticipant') < 0 &&
      rosterFn.indexOf('_openJoinMatchTeamSheet') < 0 &&
      rosterFn.indexOf('_registerMatchParticipantIfNeeded') < 0 &&
      rosterFn.indexOf('registerInfo.users.push') < 0
  );
  assert(
    '普通单场 _onPlayerPicked 仍走 ensure participant',
    /_onPlayerPicked\([\s\S]*sourceKind[\s\S]*_onSeriesRosterPlayerPicked[\s\S]*_ensureMatchParticipant/.test(
      scoreSrc
    ) && scoreSrc.indexOf('_openJoinMatchTeamSheet') >= 0
  );
  assert(
    'draft 绑定仍用空座 scorePlayerId || player.playerId',
    /scorePlayerId:\s*slots\[idx\]\.scorePlayerId\s*\|\|\s*player\.playerId/.test(scoreSrc)
  );
})();

function existingDraftBind(slot, playerId) {
  return {
    playerId: playerId,
    status: 'occupied',
    scorePlayerId: (slot && slot.scorePlayerId) || playerId || ''
  };
}

(function testSeriesRosterClickBind() {
  var series = makeTwoRoundSeries({ publishToken: 'tok-click' });
  series.roster = [rosterEntry('p-new', 'team:t1')];
  var m1 = buildMatch(series, 'r1');
  var m2 = buildMatch(series, 'r2');
  m2.registerInfo = { totalCount: 0, users: [] };
  var matches = { 'm-late-r1': m1, 'm-late-r2': m2 };
  var beforeSeries = snapshot(series);
  var beforeM2 = snapshot(m2);
  var loaded = loadR2(series, matches);
  var cand = (loaded.users || []).filter(function (u) {
    return u.userId === 'p-new';
  })[0];
  assert(
    '1 Series roster 候选带来源标记',
    cand &&
      cand.sourceKind === src.SOURCE_KIND_SERIES_ROSTER &&
      cand.seriesId === series.seriesId &&
      cand.roundId === 'r2' &&
      cand.seriesParticipantId === 'team:t1' &&
      cand.rosterEntryId === 're-p-new'
  );
  var h = harness(series, matches);
  var picked = src.assertScoreSeriesRosterPick(
    Object.assign({}, h, {
      match: m2,
      player: cand,
      usedPlayerIds: {}
    })
  );
  assert('2 复核通过可绑定', picked.ok === true && picked.bindPlayer.playerId === 'p-new');
  assert('2 bindPlayer 带 seat 分流字段', picked.bindPlayer.sourceKind === 'series_roster');
  assert('3/4/5 不写 registerInfo', snapshot(m2.registerInfo) === JSON.stringify({ totalCount: 0, users: [] }));
  assert(
    '6 不写 Match/Series',
    snapshot(series) === beforeSeries && snapshot(m2) === beforeM2 && picked.wrote === false
  );

  var vacuum = existingDraftBind({ scorePlayerId: '' }, 'p-new');
  assert('10 真空位 scorePlayerId=B', vacuum.scorePlayerId === 'p-new');
  var history = existingDraftBind({ scorePlayerId: 'p-A' }, 'p-new');
  assert('11 历史空座保留 A', history.scorePlayerId === 'p-A');
})();

(function testSeriesRosterClickRejects() {
  var series = makeTwoRoundSeries({ publishToken: 'tok-reject' });
  series.roster = [rosterEntry('p-new', 'team:t1')];
  var m1 = buildMatch(series, 'r1');
  var m2 = buildMatch(series, 'r2');
  var matches = { 'm-late-r1': m1, 'm-late-r2': m2 };
  var loaded = loadR2(series, matches);
  var cand = loaded.users[0];
  var h = harness(series, matches);

  series.roster[0].registrationStatus = 'cancelled';
  var cancelled = src.assertScoreSeriesRosterPick(
    Object.assign({}, h, { match: m2, player: cand, usedPlayerIds: {} })
  );
  assert(
    '7 roster 已取消拒绝',
    cancelled.ok === false && cancelled.message === src.SCORE_ROSTER_STALE_MSG
  );
  series.roster[0].registrationStatus = 'registered';

  var conflictPlayer = Object.assign({}, cand, { playerId: 'other', userId: 'other' });
  var conflict = src.assertScoreSeriesRosterPick(
    Object.assign({}, h, { match: m2, player: conflictPlayer, usedPlayerIds: {} })
  );
  assert(
    '8 rosterEntryId/playerId 冲突拒绝',
    conflict.ok === false && conflict.message === src.SCORE_ROSTER_STALE_MSG
  );

  series.roster.push(rosterEntry('p-new', 'team:t1', { rosterEntryId: 're-p-new' }));
  var dup = src.assertScoreSeriesRosterPick(
    Object.assign({}, h, { match: m2, player: cand, usedPlayerIds: {} })
  );
  assert('8 重复 rosterEntryId 拒绝', dup.ok === false);
  series.roster.pop();

  var occupied = src.assertScoreSeriesRosterPick(
    Object.assign({}, h, {
      match: m2,
      player: cand,
      usedPlayerIds: { 'p-new': true }
    })
  );
  assert(
    '9 本轮已占位拒绝',
    occupied.ok === false && occupied.reason === 'already_in_round'
  );

  var ordinary = src.assertScoreSeriesRosterPick({
    match: { matchId: 'o1', registerInfo: { users: [] } },
    player: { userId: 'x', playerId: 'x', source: 'register' },
    usedPlayerIds: {}
  });
  assert('12 无 series_roster 标记不走 Series 绑定', ordinary.ok === false);
})();

console.log('');
console.log('---- seriesScoreLateRegisterSource.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
