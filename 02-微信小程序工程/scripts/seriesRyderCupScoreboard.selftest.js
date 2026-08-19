/**
 * 莱德杯得分累计 + 轮次选择（纯函数）
 * 运行：node scripts/seriesRyderCupScoreboard.selftest.js
 */

var path = require('path');
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');
var matchPlayTeamScore = require(path.join(utilsDir, 'matchPlayTeamScore.js'));
var adapter = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail',
  'seriesRyderCupScoreboardAdapter.js'
));
var seriesRyderCup = require(path.join(utilsDir, 'seriesRyderCup.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));

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

function holeScores(aWinsFirst) {
  var a = [];
  var b = [];
  for (var i = 0; i < 18; i++) {
    if (i === 0) {
      a[i] = aWinsFirst ? 3 : 5;
      b[i] = aWinsFirst ? 5 : 3;
    } else {
      a[i] = '';
      b[i] = '';
    }
  }
  return { a: a, b: b };
}

function g5Match(over) {
  var scores = over.scores || holeScores(true);
  var teamA = 'red';
  var teamB = 'blue';
  var g1 = over.g1 || 'g1';
  var g2 = over.g2;
  var groups = [
    {
      groupId: g1,
      players: [
        { userId: 'pA1', position: 1 },
        { userId: 'pB1', position: 2 }
      ]
    }
  ];
  var scoreData = {};
  scoreData[g1] = {
    scoresByPlayer: {
      pA1: { scores: scores.a.slice() },
      pB1: { scores: scores.b.slice() }
    }
  };
  if (g2) {
    groups.push({
      groupId: g2,
      players: [
        { userId: 'pA2', position: 1 },
        { userId: 'pB2', position: 2 }
      ]
    });
    var s2 = over.scores2 || scores;
    scoreData[g2] = {
      scoresByPlayer: {
        pA2: { scores: s2.a.slice() },
        pB2: { scores: s2.b.slice() }
      }
    };
  }
  return Object.assign(
    {
      matchId: over.matchId || 'm1',
      gameMode: '个人比洞赛',
      matchType: 'inter-team',
      teamGroups: [
        { id: teamA, name: '红队', sourceTeamLogo: 'logo-a' },
        { id: teamB, name: '蓝队', sourceTeamLogo: 'logo-b' }
      ],
      groups: groups,
      registerInfo: {
        users: [
          { userId: 'pA1', matchTeamId: teamA },
          { userId: 'pB1', matchTeamId: teamB },
          { userId: 'pA2', matchTeamId: teamA },
          { userId: 'pB2', matchTeamId: teamB }
        ]
      },
      scoreData: scoreData,
      seriesContext: over.seriesContext || {
        seriesId: 's1',
        roundId: 'r1',
        matchId: over.matchId || 'm1'
      }
    },
    over.extra || {}
  );
}

function emptyScores() {
  var a = [];
  var b = [];
  for (var i = 0; i < 18; i++) {
    a[i] = '';
    b[i] = '';
  }
  return { a: a, b: b };
}

function tieScores() {
  var a = [];
  var b = [];
  for (var i = 0; i < 18; i++) {
    a[i] = i === 0 ? 4 : '';
    b[i] = i === 0 ? 4 : '';
  }
  return { a: a, b: b };
}

assert('无成绩组 0-0', (function () {
  var s = matchPlayTeamScore.buildMatchPlayTeamScoreSummary(
    g5Match({ scores: emptyScores(), g2: 'g2', scores2: emptyScores() })
  );
  return s.redScore === 0 && s.blueScore === 0;
})());

assert('红胜一组+平一组 = 1.5-0.5', (function () {
  var s = matchPlayTeamScore.buildMatchPlayTeamScoreSummary(
    g5Match({
      scores: holeScores(true),
      g2: 'g2',
      scores2: tieScores()
    })
  );
  return s.redScore === 1.5 && s.blueScore === 0.5;
})());

assert('进行中按当前领先计分', (function () {
  var s = matchPlayTeamScore.buildMatchPlayTeamScoreSummary(g5Match({ scores: holeScores(false) }));
  return s.redScore === 0 && s.blueScore === 1;
})());

assert('无双方有效洞不计分', (function () {
  var oneSide = emptyScores();
  oneSide.a[0] = 3;
  var s = matchPlayTeamScore.buildMatchPlayTeamScoreSummary(g5Match({ scores: oneSide }));
  return s.redScore === 0 && s.blueScore === 0;
})());

assert('平局各 0.5', (function () {
  var s = matchPlayTeamScore.buildMatchPlayTeamScoreSummary(g5Match({ scores: tieScores() }));
  return s.redScore === 0.5 && s.blueScore === 0.5;
})());

function seriesFixture(matchesByRound, roundsMeta) {
  var rounds = roundsMeta || [
    { roundId: 'r1', matchId: 'm1', roundStatus: 'scheduled' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'scheduled' }
  ];
  var series = {
    seriesId: 's1',
    seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
    publishToken: 'tok',
    hostMode: 'organization',
    participants: [
      { kind: 'team', seriesParticipantId: 'team:a', sourceTeamId: 'red', nameSnapshot: '红队', logoSnapshot: 'la' },
      { kind: 'team', seriesParticipantId: 'team:b', sourceTeamId: 'blue', nameSnapshot: '蓝队', logoSnapshot: 'lb' }
    ],
    rounds: rounds,
    scoringRule: seriesRyderCup.createRyderCupScoringRule()
  };
  var store = matchesByRound;
  return {
    series: series,
    deps: {
      getMatchById: function (id) {
        return store[id] || null;
      },
      evaluateRoundStationGate: function (s, round) {
        var m = store[round.matchId];
        if (!m) return { canEnterRound: false, blockReason: 'match_missing', match: null, matchId: round.matchId };
        var ctx = m.seriesContext || {};
        if (String(ctx.seriesId) !== 's1' || String(ctx.roundId) !== String(round.roundId)) {
          return { canEnterRound: false, blockReason: 'context_round_id_conflict', match: m, matchId: round.matchId };
        }
        if (!seriesStationMatch.isSeriesManagedMatch) {
          return { canEnterRound: true, match: m, matchId: round.matchId, blockReason: '' };
        }
        return { canEnterRound: true, match: m, matchId: round.matchId, blockReason: '' };
      }
    }
  };
}

var m1 = g5Match({
  matchId: 'm1',
  scores: holeScores(true),
  g2: 'g2',
  scores2: tieScores(),
  extra: {},
  seriesContext: { seriesId: 's1', roundId: 'r1', matchId: 'm1' }
});
var m2 = g5Match({
  matchId: 'm2',
  g1: 'g-r2-1',
  scores: holeScores(false),
  g2: 'g2b',
  scores2: holeScores(false),
  seriesContext: { seriesId: 's1', roundId: 'r2', matchId: 'm2' }
});

assert('R1 1.5-0.5 后 R2 蓝胜两组累计 1.5-2.5', (function () {
  var fx = seriesFixture({ m1: m1, m2: m2 });
  var tot = adapter.accumulateSeriesMatchPlayScores(fx.series, fx.deps);
  return tot.redScore === 1.5 && tot.blueScore === 2.5;
})());

assert('取消轮次不计入', (function () {
  var fx = seriesFixture(
    { m1: m1, m2: m2 },
    [
      { roundId: 'r1', matchId: 'm1', roundStatus: 'scheduled' },
      { roundId: 'r2', matchId: 'm2', roundStatus: 'cancelled' }
    ]
  );
  var tot = adapter.accumulateSeriesMatchPlayScores(fx.series, fx.deps);
  return tot.redScore === 1.5 && tot.blueScore === 0.5;
})());

assert('station 缺失不猜分', (function () {
  var fx = seriesFixture({ m1: m1 });
  var tot = adapter.accumulateSeriesMatchPlayScores(fx.series, fx.deps);
  return tot.redScore === 1.5 && tot.blueScore === 0.5 && tot.traces[1].reason === 'match_missing';
})());

assert('身份冲突不猜分', (function () {
  var bad = g5Match({
    matchId: 'm2',
    scores: holeScores(false),
    seriesContext: { seriesId: 'other', roundId: 'r2', matchId: 'm2' }
  });
  var fx = seriesFixture({ m1: m1, m2: bad });
  var tot = adapter.accumulateSeriesMatchPlayScores(fx.series, fx.deps);
  return tot.redScore === 1.5 && tot.blueScore === 0.5 && tot.traces[1].reason === 'context_round_id_conflict';
})());

var roundStates = [
  { roundId: 'r1', index: 1, label: 'R1', state: 'grouped' },
  { roundId: 'r2', index: 2, label: 'R2', state: 'grouped' }
];

assert('无总比分选择项', (function () {
  var fx = seriesFixture({ m1: m1, m2: m2 });
  var view = adapter.buildRyderCupStandingsView({
    series: fx.series,
    selectedKey: 'r1',
    roundStates: roundStates,
    userPicked: true,
    visited: true,
    deps: fx.deps
  });
  return view.showTot === false && !view.totalSelector;
})());

assert('Rx 切换不改累计分', (function () {
  var fx = seriesFixture({ m1: m1, m2: m2 });
  var v1 = adapter.buildRyderCupStandingsView({
    series: fx.series,
    selectedKey: 'r1',
    roundStates: roundStates,
    userPicked: true,
    visited: true,
    deps: fx.deps
  });
  var v2 = adapter.buildRyderCupStandingsView({
    series: fx.series,
    selectedKey: 'r2',
    roundStates: roundStates,
    userPicked: true,
    visited: true,
    deps: fx.deps
  });
  return (
    v1.seriesRedScore === v2.seriesRedScore &&
    v1.seriesBlueScore === v2.seriesBlueScore &&
    v1.seriesRedScore === 1.5 &&
    v1.seriesBlueScore === 2.5 &&
    v1.selectedKey === 'r1' &&
    v2.selectedKey === 'r2'
  );
})());

assert('Rx 只改下方对阵卡', (function () {
  var fx = seriesFixture({ m1: m1, m2: m2 });
  var v1 = adapter.buildRyderCupStandingsView({
    series: fx.series,
    selectedKey: 'r1',
    roundStates: roundStates,
    userPicked: true,
    visited: true,
    deps: fx.deps
  });
  var v2 = adapter.buildRyderCupStandingsView({
    series: fx.series,
    selectedKey: 'r2',
    roundStates: roundStates,
    userPicked: true,
    visited: true,
    deps: fx.deps
  });
  var id1 = v1.matchPlayScoreboard.matches[0] && v1.matchPlayScoreboard.matches[0].id;
  var id2 = v2.matchPlayScoreboard.matches[0] && v2.matchPlayScoreboard.matches[0].id;
  return id1 === 'g1' && id2 !== id1;
})());

assert('同分保持相同分值文案', matchPlayTeamScore.formatMatchPlayTeamScore(1.5) === '1.5');
assert('选择身份是 roundId', (function () {
  var fx = seriesFixture({ m1: m1, m2: m2 });
  var view = adapter.buildRyderCupStandingsView({
    series: fx.series,
    selectedKey: 'r2',
    roundStates: roundStates,
    userPicked: true,
    visited: true,
    deps: fx.deps
  });
  return view.roundSelectorItems[0].key === 'r1' && view.roundSelectorItems[1].key === 'r2';
})());

if (failed) {
  console.log('\nFAILED ' + failed);
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
  process.exit(1);
}
console.log('\nAll ' + passed + ' passed');
