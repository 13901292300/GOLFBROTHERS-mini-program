/**
 * Series 赛程：跨轮次提前分组确认
 * 运行：node scripts/seriesScheduleGroupOrderConfirm.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var utilsDir = path.join(root, 'miniprogram', 'utils');
var pageDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);
var detailDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'detail'
);

var scheduleVm = require(path.join(pageDir, 'seriesScheduleViewModel.js'));
var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));

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

function makeSeriesWith5Rounds() {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: '顺序提醒系列',
    createdBy: 'admin-1',
    organization: {
      organizationId: 'org-1',
      organizationName: '机构',
      organizationLogo: ''
    }
  });
  s.lifecycleStatus = 'published';
  s.publishToken = 'tok-order';
  s.participants = [
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't1',
      seriesParticipantId: 'team:t1',
      nameSnapshot: '甲队'
    }),
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't2',
      seriesParticipantId: 'team:t2',
      nameSnapshot: '乙队'
    })
  ];
  var base = (s.rounds || [])[0] || {};
  s.rounds = [1, 2, 3, 4, 5].map(function (n) {
    return Object.assign({}, base, {
      roundId: 'r' + n,
      index: n,
      name: '第' + n + '轮',
      matchId: 'm-order-' + n,
      gameMode: '个人比杆赛',
      dateTime: '2030-06-0' + n + ' 08:00',
      courseId: 'c1',
      courseName: '球场',
      fee: '0',
      roundStatus: 'scheduled'
    });
  });
  return s;
}

function buildMatch(series, round, groups) {
  var built = seriesStationMatch.buildMatchFromSeriesRound(series, round, {
    matchId: round.matchId,
    publishToken: series.publishToken
  });
  if (!built.ok) throw new Error(built.reason);
  var m = built.match;
  m.status = 'registering';
  m.groups = Array.isArray(groups) ? groups : [];
  return m;
}

function filledGroups() {
  return [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        { position: 1, userId: 'u1' },
        { position: 2, userId: '' },
        { position: 3, userId: '' },
        { position: 4, userId: '' }
      ]
    }
  ];
}

function emptyGroups() {
  return [];
}

function makeStore(series, groupMap) {
  var map = Object.create(null);
  (series.rounds || []).forEach(function (r) {
    var groups = groupMap[r.roundId];
    map[r.matchId] = buildMatch(
      series,
      r,
      groups === undefined ? emptyGroups() : groups
    );
  });
  return {
    getMatchById: function (id) {
      return map[id] || null;
    },
    _map: map
  };
}

(function testSameHasGroupsRuleAsCta() {
  assert(
    '已分组口径与 hasNonEmptyGroup 一致',
    scheduleVm.roundHasFormalGroups({
      groups: filledGroups()
    }) === true &&
      scheduleVm.roundHasFormalGroups({ groups: [] }) === false &&
      scheduleVm.roundHasFormalGroups({
        groups: [
          {
            groupId: 'g',
            players: [{ position: 1, userId: '' }]
          }
        ]
      }) === false &&
      scheduleVm.hasNonEmptyGroup(filledGroups()) ===
        scheduleVm.roundHasFormalGroups({ groups: filledGroups() })
  );
})();

(function testR1MissingClickR2() {
  var series = makeSeriesWith5Rounds();
  var store = makeStore(series, {
    r1: emptyGroups(),
    r2: emptyGroups()
  });
  var hit = scheduleVm.findEarliestPriorUngroupedRound({
    series: series,
    selectedRoundId: 'r2',
    getMatchById: store.getMatchById
  });
  assert(
    'R1 未分组点击 R2 → 提示 R1',
    !!hit &&
      hit.roundId === 'r1' &&
      hit.roundIndex === 1 &&
      hit.confirmTitle === '分组顺序提醒' &&
      hit.confirmContent.indexOf('第 1 轮尚未分组') === 0
  );
})();

(function testEarliestOnlyAmongGaps() {
  var series = makeSeriesWith5Rounds();
  var store = makeStore(series, {
    r1: filledGroups(),
    r2: emptyGroups(),
    r3: filledGroups(),
    r4: emptyGroups(),
    r5: emptyGroups()
  });
  var hit = scheduleVm.findEarliestPriorUngroupedRound({
    series: series,
    selectedRoundId: 'r5',
    getMatchById: store.getMatchById
  });
  assert(
    'R2、R4 未分组点击 R5 → 只提示 R2',
    !!hit && hit.roundId === 'r2' && hit.roundIndex === 2
  );
})();

(function testAllPriorGroupedNoPrompt() {
  var series = makeSeriesWith5Rounds();
  var store = makeStore(series, {
    r1: filledGroups(),
    r2: filledGroups(),
    r3: filledGroups(),
    r4: filledGroups(),
    r5: emptyGroups()
  });
  var hit = scheduleVm.findEarliestPriorUngroupedRound({
    series: series,
    selectedRoundId: 'r5',
    getMatchById: store.getMatchById
  });
  assert('所有前序轮已分组 → 不弹窗', hit == null);
})();

(function testClickEarliestUngroupedNoPrompt() {
  var series = makeSeriesWith5Rounds();
  var store = makeStore(series, {
    r1: emptyGroups(),
    r2: emptyGroups()
  });
  var hit = scheduleVm.findEarliestPriorUngroupedRound({
    series: series,
    selectedRoundId: 'r1',
    getMatchById: store.getMatchById
  });
  assert('点击最早未分组轮 → 不弹窗', hit == null);
})();

(function testCancelledPriorSkipped() {
  var series = makeSeriesWith5Rounds();
  series.rounds[0].roundStatus = 'cancelled';
  var store = makeStore(series, {
    r1: emptyGroups(),
    r2: emptyGroups(),
    r3: emptyGroups()
  });
  var hit = scheduleVm.findEarliestPriorUngroupedRound({
    series: series,
    selectedRoundId: 'r3',
    getMatchById: store.getMatchById,
    roundStates: [
      { roundId: 'r1', statusToken: 'cancelled' },
      { roundId: 'r2', statusToken: 'scheduled' }
    ]
  });
  assert(
    'cancelled 前序轮跳过，提示下一未分组轮',
    !!hit && hit.roundId === 'r2'
  );
})();

(function testCompletedPriorSkipped() {
  var series = makeSeriesWith5Rounds();
  var store = makeStore(series, {
    r1: emptyGroups(),
    r2: emptyGroups()
  });
  store._map['m-order-1'].status = 'completed';
  var hit = scheduleVm.findEarliestPriorUngroupedRound({
    series: series,
    selectedRoundId: 'r2',
    getMatchById: store.getMatchById
  });
  assert(
    '已结束前序无分组不阻断当前轮',
    hit == null
  );
})();

(function testPageWiring() {
  var pageJs = read(path.join(pageDir, 'index.js'));
  var pageWxml = read(path.join(pageDir, 'index.wxml'));
  var detailJs = read(path.join(detailDir, 'index.js'));

  assert(
    '页面接线：弹窗文案与继续/取消',
    pageJs.indexOf('findEarliestPriorUngroupedRound') >= 0 &&
      pageJs.indexOf('分组顺序提醒') >= 0 &&
      pageJs.indexOf('继续分组') >= 0 &&
      pageJs.indexOf('_proceedOpenScheduleGroupEditor') >= 0 &&
      pageJs.indexOf('_scheduleGroupEditorNavLock') >= 0 &&
      pageWxml.indexOf('openScheduleGroupEditor') >= 0
  );
  assert(
    '确认后仍走核验 proceed；取消不 navigate',
    pageJs.indexOf('_verifyScheduleStationForGroupEditor') >= 0 &&
      /success:\s*function\s*\(res\)\s*\{[\s\S]*?confirm[\s\S]*?_proceedOpenScheduleGroupEditor/.test(
        pageJs
      ) &&
      /success:[\s\S]*?_scheduleGroupEditorNavLock\s*=\s*false/.test(pageJs)
  );
  assert(
    '连点锁：入口即加锁',
    /openScheduleGroupEditor[\s\S]*?_scheduleGroupEditorNavLock\s*=\s*true/.test(
      pageJs
    )
  );
  assert(
    '普通 detail 无 Series 顺序弹窗逻辑',
    detailJs.indexOf('findEarliestPriorUngroupedRound') < 0 &&
      detailJs.indexOf('分组顺序提醒') < 0
  );
})();

(function testContinueTargetsOriginalRound() {
  // 纯函数只返回前序提示；页面 proceed 仍用原 roundId/matchId（静态校验）
  var pageJs = read(path.join(pageDir, 'index.js'));
  assert(
    '继续分组进入原点击轮（proceed 使用调用时 roundId/matchId）',
    /findEarliestPriorUngroupedRound[\s\S]*?_proceedOpenScheduleGroupEditor\(series,\s*roundId,\s*matchId\)/.test(
      pageJs
    ) &&
      pageJs.indexOf("encodeURIComponent(roundId)") >= 0
  );
})();

console.log('');
console.log('---- seriesScheduleGroupOrderConfirm.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
