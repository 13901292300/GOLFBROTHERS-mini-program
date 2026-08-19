/**
 * 莱德杯副标题：广场卡片与详情 Hero 同一投影
 * 运行：node scripts/seriesRyderCupSubtitle.selftest.js
 */

var path = require('path');
var fs = require('fs');

if (typeof global.wx === 'undefined') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    removeStorageSync: function () {}
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
var accumulate = require(path.join(utilsDir, 'seriesRyderCupAccumulate.js'));
var listAdapter = require(path.join(utilsDir, 'seriesListCardAdapter.js'));
var viewModel = require(path.join(seriesDir, 'seriesDetailViewModel.js'));
var plazaLive = require(path.join(utilsDir, 'seriesPlazaLiveSubtitle.js'));

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
      seriesId: 's-sub',
      seriesName: '莱德杯公开赛',
      seriesSubtitle: '',
      seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
      lifecycleStatus: 'published',
      registrationState: 'open',
      publishToken: 'tok',
      hostMode: 'organization',
      organization: { organizationName: '主办', organizationLogo: '' },
      scoringRule: seriesRyderCup.createRyderCupScoringRule(),
      createdAt: 1,
      rounds: [
        {
          roundId: 'r1',
          index: 1,
          matchId: 'm1',
          roundStatus: 'scheduled',
          gameMode: '个人比洞赛'
        },
        {
          roundId: 'r2',
          index: 2,
          matchId: 'm2',
          roundStatus: 'scheduled',
          gameMode: '四人四球比洞赛'
        }
      ],
      participants: [
        { kind: 'team', seriesParticipantId: 'team:a', nameSnapshot: '红队' },
        { kind: 'team', seriesParticipantId: 'team:b', nameSnapshot: '蓝队' }
      ]
    },
    over || {}
  );
}

function station(roundId, status) {
  return {
    matchId: roundId === 'r1' ? 'm1' : 'm2',
    status: status,
    gameMode: roundId === 'r1' ? '个人比洞赛' : '四人四球比洞赛',
    groups: [{ groupId: 'g-' + roundId, players: [{ userId: 'p1' }] }],
    seriesContext: {
      managed: true,
      seriesId: 's-sub',
      roundId: roundId,
      matchId: roundId === 'r1' ? 'm1' : 'm2',
      publishToken: 'tok'
    }
  };
}

function getter(map) {
  return function (id) {
    return map[id] || null;
  };
}

function project(series, getMatchById) {
  return accumulate.buildRyderCupDisplaySubtitle(series, { getMatchById: getMatchById });
}

function cardAndHero(series, phase, getMatchById) {
  var deps = { getMatchById: getMatchById, getIndexByMatchId: function () { return null; } };
  var card = listAdapter.toSeriesClubCard(series, phase || 'registration', deps);
  var vm = viewModel.buildSeriesDetailViewModel(series, deps);
  return { card: card, hero: vm.ok ? vm.hero : {}, vm: vm };
}

var pending = makeSeries();
var p1 = project(pending, function () { return null; });
assert(
  '1 无副标题、R1 待赛',
  p1.text === '第一轮 · 个人比洞赛' &&
    p1.roundId === 'r1' &&
    p1.source === 'round_mode' &&
    p1.gameModeLabel === '个人比洞赛' &&
    p1.text.indexOf('R1') < 0
);

var r2LiveSeries = makeSeries();
var r2LiveGet = getter({
  m1: station('r1', 'not_started'),
  m2: station('r2', 'ongoing')
});
var p2 = project(r2LiveSeries, r2LiveGet);
assert(
  '2 无副标题、R2 LIVE',
  p2.text === '第二轮 · 四人四球比洞赛' && p2.roundId === 'r2' && p2.source === 'round_mode'
);

var named = makeSeries({ seriesSubtitle: '春季对决' });
var p3 = project(named, function () { return null; });
assert('3 有副标题、R1 待赛', p3.text === '春季对决（R1）' && p3.source === 'user_subtitle');

var p4 = project(named, r2LiveGet);
assert('4 有副标题、R2 LIVE', p4.text === '春季对决（R2）' && p4.roundId === 'r2');

var r1DoneGet = getter({
  m1: station('r1', 'finished'),
  m2: station('r2', 'not_started')
});
var p5 = project(makeSeries(), r1DoneGet);
assert('5 R1 完成、R2 待赛显示 R2', p5.roundId === 'r2' && p5.text === '第二轮 · 四人四球比洞赛');

