/**
 * SERIES-TOT-G2-G4-CROSS-MODE-COMPAT
 * global_m TOT：G2/G3/G4 同属 entity_stroke，跨轮可共同进入全局 M。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesTotG2G4CrossModeCompat.selftest.js
 */

var path = require('path');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var createDir = path.join(mini, 'subpackages', 'create', 'pages', 'series');

var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStoreMod = require(path.join(utilsDir, 'seriesStore.js'));
var seriesStationIndexMod = require(path.join(utilsDir, 'seriesStationIndex.js'));
var seriesPublishJournalMod = require(seriesTestPaths.util('seriesPublishJournal.js'));
var seriesPublish = require(seriesTestPaths.util('seriesPublish.js'));
var strokeEntityBuilder = require(path.join(utilsDir, 'strokeEntityBuilder.js'));
var strokeEntityValidator = require(path.join(utilsDir, 'strokeEntityValidator.js'));
var participantDraft = require(path.join(createDir, 'participantDraft.js'));
var adapter = require(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'));
var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));

var MODE_G2 = '四人四球比杆赛';
var MODE_G3 = '最佳球位比杆赛';
var MODE_G4 = '四人两球比杆赛';
var MODE_G1 = '个人比杆赛';
var MODE_MATCH = '个人比洞赛';

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

function applyEntityGrouping(match, opts) {
  var o = opts || {};
  var groups = Array.isArray(match.teamGroups) ? match.teamGroups : [];
  var idA = String(groups[0].id);
  var idB = String(groups[1].id);
  var nameA = groups[0].name || 'A';
  var nameB = groups[1].name || 'B';
  var next = JSON.parse(JSON.stringify(match));
  if (o.gameMode) next.gameMode = o.gameMode;
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
  if (o.g1) {
    next.pairings = {};
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
    return next;
  }
  if (o.g4) {
    next.pairings = {
      gA: [
        { id: next.matchId + '__gA__slot1', playerIds: ['u-a1', 'u-a2'] },
        { id: next.matchId + '__gA__slot2', playerIds: ['u-b1', 'u-b2'] }
      ]
    };
  } else {
    next.strokeCompositionMode = o.gameMode === MODE_G3 ? '4+0' : '2+2';
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
      scores: o.noScores ? [] : fillScores(18, 4 + idx)
    });
  });
  return next;
}

function groupingFor(mode) {
  if (mode === MODE_G1) return { gameMode: mode, g1: true };
  if (mode === MODE_G4) return { gameMode: mode, g4: true };
  if (mode === MODE_MATCH) return { gameMode: mode, g1: true };
  return { gameMode: mode };
}

