const { createHeaderStyle } = require("../../../../utils/headerEngine.js");
const catalog = require("../../utils/catalog.js");
const session = require("../../utils/sideGameBind.js");
const nav = require("../../utils/nav.js");

function flattenCatalogIds(groups) {
  const ids = [];
  (groups || []).forEach(function (group) {
    (group.items || []).forEach(function (item) {
      if (item && item.id) ids.push(String(item.id));
    });
  });
  return ids;
}

Page({
  data: {
    headerRootStyle: "",
    headerBarStyle: "",
    entry: "score",
    maxPlayers: 4,
    catalogGroups: []
  },

  onLoad(query) {
    if (!session.ensureHost(query)) return;
    const entry = (query && query.entry) || "score";
    if (!session.requireSetupDraft(entry)) return;
    const header = createHeaderStyle();
    // 规则设计目录不受记分页方数锁死
    const maxPlayers = session.getRuleDesignCap(entry);
    const present = {};
    session.listMyRules(maxPlayers).forEach(function (rule) {
      if (rule && rule.catalogId) present[rule.catalogId] = true;
    });
    const sourceGroups = catalog.listCatalogForDesign();
    const catalogGroups = sourceGroups.map(function (group) {
      return Object.assign({}, group, {
        items: (group.items || []).filter(function (item) {
          return !item.preset || !present[item.id];
        })
      });
    }).filter(function (group) {
      return group.items.length > 0;
    });
    const catalogIds = flattenCatalogIds(sourceGroups);
    const renderedCatalogIds = flattenCatalogIds(catalogGroups);
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle,
      entry: entry,
      maxPlayers: maxPlayers,
      catalogGroups: catalogGroups
    });
    this._catalogDiag = {
      catalogIds: catalogIds,
      renderedCatalogIds: renderedCatalogIds,
      lasuoNInData: renderedCatalogIds.indexOf("lasuo-n") >= 0,
      hornInData: renderedCatalogIds.indexOf("horn") >= 0
    };
  },

  onReady() {
    this.measureCatalogScroll("onReady");
  },

  onShow() {
    this.measureCatalogScroll("onShow");
  },

  measureCatalogScroll(stage) {
    const self = this;
    if (typeof wx === "undefined" || !wx.createSelectorQuery) return;
    try {
      wx.nextTick(function () {
        const q = wx.createSelectorQuery();
        q.select(".catalog-scroll").fields({
          size: true,
          scrollOffset: true,
          computedStyle: ["height", "overflow"]
        });
        q.select(".catalog-page").boundingClientRect();
        q.select("#catalog-row-lasuo-n").boundingClientRect();
        q.select("#catalog-row-horn").boundingClientRect();
        q.exec(function (res) {
          const scroll = (res && res[0]) || {};
          const pageRect = (res && res[1]) || null;
          const lasuoRect = (res && res[2]) || null;
          const hornRect = (res && res[3]) || null;
          const clientHeight = Number(scroll.height) || 0;
          const contentHeight = pageRect && pageRect.height != null ? Number(pageRect.height) : 0;
          const report = Object.assign({}, self._catalogDiag || {}, {
            stage: stage || "",
            lasuoNRendered: !!lasuoRect,
            hornRendered: !!hornRect,
            lasuoNY: lasuoRect ? lasuoRect.top : null,
            hornY: hornRect ? hornRect.top : null,
            scrollClientHeight: clientHeight,
            scrollContentHeight: contentHeight,
            scrollHeight: contentHeight,
            clientHeight: clientHeight,
            canScroll: contentHeight > clientHeight + 1,
            scrollOverflow: scroll.overflow || ""
          });
          self._catalogScrollReport = report;
        });
      });
    } catch (e) {}
  },

  onBack() {
    nav.navigateBackSafe(1);
  },

  onCatalogTap(e) {
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
    const id = String(ds.ruleId || ds.id || "").trim();
    const item = catalog.findRule(id);
    if (!item) {
      wx.showToast({ title: "未找到该玩法", icon: "none" });
      return;
    }
    if (catalog.isUnavailableRule(item)) {
      wx.showToast({ title: "玩法尚未开放", icon: "none" });
      return;
    }
    const rulesUrl = session.withHost(
      "/subpackages/game/pages/rules/index?entry=" +
        this.data.entry +
        "&maxPlayers=" +
        this.data.maxPlayers
    );
    if (catalog.isNoSettings(item)) {
      const existing = session.findMyRuleByName(item.name);
      const saved = existing
        ? existing
        : session.upsertMyRule({
            id: "my-" + Date.now(),
            name: item.name,
            players: Number(item.players || 2),
            catalogId: item.id,
            noSettings: true
          });
      wx.showToast({
        title: existing ? "规则库已有「" + item.name + "」" : "已保存到规则库",
        icon: "none"
      });
      if (typeof nav.callOnPage === "function") {
        nav.callOnPage("pages/rules/index", "reloadRules", saved && saved.id);
      }
      nav.navigateBackTo("pages/rules/index", rulesUrl);
      return;
    }
    wx.navigateTo({
      url: session.withHost(
        "/subpackages/game/pages/edit-rule/index?entry=" +
          this.data.entry +
          "&maxPlayers=" +
          this.data.maxPlayers +
          "&ruleId=" +
          encodeURIComponent(item.id) +
          "&ruleName=" +
          encodeURIComponent(item.name) +
          "&players=" +
          Number(item.players || 2) +
          "&matchPlay=" +
          (item.matchPlay ? "1" : "0")
      ),
      fail: function () {
        wx.showToast({ title: "无法打开规则配置", icon: "none" });
      }
    });
  }
});
