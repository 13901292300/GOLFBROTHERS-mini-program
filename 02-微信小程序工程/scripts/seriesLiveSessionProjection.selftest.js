/**
 * 系列赛 LIVE 详情状态投影：TAB / 默认轮 / 出发表 / 视觉 class
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesLiveSessionProjection.selftest.js
 */

var path = require('path');
var fs = require('fs');

var seriesDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);
var dockDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'components',
  'series-round-selector-dock'
);
var createDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'create',
  'pages',
  'series'
);
var detailDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'detail'
);

var live = require(path.join(seriesDir, 'seriesLiveSessionProjection.js'));
var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));
var scheduleVm = require(path.join(seriesDir, 'seriesScheduleViewModel.js'));
var detailVm = require(path.join(seriesDir, 'seriesDetailViewModel.js'));

var pageJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(seriesDir, 'index.wxss'), 'utf8');
var scheduleVmSrc = fs.readFileSync(path.join(seriesDir, 'seriesScheduleViewModel.js'), 'utf8');
var dockWxml = fs.readFileSync(path.join(dockDir, 'index.wxml'), 'utf8');
var dockWxss = fs.readFileSync(path.join(dockDir, 'index.wxss'), 'utf8');
var dockJs = fs.readFileSync(path.join(dockDir, 'index.js'), 'utf8');
var commonWxss = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'styles', 'tournament-common.wxss'),
  'utf8'
);
var createWxml = fs.readFileSync(path.join(createDir, 'index.wxml'), 'utf8');
var createJs = fs.readFileSync(path.join(createDir, 'index.js'), 'utf8');
var manageSrc = fs.readFileSync(path.join(seriesDir, 'seriesManageRoundPicker.js'), 'utf8');
var detailJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');
var detailWxml = fs.readFileSync(path.join(detailDir, 'index.wxml'), 'utf8');

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

function states(list) {
  return list.map(function (row, i) {
    return Object.assign(
      {
        roundId: 'r' + (i + 1),
        index: i + 1,
        label: 'R' + (i + 1)
      },
      row
    );
  });
}

function seriesOf(mode, rounds, extra) {
  return Object.assign(
    {
      seriesId: 's-live',
      lifecycleStatus: 'published',
      publishState: 'published',
      scoringRule: { mode: mode || 'global_m', globalM: 2, scoreBasis: 'gross' },
      participants: [{ seriesParticipantId: 'team:a', nameSnapshot: '甲' }],
      rounds: rounds || [
        { roundId: 'r1', index: 1, matchId: 'm1' },
        { roundId: 'r2', index: 2, matchId: 'm2' }
      ]
    },
    extra || {}
  );
}

var idle = states([{ state: 'unassigned' }, { state: 'unassigned' }]);
var liveR2 = states([{ state: 'completed' }, { state: 'live' }, { state: 'grouped' }]);
var twoLive = states([{ state: 'live' }, { state: 'live' }, { state: 'unassigned' }]);
var liveThenDone = states([{ state: 'completed' }, { state: 'grouped' }]);
var allDone = states([{ state: 'completed' }, { state: 'completed' }]);
var groupedFirst = states([{ state: 'grouped' }, { state: 'unassigned' }]);

assert(
  '默认进入赛事信息',
  pageJs.indexOf("var DEFAULT_TAB = 'info'") >= 0 &&
    /ALLOWED_TABS\[tabQ\] \? tabQ : DEFAULT_TAB/.test(pageJs) &&
    pageWxml.indexOf("activeTab === 'info'") >= 0
);

assert(
  'TAB 文案改为出发表；创建页未改成出发表 TAB',
  live.SERIES_TABS.filter(function (t) {
    return t.id === 'schedule';
  })[0].label === '出发表' &&
    pageWxml.indexOf('出发表') >= 0 &&
    createWxml.indexOf("label: '出发表'") < 0
);

assert(
  '无 LIVE 时报名保持原位',
  live.tabIds(live.buildSeriesDetailTabs(false)).join(',') ===
    'info,standings,register,schedule,discussion'
);

assert(
  '有 LIVE 时报名移到最后且其它相对顺序不变',
  live.tabIds(live.buildSeriesDetailTabs(true)).join(',') ===
    'info,standings,schedule,discussion,register'
);

assert(
  '多轮 LIVE 仍把报名放最后',
  live.hasAnyLiveRound(twoLive) === true &&
    live.tabIds(live.buildSeriesDetailTabs(true))[4] === 'register'
);

assert(
  'LIVE 结束后有后续未开始轮：报名回原位',
  live.hasAnyLiveRound(liveThenDone) === false &&
    live.tabIds(live.buildSeriesDetailTabs(false))[2] === 'register'
);

