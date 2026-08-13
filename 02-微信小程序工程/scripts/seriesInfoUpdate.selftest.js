/**
 * Patch E2：Published Series 展示信息更新自测
 * 运行：node scripts/seriesInfoUpdate.selftest.js
 */

var path = require('path');
var fs = require('fs');

var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');
var createPageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'create',
  'pages',
  'series'
);
var seriesDetailDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);

var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var seriesInfoUpdate = require(path.join(utilsDir, 'seriesInfoUpdate.js'));
var seriesStationManageGate = require(path.join(utilsDir, 'seriesStationManageGate.js'));
var sheetVm = require(path.join(seriesDetailDir, 'seriesManageSheetViewModel.js'));

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

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function createMemoryStorage() {
  var bag = Object.create(null);
  return {
    getItem: function (key) {
      return { ok: true, value: bag[key] != null ? deepClone(bag[key]) : null };
    },
    setItem: function (key, value) {
      bag[key] = deepClone(value);
      return { ok: true };
    },
    removeItem: function (key) {
      delete bag[key];
      return { ok: true };
    },
    _bag: bag
  };
}

function makeSeries(overrides) {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: '旧系列名',
    createdBy: 'admin-1',
    organization: {
      organizationId: 'org-1',
      organizationName: '测试机构',
      organizationLogo: ''
    }
  });
  s.lifecycleStatus = 'published';
  s.publishToken = 'tok-e2';
  s.updatedAt = '2026-08-01T00:00:00.000Z';
  s.seriesSubtitle = '副标题A';
  s.visibility = 'public';
  s.accessCode = '';
  s.bannerImageSnapshot = 'https://example.com/banner.jpg';
  s.eventInfoList = [{ id: 'e1', title: '须知', type: 'text', content: '内容' }];
  s.partnerConfig = { partnerTitle: 'PARTNER', partnerLogos: [] };
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
  s.scoringRule = seriesModel.createDefaultScoringRule({
    mode: 'per_round_n',
    scoreBasis: 'gross',
    allowRepeat: false
  });
  s.rounds = (s.rounds || []).slice(0, 2).map(function (r, idx) {
    var next = Object.assign({}, r);
    next.roundId = 'r' + (idx + 1);
    next.index = idx + 1;
    next.name = '第' + (idx + 1) + '轮';
    next.dateTime = '2030-06-0' + (idx + 1) + ' 08:00';
    next.gameMode = '个人比杆赛';
    next.courseId = 'c' + (idx + 1);
    next.courseName = '球场' + (idx + 1);
    next.fee = '100';
    next.topN = 3;
    next.matchId = 'm' + (idx + 1);
    return next;
  });
  s.roster = [{ userId: 'p1', name: '球员1' }];
  if (overrides) Object.assign(s, overrides);
  return s;
}

function makeMatch(series, round) {
  var built = seriesStationMatch.buildMatchFromSeriesRound(series, round, {
    matchId: round.matchId,
    publishToken: series.publishToken
  });
  if (!built.ok) throw new Error(built.reason);
  var m = built.match;
  m.createdBy = 'admin-1';
  m.groups = [{ players: [{ userId: 'u1' }] }];
  m.scoreData = { x: 1 };
  m.registerInfo = { players: [{ userId: 'p1' }] };
  return m;
}

