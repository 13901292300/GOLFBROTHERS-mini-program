/**
 * planPublish 可选 titleBaseline（不接页面 / adapter）
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesPublishTitleBaseline.selftest.js
 */

var path = require('path');
var seriesTestPaths = require('./lib/seriesTestPaths.js');
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');

var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStoreMod = require(path.join(utilsDir, 'seriesStore.js'));
var seriesStationIndexMod = require(path.join(utilsDir, 'seriesStationIndex.js'));
var seriesPublishJournalMod = require(seriesTestPaths.util('seriesPublishJournal.js'));
var seriesPublish = require(seriesTestPaths.util('seriesPublish.js'));

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

function createMemoryAdapter() {
  var bag = Object.create(null);
  return {
    getItem: function (key) {
      return { ok: true, value: bag[key] != null ? JSON.parse(JSON.stringify(bag[key])) : null };
    },
    setItem: function (key, value) {
      bag[key] = JSON.parse(JSON.stringify(value));
      return { ok: true };
    },
    _bag: bag
  };
}

var NAME19 = Array(19).fill('名').join('');
var NAME19B = Array(19).fill('改').join('');
var NAME18 = Array(18).fill('新').join('');
var SUB13 = Array(13).fill('副').join('');
var SUB13B = Array(13).fill('换').join('');
var SUB12 = Array(12).fill('标').join('');

function buildPublishableSeries(overrides) {
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
  if (overrides) Object.assign(s, overrides);
  return s;
}

function createHarness() {
  var seriesAdapter = createMemoryAdapter();
  var indexAdapter = createMemoryAdapter();
  var journalAdapter = createMemoryAdapter();
  var seriesStore = seriesStoreMod.createSeriesStore(seriesAdapter);
  var stationIndex = seriesStationIndexMod.createSeriesStationIndex(indexAdapter);
  var journal = seriesPublishJournalMod.createSeriesPublishJournal(journalAdapter);
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
  return {
    seriesStore: seriesStore,
    stationIndex: stationIndex,
    journal: journal,
    matchRepo: matchRepo,
    publisher: publisher,
    fixedNow: fixedNow,
    journalAdapter: journalAdapter,
    seriesAdapter: seriesAdapter
  };
}

function hasTitleBaselineKey(node, acc) {
  if (!node || typeof node !== 'object') return acc;
  if (Object.prototype.hasOwnProperty.call(node, 'titleBaseline')) acc.push(node);
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) hasTitleBaselineKey(node[i], acc);
  } else {
    var keys = Object.keys(node);
    for (var k = 0; k < keys.length; k++) hasTitleBaselineKey(node[keys[k]], acc);
  }
  return acc;
}

function pubHas(result, code) {
  var errors = (result && result.errors) || [];
  return errors.some(function (e) {
    return e.code === code;
  });
}

function saveHistoric(over) {
  var h = createHarness();
  var series = buildPublishableSeries(
    Object.assign({ seriesName: NAME19, seriesSubtitle: SUB13 }, over || {})
  );
  var saved = h.seriesStore.saveDraft(series);
  return { h: h, series: saved.series, saved: saved };
}

function planWith(h, series, options) {
  var beforeSeries = snapshot(series);
  var beforeOpts = snapshot(options == null ? null : options);
  var result = h.publisher.planPublish(series, options);
  assert('plan 不修改输入 series', snapshot(series) === beforeSeries);
  if (options != null) {
    assert('plan 不修改 options/baseline', snapshot(options) === beforeOpts);
  }
  return result;
}

(function () {
  var pack = saveHistoric();
  var planned = planWith(pack.h, pack.series, { now: pack.h.fixedNow });
  assert(
    '无 context 的历史超长仍被 planPublish 拒绝',
    planned.ok === false &&
      planned.reason === 'publish_invalid' &&
      pubHas(planned, 'series_name_length') &&
      pubHas(planned, 'series_subtitle_length')
  );
})();

(function () {
  var pack = saveHistoric();
  var options = {
    now: pack.h.fixedNow,
    titleBaseline: { seriesName: NAME19, seriesSubtitle: SUB13 }
  };
  var planned = planWith(pack.h, pack.series, options);
  assert('匹配 baseline 的历史超长可生成 plan', planned.ok === true, planned.reason);
  var jHits = hasTitleBaselineKey(planned.journal, []);
  assert('journal 无 titleBaseline', jHits.length === 0);
  var storedJ = pack.h.journal.getJournal(pack.series.seriesId);
  assert(
    '落盘 journal 无 titleBaseline',
    storedJ.ok && hasTitleBaselineKey(storedJ.journal, []).length === 0
  );
  var storedSeries = pack.h.seriesStore.getSeriesById(pack.series.seriesId);
  assert(
    'Series 无 titleBaseline 且标题未被截断',
    storedSeries &&
      storedSeries.titleBaseline == null &&
      storedSeries.seriesName === NAME19 &&
      storedSeries.seriesSubtitle === SUB13
  );
  var payloadHits = [];
  (planned.journal.rounds || []).forEach(function (r) {
    hasTitleBaselineKey(r.matchPayload, payloadHits);
  });
  assert('station matchPayload 无 titleBaseline', payloadHits.length === 0);
})();

