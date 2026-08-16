/**
 * 系列赛总榜 A 自测（队际赛领先榜复刻投影）
 * 仅内存 fixture；不写 storage；不进生产页。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStandings.selftest.js
 */

var path = require('path');
var fs = require('fs');

var standingsPath = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail',
  'seriesStandingsViewModel.js'
);
var detailVmPath = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail',
  'seriesDetailViewModel.js'
);
var pageDir = path.dirname(standingsPath);

var standingsVm = require(standingsPath);
var detailVm = require(detailVmPath);

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

function freezeClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function baseSeries(overrides) {
  var s = {
    seriesId: 'series-standings-1',
    lifecycleStatus: 'published',
    publishState: 'published',
    competitionPhaseCache: 'live',
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: '总榜骨架系列赛',
    seriesSubtitle: '',
    scoringRule: {
      mode: 'global_m',
      globalM: 3,
      allowRepeat: true,
      scoreBasis: 'gross'
    },
    participants: [
      {
        seriesParticipantId: 'team:a',
        kind: 'team',
        nameSnapshot: 'A队',
        shortNameSnapshot: 'A队'
      },
      {
        seriesParticipantId: 'team:b',
        kind: 'team',
        nameSnapshot: 'B队',
        shortNameSnapshot: 'B队'
      },
      {
        seriesParticipantId: 'team:c',
        kind: 'team',
        nameSnapshot: 'C队',
        shortNameSnapshot: 'C队'
      },
      {
        seriesParticipantId: 'team:d',
        kind: 'team',
        nameSnapshot: 'D队',
        shortNameSnapshot: 'D队'
      }
    ],
    rounds: [
      { roundId: 'r1', index: 1, name: '第1轮', roundStatus: 'completed', matchId: 'm1' },
      { roundId: 'r2', index: 2, name: '第2轮', roundStatus: 'completed', matchId: 'm2' },
      { roundId: 'r3', index: 3, name: '第3轮', roundStatus: 'live', matchId: 'm3' },
      { roundId: 'r4', index: 4, name: '第4轮', roundStatus: 'scheduled', matchId: '' },
      { roundId: 'r5', index: 5, name: '第5轮', roundStatus: 'cancelled', matchId: '' }
    ]
  };
  return Object.assign(s, overrides || {});
}

function roundStatesFixture() {
  return [
    {
      roundId: 'r1',
      index: 1,
      label: 'R1',
      roundStatus: 'completed',
      stationStatusLabel: '已结束',
      hasMatchId: true,
      statusToken: 'finished'
    },
    {
      roundId: 'r2',
      index: 2,
      label: 'R2',
      roundStatus: 'completed',
      stationStatusLabel: '已结束',
      hasMatchId: true,
      statusToken: 'finished'
    },
    {
      roundId: 'r3',
      index: 3,
      label: 'R3',
      roundStatus: 'live',
      stationStatusLabel: 'LIVE',
      hasMatchId: true,
      statusToken: 'live'
    },
    {
      roundId: 'r4',
      index: 4,
      label: 'R4',
      roundStatus: 'scheduled',
      stationStatusLabel: '',
      hasMatchId: false,
      statusToken: 'scheduled'
    },
    {
      roundId: 'r5',
      index: 5,
      label: 'R5',
      roundStatus: 'cancelled',
      stationStatusLabel: '',
      hasMatchId: false,
      statusToken: 'cancelled'
    }
  ];
}

