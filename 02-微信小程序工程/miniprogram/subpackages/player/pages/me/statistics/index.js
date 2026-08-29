/**
 * 数据统计 — UI + mock（产品规则模型）
 *
 * 统计对象：当前用户「个人比杆赛」已完成且 18 洞完整的 Game
 * 最多取最近 10 场；不足则全量；不补空、不造假点
 * 图表点色 = 该场 T 台（BLUE_T / RED_T）
 * 暂不接真实成绩接口
 */
const { createHeaderStyle } = require('../../../../../utils/headerEngine.js');
const { BLUE_T, RED_T } = require('../../../../../utils/tPosition.js');

const TEE_COLOR_BLUE = '#00aeef';
const TEE_COLOR_RED = '#dc2626';
const MAX_ROUNDS = 10;
const FORMAT_INDIVIDUAL_STROKE = 'individual_stroke';
const STATUS_FINISHED = 'finished';

/**
 * mock Game 池：含不符合条件项，经筛选管线后才进入统计
 * （模拟：本人参与 / 个人比杆 / 已完成 / 18洞完整 / 有总杆）
 */
const MOCK_GAME_POOL = [
  // —— 不符合：进行中 ——
  {
    id: 'g-progress',
    isMe: true,
    format: FORMAT_INDIVIDUAL_STROKE,
    status: 'in_progress',
    holesComplete: 12,
    totalScore: null,
    putting: 20,
    girHits: 4,
    girAttempts: 12,
    par3Avg: 3.5,
    par4Avg: 4.5,
    par5Avg: 5.5,
    tPosition: BLUE_T,
    completedAt: '2026-08-03T10:00:00'
  },
  // —— 不符合：队内赛 ——
  {
    id: 'g-team',
    isMe: true,
    format: 'team_stroke',
    status: STATUS_FINISHED,
    holesComplete: 18,
    totalScore: 79,
    putting: 31,
    girHits: 7,
    girAttempts: 18,
    par3Avg: 3.8,
    par4Avg: 4.6,
    par5Avg: 5.4,
    tPosition: BLUE_T,
    completedAt: '2026-08-02T09:00:00'
  },
  // —— 符合条件（按完成时间倒序，取最近最多 10 场）——
  {
    id: 'g-10',
    isMe: true,
    format: FORMAT_INDIVIDUAL_STROKE,
    status: STATUS_FINISHED,
    holesComplete: 18,
    totalScore: 78,
    putting: 30,
    girHits: 9,
    girAttempts: 18,
    par3Avg: 3.9,
    par4Avg: 4.9,
    par5Avg: 5.9,
    tPosition: BLUE_T,
    completedAt: '2026-08-01T07:30:00'
  },
  {
    id: 'g-09',
    isMe: true,
    format: FORMAT_INDIVIDUAL_STROKE,
    status: STATUS_FINISHED,
    holesComplete: 18,
    totalScore: 77,
    putting: 28,
    girHits: 8,
    girAttempts: 18,
    par3Avg: 3.7,
    par4Avg: 4.7,
    par5Avg: 5.7,
    tPosition: RED_T,
    completedAt: '2026-07-28T08:00:00'
  },
  {
    id: 'g-08',
    isMe: true,
    format: FORMAT_INDIVIDUAL_STROKE,
    status: STATUS_FINISHED,
    holesComplete: 18,
    totalScore: 70,
    putting: 25,
    girHits: 10,
    girAttempts: 18,
    par3Avg: 2.9,
    par4Avg: 3.9,
    par5Avg: 4.9,
    tPosition: BLUE_T,
    completedAt: '2026-07-20T13:20:00'
  },
  {
    id: 'g-07',
    isMe: true,
    format: FORMAT_INDIVIDUAL_STROKE,
    status: STATUS_FINISHED,
    holesComplete: 18,
    totalScore: 68,
    putting: 25,
    girHits: 11,
    girAttempts: 18,
    par3Avg: 2.8,
    par4Avg: 3.8,
    par5Avg: 4.8,
    tPosition: BLUE_T,
    completedAt: '2026-07-12T06:50:00'
  },
  {
    id: 'g-06',
    isMe: true,
    format: FORMAT_INDIVIDUAL_STROKE,
    status: STATUS_FINISHED,
    holesComplete: 18,
    totalScore: 72,
    putting: 34,
    girHits: 6,
    girAttempts: 18,
    par3Avg: 4.8,
    par4Avg: 4.9,
    par5Avg: 5.9,
    tPosition: RED_T,
    completedAt: '2026-06-30T09:10:00'
  },
  {
    id: 'g-05',
    isMe: true,
    format: FORMAT_INDIVIDUAL_STROKE,
    status: STATUS_FINISHED,
    holesComplete: 18,
    totalScore: 74,
    putting: 36,
    girHits: 7,
    girAttempts: 18,
    par3Avg: 5.2,
    par4Avg: 5.5,
    par5Avg: 6.5,
    tPosition: BLUE_T,
    completedAt: '2026-06-15T07:00:00'
  },
  {
    id: 'g-04',
    isMe: true,
    format: FORMAT_INDIVIDUAL_STROKE,
    status: STATUS_FINISHED,
    holesComplete: 18,
    totalScore: 78,
    putting: 29,
    girHits: 8,
    girAttempts: 18,
    par3Avg: 3.8,
    par4Avg: 4.1,
    par5Avg: 5.1,
    tPosition: BLUE_T,
    completedAt: '2026-05-22T14:00:00'
  },
  {
    id: 'g-03',
    isMe: true,
    format: FORMAT_INDIVIDUAL_STROKE,
    status: STATUS_FINISHED,
    holesComplete: 18,
    totalScore: 84,
    putting: 33,
    girHits: 5,
    girAttempts: 18,
    par3Avg: 4.4,
    par4Avg: 4.8,
    par5Avg: 5.8,
    tPosition: RED_T,
    completedAt: '2026-05-08T08:30:00'
  },
  {
    id: 'g-02',
    isMe: true,
    format: FORMAT_INDIVIDUAL_STROKE,
    status: STATUS_FINISHED,
    holesComplete: 18,
    totalScore: 76,
    putting: 28,
    girHits: 7,
    girAttempts: 18,
    par3Avg: 3.6,
    par4Avg: 4.2,
    par5Avg: 5.2,
    tPosition: BLUE_T,
    completedAt: '2026-04-18T07:15:00'
  },
  {
    id: 'g-01',
    isMe: true,
    format: FORMAT_INDIVIDUAL_STROKE,
    status: STATUS_FINISHED,
    holesComplete: 18,
    totalScore: 80,
    putting: 30,
    girHits: 6,
    girAttempts: 18,
    par3Avg: 3.9,
    par4Avg: 4.5,
    par5Avg: 5.5,
    tPosition: BLUE_T,
    completedAt: '2026-04-01T08:00:00'
  },
  // —— 不符合：未完成 18 洞 ——
  {
    id: 'g-incomplete',
    isMe: true,
    format: FORMAT_INDIVIDUAL_STROKE,
    status: STATUS_FINISHED,
    holesComplete: 15,
    totalScore: 66,
    putting: 22,
    girHits: 5,
    girAttempts: 15,
    par3Avg: 3.5,
    par4Avg: 4.2,
    par5Avg: 5.1,
    tPosition: BLUE_T,
    completedAt: '2026-03-20T09:00:00'
  }
];

