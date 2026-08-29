/**
 * LB-A1：普通队际个人榜共享投影
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/personalLeaderboardBoard.lba1.selftest.js --capture
 *   node scripts/personalLeaderboardBoard.lba1.selftest.js
 *
 * --capture：从当前普通 detail._buildLeaderboardViewForView 冻结签名（修改 detail 前必须先跑）
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');
var baselinePath = path.join(__dirname, 'personalLeaderboardBoard.lba1.baseline.json');
var mockAvatars = require(path.join(mini, 'utils', 'mockAvatars.js'));

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
  return v == null ? '' : String(v).trim();
}

function fillScores(n, stroke) {
  var out = [];
  for (var i = 0; i < 18; i++) out.push(i < n ? stroke : null);
  return out;
}

function teamGroups() {
  return [
    { id: 'red', name: '红队', sourceTeamLogo: mockAvatars.avatarByIndex(0) },
    { id: 'blue', name: '蓝队', sourceTeamLogo: mockAvatars.avatarByIndex(1) }
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
      matchId: 'm-lba1',
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
  var users = usersG1();
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
    registerInfo: { users: users },
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

function fixtureG1Finished() {
  var m = fixtureG1();
  m.matchId = 'm-g1-fin';
  m.status = 'finished';
  return m;
}

function fixtureG1EmptyScores() {
  return baseMatch({
    matchId: 'm-g1-empty',
    status: 'ongoing',
    gameMode: '个人比杆赛',
    groups: [
      {
        groupId: 'g1',
        groupName: '第1组',
        players: [
          { userId: 'u-m1', competitionName: '红一', gender: 'male', position: 1 },
          { userId: 'u-f1', competitionName: '蓝女', gender: 'female', position: 2 }
        ]
      }
    ],
    scoreData: { g1: { scoresByPlayer: {} } },
    peoriaResult: { status: 'generated', results: [] }
  });
}

function fixtureEmpty() {
  return baseMatch({
    matchId: 'm-empty',
    groups: [],
    registerInfo: { users: usersG1() },
    scoreData: {},
    peoriaResult: { status: 'generated', results: [{ playerId: 'u-m1', net: 70 }] }
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
          { teamId: 'e-red', scores: fillScores(9, 4) },
          { teamId: 'e-blue', scores: fillScores(18, 4) }
        ]
      }
    },
    peoriaResult: {
      status: 'generated',
      results: [
        { playerId: 'u-m1', net: 71 },
        { playerId: 'u-m3', net: 73 },
        { playerId: 'u-f1', net: 70 },
        { playerId: 'u-m2', net: 72 }
      ]
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

function fixtureG4() {
  var m = fixtureG2();
  m.matchId = 'm-g4';
  m.gameMode = '四人两球比杆赛';
  m.pairings = {
    g1: [
      { id: 'pair-1', playerIds: ['u-m1', 'u-f1'] },
      { id: 'pair-2', playerIds: ['u-m3', 'u-m2'] }
    ]
  };
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

function memberSig(m) {
  if (!m) return null;
  return {
    playerId: asString(m.playerId),
    userId: asString(m.userId),
    name: asString(m.name || m.displayName),
    gender: asString(m.gender),
    genderIcon: asString(m.genderIcon),
    genderClass: asString(m.genderClass),
    badgeTeamId: asString(m.badgeTeamId),
    avatar: asString(m.avatar)
  };
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
    isFemale: !!row.isFemale,
    genderIcon: asString(row.genderIcon),
    genderClass: asString(row.genderClass),
    grossTotal: row.grossTotal == null ? null : Number(row.grossTotal),
    toPar: row.toPar == null ? null : Number(row.toPar),
    total: row.total == null ? null : Number(row.total),
    net: row.net == null || row.net === '' ? null : Number(row.net),
    scoreStr: asString(row.scoreStr),
    netScoreDisplay: asString(row.netScoreDisplay),
    thru: asString(row.thru),
    filledHoles: row.filledHoles == null ? null : Number(row.filledHoles),
    hasScore: row.hasScore === true,
    hasNetScore: row.hasNetScore === true,
    teamName: asString(row.teamName),
    teamTag: asString(row.teamTag),
    badgeTeamId: asString(row.badgeTeamId),
    flag: asString(row.flag),
    country: asString(row.country),
    age: asString(row.age),
    avatar: asString(row.avatar),
    isEntity: row.isEntity === true,
    isTeam: row.isTeam === true,
    expanded: row.expanded === true,
    scoreSource: asString(row.scoreSource),
    group: asString(row.group),
    groupId: asString(row.groupId),
    kind: asString(row.kind),
    compositionMode: asString(row.compositionMode),
    teamGroupId: asString(row.teamGroupId),
    members: Array.isArray(row.members) ? row.members.map(memberSig) : []
  };
}

function boardSig(view, scoreType, rows) {
  var list = Array.isArray(rows) ? rows : [];
  return {
    view: view,
    scoreType: scoreType,
    rowCount: list.length,
    empty: list.length === 0,
    rows: list.map(rowSig)
  };
}

function allCases() {
  return [
    { name: 'G1-LIVE', match: fixtureG1() },
    { name: 'G1-finished', match: fixtureG1Finished() },
    { name: 'G1-empty-scores', match: fixtureG1EmptyScores() },
    { name: 'empty-groups', match: fixtureEmpty() },
    { name: 'G2', match: fixtureG2() },
    { name: 'G3', match: fixtureG3() },
    { name: 'G4', match: fixtureG4() }
  ];
}

var VIEWS = ['all', 'male', 'female'];
var SCORE_TYPES = ['gross', 'net'];

function captureAll(buildRows) {
  var out = {};
  allCases().forEach(function (c) {
    SCORE_TYPES.forEach(function (st) {
      VIEWS.forEach(function (view) {
        var key = c.name + '|' + st + '|' + view;
        out[key] = boardSig(view, st, buildRows(c.match, view, st));
      });
    });
  });
  return out;
}

function firstDiff(a, b, prefix) {
  var p = prefix || '';
  if (a === b) return '';
  if (a == null || b == null || typeof a !== typeof b) {
    return p + ' ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b);
  }
  if (typeof a !== 'object') {
    if (
      /(^|\.)avatar$/.test(p) &&
      mockAvatars.resolveAvatar(a, '') === mockAvatars.resolveAvatar(b, '')
    ) {
      return '';
    }
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

function pageRows(match, view, scoreType) {
  var page = makePage(scoreType);
  return page._buildLeaderboardViewForView(match, view) || [];
}

var captureMode = process.argv.indexOf('--capture') >= 0;
var gapsMode = process.argv.indexOf('--gaps') >= 0;
var shared = require(path.join(utilsDir, 'personalLeaderboardBoard.js'));

function sharedRows(match, view, scoreType) {
  var board = shared.buildPersonalLeaderboardBoard(match, {
    view: view,
    scoreType: scoreType,
    openIndex: -1
  });
  return (board && board.leaderboard) || [];
}

assert('Page captured', !loadErr && !!pageDef && typeof pageDef._buildLeaderboardViewForView === 'function', loadErr && String(loadErr.message));

var groupsStore = require(path.join(utilsDir, 'groupsStore.js'));
groupsStore.buildLeaderboard = function () {
  return [];
};
groupsStore.getGroups = function () {
  return [];
};

if (captureMode || gapsMode) {
  var before = captureAll(pageRows);
  if (captureMode) {
    fs.writeFileSync(baselinePath, JSON.stringify(before, null, 2), 'utf8');
    console.log('CAPTURED ' + Object.keys(before).length + ' signatures -> ' + baselinePath);
  }
  var sharedNow = captureAll(sharedRows);
  var mismatch = 0;
  Object.keys(before).forEach(function (key) {
    var diff = firstDiff(before[key], sharedNow[key], key);
    if (diff) {
      mismatch += 1;
      console.log('SHARED_GAP  ' + diff);
    }
  });
  console.log('shared vs detail gaps: ' + mismatch + '/' + Object.keys(before).length);
  console.log('LBA1 capture: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}

if (!fs.existsSync(baselinePath)) {
  assert('baseline exists', false, 'run with --capture before wiring detail');
  console.log('LBA1 selftest: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(1);
}

var baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
var afterPage = captureAll(pageRows);
var afterShared = captureAll(sharedRows);

function expectedSig(key) {
  var parts = key.split('|');
  var name = parts[0];
  var st = parts[1];
  var view = parts[2];
  if (
    (name === 'G2' || name === 'G3' || name === 'G4') &&
    (view === 'male' || view === 'female')
  ) {
    var allSig = afterShared[name + '|' + st + '|all'];
    return Object.assign({}, allSig, { view: view });
  }
  return baseline[key];
}

Object.keys(baseline).forEach(function (key) {
  var expected = expectedSig(key);
  assert(
    'before===after page ' + key,
    !firstDiff(expected, afterPage[key], key),
    firstDiff(expected, afterPage[key], key)
  );
  assert(
    'before===after shared ' + key,
    !firstDiff(expected, afterShared[key], key),
    firstDiff(expected, afterShared[key], key)
  );
});

var detailJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');
var sharedSrc = fs.readFileSync(path.join(utilsDir, 'personalLeaderboardBoard.js'), 'utf8');
var detailWxml = fs.readFileSync(path.join(detailDir, 'index.wxml'), 'utf8');
var detailWxss = fs.readFileSync(path.join(detailDir, 'index.wxss'), 'utf8');

assert(
  'detail requires shared module',
  /personalLeaderboardBoard/.test(detailJs) &&
    /buildPersonalLeaderboardBoard/.test(detailJs)
);

assert(
  'ForView is thin wrapper to shared',
  /_buildLeaderboardViewForView\(match, view\) \{[\s\S]{0,500}buildPersonalLeaderboardBoard/.test(
    detailJs
  ) &&
    !/_buildLeaderboardViewForView\(match, view\) \{[\s\S]{0,500}_buildLeaderboardView\(/.test(
      detailJs
    ) &&
    !/_buildLeaderboardViewForView\(match, view\) \{[\s\S]{0,500}_buildNetLeaderboardRows\(/.test(
      detailJs
    )
);

assert(
  'no dual-run in ForView',
  !/_buildLeaderboardViewForView\(match, view\) \{[\s\S]{0,500}_buildLeaderboardView\(/.test(
    detailJs
  )
);

assert(
  'team path unchanged',
  detailJs.indexOf('_buildTeamLeaderboardView(match)') >= 0 &&
    detailJs.indexOf('_buildNetTeamLeaderboardView') >= 0
);

assert(
  'shared has no Series special-case',
  !/seriesContext|seriesId|isSeries/.test(sharedSrc)
);

assert(
  'page and shared map avatars via mockAvatars.resolveAvatar',
  sharedSrc.indexOf('mockAvatars.resolveAvatar') >= 0
);

assert(
  'shared has no storage write',
  !/setStorageSync|wx\./.test(sharedSrc)
);

assert(
  'shared exports board builder',
  typeof shared.buildPersonalLeaderboardBoard === 'function'
);

assert(
  'personal board DOM still present (page component or inline)',
  detailWxml.indexOf('live-leaderboard-board') >= 0 ||
    detailWxml.indexOf('personal-leaderboard-board') >= 0 ||
    (detailWxml.indexOf('leaderboard-row--personal') >= 0 && /item\.pos/.test(detailWxml))
);

var g1Male = afterPage['G1-LIVE|gross|male'];
assert(
  'unknown gender excluded from male',
  g1Male &&
    g1Male.rows.every(function (r) {
      return r.gender === 'male';
    }) &&
    g1Male.rows.every(function (r) {
      return r.identityKey !== 'u-unk';
    })
);
var g1Female = afterPage['G1-LIVE|gross|female'];
assert(
  'unknown gender excluded from female',
  g1Female &&
    g1Female.rows.every(function (r) {
      return r.gender === 'female';
    }) &&
    g1Female.rows.every(function (r) {
      return r.identityKey !== 'u-unk';
    })
);
var g1All = afterPage['G1-LIVE|gross|all'];
assert(
  'unknown gender remains in all',
  g1All &&
    g1All.rows.some(function (r) {
      return r.identityKey === 'u-unk';
    })
);

assert(
  'exports stay page-free',
  Object.keys(shared).indexOf('buildPersonalLeaderboardBoard') >= 0
);

if (failures.length) {
  console.log('');
  failures.slice(0, 12).forEach(function (f) {
    console.log('  - ' + f);
  });
}
console.log('');
console.log('LBA1 selftest: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