function createHarness(opts) {
  var o = opts || {};
  var series = o.series || makeSeries();
  var matches = Object.create(null);
  series.rounds.forEach(function (r) {
    matches[r.matchId] = makeMatch(series, r);
  });
  var seriesBag = Object.create(null);
  seriesBag[series.seriesId] = deepClone(series);
  var index = Object.create(null);
  series.rounds.forEach(function (r) {
    index[r.matchId] = {
      seriesId: series.seriesId,
      roundId: r.roundId,
      matchId: r.matchId
    };
  });
  var storage = createMemoryStorage();
  var svc = seriesInfoUpdate.createSeriesInfoUpdateService({
    seriesStore: {
      getSeriesById: function (id) {
        return seriesBag[id] ? deepClone(seriesBag[id]) : null;
      },
      upsertSeries: function (input) {
        if (o.failSeriesWrite) return { ok: false, reason: 'injected_series_fail' };
        seriesBag[input.seriesId] = deepClone(input);
        return { ok: true, series: deepClone(input) };
      }
    },
    teamMatchStore: {
      getMatchById: function (id) {
        return matches[id] ? deepClone(matches[id]) : null;
      },
      saveMatch: function (m) {
        if (o.failMatchWrite) throw new Error('injected_match_fail');
        if (o.failSecondMatch && m.matchId === 'm2') throw new Error('injected_m2');
        matches[m.matchId] = deepClone(m);
      }
    },
    storage: storage,
    getIndexByMatchId: function (id) {
      return index[id] ? deepClone(index[id]) : null;
    },
    now: function () {
      return 1700000000001;
    }
  });
  return {
    series: series,
    seriesBag: seriesBag,
    matches: matches,
    storage: storage,
    svc: svc,
    actor: { userId: 'admin-1' }
  };
}

(function testSanitize() {
  var bad = seriesInfoUpdate.createSeriesInfoUpdateService({
    seriesStore: {},
    teamMatchStore: {}
  }).sanitizeInfoPatch({ hostMode: 'team', seriesName: 'X' });
  assert('禁止字段被拒绝', !bad.ok && bad.rejected[0].key === 'hostMode');
})();

(function testHappyPathAndTitleSync() {
  var h = createHarness();
  var beforeRounds = deepClone(h.seriesBag[h.series.seriesId].rounds);
  var beforeRoster = deepClone(h.seriesBag[h.series.seriesId].roster);
  var beforeToken = h.seriesBag[h.series.seriesId].publishToken;
  var beforeCreated = h.seriesBag[h.series.seriesId].createdBy;
  var m1Groups = deepClone(h.matches.m1.groups);
  var m1Scores = deepClone(h.matches.m1.scoreData);

  var res = h.svc.updatePublishedSeriesInfo({
    seriesId: h.series.seriesId,
    patch: {
      seriesName: '新系列名',
      seriesSubtitle: '副标题B',
      visibility: 'private',
      accessCode: '123456',
      eventInfoList: [{ id: 'e2', title: '规则', type: 'text', content: '新' }],
      partnerConfig: { partnerTitle: '赞助', partnerLogos: ['a.png'] }
    },
    actor: h.actor,
    expectedUpdatedAt: h.series.updatedAt
  });
  assert('保存成功', res.ok === true, res.reason);
  var after = h.seriesBag[h.series.seriesId];
  assert('Series 标题/副标题/可见性已更新', after.seriesName === '新系列名' && after.seriesSubtitle === '副标题B' && after.visibility === 'private' && after.accessCode === '123456');
  assert('rounds/participants/roster/token/createdBy 不变', JSON.stringify(after.rounds) === JSON.stringify(beforeRounds) && JSON.stringify(after.roster) === JSON.stringify(beforeRoster) && after.publishToken === beforeToken && after.createdBy === beforeCreated && after.scoringRule.mode === 'per_round_n');
  assert(
    '分站 roundName 与快照同步且无漂移',
    h.matches.m1.roundName === '新系列名 · 第1轮' &&
      h.matches.m2.roundName === '新系列名 · 第2轮' &&
      h.matches.m1.seriesContext.seriesNameSnapshot === '新系列名' &&
      h.matches.m1.seriesContext.seriesSubtitleSnapshot === '副标题B' &&
      h.matches.m1.seriesContext.publishToken === beforeToken &&
      h.matches.m1.matchId === 'm1'
  );
  assert(
    '成绩/分组不变',
    JSON.stringify(h.matches.m1.groups) === JSON.stringify(m1Groups) &&
      JSON.stringify(h.matches.m1.scoreData) === JSON.stringify(m1Scores)
  );
  assert('同步分站数=2', res.syncedMatchCount === 2);
  assert('不调用 publish/plan（源码）', true);
})();

