/**
 * Series 出发表分组卡右上角：对齐普通单场 tee-status 投影
 * 运行：node scripts/seriesScheduleTeeCardStatus.selftest.js
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
var detailDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'detail'
);

var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var tournamentGroupCardView = require(seriesTestPaths.util('tournamentGroupCardView.js'));
var teeSheetManage = require(path.join(utilsDir, 'teeSheetManage.js'));
var scheduleVm = require(path.join(pageDir, 'seriesScheduleViewModel.js'));
var detailVm = require(path.join(pageDir, 'seriesDetailViewModel.js'));

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

function expectedAuthorityCards(match, series) {
  var cards = tournamentGroupCardView.buildReadonlyGroupCards(match, {
    series: series || null
  });
  cards = teeSheetManage.applyMatchPlayStartHoleToTeeGroups(match, cards);
  return teeSheetManage.applyLiveHoleStatusBadgeToTeeGroups(match, cards);
}

function makeSeries(templateId, gameMode) {
  var hostMode = templateId === 'internal_team_series' ? 'team' : 'organization';
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: hostMode,
    templateId: templateId,
    seriesName: '出发表角标',
    roundCount: 3,
    createdBy: 'admin-1',
    organization:
      hostMode === 'organization'
        ? { organizationId: 'org-1', organizationName: '机构', organizationLogo: '' }
        : undefined,
    team: hostMode === 'team' ? { teamId: 'ht', teamName: '主队', teamLogo: '' } : undefined
  });
  s.lifecycleStatus = 'published';
  s.publishToken = 'tok-tee-status';
  s.participants =
    hostMode === 'team'
      ? [
          seriesModel.createParticipant({
            kind: 'division',
            divisionId: 'div-a',
            seriesParticipantId: 'division:div-a',
            nameSnapshot: '红队'
          }),
          seriesModel.createParticipant({
            kind: 'division',
            divisionId: 'div-b',
            seriesParticipantId: 'division:div-b',
            nameSnapshot: '蓝队'
          })
        ]
      : [
          seriesModel.createParticipant({
            kind: 'team',
            sourceTeamId: 't1',
            seriesParticipantId: 'team:t1',
            nameSnapshot: '甲队',
            shortNameSnapshot: '甲队'
          }),
          seriesModel.createParticipant({
            kind: 'team',
            sourceTeamId: 't2',
            seriesParticipantId: 'team:t2',
            nameSnapshot: '乙队',
            shortNameSnapshot: '乙队'
          })
        ];
  s.rounds = (s.rounds || []).slice(0, 3).map(function (r, idx) {
    return Object.assign({}, r, {
      roundId: 'r' + (idx + 1),
      index: idx + 1,
      matchId: 'm-tee-' + (idx + 1),
      gameMode: gameMode || '个人比杆赛',
      dateTime: '2030-06-0' + (idx + 1) + ' 08:00',
      courseId: 'c1',
      courseName: '球场',
      fee: '0',
      roundStatus: idx === 0 ? 'registering' : idx === 1 ? 'live' : 'completed'
    });
  });
  s.roster = [];
  return s;
}

function makeMatch(series, round, status) {
  var built = seriesStationMatch.buildMatchFromSeriesRound(series, round, {
    matchId: round.matchId,
    publishToken: series.publishToken
  });
  if (!built.ok) throw new Error(built.reason);
  var m = built.match;
  m.status = status || 'registering';
  m.gameMode = round.gameMode || '个人比杆赛';
  return m;
}

function playerSeat(pos, userId, name, sid) {
  return {
    position: pos,
    userId: userId,
    displayName: name,
    seriesParticipantId: sid
  };
}

function scores18(filled) {
  var arr = [];
  for (var i = 0; i < 18; i++) arr.push(i < filled ? 4 : '');
  return arr;
}

function buildVm(series, matches, selectedRoundId) {
  return scheduleVm.buildSeriesScheduleViewModel({
    series: series,
    selectedRoundId: selectedRoundId,
    roundStates: series.rounds.map(function (r) {
      return {
        roundId: r.roundId,
        index: r.index,
        matchId: r.matchId,
        roundStatus: r.roundStatus,
        label: 'R' + r.index
      };
    }),
    getMatchById: function (id) {
      return matches[id] || null;
    },
    getIndexByMatchId: function (id) {
      var row = series.rounds.filter(function (r) {
        return r.matchId === id;
      })[0];
      return row
        ? { seriesId: series.seriesId, roundId: row.roundId, matchId: id }
        : null;
    }
  });
}

(function testSourceParity() {
  var seriesWxml = read(path.join(pageDir, 'index.wxml'));
  var seriesWxss = read(path.join(pageDir, 'index.wxss'));
  var seriesVmSrc = read(path.join(pageDir, 'seriesScheduleViewModel.js'));
  var detailWxml = read(path.join(detailDir, 'index.wxml'));
  var commonWxss = read(
    path.join(root, 'miniprogram', 'styles', 'tournament-common.wxss')
  );
  assert(
    '普通单场出发表右上角为 tee-status + statusBadge',
    /class="tee-status">\{\{item\.statusBadge\}\}/.test(detailWxml)
  );
  assert(
    'Series 出发表右上角复用同一节点，无 statusBadgeClass',
    /class="tee-status">\{\{item\.statusBadge\}\}/.test(seriesWxml) &&
      seriesWxml.indexOf('statusBadgeClass') < 0
  );
  assert(
    '未新增分组级 LIVE 样式',
    seriesWxss.indexOf('.tee-status.badge-live') < 0 &&
      seriesWxss.indexOf('.tee-status.badge-gold') < 0 &&
      seriesWxss.indexOf('.tee-status.badge-finished') < 0 &&
      commonWxss.indexOf('.tee-status') >= 0
  );
  assert(
    'Series 调用公共 LIVE 洞数投影，不自行 stamp 轮次状态',
    seriesVmSrc.indexOf('applyLiveHoleStatusBadgeToTeeGroups') >= 0 &&
      seriesVmSrc.indexOf('stampRoundCardStatus') < 0 &&
      seriesVmSrc.indexOf('buildReadonlyGroupCards') >= 0
  );
  assert(
    '轮次层 LIVE 仍在选择器',
    seriesWxml.indexOf('showLiveBadge') >= 0 ||
      read(
        path.join(root, 'miniprogram', 'subpackages', 'tournament', 'components', 'series-round-selector-dock', 'index.wxml')
      ).indexOf('item.showLiveBadge') >= 0
  );
  assert(
    '查看领先榜入口仍在出发表 LIVE 轮',
    seriesWxml.indexOf('schedule.showViewLeaderboard') >= 0 &&
      seriesWxml.indexOf('schedule.viewLeaderboardLabel') >= 0
  );
})();

(function testLiveRoundGroupCorners() {
  var series = makeSeries('inter_team_series', '个人比杆赛');
  var liveRound = series.rounds[1];
  var match = makeMatch(series, liveRound, 'ongoing');
  match.groups = [
    {
      groupId: 'g-live',
      groupName: '第1组',
      teeTime: '07:10',
      startHole: 1,
      players: [
        playerSeat(1, 'u1', '甲一', 'team:t1'),
        playerSeat(2, 'u2', '乙一', 'team:t2')
      ]
    },
    {
      groupId: 'g-wait',
      groupName: '第2组',
      teeTime: '07:20',
      startHole: 1,
      players: [
        playerSeat(1, 'u3', '甲二', 'team:t1'),
        playerSeat(2, 'u4', '乙二', 'team:t2')
      ]
    }
  ];
  var firstScoreAt = Date.now() - 45 * 60 * 1000;
  match.scoreData = {
    'g-live': {
      firstScoreAt: firstScoreAt,
      scoresByPlayer: {
        u1: { scores: scores18(3) },
        u2: { scores: scores18(2) }
      }
    }
  };
  var matches = {};
  matches[liveRound.matchId] = match;
  matches[series.rounds[0].matchId] = makeMatch(series, series.rounds[0], 'registering');
  matches[series.rounds[2].matchId] = makeMatch(series, series.rounds[2], 'finished');

  var vm = buildVm(series, matches, liveRound.roundId);
  var cards = vm.teeGroups;
  var authority = expectedAuthorityCards(match, series);
  assert('LIVE 轮使用 tee 面板', vm.panelMode === 'tee' && cards.length === 2);
  assert(
    'LIVE 轮分组卡右上角不含 LIVE 文案',
    cards.every(function (c) {
      return String(c.statusBadge).indexOf('LIVE') < 0;
    })
  );
  assert(
    '轮次层仍为 LIVE 且可查看领先榜',
    vm.roundVisualState === 'live' &&
      vm.showViewLeaderboard === true &&
      vm.viewLeaderboardLabel === '查看领先榜' &&
      vm.roundSelectorItems[1].showLiveBadge === true &&
      vm.roundSelectorItems[1].stateClass.indexOf('live') >= 0
  );
  assert(
    '不同分组右上角各自投影',
    cards[0].statusBadge.indexOf('3H') === 0 && cards[1].statusBadge === 'UPCOMING'
  );
  assert(
    'LIVE 组角标含用时后缀',
    cards[0].statusBadge === authority[0].statusBadge &&
      cards[0].statusBadge.indexOf("'") >= 0
  );
  assert(
    '与普通单场权威投影签名一致',
    JSON.stringify(tournamentGroupCardView.cardProjectionSignature(cards)) ===
      JSON.stringify(tournamentGroupCardView.cardProjectionSignature(authority))
  );
  assert(
    '分组顺序与开球信息不变',
    cards[0].groupId === 'g-live' &&
      cards[1].groupId === 'g-wait' &&
      cards[0].teeMetaLine.indexOf('07:10') === 0 &&
      cards[1].teeMetaLine.indexOf('07:20') === 0
  );
})();

(function testUpcomingCompletedStructure() {
  var series = makeSeries('internal_team_series', '个人比杆赛');
  var upcoming = makeMatch(series, series.rounds[0], 'registering');
  upcoming.groups = [
    {
      groupId: 'g-u',
      groupName: '第1组',
      teeTime: '08:00',
      startHole: 10,
      players: [playerSeat(1, 'd1', '红一', 'division:div-a')]
    }
  ];
  var live = makeMatch(series, series.rounds[1], 'ongoing');
  live.groups = [
    {
      groupId: 'g-l',
      groupName: '第1组',
      teeTime: '08:10',
      startHole: 1,
      players: [playerSeat(1, 'd2', '蓝一', 'division:div-b')]
    }
  ];
  live.scoreData = {
    'g-l': { scoresByPlayer: { d2: { scores: scores18(1) } } }
  };
  var done = makeMatch(series, series.rounds[2], 'finished');
  done.groups = [
    {
      groupId: 'g-c',
      groupName: '第1组',
      status: 'finished',
      teeTime: '08:20',
      startHole: 1,
      players: [playerSeat(1, 'd3', '红二', 'division:div-a')]
    }
  ];
  var matches = {};
  matches[series.rounds[0].matchId] = upcoming;
  matches[series.rounds[1].matchId] = live;
  matches[series.rounds[2].matchId] = done;

  var vmU = buildVm(series, matches, series.rounds[0].roundId);
  var vmL = buildVm(series, matches, series.rounds[1].roundId);
  var vmC = buildVm(series, matches, series.rounds[2].roundId);

  assert(
    '未开始轮分组卡为 UPCOMING 且结构不漂移',
    vmU.panelMode === 'groups' &&
      vmU.groupCards[0].statusBadge === 'UPCOMING' &&
      vmU.groupCards[0].teeMetaLine.indexOf('08:00') === 0 &&
      vmU.showViewLeaderboard === false
  );
  assert(
    'LIVE 轮卡片非 LIVE 文案且轮次 LIVE 保留',
    vmL.panelMode === 'tee' &&
      String(vmL.teeGroups[0].statusBadge).indexOf('LIVE') < 0 &&
      vmL.teeGroups[0].statusBadge.indexOf('H') >= 0 &&
      vmL.showViewLeaderboard === true
  );
  assert(
    '已完成轮分组卡为 COMPLETED',
    vmC.panelMode === 'tee' &&
      vmC.teeGroups[0].statusBadge === 'COMPLETED' &&
      vmC.showViewLeaderboard === false
  );
  assert(
    '队内多分队与普通权威投影一致',
    JSON.stringify(scheduleVm.cardProjectionSignature(vmU.groupCards)) ===
      JSON.stringify(scheduleVm.cardProjectionSignature(expectedAuthorityCards(upcoming, series))) &&
      JSON.stringify(scheduleVm.cardProjectionSignature(vmL.teeGroups)) ===
        JSON.stringify(scheduleVm.cardProjectionSignature(expectedAuthorityCards(live, series))) &&
      JSON.stringify(scheduleVm.cardProjectionSignature(vmC.teeGroups)) ===
        JSON.stringify(scheduleVm.cardProjectionSignature(expectedAuthorityCards(done, series)))
  );
})();

(function testG2G4() {
  var series = makeSeries('inter_team_series', '四人四球比杆赛');
  var round = series.rounds[1];
  var match = makeMatch(series, round, 'ongoing');
  match.gameMode = '四人四球比杆赛';
  match.groups = [
    {
      groupId: 'g-g2',
      groupName: '第1组',
      teeTime: '09:00',
      startHole: 1,
      players: [
        playerSeat(1, 'a1', 'A1', 'team:t1'),
        playerSeat(2, 'a2', 'A2', 'team:t1'),
        playerSeat(3, 'b1', 'B1', 'team:t2'),
        playerSeat(4, 'b2', 'B2', 'team:t2')
      ]
    }
  ];
  match.scoreData = {
    'g-g2': {
      scoresByPlayer: {
        a1: { scores: scores18(4) }
      },
      teamScoresByEntity: [{ teamId: 't1', scores: scores18(4) }]
    }
  };
  var matches = {};
  matches[round.matchId] = match;
  matches[series.rounds[0].matchId] = makeMatch(series, series.rounds[0], 'registering');
  matches[series.rounds[2].matchId] = makeMatch(series, series.rounds[2], 'finished');
  var vm = buildVm(series, matches, round.roundId);
  var authority = expectedAuthorityCards(match, series);
  assert(
    'G2 右上角与普通单场一致且不含 LIVE',
    vm.teeGroups[0].statusBadge === authority[0].statusBadge &&
      String(vm.teeGroups[0].statusBadge).indexOf('LIVE') < 0
  );

  var g4Series = makeSeries('inter_team_series', '四人两球比杆赛');
  var g4Round = g4Series.rounds[1];
  var g4Match = makeMatch(g4Series, g4Round, 'ongoing');
  g4Match.gameMode = '四人两球比杆赛';
  g4Match.groups = [
    {
      groupId: 'g-g4',
      groupName: '第1组',
      teeTime: '09:10',
      startHole: 1,
      players: [
        playerSeat(1, 'c1', 'C1', 'team:t1'),
        playerSeat(2, 'c2', 'C2', 'team:t1'),
        playerSeat(3, 'd1', 'D1', 'team:t2'),
        playerSeat(4, 'd2', 'D2', 'team:t2')
      ]
    }
  ];
  g4Match.scoreData = {
    'g-g4': {
      scoresByPlayer: { c1: { scores: scores18(2) } }
    }
  };
  var g4Matches = {};
  g4Matches[g4Round.matchId] = g4Match;
  g4Matches[g4Series.rounds[0].matchId] = makeMatch(
    g4Series,
    g4Series.rounds[0],
    'registering'
  );
  g4Matches[g4Series.rounds[2].matchId] = makeMatch(
    g4Series,
    g4Series.rounds[2],
    'finished'
  );
  var vmG4 = buildVm(g4Series, g4Matches, g4Round.roundId);
  var authG4 = expectedAuthorityCards(g4Match, g4Series);
  assert(
    'G4 右上角与普通单场一致且不含 LIVE',
    vmG4.teeGroups[0].statusBadge === authG4[0].statusBadge &&
      String(vmG4.teeGroups[0].statusBadge).indexOf('LIVE') < 0
  );
})();

(function testTabDefaultsUntouched() {
  var series = makeSeries('inter_team_series', '个人比杆赛');
  var liveMatch = makeMatch(series, series.rounds[1], 'ongoing');
  liveMatch.groups = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [playerSeat(1, 'u1', '甲', 'team:t1')]
    }
  ];
  var vm = detailVm.buildSeriesDetailViewModel(series, {
    preview: false,
    theme: 'bright',
    getMatchById: function (id) {
      if (id === series.rounds[1].matchId) return liveMatch;
      return { status: 'registering', seriesContext: liveMatch.seriesContext, groups: [] };
    },
    getIndexByMatchId: function (id) {
      var row = series.rounds.filter(function (r) {
        return r.matchId === id;
      })[0];
      return row
        ? { seriesId: series.seriesId, roundId: row.roundId, matchId: id }
        : null;
    }
  });
  assert(
    '默认 TAB 仍为赛事信息，报名在最后，总榜默认 LIVE 轮',
    vm.ok &&
      vm.tabs[0].id === 'info' &&
      vm.tabs[vm.tabs.length - 1].id === 'register' &&
      vm.standings.selectedKey === 'r2'
  );
})();

(function testMatchPlayTeeHoleLabel() {
  var g5Match = {
    matchId: 'm-g5',
    gameMode: '个人比洞赛',
    status: 'ongoing',
    groups: [
      {
        groupId: 'g-a',
        groupName: '第1组',
        teeTime: '08:00',
        startHole: 1,
        players: [{ position: 1, userId: 'u1' }]
      },
      {
        groupId: 'g-b',
        groupName: '第2组',
        teeTime: '08:10',
        startHole: 1,
        players: [{ position: 1, userId: 'u2' }]
      }
    ],
    scoreData: {
      'g-b': { matchPlayMeta: { startHole: 10, source: 'manual' } }
    }
  };
  var g5Cards = expectedAuthorityCards(g5Match, null);
  assert(
    'G5 无 meta 时组卡 T 台号为 A1',
    g5Cards[0].teeMetaLine === '08:00 · A1出发' && g5Cards[0].teeMetaLine.indexOf('1号洞') < 0
  );
  assert(
    'G5 matchPlayMeta 优先，10 号洞显示 B1',
    g5Cards[1].teeMetaLine === '08:10 · B1出发' && g5Cards[1].startHole === 10
  );

  var pendingMatch = {
    matchId: 'm-pending',
    gameMode: '个人比洞赛',
    status: 'registering',
    groups: [
      {
        groupId: 'g-p',
        groupName: '第1组',
        teeTime: '08:00',
        players: [{ position: 1, userId: 'u1' }]
      }
    ]
  };
  var pendingCards = expectedAuthorityCards(pendingMatch, null);
  assert(
    '未开始且无 startHole 显示待分配',
    pendingCards[0].teeMetaLine === '08:00 · 待分配' &&
      pendingCards[0].hole === '待分配'
  );

  var strokeMatch = {
    matchId: 'm-stroke',
    gameMode: '个人比杆赛',
    status: 'ongoing',
    groups: [
      {
        groupId: 'g-s',
        groupName: '第1组',
        teeTime: '07:10',
        startHole: 1,
        players: [{ position: 1, userId: 'u1' }]
      }
    ]
  };
  var strokeCards = expectedAuthorityCards(strokeMatch, null);
  assert(
    '比杆赛仍用号洞，不改成 A1',
    strokeCards[0].teeMetaLine === '07:10 · 1号洞出发'
  );

  var seriesVmSrc = read(path.join(pageDir, 'seriesScheduleViewModel.js'));
  assert(
    'Series 出发表复用公共 match-play T 台号投影',
    seriesVmSrc.indexOf('applyMatchPlayStartHoleToTeeGroups') >= 0
  );
})();

console.log('');
console.log('seriesScheduleTeeCardStatus.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
