/**
 * Patch G1：分组编辑共享视图抽取 + Series CTA 文案（G2-R 后仍须保持）
 * 运行：node scripts/seriesGroupEditorG1.selftest.js
 */

var path = require('path');
var fs = require('fs');

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
  'tournament',
  'pages',
  'group-editor'
);
var sharedViewDir = path.join(
  root,
  'miniprogram',
  'components',
  'tournament-group-editor-view'
);

var scheduleVm = require(path.join(pageDir, 'seriesScheduleViewModel.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));

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

function makeSeries() {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: 'G1系列',
    createdBy: 'admin-1',
    organization: {
      organizationId: 'org-1',
      organizationName: '机构',
      organizationLogo: ''
    }
  });
  s.lifecycleStatus = 'published';
  s.publishToken = 'tok-g1';
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
  s.rounds = (s.rounds || []).slice(0, 1).map(function (r) {
    return Object.assign({}, r, {
      roundId: 'r1',
      index: 1,
      name: '第1轮',
      dateTime: '2030-06-01 08:00',
      gameMode: '个人比杆赛',
      courseId: 'c1',
      courseName: '球场1',
      fee: '0',
      matchId: 'm-g1'
    });
  });
  return s;
}

function makeMatch(series, withGroups) {
  var round = series.rounds[0];
  var built = seriesStationMatch.buildMatchFromSeriesRound(series, round, {
    matchId: round.matchId,
    publishToken: series.publishToken
  });
  if (!built.ok) throw new Error(built.reason);
  var m = built.match;
  m.status = 'registering';
  m.createdBy = 'admin-1';
  m.groups = withGroups
    ? [
        {
          groupId: 'g1',
          groupName: '第1组',
          players: [
            { position: 1, userId: 'u1' },
            { position: 2, userId: '' },
            { position: 3, userId: '' },
            { position: 4, userId: '' }
          ]
        }
      ]
    : [];
  return m;
}

(function testCtaLabels() {
  var series = makeSeries();
  var emptyMatch = makeMatch(series, false);
  var filledMatch = makeMatch(series, true);
  var bag = { 'm-g1': emptyMatch };
  var vmEmpty = scheduleVm.buildSeriesScheduleViewModel({
    series: series,
    selectedRoundId: 'r1',
    getMatchById: function (id) {
      return bag[id] || null;
    },
    getIndexByMatchId: function () {
      return { seriesId: series.seriesId, roundId: 'r1', matchId: 'm-g1' };
    },
    canManageGroups: true,
    canStartMatch: true,
    lifecycleAccess: { lifecycleStatus: 'published' }
  });
  assert(
    '无正式分组 CTA=开始分组',
    vmEmpty.cta.showEditGroups === true &&
      vmEmpty.cta.editGroupsLabel === '开始分组' &&
      vmEmpty.hasGroups === false
  );

  bag['m-g1'] = filledMatch;
  var vmFilled = scheduleVm.buildSeriesScheduleViewModel({
    series: series,
    selectedRoundId: 'r1',
    getMatchById: function (id) {
      return bag[id] || null;
    },
    getIndexByMatchId: function () {
      return { seriesId: series.seriesId, roundId: 'r1', matchId: 'm-g1' };
    },
    canManageGroups: true,
    canStartMatch: true,
    lifecycleAccess: { lifecycleStatus: 'published' }
  });
  assert(
    '有正式分组 CTA=修改分组',
    vmFilled.cta.showEditGroups === true &&
      vmFilled.cta.editGroupsLabel === '修改分组' &&
      vmFilled.hasGroups === true
  );
})();

(function testSourceGuards() {
  var seriesWxml = read(path.join(pageDir, 'index.wxml'));
  var seriesJson = read(path.join(pageDir, 'index.json'));
  var editorWxml = read(path.join(groupEditorDir, 'index.wxml'));
  var editorJson = read(path.join(groupEditorDir, 'index.json'));
  var editorJs = read(path.join(groupEditorDir, 'index.js'));
  var sharedWxml = read(path.join(sharedViewDir, 'index.wxml'));
  var sharedJs = read(path.join(sharedViewDir, 'index.js'));

  assert(
    'Series 不再出现「编辑分组」',
    seriesWxml.indexOf('编辑分组') < 0 &&
      seriesWxml.indexOf('schedule.cta.editGroupsLabel') >= 0
  );
  assert(
    'Series 通过 CTA 打开独立 group-editor（G2-R）',
    seriesWxml.indexOf('openScheduleGroupEditor') >= 0 &&
      seriesWxml.indexOf('scheduleEditSheetVisible') < 0 &&
      seriesJson.indexOf('tournament-group-editor-view') < 0
  );
  assert(
    'group-editor 消费共享视图',
    editorJson.indexOf('tournament-group-editor-view') >= 0 &&
      editorWxml.indexOf('<tournament-group-editor-view') >= 0 &&
      editorWxml.indexOf('class="tee-group-card"') < 0
  );
  assert(
    '共享视图含卡片/四席/添加分组',
    sharedWxml.indexOf('tee-group-card') >= 0 &&
      sharedWxml.indexOf('gb-group-player-grid') >= 0 &&
      sharedWxml.indexOf('添加分组') >= 0 &&
      sharedWxml.indexOf('delete-group-btn') >= 0 &&
      sharedWxml.indexOf('composition-preview') >= 0
  );
  assert(
    '共享视图只抛事件不写盘',
    sharedJs.indexOf('saveMatch') < 0 &&
      sharedJs.indexOf('navigateTo') < 0 &&
      sharedJs.indexOf('triggerEvent') >= 0
  );
  assert(
    'group-editor 仍导航 group-pick 且保存逻辑仍在页内',
    editorJs.indexOf('/subpackages/tournament/pages/group-pick/') >= 0 &&
      editorJs.indexOf('onConfirm') >= 0 &&
      editorJs.indexOf('teamMatchStore.saveMatch') >= 0 &&
      editorJs.indexOf('eventField') >= 0
  );
})();

console.log('');
console.log('---- seriesGroupEditorG1.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
