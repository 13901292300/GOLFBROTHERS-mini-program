/**
 * SERIES-RN-ALL-VIEW-ENTITY-RANKING-FIX
 * Series Rn all：G2/G3/G4 全部正式组合统一排名；G1 仍个人。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesRnAllViewEntityRanking.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');

var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var strokeEntityBuilder = require(path.join(utilsDir, 'strokeEntityBuilder.js'));
var personalLeaderboardBoard = require(path.join(utilsDir, 'personalLeaderboardBoard.js'));
var personalAdapter = require(path.join(seriesDir, 'seriesPersonalLeaderboardAdapter.js'));
var teamAdapter = require(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'));
var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));
var viewOptions = require(path.join(seriesDir, 'seriesStandingsViewOptions.js'));

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
    { userId: 'u-r1', nickname: '红一', gender: 'male', matchTeamId: 'red', matchTeamName: '红队' },
    { userId: 'u-r2', nickname: '红二', gender: 'male', matchTeamId: 'red', matchTeamName: '红队' },
    { userId: 'u-b1', nickname: '蓝一', gender: 'female', matchTeamId: 'blue', matchTeamName: '蓝队' },
    { userId: 'u-b2', nickname: '蓝二', gender: 'male', matchTeamId: 'blue', matchTeamName: '蓝队' }
  ];
}

function makeSeries(partial) {
  return Object.assign(
    {
      seriesId: 'series-rn-all',
      seriesName: '全部视图系列赛',
      publishToken: 'pub-rn-all',
      createdBy: 'creator-1',
      hostMode: 'inter-team',
      lifecycleStatus: 'published',
      scoringRule: {
        mode: 'global_m',
        globalM: 2,
        allowRepeat: false,
        scoreBasis: 'gross',
        ruleVersion: 1
      },
      participants: [
        { seriesParticipantId: 'team:red', kind: 'team', sourceTeamId: 'red', nameSnapshot: '红队' },
        { seriesParticipantId: 'team:blue', kind: 'team', sourceTeamId: 'blue', nameSnapshot: '蓝队' }
      ],
      rounds: []
    },
    partial || {}
  );
}

function makeRound(opts) {
  var o = opts || {};
  return {
    roundId: o.roundId || 'r1',
    index: o.index || 1,
    matchId: o.matchId || 'm-r1',
    gameMode: o.gameMode,
    roundStatus: 'scheduled',
    name: o.name || 'ROUND 1',
    courseId: 'c1',
    courseName: '测试球场',
    courseHalfText: 'A / B',
    front9Course: 'A',
    back9Course: 'B',
    dateTime: '2026-08-01 08:00',
    fee: ''
  };
}

function makeIndex(roundId, series) {
  return {
    seriesId: series.seriesId,
    roundId: roundId,
    publishToken: series.publishToken
  };
}

function applyFormalGrouping(match, opts) {
  var o = opts || {};
  var next = JSON.parse(JSON.stringify(match));
  next.registerInfo = { totalCount: 4, users: users() };
  next.groups = [
    {
      groupId: 'gA',
      groupName: 'A组',
      players: [
        { userId: 'u-r1', position: 1, matchTeamId: 'red' },
        { userId: 'u-r2', position: 2, matchTeamId: 'red' },
        { userId: 'u-b1', position: 3, matchTeamId: 'blue' },
        { userId: 'u-b2', position: 4, matchTeamId: 'blue' }
      ]
    }
  ];
  if (o.g4) {
    next.pairings = {
      gA: [
        { id: next.matchId + '__gA__slot1', playerIds: ['u-r1', 'u-r2'] },
        { id: next.matchId + '__gA__slot2', playerIds: ['u-b1', 'u-b2'] }
      ]
    };
  } else if (o.g1) {
    next.pairings = {};
    next.strokeCompositionMode = '';
  } else {
    next.strokeCompositionMode = '2+2';
    next.pairings = {};
  }
  if (!o.g1) next.scoreEntities = strokeEntityBuilder.syncStrokeEntities(next);
  else next.scoreEntities = {};
  next.status = 'ongoing';
  if (o.g1) {
    next.scoreData = {
      gA: {
        scoresByPlayer: {
          'u-r1': { scores: fillScores(18, 4) },
          'u-r2': { scores: fillScores(18, 5) },
          'u-b1': { scores: fillScores(9, 4) },
          'u-b2': { scores: fillScores(18, 6) }
        }
      }
    };
    return next;
  }
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

function buildLiveStation(series, round, grouping) {
  var built = seriesStationMatch.buildMatchFromSeriesRound(series, round, {
    matchId: round.matchId,
    publishToken: series.publishToken,
    creatorId: series.createdBy
  });
  if (!built.ok) throw new Error(built.reason);
  return applyFormalGrouping(built.match, grouping);
}

function sharedEntityRows(match) {
  var board = personalLeaderboardBoard.buildPersonalLeaderboardBoard(match, {
    view: 'all',
    scoreType: 'gross'
  });
  return (board && board.leaderboard) || [];
}

function entityShape(rows) {
  return (rows || []).map(function (row) {
    return {
      isEntity: !!(row && row.isEntity),
      entityId: String((row && row.entityId) || ''),
      playerId: String((row && row.playerId) || ''),
      pos: String(row && row.pos),
      thru: String(row && row.thru),
      toPar: row && row.toPar,
      teamName: String((row && row.teamName) || ''),
      members: (Array.isArray(row && row.members) ? row.members : [])
        .map(function (m) {
          return String((m && (m.userId || m.playerId)) || '');
        })
        .filter(Boolean)
        .sort()
        .join(',')
    };
  });
}

function firstDiff(a, b, prefix) {
  var pathPrefix = prefix || '';
  if (a === b) return '';
  if (a == null || b == null) return pathPrefix || '<root>';
  if (typeof a !== 'object' || typeof b !== 'object') return pathPrefix || '<root>';
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return pathPrefix || '<root>';
    }
    for (var i = 0; i < a.length; i++) {
      var d = firstDiff(a[i], b[i], pathPrefix + '[' + i + ']');
      if (d) return d;
    }
    return '';
  }
  var keys = {};
  Object.keys(a)
    .concat(Object.keys(b))
    .forEach(function (k) {
      keys[k] = true;
    });
  var names = Object.keys(keys).sort();
  for (var n = 0; n < names.length; n++) {
    var key = names[n];
    var next = pathPrefix ? pathPrefix + '.' + key : key;
    if (!Object.prototype.hasOwnProperty.call(a, key) || !Object.prototype.hasOwnProperty.call(b, key)) {
      return next;
    }
    var inner = firstDiff(a[key], b[key], next);
    if (inner) return inner;
  }
  return '';
}

function projectAll(series, round, match) {
  return personalAdapter.projectSeriesStandingsPersonalBoard({
    selectedKey: round.roundId,
    selection: { view: 'all', scoreType: 'gross' },
    series: series,
    round: round,
    match: match,
    indexLink: makeIndex(round.roundId, series)
  });
}

function projectTeam(series, round, match) {
  return teamAdapter.projectSeriesStandingsTeamBoard({
    selectedKey: round.roundId,
    series: series,
    round: round,
    match: match,
    indexLink: makeIndex(round.roundId, series)
  });
}

function projectTot(series, matches) {
  var byId = {};
  matches.forEach(function (m) {
    byId[m.matchId] = m;
  });
  return teamAdapter.projectSeriesStandingsTeamBoard({
    selectedKey: standingsVm.CUMULATIVE_KEY,
    series: series,
    getMatchById: function (id) {
      return byId[id] || null;
    },
    getIndexByMatchId: function (id) {
      var m = byId[id];
      if (!m) return null;
      return makeIndex(m.seriesContext.roundId, series);
    }
  });
}

function applyOverlay(view, teamProjected, allProjected, totProjected) {
  var empty = personalAdapter.emptySharedPersonalBoardFields();
  if (view === 'tot') {
    return Object.assign({}, empty, (totProjected && totProjected.overlay) || {}, {
      showEntityAllBoard: false,
      showTeamBoard: true
    });
  }
  if (view === 'team') {
    return Object.assign({}, empty, (teamProjected && teamProjected.overlay) || {}, {
      showEntityAllBoard: false
    });
  }
  return Object.assign({}, empty, (allProjected && allProjected.overlay) || {}, {
    showSharedPersonalBoard: false,
    showEntityAllBoard: true,
    showTeamBoard: false
  });
}

function runModeCase(label, gameMode, grouping, expectKind) {
  var series = makeSeries({
    seriesId: 'series-' + label,
    publishToken: 'pub-' + label,
    rounds: [
      makeRound({
        roundId: grouping.g1 ? 'r1' : label.indexOf('R2') >= 0 ? 'r2' : 'r1',
        index: label.indexOf('R2') >= 0 ? 2 : 1,
        matchId: 'm-' + label,
        gameMode: gameMode,
        name: label
      })
    ]
  });
  var round = series.rounds[0];
  var match = buildLiveStation(series, round, grouping);
  var all = projectAll(series, round, match);
  var shared = sharedEntityRows(match);
  var rows = (all.overlay && all.overlay.listRows) || [];
  var personalRows = (all.overlay && all.overlay.personalLeaderboard) || [];

  if (expectKind === 'g1') {
    assert(label + ' G1 all 走个人榜组件', all.useShared === true && all.overlay.showSharedPersonalBoard === true);
    assert(
      label + ' G1 行是个人不是组合',
      ((all.overlay && all.overlay.personalLeaderboard) || []).length >= 4 &&
        (all.overlay.personalLeaderboard || []).every(function (r) {
          return r.isEntity !== true && !!r.playerId;
        })
    );
    return { series: series, round: round, match: match, all: all };
  }

  assert(
    label + ' all 不落入 shared personal board',
    all.reason === 'entity_all' &&
      all.useShared === false &&
      all.overlay.showSharedPersonalBoard === false &&
      all.overlay.showEntityAllBoard === true &&
      all.overlay.showTeamBoard === false,
    all.reason
  );
  assert(label + ' 调用 buildPersonalLeaderboardBoard', all.calledShared === true);
  var diff = firstDiff(entityShape(shared), entityShape(rows));
  assert(label + ' 与普通单场 all entity 输出一致', !diff, diff || '');
  assert(
    label + ' 全部是组合且无独立个人行',
    rows.length > 0 &&
      personalRows.length === 0 &&
      rows.every(function (r) {
        return r.isEntity === true && !r.playerId && Array.isArray(r.members) && r.members.length > 0;
      })
  );
  var ids = rows.map(function (r) {
    return r.entityId;
  });
  assert(
    label + ' 同一组合只出现一次',
    ids.length === ids.filter(function (id, i) {
      return ids.indexOf(id) === i;
    }).length
  );
  var teams = {};
  rows.forEach(function (r) {
    teams[r.teamName || r.teamGroupId] = true;
  });
  assert(label + ' 跨球队统一排名', Object.keys(teams).length >= 2);
  var sorted = rows
    .filter(function (r) {
      return r.hasScore;
    })
    .map(function (r) {
      return Number(r.toPar);
    });
  var ordered = sorted.slice().sort(function (a, b) {
    return a - b;
  });
  assert(label + ' 按 To Par 统一排序', JSON.stringify(sorted) === JSON.stringify(ordered));
  assert(
    label + ' scorecard 指向当前 round/station/entity',
    rows.every(function (r) {
      return (
        r.roundId === round.roundId &&
        r.stationMatchId === match.matchId &&
        r.matchId === match.matchId &&
        !!r.entityId &&
        r.canOpenScorecard === true &&
        String(r.scorecardKey).indexOf(r.entityId) >= 0
      );
    })
  );
  return { series: series, round: round, match: match, all: all };
}

var g1 = runModeCase('G1-all', '个人比杆赛', { g1: true }, 'g1');
var g2 = runModeCase('G2-R1-all', '四人四球比杆赛', {}, 'g2g3');
var g3 = runModeCase('G3-R2-all', '最佳球位比杆赛', {}, 'g2g3');
var g4 = runModeCase('G4-all', '四人两球比杆赛', { g4: true }, 'g4');

(function testRoundTrip() {
  var liveAdapter = require(path.join(seriesDir, 'seriesLiveLeaderboardAdapter.js'));
  var series = g2.series;
  var round = g2.round;
  var match = g2.match;
  var tot = projectTot(series, [match]);
  function projectLive(view) {
    return liveAdapter.projectSeriesRnLiveLeaderboard({
      selectedKey: round.roundId,
      selection: { view: view, scoreType: 'gross' },
      series: series,
      round: round,
      match: match,
      indexLink: makeIndex(round.roundId, series)
    });
  }
  var seq = ['team', 'all', 'tot', 'all', 'team'];
  var lastAllIds = null;
  seq.forEach(function (step) {
    var applied;
    if (step === 'tot') {
      applied = Object.assign(
        {},
        personalAdapter.emptySharedPersonalBoardFields(),
        (tot && tot.overlay) || {},
        { useLiveLeaderboard: false, showTeamBoard: true }
      );
    } else {
      applied = Object.assign({}, (projectLive(step).overlay) || {});
    }
    if (step === 'all') {
      assert(
        '往返 ' + step + ' 仍是共享 all',
        applied.useLiveLeaderboard === true &&
          applied.liveView === 'all' &&
          applied.showSharedPersonalBoard === false
      );
      var ids = (applied.liveLeaderboard || []).map(function (r) {
        return r.entityId;
      });
      if (lastAllIds) {
        assert('往返 all 不串入其他数据', JSON.stringify(ids) === JSON.stringify(lastAllIds));
      }
      lastAllIds = ids;
      assert(
        '往返 all 不含 TOT 行',
        (applied.liveLeaderboard || []).every(function (r) {
          return r.isEntity === true && r.matchId === match.matchId;
        })
      );
    } else if (step === 'team') {
      assert(
        '往返 team 仍是球队榜',
        applied.useLiveLeaderboard === true && applied.liveView === 'team'
      );
    } else {
      assert('往返 TOT 不是 Rn all', applied.useLiveLeaderboard !== true);
    }
  });
  var remembered = viewOptions.normalizeSeriesStandingsSelection(match, { view: 'all', scoreType: 'gross' });
  assert('确认 all 后会话仍是 all', remembered.view === 'all');
  var packed = viewOptions.buildSeriesLeaderboardSettingSections(match, remembered);
  assert(
    '设置仍提供 all 选项',
    packed.sections[1].options.some(function (o) {
      return o.key === 'all';
    }) && packed.draftValues.view === 'all'
  );
})();

(function testSource() {
  var adapterSrc = fs.readFileSync(path.join(seriesDir, 'seriesPersonalLeaderboardAdapter.js'), 'utf8');
  var seriesJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
  var seriesWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');
  var teamSrc = fs.readFileSync(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'), 'utf8');
  assert(
    'entity all 复用 buildPersonalLeaderboardBoard / buildEntityLeaderboardRows',
    adapterSrc.indexOf('shouldBuildEntityLeaderboard') >= 0 &&
      adapterSrc.indexOf('reason: \'entity_all\'') >= 0 &&
      adapterSrc.indexOf('buildPersonalLeaderboardBoard') >= 0
  );
  assert(
    '页面 all 确认后走共享 LIVE 组件',
    seriesJs.indexOf('projectSeriesRnLiveLeaderboard') >= 0 &&
      seriesWxml.indexOf('standings.useLiveLeaderboard') >= 0 &&
      seriesWxml.indexOf('<live-leaderboard-board') >= 0
  );
  var totFn = teamSrc.slice(teamSrc.indexOf('function projectSeriesTotG2G3TeamBoard'));
  assert('未改 TOT 选优函数名', totFn.indexOf('assembleGrossTeams') >= 0);
})();

console.log('');
console.log('---- seriesRnAllViewEntityRanking.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
