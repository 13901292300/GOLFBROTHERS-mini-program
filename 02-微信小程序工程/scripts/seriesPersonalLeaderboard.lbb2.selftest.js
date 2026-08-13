/**
 * LB-B2：Series 未开赛单轮个人榜 TEEING OFF SOON
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesPersonalLeaderboard.lbb2.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var pageDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');
var compDir = path.join(mini, 'components', 'personal-leaderboard-board');

var adapter = require(path.join(pageDir, 'seriesPersonalLeaderboardAdapter.js'));
var personalLeaderboardBoard = require(path.join(mini, 'utils', 'personalLeaderboardBoard.js'));

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

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function teamGroups() {
  return [
    { id: 'red', name: '红队', sourceTeamLogo: '/assets/mock-avatars/mock-avatar-01.jpg' },
    { id: 'blue', name: '蓝队', sourceTeamLogo: '/assets/mock-avatars/mock-avatar-02.jpg' }
  ];
}

function baseMatch(patch) {
  return Object.assign(
    {
      matchId: 'm-b2',
      matchType: 'inter-team',
      status: 'registering',
      gameMode: '个人比杆赛',
      teamGroups: teamGroups(),
      registerInfo: { users: [] },
      groups: [],
      scoreData: {},
      scoreEntities: {},
      peoriaResult: null
    },
    patch || {}
  );
}

function managedWrap(match, roundId) {
  var rid = roundId || 'r1';
  var m = Object.assign({}, match, {
    seriesContext: {
      managed: true,
      seriesId: 's1',
      roundId: rid,
      publishToken: 'tok'
    }
  });
  return {
    selectedKey: rid,
    series: { seriesId: 's1', publishToken: 'tok' },
    round: { roundId: rid, matchId: m.matchId },
    match: m,
    indexLink: { seriesId: 's1', roundId: rid, matchId: m.matchId }
  };
}

function project(match, view, scoreType) {
  return adapter.projectSeriesStandingsPersonalBoard(
    Object.assign({}, managedWrap(match), {
      selection: { view: view || 'all', scoreType: scoreType || 'gross' }
    })
  );
}

function groupedUnstarted() {
  return baseMatch({
    groups: [
      {
        groupId: 'g1',
        groupName: '第1组',
        players: [
          {
            userId: 'u-m1',
            competitionName: '席位甲',
            gender: 'male',
            matchTeamId: 'red',
            position: 1
          },
          {
            userId: 'u-f1',
            competitionName: '席位女',
            gender: 'female',
            matchTeamId: 'blue',
            position: 2
          },
          {
            userId: 'u-unk',
            competitionName: '席位未知',
            gender: '',
            matchTeamId: 'red',
            position: 3
          }
        ],
        playersSlots: [
          { userId: 'u-m1', competitionName: '重复席位甲', gender: 'male' },
          { userId: 'u-m2', competitionName: '席位乙', gender: 'male', matchTeamId: 'blue' }
        ]
      }
    ],
    registerInfo: {
      users: [
        {
          userId: 'u-m1',
          nickname: '报名甲',
          gender: 'female',
          avatar: '/assets/roster-avatar-m1.jpg',
          matchTeamId: 'blue',
          handicap: '12.4'
        },
        { userId: 'ghost', nickname: '仅报名', gender: 'male' }
      ]
    }
  });
}

var seriesJs = read(path.join(pageDir, 'index.js'));
var seriesWxml = read(path.join(pageDir, 'index.wxml'));
var adapterSrc = read(path.join(pageDir, 'seriesPersonalLeaderboardAdapter.js'));
var standingsVmSrc = read(path.join(pageDir, 'seriesStandingsViewModel.js'));
var detailJs = read(path.join(detailDir, 'index.js'));
var detailWxml = read(path.join(detailDir, 'index.wxml'));
var detailJson = read(path.join(detailDir, 'index.json'));
var compJs = read(path.join(compDir, 'index.js'));
var compWxml = read(path.join(compDir, 'index.wxml'));
var sharedSrc = read(path.join(mini, 'utils', 'personalLeaderboardBoard.js'));

var tot = adapter.projectSeriesStandingsPersonalBoard({
  selectedKey: 'cumulative',
  selection: { view: 'all', scoreType: 'gross' },
  match: groupedUnstarted()
});
assert(
  '1 TOT 不进入 B2',
  tot.reason === 'tot' &&
    tot.useShared === false &&
    tot.overlay.prestartExpandMode === 'none' &&
    tot.overlay.showSharedPersonalBoard === false
);

var team = project(groupedUnstarted(), 'team');
assert(
  '2 team 模式不进入 B2',
  team.reason === 'team' &&
    team.useShared === false &&
    team.overlay.prestartExpandMode === 'none'
);

var noGroup = project(baseMatch({ groups: [] }), 'all');
assert(
  '3 未分组轮不生成个人行',
  noGroup.reason === 'prestart' &&
    noGroup.overlay.personalLeaderboard.length === 0 &&
    noGroup.calledShared === false
);

var grouped = project(groupedUnstarted(), 'all');
assert(
  '4 已分组未开始生成 pending rows',
  grouped.reason === 'prestart' &&
    grouped.useShared === true &&
    grouped.calledShared === false &&
    grouped.overlay.showSharedPersonalBoard === true &&
    grouped.overlay.personalLeaderboard.length === 4
);

var ids = grouped.overlay.personalLeaderboard.map(function (r) {
  return r.playerId;
});
assert(
  '5 席位按真实用户去重',
  ids.indexOf('u-m1') >= 0 &&
    ids.filter(function (id) {
      return id === 'u-m1';
    }).length === 1 &&
    ids.indexOf('ghost') < 0
);

var seatA = grouped.overlay.personalLeaderboard.filter(function (r) {
  return r.playerId === 'u-m1';
})[0];
assert(
  '6 roster 仅补展示字段',
  seatA &&
    seatA.name === '席位甲' &&
    seatA.gender === 'male' &&
    seatA.badgeTeamId === 'red' &&
    seatA.handicapText === '12.4' &&
    /roster-avatar-m1/.test(seatA.avatar)
);

assert(
  '7 all 包含未知性别',
  ids.indexOf('u-unk') >= 0
);

var male = project(groupedUnstarted(), 'male');
var female = project(groupedUnstarted(), 'female');
var maleIds = male.overlay.personalLeaderboard.map(function (r) {
  return r.playerId;
});
var femaleIds = female.overlay.personalLeaderboard.map(function (r) {
  return r.playerId;
});
assert(
  '8 male/female 排除未知性别',
  maleIds.indexOf('u-unk') < 0 &&
    femaleIds.indexOf('u-unk') < 0 &&
    femaleIds.indexOf('u-f1') >= 0 &&
    maleIds.indexOf('u-m1') >= 0
);

function noFakeScore(row) {
  if (!row) return false;
  var thru = asString(row.thru);
  var score = asString(row.scoreStr);
  var net = asString(row.netScoreDisplay);
  return (
    row.hasScore !== true &&
    row.grossTotal == null &&
    row.toPar == null &&
    row.total == null &&
    (thru === '-' || thru === '') &&
    thru !== '0' &&
    thru !== 'F' &&
    (score === '-' || score === '') &&
    score !== '0' &&
    score !== 'E' &&
    (net === '-' || net === '')
  );
}

assert(
  '9 pending row 不含虚假 TOTAL',
  grouped.overlay.personalLeaderboard.every(function (r) {
    return r.grossTotal == null && r.total == null && asString(r.scoreStr) !== '0';
  })
);
assert(
  '10 pending row 不含虚假 TO PAR',
  grouped.overlay.personalLeaderboard.every(function (r) {
    return r.toPar == null && asString(r.scoreStr) !== 'E' && asString(r.scoreStr) !== '0';
  })
);
assert(
  '11 pending row 不含虚假 THRU',
  grouped.overlay.personalLeaderboard.every(function (r) {
    return asString(r.thru) === '-' && r.thru !== 0 && asString(r.thru) !== 'F';
  }) &&
    grouped.overlay.personalLeaderboard.every(noFakeScore)
);

assert(
  '12 Series 传 prestartExpandMode=teeing_off_soon',
  grouped.overlay.prestartExpandMode === 'teeing_off_soon' &&
    /prestart-expand-mode="\{\{standings.prestartExpandMode \|\| 'none'\}\}"/.test(seriesWxml)
);

assert(
  '13 普通 detail 默认 none',
  /prestartExpandMode:\s*\{\s*type:\s*String,\s*value:\s*'none'/.test(compJs) &&
    detailWxml.indexOf('prestart-expand-mode') < 0 &&
    detailWxml.indexOf('teeing_off_soon') < 0
);

var prestartBlock = compWxml.slice(
  compWxml.indexOf("prestartExpandMode === 'teeing_off_soon'"),
  compWxml.indexOf('wx:elif="{{openScorecard}}"')
);
assert(
  '14 展开只显示资料区、英文和广告',
  /leaderboard-player-profile-panel/.test(compWxml) &&
    /TEEING OFF SOON/.test(prestartBlock) &&
    /class="sc-ad"/.test(prestartBlock) &&
    /mp-sb-coming-soon/.test(prestartBlock)
);

assert(
  '15 无逐洞表头和图例',
  prestartBlock.indexOf('tour-scorecard') < 0 &&
    prestartBlock.indexOf('frontHead') < 0 &&
    prestartBlock.indexOf('EAGLE OR BETTER') < 0 &&
    prestartBlock.indexOf('score-legend-area') < 0 &&
    prestartBlock.indexOf('sc-course') < 0
);

assert(
  '16 球队/分队角标正确',
  seatA.badgeTeamId === 'red' &&
    /team-group-logo-by-id="\{\{teamGroupLogoById\}\}"/.test(compWxml) &&
    /avatar-badge="\{\{leaderboardAvatarBadge\}\}"/.test(compWxml)
);

assert(
  '17 profile 使用真实 userId/playerId',
  seatA.playerId === 'u-m1' &&
    seatA.userId === 'u-m1' &&
    /bind:profiletap="onStandingsScorecardProfileTap"/.test(seriesWxml) &&
    /personalProfileEntryMap/.test(adapterSrc)
);

assert(
  '18 同行点击可收起',
  /onStandingsPersonalLeaderboardRowTap[\s\S]{0,800}current === idx/.test(seriesJs) &&
    /_standingsPersonalOpenIndex = -1/.test(seriesJs)
);

assert(
  '19 切换球员只保留一个展开',
  /applyExpanded\(pending, openIndex\)/.test(adapterSrc) &&
    /this\._standingsPersonalOpenIndex = idx/.test(seriesJs)
);

var live = Object.assign({}, groupedUnstarted(), { status: 'ongoing' });
live.scoreData = {
  g1: {
    scoresByPlayer: {
      'u-m1': { scores: [4, 4, 4] }
    }
  }
};
var liveProj = project(live, 'all');
assert(
  '20 开赛后自动走 B1 普通展开',
  liveProj.reason === 'shared' &&
    liveProj.calledShared === true &&
    liveProj.overlay.prestartExpandMode === 'none' &&
    liveProj.overlay.showSharedPersonalBoard === true &&
    adapter.isRoundReadyForSharedPersonalBoard(live) === true
);

assert(
  '21 不写 Series/match/storage',
  !/setStorageSync|getStorageSync|upsertSeries|saveMatch|setMatch/.test(adapterSrc) &&
    !/wx\./.test(adapterSrc)
);

assert(
  '22 不重置纵向/横向滚动',
  /_reprojectStandingsBoardOverlay:[\s\S]{0,700}delete patch\.scrollTop/.test(seriesJs) &&
    /_reprojectStandingsBoardOverlay:[\s\S]{0,900}delete patch\.roundSelectorScrollLeft/.test(
      seriesJs
    ) &&
    /_syncPersonalExpandPagePatch[\s\S]{0,200}不清零 filler/.test(seriesJs)
);

assert(
  '23 B1 成绩路径仍直接调用共享模块',
  /buildPersonalLeaderboardBoard\(match/.test(adapterSrc) &&
    liveProj.overlay.personalLeaderboard.length > 0
);

assert(
  '24 普通 detail 文件和行为无回归',
  /_buildLeaderboardViewForView[\s\S]{0,280}buildPersonalLeaderboardBoard/.test(detailJs) &&
    /<personal-leaderboard-board/.test(detailWxml) &&
    /personal-leaderboard-board/.test(detailJson) &&
    detailWxml.indexOf('teeing_off_soon') < 0 &&
    !/prestartExpandMode|teeing_off_soon/.test(sharedSrc) &&
    !/seriesId|fromSeries/.test(compJs)
);

assert(
  'TOT/team ViewModel 未改',
  !/prestartExpandMode|buildPrestartPersonalRows/.test(standingsVmSrc)
);

assert(
  '组件不识别 seriesId/fromSeries',
  !/seriesId|fromSeries/.test(compJs + compWxml)
);

assert(
  '已开赛不保留 prestart',
  liveProj.overlay.personalLeaderboard.every(function (r) {
    return r.pendingPrestart !== true;
  })
);

if (failures.length) {
  console.log('');
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
}
console.log('');
console.log('LBB2 selftest: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
