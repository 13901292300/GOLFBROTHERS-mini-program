/**
 * 单挂 8421-2：两名单人 = 两个参与方，与比杆/比洞同一 party 语义。
 * 运行：node scripts/game8421TwoParty.selftest.js
 */
var path = require('path');
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils');
var catalog = require(path.join(utilsDir, 'catalog.js'));
var rec = require(path.join(utilsDir, 'sideGameRecord.js'));
var hostMod = require(path.join(utilsDir, 'gameHostContext.js'));
var s8421 = require(path.join(utilsDir, 'settle8421.js'));
var playerScoreCfg = require(path.join(utilsDir, 'sideGame8421PlayerConfig.js'));
var core = require(path.join(utilsDir, 'settleCore.js'));
var fs = require('fs');

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

function partiesOf() {
  return Array.prototype.slice.call(arguments).map(function (id) {
    return {
      partyId: id,
      partyType: 'player',
      displayName: id,
      memberPlayerIds: [id]
    };
  });
}

function makeHost(ids) {
  var list = ids || ['A', 'B'];
  var holeOrder = ['A1', 'A2'];
  var official = {};
  list.forEach(function (id) {
    official[id] = { holes: { A1: { score: 4 }, A2: { score: 5 } } };
  });
  return hostMod.emptyContext({
    matchId: 'm-8421-2',
    groupId: 'g1',
    scope: 'group',
    revision: 'r1',
    holeContextReady: true,
    holeOrder: holeOrder,
    pars: { A1: 4, A2: 4 },
    allowBigPot: true,
    players: list.map(function (id) {
      return { playerId: id, groupId: 'g1' };
    }),
    scoreParties: list.map(function (id) {
      return {
        partyId: id,
        partyType: 'player',
        displayName: id,
        memberPlayerIds: [id],
        groupId: 'g1'
      };
    }),
    officialScoresByPartyId: official
  });
}

function createInput(ruleId, parties) {
  return {
    matchId: 'm-8421-2',
    groupId: 'g1',
    scope: 'group',
    ruleId: ruleId,
    ruleSnapshot: rec.buildRuleSnapshot(ruleId),
    title: ruleId,
    visibility: 'public',
    status: 'active',
    revision: 1,
    participantParties: parties,
    config: rec.emptyConfig({
      instance: {
        catalogId: ruleId,
        players: (parties || []).map(function (p) {
          return { id: p.partyId, scoreCode: '8421' };
        })
      }
    })
  };
}

assert(
  'Case catalog：快照 players=4 也不能把 8421-2 当成 4 人固定局',
  catalog.resolveInstancePlayerNeed('8421-2', { players: 4, catalogId: '8421-2' }, 4) === 2
);
assert('8421-2 是 all-pairs 1V1', catalog.isAllPairsOneVsOneCatalog('8421-2') === true);
assert('比杆也是 all-pairs 1V1', catalog.isAllPairsOneVsOneCatalog('stroke-2') === true);
assert('8421-3 不是 all-pairs', catalog.isAllPairsOneVsOneCatalog('8421-3') === false);
assert('8421-4 不是 all-pairs', catalog.isAllPairsOneVsOneCatalog('8421-4') === false);
assert('8421-3 人数仍为 3', catalog.resolveInstancePlayerNeed('8421-3', { players: 2 }, 2) === 3);
assert('8421-4 人数仍为 4', catalog.resolveInstancePlayerNeed('8421-4', { players: 2 }, 2) === 4);

var two = partiesOf('A', 'B');
assert('Case1 无 teamId 两名单人 → partyCount=2', two.length === 2 && two[0].memberPlayerIds.length === 1 && two[1].memberPlayerIds.length === 1);

