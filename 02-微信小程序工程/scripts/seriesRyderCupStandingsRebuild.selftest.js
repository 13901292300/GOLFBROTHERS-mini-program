/**
 * 莱德杯得分榜轻量切轮：与完整构建同一分流
 * 运行：node scripts/seriesRyderCupStandingsRebuild.selftest.js
 */

var path = require('path');
var fs = require('fs');

if (typeof global.wx === 'undefined') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    removeStorageSync: function () {}
  };
}

var root = path.join(__dirname, '..');
var utilsDir = path.join(root, 'miniprogram', 'utils');
var seriesDir = path.join(root, 'miniprogram', 'subpackages', 'tournament', 'pages', 'series-detail');

var seriesRyderCup = require(path.join(utilsDir, 'seriesRyderCup.js'));
var viewModel = require(path.join(seriesDir, 'seriesDetailViewModel.js'));
var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));

var pageJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var vmSrc = fs.readFileSync(path.join(seriesDir, 'seriesDetailViewModel.js'), 'utf8');

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

function extractFn(src, name) {
  var re = new RegExp(name + ':\\s*function\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n  \\},');
  var m = src.match(re);
  return m ? m[0] : '';
}

function holeScores(aWinsFirst) {
  var a = [];
  var b = [];
  for (var i = 0; i < 18; i++) {
    if (i === 0) {
      a[i] = aWinsFirst ? 3 : 5;
      b[i] = aWinsFirst ? 5 : 3;
    } else {
      a[i] = '';
      b[i] = '';
    }
  }
  return { a: a, b: b };
}

function g5Match(over) {
  var scores = over.scores || holeScores(true);
  var g1 = over.g1 || 'g1';
  var groups = [
    {
      groupId: g1,
      players: [
        { userId: 'pA1', position: 1 },
        { userId: 'pB1', position: 2 }
      ]
    }
  ];
  var scoreData = {};
  scoreData[g1] = {
    scoresByPlayer: {
      pA1: { scores: scores.a.slice() },
      pB1: { scores: scores.b.slice() }
    }
  };
  return {
    matchId: over.matchId || 'm1',
    gameMode: '个人比洞赛',
    matchType: 'inter-team',
    teamGroups: [
      { id: 'red', name: '红队', sourceTeamLogo: 'logo-a' },
      { id: 'blue', name: '蓝队', sourceTeamLogo: 'logo-b' }
    ],
    groups: groups,
    registerInfo: {
      users: [
        { userId: 'pA1', matchTeamId: 'red' },
        { userId: 'pB1', matchTeamId: 'blue' }
      ]
    },
    scoreData: scoreData,
    seriesContext: over.seriesContext || {
      seriesId: 's1',
      roundId: 'r1',
      matchId: over.matchId || 'm1'
    }
  };
}

function seriesFixture(store) {
  var series = {
    seriesId: 's1',
    seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
    publishToken: 'tok',
    hostMode: 'organization',
    participants: [
      { kind: 'team', seriesParticipantId: 'team:a', sourceTeamId: 'red', nameSnapshot: '红队' },
      { kind: 'team', seriesParticipantId: 'team:b', sourceTeamId: 'blue', nameSnapshot: '蓝队' }
    ],
    rounds: [
      { roundId: 'r1', matchId: 'm1', roundStatus: 'scheduled' },
      { roundId: 'r2', matchId: 'm2', roundStatus: 'scheduled' }
    ],
    scoringRule: seriesRyderCup.createRyderCupScoringRule()
  };
  return {
    series: series,
    deps: {
      getMatchById: function (id) {
        return store[id] || null;
      },
      getIndexByMatchId: function (id) {
        return store[id] ? { matchId: id, seriesId: 's1' } : null;
      },
      evaluateRoundStationGate: function (s, round) {
        var m = store[round.matchId];
        if (!m) {
          return {
            canEnterRound: false,
            blockReason: 'match_missing',
            match: null,
            matchId: round.matchId
          };
        }
        var ctx = m.seriesContext || {};
        if (String(ctx.roundId) !== String(round.roundId)) {
          return {
            canEnterRound: false,
            blockReason: 'context_round_id_conflict',
            match: m,
            matchId: round.matchId
          };
        }
        return { canEnterRound: true, match: m, matchId: round.matchId, blockReason: '' };
      }
    }
  };
}

