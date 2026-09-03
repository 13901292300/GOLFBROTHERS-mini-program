const { createHeaderStyle } = require("../../../../utils/headerEngine.js");
const session = require("../../utils/sideGameBind.js");
const hostSession = require("../../utils/sideGameHostSession.js");
const eventGroups = require("../../utils/pickPlayersEventGroups.js");
const nav = require("../../utils/nav.js");
const configGuard = require("../../utils/sideGameConfigGuard.js");

function countSelected(list) {
  return (list || []).filter(function (item) {
    return item.selected;
  }).length;
}

function flattenGroups(groups) {
  const flat = [];
  (groups || []).forEach(function (g) {
    ((g.members || g.players) || []).forEach(function (p) {
      flat.push(p);
    });
  });
  return flat;
}

function readEventGroups(query) {
  const snap = hostSession.getHostContext(query);
  if (snap && Array.isArray(snap.groups)) return snap.groups.slice();
  return [];
}

/** selected 与 disabled 拆分；达上限时仅未选项进入 capacity 禁选，已选仍可取消 */
function decoratePickState(list, maxSelect) {
  const selectedCount = countSelected(list);
  const atMax = Number(maxSelect) > 0 && selectedCount >= Number(maxSelect);
  return (list || []).map(function (item) {
    const biz = Object.prototype.hasOwnProperty.call(item || {}, "businessDisabled")
      ? !!item.businessDisabled
      : !!(item && item.disabled && !item.capacityBlocked);
    const capacityBlocked = atMax && !(item && item.selected) && !biz;
    return Object.assign({}, item, {
      businessDisabled: biz,
      capacityBlocked: capacityBlocked,
      disabled: biz || capacityBlocked,
      selected: !!(item && item.selected)
    });
  });
}

function presentRoster(list) {
  return (list || []).map(function (item) {
    const face = session.presentPerson(item.id);
    const businessDisabled = Object.prototype.hasOwnProperty.call(item, "businessDisabled")
      ? !!item.businessDisabled
      : !!item.disabled;
    return Object.assign({}, item, face, {
      id: face.id || item.id,
      groupId: item.groupId || face.groupId,
      selected: !!item.selected,
      businessDisabled: businessDisabled,
      capacityBlocked: false,
      disabled: businessDisabled
    });
  });
}

function rebuild(page, list) {
  const maxSelect = Number(page.data.maxSelect) || 0;
  const next = decoratePickState(presentRoster(list), maxSelect);
  const out = eventGroups.buildSelectionGroups({
    eventGroups: page._eventGroups || [],
    players: next,
    selectedIds: next.filter(function (item) {
      return item.selected;
    }).map(function (item) {
      return item.id;
    })
  });
  if (out.anomalies && out.anomalies.length && typeof console !== "undefined" && console.warn) {
    console.warn("[pick-players] roster anomaly", out.anomalies);
  }
  const byId = {};
  decoratePickState(out.flat, maxSelect).forEach(function (p) {
    byId[p.id] = p;
  });
  const selectionGroups = (out.selectionGroups || []).map(function (g) {
    return Object.assign({}, g, {
      members: (g.members || []).map(function (m) {
        return byId[m.id] || m;
      })
    });
  });
  const groups = (out.groups || []).map(function (g) {
    return Object.assign({}, g, {
      members: (g.members || []).map(function (m) {
        return byId[m.id] || m;
      })
    });
  });
  const flat = (out.flat || []).map(function (m) {
    return byId[m.id] || m;
  });
  return {
    layoutMode: eventGroups.LAYOUT_EVENT_GROUPS,
    groups: groups,
    selectionGroups: selectionGroups,
    selectedCount: out.selectedCount,
    flat: flat
  };
}

