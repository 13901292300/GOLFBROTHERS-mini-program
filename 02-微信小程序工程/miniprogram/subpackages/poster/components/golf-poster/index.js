const defaultConfig = require("../../../../config");
const {
  POSTER_WIDTH,
  POSTER_HEIGHT,
  EVENT_BRAND_LOGO_PATH,
  MAX_STICKERS,
  PALETTES,
  COLOR_OPTIONS,
  FONT_OPTIONS,
  MARKER_STYLE_KEYS,
  TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  createPosterModel,
  ensureTotalDisplayModel,
  normalizeFontId,
  ensureColorPresets,
  applyMarkerPreset,
  applyPalette,
  resolvePalette,
  paletteLinksActive,
  markersFollowTotal,
  syncLinkedPaletteGroups,
  identityRotation,
  nextIdentityRotation,
  applyIdentityRotation,
  mirrorPosterLayout,
  switchTemplate,
  templateCards,
  SYSTEM_BACKDROPS
} = require("../../utils/poster-data");
const {
  parseScoreInput,
  formatScoreInput,
  calculateTotal
} = require("../../utils/score");
const {
  renderPoster,
  prepareSubjectShadow
} = require("../../utils/poster-engine");
const { getScoreData, applyScoreData } = require("../../utils/score-data");
const { hasPosterMatchDate } = require("../../utils/calendar-date");
const {
  isCustomColorMode,
  setCustomElementColor,
  restorePosterColorState,
  expandUiColorKey
} = require("../../utils/poster-colors");
const {
  savePosterDraft,
  loadPosterDraft,
  clearPosterDraft,
  clonePlain
} = require("../../utils/poster-draft");
const gameStore = require("../../../../utils/gameStore.js");
const socialRelationStore = require("../../../../utils/socialRelationStore.js");
const playerMomentPublishContext = require("../../../../utils/playerMomentPublishContext.js");

const STEP_KEYS = ["template", "photo", "scorecard", "total", "identity", "stickers", "summary"];

