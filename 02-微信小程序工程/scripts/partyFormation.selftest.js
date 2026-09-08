/**
 * 记分页编队：组合 ≡ party；对决为 party vs party（不拆球员）。
 */
var partyFormation = require('../miniprogram/subpackages/game/utils/partyFormation.js');

var passed = 0;
var failed = 0;
function assert(name, cond) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name);
  }
}

function partiesOf(sizes, prefix) {
  var pfx = prefix || 'p';
  return sizes.map(function (n, i) {
    var ids = [];
    var j;
    for (j = 0; j < n; j++) ids.push(pfx + i + '_' + j);
    return { partyId: 'party-' + i, playerIds: ids, order: i };
  });
}

var capMatch = partyFormation.ruleCapability('match-2');
assert('match-2 matchupMode=party-matchup', capMatch.matchupMode === 'party-matchup');
assert('match-2 requiredPartyCount=2', capMatch.requiredPartyCount === 2);
assert(
  'three-vs-one exact-party-shape',
  partyFormation.ruleCapability('three-vs-one').matchupMode === 'exact-party-shape'
);

// --- 2+2 ---
var f22 = partyFormation.buildFormationContext(partiesOf([2, 2]));
assert('2+2 识别两方', f22.formation === '2+2' && f22.availablePartyCount === 2);
assert('2+2 各方保留2人', f22.parties[0].playerIds.length === 2 && f22.parties[1].playerIds.length === 2);
var r22m = partyFormation.resolveRuleCompatibility(f22, 'match-2');
assert('2+2 比洞可进入', r22m.compatible === true && r22m.visible);
assert('2+2 不报方数不足', r22m.disabledReason === '');
assert('2+2 locked', r22m.locked === true);

var m22 = partyFormation.buildPartyMatchups(f22.parties);
assert('2+2 只生成1个party对决', m22.length === 1);
assert(
  '2+2 对决是组合vs组合',
  m22[0].leftPartyId === 'party-0' && m22[0].rightPartyId === 'party-1'
);
assert(
  '2+2 不对决球员Id',
  m22[0].leftPartyId.indexOf('p0_') < 0 && String(m22[0].leftId) === 'party-0'
);
assert('2+2 无球员笛卡尔积', !partyFormation.buildCrossPartyPairings);

var ids22 = [];
partyFormation
  .resolveAvailableGameCatalog({ formation: f22.formation, parties: f22.parties })
  .visible.forEach(function (g) {
    (g.items || []).forEach(function (it) {
      ids22.push(it.id);
    });
  });
assert('2+2 可见 match-2', ids22.indexOf('match-2') >= 0);
assert('2+2 不含 landlord', ids22.indexOf('landlord-big') < 0);
assert(
  '2+2 不含 exact three-vs-one',
  !partyFormation.resolveRuleCompatibility(f22, 'three-vs-one').visible
);

// --- 1+1 ---
var f11 = partyFormation.buildFormationContext(partiesOf([1, 1]));
assert('1+1 可比洞', partyFormation.resolveRuleCompatibility(f11, 'match-2').compatible);
assert('1+1 一个party对决', partyFormation.buildPartyMatchups(f11.parties).length === 1);

var f1111 = partyFormation.buildFormationContext(partiesOf([1, 1, 1, 1]));
var r1111 = partyFormation.resolveRuleCompatibility(f1111, 'match-2');
assert('1+1+1+1 比洞可见', r1111.visible && r1111.compatible);
assert('1+1+1+1 默认四方都入选', r1111.defaultPartyIds.length === 4);
assert('1+1+1+1 候选对决 6', (r1111.matchups || []).length === 6);
assert('1+1+1+1 不锁死只能两人', r1111.locked === false);
assert(
  '1+1+1+1 可选三方',
  partyFormation.isSelectionCompatible(f1111.parties, ['party-0', 'party-1', 'party-2'], 'match-2')
);
assert(
  '1+1+1+1 一方不兼容',
  !partyFormation.isSelectionCompatible(f1111.parties, ['party-0'], 'match-2')
);
var r84214 = partyFormation.resolveRuleCompatibility(f1111, '8421-4');
assert('1+1+1+1 的 8421-4 仍按 4 方固定', r84214.compatible && r84214.locked === true);

// --- 3+1 ---
var f31 = partyFormation.buildFormationContext(partiesOf([3, 1]));
assert('3+1 两方', f31.formation === '3+1' && f31.availablePartyCount === 2);
assert('3+1 三人组合完整', f31.parties[0].playerIds.length === 3);
assert('3+1 一人组合完整', f31.parties[1].playerIds.length === 1);
assert('3+1 比洞兼容', partyFormation.resolveRuleCompatibility(f31, 'match-2').compatible);
assert('3+1 唯一party对决', partyFormation.buildPartyMatchups(f31.parties).length === 1);
assert(
  '3+1 three-vs-one 精确兼容',
  partyFormation.resolveRuleCompatibility(f31, 'three-vs-one').compatible
);

// --- 2+1+1 ---
var f211 = partyFormation.buildFormationContext(partiesOf([2, 1, 1]));
assert('2+1+1 三方', f211.formation === '2+1+1' && f211.availablePartyCount === 3);
assert(
  '三方玩法用全部三方',
  partyFormation.resolveRuleCompatibility(f211, 'landlord-big').locked &&
    partyFormation.resolveRuleCompatibility(f211, 'landlord-big').defaultPartyIds.length === 3
);
var r2112 = partyFormation.resolveRuleCompatibility(f211, 'match-2');
assert('两方1V1 三方可见且不锁死恰好2方', r2112.visible && !r2112.locked && r2112.compatible);
assert('1V1 默认三方都入选', r2112.defaultPartyIds.length === 3);
assert('1V1 三方生成 3 对决', (r2112.matchups || []).length === 3);
assert(
  '不拆分双人方',
  (r2112.compatiblePartySelections[0].parties || []).some(function (p) {
    return p.playerIds.length === 2;
  })
);
assert(
  '对决保存partyId',
  r2112.matchups[0].leftPartyId.indexOf('party-') === 0 &&
    r2112.matchups[0].rightPartyId.indexOf('party-') === 0
);

assert(
  '方数少于2才不足',
  partyFormation.resolveRuleCompatibility(partiesOf([2]), 'match-2').disabledReason ===
    'party_count'
);

console.log('\npartyFormation.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
