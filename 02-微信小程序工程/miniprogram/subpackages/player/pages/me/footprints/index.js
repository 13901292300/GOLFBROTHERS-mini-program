/**
 * 江湖足迹 — UI 迁移页（静态 mock，无真实数据接口）
 * 原型：01-HTML原型/我的/江湖足迹（DARK）
 * Hero 身份/竞技指标：与「我的」共用 userProfileStore
 */
const { createHeaderStyle } = require('../../../../../utils/headerEngine.js');
const userProfileStore = require('../../../../../utils/userProfileStore.js');

/** 格式化竞技数值展示（保留原值精度） */
function formatMetricValue(value) {
  if (value == null || value === '') return '-';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return String(n);
}

/** 从统一资料源构建 Hero 身份区（不在本页维护独立 avatar/nickname/竞技 mock） */
function buildHeroProfile() {
  const p = userProfileStore.loadProfile();
  const nickname = String(p.nickname || '').trim();
  return {
    avatar: p.avatar || userProfileStore.DEFAULT_AVATAR,
    nickname: nickname || '未设置昵称',
    handicap: p.handicap,
    floatCoef: p.floatCoef,
    handicapText: formatMetricValue(p.handicap),
    floatCoefText: formatMetricValue(p.floatCoef),
    // 足迹页附属文案（非「我的」身份字段，保持原 mock）
    sinceLabel: 'Active Since 2017',
    daysOnTour: '2,847 Days on Tour'
  };
}

/**
 * 成绩走势 mock — 唯一年度数据源 yearStats
 * 同一对象同时驱动：年份 X / 柱(roundCount) / 折线(avgScore) / 下方明细
 * 超过 CHART_VIEWPORT_YEARS 年时横向滚动，不压缩列宽
 */
const YEAR_STATS_ALL = [
  { year: 2013, roundCount: 14, avgScore: 102 },
  { year: 2014, roundCount: 18, avgScore: 100 },
  { year: 2015, roundCount: 22, avgScore: 98 },
  { year: 2016, roundCount: 26, avgScore: 97 },
  { year: 2017, roundCount: 28, avgScore: 96 },
  { year: 2018, roundCount: 42, avgScore: 94 },
  { year: 2019, roundCount: 55, avgScore: 92 },
  { year: 2020, roundCount: 38, avgScore: 91 },
  { year: 2021, roundCount: 68, avgScore: 90 },
  { year: 2022, roundCount: 72, avgScore: 89 },
  { year: 2023, roundCount: 88, avgScore: 88 },
  { year: 2024, roundCount: 90, avgScore: 86, highlight: true }
];

/** 视窗最多展示年数；超出部分横向滚动，默认落在最近 N 年 */
const CHART_VIEWPORT_YEARS = 8;
/** 每一年固定列宽（rpx），禁止压缩；轨道 = n × 列宽 */
const CHART_COL_WIDTH_RPX = 80;

/** 折线 SVG 逻辑尺寸；X = (i + 0.5) / n * W，与列中心对齐 */
const CHART_PLOT_SVG_H = 200;
const CHART_PLOT_SVG_W = 1000;

function sliceYearStats(range) {
  if (range === '3y') return YEAR_STATS_ALL.slice(-3);
  if (range === '5y') return YEAR_STATS_ALL.slice(-5);
  return YEAR_STATS_ALL.slice();
}

function clampPct(pct) {
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return Math.round(pct * 100) / 100;
}

/** 选取不小于 raw 的「好看」整数步长 */
function niceIntStep(raw) {
  const n = Math.max(1, Math.ceil(Number(raw) || 1));
  const candidates = [1, 2, 5, 10, 15, 20, 25, 50, 100];
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i] >= n) return candidates[i];
  }
  return Math.ceil(n / 50) * 50;
}

/**
 * 左轴（平均杆数）：按当前切片 avgScore 动态生成整数刻度
 * 顶→底：scoreMax → scoreMin（杆数越高越靠上）
 * 禁止小数
 */
function buildScoreAxisFromData(scores) {
  const list = (scores || []).filter(function (s) {
    return Number.isFinite(Number(s));
  }).map(function (s) {
    return Math.round(Number(s));
  });
  let minS = 80;
  let maxS = 100;
  if (list.length) {
    minS = Math.min.apply(null, list);
    maxS = Math.max.apply(null, list);
  }
  if (minS === maxS) {
    minS -= 4;
    maxS += 4;
  }
  // 上下各留约 2 杆余量
  let axisMin = Math.floor(minS) - 2;
  let axisMax = Math.ceil(maxS) + 2;
  const step = niceIntStep((axisMax - axisMin) / 4);
  axisMax = Math.ceil(axisMax / step) * step;
  axisMin = Math.floor(axisMin / step) * step;
  if (axisMax <= axisMin) axisMax = axisMin + step * 4;

  const ticks = [];
  for (let v = axisMax; v >= axisMin; v -= step) {
    ticks.push(Math.round(v));
  }
  if (ticks[ticks.length - 1] !== axisMin) ticks.push(Math.round(axisMin));
  return { scoreMax: axisMax, scoreMin: axisMin, ticks: ticks };
}

