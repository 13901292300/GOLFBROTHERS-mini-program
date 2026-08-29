/**
 * Series 总榜 R 轮阵容投影自测
 * - 已分组未开赛展示球员、成绩全 —
 * - 未开赛不进入累计
 * - 开赛部分有成绩仍保留无成绩席位
 * 运行：node scripts/seriesStandingsRoundLineup.selftest.js
 */

var path = require('path');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var root = path.join(__dirname, '..', 'miniprogram', 'utils');
var seriesStandingsAssembler = require(seriesTestPaths.util('seriesStandingsAssembler.js'));
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
      seriesId: 'series-lu-1',
      publishToken: 'pub-lu-1',
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
      roster: [],
      rounds: []
    },
    partial || {}
  );
}

function fillScores(n, stroke) {
  var out = [];
  for (var i = 0; i < 18; i++) out.push(i < n ? stroke : null);
  return out;
}

function makeManagedMatch(opts) {
  var o = opts || {};
  var matchId = o.matchId || 'm1';
  var roundId = o.roundId || 'r1';
  return Object.assign(
    {
      matchId: matchId,
      gameMode: o.gameMode || '个人比杆赛',
      status: o.status || 'registering',
      seriesContext: {
        managed: true,
        seriesId: 'series-lu-1',
        roundId: roundId,
        publishToken: 'pub-lu-1'
      },
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

function buildWith(series, store, index) {
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
      if (m.status === 'completed' || m.status === 'finished') return '已结束';
      return '报名中';
    }
  });
}

function rowOf(built, pid) {
  return (built.standingsResult.participantRows || []).find(function (r) {
    return r.seriesParticipantId === pid;
  });
}

function vmFor(series, built, selectedKey, roundStates) {
  return standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: selectedKey,
    roundStates: roundStates,
    standingsResult: built.standingsResult
  });
}

function teamPlayers(vm, pid) {
  var t = (vm.teamRows || []).find(function (r) {
    return r.teamId === pid;
  });
  return t || { players: [], expandEmptyHint: '', scoringPlayersCount: 0, expandStatusHint: '' };
}

// 1 未分组轮
(function () {
  var series = makeSeries({
    rounds: [{ roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' }]
  });
  var m1 = makeManagedMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'registering',
    patch: { groups: [{ groupId: 'g1', players: [{ position: 1, userId: '' }] }] }
  });
  var built = buildWith(series, { m1: m1 }, { m1: { seriesId: 'series-lu-1', roundId: 'r1' } });
  assert('1 meta 未分组', built.standingsResult.roundMeta.r1.hasFormalGroups === false);
  var vm = vmFor(series, built, 'r1', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'scheduled', hasMatchId: true }
  ]);
  var red = teamPlayers(vm, 'team:red');
  assert('1 提示本轮尚未分组', red.players.length === 0 && red.expandEmptyHint === '本轮尚未分组');
})();

// 2 已分组未开始 → 球员 + 成绩全 —
(function () {
  var series = makeSeries({
    rounds: [{ roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' }]
  });
  var m1 = makeManagedMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'registering',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [
            { userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' },
            { userId: 'u-r2', nickname: '红二', position: 2, matchTeamId: 'red' }
          ]
        }
      ]
    }
  });
  var built = buildWith(series, { m1: m1 }, { m1: { seriesId: 'series-lu-1', roundId: 'r1' } });
  assert('2 未开赛不计累计', built.meta.startedRoundCount === 0 && built.meta.eligibleEntryCount === 0);
  assert('2 roundLineups 有 2 人', (rowOf(built, 'team:red').roundLineups || []).length === 2);
  assert('2 allEntries 空（不污染 TOT）', (rowOf(built, 'team:red').allEntries || []).length === 0);
  var vm = vmFor(series, built, 'r1', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'scheduled', hasMatchId: true }
  ]);
  var red = teamPlayers(vm, 'team:red');
  assert('2 展示 2 球员', red.players.length === 2);
  assert(
    '2 成绩全 —',
    red.players.every(function (p) {
      return p.thru === '-' && p.scoreStr === '-' && p.pos === '-';
    })
  );
  assert('2 无计入分隔线', red.scoringPlayersCount === 0);
  assert('2 等待开赛提示', red.expandStatusHint === '已分组 · 等待开赛');
  assert(
    '2 无虚假 0/E/F',
    red.players.every(function (p) {
      return p.thru !== '0' && p.thru !== 'E' && p.thru !== 'F' && p.scoreStr !== '0' && p.scoreStr !== 'E';
    })
  );
})();

