/**
 * SERIES-TOT-DIVISION-RUNTIME-WIRING-FIX
 * 真实 create/publish + 正式分组/entity 同步 + 页面 TOT overlay 接线。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesTotDivisionRuntimeWiring.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var createDir = path.join(mini, 'subpackages', 'create', 'pages', 'series');

var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStoreMod = require(path.join(utilsDir, 'seriesStore.js'));
var seriesStationIndexMod = require(path.join(utilsDir, 'seriesStationIndex.js'));
var seriesPublishJournalMod = require(path.join(utilsDir, 'seriesPublishJournal.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var seriesPublish = require(path.join(utilsDir, 'seriesPublish.js'));
var teamMatchStore = require(path.join(utilsDir, 'teamMatchStore.js'));
var strokeEntityBuilder = require(path.join(utilsDir, 'strokeEntityBuilder.js'));
var participantDraft = require(path.join(createDir, 'participantDraft.js'));
var adapter = require(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'));
var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));
var personalAdapter = require(path.join(seriesDir, 'seriesPersonalLeaderboardAdapter.js'));
var viewModel = require(path.join(seriesDir, 'seriesDetailViewModel.js'));
var teamLeaderboardView = require(path.join(utilsDir, 'teamLeaderboardView.js'));
var teamLeaderboardHost = require(path.join(utilsDir, 'teamLeaderboardHost.js'));

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
    journal: journal,
    matchRepo: matchRepo,
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

function buildDivisionSeriesDraft(gameMode) {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'team',
    templateId: 'division_series',
    seriesName: '队内分队运行时接线',
    createdBy: 'creator-div-1',
    hostTeam: { teamId: 'team-host-1', teamName: '星途俱乐部', teamLogo: '/logo-host.png' }
  });
  s = participantDraft.ensureDefaultDivisionsIfNeeded(s);
  s.visibility = 'public';
  s.scoringRule = seriesModel.createDefaultScoringRule({
    mode: 'global_m',
    globalM: 2,
    allowRepeat: false,
    scoreBasis: 'gross'
  });
  s.rounds = s.rounds.map(function (r, idx) {
    var next = Object.assign({}, r);
    next.dateTime = '2030-08-0' + (idx + 1) + ' 08:00';
    next.gameMode = gameMode;
    next.courseId = 'c' + (idx + 1);
    next.courseName = '球场' + (idx + 1);
    next.fee = '';
    return next;
  });
  return s;
}

function applyOfficialGrouping(match, series, grouping) {
  var groups = Array.isArray(match.teamGroups) ? match.teamGroups : [];
  if (groups.length < 2) throw new Error('teamGroups < 2');
  var idA = String(groups[0].id);
  var idB = String(groups[1].id);
  var nameA = groups[0].name || '分队A';
  var nameB = groups[1].name || '分队B';
  var next = JSON.parse(JSON.stringify(match));
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
  if (grouping && grouping.g4) {
    next.pairings = {
      gA: [
        { id: next.matchId + '__gA__slot1', playerIds: ['u-a1', 'u-a2'] },
        { id: next.matchId + '__gA__slot2', playerIds: ['u-b1', 'u-b2'] }
      ]
    };
  } else if (grouping && grouping.g1) {
    next.pairings = {};
    next.strokeCompositionMode = '';
    next.scoreEntities = {};
    next.scoreData = {
      gA: {
        scoresByPlayer: {
          'u-a1': { scores: fillScores(18, 4) },
          'u-a2': { scores: fillScores(9, 5) },
          'u-b1': { scores: fillScores(12, 3) },
          'u-b2': { scores: [] }
        }
      }
    };
    next.status = 'ongoing';
    return next;
  } else {
    next.strokeCompositionMode = '2+2';
    next.pairings = {};
  }
  next.scoreEntities = strokeEntityBuilder.syncStrokeEntities(next);
  var entityIds = [];
  Object.keys(next.scoreEntities || {}).forEach(function (gid) {
    (next.scoreEntities[gid] || []).forEach(function (ent) {
      if (ent && ent.entityId) entityIds.push({ groupId: gid, entityId: String(ent.entityId) });
    });
  });
  next.scoreData = {};
  entityIds.forEach(function (row, idx) {
    if (!next.scoreData[row.groupId]) next.scoreData[row.groupId] = { teamScoresByEntity: [] };
    next.scoreData[row.groupId].teamScoresByEntity.push({
      teamId: row.entityId,
      entityId: row.entityId,
      scores: idx === entityIds.length - 1 ? [] : fillScores(18, 4 + idx)
    });
  });
  next.status = 'ongoing';
  return next;
}

function writeGroupedMatch(matchRepo, match) {
  if (typeof matchRepo._inject !== 'function') {
    throw new Error('matchRepo._inject missing');
  }
  matchRepo._inject(match);
  return { ok: true };
}

function applyPageTotOverlay(vm, projected, totLabel) {
  var sharedEmpty = personalAdapter.emptySharedPersonalBoardFields();
  if (typeof adapter.applySeriesTotTeamBoardOverlay === 'function') {
    return adapter.applySeriesTotTeamBoardOverlay(vm, projected, totLabel);
  }
  if (projected && projected.useShared) {
    return Object.assign({}, vm, sharedEmpty, projected.overlay || {}, {
      leaderboardViewLabel:
        (projected.overlay && projected.overlay.leaderboardViewLabel) || totLabel,
      headPlayerLabel: 'TEAM',
      showEntityAllBoard: false,
      useLiveLeaderboard: false
    });
  }
  return Object.assign({}, vm, sharedEmpty, {
    boardView: 'team',
    selection: { view: 'team', scoreType: 'gross' },
    showTeamBoard: true,
    showEntityAllBoard: false,
    useLiveLeaderboard: false,
    listRows: [],
    listEmptyText: '',
    leaderboardViewLabel: totLabel,
    headPlayerLabel: 'TEAM'
  });
}

function wxmlConsumesTeamRows(standings) {
  if (!standings || standings.available === false) return 'unavailable';
  if (standings.useLiveLeaderboard) return 'live-leaderboard-board';
  if (!(standings.teamRows && standings.teamRows.length)) {
    return standings.listEmptyTitle || standings.listEmptyText || '暂无参赛主体';
  }
  return 'standings.teamRows';
}

function probeCase(label, gameMode, grouping) {
  var h = createHarness();
  var draft = buildDivisionSeriesDraft(gameMode);
  var saved = h.seriesStore.saveDraft(draft);
  if (!saved.ok) throw new Error('saveDraft failed');
  var series = saved.series;
  var pub = h.publisher.publishSeries(series.seriesId, { now: h.fixedNow });
  if (!pub.ok) throw new Error('publish failed: ' + pub.reason);
  series = h.seriesStore.getSeriesById(series.seriesId);
  var rounds = series.rounds || [];
  rounds.forEach(function (round) {
    var raw = h.matchRepo.getMatchById(round.matchId);
    if (grouping && grouping.skipGroup) return;
    var grouped = applyOfficialGrouping(raw, series, grouping);
    writeGroupedMatch(h.matchRepo, grouped);
  });
  series = h.seriesStore.getSeriesById(series.seriesId);
  var getMatchById = function (id) {
    return h.matchRepo.getMatchById(id);
  };
  var getIndexByMatchId = function (id) {
    return h.stationIndex.getByMatchId(id);
  };
  var firstMatch = getMatchById(rounds[0].matchId);
  var host = teamLeaderboardHost.createStandaloneHost({});
  var rnBoard = teamLeaderboardView.buildGrossTeamLeaderboardView(firstMatch, host) || [];
  var projected = adapter.projectSeriesStandingsTeamBoard({
    selectedKey: standingsVm.CUMULATIVE_KEY,
    series: series,
    getMatchById: getMatchById,
    getIndexByMatchId: getIndexByMatchId
  });
  var baseVm = standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: standingsVm.CUMULATIVE_KEY,
    roundStates: viewModel.projectRoundStatesFromRoundCards
      ? []
      : [],
    standingsResult: standingsVm.emptyStandingsResult()
  });
  var totLabel = standingsVm.buildTotTopMDescription(series);
  var pageStandings = applyPageTotOverlay(baseVm, projected, totLabel);
  var pageData = { standings: pageStandings };
  var staleEmpty = applyPageTotOverlay(
    baseVm,
    {
      useShared: true,
      verifiedOk: true,
      overlay: Object.assign({}, pageStandings, { teamRows: [], listEmptyText: '暂无榜单数据' })
    },
    totLabel
  );
  var guarded =
    typeof adapter.guardTotOverlayAgainstStaleEmpty === 'function'
      ? adapter.guardTotOverlayAgainstStaleEmpty(pageStandings, staleEmpty)
      : staleEmpty;

  var teamGroups = (firstMatch.teamGroups || []).map(function (g) {
    return {
      id: g && g.id,
      kind: g && g.kind,
      divisionId: g && g.divisionId,
      sourceTeamId: g && g.sourceTeamId,
      name: g && g.name
    };
  });
  var probe = {
    label: label,
    hostMode: series.hostMode,
    templateId: series.templateId,
    seriesParticipantMode: seriesStationMatch.resolveSeriesParticipantMode(series),
    scoringMode: series.scoringRule && series.scoringRule.mode,
    globalM: series.scoringRule && series.scoringRule.globalM,
    selectedRoundId: standingsVm.CUMULATIVE_KEY,
    isTot: true,
    useShared: !!(projected && projected.useShared),
    adapterReason: projected && projected.reason,
    verifiedOk: projected && projected.verifiedOk,
    adapterTeamRows: projected && projected.overlay && projected.overlay.teamRows
      ? projected.overlay.teamRows.length
      : null,
    vmTeamRows: (baseVm.teamRows || []).length,
    matchType: firstMatch && firstMatch.matchType,
    stationMatchIds: rounds.map(function (r) {
      return r.matchId;
    }),
    teamGroups: teamGroups,
    participantIds: (series.participants || []).map(function (p) {
      return {
        seriesParticipantId: p.seriesParticipantId,
        kind: p.kind,
        divisionId: p.divisionId,
        sourceTeamId: p.sourceTeamId
      };
    }),
    rnBoardLen: rnBoard.length,
    pageTeamRows: (pageData.standings.teamRows || []).length,
    wxmlSource: wxmlConsumesTeamRows(pageData.standings),
    firstEmpty:
      !series.hostMode
        ? 'hostMode'
        : !projected
          ? 'adapter_null'
          : projected.useShared !== true
            ? 'useShared'
            : !(projected.overlay && projected.overlay.teamRows && projected.overlay.teamRows.length)
              ? 'adapter.overlay.teamRows'
              : !(pageData.standings.teamRows && pageData.standings.teamRows.length)
                ? 'setData.standings.teamRows'
                : wxmlConsumesTeamRows(pageData.standings) !== 'standings.teamRows'
                  ? 'wxml'
                  : ''
  };
  console.log('TRACE  ' + JSON.stringify(probe, null, 2));
  return {
    series: series,
    projected: projected,
    pageStandings: pageStandings,
    guarded: guarded,
    firstMatch: firstMatch,
    probe: probe,
    idA: String(teamGroups[0] && teamGroups[0].id),
    nameA: teamGroups[0] && teamGroups[0].name
  };
}

var g1 = probeCase('G1-division', '个人比杆赛', { g1: true });
assert(
  'G1 真实链路 TOT 进入 adapter 且 teamRows 非空',
  g1.probe.useShared === true &&
    g1.probe.pageTeamRows > 0 &&
    g1.probe.wxmlSource === 'standings.teamRows',
  'firstEmpty=' + g1.probe.firstEmpty + ' reason=' + g1.probe.adapterReason
);
assert(
  'G1 分队 id/name 来自 teamGroups 而非手写 fixture',
  g1.pageStandings.teamRows.some(function (t) {
    return (
      String(t.teamId).indexOf(g1.idA) >= 0 ||
      String(t.seriesParticipantId).indexOf(g1.idA) >= 0
    ) && t.teamName === g1.nameA;
  })
);

var g2 = probeCase('G2-division', '四人四球比杆赛', {});
assert(
  'G2 真实链路 TOT 进入 adapter 且有组合展开',
  g2.probe.useShared === true &&
    g2.probe.pageTeamRows > 0 &&
    g2.pageStandings.teamRows.some(function (t) {
      return (t.players || []).some(function (p) {
        return p.isEntity === true;
      });
    }),
  'firstEmpty=' + g2.probe.firstEmpty + ' reason=' + g2.probe.adapterReason
);

var g3 = probeCase('G3-division', '最佳球位比杆赛', {});
assert(
  'G3 真实链路 TOT 非空',
  g3.probe.pageTeamRows > 0,
  'firstEmpty=' + g3.probe.firstEmpty
);

var failClosed = adapter.projectSeriesStandingsTeamBoard({
  selectedKey: standingsVm.CUMULATIVE_KEY,
  series: g1.series,
  getMatchById: function () {
    return { matchId: 'x', status: 'ongoing' };
  },
  getIndexByMatchId: function () {
    return null;
  }
});
var failPage = applyPageTotOverlay(
  g1.pageStandings,
  failClosed,
  standingsVm.buildTotTopMDescription(g1.series)
);
assert(
  'adapter 异常显示数据异常而非暂无参赛主体',
  failClosed.useShared === true &&
    failClosed.verifiedOk === false &&
    failPage.teamRows.length === 0 &&
    wxmlConsumesTeamRows(failPage).indexOf('暂无参赛主体') < 0 &&
    String(failPage.listEmptyText || failPage.listEmptyTitle || '').indexOf('异常') >= 0
);

assert(
  '后到空结果不能覆盖非空榜',
  g1.guarded.teamRows && g1.guarded.teamRows.length > 0
);

var interH = createHarness();
var interDraft = seriesModel.createEmptySeriesDraft({
  hostMode: 'organization',
  templateId: 'inter_team_series',
  seriesName: '队际回归',
  createdBy: 'creator-org-1',
  organization: {
    organizationId: 'org-1',
    organizationName: '湘鹰',
    organizationLogo: ''
  }
});
interDraft.participants = [
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
interDraft.visibility = 'public';
interDraft.scoringRule = seriesModel.createDefaultScoringRule({
  mode: 'global_m',
  globalM: 2,
  allowRepeat: false
});
interDraft.rounds = interDraft.rounds.map(function (r, idx) {
  var next = Object.assign({}, r);
  next.dateTime = '2030-08-0' + (idx + 1) + ' 08:00';
  next.gameMode = '个人比杆赛';
  next.courseId = 'c' + (idx + 1);
  next.courseName = '球场' + (idx + 1);
  next.fee = '';
  return next;
});
var interSaved = interH.seriesStore.saveDraft(interDraft);
var interPub = interH.publisher.publishSeries(interSaved.series.seriesId, { now: interH.fixedNow });
var interSeries = interH.seriesStore.getSeriesById(interSaved.series.seriesId);
var interTot = adapter.projectSeriesStandingsTeamBoard({
  selectedKey: standingsVm.CUMULATIVE_KEY,
  series: interSeries,
  getMatchById: function (id) {
    return interH.matchRepo.getMatchById(id);
  },
  getIndexByMatchId: function (id) {
    return interH.stationIndex.getByMatchId(id);
  }
});
assert(
  '队际 G1 TOT 仍 bypass 不走分队 adapter',
  interPub.ok && interTot && interTot.useShared === false && interTot.reason === 'tot'
);

var ung = probeCase('G1-ungrouped', '个人比杆赛', { skipGroup: true });
assert(
  '未分组也从 station teamGroups 出分队行，不伪造 roster',
  ung.probe.pageTeamRows === 2 &&
    ung.pageStandings.teamRows.every(function (t) {
      return t.hasScore !== true && String(t.grossTotalDisplay || t.scoreStr) === '-';
    })
);

var seriesJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var seriesWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');
assert(
  '页面 TOT overlay 走 adapter 接线 helper',
  seriesJs.indexOf('applySeriesTotTeamBoardOverlay') >= 0 &&
    seriesJs.indexOf('guardTotOverlayAgainstStaleEmpty') >= 0
);
assert(
  'WXML TOT 消费 standings.teamRows，异常不写死暂无参赛主体',
  seriesWxml.indexOf('standings.teamRows') >= 0 &&
    seriesWxml.indexOf('standings.listEmptyText') >= 0
);

console.log('');
console.log('---- seriesTotDivisionRuntimeWiring.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
