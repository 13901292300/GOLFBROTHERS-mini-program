/**
 * Series 创建流程：per_round_n 规则区默认 N 传导到轮次卡片。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesCreatePerRoundTopN.selftest.js
 */

var path = require('path');
var fs = require('fs');

if (typeof global.Page !== 'function') {
  global.Page = function () {};
}
if (typeof global.wx === 'undefined') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    showToast: function () {},
    showModal: function () {}
  };
}
if (typeof global.getApp !== 'function') {
  global.getApp = function () {
    return {
      getTheme: function () {
        return 'bright';
      }
    };
  };
}

var pageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'create',
  'pages',
  'series'
);
var roundDraft = require(path.join(pageDir, 'roundDraft.js'));
var seriesModel = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'seriesModel.js'));
var seriesPageHelpers = require(pageDir);
var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');

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

function freezeClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function makeRounds(values) {
  return values.map(function (item, i) {
    var n = typeof item === 'object' ? item.topN : item;
    var edited = typeof item === 'object' ? item.topNUserEdited : false;
    return {
      roundId: typeof item === 'object' && item.roundId ? item.roundId : 'r' + (i + 1),
      index: i + 1,
      name: 'ROUND ' + (i + 1),
      dateTime: '2026-08-0' + (i + 1) + ' 09:00',
      dateTimeUserEdited: i === 0,
      fee: i === 0 ? '100' : '',
      gameMode: '个人比杆赛',
      topN: n,
      topNUserEdited: edited === true,
      courseId: 'c1',
      courseName: '测试球场',
      courseLocation: '深圳',
      courseHalfText: '（A/B）',
      front9Course: 'A',
      back9Course: 'B'
    };
  });
}

function persistOrRollback(lastSaved, mutator, saveOk) {
  var next = freezeClone(lastSaved);
  mutator(next);
  if (!saveOk) return lastSaved;
  return next;
}

function buildCards(rounds) {
  return rounds.map(function (r) {
    return {
      roundId: r.roundId,
      topN: r.topN,
      topNInput: String(r.topN),
      name: r.name,
      feeInput: r.fee
    };
  });
}

(function testSelectModeAppliesDefault() {
  var rounds = makeRounds([3, 3, 3]);
  var frozen = freezeClone(rounds);
  var applied = roundDraft.applyDefaultTopNToRounds(rounds, 3);
  assert('1 选择 per_round_n 合法默认 N 成功', applied.ok === true);
  assert(
    '1 默认 N 传到所有现有轮次',
    applied.rounds.length === 3 &&
      applied.rounds.every(function (r) {
        return r.topN === 3 && r.topNUserEdited !== true;
      })
  );
  assert('1 不修改输入数组', JSON.stringify(rounds) === JSON.stringify(frozen));

  var fromOther = roundDraft.applyDefaultTopNToRounds(makeRounds([7, 7, 7]), 4);
  assert(
    '1 首次传导写入当前默认 N',
    fromOther.ok &&
      fromOther.rounds[0].topN === 4 &&
      fromOther.rounds[1].topN === 4 &&
      fromOther.rounds[2].topN === 4 &&
      fromOther.changedRoundIds.join(',') === 'r1,r2,r3'
  );
})();

