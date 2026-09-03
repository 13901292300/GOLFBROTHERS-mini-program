const { createHeaderStyle } = require('../../../../utils/headerEngine.js');
const mockAvatars = require('../../../../utils/mockAvatars.js');
const partnerConfigUtil = require('../../../../utils/partnerConfig.js');
const teamMatchStore = require('../../../../utils/teamMatchStore.js');
const scheduleStore = require('../../../../utils/scheduleStore.js');
const scheduleAdapter = require('../../../../utils/scheduleAdapter.js');
const {
  createDefaultEventInfoList
} = require('../../../../utils/eventInfoDefaults.js');
const matchTitlePolicy = require('../../../../utils/matchTitlePolicy.js');

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
  '四人四球比洞赛',
  '最佳球位比洞赛',
  '四人两球比洞赛'
];

const MATCH_PLAY_TEAM_GROUPS_TIP = '比洞赛必须设置两个分队，请调整分队配置后继续。';

function isMatchPlayMode(name) {
  var n = String(name || '').trim();
  if (n === '最好成绩比洞赛') return true;
  return MATCH_PLAY_MODES.indexOf(n) >= 0;
}

const TEAM_GROUP_DESC_DEFAULT = '用于设置本场队内赛的分队名称，如不需要分队 PK，可保留默认设置。';
const TEAM_GROUP_DESC_MATCH_PLAY =
  '比洞赛固定两个比赛阵营；创建时默认红队/蓝队，名称可自行编辑。编辑已有比赛不会自动改名。';

