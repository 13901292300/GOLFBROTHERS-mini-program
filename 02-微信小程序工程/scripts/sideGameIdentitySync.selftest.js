/**
 * GAME 人员调整：A→B 身份更正与纯删除同步 side-game。
 * 运行：node scripts/sideGameIdentitySync.selftest.js
 */
if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {}
  };
}

var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var sync = require('../miniprogram/subpackages/game/utils/sideGameIdentitySync.js');
var fs = require('fs');
var path = require('path');

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
    }
  };
}

function makeHost() {
  return hostMod.emptyContext({
    matchId: 'm-id',
    groupId: 'g1',
    scope: 'group',
    currentUserId: 'me',
    holeContextReady: true,
    holeOrder: catalog.HOLES.slice(),
    allowBigPot: true,
    players: [
      { playerId: 'A', groupId: 'g1' },
      { playerId: 'B', groupId: 'g1' },
      { playerId: 'C', groupId: 'g1' },
      { playerId: 'D', groupId: 'g1' }
    ],
    scoreParties: [
      { partyId: 'A', partyType: 'player', memberPlayerIds: ['A'], groupId: 'g1' },
      { partyId: 'B', partyType: 'player', memberPlayerIds: ['B'], groupId: 'g1' },
      { partyId: 'C', partyType: 'player', memberPlayerIds: ['C'], groupId: 'g1' },
      { partyId: 'D', partyType: 'player', memberPlayerIds: ['D'], groupId: 'g1' }
    ],
    officialScoresByPartyId: {
      A: { scores: { A1: 4, A2: 5 } },
      B: { scores: { A1: 4, A2: 4 } },
      C: { scores: { A1: 5, A2: 5 } },
      D: { scores: { A1: 4, A2: 5 } }
    }
  });
}

function createInput(patch) {
  var host = makeHost();
  var base = {
    matchId: 'm-id',
    groupId: 'g1',
    scope: 'group',
    ruleId: 'stroke-2',
    ruleSnapshot: rec.buildRuleSnapshot('stroke-2'),
    title: '比杆',
    participantParties: [
      { partyId: 'A', partyType: 'player', displayName: '甲', memberPlayerIds: ['A'] },
      { partyId: 'B', partyType: 'player', displayName: '乙', memberPlayerIds: ['B'] }
    ],
    config: rec.emptyConfig({
      instance: {
        catalogId: 'stroke-2',
        players: [
          { id: 'A', name: '甲', avatar: '/a.png' },
          { id: 'B', name: '乙', avatar: '/b.png' }
        ],
        pairings: [{ id: 'p1', leftId: 'A', rightId: 'B', on: true, strokes: 2 }],
        playerIds: ['A', 'B'],
        hcp: { A: 0, B: 1 }
      }
    }),
    visibility: 'public',
    hostContext: host,
    idempotencyKey: 'k_' + Math.random().toString(36).slice(2, 8)
  };
  Object.keys(patch || {}).forEach(function (k) {
    base[k] = patch[k];
  });
  return base;
}

identity.setImplementation({
  implementation: 'test',
  getCurrentUserId: function () {
    return 'me';
  }
});

var repo = localMod.createLocalSideGameRepository({
  storage: memStorage(),
  idGen: (function () {
    var n = 0;
    return function () {
      n += 1;
      return 'idg_' + n;
    };
  })(),
  clock: function () {
    return 9;
  }
});
facade.setImplementation(repo);

