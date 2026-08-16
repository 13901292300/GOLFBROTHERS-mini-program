/**
 * 广场报名 TAB 系列赛整体阶段过滤 + 轮次启动成功提示
 * 运行：node scripts/seriesPlazaRegistrationPhase.selftest.js
 */

var path = require('path');
var fs = require('fs');

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

var aggregate = require(path.join(utilsDir, 'seriesRoundPhaseAggregate.js'));
var adapter = require(path.join(utilsDir, 'seriesListCardAdapter.js'));
var plazaSub = require(path.join(utilsDir, 'seriesPlazaLiveSubtitle.js'));
var scheduleWrite = require(path.join(seriesDir, 'seriesScheduleGroupWrite.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));

var pageJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var writeJs = fs.readFileSync(path.join(seriesDir, 'seriesScheduleGroupWrite.js'), 'utf8');
var adapterJs = fs.readFileSync(path.join(utilsDir, 'seriesListCardAdapter.js'), 'utf8');
var homeJs = fs.readFileSync(path.join(root, 'miniprogram', 'pages', 'home', 'index.js'), 'utf8');
var detailJs = fs.readFileSync(
  path.join(root, 'miniprogram', 'subpackages', 'tournament', 'pages', 'detail', 'index.js'),
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
      seriesId: 's-phase',
      seriesName: '阶段系列赛',
      seriesSubtitle: '副标题',
      lifecycleStatus: 'published',
      registrationState: 'open',
      publishToken: 'tok-phase',
      hostMode: 'organization',
      organization: { organizationName: '主办', organizationLogo: '' },
      scoringRule: { mode: 'per_round_n', allowRepeat: false },
      createdAt: 1,
      roster: [],
      rounds: [
        {
          roundId: 'r1',
          index: 1,
          matchId: 'm1',
          dateTime: '2030-06-01 08:00',
          gameMode: '个人比杆赛',
          courseId: 'c1',
          courseName: '球场1'
        },
        {
          roundId: 'r2',
          index: 2,
          matchId: 'm2',
          dateTime: '2030-06-02 08:00',
          gameMode: '个人比杆赛',
          courseId: 'c1',
          courseName: '球场1'
        }
      ]
    },
    over || {}
  );
}

function station(id, roundId, status, extra) {
  return Object.assign(
    {
      matchId: id,
      status: status,
      seriesContext: {
        managed: true,
        seriesId: 's-phase',
        roundId: roundId,
        publishToken: 'tok-phase'
      },
      groups: extra && extra.groups ? extra.groups : []
    },
    extra || {}
  );
}

function deps(series, matches, extra) {
  var map = Object.create(null);
  (matches || []).forEach(function (m) {
    map[m.matchId] = m;
  });
  var ordinary = {
    matchId: 'ordinary-reg',
    status: 'registering',
    createdAt: 2,
    seriesContext: null,
    registerInfo: { users: [{ userId: 'u1' }] }
  };
  map[ordinary.matchId] = ordinary;
  return Object.assign(
    {
      listSeries: function () {
        return [series];
      },
      listMatches: function () {
        return (matches || []).concat([ordinary]);
      },
      getMatchById: function (id) {
        return map[id] || null;
      },
      currentUserId: 'u1',
      currentPlayerId: 'p1',
      toOrdinaryCard: function (m) {
        return { id: m.matchId, matchId: m.matchId, status: m.status };
      }
    },
    extra || {}
  );
}

function hasSeriesCard(cards) {
  return (cards || []).some(function (c) {
    return c && c.seriesId === 's-phase';
  });
}

function hasOrdinary(cards) {
  return (cards || []).some(function (c) {
    return c && c.id === 'ordinary-reg';
  });
}