/** 仅自测：显式 grossTotalValue / toParValue（禁止 gap 冒充） */
function fixtureStandingsResult() {
  return {
    participantRows: [
      {
        seriesParticipantId: 'team:a',
        rank: 1,
        grossTotalValue: 210,
        toParValue: -4,
        gapValue: 999,
        rankStatus: 'provisional',
        allEntries: [
          {
            entryId: 'e-a-r1',
            roundId: 'r1',
            roundIndex: 1,
            resultUnitType: 'player',
            unitId: 'u-a1',
            unitName: '甲',
            rankingValue: 70,
            grossTotalValue: 70,
            toParValue: -2,
            resultStatus: 'OK',
            thruLabel: 'F',
            counting: 'counted'
          },
          {
            entryId: 'e-a-r2',
            roundId: 'r2',
            roundIndex: 2,
            resultUnitType: 'player',
            unitId: 'u-a1',
            unitName: '甲',
            rankingValue: 71,
            grossTotalValue: 71,
            toParValue: 0,
            resultStatus: 'OK',
            thruLabel: 'F',
            counting: 'counted'
          },
          {
            entryId: 'e-a-r3',
            roundId: 'r3',
            roundIndex: 3,
            resultUnitType: 'entity',
            unitId: 'ent-a',
            unitName: '甲/乙',
            rankingValue: 69,
            grossTotalValue: 69,
            toParValue: -3,
            resultStatus: 'OK',
            thruLabel: '12',
            counting: 'counted'
          },
          {
            entryId: 'e-a-extra',
            roundId: 'r2',
            roundIndex: 2,
            resultUnitType: 'pair',
            unitId: 'pair-a',
            unitName: '丙/丁',
            rankingValue: 74,
            grossTotalValue: 74,
            toParValue: 3,
            resultStatus: 'OK',
            thruLabel: 'F',
            counting: 'excluded'
          },
          {
            entryId: 'e-a-pending',
            roundId: 'r1',
            roundIndex: 1,
            resultUnitType: 'player',
            unitId: 'u-a2',
            unitName: '戊',
            rankingValue: 69,
            grossTotalValue: 69,
            toParValue: -1,
            resultStatus: 'OK',
            thruLabel: 'F',
            counting: 'pending'
          }
        ]
      },
      {
        seriesParticipantId: 'team:b',
        rank: 2,
        grossTotalValue: 215,
        toParValue: 1,
        gapValue: 5,
        rankStatus: 'provisional',
        allEntries: [
          {
            entryId: 'e-b-r1',
            roundId: 'r1',
            roundIndex: 1,
            resultUnitType: 'player',
            unitId: 'u-b1',
            unitName: '己',
            rankingValue: 72,
            toParValue: 1,
            resultStatus: 'OK',
            thruLabel: 'F',
            counting: 'counted'
          }
        ]
      },
      {
        seriesParticipantId: 'team:c',
        rank: 3,
        grossTotalValue: 220,
        toParValue: 4,
        allEntries: []
      },
      {
        seriesParticipantId: 'team:d',
        rank: 4,
        grossTotalValue: 230,
        toParValue: 8,
        allEntries: []
      }
    ]
  };
}

(function testPerRoundIsolation() {
  var series = baseSeries({
    scoringRule: { mode: 'per_round_n', topN: 2, scoreBasis: 'gross', allowRepeat: false }
  });
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: 'cumulative',
    expandedParticipantId: '',
    roundStates: roundStatesFixture(),
    standingsResult: fixtureStandingsResult()
  });
  assert('per_round_n 进入总榜且无 TOT', vm.available === true && vm.showTot === false);
  assert(
    'per_round_n 选择器不含 TOT',
    vm.roundSelector.every(function (c) {
      return c.key !== 'cumulative' && c.label !== 'TOT';
    }) && vm.teamRows.length === 4
  );
})();

(function testEmptyScores() {
  var series = baseSeries();
  var before = freezeClone(series);
  var rs = roundStatesFixture();
  var empty = standingsVm.emptyStandingsResult();
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: 'cumulative',
    expandedParticipantId: 'team:a',
    roundStates: rs,
    standingsResult: empty
  });
  assert('无成绩仍生成全部球队行', vm.available && vm.teamRows.length === 4);
  assert(
    '空数据 POS/TOTAL/TO PAR 均为 ASCII -',
    vm.teamRows.every(function (r) {
      return r.pos === '-' && r.grossTotal === '-' && r.scoreStr === '-';
    })
  );
  assert(
    '空数据不出现中文破折号或伪造 E/T1',
    vm.teamRows.every(function (r) {
      return (
        r.pos !== '—' &&
        r.grossTotal !== '—' &&
        r.scoreStr !== '—' &&
        r.scoreStr !== 'E' &&
        r.pos !== 'T1'
      );
    })
  );
  assert(
    '配置顺序 A/B/C/D',
    vm.teamRows.map(function (r) {
      return r.teamId;
    }).join(',') === 'team:a,team:b,team:c,team:d'
  );
  assert(
    '累计展开数据预置且暂无累计成绩',
    vm.teamRows[0].players.length === 0 &&
      vm.teamRows[0].expandEmptyHint === '暂无累计成绩' &&
      vm.teamRows[0].isExpanded == null
  );
  assert('输入 series 不被修改', JSON.stringify(series) === JSON.stringify(before));
})();

