const session = require("../../utils/sideGameBind.js");
const catalog = require("../../utils/catalog.js");
const holeOrderUtil = require("../../utils/holeOrder.js");
const numField = require("../../utils/numField.js");
const setupListUi = require("../../utils/setupListUi.js");

function isPosHalf(raw) {
  const n = Number(String(raw == null ? "" : raw).trim());
  if (!(n > 0)) return false;
  return Math.abs(n * 2 - Math.round(n * 2)) < 0.001;
}

const KICK_MULTS = [2, 4, 8];

function gamePlayerCount(item) {
  const hit = catalog.findRule(item && item.catalogId);
  return Number(
    (item && item.ruleSnapshot && item.ruleSnapshot.players) ||
      (hit && hit.players) ||
      (item && item.playerCount) ||
      0
  );
}

function holeOnMap(game, entry) {
  const map = {};
  const holes = (game && game.holes) || [];
  if (!holes.length) {
    const labels = session.getHoleOrder(entry);
    labels.forEach(function (label) {
      map[label] = true;
    });
    return map;
  }
  holes.forEach(function (item) {
    const key = item && item.label != null ? item.label : item;
    map[String(key)] = !item || item.on !== false;
  });
  return map;
}

function buildKickHoles(game, fromHole, previewMult, entry) {
  const labels = session.getHoleOrder(entry);
  const onMap = holeOnMap(game, entry);
  const saved = session.listKickFactors(game, entry);
  const start = labels.indexOf(fromHole);
  return labels.map(function (label, i) {
    const on = !!onMap[label];
    let factor = Number(saved[i]) || 1;
    if (start >= 0 && previewMult && i >= start) {
      factor = previewMult === 1 ? 1 : Number(previewMult) || 1;
    }
    if (!on) factor = 1;
    return {
      label: label,
      on: on,
      selected: label === fromHole,
      factorText: factor > 1 ? "×" + factor : ""
    };
  });
}

