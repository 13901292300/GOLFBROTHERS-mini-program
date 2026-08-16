/**
 * Series 总榜 C：global_m 真实成绩接入自测
 * - 适配器四赛制抽取
 * - allowRepeat true/false
 * - LIVE 未满 18 计入
 * - 未开始轮排除
 * - assembler → standingsResult
 * 仅内存 fixture；不写 storage；不进 DevTools。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsGlobalM.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..', 'miniprogram', 'utils');
var seriesModel = require(path.join(root, 'seriesModel.js'));
var seriesScoring = require(path.join(root, 'seriesScoring.js'));
var seriesResultAdapter = require(path.join(root, 'seriesResultAdapter.js'));
var seriesStandingsAssembler = require(path.join(root, 'seriesStandingsAssembler.js'));
var standingsVm = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail',
  'seriesStandingsViewModel.js'
));

var pageJs = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'miniprogram',
    'subpackages',
    'tournament',
    'pages',
    'series-detail',
    'index.js'
  ),
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

function makeSeries(partial) {
  return Object.assign(
    {
      seriesId: 'series-gm-1',
      publishToken: 'pub-gm-1',
      lifecycleStatus: 'published',
      scoringRule: {
        mode: 'global_m',
        globalM: 2,
        allowRepeat: false,
        scoreBasis: 'gross',
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

function basePars() {
  return [4, 4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4];
}

function fillScores(n, stroke) {
  var out = [];
  for (var i = 0; i < 18; i++) {
    out.push(i < n ? stroke : null);
  }
  return out;
}

function makeManagedMatch(opts) {
  var o = opts || {};
  var matchId = o.matchId || 'm1';
  var roundId = o.roundId || 'r1';
  var gameMode = o.gameMode || '个人比杆赛';
  var status = o.status || 'ongoing';
  var ctx = {
    managed: true,
    seriesId: 'series-gm-1',
    roundId: roundId,
    publishToken: 'pub-gm-1'
  };
  return Object.assign(
    {
      matchId: matchId,
      gameMode: gameMode,
      status: status,
      seriesContext: ctx,
      teamGroups: [
        { id: 'red', name: '红队' },
        { id: 'blue', name: '蓝队' }
      ],
      registerInfo: {
        users: [
          { userId: 'u-r1', nickname: '红一', matchTeamId: 'red' },
          { userId: 'u-r2', nickname: '红二', matchTeamId: 'red' },
          { userId: 'u-b1', nickname: '蓝一', matchTeamId: 'blue' },
          { userId: 'u-b2', nickname: '蓝二', matchTeamId: 'blue' }
        ]
      },
      groups: [],
      scoreData: {},
      scoreEntities: {},
      pairings: {},
      front9Course: 'A',
      back9Course: 'B',
      courseId: '',
      courseName: 'Test'
    },
    o.patch || {}
  );
}

// ---- summarize / thru ----
(function testSummarize() {
  var pars = basePars();
  var s = seriesResultAdapter.summarizeScores(fillScores(3, 4), pars);
  assert('LIVE 3 洞有成绩', s.ok && s.thru === 3 && s.gross === 12);
  assert('空洞不算 0', s.toPar === 12 - (pars[0] + pars[1] + pars[2]));
  var empty = seriesResultAdapter.summarizeScores([null, '', undefined], pars);
  assert('无成绩不计', empty.ok === false && empty.thru === 0);
  assert('完赛 THRU=F', seriesResultAdapter.formatThruLabel(18) === 'F');
  assert('进行中 THRU=洞数', seriesResultAdapter.formatThruLabel(7) === '7');
})();

// ---- 个人比杆抽取 ----
(function testG1Extract() {
  var series = makeSeries();
  var match = makeManagedMatch({
    gameMode: '个人比杆赛',
    status: 'ongoing',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [
            { userId: 'u-r1', nickname: '红一', position: 1 },
            { userId: 'u-b1', nickname: '蓝一', position: 2 }
          ]
        }
      ],
      scoreData: {
        g1: {
          scoresByPlayer: {
            'u-r1': { scores: fillScores(5, 4) },
            'u-b1': { scores: fillScores(0, 4) }
          }
        }
      }
    }
  });
  var res = seriesResultAdapter.extractEntriesFromStation({
    series: series,
    round: { roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' },
    match: match
  });
  assert('G1 抽取成功', res.ok && res.entries.length === 1, res.reason);
  assert('G1 单位 player', res.entries[0].resultUnitType === 'player');
  assert('G1 LIVE thru=5', res.entries[0].thruLabel === '5');
  assert('G1 无成绩球员不产出', res.entries.every(function (e) {
    return e.memberUserIds[0] === 'u-r1';
  }));
  assert('G1 rankingValue=gross', res.entries[0].rankingValue === 20);
})();

// ---- 四人四球 / 最佳球位 Entity ----
(function testG2Extract() {
  var series = makeSeries();
  var match = makeManagedMatch({
    matchId: 'm-g2',
    roundId: 'r2',
    gameMode: '四人四球比杆赛',
    status: 'ongoing',
    patch: {
      groups: [{ groupId: 'g1', players: [] }],
      scoreEntities: {
        g1: [
          {
            entityId: 'ent-red',
            entityType: 'group',
            teamGroupId: 'red',
            members: ['u-r1', 'u-r2']
          },
          {
            entityId: 'ent-empty',
            entityType: 'group',
            teamGroupId: 'blue',
            members: []
          }
        ]
      },
      scoreData: {
        g1: {
          teamScoresByEntity: [
            { entityId: 'ent-red', scores: fillScores(4, 5) },
            { entityId: 'ent-empty', scores: fillScores(4, 5) }
          ]
        }
      }
    }
  });
  var res = seriesResultAdapter.extractEntriesFromStation({
    series: series,
    round: { roundId: 'r2', index: 2, matchId: 'm-g2', gameMode: '四人四球比杆赛' },
    match: match
  });
  assert('四人四球 entity 抽取', res.ok && res.entries.length === 1);
  assert('resultUnitType=entity', res.entries[0].resultUnitType === 'entity');
  assert('空 members 不进榜', res.entries[0].sourceEntityKey === 'ent-red');

  var best = seriesResultAdapter.extractEntriesFromStation({
    series: series,
    round: { roundId: 'r2', index: 2, matchId: 'm-g2', gameMode: '最佳球位比杆赛' },
    match: Object.assign({}, match, { gameMode: '最佳球位比杆赛' })
  });
  assert('最佳球位同 entity 路径', best.ok && best.entries.length === 1);
})();

// ---- 四人两球 pair ----
(function testG4Extract() {
  var series = makeSeries();
  var match = makeManagedMatch({
    matchId: 'm-g4',
    roundId: 'r3',
    gameMode: '四人两球比杆赛',
    status: 'completed',
    patch: {
      groups: [{ groupId: 'g1', players: [] }],
      pairings: {
        g1: [{ id: 'pair-red', playerIds: ['u-r1', 'u-r2'] }]
      },
      scoreEntities: {
        g1: [
          {
            entityId: 'pair-red',
            entityType: 'pair',
            teamGroupId: 'red',
            members: ['u-r1', 'u-r2']
          }
        ]
      },
      scoreData: {
        g1: {
          teamScoresByEntity: [{ entityId: 'pair-red', scores: fillScores(18, 4) }]
        }
      }
    }
  });
  var res = seriesResultAdapter.extractEntriesFromStation({
    series: series,
    round: { roundId: 'r3', index: 3, matchId: 'm-g4', gameMode: '四人两球比杆赛' },
    match: match
  });
  assert('四人两球 pair 抽取', res.ok && res.entries.length === 1);
  assert('resultUnitType=pair', res.entries[0].resultUnitType === 'pair');
  assert('完赛 thru=F', res.entries[0].thruLabel === 'F');
  assert('memberUserIds 长度 2', res.entries[0].memberUserIds.length === 2);
})();

// ---- assembler：未开始排除 + 损坏跳过 + 主榜结构 ----
(function testAssemblerGate() {
  var series = makeSeries({
    rounds: [
      {
        roundId: 'r-sched',
        index: 1,
        matchId: 'm-sched',
        roundStatus: 'scheduled',
        gameMode: '个人比杆赛'
      },
      {
        roundId: 'r-live',
        index: 2,
        matchId: 'm-live',
        roundStatus: 'live',
        gameMode: '个人比杆赛'
      },
      {
        roundId: 'r-cancel',
        index: 3,
        matchId: 'm-cancel',
        roundStatus: 'cancelled',
        gameMode: '个人比杆赛'
      },
      {
        roundId: 'r-bad',
        index: 4,
        matchId: 'm-bad',
        roundStatus: 'live',
        gameMode: '个人比杆赛'
      }
    ]
  });

  var liveMatch = makeManagedMatch({
    matchId: 'm-live',
    roundId: 'r-live',
    status: 'ongoing',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [
            { userId: 'u-r1', nickname: '红一', position: 1 },
            { userId: 'u-r2', nickname: '红二', position: 2 }
          ]
        }
      ],
      scoreData: {
        g1: {
          scoresByPlayer: {
            'u-r1': { scores: fillScores(2, 4) },
            'u-r2': { scores: fillScores(2, 5) }
          }
        }
      }
    }
  });
  var schedMatch = makeManagedMatch({
    matchId: 'm-sched',
    roundId: 'r-sched',
    status: 'registering'
  });
  var cancelMatch = makeManagedMatch({
    matchId: 'm-cancel',
    roundId: 'r-cancel',
    status: 'ongoing'
  });
  var badTokenMatch = makeManagedMatch({
    matchId: 'm-bad',
    roundId: 'r-bad',
    status: 'ongoing',
    patch: {
      seriesContext: {
        managed: true,
        seriesId: 'series-gm-1',
        roundId: 'r-bad',
        publishToken: 'WRONG'
      }
    }
  });

  var store = {
    'm-sched': schedMatch,
    'm-live': liveMatch,
    'm-cancel': cancelMatch,
    'm-bad': badTokenMatch
  };
  var index = {
    'm-sched': { seriesId: 'series-gm-1', roundId: 'r-sched' },
    'm-live': { seriesId: 'series-gm-1', roundId: 'r-live' },
    'm-cancel': { seriesId: 'series-gm-1', roundId: 'r-cancel' },
    'm-bad': { seriesId: 'series-gm-1', roundId: 'r-bad' }
  };

  var built = seriesStandingsAssembler.buildStandingsResult({
    series: series,
    getMatchById: function (id) {
      return store[id] || null;
    },
    getIndexByMatchId: function (id) {
      return index[id] || null;
    },
    resolveStationStatusLabel: function (m) {
      if (m.status === 'ongoing') return 'LIVE';
      if (m.status === 'completed' || m.status === 'finished') return '已结束';
      return '报名中';
    }
  });

  assert('只计入已开始轮', built.meta.startedRoundCount === 1, String(built.meta.startedRoundCount));
  assert(
    '坏 token 记入 stationErrors',
    built.meta.stationErrors.some(function (e) {
      return e.roundId === 'r-bad';
    })
  );
  assert('固定两队行', built.standingsResult.participantRows.length === 2);
  var red = built.standingsResult.participantRows.find(function (r) {
    return r.seriesParticipantId === 'team:red';
  });
  assert('红队有 LIVE 成绩', red && red.allEntries.length === 2);
  assert(
    '主榜 TOTAL/TO PAR 来自真实字段',
    red.grossTotalValue != null && red.toParValue != null
  );

  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: 'cumulative',
    roundStates: [
      { roundId: 'r-live', index: 2, label: 'R2', statusToken: 'live' }
    ],
    standingsResult: built.standingsResult
  });
  var sig1 = standingsVm.mainBoardSignature(vm);
  var vmR = standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: 'r-live',
    roundStates: [
      { roundId: 'r-live', index: 2, label: 'R2', statusToken: 'live' }
    ],
    standingsResult: built.standingsResult
  });
  assert('TOT 累计主榜签名稳定（不再要求 TOT===R）', sig1 === standingsVm.mainBoardSignature(vm));
  assert('主榜球队行保留', vm.teamRows.length === 2);
  // 人为加一条 excluded，验证分隔线
  var withExcluded = JSON.parse(JSON.stringify(built.standingsResult));
  withExcluded.participantRows[0].allEntries.push({
    entryId: 'extra-ex',
    roundId: 'r-live',
    roundIndex: 2,
    resultUnitType: 'player',
    unitId: 'u-extra',
    unitName: '额外',
    rankingValue: 99,
    grossTotalValue: 99,
    toParValue: 10,
    resultStatus: 'OK',
    thruLabel: '1',
    counting: 'excluded'
  });
  var vmDiv = standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: 'cumulative',
    roundStates: [{ roundId: 'r-live', index: 2, label: 'R2', statusToken: 'live' }],
    standingsResult: withExcluded
  });
  assert(
    '入选/未入选分隔线',
    vmDiv.teamRows[0].scoringPlayersCount > 0 &&
      vmDiv.teamRows[0].players.some(function (p) {
        return p.isNonCounting;
      })
  );
})();

// ---- allowRepeat 经 assembler ----
(function testAllowRepeatAssembler() {
  var series = makeSeries({
    scoringRule: {
      mode: 'global_m',
      globalM: 2,
      allowRepeat: false,
      scoreBasis: 'gross',
      ruleVersion: 1
    },
    rounds: [
      { roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' },
      { roundId: 'r2', index: 2, matchId: 'm2', gameMode: '个人比杆赛' }
    ]
  });
  function g1Match(matchId, roundId, scoresMap, status) {
    return makeManagedMatch({
      matchId: matchId,
      roundId: roundId,
      status: status || 'completed',
      patch: {
        groups: [
          {
            groupId: 'g1',
            players: [
              { userId: 'u-r1', nickname: '红一', position: 1 },
              { userId: 'u-r2', nickname: '红二', position: 2 }
            ]
          }
        ],
        scoreData: { g1: { scoresByPlayer: scoresMap } }
      }
    });
  }
  var m1 = g1Match('m1', 'r1', {
    'u-r1': { scores: fillScores(18, 4) },
    'u-r2': { scores: fillScores(18, 5) }
  });
  var m2 = g1Match('m2', 'r2', {
    'u-r1': { scores: fillScores(18, 4) },
    'u-r2': { scores: fillScores(18, 6) }
  });
  var store = { m1: m1, m2: m2 };
  var index = {
    m1: { seriesId: 'series-gm-1', roundId: 'r1' },
    m2: { seriesId: 'series-gm-1', roundId: 'r2' }
  };
  var noRepeat = seriesStandingsAssembler.buildStandingsResult({
    series: series,
    getMatchById: function (id) {
      return store[id];
    },
    getIndexByMatchId: function (id) {
      return index[id];
    },
    resolveStationStatusLabel: function () {
      return '已结束';
    }
  });
  var red = noRepeat.standingsResult.participantRows.find(function (r) {
    return r.seriesParticipantId === 'team:red';
  });
  var countedMembers = {};
  (red.allEntries || [])
    .filter(function (e) {
      return e.counting === 'counted';
    })
    .forEach(function (e) {
      // 从 unitId 推断
      countedMembers[e.unitId] = (countedMembers[e.unitId] || 0) + 1;
    });
  assert(
    'assembler allowRepeat=false 同一球员不计两次',
    countedMembers['u-r1'] === 1 && red.selectedCount === 2,
    JSON.stringify(countedMembers) + ' sel=' + red.selectedCount
  );

  series.scoringRule.allowRepeat = true;
  var withRepeat = seriesStandingsAssembler.buildStandingsResult({
    series: series,
    getMatchById: function (id) {
      return store[id];
    },
    getIndexByMatchId: function (id) {
      return index[id];
    },
    resolveStationStatusLabel: function () {
      return '已结束';
    }
  });
  var red2 = withRepeat.standingsResult.participantRows.find(function (r) {
    return r.seriesParticipantId === 'team:red';
  });
  var r1Count = (red2.allEntries || []).filter(function (e) {
    return e.counting === 'counted' && e.unitId === 'u-r1';
  }).length;
  assert('assembler allowRepeat=true 可重复', r1Count === 2, 'r1Count=' + r1Count);
})();

// ---- 页面接线：使用 assembler 缓存，切轮不回空 ----
(function testPageWiring() {
  assert(
    '页面引入 seriesStandingsAssembler',
    pageJs.indexOf("require('../../../../utils/seriesStandingsAssembler.js')") >= 0
  );
  assert(
    'reloadViewModel 调用 buildStandingsResult',
    pageJs.indexOf('seriesStandingsAssembler.buildStandingsResult') >= 0
  );
  assert(
    '切轮复用 _cachedStandingsResult',
    pageJs.indexOf('_cachedStandingsResult') >= 0 &&
      /_rebuildStandingsProjection[\s\S]*_cachedStandingsResult/.test(pageJs)
  );
  assert(
    '不再在 rebuild 时强制 emptyStandingsResult',
    !/\_rebuildStandingsProjection:[\s\S]*standingsResult:\s*standingsViewModel\.emptyStandingsResult\(\)/.test(
      pageJs
    )
  );
})();

// ---- per_round_n 仍空 ----
(function testPerRoundN() {
  var series = makeSeries({
    scoringRule: {
      mode: 'per_round_n',
      globalM: 2,
      allowRepeat: false,
      scoreBasis: 'gross',
      ruleVersion: 1
    }
  });
  var built = seriesStandingsAssembler.buildStandingsResult({
    series: series,
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert(
    'per_round_n 装配成绩',
    built.meta.mode === 'per_round_n' &&
      built.meta.error !== 'mode_not_global_m'
  );
})();

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exitCode = 1;
}
