/**
 * 赛事详情页（球队赛 / 队内赛正在进行中）
 * 1:1 复刻 01-HTML原型/记分页面/队内赛正在进行中.html
 * 含 5 个 tab：赛事详情 / 领先榜 / 出发表 / 讨论区 / 游戏
 */

const { createHeaderStyle } = require('../../../utils/headerEngine.js');
const groupsStore = require('../../../utils/groupsStore.js');
const matchStateUtil = require('../../../utils/matchState.js');
const holeLayout = require('../../../utils/holeLayout.js');

/* ===== 讨论区 ===== */
const WATCHERS = [
  { name: 'Alex', avatar: 'https://cdn.screenshottocode.com/cZq11NkHJWMWEDneVJEYI.png' },
  { name: 'TigerHoods', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=120&h=120&q=80' },
  { name: 'yan72', avatar: 'https://cdn.screenshottocode.com/niMpIqepFahYJ6kEAhYs5.png' },
  { name: '大雷', avatar: 'https://cdn.screenshottocode.com/IzKC6-Rz1vcRKIaxXLBjh.png' },
  { name: '邵亮', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&h=120&q=80' },
  { name: '郝军峰', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&h=120&q=80' },
  { name: '大吉', avatar: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=120&h=120&q=80' },
  { name: 'Alexander', avatar: 'https://cdn.screenshottocode.com/Bd1K7CISOTpTom7xGUSFF.png' }
];
const CHAT = [
  { self: false, name: 'Alex', avatar: 'https://cdn.screenshottocode.com/cZq11NkHJWMWEDneVJEYI.png', text: '今天风不小，后九洞可能要多看一杆。', mention: '' },
  { self: true, name: '我', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=120&h=120&q=80', text: '收到，我在出发表看一下同组开球时间。', mention: '@Alex' },
  { self: false, name: 'yan72', avatar: 'https://cdn.screenshottocode.com/niMpIqepFahYJ6kEAhYs5.png', text: '领先榜刚刷新，TigerHoods 已经到 -7 了。', mention: '' }
];

/* ===== 更多功能面板 ===== */
const FEATURES_COMMON = [
  { permission: 'leaderboard', glyph: '▦', label: '领先榜' },
  { permission: 'stats', glyph: '📈', label: '统计数据' },
  { permission: 'poster', glyph: '🪪', label: '海报' },
  { permission: 'feedback', glyph: '💬', label: '反馈' },
  { permission: 'theme', glyph: '🎨', label: '风格选择' }
];
const FEATURES_PERMISSION = [
  { permission: 'edit_match', glyph: '✏️', label: '修改比赛', tone: '' },
  { permission: 'edit_half', glyph: '🗺️', label: '修改半场', tone: '' },
  { permission: 'edit_groups', glyph: '👥', label: '修改分组', tone: '' },
  { permission: 'tee_management', glyph: '🚩', label: '出发管理', tone: '' },
  { permission: 'permission_management', glyph: '🛡️', label: '权限管理', tone: '' },
  { permission: 'players', glyph: '⚙️', label: '选手管理', tone: '' },
  { permission: 'fees', glyph: '👛', label: '收费管理', tone: '' },
  { permission: 'net_score', glyph: '🧩', label: '生成净杆', tone: '' },
  { permission: 'cancel_match', glyph: '✖', label: '取消比赛', tone: 'danger' },
  { permission: 'finish_match', glyph: '⏻', label: '结束比赛', tone: 'warning' }
];

const MORE_ACCESS = { isPrivilegedUser: true, permissions: ['leaderboard', 'stats', 'poster', 'feedback', 'theme'] };
const FAB_HIDE_MARGIN_RPX = 16;
const FAB_SIZE_RPX = 60;
const FAB_EDGE_GAP_RPX = 10;

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: 'min-height:92px;height:92px;background-color:#002D62;border-bottom:2px solid var(--champion-gold);box-sizing:border-box;flex-shrink:0;',
    headerBarStyle: 'padding-top:52px;padding-right:96px;padding-bottom:16px;padding-left:16px;min-height:92px;box-sizing:border-box;display:flex;align-items:center;',
    headerTotalHeight: 92,
    // scroll-aware sticky state（位置仅由滚动驱动）
    scrollYState: 0,
    isStickyTab: false,
    tabOffsetTop: 0,
    tabBarHeight: 50,
    isStickyWatchers: false,
    watchersOffsetTop: 0,
    stickyWatchersTop: 142,
    tabShowLeftIndicator: false,
    tabShowRightIndicator: false,
    tabHScrollLeft: 0,
    contentSpacerHeight: 0,
    scrollToTopView: '',

    activeTab: 'details',

    // 领先榜
    scoringDisplay: 'strokeDiff', // gross | strokeDiff
    scorePanel: 'technical', // technical | quick
    leaderboard: [],
    openIndex: -1,
    // 逐洞详情：跟随记分页记忆的显示偏好（gross | diff），不自维护模式
    scoreDisplayMode: 'gross',
    openScorecard: null,
    courseName: 'COURSE', // 逐洞详情标题：当前球场名称（来自 groupsStore，单一数据源）

    teeGroups: [],
    // 快捷入口按钮显隐：仅当"第一组卡片完全进入视口"时为 true（基于 IntersectionObserver，非 TAB 状态/非固定常驻）
    quickEntryVisible: false,
    watchers: WATCHERS.slice(0, 5),
    allWatchers: WATCHERS,
    // 讨论区聊天数据：传入统一 discussion 组件（聊天/输入/表情逻辑全部由组件承载）
    chat: CHAT,

    // 弹层
    showMoreSheet: false,
    moreFabExpanded: false,
    moreFabDragging: false,
    moreFabHitTarget: false,
    fabStyle: '',
    fabTopPx: 0,
    showStyleSheet: false,
    halfSheetVisible: false,
    showWatchers: false,
    featuresCommon: [],
    featuresPermission: []
  },

  onLoad() {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    groupsStore.ensureInitialized();
    this._syncTournamentHoleLayout();
    this.setData({ courseName: groupsStore.getCourseName() });
    this.loadScoreDisplayMode();
    this.refreshGroupsDerived();
    this.applyMoreAccess();
  },

  // 读取记分页记忆的显示偏好（与记分页同一缓存键，逐洞详情据此显示总杆/杆差）
  loadScoreDisplayMode() {
    const saved = wx.getStorageSync('scoreDisplayMode_global');
    const mode = saved === 'diff' || saved === 'gross' ? saved : (this.data.scoreDisplayMode || 'gross');
    // 统一：缓存的显示模式同时决定 逐洞详情、领先榜TOTAL、风格选择高亮态
    this.setData({ scoreDisplayMode: mode, scoringDisplay: mode === 'diff' ? 'strokeDiff' : 'gross' });
  },

  onReady() {
    this.initHeaderNav();
    this.measureTabTop();
    wx.nextTick(() => {
      this._initMoreFab();
      this.measureTabOverflow();
    });
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
    // 显示偏好可能在记分页被切换 → 同步最新值
    this.loadScoreDisplayMode();
    // 出发表 groups 可能在记分页被更新 → 重算出发表视图与领先榜（均派生自 groups）
    this.refreshGroupsDerived();
    // 已展开的逐洞详情同步刷新（成绩/模式可能变化）
    this.updateOpenScorecard();
    // 若返回时仍停留在出发表，重建视口观察器（onHide 会解绑）
    if (this.data.activeTab === 'tee-sheet') {
      wx.nextTick(() => this.setupTeeObserver());
    }
    // 布局可能变化（主题/数据），重新测量吸顶阈值，避免阈值过期导致吸顶遮挡信息区域
    wx.nextTick(() => this.measureTabTop());
    wx.nextTick(() => this.updateTabContentSpacer());
    wx.nextTick(() => this.measureTabOverflow());
    if (this.data.activeTab === 'discussion') wx.nextTick(() => this.measureWatchersTop());
    wx.nextTick(() => this._refreshFabHitZones());
  },

  onHide() {
    this.disconnectTeeObserver();
    if (this.data.moreFabDragging) this.setData({ moreFabDragging: false });
  },

  onUnload() {
    this.disconnectTeeObserver();
  },

  _initMoreFab() {
    let sys = { windowWidth: 375, windowHeight: 667 };
    try { sys = wx.getSystemInfoSync() || sys; } catch (e) {}
    this._fabWindowH = sys.windowHeight || 667;
    this._rpx2px = (sys.windowWidth || 375) / 750;
    this._fabSizePx = FAB_SIZE_RPX * this._rpx2px;
    this._fabRightPx = FAB_HIDE_MARGIN_RPX * this._rpx2px;
    this._fabMinTopPx = FAB_EDGE_GAP_RPX * this._rpx2px;
    this._fabMaxTopPx = Math.max(this._fabMinTopPx, this._fabWindowH - this._fabSizePx - FAB_EDGE_GAP_RPX * this._rpx2px);
    const centerTop = (this._fabWindowH - this._fabSizePx) / 2;
    this._setFabTop(centerTop);
    this._refreshFabHitZones();
  },

  _setFabTop(topPx) {
    const t = Math.max(this._fabMinTopPx || 0, Math.min(this._fabMaxTopPx || 0, Number(topPx) || 0));
    this.setData({
      fabTopPx: t,
      fabStyle: 'top:' + t.toFixed(1) + 'px;right:' + (this._fabRightPx || 0).toFixed(1) + 'px;'
    });
    this._updateFabHitState(t);
  },

  _refreshFabHitZones() {
    wx.createSelectorQuery()
      .in(this)
      .selectAll('.gb-header,.tab-scroll-wrap')
      .boundingClientRect((rects) => {
        this._fabHitZones = (rects || []).filter((r) => r && r.height > 0);
        this._updateFabHitState(this.data.fabTopPx || 0);
      })
      .exec();
  },

  _updateFabHitState(topPx) {
    const centerY = Number(topPx || 0) + (this._fabSizePx || 0) / 2;
    const hit = (this._fabHitZones || []).some((z) => centerY >= z.top && centerY <= z.bottom);
    if (hit !== this.data.moreFabHitTarget) this.setData({ moreFabHitTarget: hit });
  },

  onMoreFabTouchStart(e) {
    const t = e && e.touches && e.touches[0];
    if (!t) return;
    this._fabDrag = {
      startY: t.clientY,
      startTop: this.data.fabTopPx || 0,
      moved: false
    };
    this._refreshFabHitZones();
  },

  onMoreFabTouchMove(e) {
    const t = e && e.touches && e.touches[0];
    const drag = this._fabDrag;
    if (!t || !drag) return;
    const dy = t.clientY - drag.startY;
    if (Math.abs(dy) > 2 && !drag.moved) drag.moved = true;
    if (drag.moved && !this.data.moreFabDragging) this.setData({ moreFabDragging: true });
    this._setFabTop(drag.startTop + dy);
  },

  onMoreFabTouchEnd() {
    const drag = this._fabDrag;
    if (drag && drag.moved) this._fabMovedAt = Date.now();
    this._fabDrag = null;
    if (this.data.moreFabDragging) this.setData({ moreFabDragging: false });
  },

  onMoreFabTap() {
    if (this._fabMovedAt && Date.now() - this._fabMovedAt < 180) return;
    this.openMoreSheet();
  },

  onPageTap() {
    if (this.data.moreFabExpanded && !this.data.showMoreSheet) {
      this.setData({ moreFabExpanded: false });
    }
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    const headerTotalHeight = header.metrics.headerTotalHeight;
    const tabBarHeight = this.data.tabBarHeight || 50;
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle,
      headerTotalHeight,
      stickyWatchersTop: headerTotalHeight + tabBarHeight
    });
  },

  // 测量 TAB 相对滚动内容顶部的偏移 = 信息区域（hero+intro+divider）的高度。
  // 这是吸顶阈值：scrollTop 跨过它之后 TAB 才吸顶，从而不会遮挡信息区域。
  measureTabTop() {
    this.createSelectorQuery()
      .select('.tab-scroll-wrap')
      .boundingClientRect()
      .select('.detail-scroll')
      .boundingClientRect()
      .select('.detail-scroll')
      .scrollOffset()
      .exec((res) => {
        const tabRect = res && res[0];
        const scrollRect = res && res[1];
        const scrollOff = res && res[2];
        if (tabRect && scrollRect && scrollOff) {
          const top = tabRect.top - scrollRect.top + scrollOff.scrollTop;
          // 信息区域始终存在，阈值必为正值；测得 0/负值视为测量过早，保留旧值兜底。
          if (top > 0) {
            const patch = { tabOffsetTop: top };
            if (tabRect.height > 0) {
              patch.tabBarHeight = tabRect.height;
              patch.stickyWatchersTop = (this.data.headerTotalHeight || 0) + tabRect.height;
            }
            this.setData(patch);
            this._syncStickyByScroll(scrollOff.scrollTop || 0);
            this.updateTabContentSpacer();
            if (this.data.activeTab === 'discussion') this.measureWatchersTop();
            wx.nextTick(() => this.measureTabOverflow());
          }
        }
      });
  },

  // 测量 TAB 横向滚动容器宽度，用于溢出提示符
  measureTabOverflow() {
    this.createSelectorQuery()
      .select('.tab-scroll-wrap--inflow .gb-tabs')
      .boundingClientRect()
      .selectAll('.tab-scroll-wrap--inflow .tab-btn')
      .boundingClientRect()
      .exec((res) => {
        const container = res && res[0];
        const tabs = (res && res[1]) || [];
        if (!container) return;
        this._tabContainerWidth = container.width || 0;
        let scrollWidth = 0;
        tabs.forEach((t) => { scrollWidth += (t && t.width) || 0; });
        if (scrollWidth > 0) this._lastTabScrollWidth = scrollWidth;
        const scrollLeft = this._lastTabScrollLeft || 0;
        const width = this._lastTabScrollWidth || scrollWidth;
        this._updateTabOverflowIndicators(scrollLeft, width);
      });
  },

  onTabHScroll(e) {
    const d = (e && e.detail) || {};
    const scrollLeft = d.scrollLeft || 0;
    let scrollWidth = d.scrollWidth || this._lastTabScrollWidth || 0;
    this._lastTabScrollLeft = scrollLeft;
    if (d.scrollWidth > 0) this._lastTabScrollWidth = d.scrollWidth;
    if (!this._tabContainerWidth) {
      this.measureTabOverflow();
      return;
    }
    this._updateTabOverflowIndicators(scrollLeft, scrollWidth);
  },

  _updateTabOverflowIndicators(scrollLeft, scrollWidth) {
    const containerW = this._tabContainerWidth || 0;
    const showLeft = scrollLeft > 0;
    const showRight = containerW > 0 && scrollWidth > 0 && scrollLeft + containerW < scrollWidth - 2;
    if (showLeft !== this.data.tabShowLeftIndicator || showRight !== this.data.tabShowRightIndicator) {
      this.setData({ tabShowLeftIndicator: showLeft, tabShowRightIndicator: showRight });
    }
  },

  // 测量围观行相对滚动内容顶部的偏移，用于二级吸顶（紧贴 TAB 下方）
  measureWatchersTop() {
    if (this.data.activeTab !== 'discussion') return;
    wx.nextTick(() => {
      this.createSelectorQuery()
        .select('.ds-watchers-wrap--inflow')
        .boundingClientRect()
        .select('.detail-scroll')
        .boundingClientRect()
        .select('.detail-scroll')
        .scrollOffset()
        .exec((res) => {
          const wRect = res && res[0];
          const scrollRect = res && res[1];
          const scrollOff = res && res[2];
          if (wRect && scrollRect && scrollOff && wRect.height > 0) {
            const top = wRect.top - scrollRect.top + scrollOff.scrollTop;
            if (top > 0) {
              this.setData({ watchersOffsetTop: top });
              this._syncStickyWatchersByScroll(scrollOff.scrollTop || 0);
            }
          }
        });
    });
  },

  // 内容不足时注入底部 spacer，保证外层 scroll 仍可继续上滑到 sticky 触发点
  updateTabContentSpacer() {
    const tab = this.data.activeTab;
    if (tab !== 'discussion' && tab !== 'game') {
      if (this.data.contentSpacerHeight !== 0) this.setData({ contentSpacerHeight: 0 });
      return;
    }
    wx.createSelectorQuery()
      .in(this)
      .select('.detail-scroll')
      .boundingClientRect()
      .select('.detail-main')
      .boundingClientRect()
      .select('.tab-scroll-wrap')
      .boundingClientRect()
      .select('.ds-watchers-wrap--inflow')
      .boundingClientRect()
      .exec((res) => {
        const view = res && res[0];
        const main = res && res[1];
        const tabBar = res && res[2];
        const watchersBar = res && res[3];
        if (!view || !main || !tabBar) return;
        const viewportH = view.height || 0;
        const spacerNow = this.data.contentSpacerHeight || 0;
        let contentH = Math.max(0, (main.height || 0) - spacerNow);
        if (tab === 'discussion' && watchersBar && watchersBar.height > 0) {
          contentH += watchersBar.height;
        }
        const tabH = tabBar.height || 0;
        const stickyThresholdOffset = 8; // 轻微 buffer，确保可稳定触发吸顶
        const spacer = Math.max(0, Math.ceil((viewportH - tabH + stickyThresholdOffset) - contentH));
        if (spacer !== this.data.contentSpacerHeight) {
          this.setData({ contentSpacerHeight: spacer }, () => {
            if (tab === 'discussion') this.measureWatchersTop();
          });
        }
      });
  },

  _syncStickyByScroll(scrollTop) {
    const threshold = this.data.tabOffsetTop || 0;
    const sticky = scrollTop >= threshold && threshold > 0;
    const patch = {};
    if (sticky !== this.data.isStickyTab || scrollTop !== this.data.scrollYState) {
      patch.isStickyTab = sticky;
      patch.scrollYState = scrollTop;
    }
    const watchersSticky = this._calcStickyWatchers(scrollTop, sticky);
    if (watchersSticky !== this.data.isStickyWatchers) {
      patch.isStickyWatchers = watchersSticky;
    }
    if (patch.isStickyTab === true && !this.data.isStickyTab) {
      patch.tabHScrollLeft = this._lastTabScrollLeft || 0;
    }
    if (Object.keys(patch).length) this.setData(patch);
  },

  _calcStickyWatchers(scrollTop, isStickyTab) {
    if (this.data.activeTab !== 'discussion') return false;
    if (!isStickyTab) return false;
    const watchersThreshold = this.data.watchersOffsetTop || 0;
    const stickyTop = this.data.stickyWatchersTop || 0;
    return watchersThreshold > 0 && scrollTop >= watchersThreshold - stickyTop;
  },

  _syncStickyWatchersByScroll(scrollTop) {
    const sticky = this._calcStickyWatchers(scrollTop, this.data.isStickyTab);
    if (sticky !== this.data.isStickyWatchers) {
      this.setData({ isStickyWatchers: sticky });
    }
  },

  onScroll(e) {
    const scrollTop = e.detail.scrollTop || 0;
    this._syncStickyByScroll(scrollTop);
    // 注意：scroll 不再控制输入栏显隐（避免错误卸载/消失）；输入栏仅由 activeTab 决定 show/hide
  },

  onBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab && wx.navigateBack() });
  },

  /* ===== Tabs ===== */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;
    // 切 TAB 只更新 activeTab，严格不触发布局/滚动重置。
    const patch = { activeTab: tab };
    if (tab !== 'discussion' && this.data.isStickyWatchers) {
      patch.isStickyWatchers = false;
    }
    this.setData(patch);
    wx.nextTick(() => {
      this.updateTabContentSpacer();
      if (tab === 'discussion') this.measureWatchersTop();
    });
    if (tab === 'tee-sheet') {
      // 进入出发表：DOM 渲染后绑定"第一组卡片"视口观察器（按钮初始隐藏，由可见性触发）
      wx.nextTick(() => this.setupTeeObserver());
    } else {
      // 离开出发表：解绑观察器并强制隐藏按钮
      this.disconnectTeeObserver();
      if (this.data.quickEntryVisible) this.setData({ quickEntryVisible: false });
    }
  },

  // 观察"第一组卡片"是否完全进入视口，据此驱动快捷入口按钮显隐
  setupTeeObserver() {
    this.disconnectTeeObserver();
    if (this.data.activeTab !== 'tee-sheet') return;
    const observer = this.createIntersectionObserver({ thresholds: [0, 0.5, 0.99, 1] });
    observer.relativeToViewport().observe('.js-first-tee-group', (res) => {
      // 完全可见：交叉比例≈1（top edge >= viewport top 且 bottom edge <= viewport bottom）
      const fullyVisible = res && res.intersectionRatio >= 0.99;
      if (fullyVisible !== this.data.quickEntryVisible) {
        this.setData({ quickEntryVisible: fullyVisible });
      }
    });
    this._teeObserver = observer;
  },

  disconnectTeeObserver() {
    if (this._teeObserver) {
      this._teeObserver.disconnect();
      this._teeObserver = null;
    }
  },

  // 出发表：点击任意组 → 个人比杆赛记分页。先写好该组 matchState，再统一 enterScorePage。
  onEnterGroup(e) {
    const groupId = e.currentTarget.dataset.groupId || '';
    groupsStore.ensureInitialized();
    const players = groupsStore.loadGroupForScoring(groupId).map((p) => ({
      playerId: p.playerId,
      name: p.name,
      avatar: p.avatar || ''
    }));
    const groupCount = (groupsStore.getGroups() || []).length || 2;
    const courseMeta = groupsStore.getTournamentCourseMeta();
    matchStateUtil.setMatchState({
      mode: 'individual_stroke',
      formatType: 'individual_stroke',
      gameId: '',
      groupIndex: 0,
      groupId: groupId,
      players: players,
      course: {
        courseId: courseMeta.courseId || '',
        courseName: courseMeta.courseName || groupsStore.getCourseName() || '',
        courseLocation: courseMeta.courseLocation || '',
        halfText: courseMeta.courseHalfText || '',
        front9Course: courseMeta.front9Course || null,
        back9Course: courseMeta.back9Course || null
      },
      scores: matchStateUtil.emptyScores(),
      // 赛事出发表为多组场景：返回回到赛事详情（>1 → navigateBack）
      groupCount: groupCount
    });
    matchStateUtil.enterScorePage();
  },

  /* ===== 出发表 + 领先榜（均由 groups 派生，无独立数据源） ===== */
  _syncTournamentHoleLayout() {
    const meta = groupsStore.getTournamentCourseMeta();
    const layout = holeLayout.resolveLayoutFromContext({
      courseId: meta.courseId,
      courseName: meta.courseName,
      front9Course: meta.front9Course,
      back9Course: meta.back9Course
    });
    holeLayout.applyLayout(layout);
  },

  refreshGroupsDerived() {
    this._syncTournamentHoleLayout();
    groupsStore.ensureInitialized();
    this.setData({
      teeGroups: groupsStore.getTeeGroupsView(),
      leaderboard: groupsStore.buildLeaderboard(this.data.scoringDisplay, this.data.openIndex)
    });
  },

  refreshLeaderboard() {
    this.setData({
      leaderboard: groupsStore.buildLeaderboard(this.data.scoringDisplay, this.data.openIndex)
    });
  },

  // 点击领先榜球员行：在该行下方展开/收起逐洞详情（一次仅一个）
  toggleScorecard(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const next = this.data.openIndex === idx ? -1 : idx;
    this.setData({ openIndex: next });
    this.refreshLeaderboard();
    this.updateOpenScorecard();
  },

  // 逐洞详情数据：通过 playerId 回到 groups 读取真实 holes 派生（只读，无 mock，无副本）
  updateOpenScorecard() {
    const idx = this.data.openIndex;
    const row = idx >= 0 ? this.data.leaderboard[idx] : null;
    if (!row) {
      this.setData({ openScorecard: null });
      return;
    }
    this.setData({
      openScorecard: groupsStore.buildPlayerScorecard(row.playerId, this.data.scoreDisplayMode)
    });
  },

  noop() {},

  /* ===== 更多功能面板 ===== */
  applyMoreAccess() {
    const access = MORE_ACCESS;
    const permSet = access.permissions || [];
    const visible = (scope, permission) =>
      access.isPrivilegedUser || scope === 'common' || permSet.indexOf(permission) >= 0;
    this.setData({
      featuresCommon: FEATURES_COMMON.filter((f) => visible('common', f.permission)),
      featuresPermission: FEATURES_PERMISSION.filter((f) => visible('permission', f.permission))
    });
  },

  openMoreSheet() {
    if (!this.data.moreFabExpanded) {
      this.setData({ moreFabExpanded: true });
      return;
    }
    this.applyMoreAccess();
    this.setData({ showMoreSheet: true });
  },
  closeMoreSheet() {
    this.setData({ showMoreSheet: false, moreFabExpanded: false });
  },

  onFeatureTap(e) {
    const permission = e.currentTarget.dataset.permission;
    if (permission === 'theme') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this.openStyleSheet();
      return;
    }
    if (permission === 'leaderboard') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false, activeTab: 'leaderboard' });
      return;
    }
    if (permission === 'edit_half') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false, halfSheetVisible: true });
      return;
    }
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  closeHalfSheet() {
    this.setData({ halfSheetVisible: false });
  },

  onHalfCourseConfirmed() {
    this.setData({ halfSheetVisible: false, courseName: groupsStore.getCourseName() });
    this.refreshGroupsDerived();
  },

  /* ===== 风格选择 ===== */
  openStyleSheet() {
    this.setData({ showStyleSheet: true });
  },
  closeStyleSheet() {
    this.setData({ showStyleSheet: false });
  },
  // 总杆/杆差切换：统一驱动 领先榜TOTAL + 逐洞详情面板，并写入全局缓存（与记分页同键）
  setScoringDisplay(e) {
    const value = e.currentTarget.dataset.value; // 'gross' | 'strokeDiff'
    const mode = value === 'gross' ? 'gross' : 'diff';
    this.setData({ scoringDisplay: value, scoreDisplayMode: mode, showStyleSheet: false });
    try {
      wx.setStorageSync('scoreDisplayMode_global', mode);
    } catch (err) {}
    // 1) 领先榜主列表 TOTAL  2) 已展开的逐洞详情面板（依据新模式重算每洞 SCORE）
    this.refreshLeaderboard();
    this.updateOpenScorecard();
  },
  setScorePanel(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ scorePanel: value });
  },

  /* ===== 围观行（页面级二级 sticky）===== */
  onWatcherAvatarTouchStart(e) {
    const ds = e.currentTarget.dataset || {};
    this._watcherLpPressed = false;
    if (this._watcherLpTimer) clearTimeout(this._watcherLpTimer);
    this._watcherLpTimer = setTimeout(() => {
      this._watcherLpTimer = null;
      this._watcherLpPressed = true;
      const disc = this.selectComponent('.discussion-inline');
      if (disc && disc.insertMention) disc.insertMention(ds.userid, ds.name);
    }, 500);
  },
  onWatcherAvatarTouchMove() {
    if (this._watcherLpTimer) {
      clearTimeout(this._watcherLpTimer);
      this._watcherLpTimer = null;
    }
  },
  onWatcherAvatarTouchEnd() {
    if (this._watcherLpTimer) {
      clearTimeout(this._watcherLpTimer);
      this._watcherLpTimer = null;
    }
  },

  /* ===== 围观弹层 ===== */
  openWatchers() {
    this.setData({ showWatchers: true });
  },
  closeWatchers() {
    this.setData({ showWatchers: false });
  },

  stopPropagation() {}
});
