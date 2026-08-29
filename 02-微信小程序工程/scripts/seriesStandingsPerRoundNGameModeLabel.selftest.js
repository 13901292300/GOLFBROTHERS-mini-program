/**
 * per_round_n 球队累计主卡顶部赛制文案（复用 leaderboardViewLabel）
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsPerRoundNGameModeLabel.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');

var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));
var liveAdapter = require(path.join(seriesDir, 'seriesLiveLeaderboardAdapter.js'));
var detailVm = require(path.join(seriesDir, 'seriesDetailViewModel.js'));

var pageJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');
var pageWxss = fs.existsSync(path.join(seriesDir, 'index.wxss'))
  ? fs.readFileSync(path.join(seriesDir, 'index.wxss'), 'utf8')
  : '';
var vmSrc = fs.readFileSync(path.join(seriesDir, 'seriesStandingsViewModel.js'), 'utf8');
var liveSrc = fs.readFileSync(path.join(seriesDir, 'seriesLiveLeaderboardAdapter.js'), 'utf8');
var totDescSrc = fs.readFileSync(
  path.join(__dirname, 'seriesStandingsTotTopMDescription.selftest.js'),
  'utf8'
);

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

function makeSeries(over) {
  return Object.assign(
    {
      seriesId: 's-prn-gm',
      scoringRule: {
        mode: 'per_round_n',
        scoreBasis: 'gross',
        allowRepeat: false,
        ruleVersion: 1
      },
      participants: [
        { seriesParticipantId: 'team:a', nameSnapshot: '甲队' },
        { seriesParticipantId: 'team:b', nameSnapshot: '乙队' }
      ],
      rounds: [
        {
          roundId: 'r1',
          index: 1,
          name: '首轮',
          gameMode: 'individual_stroke',
          topN: 2
        },
        {
          roundId: 'r2',
          index: 2,
          name: '次轮',
          gameMode: '四人四球比杆赛',
          topN: 2
        },
        {
          roundId: 'r3',
          index: 3,
          name: '未知轮',
          gameMode: 'not-a-real-mode',
          topN: 2
        },
        {
          roundId: 'r4',
          index: 4,
          name: '空赛制',
          gameMode: '',
          topN: 2
        }
      ]
    },
    over || {}
  );
}

function roundStates() {
  return [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'completed', state: 'completed' },
    { roundId: 'r2', index: 2, label: 'R2', statusToken: 'live', state: 'live' },
    { roundId: 'r3', index: 3, label: 'R3', statusToken: 'scheduled', state: 'upcoming' },
    { roundId: 'r4', index: 4, label: 'R4', statusToken: 'scheduled', state: 'upcoming' }
  ];
}

function buildVm(series, selectedKey) {
  return standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: selectedKey,
    roundStates: roundStates(),
    standingsResult: {
      participantRows: [
        {
          seriesParticipantId: 'team:a',
          rank: 1,
          grossTotalValue: 144,
          toParValue: 2,
          roundBreakdown: [
            {
              roundId: 'r1',
              selectedEntries: [{ toParValue: -1 }]
            },
            {
              roundId: 'r2',
              selectedEntries: [{ toParValue: 3 }]
            }
          ]
        },
        {
          seriesParticipantId: 'team:b',
          rank: 2,
          grossTotalValue: 150,
          toParValue: 8,
          roundBreakdown: [
            {
              roundId: 'r1',
              selectedEntries: [{ toParValue: 4 }]
            },
            {
              roundId: 'r2',
              selectedEntries: [{ toParValue: 4 }]
            }
          ]
        }
      ]
    }
  });
}

function rowSig(vm) {
  return (vm.teamRows || [])
    .map(function (r) {
      return [r.teamId, r.pos, r.grossTotal, r.scoreStr, r.roundScore].join('|');
    })
    .join(';;');
}

var series = makeSeries();
var r1 = buildVm(series, 'r1');
var r2 = buildVm(series, 'r2');
var r1Again = buildVm(series, 'r1');

assert(
  'R1 映射复用现有赛制名',
  r1.leaderboardViewLabel === '个人比杆赛' &&
    r1.leaderboardViewLabel === detailVm.resolveSeriesGameModeLabel('individual_stroke')
);
assert(
  'R2 不同赛制',
  r2.leaderboardViewLabel === '四人四球比杆赛' &&
    r2.leaderboardViewLabel !== r1.leaderboardViewLabel
);
assert(
  '切轮同帧：selectedKey 与赛制一起变',
  r1.selectedKey === 'r1' &&
    r1.headScoreLabel === 'R1' &&
    r1.leaderboardViewLabel === '个人比杆赛' &&
    r2.selectedKey === 'r2' &&
    r2.headScoreLabel === 'R2' &&
    r2.leaderboardViewLabel === '四人四球比杆赛' &&
    r1Again.leaderboardViewLabel === r1.leaderboardViewLabel
);

assert(
  '未知赛制空态，无 undefined',
  buildVm(series, 'r3').leaderboardViewLabel === '' &&
    String(buildVm(series, 'r3').leaderboardViewLabel).indexOf('undefined') < 0
);
assert(
  '空 gameMode 空态',
  buildVm(series, 'r4').leaderboardViewLabel === '' &&
    standingsVm.resolvePerRoundNTeamGameModeLabel(series, 'missing') === ''
);

var liveLabel = '总杆 · 全部';
var liveProjected = {
  verifiedOk: true,
  calledShared: true,
  overlay: {
    useLiveLeaderboard: true,
    leaderboardViewLabel: liveLabel,
    liveView: 'all',
    liveLeaderboard: [{ playerId: 'u1', name: '甲' }]
  }
};
var teamOver = liveAdapter.applyPerRoundNStandingsOverlay(
  r1,
  { view: 'team', scoreType: 'gross' },
  liveProjected,
  { roundId: 'r1' }
);
var allOver = liveAdapter.applyPerRoundNStandingsOverlay(
  r1,
  { view: 'all', scoreType: 'gross' },
  liveProjected,
  { roundId: 'r1' }
);

assert(
  '球队主卡保留 Series 赛制文案',
  teamOver.useLiveLeaderboard === false &&
    teamOver.showTeamBoard === true &&
    teamOver.leaderboardViewLabel === '个人比杆赛'
);
assert(
  '查看全部不覆盖 LIVE 顶部文案',
  allOver.useLiveLeaderboard === true &&
    allOver.leaderboardViewLabel === liveLabel &&
    allOver.leaderboardViewLabel.indexOf('个人比杆赛') < 0
);
assert(
  '查看全部缺 LIVE 文案时也不回落到 Series',
  liveAdapter.applyPerRoundNStandingsOverlay(
    r1,
    { view: 'all', scoreType: 'gross' },
    { overlay: {} },
    { roundId: 'r1' }
  ).leaderboardViewLabel === ''
);

assert(
  '球队 overlay 不改 POS/TOTAL/Rx 签名',
  rowSig(teamOver) === rowSig(r1) && rowSig(allOver) === rowSig(r1)
);

var gmSeries = {
  seriesId: 's-gm',
  scoringRule: {
    mode: 'global_m',
    globalM: 6,
    scoreBasis: 'gross',
    allowRepeat: false,
    ruleVersion: 1
  },
  participants: [{ seriesParticipantId: 'team:a', nameSnapshot: '甲队' }],
  rounds: [{ roundId: 'r1', index: 1, gameMode: 'individual_stroke' }]
};
var gmTot = standingsVm.buildSeriesStandingsViewModel({
  series: gmSeries,
  selectedKey: 'cumulative',
  roundStates: [{ roundId: 'r1', index: 1, label: 'R1', statusToken: 'live', state: 'live' }],
  standingsResult: standingsVm.emptyStandingsResult()
});
var gmR = standingsVm.buildSeriesStandingsViewModel({
  series: gmSeries,
  selectedKey: 'r1',
  roundStates: [{ roundId: 'r1', index: 1, label: 'R1', statusToken: 'live', state: 'live' }],
  standingsResult: standingsVm.emptyStandingsResult()
});

assert(
  'global_m TOT 文案进入下拉第一项',
  gmTot.selectedKey === 'total' &&
    gmTot.leaderboardViewLabel === '' &&
    gmTot.roundSelectorItems[0].key === 'total' &&
    String(gmTot.roundSelectorItems[0].displayText) ===
      'TOTAL · 取全队前6名最好成绩进行排序'
);
assert(
  'global_m Rn 球队 VM 写赛制、不写 TOT 说明',
  gmR.leaderboardViewLabel === '个人比杆赛' &&
    gmR.leaderboardViewLabel.indexOf('本榜取全队前') < 0
);

assert(
  '复用 DOM：仅既有 leaderboard-view-label',
  pageWxml.indexOf('class="leaderboard-view-label"') >= 0 &&
    pageWxml.indexOf('{{standings.leaderboardViewLabel}}') >= 0 &&
    (pageWxml.split('class="leaderboard-view-label"').length - 1) === 2 &&
    pageWxml.indexOf("standings.selectedKey === 'total'") >= 0
);
assert(
  '页面不重复维护赛制映射',
  pageJs.indexOf('GAME_MODE_DISPLAY_LABELS') < 0 &&
    vmSrc.indexOf('seriesGameModeLabel') >= 0 &&
    vmSrc.indexOf("require('./seriesDetailViewModel") < 0 &&
    liveSrc.indexOf('leaderboardViewLabel: asString(overlay.leaderboardViewLabel)') >= 0
);
assert(
  '未新增标题 WXSS',
  pageWxss.indexOf('.leaderboard-view-label') < 0
);
assert(
  'global_m 说明自测仍覆盖 TOT/R',
  totDescSrc.indexOf("totVm(seriesWithM(6)).selectedKey === 'total'") >= 0 &&
    totDescSrc.indexOf("'R 不出现 TOT 说明'") >= 0 &&
    totDescSrc.indexOf("'VM R 不写 TOT 说明'") >= 0
);

var detailWxml = fs.readFileSync(path.join(detailDir, 'index.wxml'), 'utf8');
assert(
  '普通详情页 view-label 接线未改结构',
  detailWxml.indexOf('view-label="{{leaderboardViewLabel}}"') >= 0
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
process.exit(0);
