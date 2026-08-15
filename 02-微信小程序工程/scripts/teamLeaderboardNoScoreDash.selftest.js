/**
 * TEAM-LEADERBOARD-NO-SCORE-DASH
 * G2–G4 球队榜：无有效正式成绩时 TOTAL/TO PAR 显示 '-'；
 * 有 LIVE 有效成绩立即显示累计值。不改排名/选优算法。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/teamLeaderboardNoScoreDash.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var liveWxml = fs.readFileSync(
  path.join(mini, 'components', 'live-leaderboard-board', 'index.wxml'),
  'utf8'
);
var seriesWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');

var teamLeaderboardView = require(path.join(utilsDir, 'teamLeaderboardView.js'));
var teamLeaderboardHost = require(path.join(utilsDir, 'teamLeaderboardHost.js'));
var liveLeaderboardBoard = require(path.join(utilsDir, 'liveLeaderboardBoard.js'));
var adapter = require(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'));
var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));

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
    { userId: 'u-m1', nickname: '红一', gender: 'male', matchTeamId: 'red', matchTeamName: '红队' },
    { userId: 'u-m3', nickname: '红三', gender: 'male', matchTeamId: 'red', matchTeamName: '红队' },
    { userId: 'u-f1', nickname: '蓝女', gender: 'female', matchTeamId: 'blue', matchTeamName: '蓝队' },
    { userId: 'u-m2', nickname: '蓝二', gender: 'male', matchTeamId: 'blue', matchTeamName: '蓝队' }
  ];
}

function teamGroupsTwo() {
  return [
    { id: 'red', name: '红队' },
    { id: 'blue', name: '蓝队' }
  ];
}

function groupPlayers() {
  return [
    { userId: 'u-m1', competitionName: '红一', position: 1 },
    { userId: 'u-f1', competitionName: '蓝女', position: 2 },
    { userId: 'u-m2', competitionName: '蓝二', position: 4 },
    { userId: 'u-m3', competitionName: '红三', position: 5 }
  ];
}

function entitiesFor(mode) {
  var pair = mode === '四人两球比杆赛';
  return {
    g1: [
      {
        entityId: 'e-red',
        entityType: pair ? 'pair' : 'team',
        compositionMode: mode === '最佳球位比杆赛' ? '4+0' : '2+2',
        teamGroupId: 'red',
        members: ['u-m1', 'u-m3']
      },
      {
        entityId: 'e-blue',
        entityType: pair ? 'pair' : 'team',
        compositionMode: mode === '最佳球位比杆赛' ? '4+0' : '2+2',
        teamGroupId: 'blue',
        members: ['u-f1', 'u-m2']
      }
    ]
  };
}

function baseMatch(mode, scoreRows) {
  return {
    matchId: 'm-' + mode,
    matchType: 'inter-team',
    status: 'ongoing',
    gameMode: mode,
    courseName: '测试球场',
    front9Course: 'A',
    back9Course: 'B',
    teamGroups: teamGroupsTwo(),
    scoringRules: { teamCompetition: { enabled: true, topN: 2 } },
    registerInfo: { users: users() },
    groups: [{ groupId: 'g1', groupName: '第1组', players: groupPlayers() }],
    scoreEntities: entitiesFor(mode),
    scoreData: {
      g1: { teamScoresByEntity: scoreRows }
    },
    seriesContext: {
      managed: true,
      seriesId: 's-dash',
      roundId: 'r1',
      publishToken: 'tok'
    }
  };
}

function emptyScores() {
  return [
    { teamId: 'e-red', scores: [] },
    { teamId: 'e-blue', scores: [] }
  ];
}

function liveOneCombo() {
  return [
    { teamId: 'e-red', scores: fillScores(6, 4) },
    { teamId: 'e-blue', scores: [] }
  ];
}

function partialScores() {
  return [
    { teamId: 'e-red', scores: fillScores(9, 5) },
    { teamId: 'e-blue', scores: fillScores(3, 4) }
  ];
}

var MODES = [
  { key: 'G2', mode: '四人四球比杆赛' },
  { key: 'G3', mode: '最佳球位比杆赛' },
  { key: 'G4', mode: '四人两球比杆赛' }
];

function ordinaryTeams(match) {
  return teamLeaderboardView.buildGrossTeamLeaderboardView(
    match,
    teamLeaderboardHost.createStandaloneHost()
  ) || [];
}

function rnTeams(match) {
  var state = liveLeaderboardBoard.buildLiveLeaderboardState(match, { view: 'team' });
  return (state && state.teamLeaderboard) || [];
}

function managedInput(match) {
  return {
    selectedKey: 'r1',
    series: {
      seriesId: 's-dash',
      publishToken: 'tok',
      scoringRule: { mode: 'global_m', globalM: 2 },
      participants: [
        { seriesParticipantId: 'team:red', kind: 'team', sourceTeamId: 'red', nameSnapshot: '红队' },
        { seriesParticipantId: 'team:blue', kind: 'team', sourceTeamId: 'blue', nameSnapshot: '蓝队' }
      ],
      rounds: [
        { roundId: 'r1', index: 1, matchId: match.matchId, gameMode: match.gameMode }
      ]
    },
    round: { roundId: 'r1', matchId: match.matchId, gameMode: match.gameMode },
    match: match,
    indexLink: { seriesId: 's-dash', roundId: 'r1', matchId: match.matchId }
  };
}

function seriesRnTeams(match) {
  var projected = adapter.projectSeriesStandingsTeamBoard(managedInput(match));
  return (projected && projected.overlay && projected.overlay.teamRows) || [];
}

function seriesTotTeams(match) {
  var input = managedInput(match);
  input.selectedKey = 'cumulative';
  input.getMatchById = function () {
    return match;
  };
  input.getIndexByMatchId = function () {
    return input.indexLink;
  };
  var projected = adapter.projectSeriesStandingsTeamBoard(input);
  return projected;
}

function displayOf(teams) {
  return (Array.isArray(teams) ? teams : [])
    .slice()
    .sort(function (a, b) {
      return String(a.teamName || '').localeCompare(String(b.teamName || ''));
    })
    .map(function (t) {
      return [
        String(t.teamName || ''),
        String(!!t.hasScore),
        String(t.grossTotal),
        String(t.grossTotalDisplay),
        String(t.scoreStr),
        String(t.scoringPlayersCount)
      ].join('|');
    })
    .join(';;');
}

function byName(teams, name) {
  var list = Array.isArray(teams) ? teams : [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].teamName === name) return list[i];
  }
  return null;
}

assert(
  '共享组件 TOTAL 用展示字段，不裸渲染 grossTotal',
  liveWxml.indexOf('{{team.grossTotalDisplay}}') >= 0 &&
    liveWxml.indexOf('{{team.grossTotal}}') < 0 &&
    liveWxml.indexOf('{{team.scoreStr}}') >= 0
);

assert(
  'TOT 球队卡 TOTAL 用同一展示字段',
  seriesWxml.indexOf('{{team.grossTotalDisplay}}') >= 0 &&
    seriesWxml.indexOf('{{team.grossTotal}}') < 0
);

assert(
  'formatGrossTotalDisplay：无成绩为 -，有成绩为数字串',
  teamLeaderboardView.formatGrossTotalDisplay(false, 0) === '-' &&
    teamLeaderboardView.formatGrossTotalDisplay(true, 36) === '36' &&
    teamLeaderboardView.formatGrossTotalDisplay(true, 0) === '0'
);

MODES.forEach(function (item) {
  var emptyMatch = baseMatch(item.mode, emptyScores());
  var emptyOrd = ordinaryTeams(emptyMatch);
  var emptyRn = rnTeams(emptyMatch);
  var emptySeriesRn = seriesRnTeams(emptyMatch);

  assert(
    item.key + ' 全部未记分：TOTAL/TO PAR 均为 -，numeric 仍保留',
    emptyOrd.length === 2 &&
      emptyOrd.every(function (t) {
        return (
          t.hasScore === false &&
          t.grossTotalDisplay === '-' &&
          t.scoreStr === '-' &&
          Number(t.grossTotal) === 0 &&
          Number(t.toPar) === 0
        );
      })
  );

  assert(
    item.key + ' 普通单场 === Series Rn 展示',
    displayOf(emptyOrd) === displayOf(emptyRn) &&
      displayOf(emptyOrd) === displayOf(emptySeriesRn)
  );

  var liveMatch = baseMatch(item.mode, liveOneCombo());
  var liveOrd = ordinaryTeams(liveMatch);
  var redLive = byName(liveOrd, '红队');
  var blueLive = byName(liveOrd, '蓝队');
  assert(
    item.key + ' LIVE 一个有效组合立即显示真实累计，未记分队仍为 -',
    redLive &&
      redLive.hasScore === true &&
      redLive.grossTotalDisplay !== '-' &&
      redLive.scoreStr !== '-' &&
      String(redLive.grossTotalDisplay) === String(redLive.grossTotal) &&
      blueLive &&
      blueLive.hasScore === false &&
      blueLive.grossTotalDisplay === '-' &&
      blueLive.scoreStr === '-'
  );
  assert(
    item.key + ' LIVE 普通单场 === Rn',
    displayOf(liveOrd) === displayOf(rnTeams(liveMatch)) &&
      displayOf(liveOrd) === displayOf(seriesRnTeams(liveMatch))
  );

  var partMatch = baseMatch(item.mode, partialScores());
  var partOrd = ordinaryTeams(partMatch);
  var redPart = byName(partOrd, '红队');
  var bluePart = byName(partOrd, '蓝队');
  assert(
    item.key + ' 部分记分：已有有效成绩累计上屏',
    redPart &&
      redPart.hasScore === true &&
      redPart.grossTotalDisplay !== '-' &&
      bluePart &&
      bluePart.hasScore === true &&
      bluePart.grossTotalDisplay !== '-'
  );

  var cleared = baseMatch(item.mode, emptyScores());
  var clearedOrd = ordinaryTeams(cleared);
  assert(
    item.key + ' 清空最后一个有效成绩后恢复 -',
    clearedOrd.every(function (t) {
      return t.grossTotalDisplay === '-' && t.scoreStr === '-';
    }) &&
      displayOf(clearedOrd) === displayOf(emptyOrd)
  );

  if (item.key !== 'G4') {
    var totProj = seriesTotTeams(emptyMatch);
    var totRows =
      totProj && totProj.overlay && totProj.overlay.teamRows ? totProj.overlay.teamRows : [];
    assert(
      item.key + ' TOT 全部未记分为 -，且与普通单场展示一致',
      totProj &&
        totProj.calledShared === true &&
        totRows.length === 2 &&
        totRows.every(function (t) {
          return t.grossTotalDisplay === '-' && t.scoreStr === '-';
        }) &&
        displayOf(totRows) === displayOf(emptyOrd)
    );

    var totLive = seriesTotTeams(liveMatch);
    var totLiveRows =
      totLive && totLive.overlay && totLive.overlay.teamRows ? totLive.overlay.teamRows : [];
    var totRed = byName(totLiveRows, '红队');
    var totBlue = byName(totLiveRows, '蓝队');
    assert(
      item.key + ' TOT LIVE 一个有效组合显示真实值',
      totRed &&
        totRed.grossTotalDisplay === redLive.grossTotalDisplay &&
        totRed.scoreStr === redLive.scoreStr &&
        totBlue &&
        totBlue.grossTotalDisplay === '-' &&
        totBlue.scoreStr === '-'
    );
  }
});

var g2TwoCombos = baseMatch('四人四球比杆赛', [
  { teamId: 'e-red', scores: fillScores(8, 4) },
  { teamId: 'e-blue', scores: [] }
]);
g2TwoCombos.scoreEntities = {
  g1: [
    {
      entityId: 'e-red-a',
      entityType: 'team',
      compositionMode: '2+2',
      teamGroupId: 'red',
      members: ['u-m1', 'u-m3']
    },
    {
      entityId: 'e-red-b',
      entityType: 'team',
      compositionMode: '2+2',
      teamGroupId: 'red',
      members: ['u-m1', 'u-m3']
    },
    {
      entityId: 'e-blue',
      entityType: 'team',
      compositionMode: '2+2',
      teamGroupId: 'blue',
      members: ['u-f1', 'u-m2']
    }
  ]
};
g2TwoCombos.scoreData = {
  g1: {
    teamScoresByEntity: [
      { teamId: 'e-red-a', scores: fillScores(8, 4) },
      { teamId: 'e-red-b', scores: [] },
      { teamId: 'e-blue', scores: [] }
    ]
  }
};
g2TwoCombos.scoringRules = { teamCompetition: { enabled: true, topN: 2 } };
var g2Sel = ordinaryTeams(g2TwoCombos);
var redSel = byName(g2Sel, '红队');
assert(
  '无成绩组合不计入 global M / topN',
  redSel &&
    redSel.hasScore === true &&
    redSel.scoringPlayersCount === 1 &&
    redSel.players.some(function (p) {
      return p.hasScore !== true && p.isCounting !== true && p.scoreStr === '-';
    }) &&
    redSel.players.filter(function (p) {
      return p.isCounting === true;
    }).length === 1
);

var totVmEmpty = standingsVm.buildSeriesStandingsViewModel({
  series: {
    seriesId: 's1',
    scoringRule: { mode: 'global_m' },
    participants: [
      { seriesParticipantId: 'team:a', nameSnapshot: '甲队' },
      { seriesParticipantId: 'team:b', nameSnapshot: '乙队' }
    ]
  },
  selectedKey: 'cumulative',
  roundStates: [{ roundId: 'r1', index: 1, label: 'R1', statusToken: 'live' }],
  standingsResult: standingsVm.emptyStandingsResult()
});
assert(
  'G1/G4 TOT 空成绩也写 grossTotalDisplay=-',
  totVmEmpty.teamRows.every(function (r) {
    return r.grossTotalDisplay === '-' && r.scoreStr === '-' && r.grossTotal === '-';
  })
);

if (failures.length) {
  console.log('');
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
}
console.log('');
console.log('teamLeaderboardNoScoreDash.selftest: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