function teeColor(tPosition) {
  return tPosition === RED_T ? TEE_COLOR_RED : TEE_COLOR_BLUE;
}

/**
 * 筛选管线（mock 阶段对 MOCK_GAME_POOL 执行；日后替换为真实 Game 列表）
 * Game历史 → 本人 → 个人比杆 → 已完成 → 18洞完整且有总杆 → 倒序 → 最多 10 场
 */
function selectEligibleGames(pool) {
  return (pool || [])
    .filter((g) => g && g.isMe === true)
    .filter((g) => g.format === FORMAT_INDIVIDUAL_STROKE)
    .filter((g) => g.status === STATUS_FINISHED)
    .filter((g) => Number(g.holesComplete) === 18)
    .filter((g) => g.totalScore != null && g.totalScore !== '' && Number.isFinite(Number(g.totalScore)))
    .slice()
    .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')))
    .slice(0, MAX_ROUNDS);
}

/** 图表页脚：按实际场次动态文案（不固定「最近十场」） */
function buildRoundsFooter(count) {
  const n = Number(count) || 0;
  if (n <= 0) return '暂无完整个人比杆赛成绩';
  if (n >= MAX_ROUNDS) return '最近' + MAX_ROUNDS + '场个人比杆赛';
  return '最近' + n + '场个人比杆赛';
}

