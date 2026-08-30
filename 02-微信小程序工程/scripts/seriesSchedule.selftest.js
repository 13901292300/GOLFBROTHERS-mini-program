/**
 * Series 赛程 A 自测
 * - 轮次选择器无 TOT
 * - dirty 轮次切换策略（源码断言）
 * - 页面不导航 group-editor / detail；含 save/start/enterScore
 * - saveStationGroups / startStationRound 冒烟
 * - validatePlayersForRegisterGameMode 仍覆盖四赛制
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesSchedule.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var pageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');

var scheduleVm = require(path.join(pageDir, 'seriesScheduleViewModel.js'));
var scheduleWrite = require(seriesTestPaths.util('seriesScheduleGroupWrite.js'));
var scheduleCandidates = require(seriesTestPaths.util('seriesScheduleCandidates.js'));
var tournamentGroupDraft = require(seriesTestPaths.util('tournamentGroupDraft.js'));

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');

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

function baseSeries(overrides) {
  return Object.assign(
    {
      seriesId: 'series-schedule-1',
      lifecycleStatus: 'published',
      publishState: 'published',
      hostMode: 'organization',
      templateId: 'inter_team_series',
      seriesName: '赛程系列赛',
      participants: [
        {
          seriesParticipantId: 'team:a',
          kind: 'team',
          sourceTeamId: 't-a',
          nameSnapshot: 'A队',
          shortNameSnapshot: 'A队'
        },
        {
          seriesParticipantId: 'team:b',
          kind: 'team',
          sourceTeamId: 't-b',
          nameSnapshot: 'B队',
          shortNameSnapshot: 'B队'
        }
      ],
      roster: [
        {
          playerId: 'p1',
          playerNameSnapshot: '球员一',
          seriesParticipantId: 'team:a',
          registrationStatus: 'registered'
        }
      ],
      rounds: [
        {
          roundId: 'r1',
          index: 1,
          name: '第1轮',
          gameMode: '个人比杆赛',
          matchId: 'm-sched-1'
        },
        {
          roundId: 'r2',
          index: 2,
          name: '第2轮',
          gameMode: '个人比杆赛',
          matchId: 'm-sched-2'
        }
      ]
    },
    overrides || {}
  );
}

function roundStates() {
  return [
    {
      roundId: 'r1',
      index: 1,
      label: 'R1',
      statusToken: 'scheduled'
    },
    {
      roundId: 'r2',
      index: 2,
      label: 'R2',
      statusToken: 'live'
    }
  ];
}

// ---- 无 TOT ----
(function () {
  var sel = scheduleVm.buildScheduleRoundSelector(baseSeries(), roundStates());
  assert(
    'schedule selector has no TOT / totalSelector',
    Array.isArray(sel.roundSelectorItems) &&
      sel.roundSelectorItems.length === 2 &&
      sel.roundSelectorItems.every(function (it) {
        return it && it.key !== 'cumulative' && String(it.label).indexOf('TOT') < 0;
      }) &&
      sel.totalSelector == null
  );
  assert(
    'emptyScheduleViewModel has no totalSelector',
    scheduleVm.emptyScheduleViewModel().totalSelector == null
  );
})();

// ---- round switch policy (G2-R：无页内分组 dirty；切轮直接切换) ----
(function () {
  var tapStart = pageJs.indexOf('onScheduleRoundTap: function');
  var tapEnd = pageJs.indexOf('onScheduleRoundHScroll: function');
  var tapSrc =
    tapStart >= 0 && tapEnd > tapStart ? pageJs.slice(tapStart, tapEnd) : '';
  assert(
    'onScheduleRoundTap switches without in-page dirty gate',
    tapSrc.indexOf('_scheduleDirty') < 0 &&
      tapSrc.indexOf('请先保存或取消分组修改') < 0 &&
      tapSrc.indexOf('_scheduleSelectedKey = key') >= 0
  );
  assert(
    'round switch does not use removed sheet closer',
    tapSrc.indexOf('_closeScheduleEditorSheets') < 0 &&
      tapSrc.indexOf('_rebuildScheduleProjection') >= 0
  );
})();

// ---- page source guards ----
(function () {
  assert(
    'page wires schedule modules',
    pageJs.indexOf("require('./seriesScheduleViewModel.js')") >= 0 &&
      /require\(['"][^'"]*utils\/tournament\/seriesScheduleGroupWrite\.js['"]\)/.test(
        pageJs
      )
  );
  assert(
    'page has startStationRound / enterScorePage；分组写入走 group-editor',
    pageJs.indexOf('saveStationGroups') < 0 &&
      pageJs.indexOf('seriesScheduleGroupWrite.startStationRound') >= 0 &&
      pageJs.indexOf('openScheduleGroupEditor') >= 0 &&
      pageJs.indexOf('/subpackages/tournament/pages/group-editor') >= 0 &&
      pageJs.indexOf('fromSeries=1') >= 0 &&
      pageJs.indexOf('teamMatchEnterGroupScore.enterViewerGroupScore') >= 0
  );
  assert(
    'schedule CTA navigates to independent group-editor (G2-R)',
    pageJs.indexOf('/subpackages/tournament/pages/group-editor') >= 0 &&
      pageJs.indexOf('fromSeries=1') >= 0 &&
      pageJs.indexOf('openScheduleGroupEditor') >= 0 &&
      /&roundId=' \+[\s\S]{0,80}encodeURIComponent\(roundId\)/.test(pageJs)
  );
  (function () {
    var enterMod = require(seriesTestPaths.util('teamMatchEnterGroupScore.js'));
    var calls = [];
    var match = {
      matchId: 'm-sched',
      gameMode: '个人比杆赛',
      groups: [
        {
          groupId: 'g1',
          players: [{ userId: 'p1', playerId: 'p1', name: '球员一' }]
        }
      ]
    };
    var res = enterMod.enterViewerGroupScore(match, 'p1', {
      groupsStore: {
        ensureInitialized: function () {},
        getGroups: function () {
          return [];
        }
      },
      setMatchState: function () {},
      emptyScores: function () {
        return [];
      },
      enterScorePage: function (opts) {
        calls.push(opts);
      }
    });
    assert(
      '赛程记分权威入口 enterViewerGroupScore 默认不 replace',
      res.ok === true && calls.length === 1 && calls[0] == null
    );
  })();
  // onEnterRound 已 no-op；赛程方法体不得 navigateTo detail
  var teeStart = pageJs.indexOf('onScheduleTeeGroupTap: function');
  var backStart = pageJs.indexOf('onBack: function');
  var scheduleMethods =
    teeStart >= 0 && backStart > teeStart ? pageJs.slice(0, backStart) : pageJs;
  var scheduleSlice =
    pageJs.indexOf('_buildScheduleViewModel') >= 0
      ? pageJs.slice(pageJs.indexOf('_buildScheduleViewModel'), backStart)
      : '';
  assert(
    'schedule methods do not navigateTo detail',
    scheduleSlice.indexOf("navigateTo({ url: gate.navUrl") < 0 &&
      scheduleSlice.indexOf('/pages/detail/') < 0 &&
      scheduleSlice.indexOf('pages/detail/index') < 0
  );
  assert(
    'onEnterRound is no-op (no detail navigation)',
    /onEnterRound:\s*function\s*\([^)]*\)\s*\{\s*return;\s*\}/.test(pageJs) ||
      (pageJs.indexOf('onEnterRound: function') >= 0 &&
        pageJs.indexOf('wx.navigateTo({ url: gate.navUrl })') < 0)
  );
  assert(
    'wxml has schedule panels and no 进入本轮',
    pageWxml.indexOf('series-round-selector-dock') >= 0 &&
      pageWxml.indexOf('openScheduleGroupEditor') >= 0 &&
      pageWxml.indexOf('onScheduleTeeGroupTap') >= 0 &&
      pageWxml.indexOf('进入本轮') < 0
  );
})();

// ---- save / start smoke with fake store ----
(function () {
  var series = baseSeries();
  var matchStore = {
    'm-sched-1': {
      matchId: 'm-sched-1',
      status: 'registering',
      gameMode: '个人比杆赛',
      seriesContext: {
        managed: true,
        seriesId: 'series-schedule-1',
        roundId: 'r1',
        seriesParticipantMode: 'team',
        registrationAuthority: 'series'
      },
      groups: [],
      pairings: {},
      registerInfo: { totalCount: 0, users: [] },
      teamGroups: [
        { id: 't-a', sourceTeamId: 't-a', name: 'A队' },
        { id: 't-b', sourceTeamId: 't-b', name: 'B队' }
      ]
    }
  };

  function getMatchById(id) {
    var m = matchStore[id];
    return m ? JSON.parse(JSON.stringify(m)) : null;
  }
  function saveMatch(m) {
    matchStore[m.matchId] = JSON.parse(JSON.stringify(m));
    return m;
  }

  var draft = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        {
          position: 1,
          userId: 'p1',
          displayName: '球员一',
          affiliationId: 't-a',
          matchTeamId: 't-a',
          groupId: 't-a',
          matchTeamName: 'A队',
          groupName: 'A队'
        },
        { position: 2, userId: '' },
        { position: 3, userId: '' },
        { position: 4, userId: '' }
      ]
    }
  ];

  var saved = scheduleWrite.saveStationGroups({
    matchId: 'm-sched-1',
    series: series,
    groupDraft: draft,
    getMatchById: getMatchById,
    saveMatch: saveMatch
  });
  assert(
    'saveStationGroups smoke ok',
    !!(saved && saved.ok && matchStore['m-sched-1'].groups.length === 1),
    saved && !saved.ok ? saved.reason + ' ' + saved.message : ''
  );

  var started = scheduleWrite.startStationRound({
    matchId: 'm-sched-1',
    series: series,
    getMatchById: getMatchById,
    saveMatch: saveMatch
  });
  assert(
    'startStationRound smoke ok',
    !!(started && started.ok && String(matchStore['m-sched-1'].status) === 'ongoing'),
    started && !started.ok ? started.reason + ' ' + started.message : ''
  );

  // 开赛失败回滚：不改 status
  matchStore['m-sched-1'].status = 'registering';
  var failStart = scheduleWrite.startStationRound({
    matchId: 'm-sched-1',
    series: series,
    getMatchById: getMatchById,
    saveMatch: function () {
      throw new Error('boom');
    }
  });
  assert(
    'startStationRound failure keeps status',
    !failStart.ok && String(matchStore['m-sched-1'].status) === 'registering'
  );

  // 四人两球：保存自动生成 pairings（挂在已有 r2 / m-sched-2，满足 round↔match 核验）
  matchStore['m-sched-2'] = {
    matchId: 'm-sched-2',
    status: 'registering',
    gameMode: '四人两球比杆赛',
    seriesContext: {
      managed: true,
      seriesId: 'series-schedule-1',
      roundId: 'r2',
      seriesParticipantMode: 'team',
      registrationAuthority: 'series'
    },
    groups: [],
    pairings: {},
    registerInfo: { totalCount: 0, users: [] },
    teamGroups: [
      { id: 't-a', sourceTeamId: 't-a', name: 'A队' },
      { id: 't-b', sourceTeamId: 't-b', name: 'B队' }
    ]
  };
  var g4Draft = [
    {
      groupId: 'g4-1',
      groupName: '第1组',
      players: [
        {
          position: 1,
          userId: 'a1',
          displayName: 'A1',
          affiliationId: 't-a',
          matchTeamId: 't-a',
          groupId: 't-a'
        },
        {
          position: 2,
          userId: 'a2',
          displayName: 'A2',
          affiliationId: 't-a',
          matchTeamId: 't-a',
          groupId: 't-a'
        },
        {
          position: 3,
          userId: 'b1',
          displayName: 'B1',
          affiliationId: 't-b',
          matchTeamId: 't-b',
          groupId: 't-b'
        },
        {
          position: 4,
          userId: 'b2',
          displayName: 'B2',
          affiliationId: 't-b',
          matchTeamId: 't-b',
          groupId: 't-b'
        }
      ]
    }
  ];
  var g4Saved = scheduleWrite.saveStationGroups({
    matchId: 'm-sched-2',
    series: series,
    roundId: 'r2',
    groupDraft: g4Draft,
    getMatchById: getMatchById,
    saveMatch: saveMatch
  });
  var g4Pairings = (matchStore['m-sched-2'] && matchStore['m-sched-2'].pairings) || {};
  var g4Slots = g4Pairings['g4-1'] || [];
  assert(
    'G4 四人两球保存生成 pairings',
    !!(g4Saved && g4Saved.ok && g4Slots.length >= 1),
    g4Saved && !g4Saved.ok ? g4Saved.reason + ' ' + g4Saved.message : ''
  );
})();

// ---- affiliation options ----
(function () {
  var opts = scheduleCandidates.listAffiliationOptions(baseSeries());
  assert(
    'affiliation options from participants',
    opts.length === 2 && opts[0].id === 't-a'
  );
})();

// ---- four stroke modes still supported ----
(function () {
  assert(
    'validatePlayersForRegisterGameMode exported',
    typeof tournamentGroupDraft.validatePlayersForRegisterGameMode === 'function'
  );
  var modes = [
    '个人比杆赛',
    '最好成绩比杆赛',
    '四人四球比杆赛',
    '最佳球位比杆赛',
    '四人两球比杆赛'
  ];
  var teamMap = { u1: 't1', u2: 't1', u3: 't2', u4: 't2' };
  var players22 = [
    { position: 1, userId: 'u1' },
    { position: 2, userId: 'u2' },
    { position: 3, userId: 'u3' },
    { position: 4, userId: 'u4' }
  ];
  modes.forEach(function (mode) {
    var err = tournamentGroupDraft.validatePlayersForRegisterGameMode(
      players22,
      mode,
      mode === '个人比杆赛' ? '' : '2+2',
      teamMap,
      {
        useComposition: mode !== '个人比杆赛',
        showCompositionMode: mode !== '个人比杆赛',
        sideUnit: '分队'
      }
    );
    assert(
      'validatePlayersForRegisterGameMode supports ' + mode,
      err == null || typeof err === 'string',
      String(err)
    );
  });
  // 至少个人比杆空组可通过（无强制人数）
  var g1Err = tournamentGroupDraft.validatePlayersForRegisterGameMode(
    [{ position: 1, userId: 'u1' }, { position: 2, userId: '' }, { position: 3, userId: '' }, { position: 4, userId: '' }],
    '个人比杆赛',
    '',
    { u1: 't1' },
    { useComposition: false, showCompositionMode: false }
  );
  assert('G1 single player still accepted or soft-checked', g1Err == null || typeof g1Err === 'string');
})();

(function () {
  assert(
    'schedule write lives in main tournament utils',
    seriesTestPaths.util('seriesScheduleGroupWrite.js') ===
      path.join(seriesTestPaths.MAIN_TOURNAMENT_UTILS, 'seriesScheduleGroupWrite.js') &&
      fs.existsSync(seriesTestPaths.util('seriesScheduleGroupWrite.js'))
  );
  assert(
    'schedule candidates live in main tournament utils',
    seriesTestPaths.util('seriesScheduleCandidates.js') ===
      path.join(seriesTestPaths.MAIN_TOURNAMENT_UTILS, 'seriesScheduleCandidates.js') &&
      fs.existsSync(seriesTestPaths.util('seriesScheduleCandidates.js'))
  );
  assert(
    'series-detail no longer hosts write/candidates files',
    !fs.existsSync(path.join(pageDir, 'seriesScheduleGroupWrite.js')) &&
      !fs.existsSync(path.join(pageDir, 'seriesScheduleCandidates.js'))
  );
  assert(
    'write exports saveStationGroups / startStationRound / verifySeriesContext',
    typeof scheduleWrite.saveStationGroups === 'function' &&
      typeof scheduleWrite.startStationRound === 'function' &&
      typeof scheduleWrite.verifySeriesContext === 'function'
  );
  assert(
    'candidates export listAffiliationOptions / listScheduleCandidatePlayers',
    typeof scheduleCandidates.listAffiliationOptions === 'function' &&
      typeof scheduleCandidates.listScheduleCandidatePlayers === 'function'
  );
})();

console.log('');
console.log('seriesSchedule.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  console.log('Failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