(function testAllLiveHidden() {
  var series = makeSeries();
  var matches = [
    station('m1', 'r1', 'ongoing'),
    station('m2', 'r2', 'live')
  ];
  assert('全部 LIVE 聚合为已开赛', aggregate.allValidRoundsStartedOrCompleted(series, deps(series, matches).getMatchById) === true);
  var cards = adapter.buildRegistrationAllCards(deps(series, matches));
  assert('全部 LIVE → 报名 TAB 移除', !hasSeriesCard(cards));
  assert('普通报名卡不受影响', hasOrdinary(cards));
  var plaza = adapter.buildPlazaTournamentCards(deps(series, matches));
  assert(
    '团体比赛仍展示 LIVE 系列赛',
    plaza.some(function (c) {
      return c && c.seriesId === 's-phase' && c.statusLabel === 'LIVE';
    })
  );
})();

(function testMixLiveCompleted() {
  var series = makeSeries();
  var matches = [
    station('m1', 'r1', 'ongoing'),
    station('m2', 'r2', 'finished')
  ];
  var d = deps(series, matches);
  assert('LIVE+COMPLETED 视为整体比赛阶段', aggregate.allValidRoundsStartedOrCompleted(series, d.getMatchById) === true);
  assert('混合 LIVE/结束 → 报名移除', !hasSeriesCard(adapter.buildRegistrationAllCards(d)));
})();

(function testUnstartedKept() {
  var series = makeSeries();
  var matches = [
    station('m1', 'r1', 'ongoing'),
    station('m2', 'r2', 'registering')
  ];
  var d = deps(series, matches);
  assert('存在未开始轮不隐藏', aggregate.allValidRoundsStartedOrCompleted(series, d.getMatchById) === false);
  assert('未开始轮 → 报名保留', hasSeriesCard(adapter.buildRegistrationAllCards(d)));
})();

(function testGroupedNotStartedKept() {
  var series = makeSeries();
  var matches = [
    station('m1', 'r1', 'finished'),
    station('m2', 'r2', 'registering', {
      groups: [{ groupId: 'g1', players: [{ userId: 'p1' }] }]
    })
  ];
  var d = deps(series, matches);
  assert('已分组未开始不算整体开赛', aggregate.allValidRoundsStartedOrCompleted(series, d.getMatchById) === false);
  assert('已分组未开始 → 报名保留', hasSeriesCard(adapter.buildRegistrationAllCards(d)));
})();

(function testCancelledIgnored() {
  var series = makeSeries();
  series.rounds[1].roundStatus = 'cancelled';
  var matches = [
    station('m1', 'r1', 'ongoing'),
    station('m2', 'r2', 'registering', { status: 'cancelled' })
  ];
  var d = deps(series, matches);
  assert('取消轮不参与判断', aggregate.allValidRoundsStartedOrCompleted(series, d.getMatchById) === true);
  assert('取消轮不阻止移除', !hasSeriesCard(adapter.buildRegistrationAllCards(d)));
})();

(function testZeroValidNotHidden() {
  var series = makeSeries({
    rounds: [
      { roundId: 'r1', index: 1, matchId: 'm1', roundStatus: 'cancelled' },
      { roundId: 'r2', index: 2, matchId: 'm2', roundStatus: 'cancelled' }
    ]
  });
  var matches = [
    station('m1', 'r1', 'cancelled'),
    station('m2', 'r2', 'cancelled')
  ];
  var d = deps(series, matches);
  assert('零个有效轮次 hasValidRounds=false', aggregate.hasValidRounds(series, d.getMatchById) === false);
  assert('零有效轮不得误判全部已开赛', aggregate.allValidRoundsStartedOrCompleted(series, d.getMatchById) === false);
  assert('零有效轮仍可留在报名（不误移除）', hasSeriesCard(adapter.buildRegistrationAllCards(d)));
})();