assert(
  'TAB 选中用 item.id 不用数组下标',
  pageWxml.indexOf("activeTab === item.id") >= 0 &&
    pageWxml.indexOf('data-tab="{{item.id}}"') >= 0 &&
    pageWxml.indexOf('wx:key="id"') >= 0 &&
    pageJs.indexOf('tabs[this._activeTabIndex]') < 0 &&
    pageJs.indexOf('tabs[activeIndex]') < 0
);

assert(
  '停留报名 TAB 时只改 tabs 数组，不改 activeTab 赋值抢焦点',
  /activeTab:\s*this\._activeTab/.test(pageJs) &&
    pageJs.indexOf("this._activeTab = 'register'") < 0
);

assert(
  '单轮 LIVE 默认轮为该 LIVE',
  live.resolveDefaultTargetRoundId(liveR2) === 'r2'
);

assert(
  '多轮同时 LIVE 取系列顺序最靠前',
  live.resolveDefaultTargetRoundId(twoLive) === 'r1'
);

assert(
  '无 LIVE 时优先已分组未开始',
  live.resolveDefaultTargetRoundId(groupedFirst) === 'r1'
);

assert(
  '无 LIVE/分组时取最后已完成',
  live.resolveDefaultTargetRoundId(allDone) === 'r2'
);

assert(
  '手选后刷新不抢回 LIVE',
  live.resolveSessionSelectedRoundId({
    currentKey: 'r3',
    userPicked: true,
    visited: true,
    roundStates: twoLive
  }) === 'r3'
);

assert(
  '总榜出发表会话字段互相独立',
  pageJs.indexOf('_standingsUserPicked') >= 0 &&
    pageJs.indexOf('_scheduleUserPicked') >= 0 &&
    pageJs.indexOf('_standingsVisited') >= 0 &&
    pageJs.indexOf('_scheduleVisited') >= 0 &&
    /_standingsUserPicked = true/.test(pageJs) &&
    /_scheduleUserPicked = true/.test(pageJs)
);

assert(
  'LIVE 完成后未手选保持当前轮',
  live.resolveSessionSelectedRoundId({
    currentKey: 'r1',
    userPicked: false,
    visited: true,
    roundStates: liveThenDone
  }) === 'r1'
);

assert(
  '未手选且随后出现 LIVE 才跟随默认',
  live.resolveSessionSelectedRoundId({
    currentKey: 'r1',
    userPicked: false,
    visited: true,
    roundStates: states([{ state: 'completed' }, { state: 'live' }])
  }) === 'r2'
);

assert(
  'global_m 空 selectedKey 默认 LIVE 而非 TOT',
  standingsVm.buildSeriesStandingsViewModel({
    series: seriesOf('global_m'),
    selectedKey: '',
    roundStates: liveR2,
    standingsResult: standingsVm.emptyStandingsResult()
  }).selectedKey === 'r2'
);

assert(
  'per_round_n 默认 LIVE 且仍无 TOT',
  (function () {
    var vm = standingsVm.buildSeriesStandingsViewModel({
      series: seriesOf('per_round_n'),
      selectedKey: '',
      roundStates: liveR2,
      standingsResult: standingsVm.emptyStandingsResult()
    });
    return vm.selectedKey === 'r2' && vm.showTot === false;
  })()
);

assert(
  'global_m 仍可手选 TOT',
  standingsVm.buildSeriesStandingsViewModel({
    series: seriesOf('global_m'),
    selectedKey: 'cumulative',
    roundStates: liveR2,
    standingsResult: standingsVm.emptyStandingsResult()
  }).selectedKey === 'cumulative'
);

assert(
  '出发表默认定位 LIVE',
  scheduleVm.buildScheduleRoundSelector(
    seriesOf('global_m', [
      { roundId: 'r1', index: 1, matchId: 'm1', roundStatus: 'completed' },
      { roundId: 'r2', index: 2, matchId: 'm2', roundStatus: 'live' }
    ]),
    liveR2,
    function (id) {
      return id === 'm2' ? { status: 'ongoing' } : { status: 'finished' };
    }
  ).selectedKey === 'r2'
);

assert(
  '查看领先榜进入相同 roundId',
  pageJs.indexOf('onScheduleViewLeaderboard') >= 0 &&
    /_standingsSelectedKey = rid/.test(pageJs) &&
    pageJs.indexOf("_performSwitchTab('standings')") >= 0 &&
    pageWxml.indexOf('查看领先榜') >= 0
);