var host2 = makeHost(['A', 'B']);
var ok2 = rec.validateCreateInput(createInput('8421-2', two), host2);
assert('Case1 validation PASS', ok2.ok, ok2.reason);
assert(
  'Case1 A/B 各为一方',
  ok2.ok &&
    ok2.record.participantParties.length === 2 &&
    ok2.record.participantParties[0].partyId === 'A' &&
    ok2.record.participantParties[1].partyId === 'B'
);

var fail1 = rec.validateCreateInput(createInput('8421-2', partiesOf('A')), makeHost(['A', 'B']));
assert('Case2 只有 1 人 FAIL', !fail1.ok && fail1.reason === 'party_count', fail1.reason);

var ok3 = rec.validateCreateInput(createInput('8421-2', partiesOf('A', 'B', 'C')), makeHost(['A', 'B', 'C']));
assert('Case3 3 人 8421-2 PASS', ok3.ok, ok3.reason);

var strokeOk = rec.validateCreateInput(createInput('stroke-2', partiesOf('A', 'B')), host2);
assert('Case4 2人比杆 PASS', strokeOk.ok, strokeOk.reason);

var matchOk = rec.validateCreateInput(createInput('match-2', partiesOf('A', 'B')), host2);
assert('Case5 2人比洞 PASS', matchOk.ok, matchOk.reason);

var game2 = {
  catalogId: '8421-2',
  players: [
    { id: 'A', scoreCode: '8421' },
    { id: 'B', scoreCode: '8421' }
  ],
  pairings: [{ id: 'A|B', leftId: 'A', rightId: 'B', on: true }],
  multiplier: 1,
  holes: [{ label: '1', on: true }],
  ruleSnapshot: {
    catalogId: '8421-2',
    deductMode: 'on',
    deductWay: 'plus-n',
    deductPlusN: 4,
    deductCap: 'none',
    deductCapN: 3,
    pushRule: 'tie'
  }
};
var hole = s8421.settle(game2, {
  scores: { '1': { A: 0, B: 1 } },
  holeOrder: ['1'],
  pars: { '1': 4 },
  windOn: false
}).byHole['1'];
assert('Case6 1V1 有结果', hole && hole.A != null && hole.B != null, JSON.stringify(hole));
assert(
  'Case6 零和',
  core.round1((Number(hole.A) || 0) + (Number(hole.B) || 0) + (Number(hole[core.POT_ID]) || 0)) === 0,
  JSON.stringify(hole)
);

var cap1 = { deductCap: 'cap', deductCapN: 1, deductMode: 'on', deductWay: 'plus-n', deductPlusN: 4 };
var aEff = playerScoreCfg.resolve8421PlayerScoreConfig(cap1, { id: 'A' });
var bEff = playerScoreCfg.resolve8421PlayerScoreConfig(cap1, {
  id: 'B',
  scoreOverrides: { deductCap: 'none', deductCapN: '3' }
});
var aSettle = s8421.deductCfg({ id: 'A' }, cap1);
var bSettle = s8421.deductCfg(
  { id: 'B', scoreOverrides: { deductCap: 'none', deductCapN: '3' } },
  cap1
);
assert('Case7 A 无 override → cap=1', aEff.deductCap === 'cap' && aEff.deductCapN === '1' && aSettle.deductCap === 'cap');
assert('Case7 B override none', bEff.deductCap === 'none' && bSettle.deductCap === 'none');

var configSrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'pages', 'config', 'index.js'),
  'utf8'
);
assert(
  '配置页用 catalog 人数，不再 snapshot.players 优先',
  configSrc.indexOf('catalog.resolveInstancePlayerNeed(catalogId, snapshot, needPlayers)') >= 0
);
assert(
  '配置页 1V1 all-pairs 不卡死恰好 2 人',
  configSrc.indexOf('catalog.isAllPairsOneVsOneCatalog(this.data.ruleId)') >= 0 &&
    configSrc.indexOf('requiresExactSelectedCount') < 0
);

console.log('---');
console.log('passed ' + passed + '  failed ' + failed);
if (failed) process.exit(1);
