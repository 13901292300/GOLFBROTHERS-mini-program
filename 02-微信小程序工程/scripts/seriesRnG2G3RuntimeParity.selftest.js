/**
 * SERIES-RN-G2G3-RUNTIME-PARITY-FIX
 * 真实分站结构：buildMatchFromSeriesRound → 分组写盘口径 syncStrokeEntities →
 * 普通 detail builder vs Series Rn 实际入口。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesRnG2G3RuntimeParity.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');

var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var strokeEntityBuilder = require(path.join(utilsDir, 'strokeEntityBuilder.js'));
var strokeEntityValidator = require(path.join(utilsDir, 'strokeEntityValidator.js'));
var personalLeaderboardBoard = require(path.join(utilsDir, 'personalLeaderboardBoard.js'));
var teamLeaderboardView = require(path.join(utilsDir, 'teamLeaderboardView.js'));
var teamLeaderboardHost = require(path.join(utilsDir, 'teamLeaderboardHost.js'));
var leaderboardSettingViewModel = require(path.join(utilsDir, 'leaderboardSettingViewModel.js'));
var adapter = require(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'));
var viewOptions = require(path.join(seriesDir, 'seriesStandingsViewOptions.js'));
var personalAdapter = require(path.join(seriesDir, 'seriesPersonalLeaderboardAdapter.js'));

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
      seriesId: 'series-rn-parity',
      seriesName: '运行时对拍系列赛',
      publishToken: 'pub-rn-parity',
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
    courseLocation: '',
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
  next.registerInfo = {
    totalCount: 4,
    users: users()
  };
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
  } else {
    next.strokeCompositionMode = '2+2';
    next.pairings = {};
  }
  next.scoreEntities = strokeEntityBuilder.syncStrokeEntities(next);
  next.status = 'ongoing';
  next.statusLabel = '进行中';
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
  if (!built.ok) {
    throw new Error('buildMatchFromSeriesRound failed: ' + built.reason);
  }
  return applyFormalGrouping(built.match, grouping);
}

function detailShouldBuildEntityLeaderboard(match) {
  var gameMode = String((match && (match.gameMode || match.selectedGameMode)) || '').trim();
  if (gameMode === '个人比杆赛' || strokeEntityValidator.isG5MatchPlayMode(gameMode)) {
    return false;
  }
  var scoreEntities =
    match &&
    match.scoreEntities &&
    typeof match.scoreEntities === 'object' &&
    !Array.isArray(match.scoreEntities)
      ? match.scoreEntities
      : null;
  if (!scoreEntities) return false;
  var keys = Object.keys(scoreEntities);
  for (var i = 0; i < keys.length; i++) {
    var list = scoreEntities[keys[i]];
    if (Array.isArray(list) && list.length > 0) return true;
  }
  return false;
}

function buildDetailGrossTeams(match) {
  var host = teamLeaderboardHost.createStandaloneHost();
  host._shouldBuildEntityLeaderboard = function (m) {
    return detailShouldBuildEntityLeaderboard(m);
  };
  return teamLeaderboardView.buildGrossTeamLeaderboardView(match, host) || [];
}

function scoringShape(teams) {
  return (teams || []).map(function (team) {
    return {
      teamId: String((team && team.teamId) || ''),
      pos: String(team && team.pos),
      players: (Array.isArray(team && team.players) ? team.players : []).map(function (p) {
        var members = Array.isArray(p && p.members) ? p.members : [];
        return {
          isEntity: !!(p && p.isEntity),
          entityId: String((p && p.entityId) || ''),
          playerId: String((p && (p.playerId || p.userId)) || ''),
          members: members
            .map(function (m) {
              return String((m && (m.userId || m.playerId)) || m || '');
            })
            .filter(Boolean)
            .sort()
            .join(','),
          hasScore: !!(p && p.hasScore),
          toPar: p && p.toPar
        };
      })
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
  Object.keys(a).concat(Object.keys(b)).forEach(function (k) {
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

function collectEntityRows(teams) {
  var out = [];
  (teams || []).forEach(function (team) {
    (team.players || []).forEach(function (p) {
      out.push({
        isEntity: !!(p && p.isEntity),
        entityId: String((p && p.entityId) || ''),
        members: Array.isArray(p && p.members) ? p.members.length : 0
      });
    });
  });
  return out;
}

function traceStation(label, roundId, match) {
  var gameMode = String((match && match.gameMode) || '');
  var kind = strokeEntityValidator.resolveStrokeKind(gameMode);
  var classifier = {
    g1: kind === 'g1',
    g2g3: kind === 'g2g3',
    g4: kind === 'g4',
    other: kind === 'other'
  };
  var selection = viewOptions.normalizeSeriesStandingsSelection(match, undefined);
  var sharedDefault = leaderboardSettingViewModel.resolveLeaderboardDefaultView(match);
  var host = teamLeaderboardHost.createStandaloneHost();
  var built = teamLeaderboardView.buildGrossTeamLeaderboardView(match, host) || [];
  var rows = collectEntityRows(built);
  return {
    label: label,
    roundId: roundId,
    stationMatchId: String((match && match.matchId) || ''),
    gameMode: gameMode,
    kind: kind,
    classifier: classifier,
    leaderboardView: selection.view,
    leaderboardMode: leaderboardSettingViewModel.leaderboardViewToMode(selection.view),
    sharedDefaultView: sharedDefault,
    teamCompetitionEnabled: !!(
      match &&
      match.scoringRules &&
      match.scoringRules.teamCompetition &&
      match.scoringRules.teamCompetition.enabled
    ),
    groups: Array.isArray(match.groups) ? match.groups.length : 0,
    scoreEntityGroups: Object.keys(match.scoreEntities || {}).length,
    pairingGroups: Object.keys(match.pairings || {}).length,
    builderRows: rows
  };
}

function projectRn(series, round, match) {
  var liveAdapter = require(path.join(seriesDir, 'seriesLiveLeaderboardAdapter.js'));
  return liveAdapter.projectSeriesRnLiveLeaderboard({
    selectedKey: round.roundId,
    selection: { view: 'team', scoreType: 'gross' },
    series: series,
    round: round,
    match: match,
    indexLink: makeIndex(round.roundId, series)
  });
}

function applyPageOverlay(baseVm, projected) {
  var sharedEmpty = personalAdapter.emptySharedPersonalBoardFields();
  return Object.assign({}, baseVm, sharedEmpty, (projected && projected.overlay) || {}, {
    roundHeadline: 'R?',
    useLiveLeaderboard: true
  });
}

function wxmlUsesTeamExpand(applied) {
  if (applied.useLiveLeaderboard && applied.liveView === 'team') return 'teamExpand';
  if (applied.showSharedPersonalBoard) return 'personal';
  if (applied.showTeamBoard === false) return 'listRows';
  return 'teamExpand';
}

(function testPublishedPayloadLacksRuntimeEntities() {
  var series = makeSeries({
    rounds: [makeRound({ roundId: 'r1', matchId: 'm-r1', gameMode: '四人四球比杆赛' })]
  });
  var built = seriesStationMatch.buildMatchFromSeriesRound(series, series.rounds[0], {
    matchId: 'm-r1',
    publishToken: series.publishToken,
    creatorId: series.createdBy
  });
  assert('发布分站构建成功', built.ok === true, built.reason);
  var payload = seriesStationMatch.extractStationPayloadForFingerprint(built.match);
  assert(
    '指纹载荷不含 groups/scoreEntities（Rn 不得用发布裁剪件）',
    payload.groups == null && payload.scoreEntities == null && payload.pairings == null
  );
  assert(
    '发布件 gameMode 中文可被 classifier 识别为 g2g3',
    strokeEntityValidator.resolveStrokeKind(built.match.gameMode) === 'g2g3'
  );
  assert(
    'global_m 分站 teamCompetition.enabled=false，共享默认 view=all',
    built.match.scoringRules.teamCompetition.enabled === false &&
      leaderboardSettingViewModel.resolveLeaderboardDefaultView(built.match) === 'all'
  );
  assert(
    'Series Rn 默认仍为 team（不跟 PK 开关走个人榜）',
    viewOptions.resolveSeriesStandingsDefaultView(built.match) === 'team' &&
      viewOptions.normalizeSeriesStandingsSelection(built.match, undefined).view === 'team'
  );
})();

function runParityCase(label, gameMode, roundId, matchId, grouping, expectKind) {
  var series = makeSeries({
    seriesId: 'series-' + label,
    publishToken: 'pub-' + label,
    rounds: [
      makeRound({
        roundId: roundId,
        index: roundId === 'r2' ? 2 : 1,
        matchId: matchId,
        gameMode: gameMode,
        name: label
      })
    ]
  });
  var round = series.rounds[0];
  var match = buildLiveStation(series, round, grouping);
  var t = traceStation(label, round.roundId, match);

  console.log('TRACE  ' + label + ' ' + JSON.stringify({
    roundId: t.roundId,
    stationMatchId: t.stationMatchId,
    gameMode: t.gameMode,
    kind: t.kind,
    classifier: t.classifier,
    leaderboardView: t.leaderboardView,
    leaderboardMode: t.leaderboardMode,
    groups: t.groups,
    scoreEntityGroups: t.scoreEntityGroups,
    pairingGroups: t.pairingGroups,
    builderRows: t.builderRows
  }));

  assert(label + ' classifier=' + expectKind, t.kind === expectKind, t.kind);
  assert(label + ' 运行时保留 groups', t.groups >= 1);
  assert(label + ' 运行时保留 scoreEntities', t.scoreEntityGroups >= 1);
  if (expectKind === 'g4') {
    assert(label + ' 运行时保留 pairings', t.pairingGroups >= 1);
  }
  assert(label + ' Series 默认 view=team', t.leaderboardView === 'team');
  assert(label + ' 共享默认仍为 all（PK 关）', t.sharedDefaultView === 'all');
  assert(
    label + ' entity classifier 走组合',
    personalLeaderboardBoard.shouldBuildEntityLeaderboard(match) === true
  );

  var detailTeams = buildDetailGrossTeams(match);
  var seriesHostTeams = teamLeaderboardView.buildGrossTeamLeaderboardView(
    match,
    teamLeaderboardHost.createStandaloneHost()
  );
  var projected = projectRn(series, round, match);
  var seriesTeams = (projected.overlay && projected.overlay.liveTeamLeaderboard) || [];

  var diffDetailHost = firstDiff(scoringShape(detailTeams), scoringShape(seriesHostTeams));
  var diffRn = firstDiff(scoringShape(detailTeams), scoringShape(seriesTeams));
  assert(
    label + ' detail 入口 vs Series host 无结构差',
    !diffDetailHost,
    diffDetailHost || ''
  );
  assert(
    label + ' detail 入口 vs Series Rn 无结构差',
    !diffRn,
    diffRn || ''
  );
  assert(
    label + ' builder 行均为 isEntity',
    t.builderRows.length > 0 &&
      t.builderRows.every(function (row) {
        return row.isEntity === true && !!row.entityId && row.members > 0;
      }),
    JSON.stringify(t.builderRows)
  );
  assert(
    label + ' Rn 未走 TOT 投影',
    projected.reason === 'shared' && projected.calledShared === true && projected.verifiedOk === true
  );

  var stalePersonal = {
    selectedKey: round.roundId,
    showSharedPersonalBoard: true,
    showTeamBoard: false,
    personalLeaderboard: [{ playerId: 'u-r1', name: '红一' }],
    listRows: [{ playerId: 'u-r1' }],
    teamRows: [{ teamId: 'stale' }]
  };
  var applied = applyPageOverlay(stalePersonal, projected);
  assert(
    label + ' 异步 setData 后仍关个人榜',
    applied.showSharedPersonalBoard === false &&
      applied.useLiveLeaderboard === true &&
      applied.liveView === 'team' &&
      applied.selection.view === 'team',
    JSON.stringify({
      showSharedPersonalBoard: applied.showSharedPersonalBoard,
      showTeamBoard: applied.showTeamBoard,
      view: applied.selection && applied.selection.view
    })
  );
  assert(
    label + ' WXML 走球队展开分支',
    wxmlUsesTeamExpand(applied) === 'teamExpand',
    wxmlUsesTeamExpand(applied)
  );
  assert(
    label + ' 展开行带 entity members',
    applied.liveTeamLeaderboard.some(function (team) {
      return (team.players || []).some(function (p) {
        return p.isEntity === true && Array.isArray(p.members) && p.members.length > 0;
      });
    })
  );
  return { match: match, projected: projected, applied: applied };
}

runParityCase('G2-R1', '四人四球比杆赛', 'r1', 'm-g2-r1', {}, 'g2g3');
runParityCase('G3-R2', '最佳球位比杆赛', 'r2', 'm-g3-r2', {}, 'g2g3');
runParityCase('G4-R1', '四人两球比杆赛', 'r1', 'm-g4-r1', { g4: true }, 'g4');

(function testSourceContracts() {
  var adapterSrc = fs.readFileSync(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'), 'utf8');
  var viewSrc = fs.readFileSync(path.join(seriesDir, 'seriesStandingsViewOptions.js'), 'utf8');
  var boardSrc = fs.readFileSync(path.join(utilsDir, 'personalLeaderboardBoard.js'), 'utf8');
  var seriesJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
  var seriesWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');

  var rnStart = adapterSrc.indexOf('function projectSeriesStandingsTeamBoard');
  var totGate = adapterSrc.indexOf('return projectSeriesTotG2G3TeamBoard', rnStart);
  var rnFn = adapterSrc.slice(totGate, adapterSrc.indexOf('function totBypass'));
  assert(
    'Rn 入口直接 buildGrossTeamLeaderboardView(match)，不补造组合',
    totGate > rnStart &&
      rnFn.indexOf('buildGrossTeamLeaderboardView(match, host)') >= 0 &&
      rnFn.indexOf('assembleGrossTeams') < 0
  );
  assert(
    'Series 默认 view 不跟 teamCompetition.enabled',
    viewSrc.indexOf('resolveSeriesStandingsDefaultView') >= 0 &&
      /function resolveSeriesStandingsDefaultView[\s\S]*options.indexOf\(VIEW\.team\)/.test(viewSrc)
  );
  assert(
    'G2/G3/G4 classifier 识别中文赛制',
    /kind === 'g2g3' \|\| kind === 'g4'/.test(boardSrc)
  );
  assert(
    '页面 overlay：Rn 走 live adapter',
    /projectSeriesRnLiveLeaderboard/.test(seriesJs)
  );
  assert(
    'WXML：Rn 共用 live-leaderboard-board，TOT 保留球队展开',
    seriesWxml.indexOf('standings.useLiveLeaderboard') >= 0 &&
      seriesWxml.indexOf('<live-leaderboard-board') >= 0 &&
      seriesWxml.indexOf('player.isEntity && player.members') >= 0
  );
})();

console.log('');
console.log('---- seriesRnG2G3RuntimeParity.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
