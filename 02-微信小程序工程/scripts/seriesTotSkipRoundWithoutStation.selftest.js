/**
 * SERIES-TOT-SKIP-ROUND-WITHOUT-STATION
 * 真机：R2 无 stationMatchId 不得在过滤前进入 stroke family 比较。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesTotSkipRoundWithoutStation.selftest.js
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
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
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
    seriesName: '分队 skip-no-station',
    createdBy: 'creator-div-skip',
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
    next.gameMode = '个人比杆赛';
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
    next.scoreData[row.groupId].teamScoresByEntity.push({
      teamId: row.entityId,
      entityId: row.entityId,
      scores: fillScores(18, 4 + idx)
    });
  });
  return next;
}

function publishFourball() {
  var h = createHarness();
  var saved = h.seriesStore.saveDraft(buildDraft('四人四球比杆赛'));
  var pub = h.publisher.publishSeries(saved.series.seriesId, { now: h.fixedNow });
  if (!pub.ok) throw new Error('publish failed: ' + pub.reason);
  return {
    h: h,
    series: h.seriesStore.getSeriesById(saved.series.seriesId)
  };
}

function detachR2(series) {
  var next = JSON.parse(JSON.stringify(series));
  var r2 = next.rounds[1];
  r2.matchId = '';
  r2.stationMatchId = '';
  r2.gameMode = '个人比杆赛';
  return next;
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

function debugOf(projected) {
  return (projected && (projected.totDebug || (projected.overlay && projected.overlay.totDebug))) || {};
}

function entityRoundIds(projected) {
  var ids = [];
  ((projected.overlay && projected.overlay.teamRows) || []).forEach(function (team) {
    (team.players || []).forEach(function (p) {
      if (p && p.roundId) ids.push(String(p.roundId));
    });
  });
  return ids;
}

function attachR2Station(h, series, gameMode, grouping) {
  var next = JSON.parse(JSON.stringify(series));
  var r2 = next.rounds[1];
  var matchId = 'team-match-r2-later-' + String(gameMode === '个人比杆赛' ? 'g1' : 'g2');
  r2.matchId = matchId;
  r2.stationMatchId = matchId;
  r2.gameMode = gameMode;
  var built = seriesStationMatch.buildMatchFromSeriesRound(next, r2, {
    matchId: matchId,
    publishToken: next.publishToken,
    creatorId: next.createdBy
  });
  if (!built.ok) throw new Error('buildMatchFromSeriesRound: ' + built.reason);
  var grouped = applyGrouping(built.match, grouping);
  h.matchRepo._inject(grouped);
  var linked = h.stationIndex.setLink(matchId, next.seriesId, r2.roundId);
  if (!linked || !linked.ok) throw new Error('setLink failed');
  return next;
}

(function deviceShapeR2NoStation() {
  var ctx = publishFourball();
  var r1 = ctx.series.rounds[0];
  ctx.h.matchRepo._inject(applyGrouping(ctx.h.matchRepo.getMatchById(r1.matchId), {}));
  var series = detachR2(ctx.series);
  var projected = projectTot(ctx.h, series);
  var d = debugOf(projected);
  var rounds = entityRoundIds(projected);
  console.log(
    'TRACE  R2无station reason=' +
      (projected && projected.reason) +
      ' failFn=' +
      (d.failFn || '') +
      ' failRound=' +
      (d.failRoundId || '') +
      ' failStation=' +
      JSON.stringify(d.failStationMatchId || '') +
      ' entityRounds=' +
      rounds.join(',')
  );
  assert(
    'R1 有 station 已分组、R2 无 stationMatchId 时 TOT 成功',
    projected.verifiedOk === true &&
      projected.reason !== 'mixed_game_mode' &&
      d.ok === true &&
      d.failFn === '' &&
      d.failRoundId === '' &&
      d.failStationMatchId === '',
    'reason=' + (projected && projected.reason) + ' failFn=' + (d.failFn || '')
  );
  assert(
    '只汇总 R1，R2 不进入 global M',
    rounds.length > 0 &&
      rounds.every(function (id) {
        return id === String(r1.roundId);
      }) &&
      !(d.errors || []).some(function (row) {
        return row.roundId === series.rounds[1].roundId && row.skipped !== 'no_station';
      }),
    'rounds=' + rounds.join(',')
  );
  assert(
    '无 station 轮次保留分队空行且不伪造成绩',
    projected.overlay.teamRows.length === 2 &&
      projected.overlay.teamRows.every(function (t) {
        return (t.players || []).every(function (p) {
          return String(p.roundId) === String(r1.roundId);
        });
      })
  );
})();

(function r2LaterJoinsTot() {
  var ctx = publishFourball();
  var r1 = ctx.series.rounds[0];
  ctx.h.matchRepo._inject(applyGrouping(ctx.h.matchRepo.getMatchById(r1.matchId), {}));
  var detached = detachR2(ctx.series);
  var withR2 = attachR2Station(ctx.h, detached, '四人四球比杆赛', {});
  var projected = projectTot(ctx.h, withR2);
  var d = debugOf(projected);
  var rounds = entityRoundIds(projected);
  assert(
    'R2 后来创建 station 并分组后加入 TOT',
    projected.verifiedOk === true &&
      d.failFn === '' &&
      rounds.indexOf(String(r1.roundId)) >= 0 &&
      rounds.indexOf(String(withR2.rounds[1].roundId)) >= 0,
    'reason=' + (projected && projected.reason) + ' rounds=' + rounds.join(',')
  );
})();

(function r2LaterIncompatibleStillFail() {
  var ctx = publishFourball();
  var r1 = ctx.series.rounds[0];
  ctx.h.matchRepo._inject(applyGrouping(ctx.h.matchRepo.getMatchById(r1.matchId), {}));
  var detached = detachR2(ctx.series);
  var withR2 = attachR2Station(ctx.h, detached, '个人比杆赛', { g1: true });
  var projected = projectTot(ctx.h, withR2);
  var d = debugOf(projected);
  assert(
    'R2 创建 station 且正式分组为不兼容赛制仍 mixed_game_mode',
    projected.verifiedOk === false &&
      projected.reason === 'mixed_game_mode' &&
      d.failFn === 'resolveTotStrokeFamily' &&
      d.failRoundId === withR2.rounds[1].roundId &&
      d.failStationMatchId === withR2.rounds[1].matchId,
    'reason=' +
      (projected && projected.reason) +
      ' failFn=' +
      (d.failFn || '') +
      ' failRound=' +
      (d.failRoundId || '') +
      ' failStation=' +
      (d.failStationMatchId || '')
  );
})();

console.log('');
console.log('---- seriesTotSkipRoundWithoutStation.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
