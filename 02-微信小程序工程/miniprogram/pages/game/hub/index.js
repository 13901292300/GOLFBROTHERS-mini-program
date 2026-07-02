const mockAvatars = require('../../../utils/mockAvatars.js');
/**
 * Game Hub —— 多组 Game 的中间控制页（赛事控制中心）
 * 四个 TAB：领先榜 / 分组表 / 讨论区 / 游戏
 * 数据源统一来自 gameStore（gameId → groups[] → scoresByPlayer）
 * 视觉复用赛事详情页样式（@import 见 wxss），TAB 吸顶逻辑与赛事详情页一致
 */

const { createHeaderStyle } = require('../../../utils/headerEngine.js');
const gameStore = require('../../../utils/gameStore.js');
const matchStateUtil = require('../../../utils/matchState.js');
const gameLeaderboard = require('../../../utils/gameLeaderboard.js');
const groupsStore = require('../../../utils/groupsStore.js');
const matchStatus = require('../../../utils/matchStatus.js');
const gameLifecycle = require('../../../utils/gameLifecycle.js');
const holeLayout = require('../../../utils/holeLayout.js');

function holePars() {
  return holeLayout.getLayout().holePars;
}

/* ===== 讨论区（与球队比赛讨论区逻辑一致：围观 + 评论流） ===== */
const WATCHERS = [
  { name: 'Alex', avatar: mockAvatars.pickMockAvatar('Alex') },
  { name: 'TigerHoods', avatar: mockAvatars.pickMockAvatar('TigerHoods') },
  { name: 'yan72', avatar: mockAvatars.pickMockAvatar('yan72') },
  { name: '大雷', avatar: mockAvatars.pickMockAvatar('大雷') },
  { name: '邵亮', avatar: mockAvatars.pickMockAvatar('邵亮') }
];
const CHAT = [
  { self: false, name: 'Alex', avatar: mockAvatars.pickMockAvatar('Alex'), text: '各组都开球了吗？领先榜可以刷起来了。', mention: '' },
  { self: true, name: '我', avatar: mockAvatars.pickMockAvatar('我'), text: '我们组在第 1 组，已经在记分了。', mention: '@Alex' },
  { self: false, name: 'yan72', avatar: mockAvatars.pickMockAvatar('yan72'), text: '收到，第 2 组马上出发。', mention: '' }
];

/* ===== 更多功能面板（与球队比赛 100% 复用同一结构/文案/图标） ===== */
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

function isFilled(s) {
  return s !== null && s !== undefined && s !== '';
}

function totalClass(diff) {
  if (diff < 0) return 'score-under';
  if (diff === 0) return 'score-even';
  return 'score-over';
}

function thruLabel(thru) {
  if (!thru) return '-';
  return thru >= 18 ? 'F' : String(thru);
}

function formatDiffWithPlus(diff) {
  if (diff > 0) return '+' + diff;
  if (diff === 0) return '0';
  return String(diff);
}