(function () {
  var pack = saveHistoric({ seriesName: NAME19B, seriesSubtitle: SUB13 });
  var planned = planWith(pack.h, pack.series, {
    now: pack.h.fixedNow,
    titleBaseline: { seriesName: NAME19, seriesSubtitle: SUB13 }
  });
  assert(
    '只改名称为新的 19 字仍拒',
    planned.ok === false &&
      planned.reason === 'publish_invalid' &&
      pubHas(planned, 'series_name_length') &&
      !pubHas(planned, 'series_subtitle_length')
  );
})();

(function () {
  var pack = saveHistoric({ seriesName: NAME19, seriesSubtitle: SUB13B });
  var planned = planWith(pack.h, pack.series, {
    now: pack.h.fixedNow,
    titleBaseline: { seriesName: NAME19, seriesSubtitle: SUB13 }
  });
  assert(
    '只改副标题为新的 13 字仍拒',
    planned.ok === false &&
      planned.reason === 'publish_invalid' &&
      pubHas(planned, 'series_subtitle_length') &&
      !pubHas(planned, 'series_name_length')
  );
})();

(function () {
  var pack = saveHistoric({ seriesName: NAME18, seriesSubtitle: SUB13 });
  var planned = planWith(pack.h, pack.series, {
    now: pack.h.fixedNow,
    titleBaseline: { seriesName: NAME19, seriesSubtitle: SUB13 }
  });
  assert('只改名称为合法值，未改超长副标题可通过', planned.ok === true, planned.reason);
})();

(function () {
  var pack = saveHistoric({ seriesName: NAME19, seriesSubtitle: SUB12 });
  var planned = planWith(pack.h, pack.series, {
    now: pack.h.fixedNow,
    titleBaseline: { seriesName: NAME19, seriesSubtitle: SUB13 }
  });
  assert('只改副标题为合法值，未改超长名称可通过', planned.ok === true, planned.reason);
})();

(function () {
  var pack = saveHistoric({ seriesName: '', seriesSubtitle: '' });
  var planned = planWith(pack.h, pack.series, {
    now: pack.h.fixedNow,
    titleBaseline: { seriesName: '', seriesSubtitle: '' }
  });
  assert(
    '空名称即使 baseline 为空仍拒',
    planned.ok === false &&
      planned.reason === 'publish_invalid' &&
      pubHas(planned, 'series_name_required')
  );
})();

(function () {
  var series = buildPublishableSeries({
    seriesName: NAME19,
    seriesSubtitle: SUB13,
    participants: [
      seriesModel.createParticipant({
        kind: 'team',
        sourceTeamId: 't1',
        seriesParticipantId: 'team:t1',
        nameSnapshot: '甲队'
      })
    ]
  });
  var h = createHarness();
  var saved = h.seriesStore.saveDraft(series);
  var planned = planWith(h, saved.series, {
    now: h.fixedNow,
    titleBaseline: { seriesName: NAME19, seriesSubtitle: SUB13 }
  });
  assert(
    '其他结构错误不会因 baseline 被放行',
    planned.ok === false &&
      planned.reason === 'publish_invalid' &&
      pubHas(planned, 'participants_min')
  );
})();

(function () {
  var pack = saveHistoric();
  var planned = planWith(pack.h, pack.series, {
    now: pack.h.fixedNow,
    titleBaseline: { seriesName: NAME19, seriesSubtitle: SUB13 }
  });
  assert('resume 前 plan 成功', planned.ok === true, planned.reason);
  var published = pack.h.publisher.publishSeries(pack.series.seriesId, {
    now: pack.h.fixedNow
  });
  assert(
    'frozen 执行/resume 不需再传 titleBaseline',
    published.ok === true,
    published.reason
  );
  var resumed = pack.h.publisher.resumePublish(pack.series.seriesId, {
    now: pack.h.fixedNow
  });
  assert(
    'resume 回归',
    resumed.ok === true,
    resumed.reason
  );
  var repaired = pack.h.publisher.repairHalfPublished(pack.series.seriesId, {
    now: pack.h.fixedNow
  });
  assert('repair 回归', repaired.ok === true, repaired.reason);
  var after = pack.h.seriesStore.getSeriesById(pack.series.seriesId);
  assert(
    '发布后 Series/journal 仍无 titleBaseline',
    after &&
      after.titleBaseline == null &&
      hasTitleBaselineKey(pack.h.journal.getJournal(pack.series.seriesId).journal, []).length ===
        0
  );
})();

console.log('');
console.log('seriesPublishTitleBaseline.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
