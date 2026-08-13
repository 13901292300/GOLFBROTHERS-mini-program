/**
 * LB-B1：Series 已开赛单轮接入共享个人榜
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesPersonalLeaderboard.lbb1.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var pageDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');
var compDir = path.join(mini, 'components', 'personal-leaderboard-board');
var baselinePath = path.join(__dirname, 'personalLeaderboardBoard.lba1.baseline.json');

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

function fillScores(n, stroke) {
  var out = [];
  for (var i = 0; i < 18; i++) out.push(i < n ? stroke : null);
  return out;
}

function teamGroups() {
  return [
    { id: 'red', name: '红队', sourceTeamLogo: '/assets/mock-avatars/mock-avatar-01.jpg' },
    { id: 'blue', name: '蓝队', sourceTeamLogo: '/assets/mock-avatars/mock-avatar-02.jpg' }
  ];
}

function usersG1() {
  return [
    { userId: 'u-m1', nickname: '红一', gender: 'male', matchTeamId: 'red', flag: 'cn', country: 'CHN', age: 32 },
    { userId: 'u-f1', nickname: '蓝女', gender: 'female', matchTeamId: 'blue', flag: 'jp', country: 'JPN', age: 28 },
    { userId: 'u-m2', nickname: '蓝二', gender: 'male', matchTeamId: 'blue', flag: 'kr', country: 'KOR', age: 40 },
    { userId: 'u-m3', nickname: '红三', gender: 'male', matchTeamId: 'red', flag: 'us', country: 'USA', age: 21 }
  ];
}

function baseMatch(patch) {
  return Object.assign(
    {
      matchId: 'm-lbb1',
      matchType: 'inter-team',
      status: 'ongoing',
      gameMode: '个人比杆赛',
      courseName: '测试球场',
      front9Course: 'A',
      back9Course: 'B',
      teamGroups: teamGroups(),
      registerInfo: { users: usersG1() },
      groups: [],
      scoreData: {},
      scoreEntities: {},
      pairings: {},
      peoriaResult: null
    },
    patch || {}
  );
}

function fixtureG1() {
  return baseMatch({
    matchId: 'm-g1',
    status: 'ongoing',
    gameMode: '个人比杆赛',
    groups: [
      {
        groupId: 'g1',
        groupName: '第1组',
        players: [
          { userId: 'u-m1', competitionName: '红一', gender: 'male', position: 1, flag: 'cn', country: 'CHN', age: 32 },
          { userId: 'u-f1', competitionName: '蓝女', gender: 'female', position: 2, flag: 'jp', country: 'JPN', age: 28 },
          { userId: 'u-unk', competitionName: '未知', gender: '', position: 3 },
          { userId: 'u-m2', competitionName: '蓝二', gender: 'male', position: 4, flag: 'kr', country: 'KOR', age: 40 },
          { userId: 'u-m3', competitionName: '红三', gender: 'male', position: 5, flag: 'us', country: 'USA', age: 21 }
        ]
      }
    ],
    scoreData: {
      g1: {
        scoresByPlayer: {
          'u-m1': { scores: fillScores(9, 4) },
          'u-f1': { scores: fillScores(18, 4) },
          'u-m2': { scores: fillScores(18, 5) },
          'u-m3': { scores: fillScores(18, 4) }
        }
      }
    },
    peoriaResult: {
      status: 'generated',
      results: [
        { playerId: 'u-f1', net: 70 },
        { playerId: 'u-m2', net: 72 },
        { playerId: 'u-m3', net: 70 },
        { playerId: 'u-m1', net: 68 }
      ]
    }
  });
}

function entityMembers(ids) {
  return ids.slice();
}

function fixtureG2() {
  return baseMatch({
    matchId: 'm-g2',
    gameMode: '四人四球比杆赛',
    groups: [
      {
        groupId: 'g1',
        groupName: '第1组',
        players: [
          { userId: 'u-m1', competitionName: '红一', gender: 'male', position: 1 },
          { userId: 'u-m3', competitionName: '红三', gender: 'male', position: 2 },
          { userId: 'u-f1', competitionName: '蓝女', gender: 'female', position: 3 },
          { userId: 'u-m2', competitionName: '蓝二', gender: 'male', position: 4 }
        ]
      }
    ],
    scoreEntities: {
      g1: [
        {
          entityId: 'e-red',
          entityType: 'team',
          compositionMode: '2+2',
          teamGroupId: 'red',
          members: entityMembers(['u-m1', 'u-m3'])
        },
        {
          entityId: 'e-blue',
          entityType: 'team',
          compositionMode: '2+2',
          teamGroupId: 'blue',
          members: entityMembers(['u-f1', 'u-m2'])
        }
      ]
    },
    scoreData: {
      g1: {
        teamScoresByEntity: [
          { teamId: 'e-red', scores: fillScores(18, 4) },
          { teamId: 'e-blue', scores: fillScores(10, 5) }
        ]
      }
    }
  });
}

function fixtureG3() {
  var m = fixtureG2();
  m.matchId = 'm-g3';
  m.gameMode = '最佳球位比杆赛';
  m.scoreEntities.g1[0].compositionMode = '4+0';
  m.scoreEntities.g1[1].compositionMode = '4+0';
  m.scoreData = {
    g1: {
      teamScoresByEntity: [
        { teamId: 'e-red', scores: fillScores(18, 3) },
        { teamId: 'e-blue', scores: [] }
      ]
    }
  };
  return m;
}

function fixtureG4() {
  var m = fixtureG2();
  m.matchId = 'm-g4';
  m.gameMode = '四人两球比杆赛';
  m.scoreEntities = {
    g1: [
      {
        entityId: 'pair-1',
        entityType: 'pair',
        compositionMode: '',
        teamGroupId: 'red',
        members: entityMembers(['u-m1', 'u-f1'])
      },
      {
        entityId: 'pair-2',
        entityType: 'pair',
        compositionMode: '',
        teamGroupId: 'blue',
        members: entityMembers(['u-m3', 'u-m2'])
      }
    ]
  };
  m.scoreData = {
    g1: {
      teamScoresByEntity: [
        { teamId: 'pair-1', scores: fillScores(18, 4) },
        { teamId: 'pair-2', scores: fillScores(6, 5) }
      ]
    }
  };
  return m;
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
  var ctx = managedWrap(match);
  return adapter.projectSeriesStandingsPersonalBoard(
    Object.assign({}, ctx, {
      selection: { view: view, scoreType: scoreType || 'gross' }
    })
  );
}

function rowSig(row) {
  if (!row) return null;
  return {
    pos: row.pos == null ? '' : String(row.pos),
    rowId: asString(row.rowId),
    playerId: asString(row.playerId),
    userId: asString(row.userId),
    entityId: asString(row.entityId),
    identityKey: asString(row.playerId || row.entityId || row.rowId),
    name: asString(row.name),
    displayName: asString(row.displayName),
    gender: asString(row.gender),
    scoreStr: asString(row.scoreStr),
    netScoreDisplay: asString(row.netScoreDisplay),
    thru: asString(row.thru),
    hasScore: row.hasScore === true,
    net: row.net == null || row.net === '' ? null : Number(row.net),
    isEntity: row.isEntity === true,
    members: Array.isArray(row.members)
      ? row.members.map(function (m) {
          return asString(m && (m.playerId || m.userId));
        })
      : []
  };
}

function boardSig(rows) {
  return (Array.isArray(rows) ? rows : []).map(rowSig);
}

function sameSig(a, b) {
  return JSON.stringify(boardSig(a)) === JSON.stringify(boardSig(b));
}

function sharedRows(match, view, scoreType) {
  var board = personalLeaderboardBoard.buildPersonalLeaderboardBoard(match, {
    view: view,
    scoreType: scoreType
  });
  return (board && board.leaderboard) || [];
}

var seriesJs = read(path.join(pageDir, 'index.js'));
var seriesWxml = read(path.join(pageDir, 'index.wxml'));
var seriesJson = read(path.join(pageDir, 'index.json'));
var adapterSrc = read(path.join(pageDir, 'seriesPersonalLeaderboardAdapter.js'));
var roundBoardSrc = read(path.join(pageDir, 'seriesStandingsRoundBoard.js'));
var standingsVmSrc = read(path.join(pageDir, 'seriesStandingsViewModel.js'));
var detailJs = read(path.join(detailDir, 'index.js'));
var detailWxml = read(path.join(detailDir, 'index.wxml'));
var compWxml = read(path.join(compDir, 'index.wxml'));

var g1 = fixtureG1();
var tot = adapter.projectSeriesStandingsPersonalBoard({
  selectedKey: 'cumulative',
  selection: { view: 'all', scoreType: 'gross' },
  match: g1
});
assert('1 TOT 路径不调用共享个人榜', tot.calledShared === false && tot.useShared === false && tot.reason === 'tot');

var team = project(g1, 'team', 'gross');
assert('2 team 模式不调用共享个人榜', team.calledShared === false && team.useShared === false && team.reason === 'team');

var rAll = project(g1, 'all', 'gross');
assert(
  '3 R + all 调用共享模块',
  rAll.calledShared === true &&
    rAll.useShared === true &&
    rAll.overlay.showSharedPersonalBoard === true
);

var rMale = project(g1, 'male', 'gross');
assert(
  '4 R + male 调用共享模块',
  rMale.calledShared === true && rMale.overlay.personalLeaderboard.length === 3
);

var rFemale = project(g1, 'female', 'gross');
assert(
  '5 R + female 调用共享模块',
  rFemale.calledShared === true && rFemale.overlay.personalLeaderboard.length === 1
);

assert(
  '6 gross 结果与同一 match 的普通 detail 签名一致',
  sameSig(rAll.overlay.personalLeaderboard, sharedRows(g1, 'all', 'gross'))
);

var rNet = project(g1, 'all', 'net');
assert(
  '7 net 结果一致',
  rNet.calledShared === true &&
    sameSig(rNet.overlay.personalLeaderboard, sharedRows(g1, 'all', 'net'))
);

var g2 = fixtureG2();
assert(
  '8 G1 结果一致 / G2 结果一致',
  sameSig(project(g1, 'all', 'gross').overlay.personalLeaderboard, sharedRows(g1, 'all', 'gross')) &&
    sameSig(project(g2, 'all', 'gross').overlay.personalLeaderboard, sharedRows(g2, 'all', 'gross'))
);

var g3 = fixtureG3();
var g4 = fixtureG4();
assert(
  '9 G3 结果一致',
  sameSig(project(g3, 'all', 'gross').overlay.personalLeaderboard, sharedRows(g3, 'all', 'gross'))
);
assert(
  '10 G4 结果一致',
  sameSig(project(g4, 'all', 'gross').overlay.personalLeaderboard, sharedRows(g4, 'all', 'gross'))
);

var maleIds = rMale.overlay.personalLeaderboard.map(function (r) {
  return r.playerId;
});
var femaleIds = rFemale.overlay.personalLeaderboard.map(function (r) {
  return r.playerId;
});
assert(
  '12 未知性别过滤一致',
  maleIds.indexOf('u-unk') < 0 &&
    femaleIds.indexOf('u-unk') < 0 &&
    sameSig(rMale.overlay.personalLeaderboard, sharedRows(g1, 'male', 'gross')) &&
    sameSig(rFemale.overlay.personalLeaderboard, sharedRows(g1, 'female', 'gross'))
);

assert(
  '13 Series 使用同一个 personal-leaderboard-board',
  seriesJson.indexOf('personal-leaderboard-board') >= 0 &&
    (seriesWxml.split('<personal-leaderboard-board').length - 1) === 1 &&
    (detailWxml.split('<personal-leaderboard-board').length - 1) === 1 &&
    seriesJson.indexOf('/components/personal-leaderboard-board/index') >= 0
);

var sharedMount = seriesWxml.slice(
  seriesWxml.indexOf('standings.showSharedPersonalBoard'),
  seriesWxml.indexOf('standings.showTeamBoard === false')
);
assert(
  '14 行 DOM 不在 Series 手写复制',
  sharedMount.indexOf('<personal-leaderboard-board') >= 0 &&
    sharedMount.indexOf('leaderboard-row--personal') < 0 &&
    sharedMount.indexOf('item.genderIcon') < 0 &&
    sharedMount.indexOf('netScoreDisplay') < 0 &&
    seriesWxml.indexOf('class="leaderboard-row leaderboard-row--personal') < 0
);

assert(
  '15 已开赛展开组件与普通 detail 一致',
  /item\.expanded/.test(compWxml) &&
    /leaderboard-player-profile-panel/.test(compWxml) &&
    /openScorecard\.frontScore/.test(compWxml) &&
    /bind:rowtap="onStandingsPersonalLeaderboardRowTap"/.test(seriesWxml) &&
    /showSharedPersonalBoard/.test(seriesWxml) &&
    /<personal-leaderboard-board/.test(seriesWxml) &&
    /onStandingsPersonalLeaderboardRowTap[\s\S]{0,4000}buildTeamMatchScorecardView/.test(seriesJs)
);

assert(
  '16 主页使用真实 userId/playerId',
  /bind:profiletap="onStandingsScorecardProfileTap"/.test(seriesWxml) &&
    /personalProfileEntryMap/.test(adapterSrc) &&
    /row\.playerId \|\| row\.userId/.test(adapterSrc) &&
    /openPlayerProfileUtil\.openPlayerProfile/.test(seriesJs) &&
    /frozen\.entityId[\s\S]{0,180}frozen\.playerId/.test(seriesJs)
);

assert(
  '17 切换不重置纵向/横向滚动',
  /_reprojectStandingsBoardOverlay:[\s\S]{0,700}delete patch\.scrollTop/.test(seriesJs) &&
    /_reprojectStandingsBoardOverlay:[\s\S]{0,900}delete patch\.roundSelectorScrollLeft/.test(seriesJs) &&
    /_goSeriesManageStandingsRound:[\s\S]{0,500}_reprojectStandingsBoardOverlay/.test(seriesJs) &&
    !/_goSeriesManageStandingsRound:[\s\S]{0,800}scrollTop:/.test(seriesJs)
);

assert(
  '18 不写 Series/match/storage',
  !/setStorageSync|getStorageSync|upsertSeries|saveMatch|setMatch/.test(adapterSrc) &&
    !/projectSeriesStandingsPersonalBoard[\s\S]{0,200}wx\./.test(adapterSrc) &&
    /不写 Series \/ match \/ storage/.test(adapterSrc)
);

assert(
  '11 G1–G4 均走共享而非 roundBoard 个人生成',
  /buildPersonalLeaderboardBoard\(match/.test(adapterSrc) &&
    !/buildSeriesRoundBoardViewModel/.test(adapterSrc) &&
    /projected && projected.useShared/.test(seriesJs) &&
    /selection.view === 'team'\) \{[\s\S]{0,500}projectSeriesStandingsTeamBoard/.test(seriesJs)
);

assert(
  '19 普通 detail 文件零修改（本任务不引用改写）',
  /_buildLeaderboardViewForView[\s\S]{0,280}buildPersonalLeaderboardBoard/.test(detailJs) &&
    !/require\(.*pages\/detail/.test(adapterSrc) &&
    !/require\(.*pages\/detail/.test(seriesJs)
);

var unstarted = baseMatch({
  matchId: 'm-soon',
  status: 'registering',
  groups: [
    {
      groupId: 'g1',
      players: [{ userId: 'u-m1', competitionName: '红一', gender: 'male' }]
    }
  ],
  scoreData: {}
});
var soon = project(unstarted, 'all', 'gross');
assert(
  '20 未开赛改走 pending 共享板（B2），不再用手写特殊面板',
  soon.calledShared === false &&
    soon.useShared === true &&
    soon.reason === 'prestart' &&
    soon.overlay.prestartExpandMode === 'teeing_off_soon' &&
    !/TEEING OFF SOON/.test(adapterSrc) &&
    !/TEEING OFF SOON/.test(seriesJs)
);

assert(
  'TOT/team 未改 standingsViewModel 个人投影',
  !/personalLeaderboardBoard|showSharedPersonalBoard|buildPersonalLeaderboardBoard/.test(
    standingsVmSrc
  )
);

assert(
  'managed 核验失败沿用本轮比赛数据异常',
  (function () {
    var bad = adapter.projectSeriesStandingsPersonalBoard({
      selectedKey: 'r1',
      selection: { view: 'all', scoreType: 'gross' },
      series: { seriesId: 's1', publishToken: 'tok' },
      round: { roundId: 'r1', matchId: 'm-g1' },
      match: g1,
      indexLink: null
    });
    return (
      bad.calledShared === false &&
      bad.overlay.listEmptyText === '本轮比赛数据异常' &&
      bad.overlay.showSharedPersonalBoard === false
    );
  })()
);

assert(
  '关注明确关闭不伪造成功',
  /leaderboard-follow-enabled="\{\{false\}\}"/.test(seriesWxml) &&
    /personalFollowEnabled: false/.test(adapterSrc) &&
    /bind:follow="onStandingsScorecardFollow"/.test(seriesWxml) &&
    seriesWxml.indexOf('onStandingsScorecardFollowNoop') < 0
);

assert(
  '页面 overlay 不在 TOT/team 调用共享个人投影',
  /selectedKey === standingsViewModel.CUMULATIVE_KEY\) \{[\s\S]{0,500}sharedEmpty/.test(seriesJs) &&
    /selection.view === 'team'\) \{[\s\S]{0,400}projectSeriesStandingsTeamBoard/.test(seriesJs) &&
    !/selection.view === 'team'[\s\S]{0,400}projectSeriesStandingsPersonalBoard/.test(seriesJs)
);

if (fs.existsSync(baselinePath)) {
  var baseline = JSON.parse(read(baselinePath));
  var key = 'G1-LIVE|gross|all';
  if (baseline[key] && baseline[key].rows) {
    var live = boardSig(project(g1, 'all', 'gross').overlay.personalLeaderboard);
    var baseRows = baseline[key].rows.map(function (r) {
      return {
        pos: r.pos,
        playerId: r.playerId,
        identityKey: r.identityKey,
        name: r.name,
        gender: r.gender,
        scoreStr: r.scoreStr,
        thru: r.thru,
        hasScore: r.hasScore
      };
    });
    var liveLite = live.map(function (r) {
      return {
        pos: r.pos,
        playerId: r.playerId,
        identityKey: r.identityKey,
        name: r.name,
        gender: r.gender,
        scoreStr: r.scoreStr,
        thru: r.thru,
        hasScore: r.hasScore
      };
    });
    assert(
      '对照 A1 baseline G1-LIVE|gross|all',
      JSON.stringify(liveLite) === JSON.stringify(baseRows)
    );
  }
}

if (failures.length) {
  console.log('');
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
}
console.log('');
console.log('LBB1 selftest: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
