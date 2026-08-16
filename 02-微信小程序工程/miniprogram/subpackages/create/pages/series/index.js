const { createHeaderStyle } = require('../../../../utils/headerEngine.js');
const seriesModel = require('../../../../utils/seriesModel.js');
const seriesStoreMod = require('../../../../utils/seriesStore.js');
const seriesValidators = require('../../../../utils/seriesValidators.js');
const timeWheelBridge = require('../../../../utils/timeWheelBridge.js');
const roundDraft = require('./roundDraft.js');
const participantDraft = require('./participantDraft.js');
const basicInfoDraft = require('./basicInfoDraft.js');
const partnerConfigUtil = require('../../../../utils/partnerConfig.js');
const seriesPublishAdapter = require('./seriesPublishAdapter.js');
const seriesPublishMod = require('../../../../utils/seriesPublish.js');
const gameStore = require('../../../../utils/gameStore.js');
const teamMatchStore = require('../../../../utils/teamMatchStore.js');
const seriesRoundUpdate = require('../../../../utils/seriesRoundUpdate.js');
const seriesInfoUpdate = require('../../../../utils/seriesInfoUpdate.js');
const seriesParticipantsUpdate = require('../../../../utils/seriesParticipantsUpdate.js');
const seriesStationMatch = require('../../../../utils/seriesStationMatch.js');
const seriesStationIndex = require('../../../../utils/seriesStationIndex.js');
const seriesFinishLock = require('../../../../utils/seriesFinishLock.js');
const seriesStoreDefault = require('../../../../utils/seriesStore.js');

var PUBLISHED_STRUCTURE_LOCKED_MSG =
  seriesInfoUpdate.PUBLISHED_STRUCTURE_LOCKED_MSG || '系列赛发布后暂不支持修改此项';
var EDIT_SERIES_ROUND_HINT = '请从系列赛管理使用「编辑本轮」修改轮次';
var PARTICIPANTS_BUSY_MSG =
  seriesParticipantsUpdate.STRUCTURE_BUSY_MSG ||
  '系列赛已有分组或比赛数据，暂不可修改主办方及参赛球队';
var HOST_MODE_LOCKED_MSG =
  seriesParticipantsUpdate.HOST_MODE_LOCKED_MSG || '系列赛发布后暂不支持切换主办场景';
var ROSTER_BLOCK_MSG =
  seriesParticipantsUpdate.ROSTER_BLOCK_MSG || '该球队已有报名球员，请先调整报名名单';

var TEAM_TEMPLATES = [
  {
    id: 'ryder',
    title: '莱德杯',
    desc: '队内两分队对抗 · 多轮比洞赛',
    badge: '后续阶段'
  },
  {
    id: 'individual_tour',
    title: '多轮个人比杆',
    desc: '个人比杆累计 · 多轮系列',
    badge: '后续阶段'
  },
  {
    id: 'division_series',
    title: '分队系列赛',
    desc: '队内多个分队 · 多轮比杆赛',
    badge: '首版目标'
  },
  {
    id: 'custom',
    title: '自定义系列赛',
    desc: '自由组合赛制结构',
    badge: '后续阶段'
  }
];

var ORG_TEMPLATES = [
  {
    id: 'ryder',
    title: '莱德杯',
    desc: '不同球队之间 · 多轮比洞赛',
    badge: '后续阶段'
  },
  {
    id: 'individual_tour',
    title: '多轮个人比杆',
    desc: '个人比杆累计 · 多轮系列',
    badge: '后续阶段'
  },
  {
    id: 'inter_team_series',
    title: '队际系列赛',
    desc: '不同球队之间 · 多轮比杆赛',
    badge: '首版目标'
  },
  {
    id: 'custom',
    title: '自定义系列赛',
    desc: '自由组合主办与赛制结构',
    badge: '后续阶段'
  }
];

var STEP_META = {
  1: { title: '主办场景', hint: '选择系列赛由谁主办，驱动后续文案与参赛主体' },
  2: { title: '系列赛类型', hint: '按主办场景展示可选模板；首版目标可继续，其余类型后续开放' },
  3: { title: '计分规则', hint: '设置计分模式、全局 M、重复上场与成绩口径；每轮 N 在轮次步骤设置' },
  4: { title: '轮次设置', hint: '一次应用轮次数，配置每轮球场、开球时间、赛制与费用' },
  5: {
    title: '主体与基础信息',
    hint: '配置主办单位、参赛主体、系列名称、可见范围、赛事信息与 PARTNER'
  },
  6: {
    title: '确认创建',
    hint: '核对全部配置后创建系列赛；成功后进入正式详情'
  }
};

var LATER_TEMPLATE_TOAST = '该类型将在后续阶段开放';
var TEAM_MIN_HINT = '至少需要两支参赛球队';
var DIVISION_MIN_HINT = '至少需要两个分队';
var EVENT_INFO_ROW_GAP_RPX = 16;
var EVENT_INFO_ROW_HEIGHT_RPX = 128;
var EVENT_INFO_ROW_STEP_RPX = EVENT_INFO_ROW_HEIGHT_RPX + EVENT_INFO_ROW_GAP_RPX;
var MEDIA_UPLOAD_LOCKED_TOAST = '图片上传将在后续开放';

var STROKE_GAME_MODES = [
  { name: '个人比杆赛', desc: '每位球员独立记分，按总杆排名' },
  { name: '四人四球比杆赛', desc: '四人一组，按比杆赛规则计分' },
  { name: '四人两球比杆赛', desc: '两人一队，按比杆赛规则计分' },
  { name: '最佳球位比杆赛', desc: '选择最佳落点，按比杆赛计分' }
];

var GLOBAL_M_INVALID_TOAST = 'M 必须为不小于 1 的整数';
var FEE_INVALID_TOAST = '请输入正确的费用，最多保留两位小数';

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function templatesForHost(hostMode) {
  return hostMode === 'organization' ? ORG_TEMPLATES : TEAM_TEMPLATES;
}

function isTemplateCompatible(hostMode, templateId) {
  if (!templateId) return false;
  var list = templatesForHost(hostMode);
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === templateId) return true;
  }
  return false;
}

function deriveStep(draft) {
  return basicInfoDraft.deriveWizardStep(draft, {
    isTemplateCompatible: isTemplateCompatible
  });
}

function canAdvanceFromStep4(draft) {
  var rounds = Array.isArray(draft && draft.rounds) ? draft.rounds : [];
  if (rounds.length < 2) {
    return { ok: false, message: '轮次数至少为 2' };
  }
  var seen = Object.create(null);
  for (var i = 0; i < rounds.length; i++) {
    var rid = rounds[i] && rounds[i].roundId != null ? String(rounds[i].roundId).trim() : '';
    if (!rid) return { ok: false, message: '存在无效轮次 ID' };
    if (seen[rid]) return { ok: false, message: '轮次 ID 重复' };
    seen[rid] = 1;
  }
  var check = seriesValidators.validateDraftStructure(draft);
  if (!check.ok) {
    return {
      ok: false,
      message: (check.errors[0] && check.errors[0].message) || '草稿结构不完整'
    };
  }
  return { ok: true };
}

function scoringRuleOf(draft) {
  return (draft && draft.scoringRule) || seriesModel.createDefaultScoringRule(null);
}

/** 严格正整数：trim → Number → finite → integer → >= 1 */
function parseStrictPositiveInteger(raw) {
  var text = String(raw == null ? '' : raw).trim();
  if (text === '') return null;
  var value = Number(text);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) return null;
  return value;
}

function readInputDetailValue(e) {
  return e && e.detail && e.detail.value != null ? e.detail.value : '';
}

/**
 * 原生 input 编辑缓冲会话（可单测）。
 * bindinput 禁止 setData，必须 return e.detail.value。
 */
function createNativeNumberInputSession(options) {
  var opts = options || {};
  var parse = typeof opts.parse === 'function' ? opts.parse : parseStrictPositiveInteger;
  var session = {
    focused: false,
    dirty: false,
    buffer: '',
    dataValue: opts.initialDisplay != null ? String(opts.initialDisplay) : '',
    setDataCalls: [],
    focus: function (displayed) {
      session.focused = true;
      session.dirty = true;
      session.buffer =
        displayed != null ? String(displayed) : String(session.dataValue != null ? session.dataValue : '');
    },
    input: function (eOrRaw) {
      var value =
        eOrRaw && typeof eOrRaw === 'object' ? readInputDetailValue(eOrRaw) : eOrRaw != null ? eOrRaw : '';
      session.dirty = true;
      session.buffer = value;
      // 禁止 setData：由调用方保证；此处仅返回原生保留文本
      return value;
    },
    isEditing: function () {
      return !!(session.focused || session.dirty);
    },
    displayForProject: function (savedDisplay) {
      if (session.isEditing()) {
        return session.buffer != null ? String(session.buffer) : '';
      }
      return savedDisplay != null ? String(savedDisplay) : '';
    },
    peekRaw: function (e) {
      if (e && e.detail && e.detail.value != null) return e.detail.value;
      return session.buffer;
    },
    clearEditFlags: function () {
      session.focused = false;
      session.dirty = false;
    },
    /**
     * @returns {{ ok: boolean, value?: number|null, restored?: string }}
     */
    commit: function (rawOverride, savedFallback) {
      var raw = rawOverride != null ? rawOverride : session.buffer;
      var parsed = parse(raw);
      var fallback =
        savedFallback != null && String(savedFallback) !== ''
          ? String(savedFallback)
          : session.dataValue;
      session.clearEditFlags();
      if (parsed == null) {
        session.dataValue = fallback;
        session.buffer = '';
        session.setDataCalls.push({ value: fallback, reason: 'invalid_restore' });
        return { ok: false, value: null, restored: fallback };
      }
      session.dataValue = String(parsed);
      session.buffer = '';
      session.setDataCalls.push({ value: String(parsed), reason: 'valid_commit' });
      return { ok: true, value: parsed };
    }
  };
  return session;
}

/** 重投影时：编辑中用实例缓冲覆盖，避免 lastSaved 写回原生 input */
function overlayEditingNumberInputs(projected, editing) {
  var ui = projected || {};
  var ed = editing || {};
  if (ed.globalMEditing) {
    ui.globalMInput = ed.globalMBuffer != null ? String(ed.globalMBuffer) : ui.globalMInput;
  }
  if (ed.defaultTopNEditing) {
    ui.defaultTopNInput =
      ed.defaultTopNBuffer != null ? String(ed.defaultTopNBuffer) : ui.defaultTopNInput;
  }
  if (ed.roundCountEditing) {
    ui.roundCountInput =
      ed.roundCountBuffer != null ? String(ed.roundCountBuffer) : ui.roundCountInput;
  }
  return ui;
}

function overlayRoundCardTransientInputs(projectedCards, currentCards, exceptRoundId) {
  var projected = Array.isArray(projectedCards) ? projectedCards : [];
  var current = Array.isArray(currentCards) ? currentCards : [];
  var exceptId = exceptRoundId != null ? String(exceptRoundId) : '';
  var byId = Object.create(null);
  var i;
  for (i = 0; i < current.length; i++) {
    if (current[i] && current[i].roundId) {
      byId[String(current[i].roundId)] = current[i];
    }
  }
  return projected.map(function (card) {
    if (!card || !card.roundId) return card;
    if (String(card.roundId) === exceptId) return card;
    var prev = byId[String(card.roundId)];
    if (!prev) return card;
    var next = Object.assign({}, card);
    if (prev.topNInput != null) next.topNInput = prev.topNInput;
    if (prev.feeInput != null) next.feeInput = prev.feeInput;
    if (prev.name != null) next.name = prev.name;
    return next;
  });
}