var cancelSeries = makeSeries({
  rounds: [
    Object.assign({}, makeSeries().rounds[0], { roundStatus: 'cancelled' }),
    makeSeries().rounds[1]
  ]
});
var p6 = project(cancelSeries, function () { return null; });
assert('6 R1 取消、R2 待赛显示 R2', p6.roundId === 'r2' && p6.text.indexOf('第二轮') === 0);

var allDoneGet = getter({
  m1: station('r1', 'finished'),
  m2: station('r2', 'finished')
});
var p7 = project(makeSeries(), allDoneGet);
assert('7 全部完成显示最后有效完成轮', p7.roundId === 'r2' && p7.text === '第二轮 · 四人四球比洞赛');

var browse = viewModel.buildSeriesDetailViewModel(r2LiveSeries, {
  standingsSelectedKey: 'r1',
  standingsUserPicked: true,
  standingsVisited: true,
  getMatchById: r2LiveGet,
  getIndexByMatchId: function () {
    return null;
  }
});
assert(
  '8 用户浏览 R1、赛事当前 R2 时 Hero 仍显示 R2',
  browse.ok &&
    browse.hero.titleSub === '第二轮 · 四人四球比洞赛' &&
    browse.standings.selectedKey === 'r1'
);

var original = makeSeries({ seriesSubtitle: '不写回' });
var before = original.seriesSubtitle;
project(original, r2LiveGet);
assert('9 原副标题不被写回或污染', original.seriesSubtitle === before && before === '不写回');

var already = makeSeries({ seriesSubtitle: '春季对决（R2）' });
var twice = project(already, r2LiveGet);
var again = accumulate.buildRyderCupDisplaySubtitle(
  Object.assign({}, already, { seriesSubtitle: twice.text }),
  { getMatchById: r2LiveGet }
);
assert(
  '10 多次投影不重复追加括号',
  twice.text === '春季对决（R2）' &&
    again.text === '春季对决（R2）' &&
    again.text.indexOf('（R2）（R2）') < 0
);

var pair = cardAndHero(r2LiveSeries, 'live', r2LiveGet);
assert(
  '11 首页卡片与详情 Hero 文案一致',
  pair.card.titleSub === pair.hero.titleSub &&
    pair.card.titleSub === '第二轮 · 四人四球比洞赛'
);

var ordinary = {
  seriesId: 's-ord',
  seriesName: '普通系列',
  seriesSubtitle: '普通副标题',
  lifecycleStatus: 'published',
  scoringRule: { mode: 'global_m', globalM: 2 },
  hostMode: 'organization',
  organization: { organizationName: '主办' },
  rounds: [{ roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' }],
  participants: [{ seriesParticipantId: 'team:a', nameSnapshot: '甲' }]
};
var ordCard = listAdapter.toSeriesClubCard(ordinary, 'registration');
var ordHero = viewModel.buildSeriesDetailViewModel(ordinary, {
  getMatchById: function () {
    return null;
  },
  getIndexByMatchId: function () {
    return null;
  }
});
assert(
  '12 普通 Series 副标题不变',
  ordCard.titleSub === '普通副标题' &&
    ordHero.ok &&
    ordHero.hero.titleSub === '普通副标题' &&
    accumulate.buildRyderCupDisplaySubtitle(ordinary, {}).source === 'fallback'
);

var missingType = makeSeries({ seriesCompetitionType: '' });
delete missingType.seriesCompetitionType;
missingType.templateId = 'ryder';
missingType.scoringRule = { mode: 'ryder_match_play' };
var miss = project(missingType, function () { return null; });
var missCard = listAdapter.toSeriesClubCard(
  Object.assign({}, missingType, { seriesSubtitle: '用户填的' }),
  'registration'
);
assert(
  '13 显式类型缺失时不进入莱德杯投影',
  miss.source === 'fallback' &&
    miss.text === '' &&
    missCard.titleSub === '用户填的'
);

assert(
  '普通 LIVE 广场投影不被莱德杯覆盖',
  plazaLive.projectPlazaSeriesTitleSub(
    {
      seriesSubtitle: '原副标题',
      rounds: [{ roundId: 'r1', index: 1, matchId: 'm1' }]
    },
    function () {
      return null;
    }
  ) === '原副标题'
);

if (failed) {
  console.log('\nFAILED ' + failed);
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
  process.exit(1);
}
console.log('\nAll ' + passed + ' passed');