(function testTotalToParMapping() {
  var result = fixtureStandingsResult();
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: baseSeries(),
    selectedKey: 'cumulative',
    expandedParticipantId: '',
    roundStates: roundStatesFixture(),
    standingsResult: result
  });
  var a = vm.teamRows[0];
  assert('TOTAL 来自 grossTotalValue', a.grossTotal === '210');
  assert('TO PAR 来自 toParValue=-4', a.scoreStr === '-4' && a.scoreClass === 'score-under');
  assert('未使用 gapValue=999 冒充 TO PAR', a.scoreStr !== '+999' && a.scoreStr !== '999');

  var onlyGross = {
    participantRows: [
      {
        seriesParticipantId: 'team:a',
        rank: 1,
        grossTotalValue: 428,
        // 故意不提供 toParValue
        gapValue: 3,
        allEntries: [
          {
            entryId: 'e1',
            roundId: 'r1',
            unitName: '甲',
            rankingValue: 72,
            // 仅有总杆，无 toParValue
            thruLabel: 'F',
            counting: 'counted'
          }
        ]
      },
      { seriesParticipantId: 'team:b', rank: 2, allEntries: [] },
      { seriesParticipantId: 'team:c', rank: 3, allEntries: [] },
      { seriesParticipantId: 'team:d', rank: 4, allEntries: [] }
    ]
  };
  var g = standingsVm.buildSeriesStandingsViewModel({
    series: baseSeries(),
    selectedKey: 'cumulative',
    expandedParticipantId: 'team:a',
    roundStates: roundStatesFixture(),
    standingsResult: onlyGross
  });
  assert('有 TOTAL 无 toPar 时 TO PAR 为 -', g.teamRows[0].grossTotal === '428' && g.teamRows[0].scoreStr === '-');
  assert(
    '展开无 toParValue 时 TO PAR 为 - 且不塞总杆',
    g.teamRows[0].players[0].scoreStr === '-' &&
      g.teamRows[0].players[0].scoreStr !== '72'
  );
})();

(function testScoreClass() {
  assert('负杆样式', standingsVm.resolveToParScoreClass(-2) === 'score-under');
  assert('even 样式', standingsVm.resolveToParScoreClass(0) === 'score-even');
  assert('正杆样式', standingsVm.resolveToParScoreClass(3) === 'score-over');
  assert('format -2', standingsVm.formatToParDiff(-2) === '-2');
  assert('format 0', standingsVm.formatToParDiff(0) === '0');
  assert('format +3', standingsVm.formatToParDiff(3) === '+3');

  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: baseSeries(),
    selectedKey: 'cumulative',
    expandedParticipantId: 'team:a',
    roundStates: roundStatesFixture(),
    standingsResult: fixtureStandingsResult()
  });
  var byName = {};
  vm.teamRows[0].players.forEach(function (p) {
    byName[p.name + '@' + p.roundLabel] = p;
  });
  assert('展开 -2 → score-under', byName['甲@R1'].scoreClass === 'score-under' && byName['甲@R1'].scoreStr === '-2');
  assert('展开 0 → score-even', byName['甲@R2'].scoreClass === 'score-even' && byName['甲@R2'].scoreStr === '0');
  assert('展开 +3 → score-over', byName['丙/丁@R2'].scoreClass === 'score-over' && byName['丙/丁@R2'].scoreStr === '+3');
})();