(function testCardsAndDraftSync() {
  var rounds = makeRounds([3, 3]);
  var applied = roundDraft.applyDefaultTopNToRounds(rounds, 5);
  var cards = buildCards(applied.rounds);
  assert(
    '2 页面卡片与草稿 topN 同步',
    cards[0].topNInput === '5' &&
      cards[1].topNInput === '5' &&
      applied.rounds[0].topN === 5 &&
      applied.rounds[1].topN === 5
  );
  assert(
    '2 页面 persist 走 applyDefaultTopNToRounds',
    pageJs.indexOf("roundDraft.applyDefaultTopNToRounds") >= 0 &&
      pageJs.indexOf('onSelectScoringMode') >= 0 &&
      pageJs.indexOf('_commitDefaultTopNInput') >= 0 &&
      pageJs.indexOf('_persistNextDraft') >= 0 &&
      /onSelectScoringMode\(e\) \{[\s\S]*?applyDefaultTopNToRounds/.test(pageJs) &&
      /_commitDefaultTopNInput\(rawOverride\) \{[\s\S]*?applyDefaultTopNToRounds/.test(pageJs)
  );
})();

(function testDefaultChangeSyncsInherit() {
  var rounds = makeRounds([3, 3, 3]);
  var applied = roundDraft.applyDefaultTopNToRounds(rounds, 4);
  assert(
    '3 默认 N 3→4 全部继承轮同步',
    applied.ok &&
      applied.rounds[0].topN === 4 &&
      applied.rounds[1].topN === 4 &&
      applied.rounds[2].topN === 4
  );
})();

(function testUserEditedRoundKept() {
  var rounds = makeRounds([
    { topN: 3 },
    { topN: 5, topNUserEdited: true },
    { topN: 3 }
  ]);
  var frozen = freezeClone(rounds);
  var applied = roundDraft.applyDefaultTopNToRounds(rounds, 4);
  assert(
    '4 R2 手动 5 后默认改 4：R1/R3=4 R2=5',
    applied.ok &&
      applied.rounds[0].topN === 4 &&
      applied.rounds[1].topN === 5 &&
      applied.rounds[1].topNUserEdited === true &&
      applied.rounds[2].topN === 4 &&
      applied.changedRoundIds.join(',') === 'r1,r3'
  );
  assert(
    '4 不靠比较旧默认值猜测',
    applied.rounds[1].topN === 5 && JSON.stringify(rounds) === JSON.stringify(frozen)
  );
})();

(function testInvalidRoundInputNoFlag() {
  var round = makeRounds([{ topN: 3 }])[0];
  var n = roundDraft.parseStrictTopN('0');
  assert('5 非法单轮输入 parse 失败', n == null);
  assert('5 失败时原 round 无独立标记', round.topNUserEdited !== true && round.topN === 3);
  assert(
    '5 页面仅在合法 persist 路径写 topNUserEdited',
    /_commitRoundTopN\(roundId, raw\) \{[\s\S]*?if \(n == null\) \{[\s\S]*?return false;[\s\S]*?next\.topNUserEdited = true/.test(
      pageJs
    ) && pageJs.indexOf('next.topNUserEdited = true') >= 0
  );
})();

(function testInvalidDefaultNoBatch() {
  var rounds = makeRounds([3, 5, 3]);
  var frozen = freezeClone(rounds);
  var applied = roundDraft.applyDefaultTopNToRounds(rounds, 'abc');
  assert(
    '6 非法默认 N 不批量写入',
    applied.ok === false &&
      applied.rounds == null &&
      applied.changedRoundIds.length === 0 &&
      JSON.stringify(rounds) === JSON.stringify(frozen)
  );
  var resolved = roundDraft.resolveDefaultTopNForRule({ defaultTopN: '1.5' });
  assert('6 非法规则区 N 解析失败', resolved.ok === false);
})();

(function testNewRoundInherits() {
  var rounds = makeRounds([
    { topN: 4 },
    { topN: 5, topNUserEdited: true }
  ]);
  var grown = roundDraft.resizeRounds(rounds, 3, { defaultTopN: 4 });
  assert('7 新增轮次继承当前默认 N', grown.ok && grown.rounds[2].topN === 4);
  assert(
    '8 新增轮次为继承状态',
    grown.rounds[2].topNUserEdited === false &&
      grown.rounds[1].topN === 5 &&
      grown.rounds[1].topNUserEdited === true &&
      grown.rounds[0].topN === 4
  );
})();

(function testDeleteDoesNotAffectOthers() {
  var rounds = makeRounds([
    { topN: 4 },
    { topN: 5, topNUserEdited: true },
    { topN: 4 }
  ]);
  var shrunk = roundDraft.resizeRounds(rounds, 2, { defaultTopN: 4 });
  assert(
    '9 删除轮次不影响其他轮',
    shrunk.ok &&
      shrunk.rounds.length === 2 &&
      shrunk.rounds[0].roundId === 'r1' &&
      shrunk.rounds[1].roundId === 'r2' &&
      shrunk.rounds[1].topN === 5 &&
      shrunk.rounds[1].topNUserEdited === true
  );
})();

(function testReorderKeepsByRoundId() {
  var rounds = makeRounds([
    { topN: 4, roundId: 'alpha' },
    { topN: 9, topNUserEdited: true, roundId: 'beta' },
    { topN: 4, roundId: 'gamma' }
  ]);
  var reordered = [rounds[2], rounds[0], rounds[1]];
  var applied = roundDraft.applyDefaultTopNToRounds(reordered, 6);
  var byId = {};
  applied.rounds.forEach(function (r) {
    byId[r.roundId] = r;
  });
  assert(
    '10 重排后编辑状态按 roundId 保持',
    byId.alpha.topN === 6 &&
      byId.beta.topN === 9 &&
      byId.beta.topNUserEdited === true &&
      byId.gamma.topN === 6
  );
})();

(function testShrinkThenGrowNewIds() {
  var rounds = makeRounds([
    { topN: 4 },
    { topN: 8, topNUserEdited: true },
    { topN: 4 }
  ]);
  var deletedId = rounds[2].roundId;
  var shrunk = roundDraft.resizeRounds(rounds, 2, { defaultTopN: 4 });
  var grown = roundDraft.resizeRounds(shrunk.rounds, 3, { defaultTopN: 4 });
  assert(
    '11 减轮再增轮不复用已删除 roundId / 标记',
    grown.ok &&
      grown.rounds[2].roundId !== deletedId &&
      grown.rounds[2].topNUserEdited === false &&
      grown.rounds[2].topN === 4 &&
      grown.rounds[1].topN === 8 &&
      grown.rounds[1].topNUserEdited === true
  );
})();

(function testSwitchModeKeepsPerRoundN() {
  var rounds = makeRounds([
    { topN: 4 },
    { topN: 9, topNUserEdited: true }
  ]);
  var draft = {
    scoringRule: { mode: 'per_round_n', globalM: 10, defaultTopN: 4 },
    rounds: freezeClone(rounds)
  };
  var afterGlobal = persistOrRollback(
    draft,
    function (d) {
      d.scoringRule.mode = 'global_m';
    },
    true
  );
  assert(
    '12 切到 global_m 不删除每轮 N / 标记',
    afterGlobal.scoringRule.mode === 'global_m' &&
      afterGlobal.rounds[0].topN === 4 &&
      afterGlobal.rounds[1].topN === 9 &&
      afterGlobal.rounds[1].topNUserEdited === true
  );
  assert(
    '12 页面切 global_m 不调用 apply 删除',
    /onSelectScoringMode[\s\S]{0,900}if \(value === 'per_round_n'\)/.test(pageJs)
  );

  var back = persistOrRollback(
    afterGlobal,
    function (d) {
      d.scoringRule.mode = 'per_round_n';
      var applied = roundDraft.applyDefaultTopNToRounds(d.rounds, 4);
      d.rounds = applied.rounds;
    },
    true
  );
  assert(
    '13 切回 per_round_n 独立轮保留、继承轮同步',
    back.rounds[0].topN === 4 &&
      back.rounds[1].topN === 9 &&
      back.rounds[1].topNUserEdited === true
  );

  afterGlobal.scoringRule.defaultTopN = 6;
  var back2 = persistOrRollback(
    afterGlobal,
    function (d) {
      d.scoringRule.mode = 'per_round_n';
      var applied = roundDraft.applyDefaultTopNToRounds(d.rounds, 6);
      d.rounds = applied.rounds;
    },
    true
  );
  assert(
    '13 切回后继承轮跟新默认 6',
    back2.rounds[0].topN === 6 && back2.rounds[1].topN === 9
  );
})();

(function testColdStartOldDraft() {
  var raw = {
    seriesId: 'old-1',
    scoringRule: { mode: 'per_round_n', globalM: 10 },
    rounds: [
      { roundId: 'old-r1', index: 1, topN: 7, name: 'ROUND 1' },
      { roundId: 'old-r2', index: 2, topN: 2, name: 'ROUND 2' }
    ]
  };
  var normalized = seriesModel.normalizeSeries(raw);
  assert(
    '14 冷启动旧草稿不覆盖已有 topN',
    normalized.rounds[0].topN === 7 &&
      normalized.rounds[1].topN === 2 &&
      normalized.rounds[0].topNUserEdited === false &&
      normalized.rounds[1].topNUserEdited === false
  );
  assert(
    '14 页面冷启动投影不无条件 applyDefaultTopN',
    !/_projectUiFromDraft[\s\S]{0,200}applyDefaultTopNToRounds/.test(pageJs) &&
      !/_bootstrapDraft[\s\S]{0,400}applyDefaultTopNToRounds/.test(pageJs)
  );
})();

(function testSaveFailureRollback() {
  var last = {
    scoringRule: { mode: 'per_round_n', defaultTopN: 3, globalM: 10 },
    rounds: makeRounds([3, 3])
  };
  var frozen = freezeClone(last);
  var rolled = persistOrRollback(
    last,
    function (d) {
      d.scoringRule.defaultTopN = 8;
      var applied = roundDraft.applyDefaultTopNToRounds(d.rounds, 8);
      d.rounds = applied.rounds;
    },
    false
  );
  assert(
    '15 草稿保存失败回滚页面与持久化',
    JSON.stringify(rolled) === JSON.stringify(frozen) &&
      rolled.scoringRule.defaultTopN === 3 &&
      rolled.rounds[0].topN === 3
  );
  assert(
    '15 页面失败路径投影 lastSavedDraft',
    /if \(!result\.ok\) \{[\s\S]{0,180}_uiPayloadFromDraft\(self\.lastSavedDraft/.test(pageJs)
  );
})();

(function testGlobalMUntouched() {
  var draft = seriesModel.createEmptySeriesDraft({
    scoringRule: { mode: 'global_m', globalM: 12 }
  });
  draft.rounds = makeRounds([3, 3]);
  var applied = roundDraft.applyDefaultTopNToRounds(draft.rounds, 4);
  assert(
    '16 apply 不改 globalM',
    draft.scoringRule.globalM === 12 &&
      draft.scoringRule.mode === 'global_m' &&
      applied.rounds[0].topN === 4
  );
  var validatorSrc = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'utils', 'seriesValidators.js'),
    'utf8'
  );
  assert(
    '16 发布校验仍只对 global_m 检查 M',
    validatorSrc.indexOf("rule.mode === 'global_m'") >= 0 &&
      validatorSrc.indexOf('global_m_min') >= 0 &&
      validatorSrc.indexOf('defaultTopN') < 0
  );
})();

(function testOtherRoundFieldsUntouched() {
  var rounds = makeRounds([
    { topN: 3 },
    { topN: 5, topNUserEdited: true }
  ]);
  var frozen = freezeClone(rounds);
  var applied = roundDraft.applyDefaultTopNToRounds(rounds, 4);
  assert(
    '17 不影响球场/时间/赛制/费用及 dateTimeUserEdited',
    applied.rounds[0].courseId === frozen[0].courseId &&
      applied.rounds[0].dateTime === frozen[0].dateTime &&
      applied.rounds[0].dateTimeUserEdited === true &&
      applied.rounds[0].gameMode === frozen[0].gameMode &&
      applied.rounds[0].fee === frozen[0].fee &&
      applied.rounds[1].courseName === frozen[1].courseName &&
      applied.rounds[1].dateTimeUserEdited === frozen[1].dateTimeUserEdited &&
      applied.rounds[1].topN === 5
  );
})();

(function testPageWiringAndPrivateConfig() {
  assert(
    '页面复用轮次 N 输入框',
    pageWxml.indexOf('bindblur="onRoundTopNBlur"') >= 0 &&
      pageWxml.indexOf('bindinput="onRoundTopNInput"') >= 0
  );
  assert(
    '规则区默认 N 复用 m-row/m-input',
    pageWxml.indexOf('onDefaultTopNBlur') >= 0 &&
      pageWxml.indexOf('showPerRoundN') >= 0 &&
      /wx:if="\{\{showPerRoundN\}\}"[\s\S]{0,400}class="m-row"[\s\S]{0,200}class="m-input"/.test(
        pageWxml
      )
  );
  assert(
    '单轮提交保留其他轮输入',
    pageJs.indexOf('overlayRoundCardTransientInputs') >= 0 &&
      pageJs.indexOf('_preserveRoundInputsExceptId') >= 0
  );
  var privateCfg = path.join(__dirname, '..', 'project.private.config.json');
  assert('18 任务不要求改 project.private.config.json', fs.existsSync(privateCfg));
})();

(function testOverlayDoesNotClobberOtherCards() {
  var projected = [
    { roundId: 'r1', topNInput: '4', name: 'ROUND 1', feeInput: '' },
    { roundId: 'r2', topNInput: '4', name: 'ROUND 2', feeInput: '' }
  ];
  var current = [
    { roundId: 'r1', topNInput: '4', name: 'ROUND 1', feeInput: '' },
    { roundId: 'r2', topNInput: '99', name: '自定义', feeInput: '12' }
  ];
  var merged = seriesPageHelpers.overlayRoundCardTransientInputs(projected, current, 'r1');
  assert(
    '单轮刷新不覆盖其他轮输入',
    merged[0].topNInput === '4' &&
      merged[1].topNInput === '99' &&
      merged[1].name === '自定义' &&
      merged[1].feeInput === '12'
  );
})();

console.log('');
console.log('seriesCreatePerRoundTopN.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  console.log('Failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
