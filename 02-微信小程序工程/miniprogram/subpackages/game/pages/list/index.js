const { createHeaderStyle } = require("../../../../utils/headerEngine.js");
const session = require("../../utils/sideGameBind.js");
const nav = require("../../utils/nav.js");
const pageBoot = require("../../utils/pageBoot.js");
const configGuard = require("../../utils/sideGameConfigGuard.js");
const setupListDirty = require("../../utils/setupListDirty.js");

const CANCEL_TITLE = "取消设置";
const CANCEL_CONTENT = "返回后，本次未保存的游戏设置将不会保留，是否确认返回？";

Page(pageBoot.bindPageTheme({
  data: {
    headerRootStyle: "",
    headerBarStyle: "",
    entry: "score",
    maxPlayers: 4,
    matchId: "",
    groupId: "",
    scope: "group",
    canEdit: true,
    canView: true,
    pageMode: "edit",
    readonlyHint: "",
    themeClass: ""
  },

  applyTheme() {
    pageBoot.applyTheme(this);
  },

  onLoad(query) {
    const host = session.ensureHost(query);
    if (!host) return;
    const header = createHeaderStyle();
    const ctx = pageBoot.parseQuery(query);
    const entry =
      (query && query.entry) ||
      (host.scope === "match" || ctx.scope === "match" ? "match" : "score");
    session.ensureSetupDraft(entry);
    const maxPlayers =
      entry === "hub" || entry === "match"
        ? session.getRuleDesignCap(entry)
        : session.getRuleCap(entry);
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle,
      entry: entry,
      maxPlayers: maxPlayers,
      matchId: ctx.matchId || host.matchId || "",
      groupId: ctx.groupId || host.groupId || "",
      scope: ctx.scope || host.scope || "group"
    });
    this._hostQuery = ctx;
    this._committed = false;
    this.applyTheme();
    configGuard.attach(this, {
      host: host,
      leaveTitle: CANCEL_TITLE,
      leaveMessage: CANCEL_CONTENT,
      getBusiness: setupListDirty.setupBusiness,
      onDiscard: function () {
        session.discardSetupDraft();
      }
    });
    this._captureInitialSnapshot();
  },

  onShow() {
    this.applyTheme();
    if (this._hostQuery) session.attachHost(this._hostQuery);
    if (!this._committed) session.ensureSetupDraft(this.data.entry);
    this.refreshGames();
    if (this._refreshDirty) this._refreshDirty();
    if (this._rebuildInitialIfPristine) this._rebuildInitialIfPristine();
  },

  refreshGames() {
    const list = this.selectComponent("#gameList");
    if (list && typeof list.reload === "function") {
      list.reload();
    }
  },

  onCommitSetup() {
    if (this._assertCanEdit && !this._assertCanEdit()) return;
    const list = this.selectComponent("#gameList");
    if (list && list.data && !list.data.canConfirmSetup) return;
    if (this._setupSaving) return;
    this._setupSaving = true;
    if (list) list.setData({ setupSaving: true });
    let out = null;
    try {
      out = session.commitSetupDraft(this.data.entry);
    } finally {
      this._setupSaving = false;
      if (list) list.setData({ setupSaving: false });
    }
    if (!out || !out.ok) {
      wx.showToast({ title: (out && out.message) || "保存失败", icon: "none" });
      return;
    }
    this._committed = true;
    if (this._markSaved) this._markSaved();
    nav.navigateBackSafe(1);
  },

  confirmLeaveSetup() {
    const self = this;
    this._leaveIfClean(function () {
      self._committed = true;
      session.discardSetupDraft();
      nav.navigateBackSafe(1);
    });
  },

  onBack() {
    this.confirmLeaveSetup();
  },

  onUnload() {
    configGuard.enableUnloadAlert(false);
    if (!this._committed) session.discardSetupDraft();
  }
}));
