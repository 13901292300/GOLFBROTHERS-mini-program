/**
 * SERIES-TOT-DIVISION-SERIES-PARITY
 * 队内分队 Series TOT 与队际使用同一 assembleGrossTeams 汇总语义。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesTotDivisionSeriesParity.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');

var teamLeaderboardView = require(path.join(utilsDir, 'teamLeaderboardView.js'));
var teamLeaderboardHost = require(path.join(utilsDir, 'teamLeaderboardHost.js'));
var adapter = require(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'));

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

function divisionUsers() {
  return [
    { userId: 'u-a1', nickname: '甲一', gender: 'male', matchTeamId: 'd1', matchTeamName: '红队' },
    { userId: 'u-a2', nickname: '甲二', gender: 'male', matchTeamId: 'd1', matchTeamName: '红队' },
    { userId: 'u-b1', nickname: '乙一', gender: 'female', matchTeamId: 'd2', matchTeamName: '蓝队' },
    { userId: 'u-b2', nickname: '乙二', gender: 'male', matchTeamId: 'd2', matchTeamName: '蓝队' },
    { userId: 'u-x', nickname: '未分组', gender: 'male' }
  ];
}

function makeDivisionSeries(partial) {
  return Object.assign(
    {
      seriesId: 'series-div-tot',
      publishToken: 'pub-div-tot',
      lifecycleStatus: 'published',
      hostMode: 'team',
      templateId: 'division_series',
      scoringRule: {
        mode: 'global_m',
        globalM: 2,
        allowRepeat: false,
        scoreBasis: 'gross',
        ruleVersion: 1
      },
      participants: [
        {
          seriesParticipantId: 'division:d1',
          kind: 'division',
          divisionId: 'd1',
          nameSnapshot: '红队',
          colorSnapshot: '#c00'
        },
        {
          seriesParticipantId: 'division:d2',
          kind: 'division',
          divisionId: 'd2',
          nameSnapshot: '蓝队',
          colorSnapshot: '#00c'
        }
      ],
      rounds: [
        {
          roundId: 'r1',
          index: 1,
          matchId: 'm-div-r1',
          gameMode: '个人比杆赛',
          roundStatus: 'scheduled',
          name: 'ROUND 1'
        },
        {
          roundId: 'r2',
          index: 2,
          matchId: 'm-div-r2',
          gameMode: '个人比杆赛',
          roundStatus: 'scheduled',
          name: 'ROUND 2'
        }
      ]
    },
    partial || {}
  );
}

function makeManagedMatch(opts) {
  var o = opts || {};
  var roundId = o.roundId || 'r1';
  var matchId = o.matchId || 'm-div-r1';
  return Object.assign(
    {
      matchId: matchId,
      matchType: 'team-internal',
      status: o.status || 'ongoing',
      gameMode: o.gameMode || '个人比杆赛',
      courseName: '测试球场',
      front9Course: 'A',
      back9Course: 'B',
      teamGroups: o.teamGroups || [
        { id: 'd1', name: '红队', sourceTeamId: '', colorSnapshot: '#c00' },
        { id: 'd2', name: '蓝队', sourceTeamId: '', colorSnapshot: '#00c' }
      ],
      scoringRules: { teamCompetition: { enabled: true, topN: 2 } },
      seriesContext: {
        managed: true,
        seriesId: o.seriesId || 'series-div-tot',
        roundId: roundId,
        publishToken: o.publishToken || 'pub-div-tot'
      },
      registerInfo: { users: divisionUsers() },
      groups: [],
      scoreData: {},
      scoreEntities: {},
      pairings: {}
    },
    o.patch || {}
  );
}

function makeIndex(roundId) {
  return {
    seriesId: 'series-div-tot',
    roundId: roundId,
    publishToken: 'pub-div-tot'
  };
}

function g1R1() {
  return makeManagedMatch({
    roundId: 'r1',
    matchId: 'm-div-r1',
    gameMode: '个人比杆赛',
    status: 'finished',
    patch: {
      groups: [
        {
          groupId: 'gA',
          groupName: 'A组',
          players: [
            { userId: 'u-a1', position: 1, matchTeamId: 'd1' },
            { userId: 'u-a2', position: 2, matchTeamId: 'd1' },
            { userId: 'u-b1', position: 3, matchTeamId: 'd2' },
            { userId: 'u-x', position: 4 }
          ]
        }
      ],
      scoreData: {
        gA: {
          scoresByPlayer: {
            'u-a1': { scores: fillScores(18, 4) },
            'u-a2': { scores: fillScores(9, 5) },
            'u-b1': { scores: fillScores(12, 3) },
            'u-x': { scores: fillScores(18, 2) }
          }
        }
      }
    }
  });
}

function g1R2() {
  return makeManagedMatch({
    roundId: 'r2',
    matchId: 'm-div-r2',
    gameMode: '个人比杆赛',
    status: 'ongoing',
    patch: {
      groups: [
        {
          groupId: 'gB',
          groupName: 'B组',
          players: [
            { userId: 'u-a1', position: 1, matchTeamId: 'd1' },
            { userId: 'u-b1', position: 2, matchTeamId: 'd2' },
            { userId: 'u-b2', position: 3, matchTeamId: 'd2' }
          ]
        }
      ],
      scoreData: {
        gB: {
          scoresByPlayer: {
            'u-a1': { scores: fillScores(6, 4) },
            'u-b1': { scores: fillScores(18, 5) },
            'u-b2': { scores: [] }
          }
        }
      }
    }
  });
}

function comboMatch(opts, entities, scores, groupName) {
  var gid = opts.groupId || 'gA';
  return makeManagedMatch({
    roundId: opts.roundId,
    matchId: opts.matchId,
    gameMode: opts.gameMode,
    status: opts.status || 'finished',
    teamGroups: opts.teamGroups,
    patch: {
      groups: [
        {
          groupId: gid,
          groupName: groupName || 'A组',
          players: [
            { userId: 'u-a1', position: 1, matchTeamId: 'd1' },
            { userId: 'u-a2', position: 2, matchTeamId: 'd1' },
            { userId: 'u-b1', position: 3, matchTeamId: 'd2' },
            { userId: 'u-b2', position: 4, matchTeamId: 'd2' }
          ]
        }
      ],
      scoreEntities: (function () {
        var map = {};
        map[gid] = entities;
        return map;
      })(),
      scoreData: (function () {
        var map = {};
        map[gid] = { teamScoresByEntity: scores };
        return map;
      })()
    }
  });
}

function storeFrom(matches) {
  var byId = {};
  (matches || []).forEach(function (m) {
    if (m && m.matchId) byId[String(m.matchId)] = m;
  });
  return {
    getMatchById: function (id) {
      return byId[String(id)] || null;
    },
    getIndexByMatchId: function (id) {
      var m = byId[String(id)];
      if (!m || !m.seriesContext) return null;
      return makeIndex(m.seriesContext.roundId);
    }
  };
}

function projectTot(series, matches) {
  var store = storeFrom(matches);
  return adapter.projectSeriesStandingsTeamBoard({
    selectedKey: 'cumulative',
    series: series,
    getMatchById: store.getMatchById,
    getIndexByMatchId: store.getIndexByMatchId
  });
}

function projectRound(series, round, match) {
  return adapter.projectSeriesStandingsTeamBoard({
    selectedKey: round.roundId,
    series: series,
    round: round,
    match: match,
    indexLink: makeIndex(round.roundId)
  });
}

function byPid(rows, pid) {
  return (rows || []).filter(function (t) {
    return t.teamId === pid || t.seriesParticipantId === pid;
  })[0];
}

function scoringCoreSig(teams) {
  return (Array.isArray(teams) ? teams : [])
    .map(function (t) {
      var players = Array.isArray(t && t.players) ? t.players : [];
      return [
        String(t.pos),
        String(t.teamName),
        String(t.grossTotal),
        String(t.scoreStr),
        String(!!t.hasScore),
        String(t.scoringPlayersCount),
        players
          .map(function (p) {
            return [
              String(p.entityId || p.playerId || ''),
              String(!!p.isEntity),
              String(p.toPar),
              String(p.scoreStr),
              String(!!p.hasScore),
              String(!!p.isCounting)
            ].join('~');
          })
          .join(',')
      ].join('|');
    })
    .join(';;');
}

var g1Series = makeDivisionSeries();
var g1Matches = [g1R1(), g1R2()];
var g1Tot = projectTot(g1Series, g1Matches);
var g1Rows = (g1Tot && g1Tot.overlay && g1Tot.overlay.teamRows) || [];
var g1Red = byPid(g1Rows, 'division:d1');
var g1Blue = byPid(g1Rows, 'division:d2');

assert(
  '1. 队内分队 G1 global M TOT 有分队榜',
  g1Tot &&
    g1Tot.useShared === true &&
    g1Tot.reason === 'tot_g1_division' &&
    g1Rows.length === 2 &&
    !!g1Red &&
    !!g1Blue,
  String(g1Tot && g1Tot.reason) + ' rows=' + g1Rows.length
);

assert(
  '1b. G1 展开为个人实体且带 R1 · A组',
  g1Red &&
    g1Red.players.some(function (p) {
      return p.isEntity !== true && p.playerId === 'u-a1' && p.subLabel === 'R1 · A组';
    }) &&
    g1Red.players.some(function (p) {
      return p.roundId === 'r2' && p.subLabel === 'R2 · B组';
    })
);

assert(
  '3. 同一分队跨轮按 id 合并',
  g1Red &&
    g1Red.players.filter(function (p) {
      return p.playerId === 'u-a1';
    }).length === 2 &&
    g1Rows.filter(function (t) {
      return t.teamName === '红队';
    }).length === 1
);

assert(
  '5. 无成绩显示 -',
  g1Blue &&
    g1Blue.players.some(function (p) {
      return p.playerId === 'u-b2' && p.hasScore !== true && p.scoreStr === '-';
    })
);

assert(
  '6. 最优 M / 计入线 / 弱化',
  g1Red &&
    g1Red.scoringPlayersCount === 2 &&
    g1Red.players.filter(function (p) {
      return p.isCounting === true;
    }).length === 2 &&
    g1Red.players.some(function (p) {
      return p.hasScore === true && p.isCounting !== true;
    })
);

assert(
  '未分组 roster 不进入 TOT',
  g1Rows.every(function (t) {
    return t.players.every(function (p) {
      return p.playerId !== 'u-x';
    });
  }) &&
    g1Rows.every(function (t) {
      return t.teamName !== '未命名分队' && t.teamId !== 'unknown';
    })
);

var sameNameSeries = makeDivisionSeries({
  participants: [
    {
      seriesParticipantId: 'division:d1',
      kind: 'division',
      divisionId: 'd1',
      nameSnapshot: '红队'
    },
    {
      seriesParticipantId: 'division:d2',
      kind: 'division',
      divisionId: 'd2',
      nameSnapshot: '红队'
    }
  ]
});
var sameNameGroups = [
  { id: 'd1', name: '红队', sourceTeamId: '', colorSnapshot: '#c00' },
  { id: 'd2', name: '红队', sourceTeamId: '', colorSnapshot: '#00c' }
];
var sameNameR1 = g1R1();
sameNameR1.teamGroups = sameNameGroups;
var sameNameR2 = g1R2();
sameNameR2.teamGroups = sameNameGroups;
var sameNameTot = projectTot(sameNameSeries, [sameNameR1, sameNameR2]);
var sameNameRows = (sameNameTot && sameNameTot.overlay && sameNameTot.overlay.teamRows) || [];
assert(
  '4. 不同分队同名不合并',
  sameNameRows.length === 2 &&
    !!byPid(sameNameRows, 'division:d1') &&
    !!byPid(sameNameRows, 'division:d2') &&
    sameNameRows.every(function (t) {
      return t.teamName === '红队';
    })
);

function comboEntities(roundTag) {
  return [
    {
      entityId: 'e-d1-' + roundTag,
      entityType: 'team',
      compositionMode: '2+2',
      teamGroupId: 'd1',
      members: ['u-a1', 'u-a2']
    },
    {
      entityId: 'e-d2-' + roundTag,
      entityType: 'team',
      compositionMode: '2+2',
      teamGroupId: 'd2',
      members: ['u-b1', 'u-b2']
    }
  ];
}

function comboScores(roundTag, d1Stroke, d2Stroke, d2Empty) {
  return [
    { teamId: 'e-d1-' + roundTag, scores: fillScores(18, d1Stroke) },
    { teamId: 'e-d2-' + roundTag, scores: d2Empty ? [] : fillScores(9, d2Stroke) }
  ];
}

var g2Series = makeDivisionSeries({
  rounds: [
    { roundId: 'r1', index: 1, matchId: 'm-g2-r1', gameMode: '四人四球比杆赛', roundStatus: 'scheduled' },
    { roundId: 'r2', index: 2, matchId: 'm-g2-r2', gameMode: '四人四球比杆赛', roundStatus: 'scheduled' }
  ]
});
var g2R1 = comboMatch(
  { roundId: 'r1', matchId: 'm-g2-r1', gameMode: '四人四球比杆赛', groupId: 'gA' },
  comboEntities('r1'),
  comboScores('r1', 4, 5, false),
  'A组'
);
var g2R2 = comboMatch(
  { roundId: 'r2', matchId: 'm-g2-r2', gameMode: '四人四球比杆赛', groupId: 'gB', status: 'ongoing' },
  comboEntities('r2'),
  comboScores('r2', 3, 5, true),
  'B组'
);
var g2Tot = projectTot(g2Series, [g2R1, g2R2]);
var g2Rows = (g2Tot && g2Tot.overlay && g2Tot.overlay.teamRows) || [];
var g2Red = byPid(g2Rows, 'division:d1');
var g2Blue = byPid(g2Rows, 'division:d2');

assert(
  '2. G2 跨两轮 TOT 有分队榜和组合展开',
  g2Tot &&
    g2Tot.reason === 'tot_g2g3_global_m' &&
    g2Rows.length === 2 &&
    g2Red &&
    g2Red.players.filter(function (p) {
      return p.isEntity === true;
    }).length === 2 &&
    g2Red.players.some(function (p) {
      return p.roundId === 'r1' && p.subLabel === 'R1 · A组' && p.entityId === 'e-d1-r1';
    }) &&
    g2Red.players.some(function (p) {
      return p.roundId === 'r2' && p.subLabel === 'R2 · B组';
    }),
  String(g2Tot && g2Tot.reason) + ' rows=' + g2Rows.length
);

assert(
  '2b/5. G2 无成绩组合显示 -',
  g2Blue &&
    g2Blue.players.some(function (p) {
      return p.entityId === 'e-d2-r2' && p.hasScore !== true && p.scoreStr === '-';
    })
);

assert(
  '11. 点击上下文绑定 round/station',
  g2Red &&
    g2Red.players.every(function (p) {
      var expectMatch = p.roundId === 'r1' ? 'm-g2-r1' : 'm-g2-r2';
      return (
        p.stationMatchId === expectMatch &&
        p.matchId === expectMatch &&
        p.roundId !== 'cumulative' &&
        p.canOpenScorecard === true &&
        !!p.entityId
      );
    })
);

var g3Series = makeDivisionSeries({
  rounds: [
    { roundId: 'r1', index: 1, matchId: 'm-g3-r1', gameMode: '最佳球位比杆赛', roundStatus: 'scheduled' },
    { roundId: 'r2', index: 2, matchId: 'm-g3-r2', gameMode: '最佳球位比杆赛', roundStatus: 'scheduled' }
  ]
});
var g3R1 = comboMatch(
  { roundId: 'r1', matchId: 'm-g3-r1', gameMode: '最佳球位比杆赛', groupId: 'gA' },
  comboEntities('r1'),
  comboScores('r1', 4, 5, false),
  'A组'
);
var g3R2 = comboMatch(
  { roundId: 'r2', matchId: 'm-g3-r2', gameMode: '最佳球位比杆赛', groupId: 'gB' },
  comboEntities('r2'),
  comboScores('r2', 3, 4, false),
  'B组'
);
var g3Tot = projectTot(g3Series, [g3R1, g3R2]);
var g3Red = byPid((g3Tot && g3Tot.overlay && g3Tot.overlay.teamRows) || [], 'division:d1');
assert(
  '2c. G3 跨两轮 TOT 组合展开',
  g3Tot &&
    g3Tot.reason === 'tot_g2g3_global_m' &&
    g3Red &&
    g3Red.players.filter(function (p) {
      return p.isEntity === true;
    }).length === 2
);

var host = teamLeaderboardHost.createStandaloneHost({});
var ordinaryG2 = teamLeaderboardView.buildGrossTeamLeaderboardView(g2R1, host) || [];
var rnG2 = projectRound(g2Series, g2Series.rounds[0], g2R1);
assert(
  '7. Rn 与普通单场分队榜结构等价',
  rnG2 &&
    rnG2.reason === 'shared' &&
    scoringCoreSig(ordinaryG2) === scoringCoreSig(rnG2.overlay.teamRows),
  scoringCoreSig(ordinaryG2) + ' !== ' + scoringCoreSig((rnG2.overlay && rnG2.overlay.teamRows) || [])
);

var interSeries = Object.assign({}, g2Series, {
  seriesId: 'series-g2-tot',
  publishToken: 'pub-g2-tot',
  hostMode: 'organization',
  templateId: 'inter_team_series',
  participants: [
    { seriesParticipantId: 'team:red', kind: 'team', sourceTeamId: 'red', nameSnapshot: '红队' },
    { seriesParticipantId: 'team:blue', kind: 'team', sourceTeamId: 'blue', nameSnapshot: '蓝队' }
  ]
});
var interMatch = makeManagedMatch({
  seriesId: 'series-g2-tot',
  publishToken: 'pub-g2-tot',
  roundId: 'r1',
  matchId: 'm-inter-r1',
  gameMode: '四人四球比杆赛',
  teamGroups: [
    { id: 'red', name: '红队', sourceTeamId: 'red' },
    { id: 'blue', name: '蓝队', sourceTeamId: 'blue' }
  ],
  patch: {
    matchType: 'inter-team',
    seriesContext: {
      managed: true,
      seriesId: 'series-g2-tot',
      roundId: 'r1',
      publishToken: 'pub-g2-tot'
    },
    registerInfo: {
      users: [
        { userId: 'u-a1', nickname: '甲一', gender: 'male', matchTeamId: 'red', matchTeamName: '红队' },
        { userId: 'u-a2', nickname: '甲二', gender: 'male', matchTeamId: 'red', matchTeamName: '红队' },
        { userId: 'u-b1', nickname: '乙一', gender: 'female', matchTeamId: 'blue', matchTeamName: '蓝队' },
        { userId: 'u-b2', nickname: '乙二', gender: 'male', matchTeamId: 'blue', matchTeamName: '蓝队' }
      ]
    },
    groups: [
      {
        groupId: 'gA',
        groupName: 'A组',
        players: [
          { userId: 'u-a1', position: 1, matchTeamId: 'red' },
          { userId: 'u-a2', position: 2, matchTeamId: 'red' },
          { userId: 'u-b1', position: 3, matchTeamId: 'blue' },
          { userId: 'u-b2', position: 4, matchTeamId: 'blue' }
        ]
      }
    ],
    scoreEntities: {
      gA: [
        {
          entityId: 'e-red',
          entityType: 'team',
          compositionMode: '2+2',
          teamGroupId: 'red',
          members: ['u-a1', 'u-a2']
        },
        {
          entityId: 'e-blue',
          entityType: 'team',
          compositionMode: '2+2',
          teamGroupId: 'blue',
          members: ['u-b1', 'u-b2']
        }
      ]
    },
    scoreData: {
      gA: {
        teamScoresByEntity: [
          { teamId: 'e-red', scores: fillScores(18, 4) },
          { teamId: 'e-blue', scores: fillScores(18, 5) }
        ]
      }
    }
  }
});
interSeries.rounds = [
  { roundId: 'r1', index: 1, matchId: 'm-inter-r1', gameMode: '四人四球比杆赛', roundStatus: 'scheduled' }
];
var interStore = {
  getMatchById: function (id) {
    return String(id) === 'm-inter-r1' ? interMatch : null;
  },
  getIndexByMatchId: function (id) {
    if (String(id) !== 'm-inter-r1') return null;
    return {
      seriesId: 'series-g2-tot',
      roundId: 'r1',
      publishToken: 'pub-g2-tot'
    };
  }
};
var interTot = adapter.projectSeriesStandingsTeamBoard({
  selectedKey: 'cumulative',
  series: interSeries,
  getMatchById: interStore.getMatchById,
  getIndexByMatchId: interStore.getIndexByMatchId
});
assert(
  '8. 队际 G2 TOT 不退化',
  interTot &&
    interTot.reason === 'tot_g2g3_global_m' &&
    interTot.useShared === true &&
    interTot.overlay.teamRows.length === 2 &&
    !!byPid(interTot.overlay.teamRows, 'team:red')
);

var orgG1 = makeDivisionSeries({
  hostMode: 'organization',
  templateId: 'inter_team_series',
  participants: [
    { seriesParticipantId: 'team:red', kind: 'team', sourceTeamId: 'red', nameSnapshot: '红队' },
    { seriesParticipantId: 'team:blue', kind: 'team', sourceTeamId: 'blue', nameSnapshot: '蓝队' }
  ]
});
var orgG1Tot = adapter.projectSeriesStandingsTeamBoard({
  selectedKey: 'cumulative',
  series: orgG1,
  getMatchById: function () {
    return null;
  },
  getIndexByMatchId: function () {
    return null;
  }
});
assert(
  '9. 非分队 G1 不被误判进分队 TOT',
  orgG1Tot && orgG1Tot.reason === 'tot' && orgG1Tot.useShared === false
);

var badMatch = g1R1();
delete badMatch.seriesContext;
var failClosed = projectTot(g1Series, [badMatch, g1R2()]);
assert(
  '10. managed station 异常 fail closed',
  failClosed &&
    failClosed.useShared === true &&
    failClosed.verifiedOk === false &&
    failClosed.overlay.teamRows.length === 0 &&
    failClosed.overlay.listEmptyText === '系列赛比赛数据异常'
);

var r1Proj = projectRound(g1Series, g1Series.rounds[0], g1R1());
var r2Proj = projectRound(g1Series, g1Series.rounds[1], g1R2());
assert(
  '12. TOT/R1/R2 切换不空白不串数据',
  r1Proj.overlay.teamRows.length === 2 &&
    r2Proj.overlay.teamRows.length === 2 &&
    g1Rows.length === 2 &&
    r1Proj.overlay.teamRows.every(function (t) {
      return t.players.every(function (p) {
        return !p.roundId || p.roundId === 'r1';
      });
    }) &&
    r2Proj.overlay.teamRows.every(function (t) {
      return t.players.every(function (p) {
        return !p.roundId || p.roundId === 'r2';
      });
    }) &&
    g1Red.players.some(function (p) {
      return p.roundId === 'r1';
    }) &&
    g1Red.players.some(function (p) {
      return p.roundId === 'r2';
    })
);

var seriesJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
assert(
  '12b. 页面 TOT overlay 关闭 LIVE 且不改 Rn 组件',
  seriesJs.indexOf('useLiveLeaderboard: false') >= 0 &&
    seriesJs.indexOf('projectSeriesTotG2G3TeamBoard') < 0
);

assert(
  '分队名称/颜色沿用 station teamGroups',
  g1Red && g1Red.teamName === '红队' && g1Red.colorSnapshot === '#c00'
);

console.log('');
console.log('---- seriesTotDivisionSeriesParity.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