var gGroup = repo.create(createInput({ idempotencyKey: 'g1', title: '组内比杆' }));
var gMatch = repo.create(
  createInput({
    idempotencyKey: 'm1',
    title: '中间页比杆',
    scope: 'match',
    groupId: '',
    visibility: 'event'
  })
);
var gCombo = repo.create(
  createInput({
    idempotencyKey: 'c1',
    title: '组合',
    participantParties: [
      {
        partyId: 'combo-1',
        partyType: 'combination',
        displayName: '甲/丙',
        memberPlayerIds: ['A', 'C']
      },
      { partyId: 'B', partyType: 'player', displayName: '乙', memberPlayerIds: ['B'] }
    ],
    config: rec.emptyConfig({
      instance: {
        catalogId: 'stroke-2',
        parties: [
          {
            id: 'combo-1',
            partyType: 'combination',
            useSubjectName: true,
            members: [
              { playerId: 'A', displayName: '甲', avatar: '/a.png' },
              { playerId: 'C', displayName: '丙', avatar: '/c.png' }
            ]
          }
        ],
        players: [{ id: 'B', name: '乙' }]
      }
    })
  })
);
var gOther = repo.create(
  createInput({
    idempotencyKey: 'o1',
    title: '无关',
    participantParties: [
      { partyId: 'B', partyType: 'player', displayName: '乙', memberPlayerIds: ['B'] },
      { partyId: 'C', partyType: 'player', displayName: '丙', memberPlayerIds: ['C'] }
    ]
  })
);

var gFour = repo.create(
  createInput({
    matchId: 'm-22',
    idempotencyKey: 'f1',
    title: '最佳球位',
    participantParties: [
      {
        partyId: 'combo-ab',
        partyType: 'combination',
        displayName: '甲/乙',
        memberPlayerIds: ['A', 'B']
      },
      {
        partyId: 'combo-cd',
        partyType: 'combination',
        displayName: '丙/丁',
        memberPlayerIds: ['C', 'D']
      }
    ],
    config: rec.emptyConfig({
      instance: {
        catalogId: 'stroke-2',
        parties: [
          {
            id: 'combo-ab',
            partyType: 'combination',
            useSubjectName: true,
            members: [
              { playerId: 'A', displayName: '甲', avatar: '/a.png' },
              { playerId: 'B', displayName: '乙', avatar: '/b.png' }
            ]
          },
          {
            id: 'combo-cd',
            partyType: 'combination',
            useSubjectName: true,
            members: [
              { playerId: 'C', displayName: '丙', avatar: '/c.png' },
              { playerId: 'D', displayName: '丁', avatar: '/d.png' }
            ]
          }
        ]
      }
    })
  })
);

assert('种子', gGroup.ok && gMatch.ok && gCombo.ok && gOther.ok && gFour.ok);

var dup22 = sync.inspectGroupManageDiff('m-22', {
  replaced: [{ fromPlayerId: 'C', toPlayerId: 'B', to: { name: '乙' } }]
});
assert('2+2 最终重复 B 阻止保存', !dup22.ok && dup22.reason === 'identity_conflict');

var swap22 = sync.applyGroupManageDiff('m-22', {
  replaced: [
    { fromPlayerId: 'B', toPlayerId: 'C', to: { name: '丙', avatar: '/c.png' } },
    { fromPlayerId: 'C', toPlayerId: 'B', to: { name: '乙', avatar: '/b.png' } }
  ],
  removed: []
});
assert('2+2 A/B、C/D→A/C、B/D 可保存', swap22.ok, swap22.reason);
var afterFour = repo.getById(gFour.data.sideGameId).data;
assert(
  '2+2 组合与结果仍在且成员互换',
  afterFour.status !== 'deleted' &&
    afterFour.participantParties[0].memberPlayerIds.join(',') === 'A,C' &&
    afterFour.participantParties[1].memberPlayerIds.join(',') === 'B,D'
);
assert(
  '2+2 组合展示名用 /',
  afterFour.config.instance.parties[0].displayName === '甲/丙' &&
    afterFour.config.instance.parties[1].displayName === '乙/丁'
);

repo.refreshResult(gGroup.data.sideGameId, makeHost());
var before = repo.getById(gGroup.data.sideGameId).data;
var holeVals = JSON.stringify((before.resultSnapshot && before.resultSnapshot.byHole) || {});

var applied = sync.applyGroupManageDiff('m-id', {
  replaced: [
    {
      fromPlayerId: 'A',
      toPlayerId: 'D',
      to: { name: '丁', avatar: '/d.png' }
    }
  ],
  removed: []
});
assert('A→D 更正成功', applied.ok, applied.reason);
assert(
  '组与中间页实例都迁移且归属不变',
  applied.updatedSideGameIds.indexOf(gGroup.data.sideGameId) >= 0 &&
    applied.updatedSideGameIds.indexOf(gMatch.data.sideGameId) >= 0
);

