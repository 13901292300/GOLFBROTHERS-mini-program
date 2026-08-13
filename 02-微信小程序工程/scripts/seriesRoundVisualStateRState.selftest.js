/**
 * Patch R-STATE：轮次选择器状态规范统一
 * 运行：node scripts/seriesRoundVisualStateRState.selftest.js
 */

var path = require('path');
var fs = require('fs');

var pageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);

var visual = require(path.join(pageDir, 'seriesRoundVisualState.js'));
var managePicker = require(path.join(pageDir, 'seriesManageRoundPicker.js'));
var standingsVm = require(path.join(pageDir, 'seriesStandingsViewModel.js'));
var scheduleVm = require(path.join(pageDir, 'seriesScheduleViewModel.js'));
var sheetVm = require(path.join(pageDir, 'seriesManageSheetViewModel.js'));

var wxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var wxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');

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

function match(status, groups) {
  return { status: status, groups: groups || [] };
}

function groupedMatch() {
  return match('registering', [{ players: [{ userId: 'u1' }] }]);
}

assert(
  '1 unassigned → 浅底语义 class',
  visual.resolveSeriesRoundVisualState(
    { roundStatus: 'scheduled' },
    match('registering')
  ).stateClass === 'round-selector-state--unassigned'
);

assert(
  '2 grouped → 基色 class',
  visual.resolveSeriesRoundVisualState(
    { roundStatus: 'scheduled' },
    groupedMatch()
  ).state === 'grouped'
);

assert(
  '3 LIVE',
  visual.resolveSeriesRoundVisualState(
    { roundStatus: 'scheduled' },
    match('ongoing')
  ).state === 'live'
);

assert(
  '4 completed',
  visual.resolveSeriesRoundVisualState(
    { roundStatus: 'scheduled' },
    match('finished')
  ).state === 'completed'
);

assert(
  'priority cancelled > completed > live > grouped',
  visual.resolveSeriesRoundVisualState(
    { roundStatus: 'cancelled' },
    match('ongoing')
  ).state === 'cancelled' &&
    visual.resolveSeriesRoundVisualState(
      { roundStatus: 'completed' },
      groupedMatch()
    ).state === 'completed' &&
    visual.resolveSeriesRoundVisualState(
      { roundStatus: 'scheduled' },
      match('ongoing')
    ).state === 'live'
);

var series = {
  seriesId: 's1',
  lifecycleStatus: 'published',
  rounds: [
    { roundId: 'r1', index: 1, name: 'R1', matchId: 'm1', roundStatus: 'scheduled' },
    { roundId: 'r2', index: 2, name: 'R2', matchId: 'm2', roundStatus: 'scheduled' }
  ]
};
var store = {
  m1: match('registering'),
  m2: groupedMatch()
};
var picker = managePicker.buildManageRoundPickerViewModel({
  series: series,
  suggestedRoundId: 'r2',
  getMatchById: function (id) {
    return store[id] || null;
  }
});
assert(
  '5 M uses shared projection',
  picker.items[0].state === 'unassigned' &&
    picker.items[1].state === 'grouped' &&
    picker.items[0].stateClass === 'round-selector-state--unassigned'
);

var parts = standingsVm.buildRoundSelectorParts(
  [
    {
      roundId: 'r1',
      label: 'R1',
      statusToken: 'live'
    },
    {
      roundId: 'r2',
      label: 'R2',
      statusToken: 'finished'
    }
  ],
  'r1'
);
assert(
  '5b 总榜 selector stateClass + legacy map',
  parts.roundSelectorItems[0].state === 'live' &&
    parts.roundSelectorItems[0].stateClass === 'round-selector-state--live' &&
    parts.roundSelectorItems[1].state === 'completed' &&
    parts.roundSelectorItems[0].isSelected === true &&
    parts.roundSelectorItems[1].isSelected === false
);

var sched = scheduleVm.buildScheduleRoundSelector(
  series,
  [],
  function (id) {
    return store[id] || null;
  }
);
assert(
  '5c 赛程 selector same function',
  sched.roundSelectorItems[0].state === 'unassigned' &&
    sched.roundSelectorItems[1].state === 'grouped'
);

