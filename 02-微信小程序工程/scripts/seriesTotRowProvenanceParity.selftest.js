/**
 * SERIES-TOT-ROW-PROVENANCE-PARITY
 * G1 TOT 个人行与 G2–G4 组合行统一 subLabel：R1 · A组 / 仅 Rn。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesTotRowProvenanceParity.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var assembler = require(path.join(mini, 'utils', 'seriesStandingsAssembler.js'));
var standingsVm = require(path.join(seriesDir, 'seriesStandingsViewModel.js'));
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

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function fillScores(n, stroke) {
  var out = [];
  for (var i = 0; i < 18; i++) out.push(i < n ? stroke : null);
  return out;
}

function makeSeries(partial) {
  return Object.assign(
    {
      seriesId: 'series-tot-prov',
      publishToken: 'pub-tot-prov',
      lifecycleStatus: 'published',
      scoringRule: {
        mode: 'global_m',
        globalM: 2,
        allowRepeat: true,
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
      roster: [{ playerId: 'u-r1', nickname: '红一', gender: 'male' }],
      rounds: []
    },
    partial || {}
  );
}

function makeG1Match(opts) {
  var o = opts || {};
  var matchId = o.matchId || 'm1';
  var roundId = o.roundId || 'r1';
  return Object.assign(
    {
      matchId: matchId,
      gameMode: '个人比杆赛',
      status: o.status || 'finished',
      seriesContext: {
        managed: true,
        seriesId: 'series-tot-prov',
        roundId: roundId,
        publishToken: 'pub-tot-prov'
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
      courseName: 'Test'
    },
    o.patch || {}
  );
}

function buildWith(series, store) {
  return assembler.buildStandingsResult({
    series: series,
    getMatchById: function (id) {
      return store[id] || null;
    },
    getIndexByMatchId: function (id) {
      var m = store[id];
      return m
        ? {
            seriesId: 'series-tot-prov',
            roundId: m.seriesContext.roundId,
            publishToken: 'pub-tot-prov'
          }
        : null;
    },
    resolveStationStatusLabel: function (m) {
      if (!m) return '';
      if (m.status === 'ongoing' || m.status === 'live') return 'LIVE';
      if (m.status === 'completed' || m.status === 'finished') return '已结束';
      return '报名中';
    }
  });
}

function vmFor(series, built, selectedKey) {
  var rounds = Array.isArray(series.rounds) ? series.rounds : [];
  return standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: selectedKey,
    roundStates: rounds.map(function (r) {
      return {
        roundId: r.roundId,
        index: r.index,
        label: 'R' + r.index,
        statusToken: 'completed',
        hasMatchId: true
      };
    }),
    standingsResult: built.standingsResult
  });
}

function teamPlayers(vm, pid) {
  var row = (vm.teamRows || []).find(function (t) {
    return t.teamId === pid;
  });
  return row ? row.players || [] : [];
}

assert(
  '同一 helper：有轮次+组号 / 只有轮次',
  standingsVm.formatTotRowSubLabel('R1', 'A组') === 'R1 · A组' &&
    standingsVm.formatTotRowSubLabel('R1', '') === 'R1' &&
    standingsVm.formatTotRowSubLabel('', 'A组') === 'A组' &&
    standingsVm.formatTotRowSubLabel('', '') === ''
);

var adapterSrc = read(path.join(seriesDir, 'seriesTeamLeaderboardAdapter.js'));
assert(
  'G2-G4 adapter 调用同一 helper，不再内联格式化',
  adapterSrc.indexOf('standingsViewModel.formatTotRowSubLabel') >= 0 &&
    adapterSrc.indexOf('function comboSubLabel') < 0
);

(function g1LabeledGroups() {
  var series = makeSeries({
    scoringRule: {
      mode: 'global_m',
      globalM: 2,
      allowRepeat: true,
      scoreBasis: 'gross',
      ruleVersion: 1
    },
    rounds: [
      { roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' },
      { roundId: 'r2', index: 2, matchId: 'm2', gameMode: '个人比杆赛' }
    ]
  });
  var m1 = makeG1Match({
    matchId: 'm1',
    roundId: 'r1',
    patch: {
      groups: [
        {
          groupId: 'gA',
          groupName: 'A组',
          players: [
            { userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' },
            { userId: 'u-r2', nickname: '红二', position: 2, matchTeamId: 'red' }
          ]
        },
        {
          groupId: 'gB',
          groupName: 'B组',
          players: [{ userId: 'u-b1', nickname: '蓝一', position: 1, matchTeamId: 'blue' }]
        }
      ],
      scoreData: {
        gA: {
          scoresByPlayer: {
            'u-r1': { scores: fillScores(18, 4) },
            'u-r2': { scores: fillScores(18, 5) }
          }
        },
        gB: {
          scoresByPlayer: {
            'u-b1': { scores: fillScores(18, 4) }
          }
        }
      }
    }
  });
  var m2 = makeG1Match({
    matchId: 'm2',
    roundId: 'r2',
    patch: {
      groups: [
        {
          groupId: 'gB2',
          groupName: 'B组',
          players: [{ userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' }]
        },
        {
          groupId: 'gC',
          groupName: 'C组',
          players: [{ userId: 'u-r2', nickname: '红二', position: 1, matchTeamId: 'red' }]
        }
      ],
      scoreData: {
        gB2: {
          scoresByPlayer: { 'u-r1': { scores: fillScores(18, 6) } }
        },
        gC: {
          scoresByPlayer: { 'u-r2': { scores: fillScores(18, 4) } }
        }
      }
    }
  });
  var built = buildWith(series, { m1: m1, m2: m2 });
  var vm = vmFor(series, built, 'cumulative');
  var red = teamPlayers(vm, 'team:red');
  var r1 = red.find(function (p) {
    return p.playerId === 'u-r1' && p.roundId === 'r1';
  });
  var r2 = red.find(function (p) {
    return p.playerId === 'u-r1' && p.roundId === 'r2';
  });
  var r2u2 = red.find(function (p) {
    return p.playerId === 'u-r2' && p.roundId === 'r2';
  });
  var team = (vm.teamRows || []).find(function (t) {
    return t.teamId === 'team:red';
  });
  var dividerAt = team && team.scoringPlayersCount;

  assert(
    'G1 TOT 个人行显示 R1 · A组',
    r1 &&
      r1.subLabel === 'R1 · A组' &&
      r1.groupLabel === 'A组' &&
      r1.groupId === 'gA' &&
      r1.roundLabel === 'R1' &&
      r1.roundIndex === 1 &&
      r1.stationMatchId === 'm1'
  );
  assert(
    '同一球员跨 R1/R2 显示两条不同来源',
    r1 &&
      r2 &&
      r1.subLabel === 'R1 · A组' &&
      r2.subLabel === 'R2 · B组' &&
      r1.groupId === 'gA' &&
      r2.groupId === 'gB2' &&
      r1.stationMatchId === 'm1' &&
      r2.stationMatchId === 'm2' &&
      r1.occurrenceKey !== r2.occurrenceKey
  );
  assert(
    '不同组正确映射，不串轮',
    r2u2 &&
      r2u2.subLabel === 'R2 · C组' &&
      r2u2.groupId === 'gC' &&
      r2u2.stationMatchId === 'm2' &&
      red.filter(function (p) {
        return p.playerId === 'u-r1' && p.groupId === 'gC';
      }).length === 0
  );
  assert(
    'scorecard 点击仍指向正确 round/station/player',
    r1.canOpenScorecard === true &&
      r1.roundId === 'r1' &&
      r1.matchId === 'm1' &&
      standingsVm.resolveStandingsScorecardRoundId(r1, 'cumulative') === 'r1' &&
      standingsVm.resolveStandingsScorecardRoundId(r2, 'cumulative') === 'r2'
  );
  assert(
    '计入/未计入排序与分隔线仍由 counting 投影',
    team &&
      dividerAt === 2 &&
      red[0].isCounting === true &&
      red[1].isCounting === true &&
      red.slice(2).every(function (p) {
        return p.isCounting !== true;
      })
  );

  var r1vm = vmFor(series, built, 'r1');
  var r1players = teamPlayers(r1vm, 'team:red');
  assert(
    'Rn 展开不出现 Series 来源副信息',
    r1players.length > 0 &&
      r1players.every(function (p) {
        return !p.subLabel;
      })
  );
})();

(function missingGroupLabel() {
  var series = makeSeries({
    scoringRule: {
      mode: 'global_m',
      globalM: 1,
      allowRepeat: false,
      scoreBasis: 'gross',
      ruleVersion: 1
    },
    rounds: [{ roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' }]
  });
  var m1 = makeG1Match({
    matchId: 'm1',
    roundId: 'r1',
    patch: {
      groups: [
        {
          groupId: 'gA',
          players: [{ userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' }]
        }
      ],
      scoreData: {
        gA: { scoresByPlayer: { 'u-r1': { scores: fillScores(18, 4) } } }
      }
    }
  });
  var built = buildWith(series, { m1: m1 });
  var vm = vmFor(series, built, 'cumulative');
  var row = teamPlayers(vm, 'team:red').find(function (p) {
    return p.playerId === 'u-r1';
  });
  assert(
    '缺 groupLabel 时只显示 Rn，不编造 A组',
    row &&
      row.groupId === 'gA' &&
      !row.groupLabel &&
      row.subLabel === 'R1' &&
      row.subLabel.indexOf('A组') < 0 &&
      !(vm.totExpandErrors || []).some(function (e) {
        return e.reason === 'missing_group';
      })
  );
})();

(function missingGroupBoundary() {
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: makeSeries({
      rounds: [{ roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' }]
    }),
    selectedKey: 'cumulative',
    roundStates: [{ roundId: 'r1', index: 1, label: 'R1', statusToken: 'completed' }],
    standingsResult: {
      participantRows: [
        {
          seriesParticipantId: 'team:red',
          rank: 1,
          grossTotalValue: 72,
          toParValue: 0,
          allEntries: [
            {
              entryId: 'orphan',
              roundId: 'r1',
              roundIndex: 1,
              matchId: 'm1',
              resultUnitType: 'player',
              unitId: 'u-r1',
              playerId: 'u-r1',
              unitName: '红一',
              memberUserIds: ['u-r1'],
              counting: 'counted',
              resultStatus: 'OK',
              grossTotalValue: 72,
              toParValue: 0,
              thruLabel: 'F'
            }
          ],
          roundLineups: []
        }
      ],
      roundMeta: { r1: { hasFormalGroups: false, stationStarted: true, cancelled: false } }
    }
  });
  var row = teamPlayers(vm, 'team:red')[0];
  assert(
    '正式成绩找不到分组：保留 Rn，报告 missing_group，不编造 A组',
    row &&
      row.subLabel === 'R1' &&
      !row.groupId &&
      !row.groupLabel &&
      (vm.totExpandErrors || []).some(function (e) {
        return (
          e.reason === 'missing_group' &&
          e.playerId === 'u-r1' &&
          e.roundId === 'r1'
        );
      })
  );
})();

(function g2HelperParity() {
  var series = makeSeries({
    seriesId: 'series-g2-tot',
    publishToken: 'pub-g2-tot',
    scoringRule: {
      mode: 'global_m',
      globalM: 2,
      allowRepeat: true,
      scoreBasis: 'gross',
      ruleVersion: 1
    },
    rounds: [{ roundId: 'r1', index: 1, matchId: 'm-r1', gameMode: '四人四球比杆赛' }]
  });
  function users() {
    return [
      { userId: 'u-r1', nickname: '红一', matchTeamId: 'red' },
      { userId: 'u-r2', nickname: '红二', matchTeamId: 'red' },
      { userId: 'u-r3', nickname: '红三', matchTeamId: 'red' },
      { userId: 'u-r4', nickname: '红四', matchTeamId: 'red' },
      { userId: 'u-b1', nickname: '蓝一', matchTeamId: 'blue' },
      { userId: 'u-b2', nickname: '蓝二', matchTeamId: 'blue' }
    ];
  }
  function g2Match(roundId, matchId, groupId, groupName, extraEntities, extraScores) {
    return {
      matchId: matchId,
      matchType: 'inter-team',
      status: 'finished',
      gameMode: '四人四球比杆赛',
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
        seriesId: 'series-g2-tot',
        roundId: roundId,
        publishToken: 'pub-g2-tot'
      },
      registerInfo: { users: users() },
      groups: [
        {
          groupId: groupId,
          groupName: groupName,
          players: users()
        }
      ],
      scoreEntities: extraEntities,
      scoreData: extraScores,
      pairings: {}
    };
  }
  var m1 = g2Match(
    'r1',
    'm-r1',
    'gA',
    'A组',
    {
      gA: [
        {
          entityId: 'e-red',
          entityType: 'team',
          compositionMode: '2+2',
          teamGroupId: 'red',
          members: ['u-r1', 'u-r2']
        }
      ]
    },
    {
      gA: {
        teamScoresByEntity: [{ entityId: 'e-red', scores: fillScores(18, 4) }]
      }
    }
  );
  var projected = adapter.projectSeriesStandingsTeamBoard({
    selectedKey: 'cumulative',
    series: series,
    getMatchById: function (id) {
      return id === 'm-r1' ? m1 : null;
    },
    getIndexByMatchId: function () {
      return { seriesId: 'series-g2-tot', roundId: 'r1', publishToken: 'pub-g2-tot' };
    },
    viewerRemarkCtx: {}
  });
  var combo =
    projected &&
    projected.overlay &&
    projected.overlay.teamRows &&
    projected.overlay.teamRows[0] &&
    projected.overlay.teamRows[0].players &&
    projected.overlay.teamRows[0].players[0];
  assert(
    'G2 TOT 原 subLabel 不退化',
    projected &&
      projected.useShared === true &&
      combo &&
      combo.subLabel === 'R1 · A组' &&
      combo.subLabel === standingsVm.formatTotRowSubLabel(combo.roundLabel, combo.groupLabel)
  );
})();

var liveWxml = read(path.join(mini, 'components', 'live-leaderboard-board', 'index.wxml'));
var detailWxml = read(
  path.join(mini, 'subpackages', 'tournament', 'pages', 'detail', 'index.wxml')
);
assert(
  'Rn live board 与普通 detail 不出现 Series 来源副信息',
  liveWxml.indexOf('sub-label') < 0 &&
    liveWxml.indexOf('subLabel') < 0 &&
    detailWxml.indexOf('sub-label') < 0 &&
    detailWxml.indexOf('player.subLabel') < 0
);

console.log('');
console.log('---- seriesTotRowProvenanceParity.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
