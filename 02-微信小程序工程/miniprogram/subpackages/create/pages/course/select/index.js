/**
 * 选择球场（独立页面，非弹窗）
 * - HEADER 统一走 headerEngine（与赛事详情 / 普通创建一致）
 * - TAB：常去球场 / 附近球场（吸顶，样式与赛事页 TAB 一致）
 * - 数据来源（已标记）：
 *     常去球场 ← userCourseHistory（按历史使用次数降序）
 *     附近球场 ← GPS 当前定位 + course database（按距离升序）
 * - 选择后通过 openerEventChannel 回填普通创建页：courseName / courseId / courseLocation
 */

const { createHeaderStyle } = require('../../../../../utils/headerEngine.js');
const { COURSE_DB, FALLBACK_ORIGIN, hasCoords, formatDistanceMeta, buildCourseDistanceViews, resolveFirstTwoCourses } = require('../../../../../utils/courseDatabase.js');
const halfCourse = require('../../../../../utils/halfCourse.js');
const networkStatus = require('../../../../../utils/networkStatus.js');

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

    networkConnected: true,
    networkType: 'unknown',
    offlineModeConfirmed: false,

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
    this._onNetworkStatus = (state) => this._applyNetworkUi(state);
    networkStatus.subscribe(this._onNetworkStatus);
    this._applyNetworkUi(this._readAppNetworkState());
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
    this._applyNetworkUi(this._readAppNetworkState());
  },

  onUnload() {
    if (this._onNetworkStatus) {
      networkStatus.unsubscribe(this._onNetworkStatus);
      this._onNetworkStatus = null;
    }
  },

  _readAppNetworkState() {
    try {
      const app = getApp();
      return networkStatus.readFromGlobal(app && app.globalData);
    } catch (e) {
      return networkStatus.DEFAULT_STATE;
    }
  },

  _applyNetworkUi(state) {
    const connected = !!(state && state.networkConnected);
    this.setData({
      networkConnected: connected,
      networkType: (state && state.networkType) || 'unknown',
      offlineModeConfirmed: connected ? false : !!this.data.offlineModeConfirmed
    });
  },

  onEnterOfflineMode() {
    if (this.data.networkConnected) return;
    this.setData({ offlineModeConfirmed: true });
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
    const views = buildCourseDistanceViews(origin, COURSE_DB);
    this._distanceMap = views.distanceMap;
    this._nearbyIds = {};
    views.nearbyCourses.forEach((item) => {
      this._nearbyIds[item.courseId] = true;
    });
    this.setData({ nearbyCourses: views.nearbyCourses, locating: false });
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
      else if ((c.searchKeys || '').toLowerCase().indexOf(q) >= 0) rank = 2; // 别名（如红花、C&D）
      else if ((c.location || '').toLowerCase().indexOf(q) >= 0) rank = 3; // 地理位置近似
      if (rank >= 0) ranked.push({ c: c, rank: rank });
    });
    ranked.sort((a, b) => a.rank - b.rank || b.c.useCount - a.c.useCount);
    return ranked.slice(0, 20).map((r) => this._toResultItem(r.c));
  },

  // 搜索结果卡片：名称 + 来源标签(常去/附近/搜索结果) + 距离文案（未知为「距离未知」）
  _toResultItem(c) {
    const freq = this._frequentIds && this._frequentIds[c.courseId];
    const inNearby = this._nearbyIds && this._nearbyIds[c.courseId];
    const dist = (this._distanceMap && this._distanceMap[c.courseId]) || (!hasCoords(c) ? formatDistanceMeta(Number.NaN) : null);
    const sourceLabel = freq ? '常去' : inNearby ? '附近' : '搜索结果';
    const distanceText = dist ? dist.distanceText : '';
    const metaText = dist ? c.location + ' · ' + dist.metaText : c.location;
    return {
      courseId: c.courseId,
      courseName: c.courseName,
      location: c.location,
      sourceLabel: sourceLabel,
      distance: dist ? dist.distance : null,
      distanceText: distanceText,
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
    // 双半场且库内写了 C/D 等具名半场 PAR：直接回填前9/后9，记分表才能用到标准杆
    if (Array.isArray(course.halfCourses) && course.halfCourses.length) {
      const halves = resolveFirstTwoCourses(course);
      this._returnCourse(course, halves.front9Course, halves.back9Course, halves.halfText);
      return;
    }
    this._returnCourse(course, null, null, '');
  },

  // 统一回填普通创建页并关闭（front9/back9 可为 null）
  _emitCourseSelected(payload) {
    const channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (channel && channel.emit) {
      channel.emit('courseSelected', payload);
    }
    wx.navigateBack({ delta: 1, fail: () => wx.redirectTo({ url: '/subpackages/create/pages/normal/index' }) });
  },

  _returnCourse(course, front9, back9, halfText) {
    const payload = {
      courseId: course.courseId,
      courseName: course.courseName,
      courseLocation: course.location,
      front9Course: front9 || null,
      back9Course: back9 || null,
      halfText: halfText || ''
    };
    this.setData({ selectedId: course.courseId });
    this._emitCourseSelected(payload);
  },

  onCreateTemporaryCourse() {
    wx.navigateTo({
      url: '/subpackages/create/pages/course/temporary/index',
      events: {
        courseSelected: (payload) => {
          if (!payload || payload.courseSource !== 'temporary') return;
          this._emitCourseSelected(payload);
        }
      },
      fail: () => wx.showToast({ title: '页面尚未注册', icon: 'none' })
    });
  },

  /* ===== 半场选择二级弹窗 ===== */
  // 生成半场列表：优先用球场显式 halfCourses（含具名 Forest A 等）；否则按数量生成 A/B/C…（不写死）
  buildHalves(course) {
    return halfCourse.buildHalves(course);
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
