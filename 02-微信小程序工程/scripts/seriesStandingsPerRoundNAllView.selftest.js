/**
 * per_round_n「查看全部」：当前 Rx 全量计分单元 LIVE 榜，不按 Top N 截断。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsPerRoundNAllView.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');

var liveLeaderboardBoard = require(path.join(utilsDir, 'liveLeaderboardBoard.js'));
var personalLeaderboardBoard = require(path.join(utilsDir, 'personalLeaderboardBoard.js'));
var teamLeaderboardHost = require(path.join(utilsDir, 'teamLeaderboardHost.js'));
var liveAdapter = require(path.join(seriesDir, 'seriesLiveLeaderboardAdapter.js'));
var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));
var seriesStandingsAssembler = require(path.join(utilsDir, 'seriesStandingsAssembler.js'));

var pageJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');
var adapterSrc = fs.readFileSync(path.join(seriesDir, 'seriesLiveLeaderboardAdapter.js'), 'utf8');

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

function makeSeries(gameMode, rounds) {
  return {
    seriesId: 'series-prn-all',
    publishToken: 'pub-prn-all',
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
        nameSnapshot: '红队'
      },
      {
        seriesParticipantId: 'team:blue',
        kind: 'team',
        sourceTeamId: 'blue',
        nameSnapshot: '蓝队'
      }
    ],
    rounds: rounds || [
      {
        roundId: 'r1',
        index: 1,
        matchId: 'm1',
        topN: 1,
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
      teamGroups: [
        { id: 'red', name: '红队' },
        { id: 'blue', name: '蓝队' }
      ],
      scoringRules: { teamCompetition: { enabled: true, topN: 1 } },
      seriesContext: {
        managed: true,
        seriesId: 'series-prn-all',
        roundId: o.roundId || 'r1',
        publishToken: 'pub-prn-all'
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

function indexLink(roundId, matchId) {
  return {
    seriesId: 'series-prn-all',
    roundId: roundId,
    matchId: matchId,
    publishToken: 'pub-prn-all'
  };
}

function g1Match(roundId, matchId) {
  return makeManagedMatch({
    matchId: matchId || 'm1',
    roundId: roundId || 'r1',
    gameMode: '个人比杆赛',
    patch: {
      matchId: matchId || 'm1',
      seriesContext: {
        managed: true,
        seriesId: 'series-prn-all',
        roundId: roundId || 'r1',
        publishToken: 'pub-prn-all'
      },
      groups: [
        {
          groupId: 'g1',
          players: [
            { userId: 'u-r1', position: 1, competitionName: '红一', gender: 'male', matchTeamId: 'red' },
            { userId: 'u-r2', position: 2, competitionName: '红二', gender: 'male', matchTeamId: 'red' },
            { userId: 'u-b1', position: 3, competitionName: '蓝一', gender: 'female', matchTeamId: 'blue' }
          ]
        }
      ],
      scoreData: {
        g1: {
          scoresByPlayer: {
            'u-r1': { scores: fillScores(18, 4) },
            'u-r2': { scores: fillScores(18, 6) },
            'u-b1': { scores: fillScores(18, 3) }
          }
        }
      }
    }
  });
}

function comboMatch(gameMode, roundId, matchId) {
  var entityType = gameMode === '四人两球比杆赛' ? 'pair' : 'team';
  var entities = [
    {
      entityId: 'e-red',
      entityType: entityType,
      teamGroupId: 'red',
      members: ['u-r1', 'u-r2']
    },
    {
      entityId: 'e-red-b',
      entityType: entityType,
      teamGroupId: 'red',
      members: ['u-r3', 'u-r4']
    },
    {
      entityId: 'e-blue',
      entityType: entityType,
      teamGroupId: 'blue',
      members: ['u-b1', 'u-b2']
    }
  ];
  var patch = {
    matchId: matchId || 'm1',
    seriesContext: {
      managed: true,
      seriesId: 'series-prn-all',
      roundId: roundId || 'r1',
      publishToken: 'pub-prn-all'
    },
    groups: [
      {
        groupId: 'gA',
        players: [
          { userId: 'u-r1', position: 1, matchTeamId: 'red' },
          { userId: 'u-r2', position: 2, matchTeamId: 'red' },
          { userId: 'u-r3', position: 3, matchTeamId: 'red' },
          { userId: 'u-r4', position: 4, matchTeamId: 'red' },
          { userId: 'u-b1', position: 5, matchTeamId: 'blue' },
          { userId: 'u-b2', position: 6, matchTeamId: 'blue' }
        ]
      }
    ],
    scoreEntities: { gA: entities },
    scoreData: {
      gA: {
        teamScoresByEntity: [
          { teamId: 'e-red', entityId: 'e-red', scores: fillScores(18, 4) },
          { teamId: 'e-red-b', entityId: 'e-red-b', scores: fillScores(18, 8) },
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
    matchId: matchId || 'm1',
    roundId: roundId || 'r1',
    gameMode: gameMode,
    patch: patch
  });
}

function projectAll(series, selectedKey, match, link) {
  var round = null;
  var rounds = series.rounds || [];
  for (var i = 0; i < rounds.length; i++) {
    if (rounds[i] && rounds[i].roundId === selectedKey) {
      round = rounds[i];
      break;
    }
  }
  return liveAdapter.projectSeriesRnLiveLeaderboard({
    selectedKey: selectedKey,
    selection: { view: 'all', scoreType: 'gross' },
    series: series,
    round: round,
    match: match,
    indexLink: link
  });
}

function cumulativeVm(series, selectedKey, match, link) {
  var assembled = seriesStandingsAssembler.buildStandingsResult({
    series: series,
    getMatchById: function () {
      return match;
    },
    getIndexByMatchId: function () {
      return link;
    }
  });
  return standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: selectedKey,
    roundStates: (series.rounds || []).map(function (r, i) {
      return {
        roundId: r.roundId,
        index: r.index || i + 1,
        label: 'R' + (r.index || i + 1),
        state: 'completed'
      };
    }),
    standingsResult: assembled.standingsResult
  });
}

function signature(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(function (r) {
      return [
        r.seriesParticipantId || r.teamId,
        r.pos,
        r.scoreStr,
        r.roundScoreStr,
        r.rank
      ].join('|');
    })
    .join(';;');
}

(function testG1AllPlayers() {
  var series = makeSeries('个人比杆赛');
  var match = g1Match('r1', 'm1');
  var link = indexLink('r1', 'm1');
  var projected = projectAll(series, 'r1', match, link);
  var rows = (projected.overlay && projected.overlay.liveLeaderboard) || [];
  var shared = liveLeaderboardBoard.buildLiveLeaderboardState(match, {
    view: 'all',
    scoreType: 'gross',
    host: teamLeaderboardHost.createStandaloneHost()
  });
  assert('G1 查看全部走共享 LIVE', projected.calledShared === true && projected.verifiedOk === true);
  assert(
    'G1＝所有个人',
    rows.length === 3 &&
      rows.every(function (r) {
        return r.isEntity !== true && !!(r.playerId || r.userId);
      })
  );
  assert(
    'G1 未入选 Top N 仍可见',
    rows.some(function (r) {
      return String(r.playerId || r.userId) === 'u-r2';
    }) && rows.length > 1
  );
  assert(
    'G1 与普通单场 LIVE 同一份行',
    JSON.stringify(rows) === JSON.stringify(shared.leaderboard)
  );
})();

(function testComboAllViews() {
  var modes = [
    ['四人四球比杆赛', 'G2'],
    ['最佳球位比杆赛', 'G3'],
    ['四人两球比杆赛', 'G4']
  ];
  modes.forEach(function (pair) {
    var series = makeSeries(pair[0]);
    var match = comboMatch(pair[0], 'r1', 'm1');
    var projected = projectAll(series, 'r1', match, indexLink('r1', 'm1'));
    var rows = (projected.overlay && projected.overlay.liveLeaderboard) || [];
    var shared = liveLeaderboardBoard.buildLiveLeaderboardState(match, {
      view: 'all',
      scoreType: 'gross',
      host: teamLeaderboardHost.createStandaloneHost()
    });
    var ids = rows
      .map(function (r) {
        return String(r.entityId || '');
      })
      .sort()
      .join(',');
    assert(
      pair[1] + '＝全部组合/Pair 且不拆成员行',
      projected.calledShared === true &&
        rows.length === 3 &&
        rows.every(function (r) {
          return r.isEntity === true && !r.playerId;
        }) &&
        ids === 'e-blue,e-red,e-red-b'
    );
    assert(
      pair[1] + ' 未入选 Top N 的组合仍可见',
      rows.some(function (r) {
        return r.entityId === 'e-red-b';
      })
    );
    assert(
      pair[1] + ' 与共享 LIVE 同行',
      JSON.stringify(rows) === JSON.stringify(shared.leaderboard)
    );
    if (pair[1] === 'G2') {
      assert(
        'G2 由 entity classifier 决定，页面不自行拼组合',
        personalLeaderboardBoard.shouldBuildEntityLeaderboard(match) === true &&
          adapterSrc.indexOf('scoreEntities') < 0
      );
    }
  });
})();

(function testNoCrossRound() {
  var series = makeSeries('个人比杆赛', [
    { roundId: 'r1', index: 1, matchId: 'm1', topN: 1, gameMode: '个人比杆赛' },
    { roundId: 'r2', index: 2, matchId: 'm2', topN: 1, gameMode: '个人比杆赛' }
  ]);
  var m1 = g1Match('r1', 'm1');
  var m2 = g1Match('r2', 'm2');
  m2.scoreData.g1.scoresByPlayer['u-r1'].scores = fillScores(18, 9);
  var p1 = projectAll(series, 'r1', m1, indexLink('r1', 'm1'));
  var p2 = projectAll(series, 'r2', m2, indexLink('r2', 'm2'));
  var rows1 = (p1.overlay && p1.overlay.liveLeaderboard) || [];
  var rows2 = (p2.overlay && p2.overlay.liveLeaderboard) || [];
  assert(
    'R1/R2 不串轮',
    rows1.every(function (r) {
      return !r.matchId || r.matchId === 'm1';
    }) &&
      rows2.every(function (r) {
        return !r.matchId || r.matchId === 'm2';
      }) &&
      JSON.stringify(rows1) !== JSON.stringify(rows2)
  );
  assert(
    '只传入当前 selectedKey 的 round/match/indexLink',
    /_resolveStandingsRoundContext\(selectedKey\)/.test(pageJs) &&
      /projectSeriesRnLiveLeaderboard\(\{[\s\S]*?selectedKey: selectedKey[\s\S]*?round: perRoundCtx\.round[\s\S]*?match: perRoundCtx\.match[\s\S]*?indexLink: perRoundCtx\.indexLink/.test(
        pageJs
      )
  );
})();

(function testSwitchBackKeepsTeamCard() {
  var series = makeSeries('个人比杆赛');
  var match = g1Match('r1', 'm1');
  var link = indexLink('r1', 'm1');
  var vm = cumulativeVm(series, 'r1', match, link);
  var frozen = signature(vm.teamRows);
  var liveAll = projectAll(series, 'r1', match, link);
  var allBoard = liveAdapter.applyPerRoundNStandingsOverlay(
    vm,
    { view: 'all', scoreType: 'gross' },
    liveAll,
    { roundHeadline: 'R1', roundId: 'r1', match: match, series: series }
  );
  assert(
    '查看全部切到 LIVE 全量榜且保留累计 teamRows',
    allBoard.useLiveLeaderboard === true &&
      Array.isArray(allBoard.liveLeaderboard) &&
      allBoard.liveLeaderboard.length === 3 &&
      signature(allBoard.teamRows) === frozen
  );
  var liveTeam = liveAdapter.projectSeriesRnLiveLeaderboard({
    selectedKey: 'r1',
    selection: { view: 'team', scoreType: 'gross' },
    series: series,
    round: series.rounds[0],
    match: match,
    indexLink: link
  });
  var back = liveAdapter.applyPerRoundNStandingsOverlay(
    vm,
    { view: 'team', scoreType: 'gross' },
    liveTeam,
    { roundId: 'r1', match: match, series: series, matchId: 'm1' }
  );
  assert(
    '切回球队恢复累计 POS/TOTAL/Rx 且顺序不变',
    back.useLiveLeaderboard === false &&
      back.showTeamBoard === true &&
      signature(back.teamRows) === frozen
  );
})();

assert(
  '页面复用 live-leaderboard-board 且记忆 _standingsSelectionByRoundId',
  pageWxml.indexOf('<live-leaderboard-board') >= 0 &&
    pageJs.indexOf('_standingsSelectionByRoundId') >= 0 &&
    pageJs.indexOf('applyPerRoundNStandingsOverlay') >= 0 &&
    /if \(vm\.mode === 'per_round_n'\) \{[\s\S]*?applyPerRoundNStandingsOverlay/.test(pageJs)
);

assert(
  'global_m TOT 路径仍独立且在 per_round_n 分支之后',
  /if \(vm\.mode === 'per_round_n'\) \{[\s\S]*?if \(selectedKey === standingsViewModel\.CUMULATIVE_KEY\) \{[\s\S]*?projectSeriesStandingsTeamBoard/.test(
    pageJs
  )
);

assert(
  '查看全部不按 Top N 截断',
  adapterSrc.indexOf('applyPerRoundNStandingsOverlay') >= 0 &&
    !/applyPerRoundNStandingsOverlay[\s\S]{0,800}topN/.test(adapterSrc) &&
    pageJs.indexOf('computePerRoundTopN') < 0
);

console.log('');
console.log(
  'seriesStandingsPerRoundNAllView.selftest: ' + passed + ' passed, ' + failed + ' failed'
);
if (failed) {
  console.log(failures.join('\n'));
  process.exitCode = 1;
}
