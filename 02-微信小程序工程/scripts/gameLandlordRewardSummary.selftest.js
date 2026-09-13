/**
 * 地主族摘要：仅 reward === "mul" 显示「有奖励」，与 settle 一致。
 * 运行：node scripts/gameLandlordRewardSummary.selftest.js
 */
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var settleMid = require('../miniprogram/subpackages/game/utils/settleLandlordMid.js');
var settleBig = require('../miniprogram/subpackages/game/utils/settleLandlordBig.js');
var settleSmall = require('../miniprogram/subpackages/game/utils/settleLandlordSmall.js');

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

function leadReward(text) {
  return String(text || '').split(' · ')[0];
}

function snap(id, reward) {
  var out = { catalogId: id };
  if (arguments.length > 1) out.reward = reward;
  return out;
}

function hasReward(id, reward) {
  return leadReward(catalog.summarizeRule(snap(id, reward))) === '有奖励';
}

function noReward(id, extra) {
  var rule = Object.assign({ catalogId: id }, extra || {});
  return leadReward(catalog.summarizeRule(rule)) === '无奖励';
}

['landlord-mid', 'landlord-big', 'landlord-small'].forEach(function (id) {
  assert('CASE1 ' + id + ' mul → 有奖励', hasReward(id, 'mul'));
  assert('CASE2 ' + id + ' none → 无奖励', noReward(id, { reward: 'none' }));
  assert('CASE3 ' + id + ' missing → 无奖励', noReward(id, {}));
  assert('CASE4 ' + id + ' empty → 无奖励', noReward(id, { reward: '' }));
  assert('CASE5 ' + id + ' null → 无奖励', noReward(id, { reward: null }));
  assert('CASE6 ' + id + ' illegal → 无奖励', noReward(id, { reward: 'additive' }));
});

function gameOf(catalogId, reward) {
  var rule = { catalogId: catalogId };
  if (reward !== undefined) rule.reward = reward;
  return {
    catalogId: catalogId,
    players: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
    playerOrder: ['A', 'B', 'C'],
    groupMode: 'fixed',
    multiplier: 1,
    holes: [{ label: 'C1', on: true }],
    ruleSnapshot: rule
  };
}

var ctx = {
  holeOrder: ['C1'],
  pars: { C1: 4 },
  scores: { C1: { A: -1, B: 1, C: 1 } }
};

function holePts(mod, catalogId, reward) {
  return (mod.settle(gameOf(catalogId, reward), ctx).byHole.C1 || {});
}

var noneMid = holePts(settleMid, 'landlord-mid', 'none');
['undefined', '', null, 'additive'].forEach(function (raw) {
  var reward = raw === 'undefined' ? undefined : raw;
  var pts = holePts(settleMid, 'landlord-mid', reward);
  assert(
    'settle mid 非 mul 与 none 同 ×1 (' + String(raw) + ')',
    JSON.stringify(pts) === JSON.stringify(noneMid)
  );
});
var mulMid = holePts(settleMid, 'landlord-mid', 'mul');
assert('settle mid mul 与 none 不同', JSON.stringify(mulMid) !== JSON.stringify(noneMid));

assert(
  'settle big missing ≡ none',
  JSON.stringify(holePts(settleBig, 'landlord-big')) ===
    JSON.stringify(holePts(settleBig, 'landlord-big', 'none'))
);
assert(
  'settle small missing ≡ none',
  JSON.stringify(holePts(settleSmall, 'landlord-small')) ===
    JSON.stringify(holePts(settleSmall, 'landlord-small', 'none'))
);

assert(
  'listRewardText 仅 mul 为有奖励',
  require('fs')
    .readFileSync(
      require('path').join(__dirname, '..', 'miniprogram/subpackages/game/utils/catalog.js'),
      'utf8'
    )
    .indexOf('rule.reward === "mul" ? "有奖励" : "无奖励"') >= 0
);

console.log('\ngameLandlordRewardSummary.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