/* ===== 逐洞成绩卡（与球队比赛领先榜完全一致的派生逻辑/视觉） ===== */
// 单洞杆差 → 状态：eagle / birdie / par / bogey / double-bogey / empty
function getScoreStatus(diff) {
  if (diff === null || diff === undefined || diff === '') return 'empty';
  if (diff <= -2) return 'eagle';
  if (diff === -1) return 'birdie';
  if (diff === 0) return 'par';
  if (diff === 1) return 'bogey';
  if (diff >= 2) return 'double-bogey';
  return 'empty';
}
// 状态 → 圈/框标记 + 颜色 class（与逐洞面板一致）
function statusToMarker(status) {
  switch (status) {
    case 'eagle': return { m: 'circle', c: 'score-eagle' };
    case 'birdie': return { m: 'circle', c: 'score-birdie' };
    case 'bogey': return { m: 'square', c: 'score-bogey' };
    case 'double-bogey': return { m: 'square', c: 'score-double-bogey' };
    default: return { m: '', c: '' };
  }
}
function holeCell(score, par, mode) {
  if (!isFilled(score)) return { t: '-', m: '', c: '' };
  const diff = Number(score) - par;
  const t = mode === 'diff' ? formatDiffWithPlus(diff) : String(score);
  const marker = statusToMarker(getScoreStatus(diff));
  return { t: t, m: marker.m, c: marker.c };
}
function sumCell(scores, from, to, mode) {
  let gross = 0;
  let diff = 0;
  let filled = 0;
  for (let i = from; i < to; i++) {
    if (isFilled(scores[i])) {
      gross += Number(scores[i]);
      diff += Number(scores[i]) - holePars()[i];
      filled += 1;
    }
  }
  if (filled === 0) return { t: '', m: '', c: '' };
  return { t: mode === 'diff' ? formatDiffWithPlus(diff) : String(gross), m: '', c: '' };
}
function sumPar(from, to) {
  let n = 0;
  for (let i = from; i < to; i++) n += holePars()[i];
  return n;
}
// 由聚合成绩数组构建逐洞成绩卡（结构与 groupsStore.buildPlayerScorecard 完全一致）
const VALID_HUB_TABS = ['leaderboard', 'group', 'interaction', 'game'];
const HUB_TAB_ALIASES = {
  groups: 'group',
  teeingSheet: 'group',
  tee: 'group'
};

function resolveHubActiveTab(rawTab, from) {
  let tab = HUB_TAB_ALIASES[rawTab] || rawTab;
  if (VALID_HUB_TABS.indexOf(tab) >= 0) return tab;
  if (from === 'score') return 'group';
  return 'leaderboard';
}

