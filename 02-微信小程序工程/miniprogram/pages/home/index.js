const { createHeaderStyle } = require('../../utils/headerEngine.js');
const gameStore = require('../../utils/gameStore.js');
const matchStateUtil = require('../../utils/matchState.js');
const gameProgress = require('../../utils/gameProgress.js');
const quickCreate = require('../../utils/quickCreate.js');
const mockAvatars = require('../../utils/mockAvatars.js');
const teamMatchStore = require('../../utils/teamMatchStore.js');
const userProfileStore = require('../../utils/userProfileStore.js');
const bannerConfig = require('../../utils/bannerConfig.js');

function formatGameDate(ts) {
  const d = ts ? new Date(ts) : new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return y + '/' + (m < 10 ? '0' + m : m) + '/' + (day < 10 ? '0' + day : day);
}

const SCHEDULE_FRIENDS = [
  { id: '838031', name: 'Alexander', avatar: mockAvatars.avatarByIndex(0) },
  { id: '839102', name: 'Bogey King', avatar: mockAvatars.avatarByIndex(1) },
  { id: '781229', name: 'Mason', avatar: mockAvatars.avatarByIndex(2) },
  { id: '770821', name: 'Eagle Lee', avatar: mockAvatars.avatarByIndex(3) },
  { id: '882104', name: '球友老王', avatar: mockAvatars.avatarByIndex(4) },
  { id: '901337', name: 'Par达人', avatar: mockAvatars.avatarByIndex(5) }
];

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function normalizeTheme(theme) {
  return theme === 'dark' ? 'dark' : 'bright';
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function formatScheduleDate(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return y + '年' + pad2(m) + '月' + pad2(d) + '日';
}

function formatScheduleDay(date) {
  return WEEKDAYS[date.getDay()] + ' · ' + WEEKDAY_FULL[date.getDay()];
}

function createScheduleCard(date) {
  return {
    id: Date.now() + Math.random(),
    dateDisplay: formatScheduleDate(date),
    dayDisplay: formatScheduleDay(date),
    remindees: [],
    note: '',
    removing: false
  };
}

Page({
  data: {
    theme: 'bright',
    themeClass: 'bright-mode',
    themeIcon: 'moon',
    currentMainSection: 'home',
    primaryTabActive: true,
    secondaryTabActive: false,
    primaryTabText: '我的',
    secondaryTabText: '日程',
    heroTabsVisible: true,
    showMyContent: true,
    showScheduleContent: false,
    showTournamentContent: false,
    showProfileContent: false,
    showPlazaContent: false,
    plazaCards: [],
    bottomNavActive: 'home',
    createOverlayVisible: false,
    createOverlayOpen: false,
    moreCreateVisible: false,
    calendarPickerVisible: false,
    calendarPanelOpen: false,
    scheduleRemindPickerVisible: false,
    scheduleRemindPanelOpen: false,
    editProfileVisible: false,
    editProfileOpen: false,
    userProfile: { nickname: '', competitionName: '' },
    profileEditDraft: { nickname: '', competitionName: '' },
    bannerPickerVisible: false,
    profileBannerImg: 'https://cdn.screenshottocode.com/fjGiYQjgxR_OzO3H9s1OQ.png',
    homeBannerImg: bannerConfig.getHomeBanner(),
    calendarMonthYear: '',
    calendarDays: [],
    scheduleCards: [
      {
        id: 1,
        dateDisplay: '2024年05月20日',
        dayDisplay: '星期一 · Monday',
        remindees: [],
        note: '',
        removing: false
      }
    ],
    scheduleRemindSearch: '',
    filteredScheduleFriends: [],
    tempRemindeeSelection: [],
    activeScheduleCardIndex: null,
    activeRemindScheduleCardIndex: null,
    myCards: [
      {
        id: 'my-1',
        favorited: true,
        active: true,
        live: true,
        avatarCount: 3,
        avatars: [
          'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=100',
          'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=100',
          'https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?w=100'
        ],
        title: '周末业余邀请赛',
        progressWidth: '25%',
        progressMarkerLeft: gameProgress.buildMarkerLeft(4),
        progressMarkerText: '04',
        progressFinish: false,
        venue: '佘山国际高尔夫俱乐部',
        date: '2025/07/20',
        views: '64',
        type: 'tour',
        navUrl: '/pages/score/index'
      },
      {
        id: 'my-2',
        favorited: false,
        active: false,
        live: false,
        avatarCount: 4,
        avatars: [
          'https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?w=100',
          'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100',
          'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100',
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100'
        ],
        title: '四人最佳球位挑战-18',
        progressWidth: '100%',
        progressMarkerLeft: '',
        progressMarkerText: 'F',
        progressFinish: true,
        venue: '华彬国际高尔夫俱乐部',
        date: '2025/04/15',
        views: '72',
        type: 'tour',
        navUrl: '/pages/score/index?mode=fourball_best'
      },
      {
        id: 'my-3',
        favorited: true,
        active: false,
        live: false,
        clubLogo: 'https://cdn.screenshottocode.com/4xhZC0kyGivdD4E_wX-1F.png',
        clubDate: 'May/25/2026',
        title: '交杯鲜啤挑战赛&江湖业余球员巡回赛第三站',
        teamName: '江湖业余球员巡回赛',
        venue: '北京清河湾高尔夫乡村俱乐部A&B',
        views: '256',
        type: 'club',
        navUrl: '/pages/tournament/detail/index?matchId=demo-jiaobei-beer'
      }
    ],
    tournamentCards: [
      {
        id: 'tour-1',
        favorited: true,
        clubLogo: 'https://cdn.screenshottocode.com/4xhZC0kyGivdD4E_wX-1F.png',
        clubDate: 'May/25/2026',
        title: '交杯鲜啤挑战赛&江湖业余球员巡回赛第三站',
        teamName: '江湖业余球员巡回赛',
        venue: '北京清河湾高尔夫乡村俱乐部A&B',
        views: '168',
        navUrl: '/pages/tournament/detail/index?matchId=demo-jiaobei-beer'
      },
      {
        id: 'tour-2',
        favorited: true,
        clubLogo: 'https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?w=100',
        clubDate: 'Aug/15/2026',
        title: '高球兄弟精英队内部排名赛',
        teamName: '高球兄弟精英队',
        venue: '北京通盈雁栖湖高尔夫俱乐部',
        views: '32',
        navUrl: '/pages/tournament/detail/index'
      },
      {
        id: 'tour-3',
        favorited: false,
        clubLogo: 'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=100',
        clubDate: 'Sep/22/2026',
        title: '北京球友联合会月度挑战赛',
        teamName: '北京球友联合会',
        venue: '鸿华国际高尔夫俱乐部',
        views: '80',
        navUrl: '/pages/tournament/detail/index'
      }
    ],
    currentPickerYear: 0,
    currentPickerMonth: 0,
    selectedCalendarYear: 0,
    selectedCalendarMonth: 0,
    selectedCalendarDay: 0,
    headerTotalHeight: 92,
    headerPaddingTop: 52,
    headerPaddingRight: 96,
    headerContentHeight: 32,
    headerRootStyle: 'min-height:92px;height:92px;background-color:#002D62;border-bottom:2px solid var(--champion-gold);box-sizing:border-box;flex-shrink:0;',
    headerBarStyle: 'padding-top:52px;padding-right:96px;padding-bottom:16px;padding-left:16px;min-height:92px;box-sizing:border-box;display:flex;align-items:center;'
  },

  onLoad(options) {
    const now = new Date();
    this.setData({
      currentPickerYear: now.getFullYear(),
      currentPickerMonth: now.getMonth(),
      selectedCalendarYear: now.getFullYear(),
      selectedCalendarMonth: now.getMonth(),
      selectedCalendarDay: now.getDate()
    });
    // 保存静态种子卡片，便于每次刷新时把「进行中 GAME」拼接到最前
    this._baseMyCards = this.data.myCards.slice();
    this._baseTournamentCards = this.data.tournamentCards.slice();
    this.initHeaderNav();
    this.initGlobalTheme();
    this.refreshUserProfile();
    if (options && options.section === 'profile') {
      this.showProfileSection();
    } else if (options && options.section === 'tournament') {
      this.showTournamentSection();
    } else if (options && options.tab === 'my') {
      // 记分页返回：自动定位到首页「我的 TAB」
      this.showHomeSection();
    }
  },

  onReady() {
    this.initHeaderNav();
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
    this.refreshUserProfile();
    // 每次显示刷新进行中 GAME（持久化数据源 → 返回首页不丢失、刷新可恢复）
    this.refreshGames();
  },

  refreshUserProfile() {
    const profile = userProfileStore.loadProfile();
    this.setData({
      userProfile: {
        nickname: profile.nickname || '',
        competitionName: profile.competitionName || ''
      }
    });
  },

  // 进行中 GAME → 卡片：我的 TAB 金色边框置顶；广场 TAB 普通卡片同步
  refreshGames() {
    const activeGames = gameStore.getActiveGames();
    const finishedGames = gameStore.listGames().filter(
      (g) => g && (g.status === 'finished' || g.status === 'ended')
    );
    const myGameCards = activeGames
      .map((g) => this._gameToCard(g, true))
      .concat(finishedGames.map((g) => this._gameToCard(g, false)));
    const plazaCards = activeGames.map((g) => this._gameToCard(g, false));
    const base = this._baseMyCards || [];
    this.setData({
      myCards: myGameCards.concat(base),
      plazaCards: plazaCards
    });
  },

  _gameToCard(g, gold) {
    // 头像取值顺序：创建者所在组(groups[0]) → 其余组（已确认/最近加入）；合成逻辑由组件统一处理
    const allPlayers = [];
    if (Array.isArray(g.groups) && g.groups.length) {
      g.groups.forEach((grp) => {
        (grp.playersSlots || []).forEach((p) => { if (p) allPlayers.push(p); });
      });
    } else {
      (g.playersSlots || []).forEach((p) => { if (p) allPlayers.push(p); });
    }
    const avatars = allPlayers
      .map((p) => mockAvatars.resolveAvatar(p.avatar, p.playerId))
      .filter(Boolean);
    // 多组 Game → 进入 Game Hub 控制页；单组 → 直接进入记分
    const multi = Array.isArray(g.groups) && g.groups.length > 1;
    const navUrl = multi
      ? '/pages/game/hub/index?gameId=' + g.gameId
      : '/pages/score/index?gameId=' + g.gameId + '&groupIndex=0';
    const progress = gameProgress.buildProgressUi(g, 0);
    const ended = g.status === 'finished' || g.status === 'ended';
    return {
      id: g.gameId,
      gameId: g.gameId,
      type: 'tour',
      favorited: true,
      active: !!gold && !ended,
      live: !!gold && !ended && !progress.progressFinish,
      avatars: avatars,
      title: g.roundName || g.courseName || '高尔夫球局',
      progressWidth: progress.progressWidth,
      progressMarkerLeft: progress.progressMarkerLeft,
      progressMarkerText: progress.progressMarkerText,
      progressFinish: progress.progressFinish,
      venue: g.courseName || '',
      date: formatGameDate(g.createdAt),
      views: '0',
      navUrl: navUrl
    };
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    this.setData({
      headerTotalHeight: header.metrics.headerTotalHeight,
      headerPaddingTop: header.metrics.headerPaddingTop,
      headerPaddingRight: header.metrics.headerPaddingRight,
      headerContentHeight: header.metrics.headerContentHeight,
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle
    });
  },

  // 仅将全局 theme 应用到本页视图（不写入，只读取后渲染）
  applyTheme(theme) {
    theme = normalizeTheme(theme);
    const dark = theme === 'dark';
    this.setData({
      theme: theme,
      themeClass: dark ? 'dark-theme' : 'bright-mode',
      themeIcon: dark ? 'sun' : 'moon'
    });
  },

  initGlobalTheme() {
    this.applyTheme(getApp().getTheme());
  },

  // 首页是全局唯一主题切换入口
  toggleTheme() {
    const app = getApp();
    const next = app.globalData.theme === 'bright' ? 'dark' : 'bright';
    app.setTheme(next);
    this.applyTheme(next);
  },

  toggleFavorite(e) {
    const id = e.currentTarget.dataset.id;
    const toggleById = (list) => list.map((item) => {
      if (item.id === id) {
        return Object.assign({}, item, { favorited: !item.favorited });
      }
      return item;
    });
    this.setData({
      myCards: toggleById(this.data.myCards),
      tournamentCards: toggleById(this.data.tournamentCards)
    });
  },

  setTabActive(which) {
    this.setData({
      primaryTabActive: which !== 'secondary',
      secondaryTabActive: which === 'secondary'
    });
  },

  setBottomNavActive(section) {
    this.setData({ bottomNavActive: section });
  },

  hideMainContents() {
    this.setData({
      showMyContent: false,
      showScheduleContent: false,
      showTournamentContent: false,
      showProfileContent: false,
      showPlazaContent: false
    });
  },

  setHeroTabsVisible(visible) {
    this.setData({ heroTabsVisible: visible });
  },

  showHomeSection() {
    this.setData({
      currentMainSection: 'home',
      primaryTabText: '我的',
      secondaryTabText: '日程'
    });
    this.setHeroTabsVisible(true);
    this.hideMainContents();
    this.setData({ showMyContent: true });
    this.setTabActive('primary');
    this.setBottomNavActive('home');
  },

  showTournamentSection() {
    this.setData({
      currentMainSection: 'tournament',
      primaryTabText: '我的球队赛',
      secondaryTabText: '所有球队赛'
    });
    this.setHeroTabsVisible(true);
    this.hideMainContents();
    const myCards = teamMatchStore.listMatches()
      .map(teamMatchStore.toTournamentCard)
      .filter(Boolean);
    this._myTournamentCards = myCards;
    this.setData({
      showTournamentContent: true,
      tournamentCards: myCards
    });
    this.setTabActive('primary');
    this.setBottomNavActive('tournament');
  },

  // 广场 TAB：展示所有进行中 GAME（普通卡片，无金边）
  showPlazaSection() {
    this.refreshGames();
    this.setData({
      currentMainSection: 'plaza',
      primaryTabText: '广场',
      secondaryTabText: ''
    });
    this.setHeroTabsVisible(false);
    this.hideMainContents();
    this.setData({ showPlazaContent: true });
    this.setTabActive('primary');
    this.setBottomNavActive('plaza');
  },

  showProfileSection() {
    this.setData({ currentMainSection: 'profile' });
    this.setHeroTabsVisible(false);
    this.hideMainContents();
    this.setData({ showProfileContent: true });
    this.setTabActive('primary');
    this.setBottomNavActive('profile');
  },

  switchTopTab(e) {
    const which = e.currentTarget.dataset.which;
    this.hideMainContents();
    this.setTabActive(which);
    const section = this.data.currentMainSection;
    if (section === 'home') {
      if (which === 'secondary') {
        this.setData({ showScheduleContent: true });
      } else {
        this.setData({ showMyContent: true });
      }
    } else if (section === 'tournament') {
      const cards = which === 'secondary'
        ? (this._baseTournamentCards || [])
        : (this._myTournamentCards || teamMatchStore.listMatches()
          .map(teamMatchStore.toTournamentCard)
          .filter(Boolean));
      this.setData({
        showTournamentContent: true,
        tournamentCards: cards
      });
    } else if (section === 'profile') {
      this.setData({ showProfileContent: true });
      if (which === 'secondary') {
        this.toggleEditProfile(true);
      }
    }
  },

  switchTab(e) {
    const text = e.currentTarget.dataset.text || '';
    const which = text.includes('日程') || text.includes('所有') ? 'secondary' : 'primary';
    this.switchTopTab({ currentTarget: { dataset: { which: which } } });
  },

  openMoreCreate() {
    this.setData({
      moreCreateVisible: true,
      createOverlayVisible: true,
      createOverlayOpen: true
    });
  },

  closeMoreCreate() {
    this.setData({
      moreCreateVisible: false,
      createOverlayVisible: true,
      createOverlayOpen: true
    });
  },

  toggleCreateOverlay() {
    if (!this.data.createOverlayVisible) {
      this.setData({ createOverlayVisible: true });
      setTimeout(() => {
        this.setData({ createOverlayOpen: true });
      }, 10);
    } else {
      this.setData({ createOverlayOpen: false });
      setTimeout(() => {
        this.setData({ createOverlayVisible: false });
      }, 300);
    }
  },

  openNormalCreate() {
    wx.navigateTo({
      url: '/pages/create/normal/index',
      fail: () => {
        wx.showToast({ title: '页面尚未注册', icon: 'none' });
      }
    });
  },

  openTeamInternalCreate() {
    wx.navigateTo({
      url: '/pages/create/team-internal/index',
      fail: () => {
        wx.showToast({ title: '页面尚未注册', icon: 'none' });
      }
    });
  },

  openTeamInterCreate() {
    wx.navigateTo({
      url: '/pages/create/team-inter/index',
      fail: () => {
        wx.showToast({ title: '页面尚未注册', icon: 'none' });
      }
    });
  },

  openSeriesCreate() {
    wx.navigateTo({
      url: '/pages/create/series/index',
      fail: () => {
        wx.showToast({ title: '页面尚未注册', icon: 'none' });
      }
    });
  },

  onQuickCreate() {
    if (this._quickCreating) return;
    this._quickCreating = true;
    this.setData({ createOverlayOpen: false });
    setTimeout(() => {
      this.setData({ createOverlayVisible: false });
    }, 300);
    wx.showLoading({ title: '创建中…', mask: true });
    quickCreate
      .quickCreateAndEnterScore()
      .catch(() => {
        wx.showToast({ title: '创建失败', icon: 'none' });
      })
      .finally(() => {
        wx.hideLoading();
        this._quickCreating = false;
      });
  },

  // 解析卡片 navUrl 上的查询参数（仅用于把旧卡片入口翻译为 matchState）
  _parseQuery(url) {
    const out = {};
    const i = url.indexOf('?');
    if (i < 0) return out;
    url.slice(i + 1).split('&').forEach((kv) => {
      const pair = kv.split('=');
      if (pair[0]) out[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
    });
    return out;
  },

  // 统一进入记分页：先写好本卡片对应的 matchState，再调用 enterScorePage（禁止直接 navigateTo score）
  _enterScore(url) {
    const q = this._parseQuery(url);
    const gameId = q.gameId || '';
    if (gameId) {
      const game = gameStore.getGame(gameId);
      if (!game) {
        wx.showToast({ title: '暂无比赛数据', icon: 'none' });
        return;
      }
      const gi = q.groupIndex != null ? Number(q.groupIndex) || 0 : 0;
      matchStateUtil.setMatchState(matchStateUtil.buildFromGame(game, gi));
    } else {
      // 首页原型演示卡片（无真实 game）：构建演示 matchState，记分页走原型演示分支
      const mode = q.mode === 'fourball_best' ? 'fourball_best' : 'standard';
      matchStateUtil.setMatchState({
        mode: mode,
        formatType: mode === 'fourball_best' ? 'best_ball' : 'individual_stroke',
        gameId: '',
        groupIndex: 0,
        groupId: '',
        players: [],
        course: {},
        scores: matchStateUtil.emptyScores(),
        groupCount: 1
      });
    }
    matchStateUtil.enterScorePage();
  },

  navigateToPage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    // 所有进入记分页的入口统一走 enterScorePage（matchState 唯一数据源）
    if (url.indexOf('/pages/score/index') === 0) {
      this._enterScore(url);
      return;
    }
    wx.navigateTo({
      url: url,
      fail: () => {
        wx.showToast({ title: '页面尚未注册', icon: 'none' });
      }
    });
  },

  navigateToFootprints() {
    wx.navigateTo({
      url: '/pages/profile/footprints/index',
      fail: () => {
        wx.showToast({ title: '页面尚未注册', icon: 'none' });
      }
    });
  },

  toggleEditProfile(arg) {
    let show;
    if (typeof arg === 'boolean') {
      show = arg;
    } else if (arg && arg.currentTarget) {
      show = arg.currentTarget.dataset.show;
      if (show === undefined || show === '') {
        show = !this.data.editProfileVisible;
      }
    } else {
      show = !this.data.editProfileVisible;
    }
    if (show) {
      const profile = userProfileStore.loadProfile();
      this.setData({
        editProfileVisible: true,
        profileEditDraft: {
          nickname: profile.nickname || '',
          competitionName: profile.competitionName || ''
        }
      });
      setTimeout(() => {
        this.setData({ editProfileOpen: true });
      }, 10);
    } else {
      this.setData({ editProfileOpen: false });
      setTimeout(() => {
        this.setData({ editProfileVisible: false });
      }, 300);
    }
  },

  onEditProfileCancel() {
    this.toggleEditProfile(false);
  },

  onEditProfileSave() {
    const draft = this.data.profileEditDraft || {};
    const saved = userProfileStore.updateProfile({
      nickname: draft.nickname != null ? String(draft.nickname).trim() : '',
      competitionName: draft.competitionName != null ? String(draft.competitionName).trim() : ''
    });
    this.setData({
      userProfile: {
        nickname: saved.nickname || '',
        competitionName: saved.competitionName || ''
      }
    });
    this.toggleEditProfile(false);
  },

  onEditProfileNicknameInput(e) {
    this.setData({ 'profileEditDraft.nickname': e.detail.value || '' });
  },

  onEditProfileCompetitionNameInput(e) {
    this.setData({ 'profileEditDraft.competitionName': e.detail.value || '' });
  },

  toggleBannerPicker(arg) {
    let show;
    if (typeof arg === 'boolean') {
      show = arg;
    } else if (arg && arg.currentTarget) {
      show = arg.currentTarget.dataset.show;
      if (show === undefined || show === '') {
        show = !this.data.bannerPickerVisible;
      }
    } else {
      show = !this.data.bannerPickerVisible;
    }
    this.setData({ bannerPickerVisible: show });
  },

  chooseBanner(e) {
    const url = e.currentTarget.dataset.url;
    if (url) {
      this.setData({ profileBannerImg: url });
    }
    this.toggleBannerPicker(false);
  },

  /** 首页默认 BANNER 加载失败 → 回退旧 CDN */
  onHomeBannerError() {
    const current = String(this.data.homeBannerImg || '').trim();
    const fallback = bannerConfig.getBannerLocalFallback(current, 'home');
    if (!fallback || fallback === current) return;
    this.setData({ homeBannerImg: fallback });
  },

  renderCalendar() {
    const year = this.data.currentPickerYear;
    const month = this.data.currentPickerMonth;
    const days = [];
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
      days.push({ empty: true });
    }
    for (let d = 1; d <= lastDate; d++) {
      const isSelected =
        this.data.selectedCalendarDay === d &&
        this.data.selectedCalendarMonth === month &&
        this.data.selectedCalendarYear === year;
      days.push({ day: d, empty: false, selected: isSelected });
    }

    this.setData({
      calendarMonthYear: year + '年' + (month + 1) + '月',
      calendarDays: days
    });
  },

  openCalendarPicker(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      calendarPickerVisible: true,
      activeScheduleCardIndex: index != null ? index : null
    });
    setTimeout(() => {
      this.setData({ calendarPanelOpen: true });
    }, 10);
    this.renderCalendar();
  },

  closeCalendarPicker() {
    this.setData({ calendarPanelOpen: false });
    setTimeout(() => {
      this.setData({ calendarPickerVisible: false });
    }, 300);
  },

  selectDate(e) {
    const day = e.currentTarget.dataset.day;
    this.setData({
      selectedCalendarYear: this.data.currentPickerYear,
      selectedCalendarMonth: this.data.currentPickerMonth,
      selectedCalendarDay: day
    });
    this.renderCalendar();
  },

  changeMonth(e) {
    const dir = Number(e.currentTarget.dataset.dir);
    const date = new Date(this.data.currentPickerYear, this.data.currentPickerMonth + dir, 1);
    this.setData({
      currentPickerYear: date.getFullYear(),
      currentPickerMonth: date.getMonth()
    });
    this.renderCalendar();
  },

  confirmCalendarDate() {
    const selected = new Date(
      this.data.selectedCalendarYear,
      this.data.selectedCalendarMonth,
      this.data.selectedCalendarDay
    );
    const idx = this.data.activeScheduleCardIndex;
    if (idx != null && this.data.scheduleCards[idx]) {
      this.setData({
        ['scheduleCards[' + idx + '].dateDisplay']: formatScheduleDate(selected),
        ['scheduleCards[' + idx + '].dayDisplay']: formatScheduleDay(selected)
      });
    }
    this.closeCalendarPicker();
  },

  addNewSchedule() {
    const today = new Date();
    const cards = this.data.scheduleCards.concat(createScheduleCard(today));
    this.setData({ scheduleCards: cards });
  },

  removeSchedule(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ ['scheduleCards[' + index + '].removing']: true });
    setTimeout(() => {
      const cards = this.data.scheduleCards.filter((_, i) => i !== index);
      this.setData({ scheduleCards: cards });
    }, 300);
  },

  onScheduleNoteInput(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ ['scheduleCards[' + index + '].note']: e.detail.value });
  },

  getCardRemindees(card) {
    return card.remindees || [];
  },

  renderScheduleFriendList() {
    const keyword = (this.data.scheduleRemindSearch || '').trim().toLowerCase();
    const filtered = SCHEDULE_FRIENDS.filter(function (f) {
      return !keyword || f.name.toLowerCase().includes(keyword) || f.id.includes(keyword);
    }).map(function (f) {
      return {
        id: f.id,
        name: f.name,
        avatar: f.avatar,
        selected: false
      };
    });
    const selection = this.data.tempRemindeeSelection;
    filtered.forEach(function (f) {
      f.selected = selection.indexOf(f.id) !== -1;
    });
    this.setData({ filteredScheduleFriends: filtered });
  },

  openScheduleRemindeePicker(e) {
    const index = e.currentTarget.dataset.index;
    const card = this.data.scheduleCards[index];
    const remindees = this.getCardRemindees(card);
    this.setData({
      activeRemindScheduleCardIndex: index,
      scheduleRemindSearch: '',
      tempRemindeeSelection: remindees.map(function (r) { return r.id; }),
      scheduleRemindPickerVisible: true
    });
    this.renderScheduleFriendList();
    setTimeout(() => {
      this.setData({ scheduleRemindPanelOpen: true });
    }, 10);
  },

  closeScheduleRemindeePicker() {
    this.setData({ scheduleRemindPanelOpen: false });
    setTimeout(() => {
      this.setData({
        scheduleRemindPickerVisible: false,
        activeRemindScheduleCardIndex: null
      });
    }, 300);
  },

  onScheduleRemindSearchInput(e) {
    this.setData({ scheduleRemindSearch: e.detail.value });
    this.renderScheduleFriendList();
  },

  toggleScheduleRemindee(e) {
    const id = e.currentTarget.dataset.id;
    const selection = this.data.tempRemindeeSelection.slice();
    const pos = selection.indexOf(id);
    if (pos !== -1) {
      selection.splice(pos, 1);
    } else {
      selection.push(id);
    }
    this.setData({ tempRemindeeSelection: selection });
    this.renderScheduleFriendList();
  },

  confirmScheduleRemindees() {
    const idx = this.data.activeRemindScheduleCardIndex;
    if (idx == null) return;
    const selection = this.data.tempRemindeeSelection;
    const selected = SCHEDULE_FRIENDS.filter(function (f) {
      return selection.indexOf(f.id) !== -1;
    });
    this.setData({ ['scheduleCards[' + idx + '].remindees']: selected });
    this.closeScheduleRemindeePicker();
  }
});
