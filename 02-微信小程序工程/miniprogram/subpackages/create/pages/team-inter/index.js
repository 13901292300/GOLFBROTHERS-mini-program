const { createHeaderStyle } = require('../../../../utils/headerEngine.js');
const mockAvatars = require('../../../../utils/mockAvatars.js');
const partnerConfigUtil = require('../../../../utils/partnerConfig.js');
const teamMatchStore = require('../../../../utils/teamMatchStore.js');
const teamDirectory = require('../../../../utils/teamDirectory.js');
const {
  validateTeamMatchSideGroups,
  MATCH_TYPE_INTER_TEAM
} = require('../../../../utils/teamMatchCapabilities.js');
const matchManageAccess = require('../../../../utils/matchManageAccess.js');
const gameStore = require('../../../../utils/gameStore.js');
const scheduleStore = require('../../../../utils/scheduleStore.js');
const scheduleAdapter = require('../../../../utils/scheduleAdapter.js');
const {
  createDefaultEventInfoList
} = require('../../../../utils/eventInfoDefaults.js');

const MINUTE_VALUES = [0, 10, 20, 30, 40, 50];
const WEEK_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

const TEAM_GAME_MODES = [
  { name: '个人比杆赛', desc: '每位球员独立记分，按总杆排名', icon: '🏌' },
  { name: '四人四球比杆赛', desc: '四人一组，按比杆赛规则计分', icon: '👥' },
  { name: '最佳球位比杆赛', desc: '选择最佳落点，按比杆赛计分', icon: '📍' },
  { name: '四人两球比杆赛', desc: '两人一队，按比杆赛规则计分', icon: '👥' },
  { name: '个人比洞赛', desc: '每位球员独立记分，按洞数胜负', icon: '🏌' },
  { name: '四人四球比洞赛', desc: '四人一组，按比洞赛规则计分', icon: '👥' },
  { name: '最佳球位比洞赛', desc: '选择最佳落点，按比洞赛计分', icon: '📍' },
  { name: '四人两球比洞赛', desc: '两人一队，按比洞赛规则计分', icon: '👥' }
];

const GAME_MODE_OPTIONS = TEAM_GAME_MODES.map((item) => item.name);

const MATCH_PLAY_MODES = [
  '个人比洞赛',
  '最好成绩比洞赛',
  '四人四球比洞赛',
  '最佳球位比洞赛',
  '四人两球比洞赛'
];

const MATCH_PLAY_TEAMS_TIP = '比洞赛有且只能有两支球队参与';

function isMatchPlayMode(name) {
  return MATCH_PLAY_MODES.indexOf(name) >= 0;
}

const RECOMMENDED_EVENT_INFO = [
  { title: '赛事介绍', type: 'text' },
  { title: '赛事规则', type: 'text' },
  { title: '奖项设置', type: 'text' },
  { title: '赞助商广告', type: 'image' },
  { title: '照片直播', type: 'text' },
  { title: '晚宴安排', type: 'text' }
];

const PHOTO_LIVE_TITLE = '照片直播';
const PHOTO_LIVE_LEGACY_TITLE = '交通说明';

function isPhotoLiveEventTitle(title) {
  const t = String(title || '').trim();
  return t === PHOTO_LIVE_TITLE || t === PHOTO_LIVE_LEGACY_TITLE;
}

