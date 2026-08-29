/**
 * TOT-V1：Series 总榜球队展开 = allEntries ∪ roundLineups
 * 不改 assembler 过滤、Top M、TOT 累计字段、R 榜投影路径。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsTotExpand.selftest.js
 */

var path = require('path');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

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
      seriesId: 'series-tot-v1',
      publishToken: 'pub-tot-v1',
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
        seriesId: 'series-tot-v1',
        roundId: roundId,
        publishToken: 'pub-tot-v1'
      },
      teamGroups: [
        { id: 'red', name: '红队' },
        { id: 'blue', name: '蓝队' }
      ],
      registerInfo: {
        users: [
          { userId: 'u-r1', nickname: '红一', matchTeamId: 'red' },
          { userId: 'u-r2', nickname: '红二', matchTeamId: 'red' },
          { userId: 'u-b1', nickname: '蓝一', matchTeamId: 'blue' }
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

function teamOf(vm, pid) {
  return (
    (vm.teamRows || []).find(function (r) {
      return r.teamId === pid;
    }) || { players: [], grossTotal: '', pos: '', scoreStr: '' }
  );
}

function playerKey(p) {
  return (p && (p.playerId || p.userId || p.unitId)) || '';
}

function isDash(v) {
  return v === '-' || v === '—' || v === '';
}

function rBoardSig(vm, pid) {
  return teamOf(vm, pid)
    .players.map(function (p) {
      return [
        playerKey(p),
        p.counting,
        p.pos,
        p.thru,
        p.scoreStr,
        p.hasScore ? '1' : '0',
        p.canOpenScorecard ? '1' : '0',
        p.roundId
      ].join('|');
    })
    .join(';');
}

function lineupSeat(partial) {
  return Object.assign(
    {
      roundId: 'r1',
      resultUnitType: 'player',
      counting: 'pending',
      resultStatus: 'MISSING',
      fromLineup: true
    },
    partial || {}
  );
}

// 1 R1 已分组未开赛：TOT 展开有人，球队总分仍为 —
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
  var built = buildWith(series, { m1: m1 }, { m1: { seriesId: 'series-tot-v1', roundId: 'r1' } });
  var redRow = rowOf(built, 'team:red');
  assert('1 allEntries 空', (redRow.allEntries || []).length === 0);
  assert('1 selectedCount=0', (redRow.selectedCount || 0) === 0);
  var vm = vmFor(series, built, 'cumulative', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'scheduled', hasMatchId: true }
  ]);
  var red = teamOf(vm, 'team:red');
  assert('1 TOT 展开 2 人', red.players.length === 2);
  assert(
    '1 球队总分仍为 —',
    isDash(red.grossTotal) && isDash(red.pos) && isDash(red.scoreStr) && red.hasScore !== true
  );
  assert(
    '1 占位行全 — 且 fromLineup',
    red.players.every(function (p) {
      return (
        p.fromLineup === true &&
        p.counting === 'pending' &&
        isDash(p.pos) &&
        isDash(p.thru) &&
        isDash(p.scoreStr) &&
        p.hasScore !== true &&
        p.canOpenScorecard === true &&
        p.showRoundTag !== true &&
        p.scoreStr !== 'E' &&
        p.scoreStr !== '0' &&
        p.thru !== '0' &&
        p.thru !== 'E'
      );
    })
  );
})();

// 2 同一球员 R1/R2 分组：TOT 只一行
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
  var built = buildWith(
    series,
    { m1: m1, m2: m2 },
    {
      m1: { seriesId: 'series-tot-v1', roundId: 'r1' },
      m2: { seriesId: 'series-tot-v1', roundId: 'r2' }
    }
  );
  var vm = vmFor(series, built, 'cumulative', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'scheduled', hasMatchId: true },
    { roundId: 'r2', index: 2, label: 'R2', statusToken: 'scheduled', hasMatchId: true }
  ]);
  var rows = teamOf(vm, 'team:red').players.filter(function (p) {
    return playerKey(p) === 'u-r1';
  });
  assert('2 TOT 同一球员按轮次两行', rows.length === 2, 'count=' + rows.length);
  var labels = rows
    .map(function (p) {
      return p.roundLabel;
    })
    .sort()
    .join(',');
  assert('2 各行 roundLabel 仍按轮次区分', labels === 'R1,R2', labels);
  assert(
    '2 allowRepeat=false 不展示轮次标识',
    rows.every(function (p) {
      return p.showRoundTag !== true;
    })
  );
  var keys = rows.map(function (p) {
    return p.occurrenceKey;
  });
  assert(
    '2 occurrenceKey 按轮次区分',
    keys.indexOf('r1:u-r1') >= 0 && keys.indexOf('r2:u-r1') >= 0 && keys[0] !== keys[1]
  );
})();

