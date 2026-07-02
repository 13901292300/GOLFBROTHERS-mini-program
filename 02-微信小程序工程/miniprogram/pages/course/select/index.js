/**
 * 选择球场（独立页面，非弹窗）
 * - HEADER 统一走 headerEngine（与赛事详情 / 普通创建一致）
 * - TAB：常去球场 / 附近球场（吸顶，样式与赛事页 TAB 一致）
 * - 数据来源（已标记）：
 *     常去球场 ← userCourseHistory（按历史使用次数降序）
 *     附近球场 ← GPS 当前定位 + course database（按距离升序）
 * - 选择后通过 openerEventChannel 回填普通创建页：courseName / courseId / courseLocation
 */

const { createHeaderStyle } = require('../../../utils/headerEngine.js');

/**
 * 球场数据库（course database）。真实接入时替换为后端球场库；
 * lat/lng 用于附近 TAB 的 GPS 距离计算，useCount/lastUsed 为该用户的历史使用记录。
 * 注意：这里是「明确标记来源」的演示数据，不与记分页面数据混用。
 */
const COURSE_DB = [
  // 测试球场：6 个具名半场（A-F），仅用于调试「多半场选择 + 前9/后9 routing」，不影响真实生产数据结构
  {
    courseId: 'BJCC_GOLF_001',
    courseName: '北京乡村高尔夫俱乐部',
    location: '北京 · 密云',
    lat: 40.376,
    lng: 116.844,
    useCount: 20,
    lastUsed: '2026-06-25',
    pinyin: 'beijingxiangcungaoerfujulebu',
    abbr: 'bjcc',
    halfCourseCount: 6,
    halfCourses: [
      { code: 'A', name: 'Forest A', holes: 9, par: [4, 5, 3, 4, 4, 4, 3, 5, 4] },
      { code: 'B', name: 'Lake B', holes: 9, par: [4, 4, 3, 5, 4, 4, 3, 4, 5] },
      { code: 'C', name: 'Hill C', holes: 9, par: [5, 4, 4, 3, 4, 4, 5, 3, 4] },
      { code: 'D', name: 'River D', holes: 9, par: [4, 3, 4, 5, 4, 3, 4, 4, 5] },
      { code: 'E', name: 'Valley E', holes: 9, par: [4, 4, 5, 3, 4, 4, 4, 3, 5] },
      { code: 'F', name: 'Championship F', holes: 9, par: [4, 4, 3, 4, 5, 4, 3, 5, 4] }
    ]
  },
  { courseId: 'c-qhw', courseName: '北京清河湾高尔夫乡村俱乐部 A&B', location: '北京 · 昌平', lat: 40.218, lng: 116.231, useCount: 18, lastUsed: '2026-06-21', pinyin: 'beijingqinghewangaoerfuxiangcunjulebu', abbr: 'qhw', halfCourseCount: 2 },
  { courseId: 'c-huatang', courseName: '华堂高尔夫俱乐部', location: '北京 · 顺义', lat: 40.128, lng: 116.654, useCount: 12, lastUsed: '2026-06-09', pinyin: 'huatanggaoerfujulebu', abbr: 'ht', halfCourseCount: 2 },
  { courseId: 'c-pinevalley', courseName: '北京松山乡村俱乐部', location: '北京 · 延庆', lat: 40.456, lng: 115.974, useCount: 9, lastUsed: '2026-05-30', pinyin: 'beijingsongshanxiangcunjulebu', abbr: 'ss', halfCourseCount: 3 },
  { courseId: 'c-honghua', courseName: '红花高尔夫球会', location: '北京 · 朝阳', lat: 39.985, lng: 116.512, useCount: 7, lastUsed: '2026-05-18', pinyin: 'honghuagaoerfuqiuhui', abbr: 'hh', halfCourseCount: 2 },
  { courseId: 'c-jiuhua', courseName: '九华山庄高尔夫', location: '北京 · 昌平', lat: 40.176, lng: 116.272, useCount: 6, lastUsed: '2026-05-02', pinyin: 'jiuhuashanzhuanggaoerfu', abbr: 'jhsz', halfCourseCount: 3 },
  { courseId: 'c-laguna', courseName: '北京拉斐特城堡高尔夫', location: '北京 · 昌平', lat: 40.205, lng: 116.118, useCount: 5, lastUsed: '2026-04-21', pinyin: 'beijinglafeitechengbaogaoerfu', abbr: 'lft', halfCourseCount: 4 },
  { courseId: 'c-changping', courseName: '北京高尔夫俱乐部', location: '北京 · 朝阳', lat: 40.012, lng: 116.498, useCount: 4, lastUsed: '2026-04-08', pinyin: 'beijinggaoerfujulebu', abbr: 'bj', halfCourseCount: 2 },
  { courseId: 'c-wanliu', courseName: '万柳高尔夫俱乐部', location: '北京 · 海淀', lat: 39.974, lng: 116.288, useCount: 3, lastUsed: '2026-03-22', pinyin: 'wanliugaoerfujulebu', abbr: 'wl', halfCourseCount: 1 },
  { courseId: 'c-orient', courseName: '东方明珠高尔夫', location: '北京 · 通州', lat: 39.902, lng: 116.667, useCount: 3, lastUsed: '2026-03-05', pinyin: 'dongfangmingzhugaoerfu', abbr: 'dfmz', halfCourseCount: 3 },
  { courseId: 'c-nankou', courseName: '南口农场高尔夫练习场', location: '北京 · 昌平', lat: 40.244, lng: 116.143, useCount: 2, lastUsed: '2026-02-18', pinyin: 'nankounongchanggaoerfulianxichang', abbr: 'nk', halfCourseCount: 1 },
  { courseId: 'c-lake', courseName: '京北湖滨高尔夫', location: '北京 · 怀柔', lat: 40.378, lng: 116.631, useCount: 2, lastUsed: '2026-02-01', pinyin: 'jingbeihubingaoerfu', abbr: 'jbhb', halfCourseCount: 2 },
  { courseId: 'c-county', courseName: '京都高尔夫俱乐部', location: '北京 · 平谷', lat: 40.142, lng: 117.121, useCount: 1, lastUsed: '2026-01-12', pinyin: 'jingdugaoerfujulebu', abbr: 'jd', halfCourseCount: 3 }
];