function isValidPhotoLiveHttpsUrl(url) {
  const s = String(url || '').trim();
  if (!s) return false;
  if (/^http:\/\//i.test(s)) return false;
  return /^https:\/\/.+/i.test(s);
}

const EVENT_INFO_ROW_GAP_RPX = 16;
const EVENT_INFO_ROW_HEIGHT_RPX = 128;
const EVENT_INFO_ROW_STEP_RPX = EVENT_INFO_ROW_HEIGHT_RPX + EVENT_INFO_ROW_GAP_RPX;

const EMPTY_ORG_LABEL = '请选择组织机构';
const EMPTY_ORG_LOGO =
  'https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/miniprogram/mock-avatars/default-avatar.jpg';

const DEFAULT_FEE_LIST = [
  { id: 1, name: '正式队员', amount: '0' },
  { id: 2, name: '嘉宾', amount: '0' }
];

/** 队际赛：PK 默认开启（G1–G4 且参赛队≥2 时展示） */
const DEFAULT_TEAM_COMPETITION = {
  enabled: true,
  topN: 3
};
const ROUND_NAME_SUFFIX = '联谊赛';

/** 首帧即展示默认公共机构，避免 onLoad 前闪「请选择」 */
const BOOTSTRAP_ORG = teamDirectory.getDefaultInterTeamOrganizer() || null;
const BOOTSTRAP_ORG_ID = BOOTSTRAP_ORG && BOOTSTRAP_ORG.id ? String(BOOTSTRAP_ORG.id) : '';
const BOOTSTRAP_ORG_NAME =
  BOOTSTRAP_ORG && BOOTSTRAP_ORG.name ? String(BOOTSTRAP_ORG.name) : EMPTY_ORG_LABEL;
const BOOTSTRAP_ORG_LOGO =
  BOOTSTRAP_ORG && BOOTSTRAP_ORG.logo ? String(BOOTSTRAP_ORG.logo) : EMPTY_ORG_LOGO;
const BOOTSTRAP_ORG_IS_DEFAULT = !!(BOOTSTRAP_ORG && BOOTSTRAP_ORG.isDefaultInterTeamOrganizer);

function buildEventTitleMapForList(list) {
  const map = {};
  (list || []).forEach((item) => {
    if (item && item.title) map[item.title] = true;
  });
  // 照片直播 ↔ 交通说明 视为同一项，避免重复添加
  if (map[PHOTO_LIVE_TITLE] || map[PHOTO_LIVE_LEGACY_TITLE]) {
    map[PHOTO_LIVE_TITLE] = true;
    map[PHOTO_LIVE_LEGACY_TITLE] = true;
  }
  return map;
}

const DEFAULT_EVENT_INFO_LIST = createDefaultEventInfoList();

/**
 * 队际赛默认比赛名（仅创建页自动管理模式）：
 * - 2～4 队：按 teamGroups 顺序取本场简称 name，用 & 连接并追加「联谊赛」
 * - 0～1 或 ≥5 队：仅「联谊赛」（不生成单队名）
 * 空简称跳过，避免 undefined&…；有效简称不足 2 个时回退「联谊赛」。
 * @param {Array|{name?:string}|null|undefined} teamGroups
 * @returns {string}
 */
function buildDefaultRoundNameFromTeamGroups(teamGroups) {
  const groups = Array.isArray(teamGroups) ? teamGroups : [];
  const count = groups.length;
  if (count < 2 || count > 4) {
    return ROUND_NAME_SUFFIX;
  }
  const names = [];
  for (let i = 0; i < groups.length; i++) {
    const n = String((groups[i] && groups[i].name) || '').trim();
    if (n) names.push(n);
  }
  if (names.length < 2) {
    return ROUND_NAME_SUFFIX;
  }
  return names.join('&') + ROUND_NAME_SUFFIX;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getDaysInMonth(year, month) {
  return daysInMonth(year, month);
}

function formatDateTime(t) {
  return t.year + '-' + pad2(t.month) + '-' + pad2(t.day) + ' ' + pad2(t.hour) + ':' + pad2(t.minute);
}

function formatDisplayDateTime(t) {
  const weekday = WEEK_NAMES[new Date(t.year, t.month - 1, t.day).getDay()];
  return t.year + '/' + pad2(t.month) + '/' + pad2(t.day) + ' ' + weekday + ' ' + pad2(t.hour) + ':' + pad2(t.minute);
}

function formatTime(draft) {
  return formatDateTime(draft);
}

function parseTimeToDraft(timeString) {
  const m = String(timeString || '').match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!m) {
    return { year: 2026, month: 6, day: 3, hour: 9, minute: 0 };
  }
  let minute = parseInt(m[5], 10);
  if (MINUTE_VALUES.indexOf(minute) < 0) {
    minute = MINUTE_VALUES.reduce((best, cur) =>
      Math.abs(cur - minute) < Math.abs(best - minute) ? cur : best
    );
  }
  return {
    year: parseInt(m[1], 10),
    month: parseInt(m[2], 10),
    day: parseInt(m[3], 10),
    hour: parseInt(m[4], 10),
    minute
  };
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',

    pageEyebrow: 'CREATE',
    pageTitle: '队际赛创建',
    submitButtonText: '创建并开启报名',
    isEditMode: false,
    editMatchId: '',
    matchType: MATCH_TYPE_INTER_TEAM,
    matchPlayTeamsTip: MATCH_PLAY_TEAMS_TIP,

    organizationId: BOOTSTRAP_ORG_ID,
    organizationName: BOOTSTRAP_ORG_NAME,
    organizationLogo: BOOTSTRAP_ORG_LOGO,
    isDefaultInterTeamOrganizer: BOOTSTRAP_ORG_IS_DEFAULT,
    // 兼容 buildMatchFromCreatePage：与 organization* 同步
    teamId: BOOTSTRAP_ORG_ID,
    teamName: BOOTSTRAP_ORG_NAME,
    teamLogo: BOOTSTRAP_ORG_LOGO,
    teamRole: '',

    roundName: ROUND_NAME_SUFFIX,
    courseName: '',
    courseId: '',
    courseLocation: '',
    courseHalfText: '',
    front9Course: null,
    back9Course: null,

    teeTime: '2026-06-03 17:10',
    deadlineTime: '2026-06-02 18:00',
    teeTimeText: '2026/06/03 星期三 17:10',
    deadlineTimeText: '2026/06/02 星期二 18:00',

    selectedGameMode: '个人比杆赛',
    gameMode: '个人比杆赛',
    gameModeOptions: GAME_MODE_OPTIONS,
    gameModes: TEAM_GAME_MODES.map((item) => Object.assign({}, item, { disabled: false })),
    isMatchPlayMode: false,

    teamGroups: [],
    teamCompetition: Object.assign({}, DEFAULT_TEAM_COMPETITION),
    feeList: DEFAULT_FEE_LIST.slice(),
    draftFeeList: [],
    draftIsDiamondMode: false,
    showFeeSheet: false,
    nextFeeId: 3,
    isDiamondMode: false,
    feeSet: true,

    groupPermission: 'admin',

    eventInfoList: DEFAULT_EVENT_INFO_LIST.slice(),
    eventInfoSortAreaHeight:
      (DEFAULT_EVENT_INFO_LIST.length * EVENT_INFO_ROW_STEP_RPX - EVENT_INFO_ROW_GAP_RPX) + 'rpx',
    eventInfoDragPositions: [],
    eventInfoDraggingId: '',
    recommendedEventInfo: RECOMMENDED_EVENT_INFO,
    eventTitleAddedMap: buildEventTitleMapForList(DEFAULT_EVENT_INFO_LIST),

    showAddEventInfoSheet: false,
    showEventDetailSheet: false,
    selectedRecommendIndex: null,
    manualInfoType: 'text',
    customEventInfoTitle: '',

    editingEventInfoIndex: -1,
    eventDetailDraft: {
      title: '',
      type: 'text',
      content: '',
      brightImage: '',
      darkImage: '',
      status: '未设置',
      isPhotoLive: false
    },
    eventDetailEditLabel: '',
    deleteConfirming: false,
    deleteBtnText: '删除本项',

    visibility: 'public',
    accessCode: '',

    partnerConfig: partnerConfigUtil.createDefaultPartnerConfig(''),

    showGameModeSheet: false,
    showTimePicker: false,
    showTimeWheel: false,
    activeTimeTarget: 'tee',
    timePickerTitle: '选择开球时间',
    timeWheelTitle: '选择开球时间',
    timeDraft: { year: 2026, month: 6, day: 3, hour: 17, minute: 10 },
    timePickerValue: [5, 2, 17, 1],

    teeYear: 2026,
    months: [],
    days: [],
    hours: [],
    minutes: [],
    teeIndex: [5, 2, 17, 1],
    wheelIndex: [5, 2, 17, 1]
  },

  onLoad(options) {
    // 页面级 dirty：用户手改比赛名后为 true；不写入 Match 持久化
    this._roundNameManual = false;
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());

    if (options && options.mode === 'edit' && options.matchId) {
      this._initEditMode(decodeURIComponent(options.matchId));
      return;
    }

    this._tee = parseTimeToDraft('2026-06-03 17:10');
    this._deadline = parseTimeToDraft('2026-06-02 18:00');
    this._editingTime = Object.assign({}, this._tee);
    this._activeTimeTarget = 'tee';
    this.setData(
      Object.assign(
        this._buildDefaultOrganizerPatch(),
        this._buildEventInfoSortMeta(this.data.eventInfoList),
        {
          teamGroups: [],
          teamCompetition: Object.assign({}, DEFAULT_TEAM_COMPETITION),
          matchType: MATCH_TYPE_INTER_TEAM,
          gameModes: this._buildGameModesWithAvailability([]),
          roundName: buildDefaultRoundNameFromTeamGroups([])
        }
      )
    );
  },

  /**
   * 自动管理模式下按当前 teamGroups 写回 roundName；手工 dirty 时不覆盖。
   * @param {object} patch
   * @param {Array|null|undefined} teamGroups
   * @returns {object}
   */
  _applyAutoRoundNameIfNeeded(patch, teamGroups) {
    const next = patch || {};
    if (!this._roundNameManual) {
      next.roundName = buildDefaultRoundNameFromTeamGroups(teamGroups);
    }
    return next;
  },

  _buildDefaultOrganizerPatch() {
    const org = teamDirectory.getDefaultInterTeamOrganizer();
    const organizationId = org && org.id ? String(org.id) : '';
    const organizationName = org && org.name ? String(org.name) : EMPTY_ORG_LABEL;
    const organizationLogo =
      org && org.logo ? String(org.logo) : EMPTY_ORG_LOGO;
    const isDefault = !!(org && org.isDefaultInterTeamOrganizer);
    return {
      organizationId: organizationId,
      organizationName: organizationName,
      organizationLogo: organizationLogo,
      isDefaultInterTeamOrganizer: isDefault,
      teamId: organizationId,
      teamName: organizationName,
      teamLogo: organizationLogo,
      teamRole: '',
      partnerConfig: partnerConfigUtil.createDefaultPartnerConfig(organizationName)
    };
  },

  _initEditMode(matchId) {
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '未找到比赛信息', icon: 'none' });
      setTimeout(() => this.onBack(), 600);
      return;
    }

    const status = String(match.status || '').toLowerCase();
    if (status === 'completed' || status === 'finished') {
      wx.showToast({ title: '比赛已结束，无法编辑', icon: 'none' });
      setTimeout(() => this.onBack(), 600);
      return;
    }

    if (String(match.matchType || '').trim() !== MATCH_TYPE_INTER_TEAM) {
      wx.showToast({ title: '非队际赛，无法在此编辑', icon: 'none' });
      setTimeout(() => this.onBack(), 600);
      return;
    }

    if (
      !matchManageAccess.hasMatchManagePermission(
        match,
        gameStore.getCurrentUser(),
        'edit_match'
      )
    ) {
      wx.showToast({ title: '暂无修改比赛权限', icon: 'none' });
      setTimeout(() => this.onBack(), 600);
      return;
    }

    const form = teamMatchStore.hydrateCreatePageFromMatch(match);
    if (!form) {
      wx.showToast({ title: '未找到比赛信息', icon: 'none' });
      setTimeout(() => this.onBack(), 600);
      return;
    }

    const teeDraft = parseTimeToDraft(form.teeTime || '2026-06-03 17:10');
    const deadlineDraft = parseTimeToDraft(form.deadlineTime || '2026-06-02 18:00');
    this._tee = teeDraft;
    this._deadline = deadlineDraft;
    this._editingTime = Object.assign({}, teeDraft);
    this._activeTimeTarget = 'tee';
    this._editMatchId = matchId;
    this._roundNameManual = true;
    // 编辑页：记录进入时已落盘赛制，保存失败时仅回滚赛制 UI（不碰 teamGroups）
    this._originalGameMode = form.gameMode || '个人比杆赛';

    const teamGroups = this._cloneTeamGroups(form.teamGroups || []);
    const feeList = (form.feeList && form.feeList.length)
      ? form.feeList.slice()
      : DEFAULT_FEE_LIST.slice();
    const eventInfoList = (form.eventInfoList && form.eventInfoList.length)
      ? form.eventInfoList.slice()
      : DEFAULT_EVENT_INFO_LIST.slice();
    const gameMode = form.gameMode || '个人比杆赛';
    const teamCompetition = this._normalizeTeamCompetition(form.teamCompetition);
    const matchPlay = isMatchPlayMode(gameMode);
    const maxFeeId = feeList.reduce((max, f) => Math.max(max, Number(f.id) || 0), 0);

    const organizationId = String(
      form.organizationId || form.teamId || ''
    ).trim();
    const organizationName = String(
      form.organizationName || form.teamName || EMPTY_ORG_LABEL
    ).trim() || EMPTY_ORG_LABEL;
    // 本场专用 LOGO：优先旧「LOGO配置」custom，否则 organizationLogo / teamLogo
    const legacyCustomLogo =
      form.logoConfig &&
      form.logoConfig.type === 'custom' &&
      form.logoConfig.url
        ? String(form.logoConfig.url).trim()
        : '';
    const organizationLogo =
      legacyCustomLogo ||
      String(form.organizationLogo || form.teamLogo || EMPTY_ORG_LOGO).trim() ||
      EMPTY_ORG_LOGO;
    const orgMeta = organizationId ? teamDirectory.getTeamById(organizationId) : null;
    const isDefaultInterTeamOrganizer = !!(
      orgMeta && orgMeta.isDefaultInterTeamOrganizer
    );

    const partnerConfig = partnerConfigUtil.loadPartnerConfig(organizationName || '');
    const teeTimeText = form.teeTimeText || formatDisplayDateTime(teeDraft);
    const deadlineTimeText = form.deadlineTimeText || formatDisplayDateTime(deadlineDraft);

    const patch = Object.assign(
      {
        isEditMode: true,
        editMatchId: matchId,
        pageEyebrow: 'EDIT',
        pageTitle: '队际赛编辑',
        submitButtonText: '保存修改',
        matchType: MATCH_TYPE_INTER_TEAM,
        organizationId: organizationId,
        organizationName: organizationName,
        organizationLogo: organizationLogo,
        isDefaultInterTeamOrganizer: isDefaultInterTeamOrganizer,
        teamId: organizationId,
        teamName: organizationName,
        teamLogo: organizationLogo,
        teamRole: '',
        roundName: form.roundName || '',
        courseId: form.courseId || '',
        courseName: form.courseName || '',
        courseLocation: form.courseLocation || '',
        courseHalfText: form.courseHalfText || '',
        front9Course: form.front9Course || null,
        back9Course: form.back9Course || null,
        teeTime: form.teeTime || formatDateTime(teeDraft),
        teeTimeText: teeTimeText,
        deadlineTime: form.deadlineTime || formatDateTime(deadlineDraft),
        deadlineTimeText: deadlineTimeText,
        selectedGameMode: gameMode,
        gameMode: gameMode,
        isMatchPlayMode: matchPlay,
        gameModes: this._buildGameModesWithAvailability(teamGroups),
        teamGroups: teamGroups,
        teamCompetition: teamCompetition,
        feeList: feeList,
        nextFeeId: maxFeeId + 1,
        isDiamondMode: !!form.isDiamondMode,
        feeSet: form.feeSet != null ? !!form.feeSet : feeList.length > 0,
        groupPermission: form.groupPermission === 'player' ? 'player' : 'admin',
        visibility: form.visibility === 'private' ? 'private' : 'public',
        accessCode: form.accessCode || '',
        partnerConfig: partnerConfig,
        bannerImage: form.bannerImage || ''
      },
      this._buildEventInfoSortMeta(eventInfoList),
      {
        eventInfoList: eventInfoList,
        eventTitleAddedMap: this._buildEventTitleMap(eventInfoList)
      }
    );

    this.setData(patch);
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
  },

  onUnload() {
    if (this._deleteConfirmTimer) {
      clearTimeout(this._deleteConfirmTimer);
      this._deleteConfirmTimer = null;
    }
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle
    });
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  onBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.redirectTo({ url: '/pages/home/index' });
    }
  },

  noop() {},

  onRoundNameInput(e) {
    this._roundNameManual = true;
    this.setData({ roundName: e.detail.value });
  },

  _hasSelectedOrganization() {
    return !!String(this.data.organizationId || this.data.teamId || '').trim();
  },

  _syncOrganizerToTeamFields(patch) {
    const next = patch || {};
    if (next.organizationId != null) next.teamId = next.organizationId;
    if (next.organizationName != null) next.teamName = next.organizationName;
    if (next.organizationLogo != null) next.teamLogo = next.organizationLogo;
    return next;
  },

  _applySelectedOrganization(payload) {
    if (!payload) return;
    const hadOrg = this._hasSelectedOrganization();
    const prevName = hadOrg ? this.data.organizationName : '';
    const currentTitle = String(
      (this.data.partnerConfig && this.data.partnerConfig.partnerTitle) || ''
    ).trim();
    const organizationId = String(payload.organizationId || '').trim();
    const organizationName = String(payload.organizationName || '').trim();
    const organizationLogo =
      String(payload.organizationLogo || '').trim() ||
      mockAvatars.pickMockAvatar(organizationName || '');
    const updates = this._syncOrganizerToTeamFields({
      organizationId: organizationId,
      organizationName: organizationName || EMPTY_ORG_LABEL,
      organizationLogo: organizationLogo,
      isDefaultInterTeamOrganizer: !!payload.isDefaultInterTeamOrganizer,
      teamRole: ''
    });
    if (partnerConfigUtil.isDefaultPartnerTitle(currentTitle, prevName)) {
      updates['partnerConfig.partnerTitle'] = partnerConfigUtil.buildPartnerTitle(
        organizationName
      );
    }
    // 比赛名仅随参赛球队变化；改发起机构不覆盖 roundName
    this.setData(updates);
  },

  /** 机构选择页预填快照（完整对象走 eventChannel，URL 仅 mode） */
  _buildOrganizationInitPayload() {
    return {
      organizationId: String(this.data.organizationId || '').trim(),
      organizationName: String(this.data.organizationName || '').trim(),
      organizationLogo: String(this.data.organizationLogo || '').trim(),
      isDefaultInterTeamOrganizer: !!this.data.isDefaultInterTeamOrganizer,
      organizationType: 'event_org'
    };
  },

  onSelectOrganization() {
    const initPayload = this._buildOrganizationInitPayload();
    wx.navigateTo({
      url: '/pages/team/select/index?mode=event_org',
      success: (res) => {
        try {
          if (res && res.eventChannel && res.eventChannel.emit) {
            res.eventChannel.emit('initOrganization', initPayload);
          }
        } catch (e) {
          /* ignore */
        }
      },
      events: {
        organizationSelected: (payload) => {
          this._applySelectedOrganization(payload);
        }
      },
      fail: () => wx.showToast({ title: '页面尚未注册', icon: 'none' })
    });
  },

  onOrganizationNameInput(e) {
    if (!this.data.isDefaultInterTeamOrganizer) return;
    const name = e && e.detail ? e.detail.value : '';
    const updates = this._syncOrganizerToTeamFields({
      organizationName: name
    });
    this.setData(updates);
  },

  /**
   * 点击组织机构 LOGO：替换本场 organizationLogo / teamLogo 快照。
   * catchtap 阻止冒泡，不进入机构选择；不写组织目录主数据。
   */
  onChangeOrganizationLogo() {
    if (!this._hasSelectedOrganization()) {
      this.onSelectOrganization();
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        this._applyOrganizationLogoFile(file.tempFilePath);
      },
      fail: () => {
        // 取消或失败：保持原 LOGO，不清空
      }
    });
  },

  _applyOrganizationLogoFile(filePath) {
    if (!filePath) return;
    const apply = (url) => {
      if (!url) return;
      this.setData(
        this._syncOrganizerToTeamFields({
          organizationLogo: url
        })
      );
    };
    if (wx.cropImage) {
      wx.cropImage({
        src: filePath,
        cropScale: '1:1',
        success: (res) => {
          apply((res && res.tempFilePath) || filePath);
        },
        fail: () => {
          apply(filePath);
        }
      });
      return;
    }
    apply(filePath);
  },

  onSelectCourse() {
    wx.navigateTo({
      url: '/pages/course/select/index?selectedId=' + (this.data.courseId || ''),
      events: {
        courseSelected: (payload) => {
          if (!payload) return;
          this.setData({
            courseId: payload.courseId || '',
            courseName: payload.courseName || '',
            courseLocation: payload.courseLocation || '',
            courseHalfText: payload.halfText ? '（' + payload.halfText + '）' : '',
            front9Course: payload.front9Course || null,
            back9Course: payload.back9Course || null
          });
        }
      },
      fail: () => wx.showToast({ title: '页面尚未注册', icon: 'none' })
    });
  },

  _cloneTeamGroups(groups) {
    return (groups || []).map((item, index) => {
      const id = item && item.id != null ? item.id : 'itg-' + Date.now() + '-' + index;
      const shortName =
        item && item.sourceTeamShortName != null && String(item.sourceTeamShortName).trim() !== ''
          ? String(item.sourceTeamShortName).trim()
          : item && item.name
            ? String(item.name).trim()
            : '';
      return {
        id: id,
        renderKey: (item && item.renderKey) || ('team-group-' + id),
        name: shortName || (item && item.name) || '',
        sourceTeamId:
          item && item.sourceTeamId != null ? String(item.sourceTeamId).trim() : '',
        sourceTeamName:
          item && item.sourceTeamName != null ? String(item.sourceTeamName).trim() : '',
        sourceTeamShortName: shortName,
        sourceTeamLogo:
          item && item.sourceTeamLogo != null ? String(item.sourceTeamLogo).trim() : ''
      };
    });
  },

  _normalizeTeamCompetition(input) {
    const source = input && typeof input === 'object' ? input : {};
    let topN = Number(source.topN);
    if (!isFinite(topN) || topN < 1) topN = DEFAULT_TEAM_COMPETITION.topN;
    return {
      enabled: source.enabled === true,
      topN: Math.floor(topN)
    };
  },

  _buildGameModesWithAvailability(teamGroups) {
    const canMatchPlay = Array.isArray(teamGroups) && teamGroups.length === 2;
    return TEAM_GAME_MODES.map((item) =>
      Object.assign({}, item, {
        disabled: isMatchPlayMode(item.name) && !canMatchPlay
      })
    );
  },

  /**
   * 选赛制：只更新比洞标记与赛制选项可用性；永不自动增删参赛球队。
   */
  _getTeamGroupUpdatesForGameMode(gameMode) {
    return {
      isMatchPlayMode: isMatchPlayMode(gameMode),
      gameModes: this._buildGameModesWithAvailability(this.data.teamGroups || [])
    };
  },

  _teamGroupIdKey(id) {
    return id != null ? String(id).trim() : '';
  },

  /** 参赛球队选择页 URL：仅 mode / maxCount，完整已选对象走 eventChannel */
  _buildParticipantsNavigateUrl() {
    let url = '/pages/team/select/index?mode=inter_team_participants';
    if (this.data.isMatchPlayMode) {
      url += '&maxCount=2';
    }
    return url;
  },

  /**
   * 按当前 teamGroups 顺序构建选择页预填快照（含本场 group ID）。
   * 不序列化进 URL，由 eventChannel 传递。
   */
  _buildParticipantsInitPayload() {
    const groups = Array.isArray(this.data.teamGroups) ? this.data.teamGroups : [];
    const participants = [];
    groups.forEach((g, index) => {
      if (!g) return;
      const sourceTeamId =
        g.sourceTeamId != null ? String(g.sourceTeamId).trim() : '';
      if (!sourceTeamId) return;
      const shortName = String(g.sourceTeamShortName || g.name || '').trim();
      const groupId = g.id != null ? g.id : '';
      participants.push({
        id: groupId,
        groupId: groupId,
        sourceTeamId: sourceTeamId,
        sourceTeamName: String(g.sourceTeamName || '').trim(),
        sourceTeamShortName: shortName,
        sourceTeamLogo: String(g.sourceTeamLogo || '').trim(),
        name: shortName,
        order: index
      });
    });
    return { participants: participants };
  },

  onSelectParticipants() {
    const initPayload = this._buildParticipantsInitPayload();
    wx.navigateTo({
      url: this._buildParticipantsNavigateUrl(),
      success: (res) => {
        try {
          if (res && res.eventChannel && res.eventChannel.emit) {
            res.eventChannel.emit('initParticipants', initPayload);
          }
        } catch (e) {
          /* ignore */
        }
      },
      events: {
        participantsSelected: (payload) => {
          this._applyParticipantsSelected(payload);
        }
      },
      fail: () => wx.showToast({ title: '页面尚未注册', icon: 'none' })
    });
  },

  _applyParticipantsSelected(payload) {
    const participants =
      payload && Array.isArray(payload.participants) ? payload.participants : [];
    const existingBySource = {};
    const existingByGroupId = {};
    (this.data.teamGroups || []).forEach((g) => {
      if (!g) return;
      const sid = g.sourceTeamId != null ? String(g.sourceTeamId).trim() : '';
      if (sid) existingBySource[sid] = g;
      const gid = g.id != null ? String(g.id).trim() : '';
      if (gid) existingByGroupId[gid] = g;
    });
    const stamp = Date.now();
    const teamGroups = participants.map((p, index) => {
      const sid = p && p.sourceTeamId != null ? String(p.sourceTeamId).trim() : '';
      const incomingGroupId =
        p && (p.groupId != null || p.id != null)
          ? String(p.groupId != null ? p.groupId : p.id).trim()
          : '';
      const existing =
        (incomingGroupId && existingByGroupId[incomingGroupId]) ||
        (sid ? existingBySource[sid] : null) ||
        null;
      // 原有球队复用 group ID；仅新加入生成新 ID
      const id =
        existing && existing.id != null
          ? existing.id
          : incomingGroupId || 'itg-' + stamp + '-' + index;
      const shortName = String(
        (p && (p.sourceTeamShortName || p.name)) || ''
      ).trim();
      return {
        id: id,
        renderKey: 'team-group-' + id,
        name: shortName,
        sourceTeamId: sid,
        sourceTeamName: String((p && p.sourceTeamName) || '').trim(),
        sourceTeamShortName: shortName,
        sourceTeamLogo: String((p && p.sourceTeamLogo) || '').trim()
      };
    });
    this.setData(
      this._applyAutoRoundNameIfNeeded(
        {
          teamGroups: teamGroups,
          gameModes: this._buildGameModesWithAvailability(teamGroups)
        },
        teamGroups
      )
    );
  },

  _canRemoveParticipant(remainingCount) {
    const mode = this.data.gameMode || this.data.selectedGameMode || '';
    const current = Array.isArray(this.data.teamGroups) ? this.data.teamGroups.length : 0;
    if (isMatchPlayMode(mode)) {
      // 比洞必须保持恰好 2；当前合法时禁止再删
      if (current === 2) {
        return { ok: false, message: MATCH_PLAY_TEAMS_TIP };
      }
      return { ok: true };
    }
    // 比杆：已有合法 ≥2 时，不允许删到 <2
    if (current >= 2 && remainingCount < 2) {
      return { ok: false, message: '队际赛比杆赛至少选择 2 支参赛球队' };
    }
    return { ok: true };
  },

  /**
   * 保存时兜底：对被删参赛队下仍残留的报名人员做 purge（不迁移）。
   */
  _purgeUsersForRemovedGroups(oldTeamGroups, newTeamGroups, match) {
    if (!match) return;
    const kept = {};
    (Array.isArray(newTeamGroups) ? newTeamGroups : []).forEach((g) => {
      const key = this._teamGroupIdKey(g && g.id);
      if (key) kept[key] = true;
    });
    (Array.isArray(oldTeamGroups) ? oldTeamGroups : []).forEach((g) => {
      const key = this._teamGroupIdKey(g && g.id);
      if (key && !kept[key]) {
        this._purgeUsersInGroup(match, key);
      }
    });
  },

  _collectRegisteredUsersInGroup(match, groupId) {
    const gid = this._teamGroupIdKey(groupId);
    if (!match || !gid) return [];
    const users =
      match.registerInfo && Array.isArray(match.registerInfo.users)
        ? match.registerInfo.users
        : [];
    return users.filter((user) => {
      if (!user) return false;
      const groupKey = this._teamGroupIdKey(user.groupId);
      const matchTeamKey = this._teamGroupIdKey(user.matchTeamId);
      return groupKey === gid || matchTeamKey === gid;
    });
  },

  _purgeUsersInGroup(match, groupId) {
    if (!match) return;
    const targets = this._collectRegisteredUsersInGroup(match, groupId);
    for (let i = 0; i < targets.length; i += 1) {
      const user = targets[i];
      const uid = String(
        user.userId != null
          ? user.userId
          : user.playerId != null
            ? user.playerId
            : user.id != null
              ? user.id
              : ''
      ).trim();
      if (!uid) continue;
      teamMatchStore.removeRegisteredUserAndCleanupGroups(match, uid);
    }
  },

  _removeParticipantAtIndex(index) {
    const groups = this._cloneTeamGroups(this.data.teamGroups || []);
    if (index < 0 || index >= groups.length) return;
    const remainingCount = groups.length - 1;
    const gate = this._canRemoveParticipant(remainingCount);
    if (!gate.ok) {
      wx.showToast({ title: gate.message, icon: 'none' });
      return;
    }
    groups.splice(index, 1);
    this.setData(
      this._applyAutoRoundNameIfNeeded(
        {
          teamGroups: groups,
          gameModes: this._buildGameModesWithAvailability(groups)
        },
        groups
      )
    );
  },

  onRemoveParticipant(e) {
    const index = Number(e && e.currentTarget && e.currentTarget.dataset.index);
    if (!isFinite(index)) return;
    const groups = this.data.teamGroups || [];
    const target = groups[index];
    if (!target) return;

    const remainingCount = groups.length - 1;
    const gate = this._canRemoveParticipant(remainingCount);
    if (!gate.ok) {
      wx.showToast({ title: gate.message, icon: 'none' });
      return;
    }

    if (!this.data.isEditMode) {
      this._removeParticipantAtIndex(index);
      return;
    }

    const matchId = this.data.editMatchId || this._editMatchId;
    const match = teamMatchStore.getMatchById(matchId);
    const registered = this._collectRegisteredUsersInGroup(match, target.id);
    if (!registered.length) {
      this._removeParticipantAtIndex(index);
      return;
    }

    wx.showModal({
      title: '提示',
      content: '删除该球队后，球队内报名人员将被一起删除，是否继续？',
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        if (match) {
          this._purgeUsersInGroup(match, target.id);
          teamMatchStore.saveMatch(match);
        }
        this._removeParticipantAtIndex(index);
      }
    });
  },

  onTeamCompetitionToggle(e) {
    const enabled = !!(e && e.detail && e.detail.value);
    if (enabled === !!(this.data.teamCompetition && this.data.teamCompetition.enabled)) {
      return;
    }
    this.setData({
      teamCompetition: this._normalizeTeamCompetition(
        Object.assign({}, this.data.teamCompetition, { enabled: enabled })
      )
    });
  },

  onTeamCompetitionTopNInput(e) {
    const raw = e && e.detail ? e.detail.value : '';
    this.setData({
      teamCompetition: Object.assign({}, this.data.teamCompetition, {
        topN: raw === '' ? '' : raw
      })
    });
  },

  /**
   * 编辑保存失败时：仅恢复赛制相关 UI，不改 teamGroups / 费用 / 其他表单。
   */
  _restoreOriginalGameModeUi() {
    if (!this.data.isEditMode) return;
    const original = this._originalGameMode != null && String(this._originalGameMode).trim() !== ''
      ? String(this._originalGameMode)
      : '';
    if (!original) return;
    const matchPlay = isMatchPlayMode(original);
    this.setData({
      gameMode: original,
      selectedGameMode: original,
      isMatchPlayMode: matchPlay,
      gameModes: this._buildGameModesWithAvailability(this.data.teamGroups || []),
      showGameModeSheet: false
    });
  },

  /** 创建/编辑保存：参赛球队数量兜底（不改写 teamGroups） */
  _assertTeamGroupsOrTip() {
    const mode = this.data.gameMode || this.data.selectedGameMode || '';
    const result = validateTeamMatchSideGroups(
      MATCH_TYPE_INTER_TEAM,
      mode,
      this.data.teamGroups
    );
    if (result.ok) return true;
    if (this.data.isEditMode && isMatchPlayMode(mode)) {
      this._restoreOriginalGameModeUi();
    }
    wx.showModal({
      title: '提示',
      content: result.message || MATCH_PLAY_TEAMS_TIP,
      showCancel: false,
      confirmText: '确认'
    });
    return false;
  },

  onFeeSettings() {
    this.openFeeSheet();
  },

  _cloneFeeList(list) {
    return (list || []).map((item) => ({
      id: item.id,
      name: item.name || '',
      amount: item.amount || ''
    }));
  },

  openFeeSheet() {
    const source = this.data.feeList && this.data.feeList.length
      ? this.data.feeList
      : [{ id: this.data.nextFeeId || 1, name: '', amount: '' }];
    const nextFeeId = this.data.feeList && this.data.feeList.length
      ? this.data.nextFeeId
      : (this.data.nextFeeId || 1) + 1;
    this.setData({
      draftFeeList: this._cloneFeeList(source),
      draftIsDiamondMode: !!this.data.isDiamondMode,
      nextFeeId,
      showFeeSheet: true
    });
  },

  closeFeeSheet() {
    this.cancelFeeSheet();
  },

  cancelFeeSheet() {
    this.setData({
      showFeeSheet: false,
      draftFeeList: [],
      draftIsDiamondMode: false
    });
  },

  addFeeItem() {
    const list = this._cloneFeeList(this.data.draftFeeList);
    const id = this.data.nextFeeId || Date.now();
    list.push({ id, name: '', amount: '' });
    this.setData({
      draftFeeList: list,
      nextFeeId: id + 1
    });
  },

  deleteFeeItem(e) {
    const list = this._cloneFeeList(this.data.draftFeeList);
    if (list.length <= 1) return;
    const index = Number(e.currentTarget.dataset.index);
    list.splice(index, 1);
    this.setData({ draftFeeList: list });
  },

  handleFeeNameInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const list = this._cloneFeeList(this.data.draftFeeList);
    if (!list[index]) return;
    list[index].name = e.detail.value;
    this.setData({ draftFeeList: list });
  },

  handleFeeAmountInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const value = String(e.detail.value || '').replace(/\D/g, '');
    const list = this._cloneFeeList(this.data.draftFeeList);
    if (!list[index]) return value;
    list[index].amount = value;
    this.setData({ draftFeeList: list });
    return value;
  },

  onToggleDiamondMode(e) {
    this.setData({ draftIsDiamondMode: !!e.detail.value });
  },

  confirmFeeSheet() {
    const normalized = this._cloneFeeList(this.data.draftFeeList).map((item) => ({
      id: item.id,
      name: (item.name || '').trim(),
      amount: String(item.amount || '').replace(/\D/g, '')
    }));
    const filled = [];

    for (let i = 0; i < normalized.length; i += 1) {
      const item = normalized[i];
      const hasName = !!item.name;
      const hasAmount = !!item.amount;
      if (!hasName && !hasAmount) continue;
      if (!hasName || !hasAmount) {
        wx.showToast({ title: '请完善费用项', icon: 'none' });
        return;
      }
      filled.push(item);
    }

    this.setData({
      feeList: filled,
      feeSet: filled.length > 0,
      isDiamondMode: !!this.data.draftIsDiamondMode,
      showFeeSheet: false,
      draftFeeList: [],
      draftIsDiamondMode: false
    });
  },

  /* ===== 赛事信息 ===== */
  getInfoTypeLabel(type) {
    return type === 'image' ? '图片' : '文本';
  },

  _buildEventTitleMap(list) {
    return buildEventTitleMapForList(list);
  },

  _getEventInfoRowStepPx() {
    if (this._eventInfoRowStepPx) return this._eventInfoRowStepPx;
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this._eventInfoRowStepPx = (info.windowWidth / 750) * EVENT_INFO_ROW_STEP_RPX;
    return this._eventInfoRowStepPx;
  },

  _buildEventInfoDragPositions(list) {
    const step = this._getEventInfoRowStepPx();
    return (list || []).map((_, index) => index * step);
  },

  _buildEventInfoSortMeta(list) {
    const count = (list || []).length;
    return {
      eventInfoSortAreaHeight: count ? (count * EVENT_INFO_ROW_STEP_RPX - EVENT_INFO_ROW_GAP_RPX) + 'rpx' : '0rpx',
      eventInfoDragPositions: this._buildEventInfoDragPositions(list)
    };
  },

  _syncEventInfoSortMeta(list, extra) {
    this.setData(
      Object.assign(
        {
          eventInfoList: list,
          eventTitleAddedMap: this._buildEventTitleMap(list)
        },
        this._buildEventInfoSortMeta(list),
        extra || {}
      )
    );
  },

  onEventInfoDragStart(e) {
    const index = Number(e.currentTarget.dataset.index);
    const id = e.currentTarget.dataset.id;
    this._eventInfoDragging = {
      index,
      id,
      y: this._buildEventInfoDragPositions(this.data.eventInfoList)[index] || 0,
      moved: false
    };
    this.setData({ eventInfoDraggingId: id });
  },

  onEventInfoDragChange(e) {
    if (!this._eventInfoDragging || e.detail.source !== 'touch') return;
    const y = Number(e.detail.y) || 0;
    const startY = (this._buildEventInfoDragPositions(this.data.eventInfoList)[this._eventInfoDragging.index] || 0);
    this._eventInfoDragging.y = y;
    if (Math.abs(y - startY) > 8) {
      this._eventInfoDragging.moved = true;
    }
  },

  onEventInfoDragEnd() {
    const dragging = this._eventInfoDragging;
    if (!dragging) return;

    const list = this.data.eventInfoList.slice();
    const fromIndex = list.findIndex((item) => item.id === dragging.id);
    const step = this._getEventInfoRowStepPx();
    const toIndex = Math.max(0, Math.min(list.length - 1, Math.round((dragging.y || 0) / step)));

    this._eventInfoDragging = null;

    if (!dragging.moved || fromIndex < 0 || fromIndex === toIndex) {
      this.setData(
        Object.assign({ eventInfoDraggingId: '' }, this._buildEventInfoSortMeta(list))
      );
      return;
    }

    const moved = list.splice(fromIndex, 1)[0];
    list.splice(toIndex, 0, moved);
    this._suppressEventInfoTap = true;
    setTimeout(() => {
      this._suppressEventInfoTap = false;
    }, 180);

    this._syncEventInfoSortMeta(list, { eventInfoDraggingId: '' });
  },

  openAddEventInfoSheet() {
    this.setData({
      showAddEventInfoSheet: true,
      selectedRecommendIndex: null,
      manualInfoType: 'text',
      customEventInfoTitle: '',
      eventTitleAddedMap: this._buildEventTitleMap(this.data.eventInfoList)
    });
  },

  closeAddEventInfoSheet() {
    this.setData({ showAddEventInfoSheet: false });
  },

  selectRecommendInfo(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.recommendedEventInfo[index];
    if (!item) return;
    if (this.data.eventTitleAddedMap[item.title]) {
      wx.showToast({ title: '该赛事信息已添加', icon: 'none' });
      return;
    }
    this.setData({
      selectedRecommendIndex: index,
      customEventInfoTitle: ''
    });
  },

  selectManualInfoType(e) {
    const type = e.currentTarget.dataset.type;
    if (!type) return;
    this.setData({
      manualInfoType: type,
      selectedRecommendIndex: null
    });
  },

  handleCustomEventInfoTitleInput(e) {
    this.setData({
      customEventInfoTitle: e.detail.value,
      selectedRecommendIndex: null
    });
  },

  confirmAddEventInfo() {
    const customTitle = (this.data.customEventInfoTitle || '').trim();
    let newItem = null;

    if (customTitle) {
      const normalizedTitle = isPhotoLiveEventTitle(customTitle) ? PHOTO_LIVE_TITLE : customTitle;
      newItem = {
        id: 'evt-' + Date.now(),
        title: normalizedTitle,
        type: this.data.manualInfoType || 'text',
        content: '',
        brightImage: '',
        darkImage: '',
        status: '未设置'
      };
    } else if (this.data.selectedRecommendIndex !== null && this.data.selectedRecommendIndex !== '') {
      const picked = this.data.recommendedEventInfo[this.data.selectedRecommendIndex];
      if (picked) {
        newItem = {
          id: 'evt-' + Date.now(),
          title: picked.title,
          type: picked.type,
          content: '',
          brightImage: '',
          darkImage: '',
          status: '未设置'
        };
      }
    }

    if (!newItem) {
      wx.showToast({ title: '请选择或输入赛事信息项', icon: 'none' });
      return;
    }

    if (this.data.eventInfoList.some((item) => {
      if (item.title === newItem.title) return true;
      if (isPhotoLiveEventTitle(newItem.title) && isPhotoLiveEventTitle(item.title)) return true;
      return false;
    })) {
      wx.showToast({ title: '该赛事信息已添加', icon: 'none' });
      return;
    }

    const list = this.data.eventInfoList.concat(newItem);
    this._syncEventInfoSortMeta(list, {
      showAddEventInfoSheet: false
    });
  },

  openEventDetailEditor(e) {
    if (this._suppressEventInfoTap) return;
    const id = e.currentTarget.dataset.id;
    const index = this.data.eventInfoList.findIndex((item) => item.id === id);
    if (index < 0) return;
    const item = this.data.eventInfoList[index];
    if (this._deleteConfirmTimer) {
      clearTimeout(this._deleteConfirmTimer);
      this._deleteConfirmTimer = null;
    }
    const photoLive = isPhotoLiveEventTitle(item.title);
    const displayTitle = photoLive ? PHOTO_LIVE_TITLE : item.title;
    this.setData({
      showEventDetailSheet: true,
      editingEventInfoIndex: index,
      deleteConfirming: false,
      deleteBtnText: '删除本项',
      eventDetailEditLabel: displayTitle + '（' + this.getInfoTypeLabel(item.type) + '）',
      eventDetailDraft: {
        title: displayTitle,
        type: item.type,
        content: item.content || '',
        brightImage: item.brightImage || item.imageData || '',
        darkImage: item.darkImage || item.imageData || '',
        status: item.status || '未设置',
        isPhotoLive: photoLive
      }
    });
  },

  closeEventDetailEditor() {
    if (this._deleteConfirmTimer) {
      clearTimeout(this._deleteConfirmTimer);
      this._deleteConfirmTimer = null;
    }
    this.setData({
      showEventDetailSheet: false,
      deleteConfirming: false,
      deleteBtnText: '删除本项',
      editingEventInfoIndex: -1
    });
  },

  handleEventDetailTextInput(e) {
    this.setData({ 'eventDetailDraft.content': e.detail.value });
  },

  chooseEventDetailImageByTheme(themeKey) {
    if (this.data.eventDetailDraft.type !== 'image') return;
    const key = themeKey === 'dark' ? 'darkImage' : 'brightImage';
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        const nextDraft = Object.assign({}, this.data.eventDetailDraft || {});
        nextDraft[key] = file.tempFilePath;
        const hasAnyImage = !!(nextDraft.brightImage || nextDraft.darkImage);
        this.setData({
          eventDetailDraft: Object.assign({}, nextDraft, {
            status: hasAnyImage ? '已设置' : '未设置'
          })
        });
      }
    });
  },

  chooseEventDetailBrightImage() {
    this.chooseEventDetailImageByTheme('bright');
  },

  chooseEventDetailDarkImage() {
    this.chooseEventDetailImageByTheme('dark');
  },

  saveEventDetail() {
    const idx = this.data.editingEventInfoIndex;
    if (idx < 0) return;
    const draft = this.data.eventDetailDraft;
    const list = this.data.eventInfoList.slice();
    const item = Object.assign({}, list[idx]);

    if (item.type === 'image') {
      item.brightImage = draft.brightImage || '';
      item.darkImage = draft.darkImage || '';
      item.status = (item.brightImage || item.darkImage) ? '已设置' : '未设置';
      delete item.imageData;
    } else if (draft.isPhotoLive || isPhotoLiveEventTitle(item.title)) {
      const link = String(draft.content || '').trim();
      if (!link) {
        wx.showToast({ title: '请输入照片直播链接', icon: 'none' });
        return;
      }
      if (!isValidPhotoLiveHttpsUrl(link)) {
        wx.showToast({ title: '请输入有效的 HTTPS 链接', icon: 'none' });
        return;
      }
      item.title = PHOTO_LIVE_TITLE;
      item.content = link;
      item.status = '已设置';
    } else {
      item.content = (draft.content || '').trim();
      item.status = item.content ? '已设置' : '未设置';
    }

    list[idx] = item;
    this._syncEventInfoSortMeta(list, {
      showEventDetailSheet: false,
      deleteConfirming: false,
      deleteBtnText: '删除本项',
      editingEventInfoIndex: -1
    });
  },

  deleteEventInfo() {
    const idx = this.data.editingEventInfoIndex;
    if (idx < 0) return;

    if (!this.data.deleteConfirming) {
      this.setData({
        deleteConfirming: true,
        deleteBtnText: '再次点击确认删除'
      });
      if (this._deleteConfirmTimer) clearTimeout(this._deleteConfirmTimer);
      this._deleteConfirmTimer = setTimeout(() => {
        this.setData({ deleteConfirming: false, deleteBtnText: '删除本项' });
        this._deleteConfirmTimer = null;
      }, 3000);
      return;
    }

    if (this._deleteConfirmTimer) {
      clearTimeout(this._deleteConfirmTimer);
      this._deleteConfirmTimer = null;
    }

    const list = this.data.eventInfoList.slice();
    list.splice(idx, 1);
    this._syncEventInfoSortMeta(list, {
      showEventDetailSheet: false,
      deleteConfirming: false,
      deleteBtnText: '删除本项',
      editingEventInfoIndex: -1
    });
  },

  onGroupPermissionChange(e) {
    this.setData({ groupPermission: e.currentTarget.dataset.value });
  },

  _genAccessCode() {
    return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
  },

  toggleVisibility() {
    if (this.data.visibility === 'public') {
      this.setData({ visibility: 'private', accessCode: this._genAccessCode() });
    } else {
      this.setData({ visibility: 'public', accessCode: '' });
    }
  },

  copyAccessCode() {
    if (!this.data.accessCode) return;
    wx.setClipboardData({
      data: this.data.accessCode,
      success: () => wx.showToast({ title: '密码已复制', icon: 'success' })
    });
  },

  onPartnerTitleInput(e) {
    this.setData({ 'partnerConfig.partnerTitle': e.detail.value });
  },

  _createEmptyPartnerLogo() {
    return { bright: '', dark: '' };
  },

  onAddPartnerLogoSlot() {
    const logos = (this.data.partnerConfig && this.data.partnerConfig.partnerLogos) || [];
    if (logos.length >= partnerConfigUtil.MAX_PARTNER_LOGOS) {
      wx.showToast({ title: '最多上传 8 张', icon: 'none' });
      return;
    }
    const next = logos.concat([this._createEmptyPartnerLogo()]);
    this.setData({ 'partnerConfig.partnerLogos': next });
  },

  choosePartnerLogoByTheme(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const theme = String(e.currentTarget.dataset.theme || '');
    if (Number.isNaN(idx) || (theme !== 'bright' && theme !== 'dark')) return;
    const logos = ((this.data.partnerConfig && this.data.partnerConfig.partnerLogos) || []).slice();
    if (!logos[idx]) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        const current = logos[idx];
        const normalized = typeof current === 'string'
          ? { bright: current, dark: current }
          : Object.assign(this._createEmptyPartnerLogo(), current || {});
        normalized[theme] = file.tempFilePath;
        logos[idx] = normalized;
        this.setData({ 'partnerConfig.partnerLogos': logos });
      }
    });
  },

  removePartnerLogo(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(idx)) return;
    const logos = ((this.data.partnerConfig && this.data.partnerConfig.partnerLogos) || []).slice();
    logos.splice(idx, 1);
    this.setData({ 'partnerConfig.partnerLogos': logos });
  },

  /** COS 默认图加载失败 → 回退本地 assets/partners */
  onPartnerLogoError(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const theme = String(e.currentTarget.dataset.theme || '');
    if (Number.isNaN(idx) || (theme !== 'bright' && theme !== 'dark')) return;
    const logos = ((this.data.partnerConfig && this.data.partnerConfig.partnerLogos) || []).slice();
    const current = logos[idx];
    if (!current) return;
    const normalized = typeof current === 'string'
      ? { bright: current, dark: current }
      : Object.assign(this._createEmptyPartnerLogo(), current || {});
    const failedSrc = String(normalized[theme] || (theme === 'bright' ? normalized.dark : normalized.bright) || '').trim();
    const fallback = partnerConfigUtil.getPartnerLogoLocalFallback(failedSrc);
    if (!fallback || fallback === failedSrc) return;
    normalized[theme] = fallback;
    logos[idx] = normalized;
    this.setData({ 'partnerConfig.partnerLogos': logos });
  },

  openGameModeSheet() {
    this.setData({
      gameModes: this._buildGameModesWithAvailability(this.data.teamGroups || []),
      showGameModeSheet: true
    });
  },

  closeGameModeSheet() {
    this.setData({ showGameModeSheet: false });
  },

  selectGameMode(e) {
    const name = e.currentTarget.dataset.name;
    if (!name) return;
    const disabled =
      e.currentTarget.dataset.disabled === true ||
      e.currentTarget.dataset.disabled === 'true';
    if (disabled || (isMatchPlayMode(name) && (this.data.teamGroups || []).length !== 2)) {
      wx.showToast({ title: MATCH_PLAY_TEAMS_TIP, icon: 'none' });
      return;
    }
    const teamGroupUpdates = this._getTeamGroupUpdatesForGameMode(name);
    this.setData(
      Object.assign(
        {
          selectedGameMode: name,
          gameMode: name,
          showGameModeSheet: false
        },
        teamGroupUpdates
      )
    );
  },

  /* ===== 开球/截止时间滚轮（与普通创建页一致，共用弹层） ===== */
  _buildWheels() {
    const t = this._editingTime;
    const months = Array.from({ length: 12 }, (_, i) => pad2(i + 1));
    const dayCount = daysInMonth(t.year, t.month);
    if (t.day > dayCount) t.day = dayCount;
    const days = Array.from({ length: dayCount }, (_, i) => pad2(i + 1));
    const hours = Array.from({ length: 24 }, (_, i) => pad2(i));
    const minutes = MINUTE_VALUES.map((m) => pad2(m));
    const minuteIdx = Math.max(0, MINUTE_VALUES.indexOf(t.minute));
    const teeIndex = [t.month - 1, t.day - 1, t.hour, minuteIdx];

    this.setData({
      teeYear: t.year,
      timeDraft: Object.assign({}, t),
      months,
      days,
      hours,
      minutes,
      teeIndex,
      timePickerValue: teeIndex,
      wheelIndex: teeIndex
    });
  },

  onTeeChange(e) {
    const [mIdx, dIdx, hIdx, minIdx] = e.detail.value;
    const t = this._editingTime;
    t.month = mIdx + 1;
    t.hour = hIdx;
    t.minute = MINUTE_VALUES[minIdx];

    const dayCount = daysInMonth(t.year, t.month);
    let dayIdx = dIdx;
    if (dayIdx > dayCount - 1) dayIdx = dayCount - 1;
    t.day = dayIdx + 1;

    const days = Array.from({ length: dayCount }, (_, i) => pad2(i + 1));
    const teeIndex = [mIdx, dayIdx, hIdx, minIdx];
    this.setData({
      days,
      teeIndex,
      timePickerValue: teeIndex,
      wheelIndex: teeIndex,
      timeDraft: Object.assign({}, t)
    });
  },

  changeYear(e) {
    const delta = Number(e.currentTarget.dataset.delta);
    this._editingTime.year += delta;
    this._buildWheels();
  },

  openTimePicker(e) {
    const target = (e && e.currentTarget && e.currentTarget.dataset.target) || 'tee';
    const isDeadline = target === 'deadline' || target === 'deadlineTime';
    const timeString = isDeadline ? this.data.deadlineTime : this.data.teeTime;
    this._editingTime = Object.assign({}, parseTimeToDraft(timeString));
    this._activeTimeTarget = isDeadline ? 'deadline' : 'tee';
    const title = isDeadline ? '选择报名截止时间' : '选择开球时间';
    this._buildWheels();
    this.setData({
      showTimePicker: true,
      showTimeWheel: true,
      activeTimeTarget: target,
      timePickerTitle: title,
      timeWheelTitle: title
    });
  },

  openTimeWheelSheet(e) {
    this.openTimePicker(e);
  },

  closeTimePicker() {
    this.setData({ showTimePicker: false, showTimeWheel: false });
  },

  closeTimeWheelSheet() {
    this.closeTimePicker();
  },

  confirmTimePicker() {
    const valueText = formatDateTime(this._editingTime);
    const displayText = formatDisplayDateTime(this._editingTime);
    const target = this._activeTimeTarget || this.data.activeTimeTarget;

    if (target === 'deadline' || target === 'deadlineTime') {
      this._deadline = Object.assign({}, this._editingTime);
      this.setData({
        deadlineTime: valueText,
        deadlineTimeText: displayText,
        showTimePicker: false,
        showTimeWheel: false
      });
    } else {
      this._tee = Object.assign({}, this._editingTime);
      this.setData({
        teeTime: valueText,
        teeTimeText: displayText,
        showTimePicker: false,
        showTimeWheel: false
      });
    }
  },

  confirmTimeWheel() {
    this.confirmTimePicker();
  },

  onTimePickerChange(e) {
    this.onTeeChange(e);
  },

  changeTimePicker(e) {
    this.onTeeChange(e);
  },

  onWheelChange(e) {
    this.onTeeChange(e);
  },

  changePickerYear(e) {
    this.changeYear(e);
  },

  onTimePickerYearChange(e) {
    this.changeYear({ currentTarget: { dataset: { delta: Number(e.detail.delta) } } });
  },

  onSubmit() {
    if (!this._hasSelectedOrganization()) {
      wx.showModal({
        title: '提示',
        content: '请选择组织机构',
        showCancel: false,
        confirmText: '确认'
      });
      return;
    }

    if (!String(this.data.courseName || '').trim()) {
      wx.showModal({
        title: '提示',
        content: '请选择比赛球场',
        showCancel: false,
        confirmText: '确认'
      });
      return;
    }

    if (!this._assertTeamGroupsOrTip()) {
      return;
    }

    const orgName = this.data.organizationName || this.data.teamName;
    partnerConfigUtil.savePartnerConfig(this.data.partnerConfig, orgName);

    // 提交前确保 matchType / 机构快照与 team* 同步（同步写 this.data，避免 setData 异步）
    // 本场 LOGO 以 organizationLogo 为准；清空独立 logoConfig，避免旧 custom 覆盖
    const syncPatch = this._syncOrganizerToTeamFields({
      matchType: MATCH_TYPE_INTER_TEAM,
      organizationId: this.data.organizationId,
      organizationName: this.data.organizationName,
      organizationLogo: this.data.organizationLogo,
      logoConfig: { type: 'default', url: '', source: 'team' }
    });
    Object.assign(this.data, syncPatch);
    this.setData(syncPatch);

    if (this.data.organizationId) {
      teamDirectory.rememberRecentEventOrg(this.data.organizationId);
    }

    if (this.data.isEditMode) {
      this._submitEditMatch();
      return;
    }

    const match = teamMatchStore.buildMatchFromCreatePage(this.data);
    teamMatchStore.saveMatch(match);

    wx.showModal({
      title: '提示',
      content: '创建比赛成功，请到赛事菜单查看',
      showCancel: false,
      confirmText: '确认',
      success: (res) => {
        if (!res.confirm) return;
        wx.redirectTo({
          url: '/pages/home/index?section=tournament',
          fail: () => {
            wx.reLaunch({ url: '/pages/home/index?section=tournament' });
          }
        });
      }
    });
  },

  /**
   * 编辑保存：赛制变更时按目标赛制逐组校验；合法保留、非法清除（确认后）
   */
  _submitEditMatch() {
    const matchId = this.data.editMatchId || this._editMatchId;
    const existing = teamMatchStore.getMatchById(matchId);
    if (!existing) {
      wx.showToast({ title: '未找到比赛信息', icon: 'none' });
      return;
    }

    const fromMode = existing.gameMode || '';
    const toMode = this.data.gameMode || this.data.selectedGameMode || '';
    const clearPairingsOnly =
      teamMatchStore.shouldClearPairingsOnGameModeChange(fromMode, toMode);

    if (!toMode || fromMode === toMode || !teamMatchStore.hasFormalGroups(existing)) {
      this._persistEditMatch(existing, { clearPairings: clearPairingsOnly });
      return;
    }

    const plan = teamMatchStore.analyzeGameModeChangeGroups(existing, toMode);
    if (plan.allLegal) {
      this._persistEditMatch(existing, { clearPairings: clearPairingsOnly });
      return;
    }

    const tip = plan.allIllegal
      ? teamMatchStore.buildGameModeChangeGroupsAllIllegalTip()
      : teamMatchStore.buildGameModeChangeGroupsPartialTip(plan.illegalCount);

    wx.showModal({
      title: '提示',
      content: tip,
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        this._persistEditMatch(existing, {
          // nextGroups：合法组原样 + 非法组空壳（同序，组数不变）
          replaceGroups: plan.nextGroups || plan.keepGroups,
          clearPairings: clearPairingsOnly
        });
      }
    });
  },

  _persistEditMatch(existing, options) {
    const opts = options || {};
    const matchId = existing && existing.matchId
      ? existing.matchId
      : (this.data.editMatchId || this._editMatchId);
    const persistOpts = {
      clearGroups: !!opts.clearGroups,
      clearPairings: !!opts.clearPairings
    };
    if (Array.isArray(opts.replaceGroups)) {
      persistOpts.replaceGroups = opts.replaceGroups;
    }
    const updated = teamMatchStore.updateMatchFromCreatePage(existing, this.data, persistOpts);
    if (!updated) {
      wx.showToast({ title: '保存失败', icon: 'none' });
      return;
    }

    // 队际赛：删除参赛球队时已在页面侧 purge 报名人员，不再迁移到其他队
    this._purgeUsersForRemovedGroups(
      existing && existing.teamGroups,
      this.data.teamGroups,
      updated
    );

    teamMatchStore.saveMatch(updated);
    // 改期等基础信息变更后，同步已有报名用户的 team_match 日程 date/content
    this.syncTeamMatchSchedules(updated);
    // 落盘成功后同步「原始赛制」，供下次校验失败回滚
    this._originalGameMode = updated.gameMode || this.data.gameMode || this._originalGameMode;
    wx.showToast({ title: '已保存修改', icon: 'success' });
    setTimeout(() => {
      if (getCurrentPages().length > 1) {
        wx.navigateBack({ delta: 1 });
      } else {
        wx.redirectTo({
          url: '/subpackages/tournament/pages/detail/index?matchId=' + encodeURIComponent(matchId)
        });
      }
    }, 400);
  },

  /**
   * 与详情页 syncTeamMatchSchedules 对齐：无则 create，有则只更新 date/content
   * @param {object} match
   */
  syncTeamMatchSchedules(match) {
    if (!match || !match.matchId) return;
    const matchId = String(match.matchId);
    const users =
      match.registerInfo && Array.isArray(match.registerInfo.users)
        ? match.registerInfo.users
        : [];
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      if (!user) continue;
      const ownerId = String(
        user.userId != null
          ? user.userId
          : user.playerId != null
            ? user.playerId
            : user.id != null
              ? user.id
              : ''
      ).trim();
      if (!ownerId) continue;
      const payload = scheduleAdapter.createTeamMatchSchedule(match, user);
      const existing = scheduleStore.findSchedulesBySource(
        'team_match',
        matchId,
        ownerId
      );
      if (existing && existing.length) {
        for (let j = 0; j < existing.length; j++) {
          const sch = existing[j];
          if (!sch || !sch.id) continue;
          scheduleStore.updateSchedule(sch.id, {
            date: payload.date,
            content: payload.content
          });
        }
        continue;
      }
      scheduleStore.createSchedule(payload);
    }
  }
});