function getTeamGroupSheetDesc(matchPlay) {
  return matchPlay ? TEAM_GROUP_DESC_MATCH_PLAY : TEAM_GROUP_DESC_DEFAULT;
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

const EMPTY_TEAM_LABEL = '请选择球队';
const EMPTY_TEAM_LOGO =
  'https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/miniprogram/mock-avatars/default-avatar.jpg';

const DEFAULT_FEE_LIST = [
  { id: 1, name: '正式队员', amount: '0' },
  { id: 2, name: '嘉宾', amount: '0' }
];

const DEFAULT_TEAM_GROUPS = [
  { id: 1, renderKey: 'team-group-1', name: '正式队员' },
  { id: 2, renderKey: 'team-group-2', name: '嘉宾' }
];
/** G5–G8 比洞：创建阶段默认两个比赛阵营（仅创建选赛制时初始化，不改已有比赛） */
const MATCH_PLAY_DEFAULT_TEAM_GROUPS = [
  { id: 1, renderKey: 'team-group-1', name: '红队' },
  { id: 2, renderKey: 'team-group-2', name: '蓝队' }
];
const DEFAULT_TEAM_COMPETITION = {
  enabled: false,
  topN: 3
};
const ROUND_NAME_SUFFIX = '月例赛';

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

function buildDefaultRoundName(teamName) {
  return matchTitlePolicy.buildAutoInternalRoundName(teamName);
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
    pageTitle: '队内赛创建',
    submitButtonText: '创建并开启报名',
    isEditMode: false,
    editMatchId: '',

    teamId: '',
    teamName: EMPTY_TEAM_LABEL,
    teamLogo: EMPTY_TEAM_LOGO,
    teamRole: '',

    roundName: '',
    roundNameCount: 0,
    roundNameMax: matchTitlePolicy.MATCH_TITLE_MAX,
    roundNameQuota: matchTitlePolicy.MATCH_TITLE_MAX,
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
    gameModes: TEAM_GAME_MODES,
    isMatchPlayMode: false,
    teamGroupMode: 'free',
    teamGroupSheetDesc: TEAM_GROUP_DESC_DEFAULT,

    teamGroups: DEFAULT_TEAM_GROUPS.map((item) => Object.assign({}, item)),
    draftTeamGroups: [],
    draftTeamCompetition: Object.assign({}, DEFAULT_TEAM_COMPETITION),
    teamCompetition: Object.assign({}, DEFAULT_TEAM_COMPETITION),
    showTeamGroupSheet: false,
    nextTeamGroupId: 3,
    teamGroupSummary: '正式队员 / 嘉宾',
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

    // builder 兼容字段；本场 LOGO 以 teamLogo 为准，提交前清空 custom
    logoConfig: {
      type: 'default',
      url: '',
      source: 'team'
    },

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
    this._roundNameManual = false;
    this._roundNameBaseline = '';
    this._roundNameLastOk = this.data.roundName || '';
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
    this._freeModeTeamGroups = this._cloneTeamGroups(this.data.teamGroups);
    this.setData(this._buildEventInfoSortMeta(this.data.eventInfoList));
  },

  _initEditMode(matchId) {
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '未找到比赛信息', icon: 'none' });
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
    this._roundNameBaseline = form.roundName || '';
    this._roundNameLastOk = form.roundName || '';
    // 编辑页：记录进入时已落盘赛制，保存失败时仅回滚赛制 UI（不碰 teamGroups）
    this._originalGameMode = form.gameMode || '个人比杆赛';

    const teamGroups = (form.teamGroups && form.teamGroups.length)
      ? this._cloneTeamGroups(form.teamGroups)
      : this._defaultTeamGroups();
    const feeList = (form.feeList && form.feeList.length)
      ? form.feeList.slice()
      : DEFAULT_FEE_LIST.slice();
    const eventInfoList = (form.eventInfoList && form.eventInfoList.length)
      ? form.eventInfoList.slice()
      : DEFAULT_EVENT_INFO_LIST.slice();
    const gameMode = form.gameMode || '个人比杆赛';
    const teamCompetition = this._competitionForGroupCount(form.teamCompetition, teamGroups.length);
    const matchPlay = isMatchPlayMode(gameMode);
    const maxGroupId = teamGroups.reduce((max, g) => Math.max(max, Number(g.id) || 0), 0);
    const maxFeeId = feeList.reduce((max, f) => Math.max(max, Number(f.id) || 0), 0);

    const partnerConfig = partnerConfigUtil.loadPartnerConfig(form.teamName || '');
    const teeTimeText = form.teeTimeText || formatDisplayDateTime(teeDraft);
    const deadlineTimeText = form.deadlineTimeText || formatDisplayDateTime(deadlineDraft);

    if (!matchPlay) {
      this._freeModeTeamGroups = this._cloneTeamGroups(teamGroups);
    } else {
      this._freeModeTeamGroups = this._defaultTeamGroups();
    }

    // 本场专用 LOGO：优先旧「LOGO配置」custom，否则已保存 teamLogo（不读球队目录覆盖）
    const legacyCustomLogo =
      form.logoConfig &&
      form.logoConfig.type === 'custom' &&
      form.logoConfig.url
        ? String(form.logoConfig.url).trim()
        : '';
    const teamLogo =
      legacyCustomLogo ||
      String(form.teamLogo || EMPTY_TEAM_LOGO).trim() ||
      EMPTY_TEAM_LOGO;

    const patch = Object.assign(
      {
        isEditMode: true,
        editMatchId: matchId,
        pageEyebrow: 'EDIT',
        pageTitle: '修改队内赛',
        submitButtonText: '保存修改',
        teamId: form.teamId || '',
        teamName: form.teamName || EMPTY_TEAM_LABEL,
        teamLogo: teamLogo,
        teamRole: '',
        roundName: form.roundName || '',
        roundNameCount: matchTitlePolicy.countTypingChars(form.roundName || ''),
        roundNameMax: matchTitlePolicy.resolveInputMaxlength(
          form.roundName || '',
          matchTitlePolicy.MATCH_TITLE_MAX
        ),
        roundNameQuota: matchTitlePolicy.MATCH_TITLE_MAX,
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
        teamGroupMode: 'free',
        teamGroupSheetDesc: getTeamGroupSheetDesc(matchPlay),
        teamGroups: teamGroups,
        teamGroupSummary: this.getTeamGroupSummary(teamGroups),
        teamCompetition: teamCompetition,
        draftTeamCompetition: Object.assign({}, teamCompetition),
        nextTeamGroupId: maxGroupId + 1,
        feeList: feeList,
        nextFeeId: maxFeeId + 1,
        isDiamondMode: !!form.isDiamondMode,
        feeSet: form.feeSet != null ? !!form.feeSet : feeList.length > 0,
        groupPermission: form.groupPermission === 'player' ? 'player' : 'admin',
        visibility: form.visibility === 'private' ? 'private' : 'public',
        accessCode: form.accessCode || '',
        logoConfig: { type: 'default', url: '', source: 'team' },
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
    var raw = e && e.detail && e.detail.value != null ? e.detail.value : '';
    var value = matchTitlePolicy.constrainTyping(raw, {
      max: matchTitlePolicy.MATCH_TITLE_MAX,
      previous: this._roundNameBaseline
    });
    this.setData({
      roundName: value,
      roundNameCount: matchTitlePolicy.countTypingChars(value),
      roundNameMax: matchTitlePolicy.resolveInputMaxlength(
        value,
        matchTitlePolicy.MATCH_TITLE_MAX
      )
    });
    return value;
  },

  onRoundNameBlur(e) {
    var raw =
      e && e.detail && e.detail.value != null
        ? e.detail.value
        : this.data.roundName;
    return this._commitRoundNameInput(raw);
  },

  _commitRoundNameInput(raw) {
    var check = matchTitlePolicy.normalizeTitleInput(raw, {
      required: true,
      max: matchTitlePolicy.MATCH_TITLE_MAX,
      previous: this._roundNameBaseline
    });
    if (!check.ok) {
      var fallback = this._roundNameLastOk != null ? String(this._roundNameLastOk) : '';
      this.setData({
        roundName: fallback,
        roundNameCount: matchTitlePolicy.countTypingChars(fallback),
        roundNameMax: matchTitlePolicy.resolveInputMaxlength(
          fallback,
          matchTitlePolicy.MATCH_TITLE_MAX
        )
      });
      wx.showToast({
        title: check.reason === 'empty' ? '请输入比赛名称' : '比赛名称最多 14 个字符',
        icon: 'none'
      });
      return false;
    }
    this._roundNameLastOk = check.value;
    this.setData({
      roundName: check.value,
      roundNameCount: matchTitlePolicy.countTypingChars(check.value),
      roundNameMax: matchTitlePolicy.resolveInputMaxlength(
        check.value,
        matchTitlePolicy.MATCH_TITLE_MAX
      )
    });
    return true;
  },

  _assertRoundNameOrTip() {
    return this._commitRoundNameInput(this.data.roundName);
  },

  _hasSelectedTeam() {
    return !!String(this.data.teamId || '').trim();
  },

  _applySelectedTeam(payload) {
    if (!payload) return;
    const hadTeam = this._hasSelectedTeam();
    const prevTeamName = hadTeam ? this.data.teamName : '';
    const currentTitle = String((this.data.partnerConfig && this.data.partnerConfig.partnerTitle) || '').trim();
    const updates = {
      teamId: payload.teamId || '',
      teamName: payload.teamName || '',
      teamLogo: payload.teamLogo || mockAvatars.pickMockAvatar(payload.teamName || ''),
      teamRole: payload.teamRole || ''
    };
    // PARTNER 标题仍为默认值时，随球队名自动更新；用户手改后不覆盖
    if (partnerConfigUtil.isDefaultPartnerTitle(currentTitle, prevTeamName)) {
      updates['partnerConfig.partnerTitle'] = partnerConfigUtil.buildPartnerTitle(payload.teamName);
    }
    if (!this._roundNameManual) {
      updates.roundName = buildDefaultRoundName(payload.teamName);
      updates.roundNameCount = matchTitlePolicy.countTypingChars(updates.roundName);
      updates.roundNameMax = matchTitlePolicy.resolveInputMaxlength(
        updates.roundName,
        matchTitlePolicy.MATCH_TITLE_MAX
      );
      this._roundNameLastOk = updates.roundName;
    }
    this.setData(updates);
  },

  onSelectTeam() {
    wx.navigateTo({
      url: '/subpackages/create/pages/team/select/index?selectedId=' + (this.data.teamId || ''),
      events: {
        teamSelected: (payload) => {
          this._applySelectedTeam(payload);
        }
      },
      fail: () => wx.showToast({ title: '页面尚未注册', icon: 'none' })
    });
  },

  /**
   * 点击球队 LOGO：替换本场 teamLogo 快照。
   * catchtap 阻止冒泡，不进入球队选择；不写球队目录主数据。
   */
  onChangeTeamLogo() {
    if (!this._hasSelectedTeam()) {
      this.onSelectTeam();
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
        this._applyTeamLogoFile(file.tempFilePath);
      },
      fail: () => {
        // 取消或失败：保持原 LOGO，不清空
      }
    });
  },

  _applyTeamLogoFile(filePath) {
    if (!filePath) return;
    const apply = (url) => {
      if (!url) return;
      this.setData({ teamLogo: url });
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
      url: '/subpackages/create/pages/course/select/index?selectedId=' + (this.data.courseId || ''),
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

  onTeamDivision() {
    this.openTeamGroupSheet();
  },

  _cloneTeamGroups(groups) {
    return (groups || []).map((item, index) => ({
      id: item.id,
      renderKey: item.renderKey || ('team-group-' + (item.id || index)),
      name: item.name || ''
    }));
  },

  _cloneDraftTeamGroups(groups) {
    return (groups || []).map((item, index) => ({
      id: item.id,
      renderKey: 'draft-team-group-' + (item.id || index),
      name: item.name || ''
    }));
  },

  _defaultTeamGroups() {
    return DEFAULT_TEAM_GROUPS.map((item) => Object.assign({}, item));
  },

  _matchPlayDefaultTeamGroups() {
    return MATCH_PLAY_DEFAULT_TEAM_GROUPS.map((item) => Object.assign({}, item));
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

  _competitionForGroupCount(input, groupCount) {
    const next = this._normalizeTeamCompetition(input);
    if (Number(groupCount) < 2) next.enabled = false;
    return next;
  },

  /**
   * 选赛制时更新比洞相关 UI。
   * 仅「创建」且由非比洞 → G5–G8：初始化 teamGroups 为红队/蓝队。
   * 编辑已有比赛、G1–G4、比洞内互切：不改写 teamGroups / 不自动重命名。
   */
  _getTeamGroupUpdatesForGameMode(gameMode) {
    const nextMatchPlay = isMatchPlayMode(gameMode);
    const prevMatchPlay = !!this.data.isMatchPlayMode;
    const updates = {
      isMatchPlayMode: nextMatchPlay,
      teamGroupMode: 'free',
      teamGroupSheetDesc: getTeamGroupSheetDesc(nextMatchPlay)
    };
    const isCreate = !this.data.isEditMode;
    if (isCreate && nextMatchPlay && !prevMatchPlay) {
      this._freeModeTeamGroups = this._cloneTeamGroups(
        this.data.teamGroups && this.data.teamGroups.length
          ? this.data.teamGroups
          : this._defaultTeamGroups()
      );
      const groups = this._matchPlayDefaultTeamGroups();
      updates.teamGroups = groups;
      updates.teamGroupSummary = this.getTeamGroupSummary(groups);
      updates.teamCompetition = this._competitionForGroupCount(
        this.data.teamCompetition,
        groups.length
      );
    }
    return updates;
  },

  getTeamGroupSummary(groups) {
    const names = (groups || [])
      .map((item) => (item.name || '').trim())
      .filter(Boolean);
    if (names.length <= 2) return names.join('/');
    return names.slice(0, 2).join('/') + '/+' + (names.length - 2);
  },

  openTeamGroupSheet() {
    const source =
      this.data.teamGroups && this.data.teamGroups.length
        ? this.data.teamGroups
        : this._defaultTeamGroups();
    const groups = this._cloneDraftTeamGroups(source);
    this.setData({
      draftTeamGroups: groups,
      draftTeamCompetition: this._competitionForGroupCount(this.data.teamCompetition, groups.length),
      showTeamGroupSheet: true
    });
  },

  closeTeamGroupSheet() {
    this.cancelTeamGroupSheet();
  },

  cancelTeamGroupSheet() {
    this.setData({
      showTeamGroupSheet: false,
      draftTeamGroups: []
    });
  },

  handleTeamGroupNameInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const groups = this._cloneDraftTeamGroups(this.data.draftTeamGroups);
    if (!groups[index]) return;
    groups[index].name = e.detail.value;
    this.setData({ draftTeamGroups: groups });
  },

  addTeamGroup() {
    // 比洞赛：已有 2 队时禁止再加（与 UI 隐藏一致）
    if (this.data.isMatchPlayMode && (this.data.draftTeamGroups || []).length >= 2) {
      return;
    }
    const groups = this._cloneDraftTeamGroups(this.data.draftTeamGroups);
    const nextId = this.data.nextTeamGroupId || Date.now();
    groups.push({ id: nextId, renderKey: 'draft-team-group-' + nextId, name: '新分队' });
    this.setData({
      draftTeamGroups: groups,
      nextTeamGroupId: nextId + 1
    });
  },

  deleteTeamGroup(e) {
    // 比洞赛：禁止删除，避免变成单分队非法态（不改写名称/ID）
    if (this.data.isMatchPlayMode) return;
    const groups = this._cloneDraftTeamGroups(this.data.draftTeamGroups);
    if (groups.length <= 1) return;
    const index = Number(e.currentTarget.dataset.index);
    groups.splice(index, 1);
    this.setData({
      draftTeamGroups: groups,
      draftTeamCompetition: this._competitionForGroupCount(this.data.draftTeamCompetition, groups.length)
    });
  },

  _teamGroupIdKey(id) {
    return id != null ? String(id).trim() : '';
  },

  /**
   * 删除分队后：将被删分队下的报名成员迁移到剩余分队的第一个。
   * 只改 registerInfo.users 归属字段；不碰 groups / scoreEntities / pairings。
   * @returns {object|null} 新的 registerInfo；无迁移时返回 null
   */
  _migrateRegisterUsersAfterTeamDelete(oldTeamGroups, newTeamGroups, registerInfo) {
    const nextGroups = Array.isArray(newTeamGroups) ? newTeamGroups : [];
    if (!nextGroups.length) return null;

    const kept = {};
    nextGroups.forEach((g) => {
      const key = this._teamGroupIdKey(g && g.id);
      if (key) kept[key] = g;
    });

    const deletedIds = [];
    (Array.isArray(oldTeamGroups) ? oldTeamGroups : []).forEach((g) => {
      const key = this._teamGroupIdKey(g && g.id);
      if (key && !kept[key]) deletedIds.push(key);
    });
    if (!deletedIds.length) return null;

    // 迁移目标 = 删除后 teamGroups 的第一个剩余分队
    const target = nextGroups[0];
    const targetId = target.id;
    const targetIdKey = this._teamGroupIdKey(targetId);
    const targetName = target && target.name != null ? String(target.name).trim() : '';
    if (!targetIdKey) return null;

    const deletedSet = {};
    deletedIds.forEach((id) => {
      deletedSet[id] = true;
    });

    const users =
      registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
    let changed = false;
    const nextUsers = users.map((user) => {
      if (!user || typeof user !== 'object') return user;
      const groupKey = this._teamGroupIdKey(user.groupId);
      const matchTeamKey = this._teamGroupIdKey(user.matchTeamId);
      const hitDeleted =
        (groupKey && deletedSet[groupKey]) || (matchTeamKey && deletedSet[matchTeamKey]);
      if (!hitDeleted) return user;

      changed = true;
      const next = Object.assign({}, user);
      if (groupKey && deletedSet[groupKey]) {
        next.groupId = targetId;
        next.groupName = targetName;
      }
      if (matchTeamKey && deletedSet[matchTeamKey]) {
        next.matchTeamId = targetId;
        next.matchTeamName = targetName;
      } else if (groupKey && deletedSet[groupKey]) {
        // groupId 已迁；同步 matchTeam 归属，避免 resolver 仍读到旧分队
        next.matchTeamId = targetId;
        next.matchTeamName = targetName;
      }
      return next;
    });

    if (!changed) return null;

    return Object.assign({}, registerInfo || {}, {
      users: nextUsers,
      totalCount:
        registerInfo && registerInfo.totalCount != null
          ? registerInfo.totalCount
          : nextUsers.length
    });
  },

  onTeamCompetitionToggle(e) {
    const enabled = !!(e && e.detail && e.detail.value);
    if (enabled === !!(this.data.draftTeamCompetition && this.data.draftTeamCompetition.enabled)) {
      return;
    }
    const competition = this._competitionForGroupCount(
      Object.assign({}, this.data.draftTeamCompetition, { enabled: enabled }),
      (this.data.draftTeamGroups || []).length
    );
    this.setData({ draftTeamCompetition: competition });
  },

  onTeamCompetitionTopNInput(e) {
    const raw = e && e.detail ? e.detail.value : '';
    const topN = raw === '' ? '' : raw;
    this.setData({
      draftTeamCompetition: Object.assign({}, this.data.draftTeamCompetition, { topN: topN })
    });
  },

  validateTeamGroups(groups) {
    const trimmed = (groups || []).map((item) => ({
      id: item.id,
      renderKey: item.renderKey,
      name: (item.name || '').trim()
    }));

    if (trimmed.some((item) => !item.name)) {
      return { ok: false, message: '请输入分队名称' };
    }

    if (trimmed.length < 1) {
      return { ok: false, message: '至少需要一个分队' };
    }

    // 比洞赛必须恰好 2 队；不静默改写名称/ID
    if (this.data.isMatchPlayMode && trimmed.length !== 2) {
      return { ok: false, message: MATCH_PLAY_TEAM_GROUPS_TIP };
    }

    const seen = {};
    for (let i = 0; i < trimmed.length; i += 1) {
      const name = trimmed[i].name;
      if (seen[name]) {
        return { ok: false, message: '分队名称不能重复' };
      }
      seen[name] = true;
    }

    return { ok: true, groups: trimmed };
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
      teamGroupMode: 'free',
      teamGroupSheetDesc: getTeamGroupSheetDesc(matchPlay),
      showGameModeSheet: false
    });
  },

  /** 创建/编辑保存：比洞赛分队数量兜底（不改写 teamGroups） */
  _assertMatchPlayTeamGroupsOrTip() {
    const mode = this.data.gameMode || this.data.selectedGameMode || '';
    if (!isMatchPlayMode(mode)) return true;
    const n = Array.isArray(this.data.teamGroups) ? this.data.teamGroups.length : 0;
    if (n === 2) return true;
    // 保存未写盘：编辑态先回滚赛制 UI，避免卡在比洞「不可删队」状态
    this._restoreOriginalGameModeUi();
    wx.showModal({
      title: '提示',
      content: MATCH_PLAY_TEAM_GROUPS_TIP,
      showCancel: false,
      confirmText: '确认'
    });
    return false;
  },

  confirmTeamGroupSheet() {
    const result = this.validateTeamGroups(this.data.draftTeamGroups);
    if (!result.ok) {
      wx.showToast({ title: result.message, icon: 'none' });
      return;
    }

    const groups = this._cloneTeamGroups(result.groups);
    const competition = this._competitionForGroupCount(this.data.draftTeamCompetition, groups.length);
    this._freeModeTeamGroups = groups;
    this.setData({
      teamGroups: groups,
      teamGroupSummary: this.getTeamGroupSummary(groups),
      teamCompetition: competition,
      draftTeamCompetition: Object.assign({}, competition),
      draftTeamGroups: [],
      showTeamGroupSheet: false
    });
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
    this.setData({ showGameModeSheet: true });
  },

  closeGameModeSheet() {
    this.setData({ showGameModeSheet: false });
  },

  selectGameMode(e) {
    const name = e.currentTarget.dataset.name;
    if (!name) return;
    const teamGroupUpdates = this._getTeamGroupUpdatesForGameMode(name);
    this.setData(Object.assign({
      selectedGameMode: name,
      gameMode: name,
      showGameModeSheet: false
    }, teamGroupUpdates));
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
    if (!this._hasSelectedTeam()) {
      wx.showModal({
        title: '提示',
        content: '请选择参赛球队',
        showCancel: false,
        confirmText: '确认'
      });
      return;
    }

    if (!this._assertRoundNameOrTip()) {
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

    partnerConfigUtil.savePartnerConfig(this.data.partnerConfig, this.data.teamName);

    if (!this._assertMatchPlayTeamGroupsOrTip()) {
      return;
    }

    // 本场 LOGO 以 teamLogo 为准；清空独立 logoConfig，避免旧 custom 覆盖
    const logoPatch = {
      logoConfig: { type: 'default', url: '', source: 'team' }
    };
    Object.assign(this.data, logoPatch);
    this.setData(logoPatch);

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

    // 删除分队后：迁移孤儿报名成员到剩余第一个分队（不改 groups / scoreEntities / pairings）
    const migratedRegisterInfo = this._migrateRegisterUsersAfterTeamDelete(
      existing && existing.teamGroups,
      this.data.teamGroups,
      updated.registerInfo
    );
    if (migratedRegisterInfo) {
      updated.registerInfo = migratedRegisterInfo;
    }

    teamMatchStore.saveMatch(updated);
    const holeSync = require('../../../../utils/matchHoleOrderRebuild.js').syncAfterCourseHalfChange({
      matchId: updated.matchId,
      before: existing,
      after: updated
    });
    if (!holeSync.ok) {
      teamMatchStore.saveMatch(existing);
      wx.showToast({ title: holeSync.message || '保存失败', icon: 'none' });
      return;
    }
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