function avgOf(nums) {
  if (!nums.length) return 0;
  const sum = nums.reduce((a, b) => a + b, 0);
  return Math.round((sum / nums.length) * 10) / 10;
}

/**
 * 由符合条件的 Game 列表构建统计模型
 * chart 横轴：时间正序（左旧右新）；不补空点
 */
function buildStatisticsFromGames(eligibleNewestFirst) {
  const newestFirst = eligibleNewestFirst || [];
  const count = newestFirst.length;
  const chronological = newestFirst.slice().reverse();
  const footer = buildRoundsFooter(count);

  const strokeValues = chronological.map((g) => Number(g.totalScore));
  const puttingValues = chronological.map((g) => Number(g.putting));
  const girRates = chronological.map((g) => {
    const att = Number(g.girAttempts) || 0;
    const hits = Number(g.girHits) || 0;
    if (att <= 0) return 0;
    return Math.round((hits / att) * 1000) / 10;
  });
  const tees = chronological.map((g) => g.tPosition || BLUE_T);
  const gameIds = chronological.map((g) => g.id);

  let girHitsSum = 0;
  let girAttSum = 0;
  chronological.forEach((g) => {
    girHitsSum += Number(g.girHits) || 0;
    girAttSum += Number(g.girAttempts) || 0;
  });
  const girRate =
    girAttSum > 0 ? Math.round((girHitsSum / girAttSum) * 1000) / 10 : 0;

  const par3Values = chronological.map((g) => Number(g.par3Avg));
  const par4Values = chronological.map((g) => Number(g.par4Avg));
  const par5Values = chronological.map((g) => Number(g.par5Avg));

  return {
    sampleCount: count,
    roundsFooter: footer,
    totalStrokes: {
      eyebrow: 'Total Strokes',
      title: '总杆趋势',
      averageLabel: 'Average',
      average: avgOf(strokeValues),
      footer: footer,
      series: strokeValues,
      tees: tees,
      gameIds: gameIds
    },
    putting: {
      eyebrow: 'Putting',
      title: '推杆表现',
      averageLabel: 'Average',
      average: avgOf(puttingValues),
      footer: footer,
      series: puttingValues,
      tees: tees,
      gameIds: gameIds
    },
    girPerformance: {
      eyebrow: 'GIR Performance',
      title: '标准ON表现',
      averageLabel: 'Rate',
      rate: girRate,
      totalAttempts: girAttSum,
      successfulCount: girHitsSum,
      footer: footer,
      series: girRates,
      tees: tees,
      gameIds: gameIds
    },
    parPerformance: {
      eyebrow: 'PAR Performance',
      title: '标准杆表现',
      activePar: 3,
      tabs: [
        {
          par: 3,
          label: 'PAR 3',
          average: avgOf(par3Values),
          series: par3Values,
          tees: tees,
          gameIds: gameIds
        },
        {
          par: 4,
          label: 'PAR 4',
          average: avgOf(par4Values),
          series: par4Values,
          tees: tees,
          gameIds: gameIds
        },
        {
          par: 5,
          label: 'PAR 5',
          average: avgOf(par5Values),
          series: par5Values,
          tees: tees,
          gameIds: gameIds
        }
      ]
    }
  };
}

/**
 * Y 轴：按实际 min/max 线性映射（数据差距 = 像素比例）
 * 点色：仅 T 台蓝/红；不按成绩好坏着色
 */
