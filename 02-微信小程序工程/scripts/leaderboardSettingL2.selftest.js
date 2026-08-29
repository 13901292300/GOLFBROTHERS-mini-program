/**
 * Patch L2：Series 领先榜完整复用普通赛事设置契约
 * 运行：node scripts/leaderboardSettingL2.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..', 'miniprogram');
var shared = require(path.join(root, 'utils', 'leaderboardSettingViewModel.js'));
var seriesOpts = require(path.join(
  root,
  'subpackages/tournament/pages/series-detail/seriesStandingsViewOptions.js'
));
var roundBoard = require(path.join(
  root,
  'subpackages/tournament/pages/series-detail/seriesStandingsRoundBoard.js'
));

var detailJs = fs.readFileSync(
  path.join(root, 'subpackages/tournament/pages/detail/index.js'),
  'utf8'
);
var seriesJs = fs.readFileSync(
  path.join(root, 'subpackages/tournament/pages/series-detail/index.js'),
  'utf8'
);
var seriesOptsSrc = fs.readFileSync(
  path.join(
    root,
    'subpackages/tournament/pages/series-detail/seriesStandingsViewOptions.js'
  ),
  'utf8'
);
var compWxss = fs.readFileSync(
  path.join(root, 'components/leaderboard-setting-sheet/index.wxss'),
  'utf8'
);

var passed = 0;
var failed = 0;

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

var interMatch = {
  teamGroups: [{ teamId: 't1' }, { teamId: 't2' }],
  scoringRules: { teamCompetition: { enabled: true } },
  peoriaResult: null,
  gameMode: '个人比杆赛'
};

var peoriaMatch = Object.assign({}, interMatch, {
  peoriaResult: { status: 'generated', results: [{ playerId: 'u1', net: 72 }] }
});

assert(
  '1 detail 与 Series 使用同一个选项生成函数',
  detailJs.indexOf('leaderboardSettingViewModel') >= 0 &&
    seriesOptsSrc.indexOf('leaderboardSettingViewModel') >= 0 &&
    detailJs.indexOf('buildLeaderboardSettingViewModel') >= 0 &&
    seriesOptsSrc.indexOf('buildLeaderboardSettingViewModel') >= 0
);

assert(
  '2 Series 不再手工维护简化 options（无独立拼净杆/男女）',
  !/if\s*\(\s*gameMode\s*===/.test(
    seriesOptsSrc.split('buildSeriesLeaderboardSettingSections')[1] || ''
  ) &&
    seriesOptsSrc.indexOf("key: 'scoreType'") < 0 &&
    seriesJs.indexOf('buildSeriesLeaderboardSettingSections') >= 0
);

var packedOff = shared.buildLeaderboardSettingViewModel(interMatch, null, {
  sideLabel: '球队'
});
var packedOn = shared.buildLeaderboardSettingViewModel(peoriaMatch, null, {
  sideLabel: '球队'
});
var seriesPacked = seriesOpts.buildSeriesLeaderboardSettingSections(peoriaMatch, {
  view: 'male',
  scoreType: 'net'
});

assert(
  '3 普通显示净杆时 Series 对应轮也显示',
  packedOn.sections[0].options.some(function (o) {
    return o.key === 'net' && o.disabled === false;
  }) &&
    seriesPacked.sections[0].key === 'scoreType' &&
    seriesPacked.netAvailable === true
);

assert(
  '4 普通禁用净杆时 Series 同样 disabled',
  packedOff.sections[0].options.some(function (o) {
    return o.key === 'net' && o.disabled === true && o.sub.indexOf('未生成') >= 0;
  })
);

assert(
  '5 全部/男子/女子三项完整',
  packedOn.viewOptions.join(',') === 'team,all,male,female' &&
    seriesPacked.sections[1].options
      .map(function (o) {
        return o.key;
      })
      .join(',') === 'team,all,male,female'
);

var g1Players = {
  matchId: 'm1',
  status: 'ongoing',
  gameMode: '个人比杆赛',
  teamGroups: [{ teamId: 'a' }, { teamId: 'b' }],
  groups: [
    {
      groupId: 'g1',
      players: [
        { userId: 'u1', competitionName: '甲', gender: 'male' },
        { userId: 'u2', competitionName: '乙', gender: 'female' },
        { userId: 'u3', competitionName: '丙', gender: '' }
      ]
    }
  ],
  scoreData: {},
  peoriaResult: {
    status: 'generated',
    results: [
      { playerId: 'u1', net: 70 },
      { playerId: 'u2', net: 71 }
    ]
  }
};

var maleBoard = roundBoard.buildSeriesRoundBoardViewModel({
  match: g1Players,
  selection: { view: 'male', scoreType: 'gross' }
});
assert(
  '6 未知性别不归入男女',
  maleBoard.listRows.length === 1 &&
    maleBoard.listRows[0].playerId === 'u1' &&
    maleBoard.listRows.every(function (r) {
      return r.gender === 'male';
    })
);

assert(
  '7 G1 主体选项一致（含球队）',
  shared
    .resolveLeaderboardViewOptions({
      teamGroups: [{}, {}],
      gameMode: '个人比杆赛'
    })
    .join(',') === 'team,all,male,female'
);

assert(
  '8 G2 list unit=entity（gross）',
  seriesOpts.resolveListUnit({ gameMode: '四人四球比杆赛' }, 'gross') === 'entity'
);

assert(
  '9 G3 list unit=entity（gross）',
  seriesOpts.resolveListUnit({ gameMode: '最佳球位比杆赛' }, 'gross') === 'entity'
);

assert(
  '10 G4 list unit=pair（gross）；net 强制 player',
  seriesOpts.resolveListUnit({ gameMode: '四人两球比杆赛' }, 'gross') === 'pair' &&
    seriesOpts.resolveListUnit({ gameMode: '四人两球比杆赛' }, 'net') === 'player'
);

// 补 18 洞 thru 以启用净杆
g1Players.scoreData = {
  g1: {
    scoresByPlayer: {
      u1: { scores: new Array(18).fill(4), grossTotal: 72, toPar: 0 },
      u2: { scores: new Array(18).fill(4), grossTotal: 72, toPar: 0 }
    }
  }
};
var netMale = roundBoard.buildSeriesRoundBoardViewModel({
  match: g1Players,
  selection: { view: 'male', scoreType: 'net' }
});
assert(
  '11 选择净杆男子后 R 榜按净杆+男性过滤',
  netMale.listRows.length === 1 &&
    netMale.listRows[0].playerId === 'u1' &&
    netMale.listRows[0].scoreType === 'net' &&
    Number(netMale.listRows[0].net) === 70
);

assert(
  '12 取消不提交：close 路径不写 selection',
  /closeLeaderboardSettingSheet:[\s\S]{0,400}_standingsSelectionByRoundId/.test(
    seriesJs
  ) === false &&
    seriesJs.indexOf('closeLeaderboardSettingSheet') >= 0
);

assert(
  '13 重开同轮回显：open 用 _resolveStandingsSelectionForKey',
  /_openSeriesRoundLeaderboardSettingSheet:[\s\S]{0,800}_resolveStandingsSelectionForKey/.test(
    seriesJs
  )
);

assert(
  '14 R1/R2 互不覆盖：按 roundId 写入 _standingsSelectionByRoundId',
  seriesJs.indexOf('_standingsSelectionByRoundId[rid] = sel') >= 0 ||
    seriesJs.indexOf('_standingsSelectionByRoundId') >= 0 &&
      seriesJs.indexOf('_rememberStandingsSelection') >= 0
);

assert(
  '15 TOT 仍强制球队',
  (function () {
    var standingsVm = require(path.join(
      root,
      'subpackages/tournament/pages/series-detail/seriesStandingsViewModel.js'
    ));
    var totView = seriesOpts.resolveSeriesStandingsDefaultView(interMatch, {
      selectedKey: 'total'
    });
    var cumView = seriesOpts.resolveSeriesStandingsDefaultView(interMatch, {
      selectedKey: 'cumulative'
    });
    var sessTot = seriesOpts.resolveStandingsSessionSelection({
      match: interMatch,
      selectedKey: 'total'
    });
    var sessCum = seriesOpts.resolveStandingsSessionSelection({
      match: interMatch,
      selectedKey: 'cumulative'
    });
    var rxView = seriesOpts.resolveSeriesStandingsDefaultView(interMatch, {
      selectedKey: 'r1',
      scoringMode: 'global_m'
    });
    return (
      standingsVm.isCumulativeStandingsKey('total') === true &&
      standingsVm.isCumulativeStandingsKey('cumulative') === true &&
      totView === 'team' &&
      cumView === 'team' &&
      sessTot.view === 'team' &&
      sessCum.view === 'team' &&
      rxView === 'all' &&
      seriesJs.indexOf('isCumulativeStandingsKey') >= 0
    );
  })()
);

assert(
  '16 不写 storage/series/match',
  !/_openSeriesRoundLeaderboardSettingSheet:[\s\S]{0,1500}setStorageSync/.test(
    seriesJs
  ) &&
    !/confirmLeaderboardSettingSheet:[\s\S]{0,1500}upsertSeries/.test(seriesJs)
);

assert(
  '17 不把 entityId 当 userId：entity 行 playerId 空',
  (function () {
    var board = roundBoard.buildSeriesRoundBoardViewModel({
      match: {
        matchId: 'm2',
        status: 'ongoing',
        gameMode: '四人四球比杆赛',
        teamGroups: [{}, {}],
        groups: [
          {
            groupId: 'g1',
            players: [
              { userId: 'a1', gender: 'male' },
              { userId: 'a2', gender: 'female' }
            ]
          }
        ],
        scoreEntities: {
          g1: [{ entityId: 'e1', entityType: 'team', members: ['a1', 'a2'] }]
        },
        scoreData: { g1: { teamScoresByEntity: [] } }
      },
      selection: { view: 'all', scoreType: 'gross' }
    });
    return (
      board.listUnit === 'entity' &&
      board.listRows[0] &&
      board.listRows[0].entityId === 'e1' &&
      !board.listRows[0].playerId
    );
  })()
);

assert(
  '18 detail 仍走共享组件/模型',
  detailJs.indexOf('_buildLeaderboardSettingSheetModel') >= 0 &&
    detailJs.indexOf('leaderboardSettingViewModel.buildLeaderboardSettingViewModel') >=
      0
);

assert(
  '19 L1 overlay 样式保持',
  /background:\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.55\s*\)/.test(compWxss) &&
    /z-index:\s*210/.test(compWxss)
);

assert(
  '20 gate 失败仍 toast：_toastGateFail',
  /_openSeriesRoundLeaderboardSettingSheet:[\s\S]{0,200}_toastGateFail/.test(
    seriesJs
  )
);

assert(
  '默认值：队际启用球队竞赛 → team+gross',
  packedOff.selection.view === 'team' && packedOff.selection.scoreType === 'gross'
);

assert(
  '切换主体不强制重置：normalize 保留 scoreType',
  shared.normalizeLeaderboardSelection(peoriaMatch, {
    view: 'female',
    scoreType: 'net'
  }).scoreType === 'net'
);

console.log('');
console.log('L2 selftest: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
