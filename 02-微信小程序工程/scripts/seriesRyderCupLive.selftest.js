/**
 * 莱德杯第二批：LIVE / 完成锁 / 广场投影
 * 运行：node scripts/seriesRyderCupLive.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

if (typeof global.wx === 'undefined') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    removeStorageSync: function () {},
    showToast: function () {}
  };
}

var root = path.join(__dirname, '..');
var utilsDir = path.join(root, 'miniprogram', 'utils');
var seriesDir = path.join(root, 'miniprogram', 'subpackages', 'tournament', 'pages', 'series-detail');

var seriesRyderCup = require(path.join(utilsDir, 'seriesRyderCup.js'));
var accumulate = require(path.join(utilsDir, 'seriesRyderCupAccumulate.js'));
var adapter = require(path.join(seriesDir, 'seriesRyderCupScoreboardAdapter.js'));
var matchPlayTeamScore = require(path.join(utilsDir, 'matchPlayTeamScore.js'));
var matchPlayScoreboardView = require(seriesTestPaths.util('matchPlayScoreboardView.js'));
var listAdapter = require(path.join(utilsDir, 'seriesListCardAdapter.js'));
var teamMatchFinish = require(path.join(utilsDir, 'teamMatchFinish.js'));
var scoreGroupFinish = require(seriesTestPaths.util('scoreGroupFinish.js'));
var seriesFinalize = require(path.join(utilsDir, 'seriesFinalize.js'));
var seriesFinishLock = require(path.join(utilsDir, 'seriesFinishLock.js'));
var seriesRoundPhaseAggregate = require(path.join(utilsDir, 'seriesRoundPhaseAggregate.js'));
var seriesDetailViewModel = require(path.join(seriesDir, 'seriesDetailViewModel.js'));
var enterScore = require(seriesTestPaths.util('teamMatchEnterGroupScore.js'));
var seriesRoundDisplayLabels = require(path.join(utilsDir, 'seriesRoundDisplayLabels.js'));
var seriesRoundUpdate = require(seriesTestPaths.util('seriesRoundUpdate.js'));

var pageJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var adapterSrc = fs.readFileSync(path.join(seriesDir, 'seriesRyderCupScoreboardAdapter.js'), 'utf8');
var utilsSrc = fs.readFileSync(path.join(utilsDir, 'seriesRyderCupAccumulate.js'), 'utf8');

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

function freeze(v) {
  return JSON.parse(JSON.stringify(v));
}

function holeScores(aWins, filled) {
  var n = filled == null ? 1 : filled;
  var a = [];
  var b = [];
  var i;
  for (i = 0; i < 18; i++) {
    if (i < n) {
      a[i] = aWins ? 3 : 5;
      b[i] = aWins ? 5 : 3;
    } else {
      a[i] = '';
      b[i] = '';
    }
  }
    return { a: a, b: b };
}

function fullHoles(aWins) {
  return holeScores(aWins, 18);
}

function tieHoles() {
  var a = [];
  var b = [];
  for (var i = 0; i < 18; i++) {
    a[i] = 4;
    b[i] = 4;
  }
  return { a: a, b: b };
}

function ctx(roundId, matchId) {
  return {
    managed: true,
    seriesId: 's-ryder',
    roundId: roundId,
    matchId: matchId,
    publishToken: 'tok'
  };
}

function g5Match(over) {
  var scores = over.scores || holeScores(true, 1);
  var scores2 = over.scores2;
  var teamA = 'red';
  var teamB = 'blue';
  var g1 = over.g1 || 'g1';
  var groups = [
    {
      groupId: g1,
      status: over.g1Status || 'ongoing',
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
  if (over.g2) {
    groups.push({
      groupId: over.g2,
      status: over.g2Status || 'ongoing',
      players: [
        { userId: 'pA2', position: 1 },
        { userId: 'pB2', position: 2 }
      ]
    });
    var s2 = scores2 || scores;
    scoreData[over.g2] = {
      scoresByPlayer: {
        pA2: { scores: s2.a.slice() },
        pB2: { scores: s2.b.slice() }
      }
    };
  }
  return Object.assign(
    {
      matchId: over.matchId || 'm1',
      status: over.status || 'ongoing',
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
      seriesContext: over.seriesContext || ctx(over.roundId || 'r1', over.matchId || 'm1')
    },
    over.extra || {}
  );
}

function makeSeries(over) {
  return Object.assign(
    {
      seriesId: 's-ryder',
      seriesName: '莱德杯公开赛',
      seriesSubtitle: '',
      seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
      lifecycleStatus: 'published',
      registrationState: 'open',
      registrationRevision: 1,
      publishToken: 'tok',
      hostMode: 'organization',
      organization: { organizationName: '主办', organizationLogo: '' },
      scoringRule: seriesRyderCup.createRyderCupScoringRule(),
      createdAt: 1,
      rounds: [
        {
          roundId: 'r1',
          index: 1,
          matchId: 'm1',
          roundStatus: 'scheduled',
          dateTime: '2030-06-01 08:00',
          gameMode: '个人比洞赛',
          courseId: 'c1',
          courseName: '球场A',
          courseHalfText: '18洞'
        },
        {
          roundId: 'r2',
          index: 2,
          matchId: 'm2',
          roundStatus: 'scheduled',
          dateTime: '2030-06-02 08:00',
          gameMode: '四人四球比洞赛',
          courseId: 'c2',
          courseName: '球场B',
          courseHalfText: '18洞'
        }
      ]
    },
    over || {}
  );
}

function storeOf(series) {
  var mem = Object.create(null);
  mem[series.seriesId] = freeze(series);
  return {
    getSeriesById: function (id) {
      return mem[id] ? freeze(mem[id]) : null;
    },
    upsertSeriesChecked: function (next) {
      mem[next.seriesId] = freeze(next);
      return { ok: true, series: freeze(next) };
    },
    upsertSeries: function (next) {
      mem[next.seriesId] = freeze(next);
      return { ok: true, series: freeze(next) };
    }
  };
}

function depsOf(matchMap, series) {
  return {
    getMatchById: function (id) {
      return matchMap[id] || null;
    },
    getIndexByMatchId: function (id) {
      var m = matchMap[id];
      if (!m) return null;
      return {
        seriesId: 's-ryder',
        roundId: m.seriesContext.roundId,
        matchId: id
      };
    },
    getSeriesById: function () {
      return series;
    }
  };
}

var m1 = g5Match({
  matchId: 'm1',
  roundId: 'r1',
  scores: holeScores(true, 1),
  g2: 'g2',
  scores2: holeScores(false, 0)
});
var m2 = g5Match({
  matchId: 'm2',
  roundId: 'r2',
  g1: 'g-r2-1',
  g2: 'g-r2-2',
  scores: holeScores(false, 1),
  scores2: holeScores(false, 1)
});
var series = makeSeries();
var matchMap = { m1: m1, m2: m2 };
var deps = depsOf(matchMap, series);

assert(
  '主包累计与分包 adapter 同一实现',
  adapterSrc.indexOf("require('../../../../utils/seriesRyderCupAccumulate.js')") >= 0 &&
    utilsSrc.indexOf('subpackages/') < 0
);
assert(
  '详情 onShow 刷新 ViewModel',
  pageJs.indexOf('onShow:') >= 0 && pageJs.indexOf('reloadViewModel({ resetScroll: false })') >= 0
);
assert(
  '进入记分复用 enterTeamMatchGroupScore / 既有 matchId',
  pageJs.indexOf('enterTeamMatchGroupScore') >= 0 &&
    pageJs.indexOf('enterViewerGroupScore') >= 0
);

var tot1 = accumulate.accumulateSeriesMatchPlayScores(series, {
  getMatchById: function (id) {
    return id === 'm1' ? m1 : g5Match({ matchId: 'm2', roundId: 'r2', scores: holeScores(true, 0) });
  }
});
assert('1 R1 单组记分后系列总分刷新', tot1.redScore === 1 && tot1.blueScore === 0);

var tot2 = accumulate.accumulateSeriesMatchPlayScores(series, deps);
assert(
  '2 R1+R2 同时有成绩累计',
  tot2.redScore === 1 && tot2.blueScore === 2
);

var viewR1 = adapter.buildRyderCupStandingsView({
  series: series,
  selectedKey: 'r1',
  userPicked: true,
  visited: true,
  roundStates: [
    { roundId: 'r1', index: 1, state: 'live' },
    { roundId: 'r2', index: 2, state: 'live' }
  ],
  deps: deps
});
var viewR2 = adapter.buildRyderCupStandingsView({
  series: series,
  selectedKey: 'r2',
  userPicked: true,
  visited: true,
  roundStates: [
    { roundId: 'r1', index: 1, state: 'live' },
    { roundId: 'r2', index: 2, state: 'live' }
  ],
  deps: deps
});
assert(
  '3 Rx 切换不改变顶部累计分',
  viewR1.seriesRedScore === tot2.redScore &&
    viewR1.seriesBlueScore === tot2.blueScore &&
    viewR1.seriesRedScore === viewR2.seriesRedScore &&
    viewR1.seriesBlueScore === viewR2.seriesBlueScore &&
    viewR1.selectedKey === 'r1' &&
    viewR2.selectedKey === 'r2'
);

var boardBefore = matchPlayScoreboardView.buildMatchPlayScoreboard(m1, { allowMockCards: false });
var completeMatch = g5Match({
  matchId: 'm1',
  roundId: 'r1',
  scores: fullHoles(true),
  g2: 'g2',
  scores2: holeScores(true, 0)
});
var boardAfter = matchPlayScoreboardView.buildMatchPlayScoreboard(completeMatch, {
  allowMockCards: false
});
assert(
  '4 结束本组口径：一组成绩完整后 MATCHES COMPLETE 更新',
  boardBefore.finishedMatches === 0 &&
    boardAfter.finishedMatches === 1 &&
    boardAfter.totalMatches === 2 &&
    boardAfter.matchesCompleteText.indexOf('1/2') === 0
);

var unfinishedRound = g5Match({
  matchId: 'm1',
  roundId: 'r1',
  scores: fullHoles(true),
  g1Status: 'finished',
  g2: 'g2',
  g2Status: 'ongoing',
  scores2: holeScores(true, 0)
});
var promoteBlocked = teamMatchFinish.promoteMatchFinishedIfAllGroupsDone(unfinishedRound);
var confirmBlocked = teamMatchFinish.confirmFinishWholeTeamMatch(unfinishedRound, {
  getSeriesById: function () {
    return series;
  }
});
assert('5 存在未完成组时不能 promote Round', promoteBlocked.changed === false);
assert(
  '5b 莱德杯未完成组不能结束本轮',
  !confirmBlocked.ok && confirmBlocked.reason === 'groups_incomplete'
);

var finishedRound = g5Match({
  matchId: 'm1',
  roundId: 'r1',
  status: 'ongoing',
  scores: fullHoles(true),
  g1Status: 'finished',
  g2: 'g2',
  g2Status: 'finished',
  scores2: fullHoles(false)
});
var promoteOk = teamMatchFinish.promoteMatchFinishedIfAllGroupsDone(finishedRound);
assert('6 全组完成后 Round 可完成', promoteOk.changed === true && teamMatchFinish.isMatchCompleted(finishedRound));
var locks = seriesRoundUpdate.resolveRoundEditLocks(series, series.rounds[0], finishedRound);
assert('6b 完成后 Round 锁定分组/成绩入口', locks.finished === true && locks.name.enabled === false);

var liveMap = {
  m1: Object.assign({}, finishedRound, { status: 'finished' }),
  m2: g5Match({ matchId: 'm2', roundId: 'r2', status: 'ongoing', g2: 'g2b' })
};
var autoBlocked = seriesFinalize.finalizeSeries({
  seriesId: 's-ryder',
  source: 'auto',
  seriesStore: storeOf(series),
  getMatchById: function (id) {
    return liveMap[id] || null;
  }
});
assert('7 存在未完成有效 Round 时不能结束 Series', !autoBlocked.ok && autoBlocked.reason === 'rounds_incomplete');

var doneMap = {
  m1: Object.assign({}, finishedRound, { status: 'finished', seriesContext: ctx('r1', 'm1') }),
  m2: g5Match({
    matchId: 'm2',
    roundId: 'r2',
    status: 'finished',
    g1Status: 'finished',
    g2: 'g2b',
    g2Status: 'finished',
    scores: fullHoles(false),
    scores2: fullHoles(true)
  })
};
var autoOk = seriesFinalize.finalizeSeries({
  seriesId: 's-ryder',
  source: 'auto',
  seriesStore: storeOf(series),
  getMatchById: function (id) {
    return doneMap[id] || null;
  }
});
assert('8 所有有效 Round 完成后 Series 可最终化', autoOk.ok === true && autoOk.idempotent === false);

var tieMatch1 = g5Match({
  matchId: 'm1',
  roundId: 'r1',
  status: 'finished',
  g1Status: 'finished',
  scores: tieHoles()
});
var tieMatch2 = g5Match({
  matchId: 'm2',
  roundId: 'r2',
  status: 'finished',
  g1: 'g-t2',
  g1Status: 'finished',
  scores: tieHoles()
});
var tieSeries = makeSeries();
var tieTotals = accumulate.accumulateSeriesMatchPlayScores(tieSeries, {
  getMatchById: function (id) {
    return id === 'm1' ? tieMatch1 : tieMatch2;
  }
});
var tieFin = seriesFinalize.finalizeSeries({
  seriesId: 's-ryder',
  source: 'auto',
  seriesStore: storeOf(tieSeries),
  getMatchById: function (id) {
    return id === 'm1' ? tieMatch1 : tieMatch2;
  }
});
assert(
  '9 总分平局时 Series 可最终化',
  tieTotals.redScore === tieTotals.blueScore && tieFin.ok === true
);

var cancelledSeries = makeSeries({
  rounds: [
    series.rounds[0],
    Object.assign({}, series.rounds[1], { roundStatus: 'cancelled' })
  ]
});
var cancelledTotals = accumulate.accumulateSeriesMatchPlayScores(cancelledSeries, {
  getMatchById: function (id) {
    return id === 'm1' ? Object.assign({}, finishedRound, { status: 'finished' }) : m2;
  }
});
var cancelledFin = seriesFinalize.finalizeSeries({
  seriesId: 's-ryder',
  source: 'auto',
  seriesStore: storeOf(cancelledSeries),
  getMatchById: function (id) {
    return id === 'm1' ? Object.assign({}, finishedRound, { status: 'finished' }) : m2;
  }
});
assert(
  '10 已取消 Round 不计分且不阻塞',
  cancelledTotals.traces[1] &&
    cancelledTotals.traces[1].reason === 'cancelled' &&
    cancelledFin.ok === true
);

var finishOnce = scoreGroupFinish.finishTeamMatchGroup(
  g5Match({
    matchId: 'm1',
    roundId: 'r1',
    scores: fullHoles(true)
  }),
  'g1',
  {
    saveMatchIfWritable: function (m) {
      return { ok: true, match: m };
    },
    maybeFinalizeAfterStationPersisted: function () {
      return { ok: false };
    },
    getSeriesById: function () {
      return series;
    }
  }
);
var finishTwice = scoreGroupFinish.finishTeamMatchGroup(finishOnce.match, 'g1', {
  saveMatchIfWritable: function (m) {
    return { ok: true, match: m };
  },
  getSeriesById: function () {
    return series;
  }
});
assert('11 重复结束本组幂等', finishOnce.ok === true && finishTwice.ok === false && finishTwice.reason === 'group_finished');

var roundAgain = teamMatchFinish.confirmFinishWholeTeamMatch(
  Object.assign({}, finishedRound, { status: 'finished' }),
  { getSeriesById: function () { return series; } }
);
assert('11b 重复结束 Round 幂等拒绝', !roundAgain.ok && roundAgain.reason === 'already_finished');

var completedSeries = Object.assign({}, autoOk.series);
var finAgain = seriesFinalize.finalizeSeries({
  seriesId: 's-ryder',
  source: 'auto',
  seriesStore: storeOf(completedSeries),
  getMatchById: function (id) {
    return doneMap[id] || null;
  }
});
var scoreBefore = accumulate.accumulateSeriesMatchPlayScores(completedSeries, {
  getMatchById: function (id) {
    return doneMap[id] || null;
  }
});
var scoreAfter = accumulate.accumulateSeriesMatchPlayScores(completedSeries, {
  getMatchById: function (id) {
    return doneMap[id] || null;
  }
});
assert('11c 重复结束 Series 幂等且分数不变', finAgain.ok === true && finAgain.idempotent === true);
assert(
  '11d 多次投影不重复累计',
  scoreBefore.redScore === scoreAfter.redScore && scoreBefore.blueScore === scoreAfter.blueScore
);

var missing = accumulate.accumulateSeriesMatchPlayScores(series, {
  getMatchById: function (id) {
    return id === 'm1' ? m1 : null;
  }
});
assert('station 缺失不猜分', missing.traces[1] && missing.traces[1].reason === 'match_missing');

var conflict = accumulate.accumulateSeriesMatchPlayScores(series, {
  getMatchById: function (id) {
    if (id !== 'm2') return m1;
    return g5Match({
      matchId: 'm2',
      scores: holeScores(false, 1),
      seriesContext: {
        managed: true,
        seriesId: 'other',
        roundId: 'r2',
        matchId: 'm2',
        publishToken: 'tok'
      }
    });
  }
});
assert(
  'seriesContext 身份冲突 fail closed',
  conflict.traces[1] && conflict.traces[1].reason === 'context_series_id_conflict'
);

var lockedWrite = teamMatchFinish.assertWritable(finishedRound, {
  getSeriesById: function () {
    return series;
  }
});
assert('已锁 Round 写入拒绝', !lockedWrite.ok);

var seriesWrite = seriesFinishLock.assertSeriesWritable(completedSeries);
var matchWrite = seriesFinishLock.assertWritableForMatch(doneMap.m1, {
  getSeriesById: function () {
    return completedSeries;
  }
});
assert('已完成 Series 普通写入拒绝', !seriesWrite.ok && !matchWrite.ok);

var restored = makeSeries();
var restoredTot = accumulate.accumulateSeriesMatchPlayScores(restored, deps);
assert(
  '恢复轮次后总分可重新投影',
  restoredTot.redScore === tot2.redScore && restoredTot.blueScore === tot2.blueScore
);

var mutation = seriesFinishLock.resolveSeriesMutationLock(completedSeries, true);
assert('12 最终化后只读', mutation.blocked === true && mutation.scope === 'series');

var regCard = listAdapter.toSeriesClubCard(makeSeries({ seriesSubtitle: '' }), 'registration');
assert(
  '13 广场报名只显示 canonical 且进入详情',
  regCard.statusLabel === '报名中' &&
    regCard.titleSub === '' &&
    regCard.typeLabel === '系列赛' &&
    regCard.matchId === '' &&
    /series-detail/.test(regCard.navUrl)
);

var scheduledCard = listAdapter.toSeriesClubCard(
  makeSeries({ registrationState: 'closed', seriesSubtitle: '' }),
  'registration'
);
assert(
  '13b 待赛报名卡只显示 canonical 且无比分字段',
  scheduledCard.titleSub === '' &&
    scheduledCard.ryderScoreText == null
);

var liveSeries = makeSeries({ registrationState: 'closed' });
var liveCard = listAdapter.toSeriesClubCard(liveSeries, 'live', {
  getMatchById: deps.getMatchById
});
var livePhase = listAdapter.deriveSeriesListPhase(liveSeries, ['ongoing', 'ongoing']);
assert('13c 广场 LIVE 状态', livePhase === 'live' && liveCard.statusLabel === 'LIVE');
assert(
  '14 广场 LIVE 与详情累计分一致',
  liveCard.ryderRedScore === tot2.redScore &&
    liveCard.ryderBlueScore === tot2.blueScore &&
    liveCard.ryderScoreText === accumulate.formatSeriesScorePair(tot2.redScore, tot2.blueScore)
);

var finishedCard = listAdapter.toSeriesClubCard(completedSeries, 'finished', {
  getMatchById: function (id) {
    return doneMap[id] || null;
  }
});
assert(
  '13d 广场已完成展示累计分且不标记胜者',
  finishedCard.statusLabel === '已结束' &&
    finishedCard.ryderScoreText &&
    String(finishedCard.titleSub).indexOf('冠军') < 0 &&
    String(finishedCard.titleSub).indexOf('卫冕') < 0
);

var cxSeries = makeSeries({
  rounds: [
    Object.assign({}, series.rounds[0], {
      dateTime: '2030-06-01 08:00',
      courseId: 'course-a',
      courseName: 'A场'
    }),
    Object.assign({}, series.rounds[1], {
      dateTime: '2030-06-01 13:00',
      courseId: 'course-b',
      courseName: 'B场'
    })
  ]
});
var cxLabels = seriesRoundDisplayLabels.buildSeriesRoundDisplayLabels(
  cxSeries,
  cxSeries.rounds.map(function (r, i) {
    return {
      roundId: r.roundId,
      index: r.index,
      dateTime: r.dateTime,
      courseId: r.courseId,
      courseName: r.courseName
    };
  })
);
var cxHint = accumulate.buildNextValidRoundHint(cxSeries);
assert('15 COURSE/Cx 投影不回归', cxLabels.r1 === 'C1' && cxLabels.r2 === 'C2' && cxHint.indexOf('C1') === 0);

function finishedStation(roundId, matchId) {
  return g5Match({
    matchId: matchId,
    roundId: roundId,
    status: 'finished',
    g1Status: 'finished',
    scores: fullHoles(true)
  });
}

var nextAfterR1Done = accumulate.findNextValidRound(makeSeries(), {
  getMatchById: function (id) {
    if (id === 'm1') return finishedStation('r1', 'm1');
    return g5Match({ matchId: 'm2', roundId: 'r2', status: 'registering', scores: holeScores(true, 0) });
  }
});
assert('R1 已完成、R2 待赛时下一轮为 R2', nextAfterR1Done && nextAfterR1Done.roundId === 'r2');

var nextAfterR1Cancel = accumulate.findNextValidRound(
  makeSeries({
    rounds: [
      Object.assign({}, series.rounds[0], { roundStatus: 'cancelled' }),
      series.rounds[1]
    ]
  }),
  {
    getMatchById: function (id) {
      return g5Match({ matchId: id, roundId: id === 'm1' ? 'r1' : 'r2', scores: holeScores(true, 0) });
    }
  }
);
assert('R1 取消、R2 待赛时选择 R2', nextAfterR1Cancel && nextAfterR1Cancel.roundId === 'r2');

var nextAllDone = accumulate.findNextValidRound(makeSeries(), {
  getMatchById: function (id) {
    return finishedStation(id === 'm1' ? 'r1' : 'r2', id);
  }
});
assert('全部轮次完成时无下一轮提示', nextAllDone == null && accumulate.buildNextValidRoundHint(makeSeries(), {
  getMatchById: function (id) {
    return finishedStation(id === 'm1' ? 'r1' : 'r2', id);
  }
}) === '');

var missingCard = listAdapter.toSeriesClubCard(makeSeries({ seriesSubtitle: '原副标题' }), 'live', {
  getMatchById: function () {
    return null;
  }
});
var missingTot = accumulate.accumulateSeriesMatchPlayScores(makeSeries(), {
  getMatchById: function () {
    return null;
  }
});
assert(
  '所有 station 缺失时广场不显示 0-0',
  missingTot.completeProjection === false &&
    missingTot.invalidRoundCount === 2 &&
    missingCard.ryderScoreText == null &&
    String(missingCard.titleSub).indexOf('0-0') < 0 &&
    missingCard.titleSub.indexOf('原副标题') >= 0
);

var conflictCard = listAdapter.toSeriesClubCard(makeSeries({ seriesSubtitle: '原副标题' }), 'live', {
  getMatchById: function (id) {
    if (id === 'm1') return m1;
    return g5Match({
      matchId: 'm2',
      scores: holeScores(false, 1),
      seriesContext: {
        managed: true,
        seriesId: 'other',
        roundId: 'r2',
        matchId: 'm2',
        publishToken: 'tok'
      }
    });
  }
});
assert(
  'station 身份冲突时广场不显示部分总分',
  conflictCard.ryderScoreText == null &&
    String(conflictCard.titleSub).indexOf('1-') < 0 &&
    String(conflictCard.titleSub).indexOf('0-2') < 0 &&
    conflictCard.titleSub.indexOf('原副标题') >= 0
);

var emptyValid = g5Match({
  matchId: 'm1',
  roundId: 'r1',
  scores: holeScores(true, 0),
  g2: 'g2',
  scores2: holeScores(true, 0)
});
var emptyValid2 = g5Match({
  matchId: 'm2',
  roundId: 'r2',
  g1: 'g-e2',
  scores: holeScores(true, 0)
});
var emptyCard = listAdapter.toSeriesClubCard(makeSeries({ seriesSubtitle: '' }), 'live', {
  getMatchById: function (id) {
    return id === 'm1' ? emptyValid : emptyValid2;
  }
});
assert(
  'station 全部有效但尚无成绩时显示真实 0-0',
  emptyCard.ryderScoreText === '0-0' && String(emptyCard.titleSub).indexOf('0-0') < 0
);

assert(
  'station 全部有效且有成绩时正常显示累计分',
  liveCard.ryderScoreText === accumulate.formatSeriesScorePair(tot2.redScore, tot2.blueScore) &&
    tot2.completeProjection === true
);

var gate = seriesDetailViewModel.evaluateRoundStationGate(series, series.rounds[0], deps);
var captured = null;
var entered = enterScore.enterTeamMatchGroupScore(m1, 'g1', {
  setMatchState: function (st) {
    captured = st;
  },
  enterScorePage: function () {},
  emptyScores: function () {
    return [];
  },
  groupsStore: { ensureInitialized: function () {} }
});
assert(
  'LIVE 接入稳定 matchId 且不复制比赛',
  gate.canEnterRound &&
    gate.matchId === 'm1' &&
    gate.navUrl.indexOf('matchId=m1') >= 0 &&
    entered.ok &&
    entered.matchId === 'm1' &&
    captured.matchId === 'm1' &&
    captured.groupId === 'g1' &&
    m1.teamGroups[0].id === 'red' &&
    m1.teamGroups[1].id === 'blue'
);

var ordinary = g5Match({
  matchId: 'ord',
  extra: { seriesContext: null },
  g1Status: 'finished',
  g2: 'g2o',
  g2Status: 'ongoing'
});
ordinary.seriesContext = null;
var ordinaryFinish = teamMatchFinish.confirmFinishWholeTeamMatch(ordinary);
assert('16 普通单场仍可走原结束全场（不套莱德杯组闸）', ordinaryFinish.ok === true);

var strokeSeries = makeSeries({
  seriesCompetitionType: '',
  scoringRule: { mode: 'global_m', globalM: 8, allowRepeat: false, scoreBasis: 'gross' }
});
var strokeCard = listAdapter.toSeriesClubCard(strokeSeries, 'live', {
  getMatchById: deps.getMatchById
});
assert('16b 普通 Series 卡片不写莱德杯比分字段', strokeCard.ryderScoreText == null);

var restoredCancel = accumulate.accumulateSeriesMatchPlayScores(cancelledSeries, {
  getMatchById: function (id) {
    return id === 'm1' ? Object.assign({}, finishedRound, { status: 'finished' }) : m2;
  }
});
var afterRestore = accumulate.accumulateSeriesMatchPlayScores(makeSeries(), {
  getMatchById: function (id) {
    return id === 'm1' ? Object.assign({}, finishedRound, { status: 'finished' }) : m2;
  }
});
assert(
  '取消后总分回落、恢复后重新计入',
  restoredCancel.traces[1].included === false && afterRestore.traces[1].included === true
);

if (failed) {
  console.log('\nFAILED ' + failed);
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
  process.exit(1);
}
console.log('\nAll ' + passed + ' passed');