(function testMainBoardInvariant() {
  var series = baseSeries();
  var result = fixtureStandingsResult();
  var rs = roundStatesFixture();
  var keys = ['cumulative', 'r1', 'r2', 'r3'];
  var sigs = keys.map(function (key) {
    return standingsVm.mainBoardSignature(
      standingsVm.buildSeriesStandingsViewModel({
        series: series,
        selectedKey: key,
        expandedParticipantId: '',
        roundStates: rs,
        standingsResult: result
      })
    );
  });
  assert(
    'TOT 累计主榜签名稳定（不再要求 TOT===R）',
    sigs[0] === standingsVm.mainBoardSignature(
      standingsVm.buildSeriesStandingsViewModel({
        series: series,
        selectedKey: 'cumulative',
        expandedParticipantId: '',
        roundStates: rs,
        standingsResult: result
      })
    )
  );
  var cum = standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: 'cumulative',
    expandedParticipantId: 'team:a',
    roundStates: rs,
    standingsResult: result
  });
  var r1 = standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: 'r1',
    expandedParticipantId: 'team:a',
    roundStates: rs,
    standingsResult: result
  });
  assert(
    '主榜顺序 A/B/C/D',
    cum.teamRows.map(function (r) {
      return r.teamId;
    }).join(',') === 'team:a,team:b,team:c,team:d'
  );
  assert(
    '切换仅改变展开 players（VM 层；R 运行时 overlay 替换卡头）',
    cum.teamRows[0].players.length !== r1.teamRows[0].players.length
  );
  assert(
    '累计显示全部记录且含 R 标签',
    cum.teamRows[0].players.length === 5 &&
      cum.teamRows[0].players.every(function (p) {
        return p.showRoundTag === true;
      })
  );
  assert(
    '同一球员多轮不合并',
    cum.teamRows[0].players.filter(function (p) {
      return p.name === '甲';
    }).length >= 2
  );
  assert(
    'R1 只显示 R1',
    r1.teamRows[0].players.every(function (p) {
      return p.roundId === 'r1';
    })
  );
  assert(
    'player/entity/pair 均可显示',
    cum.teamRows[0].players.some(function (p) {
      return p.resultUnitType === 'player';
    }) &&
      cum.teamRows[0].players.some(function (p) {
        return p.resultUnitType === 'entity';
      }) &&
      cum.teamRows[0].players.some(function (p) {
        return p.resultUnitType === 'pair';
      })
  );
  assert(
    '计入线 scoringPlayersCount>0',
    cum.teamRows[0].scoringPlayersCount > 0 &&
      cum.teamRows[0].players.some(function (p) {
        return p.isCounting;
      }) &&
      cum.teamRows[0].players.some(function (p) {
        return p.isNonCounting;
      })
  );
  var countedNames = cum.teamRows[0].players
    .filter(function (p) {
      return p.counting === 'counted';
    })
    .map(function (p) {
      return p.name + '@' + p.roundLabel;
    });
  assert(
    'TOT 计入段按累计总杆升序',
    countedNames.join(',') === '甲/乙@R3,甲@R1,甲@R2',
    countedNames.join(',')
  );
  var onlyCounted = freezeClone(result);
  onlyCounted.participantRows[0].allEntries = onlyCounted.participantRows[0].allEntries.filter(
    function (e) {
      return e.counting === 'counted';
    }
  );
  var noLine = standingsVm.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: 'cumulative',
    expandedParticipantId: 'team:a',
    roundStates: rs,
    standingsResult: onlyCounted
  });
  assert('全计入无计入线', noLine.teamRows[0].scoringPlayersCount === 0);
})();

(function testRoundSelector() {
  var vm = standingsVm.buildSeriesStandingsViewModel({
    series: baseSeries(),
    selectedKey: 'r3',
    expandedParticipantId: '',
    roundStates: roundStatesFixture(),
    standingsResult: standingsVm.emptyStandingsResult()
  });
  assert(
    '累计显示文案为TOT且key仍为cumulative',
    vm.totalSelector &&
      vm.totalSelector.key === 'cumulative' &&
      vm.totalSelector.label === 'TOT' &&
      vm.totalSelector.isSelected === false &&
      vm.roundSelector[0].key === 'cumulative' &&
      vm.roundSelector[0].label === 'TOT'
  );
  assert(
    'R项不在 totalSelector、全在 roundSelectorItems',
    Array.isArray(vm.roundSelectorItems) &&
      vm.roundSelectorItems.length === roundStatesFixture().length &&
      vm.roundSelectorItems.every(function (x) {
        return x.key !== 'cumulative';
      }) &&
      !vm.roundSelectorItems.some(function (x) {
        return x.label === 'TOT';
      })
  );
  var live = vm.roundSelectorItems.find(function (x) {
    return x.key === 'r3';
  });
  assert('LIVE 状态', live && live.isLive && live.isSelected);

  var totOnly = standingsVm.buildSeriesStandingsViewModel({
    series: baseSeries({ rounds: [] }),
    selectedKey: 'cumulative',
    roundStates: [],
    standingsResult: standingsVm.emptyStandingsResult()
  });
  assert(
    '无轮次时仍显示TOT',
    totOnly.totalSelector.label === 'TOT' &&
      totOnly.totalSelector.isSelected === true &&
      totOnly.roundSelectorItems.length === 0
  );

  var parts = standingsVm.buildRoundSelectorParts(roundStatesFixture(), 'cumulative');
  assert(
    '拆分纯函数稳定且不依赖 index===0',
    parts.totalSelector.key === 'cumulative' &&
      parts.roundSelectorItems[0].label === 'R1'
  );
})();