function project(fx, selectedKey, extra) {
  var o = extra || {};
  return viewModel.buildSeriesStandingsProjection({
    series: fx.series,
    selectedKey: selectedKey,
    roundStates: [
      { roundId: 'r1', index: 1, label: 'R1', state: 'grouped' },
      { roundId: 'r2', index: 2, label: 'R2', state: 'grouped' }
    ],
    userPicked: o.userPicked !== undefined ? o.userPicked : true,
    visited: o.visited !== undefined ? o.visited : true,
    getMatchById: fx.deps.getMatchById,
    getIndexByMatchId: fx.deps.getIndexByMatchId,
    evaluateRoundStationGate: fx.deps.evaluateRoundStationGate
  });
}

function isRyderShell(vm) {
  return (
    vm &&
    vm.useRyderCupScoreboard === true &&
    vm.available === true &&
    vm.mode === seriesRyderCup.SCORING_MODE &&
    vm.showTot === false &&
    !vm.totalSelector &&
    String(vm.unavailableTitle || '').indexOf('每轮前 N 名') < 0 &&
    String(vm.unavailableMessage || '').indexOf('每轮前 N 名') < 0
  );
}

function matchIds(vm) {
  var list = vm && vm.matchPlayScoreboard && vm.matchPlayScoreboard.matches;
  if (!Array.isArray(list)) return [];
  return list.map(function (m) {
    return m && m.id;
  });
}

var m1 = g5Match({
  matchId: 'm1',
  g1: 'g-r1',
  seriesContext: { seriesId: 's1', roundId: 'r1', matchId: 'm1' }
});
var m2 = g5Match({
  matchId: 'm2',
  g1: 'g-r2',
  scores: holeScores(false),
  seriesContext: { seriesId: 's1', roundId: 'r2', matchId: 'm2' }
});
var fx = seriesFixture({ m1: m1, m2: m2 });

