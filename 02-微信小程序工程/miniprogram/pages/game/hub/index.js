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
const eventSponsorConfig = require('../../../utils/eventSponsorConfig.js');
const tempAdminPermission = require('../../../utils/tempAdminPermission.js');
const caddieScoringAccess = require('../../../utils/caddieScoringAccess.js');
const tempAdminAccess = require('../../../utils/tempAdminAccess.js');
const qrAccessAuth = require('../../../utils/qrAccessAuth.js');
const playerManage = require('../../../utils/playerManage.js');
const teeSheetManage = require('../../../utils/teeSheetManage.js');
const gameProgress = require('../../../utils/gameProgress.js');
const contactFollowAction = require('../../../utils/contactFollowAction.js');
const openPlayerProfileUtil = require('../../../utils/openPlayerProfile.js');

/** 开发诊断：普通多组进组/返回栈；默认关闭 */
const HUB_NAV_DEBUG = false;
function hubNavDebug() {
  if (!HUB_NAV_DEBUG) return;
  try {
    console['log'].apply(console, arguments);
  } catch (e) { /* ignore */ }
}

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
  { permission: 'feedback', glyph: '💬', label: '反馈' },
  { permission: 'theme', glyph: '🎨', label: '显示设置' }
];
const FEATURES_PERMISSION = [
  { permission: 'edit_match', glyph: '✏️', label: '修改比赛', tone: '' },
  { permission: 'edit_half', glyph: '⛳', label: '修改半场', tone: '' },
  { permission: 'manage_players', glyph: '👤', label: '选手管理', tone: '' },
  { permission: 'manage_tee_sheet', glyph: '🚩', label: '出发管理', tone: '' },
  { permission: 'edit_groups', glyph: '👥', label: '修改分组', tone: '' },
  { permission: 'permission_management', glyph: '🛡️', label: '权限管理', tone: '' },
  { permission: 'fees', glyph: '👛', label: '收费管理', tone: '' },
  { permission: 'net_score', glyph: '🧩', label: '生成净杆', tone: '' },
  { permission: 'cancel_match', glyph: '✖', label: '取消比赛', tone: 'danger' },
  { permission: 'finish_match', glyph: '⏻', label: '结束比赛', tone: 'warning' }
];

/** 已结束 GAME：仍可点的查看/设置类 */
const FEATURES_VIEW_PERMISSION_SET = {
  leaderboard: true,
  stats: true,
  feedback: true,
  theme: true
};

/** 已结束 GAME：禁用的修改/管理类（仍展示，置灰） */
const FEATURES_FINISHED_DISABLED_PERMISSION_SET = {
  edit_match: true,
  edit_half: true,
  manage_players: true,
  manage_tee_sheet: true,
  edit_groups: true,
  permission_management: true,
  fees: true,
  net_score: true,
  cancel_match: true,
  finish_match: true
};

/** M 面板管理区底部独立行：取消 / 结束（不混入上方网格） */
const FEATURES_PERMISSION_FOOTER_KEYS = {
  cancel_match: true,
  start_match: true,
  finish_match: true
};

function splitPermissionFeatures(list) {
  const items = Array.isArray(list) ? list : [];
  const main = items.filter((f) => f && !FEATURES_PERMISSION_FOOTER_KEYS[f.permission]);
  const footer = items.filter((f) => f && FEATURES_PERMISSION_FOOTER_KEYS[f.permission]);
  // 与记分页普通创建一致：用空位把底部操作顶到下一行左侧，不居中、无特殊底栏
  const cols = 4;
  const rem = main.length % cols;
  const padCount = footer.length > 0 && rem !== 0 ? (cols - rem) : 0;
  const pad = [];
  for (let i = 0; i < padCount; i++) {
    pad.push({ empty: true, permission: '__pad_' + i, label: '__placeholder__' });
  }
  return {
    featuresPermission: main,
    featuresPermissionFooterPad: pad,
    featuresPermissionFooter: footer
  };
}