Component({
  properties: {
    entry: { type: String, value: "score" },
    maxPlayers: { type: Number, value: 4 },
    matchId: { type: String, value: "" },
    groupId: { type: String, value: "" },
    scope: { type: String, value: "group" },
    canEdit: { type: Boolean, value: true }
  },

  observers: {
    entry: function () {
      this.reload();
    }
  },

  data: {
    games: [],
    global: { privacy: "public", wind: "off", settingsOpen: false, holeOrder: null, potMode: "none", potN: "1", potM: "", potS: "", potGameIds: [] },
    potRuleText: "不捐锅",
    windRuleText: "未开启",
    showDonateSheet: false,
    donateGames: [],
    showWindSheet: false,
    windGames: [],
    donateMode: "none",
    donateN: "1",
    donateM: "",
    donateAllM: "",
    donateS: "",
    numEditing: false,
    numEditField: "",
    numEditDraft: "",
    settingsLocked: true,
    showGlobalSettings: true,
    showMatchPrivacy: false,
    holeOrderText: holeOrderUtil.holeOrderTextOf(null),
    showHoleOrderSheet: false,
    holeOrderDraft: [],
    holeOrderDragging: false,
    holeOrderDragIndex: -1,
    capHint: "",
    showKickSheet: false,
    kickGameId: "",
    kickGameName: "",
    kickFromHole: "",
    kickMult: 0,
    kickUsingCustom: false,
    kickCustom: "",
    showKickCustom: false,
    kickCustomDraft: "",
    kickCustomFocus: false,
    kickMults: KICK_MULTS,
    kickHoles: [],
    hasDraftGames: false,
    draftGameCount: 0,
    canConfirmSetup: false,
    setupSaving: false
  },

  lifetimes: {
    attached() {
      this.reload();
    }
  },

  pageLifetimes: {
    show() {
      this.reload();
    }
  },

  methods: {
    _canEdit() {
      return this.properties.canEdit !== false;
    },

    reload() {
      const entry = this.properties.entry;
      const games = session.listGames(entry);
      session.syncPotGameIds(entry);
      const global = session.getGlobal(entry);
      const showGlobalSettings = entry === "score";
      const showMatchPrivacy = showGlobalSettings && session.getGroupCount(entry) > 1;
      if (showGlobalSettings && !showMatchPrivacy && global.privacy === "event" && this.properties.canEdit !== false) {
        session.setGlobal(entry, { privacy: "public" });
        global.privacy = "public";
      }
      const mapped = games.map(function (item) {
          const pairings = item.pairings || [];
          const n = gamePlayerCount(item);
          return Object.assign({}, item, {
            showKick: !catalog.isUnavailableRule(item.catalogId) && item.status !== "ended" && (n === 3 || n === 4) && pairings.length <= 1,
            unavailable: catalog.isUnavailableRule(item.catalogId),
            hasKick: ((item.kicks || []).some(function (kick) {
              return Number(kick && kick.multiplier) > 1;
            })),
            wayLabel: (function () {
              const hit = catalog.findRule(item.catalogId);
              if (hit && Number(hit.players) === 2) {
                const count = (item.players && item.players.length) || Number(item.playerCount) || 0;
                return count > 2 ? "互挂" : "单挂";
              }
              if (catalog.isLasuoN(item.catalogId) || catalog.isHorn(item.catalogId)) {
                return catalog.lasuoNWayLabel(item);
              }
              return item.groupModeLabel;
            })(),
            players: (function () {
              const all = (item.players || []).map(function (person) {
                // 已由 hydrateUiGame/hydrateGamePlayers 投影为主体视图，勿再用 presentPerson 覆盖成 Team 名
                if (person && (person.subjectType || person.useSubjectName || person.members)) {
                  return person;
                }
                return session.presentFormationParty({
                  partyId: person && person.id,
                  playerIds:
                    (person && person.memberPlayerIds) ||
                    (person && person.playerIds) ||
                    (person && person.id ? [person.id] : []),
                  displayName: person && (person.displayName || person.name),
                  partyType: person && person.partyType
                });
              });
              const total = all.length;
              const maxShow = 8;
              if (total > maxShow) {
                return {
                  list: all.slice(0, maxShow - 1),
                  overflow: true,
                  total: total
                };
              }
              return { list: all, overflow: false, total: total };
            })()
          });
      });
      const derived = setupListUi.fromDisplayedGames(mapped);
      this.setData({
        games: mapped,
        hasDraftGames: derived.hasDraftGames,
        draftGameCount: derived.draftGameCount,
        canConfirmSetup: derived.canConfirmSetup,
        global: global,
        potRuleText: session.potRuleText(entry),
        windRuleText: session.windRuleText(entry),
        settingsLocked: !derived.hasDraftGames,
        showGlobalSettings: showGlobalSettings,
        showMatchPrivacy: showMatchPrivacy,
        holeOrderText: holeOrderUtil.holeOrderTextOf(session.getHoleOrder(entry)),
        capHint: ""
      });
    },

    toggleSettings() {
      if (this.data.settingsLocked) {
        wx.showToast({ title: "请先添加游戏", icon: "none" });
        return;
      }
      session.setGlobal(this.properties.entry, {
        settingsOpen: !this.data.global.settingsOpen
      });
      this.reload();
    },

    setPrivacy(e) {
      if (!this._canEdit()) return;
      const value = e.currentTarget.dataset.value;
      const allowed =
        value === "public" ||
        value === "group" ||
        (value === "event" && this.data.showMatchPrivacy);
      if (!allowed) return;
      session.setGlobal(this.properties.entry, { privacy: value });
      this.reload();
    },

    onWind() {
      if (this.data.settingsLocked) {
        wx.showToast({ title: "请先添加游戏", icon: "none" });
        return;
      }
      const entry = this.properties.entry;
      session.syncWindGameIds(entry);
      const global = session.getGlobal(entry);
      const selected = {};
      (global.windGameIds || []).forEach(function (id) {
        selected[String(id)] = true;
      });
      const games = session.listWindEligibleGames(entry);
      const windGames = games.map(function (item) {
        return {
          id: item.id,
          name: item.name || "未命名游戏",
          on: !!selected[String(item.id)]
        };
      });
      if (windGames.length === 1 && !(global.windGameIds || []).length) {
        windGames[0].on = true;
      }
      this.setData({
        showWindSheet: true,
        windGames: windGames
      });
    },

    closeWind() {
      this.setData({ showWindSheet: false });
    },

    toggleWindGame(e) {
      const id = String(e.currentTarget.dataset.id);
      const windGames = (this.data.windGames || []).map(function (item) {
        if (String(item.id) !== id) return item;
        return Object.assign({}, item, { on: !item.on });
      });
      this.setData({ windGames: windGames });
    },

    applyWind() {
      const ids = (this.data.windGames || [])
        .filter(function (item) {
          return item.on;
        })
        .map(function (item) {
          return String(item.id);
        });
      session.setGlobal(this.properties.entry, { windGameIds: ids });
      this.setData({
        showWindSheet: false,
        windRuleText: session.windRuleText(this.properties.entry)
      });
      this.reload();
    },

    onDonate() {
      if (this.data.settingsLocked) {
        wx.showToast({ title: "请先添加游戏", icon: "none" });
        return;
      }
      const entry = this.properties.entry;
      session.syncPotGameIds(entry);
      const global = session.getGlobal(entry);
      const selected = {};
      (global.potGameIds || []).forEach(function (id) {
        selected[String(id)] = true;
      });
      const games = session.listGames(entry);
      this.setData({
        showDonateSheet: true,
        donateMode: global.potMode || "none",
        donateN: global.potN || "1",
        donateM: global.potM || "",
        donateAllM: global.potAllM || "",
        donateS: global.potS || "",
        donateGames: games.map(function (item) {
          return {
            id: item.id,
            name: item.name || "未命名游戏",
            on: !!selected[String(item.id)]
          };
        })
      });
    },

    closeDonate() {
      this.setData({ showDonateSheet: false });
    },

    toggleDonateGame(e) {
      const id = String(e.currentTarget.dataset.id);
      const donateGames = (this.data.donateGames || []).map(function (item) {
        if (String(item.id) !== id) return item;
        return Object.assign({}, item, { on: !item.on });
      });
      this.setData({ donateGames: donateGames });
    },

    setDonateMode(e) {
      this.applyDonateMode(e.currentTarget.dataset.value);
    },

    keepDonateMode(e) {
      this.applyDonateMode(e.currentTarget.dataset.value);
    },

    applyDonateMode(value) {
      const patch = { donateMode: value };
      const donateM = String(this.data.donateM || "").trim();
      const donateAllM = String(this.data.donateAllM || "").trim();
      if (value === "all" && !donateAllM) {
        patch.donateAllM = donateM;
      }
      if (value === "big-pot" && !String(this.data.donateS || "").trim()) {
        const m = Number(donateM || donateAllM);
        if (isFinite(m) && m > 0) {
          const s = m * 100;
          patch.donateS = Number.isInteger(s) ? String(s) : String(s);
        }
      }
      this.setData(patch);
    },

    onDonateN(e) {
      this.setData({ donateMode: "winner-n", donateN: e.detail.value });
    },

    onDonateM(e) {
      this.setData({ donateMode: "winner-n", donateM: e.detail.value });
    },

    onDonateAllM(e) {
      this.setData({ donateMode: "all", donateAllM: e.detail.value });
    },

    onDonateS(e) {
      this.setData({ donateMode: "big-pot", donateS: e.detail.value });
    },

    onNumFocus: numField.onNumFocus,
    onNumInput: numField.onNumInput,
    onNumBlur: numField.onNumBlur,

    applyDonate() {
      const mode = this.data.donateMode || "none";
      const ids = (this.data.donateGames || [])
        .filter(function (item) {
          return item.on;
        })
        .map(function (item) {
          return String(item.id);
        });
      if (mode !== "none" && !ids.length) {
        wx.showToast({ title: "请至少选择一个游戏", icon: "none" });
        return;
      }
      const n = String(this.data.donateN || "").trim() || "1";
      const m = String(this.data.donateM || "").trim();
      const allM = String(this.data.donateAllM || "").trim();
      const s = String(this.data.donateS || "").trim();
      if (mode === "winner-n") {
        if (!isPosHalf(n)) {
          wx.showToast({ title: "每洞捐分须为正数", icon: "none" });
          return;
        }
        if (!isPosHalf(m)) {
          wx.showToast({ title: "请填写捐满积分", icon: "none" });
          return;
        }
        if (Number(m) < Number(n)) {
          wx.showToast({ title: "捐满积分不能小于每洞捐分", icon: "none" });
          return;
        }
      }
      if (mode === "all" && !isPosHalf(allM)) {
        wx.showToast({ title: "请填写捐满积分", icon: "none" });
        return;
      }
      if (mode === "big-pot" && !isPosHalf(s)) {
        wx.showToast({ title: "请填写基金总额", icon: "none" });
        return;
      }
      session.setGlobal(this.properties.entry, {
        potMode: mode,
        potN: n,
        potM: m,
        potAllM: allM,
        potS: s,
        potGameIds: ids
      });
      this.setData({
        showDonateSheet: false,
        potRuleText: session.potRuleText(this.properties.entry)
      });
      this.reload();
    },

    onHoleOrder() {
      if (this.data.settingsLocked) {
        wx.showToast({ title: "请先添加游戏", icon: "none" });
        return;
      }
      const holeOrderDraft = session.getHoleOrder(this.properties.entry);
      this.setData({
        showHoleOrderSheet: true,
        holeOrderDraft: holeOrderDraft,
        holeOrderDragging: false,
        holeOrderDragIndex: -1
      });
    },

    closeHoleOrder() {
      this._holeOrderDrag = null;
      this.setData({
        showHoleOrderSheet: false,
        holeOrderDragging: false,
        holeOrderDragIndex: -1
      });
    },

    applyHoleOrder() {
      const holeOrder = session.setHoleOrder(this.properties.entry, this.data.holeOrderDraft);
      this._holeOrderDrag = null;
      this.setData({
        showHoleOrderSheet: false,
        holeOrderDragging: false,
        holeOrderDragIndex: -1,
        holeOrderText: holeOrderUtil.holeOrderTextOf(holeOrder)
      });
      this.reload();
    },

    applyHoleOrderMove(from, to, extra) {
      const holeOrderDraft = holeOrderUtil.moveHoleOrderIndex(this.data.holeOrderDraft, from, to);
      this.setData(Object.assign({ holeOrderDraft: holeOrderDraft }, extra || {}));
    },

    onHoleOrderTouchStart(e) {
      const index = Number(e.currentTarget.dataset.index);
      const touch = e.touches && e.touches[0];
      if (!touch || isNaN(index)) return;
      this._holeOrderDrag = {
        index: index,
        startX: touch.clientX,
        startY: touch.clientY,
        armed: false
      };
      const query = wx.createSelectorQuery().in(this);
      query.selectAll(".hole-order-cell").boundingClientRect();
      query.exec(
        function (res) {
          this._holeOrderRects = (res && res[0]) || [];
        }.bind(this)
      );
    },

    onHoleOrderTouchMove(e) {
      if (!this._holeOrderDrag) return;
      const touch = e.touches && e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - this._holeOrderDrag.startX;
      const dy = touch.clientY - this._holeOrderDrag.startY;
      if (!this._holeOrderDrag.armed) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        this._holeOrderDrag.armed = true;
        this.setData({
          holeOrderDragging: true,
          holeOrderDragIndex: this._holeOrderDrag.index
        });
      }
      const rects = this._holeOrderRects || [];
      let to = this._holeOrderDrag.index;
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (!r) continue;
        if (
          touch.clientX >= r.left &&
          touch.clientX <= r.right &&
          touch.clientY >= r.top &&
          touch.clientY <= r.bottom
        ) {
          to = i;
          break;
        }
      }
      if (to === this._holeOrderDrag.index) return;
      const from = this._holeOrderDrag.index;
      this._holeOrderDrag.index = to;
      this.applyHoleOrderMove(from, to, {
        holeOrderDragging: true,
        holeOrderDragIndex: to
      });
      const query = wx.createSelectorQuery().in(this);
      query.selectAll(".hole-order-cell").boundingClientRect();
      query.exec(
        function (res) {
          this._holeOrderRects = (res && res[0]) || [];
        }.bind(this)
      );
    },

    onHoleOrderTouchEnd(e) {
      if (!this._holeOrderDrag) return;
      const armed = !!this._holeOrderDrag.armed;
      const label = e.currentTarget.dataset.label;
      this._holeOrderDrag = null;
      if (!armed && label) {
        this.setData({
          holeOrderDraft: holeOrderUtil.rotateHoleOrderToStart(this.data.holeOrderDraft, label),
          holeOrderDragging: false,
          holeOrderDragIndex: -1
        });
        return;
      }
      this.setData({
        holeOrderDragging: false,
        holeOrderDragIndex: -1
      });
    },

    onKickGame(e) {
      const id = e.currentTarget.dataset.id;
      const game = session.getGame(this.properties.entry, id);
      if (!game) return;
      if (catalog.isUnavailableRule(game.catalogId)) {
        wx.showToast({ title: "玩法尚未开放", icon: "none" });
        return;
      }
      this.setData({
        showKickSheet: true,
        kickGameId: id,
        kickGameName: game.name || "未命名游戏",
        kickFromHole: "",
        kickMult: 0,
        kickUsingCustom: false,
        kickCustom: "",
        showKickCustom: false,
        kickCustomDraft: "",
        kickCustomFocus: false,
        kickHoles: buildKickHoles(game, "", 0, this.properties.entry)
      });
    },

    closeKick() {
      this.setData({
        showKickSheet: false,
        kickGameId: "",
        kickFromHole: "",
        kickMult: 0,
        kickUsingCustom: false,
        kickCustom: "",
        showKickCustom: false,
        kickCustomDraft: "",
        kickCustomFocus: false,
        kickHoles: []
      });
    },

    pickKickHole(e) {
      const label = e.currentTarget.dataset.label;
      const on = e.currentTarget.dataset.on;
      if (!on) return;
      const game = session.getGame(this.properties.entry, this.data.kickGameId);
      this.setData({
        kickFromHole: label,
        kickMult: 0,
        kickUsingCustom: false,
        kickCustom: "",
        showKickCustom: false,
        kickCustomFocus: false,
        kickHoles: buildKickHoles(game, label, 0, this.properties.entry)
      });
    },

    pickKickMult(e) {
      const multiplier = Number(e.currentTarget.dataset.value);
      const game = session.getGame(this.properties.entry, this.data.kickGameId);
      const fromHole = this.data.kickFromHole;
      if (!fromHole) return;
      this.setData({
        kickMult: multiplier,
        kickUsingCustom: false,
        kickCustom: "",
        showKickCustom: false,
        kickCustomFocus: false,
        kickHoles: buildKickHoles(game, fromHole, multiplier, this.properties.entry)
      });
    },

    openKickCustom() {
      if (!this.data.kickFromHole) return;
      const self = this;
      this.setData(
        {
          showKickCustom: true,
          kickCustomDraft: this.data.kickCustom || "",
          kickCustomFocus: false
        },
        function () {
          self.setData({ kickCustomFocus: true });
        }
      );
    },

    closeKickCustom() {
      this.setData({
        showKickCustom: false,
        kickCustomFocus: false
      });
    },

    onKickCustomDraft(e) {
      const raw = String((e.detail && e.detail.value) || "").replace(/[^\d]/g, "");
      this.setData({ kickCustomDraft: raw });
    },

    applyKickCustom() {
      const raw = String(this.data.kickCustomDraft || "").trim();
      if (!/^[1-9]\d*$/.test(raw) || Number(raw) < 2) {
        wx.showToast({ title: "请输入大于 1 的整数", icon: "none" });
        return;
      }
      const multiplier = Number(raw);
      const game = session.getGame(this.properties.entry, this.data.kickGameId);
      const fromHole = this.data.kickFromHole;
      this.setData({
        showKickCustom: false,
        kickCustomFocus: false,
        kickUsingCustom: true,
        kickCustom: raw,
        kickMult: multiplier,
        kickHoles: buildKickHoles(game, fromHole, multiplier, this.properties.entry)
      });
    },

    confirmKick() {
      const fromHole = this.data.kickFromHole;
      let multiplier = Number(this.data.kickMult) || 0;
      if (this.data.kickUsingCustom) {
        multiplier = Number(this.data.kickCustom) || 0;
      }
      if (!fromHole) {
        wx.showToast({ title: "请选择起始洞", icon: "none" });
        return;
      }
      if (this.data.kickUsingCustom && !/^[1-9]\d*$/.test(String(this.data.kickCustom || "").trim())) {
        wx.showToast({ title: "请输入自定义倍数", icon: "none" });
        return;
      }
      if (!multiplier) {
        wx.showToast({ title: "请选择倍数", icon: "none" });
        return;
      }
      const entry = this.properties.entry;
      const id = this.data.kickGameId;
      session.restoreKick(entry, id, fromHole);
      if (multiplier > 1) {
        session.addKick(entry, id, { fromHole: fromHole, multiplier: multiplier });
      }
      this.closeKick();
      this.reload();
      wx.showToast({
        title: multiplier > 1 ? "从 " + fromHole + " 起 ×" + multiplier : "从 " + fromHole + " 起已恢复",
        icon: "none"
      });
    },

    stopKickTap() {},

    onEditGame(e) {
      const id = e.currentTarget.dataset.id;
      const game = session.getGame(this.properties.entry, id);
      if (!game) return;
      if (catalog.isUnavailableRule(game.catalogId)) {
        wx.showToast({ title: "玩法尚未开放", icon: "none" });
        return;
      }
      wx.navigateTo({
        url: session.configUrl(
          this.properties.entry,
          session.getRuleCap(this.properties.entry),
          {
            id: game.ruleLibId,
            catalogId: game.catalogId,
            name: game.name,
            players: (game.ruleSnapshot && game.ruleSnapshot.players) || game.playerCount
          },
          game.id
        )
      });
    },

    onDeleteGame(e) {
      if (!this._canEdit()) return;
      const id = e.currentTarget.dataset.id;
      const self = this;
      wx.showModal({
        title: "删除游戏",
        content: "确定删除该游戏？",
        success(res) {
          if (!res.confirm) return;
          session.removeGame(self.properties.entry, id);
          self.reload();
        }
      });
    },

    onSelectRule() {
      wx.navigateTo({
        url: session.withHost(
          "/subpackages/game/pages/rules/index?entry=" +
            this.properties.entry +
            "&maxPlayers=" +
            session.getRuleDesignCap(this.properties.entry)
        )
      });
    },

    onCommitSetup() {
      if (!this._canEdit()) return;
      if (!this.data.canConfirmSetup) return;
      if (this.data.setupSaving) return;
      this.triggerEvent("commit");
    }
  }
});
