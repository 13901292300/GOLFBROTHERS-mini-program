/**
 * 系列赛正式发布接入 · 创建向导自测
 * - 发布顺序：inspect 先于 saveDraft
 * - published / frozen 禁止 saveDraft
 * - source drift / corrupt 不覆盖
 * - 跳转失败后只导航
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesCreatePublish.selftest.js
 */

var path = require('path');
var fs = require('fs');

var pageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'create',
  'pages',
  'series'
);
var adapter = require(path.join(pageDir, 'seriesPublishAdapter.js'));

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var adapterSrc = fs.readFileSync(path.join(pageDir, 'seriesPublishAdapter.js'), 'utf8');

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

function inspBase(over) {
  return Object.assign(
    {
      ok: true,
      seriesId: 'series-1',
      series: { lifecycleStatus: 'draft', publishState: 'idle', publishToken: '' },
      journalPhase: null,
      hasFrozenPlan: false,
      journalCorrupt: false,
      sourceDrift: false,
      canRetry: false,
      publishedWithoutJournalDone: false,
      entities: null
    },
    over || {}
  );
}

// ----- decidePublishAction -----
assert(
  'draft+无冻结 → first_publish 且允许 saveDraft',
  (function () {
    var d = adapter.decidePublishAction(inspBase());
    return d.action === 'first_publish' && d.allowSaveDraft === true;
  })()
);

assert(
  'frozen → resume 且禁止 saveDraft',
  (function () {
    var d = adapter.decidePublishAction(
      inspBase({
        hasFrozenPlan: true,
        journalPhase: 'writing_matches',
        series: { lifecycleStatus: 'draft', publishState: 'publishing', publishToken: 't' }
      })
    );
    return d.action === 'resume' && d.allowSaveDraft === false && d.warnUnsavedDiscard === true;
  })()
);

assert(
  'published+done → navigate 禁止 saveDraft',
  (function () {
    var d = adapter.decidePublishAction(
      inspBase({
        hasFrozenPlan: true,
        journalPhase: 'done',
        series: { lifecycleStatus: 'published', publishState: 'published', publishToken: 't' }
      })
    );
    return d.action === 'navigate' && d.allowSaveDraft === false;
  })()
);

assert(
  'published+未done → repair 禁止 saveDraft',
  (function () {
    var d = adapter.decidePublishAction(
      inspBase({
        hasFrozenPlan: true,
        journalPhase: 'finalizing',
        publishedWithoutJournalDone: true,
        canRetry: true,
        series: { lifecycleStatus: 'published', publishState: 'published', publishToken: 't' }
      })
    );
    return d.action === 'repair' && d.allowSaveDraft === false;
  })()
);

assert(
  'sourceDrift → blocked 禁止 saveDraft',
  (function () {
    var d = adapter.decidePublishAction(
      inspBase({
        hasFrozenPlan: true,
        sourceDrift: true,
        journalPhase: 'planned'
      })
    );
    return d.action === 'blocked' && d.code === 'plan_source_conflict' && d.allowSaveDraft === false;
  })()
);

assert(
  'journalCorrupt → blocked',
  (function () {
    var d = adapter.decidePublishAction(
      inspBase({
        hasFrozenPlan: false,
        journalCorrupt: true,
        journalCorruptDetail: 'bad'
      })
    );
    return d.action === 'blocked' && d.code === 'journal_corrupt' && d.allowSaveDraft === false;
  })()
);

assert(
  '详情 URL 不含 preview',
  adapter.buildSeriesDetailUrl('series-abc') ===
    '/subpackages/tournament/pages/series-detail/index?seriesId=series-abc' &&
    adapter.buildSeriesDetailUrl('series-abc').indexOf('preview') < 0
);

// ----- runCreatePublish 分支与 saveDraft 调用次数 -----
function runCase(label, setup) {
  var saveCalls = 0;
  var publishCalls = 0;
  var resumeCalls = 0;
  var repairCalls = 0;
  var series = setup.series;
  var insp = setup.insp;
  var result = adapter.runCreatePublish({
    seriesId: 'series-1',
    hasUnsavedPageBuffers: !!setup.hasUnsaved,
    getSeriesById: function () {
      return series;
    },
    inspectPublishState: function () {
      return insp;
    },
    publishSeries: function () {
      publishCalls += 1;
      return setup.publishResult || { ok: true, reason: 'published', series: series };
    },
    resumePublish: function () {
      resumeCalls += 1;
      return setup.resumeResult || { ok: true, reason: 'resume_published', series: series };
    },
    repairHalfPublished: function () {
      repairCalls += 1;
      return setup.repairResult || { ok: true, reason: 'repair_published', series: series };
    },
    saveDraftForFirstPublishOnly: function () {
      saveCalls += 1;
      if (setup.saveFail) return { ok: false, reason: 'storage_write_failed' };
      series = Object.assign({}, series, { updatedAt: 'x' });
      return { ok: true, series: series };
    },
    validateBeforeFirstPublish: function () {
      return setup.validate || { ok: true };
    }
  });
  return {
    label: label,
    result: result,
    saveCalls: saveCalls,
    publishCalls: publishCalls,
    resumeCalls: resumeCalls,
    repairCalls: repairCalls
  };
}