// 3 有成绩 + lineup：保留成绩行，不重复；不覆盖 counting
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
    status: 'ongoing',
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
  var m2 = makeManagedMatch({
    matchId: 'm2',
    roundId: 'r2',
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
  var built = buildWith(
    series,
    { m1: m1, m2: m2 },
    {
      m1: { seriesId: 'series-tot-v1', roundId: 'r1' },
      m2: { seriesId: 'series-tot-v1', roundId: 'r2' }
    }
  );
  var redRow = rowOf(built, 'team:red');
  var vm = vmFor(series, built, 'cumulative', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'live', hasMatchId: true },
    { roundId: 'r2', index: 2, label: 'R2', statusToken: 'scheduled', hasMatchId: true }
  ]);
  var rows = teamOf(vm, 'team:red').players.filter(function (p) {
    return playerKey(p) === 'u-r1';
  });
  assert('3 成绩+阵容按轮次两行', rows.length === 2, 'count=' + rows.length);
  var scored = rows.find(function (p) {
    return p.roundId === 'r1';
  });
  var placeholder = rows.find(function (p) {
    return p.roundId === 'r2';
  });
  assert(
    '3 R1 保留成绩行',
    scored &&
      scored.fromLineup !== true &&
      scored.hasScore === true &&
      scored.counting === 'counted' &&
      !isDash(scored.scoreStr)
  );
  assert(
    '3 R2 仅补占位',
    placeholder &&
      placeholder.fromLineup === true &&
      placeholder.counting === 'pending' &&
      isDash(placeholder.scoreStr)
  );
  assert(
    '3 allEntries 仍只有成绩',
    (redRow.allEntries || []).length === 1 &&
      (redRow.selectedCount || 0) === 1 &&
      redRow.allEntries.every(function (e) {
        return e.fromLineup !== true;
      })
  );
})();

// 4 lineup-only 不进入 Top M / selectedEntries
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
  var built = buildWith(series, { m1: m1 }, { m1: { seriesId: 'series-tot-v1', roundId: 'r1' } });
  var redRow = rowOf(built, 'team:red');
  assert('4 selectedCount=0', (redRow.selectedCount || 0) === 0);
  assert('4 allEntries 不含 lineup', (redRow.allEntries || []).length === 0);
  var vm = vmFor(series, built, 'cumulative', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'scheduled', hasMatchId: true }
  ]);
  assert('4 展开仍有阵容', teamOf(vm, 'team:red').players.length === 2);
})();

// 5 cancelled lineup 不出现
(function () {
  var errors = [];
  var merged = standingsVm.mergeTotTeamExpandSource(
    [],
    [
      lineupSeat({
        playerId: 'u-c',
        userId: 'u-c',
        unitName: '取消轮',
        seriesParticipantId: 'team:red',
        roundId: 'r-can'
      })
    ],
    { 'r-can': { roundId: 'r-can', index: 1, label: 'R1', statusToken: 'cancelled' } },
    'team:red',
    { 'r-can': { cancelled: true, hasFormalGroups: true, stationStarted: false } },
    errors
  );
  assert('5 cancelled 不补入', merged.length === 0);
})();