function buildRoundCards(draft, scoringMode, editOpts) {
  var opts = editOpts && typeof editOpts === 'object' ? editOpts : {};
  var focusId = opts.focusRoundId != null ? String(opts.focusRoundId).trim() : '';
  var locks = opts.locks || null;
  var rounds = Array.isArray(draft && draft.rounds) ? draft.rounds : [];
  if (focusId) {
    rounds = rounds.filter(function (r) {
      return r && String(r.roundId || '').trim() === focusId;
    });
  }
  var showN = scoringMode === 'per_round_n';
  if (locks && locks.showTopN === false) showN = false;
  return rounds.map(function (r) {
    var round = r || {};
    var topN =
      round.topN != null && Number.isFinite(Number(round.topN))
        ? Math.floor(Number(round.topN))
        : roundDraft.DEFAULT_TOP_N;
    var fee = round.fee != null ? String(round.fee) : '';
    var dateTime = round.dateTime != null ? String(round.dateTime) : '';
    var datePart = '';
    var timePart = '';
    var parts = roundDraft.parseLocalDateTimeParts(dateTime);
    if (parts) {
      datePart =
        parts.year +
        '-' +
        String(parts.month).padStart(2, '0') +
        '-' +
        String(parts.day).padStart(2, '0');
      timePart =
        String(parts.hour).padStart(2, '0') + ':' + String(parts.minute).padStart(2, '0');
    }
    var nameLocked = !!(locks && locks.name && !locks.name.enabled);
    var courseLocked = !!(locks && locks.course && !locks.course.enabled);
    var timeLocked = !!(locks && locks.dateTime && !locks.dateTime.enabled);
    var modeLocked = !!(locks && locks.gameMode && !locks.gameMode.enabled);
    var feeLocked = !!(locks && locks.fee && !locks.fee.enabled);
    var topNLocked = !!(locks && locks.topN && !locks.topN.enabled);
    return {
      roundId: round.roundId || '',
      index: round.index || 0,
      name: round.name != null ? String(round.name) : '',
      dateTime: dateTime,
      datePart: datePart,
      timePart: timePart,
      dateTimeText: dateTime || '选择开球日期与时间',
      courseId: round.courseId || '',
      courseName: round.courseName || '',
      courseLocation: round.courseLocation || '',
      courseHalfText: round.courseHalfText || '',
      courseDisplay: round.courseName
        ? String(round.courseName) + (round.courseHalfText || '')
        : '选择球场',
      gameMode: round.gameMode || '',
      gameModeText: round.gameMode || '选择比赛赛制',
      showGameModeBatchHint: !focusId && Number(round.index) === 1,
      fee: fee,
      feeInput: fee,
      topN: topN,
      topNInput: String(topN),
      topNLabel: roundDraft.topNLabelForGameMode(round.gameMode),
      showTopN: showN && !(locks && locks.showTopN === false),
      isEditFocus: !!focusId,
      statusLabel: opts.statusLabel || '',
      nameDisabled: nameLocked,
      nameLockReason: nameLocked ? locks.name.reason : '',
      courseDisabled: courseLocked,
      courseLockReason: courseLocked ? locks.course.reason : '',
      dateTimeDisabled: timeLocked,
      dateTimeLockReason: timeLocked ? locks.dateTime.reason : '',
      gameModeDisabled: modeLocked,
      gameModeLockReason: modeLocked ? locks.gameMode.reason : '',
      feeDisabled: feeLocked,
      feeLockReason: feeLocked ? locks.fee.reason : '',
      topNDisabled: topNLocked,
      topNLockReason: topNLocked ? locks.topN.reason : ''
    };
  });
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    pageEyebrow: 'STEP 1/6',
    pageTitle: '系列赛创建',
    editRoundMode: false,
    editSeriesMode: false,
    editRoundBannerText: '',
    editSeriesBannerText: '',
    hideWizardProgress: false,
    structureLocked: false,
    participantsEditable: false,
    participantsLockReason: '',
    currentStep: 1,
    isSaving: false,
    draftInitError: false,
    draftInitErrorText: '',
    storageReadFailed: false,
    hostMode: '',
    templateId: '',
    scoringMode: 'per_round_n',
    globalM: 10,
    globalMInput: '10',
    defaultTopN: 3,
    defaultTopNInput: '3',
    allowRepeat: false,
    scoreBasis: 'gross',
    showGlobalM: false,
    showPerRoundN: true,
    templateOptions: [],
    roundCountInput: '2',
    roundCards: [],
    gameModeOptions: STROKE_GAME_MODES,
    showGameModeSheet: false,
    gameModeSheetRoundId: '',
    showTimePicker: false,
    timePickerTitle: '选择开球时间',
    teeYear: 2026,
    months: [],
    days: [],
    hours: [],
    minutes: [],
    teeIndex: [0, 0, 0, 0],
    stepHint: STEP_META[1].hint,
    stepTitle: STEP_META[1].title,
    primaryBtnText: '下一步',
    showPrev: false,
    progressSteps: [
      { index: 1, label: '场景', state: 'active' },
      { index: 2, label: '模板', state: 'upcoming' },
      { index: 3, label: '计分', state: 'upcoming' },
      { index: 4, label: '轮次', state: 'locked' },
      { index: 5, label: '主体', state: 'locked' },
      { index: 6, label: '确认', state: 'locked' }
    ],
    // Step 5 UI
    isOrgHost: false,
    isTeamHost: false,
    organizationId: '',
    organizationName: '',
    organizationLogo: '',
    organizationDisplayName: '选择组织机构',
    hostTeamId: '',
    hostTeamName: '',
    hostTeamLogo: '',
    hostTeamDisplayName: '选择主办球队',
    teamParticipantChips: [],
    divisionCards: [],
    showParticipantsHint: false,
    participantsHintText: '',
    colorPalette: participantDraft.DIVISION_COLOR_PALETTE,
    showColorSheet: false,
    colorSheetDivisionId: '',
    // Step5 基础信息
    seriesNameInput: '',
    seriesNamePlaceholder: '请输入系列赛名称',
    seriesNameMax: basicInfoDraft.SERIES_NAME_MAX,
    seriesNameCount: 0,
    seriesSubtitleInput: '',
    seriesSubtitleMax: basicInfoDraft.SERIES_SUBTITLE_MAX,
    seriesSubtitleCount: 0,
    visibility: 'public',
    accessCode: '',
    accessCodeInput: '',
    eventInfoList: [],
    eventInfoSortAreaHeight: '0rpx',
    eventInfoDragPositions: [],
    eventInfoDraggingId: '',
    showAddEventInfoSheet: false,
    recommendedEventInfo: basicInfoDraft.RECOMMENDED_EVENT_INFO,
    eventTitleAddedMap: {},
    selectedRecommendIndex: null,
    customEventInfoTitle: '',
    manualInfoType: 'text',
    showEventDetailSheet: false,
    editingEventInfoIndex: -1,
    deleteConfirming: false,
    deleteBtnText: '删除本项',
    eventDetailEditLabel: '',
    eventDetailDraft: {
      id: '',
      title: '',
      type: 'text',
      content: '',
      brightImage: '',
      darkImage: '',
      isPhotoLive: false
    },
    partnerConfig: {
      partnerTitle: '',
      partnerLogos: []
    },
    // Step6 确认摘要
    confirmRounds: [],
    confirmScoringText: '',
    confirmVisibilityText: '',
    confirmAccessCodeText: '',
    confirmEventInfoCountText: '',
    confirmPartnerText: '',
    createSeriesLocked: false,
    createPublishButtonMode: 'create'
  },

  onLoad(query) {
    this._isSaving = false;
    this._isPublishing = false;
    this._publishNavPending = false;
    this._publishDetailUrl = '';
    this._pageAlive = true;
    this._editRoundMode = false;
    this._editSeriesMode = false;
    this._editRoundId = '';
    this._editSeriesId = '';
    this._editLocks = null;
    this._editExpectedSeriesUpdatedAt = '';
    this._editExpectedMatchFingerprint = '';
    this._roundUpdateService = null;
    this._infoUpdateService = null;
    this._participantsUpdateService = null;
    this._editSeriesBaseline = null;
    this._participantsLocks = null;
    this._pendingOrgSelect = false;
    this._pendingParticipantsSelect = false;
    this._pendingHostTeamSelect = false;
    this._isHostModeSwitchConfirming = false;
    this._isHostTeamSwitchConfirming = false;
    this._hasShownRestoreToast = false;
    this._lastReadFailed = false;
    this._isRoundCountConfirming = false;
    this._pendingCourseRoundId = '';
    this._pendingTimeRoundId = '';
    this._pendingResizeRounds = null;
    // 全局 M / 默认 N / 轮次数：原生 input 编辑缓冲（bindinput 不 setData）
    this._focusedGlobalM = false;
    this._dirtyGlobalM = false;
    this._editingGlobalMInput = null;
    this._focusedDefaultTopN = false;
    this._dirtyDefaultTopN = false;
    this._editingDefaultTopNInput = null;
    this._preserveRoundInputsExceptId = null;
    this._focusedRoundCount = false;
    this._dirtyRoundCount = false;
    this._editingRoundCountInput = null;
    this._pendingAdvanceAfterRoundApply = false;
    this._focusedSeriesName = false;
    this._dirtySeriesName = false;
    this._editingSeriesNameInput = null;
    this._activeTimeTarget = 'round';
    this._eventInfoDragging = null;
    this._eventInfoRowStepPx = 0;
    this._suppressEventInfoTap = false;
    this._deleteConfirmTimer = null;
    this._ensuringStep5Defaults = false;
    this._editingTime = timeWheelBridge.parseTimeToDraft(roundDraft.createDefaultLocalDateTime());
    this._store = this._createPageStore();
    this.lastSavedDraft = null;
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    this._bootstrapDraft(query || {});
  },

  onShow() {
    if (!this._pageAlive) return;
    this.applyTheme(getApp().getTheme());
    // 延后清理 pending：保证 navigateBack 同期的 eventChannel 回调先落地，取消返回再清掉
    var self = this;
    setTimeout(function () {
      if (!self._pageAlive) return;
      if (self._pendingCourseRoundId) self._pendingCourseRoundId = '';
      self._pendingOrgSelect = false;
      self._pendingParticipantsSelect = false;
      self._pendingHostTeamSelect = false;
    }, 0);
  },

  onUnload() {
    this._clearNumberEditBuffers();
    if (this._eventDeleteTimer) {
      clearTimeout(this._eventDeleteTimer);
      this._eventDeleteTimer = null;
    }
    this._pageAlive = false;
  },

  _safeSetData(payload) {
    if (!this._pageAlive) return;
    this.setData(payload);
  },

  _createPageStore() {
    var self = this;
    var base = seriesStoreMod.createWxStorageAdapter();
    return seriesStoreMod.createSeriesStore({
      getItem: function (key) {
        var res = base.getItem(key);
        if (res && typeof res === 'object' && res.ok === false) {
          self._lastReadFailed = true;
        }
        return res;
      },
      setItem: function (key, value) {
        return base.setItem(key, value);
      }
    });
  },

  initHeaderNav() {
    var header = createHeaderStyle();
    this._safeSetData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle
    });
  },

  applyTheme(theme) {
    this._safeSetData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  _clearNumberEditBuffers() {
    this._focusedGlobalM = false;
    this._dirtyGlobalM = false;
    this._editingGlobalMInput = null;
    this._focusedDefaultTopN = false;
    this._dirtyDefaultTopN = false;
    this._editingDefaultTopNInput = null;
    this._focusedRoundCount = false;
    this._dirtyRoundCount = false;
    this._editingRoundCountInput = null;
    this._pendingAdvanceAfterRoundApply = false;
    this._focusedSeriesName = false;
    this._dirtySeriesName = false;
    this._editingSeriesNameInput = null;
  },

  _isEditingGlobalM() {
    return !!(this._focusedGlobalM || this._dirtyGlobalM);
  },

  _isEditingDefaultTopN() {
    return !!(this._focusedDefaultTopN || this._dirtyDefaultTopN);
  },

  _isEditingRoundCount() {
    return !!(this._focusedRoundCount || this._dirtyRoundCount);
  },

  _isEditingSeriesName() {
    return !!(this._focusedSeriesName || this._dirtySeriesName);
  },

  _isEditingSeriesSubtitle() {
    return !!(this._focusedSeriesSubtitle || this._dirtySeriesSubtitle);
  },

  /** 草稿投影；数字/名称编辑中强制用实例缓冲 */
  _uiPayloadFromDraft(draft, stepOverride) {
    var projected = this._projectUiFromDraft(draft, stepOverride);
    projected = overlayEditingNumberInputs(projected, {
      globalMEditing: this._isEditingGlobalM(),
      globalMBuffer: this._editingGlobalMInput,
      defaultTopNEditing: this._isEditingDefaultTopN(),
      defaultTopNBuffer: this._editingDefaultTopNInput,
      roundCountEditing: this._isEditingRoundCount(),
      roundCountBuffer: this._editingRoundCountInput
    });
    if (this._preserveRoundInputsExceptId != null) {
      projected.roundCards = overlayRoundCardTransientInputs(
        projected.roundCards,
        this.data.roundCards,
        this._preserveRoundInputsExceptId
      );
    }
    if (this._isEditingSeriesName()) {
      projected.seriesNameInput =
        this._editingSeriesNameInput != null
          ? String(this._editingSeriesNameInput)
          : projected.seriesNameInput;
      projected.seriesNameCount = basicInfoDraft.countInputChars(projected.seriesNameInput);
    }
    if (this._isEditingSeriesSubtitle()) {
      projected.seriesSubtitleInput =
        this._editingSeriesSubtitleInput != null
          ? String(this._editingSeriesSubtitleInput)
          : projected.seriesSubtitleInput;
      projected.seriesSubtitleCount = basicInfoDraft.countInputChars(
        projected.seriesSubtitleInput
      );
    }
    return projected;
  },

  _getEventInfoRowStepPx() {
    if (this._eventInfoRowStepPx) return this._eventInfoRowStepPx;
    var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this._eventInfoRowStepPx = (info.windowWidth / 750) * EVENT_INFO_ROW_STEP_RPX;
    return this._eventInfoRowStepPx;
  },

  _buildEventInfoDragPositions(list) {
    var step = this._getEventInfoRowStepPx();
    return (list || []).map(function (_, index) {
      return index * step;
    });
  },

  _buildEventInfoSortUi(list) {
    var items = Array.isArray(list) ? list : [];
    var count = items.length;
    return {
      eventInfoDragPositions: this._buildEventInfoDragPositions(items),
      eventInfoSortAreaHeight: count
        ? count * EVENT_INFO_ROW_STEP_RPX - EVENT_INFO_ROW_GAP_RPX + 'rpx'
        : '0rpx',
      eventTitleAddedMap: basicInfoDraft.buildEventInfoTitleMap(items)
    };
  },

  getInfoTypeLabel(type) {
    return type === 'image' ? '图片' : '文本';
  },

  /**
   * 首次进入 Step5：原子灌入默认赛事信息 + PARTNER；失败则完整回滚（不单独改 UI）
   * @returns {boolean}
   */
  _ensureStep5Defaults() {
    if (!this.lastSavedDraft || this._ensuringStep5Defaults) return !!this.lastSavedDraft;
    var plan = basicInfoDraft.planStep5FirstEnter(this.lastSavedDraft);
    if (!plan.changed) return true;
    this._ensuringStep5Defaults = true;
    var savedOk = false;
    try {
      savedOk = this._persistNextDraft(
        function (draft) {
          basicInfoDraft.applyStep5FirstEnter(draft, plan);
        },
        { keepStep: true }
      );
    } finally {
      this._ensuringStep5Defaults = false;
    }
    return savedOk;
  },

  /** 进入 Step5 展示前确保默认项已落盘 */
  _enterStep5Ui() {
    if (!this.lastSavedDraft) return;
    this._clearNumberEditBuffers();
    if (!this._ensureStep5Defaults()) {
      // 保存失败时 _persistNextDraft 已回滚投影；强制停在 Step5 旧草稿
      this._safeSetData(this._uiPayloadFromDraft(this.lastSavedDraft, 5));
      return;
    }
    this._safeSetData(this._uiPayloadFromDraft(this.lastSavedDraft, 5));
  },

  _getRoundCountRawFromBuffer() {
    if (this._isEditingRoundCount() && this._editingRoundCountInput != null) {
      return this._editingRoundCountInput;
    }
    return this.data.roundCountInput;
  },

  _getGlobalMRawFromBuffer(e) {
    if (e && e.detail && e.detail.value != null) return e.detail.value;
    if (this._isEditingGlobalM() && this._editingGlobalMInput != null) {
      return this._editingGlobalMInput;
    }
    return this.data.globalMInput;
  },

  _getDefaultTopNRawFromBuffer(e) {
    if (e && e.detail && e.detail.value != null) return e.detail.value;
    if (this._isEditingDefaultTopN() && this._editingDefaultTopNInput != null) {
      return this._editingDefaultTopNInput;
    }
    return this.data.defaultTopNInput;
  },

  _projectUiFromDraft(draft, stepOverride) {
    var d = draft || {};
    var rule = scoringRuleOf(d);
    var step = stepOverride != null ? stepOverride : deriveStep(d);
    var hostMode = d.hostMode || '';
    var templates = hostMode
      ? templatesForHost(hostMode).map(function (t) {
          return Object.assign({}, t, { active: t.id === d.templateId });
        })
      : [];
    var meta = STEP_META[step] || STEP_META[1];
    var stepHintText = meta.hint;
    var primaryBtnText = '下一步';
    if (step === 1) primaryBtnText = '下一步：选择类型';
    if (step === 2) primaryBtnText = '下一步：计分规则';
    if (step === 3) primaryBtnText = '下一步：轮次设置';
    if (step === 4) primaryBtnText = '下一步：主体与信息';
    if (step === 5) primaryBtnText = '下一步：确认创建';
    if (step === 6) {
      primaryBtnText = seriesPublishAdapter.resolvePrimaryButtonText(
        this.data.createPublishButtonMode || 'create',
        !!this._isPublishing
      );
    }

    var maxOpen = participantDraft.isFirstWaveTemplate(hostMode, d.templateId) ? 6 : 2;
    var progressSteps = [1, 2, 3, 4, 5, 6].map(function (idx) {
      var state = 'locked';
      if (idx <= maxOpen) {
        if (idx === step) state = 'active';
        else if (idx < step) state = 'done';
        else state = 'upcoming';
      }
      var labels = ['', '场景', '模板', '计分', '轮次', '信息', '确认'];
      return { index: idx, label: labels[idx], state: state };
    });

    var scoringMode = rule.mode || 'per_round_n';
    var rounds = Array.isArray(d.rounds) ? d.rounds : [];
    var org = d.organization || {};
    var hostTeam = d.hostTeam || {};
    var participants = Array.isArray(d.participants) ? d.participants : [];
    var isOrgHost = hostMode === 'organization';
    var isTeamHost = hostMode === 'team';
    var teamChips = participantDraft.buildTeamParticipantChips(participants);
    var divisionCards = participantDraft.buildDivisionCards(participants);
    var showParticipantsHint = false;
    var participantsHintText = '';
    if (isOrgHost && teamChips.length < 2) {
      showParticipantsHint = true;
      participantsHintText = TEAM_MIN_HINT;
    }
    if (isTeamHost && hostTeam.teamId && divisionCards.length < 2) {
      showParticipantsHint = true;
      participantsHintText = DIVISION_MIN_HINT;
    }

    var visibility = d.visibility === 'private' ? 'private' : 'public';
    var accessCode = visibility === 'private' ? String(d.accessCode || '') : '';
    var eventInfoList = Array.isArray(d.eventInfoList)
      ? d.eventInfoList.map(basicInfoDraft.cloneEventInfoItem)
      : [];
    var partnerConfig =
      basicInfoDraft.normalizePartnerConfigForSeries(d.partnerConfig) || {
        partnerTitle: '',
        partnerLogos: []
      };
    var sortUi = this._buildEventInfoSortUi(eventInfoList);
    var confirmRounds = basicInfoDraft.summarizeRoundsForConfirm(rounds, scoringMode);
    var scoringText =
      (scoringMode === 'global_m' ? '全局最好 M=' + (rule.globalM != null ? rule.globalM : 10) : '每轮 Top N') +
      ' · ' +
      (rule.scoreBasis === 'net' ? '净杆' : rule.scoreBasis === 'to_par' ? '相对标准杆' : '总杆') +
      (rule.allowRepeat ? ' · 允许重复上场' : ' · 不允许重复上场');
    var logoCount = (partnerConfig.partnerLogos || []).length;
    var partnerText =
      d.partnerConfig == null
        ? '未配置'
        : (partnerConfig.partnerTitle || 'PARTNER') +
          ' · ' +
          logoCount +
          ' 个 Logo' +
          (logoCount === 0 ? '（空）' : '');

    var editRoundMode = !!this._editRoundMode;
    var editSeriesMode = !!this._editSeriesMode;
    var pLocks = editSeriesMode ? this._participantsLocks || {} : null;
    var seriesRoundLocks = editSeriesMode
      ? {
          name: { enabled: false, reason: EDIT_SERIES_ROUND_HINT },
          course: { enabled: false, reason: EDIT_SERIES_ROUND_HINT },
          dateTime: { enabled: false, reason: EDIT_SERIES_ROUND_HINT },
          gameMode: { enabled: false, reason: EDIT_SERIES_ROUND_HINT },
          fee: { enabled: false, reason: EDIT_SERIES_ROUND_HINT },
          topN: { enabled: false, reason: EDIT_SERIES_ROUND_HINT },
          showTopN: scoringMode === 'per_round_n'
        }
      : null;
    var roundCards = buildRoundCards(
      d,
      scoringMode,
      editRoundMode
        ? {
            focusRoundId: this._editRoundId,
            locks: this._editLocks,
            statusLabel: this._editStatusLabel || ''
          }
        : editSeriesMode
          ? { locks: seriesRoundLocks }
          : null
    );
    if (editRoundMode) {
      primaryBtnText = '保存本轮';
      stepHintText = '仅修改所选轮次；保存后同步 Series 与分站比赛';
    } else if (editSeriesMode) {
      primaryBtnText = step >= 5 ? '保存修改' : '下一步';
      if (step === 5) {
        stepHintText = pLocks && pLocks.editable
          ? '可修改主办方、参赛主体、名称、可见性、赛事信息与 PARTNER'
          : (pLocks && pLocks.reason) || PARTICIPANTS_BUSY_MSG;
      } else if (step === 4) {
        stepHintText = EDIT_SERIES_ROUND_HINT;
      } else if (step === 1) {
        stepHintText = HOST_MODE_LOCKED_MSG;
      } else {
        stepHintText = PUBLISHED_STRUCTURE_LOCKED_MSG;
      }
    }

    return Object.assign(
      {
        currentStep: step,
        hostMode: hostMode,
        templateId: d.templateId || '',
        scoringMode: scoringMode,
        globalM: rule.globalM != null ? rule.globalM : 10,
        globalMInput: String(rule.globalM != null ? rule.globalM : 10),
        defaultTopN: (function () {
          var resolved = roundDraft.resolveDefaultTopNForRule(rule);
          return resolved.ok ? resolved.value : roundDraft.DEFAULT_TOP_N;
        })(),
        defaultTopNInput: (function () {
          var resolved = roundDraft.resolveDefaultTopNForRule(rule);
          return String(resolved.ok ? resolved.value : rule.defaultTopN != null ? rule.defaultTopN : roundDraft.DEFAULT_TOP_N);
        })(),
        allowRepeat: !!rule.allowRepeat,
        scoreBasis: rule.scoreBasis || 'gross',
        showGlobalM: scoringMode === 'global_m',
        showPerRoundN: scoringMode === 'per_round_n',
        templateOptions: templates,
        roundCountInput: String(Math.max(2, rounds.length || 2)),
        roundCards: roundCards,
        stepHint: stepHintText,
        stepTitle: editRoundMode
          ? '编辑本轮'
          : editSeriesMode
            ? step === 5
              ? '修改系列赛'
              : meta.title
            : meta.title,
        pageEyebrow: editRoundMode
          ? 'EDIT ROUND'
          : editSeriesMode
            ? 'EDIT SERIES'
            : 'STEP ' + step + '/6',
        pageTitle: editRoundMode
          ? '编辑本轮'
          : editSeriesMode
            ? '修改系列赛'
            : '系列赛创建',
        editRoundMode: editRoundMode,
        editSeriesMode: editSeriesMode,
        structureLocked: editSeriesMode,
        participantsEditable: editSeriesMode ? !!(pLocks && pLocks.editable) : true,
        participantsLockReason:
          editSeriesMode && pLocks && !pLocks.editable ? pLocks.reason || PARTICIPANTS_BUSY_MSG : '',
        hideWizardProgress: editRoundMode,
        primaryBtnText: primaryBtnText,
        showPrev: editRoundMode ? false : step > 1,
        progressSteps: editRoundMode
          ? []
          : editSeriesMode
            ? progressSteps.filter(function (p) {
                return p && Number(p.index) <= 5;
              })
            : progressSteps,
        draftInitError: false,
        draftInitErrorText: '',
        storageReadFailed: false,
        isOrgHost: isOrgHost,
        isTeamHost: isTeamHost,
        organizationId: org.organizationId || '',
        organizationName: org.organizationName || '',
        organizationLogo: org.organizationLogo || '',
        organizationDisplayName: org.organizationId
          ? org.organizationName || '已选组织机构'
          : '选择组织机构',
        hostTeamId: hostTeam.teamId || '',
        hostTeamName: hostTeam.teamName || '',
        hostTeamLogo: hostTeam.teamLogo || '',
        hostTeamDisplayName: hostTeam.teamId ? hostTeam.teamName || '已选主办球队' : '选择主办球队',
        teamParticipantChips: teamChips,
        divisionCards: divisionCards,
        showParticipantsHint: showParticipantsHint,
        participantsHintText: participantsHintText,
        colorPalette: participantDraft.DIVISION_COLOR_PALETTE,
        seriesNameInput: d.seriesName != null ? String(d.seriesName) : '',
        seriesNamePlaceholder: basicInfoDraft.buildSeriesNamePlaceholder({
          hostMode: hostMode,
          organization: org,
          hostTeam: hostTeam,
          templateId: d.templateId
        }),
        seriesNameMax: basicInfoDraft.SERIES_NAME_MAX,
        seriesNameCount: basicInfoDraft.countInputChars(d.seriesName),
        seriesSubtitleInput: d.seriesSubtitle != null ? String(d.seriesSubtitle) : '',
        seriesSubtitleMax: basicInfoDraft.SERIES_SUBTITLE_MAX,
        seriesSubtitleCount: basicInfoDraft.countInputChars(d.seriesSubtitle),
        visibility: visibility,
        accessCode: accessCode,
        accessCodeInput: accessCode,
        eventInfoList: eventInfoList,
        partnerConfig: partnerConfig,
        confirmRounds: confirmRounds,
        confirmScoringText: scoringText,
        confirmVisibilityText: visibility === 'private' ? '私密赛事' : '公开赛事',
        confirmAccessCodeText: visibility === 'private' ? accessCode : '',
        confirmEventInfoCountText:
          eventInfoList.length === 0 ? '未配置赛事信息' : '已配置 ' + eventInfoList.length + ' 项',
        confirmPartnerText: partnerText,
        createSeriesLocked: false,
        recommendedEventInfo: basicInfoDraft.RECOMMENDED_EVENT_INFO
      },
      sortUi
    );
  },

  _commitSavedDraft(savedSeries, stepOverride) {
    this.lastSavedDraft = deepClone(savedSeries);
    var step =
      stepOverride != null && stepOverride !== ''
        ? Number(stepOverride)
        : deriveStep(this.lastSavedDraft);
    if (step === 5 && !this._ensuringStep5Defaults) {
      // 已在 Step5：只确保默认项，不清空名称等编辑缓冲
      if (this.data.currentStep === 5) {
        if (!this._ensureStep5Defaults()) {
          this._safeSetData(this._uiPayloadFromDraft(this.lastSavedDraft, 5));
          return;
        }
        this._safeSetData(this._uiPayloadFromDraft(this.lastSavedDraft, 5));
        return;
      }
      this._enterStep5Ui();
      return;
    }
    this._safeSetData(this._uiPayloadFromDraft(this.lastSavedDraft, step));
  },

  _enterInitError(text, storageReadFailed) {
    this.lastSavedDraft = null;
    this._safeSetData({
      draftInitError: true,
      draftInitErrorText: text || '草稿初始化失败',
      storageReadFailed: !!storageReadFailed,
      isSaving: false,
      showPrev: false,
      primaryBtnText: '重试',
      pageEyebrow: 'ERROR',
      stepTitle: '无法继续',
      stepHint: text || '草稿初始化失败'
    });
  },

  _resolveCurrentCreatorId: function () {
    try {
      var user = gameStore.getCurrentUser ? gameStore.getCurrentUser() : null;
      var uid = user && user.userId != null ? String(user.userId).trim() : '';
      return uid;
    } catch (e) {
      return '';
    }
  },

  _createAndSaveBlankDraft(stepOverride) {
    var creatorId = this._resolveCurrentCreatorId();
    // 身份为空不伪造；发布时将因 creator_required 阻断
    var created = seriesModel.createEmptySeriesDraft(
      creatorId ? { createdBy: creatorId } : {}
    );
    created.hostMode = '';
    created.templateId = '';
    var saved = this._store.saveDraft(created);
    if (!saved.ok) {
      this._enterInitError('首次创建草稿失败，请稍后重试', false);
      return false;
    }
    this._commitSavedDraft(saved.series, stepOverride != null ? stepOverride : 1);
    return true;
  },

  _bootstrapDraft(query) {
    this._lastReadFailed = false;
    var q = query || {};
    var mode = q.mode != null ? String(q.mode).trim() : '';
    var seriesId = q.seriesId != null ? String(q.seriesId).trim() : '';
    var roundId = q.roundId != null ? String(q.roundId).trim() : '';

    if (mode === 'edit_round') {
      this._bootstrapEditRound(seriesId, roundId);
      return;
    }
    if (mode === 'edit_series') {
      this._bootstrapEditSeries(seriesId);
      return;
    }

    if (seriesId) {
      var byId = this._store.getSeriesById(seriesId);
      if (this._lastReadFailed) {
        this._enterInitError('存储读取失败，未改动任何草稿数据', true);
        return;
      }
      if (byId && byId.lifecycleStatus === 'draft') {
        this._commitSavedDraft(byId);
        return;
      }
      // 深链已发布 Series：显式补齐报名默认后仍开新草稿（不占用该 published 实体）
      if (byId && byId.lifecycleStatus === 'published') {
        try {
          seriesPublishMod.repairFirstPublishRegistrationDefaultsById(seriesId);
        } catch (ePub) {
          /* ignore */
        }
      }
      this._createAndSaveBlankDraft(1);
      return;
    }

    var list = this._store.listSeries();
    if (this._lastReadFailed) {
      this._enterInitError('存储读取失败，未改动任何草稿数据', true);
      return;
    }

    var latestDraft = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].lifecycleStatus === 'draft') {
        latestDraft = list[i];
        break;
      }
    }

    if (latestDraft) {
      this._commitSavedDraft(latestDraft);
      if (!this._hasShownRestoreToast) {
        this._hasShownRestoreToast = true;
        wx.showToast({ title: '已恢复上次未完成的系列赛', icon: 'none' });
      }
      return;
    }

    this._createAndSaveBlankDraft(1);
  },

  _getRoundUpdateService: function () {
    if (this._roundUpdateService) return this._roundUpdateService;
    this._roundUpdateService = seriesRoundUpdate.createSeriesRoundUpdateService({
      seriesStore: seriesStoreDefault,
      teamMatchStore: teamMatchStore,
      getIndexByMatchId: function (id) {
        return seriesStationIndex.getByMatchId(id);
      }
    });
    return this._roundUpdateService;
  },

  _getInfoUpdateService: function () {
    if (this._infoUpdateService) return this._infoUpdateService;
    this._infoUpdateService = seriesInfoUpdate.createSeriesInfoUpdateService({
      seriesStore: seriesStoreDefault,
      teamMatchStore: teamMatchStore,
      getIndexByMatchId: function (id) {
        return seriesStationIndex.getByMatchId(id);
      }
    });
    return this._infoUpdateService;
  },

  _getParticipantsUpdateService: function () {
    if (this._participantsUpdateService) return this._participantsUpdateService;
    this._participantsUpdateService =
      seriesParticipantsUpdate.createSeriesParticipantsUpdateService({
        seriesStore: seriesStoreDefault,
        teamMatchStore: teamMatchStore,
        getIndexByMatchId: function (id) {
          return seriesStationIndex.getByMatchId(id);
        }
      });
    return this._participantsUpdateService;
  },

  _refreshParticipantsLocks: function (series) {
    var svc = this._getParticipantsUpdateService();
    var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
    var matches = [];
    for (var i = 0; i < rounds.length; i++) {
      var mid = rounds[i] && rounds[i].matchId ? String(rounds[i].matchId).trim() : '';
      if (!mid) continue;
      var m = teamMatchStore.getMatchById(mid);
      if (m) matches.push(m);
    }
    this._participantsLocks = svc.resolveParticipantsEditLocks(series, matches);
    return this._participantsLocks;
  },

  _blockPublishedStructureEdit: function (customMsg) {
    if (!this._editSeriesMode) return false;
    wx.showToast({
      title: customMsg || PUBLISHED_STRUCTURE_LOCKED_MSG,
      icon: 'none'
    });
    return true;
  },

  _assertParticipantsEditable: function () {
    if (!this._editSeriesMode) return true;
    var locks = this._participantsLocks || this._refreshParticipantsLocks(this.lastSavedDraft);
    if (locks && locks.editable) return true;
    wx.showToast({
      title: (locks && locks.reason) || PARTICIPANTS_BUSY_MSG,
      icon: 'none'
    });
    return false;
  },

  _hasParticipantsHostChanged: function (draft, baseline) {
    if (!baseline) return true;
    try {
      return (
        JSON.stringify(draft && draft.organization ? draft.organization : {}) !==
          JSON.stringify(baseline.organization || {}) ||
        JSON.stringify(draft && draft.hostTeam ? draft.hostTeam : {}) !==
          JSON.stringify(baseline.hostTeam || {}) ||
        JSON.stringify(draft && draft.participants ? draft.participants : []) !==
          JSON.stringify(baseline.participants || [])
      );
    } catch (e) {
      return true;
    }
  },

  _assertRemovedParticipantsHaveNoRoster: function (beforeParts, nextParts) {
    if (!this._editSeriesMode) return true;
    var before = Array.isArray(beforeParts) ? beforeParts : [];
    var next = Array.isArray(nextParts) ? nextParts : [];
    var nextSet = Object.create(null);
    for (var i = 0; i < next.length; i++) {
      var p = next[i];
      if (!p) continue;
      var nid = p.seriesParticipantId
        ? String(p.seriesParticipantId).trim()
        : p.kind === 'division'
          ? 'division:' + String(p.divisionId || '').trim()
          : 'team:' + String(p.sourceTeamId || '').trim();
      if (nid) nextSet[nid] = true;
    }
    for (var j = 0; j < before.length; j++) {
      var bp = before[j];
      if (!bp) continue;
      var bid = bp.seriesParticipantId
        ? String(bp.seriesParticipantId).trim()
        : bp.kind === 'division'
          ? 'division:' + String(bp.divisionId || '').trim()
          : 'team:' + String(bp.sourceTeamId || '').trim();
      if (!bid || nextSet[bid]) continue;
      if (seriesParticipantsUpdate.hasActiveRosterForParticipant(this.lastSavedDraft, bid)) {
        wx.showToast({ title: ROSTER_BLOCK_MSG, icon: 'none' });
        return false;
      }
    }
    return true;
  },

  _bootstrapEditSeries: function (seriesId) {
    this._editSeriesMode = true;
    this._editRoundMode = false;
    this._editSeriesId = seriesId;
    if (!seriesId) {
      this._enterInitError('系列赛数据异常', false);
      return;
    }
    var series = this._store.getSeriesById(seriesId);
    if (this._lastReadFailed) {
      this._enterInitError('存储读取失败，未改动任何数据', true);
      return;
    }
    if (!series || String(series.lifecycleStatus || '').trim() !== 'published') {
      this._enterInitError('系列赛数据异常', false);
      return;
    }
    if (seriesFinishLock.isSeriesCompleted(series)) {
      this._enterInitError(seriesFinishLock.SERIES_COMPLETED_TOAST, false);
      return;
    }
    try {
      this._getInfoUpdateService().recoverInterruptedEdit();
    } catch (eRec) {
      /* ignore */
    }
    try {
      this._getParticipantsUpdateService().recoverInterruptedEdit();
    } catch (eRec2) {
      /* ignore */
    }
    this._editExpectedSeriesUpdatedAt = String(series.updatedAt || '').trim();
    this._editSeriesBaseline = deepClone(series);
    this.lastSavedDraft = deepClone(series);
    var locks = this._refreshParticipantsLocks(series);
    this._safeSetData(
      Object.assign(this._projectUiFromDraft(this.lastSavedDraft, 5), {
        editSeriesMode: true,
        structureLocked: true,
        participantsEditable: !!locks.editable,
        participantsLockReason: locks.editable ? '' : locks.reason || PARTICIPANTS_BUSY_MSG,
        pageTitle: '修改系列赛',
        pageEyebrow: 'EDIT SERIES',
        stepTitle: '修改系列赛',
        stepHint: locks.editable
          ? '可修改主办方、参赛主体、名称、可见性、赛事信息与 PARTNER'
          : locks.reason || PARTICIPANTS_BUSY_MSG,
        showPrev: true,
        primaryBtnText: '保存修改',
        hideWizardProgress: false,
        editSeriesBannerText:
          (series.seriesName || '系列赛') +
          ' · ' +
          (series.visibility === 'private' ? '私密' : '公开')
      })
    );
  },

  _bootstrapEditRound: function (seriesId, roundId) {
    this._editRoundMode = true;
    this._editSeriesId = seriesId;
    this._editRoundId = roundId;
    if (!seriesId || !roundId) {
      this._enterInitError('本轮比赛数据异常', false);
      return;
    }
    var series = this._store.getSeriesById(seriesId);
    if (this._lastReadFailed) {
      this._enterInitError('存储读取失败，未改动任何数据', true);
      return;
    }
    if (!series || String(series.lifecycleStatus || '').trim() !== 'published') {
      this._enterInitError('本轮比赛数据异常', false);
      return;
    }
    if (seriesFinishLock.isSeriesCompleted(series)) {
      this._enterInitError(seriesFinishLock.SERIES_COMPLETED_TOAST, false);
      return;
    }
    var round = null;
    var rounds = Array.isArray(series.rounds) ? series.rounds : [];
    for (var i = 0; i < rounds.length; i++) {
      if (rounds[i] && String(rounds[i].roundId || '').trim() === roundId) {
        round = rounds[i];
        break;
      }
    }
    if (!round || !round.matchId) {
      this._enterInitError('本轮比赛数据异常', false);
      return;
    }
    var match = teamMatchStore.getMatchById(String(round.matchId));
    if (!match || !(match.seriesContext && match.seriesContext.managed === true)) {
      this._enterInitError('本轮比赛数据异常', false);
      return;
    }
    var svc = this._getRoundUpdateService();
    try {
      svc.recoverInterruptedEdit();
    } catch (eRec) {
      /* ignore */
    }
    this._editLocks = svc.resolveRoundEditLocks(series, round, match);
    this._editExpectedSeriesUpdatedAt = String(series.updatedAt || '').trim();
    this._editExpectedMatchFingerprint =
      seriesStationMatch.computeStationPayloadFingerprint(match);
    // 内存工作副本：不 saveDraft、不改 lifecycle
    this.lastSavedDraft = deepClone(series);
    var statusLabel =
      String(match.statusLabel || '').trim() ||
      (String(match.status || '').toLowerCase() === 'ongoing'
        ? 'LIVE'
        : String(match.status || '').toLowerCase() === 'finished'
          ? '已结束'
          : '未开始');
    this._editStatusLabel = statusLabel;
    this._safeSetData(
      Object.assign(this._projectUiFromDraft(this.lastSavedDraft, 4), {
        editRoundMode: true,
        hideWizardProgress: true,
        pageTitle: '编辑本轮',
        pageEyebrow: 'EDIT ROUND',
        stepTitle: '编辑本轮',
        stepHint: '仅修改所选轮次；保存后同步 Series 与分站比赛',
        showPrev: false,
        primaryBtnText: '保存本轮',
        editRoundBannerText:
          'R' +
          (round.index || '') +
          ' · ' +
          (round.name || '未命名') +
          ' · ' +
          statusLabel
      })
    );
  },

  _withSaveLock(fn) {
    if (this._isSaving) return undefined;
    if (this.data.draftInitError) return undefined;
    if (!this.lastSavedDraft) return undefined;
    this._isSaving = true;
    this._safeSetData({ isSaving: true });
    try {
      return fn();
    } finally {
      this._isSaving = false;
      this._safeSetData({ isSaving: false });
    }
  },

  /**
   * edit_round：仅内存改目标轮，禁止 saveDraft / 禁止改其他轮与 Series 元数据
   */
  _persistEditRoundMemory(mutator, options) {
    var opts = options || {};
    var self = this;
    var ok = false;
    this._withSaveLock(function () {
      if (!self.lastSavedDraft || !self._editRoundId) return;
      var before = deepClone(self.lastSavedDraft);
      var next = deepClone(self.lastSavedDraft);
      mutator(next);
      // 强制保留 published 与非目标轮不变
      next.lifecycleStatus = 'published';
      next.seriesId = before.seriesId;
      next.scoringRule = deepClone(before.scoringRule);
      next.participants = deepClone(before.participants);
      next.organization = deepClone(before.organization);
      next.hostTeam = deepClone(before.hostTeam);
      next.hostMode = before.hostMode;
      next.templateId = before.templateId;
      next.seriesName = before.seriesName;
      next.seriesSubtitle = before.seriesSubtitle;
      next.visibility = before.visibility;
      next.accessCode = before.accessCode;
      next.registrationState = before.registrationState;
      next.registrationRevision = before.registrationRevision;
      next.roster = deepClone(before.roster);
      next.eventInfoList = deepClone(before.eventInfoList);
      next.partnerConfig = deepClone(before.partnerConfig);
      next.publishToken = before.publishToken;
      var focus = String(self._editRoundId);
      var beforeRounds = Array.isArray(before.rounds) ? before.rounds : [];
      var nextRounds = Array.isArray(next.rounds) ? next.rounds : [];
      var merged = beforeRounds.map(function (br) {
        if (!br || String(br.roundId) !== focus) return deepClone(br);
        var nr = null;
        for (var i = 0; i < nextRounds.length; i++) {
          if (nextRounds[i] && String(nextRounds[i].roundId) === focus) {
            nr = nextRounds[i];
            break;
          }
        }
        return nr ? deepClone(nr) : deepClone(br);
      });
      next.rounds = merged;
      self.lastSavedDraft = next;
      ok = true;
      var ui = self._projectUiFromDraft(next, 4);
      self._safeSetData(
        Object.assign(ui, {
          editRoundMode: true,
          hideWizardProgress: true,
          pageTitle: '编辑本轮',
          pageEyebrow: 'EDIT ROUND',
          showPrev: false,
          primaryBtnText: '保存本轮',
          editRoundBannerText: self.data.editRoundBannerText
        })
      );
      if (typeof opts.onSuccess === 'function') opts.onSuccess(next);
    });
    return ok;
  },

  /**
   * edit_series：仅内存改白名单展示字段，禁止 saveDraft / 禁止改结构
   */
  _persistEditSeriesMemory(mutator, options) {
    var opts = options || {};
    var self = this;
    var ok = false;
    this._withSaveLock(function () {
      if (!self.lastSavedDraft) return;
      var before = deepClone(self.lastSavedDraft);
      var next = deepClone(self.lastSavedDraft);
      mutator(next);
      // 结构字段强制回冻；主办/参赛在可编辑时保留 mutator；展示白名单保留 mutator
      next.lifecycleStatus = 'published';
      next.seriesId = before.seriesId;
      next.createdBy = before.createdBy;
      next.publishToken = before.publishToken;
      next.hostMode = before.hostMode;
      next.templateId = before.templateId;
      next.scoringRule = deepClone(before.scoringRule);
      next.rounds = deepClone(before.rounds);
      next.roster = deepClone(before.roster);
      next.registrationState = before.registrationState;
      next.registrationRevision = before.registrationRevision;
      var pLocks = self._participantsLocks || {};
      if (!pLocks.editable) {
        next.organization = deepClone(before.organization);
        next.hostTeam = deepClone(before.hostTeam);
        next.participants = deepClone(before.participants);
      }
      self.lastSavedDraft = next;
      ok = true;
      var stepKeep = opts.keepStep ? self.data.currentStep : 5;
      var ui = self._projectUiFromDraft(next, stepKeep);
      self._safeSetData(
        Object.assign(ui, {
          editSeriesMode: true,
          structureLocked: true,
          participantsEditable: !!pLocks.editable,
          participantsLockReason: pLocks.editable
            ? ''
            : pLocks.reason || PARTICIPANTS_BUSY_MSG,
          pageTitle: '修改系列赛',
          pageEyebrow: 'EDIT SERIES',
          primaryBtnText: stepKeep >= 5 ? '保存修改' : '下一步',
          editSeriesBannerText: self.data.editSeriesBannerText
        })
      );
      if (typeof opts.onSuccess === 'function') opts.onSuccess(next);
    });
    return ok;
  },

  /**
   * @returns {boolean}
   */
  _persistNextDraft(mutator, options) {
    if (this._editRoundMode) {
      return this._persistEditRoundMemory(mutator, options);
    }
    if (this._editSeriesMode) {
      return this._persistEditSeriesMemory(mutator, options);
    }
    var opts = options || {};
    var self = this;
    var savedOk = false;
    this._withSaveLock(function () {
      if (!self.lastSavedDraft) return;
      var nextDraft = deepClone(self.lastSavedDraft);
      mutator(nextDraft);
      nextDraft.lifecycleStatus = 'draft';
      var result = self._store.saveDraft(nextDraft);
      if (!result.ok) {
        self._safeSetData(self._uiPayloadFromDraft(self.lastSavedDraft, self.data.currentStep));
        var msg = '草稿保存失败';
        if (result.reason === 'storage_write_failed') msg = '存储写入失败';
        else if (result.errors && result.errors[0] && result.errors[0].message) {
          msg = result.errors[0].message;
        }
        wx.showToast({ title: msg, icon: 'none' });
        return;
      }
      savedOk = true;
      var stepKeep = opts.keepStep ? self.data.currentStep : null;
      self._commitSavedDraft(result.series, stepKeep != null ? stepKeep : deriveStep(result.series));
      if (typeof opts.onSuccess === 'function') opts.onSuccess(result.series);
    });
    return savedOk;
  },

  _replaceRounds(nextRounds) {
    return this._persistNextDraft(
      function (draft) {
        draft.rounds = nextRounds;
      },
      { keepStep: true }
    );
  },

  onSelectHostMode(e) {
    if (this._editSeriesMode) {
      this._blockPublishedStructureEdit(HOST_MODE_LOCKED_MSG);
      return;
    }
    var value = e.currentTarget.dataset.value;
    if (value !== 'team' && value !== 'organization') return;
    if (!this.lastSavedDraft) return;
    if (this.lastSavedDraft.hostMode === value) return;
    if (
      this._isSaving ||
      this._isHostModeSwitchConfirming ||
      this._isHostTeamSwitchConfirming
    ) {
      return;
    }

    var self = this;
    var applySwitch = function () {
      self._persistNextDraft(
        function (draft) {
          var prevHost = basicInfoDraft.hostDisplayName(draft);
          var cleared = participantDraft.clearBranchForHostModeSwitch(draft, value);
          draft.hostMode = cleared.hostMode;
          draft.organization = cleared.organization;
          draft.hostTeam = cleared.hostTeam;
          draft.participants = cleared.participants;
          if (draft.templateId && !isTemplateCompatible(value, draft.templateId)) {
            draft.templateId = '';
          }
          var nextHost = basicInfoDraft.hostDisplayName(draft);
          if (draft.partnerConfig) {
            draft.partnerConfig = basicInfoDraft.syncPartnerTitleOnHostRename(
              draft.partnerConfig,
              prevHost,
              nextHost
            );
          }
        },
        { keepStep: true }
      );
    };

    if (!participantDraft.hasStep5BranchData(this.lastSavedDraft)) {
      applySwitch();
      return;
    }

    this._isHostModeSwitchConfirming = true;
    wx.showModal({
      title: '切换主办场景',
      content: '切换后将清除当前主办单位与参赛主体配置，是否继续？',
      confirmText: '确认切换',
      cancelText: '取消',
      success: function (res) {
        self._isHostModeSwitchConfirming = false;
        if (res && res.confirm) applySwitch();
      },
      fail: function () {
        self._isHostModeSwitchConfirming = false;
      }
    });
  },

  onSelectTemplate(e) {
    if (this._blockPublishedStructureEdit()) return;
    var value = e.currentTarget.dataset.value;
    if (!value) return;
    if (!this.lastSavedDraft || !isTemplateCompatible(this.lastSavedDraft.hostMode, value)) {
      wx.showToast({ title: '请先选择兼容的主办场景', icon: 'none' });
      return;
    }
    this._persistNextDraft(function (draft) {
      draft.templateId = value;
    }, { keepStep: true });
  },

  onSelectScoringMode(e) {
    if (this._blockPublishedStructureEdit()) return;
    var value = e.currentTarget.dataset.value;
    if (value !== 'per_round_n' && value !== 'global_m') return;
    this._persistNextDraft(function (draft) {
      draft.scoringRule = scoringRuleOf(draft);
      draft.scoringRule.mode = value;
      if (draft.scoringRule.globalM == null || draft.scoringRule.globalM < 1) {
        draft.scoringRule.globalM = 10;
      }
      if (value === 'per_round_n') {
        var resolved = roundDraft.resolveDefaultTopNForRule(draft.scoringRule);
        if (!resolved.ok) return;
        var applied = roundDraft.applyDefaultTopNToRounds(draft.rounds, resolved.value);
        if (applied.ok) draft.rounds = applied.rounds;
      }
    }, { keepStep: true });
  },

  onSelectAllowRepeat(e) {
    if (this._blockPublishedStructureEdit()) return;
    var value = e.currentTarget.dataset.value;
    var allow = value === '1' || value === 1 || value === true;
    this._persistNextDraft(function (draft) {
      draft.scoringRule = scoringRuleOf(draft);
      draft.scoringRule.allowRepeat = !!allow;
    }, { keepStep: true });
  },

  onSelectScoreBasis(e) {
    if (this._blockPublishedStructureEdit()) return;
    var value = e.currentTarget.dataset.value;
    if (value !== 'gross' && value !== 'net' && value !== 'to_par') return;
    this._persistNextDraft(function (draft) {
      draft.scoringRule = scoringRuleOf(draft);
      draft.scoringRule.scoreBasis = value;
    }, { keepStep: true });
  },

  onGlobalMFocus() {
    if (this._editSeriesMode) return;
    this._focusedGlobalM = true;
    this._dirtyGlobalM = true;
    this._editingGlobalMInput =
      this.data.globalMInput != null ? String(this.data.globalMInput) : '';
  },

  onGlobalMInput(e) {
    var value = readInputDetailValue(e);
    this._dirtyGlobalM = true;
    this._editingGlobalMInput = value;
    // 禁止 setData：返回值让原生 input 保留正在输入的文本
    return value;
  },

  onGlobalMBlur(e) {
    this._commitGlobalMInput(this._getGlobalMRawFromBuffer(e));
  },

  onGlobalMStep(e) {
    var delta = Number(e.currentTarget.dataset.delta) || 0;
    var baseRaw = this._isEditingGlobalM()
      ? this._editingGlobalMInput
      : this.data.globalMInput;
    var base = parseStrictPositiveInteger(baseRaw);
    if (base == null) {
      var saved = scoringRuleOf(this.lastSavedDraft).globalM;
      base = parseStrictPositiveInteger(saved) != null ? saved : 10;
    }
    var next = Math.max(1, base + delta);
    this._commitGlobalMInput(String(next));
  },

  _commitGlobalMInput(rawOverride) {
    var raw =
      rawOverride != null
        ? rawOverride
        : this._isEditingGlobalM()
          ? this._editingGlobalMInput
          : this.data.globalMInput;
    var n = parseStrictPositiveInteger(raw);
    var savedM = scoringRuleOf(this.lastSavedDraft).globalM;
    var fallback = parseStrictPositiveInteger(savedM) != null ? savedM : 10;
    this._focusedGlobalM = false;
    this._dirtyGlobalM = false;
    this._editingGlobalMInput = null;
    if (n == null) {
      this._safeSetData({ globalMInput: String(fallback) });
      wx.showToast({ title: GLOBAL_M_INVALID_TOAST, icon: 'none' });
      return false;
    }
    var savedOk = this._persistNextDraft(function (draft) {
      draft.scoringRule = scoringRuleOf(draft);
      draft.scoringRule.globalM = n;
    }, { keepStep: true });
    if (savedOk) {
      this._safeSetData({ globalMInput: String(n), globalM: n });
    }
    return savedOk;
  },

  onDefaultTopNFocus() {
    if (this._editSeriesMode) return;
    this._focusedDefaultTopN = true;
    this._dirtyDefaultTopN = true;
    this._editingDefaultTopNInput =
      this.data.defaultTopNInput != null ? String(this.data.defaultTopNInput) : '';
  },

  onDefaultTopNInput(e) {
    var value = readInputDetailValue(e);
    this._dirtyDefaultTopN = true;
    this._editingDefaultTopNInput = value;
    return value;
  },

  onDefaultTopNBlur(e) {
    this._commitDefaultTopNInput(this._getDefaultTopNRawFromBuffer(e));
  },

  onDefaultTopNStep(e) {
    var delta = Number(e.currentTarget.dataset.delta) || 0;
    var baseRaw = this._isEditingDefaultTopN()
      ? this._editingDefaultTopNInput
      : this.data.defaultTopNInput;
    var base = roundDraft.parseStrictTopN(baseRaw);
    if (base == null) {
      var saved = scoringRuleOf(this.lastSavedDraft).defaultTopN;
      var resolved = roundDraft.resolveDefaultTopNForRule({ defaultTopN: saved });
      base = resolved.ok ? resolved.value : roundDraft.DEFAULT_TOP_N;
    }
    var next = Math.max(1, base + delta);
    this._commitDefaultTopNInput(String(next));
  },

  _commitDefaultTopNInput(rawOverride) {
    var raw =
      rawOverride != null
        ? rawOverride
        : this._isEditingDefaultTopN()
          ? this._editingDefaultTopNInput
          : this.data.defaultTopNInput;
    var n = roundDraft.parseStrictTopN(raw);
    var resolvedSaved = roundDraft.resolveDefaultTopNForRule(scoringRuleOf(this.lastSavedDraft));
    var fallback = resolvedSaved.ok ? resolvedSaved.value : roundDraft.DEFAULT_TOP_N;
    this._focusedDefaultTopN = false;
    this._dirtyDefaultTopN = false;
    this._editingDefaultTopNInput = null;
    if (n == null) {
      this._safeSetData({ defaultTopNInput: String(fallback) });
      wx.showToast({ title: 'N 必须为不小于 1 的整数', icon: 'none' });
      return false;
    }
    var savedOk = this._persistNextDraft(function (draft) {
      draft.scoringRule = scoringRuleOf(draft);
      draft.scoringRule.defaultTopN = n;
      var applied = roundDraft.applyDefaultTopNToRounds(draft.rounds, n);
      if (applied.ok) draft.rounds = applied.rounds;
    }, { keepStep: true });
    if (savedOk) {
      this._safeSetData({ defaultTopNInput: String(n), defaultTopN: n });
    }
    return savedOk;
  },

  onRoundCountFocus() {
    if (this._editRoundMode || this._editSeriesMode) return;
    this._focusedRoundCount = true;
    this._dirtyRoundCount = true;
    this._editingRoundCountInput =
      this.data.roundCountInput != null ? String(this.data.roundCountInput) : '';
  },

  onRoundCountInput(e) {
    if (this._editRoundMode || this._editSeriesMode) return '';
    var value = readInputDetailValue(e);
    this._dirtyRoundCount = true;
    this._editingRoundCountInput = value;
    return value;
  },

  /** 失焦：严格校验；非法恢复；合法只规范化展示，不自动改轮次卡片 */
  onRoundCountBlur(e) {
    if (this._editRoundMode || this._editSeriesMode) return;
    if (!this.lastSavedDraft) {
      this._focusedRoundCount = false;
      this._dirtyRoundCount = false;
      return;
    }
    var raw =
      e && e.detail && e.detail.value != null
        ? e.detail.value
        : this._getRoundCountRawFromBuffer();
    var target = roundDraft.parseStrictRoundCount(raw);
    var curLen = (this.lastSavedDraft.rounds || []).length;
    var fallback = String(Math.max(2, curLen || 2));
    this._focusedRoundCount = false;
    this._dirtyRoundCount = false;
    this._editingRoundCountInput = null;
    if (target == null) {
      this._safeSetData({ roundCountInput: fallback });
      wx.showToast({ title: '轮次数须为不小于 2 的整数', icon: 'none' });
      return;
    }
    this._safeSetData({ roundCountInput: String(target) });
  },

  /**
   * @param {{ advanceOnSuccess?: boolean }} options
   * @returns {'idle'|'invalid'|'fail'|'pending_confirm'|'ok'}
   */
  _applyRoundCountInternal(options) {
    var opts = options || {};
    if (this._editRoundMode || this._editSeriesMode) return 'idle';
    if (this._isSaving || this._isRoundCountConfirming || !this.lastSavedDraft) {
      return 'idle';
    }
    var raw = this._getRoundCountRawFromBuffer();
    var target = roundDraft.parseStrictRoundCount(raw);
    var curLen = (this.lastSavedDraft.rounds || []).length;
    var fallback = String(Math.max(2, curLen || 2));
    if (target == null) {
      this._focusedRoundCount = false;
      this._dirtyRoundCount = false;
      this._editingRoundCountInput = null;
      this._pendingAdvanceAfterRoundApply = false;
      this._safeSetData({ roundCountInput: fallback });
      wx.showToast({ title: '轮次数须为不小于 2 的整数', icon: 'none' });
      return 'invalid';
    }

    var resized = roundDraft.resizeRounds(this.lastSavedDraft.rounds, target, {
      defaultTopN: (function () {
        var resolved = roundDraft.resolveDefaultTopNForRule(
          scoringRuleOf(this.lastSavedDraft)
        );
        return resolved.ok ? resolved.value : roundDraft.DEFAULT_TOP_N;
      }.call(this))
    });
    if (!resized.ok) {
      this._focusedRoundCount = false;
      this._dirtyRoundCount = false;
      this._editingRoundCountInput = null;
      this._pendingAdvanceAfterRoundApply = false;
      this._safeSetData({ roundCountInput: fallback });
      wx.showToast({
        title: resized.reason === 'invalid_datetime' ? '轮次时间无效，无法扩展' : '轮次数无效',
        icon: 'none'
      });
      return 'invalid';
    }

    if (resized.needConfirm) {
      var self = this;
      this._isRoundCountConfirming = true;
      this._pendingResizeRounds = resized.rounds;
      this._pendingAdvanceAfterRoundApply = !!opts.advanceOnSuccess;
      wx.showModal({
        title: '确认减少轮次',
        content: '将删除的轮次已有配置（球场、时间、赛制等），确认删除？',
        confirmText: '删除',
        cancelText: '取消',
        success: function (res) {
          if (!self._pageAlive) {
            self._isRoundCountConfirming = false;
            self._pendingResizeRounds = null;
            self._pendingAdvanceAfterRoundApply = false;
            return;
          }
          if (res.confirm && self._pendingResizeRounds) {
            var nextRounds = self._pendingResizeRounds;
            var shouldAdvance = !!self._pendingAdvanceAfterRoundApply;
            self._pendingResizeRounds = null;
            self._isRoundCountConfirming = false;
            self._pendingAdvanceAfterRoundApply = false;
            self._focusedRoundCount = false;
            self._dirtyRoundCount = false;
            self._editingRoundCountInput = null;
            var ok = self._replaceRounds(nextRounds);
            if (ok && shouldAdvance) {
              self._enterStep5FromStep4();
            }
            return;
          }
          self._pendingResizeRounds = null;
          self._isRoundCountConfirming = false;
          self._pendingAdvanceAfterRoundApply = false;
          self._focusedRoundCount = false;
          self._dirtyRoundCount = false;
          self._editingRoundCountInput = null;
          var len = (self.lastSavedDraft && self.lastSavedDraft.rounds
            ? self.lastSavedDraft.rounds.length
            : 2) || 2;
          self._safeSetData({ roundCountInput: String(Math.max(2, len)) });
        },
        fail: function () {
          self._pendingResizeRounds = null;
          self._isRoundCountConfirming = false;
          self._pendingAdvanceAfterRoundApply = false;
          self._focusedRoundCount = false;
          self._dirtyRoundCount = false;
          self._editingRoundCountInput = null;
          var len = (self.lastSavedDraft && self.lastSavedDraft.rounds
            ? self.lastSavedDraft.rounds.length
            : 2) || 2;
          self._safeSetData({ roundCountInput: String(Math.max(2, len)) });
        }
      });
      return 'pending_confirm';
    }

    this._focusedRoundCount = false;
    this._dirtyRoundCount = false;
    this._editingRoundCountInput = null;
    this._pendingAdvanceAfterRoundApply = false;
    var savedOk = this._replaceRounds(resized.rounds);
    if (!savedOk) return 'fail';
    this._safeSetData({ roundCountInput: String(target) });
    if (opts.advanceOnSuccess) {
      this._enterStep5FromStep4();
    }
    return 'ok';
  },

  onApplyRoundCount() {
    if (this._editRoundMode) return;
    if (this._blockPublishedStructureEdit(EDIT_SERIES_ROUND_HINT)) return;
    this._applyRoundCountInternal({ advanceOnSuccess: false });
  },

  _commitPendingRoundTopNInputs() {
    if (scoringRuleOf(this.lastSavedDraft).mode !== 'per_round_n') return;
    var cards = this.data.roundCards || [];
    var i;
    for (i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (!card || !card.roundId) continue;
      if (card.topNInput == null) continue;
      this._commitRoundTopN(card.roundId, card.topNInput);
    }
  },

  _enterStep5FromStep4() {
    this._commitPendingRoundTopNInputs();
    var draft = this.lastSavedDraft;
    if (!draft) return;
    var gate = canAdvanceFromStep4(draft);
    if (!gate.ok) {
      wx.showToast({ title: gate.message || '请完善轮次设置', icon: 'none' });
      return;
    }
    this._enterStep5Ui();
  },

  onRoundNameInput(e) {
    if (this._editSeriesMode) return;
    var roundId = e.currentTarget.dataset.roundId;
    var value = e && e.detail && e.detail.value != null ? e.detail.value : '';
    var cards = (this.data.roundCards || []).map(function (card) {
      if (card.roundId !== roundId) return card;
      return Object.assign({}, card, { name: value });
    });
    this._safeSetData({ roundCards: cards });
  },

  _assertEditRoundField: function (fieldKey) {
    if (!this._editRoundMode) return true;
    var locks = this._editLocks || {};
    var lock = locks[fieldKey];
    if (lock && !lock.enabled) {
      wx.showToast({ title: lock.reason || '暂不可编辑', icon: 'none' });
      return false;
    }
    return true;
  },

  onRoundNameBlur(e) {
    if (this._blockPublishedStructureEdit(EDIT_SERIES_ROUND_HINT)) return;
    var roundId = e.currentTarget.dataset.roundId;
    if (this._editRoundMode && !this._assertEditRoundField('name')) {
      this._safeSetData(this._projectUiFromDraft(this.lastSavedDraft, 4));
      return;
    }
    var value = e.detail.value != null ? String(e.detail.value) : '';
    var cards = this.data.roundCards || [];
    var card = null;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].roundId === roundId) {
        card = cards[i];
        break;
      }
    }
    var name = value.trim() !== '' ? value.trim() : card && card.name != null ? String(card.name).trim() : '';
    if (!roundId) return;
    this._persistNextDraft(function (draft) {
      var rounds = Array.isArray(draft.rounds) ? draft.rounds : [];
      draft.rounds = rounds.map(function (r) {
        if (!r || r.roundId !== roundId) return r;
        var next = deepClone(r);
        if (name === '') {
          next.name = 'ROUND ' + next.index;
        } else {
          next.name = name;
        }
        return next;
      });
    }, { keepStep: true });
  },

  onSelectRoundCourse(e) {
    if (this._isSaving) return;
    if (this._blockPublishedStructureEdit(EDIT_SERIES_ROUND_HINT)) return;
    var roundId = e.currentTarget.dataset.roundId;
    if (!roundId || !this.lastSavedDraft) return;
    if (!this._assertEditRoundField('course')) return;
    var rounds = this.lastSavedDraft.rounds || [];
    var selectedId = '';
    for (var i = 0; i < rounds.length; i++) {
      if (rounds[i] && rounds[i].roundId === roundId) {
        selectedId = rounds[i].courseId || '';
        break;
      }
    }
    this._pendingCourseRoundId = roundId;
    var self = this;
    wx.navigateTo({
      url: '/pages/course/select/index?selectedId=' + encodeURIComponent(selectedId || ''),
      events: {
        courseSelected: function (payload) {
          var pendingId = self._pendingCourseRoundId;
          self._pendingCourseRoundId = '';
          if (!payload || !pendingId || !self._pageAlive) return;
          var snapshot = {
            courseId: payload.courseId || '',
            courseName: payload.courseName || '',
            courseLocation: payload.courseLocation || '',
            front9Course: payload.front9Course || null,
            back9Course: payload.back9Course || null,
            courseHalfText: payload.halfText ? '（' + payload.halfText + '）' : ''
          };
          // edit_round：只改当前轮，禁止向后级联
          if (self._editRoundMode) {
            self._persistNextDraft(function (draft) {
              draft.rounds = (draft.rounds || []).map(function (r) {
                if (!r || r.roundId !== pendingId) return r;
                return Object.assign(deepClone(r), snapshot);
              });
            }, { keepStep: true });
            return;
          }
          var cascaded = roundDraft.cascadeCourseFromRound(
            self.lastSavedDraft.rounds,
            pendingId,
            snapshot
          );
          if (!cascaded.ok) {
            wx.showToast({ title: '球场回填失败', icon: 'none' });
            return;
          }
          self._replaceRounds(cascaded.rounds);
        }
      },
      fail: function () {
        self._pendingCourseRoundId = '';
        wx.showToast({ title: '页面尚未注册', icon: 'none' });
      }
    });
  },

  onOpenRoundTimePicker(e) {
    if (this._isSaving) return;
    if (this._blockPublishedStructureEdit(EDIT_SERIES_ROUND_HINT)) return;
    var roundId = e.currentTarget.dataset.roundId;
    if (!roundId || !this.lastSavedDraft) return;
    if (!this._assertEditRoundField('dateTime')) return;
    var rounds = this.lastSavedDraft.rounds || [];
    var dateTime = '';
    for (var i = 0; i < rounds.length; i++) {
      if (rounds[i] && rounds[i].roundId === roundId) {
        dateTime = rounds[i].dateTime || '';
        break;
      }
    }
    this._pendingTimeRoundId = roundId;
    this._activeTimeTarget = 'round';
    // 动态默认仅初始化选择器；取消 closeTimePicker 不写草稿
    var pickerSeed = dateTime
      ? dateTime
      : roundDraft.createDefaultLocalDateTime();
    this._editingTime = Object.assign({}, timeWheelBridge.parseTimeToDraft(pickerSeed));
    var payload = timeWheelBridge.buildWheelPayload(this._editingTime);
    this._safeSetData(
      Object.assign({}, payload, {
        showTimePicker: true,
        timePickerTitle: '选择开球时间'
      })
    );
  },

  closeTimePicker() {
    // 取消：清理待回填 id，不触碰 lastSavedDraft
    this._pendingTimeRoundId = '';
    this._activeTimeTarget = '';
    this._safeSetData({ showTimePicker: false });
  },

  onTimePickerChange(e) {
    var result = timeWheelBridge.applyPickerValue(this._editingTime, e.detail.value);
    this._editingTime = result.draft;
    this._safeSetData({
      days: result.days,
      teeIndex: result.teeIndex,
      timeDraft: result.timeDraft
    });
  },

  onTimePickerYearChange(e) {
    this._editingTime.year += Number(e.detail.delta) || 0;
    this._safeSetData(timeWheelBridge.buildWheelPayload(this._editingTime));
  },

  confirmTimePicker() {
    var text = timeWheelBridge.formatDateTime(this._editingTime);
    this._safeSetData({ showTimePicker: false });

    var roundId = this._pendingTimeRoundId;
    this._pendingTimeRoundId = '';
    this._activeTimeTarget = '';
    if (!roundId || !this.lastSavedDraft) return;
    // edit_round：只改当前轮，禁止 +24h 级联
    if (this._editRoundMode) {
      this._persistNextDraft(function (draft) {
        draft.rounds = (draft.rounds || []).map(function (r) {
          if (!r || r.roundId !== roundId) return r;
          var next = deepClone(r);
          next.dateTime = text;
          next.dateTimeUserEdited = true;
          return next;
        });
      }, { keepStep: true });
      return;
    }
    var cascaded = roundDraft.cascadeDateTimeFromRound(this.lastSavedDraft.rounds, roundId, text);
    if (!cascaded.ok) {
      wx.showToast({
        title:
          cascaded.reason === 'invalid_anchor_datetime'
            ? '后续手动时间锚点无效'
            : '开球时间无效',
        icon: 'none'
      });
      this._safeSetData(this._uiPayloadFromDraft(this.lastSavedDraft, this.data.currentStep));
      return;
    }
    this._replaceRounds(cascaded.rounds);
  },

  onOpenGameModeSheet(e) {
    if (this._blockPublishedStructureEdit(EDIT_SERIES_ROUND_HINT)) return;
    var roundId = e.currentTarget.dataset.roundId;
    if (!roundId) return;
    if (!this._assertEditRoundField('gameMode')) return;
    this._safeSetData({
      showGameModeSheet: true,
      gameModeSheetRoundId: roundId
    });
  },

  closeGameModeSheet() {
    this._safeSetData({
      showGameModeSheet: false,
      gameModeSheetRoundId: ''
    });
  },

  onPickGameMode(e) {
    var mode = e.currentTarget.dataset.value;
    var roundId = this.data.gameModeSheetRoundId;
    this.closeGameModeSheet();
    if (!mode || !roundId || !seriesModel.GAME_MODE[mode]) return;
    if (!this.lastSavedDraft) return;
    if (!this._assertEditRoundField('gameMode')) return;
    // edit_round：禁止 R1 同步全部轮次
    if (this._editRoundMode) {
      var current = '';
      var rounds0 = this.lastSavedDraft.rounds || [];
      for (var gi = 0; gi < rounds0.length; gi++) {
        if (rounds0[gi] && rounds0[gi].roundId === roundId) {
          current = String(rounds0[gi].gameMode || '');
          break;
        }
      }
      if (current === mode) return;
      this._persistNextDraft(function (draft) {
        draft.rounds = (draft.rounds || []).map(function (r) {
          if (!r || r.roundId !== roundId) return r;
          var next = deepClone(r);
          next.gameMode = mode;
          return next;
        });
      }, { keepStep: true });
      return;
    }
    var applied = roundDraft.applyRoundGameMode(this.lastSavedDraft.rounds, roundId, mode);
    if (!applied.ok || !applied.rounds) return;
    // 同值幂等：不写盘、不投影闪动
    if (!applied.changed) return;
    // 一次构造完整 rounds → 一次 saveDraft；失败由 _replaceRounds/_persistNextDraft 整批回滚
    this._replaceRounds(applied.rounds);
  },

  onRoundFeeInput(e) {
    if (this._editSeriesMode) return;
    var roundId = e.currentTarget.dataset.roundId;
    var value = e && e.detail && e.detail.value != null ? e.detail.value : '';
    var cards = (this.data.roundCards || []).map(function (card) {
      if (card.roundId !== roundId) return card;
      return Object.assign({}, card, { feeInput: value });
    });
    this._safeSetData({ roundCards: cards });
  },

  onRoundFeeBlur(e) {
    if (this._blockPublishedStructureEdit(EDIT_SERIES_ROUND_HINT)) return;
    var roundId = e.currentTarget.dataset.roundId;
    var raw = e.detail.value;
    if (!roundId || !this.lastSavedDraft) return;
    if (!this._assertEditRoundField('fee')) {
      this._safeSetData(this._projectUiFromDraft(this.lastSavedDraft, 4));
      return;
    }
    var parsed = roundDraft.parseFeeInput(raw);
    var savedFee = '';
    var rounds = this.lastSavedDraft.rounds || [];
    for (var i = 0; i < rounds.length; i++) {
      if (rounds[i] && rounds[i].roundId === roundId) {
        savedFee = rounds[i].fee != null ? String(rounds[i].fee) : '';
        break;
      }
    }
    if (!parsed.ok) {
      var cards = (this.data.roundCards || []).map(function (card) {
        if (card.roundId !== roundId) return card;
        return Object.assign({}, card, { feeInput: savedFee, fee: savedFee });
      });
      this._safeSetData({ roundCards: cards });
      wx.showToast({ title: FEE_INVALID_TOAST, icon: 'none' });
      return;
    }
    this._persistNextDraft(function (draft) {
      draft.rounds = (draft.rounds || []).map(function (r) {
        if (!r || r.roundId !== roundId) return r;
        var next = deepClone(r);
        next.fee = parsed.value;
        return next;
      });
    }, { keepStep: true });
  },

  onRoundTopNInput(e) {
    if (this._editSeriesMode) return;
    var roundId = e.currentTarget.dataset.roundId;
    var value = e && e.detail && e.detail.value != null ? e.detail.value : '';
    var cards = (this.data.roundCards || []).map(function (card) {
      if (card.roundId !== roundId) return card;
      return Object.assign({}, card, { topNInput: value });
    });
    this._safeSetData({ roundCards: cards });
  },

  onRoundTopNBlur(e) {
    this._commitRoundTopN(e.currentTarget.dataset.roundId, e.detail.value);
  },

  onRoundTopNStep(e) {
    var roundId = e.currentTarget.dataset.roundId;
    var delta = Number(e.currentTarget.dataset.delta) || 0;
    var cards = this.data.roundCards || [];
    var input = '';
    var i;
    for (i = 0; i < cards.length; i++) {
      if (cards[i].roundId === roundId) {
        input = cards[i].topNInput;
        break;
      }
    }
    var base = roundDraft.parseStrictTopN(input);
    if (base == null) {
      var rounds = (this.lastSavedDraft && this.lastSavedDraft.rounds) || [];
      for (i = 0; i < rounds.length; i++) {
        if (rounds[i] && rounds[i].roundId === roundId) {
          base = roundDraft.parseStrictTopN(rounds[i].topN);
          break;
        }
      }
    }
    if (base == null) base = roundDraft.DEFAULT_TOP_N;
    var next = Math.max(1, base + delta);
    this._commitRoundTopN(roundId, String(next));
  },

  _commitRoundTopN(roundId, raw) {
    if (!roundId || !this.lastSavedDraft) return false;
    if (this._blockPublishedStructureEdit(EDIT_SERIES_ROUND_HINT)) return false;
    if (!this._assertEditRoundField('topN')) {
      this._safeSetData(this._projectUiFromDraft(this.lastSavedDraft, 4));
      return false;
    }
    if (scoringRuleOf(this.lastSavedDraft).mode !== 'per_round_n') return false;
    var n = roundDraft.parseStrictTopN(raw);
    var savedN = roundDraft.DEFAULT_TOP_N;
    var rounds = this.lastSavedDraft.rounds || [];
    for (var i = 0; i < rounds.length; i++) {
      if (rounds[i] && rounds[i].roundId === roundId) {
        var cur = roundDraft.parseStrictTopN(rounds[i].topN);
        if (cur != null) savedN = cur;
        break;
      }
    }
    if (n == null) {
      var cards = (this.data.roundCards || []).map(function (card) {
        if (card.roundId !== roundId) return card;
        return Object.assign({}, card, { topNInput: String(savedN), topN: savedN });
      });
      this._safeSetData({ roundCards: cards });
      wx.showToast({ title: 'N 必须为不小于 1 的整数', icon: 'none' });
      return false;
    }
    this._preserveRoundInputsExceptId = roundId;
    var savedOk = false;
    try {
      savedOk = this._persistNextDraft(function (draft) {
        draft.rounds = (draft.rounds || []).map(function (r) {
          if (!r || r.roundId !== roundId) return r;
          var next = deepClone(r);
          next.topN = n;
          next.topNUserEdited = true;
          return next;
        });
      }, { keepStep: true });
    } finally {
      this._preserveRoundInputsExceptId = null;
    }
    return savedOk;
  },

  _buildEditRoundPatch: function (round) {
    var patch = {
      name: round.name,
      courseId: round.courseId,
      courseName: round.courseName,
      courseLocation: round.courseLocation,
      courseHalfText: round.courseHalfText,
      front9Course: round.front9Course,
      back9Course: round.back9Course,
      dateTime: round.dateTime,
      gameMode: round.gameMode,
      topN: round.topN,
      topNUserEdited: round.topNUserEdited === true,
      fee: round.fee
    };
    var locks = this._editLocks || {};
    if (locks.name && !locks.name.enabled) delete patch.name;
    if (locks.course && !locks.course.enabled) {
      delete patch.courseId;
      delete patch.courseName;
      delete patch.courseLocation;
      delete patch.courseHalfText;
      delete patch.front9Course;
      delete patch.back9Course;
    }
    if (locks.dateTime && !locks.dateTime.enabled) delete patch.dateTime;
    if (locks.gameMode && !locks.gameMode.enabled) delete patch.gameMode;
    if (locks.topN && !locks.topN.enabled) {
      delete patch.topN;
      delete patch.topNUserEdited;
    }
    if (locks.fee && !locks.fee.enabled) delete patch.fee;
    return patch;
  },

  _resolveEditRoundBaselineGameMode: function (roundId) {
    var series = this._store.getSeriesById(this._editSeriesId);
    var rounds = series && Array.isArray(series.rounds) ? series.rounds : [];
    for (var i = 0; i < rounds.length; i++) {
      if (rounds[i] && String(rounds[i].roundId) === String(roundId)) {
        return String(rounds[i].gameMode || '').trim();
      }
    }
    return '';
  },

  _saveEditRound: function () {
    if (!this._pageAlive || !this._editRoundMode) return;
    if (this._isSaving) return;
    var draft = this.lastSavedDraft;
    var roundId = this._editRoundId;
    if (!draft || !roundId) {
      wx.showToast({ title: '本轮比赛数据异常', icon: 'none' });
      return;
    }
    var round = null;
    var rounds = Array.isArray(draft.rounds) ? draft.rounds : [];
    for (var i = 0; i < rounds.length; i++) {
      if (rounds[i] && String(rounds[i].roundId) === String(roundId)) {
        round = rounds[i];
        break;
      }
    }
    if (!round) {
      wx.showToast({ title: '本轮比赛数据异常', icon: 'none' });
      return;
    }
    var patch = this._buildEditRoundPatch(round);
    var baselineMode = this._resolveEditRoundBaselineGameMode(roundId);
    var nextMode =
      patch.gameMode != null ? String(patch.gameMode || '').trim() : baselineMode;
    var gameModeChanged =
      patch.gameMode != null && nextMode !== baselineMode;
    if (gameModeChanged) {
      var liveSeries = this._store.getSeriesById(this._editSeriesId);
      var liveRound = null;
      var liveRounds =
        liveSeries && Array.isArray(liveSeries.rounds) ? liveSeries.rounds : [];
      for (var ri = 0; ri < liveRounds.length; ri++) {
        if (liveRounds[ri] && String(liveRounds[ri].roundId) === String(roundId)) {
          liveRound = liveRounds[ri];
          break;
        }
      }
      var liveMatch =
        liveRound && liveRound.matchId
          ? teamMatchStore.getMatchById(String(liveRound.matchId))
          : null;
      if (
        liveMatch &&
        seriesRoundUpdate.matchHasGroupingStructure(liveMatch)
      ) {
        var selfConfirm = this;
        wx.showModal({
          title: '修改本轮赛制',
          content: '修改赛制后，本轮现有分组将被清空，需要重新分组。是否继续？',
          confirmText: '继续修改',
          cancelText: '取消',
          success: function (res) {
            if (!selfConfirm._pageAlive) return;
            if (!res || !res.confirm) return;
            selfConfirm._persistEditRound(patch, {
              confirmClearGameModeStructure: true
            });
          }
        });
        return;
      }
    }
    this._persistEditRound(patch, {});
  },

  _persistEditRound: function (patch, options) {
    if (!this._pageAlive || !this._editRoundMode) return;
    if (this._isSaving) return;
    var opts = options || {};
    var self = this;
    this._isSaving = true;
    this._safeSetData({ isSaving: true });
    var result = null;
    try {
      result = this._getRoundUpdateService().updatePublishedSeriesRound({
        seriesId: this._editSeriesId,
        roundId: this._editRoundId,
        patch: patch,
        actor: gameStore.getCurrentUser() || {},
        expectedSeriesUpdatedAt: this._editExpectedSeriesUpdatedAt,
        expectedMatchFingerprint: this._editExpectedMatchFingerprint,
        confirmClearGameModeStructure: !!opts.confirmClearGameModeStructure
      });
    } catch (eSave) {
      result = { ok: false, reason: 'storage_write_failed' };
    } finally {
      this._isSaving = false;
      if (this._pageAlive) this._safeSetData({ isSaving: false });
    }
    if (!this._pageAlive) return;
    if (!result || !result.ok) {
      var reason = (result && result.reason) || 'storage_write_failed';
      var title = '保存失败';
      if (reason === 'station_data_invalid' || reason === 'station_missing') {
        title = '本轮比赛数据异常';
      } else if (reason === 'round_conflict') {
        title = '本轮信息已变化，请重新操作';
      } else if (reason === 'permission_denied') {
        title = '暂无管理权限';
      } else if (reason === 'game_mode_clear_confirm_required') {
        // 领域二次门闩：补弹确认，取消则保留页面编辑态
        wx.showModal({
          title: '修改本轮赛制',
          content:
            (result && result.message) ||
            '修改赛制后，本轮现有分组将被清空，需要重新分组。是否继续？',
          confirmText: '继续修改',
          cancelText: '取消',
          success: function (res) {
            if (!self._pageAlive) return;
            if (!res || !res.confirm) return;
            self._persistEditRound(patch, {
              confirmClearGameModeStructure: true
            });
          }
        });
        return;
      } else if (reason === 'game_mode_blocked') {
        title =
          (result && result.message) ||
          '本轮已开始或已有成绩，暂不可修改赛制';
      } else if (reason === 'fee_invalid') {
        title = '费用格式不正确';
      } else if (reason === 'match_finished') {
        title = '比赛已结束，无法编辑';
      } else if (reason === 'field_locked' && result.rejected && result.rejected[0]) {
        title = result.rejected[0].reason || '部分字段不可编辑';
      }
      wx.showToast({ title: title, icon: 'none' });
      if (reason === 'round_conflict') {
        this._bootstrapEditRound(this._editSeriesId, this._editRoundId);
      }
      return;
    }
    wx.showToast({ title: '本轮已更新', icon: 'success' });
    setTimeout(function () {
      if (!self._pageAlive) return;
      if (typeof wx !== 'undefined' && typeof wx.navigateBack === 'function') {
        wx.navigateBack({ fail: function () {} });
      }
    }, 350);
  },

  onPrevStep() {
    if (this._editRoundMode) return;
    if (this._isSaving || this.data.draftInitError) return;
    if (this._editSeriesMode) {
      var cur = Number(this.data.currentStep) || 5;
      if (cur <= 1) return;
      this._clearNumberEditBuffers();
      this._safeSetData(this._projectUiFromDraft(this.lastSavedDraft, cur - 1));
      return;
    }
    var step = this.data.currentStep;
    if (step <= 1) return;
    var prev = step - 1;
    if (prev === 5) {
      this._enterStep5Ui();
      return;
    }
    // 切换步骤：放弃未提交的数字编辑缓冲
    this._clearNumberEditBuffers();
    this._safeSetData(this._projectUiFromDraft(this.lastSavedDraft, prev));
  },

  _saveEditSeries: function () {
    if (!this._pageAlive || !this._editSeriesMode) return;
    if (this._isSaving) return;
    var draft = this.lastSavedDraft;
    if (!draft) {
      wx.showToast({ title: '系列赛数据异常', icon: 'none' });
      return;
    }
    if (this._isEditingSeriesName()) {
      if (!this._commitSeriesNameInput()) return;
      draft = this.lastSavedDraft;
    }
    if (this._editingAccessCode != null && draft.visibility === 'private') {
      var pendingCode = String(this._editingAccessCode).trim();
      this._editingAccessCode = null;
      if (pendingCode && !basicInfoDraft.isValidAccessCode(pendingCode)) {
        wx.showToast({ title: '访问码须为 6 位数字', icon: 'none' });
        return;
      }
      draft.accessCode = pendingCode || '';
      this.lastSavedDraft = draft;
    }
    if (draft.visibility === 'private' && !basicInfoDraft.isValidAccessCode(draft.accessCode)) {
      wx.showToast({ title: '请输入6位数字访问码', icon: 'none' });
      return;
    }
    var nameCheck = basicInfoDraft.normalizeSeriesNameInput(draft.seriesName);
    if (!nameCheck.ok) {
      wx.showToast({ title: '请填写系列赛名称', icon: 'none' });
      return;
    }
    var patch = {
      seriesName: draft.seriesName,
      seriesSubtitle: draft.seriesSubtitle != null ? String(draft.seriesSubtitle) : '',
      eventInfoList: deepClone(draft.eventInfoList || []),
      partnerConfig: deepClone(draft.partnerConfig),
      bannerImageSnapshot: draft.bannerImageSnapshot != null ? draft.bannerImageSnapshot : '',
      visibility: draft.visibility === 'private' ? 'private' : 'public',
      accessCode: draft.visibility === 'private' ? String(draft.accessCode || '') : ''
    };
    var participantsChanged = this._hasParticipantsHostChanged(draft, this._editSeriesBaseline);
    var actor = gameStore.getCurrentUser() || {};
    var self = this;
    this._isSaving = true;
    this._safeSetData({ isSaving: true });
    var result = null;
    try {
      if (participantsChanged) {
        result = this._getParticipantsUpdateService().updatePublishedSeriesParticipants({
          seriesId: this._editSeriesId,
          hostPatch: {
            organization: draft.organization,
            hostTeam: draft.hostTeam
          },
          participants: draft.participants,
          actor: actor,
          expectedUpdatedAt: this._editExpectedSeriesUpdatedAt
        });
        if (result && result.ok && result.series) {
          this._editExpectedSeriesUpdatedAt = String(result.series.updatedAt || '').trim();
          this._editSeriesBaseline = deepClone(result.series);
          this.lastSavedDraft = Object.assign(deepClone(result.series), {
            seriesName: draft.seriesName,
            seriesSubtitle: draft.seriesSubtitle,
            eventInfoList: deepClone(draft.eventInfoList || []),
            partnerConfig: deepClone(draft.partnerConfig),
            bannerImageSnapshot: draft.bannerImageSnapshot,
            visibility: draft.visibility,
            accessCode: draft.accessCode
          });
          draft = this.lastSavedDraft;
        }
      }
      if (!result || result.ok) {
        result = this._getInfoUpdateService().updatePublishedSeriesInfo({
          seriesId: this._editSeriesId,
          patch: patch,
          actor: actor,
          expectedUpdatedAt: this._editExpectedSeriesUpdatedAt
        });
      }
    } catch (eSave) {
      result = { ok: false, reason: 'storage_write_failed' };
    } finally {
      this._isSaving = false;
      if (this._pageAlive) this._safeSetData({ isSaving: false });
    }
    if (!this._pageAlive) return;
    if (!result || !result.ok) {
      var reason = (result && result.reason) || 'storage_write_failed';
      var title = '保存失败';
      if (reason === 'series_conflict') {
        title = '系列赛信息已变化，请重新操作';
        this._bootstrapEditSeries(this._editSeriesId);
      } else if (reason === 'permission_denied') {
        title = '暂无管理权限';
      } else if (reason === 'field_not_allowed') {
        title = PUBLISHED_STRUCTURE_LOCKED_MSG;
      } else if (reason === 'access_code_invalid') {
        title = '请输入6位数字访问码';
      } else if (reason === 'structure_busy') {
        title = (result && result.message) || PARTICIPANTS_BUSY_MSG;
      } else if (reason === 'roster_block') {
        title = (result && result.message) || ROSTER_BLOCK_MSG;
      } else if (reason === 'host_mode_locked') {
        title = HOST_MODE_LOCKED_MSG;
      } else if (reason === 'organization_required') {
        title = '请选择组织机构';
      } else if (reason === 'host_team_required') {
        title = '请选择主办球队';
      } else if (reason === 'participants_min') {
        title =
          draft.hostMode === 'team' ? '请至少配置 2 个分队' : '请至少选择 2 支参赛球队';
      } else if (
        reason === 'station_data_invalid' ||
        reason === 'station_missing' ||
        reason === 'identity_drift'
      ) {
        title = '系列赛数据异常';
      } else if (reason === 'match_write_failed' || reason === 'match_readback_missing') {
        title = '保存失败，已回滚';
      }
      wx.showToast({ title: title, icon: 'none' });
      return;
    }
    wx.showToast({ title: '系列赛已更新', icon: 'success' });
    setTimeout(function () {
      if (!self._pageAlive) return;
      if (typeof wx !== 'undefined' && typeof wx.navigateBack === 'function') {
        wx.navigateBack({ fail: function () {} });
      }
    }, 350);
  },

  onPrimaryAction() {
    if (this.data.draftInitError) {
      this.onRetryInit();
      return;
    }
    if (this._isSaving || this._isRoundCountConfirming) return;
    if (this._editRoundMode) {
      this._saveEditRound();
      return;
    }
    if (this._editSeriesMode) {
      var editStep = this.data.currentStep;
      if (editStep >= 5) {
        this._saveEditSeries();
        return;
      }
      // 浏览结构步骤：仅前进，不写盘
      this._clearNumberEditBuffers();
      this._safeSetData(this._projectUiFromDraft(this.lastSavedDraft, editStep + 1));
      return;
    }
    var step = this.data.currentStep;
    var draft = this.lastSavedDraft;
    if (!draft) return;

    if (step === 1) {
      if (!draft.hostMode || !seriesModel.HOST_MODE[draft.hostMode]) {
        wx.showToast({ title: '请选择主办场景', icon: 'none' });
        return;
      }
      this._clearNumberEditBuffers();
      this._safeSetData(this._projectUiFromDraft(draft, 2));
      return;
    }

    if (step === 2) {
      if (!draft.templateId || !isTemplateCompatible(draft.hostMode, draft.templateId)) {
        wx.showToast({ title: '请选择系列赛类型', icon: 'none' });
        return;
      }
      if (!participantDraft.isFirstWaveTemplate(draft.hostMode, draft.templateId)) {
        wx.showToast({ title: LATER_TEMPLATE_TOAST, icon: 'none' });
        return;
      }
      this._clearNumberEditBuffers();
      this._safeSetData(this._projectUiFromDraft(draft, 3));
      return;
    }

    if (step === 3) {
      if (!participantDraft.isFirstWaveTemplate(draft.hostMode, draft.templateId)) {
        wx.showToast({ title: LATER_TEMPLATE_TOAST, icon: 'none' });
        this._clearNumberEditBuffers();
        this._safeSetData(this._projectUiFromDraft(draft, 2));
        return;
      }
      var rule = scoringRuleOf(draft);
      if (rule.mode === 'global_m') {
        if (!this._commitGlobalMInput()) return;
        draft = this.lastSavedDraft;
        rule = scoringRuleOf(draft);
        if (parseStrictPositiveInteger(rule.globalM) == null) {
          wx.showToast({ title: GLOBAL_M_INVALID_TOAST, icon: 'none' });
          return;
        }
        this._focusedDefaultTopN = false;
        this._dirtyDefaultTopN = false;
        this._editingDefaultTopNInput = null;
      } else {
        this._focusedGlobalM = false;
        this._dirtyGlobalM = false;
        this._editingGlobalMInput = null;
        if (!this._commitDefaultTopNInput()) return;
        draft = this.lastSavedDraft;
        rule = scoringRuleOf(draft);
        var resolvedN = roundDraft.resolveDefaultTopNForRule(rule);
        if (!resolvedN.ok) {
          wx.showToast({ title: 'N 必须为不小于 1 的整数', icon: 'none' });
          return;
        }
      }
      var check = seriesValidators.validateDraftStructure(draft);
      if (!check.ok) {
        wx.showToast({
          title: (check.errors[0] && check.errors[0].message) || '请完善计分规则',
          icon: 'none'
        });
        return;
      }
      this._clearNumberEditBuffers();
      this._safeSetData(this._projectUiFromDraft(draft, 4));
      return;
    }

    if (step === 4) {
      if (!participantDraft.isFirstWaveTemplate(draft.hostMode, draft.templateId)) {
        wx.showToast({ title: LATER_TEMPLATE_TOAST, icon: 'none' });
        this._clearNumberEditBuffers();
        this._safeSetData(this._projectUiFromDraft(draft, 2));
        return;
      }
      var countTarget = roundDraft.parseStrictRoundCount(this._getRoundCountRawFromBuffer());
      var curRoundLen = (draft.rounds || []).length;
      if (countTarget == null) {
        this._focusedRoundCount = false;
        this._dirtyRoundCount = false;
        this._editingRoundCountInput = null;
        this._safeSetData({
          roundCountInput: String(Math.max(2, curRoundLen || 2))
        });
        wx.showToast({ title: '轮次数须为不小于 2 的整数', icon: 'none' });
        return;
      }
      if (countTarget !== curRoundLen) {
        // 同步应用；成功则同一次操作进入 Step5（减轮确认后亦然）
        this._applyRoundCountInternal({ advanceOnSuccess: true });
        return;
      }
      this._focusedRoundCount = false;
      this._dirtyRoundCount = false;
      this._editingRoundCountInput = null;
      this._enterStep5FromStep4();
      return;
    }

    if (step === 5) {
      if (this._isEditingSeriesName()) {
        if (!this._commitSeriesNameInput()) return;
        draft = this.lastSavedDraft;
      }
      if (this._isEditingGlobalM()) {
        this._focusedGlobalM = false;
        this._dirtyGlobalM = false;
        this._editingGlobalMInput = null;
      }
      var gate5 = basicInfoDraft.canEnterStep6(draft);
      if (!gate5.ok) {
        wx.showToast({ title: gate5.message || '请完善主体与基础信息', icon: 'none' });
        return;
      }
      this._clearNumberEditBuffers();
      this._safeSetData(this._projectUiFromDraft(draft, 6));
      this._syncCreatePublishButtonMode();
      return;
    }

    if (step === 6) {
      this._onStep6CreateOrPublish();
    }
  },

  _hasUnsavedPageBuffers: function () {
    return !!(
      this._isEditingSeriesName() ||
      this._isEditingSeriesSubtitle() ||
      this._isEditingGlobalM() ||
      this._isEditingDefaultTopN() ||
      this._isEditingRoundCount() ||
      this._editingAccessCode != null
    );
  },

  _syncCreatePublishButtonMode: function () {
    if (this._publishNavPending) {
      this._safeSetData({
        createPublishButtonMode: 'view_detail',
        primaryBtnText: seriesPublishAdapter.PLACEHOLDER.VIEW_DETAIL
      });
      return;
    }
    var draft = this.lastSavedDraft;
    if (!draft || !draft.seriesId) {
      this._safeSetData({
        createPublishButtonMode: 'create',
        primaryBtnText: seriesPublishAdapter.PLACEHOLDER.CREATE
      });
      return;
    }
    var insp = seriesPublishMod.inspectPublishState(String(draft.seriesId).trim());
    var decision = seriesPublishAdapter.decidePublishAction(insp);
    var mode = decision.buttonMode || 'create';
    this._safeSetData({
      createPublishButtonMode: mode,
      primaryBtnText: seriesPublishAdapter.resolvePrimaryButtonText(mode, false)
    });
  },

  /**
   * 仅 first_publish 路径调用：提交缓冲并 saveDraft。
   * published / frozen 路径禁止进入本方法。
   */
  _saveDraftForFirstPublishOnly: function () {
    if (this._isEditingSeriesName()) {
      if (this._commitSeriesNameInput() === false) {
        return { ok: false, reason: 'series_name_invalid', message: '请填写有效的系列赛名称' };
      }
    }
    if (this._isEditingSeriesSubtitle()) {
      if (this._commitSeriesSubtitleInput() === false) {
        return { ok: false, reason: 'series_subtitle_invalid', message: '副标题超出字数限制' };
      }
    }
    if (this._editingAccessCode != null) {
      var codeRaw = String(this._editingAccessCode);
      var vis =
        this.lastSavedDraft && this.lastSavedDraft.visibility === 'private'
          ? 'private'
          : 'public';
      if (vis === 'private') {
        var digits = codeRaw.replace(/\D/g, '').slice(0, 6);
        if (!basicInfoDraft.isValidAccessCode(digits)) {
          return {
            ok: false,
            reason: 'access_code_required',
            message: seriesPublishAdapter.TOAST.ACCESS_CODE
          };
        }
        var codeSaved = this._persistNextDraft(
          function (draft) {
            draft.accessCode = digits;
          },
          { keepStep: true }
        );
        if (!codeSaved) {
          return { ok: false, reason: 'draft_save_failed', message: seriesPublishAdapter.TOAST.DRAFT_SAVE_FAILED };
        }
      }
      this._editingAccessCode = null;
    }
    if (!this.lastSavedDraft) {
      return { ok: false, reason: 'series_not_found', message: seriesPublishAdapter.TOAST.SERIES_MISSING };
    }
    var self = this;
    var out = { ok: false, reason: 'draft_save_failed' };
    this._withSaveLock(function () {
      if (!self.lastSavedDraft) return;
      var nextDraft = deepClone(self.lastSavedDraft);
      nextDraft.lifecycleStatus = 'draft';
      var result = self._store.saveDraft(nextDraft);
      if (!result || !result.ok) {
        out = {
          ok: false,
          reason: (result && result.reason) || 'draft_save_failed',
          message: seriesPublishAdapter.TOAST.DRAFT_SAVE_FAILED
        };
        return;
      }
      self.lastSavedDraft = deepClone(result.series);
      out = { ok: true, series: result.series };
    });
    return out;
  },

  _validateBeforeFirstPublish: function (series) {
    var gate = basicInfoDraft.canEnterStep6(series);
    if (!gate.ok) {
      return {
        ok: false,
        code: gate.code || 'step6_gate',
        message: gate.message || '请完善主体与基础信息'
      };
    }
    var pub = seriesValidators.validateForPublish(series);
    if (!pub.ok) {
      var err0 = pub.errors && pub.errors[0];
      var code = err0 && err0.code ? err0.code : 'publish_invalid';
      var msg = err0 && err0.message ? err0.message : seriesPublishAdapter.TOAST.PUBLISH_INVALID;
      if (code === 'access_code_required') {
        msg = seriesPublishAdapter.TOAST.ACCESS_CODE;
      }
      return { ok: false, code: code, message: msg };
    }
    return { ok: true };
  },

  _openSeriesDetailUrl: function (url) {
    var self = this;
    var target = url != null ? String(url).trim() : '';
    if (!target) {
      this._markPublishNavPending('');
      return;
    }
    var onFail = function () {
      self._markPublishNavPending(target);
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: seriesPublishAdapter.TOAST.NAV_FAIL, icon: 'none' });
      }
    };
    var onOk = function () {
      self._publishNavPending = false;
      self._publishDetailUrl = target;
    };
    if (typeof wx === 'undefined') {
      onFail();
      return;
    }
    if (typeof wx.redirectTo === 'function') {
      wx.redirectTo({
        url: target,
        success: onOk,
        fail: function () {
          if (typeof wx.navigateTo === 'function') {
            wx.navigateTo({ url: target, success: onOk, fail: onFail });
          } else {
            onFail();
          }
        }
      });
      return;
    }
    if (typeof wx.navigateTo === 'function') {
      wx.navigateTo({ url: target, success: onOk, fail: onFail });
      return;
    }
    onFail();
  },

  _markPublishNavPending: function (url) {
    this._publishNavPending = true;
    this._publishDetailUrl = url != null ? String(url) : this._publishDetailUrl || '';
    this._isPublishing = false;
    this._safeSetData({
      isSaving: false,
      createPublishButtonMode: 'view_detail',
      primaryBtnText: seriesPublishAdapter.PLACEHOLDER.VIEW_DETAIL
    });
  },

  _onStep6CreateOrPublish: function () {
    var self = this;
    // 发布中只用 _isPublishing；勿置 _isSaving，否则 first_publish 的 saveDraft/_persist 会被锁死
    if (this._isPublishing || this._isSaving) return;
    if (!this.lastSavedDraft || !this.lastSavedDraft.seriesId) {
      wx.showToast({ title: seriesPublishAdapter.TOAST.SERIES_MISSING, icon: 'none' });
      return;
    }

    // 跳转失败后：只重试导航，不发布
    if (
      this._publishNavPending ||
      this.data.createPublishButtonMode === 'view_detail'
    ) {
      var onlyUrl =
        this._publishDetailUrl ||
        seriesPublishAdapter.buildSeriesDetailUrl(this.lastSavedDraft.seriesId);
      this._openSeriesDetailUrl(onlyUrl);
      return;
    }

    var seriesId = String(this.lastSavedDraft.seriesId).trim();
    this._isPublishing = true;
    this._safeSetData({
      isSaving: true,
      primaryBtnText: seriesPublishAdapter.PLACEHOLDER.PUBLISHING
    });

    var outcome = seriesPublishAdapter.runCreatePublish({
      seriesId: seriesId,
      hasUnsavedPageBuffers: this._hasUnsavedPageBuffers(),
      getSeriesById: function (id) {
        return self._store.getSeriesById(id);
      },
      inspectPublishState: function (id) {
        return seriesPublishMod.inspectPublishState(id);
      },
      publishSeries: function (id, opts) {
        return seriesPublishMod.publishSeries(id, opts);
      },
      resumePublish: function (id, opts) {
        return seriesPublishMod.resumePublish(id, opts);
      },
      repairHalfPublished: function (id, opts) {
        return seriesPublishMod.repairHalfPublished(id, opts);
      },
      repairFirstPublishRegistrationDefaultsById: function (id) {
        return seriesPublishMod.repairFirstPublishRegistrationDefaultsById(id);
      },
      saveDraftForFirstPublishOnly: function () {
        return self._saveDraftForFirstPublishOnly();
      },
      validateBeforeFirstPublish: function (series) {
        return self._validateBeforeFirstPublish(series);
      }
    });

    if (outcome.warnToast) {
      wx.showToast({ title: outcome.warnToast, icon: 'none', duration: 2500 });
    }

    if (outcome.ok) {
      if (outcome.series) {
        this.lastSavedDraft = deepClone(outcome.series);
      }
      var detailUrl =
        outcome.detailUrl || seriesPublishAdapter.buildSeriesDetailUrl(seriesId);
      this._publishDetailUrl = detailUrl;
      this._isPublishing = false;
      // 先切到可「查看详情」，再导航；失败则保持该态
      this._safeSetData({
        isSaving: false,
        createPublishButtonMode: 'view_detail',
        primaryBtnText: seriesPublishAdapter.PLACEHOLDER.VIEW_DETAIL
      });
      if (!outcome.warnToast) {
        wx.showToast({ title: seriesPublishAdapter.TOAST.SUCCESS_NAV, icon: 'success', duration: 1200 });
      }
      setTimeout(function () {
        if (!self._pageAlive) return;
        self._openSeriesDetailUrl(detailUrl);
      }, outcome.warnToast ? 400 : 300);
      return;
    }

    this._isPublishing = false;
    var mode =
      (outcome.decision && outcome.decision.buttonMode) ||
      (outcome.phase === 'resume' || outcome.phase === 'repair' ? 'resume' : 'create');
    this._safeSetData({
      isSaving: false,
      createPublishButtonMode: mode,
      primaryBtnText: seriesPublishAdapter.resolvePrimaryButtonText(mode, false)
    });
    wx.showToast({
      title: outcome.message || seriesPublishAdapter.TOAST.GENERIC_FAIL,
      icon: 'none',
      duration: 2800
    });
  },

  onBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.redirectTo({ url: '/pages/home/index' });
    }
  },

  onRetryInit() {
    this._bootstrapDraft({});
  },

  // ---------- Step 5: 组织机构 ----------
  onSelectOrganization() {
    if (!this._assertParticipantsEditable()) return;
    if (this._isSaving || !this.lastSavedDraft) return;
    if (this.data.hostMode !== 'organization') return;
    var self = this;
    var org = this.lastSavedDraft.organization || {};
    var initPayload = {
      organizationId: org.organizationId || '',
      organizationName: org.organizationName || '',
      organizationLogo: org.organizationLogo || '',
      isDefaultInterTeamOrganizer: false,
      organizationType: 'event_org'
    };
    this._pendingOrgSelect = true;
    wx.navigateTo({
      url: '/pages/team/select/index?mode=event_org',
      success: function (res) {
        try {
          if (res && res.eventChannel && res.eventChannel.emit) {
            res.eventChannel.emit('initOrganization', initPayload);
          }
        } catch (e) {
          /* ignore */
        }
      },
      events: {
        organizationSelected: function (payload) {
          if (!self._pendingOrgSelect) return;
          self._pendingOrgSelect = false;
          self._persistNextDraft(
            function (draft) {
              var prevHost = basicInfoDraft.hostDisplayName(draft);
              draft.organization = participantDraft.mapOrganizationPayload(payload);
              var nextHost = basicInfoDraft.hostDisplayName(draft);
              if (draft.partnerConfig) {
                draft.partnerConfig = basicInfoDraft.syncPartnerTitleOnHostRename(
                  draft.partnerConfig,
                  prevHost,
                  nextHost
                );
              }
            },
            { keepStep: true }
          );
        }
      },
      fail: function () {
        self._pendingOrgSelect = false;
        wx.showToast({ title: '页面尚未注册', icon: 'none' });
      }
    });
  },

  // ---------- Step 5: 参赛球队 ----------
  onSelectParticipants() {
    if (!this._assertParticipantsEditable()) return;
    if (this._isSaving || !this.lastSavedDraft) return;
    if (this.data.hostMode !== 'organization') return;
    var self = this;
    var initPayload = participantDraft.buildInitParticipantsPayload(
      this.lastSavedDraft.participants
    );
    this._pendingParticipantsSelect = true;
    wx.navigateTo({
      url: '/pages/team/select/index?mode=inter_team_participants',
      success: function (res) {
        try {
          if (res && res.eventChannel && res.eventChannel.emit) {
            res.eventChannel.emit('initParticipants', initPayload);
          }
        } catch (e) {
          /* ignore */
        }
      },
      events: {
        participantsSelected: function (payload) {
          if (!self._pendingParticipantsSelect) return;
          self._pendingParticipantsSelect = false;
          var list =
            payload && Array.isArray(payload.participants) ? payload.participants : [];
          var mapped = participantDraft.mapTeamParticipantsFromSelect(list);
          if (
            !self._assertRemovedParticipantsHaveNoRoster(
              self.lastSavedDraft && self.lastSavedDraft.participants,
              mapped
            )
          ) {
            return;
          }
          self._persistNextDraft(
            function (draft) {
              draft.participants = mapped;
            },
            { keepStep: true }
          );
        }
      },
      fail: function () {
        self._pendingParticipantsSelect = false;
        wx.showToast({ title: '页面尚未注册', icon: 'none' });
      }
    });
  },

  onRemoveTeamParticipant(e) {
    if (!this._assertParticipantsEditable()) return;
    if (this._isSaving || !this.lastSavedDraft) return;
    var sourceTeamId =
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.sourceTeamId
        : '';
    if (!sourceTeamId) return;
    var pid = 'team:' + String(sourceTeamId).trim();
    if (
      this._editSeriesMode &&
      seriesParticipantsUpdate.hasActiveRosterForParticipant(this.lastSavedDraft, pid)
    ) {
      wx.showToast({ title: ROSTER_BLOCK_MSG, icon: 'none' });
      return;
    }
    this._persistNextDraft(
      function (draft) {
        draft.participants = participantDraft.removeTeamParticipantBySourceId(
          draft.participants,
          sourceTeamId
        );
      },
      { keepStep: true }
    );
  },

  // ---------- Step 5: 主办球队 ----------
  onSelectHostTeam() {
    if (!this._assertParticipantsEditable()) return;
    if (this._isSaving || !this.lastSavedDraft) return;
    if (this.data.hostMode !== 'team') return;
    if (this._isHostTeamSwitchConfirming) return;
    var self = this;
    var currentId = (this.lastSavedDraft.hostTeam && this.lastSavedDraft.hostTeam.teamId) || '';
    this._pendingHostTeamSelect = true;
    wx.navigateTo({
      url: '/pages/team/select/index?selectedId=' + encodeURIComponent(currentId || ''),
      events: {
        teamSelected: function (payload) {
          if (!self._pendingHostTeamSelect) return;
          self._pendingHostTeamSelect = false;
          self._handleHostTeamSelected(payload);
        }
      },
      fail: function () {
        self._pendingHostTeamSelect = false;
        wx.showToast({ title: '页面尚未注册', icon: 'none' });
      }
    });
  },

  _handleHostTeamSelected(payload) {
    if (!this.lastSavedDraft) return;
    var mapped = participantDraft.mapHostTeamPayload(payload);
    if (!mapped.teamId) return;
    var prevId =
      (this.lastSavedDraft.hostTeam && this.lastSavedDraft.hostTeam.teamId) || '';
    var hasDivisions =
      participantDraft.countDivisionParticipants(this.lastSavedDraft.participants) > 0;

    // 同一球队重复选择：不清分队、不弹窗；名称变更时仍联动默认 PARTNER 标题
    if (prevId && prevId === mapped.teamId) {
      this._persistNextDraft(
        function (draft) {
          var prevHost = basicInfoDraft.hostDisplayName(draft);
          draft.hostTeam = mapped;
          var nextHost = basicInfoDraft.hostDisplayName(draft);
          if (draft.partnerConfig) {
            draft.partnerConfig = basicInfoDraft.syncPartnerTitleOnHostRename(
              draft.partnerConfig,
              prevHost,
              nextHost
            );
          }
        },
        { keepStep: true }
      );
      return;
    }

    var self = this;
    var applyChange = function (clearDivisions) {
      if (clearDivisions && self._editSeriesMode) {
        if (
          !self._assertRemovedParticipantsHaveNoRoster(
            self.lastSavedDraft && self.lastSavedDraft.participants,
            []
          )
        ) {
          return;
        }
      }
      self._persistNextDraft(
        function (draft) {
          var prevHost = basicInfoDraft.hostDisplayName(draft);
          var next = participantDraft.applyHostTeamChange(draft, mapped, {
            clearDivisions: !!clearDivisions
          });
          draft.hostTeam = next.hostTeam;
          draft.participants = next.participants;
          if (!clearDivisions) {
            var ensured = participantDraft.ensureDefaultDivisionsIfNeeded(draft);
            draft.participants = ensured.participants;
          } else {
            var afterClear = participantDraft.ensureDefaultDivisionsIfNeeded(draft);
            draft.participants = afterClear.participants;
          }
          var nextHost = basicInfoDraft.hostDisplayName(draft);
          if (draft.partnerConfig) {
            draft.partnerConfig = basicInfoDraft.syncPartnerTitleOnHostRename(
              draft.partnerConfig,
              prevHost,
              nextHost
            );
          }
        },
        { keepStep: true }
      );
    };

    if (!prevId || !hasDivisions) {
      applyChange(false);
      return;
    }

    if (this._editSeriesMode) {
      if (
        !this._assertRemovedParticipantsHaveNoRoster(
          this.lastSavedDraft && this.lastSavedDraft.participants,
          []
        )
      ) {
        return;
      }
    }

    this._isHostTeamSwitchConfirming = true;
    wx.showModal({
      title: '更换主办球队',
      content: '更换主办球队将清空现有分队配置，是否继续？',
      confirmText: '确认更换',
      cancelText: '取消',
      success: function (res) {
        self._isHostTeamSwitchConfirming = false;
        if (res && res.confirm) applyChange(true);
      },
      fail: function () {
        self._isHostTeamSwitchConfirming = false;
      }
    });
  },

  // ---------- Step 5: 分队 ----------
  onAddDivision() {
    if (!this._assertParticipantsEditable()) return;
    if (this._isSaving || !this.lastSavedDraft) return;
    if (this.data.hostMode !== 'team') return;
    if (!participantDraft.hasHostTeam(this.lastSavedDraft)) {
      wx.showToast({ title: '请先选择主办球队', icon: 'none' });
      return;
    }
    this._persistNextDraft(
      function (draft) {
        var added = participantDraft.addDivision(draft.participants, draft.hostTeam);
        if (added.ok) draft.participants = added.participants;
      },
      { keepStep: true }
    );
  },

  onRemoveDivision(e) {
    if (!this._assertParticipantsEditable()) return;
    if (this._isSaving || !this.lastSavedDraft) return;
    var divisionId =
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.divisionId
        : '';
    if (!divisionId) return;
    var pid = 'division:' + String(divisionId).trim();
    if (
      this._editSeriesMode &&
      seriesParticipantsUpdate.hasActiveRosterForParticipant(this.lastSavedDraft, pid)
    ) {
      wx.showToast({ title: ROSTER_BLOCK_MSG, icon: 'none' });
      return;
    }
    this._persistNextDraft(
      function (draft) {
        draft.participants = participantDraft.removeDivision(draft.participants, divisionId);
      },
      { keepStep: true }
    );
  },

  onDivisionNameInput(e) {
    if (this._editSeriesMode && !this._assertParticipantsEditable()) return;
    var divisionId = e.currentTarget.dataset.divisionId;
    var value = e.detail.value;
    var cards = (this.data.divisionCards || []).map(function (card) {
      if (!card || card.divisionId !== divisionId) return card;
      return Object.assign({}, card, { nameInput: value });
    });
    this._safeSetData({ divisionCards: cards });
  },

  onDivisionNameBlur(e) {
    if (this._editSeriesMode && !this._assertParticipantsEditable()) return;
    if (this._isSaving || !this.lastSavedDraft) return;
    var divisionId = e.currentTarget.dataset.divisionId;
    if (!divisionId) return;
    var cards = this.data.divisionCards || [];
    var inputName = '';
    var prevName = '';
    for (var i = 0; i < cards.length; i++) {
      if (cards[i] && cards[i].divisionId === divisionId) {
        inputName = cards[i].nameInput != null ? String(cards[i].nameInput) : '';
        prevName = cards[i].name != null ? String(cards[i].name) : '';
        break;
      }
    }
    var trimmed = inputName.trim();
    if (!trimmed) {
      // 空名称恢复最近成功值
      var restored = (this.data.divisionCards || []).map(function (card) {
        if (!card || card.divisionId !== divisionId) return card;
        return Object.assign({}, card, { nameInput: prevName || card.name });
      });
      this._safeSetData({ divisionCards: restored });
      return;
    }
    if (trimmed === prevName) return;
    this._persistNextDraft(
      function (draft) {
        var updated = participantDraft.updateDivision(draft.participants, divisionId, {
          nameSnapshot: trimmed
        });
        if (updated.ok) draft.participants = updated.participants;
      },
      { keepStep: true }
    );
  },

  onOpenDivisionColorSheet(e) {
    if (!this._assertParticipantsEditable()) return;
    var divisionId = e.currentTarget.dataset.divisionId;
    if (!divisionId) return;
    this._safeSetData({ showColorSheet: true, colorSheetDivisionId: divisionId });
  },

  closeColorSheet() {
    this._safeSetData({ showColorSheet: false, colorSheetDivisionId: '' });
  },

  onPickDivisionColor(e) {
    if (!this._assertParticipantsEditable()) return;
    if (this._isSaving || !this.lastSavedDraft) return;
    var color = e.currentTarget.dataset.color;
    var divisionId = this.data.colorSheetDivisionId;
    if (!color || !divisionId) return;
    var self = this;
    this._persistNextDraft(
      function (draft) {
        var updated = participantDraft.updateDivision(draft.participants, divisionId, {
          colorSnapshot: color
        });
        if (updated.ok) draft.participants = updated.participants;
      },
      {
        keepStep: true,
        onSuccess: function () {
          self.closeColorSheet();
        }
      }
    );
  },

  // ---------- Step5 基础信息：名称 / 副标题 / 可见性 / accessCode ----------
  onSeriesNameFocus() {
    this._focusedSeriesName = true;
    this._dirtySeriesName = true;
    this._editingSeriesNameInput =
      this.data.seriesNameInput != null ? String(this.data.seriesNameInput) : '';
  },

  onSeriesNameInput(e) {
    var value = readInputDetailValue(e);
    this._dirtySeriesName = true;
    this._editingSeriesNameInput = value;
    this._safeSetData({
      seriesNameInput: value,
      seriesNameCount: basicInfoDraft.countInputChars(value)
    });
    return value;
  },

  onSeriesNameBlur(e) {
    var raw =
      e && e.detail && e.detail.value != null
        ? e.detail.value
        : this._editingSeriesNameInput;
    this._commitSeriesNameInput(raw);
  },

  _commitSeriesNameInput(rawOverride) {
    var raw =
      rawOverride != null
        ? rawOverride
        : this._isEditingSeriesName()
          ? this._editingSeriesNameInput
          : this.data.seriesNameInput;
    var text = raw != null ? String(raw) : '';
    var trimmed = text.trim();
    this._focusedSeriesName = false;
    this._dirtySeriesName = false;
    this._editingSeriesNameInput = null;
    // 草稿允许空名称；非空则必须 1～40
    if (trimmed === '') {
      return this._persistNextDraft(
        function (draft) {
          draft.seriesName = '';
        },
        { keepStep: true }
      );
    }
    var check = basicInfoDraft.normalizeSeriesNameInput(trimmed);
    if (!check.ok) {
      var fallback =
        (this.lastSavedDraft && this.lastSavedDraft.seriesName) != null
          ? String(this.lastSavedDraft.seriesName)
          : '';
      this._safeSetData({
        seriesNameInput: fallback,
        seriesNameCount: basicInfoDraft.countInputChars(fallback)
      });
      wx.showToast({ title: '系列赛名称须为 1～40 个字符', icon: 'none' });
      return false;
    }
    return this._persistNextDraft(
      function (draft) {
        draft.seriesName = check.value;
      },
      { keepStep: true }
    );
  },

  onSeriesSubtitleFocus() {
    this._focusedSeriesSubtitle = true;
    this._dirtySeriesSubtitle = true;
    this._editingSeriesSubtitleInput =
      this.data.seriesSubtitleInput != null ? String(this.data.seriesSubtitleInput) : '';
  },

  onSeriesSubtitleInput(e) {
    var value = readInputDetailValue(e).replace(/[\r\n\u2028\u2029]+/g, '');
    this._dirtySeriesSubtitle = true;
    this._editingSeriesSubtitleInput = value;
    this._safeSetData({
      seriesSubtitleInput: value,
      seriesSubtitleCount: basicInfoDraft.countInputChars(value)
    });
    return value;
  },

  onSeriesSubtitleBlur(e) {
    var raw =
      e && e.detail && e.detail.value != null
        ? e.detail.value
        : this._editingSeriesSubtitleInput;
    this._commitSeriesSubtitleInput(raw);
  },

  _commitSeriesSubtitleInput(rawOverride) {
    var raw =
      rawOverride != null
        ? rawOverride
        : this._isEditingSeriesSubtitle()
          ? this._editingSeriesSubtitleInput
          : this.data.seriesSubtitleInput;
    this._focusedSeriesSubtitle = false;
    this._dirtySeriesSubtitle = false;
    this._editingSeriesSubtitleInput = null;
    var check = basicInfoDraft.normalizeSeriesSubtitleInput(raw);
    if (!check.ok) {
      var fallback =
        (this.lastSavedDraft && this.lastSavedDraft.seriesSubtitle) != null
          ? String(this.lastSavedDraft.seriesSubtitle)
          : '';
      this._safeSetData({
        seriesSubtitleInput: fallback,
        seriesSubtitleCount: basicInfoDraft.countInputChars(fallback)
      });
      wx.showToast({
        title: '副标题最多 ' + basicInfoDraft.SERIES_SUBTITLE_MAX + ' 个字符',
        icon: 'none'
      });
      return false;
    }
    return this._persistNextDraft(
      function (draft) {
        draft.seriesSubtitle = check.value;
      },
      { keepStep: true }
    );
  },

  onToggleVisibility() {
    if (this._isSaving || !this.lastSavedDraft) return;
    var cur = this.lastSavedDraft.visibility === 'private' ? 'private' : 'public';
    var next = cur === 'public' ? 'private' : 'public';
    this._persistNextDraft(
      function (draft) {
        var patched = basicInfoDraft.applyVisibilityChange(draft, next);
        draft.visibility = patched.visibility;
        draft.accessCode = patched.accessCode;
      },
      { keepStep: true }
    );
  },

  onAccessCodeFocus() {
    this._editingAccessCode = this.data.accessCodeInput != null ? String(this.data.accessCodeInput) : '';
  },

  onAccessCodeInput(e) {
    var value = readInputDetailValue(e);
    this._editingAccessCode = value;
    return value;
  },

  onAccessCodeBlur(e) {
    if (!this.lastSavedDraft) return;
    if (this.lastSavedDraft.visibility !== 'private') return;
    var raw =
      e && e.detail && e.detail.value != null
        ? e.detail.value
        : this._editingAccessCode != null
          ? this._editingAccessCode
          : this.data.accessCodeInput;
    var code = String(raw == null ? '' : raw).trim();
    this._editingAccessCode = null;
    if (code === '') {
      this._persistNextDraft(
        function (draft) {
          draft.accessCode = '';
        },
        { keepStep: true }
      );
      return;
    }
    if (!basicInfoDraft.isValidAccessCode(code)) {
      var fallback = String(this.lastSavedDraft.accessCode || '');
      this._safeSetData({ accessCodeInput: fallback, accessCode: fallback });
      wx.showToast({ title: '访问码须为 6 位数字', icon: 'none' });
      return;
    }
    this._persistNextDraft(
      function (draft) {
        draft.accessCode = code;
      },
      { keepStep: true }
    );
  },

  onGenerateAccessCode() {
    if (this._isSaving || !this.lastSavedDraft) return;
    if (this.lastSavedDraft.visibility !== 'private') return;
    var code = basicInfoDraft.generateAccessCode();
    this._persistNextDraft(
      function (draft) {
        draft.visibility = 'private';
        draft.accessCode = code;
      },
      { keepStep: true }
    );
  },

  onCopyAccessCode() {
    var code = this.data.accessCode || '';
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: function () {
        wx.showToast({ title: '密码已复制', icon: 'success' });
      }
    });
  },

  // ---------- 赛事信息（对齐队内/队际交互；仅写 Series） ----------
  openAddEventInfoSheet() {
    this._safeSetData({
      showAddEventInfoSheet: true,
      selectedRecommendIndex: null,
      manualInfoType: 'text',
      customEventInfoTitle: '',
      eventTitleAddedMap: basicInfoDraft.buildEventInfoTitleMap(
        (this.lastSavedDraft && this.lastSavedDraft.eventInfoList) || []
      )
    });
  },

  closeAddEventInfoSheet() {
    this._safeSetData({ showAddEventInfoSheet: false });
  },

  selectRecommendInfo(e) {
    var index = Number(e.currentTarget.dataset.index);
    var item = (this.data.recommendedEventInfo || [])[index];
    if (!item) return;
    if (this.data.eventTitleAddedMap && this.data.eventTitleAddedMap[item.title]) {
      wx.showToast({ title: '该赛事信息已添加', icon: 'none' });
      return;
    }
    this._safeSetData({
      selectedRecommendIndex: index,
      customEventInfoTitle: ''
    });
  },

  selectManualInfoType(e) {
    var type = e.currentTarget.dataset.type;
    if (!type) return;
    this._safeSetData({
      manualInfoType: type,
      selectedRecommendIndex: null
    });
  },

  handleCustomEventInfoTitleInput(e) {
    this._safeSetData({
      customEventInfoTitle: e.detail.value,
      selectedRecommendIndex: null
    });
  },

  confirmAddEventInfo() {
    if (!this.lastSavedDraft) return;
    var customTitle = String(this.data.customEventInfoTitle || '').trim();
    var partial = null;
    if (customTitle) {
      partial = {
        title: customTitle,
        type: this.data.manualInfoType === 'image' ? 'image' : 'text'
      };
    } else if (
      this.data.selectedRecommendIndex !== null &&
      this.data.selectedRecommendIndex !== ''
    ) {
      var picked = (this.data.recommendedEventInfo || [])[this.data.selectedRecommendIndex];
      if (picked) {
        partial = { title: picked.title, type: picked.type };
      }
    }
    if (!partial) {
      wx.showToast({ title: '请选择或输入赛事信息项', icon: 'none' });
      return;
    }
    var added = basicInfoDraft.addEventInfoItem(this.lastSavedDraft.eventInfoList, partial);
    if (!added.ok) {
      var msg = '添加失败';
      if (added.reason === 'title_required') msg = '请选择或输入赛事信息项';
      if (added.reason === 'title_duplicate') msg = '该赛事信息已添加';
      if (added.reason === 'temp_media') msg = '禁止使用临时图片路径';
      wx.showToast({ title: msg, icon: 'none' });
      return;
    }
    var self = this;
    this._persistNextDraft(
      function (draft) {
        draft.eventInfoList = added.list;
      },
      {
        keepStep: true,
        onSuccess: function () {
          self.closeAddEventInfoSheet();
        }
      }
    );
  },

  openEventDetailEditor(e) {
    if (this._suppressEventInfoTap) return;
    var id = e.currentTarget.dataset.id;
    if (!id || !this.lastSavedDraft) return;
    var list = this.lastSavedDraft.eventInfoList || [];
    var index = -1;
    var item = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) {
        index = i;
        item = list[i];
        break;
      }
    }
    if (index < 0 || !item) return;
    if (this._deleteConfirmTimer) {
      clearTimeout(this._deleteConfirmTimer);
      this._deleteConfirmTimer = null;
    }
    var photoLive = basicInfoDraft.isPhotoLiveEventTitle(item.title);
    var displayTitle = photoLive ? basicInfoDraft.PHOTO_LIVE_TITLE : item.title;
    var cloned = basicInfoDraft.cloneEventInfoItem(item);
    this._safeSetData({
      showEventDetailSheet: true,
      editingEventInfoIndex: index,
      deleteConfirming: false,
      deleteBtnText: '删除本项',
      eventDetailEditLabel: displayTitle + '（' + this.getInfoTypeLabel(item.type) + '）',
      eventDetailDraft: {
        id: cloned.id,
        title: displayTitle,
        type: cloned.type,
        content: cloned.content || '',
        brightImage: cloned.brightImage || '',
        darkImage: cloned.darkImage || '',
        status: cloned.status || '未设置',
        isPhotoLive: photoLive
      }
    });
  },

  closeEventDetailEditor() {
    if (this._deleteConfirmTimer) {
      clearTimeout(this._deleteConfirmTimer);
      this._deleteConfirmTimer = null;
    }
    this._safeSetData({
      showEventDetailSheet: false,
      deleteConfirming: false,
      deleteBtnText: '删除本项',
      editingEventInfoIndex: -1
    });
  },

  handleEventDetailTextInput(e) {
    this._safeSetData({ 'eventDetailDraft.content': e.detail.value });
  },

  onEventImageUploadLocked() {
    wx.showToast({ title: MEDIA_UPLOAD_LOCKED_TOAST, icon: 'none' });
  },

  saveEventDetail() {
    if (!this.lastSavedDraft) return;
    var draftUi = this.data.eventDetailDraft || {};
    var updated = basicInfoDraft.updateEventInfoItem(this.lastSavedDraft.eventInfoList, draftUi.id, {
      content: draftUi.content,
      title: draftUi.title,
      type: draftUi.type,
      brightImage: draftUi.brightImage,
      darkImage: draftUi.darkImage
    });
    if (!updated.ok) {
      var msg = '保存失败';
      if (updated.reason === 'photo_live_required') msg = '请输入照片直播链接';
      if (updated.reason === 'photo_live_https') msg = '请输入有效的 HTTPS 链接';
      if (updated.reason === 'temp_media') msg = '禁止使用临时图片路径';
      wx.showToast({ title: msg, icon: 'none' });
      return;
    }
    var self = this;
    this._persistNextDraft(
      function (draft) {
        draft.eventInfoList = updated.list;
      },
      {
        keepStep: true,
        onSuccess: function () {
          self.closeEventDetailEditor();
        }
      }
    );
  },

  deleteEventInfo() {
    var idx = this.data.editingEventInfoIndex;
    if (idx < 0 || !this.lastSavedDraft) return;
    var list = this.lastSavedDraft.eventInfoList || [];
    var target = list[idx];
    if (!target || !target.id) return;
    var self = this;
    // 用页面 deleteConfirming 布尔驱动（对齐基准按钮态）
    if (!this.data.deleteConfirming) {
      this._safeSetData({
        deleteConfirming: true,
        deleteBtnText: '再次点击确认删除'
      });
      if (this._deleteConfirmTimer) clearTimeout(this._deleteConfirmTimer);
      this._deleteConfirmTimer = setTimeout(function () {
        self._safeSetData({ deleteConfirming: false, deleteBtnText: '删除本项' });
        self._deleteConfirmTimer = null;
      }, 3000);
      return;
    }
    if (this._deleteConfirmTimer) {
      clearTimeout(this._deleteConfirmTimer);
      this._deleteConfirmTimer = null;
    }
    var removed = basicInfoDraft.removeEventInfoItem(this.lastSavedDraft.eventInfoList, target.id);
    this._persistNextDraft(
      function (draft) {
        draft.eventInfoList = removed.list;
      },
      {
        keepStep: true,
        onSuccess: function () {
          self.closeEventDetailEditor();
        }
      }
    );
  },

  onEventInfoDragStart(e) {
    var index = Number(e.currentTarget.dataset.index);
    var id = e.currentTarget.dataset.id;
    this._eventInfoDragging = {
      index: index,
      id: id,
      y: (this._buildEventInfoDragPositions(this.data.eventInfoList)[index] || 0),
      moved: false
    };
    this._safeSetData({ eventInfoDraggingId: id || '' });
  },

  onEventInfoDragChange(e) {
    if (!this._eventInfoDragging || !e.detail || e.detail.source !== 'touch') return;
    var y = Number(e.detail.y) || 0;
    var startY =
      this._buildEventInfoDragPositions(this.data.eventInfoList)[this._eventInfoDragging.index] ||
      0;
    this._eventInfoDragging.y = y;
    if (Math.abs(y - startY) > 8) {
      this._eventInfoDragging.moved = true;
    }
  },

  onEventInfoDragEnd() {
    var dragging = this._eventInfoDragging;
    if (!dragging || !this.lastSavedDraft) {
      this._eventInfoDragging = null;
      this._safeSetData({ eventInfoDraggingId: '' });
      return;
    }
    var list = (this.lastSavedDraft.eventInfoList || []).slice();
    var fromIndex = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === dragging.id) {
        fromIndex = i;
        break;
      }
    }
    var step = this._getEventInfoRowStepPx();
    var resolved = basicInfoDraft.resolveEventInfoDragReorder({
      fromIndex: fromIndex,
      y: dragging.y || 0,
      stepPx: step,
      moved: dragging.moved,
      listLength: list.length
    });
    this._eventInfoDragging = null;

    if (!resolved.shouldReorder) {
      this._safeSetData(
        Object.assign({ eventInfoDraggingId: '' }, this._buildEventInfoSortUi(list))
      );
      return;
    }

    this._suppressEventInfoTap = true;
    var self = this;
    setTimeout(function () {
      self._suppressEventInfoTap = false;
    }, 180);

    var reordered = basicInfoDraft.reorderEventInfoList(list, fromIndex, resolved.toIndex);
    if (!reordered.ok) {
      this._safeSetData(
        Object.assign({ eventInfoDraggingId: '' }, this._buildEventInfoSortUi(list))
      );
      return;
    }
    this._persistNextDraft(
      function (draft) {
        draft.eventInfoList = reordered.list;
      },
      { keepStep: true }
    );
  },

  // ---------- PARTNER（页内直编，仅写 Series；禁选图） ----------
  onPartnerTitleInput(e) {
    this._safeSetData({ 'partnerConfig.partnerTitle': e.detail.value });
  },

  onPartnerTitleBlur(e) {
    if (!this.lastSavedDraft) return;
    var raw = e && e.detail && e.detail.value != null ? e.detail.value : this.data.partnerConfig.partnerTitle;
    var title = String(raw || '').trim();
    this._persistNextDraft(
      function (draft) {
        if (!draft.partnerConfig || typeof draft.partnerConfig !== 'object') {
          draft.partnerConfig = {
            partnerTitle: '',
            partnerLogos: []
          };
        }
        draft.partnerConfig.partnerTitle =
          title || partnerConfigUtil.buildPartnerTitle(basicInfoDraft.hostDisplayName(draft));
      },
      { keepStep: true }
    );
  },

  _createEmptyPartnerLogo() {
    return { bright: '', dark: '' };
  },

  onAddPartnerLogoSlot() {
    if (!this.lastSavedDraft) return;
    var logos =
      (this.lastSavedDraft.partnerConfig && this.lastSavedDraft.partnerConfig.partnerLogos) || [];
    if (logos.length >= partnerConfigUtil.MAX_PARTNER_LOGOS) {
      wx.showToast({ title: '最多上传 8 张', icon: 'none' });
      return;
    }
    this._persistNextDraft(
      function (draft) {
        if (!draft.partnerConfig) {
          draft.partnerConfig = {
            partnerTitle: partnerConfigUtil.buildPartnerTitle(basicInfoDraft.hostDisplayName(draft)),
            partnerLogos: []
          };
        }
        var next = (draft.partnerConfig.partnerLogos || []).slice();
        next.push({ bright: '', dark: '' });
        draft.partnerConfig.partnerLogos = next;
      },
      { keepStep: true }
    );
  },

  removePartnerLogo(e) {
    var idx = Number(e.currentTarget.dataset.index);
    if (!Number.isFinite(idx) || !this.lastSavedDraft) return;
    this._persistNextDraft(
      function (draft) {
        if (!draft.partnerConfig) return;
        var logos = (draft.partnerConfig.partnerLogos || []).slice();
        if (idx < 0 || idx >= logos.length) return;
        logos.splice(idx, 1);
        draft.partnerConfig.partnerLogos = logos;
      },
      { keepStep: true }
    );
  },

  onPartnerLogoUploadLocked() {
    wx.showToast({ title: MEDIA_UPLOAD_LOCKED_TOAST, icon: 'none' });
  },

  onPartnerLogoError(e) {
    var idx = Number(e.currentTarget.dataset.index);
    var theme = String(e.currentTarget.dataset.theme || '');
    if (!Number.isFinite(idx) || (theme !== 'bright' && theme !== 'dark')) return;
    if (!this.lastSavedDraft || !this.lastSavedDraft.partnerConfig) return;
    var logos = ((this.lastSavedDraft.partnerConfig && this.lastSavedDraft.partnerConfig.partnerLogos) || []).slice();
    var current = logos[idx];
    if (!current) return;
    var normalized =
      typeof current === 'string'
        ? { bright: current, dark: current }
        : Object.assign(this._createEmptyPartnerLogo(), current || {});
    var failedSrc = String(
      normalized[theme] || (theme === 'bright' ? normalized.dark : normalized.bright) || ''
    ).trim();
    var fallback = partnerConfigUtil.getPartnerLogoLocalFallback(failedSrc);
    if (!fallback || fallback === failedSrc) return;
    normalized[theme] = fallback;
    logos[idx] = normalized;
    this._persistNextDraft(
      function (draft) {
        if (!draft.partnerConfig) return;
        draft.partnerConfig.partnerLogos = logos;
      },
      { keepStep: true }
    );
  },

  // Step6：返回指定步骤修改
  onConfirmJumpToStep(e) {
    if (this._editRoundMode) return;
    var step = Number(e.currentTarget.dataset.step);
    if (!Number.isFinite(step) || step < 1 || step > 5) return;
    if (!this.lastSavedDraft) return;
    if (step === 5) {
      this._enterStep5Ui();
      return;
    }
    this._clearNumberEditBuffers();
    this._safeSetData(this._projectUiFromDraft(this.lastSavedDraft, step));
  },

  noop() {}
});

module.exports = {
  parseStrictPositiveInteger: parseStrictPositiveInteger,
  readInputDetailValue: readInputDetailValue,
  createNativeNumberInputSession: createNativeNumberInputSession,
  overlayEditingNumberInputs: overlayEditingNumberInputs,
  overlayRoundCardTransientInputs: overlayRoundCardTransientInputs,
  basicInfoDraft: basicInfoDraft
};