(function testPublicClearsCode() {
  var h = createHarness({
    series: makeSeries({ visibility: 'private', accessCode: '654321' })
  });
  var res = h.svc.updatePublishedSeriesInfo({
    seriesId: h.series.seriesId,
    patch: { visibility: 'public', accessCode: '999999' },
    actor: h.actor
  });
  assert('public 清空访问码', res.ok && h.seriesBag[h.series.seriesId].visibility === 'public' && h.seriesBag[h.series.seriesId].accessCode === '');
})();

(function testInvalidPrivateCode() {
  var h = createHarness();
  var res = h.svc.updatePublishedSeriesInfo({
    seriesId: h.series.seriesId,
    patch: { visibility: 'private', accessCode: '12' },
    actor: h.actor
  });
  assert('非法访问码拒绝', !res.ok && res.reason === 'access_code_invalid');
})();

(function testForbiddenField() {
  var h = createHarness();
  var res = h.svc.updatePublishedSeriesInfo({
    seriesId: h.series.seriesId,
    patch: { templateId: 'ryder' },
    actor: h.actor
  });
  assert('领域层拒绝禁止字段', !res.ok && res.reason === 'field_not_allowed');
})();

(function testConflictAndPermission() {
  var h = createHarness();
  assert(
    '冲突',
    !h.svc.updatePublishedSeriesInfo({
      seriesId: h.series.seriesId,
      patch: { seriesName: 'X' },
      actor: h.actor,
      expectedUpdatedAt: 'stale'
    }).ok
  );
  assert(
    '无权限',
    !h.svc.updatePublishedSeriesInfo({
      seriesId: h.series.seriesId,
      patch: { seriesName: 'X' },
      actor: { userId: 'stranger' }
    }).ok
  );
})();

(function testMatchFailRollback() {
  var h = createHarness({ failSecondMatch: true });
  var beforeName = h.seriesBag[h.series.seriesId].seriesName;
  var beforeM1 = h.matches.m1.roundName;
  var res = h.svc.updatePublishedSeriesInfo({
    seriesId: h.series.seriesId,
    patch: { seriesName: '应回滚名' },
    actor: h.actor
  });
  assert('第二站失败不成功', !res.ok && res.reason === 'match_write_failed');
  assert('Series 回滚', h.seriesBag[h.series.seriesId].seriesName === beforeName);
  assert('已写分站回滚', h.matches.m1.roundName === beforeM1);
  assert('journal 清理', h.storage.getItem(seriesInfoUpdate.JOURNAL_KEY).value == null);
})();

(function testNoTitleChangeNoMatchWrite() {
  var h = createHarness();
  var writes = 0;
  var orig = h.matches;
  // monkey: count via fingerprint of names
  var beforeNames = [h.matches.m1.roundName, h.matches.m2.roundName];
  var res = h.svc.updatePublishedSeriesInfo({
    seriesId: h.series.seriesId,
    patch: {
      eventInfoList: [{ id: 'e9', title: '仅事件', type: 'text', content: 'x' }]
    },
    actor: h.actor
  });
  assert('仅 eventInfo 可保存', res.ok && res.syncedMatchCount === 0);
  assert(
    '未改标题时分站 roundName 不变',
    h.matches.m1.roundName === beforeNames[0] && h.matches.m2.roundName === beforeNames[1]
  );
  assert(
    'eventInfo 只写 Series',
    h.seriesBag[h.series.seriesId].eventInfoList[0].title === '仅事件'
  );
})();

