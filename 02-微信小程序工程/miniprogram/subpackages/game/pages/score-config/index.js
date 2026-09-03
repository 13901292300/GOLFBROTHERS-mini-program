const { createHeaderStyle } = require("../../../../utils/headerEngine.js");
const catalog = require("../../utils/catalog.js");
const letter = require("../../utils/letter.js");
const nav = require("../../utils/nav.js");
const session = require("../../utils/sideGameBind.js");
const configGuard = require("../../utils/sideGameConfigGuard.js");
const scoreMapUtil = require("../../utils/sideGameScoreMap.js");
const numField = require("../../utils/numField.js");

function scoreToneOf(code, defaultCode) {
  const def = String(defaultCode || "8421");
  const raw = String(code == null || code === "" ? def : code);
  if (raw === def) return "default";
  const n = Number(raw);
  const d = Number(def);
  if (!isFinite(n) || !isFinite(d)) return "default";
  if (n < d) return "low";
  if (n > d) return "high";
  return "default";
}

function decoratePlayers(players, defaultCode) {
  return (players || []).map(function (item) {
    const face = session.presentPerson(item && item.id);
    const code = item.scoreCode || defaultCode || "8421";
    return Object.assign({}, item, {
      id: face.id,
      name: face.name,
      avatar: face.avatar,
      members: face.members,
      partyType: face.partyType,
      faceKind: face.faceKind,
      memberPlayerIds: face.memberPlayerIds,
      memberAvatars: face.memberAvatars,
      memberNames: face.memberNames,
      scoreCode: code,
      scoreTone: scoreToneOf(code, defaultCode),
      selected: true
    });
  });
}

function rebuildView(players, defaultCode) {
  const list = decoratePlayers(players, defaultCode);
  return {
    players: list,
    groups: letter.groupByLetter(list)
  };
}

function defaultDeduct(snapshot) {
  const s = snapshot || {};
  return {
    deductMode: s.deductMode === "none" ? "none" : "on",
    deductWay: s.deductWay === "doublepar-n" ? "doublepar-n" : "plus-n",
    deductPlusN: s.deductPlusN != null && s.deductPlusN !== "" ? String(s.deductPlusN) : "4",
    deductDoubleN: s.deductDoubleN != null && s.deductDoubleN !== "" ? String(s.deductDoubleN) : "0",
    deductCap: s.deductCap === "cap" ? "cap" : "none",
    deductCapN: s.deductCapN != null && s.deductCapN !== "" ? String(s.deductCapN) : "3"
  };
}

function pickDeduct(src, fallback) {
  if (!src || (src.deductMode == null && src.deductWay == null && src.deductCap == null)) {
    return Object.assign({}, fallback);
  }
  return {
    deductMode: src.deductMode === "none" ? "none" : "on",
    deductWay: src.deductWay === "doublepar-n" ? "doublepar-n" : "plus-n",
    deductPlusN: src.deductPlusN != null && src.deductPlusN !== "" ? String(src.deductPlusN) : fallback.deductPlusN,
    deductDoubleN:
      src.deductDoubleN != null && src.deductDoubleN !== "" ? String(src.deductDoubleN) : fallback.deductDoubleN,
    deductCap: src.deductCap === "cap" ? "cap" : "none",
    deductCapN: src.deductCapN != null && src.deductCapN !== "" ? String(src.deductCapN) : fallback.deductCapN
  };
}

function deductThumb(d) {
  if (!d || d.deductMode === "none") return "";
  const way =
    d.deductWay === "doublepar-n"
      ? catalog.doubleParMark(d.deductDoubleN)
      : "从+" + (d.deductPlusN || "4");
  const cap = d.deductCap === "cap" ? (d.deductCapN || "3") + "分封顶" : "不封顶";
  return way + " · " + cap;
}

function isNonNegInt(value) {
  return /^(0|[1-9]\d*)$/.test(String(value == null ? "" : value).trim());
}

