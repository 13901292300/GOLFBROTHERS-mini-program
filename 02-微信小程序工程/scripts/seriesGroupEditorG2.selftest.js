/**
 * Patch G2-R：Series 赛程分组改为 navigateTo 独立 group-editor
 * 运行：node scripts/seriesGroupEditorG2.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var root = path.join(__dirname, '..');
var utilsDir = path.join(root, 'miniprogram', 'utils');
var pageDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);
var groupEditorDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament-manage',
  'pages',
  'group-editor'
);
var detailDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'detail'
);

var scheduleWrite = require(seriesTestPaths.util('seriesScheduleGroupWrite.js'));
var scheduleVm = require(path.join(pageDir, 'seriesScheduleViewModel.js'));
var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));

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

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function makeSeries() {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: 'G2R系列',
    createdBy: 'admin-1',
    organization: {
      organizationId: 'org-1',
      organizationName: '机构',
      organizationLogo: ''
    }
  });
  s.lifecycleStatus = 'published';
  s.publishToken = 'tok-g2r';
  s.participants = [
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
  s.rounds = (s.rounds || []).slice(0, 2).map(function (r, idx) {
    return Object.assign({}, r, {
      roundId: 'r' + (idx + 1),
      index: idx + 1,
      name: '第' + (idx + 1) + '轮',
      dateTime: '2030-06-0' + (idx + 1) + ' 08:00',
      gameMode: '个人比杆赛',
      courseId: 'c' + (idx + 1),
      courseName: '球场' + (idx + 1),
      fee: '0',
      matchId: 'm-g2r-' + (idx + 1)
    });
  });
  return s;
}

function makeMatch(series, round, status) {
  var built = seriesStationMatch.buildMatchFromSeriesRound(series, round, {
    matchId: round.matchId,
    publishToken: series.publishToken
  });
  if (!built.ok) throw new Error(built.reason);
  var m = built.match;
  m.status = status || 'registering';
  m.createdBy = 'admin-1';
  m.groups = [];
  return m;
}

function buildVm(series, match, canManage) {
  var bag = {};
  bag[match.matchId] = match;
  return scheduleVm.buildSeriesScheduleViewModel({
    series: series,
    selectedRoundId: 'r1',
    getMatchById: function (id) {
      return bag[id] || null;
    },
    getIndexByMatchId: function () {
      return {
        seriesId: series.seriesId,
        roundId: 'r1',
        matchId: match.matchId
      };
    },
    canManageGroups: canManage !== false,
    canStartMatch: true,
    lifecycleAccess: { lifecycleStatus: 'published' }
  });
}

(function testNoSheetAndNavigateWiring() {
  var pageWxml = read(path.join(pageDir, 'index.wxml'));
  var pageJs = read(path.join(pageDir, 'index.js'));
  var pageJson = read(path.join(pageDir, 'index.json'));
  var pageWxss = read(path.join(pageDir, 'index.wxss'));
  var editorJs = read(path.join(groupEditorDir, 'index.js'));
  var detailJs = read(path.join(detailDir, 'index.js'));

  assert(
    'Series 页面无分组编辑 bottom sheet',
    pageWxml.indexOf('scheduleEditSheetVisible') < 0 &&
      pageWxml.indexOf('<tournament-group-editor-view') < 0 &&
      pageWxml.indexOf('scheduleDraftCards') < 0 &&
      pageWxml.indexOf('scheduleCandidateSheetVisible') < 0 &&
      pageWxml.indexOf('scheduleAffiliationSheetVisible') < 0 &&
      pageWxml.indexOf('scheduleManualSheetVisible') < 0 &&
      pageWxml.indexOf('scheduleGroupDeleteModalVisible') < 0 &&
      pageJson.indexOf('tournament-group-editor-view') < 0 &&
      pageWxss.indexOf('schedule-edit-sheet') < 0
  );
  assert(
    '不恢复 schedule-draft-*',
    pageWxml.indexOf('schedule-draft-') < 0 &&
      pageWxss.indexOf('schedule-draft-') < 0 &&
      pageJs.indexOf('schedule-draft-') < 0
  );
  assert(
    'CTA 导航到 group-editor 并带 Series 来源参数',
    pageJs.indexOf('openScheduleGroupEditor') >= 0 &&
      pageJs.indexOf('/subpackages/tournament-manage/pages/group-editor/index') >= 0 &&
      pageJs.indexOf('fromSeries=1') >= 0 &&
      pageJs.indexOf('gb_series_group_editor_return_v1') >= 0 &&
      pageJs.indexOf('_verifyScheduleStationForGroupEditor') >= 0 &&
      pageJs.indexOf('_resolveScheduleGroupEditorMode') >= 0 &&
      pageJs.indexOf('_consumeGroupEditorReturnContext') >= 0
  );
  assert(
    '异常不导航：统一文案 本轮比赛数据异常',
    pageJs.indexOf('本轮比赛数据异常') >= 0 &&
      scheduleWrite.STATION_DATA_INVALID_MSG === '本轮比赛数据异常' &&
      typeof scheduleWrite.verifySeriesContext === 'function'
  );
  assert(
    'group-editor 识别 fromSeries 且仍走 group-pick',
    editorJs.indexOf('_fromSeries') >= 0 &&
      editorJs.indexOf('_touchSeriesReturnContext') >= 0 &&
      editorJs.indexOf('/subpackages/tournament-manage/pages/group-pick/') >= 0 &&
      editorJs.indexOf('teamMatchStore.saveMatch') >= 0
  );
  assert(
    '普通队际赛仍走独立 group-editor',
    detailJs.indexOf('onOpenGroupEditor') >= 0 &&
      detailJs.indexOf('/subpackages/tournament-manage/pages/group-editor/index') >= 0
  );
  assert(
    'Series 页不再直接 saveStationGroups',
    pageJs.indexOf('saveStationGroups') < 0 &&
      pageJs.indexOf('startStationRound') >= 0
  );
})();

(function testModeProjection() {
  var series = makeSeries();
  var empty = makeMatch(series, series.rounds[0], 'registering');
  var filled = makeMatch(series, series.rounds[0], 'registering');
  filled.groups = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [{ position: 1, userId: 'u1' }]
    }
  ];
  var live = makeMatch(series, series.rounds[0], 'ongoing');
  live.groups = filled.groups.slice();

  var vmEmpty = buildVm(series, empty);
  var vmFilled = buildVm(series, filled);
  var vmLive = buildVm(series, live);

  assert(
    '无组 CTA 可见且文案=开始分组',
    vmEmpty.cta.showEditGroups === true && vmEmpty.cta.editGroupsLabel === '开始分组'
  );
  assert(
    '有组 CTA 文案=修改分组',
    vmFilled.cta.showEditGroups === true && vmFilled.cta.editGroupsLabel === '修改分组'
  );
  assert(
    'LIVE 出发表复用进入自己小组，不再用 Series 专属开始/修改分组',
    vmLive.cta.showEnterMyGroupEligible === true &&
      vmLive.cta.showEditGroups === false &&
      vmLive.cta.enterMyGroupLabel === '快速进入自己的小组 ›' &&
      vmLive.panelMode === 'tee' &&
      vmLive.hasGroups === true
  );

  // 镜像页面 mode 解析：create / edit / live
  function resolveMode(match, hasGroups) {
    var status = String((match && match.status) || '').toLowerCase();
    if (status === 'ongoing') return 'live';
    return hasGroups ? 'edit' : 'create';
  }
  assert('mode create', resolveMode(empty, false) === 'create');
  assert('mode edit', resolveMode(filled, true) === 'edit');
  assert('mode live', resolveMode(live, true) === 'live');
})();

(function testVerifyContextFails() {
  var series = makeSeries();
  var match = makeMatch(series, series.rounds[0]);
  var ok = scheduleWrite.verifySeriesContext(match, series, {
    roundId: 'r1',
    getIndexByMatchId: function () {
      return {
        seriesId: series.seriesId,
        roundId: 'r1',
        matchId: match.matchId
      };
    }
  });
  assert('正常 context 通过', ok.ok === true);

  var badToken = deepClone(match);
  badToken.seriesContext.publishToken = 'wrong';
  var tok = scheduleWrite.verifySeriesContext(badToken, series, {
    roundId: 'r1',
    getIndexByMatchId: function () {
      return {
        seriesId: series.seriesId,
        roundId: 'r1',
        matchId: match.matchId
      };
    }
  });
  assert(
    'token 不一致拒绝',
    !tok.ok && tok.message === '本轮比赛数据异常'
  );

  var badIndex = scheduleWrite.verifySeriesContext(match, series, {
    roundId: 'r1',
    getIndexByMatchId: function () {
      return { seriesId: 'x', roundId: 'r1', matchId: match.matchId };
    }
  });
  assert(
    'index 不一致拒绝',
    !badIndex.ok && badIndex.message === '本轮比赛数据异常'
  );

  var unmanaged = deepClone(match);
  unmanaged.seriesContext.managed = false;
  var um = scheduleWrite.verifySeriesContext(unmanaged, series, {
    roundId: 'r1',
    getIndexByMatchId: function () {
      return {
        seriesId: series.seriesId,
        roundId: 'r1',
        matchId: match.matchId
      };
    }
  });
  assert('非 managed 拒绝', !um.ok && um.message === '本轮比赛数据异常');
})();

(function testWriteModuleStillPublicButNotPageSheetPath() {
  assert(
    '公共 saveStationGroups 仍存在（非页内 sheet 专用）',
    typeof scheduleWrite.saveStationGroups === 'function' &&
      typeof scheduleWrite.startStationRound === 'function'
  );
  // 保存只动当前 match，不写 roster / 他轮
  var series = makeSeries();
  var matches = Object.create(null);
  series.rounds.forEach(function (r) {
    matches[r.matchId] = makeMatch(series, r);
  });
  var rosterBefore = JSON.stringify(series.roster || []);
  var draft = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        {
          position: 1,
          userId: 'u1',
          displayName: '甲1',
          affiliationId: 't1',
          matchTeamId: 't1',
          groupId: 't1',
          seriesParticipantId: 'team:t1'
        },
        { position: 2, userId: '' },
        { position: 3, userId: '' },
        { position: 4, userId: '' }
      ]
    }
  ];
  var res = scheduleWrite.saveStationGroups({
    matchId: 'm-g2r-1',
    series: series,
    roundId: 'r1',
    groupDraft: draft,
    getMatchById: function (id) {
      return matches[id] ? deepClone(matches[id]) : null;
    },
    saveMatch: function (m) {
      matches[m.matchId] = deepClone(m);
    },
    getIndexByMatchId: function (id) {
      if (id === 'm-g2r-1') {
        return { seriesId: series.seriesId, roundId: 'r1', matchId: 'm-g2r-1' };
      }
      return { seriesId: series.seriesId, roundId: 'r2', matchId: 'm-g2r-2' };
    }
  });
  assert('saveStationGroups 仍可写当前轮', res.ok === true, res.reason + ' ' + res.message);
  assert(
    '不写 Series.roster 且不影响其他轮',
    JSON.stringify(series.roster || []) === rosterBefore &&
      matches['m-g2r-1'].groups.length === 1 &&
      matches['m-g2r-2'].groups.length === 0
  );
})();

console.log('');
console.log('---- seriesGroupEditorG2.selftest (G2-R) ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