function buildScorecard(scores, mode) {
  const arr = scores || [];
  const parCell = (v) => ({ t: String(v), m: '', c: '' });
  const blank = { t: '', m: '', c: '' };

  const frontHead = ['Hole', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Out', ''];
  const backHead = ['Hole', '10', '11', '12', '13', '14', '15', '16', '17', '18', 'In', 'Tot'];

  const frontPar = [{ t: 'Par', m: '', c: '' }];
  for (let i = 0; i < 9; i++) frontPar.push(parCell(holePars()[i]));
  frontPar.push(parCell(sumPar(0, 9)));
  frontPar.push(blank);

  const backPar = [{ t: 'Par', m: '', c: '' }];
  for (let i = 9; i < 18; i++) backPar.push(parCell(holePars()[i]));
  backPar.push(parCell(sumPar(9, 18)));
  backPar.push(parCell(sumPar(0, 18)));

  const frontScore = [blank];
  for (let i = 0; i < 9; i++) frontScore.push(holeCell(arr[i], holePars()[i], mode));
  frontScore.push(sumCell(arr, 0, 9, mode));
  frontScore.push(blank);

  const backScore = [blank];
  for (let i = 9; i < 18; i++) backScore.push(holeCell(arr[i], holePars()[i], mode));
  backScore.push(sumCell(arr, 9, 18, mode));
  backScore.push(sumCell(arr, 0, 18, mode));

  return { frontHead, frontPar, frontScore, backHead, backPar, backScore };
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: 'min-height:92px;height:92px;background-color:#002D62;border-bottom:2px solid var(--champion-gold);box-sizing:border-box;flex-shrink:0;',
    headerBarStyle: 'padding-top:52px;padding-right:96px;padding-bottom:16px;padding-left:16px;min-height:92px;box-sizing:border-box;display:flex;align-items:center;',
    headerTotalHeight: 92,
    tabFixed: false,
    // 分组表「空间约束型滚动」开关：内容(含按钮预留 padding)高于视口时才允许滚动，否则禁用滚动
    scrollEnabled: true,

    gameId: '',
    hubReady: false,
    groups: [],
    activeTab: 'leaderboard',
    currentGroupIndex: -1,
    // 分组表底部快捷按钮显隐：第一组卡片完全进入视口时才显示（与出发表一致）
    quickEntryVisible: false,

    courseName: '',
    roundName: '',
    gameFormat: '',
    statusText: '进行中',

    leaderboard: [],
    hasComposition: false,
    groupCards: [],
    // 当前用户所在组下标（底部「快速进入自己小组」按钮唯一入口使用）
    userGroupIndex: 0,
    // 领先榜逐洞展开（与球队比赛一致：一次只展开一行）
    openIndex: -1,
    openScorecard: null,
    scoreDisplayMode: 'gross', // gross | diff，跟随记分页全局记忆
    // 更多功能面板（与球队比赛一致）
    showMoreSheet: false,
    moreFabExpanded: false,
    moreFabDragging: false,
    moreFabHitTarget: false,
    fabStyle: '',
    fabTopPx: 0,
    showStyleSheet: false,
    halfSheetVisible: false,
    featuresCommon: [],
    featuresPermission: [],
    scoringDisplay: 'gross', // gross | strokeDiff（风格选择用）
    scorePanel: 'technical', // technical | quick
    watchers: WATCHERS,
    // 讨论区聊天数据：传入统一 discussion 组件（聊天/输入/表情逻辑全部由组件承载）
    chat: CHAT,
    currentUserId: '',
    followMap: {}
  },

  _hubDebug(stage, extra) {
    const gameId = this._gameId || this.data.gameId || '';
    const game = gameId ? gameStore.getGameById(gameId) : null;
    const groups = game ? gameStore.listGroups(game) : [];
    console.log('[HUB_DEBUG]', Object.assign({
      stage: stage,
      options: this._loadOptions || {},
      gameId: gameId,
      hasGame: !!game,
      groupsLength: groups.length,
      activeTab: this.data.activeTab,
      from: this._entryFrom || '',
      groupCardsLength: (this.data.groupCards || []).length
    }, extra || {}));
  },

  _fallbackHome(reason) {
    console.log('[HUB_FALLBACK_HOME]', { reason: reason, gameId: this._gameId || this.data.gameId });
    wx.showToast({ title: '比赛不存在', icon: 'none' });
    setTimeout(() => {
      wx.reLaunch({ url: '/pages/home/index?tab=my' });
    }, 300);
  },

  onLoad(options) {
    console.log('[HUB_ON_LOAD]', options);
    const opt = options || {};
    this._loadOptions = opt;
    this._entryFrom = opt.from || '';

    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());

    const gameId = opt.gameId || '';
    if (!gameId) {
      this._hubDebug('onLoad_missing_gameId');
      this._fallbackHome('missing_gameId');
      return;
    }

    const game = gameStore.getGameById(gameId);
    if (!game) {
      this._hubDebug('onLoad_game_not_found');
      this._fallbackHome('game_not_found');
      return;
    }

    this._gameId = gameId;
    const groups = gameStore.listGroups(game);
    const tab = resolveHubActiveTab(opt.activeTab, opt.from);
    const currentGroupIndex = opt.currentGroup != null ? Number(opt.currentGroup) : -1;

    this.setData({
      currentUserId: (gameStore.getCurrentUser() || {}).userId || '',
      gameId: gameId,
      hubReady: true,
      groups: groups,
      activeTab: tab,
      currentGroupIndex: isNaN(currentGroupIndex) ? -1 : currentGroupIndex,
      roundName: game.roundName || game.courseName || '高尔夫球局'
    });

    this._hubDebug('onLoad_ready', { resolvedTab: tab });
    this._syncHubHoleLayout();
    this.applyMoreAccess();
    this.refreshGame();

    if (tab === 'group') {
      wx.nextTick(() => {
        this.setupTeeObserver();
        this.updateGroupScrollConstraint();
      });
    }
  },

  onReady() {
    this.initHeaderNav();
    this.measureTabTop();
    wx.nextTick(() => this._initMoreFab());
  },

  onShow() {
    console.log('[HUB_ON_SHOW]', {
      options: this._loadOptions || this.options,
      dataGameId: this.data.gameId,
      activeTab: this.data.activeTab,
      hubReady: this.data.hubReady
    });
    if (!this.data.hubReady || !this._gameId) return;

    this.applyTheme(getApp().getTheme());
    // 逐洞详情显示模式跟随记分页全局记忆（与球队比赛同键）
    let mode = 'gross';
    try {
      const cached = wx.getStorageSync('scoreDisplayMode_global');
      if (cached === 'diff' || cached === 'gross') mode = cached;
    } catch (e) { mode = 'gross'; }
    this.setData({ scoreDisplayMode: mode, scoringDisplay: mode === 'diff' ? 'strokeDiff' : 'gross' });
    // 从某组记分页返回 → 刷新领先榜/分组状态（数据持久化于 gameStore）
    this.refreshGame();
    // 若停留在分组表，重建视口观察器（onHide 会解绑）
    if (this.data.activeTab === 'group') {
      wx.nextTick(() => this.setupTeeObserver());
    }
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
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle,
      headerTotalHeight: header.metrics.headerTotalHeight
    });
  },

  // ===== 数据：统一从 gameStore 读取 =====
  _syncHubHoleLayout() {
    const gameId = this._gameId || this.data.gameId;
    const game = gameId ? gameStore.getGameById(gameId) : null;
    if (!game) return;
    const layout = holeLayout.resolveLayoutFromContext({
      courseId: game.courseId,
      courseName: game.courseName,
      front9Course: game.front9Course,
      back9Course: game.back9Course
    });
    holeLayout.applyLayout(layout);
  },

  refreshGame() {
    const gameId = this._gameId || this.data.gameId;
    const game = gameId ? gameStore.getGameById(gameId) : null;
    const groups = game ? gameStore.listGroups(game) : [];

    if (!gameId || !game) {
      console.log('[HUB_DEBUG]', {
        stage: 'refreshGame_missing',
        gameId: gameId,
        hasGame: !!game,
        groupsLength: groups.length,
        activeTab: this.data.activeTab
      });
      this.setData({
        hubReady: false,
        leaderboard: [],
        groupCards: [],
        groups: []
      });
      return;
    }

    this._gameId = gameId;
    this._syncHubHoleLayout();
    const userGi = this._resolveUserGroupIndex(game);
    const headerMs = matchStatus.getMatchStatusForGameGroup(game, userGi);
    const groupCards = this._buildGroupCards(game);
    this.setData({
      gameId: gameId,
      hubReady: true,
      groups: groups,
      courseName: game.courseName || '',
      roundName: game.roundName || game.courseName || '高尔夫球局',
      gameFormat: game.gameMode || '个人比杆赛',
      statusText: matchStatus.getMatchStatusLabelZh(headerMs.statusKey),
      matchStatusBadge: headerMs.statusBadge,
      hasComposition: gameLeaderboard.gameHasComposition(game),
      leaderboard: this._buildLeaderboard(game),
      groupCards: groupCards,
      userGroupIndex: this._resolveUserGroupIndex(game)
    });
    this._hubDebug('refreshGame');
    // 已展开的逐洞详情随数据刷新（成绩可能变化）
    this.updateOpenScorecard();
    // 分组数据变化可能改变内容高度 → 重新计算分组表滚动约束
    wx.nextTick(() => this.updateGroupScrollConstraint());
  },

  // 解析当前用户所在组：按 playerId 匹配；找不到则默认第 1 组（创建者所在组）
  _resolveUserGroupIndex(game) {
    const uid = (gameStore.getCurrentUser() || {}).userId;
    let idx = -1;
    gameStore.listGroups(game).forEach((grp, gi) => {
      const hit = (grp.playersSlots || []).some((p) => p && p.playerId === uid);
      if (hit) idx = gi;
    });
    return idx < 0 ? 0 : idx;
  },

  // 领先榜：有组合 → 按 teams 聚合；无组合 → 按个人球员
  _buildLeaderboard(game) {
    const result = gameLeaderboard.build(game, this.data.openIndex);
    this._scoresIndex = result.scoresIndex;
    return result.leaderboard;
  },

  // 分组表 / 游戏：组卡片（球员列表 + 状态 + 进入记分）
  _buildGroupCards(game) {
    return groupsStore.buildGameTeeSheetView(game).map((card) => ({
      ...card,
      statusText: matchStatus.getMatchStatusLabelZh(card.statusKey)
    }));
  },

  // ===== 吸顶（与赛事详情页一致） =====
  measureTabTop() {
    wx.createSelectorQuery()
      .in(this)
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
          this._tabTop = tabRect.top - scrollRect.top + scrollOff.scrollTop;
        }
      });
  },

  onScroll(e) {
    if (this._tabTop == null) return;
    const scrollTop = e.detail.scrollTop || 0;
    const fixed = scrollTop >= this._tabTop;
    if (fixed !== this.data.tabFixed) {
      this.setData({ tabFixed: fixed });
    }
    // 注意：scroll 不再控制输入栏显隐（避免错误卸载/消失）；输入栏仅由 activeTab 决定 show/hide
  },

  switchTab(e) {
    const tab = resolveHubActiveTab(e.currentTarget.dataset.tab, this._entryFrom);
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
    if (tab === 'group') {
      // 进入分组表：DOM 渲染后绑定"第一组卡片"视口观察器（按钮初始隐藏），并计算空间约束型滚动
      wx.nextTick(() => {
        this.setupTeeObserver();
        this.updateGroupScrollConstraint();
      });
    } else {
      this.disconnectTeeObserver();
      if (this.data.quickEntryVisible) this.setData({ quickEntryVisible: false });
      // 离开分组表：恢复自由滚动
      if (!this.data.scrollEnabled) this.setData({ scrollEnabled: true });
    }
  },

  // 观察"第一组卡片"是否完全进入视口，驱动底部快捷入口显隐（与出发表一致）
  setupTeeObserver() {
    this.disconnectTeeObserver();
    if (this.data.activeTab !== 'group') return;
    const observer = this.createIntersectionObserver({ thresholds: [0, 0.5, 0.99, 1] });
    observer.relativeToViewport().observe('.js-first-tee-group', (res) => {
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

  // 分组表「空间约束型滚动」：按 视口高 与 内容高(已含底部按钮预留 padding) 计算是否需要滚动。
  // 内容 ≤ 视口 → 禁用滚动（无意义滚动消除）；内容 > 视口 → 允许滚动（底部 padding 已 clamp，最后一组不被按钮遮挡）。
  updateGroupScrollConstraint() {
    // 非分组表：恢复自由滚动（领先榜/讨论区/游戏 需正常滚动）
    if (this.data.activeTab !== 'group') {
      if (!this.data.scrollEnabled) this.setData({ scrollEnabled: true });
      return;
    }
    wx.createSelectorQuery()
      .in(this)
      .select('.detail-scroll')
      .boundingClientRect()
      .select('.tab-scroll-wrap')
      .boundingClientRect()
      .select('.detail-main')
      .boundingClientRect()
      .exec((res) => {
        const view = res && res[0];
        const tabs = res && res[1];
        const main = res && res[2];
        if (!view || !main) return;
        const viewportH = view.height; // 滚动视口可视高度
        const contentH = (tabs ? tabs.height : 0) + main.height; // 内容总高（含分组列表底部按钮预留）
        // +1 容差避免亚像素误判；need=true 表示内容溢出视口，须滚动
        const need = contentH > viewportH + 1;
        if (need !== this.data.scrollEnabled) {
          // 禁用滚动同时复位吸顶态（内容不溢出时无需吸顶）
          this.setData(need ? { scrollEnabled: true } : { scrollEnabled: false, tabFixed: false });
        }
      });
  },

  // 点击领先榜球员行：在该行下方展开/收起逐洞成绩（一次仅一个，逻辑与球队比赛一致）
  toggleScorecard(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const next = this.data.openIndex === idx ? -1 : idx;
    this.setData({ openIndex: next });
    // 重建 leaderboard 的 expanded 标记
    const lb = this.data.leaderboard.map((row, i) => Object.assign({}, row, { expanded: next === i }));
    this.setData({ leaderboard: lb });
    this.updateOpenScorecard();
  },

  // 逐洞详情：按 rowId 取领先榜同源成绩（个人 playerId / 组合 groupId:teamId）
  updateOpenScorecard() {
    const idx = this.data.openIndex;
    const row = idx >= 0 ? this.data.leaderboard[idx] : null;
    if (!row) {
      this.setData({ openScorecard: null });
      return;
    }
    const scores = (this._scoresIndex || {})[row.rowId] || [];
    this.setData({ openScorecard: buildScorecard(scores, this.data.scoreDisplayMode) });
  },

  /* ===== 更多功能面板（与球队比赛 100% 一致；所有操作绑定当前 gameId） ===== */
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
    if (permission === 'cancel_match') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this._promptCancelGame();
      return;
    }
    if (permission === 'edit_match') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      if (!this._gameId) {
        wx.showToast({ title: '当前为演示模式', icon: 'none' });
        return;
      }
      wx.navigateTo({
        url:
          '/pages/create/normal/index?mode=edit&gameId=' +
          encodeURIComponent(this._gameId) +
          '&returnTo=hub',
        fail: () => wx.showToast({ title: '页面尚未注册', icon: 'none' })
      });
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
    this.setData({ halfSheetVisible: false });
    this.refreshGame();
  },

  _promptCancelGame() {
    if (!this._gameId) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '取消比赛',
      content: '取消比赛将删除本场GAME所有数据，是否确认？',
      cancelText: '取消',
      confirmText: '确认',
      confirmColor: '#dc2626',
      success: (res) => {
        if (res.confirm) this._confirmCancelGame();
      }
    });
  },

  _confirmCancelGame() {
    const gameId = this._gameId;
    if (!gameId) return;
    const removed = gameLifecycle.purgeGameCompletely(gameId);
    if (!removed) {
      wx.showToast({ title: '比赛不存在或已删除', icon: 'none' });
      return;
    }
    this._gameId = '';
    this.setData({
      gameId: '',
      groupCards: [],
      leaderboard: [],
      showMoreSheet: false,
      moreFabExpanded: false
    });
    wx.showToast({ title: '比赛已取消', icon: 'success', duration: 1500 });
    setTimeout(() => {
      wx.reLaunch({ url: '/pages/home/index?tab=my' });
    }, 300);
  },

  /* ===== 风格选择 sheet ===== */
  openStyleSheet() {
    this.setData({ showStyleSheet: true });
  },
  closeStyleSheet() {
    this.setData({ showStyleSheet: false });
  },
  // 总杆/杆差：写入全局缓存（与记分页/球队比赛同键），并刷新已展开逐洞详情
  setScoringDisplay(e) {
    const value = e.currentTarget.dataset.value; // 'gross' | 'strokeDiff'
    const mode = value === 'gross' ? 'gross' : 'diff';
    this.setData({ scoringDisplay: value, scoreDisplayMode: mode, showStyleSheet: false });
    try {
      wx.setStorageSync('scoreDisplayMode_global', mode);
    } catch (err) {}
    this.updateOpenScorecard();
  },
  setScorePanel(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ scorePanel: value });
  },

  // 进入某组记分页：先写好该组 matchState（本组球员/赛制/球场/组数），再统一 enterScorePage
  _enterGroupScore(gi) {
    const game = gameStore.getGameById(this._gameId || this.data.gameId);
    if (!game) {
      wx.showToast({ title: '暂无比赛数据', icon: 'none' });
      return;
    }
    matchStateUtil.setMatchState(matchStateUtil.buildFromGame(game, gi));
    matchStateUtil.enterScorePage();
  },

  // 进入某组记分页（返回仍回到本 Game Hub）
  onEnterGroup(e) {
    this._enterGroupScore(Number(e.currentTarget.dataset.index) || 0);
  },

  // 分组表 TAB 唯一入口：快速进入当前用户所在组的记分页
  onEnterMyGroup() {
    this._enterGroupScore(this.data.userGroupIndex || 0);
  },

  // 返回首页「我的 TAB」
  onBack() {
    wx.reLaunch({ url: '/pages/home/index?tab=my' });
  },

  onLeaderboardFollow(e) {
    const pid = e.detail && e.detail.playerId;
    if (!pid) return;
    const map = Object.assign({}, this.data.followMap);
    map[pid] = !map[pid];
    this.setData({ followMap: map });
  },

  noop() {},
  stopPropagation() {}
});
