const { createHeaderStyle } = require("../../../../utils/headerEngine.js");
const session = require("../../utils/sideGameBind.js");
const catalog = require("../../utils/catalog.js");
const nav = require("../../utils/nav.js");

function preferGroupKey(playerCap) {
  const n = Number(playerCap) || 0;
  if (n <= 2) return "two";
  if (n === 3) return "three";
  if (n === 4) return "four";
  if (n >= 5) return "multi";
  return "";
}

function groupMyRules(list, openMap, preferId, playerCap) {
  const buckets = [
    { key: "two", title: "2人规则库", items: [] },
    { key: "three", title: "3人规则库", items: [] },
    { key: "four", title: "4人规则库", items: [] },
    { key: "multi", title: "多人规则库", items: [] }
  ];
  (list || []).forEach(function (rule) {
    const n = Number(rule.players) || 0;
    if (n <= 2) buckets[0].items.push(rule);
    else if (n === 3) buckets[1].items.push(rule);
    else if (n === 4) buckets[2].items.push(rule);
    else buckets[3].items.push(rule);
  });
  const groups = buckets.filter(function (bucket) {
    return bucket.items.length > 0;
  });
  let preferKey = "";
  if (preferId) {
    groups.forEach(function (group) {
      const hit = group.items.some(function (rule) {
        return String(rule.id) === String(preferId);
      });
      if (hit) preferKey = group.key;
    });
  }
  if (!preferKey) preferKey = preferGroupKey(playerCap);
  const hasPrefer = !!(preferKey && groups.some(function (group) {
    return group.key === preferKey;
  }));
  const hasOpenMap = !!(openMap && Object.keys(openMap).length);
  groups.forEach(function (group, index) {
    group.count = group.items.length;
    group.renderKey =
      group.key +
      ":" +
      group.items
        .map(function (rule) {
          return rule.id;
        })
        .join(",");
    if (preferId && hasPrefer) {
      group.open = group.key === preferKey;
    } else if (hasOpenMap && Object.prototype.hasOwnProperty.call(openMap, group.key)) {
      group.open = !!openMap[group.key];
    } else if (hasPrefer) {
      group.open = group.key === preferKey;
    } else {
      group.open = index === 0;
    }
  });
  return groups;
}

Page({
  data: {
    headerRootStyle: "",
    headerBarStyle: "",
    entry: "score",
    maxPlayers: 4,
    myRules: [],
    ruleGroups: []
  },

  onLoad(query) {
    if (!session.ensureHost(query)) return;
    const entry = (query && query.entry) || "score";
    if (!session.requireSetupDraft(entry)) return;
    const header = createHeaderStyle();
    // 规则库展示不受方数锁死；创建实例时再按 formation 校验
    const maxPlayers = session.getRuleDesignCap(entry);
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle,
      entry: entry,
      maxPlayers: maxPlayers,
      matchId: (query && query.matchId) || "",
      groupId: (query && query.groupId) || "",
      scope: (query && query.scope) || "group"
    });
  },

  onShow() {
    session.attachHost({
      matchId: this.data.matchId,
      groupId: this.data.groupId,
      scope:
        this.data.entry === "hub" || this.data.entry === "match"
          ? "match"
          : this.data.scope
    });
    this.setData({ maxPlayers: session.getRuleDesignCap(this.data.entry) });
    this.reloadRules();
  },

  reloadRules(preferId) {
    const openMap = {};
    (this.data.ruleGroups || []).forEach(function (group) {
      openMap[group.key] = !!group.open;
    });
    const myRules = session.listMyRules(this.data.maxPlayers).map(function (rule) {
      const unavailable = catalog.isUnavailableRule(rule.catalogId || rule.ruleId);
      return {
        id: rule.id,
        name: rule.name,
        players: rule.players,
        noSettings: !!rule.noSettings || catalog.isNoSettings(rule.catalogId),
        unavailable: unavailable,
        summary: unavailable ? "玩法尚未开放" : catalog.summarizeRule(session.unwrapGameplaySnapshot(rule))
      };
    });
    this.setData({
      myRules: myRules,
      ruleGroups: groupMyRules(myRules, openMap, preferId, this.data.maxPlayers)
    });
  },

  toggleGroup(e) {
    const key = e.currentTarget.dataset.key;
    const ruleGroups = (this.data.ruleGroups || []).map(function (group) {
      if (group.key === key) {
        return Object.assign({}, group, { open: !group.open });
      }
      return Object.assign({}, group, { open: false });
    });
    this.setData({ ruleGroups: ruleGroups });
  },

  onBack() {
    nav.navigateBackSafe(1);
  },

  useMine(e) {
    if (this._skipNextTap) {
      this._skipNextTap = false;
      return;
    }
    const item = session.getMyRuleById(e.currentTarget.dataset.id);
    if (!item) {
      wx.showToast({ title: "未找到该规则", icon: "none" });
      return;
    }
    if (catalog.isUnavailableRule(item.catalogId || item.ruleId)) {
      wx.showToast({ title: "玩法尚未开放", icon: "none" });
      return;
    }
    const catalogId = item.catalogId || item.ruleId;
    if (this.data.entry === "score") {
      const form = session.getScoreFormationContext(this.data.entry);
      if (form && form.teamed) {
        const hit = session.partyFormation.resolveRuleCompatibility(form, catalogId);
        if (!hit.visible) {
          const msg =
            hit.disabledReason === "party_count"
              ? "当前编队方数不足，无法使用该玩法"
              : "当前编队结构与该玩法不兼容";
          wx.showToast({ title: msg, icon: "none" });
          return;
        }
      }
    }
    wx.navigateTo({
      url: session.configUrl(
        this.data.entry,
        Number(item.players) || this.data.maxPlayers,
        item
      )
    });
  },

  editMine(e) {
    const item = session.getMyRuleById(e.currentTarget.dataset.id);
    if (!item) {
      wx.showToast({ title: "未找到该规则", icon: "none" });
      return;
    }
    if (catalog.isUnavailableRule(item.catalogId || item.ruleId)) {
      wx.showToast({ title: "玩法尚未开放", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: session.editRuleUrl(this.data.entry, this.data.maxPlayers, item)
    });
  },

  startDelete(e) {
    this._skipNextTap = true;
    const id = e.currentTarget.dataset.id;
    const item = session.getMyRuleById(id);
    const self = this;
    wx.showModal({
      title: "删除规则",
      content:
        "从规则库移除「" +
        ((item && item.name) || "该规则") +
        "」？已经开过的比赛仍按当时快照结算，结果不会改。",
      confirmText: "删除",
      confirmColor: "#C62828",
      success(res) {
        if (!res.confirm) return;
        session.removeMyRule(id);
        self.reloadRules();
      }
    });
  },

  onAddRule() {
    wx.navigateTo({
      url: session.withHost(
        "/subpackages/game/pages/catalog/index?entry=" +
          this.data.entry +
          "&maxPlayers=" +
          this.data.maxPlayers
      )
    });
  }
});
