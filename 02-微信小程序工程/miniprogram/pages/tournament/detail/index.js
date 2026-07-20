const mockAvatars = require('../../../utils/mockAvatars.js');
/**
 * 赛事详情页（球队赛 / 队内赛正在进行中）
 * 1:1 复刻 01-HTML原型/记分页面/队内赛正在进行中.html
 * 含 5 个 tab：赛事详情 / 领先榜 / 出发表 / 讨论区 / 游戏
 */

const { createHeaderStyle } = require('../../../utils/headerEngine.js');
const groupsStore = require('../../../utils/groupsStore.js');
const matchStateUtil = require('../../../utils/matchState.js');
const holeLayout = require('../../../utils/holeLayout.js');
const halfCourse = require('../../../utils/halfCourse.js');
const partnerConfigUtil = require('../../../utils/partnerConfig.js');
const eventSponsorConfig = require('../../../utils/eventSponsorConfig.js');
const bannerConfig = require('../../../utils/bannerConfig.js');
const teamMatchStore = require('../../../utils/teamMatchStore.js');
const demoJiaobeiMatch = require('../../../utils/demoJiaobeiMatch.js');
const gameLifecycle = require('../../../utils/gameLifecycle.js');
const gameStore = require('../../../utils/gameStore.js');
const userProfileStore = require('../../../utils/userProfileStore.js');
const teamDirectory = require('../../../utils/teamDirectory.js');
const playerDirectory = require('../../../utils/playerDirectory.js');
const tPosition = require('../../../utils/tPosition.js');
const tempAdminPermission = require('../../../utils/tempAdminPermission.js');
const caddieScoringAccess = require('../../../utils/caddieScoringAccess.js');
const tempAdminAccess = require('../../../utils/tempAdminAccess.js');
const qrAccessAuth = require('../../../utils/qrAccessAuth.js');
const playerManage = require('../../../utils/playerManage.js');
const teeSheetManage = require('../../../utils/teeSheetManage.js');
const paymentManage = require('../../../utils/paymentManage.js');
const contactStore = require('../../../utils/contactStore.js');

/** 其它赛事领先榜逐洞广告默认图（交杯鲜啤演示单独走广告图片1） */
const DEFAULT_SCORECARD_AD_IMAGE =
  'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?auto=format&fit=crop&w=900&q=85';

/* ===== 赛事详情页 match 视图对象（顶部信息区数据框架） ===== */
const MATCH_TYPE_LABELS = {
  'team-internal': '队内赛',
  'inter-team': '队际赛',
  series: '系列赛'
};

/** 报名内容高度与可视区比较时的容差（px），避免四舍五入误判溢出 */
const REGISTER_CONTENT_LOCK_EPS = 4;

const WEEK_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

const EMPTY_MATCH_VIEW = {
  matchId: '',
  status: '',
  statusLabel: '',
  cardStatusText: '',
  cardStatusTone: 'default',
  logo: '',
  bannerImage: '',
  dateText: '',
  titleMain: '',
  titleSub: '',
  formatLabel: '',
  typeLabel: '',
  organizer: '',
  venue: '',
  timeText: '',
  priceTags: [],
  priceText: ''
};

/* ===== 赛事生命周期状态（teamMatchStore.match.status） ===== */
const MATCH_LIFECYCLE = {
  REGISTERING: 'registering',
  ONGOING: 'ongoing',
  COMPLETED: 'completed'
};

const EMPTY_MATCH_LIFECYCLE = {
  status: '',
  isRegistering: false,
  isOngoing: false,
  isCompleted: false
};

/* ===== TAB 配置（按生命周期，流内 TAB 与吸顶 TAB 共用唯一数据源） ===== */
const TOURNAMENT_TABS = {
  registering: [
    { id: 'details', label: '赛事信息' },
    { id: 'register', label: '报名' },
    { id: 'groups', label: '分组' },
    { id: 'discussion', label: '讨论区' }
  ],
  ongoing: [
    { id: 'details', label: '赛事信息' },
    { id: 'leaderboard', label: '领先榜' },
    { id: 'tee-sheet', label: '出发表' },
    { id: 'discussion', label: '讨论区' },
    { id: 'game', label: '游戏' }
  ],
  completed: [
    { id: 'details', label: '赛事信息' },
    { id: 'leaderboard', label: '成绩表' },
    { id: 'tee-sheet', label: '出发表' },
    { id: 'discussion', label: '讨论区' },
    { id: 'game', label: '游戏' }
  ]
};

// 无 matchId / 未知状态时，沿用进行中 TAB 集，保持既有演示页视觉不变
function resolveTournamentTabs(status) {
  return TOURNAMENT_TABS[status] || TOURNAMENT_TABS.ongoing;
}

/* ===== 讨论区 ===== */
const WATCHERS = [
  { name: 'Alex', avatar: mockAvatars.pickMockAvatar('Alex') },
  { name: 'TigerHoods', avatar: mockAvatars.pickMockAvatar('TigerHoods') },
  { name: 'yan72', avatar: mockAvatars.pickMockAvatar('yan72') },
  { name: '大雷', avatar: mockAvatars.pickMockAvatar('大雷') },
  { name: '邵亮', avatar: mockAvatars.pickMockAvatar('邵亮') },
  { name: '郝军峰', avatar: mockAvatars.pickMockAvatar('郝军峰') },
  { name: '大吉', avatar: mockAvatars.pickMockAvatar('大吉') },
  { name: 'Alexander', avatar: mockAvatars.pickMockAvatar('Alexander') }
];
const CHAT = [
  { self: false, name: 'Alex', avatar: mockAvatars.pickMockAvatar('Alex'), text: '今天风不小，后九洞可能要多看一杆。', mention: '' },
  { self: true, name: '我', avatar: mockAvatars.pickMockAvatar('我'), text: '收到，我在出发表看一下同组开球时间。', mention: '@Alex' },
  { self: false, name: 'yan72', avatar: mockAvatars.pickMockAvatar('yan72'), text: '领先榜刚刷新，TigerHoods 已经到 -7 了。', mention: '' }
];

/* ===== 更多功能面板 ===== */
const FEATURES_COMMON = [
  { permission: 'leaderboard', glyph: '▦', label: '领先榜' },
  { permission: 'stats', glyph: '📈', label: '统计数据' },
  { permission: 'feedback', glyph: '💬', label: '反馈' }
];
const FEATURES_PERMISSION = [
  { permission: 'edit_match', glyph: '✏️', label: '修改比赛', tone: '' },
  { permission: 'edit_half', glyph: '⛳', label: '修改半场', tone: '' },
  { permission: 'manage_players', glyph: '👤', label: '选手管理', tone: '' },
  { permission: 'manage_tee_sheet', glyph: '🚩', label: '出发管理', tone: '' },
  { permission: 'edit_groups', glyph: '👥', label: '修改分组', tone: '' },
  { permission: 'permission_management', glyph: '🛡️', label: '权限管理', tone: '' },
  { permission: 'manage_payment', glyph: '👛', label: '收费管理', tone: '' },
  { permission: 'net_score', glyph: '🧩', label: '生成净杆', tone: '' },
  { permission: 'cancel_match', glyph: '✖', label: '取消比赛', tone: 'danger' },
  { permission: 'finish_match', glyph: '⏻', label: '结束比赛', tone: 'warning' }
];

/* 报名中球队赛 M 面板菜单（结构/图标规范与 game/hub 多组面板一致） */
const REGISTERING_FEATURES_COMMON = [
  { permission: 'register_for_other', glyph: '📝', label: '替他人报名' },
  { permission: 'invite_friends_register', glyph: '📤', label: '邀请好友报名' }
];
const REGISTERING_FEATURES_PERMISSION = [
  { permission: 'edit_match', glyph: '✏️', label: '修改比赛', tone: '' },
  { permission: 'edit_half', glyph: '⛳', label: '修改半场', tone: '' },
  { permission: 'permission_management', glyph: '🛡️', label: '权限管理', tone: '' },
  { permission: 'manage_players', glyph: '👤', label: '选手管理', tone: '' },
  { permission: 'manage_tee_sheet', glyph: '🚩', label: '出发管理', tone: '' },
  { permission: 'manage_payment', glyph: '👛', label: '收费管理', tone: '' },
  { permission: 'close_registration', glyph: '🔒', label: '关闭报名', tone: '' },
  { permission: 'cancel_match', glyph: '✖', label: '取消比赛', tone: 'danger' },
  { permission: 'start_match', glyph: '▶', label: '开始比赛', tone: 'warning' }
];

/** M 面板管理区底部独立行：取消 / 开始 / 结束（不混入上方网格） */
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
const FEATURE_SECTION_DEFAULT = {
  commonMain: '常用功能',
  commonSub: '普通用户可用',
  permissionMain: '管理功能',
  permissionSub: '需权限'
};
const FEATURE_SECTION_REGISTERING = {
  commonMain: '普通功能',
  commonSub: '',
  permissionMain: '赛事管理',
  permissionSub: ''
};

/** 替他人报名：人员来源（player-source-sheet；无老牌组合） */
const REGISTER_FOR_OTHER_SOURCE_OPTIONS = [
  { key: 'friends', glyph: '👥', label: '从好友列表选择', desc: '选择微信好友或历史联系人' },
  {
    key: 'team_members',
    glyph: '🏌️',
    label: '从球队成员列表选择',
    desc: '选择本赛事参赛球队成员',
    disabled: true,
    locked: true
  },
  { key: 'manual', glyph: '✏️', label: '手工添加', desc: '输入姓名和手机号添加人员' }
];
const REGISTER_FOR_OTHER_TEAM_MEMBERS_DENIED_TOAST = '仅赛事管理员或参赛球队成员可使用';

/** 当前用户是否属于本赛事参赛球队（teamDirectory mock：isMine 表示我的球队） */
function resolveIsEventTeamMember(match) {
  const teamId = match && match.teamId ? String(match.teamId).trim() : '';
  if (!teamId) return false;
  const team = teamDirectory.getTeamById(teamId);
  return !!(team && team.isMine);
}

const MORE_ACCESS = { isPrivilegedUser: true, permissions: ['leaderboard', 'stats', 'poster', 'feedback', 'theme', 'export_groups'] };

/** Patch 7：是否可使用「球队成员列表」代报名渠道 */
function resolveCanUseTeamMembersChannel(match) {
  if (resolveIsEventTeamMember(match)) return true;
  if (MORE_ACCESS && MORE_ACCESS.isPrivilegedUser) return true;
  return false;
}
const TOURNAMENT_MANAGE_PERMISSIONS = FEATURES_PERMISSION.map((f) => f.permission);
const GROUPS_TAB_PLAYER_SLOTS = 4;

function createEmptyGroupPlayer(position) {
  return { position: position, userId: '' };
}

/**
 * Patch-02C3A：进记分页 mode 分流
 * 1) scoreEntities[groupId] 非空 → stroke_entity
 * 2) scoreEntities 整体不存在时，按 gameMode（四人四球/最佳球位/四人两球）兜底
 * 3) 否则 individual_stroke
 */
function resolveTournamentScorePageMode(match, groupId) {
  const gid = groupId != null ? String(groupId) : '';
  const scoreEntities = match && match.scoreEntities;
  if (scoreEntities && typeof scoreEntities === 'object' && !Array.isArray(scoreEntities)) {
    const list = Array.isArray(scoreEntities[gid]) ? scoreEntities[gid] : [];
    if (list.length > 0) return 'stroke_entity';
    return 'individual_stroke';
  }
  const gameMode = String(
    (match && (match.gameMode || match.selectedGameMode)) || ''
  ).trim();
  if (
    gameMode === '四人四球比杆赛' ||
    gameMode === '最佳球位比杆赛' ||
    gameMode === '四人两球比杆赛'
  ) {
    return 'stroke_entity';
  }
  return 'individual_stroke';
}

/** 只读展示用：从正式 groups 规范化克隆（详情页不持有 groupDraft；正式位只保留 userId/position） */
function cloneTournamentGroups(list) {
  if (!Array.isArray(list)) return [];
  return list.map((g, index) => {
    const out = {
      groupId: g && g.groupId != null ? String(g.groupId) : ('group-tab-' + Date.now() + '-' + (index + 1)),
      groupName: g && g.groupName ? String(g.groupName) : ('第' + (index + 1) + '组'),
      players: Array.from({ length: GROUPS_TAB_PLAYER_SLOTS }, (_, i) => {
        const position = i + 1;
        const found = Array.isArray(g && g.players)
          ? g.players.find((p) => {
            if (!p) return false;
            const pos = Number(p.position != null ? p.position : p.slotIndex);
            return pos === position;
          })
          : null;
        const userId = found
          ? String(found.userId || found.playerId || found.id || '').trim()
          : '';
        if (!userId) return createEmptyGroupPlayer(position);
        return {
          position: position,
          userId: userId
        };
      })
    };
    // 保留组级出发信息，供分组 TAB / 出发表回显
    const teeTime = teeSheetManage.resolveGroupTeeTime(g);
    const startHole = teeSheetManage.resolveGroupStartHole(g);
    if (teeTime) out.teeTime = teeTime;
    if (startHole != null) out.startHole = startHole;
    return out;
  });
}
const FAB_HIDE_MARGIN_RPX = 16;
const FAB_SIZE_RPX = 60;
const FAB_EDGE_GAP_RPX = 10;

const DEFAULT_REGISTER_GROUPS = [
  { id: 'team-group-1', name: '正式队员' },
  { id: 'team-group-2', name: '嘉宾' }
];

const EMPTY_REGISTER_INFO = {
  totalCount: 0,
  users: []
};

const EMPTY_CURRENT_USER_REGISTER_STATUS = {
  isRegistered: false,
  groupId: '',
  groupName: ''
};

