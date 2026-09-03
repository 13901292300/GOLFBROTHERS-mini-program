/**
 * 2+2 编队：比杆/比洞/三局 party subject 保存校验。
 */
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var entitlement = require('../miniprogram/subpackages/game/utils/sideGameEntitlementProvider.js');

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

function memStorage() {
  var bag = {};
  return {
    getItem: function (key) {
      return bag[key];
    },
    setItem: function (key, value) {
      bag[key] = JSON.parse(JSON.stringify(value));
      return true;
    },
    _bag: bag
  };
}

function makeHost() {
  var holeOrder = ['A1', 'A2', 'A3'];
  var scores = {};
  ['entity-A', 'entity-B'].forEach(function (id) {
    scores[id] = {
      holes: { A1: { score: 4 }, A2: { score: 5 }, A3: { score: 4 } }
    };
  });
  return hostMod.emptyContext({
    matchId: 'm22',
    groupId: 'g1',
    scope: 'group',
    revision: 'r1',
    holeContextReady: true,
    holeOrder: holeOrder,
    pars: { A1: 4, A2: 4, A3: 4 },
    allowBigPot: true,
    players: [
      { playerId: 'A1', groupId: 'g1' },
      { playerId: 'A2', groupId: 'g1' },
      { playerId: 'B1', groupId: 'g1' },
      { playerId: 'B2', groupId: 'g1' }
    ],
    scoreParties: [
      {
        partyId: 'entity-A',
        partyType: 'combination',
        displayName: '甲组',
        memberPlayerIds: ['A1', 'A2'],
        groupId: 'g1'
      },
      {
        partyId: 'entity-B',
        partyType: 'combination',
        displayName: '乙组',
        memberPlayerIds: ['B1', 'B2'],
        groupId: 'g1'
      }
    ],
    officialScoresByPartyId: scores,
    groupCompositionMap: {
      g1: {
        compositionType: '2+2',
        teams: [
          {
            teamId: 'party-A',
            name: 'Team 1',
            members: [{ playerId: 'A1' }, { playerId: 'A2' }]
          },
          {
            teamId: 'party-B',
            name: 'Team 2',
            members: [{ playerId: 'B1' }, { playerId: 'B2' }]
          }
        ]
      }
    }
  });
}

function payloadOf(catalogId, title) {
  var snap = rec.buildRuleSnapshot(catalogId);
  var parties = [
    { partyId: 'party-A', playerIds: ['A1', 'A2'] },
    { partyId: 'party-B', playerIds: ['B1', 'B2'] }
  ];
  var matchup = {
    id: 'party-A|party-B',
    leftPartyId: 'party-A',
    rightPartyId: 'party-B',
    leftId: 'party-A',
    rightId: 'party-B',
    on: true,
    handicap: '0',
    strokes: catalogId === 'stroke-2' ? '1' : '0',
    segmentHandicaps:
      catalogId === 'three-set'
        ? { front: '0', back: '-0.5', overall: '1' }
        : undefined
  };
  return {
    matchId: 'm22',
    groupId: 'g1',
    scope: 'group',
    ruleId: catalogId,
    ruleSnapshot: snap,
    title: title,
    visibility: 'public',
    status: 'active',
    revision: 1,
    participantParties: parties.map(function (p) {
      return {
        partyId: p.partyId,
        partyType: 'combination',
        memberPlayerIds: p.playerIds
      };
    }),
    config: {
      allowBigPot: false,
      windOn: false,
      instance: {
        catalogId: catalogId,
        name: title,
        parties: parties,
        matchups: [Object.assign({}, matchup)],
        pairings: [Object.assign({}, matchup)],
        playerSegmentHandicaps: null
      }
    }
  };
}

var host = makeHost();

// 修复前同类场景：composition id 不在 scoreParties → 曾报 party_not_in_host
var strokeCheck = rec.validateCreateInput(payloadOf('stroke-2', '比杆'), host);
assert('比杆校验通过', strokeCheck.ok, strokeCheck.reason);
assert(
  '比杆对齐成绩实体 id',
  strokeCheck.ok &&
    strokeCheck.record.participantParties[0].partyId === 'entity-A' &&
    strokeCheck.record.participantParties[1].partyId === 'entity-B'
);

var matchCheck = rec.validateCreateInput(payloadOf('match-2', '比洞'), host);
assert('比洞校验通过', matchCheck.ok, matchCheck.reason);

var threeCheck = rec.validateCreateInput(payloadOf('three-set', '三局'), host);
assert('三局校验通过', threeCheck.ok, threeCheck.reason);
assert(
  '三局保留组合级三段让杆',
  threeCheck.ok &&
    threeCheck.record.config.instance.pairings[0].segmentHandicaps &&
    String(threeCheck.record.config.instance.pairings[0].segmentHandicaps.back) === '-0.5'
);