// 6 归属缺失不默认第一支球队
(function () {
  var errors = [];
  var merged = standingsVm.mergeTotTeamExpandSource(
    [],
    [
      lineupSeat({
        playerId: 'u-miss',
        userId: 'u-miss',
        unitName: '无归属',
        seriesParticipantId: '',
        roundId: 'r1',
        unitId: 'team:red'
      }),
      lineupSeat({
        playerId: 'u-blue',
        userId: 'u-blue',
        unitName: '蓝队球员',
        seriesParticipantId: 'team:blue',
        roundId: 'r1'
      }),
      lineupSeat({
        playerId: 'u-ok',
        userId: 'u-ok',
        unitName: '红三',
        seriesParticipantId: 'team:red',
        roundId: 'r1'
      }),
      lineupSeat({
        seriesParticipantId: 'team:red',
        unitId: 'team:red',
        entityId: 'team:red',
        unitName: '误用球队 ID',
        roundId: 'r1'
      })
    ],
    { r1: { roundId: 'r1', index: 1, label: 'R1' } },
    'team:red',
    { r1: { hasFormalGroups: true, stationStarted: false, cancelled: false } },
    errors
  );
  var ids = merged.map(function (e) {
    return e.playerId;
  });
  assert('6 只保留正式归属', ids.join(',') === 'u-ok', ids.join(','));
  assert(
    '6 缺失记投影错误',
    errors.some(function (e) {
      return e.playerId === 'u-miss' && e.reason === 'missing_affiliation';
    })
  );
  assert(
    '6 失效不默认红队',
    errors.some(function (e) {
      return e.playerId === 'u-blue' && e.reason === 'affiliation_mismatch';
    }) && ids.indexOf('u-blue') < 0 && ids.indexOf('u-miss') < 0
  );
  assert(
    '6 不用球队 ID 当球员',
    ids.indexOf('team:red') < 0
  );
})();

// 7 未分组 roster 不补入
(function () {
  var series = makeSeries({
    roster: [{ userId: 'u-roster', nickname: '名册生', matchTeamId: 'red' }],
    rounds: [{ roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' }]
  });
  var m1 = makeManagedMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'registering',
    patch: { groups: [] }
  });
  var built = buildWith(series, { m1: m1 }, { m1: { seriesId: 'series-tot-v1', roundId: 'r1' } });
  var vm = vmFor(series, built, 'cumulative', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'scheduled', hasMatchId: true }
  ]);
  var ids = teamOf(vm, 'team:red').players.map(playerKey);
  assert('7 未分组名册不出现', ids.indexOf('u-roster') < 0 && ids.length === 0);
})();

