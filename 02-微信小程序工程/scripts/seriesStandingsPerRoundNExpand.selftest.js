/**
 * per_round_n 展开：G1 个人 / G2–G4 组合复用普通单场 LIVE 球队榜。
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsPerRoundNExpand.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');

var teamLeaderboardView = require(path.join(utilsDir, 'teamLeaderboardView.js'));
var teamLeaderboardHost = require(path.join(utilsDir, 'teamLeaderboardHost.js'));
var seriesStandingsAssembler = require(path.join(utilsDir, 'seriesStandingsAssembler.js'));
var liveAdapter = require(path.join(seriesDir, 'seriesLiveLeaderboardAdapter.js'));
var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));

var pageJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(seriesDir, 'index.wxss'), 'utf8');
var adapterSrc = fs.readFileSync(path.join(seriesDir, 'seriesLiveLeaderboardAdapter.js'), 'utf8');
var vmSrc = fs.readFileSync(path.join(seriesDir, 'seriesStandingsViewModel.js'), 'utf8');

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

function fillScores(n, stroke) {
  var out = [];
  for (var i = 0; i < 18; i++) out.push(i < n ? stroke : null);
  return out;
}

function users() {
  return [
    { userId: 'u-r1', nickname: '红一', gender: 'male', matchTeamId: 'red' },
    { userId: 'u-r2', nickname: '红二', gender: 'male', matchTeamId: 'red' },
    { userId: 'u-r3', nickname: '红三', gender: 'male', matchTeamId: 'red' },
    { userId: 'u-r4', nickname: '红四', gender: 'male', matchTeamId: 'red' },
    { userId: 'u-b1', nickname: '蓝一', gender: 'female', matchTeamId: 'blue' },
    { userId: 'u-b2', nickname: '蓝二', gender: 'male', matchTeamId: 'blue' }
  ];
}

function makeSeries(gameMode, extraRounds) {
  return {
    seriesId: 'series-prn-exp',
    publishToken: 'pub-prn-exp',
    lifecycleStatus: 'published',
    scoringRule: {
      mode: 'per_round_n',
      scoreBasis: 'gross',
      allowRepeat: false,
      ruleVersion: 1
    },
    participants: [
      {
        seriesParticipantId: 'team:red',
        kind: 'team',
        sourceTeamId: 'red',
        nameSnapshot: '红队',
        shortNameSnapshot: '红'
      },
      {
        seriesParticipantId: 'team:blue',
        kind: 'team',
        sourceTeamId: 'blue',
        nameSnapshot: '蓝队',
        shortNameSnapshot: '蓝'
      }
    ],
    rounds: extraRounds || [
      {
        roundId: 'r1',
        index: 1,
        matchId: 'm1',
        topN: 2,
        gameMode: gameMode
      }
    ]
  };
}

function makeManagedMatch(opts) {
  var o = opts || {};
  return Object.assign(
    {
      matchId: o.matchId || 'm1',
      status: o.status || 'finished',
      gameMode: o.gameMode || '个人比杆赛',
      courseName: 'Test',
      front9Course: 'A',
      back9Course: 'B',
      teamGroups: [
        { id: 'red', name: '红队' },
        { id: 'blue', name: '蓝队' }
      ],
      scoringRules: { teamCompetition: { enabled: true, topN: 2 } },
      seriesContext: {
        managed: true,
        seriesId: 'series-prn-exp',
        roundId: o.roundId || 'r1',
        publishToken: 'pub-prn-exp'
      },
      registerInfo: { users: users() },
      groups: [],
      scoreData: {},
      scoreEntities: {},
      pairings: {}
    },
    o.patch || {}
  );
}

function makeIndex(roundId, matchId) {
  return {
    seriesId: 'series-prn-exp',
    roundId: roundId,
    matchId: matchId,
    publishToken: 'pub-prn-exp'
  };
}

function g1Match(status) {
  return makeManagedMatch({
    status: status || 'finished',
    gameMode: '个人比杆赛',
    patch: {
      groups: [
        {
          groupId: 'g1',
          groupName: 'A组',
          players: [
            { userId: 'u-r1', position: 1 },
            { userId: 'u-r2', position: 2 },
            { userId: 'u-b1', position: 3 }
          ]
        }
      ],
      scoreData: {
        g1: {
          scoresByPlayer: {
            'u-r1': { scores: fillScores(18, 4) },
            'u-r2': { scores: fillScores(18, 5) },
            'u-b1': { scores: fillScores(18, 3) }
          }
        }
      }
    }
  });
}

function comboMatch(gameMode, status, scores) {
  var entityType = gameMode === '四人两球比杆赛' ? 'pair' : 'team';
  var entities = [
    {
      entityId: 'e-red',
      entityType: entityType,
      compositionMode: gameMode === '四人两球比杆赛' ? '' : '2+2',
      teamGroupId: 'red',
      members: ['u-r1', 'u-r2']
    },
    {
      entityId: 'e-red-b',
      entityType: entityType,
      compositionMode: gameMode === '四人两球比杆赛' ? '' : '2+2',
      teamGroupId: 'red',
      members: ['u-r3', 'u-r4']
    },
    {
      entityId: 'e-blue',
      entityType: entityType,
      compositionMode: gameMode === '四人两球比杆赛' ? '' : '2+2',
      teamGroupId: 'blue',
      members: ['u-b1', 'u-b2']
    }
  ];
  var patch = {
    groups: [
      {
        groupId: 'gA',
        groupName: 'A组',
        players: [
          { userId: 'u-r1', position: 1 },
          { userId: 'u-r2', position: 2 },
          { userId: 'u-r3', position: 3 },
          { userId: 'u-r4', position: 4 },
          { userId: 'u-b1', position: 5 },
          { userId: 'u-b2', position: 6 }
        ]
      }
    ],
    scoreEntities: { gA: entities },
    scoreData: {
      gA: {
        teamScoresByEntity: scores || [
          { teamId: 'e-red', entityId: 'e-red', scores: fillScores(18, 4) },
          { teamId: 'e-red-b', entityId: 'e-red-b', scores: fillScores(18, 5) },
          { teamId: 'e-blue', entityId: 'e-blue', scores: fillScores(18, 3) }
        ]
      }
    }
  };
  if (gameMode === '四人两球比杆赛') {
    patch.pairings = {
      gA: [
        { id: 'e-red', playerIds: ['u-r1', 'u-r2'] },
        { id: 'e-red-b', playerIds: ['u-r3', 'u-r4'] },
        { id: 'e-blue', playerIds: ['u-b1', 'u-b2'] }
      ]
    };
  }
  return makeManagedMatch({
    status: status || 'finished',
    gameMode: gameMode,
    patch: patch
  });
}

function overlayExpand(series, selectedKey, match, indexLink) {
  var assembled = seriesStandingsAssembler.buildStandingsResult({
    series: series,
    getMatchById: function () {
      return match;
    },
    getIndexByMatchId: function () {
      return indexLink;
    },
    resolveStationStatusLabel: function (m) {
      if (!m) return '';
      if (m.status === 'ongoing' || m.status === 'live') return 'LIVE';
      if (m.status === 'finished' || m.status === 'completed') return '已结束';
      return '报名中';
    }
  });
  var roundStates = (series.rounds || []).map(function (r, i) {
    return {
      roundId: r.roundId,
      index: r.index || i + 1,
      label: 'R' + (r.index || i + 1),
      state: match && match.status === 'registering' ? 'grouped' : 'completed'
    };
  });
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: selectedKey,
    roundStates: roundStates,
    standingsResult: assembled.standingsResult
  });
  var liveProjected = liveAdapter.projectSeriesRnLiveLeaderboard({
    selectedKey: selectedKey,
    selection: { view: 'team', scoreType: 'gross' },
    series: series,
    round: (series.rounds || []).filter(function (r) {
      return r.roundId === selectedKey;
    })[0],
    match: match,
    indexLink: indexLink
  });
  var teamRows = liveAdapter.applyPerRoundExpandFromLive(vm.teamRows, liveProjected, {
    series: series,
    roundId: selectedKey,
    matchId: match && match.matchId,
    match: match
  });
  return {
    vm: vm,
    liveProjected: liveProjected,
    teamRows: teamRows,
    liveTeams: teamLeaderboardView.buildGrossTeamLeaderboardView(
      match,
      teamLeaderboardHost.createStandaloneHost({})
    )
  };
}

function teamOf(rows, pid) {
  for (var i = 0; i < (rows || []).length; i++) {
    if (rows[i].teamId === pid) return rows[i];
  }
  return null;
}

function liveTeamOf(teams, id) {
  for (var i = 0; i < (teams || []).length; i++) {
    if (teams[i].teamId === id) return teams[i];
  }
  return null;
}

function expandSig(players) {
  return (players || [])
    .map(function (p) {
      return [p.entityId || p.playerId, p.scoreStr, p.thru, String(!!p.isEntity)].join('~');
    })
    .join('|');
}

var g1Series = makeSeries('个人比杆赛');
var g1 = overlayExpand(g1Series, 'r1', g1Match(), makeIndex('r1', 'm1'));
var g1Red = teamOf(g1.teamRows, 'team:red');
assert(
  '1 G1 展开仍为个人行',
  g1Red &&
    g1Red.players.length >= 2 &&
    g1Red.players.every(function (p) {
      return p.isEntity !== true && !!p.playerId;
    })
);

var g2Series = makeSeries('四人四球比杆赛');
var g2Match = comboMatch('四人四球比杆赛');
var g2 = overlayExpand(g2Series, 'r1', g2Match, makeIndex('r1', 'm1'));
var g2Red = teamOf(g2.teamRows, 'team:red');
assert('2 G2 每个正式组合只显示一行', g2Red && g2Red.players.length === 2);
assert(
  '2b G2 行是组合不是成员拆分',
  g2Red.players.every(function (p) {
    return p.entityId === 'e-red' || p.entityId === 'e-red-b';
  })
);

var g3Series = makeSeries('最佳球位比杆赛');
var g3 = overlayExpand(
  g3Series,
  'r1',
  comboMatch('最佳球位比杆赛'),
  makeIndex('r1', 'm1')
);
var g3Red = teamOf(g3.teamRows, 'team:red');
assert('3 G3 每个正式组合只显示一行', g3Red && g3Red.players.length === 2);

var g4Series = makeSeries('四人两球比杆赛');
var g4 = overlayExpand(
  g4Series,
  'r1',
  comboMatch('四人两球比杆赛'),
  makeIndex('r1', 'm1')
);
var g4Red = teamOf(g4.teamRows, 'team:red');
assert('4 G4 每个 pair 只显示一行', g4Red && g4Red.players.length === 2);
assert(
  '5 G2–G4 行 isEntity === true',
  g2Red.players.every(function (p) {
    return p.isEntity === true;
  }) &&
    g3Red.players.every(function (p) {
      return p.isEntity === true;
    }) &&
    g4Red.players.every(function (p) {
      return p.isEntity === true;
    })
);
assert(
  '6 G4 resultUnitType === pair',
  g4Red.players.every(function (p) {
    return p.resultUnitType === 'pair';
  })
);
assert(
  '7 同一组合两个成员不会生成两行',
  g2Red.players.filter(function (p) {
    return p.entityId === 'e-red';
  }).length === 1 && g2Red.players.length === 2
);
assert(
  '8 组合 memberUserIds 完整',
  g2Red.players.some(function (p) {
    return (
      p.entityId === 'e-red' &&
      Array.isArray(p.memberUserIds) &&
      p.memberUserIds.slice().sort().join(',') === 'u-r1,u-r2'
    );
  })
);

var liveG2Red = liveTeamOf(g2.liveTeams, 'red');
assert(
  '9 组合成绩、THRU 与普通单场 LIVE 榜完全一致',
  liveG2Red && expandSig(g2Red.players) === expandSig(liveG2Red.players)
);

var g2Unscored = overlayExpand(
  g2Series,
  'r1',
  comboMatch('四人四球比杆赛', 'finished', [
    { teamId: 'e-red', entityId: 'e-red', scores: fillScores(18, 4) },
    { teamId: 'e-red-b', entityId: 'e-red-b', scores: fillScores(0, 4) },
    { teamId: 'e-blue', entityId: 'e-blue', scores: fillScores(18, 3) }
  ]),
  makeIndex('r1', 'm1')
);
var unscoredCombo = teamOf(g2Unscored.teamRows, 'team:red').players.filter(function (p) {
  return p.entityId === 'e-red-b';
})[0];
assert(
  '10 未记分组合显示 -，不伪造 E/0',
  unscoredCombo &&
    unscoredCombo.scoreStr === '-' &&
    unscoredCombo.scoreStr !== 'E' &&
    unscoredCombo.scoreStr !== '0' &&
    (unscoredCombo.thru === '-' || !unscoredCombo.hasScore)
);

var groupedMatch = comboMatch('四人四球比杆赛', 'registering', [
  { teamId: 'e-red', entityId: 'e-red', scores: fillScores(0, 4) },
  { teamId: 'e-red-b', entityId: 'e-red-b', scores: fillScores(0, 4) },
  { teamId: 'e-blue', entityId: 'e-blue', scores: fillScores(0, 4) }
]);
var g2Pre = overlayExpand(g2Series, 'r1', groupedMatch, makeIndex('r1', 'm1'));
var g2PreRed = teamOf(g2Pre.teamRows, 'team:red');
assert(
  '11 已分组未开赛仍按组合占位',
  g2PreRed &&
    g2PreRed.players.length === 2 &&
    g2PreRed.players.every(function (p) {
      return p.isEntity === true && !!p.entityId;
    }) &&
    g2PreRed.expandStatusHint === 'TEEING OFF SOON'
);

var twoRoundSeries = makeSeries('四人四球比杆赛', [
  { roundId: 'r1', index: 1, matchId: 'm1', topN: 2, gameMode: '四人四球比杆赛' },
  { roundId: 'r2', index: 2, matchId: 'm2', topN: 2, gameMode: '四人四球比杆赛' }
]);
var r2Match = makeManagedMatch({
  matchId: 'm2',
  roundId: 'r2',
  status: 'finished',
  gameMode: '四人四球比杆赛',
  patch: comboMatch('四人四球比杆赛').groups
    ? {
        groups: [
          {
            groupId: 'gB',
            groupName: 'B组',
            players: [
              { userId: 'u-r1', position: 1 },
              { userId: 'u-r2', position: 2 },
              { userId: 'u-b1', position: 3 },
              { userId: 'u-b2', position: 4 }
            ]
          }
        ],
        scoreEntities: {
          gB: [
            {
              entityId: 'e-red-r2',
              entityType: 'team',
              compositionMode: '2+2',
              teamGroupId: 'red',
              members: ['u-r1', 'u-r2']
            },
            {
              entityId: 'e-blue-r2',
              entityType: 'team',
              compositionMode: '2+2',
              teamGroupId: 'blue',
              members: ['u-b1', 'u-b2']
            }
          ]
        },
        scoreData: {
          gB: {
            teamScoresByEntity: [
              { teamId: 'e-red-r2', entityId: 'e-red-r2', scores: fillScores(18, 4) },
              { teamId: 'e-blue-r2', entityId: 'e-blue-r2', scores: fillScores(18, 5) }
            ]
          }
        }
      }
    : {}
});
var store = { m1: g2Match, m2: r2Match };
var index = { m1: makeIndex('r1', 'm1'), m2: makeIndex('r2', 'm2') };
var assembled2 = seriesStandingsAssembler.buildStandingsResult({
  series: twoRoundSeries,
  getMatchById: function (id) {
    return store[id];
  },
  getIndexByMatchId: function (id) {
    return index[id];
  }
});
var states2 = [
  { roundId: 'r1', index: 1, label: 'R1', state: 'completed' },
  { roundId: 'r2', index: 2, label: 'R2', state: 'completed' }
];
var vm1 = standingsVm.buildSeriesStandingsViewModel({
  series: twoRoundSeries,
  selectedKey: 'r1',
  roundStates: states2,
  standingsResult: assembled2.standingsResult
});
var vm2 = standingsVm.buildSeriesStandingsViewModel({
  series: twoRoundSeries,
  selectedKey: 'r2',
  roundStates: states2,
  standingsResult: assembled2.standingsResult
});
var live1 = liveAdapter.projectSeriesRnLiveLeaderboard({
  selectedKey: 'r1',
  selection: { view: 'team', scoreType: 'gross' },
  series: twoRoundSeries,
  round: twoRoundSeries.rounds[0],
  match: store.m1,
  indexLink: index.m1
});
var live2 = liveAdapter.projectSeriesRnLiveLeaderboard({
  selectedKey: 'r2',
  selection: { view: 'team', scoreType: 'gross' },
  series: twoRoundSeries,
  round: twoRoundSeries.rounds[1],
  match: store.m2,
  indexLink: index.m2
});
var rows1 = liveAdapter.applyPerRoundExpandFromLive(vm1.teamRows, live1, {
  series: twoRoundSeries,
  roundId: 'r1',
  matchId: 'm1',
  match: store.m1
});
var rows2 = liveAdapter.applyPerRoundExpandFromLive(vm2.teamRows, live2, {
  series: twoRoundSeries,
  roundId: 'r2',
  matchId: 'm2',
  match: store.m2
});
assert(
  '12 R1/R2 组合不串轮',
  teamOf(rows1, 'team:red').players.every(function (p) {
    return p.roundId === 'r1' && p.stationMatchId === 'm1' && p.entityId.indexOf('r2') < 0;
  }) &&
    teamOf(rows2, 'team:red').players.every(function (p) {
      return p.roundId === 'r2' && p.stationMatchId === 'm2' && p.entityId === 'e-red-r2';
    })
);
assert(
  '13 切换 Rx 后 POS/TOTAL/球队顺序不变',
  standingsVm.cumulativeBoardSignature(vm1) === standingsVm.cumulativeBoardSignature(vm2)
);
assert(
  '14 Rx 主卡成绩不被共享展开投影覆盖',
  teamOf(rows1, 'team:red').scoreStr === vm1.teamRows[0].scoreStr &&
    teamOf(rows1, 'team:red').grossTotalDisplay === vm1.teamRows[0].grossTotalDisplay &&
    teamOf(rows1, 'team:red').pos === vm1.teamRows[0].pos
);

var combo = teamOf(rows1, 'team:red').players[0];
assert(
  '15 组合记分卡绑定正确 roundId + stationMatchId + entityId',
  combo &&
    combo.roundId === 'r1' &&
    combo.stationMatchId === 'm1' &&
    !!combo.entityId &&
    combo.playerId === '' &&
    combo.canOpenScorecard === true
);

var frozenBase = JSON.parse(JSON.stringify(vm1.teamRows));
var mergedAgain = liveAdapter.mergePerRoundExpandProjection(frozenBase, [
  {
    teamId: 'team:red',
    seriesParticipantId: 'team:red',
    players: [{ entityId: 'x', isEntity: true, memberUserIds: ['a', 'b'] }],
    scoringPlayersCount: 1
  }
]);
assert(
  '14b 合并不修改输入对象',
  JSON.stringify(frozenBase) === JSON.stringify(vm1.teamRows) &&
    mergedAgain[0].players[0].entityId === 'x' &&
    frozenBase[0].scoreStr === mergedAgain[0].scoreStr
);
assert(
  '14c 不按名称串队',
  liveAdapter.mergePerRoundExpandProjection(
    [{ teamId: 'team:blue', seriesParticipantId: 'team:blue', pos: '2', scoreStr: '-1', players: [{ name: '旧' }] }],
    [{ teamId: 'team:red', seriesParticipantId: 'team:red', players: [{ entityId: 'stolen' }] }]
  )[0].players.length === 0
);

assert(
  '16 球队视图强制 team/gross 展开；查看全部走 applyPerRoundNStandingsOverlay',
  /mode === 'per_round_n'/.test(pageJs) &&
    /view: 'team', scoreType: 'gross'/.test(pageJs) &&
    pageJs.indexOf('applyPerRoundNStandingsOverlay') >= 0 &&
    /useLiveLeaderboard:\s*false/.test(pageJs)
);
assert(
  '17 未新增组合拼装算法、复制榜单 DOM 或专属样式',
  adapterSrc.indexOf('mergePerRoundExpandProjection') >= 0 &&
    adapterSrc.indexOf('projectSeriesRnLiveLeaderboard') >= 0 &&
    pageJs.indexOf('computePerRoundTopN') < 0 &&
    vmSrc.indexOf('scoreEntities') < 0 &&
    (pageWxml.match(/class="leaderboard-table-wrap"/g) || []).length === 1 &&
    pageWxss.indexOf('per_round') < 0 &&
    pageWxss.indexOf('per-round') < 0
);

console.log('');
console.log(
  'seriesStandingsPerRoundNExpand.selftest: ' + passed + ' passed, ' + failed + ' failed'
);
if (failed) {
  console.log(failures.join('\n'));
  process.exitCode = 1;
}