/**
 * 右轴（完整轮次）：按 maxRoundCount 动态生成整数刻度
 * 顶→底：roundMax → 0
 */
function buildRoundAxisFromData(maxRoundCount) {
  const maxR = Math.max(1, Math.ceil(Number(maxRoundCount) || 1));
  const step = niceIntStep(maxR / 4);
  let top = Math.ceil(maxR / step) * step;
  if (top < step) top = step;
  const ticks = [];
  for (let v = top; v >= 0; v -= step) {
    ticks.push(Math.round(v));
  }
  if (ticks[ticks.length - 1] !== 0) ticks.push(0);
  return { roundMax: top, ticks: ticks };
}

/**
 * 柱高（右轴独立比例）：
 * barHeightPct = roundCount / maxRoundCount * 100
 * 分母取右轴顶刻度 roundMax（由用户 maxRoundCount 动态上卷），保证柱高与右轴对齐
 */
function calcBarHeightPct(roundCount, roundMax) {
  const maxR = roundMax > 0 ? roundMax : 1;
  return clampPct((Number(roundCount) || 0) / maxR * 100);
}

/**
 * 折线点 top%（左轴独立比例，正向杆数坐标）：
 * lineTopPct = (scoreMax - avgScore) / (scoreMax - scoreMin) * 100
 * 杆数越高 → top 越小 → 屏幕越高；杆数降低 → 折线视觉向下
 */
function calcLineTopPct(avgScore, scoreMax, scoreMin) {
  const span = scoreMax - scoreMin || 1;
  return clampPct((scoreMax - Number(avgScore)) / span * 100);
}

/**
 * 折线连线：与 yearStats 同序、同索引
 * x = (i + 0.5) / n * W
 * y = lineTopPct / 100 * H
 */