assert(
  '完整构建与轻量重建共用 buildSeriesStandingsProjection',
  vmSrc.indexOf('function buildSeriesStandingsProjection') >= 0 &&
    /var standings = buildSeriesStandingsProjection\(/.test(vmSrc) &&
    pageJs.indexOf('viewModel.buildSeriesStandingsProjection') >= 0
);

assert(
  '轻量重建不再直接调用普通 standings VM',
  !/_rebuildStandingsProjection:\s*function[\s\S]*?standingsViewModel\.buildSeriesStandingsViewModel/.test(
    pageJs
  )
);

assert(
  '分流仅认显式 ryder_cup',
  /isRyderCupSeries\(series\)/.test(vmSrc) &&
    vmSrc.indexOf('templateId') >= 0 &&
    /if \(isRyderCup\) \{[\s\S]*buildRyderCupStandingsView/.test(vmSrc)
);

var first = project(fx, '', { userPicked: false, visited: false });
assert(
  '显式莱德杯首次默认 R1',
  isRyderShell(first) && first.selectedKey === 'r1' && matchIds(first).indexOf('g-r1') >= 0
);

var r2 = project(fx, 'r2');
assert('点击 R2 后仍走 Ryder adapter', isRyderShell(r2) && r2.selectedKey === 'r2');
assert('R2 有分组时展示 R2 对阵', matchIds(r2).indexOf('g-r2') >= 0 && matchIds(r2).indexOf('g-r1') < 0);

assert(
  'R1、R2 的 groupId 不串轮',
  matchIds(first).join(',') === 'g-r1' && matchIds(r2).join(',') === 'g-r2'
);

assert(
  '顶部累计分切换前后相同',
  first.seriesRedScore === r2.seriesRedScore &&
    first.seriesBlueScore === r2.seriesBlueScore &&
    first.seriesRedScore === 1 &&
    first.seriesBlueScore === 1
);

var back = project(fx, 'r1');
assert('再点 R1 可正常返回', isRyderShell(back) && back.selectedKey === 'r1' && matchIds(back)[0] === 'g-r1');

var tapFn = extractFn(pageJs, 'onStandingsRoundTap');
var rebuildFn = extractFn(pageJs, '_rebuildStandingsProjection');
assert(
  '未吸顶分支切 R2 走同一 rebuild',
  /if \(!this\.data\.isStickyRoundSelector\) \{[\s\S]*applyRebuild\(extraBase\);[\s\S]*return;/.test(
    tapFn
  ) && tapFn.indexOf('_rebuildStandingsProjection') >= 0
);
assert(
  'sticky 分支切 R2 仍 applyRebuild',
  tapFn.indexOf('_measureStandingsContentHostHeight') >= 0 &&
    /_measureStandingsContentHostHeight[\s\S]*applyRebuild\(extraBase\)/.test(tapFn)
);
assert(
  'rebuild 传入 roundId 会话与 station 依赖',
  rebuildFn.indexOf('selectedKey: this._standingsSelectedKey') >= 0 &&
    rebuildFn.indexOf('userPicked: !!this._standingsUserPicked') >= 0 &&
    rebuildFn.indexOf('visited: !!this._standingsVisited') >= 0 &&
    rebuildFn.indexOf('_getStandingsStationDeps') >= 0 &&
    rebuildFn.indexOf('getMatchById: stationDeps.getMatchById') >= 0 &&
    rebuildFn.indexOf('getIndexByMatchId: stationDeps.getIndexByMatchId') >= 0 &&
    rebuildFn.indexOf('evaluateRoundStationGate') >= 0 &&
    rebuildFn.indexOf('_cachedStandingsResult') >= 0
);

var missing = project(seriesFixture({ m1: m1 }), 'r2');
assert(
  'R2 station 缺失仍保持莱德杯外壳',
  isRyderShell(missing) &&
    missing.selectedKey === 'r2' &&
    missing.selectedRoundStationOk === false &&
    (!missing.matchPlayScoreboard.matches || missing.matchPlayScoreboard.matches.length === 0)
);

var gm = viewModel.buildSeriesStandingsProjection({
  series: {
    seriesId: 'sg',
    scoringRule: { mode: 'global_m', globalM: 2, scoreBasis: 'gross' },
    participants: [{ seriesParticipantId: 'team:a', nameSnapshot: '甲' }],
    rounds: [
      { roundId: 'r1', matchId: 'm1' },
      { roundId: 'r2', matchId: 'm2' }
    ]
  },
  selectedKey: 'r2',
  userPicked: true,
  visited: true,
  roundStates: [
    { roundId: 'r1', index: 1, label: 'R1', state: 'grouped' },
    { roundId: 'r2', index: 2, label: 'R2', state: 'grouped' }
  ],
  standingsResult: standingsVm.emptyStandingsResult()
});
assert(
  '普通 global_m 切轮仍走普通 VM',
  gm.mode === 'global_m' &&
    gm.available === true &&
    !gm.useRyderCupScoreboard &&
    gm.selectedKey === 'r2' &&
    !!gm.totalSelector
);

var pn = viewModel.buildSeriesStandingsProjection({
  series: {
    seriesId: 'sp',
    scoringRule: { mode: 'per_round_n', scoreBasis: 'gross' },
    participants: [{ seriesParticipantId: 'team:a', nameSnapshot: '甲' }],
    rounds: [
      { roundId: 'r1', matchId: 'm1' },
      { roundId: 'r2', matchId: 'm2' }
    ]
  },
  selectedKey: 'r2',
  userPicked: true,
  visited: true,
  roundStates: [
    { roundId: 'r1', index: 1, label: 'R1', state: 'grouped' },
    { roundId: 'r2', index: 2, label: 'R2', state: 'grouped' }
  ],
  standingsResult: standingsVm.emptyStandingsResult()
});
assert(
  '普通 per_round_n 切轮仍走普通 VM',
  pn.mode === 'per_round_n' &&
    pn.available === true &&
    !pn.useRyderCupScoreboard &&
    pn.selectedKey === 'r2' &&
    pn.showTot === false
);

assert(
  '仅 templateId/ryder 不走莱德杯切轮',
  !seriesRyderCup.isRyderCupSeries({ templateId: 'ryder', scoringRule: { mode: 'ryder_match_play' } })
);

if (failed) {
  console.log('\nFAILED ' + failed);
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
  process.exit(1);
}
console.log('\nAll ' + passed + ' passed');