function publishSeries(kind, initialMode) {
  var h = createHarness();
  var draft;
  if (kind === 'division') {
    draft = seriesModel.createEmptySeriesDraft({
      hostMode: 'team',
      templateId: 'division_series',
      seriesName: '跨赛制分队',
      createdBy: 'creator-cross',
      hostTeam: { teamId: 'team-host-1', teamName: '星途俱乐部', teamLogo: '' }
    });
    draft = participantDraft.ensureDefaultDivisionsIfNeeded(draft);
  } else {
    draft = seriesModel.createEmptySeriesDraft({
      hostMode: 'organization',
      templateId: 'inter_team_series',
      seriesName: '跨赛制队际',
      createdBy: 'creator-cross',
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
    mode: 'global_m',
    globalM: 2,
    allowRepeat: false,
    scoreBasis: 'gross'
  });
  draft.rounds = draft.rounds.map(function (r, idx) {
    var next = Object.assign({}, r);
    next.dateTime = '2030-08-0' + (idx + 1) + ' 08:00';
    next.gameMode = initialMode;
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

function groupRound(h, series, roundIndex, mode) {
  var round = series.rounds[roundIndex];
  var match = h.matchRepo.getMatchById(round.matchId);
  var grouped = applyEntityGrouping(match, groupingFor(mode));
  h.matchRepo._inject(grouped);
  series.rounds[roundIndex] = Object.assign({}, round, { gameMode: mode });
  return grouped;
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

function collectUnits(projected) {
  var out = [];
  ((projected.overlay && projected.overlay.teamRows) || []).forEach(function (team) {
    (team.players || []).forEach(function (p) {
      out.push(p);
    });
  });
  return out;
}

function assertCross(label, kind, modeA, modeB) {
  var ctx = publishSeries(kind, modeA);
  var m1 = groupRound(ctx.h, ctx.series, 0, modeA);
  var m2 = groupRound(ctx.h, ctx.series, 1, modeB);
  var projected = projectTot(ctx.h, ctx.series);
  var d = projected.totDebug || {};
  var units = collectUnits(projected);
  var r1 = ctx.series.rounds[0];
  var r2 = ctx.series.rounds[1];
  var r1Units = units.filter(function (p) {
    return String(p.roundId) === String(r1.roundId);
  });
  var r2Units = units.filter(function (p) {
    return String(p.roundId) === String(r2.roundId);
  });
  var counting = units.filter(function (p) {
    return p.isCounting === true;
  }).length;
  var mixedG4 = (modeA === MODE_G4) !== (modeB === MODE_G4);
  var expectedReason = mixedG4 ? 'tot_entity_stroke' : 'tot_g2g3_global_m';
  assert(
    label + ' TOT 成功且 family=entity_stroke',
    projected.verifiedOk === true &&
      projected.reason === expectedReason &&
      d.family === 'entity_stroke' &&
      d.failFn === '',
    'reason=' + projected.reason + ' family=' + d.family
  );
  assert(
    label + ' 两轮组合都进入 global M 且不拆个人',
    r1Units.length > 0 &&
      r2Units.length > 0 &&
      units.every(function (p) {
        return p.isEntity === true && Array.isArray(p.members) && p.members.length >= 2;
      }),
    'r1=' + r1Units.length + ' r2=' + r2Units.length
  );
  assert(
    label + ' 保留轮次/组号，记分卡指向原 station',
    r1Units.every(function (p) {
      return (
        String(p.stationMatchId) === String(m1.matchId) &&
        String(p.groupId) === 'gA' &&
        String(p.roundLabel || '').indexOf('R1') === 0
      );
    }) &&
      r2Units.every(function (p) {
        return (
          String(p.stationMatchId) === String(m2.matchId) &&
          String(p.groupId) === 'gA' &&
          String(p.roundLabel || '').indexOf('R2') === 0
        );
      })
  );
  var mSum = (projected.overlay.teamRows || []).reduce(function (n, t) {
    return n + Number(t.scoringPlayersCount || 0);
  }, 0);
  assert(
    label + ' 从全部组合实体取 M=2',
    (projected.overlay.teamRows || []).every(function (t) {
      return Number(t.scoringPlayersCount) <= 2;
    }) &&
      counting === mSum &&
      mSum >= 2 &&
      r1Units.some(function (p) {
        return p.isCounting === true;
      }) &&
      r2Units.some(function (p) {
        return p.isCounting === true;
      }),
    'counting=' + counting + ' mSum=' + mSum
  );
}

assert(
  '当前 family 映射：G2/G3=g2g3，G4=g4，G1=g1（修复前互斥源）',
  strokeEntityValidator.resolveStrokeKind(MODE_G2) === 'g2g3' &&
    strokeEntityValidator.resolveStrokeKind(MODE_G3) === 'g2g3' &&
    strokeEntityValidator.resolveStrokeKind(MODE_G4) === 'g4' &&
    strokeEntityValidator.resolveStrokeKind(MODE_G1) === 'g1'
);

assertCross('分队 R1=G2 R2=G3', 'division', MODE_G2, MODE_G3);
assertCross('分队 R1=G2 R2=G4', 'division', MODE_G2, MODE_G4);
assertCross('分队 R1=G3 R2=G4', 'division', MODE_G3, MODE_G4);
assertCross('队际 R1=G2 R2=G4', 'inter', MODE_G2, MODE_G4);
assertCross('队际 R1=G2 R2=G3', 'inter', MODE_G2, MODE_G3);

(function sameModeG2() {
  var ctx = publishSeries('division', MODE_G2);
  groupRound(ctx.h, ctx.series, 0, MODE_G2);
  groupRound(ctx.h, ctx.series, 1, MODE_G2);
  var projected = projectTot(ctx.h, ctx.series);
  assert(
    '同一赛制 G2 原路径不退化',
    projected.verifiedOk === true &&
      projected.reason === 'tot_g2g3_global_m' &&
      collectUnits(projected).every(function (p) {
        return p.isEntity === true;
      })
  );
})();

(function sameModeG4() {
  var ctx = publishSeries('inter', MODE_G4);
  groupRound(ctx.h, ctx.series, 0, MODE_G4);
  groupRound(ctx.h, ctx.series, 1, MODE_G4);
  var projected = projectTot(ctx.h, ctx.series);
  assert(
    '同一赛制 G4 原路径不退化',
    projected.verifiedOk === true &&
      projected.reason === 'tot_g4_global_m' &&
      collectUnits(projected).every(function (p) {
        return p.isEntity === true;
      })
  );
})();

(function g1g2StillMixed() {
  var ctx = publishSeries('division', MODE_G2);
  groupRound(ctx.h, ctx.series, 0, MODE_G2);
  groupRound(ctx.h, ctx.series, 1, MODE_G1);
  var projected = projectTot(ctx.h, ctx.series);
  var d = projected.totDebug || {};
  assert(
    'G1+G2 仍 mixed_game_mode',
    projected.verifiedOk === false &&
      projected.reason === 'mixed_game_mode' &&
      d.failFn === 'resolveTotStrokeFamily' &&
      d.failRoundId === ctx.series.rounds[1].roundId &&
      d.failStationMatchId === ctx.series.rounds[1].matchId,
    'reason=' + projected.reason + ' failFn=' + d.failFn
  );
})();

(function matchPlayRejected() {
  var ctx = publishSeries('division', MODE_G2);
  groupRound(ctx.h, ctx.series, 0, MODE_G2);
  groupRound(ctx.h, ctx.series, 1, MODE_MATCH);
  var projected = projectTot(ctx.h, ctx.series);
  assert(
    '非比杆/比洞仍拒绝',
    projected.verifiedOk === false && projected.reason === 'mixed_game_mode',
    'reason=' + projected.reason
  );
})();

console.log('');
console.log('---- seriesTotG2G4CrossModeCompat.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
