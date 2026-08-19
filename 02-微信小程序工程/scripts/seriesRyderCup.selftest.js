/**
 * Series 莱德杯第一批：创建约束 / 类型判别 / 赛制选项
 * 运行：node scripts/seriesRyderCup.selftest.js
 */

var path = require('path');
var fs = require('fs');
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');
var createDir = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'create', 'pages', 'series');
var seriesRyderCup = require(path.join(utilsDir, 'seriesRyderCup.js'));
var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var lineup = require(path.join(utilsDir, 'seriesNoRepeatLineup.js'));
var participantDraft = require(path.join(createDir, 'participantDraft.js'));
var basicInfoDraft = require(path.join(createDir, 'basicInfoDraft.js'));

var pageJs = fs.readFileSync(path.join(createDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(createDir, 'index.wxml'), 'utf8');

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

assert('缺失 seriesCompetitionType 不是莱德杯', !seriesRyderCup.isRyderCupSeries({ templateId: 'ryder' }));
assert(
  '显式 ryder_cup 才是莱德杯',
  seriesRyderCup.isRyderCupSeries({ seriesCompetitionType: 'ryder_cup' })
);
assert('normalize 默认空类型', seriesModel.normalizeSeries({}).seriesCompetitionType === '');

var modes = seriesRyderCup.listRyderCupGameModeNames();
assert('莱德杯含个人比洞赛', modes.indexOf('个人比洞赛') >= 0);
assert('莱德杯含四人四球比洞赛', modes.indexOf('四人四球比洞赛') >= 0);
assert('莱德杯含最佳球位比洞赛', modes.indexOf('最佳球位比洞赛') >= 0);
assert('莱德杯含四人两球比洞赛', modes.indexOf('四人两球比洞赛') >= 0);
assert('莱德杯不含个人比杆赛', modes.indexOf('个人比杆赛') < 0);
assert('STROKE_GAME_MODES 仍在创建页', pageJs.indexOf('var STROKE_GAME_MODES') >= 0);
assert('莱德杯选项走 listRyderCupGameModeOptions', pageJs.indexOf('listRyderCupGameModeOptions') >= 0);

assert(
  '两支不同球队通过',
  seriesRyderCup.assertExactlyTwoSides({
    participants: [
      { seriesParticipantId: 'team:a', sourceTeamId: 'a' },
      { seriesParticipantId: 'team:b', sourceTeamId: 'b' }
    ]
  }).ok
);
assert(
  '少于两队拒绝',
  !seriesRyderCup.assertExactlyTwoSides({
    participants: [{ seriesParticipantId: 'team:a', sourceTeamId: 'a' }]
  }).ok
);
assert(
  '三队拒绝',
  !seriesRyderCup.assertExactlyTwoSides({
    participants: [
      { seriesParticipantId: 'team:a', sourceTeamId: 'a' },
      { seriesParticipantId: 'team:b', sourceTeamId: 'b' },
      { seriesParticipantId: 'team:c', sourceTeamId: 'c' }
    ]
  }).ok
);

assert('ryder 是首波模板', participantDraft.isFirstWaveTemplate('organization', 'ryder'));
assert('计分步骤对莱德杯跳过', seriesRyderCup.shouldSkipScoringStep({ seriesCompetitionType: 'ryder_cup' }));
assert(
  '仅 templateId 不跳过计分步',
  !seriesRyderCup.shouldSkipScoringStep({ templateId: 'ryder' })
);
assert(
  '莱德杯 scoringStructureOk',
  basicInfoDraft.scoringStructureOk({
    seriesCompetitionType: 'ryder_cup',
    templateId: 'ryder',
    scoringRule: seriesRyderCup.createRyderCupScoringRule()
  })
);
assert(
  '仅 templateId 不被 scoringStructureOk 当作莱德杯',
  !basicInfoDraft.scoringStructureOk({ templateId: 'ryder' })
);
assert('创建页隐藏莱德杯计分步', pageWxml.indexOf('currentStep === 3 && !isRyderCup') >= 0);
assert('创建页不展示莱德杯添加分队', pageWxml.indexOf('wx:if="{{!isRyderCup}}"') >= 0);

var persistedRule = seriesRyderCup.createRyderCupScoringRule();
assert('莱德杯持久化 allowRepeat 为跨轮允许', persistedRule.allowRepeat === true);
assert('莱德杯计分 mode 为 ryder_match_play', persistedRule.mode === 'ryder_match_play');
var persistedSeries = seriesModel.normalizeSeries({
  seriesCompetitionType: 'ryder_cup',
  scoringRule: persistedRule
});
assert(
  'normalize 后仍为跨轮允许',
  persistedSeries.scoringRule.allowRepeat === true &&
    persistedSeries.seriesCompetitionType === 'ryder_cup'
);

var ryderSeries = {
  seriesCompetitionType: 'ryder_cup',
  scoringRule: persistedRule
};
assert('莱德杯不启用跨轮不可重复', !lineup.isNoRepeatRuleActive(ryderSeries, true));
assert(
  '普通 Series 仍启用跨轮不可重复',
  lineup.isNoRepeatRuleActive({ scoringRule: { allowRepeat: false } }, true)
);

assert('GAME_MODE 含 G5', !!seriesModel.GAME_MODE['个人比洞赛']);
assert('SCORING_MODE 含 ryder_match_play', !!seriesModel.SCORING_MODE.ryder_match_play);

var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var ryderDraft = seriesModel.createEmptySeriesDraft({
  hostMode: 'organization',
  templateId: 'ryder',
  seriesCompetitionType: 'ryder_cup',
  scoringRule: seriesRyderCup.createRyderCupScoringRule(),
  participants: [
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't1',
      seriesParticipantId: 'team:t1',
      nameSnapshot: '红',
      logoSnapshot: 'l1'
    }),
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't2',
      seriesParticipantId: 'team:t2',
      nameSnapshot: '蓝',
      logoSnapshot: 'l2'
    })
  ]
});
ryderDraft.createdBy = 'u1';
ryderDraft.publishToken = 'tok';
ryderDraft.organization = {
  organizationId: 'org1',
  organizationName: 'Org',
  organizationLogo: ''
};
ryderDraft.rounds[0].gameMode = '个人比洞赛';
ryderDraft.rounds[1].gameMode = '四人四球比洞赛';
var frozen = seriesStationMatch.freezeRoundPlan(
  ryderDraft,
  ryderDraft.rounds[0],
  'match-r1',
  { createdAt: 1 }
);
assert('发布计划含稳定 roundId', frozen.ok && frozen.roundId === ryderDraft.rounds[0].roundId);
assert('发布计划含稳定 matchId', frozen.ok && frozen.matchId === 'match-r1');
assert('分站是队际结构', frozen.ok && frozen.matchPayload.matchType === 'inter-team');
assert('分站赛制为 G5', frozen.ok && frozen.matchPayload.gameMode === '个人比洞赛');
assert('创建后分组为空', frozen.ok && Array.isArray(frozen.matchPayload.groups) && frozen.matchPayload.groups.length === 0);
assert('teamGroups[0] 为红方', frozen.ok && frozen.matchPayload.teamGroups[0].sourceTeamId === 't1');
assert('teamGroups[1] 为蓝方', frozen.ok && frozen.matchPayload.teamGroups[1].sourceTeamId === 't2');

