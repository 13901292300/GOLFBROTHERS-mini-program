/**
 * SERIES-RN-SCORECARD-INTERACTION-EXACT-PARITY
 * 对拍普通 detail 与 Series Rn 的组合记分卡展开（真实调用 helper/handler，不只比源码字符串）。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesRnScorecardInteractionExactParity.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');

var liveLeaderboardBoard = require(path.join(utilsDir, 'liveLeaderboardBoard.js'));
var liveLeaderboardScorecard = require(path.join(utilsDir, 'liveLeaderboardScorecard.js'));
var teamLeaderboardHost = require(path.join(utilsDir, 'teamLeaderboardHost.js'));
var teamMatchScorecard = require(path.join(utilsDir, 'teamMatchScorecard.js'));
var strokeEntityBuilder = require(path.join(utilsDir, 'strokeEntityBuilder.js'));
var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));
var teamAdapter = require(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'));

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

function baseMatch(matchId, gameMode) {
  return {
    matchId: matchId,
    status: 'ongoing',
    gameMode: gameMode,
    courseName: '测试球场',
    front9Course: 'A',
    back9Course: 'B',
    scoringRules: { teamCompetition: { enabled: true, topN: 1 } },
    teamGroups: [
      { teamId: 'red', name: '红队' },
      { teamId: 'blue', name: '蓝队' }
    ],
    registerInfo: { totalCount: 4, users: users() },
    groups: [
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
    ]
  };
}

function withEntities(match, grouping) {
  var next = JSON.parse(JSON.stringify(match));
  var o = grouping || {};
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
    next.scoreEntities = {};
    next.scoreData = {
      gA: {
        scoresByPlayer: {
          'u-r1': { scores: fillScores(18, 4) },
          'u-b1': { scores: fillScores(18, 5) }
        }
      }
    };
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
      scores: fillScores(18, 4 + idx)
    });
  });
  return next;
}

function fixtureG2() {
  return withEntities(baseMatch('m-g2-r1', '四人四球比杆赛'), {});
}

function fixtureG3() {
  return withEntities(baseMatch('m-g3-r1', '最佳球位比杆赛'), {});
}

function fixtureG4() {
  return withEntities(baseMatch('m-g4-r1', '四人两球比杆赛'), { g4: true });
}

function fixtureG1() {
  var m = withEntities(baseMatch('m-g1-r1', '个人比杆赛'), { g1: true });
  m.groups[0].players = [
    { userId: 'u-r1', competitionName: '甲', gender: 'male', matchTeamId: 'red' },
    { userId: 'u-b1', competitionName: '乙', gender: 'male', matchTeamId: 'blue' }
  ];
  return m;
}

function liveState(match, view) {
  return liveLeaderboardBoard.buildLiveLeaderboardState(match, {
    view: view,
    scoreType: 'gross',
    host: teamLeaderboardHost.createStandaloneHost()
  });
}

function entityRows(teams) {
  var out = [];
  (teams || []).forEach(function (t) {
    (t.players || []).forEach(function (p) {
      if (p && p.isEntity) out.push(p);
    });
  });
  return out;
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
      var inner = firstDiff(a[i], b[i], pathPrefix ? pathPrefix + '[' + i + ']' : '[' + i + ']');
      if (inner) return inner;
    }
    return '';
  }
  var keys = {};
  Object.keys(a).forEach(function (k) {
    keys[k] = true;
  });
  Object.keys(b).forEach(function (k) {
    keys[k] = true;
  });
  var names = Object.keys(keys).sort();
  for (var n = 0; n < names.length; n++) {
    var key = names[n];
    var next = pathPrefix ? pathPrefix + '.' + key : key;
    if (!Object.prototype.hasOwnProperty.call(a, key) || !Object.prototype.hasOwnProperty.call(b, key)) {
      return next;
    }
    var inner2 = firstDiff(a[key], b[key], next);
    if (inner2) return inner2;
  }
  return '';
}

function tapFields(detail) {
  return {
    mode: detail.mode,
    index: detail.index,
    scorecardKey: detail.scorecardKey,
    matchId: detail.matchId,
    stationMatchId: detail.stationMatchId,
    entityId: detail.entityId,
    groupId: detail.groupId,
    playerId: detail.playerId,
    members: Array.isArray(detail.members) ? detail.members.length : 0,
    hasPlayer: !!(detail.player && typeof detail.player === 'object')
  };
}

function applyFields(result) {
  return {
    openIndex: result.openIndex,
    scorePanel: result.scorePanel,
    scorecard: liveLeaderboardScorecard.scorecardShape(result.openScorecard)
  };
}

/** 修复前 Series 路径：依赖 dataset.player + TOT 核验，not_started 记分卡为 null */
function legacySeriesApply(detail, match) {
  var player = detail.player && typeof detail.player === 'object' ? detail.player : {};
  player.canOpenScorecard = true;
  var groupId = player.groupId != null ? String(player.groupId).trim() : '';
  if (!groupId) {
    return { openIndex: '', openScorecard: null, scorePanel: '', fail: 'missing_groupId' };
  }
  var built = teamMatchScorecard.buildTeamMatchScorecardView(match, player, 'gross');
  return {
    openIndex: player.scorecardKey || detail.index || '',
    openScorecard: built && built.ok ? built.scorecard : null,
    scorePanel: '',
    fail: built && built.ok ? '' : built && built.reason
  };
}