const EMPTY_REGISTER_PERMISSION = {
  registrationStatus: 'closed',
  isOpen: false,
  reason: ''
};

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
    isStickyRegisterExt: false,
    registerExtOffsetTop: 0,
    stickyRegisterExtTop: 142,
    tabShowLeftIndicator: false,
    tabShowRightIndicator: false,
    tabHScrollLeft: 0,
    contentSpacerHeight: 0,
    detailMainMinHeight: 0,
    scrollToTopView: '',
    // 报名 TAB：吸顶后按「内容高度是否超出可视区」锁定，不按人数
    registrationContentLocked: false,
    registrationStickySpacerHeight: 0,
    registerContentHeight: 0,
    availableRegisterViewportHeight: 0,
    detailScrollTop: 0,

    activeTab: 'details',
    // TAB 列表（流内 + 吸顶共用；默认进行中集合，loadMatch 后按状态重建）
    tabs: TOURNAMENT_TABS.ongoing,

    // 顶部赛事信息（来自 teamMatchStore，非硬编码）
    matchId: '',
    match: EMPTY_MATCH_VIEW,
    matchStatus: EMPTY_MATCH_LIFECYCLE,
    eventInfoList: [],

    // 报名 TAB（结构占位，暂无报名业务）
    registerInfo: EMPTY_REGISTER_INFO,
    registerTotalCount: 0,
    registerSubTabs: [],
    activeRegisterSubTab: '',
    registerDisplayUsers: [],
    currentUserRegisterStatus: EMPTY_CURRENT_USER_REGISTER_STATUS,
    registerPermission: Object.assign({}, EMPTY_REGISTER_PERMISSION),
    // 底部 CTA 显隐（报名「立即报名」与分组「开始/修改分组」共用）：
    // 主 TAB 距屏幕底部 <=100px 时隐藏
    hideRegisterCTA: false,
    // 报名名单卡片动态高度（px，随设备/尺寸计算；0 表示尚未计算，样式回退）
    rosterMinHeight: 0,
    // 分组 TAB 内容区动态高度（px，随设备/尺寸计算）
    groupsPanelMinHeight: 0,
    // 分组 TAB：仅展示正式 groups（编辑在 group-editor 独立页完成）
    groups: [],
    groupsTabCards: [],
    hasFormalGroups: false,
    canManageGroups: false,
    // 报名但未进入正式分组：未安排出场（展示用，不阻止操作）
    unscheduledPlayerCount: 0,
    showGroupPairings: false,
    // 报名弹窗（立即报名流程：分组选择 + 比赛名 + 手机号）
    registerSheetVisible: false,
    registerCompetitionNameDraft: '',
    registerGenderDraft: '',
    registerSheetGroupId: '',
    registerPhone: '',
    registerSubmitting: false,
    registerCancelModalVisible: false,
    registerCancelSubmitting: false,
    registerCancelModalTitle: '确认取消报名？',
    registerCancelModalDesc: '取消后，你将从本场赛事报名名单中移除。',
    // 权限管理（临时管理员申请制 + 球童记分员二维码）
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
    // 二维码入口：手机号绑定闸门
    phoneBindSheetVisible: false,
    phoneBindEntryType: 'admin_qr',
    phoneBindHint: '',
    // 选手管理
    playerManageSheetVisible: false,
    playerManageDisplayUsers: [],
    playerManageTeamOptions: [],
    playerManageSearchKeyword: '',
    playerManageTeamFilter: playerManage.TEAM_FILTER_ALL,
    playerManageTeamFilterLabel: '全部分队',
    playerManageCountTip: '',
    playerManageEmptyText: '暂无报名选手',
    expandedPlayerManageUserId: '',
    playerTeamPickVisible: false,
    playerTeamPickUserId: '',
    playerTeamPickOptions: [],
    playerManageFilterPickVisible: false,
    playerManageFilterPickOptions: [],
    // 收费管理（极简实收登记）
    showPaymentSheet: false,
    paymentUsers: [],
    paymentFilteredUsers: [],
    paymentFilter: paymentManage.FILTER_ALL,
    expandedPaymentUserId: '',
    paymentSummary: paymentManage.calculatePaymentSummary([]),
    // 出发管理
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

    // 领先榜
    scoringDisplay: 'strokeDiff', // gross | strokeDiff
    scorePanel: 'technical', // technical | quick
    leaderboard: [],
    leaderboardDefaultMode: 'player', // player | team，仅表示默认展示倾向
    leaderboardMode: 'player', // player | team，当前页面展示模式
    leaderboardDefaultView: 'all', // all | team，可扩展查看方式的默认值
    leaderboardView: 'all', // all | team，当前查看方式
    leaderboardViewOptions: ['all'],
    leaderboardTeamViewAvailable: false,
    leaderboardTeamCompetitionEnabled: false,
    leaderboardScoreType: 'gross', // gross | net（净杆读 peoriaResult）
    leaderboardViewLabel: '总杆 · 全部',
    leaderboardNetScoreAvailable: false,
    showLeaderboardSettingSheet: false,
    draftLeaderboardView: 'all',
    draftLeaderboardScoreType: 'gross',
    teamLeaderboard: [],
    expandedTeamId: '',
    openIndex: -1,
    // 逐洞详情：跟随记分页记忆的显示偏好（gross | diff），不自维护模式
    scoreDisplayMode: 'gross',
    openScorecard: null,
    courseName: 'COURSE', // 逐洞详情标题：当前球场名称（来自 groupsStore，单一数据源）
    scorecardCourseTitle: '',
    // 领先榜逐洞面板下方广告（交杯鲜啤演示按主题切广告图片1）
    scorecardAdImage: DEFAULT_SCORECARD_AD_IMAGE,

    teeGroups: [],
    // 快捷入口按钮显隐：仅当"第一组卡片完全进入视口"时为 true（基于 IntersectionObserver，非 TAB 状态/非固定常驻）
    quickEntryVisible: false,
    watchers: WATCHERS.slice(0, 5),
    allWatchers: WATCHERS,
    // 讨论区聊天数据：传入统一 discussion 组件（聊天/输入/表情逻辑全部由组件承载）
    chat: CHAT,

    partnerConfig: partnerConfigUtil.createDefaultPartnerConfig('GOLF BROTHERS'),
    partnerLogoRows: [],

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
    featuresPermission: [],
    featuresPermissionFooterPad: [],
    featuresPermissionFooter: [],
    lifecycleActions: [],
    featuresSectionCommonMain: FEATURE_SECTION_DEFAULT.commonMain,
    featuresSectionCommonSub: FEATURE_SECTION_DEFAULT.commonSub,
    featuresSectionPermissionMain: FEATURE_SECTION_DEFAULT.permissionMain,
    featuresSectionPermissionSub: FEATURE_SECTION_DEFAULT.permissionSub,
    registerForOtherSheetVisible: false,
    registerForOtherSourceOptions: REGISTER_FOR_OTHER_SOURCE_OPTIONS.slice(),
    // 替他人报名 · 手工添加弹窗（仅 UI / console，不写 registerInfo）
    registerForOtherManualVisible: false,
    registerForOtherManualName: '',
    registerForOtherManualPhone: '',
    registerForOtherManualGender: 'male',
    // Patch 3：代报名待确认人员 + 分队选择弹窗（不写盘）
    pendingProxyPlayers: [],
    proxyGroupSheetVisible: false,
    proxyGroupOptions: [],
    proxyGroupId: ''
  },

  onLoad(options) {
    const matchId = options && options.matchId ? decodeURIComponent(options.matchId) : '';
    const caddieToken =
      options && options.caddieToken ? decodeURIComponent(String(options.caddieToken)) : '';
    const adminToken =
      options && options.adminToken ? decodeURIComponent(String(options.adminToken)) : '';
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    groupsStore.ensureInitialized();
    this._syncTournamentHoleLayout();
    this.setData({ courseName: groupsStore.getCourseName() });
    this.loadScoreDisplayMode();
    this.refreshGroupsDerived();
    this.applyMoreAccess();
    this.refreshPartnerSection();
    this.loadMatch(matchId);
    if (caddieToken && matchId) {
      wx.nextTick(() => this._tryClaimCaddieScoringAccess(caddieToken));
    }
    if (adminToken && matchId) {
      wx.nextTick(() => this._tryClaimTempAdminAccess(adminToken));
    }
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
    const matchId = this.data.matchId || '';
    if (!matchId || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) return;
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) return;
    const grantable = this._resolveTempAdminGrantableFeatures();
    const user = profile || qrAccessAuth.buildClaimProfile('admin_qr');
    if (!user.userId || !user.phone) return;
    const result = tempAdminAccess.claimTempAdminAccess(match, token, user.userId, user);
    if (!result || !result.ok) {
      if (result && result.reason === 'invalid_token') {
        wx.showToast({ title: '二维码无效或已失效', icon: 'none' });
      } else if (result && result.reason === 'no_phone') {
        wx.showToast({ title: '未绑定手机号，无法申请临时管理员权限', icon: 'none' });
      }
      return;
    }
    teamMatchStore.saveMatch(match);
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
    const matchId = this.data.matchId || '';
    if (!matchId || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) return;
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) return;
    const user = profile || qrAccessAuth.buildClaimProfile('caddie_qr');
    if (!user.userId || !user.phone) return;
    const result = caddieScoringAccess.claimCaddieScoringAccess(
      match,
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
    teamMatchStore.saveMatch(match);
    if (this.data.tempAdminSheetVisible) {
      this._syncCaddieScorerList(match);
    }
    wx.showToast({
      title: result.already ? '已拥有本场记分权限' : '已获得本场记分权限',
      icon: 'success'
    });
  },

  /** 开发态：模拟扫码申请（同样走手机号闸门） */
  mockScanAdminQr() {
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const access = tempAdminAccess.normalizeTempAdminAccess(
      match && match.tempAdminAccess
    );
    if (!access || !access.token) {
      wx.showToast({ title: '请先生成临时管理员二维码', icon: 'none' });
      return;
    }
    this._tryClaimTempAdminAccess(access.token);
  },

  mockScanCaddieQr() {
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const access = caddieScoringAccess.normalizeCaddieScoringAccess(
      match && match.caddieScoringAccess
    );
    if (!access || !access.token) {
      wx.showToast({ title: '请先生成球童记分二维码', icon: 'none' });
      return;
    }
    this._tryClaimCaddieScoringAccess(access.token);
  },

  /** 开发态：切换当前用户是否视为已绑手机号 */
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

  _syncCaddieScorerList(matchOrNull) {
    const matchId = this.data.matchId || '';
    const match =
      matchOrNull ||
      (matchId && !demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)
        ? teamMatchStore.getMatchById(matchId)
        : null);
    this.setData({
      caddieScorerList: caddieScoringAccess.listCaddieScorers(
        match && match.tempAdmins ? match.tempAdmins : []
      )
    });
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
    if (draft.some((a) => a && String(a.userId) === uid)) {
      this.setData({
        caddieScorerList: caddieScoringAccess.listCaddieScorers(
          (teamMatchStore.getMatchById(this.data.matchId) || {}).tempAdmins || []
        )
      });
      return;
    }
    const rows = tempAdminAccess.listAdminQrAdmins([admin], features);
    if (rows[0]) draft.push(rows[0]);
    this.setData({
      adminQrAdminList: this._withAdminExpandState(draft),
      caddieScorerList: caddieScoringAccess.listCaddieScorers(
        (teamMatchStore.getMatchById(this.data.matchId) || {}).tempAdmins || []
      )
    });
  },

  /* ===== 顶部赛事信息数据接入（teamMatchStore） ===== */
  _resolveMatchData(matchId) {
    if (!matchId) return null;
    const realMatch = teamMatchStore.getMatchById(matchId);
    if (realMatch) return realMatch;
    if (demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
      return demoJiaobeiMatch.getJiaobeiDemoMatch();
    }
    return null;
  },

  loadMatch(matchId) {
    const match = this._resolveMatchData(matchId);
    this._syncTournamentHoleLayout(match);
    const lifecycle = this._getMatchLifecycle(match);
    const tabs = resolveTournamentTabs(lifecycle.status);
    const leaderboardViewOptions = this._resolveLeaderboardViewOptions(match);
    const leaderboardDefaultView = this._resolveLeaderboardDefaultView(match);
    const leaderboardMode = this._leaderboardViewToMode(leaderboardDefaultView);
    const leaderboardTeamCompetitionEnabled = this._isTeamCompetitionEnabled(match);
    const scorecardCourseTitle = this._buildScorecardCourseTitle(match);
    this.setData(Object.assign({
      matchId: matchId,
      match: this._mapMatchToView(match),
      courseName: (match && match.courseName) || '',
      scorecardCourseTitle: scorecardCourseTitle,
      matchStatus: lifecycle,
      tabs: tabs,
      // 首次进入统一落到 tabs[0]（各状态首项均为 details）
      activeTab: tabs[0].id,
      leaderboardDefaultMode: leaderboardMode,
      leaderboardMode: leaderboardMode,
      leaderboardDefaultView: leaderboardDefaultView,
      leaderboardView: leaderboardDefaultView,
      leaderboardViewOptions: leaderboardViewOptions,
      leaderboardTeamViewAvailable: leaderboardViewOptions.indexOf('team') >= 0,
      leaderboardTeamCompetitionEnabled: leaderboardTeamCompetitionEnabled,
      leaderboardScoreType: 'gross',
      leaderboardViewLabel: this._buildLeaderboardViewLabel('gross', leaderboardDefaultView),
      leaderboardNetScoreAvailable: this._hasLeaderboardNetScore(match),
      leaderboard: this._buildLeaderboardViewForView(match, leaderboardDefaultView),
      teamLeaderboard: this._buildTeamLeaderboardView(match),
      eventInfoList: this._resolveEventInfoList(match),
      scorecardAdImage: this._resolveScorecardAdImage(getApp().getTheme(), matchId)
    }, this._buildRegisterStatePatch(match), this._buildGroupsTabStatePatch(match)), () => {
      this.applyMoreAccess();
    });
  },

  refreshMatchData(matchId) {
    const match = this._resolveMatchData(matchId);
    if (!match) return;
    this._syncTournamentHoleLayout(match);
    const lifecycle = this._getMatchLifecycle(match);
    const tabs = resolveTournamentTabs(lifecycle.status);
    let activeTab = this.data.activeTab;
    if (!tabs.some((t) => t.id === activeTab)) {
      activeTab = tabs[0].id;
    }
    const leaderboardViewOptions = this._resolveLeaderboardViewOptions(match);
    const leaderboardDefaultView = this._resolveLeaderboardDefaultView(match);
    const currentView = this.data.leaderboardView || this._leaderboardModeToView(this.data.leaderboardMode);
    const leaderboardView = leaderboardViewOptions.indexOf(currentView) >= 0
      ? currentView
      : leaderboardDefaultView;
    const leaderboardMode = this._leaderboardViewToMode(leaderboardView);
    const leaderboardTeamCompetitionEnabled = this._isTeamCompetitionEnabled(match);
    const scorecardCourseTitle = this._buildScorecardCourseTitle(match);
    const netAvailable = this._hasLeaderboardNetScore(match);
    const leaderboardScoreType =
      this.data.leaderboardScoreType === 'net' && netAvailable ? 'net' : 'gross';
    this.setData(Object.assign({
      match: this._mapMatchToView(match),
      courseName: match.courseName || '',
      scorecardCourseTitle: scorecardCourseTitle,
      matchStatus: lifecycle,
      tabs: tabs,
      activeTab: activeTab,
      leaderboardDefaultMode: this._leaderboardViewToMode(leaderboardDefaultView),
      leaderboardMode: leaderboardMode,
      leaderboardDefaultView: leaderboardDefaultView,
      leaderboardView: leaderboardView,
      leaderboardViewOptions: leaderboardViewOptions,
      leaderboardTeamViewAvailable: leaderboardViewOptions.indexOf('team') >= 0,
      leaderboardTeamCompetitionEnabled: leaderboardTeamCompetitionEnabled,
      leaderboardScoreType: leaderboardScoreType,
      leaderboardViewLabel: this._buildLeaderboardViewLabel(leaderboardScoreType, leaderboardView),
      leaderboardNetScoreAvailable: netAvailable,
      leaderboard: this._buildLeaderboardViewForView(match, leaderboardView),
      teamLeaderboard: this._buildTeamLeaderboardView(match),
      eventInfoList: this._resolveEventInfoList(match),
      scorecardAdImage: this._resolveScorecardAdImage(getApp().getTheme(), matchId)
    }, this._buildRegisterStatePatch(match), this._buildGroupsTabStatePatch(match)), () => {
      this.applyMoreAccess();
      this.refreshPartnerSection();
    });
  },

  _buildGroupsTabStatePatch(match) {
    const formal = cloneTournamentGroups(match && Array.isArray(match.groups) ? match.groups : []);
    const unscheduled = this._resolveUnscheduledPlayers(match, formal);
    const gameMode = match && match.gameMode ? String(match.gameMode) : '';
    const showPairings = teamMatchStore.isPairingStrokeFormat(gameMode);
    const pairings = showPairings ? teamMatchStore.clonePairings(match && match.pairings) : {};
    const playerLookup = this._buildGroupPlayerLookup(match);
    const groupsTabCards = this._mapGroupsToTabCards(formal, {
      showPairings: showPairings,
      pairings: pairings,
      pairingTitle: teamMatchStore.getPairingStrokeLabel(gameMode),
      playerLookup: playerLookup,
      matchTeeTime: teeSheetManage.resolveMatchTeeTime(match)
    });
    return {
      groups: formal,
      groupsTabCards: groupsTabCards,
      hasFormalGroups: formal.length > 0,
      canManageGroups: this._resolveCanManageGroups(match),
      unscheduledPlayerCount: unscheduled.length,
      showGroupPairings: showPairings
    };
  },

  /** 报名/参赛记录上的球员 id（多字段兼容） */
  _resolveAnyPlayerId(raw) {
    if (!raw || typeof raw !== 'object') return '';
    const id = raw.userId || raw.playerId || raw.id || raw.uid || raw.openid;
    return id != null ? String(id).trim() : '';
  },

  /** 报名记录展示名（本场快照优先） */
  _resolveAnyPlayerNickname(raw) {
    if (!raw || typeof raw !== 'object') return '';
    return playerManage.resolveMatchNickname(raw);
  },

  /**
   * 收集报名/参赛名单原始列表（兼容 users / players / participants）
   */
  _collectRegisterPlayerSources(match) {
    const lists = [];
    const pushList = (arr) => {
      if (Array.isArray(arr) && arr.length) lists.push(arr);
    };
    const registerInfo = this._resolveRegisterInfo(match);
    pushList(registerInfo && registerInfo.users);
    const rawInfo = match && match.registerInfo;
    if (rawInfo && typeof rawInfo === 'object') {
      pushList(rawInfo.users);
      pushList(rawInfo.players);
    }
    pushList(match && match.participants);
    pushList(match && match.players);
    return lists;
  },

  /**
   * 分组展示用球员字典：正式 groups 只存 userId/position，昵称/头像/T台从报名名单解析
   */
  _buildGroupPlayerLookup(match) {
    const map = {};
    const lists = this._collectRegisterPlayerSources(match);
    lists.forEach((users) => {
      users.forEach((u) => {
        if (!u || typeof u !== 'object') return;
        const primaryId = this._resolveAnyPlayerId(u);
        if (!primaryId) return;
        const gender = playerManage.resolveMatchGender(u);
        const teeCode = tPosition.defaultFromGender(gender);
        const teeText = teeCode === tPosition.RED_T ? '红T' : '蓝T';
        const entry = {
          userId: primaryId,
          nickname: this._resolveAnyPlayerNickname(u) || '未知球员',
          avatar: u.avatar || u.avatarUrl || '',
          gender: gender,
          handicap: u.handicap != null ? u.handicap : '',
          tee: teeCode,
          teeText: teeText
        };
        // 同一人多 id 字段都挂到 lookup，避免 groups.userId 与报名 id 字段不一致
        const aliasIds = [u.userId, u.playerId, u.id, u.uid, u.openid]
          .map((v) => (v != null ? String(v).trim() : ''))
          .filter(Boolean);
        if (aliasIds.indexOf(primaryId) < 0) aliasIds.push(primaryId);
        aliasIds.forEach((id) => {
          if (!map[id]) map[id] = entry;
        });
      });
    });
    return map;
  },

  /**
   * 展示层 hydrate：不改写正式 groups，仅生成 displayPlayers
   */
  hydrateGroupDisplayPlayers(group, playerLookup) {
    const lookup = playerLookup || {};
    const list = (group && Array.isArray(group.players) ? group.players : [])
      .map((p) => {
        const userId = this._resolveAnyPlayerId(p);
        if (!userId) return null;
        const src = lookup[userId] || {};
        const gender = src.gender || p.gender || playerDirectory.getGenderById(userId, '');
        const teeRaw = src.tee || p.tee || p.tPosition || tPosition.defaultFromGender(gender);
        const teeCode = teeRaw === tPosition.RED_T ? tPosition.RED_T : tPosition.BLUE_T;
        const teeText = teeCode === tPosition.RED_T ? '红T' : '蓝T';
        const nickname = src.nickname
          || this._resolveAnyPlayerNickname(p)
          || '未知球员';
        const avatarSrc = src.avatar
          || (p.avatar ? String(p.avatar) : '')
          || (p.avatarUrl ? String(p.avatarUrl) : '')
          || '';
        const slotIndex = Number(p.position != null ? p.position : p.slotIndex) || 0;
        return {
          playerId: userId,
          userId: userId,
          slotIndex: slotIndex,
          position: slotIndex,
          nickname: nickname,
          name: nickname,
          displayName: nickname,
          avatar: mockAvatars.resolveAvatar(avatarSrc, userId),
          tee: teeText,
          teeText: teeText,
          teeLabel: teeText,
          teeCode: teeCode,
          teeMarkerClass: teeCode === tPosition.RED_T
            ? 'tee-marker-dot--female'
            : 'tee-marker-dot--male',
          handicap: src.handicap != null && src.handicap !== '' ? src.handicap : (p.handicap != null ? p.handicap : '')
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.slotIndex || 0) - (b.slotIndex || 0));
    return list;
  },

  /**
   * 未安排出场 = 报名名单 − 已进入正式 groups 的球员（仅展示，不视为错误）
   */
  _resolveUnscheduledPlayers(match, groups) {
    const registerInfo = this._resolveRegisterInfo(match);
    const users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
    const assigned = {};
    (groups || []).forEach((g) => {
      (g.players || []).forEach((p) => {
        const id = this._resolveAnyPlayerId(p);
        if (id) assigned[id] = true;
      });
    });
    return users.filter((u) => {
      const id = this._resolveAnyPlayerId(u);
      return id && !assigned[id];
    });
  },

  /** 进入分组 TAB / 从编辑页返回：刷新正式分组展示 */
  _refreshFormalGroupsDisplay() {
    const match = this.data.matchId ? teamMatchStore.getMatchById(this.data.matchId) : null;
    this.setData(this._buildGroupsTabStatePatch(match));
  },

  _resolveCanManageGroups(match) {
    const user = gameStore.getCurrentUser();
    const userId = user && user.userId;
    const access = MORE_ACCESS;
    const permSet = access.permissions || [];
    const creatorId = match && (match.createdBy || match.creatorId);
    const isCreator = !!(userId && creatorId && creatorId === userId);
    const hasManagePermission = access.isPrivilegedUser ||
      TOURNAMENT_MANAGE_PERMISSIONS.some((p) => permSet.indexOf(p) >= 0);
    return isCreator || hasManagePermission;
  },

  _mapGroupsToTabCards(groups, options) {
    const opts = options || {};
    const showPairings = !!opts.showPairings;
    const pairings = opts.pairings || {};
    const pairingTitle = opts.pairingTitle || '组合';
    const playerLookup = opts.playerLookup || {};
    const matchTeeTime = opts.matchTeeTime || '';
    return (groups || []).map((g) => {
      // 正式位号保留在 g.players；展示层 hydrate 生成 displayPlayers（过滤空位，按 slotIndex 升序）
      const displayPlayers = this.hydrateGroupDisplayPlayers(g, playerLookup);
      const teeTime = teeSheetManage.resolveGroupTeeTime(g) || matchTeeTime;
      const startHole = teeSheetManage.resolveGroupStartHole(g);
      const card = {
        groupId: g.groupId,
        badge: g.groupName,
        displayPlayers: displayPlayers,
        hasDisplayPlayers: displayPlayers.length > 0,
        teeTime: teeTime,
        startHole: startHole,
        teeMetaLine: teeSheetManage.formatTeeMetaLine(teeTime, startHole),
        hasTeeInfo: !!(teeTime || startHole != null)
      };
      if (showPairings) {
        card.pairingBlock = this._mapGroupPairingBlock(g, pairings, pairingTitle, playerLookup);
      }
      return card;
    });
  },

  _resolveGroupedPlayerName(userId, slotPlayer, playerLookup) {
    const id = userId != null ? String(userId).trim() : '';
    const src = (playerLookup && id && playerLookup[id]) || null;
    if (src && src.nickname) return src.nickname;
    const fromSlot = this._resolveAnyPlayerNickname(slotPlayer);
    if (fromSlot) return fromSlot;
    return '未知球员';
  },

  _resolveGroupedPlayerAvatar(userId, slotPlayer, playerLookup) {
    const id = userId != null ? String(userId).trim() : '';
    const src = (playerLookup && id && playerLookup[id]) || null;
    const avatarSrc = (src && src.avatar)
      || (slotPlayer && slotPlayer.avatar ? String(slotPlayer.avatar) : '')
      || (slotPlayer && slotPlayer.avatarUrl ? String(slotPlayer.avatarUrl) : '')
      || '';
    return mockAvatars.resolveAvatar(avatarSrc, id);
  },

  _mapGroupPairingBlock(group, pairings, pairingTitle, playerLookup) {
    const groupId = String(group.groupId || '');
    const lookup = playerLookup || {};
    const playerMap = {};
    ((group.players || [])).forEach((p) => {
      const id = this._resolveAnyPlayerId(p);
      if (!id) return;
      playerMap[id] = p;
    });
    const list = Array.isArray(pairings[groupId]) ? pairings[groupId] : [];
    const pairingViews = list.map((pr, idx) => {
      const ids = Array.isArray(pr.playerIds) ? pr.playerIds.map(String) : [];
      const members = ids.map((id) => {
        const p = playerMap[id];
        return {
          userId: id,
          name: this._resolveGroupedPlayerName(id, p, lookup),
          displayName: this._resolveGroupedPlayerName(id, p, lookup),
          avatar: this._resolveGroupedPlayerAvatar(id, p, lookup)
        };
      }).filter((m) => m.userId);
      return {
        id: pr.id || ('pairing_' + (idx + 1)),
        label: '组合' + (idx + 1),
        members: members,
        namesText: members.map((m) => m.name).join(' / ')
      };
    }).filter((pr) => pr.members && pr.members.length);

    const paired = {};
    pairingViews.forEach((pr) => {
      (pr.members || []).forEach((m) => { paired[m.userId] = true; });
    });
    const incomplete = ((group.players || [])
      .filter((p) => p && this._resolveAnyPlayerId(p) && !paired[this._resolveAnyPlayerId(p)])
      .map((p) => {
        const id = this._resolveAnyPlayerId(p);
        const name = this._resolveGroupedPlayerName(id, p, lookup);
        return {
          userId: id,
          name: name,
          displayName: name,
          avatar: this._resolveGroupedPlayerAvatar(id, p, lookup)
        };
      }));

    return {
      title: pairingTitle,
      pairings: pairingViews,
      hasPairings: pairingViews.length > 0,
      incompletePlayers: incomplete,
      incompleteNamesText: incomplete.map((p) => p.name).filter(Boolean).join('、'),
      hasIncomplete: incomplete.length > 0
    };
  },

  /** 跳转独立分组编辑页（开始分组 / 修改分组） */
  onOpenGroupEditor() {
    if (!this.data.canManageGroups) return;
    const matchId = this.data.matchId || '';
    if (!matchId) {
      wx.showToast({ title: '未找到比赛信息', icon: 'none' });
      return;
    }
    const mode = this.data.matchStatus && this.data.matchStatus.isOngoing
      ? 'live'
      : (this.data.hasFormalGroups ? 'edit' : 'create');
    wx.navigateTo({
      url: '/pages/tournament/group-editor/index?matchId=' + encodeURIComponent(matchId) +
        '&mode=' + encodeURIComponent(mode)
    });
  },

  // 赛事生命周期：读取 teamMatchStore.match.status，归一化为 registering | ongoing | completed
  // 持久化 status="finished" 视为已结束（completed）
  _getMatchLifecycle(match) {
    if (!match) return Object.assign({}, EMPTY_MATCH_LIFECYCLE);
    const raw = String(match.status || '').trim().toLowerCase();
    let status = '';
    if (raw === 'finished' || raw === MATCH_LIFECYCLE.COMPLETED) {
      status = MATCH_LIFECYCLE.COMPLETED;
    } else if (raw === MATCH_LIFECYCLE.REGISTERING || raw === MATCH_LIFECYCLE.ONGOING) {
      status = raw;
    }
    return {
      status: status,
      isRegistering: status === MATCH_LIFECYCLE.REGISTERING,
      isOngoing: status === MATCH_LIFECYCLE.ONGOING,
      isCompleted: status === MATCH_LIFECYCLE.COMPLETED
    };
  },

  /** 英雄区状态芯片：finished → 已结束；其余未结束（进行中）→ LIVE */
  _resolveCardStatusDisplay(match) {
    const status = String((match && match.status) || '').trim().toLowerCase();
    if (status === 'finished') {
      return { cardStatusText: '已结束', cardStatusTone: 'finished' };
    }
    if (status === 'registering') {
      return {
        cardStatusText: (match && match.statusLabel) || '报名中',
        cardStatusTone: 'default'
      };
    }
    return { cardStatusText: 'LIVE', cardStatusTone: 'live' };
  },

  // 将 teamMatchStore 记录映射为顶部信息区视图字段
  _mapMatchToView(match) {
    if (!match) return Object.assign({}, EMPTY_MATCH_VIEW);
    const venue = [match.courseName, match.courseHalfText].filter(Boolean).join('');
    const priceTags = this._mapPriceTags(match);
    const cardStatus = this._resolveCardStatusDisplay(match);
    return {
      matchId: match.matchId || '',
      status: String(match.status || '').trim(),
      statusLabel: match.statusLabel || '',
      cardStatusText: cardStatus.cardStatusText,
      cardStatusTone: cardStatus.cardStatusTone,
      logo: this._resolveMatchLogo(match),
      bannerImage: bannerConfig.resolveMatchDetailBanner(match.bannerImage),
      dateText: teamMatchStore.formatClubDate(match.teeTime) || '',
      titleMain: match.roundName || match.teamName || '',
      titleSub: match.teamName || '',
      formatLabel: match.gameMode || '',
      typeLabel: this._resolveTypeLabel(match),
      organizer: this._resolveOrganizer(match),
      venue: venue,
      timeText: this._resolveTimeText(match),
      priceTags: priceTags,
      priceText: priceTags.join('  ')
    };
  },

  _resolveMatchLogo(match) {
    if (!match) return '';
    return match.matchLogo || match.teamLogo || '';
  },

  _resolveOrganizer(match) {
    if (!match) return '';
    const matchType = match.matchType || 'team-internal';
    if (matchType === 'team-internal') return match.teamName || '';
    return match.organizationName || match.teamName || '';
  },

  _resolveTimeText(match) {
    if (!match) return '';
    const text = String(match.teeTimeText || '').trim();
    if (text) return text;
    const m = String(match.teeTime || '').match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (!m) return '';
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    const weekday = WEEK_NAMES[new Date(year, month - 1, day).getDay()];
    return year + '/' + m[2] + '/' + m[3] + ' ' + weekday + ' ' + m[4] + ':' + m[5];
  },

  _resolveTypeLabel(match) {
    if (!match) return '';
    const matchType = match.matchType || 'team-internal';
    return MATCH_TYPE_LABELS[matchType] || '';
  },

  _mapPriceTags(match) {
    if (!match || !match.feeSet || !Array.isArray(match.feeList) || !match.feeList.length) {
      return ['暂无'];
    }
    const isDiamond = !!match.isDiamondMode;
    return match.feeList.map((fee) => {
      const name = String((fee && fee.name) || '').trim();
      const amount = fee && fee.amount != null ? String(fee.amount) : '0';
      const price = isDiamond ? amount + '💎' : '￥' + amount;
      return name ? name + ' ' + price : price;
    });
  },

  _resolveEventInfoImage(item, theme) {
    if (!item || String(item.type) !== 'image') return '';
    const bright = String(item.brightImage != null ? item.brightImage : (item.imageData || '')).trim();
    const dark = String(item.darkImage != null ? item.darkImage : (item.imageData || '')).trim();
    return theme === 'dark' ? (dark || bright) : (bright || dark);
  },

  _resolveEventInfoList(match, theme) {
    const resolvedTheme = theme || getApp().getTheme();
    if (!match || !Array.isArray(match.eventInfoList)) return [];
    return match.eventInfoList
      .map((item) => {
        const title = item && item.title ? String(item.title) : '';
        const content = item && item.content != null ? String(item.content) : '';
        const type = item && item.type ? String(item.type) : '';
        const isPhotoLive = title === '照片直播' || title === '交通说明';
        const photoLiveValid = isPhotoLive && /^https:\/\/.+/i.test(String(content || '').trim())
          && !/^http:\/\//i.test(String(content || '').trim());
        return {
          id: item && item.id != null ? item.id : '',
          title: isPhotoLive ? '照片直播' : title,
          type: type,
          content: content,
          imageData: this._resolveEventInfoImage(item, resolvedTheme),
          status: item && item.status ? String(item.status) : '',
          isPhotoLive: isPhotoLive,
          photoLiveValid: !!photoLiveValid
        };
      })
      .filter((item) => {
        if (item.isPhotoLive) return item.photoLiveValid;
        return true;
      });
  },

  onCopyPhotoLiveLink(e) {
    const url = String((e.currentTarget.dataset && e.currentTarget.dataset.url) || '').trim();
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({
          title: '照片直播链接已复制，请在微信中打开查看',
          icon: 'none',
          duration: 2500
        });
      }
    });
  },

  /** COS 默认广告图加载失败 → 回退本地 assets/partners */
  onEventSponsorImageError(e) {
    const id = e.currentTarget.dataset.id;
    const list = (this.data.eventInfoList || []).slice();
    const idx = list.findIndex((item) => item && String(item.id) === String(id));
    if (idx < 0) return;
    const current = String((list[idx] && list[idx].imageData) || '').trim();
    const fallback = eventSponsorConfig.getEventSponsorLocalFallback(current);
    if (!fallback || fallback === current) return;
    list[idx] = Object.assign({}, list[idx], { imageData: fallback });
    this.setData({ eventInfoList: list });
  },

  /** 默认赛事 BANNER 加载失败：无远程 fallback 时清空，避免反复 error */
  onMatchBannerError() {
    const match = this.data.match || {};
    const current = String(match.bannerImage || '').trim();
    const fallback = bannerConfig.getBannerLocalFallback(current, 'matchDetail');
    if (!fallback || fallback === current) {
      // 默认 COS 图失败且无 fallback：保持现状即可
      return;
    }
    this.setData({ 'match.bannerImage': fallback });
  },

  _resolveRegisterSubTabs(match, registerInfo) {
    const source = match && Array.isArray(match.teamGroups) && match.teamGroups.length
      ? match.teamGroups
      : DEFAULT_REGISTER_GROUPS;
    const users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
    return source.map((group, index) => {
      const name = String((group && group.name) || '').trim() || ('分组' + (index + 1));
      const id = group && group.id != null ? String(group.id) : ('register-group-' + (index + 1));
      const count = users.filter((user) => String(user.groupId) === id).length;
      return {
        id: id,
        name: name,
        count: count,
        label: name + '(' + count + ')'
      };
    });
  },

  _resolveRegisterInfo(match) {
    if (!match || !match.registerInfo) return Object.assign({}, EMPTY_REGISTER_INFO);
    // 旧报名记录缺省字段在 store.normalize 中按「本人报名」补齐
    const normalized = teamMatchStore.normalizeRegisterInfo(match.registerInfo);
    const users = (normalized.users || []).map((user) => {
      const genderDisplay = playerManage.getGenderDisplay(user);
      const userType = user.userType || '';
      const identitySource = user.identitySource || '';
      return {
        userId: user.userId || user.playerId || user.id || user.uid || user.openid || '',
        // 本场比赛名：matchNickname 优先
        competitionName: playerManage.resolveMatchNickname(user),
        matchNickname: user.matchNickname || '',
        nickname: user.nickname || '',
        gender: playerManage.resolveMatchGender(user),
        sex: user.sex || '',
        genderIcon: genderDisplay.icon,
        genderClass: genderDisplay.className,
        matchGender: user.matchGender || '',
        handicap: user.handicap != null ? user.handicap : '',
        paymentConfirmed: user.paymentConfirmed === true,
        avatar: user.avatar || user.avatarUrl || '',
        phone: user.phone || '',
        groupId: playerManage.resolveMatchTeamId(user),
        groupName: playerManage.resolveMatchTeamName(user),
        matchTeamId: user.matchTeamId || '',
        matchTeamName: user.matchTeamName || '',
        registeredAt: user.registeredAt != null ? user.registeredAt : '',
        source: user.source || 'self',
        registeredBy: user.registeredBy || '',
        registeredByName: user.registeredByName || '',
        subjectType: user.subjectType || 'self',
        pickChannel: user.pickChannel || '',
        canSelfCancel: user.canSelfCancel !== false,
        locked: !!user.locked,
        // Patch 8：手工代报名预留字段，与 store.normalize 对齐
        userType: userType,
        identitySource: identitySource,
        identityLabel: user.identityLabel || '',
        identitySourceLabel: user.identitySourceLabel || '',
        realName: user.realName || '',
        remarkName: user.remarkName || ''
      };
    });
    return {
      totalCount: normalized.totalCount,
      users: users
    };
  },

  _filterRegisterUsers(registerInfo, activeRegisterSubTab) {
    const users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
    const groupId = String(activeRegisterSubTab || '');
    if (!groupId) return [];
    const currentUserId = String((gameStore.getCurrentUser() || {}).userId || '').trim();
    return users
      .filter((user) => String(user.groupId) === groupId)
      .map((user, index) => {
        const genderDisplay = playerManage.getGenderDisplay(user);
        const userId = user.userId || '';
        let contactRemark = '';
        if (currentUserId && userId) {
          try {
            const contact = contactStore.findContact(currentUserId, userId);
            contactRemark = contact && contact.remarkName ? String(contact.remarkName) : '';
          } catch (e) {
            contactRemark = '';
          }
        }
        return {
          listKey: user.userId || ('register-user-' + groupId + '-' + index),
          userId: userId,
          competitionName: user.competitionName || '',
          gender: user.gender || '',
          sex: user.sex || '',
          genderIcon: user.genderIcon || genderDisplay.icon,
          genderClass: user.genderClass || genderDisplay.className,
          // 江湖差点空值统一显示 "-"（0 为有效差点，需保留）
          handicap: (user.handicap != null && user.handicap !== '') ? String(user.handicap) : '-',
          paymentConfirmed: user.paymentConfirmed === true,
          avatar: user.avatar || '',
          phone: user.phone || '',
          groupId: user.groupId || '',
          groupName: user.groupName || '',
          registeredAt: user.registeredAt != null ? user.registeredAt : '',
          source: user.source || 'self',
          registeredBy: user.registeredBy || '',
          registeredByName: user.registeredByName || '',
          subjectType: user.subjectType || 'self',
          pickChannel: user.pickChannel || '',
          canSelfCancel: user.canSelfCancel !== false,
          locked: !!user.locked,
          userType: user.userType || '',
          identitySource: user.identitySource || '',
          identityLabel: user.identityLabel || '',
          identitySourceLabel: user.identitySourceLabel || '',
          contactRemark: contactRemark,
          realName: user.realName || '',
          remarkName: user.remarkName || ''
        };
      });
  },

  _resolveCurrentUserRegisterStatus(registerInfo) {
    const currentUserId = String((gameStore.getCurrentUser() || {}).userId || '');
    if (!currentUserId) return Object.assign({}, EMPTY_CURRENT_USER_REGISTER_STATUS);
    const users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
    const matched = users.find((user) => String(user.userId) === currentUserId);
    if (!matched) return Object.assign({}, EMPTY_CURRENT_USER_REGISTER_STATUS);
    return {
      isRegistered: true,
      groupId: matched.groupId != null ? String(matched.groupId) : '',
      groupName: matched.groupName ? String(matched.groupName) : ''
    };
  },

  switchRegisterSubTab(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || id === this.data.activeRegisterSubTab) return;
    const registerDisplayUsers = this._filterRegisterUsers(this.data.registerInfo, id);
    this.setData({
      activeRegisterSubTab: id,
      registerDisplayUsers: registerDisplayUsers,
      // 列表变化后高度需重测；吸顶前保持未锁定
      registrationContentLocked: this._resolveRegistrationContentLocked({
        isStickyTab: this.data.isStickyTab,
        activeTab: 'register'
      })
    }, () => {
      this.updateRegisterStickySpacer();
      this.updateRegisterContentLockMetrics();
    });
  },

  /**
   * 依据 match 重建报名相关的页面数据（loadMatch 与报名成功后共用）
   * @param {object} match teamMatchStore 中的赛事对象
   * @param {string} preferredSubTab 期望保持选中的分组 id（可选）
   */
  _buildRegisterStatePatch(match, preferredSubTab) {
    const registerInfo = this._resolveRegisterInfo(match);
    const registerSubTabs = this._resolveRegisterSubTabs(match, registerInfo);
    let activeRegisterSubTab = '';
    if (preferredSubTab && registerSubTabs.some((tab) => tab.id === preferredSubTab)) {
      activeRegisterSubTab = preferredSubTab;
    } else if (registerSubTabs.length) {
      activeRegisterSubTab = registerSubTabs[0].id;
    }
    const registerDisplayUsers = this._filterRegisterUsers(registerInfo, activeRegisterSubTab);
    return {
      registerInfo: registerInfo,
      registerTotalCount: registerInfo.totalCount,
      registerSubTabs: registerSubTabs,
      activeRegisterSubTab: activeRegisterSubTab,
      registerDisplayUsers: registerDisplayUsers,
      registrationContentLocked: this._resolveRegistrationContentLocked({
        isStickyTab: this.data.isStickyTab,
        activeTab: this.data.activeTab
      }),
      currentUserRegisterStatus: this._resolveCurrentUserRegisterStatus(registerInfo),
      registerPermission: this._resolveRegisterPermission(match)
    };
  },

  /**
   * 报名内容锁定：activeTab===register && isStickyTab && 内容高度未超出吸顶后可视区。
   * 吸顶前恒为 false；高度未测出前不锁，避免提前禁滚。
   */
  _resolveRegistrationContentLocked(opts) {
    const o = opts || {};
    const activeTab = o.activeTab != null ? o.activeTab : this.data.activeTab;
    if (activeTab !== 'register') return false;
    const isStickyTab = o.isStickyTab != null ? !!o.isStickyTab : !!this.data.isStickyTab;
    if (!isStickyTab) return false;
    const contentH = o.contentH != null
      ? Number(o.contentH)
      : Number(this._registerContentHeight != null
        ? this._registerContentHeight
        : this.data.registerContentHeight);
    const availableH = o.availableH != null
      ? Number(o.availableH)
      : Number(this._availableRegisterViewportHeight != null
        ? this._availableRegisterViewportHeight
        : this.data.availableRegisterViewportHeight);
    if (!(availableH > 0) || !(contentH > 0)) return false;
    return contentH <= availableH + REGISTER_CONTENT_LOCK_EPS;
  },

  /**
   * 吸顶后允许的最大 scrollTop（主 TAB 吸顶阈值）。
   * 仅用于「已吸顶且内容未溢出」时阻止继续上推，绝不把 scrollTop 拉回阈值以下。
   */
  _getRegisterScrollLockMax() {
    const tabThreshold = this.data.tabOffsetTop || 0;
    const extThreshold = this.data.registerExtOffsetTop || 0;
    const stickyTop = this.data.stickyRegisterExtTop || 0;
    const forTab = tabThreshold > 0 ? tabThreshold : 0;
    const forExt = extThreshold > 0 ? Math.max(0, extThreshold - stickyTop) : forTab;
    return Math.max(forTab, forExt);
  },

  /**
   * 吸顶后内容未溢出：仅当 scrollTop 越过锁点时回写到锁点（不低于吸顶阈值）。
   * 不改内容高度，避免「吸顶又弹回」。
   */
  _clampRegisterScrollAfterSticky(scrollTop, forcedLocked) {
    const locked = forcedLocked != null ? !!forcedLocked : !!this.data.registrationContentLocked;
    if (!locked) return scrollTop;
    const max = this._getRegisterScrollLockMax();
    if (!(max > 0) || scrollTop <= max + 2) return scrollTop;
    if (this._registerScrollClamping) return max;
    this._registerScrollClamping = true;
    // scroll-top 需值变化才生效
    const tick = (this._detailScrollTick = (this._detailScrollTick || 0) + 1);
    const next = max + (tick % 2) * 0.01;
    this.setData({ detailScrollTop: next }, () => {
      this._registerScrollClamping = false;
    });
    return max;
  },

  /**
   * 测量报名内容高度与吸顶后可用可视高度，并据此更新 registrationContentLocked。
   * registerContentHeight：.register-roster-card 实际渲染高度（含空态/min-height 撑高后的视觉高度）。
   * availableRegisterViewportHeight：窗口 - HEADER - 主TAB - 报名扩展区 - CTA/安全区 - 间距。
   * @param {{ forceSticky?: boolean }} [opts] forceSticky：刚吸顶时 setData 尚未落地，显式按已吸顶计算
   */
  updateRegisterContentLockMetrics(opts) {
    if (this.data.activeTab !== 'register') return;
    const forceSticky = !!(opts && opts.forceSticky);
    let sys = { windowWidth: 375, windowHeight: 667 };
    try { sys = wx.getSystemInfoSync() || sys; } catch (e) {}
    const winH = sys.windowHeight || 667;
    const rpx2px = (sys.windowWidth || 375) / 750;
    let safeBottom = 0;
    if (sys.safeArea && typeof sys.screenHeight === 'number') {
      safeBottom = Math.max(0, sys.screenHeight - sys.safeArea.bottom);
    }
    this.createSelectorQuery()
      .in(this)
      .select('.gb-header').boundingClientRect()
      .select('.tab-scroll-wrap--inflow').boundingClientRect()
      .select('.register-ext-wrap--inflow').boundingClientRect()
      .select('.register-cta-bar').boundingClientRect()
      .select('.register-roster-card').boundingClientRect()
      .exec((res) => {
        res = res || [];
        const headerH = res[0] && res[0].height ? res[0].height : (this.data.headerTotalHeight || 92);
        const mainTabH = res[1] && res[1].height ? res[1].height : (this.data.tabBarHeight || 50);
        const extH = res[2] && res[2].height ? res[2].height : 116 * rpx2px;
        const ctaH = res[3] && res[3].height ? res[3].height : 0;
        const cardRect = res[4];
        const bottomReserve = ctaH > 0 ? ctaH : safeBottom;
        const gap = 40 * rpx2px;
        let availableH = winH - headerH - mainTabH - extH - bottomReserve - gap;
        if (!(availableH > 0)) availableH = 0;
        availableH = Math.round(availableH);
        const contentH = cardRect && cardRect.height ? Math.round(cardRect.height) : 0;
        this._availableRegisterViewportHeight = availableH;
        this._registerContentHeight = contentH;
        const stickyNow = forceSticky || !!this.data.isStickyTab;
        const locked = this._resolveRegistrationContentLocked({
          activeTab: 'register',
          isStickyTab: stickyNow,
          contentH: contentH,
          availableH: availableH
        });
        const patch = {};
        if (availableH !== this.data.availableRegisterViewportHeight) {
          patch.availableRegisterViewportHeight = availableH;
        }
        if (contentH !== this.data.registerContentHeight) {
          patch.registerContentHeight = contentH;
        }
        if (locked !== this.data.registrationContentLocked) {
          patch.registrationContentLocked = locked;
        }
        const applyClamp = () => {
          if (locked) {
            this._clampRegisterScrollAfterSticky(this.data.scrollYState || 0, true);
          }
        };
        if (Object.keys(patch).length) {
          this.setData(patch, applyClamp);
        } else {
          applyClamp();
        }
      });
  },

  /**
   * 内容不足以滚到 TAB 吸顶时补齐 spacer（与人数无关）。
   * 只服务吸顶可达；吸顶后短内容由 scrollTop 钳制，不靠 spacer 制造空滑。
   */
  updateRegisterStickySpacer() {
    if (this.data.activeTab !== 'register') {
      if (this.data.registrationStickySpacerHeight) {
        this.setData({ registrationStickySpacerHeight: 0 });
      }
      return;
    }
    const tabOffsetTop = this.data.tabOffsetTop || 0;
    if (!(tabOffsetTop > 0)) return;
    wx.createSelectorQuery()
      .in(this)
      .select('.detail-scroll')
      .boundingClientRect()
      .select('.detail-scroll')
      .scrollOffset()
      .exec((res) => {
        const view = res && res[0];
        const off = res && res[1];
        if (!view || !off) return;
        const viewportH = view.height || 0;
        const scrollH = off.scrollHeight || 0;
        const spacerNow = this.data.registrationStickySpacerHeight || 0;
        const contentWithoutSpacer = Math.max(0, scrollH - spacerNow);
        // 需要能滚到 TAB 吸顶阈值，再留一点 buffer
        const needMaxScroll = tabOffsetTop + 16;
        const needContentH = viewportH + needMaxScroll;
        const spacer = Math.max(0, Math.ceil(needContentH - contentWithoutSpacer));
        if (spacer !== spacerNow) {
          this.setData({ registrationStickySpacerHeight: spacer });
        }
      });
  },

  /**
   * 报名开关判断（registrationStatus 优先于用户报名状态；deadlineTime 不参与权限）
   */
  _normalizeRegistrationStatus(match) {
    const raw = String(
      (match && (match.registrationStatus || match.registerStatus)) || 'open'
    ).trim().toLowerCase();
    return raw === 'closed' ? 'closed' : 'open';
  },

  _resolveRegisterPermission(match) {
    if (!match) {
      return { registrationStatus: 'closed', isOpen: false, reason: '报名通道已关闭' };
    }
    const registrationStatus = this._normalizeRegistrationStatus(match);
    if (registrationStatus === 'closed') {
      return { registrationStatus: 'closed', isOpen: false, reason: '报名通道已关闭' };
    }
    return { registrationStatus: 'open', isOpen: true, reason: '' };
  },

  _showRegistrationClosedModal() {
    wx.showModal({
      title: '报名通道已关闭',
      content: '报名通道已关闭，请联系组织者',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  _buildRegistrationLog(options) {
    const opts = options || {};
    const user = gameStore.getCurrentUser() || {};
    const operatorId = String(user.userId || user.id || '').trim();
    return {
      action: 'registration_status_changed',
      before: opts.before,
      after: opts.after,
      operatorId: operatorId,
      operatorName: String(user.nickname || user.displayName || user.name || operatorId || '管理员'),
      createdAt: Date.now()
    };
  },

  toggleRegistrationStatus() {
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    const before = this._normalizeRegistrationStatus(match);
    const after = before === 'closed' ? 'open' : 'closed';
    match.registrationStatus = after;
    match.registrationLogs = Array.isArray(match.registrationLogs) ? match.registrationLogs : [];
    match.registrationLogs = match.registrationLogs.concat(this._buildRegistrationLog({
      before: before,
      after: after
    }));
    teamMatchStore.saveMatch(match);
    const patch = this._buildRegisterStatePatch(match, this.data.activeRegisterSubTab);
    this.setData(patch, () => {
      this.applyMoreAccess();
      if (this.data.activeTab === 'register') this.measureRegisterExtTop();
    });
    wx.showToast({
      title: after === 'closed' ? '报名已关闭' : '报名已打开',
      icon: 'success'
    });
  },

  startTournamentMatch() {
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    console.log('[start-match-before]', {
      matchId: matchId,
      status: match.status || '',
      statusLabel: match.statusLabel || '',
      registrationStatus: match.registrationStatus || match.registerStatus || ''
    });
    match.status = MATCH_LIFECYCLE.ONGOING;
    match.statusLabel = '比赛进行中';
    match.updatedAt = Date.now();
    teamMatchStore.saveMatch(match);
    const savedMatch = teamMatchStore.getMatchById(matchId) || match;
    console.log('[start-match-after]', {
      matchId: matchId,
      status: savedMatch.status || '',
      statusLabel: savedMatch.statusLabel || '',
      registrationStatus: savedMatch.registrationStatus || savedMatch.registerStatus || ''
    });
    this.loadMatch(matchId);
    this.applyMoreAccess();
    wx.showModal({
      title: '提示',
      content: '比赛已经进入开始阶段，请到‘赛事’菜单查看',
      showCancel: false,
      confirmText: '确认',
      success: (res) => {
        if (!res.confirm) return;
        console.log('[start-match-navigate]');
        wx.redirectTo({
          url: '/pages/home/index?section=tournament',
          fail: () => {
            wx.reLaunch({ url: '/pages/home/index?section=tournament' });
          }
        });
      }
    });
  },

  /* ===== 立即报名流程：分组选择 + 比赛名 + 手机号 ===== */
  openRegisterSheet() {
    if (!this.data.registerPermission.isOpen) return;
    if (this.data.currentUserRegisterStatus.isRegistered) return;
    const profile = userProfileStore.loadProfile();
    const user = gameStore.getCurrentUser() || {};
    const subTabs = this.data.registerSubTabs || [];
    this.setData({
      registerSheetVisible: true,
      registerSheetGroupId: subTabs.length ? subTabs[0].id : '',
      registerCompetitionNameDraft: userProfileStore.getRegisterCompetitionNameDefault(profile),
      // 性别唯一来源：个人资料 gender（弹窗内只读展示，不可编辑）
      registerGenderDraft: profile.gender || '',
      registerPhone: user.phone ? String(user.phone) : ''
    });
  },

  closeRegisterSheet() {
    this.setData({ registerSheetVisible: false });
  },

  selectRegisterSheetGroup(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ registerSheetGroupId: id });
  },

  onRegisterCompetitionNameInput(e) {
    this.setData({ registerCompetitionNameDraft: e.detail.value || '' });
  },

  confirmRegister() {
    if (this.data.registerSubmitting) return;
    if (!(this.data.registerPermission && this.data.registerPermission.isOpen)) {
      this.setData({ registerSheetVisible: false });
      return;
    }
    if (this.data.currentUserRegisterStatus.isRegistered) {
      this.setData({ registerSheetVisible: false });
      return;
    }

    // 1. 分组必选
    const groupId = String(this.data.registerSheetGroupId || '');
    const selectedGroup = (this.data.registerSubTabs || []).find((tab) => tab.id === groupId);
    if (!selectedGroup) {
      wx.showToast({ title: '请选择报名分组', icon: 'none' });
      return;
    }

    // 2. 最终比赛名（以用户最终输入为准），有变化则写回 competitionName
    const competitionName = userProfileStore.resolveRegisterCompetitionName(this.data.registerCompetitionNameDraft);
    if (!competitionName) {
      wx.showToast({ title: '请输入比赛名', icon: 'none' });
      return;
    }
    const profile = userProfileStore.loadProfile();
    if (competitionName !== (profile.competitionName || '')) {
      userProfileStore.setCompetitionName(competitionName);
    }

    // 3. 读取最新赛事对象，写入 registerInfo.users
    const match = teamMatchStore.getMatchById(this.data.matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    if (this._normalizeRegistrationStatus(match) === 'closed') {
      this.setData({ registerSheetVisible: false, registerSubmitting: false });
      return;
    }
    const user = gameStore.getCurrentUser() || {};
    const userId = String(user.userId || '');
    if (!userId) {
      wx.showToast({ title: '用户信息缺失', icon: 'none' });
      return;
    }

    this.setData({ registerSubmitting: true });

    if (!match.registerInfo || typeof match.registerInfo !== 'object') {
      match.registerInfo = { totalCount: 0, users: [] };
    }
    if (!Array.isArray(match.registerInfo.users)) {
      match.registerInfo.users = [];
    }
    // 防重：同一 userId 不重复写入
    const already = match.registerInfo.users.some((item) => String(item && item.userId) === userId);
    if (!already) {
      const registeredByName =
        (user.name && String(user.name).trim()) || competitionName || '';
      match.registerInfo.users.push({
        userId: userId,
        userType: 'registered',
        identitySource: 'mini_program',
        nickname: user.name ? String(user.name) : '',
        competitionName: competitionName,
        matchNickname: competitionName,
        gender: this.data.registerGenderDraft ? String(this.data.registerGenderDraft) : '',
        avatar: user.avatar ? String(user.avatar) : '',
        phone: this.data.registerPhone ? String(this.data.registerPhone) : (user.phone ? String(user.phone) : ''),
        groupId: groupId,
        groupName: selectedGroup.name || '',
        registeredAt: Date.now(),
        // Patch 1：本人立即报名元数据（替他人报名流程后续再写 proxy/admin）
        source: 'self',
        registeredBy: userId,
        registeredByName: registeredByName,
        subjectType: 'self',
        pickChannel: '',
        canSelfCancel: true,
        locked: false
      });
    }
    // 4. 更新总人数
    match.registerInfo.totalCount = match.registerInfo.users.length;

    // 5. 持久化
    teamMatchStore.saveMatch(match);

    // 6. 刷新页面数据（保持当前用户所在分组选中）
    const patch = this._buildRegisterStatePatch(match, groupId);
    patch.registerSheetVisible = false;
    patch.registerSubmitting = false;
    this.setData(patch, () => {
      if (this.data.activeTab === 'register') this.measureRegisterExtTop();
    });
    wx.showToast({ title: '报名成功', icon: 'success' });
  },

  /* ===== 取消报名流程 ===== */
  openCancelRegisterModal() {
    if (!this.data.registerPermission.isOpen) return;
    if (!this.data.currentUserRegisterStatus.isRegistered) return;
    const match = teamMatchStore.getMatchById(this.data.matchId);
    const user = gameStore.getCurrentUser() || {};
    const userId = String(user.userId || '');
    const grouped = !!(match && userId && teamMatchStore.isUserInFormalGroups(match, userId));
    this.setData({
      registerCancelModalVisible: true,
      registerCancelModalTitle: grouped ? '取消报名' : '确认取消报名？',
      registerCancelModalDesc: grouped
        ? '已经被分组，是否确认取消'
        : '取消后，你将从本场赛事报名名单中移除。'
    });
  },

  closeCancelRegisterModal() {
    // 代报名取消：用户点「取消」时丢弃待提交 plan，不改数据
    if (this._pendingProxyCommitAfterConfirm) {
      this._pendingProxyCommitAfterConfirm = false;
      this._proxyCommitPlan = null;
      this._clearProxyRegistrationTempState();
    }
    this.setData({
      registerCancelModalVisible: false,
      registerCancelSubmitting: false
    });
  },

  confirmCancelRegister() {
    if (this.data.registerCancelSubmitting) return;

    // 代报名取消：确认后走统一 commit（已在 plan 中按权限筛过 targetUserId）
    if (this._pendingProxyCommitAfterConfirm) {
      this._pendingProxyCommitAfterConfirm = false;
      this.setData({
        registerCancelModalVisible: false,
        registerCancelSubmitting: true
      });
      this._applyProxyCommitPlan();
      this.setData({ registerCancelSubmitting: false });
      return;
    }

    if (!this.data.currentUserRegisterStatus.isRegistered) {
      this.setData({ registerCancelModalVisible: false });
      return;
    }

    const matchId = this.data.matchId;
    const user = gameStore.getCurrentUser() || {};
    const userId = String(user.userId || '');
    if (!userId) {
      wx.showToast({ title: '用户信息缺失', icon: 'none' });
      return;
    }

    const match = teamMatchStore.getMatchById(matchId);
    const registerUsers =
      match && match.registerInfo && Array.isArray(match.registerInfo.users)
        ? match.registerInfo.users
        : [];
    const registerUser = registerUsers.find(
      (item) => String((item && item.userId) || '') === userId
    );
    if (paymentManage.isUserPaymentConfirmed(registerUser)) {
      this.setData({
        registerCancelModalVisible: false,
        registerCancelSubmitting: false
      });
      wx.showModal({
        title: '已收款提醒',
        content: '你已完成本场费用登记。取消报名后，请务必联系赛事组织方协商费用退还。',
        cancelText: '我再想想',
        confirmText: '继续取消',
        success: (res) => {
          if (!res.confirm) {
            const log = paymentManage.createPaymentLog({
              action: 'paid_user_cancel_aborted',
              operator: this._buildPaymentLogOperator(match),
              targetUser: registerUser,
              diffText: playerManage.resolveMatchNickname(registerUser) + '尝试取消报名，系统提示已收款需协商退款，用户放弃取消。'
            });
            paymentManage.appendPaymentLogs(match, [log]);
            teamMatchStore.saveMatch(match);
            return;
          }
          const log = paymentManage.createPaymentLog({
            action: 'paid_user_cancel_confirmed',
            operator: this._buildPaymentLogOperator(match),
            targetUser: registerUser,
            diffText: playerManage.resolveMatchNickname(registerUser) + '在已收款状态下继续取消报名，系统已提醒其联系赛事组织方协商退款。'
          });
          paymentManage.appendPaymentLogs(match, [log]);
          teamMatchStore.saveMatch(match);
          this._performCancelRegistration(matchId, userId);
        }
      });
      return;
    }

    this._performCancelRegistration(matchId, userId);
  },

  _performCancelRegistration(matchId, userId) {
    this.setData({ registerCancelSubmitting: true });
    const result = teamMatchStore.cancelRegistration(matchId, userId);
    if (!result || !result.ok) {
      this.setData({ registerCancelSubmitting: false });
      wx.showToast({
        title: result && result.reason === 'not_found' ? '赛事数据缺失' : '取消失败',
        icon: 'none'
      });
      return;
    }

    const match = result.match;
    const patch = Object.assign(
      {},
      this._buildRegisterStatePatch(match, this.data.activeRegisterSubTab),
      this._buildGroupsTabStatePatch(match),
      {
        registerCancelModalVisible: false,
        registerCancelSubmitting: false
      }
    );
    this.setData(patch, () => {
      if (this.data.activeTab === 'register') this.measureRegisterExtTop();
      if (this.data.activeTab === 'groups') this.computeGroupsPanelMinHeight();
    });
    wx.showToast({ title: '已取消报名', icon: 'success' });
  },

  refreshPartnerSection() {
    const cfg = partnerConfigUtil.loadPartnerConfig('GOLF BROTHERS');
    this.setData({
      partnerConfig: cfg,
      partnerLogoRows: partnerConfigUtil.buildPartnerLogoRows(cfg.partnerLogos)
    });
  },

  /** COS 默认图加载失败 → 回退本地 assets/partners */
  onPartnerLogoError(e) {
    const row = Number(e.currentTarget.dataset.row);
    const side = e.currentTarget.dataset.side;
    if (side !== 'left' && side !== 'right') return;
    const rows = (this.data.partnerLogoRows || []).slice();
    const rowData = rows[row];
    if (!rowData || !rowData[side] || !rowData[side].url) return;
    const current = String(rowData[side].url || '').trim();
    const fallback = partnerConfigUtil.getPartnerLogoLocalFallback(current);
    if (!fallback || fallback === current) return;
    const nextRow = Object.assign({}, rowData);
    nextRow[side] = { url: fallback };
    rows[row] = nextRow;
    this.setData({ partnerLogoRows: rows });
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
    // 从「修改比赛」返回时刷新赛事基础信息，不强制重置 TAB
    if (this.data.matchId && this._detailReady) {
      this.refreshMatchData(this.data.matchId);
    }
    this._detailReady = true;
    // 显示偏好可能在记分页被切换 → 同步最新值
    this.loadScoreDisplayMode();
    // 出发表 groups 可能在记分页被更新 → 重算出发表视图与领先榜（均派生自 groups）
    this.refreshGroupsDerived();
    this.refreshPartnerSection();
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
    if (this.data.activeTab === 'register') wx.nextTick(() => this.measureRegisterExtTop());
    if (this.data.activeTab === 'groups') wx.nextTick(() => this.computeGroupsPanelMinHeight());
    wx.nextTick(() => this._refreshFabHitZones());
  },

  onHide() {
    this.disconnectTeeObserver();
    if (this.data.moreFabDragging) this.setData({ moreFabDragging: false });
  },

  onUnload() {
    this.disconnectTeeObserver();
  },

  onResize() {
    this.measureTabTop();
    try {
      const sys = wx.getSystemInfoSync();
      if (sys && sys.windowHeight) this._fabWindowH = sys.windowHeight;
    } catch (e) { /* ignore */ }
    if (this.data.activeTab === 'register') {
      wx.nextTick(() => {
        this.computeRosterMinHeight();
        this._syncStickyByScroll(this.data.scrollYState || 0);
      });
    }
    if (this.data.activeTab === 'groups') {
      wx.nextTick(() => {
        this.computeGroupsPanelMinHeight();
        this._syncStickyByScroll(this.data.scrollYState || 0);
      });
    }
    wx.nextTick(() => this.updateTabContentSpacer());
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

  /** 领先榜逐洞下方广告：demo 走专用图，真实赛事走赛事信息第一个广告图 */
  _resolveScorecardAdImage(theme, matchId) {
    const id = matchId != null ? matchId : this.data.matchId;
    if (demoJiaobeiMatch.isJiaobeiDemoMatchId(id)) {
      console.log('[scorecard-ad-source]', {
        source: 'demoJiaobei',
        matchId: id
      });
      return demoJiaobeiMatch.resolveJiaobeiScorecardAdImage(theme || getApp().getTheme())
        || DEFAULT_SCORECARD_AD_IMAGE;
    }
    const match = this._resolveMatchData(id);
    const firstImage = match && Array.isArray(match.eventInfoList)
      ? match.eventInfoList.find((item) => item && String(item.type) === 'image')
      : null;
    const image = this._resolveEventInfoImage(firstImage, theme || getApp().getTheme());
    if (image) {
      console.log('[scorecard-ad-source]', {
        source: 'match.eventInfoList',
        matchId: id,
        imageId: firstImage && firstImage.id
      });
      return image;
    }
    console.log('[scorecard-ad-source]', {
      source: 'default',
      matchId: id
    });
    return DEFAULT_SCORECARD_AD_IMAGE;
  },

  applyTheme(theme) {
    const dark = theme === 'dark';
    const patch = {
      themeClass: dark ? 'dark-mode' : 'bright-mode',
      scorecardAdImage: this._resolveScorecardAdImage(theme, this.data.matchId)
    };
    const match = this._resolveMatchData(this.data.matchId) || this.data.match;
    if (match) {
      patch.eventInfoList = this._resolveEventInfoList(match, theme);
    }
    this.setData(patch);
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    const headerTotalHeight = header.metrics.headerTotalHeight;
    const tabBarHeight = this.data.tabBarHeight || 50;
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle,
      headerTotalHeight,
      stickyWatchersTop: headerTotalHeight + tabBarHeight,
      stickyRegisterExtTop: headerTotalHeight + tabBarHeight
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
              patch.stickyRegisterExtTop = (this.data.headerTotalHeight || 0) + tabRect.height;
            }
            this.setData(patch);
            this._syncStickyByScroll(scrollOff.scrollTop || 0);
            this.updateTabContentSpacer();
            if (this.data.activeTab === 'discussion') this.measureWatchersTop();
            if (this.data.activeTab === 'register') this.measureRegisterExtTop();
            if (this.data.activeTab === 'groups') this.computeGroupsPanelMinHeight();
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

  // 测量报名扩展区相对滚动内容顶部的偏移，用于二级吸顶（紧贴 TAB 下方）
  /**
   * 计算报名名单卡片的动态最小高度：
   * rosterMinHeight = 窗口高 - HEADER - 主TAB - 报名二级TAB - 底部CTA(含safe-area) - 必要间距
   * 无 CTA 时以底部 safe-area 兜底；使名单卡片底部刚好落在 CTA 上方，并保证内容足以触发主 TAB 吸顶。
   */
  computeRosterMinHeight() {
    if (this.data.activeTab !== 'register') return;
    let sys = { windowWidth: 375, windowHeight: 667 };
    try { sys = wx.getSystemInfoSync() || sys; } catch (e) {}
    const winH = sys.windowHeight || 667;
    const rpx2px = (sys.windowWidth || 375) / 750;
    let safeBottom = 0;
    if (sys.safeArea && typeof sys.screenHeight === 'number') {
      safeBottom = Math.max(0, sys.screenHeight - sys.safeArea.bottom);
    }
    this.createSelectorQuery()
      .in(this)
      .select('.gb-header').boundingClientRect()
      .select('.tab-scroll-wrap--inflow').boundingClientRect()
      .select('.register-ext-wrap--inflow').boundingClientRect()
      .select('.register-cta-bar').boundingClientRect()
      .exec((res) => {
        res = res || [];
        const headerH = res[0] && res[0].height ? res[0].height : (this.data.headerTotalHeight || 92);
        const mainTabH = res[1] && res[1].height ? res[1].height : (this.data.tabBarHeight || 50);
        const extH = res[2] && res[2].height ? res[2].height : 116 * rpx2px;
        const ctaH = res[3] && res[3].height ? res[3].height : 0;
        // CTA 的高度已包含其自身 safe-area 内边距；无 CTA 时用 safeBottom 兜底避让底部
        const bottomReserve = ctaH > 0 ? ctaH : safeBottom;
        const gap = 40 * rpx2px; // 必要上下间距（对齐 detail-main 顶部内边距）
        let h = winH - headerH - mainTabH - extH - bottomReserve - gap;
        if (!(h > 0)) h = 0;
        h = Math.round(h);
        this._availableRegisterViewportHeight = h;
        const patch = {};
        if (h !== this.data.rosterMinHeight) patch.rosterMinHeight = h;
        if (h !== this.data.availableRegisterViewportHeight) {
          patch.availableRegisterViewportHeight = h;
        }
        if (Object.keys(patch).length) this.setData(patch);
      });
  },

  /**
   * 分组 TAB 内容区动态最小高度：
   * groupsPanelMinHeight = 窗口高 - HEADER - 主TAB - 必要间距 - safe-area
   * 无二级扩展区/底部 CTA；撑满主 TAB 以下剩余空间以触发吸顶。
   */
  computeGroupsPanelMinHeight() {
    if (this.data.activeTab !== 'groups') return;
    let sys = { windowWidth: 375, windowHeight: 667 };
    try { sys = wx.getSystemInfoSync() || sys; } catch (e) {}
    const winH = sys.windowHeight || 667;
    const rpx2px = (sys.windowWidth || 375) / 750;
    let safeBottom = 0;
    if (sys.safeArea && typeof sys.screenHeight === 'number') {
      safeBottom = Math.max(0, sys.screenHeight - sys.safeArea.bottom);
    }
    this.createSelectorQuery()
      .in(this)
      .select('.gb-header').boundingClientRect()
      .select('.tab-scroll-wrap--inflow').boundingClientRect()
      .exec((res) => {
        res = res || [];
        const headerH = res[0] && res[0].height ? res[0].height : (this.data.headerTotalHeight || 92);
        const mainTabH = res[1] && res[1].height ? res[1].height : (this.data.tabBarHeight || 50);
        const gap = 40 * rpx2px;
        let h = winH - headerH - mainTabH - gap - safeBottom;
        if (!(h > 0)) h = 0;
        h = Math.round(h);
        if (h !== this.data.groupsPanelMinHeight) this.setData({ groupsPanelMinHeight: h });
      });
  },

  measureRegisterExtTop() {
    if (this.data.activeTab !== 'register') return;
    this.computeRosterMinHeight();
    wx.nextTick(() => {
      this.createSelectorQuery()
        .select('.register-ext-wrap--inflow')
        .boundingClientRect()
        .select('.detail-scroll')
        .boundingClientRect()
        .select('.detail-scroll')
        .scrollOffset()
        .exec((res) => {
          const extRect = res && res[0];
          const scrollRect = res && res[1];
          const scrollOff = res && res[2];
          if (extRect && scrollRect && scrollOff && extRect.height > 0) {
            const top = extRect.top - scrollRect.top + scrollOff.scrollTop;
            if (top > 0) {
              this.setData({ registerExtOffsetTop: top });
              this._syncStickyByScroll(scrollOff.scrollTop || 0);
            }
          }
          // rosterMinHeight / 布局稳定后：补齐吸顶可达距离，并按内容高度刷新锁定
          this.updateRegisterStickySpacer();
          this.updateRegisterContentLockMetrics();
        });
    });
  },

  // 内容不足时注入底部 spacer，保证外层 scroll 仍可继续上滑到 sticky 触发点
  updateTabContentSpacer() {
    const tab = this.data.activeTab;
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
      .select('.register-ext-wrap--inflow')
      .boundingClientRect()
      .exec((res) => {
        const view = res && res[0];
        const main = res && res[1];
        const tabBar = res && res[2];
        const watchersBar = res && res[3];
        const registerExt = res && res[4];
        if (!view || !main || !tabBar) return;
        const viewportH = view.height || 0;
        const spacerNow = this.data.contentSpacerHeight || 0;
        let contentH = Math.max(0, (main.height || 0) - spacerNow);
        if (tab === 'discussion' && watchersBar && watchersBar.height > 0) {
          contentH += watchersBar.height;
        }
        const tabH = tabBar.height || 0;
        let secondaryH = 0;
        if (tab === 'discussion' && watchersBar && watchersBar.height > 0) {
          secondaryH = watchersBar.height;
        } else if (tab === 'register' && registerExt && registerExt.height > 0) {
          secondaryH = registerExt.height;
        }
        const minH = Math.max(0, Math.ceil(viewportH - tabH - secondaryH));
        const stickyThresholdOffset = 8; // 轻微 buffer，确保可稳定触发吸顶
        const spacer = (tab === 'discussion' || tab === 'game')
          ? Math.max(0, Math.ceil((viewportH - tabH + stickyThresholdOffset) - contentH))
          : 0;
        const patch = {};
        if (minH !== this.data.detailMainMinHeight) patch.detailMainMinHeight = minH;
        if (spacer !== this.data.contentSpacerHeight) patch.contentSpacerHeight = spacer;
        if (Object.keys(patch).length) {
          this.setData(patch, () => {
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
    const registerExtSticky = this._calcStickyRegisterExt(scrollTop, sticky);
    if (registerExtSticky !== this.data.isStickyRegisterExt) {
      patch.isStickyRegisterExt = registerExtSticky;
    }
    if (this.data.activeTab === 'register' || this.data.activeTab === 'groups') {
      const hideCTA = this._calcHideRegisterCTA(scrollTop, sticky);
      if (hideCTA !== this.data.hideRegisterCTA) {
        patch.hideRegisterCTA = hideCTA;
      }
    }
    // 报名列表锁定：仅 isStickyTab 后 + 内容未超出可视区；吸顶前恒 false
    const contentLocked = this._resolveRegistrationContentLocked({
      isStickyTab: sticky,
      activeTab: this.data.activeTab
    });
    if (contentLocked !== this.data.registrationContentLocked) {
      patch.registrationContentLocked = contentLocked;
    }
    const justStuck = patch.isStickyTab === true && !this.data.isStickyTab;
    const ctaVisibilityChanged = Object.prototype.hasOwnProperty.call(patch, 'hideRegisterCTA');
    if (justStuck) {
      patch.tabHScrollLeft = this._lastTabScrollLeft || 0;
    }
    if (Object.keys(patch).length) this.setData(patch);
    // 刚吸顶或底部 CTA 显隐变化：重测可用高度（CTA 占位影响 availableH）
    if (this.data.activeTab === 'register' && (justStuck || ctaVisibilityChanged)) {
      this.updateRegisterContentLockMetrics({ forceSticky: sticky });
    }
    // 吸顶后才钳制「继续上滑」；不改内容高度、不把 scrollTop 拉回阈值以下
    if (contentLocked) {
      this._clampRegisterScrollAfterSticky(scrollTop, true);
    }
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

  _calcStickyRegisterExt(scrollTop, isStickyTab) {
    if (this.data.activeTab !== 'register') return false;
    if (!isStickyTab) return false;
    const extThreshold = this.data.registerExtOffsetTop || 0;
    const stickyTop = this.data.stickyRegisterExtTop || 0;
    return extThreshold > 0 && scrollTop >= extThreshold - stickyTop;
  },

  /**
   * 底部 CTA 显隐（报名 / 分组共用）：screenHeight - tabBottom <= 100px 时隐藏
   * tabBottom 由 tabOffsetTop / scrollTop / tabBarHeight / headerTotalHeight 推导（与吸顶同一套测量）
   */
  _calcHideRegisterCTA(scrollTop, isStickyTab) {
    const tabOffsetTop = this.data.tabOffsetTop || 0;
    if (tabOffsetTop <= 0) return false;

    const screenH = this._fabWindowH || 667;
    const tabBarH = this.data.tabBarHeight || 50;
    const headerH = this.data.headerTotalHeight || 92;
    let tabBottom;
    if (isStickyTab) {
      tabBottom = headerH + tabBarH;
    } else {
      tabBottom = headerH + tabOffsetTop - scrollTop + tabBarH;
    }
    return (screenH - tabBottom) <= 100;
  },

  _syncStickyRegisterExtByScroll(scrollTop) {
    const sticky = this._calcStickyRegisterExt(scrollTop, this.data.isStickyTab);
    if (sticky !== this.data.isStickyRegisterExt) {
      this.setData({ isStickyRegisterExt: sticky });
    }
  },

  onScroll(e) {
    const scrollTop = e.detail.scrollTop || 0;
    // 先同步吸顶状态；吸顶后再由 _syncStickyByScroll 按内容是否溢出钳制列表
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
    if (tab !== 'register' && this.data.isStickyRegisterExt) {
      patch.isStickyRegisterExt = false;
    }
    if (tab !== 'register') {
      patch.registrationContentLocked = false;
      patch.registrationStickySpacerHeight = 0;
    }
    if (tab !== 'register' && tab !== 'groups') {
      patch.hideRegisterCTA = false;
    }
    this.setData(patch);
    wx.nextTick(() => {
      this.updateTabContentSpacer();
      if (tab === 'discussion') this.measureWatchersTop();
      if (tab === 'register') {
        this.measureRegisterExtTop();
        this._syncStickyByScroll(this.data.scrollYState || 0);
      }
      if (tab === 'groups') {
        this._refreshFormalGroupsDisplay();
        this.computeGroupsPanelMinHeight();
        this._syncStickyByScroll(this.data.scrollYState || 0);
      }
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

  _resolveCurrentUserTournamentGroupId(match) {
    const currentUserId = String((gameStore.getCurrentUser() || {}).userId || '').trim();
    if (!currentUserId || !match || !Array.isArray(match.groups)) return '';
    const group = match.groups.find((g) => {
      const players = Array.isArray(g && g.players) ? g.players : [];
      return players.some((player) => String((player && player.userId) || '').trim() === currentUserId);
    });
    return group && group.groupId != null ? String(group.groupId) : '';
  },

  onEnterMyGroup() {
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const groupId = this._resolveCurrentUserTournamentGroupId(match);
    if (!groupId) {
      wx.showToast({ title: '当前未加入任何小组', icon: 'none' });
      return;
    }
    this._enterTournamentGroupScore(groupId);
  },

  // 出发表：点击任意组 → 个人比杆赛记分页。先写好该组 matchState，再统一 enterScorePage。
  onEnterGroup(e) {
    const groupId = e.currentTarget.dataset.groupId || '';
    this._enterTournamentGroupScore(groupId);
  },

  _enterTournamentGroupScore(groupId) {
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    groupsStore.ensureInitialized();
    const group = match && Array.isArray(match.groups)
      ? match.groups.find((g) => String(g && g.groupId) === String(groupId))
      : null;
    const lookup = this._buildGroupPlayerLookup(match);
    let players = group
      ? this.hydrateGroupDisplayPlayers(group, lookup).map((p) => ({
          playerId: p.userId || p.playerId,
          name: p.displayName || p.name,
          avatar: p.avatar || ''
        }))
      : [];
    if (!players.length) {
      players = groupsStore.loadGroupForScoring(groupId).map((p) => ({
        playerId: p.playerId,
        name: p.name,
        avatar: p.avatar || ''
      }));
    }
    const groupCount =
      match && Array.isArray(match.groups) && match.groups.length
        ? match.groups.length
        : (groupsStore.getGroups() || []).length || 1;
    const courseMeta = match
      ? {
          courseId: match.courseId || '',
          courseName: match.courseName || match.venueName || '',
          courseLocation: match.courseLocation || '',
          courseHalfText: match.courseHalfText || '',
          front9Course: match.front9Course || null,
          back9Course: match.back9Course || null,
          roundName: match.roundName || match.name || match.eventName || match.tournamentName || match.teamName || '',
          gameMode: match.gameMode || match.selectedGameMode || '个人比杆赛',
          teeTime: match.teeTime || match.date || '',
          teeTimeText: match.teeTimeText || '',
          visibility: match.visibility || '',
          accessCode: match.accessCode || ''
        }
      : {};
    const mode = resolveTournamentScorePageMode(match, groupId);
    matchStateUtil.setMatchState({
      mode: mode,
      formatType: 'individual_stroke',
      gameId: '',
      matchId: matchId,
      groupIndex: 0,
      groupId: groupId,
      players: players,
      course: {
        courseId: courseMeta.courseId || '',
        courseName: courseMeta.courseName || '',
        courseLocation: courseMeta.courseLocation || '',
        halfText: courseMeta.courseHalfText || '',
        roundName: courseMeta.roundName || '',
        gameMode: courseMeta.gameMode || '个人比杆赛',
        teeTime: courseMeta.teeTime || '',
        teeTimeText: courseMeta.teeTimeText || '',
        visibility: courseMeta.visibility || '',
        accessCode: courseMeta.accessCode || '',
        front9Course: courseMeta.front9Course || null,
        back9Course: courseMeta.back9Course || null
      },
      scores: matchStateUtil.emptyScores(),
      // 赛事出发表为多组场景：返回回到赛事详情（>1 → navigateBack）
      groupCount: groupCount
    });
    matchStateUtil.enterScorePage();
  },

  /* ===== 出发表 + 领先榜 ===== */
  _syncTournamentHoleLayout(matchOrNull) {
    const match = matchOrNull || null;
    const meta = match
      ? {
          courseId: match.courseId || '',
          courseName: match.courseName || '',
          front9Course: match.front9Course || null,
          back9Course: match.back9Course || null
        }
      : groupsStore.getTournamentCourseMeta();
    const layout = holeLayout.resolveLayoutFromContext({
      courseId: meta.courseId,
      courseName: meta.courseName,
      front9Course: meta.front9Course,
      back9Course: meta.back9Course
    });
    holeLayout.applyLayout(layout);
  },

  _buildScorecardCourseTitle(match) {
    const courseName = String((match && match.courseName) || '').trim();
    const front9Course = String((match && match.front9Course) || '').trim();
    const back9Course = String((match && match.back9Course) || '').trim();
    if (!courseName) return '';
    if (!front9Course || !back9Course) return courseName;
    return courseName + '（' + front9Course + '/' + back9Course + '）';
  },

  _getMatchHolePars(match) {
    if (!match) return holeLayout.getLayout().holePars.slice();
    const parsed = (!match.front9Course && !match.back9Course)
      ? halfCourse.parseCourseHalfText(match.courseHalfText || match.courseHalf || match.halfText)
      : {};
    const layout = holeLayout.resolveLayoutFromContext({
      courseId: match.courseId || '',
      courseName: match.courseName || '',
      front9Course: match.front9Course || parsed.front9Course || null,
      back9Course: match.back9Course || parsed.back9Course || null
    });
    return layout.holePars.slice();
  },

  _isFilledLeaderboardScore(score) {
    return score !== null && score !== undefined && score !== '' && !Number.isNaN(Number(score));
  },

  _formatLeaderboardDiff(diff) {
    if (diff > 0) return '+' + diff;
    if (diff === 0) return '0';
    return String(diff);
  },

  _resolveLeaderboardTotalClass(diff) {
    if (diff < 0) return 'score-under';
    if (diff === 0) return 'score-even';
    return 'score-over';
  },

  _resolveLeaderboardThruLabel(thru) {
    if (!thru) return '-';
    return thru >= 18 ? 'F' : String(thru);
  },

  _resolveScorecardMarker(status) {
    switch (status) {
      case 'eagle':
      case 'birdie':
        return { m: 'circle', c: status === 'eagle' ? 'score-eagle' : 'score-birdie' };
      case 'bogey':
        return { m: 'square', c: 'score-bogey' };
      case 'double-bogey':
        return { m: 'square', c: 'score-double-bogey' };
      default:
        return { m: '', c: '' };
    }
  },

  _buildScorecardHoleCell(score, par, mode) {
    if (!this._isFilledLeaderboardScore(score)) return { t: '-', m: '', c: '' };
    const diff = Number(score) - Number(par || 0);
    const marker = this._resolveScorecardMarker(groupsStore.getScoreStatus(diff));
    return {
      t: mode === 'diff' ? this._formatLeaderboardDiff(diff) : String(score),
      m: marker.m,
      c: marker.c
    };
  },

  _buildScorecardSumCell(scores, pars, from, to, mode) {
    let gross = 0;
    let diff = 0;
    let filled = 0;
    for (let i = from; i < to; i++) {
      const score = scores[i];
      if (!this._isFilledLeaderboardScore(score)) continue;
      gross += Number(score);
      diff += Number(score) - Number(pars[i] || 0);
      filled += 1;
    }
    if (!filled) return { t: '', m: '', c: '' };
    return { t: mode === 'diff' ? this._formatLeaderboardDiff(diff) : String(gross), m: '', c: '' };
  },

  _sumScorecardPars(pars, from, to) {
    let total = 0;
    for (let i = from; i < to; i++) total += Number(pars[i] || 0);
    return total;
  },

  _buildScorecardFromScoreRecord(record, mode, scorecardStatus, match) {
    if (!record || !Array.isArray(record.scores)) return null;
    const scores = record.scores || [];
    const pars = this._getMatchHolePars(match);
    const parCell = (value) => ({ t: String(value), m: '', c: '' });
    const blank = { t: '', m: '', c: '' };

    const frontHead = ['Hole', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Out', ''];
    const backHead = ['Hole', '10', '11', '12', '13', '14', '15', '16', '17', '18', 'In', 'Tot'];
    const frontPar = [{ t: 'Par', m: '', c: '' }];
    const backPar = [{ t: 'Par', m: '', c: '' }];
    for (let i = 0; i < 9; i++) frontPar.push(parCell(pars[i]));
    frontPar.push(parCell(this._sumScorecardPars(pars, 0, 9)));
    frontPar.push(blank);
    for (let i = 9; i < 18; i++) backPar.push(parCell(pars[i]));
    backPar.push(parCell(this._sumScorecardPars(pars, 9, 18)));
    backPar.push(parCell(this._sumScorecardPars(pars, 0, 18)));

    const frontScore = [blank];
    const backScore = [blank];
    for (let i = 0; i < 9; i++) {
      frontScore.push(this._buildScorecardHoleCell(scores[i], pars[i], mode));
    }
    frontScore.push(this._buildScorecardSumCell(scores, pars, 0, 9, mode));
    frontScore.push(blank);
    for (let i = 9; i < 18; i++) {
      backScore.push(this._buildScorecardHoleCell(scores[i], pars[i], mode));
    }
    backScore.push(this._buildScorecardSumCell(scores, pars, 9, 18, mode));
    backScore.push(this._buildScorecardSumCell(scores, pars, 0, 18, mode));

    const scorecard = { frontHead, frontPar, frontScore, backHead, backPar, backScore };
    if (scorecardStatus) scorecard.scorecardStatus = scorecardStatus;
    return scorecard;
  },

  _resolveSlotScorePlayerId(slotPlayer, currentPlayerId) {
    const p = slotPlayer || {};
    const scorePlayerId = p.scorePlayerId || p.slotScorePlayerId || p.scoreOwnerId;
    const resolved = scorePlayerId != null ? String(scorePlayerId).trim() : '';
    if (resolved) return resolved;
    return currentPlayerId != null ? String(currentPlayerId).trim() : '';
  },

  _resolveScoresByPlayerRecord(scoresByPlayer, slotPlayer, currentPlayerId) {
    if (!scoresByPlayer || typeof scoresByPlayer !== 'object') return null;
    const scorePlayerId = this._resolveSlotScorePlayerId(slotPlayer, currentPlayerId);
    if (scorePlayerId && scoresByPlayer[scorePlayerId]) return scoresByPlayer[scorePlayerId];
    const playerId = currentPlayerId != null ? String(currentPlayerId).trim() : '';
    if (playerId && scoresByPlayer[playerId]) return scoresByPlayer[playerId];
    return null;
  },

  _resolveTeamMatchScorecard(match, row) {
    const groupId = row && row.groupId ? String(row.groupId) : '';
    const playerId = row && row.playerId ? String(row.playerId) : '';
    if (!match || !groupId || !playerId) return null;
    const scoreData = match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : null;
    const groupScoreData = scoreData && scoreData[groupId] && typeof scoreData[groupId] === 'object'
      ? scoreData[groupId]
      : null;
    const scoresByPlayer = groupScoreData &&
      groupScoreData.scoresByPlayer &&
      typeof groupScoreData.scoresByPlayer === 'object'
      ? groupScoreData.scoresByPlayer
      : null;
    const record = this._resolveScoresByPlayerRecord(scoresByPlayer, row, playerId);
    const scores = record && Array.isArray(record.scores) ? record.scores : [];
    const started = scores.some((score) => this._isFilledLeaderboardScore(score));
    if (!started) {
      return this._buildScorecardFromScoreRecord({ scores: [] }, this.data.scoreDisplayMode, 'not_started', match);
    }
    return this._buildScorecardFromScoreRecord(record, this.data.scoreDisplayMode, null, match);
  },

  _resolveMatchPlayerHoles(match, group, player, playerId) {
    const groupId = group && group.groupId ? String(group.groupId) : '';
    const scoreData = match && match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : null;
    const groupScoreData = scoreData && groupId && scoreData[groupId] && typeof scoreData[groupId] === 'object'
      ? scoreData[groupId]
      : null;
    const scoreRecord = groupScoreData &&
      groupScoreData.scoresByPlayer &&
      typeof groupScoreData.scoresByPlayer === 'object' &&
      playerId
      ? this._resolveScoresByPlayerRecord(groupScoreData.scoresByPlayer, player, playerId)
      : null;
    if (scoreRecord && Array.isArray(scoreRecord.scores)) {
      return {
        source: 'teamMatch.scoreData',
        holes: scoreRecord.scores.map((score, index) => ({ holeNo: index + 1, score: score }))
      };
    }
    if (Array.isArray(player && player.holes)) {
      return { source: 'match.groups', holes: player.holes };
    }
    if (Array.isArray(player && player.scores)) {
      return {
        source: 'match.groups',
        holes: player.scores.map((score, index) => ({ holeNo: index + 1, score: score }))
      };
    }
    const groupScoreRecord = group && group.scoresByPlayer && playerId
      ? this._resolveScoresByPlayerRecord(group.scoresByPlayer, player, playerId)
      : null;
    if (groupScoreRecord && Array.isArray(groupScoreRecord.scores)) {
      return {
        source: 'match.groups',
        holes: groupScoreRecord.scores.map((score, index) => ({ holeNo: index + 1, score: score }))
      };
    }
    return { source: '', holes: [] };
  },

  /**
   * 统一领先榜成绩字段语义：
   * - grossTotal: 实际总杆
   * - toPar: 相对标准杆杆差
   * 兼容入参可含 total/diff（旧字段）或 grossTotal/toPar（新字段）。
   */
  _getLeaderboardScoreFields(stats) {
    const source = stats || {};
    const grossRaw = source.grossTotal != null ? source.grossTotal : source.total;
    const toParRaw = source.toPar != null ? source.toPar : source.diff;
    const grossTotal = Number(grossRaw);
    const toPar = Number(toParRaw);
    return {
      grossTotal: Number.isFinite(grossTotal) ? grossTotal : 0,
      toPar: Number.isFinite(toPar) ? toPar : 0
    };
  },

  _computeMatchLeaderboardStats(match, group, player, playerId) {
    const resolved = this._resolveMatchPlayerHoles(match, group, player, playerId);
    const holes = resolved.holes || [];
    const pars = this._getMatchHolePars(match);
    let total = 0;
    let parThru = 0;
    let thru = 0;
    holes.forEach((hole, index) => {
      const score = hole && hole.score;
      if (!this._isFilledLeaderboardScore(score)) return;
      total += Number(score);
      parThru += Number(pars[index] || 0);
      thru += 1;
    });
    const fields = this._getLeaderboardScoreFields({
      total: total,
      diff: total - parThru
    });
    return {
      grossTotal: fields.grossTotal,
      toPar: fields.toPar,
      // 兼容：total=总杆，diff=杆差
      total: fields.grossTotal,
      diff: fields.toPar,
      thru: thru,
      hasScore: thru > 0,
      source: resolved.source || ''
    };
  },

  _buildLeaderboardFromMatchGroups(match, openIndex) {
    const groups = match && Array.isArray(match.groups) ? match.groups : [];
    if (!groups.length) return null;
    const playerLookup = this._buildGroupPlayerLookup(match);
    const teamNameMap = this._buildLeaderboardTeamNameMap(match);
    const playerTeamLookup = this._buildLeaderboardPlayerTeamLookup(match);
    const flat = [];
    groups.forEach((group) => {
      const displayPlayers = this.hydrateGroupDisplayPlayers(group, playerLookup);
      const displayMap = {};
      displayPlayers.forEach((player) => {
        if (player && player.userId) displayMap[String(player.userId)] = player;
      });
      (Array.isArray(group && group.players) ? group.players : []).forEach((player) => {
        const playerId = this._resolveAnyPlayerId(player);
        if (!playerId) return;
        const scorePlayerId = this._resolveSlotScorePlayerId(player, playerId);
        const slotIndex = Number(player && (player.position != null ? player.position : player.slotIndex)) || 0;
        const display = displayMap[playerId] || {};
        const lookup = playerLookup[playerId] || {};
        const genderDisplay = playerManage.getGenderDisplay(
          Object.assign({}, lookup, player, { gender: lookup.gender || display.gender || player.gender })
        );
        const stat = this._computeMatchLeaderboardStats(match, group, player, playerId);
        const scoreFields = this._getLeaderboardScoreFields(stat);
        const teamName = this._resolveLeaderboardPlayerTeamName(playerId, playerTeamLookup, teamNameMap);
        const teamTag = this._formatLeaderboardTeamTagName(teamName);
        flat.push({
          playerId: playerId,
          scorePlayerId: scorePlayerId,
          slotIndex: slotIndex,
          position: slotIndex,
          name: display.displayName || display.name || lookup.nickname || this._resolveAnyPlayerNickname(player) || '未知球员',
          group: group.groupName || '',
          groupId: group.groupId || '',
          avatar: display.avatar || mockAvatars.resolveAvatar(player.avatar || player.avatarUrl || '', playerId),
          gender: genderDisplay.gender || '',
          isFemale: genderDisplay.gender === 'female',
          genderIcon: genderDisplay.icon,
          genderClass: genderDisplay.className,
          flag: player.flag || '',
          country: player.country || '',
          age: player.age || '',
          grossTotal: scoreFields.grossTotal,
          toPar: scoreFields.toPar,
          total: scoreFields.grossTotal,
          diff: scoreFields.toPar,
          thru: stat.thru,
          hasScore: stat.hasScore,
          teamName: teamName,
          teamTag: teamTag,
          scoreSource: stat.source || ''
        });
      });
    });
    if (!flat.length) return null;
    flat.sort((a, b) => {
      if (a.thru === 0 && b.thru === 0) return 0;
      if (a.thru === 0) return 1;
      if (b.thru === 0) return -1;
      if (a.toPar !== b.toPar) return a.toPar - b.toPar;
      return b.thru - a.thru;
    });
    return flat.map((player, index) => {
      const started = player.thru > 0;
      const firstIndex = flat.findIndex((item) => item.thru > 0 && item.toPar === player.toPar);
      const tied = flat.filter((item) => item.thru > 0 && item.toPar === player.toPar).length > 1;
      const pos = !started ? '-' : tied ? 'T' + (firstIndex + 1) : String(index + 1);
      return {
        pos: pos,
        name: player.name,
        group: player.group,
        groupId: player.groupId,
        playerId: player.playerId,
        scorePlayerId: player.scorePlayerId || player.playerId,
        slotIndex: player.slotIndex || player.position || 0,
        position: player.position || player.slotIndex || 0,
        gender: player.gender || '',
        isFemale: player.isFemale,
        genderIcon: player.genderIcon,
        genderClass: player.genderClass,
        thru: this._resolveLeaderboardThruLabel(player.thru),
        grossTotal: player.grossTotal,
        toPar: player.toPar,
        total: player.grossTotal,
        diff: player.toPar,
        hasScore: player.hasScore === true,
        scoreStr: started ? this._formatLeaderboardDiff(player.toPar) : '-',
        scoreClass: started ? this._resolveLeaderboardTotalClass(player.toPar) : 'score-even',
        avatar: player.avatar,
        country: player.country,
        age: player.age,
        flag: player.flag,
        teamName: player.teamName || '',
        teamTag: player.teamTag || '',
        scoreSource: player.scoreSource || '',
        expanded: index === openIndex
      };
    });
  },

  _buildLeaderboardTeamNameMap(match) {
    const map = {};
    const teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    teamGroups.forEach((team) => {
      const teamId = team && team.id != null ? String(team.id).trim() : '';
      if (!teamId) return;
      map[teamId] = String((team && team.name) || '').trim();
    });
    return map;
  },

  _resolveLeaderboardPlayerTeamTag(playerId, playerTeamLookup, teamNameMap) {
    return this._formatLeaderboardTeamTagName(
      this._resolveLeaderboardPlayerTeamName(playerId, playerTeamLookup, teamNameMap)
    );
  },

  _resolveLeaderboardPlayerTeamName(playerId, playerTeamLookup, teamNameMap) {
    const id = playerId != null ? String(playerId).trim() : '';
    if (!id) return '';
    const ref = playerTeamLookup && playerTeamLookup[id];
    const teamId = ref && ref.teamId ? String(ref.teamId).trim() : '';
    if (!teamId) return '';
    return String((teamNameMap && teamNameMap[teamId]) || (ref && ref.teamName) || '').trim();
  },

  _formatLeaderboardTeamTagName(name) {
    const text = String(name || '').trim();
    if (!text) return '';
    const chars = Array.from(text);
    const hasChinese = /[\u4e00-\u9fff]/.test(text);
    const limit = hasChinese ? 4 : 8;
    return chars.slice(0, limit).join('');
  },

  _buildLeaderboardView(match) {
    const matchRows = this._buildLeaderboardFromMatchGroups(match, this.data.openIndex);
    let source = 'groupsStore';
    if (matchRows) {
      source = matchRows.some((row) => row && row.scoreSource === 'teamMatch.scoreData')
        ? 'teamMatch.scoreData'
        : 'match.groups';
    }
    const rows = matchRows || groupsStore.buildLeaderboard(this.data.scoringDisplay, this.data.openIndex);
    const matchGroups = match && Array.isArray(match.groups) ? match.groups : [];
    const storeGroups = source === 'groupsStore' ? (groupsStore.getGroups() || []) : [];
    const sourceGroups = source === 'match.groups' ? matchGroups : storeGroups;
    const playerCount = sourceGroups.reduce((count, group) => {
      const players = Array.isArray(group && group.players) ? group.players : [];
      return count + players.filter((player) => player && this._resolveAnyPlayerId(player)).length;
    }, 0);
    console.log('[leaderboard-score-source]', {
      matchId: this.data.matchId || '',
      source: source,
      groupCount: sourceGroups.length,
      playerCount: playerCount
    });
    return (rows || []).map((row) => this._attachPersonalLeaderboardScoreFields(row));
  },

  /** 个人榜行：补齐 grossTotal/toPar，并保留 total/diff 兼容别名 */
  _attachPersonalLeaderboardScoreFields(row) {
    if (!row) return row;
    const fields = this._getLeaderboardScoreFields(row);
    return Object.assign({}, row, {
      grossTotal: fields.grossTotal,
      toPar: fields.toPar,
      total: fields.grossTotal,
      diff: fields.toPar
    });
  },

  /**
   * 净杆榜 rows：只读 match.peoriaResult.results，不重算 HDCP。
   * 完整 18 洞按 net 升序；未完成追加末尾，POS / NET SCORE 显示 "-"。
   */
  _buildNetLeaderboardRows(match) {
    const results =
      match && match.peoriaResult && Array.isArray(match.peoriaResult.results)
        ? match.peoriaResult.results
        : [];
    const netByPlayerId = {};
    results.forEach((item) => {
      if (!item || item.playerId == null) return;
      const id = String(item.playerId).trim();
      if (!id) return;
      netByPlayerId[id] = item;
    });

    const groups = match && Array.isArray(match.groups) ? match.groups : [];
    if (!groups.length) return [];

    const playerLookup = this._buildGroupPlayerLookup(match);
    const teamNameMap = this._buildLeaderboardTeamNameMap(match);
    const playerTeamLookup = this._buildLeaderboardPlayerTeamLookup(match);
    const flat = [];
    const seen = {};

    groups.forEach((group) => {
      const displayPlayers = this.hydrateGroupDisplayPlayers(group, playerLookup);
      const displayMap = {};
      displayPlayers.forEach((player) => {
        if (player && player.userId) displayMap[String(player.userId)] = player;
      });
      (Array.isArray(group && group.players) ? group.players : []).forEach((player) => {
        const playerId = this._resolveAnyPlayerId(player);
        if (!playerId || seen[playerId]) return;
        seen[playerId] = true;
        const scorePlayerId = this._resolveSlotScorePlayerId(player, playerId);
        const slotIndex = Number(player && (player.position != null ? player.position : player.slotIndex)) || 0;
        const display = displayMap[playerId] || {};
        const lookup = playerLookup[playerId] || {};
        const genderDisplay = playerManage.getGenderDisplay(
          Object.assign({}, lookup, player, { gender: lookup.gender || display.gender || player.gender })
        );
        const stat = this._computeMatchLeaderboardStats(match, group, player, playerId);
        const filledHoles = Number(stat && stat.thru) || 0;
        const peoria =
          netByPlayerId[playerId] ||
          (scorePlayerId ? netByPlayerId[scorePlayerId] : null) ||
          null;
        const netRaw = peoria && peoria.net != null ? Number(peoria.net) : NaN;
        const hasNetScore = filledHoles === 18 && Number.isFinite(netRaw);
        const teamName = this._resolveLeaderboardPlayerTeamName(playerId, playerTeamLookup, teamNameMap);
        flat.push({
          playerId: playerId,
          scorePlayerId: scorePlayerId || playerId,
          slotIndex: slotIndex,
          position: slotIndex,
          name: display.displayName || display.name || lookup.nickname || this._resolveAnyPlayerNickname(player) || '未知球员',
          group: group.groupName || '',
          groupId: group.groupId || '',
          avatar: display.avatar || mockAvatars.resolveAvatar(player.avatar || player.avatarUrl || '', playerId),
          gender: genderDisplay.gender || '',
          isFemale: genderDisplay.gender === 'female',
          genderIcon: genderDisplay.icon,
          genderClass: genderDisplay.className,
          flag: player.flag || '',
          country: player.country || '',
          age: player.age || '',
          filledHoles: filledHoles,
          thru: this._resolveLeaderboardThruLabel(filledHoles),
          teamName: teamName,
          teamTag: this._formatLeaderboardTeamTagName(teamName),
          net: hasNetScore ? netRaw : null,
          hasNetScore: hasNetScore,
          hasScore: hasNetScore,
          scoreSource: 'match.peoriaResult'
        });
      });
    });

    const complete = [];
    const incomplete = [];
    flat.forEach((row) => {
      if (row.hasNetScore) complete.push(row);
      else incomplete.push(row);
    });
    complete.sort((a, b) => Number(a.net) - Number(b.net));
    const rankedComplete = this._buildCompetitionRanking(complete, (row) => row.net);

    const formatNet = (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return '-';
      return Math.round(n * 100) % 100 === 0 ? String(Math.round(n)) : String(Math.round(n * 100) / 100);
    };

    // NET SCORE 固定为 peoriaResult.net 数字，不走 toPar / scoreDisplayMode
    const mapRow = (row) => {
      const netDisplay = row.hasNetScore ? formatNet(row.net) : '-';
      return {
        pos: row.hasNetScore ? row.pos : '-',
        name: row.name,
        group: row.group,
        groupId: row.groupId,
        playerId: row.playerId,
        scorePlayerId: row.scorePlayerId || row.playerId,
        slotIndex: row.slotIndex || row.position || 0,
        position: row.position || row.slotIndex || 0,
        gender: row.gender || '',
        isFemale: row.isFemale,
        genderIcon: row.genderIcon,
        genderClass: row.genderClass,
        thru: row.thru,
        filledHoles: row.filledHoles,
        net: row.hasNetScore ? row.net : null,
        netScoreDisplay: netDisplay,
        hasNetScore: row.hasNetScore === true,
        hasScore: row.hasNetScore === true,
        grossTotal: 0,
        toPar: 0,
        total: row.hasNetScore ? row.net : 0,
        diff: 0,
        scoreStr: netDisplay,
        scoreClass: 'score-even',
        avatar: row.avatar,
        country: row.country,
        age: row.age,
        flag: row.flag,
        teamName: row.teamName || '',
        teamTag: row.teamTag || '',
        scoreSource: row.scoreSource || 'match.peoriaResult',
        expanded: false
      };
    };

    return rankedComplete
      .map((row) => mapRow(row))
      .concat(incomplete.map((row) => mapRow(Object.assign({}, row, { pos: '-' }))));
  },

  _buildLeaderboardViewForView(match, view) {
    const scoreType = this.data.leaderboardScoreType === 'net' ? 'net' : 'gross';
    let rows;
    if (scoreType === 'net') {
      rows = this._buildNetLeaderboardRows(match) || [];
    } else {
      rows = this._buildLeaderboardView(match) || [];
    }
    let filtered = rows;
    if (view === 'male') {
      filtered = rows.filter((row) => row && row.gender === 'male');
    } else if (view === 'female') {
      filtered = rows.filter((row) => row && row.gender === 'female');
    }

    if (scoreType === 'net') {
      const complete = [];
      const incomplete = [];
      filtered.forEach((row) => {
        if (row && row.hasNetScore === true && row.filledHoles === 18) complete.push(row);
        else {
          incomplete.push(Object.assign({}, row, {
            pos: '-',
            scoreStr: '-',
            netScoreDisplay: '-',
            hasNetScore: false,
            hasScore: false,
            net: null
          }));
        }
      });
      complete.sort((a, b) => Number(a.net) - Number(b.net));
      const ranked = this._buildCompetitionRanking(complete, (row) => row.net);
      return ranked.concat(incomplete).map((row, index) => Object.assign({}, row, {
        expanded: index === this.data.openIndex
      }));
    }

    const ranked = this._buildCompetitionRanking(filtered, (row) => (
      row && row.hasScore === true
        ? (row.toPar != null ? row.toPar : row.diff)
        : null
    ));
    return ranked.map((row, index) => Object.assign({}, row, {
      expanded: index === this.data.openIndex
    }));
  },

  _buildCompetitionRanking(rows, scoreGetter) {
    const source = Array.isArray(rows) ? rows : [];
    const getter = typeof scoreGetter === 'function' ? scoreGetter : ((row) => row && row.total);
    const ranked = source.map((row) => Object.assign({}, row));
    const scores = ranked.map((row) => {
      const value = getter(row);
      const score = Number(value);
      return value === null || value === undefined || value === '' || Number.isNaN(score) ? null : score;
    });
    let index = 0;
    let rankedCount = 0;
    while (index < ranked.length) {
      const score = scores[index];
      if (score === null) {
        ranked[index].pos = '-';
        index += 1;
        continue;
      }
      const rank = rankedCount + 1;
      let end = index + 1;
      while (end < ranked.length && scores[end] === score) {
        end += 1;
      }
      const groupSize = end - index;
      const pos = groupSize > 1 ? ('T' + rank) : String(rank);
      for (let i = index; i < end; i++) {
        ranked[i].pos = pos;
      }
      rankedCount += groupSize;
      index = end;
    }
    return ranked;
  },

  _buildTeamLeaderboardView(match) {
    if (this.data.leaderboardScoreType === 'net') {
      return this._buildNetTeamLeaderboardView(match);
    }
    const teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    if (teamGroups.length < 2) return [];
    const rules = match && match.scoringRules;
    const competition = rules && rules.teamCompetition;
    const isTeamCompetitionEnabled = !!(competition && competition.enabled === true);
    const configuredTopN = isTeamCompetitionEnabled
      ? Math.max(1, parseInt(competition.topN, 10) || 1)
      : 0;
    const teamMap = this._buildTeamLeaderboardTeamMap(match);
    const playerLookup = this._buildGroupPlayerLookup(match);
    const playerTeamLookup = this._buildLeaderboardPlayerTeamLookup(match);
    const groups = match && Array.isArray(match.groups) ? match.groups : [];

    groups.forEach((group) => {
      const displayPlayers = this.hydrateGroupDisplayPlayers(group, playerLookup);
      const displayMap = {};
      displayPlayers.forEach((displayPlayer) => {
        if (displayPlayer && displayPlayer.userId) displayMap[String(displayPlayer.userId)] = displayPlayer;
      });
      (Array.isArray(group && group.players) ? group.players : []).forEach((player) => {
        const playerId = this._resolveAnyPlayerId(player);
        if (!playerId) return;
        const teamRef = this._resolveLeaderboardPlayerTeam(player, playerId, playerLookup, playerTeamLookup);
        if (!teamRef.teamId) return;
        if (!teamMap[teamRef.teamId]) {
          teamMap[teamRef.teamId] = {
            teamId: teamRef.teamId,
            teamName: teamRef.teamName || '未命名分队',
            grossTotal: 0,
            toPar: 0,
            total: 0,
            scoringPlayersCount: 0,
            players: []
          };
        } else if (!teamMap[teamRef.teamId].teamName && teamRef.teamName) {
          teamMap[teamRef.teamId].teamName = teamRef.teamName;
        }
        const lookup = playerLookup[playerId] || {};
        const display = displayMap[playerId] || {};
        const genderDisplay = playerManage.getGenderDisplay(
          Object.assign({}, lookup, player, { gender: lookup.gender || display.gender || player.gender })
        );
        const stat = this._computeMatchLeaderboardStats(match, group, player, playerId);
        const scoreFields = this._getLeaderboardScoreFields(stat);
        const scorePlayerId = this._resolveSlotScorePlayerId(player, playerId);
        const name = display.displayName || display.name || lookup.nickname || this._resolveAnyPlayerNickname(player) || '未知球员';
        const avatar = display.avatar || mockAvatars.resolveAvatar(lookup.avatar || player.avatar || player.avatarUrl || '', playerId);
        teamMap[teamRef.teamId].players.push({
          playerId: playerId,
          userId: playerId,
          scorePlayerId: scorePlayerId,
          groupId: group && group.groupId ? String(group.groupId) : '',
          scorecardKey: teamRef.teamId + ':' + playerId,
          name: name,
          nickname: name,
          avatar: avatar,
          gender: genderDisplay.gender || '',
          genderIcon: genderDisplay.icon,
          genderClass: genderDisplay.className,
          country: player.country || '',
          age: player.age || '',
          flag: player.flag || '',
          grossTotal: scoreFields.grossTotal,
          toPar: scoreFields.toPar,
          // 兼容：分队球员行历史上 total 存的是杆差（toPar）
          total: scoreFields.toPar,
          diff: scoreFields.toPar,
          hasScore: stat.hasScore,
          scoreStr: stat.hasScore ? this._formatLeaderboardDiff(scoreFields.toPar) : '-',
          scoreClass: stat.hasScore ? this._resolveLeaderboardTotalClass(scoreFields.toPar) : 'score-even',
          thru: stat.hasScore ? this._resolveLeaderboardThruLabel(stat.thru) : '-',
          isCounting: false,
          _thruValue: stat.thru
        });
      });
    });

    const teamOrder = teamGroups
      .map((team) => (team && team.id != null ? String(team.id).trim() : ''))
      .filter(Boolean);
    const orderedTeams = teamOrder
      .map((teamId) => teamMap[teamId])
      .filter(Boolean);
    const extraTeams = Object.keys(teamMap)
      .filter((teamId) => teamOrder.indexOf(teamId) < 0)
      .map((teamId) => teamMap[teamId]);
    const teams = orderedTeams.concat(extraTeams)
      .filter((team) => isTeamCompetitionEnabled ? team.players.length > 0 : true);
    if (!teams.length) return [];
    if (!isTeamCompetitionEnabled) {
      return teams.map((team, teamIndex) => {
        const sortedPlayers = team.players.slice().sort((a, b) => {
          if (a.hasScore !== b.hasScore) return a.hasScore ? -1 : 1;
          if (a.toPar !== b.toPar) return a.toPar - b.toPar;
          return String(a.name || '').localeCompare(String(b.name || ''));
        });
        const rankedPlayers = this._buildCompetitionRanking(sortedPlayers, (player) => (
          player && player.hasScore === true ? player.toPar : null
        ));
        let grossTotal = 0;
        let toPar = 0;
        rankedPlayers.forEach((player) => {
          if (!(player && player.hasScore === true)) return;
          grossTotal += Number(player.grossTotal || 0);
          toPar += Number(player.toPar || 0);
        });
        return {
          pos: String(teamIndex + 1),
          teamId: team.teamId,
          teamName: team.teamName || '未命名分队',
          grossTotal: grossTotal,
          toPar: toPar,
          // 兼容：非 PK 仍不参与总分展示/排名，total 保持 0
          total: 0,
          hasScore: false,
          scoreStr: '-',
          scoreClass: 'score-even',
          scoringPlayersCount: 0,
          players: rankedPlayers.map((player) => {
            const out = Object.assign({}, player, {
              isCounting: false
            });
            delete out._thruValue;
            return out;
          })
        };
      });
    }
    const sortedTeams = teams.map((team, teamIndex) => {
      const sortedPlayers = team.players.slice().sort((a, b) => {
        if (a.hasScore !== b.hasScore) return a.hasScore ? -1 : 1;
        if (a.toPar !== b.toPar) return a.toPar - b.toPar;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      let toPar = 0;
      let grossTotal = 0;
      const scoringPlayersCount = Math.min(
        configuredTopN,
        sortedPlayers.filter((player) => player && player.hasScore === true).length
      );
      const players = sortedPlayers.map((player, index) => {
        const isCounting = player.hasScore === true && index < scoringPlayersCount;
        if (isCounting) {
          toPar += Number(player.toPar || 0);
          grossTotal += Number(player.grossTotal || 0);
        }
        const out = Object.assign({}, player, {
          isCounting: isCounting
        });
        delete out._thruValue;
        return out;
      });
      const rankedPlayers = this._buildCompetitionRanking(players, (player) => (
        player && player.hasScore === true ? player.toPar : null
      ));
      return {
        teamId: team.teamId,
        teamName: team.teamName || '未命名分队',
        grossTotal: grossTotal,
        toPar: toPar,
        total: toPar,
        hasScore: scoringPlayersCount > 0,
        scoreStr: scoringPlayersCount > 0 ? this._formatLeaderboardDiff(toPar) : '-',
        scoreClass: scoringPlayersCount > 0 ? this._resolveLeaderboardTotalClass(toPar) : 'score-even',
        scoringPlayersCount: scoringPlayersCount,
        players: rankedPlayers,
        _sortIndex: teamIndex
      };
    }).sort((a, b) => {
      if (a.hasScore !== b.hasScore) return a.hasScore ? -1 : 1;
      if (a.toPar !== b.toPar) return a.toPar - b.toPar;
      return a._sortIndex - b._sortIndex;
    });
    const rankedTeams = this._buildCompetitionRanking(sortedTeams, (team) => (
      team && team.hasScore === true ? team.toPar : null
    ));
    return rankedTeams.map((team) => {
      const out = Object.assign({}, team);
      delete out._sortIndex;
      return out;
    });
  },

  /**
   * 净杆分队榜：成员 net 来自 match.peoriaResult.results；
   * 按球队规则取前 N 名 net 累加为 teamNetScore，升序排名。
   */
  _buildNetTeamLeaderboardView(match) {
    const teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    if (teamGroups.length < 2) return [];

    const formatNet = (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return '-';
      return Math.round(n * 100) % 100 === 0
        ? String(Math.round(n))
        : String(Math.round(n * 100) / 100);
    };

    const results =
      match && match.peoriaResult && Array.isArray(match.peoriaResult.results)
        ? match.peoriaResult.results
        : [];
    const netByPlayerId = {};
    results.forEach((item) => {
      if (!item || item.playerId == null) return;
      const id = String(item.playerId).trim();
      if (!id) return;
      const net = Number(item.net);
      if (!Number.isFinite(net)) return;
      netByPlayerId[id] = net;
    });

    const rules = match && match.scoringRules;
    const competition = rules && rules.teamCompetition;
    const isTeamCompetitionEnabled = !!(competition && competition.enabled === true);
    const configuredTopN = isTeamCompetitionEnabled
      ? Math.max(1, parseInt(competition.topN, 10) || 1)
      : 0;

    const teamMap = this._buildTeamLeaderboardTeamMap(match);
    const playerLookup = this._buildGroupPlayerLookup(match);
    const playerTeamLookup = this._buildLeaderboardPlayerTeamLookup(match);
    const groups = match && Array.isArray(match.groups) ? match.groups : [];

    groups.forEach((group) => {
      const displayPlayers = this.hydrateGroupDisplayPlayers(group, playerLookup);
      const displayMap = {};
      displayPlayers.forEach((displayPlayer) => {
        if (displayPlayer && displayPlayer.userId) displayMap[String(displayPlayer.userId)] = displayPlayer;
      });
      (Array.isArray(group && group.players) ? group.players : []).forEach((player) => {
        const playerId = this._resolveAnyPlayerId(player);
        if (!playerId) return;
        const teamRef = this._resolveLeaderboardPlayerTeam(player, playerId, playerLookup, playerTeamLookup);
        if (!teamRef.teamId) return;
        if (!teamMap[teamRef.teamId]) {
          teamMap[teamRef.teamId] = {
            teamId: teamRef.teamId,
            teamName: teamRef.teamName || '未命名分队',
            grossTotal: 0,
            toPar: 0,
            total: 0,
            scoringPlayersCount: 0,
            players: []
          };
        } else if (!teamMap[teamRef.teamId].teamName && teamRef.teamName) {
          teamMap[teamRef.teamId].teamName = teamRef.teamName;
        }

        const lookup = playerLookup[playerId] || {};
        const display = displayMap[playerId] || {};
        const genderDisplay = playerManage.getGenderDisplay(
          Object.assign({}, lookup, player, { gender: lookup.gender || display.gender || player.gender })
        );
        const scorePlayerId = this._resolveSlotScorePlayerId(player, playerId);
        const name =
          display.displayName ||
          display.name ||
          lookup.nickname ||
          this._resolveAnyPlayerNickname(player) ||
          '未知球员';
        const avatar =
          display.avatar ||
          mockAvatars.resolveAvatar(lookup.avatar || player.avatar || player.avatarUrl || '', playerId);

        // THRU：仅用于展示；净杆成绩本身只读 peoriaResult
        const stat = this._computeMatchLeaderboardStats(match, group, player, playerId);
        const filledHoles = Number(stat && stat.thru) || 0;
        const netRaw =
          netByPlayerId[playerId] != null
            ? netByPlayerId[playerId]
            : (scorePlayerId && netByPlayerId[scorePlayerId] != null ? netByPlayerId[scorePlayerId] : NaN);
        const hasNetScore = filledHoles === 18 && Number.isFinite(netRaw);
        const netDisplay = hasNetScore ? formatNet(netRaw) : '-';

        teamMap[teamRef.teamId].players.push({
          playerId: playerId,
          userId: playerId,
          scorePlayerId: scorePlayerId,
          groupId: group && group.groupId ? String(group.groupId) : '',
          scorecardKey: teamRef.teamId + ':' + playerId,
          name: name,
          nickname: name,
          avatar: avatar,
          gender: genderDisplay.gender || '',
          genderIcon: genderDisplay.icon,
          genderClass: genderDisplay.className,
          country: player.country || '',
          age: player.age || '',
          flag: player.flag || '',
          filledHoles: filledHoles,
          net: hasNetScore ? netRaw : null,
          hasNetScore: hasNetScore,
          hasScore: hasNetScore,
          netScoreDisplay: netDisplay,
          scoreStr: netDisplay,
          scoreClass: 'score-even',
          thru: filledHoles > 0 ? this._resolveLeaderboardThruLabel(filledHoles) : '-',
          isCounting: false,
          grossTotal: 0,
          toPar: 0,
          total: hasNetScore ? netRaw : 0,
          diff: 0
        });
      });
    });

    const teamOrder = teamGroups
      .map((team) => (team && team.id != null ? String(team.id).trim() : ''))
      .filter(Boolean);
    const orderedTeams = teamOrder.map((teamId) => teamMap[teamId]).filter(Boolean);
    const extraTeams = Object.keys(teamMap)
      .filter((teamId) => teamOrder.indexOf(teamId) < 0)
      .map((teamId) => teamMap[teamId]);
    const teams = orderedTeams.concat(extraTeams)
      .filter((team) => (isTeamCompetitionEnabled ? team.players.length > 0 : true));
    if (!teams.length) return [];

    if (!isTeamCompetitionEnabled) {
      return teams.map((team, teamIndex) => {
        const sortedPlayers = team.players.slice().sort((a, b) => {
          if (a.hasNetScore !== b.hasNetScore) return a.hasNetScore ? -1 : 1;
          if (a.hasNetScore && b.hasNetScore && a.net !== b.net) return Number(a.net) - Number(b.net);
          return String(a.name || '').localeCompare(String(b.name || ''));
        });
        const rankedPlayers = this._buildCompetitionRanking(sortedPlayers, (player) => (
          player && player.hasNetScore === true ? player.net : null
        ));
        return {
          pos: String(teamIndex + 1),
          teamId: team.teamId,
          teamName: team.teamName || '未命名分队',
          teamNetScore: null,
          playerCountLabel: String(rankedPlayers.length),
          thru: '-',
          grossTotal: 0,
          toPar: 0,
          total: 0,
          hasScore: false,
          scoreStr: '-',
          netScoreDisplay: '-',
          scoreClass: 'score-even',
          scoringPlayersCount: 0,
          players: rankedPlayers.map((player) => Object.assign({}, player, { isCounting: false }))
        };
      });
    }

    const sortedTeams = teams.map((team, teamIndex) => {
      const sortedPlayers = team.players.slice().sort((a, b) => {
        if (a.hasNetScore !== b.hasNetScore) return a.hasNetScore ? -1 : 1;
        if (a.hasNetScore && b.hasNetScore && a.net !== b.net) return Number(a.net) - Number(b.net);
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      const scoringPlayersCount = Math.min(
        configuredTopN,
        sortedPlayers.filter((player) => player && player.hasNetScore === true).length
      );
      let teamNetScore = 0;
      let countingAssigned = 0;
      const players = sortedPlayers.map((player) => {
        const isCounting = player.hasNetScore === true && countingAssigned < scoringPlayersCount;
        if (isCounting) {
          teamNetScore += Number(player.net);
          countingAssigned += 1;
        }
        return Object.assign({}, player, { isCounting: isCounting });
      });
      const rankedPlayers = this._buildCompetitionRanking(players, (player) => (
        player && player.hasNetScore === true ? player.net : null
      ));
      const netDisplay = scoringPlayersCount > 0 ? formatNet(teamNetScore) : '-';
      return {
        teamId: team.teamId,
        teamName: team.teamName || '未命名分队',
        teamNetScore: scoringPlayersCount > 0 ? teamNetScore : null,
        playerCountLabel: String(scoringPlayersCount),
        thru: '-',
        grossTotal: 0,
        toPar: 0,
        total: scoringPlayersCount > 0 ? teamNetScore : 0,
        hasScore: scoringPlayersCount > 0,
        scoreStr: netDisplay,
        netScoreDisplay: netDisplay,
        scoreClass: 'score-even',
        scoringPlayersCount: scoringPlayersCount,
        players: rankedPlayers,
        _sortIndex: teamIndex
      };
    }).sort((a, b) => {
      if (a.hasScore !== b.hasScore) return a.hasScore ? -1 : 1;
      if (a.hasScore && b.hasScore && a.teamNetScore !== b.teamNetScore) {
        return Number(a.teamNetScore) - Number(b.teamNetScore);
      }
      return a._sortIndex - b._sortIndex;
    });

    const rankedTeams = this._buildCompetitionRanking(sortedTeams, (team) => (
      team && team.hasScore === true ? team.teamNetScore : null
    ));
    return rankedTeams.map((team) => {
      const out = Object.assign({}, team);
      delete out._sortIndex;
      return out;
    });
  },

  _buildTeamLeaderboardTeamMap(match) {
    const map = {};
    const teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    teamGroups.forEach((team, index) => {
      const teamId = team && team.id != null ? String(team.id).trim() : '';
      if (!teamId) return;
      map[teamId] = {
        teamId: teamId,
        teamName: String((team && team.name) || '').trim() || ('分队' + (index + 1)),
        grossTotal: 0,
        toPar: 0,
        total: 0,
        scoringPlayersCount: 0,
        players: []
      };
    });
    return map;
  },

  _buildLeaderboardPlayerTeamLookup(match) {
    const map = {};
    this._collectRegisterPlayerSources(match).forEach((users) => {
      users.forEach((user) => {
        const playerId = this._resolveAnyPlayerId(user);
        if (!playerId) return;
        const teamId = playerManage.resolveMatchTeamId(user);
        if (!teamId) return;
        const entry = {
          teamId: teamId,
          teamName: playerManage.resolveMatchTeamName(user),
          matchTeamId: user.matchTeamId != null ? String(user.matchTeamId).trim() : '',
          matchTeamName: user.matchTeamName != null ? String(user.matchTeamName).trim() : '',
          groupId: user.groupId != null ? String(user.groupId).trim() : '',
          groupName: user.groupName != null ? String(user.groupName).trim() : ''
        };
        [user.userId, user.playerId, user.id, user.uid, user.openid, playerId]
          .map((value) => (value != null ? String(value).trim() : ''))
          .filter(Boolean)
          .forEach((id) => { if (!map[id]) map[id] = entry; });
      });
    });
    return map;
  },

  _resolveLeaderboardPlayerTeam(player, playerId, playerLookup, playerTeamLookup) {
    const registerTeam = playerTeamLookup && playerId ? playerTeamLookup[playerId] : null;
    if (registerTeam && registerTeam.teamId) return registerTeam;

    const lookup = playerLookup && playerId ? playerLookup[playerId] : null;
    const lookupTeamId = playerManage.resolveMatchTeamId(lookup);
    if (lookupTeamId) {
      return {
        teamId: lookupTeamId,
        teamName: playerManage.resolveMatchTeamName(lookup)
      };
    }

    const directTeamId = playerManage.resolveMatchTeamId(player);
    if (directTeamId) {
      return {
        teamId: directTeamId,
        teamName: playerManage.resolveMatchTeamName(player)
      };
    }
    return { teamId: '', teamName: '' };
  },

  _resolveLeaderboardDefaultMode(match) {
    return this._leaderboardViewToMode(this._resolveLeaderboardDefaultView(match));
  },

  _isTeamCompetitionEnabled(match) {
    const rules = match && match.scoringRules;
    const competition = rules && rules.teamCompetition;
    return !!(competition && competition.enabled === true);
  },

  _resolveLeaderboardViewOptions(match) {
    const teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    return teamGroups.length >= 2 ? ['team', 'all', 'male', 'female'] : ['all', 'male', 'female'];
  },

  _resolveLeaderboardDefaultView(match) {
    const options = this._resolveLeaderboardViewOptions(match);
    const rules = match && match.scoringRules;
    const competition = rules && rules.teamCompetition;
    if (options.indexOf('team') >= 0 && competition && competition.enabled === true) return 'team';
    return 'all';
  },

  _leaderboardViewToMode(view) {
    return view === 'team' ? 'team' : 'player';
  },

  _leaderboardModeToView(mode) {
    return mode === 'team' ? 'team' : 'all';
  },

  _buildLeaderboardViewLabel(scoreType, view) {
    const scoreText = scoreType === 'net' ? '净杆' : '总杆';
    const viewMap = {
      team: '分队',
      all: '全部',
      male: '男子',
      female: '女子'
    };
    return scoreText + ' · ' + (viewMap[view] || viewMap.all);
  },

  /** 领先榜「净杆」入口：仅当 peoriaResult 已生成时可点 */
  _hasLeaderboardNetScore(match) {
    if (!match || !match.peoriaResult) return false;
    return match.peoriaResult.status === 'generated';
  },

  refreshGroupsDerived() {
    this._syncTournamentHoleLayout();
    groupsStore.ensureInitialized();
    const matchId = this.data.matchId || '';
    let teeGroups = [];
    let match = null;
    if (demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
      teeGroups = groupsStore.getTeeGroupsView();
    } else {
      match = matchId ? teamMatchStore.getMatchById(matchId) : null;
      if (match && Array.isArray(match.groups) && match.groups.length) {
        const playerLookup = this._buildGroupPlayerLookup(match);
        teeGroups = teeSheetManage.buildTeeSheetTabView(match, {
          playerLookup: playerLookup,
          source: 'match'
        });
        teeGroups = this._mergeTeeSheetPlayerTeeInfo(match, teeGroups, playerLookup);
      } else {
        teeGroups = [];
      }
    }
    this.setData({
      teeGroups: teeGroups,
      leaderboard: this._buildLeaderboardViewForView(match, this.data.leaderboardView || 'all'),
      teamLeaderboard: this._buildTeamLeaderboardView(match),
      leaderboardViewLabel: this._buildLeaderboardViewLabel(
        this.data.leaderboardScoreType || 'gross',
        this.data.leaderboardView || 'all'
      )
    });
  },

  _mergeTeeSheetPlayerTeeInfo(match, teeGroups, playerLookup) {
    const groups = match && Array.isArray(match.groups) ? match.groups : [];
    const lookup = playerLookup || {};
    const displayByGroup = {};
    groups.forEach((group, index) => {
      const groupId = group && group.groupId != null ? String(group.groupId) : ('group-' + (index + 1));
      const playerMap = {};
      this.hydrateGroupDisplayPlayers(group, lookup).forEach((player) => {
        if (!player || !player.userId) return;
        playerMap[String(player.userId)] = player;
      });
      displayByGroup[groupId] = playerMap;
    });
    return (Array.isArray(teeGroups) ? teeGroups : []).map((card) => {
      const groupId = card && (card.groupId || card.id) != null ? String(card.groupId || card.id) : '';
      const playerMap = displayByGroup[groupId] || {};
      const players = (Array.isArray(card && card.players) ? card.players : []).map((player) => {
        const playerId = player && (player.userId || player.playerId) != null
          ? String(player.userId || player.playerId)
          : '';
        const display = playerMap[playerId] || {};
        return Object.assign({}, player, {
          tee: display.tee || player.tee || '',
          teeText: display.teeText || player.teeText || '',
          teeLabel: display.teeLabel || player.teeLabel || '',
          teeCode: display.teeCode || player.teeCode || '',
          teeMarkerClass: display.teeMarkerClass || player.teeMarkerClass || ''
        });
      });
      return Object.assign({}, card, { players: players });
    });
  },

  refreshLeaderboard() {
    const matchId = this.data.matchId || '';
    const match = matchId && !demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)
      ? teamMatchStore.getMatchById(matchId)
      : null;
    this.setData({
      leaderboard: this._buildLeaderboardViewForView(match, this.data.leaderboardView || 'all'),
      teamLeaderboard: this._buildTeamLeaderboardView(match),
      leaderboardViewLabel: this._buildLeaderboardViewLabel(
        this.data.leaderboardScoreType || 'gross',
        this.data.leaderboardView || 'all'
      )
    });
  },

  openLeaderboardSettingSheet() {
    const matchId = this.data.matchId || '';
    const match = matchId ? this._resolveMatchData(matchId) : null;
    const netAvailable = this._hasLeaderboardNetScore(match);
    const currentScoreType =
      this.data.leaderboardScoreType === 'net' && netAvailable ? 'net' : 'gross';
    this.setData({
      showMoreSheet: false,
      moreFabExpanded: false,
      showLeaderboardSettingSheet: true,
      leaderboardNetScoreAvailable: netAvailable,
      draftLeaderboardView: this.data.leaderboardView || 'all',
      draftLeaderboardScoreType: currentScoreType
    });
  },

  /** peoria 页「查看领先榜」：直接进入净杆 Tab */
  openNetLeaderboardFromPeoria() {
    const matchId = this.data.matchId || '';
    const match = matchId ? this._resolveMatchData(matchId) : null;
    const netAvailable = this._hasLeaderboardNetScore(match);
    if (!netAvailable) {
      wx.showToast({ title: '净杆尚未生成', icon: 'none' });
      return;
    }
    const view = this.data.leaderboardView || 'all';
    this.setData({
      showMoreSheet: false,
      moreFabExpanded: false,
      showLeaderboardSettingSheet: false,
      activeTab: 'leaderboard',
      leaderboardScoreType: 'net',
      leaderboardNetScoreAvailable: true,
      leaderboardViewLabel: this._buildLeaderboardViewLabel('net', view),
      expandedTeamId: '',
      openIndex: -1,
      openScorecard: null
    }, () => {
      this.refreshLeaderboard();
    });
  },

  closeLeaderboardSettingSheet() {
    this.setData({ showLeaderboardSettingSheet: false });
  },

  onDraftLeaderboardViewSelect(e) {
    const view = e && e.currentTarget && e.currentTarget.dataset
      ? String(e.currentTarget.dataset.view || '')
      : '';
    const disabled = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.disabled === true || e.currentTarget.dataset.disabled === 'true'
      : false;
    if (disabled) return;
    if (this.data.leaderboardViewOptions.indexOf(view) < 0) return;
    this.setData({ draftLeaderboardView: view });
  },

  onDraftLeaderboardScoreTypeSelect(e) {
    const type = e && e.currentTarget && e.currentTarget.dataset
      ? String(e.currentTarget.dataset.type || '')
      : '';
    const disabled = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.disabled === true || e.currentTarget.dataset.disabled === 'true'
      : false;
    if (disabled) return;
    if (type !== 'gross' && type !== 'net') return;
    this.setData({ draftLeaderboardScoreType: type });
  },

  confirmLeaderboardSettingSheet() {
    const view = this.data.leaderboardViewOptions.indexOf(this.data.draftLeaderboardView) >= 0
      ? this.data.draftLeaderboardView
      : (this.data.leaderboardDefaultView || 'all');
    const scoreType = this.data.draftLeaderboardScoreType === 'net' && this.data.leaderboardNetScoreAvailable
      ? 'net'
      : 'gross';
    this.setData({
      showLeaderboardSettingSheet: false,
      activeTab: 'leaderboard',
      leaderboardView: view,
      leaderboardMode: this._leaderboardViewToMode(view),
      leaderboardScoreType: scoreType,
      leaderboardViewLabel: this._buildLeaderboardViewLabel(scoreType, view),
      expandedTeamId: '',
      openIndex: -1,
      openScorecard: null
    }, () => {
      this.refreshLeaderboard();
    });
  },

  toggleTeamLeaderboardRow(e) {
    const teamId = e.currentTarget.dataset.teamId != null
      ? String(e.currentTarget.dataset.teamId)
      : '';
    const next = this.data.expandedTeamId === teamId ? '' : teamId;
    this._activeTeamLeaderboardPlayer = null;
    this.setData({
      expandedTeamId: next,
      openIndex: -1,
      openScorecard: null
    });
  },

  // 点击领先榜球员行：在该行下方展开/收起逐洞详情（一次仅一个）
  toggleScorecard(e) {
    if (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.mode === 'team') {
      const key = e.currentTarget.dataset.index != null ? String(e.currentTarget.dataset.index) : '';
      const next = this.data.openIndex === key ? -1 : key;
      this._activeTeamLeaderboardPlayer =
        next === -1 ? null : (e.currentTarget.dataset.player || null);
      this.setData({ openIndex: next });
      this.updateOpenScorecard();
      return;
    }
    const idx = Number(e.currentTarget.dataset.index);
    const next = this.data.openIndex === idx ? -1 : idx;
    this.setData({ openIndex: next });
    this.refreshLeaderboard();
    this.updateOpenScorecard();
  },

  // 逐洞详情数据：真实球队赛优先读取 match.scoreData，演示/旧数据继续回退 groupsStore
  updateOpenScorecard() {
    const idx = this.data.openIndex;
    const row = this.data.leaderboardMode === 'team'
      ? this._resolveTeamLeaderboardPlayerRow(idx)
      : (idx >= 0 ? this.data.leaderboard[idx] : null);
    if (!row) {
      this.setData({ openScorecard: null });
      return;
    }
    const matchId = this.data.matchId;
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const scorecard = this._resolveTeamMatchScorecard(match, row);
    if (scorecard) {
      console.log('[scorecard-source]', {
        source: scorecard.scorecardStatus === 'not_started' ? 'teamMatch.not_started' : 'teamMatch.scoreData',
        matchId,
        groupId: row.groupId,
        playerId: row.playerId
      });
      this.setData({ openScorecard: scorecard });
      return;
    }
    console.log('[scorecard-source]', {
      source: 'groupsStore',
      playerId: row.playerId
    });
    this.setData({
      openScorecard: groupsStore.buildPlayerScorecard(row.playerId, this.data.scoreDisplayMode)
    });
  },

  _resolveTeamLeaderboardPlayerRow(scorecardKey) {
    if (!scorecardKey || scorecardKey === -1) return null;
    const key = String(scorecardKey);
    if (
      this._activeTeamLeaderboardPlayer &&
      this._activeTeamLeaderboardPlayer.scorecardKey === key
    ) {
      return this._activeTeamLeaderboardPlayer;
    }
    const teams = Array.isArray(this.data.teamLeaderboard) ? this.data.teamLeaderboard : [];
    for (let i = 0; i < teams.length; i++) {
      const players = Array.isArray(teams[i] && teams[i].players) ? teams[i].players : [];
      const player = players.find((item) => item && item.scorecardKey === key);
      if (player) return player;
    }
    return null;
  },

  noop() {},

  /* ===== 更多功能面板 ===== */
  applyMoreAccess() {
    const isRegistering = !!(this.data.matchStatus && this.data.matchStatus.isRegistering);
    if (isRegistering) {
      const section = FEATURE_SECTION_REGISTERING;
      const access = MORE_ACCESS;
      const permSet = access.permissions || [];
      const match = this.data.matchId ? teamMatchStore.getMatchById(this.data.matchId) : null;
      const user = gameStore.getCurrentUser() || {};
      const userId = String(user.userId || '');
      const registrationStatus = this._normalizeRegistrationStatus(match);
      const visible = (scope, permission) => {
        if (access.isPrivilegedUser || scope === 'common') return true;
        if (permission === 'edit_half') {
          return permSet.indexOf('edit_match') >= 0 || permSet.indexOf('edit_half') >= 0;
        }
        if (tempAdminPermission.hasTempAdminPermission(match, userId, permission)) return true;
        return permSet.indexOf(permission) >= 0;
      };
      const lifecyclePermissionMap = {
        cancel_match: true,
        close_registration: true,
        start_match: true
      };
      const visibleRegisteringPermissionFeatures = REGISTERING_FEATURES_PERMISSION
        .filter((f) => visible('permission', f.permission))
        .map((f) => {
          if (f.permission !== 'close_registration') return Object.assign({}, f);
          return Object.assign({}, f, {
            glyph: registrationStatus === 'closed' ? '🔓' : '🔒',
            label: registrationStatus === 'closed' ? '打开报名' : '关闭报名',
            tone: registrationStatus === 'closed' ? 'success' : 'state'
          });
        });
      const permissionFeatures = visibleRegisteringPermissionFeatures.filter(
        (f) => !(f && lifecyclePermissionMap[f.permission])
      );
      const lifecycleActions = visibleRegisteringPermissionFeatures
        .filter((f) => f && lifecyclePermissionMap[f.permission])
        .map((f) => {
          if (f.permission === 'cancel_match') return Object.assign({}, f, { tone: 'danger' });
          if (f.permission === 'start_match') return Object.assign({}, f, { tone: 'success' });
          return Object.assign({}, f);
        })
        .sort((a, b) => {
          const order = { cancel_match: 1, close_registration: 2, start_match: 3 };
          return (order[a.permission] || 99) - (order[b.permission] || 99);
        });
      const split = splitPermissionFeatures(permissionFeatures);
      this.setData({
        featuresCommon: REGISTERING_FEATURES_COMMON.filter((f) => visible('common', f.permission)),
        featuresPermission: split.featuresPermission,
        featuresPermissionFooterPad: split.featuresPermissionFooterPad,
        featuresPermissionFooter: split.featuresPermissionFooter,
        lifecycleActions: lifecycleActions,
        featuresSectionCommonMain: section.commonMain,
        featuresSectionCommonSub: section.commonSub,
        featuresSectionPermissionMain: section.permissionMain,
        featuresSectionPermissionSub: section.permissionSub
      });
      return;
    }
    const access = MORE_ACCESS;
    const permSet = access.permissions || [];
    const match = this.data.matchId ? teamMatchStore.getMatchById(this.data.matchId) : null;
    const user = gameStore.getCurrentUser() || {};
    const userId = String(user.userId || '');
    const visible = (scope, permission) => {
      if (access.isPrivilegedUser || scope === 'common') return true;
      // 修改半场与修改比赛同权
      if (permission === 'edit_half') {
        return permSet.indexOf('edit_match') >= 0 || permSet.indexOf('edit_half') >= 0;
      }
      if (tempAdminPermission.hasTempAdminPermission(match, userId, permission)) return true;
      return permSet.indexOf(permission) >= 0;
    };
    const section = FEATURE_SECTION_DEFAULT;
    const split = splitPermissionFeatures(
      FEATURES_PERMISSION.filter((f) => visible('permission', f.permission))
    );
    this.setData({
      featuresCommon: FEATURES_COMMON.filter((f) => visible('common', f.permission)),
      featuresPermission: split.featuresPermission,
      featuresPermissionFooterPad: split.featuresPermissionFooterPad,
      featuresPermissionFooter: split.featuresPermissionFooter,
      lifecycleActions: [],
      featuresSectionCommonMain: section.commonMain,
      featuresSectionCommonSub: section.commonSub,
      featuresSectionPermissionMain: section.permissionMain,
      featuresSectionPermissionSub: section.permissionSub
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
    if (permission === 'export_groups') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      wx.showToast({ title: '分组表导出功能开发中', icon: 'none' });
      return;
    }
    if (permission === 'cancel_match') {
      // 与普通球局 / game hub 一致：先关 M 面板，再确认取消
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this._promptCancelMatch();
      return;
    }
    if (permission === 'edit_match') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      const matchId = this.data.matchId || '';
      if (!matchId) {
        wx.showToast({ title: '未找到比赛信息', icon: 'none' });
        return;
      }
      wx.navigateTo({
        url:
          '/subpackages/create/pages/team-internal/index?mode=edit&matchId=' +
          encodeURIComponent(matchId),
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
    if (permission === 'edit_groups') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this.onOpenGroupEditor();
      return;
    }
    if (permission === 'manage_payment' || permission === 'fees') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this.openPaymentSheet();
      return;
    }
    if (permission === 'close_registration') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this.toggleRegistrationStatus();
      return;
    }
    if (permission === 'start_match') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this.startTournamentMatch();
      return;
    }
    if (permission === 'finish_match') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this._promptFinishMatch();
      return;
    }
    if (this.data.matchStatus && this.data.matchStatus.isRegistering) {
      if (permission === 'register_for_other') {
        const registerClosed =
          !(this.data.registerPermission && this.data.registerPermission.isOpen);
        this.setData({ showMoreSheet: false, moreFabExpanded: false });
        if (registerClosed) {
          this._showRegistrationClosedModal();
          return;
        }
        this.openRegisterForOtherSheet();
        return;
      }
      if (permission === 'invite_friends_register') {
        this.setData({ showMoreSheet: false, moreFabExpanded: false });
        this.shareTournamentInvite();
        return;
      }
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      const all = REGISTERING_FEATURES_COMMON.concat(REGISTERING_FEATURES_PERMISSION);
      const item = all.find((f) => f.permission === permission);
      wx.showToast({ title: item ? item.label : '功能开发中', icon: 'none' });
      return;
    }
    if (permission === 'theme') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this.openStyleSheet();
      return;
    }
    if (permission === 'leaderboard') {
      this.openLeaderboardSettingSheet();
      return;
    }
    if (permission === 'stats') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      const matchId = this.data.matchId || '';
      wx.navigateTo({
        url:
          '/pages/tournament/stats/index' +
          (matchId ? '?matchId=' + encodeURIComponent(matchId) : ''),
        fail: () => wx.showToast({ title: '统计页面尚未注册', icon: 'none' })
      });
      return;
    }
    if (permission === 'feedback') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      const matchId = this.data.matchId || '';
      wx.navigateTo({
        url:
          '/pages/feedback/index?source=tournament' +
          (matchId ? '&matchId=' + encodeURIComponent(matchId) : ''),
        fail: () => wx.showToast({ title: '反馈页面尚未注册', icon: 'none' })
      });
      return;
    }
    if (permission === 'net_score') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      const matchId = this.data.matchId || '';
      if (!matchId) {
        wx.showToast({ title: '未找到比赛信息', icon: 'none' });
        return;
      }
      const match = this._resolveMatchData(matchId);
      if (match && match.peoriaResult && match.peoriaResult.status === 'generated') {
        wx.showToast({
          title: '净杆已生成，请点击“领先榜”按钮查看。',
          icon: 'none',
          duration: 2500
        });
        return;
      }
      wx.navigateTo({
        url: '/pages/tournament/peoria/index?matchId=' + encodeURIComponent(matchId),
        fail: () => wx.showToast({ title: '净杆配置页尚未注册', icon: 'none' })
      });
      return;
    }
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  /**
   * 结束比赛（M 面板 finish_match）
   * 写入 match.status="finished" + finishedAt，不改 score/peoria 等。
   */
  _promptFinishMatch() {
    const matchId = this.data.matchId || '';
    if (
      !matchId ||
      demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId) ||
      !teamMatchStore.getMatchById(matchId)
    ) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '未找到比赛信息', icon: 'none' });
      return;
    }
    if (String(match.status || '').trim().toLowerCase() === 'finished') {
      wx.showToast({ title: '比赛已经结束。', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '结束比赛',
      content:
        '确认结束本场比赛？\n\n结束后：\n- 比赛进入最终状态\n- 可生成净杆成绩\n- 领先榜作为最终成绩展示',
      cancelText: '取消',
      confirmText: '确认',
      confirmColor: '#ce9224',
      success: (res) => {
        if (res.confirm) this._confirmFinishMatch();
      }
    });
  },

  _confirmFinishMatch() {
    const matchId = this.data.matchId || '';
    if (!matchId) return;
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '未找到比赛信息', icon: 'none' });
      return;
    }
    if (String(match.status || '').trim().toLowerCase() === 'finished') {
      wx.showToast({ title: '比赛已经结束。', icon: 'none' });
      return;
    }
    match.status = 'finished';
    match.finishedAt = Date.now();
    match.updatedAt = Date.now();
    teamMatchStore.saveMatch(match);
    this.refreshMatchData(matchId);
    this.applyMoreAccess();
    wx.showToast({ title: '比赛已结束', icon: 'success' });
  },

  /**
   * 取消比赛确认框（文案 / 按钮与普通球局 score、game/hub 一致）
   */
  _promptCancelMatch() {
    const matchId = this.data.matchId || '';
    if (
      !matchId ||
      demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId) ||
      !teamMatchStore.getMatchById(matchId)
    ) {
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
        if (res.confirm) this._confirmCancelMatch();
      }
    });
  },

  /**
   * 确认取消：硬删除球队赛（对齐普通球局 purgeGameCompletely），toast 后回首页「我的」
   */
  _confirmCancelMatch() {
    const matchId = this.data.matchId;
    if (!matchId) return;
    const removed = gameLifecycle.purgeTeamMatchCompletely(matchId);
    if (!removed) {
      wx.showToast({ title: '比赛不存在或已删除', icon: 'none' });
      return;
    }
    this.setData({
      matchId: '',
      showMoreSheet: false,
      moreFabExpanded: false
    });
    wx.showToast({ title: '比赛已取消', icon: 'success', duration: 1500 });
    setTimeout(() => {
      wx.reLaunch({ url: '/pages/home/index?tab=my' });
    }, 300);
  },

  /* ===== 本场临时管理员（权限管理 · 扫码申请制） ===== */
  _resolveTempAdminGrantableFeatures() {
    const isRegistering = !!(this.data.matchStatus && this.data.matchStatus.isRegistering);
    const source = isRegistering ? REGISTERING_FEATURES_PERMISSION : FEATURES_PERMISSION;
    return tempAdminPermission.buildGrantableFeatures(source);
  },

  openTempAdminSheet() {
    const matchId = this.data.matchId || '';
    if (!matchId || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    const grantable = this._resolveTempAdminGrantableFeatures();
    this._tempAdminGrantableFeatures = grantable;
    this._adminDraftDemotions = [];
    const adminAccess = tempAdminAccess.normalizeTempAdminAccess(match.tempAdminAccess);
    const caddieAccess = caddieScoringAccess.normalizeCaddieScoringAccess(
      match.caddieScoringAccess
    );
    this.setData({
      tempAdminSheetVisible: true,
      adminQrHasQr: !!(adminAccess && adminAccess.qrCodeUrl && adminAccess.enabled),
      adminQrUrl: adminAccess && adminAccess.qrCodeUrl ? adminAccess.qrCodeUrl : '',
      adminQrGenerating: false,
      adminQrExpanded: !adminAccess,
      expandedAdminUserId: '',
      adminQrAdminList: (tempAdminAccess.listAdminQrAdmins(match.tempAdmins, grantable) || []).map(
        (item) => Object.assign({}, item, { expanded: false })
      ),
      caddieScoringHasQr: !!(caddieAccess && caddieAccess.qrCodeUrl && caddieAccess.enabled),
      caddieScoringQrUrl: caddieAccess && caddieAccess.qrCodeUrl ? caddieAccess.qrCodeUrl : '',
      caddieScoringGenerating: false,
      caddieQrExpanded: !caddieAccess,
      caddieScorerList: caddieScoringAccess.listCaddieScorers(match.tempAdmins),
      caddieManageSheetVisible: false,
      caddieManageTarget: null
    });
  },

  /* ===== 选手管理（本场报名快照，不写回用户资料） ===== */
  _canOpenPlayerManage(match) {
    const user = gameStore.getCurrentUser() || {};
    return playerManage.canManagePlayers(
      match,
      user.userId,
      !!(MORE_ACCESS && MORE_ACCESS.isPrivilegedUser)
    );
  },

  openPlayerManageSheet() {
    const matchId = this.data.matchId || '';
    if (!matchId || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    if (!this._canOpenPlayerManage(match)) {
      wx.showToast({ title: '暂无选手管理权限', icon: 'none' });
      return;
    }
    if (this._playerManageSearchTimer) {
      clearTimeout(this._playerManageSearchTimer);
      this._playerManageSearchTimer = null;
    }
    const draft = playerManage.buildPlayerManageDraft(match);
    this._playerManageDraft = draft;
    const teamOptions = draft.teamOptions || [];
    this.setData(
      {
        playerManageSheetVisible: true,
        playerManageTeamOptions: teamOptions,
        playerManageSearchKeyword: '',
        playerManageTeamFilter: playerManage.TEAM_FILTER_ALL,
        playerManageTeamFilterLabel: '全部分队',
        expandedPlayerManageUserId: '',
        playerTeamPickVisible: false,
        playerManageFilterPickVisible: false
      },
      () => this._syncPlayerManageDisplay()
    );
  },

  _syncPlayerManageDisplay(extra) {
    const draft = this._playerManageDraft;
    const currentUserId = String((gameStore.getCurrentUser() || {}).userId || '').trim();
    const playersForDisplay = (draft && Array.isArray(draft.players) ? draft.players : []).map((item) => {
      const userId = String((item && item.userId) || '').trim();
      let contactRemark = '';
      if (currentUserId && userId) {
        try {
          const contact = contactStore.findContact(currentUserId, userId);
          contactRemark = contact && contact.remarkName ? String(contact.remarkName) : '';
        } catch (e) {
          contactRemark = '';
        }
      }
      return Object.assign({}, item, { contactRemark: contactRemark });
    });
    const view = playerManage.buildPlayerManageDisplay(playersForDisplay, {
      keyword: this.data.playerManageSearchKeyword,
      teamFilter: this.data.playerManageTeamFilter,
      groups: draft ? draft.groupsDraft : [],
      expandedUserId: this.data.expandedPlayerManageUserId
    });
    const displayUsers = (view.list || []).map((item) => {
      return Object.assign({}, item, { contactRemark: item.contactRemark || '' });
    });
    const patch = Object.assign(
      {
        playerManageDisplayUsers: displayUsers,
        playerManageCountTip: view.countTip,
        playerManageEmptyText: view.emptyText
      },
      extra || {}
    );
    this.setData(patch);
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
        // 用户取消拨打不额外报错
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

  onRemovePlayerFromRegister(e) {
    const userId = String((e.currentTarget.dataset && e.currentTarget.dataset.userid) || '');
    if (!userId || !this._playerManageDraft) return;
    const row = (this._playerManageDraft.players || []).find(
      (item) => String((item && item.userId) || '') === userId
    );
    if (!row) {
      wx.showToast({ title: '选手不存在', icon: 'none' });
      return;
    }
    const grouped = playerManage.isPlayerFormalGrouped(
      row,
      playerManage.collectFormalGroupedUserIds(this._playerManageDraft.groupsDraft)
    );
    const name = playerManage.resolveMatchNickname(row) || '该球员';
    const content = grouped
      ? '该球员当前已有出发安排。\n\n移除报名后，该球员将不再属于本场报名名单。\n\n如需调整出发安排，请前往“修改分组”或记分页“添加/删除”。'
      : '确定要将【' + name + '】从本场比赛报名列表中移除吗？';
    wx.showModal({
      title: '移除报名',
      content: content,
      cancelText: '取消',
      confirmText: '确认移除',
      confirmColor: '#dc2626',
      success: (res) => {
        if (!res.confirm) return;
        this._playerManageDraft = Object.assign({}, this._playerManageDraft, {
          players: (this._playerManageDraft.players || []).filter(
            (item) => String((item && item.userId) || '') !== userId
          )
        });
        const nextExpanded =
          String(this.data.expandedPlayerManageUserId || '') === userId
            ? ''
            : String(this.data.expandedPlayerManageUserId || '');
        this.setData({ expandedPlayerManageUserId: nextExpanded }, () =>
          this._syncPlayerManageDisplay()
        );
        wx.showToast({ title: '已移除报名，保存后生效', icon: 'none' });
      }
    });
  },

  savePlayerManageSheet() {
    const matchId = this.data.matchId || '';
    if (!matchId || !this._playerManageDraft) {
      this.closePlayerManageSheet();
      return;
    }
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    const result = playerManage.commitPlayerManageDraft(match, this._playerManageDraft);
    if (!result || !result.ok) {
      wx.showToast({ title: '保存失败', icon: 'none' });
      return;
    }
    teamMatchStore.saveMatch(match);
    this.closePlayerManageSheet();
    // 刷新报名 / 分组展示
    this.loadMatch(matchId);
    this._refreshFormalGroupsDisplay();
    wx.showToast({ title: '选手信息已保存', icon: 'success' });
  },

  /* ===== 收费管理（极简实收登记） ===== */
  _buildPaymentLogOperator(match) {
    const user = gameStore.getCurrentUser() || {};
    const userId = String(user.userId || user.id || '').trim();
    const creatorId = String((match && (match.createdBy || match.creatorId)) || '').trim();
    return {
      userId: userId,
      operatorId: userId,
      operatorName: user.nickname || user.displayName || user.name || userId || '管理员',
      operatorRole: userId && creatorId && userId === creatorId ? 'creator' : 'admin'
    };
  },

  _canOpenPaymentSheet(match) {
    const user = gameStore.getCurrentUser() || {};
    return paymentManage.canManagePayment(
      match,
      user.userId,
      !!(MORE_ACCESS && MORE_ACCESS.isPrivilegedUser)
    );
  },

  openPaymentSheet() {
    const matchId = this.data.matchId || '';
    if (!matchId || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    if (!this._canOpenPaymentSheet(match)) {
      wx.showToast({ title: '暂无收费管理权限', icon: 'none' });
      return;
    }
    const paymentUsers = paymentManage.buildPaymentDraftUsers(match);
    this.setData({
      showPaymentSheet: true,
      paymentUsers: paymentUsers,
      paymentFilter: paymentManage.FILTER_ALL,
      expandedPaymentUserId: ''
    });
    this.refreshPaymentManageView(paymentManage.FILTER_ALL);
  },

  closePaymentSheet() {
    this.setData({
      showPaymentSheet: false,
      paymentUsers: [],
      paymentFilteredUsers: [],
      paymentFilter: paymentManage.FILTER_ALL,
      expandedPaymentUserId: '',
      paymentSummary: paymentManage.calculatePaymentSummary([])
    });
  },

  refreshPaymentManageView(forceFilter, callback) {
    const source = Array.isArray(this.data.paymentUsers)
      ? this.data.paymentUsers
      : [];
    const rawFilter = forceFilter || this.data.paymentFilter || 'all';
    const filter = rawFilter === 'paid' || rawFilter === 'unpaid'
      ? rawFilter
      : 'all';
    let filtered = source;
    if (filter === 'paid') {
      filtered = source.filter((user) => user && user.paymentConfirmed === true);
    }
    if (filter === 'unpaid') {
      filtered = source.filter((user) => !(user && user.paymentConfirmed === true));
    }
    const displayUsers = filtered.map((user) => Object.assign({}, user, {
      expanded: String(user.stableUserId || '') === String(this.data.expandedPaymentUserId || '')
    }));
    this.setData({
      paymentFilter: filter,
      paymentFilteredUsers: displayUsers,
      paymentSummary: paymentManage.calculatePaymentSummary(source)
    }, callback);
  },

  setPaymentFilterAndRefresh(filter) {
    const nextFilter = filter === 'paid' || filter === 'unpaid' ? filter : 'all';
    this.setData({
      paymentFilter: nextFilter,
      expandedPaymentUserId: ''
    });
    this.refreshPaymentManageView(nextFilter);
  },

  showAllPaymentUsers() {
    this.setPaymentFilterAndRefresh('all');
  },

  showPaidPaymentUsers() {
    this.setPaymentFilterAndRefresh('paid');
  },

  showUnpaidPaymentUsers() {
    this.setPaymentFilterAndRefresh('unpaid');
  },

  onPaymentUserCardTap(e) {
    const userId = String((e.currentTarget.dataset && e.currentTarget.dataset.userid) || '');
    if (!userId) return;
    const current = String(this.data.expandedPaymentUserId || '');
    this.setData({
      expandedPaymentUserId: current === userId ? '' : userId
    }, () => this.refreshPaymentManageView());
  },

  _findPaymentUserIndex(users, userId) {
    const targetId = String(userId || '');
    return (Array.isArray(users) ? users : []).findIndex((user, index) => {
      const stableId = paymentManage.resolveStableUserId(user, 'payment-user-' + (index + 1));
      return (
        String(stableId || '') === targetId ||
        String(user && user.stableUserId || '') === targetId ||
        String(user && user.userId || '') === targetId ||
        String(user && user.id || '') === targetId
      );
    });
  },

  patchPaymentUser(userId, patch) {
    const targetId = String(userId || '');
    if (!targetId) return;
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const registerUsers =
      match && match.registerInfo && Array.isArray(match.registerInfo.users)
        ? match.registerInfo.users
        : [];
    const rawIndex = this._findPaymentUserIndex(registerUsers, targetId);
    if (!match || rawIndex < 0) {
      wx.showToast({ title: '用户数据缺失', icon: 'none' });
      return;
    }
    const beforeUser = JSON.parse(JSON.stringify(registerUsers[rawIndex] || {}));
    const nextRawUser = Object.assign({}, registerUsers[rawIndex], patch || {});
    if (nextRawUser.paymentConfirmed === false) {
      nextRawUser.paidAmount = '';
      nextRawUser.cashPaidAmount = '';
      nextRawUser.diamondPaidAmount = '';
    }
    if (Object.prototype.hasOwnProperty.call(nextRawUser, 'cashPaidAmount')) {
      nextRawUser.paidAmount = nextRawUser.cashPaidAmount;
    }
    registerUsers[rawIndex] = nextRawUser;
    match.registerInfo.users = registerUsers;
    match.registerInfo.totalCount = registerUsers.length;

    const displayUser = paymentManage.normalizePaymentUserForDisplay(nextRawUser);
    const logs = paymentManage.buildPaymentDiffLogs({
      beforeUsers: [beforeUser],
      afterUsers: [displayUser],
      operator: this._buildPaymentLogOperator(match)
    });
    if (logs.length) {
      paymentManage.appendPaymentLogs(match, logs);
    }
    teamMatchStore.saveMatch(match);

    const source = Array.isArray(this.data.paymentUsers) ? this.data.paymentUsers : [];
    const displayIndex = this._findPaymentUserIndex(source, targetId);
    const nextUsers = displayIndex >= 0
      ? source.map((user, index) => (index === displayIndex ? displayUser : user))
      : paymentManage.buildPaymentDraftUsers(match);
    const paymentConfirmed = nextRawUser.paymentConfirmed === true;
    const registerInfo = this.data.registerInfo && typeof this.data.registerInfo === 'object'
      ? this.data.registerInfo
      : null;
    const registerUsersForDisplay = registerInfo && Array.isArray(registerInfo.users)
      ? registerInfo.users
      : [];
    const registerInfoIndex = this._findPaymentUserIndex(registerUsersForDisplay, targetId);
    const nextRegisterInfo = registerInfo && registerInfoIndex >= 0
      ? Object.assign({}, registerInfo, {
        users: registerUsersForDisplay.map((user, index) =>
          index === registerInfoIndex
            ? Object.assign({}, user, { paymentConfirmed: paymentConfirmed })
            : user
        )
      })
      : registerInfo;
    const displayRegisterUsers = Array.isArray(this.data.registerDisplayUsers)
      ? this.data.registerDisplayUsers
      : [];
    const registerDisplayIndex = this._findPaymentUserIndex(displayRegisterUsers, targetId);
    const nextRegisterDisplayUsers = registerDisplayIndex >= 0
      ? displayRegisterUsers.map((user, index) =>
        index === registerDisplayIndex
          ? Object.assign({}, user, { paymentConfirmed: paymentConfirmed })
          : user
      )
      : displayRegisterUsers;
    this.setData({
      paymentUsers: nextUsers,
      registerInfo: nextRegisterInfo,
      registerDisplayUsers: nextRegisterDisplayUsers
    }, () => {
      this.refreshPaymentManageView(this.data.paymentFilter || 'all');
    });
  },

  onPaymentConfirmedTap(e) {
    const userId = String((e.currentTarget.dataset && e.currentTarget.dataset.userid) || '');
    const confirmed = String((e.currentTarget.dataset && e.currentTarget.dataset.confirmed) || '') === 'true';
    if (!userId) return;
    const paymentUsers = Array.isArray(this.data.paymentUsers) ? this.data.paymentUsers : [];
    const target = paymentUsers.find((user) => String(user && user.stableUserId) === userId);
    if (!target || target.paymentConfirmed === confirmed) return;
    const before = target.paymentConfirmed;
    const after = confirmed;

    if (before === true && after === false) {
      wx.showModal({
        title: '确认改为未收？',
        content: '改为未收将清除已登记金额，但保留备注。',
        confirmText: '继续',
        cancelText: '取消',
        success: (res) => {
          if (!res.confirm) {
            return;
          }
          this.patchPaymentUser(userId, {
            paymentConfirmed: false,
            paidAmount: '',
            cashPaidAmount: '',
            diamondPaidAmount: ''
          });
        },
        fail: (err) => {
          console.error('[payment-unpaid-modal-fail]', err);
        }
      });
      return;
    }

    if (confirmed) {
      this.patchPaymentUser(userId, { paymentConfirmed: true });
      return;
    }
  },

  onPaymentPaidAmountBlur(e) {
    const userId = String((e.currentTarget.dataset && e.currentTarget.dataset.userid) || '');
    const value = e && e.detail ? e.detail.value : '';
    if (!userId) return;
    const amount = value === '' || value === null || value === undefined
      ? ''
      : paymentManage.toAmount(value);
    const patch = {
      cashPaidAmount: amount
    };
    if (amount !== '') patch.paymentConfirmed = true;
    this.patchPaymentUser(userId, patch);
  },

  onPaymentRemarkBlur(e) {
    const userId = String((e.currentTarget.dataset && e.currentTarget.dataset.userid) || '');
    const value = e && e.detail ? e.detail.value : '';
    if (!userId) return;
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const registerUsers =
      match && match.registerInfo && Array.isArray(match.registerInfo.users)
        ? match.registerInfo.users
        : [];
    const rawIndex = this._findPaymentUserIndex(registerUsers, userId);
    const beforeUser = rawIndex >= 0 ? registerUsers[rawIndex] : {};
    const beforeRemark = beforeUser && beforeUser.paymentRemark != null
      ? String(beforeUser.paymentRemark)
      : '';
    const afterRemark = String(value || '');
    if (beforeRemark === afterRemark) return;
    this.patchPaymentUser(userId, {
      paymentRemark: afterRemark
    });
  },

  /* ===== 出发管理（组级 teeTime / startHole，draft 机制） ===== */
  _canOpenTeeSheetManage(match) {
    const user = gameStore.getCurrentUser() || {};
    return teeSheetManage.canManageTeeSheet(
      match,
      user.userId,
      !!(MORE_ACCESS && MORE_ACCESS.isPrivilegedUser)
    );
  },

  _buildTeeSheetPlayerLookup(match) {
    return this._buildGroupPlayerLookup(match);
  },

  openTeeSheetManageSheet() {
    const matchId = this.data.matchId || '';
    if (!matchId || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    if (!this._canOpenTeeSheetManage(match)) {
      wx.showToast({ title: '暂无出发管理权限', icon: 'none' });
      return;
    }
    const timeOptions = teeSheetManage.buildTimeOptions();
    const holeOpts = teeSheetManage.buildHoleOptions();
    const draft = teeSheetManage.buildTeeSheetDraft(
      match,
      this._buildTeeSheetPlayerLookup(match)
    );
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
    const matchId = this.data.matchId || '';
    if (!matchId || !this._teeSheetDraft) {
      this.closeTeeSheetManageSheet();
      return;
    }
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    if (!this._teeSheetDraft.hasGroups) {
      this.closeTeeSheetManageSheet();
      return;
    }
    const result = teeSheetManage.commitTeeSheetDraft(match, this._teeSheetDraft);
    if (!result || !result.ok) {
      wx.showToast({ title: '保存失败', icon: 'none' });
      return;
    }
    teamMatchStore.saveMatch(match);
    this.closeTeeSheetManageSheet();
    // 用刚写入的 match 立即刷新分组卡 + 出发表（避免仅关弹屏不回显）
    this._refreshTeeSheetDisplayFromMatch(match);
    wx.showToast({ title: '出发安排已保存', icon: 'success' });
  },

  /** 出发管理保存后：同步 groupsTabCards / teeGroups */
  _refreshTeeSheetDisplayFromMatch(match) {
    if (!match) {
      this.refreshMatchData(this.data.matchId);
      this.refreshGroupsDerived();
      return;
    }
    const playerLookup = this._buildGroupPlayerLookup(match);
    const teeGroups = Array.isArray(match.groups) && match.groups.length
      ? this._mergeTeeSheetPlayerTeeInfo(
          match,
          teeSheetManage.buildTeeSheetTabView(match, {
            playerLookup: playerLookup,
            source: 'match'
          }),
          playerLookup
        )
      : [];
    this.setData(
      Object.assign(this._buildGroupsTabStatePatch(match), {
        teeGroups: teeGroups
      })
    );
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
    const matchId = this.data.matchId || '';
    if (!matchId || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    const user = gameStore.getCurrentUser() || {};
    const prev = tempAdminAccess.normalizeTempAdminAccess(match.tempAdminAccess);
    this.setData({ adminQrGenerating: true });
    const access = tempAdminAccess.createTempAdminAccess({
      source: 'team_match',
      matchId: matchId,
      createdBy: String(user.userId || '')
    });
    if (prev && Array.isArray(prev.claimedBy)) {
      access.claimedBy = prev.claimedBy.slice();
    }
    match.tempAdminAccess = access;
    teamMatchStore.saveMatch(match);
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
    const matchId = this.data.matchId || '';
    if (!matchId || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    const user = gameStore.getCurrentUser() || {};
    this.setData({ caddieScoringGenerating: true });
    const access = caddieScoringAccess.createCaddieScoringAccess({
      source: 'team_match',
      matchId: matchId,
      createdBy: String(user.userId || '')
    });
    match.caddieScoringAccess = access;
    teamMatchStore.saveMatch(match);
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
    const matchId = this.data.matchId || '';
    if (!matchId || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
      this.closeTempAdminSheet();
      return;
    }
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    const grantable =
      this._tempAdminGrantableFeatures || this._resolveTempAdminGrantableFeatures();
    tempAdminAccess.commitAdminQrDraft(
      match,
      this.data.adminQrAdminList,
      this._adminDraftDemotions || [],
      grantable
    );
    teamMatchStore.saveMatch(match);
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
        const matchId = this.data.matchId || '';
        const match = teamMatchStore.getMatchById(matchId);
        const result = tempAdminAccess.removeAdminQrFromDraftList(
          this.data.adminQrAdminList,
          userId,
          match
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
        const matchId = this.data.matchId || '';
        const match = teamMatchStore.getMatchById(matchId);
        if (!match) {
          wx.showToast({ title: '赛事数据缺失', icon: 'none' });
          return;
        }
        const result = caddieScoringAccess.removeCaddieScoringPermission(match, userId);
        if (!result || !result.ok) {
          wx.showToast({ title: '移除失败', icon: 'none' });
          return;
        }
        teamMatchStore.saveMatch(match);
        this.setData({
          caddieManageSheetVisible: false,
          caddieManageTarget: null,
          caddieScorerList: caddieScoringAccess.listCaddieScorers(match.tempAdmins)
        });
        wx.showToast({ title: '已移除记分权限', icon: 'success' });
      }
    });
  },

  openRegisterForOtherSheet() {
    if (!(this.data.registerPermission && this.data.registerPermission.isOpen)) {
      this._showRegistrationClosedModal();
      return;
    }
    this.setData({
      registerForOtherSourceOptions: this._buildRegisterForOtherSourceOptions(),
      registerForOtherSheetVisible: true
    });
  },

  closeRegisterForOtherSheet() {
    this.setData({ registerForOtherSheetVisible: false });
  },

  /** Patch 7：球队成员渠道按管理员 / 参赛球队成员解禁 */
  _buildRegisterForOtherSourceOptions() {
    const match = this.data.matchId ? teamMatchStore.getMatchById(this.data.matchId) : null;
    const canTeamMembers = resolveCanUseTeamMembersChannel(match);
    return REGISTER_FOR_OTHER_SOURCE_OPTIONS.map((opt) => {
      if (opt.key === 'team_members') {
        return Object.assign({}, opt, {
          disabled: !canTeamMembers,
          locked: !canTeamMembers
        });
      }
      return Object.assign({}, opt, { disabled: false, locked: false });
    });
  },

  onRegisterForOtherSourceSelect(e) {
    const key = e.detail && e.detail.key;
    this.setData({ registerForOtherSheetVisible: false });
    if (key === 'friends') {
      this._openRegisterForOtherFriendsPicker();
      return;
    }
    if (key === 'manual') {
      this.openRegisterForOtherManualSheet();
      return;
    }
    if (key === 'team_members') {
      const match = this.data.matchId ? teamMatchStore.getMatchById(this.data.matchId) : null;
      if (!resolveCanUseTeamMembersChannel(match)) {
        wx.showToast({ title: REGISTER_FOR_OTHER_TEAM_MEMBERS_DENIED_TOAST, icon: 'none' });
        return;
      }
      this._openRegisterForOtherTeamMembersPicker();
    }
  },

  onRegisterForOtherSourceDenied(e) {
    const key = e.detail && e.detail.key;
    if (key === 'team_members') {
      wx.showToast({ title: REGISTER_FOR_OTHER_TEAM_MEMBERS_DENIED_TOAST, icon: 'none' });
    }
  },

  /**
   * 好友选择（proxy_register）：
   * - URL 传 mode + matchId + operatorUserId
   * - EventChannel 传 registerUsers（当前赛事报名名单）
   * - 返回 addedPlayers / removedPlayers
   * - Patch 5A/5B/5C：生成 commit plan → 分队确认后统一写盘
   */
  _openRegisterForOtherFriendsPicker() {
    const matchId = this.data.matchId || '';
    const operator = gameStore.getCurrentUser() || {};
    const operatorUserId = String(operator.userId || '');
    const registerUsers = ((this.data.registerInfo && this.data.registerInfo.users) || []).slice();
    const url =
      '/subpackages/player/pages/friends/index?mode=' +
      encodeURIComponent('proxy_register') +
      '&matchId=' +
      encodeURIComponent(matchId) +
      '&operatorUserId=' +
      encodeURIComponent(operatorUserId) +
      '&slotId=' +
      encodeURIComponent('register-for-other');
    wx.navigateTo({
      url: url,
      success: (res) => {
        try {
          if (res && res.eventChannel && res.eventChannel.emit) {
            res.eventChannel.emit('proxyRegisterContext', {
              registerUsers: registerUsers,
              operatorUserId: operatorUserId,
              matchId: matchId
            });
          }
        } catch (e) {
          /* ignore */
        }
      },
      events: {
        friendsSelected: (payload) => {
          this._onProxyFriendsSelected(payload || {});
        }
      },
      fail: (err) =>
        wx.showToast({
          title: '跳转失败：' + (err && err.errMsg ? err.errMsg : ''),
          icon: 'none'
        })
    });
  },

  /**
   * Patch 7：球队成员选择（proxy_register_team）
   * - 列表数据源：teamDirectory.getTeamMembers(match.teamId)
   * - 三态权威：store.registerInfo.users（选择页内读取，避免 EventChannel 竞态）
   */
  _openRegisterForOtherTeamMembersPicker() {
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const teamId = match && match.teamId ? String(match.teamId).trim() : '';
    if (!teamId) {
      wx.showToast({ title: '本赛事未关联球队', icon: 'none' });
      return;
    }
    const operator = gameStore.getCurrentUser() || {};
    const operatorUserId = String(operator.userId || '');
    const registerUsers = ((this.data.registerInfo && this.data.registerInfo.users) || []).slice();
    const url =
      '/subpackages/player/pages/friends/index?mode=' +
      encodeURIComponent('proxy_register_team') +
      '&matchId=' +
      encodeURIComponent(matchId) +
      '&operatorUserId=' +
      encodeURIComponent(operatorUserId) +
      '&teamId=' +
      encodeURIComponent(teamId) +
      '&slotId=' +
      encodeURIComponent('register-for-other-team');
    wx.navigateTo({
      url: url,
      success: (res) => {
        try {
          if (res && res.eventChannel && res.eventChannel.emit) {
            res.eventChannel.emit('proxyRegisterContext', {
              registerUsers: registerUsers,
              operatorUserId: operatorUserId,
              matchId: matchId,
              teamId: teamId
            });
          }
        } catch (e) {
          /* ignore */
        }
      },
      events: {
        friendsSelected: (payload) => {
          this._onProxyFriendsSelected(payload || {});
        }
      },
      fail: (err) =>
        wx.showToast({
          title: '跳转失败：' + (err && err.errMsg ? err.errMsg : ''),
          icon: 'none'
        })
    });
  },

  /**
   * Patch 5A/5B/5C/7：处理好友/球队成员页差异返回。
   * - removedPlayers → remove plan
   * - addedPlayers → 打开「选择代表分队」；确定后生成 add plan 并统一写盘
   * - 仅取消（无新增）→ _promptOrApplyProxyCommitPlan（已有出发安排则先确认）
   */
  _onProxyFriendsSelected(payload) {
    const data = payload || {};
    const matchId = this.data.matchId || '';
    const addedPlayers = Array.isArray(data.addedPlayers) ? data.addedPlayers : [];
    const removedPlayers = Array.isArray(data.removedPlayers) ? data.removedPlayers : [];
    const mode = data.mode === 'proxy_register_team' ? 'proxy_register_team' : 'proxy_register';
    const pickChannel = mode === 'proxy_register_team' ? 'team_members' : 'friends';

    console.log('[register-for-other] friends diff', {
      matchId: matchId,
      mode: mode,
      addedPlayers: addedPlayers,
      removedPlayers: removedPlayers
    });

    const removePlan = this._buildProxyRemovePlan(removedPlayers);
    console.log('[register-for-other] remove plan', removePlan);

    this._proxyCommitPlan = {
      matchId: matchId,
      mode: mode,
      pickChannel: pickChannel,
      removes: removePlan.removable,
      skippedRemoves: removePlan.skipped,
      pendingAdds: addedPlayers.slice(),
      adds: [],
      skippedAdds: [],
      group: null,
      applied: false,
      saved: false
    };
    console.log('[register-for-other] unified commit plan (pending)', this._proxyCommitPlan);

    // 有新增：先进分队弹窗，确定后再补全 adds 并写盘
    if (addedPlayers.length > 0) {
      this._openProxyGroupSheet(addedPlayers, pickChannel);
      return;
    }

    // 仅取消 / 无变更：若取消对象已有出发安排则先确认，再统一提交
    this._promptOrApplyProxyCommitPlan();
  },

  /**
   * 代报名写盘前：若待取消的 targetUserId 已在正式 groups 中，先弹二次确认。
   * 判断对象是被取消的好友/队员，不是当前登录用户。
   */
  _promptOrApplyProxyCommitPlan() {
    const plan = this._proxyCommitPlan;
    if (!plan) {
      this._clearProxyRegistrationTempState();
      wx.showToast({ title: '没有可更新的报名', icon: 'none' });
      return;
    }
    const removes = Array.isArray(plan.removes) ? plan.removes : [];
    if (!removes.length) {
      this._applyProxyCommitPlan();
      return;
    }
    const match = teamMatchStore.getMatchById(plan.matchId || this.data.matchId || '');
    const hasGroupedTarget = removes.some((item) => {
      const uid = String((item && item.userId) || '').trim();
      return !!(uid && match && teamMatchStore.isUserInFormalGroups(match, uid));
    });
    if (!hasGroupedTarget) {
      this._applyProxyCommitPlan();
      return;
    }
    this._pendingProxyCommitAfterConfirm = true;
    this.setData({
      registerCancelModalVisible: true,
      registerCancelModalTitle: '取消报名',
      registerCancelModalDesc: '已经被分组，是否确认取消',
      registerCancelSubmitting: false
    });
  },

  /**
   * 仅允许取消「当前用户代报名」记录：
   * source === 'proxy' && registeredBy === operatorUserId && userId 匹配
   * 禁止：self / 他人代报 / admin / 旧数据 self
   * @returns {{ removable: Array, skipped: Array }}
   */
  _buildProxyRemovePlan(removedPlayers) {
    const operator = gameStore.getCurrentUser() || {};
    const operatorUserId = String(operator.userId || '');
    const users = ((this.data.registerInfo && this.data.registerInfo.users) || []).slice();
    const byId = {};
    users.forEach((u) => {
      const id = u && u.userId != null ? String(u.userId) : '';
      if (id) byId[id] = u;
    });

    const list = Array.isArray(removedPlayers) ? removedPlayers : [];
    const removable = [];
    const skipped = [];

    list.forEach((player) => {
      const userId = String((player && (player.userId || player.playerId)) || '').trim();
      if (!userId) {
        skipped.push({
          player: player,
          reason: 'missing_userId'
        });
        return;
      }
      const registration = byId[userId];
      if (!registration) {
        skipped.push({
          userId: userId,
          player: player,
          reason: 'not_registered'
        });
        return;
      }
      const source = String(registration.source || 'self');
      const registeredBy = String(registration.registeredBy || '');
      const canRemove =
        source === 'proxy' &&
        !!operatorUserId &&
        registeredBy === operatorUserId &&
        String(registration.userId) === userId;

      if (!canRemove) {
        skipped.push({
          userId: userId,
          player: player,
          registration: {
            source: source,
            registeredBy: registeredBy,
            subjectType: registration.subjectType || ''
          },
          reason:
            source !== 'proxy'
              ? 'not_proxy'
              : registeredBy !== operatorUserId
                ? 'not_registered_by_me'
                : 'forbidden'
        });
        return;
      }

      removable.push({
        action: 'remove',
        userId: userId,
        competitionName: registration.competitionName || '',
        groupId: registration.groupId != null ? String(registration.groupId) : '',
        groupName: registration.groupName || '',
        source: 'proxy',
        registeredBy: registeredBy,
        registeredByName: registration.registeredByName || '',
        subjectType: registration.subjectType || 'other',
        pickChannel: registration.pickChannel || 'friends',
        player: player
      });
    });

    return {
      matchId: this.data.matchId || '',
      operatorUserId: operatorUserId,
      removable: removable,
      skipped: skipped,
      removableCount: removable.length,
      skippedCount: skipped.length
    };
  },

  /**
   * Patch 5B/6：根据 pendingProxyPlayers + 代表分队生成 add plan（不写盘）
   * 去重：
   * - 缺 userId → skippedAdds reason=missing_userId
   * - userId 已报名 → already_registered
   * - manual 且手机号非空且 phone 已存在 → already_registered_phone
   * @returns {{ adds: Array, skippedAdds: Array, group: {id,name} }}
   */
  _buildProxyAddPlan(players, group) {
    const operator = gameStore.getCurrentUser() || {};
    const registeredBy = String(operator.userId || '');
    let registeredByName = (operator.name && String(operator.name).trim()) || '';
    if (!registeredByName) {
      try {
        const profile = userProfileStore.loadProfile() || {};
        registeredByName =
          (profile.competitionName && String(profile.competitionName).trim()) ||
          (profile.nickname && String(profile.nickname).trim()) ||
          '';
      } catch (e) {
        registeredByName = '';
      }
    }

    const users = ((this.data.registerInfo && this.data.registerInfo.users) || []).slice();
    const existingIds = {};
    const existingPhones = {};
    users.forEach((u) => {
      const id = u && u.userId != null ? String(u.userId) : '';
      if (id) existingIds[id] = true;
      const phone = u && u.phone != null ? String(u.phone).trim() : '';
      if (phone) existingPhones[phone] = true;
    });

    const groupId = group && group.id != null ? String(group.id) : '';
    const groupName = group && group.name ? String(group.name) : '';
    const list = Array.isArray(players) ? players : [];
    const adds = [];
    const skippedAdds = [];
    const registeredAt = Date.now();
    const channelHint = String(this._proxyPickChannel || '').trim();

    list.forEach((player) => {
      const p = player || {};
      const pickChannelRaw = String(p.pickChannel || channelHint || 'friends').trim();
      const pickChannel =
        pickChannelRaw === 'manual'
          ? 'manual'
          : pickChannelRaw === 'team_members'
            ? 'team_members'
            : 'friends';
      const userId = String(p.userId || p.playerId || '').trim();
      if (!userId) {
        skippedAdds.push({
          player: player,
          reason: 'missing_userId'
        });
        return;
      }
      if (existingIds[userId]) {
        skippedAdds.push({
          userId: userId,
          player: player,
          reason: 'already_registered'
        });
        return;
      }
      const phone = p.phone != null ? String(p.phone).trim() : '';
      // Patch 6：手工添加按 phone 去重（仅 manual + 非空手机号）
      if (pickChannel === 'manual' && phone && existingPhones[phone]) {
        skippedAdds.push({
          userId: userId,
          phone: phone,
          player: player,
          reason: 'already_registered_phone'
        });
        return;
      }
      const competitionName = String(
        p.competitionName || p.name || p.realName || ''
      ).trim();
      // Patch 6：手工字段；好友路径保持空串，不改写好友语义
      let userType =
        p.userType != null && String(p.userType).trim() !== ''
          ? String(p.userType).trim()
          : 'registered';
      let realName = '';
      let remarkName = '';
      if (pickChannel === 'manual') {
        userType =
          p.userType != null && String(p.userType).trim() !== ''
            ? String(p.userType).trim()
            : phone
              ? 'phone'
              : 'guest';
        realName = String(
          p.realName != null && String(p.realName).trim() !== ''
            ? p.realName
            : competitionName
        ).trim();
        remarkName = p.remarkName != null ? String(p.remarkName) : '';
      }
      adds.push({
        action: 'add',
        userId: userId,
        userType: userType,
        identitySource:
          p.identitySource != null && String(p.identitySource).trim() !== ''
            ? String(p.identitySource).trim()
            : pickChannel === 'manual'
              ? phone
                ? 'manual_add'
                : 'derived'
              : 'proxy_add',
        nickname: p.nickname != null ? String(p.nickname) : '',
        competitionName: competitionName,
        matchNickname: p.matchNickname != null ? String(p.matchNickname) : competitionName,
        gender: p.gender != null ? String(p.gender) : '',
        avatar: p.avatar != null ? String(p.avatar) : '',
        phone: phone,
        groupId: groupId,
        groupName: groupName,
        registeredAt: registeredAt,
        source: 'proxy',
        registeredBy: registeredBy,
        registeredByName: registeredByName,
        subjectType: 'other',
        pickChannel: pickChannel,
        canSelfCancel: true,
        locked: false,
        realName: realName,
        remarkName: remarkName,
        player: player
      });
      // 同批内去重
      existingIds[userId] = true;
      if (pickChannel === 'manual' && phone) existingPhones[phone] = true;
    });

    return {
      adds: adds,
      skippedAdds: skippedAdds,
      group: { id: groupId, name: groupName },
      addCount: adds.length,
      skippedCount: skippedAdds.length
    };
  },

  openRegisterForOtherManualSheet() {
    this.setData({
      registerForOtherManualVisible: true,
      registerForOtherManualName: '',
      registerForOtherManualPhone: '',
      registerForOtherManualGender: 'male'
    });
  },

  closeRegisterForOtherManualSheet() {
    this.setData({
      registerForOtherManualVisible: false,
      registerForOtherManualName: '',
      registerForOtherManualPhone: '',
      registerForOtherManualGender: 'male'
    });
  },

  onRegisterForOtherManualNameInput(e) {
    this.setData({ registerForOtherManualName: (e.detail && e.detail.value) || '' });
  },

  onRegisterForOtherManualPhoneInput(e) {
    this.setData({ registerForOtherManualPhone: (e.detail && e.detail.value) || '' });
  },

  onRegisterForOtherManualGenderSelect(e) {
    const gender = e.currentTarget.dataset.gender;
    if (gender !== 'male' && gender !== 'female') return;
    this.setData({ registerForOtherManualGender: gender });
  },

  /**
   * Patch 6：手工添加确定 → 构建 pending 选手 → 打开「选择代表分队」
   * 手机号非空时提前按 phone 去重；写盘在分队确认后走 _applyProxyCommitPlan
   */
  confirmRegisterForOtherManualSheet() {
    const name = (this.data.registerForOtherManualName || '').trim();
    const phone = (this.data.registerForOtherManualPhone || '').trim();
    const gender = this.data.registerForOtherManualGender === 'female' ? 'female' : 'male';
    if (!name) {
      wx.showToast({ title: '请输入选手姓名', icon: 'none' });
      return;
    }
    if (phone && !/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }

    // 手机号非空：按 phone 去重（当前阶段不做后台校验）
    if (phone) {
      const users = ((this.data.registerInfo && this.data.registerInfo.users) || []).slice();
      const phoneExists = users.some((u) => String((u && u.phone) || '').trim() === phone);
      if (phoneExists) {
        wx.showToast({ title: '已报名', icon: 'none' });
        return;
      }
    }

    const ts = Date.now();
    const userType = phone ? 'phone' : 'guest';
    const identitySource = phone ? 'manual_add' : 'derived';
    const userId = phone ? 'phone_pending_' + ts : 'nonreg_' + ts;
    const player = {
      playerId: userId,
      userId: userId,
      name: name,
      competitionName: name,
      realName: name,
      remarkName: '',
      phone: phone || '',
      gender: gender,
      avatar: mockAvatars.pickMockAvatar(userId || name),
      pickChannel: 'manual',
      source: 'proxy',
      userType: userType,
      identitySource: identitySource
    };
    console.log('[register-for-other] manual player', {
      matchId: this.data.matchId || '',
      pickChannel: 'manual',
      userType: userType,
      player: player
    });
    this.closeRegisterForOtherManualSheet();
    this._openProxyGroupSheet([player], 'manual');
  },

  /** 从 match.teamGroups 解析分队选项（展示 name） */
  _resolveProxyGroupOptions() {
    const match = this.data.matchId ? teamMatchStore.getMatchById(this.data.matchId) : null;
    const groups =
      match && Array.isArray(match.teamGroups) && match.teamGroups.length
        ? match.teamGroups
        : DEFAULT_REGISTER_GROUPS;
    return (groups || [])
      .map((g, index) => ({
        id: g && g.id != null ? String(g.id) : String(index + 1),
        name: g && g.name ? String(g.name) : ''
      }))
      .filter((g) => g.name);
  },

  /**
   * Patch 3：选人完成后打开「选择代表分队」弹窗
   * @param {Array} players pendingProxyPlayers
   * @param {string} pickChannel friends | team_members | manual
   */
  _openProxyGroupSheet(players, pickChannel) {
    const list = Array.isArray(players) ? players.slice() : [];
    if (!list.length) {
      wx.showToast({ title: '未选择人员', icon: 'none' });
      return;
    }
    const options = this._resolveProxyGroupOptions();
    if (!options.length) {
      wx.showToast({ title: '暂无分队可选', icon: 'none' });
      return;
    }
    this.setData({
      pendingProxyPlayers: list,
      proxyGroupOptions: options,
      proxyGroupId: '',
      proxyGroupSheetVisible: true
    });
    this._proxyPickChannel = pickChannel || '';
  },

  selectProxyGroup(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ proxyGroupId: String(id) });
  },

  /** 取消分队选择：关弹窗 + 清空 pending / commit plan，不写盘 */
  cancelProxyGroupSheet() {
    this.setData({
      proxyGroupSheetVisible: false,
      pendingProxyPlayers: [],
      proxyGroupOptions: [],
      proxyGroupId: ''
    });
    this._proxyPickChannel = '';
    this._proxyCommitPlan = null;
  },

  _clearProxyRegistrationTempState() {
    this.setData({
      proxyGroupSheetVisible: false,
      pendingProxyPlayers: [],
      proxyGroupOptions: [],
      proxyGroupId: ''
    });
    this._proxyPickChannel = '';
  },

  /** 代报名人员 → registerInfo.users 记录（Patch 4） */
  _buildProxyRegisterUserRecord(player, group, operator) {
    const p = player || {};
    const userId = String(p.userId || p.playerId || '').trim();
    const competitionName = String(
      p.competitionName || p.name || p.realName || ''
    ).trim();
    const pickChannelRaw = String(
      p.pickChannel || this._proxyPickChannel || ''
    ).trim();
    const pickChannel =
      pickChannelRaw === 'friends' ||
      pickChannelRaw === 'manual' ||
      pickChannelRaw === 'team_members'
        ? pickChannelRaw
        : '';
    const registeredBy = String((operator && operator.userId) || '');
    const registeredByName = String(
      (operator && (operator.name || operator.competitionName || operator.nickname)) || ''
    ).trim();
    return {
      userId: userId,
      userType: p.userType != null && String(p.userType).trim() !== ''
        ? String(p.userType).trim()
        : pickChannel === 'manual'
          ? p.phone
            ? 'phone'
            : 'guest'
          : 'registered',
      identitySource: p.identitySource != null && String(p.identitySource).trim() !== ''
        ? String(p.identitySource).trim()
        : pickChannel === 'manual'
          ? p.phone
            ? 'manual_add'
            : 'derived'
          : 'proxy_add',
      nickname: p.nickname != null ? String(p.nickname) : '',
      competitionName: competitionName,
      matchNickname: p.matchNickname != null ? String(p.matchNickname) : competitionName,
      gender: p.gender != null ? String(p.gender) : '',
      avatar: p.avatar != null ? String(p.avatar) : '',
      phone: p.phone != null ? String(p.phone) : '',
      groupId: group && group.id != null ? String(group.id) : '',
      groupName: group && group.name ? String(group.name) : '',
      registeredAt: Date.now(),
      source: 'proxy',
      registeredBy: registeredBy,
      registeredByName: registeredByName,
      subjectType: 'other',
      pickChannel: pickChannel,
      canSelfCancel: true,
      locked: false
    };
  },

  /**
   * Patch 4：将 pendingProxyPlayers 写入 match.registerInfo.users（按 userId 去重）
   * @returns {{ ok: boolean, addedCount: number, skippedCount: number, groupId: string }}
   */
  _commitProxyRegistrations(players, group) {
    const match = teamMatchStore.getMatchById(this.data.matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return { ok: false, addedCount: 0, skippedCount: 0, groupId: '' };
    }
    const operator = gameStore.getCurrentUser() || {};
    const operatorId = String(operator.userId || '');
    if (!operatorId) {
      wx.showToast({ title: '用户信息缺失', icon: 'none' });
      return { ok: false, addedCount: 0, skippedCount: 0, groupId: '' };
    }
    // registeredByName：优先当前用户 name，其次资料 competitionName / nickname
    let registeredByName = (operator.name && String(operator.name).trim()) || '';
    if (!registeredByName) {
      try {
        const profile = userProfileStore.loadProfile() || {};
        registeredByName =
          (profile.competitionName && String(profile.competitionName).trim()) ||
          (profile.nickname && String(profile.nickname).trim()) ||
          '';
      } catch (e) {
        registeredByName = '';
      }
    }
    const operatorMeta = {
      userId: operatorId,
      name: registeredByName,
      competitionName: registeredByName,
      nickname: registeredByName
    };

    if (!match.registerInfo || typeof match.registerInfo !== 'object') {
      match.registerInfo = { totalCount: 0, users: [] };
    }
    if (!Array.isArray(match.registerInfo.users)) {
      match.registerInfo.users = [];
    }

    const existingIds = {};
    match.registerInfo.users.forEach((u) => {
      const id = u && u.userId != null ? String(u.userId) : '';
      if (id) existingIds[id] = true;
    });

    let addedCount = 0;
    let skippedCount = 0;
    const list = Array.isArray(players) ? players : [];
    list.forEach((player) => {
      const record = this._buildProxyRegisterUserRecord(player, group, operatorMeta);
      if (!record.userId) {
        skippedCount += 1;
        return;
      }
      if (existingIds[record.userId]) {
        skippedCount += 1;
        return;
      }
      match.registerInfo.users.push(record);
      existingIds[record.userId] = true;
      addedCount += 1;
    });

    match.registerInfo.totalCount = match.registerInfo.users.length;
    teamMatchStore.saveMatch(match);

    const groupId = group && group.id != null ? String(group.id) : '';
    const patch = this._buildRegisterStatePatch(match, groupId);
    Object.assign(patch, {
      proxyGroupSheetVisible: false,
      pendingProxyPlayers: [],
      proxyGroupOptions: [],
      proxyGroupId: ''
    });
    this._proxyPickChannel = '';
    this.setData(patch, () => {
      if (this.data.activeTab === 'register') this.measureRegisterExtTop();
    });

    return { ok: true, addedCount: addedCount, skippedCount: skippedCount, groupId: groupId };
  },

  /**
   * Patch 5C：将 this._proxyCommitPlan 正式写入 match.registerInfo.users
   * - removes：再次校验 source===proxy && registeredBy===当前用户
   * - adds：按 userId 去重后写入（不含 player 原始对象）
   * - saveMatch + 刷新报名 TAB + 清理 pending
   * @returns {{ ok: boolean, removedCount: number, addedCount: number }}
   */
  _applyProxyCommitPlan() {
    const plan = this._proxyCommitPlan;
    if (!plan) {
      this._clearProxyRegistrationTempState();
      this._proxyCommitPlan = null;
      wx.showToast({ title: '没有可更新的报名', icon: 'none' });
      return { ok: false, removedCount: 0, addedCount: 0 };
    }

    const matchId = plan.matchId || this.data.matchId || '';
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return { ok: false, removedCount: 0, addedCount: 0 };
    }

    const operator = gameStore.getCurrentUser() || {};
    const operatorUserId = String(operator.userId || '');
    if (!operatorUserId) {
      wx.showToast({ title: '用户信息缺失', icon: 'none' });
      return { ok: false, removedCount: 0, addedCount: 0 };
    }

    if (!match.registerInfo || typeof match.registerInfo !== 'object') {
      match.registerInfo = { totalCount: 0, users: [] };
    }
    if (!Array.isArray(match.registerInfo.users)) {
      match.registerInfo.users = [];
    }

    let users = match.registerInfo.users.slice();
    let removedCount = 0;
    let addedCount = 0;

    // 1) 应用 removes（再次校验：仅本人代报名可删；按 targetUserId 清理 groups/pairings）
    const removeIds = {};
    const removes = Array.isArray(plan.removes) ? plan.removes : [];
    removes.forEach((item) => {
      const userId = String((item && item.userId) || '').trim();
      if (!userId) return;
      const registration = users.find((u) => String(u && u.userId) === userId);
      if (!registration) return;
      const source = String(registration.source || 'self');
      const registeredBy = String(registration.registeredBy || '');
      const canRemove =
        source === 'proxy' &&
        registeredBy === operatorUserId &&
        String(registration.userId) === userId;
      if (canRemove) removeIds[userId] = true;
    });
    if (Object.keys(removeIds).length) {
      const before = users.length;
      users = users.filter((u) => !removeIds[String((u && u.userId) || '')]);
      removedCount = before - users.length;
      // 与自己取消报名共用清理：按 targetUserId 清空 groups 位 + pairings
      Object.keys(removeIds).forEach((uid) => {
        teamMatchStore.clearUserFromFormalGroups(match, uid);
        teamMatchStore.clearUserFromPairings(match, uid);
      });
    }

    // 2) 应用 adds（按 userId 去重；manual 另按 phone 去重；不写 player 原始对象）
    const existingIds = {};
    const existingPhones = {};
    users.forEach((u) => {
      const id = u && u.userId != null ? String(u.userId) : '';
      if (id) existingIds[id] = true;
      const phone = u && u.phone != null ? String(u.phone).trim() : '';
      if (phone) existingPhones[phone] = true;
    });
    const adds = Array.isArray(plan.adds) ? plan.adds : [];
    adds.forEach((item) => {
      const userId = String((item && item.userId) || '').trim();
      if (!userId || existingIds[userId]) return;
      const pickChannel =
        String((item && item.pickChannel) || '').trim() === 'manual'
          ? 'manual'
          : String((item && item.pickChannel) || '').trim() === 'team_members'
            ? 'team_members'
            : 'friends';
      const phone = item.phone != null ? String(item.phone).trim() : '';
      // Patch 6：手工添加写盘前再次按 phone 去重
      if (pickChannel === 'manual' && phone && existingPhones[phone]) return;
      const record = {
        userId: userId,
        userType: item.userType != null && String(item.userType).trim() !== ''
          ? String(item.userType).trim()
          : 'registered',
        identitySource: item.identitySource != null ? String(item.identitySource) : 'proxy_add',
        nickname: item.nickname != null ? String(item.nickname) : '',
        competitionName: item.competitionName != null ? String(item.competitionName) : '',
        matchNickname: item.matchNickname != null ? String(item.matchNickname) : (item.competitionName != null ? String(item.competitionName) : ''),
        gender: item.gender != null ? String(item.gender) : '',
        avatar: item.avatar != null ? String(item.avatar) : '',
        phone: phone,
        groupId: item.groupId != null ? String(item.groupId) : '',
        groupName: item.groupName != null ? String(item.groupName) : '',
        registeredAt: item.registeredAt != null ? item.registeredAt : Date.now(),
        source: item.source || 'proxy',
        registeredBy: item.registeredBy != null ? String(item.registeredBy) : '',
        registeredByName: item.registeredByName != null ? String(item.registeredByName) : '',
        subjectType: item.subjectType || 'other',
        pickChannel: pickChannel,
        canSelfCancel: item.canSelfCancel !== false,
        locked: !!item.locked
      };
      // Patch 6：手工添加写入 userType / realName / remarkName
      if (pickChannel === 'manual') {
        record.userType = item.userType != null ? String(item.userType) : '';
        record.identitySource = item.identitySource != null ? String(item.identitySource) : 'manual_add';
        record.realName = item.realName != null ? String(item.realName) : '';
        record.remarkName = item.remarkName != null ? String(item.remarkName) : '';
      }
      users.push(record);
      existingIds[userId] = true;
      if (pickChannel === 'manual' && phone) existingPhones[phone] = true;
      addedCount += 1;
    });

    // 3) totalCount + saveMatch
    match.registerInfo.users = users;
    match.registerInfo.totalCount = users.length;
    teamMatchStore.saveMatch(match);

    console.log('[register-for-other] apply commit plan', {
      matchId: matchId,
      removedCount: removedCount,
      addedCount: addedCount,
      totalCount: match.registerInfo.totalCount
    });

    // 4) 刷新报名 TAB + 分组 TAB + 清理 pending / plan
    const preferredGroup =
      (plan.group && plan.group.id) || this.data.activeRegisterSubTab || '';
    const patch = Object.assign(
      {},
      this._buildRegisterStatePatch(match, preferredGroup),
      this._buildGroupsTabStatePatch(match),
      {
        proxyGroupSheetVisible: false,
        pendingProxyPlayers: [],
        proxyGroupOptions: [],
        proxyGroupId: '',
        registerCancelModalVisible: false,
        registerCancelSubmitting: false
      }
    );
    this._proxyPickChannel = '';
    this._proxyCommitPlan = null;
    this._pendingProxyCommitAfterConfirm = false;
    this.setData(patch, () => {
      if (this.data.activeTab === 'register') this.measureRegisterExtTop();
      if (this.data.activeTab === 'groups') this.computeGroupsPanelMinHeight();
    });

    // 5) toast
    if (removedCount > 0 || addedCount > 0) {
      wx.showToast({ title: '代报名已更新', icon: 'success' });
    } else {
      wx.showToast({ title: '没有可更新的报名', icon: 'none' });
    }

    return { ok: true, removedCount: removedCount, addedCount: addedCount };
  },

  /**
   * 确定分队：
   * - friends / team_members / manual → add plan → _applyProxyCommitPlan 写盘
   */
  confirmProxyGroupSheet() {
    const groupId = String(this.data.proxyGroupId || '');
    const options = this.data.proxyGroupOptions || [];
    const group = options.find((g) => String(g.id) === groupId);
    if (!group) {
      wx.showToast({ title: '请选择分队', icon: 'none' });
      return;
    }
    const players = this.data.pendingProxyPlayers || [];
    if (!players.length) {
      wx.showToast({ title: '未选择人员', icon: 'none' });
      this._clearProxyRegistrationTempState();
      return;
    }

    const channelRaw = String(this._proxyPickChannel || '').trim();
    const pickChannel =
      channelRaw === 'manual'
        ? 'manual'
        : channelRaw === 'team_members'
          ? 'team_members'
          : 'friends';

    // 生成 add plan → 统一写盘
    const addPlan = this._buildProxyAddPlan(players, group);
    console.log('[register-for-other] add plan', addPlan);

    // 手工添加：手机号已报名时优先提示「已报名」
    if (
      pickChannel === 'manual' &&
      !addPlan.addCount &&
      (addPlan.skippedAdds || []).some((s) => s && s.reason === 'already_registered_phone')
    ) {
      this._clearProxyRegistrationTempState();
      this._proxyCommitPlan = null;
      wx.showToast({ title: '已报名', icon: 'none' });
      return;
    }

    const prev = this._proxyCommitPlan || {};
    this._proxyCommitPlan = {
      matchId: prev.matchId || this.data.matchId || '',
      mode: prev.mode || (pickChannel === 'team_members' ? 'proxy_register_team' : 'proxy_register'),
      pickChannel: pickChannel,
      removes: Array.isArray(prev.removes) ? prev.removes : [],
      skippedRemoves: Array.isArray(prev.skippedRemoves) ? prev.skippedRemoves : [],
      pendingAdds: Array.isArray(prev.pendingAdds) ? prev.pendingAdds : players.slice(),
      adds: addPlan.adds,
      skippedAdds: addPlan.skippedAdds,
      group: addPlan.group,
      applied: false,
      saved: false
    };
    console.log('[register-for-other] unified commit plan (before apply)', this._proxyCommitPlan);
    this._promptOrApplyProxyCommitPlan();
  },

  /**
   * 邀请好友报名：微信分享入口（阶段占位）
   * 已登录用户可用；与 registrationStatus 无关（关闭报名后仍可邀请）
   */
  shareTournamentInvite() {
    const matchId = this.data.matchId || '';
    const match = this.data.match || {};
    const title = match.titleMain || match.roundName || '球队赛';
    console.log('[invite-friends-register] share tournament invite', {
      matchId: matchId,
      title: title,
      registrationStatus: (this.data.registerPermission && this.data.registerPermission.registrationStatus) || ''
    });
    this._inviteShareFromPanel = true;
    try {
      wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
    } catch (e) { /* ignore */ }
    wx.showToast({ title: '请点击右上角分享给好友', icon: 'none' });
  },

  onShareAppMessage() {
    const matchId = this.data.matchId || '';
    const match = this.data.match || {};
    const title = match.titleMain || match.roundName || '球队赛';
    if (this._inviteShareFromPanel) {
      this._inviteShareFromPanel = false;
    }
    return {
      title: '邀请你报名：' + title,
      path: '/pages/tournament/detail/index?matchId=' + encodeURIComponent(matchId)
    };
  },

  closeHalfSheet() {
    this.setData({ halfSheetVisible: false });
  },

  onHalfCourseConfirmed() {
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    this.setData({
      halfSheetVisible: false,
      courseName: (match && match.courseName) || groupsStore.getCourseName()
    });
    if (matchId) {
      this.refreshMatchData(matchId);
      this.refreshGroupsDerived();
      wx.nextTick(() => this.updateOpenScorecard());
    }
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
