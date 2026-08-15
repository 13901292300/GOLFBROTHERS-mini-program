/**
 * SERIES-RN-NO-SCORE-NO-RANK
 * global_m 分站 teamCompetition.enabled=false：无有效成绩不显示 1/2/3。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesRnNoScoreNoRank.selftest.js
 */

var path = require('path');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var createDir = path.join(mini, 'subpackages', 'create', 'pages', 'series');

var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStoreMod = require(path.join(utilsDir, 'seriesStore.js'));
var seriesStationIndexMod = require(path.join(utilsDir, 'seriesStationIndex.js'));
var seriesPublishJournalMod = require(path.join(utilsDir, 'seriesPublishJournal.js'));
var seriesPublish = require(path.join(utilsDir, 'seriesPublish.js'));
var participantDraft = require(path.join(createDir, 'participantDraft.js'));
var teamLeaderboardView = require(path.join(utilsDir, 'teamLeaderboardView.js'));
var teamLeaderboardHost = require(path.join(utilsDir, 'teamLeaderboardHost.js'));
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

function createMemoryAdapter() {
  var bag = Object.create(null);
  return {
    getItem: function (key) {
      return { ok: true, value: bag[key] != null ? JSON.parse(JSON.stringify(bag[key])) : null };
    },
    setItem: function (key, value) {
      bag[key] = JSON.parse(JSON.stringify(value));
      return { ok: true };
    }
  };
}

function createHarness() {
  var seriesStore = seriesStoreMod.createSeriesStore(createMemoryAdapter());
  var stationIndex = seriesStationIndexMod.createSeriesStationIndex(createMemoryAdapter());
  var journal = seriesPublishJournalMod.createSeriesPublishJournal(createMemoryAdapter());
  var matchRepo = seriesPublish.createMemoryMatchRepo({ normalizeOnGet: true });
  var fixedNow = new Date(2026, 5, 1, 12, 0, 0, 0).getTime();
  var publisher = seriesPublish.createSeriesPublisher({
    seriesStore: seriesStore,
    stationIndex: stationIndex,
    matchRepo: matchRepo,
    journal: journal,
    now: function () {
      return fixedNow;
    }
  });
  return {
    seriesStore: seriesStore,
    stationIndex: stationIndex,
    matchRepo: matchRepo,
    publisher: publisher,
    fixedNow: fixedNow
  };
}

function applyG1Grouping(match, scoresByTeam) {
  var groups = Array.isArray(match.teamGroups) ? match.teamGroups : [];
  var idA = String(groups[0].id);
  var idB = String(groups[1].id);
  var nameA = groups[0].name || 'A';
  var nameB = groups[1].name || 'B';
  var next = JSON.parse(JSON.stringify(match));
  next.status = 'ongoing';
  next.registerInfo = {
    totalCount: 4,
    users: [
      { userId: 'u-a1', nickname: '甲一', gender: 'male', matchTeamId: idA, matchTeamName: nameA },
      { userId: 'u-a2', nickname: '甲二', gender: 'male', matchTeamId: idA, matchTeamName: nameA },
      { userId: 'u-b1', nickname: '乙一', gender: 'female', matchTeamId: idB, matchTeamName: nameB },
      { userId: 'u-b2', nickname: '乙二', gender: 'male', matchTeamId: idB, matchTeamName: nameB }
    ]
  };
  next.groups = [
    {
      groupId: 'gA',
      groupName: 'A组',
      players: [
        { userId: 'u-a1', position: 1, matchTeamId: idA },
        { userId: 'u-a2', position: 2, matchTeamId: idA },
        { userId: 'u-b1', position: 3, matchTeamId: idB },
        { userId: 'u-b2', position: 4, matchTeamId: idB }
      ]
    }
  ];
  next.pairings = {};
  next.scoreEntities = {};
  var aScores = (scoresByTeam && scoresByTeam.a) || {};
  var bScores = (scoresByTeam && scoresByTeam.b) || {};
  next.scoreData = {
    gA: {
      scoresByPlayer: {
        'u-a1': { scores: aScores.a1 || [] },
        'u-a2': { scores: aScores.a2 || [] },
        'u-b1': { scores: bScores.b1 || [] },
        'u-b2': { scores: bScores.b2 || [] }
      }
    }
  };
  return next;
}