assert(
  'LIVE 蓝底白字且轮次按钮不呼吸',
  /round-selector-state--live\s*\{[\s\S]{0,180}--data-blue/.test(pageWxss) &&
    pageWxss.indexOf('.round-selector-state--live') >= 0 &&
    !/\.round-selector-state--live[^{]*\{[^}]*flash-live/.test(pageWxss) &&
    !/\.series-standings-round-chip[^{]*\{[^}]*flash-live/.test(dockWxss)
);

assert(
  'LIVE 标签使用现有呼吸 class',
  dockWxml.indexOf('live-badge-pulse') >= 0 &&
    commonWxss.indexOf('.live-badge-pulse') >= 0 &&
    commonWxss.indexOf('@keyframes flash-live') >= 0
);

assert(
  '已完成深灰底白字',
  /round-selector-state--completed\s*\{[\s\S]{0,120}#6b7280/.test(pageWxss)
);

assert(
  '已分组未开始使用金色 token',
  /round-selector-state--grouped\s*\{[\s\S]{0,160}--champion-gold/.test(pageWxss) &&
    /round-selector-state--grouped\s*\{[\s\S]{0,160}--champion-gold/.test(dockWxss)
);

assert(
  '轮次层空态/查看领先榜状态文案',
  live.resolveScheduleCardStatus('unassigned').text === '等待分组' &&
    live.resolveScheduleCardStatus('grouped').text === '已分组' &&
    live.resolveScheduleCardStatus('grouped').badgeClass.indexOf('badge-gold') >= 0 &&
    live.resolveScheduleCardStatus('live').text === 'LIVE' &&
    live.resolveScheduleCardStatus('live').badgeClass.indexOf('live-badge-pulse') >= 0 &&
    live.resolveScheduleCardStatus('completed').text === '已完成' &&
    live.resolveScheduleCardStatus('completed').badgeClass.indexOf('badge-finished') >= 0
);

assert(
  '分组卡片右上角不复用轮次 LIVE 标签 class',
  pageWxml.indexOf('tee-status {{item.statusBadgeClass}}') < 0 &&
    pageWxml.indexOf('class="tee-status"') >= 0 &&
    pageWxss.indexOf('.tee-status.badge-live') < 0 &&
    scheduleVmSrc.indexOf('stampRoundCardStatus') < 0 &&
    scheduleVmSrc.indexOf('applyLiveHoleStatusBadgeToTeeGroups') >= 0
);

assert(
  '详情装配：LIVE 时 tabs 报名在最后且默认 TAB 仍 info',
  (function () {
    var vm = detailVm.buildSeriesDetailViewModel(
      seriesOf('global_m', [
        { roundId: 'r1', index: 1, matchId: 'm1', roundStatus: 'live' }
      ]),
      {
        preview: false,
        theme: 'bright',
        getMatchById: function () {
          return {
            status: 'ongoing',
            seriesContext: { seriesId: 's-live', roundId: 'r1', managed: true },
            groups: [{ players: [{ userId: 'u1' }] }]
          };
        },
        getIndexByMatchId: function () {
          return { seriesId: 's-live', roundId: 'r1', matchId: 'm1' };
        }
      }
    );
    return (
      vm.ok &&
      vm.hasLiveRound === true &&
      vm.tabs[vm.tabs.length - 1].id === 'register' &&
      vm.tabs[0].id === 'info' &&
      vm.standings.selectedKey === 'r1'
    );
  })()
);

assert(
  '选中态与状态底同时存在',
  dockWxml.indexOf('{{item.stateClass}}') >= 0 &&
    dockWxml.indexOf("item.isSelected ? 'round-selector-item--selected'") >= 0
);

assert(
  '首次打开出发表滚动到 LIVE chip',
  pageJs.indexOf('firstScheduleOpen') >= 0 &&
    pageJs.indexOf('_dockIntoViewId') >= 0 &&
    dockWxml.indexOf('scroll-into-view="{{intoView}}"') >= 0 &&
    dockWxml.indexOf('id="srd-{{item.key}}"') >= 0
);

assert(
  '普通单场仍用出发表/报名插入逻辑，未改成 Series 组件',
  detailJs.indexOf('insertRegisterTabAfterDiscussion') >= 0 &&
    detailWxml.indexOf('tee-sheet') >= 0 &&
    pageWxml.indexOf('live-leaderboard-board') >= 0
);

assert(
  '未新增 Series 专属 LIVE 组件',
  pageWxml.indexOf('series-live-') < 0 &&
    !fs.existsSync(path.join(seriesDir, 'seriesLiveBoard.js'))
);

console.log('');
console.log('seriesLiveSessionProjection.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
