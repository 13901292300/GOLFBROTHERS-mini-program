/**
 * R-TEAM-B1：Series R 消费共享总杆球队榜
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/teamLeaderboardView.rtb1.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');

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

function asString(v) {
  return v == null ? '' : String(v);
}

function fillScores(n, stroke) {
  var out = [];
  for (var i = 0; i < 18; i++) out.push(i < n ? stroke : null);
  return out;
}

function pkRules(topN) {
  return { teamCompetition: { enabled: true, topN: topN == null ? 2 : topN } };
}

function teamGroupsTwo() {
  return [
    { id: 'red', name: '深圳湾高尔夫红队', sourceTeamLogo: '/assets/mock-avatars/mock-avatar-01.jpg' },
    { id: 'blue', name: '前海国际蓝队', sourceTeamLogo: '/assets/mock-avatars/mock-avatar-02.jpg' }
  ];
}

function usersG1() {
  return [
    { userId: 'u-m1', nickname: '红一', gender: 'male', matchTeamId: 'red', matchTeamName: '深圳湾高尔夫红队' },
    { userId: 'u-f1', nickname: '蓝女', gender: 'female', matchTeamId: 'blue', matchTeamName: '前海国际蓝队' },
    { userId: 'u-m2', nickname: '蓝二', gender: 'male', matchTeamId: 'blue', matchTeamName: '前海国际蓝队' },
    { userId: 'u-m3', nickname: '红三', gender: 'male', matchTeamId: 'red', matchTeamName: '深圳湾高尔夫红队' }
  ];
}

function baseMatch(patch) {
  return Object.assign(
    {
      matchId: 'm-rtb1',
      matchType: 'inter-team',
      status: 'ongoing',
      gameMode: '个人比杆赛',
      courseName: '测试球场',
      front9Course: 'A',
      back9Course: 'B',
      teamGroups: teamGroupsTwo(),
      scoringRules: pkRules(2),
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

function g1GroupPlayers() {
  return [
    { userId: 'u-m1', competitionName: '红一', gender: 'male', position: 1 },
    { userId: 'u-f1', competitionName: '蓝女', gender: 'female', position: 2 },
    { userId: 'u-m2', competitionName: '蓝二', gender: 'male', position: 4 },
    { userId: 'u-m3', competitionName: '红三', gender: 'male', position: 5 }
  ];
}

function fixtureG1Live() {
  return baseMatch({
    matchId: 'm-g1-live',
    status: 'ongoing',
    groups: [{ groupId: 'g1', groupName: '第1组', players: g1GroupPlayers() }],
    scoreData: {
      g1: {
        scoresByPlayer: {
          'u-m1': { scores: fillScores(9, 4) },
          'u-f1': { scores: fillScores(18, 4) },
          'u-m2': { scores: fillScores(12, 5) },
          'u-m3': { scores: fillScores(18, 3) }
        }
      }
    }
  });
}

function fixtureG1Unstarted() {
  return baseMatch({
    matchId: 'm-g1-unstarted',
    status: 'registering',
    groups: [{ groupId: 'g1', groupName: '第1组', players: g1GroupPlayers() }],
    scoreData: {}
  });
}

function fixtureG1Ties() {
  return baseMatch({
    matchId: 'm-g1-ties',
    status: 'finished',
    groups: [{ groupId: 'g1', groupName: '第1组', players: g1GroupPlayers() }],
    scoreData: {
      g1: {
        scoresByPlayer: {
          'u-m1': { scores: fillScores(18, 4) },
          'u-m3': { scores: fillScores(18, 4) },
          'u-f1': { scores: fillScores(18, 4) },
          'u-m2': { scores: fillScores(18, 4) }
        }
      }
    }
  });
}

function fixtureG1Empty() {
  return baseMatch({
    matchId: 'm-g1-empty',
    status: 'ongoing',
    groups: [{ groupId: 'g1', groupName: '第1组', players: g1GroupPlayers() }],
    scoreData: { g1: { scoresByPlayer: {} } }
  });
}

function fixtureG2() {
  return baseMatch({
    matchId: 'm-g2',
    gameMode: '四人四球比杆赛',
    groups: [{ groupId: 'g1', groupName: '第1组', players: g1GroupPlayers() }],
    scoreEntities: {
      g1: [
        {
          entityId: 'e-red',
          entityType: 'team',
          compositionMode: '2+2',
          teamGroupId: 'red',
          members: ['u-m1', 'u-m3']
        },
        {
          entityId: 'e-blue',
          entityType: 'team',
          compositionMode: '2+2',
          teamGroupId: 'blue',
          members: ['u-f1', 'u-m2']
        }
      ]
    },
    scoreData: {
      g1: {
        teamScoresByEntity: [
          { teamId: 'e-red', scores: fillScores(9, 4) },
          { teamId: 'e-blue', scores: fillScores(18, 4) }
        ]
      }
    }
  });
}

function fixtureG3() {
  var m = fixtureG2();
  m.matchId = 'm-g3';
  m.gameMode = '最佳球位比杆赛';
  m.scoreEntities = {
    g1: [
      {
        entityId: 'e-red',
        entityType: 'team',
        compositionMode: '4+0',
        teamGroupId: 'red',
        members: ['u-m1', 'u-m3']
      },
      {
        entityId: 'e-blue',
        entityType: 'team',
        compositionMode: '4+0',
        teamGroupId: 'blue',
        members: ['u-f1', 'u-m2']
      }
    ]
  };
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
        entityId: 'e-red',
        entityType: 'pair',
        compositionMode: '2+2',
        teamGroupId: 'red',
        members: ['u-m1', 'u-m3']
      },
      {
        entityId: 'e-blue',
        entityType: 'pair',
        compositionMode: '2+2',
        teamGroupId: 'blue',
        members: ['u-f1', 'u-m2']
      }
    ]
  };
  m.scoreData = {
    g1: {
      teamScoresByEntity: [
        { teamId: 'e-red', scores: fillScores(18, 4) },
        { teamId: 'e-blue', scores: fillScores(9, 5) }
      ]
    }
  };
  return m;
}

function headerSig(teams) {
  return (Array.isArray(teams) ? teams : [])
    .map(function (t) {
      return [
        asString(t && t.teamId),
        asString(t && t.pos),
        asString(t && t.teamName),
        String(t && t.grossTotal),
        asString(t && t.scoreStr),
        asString(t && t.scoreClass)
      ].join('|');
    })
    .join(';;');
}

function expandSig(teams) {
  return (Array.isArray(teams) ? teams : [])
    .map(function (t) {
      var players = Array.isArray(t && t.players) ? t.players : [];
      return asString(t && t.teamId) + ':' + players.map(function (p) {
        return [
          asString(p.scorecardKey || p.entityId || p.playerId),
          asString(p.name),
          asString(p.pos),
          asString(p.scoreStr),
          String(!!p.isCounting),
          String(!!p.isEntity)
        ].join('~');
      }).join(',');
    })
    .join(';;');
}

global.getApp = function () {
  return { getTheme: function () { return 'light'; }, globalData: {} };
};
global.wx = {
  showToast: function () {},
  showModal: function () {},
  navigateTo: function () {},
  getStorageSync: function () { return null; },
  setStorageSync: function () {},
  removeStorageSync: function () {},
  getSystemInfoSync: function () {
    return { windowWidth: 375, windowHeight: 667, statusBarHeight: 20 };
  }
};

var pageDef = null;
global.Page = function (def) {
  pageDef = def;
};

var loadErr = null;
try {
  require(path.join(detailDir, 'index.js'));
} catch (e) {
  loadErr = e;
}

function makePage() {
  var ctx = {};
  Object.keys(pageDef || {}).forEach(function (k) {
    if (typeof pageDef[k] === 'function') ctx[k] = pageDef[k];
  });
  ctx.data = {
    leaderboardScoreType: 'gross',
    openIndex: -1,
    matchId: '',
    scoringDisplay: []
  };
  ctx._viewerRemarkCtx = { viewer: '', rev: 0, map: {} };
  return ctx;
}

var teamLeaderboardView = require(seriesTestPaths.util('teamLeaderboardView.js'));
var teamLeaderboardHost = require(seriesTestPaths.util('teamLeaderboardHost.js'));
var adapter = require(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'));
var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));

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
    series: { seriesId: 's1', publishToken: 'tok', scoringRule: { mode: 'global_m' } },
    round: { roundId: rid, matchId: m.matchId },
    match: m,
    indexLink: { seriesId: 's1', roundId: rid, matchId: m.matchId }
  };
}

function pageTeams(match) {
  return makePage()._buildTeamLeaderboardView(match) || [];
}

function standaloneTeams(match) {
  return teamLeaderboardView.buildGrossTeamLeaderboardView(
    match,
    teamLeaderboardHost.createStandaloneHost()
  ) || [];
}

function seriesTeams(match, roundId) {
  var projected = adapter.projectSeriesStandingsTeamBoard(managedWrap(match, roundId));
  return (projected && projected.overlay && projected.overlay.teamRows) || [];
}

assert('Page captured', !loadErr && !!pageDef, loadErr && String(loadErr.message));

var groupsStore = require(path.join(utilsDir, 'groupsStore.js'));
groupsStore.buildLeaderboard = function () { return []; };
groupsStore.getGroups = function () { return []; };

var cases = [
  { name: 'G1-LIVE', match: fixtureG1Live() },
  { name: 'G1-unstarted', match: fixtureG1Unstarted() },
  { name: 'G1-ties', match: fixtureG1Ties() },
  { name: 'G1-empty', match: fixtureG1Empty() },
  { name: 'G2', match: fixtureG2() },
  { name: 'G3', match: fixtureG3() },
  { name: 'G4', match: fixtureG4() }
];

cases.forEach(function (c) {
  var page = pageTeams(c.match);
  var standalone = standaloneTeams(c.match);
  var series = seriesTeams(c.match, 'r1');
  assert(
    'host===page header ' + c.name,
    headerSig(page) === headerSig(standalone),
    headerSig(page) + ' !== ' + headerSig(standalone)
  );
  assert(
    'series===page header ' + c.name,
    headerSig(page) === headerSig(series),
    headerSig(page) + ' !== ' + headerSig(series)
  );
  assert(
    'series===page expand ' + c.name,
    expandSig(page) === expandSig(series),
    expandSig(page) + ' !== ' + expandSig(series)
  );
});

var liveSeries = adapter.projectSeriesStandingsTeamBoard(managedWrap(fixtureG1Live(), 'r1'));
assert('R calls shared', liveSeries && liveSeries.calledShared === true && liveSeries.reason === 'shared');
assert(
  'R label is 总杆 · 球队',
  liveSeries && liveSeries.overlay && liveSeries.overlay.leaderboardViewLabel === '总杆 · 球队'
);
assert(
  'R full names',
  liveSeries.overlay.teamRows.some(function (t) { return t.teamName === '深圳湾高尔夫红队'; }) &&
    liveSeries.overlay.teamRows.some(function (t) { return t.teamName === '前海国际蓝队'; })
);
assert(
  'R TOTAL/TO PAR not dash for LIVE',
  liveSeries.overlay.teamRows.some(function (t) {
    return t.hasScore === true && t.scoreStr !== '-' && t.grossTotal !== '-' && t.grossTotal !== 0;
  })
);
assert(
  'R has no TOT/Top M copy',
  liveSeries.overlay.teamRows.every(function (t) {
    var blob = JSON.stringify(t);
    return blob.indexOf('Top M') < 0 && blob.indexOf('累计') < 0;
  })
);

var totVm = standingsVm.buildSeriesStandingsViewModel({
  series: { seriesId: 's1', scoringRule: { mode: 'global_m' }, participants: [
    { seriesParticipantId: 'team:a', nameSnapshot: '甲队' },
    { seriesParticipantId: 'team:b', nameSnapshot: '乙队' }
  ] },
  selectedKey: 'cumulative',
  roundStates: [{ roundId: 'r1', index: 1, label: 'R1', statusToken: 'live' }],
  standingsResult: {
    participantRows: [
      {
        seriesParticipantId: 'team:a',
        rank: 1,
        grossTotalValue: 200,
        toParValue: -4,
        allEntries: [],
        roundLineups: []
      },
      {
        seriesParticipantId: 'team:b',
        rank: 2,
        grossTotalValue: 210,
        toParValue: 6,
        allEntries: [],
        roundLineups: []
      }
    ]
  }
});
var totSig = standingsVm.mainBoardSignature(totVm);
var totVm2 = standingsVm.buildSeriesStandingsViewModel({
  series: totVm && { seriesId: 's1', scoringRule: { mode: 'global_m' }, participants: [
    { seriesParticipantId: 'team:a', nameSnapshot: '甲队' },
    { seriesParticipantId: 'team:b', nameSnapshot: '乙队' }
  ] },
  selectedKey: 'cumulative',
  roundStates: [{ roundId: 'r1', index: 1, label: 'R1', statusToken: 'live' }],
  standingsResult: {
    participantRows: [
      {
        seriesParticipantId: 'team:a',
        rank: 1,
        grossTotalValue: 200,
        toParValue: -4,
        allEntries: [],
        roundLineups: []
      },
      {
        seriesParticipantId: 'team:b',
        rank: 2,
        grossTotalValue: 210,
        toParValue: 6,
        allEntries: [],
        roundLineups: []
      }
    ]
  }
});
assert('TOT signature stable', totSig === standingsVm.mainBoardSignature(totVm2) && totVm.selectedKey === 'total');

var rLive = seriesTeams(fixtureG1Live(), 'r1');
assert(
  'R signature !== TOT cumulative',
  headerSig(rLive) !== totSig && headerSig(rLive).indexOf('深圳湾高尔夫红队') >= 0
);

var totCall = adapter.projectSeriesStandingsTeamBoard({
  selectedKey: 'cumulative',
  match: fixtureG1Live()
});
assert('TOT does not call shared', totCall && totCall.reason === 'tot' && totCall.calledShared === false);

var failCall = adapter.projectSeriesStandingsTeamBoard({
  selectedKey: 'r1',
  series: { seriesId: 's1', publishToken: 'tok' },
  round: { roundId: 'r1', matchId: 'x' },
  match: fixtureG1Live(),
  indexLink: null
});
assert(
  'managed fail gate',
  failCall && failCall.reason === 'managed_fail' && failCall.calledShared === false
);

var unstarted = adapter.projectSeriesStandingsTeamBoard(managedWrap(fixtureG1Unstarted(), 'r1'));
assert(
  'unstarted allowed TEEING OFF SOON',
  unstarted.overlay.teamRows.some(function (t) {
    return t.expandStatusHint === 'TEEING OFF SOON';
  })
);

var ties = seriesTeams(fixtureG1Ties(), 'r1');
assert(
  'tie uses T prefix',
  ties.length >= 2 && String(ties[0].pos).charAt(0) === 'T' && ties[0].pos === ties[1].pos
);

var g2 = seriesTeams(fixtureG2(), 'r1');
assert(
  'G2 expand is entity',
  g2.some(function (t) {
    return t.players.some(function (p) { return p.isEntity === true && p.entityId; });
  })
);
var g1Rn = seriesTeams(fixtureG1Live(), 'r1');
assert(
  'G1 Rn expand is player not entity',
  g1Rn.some(function (t) {
    return t.players.some(function (p) {
      return p.isEntity !== true && !!p.playerId;
    });
  }) &&
    g1Rn.every(function (t) {
      return t.players.every(function (p) { return p.isEntity !== true; });
    })
);
var g4Rn = seriesTeams(fixtureG4(), 'r1');
assert(
  'G4 Rn expand is entity/pair from shared builder',
  g4Rn.some(function (t) {
    return t.players.some(function (p) {
      return p.isEntity === true && p.entityId;
    });
  })
);

var seriesJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var seriesWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');
var adapterSrc = fs.readFileSync(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'), 'utf8');
var vmSrc = fs.readFileSync(path.join(seriesDir, 'seriesStandingsViewModel.js'), 'utf8');
var rebuildFn = (function () {
  var re = /_rebuildStandingsProjection:\s*function\s*\([^)]*\)\s*\{[\s\S]*?\n  \},/;
  var m = seriesJs.match(re);
  return m ? m[0] : '';
})();

assert(
  'overlay wires live board for R; adapter remains for TOT',
  seriesJs.indexOf('seriesLiveLeaderboardAdapter.projectSeriesRnLiveLeaderboard') >= 0 &&
    seriesJs.indexOf('seriesTeamLeaderboardAdapter.projectSeriesStandingsTeamBoard') >= 0 &&
    /isCumulativeStandingsKey\(selectedKey\)/.test(seriesJs)
);
assert(
  'TOT overlay still page-private',
  /isCumulativeStandingsKey\(selectedKey\)[\s\S]{0,800}buildTotTopMDescription/.test(seriesJs)
);
assert('adapter has no storage write', !/setStorageSync/.test(adapterSrc));
assert(
  'ST-JUMP-4 rebuild still holds host height',
  rebuildFn.indexOf('contentHostMinHeight') >= 0 &&
    rebuildFn.indexOf('updateScrollFillerHeight') < 0 &&
    rebuildFn.indexOf('scrollTop:') < 0 &&
    rebuildFn.indexOf('scheduleStandingsBoardSwitchMeasure') < 0
);
assert(
  'TOT team card WXML unchanged skeleton',
  seriesWxml.indexOf('team.teamName') >= 0 &&
    seriesWxml.indexOf('team.grossTotal') >= 0 &&
    seriesWxml.indexOf('team.scoreStr') >= 0 &&
    seriesWxml.indexOf('standings.useLiveLeaderboard') >= 0
);
assert(
  'VM still owns TOT teamRows',
  vmSrc.indexOf('buildGrossTeamLeaderboardView') < 0 &&
    vmSrc.indexOf('teamLeaderboardView') < 0
);

if (failures.length) {
  console.log('');
  failures.slice(0, 16).forEach(function (f) {
    console.log('  - ' + f);
  });
}
console.log('');
console.log('RTB1 selftest: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
