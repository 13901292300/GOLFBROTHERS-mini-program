/**
 * scoringRule.mode × TOTAL 并列矩阵
 * 运行：node scripts/seriesScoringModeTotMatrix.selftest.js
 */

var path = require('path');

var standingsVm = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail',
  'seriesStandingsViewModel.js'
));
var detailVm = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail',
  'seriesDetailViewModel.js'
));
var seriesRyderCup = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'utils',
  'seriesRyderCup.js'
));

var passed = 0;
var failed = 0;

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function rounds() {
  return [
    {
      roundId: 'r1',
      index: 1,
      gameMode: '个人比杆赛',
      dateTime: '2026-09-08 08:00',
      roundStatus: 'scheduled'
    },
    {
      roundId: 'r2',
      index: 2,
      gameMode: '个人比杆赛',
      dateTime: '2026-09-09 08:00',
      roundStatus: 'scheduled'
    }
  ];
}

function states(liveRid) {
  return [
    {
      roundId: 'r1',
      index: 1,
      label: 'R1',
      state: liveRid === 'r1' ? 'live' : 'unassigned',
      stateClass:
        liveRid === 'r1'
          ? 'round-selector-state--live'
          : 'round-selector-state--unassigned'
    },
    {
      roundId: 'r2',
      index: 2,
      label: 'R2',
      state: liveRid === 'r2' ? 'live' : 'unassigned',
      stateClass:
        liveRid === 'r2'
          ? 'round-selector-state--live'
          : 'round-selector-state--unassigned'
    }
  ];
}

function seriesOf(mode, extra) {
  return Object.assign(
    {
      seriesId: 's-' + mode,
      lifecycleStatus: 'published',
      hostMode: 'organization',
      scoringRule: { mode: mode, globalM: mode === 'global_m' ? 10 : undefined },
      rounds: rounds(),
      participants: [
        { seriesParticipantId: 't1', kind: 'team', nameSnapshot: '甲' },
        { seriesParticipantId: 't2', kind: 'team', nameSnapshot: '乙' }
      ]
    },
    extra || {}
  );
}

function keysOf(vm) {
  return (vm.roundSelectorItems || []).map(function (it) {
    return it.key;
  });
}

var gm = seriesOf('global_m');
assert('global_m includeTot', standingsVm.shouldIncludeTotalSelector(gm) === true);
var gmVm = standingsVm.buildSeriesStandingsViewModel({
  series: gm,
  roundStates: states('')
});
assert(
  'global_m 无 LIVE 默认 TOTAL 且 selector 含 total',
  gmVm.selectedKey === 'total' &&
    keysOf(gmVm).indexOf('total') === 0 &&
    gmVm.showTot === false &&
    gmVm.roundSelectorItems.some(function (it) {
      return it.key === 'r1';
    }) &&
    gmVm.roundSelectorItems[0] &&
    String(gmVm.roundSelectorItems[0].displayText).indexOf('R') !== 0
);
var gmLive = standingsVm.buildSeriesStandingsViewModel({
  series: gm,
  roundStates: states('r2')
});
assert('global_m 有 LIVE 默认最早 LIVE', gmLive.selectedKey === 'r2');
var gmPick = standingsVm.buildSeriesStandingsViewModel({
  series: gm,
  selectedKey: 'r1',
  roundStates: states('r2')
});
assert('global_m 用户切换 sticky Rx', gmPick.selectedKey === 'r1');
assert(
  'global_m sticky 与非 sticky 共用 displayText',
  (gmPick.roundSelectorItems.filter(function (it) {
    return it.key === 'r1';
  })[0] || {}).displayText ===
    (gmLive.roundSelectorItems.filter(function (it) {
      return it.key === 'r1';
    })[0] || {}).displayText
);
var gmCum = standingsVm.buildSeriesStandingsViewModel({
  series: gm,
  selectedKey: 'cumulative',
  roundStates: states('')
});
assert('global_m cumulative key 兼容为 TOTAL', gmCum.selectedKey === 'total');

var prn = seriesOf('per_round_n');
assert('per_round_n 不显示 TOTAL', standingsVm.shouldIncludeTotalSelector(prn) === false);
var prnVm = standingsVm.buildSeriesStandingsViewModel({
  series: prn,
  roundStates: states('')
});
assert(
  'per_round_n selector 无 TOTAL',
  keysOf(prnVm).indexOf('total') < 0 &&
    keysOf(prnVm).indexOf('cumulative') < 0 &&
    prnVm.showTot === false
);
var prnLive = standingsVm.buildSeriesStandingsViewModel({
  series: prn,
  roundStates: states('r1')
});
assert('per_round_n LIVE 默认该轮', prnLive.selectedKey === 'r1');
var prnStick = standingsVm.buildSeriesStandingsViewModel({
  series: prn,
  selectedKey: 'r2',
  roundStates: states('r1')
});
assert('per_round_n 用户切换 sticky', prnStick.selectedKey === 'r2');
var prnTotKey = standingsVm.buildSeriesStandingsViewModel({
  series: prn,
  selectedKey: 'total',
  roundStates: states('')
});
assert(
  'per_round_n 传入 total 不展示 TOTAL',
  prnTotKey.selectedKey !== 'total' && keysOf(prnTotKey).indexOf('total') < 0
);

var ryder = seriesOf('ryder_match_play', {
  seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
  scoringRule: seriesRyderCup.createRyderCupScoringRule
    ? seriesRyderCup.createRyderCupScoringRule()
    : { mode: 'ryder_match_play' },
  rounds: [
    { roundId: 'r1', index: 1, gameMode: '个人比洞赛', dateTime: '2026-09-08 08:00', matchId: 'm1' },
    { roundId: 'r2', index: 2, gameMode: '四人四球比洞赛', dateTime: '2026-09-09 08:00', matchId: 'm2' }
  ]
});
assert('ryder includeTot false', standingsVm.shouldIncludeTotalSelector(ryder) === false);
var ryderProj = detailVm.buildSeriesStandingsProjection({
  series: ryder,
  roundStates: states(''),
  getMatchById: function () {
    return null;
  },
  getIndexByMatchId: function () {
    return null;
  }
});
assert(
  '莱德杯只有 Rx',
  ryderProj.ok &&
    keysOf(ryderProj).indexOf('total') < 0 &&
    ryderProj.showTot === false
);

var lightGm = detailVm.buildSeriesStandingsProjection({
  series: gm,
  selectedKey: 'r1',
  userPicked: true,
  visited: true,
  roundStates: states('r2'),
  getMatchById: function () {
    return null;
  },
  getIndexByMatchId: function () {
    return null;
  }
});
assert('global_m 轻量 rebuild 保留用户 Rx', lightGm.selectedKey === 'r1');

var lightDefault = detailVm.buildSeriesStandingsProjection({
  series: gm,
  selectedKey: '',
  userPicked: false,
  visited: false,
  roundStates: states(''),
  getMatchById: function () {
    return null;
  },
  getIndexByMatchId: function () {
    return null;
  }
});
assert('global_m 非 sticky 无 LIVE 默认 TOTAL', lightDefault.selectedKey === 'total');

console.log('');
console.log(failed ? 'FAIL ' + failed : 'OK ' + passed);
process.exit(failed ? 1 : 0);
