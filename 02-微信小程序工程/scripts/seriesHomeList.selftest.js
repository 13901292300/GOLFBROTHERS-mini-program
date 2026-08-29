/**
 * 首页 / 广场 Series 列表聚合自测
 * 运行（在 02-微信小程序工程 目录，需人工批准时再跑）：
 *   node scripts/seriesHomeList.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var adapter = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'utils',
  'seriesListCardAdapter.js'
));
var gate = require(seriesTestPaths.util('seriesAccessGate.js'));

var homeJs = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'pages', 'home', 'index.js'),
  'utf8'
);
var homeWxml = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'pages', 'home', 'index.wxml'),
  'utf8'
);
var adapterSrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'utils', 'seriesListCardAdapter.js'),
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

function makeStation(i, seriesId, token, status) {
  return {
    matchId: 'm-' + i,
    status: status || 'registering',
    createdAt: 1000 + i,
    roundName: 'R' + i,
    seriesContext: {
      managed: true,
      seriesId: seriesId,
      roundId: 'r-' + i,
      publishToken: token
    },
    registerInfo: { users: [] }
  };
}

function makeSeries(over) {
  var rounds = [];
  for (var i = 1; i <= 8; i++) {
    rounds.push({
      roundId: 'r-' + i,
      matchId: 'm-' + i,
      name: 'R' + i,
      dateTime: '2026-0' + ((i % 9) + 1) + '-10T08:00:00',
      gameMode: i % 2 === 0 ? 'individual_stroke' : 'fourball'
    });
  }
  return Object.assign(
    {
      seriesId: 'series-8',
      seriesName: '八轮系列赛',
      seriesSubtitle: '副标题',
      lifecycleStatus: 'published',
      registrationState: 'open',
      visibility: 'public',
      accessCode: '',
      publishToken: 'tok-8',
      hostMode: 'organization',
      organization: { organizationName: '主办机构', organizationLogo: '' },
      hostTeam: {},
      createdAt: 9000,
      rounds: rounds,
      roster: []
    },
    over || {}
  );
}

var stations8 = [];
for (var si = 1; si <= 8; si++) {
  stations8.push(makeStation(si, 'series-8', 'tok-8', 'registering'));
}

var ordinary = {
  matchId: 'ordinary-1',
  status: 'registering',
  createdAt: 8000,
  roundName: '普通队内赛',
  seriesContext: null,
  registerInfo: { users: [{ userId: 'u1' }] }
};

function depsBase(over) {
  var matchMap = Object.create(null);
  stations8.concat([ordinary]).forEach(function (m) {
    matchMap[m.matchId] = m;
  });
  var seriesList = [makeSeries()];
  return Object.assign(
    {
      listMatches: function () {
        return stations8.concat([ordinary]);
      },
      listSeries: function () {
        return seriesList;
      },
      getMatchById: function (id) {
        return matchMap[id] || null;
      },
      currentUserId: 'u1',
      currentPlayerId: 'p1',
      toOrdinaryCard: function (m) {
        return {
          id: m.matchId,
          title: m.roundName || m.matchId,
          navUrl: '/detail?matchId=' + m.matchId,
          statusLabel: '报名中'
        };
      },
      decorateOrdinaryCard: function (m, card) {
        return card;
      }
    },
    over || {}
  );
}

// ----- 过滤 -----
assert(
  '托管分站三元组齐全 → hide',
  adapter.shouldHideManagedStationFromPublicLists(stations8[0]) === true
);

assert(
  '普通赛无 context → 不 hide',
  adapter.shouldHideManagedStationFromPublicLists(ordinary) === false
);

assert(
  'managed 但缺 publishToken → 不 hide（防误删）',
  adapter.shouldHideManagedStationFromPublicLists({
    seriesContext: { managed: true, seriesId: 's', roundId: 'r', publishToken: '' }
  }) === false
);

// ----- 8 轮聚合 -----
(function () {
  var cards = adapter.buildRegistrationAllCards(depsBase());
  var seriesCards = cards.filter(function (c) {
    return c && c._cardKind === 'series';
  });
  var managedCards = cards.filter(function (c) {
    return c && String(c.id).indexOf('m-') === 0;
  });
  var ordinaryCards = cards.filter(function (c) {
    return c && c.id === 'ordinary-1';
  });
  assert(
    '8 轮 → 报名列表 1 张 Series 卡',
    seriesCards.length === 1 && seriesCards[0].seriesId === 'series-8',
    'series=' + seriesCards.length
  );
  assert('8 轮 → 0 张托管分站卡', managedCards.length === 0);
  assert('普通 registering 仍在报名列表', ordinaryCards.length === 1);
  assert(
    '报名卡 navUrl 含 tab=register/from=registration 且无 preview',
    seriesCards[0].navUrl.indexOf('tab=register') >= 0 &&
      seriesCards[0].navUrl.indexOf('from=registration') >= 0 &&
      seriesCards[0].navUrl.indexOf('preview=') < 0 &&
      seriesCards[0].navUrl.indexOf('seriesId=series-8') >= 0
  );
  assert(
    '卡片含 titleSub / tagLine，无 accessCode 字段泄露',
    seriesCards[0].titleSub === '副标题' &&
      seriesCards[0].tagLine.indexOf('系列赛') >= 0 &&
      Array.isArray(seriesCards[0].courseList) &&
      !Object.prototype.hasOwnProperty.call(seriesCards[0], 'accessCode')
  );
  assert(
    'published+open → 文案「报名中」',
    seriesCards[0].statusLabel === '报名中' &&
      seriesCards[0].statusTone === 'default'
  );
})();

// ----- closed 仍保留报名卡 -----
(function () {
  var closedSeries = makeSeries({ registrationState: 'closed' });
  var d = depsBase({
    listSeries: function () {
      return [closedSeries];
    }
  });
  var cards = adapter.buildRegistrationAllCards(d);
  var seriesCards = cards.filter(function (c) {
    return c && c._cardKind === 'series';
  });
  var managedCards = cards.filter(function (c) {
    return c && String(c.id).indexOf('m-') === 0;
  });
  assert(
    'published+closed → 仍 1 张 Series 卡',
    seriesCards.length === 1 && seriesCards[0].seriesId === 'series-8',
    'series=' + seriesCards.length
  );
  assert(
    'closed → 文案「报名已关闭」且中性 tone',
    seriesCards[0].statusLabel === '报名已关闭' &&
      seriesCards[0].statusTone === 'finished'
  );
  assert('closed 后 8 托管分站仍隐藏', managedCards.length === 0);
  assert(
    'closed 卡仍进 tab=register',
    seriesCards[0].navUrl.indexOf('tab=register') >= 0 &&
      seriesCards[0].navUrl.indexOf('matchId=') < 0 &&
      seriesCards[0].navUrl.indexOf('preview=') < 0
  );
  assert(
    'closed 不改 lifecycle / 不写 registrationRevision',
    closedSeries.lifecycleStatus === 'published' &&
      !Object.prototype.hasOwnProperty.call(closedSeries, 'registrationRevision')
  );
})();

// ----- reopen 同一张卡不重复 -----
assert(
  'reopen 后仍同一张卡、不重复',
  (function () {
    var series = makeSeries({ registrationState: 'closed' });
    var dClosed = depsBase({
      listSeries: function () {
        return [series];
      }
    });
    var closedCards = adapter.buildRegistrationAllCards(dClosed).filter(function (c) {
      return c && c._cardKind === 'series';
    });
    series.registrationState = 'open';
    var dOpen = depsBase({
      listSeries: function () {
        return [series];
      }
    });
    var openCards = adapter.buildRegistrationAllCards(dOpen).filter(function (c) {
      return c && c._cardKind === 'series';
    });
    return (
      closedCards.length === 1 &&
      openCards.length === 1 &&
      closedCards[0].id === openCards[0].id &&
      openCards[0].statusLabel === '报名中'
    );
  })()
);

// ----- 我的报名 -----
assert(
  '我的报名：roster registered 才出 Series',
  (function () {
    var d = depsBase({
      listSeries: function () {
        return [
          makeSeries({
            roster: [
              { playerId: 'p1', registrationStatus: 'registered' },
              { playerId: 'p2', registrationStatus: 'cancelled' }
            ]
          })
        ];
      },
      currentPlayerId: 'p1'
    });
    var cards = adapter.buildRegistrationMineCards(d);
    return cards.some(function (c) {
      return c && c.seriesId === 'series-8';
    });
  })()
);

assert(
  '我的报名：closed 仍可见（有效 registered）',
  (function () {
    var d = depsBase({
      listSeries: function () {
        return [
          makeSeries({
            registrationState: 'closed',
            roster: [{ playerId: 'p1', registrationStatus: 'registered' }]
          })
        ];
      },
      currentPlayerId: 'p1'
    });
    var cards = adapter.buildRegistrationMineCards(d);
    var hit = cards.filter(function (c) {
      return c && c.seriesId === 'series-8';
    });
    return (
      hit.length === 1 &&
      hit[0].statusLabel === '报名已关闭'
    );
  })()
);

assert(
  '我的报名：cancelled 不出',
  (function () {
    var d = depsBase({
      listSeries: function () {
        return [
          makeSeries({
            roster: [{ playerId: 'p1', registrationStatus: 'cancelled' }]
          })
        ];
      },
      currentPlayerId: 'p1'
    });
    var cards = adapter.buildRegistrationMineCards(d);
    return !cards.some(function (c) {
      return c && c.seriesId === 'series-8';
    });
  })()
);

assert(
  '我的报名：closed + cancelled roster 不出',
  (function () {
    var d = depsBase({
      listSeries: function () {
        return [
          makeSeries({
            registrationState: 'closed',
            roster: [{ playerId: 'p1', registrationStatus: 'cancelled' }]
          })
        ];
      },
      currentPlayerId: 'p1'
    });
    return !adapter.buildRegistrationMineCards(d).some(function (c) {
      return c && c.seriesId === 'series-8';
    });
  })()
);

assert(
  '我的报名：身份空不猜测 Series',
  (function () {
    var d = depsBase({
      currentPlayerId: '',
      listSeries: function () {
        return [
          makeSeries({
            roster: [{ playerId: 'p1', registrationStatus: 'registered' }]
          })
        ];
      }
    });
    var cards = adapter.buildRegistrationMineCards(d);
    return !cards.some(function (c) {
      return c && c._cardKind === 'series';
    });
  })()
);

// ----- open + LIVE 双列表 -----
assert(
  'registration open + 某站 ongoing → 报名仍有 Series',
  (function () {
    var liveStations = stations8.map(function (m, idx) {
      return Object.assign({}, m, { status: idx === 0 ? 'ongoing' : 'registering' });
    });
    var map = Object.create(null);
    liveStations.concat([ordinary]).forEach(function (m) {
      map[m.matchId] = m;
    });
    var d = depsBase({
      listMatches: function () {
        return liveStations.concat([ordinary]);
      },
      getMatchById: function (id) {
        return map[id] || null;
      }
    });
    var reg = adapter.buildRegistrationAllCards(d);
    var plaza = adapter.buildPlazaTournamentCards(d);
    var regCard = reg.filter(function (c) {
      return c && c.seriesId === 'series-8';
    })[0];
    var plazaCard = plaza.filter(function (c) {
      return c && c.seriesId === 'series-8' && c.statusLabel === 'LIVE';
    })[0];
    var plazaManaged = plaza.filter(function (c) {
      return c && String(c.id).indexOf('m-') === 0;
    });
    return (
      !!regCard &&
      regCard.titleSub === '副标题' &&
      !!plazaCard &&
      plazaCard.titleSub === '副标题 · R1' &&
      plazaManaged.length === 0
    );
  })()
);

// ----- store 失败降级 -----
assert(
  'listSeries 抛错 → 普通卡仍在',
  (function () {
    var d = depsBase({
      listSeries: function () {
        throw new Error('boom');
      }
    });
    var cards = adapter.buildRegistrationAllCards(d);
    return (
      cards.some(function (c) {
        return c && c.id === 'ordinary-1';
      }) &&
      !cards.some(function (c) {
        return c && c._cardKind === 'series';
      })
    );
  })()
);

assert(
  'draft Series 不出报名卡',
  (function () {
    var d = depsBase({
      listSeries: function () {
        return [makeSeries({ lifecycleStatus: 'draft' })];
      }
    });
    return !adapter.buildRegistrationAllCards(d).some(function (c) {
      return c && c._cardKind === 'series';
    });
  })()
);

assert(
  'cancelled Series 不出报名卡',
  (function () {
    var d = depsBase({
      listSeries: function () {
        return [
          makeSeries({
            lifecycleStatus: 'cancelled',
            registrationState: 'open'
          })
        ];
      }
    });
    return !adapter.buildRegistrationAllCards(d).some(function (c) {
      return c && c._cardKind === 'series';
    });
  })()
);

assert(
  'archived Series 不出报名卡',
  (function () {
    var d = depsBase({
      listSeries: function () {
        return [
          makeSeries({
            lifecycleStatus: 'archived',
            registrationState: 'closed'
          })
        ];
      }
    });
    return !adapter.buildRegistrationAllCards(d).some(function (c) {
      return c && c._cardKind === 'series';
    });
  })()
);

assert(
  'builder 纯只读：无 setStorage / repair / saveSeries',
  adapterSrc.indexOf('setStorage') < 0 &&
    adapterSrc.indexOf('repair') < 0 &&
    adapterSrc.indexOf('saveSeries') < 0 &&
    homeJs.indexOf('_buildAllRegisteringTournamentCards') >= 0 &&
    /零写入/.test(homeJs)
);

assert(
  '报名入选不依赖 registrationState===open',
  !/registrationState\)\s*!==\s*['"]open['"]/.test(adapterSrc) &&
    !/registrationState\)\s*===\s*['"]open['"]\s*\)\s*continue/.test(adapterSrc)
);

assert(
  'private 卡有 privacyLabel 且无码；详情门闩仍需校验',
  (function () {
    var card = adapter.toSeriesClubCard(
      makeSeries({ visibility: 'private', accessCode: 'SHOULD_NOT_LEAK' }),
      'registration'
    );
    var need = gate.decideAccessGate(
      { visibility: 'private', lifecycleStatus: 'published' },
      { preview: false }
    ).needVerify;
    return (
      card.privacyLabel === '访问码保护' &&
      JSON.stringify(card).indexOf('SHOULD_NOT_LEAK') < 0 &&
      need === true
    );
  })()
);

assert(
  'courseList 含半场；同场不同半场不合并；>1 为 stack',
  (function () {
    var sameHalf = adapter.buildSeriesCourseList([
      { courseName: '清河湾', front9Course: 'A', back9Course: 'B' },
      { courseName: '清河湾', courseHalfText: '（A/B）' }
    ]);
    var diffHalf = adapter.buildSeriesCourseList([
      { courseName: '清河湾', front9Course: 'A', back9Course: 'B' },
      { courseName: '清河湾', front9Course: 'C', back9Course: 'D' }
    ]);
    var three = adapter.buildSeriesCourseList([
      { courseName: '一号场' },
      { courseName: '二号场' },
      { courseName: '三号场' }
    ]);
    var card = adapter.toSeriesClubCard(
      {
        seriesId: 's-course',
        seriesName: '测',
        hostMode: 'team',
        hostTeam: { teamName: '湘鹰' },
        rounds: [
          { roundId: 'r1', gameMode: 'fourball', courseName: '一号场' },
          { roundId: 'r2', gameMode: 'fourball', courseName: '二号场' },
          { roundId: 'r3', gameMode: 'fourball', courseName: '三号场' }
        ]
      },
      'registration'
    );
    var halfCard = adapter.toSeriesClubCard(
      {
        seriesId: 's-half',
        seriesName: '测半场',
        hostMode: 'team',
        hostTeam: { teamName: '湘鹰' },
        rounds: [
          {
            roundId: 'r1',
            gameMode: 'fourball',
            courseName: '清河湾',
            front9Course: 'A',
            back9Course: 'B'
          },
          {
            roundId: 'r2',
            gameMode: 'fourball',
            courseName: '清河湾',
            front9Course: 'C',
            back9Course: 'D'
          }
        ]
      },
      'registration'
    );
    return (
      sameHalf.length === 1 &&
      sameHalf[0] === '清河湾（A/B）' &&
      diffHalf.length === 2 &&
      diffHalf[0] === '清河湾（A/B）' &&
      diffHalf[1] === '清河湾（C/D）' &&
      three.length === 3 &&
      card.courseLayout === 'stack' &&
      card.courseList.join(',') === '一号场,二号场,三号场' &&
      halfCard.courseLayout === 'stack' &&
      halfCard.courseList.join('|') === '清河湾（A/B）|清河湾（C/D）' &&
      halfCard.courseFirstName === '清河湾（A/B）' &&
      card.gameModeText.indexOf('四人四球') >= 0
    );
  })()
);

// ----- 接线 -----
assert(
  'home require seriesListCardAdapter / seriesStore',
  homeJs.indexOf('seriesListCardAdapter') >= 0 && homeJs.indexOf('seriesStore') >= 0
);

assert(
  'home 三 builder 走 adapter',
  homeJs.indexOf('buildRegistrationAllCards') >= 0 &&
    homeJs.indexOf('buildRegistrationMineCards') >= 0 &&
    homeJs.indexOf('buildPlazaTournamentCards') >= 0
);

assert(
  'wxml 可选 titleSub/tagLine/privacyLabel',
  homeWxml.indexOf('titleSub') >= 0 &&
    homeWxml.indexOf('tagLine') >= 0 &&
    homeWxml.indexOf('privacyLabel') >= 0 &&
    homeWxml.indexOf('dsCardClubSeriesMeta') >= 0 &&
    homeWxml.indexOf('courseList') >= 0
);

assert(
  'adapter 不 require 分包页 / publish / validators',
  !/require\([^)]*series-detail/.test(adapterSrc) &&
    adapterSrc.indexOf('seriesPublish') < 0 &&
    adapterSrc.indexOf('seriesValidators') < 0
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('FAILURES:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
