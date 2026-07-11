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
const partnerConfigUtil = require('../../../utils/partnerConfig.js');
const eventSponsorConfig = require('../../../utils/eventSponsorConfig.js');
const bannerConfig = require('../../../utils/bannerConfig.js');
const teamMatchStore = require('../../../utils/teamMatchStore.js');
const demoJiaobeiMatch = require('../../../utils/demoJiaobeiMatch.js');
const gameStore = require('../../../utils/gameStore.js');
const userProfileStore = require('../../../utils/userProfileStore.js');
const teamDirectory = require('../../../utils/teamDirectory.js');
const playerDirectory = require('../../../utils/playerDirectory.js');
const tPosition = require('../../../utils/tPosition.js');

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
  statusLabel: '',
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
  { permission: 'poster', glyph: '🪪', label: '海报' },
  { permission: 'feedback', glyph: '💬', label: '反馈' },
  { permission: 'theme', glyph: '🎨', label: '风格选择' },
  { permission: 'export_groups', glyph: '📋', label: '导出分组表' }
];
const FEATURES_PERMISSION = [
  { permission: 'edit_match', glyph: '✏️', label: '修改比赛', tone: '' },
  { permission: 'edit_half', glyph: '⛳', label: '修改半场', tone: '' },
  { permission: 'edit_groups', glyph: '👥', label: '修改分组', tone: '' },
  { permission: 'tee_management', glyph: '🚩', label: '出发管理', tone: '' },
  { permission: 'permission_management', glyph: '🛡️', label: '权限管理', tone: '' },
  { permission: 'players', glyph: '⚙️', label: '选手管理', tone: '' },
  { permission: 'fees', glyph: '👛', label: '收费管理', tone: '' },
  { permission: 'net_score', glyph: '🧩', label: '生成净杆', tone: '' },
  { permission: 'cancel_match', glyph: '✖', label: '取消比赛', tone: 'danger' },
  { permission: 'finish_match', glyph: '⏻', label: '结束比赛', tone: 'warning' }
];

