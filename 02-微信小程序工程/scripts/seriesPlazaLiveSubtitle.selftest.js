/**
 * 广场 Series 卡片副标题：普通 Series 与显式莱德杯分流
 * 运行：node scripts/seriesPlazaLiveSubtitle.selftest.js
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

var adapter = require(path.join(utilsDir, 'seriesListCardAdapter.js'));
var plazaSub = require(path.join(utilsDir, 'seriesPlazaLiveSubtitle.js'));
var liveSelect = require(path.join(utilsDir, 'seriesLiveRoundSelect.js'));
var liveSession = require(path.join(seriesDir, 'seriesLiveSessionProjection.js'));
var labelsUtil = require(path.join(utilsDir, 'seriesRoundDisplayLabels.js'));
var sameDay = require(path.join(utilsDir, 'seriesSameDayMultiCourse.js'));
var accumulate = require(path.join(utilsDir, 'seriesRyderCupAccumulate.js'));
var viewModel = require(path.join(seriesDir, 'seriesDetailViewModel.js'));

var adapterSrc = fs.readFileSync(path.join(utilsDir, 'seriesListCardAdapter.js'), 'utf8');
var homeWxml = fs.readFileSync(
  path.join(root, 'miniprogram', 'pages', 'home', 'index.wxml'),
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

function round(id, index, dateTime, courseId, extra) {
  return Object.assign(
    {
      roundId: id,
      index: index,
      matchId: 'm-' + id,
      name: '第' + index + '轮',
      dateTime: dateTime,
      courseId: courseId || 'c1',
      courseName: '球场' + (courseId || 'c1'),
      gameMode: '个人比杆赛'
    },
    extra || {}
  );
}

function station(roundId, status, extra) {
  extra = extra || {};
  var sid = extra.seriesId || 's-plaza';
  var rest = Object.assign({}, extra);
  delete rest.seriesId;
  return Object.assign(
    {
      matchId: 'm-' + roundId,
      status: status,
      seriesContext: {
        managed: true,
        seriesId: sid,
        roundId: roundId,
        publishToken: 'tok-p'
      },
      groups: []
    },
    rest
  );
}

function makeSeries(rounds, over) {
  return Object.assign(
    {
      seriesId: 's-plaza',
      seriesName: '轮次系列赛',
      seriesSubtitle: '原副标题',
      lifecycleStatus: 'published',
      registrationState: 'open',
      visibility: 'public',
      publishToken: 'tok-p',
      hostMode: 'organization',
      organization: { organizationName: '主办', organizationLogo: '' },
      createdAt: 5000,
      rounds: rounds,
      roster: []
    },
    over || {}
  );
}

function matchMap(stations) {
  var map = Object.create(null);
  (stations || []).forEach(function (m) {
    map[m.matchId] = m;
  });
  return map;
}

function getter(map) {
  return function (id) {
    return map[id] || null;
  };
}

function plazaHit(series, stations) {
  return adapter
    .buildPlazaTournamentCards(plazaDeps(series, stations))
    .filter(function (c) {
      return c && c.seriesId === series.seriesId;
    })[0];
}

function plazaDeps(series, stations, ordinary) {
  var map = matchMap(stations);
  var matches = (stations || []).concat(ordinary ? [ordinary] : []);
  return {
    listSeries: function () {
      return [series];
    },
    listMatches: function () {
      return matches;
    },
    getMatchById: getter(map),
    toOrdinaryCard: function (m) {
      if (!m || m.seriesContext) return null;
      return {
        id: m.matchId,
        matchId: m.matchId,
        matchType: m.matchType || 'internal',
        title: m.roundName || '普通赛',
        titleSub: m.titleSub || '普通副标题',
        navUrl: '/subpackages/tournament/pages/detail/index?matchId=' + m.matchId,
        statusLabel: m.status === 'ongoing' ? 'LIVE' : '已结束'
      };
    }
  };
}

var r1 = round('r1', 1, '2026-06-01 08:00');
var r2 = round('r2', 2, '2026-06-02 08:00');
var r3 = round('r3', 3, '2026-06-03 08:00');

assert(
  '默认 LIVE 轮与详情会话投影一致',
  liveSelect.resolveDefaultTargetRoundId === liveSession.resolveDefaultTargetRoundId ||
    (liveSelect.resolveDefaultTargetRoundId([
      { roundId: 'r1', state: 'live' },
      { roundId: 'r2', state: 'live' }
    ]) === 'r1' &&
      liveSession.resolveDefaultTargetRoundId([
        { roundId: 'r1', state: 'live' },
        { roundId: 'r2', state: 'live' }
      ]) === 'r1')
);

(function testR1Live() {
  var series = makeSeries([r1, r2, r3]);
  var stations = [
    station('r1', 'ongoing'),
    station('r2', 'registering'),
    station('r3', 'registering')
  ];
  var cards = adapter.buildPlazaTournamentCards(plazaDeps(series, stations));
  var hit = cards.filter(function (c) {
    return c && c.seriesId === 's-plaza';
  })[0];
  var labels = labelsUtil.buildSeriesRoundDisplayLabels(series, series.rounds);
  assert(
    '普通 Series 有用户副标题 + R1 LIVE → 副标题 · R1',
    hit && hit.titleSub === '原副标题 · R1' && String(hit.titleSub).indexOf('（R') < 0
  );
  assert(
    '普通 Series 卡片使用圆点 Rx 而非括号',
    labels.r1 === 'R1' && hit.titleSub.indexOf(' · ' + labels.r1) >= 0
  );
  assert(
    '点击仍进系列赛详情',
    hit.navUrl.indexOf('series-detail/index?seriesId=s-plaza') >= 0 &&
      hit.navUrl.indexOf('matchId=') < 0
  );
  assert('不改副标题源数据', series.seriesSubtitle === '原副标题');
})();

(function testR2Live() {
  var series = makeSeries([r1, r2, r3]);
  var stations = [
    station('r1', 'finished'),
    station('r2', 'ongoing'),
    station('r3', 'registering')
  ];
  var cards = adapter.buildPlazaTournamentCards(plazaDeps(series, stations));
  var hit = cards.filter(function (c) {
    return c && c.seriesId === 's-plaza';
  })[0];
  assert('普通 Series 有用户副标题 + R2 LIVE → 副标题 · R2', hit && hit.titleSub === '原副标题 · R2');
  var emptyR2 = makeSeries([r1, r2, r3], { seriesSubtitle: '' });
  var emptyR2Hit = adapter
    .buildPlazaTournamentCards(plazaDeps(emptyR2, stations))
    .filter(function (c) {
      return c && c.seriesId === 's-plaza';
    })[0];
  assert(
    '空副标题 R2 LIVE 显示第2轮-比杆赛',
    emptyR2Hit && emptyR2Hit.titleSub === '第2轮-比杆赛'
  );
})();

(function testMultiLiveFirst() {
  var series = makeSeries([r1, r2, r3]);
  var stations = [
    station('r1', 'ongoing'),
    station('r2', 'ongoing'),
    station('r3', 'registering')
  ];
  var cards = adapter.buildPlazaTournamentCards(plazaDeps(series, stations));
  var hit = cards.filter(function (c) {
    return c && c.seriesId === 's-plaza';
  })[0];
  assert('多 LIVE → 最早有效 LIVE Rx', hit && hit.titleSub === '原副标题 · R1');
})();

(function testLiveThenNext() {
  var series = makeSeries([r1, r2, r3]);
  var first = adapter.buildPlazaTournamentCards(
    plazaDeps(series, [
      station('r1', 'ongoing'),
      station('r2', 'registering'),
      station('r3', 'registering')
    ])
  ).filter(function (c) {
    return c && c.seriesId === 's-plaza';
  })[0];
  var second = adapter.buildPlazaTournamentCards(
    plazaDeps(series, [
      station('r1', 'finished'),
      station('r2', 'ongoing'),
      station('r3', 'registering')
    ])
  ).filter(function (c) {
    return c && c.seriesId === 's-plaza';
  })[0];
  assert(
    'LIVE 从 R1 切换到 R2 → 尾缀更新为 R2',
    first.titleSub === '原副标题 · R1' && second.titleSub === '原副标题 · R2'
  );
})();

(function testAllLiveDone() {
  var series = makeSeries([r1, r2]);
  var live = adapter.buildPlazaTournamentCards(
    plazaDeps(series, [station('r1', 'ongoing'), station('r2', 'registering')])
  ).filter(function (c) {
    return c && c.seriesId === 's-plaza';
  })[0];
  var done = adapter.buildPlazaTournamentCards(
    plazaDeps(series, [station('r1', 'finished'), station('r2', 'finished')])
  ).filter(function (c) {
    return c && c.seriesId === 's-plaza';
  })[0];
  assert(
    '全部 LIVE 结束后仍为原副标题且不写回',
    live.titleSub === '原副标题 · R1' && done && done.titleSub === '原副标题'
  );
})();

(function testGroupedOnly() {
  var series = makeSeries([r1, r2]);
  var label = plazaSub.resolvePlazaLiveRoundLabel(
    series,
    getter(
      matchMap([
        station('r1', 'registering', {
          groups: [{ players: [{ userId: 'u1' }] }]
        }),
        station('r2', 'registering')
      ])
    )
  );
  var card = adapter.toSeriesClubCard(series, 'registration');
  assert('仅已分组未开始不追加', label === '' && card.titleSub === '原副标题');
})();

(function testVenueNoRx() {
  var vr1 = round('r1', 1, '2026-06-01 08:00', 'east');
  var vr2 = round('r2', 2, '2026-06-01 13:00', 'west');
  var series = makeSeries([vr1, vr2]);
  var multi = sameDay.collectSameDayMultiCourseRoundIds(series.rounds);
  var cards = adapter.buildPlazaTournamentCards(
    plazaDeps(series, [station('r1', 'ongoing'), station('r2', 'registering')])
  );
  var hit = cards.filter(function (c) {
    return c && c.seriesId === 's-plaza';
  })[0];
  assert(
    '同日多 COURSE 有用户副标题仍按最早 LIVE 追加 · Rx，不猜日期',
    multi.r1 === true &&
      multi.r2 === true &&
      hit &&
      hit.statusLabel === 'LIVE' &&
      hit.titleSub === '原副标题 · R1' &&
      hit.titleSub.indexOf('（R') < 0 &&
      hit.titleSub.indexOf('（C') < 0 &&
      hit.titleSub.indexOf('第') < 0
  );
  var venueEmpty = makeSeries([vr1, vr2], { seriesSubtitle: '' });
  var venueEmptyHit = adapter
    .buildPlazaTournamentCards(
      plazaDeps(venueEmpty, [station('r1', 'ongoing'), station('r2', 'registering')])
    )
    .filter(function (c) {
      return c && c.seriesId === 's-plaza';
    })[0];
  assert(
    '同日多 COURSE 空副标题走第N轮-赛制，不猜日期改 LIVE',
    venueEmptyHit && venueEmptyHit.titleSub === '第1轮-比杆赛'
  );
})();

(function testOrdinaryUnaffected() {
  var series = makeSeries([r1, r2]);
  var ordinary = {
    matchId: 'ordinary-live',
    status: 'ongoing',
    matchType: 'internal',
    roundName: '队内公开赛',
    titleSub: '普通副标题',
    seriesContext: null,
    createdAt: 8000
  };
  var inter = {
    matchId: 'ordinary-inter',
    status: 'ongoing',
    matchType: 'inter-team',
    roundName: '队际对抗',
    titleSub: '队际副标题',
    seriesContext: null,
    createdAt: 7000
  };
  var cards = adapter.buildPlazaTournamentCards(
    plazaDeps(
      series,
      [station('r1', 'ongoing'), station('r2', 'registering')],
      ordinary
    )
  );
  var d2 = plazaDeps(series, [station('r1', 'ongoing')], inter);
  d2.listMatches = function () {
    return [inter];
  };
  var interCards = adapter.buildPlazaTournamentCards(d2);
  var ord = cards.filter(function (c) {
    return c && c.id === 'ordinary-live';
  })[0];
  var interHit = interCards.filter(function (c) {
    return c && c.id === 'ordinary-inter';
  })[0];
  assert(
    '普通队内赛副标题不受影响',
    ord && ord.titleSub === '普通副标题' && String(ord.titleSub).indexOf('（R') < 0
  );
  assert(
    '普通队际赛副标题不受影响',
    interHit &&
      interHit.titleSub === '队际副标题' &&
      String(interHit.titleSub).indexOf('（R') < 0
  );
})();

(function testEmptyInvalidRefresh() {
  var emptySeries = makeSeries([r1, r2], { seriesSubtitle: '' });
  var emptyCards = adapter.buildPlazaTournamentCards(
    plazaDeps(emptySeries, [station('r1', 'ongoing'), station('r2', 'registering')])
  );
  var emptyHit = emptyCards.filter(function (c) {
    return c && c.seriesId === 's-plaza';
  })[0];
  assert(
    '空字符串副标题显示第1轮-比杆赛，无孤立括号、不写回',
    emptyHit &&
      emptyHit.titleSub === '第1轮-比杆赛' &&
      String(emptyHit.titleSub).indexOf('（') < 0 &&
      String(emptyHit.titleSub).indexOf('undefined') < 0 &&
      emptySeries.seriesSubtitle === ''
  );

  var spaceSeries = makeSeries([r1, r2], { seriesSubtitle: '   ' });
  var spaceHit = adapter
    .buildPlazaTournamentCards(
      plazaDeps(spaceSeries, [station('r1', 'ongoing'), station('r2', 'registering')])
    )
    .filter(function (c) {
      return c && c.seriesId === 's-plaza';
    })[0];
  assert(
    '纯空格副标题视为空，显示第1轮-比杆赛',
    spaceHit && spaceHit.titleSub === '第1轮-比杆赛'
  );

  var nullSeries = makeSeries([r1, r2], { seriesSubtitle: null });
  var undefSeries = makeSeries([r1, r2]);
  undefSeries.seriesSubtitle = undefined;
  var liveGetter = getter(
    matchMap([station('r1', 'ongoing'), station('r2', 'registering')])
  );
  assert(
    'null / undefined 副标题显示第1轮',
    plazaSub.projectPlazaSeriesTitleSub(nullSeries, liveGetter) === '第1轮' &&
      plazaSub.projectPlazaSeriesTitleSub(undefSeries, liveGetter) === '第1轮'
  );

  var emptyDone = adapter
    .buildPlazaTournamentCards(
      plazaDeps(emptySeries, [station('r1', 'finished'), station('r2', 'finished')])
    )
    .filter(function (c) {
      return c && c.seriesId === 's-plaza';
    })[0];
  assert(
    'LIVE 结束后空副标题恢复空态且不写回第x轮',
    emptyDone && emptyDone.titleSub === '' && emptySeries.seriesSubtitle === ''
  );

  var bad = makeSeries([
    Object.assign({}, r1, { roundId: '' }),
    r2
  ]);
  var badLabel = plazaSub.resolvePlazaLiveRoundLabel(
    bad,
    getter(matchMap([station('r1', 'ongoing'), station('r2', 'registering')]))
  );
  assert('无效轮次不追加', badLabel === '');

  var series = makeSeries([r1, r2]);
  var deps = plazaDeps(series, [station('r1', 'ongoing'), station('r2', 'registering')]);
  var a = adapter.buildPlazaTournamentCards(deps);
  var b = adapter.buildPlazaTournamentCards(deps);
  var ha = a.filter(function (c) {
    return c && c.seriesId === 's-plaza';
  })[0];
  var hb = b.filter(function (c) {
    return c && c.seriesId === 's-plaza';
  })[0];
  var twice = plazaSub.appendPlazaLiveRoundSubtitle('原副标题（R1）', 'R1');
  var thrice = plazaSub.appendPlazaLiveRoundSubtitle(twice, 'R1');
  assert(
    '多次投影不重复：剥系统尾缀后再追加 · R1',
    ha.titleSub === '原副标题 · R1' &&
      hb.titleSub === '原副标题 · R1' &&
      twice === '原副标题 · R1' &&
      thrice === '原副标题 · R1' &&
      twice.indexOf(' · R1 · R1') < 0
  );
})();

(function testCancelledDoesNotRenumber() {
  var cancelledFirst = makeSeries(
    [
      round('r1', 1, '2026-06-01 08:00', 'c1', { roundStatus: 'cancelled' }),
      round('r2', 2, '2026-06-02 08:00'),
      round('r3', 3, '2026-06-03 08:00')
    ],
    { seriesSubtitle: '' }
  );
  var stations = [
    station('r1', 'cancelled'),
    station('r2', 'ongoing'),
    station('r3', 'registering')
  ];
  var emptyHit = adapter
    .buildPlazaTournamentCards(plazaDeps(cancelledFirst, stations))
    .filter(function (c) {
      return c && c.seriesId === 's-plaza';
    })[0];
  cancelledFirst.seriesSubtitle = '春季队际系列赛';
  var namedHit = adapter
    .buildPlazaTournamentCards(plazaDeps(cancelledFirst, stations))
    .filter(function (c) {
      return c && c.seriesId === 's-plaza';
    })[0];
  assert(
    '取消轮不重编号：空副标题用 round.index 为第2轮-比杆赛',
    emptyHit && emptyHit.titleSub === '第2轮-比杆赛'
  );
  assert(
    'R1 cancelled、R2 LIVE → 用户副标题 · R2',
    namedHit && namedHit.titleSub === '春季队际系列赛 · R2'
  );
})();

assert(
  '报名列表不追加 LIVE Rx',
  adapter.toSeriesClubCard(makeSeries([r1, r2]), 'registration').titleSub ===
    '原副标题'
);

(function testExplicitRyderCup() {
  var series = makeSeries(
    [
      round('r1', 1, '2026-06-01 08:00', 'c1', { gameMode: '四人四球比洞赛' }),
      round('r2', 2, '2026-06-02 08:00', 'c1', {
        gameMode: '个人比洞赛',
        roundStatus: 'cancelled'
      })
    ],
    {
      seriesId: 's-ryder',
      seriesName: '莱德杯公开赛',
      seriesSubtitle: '',
      seriesCompetitionType: 'ryder_cup'
    }
  );
  var sid = { seriesId: 's-ryder' };
  var stations = [station('r1', 'ongoing', sid), station('r2', 'cancelled', sid)];
  var hit = plazaHit(series, stations);
  var getMatchById = plazaDeps(series, stations).getMatchById;
  var projected = accumulate.buildRyderCupDisplaySubtitle(series, {
    getMatchById: getMatchById
  });
  var hero = viewModel.buildSeriesDetailViewModel(series, {
    getMatchById: getMatchById,
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert(
    '显式莱德杯无用户副标题：第一轮 · 四人四球比洞赛',
    projected.text === '第一轮 · 四人四球比洞赛' &&
      hit &&
      hit.titleSub === projected.text &&
      hero.ok &&
      hero.hero.titleSub === projected.text &&
      String(hit.titleSub).indexOf('第1轮-') < 0
  );
  series.seriesSubtitle = '春季对决';
  var named = plazaHit(series, stations);
  var namedProj = accumulate.buildRyderCupDisplaySubtitle(series, {
    getMatchById: getMatchById
  });
  var namedHero = viewModel.buildSeriesDetailViewModel(series, {
    getMatchById: getMatchById,
    getIndexByMatchId: function () {
      return null;
    }
  });
  var twice = accumulate.buildRyderCupDisplaySubtitle(series, {
    getMatchById: getMatchById
  });
  assert(
    '显式莱德杯广场 LIVE 卡片用圆点 Rx，Hero 保留括号格式',
    named &&
      named.titleSub === '春季对决 · R1' &&
      namedProj.text === '春季对决（R1）' &&
      namedHero.ok &&
      namedHero.hero.titleSub === '春季对决（R1）' &&
      twice.text === '春季对决（R1）' &&
      twice.text.indexOf('（R1）（R1）') < 0 &&
      series.seriesSubtitle === '春季对决'
  );
})();

(function testTemplateIdRyderIsNotRyder() {
  var series = makeSeries([r1, r2], {
    seriesSubtitle: '用户填的',
    templateId: 'ryder',
    scoringRule: { mode: 'ryder_match_play' }
  });
  delete series.seriesCompetitionType;
  var hit = plazaHit(series, [
    station('r1', 'ongoing'),
    station('r2', 'registering')
  ]);
  var proj = accumulate.buildRyderCupDisplaySubtitle(series, {});
  assert(
    '仅 templateId=ryder 无显式类型：不走莱德杯投影',
    proj.source === 'fallback' &&
      hit &&
      hit.titleSub === '用户填的 · R1' &&
      String(hit.titleSub).indexOf('第一轮') < 0 &&
      String(hit.titleSub).indexOf('（R') < 0
  );
})();

(function testScoringModesShareDotRx() {
  ['global_m', 'per_round_n'].forEach(function (mode) {
    var series = makeSeries([r1, r2], { scoringRule: { mode: mode, globalM: 2 } });
    var hit = plazaHit(series, [
      station('r1', 'ongoing'),
      station('r2', 'registering')
    ]);
    assert(mode + ' 同规则：副标题 · R1', hit && hit.titleSub === '原副标题 · R1');
  });
  var division = makeSeries([r1, r2], {
    hostMode: 'team',
    templateId: 'division_series',
    hostTeam: { teamName: '主队', teamLogo: '' }
  });
  var dHit = plazaHit(division, [
    station('r1', 'ongoing'),
    station('r2', 'registering')
  ]);
  assert('队内分队系列比杆赛同规则', dHit && dHit.titleSub === '原副标题 · R1');
  var inter = makeSeries([r1, r2], { templateId: 'inter_team_series' });
  var iHit = plazaHit(inter, [
    station('r1', 'ongoing'),
    station('r2', 'registering')
  ]);
  assert('队际系列比杆赛同规则', iHit && iHit.titleSub === '原副标题 · R1');
})();

(function testMissingAndIdentityConflict() {
  var series = makeSeries([r1, r2]);
  var missing = adapter.toSeriesClubCard(series, 'live', {
    context: 'standings',
    getMatchById: function () {
      return null;
    }
  });
  assert('station 缺失 → 不追加', missing && missing.titleSub === '原副标题');

  var conflictStations = [
    station('r1', 'ongoing', { seriesId: 'other-series' }),
    station('r2', 'registering')
  ];
  var conflictCard = adapter.toSeriesClubCard(series, 'live', {
    context: 'standings',
    getMatchById: plazaDeps(series, conflictStations).getMatchById
  });
  assert(
    'station identity 冲突 → 不追加',
    conflictCard && conflictCard.titleSub === '原副标题'
  );

  var okStations = [station('r1', 'ongoing'), station('r2', 'registering')];
  var indexConflict = adapter.toSeriesClubCard(series, 'live', {
    context: 'standings',
    getMatchById: plazaDeps(series, okStations).getMatchById,
    getIndexByMatchId: function () {
      return { seriesId: 'other', roundId: 'r1' };
    }
  });
  assert(
    'index 冲突不算 LIVE → 不追加',
    indexConflict && indexConflict.titleSub === '原副标题'
  );
})();

(function testIdempotentMiddleHeroRegistration() {
  var persisted = makeSeries([r1, r2], { seriesSubtitle: '春季对决（R1）' });
  var snap = JSON.stringify(persisted);
  var persistedHit = plazaHit(persisted, [
    station('r1', 'ongoing'),
    station('r2', 'registering')
  ]);
  assert(
    '原数据已带（R1）不生成双后缀且不写回',
    persistedHit &&
      persistedHit.titleSub === '春季对决 · R1' &&
      persisted.seriesSubtitle === '春季对决（R1）' &&
      JSON.stringify(persisted) === snap
  );

  var mid = makeSeries([r1, r2], { seriesSubtitle: '含 R1 的春季对决' });
  var midHit = plazaHit(mid, [
    station('r1', 'ongoing'),
    station('r2', 'registering')
  ]);
  assert(
    '用户正文中间含 R1 不误删',
    midHit && midHit.titleSub === '含 R1 的春季对决 · R1'
  );

  var liveSeries = makeSeries([r1, r2]);
  var liveStations = [station('r1', 'ongoing'), station('r2', 'registering')];
  var regLive = adapter.toSeriesClubCard(liveSeries, 'registration', {
    context: 'registration',
    getMatchById: plazaDeps(liveSeries, liveStations).getMatchById
  });
  assert(
    '报名 TAB 即使有 LIVE 分站也不追加',
    regLive && regLive.titleSub === '原副标题'
  );

  var heroSeries = makeSeries([r1, r2], { seriesSubtitle: '春季对决' });
  var getMatchById = plazaDeps(heroSeries, liveStations).getMatchById;
  var heroDeps = {
    getMatchById: getMatchById,
    getIndexByMatchId: function () {
      return null;
    }
  };
  var heroBefore = viewModel.buildSeriesDetailViewModel(heroSeries, heroDeps);
  plazaHit(heroSeries, liveStations);
  var heroAfter = viewModel.buildSeriesDetailViewModel(heroSeries, heroDeps);
  assert(
    'Hero 不被本项修改',
    heroBefore.ok &&
      heroAfter.ok &&
      heroBefore.hero.titleSub === '春季对决' &&
      heroAfter.hero.titleSub === '春季对决'
  );
})();

assert(
  '权威入口集中在 buildPlazaSeriesSubtitle，首页 WXML 不拼接 Rx',
  adapterSrc.indexOf('buildPlazaSeriesSubtitle') >= 0 &&
    homeWxml.indexOf(' · R') < 0
);

assert(
  'adapter 复用公共 LIVE/标签/同日 COURSE 模块',
  adapterSrc.indexOf('seriesPlazaLiveSubtitle') >= 0 &&
    fs
      .readFileSync(path.join(utilsDir, 'seriesPlazaLiveSubtitle.js'), 'utf8')
      .indexOf('seriesLiveRoundSelect') >= 0 &&
    fs
      .readFileSync(path.join(utilsDir, 'seriesPlazaLiveSubtitle.js'), 'utf8')
      .indexOf('buildSeriesRoundDisplayLabels') >= 0 &&
    fs
      .readFileSync(path.join(utilsDir, 'seriesPlazaLiveSubtitle.js'), 'utf8')
      .indexOf('collectSameDayMultiCourseRoundIds') >= 0
);

assert(
  '广场卡片仍用 titleSub；详情入口未改',
  homeWxml.indexOf('plazaTournamentCards') >= 0 &&
    homeWxml.indexOf('item.titleSub') >= 0 &&
    homeWxml.indexOf('data-url="{{item.navUrl}}"') >= 0
);

console.log('');
console.log('seriesPlazaLiveSubtitle.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