function buildChartModel(series, tees) {
  const data = Array.isArray(series) ? series.slice() : [];
  const teeList = Array.isArray(tees) ? tees : [];
  if (!data.length) {
    return {
      min: 0,
      max: 0,
      range: 0,
      gridLines: [],
      gridBands: [],
      avgYPct: 0,
      points: [],
      empty: true
    };
  }

  const actualMin = Math.min.apply(null, data);
  const actualMax = Math.max.apply(null, data);
  let minVal = actualMin;
  let maxVal = actualMax;
  let range = maxVal - minVal;
  if (range <= 0) {
    minVal = actualMin - 1;
    maxVal = actualMax + 1;
    range = maxVal - minVal;
  }

  const gridCount = 4;
  const gridLines = [];
  const gridBands = [];
  for (let i = 0; i <= gridCount; i++) {
    const val = minVal + range * (i / gridCount);
    const yPct = (i / gridCount) * 100;
    const useDecimal = range < 10;
    gridLines.push({
      id: 'g' + i,
      yPct: yPct,
      label: useDecimal ? val.toFixed(1) : String(Math.round(val))
    });
    if (i % 2 === 0 && i < gridCount) {
      gridBands.push({
        id: 'b' + i,
        yPct: yPct,
        heightPct: 100 / gridCount
      });
    }
  }

  const sum = data.reduce((a, b) => a + b, 0);
  const avg = sum / data.length;
  const avgYPct = ((avg - minVal) / range) * 100;

  const n = data.length;
  const points = data.map((val, i) => {
    const xPct = n === 1 ? 50 : 10 + (i / (n - 1)) * 86;
    const yPct = ((val - minVal) / range) * 100;
    const color = teeColor(teeList[i] || BLUE_T);
    return {
      id: 'p' + i,
      xPct: xPct,
      yPct: yPct,
      valueText: Number.isInteger(val) ? String(val) : Number(val).toFixed(1),
      color: color
    };
  });

  return {
    min: minVal,
    max: maxVal,
    range: range,
    gridLines: gridLines,
    gridBands: gridBands,
    avgYPct: avgYPct,
    points: points,
    empty: false
  };
}

function getParTab(stats, par) {
  const tabs = (stats.parPerformance && stats.parPerformance.tabs) || [];
  return (
    tabs.find((t) => t.par === par) ||
    tabs[0] || { par: 3, average: 0, series: [], tees: [] }
  );
}

function buildViewModels(stats, activePar) {
  const parTab = getParTab(stats, activePar);
  const strokes = stats.totalStrokes || {};
  const putting = stats.putting || {};
  const gir = stats.girPerformance || {};
  return {
    totalStrokesChart: buildChartModel(strokes.series, strokes.tees),
    puttingChart: buildChartModel(putting.series, putting.tees),
    girChart: buildChartModel(gir.series, gir.tees),
    parChart: buildChartModel(parTab.series, parTab.tees),
    parAvgText: 'PAR' + parTab.par + ': ' + parTab.average,
    activePar: parTab.par
  };
}

function loadMockStatistics() {
  const eligible = selectEligibleGames(MOCK_GAME_POOL);
  return buildStatisticsFromGames(eligible);
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    statistics: loadMockStatistics(),
    activePar: 3,
    parAvgText: 'PAR3: 0',
    totalStrokesChart: { gridLines: [], gridBands: [], avgYPct: 0, points: [] },
    puttingChart: { gridLines: [], gridBands: [], avgYPct: 0, points: [] },
    girChart: { gridLines: [], gridBands: [], avgYPct: 0, points: [] },
    parChart: { gridLines: [], gridBands: [], avgYPct: 0, points: [] }
  },

  onLoad() {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const statistics = loadMockStatistics();
    this.setData({ statistics: statistics });
    this.refreshCharts(3);
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
  },

  initHeaderNav() {
    const styles = createHeaderStyle();
    this.setData({
      headerRootStyle: styles.headerRootStyle,
      headerBarStyle: styles.headerBarStyle
    });
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  refreshCharts(par) {
    const stats = this.data.statistics || loadMockStatistics();
    const models = buildViewModels(stats, par);
    this.setData(models);
  },

  onParTabTap(e) {
    const par = Number(
      (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.par) || 3
    );
    if (par !== 3 && par !== 4 && par !== 5) return;
    if (par === this.data.activePar) return;
    this.refreshCharts(par);
  },

  onBack() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/home/index' }) });
  }
});
