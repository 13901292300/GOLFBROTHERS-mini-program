/**
 * 莱德杯同轮不可重复 / 跨轮可重复
 * 运行：node scripts/seriesRyderCupLineup.selftest.js
 */

var path = require('path');
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');
var lineup = require(path.join(utilsDir, 'seriesNoRepeatLineup.js'));
var seriesRyderCup = require(path.join(utilsDir, 'seriesRyderCup.js'));

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

var tournamentGroupDraft = require(path.join(utilsDir, 'tournamentGroupDraft.js'));
var seriesValidators = require(path.join(utilsDir, 'seriesValidators.js'));

var ryder = {
  seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
  scoringRule: seriesRyderCup.createRyderCupScoringRule()
};
var stroke = { scoringRule: { allowRepeat: false } };

assert('莱德杯 fromSeries 不激活跨轮规则', !lineup.isNoRepeatRuleActive(ryder, true));
assert('普通 Series fromSeries 激活跨轮规则', lineup.isNoRepeatRuleActive(stroke, true));
assert('非 fromSeries 不激活', !lineup.isNoRepeatRuleActive(stroke, false));

function sameRoundDup(groups) {
  var ids = lineup.collectPlayerIdsFromGroups(groups);
  var seen = Object.create(null);
  var dup = false;
  Object.keys(ids).forEach(function (id) {
    if (seen[id]) dup = true;
    seen[id] = true;
  });
  return dup;
}

var groupsDup = [
  { groupId: 'g1', players: [{ userId: 'p1', playerId: 'p1' }] },
  { groupId: 'g2', players: [{ userId: 'p1', playerId: 'p1' }] }
];
assert('同轮两组同一人 collect 到同一 id', (function () {
  var ids = lineup.collectPlayerIdsFromGroups(groupsDup);
  return !!ids.p1;
})());

assert('跨轮同一人：莱德杯规则不拦截', !lineup.isNoRepeatRuleActive(ryder, true));

var sameRoundDupErr = tournamentGroupDraft.validateGroupDraft(
  [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        { position: 1, userId: 'u1' },
        { position: 2, userId: 'u2' }
      ]
    },
    {
      groupId: 'g2',
      groupName: '第2组',
      players: [
        { position: 1, userId: 'u1' },
        { position: 2, userId: 'u3' }
      ]
    }
  ],
  {},
  {
    gameMode: '个人比洞赛',
    registerInfo: {
      users: [
        { userId: 'u1', matchTeamId: 't1', groupId: 't1' },
        { userId: 'u2', matchTeamId: 't2', groupId: 't2' },
        { userId: 'u3', matchTeamId: 't2', groupId: 't2' }
      ]
    },
    showCompositionMode: false,
    showPairingSection: false
  }
);
assert(
  '莱德杯同轮跨组重复仍拒绝',
  typeof sameRoundDupErr === 'string' && sameRoundDupErr.indexOf('重复') >= 0,
  String(sameRoundDupErr)
);

assert(
  '非莱德杯携带 ryder_match_play 被拒绝',
  !seriesValidators.validateDraftStructure({
    seriesId: 's1',
    lifecycleStatus: 'draft',
    scoringRule: { mode: 'ryder_match_play', allowRepeat: true, scoreBasis: 'gross', ruleVersion: 1 }
  }).ok
);
assert(
  '显式莱德杯使用 per_round_n 被拒绝',
  !seriesValidators.validateDraftStructure({
    seriesId: 's1',
    lifecycleStatus: 'draft',
    seriesCompetitionType: 'ryder_cup',
    scoringRule: { mode: 'per_round_n', allowRepeat: true, scoreBasis: 'gross', ruleVersion: 1, defaultTopN: 3 }
  }).ok
);
assert(
  '显式莱德杯 + ryder_match_play + 跨轮允许通过类型校验',
  seriesRyderCup.assertRyderCupTypeAndScoringMode({
    seriesCompetitionType: 'ryder_cup',
    scoringRule: seriesRyderCup.createRyderCupScoringRule()
  }).ok
);

if (failed) {
  console.log('\nFAILED ' + failed);
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
  process.exit(1);
}
console.log('\nAll ' + passed + ' passed');
