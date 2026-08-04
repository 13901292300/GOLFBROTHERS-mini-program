/**
 * 江湖足迹 — UI 迁移页（静态 mock，无真实数据接口）
 * 原型：01-HTML原型/我的/江湖足迹（DARK）
 * Hero 身份/竞技指标：与「我的」共用 userProfileStore
 */
const { createHeaderStyle } = require('../../../utils/headerEngine.js');
const userProfileStore = require('../../../utils/userProfileStore.js');

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

const YEARLY_ALL = [
  { year: '2017', avg: 92.3, rounds: 28 },
  { year: '2018', avg: 89.1, rounds: 52 },
  { year: '2019', avg: 87.4, rounds: 64 },
  { year: '2020', avg: 86.2, rounds: 41 },
  { year: '2021', avg: 85.0, rounds: 72 },
  { year: '2022', avg: 83.8, rounds: 78 },
  { year: '2023', avg: 82.1, rounds: 85 },
  { year: '2024', avg: 80.5, rounds: 66, highlight: true }
];

function sliceYearly(range) {
  if (range === '3y') return YEARLY_ALL.slice(-3);
  if (range === '5y') return YEARLY_ALL.slice(-5);
  return YEARLY_ALL.slice();
}

/** 为柱状图生成高度百分比（杆数越低柱越高） */
function withChartHeights(list) {
  const avgs = list.map((x) => x.avg);
  const min = Math.min.apply(null, avgs);
  const max = Math.max.apply(null, avgs);
  const span = max - min || 1;
  return list.map((item) => {
    const norm = (max - item.avg) / span;
    const heightPct = Math.round(28 + norm * 72);
    return Object.assign({}, item, { heightPct: heightPct });
  });
}

/**
 * 足迹地图 — viewBox(1000×500) + 三级：world → asia → china
 * 频度点静态；氛围层独立；下方 badges / 排序列表说明
 */
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

const MAP_ASIA_COUNTRIES = [
  { name: '中国', count: 28, flag: '🇨🇳' },
  { name: '泰国', count: 4, flag: '🇹🇭' },
  { name: '日本', count: 3, flag: '🇯🇵' },
  { name: '韩国', count: 2, flag: '🇰🇷' }
];

const MAP_CHINA_PROVINCES = [
  { name: '广东', count: 12 },
  { name: '上海', count: 5 },
  { name: '云南', count: 4 },
  { name: '海南', count: 3 },
  { name: '北京', count: 2 },
  { name: '浙江', count: 2 }
];

const MAP_BADGES_DARK = [
  { id: 'b-cn', text: '🇨🇳 中国 28场', tone: 'proto-green' },
  { id: 'b-th', text: '🇹🇭 泰国 4场', tone: 'proto-gold' },
  { id: 'b-jp', text: '🇯🇵 日本 3场', tone: 'proto-gold' },
  { id: 'b-kr', text: '🇰🇷 韩国 2场', tone: 'proto-gold' },
  { id: 'b-au', text: '🇦🇺 澳大利亚 1场', tone: 'proto-gold' }
];

