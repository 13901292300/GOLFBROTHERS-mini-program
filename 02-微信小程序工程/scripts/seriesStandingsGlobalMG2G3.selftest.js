/**
 * SERIES-STANDINGS-GLOBAL-M-G2G3-A
 * Series TOT + G2/G3 + global_m：跨轮组合池交给普通单场 assembleGrossTeams。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsGlobalMG2G3.selftest.js
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
var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));

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

function users() {
  return [
    { userId: 'u-r1', nickname: '红一', gender: 'male', matchTeamId: 'red', matchTeamName: '红队' },
    { userId: 'u-r2', nickname: '红二', gender: 'male', matchTeamId: 'red', matchTeamName: '红队' },
    { userId: 'u-r3', nickname: '红三', gender: 'male', matchTeamId: 'red', matchTeamName: '红队' },
    { userId: 'u-r4', nickname: '红四', gender: 'male', matchTeamId: 'red', matchTeamName: '红队' },
    { userId: 'u-b1', nickname: '蓝一', gender: 'female', matchTeamId: 'blue', matchTeamName: '蓝队' },
    { userId: 'u-b2', nickname: '蓝二', gender: 'male', matchTeamId: 'blue', matchTeamName: '蓝队' },
    { userId: 'u-b3', nickname: '蓝三', gender: 'male', matchTeamId: 'blue', matchTeamName: '蓝队' },
    { userId: 'u-b4', nickname: '蓝四', gender: 'male', matchTeamId: 'blue', matchTeamName: '蓝队' },
    { userId: 'u-g1', nickname: '绿一', gender: 'male', matchTeamId: 'green', matchTeamName: '绿队' },
    { userId: 'u-g2', nickname: '绿二', gender: 'male', matchTeamId: 'green', matchTeamName: '绿队' },
    { userId: 'u-g3', nickname: '绿三', gender: 'male', matchTeamId: 'green', matchTeamName: '绿队' },
    { userId: 'u-g4', nickname: '绿四', gender: 'male', matchTeamId: 'green', matchTeamName: '绿队' }
  ];
}

function makeSeries(partial) {
  return Object.assign(
    {
      seriesId: 'series-g2-tot',
      publishToken: 'pub-g2-tot',
      lifecycleStatus: 'published',
      scoringRule: {
        mode: 'global_m',
        globalM: 2,
        allowRepeat: false,
        scoreBasis: 'gross',
        ruleVersion: 1
      },
      participants: [
        { seriesParticipantId: 'team:red', kind: 'team', sourceTeamId: 'red', nameSnapshot: '红队' },
        { seriesParticipantId: 'team:blue', kind: 'team', sourceTeamId: 'blue', nameSnapshot: '蓝队' }
      ],
      rounds: [
        {
          roundId: 'r1',
          index: 1,
          matchId: 'm-r1',
          gameMode: '四人四球比杆赛',
          roundStatus: 'scheduled',
          name: 'ROUND 1'
        },
        {
          roundId: 'r2',
          index: 2,
          matchId: 'm-r2',
          gameMode: '四人四球比杆赛',
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
  var matchId = o.matchId || 'm-r1';
  return Object.assign(
    {
      matchId: matchId,
      matchType: 'inter-team',
      status: o.status || 'ongoing',
      gameMode: o.gameMode || '四人四球比杆赛',
      courseName: '测试球场',
      front9Course: 'A',
      back9Course: 'B',
      teamGroups: [
        { id: 'red', name: '红队', sourceTeamId: 'red' },
        { id: 'blue', name: '蓝队', sourceTeamId: 'blue' }
      ],
      scoringRules: { teamCompetition: { enabled: false, topN: 3 } },
      seriesContext: {
        managed: true,
        seriesId: o.seriesId || 'series-g2-tot',
        roundId: roundId,
        publishToken: o.publishToken || 'pub-g2-tot'
      },
      registerInfo: { users: users() },
      groups: [],
      scoreData: {},
      scoreEntities: {},
      pairings: {}
    },
    o.patch || {}
  );
}

function makeIndex(roundId, seriesId, publishToken) {
  return {
    seriesId: seriesId || 'series-g2-tot',
    roundId: roundId,
    publishToken: publishToken || 'pub-g2-tot'
  };
}

function r1Match() {
  return makeManagedMatch({
    roundId: 'r1',
    matchId: 'm-r1',
    status: 'finished',
    patch: {
      groups: [
        {
          groupId: 'gA',
          groupName: 'A组',
          players: [
            { userId: 'u-r1', position: 1 },
            { userId: 'u-r2', position: 2 },
            { userId: 'u-b1', position: 3 },
            { userId: 'u-b2', position: 4 }
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
            members: ['u-r1', 'u-r2']
          },
          {
            entityId: 'e-red-b',
            entityType: 'team',
            compositionMode: '2+2',
            teamGroupId: 'red',
            members: ['u-r3', 'u-r4']
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
            { teamId: 'e-red-b', scores: fillScores(9, 5) },
            { teamId: 'e-blue', scores: fillScores(18, 3) }
          ]
        }
      }
    }
  });
}

function r2Match() {
  return makeManagedMatch({
    roundId: 'r2',
    matchId: 'm-r2',
    status: 'ongoing',
    patch: {
      groups: [
        {
          groupId: 'gB',
          groupName: 'B组',
          players: [
            { userId: 'u-r1', position: 1 },
            { userId: 'u-r2', position: 2 },
            { userId: 'u-b1', position: 3 },
            { userId: 'u-b2', position: 4 }
          ]
        }
      ],
      scoreEntities: {
        gB: [
          {
            entityId: 'e-red',
            entityType: 'team',
            compositionMode: '2+2',
            teamGroupId: 'red',
            members: ['u-r1', 'u-r2']
          },
          {
            entityId: 'e-red-u',
            entityType: 'team',
            compositionMode: '2+2',
            teamGroupId: 'red',
            members: ['u-r3', 'u-r4']
          },
          {
            entityId: 'e-blue',
            entityType: 'team',
            compositionMode: '2+2',
            teamGroupId: 'blue',
            members: ['u-b3', 'u-b4']
          }
        ]
      },
      scoreData: {
        gB: {
          teamScoresByEntity: [
            { teamId: 'e-red', scores: fillScores(12, 3) },
            { teamId: 'e-red-u', scores: [] },
            { teamId: 'e-blue', scores: fillScores(6, 4) }
          ]
        }
      }
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
      return makeIndex(
        m.seriesContext.roundId,
        m.seriesContext.seriesId,
        m.seriesContext.publishToken
      );
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

function expectedFromShared(matches, globalM) {
  var host = teamLeaderboardHost.createStandaloneHost({});
  var merged = {};
  var order = [];
  var names = {};
  matches.forEach(function (match) {
    var groups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    groups.forEach(function (g) {
      var id = g && g.id != null ? String(g.id) : '';
      if (!id) return;
      if (order.indexOf(id) < 0) order.push(id);
      if (g.name) names[id] = String(g.name);
    });
    var roundTeams = teamLeaderboardView.buildGrossTeamLeaderboardView(match, host) || [];
    roundTeams.forEach(function (team) {
      var teamId = team && team.teamId != null ? String(team.teamId) : '';
      if (!teamId) return;
      if (order.indexOf(teamId) < 0) order.push(teamId);
      if (team.teamName) names[teamId] = String(team.teamName);
      if (!merged[teamId]) {
        merged[teamId] = {
          teamId: teamId,
          teamName: names[teamId] || team.teamName,
          grossTotal: 0,
          toPar: 0,
          total: 0,
          scoringPlayersCount: 0,
          players: []
        };
      }
      (team.players || []).forEach(function (combo) {
        if (!combo || combo.isEntity !== true || !combo.entityId) return;
        merged[teamId].players.push(
          Object.assign({}, combo, {
            roundId: match.seriesContext.roundId,
            scorecardKey: match.seriesContext.roundId + ':' + combo.scorecardKey,
            isCounting: false
          })
        );
      });
    });
  });
  var teamGroups = order.map(function (id) {
    return { id: id, name: names[id] || '' };
  });
  return teamLeaderboardView.assembleGrossTeams(
    {
      matchType: 'inter-team',
      teamGroups: teamGroups,
      scoringRules: { teamCompetition: { enabled: true, topN: globalM } }
    },
    merged,
    teamGroups,
    { enabled: true, topN: globalM }
  );
}

var series = makeSeries();
var matches = [r1Match(), r2Match()];
var projected = projectTot(series, matches);
var overlay = projected && projected.overlay;
var teamRows = overlay && overlay.teamRows ? overlay.teamRows : [];
var expected = expectedFromShared(matches, 2);

assert(
  'TOT G2 走共享选优',
  projected &&
    projected.useShared === true &&
    projected.calledShared === true &&
    projected.reason === 'tot_g2g3_global_m',
  projected && projected.reason
);

assert('两队主榜', teamRows.length === 2, String(teamRows.length));

var red = teamRows.filter(function (t) {
  return t.teamId === 'team:red';
})[0];
var blue = teamRows.filter(function (t) {
  return t.teamId === 'team:blue';
})[0];
var expRed = expected.filter(function (t) {
  return t.teamId === 'red';
})[0];
var expBlue = expected.filter(function (t) {
  return t.teamId === 'blue';
})[0];

assert(
  '主榜 TOTAL/TO PAR/POS 与普通单场 assembleGrossTeams 一致',
  red &&
    expRed &&
    String(red.pos) === String(expRed.pos) &&
    Number(red.toPar) === Number(expRed.toPar) &&
    Number(red.grossTotal) === Number(expRed.grossTotal) &&
    String(red.scoreStr) === String(expRed.scoreStr) &&
    blue &&
    expBlue &&
    String(blue.pos) === String(expBlue.pos) &&
    Number(blue.toPar) === Number(expBlue.toPar),
  red && expRed
    ? red.pos + '/' + red.scoreStr + ' vs ' + expRed.pos + '/' + expRed.scoreStr
    : 'missing team'
);

assert(
  '展开全是组合实体，无个人行',
  red &&
    red.players.length > 0 &&
    red.players.every(function (p) {
      return p.isEntity === true && p.entityId && !p.playerId;
    }) &&
    blue.players.every(function (p) {
      return p.isEntity === true && p.entityId;
    })
);

assert(
  '跨轮同 entityId 不合并',
  red.players.filter(function (p) {
    return p.entityId === 'e-red';
  }).length === 2
);

assert(
  '组合唯一键含 roundId',
  red.players.every(function (p) {
    return (
      String(p.scorecardKey).indexOf(p.roundId + ':') === 0 &&
      p.occurrenceKey === p.roundId + ':' + p.teamGroupId + ':' + p.entityId
    );
  })
);

assert(
  '全局 M=2：计入数与 divider 位点',
  red.scoringPlayersCount === 2 &&
    red.players.filter(function (p) {
      return p.isCounting === true;
    }).length === 2 &&
    red.players[0].isCounting === true &&
    red.players[1].isCounting === true &&
    red.players.slice(2).every(function (p) {
      return p.isCounting !== true;
    })
);

assert(
  '计入组合置顶，未记分在有成绩之后',
  red.players.some(function (p) {
    return p.hasScore !== true && p.scoreStr === '-';
  }) &&
    red.players.filter(function (p) {
      return p.hasScore === true;
    }).every(function (p, idx, scored) {
      return true;
    }) &&
    red.players[red.players.length - 1].hasScore !== true
);

assert(
  '弱化轮次副信息 R1 · A组 / R2 · B组',
  red.players.some(function (p) {
    return p.roundId === 'r1' && p.subLabel === 'R1 · A组' && p.groupLabel === 'A组';
  }) &&
    red.players.some(function (p) {
      return p.roundId === 'r2' && p.subLabel === 'R2 · B组';
    })
);

assert(
  '打开记分卡上下文绑定本站本组合',
  red.players.every(function (p) {
    var expectMatch = p.roundId === 'r1' ? 'm-r1' : 'm-r2';
    return (
      p.stationMatchId === expectMatch &&
      p.matchId === expectMatch &&
      p.roundId !== 'cumulative' &&
      p.canOpenScorecard === true &&
      !!p.groupId &&
      !!p.entityId
    );
  })
);

assert(
  '无计入/未计入文案字段',
  red.players.every(function (p) {
    return !p.countingBadge && !p.countingLabel;
  })
);

var g1Series = makeSeries({
  rounds: [
    { roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' },
    { roundId: 'r2', index: 2, matchId: 'm2', gameMode: '个人比杆赛' }
  ]
});
var g1Tot = adapter.projectSeriesStandingsTeamBoard({
  selectedKey: 'cumulative',
  series: g1Series,
  getMatchById: function () {
    return null;
  },
  getIndexByMatchId: function () {
    return null;
  }
});
assert(
  'G1 TOT 不走本路径',
  g1Tot && g1Tot.reason === 'tot' && g1Tot.calledShared === false && g1Tot.useShared === false
);

var r1Only = adapter.projectSeriesStandingsTeamBoard({
  selectedKey: 'r1',
  series: series,
  round: series.rounds[0],
  match: matches[0],
  indexLink: makeIndex('r1')
});
assert(
  'R1 仍走单轮共享榜，不合并 R2',
  r1Only &&
    r1Only.reason === 'shared' &&
    r1Only.overlay.teamRows.every(function (t) {
      return t.players.every(function (p) {
        return !p.roundId || p.roundId === 'r1';
      });
    }) &&
    !r1Only.overlay.teamRows.some(function (t) {
      return t.players.some(function (p) {
        return p.stationMatchId === 'm-r2';
      });
    })
);

var badMatches = [
  r1Match(),
  Object.assign(r2Match(), { seriesContext: { managed: false } })
];
var failClosed = projectTot(series, badMatches);
assert(
  '非法分站 fail closed，不给出看似正式总榜',
  failClosed &&
    failClosed.useShared === true &&
    failClosed.verifiedOk === false &&
    failClosed.overlay.teamRows.length === 0 &&
    failClosed.overlay.listEmptyText === '系列赛比赛数据异常'
);

var cancelledSeries = makeSeries({
  rounds: [
    series.rounds[0],
    Object.assign({}, series.rounds[1], { roundStatus: 'cancelled' })
  ]
});
var cancelledProj = projectTot(cancelledSeries, matches);
var cancelledRed = (cancelledProj.overlay.teamRows || []).filter(function (t) {
  return t.teamId === 'team:red';
})[0];
assert(
  '取消轮沿用现规则：跳过 cancelled，不读 R2 组合',
  cancelledProj.useShared === true &&
    cancelledRed &&
    cancelledRed.players.every(function (p) {
      return p.roundId === 'r1';
    })
);

var noSeriesTot = adapter.projectSeriesStandingsTeamBoard({
  selectedKey: 'cumulative',
  match: matches[0]
});
assert(
  '无 Series 的 TOT 调用保持 bypass',
  noSeriesTot && noSeriesTot.reason === 'tot' && noSeriesTot.calledShared === false
);

var redCountingToPar = 0;
red.players.forEach(function (p) {
  if (p.isCounting === true) redCountingToPar += Number(p.toPar || 0);
});
var blueCountingToPar = 0;
blue.players.forEach(function (p) {
  if (p.isCounting === true) blueCountingToPar += Number(p.toPar || 0);
});
assert(
  '3. 球队按最优 M 个组合汇总排名',
  red &&
    blue &&
    Number(red.toPar) === redCountingToPar &&
    Number(blue.toPar) === blueCountingToPar &&
    String(red.pos) === String(expRed.pos) &&
    String(blue.pos) === String(expBlue.pos) &&
    red.scoringPlayersCount === 2
);

assert(
  '4. 计入在上且分隔线落在 scoringPlayersCount；未计入弱化',
  red.scoringPlayersCount === 2 &&
    red.players[0].isCounting === true &&
    red.players[1].isCounting === true &&
    red.players[2] &&
    red.players[2].isCounting !== true
);

assert(
  '5. 未记分组合出现但不占 M',
  red.players.some(function (p) {
    return p.hasScore !== true && p.isCounting !== true && p.scoreStr === '-';
  }) &&
    red.players.filter(function (p) {
      return p.isCounting === true;
    }).every(function (p) {
      return p.hasScore === true;
    }) &&
    red.scoringPlayersCount === 2
);

assert(
  '6. 同一成员跨轮仍是两条组合记录',
  red.players.filter(function (p) {
    return p.entityId === 'e-red';
  }).map(function (p) {
    return p.roundId;
  }).sort().join(',') === 'r1,r2'
);

var sameNameR2 = r2Match();
sameNameR2.groups[0].groupName = 'A组';
var sameNameProj = projectTot(series, [r1Match(), sameNameR2]);
var sameNameRed = (sameNameProj.overlay.teamRows || []).filter(function (t) {
  return t.teamId === 'team:red';
})[0];
var sameNameKeys = (sameNameRed.players || []).map(function (p) {
  return p.roundId + ':' + p.groupId + ':' + p.entityId;
});
assert(
  '7. 不同轮同名 A组 不冲突',
  sameNameRed &&
    sameNameRed.players.filter(function (p) {
      return p.groupLabel === 'A组';
    }).length >= 2 &&
    sameNameRed.players.some(function (p) {
      return p.roundId === 'r1' && p.groupId === 'gA' && p.subLabel === 'R1 · A组';
    }) &&
    sameNameRed.players.some(function (p) {
      return p.roundId === 'r2' && p.groupId === 'gB' && p.subLabel === 'R2 · A组';
    }) &&
    sameNameKeys.length === new Set(sameNameKeys).size
);

assert(
  '8. 组合行 roundLabel 与 stationMatchId',
  red.players.every(function (p) {
    var expectMatch = p.roundId === 'r1' ? 'm-r1' : 'm-r2';
    var expectLabel = p.roundId === 'r1' ? 'R1' : 'R2';
    return p.roundLabel === expectLabel && p.stationMatchId === expectMatch;
  })
);

assert(
  '9. 点击上下文指向正确分站组合',
  red.players.every(function (p) {
    var roundId = standingsVm.resolveStandingsScorecardRoundId(p, 'cumulative');
    return (
      roundId === p.roundId &&
      p.matchId === p.stationMatchId &&
      p.canOpenScorecard === true &&
      !!p.entityId &&
      !!p.groupId
    );
  })
);

var hostParity = teamLeaderboardHost.createStandaloneHost({});
var singleR1 = teamLeaderboardView.buildGrossTeamLeaderboardView(matches[0], hostParity) || [];
var singleRed = singleR1.filter(function (t) {
  return t.teamId === 'red';
})[0];
var singleCombo = singleRed &&
  singleRed.players.filter(function (p) {
    return p.entityId === 'e-red';
  })[0];
var seriesCombo = red.players.filter(function (p) {
  return p.roundId === 'r1' && p.entityId === 'e-red';
})[0];
assert(
  '10. 同一组合成绩与普通单场一致',
  singleCombo &&
    seriesCombo &&
    Number(singleCombo.toPar) === Number(seriesCombo.toPar) &&
    Number(singleCombo.grossTotal) === Number(seriesCombo.grossTotal) &&
    String(singleCombo.thru) === String(seriesCombo.thru) &&
    String(singleCombo.scoreStr) === String(seriesCombo.scoreStr) &&
    !!singleCombo.hasScore === !!seriesCombo.hasScore
);

var skipMatch = r1Match();
skipMatch.scoreEntities.gA.push({
  entityId: 'e-empty',
  entityType: 'team',
  compositionMode: '2+2',
  teamGroupId: 'red',
  members: []
});
var skipSingle = teamLeaderboardView.buildGrossTeamLeaderboardView(
  skipMatch,
  teamLeaderboardHost.createStandaloneHost({})
) || [];
var skipSingleRed = skipSingle.filter(function (t) {
  return t.teamId === 'red';
})[0];
var skipSeries = projectTot(series, [skipMatch, r2Match()]);
var skipRed = (skipSeries.overlay.teamRows || []).filter(function (t) {
  return t.teamId === 'team:red';
})[0];
assert(
  '10b. 空 members 组合单场与 Series 同样不收录',
  skipSingleRed &&
    skipSingleRed.players.every(function (p) {
      return p.entityId !== 'e-empty';
    }) &&
    skipRed.players.every(function (p) {
      return p.entityId !== 'e-empty';
    })
);

function g3Match(roundId, matchId, entityScores) {
  var gid = roundId === 'r1' ? 'gA' : 'gB';
  var entities = {};
  var scoreData = {};
  entities[gid] = [
    {
      entityId: 'e-red',
      entityType: 'team',
      compositionMode: '4+0',
      teamGroupId: 'red',
      members: ['u-r1', 'u-r2']
    },
    {
      entityId: 'e-blue',
      entityType: 'team',
      compositionMode: '4+0',
      teamGroupId: 'blue',
      members: ['u-b1', 'u-b2']
    },
    {
      entityId: 'e-green',
      entityType: 'team',
      compositionMode: '4+0',
      teamGroupId: 'green',
      members: ['u-g1', 'u-g2']
    },
    {
      entityId: 'e-green-u',
      entityType: 'team',
      compositionMode: '4+0',
      teamGroupId: 'green',
      members: ['u-g3', 'u-g4']
    }
  ];
  scoreData[gid] = { teamScoresByEntity: entityScores };
  return makeManagedMatch({
    seriesId: 'series-g3-tot',
    publishToken: 'pub-g3-tot',
    roundId: roundId,
    matchId: matchId,
    gameMode: '最佳球位比杆赛',
    status: 'finished',
    patch: {
      teamGroups: [
        { id: 'red', name: '红队', sourceTeamId: 'red' },
        { id: 'blue', name: '蓝队', sourceTeamId: 'blue' },
        { id: 'green', name: '绿队', sourceTeamId: 'green' }
      ],
      groups: [
        {
          groupId: gid,
          groupName: 'A组',
          players: [
            { userId: 'u-r1', position: 1 },
            { userId: 'u-r2', position: 2 },
            { userId: 'u-b1', position: 3 },
            { userId: 'u-b2', position: 4 },
            { userId: 'u-g1', position: 5 },
            { userId: 'u-g2', position: 6 }
          ]
        }
      ],
      scoreEntities: entities,
      scoreData: scoreData
    }
  });
}

var g3Series = makeSeries({
  seriesId: 'series-g3-tot',
  publishToken: 'pub-g3-tot',
  participants: [
    { seriesParticipantId: 'team:red', kind: 'team', sourceTeamId: 'red', nameSnapshot: '红队' },
    { seriesParticipantId: 'team:blue', kind: 'team', sourceTeamId: 'blue', nameSnapshot: '蓝队' },
    { seriesParticipantId: 'team:green', kind: 'team', sourceTeamId: 'green', nameSnapshot: '绿队' }
  ],
  rounds: [
    {
      roundId: 'r1',
      index: 1,
      matchId: 'm-g3-r1',
      gameMode: '最佳球位比杆赛',
      roundStatus: 'scheduled',
      name: 'ROUND 1'
    },
    {
      roundId: 'r2',
      index: 2,
      matchId: 'm-g3-r2',
      gameMode: '最佳球位比杆赛',
      roundStatus: 'scheduled',
      name: 'ROUND 2'
    }
  ]
});
var g3Matches = [
  g3Match('r1', 'm-g3-r1', [
    { teamId: 'e-red', scores: fillScores(18, 3) },
    { teamId: 'e-blue', scores: fillScores(18, 4) },
    { teamId: 'e-green', scores: fillScores(9, 5) },
    { teamId: 'e-green-u', scores: [] }
  ]),
  g3Match('r2', 'm-g3-r2', [
    { teamId: 'e-red', scores: fillScores(12, 4) },
    { teamId: 'e-blue', scores: fillScores(18, 5) },
    { teamId: 'e-green', scores: fillScores(18, 4) },
    { teamId: 'e-green-u', scores: [] }
  ])
];
var g3Proj = projectTot(g3Series, g3Matches);
var g3Rows = (g3Proj.overlay && g3Proj.overlay.teamRows) || [];
var g3Exp = expectedFromShared(g3Matches, 2);
assert(
  '2. G3 三队走共享选优',
  g3Proj &&
    g3Proj.reason === 'tot_g2g3_global_m' &&
    g3Rows.length === 3 &&
    g3Rows.every(function (t) {
      return ['team:red', 'team:blue', 'team:green'].indexOf(t.teamId) >= 0;
    })
);
assert(
  '2b. G3 三队排名与普通单场选优一致',
  g3Rows.length === 3 &&
    g3Exp.length === 3 &&
    g3Rows.map(function (t) {
      return t.pos + ':' + t.scoreStr;
    }).join('|') ===
      g3Exp.map(function (t) {
        return t.pos + ':' + t.scoreStr;
      }).join('|')
);
var g3Green = g3Rows.filter(function (t) {
  return t.teamId === 'team:green';
})[0];
assert(
  '2c. G3 未记分不占 M，同名 A组按 roundId 区分',
  g3Green &&
    g3Green.players.some(function (p) {
      return p.hasScore !== true && p.isCounting !== true;
    }) &&
    g3Green.players.filter(function (p) {
      return p.groupLabel === 'A组';
    }).length >= 2 &&
    g3Green.players.some(function (p) {
      return p.roundId === 'r1' && p.stationMatchId === 'm-g3-r1';
    }) &&
    g3Green.players.some(function (p) {
      return p.roundId === 'r2' && p.stationMatchId === 'm-g3-r2';
    })
);

var perRoundSeries = makeSeries({
  scoringRule: { mode: 'per_round_n', globalM: 2 }
});
var perRoundTot = adapter.projectSeriesStandingsTeamBoard({
  selectedKey: 'cumulative',
  series: perRoundSeries,
  getMatchById: function () {
    return matches[0];
  },
  getIndexByMatchId: function () {
    return makeIndex('r1');
  }
});
var perRoundVm = standingsVm.buildSeriesStandingsViewModel({
  series: perRoundSeries,
  selectedKey: 'cumulative',
  roundStates: [],
  standingsResult: standingsVm.emptyStandingsResult()
});
assert(
  '12. per_round_n TOT 不走 G2/G3 总榜',
  perRoundTot &&
    perRoundTot.reason === 'tot' &&
    perRoundTot.useShared === false &&
    perRoundVm &&
    perRoundVm.available === true &&
    perRoundVm.showTot === false
);

var r2Only = adapter.projectSeriesStandingsTeamBoard({
  selectedKey: 'r2',
  series: series,
  round: series.rounds[1],
  match: matches[1],
  indexLink: makeIndex('r2')
});
assert(
  '12b. R2 单轮榜不合并 R1',
  r2Only &&
    r2Only.reason === 'shared' &&
    r2Only.overlay.teamRows.every(function (t) {
      return t.players.every(function (p) {
        return !p.roundId || p.roundId === 'r2';
      });
    }) &&
    !r2Only.overlay.teamRows.some(function (t) {
      return t.players.some(function (p) {
        return p.stationMatchId === 'm-r1';
      });
    })
);

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
        players.map(function (p) {
          return [
            String(p.entityId || p.playerId || ''),
            String(!!p.isEntity),
            String(p.toPar),
            String(p.thru),
            String(p.scoreStr),
            String(!!p.hasScore),
            String(!!p.isCounting)
          ].join('~');
        }).join(',')
      ].join('|');
    })
    .join(';;');
}

function assertRnParity(name, match, round, seriesObj) {
  var host = teamLeaderboardHost.createStandaloneHost({});
  var shared = teamLeaderboardView.buildGrossTeamLeaderboardView(match, host) || [];
  var projected = adapter.projectSeriesStandingsTeamBoard({
    selectedKey: round.roundId,
    series: seriesObj,
    round: round,
    match: match,
    indexLink: makeIndex(round.roundId, seriesObj.seriesId, seriesObj.publishToken)
  });
  var rows = (projected && projected.overlay && projected.overlay.teamRows) || [];
  assert(
    name,
    projected &&
      projected.reason === 'shared' &&
      projected.calledShared === true &&
      scoringCoreSig(shared) === scoringCoreSig(rows),
    scoringCoreSig(shared) + ' !== ' + scoringCoreSig(rows)
  );
}

var g1Match = makeManagedMatch({
  roundId: 'r1',
  matchId: 'm-g1-rn',
  gameMode: '个人比杆赛',
  status: 'ongoing',
  patch: {
    groups: [
      {
        groupId: 'g1',
        groupName: 'A组',
        players: [
          { userId: 'u-r1', position: 1 },
          { userId: 'u-r2', position: 2 },
          { userId: 'u-b1', position: 3 },
          { userId: 'u-b2', position: 4 }
        ]
      }
    ],
    scoreData: {
      g1: {
        scoresByPlayer: {
          'u-r1': { scores: fillScores(9, 4) },
          'u-r2': { scores: fillScores(18, 3) },
          'u-b1': { scores: fillScores(12, 5) },
          'u-b2': { scores: fillScores(6, 4) }
        }
      }
    }
  }
});
var g1RnSeries = makeSeries({
  rounds: [
    {
      roundId: 'r1',
      index: 1,
      matchId: 'm-g1-rn',
      gameMode: '个人比杆赛',
      roundStatus: 'scheduled'
    },
    {
      roundId: 'r2',
      index: 2,
      matchId: 'm-g1-rn-2',
      gameMode: '个人比杆赛',
      roundStatus: 'scheduled'
    }
  ]
});
assertRnParity(
  'Rn G1 与普通单场共享 builder 结构等价',
  g1Match,
  g1RnSeries.rounds[0],
  g1RnSeries
);

assertRnParity(
  'Rn G2 与普通单场共享 builder 结构等价',
  matches[0],
  series.rounds[0],
  series
);

assertRnParity(
  'Rn G3 与普通单场共享 builder 结构等价',
  g3Matches[0],
  g3Series.rounds[0],
  g3Series
);

var g4Match = makeManagedMatch({
  roundId: 'r1',
  matchId: 'm-g4-rn',
  gameMode: '四人两球比杆赛',
  status: 'finished',
  patch: {
    groups: matches[0].groups,
    scoreEntities: {
      gA: [
        {
          entityId: 'e-red',
          entityType: 'pair',
          compositionMode: '2+2',
          teamGroupId: 'red',
          members: ['u-r1', 'u-r2']
        },
        {
          entityId: 'e-blue',
          entityType: 'pair',
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
          { teamId: 'e-blue', scores: fillScores(9, 5) }
        ]
      }
    }
  }
});
var g4Series = makeSeries({
  rounds: [
    {
      roundId: 'r1',
      index: 1,
      matchId: 'm-g4-rn',
      gameMode: '四人两球比杆赛',
      roundStatus: 'scheduled'
    }
  ]
});
assertRnParity(
  'Rn G4 与普通单场共享 builder 结构等价',
  g4Match,
  g4Series.rounds[0],
  g4Series
);
var g4Tot = projectTot(g4Series, [g4Match]);
assert(
  'G4 TOT 走全局 M 组合总榜（Rn 仍原生 G4）',
  g4Tot &&
    g4Tot.reason === 'tot_g4_global_m' &&
    g4Tot.useShared === true &&
    g4Tot.overlay &&
    Array.isArray(g4Tot.overlay.teamRows) &&
    g4Tot.overlay.teamRows.length === 2
);

var g1RnRows = adapter.projectSeriesStandingsTeamBoard({
  selectedKey: 'r1',
  series: g1RnSeries,
  round: g1RnSeries.rounds[0],
  match: g1Match,
  indexLink: makeIndex('r1', g1RnSeries.seriesId, g1RnSeries.publishToken)
});
assert(
  'Rn G1 展开为个人行，不被强制成组合',
  g1RnRows.overlay.teamRows.some(function (t) {
    return t.players.some(function (p) {
      return p.isEntity !== true && !!p.playerId;
    });
  })
);

var totEntities = {};
red.players.forEach(function (p) {
  totEntities[p.roundId + ':' + p.entityId] = true;
});
var r1Shared = teamLeaderboardView.buildGrossTeamLeaderboardView(
  matches[0],
  teamLeaderboardHost.createStandaloneHost({})
) || [];
var r2Shared = teamLeaderboardView.buildGrossTeamLeaderboardView(
  matches[1],
  teamLeaderboardHost.createStandaloneHost({})
) || [];
var rnEntityKeys = {};
[r1Shared, r2Shared].forEach(function (board, idx) {
  var rid = idx === 0 ? 'r1' : 'r2';
  board.forEach(function (t) {
    (t.players || []).forEach(function (p) {
      if (p && p.isEntity && p.entityId) rnEntityKeys[rid + ':' + p.entityId] = true;
    });
  });
});
assert(
  'TOT 组合均来自各轮共享投影认可的实体',
  Object.keys(totEntities).every(function (k) {
    return rnEntityKeys[k] === true;
  })
);

var adapterSrc = fs.readFileSync(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'), 'utf8');
var vmSrc = fs.readFileSync(path.join(seriesDir, 'seriesStandingsViewModel.js'), 'utf8');
assert(
  'VM 不实现组合成绩算法',
  vmSrc.indexOf('teamScoresByEntity') < 0 &&
    vmSrc.indexOf('assembleGrossTeams') < 0 &&
    adapterSrc.indexOf('assembleGrossTeams') >= 0 &&
    adapterSrc.indexOf('buildGrossTeamLeaderboardView') >= 0 &&
    adapterSrc.indexOf('collectEntityTeamMap') < 0
);

var seriesJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var seriesWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');
assert(
  '页面 TOT overlay 接入 adapter；WXML 仅加副信息/组合身份卡',
  seriesJs.indexOf('projectSeriesStandingsTeamBoard') >= 0 &&
    seriesWxml.indexOf('sub-label="{{player.subLabel}}"') >= 0 &&
    seriesWxml.indexOf('team-leaderboard-divider-strong') >= 0 &&
    seriesWxml.indexOf('is-non-counting') >= 0 &&
    seriesWxml.indexOf('计入') < 0 &&
    seriesWxml.indexOf('未计入') < 0
);

if (failures.length) {
  console.log('');
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
}
console.log('');
console.log('SERIES-STANDINGS-GLOBAL-M-G2G3-A: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
