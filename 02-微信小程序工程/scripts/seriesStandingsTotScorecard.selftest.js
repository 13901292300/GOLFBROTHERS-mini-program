/**
 * TOT 球队展开：按轮次上场记录打开行内详情（不跳转隐藏分站页）
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandingsTotScorecard.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..', 'miniprogram', 'utils');
var teamMatchScorecard = require(path.join(root, 'teamMatchScorecard.js'));
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
      seriesId: 'series-tot-sc',
      publishToken: 'pub-tot-sc',
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
        seriesId: 'series-tot-sc',
        roundId: roundId,
        publishToken: 'pub-tot-sc'
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
      courseName: 'Test',
      eventInfoList: [{ type: 'image', imageData: 'https://example.com/ad.png' }]
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
  return (t && t.players) || [];
}

function sliceMethod(src, name, nextName) {
  var start = src.indexOf(name + ': function');
  var end = nextName ? src.indexOf(nextName + ': function', start + 1) : src.length;
  if (start < 0 || end < 0 || end <= start) return '';
  return src.slice(start, end);
}

var tapBody = sliceMethod(pageJs, 'onStandingsPlayerTap', 'onStandingsPersonalLeaderboardRowTap');
var openBody = sliceMethod(pageJs, '_openStandingsPlayerScorecard', 'onStandingsScorecardAdError');
var profileBody = sliceMethod(pageJs, 'onStandingsScorecardProfileTap', 'onStandingsScorecardFollow');

assert('接线：TOT 点击不再拦截 cumulative', tapBody.indexOf('CUMULATIVE_KEY') < 0);
assert(
  '接线：按行 roundId 打开',
  openBody.indexOf('resolveStandingsScorecardRoundId') >= 0
);
assert(
  '接线：核验失败文案',
  openBody.indexOf('本轮比赛数据异常') >= 0 && openBody.indexOf('轮次不匹配') < 0
);
assert(
  '接线：打开不改 TOT/球队展开/吸顶',
  openBody.indexOf('_standingsSelectedKey') < 0 &&
    openBody.indexOf('expandedStandingsTeamId') < 0 &&
    openBody.indexOf('_syncStickyByScroll') < 0
);
assert(
  '接线：openKey 用 scorecardKey/occurrenceKey',
  tapBody.indexOf('nextStandingsOpenKey') >= 0 && tapBody.indexOf('occurrenceKey') >= 0
);
assert(
  '接线：主页不用 entityId 冒充',
  profileBody.indexOf('frozen.entityId') >= 0 &&
    openBody.indexOf('_resolveStandingsProfilePlayerId') >= 0
);

assert(
  'openKey 再点收起',
  standingsVm.nextStandingsOpenKey('r1:u-r1', 'r1:u-r1') === ''
);
assert(
  'openKey 换行切换',
  standingsVm.nextStandingsOpenKey('r1:u-r1', 'r2:u-r1') === 'r2:u-r1'
);
assert(
  'TOT 用行 roundId',
  standingsVm.resolveStandingsScorecardRoundId({ roundId: 'r2' }, 'cumulative') === 'r2'
);
assert(
  'R 榜仍校验所选轮',
  standingsVm.resolveStandingsScorecardRoundId({ roundId: 'r2' }, 'r1') === ''
);
assert(
  '核验失败：无 roundId 不打开',
  standingsVm.resolveStandingsScorecardRoundId({ playerId: 'u-r1' }, 'cumulative') === ''
);

// 1 lineup-only → TEEING OFF SOON
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
          players: [{ userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' }]
        }
      ]
    }
  });
  var built = buildWith(series, { m1: m1 }, { m1: { seriesId: 'series-tot-sc', roundId: 'r1' } });
  var vm = vmFor(series, built, 'cumulative', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'scheduled', hasMatchId: true }
  ]);
  var row = teamPlayers(vm, 'team:red')[0];
  var sig = standingsVm.mainBoardSignature(vm);
  assert(
    '1 TOT 占位可点',
    row &&
      row.fromLineup === true &&
      row.canOpenScorecard === true &&
      row.occurrenceKey === 'r1:u-r1' &&
      row.playerId === 'u-r1' &&
      row.playerId !== row.occurrenceKey &&
      row.matchId === 'm1' &&
      row.groupId === 'g1'
  );
  var panel = teamMatchScorecard.resolveStandingsExpandPanel(
    m1,
    { groupId: row.groupId, playerId: row.playerId },
    'gross'
  );
  assert('1 TEEING OFF SOON', panel.state === 'teeing_off_soon' && panel.emptyLabel === 'TEEING OFF SOON');
  assert('1 展开不影响球队总分签名', standingsVm.mainBoardSignature(vm) === sig);
})();

// 2 已开赛无杆数 → AWAITING SCORE
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
          players: [{ userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' }]
        }
      ]
    }
  });
  var built = buildWith(series, { m1: m1 }, { m1: { seriesId: 'series-tot-sc', roundId: 'r1' } });
  var vm = vmFor(series, built, 'cumulative', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'live', hasMatchId: true }
  ]);
  var row = teamPlayers(vm, 'team:red')[0];
  var panel = teamMatchScorecard.resolveStandingsExpandPanel(
    m1,
    { groupId: row.groupId, playerId: row.playerId },
    'gross'
  );
  assert('2 AWAITING SCORE', panel.state === 'awaiting_score' && panel.emptyLabel === 'AWAITING SCORE');
})();

// 3 有成绩 → 该轮逐洞卡
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
          players: [{ userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' }]
        }
      ],
      scoreData: { g1: { scoresByPlayer: { 'u-r1': { scores: fillScores(4, 4) } } } }
    }
  });
  var built = buildWith(series, { m1: m1 }, { m1: { seriesId: 'series-tot-sc', roundId: 'r1' } });
  var vm = vmFor(series, built, 'cumulative', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'live', hasMatchId: true }
  ]);
  var row = teamPlayers(vm, 'team:red')[0];
  var panel = teamMatchScorecard.resolveStandingsExpandPanel(
    m1,
    { groupId: row.groupId, playerId: row.playerId },
    'gross'
  );
  assert('3 有成绩显示逐洞卡', panel.state === 'scorecard' && !!panel.scorecard);
})();

// 4 同一球员 R1/R2 两行分别打开正确 match
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
      scoreData: { g1: { scoresByPlayer: { 'u-r1': { scores: fillScores(2, 3) } } } }
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
      scoreData: { g1: { scoresByPlayer: { 'u-r1': { scores: fillScores(8, 5) } } } }
    }
  });
  var built = buildWith(
    series,
    { m1: m1, m2: m2 },
    {
      m1: { seriesId: 'series-tot-sc', roundId: 'r1' },
      m2: { seriesId: 'series-tot-sc', roundId: 'r2' }
    }
  );
  var vm = vmFor(series, built, 'cumulative', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'live', hasMatchId: true },
    { roundId: 'r2', index: 2, label: 'R2', statusToken: 'live', hasMatchId: true }
  ]);
  var rows = teamPlayers(vm, 'team:red').filter(function (p) {
    return p.playerId === 'u-r1';
  });
  var r1 = rows.find(function (p) {
    return p.roundId === 'r1';
  });
  var r2 = rows.find(function (p) {
    return p.roundId === 'r2';
  });
  assert(
    '4 两行 occurrenceKey 不同',
    r1 &&
      r2 &&
      r1.occurrenceKey === 'r1:u-r1' &&
      r2.occurrenceKey === 'r2:u-r1' &&
      r1.matchId === 'm1' &&
      r2.matchId === 'm2'
  );
  var p1 = teamMatchScorecard.resolveStandingsExpandPanel(
    m1,
    { groupId: r1.groupId, playerId: r1.playerId },
    'gross'
  );
  var p2 = teamMatchScorecard.resolveStandingsExpandPanel(
    m2,
    { groupId: r2.groupId, playerId: r2.playerId },
    'gross'
  );
  assert(
    '4 分别打开 R1/R2 记分卡',
    p1.state === 'scorecard' &&
      p2.state === 'scorecard' &&
      JSON.stringify(p1.scorecard) !== JSON.stringify(p2.scorecard)
  );
  assert(
    '4 TOT 解析 roundId 不跟 selectedKey',
    standingsVm.resolveStandingsScorecardRoundId(r1, 'cumulative') === 'r1' &&
      standingsVm.resolveStandingsScorecardRoundId(r2, 'cumulative') === 'r2'
  );
})();

// 5 G2–G4 使用 entity/pair 成绩，头像仍是真实球员
(function () {
  var series = makeSeries({
    rounds: [{ roundId: 'r1', index: 1, matchId: 'm1', gameMode: '四人四球比杆赛' }]
  });
  var m1 = makeManagedMatch({
    matchId: 'm1',
    roundId: 'r1',
    gameMode: '四人四球比杆赛',
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
      scoreEntities: {
        g1: [
          {
            entityId: 'ent-red',
            entityType: 'team',
            teamGroupId: 'red',
            members: ['u-r1', 'u-r2']
          }
        ]
      },
      scoreData: {
        g1: { teamScoresByEntity: [{ teamId: 'ent-red', scores: fillScores(3, 4) }] }
      }
    }
  });
  var built = buildWith(series, { m1: m1 }, { m1: { seriesId: 'series-tot-sc', roundId: 'r1' } });
  var vm = vmFor(series, built, 'cumulative', [
    { roundId: 'r1', index: 1, label: 'R1', statusToken: 'live', hasMatchId: true }
  ]);
  var row = teamPlayers(vm, 'team:red')[0];
  assert(
    '5 G2 行带真实球员与 entityId',
    row &&
      row.canOpenScorecard === true &&
      row.playerId === 'u-r1' &&
      row.playerId !== 'ent-red' &&
      row.playerId !== row.occurrenceKey &&
      row.entityId === 'ent-red' &&
      row.isEntity === true
  );
  var panel = teamMatchScorecard.resolveStandingsExpandPanel(
    m1,
    {
      groupId: row.groupId,
      playerId: row.playerId,
      entityId: row.entityId,
      isEntity: true,
      resultUnitType: row.resultUnitType
    },
    'gross'
  );
  assert('5 G2 组合记分卡', panel.state === 'scorecard' && panel.kind === 'entity');
  var scoring = teamMatchScorecard.resolveStrokeScoringRow(m1, {
    groupId: row.groupId,
    playerId: row.playerId,
    entityId: row.entityId
  });
  assert(
    '5 头像球员 ≠ entityId',
    scoring.playerId === 'u-r1' && scoring.entityId === 'ent-red' && scoring.playerId !== scoring.entityId
  );

  var m4 = makeManagedMatch({
    matchId: 'm4',
    roundId: 'r1',
    gameMode: '四人两球比杆赛',
    status: 'ongoing',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [
            { userId: 'u-r1', position: 1, matchTeamId: 'red' },
            { userId: 'u-r2', position: 2, matchTeamId: 'red' }
          ]
        }
      ],
      scoreEntities: {
        g1: [{ entityId: 'pair-1', entityType: 'pair', members: ['u-r1', 'u-r2'] }]
      },
      scoreData: {
        g1: { teamScoresByEntity: [{ teamId: 'pair-1', scores: fillScores(2, 5) }] }
      }
    }
  });
  var r4 = teamMatchScorecard.resolveStrokeScoringRow(m4, { groupId: 'g1', playerId: 'u-r1' });
  var p4 = teamMatchScorecard.resolveStandingsExpandPanel(
    m4,
    { groupId: 'g1', playerId: 'u-r1', entityId: 'pair-1', resultUnitType: 'pair' },
    'gross'
  );
  assert('5 G4 pair 成绩', r4.resultUnitType === 'pair' && p4.state === 'scorecard');
})();

console.log('');
console.log('--- seriesStandingsTotScorecard.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exitCode = 1;
}
