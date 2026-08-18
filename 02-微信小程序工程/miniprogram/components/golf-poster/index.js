const defaultConfig = require("../../config");
const {
  POSTER_WIDTH,
  POSTER_HEIGHT,
  MAX_STICKERS,
  PALETTES,
  COLOR_OPTIONS,
  FONT_OPTIONS,
  GOOGLE_FONT_FACES,
  MARKER_STYLE_KEYS,
  TEMPLATES,
  createPosterModel,
  ensureTotalDisplayModel,
  ensureColorPresets,
  applyMarkerPreset,
  applyPalette,
  switchTemplate,
  templateCards
} = require("../../utils/poster-data");
const {
  parseScoreInput,
  formatScoreInput,
  calculateTotal
} = require("../../utils/score");
const {
  renderPoster,
  hitTest
} = require("../../utils/poster-engine");
const { requestSubjectCutout } = require("../../services/segmentation");
const { getScoreData, applyScoreData } = require("../../utils/score-data");
const {
  savePosterDraft,
  loadPosterDraft,
  clearPosterDraft,
  clonePlain
} = require("../../utils/poster-draft");
const gameStore = require("../../utils/gameStore.js");
const socialRelationStore = require("../../utils/socialRelationStore.js");
const playerMomentPublishContext = require("../../utils/playerMomentPublishContext.js");