// 默认定位（GPS 不可用时兜底）：北京市中心
const FALLBACK_ORIGIN = { lat: 39.9087, lng: 116.3975 };

// Haversine 球面距离（km）
function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    headerTotalHeight: 92,

    activeTab: 'frequent', // frequent | nearby
    selectedId: '',

    frequentCourses: [],
    nearbyCourses: [],
    locating: true,

    // 搜索（第三入口，跨 TAB + 全库）
    searchQuery: '',
    searchMode: false,
    searchResults: [],

    // 半场选择二级弹窗（多半场球场：halfCourseCount >= 3 时触发）
    halfPopupVisible: false,
    halfCourse: { id: '', name: '', location: '' },
    halves: [],
    front9: null,
    back9: null
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    this.setData({ selectedId: (options && options.selectedId) || '' });
    this.buildFrequent();
    this.locateAndBuildNearby();
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle,
      headerTotalHeight: header.metrics.headerTotalHeight
    });
  },

  onBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.redirectTo({ url: '/pages/home/index' });
    }
  },

  /* ===== TAB ===== */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
  },

  /* ===== 常去球场（userCourseHistory，按使用次数降序，最多 10 条） ===== */
  buildFrequent() {
    const top = COURSE_DB.filter((c) => c.useCount > 0)
      .slice()
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, 10);
    // 记录「常去」集合，供搜索结果来源标签复用
    this._frequentIds = {};
    top.forEach((c) => {
      this._frequentIds[c.courseId] = '使用 ' + c.useCount + ' 次 · 最近 ' + c.lastUsed;
    });
    const list = top.map((c) => ({
      courseId: c.courseId,
      courseName: c.courseName,
      location: c.location,
      metaText: this._frequentIds[c.courseId]
    }));
    this.setData({ frequentCourses: list });
  },

  /* ===== 附近球场（GPS + course database，按距离升序，最多 10 条） ===== */
  locateAndBuildNearby() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => this.buildNearby({ lat: res.latitude, lng: res.longitude }),
      fail: () => this.buildNearby(FALLBACK_ORIGIN)
    });
  },

  buildNearby(origin) {
    // 计算全库距离（供搜索结果带距离），再取最近 10 条作为附近 TAB
    const withDist = COURSE_DB.map((c) => {
      const d = distanceKm(origin, { lat: c.lat, lng: c.lng });
      const eta = Math.max(1, Math.round((d / 40) * 60)); // 约 40km/h 估算到场时间
      return { c, distance: d, metaText: d.toFixed(1) + ' km · 约 ' + eta + ' 分钟' };
    });
    this._distanceMap = {};
    withDist.forEach((w) => {
      this._distanceMap[w.c.courseId] = { distance: w.distance, metaText: w.metaText };
    });
    const sorted = withDist.slice().sort((a, b) => a.distance - b.distance).slice(0, 10);
    this._nearbyIds = {};
    sorted.forEach((w) => {
      this._nearbyIds[w.c.courseId] = true;
    });
    const list = sorted.map((w) => ({
      courseId: w.c.courseId,
      courseName: w.c.courseName,
      location: w.c.location,
      distance: w.distance,
      metaText: w.metaText
    }));
    this.setData({ nearbyCourses: list, locating: false });
    // 定位完成后若正处于搜索模式，刷新结果以补上距离信息
    if (this.data.searchMode) {
      this.setData({ searchResults: this.searchCourse((this.data.searchQuery || '').trim()) });
    }
  },

  /* ===== 搜索（统一接口 searchCourse：跨 常去 + 附近 + 全量球场库） ===== */
  onSearchInput(e) {
    const q = e.detail.value;
    this.setData({ searchQuery: q });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    // 输入即触发，debounce 300ms
    this._searchTimer = setTimeout(() => this.runSearch(q), 300);
  },

  runSearch(q) {
    const query = (q || '').trim();
    if (!query) {
      this.setData({ searchMode: false, searchResults: [] });
      return;
    }
    this.setData({ searchMode: true, searchResults: this.searchCourse(query) });
  },

  clearSearch() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this.setData({ searchQuery: '', searchMode: false, searchResults: [] });
  },

  // 统一搜索接口：模糊匹配 名称/拼音/简写/地点，跨全库；按匹配优先级排序，最多 20 条
  searchCourse(query) {
    const q = (query || '').toLowerCase();
    if (!q) return [];
    const ranked = [];
    COURSE_DB.forEach((c) => {
      const nameLower = c.courseName.toLowerCase();
      let rank = -1;
      if (nameLower === q) rank = 0; // 名称完全匹配
      else if (nameLower.indexOf(q) >= 0) rank = 1; // 名称包含关键词
      else if ((c.pinyin || '').indexOf(q) >= 0 || (c.abbr || '').indexOf(q) >= 0) rank = 2; // 拼音/简写
      else if ((c.location || '').toLowerCase().indexOf(q) >= 0) rank = 3; // 地理位置近似
      if (rank >= 0) ranked.push({ c: c, rank: rank });
    });
    ranked.sort((a, b) => a.rank - b.rank || b.c.useCount - a.c.useCount);
    return ranked.slice(0, 20).map((r) => this._toResultItem(r.c));
  },

  // 搜索结果卡片：名称 + 来源标签(常去/附近/搜索结果) + 距离(如有)
  _toResultItem(c) {
    const freq = this._frequentIds && this._frequentIds[c.courseId];
    const inNearby = this._nearbyIds && this._nearbyIds[c.courseId];
    const dist = this._distanceMap && this._distanceMap[c.courseId];
    const sourceLabel = freq ? '常去' : inNearby ? '附近' : '搜索结果';
    const metaText = dist ? c.location + ' · ' + dist.metaText : c.location;
    return {
      courseId: c.courseId,
      courseName: c.courseName,
      location: c.location,
      sourceLabel: sourceLabel,
      metaText: metaText
    };
  },

  /* ===== 选择球场 → 多半场则弹半场选择，否则直接回填 ===== */
  onSelectCourse(e) {
    const courseId = e.currentTarget.dataset.id;
    const course = COURSE_DB.find((c) => c.courseId === courseId);
    if (!course) return;
    // 多半场球场（A/B/C…，halfCourseCount >= 3）：弹出二级「选择半场」弹窗
    if ((course.halfCourseCount || 0) >= 3) {
      this.openHalfPopup(course);
      return;
    }
    this._returnCourse(course, null, null, '');
  },

  // 统一回填普通创建页并关闭（front9/back9 可为 null）
  _returnCourse(course, front9, back9, halfText) {
    const payload = {
      courseId: course.courseId,
      courseName: course.courseName,
      courseLocation: course.location,
      front9Course: front9 || null,
      back9Course: back9 || null,
      halfText: halfText || ''
    };
    const channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (channel && channel.emit) {
      channel.emit('courseSelected', payload);
    }
    this.setData({ selectedId: course.courseId });
    wx.navigateBack({ delta: 1, fail: () => wx.redirectTo({ url: '/pages/create/normal/index' }) });
  },

  /* ===== 半场选择二级弹窗 ===== */
  // 生成半场列表：优先用球场显式 halfCourses（含具名 Forest A 等）；否则按数量生成 A/B/C…（不写死）
  buildHalves(course) {
    // 逐洞 PAR 数组（与 hole index 1:1 对齐，可扩展 9/18 洞）；缺省用标准 9 洞 PAR
    const DEFAULT_PAR9 = [4, 4, 4, 3, 4, 5, 4, 3, 4];
    const normPar = (par) => {
      if (Array.isArray(par)) return par.slice();
      return DEFAULT_PAR9.slice();
    };
    if (course && Array.isArray(course.halfCourses) && course.halfCourses.length) {
      return course.halfCourses.map((h) => {
        const par = normPar(h.par);
        return {
          key: h.code,
          label: h.code + '场',
          name: h.name || '',
          par: par,
          parTotal: par.reduce((s, v) => s + v, 0)
        };
      });
    }
    const count = (course && course.halfCourseCount) || 0;
    const arr = [];
    for (let i = 0; i < count; i++) {
      const key = String.fromCharCode(65 + i);
      const par = DEFAULT_PAR9.slice();
      arr.push({ key: key, label: key + '场', name: '', par: par, parTotal: par.reduce((s, v) => s + v, 0) });
    }
    return arr;
  },

  openHalfPopup(course) {
    const halves = this.buildHalves(course);
    // 默认：前9=A场，后9=B场（若存在）；仅一个半场时后9为空
    const front9 = halves[0] ? halves[0].key : null;
    const back9 = halves[1] ? halves[1].key : null;
    this.setData({
      halfPopupVisible: true,
      halfCourse: { id: course.courseId, name: course.courseName, location: course.location },
      halves: halves,
      front9: front9,
      back9: back9
    });
  },

  closeHalfPopup() {
    this.setData({ halfPopupVisible: false });
  },

  // toggle 选择某一侧（front/back）半场：点未选中→选中；点已选中→取消(null)。前9/后9各自独立。
  selectHalf(e) {
    const side = e.currentTarget.dataset.side;
    const key = e.currentTarget.dataset.key;
    if (side === 'front') {
      this.setData({ front9: this.data.front9 === key ? null : key });
    } else {
      this.setData({ back9: this.data.back9 === key ? null : key });
    }
  },

  // 点击 PAR 行 = 与上方半场卡片同源的 toggle：与 selectHalf 共享 front9/back9 状态
  // 规则：已是 front9→取消 front9；已是 back9→取消 back9；未选→补第一个空位(前9优先)；都满→提示
  toggleHalfRow(e) {
    const key = e.currentTarget.dataset.key;
    if (this.data.front9 === key) {
      this.setData({ front9: null });
    } else if (this.data.back9 === key) {
      this.setData({ back9: null });
    } else if (!this.data.front9) {
      this.setData({ front9: key });
    } else if (!this.data.back9) {
      this.setData({ back9: key });
    } else {
      wx.showToast({ title: '前9/后9 已选满，先取消其一', icon: 'none' });
    }
  },

  confirmHalf() {
    const front9 = this.data.front9;
    const back9 = this.data.back9;
    if (!front9 && !back9) {
      wx.showToast({ title: '请至少选择一个半场', icon: 'none' });
      return;
    }
    // 组合显示：前后都有 → A/B；单9 → A 或 B；允许前后同场（A/A）
    let combo = '';
    if (front9 && back9) combo = front9 + '/' + back9;
    else combo = front9 || back9;
    const course = COURSE_DB.find((c) => c.courseId === this.data.halfCourse.id);
    if (!course) {
      this.setData({ halfPopupVisible: false });
      return;
    }
    this.setData({ halfPopupVisible: false });
    this._returnCourse(course, front9, back9, combo);
  },

  noop() {}
});
