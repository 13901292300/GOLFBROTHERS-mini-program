/**
 * Series per_round_n 排行榜：无 TOT、动态 Rx、各轮 topN、默认轮选择。
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsPerRoundN.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');
var seriesDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);

var seriesScoring = require(seriesTestPaths.util('seriesScoring.js'));
var seriesStandingsAssembler = require(seriesTestPaths.util('seriesStandingsAssembler.js'));
var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));

var pageJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(seriesDir, 'index.wxss'), 'utf8');
var assemblerSrc = fs.readFileSync(seriesTestPaths.util('seriesStandingsAssembler.js'), 'utf8');
var vmSrc = fs.readFileSync(path.join(seriesDir, 'seriesStandingsViewModel.js'), 'utf8');

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

function fillScores(n, stroke) {
  var out = [];
  for (var i = 0; i < 18; i++) out.push(i < n ? stroke : null);
  return out;
}

function makeSeries(partial) {
  return Object.assign(
    {
      seriesId: 'series-prn-1',
      publishToken: 'pub-prn-1',
      lifecycleStatus: 'published',
      scoringRule: {
        mode: 'per_round_n',
        scoreBasis: 'gross',
        allowRepeat: false,
        ruleVersion: 1
      },
      participants: [
        {
          seriesParticipantId: 'team:red',
          kind: 'team',
          sourceTeamId: 'red',
          nameSnapshot: '红队',
          shortNameSnapshot: '红'
        },
        {
          seriesParticipantId: 'team:blue',
          kind: 'team',
          sourceTeamId: 'blue',
          nameSnapshot: '蓝队',
          shortNameSnapshot: '蓝'
        }
      ],
      rounds: []
    },
    partial || {}
  );
}

function makeManagedMatch(opts) {
  var o = opts || {};
  var matchId = o.matchId || 'm1';
  var roundId = o.roundId || 'r1';
  return Object.assign(
    {
      matchId: matchId,
      gameMode: o.gameMode || '个人比杆赛',
      status: o.status || 'finished',
      seriesContext: {
        managed: true,
        seriesId: 'series-prn-1',
        roundId: roundId,
        publishToken: 'pub-prn-1'
      },
      teamGroups: [
        { id: 'red', name: '红队' },
        { id: 'blue', name: '蓝队' }
      ],
      registerInfo: {
        users: [
          { userId: 'u-r1', nickname: '红一', matchTeamId: 'red' },
          { userId: 'u-r2', nickname: '红二', matchTeamId: 'red' },
          { userId: 'u-r3', nickname: '红三', matchTeamId: 'red' },
          { userId: 'u-b1', nickname: '蓝一', matchTeamId: 'blue' },
          { userId: 'u-b2', nickname: '蓝二', matchTeamId: 'blue' },
          { userId: 'u-b3', nickname: '蓝三', matchTeamId: 'blue' }
        ]
      },
      groups: [],
      scoreData: {},
      front9Course: 'A',
      back9Course: 'B',
      courseName: 'Test'
    },
    o.patch || {}
  );
}

function g1Players(ids) {
  return ids.map(function (id, i) {
    return { userId: id, nickname: id, position: i + 1 };
  });
}

function g1Match(matchId, roundId, status, scoresByPlayer) {
  return makeManagedMatch({
    matchId: matchId,
    roundId: roundId,
    status: status,
    patch: {
      groups: [{ groupId: 'g1', players: g1Players(Object.keys(scoresByPlayer)) }],
      scoreData: { g1: { scoresByPlayer: scoresByPlayer } }
    }
  });
}

function makeIndex(roundId, matchId) {
  return {
    seriesId: 'series-prn-1',
    roundId: roundId,
    matchId: matchId,
    publishToken: 'pub-prn-1'
  };
}

function assemble(series, store, index) {
  return seriesStandingsAssembler.buildStandingsResult({
    series: series,
    getMatchById: function (id) {
      return store[id] || null;
    },
    getIndexByMatchId: function (id) {
      return index[id] || null;
    },
    resolveStationStatusLabel: function (m) {
      if (!m) return '';
      if (m.status === 'ongoing' || m.status === 'live') return 'LIVE';
      if (m.status === 'finished' || m.status === 'completed') return '已结束';
      return '报名中';
    }
  });
}

function project(series, built, selectedKey, roundStates) {
  return standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: selectedKey,
    roundStates: roundStates,
    standingsResult: built.standingsResult
  });
}

function rowOf(vm, pid) {
  var rows = (vm && vm.teamRows) || [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].teamId === pid) return rows[i];
  }
  return null;
}

var threeRoundStates = [
  { roundId: 'r1', index: 1, label: 'R1', state: 'completed', statusToken: 'completed' },
  { roundId: 'r2', index: 2, label: 'R2', state: 'live', statusToken: 'live' },
  { roundId: 'r3', index: 3, label: 'R3', state: 'unassigned', statusToken: 'unassigned' }
];

// 1 无 TOT
(function () {
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: makeSeries(),
    selectedKey: 'cumulative',
    roundStates: threeRoundStates,
    standingsResult: standingsVm.emptyStandingsResult()
  });
  assert('1 per_round_n 可用且无 TOT', vm.available === true && vm.showTot === false);
  assert(
    '1 选择器不含 TOT/cumulative',
    vm.roundSelector.every(function (c) {
      return c.key !== 'cumulative' && c.label !== 'TOT';
    }) && vm.totalSelector == null
  );
})();

// 2 默认 LIVE
assert(
  '2 默认选中当前 LIVE 轮',
  standingsVm.resolveDefaultPerRoundSelectedKey(threeRoundStates) === 'r2'
);
assert(
  '2 cumulative 映射到 LIVE',
  project(makeSeries(), { standingsResult: standingsVm.emptyStandingsResult() }, 'cumulative', threeRoundStates)
    .selectedKey === 'r2'
);

// 3 无 LIVE → 已分组即将开始（按轮次顺序取第一个 grouped）
assert(
  '3 无 LIVE 时选中已分组即将开始的最近轮',
  standingsVm.resolveDefaultPerRoundSelectedKey([
    { roundId: 'r1', index: 1, label: 'R1', state: 'completed' },
    { roundId: 'r2', index: 2, label: 'R2', state: 'grouped' },
    { roundId: 'r3', index: 3, label: 'R3', state: 'grouped' }
  ]) === 'r2'
);

// 4 回退最近完成
assert(
  '4 再无可选轮时回退最近完成轮',
  standingsVm.resolveDefaultPerRoundSelectedKey([
    { roundId: 'r1', index: 1, label: 'R1', state: 'completed' },
    { roundId: 'r2', index: 2, label: 'R2', state: 'completed' },
    { roundId: 'r3', index: 3, label: 'R3', state: 'unassigned' }
  ]) === 'r2'
);

assert(
  '4b 取消轮不得成为默认',
  standingsVm.resolveDefaultPerRoundSelectedKey([
    { roundId: 'r1', index: 1, label: 'R1', state: 'cancelled' },
    { roundId: 'r2', index: 2, label: 'R2', state: 'completed' }
  ]) === 'r2'
);

var equalNSeries = makeSeries({
  rounds: [
    { roundId: 'r1', index: 1, matchId: 'm1', topN: 2, gameMode: '个人比杆赛' },
    { roundId: 'r2', index: 2, matchId: 'm2', topN: 2, gameMode: '个人比杆赛' },
    { roundId: 'r3', index: 3, matchId: 'm3', topN: 2, gameMode: '个人比杆赛', roundStatus: 'scheduled' }
  ]
});
var equalStore = {
  m1: g1Match('m1', 'r1', 'finished', {
    'u-r1': { scores: fillScores(18, 3) },
    'u-r2': { scores: fillScores(18, 4) },
    'u-r3': { scores: fillScores(18, 6) },
    'u-b1': { scores: fillScores(18, 4) },
    'u-b2': { scores: fillScores(18, 5) },
    'u-b3': { scores: fillScores(18, 6) }
  }),
  m2: g1Match('m2', 'r2', 'ongoing', {
    'u-r1': { scores: fillScores(6, 4) },
    'u-b1': { scores: fillScores(6, 5) }
  }),
  m3: g1Match('m3', 'r3', 'registering', {
    'u-r1': { scores: fillScores(0, 4) }
  })
};
var equalIndex = {
  m1: makeIndex('r1', 'm1'),
  m2: makeIndex('r2', 'm2'),
  m3: makeIndex('r3', 'm3')
};
var equalBuilt = assemble(equalNSeries, equalStore, equalIndex);
var vmR1 = project(equalNSeries, equalBuilt, 'r1', threeRoundStates);
var vmR2 = project(equalNSeries, equalBuilt, 'r2', threeRoundStates);
var vmR3 = project(equalNSeries, equalBuilt, 'r3', threeRoundStates);

assert('5 表头随 R1 切换', vmR1.roundScoreHeader === 'R1' && vmR1.headScoreLabel === 'R1');
assert('5 表头随 R2 切换', vmR2.roundScoreHeader === 'R2');
assert('5 表头随 R3 切换', vmR3.roundScoreHeader === 'R3');

assert(
  '6 切换 Rx 时 POS/TOTAL/顺序不变',
  standingsVm.cumulativeBoardSignature(vmR1) ===
    standingsVm.cumulativeBoardSignature(vmR2) &&
    standingsVm.cumulativeBoardSignature(vmR2) ===
      standingsVm.cumulativeBoardSignature(vmR3)
);
assert(
  '6 Rx 列随选择变化',
  rowOf(vmR1, 'team:red').scoreStr !== rowOf(vmR2, 'team:red').scoreStr ||
    rowOf(vmR1, 'team:blue').scoreStr !== rowOf(vmR2, 'team:blue').scoreStr
);

assert('7 assembler 走 per_round_n', equalBuilt.meta.mode === 'per_round_n');
assert(
  '7 每轮 N 相同计入两轮',
  equalBuilt.meta.startedRoundCount === 2
);

var redRow = equalBuilt.standingsResult.participantRows.find(function (r) {
  return r.seriesParticipantId === 'team:red';
});
assert(
  '7 红队 roundBreakdown 两轮 requiredCount=2',
  redRow &&
    redRow.roundBreakdown.length === 2 &&
    redRow.roundBreakdown.every(function (b) {
      return b.requiredCount === 2;
    })
);

var diffNSeries = makeSeries({
  rounds: [
    { roundId: 'r1', index: 1, matchId: 'm1', topN: 1, gameMode: '个人比杆赛' },
    { roundId: 'r2', index: 2, matchId: 'm2', topN: 2, gameMode: '个人比杆赛' }
  ]
});
var diffStore = {
  m1: equalStore.m1,
  m2: g1Match('m2', 'r2', 'finished', {
    'u-r1': { scores: fillScores(18, 4) },
    'u-r2': { scores: fillScores(18, 4) },
    'u-r3': { scores: fillScores(18, 5) },
    'u-b1': { scores: fillScores(18, 4) },
    'u-b2': { scores: fillScores(18, 5) }
  })
};
var diffBuilt = assemble(diffNSeries, diffStore, {
  m1: makeIndex('r1', 'm1'),
  m2: makeIndex('r2', 'm2')
});
var diffRed = diffBuilt.standingsResult.participantRows.find(function (r) {
  return r.seriesParticipantId === 'team:red';
});
assert(
  '8 每轮 N 不同',
  diffRed &&
    diffRed.roundBreakdown[0].requiredCount === 1 &&
    diffRed.roundBreakdown[1].requiredCount === 2
);

assert(
  '9 某队某轮不足 N 则不完整',
  redRow &&
    redRow.isComplete === false &&
    (redRow.incompleteRoundIds || []).indexOf('r2') >= 0
);
assert(
  '9 不足 N 仍可展示临时 Rx',
  rowOf(vmR2, 'team:red').scoreStr !== '-' &&
    rowOf(vmR2, 'team:red').scoreStr !== 'E'
);
assert(
  '9 不完整不得正式领先 POS',
  rowOf(vmR1, 'team:red').pos === '-' && rowOf(vmR1, 'team:blue').pos === '-'
);

assert(
  '10 LIVE 中只有部分有效成绩仍装配',
  redRow.roundBreakdown.some(function (b) {
    return b.roundId === 'r2' && b.selectedCount === 1 && b.requiredCount === 2;
  })
);

assert(
  '11 未开赛轮不进入 TOTAL',
  !redRow.roundBreakdown.some(function (b) {
    return b.roundId === 'r3';
  }) && equalBuilt.meta.startedRoundCount === 2
);

assert(
  '12 已分组未开赛轮 Rx 显示 -',
  rowOf(vmR3, 'team:red').scoreStr === '-' &&
    rowOf(vmR3, 'team:red').scoreStr !== 'E' &&
    rowOf(vmR3, 'team:red').scoreStr !== '0'
);

var cancelSeries = makeSeries({
  rounds: [
    {
      roundId: 'r1',
      index: 1,
      matchId: 'm1',
      topN: 2,
      gameMode: '个人比杆赛',
      roundStatus: 'cancelled'
    },
    { roundId: 'r2', index: 2, matchId: 'm2', topN: 2, gameMode: '个人比杆赛' }
  ]
});
var cancelStore = {
  m1: equalStore.m1,
  m2: g1Match('m2', 'r2', 'finished', {
    'u-r1': { scores: fillScores(18, 4) },
    'u-b1': { scores: fillScores(18, 4) }
  })
};
var cancelBuilt = assemble(cancelSeries, cancelStore, {
  m1: makeIndex('r1', 'm1'),
  m2: makeIndex('r2', 'm2')
});
assert(
  '13 取消轮不计入',
  cancelBuilt.meta.startedRoundCount === 1 &&
    cancelBuilt.standingsResult.roundMeta.r1 &&
    cancelBuilt.standingsResult.roundMeta.r1.cancelled === true
);
assert(
  '13 取消轮不作为默认',
  standingsVm.resolveDefaultPerRoundSelectedKey([
    { roundId: 'r1', index: 1, label: 'R1', state: 'cancelled' },
    { roundId: 'r2', index: 2, label: 'R2', state: 'live' }
  ]) === 'r2'
);

var badSeries = makeSeries({
  rounds: [{ roundId: 'r1', index: 1, matchId: 'm-bad', topN: 2, gameMode: '个人比杆赛' }]
});
var badMatch = makeManagedMatch({
  matchId: 'm-bad',
  roundId: 'r1',
  status: 'finished',
  patch: {
    seriesContext: {
      managed: true,
      seriesId: 'other-series',
      roundId: 'r1',
      publishToken: 'pub-prn-1'
    },
    groups: [{ groupId: 'g1', players: g1Players(['u-r1']) }],
    scoreData: { g1: { scoresByPlayer: { 'u-r1': { scores: fillScores(18, 4) } } } }
  }
});
var badBuilt = assemble(
  badSeries,
  { 'm-bad': badMatch },
  { 'm-bad': makeIndex('r1', 'm-bad') }
);
assert(
  '14 非法 managed station fail closed',
  badBuilt.meta.stationErrors.some(function (e) {
    return e.roundId === 'r1';
  }) &&
    (!badBuilt.standingsResult.participantRows[0] ||
      !(badBuilt.standingsResult.participantRows[0].allEntries || []).length)
);

assert(
  '15 R1/R2 数据不串轮',
  rowOf(vmR1, 'team:red').players.every(function (p) {
    return !p.roundId || p.roundId === 'r1';
  }) &&
    rowOf(vmR2, 'team:red').players.every(function (p) {
      return !p.roundId || p.roundId === 'r2';
    })
);

var r1ScorecardRound = standingsVm.resolveStandingsScorecardRoundId(
  { roundId: 'r1' },
  'r2'
);
assert('16 记分卡不把 R1 行映射到 R2', r1ScorecardRound === '');
assert(
  '16 Rx 展开指向所选分站',
  rowOf(vmR1, 'team:red').players.some(function (p) {
    return p.roundId === 'r1';
  })
);

assert(
  '17 球队视图不切完整 LIVE；查看全部走 applyPerRoundNStandingsOverlay',
  /mode === 'per_round_n'/.test(pageJs) &&
    pageJs.indexOf('applyPerRoundNStandingsOverlay') >= 0 &&
    pageJs.indexOf('_standingsSelectionByRoundId') >= 0 &&
    /view: 'team', scoreType: 'gross'/.test(pageJs)
);

assert(
  '18 assembler 仍保留 global_m 计算入口',
  assemblerSrc.indexOf('computeGlobalTopM') >= 0 &&
    assemblerSrc.indexOf("mode !== 'global_m' && mode !== 'per_round_n'") >= 0
);
assert(
  '18 VM TOTAL 仅由 scoringRule.mode === global_m 决定',
  vmSrc.indexOf('shouldIncludeTotalSelector') >= 0 &&
    /scoringRuleMode\(series\) === 'global_m'/.test(vmSrc)
);

assert(
  '19 沿用现有 leaderboard-table-wrap / 暗色 theme-class',
  pageWxml.indexOf('leaderboard-table-wrap') >= 0 &&
    pageWxml.indexOf('theme-class="{{themeClass}}"') >= 0 &&
    pageWxml.indexOf('standings.headScoreLabel') >= 0
);

assert(
  '20 未复制排行榜 DOM / 未新增专属大段样式 / 未重写 Top N',
  (pageWxml.match(/class="leaderboard-table-wrap"/g) || []).length === 1 &&
    pageWxss.indexOf('per-round') < 0 &&
    pageWxss.indexOf('per_round_n') < 0 &&
    pageJs.indexOf('computePerRoundTopN') < 0 &&
    assemblerSrc.indexOf('seriesScoring.computePerRoundTopN') >= 0 &&
    vmSrc.indexOf('computePerRoundTopN') < 0
);

var scoringDirect = seriesScoring.computePerRoundTopN({
  entries: [
    {
      entryId: 'a',
      roundId: 'r1',
      seriesParticipantId: 'team:red',
      resultStatus: 'OK',
      rankingValue: -2
    }
  ],
  rounds: [{ roundId: 'r1', index: 1, topN: 2, roundStatus: 'scheduled' }],
  participantIds: ['team:red']
});
assert(
  '20b 正式排名来自 computePerRoundTopN',
  scoringDirect.mode === 'per_round_n' &&
    scoringDirect.participants[0].isComplete === false
);

console.log('');
console.log('seriesStandingsPerRoundN.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  console.log(failures.join('\n'));
  process.exitCode = 1;
}