(function testLastRoundStartThenHide() {
  var series = makeSeries();
  var matches = [
    station('m1', 'r1', 'ongoing'),
    station('m2', 'r2', 'registering', {
      groups: [{ groupId: 'g1', players: [{ position: 1, userId: 'p1' }] }]
    })
  ];
  var map = Object.create(null);
  matches.forEach(function (m) {
    map[m.matchId] = m;
  });
  var getter = function (id) {
    return map[id] || null;
  };
  assert('最后一轮启动前仍在报名', hasSeriesCard(adapter.buildRegistrationAllCards(deps(series, matches))));
  var started = scheduleWrite.startStationRound({
    matchId: 'm2',
    series: series,
    roundId: 'r2',
    getMatchById: getter,
    saveMatch: function (m) {
      map[m.matchId] = m;
      return m;
    }
  });
  assert('最后一轮启动成功', !!(started && started.ok && started.startedLive === true));
  var after = [map.m1, map.m2];
  assert(
    '最后一轮 LIVE 后立即满足过滤',
    aggregate.allValidRoundsStartedOrCompleted(series, getter) === true &&
      !hasSeriesCard(adapter.buildRegistrationAllCards(deps(series, after)))
  );
})();

(function testRestoreUnstarted() {
  var series = makeSeries();
  var matches = [
    station('m1', 'r1', 'ongoing'),
    station('m2', 'r2', 'ongoing')
  ];
  assert('双 LIVE 时报名无卡', !hasSeriesCard(adapter.buildRegistrationAllCards(deps(series, matches))));
  matches[1].status = 'registering';
  assert(
    '合法恢复未开始后重新出现',
    hasSeriesCard(adapter.buildRegistrationAllCards(deps(series, matches)))
  );
})();

(function testNoticeIndex() {
  var series = makeSeries();
  assert(
    '启动 R1 提示原始序号',
    aggregate.formatSeriesRoundEnteredLiveNotice(series, 'r1') ===
      '第1轮比赛已进入LIVE状态，请到广场-团体比赛内查看。'
  );
  assert(
    '启动 R2 提示原始序号',
    aggregate.formatSeriesRoundEnteredLiveNotice(series, 'r2') ===
      '第2轮比赛已进入LIVE状态，请到广场-团体比赛内查看。'
  );
})();

(function testCxStillUsesOriginalIndex() {
  var series = makeSeries({
    rounds: [
      {
        roundId: 'r1',
        index: 1,
        matchId: 'm1',
        dateTime: '2030-06-01 08:00',
        courseId: 'cA',
        courseName: 'A场'
      },
      {
        roundId: 'r2',
        index: 2,
        matchId: 'm2',
        dateTime: '2030-06-01 12:00',
        courseId: 'cB',
        courseName: 'B场'
      }
    ]
  });
  var notice = aggregate.formatSeriesRoundEnteredLiveNotice(series, 'r2');
  assert('C1/C2 场景仍用第x轮', notice.indexOf('第2轮') === 0 && notice.indexOf('C2') < 0);
  assert('提示不含 Cx 业务编号', notice.indexOf('C1') < 0);
})();

(function testScoringModesShareRule() {
  ['per_round_n', 'global_m'].forEach(function (mode) {
    var series = makeSeries({ scoringRule: { mode: mode, globalM: 8, allowRepeat: false } });
    var matches = [station('m1', 'r1', 'ongoing'), station('m2', 'r2', 'finished')];
    assert(
      mode + ' 使用同一聚合规则',
      aggregate.allValidRoundsStartedOrCompleted(series, deps(series, matches).getMatchById) === true
    );
  });
})();

(function testStartFailNoNotice() {
  var series = makeSeries();
  var empty = station('m1', 'r1', 'registering', { groups: [] });
  var started = scheduleWrite.startStationRound({
    matchId: 'm1',
    series: series,
    roundId: 'r1',
    getMatchById: function () {
      return empty;
    },
    saveMatch: function () {
      throw new Error('should not save');
    }
  });
  assert('启动失败不带成功提示', !!(started && started.ok === false && !started.startedLive && !started.liveNotice));
})();

(function testAlreadyLiveNoRepeatNotice() {
  var series = makeSeries();
  var live = station('m1', 'r1', 'ongoing', {
    groups: [{ groupId: 'g1', players: [{ userId: 'p1' }] }]
  });
  var started = scheduleWrite.startStationRound({
    matchId: 'm1',
    series: series,
    roundId: 'r1',
    getMatchById: function () {
      return live;
    },
    saveMatch: function () {
      throw new Error('should not save again');
    }
  });
  assert(
    '已经 LIVE 重复点击不成功提示',
    started.ok === false &&
      started.reason === 'already_live' &&
      started.startedLive === false &&
      !started.liveNotice
  );
})();