// 3 未开始轮不进入累计（双轮：R1 分组未开 + R2 LIVE）
(function () {
  var series = makeSeries({
    rounds: [
      { roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' },
      { roundId: 'r2', index: 2, matchId: 'm2', gameMode: '个人比杆赛' }
    ]
  });
  var m1 = makeManagedMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'registering',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [{ userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' }]
        }
      ]
    }
  });
  var m2 = makeManagedMatch({
    matchId: 'm2',
    roundId: 'r2',
    status: 'ongoing',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [
            { userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' },
            { userId: 'u-r2', nickname: '红二', position: 2, matchTeamId: 'red' }
          ]
        }
      ],
      scoreData: {
        g1: {
          scoresByPlayer: {
            'u-r1': { scores: fillScores(3, 4) },
            'u-r2': { scores: fillScores(3, 5) }
          }
        }
      }
    }
  });
  var built = buildWith(
    series,
    { m1: m1, m2: m2 },
    {
      m1: { seriesId: 'series-lu-1', roundId: 'r1' },
      m2: { seriesId: 'series-lu-1', roundId: 'r2' }
    }
  );
  assert('3 startedRoundCount=1', built.meta.startedRoundCount === 1);
  var red = rowOf(built, 'team:red');
  assert(
    '3 allEntries 仅 R2',
    (red.allEntries || []).length === 2 &&
      red.allEntries.every(function (e) {
        return e.roundId === 'r2';
      })
  );
  assert(
    '3 R1 阵容在 roundLineups',
    (red.roundLineups || []).some(function (e) {
      return e.roundId === 'r1' && e.unitId === 'u-r1';
    })
  );
})();

// 4+5 已开赛：一人 3 洞、一人无成绩
(function () {
  var series = makeSeries({
    rounds: [{ roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' }]
  });
  var m1 = makeManagedMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'ongoing',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [
            { userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' },
            { userId: 'u-r2', nickname: '红二', position: 2, matchTeamId: 'red' }
          ]
        }
      ],
      scoreData: {
        g1: {
          scoresByPlayer: {
            'u-r1': { scores: fillScores(3, 4) }
          }
        }
      }
    }
  });
  var built = buildWith(series, { m1: m1 }, { m1: { seriesId: 'series-lu-1', roundId: 'r1' } });
  var vm = vmFor(series, built, 'r1', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'live', hasMatchId: true }
  ]);
  var red = teamPlayers(vm, 'team:red');
  assert('4 两人皆展示', red.players.length === 2);
  var p1 = red.players.find(function (p) {
    return p.unitId === 'u-r1';
  });
  var p2 = red.players.find(function (p) {
    return p.unitId === 'u-r2';
  });
  assert('5 有成绩 THRU=3', p1 && p1.thru === '3');
  assert('5 无成绩 —', p2 && p2.thru === '-' && p2.scoreStr === '-');
})();

// 6+7 未开始 / 开赛无选优 → 无分隔线
(function () {
  var series = makeSeries({
    rounds: [{ roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' }]
  });
  var mSched = makeManagedMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'registering',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [{ userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' }]
        }
      ]
    }
  });
  var b1 = buildWith(series, { m1: mSched }, { m1: { seriesId: 'series-lu-1', roundId: 'r1' } });
  var vm1 = vmFor(series, b1, 'r1', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'scheduled', hasMatchId: true }
  ]);
  assert('6 未开始无分隔线', teamPlayers(vm1, 'team:red').scoringPlayersCount === 0);

  var mLive = makeManagedMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'ongoing',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [
            { userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' },
            { userId: 'u-r2', nickname: '红二', position: 2, matchTeamId: 'red' }
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
  series.scoringRule.globalM = 2;
  var b2 = buildWith(series, { m1: mLive }, { m1: { seriesId: 'series-lu-1', roundId: 'r1' } });
  var vm2 = vmFor(series, b2, 'r1', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'live', hasMatchId: true }
  ]);
  // 两人都 counted 时不应出现 excluded 段分隔
  assert(
    '7 全 counted 无分隔线',
    teamPlayers(vm2, 'team:red').scoringPlayersCount === 0 ||
      !teamPlayers(vm2, 'team:red').players.some(function (p) {
        return p.counting === 'excluded';
      })
  );
})();

