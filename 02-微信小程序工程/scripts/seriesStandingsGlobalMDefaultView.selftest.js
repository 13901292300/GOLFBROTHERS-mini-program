/**
 * global_m 总榜默认视角：TOT 球队；单轮首次查看全部；按 roundId 记忆。
 * 运行：node scripts/seriesStandingsGlobalMDefaultView.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');

var viewOptions = require(path.join(seriesDir, 'seriesStandingsViewOptions.js'));
var liveAdapter = require(path.join(seriesDir, 'seriesLiveLeaderboardAdapter.js'));
var personalLeaderboardBoard = require(path.join(utilsDir, 'personalLeaderboardBoard.js'));
var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));

var pageJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var viewSrc = fs.readFileSync(path.join(seriesDir, 'seriesStandingsViewOptions.js'), 'utf8');
var perRoundSrc = fs.readFileSync(
  path.join(__dirname, 'seriesStandingsPerRoundNAllView.selftest.js'),
  'utf8'
);

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

function g1Match() {
  return {
    matchId: 'm-g1',
    gameMode: '个人比杆赛',
    teamGroups: [{ teamId: 't1' }, { teamId: 't2' }],
    groups: [
      {
        groupId: 'g1',
        players: [
          { userId: 'u1', competitionName: '甲', gender: 'male', matchTeamId: 't1' },
          { userId: 'u2', competitionName: '乙', gender: 'female', matchTeamId: 't2' },
          { userId: 'u3', competitionName: '丙', gender: 'male', matchTeamId: 't1' }
        ]
      }
    ],
    scoreData: {
      g1: {
        scoresByPlayer: {
          u1: { scores: [4, 4, 4] },
          u2: { scores: [5, 5] },
          u3: { scores: [3] }
        }
      }
    }
  };
}

function g2Match() {
  return {
    matchId: 'm-g2',
    gameMode: '四人四球比杆赛',
    teamGroups: [{ teamId: 't1' }, { teamId: 't2' }],
    groups: [
      {
        groupId: 'g1',
        players: [
          { userId: 'a1', competitionName: 'A1', gender: 'male', matchTeamId: 't1' },
          { userId: 'a2', competitionName: 'A2', gender: 'female', matchTeamId: 't1' },
          { userId: 'b1', competitionName: 'B1', gender: 'male', matchTeamId: 't2' },
          { userId: 'b2', competitionName: 'B2', gender: 'female', matchTeamId: 't2' }
        ]
      }
    ],
    scoreEntities: {
      g1: [
        { entityId: 'e-t1', entityType: 'team', members: ['a1', 'a2'] },
        { entityId: 'e-t2', entityType: 'team', members: ['b1', 'b2'] }
      ]
    },
    scoreData: {
      g1: {
        teamScoresByEntity: [
          { entityId: 'e-t1', scores: [4, 4] },
          { entityId: 'e-t2', scores: [5] }
        ]
      }
    }
  };
}

function g4Match() {
  return {
    matchId: 'm-g4',
    gameMode: '四人两球比杆赛',
    teamGroups: [{ teamId: 't1' }, { teamId: 't2' }],
    groups: [
      {
        groupId: 'g1',
        players: [
          { userId: 'c1', competitionName: 'C1', matchTeamId: 't1' },
          { userId: 'c2', competitionName: 'C2', matchTeamId: 't1' },
          { userId: 'd1', competitionName: 'D1', matchTeamId: 't2' },
          { userId: 'd2', competitionName: 'D2', matchTeamId: 't2' }
        ]
      }
    ],
    pairings: {
      g1: [{ pairId: 'p1', members: ['c1', 'c2'] }, { pairId: 'p2', members: ['d1', 'd2'] }]
    },
    scoreEntities: {
      g1: [
        { entityId: 'p1', entityType: 'pair', members: ['c1', 'c2'] },
        { entityId: 'p2', entityType: 'pair', members: ['d1', 'd2'] }
      ]
    }
  };
}

function pick(selectedKey, scoringMode, match, memory) {
  return viewOptions.resolveStandingsSessionSelection({
    selectedKey: selectedKey,
    scoringMode: scoringMode,
    match: match,
    rememberedByRoundId: memory || {}
  });
}

function remember(memory, roundId, selection) {
  if (!roundId || roundId === standingsVm.CUMULATIVE_KEY) return;
  memory[roundId] = selection;
}

var GM = 'global_m';
var PRN = 'per_round_n';
var TOT = standingsVm.CUMULATIVE_KEY;

assert(
  'global_m 首次 R1 默认查看全部',
  pick('r1', GM, g1Match()).view === 'all'
);
assert(
  'global_m 首次 R2 默认查看全部',
  pick('r2', GM, g1Match()).view === 'all'
);
assert(
  'global_m 首次 C1 roundId 默认查看全部',
  pick('round-c1', GM, g1Match()).view === 'all'
);
assert(
  'LIVE 轮首次进入默认查看全部',
  pick('r-live', GM, g1Match()).view === 'all'
);
assert(
  'TOT 始终为球队',
  pick(TOT, GM, g1Match()).view === 'team' &&
    pick(TOT, GM, g1Match(), { cumulative: { view: 'all' } }).view === 'team'
);

(function testRememberPerRound() {
  var memory = Object.create(null);
  var match = g1Match();
  var first = pick('r1', GM, match, memory);
  assert('未手选前 R1 为全部', first.view === 'all');
  remember(memory, 'r1', { view: 'team', scoreType: 'gross' });
  assert(
    '单轮手动切球队后返回可恢复',
    pick('r1', GM, match, memory).view === 'team'
  );
  assert(
    '不同轮次分别保存：R2 仍默认全部',
    pick('r2', GM, match, memory).view === 'all'
  );
  remember(memory, 'r2', { view: 'all', scoreType: 'gross' });
  var totSel = pick(TOT, GM, match, memory);
  remember(memory, TOT, { view: 'all', scoreType: 'gross' });
  assert(
    'TOT 不污染单轮选择',
    totSel.view === 'team' &&
      pick('r1', GM, match, memory).view === 'team' &&
      pick('r2', GM, match, memory).view === 'all' &&
      pick('r3', GM, match, memory).view === 'all'
  );
})();

assert(
  'G1 查看全部 list unit=player',
  viewOptions.resolveListUnit(g1Match(), 'gross') === 'player' &&
    pick('r1', GM, g1Match()).view === 'all' &&
    pick('r1', GM, g1Match()).view !== 'male' &&
    pick('r1', GM, g1Match()).view !== 'female'
);

assert(
  'G2 查看全部为组合 unit=entity，不是男女筛选',
  viewOptions.resolveListUnit(g2Match(), 'gross') === 'entity' &&
    pick('r1', GM, g2Match()).view === 'all'
);
assert(
  'G4 查看全部为 Pair unit=pair，不是男女筛选',
  viewOptions.resolveListUnit(g4Match(), 'gross') === 'pair' &&
    pick('r1', GM, g4Match()).view === 'all'
);

(function testAllViewNotTopM() {
  var fakeProjected = {
    overlay: {
      liveLeaderboard: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }],
      leaderboardViewLabel: 'ALL'
    }
  };
  var overlay = liveAdapter.applyGlobalMRnStandingsOverlay(
    {
      selectedKey: 'r1',
      mode: GM,
      teamRows: [{ teamId: 'only-top-m' }]
    },
    { view: 'all', scoreType: 'gross' },
    fakeProjected,
    {}
  );
  assert(
    'Top M 不截断单轮全部榜',
    overlay.liveLeaderboard.length === 3 && overlay.useLiveLeaderboard === true
  );
})();

assert(
  'per_round_n 首次单轮仍默认球队（不套 global_m 规则）',
  pick('r1', PRN, g1Match()).view === 'team' &&
    viewOptions.resolveSeriesStandingsDefaultView(g1Match()) === 'team' &&
    viewOptions.normalizeSeriesStandingsSelection(g1Match(), undefined).view === 'team'
);
assert(
  'per_round_n 自测仍覆盖查看全部全量计分单元',
  perRoundSrc.indexOf('per_round_n') >= 0 &&
    perRoundSrc.indexOf('不按 Top N 截断') >= 0
);

assert(
  '页面按 roundId 记忆且 TOT 不写入',
  pageJs.indexOf('_standingsSelectionByRoundId') >= 0 &&
    pageJs.indexOf('resolveStandingsSessionSelection') >= 0 &&
    /_rememberStandingsSelection:[\s\S]{0,280}isCumulativeStandingsKey/.test(pageJs) &&
    pageJs.indexOf('_standingsViewByRoundId[index]') < 0 &&
    pageJs.indexOf('_standingsSelectionByRoundId[i]') < 0
);

assert(
  '出发表跳转总榜仍用 roundId',
  /onScheduleViewLeaderboard[\s\S]{0,400}_standingsSelectedKey = rid/.test(pageJs)
);

assert(
  'G2 默认全部不是拆成独立选手 unit',
  viewOptions.resolveListUnit(g2Match(), 'gross') !== 'player'
);

assert(
  'shouldBuildEntityList G2/G4 为组合',
  viewOptions.shouldBuildEntityList(g2Match()) === true &&
    viewOptions.shouldBuildEntityList(g4Match()) === true &&
    personalLeaderboardBoard.shouldBuildEntityLeaderboard(g2Match()) === true
);

assert(
  'global_m 单轮默认走 VIEW.all 分支',
  /scoringMode === 'global_m'[\s\S]{0,80}VIEW\.all/.test(viewSrc)
);

console.log('');
console.log(
  'seriesStandingsGlobalMDefaultView.selftest: ' + passed + ' passed, ' + failed + ' failed'
);
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
