/**
 * 创建向导首次发布：把会话 titleBaseline 接到校验与 publishFn
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesCreateFirstPublishTitleBaseline.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var pageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'create',
  'pages',
  'series'
);
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');
var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStoreMod = require(path.join(utilsDir, 'seriesStore.js'));
var seriesStationIndexMod = require(path.join(utilsDir, 'seriesStationIndex.js'));
var seriesPublishJournalMod = require(seriesTestPaths.util('seriesPublishJournal.js'));
var seriesPublish = require(seriesTestPaths.util('seriesPublish.js'));
var adapter = require(path.join(pageDir, 'seriesPublishAdapter.js'));

if (typeof global.getApp !== 'function') {
  global.getApp = function () {
    return { getTheme: function () { return 'bright'; } };
  };
}
var capturedPage = null;
global.Page = function (def) {
  capturedPage = def;
  return def;
};
global.wx = {
  getStorageSync: function () { return null; },
  setStorageSync: function () {},
  showToast: function () {},
  showModal: function () {},
  getWindowInfo: function () {
    return { windowWidth: 375, windowHeight: 667 };
  },
  getSystemInfoSync: function () {
    return { windowWidth: 375, windowHeight: 667 };
  }
};
require(path.join(pageDir, 'index.js'));

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
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

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function snapshot(v) {
  return JSON.stringify(v);
}

function hasTitleBaselineKey(node, acc) {
  if (!node || typeof node !== 'object') return acc;
  if (Object.prototype.hasOwnProperty.call(node, 'titleBaseline')) acc.push(true);
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) hasTitleBaselineKey(node[i], acc);
  } else {
    var keys = Object.keys(node);
    for (var k = 0; k < keys.length; k++) {
      if (keys[k] === 'titleBaseline') continue;
      hasTitleBaselineKey(node[keys[k]], acc);
    }
  }
  return acc;
}

var NAME19 = Array(19).fill('名').join('');
var NAME19B = Array(19).fill('改').join('');
var NAME18 = Array(18).fill('新').join('');
var SUB13 = Array(13).fill('副').join('');
var SUB13B = Array(13).fill('换').join('');
var SUB12 = Array(12).fill('标').join('');

function createMemoryAdapter() {
  var bag = Object.create(null);
  return {
    getItem: function (key) {
      return {
        ok: true,
        value: bag[key] != null ? JSON.parse(JSON.stringify(bag[key])) : null
      };
    },
    setItem: function (key, value) {
      bag[key] = JSON.parse(JSON.stringify(value));
      return { ok: true };
    }
  };
}

function buildPublishableSeries(over) {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: '湘鹰队际系列赛',
    createdBy: 'publisher-user-1',
    organization: {
      organizationId: 'org-1',
      organizationName: '湘鹰机构',
      organizationLogo: '/assets/mock-avatars/default-avatar.jpg'
    }
  });
  s.participants = [
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't1',
      seriesParticipantId: 'team:t1',
      nameSnapshot: '甲队'
    }),
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't2',
      seriesParticipantId: 'team:t2',
      nameSnapshot: '乙队'
    })
  ];
  s.visibility = 'public';
  s.accessCode = '';
  s.scoringRule = seriesModel.createDefaultScoringRule({
    mode: 'per_round_n',
    scoreBasis: 'gross',
    allowRepeat: false
  });
  s.rounds = s.rounds.map(function (r, idx) {
    var next = Object.assign({}, r);
    next.name = '第' + (idx + 1) + '轮';
    next.dateTime = '2030-06-0' + (idx + 1) + ' 08:00';
    next.gameMode = '个人比杆赛';
    next.courseId = 'c' + (idx + 1);
    next.courseName = '测试球场' + (idx + 1);
    next.fee = idx === 0 ? '100' : '';
    next.topN = 3;
    return next;
  });
  return Object.assign(s, over || {});
}

function inspFirst(series) {
  return {
    ok: true,
    seriesId: series.seriesId,
    series: series,
    journalPhase: null,
    hasFrozenPlan: false,
    journalCorrupt: false,
    sourceDrift: false,
    canRetry: false,
    publishedWithoutJournalDone: false,
    entities: null
  };
}

function makePageCtx(baseline, draft) {
  var page = Object.assign({}, capturedPage);
  page._seriesTitleBaseline = baseline
    ? {
        seriesName: baseline.seriesName,
        seriesSubtitle: baseline.seriesSubtitle
      }
    : null;
  page.lastSavedDraft = draft;
  page._editSeriesMode = false;
  page._editRoundMode = false;
  return page;
}

function bindValidate(page) {
  return function (series) {
    return page._validateBeforeFirstPublish(series);
  };
}

function outcomeHasBaseline(result) {
  if (!result || typeof result !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(result, 'titleBaseline')) return true;
  return hasTitleBaselineKey(result, []).length > 0;
}

assert('Page() 已捕获', !!capturedPage && typeof capturedPage._validateBeforeFirstPublish === 'function');
assert(
  '页面门闩与发布校验均传 this._seriesTitleBaseline',
  /canEnterStep6\(series,\s*\{\s*titleBaseline:\s*this\._seriesTitleBaseline/.test(pageJs) &&
    /validateForPublish\(series,\s*\{\s*titleBaseline:\s*this\._seriesTitleBaseline/.test(pageJs)
);
assert(
  'runCreatePublish 传入复制后的 titleBaseline',
  pageJs.indexOf('titleBaseline: self._copySeriesTitleBaselineSnapshot()') >= 0
);
assert(
  'adapter 只在 first_publish 调 publishFn 带 titleBaseline',
  adapterSrc.indexOf('publishFn(seriesId, { titleBaseline: titleBaselineForPlan })') >= 0 &&
    adapterSrc.indexOf('resumeFn(seriesId, {})') >= 0 &&
    adapterSrc.indexOf('repairFn(seriesId, {})') >= 0
);
assert(
  'adapter 不从 latest/current series 生成 baseline',
  adapterSrc.indexOf('titleBaselineForPlan = copyTitleBaselineSnapshot(o.titleBaseline)') >= 0 &&
    adapterSrc.indexOf('copyTitleBaselineSnapshot(latest') < 0 &&
    adapterSrc.indexOf('copyTitleBaselineSnapshot(series)') < 0
);

function runFirstPublish(opts) {
  var o = opts || {};
  var series = o.series;
  var page = makePageCtx(o.baseline, series);
  var validateCalls = [];
  var publishCalls = [];
  var resumeCalls = [];
  var repairCalls = [];
  var saveCalls = 0;
  var live = series;
  var result = adapter.runCreatePublish({
    seriesId: series.seriesId,
    titleBaseline: page._copySeriesTitleBaselineSnapshot(),
    getSeriesById: function () {
      return live;
    },
    inspectPublishState: function () {
      return o.insp || inspFirst(live);
    },
    publishSeries: function (id, publishOpts) {
      publishCalls.push({ id: id, opts: clone(publishOpts || {}) });
      if (o.publishImpl) return o.publishImpl(id, publishOpts);
      return { ok: true, reason: 'published', series: live };
    },
    resumePublish: function (id, resumeOpts) {
      resumeCalls.push({ id: id, opts: clone(resumeOpts || {}) });
      return { ok: true, reason: 'resume_published', series: live };
    },
    repairHalfPublished: function (id, repairOpts) {
      repairCalls.push({ id: id, opts: clone(repairOpts || {}) });
      return { ok: true, reason: 'repair_published', series: live };
    },
    saveDraftForFirstPublishOnly: function () {
      saveCalls += 1;
      if (o.mutateOnSave) live = Object.assign({}, live, o.mutateOnSave);
      return { ok: true, series: live };
    },
    validateBeforeFirstPublish: function (s) {
      var v = bindValidate(page)(s);
      validateCalls.push({ ok: v.ok, code: v.code, name: s.seriesName, sub: s.seriesSubtitle });
      return v;
    }
  });
  return {
    result: result,
    validateCalls: validateCalls,
    publishCalls: publishCalls,
    resumeCalls: resumeCalls,
    repairCalls: repairCalls,
    saveCalls: saveCalls,
    page: page
  };
}

(function () {
  var series = buildPublishableSeries({ seriesName: NAME19, seriesSubtitle: SUB13 });
  var out = runFirstPublish({
    series: series,
    baseline: { seriesName: NAME19, seriesSubtitle: SUB13 }
  });
  assert('未改历史超长：第一次页面校验通过', out.validateCalls[0] && out.validateCalls[0].ok === true);
  assert('未改历史超长：saveDraft 后第二次校验仍通过', out.validateCalls[1] && out.validateCalls[1].ok === true);
  assert('双校验次数为 2', out.validateCalls.length === 2);
  assert(
    'publishFn 收到原加载快照',
    out.publishCalls.length === 1 &&
      out.publishCalls[0].opts.titleBaseline.seriesName === NAME19 &&
      out.publishCalls[0].opts.titleBaseline.seriesSubtitle === SUB13
  );
  assert('未改历史超长首次发布成功', out.result.ok === true && out.result.phase === 'publish');
  assert('outcome 无 titleBaseline', outcomeHasBaseline(out.result) === false);
})();

(function () {
  var series = buildPublishableSeries({ seriesName: NAME18, seriesSubtitle: SUB13 });
  var out = runFirstPublish({
    series: series,
    baseline: { seriesName: NAME19, seriesSubtitle: SUB13 }
  });
  assert(
    '只改名称为合法值，旧副标题 13 仍能发布',
    out.result.ok === true && out.publishCalls[0].opts.titleBaseline.seriesSubtitle === SUB13
  );
})();

(function () {
  var series = buildPublishableSeries({ seriesName: NAME19, seriesSubtitle: SUB12 });
  var out = runFirstPublish({
    series: series,
    baseline: { seriesName: NAME19, seriesSubtitle: SUB13 }
  });
  assert(
    '只改副标题为合法值，旧名称 19 仍能发布',
    out.result.ok === true && out.publishCalls[0].opts.titleBaseline.seriesName === NAME19
  );
})();

(function () {
  var series = buildPublishableSeries({ seriesName: NAME19B, seriesSubtitle: SUB13 });
  var out = runFirstPublish({
    series: series,
    baseline: { seriesName: NAME19, seriesSubtitle: SUB13 }
  });
  assert(
    '改成新的名称 19 冻结前拒绝',
    out.result.ok === false &&
      out.result.phase === 'validate' &&
      out.saveCalls === 0 &&
      out.publishCalls.length === 0
  );
})();

(function () {
  var series = buildPublishableSeries({ seriesName: NAME19, seriesSubtitle: SUB13B });
  var out = runFirstPublish({
    series: series,
    baseline: { seriesName: NAME19, seriesSubtitle: SUB13 }
  });
  assert(
    '改成新的副标题 13 冻结前拒绝',
    out.result.ok === false &&
      out.result.phase === 'validate' &&
      out.publishCalls.length === 0
  );
})();

(function () {
  var series = buildPublishableSeries({ seriesName: '', seriesSubtitle: '' });
  var out = runFirstPublish({
    series: series,
    baseline: { seriesName: '', seriesSubtitle: '' }
  });
  assert(
    '空名称仍拒绝',
    out.result.ok === false && out.validateCalls[0] && out.validateCalls[0].ok === false
  );
})();

(function () {
  var series = buildPublishableSeries({ seriesName: NAME19, seriesSubtitle: SUB13 });
  var out = runFirstPublish({ series: series, baseline: null });
  assert(
    '无 baseline 的新草稿仍严格 18/12',
    out.result.ok === false &&
      out.publishCalls.length === 0 &&
      out.validateCalls[0] &&
      out.validateCalls[0].ok === false
  );
})();

(function () {
  var series = buildPublishableSeries({ seriesName: NAME19, seriesSubtitle: SUB13 });
  var inputBaseline = { seriesName: NAME19, seriesSubtitle: SUB13 };
  var page = makePageCtx(inputBaseline, series);
  var copied = page._copySeriesTitleBaselineSnapshot();
  copied.seriesName = NAME18;
  assert(
    '页面复制后改副本不影响会话快照',
    page._seriesTitleBaseline.seriesName === NAME19
  );
  var live = series;
  var publishOptsSeen = null;
  adapter.runCreatePublish({
    seriesId: series.seriesId,
    titleBaseline: page._copySeriesTitleBaselineSnapshot(),
    getSeriesById: function () {
      return live;
    },
    inspectPublishState: function () {
      return inspFirst(live);
    },
    publishSeries: function (id, opts) {
      publishOptsSeen = clone(opts || {});
      return { ok: true, reason: 'published', series: live };
    },
    saveDraftForFirstPublishOnly: function () {
      live = Object.assign({}, live, { seriesName: NAME18, seriesSubtitle: SUB12 });
      return { ok: true, series: live };
    },
    validateBeforeFirstPublish: bindValidate(page)
  });
  assert(
    'saveDraft 不得更新传给 publishFn 的 baseline',
    publishOptsSeen &&
      publishOptsSeen.titleBaseline.seriesName === NAME19 &&
      publishOptsSeen.titleBaseline.seriesSubtitle === SUB13
  );
})();

(function () {
  var series = buildPublishableSeries({ seriesName: NAME19, seriesSubtitle: SUB13 });
  var live = Object.assign({}, series, { seriesName: NAME18 });
  var publishOptsSeen = null;
  adapter.runCreatePublish({
    seriesId: series.seriesId,
    titleBaseline: { seriesName: NAME19, seriesSubtitle: SUB13 },
    getSeriesById: function () {
      return live;
    },
    inspectPublishState: function () {
      return inspFirst(live);
    },
    publishSeries: function (id, opts) {
      publishOptsSeen = clone(opts || {});
      return { ok: true, reason: 'published', series: live };
    },
    saveDraftForFirstPublishOnly: function () {
      return { ok: true, series: live };
    },
    validateBeforeFirstPublish: function () {
      return { ok: true };
    }
  });
  assert(
    'adapter 不把 latest 自己当 baseline',
    publishOptsSeen.titleBaseline.seriesName === NAME19 &&
      publishOptsSeen.titleBaseline.seriesName !== live.seriesName
  );
})();

(function () {
  var series = buildPublishableSeries({ seriesName: NAME19, seriesSubtitle: SUB13 });
  var resumeOpts = null;
  adapter.runCreatePublish({
    seriesId: series.seriesId,
    titleBaseline: { seriesName: NAME19, seriesSubtitle: SUB13 },
    getSeriesById: function () {
      return series;
    },
    inspectPublishState: function () {
      return {
        ok: true,
        seriesId: series.seriesId,
        series: series,
        hasFrozenPlan: true,
        journalPhase: 'writing_matches',
        journalCorrupt: false,
        sourceDrift: false,
        canRetry: false,
        publishedWithoutJournalDone: false,
        entities: null
      };
    },
    publishSeries: function () {
      assert('resume 路径不得调用 publishFn', false);
      return { ok: false };
    },
    resumePublish: function (id, opts) {
      resumeOpts = clone(opts || {});
      return { ok: true, reason: 'resume_published', series: series };
    }
  });
  assert(
    'resume 不接收 titleBaseline',
    resumeOpts && Object.prototype.hasOwnProperty.call(resumeOpts, 'titleBaseline') === false
  );
})();

(function () {
  var series = Object.assign(buildPublishableSeries(), { lifecycleStatus: 'published' });
  var repairOpts = null;
  adapter.runCreatePublish({
    seriesId: series.seriesId,
    titleBaseline: { seriesName: NAME19, seriesSubtitle: SUB13 },
    getSeriesById: function () {
      return series;
    },
    inspectPublishState: function () {
      return {
        ok: true,
        seriesId: series.seriesId,
        series: series,
        hasFrozenPlan: true,
        journalPhase: 'finalizing',
        journalCorrupt: false,
        sourceDrift: false,
        canRetry: true,
        publishedWithoutJournalDone: true,
        entities: null
      };
    },
    publishSeries: function () {
      assert('repair 路径不得调用 publishFn', false);
      return { ok: false };
    },
    repairHalfPublished: function (id, opts) {
      repairOpts = clone(opts || {});
      return { ok: true, reason: 'repair_published', series: series };
    }
  });
  assert(
    'repair 不接收 titleBaseline',
    repairOpts && Object.prototype.hasOwnProperty.call(repairOpts, 'titleBaseline') === false
  );
})();

(function () {
  var series = Object.assign(buildPublishableSeries(), { lifecycleStatus: 'published' });
  var publishCalled = false;
  var nav = adapter.runCreatePublish({
    seriesId: series.seriesId,
    titleBaseline: { seriesName: NAME19, seriesSubtitle: SUB13 },
    getSeriesById: function () {
      return series;
    },
    inspectPublishState: function () {
      return {
        ok: true,
        seriesId: series.seriesId,
        series: series,
        hasFrozenPlan: true,
        journalPhase: 'done',
        journalCorrupt: false,
        sourceDrift: false,
        canRetry: false,
        publishedWithoutJournalDone: false,
        entities: { ok: true }
      };
    },
    publishSeries: function () {
      publishCalled = true;
      return { ok: true };
    }
  });
  assert(
    'navigate 不调 publishFn 且 outcome 无 titleBaseline',
    nav.ok === true &&
      nav.phase === 'navigate' &&
      publishCalled === false &&
      outcomeHasBaseline(nav) === false
  );
})();

(function () {
  var hSeries = createMemoryAdapter();
  var hIndex = createMemoryAdapter();
  var hJournal = createMemoryAdapter();
  var seriesStore = seriesStoreMod.createSeriesStore(hSeries);
  var stationIndex = seriesStationIndexMod.createSeriesStationIndex(hIndex);
  var journal = seriesPublishJournalMod.createSeriesPublishJournal(hJournal);
  var matchRepo = seriesPublish.createMemoryMatchRepo();
  var fixedNow = new Date(2026, 5, 1, 12, 0, 0, 0).getTime();
  var publisher = seriesPublish.createSeriesPublisher({
    seriesStore: seriesStore,
    stationIndex: stationIndex,
    journal: journal,
    matchRepo: matchRepo,
    now: function () {
      return fixedNow;
    }
  });
  var series = buildPublishableSeries({ seriesName: NAME19, seriesSubtitle: SUB13 });
  var saved = seriesStore.saveDraft(series);
  series = saved.series;
  var page = makePageCtx({ seriesName: NAME19, seriesSubtitle: SUB13 }, series);
  var liveId = series.seriesId;
  var publishOpts = null;
  var outcome = adapter.runCreatePublish({
    seriesId: liveId,
    titleBaseline: page._copySeriesTitleBaselineSnapshot(),
    getSeriesById: function (id) {
      return seriesStore.getSeriesById(id);
    },
    inspectPublishState: function (id) {
      return publisher.inspectPublishState(id);
    },
    publishSeries: function (id, opts) {
      publishOpts = clone(opts || {});
      return publisher.publishSeries(id, opts);
    },
    saveDraftForFirstPublishOnly: function () {
      var cur = seriesStore.getSeriesById(liveId);
      return seriesStore.saveDraft(cur);
    },
    validateBeforeFirstPublish: bindValidate(page)
  });
  assert('真实 plan/publish 历史超长可首次发布', outcome.ok === true, outcome.reason);
  assert(
    '两次校验与 plan 使用同一加载快照',
    publishOpts &&
      publishOpts.titleBaseline.seriesName === NAME19 &&
      publishOpts.titleBaseline.seriesSubtitle === SUB13 &&
      snapshot(publishOpts.titleBaseline) === snapshot(page._copySeriesTitleBaselineSnapshot())
  );
  var stored = seriesStore.getSeriesById(liveId);
  var j = journal.getJournal(liveId);
  assert(
    '持久化 Series/journal 无 titleBaseline 且标题未截断',
    stored &&
      stored.titleBaseline == null &&
      stored.seriesName === NAME19 &&
      stored.seriesSubtitle === SUB13 &&
      j.ok &&
      hasTitleBaselineKey(j.journal, []).length === 0
  );
  assert('真实 outcome 无 titleBaseline', outcomeHasBaseline(outcome) === false);
})();

(function () {
  var series = buildPublishableSeries({ seriesName: '短名', seriesSubtitle: '' });
  var page = makePageCtx({ seriesName: '', seriesSubtitle: '' }, series);
  var v1 = page._validateBeforeFirstPublish(series);
  var v2 = page._validateBeforeFirstPublish(series);
  assert('短标题无超长时双校验仍通过（回归）', v1.ok === true && v2.ok === true);
  var out = runFirstPublish({
    series: series,
    baseline: { seriesName: '', seriesSubtitle: '' }
  });
  assert('短标题 first_publish 仍 save 后 publish', out.saveCalls === 1 && out.publishCalls.length === 1 && out.result.ok);
})();

console.log('');
console.log(
  'seriesCreateFirstPublishTitleBaseline.selftest: ' + passed + ' passed, ' + failed + ' failed'
);
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