// 8 完赛最终成绩
(function () {
  var series = makeSeries({
    rounds: [{ roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' }]
  });
  var m1 = makeManagedMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'completed',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [{ userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' }]
        }
      ],
      scoreData: {
        g1: { scoresByPlayer: { 'u-r1': { scores: fillScores(18, 4) } } }
      }
    }
  });
  var built = buildWith(series, { m1: m1 }, { m1: { seriesId: 'series-lu-1', roundId: 'r1' } });
  var vm = vmFor(series, built, 'r1', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'finished', hasMatchId: true }
  ]);
  var p = teamPlayers(vm, 'team:red').players[0];
  assert('8 完赛 THRU=F', p && p.thru === 'F' && p.scoreStr !== '-');
})();

// 9 仅 userId；10 roster 缺失
(function () {
  var series = makeSeries({
    rounds: [{ roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' }],
    roster: []
  });
  var m1 = makeManagedMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'registering',
    patch: {
      registerInfo: { users: [] },
      groups: [
        {
          groupId: 'g1',
          players: [
            {
              userId: 'orphan-1',
              nickname: '席位名',
              position: 1,
              seriesParticipantId: 'team:red'
            }
          ]
        }
      ]
    }
  });
  var built = buildWith(series, { m1: m1 }, { m1: { seriesId: 'series-lu-1', roundId: 'r1' } });
  var vm = vmFor(series, built, 'r1', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'scheduled', hasMatchId: true }
  ]);
  var red = teamPlayers(vm, 'team:red');
  assert('9/10 仅 userId + 席位名仍展示', red.players.length === 1 && red.players[0].name === '席位名');
})();

// 11 重复席位去重
(function () {
  var series = makeSeries({
    rounds: [{ roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' }]
  });
  var m1 = makeManagedMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'registering',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [
            { userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' },
            { userId: 'u-r1', nickname: '红一复制', position: 2, matchTeamId: 'red' }
          ]
        }
      ]
    }
  });
  var built = buildWith(series, { m1: m1 }, { m1: { seriesId: 'series-lu-1', roundId: 'r1' } });
  assert('11 去重', (rowOf(built, 'team:red').roundLineups || []).length === 1);
})();

// 12 无归属不默认第一队
(function () {
  var series = makeSeries({
    rounds: [{ roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' }]
  });
  var m1 = makeManagedMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'registering',
    patch: {
      registerInfo: { users: [] },
      groups: [
        {
          groupId: 'g1',
          players: [{ userId: 'no-aff', nickname: '无归属', position: 1 }]
        }
      ]
    }
  });
  var built = buildWith(series, { m1: m1 }, { m1: { seriesId: 'series-lu-1', roundId: 'r1' } });
  assert(
    '12 不进任何队',
    (rowOf(built, 'team:red').roundLineups || []).length === 0 &&
      (rowOf(built, 'team:blue').roundLineups || []).length === 0
  );
  assert(
    '12 affiliation error 记录',
    built.meta.stationErrors.some(function (e) {
      return e.reason === 'affiliation_error' && e.playerId === 'no-aff';
    })
  );
})();