assert(
  '6 selected 不修改 stateClass',
  parts.roundSelectorItems[0].stateClass === 'round-selector-state--live' &&
    parts.roundSelectorItems[0].isSelected === true
);

assert(
  '7 选中 LIVE 仍蓝底 class',
  parts.roundSelectorItems[0].isSelected &&
    parts.roundSelectorItems[0].stateClass.indexOf('--live') >= 0
);

assert(
  '8 选中 completed 仍灰底 class',
  standingsVm.buildRoundSelectorParts(
    [{ roundId: 'r2', label: 'R2', statusToken: 'finished' }],
    'r2'
  ).roundSelectorItems[0].stateClass === 'round-selector-state--completed'
);

assert(
  '9 选中 grouped 仍基色 class',
  (function () {
    var sheet = sheetVm.buildSeriesManageSheetViewModel({
      series: series,
      user: { userId: 'host' },
      canManageSeries: true,
      suggestedRoundId: 'r1',
      selectedRoundId: 'r2',
      getMatchById: function (id) {
        return store[id] || null;
      }
    });
    var item = sheet.roundPicker.items.filter(function (it) {
      return it.roundId === 'r2';
    })[0];
    return (
      item &&
      item.isSelected &&
      item.state === 'grouped' &&
      item.stateClass === 'round-selector-state--grouped'
    );
  })()
);

assert(
  '10 任意选择器最多一个 selected',
  parts.roundSelectorItems.filter(function (it) {
    return it.isSelected;
  }).length === 1 &&
    parts.totalSelector.isSelected === false
);

assert(
  '11 建议轮无 selected 边框/对勾',
  (function () {
    var sheet = sheetVm.buildSeriesManageSheetViewModel({
      series: series,
      user: { userId: 'host' },
      canManageSeries: true,
      suggestedRoundId: 'r2',
      selectedRoundId: '',
      getMatchById: function (id) {
        return store[id] || null;
      }
    });
    var sug = sheet.roundPicker.items.filter(function (it) {
      return it.isSuggested;
    })[0];
    return (
      sug &&
      sug.roundId === 'r2' &&
      !sug.isSelected &&
      !sug.showSelectedCheck
    );
  })()
);

assert(
  '12 用户点击后建议态退出',
  (function () {
    var sheet = sheetVm.buildSeriesManageSheetViewModel({
      series: series,
      user: { userId: 'host' },
      canManageSeries: true,
      suggestedRoundId: 'r2',
      selectedRoundId: 'r1',
      getMatchById: function (id) {
        return store[id] || null;
      }
    });
    return (
      sheet.roundPicker.suggestedRoundId === '' &&
      sheet.roundPicker.items.every(function (it) {
        return !it.isSuggested;
      })
    );
  })()
);

assert(
  '13 无金框/蓝框双选残留 class',
  wxml.indexOf('is-selected') < 0 &&
    wxml.indexOf('is-suggested') < 0 &&
    wxml.indexOf('status-{{item.statusToken}}') < 0 &&
    wxss.indexOf('.series-standings-round-chip.is-selected') < 0 &&
    wxss.indexOf('.series-manage-round-card.is-selected') < 0 &&
    wxss.indexOf('round-selector-item--selected') >= 0
);

assert(
  '14 selectedRoundId 不进入状态投影',
  fs
    .readFileSync(path.join(pageDir, 'seriesRoundVisualState.js'), 'utf8')
    .indexOf('selectedRoundId') < 0 &&
    fs
      .readFileSync(path.join(pageDir, 'seriesRoundVisualState.js'), 'utf8')
      .indexOf('activeTab') < 0
);

assert(
  '15 状态变化仅改 stateClass，选中位独立',
  parts.roundSelectorItems[0].isSelected === true &&
    parts.roundSelectorItems[0].showSelectedCheck === true &&
    parts.roundSelectorItems[0].stateClass === 'round-selector-state--live'
);

console.log('');
console.log('R-STATE selftest: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