var first = runCase('first', {
  series: { seriesId: 'series-1', lifecycleStatus: 'draft' },
  insp: inspBase()
});
assert('首次发布会 saveDraft 且 publish', first.saveCalls === 1 && first.publishCalls === 1 && first.result.ok);

var frozen = runCase('frozen', {
  series: { seriesId: 'series-1', lifecycleStatus: 'draft' },
  insp: inspBase({
    hasFrozenPlan: true,
    journalPhase: 'writing_matches',
    series: { lifecycleStatus: 'draft', publishState: 'publishing', publishToken: 't' }
  }),
  hasUnsaved: true
});
assert(
  'frozen resume 不 saveDraft、不 publish、只 resume',
  frozen.saveCalls === 0 &&
    frozen.publishCalls === 0 &&
    frozen.resumeCalls === 1 &&
    frozen.result.ok &&
    frozen.result.warnToast === adapter.TOAST.RESUME_UNSAVED
);

var publishedNav = runCase('published-nav', {
  series: { seriesId: 'series-1', lifecycleStatus: 'published' },
  insp: inspBase({
    hasFrozenPlan: true,
    journalPhase: 'done',
    series: { lifecycleStatus: 'published', publishState: 'published', publishToken: 't' }
  })
});
assert(
  '已发布重复点击只导航：无 saveDraft/publish/resume',
  publishedNav.saveCalls === 0 &&
    publishedNav.publishCalls === 0 &&
    publishedNav.resumeCalls === 0 &&
    publishedNav.repairCalls === 0 &&
    publishedNav.result.ok &&
    publishedNav.result.phase === 'navigate'
);

var drift = runCase('drift', {
  series: { seriesId: 'series-1', lifecycleStatus: 'draft' },
  insp: inspBase({ hasFrozenPlan: true, sourceDrift: true, journalPhase: 'planned' })
});
assert(
  'sourceDrift 停止且无 saveDraft/重冻',
  drift.saveCalls === 0 &&
    drift.publishCalls === 0 &&
    drift.resumeCalls === 0 &&
    drift.result.ok === false &&
    drift.result.reason === 'plan_source_conflict'
);

var corrupt = runCase('corrupt', {
  series: { seriesId: 'series-1', lifecycleStatus: 'draft' },
  insp: inspBase({ journalCorrupt: true })
});
assert(
  'journal corrupt 停止且无 saveDraft',
  corrupt.saveCalls === 0 && corrupt.result.ok === false && corrupt.result.reason === 'journal_corrupt'
);

// ----- 页面接线静态断言 -----
assert(
  '页面 require adapter 与 seriesPublish',
  pageJs.indexOf("require('./seriesPublishAdapter.js')") >= 0 &&
    pageJs.indexOf("require('../../../../utils/seriesPublish.js')") >= 0
);
assert(
  'Step6 走 _onStep6CreateOrPublish',
  pageJs.indexOf('_onStep6CreateOrPublish') >= 0 &&
    pageJs.indexOf('创建系列赛将在后续批次开放') < 0
);
assert(
  'view_detail 只导航',
  pageJs.indexOf("createPublishButtonMode === 'view_detail'") >= 0 &&
    /_publishNavPending[\s\S]{0,400}_openSeriesDetailUrl/.test(pageJs)
);
assert(
  'first_publish 才挂 saveDraftForFirstPublishOnly',
  pageJs.indexOf('saveDraftForFirstPublishOnly') >= 0 &&
    (adapterSrc.indexOf("action: 'first_publish'") >= 0 ||
      adapterSrc.indexOf("decision.action === 'first_publish'") >= 0 ||
      adapterSrc.indexOf("decision2.action !== 'first_publish'") >= 0) &&
    adapterSrc.indexOf('saveDraftForFirstPublishOnly') >= 0
);
assert(
  '详情 URL 构建无 preview=1',
  pageJs.indexOf('buildSeriesDetailUrl') >= 0 &&
    pageJs.indexOf('preview=1') < 0 &&
    /function buildSeriesDetailUrl\([\s\S]*?\n\}/.test(adapterSrc) &&
    !/function buildSeriesDetailUrl\([\s\S]*?preview=1[\s\S]*?\n\}/.test(adapterSrc)
);
assert(
  '未开放文案已移除',
  pageWxml.indexOf('尚未开放') < 0 && pageJs.indexOf('（未开放）') < 0
);
assert(
  '发布中不置 _isSaving 以免锁死 saveDraft',
  /_isPublishing = true;[\s\S]{0,180}?_safeSetData\(\{[\s\S]*?isSaving:\s*true/.test(pageJs) &&
    !/_isPublishing = true;\s*this\._isSaving = true/.test(pageJs)
);

console.log('');
console.log('seriesCreatePublish.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  console.log('Failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