Page({
  data: {
    headerRootStyle: "",
    headerBarStyle: "",
    layoutMode: eventGroups.LAYOUT_EVENT_GROUPS,
    groups: [],
    selectionGroups: [],
    flat: [],
    selectedCount: 0,
    maxSelect: 0,
    minSelect: 2,
    locked: false,
    canEdit: true,
    canView: true,
    pageMode: "edit",
    readonlyHint: ""
  },

  onLoad(query) {
    if (!session.ensureHost(query)) return;
    const entry = (query && query.entry) || "hub";
    if (!session.requireSetupDraft(entry)) return;
    const header = createHeaderStyle();
    const maxSelect = Number((query && query.max) || 0);
    const minSelect = Number((query && query.min) || 2);
    const locked = String((query && query.locked) || "") === "1";
    this._hostQuery = query || {};
    this._eventGroups = readEventGroups(query);
    this._channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle,
      layoutMode: eventGroups.LAYOUT_EVENT_GROUPS,
      maxSelect: maxSelect,
      minSelect: minSelect,
      locked: locked
    });
    let gotInit = false;
    if (this._channel && this._channel.on) {
      this._channel.on("init", (payload) => {
        gotInit = true;
        this.bootstrap(payload || {});
      });
    }
    setTimeout(() => {
      if (gotInit) return;
      this.bootstrap({
        entry: entry,
        players: session.listPlayers(entry),
        selectedIds: [],
        maxSelect: maxSelect,
        minSelect: minSelect,
        locked: locked
      });
    }, 80);
  },

  bootstrap(payload) {
    const selected = {};
    (payload.selectedIds || []).forEach(function (id) {
      selected[id] = true;
    });
    const list = (payload.players || session.listPlayers(payload.entry || "hub")).map(
      function (item) {
        return {
          id: item.id,
          groupId: item.groupId,
          memberPlayerIds: item.memberPlayerIds,
          selected: payload.locked ? true : !!selected[item.id],
          businessDisabled: !!item.disabled,
          disabled: !!item.disabled
        };
      }
    );
    const maxSelect =
      payload.maxSelect != null && payload.maxSelect !== ""
        ? Number(payload.maxSelect)
        : this.data.maxSelect;
    const minSelect =
      payload.minSelect != null && payload.minSelect !== ""
        ? Number(payload.minSelect)
        : this.data.minSelect;
    this.setData(
      Object.assign(
        {
          maxSelect: maxSelect,
          minSelect: minSelect,
          locked: !!payload.locked || this.data.locked
        },
        rebuild(this, list)
      )
    );
    if (!this._configGuard) configGuard.attach(this, {});
    if (this._captureInitialSnapshot) this._captureInitialSnapshot();
  },

  currentFlat() {
    const flat = this.data.flat || [];
    if (flat.length) return flat;
    return flattenGroups(this.data.selectionGroups || this.data.groups);
  },

  toggleOne(e) {
    if (this.data.locked) {
      wx.showToast({ title: "本组须全部上场", icon: "none" });
      return;
    }
    const id = e.currentTarget.dataset.id;
    const flat = this.currentFlat().map(function (item) {
      return Object.assign({}, item);
    });
    const hit = flat.find(function (item) {
      return item.id === id;
    });
    if (!hit) return;
    if (hit.businessDisabled) return;
    if (hit.selected) {
      hit.selected = false;
      hit.capacityBlocked = false;
      hit.disabled = !!hit.businessDisabled;
      this.setData(rebuild(this, flat));
      return;
    }
    const selectedCount = countSelected(flat);
    if (this.data.maxSelect > 0 && selectedCount >= this.data.maxSelect) {
      wx.showToast({ title: "最多选 " + this.data.maxSelect + " 人", icon: "none" });
      return;
    }
    if (hit.disabled) return;
    hit.selected = true;
    this.setData(rebuild(this, flat));
  },

  onSelectAll() {
    if (this.data.locked) {
      wx.showToast({ title: "本组须全部上场", icon: "none" });
      return;
    }
    const max = Number(this.data.maxSelect) || 0;
    const source = this.currentFlat();
    if (!source.length) {
      wx.showToast({ title: "暂无可选球员", icon: "none" });
      return;
    }
    const next = source.map(function (item) {
      return Object.assign({}, item, { selected: false });
    });
    if (max > 0) {
      next.forEach(function (item, idx) {
        item.selected = !item.businessDisabled && idx < max;
      });
      this.setData(rebuild(this, next));
      wx.showToast({ title: "已选 " + Math.min(max, next.length) + " 人", icon: "none" });
      return;
    }
    next.forEach(function (item) {
      item.selected = !item.businessDisabled;
    });
    this.setData(rebuild(this, next));
    wx.showToast({ title: "已全选 " + countSelected(next) + " 人", icon: "none" });
  },

  onClear() {
    if (this.data.locked) {
      wx.showToast({ title: "本组须全部上场", icon: "none" });
      return;
    }
    const flat = this.currentFlat().map(function (item) {
      return Object.assign({}, item, { selected: false });
    });
    this.setData(rebuild(this, flat));
  },

  onConfirm() {
    if (this._assertCanEdit && !this._assertCanEdit()) return;
    if (this._confirmSubmitting) return;
    const ids = this.currentFlat()
      .filter(function (item) {
        return item.selected;
      })
      .map(function (item) {
        return item.id;
      });
    if (this.data.minSelect > 0 && ids.length < this.data.minSelect) {
      wx.showToast({ title: "至少选 " + this.data.minSelect + " 人", icon: "none" });
      return;
    }
    if (this.data.maxSelect > 0 && ids.length > this.data.maxSelect) {
      wx.showToast({ title: "最多选 " + this.data.maxSelect + " 人", icon: "none" });
      return;
    }
    this._leaveIntent = "confirm";
    this._confirmSubmitting = true;
    try {
      if (this._channel && this._channel.emit) {
        this._channel.emit("done", { selectedIds: ids });
      }
      // 确认提交：先清 dirty / 关返回拦截，再离开；勿走放弃修改提示
      if (this._markSaved) this._markSaved();
      else configGuard.enableUnloadAlert(false);
      nav.navigateBackSafe(1);
    } catch (e) {
      this._leaveIntent = "none";
      this._confirmSubmitting = false;
    }
  },

  onBack() {
    this._leaveIntent = "back";
    if (this._leaveIfClean) {
      this._leaveIfClean(function () {
        nav.navigateBackSafe(1);
      });
      return;
    }
    nav.navigateBackSafe(1);
  }
});