(function testPageSourceGuards() {
  var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
  var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
  var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
  var dockWxml = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'miniprogram',
      'components',
      'series-round-selector-dock',
      'index.wxml'
    ),
    'utf8'
  );
  var standingsSrc = fs.readFileSync(standingsPath, 'utf8');

  var pageWxmlNoComments = pageWxml.replace(/<!--[\s\S]*?-->/g, '');
  assert(
    'WXML 复刻 POS/TEAM/TOTAL/TO PAR',
    pageWxml.indexOf('>POS<') >= 0 &&
      pageWxml.indexOf('>TEAM<') >= 0 &&
      pageWxml.indexOf("headThruLabel || 'TOTAL'") >= 0 &&
      pageWxml.indexOf("headScoreLabel || 'TO PAR'") >= 0 &&
      pageWxml.indexOf('>TO PAR<') >= 0 &&
      pageWxml.indexOf('leaderboard-view-label') >= 0 &&
      pageWxmlNoComments.indexOf('排名') < 0 &&
      pageWxmlNoComments.indexOf('球队/分队') < 0
  );
  assert(
    '轮次选择器双克隆与横向同步字段',
    pageWxml.indexOf('series-round-dock--inflow') >= 0 &&
      pageWxml.indexOf('series-round-dock--fixed') >= 0 &&
      pageWxml.indexOf('series-round-dock__inner') >= 0 &&
      pageWxml.indexOf('series-round-selector-dock') >= 0 &&
      (pageWxml.match(/<series-round-selector-dock/g) || []).length >= 4 &&
      pageWxml.indexOf('standings.totalSelector') >= 0 &&
      pageWxml.indexOf('standings.roundSelectorItems') >= 0 &&
      pageWxml.indexOf('onRoundSelectorHScroll') >= 0 &&
      pageJs.indexOf('onRoundSelectorHScroll') >= 0 &&
      pageJs.indexOf('.series-round-dock--inflow') >= 0
  );
  var fillerPos = pageWxml.indexOf('series-scroll-filler');
  var mainScrollClose = pageWxml.indexOf('</scroll-view>', fillerPos);
  // 总榜 fixed dock（勿用 lastIndexOf：其后还有赛程 fixed）
  var fixedIdx = pageWxml.indexOf('series-round-dock--fixed');
  var inflowIdx = pageWxml.indexOf('series-round-dock--inflow');
  // detail-main 可带 flush 动态 class，禁止要求 series-detail-main 后立刻收引号
  var detailMainIdx = pageWxml.indexOf('detail-main series-detail-main');
  var tabInflowIdx = pageWxml.indexOf('tab-scroll-wrap--inflow');
  var tabFixedIdx = pageWxml.indexOf('tab-scroll-wrap--fixed');
  // TOT 在 template 中位于 scroll-view 之前，且不出现在 scroll-view 标签内
  var tplStart = 0;
  var tpl = dockWxml;
  var totPos = tpl.indexOf('series-standings-tot');
  var scrollOpen = tpl.indexOf('<scroll-view');
  var scrollClose = tpl.indexOf('</scroll-view>');
  assert(
    'TOT不在横向scroll-view内',
    totPos >= 0 &&
      scrollOpen > totPos &&
      scrollClose > scrollOpen &&
      (tpl.indexOf('series-standings-tot', scrollOpen) < 0 ||
        tpl.indexOf('series-standings-tot', scrollOpen) > scrollClose)
  );
  var fixedBlock = pageWxml.slice(fixedIdx, fixedIdx + 420);
  assert(
    '独立二级 dock：流内在 TAB 后、fixed 在主 scroll 外且非横向 scroll',
    inflowIdx > 0 &&
      tabInflowIdx >= 0 &&
      inflowIdx > tabInflowIdx &&
      detailMainIdx > inflowIdx &&
      fixedIdx > mainScrollClose &&
      fixedIdx > tabFixedIdx &&
      mainScrollClose > fillerPos &&
      fixedBlock.indexOf('series-round-dock__inner') >= 0 &&
      /style="top:\{\{stickyRoundSelectorTop\}\}px;"/.test(fixedBlock) &&
      fixedBlock.indexOf('series-standings-round-scroll') < 0
  );
  assert(
    '二级 fixed dock 壳锁定样式与 32rpx 内层对齐',
    /position\s*:\s*fixed/.test(pageWxss) &&
      pageWxss.indexOf('.series-round-dock--fixed') >= 0 &&
      pageWxss.indexOf('z-index: 129') >= 0 &&
      pageWxss.indexOf('series-round-dock--covered') >= 0 &&
      pageWxss.indexOf('overflow: hidden') >= 0 &&
      /\.series-round-dock__inner\s*\{[^}]*padding:\s*12rpx\s+32rpx/.test(pageWxss) &&
      /\.series-round-dock--fixed\s*\{[^}]*background:\s*var\(--bg-primary\)/.test(pageWxss) &&
      !/\.series-standings-round-scroll\s*\{[^}]*position:\s*fixed/.test(pageWxss) &&
      !/\.series-round-dock--(inflow|fixed)\s*\{[^}]*margin-top\s*:/.test(pageWxss)
  );
  assert(
    '点击TOT不改写横向scrollLeft',
    pageJs.indexOf('onStandingsRoundTap') >= 0 &&
      pageJs.indexOf('不改写 roundSelectorScrollLeft') >= 0
  );
  assert(
    'WXML 对齐 PK 展开与计入线',
    pageWxml.indexOf('team.scoringPlayersCount > 0 && playerIndex === team.scoringPlayersCount') >= 0 &&
      pageWxml.indexOf('team-leaderboard-divider-strong') >= 0 &&
      pageWxml.indexOf('player.isCounting') >= 0 &&
      pageWxml.indexOf('series-standings-rank-meta') < 0 &&
      pageWxml.indexOf('series-standings-counting') < 0
  );
  assert(
    '展开对齐队际赛：页面 expandedStandingsTeamId 轻量切换',
    pageWxml.indexOf('expandedStandingsTeamId === team.teamId') >= 0 &&
      pageWxml.indexOf('series-standings-expanded-panel') >= 0 &&
      pageWxml.indexOf('data-team-id="{{team.teamId}}"') >= 0 &&
      pageJs.indexOf('expandedStandingsTeamId') >= 0 &&
      pageJs.indexOf('_applyStandingsExpandChange') >= 0 &&
      pageJs.indexOf('currentFiller + panelH') >= 0 &&
      // 仅约束 onStandingsTeamTap 函数体不重建投影（页面其他路径可调用 rebuild）
      !/onStandingsTeamTap:\s*function\s*\([^)]*\)\s*\{[\s\S]{0,1200}?_rebuildStandingsProjection/.test(
        pageJs
      ) &&
      pageJs.indexOf('scheduleStandingsContentFillerMeasure') >= 0 &&
      standingsSrc.indexOf('isExpanded:') < 0
  );
  assert(
    'WXSS 已删除破坏性自建榜样式',
    pageWxss.indexOf('.series-standings-rank-meta') < 0 &&
      pageWxss.indexOf('.series-standings-counting') < 0 &&
      pageWxss.indexOf('.series-standings-board') < 0 &&
      pageWxss.indexOf('.series-standings-round-chip') >= 0
  );
  assert(
    '生产接入 assembler 且无 gap 冒充 toPar 逻辑',
    pageJs.indexOf('seriesStandingsAssembler.buildStandingsResult') >= 0 &&
      pageJs.indexOf('_cachedStandingsResult') >= 0 &&
      standingsSrc.indexOf('readGrossTotalValue') >= 0 &&
      standingsSrc.indexOf('readToParValue') >= 0 &&
      standingsSrc.indexOf('resultRow.gapValue') < 0 &&
      standingsSrc.indexOf('entry.gapValue') < 0 &&
      standingsSrc.indexOf('teamMatchStore') < 0 &&
      standingsSrc.indexOf('scoreData') < 0
  );

  var detailBuilt = detailVm.buildSeriesDetailViewModel(baseSeries(), {
    preview: false,
    theme: 'bright',
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    },
    standingsResult: standingsVm.emptyStandingsResult()
  });
  assert(
    'Detail 装配空榜为 -',
    detailBuilt.ok &&
      detailBuilt.standings.teamRows[0].pos === '-' &&
      detailBuilt.standings.teamRows[0].grossTotal === '-' &&
      detailBuilt.standings.teamRows[0].scoreStr === '-' &&
      detailBuilt.hero &&
      detailBuilt.tabs.length === 5
  );
})();

console.log('');
console.log('---- seriesStandings.selftest (总榜 A · PK 复刻) ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
