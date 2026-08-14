const { createHeaderStyle } = require('../../utils/headerEngine.js');
const gameStore = require('../../utils/gameStore.js');
const matchStateUtil = require('../../utils/matchState.js');
const gameProgress = require('../../utils/gameProgress.js');
const quickCreate = require('../../utils/quickCreate.js');
const mockAvatars = require('../../utils/mockAvatars.js');
const teamMatchStore = require('../../utils/teamMatchStore.js');
const seriesStore = require('../../utils/seriesStore.js');
const seriesListCardAdapter = require('../../utils/seriesListCardAdapter.js');
const seriesRegistration = require('../../utils/seriesRegistration.js');
const userProfileStore = require('../../utils/userProfileStore.js');
const geoCatalog = require('../../utils/geoCatalog.js');
const bannerConfig = require('../../utils/bannerConfig.js');
const scheduleStore = require('../../utils/scheduleStore.js');
const { sortSchedules } = require('../../utils/scheduleSort.js');
const demoWeekendAmateurGame = require('../../utils/demoWeekendAmateurGame.js');
const contactNotifyStore = require('../../utils/contactNotifyStore.js');
function decorateTournamentCard(match, card) {
  if (!card) return null;
  const status = String((match && match.status) || '').trim().toLowerCase();
  const out = Object.assign({}, card);
  // LIVE / 报名中 / 已结束 三态显式映射，禁止 LIVE 被显示成报名中
  if (status === 'finished') {
    out.statusLabel = '已结束';
    out.statusTone = 'finished';
  } else if (status === 'ongoing' || out.statusLabel === 'LIVE') {
    out.statusLabel = 'LIVE';
    out.statusTone = 'live';
  } else if (status === 'registering') {
    out.statusLabel = '报名中';
    out.statusTone = 'default';
  } else {
    out.statusTone = out.statusLabel === 'LIVE' ? 'live' : 'default';
  }
  return out;
}

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