/* 报名中球队赛 M 面板菜单（结构/图标规范与 game/hub 多组面板一致） */
const REGISTERING_FEATURES_COMMON = [
  { permission: 'register_for_other', glyph: '📝', label: '替他人报名' },
  { permission: 'invite_friends_register', glyph: '📤', label: '邀请好友报名' },
  { permission: 'export_groups', glyph: '📋', label: '导出分组表' }
];
const REGISTERING_FEATURES_PERMISSION = [
  { permission: 'edit_match', glyph: '✏️', label: '修改比赛', tone: '' },
  { permission: 'edit_half', glyph: '⛳', label: '修改半场', tone: '' },
  { permission: 'permission_management', glyph: '🛡️', label: '权限管理', tone: '' },
  { permission: 'players', glyph: '⚙️', label: '选手管理', tone: '' },
  { permission: 'tee_management', glyph: '🚩', label: '出发管理', tone: '' },
  { permission: 'fees', glyph: '👛', label: '收费管理', tone: '' },
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

/** 只读展示用：从正式 groups 规范化克隆（详情页不持有 groupDraft；正式位只保留 userId/position） */
function cloneTournamentGroups(list) {
  if (!Array.isArray(list)) return [];
  return list.map((g, index) => ({
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
  }));
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
  registerStatus: 'closed',
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

    // 领先榜
    scoringDisplay: 'strokeDiff', // gross | strokeDiff
    scorePanel: 'technical', // technical | quick
    leaderboard: [],
    openIndex: -1,
    // 逐洞详情：跟随记分页记忆的显示偏好（gross | diff），不自维护模式
    scoreDisplayMode: 'gross',
    openScorecard: null,
    courseName: 'COURSE', // 逐洞详情标题：当前球场名称（来自 groupsStore，单一数据源）
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
  },

  /* ===== 顶部赛事信息数据接入（teamMatchStore） ===== */
  loadMatch(matchId) {
    let match = null;
    if (demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
      match = demoJiaobeiMatch.getJiaobeiDemoMatch();
    } else if (matchId) {
      match = teamMatchStore.getMatchById(matchId);
    }
    const lifecycle = this._getMatchLifecycle(match);
    const tabs = resolveTournamentTabs(lifecycle.status);
    this.setData(Object.assign({
      matchId: matchId,
      match: this._mapMatchToView(match),
      matchStatus: lifecycle,
      tabs: tabs,
      // 首次进入统一落到 tabs[0]（各状态首项均为 details）
      activeTab: tabs[0].id,
      eventInfoList: this._resolveEventInfoList(match),
      scorecardAdImage: this._resolveScorecardAdImage(getApp().getTheme(), matchId)
    }, this._buildRegisterStatePatch(match), this._buildGroupsTabStatePatch(match)), () => {
      this.applyMoreAccess();
    });
  },

  refreshMatchData(matchId) {
    let match = null;
    if (demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
      match = demoJiaobeiMatch.getJiaobeiDemoMatch();
    } else if (matchId) {
      match = teamMatchStore.getMatchById(matchId);
    }
    if (!match) return;
    const lifecycle = this._getMatchLifecycle(match);
    const tabs = resolveTournamentTabs(lifecycle.status);
    let activeTab = this.data.activeTab;
    if (!tabs.some((t) => t.id === activeTab)) {
      activeTab = tabs[0].id;
    }
    this.setData(Object.assign({
      match: this._mapMatchToView(match),
      matchStatus: lifecycle,
      tabs: tabs,
      activeTab: activeTab,
      eventInfoList: this._resolveEventInfoList(match)
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
      playerLookup: playerLookup
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

  /** 报名记录展示名（多字段兼容） */
  _resolveAnyPlayerNickname(raw) {
    if (!raw || typeof raw !== 'object') return '';
    const name = raw.competitionName
      || raw.displayName
      || raw.nickname
      || raw.name
      || raw.realName
      || raw.remarkName
      || '';
    return String(name).trim();
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
        const gender = playerDirectory.getGenderById(primaryId, u.gender || '');
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
    return (groups || []).map((g) => {
      // 正式位号保留在 g.players；展示层 hydrate 生成 displayPlayers（过滤空位，按 slotIndex 升序）
      const displayPlayers = this.hydrateGroupDisplayPlayers(g, playerLookup);
      const card = {
        groupId: g.groupId,
        badge: g.groupName,
        displayPlayers: displayPlayers,
        hasDisplayPlayers: displayPlayers.length > 0
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
    const mode = this.data.hasFormalGroups ? 'edit' : 'create';
    wx.navigateTo({
      url: '/pages/tournament/group-editor/index?matchId=' + encodeURIComponent(matchId) +
        '&mode=' + encodeURIComponent(mode)
    });
  },

  // 赛事生命周期：读取 teamMatchStore.match.status，归一化为 registering | ongoing | completed
  _getMatchLifecycle(match) {
    if (!match) return Object.assign({}, EMPTY_MATCH_LIFECYCLE);
    const raw = String(match.status || '').trim().toLowerCase();
    const allowed = [
      MATCH_LIFECYCLE.REGISTERING,
      MATCH_LIFECYCLE.ONGOING,
      MATCH_LIFECYCLE.COMPLETED
    ];
    const status = allowed.indexOf(raw) >= 0 ? raw : '';
    return {
      status: status,
      isRegistering: status === MATCH_LIFECYCLE.REGISTERING,
      isOngoing: status === MATCH_LIFECYCLE.ONGOING,
      isCompleted: status === MATCH_LIFECYCLE.COMPLETED
    };
  },

  // 将 teamMatchStore 记录映射为顶部信息区视图字段
  _mapMatchToView(match) {
    if (!match) return Object.assign({}, EMPTY_MATCH_VIEW);
    const venue = [match.courseName, match.courseHalfText].filter(Boolean).join('');
    const priceTags = this._mapPriceTags(match);
    return {
      matchId: match.matchId || '',
      statusLabel: match.statusLabel || '',
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
    const users = (normalized.users || []).map((user) => ({
      userId: user.userId || user.playerId || user.id || user.uid || user.openid || '',
      // 赛事显示名：competitionName 优先，兼容 nickname / name / realName
      competitionName: user.competitionName || user.displayName || user.nickname || user.name || user.realName || user.remarkName || '',
      nickname: user.nickname || '',
      gender: user.gender || '',
      handicap: user.handicap != null ? user.handicap : '',
      avatar: user.avatar || user.avatarUrl || '',
      phone: user.phone || '',
      groupId: user.groupId != null ? String(user.groupId) : '',
      groupName: user.groupName || '',
      registeredAt: user.registeredAt != null ? user.registeredAt : '',
      source: user.source || 'self',
      registeredBy: user.registeredBy || '',
      registeredByName: user.registeredByName || '',
      subjectType: user.subjectType || 'self',
      pickChannel: user.pickChannel || '',
      canSelfCancel: user.canSelfCancel !== false,
      locked: !!user.locked,
      // Patch 8：手工代报名预留字段，与 store.normalize 对齐
      userType: user.userType || '',
      realName: user.realName || '',
      remarkName: user.remarkName || ''
    }));
    return {
      totalCount: normalized.totalCount,
      users: users
    };
  },

  _filterRegisterUsers(registerInfo, activeRegisterSubTab) {
    const users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
    const groupId = String(activeRegisterSubTab || '');
    if (!groupId) return [];
    return users
      .filter((user) => String(user.groupId) === groupId)
      .map((user, index) => ({
        listKey: user.userId || ('register-user-' + groupId + '-' + index),
        userId: user.userId || '',
        competitionName: user.competitionName || '',
        gender: user.gender || '',
        // 江湖差点空值统一显示 "-"（0 为有效差点，需保留）
        handicap: (user.handicap != null && user.handicap !== '') ? String(user.handicap) : '-',
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
        realName: user.realName || '',
        remarkName: user.remarkName || ''
      }));
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
   * 报名开关判断（registerStatus 优先于用户报名状态；deadlineTime 不参与权限）
   */
  _resolveRegisterPermission(match) {
    if (!match) {
      return { registerStatus: 'closed', isOpen: false, reason: '报名已关闭' };
    }
    const registerStatus = String(match.registerStatus || 'open').trim().toLowerCase();
    if (registerStatus === 'closed') {
      return { registerStatus: 'closed', isOpen: false, reason: '报名已关闭' };
    }
    return { registerStatus: 'open', isOpen: true, reason: '' };
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
        competitionName: competitionName,
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
    this.setData({ registerCancelModalVisible: true });
  },

  closeCancelRegisterModal() {
    this.setData({ registerCancelModalVisible: false });
  },

  confirmCancelRegister() {
    if (this.data.registerCancelSubmitting) return;
    if (!this.data.currentUserRegisterStatus.isRegistered) {
      this.setData({ registerCancelModalVisible: false });
      return;
    }

    const match = teamMatchStore.getMatchById(this.data.matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    const user = gameStore.getCurrentUser() || {};
    const userId = String(user.userId || '');
    if (!userId) {
      wx.showToast({ title: '用户信息缺失', icon: 'none' });
      return;
    }

    this.setData({ registerCancelSubmitting: true });

    if (!match.registerInfo || typeof match.registerInfo !== 'object') {
      match.registerInfo = { totalCount: 0, users: [] };
    }
    if (!Array.isArray(match.registerInfo.users)) {
      match.registerInfo.users = [];
    }

    match.registerInfo.users = match.registerInfo.users.filter(
      (item) => String(item && item.userId) !== userId
    );
    match.registerInfo.totalCount = match.registerInfo.users.length;

    teamMatchStore.saveMatch(match);

    const patch = this._buildRegisterStatePatch(match, this.data.activeRegisterSubTab);
    patch.registerCancelModalVisible = false;
    patch.registerCancelSubmitting = false;
    this.setData(patch, () => {
      if (this.data.activeTab === 'register') this.measureRegisterExtTop();
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

  /** 领先榜逐洞下方广告：仅交杯鲜啤演示用广告图片1 BRIGHT/DARK，其它赛事保持原 Unsplash */
  _resolveScorecardAdImage(theme, matchId) {
    const id = matchId != null ? matchId : this.data.matchId;
    if (demoJiaobeiMatch.isJiaobeiDemoMatchId(id)) {
      return demoJiaobeiMatch.resolveJiaobeiScorecardAdImage(theme || getApp().getTheme())
        || DEFAULT_SCORECARD_AD_IMAGE;
    }
    return DEFAULT_SCORECARD_AD_IMAGE;
  },

  applyTheme(theme) {
    const dark = theme === 'dark';
    const patch = {
      themeClass: dark ? 'dark-mode' : 'bright-mode',
      scorecardAdImage: this._resolveScorecardAdImage(theme, this.data.matchId)
    };
    let match = null;
    if (demoJiaobeiMatch.isJiaobeiDemoMatchId(this.data.matchId)) {
      match = demoJiaobeiMatch.getJiaobeiDemoMatch();
    } else if (this.data.matchId) {
      match = teamMatchStore.getMatchById(this.data.matchId);
    }
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
    const isRegistering = !!(this.data.matchStatus && this.data.matchStatus.isRegistering);
    if (isRegistering) {
      const section = FEATURE_SECTION_REGISTERING;
      const split = splitPermissionFeatures(REGISTERING_FEATURES_PERMISSION);
      this.setData({
        featuresCommon: REGISTERING_FEATURES_COMMON.slice(),
        featuresPermission: split.featuresPermission,
        featuresPermissionFooterPad: split.featuresPermissionFooterPad,
        featuresPermissionFooter: split.featuresPermissionFooter,
        featuresSectionCommonMain: section.commonMain,
        featuresSectionCommonSub: section.commonSub,
        featuresSectionPermissionMain: section.permissionMain,
        featuresSectionPermissionSub: section.permissionSub
      });
      return;
    }
    const access = MORE_ACCESS;
    const permSet = access.permissions || [];
    const visible = (scope, permission) => {
      if (access.isPrivilegedUser || scope === 'common') return true;
      // 修改半场与修改比赛同权
      if (permission === 'edit_half') {
        return permSet.indexOf('edit_match') >= 0 || permSet.indexOf('edit_half') >= 0;
      }
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
    if (permission === 'edit_match') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      const matchId = this.data.matchId || '';
      if (!matchId) {
        wx.showToast({ title: '未找到比赛信息', icon: 'none' });
        return;
      }
      wx.navigateTo({
        url:
          '/pages/create/team-internal/index?mode=edit&matchId=' +
          encodeURIComponent(matchId),
        fail: () => wx.showToast({ title: '页面尚未注册', icon: 'none' })
      });
      return;
    }
    if (permission === 'edit_half') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false, halfSheetVisible: true });
      return;
    }
    if (this.data.matchStatus && this.data.matchStatus.isRegistering) {
      if (permission === 'register_for_other') {
        // Patch 8：关闭报名后禁用替他人报名（邀请好友报名不受影响）
        const registerClosed =
          !(this.data.registerPermission && this.data.registerPermission.isOpen);
        this.setData({ showMoreSheet: false, moreFabExpanded: false });
        if (registerClosed) {
          wx.showToast({ title: '报名已关闭', icon: 'none' });
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
      this.setData({ showMoreSheet: false, moreFabExpanded: false, activeTab: 'leaderboard' });
      return;
    }
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  openRegisterForOtherSheet() {
    // Patch 8：二次拦截，避免其它入口绕过 onFeatureTap
    if (!(this.data.registerPermission && this.data.registerPermission.isOpen)) {
      wx.showToast({ title: '报名已关闭', icon: 'none' });
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
      '/pages/player/friends/index?mode=' +
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
      '/pages/player/friends/index?mode=' +
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
   * - 仅取消（无新增）→ 直接 _applyProxyCommitPlan
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

    // 仅取消 / 无变更：直接统一提交
    this._applyProxyCommitPlan();
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
      let userType = '';
      let realName = '';
      let remarkName = '';
      if (pickChannel === 'manual') {
        userType =
          p.userType != null && String(p.userType).trim() !== ''
            ? String(p.userType).trim()
            : phone
              ? 'phone_pending'
              : 'non_registered';
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
        competitionName: competitionName,
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
        userType: userType,
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
    const userType = phone ? 'phone_pending' : 'non_registered';
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
      userType: userType
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
      competitionName: competitionName,
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

    // 1) 应用 removes（再次校验：仅本人代报名可删）
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
        competitionName: item.competitionName != null ? String(item.competitionName) : '',
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

    // 4) 刷新报名 TAB + 清理 pending / plan
    const preferredGroup =
      (plan.group && plan.group.id) || this.data.activeRegisterSubTab || '';
    const patch = this._buildRegisterStatePatch(match, preferredGroup);
    Object.assign(patch, {
      proxyGroupSheetVisible: false,
      pendingProxyPlayers: [],
      proxyGroupOptions: [],
      proxyGroupId: ''
    });
    this._proxyPickChannel = '';
    this._proxyCommitPlan = null;
    this.setData(patch, () => {
      if (this.data.activeTab === 'register') this.measureRegisterExtTop();
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
    this._applyProxyCommitPlan();
  },

  /**
   * 邀请好友报名：微信分享入口（阶段占位）
   * 所有注册用户可用；与 registerStatus 无关（关闭报名后仍可邀请）
   */
  shareTournamentInvite() {
    const matchId = this.data.matchId || '';
    const match = this.data.match || {};
    const title = match.titleMain || match.roundName || '球队赛';
    console.log('[invite-friends-register] share tournament invite', {
      matchId: matchId,
      title: title,
      registerStatus: (this.data.registerPermission && this.data.registerPermission.registerStatus) || ''
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
