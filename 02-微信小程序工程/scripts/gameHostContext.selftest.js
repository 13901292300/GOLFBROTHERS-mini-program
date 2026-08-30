/**
 * GameHostContext：方契约与三宿主归一化。
 * 运行：node scripts/gameHostContext.selftest.js
 */
var path = require('path');
var fs = require('fs');
var host = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var engine = require('../miniprogram/subpackages/game/utils/sideGameEngine.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');

var passed = 0;
var failed = 0;

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function filled18(n) {
  var a = [];
  for (var i = 0; i < 18; i++) a.push(n);
  return a;
}

function comboMatch(extra) {
  var base = {
    matchId: 'team-match-1',
    gameMode: '四人两球比杆赛',
    front9Course: 'C',
    back9Course: 'D',
    updatedAt: 100,
    groups: [
      {
        groupId: 'g1',
        groupName: '第1组',
        players: [
          { userId: 'u1', playerId: 'u1', position: 1, name: 'A' },
          { userId: 'u2', playerId: 'u2', position: 2, name: 'B' },
          { userId: 'u3', playerId: 'u3', position: 3, name: 'C' },
          { userId: 'u4', playerId: 'u4', position: 4, name: 'E' }
        ]
      },
      {
        groupId: 'g2',
        groupName: '第2组',
        players: [
          { userId: 'u5', playerId: 'u5', position: 1, name: 'F' },
          { userId: 'u6', playerId: 'u6', position: 2, name: 'G' }
        ]
      }
    ],
    scoreEntities: {
      g1: [
        { entityId: 'ent-1', members: ['u1', 'u2'], teamGroupId: 'red' },
        { entityId: 'ent-2', members: ['u3', 'u4'], teamGroupId: 'blue' }
      ],
      g2: [{ entityId: 'ent-3', members: ['u5', 'u6'], teamGroupId: 'red' }]
    },
    scoreData: {
      g1: {
        teamScoresByEntity: [
          { teamId: 'ent-1', scores: filled18(4) },
          { teamId: 'ent-2', scores: filled18(5) }
        ]
      },
      g2: {
        teamScoresByEntity: [{ teamId: 'ent-3', scores: filled18(4) }]
      }
    },
    teamGroups: [
      { id: 'red', name: '红队' },
      { id: 'blue', name: '蓝队' }
    ]
  };
  if (extra) {
    Object.keys(extra).forEach(function (k) {
      base[k] = extra[k];
    });
  }
  return base;
}

