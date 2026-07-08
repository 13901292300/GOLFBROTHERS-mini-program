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
const teamMatchStore = require('../../../utils/teamMatchStore.js');
const gameStore = require('../../../utils/gameStore.js');
const userProfileStore = require('../../../utils/userProfileStore.js');

/* ===== 赛事详情页 match 视图对象（顶部信息区数据框架） ===== */
const MATCH_TYPE_LABELS = {
  'team-internal': '队内赛',
  'inter-team': '队际赛',
  series: '系列赛'
};

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
const TOURNAMENT_MANAGE_PERMISSIONS = FEATURES_PERMISSION.map((f) => f.permission);
const GROUPS_TAB_PLAYER_SLOTS = 4;

function createEmptyGroupPlayer(position) {
  return { position: position, userId: '', avatar: '', displayName: '', gender: '', tee: '' };
}

function createEmptyGroup(groupIndex) {
  const n = groupIndex + 1;
  return {
    groupId: 'group-tab-' + Date.now() + '-' + n,
    groupName: '第' + n + '组',
    players: Array.from({ length: GROUPS_TAB_PLAYER_SLOTS }, (_, i) => createEmptyGroupPlayer(i + 1))
  };
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
    // 报名 TAB 底部 CTA：主 TAB 距屏幕底部 <=100px 时隐藏
    hideRegisterCTA: false,
    // 报名名单卡片动态高度（px，随设备/尺寸计算；0 表示尚未计算，样式回退）
    rosterMinHeight: 0,
    // 分组 TAB 内容区动态高度（px，随设备/尺寸计算）
    groupsPanelMinHeight: 0,
    // 分组 TAB：页面态分组数据（暂不写入 teamMatchStore）
    groups: [],
    groupsTabCards: [],
    canManageGroups: false,
    groupDeleteModalVisible: false,
    groupDeleteTargetId: '',
    groupDeleteTargetName: '',
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
    featuresPermission: []
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
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const lifecycle = this._getMatchLifecycle(match);
    const tabs = resolveTournamentTabs(lifecycle.status);
    this.setData(Object.assign({
      matchId: matchId,
      match: this._mapMatchToView(match),
      matchStatus: lifecycle,
      tabs: tabs,
      // 首次进入统一落到 tabs[0]（各状态首项均为 details）
      activeTab: tabs[0].id,
      eventInfoList: this._resolveEventInfoList(match)
    }, this._buildRegisterStatePatch(match), this._buildGroupsTabStatePatch(match)));
  },

  _buildGroupsTabStatePatch(match) {
    return {
      groups: [],
      groupsTabCards: [],
      canManageGroups: this._resolveCanManageGroups(match)
    };
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

  _mapGroupsToTabCards(groups) {
    return (groups || []).map((g) => ({
      groupId: g.groupId,
      badge: g.groupName,
      players: (g.players || []).map((p) => {
        const displayName = p.displayName
          ? String(p.displayName)
          : (p.competitionName ? String(p.competitionName) : '');
        return {
          position: p.position,
          name: displayName,
          avatar: p.avatar ? mockAvatars.resolveAvatar(p.avatar) : '',
          teeLabel: p.tee ? 'T' : '',
          teeMarkerClass: p.tee === 'RED_T'
            ? 'tee-marker-dot--female'
            : (p.tee === 'BLUE_T' ? 'tee-marker-dot--male' : '')
        };
      })
    }));
  },

  onAddGroup() {
    if (!this.data.canManageGroups) return;
    const groups = (this.data.groups || []).slice();
    groups.push(createEmptyGroup(groups.length));
    this.setData({
      groups: groups,
      groupsTabCards: this._mapGroupsToTabCards(groups)
    });
  },

  onDeleteGroupTap(e) {
    if (!this.data.canManageGroups) return;
    const groupId = String((e.currentTarget.dataset.groupId != null ? e.currentTarget.dataset.groupId : ''));
    const groupName = String((e.currentTarget.dataset.groupName != null ? e.currentTarget.dataset.groupName : ''));
    if (!groupId) return;
    this.setData({
      groupDeleteModalVisible: true,
      groupDeleteTargetId: groupId,
      groupDeleteTargetName: groupName || '该组'
    });
  },

  closeGroupDeleteModal() {
    this.setData({
      groupDeleteModalVisible: false,
      groupDeleteTargetId: '',
      groupDeleteTargetName: ''
    });
  },

  confirmDeleteGroup() {
    if (!this.data.canManageGroups) {
      this.closeGroupDeleteModal();
      return;
    }
    const targetId = String(this.data.groupDeleteTargetId || '');
    if (!targetId) {
      this.closeGroupDeleteModal();
      return;
    }
    const next = (this.data.groups || [])
      .filter((g) => String(g && g.groupId) !== targetId)
      .map((g, index) => Object.assign({}, g, {
        groupName: '第' + (index + 1) + '组'
      }));
    this.setData({
      groups: next,
      groupsTabCards: this._mapGroupsToTabCards(next),
      groupDeleteModalVisible: false,
      groupDeleteTargetId: '',
      groupDeleteTargetName: ''
    });
  },

  onGroupCardTap(e) {
    const groupId = String((e.currentTarget.dataset.groupId != null ? e.currentTarget.dataset.groupId : ''));
    const groupName = String((e.currentTarget.dataset.groupName != null ? e.currentTarget.dataset.groupName : ''));
    if (!groupId) return;
    const currentGroup = (this.data.groups || []).find((g) => String(g.groupId) === groupId) || null;
    const app = getApp();
    app.globalData = app.globalData || {};
    app.globalData.tournamentGroupPickResult = null;
    app.globalData.tournamentGroupPickPayload = {
      matchId: this.data.matchId || '',
      groupId: groupId,
      groupName: groupName,
      players: currentGroup && Array.isArray(currentGroup.players) ? currentGroup.players : [],
      groups: (this.data.groups || []).map((g) => ({
        groupId: g && g.groupId ? String(g.groupId) : '',
        groupName: g && g.groupName ? String(g.groupName) : '',
        players: Array.isArray(g && g.players)
          ? g.players.map((p) => ({
            userId: p && p.userId ? String(p.userId) : '',
            position: Number(p && p.position) || 0
          }))
          : []
      })),
      registerInfo: this.data.registerInfo || { totalCount: 0, users: [] },
      registerSubTabs: this.data.registerSubTabs || []
    };
    wx.navigateTo({
      url: '/pages/tournament/group-pick/index?matchId=' + encodeURIComponent(this.data.matchId || '') +
        '&groupId=' + encodeURIComponent(groupId) +
        '&groupName=' + encodeURIComponent(groupName)
    });
  },

  /** 接收 group-pick 页面态确认结果（不写 teamMatchStore） */
  _applyGroupPickResultIfAny() {
    const app = getApp();
    const result = app && app.globalData ? app.globalData.tournamentGroupPickResult : null;
    if (!result || !result.groupId) return;
    if (app && app.globalData) app.globalData.tournamentGroupPickResult = null;

    const groups = (this.data.groups || []).slice();
    const idx = groups.findIndex((g) => String(g.groupId) === String(result.groupId));
    if (idx < 0) return;

    const players = Array.from({ length: 4 }, (_, i) => {
      const position = i + 1;
      const found = Array.isArray(result.players)
        ? result.players.find((p) => Number(p && p.position) === position)
        : null;
      if (!found || !found.userId) {
        return createEmptyGroupPlayer(position);
      }
      return {
        position: position,
        userId: found.userId ? String(found.userId) : '',
        avatar: found.avatar ? String(found.avatar) : '',
        displayName: found.displayName
          ? String(found.displayName)
          : (found.competitionName ? String(found.competitionName) : ''),
        gender: found.gender ? String(found.gender) : '',
        tee: found.tee ? String(found.tee) : ''
      };
    });

    groups[idx] = Object.assign({}, groups[idx], {
      groupName: result.groupName || groups[idx].groupName,
      players: players
    });
    this.setData({
      groups: groups,
      groupsTabCards: this._mapGroupsToTabCards(groups)
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
      bannerImage: match.bannerImage || '',
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

  _resolveEventInfoList(match) {
    if (!match || !Array.isArray(match.eventInfoList)) return [];
    return match.eventInfoList.map((item) => ({
      id: item && item.id != null ? item.id : '',
      title: item && item.title ? String(item.title) : '',
      type: item && item.type ? String(item.type) : '',
      content: item && item.content != null ? String(item.content) : '',
      imageData: item && item.imageData != null ? String(item.imageData) : '',
      status: item && item.status ? String(item.status) : ''
    }));
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
    const info = match.registerInfo || {};
    const users = Array.isArray(info.users)
      ? info.users.map((user) => ({
        userId: user && user.userId ? String(user.userId) : '',
        // 赛事显示名唯一来源 competitionName；兼容旧数据回退 nickname
        competitionName: user && user.competitionName ? String(user.competitionName) : (user && user.nickname ? String(user.nickname) : ''),
        gender: user && user.gender ? String(user.gender) : '',
        handicap: user && user.handicap != null ? user.handicap : '',
        avatar: user && user.avatar ? String(user.avatar) : '',
        phone: user && user.phone ? String(user.phone) : '',
        groupId: user && user.groupId != null ? String(user.groupId) : '',
        groupName: user && user.groupName ? String(user.groupName) : '',
        registeredAt: user && user.registeredAt != null ? user.registeredAt : ''
      }))
      : [];
    const totalCount = info.totalCount != null ? Number(info.totalCount) : users.length;
    return {
      totalCount: Number.isFinite(totalCount) ? totalCount : users.length,
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
        registeredAt: user.registeredAt != null ? user.registeredAt : ''
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
    this.setData({
      activeRegisterSubTab: id,
      registerDisplayUsers: this._filterRegisterUsers(this.data.registerInfo, id)
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
    return {
      registerInfo: registerInfo,
      registerTotalCount: registerInfo.totalCount,
      registerSubTabs: registerSubTabs,
      activeRegisterSubTab: activeRegisterSubTab,
      registerDisplayUsers: this._filterRegisterUsers(registerInfo, activeRegisterSubTab),
      currentUserRegisterStatus: this._resolveCurrentUserRegisterStatus(registerInfo),
      registerPermission: this._resolveRegisterPermission(match)
    };
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
      match.registerInfo.users.push({
        userId: userId,
        competitionName: competitionName,
        gender: this.data.registerGenderDraft ? String(this.data.registerGenderDraft) : '',
        avatar: user.avatar ? String(user.avatar) : '',
        phone: this.data.registerPhone ? String(this.data.registerPhone) : (user.phone ? String(user.phone) : ''),
        groupId: groupId,
        groupName: selectedGroup.name || '',
        registeredAt: Date.now()
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
    // group-pick 确认结果：页面态回传，优先于其它首页刷新逻辑前合入
    this._applyGroupPickResultIfAny();
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
      wx.nextTick(() => this.computeGroupsPanelMinHeight());
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
        if (h !== this.data.rosterMinHeight) this.setData({ rosterMinHeight: h });
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
              this._syncStickyRegisterExtByScroll(scrollOff.scrollTop || 0);
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
    const registerExtSticky = this._calcStickyRegisterExt(scrollTop, sticky);
    if (registerExtSticky !== this.data.isStickyRegisterExt) {
      patch.isStickyRegisterExt = registerExtSticky;
    }
    if (this.data.activeTab === 'register') {
      const hideCTA = this._calcHideRegisterCTA(scrollTop, sticky);
      if (hideCTA !== this.data.hideRegisterCTA) {
        patch.hideRegisterCTA = hideCTA;
      }
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

  _calcStickyRegisterExt(scrollTop, isStickyTab) {
    if (this.data.activeTab !== 'register') return false;
    if (!isStickyTab) return false;
    const extThreshold = this.data.registerExtOffsetTop || 0;
    const stickyTop = this.data.stickyRegisterExtTop || 0;
    return extThreshold > 0 && scrollTop >= extThreshold - stickyTop;
  },

  /**
   * 报名 TAB 底部 CTA 显隐：screenHeight - tabBottom <= 100px 时隐藏
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
      if (tab === 'groups') this.computeGroupsPanelMinHeight();
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