assert(
  '仅 scoring mode 不能反推莱德杯',
  !seriesRyderCup.isRyderCupSeries({ scoringRule: { mode: 'ryder_match_play' } })
);
assert(
  '创建页运行态 isRyderCup 不按 templateId 反推',
  pageJs.indexOf('isRyderCupSeries(d) || seriesRyderCup.isRyderCupTemplateId') < 0
);

var seriesValidators = require(path.join(utilsDir, 'seriesValidators.js'));
assert(
  '非莱德杯携带 ryder_match_play 校验拒绝',
  seriesValidators
    .validateDraftStructure({
      seriesId: 's-non-ryder',
      lifecycleStatus: 'draft',
      scoringRule: { mode: 'ryder_match_play', allowRepeat: true, scoreBasis: 'gross' }
    })
    .errors.some(function (e) {
      return e.code === 'ryder_mode_requires_type';
    })
);
assert(
  '显式莱德杯使用其他 scoring mode 校验拒绝',
  seriesValidators
    .validateDraftStructure({
      seriesId: 's-ryder-bad-mode',
      lifecycleStatus: 'draft',
      seriesCompetitionType: 'ryder_cup',
      scoringRule: { mode: 'global_m', globalM: 8, allowRepeat: true, scoreBasis: 'gross' }
    })
    .errors.some(function (e) {
      return e.code === 'ryder_scoring_mode_mismatch';
    })
);
assert(
  '历史缺显式类型的 per_round_n 草稿仍可通过类型校验',
  seriesRyderCup.assertRyderCupTypeAndScoringMode({
    templateId: 'ryder',
    scoringRule: { mode: 'per_round_n', allowRepeat: false, scoreBasis: 'gross', defaultTopN: 3 }
  }).ok
);

function collectMainPackagePageRequires(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  var names = fs.readdirSync(dir);
  for (var i = 0; i < names.length; i++) {
    var full = path.join(dir, names[i]);
    var stat = fs.statSync(full);
    if (stat.isDirectory()) {
      collectMainPackagePageRequires(full, acc);
      continue;
    }
    if (!/\.js$/.test(names[i])) continue;
    var src = fs.readFileSync(full, 'utf8');
    var re = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    var m;
    while ((m = re.exec(src))) {
      if (/subpackages\/[^'"]*\/pages\//.test(m[1])) {
        acc.push(path.relative(path.join(__dirname, '..'), full) + ' -> ' + m[1]);
      }
    }
  }
  return acc;
}

var mainPkgRoot = path.join(__dirname, '..', 'miniprogram');
var reverseDeps = [];
collectMainPackagePageRequires(path.join(mainPkgRoot, 'utils'), reverseDeps);
collectMainPackagePageRequires(path.join(mainPkgRoot, 'pages'), reverseDeps);
collectMainPackagePageRequires(path.join(mainPkgRoot, 'components'), reverseDeps);
assert(
  '主包模块不 require 分包页面模块',
  reverseDeps.length === 0,
  reverseDeps.join('; ')
);
assert(
  '主包 utils 已移除 seriesRyderCupScoreboardAdapter',
  !fs.existsSync(path.join(utilsDir, 'seriesRyderCupScoreboardAdapter.js'))
);

if (failed) {
  console.log('\nFAILED ' + failed);
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
  process.exit(1);
}
console.log('\nAll ' + passed + ' passed');