// 8 R 榜投影签名不变（仍按 roundLineups 滤 roundId，不走 TOT 合并占位）
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
    status: 'ongoing',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [{ userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' }]
        }
      ],
      scoreData: {
        g1: { scoresByPlayer: { 'u-r1': { scores: fillScores(3, 4) } } }
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
          players: [
            { userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' },
            { userId: 'u-r2', nickname: '红二', position: 2, matchTeamId: 'red' }
          ]
        }
      ]
    }
  });
  var built = buildWith(
    series,
    { m1: m1, m2: m2 },
    {
      m1: { seriesId: 'series-tot-v1', roundId: 'r1' },
      m2: { seriesId: 'series-tot-v1', roundId: 'r2' }
    }
  );
  var states = [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'live', hasMatchId: true },
    { roundId: 'r2', index: 2, label: 'R2', statusToken: 'scheduled', hasMatchId: true }
  ];
  var vmR1 = vmFor(series, built, 'r1', states);
  var vmR2 = vmFor(series, built, 'r2', states);
  var vmTot = vmFor(series, built, 'cumulative', states);
  var r1Ids = teamOf(vmR1, 'team:red').players.map(playerKey);
  var r2Ids = teamOf(vmR2, 'team:red').players.map(playerKey);
  var totU1 = teamOf(vmTot, 'team:red').players.filter(function (p) {
    return playerKey(p) === 'u-r1';
  });
  assert('8 R1 不含 u-r2', r1Ids.indexOf('u-r1') >= 0 && r1Ids.indexOf('u-r2') < 0);
  assert('8 R2 含两人且可点', r2Ids.indexOf('u-r1') >= 0 && r2Ids.indexOf('u-r2') >= 0);
  assert(
    '8 R2 仍是分轮阵容行而非 TOT 合并占位',
    teamOf(vmR2, 'team:red').players.length === 2 &&
      teamOf(vmR2, 'team:red').players.every(function (p) {
        return p.roundId === 'r2' && p.canOpenScorecard === true;
      })
  );
  assert('8 TOT u-r1 按轮次两行', totU1.length === 2);
  assert(
    '8 TOT R1 成绩 / R2 占位',
    totU1.some(function (p) {
      return p.roundId === 'r1' && p.fromLineup !== true && p.hasScore === true;
    }) &&
      totU1.some(function (p) {
        return p.roundId === 'r2' && p.fromLineup === true;
      })
  );
  assert('8 TOT 含 R2 占位 u-r2', teamOf(vmTot, 'team:red').players.some(function (p) {
    return playerKey(p) === 'u-r2' && p.fromLineup === true;
  }));
  var sigA = rBoardSig(vmR1, 'team:red');
  var sigB = rBoardSig(
    standingsVm.buildSeriesStandingsViewModel({
      series: series,
      selectedKey: 'r1',
      roundStates: states,
      standingsResult: built.standingsResult
    }),
    'team:red'
  );
  assert('8 R 榜签名稳定', sigA === sigB && sigA.length > 0);
  assert(
    '8 TOT 累计主榜签名稳定（不再要求 TOT===R）',
    standingsVm.mainBoardSignature(vmTot) === standingsVm.mainBoardSignature(
      standingsVm.buildSeriesStandingsViewModel({
        series: series,
        selectedKey: 'cumulative',
        roundStates: states,
        standingsResult: built.standingsResult
      })
    )
  );
})();

// 9 allowRepeat=false：仍保留各轮上场行，用 counted/excluded 说明，不在展示层删行
(function () {
  var series = makeSeries({
    scoringRule: {
      mode: 'global_m',
      globalM: 1,
      allowRepeat: false,
      scoreBasis: 'gross',
      ruleVersion: 1
    },
    rounds: [
      { roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' },
      { roundId: 'r2', index: 2, matchId: 'm2', gameMode: '个人比杆赛' }
    ]
  });
  function completed(matchId, roundId, stroke) {
    return makeManagedMatch({
      matchId: matchId,
      roundId: roundId,
      status: 'completed',
      patch: {
        groups: [
          {
            groupId: 'g1',
            players: [{ userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' }]
          }
        ],
        scoreData: {
          g1: { scoresByPlayer: { 'u-r1': { scores: fillScores(18, stroke) } } }
        }
      }
    });
  }
  var built = buildWith(
    series,
    { m1: completed('m1', 'r1', 4), m2: completed('m2', 'r2', 5) },
    {
      m1: { seriesId: 'series-tot-v1', roundId: 'r1' },
      m2: { seriesId: 'series-tot-v1', roundId: 'r2' }
    }
  );
  var redRow = rowOf(built, 'team:red');
  assert('9 selectedCount=1', (redRow.selectedCount || 0) === 1);
  assert('9 allEntries 仍有两轮', (redRow.allEntries || []).length === 2);
  var vm = vmFor(series, built, 'cumulative', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'finished', hasMatchId: true },
    { roundId: 'r2', index: 2, label: 'R2', statusToken: 'finished', hasMatchId: true }
  ]);
  var rows = teamOf(vm, 'team:red').players.filter(function (p) {
    return playerKey(p) === 'u-r1';
  });
  assert('9 展示层保留两行', rows.length === 2);
  assert(
    '9 用 counted/excluded 说明',
    rows.some(function (p) {
      return p.counting === 'counted';
    }) &&
      rows.some(function (p) {
        return p.counting === 'excluded';
      })
  );
  assert(
    '9 allowRepeat=false 昵称后无 R 标识',
    rows.every(function (p) {
      return p.showRoundTag !== true && p.roundLabel;
    })
  );
})();

console.log('');
console.log('--- seriesStandingsTotExpand.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exitCode = 1;
}
