/**
 * SERIES-TOT-DIVISION-FAIL-CLOSED-REASON
 * 真实 division_series publish：定位 TOT fail closed 的精确 reason / 轮次。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesTotDivisionFailClosedReason.selftest.js
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
var participantDraft = require(path.join(createDir, 'participantDraft.js'));
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

function buildDraft(gameMode) {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'team',
    templateId: 'division_series',
    seriesName: '分队定位赛',
    createdBy: 'creator-div-fc',
    hostTeam: { teamId: 'team-host-1', teamName: '星途俱乐部', teamLogo: '' }
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

function applyGrouping(match, opts) {
  var o = opts || {};
  var groups = Array.isArray(match.teamGroups) ? match.teamGroups : [];
  var idA = String(groups[0].id);
  var idB = String(groups[1].id);
  var nameA = groups[0].name || '分队 A';
  var nameB = groups[1].name || '分队 B';
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
  next.status = o.status || 'ongoing';
  if (o.g1) {
    next.pairings = {};
    next.scoreEntities = {};
    next.scoreData = {
      gA: {
        scoresByPlayer: o.noScores
          ? {
              'u-a1': { scores: [] },
              'u-a2': { scores: [] },
              'u-b1': { scores: [] },
              'u-b2': { scores: [] }
            }
          : {
              'u-a1': { scores: fillScores(o.partial ? 6 : 18, 4) },
              'u-a2': { scores: o.partial ? [] : fillScores(9, 5) },
              'u-b1': { scores: o.partial ? [] : fillScores(12, 3) },
              'u-b2': { scores: [] }
            }
      }
    };
    return next;
  }
  next.strokeCompositionMode = '2+2';
  next.pairings = {};
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
    var scores = [];
    if (!o.noScores) {
      if (o.partial) scores = idx === 0 ? fillScores(6, 4) : [];
      else scores = idx === entityIds.length - 1 ? [] : fillScores(18, 4 + idx);
    }
    next.scoreData[row.groupId].teamScoresByEntity.push({
      teamId: row.entityId,
      entityId: row.entityId,
      scores: scores
    });
  });
  return next;
}

function publishSeries(gameMode) {
  var h = createHarness();
  var saved = h.seriesStore.saveDraft(buildDraft(gameMode));
  var pub = h.publisher.publishSeries(saved.series.seriesId, { now: h.fixedNow });
  if (!pub.ok) throw new Error('publish failed: ' + pub.reason);
  return {
    h: h,
    series: h.seriesStore.getSeriesById(saved.series.seriesId)
  };
}

function projectTot(h, series, hooks) {
  var extra = hooks || {};
  return adapter.projectSeriesStandingsTeamBoard({
    selectedKey: standingsVm.CUMULATIVE_KEY,
    series: series,
    getMatchById: extra.getMatchById || function (id) {
      return h.matchRepo.getMatchById(id);
    },
    getIndexByMatchId: extra.getIndexByMatchId || function (id) {
      return h.stationIndex.getByMatchId(id);
    }
  });
}

function debugOf(projected) {
  return (projected && (projected.totDebug || (projected.overlay && projected.overlay.totDebug))) || {};
}

function trace(label, projected) {
  var d = debugOf(projected);
  console.log(
    'TRACE  ' +
      label +
      ' reason=' +
      (projected && projected.reason) +
      ' failFn=' +
      (d.failFn || '') +
      ' failRound=' +
      (d.failRoundId || '') +
      ' rows=' +
      ((projected && projected.overlay && projected.overlay.teamRows) || []).length
  );
}

(function bothUngrouped() {
  var ctx = publishSeries('个人比杆赛');
  var projected = projectTot(ctx.h, ctx.series);
  trace('两轮均未分组', projected);
  var d = debugOf(projected);
  assert(
    '两轮均未分组不是数据异常',
    projected.verifiedOk === true &&
      projected.overlay.teamRows.length === 2 &&
      projected.overlay.listEmptyText !== '系列赛比赛数据异常' &&
      d.ok === true
  );
})();

(function r1GroupedR2Empty() {
  var ctx = publishSeries('四人四球比杆赛');
  var r1 = ctx.series.rounds[0];
  var grouped = applyGrouping(ctx.h.matchRepo.getMatchById(r1.matchId), {});
  ctx.h.matchRepo._inject(grouped);
  var projected = projectTot(ctx.h, ctx.series);
  trace('R1已分组 R2未分组', projected);
  var d = debugOf(projected);
  assert(
    'R1 已分组、R2 未分组不是数据异常',
    projected.verifiedOk === true &&
      projected.overlay.teamRows.length === 2 &&
      d.ok === true &&
      (d.errors || []).some(function (row) {
        return row.roundId === r1.roundId && row.filledGroups === true;
      }) &&
      (d.errors || []).some(function (row) {
        return row.roundId === ctx.series.rounds[1].roundId && row.filledGroups === false;
      }),
    'reason=' + (projected && projected.reason) + ' failFn=' + (d.failFn || '')
  );
  assert(
    'R1 组合进入 TOT，R2 未分组只留分队空行',
    projected.overlay.teamRows.some(function (t) {
      return (t.players || []).some(function (p) {
        return p.isEntity === true && p.roundId === r1.roundId;
      });
    })
  );
})();

(function groupedNoScore() {
  var ctx = publishSeries('个人比杆赛');
  ctx.series.rounds.forEach(function (round) {
    ctx.h.matchRepo._inject(
      applyGrouping(ctx.h.matchRepo.getMatchById(round.matchId), { g1: true, noScores: true })
    );
  });
  var projected = projectTot(ctx.h, ctx.series);
  trace('已分组未记分', projected);
  assert(
    '已分组未记分不是异常，显示 -',
    projected.verifiedOk === true &&
      projected.overlay.teamRows.length === 2 &&
      projected.overlay.teamRows.every(function (t) {
        return String(t.scoreStr) === '-' && String(t.grossTotalDisplay) === '-';
      })
  );
})();

(function partialLive() {
  var ctx = publishSeries('个人比杆赛');
  var r1 = ctx.series.rounds[0];
  ctx.h.matchRepo._inject(
    applyGrouping(ctx.h.matchRepo.getMatchById(r1.matchId), { g1: true, partial: true })
  );
  var projected = projectTot(ctx.h, ctx.series);
  trace('部分 LIVE 成绩', projected);
  assert(
    '部分 LIVE 成绩 TOT 非空且非异常',
    projected.verifiedOk === true &&
      projected.overlay.teamRows.some(function (t) {
        return t.hasScore === true;
      })
  );
})();

(function r2IndexMissing() {
  var ctx = publishSeries('个人比杆赛');
  var r2 = ctx.series.rounds[1];
  var projected = projectTot(ctx.h, ctx.series, {
    getIndexByMatchId: function (id) {
      if (String(id) === String(r2.matchId)) return null;
      return ctx.h.stationIndex.getByMatchId(id);
    }
  });
  trace('R2 index_missing 软跳过', projected);
  var d = debugOf(projected);
  assert(
    'R2 index_missing 跳过该轮，TOT 仍有分队行',
    projected.verifiedOk === true &&
      projected.overlay.teamRows.length === 2 &&
      (d.errors || []).some(function (row) {
        return row.roundId === r2.roundId && row.verify === 'index_missing';
      }),
    'reason=' + (projected && projected.reason)
  );
})();

(function contextMismatch() {
  var ctx = publishSeries('个人比杆赛');
  var r1 = ctx.series.rounds[0];
  var projected = projectTot(ctx.h, ctx.series, {
    getMatchById: function (id) {
      var match = ctx.h.matchRepo.getMatchById(id);
      if (String(id) !== String(r1.matchId) || !match) return match;
      var next = JSON.parse(JSON.stringify(match));
      next.seriesContext.roundId = 'wrong-round';
      return next;
    }
  });
  trace('roundId/context 不匹配', projected);
  var d = debugOf(projected);
  assert(
    '真正 roundId/context 不匹配仍 fail closed',
    projected.verifiedOk === false &&
      projected.reason === 'context_round_id_conflict' &&
      d.failFn === 'verifyManagedStation' &&
      d.failRoundId === r1.roundId &&
      projected.overlay.listEmptyText === '系列赛比赛数据异常' &&
      projected.overlay.teamRows.length === 0
  );
})();

assert(
  'toast 文案仍为系列赛比赛数据异常',
  adapter.projectSeriesStandingsTeamBoard({
    selectedKey: 'cumulative',
    series: {
      hostMode: 'team',
      templateId: 'division_series',
      scoringRule: { mode: 'global_m', globalM: 2 },
      rounds: [{ roundId: 'r1', matchId: 'm1', gameMode: '个人比杆赛' }],
      participants: []
    },
    getMatchById: function () {
      return { matchId: 'm1', seriesContext: { managed: false } };
    },
    getIndexByMatchId: function () {
      return { seriesId: 'x', roundId: 'r1' };
    }
  }).overlay.listEmptyText === '系列赛比赛数据异常'
);

console.log('');
console.log('---- seriesTotDivisionFailClosedReason.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