function buildYearStatsLineSvg(yearStats, isDark) {
  const list = Array.isArray(yearStats) ? yearStats : [];
  const n = list.length;
  if (!n) return '';
  const stroke = isDark ? '#00aeef' : '#002d62';
  const w = CHART_PLOT_SVG_W;
  const h = CHART_PLOT_SVG_H;
  const coords = list.map(function (p, i) {
    const x = ((i + 0.5) / n) * w;
    const y = (Number(p.lineTopPct) / 100) * h;
    return { x: x, y: y };
  });
  const poly = coords
    .map(function (c) {
      return c.x.toFixed(2) + ',' + c.y.toFixed(2);
    })
    .join(' ');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
    w +
    ' ' +
    h +
    '" preserveAspectRatio="none">' +
    '<polyline fill="none" stroke="' +
    stroke +
    '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="' +
    poly +
    '"/>' +
    '</svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function isUsableWindowWidth(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** 图表列宽换算用窗口宽：优先 getWindowInfo，失败再 getSystemInfoSync */
function readChartWindowWidth() {
  if (typeof wx !== 'undefined' && typeof wx.getWindowInfo === 'function') {
    try {
      const info = wx.getWindowInfo();
      if (info && isUsableWindowWidth(info.windowWidth)) {
        return info.windowWidth;
      }
    } catch (e) {
      /* 回退 getSystemInfoSync */
    }
  }
  const sys = wx.getSystemInfoSync();
  if (sys && isUsableWindowWidth(sys.windowWidth)) {
    return sys.windowWidth;
  }
  return 375;
}

/**
 * 构建组合图：只产出一份 yearStats（禁止拆 years/scores/rounds）
 */
function buildYearStatsChart(range, isDark) {
  const raw = sliceYearStats(range);
  let maxRoundCount = 0;
  const scores = [];
  raw.forEach(function (item) {
    const n = Number(item.roundCount) || 0;
    if (n > maxRoundCount) maxRoundCount = n;
    if (Number.isFinite(Number(item.avgScore))) scores.push(Number(item.avgScore));
  });
  if (maxRoundCount <= 0) maxRoundCount = 1;

  const scoreAxis = buildScoreAxisFromData(scores);
  const roundAxis = buildRoundAxisFromData(maxRoundCount);

  const n = raw.length;
  const yearStats = raw.map(function (item, index) {
    const year = item.year;
    const roundCount = Number(item.roundCount) || 0;
    const avgScore = Number(item.avgScore);
    const avgScoreInt = Number.isFinite(avgScore) ? Math.round(avgScore) : null;
    return {
      index: index,
      year: year,
      yearLabel: String(year),
      roundCount: roundCount,
      avgScore: avgScoreInt,
      avgScoreText: avgScoreInt != null ? String(avgScoreInt) : '-',
      roundsText: String(roundCount),
      barHeightPct: calcBarHeightPct(roundCount, roundAxis.roundMax),
      lineTopPct: calcLineTopPct(
        avgScoreInt != null ? avgScoreInt : scoreAxis.scoreMin,
        scoreAxis.scoreMax,
        scoreAxis.scoreMin
      ),
      highlight: !!item.highlight
    };
  });

  // 固定列宽：不压缩；超过视窗约 8 列时横向滚动，默认最近 8 年
  const chartCanScroll = n > CHART_VIEWPORT_YEARS;
  const chartColWidthRpx = CHART_COL_WIDTH_RPX;
  const chartTrackWidthRpx = Math.max(1, n) * CHART_COL_WIDTH_RPX;
  const scrollStartIndex = chartCanScroll ? n - CHART_VIEWPORT_YEARS : 0;
  let chartScrollLeft = 0;
  if (chartCanScroll && scrollStartIndex > 0) {
    try {
      const winW = readChartWindowWidth();
      const colPx = (CHART_COL_WIDTH_RPX * winW) / 750;
      chartScrollLeft = Math.round(scrollStartIndex * colPx);
    } catch (e) {
      chartScrollLeft = 0;
    }
  }

  return {
    yearStats: yearStats,
    scoreAxisTicks: scoreAxis.ticks,
    roundAxisTicks: roundAxis.ticks,
    chartLineSvgSrc: buildYearStatsLineSvg(yearStats, isDark),
    chartMaxRoundCount: maxRoundCount,
    chartScoreMax: scoreAxis.scoreMax,
    chartScoreMin: scoreAxis.scoreMin,
    chartColWidthRpx: chartColWidthRpx,
    chartTrackWidthRpx: chartTrackWidthRpx,
    chartCanScroll: chartCanScroll,
    chartScrollLeft: chartScrollLeft
  };
}

/**
 * 足迹地图 — viewBox(1000×500)
 * 层级：WORLD → CONTINENT → COUNTRY（PROVINCE 预留）
 * mock 统计：WORLD 按洲 / CONTINENT 按国家 / COUNTRY 按省份
 */
const MAP_LEVEL = {
  WORLD: 'WORLD',
  CONTINENT: 'CONTINENT',
  COUNTRY: 'COUNTRY',
  PROVINCE: 'PROVINCE'
};

const MAP_PATHS_WORLD =
  '<path d="M580 80 Q620 60 680 70 Q740 65 780 80 Q820 70 850 90 Q870 110 860 140 Q850 170 830 190 Q810 210 780 220 Q750 230 720 225 Q700 240 680 250 Q660 240 640 230 Q610 240 590 230 Q570 220 560 200 Q550 180 555 160 Q550 140 560 120 Q565 100 580 80Z" fill="CONT_FILL" opacity="CONT_OP"/>' +
  '<path d="M440 70 Q460 55 480 60 Q500 55 520 65 Q540 60 550 75 Q560 90 555 110 Q550 130 535 145 Q520 155 500 150 Q480 155 465 145 Q450 135 445 115 Q440 95 440 70Z" fill="CONT_FILL" opacity="CONT_OP"/>' +
  '<path d="M440 180 Q460 170 480 175 Q500 170 520 180 Q535 195 540 220 Q545 250 535 280 Q525 310 510 330 Q495 345 480 350 Q465 345 455 330 Q445 310 440 280 Q435 250 438 220 Q437 200 440 180Z" fill="CONT_FILL" opacity="CONT_OP"/>' +
  '<path d="M150 60 Q170 50 200 55 Q230 50 260 60 Q280 70 290 90 Q300 110 295 130 Q290 150 275 165 Q260 175 240 180 Q230 200 225 220 Q220 245 230 270 Q235 290 225 310 Q215 330 200 340 Q185 345 175 335 Q165 320 160 300 Q155 275 160 250 Q158 230 155 210 Q150 190 145 170 Q140 145 142 120 Q143 90 150 60Z" fill="CONT_FILL" opacity="CONT_OP"/>' +
  '<path d="M750 300 Q780 290 820 295 Q860 300 880 320 Q890 340 875 355 Q860 365 835 370 Q810 370 790 360 Q765 350 755 335 Q748 320 750 300Z" fill="CONT_FILL" opacity="CONT_OP"/>';

/** 亚洲层：放大示意轮廓（同视觉语言，非重设计） */
const MAP_PATHS_ASIA =
  '<path d="M220 80 Q320 40 480 55 Q640 45 780 70 Q880 90 900 160 Q910 230 860 290 Q800 350 700 380 Q600 420 480 400 Q360 390 280 340 Q200 280 190 200 Q185 130 220 80Z" fill="CONT_FILL" opacity="CONT_OP"/>';

/** 中国层：区域示意轮廓 */
const MAP_PATHS_CHINA =
  '<path d="M280 90 Q400 50 560 70 Q700 60 780 110 Q860 170 840 260 Q820 340 740 400 Q640 450 520 440 Q400 430 320 370 Q250 310 240 220 Q245 140 280 90Z" fill="CONT_FILL" opacity="CONT_OP"/>';

/** 世界层频度点（原型坐标） */
const MAP_DOTS_WORLD = [
  { cx: 720, cy: 140, r: 5, tone: 'primary' },
  { cx: 740, cy: 155, r: 4, tone: 'primary' },
  { cx: 710, cy: 160, r: 4, tone: 'primary' },
  { cx: 735, cy: 170, r: 5, tone: 'primary' },
  { cx: 725, cy: 180, r: 4, tone: 'primary' },
  { cx: 745, cy: 175, r: 3, tone: 'primary' },
  { cx: 695, cy: 210, r: 4, tone: 'gold' },
  { cx: 790, cy: 135, r: 4, tone: 'gold' },
  { cx: 770, cy: 130, r: 3, tone: 'gold' },
  { cx: 810, cy: 330, r: 4, tone: 'gold' }
];

/** 亚洲层频度点：中国密集，日韩泰较疏 */
const MAP_DOTS_ASIA = [
  { cx: 560, cy: 220, r: 5, tone: 'primary' },
  { cx: 580, cy: 230, r: 4, tone: 'primary' },
  { cx: 600, cy: 225, r: 4, tone: 'primary' },
  { cx: 570, cy: 245, r: 5, tone: 'primary' },
  { cx: 610, cy: 250, r: 4, tone: 'primary' },
  { cx: 590, cy: 260, r: 3, tone: 'primary' },
  { cx: 550, cy: 235, r: 4, tone: 'primary' },
  { cx: 620, cy: 240, r: 3, tone: 'primary' },
  { cx: 780, cy: 180, r: 4, tone: 'gold' },
  { cx: 800, cy: 195, r: 3, tone: 'gold' },
  { cx: 770, cy: 200, r: 3, tone: 'gold' },
  { cx: 720, cy: 170, r: 4, tone: 'gold' },
  { cx: 735, cy: 185, r: 3, tone: 'gold' },
  { cx: 520, cy: 330, r: 4, tone: 'gold' },
  { cx: 540, cy: 345, r: 3, tone: 'gold' },
  { cx: 510, cy: 350, r: 3, tone: 'gold' }
];

/** 中国层频度点：广东最密 */
const MAP_DOTS_CHINA = [
  { cx: 680, cy: 360, r: 5, tone: 'primary' },
  { cx: 700, cy: 370, r: 4, tone: 'primary' },
  { cx: 720, cy: 365, r: 4, tone: 'primary' },
  { cx: 690, cy: 380, r: 5, tone: 'primary' },
  { cx: 710, cy: 385, r: 4, tone: 'primary' },
  { cx: 730, cy: 355, r: 3, tone: 'primary' },
  { cx: 670, cy: 375, r: 4, tone: 'primary' },
  { cx: 780, cy: 260, r: 4, tone: 'gold' },
  { cx: 760, cy: 270, r: 4, tone: 'gold' },
  { cx: 790, cy: 275, r: 3, tone: 'gold' },
  { cx: 770, cy: 250, r: 3, tone: 'gold' },
  { cx: 800, cy: 265, r: 3, tone: 'gold' },
  { cx: 480, cy: 340, r: 4, tone: 'gold' },
  { cx: 500, cy: 350, r: 3, tone: 'gold' },
  { cx: 470, cy: 355, r: 3, tone: 'gold' },
  { cx: 620, cy: 430, r: 4, tone: 'gold' },
  { cx: 640, cy: 440, r: 3, tone: 'gold' },
  { cx: 610, cy: 435, r: 3, tone: 'gold' },
  { cx: 660, cy: 160, r: 4, tone: 'gold' },
  { cx: 680, cy: 170, r: 3, tone: 'gold' },
  { cx: 740, cy: 290, r: 3, tone: 'gold' },
  { cx: 760, cy: 300, r: 3, tone: 'gold' }
];

/** WORLD：按洲统计 */
const MAP_WORLD_CONTINENTS = [
  { name: '亚洲', count: 37, key: 'asia' },
  { name: '大洋洲', count: 1, key: 'oceania' },
  { name: '欧洲', count: 0, key: 'europe' },
  { name: '北美', count: 0, key: 'na' }
];

/** CONTINENT（亚洲）：按国家统计 */
const MAP_ASIA_COUNTRIES = [
  { name: '中国', count: 28, flag: '🇨🇳', key: 'china' },
  { name: '泰国', count: 4, flag: '🇹🇭', key: 'thailand' },
  { name: '日本', count: 3, flag: '🇯🇵', key: 'japan' },
  { name: '韩国', count: 2, flag: '🇰🇷', key: 'korea' }
];

/** COUNTRY（中国）：按省份统计 */
const MAP_CHINA_PROVINCES = [
  { name: '广东', count: 12, key: 'guangdong' },
  { name: '上海', count: 5, key: 'shanghai' },
  { name: '云南', count: 4, key: 'yunnan' },
  { name: '海南', count: 3, key: 'hainan' },
  { name: '北京', count: 2, key: 'beijing' },
  { name: '浙江', count: 2, key: 'zhejiang' }
];

function sizeFromR(r) {
  if (r >= 5) return 'lg';
  if (r <= 3) return 'sm';
  return 'md';
}

function toMapDotsView(dots) {
  return (dots || []).map(function (d, idx) {
    return {
      id: 'd' + idx,
      left: d.cx / 10 + '%',
      top: d.cy / 5 + '%',
      size: sizeFromR(d.r),
      tone: d.tone
    };
  });
}

function toRankList(items, withFlag) {
  return (items || []).map(function (item, idx) {
    return {
      rank: String(idx + 1).padStart(2, '0'),
      name: withFlag && item.flag ? item.flag + ' ' + item.name : item.name,
      count: item.count + '场',
      top: idx === 0
    };
  });
}

function normalizeMapLevel(level) {
  const v = String(level || '').toUpperCase();
  if (v === MAP_LEVEL.CONTINENT) return MAP_LEVEL.CONTINENT;
  if (v === MAP_LEVEL.COUNTRY) return MAP_LEVEL.COUNTRY;
  if (v === MAP_LEVEL.PROVINCE) return MAP_LEVEL.PROVINCE;
  // 兼容旧 world/asia/china
  if (v === 'ASIA') return MAP_LEVEL.CONTINENT;
  if (v === 'CHINA') return MAP_LEVEL.COUNTRY;
  if (v === 'WORLD') return MAP_LEVEL.WORLD;
  return MAP_LEVEL.WORLD;
}

function buildFootprintMapSvgSrc(isDark, level) {
  const bg = isDark ? '#0a0f0d' : '#f3f4f6';
  const contFill = isDark ? '#1e2e26' : '#002d62';
  const contOp = isDark ? '0.5' : '0.18';
  const lv = normalizeMapLevel(level);
  let paths = MAP_PATHS_WORLD;
  if (lv === MAP_LEVEL.CONTINENT) paths = MAP_PATHS_ASIA;
  if (lv === MAP_LEVEL.COUNTRY || lv === MAP_LEVEL.PROVINCE) paths = MAP_PATHS_CHINA;
  const continents = paths.replace(/CONT_FILL/g, contFill).replace(/CONT_OP/g, contOp);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500">' +
    '<rect width="1000" height="500" fill="' +
    bg +
    '"/>' +
    continents +
    '</svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function buildMapLevelState(level, isDark) {
  const next = normalizeMapLevel(level);
  let mapTitle = '我的足迹 · 世界';
  let mapDesc = '按大洲统计 · 38 座球场';
  let mapDots = toMapDotsView(MAP_DOTS_WORLD);
  let mapRankList = toRankList(
    MAP_WORLD_CONTINENTS.filter((c) => c.count > 0),
    false
  );
  let mapRankLabel = '大洲排序';
  let mapCanDrill = true;
  let mapHitKind = 'asia';
  let mapHitLabel = '亚洲';
  let mapCrumbContinentActive = false;
  let mapCrumbCountryActive = false;
  let mapCrumbContinentReached = false;
  let mapCrumbCountryReached = false;

  if (next === MAP_LEVEL.CONTINENT) {
    mapTitle = '我的足迹 · 亚洲';
    mapDesc = '按国家统计 · 亚洲';
    mapDots = toMapDotsView(MAP_DOTS_ASIA);
    mapRankList = toRankList(MAP_ASIA_COUNTRIES, true);
    mapRankLabel = '国家排序';
    mapCanDrill = true;
    mapHitKind = 'china';
    mapHitLabel = '中国';
    mapCrumbContinentActive = true;
    mapCrumbContinentReached = true;
  } else if (next === MAP_LEVEL.COUNTRY || next === MAP_LEVEL.PROVINCE) {
    mapTitle = '我的足迹 · 中国';
    mapDesc = '按省份统计 · 中国';
    mapDots = toMapDotsView(MAP_DOTS_CHINA);
    mapRankList = toRankList(MAP_CHINA_PROVINCES, false);
    mapRankLabel = '省份排序';
    mapCanDrill = false;
    mapHitKind = '';
    mapHitLabel = '';
    mapCrumbContinentReached = true;
    mapCrumbCountryReached = true;
    mapCrumbCountryActive = true;
    mapCrumbContinentActive = false;
  }

  return {
    mapLevel: next,
    mapTitle: mapTitle,
    mapDesc: mapDesc,
    mapDots: mapDots,
    mapRankList: mapRankList,
    mapRankLabel: mapRankLabel,
    mapCanDrill: mapCanDrill,
    mapHitKind: mapHitKind,
    mapHitLabel: mapHitLabel,
    mapCrumbContinentActive: mapCrumbContinentActive,
    mapCrumbCountryActive: mapCrumbCountryActive,
    mapCrumbContinentReached: mapCrumbContinentReached,
    mapCrumbCountryReached: mapCrumbCountryReached,
    mapSvgSrc: buildFootprintMapSvgSrc(isDark, next)
  };
}

Page({
  data: {
    themeClass: 'dark-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    chartRange: 'all',
    profile: {
      avatar: '',
      nickname: '',
      handicap: null,
      floatCoef: null,
      handicapText: '-',
      floatCoefText: '-',
      sinceLabel: 'Active Since 2017',
      daysOnTour: '2,847 Days on Tour'
    },
    stats: [
      { label: '总轮次', value: '486', sub: '+23 本年', accent: false },
      { label: '登录天数', value: '1,342', sub: '活跃度 47%', accent: false },
      { label: '历史均杆', value: '84.6', sub: '最佳 72', accent: true, goldSub: true },
      { label: '一切一推', value: '127', sub: '占比 26%', accent: false },
      { label: '打过球场', value: '38', sub: '5 个国家', accent: false },
      { label: '球友数', value: '156', sub: '同组 89 人', accent: false }
    ],
    yearStats: [],
    scoreAxisTicks: [100, 95, 90, 85],
    roundAxisTicks: [100, 75, 50, 25, 0],
    chartLineSvgSrc: '',
    chartMaxRoundCount: 0,
    chartColWidthRpx: CHART_COL_WIDTH_RPX,
    chartTrackWidthRpx: CHART_COL_WIDTH_RPX * CHART_VIEWPORT_YEARS,
    chartCanScroll: false,
    chartScrollLeft: 0,
    distributions: [
      { range: '70-75', width: 5, label: '2%' },
      { range: '76-80', width: 18, label: '15%' },
      { range: '81-85', width: 42, label: '38%' },
      { range: '86-90', width: 32, label: '28%' },
      { range: '91-95', width: 15, label: '12%' },
      { range: '96+', width: 8, label: '5%' }
    ],
    bestRounds: [
      {
        rank: 1,
        trophy: true,
        name: '观澜湖高尔夫球会 · 奥拉沙宝场',
        date: '2024年3月16日',
        score: 72
      },
      { rank: 2, name: '南山国际高尔夫球会', date: '2023年11月8日', score: 74 },
      { rank: 3, name: '清迈 Alpine Golf Resort', date: '2023年7月22日', score: 76 },
      { rank: 4, name: '佘山国际高尔夫俱乐部', date: '2024年5月3日', score: 77 },
      { rank: 5, name: 'Spring City Golf & Lake Resort', date: '2022年12月10日', score: 78 }
    ],
    rivals: [
      {
        initial: '王',
        tone: 'blue',
        name: '王大鹏',
        meta: '同组 42 轮 · 差点 10.8',
        wins: 18,
        losses: 18,
        draws: 6,
        winPct: 42.8,
        drawPct: 14.4,
        lossPct: 42.8
      },
      {
        initial: '张',
        tone: 'purple',
        name: '张志强',
        meta: '同组 38 轮 · 差点 15.2',
        wins: 25,
        losses: 10,
        draws: 3,
        winPct: 65.8,
        drawPct: 7.9,
        lossPct: 26.3
      },
      {
        initial: '陈',
        tone: 'amber',
        name: '陈家豪',
        meta: '同组 35 轮 · 差点 8.5',
        wins: 12,
        losses: 20,
        draws: 3,
        winPct: 34.3,
        drawPct: 8.6,
        lossPct: 57.1
      },
      {
        initial: '林',
        tone: 'emerald',
        name: '林伟明',
        meta: '同组 31 轮 · 差点 13.1',
        wins: 20,
        losses: 8,
        draws: 3,
        winPct: 64.5,
        drawPct: 9.7,
        lossPct: 25.8
      },
      {
        initial: '赵',
        tone: 'rose',
        name: '赵国庆',
        meta: '同组 28 轮 · 差点 11.6',
        wins: 15,
        losses: 10,
        draws: 3,
        winPct: 53.6,
        drawPct: 10.7,
        lossPct: 35.7
      },
      {
        initial: '刘',
        tone: 'cyan',
        name: '刘思远',
        meta: '同组 26 轮 · 差点 14.7',
        wins: 19,
        losses: 6,
        draws: 1,
        winPct: 73.1,
        drawPct: 3.8,
        lossPct: 23.1
      }
    ],
    /** 足迹地图：WORLD → CONTINENT → COUNTRY */
    mapLevel: MAP_LEVEL.WORLD,
    mapTitle: '我的足迹 · 世界',
    mapDesc: '按大洲统计 · 38 座球场',
    mapSvgSrc: '',
    mapDots: toMapDotsView(MAP_DOTS_WORLD),
    mapRankList: [],
    mapRankLabel: '大洲排序',
    mapCanDrill: true,
    mapHitKind: 'asia',
    mapHitLabel: '亚洲',
    mapCrumbContinentActive: false,
    mapCrumbCountryActive: false,
    mapCrumbContinentReached: false,
    mapCrumbCountryReached: false,
    courses: [
      { rank: '01', name: '观澜湖高尔夫球会', meta: '深圳 · 最佳 72', rounds: '52轮', avg: '均杆 83.2', top: true },
      { rank: '02', name: '南山国际高尔夫球会', meta: '深圳 · 最佳 74', rounds: '45轮', avg: '均杆 84.1' },
      { rank: '03', name: '佘山国际高尔夫俱乐部', meta: '上海 · 最佳 77', rounds: '38轮', avg: '均杆 85.6' },
      { rank: '04', name: 'Spring City 春城', meta: '昆明 · 最佳 78', rounds: '32轮', avg: '均杆 84.8' },
      { rank: '05', name: '清迈 Alpine Golf Resort', meta: '泰国 · 最佳 76', rounds: '18轮', avg: '均杆 82.9' },
      { rank: '06', name: '海口美视五月花', meta: '海口 · 最佳 79', rounds: '16轮', avg: '均杆 86.3' },
      { rank: '07', name: '川奈ホテルゴルフコース', meta: '日本 · 最佳 82', rounds: '8轮', avg: '均杆 87.5' },
      { rank: '08', name: '济州岛 Nine Bridges', meta: '韩国 · 最佳 81', rounds: '6轮', avg: '均杆 86.2' }
    ],
    heatmap: [
      { month: '1月', count: '4', level: 1 },
      { month: '2月', count: '3', level: 1 },
      { month: '3月', count: '8', level: 3 },
      { month: '4月', count: '10', level: 4 },
      { month: '5月', count: '9', level: 3 },
      { month: '6月', count: '6', level: 2 },
      { month: '7月', count: '3', level: 1 },
      { month: '8月', count: '2', level: 1 },
      { month: '9月', count: '5', level: 2 },
      { month: '10月', count: '11', level: 4 },
      { month: '11月', count: '5', level: 2 },
      { month: '12月', count: '—', level: 0 }
    ],
    milestones: [
      {
        icon: '旗',
        tone: 'cyan',
        title: '加入高尔夫江湖',
        date: '2017年3月15日',
        desc: '正式注册，开启江湖之路'
      },
      {
        icon: '星',
        tone: 'gold',
        title: '首次破90',
        date: '2018年6月22日',
        desc: '在南山国际球会打出 88 杆'
      },
      {
        icon: '航',
        tone: 'blue',
        title: '首次海外打球',
        date: '2019年2月14日',
        desc: '清迈 Alpine Golf Resort，开启国际征程'
      },
      {
        icon: '火',
        tone: 'gold',
        title: '首次破80',
        date: '2022年12月10日',
        desc: '春城球会山景场打出 78 杆，突破里程碑'
      },
      {
        icon: '友',
        tone: 'purple',
        title: '累计 100 位球友',
        date: '2023年5月18日',
        desc: '江湖人脉破百，结识第 100 位球友'
      },
      {
        icon: '冠',
        tone: 'cyan',
        title: '个人最佳 72 杆！',
        date: '2024年3月16日',
        desc: '观澜湖奥拉沙宝场，平标准杆，创造个人历史',
        highlight: true
      }
    ]
  },

  onLoad() {
    this.initHeaderNav();
    this.refreshHeroProfile();
    this.applyTheme(getApp().getTheme());
    this.applyChartRange('all');
    this.applyMapLevel(MAP_LEVEL.WORLD);
  },

  onShow() {
    this.refreshHeroProfile();
    this.applyTheme(getApp().getTheme());
  },

  /** Hero：头像 / 昵称 / 江湖差点 / 浮动系数 ← userProfileStore */
  refreshHeroProfile() {
    this.setData({ profile: buildHeroProfile() });
  },

  initHeaderNav() {
    const styles = createHeaderStyle();
    this.setData({
      headerRootStyle: styles.headerRootStyle,
      headerBarStyle: styles.headerBarStyle
    });
  },

  applyTheme(theme) {
    const isDark = theme === 'dark';
    const level = this.data.mapLevel || MAP_LEVEL.WORLD;
    const mapState = buildMapLevelState(level, isDark);
    const chartState = buildYearStatsChart(this.data.chartRange || 'all', isDark);
    this.setData(
      Object.assign(
        {
          themeClass: isDark ? 'dark-mode' : 'bright-mode'
        },
        mapState,
        chartState
      )
    );
  },

  applyChartRange(range) {
    const next = range === '3y' || range === '5y' ? range : 'all';
    const isDark = this.data.themeClass === 'dark-mode';
    const chartState = buildYearStatsChart(next, isDark);
    this.setData(Object.assign({ chartRange: next }, chartState));
  },

  onChartRangeTap(e) {
    const range = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.range) || 'all';
    this.applyChartRange(range);
  },

  /**
   * 图表区与底表数据区共享 scrollLeft（禁止各自独立滚动错位）
   * 底表为主要滑动入口；任一侧滑动都会同步另一侧
   */
  onTrendScroll(e) {
    const detail = (e && e.detail) || {};
    const left = Number(detail.scrollLeft);
    if (!Number.isFinite(left)) return;
    if (this._trendScrollLock) return;
    const prev = Number(this.data.chartScrollLeft) || 0;
    if (Math.abs(left - prev) < 0.5) return;
    this._trendScrollLock = true;
    this.setData({ chartScrollLeft: left }, function () {
      const self = this;
      setTimeout(function () {
        self._trendScrollLock = false;
      }, 16);
    }.bind(this));
  },

  applyMapLevel(level) {
    const isDark = this.data.themeClass === 'dark-mode';
    this.setData(buildMapLevelState(level, isDark));
  },

  /** 世界层 → 亚洲（CONTINENT） */
  onMapAsiaHit() {
    if (normalizeMapLevel(this.data.mapLevel) === MAP_LEVEL.WORLD) {
      this.applyMapLevel(MAP_LEVEL.CONTINENT);
    }
  },

  /** 亚洲层 → 中国（COUNTRY） */
  onMapChinaHit() {
    if (normalizeMapLevel(this.data.mapLevel) === MAP_LEVEL.CONTINENT) {
      this.applyMapLevel(MAP_LEVEL.COUNTRY);
    }
  },

  /** 面包屑：仅允许回到已到达层级 */
  onMapLevelTap(e) {
    const level = normalizeMapLevel(
      (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.level) || MAP_LEVEL.WORLD
    );
    const cur = normalizeMapLevel(this.data.mapLevel);
    if (level === MAP_LEVEL.WORLD) {
      this.applyMapLevel(MAP_LEVEL.WORLD);
      return;
    }
    if (
      level === MAP_LEVEL.CONTINENT &&
      (cur === MAP_LEVEL.CONTINENT || cur === MAP_LEVEL.COUNTRY || cur === MAP_LEVEL.PROVINCE)
    ) {
      this.applyMapLevel(MAP_LEVEL.CONTINENT);
      return;
    }
    if (
      level === MAP_LEVEL.COUNTRY &&
      (cur === MAP_LEVEL.COUNTRY || cur === MAP_LEVEL.PROVINCE)
    ) {
      this.applyMapLevel(MAP_LEVEL.COUNTRY);
    }
  },

  onMapBackTap() {
    const level = normalizeMapLevel(this.data.mapLevel);
    if (level === MAP_LEVEL.COUNTRY || level === MAP_LEVEL.PROVINCE) {
      this.applyMapLevel(MAP_LEVEL.CONTINENT);
    } else if (level === MAP_LEVEL.CONTINENT) {
      this.applyMapLevel(MAP_LEVEL.WORLD);
    }
  },

  onBack() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/home/index' }) });
  }
});

module.exports = {
  buildYearStatsChart: buildYearStatsChart,
  CHART_VIEWPORT_YEARS: CHART_VIEWPORT_YEARS,
  CHART_COL_WIDTH_RPX: CHART_COL_WIDTH_RPX
};
