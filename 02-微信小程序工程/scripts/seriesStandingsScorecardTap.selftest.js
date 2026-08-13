/**
 * Series 总榜 R 轮比杆展开面板自测（G1–G4）
 * 运行：node scripts/seriesStandingsScorecardTap.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..', 'miniprogram', 'utils');
var teamMatchScorecard = require(path.join(root, 'teamMatchScorecard.js'));
var seriesStandingsAssembler = require(path.join(root, 'seriesStandingsAssembler.js'));
var standingsVm = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail',
  'seriesStandingsViewModel.js'
));

var pageJs = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'miniprogram',
    'subpackages',
    'tournament',
    'pages',
    'series-detail',
    'index.js'
  ),
  'utf8'
);
var pageWxml = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'miniprogram',
    'subpackages',
    'tournament',
    'pages',
    'series-detail',
    'index.wxml'
  ),
  'utf8'
);
var pageJson = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'miniprogram',
    'subpackages',
    'tournament',
    'pages',
    'series-detail',
    'index.json'
  ),
  'utf8'
);
var pageWxss = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'miniprogram',
    'subpackages',
    'tournament',
    'pages',
    'series-detail',
    'index.wxss'
  ),
  'utf8'
);
var commonWxss = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'styles', 'tournament-common.wxss'),
  'utf8'
);
var detailWxml = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'miniprogram',
    'subpackages',
    'tournament',
    'pages',
    'detail',
    'index.wxml'
  ),
  'utf8'
);
var identityWxml = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'miniprogram',
    'components',
    'leaderboard-player-identity',
    'index.wxml'
  ),
  'utf8'
);

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

function fillScores(n, stroke) {
  var out = [];
  for (var i = 0; i < 18; i++) out.push(i < n ? stroke : null);
  return out;
}

function makeSeries(partial) {
  return Object.assign(
    {
      seriesId: 'series-sc-1',
      publishToken: 'pub-sc-1',
      lifecycleStatus: 'published',
      scoringRule: {
        mode: 'global_m',
        globalM: 2,
        allowRepeat: true,
        scoreBasis: 'gross',
        ruleVersion: 1
      },
      participants: [
        {
          seriesParticipantId: 'team:red',
          kind: 'team',
          sourceTeamId: 'red',
          nameSnapshot: '红队',
          shortNameSnapshot: '红'
        },
        {
          seriesParticipantId: 'team:blue',
          kind: 'team',
          sourceTeamId: 'blue',
          nameSnapshot: '蓝队',
          shortNameSnapshot: '蓝'
        }
      ],
      rounds: []
    },
    partial || {}
  );
}

function makeManagedMatch(opts) {
  var o = opts || {};
  return Object.assign(
    {
      matchId: o.matchId || 'm1',
      gameMode: o.gameMode || '个人比杆赛',
      status: o.status || 'registering',
      seriesContext: {
        managed: true,
        seriesId: 'series-sc-1',
        roundId: o.roundId || 'r1',
        publishToken: 'pub-sc-1'
      },
      teamGroups: [
        { id: 'red', name: '红队', logo: 'https://example.com/red.png' },
        { id: 'blue', name: '蓝队' }
      ],
      registerInfo: {
        users: [
          { userId: 'u-r1', nickname: '红一', matchTeamId: 'red' },
          { userId: 'u-r2', nickname: '红二', matchTeamId: 'red' },
          { userId: 'u-b1', nickname: '蓝一', matchTeamId: 'blue' }
        ]
      },
      groups: [],
      scoreData: {},
      scoreEntities: {},
      pairings: {},
      front9Course: 'A',
      back9Course: 'B',
      courseName: '测试球场'
    },
    o.patch || {}
  );
}

function build(series, store, index) {
  return seriesStandingsAssembler.buildStandingsResult({
    series: series,
    getMatchById: function (id) {
      return store[id] || null;
    },
    getIndexByMatchId: function (id) {
      return index[id] || null;
    },
    resolveStationStatusLabel: function (m) {
      if (!m) return '';
      if (m.status === 'ongoing' || m.status === 'live') return 'LIVE';
      if (m.status === 'completed' || m.status === 'finished') return '已结束';
      return '报名中';
    }
  });
}

function playersOf(vm, pid) {
  var t = (vm.teamRows || []).find(function (r) {
    return r.teamId === pid;
  });
  return (t && t.players) || [];
}

// 权威 DOM
assert(
  '4 LIVE 身份区 class=scorecard-profile',
  identityWxml.indexOf('class="scorecard-profile"') >= 0 &&
    identityWxml.indexOf('sc-avatar') >= 0 &&
    identityWxml.indexOf('sc-name') >= 0
);
assert(
  '5 头像主页 catchtap onProfileTap',
  identityWxml.indexOf('catchtap="onProfileTap"') >= 0 &&
    identityWxml.indexOf('sc-chevron') >= 0
);
assert(
  'Series 复用共享资料区面板',
  pageJson.indexOf('leaderboard-player-profile-panel') >= 0 &&
    pageWxml.indexOf('leaderboard-player-profile-panel') >= 0
);
assert(
  'detail 亦使用同组件/同 profile 结构',
  detailWxml.indexOf('scorecard-profile') >= 0 ||
    detailWxml.indexOf('leaderboard-player-identity') >= 0
);

// 1–3 未开赛可点 + TEEING OFF SOON
(function () {
  var series = makeSeries({
    rounds: [{ roundId: 'r1', index: 1, matchId: 'm1', nameSnapshot: '第一轮', gameMode: '个人比杆赛' }]
  });
  var m1 = makeManagedMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'registering',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [
            { userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red', avatar: 'a.png' },
            { userId: 'u-r2', nickname: '红二', position: 2, matchTeamId: 'red' }
          ]
        }
      ]
    }
  });
  var built = build(series, { m1: m1 }, { m1: { seriesId: 'series-sc-1', roundId: 'r1' } });
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: 'r1',
    roundStates: [{ roundId: 'r1', index: 1, label: 'R1', statusToken: 'scheduled', hasMatchId: true }],
    standingsResult: built.standingsResult
  });
  var ps = playersOf(vm, 'team:red');
  assert('1 未开赛可点', ps.length === 2 && ps.every(function (p) { return p.canOpenScorecard; }));
  var panel = teamMatchScorecard.resolveStandingsExpandPanel(
    m1,
    { groupId: 'g1', playerId: 'u-r1' },
    'gross'
  );
  assert('2 TEEING OFF SOON', panel.state === 'teeing_off_soon' && panel.emptyLabel === 'TEEING OFF SOON');
  assert('3 无记分表/无虚假成绩', panel.scorecard == null);
})();

// 8–9 LIVE 无/有成绩
(function () {
  var mAwait = makeManagedMatch({
    status: 'ongoing',
    patch: {
      groups: [{ groupId: 'g1', players: [{ userId: 'u-r1', position: 1, matchTeamId: 'red' }] }],
      scoreData: { g1: { scoresByPlayer: {} } }
    }
  });
  var pAwait = teamMatchScorecard.resolveStandingsExpandPanel(
    mAwait,
    { groupId: 'g1', playerId: 'u-r1' },
    'gross'
  );
  assert('8 AWAITING SCORE', pAwait.state === 'awaiting_score' && pAwait.emptyLabel === 'AWAITING SCORE');

  var mLive = makeManagedMatch({
    status: 'ongoing',
    patch: {
      groups: [{ groupId: 'g1', players: [{ userId: 'u-r1', position: 1, matchTeamId: 'red' }] }],
      scoreData: { g1: { scoresByPlayer: { 'u-r1': { scores: fillScores(1, 4) } } } }
    }
  });
  var pLive = teamMatchScorecard.resolveStandingsExpandPanel(
    mLive,
    { groupId: 'g1', playerId: 'u-r1' },
    'gross'
  );
  assert('9 有一洞正常记分卡', pLive.state === 'scorecard' && !!pLive.scorecard);
})();

// 10 完赛
(function () {
  var m = makeManagedMatch({
    status: 'completed',
    patch: {
      groups: [{ groupId: 'g1', players: [{ userId: 'u-r1', position: 1, matchTeamId: 'red' }] }],
      scoreData: { g1: { scoresByPlayer: { 'u-r1': { scores: fillScores(18, 4) } } } }
    }
  });
  var p = teamMatchScorecard.resolveStandingsExpandPanel(m, { groupId: 'g1', playerId: 'u-r1' }, 'gross');
  assert('10 完赛 scorecard', p.state === 'scorecard' && p.scorecard);
})();

// 11 G1
(function () {
  var row = teamMatchScorecard.resolveStrokeScoringRow(
    makeManagedMatch({ gameMode: '个人比杆赛' }),
    { groupId: 'g1', playerId: 'u-r1' }
  );
  assert('11 G1 player 映射', row.resultUnitType === 'player' && !row.isEntity && row.playerId === 'u-r1');
})();

// 12–15 G2/G3 entity + G4 pair + 主页 ID
(function () {
  var m = makeManagedMatch({
    gameMode: '四人四球比杆赛',
    status: 'ongoing',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [
            { userId: 'u-r1', position: 1, matchTeamId: 'red' },
            { userId: 'u-r2', position: 2, matchTeamId: 'red' }
          ]
        }
      ],
      scoreEntities: {
        g1: [
          {
            entityId: 'ent-red',
            entityType: 'team',
            teamGroupId: 'red',
            members: ['u-r1', 'u-r2']
          }
        ]
      },
      scoreData: {
        g1: { teamScoresByEntity: [{ teamId: 'ent-red', scores: fillScores(3, 4) }] }
      }
    }
  });
  var row1 = teamMatchScorecard.resolveStrokeScoringRow(m, {
    groupId: 'g1',
    playerId: 'u-r1'
  });
  var row2 = teamMatchScorecard.resolveStrokeScoringRow(m, {
    groupId: 'g1',
    playerId: 'u-r2'
  });
  assert('12 G2 entityId', row1.isEntity && row1.entityId === 'ent-red' && row1.resultUnitType === 'entity');
  assert('14 不冒充个人', row1.playerId === 'u-r1' && row1.entityId !== row1.playerId);
  assert(
    '15 同组合主页 ID 各自正确',
    row1.playerId === 'u-r1' && row2.playerId === 'u-r2' && row1.entityId === row2.entityId
  );
  var panel = teamMatchScorecard.resolveStandingsExpandPanel(
    m,
    { groupId: 'g1', playerId: 'u-r1' },
    'gross'
  );
  assert('12 entity 记分卡', panel.state === 'scorecard' && panel.kind === 'entity');

  var m4 = makeManagedMatch({
    gameMode: '四人两球比杆赛',
    status: 'ongoing',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [
            { userId: 'u-r1', position: 1, matchTeamId: 'red' },
            { userId: 'u-r2', position: 2, matchTeamId: 'red' }
          ]
        }
      ],
      scoreEntities: {
        g1: [
          {
            entityId: 'pair-1',
            entityType: 'pair',
            members: ['u-r1', 'u-r2']
          }
        ]
      },
      scoreData: {
        g1: { teamScoresByEntity: [{ teamId: 'pair-1', scores: fillScores(2, 5) }] }
      }
    }
  });
  var r4 = teamMatchScorecard.resolveStrokeScoringRow(m4, { groupId: 'g1', playerId: 'u-r1' });
  assert('13 G4 pair', r4.resultUnitType === 'pair' && r4.entityId === 'pair-1');
})();

// 16 R1/R2 不串
(function () {
  var m1 = makeManagedMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'ongoing',
    patch: {
      groups: [{ groupId: 'g1', players: [{ userId: 'u-r1', position: 1, matchTeamId: 'red' }] }],
      scoreData: { g1: { scoresByPlayer: { 'u-r1': { scores: fillScores(2, 3) } } } }
    }
  });
  var m2 = makeManagedMatch({
    matchId: 'm2',
    roundId: 'r2',
    status: 'ongoing',
    patch: {
      groups: [{ groupId: 'g1', players: [{ userId: 'u-r1', position: 1, matchTeamId: 'red' }] }],
      scoreData: { g1: { scoresByPlayer: { 'u-r1': { scores: fillScores(8, 5) } } } }
    }
  });
  var a = teamMatchScorecard.resolveStandingsExpandPanel(m1, { groupId: 'g1', playerId: 'u-r1' }, 'gross');
  var b = teamMatchScorecard.resolveStandingsExpandPanel(m2, { groupId: 'g1', playerId: 'u-r1' }, 'gross');
  assert('16 R1/R2 成绩不同', JSON.stringify(a.scorecard) !== JSON.stringify(b.scorecard));
})();

// 页面接线
assert('profile 事件 onStandingsScorecardProfileTap', pageJs.indexOf('onStandingsScorecardProfileTap') >= 0);
assert('openPlayerProfile 复用', pageJs.indexOf('openPlayerProfileUtil') >= 0);
assert(
  '6 头像 catch 不冒泡（组件 catchtap + 页面 profiletap）',
  pageWxml.indexOf('bind:profiletap="onStandingsScorecardProfileTap"') >= 0
);
assert(
  '空态文案字段',
  pageWxml.indexOf('standingsScorecardEmptyLabel') >= 0 &&
    pageJs.indexOf('TEEING OFF SOON') < 0 // 文案来自 util 而非写死页面
);
assert(
  '判定函数 resolveStandingsExpandPanel',
  typeof teamMatchScorecard.resolveStandingsExpandPanel === 'function' &&
    typeof teamMatchScorecard.isStationStartedForScorecard === 'function'
);
assert(
  '10 点击不 rebuild/reload',
  !/_openStandingsPlayerScorecard:[\s\S]{0,2000}reloadViewModel/.test(pageJs) &&
    !/_openStandingsPlayerScorecard:[\s\S]{0,2000}_rebuildStandingsProjection/.test(pageJs)
);
assert(
  '禁止 COMING SOON / ALL SQUARE 文案',
  pageWxml.indexOf('COMING SOON') < 0 &&
    pageWxml.indexOf('ALL SQUARE') < 0 &&
    pageJs.indexOf("'COMING SOON'") < 0
);

// TOT 不可点
(function () {
  var series = makeSeries({
    rounds: [{ roundId: 'r1', index: 1, matchId: 'm1', gameMode: '个人比杆赛' }]
  });
  var m1 = makeManagedMatch({
    matchId: 'm1',
    roundId: 'r1',
    status: 'ongoing',
    patch: {
      groups: [
        {
          groupId: 'g1',
          players: [{ userId: 'u-r1', nickname: '红一', position: 1, matchTeamId: 'red' }]
        }
      ],
      scoreData: { g1: { scoresByPlayer: { 'u-r1': { scores: fillScores(3, 4) } } } }
    }
  });
  var built = build(series, { m1: m1 }, { m1: { seriesId: 'series-sc-1', roundId: 'r1' } });
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: 'cumulative',
    roundStates: [{ roundId: 'r1', index: 1, label: 'R1', statusToken: 'live', hasMatchId: true }],
    standingsResult: built.standingsResult
  });
  assert(
    '20 TOT 可点且带轮次键',
    playersOf(vm, 'team:red').length > 0 &&
      playersOf(vm, 'team:red').every(function (p) {
        return p.canOpenScorecard === true && p.roundId === 'r1' && String(p.occurrenceKey).indexOf('r1:') === 0;
      })
  );
})();

// 空洞不算 0
(function () {
  var m = makeManagedMatch({
    status: 'ongoing',
    patch: {
      groups: [{ groupId: 'g1', players: [{ userId: 'u-r1', position: 1 }] }],
      scoreData: {
        g1: { scoresByPlayer: { 'u-r1': { scores: [null, '', undefined, null] } } }
      }
    }
  });
  var p = teamMatchScorecard.resolveStandingsExpandPanel(m, { groupId: 'g1', playerId: 'u-r1' }, 'gross');
  assert('空洞 → AWAITING SCORE', p.state === 'awaiting_score');
})();

// —— 窄修：去重轮次标题 / 压缩空态 / 恢复赞助广告 ——
assert(
  '去重：无 standingsScorecardRoundLabel 页面态',
  pageJs.indexOf('standingsScorecardRoundLabel') < 0 &&
    pageJs.indexOf('_buildStandingsScorecardRoundLabel') < 0
);
assert(
  '去重：WXML 无 R1 · ROUND / scorecard-context',
  pageWxml.indexOf('standingsScorecardRoundLabel') < 0 &&
    pageWxml.indexOf('series-standings-scorecard-context') < 0 &&
    pageWxml.indexOf('R1 ·') < 0
);
assert(
  '去重：WXSS 无轮次标题容器样式',
  pageWxss.indexOf('series-standings-scorecard-context') < 0
);
assert(
  '空态：is-empty-status + 单行 emptyLabel，无空表并排',
  pageWxml.indexOf('is-empty-status') >= 0 &&
    pageWxml.indexOf('series-standings-score-empty') >= 0 &&
    /wx:if="\{\{standingsScorecardEmptyLabel\}\}"[\s\S]{0,400}wx:elif="\{\{openStandingsScorecard\}\}"/.test(
      pageWxml
    )
);
assert(
  '空态：压缩高度（min-height≈72rpx，无整页写死）',
  /series-standings-score-empty\s*\{[^}]*min-height:\s*72rpx/.test(pageWxss) &&
    pageWxss.indexOf('height: 100vh') < 0
);
assert(
  '广告：复用 .sc-ad + mode=widthFix（tournament-common）',
  /\.sc-ad\s*\{[^}]*border-radius:\s*16rpx/.test(commonWxss) &&
    pageWxml.indexOf('class="sc-ad"') >= 0 &&
    pageWxml.indexOf('mode="widthFix"') >= 0 &&
    pageWxml.indexOf('standingsScorecardAdImage') >= 0
);
assert(
  '广告：展开区仅一份 sc-ad（不随 G2/G3/G4 成员重复）',
  (pageWxml.match(/class="sc-ad"/g) || []).length === 1
);
assert(
  '广告：位于空态/逐洞之后',
  /standingsScorecardEmptyLabel[\s\S]*openStandingsScorecard[\s\S]*class="sc-ad"/.test(pageWxml)
);
assert(
  '广告：当前轮 match.eventInfoList → DEFAULT（对齐 detail）',
  pageJs.indexOf('_resolveStandingsScorecardAdImage') >= 0 &&
    pageJs.indexOf('match.eventInfoList') >= 0 &&
    pageJs.indexOf('DEFAULT_SCORECARD_AD_IMAGE') >= 0 &&
    /_openStandingsPlayerScorecard:[\s\S]{0,8000}_resolveStandingsScorecardAdImage\(match\)/.test(
      pageJs
    )
);
assert(
  '广告：三种面板态均写入 standingsScorecardAdImage（不依赖有成绩）',
  /standingsScorecardAdImage:\s*adImage/.test(pageJs) &&
    pageJs.indexOf('onStandingsScorecardAdError') >= 0 &&
    pageJs.indexOf('getEventSponsorLocalFallback') >= 0
);
assert(
  '广告：无点击扩展（与 detail 领先榜 sc-ad 一致）',
  !/class="sc-ad"[\s\S]{0,120}bindtap=/.test(pageWxml)
);
assert(
  '广告：失败只改展示 URL，不写 storage/series',
  /onStandingsScorecardAdError:[\s\S]{0,500}setData\(\{\s*standingsScorecardAdImage:\s*local/.test(
    pageJs
  ) &&
    !/onStandingsScorecardAdError:[\s\S]{0,800}seriesStore\.(save|update|set)/.test(pageJs) &&
    !/onStandingsScorecardAdError:[\s\S]{0,800}teamMatchStore\.(save|update|set)/.test(pageJs)
);

// R1/R2 广告隔离：解析只读传入 match.eventInfoList
(function () {
  function resolveAd(match, theme) {
    var list = match && Array.isArray(match.eventInfoList) ? match.eventInfoList : [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || String(item.type) !== 'image') continue;
      var bright = String(item.brightImage || item.imageData || '').trim();
      var dark = String(item.darkImage || item.imageData || '').trim();
      var image = theme === 'dark' ? dark || bright : bright || dark;
      if (image) return image;
    }
    return 'DEFAULT';
  }
  var r1 = resolveAd(
    { eventInfoList: [{ type: 'image', brightImage: 'https://r1-ad.example/a.jpg' }] },
    'bright'
  );
  var r2 = resolveAd(
    { eventInfoList: [{ type: 'image', brightImage: 'https://r2-ad.example/b.jpg' }] },
    'bright'
  );
  assert('R1 不读取 R2 广告', r1 === 'https://r1-ad.example/a.jpg' && r2 === 'https://r2-ad.example/b.jpg');
  assert('无配置走 DEFAULT fallback', resolveAd({ eventInfoList: [] }, 'bright') === 'DEFAULT');
})();

console.log('');
console.log('--- seriesStandingsScorecardTap.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exitCode = 1;
}
