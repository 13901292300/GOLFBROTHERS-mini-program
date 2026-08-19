/**
 * 莱德杯详情：schedule TAB 文案（分组/出发表、轮次赛制、查看得分榜）
 * 运行：node scripts/seriesRyderCupScheduleDisplay.selftest.js
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
var live = require(path.join(seriesDir, 'seriesLiveSessionProjection.js'));
var scheduleVm = require(path.join(seriesDir, 'seriesScheduleViewModel.js'));
var roundInfo = require(path.join(seriesDir, 'seriesRoundInfoText.js'));
var gameModeLabel = require(path.join(utilsDir, 'seriesGameModeLabel.js'));

var pageJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');
var scheduleSrc = fs.readFileSync(path.join(seriesDir, 'seriesScheduleViewModel.js'), 'utf8');

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

function tabById(tabs, id) {
  var list = tabs || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].id === id) return list[i];
  }
  return null;
}

function makeRyderSeries(over) {
  return Object.assign(
    {
      seriesId: 's-ryder-display',
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
          courseName: '球场信息'
        },
        {
          roundId: 'r2',
          index: 2,
          matchId: 'm2',
          dateTime: '2026-08-21 07:30',
          gameMode: '四人四球比洞赛',
          courseName: '球场信息'
        }
      ]
    },
    over || {}
  );
}

function makeNormalSeries() {
  return {
    seriesId: 's-normal',
    hostMode: 'organization',
    scoringRule: { mode: 'global_m', globalM: 2 },
    rounds: [
      {
        roundId: 'r1',
        index: 1,
        matchId: 'm1',
        dateTime: '2026-08-20 08:00',
        gameMode: '个人比杆赛',
        courseName: '球场A'
      }
    ]
  };
}

function scheduleOf(series, selectedRoundId, roundStates, getMatchById) {
  return scheduleVm.buildSeriesScheduleViewModel({
    series: series,
    selectedRoundId: selectedRoundId,
    roundStates: roundStates,
    getMatchById: getMatchById || function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
}

var registerStates = [
  { roundId: 'r1', index: 1, label: 'R1', statusToken: 'scheduled', dateTime: '2026-08-20 08:00', courseName: '球场信息' },
  { roundId: 'r2', index: 2, label: 'R2', statusToken: 'scheduled', dateTime: '2026-08-21 07:30', courseName: '球场信息' }
];
var groupedStates = [
  { roundId: 'r1', index: 1, label: 'R1', statusToken: 'grouped', dateTime: '2026-08-20 08:00', courseName: '球场信息' },
  { roundId: 'r2', index: 2, label: 'R2', statusToken: 'scheduled', dateTime: '2026-08-21 07:30', courseName: '球场信息' }
];
var liveStates = [
  { roundId: 'r1', index: 1, label: 'R1', statusToken: 'live', dateTime: '2026-08-20 08:00', courseName: '球场信息' },
  { roundId: 'r2', index: 2, label: 'R2', statusToken: 'scheduled', dateTime: '2026-08-21 07:30', courseName: '球场信息' }
];

assert(
  '1 莱德杯报名阶段 TAB 显示分组',
  live.hasAnyLiveRound(registerStates) === false &&
    tabById(live.buildSeriesDetailTabs(live.hasAnyLiveRound(registerStates), { ryderCup: true }), 'schedule').label === '分组'
);
assert(
  '2 莱德杯赛前已分组仍显示分组（不按分组猜测）',
  live.hasAnyLiveRound(groupedStates) === false &&
    tabById(live.buildSeriesDetailTabs(live.hasAnyLiveRound(groupedStates), { ryderCup: true }), 'schedule').label === '分组'
);
assert(
  '3 任一有效轮 LIVE 后 TAB 显示出发表',
  live.hasAnyLiveRound(liveStates) === true &&
    tabById(live.buildSeriesDetailTabs(true, { ryderCup: true }), 'schedule').label === '出发表'
);
assert(
  '4 进入 LIVE 后内部 id 仍是 schedule',
  tabById(live.buildSeriesDetailTabs(true, { ryderCup: true }), 'schedule').id === 'schedule'
);
assert(
  '5 普通 Series TAB 文案不变',
  tabById(live.buildSeriesDetailTabs(false), 'schedule').label === '出发表' &&
    tabById(live.buildSeriesDetailTabs(true), 'schedule').label === '出发表' &&
    tabById(live.buildSeriesDetailTabs(false), 'standings').label === '总榜'
);

var r1Vm = scheduleOf(makeRyderSeries(), 'r1', registerStates);
var r2Vm = scheduleOf(makeRyderSeries(), 'r2', registerStates);
assert(
  '6 R1 轮次信息末尾显示 R1 赛制',
  r1Vm.roundInfoText === 'R1 · AUG 20 · 球场信息 · 个人比洞赛'
);
assert(
  '7 切 R2 后显示 R2 赛制',
  r2Vm.roundInfoText === 'R2 · AUG 21 · 球场信息 · 四人四球比洞赛'
);

var g5 = gameModeLabel.resolveSeriesGameModeLabel('个人比洞赛');
var g6 = gameModeLabel.resolveSeriesGameModeLabel('四人四球比洞赛');
var g7 = gameModeLabel.resolveSeriesGameModeLabel('最佳球位比洞赛');
var g8 = gameModeLabel.resolveSeriesGameModeLabel('四人两球比洞赛');
assert(
  '8 赛制名称使用现有 G5–G8 展示值',
  g5 === '个人比洞赛' &&
    g6 === '四人四球比洞赛' &&
    g7 === '最佳球位比洞赛' &&
    g8 === '四人两球比洞赛' &&
    r1Vm.roundInfoText.indexOf('match_play') < 0 &&
    r1Vm.roundInfoText.indexOf('ryder_cup') < 0
);

var enumSeries = makeRyderSeries({
  rounds: [
    {
      roundId: 'r1',
      index: 1,
      matchId: 'm1',
      dateTime: '2026-08-20 08:00',
      gameMode: 'match_play',
      courseName: '球场信息'
    }
  ]
});
var enumVm = scheduleOf(enumSeries, 'r1', [registerStates[0]]);
assert(
  '内部枚举不直接展示',
  enumVm.roundInfoText.indexOf('match_play') < 0 &&
    enumVm.roundInfoText.slice(-5) === '个人比洞赛'
);

var missingMode = makeRyderSeries({
  rounds: [
    {
      roundId: 'r1',
      index: 1,
      matchId: 'm1',
      dateTime: '2026-08-20 08:00',
      gameMode: '',
      courseName: '球场信息'
    }
  ]
});
var pendingVm = scheduleOf(missingMode, 'r1', [registerStates[0]]);
assert(
  '赛制缺失时降级为赛制待定',
  pendingVm.roundInfoText.slice(-4) === '赛制待定'
);

var stationVm = scheduleOf(
  makeRyderSeries(),
  'r1',
  registerStates,
  function (id) {
    if (id !== 'm1') return null;
    return { matchId: 'm1', gameMode: '最佳球位比洞赛', status: 'registering', groups: [] };
  }
);
var fallbackVm = scheduleOf(makeRyderSeries(), 'r1', registerStates, function () {
  return null;
});
assert(
  'station 有赛制时优先 Match，缺失时读 Series Round',
  stationVm.roundInfoText.indexOf('最佳球位比洞赛') >= 0 &&
    fallbackVm.roundInfoText.indexOf('个人比洞赛') >= 0 &&
    stationVm.roundInfoText.indexOf('个人比洞赛') < 0
);

assert(
  '9 sticky/非 sticky 共用 schedule.roundInfoText',
  (pageWxml.match(/round-info-text="\{\{schedule\.roundInfoText\}\}"/g) || []).length >= 2 &&
    pageWxml.indexOf('schedule.gameMode') < 0
);

var liveRyder = scheduleOf(makeRyderSeries(), 'r1', liveStates);
assert(
  '10 莱德杯显示查看得分榜',
  liveRyder.showViewLeaderboard === true && liveRyder.viewLeaderboardLabel === '查看得分榜'
);
assert(
  '11 点击后进入 standings',
  pageJs.indexOf('onScheduleViewLeaderboard') >= 0 &&
    pageJs.indexOf("_performSwitchTab('standings')") >= 0 &&
    pageWxml.indexOf('bindtap="onScheduleViewLeaderboard"') >= 0
);

var normalVm = scheduleOf(
  makeNormalSeries(),
  'r1',
  [{ roundId: 'r1', index: 1, label: 'R1', statusToken: 'live', dateTime: '2026-08-20 08:00', courseName: '球场A' }]
);
assert(
  '12 普通 Series 入口文案与轮次信息不追加赛制',
  normalVm.viewLeaderboardLabel === '查看领先榜' &&
    normalVm.roundInfoText === 'R1 · AUG 20 · 球场A' &&
    normalVm.roundInfoText.indexOf('个人比杆赛') < 0
);

assert(
  '刷新不重置 TAB：reloadViewModel 不改写 _activeTab',
  /reloadViewModel:\s*function/.test(pageJs) &&
    pageJs.slice(pageJs.indexOf('reloadViewModel: function'), pageJs.indexOf('_performSwitchTab: function')).indexOf('this._activeTab =') < 0
);
assert(
  'WXML 不硬编码查看领先榜/得分榜',
  pageWxml.indexOf('查看领先榜') < 0 &&
    pageWxml.indexOf('查看得分榜') < 0 &&
    pageWxml.indexOf('schedule.viewLeaderboardLabel') >= 0 &&
    scheduleSrc.indexOf("viewLeaderboardLabel: '查看领先榜'") >= 0
);
assert(
  '仅显式 ryder_cup 改文案',
  !seriesRyderCup.isRyderCupSeries({ templateId: 'ryder' }) &&
    scheduleOf(
      Object.assign(makeRyderSeries(), { seriesCompetitionType: '' }),
      'r1',
      liveStates
    ).viewLeaderboardLabel === '查看领先榜'
);
assert(
  'append 纯函数与 VM 一致',
  roundInfo.appendRyderCupScheduleGameMode(
    'R1 · AUG 20 · 球场信息',
    'r1',
    makeRyderSeries(),
    ''
  ) === 'R1 · AUG 20 · 球场信息 · 个人比洞赛'
);

if (failed) {
  console.log('\nFAILED ' + failed);
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
  process.exit(1);
}
console.log('\nAll ' + passed + ' passed');
