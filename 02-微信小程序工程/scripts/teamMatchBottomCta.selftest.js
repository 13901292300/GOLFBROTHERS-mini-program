/**
 * 普通单场 / Series 出发表底部操作区公共投影
 * 运行：node scripts/teamMatchBottomCta.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');
var assert = require('assert');

if (typeof global.wx === 'undefined') {
  global.wx = {
    getStorageSync: function () { return null; },
    setStorageSync: function () {},
    removeStorageSync: function () {},
    showToast: function () {}
  };
}

var root = path.join(__dirname, '..');
var utilsDir = path.join(root, 'miniprogram', 'utils');
var cta = require(seriesTestPaths.util('teamMatchBottomCta.js'));
var viewer = require(seriesTestPaths.util('teamMatchViewerGroup.js'));
var enter = require(seriesTestPaths.util('teamMatchEnterGroupScore.js'));
var scheduleVm = require(path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail',
  'seriesScheduleViewModel.js'
));
var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));

var failed = 0;
var passed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failed += 1;
    console.error('FAIL', name, e && e.message ? e.message : e);
  }
}

function player(id, extra) {
  return Object.assign({ userId: id, playerId: id, name: id }, extra || {});
}

function matchOf(opts) {
  var o = opts || {};
  return {
    matchId: o.matchId || 'm1',
    status: o.status || 'ongoing',
    gameMode: o.gameMode || '个人比杆赛',
    groups: o.groups || [
      {
        groupId: 'g-a',
        players: [player('u1'), player('u2')]
      },
      {
        groupId: 'g-b',
        players: [player('u3')]
      }
    ],
    scoreEntities: o.scoreEntities || {}
  };
}

function seriesOf(phase) {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: 'CTA系列',
    createdBy: 'admin'
  });
  s.seriesId = 's1';
  s.publishToken = 'tok-cta';
  s.lifecycleStatus = 'published';
  s.competitionPhaseCache = phase || 'live';
  s.rounds = [
    { roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' },
    { roundId: 'r2', index: 2, matchId: 'm2', gameMode: '个人比杆赛' }
  ];
  return s;
}

function attachCtx(m, series, roundId) {
  m.seriesContext = {
    managed: true,
    seriesId: series.seriesId,
    roundId: roundId,
    publishToken: series.publishToken
  };
  return m;
}

function buildRoundVm(series, roundId, match) {
  return scheduleVm.buildSeriesScheduleViewModel({
    series: series,
    selectedRoundId: roundId,
    canManageGroups: true,
    viewerUserId: 'u1',
    lifecycleAccess: { lifecycleStatus: 'published' },
    getMatchById: function (id) {
      return match && match.matchId === id ? match : null;
    },
    getIndexByMatchId: function (id) {
      if (!match || match.matchId !== id) return null;
      return { seriesId: series.seriesId, roundId: roundId, matchId: id };
    }
  });
}

check('ordinary LIVE tee and Series LIVE share same CTA source', function () {
  var m = attachCtx(matchOf({ status: 'ongoing' }), seriesOf('live'), 'r1');
  var ordinary = cta.project({ match: m, surface: 'tee', viewerUserId: 'u1' });
  var series = seriesOf('live');
  m = attachCtx(m, series, 'r1');
  var vm = buildRoundVm(series, 'r1', m);
  assert.strictEqual(ordinary.mode, 'enter_my_group');
  assert.strictEqual(ordinary.enterMyGroupLabel, cta.ENTER_MY_GROUP_LABEL);
  assert.strictEqual(ordinary.enterMyGroupClass, 'tee-quick-entry-float');
  assert.strictEqual(vm.cta.mode, ordinary.mode);
  assert.strictEqual(vm.cta.enterMyGroupLabel, ordinary.enterMyGroupLabel);
  assert.strictEqual(vm.cta.enterMyGroupClass, ordinary.enterMyGroupClass);
  assert.strictEqual(vm.cta.showEditGroups, false);
});

check('source: no Series-only LIVE button node or class', function () {
  var seriesWxml = fs.readFileSync(
    path.join(root, 'miniprogram/subpackages/tournament/pages/series-detail/index.wxml'),
    'utf8'
  );
  var seriesWxss = fs.readFileSync(
    path.join(root, 'miniprogram/subpackages/tournament/pages/series-detail/index.wxss'),
    'utf8'
  );
  var seriesJs = fs.readFileSync(
    path.join(root, 'miniprogram/subpackages/tournament/pages/series-detail/index.js'),
    'utf8'
  );
  var detailWxml = fs.readFileSync(
    path.join(root, 'miniprogram/subpackages/tournament/pages/detail/index.wxml'),
    'utf8'
  );
  assert.ok(seriesWxml.indexOf('tee-quick-entry-float') >= 0);
  assert.ok(detailWxml.indexOf('tee-quick-entry-float') >= 0);
  assert.ok(seriesWxml.indexOf('schedule.cta.enterMyGroupLabel') >= 0);
  assert.ok(seriesWxml.indexOf('快速进入自己的小组') < 0);
  assert.ok(seriesWxss.indexOf('tee-quick-entry-float') < 0);
  assert.ok(seriesWxss.indexOf('seriesLiveQuick') < 0);
  assert.ok(seriesJs.indexOf('seriesLiveQuickEnter') < 0);
  assert.ok(seriesJs.indexOf('enterViewerGroupScore') >= 0);
});

check('LIVE G1 user locates own group', function () {
  var m = matchOf({ status: 'ongoing', gameMode: '个人比杆赛' });
  assert.strictEqual(viewer.resolveViewerGroupId(m, 'u1'), 'g-a');
  assert.strictEqual(viewer.resolveViewerGroupId(m, 'u3'), 'g-b');
});

check('LIVE G2/G3/G4 any real member locates group; not first-member only', function () {
  var m = matchOf({
    status: 'ongoing',
    gameMode: '四人四球比杆赛',
    groups: [
      { groupId: 'g-pair', players: [player('a'), player('b')] },
      { groupId: 'g-other', players: [player('c'), player('d')] }
    ],
    scoreEntities: {
      'g-pair': [
        { teamId: 'e1', members: [player('a'), player('b')] }
      ],
      'g-other': [
        { teamId: 'e2', members: [{ userId: 'c' }, { playerId: 'd' }] }
      ]
    }
  });
  assert.strictEqual(viewer.resolveViewerGroupId(m, 'b'), 'g-pair');
  assert.strictEqual(viewer.resolveViewerGroupId(m, 'd'), 'g-other');
  assert.notStrictEqual(viewer.resolveViewerGroupId(m, 'd'), 'g-pair');
  var g3 = matchOf({
    status: 'ongoing',
    gameMode: '最佳球位比杆赛',
    groups: [{ groupId: 'g1', players: [] }],
    scoreEntities: {
      g1: [{ entityId: 'e', members: [{ userId: 'p2' }, { userId: 'p1' }] }]
    }
  });
  assert.strictEqual(viewer.resolveViewerGroupId(g3, 'p2'), 'g1');
  var g4 = matchOf({
    status: 'ongoing',
    gameMode: '四人两球比杆赛',
    groups: [{ groupId: 'gx', players: [player('w'), player('x')] }],
    scoreEntities: {
      gx: [{ members: [player('w'), player('x')] }]
    }
  });
  assert.strictEqual(viewer.resolveViewerGroupId(g4, 'x'), 'gx');
});

check('user without group matches ordinary (toast, no first group)', function () {
  var m = matchOf({ status: 'ongoing' });
  assert.strictEqual(viewer.resolveViewerGroupId(m, 'ghost'), '');
  var toasts = [];
  var r = enter.enterViewerGroupScore(m, 'ghost', {
    wx: { showToast: function (o) { toasts.push(o.title); } },
    setMatchState: function () {},
    enterScorePage: function () {},
    emptyScores: function () { return []; }
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'not_in_group');
  assert.strictEqual(toasts[0], viewer.MISSING_GROUP_TOAST);
  assert.strictEqual(r.groupId, '');
});

check('non-playing admin is not assigned first group', function () {
  var m = matchOf({ status: 'ongoing' });
  assert.strictEqual(viewer.resolveViewerGroupId(m, 'admin'), '');
  var ctaVm = cta.project({
    match: m,
    surface: 'tee',
    canManageGroups: true,
    viewerUserId: 'admin',
    firstGroupFullyVisible: true
  });
  assert.strictEqual(ctaVm.viewerGroupId, '');
  assert.strictEqual(ctaVm.groupId, '');
});

check('unstarted empty groups reuses 开始分组', function () {
  var m = matchOf({ status: 'registering', groups: [] });
  var p = cta.project({ match: m, surface: 'groups', canManageGroups: true });
  assert.strictEqual(p.showEditGroups, true);
  assert.strictEqual(p.editGroupsLabel, '开始分组');
});

check('unstarted with groups reuses 修改分组', function () {
  var m = matchOf({ status: 'registering' });
  var p = cta.project({ match: m, surface: 'groups', canManageGroups: true });
  assert.strictEqual(p.editGroupsLabel, '修改分组');
  var noPerm = cta.project({ match: m, surface: 'groups', canManageGroups: false });
  assert.strictEqual(noPerm.showEditGroups, false);
});

check('finished round reuses ordinary completed bottom (no edit, no enter)', function () {
  var m = matchOf({ status: 'finished' });
  var groups = cta.project({ match: m, surface: 'groups', canManageGroups: true });
  var tee = cta.project({ match: m, surface: 'tee', viewerUserId: 'u1', firstGroupFullyVisible: true });
  assert.strictEqual(groups.showEditGroups, false);
  assert.strictEqual(tee.showEnterMyGroupEligible, false);
});

check('series completed makes all rounds readonly', function () {
  var m = matchOf({ status: 'registering' });
  var series = seriesOf('completed');
  var p = cta.project({
    match: m,
    series: series,
    surface: 'groups',
    canManageGroups: true
  });
  assert.strictEqual(p.showEditGroups, false);
  var live = cta.project({
    match: matchOf({ status: 'ongoing' }),
    series: series,
    surface: 'tee',
    viewerUserId: 'u1',
    firstGroupFullyVisible: true
  });
  assert.strictEqual(live.showEnterMyGroupEligible, false);
});

check('one LIVE round does not change another round CTA', function () {
  var series = seriesOf('live');
  var liveMatch = attachCtx(matchOf({ matchId: 'm1', status: 'ongoing' }), series, 'r1');
  var idleMatch = attachCtx(
    matchOf({ matchId: 'm2', status: 'registering', groups: [] }),
    series,
    'r2'
  );
  var bag = { m1: liveMatch, m2: idleMatch };
  var liveVm = scheduleVm.buildSeriesScheduleViewModel({
    series: series,
    selectedRoundId: 'r1',
    canManageGroups: true,
    viewerUserId: 'u1',
    lifecycleAccess: { lifecycleStatus: 'published' },
    getMatchById: function (id) { return bag[id]; },
    getIndexByMatchId: function (id) {
      return {
        seriesId: series.seriesId,
        roundId: id === 'm2' ? 'r2' : 'r1',
        matchId: id
      };
    }
  });
  var idleVm = scheduleVm.buildSeriesScheduleViewModel({
    series: series,
    selectedRoundId: 'r2',
    canManageGroups: true,
    viewerUserId: 'u1',
    lifecycleAccess: { lifecycleStatus: 'published' },
    getMatchById: function (id) { return bag[id]; },
    getIndexByMatchId: function (id) {
      return {
        seriesId: series.seriesId,
        roundId: id === 'm2' ? 'r2' : 'r1',
        matchId: id
      };
    }
  });
  assert.strictEqual(liveVm.cta.mode, 'enter_my_group');
  assert.strictEqual(idleVm.cta.mode, 'edit_groups');
  assert.strictEqual(idleVm.cta.editGroupsLabel, '开始分组');
});

check('jump uses stable matchId + groupId', function () {
  var captured = null;
  var m = matchOf({ status: 'ongoing' });
  var r = enter.enterViewerGroupScore(m, 'u3', {
    groupsStore: {
      ensureInitialized: function () {},
      loadGroupForScoring: function () { return []; }
    },
    setMatchState: function (st) { captured = st; },
    enterScorePage: function () {},
    emptyScores: function () { return []; }
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(captured.matchId, 'm1');
  assert.strictEqual(captured.groupId, 'g-b');
  assert.strictEqual(captured.groupIndex, 0);
});

check('view leaderboard / RxCx / finish lock not owned by CTA', function () {
  var series = seriesOf('live');
  var m = attachCtx(matchOf({ status: 'ongoing' }), series, 'r1');
  var vm = scheduleVm.buildSeriesScheduleViewModel({
    series: series,
    selectedRoundId: 'r1',
    canManageGroups: true,
    viewerUserId: 'u1',
    lifecycleAccess: { lifecycleStatus: 'published' },
    getMatchById: function () { return m; },
    getIndexByMatchId: function () {
      return { seriesId: series.seriesId, roundId: 'r1', matchId: 'm1' };
    }
  });
  assert.strictEqual(vm.showViewLeaderboard, true);
  assert.ok(Array.isArray(vm.roundSelector));
  var locked = cta.project({
    match: matchOf({ status: 'finished' }),
    surface: 'groups',
    canManageGroups: true
  });
  assert.strictEqual(locked.showEditGroups, false);
});

check('ordinary internal/inter-team groups CTA unchanged for registering', function () {
  var internal = matchOf({ status: 'registering', matchId: 'int' });
  var inter = matchOf({ status: 'registering', matchId: 'inter' });
  var a = cta.project({ match: internal, surface: 'groups', canManageGroups: true });
  var b = cta.project({ match: inter, surface: 'groups', canManageGroups: true });
  assert.strictEqual(a.editGroupsLabel, b.editGroupsLabel);
  assert.strictEqual(a.showEditGroups, true);
  var liveTee = cta.project({
    match: matchOf({ status: 'ongoing' }),
    surface: 'tee',
    firstGroupFullyVisible: true
  });
  assert.strictEqual(liveTee.visible, true);
  assert.strictEqual(liveTee.buttonClass, 'tee-quick-entry-float');
});

console.log('teamMatchBottomCta.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