function publishSeries(kind, scoringMode) {
  var h = createHarness();
  var draft;
  if (kind === 'division') {
    draft = seriesModel.createEmptySeriesDraft({
      hostMode: 'team',
      templateId: 'division_series',
      seriesName: '分队无排名',
      createdBy: 'creator-rn-ns',
      hostTeam: { teamId: 'team-host-1', teamName: '星途俱乐部', teamLogo: '' }
    });
    draft = participantDraft.ensureDefaultDivisionsIfNeeded(draft);
  } else {
    draft = seriesModel.createEmptySeriesDraft({
      hostMode: 'organization',
      templateId: 'inter_team_series',
      seriesName: '队际无排名',
      createdBy: 'creator-rn-ns',
      organization: {
        organizationId: 'org-1',
        organizationName: '湘鹰机构',
        organizationLogo: ''
      }
    });
    draft.participants = [
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
  draft.visibility = 'public';
  draft.scoringRule = seriesModel.createDefaultScoringRule({
    mode: scoringMode || 'global_m',
    globalM: 2,
    allowRepeat: false,
    scoreBasis: 'gross'
  });
  draft.rounds = draft.rounds.map(function (r, idx) {
    var next = Object.assign({}, r);
    next.dateTime = '2030-08-0' + (idx + 1) + ' 08:00';
    next.gameMode = '个人比杆赛';
    next.courseId = 'c' + (idx + 1);
    next.courseName = '球场' + (idx + 1);
    next.fee = '';
    return next;
  });
  var saved = h.seriesStore.saveDraft(draft);
  var pub = h.publisher.publishSeries(saved.series.seriesId, { now: h.fixedNow });
  if (!pub.ok) throw new Error('publish failed: ' + pub.reason);
  return {
    h: h,
    series: h.seriesStore.getSeriesById(saved.series.seriesId)
  };
}

function projectRn(h, series, roundIndex) {
  var round = series.rounds[roundIndex];
  var match = h.matchRepo.getMatchById(round.matchId);
  return adapter.projectSeriesStandingsTeamBoard({
    selectedKey: round.roundId,
    series: series,
    round: round,
    match: match,
    indexLink: h.stationIndex.getByMatchId(round.matchId)
  });
}

function projectTot(h, series) {
  return adapter.projectSeriesStandingsTeamBoard({
    selectedKey: standingsVm.CUMULATIVE_KEY,
    series: series,
    getMatchById: function (id) {
      return h.matchRepo.getMatchById(id);
    },
    getIndexByMatchId: function (id) {
      return h.stationIndex.getByMatchId(id);
    }
  });
}

function injectGrouped(h, round, scoresByTeam) {
  var match = h.matchRepo.getMatchById(round.matchId);
  h.matchRepo._inject(applyG1Grouping(match, scoresByTeam));
}

function dashRow(row) {
  return (
    String(row.pos) === '-' &&
    String(row.scoreStr) === '-' &&
    String(row.grossTotalDisplay) === '-' &&
    row.hasScore !== true
  );
}

function noFakeRank(rows) {
  return (rows || []).every(function (row) {
    return String(row.pos) === '-' || String(row.pos).charAt(0) === 'T' || /^\d+$/.test(String(row.pos));
  });
}

(function interTeamR1NoScore() {
  var ctx = publishSeries('inter');
  injectGrouped(ctx.h, ctx.series.rounds[0], {});
  var projected = projectRn(ctx.h, ctx.series, 0);
  var rows = (projected.overlay && projected.overlay.teamRows) || [];
  var match = ctx.h.matchRepo.getMatchById(ctx.series.rounds[0].matchId);
  assert(
    '队际 R1 分站 teamCompetition 关闭',
    match.scoringRules.teamCompetition.enabled === false
  );
  assert(
    '队际 R1 无成绩保留球队行且 POS/TOTAL/TO PAR 均为 -',
    projected.verifiedOk === true &&
      rows.length === 2 &&
      rows.every(dashRow) &&
      rows.every(function (r) {
        return String(r.pos) !== '1' && String(r.pos) !== '2';
      })
  );
})();

(function divisionRnNoScore() {
  var ctx = publishSeries('division');
  injectGrouped(ctx.h, ctx.series.rounds[0], {});
  injectGrouped(ctx.h, ctx.series.rounds[1], {});
  var r1 = projectRn(ctx.h, ctx.series, 0);
  var r2 = projectRn(ctx.h, ctx.series, 1);
  assert(
    '分队 R1 无成绩不显示虚假名次',
    r1.overlay.teamRows.length === 2 && r1.overlay.teamRows.every(dashRow)
  );
  assert(
    '分队 R2 无成绩不显示虚假名次',
    r2.overlay.teamRows.length === 2 && r2.overlay.teamRows.every(dashRow)
  );
})();

(function oneTeamScored() {
  var ctx = publishSeries('inter');
  injectGrouped(ctx.h, ctx.series.rounds[0], {
    a: { a1: fillScores(9, 4) },
    b: {}
  });
  var rows = projectRn(ctx.h, ctx.series, 0).overlay.teamRows;
  assert(
    '一队有成绩、一队无成绩：有成绩在前并排名，无成绩 pos=-',
    rows.length === 2 &&
      rows[0].hasScore === true &&
      String(rows[0].pos) === '1' &&
      rows[0].scoreStr !== '-' &&
      rows[0].grossTotalDisplay !== '-' &&
      dashRow(rows[1])
  );
})();

(function bothScoredWithTie() {
  var ctx = publishSeries('division');
  injectGrouped(ctx.h, ctx.series.rounds[0], {
    a: { a1: fillScores(18, 4), a2: fillScores(18, 4) },
    b: { b1: fillScores(18, 4), b2: fillScores(18, 4) }
  });
  var rows = projectRn(ctx.h, ctx.series, 0).overlay.teamRows;
  assert(
    '两队有成绩且同杆使用并列名次',
    rows.length === 2 &&
      rows[0].hasScore === true &&
      rows[1].hasScore === true &&
      rows[0].pos === rows[1].pos &&
      String(rows[0].pos).charAt(0) === 'T' &&
      rows[0].scoreStr !== '-'
  );
})();

(function liveThenClear() {
  var ctx = publishSeries('inter');
  injectGrouped(ctx.h, ctx.series.rounds[0], {});
  var empty = projectRn(ctx.h, ctx.series, 0).overlay.teamRows;
  injectGrouped(ctx.h, ctx.series.rounds[0], {
    a: { a1: fillScores(6, 4) },
    b: { b1: fillScores(6, 5) }
  });
  var live = projectRn(ctx.h, ctx.series, 0).overlay.teamRows;
  injectGrouped(ctx.h, ctx.series.rounds[0], {});
  var cleared = projectRn(ctx.h, ctx.series, 0).overlay.teamRows;
  assert(
    'LIVE 后即时生成排名',
    empty.every(dashRow) &&
      live[0].hasScore === true &&
      String(live[0].pos) === '1' &&
      live[1].hasScore === true &&
      String(live[1].pos) === '2' &&
      noFakeRank(live)
  );
  assert(
    '清空最后成绩后恢复无排名',
    cleared.length === 2 && cleared.every(dashRow)
  );
})();

(function totGlobalMUnchanged() {
  var ctx = publishSeries('division');
  ctx.series.rounds.forEach(function (round) {
    injectGrouped(ctx.h, round, {
      a: { a1: fillScores(18, 4), a2: fillScores(18, 5) },
      b: { b1: fillScores(18, 3), b2: fillScores(18, 6) }
    });
  });
  var tot = projectTot(ctx.h, ctx.series);
  var rows = (tot.overlay && tot.overlay.teamRows) || [];
  var counting = rows.reduce(function (n, team) {
    return (
      n +
      (team.players || []).filter(function (p) {
        return p.isCounting === true;
      }).length
    );
  }, 0);
  assert(
    'TOT global M 不退化：仍按 M 计入且有正式名次',
    tot.verifiedOk === true &&
      tot.reason === 'tot_g1_division' &&
      rows.length === 2 &&
      rows.every(function (t) {
        return t.hasScore === true && String(t.pos) !== '-' && Number(t.scoringPlayersCount) === 2;
      }) &&
      counting === 4
  );
})();

(function ordinaryPkOffSameSemantics() {
  var host = teamLeaderboardHost.createStandaloneHost();
  var match = {
    matchId: 'm-ordinary-pkoff',
    matchType: 'inter-team',
    status: 'ongoing',
    gameMode: '个人比杆赛',
    teamGroups: [
      { id: 'red', name: '红队' },
      { id: 'blue', name: '蓝队' }
    ],
    scoringRules: { teamCompetition: { enabled: false, topN: 2 } },
    registerInfo: {
      users: [
        { userId: 'u-a1', nickname: '甲一', gender: 'male', matchTeamId: 'red', matchTeamName: '红队' },
        { userId: 'u-b1', nickname: '乙一', gender: 'female', matchTeamId: 'blue', matchTeamName: '蓝队' }
      ]
    },
    groups: [
      {
        groupId: 'g1',
        groupName: 'A组',
        players: [
          { userId: 'u-a1', position: 1, matchTeamId: 'red' },
          { userId: 'u-b1', position: 2, matchTeamId: 'blue' }
        ]
      }
    ],
    scoreData: { g1: { scoresByPlayer: {} } }
  };
  var empty = teamLeaderboardView.buildGrossTeamLeaderboardView(match, host);
  match.scoreData.g1.scoresByPlayer = {
    'u-a1': { scores: fillScores(9, 4) }
  };
  var partial = teamLeaderboardView.buildGrossTeamLeaderboardView(match, host);
  assert(
    '普通单场非 PK 无成绩 POS/TOTAL/TO PAR 为 -',
    empty.length === 2 &&
      empty.every(function (t) {
        return String(t.pos) === '-' && t.scoreStr === '-' && t.grossTotalDisplay === '-';
      })
  );
  assert(
    '普通单场非 PK 部分成绩排名语义与 Series Rn 相同',
    partial[0].hasScore === true &&
      String(partial[0].pos) === '1' &&
      String(partial[1].pos) === '-' &&
      partial[1].hasScore !== true
  );
})();

(function pkOffDoesNotUseTopN() {
  var host = teamLeaderboardHost.createStandaloneHost();
  var match = {
    matchId: 'm-pkoff-all-entities',
    matchType: 'inter-team',
    status: 'ongoing',
    gameMode: '个人比杆赛',
    teamGroups: [
      { id: 'red', name: '红队' },
      { id: 'blue', name: '蓝队' }
    ],
    scoringRules: { teamCompetition: { enabled: false, topN: 1 } },
    registerInfo: {
      users: [
        { userId: 'u-a1', nickname: '甲一', gender: 'male', matchTeamId: 'red', matchTeamName: '红队' },
        { userId: 'u-a2', nickname: '甲二', gender: 'male', matchTeamId: 'red', matchTeamName: '红队' },
        { userId: 'u-b1', nickname: '乙一', gender: 'female', matchTeamId: 'blue', matchTeamName: '蓝队' }
      ]
    },
    groups: [
      {
        groupId: 'g1',
        groupName: 'A组',
        players: [
          { userId: 'u-a1', position: 1, matchTeamId: 'red' },
          { userId: 'u-a2', position: 2, matchTeamId: 'red' },
          { userId: 'u-b1', position: 3, matchTeamId: 'blue' }
        ]
      }
    ],
    scoreData: {
      g1: {
        scoresByPlayer: {
          'u-a1': { scores: fillScores(18, 4) },
          'u-a2': { scores: fillScores(18, 5) },
          'u-b1': { scores: fillScores(18, 4) }
        }
      }
    }
  };
  var rows = teamLeaderboardView.buildGrossTeamLeaderboardView(match, host);
  var red = rows.filter(function (t) {
    return t.teamId === 'red';
  })[0];
  var counting = (red.players || []).filter(function (p) {
    return p.isCounting === true;
  }).length;
  assert(
    '非 PK 不取 per-round topN，全部有效实体计入球队暂列',
    red &&
      red.hasScore === true &&
      red.scoringPlayersCount === 2 &&
      counting === 0 &&
      Number(red.grossTotal) > 72
  );
})();

console.log('');
console.log('---- seriesRnNoScoreNoRank.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