Page({
  data: {
    headerRootStyle: "",
    headerBarStyle: "",
    players: [],
    groups: [],
    defaultScoreCode: "8421",
    showInstanceDeduct: true,
    scorePresets: catalog.SCORE_PRESETS || [],
    showScoreSheet: false,
    scorePlayerIndex: -1,
    scorePlayerName: "",
    scorePlayerAvatar: "",
    scorePlayerFace: {},
    scoreDraft: "",
    scoreUsingCustom: false,
    customScore: "",
    customPlaceholder: "自定义",
    deductMode: "on",
    deductWay: "plus-n",
    deductPlusN: "4",
    deductDoubleN: "0",
    deductCap: "none",
    deductCapN: "3",
    foldDeduct: false,
    deductText: "",
    canEdit: true,
    canView: true,
    pageMode: "edit",
    readonlyHint: ""
  },

  onLoad(query) {
    if (!session.ensureHost(query)) return;
    const header = createHeaderStyle();
    this._channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    this._deductFallback = defaultDeduct(null);
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle
    });
    if (this._channel && this._channel.on) {
      this._channel.on("init", (payload) => {
        if (payload && payload.entry && !session.requireSetupDraft(payload.entry)) return;
        this.bootstrap(payload || {});
      });
    }
  },

  bootstrap(payload) {
    const defaultScoreCode = payload.defaultScoreCode || "8421";
    this._deductFallback = defaultDeduct(payload.ruleSnapshot);
    const players = (payload.players || []).map(function (item) {
      const deduct = pickDeduct(item, defaultDeduct(payload.ruleSnapshot));
      const hyd = scoreMapUtil.hydratePlayerScore(item);
      return Object.assign({}, item, deduct, {
        scoreCode: hyd.scoreCode || defaultScoreCode,
        scoreRows: item.scoreRows || null,
        selected: true
      });
    });
    this.setData(
      Object.assign(
        {
          defaultScoreCode: defaultScoreCode,
          showInstanceDeduct: payload.showInstanceDeduct !== false,
          scorePresets:
            payload.scorePresets && payload.scorePresets.length
              ? payload.scorePresets
              : catalog.SCORE_PRESETS
        },
        rebuildView(players, defaultScoreCode)
      )
    );
    if (!this._configGuard) {
      configGuard.attach(this, {});
    }
    if (this._captureInitialSnapshot) this._captureInitialSnapshot();
  },

  openScore(e) {
    const id = e.currentTarget.dataset.id;
    const idx = (this.data.players || []).findIndex(function (item) {
      return item.id === id;
    });
    const player = idx >= 0 ? this.data.players[idx] : {};
    const code = player.scoreCode || this.data.defaultScoreCode || "8421";
    const isPreset = (this.data.scorePresets || []).indexOf(code) >= 0;
    const deduct = pickDeduct(player, this._deductFallback);
    this.setData({
      showScoreSheet: true,
      scorePlayerIndex: idx,
      scorePlayerName: session.presentPerson(player.id).name,
      scorePlayerAvatar: session.presentPerson(player.id).avatar,
      scorePlayerFace: session.presentPerson(player.id),
      scoreDraft: isPreset ? code : "",
      scoreUsingCustom: !isPreset,
      customScore: isPreset ? "" : code,
      customPlaceholder: isPreset ? "自定义" : "",
      deductMode: deduct.deductMode,
      deductWay: deduct.deductWay,
      deductPlusN: deduct.deductPlusN,
      deductDoubleN: deduct.deductDoubleN,
      deductCap: deduct.deductCap,
      deductCapN: deduct.deductCapN,
      foldDeduct: false,
      deductText: deductThumb(deduct)
    });
  },

  closeScore() {
    this.setData({ showScoreSheet: false });
  },

  pickPreset(e) {
    this.setData({
      scoreDraft: e.currentTarget.dataset.value,
      scoreUsingCustom: false,
      customScore: "",
      customPlaceholder: "自定义"
    });
  },

  onCustomFocus() {
    this.setData({
      scoreUsingCustom: true,
      scoreDraft: "",
      customPlaceholder: ""
    });
  },

  onCustomBlur() {
    if (String(this.data.customScore || "").trim()) return;
    this.setData({ customPlaceholder: "自定义" });
  },

  onCustomScore(e) {
    this.setData({
      customScore: e.detail.value,
      scoreUsingCustom: true,
      scoreDraft: ""
    });
  },

  toggleFoldDeduct() {
    this.setData({ foldDeduct: !this.data.foldDeduct });
  },

  setDeductMode(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({
      deductMode: value,
      foldDeduct: value === "on" ? this.data.foldDeduct : false,
      deductText: deductThumb(Object.assign({}, this.data, { deductMode: value }))
    });
  },

  setDeductWay(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({
      deductWay: value,
      deductText: deductThumb(Object.assign({}, this.data, { deductWay: value }))
    });
  },

  keepDeductWay(e) {
    this.setDeductWay(e);
  },

  setDeductCap(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({
      deductCap: value,
      deductText: deductThumb(Object.assign({}, this.data, { deductCap: value }))
    });
  },

  keepDeductCap(e) {
    this.setDeductCap(e);
  },

  onDeductPlusN(e) {
    this.setData({
      deductPlusN: e.detail.value,
      deductText: deductThumb(Object.assign({}, this.data, { deductPlusN: e.detail.value }))
    });
  },

  onDeductDoubleN(e) {
    this.setData({
      deductDoubleN: e.detail.value,
      deductText: deductThumb(Object.assign({}, this.data, { deductDoubleN: e.detail.value }))
    });
  },

  onDeductCapN(e) {
    this.setData({
      deductCapN: e.detail.value,
      deductText: deductThumb(Object.assign({}, this.data, { deductCapN: e.detail.value }))
    });
  },

  applyCustomScore() {
    const custom = String(this.data.customScore || "").trim();
    if (custom && !/^\d{4,5}$/.test(custom)) {
      wx.showToast({ title: "请输入4-5位数字", icon: "none" });
      return;
    }
    if (this.data.showInstanceDeduct && this.data.deductMode !== "none") {
      if (this.data.deductWay !== "doublepar-n" && !isNonNegInt(this.data.deductPlusN)) {
        wx.showToast({ title: "扣分起点须为非负整数", icon: "none" });
        return;
      }
      if (this.data.deductWay === "doublepar-n" && !isNonNegInt(this.data.deductDoubleN)) {
        wx.showToast({ title: "双帕加数须为非负整数", icon: "none" });
        return;
      }
      if (this.data.deductCap === "cap" && !isNonNegInt(this.data.deductCapN)) {
        wx.showToast({ title: "扣分封顶须为非负整数", icon: "none" });
        return;
      }
    }
    const players = this.data.players.slice();
    const idx = this.data.scorePlayerIndex;
    const player = players[idx];
    if (!player) {
      this.setData({ showScoreSheet: false });
      return;
    }
    let value = player.scoreCode;
    if (custom) value = custom;
    else if (!this.data.scoreUsingCustom && this.data.scoreDraft) value = this.data.scoreDraft;
    player.scoreCode = value;
    if (scoreMapUtil.isValidScoreCode(value)) player.scoreRows = null;
    if (this.data.showInstanceDeduct) {
      Object.assign(player, {
        deductMode: this.data.deductMode === "none" ? "none" : "on",
        deductWay: this.data.deductWay === "doublepar-n" ? "doublepar-n" : "plus-n",
        deductPlusN: this.data.deductPlusN || "4",
        deductDoubleN: this.data.deductDoubleN || "0",
        deductCap: this.data.deductCap === "cap" ? "cap" : "none",
        deductCapN: this.data.deductCapN || "3"
      });
    }
    this.setData(
      Object.assign(rebuildView(players, this.data.defaultScoreCode), {
        showScoreSheet: false
      })
    );
  },

  onNumFocus: numField.onNumFocus,
  onNumInput: numField.onNumInput,
  onNumBlur: numField.onNumBlur,

  onConfirm() {
    if (this._assertCanEdit && !this._assertCanEdit()) return;
    if (this._channel && this._channel.emit) {
      this._channel.emit("done", {
        players: this.data.players || []
      });
    }
    if (this._markSaved) this._markSaved();
    nav.navigateBackSafe(1);
  },

  onBack() {
    if (this._leaveIfClean) {
      this._leaveIfClean(function () {
        nav.navigateBackSafe(1);
      });
      return;
    }
    nav.navigateBackSafe(1);
  }
});