/** Date → scheduleStore date key YYYY-MM-DD */
function toScheduleDateKey(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

/** YYYY-MM-DD → Date（本地日历日）；非法则 null */
function parseScheduleDateKey(dateKey) {
  const parts = String(dateKey || '').split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/**
 * scheduleStore → 日程 TAB UI 卡片结构（WXML 仍用 dateDisplay/dayDisplay/note/remindees）
 * content→note，members→remindees（userId→id）
 */
function formatScheduleCards(list) {
  return (Array.isArray(list) ? list : []).map(function (item) {
    const dateObj = parseScheduleDateKey(item && item.date) || new Date();
    const members = item && Array.isArray(item.members) ? item.members : [];
    return {
      id: item && item.id != null ? item.id : '',
      dateDisplay: formatScheduleDate(dateObj),
      dayDisplay: formatScheduleDay(dateObj),
      note: item && item.content != null ? String(item.content) : '',
      remindees: members.map(function (m) {
        return {
          id: m && m.userId != null ? String(m.userId) : '',
          name: m && m.name != null ? String(m.name) : '',
          avatar: m && m.avatar != null ? String(m.avatar) : ''
        };
      }),
      removing: false
    };
  });
}

Page({
  data: {
    theme: 'bright',
    themeClass: 'bright-mode',
    fontScale: 'normal',
    fontScaleClass: 'font-normal',
    themeIcon: 'moon',
    currentMainSection: 'home',
    primaryTabActive: true,
    secondaryTabActive: false,
    tertiaryTabActive: false,
    tertiaryTabVisible: true,
    primaryTabText: '我的',
    secondaryTabText: '日程',
    tertiaryTabText: '报名',
    registrationSegment: 'all',
    heroTabsVisible: true,
    showMyContent: true,
    showScheduleContent: false,
    showTournamentContent: false,
    showProfileContent: false,
    showPlazaContent: false,
    showPlazaTournamentContent: false,
    plazaCards: [],
    plazaTournamentCards: [],
    bottomNavActive: 'home',
    /** 路径红点：由未读通知事件动态计算（非固定布尔） */
    profileNotifyBadge: false,
    contactsNotifyBadge: false,
    createOverlayVisible: false,
    createOverlayOpen: false,
    moreCreateVisible: false,
    calendarPickerVisible: false,
    calendarPanelOpen: false,
    scheduleRemindPickerVisible: false,
    scheduleRemindPanelOpen: false,
    editProfileVisible: false,
    editProfileOpen: false,
    userProfile: {
      nickname: '',
      competitionName: '',
      avatar: '',
      handicap: null,
      floatCoef: null
    },
    profileEditDraft: { nickname: '', competitionName: '' },
    bannerPickerVisible: false,
    profileBannerImg: 'https://cdn.screenshottocode.com/fjGiYQjgxR_OzO3H9s1OQ.png',
    homeBannerImg: bannerConfig.getHomeBanner(),
    calendarMonthYear: '',
    calendarDays: [],
    scheduleCards: [],
    scheduleCalendarYear: new Date().getFullYear(),
    scheduleCalendarMonth: new Date().getMonth() + 1,
    eventsByDate: {},
    scheduleDaySheetVisible: false,
    scheduleDaySheetDate: '',
    scheduleDaySheetEvents: [],
    scheduleEditorVisible: false,
    scheduleEditorDate: '',
    scheduleEditorSchedule: null,
    scheduleEditorMode: 'schedule',
    scheduleRemindPickerForEditor: false,
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
        displayAvatars: [
          'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=100',
          'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=100',
          'https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?w=100'
        ],
        title: '周末业余挑战赛',
        progressWidth: '25%',
        progressMarkerLeft: gameProgress.buildMarkerLeft(4),
        progressMarkerText: '04',
        progressFinish: false,
        venue: '佘山国际高尔夫俱乐部',
        date: '2025/07/20',
        views: '64',
        type: 'tour',
        navUrl: '/subpackages/scoring/pages/score/index?gameId=demo-weekend-amateur&groupIndex=0'
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
        displayAvatars: [
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
        navUrl: '/subpackages/scoring/pages/score/index?mode=fourball_best'
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
        navUrl: '/subpackages/tournament/pages/detail/index?matchId=demo-jiaobei-beer'
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
        navUrl: '/subpackages/tournament/pages/detail/index?matchId=demo-jiaobei-beer'
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
        navUrl: '/subpackages/tournament/pages/detail/index'
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
        navUrl: '/subpackages/tournament/pages/detail/index'
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
    this._syncFontScale();
    this.refreshUserProfile();
    this.setData({
      scheduleCalendarYear: this.getCurrentCalendarYear(),
      scheduleCalendarMonth: new Date().getMonth() + 1
    });
    this._refreshScheduleCards();
    this._buildScheduleEventsByDate();
    if (options && options.section === 'profile') {
      this.showProfileSection();
    } else if (options && options.section === 'tournament') {
      this.showTournamentSection();
    } else if (options && options.section === 'plaza') {
      // 开始比赛成功等入口：广场；tab=tournament → 「球队比赛」TAB
      this.showPlazaSection();
      if (String(options.tab || '') === 'tournament') {
        this.switchTopTab({ currentTarget: { dataset: { which: 'secondary' } } });
      }
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
    this._syncFontScale();
    this.refreshUserProfile();
    // 首页演示 GAME：仅首次写入，不覆盖用户测试数据
    demoWeekendAmateurGame.ensureDemoWeekendAmateurGame();
    // 每次显示刷新进行中 GAME（持久化数据源 → 返回首页不丢失、刷新可恢复）
    this.refreshGames();
    this.refreshTeamMatchCards();
    this._refreshScheduleCards();
    this._buildScheduleEventsByDate();
    this.setData({
      profileNotifyBadge: contactNotifyStore.hasUnreadForPath(
        contactNotifyStore.TARGET.PROFILE
      ),
      contactsNotifyBadge: contactNotifyStore.hasUnreadForPath(
        contactNotifyStore.TARGET.CONTACTS
      )
    });
  },

  /** 从 scheduleStore 读取并映射为 UI scheduleCards（空库保持 []，无演示种子） */
  _refreshScheduleCards() {
    this.setData({
      scheduleCards: formatScheduleCards(this._getSchedulesForCurrentUser())
    });
  },

  /** 当前用户 userId（日程展示过滤用） */
  _getCurrentScheduleOwnerId() {
    const user = gameStore.getCurrentUser() || {};
    return String(user.userId || 'me');
  },

  /**
   * 仅展示 ownerId === 当前用户的日程（不改 store / 不删 friend_reminder 数据）
   * self / friend_reminder / team_match 均按 ownerId 归属过滤
   */
  _filterSchedulesForCurrentUser(list) {
    const ownerId = this._getCurrentScheduleOwnerId();
    return (Array.isArray(list) ? list : []).filter(function (item) {
      return item && String(item.ownerId || '') === ownerId;
    });
  },

  _getSchedulesForCurrentUser() {
    return this._filterSchedulesForCurrentUser(scheduleStore.getSchedules());
  },

  _getSchedulesByDateForCurrentUser(date) {
    return this._filterSchedulesForCurrentUser(
      scheduleStore.getSchedulesByDate(date)
    );
  },

  getCurrentCalendarYear() {
    return new Date().getFullYear();
  },

  /** 进入日程 TAB：定位到当前年 / 当前月 */
  _focusCurrentScheduleMonth() {
    const now = new Date();
    this.setData({
      scheduleCalendarYear: now.getFullYear(),
      scheduleCalendarMonth: now.getMonth() + 1
    });
  },

  /**
   * 滚动唯一容器 #home-scroll-main 到指定月份锚点（month-N）
   * 说明：首页 disableScroll=true，wx.pageScrollTo 无效，必须滚 ds-scroll-main。
   */
  _scrollMainToScheduleMonth(month, attempt) {
    const tryCount = attempt || 0;
    let targetMonth = Number(month);
    if (!targetMonth || targetMonth < 1 || targetMonth > 12) {
      targetMonth = Number(this.data.scheduleCalendarMonth) || new Date().getMonth() + 1;
    }
    const anchorId = '#month-' + targetMonth;
    const cal = this.selectComponent('#schedule-calendar');
    if (!cal) {
      if (tryCount < 8) {
        setTimeout(() => {
          this._scrollMainToScheduleMonth(targetMonth, tryCount + 1);
        }, 50);
      }
      return;
    }

    const stickyOffset = 56; // 吸顶 TAB 高度余量
    wx.createSelectorQuery()
      .in(cal)
      .select(anchorId)
      .boundingClientRect()
      .exec((monthRes) => {
        const monthRect = monthRes && monthRes[0];
        if (!monthRect) {
          if (tryCount < 8) {
            setTimeout(() => {
              this._scrollMainToScheduleMonth(targetMonth, tryCount + 1);
            }, 50);
          }
          return;
        }

        this.createSelectorQuery()
          .select('#home-scroll-main')
          .boundingClientRect()
          .select('#home-scroll-main')
          .scrollOffset()
          .select('#home-scroll-main')
          .node()
          .exec((mainRes) => {
            const containerRect = mainRes && mainRes[0];
            const scrollInfo = mainRes && mainRes[1];
            const nodeWrap = mainRes && mainRes[2];
            if (!containerRect) return;

            const currentTop =
              scrollInfo && typeof scrollInfo.scrollTop === 'number'
                ? scrollInfo.scrollTop
                : nodeWrap && nodeWrap.node && typeof nodeWrap.node.scrollTop === 'number'
                  ? nodeWrap.node.scrollTop
                  : 0;
            const delta = monthRect.top - containerRect.top;
            const nextTop = Math.max(0, currentTop + delta - stickyOffset);
            const node = nodeWrap && nodeWrap.node;

            if (node && typeof node.scrollTo === 'function') {
              node.scrollTo({ top: nextTop, behavior: 'smooth' });
            } else if (node) {
              node.scrollTop = nextTop;
            } else {
              // 兜底：部分基础库无 node，尝试 pageScrollTo（通常无效于 disableScroll）
              try {
                wx.pageScrollTo({ scrollTop: nextTop, duration: 300 });
              } catch (e) {
                /* ignore */
              }
            }
          });
      });
  },

  changeCalendarYear(e) {
    const dir = Number(
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.dir
        : 0
    );
    if (!dir) return;
    const year = Number(this.data.scheduleCalendarYear) || this.getCurrentCalendarYear();
    this.setData({ scheduleCalendarYear: year + dir }, () => {
      setTimeout(() => {
        this._scrollMainToScheduleMonth(this.data.scheduleCalendarMonth);
      }, 80);
    });
  },

  /**
   * scheduleStore → 日历 eventsByDate（同日多事件合并为数组）
   * 仅当前用户 ownerId；不接 gameStore / teamMatchStore
   */
  _buildScheduleEventsByDate() {
    const list = this._getSchedulesForCurrentUser();
    const map = {};
    (Array.isArray(list) ? list : []).forEach(function (item) {
      if (!item || !item.date) return;
      const key = String(item.date);
      if (!map[key]) map[key] = [];
      map[key].push({
        id: item.id,
        type: item.type || 'manual',
        content: item.content != null ? String(item.content) : ''
      });
    });
    this.setData({ eventsByDate: map });
  },

  /** day-sheet 展示用：附带 sourceType / sourceId / note（不改 store） */
  _mapDaySheetEvents(list) {
    return (Array.isArray(list) ? list : []).map(function (item) {
      return {
        id: item.id,
        content: item.content != null ? String(item.content) : '',
        note: item.note != null ? String(item.note) : '',
        members: Array.isArray(item.members) ? item.members : [],
        sourceType: item.sourceType != null ? String(item.sourceType) : 'self',
        sourceId: item.sourceId != null ? String(item.sourceId) : ''
      };
    });
  },

  /** 打开某日日程列表 Sheet */
  onScheduleDateTap(e) {
    const date =
      e && e.detail && e.detail.date != null ? String(e.detail.date) : '';
    if (!date) return;
    const events = this._mapDaySheetEvents(
      sortSchedules(this._getSchedulesByDateForCurrentUser(date))
    );
    this.setData({
      scheduleDaySheetVisible: true,
      scheduleDaySheetDate: date,
      scheduleDaySheetEvents: events
    });
  },

  onScheduleDaySheetClose() {
    this.setData({
      scheduleDaySheetVisible: false,
      scheduleDaySheetEvents: []
    });
  },

  onScheduleDaySheetAdd(e) {
    const date =
      e && e.detail && e.detail.date != null
        ? String(e.detail.date)
        : this.data.scheduleDaySheetDate;
    this.setData({
      scheduleEditorVisible: true,
      scheduleEditorDate: date || '',
      scheduleEditorSchedule: null,
      scheduleEditorMode: 'schedule'
    });
  },

  onScheduleDaySheetEdit(e) {
    const id = e && e.detail && e.detail.id != null ? String(e.detail.id) : '';
    if (!id) return;
    const found = scheduleStore.getScheduleById(id);
    if (!found) return;
    if (String(found.sourceType || '') === 'team_match') {
      console.warn('[onScheduleDaySheetEdit] team_match is read-only', id);
      return;
    }
    this.setData({
      scheduleEditorVisible: true,
      scheduleEditorDate: found.date || this.data.scheduleDaySheetDate,
      scheduleEditorSchedule: found,
      scheduleEditorMode: 'schedule'
    });
  },

  onScheduleViewMatch(e) {
    const matchId =
      e && e.detail && e.detail.matchId != null ? String(e.detail.matchId) : '';
    if (!matchId) return;
    wx.navigateTo({
      url: '/subpackages/tournament/pages/detail/index?matchId=' + encodeURIComponent(matchId)
    });
  },

  /** 球队赛日程：打开个人备注编辑（不改 content/date） */
  onScheduleEditNote(e) {
    const id = e && e.detail && e.detail.id != null ? String(e.detail.id) : '';
    if (!id) return;
    const found = scheduleStore.getScheduleById(id);
    if (!found) return;
    if (String(found.sourceType || '') !== 'team_match') {
      console.warn('[onScheduleEditNote] only team_match', id);
      return;
    }
    this.setData({
      scheduleEditorVisible: true,
      scheduleEditorDate: found.date || this.data.scheduleDaySheetDate,
      scheduleEditorSchedule: Object.assign({}, found, {
        note: found.note != null ? String(found.note) : ''
      }),
      scheduleEditorMode: 'note'
    });
  },

  /** 仅保存 note，不改 content / date / source* */
  saveScheduleNoteFromEditor(e) {
    const detail = e && e.detail ? e.detail : {};
    const scheduleId = detail.scheduleId ? String(detail.scheduleId) : '';
    if (!scheduleId) {
      wx.showToast({ title: '日程缺失', icon: 'none' });
      return;
    }
    const existing = scheduleStore.getScheduleById(scheduleId);
    if (!existing || String(existing.sourceType || '') !== 'team_match') {
      console.warn('[saveScheduleNoteFromEditor] blocked', scheduleId);
      return;
    }
    const note = detail.note != null ? String(detail.note) : '';
    scheduleStore.updateSchedule(scheduleId, { note: note });
    this._refreshScheduleDaySheet(existing.date || this.data.scheduleDaySheetDate);
    this._buildScheduleEventsByDate();
    this._refreshScheduleCards();
    wx.showToast({ title: '备注已保存', icon: 'success' });
  },

  onScheduleEditorClose() {
    this.setData({
      scheduleEditorVisible: false,
      scheduleEditorSchedule: null,
      scheduleEditorMode: 'schedule'
    });
  },

  onScheduleEditorOpenMemberPicker(e) {
    const selectedIds =
      e && e.detail && Array.isArray(e.detail.selectedIds)
        ? e.detail.selectedIds.slice()
        : [];
    this.setData({
      scheduleRemindPickerForEditor: true,
      activeRemindScheduleCardIndex: null,
      scheduleRemindSearch: '',
      tempRemindeeSelection: selectedIds,
      scheduleRemindPickerVisible: true
    });
    this.renderScheduleFriendList();
    setTimeout(() => {
      this.setData({ scheduleRemindPanelOpen: true });
    }, 10);
  },

  /** 刷新某日 day-sheet 列表（编辑/删除后） */
  _refreshScheduleDaySheet(date) {
    const key = String(date || this.data.scheduleDaySheetDate || '');
    if (!key) {
      this.setData({
        scheduleDaySheetEvents: [],
        scheduleEditorVisible: false,
        scheduleEditorSchedule: null,
        scheduleEditorMode: 'schedule'
      });
      return;
    }
    const dayEvents = this._mapDaySheetEvents(
      sortSchedules(this._getSchedulesByDateForCurrentUser(key))
    );
    this.setData({
      scheduleDaySheetDate: key,
      scheduleDaySheetEvents: dayEvents,
      scheduleDaySheetVisible: true,
      scheduleEditorVisible: false,
      scheduleEditorSchedule: null,
      scheduleEditorMode: 'schedule'
    });
  },

  /**
   * 编辑器保存：
   * - 编辑：仅 updateSchedule，不生成 friend_reminder 副本
   * - 新增：createSchedule(self) + 每位好友 friend_reminder
   * - team_match：禁止保存
   */
  saveScheduleFromEditor(e) {
    const detail = e && e.detail ? e.detail : {};
    const date = String(detail.date || '');
    const content = String(detail.content || '').trim();
    const remindees = Array.isArray(detail.remindees) ? detail.remindees : [];
    const scheduleId = detail.scheduleId ? String(detail.scheduleId) : '';
    if (!date || !content) {
      wx.showToast({ title: '请完善日程', icon: 'none' });
      return;
    }

    if (scheduleId) {
      const existing = scheduleStore.getScheduleById(scheduleId);
      if (existing && String(existing.sourceType || '') === 'team_match') {
        console.warn('[saveScheduleFromEditor] blocked team_match save', scheduleId);
        return;
      }
    }

    const user = gameStore.getCurrentUser() || {};
    const currentUserId = String(user.userId || 'me');

    if (scheduleId) {
      scheduleStore.updateSchedule(scheduleId, {
        date: date,
        content: content,
        members: remindees
      });
    } else {
      scheduleStore.createSchedule({
        type: 'manual',
        date: date,
        content: content,
        ownerId: currentUserId,
        sourceType: 'self',
        members: remindees
      });
      remindees.forEach(function (member) {
        if (!member || !member.userId) return;
        scheduleStore.createSchedule({
          type: 'manual',
          date: date,
          content: content,
          ownerId: String(member.userId),
          sourceType: 'friend_reminder',
          sourceUserId: currentUserId,
          members: []
        });
      });
    }

    this._refreshScheduleCards();
    this._buildScheduleEventsByDate();
    this._refreshScheduleDaySheet(date);
    wx.showToast({ title: scheduleId ? '已修改' : '已保存', icon: 'success' });
  },

  /**
   * 编辑器删除：只删当前这条，不影响对方独立副本
   */
  deleteScheduleFromEditor(e) {
    const id = e && e.detail && e.detail.id != null ? String(e.detail.id) : '';
    if (!id) return;
    const existing = scheduleStore.getScheduleById(id);
    const date = existing && existing.date
      ? String(existing.date)
      : this.data.scheduleDaySheetDate;
    scheduleStore.deleteSchedule(id);
    this._refreshScheduleCards();
    this._buildScheduleEventsByDate();
    this._refreshScheduleDaySheet(date);
    wx.showToast({ title: '已删除', icon: 'success' });
  },

  /** 读取全局字体大小偏好（显示设置 → fontScale_global） */
  _getFontScale() {
    try {
      const value = wx.getStorageSync('fontScale_global');
      return value === 'large' ? 'large' : 'normal';
    } catch (e) {
      return 'normal';
    }
  },

  /** 将 fontScale_global 同步到本页 class（仅显示层） */
  _syncFontScale() {
    const fontScale = this._getFontScale();
    this.setData({
      fontScale: fontScale,
      fontScaleClass: fontScale === 'large' ? 'font-large' : 'font-normal'
    });
  },

  refreshUserProfile() {
    const profile = userProfileStore.loadProfile();
    const nationalityName = String(profile.nationalityName || '').trim();
    const regionDisplayName = geoCatalog.formatRegionDisplayName(profile);
    this.setData({
      userProfile: {
        nickname: profile.nickname || '',
        competitionName: profile.competitionName || '',
        avatar: profile.avatar || userProfileStore.DEFAULT_AVATAR,
        handicap: profile.handicap,
        floatCoef: profile.floatCoef,
        nationalityName: nationalityName,
        nationalityText: nationalityName || '未设置',
        regionDisplayName: regionDisplayName,
        regionText: regionDisplayName || '未设置'
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
    const demoId = demoWeekendAmateurGame.DEMO_WEEKEND_AMATEUR_GAME_ID;
    const hasDemoDynamic = myGameCards.some(
      (c) => c && (c.gameId === demoId || c.id === demoId)
    );
    // 动态卡已有 demo-weekend-amateur 时隐藏静态演示卡，避免双卡
    const base = (this._baseMyCards || []).filter((c) => {
      if (!hasDemoDynamic) return true;
      return !(c && c.id === 'my-1');
    });
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
    const displayAvatars = avatars.slice(0, 9);
    // 多组 Game → 进入 Game Hub 控制页；单组 → 直接进入记分
    const multi = Array.isArray(g.groups) && g.groups.length > 1;
    const navUrl = multi
      ? '/pages/game/hub/index?gameId=' + g.gameId
      : '/subpackages/scoring/pages/score/index?gameId=' + g.gameId + '&groupIndex=0';
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
      displayAvatars: displayAvatars,
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

  /** Series roster 领域身份：无法解析则空串（不猜测） */
  _resolveListPlayerId() {
    try {
      const user = gameStore.getCurrentUser() || {};
      const resolved = seriesRegistration.resolveActorPlayerId(user);
      if (resolved && resolved.ok && resolved.playerId) {
        return String(resolved.playerId);
      }
    } catch (e) {
      /* ignore */
    }
    return '';
  },

  _seriesListDeps() {
    const user = gameStore.getCurrentUser() || {};
    return {
      listMatches: function () {
        try {
          return teamMatchStore.listMatches() || [];
        } catch (e) {
          return [];
        }
      },
      listSeries: function () {
        try {
          return seriesStore.listSeries() || [];
        } catch (e) {
          return [];
        }
      },
      getMatchById: function (id) {
        try {
          return teamMatchStore.getMatchById(id);
        } catch (e) {
          return null;
        }
      },
      // 普通「我的报名」沿用既有 userId 口径
      currentUserId: String(user.userId || 'me'),
      // Series「我的报名」仅用可解析 playerId
      currentPlayerId: this._resolveListPlayerId(),
      toOrdinaryCard: function (m) {
        return teamMatchStore.toTournamentCard(m);
      },
      decorateOrdinaryCard: function (m, card) {
        return decorateTournamentCard(m, card);
      }
    };
  },

  /** 报名 TAB「所有报名」：只读 list/滤/投影；零写入 Series storage */
  _buildAllRegisteringTournamentCards() {
    try {
      return seriesListCardAdapter.buildRegistrationAllCards(this._seriesListDeps());
    } catch (e) {
      return [];
    }
  },

  /** 报名 TAB「我的报名」：只读；零写入 */
  _buildMyRegisteredTournamentCards() {
    try {
      return seriesListCardAdapter.buildRegistrationMineCards(this._seriesListDeps());
    } catch (e) {
      return [];
    }
  },

  refreshTeamMatchCards() {
    const allCards = this._buildAllRegisteringTournamentCards();
    this._myTournamentCards = allCards;
    if (
      this.data.currentMainSection === 'home' &&
      this.data.tertiaryTabActive
    ) {
      const cards =
        this.data.registrationSegment === 'mine'
          ? this._buildMyRegisteredTournamentCards()
          : allCards;
      this.setData({ tournamentCards: cards });
    }
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

  /** 首页三态：primary=我的 / secondary=日程 / tertiary=报名；广场仅用 primary|secondary */
  setTabActive(which) {
    this.setData({
      primaryTabActive: which === 'primary',
      secondaryTabActive: which === 'secondary',
      tertiaryTabActive: which === 'tertiary'
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
      showPlazaContent: false,
      showPlazaTournamentContent: false
    });
  },

  /** 广场「团体比赛」：普通 ongoing/finished（滤托管分站）+ 聚合 Series LIVE/已结束 */
  _buildPlazaTournamentCards() {
    try {
      return seriesListCardAdapter.buildPlazaTournamentCards(this._seriesListDeps());
    } catch (e) {
      return [];
    }
  },

  setHeroTabsVisible(visible) {
    this.setData({ heroTabsVisible: visible });
  },

  showHomeSection() {
    this.setData({
      currentMainSection: 'home',
      primaryTabText: '我的',
      secondaryTabText: '日程',
      tertiaryTabText: '报名',
      tertiaryTabVisible: true
    });
    this.setHeroTabsVisible(true);
    this.hideMainContents();
    this.setData({ showMyContent: true });
    this.setTabActive('primary');
    this.setBottomNavActive('home');
  },

  showTournamentSection() {
    // 兼容旧的 ?section=tournament 和历史内部调用：报名现归入首页第三 TAB。
    this.showHomeSection();
    this.hideMainContents();
    const myCards = this._buildAllRegisteringTournamentCards();
    this._myTournamentCards = myCards;
    this.setData({
      registrationSegment: 'all',
      showTournamentContent: true,
      tournamentCards: myCards
    });
    this.setTabActive('tertiary');
    this.setBottomNavActive('home');
  },

  // 广场 TAB：顶部双 TAB（普通球局 / 球队比赛）
  showPlazaSection() {
    this.refreshGames();
    const plazaTournamentCards = this._buildPlazaTournamentCards();
    this.setData({
      currentMainSection: 'plaza',
      primaryTabText: '普通球局',
      secondaryTabText: '团体比赛',
      tertiaryTabVisible: false,
      plazaTournamentCards: plazaTournamentCards
    });
    this.setHeroTabsVisible(true);
    this.hideMainContents();
    this.setData({ showPlazaContent: true });
    this.setTabActive('primary');
    this.setBottomNavActive('plaza');
  },

  showProfileSection() {
    this.setData({ currentMainSection: 'profile', tertiaryTabVisible: false });
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
      if (which === 'tertiary') {
        const cards = this.data.registrationSegment === 'mine'
          ? this._buildMyRegisteredTournamentCards()
          : this._buildAllRegisteringTournamentCards();
        this._myTournamentCards = this._buildAllRegisteringTournamentCards();
        this.setData({ showTournamentContent: true, tournamentCards: cards });
      } else if (which === 'secondary') {
        this._focusCurrentScheduleMonth();
        this.setData({ showScheduleContent: true }, () => {
          setTimeout(() => {
            this._scrollMainToScheduleMonth(this.data.scheduleCalendarMonth);
          }, 80);
        });
      } else {
        this.setData({ showMyContent: true });
      }
    } else if (section === 'tournament') {
      // primary：所有报名；secondary：我的报名
      const cards = which === 'secondary'
        ? this._buildMyRegisteredTournamentCards()
        : (this._myTournamentCards || this._buildAllRegisteringTournamentCards());
      this.setData({
        showTournamentContent: true,
        tournamentCards: cards
      });
    } else if (section === 'plaza') {
      if (which === 'secondary') {
        const cards = (this.data.plazaTournamentCards && this.data.plazaTournamentCards.length)
          ? this.data.plazaTournamentCards
          : this._buildPlazaTournamentCards();
        this.setData({
          showPlazaTournamentContent: true,
          plazaTournamentCards: cards
        });
      } else {
        this.refreshGames();
        this.setData({ showPlazaContent: true });
      }
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

  switchRegistrationSegment(e) {
    const segment = e.currentTarget.dataset.segment === 'mine' ? 'mine' : 'all';
    const cards = segment === 'mine'
      ? this._buildMyRegisteredTournamentCards()
      : this._buildAllRegisteringTournamentCards();
    if (segment === 'all') this._myTournamentCards = cards;
    this.setData({ registrationSegment: segment, tournamentCards: cards });
  },

  navigateToMoments() {
    // 底部「球友圈」→ 公共动态流（player 分包，点击时再加载）
    wx.navigateTo({
      url: '/subpackages/player/pages/moments/index'
    });
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
    this.setData({
      createOverlayVisible: false,
      createOverlayOpen: false,
      moreCreateVisible: false
    });
    wx.navigateTo({
      url: '/subpackages/create/pages/normal/index',
      fail: () => {
        wx.showToast({ title: '页面尚未注册', icon: 'none' });
      }
    });
  },

  openTeamInternalCreate() {
    wx.navigateTo({
      url: '/subpackages/create/pages/team-internal/index',
      fail: () => {
        wx.showToast({ title: '页面尚未注册', icon: 'none' });
      }
    });
  },

  openTeamInterCreate() {
    wx.navigateTo({
      url: '/subpackages/create/pages/team-inter/index',
      fail: () => {
        wx.showToast({ title: '页面尚未注册', icon: 'none' });
      }
    });
  },

  openSeriesCreate() {
    wx.navigateTo({
      url: '/subpackages/create/pages/series/index',
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
    if (url.indexOf('/subpackages/scoring/pages/score/index') === 0) {
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

  navigateToHistory() {
    wx.navigateTo({
      url: '/pages/profile/history/index',
      fail: () => {
        wx.showToast({ title: '页面尚未注册', icon: 'none' });
      }
    });
  },

  navigateToContacts() {
    wx.navigateTo({
      url: '/pages/profile/contacts/index',
      fail: () => {
        wx.showToast({ title: '页面尚未注册', icon: 'none' });
      }
    });
  },

  navigateToStatistics() {
    wx.navigateTo({
      url: '/pages/profile/statistics/index',
      fail: () => {
        wx.showToast({ title: '页面尚未注册', icon: 'none' });
      }
    });
  },

  navigateToMyMoments() {
    if (this._openingMyMoments) return;
    this._openingMyMoments = true;
    wx.navigateTo({
      url: '/subpackages/player/pages/my-moments/index',
      complete: () => {
        this._openingMyMoments = false;
      },
      fail: () => {
        this._openingMyMoments = false;
        wx.showToast({ title: '页面尚未注册', icon: 'none' });
      }
    });
  },

  navigateToProfileEdit() {
    wx.navigateTo({
      url: '/pages/profile/edit/index',
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
    userProfileStore.updateProfile({
      nickname: draft.nickname != null ? String(draft.nickname).trim() : '',
      competitionName: draft.competitionName != null ? String(draft.competitionName).trim() : ''
    });
    this.refreshUserProfile();
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
    const card = idx != null ? this.data.scheduleCards[idx] : null;
    if (card && card.id) {
      scheduleStore.updateSchedule(card.id, { date: toScheduleDateKey(selected) });
      this._refreshScheduleCards();
    }
    this.closeCalendarPicker();
  },

  addNewSchedule() {
    const today = new Date();
    scheduleStore.createSchedule({
      date: toScheduleDateKey(today),
      content: '',
      members: []
    });
    this._refreshScheduleCards();
  },

  removeSchedule(e) {
    const index = e.currentTarget.dataset.index;
    const card = this.data.scheduleCards[index];
    if (!card) return;
    this.setData({ ['scheduleCards[' + index + '].removing']: true });
    setTimeout(() => {
      if (card.id) scheduleStore.deleteSchedule(card.id);
      this._refreshScheduleCards();
    }, 300);
  },

  onScheduleNoteInput(e) {
    const index = e.currentTarget.dataset.index;
    const card = this.data.scheduleCards[index];
    const note = e.detail.value;
    this.setData({ ['scheduleCards[' + index + '].note']: note });
    if (card && card.id) {
      scheduleStore.updateSchedule(card.id, { content: note });
    }
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
        activeRemindScheduleCardIndex: null,
        scheduleRemindPickerForEditor: false
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
    const selection = this.data.tempRemindeeSelection;
    const members = SCHEDULE_FRIENDS.filter(function (f) {
      return selection.indexOf(f.id) !== -1;
    }).map(function (f) {
      return {
        userId: f.id,
        name: f.name,
        avatar: f.avatar
      };
    });

    if (this.data.scheduleRemindPickerForEditor) {
      const editor = this.selectComponent('#schedule-editor-sheet');
      if (editor && typeof editor.setSelectedMembers === 'function') {
        editor.setSelectedMembers(members);
      }
      this.closeScheduleRemindeePicker();
      return;
    }

    const idx = this.data.activeRemindScheduleCardIndex;
    if (idx == null) {
      this.closeScheduleRemindeePicker();
      return;
    }
    const card = this.data.scheduleCards[idx];
    if (!card || !card.id) {
      this.closeScheduleRemindeePicker();
      return;
    }
    scheduleStore.updateSchedule(card.id, { members: members });
    this._refreshScheduleCards();
    this.closeScheduleRemindeePicker();
  }
});
