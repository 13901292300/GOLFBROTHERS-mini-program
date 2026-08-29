/**
 * Series M「领先榜」= 本轮视图选择器（共享 sheet）
 * 运行：node scripts/seriesStandingsViewSelect.selftest.js
 */

var path = require('path');
var fs = require('fs');

var pageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);
var detailDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'detail'
);
var componentDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'components',
  'leaderboard-setting-sheet'
);

var viewOptions = require(path.join(pageDir, 'seriesStandingsViewOptions.js'));
var roundBoard = require(path.join(pageDir, 'seriesStandingsRoundBoard.js'));

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

function keysOf(opts) {
  return (opts || []).map(function (o) {
    return o.key;
  });
}

(function testViewMatrix() {
  // L2：设置选项与普通 detail 对齐（team/all/male/female）；list unit 另算
  var withTeams = { teamGroups: [{}, {}], gameMode: '个人比杆赛' };
  assert(
    'L2 设置选项：队际 family → team,all,male,female',
    keysOf(viewOptions.resolveSeriesStandingsViewOptions(withTeams)).join(',') ===
      'team,all,male,female'
  );
  assert(
    'G2 list unit=entity；G4 list unit=pair',
    viewOptions.resolveListUnit({ gameMode: '四人四球比杆赛' }, 'gross') === 'entity' &&
      viewOptions.resolveListUnit({ gameMode: '四人两球比杆赛' }, 'gross') === 'pair'
  );
  assert(
    '旧 player 会话 normalize → all',
    viewOptions.normalizeSeriesStandingsView('player', withTeams) === 'all'
  );
  assert(
    '设置 sections 含 scoreType + view',
    (function () {
      var packed = viewOptions.buildSeriesLeaderboardSettingSections(withTeams, null);
      return (
        packed.sections[0].key === 'scoreType' &&
        packed.sections[1].key === 'view' &&
        packed.draftValues.view === 'team'
      );
    })()
  );
})();

(function testRoundBoardSemantics() {
  var g1Match = {
    matchId: 'm1',
    status: 'registering',
    gameMode: '个人比杆赛',
    groups: [
      {
        groupId: 'g1',
        players: [
          { userId: 'u1', competitionName: '甲' },
          { userId: 'u2', competitionName: '乙' }
        ]
      }
    ],
    scoreData: {}
  };
  var playerBoard = roundBoard.buildSeriesRoundBoardViewModel({
    match: g1Match,
    view: 'player'
  });
  assert(
    '未开赛个人榜：阵容可见 + TEEING OFF SOON',
    playerBoard.showTeamBoard === false &&
      playerBoard.listRows.length === 2 &&
      playerBoard.listRows.every(function (r) {
        return r.statusLabel === 'TEEING OFF SOON' && r.resultUnitType === 'player';
      })
  );

  var g2Match = {
    matchId: 'm2',
    status: 'ongoing',
    gameMode: '四人四球比杆赛',
    groups: [
      {
        groupId: 'g1',
        players: [
          { userId: 'a1', competitionName: 'A1' },
          { userId: 'a2', competitionName: 'A2' }
        ]
      }
    ],
    scoreEntities: {
      g1: [
        {
          entityId: 'e1',
          entityType: 'team',
          members: ['a1', 'a2']
        }
      ]
    },
    scoreData: {
      g1: { teamScoresByEntity: [] }
    }
  };
  var entityBoard = roundBoard.buildSeriesRoundBoardViewModel({
    match: g2Match,
    view: 'entity'
  });
  assert(
    'LIVE 组合榜无成绩：AWAITING SCORE，且带 members',
    entityBoard.listRows.length === 1 &&
      entityBoard.listRows[0].statusLabel === 'AWAITING SCORE' &&
      entityBoard.listRows[0].resultUnitType === 'entity' &&
      entityBoard.listRows[0].members.length === 2 &&
      entityBoard.listRows[0].name.indexOf('/') >= 0
  );

  var teamBoard = roundBoard.buildSeriesRoundBoardViewModel({
    match: Object.assign({}, g2Match, {
      teamGroups: [{ teamId: 't1' }, { teamId: 't2' }]
    }),
    view: 'team'
  });
  assert(
    '球队视图不输出平面 listRows',
    teamBoard.showTeamBoard === true &&
      teamBoard.listRows.length === 0 &&
      teamBoard.selection.view === 'team'
  );
})();

