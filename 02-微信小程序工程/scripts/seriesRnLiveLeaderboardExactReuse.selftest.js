/**
 * SERIES-RN-LIVE-LEADERBOARD-EXACT-REUSE
 * Series Rn 与普通 detail 共用 live-leaderboard-board；TOT 独立。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesRnLiveLeaderboardExactReuse.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');
var liveDir = path.join(mini, 'components', 'live-leaderboard-board');

var liveLeaderboardBoard = require(path.join(utilsDir, 'liveLeaderboardBoard.js'));
var personalLeaderboardBoard = require(path.join(utilsDir, 'personalLeaderboardBoard.js'));
var teamLeaderboardView = require(path.join(utilsDir, 'teamLeaderboardView.js'));
var teamLeaderboardHost = require(path.join(utilsDir, 'teamLeaderboardHost.js'));
var liveAdapter = require(path.join(seriesDir, 'seriesLiveLeaderboardAdapter.js'));
var teamAdapter = require(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'));
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

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

var detailWxml = read(path.join(detailDir, 'index.wxml'));
var detailJson = read(path.join(detailDir, 'index.json'));
var detailJs = read(path.join(detailDir, 'index.js'));
var seriesWxml = read(path.join(seriesDir, 'index.wxml'));
var seriesJson = read(path.join(seriesDir, 'index.json'));
var seriesJs = read(path.join(seriesDir, 'index.js'));
var liveWxml = read(path.join(liveDir, 'index.wxml'));
var liveJs = read(path.join(liveDir, 'index.js'));
var liveJson = read(path.join(liveDir, 'index.json'));
var liveWxss = read(path.join(liveDir, 'index.wxss'));
var liveUtil = read(path.join(utilsDir, 'liveLeaderboardBoard.js'));
var totSrc = read(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'));

assert(
  '同一组件注册：detail + Series',
  detailJson.indexOf('/components/live-leaderboard-board/index') >= 0 &&
    seriesJson.indexOf('/components/live-leaderboard-board/index') >= 0 &&
    (detailWxml.split('<live-leaderboard-board').length - 1) === 1 &&
    (seriesWxml.split('<live-leaderboard-board').length - 1) === 1
);

assert(
  'Series Rn 不再手写个人/组合/平面榜分支',
  seriesWxml.indexOf('standings.showSharedPersonalBoard') < 0 &&
    seriesWxml.indexOf('standings.showEntityAllBoard') < 0 &&
    seriesWxml.indexOf('standings.showTeamBoard === false') < 0 &&
    seriesWxml.indexOf('standings.useLiveLeaderboard') >= 0
);

assert(
  '普通 detail 不再内联 LIVE 球队表',
  detailWxml.indexOf('toggleTeamLeaderboardRow') < 0 &&
    detailWxml.indexOf('team.grossTotal') < 0 &&
    detailWxml.indexOf('<personal-leaderboard-board') < 0 &&
    liveWxml.indexOf('team.grossTotal') >= 0 &&
    liveWxml.indexOf('<personal-leaderboard-board') >= 0
);

assert(
  '共享组件覆盖表头/展开/计入线/组合成员/记分卡事件',
  liveWxml.indexOf('lh-player">TEAM') >= 0 &&
    liveWxml.indexOf('lh-thru">TOTAL') >= 0 &&
    liveWxml.indexOf('lh-total">TO PAR') >= 0 &&
    liveWxml.indexOf('team-leaderboard-divider-strong') >= 0 &&
    liveWxml.indexOf('player.isCounting') >= 0 &&
    liveWxml.indexOf('player.isEntity && player.members') >= 0 &&
    liveWxml.indexOf('openIndex === player.scorecardKey') >= 0 &&
    /triggerEvent\(\s*'scorecardtap'/.test(liveJs) &&
    fs.readFileSync(path.join(utilsDir, 'liveLeaderboardScorecard.js'), 'utf8').indexOf('entityId') >= 0 &&
    fs.readFileSync(path.join(utilsDir, 'liveLeaderboardScorecard.js'), 'utf8').indexOf('scorecardKey') >= 0
);

assert(
  '暗色模式：apply-shared + tournament-common',
  liveJson.indexOf('apply-shared') >= 0 &&
    /@import\s+"\/styles\/tournament-common\.wxss"/.test(liveWxss) &&
    liveJs.indexOf("styleIsolation: 'apply-shared'") >= 0
);

assert(
  '页面 overlay：Rn 走 live adapter，TOT 仍走球队 adapter',
  /projectSeriesRnLiveLeaderboard/.test(seriesJs) &&
    /selectedKey === standingsViewModel.CUMULATIVE_KEY\) \{[\s\S]{0,800}projectSeriesStandingsTeamBoard/.test(
      seriesJs
    ) &&
    /useLiveLeaderboard: false/.test(seriesJs)
);

assert(
  '共享模块不写 Series/storage，不碰 TOT 算法',
  !/setStorageSync|wx\.|upsertSeries/.test(liveUtil) &&
    liveUtil.indexOf('assembleGrossTeams') < 0 &&
    totSrc.indexOf('function projectSeriesTotG2G3TeamBoard') >= 0 &&
    totSrc.indexOf('assembleGrossTeams') >= 0
);

assert(
  'detail 数据入口仍是原 builder + 薄事件转发',
  /_buildLeaderboardViewForView[\s\S]{0,280}buildPersonalLeaderboardBoard/.test(detailJs) &&
    /_buildTeamLeaderboardView\(match\) \{[\s\S]{0,400}buildGrossTeamLeaderboardView/.test(detailJs) &&
    /onLiveLeaderboardTeamTap[\s\S]{0,200}toggleTeamLeaderboardRow/.test(detailJs) &&
    /onLiveLeaderboardScorecardTap[\s\S]{0,400}applyLiveScorecardTap/.test(detailJs)
);

function fixtureG1() {
  return {
    matchId: 'm-g1',
    status: 'ongoing',
    gameMode: '个人比杆赛',
    scoringRules: { teamCompetition: { enabled: true, topN: 2 } },
    teamGroups: [
      { teamId: 'red', name: '红队' },
      { teamId: 'blue', name: '蓝队' }
    ],
    groups: [
      {
        groupId: 'g1',
        players: [
          { userId: 'u1', competitionName: '甲', gender: 'male', matchTeamId: 'red' },
          { userId: 'u2', competitionName: '乙', gender: 'male', matchTeamId: 'blue' }
        ]
      }
    ],
    scoreData: {
      g1: {
        scoresByPlayer: {
          u1: { scores: [4, 4, 4, 4, 4, 4, 4, 4, 4] },
          u2: { scores: [5, 5, 5, 5, 5, 5, 5, 5, 5] }
        }
      }
    }
  };
}

function fixtureG2() {
  return {
    matchId: 'm-g2',
    status: 'ongoing',
    gameMode: '四人四球比杆赛',
    scoringRules: { teamCompetition: { enabled: false, topN: 1 } },
    teamGroups: [
      { teamId: 'red', name: '红队' },
      { teamId: 'blue', name: '蓝队' }
    ],
    groups: [
      {
        groupId: 'g1',
        players: [
          { userId: 'u-r1', competitionName: '红一', gender: 'male', matchTeamId: 'red' },
          { userId: 'u-r2', competitionName: '红二', gender: 'male', matchTeamId: 'red' },
          { userId: 'u-b1', competitionName: '蓝一', gender: 'female', matchTeamId: 'blue' },
          { userId: 'u-b2', competitionName: '蓝二', gender: 'male', matchTeamId: 'blue' }
        ]
      }
    ],
    scoreEntities: {
      g1: [{ entityId: 'e-red', memberIds: ['u-r1', 'u-r2'] }, { entityId: 'e-blue', memberIds: ['u-b1', 'u-b2'] }]
    },
    scoreData: {
      g1: {
        teamScoresByEntity: [
          { entityId: 'e-red', scores: [4, 4, 4, 4, 4, 4, 4, 4, 4] },
          { entityId: 'e-blue', scores: [5, 5, 5, 5, 5, 5, 5, 5, 5] }
        ]
      }
    }
  };
}

function attachSeriesContext(match) {
  return Object.assign({}, match, {
    seriesContext: {
      managed: true,
      seriesId: 's-live',
      roundId: 'r1',
      publishToken: 'pub',
      matchId: match.matchId
    }
  });
}

function makeSeries(match) {
  return {
    seriesId: 's-live',
    publishToken: 'pub',
    createdBy: 'c1',
    hostMode: 'inter-team',
    scoringRule: { mode: 'global_m', globalM: 2 },
    participants: [
      { seriesParticipantId: 'team:red', kind: 'team', sourceTeamId: 'red' },
      { seriesParticipantId: 'team:blue', kind: 'team', sourceTeamId: 'blue' }
    ],
    rounds: [
      {
        roundId: 'r1',
        index: 1,
        matchId: match.matchId,
        gameMode: match.gameMode,
        roundStatus: 'ongoing'
      }
    ]
  };
}

function indexLink(roundId, series) {
  return {
    seriesId: series.seriesId,
    roundId: roundId,
    matchId: series.rounds[0].matchId,
    publishToken: series.publishToken
  };
}

function projectLive(match, view) {
  var series = makeSeries(match);
  return liveAdapter.projectSeriesRnLiveLeaderboard({
    selectedKey: 'r1',
    selection: { view: view, scoreType: 'gross' },
    series: series,
    round: series.rounds[0],
    match: match,
    indexLink: indexLink('r1', series)
  });
}

['team', 'all'].forEach(function (view) {
  ['G1', 'G2'].forEach(function (label) {
    var match = attachSeriesContext(label === 'G1' ? fixtureG1() : fixtureG2());
    var detailState = liveLeaderboardBoard.buildLiveLeaderboardState(match, {
      view: view,
      scoreType: 'gross',
      host: teamLeaderboardHost.createStandaloneHost()
    });
    var projected = projectLive(match, view);
    var overlay = projected.overlay || {};
    var sameTeams =
      JSON.stringify(detailState.teamLeaderboard) === JSON.stringify(overlay.liveTeamLeaderboard);
    var sameRows =
      JSON.stringify(detailState.leaderboard) === JSON.stringify(overlay.liveLeaderboard);
    assert(
      label + ' ' + view + ' 与共享状态同一份字段',
      projected.calledShared === true &&
        overlay.useLiveLeaderboard === true &&
        overlay.liveView === view &&
        sameTeams &&
        sameRows,
      !sameTeams ? 'team mismatch' : !sameRows ? 'row mismatch' : projected.reason
    );
  });
});

var g2All = liveLeaderboardBoard.buildLiveLeaderboardState(fixtureG2(), {
  view: 'all',
  scoreType: 'gross'
});
assert(
  'G2 all 由同一共享 LIVE 模块决定（entity classifier 生效）',
  personalLeaderboardBoard.shouldBuildEntityLeaderboard(fixtureG2()) === true &&
    g2All.view === 'all'
);

var g1All = liveLeaderboardBoard.buildLiveLeaderboardState(fixtureG1(), {
  view: 'all',
  scoreType: 'gross'
});
assert(
  'G1 all 仍是个人行',
  g1All.leaderboard.length >= 2 &&
    g1All.leaderboard.every(function (r) {
      return r.isEntity !== true && !!(r.playerId || r.userId);
    })
);

var switchA = liveLeaderboardBoard.buildLiveLeaderboardState(fixtureG1(), { view: 'team' });
var switchB = liveLeaderboardBoard.buildLiveLeaderboardState(fixtureG2(), { view: 'team' });
assert(
  '轮次切换只换 match 输入',
  switchA.matchId === 'm-g1' && switchB.matchId === 'm-g2' && switchA.view === switchB.view
);

var tot = teamAdapter.projectSeriesStandingsTeamBoard({
  selectedKey: standingsVm.CUMULATIVE_KEY,
  series: makeSeries(fixtureG2())
});
assert(
  'TOT 不进入共享单轮组件',
  (tot.overlay && tot.overlay.useLiveLeaderboard) !== true &&
    seriesWxml.indexOf('standings.teamRows') >= 0 &&
    seriesJs.indexOf('projectSeriesTotG2G3TeamBoard') < 0
);

assert(
  '设置确认后的视图由同一 liveView 驱动',
  seriesWxml.indexOf('view="{{standings.liveView}}"') >= 0 &&
    detailWxml.indexOf('view="{{leaderboardView === \'team\'') >= 0 &&
    liveWxml.indexOf('wx:if="{{view === \'team\'}}"') >= 0 &&
    liveWxml.indexOf('<personal-leaderboard-board') >= 0
);

assert(
  'LIVE 更新走同一 builder',
  typeof liveLeaderboardBoard.buildLiveLeaderboardState === 'function' &&
    typeof teamLeaderboardView.buildGrossTeamLeaderboardView === 'function'
);

console.log('');
console.log('---- seriesRnLiveLeaderboardExactReuse.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
