/**
 * Patch G2-V：Series 分组卡视觉对齐 + 删除赛程「开始本轮比赛」
 * 运行：node scripts/seriesGroupVisualG2V.selftest.js
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
var detailDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'detail'
);
var groupEditorDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament-manage',
  'pages',
  'group-editor'
);
var sharedViewDir = path.join(
  root,
  'miniprogram',
  'components',
  'tournament-group-editor-view'
);
var commonWxss = path.join(root, 'miniprogram', 'styles', 'tournament-common.wxss');
var appWxss = path.join(root, 'miniprogram', 'app.wxss');

var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var tournamentGroupDraft = require(seriesTestPaths.util('tournamentGroupDraft.js'));
var tPosition = require(path.join(utilsDir, 'tPosition.js'));
var scheduleVm = require(path.join(pageDir, 'seriesScheduleViewModel.js'));
var seriesGroupPickRoster = require(seriesTestPaths.util('seriesGroupPickRoster.js'));

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

function extractRule(css, selector) {
  var re = new RegExp(
    selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]+)\\}',
    'm'
  );
  var m = css.match(re);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function makeOrgSeries() {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: 'G2V',
    createdBy: 'admin-1',
    organization: {
      organizationId: 'org-1',
      organizationName: '机构',
      organizationLogo: ''
    }
  });
  s.lifecycleStatus = 'published';
  s.publishToken = 'tok-g2v';
  s.participants = [
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't1',
      seriesParticipantId: 'team:t1',
      nameSnapshot: '甲队',
      shortNameSnapshot: '甲队'
    }),
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't2',
      seriesParticipantId: 'team:t2',
      nameSnapshot: '乙队',
      shortNameSnapshot: '乙队'
    })
  ];
  s.rounds = (s.rounds || []).slice(0, 2).map(function (r, idx) {
    return Object.assign({}, r, {
      roundId: 'r' + (idx + 1),
      index: idx + 1,
      matchId: 'm-g2v-' + (idx + 1),
      gameMode: '个人比杆赛',
      dateTime: '2030-06-0' + (idx + 1) + ' 08:00',
      courseId: 'c1',
      courseName: '球场',
      fee: '0'
    });
  });
  s.roster = [
    {
      rosterEntryId: 're1',
      playerId: 'p1',
      seriesParticipantId: 'team:t1',
      playerNameSnapshot: '甲一',
      genderSnapshot: '男',
      registrationStatus: 'registered'
    }
  ];
  return s;
}

function makeMatch(series, round) {
  var built = seriesStationMatch.buildMatchFromSeriesRound(series, round, {
    matchId: round.matchId,
    publishToken: series.publishToken
  });
  if (!built.ok) throw new Error(built.reason);
  var m = built.match;
  m.status = 'registering';
  m.registerInfo = { totalCount: 0, users: [] };
  return m;
}

(function printAndAssertSizeTable() {
  var common = read(commonWxss);
  var app = read(appWxss);
  var seriesWxss = read(path.join(pageDir, 'index.wxss'));
  var editorWxss = read(path.join(sharedViewDir, 'index.wxss'));
  var detailMain = extractRule(common, '.detail-main');
  var teeCard = extractRule(common, '.tee-group-card');
  var teeMeta = extractRule(common, '.tee-group-meta');
  var teeBadge = extractRule(common, '.tee-group-badge');
  var grid = extractRule(app, '.gb-group-player-grid');
  var avatar = extractRule(app, '.gb-group-player-avatar');
  var name = extractRule(app, '.gb-group-player-name');
  var teamLabel = extractRule(app, '.gb-group-player-team-label');
  var teeText = extractRule(app, '.gb-group-player-tee-text');
  var editorCard = extractRule(editorWxss, '.tee-group-card');
  var seriesPanelOk =
    /schedule-groups-panel[\s\S]{0,80}padding:\s*0;/.test(seriesWxss) &&
    !/schedule-groups-panel[\s\S]{0,80}padding:\s*0\s+24rpx/.test(seriesWxss);
  var seriesCtaOk = /schedule-groups-panel--with-cta[\s\S]{0,120}140rpx/.test(
    seriesWxss
  );

  console.log('');
  console.log('==== 尺寸对照表（权威 vs Series）====');
  console.log(
    [
      '| 项 | 普通赛事权威值 | Series 最终值 |',
      '|---|---|---|',
      '| 内容区水平边距 | detail-main: ' + detailMain + ' | 同 import；schedule panel 不再叠加 24rpx |',
      '| 卡片外壳 | ' + teeCard + ' | 复用 .tee-group-card |',
      '| 编辑卡外壳 | ' + editorCard.slice(0, 90) + ' | 共享组件同权威 |',
      '| 标题栏高度/字号 | meta 72rpx; badge 26rpx/72rpx | 同 .tee-group-meta/.tee-group-badge |',
      '| 四席 grid | ' + grid + ' | 复用 .gb-group-player-grid |',
      '| 头像 | ' + avatar + ' | 复用 .gb-group-player-avatar |',
      '| 昵称 | ' + name + ' | 复用 .gb-group-player-name |',
      '| T 台字号 | ' + teeText + ' | 复用 .gb-group-player-tee-text |',
      '| 球队标签 | ' + teamLabel + ' | 复用 .gb-group-player-team-label |',
      '| panel 水平 padding | groups-tab-panel: 0 | schedule-groups-panel: 0 |',
      '| CTA 底垫 | calc(140rpx + safe-area) | calc(140rpx + env(safe-area-inset-bottom)) |'
    ].join('\n')
  );
  console.log('');

  assert('卡片外宽：Series panel 无额外 24rpx 横向缩进', seriesPanelOk);
  assert('卡片外壳复用 tee-group-card 权威规则', teeCard.indexOf('padding: 96rpx 28rpx 32rpx') >= 0 && teeCard.indexOf('border-radius: 24rpx') >= 0);
  assert('编辑卡与详情卡同权威尺寸', editorCard.indexOf('padding: 96rpx 28rpx 32rpx') >= 0 && editorCard.indexOf('border-radius: 24rpx') >= 0);
  assert('四席 grid 权威 gap 12rpx 8rpx', grid.indexOf('repeat(4, 1fr)') >= 0 && grid.indexOf('12rpx 8rpx') >= 0);
  assert('头像 80rpx', avatar.indexOf('80rpx') >= 0);
  assert('昵称 22rpx + ellipsis', name.indexOf('22rpx') >= 0 && name.indexOf('ellipsis') >= 0);
  assert('标签 max-width 80rpx', teamLabel.indexOf('80rpx') >= 0 && teamLabel.indexOf('ellipsis') >= 0);
  assert('CTA 底垫对齐 140rpx+safe-area', seriesCtaOk);
  assert(
    '赛程 panel 无 180rpx 旧底垫',
    !/schedule-(groups|tee)-panel[\s\S]{0,200}180rpx/.test(seriesWxss)
  );
  assert('标题栏权威高度 72rpx', teeMeta.indexOf('72rpx') >= 0 && teeBadge.indexOf('26rpx') >= 0);
})();

(function testNoStartCta() {
  var wxml = read(path.join(pageDir, 'index.wxml'));
  var js = read(path.join(pageDir, 'index.js'));
  var vm = read(path.join(pageDir, 'seriesScheduleViewModel.js'));
  var manageVm = read(path.join(pageDir, 'seriesManageSheetViewModel.js'));
  assert(
    '页面无「开始本轮比赛」',
    wxml.indexOf('开始本轮比赛') < 0 &&
      wxml.indexOf('startScheduleRound') < 0 &&
      js.indexOf('startScheduleRound') < 0 &&
      vm.indexOf('showStart') < 0 &&
      vm.indexOf('开始本轮比赛') < 0
  );
  assert(
    'M 面板仍保留 start_match / 开赛能力',
    manageVm.indexOf('start_match') >= 0 &&
      js.indexOf("permission === 'start_match'") >= 0 &&
      js.indexOf('startStationRound') >= 0
  );
  assert(
    '赛程 CTA 仅分组入口',
    wxml.indexOf('openScheduleGroupEditor') >= 0 &&
      wxml.indexOf('schedule.cta.showEditGroups') >= 0
  );
})();

(function testAffiliationChain() {
  var series = makeOrgSeries();
  var rosterBefore = JSON.stringify(series.roster);
  var match = makeMatch(series, series.rounds[0]);
  var other = makeMatch(series, series.rounds[1]);
  other.groups = [{ groupId: 'keep', groupName: '第1组', players: [] }];
  var regBefore = JSON.stringify(match.registerInfo);

  // roster 投影带 seriesParticipantId
  var loaded = seriesGroupPickRoster.loadSeriesPickRegisterSource({
    fromSeries: 1,
    seriesId: series.seriesId,
    roundId: 'r1',
    matchId: match.matchId,
    match: match,
    series: series,
    getIndexByMatchId: function () {
      return { seriesId: series.seriesId, roundId: 'r1', matchId: match.matchId };
    }
  });
  assert('roster 投影含归属', loaded.ok && loaded.registerInfo.users[0].seriesParticipantId === 'team:t1');

  // 非 roster 须手选归属
  assert(
    '非 roster 须手选归属',
    seriesGroupPickRoster.needsAffiliationSelection(
      { userId: 'friend-1', displayName: '好友' },
      series
    ) === true
  );

  var draft = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        {
          position: 1,
          userId: 'p1',
          displayName: '甲一',
          gender: '男',
          tee: tPosition.BLUE_T,
          tPosition: tPosition.BLUE_T,
          seriesParticipantId: 'team:t1',
          matchTeamId: 't1',
          matchTeamName: '甲队',
          groupId: 'team:t1',
          groupName: '甲队',
          fromSeriesRoster: true
        },
        {
          position: 2,
          userId: 'friend-2',
          displayName: '好友乙',
          gender: '女',
          tee: tPosition.RED_T,
          tPosition: tPosition.RED_T,
          seriesParticipantId: 'team:t2',
          matchTeamId: 't2',
          matchTeamName: '乙队',
          groupId: 'team:t2',
          groupName: '乙队',
          fromSeriesRoster: false
        },
        { position: 3, userId: '' },
        { position: 4, userId: '' }
      ]
    }
  ];
  var formal = tournamentGroupDraft.toFormalGroups(draft);
  match.groups = formal;
  assert(
    'roster/非 roster 归属均写入正式席位',
    formal[0].players[0].seriesParticipantId === 'team:t1' &&
      formal[0].players[0].matchTeamId === 't1' &&
      formal[0].players[1].seriesParticipantId === 'team:t2' &&
      formal[0].players[1].matchTeamId === 't2'
  );

  var cards = scheduleVm.projectGroupCards(match, series);
  assert(
    'organization 球队标签回显',
    cards[0].displayPlayers[0].teamLabel === '甲队' &&
      cards[0].displayPlayers[1].teamLabel === '乙队'
  );
  assert(
    'T台回显（分组卡不渲染性别符号）',
    cards[0].displayPlayers[0].teeText === '蓝T' &&
      cards[0].displayPlayers[1].teeText === '红T'
  );
  assert(
    'Series 赛程 WXML 无分组卡性别节点',
    (function () {
      var wxml = read(path.join(pageDir, 'index.wxml'));
      var i = wxml.indexOf('schedule-groups-panel');
      var j = wxml.indexOf("activeTab === 'discussion'");
      var block = i >= 0 ? wxml.slice(i, j > i ? j : i + 8000) : '';
      return (
        block.indexOf('roster-gender') < 0 &&
        block.indexOf('genderIcon') < 0 &&
        block.indexOf('gb-group-player-name-row') < 0
      );
    })()
  );
  assert('不写 Series.roster', JSON.stringify(series.roster) === rosterBefore);
  assert('不写 match.registerInfo', JSON.stringify(match.registerInfo) === regBefore);
  assert('不影响其他轮次', other.groups[0].groupId === 'keep');
})();

(function testNoRegressionSources() {
  var detailWxml = read(path.join(detailDir, 'index.wxml'));
  var editorWxml = read(path.join(groupEditorDir, 'index.wxml'));
  var seriesWxml = read(path.join(pageDir, 'index.wxml'));
  assert(
    '普通详情仍用 tee-group-card + gb-group-player',
    detailWxml.indexOf('class="tee-group-card"') >= 0 &&
      detailWxml.indexOf('gb-group-player-team-label') >= 0
  );
  assert(
    'group-editor 仍保留取消/确定',
    editorWxml.indexOf('onCancel') >= 0 && editorWxml.indexOf('onConfirm') >= 0
  );
  assert(
    'Series 未恢复分组 bottom sheet',
    seriesWxml.indexOf('scheduleEditSheetVisible') < 0 &&
      seriesWxml.indexOf('<tournament-group-editor-view') < 0
  );
})();

console.log('');
console.log('---- seriesGroupVisualG2V.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