const MORE_ACCESS = { isPrivilegedUser: true, permissions: ['leaderboard', 'stats', 'poster', 'feedback', 'theme', 'export_groups'] };
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
    headerTitle: '球局详情',
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
    fontScale: 'normal', // normal | large（显示设置：字体大小）
    fontScaleClass: 'font-normal',
    // 领先榜逐洞面板下方广告：广告图片1 BRIGHT/DARK
    scorecardAdImage: '',
    // 更多功能面板（与球队比赛一致）
    showMoreSheet: false,
    moreFabExpanded: false,
    moreFabDragging: false,
    moreFabHitTarget: false,
    fabStyle: '',
    fabTopPx: 0,
    showStyleSheet: false,
    halfSheetVisible: false,
    tempAdminSheetVisible: false,
    adminQrHasQr: false,
    adminQrUrl: '',
    adminQrGenerating: false,
    adminQrExpanded: true,
    adminQrAdminList: [],
    expandedAdminUserId: '',
    caddieScoringQrUrl: '',
    caddieScoringHasQr: false,
    caddieScoringGenerating: false,
    caddieQrExpanded: true,
    caddieScorerList: [],
    caddieManageSheetVisible: false,
    caddieManageTarget: null,
    phoneBindSheetVisible: false,
    phoneBindEntryType: 'admin_qr',
    phoneBindHint: '',
    playerManageSheetVisible: false,
    playerManageDisplayUsers: [],
    playerManageTeamOptions: [],
    playerManageSearchKeyword: '',
    playerManageTeamFilter: playerManage.TEAM_FILTER_ALL,
    playerManageTeamFilterLabel: '全部分队',
    playerManageGroupStatusFilter: playerManage.GROUP_STATUS_ALL,
    playerManageCountTip: '',
    playerManageEmptyText: '暂无报名选手',
    expandedPlayerManageUserId: '',
    playerTeamPickVisible: false,
    playerTeamPickUserId: '',
    playerTeamPickOptions: [],
    playerManageFilterPickVisible: false,
    playerManageFilterPickOptions: [],
    teeSheetManageSheetVisible: false,
    teeSheetManageHasGroups: false,
    teeSheetManageTimeMode: 'uniform',
    teeSheetManageIntervalMinutes: 10,
    teeSheetManageIntervalInput: '10',
    teeSheetManageUnifiedTime: '08:00',
    teeSheetManageUnifiedTimeIndex: 0,
    teeSheetManageHoleMode: 'manual',
    teeSheetManageGroups: [],
    teeSheetTimeOptions: [],
    teeSheetHoleLabels: [],
    featuresCommon: [],
    featuresPermission: [],
    featuresPermissionFooterPad: [],
    featuresPermissionFooter: [],
    scoringDisplay: 'gross', // gross | strokeDiff（风格选择用）
    scorePanel: 'technical', // technical | quick
    watchers: WATCHERS,
    // 讨论区聊天数据：传入统一 discussion 组件（聊天/输入/表情逻辑全部由组件承载）
    chat: CHAT,
    currentUserId: '',
    followMap: {},
    /** none | following | friend — 与通讯录关系状态一致 */
    relationMap: {}
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
    this._fromNormalCreateSuccess = matchStateUtil.isHubOpenedFromNormalCreate(opt);

    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    this._syncFontScale();

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
      roundName: game.roundName || game.courseName || '高尔夫球局',
      headerTitle: this._resolveHeaderTitle(game, groups)
    });

    this._hubDebug('onLoad_ready', { resolvedTab: tab });
    this._syncHubHoleLayout();
    this.applyMoreAccess();
    this.refreshGame();

    const openCaddie =
      opt.openCaddie === '1' || opt.openCaddie === 'true' || opt.openCaddie === 1;
    this._pendingOpenCaddie = !!openCaddie;

    const caddieToken = opt.caddieToken ? decodeURIComponent(String(opt.caddieToken)) : '';
    if (caddieToken) {
      wx.nextTick(() => this._tryClaimCaddieScoringAccess(caddieToken));
    }

    const adminToken = opt.adminToken ? decodeURIComponent(String(opt.adminToken)) : '';
    if (adminToken) {
      wx.nextTick(() => this._tryClaimTempAdminAccess(adminToken));
    }

    if (tab === 'group') {
      wx.nextTick(() => {
        this.setupTeeObserver();
        this.updateGroupScrollConstraint();
      });
    }

    this._maybeOpenCaddieSheetFromQuery();
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
    this._syncFontScale();
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
    this._maybeOpenCaddieSheetFromQuery();
  },

  /** 记分页 openCaddie=1：game 就绪后打开权限管理 Sheet（含球童记分区） */
  _maybeOpenCaddieSheetFromQuery() {
    if (!this._pendingOpenCaddie) return;
    if (!this.data.hubReady || !this._gameId) return;
    this._pendingOpenCaddie = false;
    wx.nextTick(() => this.openTempAdminSheet());
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
    this.setData({
      themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode',
      scorecardAdImage: eventSponsorConfig.resolveScorecardAdImageByTheme(theme)
    });
  },

  /** HEADER 标题：多组普通球局中间页固定「球局详情」；单组兜底仍用球局名（单组正常不进 Hub） */
  _resolveHeaderTitle(game, groups) {
    const list = Array.isArray(groups) ? groups : (game ? gameStore.listGroups(game) : []);
    if (list.length > 1) return '球局详情';
    return (game && (game.roundName || game.courseName)) || '高尔夫球局';
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
      headerTitle: this._resolveHeaderTitle(game, groups),
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
    const matchTeeTime = teeSheetManage.resolveMatchTeeTime(game);
    return groupsStore.buildGameTeeSheetView(game).map((card) => {
      const teeTime = teeSheetManage.resolveGroupTeeTime(card) || matchTeeTime;
      const startHole = teeSheetManage.resolveGroupStartHole(card);
      const statusKey = card.statusKey;
      // LIVE：右上角 nH + 用时（对齐队内赛 G2：holeCount + minutes + "'"）
      let statusBadge = card.statusBadge;
      if (statusKey === 'live') {
        const completedHoles = gameProgress.countCompletedHoles(game, card.groupIndex) || 0;
        statusBadge = String(completedHoles) + 'H';
        const grp =
          (Array.isArray(game.groups) && game.groups[card.groupIndex]) ||
          gameStore.getGroup(game.gameId, card.groupIndex) ||
          null;
        const firstScoreAt = grp ? Number(grp.firstScoreAt) : NaN;
        if (Number.isFinite(firstScoreAt) && firstScoreAt > 0) {
          const finishedScoreAt = grp ? Number(grp.finishedScoreAt) : NaN;
          const endMs =
            Number.isFinite(finishedScoreAt) && finishedScoreAt > 0
              ? finishedScoreAt
              : Date.now();
          statusBadge =
            statusBadge + gameProgress.formatLiveDurationBadgeSuffix(firstScoreAt, endMs);
        }
      }
      return Object.assign({}, card, {
        statusBadge: statusBadge,
        statusText: matchStatus.getMatchStatusLabelZh(statusKey),
        time: teeTime || '待设置',
        hole: startHole != null ? startHole + '号洞' : '待分配',
        teeTime: teeTime,
        startHole: startHole,
        teeMetaLine: teeSheetManage.formatTeeMetaLine(teeTime, startHole),
        hasTeeInfo: !!(teeTime || startHole != null)
      });
    });
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
  /**
   * 已结束 GAME（game.status finished/ended）时 M 项是否禁用。
   * 查看类永不因此禁用；修改/管理类禁用。
   */
  _getMoreFeatureDisabledState(game, feature) {
    if (!feature || feature.empty) return false;
    const permission = feature.permission != null ? String(feature.permission) : '';
    if (!permission || FEATURES_VIEW_PERMISSION_SET[permission]) return false;
    if (!gameProgress.isGameEnded(game)) return false;
    return !!FEATURES_FINISHED_DISABLED_PERMISSION_SET[permission];
  },

  _withMoreFeatureDisabledState(list, game) {
    const ended = gameProgress.isGameEnded(game);
    return (Array.isArray(list) ? list : []).map((f) => {
      if (!f || f.empty) return f;
      const next = Object.assign({}, f, {
        disabled: this._getMoreFeatureDisabledState(game, f)
      });
      // finish_match：进行中「结束比赛」；结束后「已结束」+ disabled
      if (String(f.permission || '') === 'finish_match') {
        next.label = ended ? '已结束' : '结束比赛';
      }
      return next;
    });
  },

  applyMoreAccess() {
    const access = MORE_ACCESS;
    const permSet = access.permissions || [];
    const visible = (scope, permission) => {
      if (access.isPrivilegedUser || scope === 'common') return true;
      if (permission === 'edit_half') {
        return permSet.indexOf('edit_match') >= 0 || permSet.indexOf('edit_half') >= 0;
      }
      return permSet.indexOf(permission) >= 0;
    };
    const permissionFeatures = FEATURES_PERMISSION
      .filter((f) => f && f.permission !== 'manage_players' && f.permission !== 'edit_groups' && f.permission !== 'fees' && f.permission !== 'net_score')
      .filter((f) => visible('permission', f.permission));
    const split = splitPermissionFeatures(permissionFeatures);
    const gameId = this._gameId || this.data.gameId || '';
    const game = gameId ? gameStore.getGameById(gameId) || gameStore.getGame(gameId) : null;
    this.setData({
      featuresCommon: this._withMoreFeatureDisabledState(
        FEATURES_COMMON.filter((f) => visible('common', f.permission)),
        game
      ),
      featuresPermission: this._withMoreFeatureDisabledState(split.featuresPermission, game),
      featuresPermissionFooterPad: split.featuresPermissionFooterPad,
      featuresPermissionFooter: this._withMoreFeatureDisabledState(
        split.featuresPermissionFooter,
        game
      )
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
    const disabledAttr = e.currentTarget.dataset.disabled;
    const disabledFromUi =
      disabledAttr === true || disabledAttr === 'true' || disabledAttr === 1 || disabledAttr === '1';
    const gameId = this._gameId || this.data.gameId || '';
    const game = gameId ? gameStore.getGameById(gameId) || gameStore.getGame(gameId) : null;
    if (
      disabledFromUi ||
      this._getMoreFeatureDisabledState(game, { permission: permission })
    ) {
      return;
    }
    if (permission === 'export_groups') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      wx.showToast({ title: '分组表导出功能开发中', icon: 'none' });
      return;
    }
    if (permission === 'theme') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this.openStyleSheet();
      return;
    }
    if (permission === 'leaderboard') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false, activeTab: 'leaderboard' });
      return;
    }
    if (permission === 'stats') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      const gameId = this._gameId || this.data.gameId || '';
      if (!gameId) {
        wx.showToast({ title: '当前为演示模式', icon: 'none' });
        return;
      }
      wx.navigateTo({
        url: '/subpackages/tournament/pages/stats/index?gameId=' + encodeURIComponent(gameId),
        fail: () => wx.showToast({ title: '统计页面尚未注册', icon: 'none' })
      });
      return;
    }
    if (permission === 'cancel_match') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this._promptCancelGame();
      return;
    }
    if (permission === 'finish_match') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this._promptFinishGame();
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
          '/subpackages/create/pages/normal/index?mode=edit&gameId=' +
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
    if (permission === 'permission_management') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this.openTempAdminSheet();
      return;
    }
    if (permission === 'manage_players' || permission === 'players') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this.openPlayerManageSheet();
      return;
    }
    if (permission === 'manage_tee_sheet' || permission === 'tee_management') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this.openTeeSheetManageSheet();
      return;
    }
    if (permission === 'feedback') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      const gameId = this._gameId || this.data.gameId || '';
      wx.navigateTo({
        url:
          '/pages/feedback/index?source=game' +
          (gameId ? '&gameId=' + encodeURIComponent(gameId) : ''),
        fail: () => wx.showToast({ title: '反馈页面尚未注册', icon: 'none' })
      });
      return;
    }
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  /* ===== 本场临时管理员（权限管理 · 扫码申请制） ===== */
  _resolveTempAdminGrantableFeatures() {
    return tempAdminPermission.buildGrantableFeatures(FEATURES_PERMISSION);
  },

  _withAdminExpandState(list) {
    const expandedId = String(this.data.expandedAdminUserId || '');
    return (Array.isArray(list) ? list : []).map((item) =>
      Object.assign({}, item, {
        expanded: !!(item && String(item.userId) === expandedId)
      })
    );
  },

  _mergeClaimedAdminIntoDraft(admin, grantable) {
    if (!admin || !admin.userId) return;
    const features = grantable || this._resolveTempAdminGrantableFeatures();
    const draft = Array.isArray(this.data.adminQrAdminList)
      ? this.data.adminQrAdminList.slice()
      : [];
    const uid = String(admin.userId);
    const gameId = this._gameId || this.data.gameId || '';
    const game = gameId ? gameStore.getGame(gameId) : null;
    if (draft.some((a) => a && String(a.userId) === uid)) {
      this.setData({
        caddieScorerList: caddieScoringAccess.listCaddieScorers(
          (game && game.tempAdmins) || []
        )
      });
      return;
    }
    const rows = tempAdminAccess.listAdminQrAdmins([admin], features);
    if (rows[0]) draft.push(rows[0]);
    this.setData({
      adminQrAdminList: this._withAdminExpandState(draft),
      caddieScorerList: caddieScoringAccess.listCaddieScorers(
        (game && game.tempAdmins) || []
      )
    });
  },

  openTempAdminSheet() {
    const gameId = this._gameId || this.data.gameId || '';
    if (!gameId) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const game = gameStore.getGame(gameId);
    if (!game) {
      wx.showToast({ title: '比赛不存在', icon: 'none' });
      return;
    }
    const grantable = this._resolveTempAdminGrantableFeatures();
    this._tempAdminGrantableFeatures = grantable;
    this._adminDraftDemotions = [];
    const adminAccess = tempAdminAccess.normalizeTempAdminAccess(game.tempAdminAccess);
    const caddieAccess = caddieScoringAccess.normalizeCaddieScoringAccess(
      game.caddieScoringAccess
    );
    this.setData({
      tempAdminSheetVisible: true,
      adminQrHasQr: !!(adminAccess && adminAccess.qrCodeUrl && adminAccess.enabled),
      adminQrUrl: adminAccess && adminAccess.qrCodeUrl ? adminAccess.qrCodeUrl : '',
      adminQrGenerating: false,
      adminQrExpanded: !adminAccess,
      expandedAdminUserId: '',
      adminQrAdminList: (tempAdminAccess.listAdminQrAdmins(game.tempAdmins, grantable) || []).map(
        (item) => Object.assign({}, item, { expanded: false })
      ),
      caddieScoringHasQr: !!(caddieAccess && caddieAccess.qrCodeUrl && caddieAccess.enabled),
      caddieScoringQrUrl: caddieAccess && caddieAccess.qrCodeUrl ? caddieAccess.qrCodeUrl : '',
      caddieScoringGenerating: false,
      caddieQrExpanded: !caddieAccess,
      caddieScorerList: caddieScoringAccess.listCaddieScorers(game.tempAdmins),
      caddieManageSheetVisible: false,
      caddieManageTarget: null
    });
  },

  _canOpenPlayerManage(game) {
    const user = gameStore.getCurrentUser() || {};
    return playerManage.canManagePlayers(
      game,
      user.userId,
      !!(MORE_ACCESS && MORE_ACCESS.isPrivilegedUser)
    );
  },

  openPlayerManageSheet() {
    wx.showToast({ title: '请在记分页添加/删除中调整球员', icon: 'none' });
  },

  _syncPlayerManageDisplay(extra) {
    const draft = this._playerManageDraft;
    const view = playerManage.buildPlayerManageDisplay(draft ? draft.players : [], {
      keyword: this.data.playerManageSearchKeyword,
      teamFilter: this.data.playerManageTeamFilter,
      groupStatusFilter: this.data.playerManageGroupStatusFilter,
      groups: draft ? draft.groupsDraft : [],
      expandedUserId: this.data.expandedPlayerManageUserId
    });
    this.setData(
      Object.assign(
        {
          playerManageDisplayUsers: view.list,
          playerManageCountTip: view.countTip,
          playerManageEmptyText: view.emptyText
        },
        extra || {}
      )
    );
  },

  _patchPlayerManageDraft(userId, patch) {
    if (!this._playerManageDraft || !userId) return;
    this._playerManageDraft.players = playerManage.updatePlayerField(
      this._playerManageDraft.players,
      userId,
      patch,
      this.data.playerManageTeamOptions
    );
    this._syncPlayerManageDisplay();
  },

  closePlayerManageSheet() {
    if (this._playerManageSearchTimer) {
      clearTimeout(this._playerManageSearchTimer);
      this._playerManageSearchTimer = null;
    }
    this._playerManageDraft = null;
    this.setData({
      playerManageSheetVisible: false,
      playerManageDisplayUsers: [],
      playerManageTeamOptions: [],
      playerManageSearchKeyword: '',
      playerManageTeamFilter: playerManage.TEAM_FILTER_ALL,
      playerManageTeamFilterLabel: '全部分队',
      playerManageGroupStatusFilter: playerManage.GROUP_STATUS_ALL,
      playerManageCountTip: '',
      playerManageEmptyText: '暂无报名选手',
      expandedPlayerManageUserId: '',
      playerTeamPickVisible: false,
      playerTeamPickUserId: '',
      playerTeamPickOptions: [],
      playerManageFilterPickVisible: false,
      playerManageFilterPickOptions: []
    });
  },

  cancelPlayerManageSheet() {
    this.closePlayerManageSheet();
  },

  onPlayerManageSearchInput(e) {
    const value = e && e.detail ? String(e.detail.value || '') : '';
    this.setData({ playerManageSearchKeyword: value });
    if (this._playerManageSearchTimer) {
      clearTimeout(this._playerManageSearchTimer);
    }
    this._playerManageSearchTimer = setTimeout(() => {
      this._playerManageSearchTimer = null;
      this._syncPlayerManageDisplay();
    }, 150);
  },

  clearPlayerManageSearch() {
    if (this._playerManageSearchTimer) {
      clearTimeout(this._playerManageSearchTimer);
      this._playerManageSearchTimer = null;
    }
    this.setData({ playerManageSearchKeyword: '' }, () => this._syncPlayerManageDisplay());
  },

  openPlayerManageFilterPicker() {
    const options = playerManage.buildTeamFilterOptions(
      this.data.playerManageTeamOptions,
      this.data.playerManageTeamFilter
    );
    this.setData({
      playerManageFilterPickVisible: true,
      playerManageFilterPickOptions: options,
      playerTeamPickVisible: false
    });
  },

  closePlayerManageFilterPicker() {
    this.setData({
      playerManageFilterPickVisible: false,
      playerManageFilterPickOptions: []
    });
  },

  onPlayerManageFilterPick(e) {
    const key = String((e.currentTarget.dataset && e.currentTarget.dataset.filter) || '');
    let filter = playerManage.TEAM_FILTER_ALL;
    if (key && key !== playerManage.TEAM_FILTER_ALL) filter = key;
    const label = playerManage.resolveTeamFilterLabel(
      this.data.playerManageTeamOptions,
      filter
    );
    this.setData(
      {
        playerManageTeamFilter: filter,
        playerManageTeamFilterLabel: label,
        playerManageFilterPickVisible: false,
        playerManageFilterPickOptions: []
      },
      () => this._syncPlayerManageDisplay()
    );
  },

  onPlayerManageGroupStatusTap(e) {
    const status = String((e.currentTarget.dataset && e.currentTarget.dataset.status) || '');
    if (
      status !== playerManage.GROUP_STATUS_ALL &&
      status !== playerManage.GROUP_STATUS_GROUPED &&
      status !== playerManage.GROUP_STATUS_UNGROUPED
    ) {
      return;
    }
    if (String(this.data.playerManageGroupStatusFilter || '') === status) return;
    this.setData({ playerManageGroupStatusFilter: status }, () =>
      this._syncPlayerManageDisplay()
    );
  },

  togglePlayerManageExpand(e) {
    const userId = String((e.currentTarget.dataset && e.currentTarget.dataset.userid) || '');
    if (!userId) return;
    const next =
      String(this.data.expandedPlayerManageUserId || '') === userId ? '' : userId;
    this.setData(
      {
        expandedPlayerManageUserId: next,
        playerTeamPickVisible: false,
        playerManageFilterPickVisible: false
      },
      () => this._syncPlayerManageDisplay()
    );
  },

  onPlayerManageNicknameInput(e) {
    const userId = String((e.currentTarget.dataset && e.currentTarget.dataset.userid) || '');
    const value = e && e.detail ? String(e.detail.value || '') : '';
    if (!userId) return;
    this._patchPlayerManageDraft(userId, { matchNickname: value });
  },

  onPlayerManageCopyPhone(e) {
    const phone = this._resolvePlayerManagePhone(e);
    if (!phone) {
      wx.showToast({ title: '暂无手机号', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: phone,
      success: () => {
        wx.showToast({ title: '手机号已复制', icon: 'success' });
      }
    });
  },

  _resolvePlayerManagePhone(e) {
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
    let phone = String(ds.phone || '').trim();
    if (!phone && this._playerManageDraft) {
      const userId = String(ds.userid || '');
      const player = (this._playerManageDraft.players || []).find(
        (p) => p && String(p.userId) === userId
      );
      phone = playerManage.resolvePhone(player) || (player && player.phone) || '';
    }
    return String(phone || '').trim();
  },

  /** 选手管理：点击手机号拨打（使用完整号码，catchtap 阻止展开冒泡） */
  onPlayerManageCallPhone(e) {
    const phone = this._resolvePlayerManagePhone(e);
    this.callPlayerPhone(phone);
  },

  callPlayerPhone(phone) {
    const raw = String(phone || '').trim();
    if (!raw) {
      wx.showToast({ title: '暂无手机号', icon: 'none' });
      return;
    }
    const phoneNumber = raw.replace(/[^\d+]/g, '');
    if (!phoneNumber) {
      wx.showToast({ title: '暂无手机号', icon: 'none' });
      return;
    }
    wx.makePhoneCall({
      phoneNumber: phoneNumber,
      fail: (err) => {
        const msg = err && err.errMsg ? String(err.errMsg) : '';
        if (msg.indexOf('cancel') >= 0 || msg.indexOf('取消') >= 0) return;
        wx.showToast({ title: '无法拨打电话', icon: 'none' });
      }
    });
  },

  onPlayerManageGenderTap(e) {
    const ds = e.currentTarget.dataset || {};
    const userId = String(ds.userid || '');
    const gender = String(ds.gender || '');
    if (!userId || !gender) return;
    this._patchPlayerManageDraft(userId, { matchGender: gender });
  },

  openPlayerManageTeamPicker(e) {
    const userId = String((e.currentTarget.dataset && e.currentTarget.dataset.userid) || '');
    if (!userId || !this._playerManageDraft) return;
    const player = (this._playerManageDraft.players || []).find(
      (p) => p && String(p.userId) === userId
    );
    const currentId = player ? String(player.matchTeamId || '') : '';
    const options = (this.data.playerManageTeamOptions || [])
      .filter(
        (t) =>
          t &&
          String(t.id != null ? t.id : '').trim() &&
          !playerManage.isPlaceholderTeamLabel(t.name)
      )
      .map((t) => ({
        id: String(t.id != null ? t.id : ''),
        name: t.name || '未命名分队',
        selected: String(t.id != null ? t.id : '') === currentId
      }));
    if (!options.length) {
      wx.showToast({ title: '暂无可选分队', icon: 'none' });
      return;
    }
    this.setData({
      playerTeamPickVisible: true,
      playerTeamPickUserId: userId,
      playerTeamPickOptions: options,
      playerManageFilterPickVisible: false
    });
  },

  closePlayerManageTeamPicker() {
    this.setData({
      playerTeamPickVisible: false,
      playerTeamPickUserId: '',
      playerTeamPickOptions: []
    });
  },

  onPlayerManageTeamPick(e) {
    const teamId = String((e.currentTarget.dataset && e.currentTarget.dataset.teamid) || '');
    const userId = String(this.data.playerTeamPickUserId || '');
    if (!userId || !teamId) {
      this.closePlayerManageTeamPicker();
      return;
    }
    this.setData({
      playerTeamPickVisible: false,
      playerTeamPickUserId: '',
      playerTeamPickOptions: []
    });
    this._patchPlayerManageDraft(userId, { matchTeamId: teamId });
  },

  onPlayerManageRemove(e) {
    const userId = String((e.currentTarget.dataset && e.currentTarget.dataset.userid) || '');
    if (!userId || !this._playerManageDraft) return;
    wx.showModal({
      title: '删除选手',
      content: '确定将该选手从本场比赛中删除吗？',
      cancelText: '取消',
      confirmText: '确认删除',
      confirmColor: '#dc2626',
      success: (res) => {
        if (!res.confirm) return;
        const result = playerManage.removePlayerFromDraft(this._playerManageDraft, userId);
        if (!result || !result.ok) {
          wx.showToast({ title: '删除失败', icon: 'none' });
          return;
        }
        this._playerManageDraft = result.draft;
        const nextExpanded =
          String(this.data.expandedPlayerManageUserId || '') === userId
            ? ''
            : String(this.data.expandedPlayerManageUserId || '');
        this.setData({ expandedPlayerManageUserId: nextExpanded }, () =>
          this._syncPlayerManageDisplay()
        );
        wx.showToast({ title: '已从本场选手列表移除，保存后生效', icon: 'none' });
      }
    });
  },

  savePlayerManageSheet() {
    const gameId = this._gameId || this.data.gameId || '';
    if (!gameId || !this._playerManageDraft) {
      this.closePlayerManageSheet();
      return;
    }
    const game = gameStore.getGame(gameId);
    if (!game) {
      wx.showToast({ title: '比赛不存在', icon: 'none' });
      return;
    }
    // 若本场尚无 registerInfo（从分组派生），先落地再按 userId 合并
    if (
      !game.registerInfo ||
      !Array.isArray(game.registerInfo.users) ||
      !game.registerInfo.users.length
    ) {
      playerManage.ensureRegisterUsersFromGroups(game);
    }
    const result = playerManage.commitPlayerManageDraft(game, this._playerManageDraft);
    if (!result || !result.ok) {
      wx.showToast({ title: '保存失败', icon: 'none' });
      return;
    }
    gameStore.saveGame(game);
    this.closePlayerManageSheet();
    if (typeof this.refreshGame === 'function') this.refreshGame();
    wx.showToast({ title: '选手信息已保存', icon: 'success' });
  },

  /* ===== 出发管理（组级 teeTime / startHole，draft 机制） ===== */
  _canOpenTeeSheetManage(game) {
    const user = gameStore.getCurrentUser() || {};
    return teeSheetManage.canManageTeeSheet(
      game,
      user.userId,
      !!(MORE_ACCESS && MORE_ACCESS.isPrivilegedUser)
    );
  },

  openTeeSheetManageSheet() {
    const gameId = this._gameId || this.data.gameId || '';
    if (!gameId) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const game = gameStore.getGame(gameId);
    if (!game) {
      wx.showToast({ title: '比赛不存在', icon: 'none' });
      return;
    }
    if (!this._canOpenTeeSheetManage(game)) {
      wx.showToast({ title: '暂无出发管理权限', icon: 'none' });
      return;
    }
    const timeOptions = teeSheetManage.buildTimeOptions();
    const holeOpts = teeSheetManage.buildHoleOptions();
    const draft = teeSheetManage.buildTeeSheetDraft(game, {});
    this._teeSheetDraft = draft;
    this.setData(
      {
        teeSheetManageSheetVisible: true,
        teeSheetTimeOptions: timeOptions,
        teeSheetHoleLabels: holeOpts.map((h) => h.label)
      },
      () => this._syncTeeSheetManageDisplay()
    );
  },

  _syncTeeSheetManageDisplay(extra) {
    const draft = this._teeSheetDraft;
    if (!draft) return;
    const timeOptions = this.data.teeSheetTimeOptions || teeSheetManage.buildTimeOptions();
    let unifiedIdx = timeOptions.indexOf(draft.unifiedTime);
    if (unifiedIdx < 0) unifiedIdx = timeOptions.indexOf('08:00');
    if (unifiedIdx < 0) unifiedIdx = 0;
    const groups = (draft.groups || []).map((g, index) => {
      let timeIdx = timeOptions.indexOf(g.teeTime);
      if (timeIdx < 0) timeIdx = 0;
      const holeIdx =
        g.startHole != null && g.startHole >= 1 && g.startHole <= 18
          ? g.startHole - 1
          : 0;
      return Object.assign({}, g, {
        index: index,
        timeIndex: timeIdx,
        holeIndex: holeIdx
      });
    });
    this.setData(
      Object.assign(
        {
          teeSheetManageHasGroups: !!draft.hasGroups,
          teeSheetManageTimeMode: draft.timeMode,
          teeSheetManageIntervalMinutes: draft.intervalMinutes,
          teeSheetManageIntervalInput: String(draft.intervalMinutes),
          teeSheetManageUnifiedTime: draft.unifiedTime,
          teeSheetManageUnifiedTimeIndex: unifiedIdx,
          teeSheetManageHoleMode: draft.holeMode,
          teeSheetManageGroups: groups
        },
        extra || {}
      )
    );
  },

  closeTeeSheetManageSheet() {
    this._teeSheetDraft = null;
    this.setData({
      teeSheetManageSheetVisible: false,
      teeSheetManageHasGroups: false,
      teeSheetManageGroups: []
    });
  },

  cancelTeeSheetManageSheet() {
    this.closeTeeSheetManageSheet();
  },

  onTeeSheetTimeModeTap(e) {
    const mode = String((e.currentTarget.dataset && e.currentTarget.dataset.mode) || '');
    if (!this._teeSheetDraft || !mode) return;
    this._teeSheetDraft = teeSheetManage.setTimeMode(this._teeSheetDraft, mode);
    this._syncTeeSheetManageDisplay();
  },

  onTeeSheetUnifiedTimeChange(e) {
    const idx = Number(e.detail && e.detail.value);
    const timeOptions = this.data.teeSheetTimeOptions || [];
    const t = timeOptions[idx];
    if (!t || !this._teeSheetDraft) return;
    this._teeSheetDraft = teeSheetManage.setUnifiedTime(this._teeSheetDraft, t);
    this._syncTeeSheetManageDisplay();
  },

  onTeeSheetIntervalInput(e) {
    const raw = e && e.detail ? String(e.detail.value || '') : '';
    this.setData({ teeSheetManageIntervalInput: raw });
  },

  onTeeSheetIntervalBlur() {
    if (!this._teeSheetDraft) return;
    const n = teeSheetManage.normalizeIntervalMinutes(this.data.teeSheetManageIntervalInput);
    this._teeSheetDraft = teeSheetManage.setIntervalMinutes(this._teeSheetDraft, n);
    this._syncTeeSheetManageDisplay();
  },

  onTeeSheetHoleModeTap(e) {
    const mode = String((e.currentTarget.dataset && e.currentTarget.dataset.mode) || '');
    if (!this._teeSheetDraft || !mode) return;
    this._teeSheetDraft = teeSheetManage.setHoleMode(this._teeSheetDraft, mode);
    this._syncTeeSheetManageDisplay();
  },

  onTeeSheetGroupTimeChange(e) {
    const idx = Number(e.currentTarget.dataset && e.currentTarget.dataset.index);
    const timeIdx = Number(e.detail && e.detail.value);
    const timeOptions = this.data.teeSheetTimeOptions || [];
    const t = timeOptions[timeIdx];
    if (!this._teeSheetDraft || !t || !Number.isFinite(idx)) return;
    this._teeSheetDraft = teeSheetManage.setGroupTeeTime(this._teeSheetDraft, idx, t);
    this._syncTeeSheetManageDisplay();
  },

  onTeeSheetGroupHoleChange(e) {
    const idx = Number(e.currentTarget.dataset && e.currentTarget.dataset.index);
    const holeIdx = Number(e.detail && e.detail.value);
    const hole = holeIdx + 1;
    if (!this._teeSheetDraft || !Number.isFinite(idx)) return;
    this._teeSheetDraft = teeSheetManage.setGroupStartHole(this._teeSheetDraft, idx, hole);
    this._syncTeeSheetManageDisplay();
  },

  saveTeeSheetManageSheet() {
    const gameId = this._gameId || this.data.gameId || '';
    if (!gameId || !this._teeSheetDraft) {
      this.closeTeeSheetManageSheet();
      return;
    }
    const game = gameStore.getGame(gameId);
    if (!game) {
      wx.showToast({ title: '比赛不存在', icon: 'none' });
      return;
    }
    if (!this._teeSheetDraft.hasGroups) {
      this.closeTeeSheetManageSheet();
      return;
    }
    const result = teeSheetManage.commitTeeSheetDraft(game, this._teeSheetDraft);
    if (!result || !result.ok) {
      wx.showToast({ title: '保存失败', icon: 'none' });
      return;
    }
    gameStore.saveGame(game);
    this.closeTeeSheetManageSheet();
    // 立即用已保存 game 刷新分组卡展示
    if (typeof this.refreshGame === 'function') this.refreshGame();
    wx.showToast({ title: '出发安排已保存', icon: 'success' });
  },

  toggleAdminQrExpanded() {
    this.setData({ adminQrExpanded: !this.data.adminQrExpanded });
  },

  toggleAdminCandidateExpand(e) {
    const userId = String((e.currentTarget.dataset && e.currentTarget.dataset.userid) || '');
    if (!userId) return;
    const next = String(this.data.expandedAdminUserId || '') === userId ? '' : userId;
    this.setData({
      expandedAdminUserId: next,
      adminQrAdminList: (this.data.adminQrAdminList || []).map((item) =>
        Object.assign({}, item, {
          expanded: !!(item && String(item.userId) === next)
        })
      )
    });
  },

  toggleAdminCandidatePermission(e) {
    const ds = e.currentTarget.dataset || {};
    const userId = String(ds.userid || '');
    const perm = String(ds.perm || '');
    if (!userId || !perm) return;
    const list = (this.data.adminQrAdminList || []).map((item) => {
      if (!item || String(item.userId) !== userId) return item;
      const options = (item.permissionOptions || []).map((opt) => {
        if (!opt || opt.key !== perm) return opt;
        return Object.assign({}, opt, { selected: !opt.selected });
      });
      const permissions = tempAdminAccess.selectedKeysFromOptions(options);
      const status = permissions.length > 0 ? 'approved' : 'pending';
      return Object.assign({}, item, {
        permissionOptions: options,
        permissions: permissions,
        status: status,
        statusLabel: status === 'approved' ? '已授权' : '待授权'
      });
    });
    this.setData({ adminQrAdminList: list });
  },

  generateTempAdminQr() {
    this._createOrRefreshTempAdminQr(false);
  },

  regenerateTempAdminQr() {
    wx.showModal({
      title: '重新生成',
      content: '重新生成后，旧二维码将失效。已扫码管理员申请与权限不变。是否继续？',
      cancelText: '取消',
      confirmText: '重新生成',
      success: (res) => {
        if (res.confirm) this._createOrRefreshTempAdminQr(true);
      }
    });
  },

  _createOrRefreshTempAdminQr() {
    const gameId = this._gameId || this.data.gameId || '';
    if (!gameId) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const game = gameStore.getGame(gameId);
    if (!game) {
      wx.showToast({ title: '比赛不存在', icon: 'none' });
      return;
    }
    const user = gameStore.getCurrentUser() || {};
    const prev = tempAdminAccess.normalizeTempAdminAccess(game.tempAdminAccess);
    this.setData({ adminQrGenerating: true });
    const access = tempAdminAccess.createTempAdminAccess({
      source: 'game',
      gameId: gameId,
      createdBy: String(user.userId || '')
    });
    if (prev && Array.isArray(prev.claimedBy)) {
      access.claimedBy = prev.claimedBy.slice();
    }
    game.tempAdminAccess = access;
    gameStore.saveGame(game);
    this.setData({
      adminQrHasQr: true,
      adminQrUrl: access.qrCodeUrl,
      adminQrGenerating: false,
      adminQrExpanded: true
    });
    wx.showToast({ title: '二维码已生成', icon: 'success' });
  },

  saveTempAdminQrImage() {
    this._saveQrImageToAlbum(this.data.adminQrUrl);
  },

  toggleCaddieQrExpanded() {
    this.setData({ caddieQrExpanded: !this.data.caddieQrExpanded });
  },

  _syncCaddieScoringQrView(access) {
    const normalized = caddieScoringAccess.normalizeCaddieScoringAccess(access);
    this.setData({
      caddieScoringHasQr: !!(normalized && normalized.qrCodeUrl && normalized.enabled),
      caddieScoringQrUrl: normalized && normalized.qrCodeUrl ? normalized.qrCodeUrl : '',
      caddieScoringGenerating: false,
      caddieQrExpanded: true
    });
  },

  generateCaddieScoringQr() {
    this._createOrRefreshCaddieScoringQr(false);
  },

  regenerateCaddieScoringQr() {
    wx.showModal({
      title: '重新生成',
      content: '重新生成后，旧二维码将失效。是否继续？',
      cancelText: '取消',
      confirmText: '重新生成',
      success: (res) => {
        if (res.confirm) this._createOrRefreshCaddieScoringQr(true);
      }
    });
  },

  _createOrRefreshCaddieScoringQr() {
    const gameId = this._gameId || this.data.gameId || '';
    if (!gameId) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const game = gameStore.getGame(gameId);
    if (!game) {
      wx.showToast({ title: '比赛不存在', icon: 'none' });
      return;
    }
    const user = gameStore.getCurrentUser() || {};
    this.setData({ caddieScoringGenerating: true });
    const access = caddieScoringAccess.createCaddieScoringAccess({
      source: 'game',
      gameId: gameId,
      createdBy: String(user.userId || '')
    });
    game.caddieScoringAccess = access;
    gameStore.saveGame(game);
    this._syncCaddieScoringQrView(access);
    wx.showToast({ title: '二维码已生成', icon: 'success' });
  },

  saveCaddieScoringQrImage() {
    this._saveQrImageToAlbum(this.data.caddieScoringQrUrl);
  },

  _saveQrImageToAlbum(rawUrl) {
    const url = String(rawUrl || '').trim();
    if (!url) {
      wx.showToast({ title: '请先生成二维码', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中', mask: true });
    wx.downloadFile({
      url: url,
      success: (res) => {
        if (!res || res.statusCode !== 200 || !res.tempFilePath) {
          wx.hideLoading();
          wx.showToast({ title: '下载失败', icon: 'none' });
          return;
        }
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
            wx.hideLoading();
            wx.showToast({ title: '已保存到相册', icon: 'success' });
          },
          fail: (err) => {
            wx.hideLoading();
            const msg = err && err.errMsg ? String(err.errMsg) : '';
            if (msg.indexOf('auth deny') >= 0 || msg.indexOf('authorize') >= 0) {
              wx.showModal({
                title: '需要相册权限',
                content: '请在设置中允许保存到相册后重试',
                confirmText: '去设置',
                success: (r) => {
                  if (r.confirm) wx.openSetting({});
                }
              });
              return;
            }
            wx.showToast({ title: '保存失败', icon: 'none' });
          }
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '下载失败', icon: 'none' });
      }
    });
  },

  /** 临时管理员扫码进入：先过注册/手机号闸门，再写入 pending */
  _tryClaimTempAdminAccess(token) {
    this._beginQrAccessClaim('admin_qr', token);
  },

  /** 球童扫码进入：先过注册/手机号闸门，再写入 manage_scoring */
  _tryClaimCaddieScoringAccess(token) {
    this._beginQrAccessClaim('caddie_qr', token);
  },

  _beginQrAccessClaim(entryType, token) {
    const type = entryType === 'caddie_qr' ? 'caddie_qr' : 'admin_qr';
    const tok = String(token || '').trim();
    if (!tok) return;
    this._pendingQrClaim = { entryType: type, token: tok };
    const gate = qrAccessAuth.ensureRegisteredAndPhoneBound(type);
    if (gate.ok) {
      this._executePendingQrClaim(gate.user);
      return;
    }
    const copy = gate.copy || qrAccessAuth.getCopy(type);
    if (gate.reason === 'need_login') {
      wx.showModal({
        title: copy.needLoginTitle,
        content: copy.needLoginContent,
        cancelText: '取消',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) this._openPhoneBindForQrClaim(type);
          else this._cancelPendingQrClaim(type);
        }
      });
      return;
    }
    wx.showModal({
      title: copy.needPhoneTitle,
      content: copy.needPhoneContent,
      cancelText: '取消',
      confirmText: '去绑定',
      success: (res) => {
        if (res.confirm) this._openPhoneBindForQrClaim(type);
        else this._cancelPendingQrClaim(type);
      }
    });
  },

  _openPhoneBindForQrClaim(entryType) {
    const type = entryType === 'caddie_qr' ? 'caddie_qr' : 'admin_qr';
    const copy = qrAccessAuth.getCopy(type);
    this.setData({
      phoneBindSheetVisible: true,
      phoneBindEntryType: type,
      phoneBindHint: copy.needPhoneContent
    });
  },

  _cancelPendingQrClaim(entryType) {
    const type =
      entryType ||
      (this._pendingQrClaim && this._pendingQrClaim.entryType) ||
      'admin_qr';
    this._pendingQrClaim = null;
    this.setData({ phoneBindSheetVisible: false });
    const copy = qrAccessAuth.getCopy(type);
    wx.showToast({ title: copy.cancelToast, icon: 'none', duration: 2500 });
  },

  onPhoneBindSheetCancel() {
    this._cancelPendingQrClaim(this.data.phoneBindEntryType);
  },

  onPhoneBindSheetSuccess() {
    this.setData({ phoneBindSheetVisible: false });
    const pending = this._pendingQrClaim;
    if (!pending || !pending.token) return;
    const gate = qrAccessAuth.ensureRegisteredAndPhoneBound(pending.entryType);
    if (!gate.ok) {
      this._cancelPendingQrClaim(pending.entryType);
      return;
    }
    this._executePendingQrClaim(gate.user);
  },

  _executePendingQrClaim(profile) {
    const pending = this._pendingQrClaim;
    this._pendingQrClaim = null;
    if (!pending || !pending.token) return;
    if (pending.entryType === 'caddie_qr') {
      this._claimCaddieAfterAuth(pending.token, profile);
    } else {
      this._claimAdminAfterAuth(pending.token, profile);
    }
  },

  _claimAdminAfterAuth(token, profile) {
    const gameId = this._gameId || this.data.gameId || '';
    if (!gameId) return;
    const game = gameStore.getGame(gameId);
    if (!game) return;
    const grantable = this._resolveTempAdminGrantableFeatures();
    const user = profile || qrAccessAuth.buildClaimProfile('admin_qr');
    if (!user.userId || !user.phone) return;
    const result = tempAdminAccess.claimTempAdminAccess(game, token, user.userId, user);
    if (!result || !result.ok) {
      if (result && result.reason === 'invalid_token') {
        wx.showToast({ title: '二维码无效或已失效', icon: 'none' });
      } else if (result && result.reason === 'no_phone') {
        wx.showToast({ title: '未绑定手机号，无法申请临时管理员权限', icon: 'none' });
      }
      return;
    }
    gameStore.saveGame(game);
    if (this.data.tempAdminSheetVisible) {
      this._mergeClaimedAdminIntoDraft(result.admin, grantable);
    }
    wx.showToast({
      title: '已提交管理员申请，请等待管理员授权',
      icon: 'none',
      duration: 2500
    });
  },

  _claimCaddieAfterAuth(token, profile) {
    const gameId = this._gameId || this.data.gameId || '';
    if (!gameId) return;
    const game = gameStore.getGame(gameId);
    if (!game) return;
    const user = profile || qrAccessAuth.buildClaimProfile('caddie_qr');
    if (!user.userId || !user.phone) return;
    const result = caddieScoringAccess.claimCaddieScoringAccess(
      game,
      token,
      user.userId,
      user
    );
    if (!result || !result.ok) {
      if (result && result.reason === 'invalid_token') {
        wx.showToast({ title: '二维码无效或已失效', icon: 'none' });
      } else if (result && result.reason === 'no_phone') {
        wx.showToast({ title: '未绑定手机号，无法获得记分权限', icon: 'none' });
      }
      return;
    }
    gameStore.saveGame(game);
    if (this.data.tempAdminSheetVisible) {
      this._syncCaddieScorerList(game);
    }
    wx.showToast({
      title: result.already ? '已拥有本场记分权限' : '已获得本场记分权限',
      icon: 'success'
    });
  },

  mockScanAdminQr() {
    const gameId = this._gameId || this.data.gameId || '';
    const game = gameId ? gameStore.getGame(gameId) : null;
    const access = tempAdminAccess.normalizeTempAdminAccess(
      game && game.tempAdminAccess
    );
    if (!access || !access.token) {
      wx.showToast({ title: '请先生成临时管理员二维码', icon: 'none' });
      return;
    }
    this._tryClaimTempAdminAccess(access.token);
  },

  mockScanCaddieQr() {
    const gameId = this._gameId || this.data.gameId || '';
    const game = gameId ? gameStore.getGame(gameId) : null;
    const access = caddieScoringAccess.normalizeCaddieScoringAccess(
      game && game.caddieScoringAccess
    );
    if (!access || !access.token) {
      wx.showToast({ title: '请先生成球童记分二维码', icon: 'none' });
      return;
    }
    this._tryClaimCaddieScoringAccess(access.token);
  },

  toggleMockPhoneBound() {
    const state = qrAccessAuth.getAuthDebugState();
    const bound = !!(state.phone && state.mockPhoneBound !== false);
    if (bound) {
      qrAccessAuth.setMockPhoneBound(false);
      gameStore.setCurrentUserPhone('');
      wx.showToast({ title: '已模拟未绑定手机号', icon: 'none' });
    } else {
      qrAccessAuth.bindPhone('13800000000');
      wx.showToast({ title: '已模拟绑定手机号', icon: 'none' });
    }
  },

  _syncCaddieScorerList(gameOrNull) {
    const gameId = this._gameId || this.data.gameId || '';
    const game = gameOrNull || (gameId ? gameStore.getGame(gameId) : null);
    this.setData({
      caddieScorerList: caddieScoringAccess.listCaddieScorers(
        game && game.tempAdmins ? game.tempAdmins : []
      )
    });
  },

  closeTempAdminSheet() {
    this._tempAdminGrantableFeatures = null;
    this._adminDraftDemotions = [];
    this.setData({
      tempAdminSheetVisible: false,
      adminQrHasQr: false,
      adminQrUrl: '',
      adminQrGenerating: false,
      adminQrExpanded: true,
      adminQrAdminList: [],
      expandedAdminUserId: '',
      caddieScoringHasQr: false,
      caddieScoringQrUrl: '',
      caddieScoringGenerating: false,
      caddieQrExpanded: true,
      caddieScorerList: [],
      caddieManageSheetVisible: false,
      caddieManageTarget: null
    });
  },

  cancelTempAdminSheet() {
    this.closeTempAdminSheet();
  },

  saveTempAdminSheet() {
    const gameId = this._gameId || this.data.gameId || '';
    if (!gameId) {
      this.closeTempAdminSheet();
      return;
    }
    const game = gameStore.getGame(gameId);
    if (!game) {
      wx.showToast({ title: '比赛不存在', icon: 'none' });
      return;
    }
    const grantable =
      this._tempAdminGrantableFeatures || this._resolveTempAdminGrantableFeatures();
    tempAdminAccess.commitAdminQrDraft(
      game,
      this.data.adminQrAdminList,
      this._adminDraftDemotions || [],
      grantable
    );
    gameStore.saveGame(game);
    this.closeTempAdminSheet();
    wx.showToast({ title: '权限已保存', icon: 'success' });
  },

  onRemoveAdminQrTempAdmin(e) {
    const userId = String(
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.userid) ||
        this.data.expandedAdminUserId ||
        ''
    );
    if (!userId) return;
    wx.showModal({
      title: '移除临时管理员',
      content: '确定移除该用户的本场临时管理员申请吗？',
      cancelText: '取消',
      confirmText: '确认移除',
      confirmColor: '#dc2626',
      success: (res) => {
        if (!res.confirm) return;
        const gameId = this._gameId || this.data.gameId || '';
        const game = gameStore.getGame(gameId);
        const result = tempAdminAccess.removeAdminQrFromDraftList(
          this.data.adminQrAdminList,
          userId,
          game
        );
        if (!result || !result.ok) {
          wx.showToast({ title: '移除失败', icon: 'none' });
          return;
        }
        if (result.demoted) {
          const demotions = Array.isArray(this._adminDraftDemotions)
            ? this._adminDraftDemotions.slice()
            : [];
          const di = demotions.findIndex(
            (d) => d && String(d.userId) === String(result.demoted.userId)
          );
          if (di >= 0) demotions[di] = result.demoted;
          else demotions.push(result.demoted);
          this._adminDraftDemotions = demotions;
        }
        const nextExpanded =
          String(this.data.expandedAdminUserId || '') === userId
            ? ''
            : String(this.data.expandedAdminUserId || '');
        this.setData({
          expandedAdminUserId: nextExpanded,
          adminQrAdminList: (result.list || []).map((item) =>
            Object.assign({}, item, {
              expanded: !!(item && String(item.userId) === nextExpanded)
            })
          )
        });
        wx.showToast({ title: '已从列表移除，保存后生效', icon: 'none' });
      }
    });
  },

  openCaddieScorerManage(e) {
    const userId = String((e.currentTarget.dataset && e.currentTarget.dataset.userid) || '');
    if (!userId) return;
    const list = this.data.caddieScorerList || [];
    const target = list.find((item) => item && String(item.userId) === userId) || null;
    if (!target) return;
    this.setData({
      caddieManageSheetVisible: true,
      caddieManageTarget: target
    });
  },

  closeCaddieScorerManage() {
    this.setData({
      caddieManageSheetVisible: false,
      caddieManageTarget: null
    });
  },

  onRemoveCaddieScoringPermission() {
    const target = this.data.caddieManageTarget;
    if (!target || !target.userId) return;
    const userId = String(target.userId);
    wx.showModal({
      title: '移除球童记分员',
      content: '确定移除该球童的本场记分权限吗？',
      cancelText: '取消',
      confirmText: '确认移除',
      confirmColor: '#dc2626',
      success: (res) => {
        if (!res.confirm) return;
        const gameId = this._gameId || this.data.gameId || '';
        const game = gameStore.getGame(gameId);
        if (!game) {
          wx.showToast({ title: '比赛不存在', icon: 'none' });
          return;
        }
        const result = caddieScoringAccess.removeCaddieScoringPermission(game, userId);
        if (!result || !result.ok) {
          wx.showToast({ title: '移除失败', icon: 'none' });
          return;
        }
        gameStore.saveGame(game);
        this.setData({
          caddieManageSheetVisible: false,
          caddieManageTarget: null,
          caddieScorerList: caddieScoringAccess.listCaddieScorers(game.tempAdmins)
        });
        wx.showToast({ title: '已移除记分权限', icon: 'success' });
      }
    });
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

  /**
   * 结束比赛（M 面板 finish_match）
   * 整场结束：gameProgress.confirmFinishWholeGame（非记分页「结束本组」）
   */
  _promptFinishGame() {
    const gameId = this._gameId || this.data.gameId || '';
    if (!gameId) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const game = gameStore.getGameById(gameId) || gameStore.getGame(gameId);
    if (!game) {
      wx.showToast({ title: '未找到比赛信息', icon: 'none' });
      return;
    }
    if (gameProgress.isGameEnded(game)) {
      wx.showToast({ title: '比赛已经结束。', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '结束比赛',
      content: '确认结束本场比赛？结束后成绩将不可再修改。',
      cancelText: '暂不结束',
      confirmText: '确认结束',
      confirmColor: '#ce9224',
      success: (res) => {
        if (res.confirm) this._confirmFinishGame();
      }
    });
  },

  _confirmFinishGame() {
    const gameId = this._gameId || this.data.gameId || '';
    if (!gameId) return;
    const game = gameStore.getGameById(gameId) || gameStore.getGame(gameId);
    if (!game) {
      wx.showToast({ title: '未找到比赛信息', icon: 'none' });
      return;
    }
    if (gameProgress.isGameEnded(game)) {
      wx.showToast({ title: '比赛已经结束。', icon: 'none' });
      this.applyMoreAccess();
      return;
    }
    gameProgress.confirmFinishWholeGame(gameId);
    this.refreshGame();
    this.applyMoreAccess();
    wx.showToast({ title: '比赛已结束', icon: 'success' });
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

  /* ===== 显示设置（字体大小） ===== */
  _getFontScale() {
    try {
      return wx.getStorageSync('fontScale_global') === 'large' ? 'large' : 'normal';
    } catch (e) {
      return 'normal';
    }
  },

  _syncFontScale() {
    const fontScale = this._getFontScale();
    this.setData({
      fontScale: fontScale,
      fontScaleClass: fontScale === 'large' ? 'font-large' : 'font-normal'
    });
  },

  _setFontScale(value) {
    const next = value === 'large' ? 'large' : 'normal';
    try {
      wx.setStorageSync('fontScale_global', next);
    } catch (e) {}
    this.setData({
      fontScale: next,
      fontScaleClass: next === 'large' ? 'font-large' : 'font-normal'
    });
  },

  openStyleSheet() {
    this.setData({
      showStyleSheet: true,
      fontScale: this._getFontScale()
    });
  },
  closeStyleSheet() {
    this.setData({ showStyleSheet: false });
  },
  onFontScaleChange(e) {
    const value =
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.value
        : '';
    this._setFontScale(value);
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

  _hubNavStackRoutes() {
    try {
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
      return (pages || []).map(function (p) {
        const route = (p && (p.route || p.__route__)) || '';
        const gid =
          (p && p.options && p.options.gameId != null && String(p.options.gameId)) || '';
        return gid ? route + '?gameId=' + gid : route;
      });
    } catch (e) {
      return [];
    }
  },

  // 进入某组记分页：先写好该组 matchState（本组球员/赛制/球场/组数），再统一 enterScorePage
  _enterGroupScore(gi) {
    if (this._scoreEnterLock) return;
    const game = gameStore.getGameById(this._gameId || this.data.gameId);
    if (!game) {
      wx.showToast({ title: '暂无比赛数据', icon: 'none' });
      return;
    }
    this._scoreEnterLock = true;
    const self = this;
    const groupIndex = Number(gi) || 0;
    hubNavDebug('[HUB_NAV]', {
      op: 'enterGroupScore',
      gameId: this._gameId || this.data.gameId,
      groupIndex: groupIndex,
      stack: this._hubNavStackRoutes(),
      nav: 'enterScorePage/navigateTo'
    });
    matchStateUtil.setMatchState(matchStateUtil.buildFromGame(game, groupIndex));
    matchStateUtil.enterScorePage();
    setTimeout(function () {
      self._scoreEnterLock = false;
    }, 800);
  },

  // 进入某组记分页（返回仍回到本 Game Hub）
  onEnterGroup(e) {
    this._enterGroupScore(Number(e.currentTarget.dataset.index) || 0);
  },

  // 分组表 TAB 唯一入口：快速进入当前用户所在组的记分页
  onEnterMyGroup() {
    this._enterGroupScore(this.data.userGroupIndex || 0);
  },

  // 有上一页（如球友圈）则 navigateBack，保留来源页滚动；无栈时才回首页
  onBack() {
    if (this._backNavLock) return;
    this._backNavLock = true;
    const self = this;
    const release = function () {
      setTimeout(function () {
        self._backNavLock = false;
      }, 500);
    };
    if (this._fromNormalCreateSuccess) {
      hubNavDebug('[HUB_NAV]', {
        op: 'hubBack',
        gameId: this._gameId || this.data.gameId,
        nav: 'relaunch_clean_home',
        fromFlow: 'normalCreate'
      });
      wx.reLaunch({
        url: matchStateUtil.CLEAN_HOME_URL,
        complete: release,
        fail: release
      });
      return;
    }
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    hubNavDebug('[HUB_NAV]', {
      op: 'hubBack',
      gameId: this._gameId || this.data.gameId,
      stack: this._hubNavStackRoutes(),
      nav: pages && pages.length > 1 ? 'navigateBack' : 'reLaunch_home'
    });
    if (pages && pages.length > 1) {
      wx.navigateBack({
        delta: 1,
        complete: release,
        fail: release
      });
      return;
    }
    wx.reLaunch({
      url: matchStateUtil.CLEAN_HOME_URL,
      complete: release,
      fail: release
    });
  },

  onLeaderboardFollow(e) {
    const detail = (e && e.detail) || {};
    const pid = String(detail.playerId || detail.userId || '').trim();
    if (!pid) return;
    const player = detail.player || {};
    const status = contactFollowAction.followUser({
      id: pid,
      playerId: pid,
      name: player.name,
      nickname: player.name || player.nickname,
      avatar: player.avatar,
      gender: player.gender
    });
    const followMap = Object.assign({}, this.data.followMap);
    const relationMap = Object.assign({}, this.data.relationMap);
    followMap[pid] = true;
    relationMap[pid] = status || contactFollowAction.getRelationStatus(pid) || 'following';
    this.setData({ followMap: followMap, relationMap: relationMap });
    wx.showToast({
      title: relationMap[pid] === 'friend' ? '已成为好友' : '已关注',
      icon: 'none',
      duration: 900
    });
  },

  /**
   * 领先榜展开 ›：统一 openPlayerProfile（navigateTo）。
   * catchtap 在组件内；不触发展开/收起。组合成员各自绑定 mem.playerId。
   */
  onLeaderboardPlayerProfileTap(e) {
    if (this._profileNavLock) return;
    const detail = (e && e.detail) || {};
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
    const payload = {
      userId: detail.userId || detail.playerId || ds.userid || ds.userId,
      playerId: detail.playerId || detail.userId || ds.playerid || ds.playerId,
      publicName:
        detail.publicName || detail.name || ds.name || '',
      name: detail.publicName || detail.name || ds.name || '',
      nickname: detail.nickname || '',
      avatar: detail.avatar || ds.avatar || '',
      gender: detail.gender,
      handicap: detail.handicap,
      floatCoef: detail.floatCoef,
      userType: detail.userType || ds.usertype || ds.userType,
      identitySource: detail.identitySource || 'gameLeaderboard'
    };
    if (detail.unavailable) {
      wx.showToast({ title: '该球员暂无主页', icon: 'none', duration: 1200 });
      return;
    }
    const targetUserId = openPlayerProfileUtil.resolveOpenableUserId(payload);
    if (!targetUserId) {
      wx.showToast({ title: '该球员暂无主页', icon: 'none', duration: 1200 });
      return;
    }
    this._profileNavLock = true;
    const self = this;
    const opened = openPlayerProfileUtil.openPlayerProfile(
      Object.assign({}, payload, {
        userId: targetUserId,
        playerId: targetUserId
      })
    );
    if (!opened) {
      this._profileNavLock = false;
      wx.showToast({ title: '该球员暂无主页', icon: 'none', duration: 1200 });
      return;
    }
    setTimeout(function () {
      self._profileNavLock = false;
    }, 800);
  },

  noop() {},
  stopPropagation() {}
});