const COPY = {
  zh: {
    studio: "海报工作室",
    language: "EN",
    reset: "重置",
    chooseTemplate: "选择海报模板",
    chooseTemplateHint: "点击缩略图可放大查看，单选后进入编辑。",
    previewTemplate: "模板预览",
    useTemplate: "使用此模板",
    next: "下一步",
    back: "上一步",
    confirmChange: "确认修改",
    backToSummary: "返回完成",
    preview: "预览",
    close: "关闭",
    nudgePosition: "微调位置",
    nudgeUp: "上",
    nudgeDown: "下",
    nudgeLeft: "左",
    nudgeRight: "右",
    tapToExpand: "轻点海报放大编辑",
    tapToClose: "拖动元素调整，轻点海报返回步骤",
    stepTitles: ["模板", "照片", "成绩卡", "总成绩", "文字信息", "贴纸", "完成海报"],
    gestureHints: [
      "",
      "画布手势仅调整照片",
      "画布手势仅调整成绩卡",
      "画布手势仅调整总成绩",
      "画布手势仅调整当前文字",
      "画布手势仅调整选中贴纸",
      "完整海报预览"
    ],
    uploadPhoto: "上传照片",
    resetLayout: "复位画布",
    photoScale: "照片大小",
    backgroundBlur: "背景模糊",
    backdrop: "海报背景",
    backdropPhoto: "原图背景",
    backdropSystem: "系统背景",
    backdropNeedSubject: "请先完成人物抠图后再换系统背景",
    subjectDepth: "人物景深",
    waitingPhoto: "等待上传照片",
    segmenting: "马上就好...",
    personReadyCloud: "云端人物图层已生成",
    localModelDownloading: "首次使用正在下载本地模型",
    localModelLoading: "正在加载本地模型",
    localFallbackLoading: "高质量模型不兼容，正在切换兼容模式",
    localInferencing: "正在本地识别人像",
    localRefining: "正在细化人物边缘",
    personReady: "人物图层已生成",
    personReadyLocal: "本地模型人物图层已生成",
    personReadyMediaPipe: "兼容模型人物图层已生成",
    personReadyHd: "高清模型人物图层已生成",
    fullPhotoFallback: "使用完整照片",
    localRealDeviceRequired: "开发者工具不支持端侧推理，请使用真机预览",
    localInferenceUnsupported: "当前微信或设备不支持端侧推理",
    localModelDownloadFailed: "本地模型下载失败，请检查网络和下载域名",
    localModelLoadFailed: "本地模型无法加载，请使用真机或更换兼容模型",
    localModelRunFailed: "本地模型运行失败",
    cloudSegmentFailed: "云端抠图失败",
    localInferenceFailed: "人物识别失败",
    segmentImageTooLarge: "图片过大，请压缩后重试",
    retry: "重新识别",
    palette: "模板配色",
    paletteCustom: "自定义",
    scoreMode: "成绩模式",
    strokes: "总杆",
    relative: "杆差",
    scoringStyle: "记分方式",
    scoreInputStrokes: "逐洞成绩",
    scoreInputRelative: "逐洞杆差",
    scorePlaceholderStrokes: "例如：4 4 5 3，用空格或逗号分隔",
    scorePlaceholderRelative: "例如：-1 0 +1，用空格或逗号分隔",
    scoreReadonlyHint: "成绩来自记分卡，如需修改请返回记分页",
    scoreFromCardHint: "成绩来自记分卡，无需手动输入",
    backToScorePage: "返回修改成绩",
    frontNine: "FRONT",
    backNine: "BACK",
    holePar: "PAR",
    badge: "首洞标记",
    scoreFont: "成绩字体",
    italic: "斜体",
    rotate: "旋转",
    board: "底板",
    rules: "分隔线",
    numbers: "逐洞成绩文字",
    summaryLabel: "九洞分区标题",
    summaryNumber: "九洞合计",
    centerDivider: "左右九洞中缝",
    extremeScore: "老鹰 / 双柏忌数字",
    markerColor: "成绩标记",
    pgaBirdieGroup: "老鹰 / 小鸟",
    pgaBogeyGroup: "柏忌 / 双柏忌",
    birdie: "小鸟",
    eagle: "老鹰及更好",
    bogey: "柏忌",
    doubleBogey: "双柏忌及更差",
    scorecardScale: "成绩卡大小",
    boardOpacity: "底板透明度",
    scorecardBoard: "成绩卡",
    scoreColors: "成绩颜色",
    alignScorecardCenter: "水平居中",
    locked: "已锁定",
    unavailable: "当前底板不可用",
    totalStrokes: "总杆",
    relativeTotal: "杆差",
    relativeTotalColor: "杆差颜色",
    relativeTotalClear: "清空",
    relativeTotalRestore: "恢复",
    relativeTotalHint: "相对于标准杆（",
    relativeTotalHintEnd: "）",
    roundPar: "本轮 / 已完成球洞标准杆合计",
    totalFont: "字体",
    totalColor: "颜色",
    totalOpacity: "透明度",
    totalSize: "字号",
    totalValueLabel: "总杆数值",
    relativeValueLabel: "杆差数值",
    relativeReadonlyHint: "杆差来自成绩卡，不可在此修改",
    totalTabTotal: "总杆",
    totalTabRelative: "杆差",
    totalAbove: "总成绩置于人物上方",
    scorecardLayer: "成绩板图层",
    scorecardAbovePortrait: "人像之上",
    scorecardBelowPortrait: "人像之下",
    mirrorElements: "镜像元素",
    visible: "显示",
    totalEmpty: "成绩卡尚无逐洞成绩",
    totalReadonlyHint: "总杆来自成绩卡，不可在此修改",
    nickname: "昵称",
    nicknameReadonlyHint: "昵称来自记分卡，如需修改请返回记分页",
    course: "球场 / 赛事",
    date: "日期",
    dateMissing: "日期待填",
    dateRequired: "请先填写比赛日期",
    extra: "补充信息",
    textFont: "字体",
    textColor: "文字颜色",
    textSize: "当前文字大小",
    uploadSticker: "上传贴纸",
    stickerSize: "贴纸大小",
    removeSticker: "删除选中贴纸",
    stickerEmpty: "最多上传 5 张透明 PNG 或普通图片",
    freeEdit: "大图自由编辑",
    freeEditHint: "点击元素后直接拖动，下方滑杆调整大小。",
    editTemplate: "修改模板",
    editPhoto: "修改照片",
    editScorecard: "修改成绩卡",
    editTotal: "修改总成绩",
    editIdentity: "修改文字",
    editStickers: "修改贴纸",
    exportPoster: "生成并保存海报",
    sharePoster: "分享海报",
    shareToCircle: "球友圈",
    shareToWechat: "微信好友",
    shareCancel: "取消",
    shareNeedExport: "请先生成海报",
    shareCircleSaved: "已保存到相册，去球友圈发布吧",
    shareCircleAuth: "需要相册权限才能发布到球友圈",
    goSettings: "去设置",
    activeElement: "当前元素",
    elementSize: "元素大小",
    noSelection: "点击海报元素进行选择",
    saving: "正在生成海报",
    saved: "海报已保存到相册",
    saveFailed: "保存失败，请检查相册权限",
    segmentFailed: "人物识别失败，已使用完整照片"
  },
  en: {
    studio: "POSTER STUDIO",
    language: "中文",
    reset: "RESET",
    chooseTemplate: "Choose a poster template",
    chooseTemplateHint: "Tap a thumbnail to inspect it, then continue.",
    previewTemplate: "Template preview",
    useTemplate: "USE TEMPLATE",
    next: "NEXT",
    back: "BACK",
    confirmChange: "CONFIRM",
    backToSummary: "RETURN",
    preview: "PREVIEW",
    close: "CLOSE",
    nudgePosition: "Nudge",
    nudgeUp: "Up",
    nudgeDown: "Down",
    nudgeLeft: "Left",
    nudgeRight: "Right",
    tapToExpand: "Tap the poster to enlarge and edit",
    tapToClose: "Drag to adjust; tap the poster to return",
    stepTitles: ["Template", "Photo", "Scorecard", "Total", "Text", "Stickers", "Complete"],
    gestureHints: [
      "",
      "Canvas gestures adjust only the photo",
      "Canvas gestures adjust only the scorecard",
      "Canvas gestures adjust only the total",
      "Canvas gestures adjust the active text",
      "Canvas gestures adjust the selected sticker",
      "Full poster preview"
    ],
    uploadPhoto: "UPLOAD PHOTO",
    resetLayout: "RESET LAYOUT",
    photoScale: "Photo size",
    backgroundBlur: "Background blur",
    backdrop: "Poster background",
    backdropPhoto: "Photo background",
    backdropSystem: "System background",
    backdropNeedSubject: "Finish subject cutout before using a system background",
    subjectDepth: "Subject depth",
    waitingPhoto: "Waiting for a photo",
    segmenting: "Just a moment...",
    personReadyCloud: "Cloud subject layer is ready",
    localModelDownloading: "Downloading the local model for first use",
    localModelLoading: "Loading the local model",
    localFallbackLoading: "Switching to the compatible on-device model",
    localInferencing: "Detecting the subject on this device",
    localRefining: "Refining subject edges on this device",
    personReady: "Subject layer is ready",
    personReadyLocal: "Local model subject layer is ready",
    personReadyMediaPipe: "Compatible model subject layer is ready",
    personReadyHd: "HD model subject layer is ready",
    fullPhotoFallback: "Using the full photo",
    localRealDeviceRequired: "On-device inference requires real-device preview",
    localInferenceUnsupported: "On-device inference is unavailable on this device",
    localModelDownloadFailed: "Model download failed. Check network and download domains",
    localModelLoadFailed: "The local model could not be loaded on this device",
    localModelRunFailed: "The local model failed during inference",
    cloudSegmentFailed: "Cloud cutout failed",
    localInferenceFailed: "Subject detection failed",
    segmentImageTooLarge: "Photo is too large. Please compress and retry",
    retry: "RETRY",
    palette: "Template palette",
    paletteCustom: "Custom",
    scoreMode: "Score mode",
    strokes: "Strokes",
    relative: "To par",
    scoringStyle: "Scoring style",
    scoreInputStrokes: "Hole scores",
    scoreInputRelative: "Hole-by-hole to par",
    scorePlaceholderStrokes: "Example: 4 4 5 3, separated by spaces",
    scorePlaceholderRelative: "Example: -1 0 +1, separated by spaces",
    scoreReadonlyHint: "Scores come from the scorecard. Go back to edit them there.",
    scoreFromCardHint: "Scores come from the scorecard. No manual input needed.",
    backToScorePage: "Edit scores on card",
    frontNine: "FRONT",
    backNine: "BACK",
    holePar: "PAR",
    badge: "First-hole badge",
    scoreFont: "Score font",
    italic: "Italic",
    rotate: "Rotate",
    board: "Board",
    rules: "Rules",
    numbers: "Hole score text",
    summaryLabel: "Nine-hole labels",
    summaryNumber: "Nine-hole totals",
    centerDivider: "Front/back divider",
    extremeScore: "Eagle / double numerals",
    markerColor: "Score marker",
    pgaBirdieGroup: "Eagle / birdie",
    pgaBogeyGroup: "Bogey / double",
    birdie: "Birdie",
    eagle: "Eagle or better",
    bogey: "Bogey",
    doubleBogey: "Double bogey +",
    scorecardScale: "Scorecard size",
    boardOpacity: "Board opacity",
    scorecardBoard: "Scorecard",
    scoreColors: "Score colors",
    alignScorecardCenter: "Center horizontally",
    locked: "Locked",
    unavailable: "Unavailable on this board",
    totalStrokes: "Total strokes",
    relativeTotal: "To par",
    relativeTotalColor: "To-par color",
    relativeTotalClear: "Clear",
    relativeTotalRestore: "Restore",
    relativeTotalHint: "Relative to par (",
    relativeTotalHintEnd: ")",
    roundPar: "Round / completed-hole par total",
    totalFont: "Font",
    totalColor: "Color",
    totalOpacity: "Opacity",
    totalSize: "Size",
    totalValueLabel: "Total strokes",
    relativeValueLabel: "To par",
    relativeReadonlyHint: "To-par comes from the scorecard and cannot be edited here",
    totalTabTotal: "Total",
    totalTabRelative: "To par",
    totalAbove: "Total above player",
    scorecardLayer: "Scorecard layer",
    scorecardAbovePortrait: "Above portrait",
    scorecardBelowPortrait: "Below portrait",
    mirrorElements: "Mirror elements",
    visible: "Visible",
    totalEmpty: "No hole scores on the scorecard yet",
    totalReadonlyHint: "Total comes from the scorecard and cannot be edited here",
    nickname: "Name",
    nicknameReadonlyHint: "Name comes from the scorecard. Go back to edit it there.",
    course: "Course / event",
    date: "Date",
    dateMissing: "DATE TBD",
    dateRequired: "Add the match date first",
    extra: "Additional info",
    textFont: "Font",
    textColor: "Text color",
    textSize: "Active text size",
    uploadSticker: "UPLOAD STICKER",
    stickerSize: "Sticker size",
    removeSticker: "REMOVE STICKER",
    stickerEmpty: "Upload up to five transparent PNGs or regular images",
    freeEdit: "LARGE PREVIEW EDIT",
    freeEditHint: "Tap and drag an element; use the slider below to resize.",
    editTemplate: "EDIT TEMPLATE",
    editPhoto: "EDIT PHOTO",
    editScorecard: "EDIT SCORECARD",
    editTotal: "EDIT TOTAL",
    editIdentity: "EDIT TEXT",
    editStickers: "EDIT STICKERS",
    exportPoster: "GENERATE & SAVE",
    sharePoster: "Share poster",
    shareToCircle: "Circle",
    shareToWechat: "WeChat",
    shareCancel: "Cancel",
    shareNeedExport: "Generate the poster first",
    shareCircleSaved: "Saved to Photos. Open Circle to post.",
    shareCircleAuth: "Photos access is required to post to Circle",
    goSettings: "SETTINGS",
    activeElement: "Active element",
    elementSize: "Element size",
    noSelection: "Tap a poster element to select it",
    saving: "Generating poster",
    saved: "Poster saved to Photos",
    saveFailed: "Save failed. Check Photos permission.",
    segmentFailed: "Subject detection failed; using the full photo"
  }
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distance(points) {
  if (points.length < 2) return 0;
  const dx = points[1].x - points[0].x;
  const dy = points[1].y - points[0].y;
  return Math.sqrt(dx * dx + dy * dy);
}

function center(points) {
  const total = points.reduce((sum, point) => ({
    x: sum.x + point.x,
    y: sum.y + point.y
  }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
}

function fontIndex(fontId) {
  const index = FONT_OPTIONS.findIndex((font) => font.id === normalizeFontId(fontId));
  return index >= 0 ? index : 0;
}

function formatToParDisplay(diff) {
  if (!Number.isFinite(diff)) return "";
  if (diff > 0) return "+" + diff;
  return String(diff);
}

Component({
  properties: {
    brand: {
      type: String,
      value: "GOLFBROTHERS"
    },
    initialLanguage: {
      type: String,
      value: "zh"
    },
    segmentationEndpoint: {
      type: String,
      value: defaultConfig.segmentationEndpoint
    },
    segmentationMode: {
      type: String,
      value: defaultConfig.segmentationMode
    },
    localSegmentationModel: {
      type: Object,
      value: {}
    },
    segmentationHeaders: {
      type: Object,
      value: defaultConfig.segmentationHeaders
    },
    segmentationQuality: {
      type: String,
      value: defaultConfig.segmentationQuality
    },
    saveToAlbum: {
      type: Boolean,
      value: true
    },
    roundId: {
      type: String,
      value: ""
    }
  },

  data: {
    language: "zh",
    copy: COPY.zh,
    step: 0,
    stepCounter: "01 / 07",
    stepTitle: COPY.zh.stepTitles[0],
    gestureHint: "",
    showWizardFooter: false,
    returnToSummaryMode: false,
    primaryActionLabel: COPY.zh.next,
    primaryActionIcon: "›",
    backActionLabel: COPY.zh.back,
    templates: templateCards("zh"),
    selectedTemplateId: "",
    themeClass: "bright-mode",
    templatePreviewOpen: false,
    largeEdit: false,
    previewCanvasStyle: "",
    activeIdentity: "nickname",
    activeEditTarget: "",
    activeEditLabel: COPY.zh.noSelection,
    activeElementScale: 100,
    activeElementScaleDisabled: true,
    photoStatus: COPY.zh.waitingPhoto,
    segLoading: false,
    fontOptions: FONT_OPTIONS,
    colorOptions: COLOR_OPTIONS,
    totalTab: "total",
    paletteOptions: [],
    backdropOptions: [],
    cardColorOptions: [],
    lineColorOptions: [],
    scoreColorRows: [],
    totalColorOptions: [],
    relativeTotalColorOptions: [],
    textColorOptions: [],
    stickers: [],
    stickerCount: `0 / ${MAX_STICKERS}`,
    relativeTotalCleared: false,
    scoreFontIndex: 0,
    scoreFrontNine: [],
    scoreBackNine: [],
    totalFontIndex: 0,
    relativeFontIndex: 0,
    textFontIndex: 0,
    form: {
      photoScale: 100,
      blur: 0,
      backdropMode: "photo",
      scoreMode: "relative",
      scoringStyle: "pga",
      scoreInput: "",
      badge: "",
      scorecardScale: 100,
      scorecardAbove: true,
      layoutMirrored: false,
      cardOpacity: 88,
      scoreItalic: false,
      roundPar: 72,
      relativeTotal: "",
      relativeTotalColor: "#dc3f4d",
      relativeTotalSize: 200,
      relativeItalic: false,
      totalValue: "",
      totalHint: COPY.zh.totalEmpty,
      totalOpacity: 90,
      totalSize: 500,
      totalItalic: false,
      totalAbove: false,
      nickname: "",
      course: "",
      date: "",
      extra: "",
      identitySize: 38,
      identityItalic: true,
      identityRotated: false,
      identityVisible: true,
      totalVisible: true,
      relativeVisible: true,
      stickerScale: 100
    },
    saving: false,
    exportedImagePath: "",
    showSharePanel: false
  },

  observers: {
    brand(value) {
      if (!this.posterState) return;
      this.posterState.identity.brand = value || "GOLFBROTHERS";
      this._render();
    },

    initialLanguage(value) {
      if (!this.posterState) return;
      this._applyLanguage(value === "en" ? "en" : "zh");
    },

    roundId(roundId) {
      this._applyScoreFromRound(roundId);
      if (this._posterReady && typeof this._syncAllControls === "function") {
        this._syncAllControls();
      }
      if (this._posterReady) this.restoreDraft();
    }
  },

  lifetimes: {
    created() {
      this.posterState = createPosterModel(DEFAULT_TEMPLATE_ID, false, "GOLFBROTHERS");
      this.posterCanvas = null;
      this.posterContext = null;
      this.segmentationCanvas = null;
      this.templateCanvas = null;
      this.templateContext = null;
      this.canvasRect = null;
      this.sceneBounds = {};
      this.gesture = null;
      this.renderPending = false;
      this._renderDirty = false;
      this.returnToSummary = false;
      this.segmentationFailure = null;
      this._posterReady = false;
      this._draftRestoredKey = "";
      this._draftRestoreLock = null;
      this._discardDraft = false;
      this._backdropCache = {};
      this.applyTheme();
    },

    async attached() {
      this.applyTheme();
      const language = this.properties.initialLanguage === "en" ? "en" : "zh";
      this.posterState.identity.brand = this.properties.brand || "GOLFBROTHERS";
      this._posterReady = true;
      this._applyScoreFromRound(this.properties.roundId);
      this._applyLanguage(language);
      this._syncAllControls();
      this.restoreDraft();

      const fonts = [
        { family: "GOLF_Playfair", url: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/PlayfairDisplay-Bold.ttf" },
        { family: "GOLF_Bodoni", url: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/BodoniModa-Bold.ttf" },
        { family: "GOLF_BodoniRegular", url: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/BodoniModa-Regular.ttf" },
        { family: "GOLF_Cormorant", url: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/CormorantGaramond-Bold.ttf" },
        { family: "Anton", url: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/Anton-Regular.ttf" },
        { family: "GOLF_Oswald", url: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/Oswald-Bold.ttf" },
        { family: "GOLF_Paytone", url: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/PaytoneOne-Regular.ttf" },
        { family: "GOLF_Outfit", url: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/Outfit-Black.ttf" },
        { family: "GOLF_Montserrat", url: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/Montserrat-Black.ttf" },
        { family: "Inter", url: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/Inter-Bold.ttf" }
      ];
      for (let i = 0; i < fonts.length; i += 1) {
        const font = fonts[i];
        try {
          const res = await new Promise((resolve, reject) => {
            wx.loadFontFace({
              family: font.family,
              source: 'url("' + font.url + '")',
              global: true,
              scopes: ["webview", "native"],
              success: resolve,
              fail: reject
            });
          });
          console.log("[font] " + font.family + " 加载成功", res && res.status);
        } catch (e) {
          console.error("[font] " + font.family + " 加载失败", e);
        }
      }

      this._render();
    },

    detached() {
      this.saveDraft();
    }
  },

  pageLifetimes: {
    show() {
      this.applyTheme();
    },
    hide() {
      this.saveDraft();
    }
  },

  methods: {
    applyTheme() {
      let theme = "bright";
      try {
        const app = getApp();
        if (app && typeof app.getTheme === "function") theme = app.getTheme() || "bright";
      } catch (e) {
        theme = "bright";
      }
      const themeClass = theme === "dark" ? "dark-mode" : "bright-mode";
      if (this.data.themeClass !== themeClass) this.setData({ themeClass });
    },

    saveDraft() {
      if (this._discardDraft) return false;
      const roundId = String(this.properties.roundId || "").trim();
      if (!roundId || !this.posterState) return false;
      return savePosterDraft({
        roundId,
        step: this.data.step,
        templateId: this.data.selectedTemplateId || this.posterState.templateId || DEFAULT_TEMPLATE_ID,
        photoPath: this.posterState.photoPath || "",
        photoFileID: this.posterState.photoFileID || "",
        subjectPath: this.posterState.subjectPath || "",
        subjectFileID: this.posterState.subjectFileID || "",
        largeEdit: Boolean(this.data.largeEdit),
        posterState: this.posterState,
        updatedAt: Date.now()
      });
    },

    _saveDraft() {
      return this.saveDraft();
    },

    _clearPosterCanvas() {
      const ctx = this.posterContext;
      if (!ctx || typeof ctx.clearRect !== "function") return;
      const width = (this.posterCanvas && this.posterCanvas.width) || POSTER_WIDTH;
      const height = (this.posterCanvas && this.posterCanvas.height) || POSTER_HEIGHT;
      ctx.clearRect(0, 0, width, height);
    },

    clearDraft() {
      this._discardDraft = true;
      this._draftRestoredKey = "";
      this._clearPosterCanvas();
      clearPosterDraft();
      return true;
    },

    _clearDraft() {
      return this.clearDraft();
    },

    hasEdits() {
      return Number(this.data.step) > 0 || Boolean(this.data.selectedTemplateId);
    },

    restoreDraft() {
      if (this._draftRestoreLock) return this._draftRestoreLock;
      const roundId = String(this.properties.roundId || "").trim();
      if (!roundId || !this.posterState) return Promise.resolve(false);
      const draft = loadPosterDraft();
      if (!draft || String(draft.roundId) !== roundId) return Promise.resolve(false);
      const restoreKey = roundId + ":" + (draft.updatedAt || "");
      if (this._draftRestoredKey === restoreKey) return Promise.resolve(true);
      this._draftRestoreLock = this._applyDraft(draft)
        .then((ok) => {
          if (ok) this._draftRestoredKey = restoreKey;
          return ok;
        })
        .finally(() => {
          this._draftRestoreLock = null;
        });
      return this._draftRestoreLock;
    },

    async _applyDraft(draft) {
      const saved = clonePlain(draft.posterState) || {};
      saved.photo = null;
      saved.subject = null;
      saved.badge = "";
      if (Array.isArray(saved.stickers)) {
        saved.stickers = saved.stickers.map((item) => Object.assign({}, item, { image: null }));
      }
      const templateId = draft.templateId || saved.templateId || DEFAULT_TEMPLATE_ID;
      const merged = Object.assign(
        createPosterModel(templateId, false, this.properties.brand),
        saved
      );
      merged.photo = null;
      merged.subject = null;
      merged.backdrop = null;
      merged.subjectShadow = null;
      merged.badge = "";
      merged.photoPath = draft.photoPath || saved.photoPath || "";
      merged.photoFileID = draft.photoFileID || saved.photoFileID || "";
      merged.subjectPath = draft.subjectPath || saved.subjectPath || "";
      merged.subjectFileID = draft.subjectFileID || saved.subjectFileID || "";
      merged.templateId = templateId;
      restorePosterColorState(merged);
      this.posterState = merged;
      this._applyScoreFromRound(this.properties.roundId);

      const step = Number(draft.step);
      const safeStep = Number.isFinite(step) ? Math.max(0, Math.min(6, step)) : 0;
      await new Promise((resolve) => {
        this.setData({
          step: safeStep,
          selectedTemplateId: templateId,
          templatePreviewOpen: false,
          largeEdit: false
        }, resolve);
      });
      this._onStepEntered(safeStep);
      this._updateStepMeta();
      this._syncAllControls();
      if (safeStep <= 0) return true;

      try {
        await this._initPosterCanvas();
      } catch (error) {
        console.warn("[golf-poster] draft canvas init failed", error);
        return true;
      }

      if (this.posterState.photoPath || this.posterState.photoFileID) {
        try {
          let photoPath = this.posterState.photoPath || "";
          if (photoPath) {
            try {
              this.posterState.photo = await this._loadCanvasImage(photoPath);
            } catch (error) {
              console.warn("[golf-poster] draft photoPath missing", error);
              photoPath = "";
            }
          }
          if (!this.posterState.photo && this.posterState.photoFileID) {
            const downloaded = await this._downloadCloudFile(this.posterState.photoFileID);
            photoPath = await this._persistDraftFile(downloaded, "photo");
            this.posterState.photoPath = photoPath;
            this.posterState.photo = await this._loadCanvasImage(photoPath);
          }
          if (!this.posterState.photo) {
            this.posterState.photoPath = "";
            this.posterState.segmentationStatus = "idle";
          }
        } catch (error) {
          console.warn("[golf-poster] draft photo missing", error);
          this.posterState.photoPath = "";
          this.posterState.photo = null;
          this.posterState.segmentationStatus = "idle";
        }
        this._renderNow();
      }

      let subjectPath = this.posterState.subjectPath || "";
      if (!subjectPath && this.posterState.subjectFileID) {
        try {
          const downloaded = await this._downloadCloudFile(this.posterState.subjectFileID);
          subjectPath = await this._persistDraftFile(downloaded, "subject");
          this.posterState.subjectPath = subjectPath;
        } catch (error) {
          console.warn("[golf-poster] draft subject cloud missing", error);
        }
      }
      if (subjectPath) {
        try {
          this.posterState.subject = await this._loadCanvasImage(subjectPath);
          this.posterState.segmentationStatus = "person";
          this._bindSubjectContact(this.posterState.subject);
          this.saveDraft();
        } catch (error) {
          console.warn("[golf-poster] draft subject missing", error);
          this.posterState.subject = null;
          this.posterState.subjectContact = null;
          this.posterState.subjectShadow = null;
          this.posterState.subjectPath = "";
        }
      }

      const stickers = this.posterState.stickers || [];
      const restoredStickers = [];
      for (let i = 0; i < stickers.length; i += 1) {
        const item = stickers[i];
        if (!item || !item.path) continue;
        try {
          const image = await this._loadCanvasImage(item.path);
          restoredStickers.push(Object.assign({}, item, { image }));
        } catch (error) {
          console.warn("[golf-poster] draft sticker missing", error);
        }
      }
      this.posterState.stickers = restoredStickers;
      this._syncStickerControls();

      if (this.posterState.backdropMode === "system") {
        try {
          await this._ensureSystemBackdrop();
        } catch (error) {
          console.warn("[golf-poster] draft backdrop missing", error);
          this.posterState.backdropMode = "photo";
        }
      }

      if (
        !this.posterState.subject
        && this.posterState.photo
        && this.posterState.segmentationStatus === "person"
      ) {
        this.posterState.segmentationStatus = "loading";
        this._runSegmentation(this.posterState.photoPath);
      }

      this._renderNow();
      this._refreshCanvasRect();
      return true;
    },

    /**
     * 按 roundId 从 gameStore 填入成绩；无场次时 getScoreData 会回退 SAMPLE。
     */
    _applyScoreFromRound(roundId) {
      console.log("[golf-poster] _applyScoreFromRound 接收 roundId =", roundId, "typeof =", typeof roundId);
      if (!this.posterState) {
        console.warn("[golf-poster] posterState 不存在，跳过成绩填充");
        return;
      }
      const id = roundId != null ? String(roundId).trim() : "";
      console.log("[golf-poster] 正在获取成绩数据...", { normalizedRoundId: id });
      const scoreData = getScoreData(id);
      try {
        console.log("[golf-poster] getScoreData 返回 scoreData =", JSON.stringify(scoreData));
      } catch (error) {
        console.log("[golf-poster] getScoreData 返回 scoreData =", scoreData);
      }
      applyScoreData(this.posterState, scoreData);
      this._syncDateMissingLabel();
      this.posterState.badge = "";
      const strokes = this.posterState.scoreSets && this.posterState.scoreSets.strokes;
      const identity = this.posterState.identity;
      try {
        console.log("[golf-poster] applyScoreData 后 scoreSets.strokes =", JSON.stringify(strokes));
        console.log("[golf-poster] applyScoreData 后 identity =", JSON.stringify(identity));
      } catch (error) {
        console.log("[golf-poster] applyScoreData 后 scoreSets.strokes =", strokes);
        console.log("[golf-poster] applyScoreData 后 identity =", identity);
      }
    },

    toggleLanguage() {
      this._applyLanguage(this.data.language === "zh" ? "en" : "zh");
    },

    _applyLanguage(language) {
      const copy = COPY[language];
      this.setData({
        language,
        copy,
        templates: templateCards(language),
        stepTitle: copy.stepTitles[this.data.step],
        gestureHint: this._gestureHint(copy, this.data.step, this.data.largeEdit),
        photoStatus: this._photoStatusText(this.posterState.segmentationStatus, copy),
        primaryActionLabel: this.returnToSummary ? copy.confirmChange : copy.next,
        primaryActionIcon: this.returnToSummary ? "✓" : "›",
        backActionLabel: this.returnToSummary ? copy.backToSummary : copy.back
      });
      this._rebuildColorControls(language);
      this._rebuildPaletteOptions(language);
      this._rebuildBackdropOptions(language);
      this._syncDateMissingLabel(copy);
    },

    _syncDateMissingLabel(copyArg) {
      const copy = copyArg || this.data.copy;
      if (this.posterState && this.posterState.identity && this.posterState.identity.date) {
        this.posterState.identity.date.missingLabel = (copy && copy.dateMissing) || "日期待填";
      }
    },

    _gestureHint(copyArg, stepArg, largeEditArg) {
      const copy = copyArg || this.data.copy;
      if (largeEditArg) return copy.tapToClose;
      const stepHint = copy.gestureHints[stepArg] || "";
      return stepHint ? `${stepHint} / ${copy.tapToExpand}` : copy.tapToExpand;
    },

    _photoStatusText(status, copyArg) {
      const copy = copyArg || this.data.copy;
      if (status === "loading") return copy.segmenting;
      if (status === "person") {
        if (this.posterState.segmentationSource === "cloud") return copy.personReadyCloud;
        if (this.posterState.segmentationSource === "hd") return copy.personReadyHd;
        if (this.posterState.segmentationSource === "local") return copy.personReadyLocal;
        if (this.posterState.segmentationSource === "mediapipe") return copy.personReadyMediaPipe;
        return copy.personReady;
      }
      if (status === "fallback") {
        if (this.segmentationFailure) return this._segmentationFailureText(copy);
        return copy.fullPhotoFallback;
      }
      return copy.waitingPhoto;
    },

    _segmentationFailureText(copyArg) {
      const copy = copyArg || this.data.copy;
      const failure = this.segmentationFailure || {};
      const code = failure.code || "LOCAL_INFERENCE_FAILED";
      let label = copy.localInferenceFailed;
      if (code === "IMAGE_TOO_LARGE") label = copy.segmentImageTooLarge || "图片过大，请压缩后重试";
      else if (code === "CONFIG_ERROR" || code === "API_ERROR" || code === "CLOUD_SEGMENT_FAILED") {
        label = copy.cloudSegmentFailed || copy.localInferenceFailed;
      } else if (code === "LOCAL_INFERENCE_REAL_DEVICE_REQUIRED") label = copy.localRealDeviceRequired;
      else if (code === "LOCAL_INFERENCE_UNSUPPORTED" || code === "LOCAL_INFERENCE_UNAVAILABLE") {
        label = copy.localInferenceUnsupported;
      } else if (code.indexOf("MODEL_DOWNLOAD") === 0 || code === "MODEL_URL_EMPTY") {
        label = copy.localModelDownloadFailed;
      } else if (code === "MODEL_LOAD_FAILED") label = copy.localModelLoadFailed;
      else if (code === "MODEL_RUN_FAILED") label = copy.localModelRunFailed;
      return `${label} [${code}]`;
    },

    openTemplatePreview(event) {
      const templateId = event.currentTarget.dataset.id;
      const keepMirror = templateId === "template2" && (
        Boolean(this.data.form.layoutMirrored)
        || Boolean(this.posterState && this.posterState.templateId === "template2" && this.posterState.layoutMirrored)
      );
      this.setData({
        selectedTemplateId: templateId,
        templatePreviewOpen: true,
        "form.layoutMirrored": keepMirror
      }, () => {
        this._initTemplateCanvas(templateId);
      });
    },

    closeTemplatePreview() {
      this.setData({ templatePreviewOpen: false });
      this.templateCanvas = null;
      this.templateContext = null;
    },

    confirmPreviewTemplate() {
      this._activateSelectedTemplate();
    },

    useSelectedTemplate() {
      if (!this.data.selectedTemplateId) {
        wx.showToast({ title: this.data.copy.chooseTemplate, icon: "none" });
        return;
      }
      this._activateSelectedTemplate();
    },

    _activateSelectedTemplate() {
      const templateId = this.data.selectedTemplateId;
      if (!templateId) return;
      const shouldReturnToSummary = this.returnToSummary;
      const hasStarted = this.posterCanvas || this.data.step > 0;
      this.posterState = hasStarted
        ? switchTemplate(this.posterState, templateId, this.properties.brand)
        : createPosterModel(templateId, false, this.properties.brand);
      if (templateId === "template2" && this.data.form.layoutMirrored && !this.posterState.layoutMirrored) {
        mirrorPosterLayout(this.posterState);
      }
      this._applyScoreFromRound(this.properties.roundId);
      this.returnToSummary = false;
      this.setData({
        templatePreviewOpen: false,
        step: shouldReturnToSummary ? 6 : 1
      }, () => {
        this.templateCanvas = null;
        this.templateContext = null;
        this._updateStepMeta();
        this._syncAllControls();
        this._initPosterCanvas().then(() => {
          const waitBackdrop = this.posterState.backdropMode === "system"
            ? this._ensureSystemBackdrop()
            : Promise.resolve();
          return waitBackdrop.then(() => {
            this._renderNow();
            this._refreshCanvasRect();
            this.saveDraft();
          });
        }).catch((error) => {
          console.warn("[golf-poster] activate template backdrop failed", error);
          this._renderNow();
        });
      });
    },

    nextStep() {
      if (this.data.step >= 6) return;
      if (this.returnToSummary) {
        this._returnToSummary();
        return;
      }
      this.setData({ step: this.data.step + 1 }, () => {
        this._onStepEntered(this.data.step);
        this._updateStepMeta();
        this._syncAllControls();
        this._render();
        this._refreshCanvasRect();
        this.saveDraft();
      });
    },

    previousStep() {
      if (this.returnToSummary) {
        this._returnToSummary();
        return;
      }
      if (this.data.step <= 1) {
        this.setData({ step: 0 }, () => {
          this._updateStepMeta();
          this.saveDraft();
        });
        return;
      }
      this.setData({ step: this.data.step - 1 }, () => {
        this._onStepEntered(this.data.step);
        this._updateStepMeta();
        this._syncAllControls();
        this._render();
        this._refreshCanvasRect();
        this.saveDraft();
      });
    },

    _updateStepMeta() {
      const step = this.data.step;
      const summaryEdit = Boolean(this.returnToSummary);
      this.setData({
        stepCounter: `${String(step + 1).padStart(2, "0")} / 07`,
        stepTitle: this.data.copy.stepTitles[step],
        gestureHint: this._gestureHint(this.data.copy, step, this.data.largeEdit),
        showWizardFooter: step > 0 && step < 6,
        returnToSummaryMode: summaryEdit,
        primaryActionLabel: summaryEdit ? this.data.copy.confirmChange : this.data.copy.next,
        primaryActionIcon: summaryEdit ? "✓" : "›",
        backActionLabel: summaryEdit ? this.data.copy.backToSummary : this.data.copy.back
      });
    },

    _returnToSummary() {
      this.returnToSummary = false;
      this.setData({
        step: 6,
        templatePreviewOpen: false
      }, () => {
        this.templateCanvas = null;
        this.templateContext = null;
        this._updateStepMeta();
        this._syncAllControls();
        this._render();
        this._refreshCanvasRect();
      });
    },

    cancelSummaryEdit() {
      this._returnToSummary();
    },

    jumpToStep(event) {
      const target = event.currentTarget.dataset.step;
      if (target === "template") {
        this.returnToSummary = true;
        this.setData({ step: 0 }, () => this._updateStepMeta());
        return;
      }
      const index = STEP_KEYS.indexOf(target);
      if (index < 1) return;
      this.returnToSummary = true;
      this.setData({ step: index }, () => {
        this._onStepEntered(index);
        this._updateStepMeta();
        this._syncAllControls();
        this._render();
        this._refreshCanvasRect();
      });
    },

    _onStepEntered(step) {
      if (step === 5) this._enterStickerStep();
    },

    _ensureStickerSelection() {
      const stickers = this.posterState.stickers || [];
      const currentId = this.posterState.selectedStickerId;
      const valid = currentId && stickers.some((item) => item.id === currentId);
      if (!stickers.length) {
        this.posterState.selectedStickerId = "";
        return "";
      }
      if (!valid) this.posterState.selectedStickerId = stickers[stickers.length - 1].id;
      return "sticker:" + this.posterState.selectedStickerId;
    },

    _enterStickerStep() {
      const target = this._ensureStickerSelection();
      this.setData({
        largeEdit: false,
        previewCanvasStyle: "",
        activeEditTarget: target,
        activeElementScaleDisabled: !target
      }, () => {
        this._syncStickerControls();
        this._refreshCanvasRect();
        this._renderNow();
      });
    },

    openLargeEdit() {
      const onStickers = Number(this.data.step) === 5;
      const stepTarget = onStickers
        ? this._ensureStickerSelection()
        : this._gestureTarget();
      const fallback = onStickers
        ? ""
        : (this.posterState.total.value ? "total" : "scorecard");
      this.setData({
        largeEdit: true,
        activeEditTarget: stepTarget || fallback
      }, () => {
        this._updateStepMeta();
        this._syncLargeEdit();
        const afterLayout = () => {
          this._fitPreviewCanvas();
        };
        if (typeof wx.nextTick === "function") wx.nextTick(afterLayout);
        else setTimeout(afterLayout, 16);
      });
    },

    closeLargeEdit() {
      const stickerTarget = Number(this.data.step) === 5
        ? this._ensureStickerSelection()
        : "";
      this.setData({
        largeEdit: false,
        previewCanvasStyle: "",
        activeEditTarget: stickerTarget,
        activeElementScaleDisabled: !stickerTarget
      }, () => {
        this._updateStepMeta();
        const afterLayout = () => {
          this._refreshCanvasRect();
          this._renderNow();
        };
        if (typeof wx.nextTick === "function") wx.nextTick(afterLayout);
        else setTimeout(afterLayout, 16);
      });
    },

    _fitPreviewCanvas() {
      if (!this.data.largeEdit) return;
      this.createSelectorQuery()
        .in(this)
        .select(".canvas-frame-slot")
        .boundingClientRect((rect) => {
          if (!rect || !rect.width || !rect.height) {
            this._refreshCanvasRect();
            this._renderNow();
            return;
          }
          const ratio = POSTER_WIDTH / POSTER_HEIGHT;
          let width = rect.width;
          let height = width / ratio;
          if (height > rect.height) {
            height = rect.height;
            width = height * ratio;
          }
          this.setData({
            previewCanvasStyle: "width:" + Math.floor(width) + "px;height:" + Math.floor(height) + "px;"
          }, () => {
            this._refreshCanvasRect();
            this._renderNow();
          });
        })
        .exec();
    },

    _nudgeOffset(dir) {
      const step = 6;
      if (dir === "left") return { dx: -step, dy: 0 };
      if (dir === "right") return { dx: step, dy: 0 };
      if (dir === "up") return { dx: 0, dy: -step };
      if (dir === "down") return { dx: 0, dy: step };
      return { dx: 0, dy: 0 };
    },

    _prepareTextNudge(target) {
      const patch = { activeEditTarget: target };
      if (["nickname", "course", "date", "extra"].indexOf(target) >= 0) {
        patch.activeIdentity = target;
      }
      if (target === "total" || target === "relativeTotal") {
        patch.totalTab = target === "relativeTotal" ? "relative" : "total";
      }
      return patch;
    },

    openTextNudge(event) {
      const target = event.currentTarget.dataset.target;
      if (!target) return;
      const patch = this._prepareTextNudge(target);
      this.setData(Object.assign({ largeEdit: true }, patch), () => {
        this._updateStepMeta();
        this._syncLargeEdit();
        const afterLayout = () => {
          this._fitPreviewCanvas();
        };
        if (typeof wx.nextTick === "function") wx.nextTick(afterLayout);
        else setTimeout(afterLayout, 16);
      });
    },

    onPreviewNudge(event) {
      const dir = event.currentTarget.dataset.dir;
      const target = this.data.activeEditTarget;
      if (!dir || !target) return;
      const offset = this._nudgeOffset(dir);
      this._moveTarget(target, offset.dx, offset.dy);
      this._render();
    },

    resetPoster() {
      wx.showModal({
        title: this.data.copy.reset,
        content: this.data.language === "en"
          ? "Reset the poster and return to template selection?"
          : "清空当前海报并返回模板选择？",
        success: (result) => {
          if (!result.confirm) return;
          this._clearPosterCanvas();
          clearPosterDraft();
          this._draftRestoredKey = "";
          this.posterState = createPosterModel(DEFAULT_TEMPLATE_ID, false, this.properties.brand);
          this._applyScoreFromRound(this.properties.roundId);
          this.posterCanvas = null;
          this.posterContext = null;
          this.segmentationCanvas = null;
          this.sceneBounds = {};
          this.returnToSummary = false;
          this.setData({
            step: 0,
            selectedTemplateId: "",
            templatePreviewOpen: false,
            largeEdit: false
          }, () => {
            this._updateStepMeta();
            this._syncAllControls();
          });
        }
      });
    },

    choosePhoto() {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        sizeType: ["original"],
        success: (result) => {
          const file = result.tempFiles && result.tempFiles[0];
          const tempFilePath = file && file.tempFilePath;
          console.log("[poster] chooseMedia 成功:", tempFilePath, file && file.size);
          if (tempFilePath) this._loadPhoto(tempFilePath);
          else console.error("[poster] chooseMedia 无 tempFilePath", result);
        },
        fail: (err) => {
          console.error("[poster] chooseMedia 失败:", err);
        }
      });
    },

    async _loadPhoto(filePath) {
      try {
        this._clearPosterCanvas();
        if (this.posterState.photo) {
          this.posterState.photo = null;
        }
        if (this.posterState.subject) {
          this.posterState.subject = null;
        }
        this.posterState.subjectContact = null;
        this.posterState.subjectShadow = null;
        this.posterState.photoPath = "";
        this.posterState.photoFileID = "";
        this.posterState.subjectPath = "";
        this.posterState.subjectFileID = "";
        this.posterState.segmentationStatus = "loading";
        this.posterState.segmentationSource = "none";
        this.segmentationFailure = null;
        this.posterState.image.scale = 1;
        this.posterState.image.x = 0;
        this.posterState.image.y = 0;
        this.setData({
          photoStatus: this.data.copy.segmenting,
          "form.photoScale": 100,
          segLoading: true
        });
        this._render();

        if (!this.posterCanvas) {
          await this._initPosterCanvas();
        }
        const canvas = this.posterCanvas;
        if (!canvas || typeof canvas.createImage !== "function") {
          throw new Error("Poster canvas is not initialized");
        }

        let persistedPhoto = this._localFilePath(filePath);
        try {
          persistedPhoto = this._localFilePath(await this._persistDraftFile(filePath, "photo"));
        } catch (error) {
          console.warn("[golf-poster] persist photo failed", error);
        }
        const uploadPath = persistedPhoto || this._localFilePath(filePath);
        console.log("[poster] _loadPhoto 本地路径:", {
          original: filePath,
          persistedPhoto: persistedPhoto,
          uploadPath: uploadPath
        });

        await new Promise((resolve, reject) => {
          const image = canvas.createImage();
          image.onload = () => {
            this.posterState.photo = image;
            this.posterState.photoPath = uploadPath;
            this.renderPending = false;
            console.log("[poster] Canvas 图片加载成功:", uploadPath);
            this._renderNow();
            resolve(image);
          };
          image.onerror = (error) => {
            console.error("[poster] Canvas 图片加载失败:", uploadPath, error);
            reject(error || new Error("load image failed"));
          };
          image.src = uploadPath;
        });

        this.triggerEvent("segmentationstart", { filePath: uploadPath });
        await this._runSegmentation(uploadPath);
        this.saveDraft();
      } catch (error) {
        console.error("[poster] _loadPhoto 失败:", error);
        this.setData({ segLoading: false });
        wx.showToast({ title: this.data.copy.segmentFailed, icon: "none" });
      }
    },

    _localFilePath(filePath) {
      return String(filePath || "").split("?")[0];
    },

    _persistDraftFile(srcPath, kind) {
      const source = this._localFilePath(srcPath);
      if (!source) return Promise.reject(new Error("empty draft file"));
      const roundId = String(this.properties.roundId || "draft").replace(/[^\w-]/g, "_");
      const ext = kind === "subject" ? ".png" : ".jpg";
      const destPath = wx.env.USER_DATA_PATH + "/poster_" + kind + "_" + roundId + "_" + Date.now() + ext;
      const fs = wx.getFileSystemManager();
      return new Promise((resolve, reject) => {
        const copy = () => {
          fs.copyFile({
            srcPath: source,
            destPath: destPath,
            success: () => resolve(destPath),
            fail: (error) => {
              if (typeof wx.saveFile === "function") {
                wx.saveFile({
                  tempFilePath: source,
                  success: (res) => resolve(res.savedFilePath || destPath),
                  fail: reject
                });
                return;
              }
              reject(error);
            }
          });
        };
        fs.access({
          path: destPath,
          success: () => {
            fs.unlink({
              filePath: destPath,
              complete: copy
            });
          },
          fail: copy
        });
      });
    },

    _readFileBase64(filePath) {
      const localPath = this._localFilePath(filePath);
      return new Promise((resolve, reject) => {
        wx.getFileSystemManager().readFile({
          filePath: localPath,
          encoding: "base64",
          success: (result) => resolve(result.data),
          fail: reject
        });
      });
    },

    _compressImage(filePath, quality, maxEdge) {
      const srcPath = this._localFilePath(filePath);
      const q = Number.isFinite(Number(quality))
        ? Math.max(1, Math.min(100, Number(quality)))
        : 80;
      const edge = Number(maxEdge);
      return new Promise((resolve) => {
        if (typeof wx.compressImage !== "function") {
          console.warn("[poster] wx.compressImage 不可用，使用原图");
          resolve(srcPath);
          return;
        }

        const runCompress = function (compressedWidth, compressedHeight) {
          const options = {
            src: srcPath,
            quality: q,
            success: (res) => {
              console.log("[poster] 图片压缩成功:", res.tempFilePath, {
                quality: q,
                compressedWidth: compressedWidth,
                compressedHeight: compressedHeight
              });
              resolve(res.tempFilePath || srcPath);
            },
            fail: (err) => {
              console.warn("[poster] 图片压缩失败，使用原图:", err);
              resolve(srcPath);
            }
          };
          if (compressedWidth > 0 && compressedHeight > 0) {
            options.compressedWidth = compressedWidth;
            options.compressedHeight = compressedHeight;
          }
          wx.compressImage(options);
        };

        if (!Number.isFinite(edge) || edge <= 0) {
          runCompress(0, 0);
          return;
        }

        wx.getImageInfo({
          src: srcPath,
          success: (info) => {
            const width = Number(info.width) || 0;
            const height = Number(info.height) || 0;
            if (!width || !height) {
              console.warn("[poster] 图片尺寸无效，使用原图");
              resolve(srcPath);
              return;
            }
            let compressedWidth = width;
            let compressedHeight = height;
            const longEdge = Math.max(width, height);
            if (longEdge > edge) {
              if (width >= height) {
                compressedWidth = edge;
                compressedHeight = Math.max(1, Math.round(height * (edge / width)));
              } else {
                compressedHeight = edge;
                compressedWidth = Math.max(1, Math.round(width * (edge / height)));
              }
            }
            console.log("[poster] 压缩尺寸:", {
              from: width + "x" + height,
              to: compressedWidth + "x" + compressedHeight
            });
            runCompress(compressedWidth, compressedHeight);
          },
          fail: (err) => {
            console.warn("[poster] 获取图片信息失败，使用原图:", err);
            resolve(srcPath);
          }
        });
      });
    },

    _fileSize(filePath) {
      const localPath = this._localFilePath(filePath);
      return new Promise((resolve) => {
        if (!localPath || typeof wx.getFileInfo !== "function") {
          resolve(0);
          return;
        }
        wx.getFileInfo({
          filePath: localPath,
          success: (res) => resolve(Number(res.size) || 0),
          fail: () => resolve(0)
        });
      });
    },

    async _prepareCloudImageFile(filePath) {
      // 云函数 / 腾讯云抠图上限 5MB；长边对齐海报 2x 导出（约 2000px），避免 480px 再被拉大发糊
      const maxBytes = 3.5 * 1024 * 1024;
      const steps = [
        { quality: 92, maxEdge: 2048 },
        { quality: 86, maxEdge: 1600 },
        { quality: 80, maxEdge: 1280 }
      ];
      let currentPath = this._localFilePath(filePath);
      console.log("[poster] 开始压缩上传文件:", currentPath);
      const firstSize = await this._fileSize(currentPath);
      if (firstSize > 0 && firstSize <= maxBytes) {
        const keepOriginal = await new Promise((resolve) => {
          wx.getImageInfo({
            src: currentPath,
            success: (info) => {
              const longEdge = Math.max(Number(info.width) || 0, Number(info.height) || 0);
              resolve(longEdge > 0 && longEdge <= 2048);
            },
            fail: () => resolve(false)
          });
        });
        if (keepOriginal) {
          console.log("[poster] 原图已满足上传尺寸，跳过压缩", firstSize);
          return currentPath;
        }
      }
      for (let i = 0; i < steps.length; i += 1) {
        currentPath = await this._compressImage(currentPath, steps[i].quality, steps[i].maxEdge);
        const size = await this._fileSize(currentPath);
        console.log("[poster] 压缩后文件大小:", size, steps[i]);
        if (size > 0 && size <= maxBytes) return currentPath;
      }
      const error = new Error("图片太大，请选择较小的图片");
      error.code = "IMAGE_TOO_LARGE";
      throw error;
    },

    _ensureCloud() {
      const app = getApp();
      if (app && typeof app.ensureCloud === "function") {
        if (app.ensureCloud()) return;
        const error = new Error("云开发未初始化，请确认已开通云开发并关联环境");
        error.code = "CLOUD_NOT_READY";
        throw error;
      }
      if (!wx.cloud) {
        const error = new Error("当前基础库不支持云开发");
        error.code = "CLOUD_UNAVAILABLE";
        throw error;
      }
    },

    _uploadCloudFile(filePath) {
      const localPath = this._localFilePath(filePath);
      const cloudPath = "poster/seg_" + Date.now() + ".jpg";
      console.log("[poster] 准备上传云存储:", { filePath: localPath, cloudPath: cloudPath });
      if (!localPath) {
        return Promise.reject(new Error("upload filePath empty"));
      }
      return new Promise((resolve, reject) => {
        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: localPath,
          success: (res) => {
            console.log("[poster] 云存储上传成功:", res.fileID);
            resolve(res.fileID);
          },
          fail: (err) => {
            console.error("[poster] 云存储上传失败:", err);
            reject(err);
          }
        });
      });
    },

    _downloadCloudFile(fileID) {
      return new Promise((resolve, reject) => {
        wx.cloud.downloadFile({
          fileID: fileID,
          success: (res) => {
            console.log("[poster] 抠图结果下载成功:", res.tempFilePath);
            resolve(res.tempFilePath);
          },
          fail: (err) => {
            console.error("[poster] 抠图结果下载失败:", err);
            reject(err);
          }
        });
      });
    },

    async _callSegmentCloud(localFilePath) {
      this._ensureCloud();
      const fileID = await this._uploadCloudFile(localFilePath);
      const res = await wx.cloud.callFunction({
        name: "segmentPortrait",
        data: { fileID: fileID }
      });
      const payload = (res && res.result) || {};
      if (payload.code !== "SUCCESS" || !payload.resultFileID) {
        const error = new Error(payload.message || "抠图失败");
        error.code = payload.code || "CLOUD_SEGMENT_FAILED";
        throw error;
      }
      return {
        tempPath: await this._downloadCloudFile(payload.resultFileID),
        fileID: payload.resultFileID,
        photoFileID: fileID
      };
    },

    async _uploadAndSegment(filePath) {
      const compressedPath = await this._prepareCloudImageFile(filePath);
      return this._callSegmentCloud(compressedPath);
    },

    _base64ToTempFile(base64Data) {
      return new Promise((resolve, reject) => {
        const payload = String(base64Data || "").replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, "");
        const tempPath = wx.env.USER_DATA_PATH + "/seg_" + Date.now() + ".png";
        wx.getFileSystemManager().writeFile({
          filePath: tempPath,
          data: payload,
          encoding: "base64",
          success: () => resolve(tempPath),
          fail: reject
        });
      });
    },

    async _runSegmentation(filePath) {
      const localPath = this._localFilePath(filePath);
      console.log("[poster] 开始云端抠图:", localPath);
      this.setData({
        segLoading: true,
        photoStatus: this.data.copy.segmenting
      });
      try {
        const result = await this._uploadAndSegment(localPath);
        let cutoutPath = result.tempPath;
        try {
          cutoutPath = await this._persistDraftFile(result.tempPath, "subject");
        } catch (error) {
          console.warn("[golf-poster] persist subject failed", error);
        }
        this.segmentationFailure = null;
        this.posterState.subject = await this._loadCanvasImage(cutoutPath);
        this.posterState.subjectPath = cutoutPath;
        this.posterState.subjectFileID = result.fileID || "";
        this.posterState.photoFileID = result.photoFileID || this.posterState.photoFileID || "";
        this.posterState.segmentationStatus = "person";
        this.posterState.segmentationSource = "cloud";
        this._bindSubjectContact(this.posterState.subject);
        this.saveDraft();
      } catch (error) {
        this.segmentationFailure = {
          code: error.code || "CLOUD_SEGMENT_FAILED",
          message: error.message || error.errMsg || String(error),
          detail: ""
        };
        console.warn("[poster] 云端抠图失败:", this.segmentationFailure);
        this.posterState.subject = null;
        this.posterState.subjectContact = null;
        this.posterState.subjectShadow = null;
        this.posterState.segmentationStatus = "fallback";
        this.posterState.segmentationSource = "none";
        wx.showToast({ title: this.data.copy.fullPhotoFallback, icon: "none" });
      }
      this.setData({
        segLoading: false,
        photoStatus: this._photoStatusText(this.posterState.segmentationStatus)
      });
      this.triggerEvent("segmentationend", {
        status: this.posterState.segmentationStatus,
        source: this.posterState.segmentationSource,
        error: this.segmentationFailure
      });
      this._render();
    },

    retrySegmentation() {
      if (!this.posterState.photoPath) {
        this.choosePhoto();
        return;
      }
      this.posterState.segmentationStatus = "loading";
      this.posterState.segmentationSource = "none";
      this.segmentationFailure = null;
      this.setData({ photoStatus: this.data.copy.segmenting, segLoading: true });
      this._runSegmentation(this.posterState.photoPath);
    },

    async applySubjectCutout(filePath, hasPerson) {
      if (!hasPerson || !filePath) {
        this.segmentationFailure = null;
        this.posterState.subject = null;
        this.posterState.subjectContact = null;
        this.posterState.subjectShadow = null;
        this.posterState.segmentationStatus = "fallback";
        this.posterState.segmentationSource = "none";
      } else {
        this.segmentationFailure = null;
        this.posterState.subject = await this._loadCanvasImage(filePath);
        this._bindSubjectContact(this.posterState.subject);
        try {
          this.posterState.subjectPath = await this._persistDraftFile(filePath, "subject");
        } catch (error) {
          this.posterState.subjectPath = filePath;
        }
        this.posterState.segmentationStatus = "person";
        this.posterState.segmentationSource = "hd";
        this.saveDraft();
      }
      this.setData({
        photoStatus: this._photoStatusText(this.posterState.segmentationStatus)
      });
      this._render();
    },

    resetLayout() {
      const defaults = createPosterModel(this.posterState.templateId, false, this.properties.brand);
      this.posterState.image = Object.assign({}, defaults.image);
      this.posterState.scorecard.x = defaults.scorecard.x;
      this.posterState.scorecard.y = defaults.scorecard.y;
      this.posterState.scorecard.scale = 1;
      this.posterState.total.x = defaults.total.x;
      this.posterState.total.y = defaults.total.y;
      if (this.posterState.relativeTotal && defaults.relativeTotal) {
        this.posterState.relativeTotal.x = defaults.relativeTotal.x;
        this.posterState.relativeTotal.y = defaults.relativeTotal.y;
      }
      ["nickname", "course", "date", "extra"].forEach((key) => {
        this.posterState.identity[key].x = defaults.identity[key].x;
        this.posterState.identity[key].y = defaults.identity[key].y;
        this.posterState.identity[key].rotation = defaults.identity[key].rotation;
        this.posterState.identity[key].rotated = defaults.identity[key].rotated;
      });
      this.posterState.layoutMirrored = false;
      this.posterState.stickers.forEach((sticker, index) => {
        sticker.x = 500 + (index % 3 - 1) * 90;
        sticker.y = 630 + index % 2 * 90;
        sticker.scale = 1;
      });
      this._syncAllControls();
      this._render();
    },

    onPhotoScale(event) {
      this.posterState.image.scale = Number(event.detail.value) / 100;
      this.setData({ "form.photoScale": Number(event.detail.value) });
      this._render();
    },

    onBlurChange(event) {
      this.posterState.image.blur = Number(event.detail.value);
      this.setData({ "form.blur": Number(event.detail.value) });
      this._render();
    },

    _rebuildBackdropOptions(languageArg) {
      const language = languageArg || this.data.language;
      const activeId = this.posterState.backdropId || SYSTEM_BACKDROPS[0].id;
      this.setData({
        backdropOptions: SYSTEM_BACKDROPS.map((item) => ({
          id: item.id,
          path: item.path,
          name: language === "en" ? item.en : item.zh,
          active: item.id === activeId
        }))
      });
    },

    async _ensureSystemBackdrop() {
      const id = this.posterState.backdropId || SYSTEM_BACKDROPS[0].id;
      const spec = SYSTEM_BACKDROPS.find((item) => item.id === id) || SYSTEM_BACKDROPS[0];
      this.posterState.backdropId = spec.id;
      this._backdropCache = this._backdropCache || {};
      if (this._backdropCache[spec.id]) {
        this.posterState.backdrop = this._backdropCache[spec.id];
        return;
      }
      const image = await this._loadCanvasImage(spec.path);
      this._backdropCache[spec.id] = image;
      this.posterState.backdrop = image;
    },

    selectBackdropMode(event) {
      const mode = event.currentTarget.dataset.mode === "system" ? "system" : "photo";
      this.posterState.backdropMode = mode;
      this.setData({ "form.backdropMode": mode });
      this._rebuildBackdropOptions();
      if (mode !== "system") {
        this._render();
        return;
      }
      if (this.posterState.segmentationStatus !== "person") {
        wx.showToast({ title: this.data.copy.backdropNeedSubject, icon: "none" });
      }
      this._ensureSystemBackdrop()
        .then(() => this._render())
        .catch((error) => {
          console.warn("[golf-poster] load system backdrop failed", error);
          this.posterState.backdropMode = "photo";
          this.setData({ "form.backdropMode": "photo" });
        });
    },

    selectBackdrop(event) {
      const id = event.currentTarget.dataset.id;
      if (!id) return;
      this.posterState.backdropMode = "system";
      this.posterState.backdropId = id;
      this.setData({ "form.backdropMode": "system" });
      this._rebuildBackdropOptions();
      this._ensureSystemBackdrop()
        .then(() => this._render())
        .catch((error) => {
          console.warn("[golf-poster] load system backdrop failed", error);
        });
    },

    selectPalette(event) {
      applyPalette(this.posterState, event.currentTarget.dataset.id);
      ensureTotalDisplayModel(this.posterState);
      this._rebuildPaletteOptions();
      this._rebuildColorControls();
      this._syncIdentityForm();
      this.setData({
        "form.cardOpacity": Number.isFinite(Number(this.posterState.style.cardOpacity))
          ? Math.round(this.posterState.style.cardOpacity)
          : 88,
        "form.backdropMode": this.posterState.backdropMode === "system" ? "system" : "photo",
        "form.scoringStyle": this.posterState.scoringStyle === "dp" ? "dp" : "pga",
        scoreFontIndex: fontIndex(this.posterState.fonts && this.posterState.fonts.score),
        totalFontIndex: fontIndex(this.posterState.total && this.posterState.total.font),
        relativeFontIndex: fontIndex(this.posterState.relativeTotal && this.posterState.relativeTotal.font)
      });
      this._rebuildBackdropOptions();
      const waitBackdrop = this.posterState.backdropMode === "system"
        ? this._ensureSystemBackdrop()
        : Promise.resolve();
      waitBackdrop
        .then(() => this._render())
        .catch((error) => {
          console.warn("[golf-poster] load palette backdrop failed", error);
          this._render();
        });
    },

    selectScoreMode(event) {
      this.posterState.scoreMode = event.currentTarget.dataset.mode;
      const holes = this._buildScoreHoleRows(this.posterState);
      this.setData({
        "form.scoreMode": this.posterState.scoreMode,
        "form.scoreInput": formatScoreInput(this.posterState.scoreSets[this.posterState.scoreMode]),
        scoreFrontNine: holes.front,
        scoreBackNine: holes.back
      });
      this._updateAutoTotal();
    },

    selectScoringStyle(event) {
      const style = event.currentTarget.dataset.style === "dp" ? "dp" : "pga";
      this.posterState.scoringStyle = style;
      if (!isCustomColorMode(this.posterState)) {
        applyMarkerPreset(this.posterState, style);
        syncLinkedPaletteGroups(this.posterState);
      }
      this.setData({
        "form.scoringStyle": style,
        "form.cardOpacity": Number.isFinite(Number(this.posterState.style.cardOpacity))
          ? Math.round(this.posterState.style.cardOpacity)
          : 15
      });
      this._rebuildColorControls();
      this._render();
    },

    onScoreInput() {
      // 逐洞成绩只读，改分请回记分页
    },

    goEditScoreOnCard() {
      const gameId = String(this.properties.roundId || "").trim();
      const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
      if (pages && pages.length > 1) {
        wx.navigateBack({ delta: 1 });
        return;
      }
      const query = gameId ? "?gameId=" + encodeURIComponent(gameId) : "";
      wx.reLaunch({
        url: "/subpackages/scoring/pages/score/index" + query
      });
    },

    _buildScoreHoleRows(model) {
      const scores = (model && model.scoreSets && model.scoreSets[model.scoreMode]) || [];
      const pars = (model && model.holePars) || [];
      const front = [];
      const back = [];
      for (let i = 0; i < 18; i += 1) {
        const raw = scores[i];
        const cell = {
          hole: i + 1,
          par: pars[i] != null && pars[i] !== "" ? String(pars[i]) : "4",
          score: raw === null || raw === undefined || raw === "" ? "—" : String(raw)
        };
        if (i < 9) front.push(cell);
        else back.push(cell);
      }
      return { front, back };
    },

    onBadgeInput() {
      this.posterState.badge = "";
    },

    onScoreFontChange(event) {
      const index = Number(event.detail.value);
      this.posterState.fonts.score = FONT_OPTIONS[index].id;
      this.setData({ scoreFontIndex: index });
      this._render();
    },

    onScoreItalicChange(event) {
      this.posterState.fonts.scoreItalic = Boolean(event.detail.value);
      this.setData({ "form.scoreItalic": this.posterState.fonts.scoreItalic });
      this._render();
    },

    onScorecardScale(event) {
      this.posterState.scorecard.scale = Number(event.detail.value) / 100;
      this.setData({ "form.scorecardScale": Number(event.detail.value) });
      this._render();
    },

    onCardOpacity(event) {
      const value = Math.max(0, Math.min(100, Number(event.detail.value)));
      this.posterState.style.cardOpacity = value;
      this.setData({ "form.cardOpacity": value });
      this._render();
    },

    onAlignScorecardCenter() {
      const template = TEMPLATES[this.posterState.templateId] || TEMPLATES[DEFAULT_TEMPLATE_ID];
      const base = template.layout && template.layout.score;
      const scale = this.posterState.scorecard.scale || 1;
      const width = (base && base.w ? base.w : 0) * scale;
      const left = (POSTER_WIDTH - width) / 2;
      // scorecard.x 是成绩卡中心点
      this.posterState.scorecard.x = left + width / 2;
      this._render();
    },

    selectScorecardLayer(event) {
      const above = event.currentTarget.dataset.layer !== "below";
      if (!this.posterState.scorecard) this.posterState.scorecard = {};
      this.posterState.scorecard.aboveSubject = above;
      this.setData({ "form.scorecardAbove": above });
      this._render();
    },

    mirrorTemplate2Layout() {
      if (this.data.selectedTemplateId !== "template2") return;
      const next = !this.data.form.layoutMirrored;
      this.setData({ "form.layoutMirrored": next }, () => {
        if (this.data.templatePreviewOpen) {
          this._initTemplateCanvas("template2");
          return;
        }
        if (this.posterState.templateId === "template2") {
          mirrorPosterLayout(this.posterState);
          this._syncAllControls();
          this._render();
        }
      });
    },

    selectColor(event) {
      const styleKey = event.currentTarget.dataset.key;
      const value = event.currentTarget.dataset.value;
      setCustomElementColor(this.posterState, styleKey, value);
      const patch = {};
      if (styleKey === "relativeTotalColor") patch["form.relativeTotalColor"] = value;
      this._rebuildColorControls();
      this._rebuildPaletteOptions();
      this._syncIdentityForm();
      if (Object.keys(patch).length) this.setData(patch);
      this._render();
    },

    onTotalVisibleChange(event) {
      this.posterState.total.hidden = !event.detail.value;
      this.setData({ "form.totalVisible": Boolean(event.detail.value) });
      this._render();
    },

    onRelativeVisibleChange(event) {
      if (!this.posterState.relativeTotal) return;
      const visible = Boolean(event.detail.value);
      this.posterState.relativeTotal.hidden = !visible;
      this.posterState.relativeTotalCleared = !visible;
      this.setData({ "form.relativeVisible": visible, relativeTotalCleared: !visible });
      this._render();
    },

    onIdentityVisibleChange(event) {
      const visible = Boolean(event.detail.value);
      this.posterState.identity[this.data.activeIdentity].hidden = !visible;
      this.setData({ "form.identityVisible": visible });
      this._render();
    },

    _updateRelativeTotal() {
      const calculation = calculateTotal(this.posterState);
      let diff = null;
      if (calculation.relative !== null && calculation.relative !== undefined) {
        diff = calculation.relative;
      } else {
        const total = Number(this.posterState.total && this.posterState.total.value);
        const par = Number(this.posterState.roundPar || 72);
        if (Number.isFinite(total) && Number.isFinite(par)) diff = total - par;
      }
      const display = formatToParDisplay(diff);
      this.posterState.toPar = Number.isFinite(diff) ? diff : undefined;
      if (this.posterState.relativeTotal) {
        this.posterState.relativeTotal.value = display;
      }
      this.setData({
        "form.relativeTotal": display
      });
    },

    onRoundParInput(event) {
      const value = Number.parseInt(event.detail.value, 10);
      this.posterState.roundPar = Number.isFinite(value) ? clamp(value, 1, 180) : null;
      this.setData({ "form.roundPar": event.detail.value });
      this._updateAutoTotal();
    },

    switchTotalTab(event) {
      const tab = event.currentTarget.dataset.tab === "relative" ? "relative" : "total";
      this._updateRelativeTotal();
      this.setData({
        totalTab: tab,
        activeEditTarget: tab === "relative" ? "relativeTotal" : "total"
      }, () => this._syncLargeEdit());
      this._render();
    },

    onTotalFontChange(event) {
      const index = Number(event.detail.value);
      const font = FONT_OPTIONS[index];
      if (!font) return;
      this.posterState.total.font = font.id;
      this.posterState.fonts.total = font.id;
      this.setData({ totalFontIndex: index });
      this._render();
    },

    onTotalItalicChange(event) {
      this.posterState.total.italic = Boolean(event.detail.value);
      this.setData({ "form.totalItalic": this.posterState.total.italic });
      this._render();
    },

    onTotalColorSelect(event) {
      const color = event.currentTarget.dataset.color;
      setCustomElementColor(this.posterState, "total", color);
      this._rebuildColorControls();
      this._rebuildPaletteOptions();
      this._render();
    },

    onRelativeFontChange(event) {
      const index = Number(event.detail.value);
      const font = FONT_OPTIONS[index];
      if (!font || !this.posterState.relativeTotal) return;
      this.posterState.relativeTotal.font = font.id;
      this.setData({ relativeFontIndex: index });
      this._render();
    },

    onRelativeItalicChange(event) {
      if (!this.posterState.relativeTotal) return;
      this.posterState.relativeTotal.italic = Boolean(event.detail.value);
      this.setData({ "form.relativeItalic": this.posterState.relativeTotal.italic });
      this._render();
    },

    onRelativeSizeChange(event) {
      const value = clamp(Number(event.detail.value), 80, 700);
      if (!this.posterState.relativeTotal) return;
      this.posterState.relativeTotal.size = value;
      this.setData({ "form.relativeTotalSize": value });
      this._render();
    },

    onRelativeColorSelect(event) {
      const color = event.currentTarget.dataset.color;
      if (!this.posterState.relativeTotal) return;
      setCustomElementColor(this.posterState, "relativeTotal", color);
      this.setData({ "form.relativeTotalColor": color });
      this._rebuildColorControls();
      this._rebuildPaletteOptions();
      this._syncIdentityForm();
      this._render();
    },

    onTotalOpacity(event) {
      this.posterState.total.opacity = Number(event.detail.value);
      this.setData({ "form.totalOpacity": Number(event.detail.value) });
      this._render();
    },

    onTotalSize(event) {
      const value = clamp(Number(event.detail.value), 100, 900);
      this.posterState.total.size = value;
      this.setData({ "form.totalSize": value });
      this._render();
    },

    onTotalAboveChange(event) {
      this.posterState.total.aboveSubject = Boolean(event.detail.value);
      this.setData({ "form.totalAbove": this.posterState.total.aboveSubject });
      this._render();
    },

    selectIdentity(event) {
      const key = event.currentTarget.dataset.key;
      this.setData({ activeIdentity: key }, () => this._syncIdentityForm());
      this._render();
    },

    onIdentityInput(event) {
      const key = event.currentTarget.dataset.key;
      if (key === "nickname") return;
      this.posterState.identity[key].value = event.detail.value;
      this.setData({ [`form.${key}`]: event.detail.value });
      this._render();
    },

    onDateChange(event) {
      this.posterState.identity.date.value = event.detail.value;
      this.setData({ "form.date": event.detail.value });
      this._render();
    },

    onTextFontChange(event) {
      const index = Number(event.detail.value);
      this.posterState.identity[this.data.activeIdentity].font = FONT_OPTIONS[index].id;
      this.setData({ textFontIndex: index });
      this._render();
    },

    onIdentityItalicChange(event) {
      if (this.posterState.identity[this.data.activeIdentity].hidden) return;
      this.posterState.identity[this.data.activeIdentity].italic = Boolean(event.detail.value);
      this.setData({ "form.identityItalic": this.posterState.identity[this.data.activeIdentity].italic });
      this._render();
    },

    onIdentityRotateTap() {
      if (this.posterState.identity[this.data.activeIdentity].hidden) return;
      const key = this.data.activeIdentity;
      const template = TEMPLATES[this.posterState.templateId];
      const region = template && template.layout && template.layout[key];
      const current = identityRotation(this.posterState.identity[key], region);
      applyIdentityRotation(this.posterState.identity[key], nextIdentityRotation(current));
      this.setData({ "form.identityRotated": this._identityRotated(key) });
      this._render();
    },

    selectTextColor(event) {
      const value = event.currentTarget.dataset.value;
      setCustomElementColor(this.posterState, this.data.activeIdentity, value);
      this._rebuildColorControls();
      this._rebuildPaletteOptions();
      this._syncIdentityForm();
      this._render();
    },

    onIdentitySize(event) {
      const value = Number(event.detail.value);
      this.posterState.identity[this.data.activeIdentity].size = value;
      this.setData({ "form.identitySize": value });
      this._render();
    },

    chooseStickers() {
      const remaining = MAX_STICKERS - this.posterState.stickers.length;
      if (remaining <= 0) return;
      wx.chooseMedia({
        count: remaining,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        sizeType: ["original", "compressed"],
        success: async (result) => {
          for (let index = 0; index < result.tempFiles.length; index += 1) {
            const filePath = result.tempFiles[index].tempFilePath;
            const image = await this._loadCanvasImage(filePath);
            const scale = Math.min(220 / image.width, 220 / image.height, 1);
            const sticker = {
              id: `${Date.now()}-${index}`,
              path: filePath,
              image,
              baseWidth: image.width * scale,
              baseHeight: image.height * scale,
              x: 500 + (this.posterState.stickers.length % 3 - 1) * 90,
              y: 630 + this.posterState.stickers.length % 2 * 90,
              scale: 1
            };
            this.posterState.stickers.push(sticker);
            this.posterState.selectedStickerId = sticker.id;
          }
          const target = this._ensureStickerSelection();
          this.setData({
            activeEditTarget: target,
            activeElementScaleDisabled: !target
          });
          this._syncStickerControls();
          this._render();
          this.saveDraft();
        }
      });
    },

    selectSticker(event) {
      this.posterState.selectedStickerId = event.currentTarget.dataset.id;
      this.setData({
        activeEditTarget: this._ensureStickerSelection(),
        activeElementScaleDisabled: false
      });
      this._syncStickerControls();
      this._render();
    },

    onStickerScale(event) {
      const sticker = this._selectedSticker();
      if (!sticker) return;
      sticker.scale = Number(event.detail.value) / 100;
      this.setData({ "form.stickerScale": Number(event.detail.value) });
      this._render();
    },

    removeSticker() {
      const selectedId = this.posterState.selectedStickerId;
      if (!selectedId) return;
      this.posterState.stickers = this.posterState.stickers.filter((item) => item.id !== selectedId);
      const target = this._ensureStickerSelection();
      this.setData({
        activeEditTarget: target,
        activeElementScaleDisabled: !target
      });
      this._syncStickerControls();
      this._render();
    },

    onCanvasTouchStart(event) {
      if (!this.canvasRect || !event.touches.length) return;
      const points = this._posterTouchPoints(event.touches);
      const target = this._gestureTarget();
      const gestureCenter = center(points);
      this.gesture = {
        target,
        center: gestureCenter,
        distance: distance(points),
        pendingDx: 0,
        pendingDy: 0,
        travel: 0,
        moved: points.length > 1,
        maxTouches: points.length
      };
    },

    onCanvasTouchMove(event) {
      if (!this.gesture || !event.touches.length) return;
      const points = this._posterTouchPoints(event.touches);
      const nextCenter = center(points);
      const nextDistance = distance(points);
      const dx = nextCenter.x - this.gesture.center.x;
      const dy = nextCenter.y - this.gesture.center.y;
      this.gesture.pendingDx += dx;
      this.gesture.pendingDy += dy;
      this.gesture.travel += Math.sqrt(dx * dx + dy * dy);
      this.gesture.maxTouches = Math.max(this.gesture.maxTouches, points.length);
      if (!this.gesture.moved && this.gesture.travel >= 18) this.gesture.moved = true;
      if (this.gesture.moved && this.gesture.target) {
        this._moveTarget(
          this.gesture.target,
          this.gesture.pendingDx,
          this.gesture.pendingDy
        );
        this.gesture.pendingDx = 0;
        this.gesture.pendingDy = 0;
      }
      if (points.length >= 2 && this.gesture.distance > 0 && this.gesture.target) {
        this._scaleTarget(this.gesture.target, nextDistance / this.gesture.distance);
      }
      this.gesture.center = nextCenter;
      this.gesture.distance = nextDistance;
      if (this.gesture.moved) this._render();
    },

    onCanvasTouchEnd() {
      const wasTap = Boolean(this.gesture
        && !this.gesture.moved
        && this.gesture.maxTouches === 1);
      this.gesture = null;
      this._syncAllControls();
      if (wasTap) {
        if (this.data.largeEdit) this.closeLargeEdit();
        else this.openLargeEdit();
      }
    },

    onCanvasTouchCancel() {
      this.gesture = null;
      this._syncAllControls();
    },

    selectLargeEditTarget(event) {
      const target = event.currentTarget.dataset.target;
      this.setData({ activeEditTarget: target }, () => {
        this._syncLargeEdit();
        this._render();
      });
    },

    onActiveElementScale(event) {
      const percent = Number(event.detail.value);
      this._setTargetScalePercent(this.data.activeEditTarget, percent);
      this.setData({ activeElementScale: percent });
      this._render();
    },

    async exportPoster() {
      if (this.data.saving) return;
      if (!this.posterCanvas) return;
      const dateValue = this.posterState && this.posterState.identity && this.posterState.identity.date
        ? this.posterState.identity.date.value
        : "";
      if (!hasPosterMatchDate(dateValue)) {
        console.warn("[golf-poster] export blocked: match date missing", {
          dateValue: dateValue,
          roundId: this.properties.roundId
        });
        wx.showToast({
          title: (this.data.copy && this.data.copy.dateRequired) || "请先填写比赛日期",
          icon: "none"
        });
        return;
      }
      this.setData({ saving: true });
      wx.showLoading({ title: this.data.copy.saving, mask: true });
      try {
        const tempFilePath = await this._exportPoster();
        this._discardDraft = true;
        this._draftRestoredKey = "";
        clearPosterDraft();
        this.triggerEvent("export", { tempFilePath });
        this.setData({
          saving: false,
          exportedImagePath: tempFilePath,
          showSharePanel: true
        });
        if (this.properties.saveToAlbum) {
          this._saveToAlbum(tempFilePath).catch(() => {});
        }
      } catch (error) {
        this.setData({ saving: false });
        wx.showModal({
          title: this.data.copy.saveFailed,
          content: this.data.language === "en"
            ? "Open Settings and allow access to Photos."
            : "请在设置中允许保存图片到相册。",
          confirmText: this.data.language === "en" ? "SETTINGS" : "去设置",
          success: (result) => {
            if (result.confirm) wx.openSetting();
          }
        });
      } finally {
        wx.hideLoading();
        this._render();
      }
    },

    onSavePoster() {
      return this.exportPoster();
    },

    _exportPoster() {
      this._renderNow(true);
      return new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas: this.posterCanvas,
          x: 0,
          y: 0,
          width: POSTER_WIDTH,
          height: POSTER_HEIGHT,
          destWidth: POSTER_WIDTH * 2,
          destHeight: POSTER_HEIGHT * 2,
          fileType: "png",
          quality: 1,
          success: (result) => resolve(result.tempFilePath),
          fail: reject
        });
      });
    },

    _saveToAlbum(filePath) {
      return new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath,
          success: resolve,
          fail: reject
        });
      });
    },

    closeSharePanel() {
      this.setData({ showSharePanel: false });
    },

    stopPropagation() {},

    onShareToCircle() {
      console.log("[poster] onShareToCircle 被点击");
      const tempFilePath = this.data.exportedImagePath;
      console.log("[poster] exportedImagePath:", tempFilePath);
      if (!tempFilePath) {
        console.log("[poster] 没有图片路径，退出");
        wx.showToast({ title: this.data.copy.shareNeedExport, icon: "none" });
        return;
      }
      this.setData({ showSharePanel: false });
      console.log("[poster] 分享面板已关闭");
      const that = this;
      const roundId = String(this.properties.roundId || "");
      try {
        wx.setStorageSync("posterCircleShare", {
          imagePath: tempFilePath,
          roundId: roundId,
          from: "poster"
        });
      } catch (error) {
        console.warn("[golf-poster] posterCircleShare", error);
      }
      console.log("[poster] 开始保存图片到相册...");
      wx.saveImageToPhotosAlbum({
        filePath: tempFilePath,
        success: () => {
          console.log("[poster] 保存到相册成功");
          wx.showToast({ title: "已保存到相册", icon: "success" });
          console.log("[poster] 准备跳转到球友圈发布页，roundId:", that.properties.roundId);
          const url = that._momentPublishUrl({
            from: "poster",
            roundId: roundId,
            imagePath: tempFilePath
          });
          console.log("[poster] 发布页 url:", url);
          if (!url) {
            wx.showToast({ title: "当前无法发布到球友圈", icon: "none" });
            return;
          }
          wx.navigateTo({
            url: url,
            success: (res) => {
              console.log("[poster] 打开发布页成功");
              const eventChannel = res && res.eventChannel;
              if (eventChannel && typeof eventChannel.on === "function") {
                eventChannel.on("afterPublish", () => {
                  console.log("[poster] 球友圈发布成功，准备返回记分页");
                  that._backToScorePage();
                });
                eventChannel.on("momentPublished", () => {
                  console.log("[poster] momentPublished，准备返回记分页");
                  that._backToScorePage();
                });
              } else {
                console.warn("[poster] 没有 eventChannel");
              }
            },
            fail: (err) => {
              console.log("[poster] 打开发布页失败:", err);
              that._backToScorePage();
            }
          });
        },
        fail: (err) => {
          console.log("[poster] 保存到相册失败:", err);
          const msg = (err && err.errMsg) || "";
          if (msg.indexOf("auth") !== -1) {
            wx.showModal({
              title: "提示",
              content: "需要相册权限才能发布到球友圈",
              confirmText: "去设置",
              success: (res) => {
                if (res.confirm) wx.openSetting();
                else that._backToScorePage();
              }
            });
          } else {
            that._backToScorePage();
          }
        }
      });
    },

    _slotPlayerId(slot) {
      if (!slot) return "";
      if (typeof slot === "string") return slot;
      return (
        (slot.player && (slot.player.playerId || slot.player.userId)) ||
        slot.playerId ||
        slot.userId ||
        slot.id ||
        ""
      );
    },

    _normalizePublishSlots(rawSlots) {
      const list = Array.isArray(rawSlots) ? rawSlots : [];
      return list.map((slot, index) => {
        const playerId = this._slotPlayerId(slot);
        if (!playerId) {
          return { status: "empty", slotId: String(index + 1) };
        }
        const player =
          slot && typeof slot === "object"
            ? (slot.player || slot)
            : { playerId: playerId };
        return {
          status: "occupied",
          slotId: (slot && slot.slotId) || String(index + 1),
          playerId: playerId,
          player: player
        };
      });
    },

    _findPublishGroup(game, gameId) {
      const groups = gameStore.listGroups(game) || [];
      const me = socialRelationStore.resolveCurrentUserId();
      for (let i = 0; i < groups.length; i += 1) {
        const group = groups[i];
        const slots = (group && (group.playersSlots || group.slots || group.playerSlots)) || [];
        const hit = slots.some((slot) => {
          const pid = this._slotPlayerId(slot);
          return pid && me && String(pid) === String(me);
        });
        if (hit) return group;
      }
      return groups[0] || gameStore.getGroup(gameId, 0);
    },

    _momentPublishUrl(extra) {
      const src = extra || {};
      const roundId = String(src.roundId || this.properties.roundId || "").trim();
      const query = [];
      try {
        if (!roundId) {
          console.warn("[poster] 无 roundId，无法生成 publishToken");
        } else {
          const game = gameStore.getGame(roundId);
          if (!game) {
            console.warn("[poster] 未找到场次:", roundId);
          } else {
            const group = this._findPublishGroup(game, roundId);
            const rawSlots =
              (group && (group.playersSlots || group.slots || group.playerSlots)) ||
              game.playersSlots ||
              [];
            const slots = this._normalizePublishSlots(rawSlots);
            const players = slots
              .filter((s) => s && s.status === "occupied")
              .map((s) => s.player || { playerId: s.playerId });
            const payload = {
              currentUserId: socialRelationStore.resolveCurrentUserId(),
              gameId: roundId,
              matchId: game.matchId || "",
              groupId: (group && (group.groupId || group.id)) || "grp-1",
              slots: slots,
              players: players,
              matchName: game.name || game.title || game.courseName || "",
              gameMode: game.mode || game.gameMode || "",
              sourceHint: "game"
            };
            console.log("[poster] 生成 publishToken payload:", {
              gameId: payload.gameId,
              groupId: payload.groupId,
              slotCount: slots.length,
              occupied: players.length
            });
            const created = playerMomentPublishContext.createMomentPublishContext(payload);
            if (created && created.ok && created.token) {
              query.push("publishToken=" + encodeURIComponent(created.token));
            } else {
              console.warn("[poster] 生成 token 失败:", created);
            }
          }
        }
      } catch (error) {
        console.error("[poster] 生成发布 URL 失败:", error);
      }
      if (src.from) query.push("from=" + encodeURIComponent(src.from));
      if (src.roundId) query.push("roundId=" + encodeURIComponent(src.roundId));
      if (src.imagePath) query.push("imagePath=" + encodeURIComponent(src.imagePath));
      if (!query.some((item) => item.indexOf("publishToken=") === 0)) {
        return "";
      }
      return "/subpackages/player/pages/moment-publish/index?" + query.join("&");
    },

    onShareToWechat() {
      const tempFilePath = this.data.exportedImagePath;
      if (!tempFilePath) {
        wx.showToast({ title: this.data.copy.shareNeedExport, icon: "none" });
        return;
      }
      this.setData({ showSharePanel: false });
      this.triggerEvent("share", {
        tempFilePath,
        roundId: this.properties.roundId
      });
      if (typeof wx.showShareImageMenu === "function") {
        wx.showShareImageMenu({ path: tempFilePath });
      }
      this._backToScorePage();
    },

    _backToScorePage() {
      const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
      console.log("[poster] 当前页面栈:", pages.map((p) => p && p.route));
      console.log("[poster] 当前 roundId:", this.properties.roundId);

      const scorePage = pages.find((p) => p && p.route && p.route.indexOf("scoring/pages/score") !== -1);
      console.log("[poster] 找到记分页:", scorePage && scorePage.route ? scorePage.route : "未找到");

      if (scorePage) {
        const index = pages.indexOf(scorePage);
        const delta = pages.length - index - 1;
        console.log("[poster] 返回 delta:", delta, "当前栈深:", pages.length, "记分页下标:", index);
        wx.navigateBack({
          delta: delta,
          success: () => console.log("[poster] navigateBack 成功"),
          fail: (err) => {
            console.error("[poster] navigateBack 失败:", err);
            wx.reLaunch({ url: "/pages/home/index" });
          }
        });
        return;
      }

      const roundId = String(this.properties.roundId || "").trim();
      const scoreUrl = "/subpackages/scoring/pages/score/index" +
        (roundId ? "?gameId=" + encodeURIComponent(roundId) : "");
      console.log("[poster] 未找到记分页，尝试 reLaunch 到记分页", scoreUrl);
      wx.reLaunch({
        url: scoreUrl,
        success: () => console.log("[poster] reLaunch 记分页成功"),
        fail: (err) => {
          console.error("[poster] reLaunch 记分页失败:", err);
          wx.reLaunch({
            url: "/pages/home/index",
            fail: () => console.error("[poster] reLaunch 失败")
          });
        }
      });
    },

    _selectedSticker() {
      return this.posterState.stickers.find((item) => item.id === this.posterState.selectedStickerId) || null;
    },

    _identityMoveKeys(target) {
      const template = TEMPLATES[this.posterState.templateId];
      const courseLayout = template && template.layout && template.layout.course;
      const group = courseLayout && courseLayout.metaKeys && courseLayout.metaKeys.length
        ? courseLayout.metaKeys
        : ["extra", "course", "date"];
      if (courseLayout && courseLayout.metaLine && group.indexOf(target) >= 0) return group.slice();
      return [target];
    },

    _gestureTarget() {
      const step = Number(this.data.step);
      if (step === 5) return this._ensureStickerSelection();
      if (this.data.largeEdit) return this.data.activeEditTarget || "";
      if (step === 1) return "photo";
      if (step === 2) return "scorecard";
      if (step === 3) {
        return this.data.totalTab === "relative" ? "relativeTotal" : "total";
      }
      if (step === 4) return this.data.activeIdentity || "";
      return "";
    },

    _moveTarget(target, dx, dy) {
      if (target === "photo") {
        this.posterState.image.x += dx;
        this.posterState.image.y += dy;
      } else if (target === "scorecard") {
        this.posterState.scorecard.x += dx;
        this.posterState.scorecard.y += dy;
      } else if (target === "total") {
        this.posterState.total.x += dx;
        this.posterState.total.y += dy;
      } else if (target === "relativeTotal" && this.posterState.relativeTotal) {
        this.posterState.relativeTotal.x += dx;
        this.posterState.relativeTotal.y += dy;
      } else if (["nickname", "course", "date", "extra"].indexOf(target) >= 0) {
        this._identityMoveKeys(target).forEach((key) => {
          this.posterState.identity[key].x += dx;
          this.posterState.identity[key].y += dy;
        });
      } else if (target.indexOf("sticker:") === 0) {
        const sticker = this.posterState.stickers.find((item) => `sticker:${item.id}` === target);
        if (sticker) {
          sticker.x += dx;
          sticker.y += dy;
        }
      }
    },

    _scaleTarget(target, factor) {
      if (!Number.isFinite(factor) || factor <= 0) return;
      if (target === "photo") {
        this.posterState.image.scale = clamp(this.posterState.image.scale * factor, 0.8, 2.6);
      } else if (target === "scorecard") {
        this.posterState.scorecard.scale = clamp(this.posterState.scorecard.scale * factor, 0.55, 1.8);
      } else if (target === "total") {
        this.posterState.total.size = clamp(this.posterState.total.size * factor, 100, 900);
      } else if (target === "relativeTotal" && this.posterState.relativeTotal) {
        this.posterState.relativeTotal.size = clamp(this.posterState.relativeTotal.size * factor, 80, 700);
      } else if (["nickname", "course", "date", "extra"].indexOf(target) >= 0) {
        const item = this.posterState.identity[target];
        item.size = clamp(item.size * factor, 12, 100);
      } else if (target.indexOf("sticker:") === 0) {
        const sticker = this.posterState.stickers.find((item) => `sticker:${item.id}` === target);
        if (sticker) sticker.scale = clamp(sticker.scale * factor, 0.1, 2.6);
      }
    },

    _setTargetScalePercent(target, percent) {
      const template = TEMPLATES[this.posterState.templateId];
      if (target === "photo") {
        this.posterState.image.scale = clamp(percent / 100, 0.8, 2.6);
      } else if (target === "scorecard") {
        this.posterState.scorecard.scale = clamp(percent / 100, 0.55, 1.8);
      } else if (target === "total") {
        this.posterState.total.size = clamp(template.defaults.totalSize * percent / 100, 100, 900);
      } else if (target === "relativeTotal" && this.posterState.relativeTotal) {
        this.posterState.relativeTotal.size = clamp(200 * percent / 100, 80, 700);
      } else if (["nickname", "course", "date", "extra"].indexOf(target) >= 0) {
        const defaultKey = target === "nickname" ? "nicknameSize" : target === "course" ? "courseSize" : "dateSize";
        this.posterState.identity[target].size = clamp(template.defaults[defaultKey] * percent / 100, 12, 100);
      } else if (target.indexOf("sticker:") === 0) {
        const sticker = this.posterState.stickers.find((item) => `sticker:${item.id}` === target);
        if (sticker) sticker.scale = clamp(percent / 100, 0.1, 2.6);
      }
    },

    _targetScalePercent(target) {
      const template = TEMPLATES[this.posterState.templateId];
      if (target === "photo") return Math.round(this.posterState.image.scale * 100);
      if (target === "scorecard") return Math.round(this.posterState.scorecard.scale * 100);
      if (target === "total") return Math.round(this.posterState.total.size / template.defaults.totalSize * 100);
      if (target === "relativeTotal" && this.posterState.relativeTotal) {
        return Math.round(this.posterState.relativeTotal.size / 200 * 100);
      }
      if (["nickname", "course", "date", "extra"].indexOf(target) >= 0) {
        const defaultKey = target === "nickname" ? "nicknameSize" : target === "course" ? "courseSize" : "dateSize";
        return Math.round(this.posterState.identity[target].size / template.defaults[defaultKey] * 100);
      }
      if (target.indexOf("sticker:") === 0) {
        const sticker = this.posterState.stickers.find((item) => `sticker:${item.id}` === target);
        return sticker ? Math.round(sticker.scale * 100) : 100;
      }
      return 100;
    },

    _targetLabel(target) {
      const copy = this.data.copy;
      const labels = {
        photo: copy.stepTitles[1],
        scorecard: copy.stepTitles[2],
        total: copy.totalTabTotal,
        relativeTotal: copy.totalTabRelative,
        nickname: copy.nickname,
        course: copy.course,
        date: copy.date,
        extra: copy.extra
      };
      if (target.indexOf("sticker:") === 0) return copy.stepTitles[5];
      return labels[target] || copy.noSelection;
    },

    _syncLargeEdit() {
      const target = this.data.activeEditTarget;
      this.setData({
        activeEditLabel: this._targetLabel(target),
        activeElementScale: this._targetScalePercent(target),
        activeElementScaleDisabled: !target
      });
    },

    _posterTouchPoints(touches) {
      return Array.from(touches).map((touch) => ({
        x: (touch.clientX - this.canvasRect.left) * POSTER_WIDTH / this.canvasRect.width,
        y: (touch.clientY - this.canvasRect.top) * POSTER_HEIGHT / this.canvasRect.height
      }));
    },

    _initPosterCanvas() {
      const tasks = [];
      if (!this.posterCanvas || !this.posterContext) {
        tasks.push(this._queryCanvas("#posterCanvas").then((result) => {
          this.posterCanvas = result.node;
          this.posterCanvas.width = POSTER_WIDTH;
          this.posterCanvas.height = POSTER_HEIGHT;
          this.posterContext = this.posterCanvas.getContext("2d");
          return this._ensureBrandLogo();
        }));
      }
      return Promise.all(tasks);
    },

    _initTemplateCanvas(templateId) {
      this._queryCanvas("#templatePreviewCanvas").then(async (result) => {
        this.templateCanvas = result.node;
        this.templateCanvas.width = POSTER_WIDTH;
        this.templateCanvas.height = POSTER_HEIGHT;
        this.templateContext = this.templateCanvas.getContext("2d");
        const sample = createPosterModel(templateId, true, this.properties.brand);
        if (templateId === "template2" && this.data.form.layoutMirrored && !sample.layoutMirrored) {
          mirrorPosterLayout(sample);
        }
        if (sample.backdropMode === "system") {
          const spec = SYSTEM_BACKDROPS.find((item) => item.id === sample.backdropId) || SYSTEM_BACKDROPS[0];
          try {
            sample.backdrop = await this._loadCanvasImage(spec.path);
          } catch (error) {
            console.warn("[golf-poster] template backdrop missing", error);
          }
        }
        sample.brandLogo = this._brandLogoImage || null;
        if (!sample.brandLogo) {
          try {
            sample.brandLogo = await this._ensureBrandLogo();
          } catch (error) {
            console.warn("[golf-poster] template brand logo missing", error);
          }
        }
        renderPoster(this.templateContext, sample, { showGuide: false });
      }).catch((error) => {
        console.warn("[golf-poster] template canvas init failed", error);
      });
    },

    _queryCanvas(selector) {
      return new Promise((resolve, reject) => {
        this.createSelectorQuery()
          .select(selector)
          .fields({ node: true, size: true })
          .exec((result) => {
            if (!result[0] || !result[0].node) {
              reject(new Error("Canvas not found: " + selector));
              return;
            }
            resolve(result[0]);
          });
      });
    },

    _refreshCanvasRect() {
      if (!this.posterCanvas) return;
      this.createSelectorQuery()
        .select("#posterCanvas")
        .boundingClientRect((rect) => {
          this.canvasRect = rect;
        })
        .exec();
    },

    _bindSubjectContact(image) {
      try {
        const prepared = prepareSubjectShadow(image);
        this.posterState.subjectShadow = prepared;
        this.posterState.subjectContact = prepared && prepared.contact ? prepared.contact : null;
      } catch (error) {
        console.warn("[golf-poster] measure subject contact failed", error);
        this.posterState.subjectShadow = null;
        this.posterState.subjectContact = null;
      }
    },

    _punchBrandLogoWhite(image) {
      try {
        const w = Number(image.width || image.naturalWidth) || 0;
        const h = Number(image.height || image.naturalHeight) || 0;
        if (!w || !h || typeof wx.createOffscreenCanvas !== "function") return image;
        const off = wx.createOffscreenCanvas({ type: "2d", width: w, height: h });
        const ctx = off.getContext("2d");
        if (!ctx) return image;
        ctx.drawImage(image, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] > 248 && d[i + 1] > 248 && d[i + 2] > 248) d[i + 3] = 0;
        }
        ctx.putImageData(imgData, 0, 0);
        return off;
      } catch (error) {
        console.warn("[golf-poster] punch brand logo white failed", error);
        return image;
      }
    },

    _ensureBrandLogo() {
      if (this._brandLogoImage) return Promise.resolve(this._brandLogoImage);
      if (this._brandLogoPromise) return this._brandLogoPromise;
      this._brandLogoPromise = this._loadCanvasImage(EVENT_BRAND_LOGO_PATH)
        .then((img) => this._punchBrandLogoWhite(img))
        .then((img) => {
          this._brandLogoImage = img;
          if (this.posterState) this.posterState.brandLogo = img;
          this._render();
          return img;
        })
        .catch((error) => {
          console.warn("[golf-poster] brand logo missing", error);
          this._brandLogoPromise = null;
          return null;
        });
      return this._brandLogoPromise;
    },

    _loadCanvasImage(filePath) {
      return new Promise((resolve, reject) => {
        if (!this.posterCanvas || typeof this.posterCanvas.createImage !== "function") {
          reject(new Error("Poster canvas is not initialized"));
          return;
        }
        const image = this.posterCanvas.createImage();
        const rawPath = this._localFilePath(filePath);
        image.onload = () => resolve(image);
        image.onerror = (error) => {
          console.error("[poster] _loadCanvasImage 失败:", rawPath, error);
          reject(error || new Error("load image failed"));
        };
        image.src = rawPath;
      });
    },

    _guideTarget() {
      const step = Number(this.data.step);
      if (step >= 6 || step <= 0) return "";
      if (step === 5) return this._ensureStickerSelection();
      if (this.data.largeEdit) return this.data.activeEditTarget || "";
      return this._gestureTarget();
    },

    _render() {
      if (!this.posterContext) return;
      if (this.renderPending) {
        this._renderDirty = true;
        return;
      }
      this.renderPending = true;
      const draw = () => {
        this.renderPending = false;
        this._renderNow();
        if (this._renderDirty) {
          this._renderDirty = false;
          this._render();
        }
      };
      if (this.posterCanvas && typeof this.posterCanvas.requestAnimationFrame === "function") {
        this.posterCanvas.requestAnimationFrame(draw);
      } else {
        setTimeout(draw, 16);
      }
    },

    _renderNow(exporting) {
      if (!this.posterContext) return;
      if (this.posterState) this.posterState.brandLogo = this._brandLogoImage || this.posterState.brandLogo || null;
      this.sceneBounds = renderPoster(this.posterContext, this.posterState, {
        showGuide: !exporting && this.data.step > 0 && this.data.step < 6,
        guideTarget: this._guideTarget()
      });
    },

    _updateAutoTotal() {
      const result = calculateTotal(this.posterState);
      this.posterState.total.value = result.total === null ? "" : String(result.total);
      this.setData({
        "form.totalValue": this.posterState.total.value,
        "form.totalHint": result.total === null ? this.data.copy.totalEmpty : `${result.count} · ${result.total}`
      });
      this._updateRelativeTotal();
      this._render();
    },

    _paletteBarSwatch(color) {
      const value = String(color || "").trim();
      const normalized = value.toLowerCase().replace(/\s/g, "");
      const light = normalized === "#fff"
        || normalized === "#ffffff"
        || normalized === "white"
        || normalized === "rgb(255,255,255)"
        || normalized === "rgba(255,255,255,1)";
      return { color: value || "#ffffff", light };
    },

    _rebuildPaletteOptions(languageArg) {
      const language = languageArg || this.data.language;
      const copy = COPY[language];
      const template = TEMPLATES[this.posterState.templateId];
      const style = this.posterState.style || {};
      const options = (template.paletteIds || []).map((id) => {
        const palette = resolvePalette(template, id);
        if (!palette) return null;
        const colors = Array.isArray(palette.barColors) && palette.barColors.length >= 3
          ? palette.barColors
          : [
            palette.total,
            template.boardLinksToTotal ? palette.total : palette.card,
            template.boardLinksToTotal
              ? (palette.scoreText || palette.line)
              : (template.colorLinks ? palette.total : palette.line)
          ];
        const bars = colors.slice(0, 3).map((color) => this._paletteBarSwatch(color));
        return {
          id,
          name: language === "en" ? palette.en : palette.zh,
          bars,
          active: this.posterState.paletteId === id
        };
      }).filter(Boolean);
      options.push({
        id: "custom",
        name: copy.paletteCustom,
        bars: [
          this._paletteBarSwatch((this.posterState.total && this.posterState.total.color) || style.total),
          this._paletteBarSwatch(style.card),
          this._paletteBarSwatch(style.line)
        ],
        active: this.posterState.paletteId === "custom"
      });
      this.setData({ paletteOptions: options });
    },

    _colorOptions(styleKey, language) {
      const resolvedKey = expandUiColorKey(styleKey)[0];
      const resolved = this.posterState.resolvedColors || {};
      let current = String(resolved[resolvedKey] || "").toLowerCase();
      if (!current) {
        if (styleKey === "total") {
          current = String((this.posterState.total && this.posterState.total.color) || this.posterState.style.total || "#ce9224").toLowerCase();
        } else if (styleKey === "relativeTotalColor" || styleKey === "relativeTotal") {
          current = String((this.posterState.relativeTotal && this.posterState.relativeTotal.color) || this.posterState.style.relativeTotalColor || "#dc3f4d").toLowerCase();
        } else if (styleKey === "summaryLabel") {
          current = String(this.posterState.style.summaryLabelColor || "#ffffff").toLowerCase();
        } else if (styleKey === "summaryNumber") {
          current = String(this.posterState.style.summaryNumberColor || this.posterState.style.scoreText || "#ffffff").toLowerCase();
        } else if (styleKey === "divider") {
          current = String(this.posterState.style.dividerColor || this.posterState.style.line || "#ce9224").toLowerCase();
        } else if (styleKey === "extremeScore") {
          current = String(this.posterState.style.extremeScoreColor || this.posterState.style.total || "#ce9224").toLowerCase();
        } else if (styleKey === "nickname" || styleKey === "course" || styleKey === "date" || styleKey === "extra") {
          current = String((this.posterState.identity[styleKey] && this.posterState.identity[styleKey].color) || "#ffffff").toLowerCase();
        } else {
          current = String(this.posterState.style[resolvedKey] || this.posterState.style.total || "#ce9224").toLowerCase();
        }
      }
      const source = COLOR_OPTIONS.some((item) => item.value === current)
        ? COLOR_OPTIONS
        : [{ value: current, zh: "当前配色", en: "Current palette" }].concat(COLOR_OPTIONS);
      return source.map((item) => ({
        value: item.value,
        name: language === "en" ? item.en : item.zh,
        active: item.value === current
      }));
    },

    _rebuildColorControls(languageArg) {
      const language = languageArg || this.data.language;
      const copy = COPY[language];
      const rowDefinitions = [
        ["scoreText", copy.numbers],
        ["eagleMarker", copy.eagle],
        ["underMarker", copy.birdie],
        ["overMarker", copy.bogey],
        ["doubleBogeyMarker", copy.doubleBogey],
        ["summaryLabel", copy.summaryLabel],
        ["summaryNumber", copy.summaryNumber],
        ["divider", copy.centerDivider],
        ["extremeScore", copy.extremeScore]
      ];
      const scoreColorRows = rowDefinitions.map((row) => ({
        key: row[0],
        label: row[1],
        options: this._colorOptions(row[0], language)
      }));
      const activeTextColor = this.posterState.identity[this.data.activeIdentity].color.toLowerCase();
      const textSource = COLOR_OPTIONS.some((item) => item.value === activeTextColor)
        ? COLOR_OPTIONS
        : [{ value: activeTextColor, zh: "当前配色", en: "Current palette" }].concat(COLOR_OPTIONS);
      this.setData({
        cardColorOptions: this._colorOptions("card", language),
        lineColorOptions: this._colorOptions("line", language),
        scoreColorRows,
        totalColorOptions: this._colorOptions("total", language),
        relativeTotalColorOptions: this._colorOptions("relativeTotalColor", language),
        textColorOptions: textSource.map((item) => ({
          value: item.value,
          name: language === "en" ? item.en : item.zh,
          active: item.value === activeTextColor
        }))
      });
    },

    _syncStickerControls() {
      const selected = this._selectedSticker();
      this.setData({
        stickers: this.posterState.stickers.map((item) => ({
          id: item.id,
          path: item.path,
          selected: item.id === this.posterState.selectedStickerId
        })),
        stickerCount: `${this.posterState.stickers.length} / ${MAX_STICKERS}`,
        "form.stickerScale": selected ? Math.round(selected.scale * 100) : 100
      });
      this._syncLargeEdit();
    },

    _identityRotated(key) {
      const item = this.posterState.identity[key];
      const template = TEMPLATES[this.posterState.templateId];
      const region = template && template.layout && template.layout[key];
      return identityRotation(item, region) !== 0;
    },

    _syncIdentityForm() {
      const item = this.posterState.identity[this.data.activeIdentity];
      this.setData({
        "form.identitySize": Math.round(item.size),
        "form.identityItalic": Boolean(item.italic),
        "form.identityRotated": this._identityRotated(this.data.activeIdentity),
        "form.identityVisible": !Boolean(item.hidden),
        textFontIndex: fontIndex(item.font)
      });
      this._rebuildColorControls();
    },

    _syncAllControls() {
      const model = this.posterState;
      model.badge = "";
      ensureTotalDisplayModel(model);
      const calculation = calculateTotal(model);
      model.total.value = calculation.total === null ? "" : String(calculation.total);
      if (calculation.relative !== null && calculation.relative !== undefined) {
        model.toPar = calculation.relative;
      } else {
        const totalNum = Number(model.total.value);
        const par = Number(model.roundPar || 72);
        model.toPar = Number.isFinite(totalNum) && Number.isFinite(par) ? totalNum - par : undefined;
      }
      const display = formatToParDisplay(model.toPar);
      if (model.relativeTotal) model.relativeTotal.value = display;
      const hint = calculation.total === null
        ? this.data.copy.totalEmpty
        : model.scoreMode === "relative"
          ? `${calculation.count} · ${calculation.relative > 0 ? "+" : ""}${calculation.relative} · ${calculation.total}`
          : `${calculation.count} · ${calculation.total}`;
      const holes = this._buildScoreHoleRows(model);
      this.setData({
        photoStatus: this._photoStatusText(model.segmentationStatus),
        scoreFontIndex: fontIndex(model.fonts.score),
        totalFontIndex: fontIndex(model.total.font || model.fonts.total),
        relativeFontIndex: fontIndex(model.relativeTotal && model.relativeTotal.font),
        scoreFrontNine: holes.front,
        scoreBackNine: holes.back,
        form: {
          photoScale: Math.round(model.image.scale * 100),
          blur: model.image.blur,
          backdropMode: model.backdropMode === "system" ? "system" : "photo",
          scoreMode: model.scoreMode,
          scoringStyle: model.scoringStyle,
          scoreInput: formatScoreInput(model.scoreSets[model.scoreMode]),
          badge: "",
          scorecardScale: Math.round(model.scorecard.scale * 100),
          scorecardAbove: !model.scorecard || model.scorecard.aboveSubject !== false,
          layoutMirrored: Boolean(model.layoutMirrored),
          cardOpacity: Number.isFinite(Number(model.style.cardOpacity)) ? Math.round(model.style.cardOpacity) : 88,
          scoreItalic: Boolean(model.fonts.scoreItalic),
          roundPar: model.roundPar,
          relativeTotal: formatToParDisplay(model.toPar),
          relativeTotalColor: (model.relativeTotal && model.relativeTotal.color) || model.style.relativeTotalColor,
          relativeTotalSize: Math.round((model.relativeTotal && model.relativeTotal.size) || 200),
          relativeItalic: Boolean(model.relativeTotal && model.relativeTotal.italic),
          relativeVisible: !Boolean(model.relativeTotal && model.relativeTotal.hidden),
          totalValue: model.total.value,
          totalHint: hint,
          totalOpacity: Math.round(model.total.opacity),
          totalSize: Math.round(model.total.size),
          totalItalic: Boolean(model.total.italic),
          totalAbove: model.total.aboveSubject,
          totalVisible: !Boolean(model.total.hidden),
          nickname: model.identity.nickname.value,
          course: model.identity.course.value,
          date: model.identity.date.value,
          extra: model.identity.extra.value,
          identitySize: Math.round(model.identity[this.data.activeIdentity].size),
          identityItalic: Boolean(model.identity[this.data.activeIdentity].italic),
          identityRotated: this._identityRotated(this.data.activeIdentity),
          identityVisible: !Boolean(model.identity[this.data.activeIdentity].hidden),
          stickerScale: this._selectedSticker() ? Math.round(this._selectedSticker().scale * 100) : 100
        },
        textFontIndex: fontIndex(model.identity[this.data.activeIdentity].font)
      });
      this._rebuildPaletteOptions();
      this._rebuildBackdropOptions();
      this._rebuildColorControls();
      this._syncStickerControls();
      if (this.data.largeEdit) this._syncLargeEdit();
    }
  }
});