var afterG = repo.getById(gGroup.data.sideGameId).data;
assert('scope/groupId 不变', afterG.scope === 'group' && afterG.groupId === 'g1');
assert('个人 partyId A→D', afterG.participantParties[0].partyId === 'D');
assert('无 A 残余 party', JSON.stringify(afterG.participantParties).indexOf('"A"') < 0);
assert(
  '实例 players/pairings/hcp 已改 D',
  afterG.config.instance.players[0].id === 'D' &&
    afterG.config.instance.pairings[0].leftId === 'D' &&
    afterG.config.instance.hcp.D === 0 &&
    afterG.config.instance.hcp.A == null
);
assert(
  '展示用丁的资料',
  afterG.config.instance.players[0].name === '丁' &&
    afterG.config.instance.players[0].avatar === '/d.png'
);
assert('实例未删除', afterG.status !== 'deleted');
var afterHole = JSON.stringify((afterG.resultSnapshot && afterG.resultSnapshot.byHole) || {});
assert('结果结构仍在（仅身份重写）', afterHole.indexOf('"A"') < 0 && afterHole.length > 2, afterHole.slice(0, 80));

var afterM = repo.getById(gMatch.data.sideGameId).data;
assert('中间页仍是 match scope', afterM.scope === 'match' && afterM.groupId === '');

var afterC = repo.getById(gCombo.data.sideGameId).data;
assert(
  '组合成员 A→D 且组合 party 保留',
  afterC.participantParties[0].partyId === 'combo-1' &&
    afterC.participantParties[0].memberPlayerIds.indexOf('D') >= 0 &&
    afterC.participantParties[0].memberPlayerIds.indexOf('A') < 0
);

var untouched = repo.getById(gOther.data.sideGameId).data;
assert('无关游戏未改', untouched.participantParties[0].partyId === 'B' && untouched.status !== 'deleted');

var blocked = sync.applyGroupManageDiff('m-id', {
  replaced: [{ fromPlayerId: 'B', toPlayerId: 'D', to: { name: '丁' } }],
  removed: []
});
assert('B 已在场时阻止覆盖', !blocked.ok && blocked.reason === 'identity_conflict');
var stillB = repo.getById(gOther.data.sideGameId).data;
assert('冲突时无关实例保持 B', stillB.participantParties[0].partyId === 'B');

var del = sync.applyGroupManageDiff('m-id', {
  replaced: [],
  removed: [{ fromPlayerId: 'C' }]
});
assert('纯删除 C 成功', del.ok);
assert(
  '含 C 的组合游戏删除',
  repo.getById(gCombo.data.sideGameId).ok === false ||
    (repo.getById(gCombo.data.sideGameId).data && repo.getById(gCombo.data.sideGameId).data.status === 'deleted')
);
var stillOther = repo.getById(gOther.data.sideGameId);
assert(
  '删除 C 后仍可能留下仅 B 的游戏或已删含 C 的无关？无关是 B+C 应删除',
  !stillOther.ok || (stillOther.data && stillOther.data.status === 'deleted')
);
var keepD = repo.getById(gGroup.data.sideGameId).data;
assert('删除 C 不影响已更正为 D 的游戏', keepD && keepD.status !== 'deleted' && keepD.participantParties[0].partyId === 'D');

var scoreJs = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram/subpackages/scoring/pages/score/index.js'),
  'utf8'
);
assert('记分页提交走身份同步', /_finishGroupManageIdentitySync/.test(scoreJs) && /_findGroupManageIdentityConflict/.test(scoreJs));
assert(
  '换人读取 fromPlayerId 成绩',
  /_readGameSingleSlotScores\((idx|fromIdx), ch\.fromPlayerId\)/.test(scoreJs)
);
assert('球队赛提交调用成绩归属迁移', /_rebindTeamMatchScoreOwner/.test(scoreJs));

var settleStroke = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram/subpackages/game/utils/settleStroke2.js'),
  'utf8'
);
assert('未改比杆结算文件长度锚点', settleStroke.indexOf('function settleStroke2') >= 0 || settleStroke.indexOf('STROKE2') >= 0);

console.log('\nsideGameIdentitySync.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