// 空 scoreParties 但 composition+players 完整 → 也应通过
var hostCompOnly = hostMod.emptyContext({
  matchId: 'm22',
  groupId: 'g1',
  scope: 'group',
  revision: 'r1',
  holeContextReady: true,
  holeOrder: ['A1'],
  pars: { A1: 4 },
  players: [
    { playerId: 'A1', groupId: 'g1' },
    { playerId: 'A2', groupId: 'g1' },
    { playerId: 'B1', groupId: 'g1' },
    { playerId: 'B2', groupId: 'g1' }
  ],
  scoreParties: [],
  officialScoresByPartyId: {},
  groupCompositionMap: host.groupCompositionMap
});
assert(
  '仅 composition 也可保存',
  rec.validateCreateInput(payloadOf('stroke-2', '比杆'), hostCompOnly).ok
);

// 批量原子保存
identity.setImplementation({
  implementation: 'test',
  getCurrentUserId: function () {
    return 'tester';
  }
});
entitlement.bindHostContext(host);
var storage = memStorage();
var repo = localMod.createLocalSideGameRepository({
  storage: storage,
  storageKey: 'sg_teamed_save',
  idGen: (function () {
    var n = 0;
    return function () {
      n += 1;
      return 'id' + n;
    };
  })(),
  clock: function () {
    return 1000;
  },
  settingsApi: {
    replace: function () {
      return true;
    },
    set: function () {
      return true;
    }
  }
});
var creates = ['stroke-2', 'match-2', 'three-set'].map(function (id) {
  var names = { 'stroke-2': '比杆', 'match-2': '比洞', 'three-set': '三局' };
  var p = payloadOf(id, names[id]);
  p.sideGameId = 'g-' + id;
  p.idempotencyKey = p.sideGameId;
  p.config.instance.matchups = [Object.assign({}, p.config.instance.matchups[0])];
  p.config.instance.pairings = [Object.assign({}, p.config.instance.pairings[0])];
  return p;
});
var m0 = creates[0].config.instance.matchups[0];
var m1 = creates[1].config.instance.matchups[0];
assert('创建前 matchup 非同一引用', m0 !== m1);
m0.handicap = '9';
assert('修改比杆不影响比洞', creates[1].config.instance.matchups[0].handicap !== '9');

var out = repo.commitSetupDraft({
  matchId: 'm22',
  groupId: 'g1',
  scope: 'group',
  entry: 'score',
  expectedRevisions: {},
  settings: { privacy: 'public' },
  hostContext: host,
  creates: creates,
  updates: [],
  removes: [],
  settleIds: creates.map(function (c) {
    return c.sideGameId;
  })
});
assert('三条一起保存成功', out.ok, out.reason);

var listed = repo.listVisible({
  matchId: 'm22',
  groupId: 'g1',
  scope: 'group',
  hostContext: host,
  viewerUserId: 'tester'
});
assert(
  '落库三条',
  listed.ok && listed.data && listed.data.items && listed.data.items.length === 3,
  listed.reason || JSON.stringify(listed.data)
);

var storage2 = memStorage();
var repo2 = localMod.createLocalSideGameRepository({
  storage: storage2,
  storageKey: 'sg_teamed_save2',
  idGen: function () {
    return 'x';
  },
  clock: function () {
    return 1;
  }
});
var bad = payloadOf('stroke-2', '比杆');
bad.sideGameId = 'bad';
bad.idempotencyKey = 'bad';
bad.participantParties = [
  { partyId: 'party-A', partyType: 'combination', memberPlayerIds: ['A1', 'A2'] },
  { partyId: 'ghost', partyType: 'combination', memberPlayerIds: ['Z1', 'Z2'] }
];
var outBad = repo2.commitSetupDraft({
  matchId: 'm22',
  groupId: 'g1',
  scope: 'group',
  entry: 'score',
  expectedRevisions: {},
  hostContext: host,
  creates: [JSON.parse(JSON.stringify(creates[1])), bad],
  updates: [],
  removes: [],
  settleIds: []
});
assert('含非法时整批失败', !outBad.ok);
var listed2 = repo2.listVisible({
  matchId: 'm22',
  groupId: 'g1',
  scope: 'group',
  hostContext: host,
  viewerUserId: 'tester'
});
assert(
  '失败零条落库',
  listed2.ok && listed2.data && listed2.data.items && listed2.data.items.length === 0
);

// 个人 1+1 不回归
var personal = rec.validateCreateInput(
  {
    matchId: 'm22',
    groupId: 'g1',
    scope: 'group',
    ruleId: 'stroke-2',
    ruleSnapshot: rec.buildRuleSnapshot('stroke-2'),
    title: '个人比杆',
    visibility: 'public',
    participantParties: [
      { partyId: 'A1', partyType: 'player', memberPlayerIds: ['A1'] },
      { partyId: 'B1', partyType: 'player', memberPlayerIds: ['B1'] }
    ],
    config: { allowBigPot: false, windOn: false, instance: {} }
  },
  host
);
assert('个人1+1仍可通过', personal.ok, personal.reason);

console.log('\nteamedPartySave.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