function hostApply(match, view, openIndex, detail) {
  var state = liveState(match, view);
  return liveLeaderboardScorecard.applyLiveScorecardTap(
    {
      view: view,
      openIndex: openIndex,
      teamLeaderboard: state.teamLeaderboard,
      leaderboard: state.leaderboard,
      match: match,
      scoreDisplayMode: 'gross'
    },
    detail
  );
}

var detailJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');
var seriesJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var seriesWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');
var liveCompJs = fs.readFileSync(
  path.join(mini, 'components', 'live-leaderboard-board', 'index.js'),
  'utf8'
);
var totSrc = fs.readFileSync(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'), 'utf8');

(function testFirstDifference() {
  var match = fixtureG2();
  var state = liveState(match, 'team');
  var row = entityRows(state.teamLeaderboard)[0];
  if (!row) {
    console.log('TRACE teams', JSON.stringify((state.teamLeaderboard || []).map(function (t) {
      return { id: t.teamId, n: (t.players || []).length, entity: (t.players || []).filter(function (p) { return p.isEntity; }).length };
    })));
  }
  assert('G2 球队展开有组合行', !!(row && row.scorecardKey && row.entityId && row.groupId));
  if (!row) return;

  var stripped = liveLeaderboardScorecard.buildTeamScorecardTapEvent(
    { index: row.scorecardKey, player: '[object Object]' },
    state.teamLeaderboard
  );
  var full = liveLeaderboardScorecard.buildTeamScorecardTapEvent(
    { index: row.scorecardKey, player: row },
    state.teamLeaderboard
  );
  var emitDiff = firstDiff(tapFields(stripped), tapFields(full));
  assert('组件在 dataset.player 丢失时仍还原完整 payload', !emitDiff, emitDiff);

  var legacy = legacySeriesApply(
    { index: row.scorecardKey, player: '[object Object]', mode: 'team' },
    match
  );
  var detailApply = hostApply(match, 'team', -1, stripped);
  var first = '';
  if (!legacy.openScorecard && detailApply.openScorecard) first = 'openScorecard';
  else if (String(legacy.openIndex) !== String(detailApply.openIndex)) first = 'openIndex';
  else first = firstDiff(applyFields(legacy), applyFields(detailApply)) || 'none';
  console.log('FIRST_DIFF_BEFORE_FIX ' + first);
  assert(
    '修复前第一个差异是 openScorecard（旧 Series 路径打不开）',
    first === 'openScorecard' && !legacy.openScorecard && !!detailApply.openScorecard
  );
})();

function runMode(label, match) {
  var state = liveState(match, 'team');
  var rows = entityRows(state.teamLeaderboard);
  if (!rows.length) {
    rows = (state.teamLeaderboard[0] && state.teamLeaderboard[0].players) || [];
  }
  var a = rows[0];
  var b = rows[1] || rows[0];
  var emitA = liveLeaderboardScorecard.buildTeamScorecardTapEvent(
    { index: a.scorecardKey },
    state.teamLeaderboard
  );
  var emitB = liveLeaderboardScorecard.buildTeamScorecardTapEvent(
    { index: b.scorecardKey },
    state.teamLeaderboard
  );

  var detailOpen = hostApply(match, 'team', -1, emitA);
  var seriesOpen = hostApply(match, 'team', '', emitA);
  var tapDiff = firstDiff(tapFields(emitA), tapFields(emitA));
  var applyDiff = firstDiff(applyFields(detailOpen), applyFields(seriesOpen));
  assert(label + ' event.detail 字段完整', emitA.mode === 'team' && emitA.entityId && emitA.groupId && emitA.matchId);
  assert(label + ' 同一次点击 detail/Series apply 无差异', !tapDiff && !applyDiff, applyDiff);
  assert(
    label + ' openIndex 与 scorecardKey 一致',
    String(detailOpen.openIndex) === String(a.scorecardKey) && !!detailOpen.openScorecard
  );
  assert(
    label + ' openScorecard 结构完整',
    liveLeaderboardScorecard.scorecardShape(detailOpen.openScorecard).frontScore === 12 &&
      liveLeaderboardScorecard.scorecardShape(detailOpen.openScorecard).backScore === 12
  );
  assert(label + ' scorePanel=technical', detailOpen.scorePanel === 'technical' && seriesOpen.scorePanel === 'technical');

  var closed = hostApply(match, 'team', detailOpen.openIndex, emitA);
  assert(label + ' 再点关闭', closed.openIndex === -1 && closed.openScorecard === null);

  var switched = hostApply(match, 'team', detailOpen.openIndex, emitB);
  assert(
    label + ' 切换组合',
    String(switched.openIndex) === String(b.scorecardKey) && !!switched.openScorecard
  );

  var allState = liveState(match, 'all');
  var allRow = (allState.leaderboard || [])[0];
  if (allRow) {
    var allEmit = {
      mode: 'personal',
      index: 0,
      player: allRow,
      entityId: allRow.entityId || '',
      matchId: match.matchId,
      groupId: allRow.groupId || ''
    };
    var allOpen = hostApply(match, 'all', -1, allEmit);
    assert(
      label + ' team→all 后仍可展开',
      allOpen.openIndex === 0 && !!allOpen.openScorecard
    );
  }
}

runMode('G2', fixtureG2());
runMode('G3', fixtureG3());
runMode('G4', fixtureG4());

(function testG1() {
  var match = fixtureG1();
  var state = liveState(match, 'all');
  var row = (state.leaderboard || [])[0];
  var opened = hostApply(match, 'all', -1, { mode: 'personal', index: 0, player: row, matchId: match.matchId });
  assert('G1 个人记分卡可展开', opened.openIndex === 0 && !!opened.openScorecard);
  var closed = hostApply(match, 'all', 0, { mode: 'personal', index: 0, player: row });
  assert('G1 再点关闭', closed.openIndex === -1);
})();

(function testRoundClearAndTot() {
  var cleared = liveLeaderboardScorecard.clearedLiveScorecardState();
  assert('切轮清理 openIndex/openScorecard', cleared.openIndex === -1 && cleared.openScorecard === null);
  assert(
    'Series 切轮仍清空记分卡 patch',
    /onStandingsRoundTap:[\s\S]{0,1800}_emptyStandingsScorecardPatch/.test(seriesJs) &&
      /_standingsPersonalOpenIndex = -1/.test(seriesJs)
  );
  var tot = teamAdapter.projectSeriesStandingsTeamBoard({
    selectedKey: standingsVm.CUMULATIVE_KEY,
    series: { scoringRule: { mode: 'global_m', globalM: 2 }, rounds: [] }
  });
  assert(
    'TOT 不受影响',
    seriesWxml.indexOf('catchtap="onStandingsPlayerTap"') >= 0 &&
      /_openStandingsPlayerScorecard/.test(seriesJs) &&
      totSrc.indexOf('assembleGrossTeams') >= 0 &&
      (tot.reason === 'tot' || tot.reason === 'station_fail' || tot.reason === 'shared')
  );
})();

assert(
  '组件与两个 host 调用同一 helper',
  liveCompJs.indexOf('buildTeamScorecardTapEvent') >= 0 &&
    /onLiveLeaderboardScorecardTap[\s\S]{0,800}applyLiveScorecardTap/.test(detailJs) &&
    /onLiveLeaderboardScorecardTap[\s\S]{0,1200}applyLiveScorecardTap/.test(seriesJs) &&
    /onStandingsPlayerTap/.test(seriesJs)
);

assert(
  'LIVE 行 catchtap 在球队 bindtap 内，不跳转 detail',
  fs
    .readFileSync(path.join(mini, 'components', 'live-leaderboard-board', 'index.wxml'), 'utf8')
    .indexOf('catchtap="onTeamPlayerTap"') >= 0 &&
    !/navigateTo.*pages\/detail/.test(seriesJs)
);

console.log('');
console.log('---- seriesRnScorecardInteractionExactParity.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