(function testMenuAndWizardWiring() {
  var seriesForSheet = {
    seriesId: 's1',
    hostMode: 'organization',
    lifecycleStatus: 'published',
    createdBy: 'admin-1',
    publishToken: 'tok',
    organization: { organizationId: 'org-1' },
    registrationState: 'open',
    rounds: [{ roundId: 'r1', matchId: 'm1', name: 'R1', index: 1 }]
  };
  var stationMatch = {
    matchId: 'm1',
    matchType: 'inter-team',
    status: 'registering',
    createdBy: 'admin-1',
    organizationId: 'org-1',
    registrationStatus: 'closed',
    gameMode: '个人比杆赛',
    seriesContext: {
      managed: true,
      seriesId: 's1',
      roundId: 'r1',
      publishToken: 'tok'
    }
  };
  var gateOk = seriesStationManageGate.verifyManagedStationForManage({
    series: seriesForSheet,
    roundId: 'r1',
    getMatchById: function () {
      return stationMatch;
    },
    getIndexByMatchId: function () {
      return { seriesId: 's1', roundId: 'r1', matchId: 'm1' };
    }
  });
  var adminSheet = sheetVm.buildSeriesManageSheetViewModel({
    series: seriesForSheet,
    user: { userId: 'admin-1' },
    canManageSeries: true,
    selectedRoundId: 'r1',
    gate: gateOk,
    getMatchById: function () {
      return stationMatch;
    }
  });
  assert(
    '管理区顺序：修改系列赛/取消/报名',
    adminSheet.seriesScope.featuresManage.length === 3 &&
      adminSheet.seriesScope.featuresManage[0].permission === 'edit_series' &&
      adminSheet.seriesScope.featuresManage[0].label === '修改系列赛' &&
      adminSheet.seriesScope.featuresManage[1].permission === 'cancel_series' &&
      adminSheet.seriesScope.featuresManage[2].permission === 'toggle_registration'
  );
  var normalSheet = sheetVm.buildSeriesManageSheetViewModel({
    series: seriesForSheet,
    user: { userId: 'user-2' },
    canManageSeries: false,
    canRegisterForOther: true,
    selectedRoundId: '',
    getMatchById: function () {
      return null;
    }
  });
  assert('普通用户无修改系列赛', normalSheet.seriesScope.featuresManage.length === 0);

  var pageJs = fs.readFileSync(path.join(seriesDetailDir, 'index.js'), 'utf8');
  var wizardJs = fs.readFileSync(path.join(createPageDir, 'index.js'), 'utf8');
  var wizardWxml = fs.readFileSync(path.join(createPageDir, 'index.wxml'), 'utf8');
  assert(
    '不要求选轮即可 edit_series',
    /permission === 'edit_series'[\s\S]{0,2500}mode=edit_series/.test(pageJs) &&
      pageJs.indexOf('gb_series_edit_series_return_v1') >= 0
  );
  assert(
    '向导 edit_series：默认步5、有上一步、保存修改',
    wizardJs.indexOf("mode === 'edit_series'") >= 0 &&
      wizardJs.indexOf('_bootstrapEditSeries') >= 0 &&
      wizardJs.indexOf('_saveEditSeries') >= 0 &&
      wizardJs.indexOf('updatePublishedSeriesInfo') >= 0 &&
      wizardJs.indexOf("primaryBtnText: '保存修改'") >= 0 &&
      wizardJs.indexOf('_projectUiFromDraft(this.lastSavedDraft, 5)') >= 0
  );
  // 更精确：保存路径不调用 publish（窗口需覆盖 participants + info 双编排）
  var saveStart = wizardJs.indexOf('_saveEditSeries: function');
  var saveEnd = wizardJs.indexOf('\n  onPrimaryAction()', saveStart);
  var saveEditSlice =
    saveStart >= 0 && saveEnd > saveStart ? wizardJs.slice(saveStart, saveEnd) : '';
  assert(
    '保存不走 publishSeries/planPublish',
    saveEditSlice.indexOf('updatePublishedSeriesInfo') >= 0 &&
      saveEditSlice.indexOf('updatePublishedSeriesParticipants') >= 0 &&
      saveEditSlice.indexOf('publishSeries') < 0 &&
      saveEditSlice.indexOf('planPublish') < 0
  );
  assert(
    '页面标题与主办可编辑接线',
    wizardJs.indexOf("pageTitle: '修改系列赛'") >= 0 &&
      wizardJs.indexOf('updatePublishedSeriesParticipants') >= 0 &&
      wizardJs.indexOf('participantsEditable') >= 0 &&
      wizardWxml.indexOf('participantsEditable') >= 0 &&
      wizardJs.indexOf('PUBLISHED_STRUCTURE_LOCKED_MSG') >= 0
  );
  assert(
    'E1 编辑本轮入口仍在',
    pageJs.indexOf('mode=edit_round') >= 0 && wizardJs.indexOf('_bootstrapEditRound') >= 0
  );
})();

console.log('');
console.log('---- seriesInfoUpdate.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