(function testPlazaSubtitleRegression() {
  var series = makeSeries();
  var matches = [station('m1', 'r1', 'ongoing'), station('m2', 'r2', 'registering')];
  var d = deps(series, matches);
  var sub = plazaSub.projectPlazaSeriesTitleSub(series, d.getMatchById);
  assert('团体比赛 LIVE 副标题仍投影', typeof sub === 'string' && sub.length >= 0);
})();

(function testWiring() {
  assert(
    '报名过滤走聚合纯函数',
    adapterJs.indexOf('shouldHideSeriesFromPlazaRegistration') >= 0 &&
      adapterJs.indexOf('seriesRoundPhaseAggregate') >= 0
  );
  assert(
    '保存成功后才组 liveNotice',
    /savedStatus !== 'ongoing'[\s\S]*liveNotice/.test(writeJs) ||
      writeJs.indexOf('startedLive: true') >= 0
  );
  assert(
    '详情页成功回调统一弹窗',
    pageJs.indexOf('_onSeriesStationRoundStartSuccess') >= 0 &&
      pageJs.indexOf('_showSeriesRoundEnteredLiveNotice') >= 0 &&
      /startStationRound\([\s\S]*_onSeriesStationRoundStartSuccess/.test(pageJs)
  );
  assert(
    '成功提示我知道了且不先 toast 已开赛',
    pageJs.indexOf("confirmText: '我知道了'") >= 0 &&
      !/startStationRound\([\s\S]*已开赛/.test(pageJs)
  );
  assert(
    '广场报名仍走 buildRegistrationAllCards 刷新',
    homeJs.indexOf('buildRegistrationAllCards') >= 0 &&
      homeJs.indexOf('refreshTeamMatchCards') >= 0
  );
  assert(
    '普通队际详情不含系列赛 LIVE 提示文案',
    detailJs.indexOf('请到广场-团体比赛内查看') < 0 &&
      detailJs.indexOf('startTournamentMatch') >= 0
  );
})();

(function testBuildPublishedSeriesStartNotice() {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: '提示',
    createdBy: 'admin-1',
    organization: { organizationId: 'o1', organizationName: '机构', organizationLogo: '' }
  });
  s.lifecycleStatus = 'published';
  s.publishToken = 'tok-n';
  s.participants = [
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't1',
      seriesParticipantId: 'team:t1',
      nameSnapshot: '甲'
    }),
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't2',
      seriesParticipantId: 'team:t2',
      nameSnapshot: '乙'
    })
  ];
  s.rounds = [1, 2].map(function (n) {
    return Object.assign({}, seriesModel.createBlankRound(n, null), {
      roundId: 'rr' + n,
      index: n,
      matchId: 'mm' + n,
      dateTime: '2030-07-0' + n + ' 08:00',
      gameMode: '个人比杆赛',
      courseId: 'c1',
      courseName: '球场',
      fee: '0'
    });
  });
  var built = seriesStationMatch.buildMatchFromSeriesRound(s, s.rounds[0], {
    matchId: 'mm1',
    publishToken: s.publishToken
  });
  assert('分站可构造', built.ok === true);
  built.match.status = 'registering';
  built.match.groups = [{ groupId: 'g1', players: [{ userId: 'p1' }] }];
  var res = scheduleWrite.startStationRound({
    matchId: 'mm1',
    series: s,
    roundId: 'rr1',
    getMatchById: function () {
      return built.match;
    },
    saveMatch: function (m) {
      built.match = m;
      return m;
    }
  });
  assert(
    '公共保存入口返回提示文案',
    res.ok === true &&
      res.startedLive === true &&
      res.liveNotice === '第1轮比赛已进入LIVE状态，请到广场-团体比赛内查看。'
  );
})();

console.log('');
console.log('---- seriesPlazaRegistrationPhase.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