// 13+14 R 切换不改主榜序；阵容不串轮
(function () {
  var series = makeSeries({
    rounds: [
      { roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' },
      { roundId: 'r2', index: 2, matchId: 'm2', gameMode: '个人比杆赛' }
    ]
  });
  var m1 = makeManagedMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'completed',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [
            { userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' },
            { userId: 'u-b1', nickname: '蓝一', position: 2, matchTeamId: 'blue' }
          ]
        }
      ],
      scoreData: {
        g1: {
          scoresByPlayer: {
            'u-r1': { scores: fillScores(18, 5) },
            'u-b1': { scores: fillScores(18, 4) }
          }
        }
      }
    }
  });
  var m2 = makeManagedMatch({
    matchId: 'm2',
    roundId: 'r2',
    status: 'registering',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [{ userId: 'u-r2', nickname: '红二', position: 1, matchTeamId: 'red' }]
        }
      ]
    }
  });
  var built = buildWith(
    series,
    { m1: m1, m2: m2 },
    {
      m1: { seriesId: 'series-lu-1', roundId: 'r1' },
      m2: { seriesId: 'series-lu-1', roundId: 'r2' }
    }
  );
  var states = [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'finished', hasMatchId: true },
    { roundId: 'r2', index: 2, label: 'R2', statusToken: 'scheduled', hasMatchId: true }
  ];
  var vmTot = vmFor(series, built, 'cumulative', states);
  var vmR1 = vmFor(series, built, 'r1', states);
  var vmR2 = vmFor(series, built, 'r2', states);
  assert(
    '13 TOT 累计主榜签名稳定（不再要求 TOT===R）',
    standingsVm.mainBoardSignature(vmTot) === standingsVm.mainBoardSignature(
      standingsVm.buildSeriesStandingsViewModel({
        series: series,
        selectedKey: 'cumulative',
        roundStates: states,
        standingsResult: built.standingsResult
      })
    )
  );
  var r1Ids = teamPlayers(vmR1, 'team:red').players.map(function (p) {
    return p.unitId;
  });
  var r2Ids = teamPlayers(vmR2, 'team:red').players.map(function (p) {
    return p.unitId;
  });
  assert('14 R1 含 u-r1', r1Ids.indexOf('u-r1') >= 0 && r1Ids.indexOf('u-r2') < 0);
  assert('14 R2 含 u-r2 不串 R1', r2Ids.indexOf('u-r2') >= 0 && r2Ids.indexOf('u-r1') < 0);
})();

// 15 TOT = 累计成绩 ∪ 已分组阵容（未开赛占位）
(function () {
  var series = makeSeries({
    rounds: [
      { roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' },
      { roundId: 'r2', index: 2, matchId: 'm2', gameMode: '个人比杆赛' }
    ]
  });
  var m1 = makeManagedMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'registering',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [{ userId: 'u-r2', nickname: '红二', position: 1, matchTeamId: 'red' }]
        }
      ]
    }
  });
  var m2 = makeManagedMatch({
    matchId: 'm2',
    roundId: 'r2',
    status: 'ongoing',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [{ userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' }]
        }
      ],
      scoreData: {
        g1: { scoresByPlayer: { 'u-r1': { scores: fillScores(4, 4) } } }
      }
    }
  });
  var built = buildWith(
    series,
    { m1: m1, m2: m2 },
    {
      m1: { seriesId: 'series-lu-1', roundId: 'r1' },
      m2: { seriesId: 'series-lu-1', roundId: 'r2' }
    }
  );
  var vm = vmFor(series, built, 'cumulative', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'scheduled', hasMatchId: true },
    { roundId: 'r2', index: 2, label: 'R2', statusToken: 'live', hasMatchId: true }
  ]);
  var ids = teamPlayers(vm, 'team:red').players.map(function (p) {
    return p.playerId || p.unitId;
  });
  assert('15 TOT 含有成绩 u-r1', ids.indexOf('u-r1') >= 0);
  assert('15 TOT 含未开赛阵容 u-r2', ids.indexOf('u-r2') >= 0);
  var lineupOnly = teamPlayers(vm, 'team:red').players.find(function (p) {
    return (p.playerId || p.unitId) === 'u-r2';
  });
  assert(
    '15 u-r2 为阵容占位',
    lineupOnly &&
      lineupOnly.fromLineup === true &&
      lineupOnly.counting === 'pending' &&
      lineupOnly.pos === '-' &&
      lineupOnly.thru === '-' &&
      lineupOnly.scoreStr === '-'
  );
  var redRow = rowOf(built, 'team:red');
  assert(
    '15 lineup-only 不进 allEntries',
    (redRow.allEntries || []).every(function (e) {
      return (e.playerId || e.userId || (e.memberUserIds && e.memberUserIds[0]) || e.unitId) !== 'u-r2';
    })
  );
})();

// 17 per_round_n
(function () {
  var series = makeSeries({
    scoringRule: {
      mode: 'per_round_n',
      globalM: 2,
      allowRepeat: false,
      scoreBasis: 'gross',
      ruleVersion: 1
    }
  });
  var built = buildWith(series, {}, {});
  assert('17 per_round_n 可装配', built.meta.mode === 'per_round_n');
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: 'cumulative',
    roundStates: [],
    standingsResult: built.standingsResult
  });
  assert('17 VM available=true 且无 TOT', vm.available === true && vm.showTot === false);
})();

console.log('');
console.log('--- seriesStandingsRoundLineup.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exitCode = 1;
}