const STEP_KEYS = ["template", "photo", "scorecard", "total", "identity", "stickers", "summary"];
const COLOR_KEY_GROUPS = {
  pgaUnder: ["eagleMarker", "underMarker"],
  pgaOver: ["overMarker", "doubleBogeyMarker"]
};
const COLOR_KEY_SOURCES = {
  pgaUnder: "underMarker",
  pgaOver: "overMarker"
};

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
    subjectDepth: "人物景深",
    waitingPhoto: "等待上传照片",
    segmenting: "正在处理人物边缘",
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
    localInferenceFailed: "本地人物识别失败",
    retry: "重新识别",
    palette: "模板配色",
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
    frontNine: "前九",
    backNine: "后九",
    holePar: "PAR",
    badge: "首洞标记",
    scoreFont: "成绩字体",
    board: "底板",
    rules: "分隔线",
    numbers: "逐洞成绩文字",
    markerColor: "成绩标记",
    pgaBirdieGroup: "老鹰 / 小鸟",
    pgaBogeyGroup: "柏忌 / 双柏忌",
    birdie: "小鸟",
    eagle: "老鹰及更好",
    bogey: "柏忌",
    doubleBogey: "双柏忌及更差",
    scorecardScale: "成绩卡大小",
    alignScorecardCenter: "水平居中",
    locked: "已锁定",
    unavailable: "当前底板不可用",
    totalStrokes: "总杆",
    autoTotal: "自动统计",
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
    totalTabTotal: "总杆",
    totalTabRelative: "杆差",
    totalAbove: "总成绩置于人物上方",
    totalEmpty: "录入逐洞成绩后自动合计",
    nickname: "昵称",
    nicknameReadonlyHint: "昵称来自记分卡，如需修改请返回记分页",
    course: "球场 / 赛事",
    date: "日期",
    extra: "补充信息",
    textFont: "文字字体",
    textColor: "文字颜色",
    textSize: "当前文字大小",
    brand: "品牌文字",
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
    subjectDepth: "Subject depth",
    waitingPhoto: "Waiting for a photo",
    segmenting: "Refining subject edges",
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
    localInferenceFailed: "Local subject detection failed",
    retry: "RETRY",
    palette: "Template palette",
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
    frontNine: "OUT",
    backNine: "IN",
    holePar: "PAR",
    badge: "First-hole badge",
    scoreFont: "Score font",
    board: "Board",
    rules: "Rules",
    numbers: "Hole score text",
    markerColor: "Score marker",
    pgaBirdieGroup: "Eagle / birdie",
    pgaBogeyGroup: "Bogey / double",
    birdie: "Birdie",
    eagle: "Eagle or better",
    bogey: "Bogey",
    doubleBogey: "Double bogey +",
    scorecardScale: "Scorecard size",
    alignScorecardCenter: "Center horizontally",
    locked: "Locked",
    unavailable: "Unavailable on this board",
    totalStrokes: "Total strokes",
    autoTotal: "Auto total",
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
    totalTabTotal: "Total",
    totalTabRelative: "To par",
    totalAbove: "Total above player",
    totalEmpty: "Hole scores will be totaled automatically",
    nickname: "Name",
    nicknameReadonlyHint: "Name comes from the scorecard. Go back to edit it there.",
    course: "Course / event",
    date: "Date",
    extra: "Additional info",
    textFont: "Text font",
    textColor: "Text color",
    textSize: "Active text size",
    brand: "Brand text",
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
  const index = FONT_OPTIONS.findIndex((font) => font.id === fontId);
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
      value: defaultConfig.localSegmentationModel
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
    templatePreviewOpen: false,
    largeEdit: false,
    activeIdentity: "nickname",
    activeEditTarget: "",
    activeEditLabel: COPY.zh.noSelection,
    activeElementScale: 100,
    activeElementScaleDisabled: true,
    photoStatus: COPY.zh.waitingPhoto,
    fontOptions: FONT_OPTIONS,
    colorOptions: COLOR_OPTIONS,
    totalTab: "total",
    paletteOptions: [],
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
      scoreMode: "relative",
      scoringStyle: "pga",
      scoreInput: "",
      badge: "",
      scorecardScale: 100,
      autoTotal: true,
      roundPar: 72,
      relativeTotal: "",
      relativeTotalColor: "#dc3f4d",
      relativeTotalSize: 200,
      totalValue: "",
      totalHint: COPY.zh.totalEmpty,
      totalOpacity: 90,
      totalSize: 500,
      totalAbove: false,
      nickname: "",
      course: "",
      date: "",
      extra: "",
      brand: "GOLFBROTHERS",
      identitySize: 38,
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
      this.setData({ "form.brand": this.posterState.identity.brand });
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
      this.posterState = createPosterModel("academy", false, "GOLFBROTHERS");
      this.posterCanvas = null;
      this.posterContext = null;
      this.segmentationCanvas = null;
      this.templateCanvas = null;
      this.templateContext = null;
      this.canvasRect = null;
      this.sceneBounds = {};
      this.gesture = null;
      this.renderPending = false;
      this.returnToSummary = false;
      this.segmentationFailure = null;
      this._posterReady = false;
      this._draftRestoredKey = "";
      this._draftRestoreLock = null;
      this._discardDraft = false;
      this._loadedFontFamilies = {};
      this._posterFontsPromise = null;
    },

    attached() {
      const language = this.properties.initialLanguage === "en" ? "en" : "zh";
      this.posterState.identity.brand = this.properties.brand || "GOLFBROTHERS";
      this._posterReady = true;
      this._applyScoreFromRound(this.properties.roundId);
      this._applyLanguage(language);
      this._syncAllControls();
      this.restoreDraft();
      this._ensurePosterFonts().then(() => this._render());
    },

    detached() {
      this.saveDraft();
    }
  },

  pageLifetimes: {
    hide() {
      this.saveDraft();
    }
  },

  methods: {
    saveDraft() {
      if (this._discardDraft) return false;
      const roundId = String(this.properties.roundId || "").trim();
      if (!roundId || !this.posterState) return false;
      return savePosterDraft({
        roundId,
        step: this.data.step,
        templateId: this.data.selectedTemplateId || this.posterState.templateId || "academy",
        photoPath: this.posterState.photoPath || "",
        largeEdit: Boolean(this.data.largeEdit),
        posterState: this.posterState,
        updatedAt: Date.now()
      });
    },

    _saveDraft() {
      return this.saveDraft();
    },

    clearDraft() {
      this._discardDraft = true;
      this._draftRestoredKey = "";
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
      const templateId = draft.templateId || saved.templateId || "academy";
      const merged = Object.assign(
        createPosterModel(templateId, false, this.properties.brand),
        saved
      );
      merged.photo = null;
      merged.subject = null;
      merged.badge = "";
      merged.photoPath = draft.photoPath || saved.photoPath || "";
      merged.templateId = templateId;
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
      this._updateStepMeta();
      this._syncAllControls();
      if (safeStep <= 0) return true;

      try {
        await this._initPosterCanvas();
      } catch (error) {
        console.warn("[golf-poster] draft canvas init failed", error);
        return true;
      }

      if (this.posterState.photoPath) {
        try {
          this.posterState.photo = await this._loadCanvasImage(this.posterState.photoPath);
        } catch (error) {
          console.warn("[golf-poster] draft photo missing", error);
          this.posterState.photoPath = "";
          this.posterState.photo = null;
          this.posterState.segmentationStatus = "idle";
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

      if (this.posterState.photo && this.posterState.segmentationStatus === "person") {
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
      if (code === "LOCAL_INFERENCE_REAL_DEVICE_REQUIRED") label = copy.localRealDeviceRequired;
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
      this.setData({
        selectedTemplateId: templateId,
        templatePreviewOpen: true
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
          this._renderNow();
          this._refreshCanvasRect();
          this.saveDraft();
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
        this._updateStepMeta();
        this._syncAllControls();
        this._render();
        this._refreshCanvasRect();
      });
    },

    openLargeEdit() {
      const stepTarget = this._gestureTarget();
      this.setData({
        largeEdit: true,
        activeEditTarget: stepTarget || (this.posterState.total.value ? "total" : "scorecard")
      }, () => {
        this._updateStepMeta();
        this._syncLargeEdit();
        const afterLayout = () => {
          this._refreshCanvasRect();
          this._renderNow();
        };
        if (typeof wx.nextTick === "function") wx.nextTick(afterLayout);
        else setTimeout(afterLayout, 16);
      });
    },

    closeLargeEdit() {
      this.setData({
        largeEdit: false,
        activeEditTarget: "",
        activeElementScaleDisabled: true
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

    resetPoster() {
      wx.showModal({
        title: this.data.copy.reset,
        content: this.data.language === "en"
          ? "Reset the poster and return to template selection?"
          : "清空当前海报并返回模板选择？",
        success: (result) => {
          if (!result.confirm) return;
          clearPosterDraft();
          this._draftRestoredKey = "";
          this.posterState = createPosterModel("academy", false, this.properties.brand);
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
        sizeType: ["original", "compressed"],
        success: (result) => {
          const file = result.tempFiles && result.tempFiles[0];
          if (file) this._loadPhoto(file.tempFilePath);
        }
      });
    },

    async _loadPhoto(filePath) {
      try {
        const image = await this._loadCanvasImage(filePath);
        this.posterState.photo = image;
        this.posterState.photoPath = filePath;
        this.posterState.subject = null;
        this.posterState.segmentationStatus = "loading";
        this.posterState.segmentationSource = "none";
        this.segmentationFailure = null;
        this.posterState.image.scale = 1;
        this.posterState.image.x = 0;
        this.posterState.image.y = 0;
        this.setData({
          photoStatus: this.data.copy.segmenting,
          "form.photoScale": 100
        });
        this._render();
        this.triggerEvent("segmentationstart", { filePath });
        await this._runSegmentation(filePath);
        this.saveDraft();
      } catch (error) {
        wx.showToast({ title: this.data.copy.segmentFailed, icon: "none" });
      }
    },

    async _runSegmentation(filePath) {
      try {
        const result = await requestSubjectCutout({
          filePath,
          mode: this.properties.segmentationMode,
          localModel: this.properties.localSegmentationModel,
          canvas: this.segmentationCanvas,
          endpoint: this.properties.segmentationEndpoint,
          headers: this.properties.segmentationHeaders,
          quality: this.properties.segmentationQuality,
          onStatus: (status) => this._showLocalSegmentationStatus(status)
        });
        if (result.status === "person" && result.filePath) {
          this.segmentationFailure = null;
          this.posterState.subject = await this._loadCanvasImage(result.filePath);
          this.posterState.segmentationStatus = "person";
          this.posterState.segmentationSource = result.source || "hd";
        } else {
          this.segmentationFailure = null;
          this.posterState.subject = null;
          this.posterState.segmentationStatus = "fallback";
          this.posterState.segmentationSource = "none";
        }
      } catch (error) {
        this.segmentationFailure = {
          code: error.code || "LOCAL_INFERENCE_FAILED",
          message: error.message || error.errMsg || String(error),
          detail: error.detail
            ? (error.detail.errMsg || error.detail.message || String(error.detail))
            : ""
        };
        console.warn("Subject segmentation failed:", this.segmentationFailure);
        this.posterState.subject = null;
        this.posterState.segmentationStatus = "fallback";
        this.posterState.segmentationSource = "none";
        wx.showToast({ title: this.data.copy.segmentFailed, icon: "none" });
      }
      this.setData({
        photoStatus: this._photoStatusText(this.posterState.segmentationStatus)
      });
      this.triggerEvent("segmentationend", {
        status: this.posterState.segmentationStatus,
        source: this.posterState.segmentationSource,
        error: this.segmentationFailure
      });
      this._render();
    },

    _showLocalSegmentationStatus(status) {
      if (!status || this.posterState.segmentationStatus !== "loading") return;
      const copy = this.data.copy;
      let label = copy.segmenting;
      if (status.stage === "model-download") {
        const progress = status.progress > 0 ? ` ${Math.round(status.progress)}%` : "";
        label = `${copy.localModelDownloading}${progress}`;
      } else if (status.stage === "model-load") {
        label = copy.localModelLoading;
      } else if (status.stage === "model-fallback") {
        label = copy.localFallbackLoading;
      } else if (status.stage === "inference") {
        label = copy.localInferencing;
      } else if (status.stage === "refining") {
        label = copy.localRefining;
      }
      this.setData({ photoStatus: label });
    },

    retrySegmentation() {
      if (!this.posterState.photoPath) {
        this.choosePhoto();
        return;
      }
      this.posterState.segmentationStatus = "loading";
      this.posterState.segmentationSource = "none";
      this.segmentationFailure = null;
      this.setData({ photoStatus: this.data.copy.segmenting });
      this._runSegmentation(this.posterState.photoPath);
    },

    async applySubjectCutout(filePath, hasPerson) {
      if (!hasPerson || !filePath) {
        this.segmentationFailure = null;
        this.posterState.subject = null;
        this.posterState.segmentationStatus = "fallback";
        this.posterState.segmentationSource = "none";
      } else {
        this.segmentationFailure = null;
        this.posterState.subject = await this._loadCanvasImage(filePath);
        this.posterState.segmentationStatus = "person";
        this.posterState.segmentationSource = "hd";
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
      });
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

    selectPalette(event) {
      applyPalette(this.posterState, event.currentTarget.dataset.id);
      ensureTotalDisplayModel(this.posterState);
      this._rebuildPaletteOptions();
      this._rebuildColorControls();
      this._syncIdentityForm();
      this._render();
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
      applyMarkerPreset(this.posterState, style);
      this.setData({ "form.scoringStyle": style });
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

    onScorecardScale(event) {
      this.posterState.scorecard.scale = Number(event.detail.value) / 100;
      this.setData({ "form.scorecardScale": Number(event.detail.value) });
      this._render();
    },

    onAlignScorecardCenter() {
      const template = TEMPLATES[this.posterState.templateId] || TEMPLATES.academy;
      const base = template.layout && template.layout.score;
      const scale = this.posterState.scorecard.scale || 1;
      const width = (base && base.w ? base.w : 0) * scale;
      const left = (POSTER_WIDTH - width) / 2;
      // scorecard.x 是成绩卡中心点
      this.posterState.scorecard.x = left + width / 2;
      this._render();
    },

    selectColor(event) {
      const styleKey = event.currentTarget.dataset.key;
      const value = event.currentTarget.dataset.value;
      this.posterState.paletteId = "custom";
      const keys = COLOR_KEY_GROUPS[styleKey] || [styleKey];
      const mode = this.posterState.scoringStyle === "dp" ? "dp" : "pga";
      ensureColorPresets(this.posterState);
      keys.forEach((key) => {
        this.posterState.style[key] = value;
        if (MARKER_STYLE_KEYS.indexOf(key) >= 0) {
          this.posterState.colorPresets[mode][key] = value;
        }
      });
      const patch = {};
      if (styleKey === "relativeTotalColor") patch["form.relativeTotalColor"] = value;
      this._rebuildColorControls();
      this._rebuildPaletteOptions();
      if (Object.keys(patch).length) this.setData(patch);
      this._render();
    },

    onToggleRelativeTotal() {
      const cleared = !this.data.relativeTotalCleared;
      this.posterState.relativeTotalCleared = cleared;
      if (cleared) {
        this.posterState.toPar = undefined;
        if (this.posterState.relativeTotal) this.posterState.relativeTotal.value = "";
        this.setData({
          relativeTotalCleared: true,
          "form.relativeTotal": ""
        });
      } else {
        this._updateRelativeTotal();
      }
      this._render();
    },

    _updateRelativeTotal() {
      this.posterState.relativeTotalCleared = false;
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
        relativeTotalCleared: false,
        "form.relativeTotal": display
      });
    },

    onAutoTotalChange(event) {
      this.posterState.autoTotal = Boolean(event.detail.value);
      this.setData({ "form.autoTotal": this.posterState.autoTotal });
      this._updateAutoTotal();
    },

    onRoundParInput(event) {
      const value = Number.parseInt(event.detail.value, 10);
      this.posterState.roundPar = Number.isFinite(value) ? clamp(value, 1, 180) : null;
      this.setData({ "form.roundPar": event.detail.value });
      this._updateAutoTotal();
    },

    onTotalInput(event) {
      if (this.posterState.autoTotal) return;
      this.posterState.total.value = event.detail.value;
      this.setData({ "form.totalValue": event.detail.value });
      if (!this.posterState.relativeTotalCleared) this._updateRelativeTotal();
      this._render();
    },

    switchTotalTab(event) {
      const tab = event.currentTarget.dataset.tab === "relative" ? "relative" : "total";
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

    onTotalColorSelect(event) {
      const color = event.currentTarget.dataset.color;
      this.posterState.total.color = color;
      this.posterState.style.total = color;
      this.posterState.paletteId = "custom";
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
      this.posterState.relativeTotal.color = color;
      this.posterState.style.relativeTotalColor = color;
      this.setData({ "form.relativeTotalColor": color });
      this.posterState.paletteId = "custom";
      this._rebuildColorControls();
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
      if (key === "brand") this.posterState.identity.brand = event.detail.value;
      this._render();
    },

    onDateChange(event) {
      this.posterState.identity.date.value = event.detail.value;
      this.setData({ "form.date": event.detail.value });
      this._render();
    },

    onBrandInput(event) {
      this.posterState.identity.brand = event.detail.value;
      this.setData({ "form.brand": event.detail.value });
      this._render();
    },

    onTextFontChange(event) {
      const index = Number(event.detail.value);
      this.posterState.identity[this.data.activeIdentity].font = FONT_OPTIONS[index].id;
      this.setData({ textFontIndex: index });
      this._render();
    },

    selectTextColor(event) {
      const value = event.currentTarget.dataset.value;
      this.posterState.identity[this.data.activeIdentity].color = value;
      this.posterState.paletteId = "custom";
      this._rebuildColorControls();
      this._rebuildPaletteOptions();
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
          this._syncStickerControls();
          this._render();
          this.saveDraft();
        }
      });
    },

    selectSticker(event) {
      this.posterState.selectedStickerId = event.currentTarget.dataset.id;
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
      const last = this.posterState.stickers[this.posterState.stickers.length - 1];
      this.posterState.selectedStickerId = last ? last.id : "";
      this._syncStickerControls();
      this._render();
    },

    onCanvasTouchStart(event) {
      if (!this.canvasRect || !event.touches.length) return;
      const points = this._posterTouchPoints(event.touches);
      let target = this._gestureTarget();
      if (this.data.largeEdit && points.length === 1) {
        const selected = hitTest(this.sceneBounds, points[0]);
        if (selected) {
          target = selected;
          this.setData({ activeEditTarget: selected }, () => this._syncLargeEdit());
        }
      }
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
      this.setData({ saving: true });
      wx.showLoading({ title: this.data.copy.saving, mask: true });
      try {
        const tempFilePath = await this._exportPoster();
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
          destWidth: POSTER_WIDTH,
          destHeight: POSTER_HEIGHT,
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

    _gestureTarget() {
      if (this.data.largeEdit) return this.data.activeEditTarget;
      if (this.data.step === 1) return "photo";
      if (this.data.step === 2) return "scorecard";
      if (this.data.step === 3) {
        return this.data.totalTab === "relative" ? "relativeTotal" : "total";
      }
      if (this.data.step === 4) return this.data.activeIdentity;
      if (this.data.step === 5 && this.posterState.selectedStickerId) {
        return `sticker:${this.posterState.selectedStickerId}`;
      }
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
        this.posterState.identity[target].x += dx;
        this.posterState.identity[target].y += dy;
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
        }));
      }
      if (!this.segmentationCanvas) {
        tasks.push(this._queryCanvas("#segmentationCanvas").then((result) => {
          this.segmentationCanvas = result.node;
          this.segmentationCanvas.width = 1;
          this.segmentationCanvas.height = 1;
        }));
      }
      return Promise.all(tasks).then(() => this._ensurePosterFonts());
    },

    _loadFont(family) {
      return new Promise((resolve) => {
        const source = GOOGLE_FONT_FACES[family];
        if (!source) {
          resolve();
          return;
        }
        if (this._loadedFontFamilies[family]) {
          resolve();
          return;
        }
        wx.loadFontFace({
          global: true,
          family,
          source,
          scopes: ["webview", "native"],
          success: () => {
            this._loadedFontFamilies[family] = true;
            console.log("[font] 加载成功:", family);
            resolve();
          },
          fail: (err) => {
            console.warn("[font] 加载失败:", family, err);
            resolve();
          }
        });
      });
    },

    _ensurePosterFonts() {
      if (!this._posterFontsPromise) {
        this._posterFontsPromise = Promise.all(
          Object.keys(GOOGLE_FONT_FACES).map((family) => this._loadFont(family))
        );
      }
      return this._posterFontsPromise;
    },

    _initTemplateCanvas(templateId) {
      this._ensurePosterFonts().then(() => this._queryCanvas("#templatePreviewCanvas")).then((result) => {
        this.templateCanvas = result.node;
        this.templateCanvas.width = POSTER_WIDTH;
        this.templateCanvas.height = POSTER_HEIGHT;
        this.templateContext = this.templateCanvas.getContext("2d");
        const sample = createPosterModel(templateId, true, this.properties.brand);
        renderPoster(this.templateContext, sample, { showGuide: false });
      });
    },

    _queryCanvas(selector) {
      return new Promise((resolve, reject) => {
        this.createSelectorQuery()
          .select(selector)
          .fields({ node: true, size: true })
          .exec((result) => {
            if (!result[0] || !result[0].node) {
              reject(new Error(`Canvas not found: ${selector}`));
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

    _loadCanvasImage(filePath) {
      return new Promise((resolve, reject) => {
        if (!this.posterCanvas) {
          reject(new Error("Poster canvas is not initialized"));
          return;
        }
        const image = this.posterCanvas.createImage();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = filePath;
      });
    },

    _guideTarget() {
      if (this.data.largeEdit) return this.data.activeEditTarget;
      return this._gestureTarget();
    },

    _render() {
      if (!this.posterContext || this.renderPending) return;
      this.renderPending = true;
      const draw = () => {
        this.renderPending = false;
        this._renderNow();
      };
      if (this.posterCanvas && typeof this.posterCanvas.requestAnimationFrame === "function") {
        this.posterCanvas.requestAnimationFrame(draw);
      } else {
        setTimeout(draw, 16);
      }
    },

    _renderNow(exporting) {
      if (!this.posterContext) return;
      this.sceneBounds = renderPoster(this.posterContext, this.posterState, {
        showGuide: !exporting && (this.data.largeEdit || this.data.step > 0 && this.data.step < 6),
        guideTarget: this._guideTarget()
      });
    },

    _updateAutoTotal() {
      if (this.posterState.autoTotal) {
        const result = calculateTotal(this.posterState);
        this.posterState.total.value = result.total === null ? "" : String(result.total);
        const hint = result.total === null
          ? this.data.copy.totalEmpty
          : this.posterState.scoreMode === "relative"
            ? `${result.count} · ${result.relative > 0 ? "+" : ""}${result.relative} · ${result.total}`
            : `${result.count} · ${result.total}`;
        this.setData({
          "form.totalValue": this.posterState.total.value,
          "form.totalHint": hint
        });
      }
      if (!this.posterState.relativeTotalCleared) this._updateRelativeTotal();
      this._render();
    },

    _rebuildPaletteOptions(languageArg) {
      const language = languageArg || this.data.language;
      const template = TEMPLATES[this.posterState.templateId];
      const options = template.paletteIds.map((id) => {
        const palette = PALETTES[id];
        return {
          id,
          name: language === "en" ? palette.en : palette.zh,
          total: palette.total,
          card: palette.card,
          line: palette.line,
          active: this.posterState.paletteId === id
        };
      });
      this.setData({ paletteOptions: options });
    },

    _colorOptions(styleKey, language) {
      let current;
      if (styleKey === "total") {
        current = String((this.posterState.total && this.posterState.total.color) || this.posterState.style.total || "#ce9224").toLowerCase();
      } else if (styleKey === "relativeTotalColor") {
        current = String((this.posterState.relativeTotal && this.posterState.relativeTotal.color) || this.posterState.style.relativeTotalColor || "#dc3f4d").toLowerCase();
      } else {
        const mapped = COLOR_KEY_SOURCES[styleKey] || styleKey;
        const fallback = this.posterState.style.total || "#ce9224";
        current = String(this.posterState.style[mapped] || fallback).toLowerCase();
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
      const rowDefinitions = this.posterState.scoringStyle === "pga"
        ? [
          ["scoreText", copy.numbers],
          ["pgaUnder", copy.pgaBirdieGroup],
          ["pgaOver", copy.pgaBogeyGroup]
        ]
        : [
          ["scoreText", copy.numbers],
          ["eagleMarker", copy.eagle],
          ["underMarker", copy.birdie],
          ["overMarker", copy.bogey],
          ["doubleBogeyMarker", copy.doubleBogey]
        ];
      const scoreColorRows = rowDefinitions.map(([key, label]) => ({
        key,
        label,
        options: this._colorOptions(key, language)
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

    _syncIdentityForm() {
      const item = this.posterState.identity[this.data.activeIdentity];
      this.setData({
        "form.identitySize": Math.round(item.size),
        textFontIndex: fontIndex(item.font)
      });
      this._rebuildColorControls();
    },

    _syncAllControls() {
      const model = this.posterState;
      model.badge = "";
      ensureTotalDisplayModel(model);
      const calculation = calculateTotal(model);
      if (model.autoTotal) model.total.value = calculation.total === null ? "" : String(calculation.total);
      if (!model.relativeTotalCleared) {
        if (calculation.relative !== null && calculation.relative !== undefined) {
          model.toPar = calculation.relative;
        } else {
          const totalNum = Number(model.total.value);
          const par = Number(model.roundPar || 72);
          model.toPar = Number.isFinite(totalNum) && Number.isFinite(par) ? totalNum - par : undefined;
        }
        const display = formatToParDisplay(model.toPar);
        if (model.relativeTotal) model.relativeTotal.value = display;
      }
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
          scoreMode: model.scoreMode,
          scoringStyle: model.scoringStyle,
          scoreInput: formatScoreInput(model.scoreSets[model.scoreMode]),
          badge: "",
          scorecardScale: Math.round(model.scorecard.scale * 100),
          autoTotal: model.autoTotal,
          roundPar: model.roundPar,
          relativeTotal: model.relativeTotalCleared ? "" : formatToParDisplay(model.toPar),
          relativeTotalColor: (model.relativeTotal && model.relativeTotal.color) || model.style.relativeTotalColor,
          relativeTotalSize: Math.round((model.relativeTotal && model.relativeTotal.size) || 200),
          totalValue: model.total.value,
          totalHint: hint,
          totalOpacity: Math.round(model.total.opacity),
          totalSize: Math.round(model.total.size),
          totalAbove: model.total.aboveSubject,
          nickname: model.identity.nickname.value,
          course: model.identity.course.value,
          date: model.identity.date.value,
          extra: model.identity.extra.value,
          brand: model.identity.brand,
          identitySize: Math.round(model.identity[this.data.activeIdentity].size),
          stickerScale: this._selectedSticker() ? Math.round(this._selectedSticker().scale * 100) : 100
        },
        textFontIndex: fontIndex(model.identity[this.data.activeIdentity].font),
        relativeTotalCleared: Boolean(model.relativeTotalCleared)
      });
      this._rebuildPaletteOptions();
      this._rebuildColorControls();
      this._syncStickerControls();
      if (this.data.largeEdit) this._syncLargeEdit();
    }
  }
});
