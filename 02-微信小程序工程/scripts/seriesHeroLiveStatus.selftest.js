/**
 * Series Hero 运行态 chip 必须跟随真实 Round/Station LIVE，而不是 competitionPhaseCache。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesHeroLiveStatus.selftest.js
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
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');

var viewModel = require(path.join(seriesDir, 'seriesDetailViewModel.js'));
var scheduleVm = require(path.join(seriesDir, 'seriesScheduleViewModel.js'));
var liveSession = require(path.join(seriesDir, 'seriesLiveSessionProjection.js'));
var seriesRyderCup = require(path.join(utilsDir, 'seriesRyderCup.js'));

var vmSrc = fs.readFileSync(path.join(seriesDir, 'seriesDetailViewModel.js'), 'utf8');

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

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function snap(v) {
  return JSON.stringify(v);
}

function makeSeries(over) {
  return Object.assign(
    {
      seriesId: 's-hero-live',
      publishToken: 'tok',
      lifecycleStatus: 'published',
      publishState: 'published',
      competitionPhaseCache: 'scheduled',
      hostMode: 'organization',
      templateId: 'inter_team_series',
      seriesName: '状态系列赛',
      organization: { organizationName: '主办', organizationLogo: '' },
      scoringRule: { mode: 'global_m', globalM: 2, scoreBasis: 'gross' },
      participants: [{ seriesParticipantId: 'team:a', kind: 'team', nameSnapshot: '甲' }],
      rounds: [
        {
          roundId: 'r1',
          index: 1,
          name: 'R1',
          matchId: 'm1',
          roundStatus: 'scheduled',
          gameMode: '个人比杆赛',
          dateTime: '2026-09-08 08:00'
        },
        {
          roundId: 'r2',
          index: 2,
          name: 'R2',
          matchId: 'm2',
          roundStatus: 'scheduled',
          gameMode: '个人比杆赛',
          dateTime: '2026-09-10 08:00'
        }
      ]
    },
    over || {}
  );
}

function liveMatch(roundId, matchId, extra) {
  extra = extra || {};
  return {
    matchId: matchId,
    status: extra.status != null ? extra.status : 'ongoing',
    seriesContext: {
      managed: extra.managed !== false,
      seriesId: extra.seriesId != null ? extra.seriesId : 's-hero-live',
      roundId: extra.roundId != null ? extra.roundId : roundId,
      publishToken: extra.publishToken != null ? extra.publishToken : 'tok'
    },
    groups: extra.groups || [{ players: [{ userId: 'u1' }] }]
  };
}

function depsFromStore(store, indexBag) {
  return {
    getMatchById: function (id) {
      var m = store[String(id)];
      return m ? clone(m) : null;
    },
    getIndexByMatchId: function (id) {
      var row = indexBag[String(id)];
      return row ? clone(row) : null;
    }
  };
}

function defaultIndex() {
  return {
    m1: { seriesId: 's-hero-live', roundId: 'r1', matchId: 'm1' },
    m2: { seriesId: 's-hero-live', roundId: 'r2', matchId: 'm2' }
  };
}

function buildVm(series, store, indexBag, extraOpts) {
  return viewModel.buildSeriesDetailViewModel(
    series,
    Object.assign({}, depsFromStore(store, indexBag || defaultIndex()), extraOpts || {})
  );
}

function scheduleHasLive(series, store, indexBag, roundStates) {
  var sched = scheduleVm.buildSeriesScheduleViewModel({
    series: series,
    selectedRoundId: '',
    lifecycleAccess: { lifecycleStatus: 'published' },
    roundStates: roundStates,
    getMatchById: depsFromStore(store, indexBag || defaultIndex()).getMatchById,
    getIndexByMatchId: depsFromStore(store, indexBag || defaultIndex()).getIndexByMatchId
  });
  var items = (sched && sched.roundSelector) || [];
  for (var i = 0; i < items.length; i++) {
    if (items[i] && (items[i].isLive || items[i].state === 'live')) return true;
  }
  return liveSession.hasAnyLiveRound(roundStates);
}

function isHeroLive(vm) {
  return (
    vm &&
    vm.ok &&
    vm.hero.chipText === 'LIVE' &&
    vm.hero.chipTone === 'live' &&
    vm.hero.isLive === true
  );
}

function tabsLive(vm) {
  if (!vm || !vm.ok || !vm.hasLiveRound) return false;
  var tabs = vm.tabs || [];
  return tabs.length > 0 && tabs[tabs.length - 1].id === 'register';
}

assert(
  '抽出 resolveSeriesHeroStatusChip 且详情按 roundStates→hasLiveRound→Hero→tabs 装配',
  typeof viewModel.resolveSeriesHeroStatusChip === 'function' &&
    vmSrc.indexOf('function resolveSeriesHeroStatusChip') >= 0 &&
    vmSrc.indexOf('var roundStates = seriesStandingsViewModel.projectRoundStatesFromRoundCards') >=
      0 &&
    vmSrc.indexOf('var hasLiveRound = seriesLiveSession.hasAnyLiveRound(roundStates)') >= 0 &&
    vmSrc.indexOf('buildHeroView(') >= 0 &&
    vmSrc.indexOf('buildSeriesDetailTabs(hasLiveRound') >= 0
);

assert(
  '纯函数优先级：终态 > LIVE > registration/scheduled',
  viewModel.resolveSeriesHeroStatusChip({
    access: { isDraftPreview: true, lifecycleLabel: '草稿' },
    competitionPhaseCache: 'scheduled',
    hasLiveRound: true
  }).text === '草稿预览' &&
    viewModel.resolveSeriesHeroStatusChip({
      access: { lifecycleStatus: 'cancelled', lifecycleLabel: '已取消' },
      competitionPhaseCache: 'scheduled',
      hasLiveRound: true
    }).text === '已取消' &&
    viewModel.resolveSeriesHeroStatusChip({
      access: { lifecycleStatus: 'published', lifecycleLabel: '已发布' },
      competitionPhaseCache: 'completed',
      hasLiveRound: true
    }).text === '已完赛' &&
    viewModel.resolveSeriesHeroStatusChip({
      access: { lifecycleStatus: 'published', lifecycleLabel: '已发布' },
      competitionPhaseCache: 'scheduled',
      hasLiveRound: true
    }).text === 'LIVE' &&
    viewModel.resolveSeriesHeroStatusChip({
      access: { lifecycleStatus: 'published', lifecycleLabel: '已发布' },
      competitionPhaseCache: 'registration',
      hasLiveRound: false
    }).text === '报名中'
);

var storeR1Live = {
  m1: liveMatch('r1', 'm1'),
  m2: liveMatch('r2', 'm2', { status: 'registering', groups: [] })
};

var vmScheduledLive = buildVm(makeSeries({ competitionPhaseCache: 'scheduled' }), storeR1Live);
assert(
  '1 cache=scheduled + R1 LIVE → Hero LIVE',
  isHeroLive(vmScheduledLive) && vmScheduledLive.hasLiveRound === true
);

var vmRegLive = buildVm(makeSeries({ competitionPhaseCache: 'registration' }), storeR1Live);
assert(
  '2 cache=registration + R1 LIVE → Hero LIVE',
  isHeroLive(vmRegLive) && vmRegLive.hasLiveRound === true
);

var storeR2Live = {
  m1: liveMatch('r1', 'm1', { status: 'finished' }),
  m2: liveMatch('r2', 'm2')
};
var seriesR1Done = makeSeries({
  rounds: [
    Object.assign({}, makeSeries().rounds[0], { roundStatus: 'completed' }),
    makeSeries().rounds[1]
  ]
});
var vmR2 = buildVm(seriesR1Done, storeR2Live);
assert('3 R1 completed、R2 LIVE → Hero LIVE', isHeroLive(vmR2) && vmR2.hasLiveRound === true);

var storeBothLive = {
  m1: liveMatch('r1', 'm1'),
  m2: liveMatch('r2', 'm2')
};
var vmBoth = buildVm(makeSeries(), storeBothLive);
assert('4 R1/R2 同时 LIVE → Hero LIVE', isHeroLive(vmBoth) && vmBoth.hasLiveRound === true);

var cancelledLiveSeries = makeSeries({
  rounds: [
    Object.assign({}, makeSeries().rounds[0], { roundStatus: 'cancelled' }),
    makeSeries().rounds[1]
  ]
});
var vmCancelledRound = buildVm(cancelledLiveSeries, storeR1Live);
assert(
  '5 LIVE 轮 cancelled → 不显示 LIVE',
  vmCancelledRound.ok &&
    vmCancelledRound.hasLiveRound === false &&
    vmCancelledRound.hero.chipText !== 'LIVE' &&
    vmCancelledRound.hero.isLive === false
);

var vmMissing = buildVm(makeSeries(), {});
assert(
  '6 station 缺失 → 不猜 LIVE',
  vmMissing.ok &&
    vmMissing.hasLiveRound === false &&
    vmMissing.hero.chipText === '赛程待开' &&
    vmMissing.hero.isLive === false
);

var storeSidConflict = {
  m1: liveMatch('r1', 'm1', { seriesId: 'other-series' }),
  m2: liveMatch('r2', 'm2', { status: 'registering', groups: [] })
};
var vmSid = buildVm(makeSeries(), storeSidConflict);
assert(
  '7 station seriesId 冲突 → 不猜 LIVE',
  vmSid.ok && vmSid.hasLiveRound === false && vmSid.hero.chipText !== 'LIVE'
);

var storeRidConflict = {
  m1: liveMatch('r1', 'm1', { roundId: 'r-other' }),
  m2: liveMatch('r2', 'm2', { status: 'registering', groups: [] })
};
var vmRid = buildVm(makeSeries(), storeRidConflict);
assert(
  '8 station roundId 冲突 → 不猜 LIVE',
  vmRid.ok && vmRid.hasLiveRound === false && vmRid.hero.chipText !== 'LIVE'
);

var vmCompleted = buildVm(
  makeSeries({ competitionPhaseCache: 'completed' }),
  storeR1Live
);
assert(
  '9 Series completed + 残留 ongoing → 已完赛',
  vmCompleted.ok &&
    vmCompleted.hero.chipText === '已完赛' &&
    vmCompleted.hero.chipTone === 'finished' &&
    vmCompleted.hero.isLive === false
);

var vmSeriesCancelled = buildVm(
  makeSeries({ lifecycleStatus: 'cancelled', competitionPhaseCache: 'scheduled' }),
  storeR1Live
);
var vmArchived = buildVm(
  makeSeries({ lifecycleStatus: 'archived', competitionPhaseCache: 'live' }),
  storeR1Live
);
assert(
  '10 cancelled/archived + stale LIVE → 历史终态优先',
  vmSeriesCancelled.ok &&
    vmSeriesCancelled.hero.chipText === '已取消' &&
    vmSeriesCancelled.hero.isLive === false &&
    vmArchived.ok &&
    vmArchived.hero.chipText === '已归档' &&
    vmArchived.hero.isLive === false
);

var vmGlobal = buildVm(
  makeSeries({ scoringRule: { mode: 'global_m', globalM: 2, scoreBasis: 'gross' } }),
  storeR1Live
);
assert('11 普通 global_m LIVE → Hero LIVE', isHeroLive(vmGlobal));

var vmPerN = buildVm(
  makeSeries({
    scoringRule: { mode: 'per_round_n', globalM: 10, scoreBasis: 'gross' }
  }),
  storeR1Live
);
assert('12 普通 per_round_n LIVE → Hero LIVE', isHeroLive(vmPerN));

var vmRyder = buildVm(
  makeSeries({
    seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
    scoringRule: seriesRyderCup.createRyderCupScoringRule
      ? seriesRyderCup.createRyderCupScoringRule()
      : { mode: 'ryder_match_play' }
  }),
  storeR1Live
);
assert(
  '13 显式莱德杯 LIVE → Hero LIVE',
  isHeroLive(vmRyder) && vmRyder.isRyderCup === true
);

var vmTemplateOnly = buildVm(makeSeries({ templateId: 'ryder' }), storeR1Live);
assert(
  '14 仅 templateId:ryder 仍按普通 Series 判断 LIVE',
  isHeroLive(vmTemplateOnly) &&
    vmTemplateOnly.isRyderCup === false &&
    seriesRyderCup.isRyderCupSeries({ templateId: 'ryder' }) === false
);

var plaza = buildVm(makeSeries(), storeR1Live, defaultIndex(), {
  heroEntryContext: 'plaza'
});
var registerEntry = buildVm(makeSeries(), storeR1Live, defaultIndex(), {
  heroEntryContext: 'registration'
});
var schedLive = scheduleHasLive(
  makeSeries(),
  storeR1Live,
  defaultIndex(),
  plaza.standingsRoundStates
);
assert(
  '15 Hero / TAB / schedule LIVE 一致，入口不改 chip 文案',
  isHeroLive(plaza) &&
    isHeroLive(registerEntry) &&
    tabsLive(plaza) &&
    tabsLive(registerEntry) &&
    plaza.hasLiveRound === true &&
    schedLive === true &&
    plaza.hero.chipText === registerEntry.hero.chipText &&
    plaza.hero.dateTone === 'live' &&
    registerEntry.hero.dateTone === 'gold'
);

var frozenSeries = makeSeries();
var frozenStore = clone(storeR1Live);
var beforeSeries = snap(frozenSeries);
var beforeStore = snap(frozenStore);
var vmA = buildVm(frozenSeries, frozenStore);
var vmB = buildVm(frozenSeries, frozenStore);
assert(
  '16 输入 Series/Match 不被修改',
  snap(frozenSeries) === beforeSeries && snap(frozenStore) === beforeStore
);
assert(
  '17 多次投影幂等',
  vmA.ok &&
    vmB.ok &&
    vmA.hero.chipText === vmB.hero.chipText &&
    vmA.hero.chipTone === vmB.hero.chipTone &&
    vmA.hero.isLive === vmB.hero.isLive &&
    vmA.hasLiveRound === vmB.hasLiveRound &&
    snap(vmA.tabs) === snap(vmB.tabs)
);

assert(
  'WXML 未硬编码 chip 文案 / 未按日期或 templateId 猜 LIVE',
  fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8').indexOf('赛程待开') < 0 &&
    vmSrc.indexOf("heroEntryContext") >= 0 &&
    vmSrc.indexOf("if (phase === 'live')") < 0
);

console.log('');
console.log('seriesHeroLiveStatus.selftest: passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
process.exit(0);
