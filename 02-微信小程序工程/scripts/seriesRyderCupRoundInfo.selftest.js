/**
 * 莱德杯得分榜 roundInfoText：轮次 · 时间 · 赛制
 * 运行：node scripts/seriesRyderCupRoundInfo.selftest.js
 */

var path = require('path');
var fs = require('fs');

if (typeof global.wx === 'undefined') {
  global.wx = {
    getStorageSync: function () {
      return null;
    }
  };
}

var root = path.join(__dirname, '..');
var utilsDir = path.join(root, 'miniprogram', 'utils');
var seriesDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);

var seriesRyderCup = require(path.join(utilsDir, 'seriesRyderCup.js'));
var adapter = require(path.join(seriesDir, 'seriesRyderCupScoreboardAdapter.js'));
var roundInfo = require(path.join(seriesDir, 'seriesRoundInfoText.js'));
var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));

var pageWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');
var dockWxml = fs.readFileSync(
  path.join(root, 'miniprogram', 'components', 'series-round-selector-dock', 'index.wxml'),
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
      seriesId: 's1',
      seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
      publishToken: 'tok',
      hostMode: 'organization',
      scoringRule: seriesRyderCup.createRyderCupScoringRule(),
      participants: [
        { kind: 'team', seriesParticipantId: 'team:a', nameSnapshot: '红队' },
        { kind: 'team', seriesParticipantId: 'team:b', nameSnapshot: '蓝队' }
      ],
      rounds: [
        {
          roundId: 'r1',
          index: 1,
          matchId: 'm1',
          dateTime: '2026-08-20 08:00',
          gameMode: '个人比洞赛',
          courseName: '球场A'
        },
        {
          roundId: 'r2',
          index: 2,
          matchId: 'm2',
          dateTime: '2026-08-21 07:30',
          gameMode: '四人四球比洞赛',
          courseName: '球场B'
        }
      ]
    },
    over || {}
  );
}

var roundStates = [
  { roundId: 'r1', index: 1, label: 'R1', state: 'grouped' },
  { roundId: 'r2', index: 2, label: 'R2', state: 'grouped' }
];

function viewOf(series, selectedKey, deps) {
  return adapter.buildRyderCupStandingsView({
    series: series,
    selectedKey: selectedKey,
    roundStates: roundStates,
    userPicked: true,
    visited: true,
    deps: deps || {
      getMatchById: function () {
        return null;
      }
    }
  });
}

var series = makeSeries();
var v1 = viewOf(series, 'r1');
assert(
  '1 默认 R1 显示轮次、时间、G5 名称',
  v1.roundInfoText === '第一轮 · 2026年8月20日 08:00 · 个人比洞赛' &&
    v1.selectedKey === 'r1' &&
    v1.roundInfoText.indexOf('R1') < 0
);

var v2 = viewOf(series, 'r2');
assert(
  '2 点击 R2 后立即显示 R2 信息',
  v2.roundInfoText === '第二轮 · 2026年8月21日 07:30 · 四人四球比洞赛' &&
    v2.selectedKey === 'r2'
);

var back = viewOf(series, 'r1');
assert('3 切回 R1 后恢复 R1 信息', back.roundInfoText === v1.roundInfoText);

assert(
  '4 R1/R2 不串数据',
  v1.roundInfoText.indexOf('08:00') >= 0 &&
    v1.roundInfoText.indexOf('07:30') < 0 &&
    v2.roundInfoText.indexOf('07:30') >= 0 &&
    v2.roundInfoText.indexOf('08:00') < 0 &&
    v1.roundInfoText.indexOf('个人比洞赛') >= 0 &&
    v2.roundInfoText.indexOf('四人四球比洞赛') >= 0
);

var noTime = makeSeries({
  rounds: [
    Object.assign({}, series.rounds[0], { dateTime: '' }),
    series.rounds[1]
  ]
});
assert(
  '5 时间缺失安全降级',
  viewOf(noTime, 'r1').roundInfoText === '第一轮 · 比赛时间待定 · 个人比洞赛'
);

var noMode = makeSeries({
  rounds: [
    Object.assign({}, series.rounds[0], { gameMode: 'not-a-mode' }),
    series.rounds[1]
  ]
});
assert(
  '6 赛制缺失安全降级',
  viewOf(noMode, 'r1').roundInfoText === '第一轮 · 2026年8月20日 08:00 · 赛制待定'
);

var missingStation = viewOf(series, 'r2', {
  getMatchById: function () {
    return null;
  }
});
assert(
  '7 station Match 缺失仍从 Series Round 显示',
  missingStation.selectedRoundStationOk === false &&
    missingStation.roundInfoText === '第二轮 · 2026年8月21日 07:30 · 四人四球比洞赛'
);

var standingsBinds = pageWxml.match(/round-info-text="\{\{standings\.roundInfoText\}\}"/g) || [];
assert(
  '8 sticky 和非 sticky 使用同一个 roundInfoText',
  standingsBinds.length >= 2 &&
    pageWxml.indexOf('series-round-dock--inflow') >= 0 &&
    pageWxml.indexOf('series-round-dock--fixed') >= 0 &&
    dockWxml.indexOf('{{roundInfoText}}') >= 0
);

var ordinary = standingsVm.buildSeriesStandingsViewModel({
  series: {
    seriesId: 's-n',
    scoringRule: { mode: 'global_m', globalM: 2 },
    rounds: [
      {
        roundId: 'r1',
        index: 1,
        dateTime: '2026-08-20 08:00',
        gameMode: '个人比杆赛',
        courseName: '南山'
      }
    ],
    participants: [{ seriesParticipantId: 'team:a', nameSnapshot: '甲' }]
  },
  selectedKey: 'r1',
  roundStates: [{ roundId: 'r1', index: 1, label: 'R1', state: 'grouped', dateTime: '2026-08-20 08:00', courseName: '南山' }],
  standingsResult: standingsVm.emptyStandingsResult()
});
assert(
  '9 普通 Series 不回归',
  ordinary.mode === 'global_m' &&
    ordinary.roundInfoText.indexOf('第一轮') < 0 &&
    ordinary.roundInfoText.indexOf('08:00') < 0 &&
    ordinary.roundInfoText.indexOf('AUG') >= 0
);

assert(
  '10 不出现 TOT、本轮得分或球场信息',
  v1.showTot === false &&
    !v1.totalSelector &&
    v1.roundInfoText.indexOf('球场') < 0 &&
    v1.roundInfoText.indexOf('C1') < 0 &&
    v1.roundInfoText.indexOf('1.5') < 0 &&
    v1.roundInfoText.indexOf('总比分') < 0 &&
    roundInfo.buildRyderCupRoundInfoText('missing', null, series) === ''
);

assert(
  '找不到 Round 不串其他轮',
  roundInfo.buildRyderCupRoundInfoText('r9', { roundId: 'r1' }, series) === ''
);

if (failed) {
  console.log('\nFAILED ' + failed);
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
  process.exit(1);
}
console.log('\nAll ' + passed + ' passed');