const MAP_BADGES_BRIGHT = [
  { id: 'b-cn', text: '🇨🇳 中国 28场', tone: 'primary' },
  { id: 'b-th', text: '🇹🇭 泰国 4场', tone: 'gold' },
  { id: 'b-jp', text: '🇯🇵 日本 3场', tone: 'gold' },
  { id: 'b-kr', text: '🇰🇷 韩国 2场', tone: 'gold' },
  { id: 'b-au', text: '🇦🇺 澳大利亚 1场', tone: 'gold' }
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

function buildFootprintMapSvgSrc(isDark, level) {
  const bg = isDark ? '#0a0f0d' : '#f3f4f6';
  const contFill = isDark ? '#1e2e26' : '#002d62';
  const contOp = isDark ? '0.5' : '0.18';
  let paths = MAP_PATHS_WORLD;
  if (level === 'asia') paths = MAP_PATHS_ASIA;
  if (level === 'china') paths = MAP_PATHS_CHINA;
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
  const next = level === 'asia' || level === 'china' ? level : 'world';
  let mapDesc = '跨越 5 个国家 · 38 座球场';
  let mapDots = toMapDotsView(MAP_DOTS_WORLD);
  let mapBadges = isDark ? MAP_BADGES_DARK : MAP_BADGES_BRIGHT;
  let mapRankList = [];
  let mapRankLabel = '';
  let mapCanDrill = true;
  let mapHitKind = 'asia';

  if (next === 'asia') {
    mapDesc = '亚洲足迹 · 按球场数排序';
    mapDots = toMapDotsView(MAP_DOTS_ASIA);
    mapBadges = [];
    mapRankList = toRankList(MAP_ASIA_COUNTRIES, true);
    mapRankLabel = '国家排序';
    mapCanDrill = true;
    mapHitKind = 'china';
  } else if (next === 'china') {
    mapDesc = '中国足迹 · 省份按球场数排序';
    mapDots = toMapDotsView(MAP_DOTS_CHINA);
    mapBadges = [];
    mapRankList = toRankList(MAP_CHINA_PROVINCES, false);
    mapRankLabel = '省份排序';
    mapCanDrill = false;
    mapHitKind = '';
  }

  return {
    mapLevel: next,
    mapDesc: mapDesc,
    mapDots: mapDots,
    mapBadges: mapBadges,
    mapRankList: mapRankList,
    mapRankLabel: mapRankLabel,
    mapCanDrill: mapCanDrill,
    mapHitKind: mapHitKind,
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
    yearlyStats: [],
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
    /** 足迹地图：world → asia → china */
    mapLevel: 'world',
    mapDesc: '跨越 5 个国家 · 38 座球场',
    mapSvgSrc: '',
    mapDots: toMapDotsView(MAP_DOTS_WORLD),
    mapBadges: MAP_BADGES_DARK,
    mapRankList: [],
    mapRankLabel: '',
    mapCanDrill: true,
    mapHitKind: 'asia',
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
    this.applyMapLevel('world');
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
    const level = this.data.mapLevel || 'world';
    const mapState = buildMapLevelState(level, isDark);
    this.setData(
      Object.assign(
        {
          themeClass: isDark ? 'dark-mode' : 'bright-mode'
        },
        mapState
      )
    );
  },

  applyChartRange(range) {
    const next = range === '3y' || range === '5y' ? range : 'all';
    this.setData({
      chartRange: next,
      yearlyStats: withChartHeights(sliceYearly(next))
    });
  },

  onChartRangeTap(e) {
    const range = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.range) || 'all';
    this.applyChartRange(range);
  },

  applyMapLevel(level) {
    const isDark = this.data.themeClass === 'dark-mode';
    this.setData(buildMapLevelState(level, isDark));
  },

  onMapAsiaHit() {
    if (this.data.mapLevel === 'world') this.applyMapLevel('asia');
  },

  onMapChinaHit() {
    if (this.data.mapLevel === 'asia') this.applyMapLevel('china');
  },

  /** 面包屑：仅允许回到已到达层级 */
  onMapLevelTap(e) {
    const level = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.level) || 'world';
    const cur = this.data.mapLevel;
    if (level === 'world') {
      this.applyMapLevel('world');
      return;
    }
    if (level === 'asia' && (cur === 'asia' || cur === 'china')) {
      this.applyMapLevel('asia');
      return;
    }
    if (level === 'china' && cur === 'china') {
      this.applyMapLevel('china');
    }
  },

  onMapBackTap() {
    const level = this.data.mapLevel;
    if (level === 'china') this.applyMapLevel('asia');
    else if (level === 'asia') this.applyMapLevel('world');
  },

  onBack() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/home/index' }) });
  }
});
