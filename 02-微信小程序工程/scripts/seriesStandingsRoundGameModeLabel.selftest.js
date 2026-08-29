/**
 * Series 总榜顶部赛制：global_m Rn 球队 / 查看全部 / TOT，以及叶子映射、无 VM 循环依赖
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsRoundGameModeLabel.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');

var seriesGameModeLabel = require(path.join(utilsDir, 'seriesGameModeLabel.js'));
var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));
var liveAdapter = require(path.join(seriesDir, 'seriesLiveLeaderboardAdapter.js'));
var detailVm = require(path.join(seriesDir, 'seriesDetailViewModel.js'));

var pageJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var vmSrc = fs.readFileSync(path.join(seriesDir, 'seriesStandingsViewModel.js'), 'utf8');
var detailSrc = fs.readFileSync(path.join(seriesDir, 'seriesDetailViewModel.js'), 'utf8');
var liveSrc = fs.readFileSync(path.join(seriesDir, 'seriesLiveLeaderboardAdapter.js'), 'utf8');
var leafSrc = fs.readFileSync(path.join(utilsDir, 'seriesGameModeLabel.js'), 'utf8');

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

function gmSeries(over) {
  return Object.assign(
    {
      seriesId: 's-gm-label',
      scoringRule: {
        mode: 'global_m',
        globalM: 6,
        scoreBasis: 'gross',
        allowRepeat: false,
        ruleVersion: 1
      },
      participants: [{ seriesParticipantId: 'team:a', nameSnapshot: '甲队' }],
      rounds: [
        { roundId: 'r1', index: 1, gameMode: 'individual_stroke' },
        { roundId: 'r2', index: 2, gameMode: '四人四球比杆赛' },
        { roundId: 'r3', index: 3, gameMode: 'not-a-real-mode' }
      ]
    },
    over || {}
  );
}

function prnSeries() {
  return {
    seriesId: 's-prn-label',
    scoringRule: {
      mode: 'per_round_n',
      scoreBasis: 'gross',
      allowRepeat: false,
      ruleVersion: 1
    },
    participants: [{ seriesParticipantId: 'team:a', nameSnapshot: '甲队' }],
    rounds: [
      { roundId: 'r1', index: 1, gameMode: 'fourball' },
      { roundId: 'r2', index: 2, gameMode: '最佳球位比杆赛' }
    ]
  };
}

function states() {
  return [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'completed', state: 'completed' },
    { roundId: 'r2', index: 2, label: 'R2', statusToken: 'live', state: 'live' },
    { roundId: 'r3', index: 3, label: 'R3', statusToken: 'scheduled', state: 'upcoming' }
  ];
}

function buildVm(series, selectedKey) {
  return standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: selectedKey,
    roundStates: states(),
    standingsResult: standingsVm.emptyStandingsResult()
  });
}

function liveProjected(viewLabel, extra) {
  return {
    verifiedOk: true,
    calledShared: true,
    overlay: Object.assign(
      {
        useLiveLeaderboard: true,
        leaderboardViewLabel: viewLabel,
        liveView: viewLabel.indexOf('全部') >= 0 ? 'all' : 'team',
        liveTeamLeaderboard: [{ teamId: 'team:a', pos: '1', scoreStr: '-1' }],
        liveLeaderboard: [{ playerId: 'u1', name: '甲' }]
      },
      extra || {}
    )
  };
}

var gm = gmSeries();
var tot = buildVm(gm, 'cumulative');
var gmR1 = buildVm(gm, 'r1');
var gmR2 = buildVm(gm, 'r2');
var gmR3 = buildVm(gm, 'r3');

assert(
  'global_m TOT 保持 Top M 于下拉',
  tot.selectedKey === 'total' &&
    tot.leaderboardViewLabel === '' &&
    tot.roundSelectorItems[0].key === 'total' &&
    String(tot.roundSelectorItems[0].displayText).indexOf('取全队前6名最好成绩进行排序') >= 0 &&
    tot.leaderboardViewLabel.indexOf('个人比杆赛') < 0
);

assert(
  'global_m Rn 球队显示赛制',
  gmR1.leaderboardViewLabel === '个人比杆赛' &&
    gmR2.leaderboardViewLabel === '四人四球比杆赛' &&
    gmR1.leaderboardViewLabel === seriesGameModeLabel.resolveSeriesGameModeLabel('individual_stroke')
);

var liveTeam = liveProjected('总杆 · 球队');
var liveAll = liveProjected('总杆 · 全部');
var gmTeamOver = liveAdapter.applyGlobalMRnStandingsOverlay(
  gmR1,
  { view: 'team', scoreType: 'gross' },
  liveTeam,
  {
    selectedKey: 'r1',
    series: gm,
    teamViewLabel: standingsVm.resolveRoundGameModeLabel(gm, 'r1'),
    roundHeadline: 'R1'
  }
);
var gmAllOver = liveAdapter.applyGlobalMRnStandingsOverlay(
  gmR1,
  { view: 'all', scoreType: 'gross' },
  liveAll,
  {
    selectedKey: 'r1',
    series: gm,
    teamViewLabel: standingsVm.resolveRoundGameModeLabel(gm, 'r1'),
    roundHeadline: 'R1'
  }
);
var gmR2TeamOver = liveAdapter.applyGlobalMRnStandingsOverlay(
  gmR2,
  { view: 'team', scoreType: 'gross' },
  liveTeam,
  {
    selectedKey: 'r2',
    series: gm,
    teamViewLabel: standingsVm.resolveRoundGameModeLabel(gm, 'r2')
  }
);

assert(
  'global_m Rn 球队 overlay 不用 LIVE 总杆文案',
  gmTeamOver.useLiveLeaderboard === true &&
    gmTeamOver.leaderboardViewLabel === '个人比杆赛' &&
    gmTeamOver.leaderboardViewLabel.indexOf('总杆') < 0 &&
    gmR2TeamOver.leaderboardViewLabel === '四人四球比杆赛'
);
assert(
  'global_m Rn 查看全部显示 LIVE 文案',
  gmAllOver.useLiveLeaderboard === true &&
    gmAllOver.leaderboardViewLabel === '总杆 · 全部' &&
    gmAllOver.leaderboardViewLabel.indexOf('个人比杆赛') < 0
);
assert(
  '切轮/切视图不改 LIVE 行数据',
  gmTeamOver.liveTeamLeaderboard === liveTeam.overlay.liveTeamLeaderboard &&
    gmAllOver.liveLeaderboard === liveAll.overlay.liveLeaderboard
);

var prn = prnSeries();
var prnR1 = buildVm(prn, 'r1');
var prnR2 = buildVm(prn, 'r2');
assert(
  'per_round_n 球队显示赛制',
  prnR1.leaderboardViewLabel === '四人四球比杆赛' &&
    prnR2.leaderboardViewLabel === '最佳球位比杆赛'
);
var prnTeamOver = liveAdapter.applyPerRoundNStandingsOverlay(
  prnR1,
  { view: 'team', scoreType: 'gross' },
  liveTeam,
  { roundId: 'r1' }
);
var prnAllOver = liveAdapter.applyPerRoundNStandingsOverlay(
  prnR1,
  { view: 'all', scoreType: 'gross' },
  liveAll,
  { roundId: 'r1' }
);
assert(
  'per_round_n 球队 overlay 保留赛制；查看全部走 LIVE',
  prnTeamOver.leaderboardViewLabel === '四人四球比杆赛' &&
    prnAllOver.leaderboardViewLabel === '总杆 · 全部'
);

assert(
  '未知赛制空态',
  gmR3.leaderboardViewLabel === '' &&
    standingsVm.resolveRoundGameModeLabel(gm, 'r3') === '' &&
    seriesGameModeLabel.resolveSeriesGameModeLabel('not-a-real-mode') === '' &&
    seriesGameModeLabel.resolveSeriesGameModeLabel('') === '' &&
    String(gmR3.leaderboardViewLabel).indexOf('undefined') < 0
);

assert(
  'detail VM 与 standings VM 都依赖叶子工具',
  detailSrc.indexOf("require('../../../../utils/seriesGameModeLabel.js')") >= 0 &&
    vmSrc.indexOf("require('../../../../utils/seriesGameModeLabel.js')") >= 0 &&
    detailVm.resolveSeriesGameModeLabel('fourball') ===
      seriesGameModeLabel.resolveSeriesGameModeLabel('fourball')
);

assert(
  '无 ViewModel 循环依赖',
  vmSrc.indexOf("require('./seriesDetailViewModel") < 0 &&
    vmSrc.indexOf('seriesDetailViewModel') < 0 &&
    detailSrc.indexOf("require('./seriesStandingsViewModel.js')") >= 0 &&
    liveSrc.indexOf('applyGlobalMRnStandingsOverlay') >= 0 &&
    pageJs.indexOf('applyGlobalMRnStandingsOverlay') >= 0 &&
    leafSrc.indexOf('require(') < 0
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
process.exit(0);