(function testSharedComponentAndWiring() {
  var compJson = fs.readFileSync(path.join(componentDir, 'index.json'), 'utf8');
  var compWxml = fs.readFileSync(path.join(componentDir, 'index.wxml'), 'utf8');
  var detailJson = fs.readFileSync(path.join(detailDir, 'index.json'), 'utf8');
  var detailWxml = fs.readFileSync(path.join(detailDir, 'index.wxml'), 'utf8');
  var detailJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');
  var seriesJson = fs.readFileSync(path.join(pageDir, 'index.json'), 'utf8');
  var seriesWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
  var seriesJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
  var sheetVm = fs.readFileSync(path.join(pageDir, 'seriesManageSheetViewModel.js'), 'utf8');

  assert('共享组件存在', compJson.indexOf('"component": true') >= 0);
  assert(
    '共享 sheet DOM：成绩区 sections + 确认/取消',
    compWxml.indexOf('leaderboard-setting__options') >= 0 &&
      compWxml.indexOf('bind:confirm') < 0 &&
      compWxml.indexOf('onConfirmTap') >= 0 &&
      compWxml.indexOf('{{title}}') >= 0
  );
  assert(
    'detail 使用共享组件，无内联设置 DOM',
    detailJson.indexOf('leaderboard-setting-sheet') >= 0 &&
      detailWxml.indexOf('<leaderboard-setting-sheet') >= 0 &&
      detailWxml.indexOf('onDraftLeaderboardViewSelect') < 0 &&
      detailJs.indexOf('_buildLeaderboardSettingSheetModel') >= 0
  );
  assert(
    'Series 使用共享组件 + 页面态记忆',
    seriesJson.indexOf('leaderboard-setting-sheet') >= 0 &&
      seriesWxml.indexOf('<leaderboard-setting-sheet') >= 0 &&
      seriesJs.indexOf('_standingsViewByRoundId') >= 0 &&
      seriesJs.indexOf('_openSeriesRoundLeaderboardSettingSheet') >= 0 &&
      seriesJs.indexOf('confirmLeaderboardSettingSheet') >= 0
  );
  assert(
    'Series 领先榜不写 storage（打开/确认路径）',
    !/_openSeriesRoundLeaderboardSettingSheet:[\s\S]{0,1200}setStorageSync/.test(seriesJs) &&
      !/confirmLeaderboardSettingSheet:[\s\S]{0,1200}setStorageSync/.test(seriesJs) &&
      !/confirmLeaderboardSettingSheet:[\s\S]{0,1200}upsertSeries/.test(seriesJs)
  );
  assert(
    '普通功能区领先榜；管理区 placeholder',
    seriesWxml.indexOf('onSeriesRoundViewFeatureTap') >= 0 &&
      sheetVm.indexOf('ROUND_VIEW_PERMISSION_SET') >= 0 &&
      sheetVm.indexOf("permission: 'leaderboard'") >= 0 &&
      /projectOrderedSlots[\s\S]*ROUND_VIEW_PERMISSION_SET/.test(sheetVm)
  );
  assert(
    '选择后切 standings + 完整 selection，非单纯跳转',
    seriesJs.indexOf('_goSeriesManageStandingsRound(roundId, selection)') >= 0 &&
      seriesJs.indexOf('_standingsSelectionByRoundId') >= 0 &&
      seriesJs.indexOf('_openSeriesRoundLeaderboardSettingSheet') >= 0 &&
      seriesWxml.indexOf('standings.useLiveLeaderboard') >= 0
  );
  assert(
    'TOT 强制球队榜',
    /isCumulativeStandingsKey\(key\)/.test(seriesJs) ||
      /isCumulativeStandingsKey\(selectedKey\)/.test(seriesJs) ||
      seriesJs.indexOf('isCumulativeStandingsKey') >= 0
  );
})();

console.log('');
console.log('---- seriesStandingsViewSelect.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
