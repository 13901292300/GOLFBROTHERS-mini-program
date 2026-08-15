/**
 * R-TEAM-A1：普通单场总杆球队榜共享投影
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/teamLeaderboardView.rta1.selftest.js --capture
 *   node scripts/teamLeaderboardView.rta1.selftest.js
 *
 * --capture：从当前普通 detail._buildTeamLeaderboardView 冻结签名（接线前必须先跑）
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var baselinePath = path.join(__dirname, 'teamLeaderboardView.rta1.baseline.json');

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
  return {
    teamCompetition: {
      enabled: true,
      topN: topN == null ? 2 : topN
    }
  };
}

function teamGroupsTwo() {
  return [
    { id: 'red', name: '深圳湾高尔夫红队', sourceTeamLogo: '/assets/mock-avatars/mock-avatar-01.jpg' },
    { id: 'blue', name: '前海国际蓝队', sourceTeamLogo: '/assets/mock-avatars/mock-avatar-02.jpg' }
  ];
}

function usersG1() {
  return [
    { userId: 'u-m1', nickname: '红一', gender: 'male', matchTeamId: 'red', matchTeamName: '深圳湾高尔夫红队', flag: 'cn', country: 'CHN', age: 32 },
    { userId: 'u-f1', nickname: '蓝女', gender: 'female', matchTeamId: 'blue', matchTeamName: '前海国际蓝队', flag: 'jp', country: 'JPN', age: 28 },
    { userId: 'u-m2', nickname: '蓝二', gender: 'male', matchTeamId: 'blue', matchTeamName: '前海国际蓝队', flag: 'kr', country: 'KOR', age: 40 },
    { userId: 'u-m3', nickname: '红三', gender: 'male', matchTeamId: 'red', matchTeamName: '深圳湾高尔夫红队', flag: 'us', country: 'USA', age: 21 }
  ];
}

function baseMatch(patch) {
  return Object.assign(
    {
      matchId: 'm-rta1',
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
    { userId: 'u-m1', competitionName: '红一', gender: 'male', position: 1, flag: 'cn', country: 'CHN', age: 32 },
    { userId: 'u-f1', competitionName: '蓝女', gender: 'female', position: 2, flag: 'jp', country: 'JPN', age: 28 },
    { userId: 'u-m2', competitionName: '蓝二', gender: 'male', position: 4, flag: 'kr', country: 'KOR', age: 40 },
    { userId: 'u-m3', competitionName: '红三', gender: 'male', position: 5, flag: 'us', country: 'USA', age: 21 }
  ];
}

function fixtureG1Unstarted() {
  return baseMatch({
    matchId: 'm-g1-unstarted',
    status: 'registering',
    groups: [
      {
        groupId: 'g1',
        groupName: '第1组',
        players: g1GroupPlayers()
      }
    ],
    scoreData: {}
  });
}

function fixtureG1Live() {
  return baseMatch({
    matchId: 'm-g1-live',
    status: 'ongoing',
    groups: [
      {
        groupId: 'g1',
        groupName: '第1组',
        players: g1GroupPlayers()
      }
    ],
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

function fixtureG1Finished() {
  var m = fixtureG1Live();
  m.matchId = 'm-g1-fin';
  m.status = 'finished';
  m.scoreData = {
    g1: {
      scoresByPlayer: {
        'u-m1': { scores: fillScores(18, 4) },
        'u-f1': { scores: fillScores(18, 4) },
        'u-m2': { scores: fillScores(18, 5) },
        'u-m3': { scores: fillScores(18, 3) }
      }
    }
  };
  return m;
}

function fixtureG1EmptyScores() {
  return baseMatch({
    matchId: 'm-g1-empty',
    status: 'ongoing',
    groups: [
      {
        groupId: 'g1',
        groupName: '第1组',
        players: g1GroupPlayers()
      }
    ],
    scoreData: { g1: { scoresByPlayer: {} } }
  });
}

function fixtureG1PkOff() {
  var m = fixtureG1Live();
  m.matchId = 'm-g1-pkoff';
  m.scoringRules = { teamCompetition: { enabled: false, topN: 2 } };
  return m;
}

function fixtureG1Ties() {
  return baseMatch({
    matchId: 'm-g1-ties',
    status: 'finished',
    groups: [
      {
        groupId: 'g1',
        groupName: '第1组',
        players: g1GroupPlayers()
      }
    ],
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

function fixtureG1MultiTeam() {
  return baseMatch({
    matchId: 'm-g1-multi',
    status: 'finished',
    teamGroups: [
      { id: 'red', name: '深圳湾高尔夫红队' },
      { id: 'blue', name: '前海国际蓝队' },
      { id: 'green', name: '南山绿队' }
    ],
    registerInfo: {
      users: usersG1().concat([
        { userId: 'u-g1', nickname: '绿一', gender: 'male', matchTeamId: 'green', matchTeamName: '南山绿队' },
        { userId: 'u-g2', nickname: '绿二', gender: 'female', matchTeamId: 'green', matchTeamName: '南山绿队' }
      ])
    },
    groups: [
      {
        groupId: 'g1',
        groupName: '第1组',
        players: g1GroupPlayers().concat([
          { userId: 'u-g1', competitionName: '绿一', gender: 'male', position: 6 },
          { userId: 'u-g2', competitionName: '绿二', gender: 'female', position: 7 }
        ])
      }
    ],
    scoreData: {
      g1: {
        scoresByPlayer: {
          'u-m1': { scores: fillScores(18, 4) },
          'u-m3': { scores: fillScores(18, 3) },
          'u-f1': { scores: fillScores(18, 5) },
          'u-m2': { scores: fillScores(18, 5) },
          'u-g1': { scores: fillScores(18, 4) },
          'u-g2': { scores: fillScores(18, 6) }
        }
      }
    }
  });
}

function fixtureG1Unnamed() {
  var m = fixtureG1Live();
  m.matchId = 'm-g1-unnamed';
  m.teamGroups = [
    { id: 'red', name: '' },
    { id: 'blue', name: '   ' }
  ];
  return m;
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
        players: g1GroupPlayers()
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
        members: entityMembers(['u-m1', 'u-m3'])
      },
      {
        entityId: 'e-blue',
        entityType: 'team',
        compositionMode: '4+0',
        teamGroupId: 'blue',
        members: entityMembers(['u-f1', 'u-m2'])
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

function playerSig(p) {
  if (!p) return null;
  return {
    pos: p.pos == null ? '' : String(p.pos),
    playerId: asString(p.playerId),
    userId: asString(p.userId),
    entityId: asString(p.entityId),
    scorecardKey: asString(p.scorecardKey),
    name: asString(p.name),
    nickname: asString(p.nickname),
    gender: asString(p.gender),
    genderIcon: asString(p.genderIcon),
    genderClass: asString(p.genderClass),
    badgeTeamId: asString(p.badgeTeamId),
    avatar: asString(p.avatar),
    groupId: asString(p.groupId),
    matchTeamId: asString(p.matchTeamId),
    teamGroupId: asString(p.teamGroupId),
    isEntity: p.isEntity === true,
    isTeam: p.isTeam === true,
    kind: asString(p.kind),
    compositionMode: asString(p.compositionMode),
    grossTotal: p.grossTotal == null ? null : Number(p.grossTotal),
    toPar: p.toPar == null ? null : Number(p.toPar),
    total: p.total == null ? null : Number(p.total),
    diff: p.diff == null ? null : Number(p.diff),
    hasScore: p.hasScore === true,
    scoreStr: asString(p.scoreStr),
    scoreClass: asString(p.scoreClass),
    thru: asString(p.thru),
    isCounting: p.isCounting === true,
    scoreSource: asString(p.scoreSource),
    members: Array.isArray(p.members)
      ? p.members.map(function (m) {
          if (!m) return null;
          return {
            playerId: asString(m.playerId),
            userId: asString(m.userId),
            name: asString(m.name || m.displayName),
            gender: asString(m.gender),
            genderIcon: asString(m.genderIcon),
            genderClass: asString(m.genderClass),
            badgeTeamId: asString(m.badgeTeamId)
          };
        })
      : []
  };
}

function teamSig(team) {
  if (!team) return null;
  return {
    pos: team.pos == null ? '' : String(team.pos),
    teamId: asString(team.teamId),
    teamName: asString(team.teamName),
    grossTotal: team.grossTotal == null ? null : Number(team.grossTotal),
    toPar: team.toPar == null ? null : Number(team.toPar),
    total: team.total == null ? null : Number(team.total),
    hasScore: team.hasScore === true,
    scoreStr: asString(team.scoreStr),
    scoreClass: asString(team.scoreClass),
    scoringPlayersCount: team.scoringPlayersCount == null ? null : Number(team.scoringPlayersCount),
    expandRoster: Array.isArray(team.players) ? team.players.map(playerSig) : []
  };
}

function boardSig(name, scoreType, teams) {
  var list = Array.isArray(teams) ? teams : [];
  return {
    name: name,
    scoreType: scoreType,
    teamCount: list.length,
    empty: list.length === 0,
    teams: list.map(teamSig)
  };
}

function allCases() {
  return [
    { name: 'G1-unstarted', match: fixtureG1Unstarted() },
    { name: 'G1-LIVE', match: fixtureG1Live() },
    { name: 'G1-finished', match: fixtureG1Finished() },
    { name: 'G1-empty-scores', match: fixtureG1EmptyScores() },
    { name: 'G1-pk-off', match: fixtureG1PkOff() },
    { name: 'G1-ties', match: fixtureG1Ties() },
    { name: 'G1-multi-team', match: fixtureG1MultiTeam() },
    { name: 'G1-unnamed', match: fixtureG1Unnamed() },
    { name: 'G2-foursome', match: fixtureG2() },
    { name: 'G3-best-ball', match: fixtureG3() }
  ];
}

function firstDiff(a, b, prefix) {
  var p = prefix || '';
  if (a === b) return '';
  if (a == null || b == null || typeof a !== typeof b) {
    return p + ' ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b);
  }
  if (typeof a !== 'object') {
    return p + ' ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b);
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return p + ' array mismatch';
  }
  if (Array.isArray(a)) {
    if (a.length !== b.length) return p + '.length ' + a.length + ' !== ' + b.length;
    for (var i = 0; i < a.length; i++) {
      var d = firstDiff(a[i], b[i], p + '[' + i + ']');
      if (d) return d;
    }
    return '';
  }
  var keys = Object.keys(a).concat(Object.keys(b)).filter(function (k, i, arr) {
    return arr.indexOf(k) === i;
  });
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    var dd = firstDiff(a[key], b[key], p + '.' + key);
    if (dd) return dd;
  }
  return '';
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

function makePage(scoreType) {
  var ctx = {};
  Object.keys(pageDef || {}).forEach(function (k) {
    if (typeof pageDef[k] === 'function') ctx[k] = pageDef[k];
  });
  ctx.data = {
    leaderboardScoreType: scoreType === 'net' ? 'net' : 'gross',
    openIndex: -1,
    matchId: '',
    scoringDisplay: []
  };
  ctx._viewerRemarkCtx = { viewer: '', rev: 0, map: {} };
  return ctx;
}

function pageTeams(match, scoreType) {
  var page = makePage(scoreType);
  return page._buildTeamLeaderboardView(match) || [];
}

function sharedTeams(match, scoreType) {
  if (scoreType === 'net') return pageTeams(match, 'net');
  var shared = require(path.join(utilsDir, 'teamLeaderboardView.js'));
  var page = makePage('gross');
  return shared.buildGrossTeamLeaderboardView(match, page) || [];
}

function captureAll(buildTeams) {
  var out = {};
  allCases().forEach(function (c) {
    out[c.name + '|gross'] = boardSig(c.name, 'gross', buildTeams(c.match, 'gross'));
  });
  out['G1-LIVE|net'] = boardSig('G1-LIVE', 'net', buildTeams(fixtureG1Live(), 'net'));
  return out;
}

assert('Page captured', !loadErr && !!pageDef && typeof pageDef._buildTeamLeaderboardView === 'function', loadErr && String(loadErr.message));

var groupsStore = require(path.join(utilsDir, 'groupsStore.js'));
groupsStore.buildLeaderboard = function () {
  return [];
};
groupsStore.getGroups = function () {
  return [];
};

var captureMode = process.argv.indexOf('--capture') >= 0;

if (captureMode) {
  var before = captureAll(pageTeams);
  fs.writeFileSync(baselinePath, JSON.stringify(before, null, 2), 'utf8');
  console.log('CAPTURED ' + Object.keys(before).length + ' signatures -> ' + baselinePath);
  var sharedNow = captureAll(sharedTeams);
  var mismatch = 0;
  Object.keys(before).forEach(function (key) {
    if (key.indexOf('|net') >= 0) return;
    var diff = firstDiff(before[key], sharedNow[key], key);
    if (diff) {
      mismatch += 1;
      console.log('SHARED_GAP  ' + diff);
    }
  });
  console.log('shared vs detail gaps: ' + mismatch + '/' + Object.keys(before).filter(function (k) {
    return k.indexOf('|net') < 0;
  }).length);
  console.log('RTA1 capture: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}

if (!fs.existsSync(baselinePath)) {
  assert('baseline exists', false, 'run with --capture before wiring detail');
  console.log('RTA1 selftest: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(1);
}

var baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
var afterPage = captureAll(pageTeams);
var afterShared = captureAll(sharedTeams);

Object.keys(baseline).forEach(function (key) {
  assert(
    'before===after page ' + key,
    !firstDiff(baseline[key], afterPage[key], key),
    firstDiff(baseline[key], afterPage[key], key)
  );
  if (key.indexOf('|net') >= 0) return;
  assert(
    'before===after shared ' + key,
    !firstDiff(baseline[key], afterShared[key], key),
    firstDiff(baseline[key], afterShared[key], key)
  );
});

var detailJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');
var detailWxml = fs.readFileSync(path.join(detailDir, 'index.wxml'), 'utf8');
var detailWxss = fs.readFileSync(path.join(detailDir, 'index.wxss'), 'utf8');
var liveWxml = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'components', 'live-leaderboard-board', 'index.wxml'),
  'utf8'
);
var sharedSrc = fs.readFileSync(path.join(utilsDir, 'teamLeaderboardView.js'), 'utf8');
var seriesVm = fs.readFileSync(path.join(seriesDir, 'seriesStandingsViewModel.js'), 'utf8');

assert(
  'detail requires shared module',
  /teamLeaderboardView/.test(detailJs) &&
    /buildGrossTeamLeaderboardView/.test(detailJs)
);

assert(
  'gross path is thin wrapper',
  /_buildTeamLeaderboardView\(match\) \{[\s\S]{0,400}buildGrossTeamLeaderboardView/.test(detailJs)
);

assert(
  'net path stays page-private',
  /_buildTeamLeaderboardView\(match\) \{[\s\S]{0,250}_buildNetTeamLeaderboardView/.test(detailJs) &&
    /_buildNetTeamLeaderboardView\(match\) \{/.test(detailJs)
);

assert(
  'page private entity team board deleted',
  !/_buildEntityTeamLeaderboardView\s*\(/.test(detailJs)
);

assert(
  'no dual-run G1 loop in page method',
  !/_buildTeamLeaderboardView\(match\) \{[\s\S]{0,800}_buildGroupPlayerLookup/.test(detailJs)
);

assert(
  'team card WXML extracted to live-leaderboard-board',
  liveWxml.indexOf('team.teamName') >= 0 &&
    liveWxml.indexOf('team.grossTotal') >= 0 &&
    liveWxml.indexOf('team.scoreStr') >= 0 &&
    detailWxml.indexOf('<live-leaderboard-board') >= 0 &&
    detailWxml.indexOf('team.grossTotal') < 0
);

assert(
  'shared has no Series special-case',
  !/seriesContext|seriesId|isSeries|\bTOT\b|managedMatch/.test(sharedSrc)
);

assert(
  'shared has no storage write',
  !/setStorageSync|wx\./.test(sharedSrc)
);

assert(
  'Series standings not wired',
  !/teamLeaderboardView/.test(seriesVm) &&
    !/buildGrossTeamLeaderboardView/.test(seriesVm)
);

var sharedMod = require(path.join(utilsDir, 'teamLeaderboardView.js'));
assert(
  'exports builder',
  typeof sharedMod.buildGrossTeamLeaderboardView === 'function' &&
    typeof sharedMod.buildTeamLeaderboardTeamMap === 'function' &&
    typeof sharedMod.buildCompetitionRanking === 'function' &&
    typeof sharedMod.teamLeaderboardSignature === 'function'
);

var live = afterPage['G1-LIVE|gross'];
assert(
  'G1 LIVE full team names',
  live &&
    live.teams.some(function (t) { return t.teamName === '深圳湾高尔夫红队'; }) &&
    live.teams.some(function (t) { return t.teamName === '前海国际蓝队'; })
);
assert(
  'G1 LIVE has TOTAL/TO PAR',
  live &&
    live.teams.some(function (t) {
      return t.hasScore === true && t.scoreStr !== '-' && t.grossTotal != null;
    })
);

var ties = afterPage['G1-ties|gross'];
assert(
  'tie ranking uses T prefix',
  ties &&
    ties.teams.length >= 2 &&
    ties.teams[0].pos.charAt(0) === 'T' &&
    ties.teams[0].pos === ties.teams[1].pos
);

var emptyScores = afterPage['G1-empty-scores|gross'];
assert(
  'empty scores stay dash',
  emptyScores &&
    emptyScores.teams.every(function (t) {
      return t.scoreStr === '-' && t.hasScore === false;
    })
);

var g2 = afterPage['G2-foursome|gross'];
assert(
  'G2 expand is entity not player',
  g2 &&
    g2.teams.some(function (t) {
      return t.expandRoster.some(function (p) {
        return p.isEntity === true && p.entityId && !p.playerId;
      });
    })
);

var g3 = afterPage['G3-best-ball|gross'];
assert(
  'G3 expand is entity not player',
  g3 &&
    g3.teams.some(function (t) {
      return t.expandRoster.some(function (p) {
        return p.isEntity === true && p.entityId;
      });
    })
);

var multi = afterPage['G1-multi-team|gross'];
assert(
  'multi team has 3 sides',
  multi && multi.teamCount === 3 &&
    multi.teams.some(function (t) { return t.teamName === '南山绿队'; })
);

var unnamed = afterPage['G1-unnamed|gross'];
assert(
  'unnamed teams use 球队N fallback',
  unnamed &&
    unnamed.teams.some(function (t) { return t.teamName === '球队1'; }) &&
    unnamed.teams.some(function (t) { return t.teamName === '球队2'; })
);

assert(
  'team card wxss still page-owned',
  /team-leaderboard|leaderboard-row/.test(detailWxss) || /teamName/.test(detailWxml)
);

if (failures.length) {
  console.log('');
  failures.slice(0, 16).forEach(function (f) {
    console.log('  - ' + f);
  });
}
console.log('');
console.log('RTA1 selftest: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