assert(
  'game 分包存在 gameHostContext.js',
  fs.existsSync(path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils', 'gameHostContext.js'))
);
assert(
  '主包已删除完整适配器',
  !fs.existsSync(path.join(__dirname, '..', 'miniprogram', 'utils', 'gameHostContext.js'))
);

var caps = host.listRuleCapabilities();
assert('17 条规则能力', caps.length === 17, String(caps.length));
var catalogIds = [];
(catalog.CATALOG || []).forEach(function (g) {
  (g.items || []).forEach(function (item) {
    catalogIds.push(item.id);
  });
});
assert('catalog 17 ruleId', catalogIds.length === 17, String(catalogIds.length));
catalogIds.forEach(function (id) {
  var cap = host.capOf(id);
  var rule = catalog.findRule(id);
  assert(
    id + ' requiredPartyCount=' + (rule && rule.players),
    !!(cap && cap.requiredPartyCount === rule.players && cap.requiresIndividualScores === false)
  );
});

var noHole = host.buildFromGameSnapshot(
  {
    gameId: 'g-casual',
    gameMode: '个人比杆赛',
    groups: [
      {
        groupId: 'g1',
        playersSlots: [{ playerId: 'u1', name: 'A' }],
        scoresByPlayer: { u1: { scores: filled18(4) } }
      }
    ]
  },
  { scope: 'match', allowBigPot: false }
);
assert('无半场则 holeContextReady=false', noHole.holeContextReady === false);
assert('无半场 holeOrder 为空', Array.isArray(noHole.holeOrder) && noHole.holeOrder.length === 0);
assert('无半场不映射成绩', Object.keys(noHole.officialScoresByPartyId).length === 0);
assert('洞序不是 A1–B9 默认', noHole.holeOrder.join(',') !== 'A1,A2,A3,A4,A5,A6,A7,A8,A9,B1,B2,B3,B4,B5,B6,B7,B8,B9');

var personal = host.buildFromGameSnapshot(
  {
    gameId: 'g-casual',
    gameMode: '个人比杆赛',
    front9Course: 'C',
    back9Course: 'D',
    createdAt: 9,
    groups: [
      {
        groupId: 'g1',
        playersSlots: [
          { playerId: 'u1', name: 'A' },
          { playerId: 'u2', name: 'B' }
        ],
        scoresByPlayer: {
          u1: { scores: filled18(4) },
          u2: { scores: filled18(5) }
        }
      }
    ]
  },
  { scope: 'group', groupId: 'g1', allowBigPot: true }
);
assert('个人赛 matchId=gameId', personal.matchId === 'g-casual');
assert('个人赛 2 个 player party', personal.scoreParties.length === 2 && personal.scoreParties[0].partyType === 'player');
assert('个人赛便利视图有成绩', !!personal.officialScoresByPlayerId.u1);
assert('allowBigPot 记分页', personal.allowBigPot === true);

var fourCombo = host.buildFromTeamMatchSnapshot(
  comboMatch({
    scoreEntities: {
      g1: [
        { entityId: 'c1', members: ['u1', 'u2'] },
        { entityId: 'c2', members: ['u3', 'u4'] }
      ],
      g2: [
        { entityId: 'c3', members: ['u5', 'x'] },
        { entityId: 'c4', members: ['u6'] }
      ]
    },
    groups: [
      {
        groupId: 'g1',
        players: [
          { userId: 'u1', position: 1 },
          { userId: 'u2', position: 2 },
          { userId: 'u3', position: 3 },
          { userId: 'u4', position: 4 }
        ]
      },
      {
        groupId: 'g2',
        players: [
          { userId: 'u5', position: 1 },
          { userId: 'u6', position: 2 },
          { userId: 'u7', position: 3 },
          { userId: 'u8', position: 4 }
        ]
      }
    ],
    scoreEntities: {
      g1: [
        { entityId: 'c1', members: ['u1', 'u2'] },
        { entityId: 'c2', members: ['u3', 'u4'] }
      ],
      g2: [
        { entityId: 'c3', members: ['u5', 'u6'] },
        { entityId: 'c4', members: ['u7', 'u8'] }
      ]
    },
    scoreData: {
      g1: {
        teamScoresByEntity: [
          { teamId: 'c1', scores: filled18(4) },
          { teamId: 'c2', scores: filled18(5) }
        ]
      },
      g2: {
        teamScoresByEntity: [
          { teamId: 'c3', scores: filled18(4) },
          { teamId: 'c4', scores: filled18(6) }
        ]
      }
    }
  }),
  { scope: 'match', allowBigPot: false }
);
assert('4 个 combination = 4 方', fourCombo.scoreParties.length === 4, String(fourCombo.scoreParties.length));
assert(
  'combination 不写入个人便利视图',
  Object.keys(fourCombo.officialScoresByPlayerId).length === 0
);
var v4 = host.validatePartySelection(fourCombo, ['c1', 'c2', 'c3', 'c4'], '8421-4');
assert('4 个两人 combination 通过 4 方数量校验', v4.ok === true, v4.message);

var oneCombo = host.buildFromTeamMatchSnapshot(
  comboMatch({
    groups: [
      {
        groupId: 'g1',
        players: [
          { userId: 'u1', position: 1 },
          { userId: 'u2', position: 2 }
        ]
      }
    ],
    scoreEntities: { g1: [{ entityId: 'only', members: ['u1', 'u2'] }] },
    scoreData: { g1: { teamScoresByEntity: [{ teamId: 'only', scores: filled18(4) }] } }
  }),
  { scope: 'group', groupId: 'g1' }
);
assert('1 个两人 combination 只算 1 方', oneCombo.scoreParties.length === 1);
var v2need = host.validatePartySelection(oneCombo, ['only'], 'stroke-2');
assert(
  '1 方不能当 2 方',
  v2need.ok === false && v2need.reason === 'party_count',
  v2need.message
);
assert(
  '方数不足文案独立',
  /需要2方/.test(v2need.message) && /选择1方/.test(v2need.message)
);

var fourSide = host.buildFromTeamMatchSnapshot(
  {
    matchId: 'team-match-side',
    gameMode: '四人四球比洞赛',
    front9Course: 'C',
    back9Course: 'D',
    updatedAt: 2,
    registerInfo: {
      users: [
        { userId: 'a1', matchTeamId: 'red' },
        { userId: 'a2', matchTeamId: 'red' },
        { userId: 'b1', matchTeamId: 'blue' },
        { userId: 'b2', matchTeamId: 'blue' },
        { userId: 'c1', matchTeamId: 'green' },
        { userId: 'c2', matchTeamId: 'green' },
        { userId: 'd1', matchTeamId: 'gold' },
        { userId: 'd2', matchTeamId: 'gold' }
      ]
    },
    teamGroups: [
      { id: 'red', name: '红' },
      { id: 'blue', name: '蓝' },
      { id: 'green', name: '绿' },
      { id: 'gold', name: '金' }
    ],
    groups: [
      {
        groupId: 'g1',
        players: [
          { userId: 'a1', position: 1 },
          { userId: 'a2', position: 2 },
          { userId: 'b1', position: 3 },
          { userId: 'b2', position: 4 }
        ]
      },
      {
        groupId: 'g2',
        players: [
          { userId: 'c1', position: 1 },
          { userId: 'c2', position: 2 },
          { userId: 'd1', position: 3 },
          { userId: 'd2', position: 4 }
        ]
      }
    ],
    scoreData: {
      g1: {
        scoresBySide: {
          red: { sideId: 'red', scores: filled18(4) },
          blue: { sideId: 'blue', scores: filled18(5) }
        }
      },
      g2: {
        scoresBySide: {
          green: { sideId: 'green', scores: filled18(4) },
          gold: { sideId: 'gold', scores: filled18(5) }
        }
      }
    }
  },
  { scope: 'match' }
);
assert('4 个 side = 4 方', fourSide.scoreParties.length === 4 && fourSide.scoreParties[0].partyType === 'side', String(fourSide.scoreParties.length));
assert(
  'side 有成绩不报 no_individual_scores',
  host.validatePartySelection(
    fourSide,
    fourSide.scoreParties.map(function (p) { return p.partyId; }),
    '8421-4'
  ).ok === true
);
assert(
  'combination 有成绩不报 no_individual_scores',
  v4.reason !== 'no_individual_scores'
);

var mixedHost = host.emptyContext({
  holeContextReady: true,
  holeOrder: ['C1'],
  pars: { C1: 4 },
  scoreParties: [
    {
      partyId: 'p1',
      partyType: 'player',
      displayName: '个人甲',
      memberPlayerIds: ['u1'],
      groupId: 'g1',
      teamId: '',
      scoreAvailable: true
    },
    {
      partyId: 'c9',
      partyType: 'combination',
      displayName: '组合乙',
      memberPlayerIds: ['u2', 'u3'],
      groupId: 'g1',
      teamId: '',
      scoreAvailable: true
    }
  ],
  officialScoresByPartyId: {
    p1: { holes: { C1: { score: 4 } } },
    c9: { holes: { C1: { score: 5 } } }
  }
});
var mixedOk = host.validatePartySelection(mixedHost, ['p1', 'c9'], 'stroke-2');
assert('player+combination 按 2 方计', mixedOk.ok === true, mixedOk.message);

var missing = host.validatePartySelection(
  {
    holeContextReady: true,
    scoreParties: [
      { partyId: 'p1', partyType: 'player', displayName: '甲', memberPlayerIds: ['u1'] },
      { partyId: 'p2', partyType: 'player', displayName: '乙', memberPlayerIds: ['u2'] }
    ],
    officialScoresByPartyId: {
      p1: { holes: { C1: { score: 4 } } }
    }
  },
  ['p1', 'p2'],
  'stroke-2'
);
assert('缺成绩 reason=missing_score', missing.reason === 'missing_score', missing.reason);
assert('缺成绩用显示名', missing.message.indexOf('乙暂无可用成绩') === 0, missing.message);
assert('缺成绩与方数错误不同', missing.reason !== 'party_count');

var groupOnly = host.buildFromTeamMatchSnapshot(comboMatch(), { scope: 'group', groupId: 'g1' });
assert(
  'group scope 只含本组 party',
  groupOnly.scoreParties.every(function (p) { return p.groupId === 'g1'; })
);
assert('group scope 成员均在本组', groupOnly.scoreParties.every(function (p) {
  return p.memberPlayerIds.every(function (id) {
    return ['u1', 'u2', 'u3', 'u4'].indexOf(id) >= 0;
  });
}));

var engineScores = host.scoresToEngineFormat(fourCombo.officialScoresByPartyId, fourCombo.holeOrder);
var settleRes = engine.settle({
  matchId: fourCombo.matchId,
  sideGameId: 'sg-test',
  ruleId: '8421-4',
  holeOrder: fourCombo.holeOrder,
  sideGame: {
    catalogId: '8421-4',
    players: fourCombo.scoreParties.map(function (p) {
      return { id: p.partyId };
    })
  },
  scores: engineScores,
  pars: fourCombo.pars
});
assert('结算仍走 sideGameEngine', settleRes.ok === true, JSON.stringify(settleRes.reason || ''));

assert('sideGameId 不在 Host', host.buildFromGameSnapshot({ gameId: 'x', front9Course: 'C', back9Course: 'D' }).sideGameId == null);

var isoGame = {
  gameId: 'iso-g',
  gameMode: '个人比杆赛',
  front9Course: 'C',
  back9Course: 'D',
  groups: [
    {
      groupId: 'g1',
      playersSlots: [{ playerId: 'u1', name: 'A' }],
      scoresByPlayer: { u1: { scores: filled18(4) } }
    }
  ]
};
var isoCtx = host.buildFromGameSnapshot(isoGame, { scope: 'match' });
isoGame.groups[0].playersSlots[0].name = 'MUTATED';
assert('改比赛对象不污染 context', isoCtx.scoreParties[0].displayName === 'A');
isoCtx.scoreParties[0].displayName = 'HACK';
assert('改 context 不污染比赛对象', isoGame.groups[0].playersSlots[0].name === 'MUTATED');
var snapIso = {
  source: 'gameStore',
  matchId: 'iso-g',
  scope: 'match',
  gameMode: '个人比杆赛',
  courseContext: { front9Course: 'C', back9Course: 'D' },
  groups: [
    {
      groupId: 'g1',
      playersSlots: [{ playerId: 'u1', name: 'A' }],
      scoresByPlayer: { u1: { scores: filled18(4) } }
    }
  ]
};
var ctxFromSnap = host.buildFromHostSnapshot(snapIso);
snapIso.groups[0].playersSlots[0].name = 'SNAP-MUT';
ctxFromSnap.matchId = 'hacked';
assert(
  '改 hostSnapshot / context 互不污染',
  snapIso.matchId === 'iso-g' &&
    snapIso.groups[0].playersSlots[0].name === 'SNAP-MUT' &&
    ctxFromSnap.scoreParties[0].displayName === 'A'
);

console.log('\ngameHostContext.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
