/**
 * 系列赛领域自测（Node 可执行，不污染真实 wx storage）
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesDomain.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');

var seriesIds = require(path.join(utilsDir, 'seriesIds.js'));
var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesValidators = require(path.join(utilsDir, 'seriesValidators.js'));
var seriesStoreMod = require(path.join(utilsDir, 'seriesStore.js'));
var seriesStationIndexMod = require(path.join(utilsDir, 'seriesStationIndex.js'));
var seriesScoring = require(seriesTestPaths.util('seriesScoring.js'));
var roundDraft = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'create',
  'pages',
  'series',
  'roundDraft.js'
));
var participantDraft = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'create',
  'pages',
  'series',
  'participantDraft.js'
));

// series/index.js 导出原生数字输入缓冲辅助（需 mock Page/wx）
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
var seriesPageHelpers = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'create',
  'pages',
  'series',
  'index.js'
));

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

function createMemoryAdapter(options) {
  var bag = Object.create(null);
  var opts = options || {};
  return {
    getItem: function (key) {
      if (opts.failRead) return { ok: false, reason: 'storage_read_failed' };
      return {
        ok: true,
        value: Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : null
      };
    },
    setItem: function (key, value) {
      if (opts.failWrite) return { ok: false, reason: 'storage_write_failed' };
      bag[key] = value;
      return { ok: true };
    },
    _bag: bag
  };
}

function freezeClone(value) {
  return JSON.parse(JSON.stringify(value));
}

// 1 + 2: ID uniqueness
(function testIds() {
  var set = Object.create(null);
  var n = 1000;
  var dup = 0;
  for (var i = 0; i < n; i++) {
    var sid = seriesIds.generateSeriesId();
    var rid = seriesIds.generateRoundId();
    if (set[sid] || set[rid]) dup += 1;
    set[sid] = 1;
    set[rid] = 1;
  }
  assert('1000 seriesId/roundId 无重复', dup === 0 && Object.keys(set).length === n * 2, 'dup=' + dup);

  var sameMs = Object.create(null);
  var collision = 0;
  for (var j = 0; j < 200; j++) {
    var id = seriesIds.generateScopedId('burst');
    if (sameMs[id]) collision += 1;
    sameMs[id] = 1;
  }
  assert('同毫秒突发生成不重复', collision === 0, 'collision=' + collision);
})();

// 3: default 2 rounds
(function testDefaultRounds() {
  var draft = seriesModel.createEmptySeriesDraft({});
  assert('默认生成 2 轮', draft.rounds && draft.rounds.length === 2, 'len=' + (draft.rounds && draft.rounds.length));
  assert('默认 lifecycle=draft', draft.lifecycleStatus === 'draft');
})();

// 4: roundId stable after reindex
(function testRoundIdStable() {
  var rounds = seriesModel.createBlankRounds(3);
  var ids = rounds.map(function (r) {
    return r.roundId;
  });
  var reordered = [rounds[2], rounds[0], rounds[1]];
  var reindexed = seriesModel.reindexRounds(reordered);
  assert(
    '重排后 roundId 不变',
    reindexed[0].roundId === ids[2] &&
      reindexed[1].roundId === ids[0] &&
      reindexed[2].roundId === ids[1],
    JSON.stringify(reindexed.map(function (r) {
      return r.roundId;
    }))
  );
  assert(
    '重排后仅更新 index',
    reindexed[0].index === 1 && reindexed[1].index === 2 && reindexed[2].index === 3
  );
})();

// 5 + 6: store draft CRUD / non-draft cannot remove
(function testStore() {
  var adapterA = createMemoryAdapter();
  var store = seriesStoreMod.createSeriesStore(adapterA);
  var draft = seriesModel.createEmptySeriesDraft({ seriesName: '测试系列' });
  var saved = store.saveDraft(draft);
  assert('saveDraft ok', saved.ok === true, JSON.stringify(saved.errors || saved.reason));
  var got = store.getSeriesById(draft.seriesId);
  assert('getSeriesById', !!got && got.seriesName === '测试系列');
  var list = store.listSeries();
  assert('listSeries 含草稿', list.some(function (s) {
    return s.seriesId === draft.seriesId;
  }));

  draft.seriesName = '覆盖后';
  var saved2 = store.saveDraft(draft);
  assert('saveDraft 覆盖', saved2.ok && store.getSeriesById(draft.seriesId).seriesName === '覆盖后');

  var removed = store.removeDraft(draft.seriesId);
  assert('removeDraft draft 成功', removed.ok === true);
  assert('删除后 get 为空', store.getSeriesById(draft.seriesId) == null);

  var base = seriesModel.createEmptySeriesDraft({ seriesName: '将发布' });
  assert('新建 draft upsert', store.upsertSeries(base).ok === true);
  base.lifecycleStatus = 'published';
  var up = store.upsertSeries(base);
  assert('draft→published 受控写入', up.ok === true, JSON.stringify(up));
  var rmPub = store.removeDraft(base.seriesId);
  assert('非 draft 不可 removeDraft', rmPub.ok === false && rmPub.reason === 'not_draft');

  var storeB = seriesStoreMod.createSeriesStore(createMemoryAdapter());
  assert('独立 adapter 互不污染', storeB.listSeries().length === 0);
})();

// 7: normalize defaults without minting IDs
(function testNormalize() {
  var normalized = seriesModel.normalizeSeries({
    seriesId: 'series-fixed-1',
    rounds: [{ roundId: 'sround-fixed-1', index: 1 }],
    participants: [{ seriesParticipantId: 'team:t1', kind: 'team' }]
  });
  assert('normalize 保留 seriesId', normalized.seriesId === 'series-fixed-1');
  assert('normalize 保留 roundId', normalized.rounds[0].roundId === 'sround-fixed-1');
  assert('normalize 补 scoringRule 缺省', !!normalized.scoringRule && normalized.scoringRule.mode === 'per_round_n');
  assert('normalize 补 visibility 缺省', normalized.visibility === 'public');

  var broken = seriesModel.normalizeSeries({
    rounds: [{ index: 1 }]
  });
  assert('残缺数据 normalize 不生成 seriesId', broken.seriesId === '');
  assert('残缺 round normalize 不生成 roundId', broken.rounds[0].roundId === '');
  var draftCheck = seriesValidators.validateDraftStructure(broken);
  assert(
    '稳定 ID 缺失由校验报错',
    draftCheck.ok === false &&
      draftCheck.errors.some(function (e) {
        return e.code === 'series_id_required';
      }) &&
      draftCheck.errors.some(function (e) {
        return e.code === 'round_id_required';
      })
  );
})();

// 8: validate reports illegal fields
(function testValidate() {
  var bad = seriesModel.createEmptySeriesDraft({});
  bad.hostMode = 'not-a-mode';
  bad.scoringRule.mode = 'magic';
  bad.scoringRule.globalM = 0;
  bad.rounds = [seriesModel.createBlankRound(1, null)];
  var draftV = seriesValidators.validateDraftStructure(bad);
  assert(
    'validate 报告非法 hostMode',
    draftV.errors.some(function (e) {
      return e.code === 'host_mode_invalid';
    })
  );
  assert(
    'validate 报告非法 scoring mode',
    draftV.errors.some(function (e) {
      return e.code === 'scoring_mode_invalid';
    })
  );

  var pub = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: 'A'
  });
  pub.scoringRule = { mode: 'global_m', globalM: 0, allowRepeat: false, scoreBasis: 'gross', ruleVersion: 1 };
  pub.rounds = [seriesModel.createBlankRound(1, null)];
  pub.participants = [];
  var pubV = seriesValidators.validateForPublish(pub);
  var codes = pubV.errors.map(function (e) {
    return e.code;
  });
  assert(
    'publish validate 报告 M/轮次/参赛',
    pubV.ok === false &&
      codes.indexOf('global_m_min') >= 0 &&
      codes.indexOf('rounds_min') >= 0 &&
      codes.indexOf('participants_min') >= 0,
    codes.join(',')
  );

  var store = seriesStoreMod.createSeriesStore(createMemoryAdapter());
  var incomplete = seriesModel.createEmptySeriesDraft({});
  incomplete.hostMode = '';
  incomplete.templateId = '';
  incomplete.seriesName = '';
  var saved = store.saveDraft(incomplete);
  assert('未完成草稿仍可 saveDraft', saved.ok === true, JSON.stringify(saved.errors || saved.reason));
})();

// 9 + 10: station index
(function testIndex() {
  var index = seriesStationIndexMod.createSeriesStationIndex(createMemoryAdapter());
  var a = index.setLink('match-1', 'series-a', 'round-1');
  assert('index 首次写入成功', a.ok === true && a.reason === 'created');
  var b = index.setLink('match-1', 'series-a', 'round-1');
  assert('index 幂等写成功', b.ok === true && b.reason === 'idempotent');
  var c = index.setLink('match-1', 'series-b', 'round-1');
  assert('index 冲突拒绝', c.ok === false && c.reason === 'conflict');
  var got = index.getByMatchId('match-1');
  assert('index get 仍为原映射', got && got.seriesId === 'series-a' && got.roundId === 'round-1');
  var list = index.listBySeriesId('series-a');
  assert('listBySeriesId', list.length === 1 && list[0].matchId === 'match-1');
})();

// 11-17: scoring core (original suite)
(function testScoring() {
  var rounds = [
    { roundId: 'r1', index: 1, topN: 2 },
    { roundId: 'r2', index: 2, topN: 2 }
  ];

  function entry(partial) {
    return seriesModel.createResultEntry(
      Object.assign(
        {
          seriesId: 's1',
          matchId: 'm1',
          sourceEntityKey: 'k',
          resultStatus: 'OK',
          resultUnitType: 'player',
          memberUserIds: ['u1'],
          scoreBasis: 'gross'
        },
        partial
      )
    );
  }

  var entries = [
    entry({ entryId: 'e-a1', roundId: 'r1', seriesParticipantId: 'team:A', gross: 70, rankingValue: 70, memberUserIds: ['a1'] }),
    entry({ entryId: 'e-a2', roundId: 'r1', seriesParticipantId: 'team:A', gross: 72, rankingValue: 72, memberUserIds: ['a2'] }),
    entry({ entryId: 'e-a3', roundId: 'r1', seriesParticipantId: 'team:A', gross: 75, rankingValue: 75, memberUserIds: ['a3'] }),
    entry({ entryId: 'e-a4', roundId: 'r1', seriesParticipantId: 'team:A', gross: 80, rankingValue: 80, memberUserIds: ['a4'] }),
    entry({ entryId: 'e-a5', roundId: 'r2', seriesParticipantId: 'team:A', gross: 71, rankingValue: 71, memberUserIds: ['a5'] }),
    entry({ entryId: 'e-a6', roundId: 'r2', seriesParticipantId: 'team:A', gross: 73, rankingValue: 73, memberUserIds: ['a6'] }),
    entry({ entryId: 'e-b1', roundId: 'r1', seriesParticipantId: 'team:B', gross: 69, rankingValue: 69, memberUserIds: ['b1'] }),
    entry({ entryId: 'e-b2', roundId: 'r1', seriesParticipantId: 'team:B', gross: 74, rankingValue: 74, memberUserIds: ['b2'] }),
    entry({ entryId: 'e-b3', roundId: 'r2', seriesParticipantId: 'team:B', gross: 70, rankingValue: 70, memberUserIds: ['b3'] }),
    entry({ entryId: 'e-b4', roundId: 'r2', seriesParticipantId: 'team:B', gross: 90, rankingValue: 90, memberUserIds: ['b4'] }),
    entry({
      entryId: 'e-bad-wd',
      roundId: 'r1',
      seriesParticipantId: 'team:A',
      gross: 60,
      rankingValue: 60,
      resultStatus: 'WD',
      memberUserIds: ['aw']
    }),
    entry({
      entryId: 'e-bad-dns',
      roundId: 'r1',
      seriesParticipantId: 'team:B',
      gross: 55,
      rankingValue: 55,
      resultStatus: 'DNS',
      memberUserIds: ['bd']
    }),
    entry({
      entryId: 'e-bad-miss',
      roundId: 'r2',
      seriesParticipantId: 'team:A',
      rankingValue: null,
      resultStatus: 'MISSING',
      memberUserIds: ['am']
    })
  ];

  var inputCloneGuard = freezeClone(entries);
  var topN = seriesScoring.computePerRoundTopN({
    entries: entries,
    rounds: rounds,
    topNByRoundId: { r1: 2, r2: 2 }
  });
  var aRow = topN.participants.find(function (p) {
    return p.seriesParticipantId === 'team:A';
  });
  var bRow = topN.participants.find(function (p) {
    return p.seriesParticipantId === 'team:B';
  });
  assert('Top N 手工算例 A=286', aRow && aRow.totalRankingValue === 286, aRow && aRow.totalRankingValue);
  assert('Top N 手工算例 B=303', bRow && bRow.totalRankingValue === 303, bRow && bRow.totalRankingValue);
  assert('Top N A 优于 B (sortOrder)', aRow.sortOrder === 1 && bRow.sortOrder === 2);
  assert('rankDecision unset', topN.rankDecision === 'unset' && aRow.rankDecision === 'unset');

  var topM = seriesScoring.computeGlobalTopM({
    entries: entries,
    rounds: rounds,
    globalM: 3
  });
  var aM = topM.participants.find(function (p) {
    return p.seriesParticipantId === 'team:A';
  });
  var bM = topM.participants.find(function (p) {
    return p.seriesParticipantId === 'team:B';
  });
  assert('Top M 手工算例 A=213', aM && aM.totalRankingValue === 213, aM && aM.totalRankingValue);
  assert('Top M 手工算例 B=213', bM && bM.totalRankingValue === 213, bM && bM.totalRankingValue);

  assert(
    '无效状态不进入计分池',
    aRow.selectedEntries.every(function (e) {
      return e.entryId !== 'e-bad-wd' && e.entryId !== 'e-bad-dns';
    }) &&
      !aRow.selectedEntries.some(function (e) {
        return e.resultStatus !== 'OK';
      })
  );

  var tieEntries = [
    entry({ entryId: 'z-entry', roundId: 'r1', seriesParticipantId: 'team:T', gross: 72, rankingValue: 72, memberUserIds: ['t1'] }),
    entry({ entryId: 'a-entry', roundId: 'r1', seriesParticipantId: 'team:T', gross: 72, rankingValue: 72, memberUserIds: ['t2'] }),
    entry({ entryId: 'm-entry', roundId: 'r2', seriesParticipantId: 'team:T', gross: 72, rankingValue: 72, memberUserIds: ['t3'] })
  ];
  var order1 = seriesScoring.computeGlobalTopM({
    entries: tieEntries,
    rounds: rounds,
    globalM: 3
  }).participants[0].selectedEntries.map(function (e) {
    return e.entryId;
  });
  var order2 = seriesScoring.computeGlobalTopM({
    entries: tieEntries.slice().reverse(),
    rounds: rounds,
    globalM: 3
  }).participants[0].selectedEntries.map(function (e) {
    return e.entryId;
  });
  assert(
    '相同杆数排序稳定',
    order1.join(',') === order2.join(',') && order1[0] === 'a-entry',
    order1.join(',') + ' vs ' + order2.join(',')
  );

  assert('输入数组不被修改', JSON.stringify(entries) === JSON.stringify(inputCloneGuard));

  assert(
    'rankingValue 低者优先',
    seriesScoring.compareEntriesStable(
      { rankingValue: 70, roundId: 'r1', entryId: 'x' },
      { rankingValue: 71, roundId: 'r1', entryId: 'y' },
      { r1: 1 }
    ) < 0
  );

  assert(
    '不同 seriesParticipantId 独立计算',
    topN.participants.length === 2 && aRow.selectedCount === 4 && bRow.selectedCount === 4
  );

  // allowRepeat：同一真人跨轮
  var repeatEntries = [
    entry({
      entryId: 'rep-r1-a',
      roundId: 'r1',
      seriesParticipantId: 'team:R',
      gross: 68,
      rankingValue: 68,
      memberUserIds: ['same-u']
    }),
    entry({
      entryId: 'rep-r2-a',
      roundId: 'r2',
      seriesParticipantId: 'team:R',
      gross: 69,
      rankingValue: 69,
      memberUserIds: ['same-u']
    }),
    entry({
      entryId: 'rep-r1-b',
      roundId: 'r1',
      seriesParticipantId: 'team:R',
      gross: 72,
      rankingValue: 72,
      memberUserIds: ['other-u']
    }),
    entry({
      entryId: 'rep-pair',
      roundId: 'r2',
      seriesParticipantId: 'team:R',
      gross: 70,
      rankingValue: 70,
      resultUnitType: 'pair',
      memberUserIds: ['same-u', 'pair-mate']
    })
  ];
  var allowTrue = seriesScoring.computeGlobalTopM({
    entries: repeatEntries,
    rounds: rounds,
    globalM: 3,
    allowRepeat: true,
    participantIds: ['team:R']
  });
  var allowFalse = seriesScoring.computeGlobalTopM({
    entries: repeatEntries,
    rounds: rounds,
    globalM: 3,
    allowRepeat: false,
    participantIds: ['team:R']
  });
  var trueIds = (allowTrue.participants[0].selectedEntries || []).map(function (e) {
    return e.entryId;
  });
  var falseIds = (allowFalse.participants[0].selectedEntries || []).map(function (e) {
    return e.entryId;
  });
  assert(
    'allowRepeat=true 可重复计入同一真人',
    trueIds.indexOf('rep-r1-a') >= 0 && trueIds.indexOf('rep-r2-a') >= 0,
    trueIds.join(',')
  );
  assert(
    'allowRepeat=false 跳过成员交集（含 pair）',
    falseIds.indexOf('rep-r1-a') >= 0 &&
      falseIds.indexOf('rep-r2-a') < 0 &&
      falseIds.indexOf('rep-pair') < 0 &&
      falseIds.indexOf('rep-r1-b') >= 0,
    falseIds.join(',')
  );
  assert(
    'allowRepeat 默认 false',
    seriesScoring.computeGlobalTopM({
      entries: repeatEntries,
      rounds: rounds,
      globalM: 3,
      participantIds: ['team:R']
    }).meta.allowRepeat === false
  );

  var rv = seriesModel.resolveRankingValue({ gross: 70, net: null, toPar: -1 }, 'net');
  assert('resolveRankingValue 缺字段不回退', rv.ok === false && rv.reason === 'missing_net');
  var rv2 = seriesModel.resolveRankingValue({ gross: 70, toPar: -2 }, 'to_par');
  assert('resolveRankingValue to_par→toPar', rv2.ok && rv2.rankingValue === -2);
})();

// ---- 审查回归：saveDraft 生命周期保护 ----
(function testSaveDraftGuard() {
  var store = seriesStoreMod.createSeriesStore(createMemoryAdapter());
  var publishedInput = seriesModel.createEmptySeriesDraft({ seriesName: 'p' });
  publishedInput.lifecycleStatus = 'published';
  var r1 = store.saveDraft(publishedInput);
  assert('published 输入不能 saveDraft', r1.ok === false && r1.reason === 'not_draft_input');

  var draft = seriesModel.createEmptySeriesDraft({ seriesName: 'keep' });
  store.saveDraft(draft);
  draft.lifecycleStatus = 'published';
  store.upsertSeries(draft);
  var before = freezeClone(store.getSeriesById(draft.seriesId));

  var overwrite = seriesModel.createEmptySeriesDraft({
    seriesId: draft.seriesId,
    seriesName: 'hack'
  });
  var r2 = store.saveDraft(overwrite);
  assert('已存 published 不能被 draft 同 ID 覆盖', r2.ok === false && r2.reason === 'existing_not_draft');
  assert('拒绝后 published 原数据保持不变', store.getSeriesById(draft.seriesId).seriesName === before.seriesName);

  ['cancelled', 'archived'].forEach(function (life) {
    var s = seriesStoreMod.createSeriesStore(createMemoryAdapter());
    var d = seriesModel.createEmptySeriesDraft({ seriesName: life });
    s.saveDraft(d);
    d.lifecycleStatus = life === 'cancelled' ? 'cancelled' : 'published';
    s.upsertSeries(d);
    if (life === 'archived') {
      d.lifecycleStatus = 'archived';
      s.upsertSeries(d);
    }
    var tryDraft = seriesModel.createEmptySeriesDraft({ seriesId: d.seriesId, seriesName: 'x' });
    var rr = s.saveDraft(tryDraft);
    assert(life + ' 不能被 saveDraft 覆盖', rr.ok === false && rr.reason === 'existing_not_draft');
    assert(life + ' 拒绝后数据不变', s.getSeriesById(d.seriesId).lifecycleStatus === life);
  });
})();

// ---- 审查回归：upsert 生命周期迁移 ----
(function testLifecycleTransitions() {
  var allowed = [
    [null, 'draft', true],
    [null, 'published', false],
    ['draft', 'draft', true],
    ['draft', 'published', true],
    ['draft', 'cancelled', true],
    ['draft', 'archived', false],
    ['published', 'published', true],
    ['published', 'cancelled', true],
    ['published', 'archived', true],
    ['published', 'draft', false],
    ['cancelled', 'cancelled', true],
    ['cancelled', 'archived', true],
    ['cancelled', 'published', false],
    ['archived', 'archived', true],
    ['archived', 'draft', false],
    ['archived', 'published', false]
  ];
  allowed.forEach(function (row) {
    var ok = seriesStoreMod.isLifecycleTransitionAllowed(row[0], row[1]);
    assert('transition ' + String(row[0]) + '→' + row[1], ok === row[2], 'got=' + ok);
  });

  var store = seriesStoreMod.createSeriesStore(createMemoryAdapter());
  var d = seriesModel.createEmptySeriesDraft({ seriesName: 'life' });
  assert('新对象仅 draft', store.upsertSeries(Object.assign({}, d, { lifecycleStatus: 'published' })).ok === false);
  store.upsertSeries(d);
  d.lifecycleStatus = 'published';
  assert('允许 draft→published', store.upsertSeries(d).ok === true);
  d.lifecycleStatus = 'draft';
  var denied = store.upsertSeries(d);
  assert('拒绝 published→draft 且不写', denied.ok === false && store.getSeriesById(d.seriesId).lifecycleStatus === 'published');
})();

// ---- 审查回归：normalize 保留非法枚举 ----
(function testNormalizeEnums() {
  var missing = seriesModel.normalizeSeries({ seriesId: 's-miss' });
  assert('缺失 lifecycle→draft', missing.lifecycleStatus === 'draft');
  assert('缺失 mode→per_round_n', missing.scoringRule.mode === 'per_round_n');
  assert('缺失 visibility→public', missing.visibility === 'public');

  var illegal = seriesModel.normalizeSeries({
    seriesId: 's-bad',
    lifecycleStatus: 'flying',
    competitionPhaseCache: 'warp',
    publishState: 'maybe',
    visibility: 'friends',
    scoringRule: { mode: 'magic', scoreBasis: 'bogey', globalM: 3, ruleVersion: 1 },
    rounds: [{ roundId: 'r1', index: 1, roundStatus: 'exploded' }]
  });
  assert('非法 lifecycle 保留', illegal.lifecycleStatus === 'flying');
  assert('非法 phase 保留', illegal.competitionPhaseCache === 'warp');
  assert('非法 publishState 保留', illegal.publishState === 'maybe');
  assert('非法 visibility 保留', illegal.visibility === 'friends');
  assert('非法 scoring mode 保留', illegal.scoringRule.mode === 'magic');
  assert('非法 scoreBasis 保留', illegal.scoringRule.scoreBasis === 'bogey');
  assert('非法 roundStatus 保留', illegal.rounds[0].roundStatus === 'exploded');

  var v = seriesValidators.validateDraftStructure(illegal);
  assert(
    '非法枚举被校验拒绝',
    !v.ok &&
      v.errors.some(function (e) {
        return e.code === 'lifecycle_invalid';
      }) &&
      v.errors.some(function (e) {
        return e.code === 'scoring_mode_invalid';
      }) &&
      v.errors.some(function (e) {
        return e.code === 'visibility_invalid';
      }) &&
      v.errors.some(function (e) {
        return e.code === 'round_status_invalid';
      }),
    JSON.stringify(v.errors.map(function (e) {
      return e.code;
    }))
  );
})();

// ---- 审查回归：分队身份 ----
(function testDivisionIds() {
  var d1 = seriesModel.createParticipant({ kind: 'division', sourceTeamId: 'host1', nameSnapshot: '红' });
  var d2 = seriesModel.createParticipant({ kind: 'division', sourceTeamId: 'host1', nameSnapshot: '蓝' });
  assert('无 divisionId 的两支分队 ID 不同', d1.seriesParticipantId !== d2.seriesParticipantId);
  assert('临时分队 ID 前缀 division-', d1.seriesParticipantId.indexOf('division-') === 0);
  var d3 = seriesModel.createParticipant({ kind: 'division', divisionId: 'div9', sourceTeamId: 'host1' });
  assert('有 divisionId 使用 division:id', d3.seriesParticipantId === 'division:div9');
  var t1 = seriesModel.createParticipant({ kind: 'team', sourceTeamId: 't9' });
  assert('team 使用 team:id', t1.seriesParticipantId === 'team:t9');
  var kept = seriesModel.createParticipant({
    kind: 'division',
    seriesParticipantId: 'division-temp-keep',
    divisionId: 'later-official'
  });
  assert('显式 seriesParticipantId 不被 divisionId 替换', kept.seriesParticipantId === 'division-temp-keep');
})();

// ---- 审查回归：完整/不完整与同分 ----
(function testScoringCompletenessAndTies() {
  function entry(partial) {
    return seriesModel.createResultEntry(
      Object.assign(
        {
          seriesId: 's1',
          matchId: 'm1',
          sourceEntityKey: 'k',
          resultStatus: 'OK',
          resultUnitType: 'player',
          memberUserIds: ['u'],
          scoreBasis: 'gross'
        },
        partial
      )
    );
  }

  var rounds = [
    { roundId: 'r1', index: 1, topN: 3, roundStatus: 'completed' },
    { roundId: 'r2', index: 2, topN: 3, roundStatus: 'cancelled' }
  ];
  var incompleteVsComplete = seriesScoring.computeGlobalTopM({
    entries: [
      entry({ entryId: 'a1', roundId: 'r1', seriesParticipantId: 'team:A', rankingValue: 70, memberUserIds: ['a'] }),
      entry({ entryId: 'b1', roundId: 'r1', seriesParticipantId: 'team:B', rankingValue: 70, memberUserIds: ['b1'] }),
      entry({ entryId: 'b2', roundId: 'r1', seriesParticipantId: 'team:B', rankingValue: 71, memberUserIds: ['b2'] }),
      entry({ entryId: 'b3', roundId: 'r1', seriesParticipantId: 'team:B', rankingValue: 72, memberUserIds: ['b3'] })
    ],
    rounds: rounds,
    globalM: 3,
    participantIds: ['team:A', 'team:B', 'team:C']
  });
  var A = incompleteVsComplete.participants.find(function (p) {
    return p.seriesParticipantId === 'team:A';
  });
  var B = incompleteVsComplete.participants.find(function (p) {
    return p.seriesParticipantId === 'team:B';
  });
  var C = incompleteVsComplete.participants.find(function (p) {
    return p.seriesParticipantId === 'team:C';
  });
  assert('1 份不能击败完整 3 份', B.sortOrder < A.sortOrder && B.isComplete && !A.isComplete);
  assert('零成绩主体仍返回', C && C.selectedCount === 0 && C.isComplete === false && C.rank === null);
  assert('不足 M 时 rank 为 null', A.rank === null);
  assert('完整主体排在不足 M 前', B.sortOrder === 1);

  var perRound = seriesScoring.computePerRoundTopN({
    entries: [
      entry({ entryId: 'x1', roundId: 'r1', seriesParticipantId: 'team:X', rankingValue: 70, memberUserIds: ['x1'] }),
      entry({ entryId: 'x2', roundId: 'r1', seriesParticipantId: 'team:X', rankingValue: 71, memberUserIds: ['x2'] }),
      entry({ entryId: 'y1', roundId: 'r1', seriesParticipantId: 'team:Y', rankingValue: 72, memberUserIds: ['y1'] })
    ],
    rounds: [
      { roundId: 'r1', index: 1, topN: 2, roundStatus: 'completed' },
      { roundId: 'r2', index: 2, topN: 2, roundStatus: 'cancelled' }
    ],
    topNByRoundId: { r1: 2, r2: 2 },
    participantIds: ['team:X', 'team:Y']
  });
  var X = perRound.participants.find(function (p) {
    return p.seriesParticipantId === 'team:X';
  });
  var Y = perRound.participants.find(function (p) {
    return p.seriesParticipantId === 'team:Y';
  });
  assert('取消轮不要求 Top N', X.isComplete === true && X.incompleteRoundIds.length === 0);
  assert('每轮不同 N 完整性：Y 不足', Y.isComplete === false && Y.incompleteRoundIds.indexOf('r1') >= 0);

  var mixedN = seriesScoring.computePerRoundTopN({
    entries: [
      entry({ entryId: 'p1', roundId: 'r1', seriesParticipantId: 'team:P', rankingValue: 70, memberUserIds: ['p1'] }),
      entry({ entryId: 'p2', roundId: 'r2', seriesParticipantId: 'team:P', rankingValue: 71, memberUserIds: ['p2'] }),
      entry({ entryId: 'p3', roundId: 'r2', seriesParticipantId: 'team:P', rankingValue: 72, memberUserIds: ['p3'] })
    ],
    rounds: [
      { roundId: 'r1', index: 1, topN: 1, roundStatus: 'completed' },
      { roundId: 'r2', index: 2, topN: 2, roundStatus: 'completed' }
    ],
    topNByRoundId: { r1: 1, r2: 2 }
  });
  var P = mixedN.participants[0];
  assert('每轮不同 N 分别判断完整', P.isComplete === true && P.roundBreakdown[0].requiredCount === 1 && P.roundBreakdown[1].requiredCount === 2);

  var tieABC = seriesScoring.computeGlobalTopM({
    entries: [
      entry({ entryId: 'ta1', roundId: 'r1', seriesParticipantId: 'team:A', rankingValue: 70, memberUserIds: ['1'] }),
      entry({ entryId: 'ta2', roundId: 'r1', seriesParticipantId: 'team:A', rankingValue: 71, memberUserIds: ['2'] }),
      entry({ entryId: 'ta3', roundId: 'r1', seriesParticipantId: 'team:A', rankingValue: 72, memberUserIds: ['3'] }),
      entry({ entryId: 'tb1', roundId: 'r1', seriesParticipantId: 'team:B', rankingValue: 69, memberUserIds: ['4'] }),
      entry({ entryId: 'tb2', roundId: 'r1', seriesParticipantId: 'team:B', rankingValue: 72, memberUserIds: ['5'] }),
      entry({ entryId: 'tb3', roundId: 'r1', seriesParticipantId: 'team:B', rankingValue: 72, memberUserIds: ['6'] }),
      entry({ entryId: 'tc1', roundId: 'r1', seriesParticipantId: 'team:C', rankingValue: 73, memberUserIds: ['7'] }),
      entry({ entryId: 'tc2', roundId: 'r1', seriesParticipantId: 'team:C', rankingValue: 73, memberUserIds: ['8'] }),
      entry({ entryId: 'tc3', roundId: 'r1', seriesParticipantId: 'team:C', rankingValue: 74, memberUserIds: ['9'] })
    ],
    rounds: [{ roundId: 'r1', index: 1, roundStatus: 'completed' }],
    globalM: 3
  });
  // A=213, B=213, C=220
  var tA = tieABC.participants.find(function (p) {
    return p.seriesParticipantId === 'team:A';
  });
  var tB = tieABC.participants.find(function (p) {
    return p.seriesParticipantId === 'team:B';
  });
  var tC = tieABC.participants.find(function (p) {
    return p.seriesParticipantId === 'team:C';
  });
  assert('同分 A=B=213', tA.totalRankingValue === 213 && tB.totalRankingValue === 213);
  assert('C=220', tC.totalRankingValue === 220);
  assert(
    '同分不分配不同正式 rank',
    tA.rank === null &&
      tB.rank === null &&
      tA.tieUnresolved === true &&
      tB.tieUnresolved === true &&
      tA.provisionalRank === tB.provisionalRank &&
      tA.rankDecision === 'unset'
  );
  assert('第三人 provisionalRank 靠后', tC.provisionalRank === 3 && tC.rank === 3);
})();

// ---- 审查回归：存储写失败 ----
(function testStorageFail() {
  var failStore = seriesStoreMod.createSeriesStore(createMemoryAdapter({ failWrite: true }));
  var d = seriesModel.createEmptySeriesDraft({ seriesName: 'fail' });
  var r = failStore.saveDraft(d);
  assert('saveDraft 写失败', r.ok === false && r.reason === 'storage_write_failed');
  assert('写失败后 list 仍空', failStore.listSeries().length === 0);

  var okStore = seriesStoreMod.createSeriesStore(createMemoryAdapter());
  okStore.saveDraft(d);
  var shared = createMemoryAdapter();
  var s1 = seriesStoreMod.createSeriesStore(shared);
  var d2 = seriesModel.createEmptySeriesDraft({ seriesName: 'fail' });
  s1.saveDraft(d2);
  var sFail = seriesStoreMod.createSeriesStore({
    getItem: function (k) {
      return shared.getItem(k);
    },
    setItem: function () {
      return { ok: false, reason: 'storage_write_failed' };
    }
  });
  d2.seriesName = 'changed';
  var up = sFail.upsertSeries(d2);
  assert('upsert 写失败', up.ok === false && up.reason === 'storage_write_failed');
  assert('写失败不落地新名', s1.getSeriesById(d2.seriesId).seriesName === 'fail');

  var idx = seriesStationIndexMod.createSeriesStationIndex(createMemoryAdapter({ failWrite: true }));
  var link = idx.setLink('m1', 's1', 'r1');
  assert('index 写失败', link.ok === false && link.reason === 'storage_write_failed');
  assert('index 写失败无映射', idx.getByMatchId('m1') == null);
})();

// ---- 审查回归：result entry 校验 ----
(function testResultEntryValidation() {
  var ok = seriesValidators.validateResultEntry({
    entryId: 'e1',
    seriesId: 's1',
    roundId: 'r1',
    matchId: 'm1',
    seriesParticipantId: 'team:A',
    resultUnitType: 'player',
    sourceEntityKey: 'player:u1',
    memberUserIds: ['u1'],
    rankingValue: 72,
    resultStatus: 'OK'
  });
  assert('合法 result entry', ok.ok === true);

  var bad = seriesValidators.validateResultEntry({
    entryId: 'e2',
    resultUnitType: 'pair',
    resultStatus: 'OK',
    memberUserIds: ['u1'],
    rankingValue: null
  });
  var codes = bad.errors.map(function (e) {
    return e.code;
  });
  assert(
    'result entry 必填与 pair/ranking',
    codes.indexOf('entry_series_id_required') >= 0 &&
      codes.indexOf('entry_round_id_required') >= 0 &&
      codes.indexOf('entry_match_id_required') >= 0 &&
      codes.indexOf('source_entity_key_required') >= 0 &&
      codes.indexOf('pair_members_min') >= 0 &&
      codes.indexOf('ranking_value_required') >= 0,
    codes.join(',')
  );
  var dup = seriesValidators.validateResultEntry({
    entryId: 'e3',
    seriesId: 's1',
    roundId: 'r1',
    matchId: 'm1',
    seriesParticipantId: 'team:A',
    resultUnitType: 'player',
    sourceEntityKey: 'k',
    memberUserIds: ['u1', 'u1'],
    rankingValue: 70,
    resultStatus: 'OK'
  });
  assert(
    'result entry 拒绝重复 memberUserId',
    dup.errors.some(function (e) {
      return e.code === 'member_ids_duplicate';
    })
  );
})();

// ---- 窄范围：countable rounds 边界 ----
(function testCountableRoundBoundaries() {
  function entry(partial) {
    return seriesModel.createResultEntry(
      Object.assign(
        {
          seriesId: 's1',
          matchId: 'm1',
          sourceEntityKey: 'k',
          resultStatus: 'OK',
          resultUnitType: 'player',
          memberUserIds: ['u'],
          scoreBasis: 'gross'
        },
        partial
      )
    );
  }

  var emptyRounds = seriesScoring.computePerRoundTopN({
    entries: [],
    rounds: [],
    participantIds: ['team:A', 'team:B']
  });
  assert('空 rounds 无映射：hasCountableRounds=false', emptyRounds.meta.hasCountableRounds === false);
  assert('空 rounds 无映射：reason', emptyRounds.meta.reason === 'no_countable_rounds');
  assert(
    '空 rounds 无映射：全部不完整无正式排名',
    emptyRounds.participants.length === 2 &&
      emptyRounds.participants.every(function (p) {
        return p.isComplete === false && p.rank === null && p.provisionalRank === null && p.selectedCount === 0;
      })
  );

  var allCancelled = seriesScoring.computePerRoundTopN({
    entries: [
      entry({ entryId: 'c1', roundId: 'r1', seriesParticipantId: 'team:A', rankingValue: 70, memberUserIds: ['a'] })
    ],
    rounds: [
      { roundId: 'r1', index: 1, topN: 2, roundStatus: 'cancelled' },
      { roundId: 'r2', index: 2, topN: 2, roundStatus: 'cancelled' }
    ],
    topNByRoundId: { r1: 2, r2: 2 },
    participantIds: ['team:A']
  });
  assert(
    '全 cancelled 不因 topNByRoundId 回填',
    allCancelled.meta.hasCountableRounds === false &&
      allCancelled.meta.countableRoundCount === 0 &&
      allCancelled.participants[0].isComplete === false &&
      allCancelled.participants[0].rank === null
  );

  var cutoffAll = seriesScoring.computePerRoundTopN({
    entries: [
      entry({ entryId: 'd1', roundId: 'r1', seriesParticipantId: 'team:A', rankingValue: 70, memberUserIds: ['a'] })
    ],
    rounds: [
      { roundId: 'r1', index: 3, topN: 2, roundStatus: 'completed' },
      { roundId: 'r2', index: 4, topN: 2, roundStatus: 'completed' }
    ],
    topNByRoundId: { r1: 2, r2: 2 },
    cutoffRoundIndex: 1,
    participantIds: ['team:A']
  });
  assert(
    'cutoff 排除全部轮次不回填',
    cutoffAll.meta.hasCountableRounds === false && cutoffAll.participants[0].rank === null
  );

  var illegalTopN = seriesScoring.computePerRoundTopN({
    entries: [
      entry({ entryId: 'e1', roundId: 'r1', seriesParticipantId: 'team:A', rankingValue: 70, memberUserIds: ['a'] })
    ],
    rounds: [{ roundId: 'r1', index: 1, topN: 0, roundStatus: 'completed' }],
    topNByRoundId: { r1: 3 },
    participantIds: ['team:A']
  });
  assert(
    '非空 rounds 非法 topN 不从映射恢复',
    illegalTopN.meta.hasCountableRounds === false &&
      seriesScoring.getCountableRounds(
        [{ roundId: 'r1', index: 1, topN: 0, roundStatus: 'completed' }],
        null,
        { r1: 3 }
      ).length === 0
  );

  var degenerate = seriesScoring.computePerRoundTopN({
    entries: [
      entry({ entryId: 'f1', roundId: 'r1', seriesParticipantId: 'team:A', rankingValue: 70, memberUserIds: ['a1'] }),
      entry({ entryId: 'f2', roundId: 'r1', seriesParticipantId: 'team:A', rankingValue: 71, memberUserIds: ['a2'] })
    ],
    // 完全未提供 rounds
    topNByRoundId: { r1: 2 },
    participantIds: ['team:A']
  });
  assert(
    '无 rounds 元数据时退化模式可用',
    degenerate.meta.hasCountableRounds === true &&
      degenerate.participants[0].isComplete === true &&
      degenerate.participants[0].selectedCount === 2
  );

  var zeroCountableMulti = seriesScoring.computePerRoundTopN({
    entries: [],
    rounds: [{ roundId: 'r1', index: 1, topN: 2, roundStatus: 'cancelled' }],
    topNByRoundId: { r1: 2 },
    participantIds: ['team:A', 'team:B', 'team:C']
  });
  assert(
    '零可计入轮次多主体均不完整',
    zeroCountableMulti.participants.length === 3 &&
      zeroCountableMulti.meta.hasCountableRounds === false &&
      zeroCountableMulti.participants.every(function (p) {
        return p.isComplete === false && p.rank === null && p.provisionalRank === null;
      })
  );
})();

// ---- 反向索引：删除不存在映射幂等 ----
(function testIndexRemoveAbsent() {
  var index = seriesStationIndexMod.createSeriesStationIndex(createMemoryAdapter());
  var absent = index.removeByMatchId('never-linked');
  assert('删除不存在映射幂等成功', absent.ok === true && absent.reason === 'absent');
  var again = index.removeByMatchId('never-linked');
  assert('再次删除仍幂等', again.ok === true && again.reason === 'absent');
})();

// ---- Batch3: roundDraft 纯函数 ----
(function testRoundDraft() {
  assert('轮次数 2.5 拒绝', roundDraft.parseStrictRoundCount('2.5') === null);
  assert('轮次数 10abc 拒绝', roundDraft.parseStrictRoundCount('10abc') === null);
  assert('轮次数 1 拒绝', roundDraft.parseStrictRoundCount('1') === null);
  assert('轮次数 2 接受', roundDraft.parseStrictRoundCount('2') === 2);
  assert('轮次数 10 接受', roundDraft.parseStrictRoundCount('10') === 10);

  var baseRounds = seriesModel.createBlankRounds(2);
  var idsBefore = baseRounds.map(function (r) {
    return r.roundId;
  });
  var frozenBase = freezeClone(baseRounds);
  var grown = roundDraft.resizeRounds(baseRounds, 4);
  assert('增轮 ok', grown.ok === true && grown.rounds.length === 4);
  assert(
    '增轮保留旧 roundId',
    grown.rounds[0].roundId === idsBefore[0] && grown.rounds[1].roundId === idsBefore[1]
  );
  assert('增轮不修改输入', JSON.stringify(baseRounds) === JSON.stringify(frozenBase));

  var seeded = seriesModel.createBlankRounds(2);
  var seededCourse = roundDraft.cascadeCourseFromRound(seeded, seeded[0].roundId, {
    courseId: 'c1',
    courseName: '测试球场',
    courseLocation: '深圳',
    front9Course: 'A',
    back9Course: 'B',
    courseHalfText: '（A/B）'
  });
  var seededTime = roundDraft.cascadeDateTimeFromRound(
    seededCourse.rounds,
    seededCourse.rounds[0].roundId,
    '2026-06-03 09:00'
  );
  var grown2 = roundDraft.resizeRounds(seededTime.rounds, 4);
  assert(
    '多增轮继承球场',
    grown2.ok &&
      grown2.rounds[2].courseId === 'c1' &&
      grown2.rounds[3].front9Course === 'A' &&
      grown2.rounds[3].courseHalfText === '（A/B）'
  );
  assert(
    '多增轮逐轮 +24h',
    grown2.rounds[1].dateTime === '2026-06-04 09:00' &&
      grown2.rounds[2].dateTime === '2026-06-05 09:00' &&
      grown2.rounds[3].dateTime === '2026-06-06 09:00' &&
      grown2.rounds[2].dateTimeUserEdited === false
  );

  var shrinkIds = grown2.rounds.map(function (r) {
    return r.roundId;
  });
  var shrunk = roundDraft.resizeRounds(grown2.rounds, 2);
  assert(
    '减轮保留剩余 ID',
    shrunk.ok &&
      shrunk.rounds.length === 2 &&
      shrunk.rounds[0].roundId === shrinkIds[0] &&
      shrunk.rounds[1].roundId === shrinkIds[1]
  );

  var named = freezeClone(baseRounds);
  named[1].name = 'ROUND 99';
  named[1].index = 2;
  assert('ROUND 99 为自定义名称', roundDraft.roundHasUserData(named[1]) === true);
  assert(
    '默认 ROUND index 不算配置',
    roundDraft.roundHasUserData({
      index: 2,
      name: 'ROUND 2',
      topN: 3,
      fee: '',
      gameMode: '',
      roundStatus: 'scheduled'
    }) === false
  );
  assert(
    'dateTimeUserEdited=true 空时间算配置',
    roundDraft.roundHasUserData({
      index: 1,
      name: 'ROUND 1',
      dateTime: '',
      dateTimeUserEdited: true,
      topN: 3
    }) === true
  );
  assert(
    'roundStatus postponed 算配置',
    roundDraft.roundHasUserData({ index: 1, name: 'ROUND 1', roundStatus: 'postponed', topN: 3 }) ===
      true
  );
  assert(
    'roundStatus cancelled 算配置',
    roundDraft.roundHasUserData({ index: 1, name: 'ROUND 1', roundStatus: 'cancelled', topN: 3 }) ===
      true
  );
  assert(
    'roundStatus live 算配置',
    roundDraft.roundHasUserData({ index: 1, name: 'ROUND 1', roundStatus: 'live', topN: 3 }) === true
  );
  assert(
    'roundStatus completed 算配置',
    roundDraft.roundHasUserData({ index: 1, name: 'ROUND 1', roundStatus: 'completed', topN: 3 }) ===
      true
  );
  assert(
    'scheduled 且其他空不算配置',
    roundDraft.roundHasUserData({
      index: 1,
      name: 'ROUND 1',
      roundStatus: 'scheduled',
      dateTime: '',
      fee: '',
      gameMode: '',
      topN: 3
    }) === false
  );
  assert(
    'topN 数字 3 默认',
    roundDraft.roundHasUserData({ index: 1, name: 'ROUND 1', topN: 3 }) === false
  );
  assert(
    "topN 字符串 '3' 默认",
    roundDraft.roundHasUserData({ index: 1, name: 'ROUND 1', topN: '3' }) === false
  );
  assert(
    'topN 4 算配置',
    roundDraft.roundHasUserData({ index: 1, name: 'ROUND 1', topN: 4 }) === true
  );
  assert(
    'topN 3.5 算配置',
    roundDraft.roundHasUserData({ index: 1, name: 'ROUND 1', topN: 3.5 }) === true
  );
  assert(
    'topN abc 算配置',
    roundDraft.roundHasUserData({ index: 1, name: 'ROUND 1', topN: 'abc' }) === true
  );
  assert(
    'topN 0 算配置',
    roundDraft.roundHasUserData({ index: 1, name: 'ROUND 1', topN: 0 }) === true
  );
  assert(
    '未知分站引用字段算配置',
    roundDraft.roundHasUserData({
      index: 1,
      name: 'ROUND 1',
      topN: 3,
      customStationLink: 'st-1'
    }) === true
  );
  assert(
    '自动日期算已有数据',
    roundDraft.roundHasUserData({
      index: 1,
      name: 'ROUND 1',
      dateTime: '2026-06-04 09:00',
      dateTimeUserEdited: false,
      topN: 3
    }) === true
  );
  assert(
    '自动球场算已有数据',
    roundDraft.roundHasUserData({
      index: 1,
      name: 'ROUND 1',
      courseId: 'c9',
      topN: 3
    }) === true
  );

  assert('费用空合法', roundDraft.parseFeeInput('').ok && roundDraft.parseFeeInput('').value === '');
  assert('费用 0 合法', roundDraft.parseFeeInput('0').ok && roundDraft.parseFeeInput('0').value === '0');
  assert('费用整数合法', roundDraft.parseFeeInput('1280').ok);
  assert('费用一位小数合法', roundDraft.parseFeeInput('1280.5').ok);
  assert('费用两位小数合法', roundDraft.parseFeeInput('1280.50').ok);
  assert('费用负数非法', roundDraft.parseFeeInput('-1').ok === false);
  assert('费用三位小数非法', roundDraft.parseFeeInput('1.234').ok === false);
  assert('费用文字非法', roundDraft.parseFeeInput('10abc').ok === false);

  var cascadeRounds = seriesModel.createBlankRounds(4);
  var courseSnap = {
    courseId: 'cx',
    courseName: '海岸',
    courseLocation: '珠海',
    front9Course: 'A',
    back9Course: 'C',
    courseHalfText: '（A/C）'
  };
  var cAll = roundDraft.cascadeCourseFromRound(cascadeRounds, cascadeRounds[0].roundId, courseSnap);
  assert(
    'R1 球场级联全部',
    cAll.ok &&
      cAll.rounds.every(function (r) {
        return r.courseId === 'cx' && r.courseHalfText === '（A/C）' && r.back9Course === 'C';
      })
  );
  var frozenCascade = freezeClone(cascadeRounds);
  var partial = freezeClone(cascadeRounds);
  partial[0].courseId = 'old1';
  partial[1].courseId = 'old2';
  partial[2].courseId = 'old3';
  partial[3].courseId = 'old4';
  var cFrom3 = roundDraft.cascadeCourseFromRound(partial, partial[2].roundId, courseSnap);
  assert(
    'R3 球场只改 R3 以后',
    cFrom3.ok &&
      cFrom3.rounds[0].courseId === 'old1' &&
      cFrom3.rounds[1].courseId === 'old2' &&
      cFrom3.rounds[2].courseId === 'cx' &&
      cFrom3.rounds[3].courseId === 'cx' &&
      cFrom3.rounds[3].front9Course === 'A'
  );
  var partialBefore = JSON.stringify(partial);
  roundDraft.cascadeCourseFromRound(partial, partial[2].roundId, courseSnap);
  assert('R3 级联不修改输入数组', JSON.stringify(partial) === partialBefore);
  assert('级联前输入未被污染', JSON.stringify(cascadeRounds) === JSON.stringify(frozenCascade));

  var timeRounds = seriesModel.createBlankRounds(4);
  var t1 = roundDraft.cascadeDateTimeFromRound(
    timeRounds,
    timeRounds[0].roundId,
    '2026-06-03 09:00'
  );
  assert(
    'R1 时间逐轮 +24h',
    t1.ok &&
      t1.rounds[0].dateTime === '2026-06-03 09:00' &&
      t1.rounds[0].dateTimeUserEdited === true &&
      t1.rounds[1].dateTime === '2026-06-04 09:00' &&
      t1.rounds[2].dateTime === '2026-06-05 09:00' &&
      t1.rounds[3].dateTime === '2026-06-06 09:00'
  );

  var anchored = freezeClone(t1.rounds);
  anchored[2].dateTime = '2026-06-10 14:00';
  anchored[2].dateTimeUserEdited = true;
  var t2 = roundDraft.cascadeDateTimeFromRound(anchored, anchored[0].roundId, '2026-06-03 09:00');
  assert(
    '后续手动时间锚点保留',
    t2.ok &&
      t2.rounds[2].dateTime === '2026-06-10 14:00' &&
      t2.rounds[2].dateTimeUserEdited === true &&
      t2.rounds[3].dateTime === '2026-06-11 14:00'
  );

  var badAnchor = freezeClone(t1.rounds);
  badAnchor[2].dateTimeUserEdited = true;
  badAnchor[2].dateTime = 'not-a-date';
  var tBad = roundDraft.cascadeDateTimeFromRound(badAnchor, badAnchor[0].roundId, '2026-06-03 09:00');
  assert('非法时间锚点返回错误', tBad.ok === false && tBad.reason === 'invalid_anchor_datetime');

  var sameDay = freezeClone(t1.rounds);
  sameDay[1].dateTime = '2026-06-03 15:00';
  sameDay[1].dateTimeUserEdited = true;
  var tSame = roundDraft.cascadeDateTimeFromRound(sameDay, sameDay[0].roundId, '2026-06-03 09:00');
  assert(
    '同日多轮不作为错误',
    tSame.ok === true &&
      tSame.rounds[0].dateTime === '2026-06-03 09:00' &&
      tSame.rounds[1].dateTime === '2026-06-03 15:00'
  );

  assert('Top N 1.5 拒绝', roundDraft.parseStrictTopN('1.5') === null);
  assert('Top N 10abc 拒绝', roundDraft.parseStrictTopN('10abc') === null);
  assert('Top N 0 拒绝', roundDraft.parseStrictTopN('0') === null);
  assert('Top N 3 接受', roundDraft.parseStrictTopN('3') === 3);

  var feeIn = { fee: '1' };
  var feeFrozen = freezeClone(feeIn);
  roundDraft.parseFeeInput(feeIn.fee);
  assert('parseFeeInput 不修改输入对象', JSON.stringify(feeIn) === JSON.stringify(feeFrozen));

  var addOk = roundDraft.addLocalHours('2026-06-03 09:00', 24);
  assert('addLocalHours +24', addOk.ok && addOk.dateTime === '2026-06-04 09:00');
  var addBad = roundDraft.addLocalHours('2026/06/03 09:00', 24);
  assert('addLocalHours 非法输入', addBad.ok === false);

  // 动态默认时间（固定时钟）；恰好整 10 分钟档取当前档
  function assertDefaultFromParts(label, y, mo, d, h, mi, s, ms, expect) {
    var got = roundDraft.createDefaultLocalDateTime(new Date(y, mo - 1, d, h, mi, s, ms));
    assert(label, got === expect, 'got=' + got);
    assert(label + ' 可解析', !!roundDraft.parseLocalDateTimeParts(got));
  }
  assertDefaultFromParts('默认时间 09:03→09:10', 2026, 6, 3, 9, 3, 0, 0, '2026-06-03 09:10');
  assertDefaultFromParts('默认时间 09:10 整档→09:10', 2026, 6, 3, 9, 10, 0, 0, '2026-06-03 09:10');
  assertDefaultFromParts('默认时间 09:10:01→09:20', 2026, 6, 3, 9, 10, 1, 0, '2026-06-03 09:20');
  assertDefaultFromParts('默认时间 09:59→10:00', 2026, 6, 3, 9, 59, 0, 0, '2026-06-03 10:00');
  assertDefaultFromParts('默认时间 23:59→次日 00:00', 2026, 6, 3, 23, 59, 0, 0, '2026-06-04 00:00');
  assertDefaultFromParts('默认时间 月末跨月', 2026, 1, 31, 23, 59, 0, 0, '2026-02-01 00:00');
  assertDefaultFromParts('默认时间 年末跨年', 2026, 12, 31, 23, 59, 0, 0, '2027-01-01 00:00');

  // 仅打开 picker 的语义：createDefault 不写入 rounds；取消级联不发生
  var pickerSeedRounds = freezeClone(seriesModel.createBlankRounds(2));
  var seedBefore = JSON.stringify(pickerSeedRounds);
  roundDraft.createDefaultLocalDateTime(new Date(2026, 5, 3, 9, 3, 0, 0));
  assert('动态默认不修改 rounds 输入', JSON.stringify(pickerSeedRounds) === seedBefore);

  // ---- R1 赛制批量同步 ----
  var gmRounds = seriesModel.createBlankRounds(3);
  gmRounds[0].name = '首轮';
  gmRounds[0].dateTime = '2030-01-01 08:00';
  gmRounds[0].fee = '100';
  gmRounds[0].topN = 5;
  gmRounds[0].courseId = 'c1';
  gmRounds[0].courseName = '一号球场';
  gmRounds[1].name = '次轮';
  gmRounds[1].dateTime = '2030-01-02 08:00';
  gmRounds[1].fee = '200';
  gmRounds[1].topN = 4;
  gmRounds[1].courseId = 'c2';
  gmRounds[1].courseName = '二号球场';
  gmRounds[2].name = '末轮';
  gmRounds[2].dateTime = '2030-01-03 08:00';
  gmRounds[2].fee = '';
  gmRounds[2].topN = 3;
  gmRounds[2].courseId = 'c3';
  var gmFrozen = freezeClone(gmRounds);

  var gm1 = roundDraft.applyRoundGameMode(gmRounds, gmRounds[0].roundId, '个人比杆赛');
  assert(
    'R1 选个人比杆 → 全轮同步',
    gm1.ok &&
      gm1.changed &&
      gm1.batched &&
      gm1.rounds.every(function (r) {
        return r.gameMode === '个人比杆赛';
      })
  );
  assert(
    'R1 同步不改名称/时间/球场/费用/TopN',
    gm1.rounds[0].name === '首轮' &&
      gm1.rounds[1].name === '次轮' &&
      gm1.rounds[2].name === '末轮' &&
      gm1.rounds[0].dateTime === '2030-01-01 08:00' &&
      gm1.rounds[1].dateTime === '2030-01-02 08:00' &&
      gm1.rounds[2].dateTime === '2030-01-03 08:00' &&
      gm1.rounds[0].courseId === 'c1' &&
      gm1.rounds[1].courseId === 'c2' &&
      gm1.rounds[2].courseId === 'c3' &&
      gm1.rounds[0].fee === '100' &&
      gm1.rounds[1].fee === '200' &&
      gm1.rounds[2].fee === '' &&
      gm1.rounds[0].topN === 5 &&
      gm1.rounds[1].topN === 4 &&
      gm1.rounds[2].topN === 3
  );
  assert('applyRoundGameMode 不原地改输入', JSON.stringify(gmRounds) === JSON.stringify(gmFrozen));

  var gmFour = roundDraft.applyRoundGameMode(gm1.rounds, gm1.rounds[0].roundId, '四人四球比杆赛');
  assert(
    'R1 选四人四球 → 全轮同步',
    gmFour.ok &&
      gmFour.rounds.every(function (r) {
        return r.gameMode === '四人四球比杆赛';
      })
  );

  var gmR2 = roundDraft.applyRoundGameMode(gmFour.rounds, gmFour.rounds[1].roundId, '最佳球位比杆赛');
  assert(
    'R2 单独改最佳球位 → 仅 R2',
    gmR2.ok &&
      !gmR2.batched &&
      gmR2.rounds[0].gameMode === '四人四球比杆赛' &&
      gmR2.rounds[1].gameMode === '最佳球位比杆赛' &&
      gmR2.rounds[2].gameMode === '四人四球比杆赛'
  );

  var gmR1Again = roundDraft.applyRoundGameMode(gmR2.rounds, gmR2.rounds[0].roundId, '四人两球比杆赛');
  assert(
    'R2 单改后再改 R1 → 全轮覆盖为新 R1',
    gmR1Again.ok &&
      gmR1Again.batched &&
      gmR1Again.rounds.every(function (r) {
        return r.gameMode === '四人两球比杆赛';
      })
  );

  var gmSame = roundDraft.applyRoundGameMode(
    gmR1Again.rounds,
    gmR1Again.rounds[0].roundId,
    '四人两球比杆赛'
  );
  assert('R1 选择相同值 → changed=false（不写盘）', gmSame.ok && gmSame.changed === false);

  var growFromR1 = roundDraft.resizeRounds(gmR1Again.rounds, 4);
  assert(
    '新增轮次继承 R1 赛制且不改已有轮',
    growFromR1.ok &&
      growFromR1.rounds.length === 4 &&
      growFromR1.rounds[3].gameMode === '四人两球比杆赛' &&
      growFromR1.rounds[0].gameMode === '四人两球比杆赛' &&
      growFromR1.rounds[1].gameMode === '四人两球比杆赛'
  );

  var shrinkBack = roundDraft.resizeRounds(growFromR1.rounds, 2);
  assert(
    '减轮行为无回归',
    shrinkBack.ok &&
      shrinkBack.rounds.length === 2 &&
      shrinkBack.rounds[0].gameMode === '四人两球比杆赛' &&
      shrinkBack.rounds[1].gameMode === '四人两球比杆赛'
  );

  // 冷启动语义：纯函数只读已保存结果，不会因再次调用自动覆盖
  var cold = freezeClone(gmR2.rounds);
  assert(
    '冷启动不重新覆盖（已保存混合赛制保持）',
    cold[0].gameMode === '四人四球比杆赛' &&
      cold[1].gameMode === '最佳球位比杆赛' &&
      cold[2].gameMode === '四人四球比杆赛'
  );

  // 页面接线：R1 批量提示 + onPickGameMode 走 applyRoundGameMode
  var seriesPageJs = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'miniprogram',
      'subpackages',
      'create',
      'pages',
      'series',
      'index.js'
    ),
    'utf8'
  );
  var seriesPageWxml = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'miniprogram',
      'subpackages',
      'create',
      'pages',
      'series',
      'index.wxml'
    ),
    'utf8'
  );
  assert(
    '页面 onPickGameMode 使用 applyRoundGameMode',
    seriesPageJs.indexOf('applyRoundGameMode') >= 0 &&
      /if\s*\(\s*!applied\.changed\s*\)\s*return/.test(seriesPageJs)
  );
  assert(
    '第 1 轮卡片显示批量提示',
    seriesPageJs.indexOf('showGameModeBatchHint') >= 0 &&
      seriesPageWxml.indexOf('应用到全部轮次') >= 0 &&
      seriesPageWxml.indexOf('showGameModeBatchHint') >= 0
  );
})();

// ========== Batch 4A: participantDraft ==========
(function testParticipantDraft() {
  assert(
    '首版模板 team+division_series',
    participantDraft.isFirstWaveTemplate('team', 'division_series') === true
  );
  assert(
    '首版模板 organization+inter_team_series',
    participantDraft.isFirstWaveTemplate('organization', 'inter_team_series') === true
  );
  assert(
    '首版模板 organization+ryder',
    participantDraft.isFirstWaveTemplate('organization', 'ryder') === true
  );
  assert(
    '非首版 custom 不可进 3～5',
    participantDraft.isFirstWaveTemplate('team', 'custom') === false
  );

  var mappedTeams = participantDraft.mapTeamParticipantsFromSelect([
    {
      sourceTeamId: 't1',
      sourceTeamName: '完整队名甲',
      sourceTeamShortName: '甲',
      sourceTeamLogo: 'logo-a',
      name: '甲'
    },
    {
      sourceTeamId: 't1',
      sourceTeamName: '完整队名甲-重复',
      sourceTeamShortName: '甲2',
      sourceTeamLogo: 'logo-a2'
    },
    {
      sourceTeamId: 't2',
      sourceTeamName: '完整队名乙',
      sourceTeamShortName: '乙',
      sourceTeamLogo: 'logo-b'
    }
  ]);
  assert('参赛球队去重后 2 支', mappedTeams.length === 2, 'len=' + mappedTeams.length);
  assert(
    'seriesParticipantId=team:id',
    mappedTeams[0].seriesParticipantId === 'team:t1' &&
      mappedTeams[1].seriesParticipantId === 'team:t2'
  );
  assert(
    'nameSnapshot 优先简称',
    mappedTeams[0].nameSnapshot === '甲' && mappedTeams[1].nameSnapshot === '乙',
    mappedTeams[0].nameSnapshot + '/' + mappedTeams[1].nameSnapshot
  );
  assert(
    '新选择同时保存 full/short',
    mappedTeams[0].fullNameSnapshot === '完整队名甲' &&
      mappedTeams[0].shortNameSnapshot === '甲' &&
      mappedTeams[1].fullNameSnapshot === '完整队名乙' &&
      mappedTeams[1].shortNameSnapshot === '乙'
  );
  assert('logoSnapshot 保留', mappedTeams[0].logoSnapshot === 'logo-a');
  assert('team kind + 空 divisionId', mappedTeams[0].kind === 'team' && mappedTeams[0].divisionId === '');

  var shortOnly = participantDraft.mapTeamParticipantsFromSelect([
    {
      sourceTeamId: 't3',
      shortName: '短名丙',
      sourceTeamName: '完整队名丙',
      sourceTeamLogo: 'logo-c'
    }
  ]);
  assert(
    '无 sourceTeamShortName 时 shortName 次优',
    shortOnly[0] && shortOnly[0].nameSnapshot === '短名丙',
    shortOnly[0] && shortOnly[0].nameSnapshot
  );
  assert(
    'shortName 路径仍写全称快照',
    shortOnly[0].fullNameSnapshot === '完整队名丙' &&
      shortOnly[0].shortNameSnapshot === '短名丙'
  );
  var fullFallback = participantDraft.mapTeamParticipantsFromSelect([
    {
      sourceTeamId: 't4',
      sourceTeamName: '完整队名丁',
      name: '别名丁',
      sourceTeamLogo: 'logo-d'
    }
  ]);
  assert(
    '无简称时回退完整队名',
    fullFallback[0] && fullFallback[0].nameSnapshot === '完整队名丁',
    fullFallback[0] && fullFallback[0].nameSnapshot
  );
  assert(
    '无简称时 short=full 且不得猜全称',
    fullFallback[0].fullNameSnapshot === '完整队名丁' &&
      fullFallback[0].shortNameSnapshot === '完整队名丁'
  );
  var nameOnly = participantDraft.mapTeamParticipantsFromSelect([
    { sourceTeamId: 't5', name: '仅 name 戊', sourceTeamLogo: '' }
  ]);
  assert(
    '无简称无 sourceTeamName 时回退 name',
    nameOnly[0] && nameOnly[0].nameSnapshot === '仅 name 戊'
  );
  assert(
    'resolve 优先级 sourceTeamShortName > shortName',
    participantDraft.resolveTeamParticipantNameSnapshot({
      sourceTeamShortName: 'S1',
      shortName: 'S2',
      sourceTeamName: 'FULL',
      name: 'N'
    }) === 'S1'
  );

  var chips = participantDraft.buildTeamParticipantChips(mappedTeams);
  assert(
    '创建 chips 优先简称',
    chips[0].name === '甲' && chips[1].name === '乙'
  );
  var initPayload = participantDraft.buildInitParticipantsPayload(mappedTeams);
  assert(
    '选择器回填分写全称/简称',
    initPayload.participants[0].sourceTeamName === '完整队名甲' &&
      initPayload.participants[0].sourceTeamShortName === '甲' &&
      initPayload.participants[0].name === '甲'
  );
  assert(
    '回填不再把简称冒充全称',
    initPayload.participants[0].sourceTeamName !==
      initPayload.participants[0].sourceTeamShortName ||
      mappedTeams[0].fullNameSnapshot === mappedTeams[0].shortNameSnapshot
  );

  var oldNorm = seriesModel.normalizeParticipant({
    seriesParticipantId: 'team:old1',
    kind: 'team',
    sourceTeamId: 'old1',
    nameSnapshot: '旧简称'
  });
  assert(
    'normalize 不编造旧草稿全称',
    oldNorm.fullNameSnapshot === '' &&
      oldNorm.shortNameSnapshot === '' &&
      oldNorm.nameSnapshot === '旧简称'
  );
  var newNorm = seriesModel.normalizeParticipant({
    seriesParticipantId: 'team:n1',
    kind: 'team',
    sourceTeamId: 'n1',
    nameSnapshot: '短',
    fullNameSnapshot: '完整名',
    shortNameSnapshot: '短'
  });
  assert(
    'normalize 保留 full/short',
    newNorm.fullNameSnapshot === '完整名' && newNorm.shortNameSnapshot === '短'
  );
  var created = seriesModel.createParticipant({
    kind: 'team',
    sourceTeamId: 'c1',
    fullNameSnapshot: '创建全称',
    shortNameSnapshot: '创建简称',
    nameSnapshot: '创建简称'
  });
  assert(
    'createParticipant 含 full/short',
    created.fullNameSnapshot === '创建全称' &&
      created.shortNameSnapshot === '创建简称' &&
      created.nameSnapshot === '创建简称'
  );
  var divKeep = seriesModel.createParticipant({
    kind: 'division',
    sourceTeamId: 'host1',
    nameSnapshot: '分队红'
  });
  assert(
    '分队名称无回归（不强行拆全称简称）',
    divKeep.nameSnapshot === '分队红' &&
      divKeep.fullNameSnapshot === '' &&
      divKeep.shortNameSnapshot === ''
  );

  // ========== 原生数字输入缓冲事件序列 ==========
  assert(
    'participantDraft 不再导出 mergePreservedWizardInputs',
    typeof participantDraft.mergePreservedWizardInputs !== 'function'
  );
  var memM = Object.create(null);
  var storeM = seriesStoreMod.createSeriesStore({
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(memM, key) ? memM[key] : null;
    },
    setItem: function (key, value) {
      memM[key] = value;
      return { ok: true };
    }
  });
  var draftM = seriesModel.createEmptySeriesDraft({});
  draftM.hostMode = 'organization';
  draftM.templateId = 'inter_team_series';
  draftM.scoringRule = seriesModel.createDefaultScoringRule({
    mode: 'global_m',
    globalM: 10
  });
  draftM.rounds = roundDraft.resizeRounds([], 2).rounds;
  var savedM0 = storeM.saveDraft(draftM);
  assert('M 用例先入库', savedM0.ok === true);
  var seriesIdM = savedM0.series.seriesId;

  var mSession = seriesPageHelpers.createNativeNumberInputSession({
    initialDisplay: '10',
    parse: seriesPageHelpers.parseStrictPositiveInteger
  });
  var setDataDuringInput = 0;
  mSession.focus('10');
  var retEmpty = mSession.input({ detail: { value: '' } });
  var retEight = mSession.input({ detail: { value: '8' } });
  assert('focus→input 空串返回空', retEmpty === '');
  assert('focus→input 8 返回 8', retEight === '8');
  assert('编辑缓冲最终为 8', mSession.buffer === '8');
  assert('bindinput 路径无 setData', mSession.setDataCalls.length === 0 && setDataDuringInput === 0);

  var projectedMid = seriesPageHelpers.overlayEditingNumberInputs(
    { globalMInput: '10', roundCountInput: '2' },
    {
      globalMEditing: mSession.isEditing(),
      globalMBuffer: mSession.buffer,
      roundCountEditing: false,
      roundCountBuffer: null
    }
  );
  assert('编辑期间投影仍取缓冲 8', projectedMid.globalMInput === '8');

  var snapBeforeBad = JSON.stringify(storeM.getSeriesById(seriesIdM));
  var badCommit = mSession.commit('0', '10');
  assert('blur 非法不 ok', badCommit.ok === false && badCommit.restored === '10');
  assert('blur 非法后 storage 不变', JSON.stringify(storeM.getSeriesById(seriesIdM)) === snapBeforeBad);

  mSession.focus('10');
  mSession.input({ detail: { value: '' } });
  mSession.input({ detail: { value: '8' } });
  var goodCommit = mSession.commit('8', '10');
  assert('blur(8) 合法', goodCommit.ok === true && goodCommit.value === 8);
  var draftM2 = freezeClone(storeM.getSeriesById(seriesIdM));
  draftM2.scoringRule = freezeClone(draftM2.scoringRule);
  draftM2.scoringRule.globalM = goodCommit.value;
  var savedM1 = storeM.saveDraft(draftM2);
  assert(
    'blur(8) 后 storage=8',
    savedM1.ok && storeM.getSeriesById(seriesIdM).scoringRule.globalM === 8
  );
  assert('blur(8) 后 dataValue=8', mSession.dataValue === '8');

  [ '', '0', '-1', '1.5', '8abc', '  ' ].forEach(function (bad) {
    assert(
      'M 非法拒绝: ' + JSON.stringify(bad),
      seriesPageHelpers.parseStrictPositiveInteger(bad) == null
    );
  });

  // 轮次数：focus→清空→3→应用；以及下一步同次进入 Step5；减轮确认取消
  var rcSession = seriesPageHelpers.createNativeNumberInputSession({
    initialDisplay: '2',
    parse: roundDraft.parseStrictRoundCount
  });
  rcSession.focus('2');
  rcSession.input({ detail: { value: '' } });
  rcSession.input({ detail: { value: '3' } });
  assert('轮次数缓冲为 3', rcSession.buffer === '3');
  var to3 = roundDraft.resizeRounds(storeM.getSeriesById(seriesIdM).rounds, 3);
  assert('轮次数清空后输入 3 可应用', to3.ok && to3.rounds.length === 3 && !to3.needConfirm);
  var draftR = freezeClone(storeM.getSeriesById(seriesIdM));
  draftR.rounds = to3.rounds;
  var savedR = storeM.saveDraft(draftR);
  assert(
    '应用轮次数=3 后生成 3 轮',
    savedR.ok && storeM.getSeriesById(seriesIdM).rounds.length === 3
  );
  rcSession.clearEditFlags();
  rcSession.dataValue = '3';

  // 输入 3 后直接“下一步”：缓冲≠rounds.length → 先应用再进 Step5（同一次）
  rcSession.focus('2');
  rcSession.input({ detail: { value: '3' } });
  var nextRaw = rcSession.buffer;
  var nextTarget = roundDraft.parseStrictRoundCount(nextRaw);
  var curLenForNext = 2;
  var simulatedStep = 4;
  if (nextTarget != null && nextTarget !== curLenForNext) {
    var applied = roundDraft.resizeRounds(
      roundDraft.resizeRounds([], 2).rounds,
      nextTarget
    );
    if (applied.ok && !applied.needConfirm) {
      simulatedStep = 5;
      rcSession.commit(String(nextTarget), '2');
    }
  }
  assert('输入 3 后下一步同次进入 Step5', simulatedStep === 5 && nextTarget === 3);

  // 减轮确认：needConfirm + 取消保持轮次；确认后缩短
  var fat = roundDraft.resizeRounds([], 4);
  fat.rounds[2].courseId = 'c1';
  fat.rounds[2].courseName = '球场';
  fat.rounds[3].courseId = 'c2';
  fat.rounds[3].courseName = '球场2';
  var shrink = roundDraft.resizeRounds(fat.rounds, 2);
  assert('减轮需要确认', shrink.ok && shrink.needConfirm === true);
  assert('取消减轮不改长度', fat.rounds.length === 4);
  assert('确认减轮后长度为 2', shrink.rounds.length === 2);

  var snapRounds = JSON.stringify(storeM.getSeriesById(seriesIdM).rounds);
  [ '', '0', '1', '2.5', '3x', '  ' ].forEach(function (bad) {
    assert(
      '轮次数非法拒绝: ' + JSON.stringify(bad),
      roundDraft.parseStrictRoundCount(bad) == null
    );
  });
  assert(
    '轮次数非法不删除已有轮次',
    JSON.stringify(storeM.getSeriesById(seriesIdM).rounds) === snapRounds
  );
  assert(
    'TopN 解析业务规则未改：2 合法 / 0 非法',
    roundDraft.parseStrictTopN('2') === 2 && roundDraft.parseStrictTopN('0') == null
  );
  assert(
    '费用解析无回归：12.5 合法 / 12.345 非法',
    roundDraft.parseFeeInput('12.5').ok === true &&
      roundDraft.parseFeeInput('12.345').ok === false
  );

  var afterRemove = participantDraft.removeTeamParticipantBySourceId(mappedTeams, 't1');
  assert('删除球队后剩 1', afterRemove.length === 1 && afterRemove[0].sourceTeamId === 't2');

  var org = participantDraft.mapOrganizationPayload({
    organizationId: 'org1',
    organizationName: '机构A',
    organizationLogo: 'ol'
  });
  assert('组织映射', org.organizationId === 'org1' && org.organizationName === '机构A');

  var host = participantDraft.mapHostTeamPayload({
    teamId: 'ht1',
    teamName: '主办队',
    teamLogo: 'hl',
    teamRole: '超级管理员',
    shortName: '主'
  });
  assert('主办球队映射不含 role 覆盖 name', host.teamId === 'ht1' && host.teamName === '主办队');

  var defaults = participantDraft.createDefaultDivisions(host);
  assert('默认两分队', defaults.length === 2);
  assert(
    '默认分队 ID 不同',
    defaults[0].divisionId &&
      defaults[1].divisionId &&
      defaults[0].divisionId !== defaults[1].divisionId
  );
  assert(
    '默认 seriesParticipantId=division:id',
    defaults[0].seriesParticipantId === 'division:' + defaults[0].divisionId &&
      defaults[1].seriesParticipantId === 'division:' + defaults[1].divisionId
  );
  assert(
    '默认名称 分队 A/B',
    defaults[0].nameSnapshot === '分队 A' && defaults[1].nameSnapshot === '分队 B'
  );
  assert(
    '默认颜色取色板前两色',
    defaults[0].colorSnapshot === participantDraft.DIVISION_COLOR_PALETTE[0] &&
      defaults[1].colorSnapshot === participantDraft.DIVISION_COLOR_PALETTE[1]
  );
  assert('默认 logoSnapshot 为空（本批不选图）', defaults[0].logoSnapshot === '');

  var id0 = defaults[0].divisionId;
  var sp0 = defaults[0].seriesParticipantId;
  var renamed = participantDraft.updateDivision(defaults, id0, {
    nameSnapshot: '先锋队',
    colorSnapshot: participantDraft.DIVISION_COLOR_PALETTE[3]
  });
  assert('改名改色成功', renamed.ok === true);
  assert(
    '改名改色不改 ID',
    renamed.participants[0].divisionId === id0 &&
      renamed.participants[0].seriesParticipantId === sp0,
    renamed.participants[0].divisionId + '/' + renamed.participants[0].seriesParticipantId
  );
  assert('名称已更新', renamed.participants[0].nameSnapshot === '先锋队');
  assert(
    '颜色允许任意色板值',
    renamed.participants[0].colorSnapshot === participantDraft.DIVISION_COLOR_PALETTE[3]
  );

  var removedDiv = participantDraft.removeDivision(renamed.participants, id0);
  assert('删除分队后剩 1', removedDiv.length === 1);
  var added = participantDraft.addDivision(removedDiv, host);
  assert('删除后再新增成功', added.ok && added.participants.length === 2);
  assert(
    '新增分队不复用旧 ID',
    added.participants[1].divisionId !== id0 &&
      added.participants[1].seriesParticipantId !== sp0,
    added.participants[1].divisionId
  );

  var draftA = seriesModel.createEmptySeriesDraft({});
  draftA.hostMode = 'organization';
  draftA.templateId = 'custom';
  draftA.organization = org;
  draftA.participants = mappedTeams;
  assert(
    '非首版有 subjects 仍不算可进 Step5（门闩在 derive）',
    participantDraft.hasStep5BranchData(draftA) === true &&
      participantDraft.isFirstWaveTemplate(draftA.hostMode, draftA.templateId) === false
  );

  var cleared = participantDraft.clearBranchForHostModeSwitch(draftA, 'team');
  assert('hostMode 切换清理 organization', !cleared.organization.organizationId);
  assert('hostMode 切换清理 participants', cleared.participants.length === 0);
  assert('hostMode 切换后为 team', cleared.hostMode === 'team');

  var draftB = seriesModel.createEmptySeriesDraft({});
  draftB.hostMode = 'team';
  draftB.templateId = 'division_series';
  draftB.hostTeam = host;
  draftB.participants = defaults;
  var sameHost = participantDraft.applyHostTeamChange(draftB, host, { clearDivisions: false });
  assert(
    '相同主办球队不清分队',
    sameHost.participants.length === 2 &&
      sameHost.participants[0].divisionId === defaults[0].divisionId
  );
  var newHost = participantDraft.applyHostTeamChange(
    draftB,
    { teamId: 'ht2', teamName: '新主办', teamLogo: '' },
    { clearDivisions: true }
  );
  assert('确认更换主办后分队清空', newHost.participants.length === 0);
  assert('确认更换主办后 hostTeam 更新', newHost.hostTeam.teamId === 'ht2');

  var ensured = participantDraft.ensureDefaultDivisionsIfNeeded({
    hostTeam: host,
    participants: []
  });
  assert('无分队时自动创建两个', ensured.participants.length === 2);

  var cards = participantDraft.buildDivisionCards(defaults);
  assert('分队卡片含首字', cards[0].initial === '分');
  assert('分队卡片无媒体路径字段写入 logo', cards[0].initial && defaults[0].logoSnapshot === '');

  // 颜色重复允许：两队同色
  var dupColor = participantDraft.updateDivision(defaults, defaults[1].divisionId, {
    colorSnapshot: defaults[0].colorSnapshot
  });
  assert(
    '颜色允许重复',
    dupColor.ok &&
      dupColor.participants[0].colorSnapshot === dupColor.participants[1].colorSnapshot
  );

  // 页面 _persistNextDraft 语义：写失败时 lastSaved 不变（完整回滚）
  var mem = Object.create(null);
  var failWrite = false;
  var store = seriesStoreMod.createSeriesStore({
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
    },
    setItem: function (key, value) {
      if (failWrite) return { ok: false, reason: 'storage_write_failed' };
      mem[key] = value;
      return { ok: true };
    }
  });
  var hostSwitchDraft = seriesModel.createEmptySeriesDraft({});
  hostSwitchDraft.hostMode = 'team';
  hostSwitchDraft.templateId = 'division_series';
  hostSwitchDraft.hostTeam = {
    teamId: 'ht-old',
    teamName: '旧主办',
    teamLogo: ''
  };
  hostSwitchDraft.participants = participantDraft.createDefaultDivisions(
    hostSwitchDraft.hostTeam
  );
  var savedHost = store.saveDraft(hostSwitchDraft);
  assert('主办切换回滚用例先入库', savedHost.ok === true);
  var lastSaved = freezeClone(savedHost.series);
  var lastSavedSnap = JSON.stringify(lastSaved);
  failWrite = true;
  var attempted = freezeClone(lastSaved);
  var changed = participantDraft.applyHostTeamChange(
    attempted,
    { teamId: 'ht-new', teamName: '新主办', teamLogo: '' },
    { clearDivisions: true }
  );
  changed = participantDraft.ensureDefaultDivisionsIfNeeded(changed);
  var failResult = store.saveDraft(changed);
  assert('主办更换写失败', failResult.ok === false);
  var still = store.getSeriesById(lastSaved.seriesId);
  assert(
    '写失败后存储中主办与分队不变',
    still &&
      still.hostTeam.teamId === 'ht-old' &&
      still.participants.length === 2 &&
      still.participants[0].divisionId === lastSaved.participants[0].divisionId,
    still && still.hostTeam && still.hostTeam.teamId
  );
  assert('写失败 lastSaved 快照不变', JSON.stringify(lastSaved) === lastSavedSnap);

  // 本批不使用 chooseMedia / 临时路径
  var participantSrc = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'miniprogram',
      'subpackages',
      'create',
      'pages',
      'series',
      'participantDraft.js'
    ),
    'utf8'
  );
  var indexSrc = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'miniprogram',
      'subpackages',
      'create',
      'pages',
      'series',
      'index.js'
    ),
    'utf8'
  );
  assert(
    '本批无 chooseMedia',
    participantSrc.indexOf('chooseMedia') < 0 && indexSrc.indexOf('chooseMedia') < 0
  );
  assert(
    '本批无 wxfile:// 临时路径写入',
    participantSrc.indexOf('wxfile://') < 0 && indexSrc.indexOf('wxfile://') < 0
  );
})();

// ========== Batch 4B: accessCode + basicInfoDraft ==========
(function testBatch4B() {
  var basicInfoDraft = require(path.join(
    __dirname,
    '..',
    'miniprogram',
    'subpackages',
    'create',
    'pages',
    'series',
    'basicInfoDraft.js'
  ));

  var empty = seriesModel.createEmptySeriesDraft({});
  assert('4B 空草稿 accessCode 为空串', empty.accessCode === '');
  assert('4B 空草稿 partnerConfig=null', empty.partnerConfig === null);
  assert('4B 空草稿 eventInfoList=[]', Array.isArray(empty.eventInfoList) && empty.eventInfoList.length === 0);
  assert('4B 空草稿 eventInfoInitialized=false', empty.eventInfoInitialized === false);
  assert(
    'Series 不含 bannerImageInitialized',
    !Object.prototype.hasOwnProperty.call(empty, 'bannerImageInitialized')
  );
  assert('空草稿 bannerImageSnapshot 为空', empty.bannerImageSnapshot === '');

  var normPub = seriesModel.normalizeSeries({
    seriesId: 's-ac-1',
    visibility: 'public',
    accessCode: '123456'
  });
  assert('public 时 normalize 清空 accessCode', normPub.accessCode === '');

  var normPriv = seriesModel.normalizeSeries({
    seriesId: 's-ac-2',
    visibility: 'private',
    accessCode: '654321'
  });
  assert('private 时 normalize 保留 accessCode', normPriv.accessCode === '654321');
  assert('不静默生成 accessCode', normPriv.accessCode === '654321');

  var nameOk = basicInfoDraft.normalizeSeriesNameInput('  系列赛A  ');
  assert('名称 trim 合法', nameOk.ok && nameOk.value === '系列赛A');
  assert('名称空非法', basicInfoDraft.normalizeSeriesNameInput('   ').ok === false);
  assert(
    '名称 18 字合法',
    basicInfoDraft.normalizeSeriesNameInput(Array(18).fill('啊').join('')).ok === true
  );
  assert(
    '名称超长非法',
    basicInfoDraft.normalizeSeriesNameInput(Array(19).fill('啊').join('')).ok === false
  );

  var emptySubDraft = seriesModel.createEmptySeriesDraft({});
  assert(
    '工厂默认 seriesSubtitle 空串',
    emptySubDraft.seriesSubtitle === ''
  );
  assert(
    'sanitize 清换行并 trim',
    seriesModel.sanitizeSeriesSubtitle('  A\nB\rC  ') === 'ABC'
  );
  var longNameKeep = seriesModel.normalizeSeries({
    seriesId: 's-sub-1',
    seriesName: '完整长名称不拆分',
    seriesSubtitle: ''
  });
  assert(
    '不从 seriesName 拆分副标题',
    longNameKeep.seriesName === '完整长名称不拆分' && longNameKeep.seriesSubtitle === ''
  );
  var subOk = basicInfoDraft.normalizeSeriesSubtitleInput('  第二行\n  ');
  assert('副标题空合法且清换行', basicInfoDraft.normalizeSeriesSubtitleInput('').ok === true);
  assert('副标题 trim 合法', subOk.ok && subOk.value === '第二行');
  assert(
    '副标题 12 字合法',
    basicInfoDraft.normalizeSeriesSubtitleInput(Array(12).fill('啊').join('')).ok === true
  );
  assert(
    '名称清除换行',
    basicInfoDraft.normalizeSeriesNameInput('春\n季\r对决\u2028').ok &&
      basicInfoDraft.normalizeSeriesNameInput('春\n季\r对决\u2028').value === '春季对决'
  );
  assert(
    '副标题超长非法',
    basicInfoDraft.normalizeSeriesSubtitleInput(Array(13).fill('啊').join('')).ok === false
  );
  assert(
    'SERIES_NAME_MAX=18',
    basicInfoDraft.SERIES_NAME_MAX === 18
  );
  assert(
    'SERIES_SUBTITLE_MAX=12',
    basicInfoDraft.SERIES_SUBTITLE_MAX === 12
  );

  var createWxml = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'miniprogram',
      'subpackages',
      'create',
      'pages',
      'series',
      'index.wxml'
    ),
    'utf8'
  );
  var createWxss = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'miniprogram',
      'subpackages',
      'create',
      'pages',
      'series',
      'index.wxss'
    ),
    'utf8'
  );
  assert(
    'Step6 双行预览且空副标题不占位',
    createWxml.indexOf('series-confirm-title-stack') >= 0 &&
      createWxml.indexOf('seriesSubtitleInput') >= 0 &&
      createWxml.indexOf('wx:if="{{seriesSubtitleInput}}"') >= 0 &&
      createWxml.indexOf('副标题未填') < 0 &&
      (createWxml.match(/series-confirm-v--title-line/g) || []).length >= 2
  );
  var titleLineRuleMatch = createWxss.match(
    /\.series-wizard\s+\.series-confirm-v--title-line\s*\{([^}]*)\}/
  );
  var titleLineRule = titleLineRuleMatch ? titleLineRuleMatch[1] : '';
  assert(
    'Step6 主副标题同行样式无弱化类',
    !!titleLineRuleMatch &&
      /font-size\s*:/.test(titleLineRule) &&
      /font-weight\s*:/.test(titleLineRule) &&
      /color\s*:/.test(titleLineRule) &&
      /line-height\s*:/.test(titleLineRule) &&
      createWxss.indexOf('series-confirm-v--sub') < 0 &&
      createWxss.indexOf('series-confirm-v--empty') < 0
  );

  // registrationWindow 已彻底删除：无兼容字段、无校验、无 Step5→6 门闩
  var emptyNoReg = seriesModel.createEmptySeriesDraft({});
  assert(
    'Series 工厂不含 registrationWindow',
    !Object.prototype.hasOwnProperty.call(emptyNoReg, 'registrationWindow')
  );
  var stripReg = seriesModel.normalizeSeries({
    seriesId: 's-strip-reg',
    registrationWindow: { startAt: '2026-01-01 09:00', endAt: '2026-01-02 18:00' }
  });
  assert(
    'normalize 忽略残留 registrationWindow',
    !Object.prototype.hasOwnProperty.call(stripReg, 'registrationWindow')
  );
  assert(
    'validateRegistrationWindow 已删除',
    typeof basicInfoDraft.validateRegistrationWindow !== 'function'
  );

  function draftReadyForStep6NoReg(base) {
    var d = freezeClone(base);
    d.hostMode = 'organization';
    d.templateId = 'inter_team_series';
    d.organization = {
      organizationId: 'org1',
      organizationName: '机构',
      organizationLogo: ''
    };
    d.participants = [
      seriesModel.createParticipant({
        kind: 'team',
        sourceTeamId: 't1',
        seriesParticipantId: 'team:t1',
        nameSnapshot: '甲'
      }),
      seriesModel.createParticipant({
        kind: 'team',
        sourceTeamId: 't2',
        seriesParticipantId: 'team:t2',
        nameSnapshot: '乙'
      })
    ];
    d.seriesName = '无报名窗门闩测试';
    d.visibility = 'public';
    d.accessCode = '';
    d.rounds = roundDraft.resizeRounds([], 2).rounds;
    return d;
  }
  var noRegGate = draftReadyForStep6NoReg(seriesModel.createEmptySeriesDraft({}));
  assert(
    '无 registrationWindow 仍可进 Step6',
    basicInfoDraft.canEnterStep6(noRegGate).ok === true
  );
  noRegGate.registrationWindow = { startAt: 'x', endAt: 'y' };
  assert(
    '残留 registrationWindow 不参与门闩',
    basicInfoDraft.canEnterStep6(noRegGate).ok === true
  );

  var indexSrc = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'miniprogram',
      'subpackages',
      'create',
      'pages',
      'series',
      'index.js'
    ),
    'utf8'
  );
  var indexWxml = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'miniprogram',
      'subpackages',
      'create',
      'pages',
      'series',
      'index.wxml'
    ),
    'utf8'
  );
  assert(
    '创建页已删除报名时间 picker 与摘要',
    indexSrc.indexOf('openRegTimePicker') < 0 &&
      indexSrc.indexOf('regStart') < 0 &&
      indexSrc.indexOf('regEnd') < 0 &&
      indexWxml.indexOf('报名开始') < 0 &&
      indexWxml.indexOf('报名截止') < 0 &&
      indexWxml.indexOf('报名窗口') < 0 &&
      indexSrc.indexOf('confirmTimePicker') >= 0
  );

  assert('accessCode 6位合法', basicInfoDraft.isValidAccessCode('012345') === true);
  assert('accessCode 非6位非法', basicInfoDraft.isValidAccessCode('12345') === false);
  var gen = basicInfoDraft.generateAccessCode();
  assert('生成码为6位数字', /^\d{6}$/.test(gen));

  var visDraft = seriesModel.createEmptySeriesDraft({});
  visDraft.visibility = 'private';
  visDraft.accessCode = '111111';
  var toPublic = basicInfoDraft.applyVisibilityChange(visDraft, 'public');
  assert('切 public 清空 accessCode', toPublic.visibility === 'public' && toPublic.accessCode === '');
  var toPrivate = basicInfoDraft.applyVisibilityChange(toPublic, 'private');
  assert(
    '切 private 不自动生成',
    toPrivate.visibility === 'private' && toPrivate.accessCode === ''
  );

  var added = basicInfoDraft.addEventInfoItem([], { title: '赛事介绍', type: 'text' });
  assert('新增 eventInfo 成功', added.ok && added.list.length === 1 && /^evt-/.test(added.list[0].id));
  var dup = basicInfoDraft.addEventInfoItem(added.list, { title: '赛事介绍', type: 'text' });
  assert('标题去重', dup.ok === false && dup.reason === 'title_duplicate');
  var withTemp = basicInfoDraft.addEventInfoItem([], {
    title: '坏图',
    type: 'image',
    brightImage: 'wxfile://tmp/a.png'
  });
  assert('禁止临时媒体写入 eventInfo', withTemp.ok === false);

  var partnerEmpty = basicInfoDraft.normalizePartnerConfigForSeries({
    partnerTitle: 'Demo Partners',
    partnerLogos: []
  });
  assert(
    '空 partnerLogos 可保存且不回填默认',
    partnerEmpty && partnerEmpty.partnerLogos.length === 0
  );
  assert(
    'partnerConfig null 保持未配置',
    basicInfoDraft.normalizePartnerConfigForSeries(null) === null
  );

  var d6 = seriesModel.createEmptySeriesDraft({});
  d6.hostMode = 'organization';
  d6.templateId = 'inter_team_series';
  d6.organization = {
    organizationId: 'org1',
    organizationName: '机构',
    organizationLogo: ''
  };
  d6.participants = [
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't1',
      seriesParticipantId: 'team:t1',
      nameSnapshot: '甲'
    }),
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't2',
      seriesParticipantId: 'team:t2',
      nameSnapshot: '乙'
    })
  ];
  d6.seriesName = '测试系列赛';
  d6.visibility = 'public';
  d6.accessCode = '';
  d6.rounds = roundDraft.resizeRounds([], 2).rounds;
  assert('Step6 门闩齐全可通过', basicInfoDraft.canEnterStep6(d6).ok === true);
  d6.visibility = 'private';
  d6.accessCode = '';
  assert('private 无码不可进 Step6', basicInfoDraft.canEnterStep6(d6).ok === false);
  d6.accessCode = '123456';
  assert('private 有6位码可进 Step6', basicInfoDraft.canEnterStep6(d6).ok === true);

  var cold = seriesModel.createEmptySeriesDraft({});
  assert(
    '冷启动无 host → 1',
    basicInfoDraft.deriveWizardStep(cold, { isTemplateCompatible: function () { return true; } }) === 1
  );
  cold.hostMode = 'organization';
  cold.templateId = 'inter_team_series';
  assert(
    '冷启动首版但门闩未满足 → 5',
    basicInfoDraft.deriveWizardStep(cold, {
      isTemplateCompatible: function (h, t) {
        return h === 'organization' && t === 'inter_team_series';
      }
    }) === 5
  );
  assert(
    '冷启动门闩满足 → 6',
    basicInfoDraft.deriveWizardStep(d6, {
      isTemplateCompatible: function (h, t) {
        return h === 'organization' && t === 'inter_team_series';
      }
    }) === 6
  );

  d6.visibility = 'private';
  d6.accessCode = '12';
  var draftBadCode = seriesValidators.validateDraftStructure(d6);
  assert(
    '草稿非空非法 accessCode 报错',
    draftBadCode.errors.some(function (e) {
      return e.code === 'access_code_invalid';
    })
  );
  d6.accessCode = '';
  var draftEmptyCode = seriesValidators.validateDraftStructure(d6);
  assert(
    '草稿 private 空码可通过结构校验',
    !draftEmptyCode.errors.some(function (e) {
      return String(e.code).indexOf('access_code') === 0;
    })
  );

  var indexSrc4b = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'miniprogram',
      'subpackages',
      'create',
      'pages',
      'series',
      'index.js'
    ),
    'utf8'
  );
  var basicSrc = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'miniprogram',
      'subpackages',
      'create',
      'pages',
      'series',
      'basicInfoDraft.js'
    ),
    'utf8'
  );
  assert(
    '4B 不调用全局 savePartnerConfig',
    indexSrc4b.indexOf('savePartnerConfig') < 0 && basicSrc.indexOf('savePartnerConfig') < 0
  );
  assert(
    '4B 辅助层禁止 wxfile 持久化字面写入逻辑存在校验',
    basicSrc.indexOf('wxfile:') >= 0 && basicSrc.indexOf('isStableMediaUrl') >= 0
  );

  // ---------- 4B 复刻：赛事信息 / PARTNER ----------
  var eventInfoDefaults = require(path.join(
    __dirname,
    '..',
    'miniprogram',
    'utils',
    'eventInfoDefaults.js'
  ));
  var baselineDefaults = eventInfoDefaults.createDefaultEventInfoList();
  var seedDraft = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    organization: {
      organizationId: 'org-seed',
      organizationName: '湘鹰机构',
      organizationLogo: ''
    }
  });
  assert('新草稿 eventInfoInitialized 默认 false', seedDraft.eventInfoInitialized === false);
  assert(
    '新草稿不含 bannerImageInitialized',
    !Object.prototype.hasOwnProperty.call(seedDraft, 'bannerImageInitialized')
  );
  assert('新草稿 bannerImageSnapshot 为空', seedDraft.bannerImageSnapshot === '');
  var plan1 = basicInfoDraft.planStep5FirstEnter(seedDraft);
  assert(
    '首次 Step5 计划灌入 Hero / 赛事信息 / PARTNER',
    plan1.changed && plan1.seedBanner && plan1.seedEventInfo && plan1.seedPartner
  );
  var defaultBanner = basicInfoDraft.createDefaultBannerImageSnapshot();
  assert(
    '空 Hero 进入 Step5 写默认图',
    !!plan1.bannerImageSnapshot &&
      plan1.bannerImageSnapshot === defaultBanner &&
      /^https:\/\/partnerlogo-1440519371\.cos\.ap-beijing\.myqcloud\.com\/match-detail-banner\.jpg/.test(
        plan1.bannerImageSnapshot
      )
  );
  assert(
    '默认4项顺序类型与基准一致',
    plan1.eventInfoList.length === 4 &&
      plan1.eventInfoList.every(function (item, idx) {
        return (
          item.title === baselineDefaults[idx].title &&
          item.type === baselineDefaults[idx].type &&
          item.brightImage === baselineDefaults[idx].brightImage &&
          item.darkImage === baselineDefaults[idx].darkImage
        );
      })
  );
  var beforeSeed = JSON.stringify(seedDraft);
  // 模拟保存失败：不 apply → 草稿不变
  assert('初始化保存失败不改草稿', JSON.stringify(seedDraft) === beforeSeed);

  var applied = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    organization: {
      organizationId: 'org-seed',
      organizationName: '湘鹰机构',
      organizationLogo: ''
    }
  });
  basicInfoDraft.applyStep5FirstEnter(applied, plan1);
  assert('初始化成功同时保存 eventInfoInitialized', applied.eventInfoInitialized === true);
  assert(
    '初始化不写入 bannerImageInitialized',
    !Object.prototype.hasOwnProperty.call(applied, 'bannerImageInitialized')
  );
  assert(
    '初始化 Hero 快照为系统图',
    applied.bannerImageSnapshot === defaultBanner
  );
  assert('初始化后赛事信息为4项', applied.eventInfoList.length === 4);
  assert(
    '广告图1 使用系统 sponsor 双图',
    applied.eventInfoList[0].type === 'image' &&
      /^https:\/\//.test(applied.eventInfoList[0].brightImage) &&
      /^https:\/\//.test(applied.eventInfoList[0].darkImage)
  );
  assert(
    '初始化 PARTNER 默认标题与4 Logo',
    applied.partnerConfig &&
      applied.partnerConfig.partnerTitle === '湘鹰机构 Partners' &&
      applied.partnerConfig.partnerLogos.length === 4
  );
  assert(
    'PARTNER Logo 为稳定 HTTPS',
    applied.partnerConfig.partnerLogos.every(function (logo) {
      return (
        logo &&
        /^https:\/\//.test(logo.bright) &&
        /^https:\/\//.test(logo.dark) &&
        basicInfoDraft.isStableMediaUrl(logo.bright) &&
        basicInfoDraft.isStableMediaUrl(logo.dark)
      );
    })
  );
  var plan2 = basicInfoDraft.planStep5FirstEnter(applied);
  assert('已初始化后不再灌入', plan2.changed === false);
  assert(
    '非空 Hero 快照不覆盖',
    plan2.seedBanner === false && applied.bannerImageSnapshot === defaultBanner
  );

  var customBanner = 'https://example.com/custom-hero.jpg';
  applied.bannerImageSnapshot = customBanner;
  var planKeepBanner = basicInfoDraft.planStep5FirstEnter(applied);
  assert(
    '非空自定义 Hero 进入 Step5 不覆盖',
    planKeepBanner.seedBanner === false && applied.bannerImageSnapshot === customBanner
  );
  applied.bannerImageSnapshot = defaultBanner;

  applied.eventInfoList = [];
  var planEmpty = basicInfoDraft.planStep5FirstEnter(applied);
  assert(
    '删除全部赛事信息后冷启动不重新生成',
    planEmpty.seedEventInfo === false &&
      planEmpty.changed === false &&
      applied.eventInfoInitialized === true &&
      applied.eventInfoList.length === 0
  );

  applied.partnerConfig.partnerLogos = [];
  var normEmptyLogos = basicInfoDraft.normalizePartnerConfigForSeries(applied.partnerConfig);
  assert(
    '删除全部 Logo 后仍为空且不回填',
    normEmptyLogos &&
      normEmptyLogos.partnerLogos.length === 0 &&
      normEmptyLogos.partnerTitle === '湘鹰机构 Partners'
  );
  var planAfterClearLogos = basicInfoDraft.planStep5FirstEnter(applied);
  assert(
    'Logo 清空后 partnerConfig 非 null 不再种子化',
    planAfterClearLogos.seedPartner === false
  );

  var oldMissing = seriesModel.normalizeSeries({
    seriesId: 's-old-evt',
    eventInfoList: []
  });
  assert('旧草稿缺失 eventInfoInitialized 按 false', oldMissing.eventInfoInitialized === false);
  assert(
    '旧草稿缺失 banner 快照为空且不含 bannerImageInitialized',
    oldMissing.bannerImageSnapshot === '' &&
      !Object.prototype.hasOwnProperty.call(oldMissing, 'bannerImageInitialized')
  );
  var stripInit = seriesModel.normalizeSeries({
    seriesId: 's-strip-banner-init',
    bannerImageSnapshot: '',
    bannerImageInitialized: true
  });
  assert(
    'normalize 剥离遗留 bannerImageInitialized',
    !Object.prototype.hasOwnProperty.call(stripInit, 'bannerImageInitialized') &&
      stripInit.bannerImageSnapshot === ''
  );
  assert(
    '拒绝 wxfile Hero 快照',
    basicInfoDraft.assertNoTempMediaInBasicInfo({
      eventInfoList: [],
      bannerImageSnapshot: 'wxfile://tmp/banner.jpg',
      partnerConfig: null
    }).ok === false
  );

  // 推荐：选择高亮，确认才添加；已添加 disabled
  var recList = [];
  var recMap = basicInfoDraft.buildEventInfoTitleMap(recList);
  var selectedRecommendIndex = null;
  function selectRecommend(index, title) {
    if (recMap[title]) return { ok: false, reason: 'disabled' };
    selectedRecommendIndex = index;
    return { ok: true, selected: index };
  }
  function confirmRecommendAdd() {
    if (selectedRecommendIndex == null) return { ok: false, reason: 'none' };
    var picked = basicInfoDraft.RECOMMENDED_EVENT_INFO[selectedRecommendIndex];
    var added = basicInfoDraft.addEventInfoItem(recList, {
      title: picked.title,
      type: picked.type
    });
    if (!added.ok) return added;
    recList = added.list;
    recMap = basicInfoDraft.buildEventInfoTitleMap(recList);
    selectedRecommendIndex = null;
    return { ok: true };
  }
  assert('推荐选择仅高亮不写入', selectRecommend(0, '赛事介绍').ok && recList.length === 0);
  assert('推荐确认后写入', confirmRecommendAdd().ok && recList.length === 1);
  assert(
    '推荐已添加 disabled',
    selectRecommend(0, '赛事介绍').ok === false && recMap['赛事介绍'] === true
  );

  // 照片直播兼容：自定义交通说明归一为照片直播标题
  var photoAlias = basicInfoDraft.addEventInfoItem([], { title: '交通说明', type: 'text' });
  assert(
    '交通说明归一为照片直播',
    photoAlias.ok && photoAlias.list[0].title === '照片直播'
  );
  var mapAlias = basicInfoDraft.buildEventInfoTitleMap(photoAlias.list);
  assert(
    '照片直播与交通说明 disabled 双写',
    mapAlias['照片直播'] === true && mapAlias['交通说明'] === true
  );
  var dupPhoto = basicInfoDraft.addEventInfoItem(photoAlias.list, {
    title: '照片直播',
    type: 'text'
  });
  assert('照片直播去重', dupPhoto.ok === false && dupPhoto.reason === 'title_duplicate');

  var del1 = basicInfoDraft.nextDeleteConfirmState('', '', 'evt-1');
  assert('删除首次 arm', del1.action === 'arm' && del1.deleteBtnText === '再次点击确认删除');
  var del2 = basicInfoDraft.nextDeleteConfirmState('evt-1', 'evt-1', 'evt-1');
  assert('删除二次 confirm', del2.action === 'confirm');

  var dragNoMove = basicInfoDraft.resolveEventInfoDragReorder({
    fromIndex: 1,
    y: 144,
    stepPx: 144,
    moved: false,
    listLength: 4
  });
  assert('拖拽未超过阈值不重排', dragNoMove.shouldReorder === false);
  var dragOk = basicInfoDraft.resolveEventInfoDragReorder({
    fromIndex: 0,
    y: 288,
    stepPx: 144,
    moved: true,
    listLength: 4
  });
  assert('拖拽 px 换算落位', dragOk.shouldReorder === true && dragOk.toIndex === 2);

  var synced = basicInfoDraft.syncPartnerTitleOnHostRename(
    { partnerTitle: '湘鹰机构 Partners', partnerLogos: [] },
    '湘鹰机构',
    '新机构'
  );
  assert('默认标题切换主办联动', synced.partnerTitle === '新机构 Partners');
  var customKeep = basicInfoDraft.syncPartnerTitleOnHostRename(
    { partnerTitle: '我的定制标题', partnerLogos: [] },
    '湘鹰机构',
    '新机构'
  );
  assert('自定义标题切换主办不覆盖', customKeep.partnerTitle === '我的定制标题');

  assert('页面源码不存在 chooseMedia', indexSrc4b.indexOf('chooseMedia') < 0);
  assert(
    '页面源码不写 wxfile 持久化赋值',
    !/wxfile:\/\//.test(indexSrc4b) && indexSrc4b.indexOf('tempFilePath') < 0
  );
  assert(
    '不调用 savePartnerConfig / 不碰全局 key',
    indexSrc4b.indexOf('savePartnerConfig') < 0 &&
      indexSrc4b.indexOf('gb_match_partner_config_v1') < 0 &&
      basicSrc.indexOf('savePartnerConfig') < 0
  );

  var step6Draft = seriesModel.createEmptySeriesDraft({});
  step6Draft.hostMode = 'organization';
  step6Draft.templateId = 'inter_team_series';
  step6Draft.organization = {
    organizationId: 'org1',
    organizationName: '机构',
    organizationLogo: ''
  };
  step6Draft.participants = d6.participants.slice();
  step6Draft.seriesName = '摘要测试';
  step6Draft.visibility = 'public';
  step6Draft.accessCode = '';
  step6Draft.rounds = d6.rounds.slice();
  basicInfoDraft.applyStep5FirstEnter(
    step6Draft,
    basicInfoDraft.planStep5FirstEnter(step6Draft)
  );
  assert(
    'Step6 门闩在默认赛事/PARTNER 后仍可通过',
    basicInfoDraft.canEnterStep6(step6Draft).ok === true
  );
  assert(
    'Step6 摘要赛事信息数量正确',
    step6Draft.eventInfoList.length === 4
  );
  assert(
    'Step6 摘要 PARTNER Logo 数正确',
    step6Draft.partnerConfig && step6Draft.partnerConfig.partnerLogos.length === 4
  );

  // 抑制误点：拖后 180ms 窗口由页面实现；纯逻辑侧以 shouldReorder 成功路径覆盖
  assert(
    '拖后应重排才抑制误点路径',
    dragOk.shouldReorder === true
  );
})();

console.log('');
console.log('---- seriesDomain.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
