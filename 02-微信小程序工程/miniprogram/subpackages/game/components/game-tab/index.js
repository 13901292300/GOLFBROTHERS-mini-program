const session = require("../../utils/sideGameBind.js");
const gameHostContext = require("../../utils/gameHostContext.js");
const pageBoot = require("../../utils/pageBoot.js");
const catalog = require("../../utils/catalog.js");
const hostSession = require("../../utils/sideGameHostSession.js");
const dockFootVisibility = require("../../utils/dockFootVisibility.js");
const boardLayout = require("../../utils/boardLayout.js");
const flowStickyChrome = require("../../utils/flowStickyChrome.js");

const ALL_GAMES_ID = "__all__";
const ALL_NOPOT_ID = "__all_nopot__";
const POT_GROUP_ID = "__pot__";

function buildLayout(playerCount) {
  const sys = wx.getSystemInfoSync();
  return boardLayout.buildBoardLayout(playerCount, sys.windowWidth || 375);
}

function fitStyleOf(text, colPx) {
  const s = String(text == null ? "" : text);
  if (!s || s === "-" || s === "—") return "";
  const avail = Math.max(12, (Number(colPx) || 0) - 8);
  if (!(avail > 0)) return "";
  function widthAt(px) {
    let w = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charAt(i);
      if (ch === ".") w += px * 0.34;
      else if (ch === "+" || ch === "-") w += px * 0.55;
      else w += px * 0.7;
    }
    return w;
  }
  const sys = wx.getSystemInfoSync();
  const winW = sys.windowWidth || 375;
  let px = (36 / 750) * winW;
  const min = (18 / 750) * winW;
  if (widthAt(px) <= avail) return "";
  while (px > min && widthAt(px) > avail) {
    px -= 0.5;
  }
  if (px < min) px = min;
  return "font-size:" + (Math.round(px * 10) / 10) + "px;";
}

function withNumFit(board, colPx) {
  if (!board) return board;
  function patchCell(cell) {
    if (!cell) return cell;
    return Object.assign({}, cell, { fitStyle: fitStyleOf(cell.text, colPx) });
  }
  return Object.assign({}, board, {
    holes: (board.holes || []).map(function (hole) {
      return Object.assign({}, hole, {
        cells: (hole.cells || []).map(patchCell)
      });
    }),
    totals: (board.totals || []).map(patchCell),
    pots: (board.pots || []).map(patchCell)
  });
}

function onPairsOf(game) {
  return ((game && game.pairings) || []).filter(function (item) {
    return item && item.on !== false && item.leftId && item.rightId;
  });
}

function isTwoPlayerGame(game) {
  const hit = catalog.findRule(game && game.catalogId);
  return !!(hit && Number(hit.players) === 2);
}

/** 记分页一组≤4人；HUB/队内赛仅当该两人游戏参与者≤4 才给 1V1 二级菜单 */
function allowPairSubmenu(entry, game) {
  if (!isTwoPlayerGame(game)) return false;
  if (onPairsOf(game).length < 2) return false;
  const n = ((game && game.players) || []).length || Number(game && game.playerCount) || 0;
  return n > 0 && n <= 4;
}

function pairLabel(pair) {
  const left = session.presentPerson(pair.leftId);
  const right = session.presentPerson(pair.rightId);
  return (left.name || "左") + " VS " + (right.name || "右");
}

function mapGameItem(entry, game, activeGameId, activePairId, foldIds) {
  const showPairs = allowPairSubmenu(entry, game);
  const pairs = showPairs
    ? onPairsOf(game).map(function (item) {
        return {
          id: item.id,
          name: pairLabel(item),
          on: activeGameId === game.id && String(activePairId) === String(item.id)
        };
      })
    : [];
  const folded = foldIds && foldIds[game.id];
  return {
    id: game.id,
    name: game.name || "未命名游戏",
    isAll: false,
    hasPairs: showPairs,
    pairFold:
      showPairs &&
      (folded === true ||
        (activeGameId === game.id && !!activePairId && folded !== false)),
    pairs: pairs,
    hasChildren: false,
    fold: false,
    children: []
  };
}

function potSetOf(global) {
  const set = {};
  ((global && global.potGameIds) || []).forEach(function (id) {
    set[String(id)] = true;
  });
  return set;
}

function defaultBoardId(listed, isBigPot, potSet) {
  if (!listed.length) return "";
  if (listed.length === 1) return listed[0].id;
  if (!isBigPot) return ALL_GAMES_ID;
  const potGames = listed.filter(function (game) {
    return potSet[String(game.id)];
  });
  if (potGames.length === 1) return potGames[0].id;
  if (potGames.length > 1) return POT_GROUP_ID;
  return ALL_GAMES_ID;
}

function idInOptions(options, id) {
  return (options || []).some(function (item) {
    if (item.id === id) return true;
    return (item.children || []).some(function (child) {
      return child.id === id;
    });
  });
}

function gameOptionsOf(entry, games, global, foldIds, activeGameId, activePairId) {
  games = games || [];
  global = global || {};
  const isBigPot = (global.potMode || "none") === "big-pot";
  const potSet = potSetOf(global);
  const folds = foldIds || {};

  function asItem(game) {
    return mapGameItem(entry, game, activeGameId, activePairId, folds);
  }

  if (!games.length) return [];
  if (games.length === 1) {
    const only = asItem(games[0]);
    if (isBigPot && potSet[String(games[0].id)]) {
      only.name = "大锅饭-" + only.name;
    }
    return [only];
  }

  if (!isBigPot) {
    return [
      {
        id: ALL_GAMES_ID,
        name: "所有游戏汇总",
        isAll: true,
        hasPairs: false,
        pairFold: false,
        pairs: [],
        hasChildren: false,
        fold: false,
        children: []
      }
    ].concat(games.map(asItem));
  }

  const potGames = games.filter(function (game) {
    return potSet[String(game.id)];
  });
  const otherGames = games.filter(function (game) {
    return !potSet[String(game.id)];
  });
  const out = [];
  if (potGames.length === 1) {
    const only = asItem(potGames[0]);
    only.name = "大锅饭-" + only.name;
    out.push(only);
  } else if (potGames.length > 1) {
    const kids = potGames.map(asItem);
    const kidActive = kids.some(function (item) {
      return item.id === activeGameId;
    });
    out.push({
      id: POT_GROUP_ID,
      name: "大锅饭",
      isAll: true,
      hasPairs: false,
      pairFold: false,
      pairs: [],
      hasChildren: true,
      fold: folds[POT_GROUP_ID] === true || (kidActive && folds[POT_GROUP_ID] !== false),
      children: kids
    });
  }
  if (otherGames.length === 1) {
    out.push(asItem(otherGames[0]));
  } else if (otherGames.length > 1) {
    const kids = otherGames.map(asItem);
    const kidActive = kids.some(function (item) {
      return item.id === activeGameId;
    });
    out.push({
      id: ALL_NOPOT_ID,
      name: "所有游戏汇总（不含大锅饭）",
      isAll: true,
      hasPairs: false,
      pairFold: false,
      pairs: [],
      hasChildren: true,
      fold: folds[ALL_NOPOT_ID] === true || (kidActive && folds[ALL_NOPOT_ID] !== false),
      children: kids
    });
  }
  return out;
}

function boardGameIdOf(activeGameId) {
  if (!activeGameId || activeGameId === ALL_GAMES_ID) return undefined;
  return activeGameId;
}

function optionNameOf(options, gameId, pairId) {
  let game = null;
  (options || []).forEach(function (item) {
    if (item.id === gameId) game = item;
    (item.children || []).forEach(function (child) {
      if (child.id === gameId) game = child;
    });
  });
  if (!game) {
    if (gameId === ALL_GAMES_ID) return "所有游戏汇总";
    if (gameId === ALL_NOPOT_ID) return "所有游戏汇总（不含大锅饭）";
    if (gameId === POT_GROUP_ID) return "大锅饭";
    return "所有游戏汇总";
  }
  if (pairId && game.pairs) {
    const pair = game.pairs.find(function (item) {
      return String(item.id) === String(pairId);
    });
    if (pair) return game.name + " · " + pair.name;
  }
  return game.name;
}

Component({
  options: {
    virtualHost: true
  },
  properties: {
    entry: { type: String, value: "score" },
    maxPlayers: { type: Number, value: 4 },
    matchId: { type: String, value: "" },
    groupId: { type: String, value: "" },
    scope: { type: String, value: "group" },
    hostSnapshot: { type: Object, value: {} },
    layoutMode: { type: String, value: "fill" },
    ctaHidden: { type: Boolean, value: false }
  },

  data: {
    canCreate: true,
    emptyTitle: "本组未开游戏",
    loadError: "",
    loading: false,
    hasGames: false,
    board: {
      players: [],
      holes: [],
      totals: [],
      pots: [],
      showPot: false,
      potRowLabel: "捐锅",
      gameCount: 0
    },
    gameOptions: [],
    activeGameId: ALL_GAMES_ID,
    activePairId: "",
    activeGameName: "所有游戏汇总",
    gameSelectEnabled: false,
    gameMenuOpen: false,
    foldIds: {},
    pairFoldGameId: "",
    needHScroll: false,
    colPx: 0,
    bodyWidthPx: 0,
    holePx: 0,
    holeY: 0,
    layoutIsFlow: false,
    dockFootVisible: false,
    dockHScrollLeft: 0,
    boardHScrollLeft: 0,
    flowPinStuck: false,
    flowHeadStuck: false,
    flowPinTop: 0,
    flowHeadTop: 0,
    flowPinH: 0,
    flowHeadH: 0,
    flowFootSpacerPx: 0
  },

  observers: {
    hostSnapshot: function (snap) {
      this._applyHost(snap);
    },
    layoutMode: function () {
      this._syncLayoutFlag();
    },
    ctaHidden: function () {
      this.syncDockFromLayout();
    }
  },

  lifetimes: {
    attached() {
      this._holeY = 0;
      this._vTicking = false;
      this._dockTicking = false;
      this._flowTabBottom = 0;
      try {
        this._syncLayoutFlag();
        this._applyHost(this.properties.hostSnapshot);
      } catch (e) {
        this._reloadFail(e, "attached");
      }
    },
    detached() {
      this._dockTicking = false;
    }
  },

  pageLifetimes: {
    show() {
      try {
        this.reload();
        this.syncDockFromLayout();
      } catch (e) {
        this._reloadFail(e, "page_show");
      }
    }
  },

  methods: {
    _applyHost(snap) {
      this._host = null;
      if (snap && typeof snap === "object" && !Array.isArray(snap) && snap.matchId) {
        try {
          var ctx = gameHostContext.buildFromHostSnapshot(snap);
          if (ctx && ctx.matchId) {
            hostSession.setHostContext(ctx);
            this._host = ctx;
            session.attachHost(ctx);
          }
        } catch (e) {}
      }
      var host = this._host || {};
      var entry = this.properties.entry;
      if (!entry || entry === "score") {
        entry = host.scope === "match" ? "match" : "score";
      }
      this._entry = entry;
      this.setData({
        emptyTitle: entry === "score" ? "本组未开游戏" : "本场未开游戏"
      });
      this.reload();
    },

    resolveEntry() {
      return this._entry || this.properties.entry || "score";
    },

    _warnDev(code, message) {
      try {
        var env = "";
        if (typeof wx !== "undefined" && typeof wx.getAccountInfoSync === "function") {
          env = String((wx.getAccountInfoSync().miniProgram || {}).envVersion || "");
        }
        if (env === "develop" || env === "trial" || typeof Component === "undefined") {
          console.warn("[game-tab]", String(code || ""), String(message || ""));
        }
      } catch (e) {}
    },

    _reloadFail(err, code) {
      var message = err && err.message ? String(err.message) : String(err || "reload_failed");
      this._warnDev(code || "reload_exception", message);
      var hadBoard =
        !!(this.data.hasGames && this.data.board && (this.data.board.holes || []).length);
      if (hadBoard) {
        this.setData({ loading: false, loadError: "" });
        return;
      }
      this.setData({
        loading: false,
        loadError: "load_failed",
        hasGames: false,
        board: this.data.board || {
          players: [],
          holes: [],
          totals: [],
          pots: [],
          showPot: false,
          potRowLabel: "捐锅",
          gameCount: 0
        }
      });
    },

    _publishedGames(entry) {
      if (typeof session.listRepoGames === "function") {
        return session.listRepoGames(entry) || [];
      }
      if (typeof session.runPublished === "function") {
        return session.runPublished(function () {
          return session.listGames(entry) || [];
        });
      }
      return session.listGames(entry) || [];
    },

    _publishedGlobal(entry) {
      if (typeof session.getPublishedGlobal === "function") {
        return session.getPublishedGlobal(entry) || {};
      }
      if (typeof session.runPublished === "function") {
        return session.runPublished(function () {
          return session.getGlobal(entry) || {};
        });
      }
      return session.getGlobal(entry) || {};
    },

    _publishedBoard(entry, gameId, pairId) {
      if (typeof session.listPublishedBoard === "function") {
        return session.listPublishedBoard(entry, gameId, pairId);
      }
      if (typeof session.runPublished === "function") {
        return session.runPublished(function () {
          return session.listBoard(entry, gameId, pairId);
        });
      }
      return session.listBoard(entry, gameId, pairId);
    },

    reload() {
      this.setData({ loading: true });
      try {
        const entry = this.resolveEntry();
        const listed = this._publishedGames(entry);
        const participantCount = session.getParticipantCount(entry);
        const incompatible = listed.filter(function (game) {
          return !session.isGameCompatibleWithParticipantCount(game, participantCount, { entry: entry });
        });
        if (incompatible.length && participantCount > 0) {
          const key = participantCount + ":" + incompatible.map(function (g) { return g.id; }).join(",");
          if (this._compatWarnKey !== key) {
            this._compatWarnKey = key;
            wx.showToast({
              title: "有 " + incompatible.length + " 场游戏不适用于当前 " + participantCount + " 人",
              icon: "none"
            });
          }
        }
        if (!listed.length) {
          this._holeY = 0;
          this.setData({
            loading: false,
            loadError: "",
            hasGames: false,
            board: {
              players: [],
              holes: [],
              totals: [],
              pots: [],
              showPot: false,
              potRowLabel: "捐锅",
              gameCount: 0
            },
            gameOptions: [],
            activeGameId: "",
            activePairId: "",
            activeGameName: "",
            gameSelectEnabled: false,
            gameMenuOpen: false,
            foldIds: {},
            pairFoldGameId: "",
            holeY: 0,
            dockFootVisible: false,
            dockHScrollLeft: 0,
            boardHScrollLeft: 0,
            flowPinStuck: false,
            flowHeadStuck: false,
            flowFootSpacerPx: 0
          });
          this.syncDockFromLayout();
          return;
        }
        const global = this._publishedGlobal(entry);
        const isBigPot = (global.potMode || "none") === "big-pot";
        const potSet = potSetOf(global);
        const fallbackId = defaultBoardId(listed, isBigPot, potSet);
        const saved = session.getBoardView(entry);
        let activeGameId = (saved && saved.gameId) || this.data.activeGameId || fallbackId;
        let activePairId = (saved && saved.pairId) || this.data.activePairId || "";
        const foldIds = this.data.foldIds || {};
        const options = gameOptionsOf(entry, listed, global, foldIds, activeGameId, activePairId);
        const gameSelectEnabled = options.length > 1 || options.some(function (item) {
          if (item.hasPairs || item.hasChildren) return true;
          return (item.children || []).some(function (child) {
            return child.hasPairs;
          });
        });
        if (!options.length) {
          activeGameId = "";
          activePairId = "";
        } else if (!idInOptions(options, activeGameId)) {
          if (String(activeGameId) === ALL_NOPOT_ID) {
            const others = listed.filter(function (game) {
              return !potSet[String(game.id)];
            });
            if (others.length === 1) {
              activeGameId = others[0].id;
              activePairId = "";
            } else {
              activeGameId = fallbackId;
              activePairId = "";
              if (saved) session.setBoardView(entry, null);
            }
          } else {
            activeGameId = fallbackId;
            activePairId = "";
            if (saved) session.setBoardView(entry, null);
          }
        } else if (activePairId) {
          let host = null;
          options.forEach(function (item) {
            if (item.id === activeGameId) host = item;
            (item.children || []).forEach(function (child) {
              if (child.id === activeGameId) host = child;
            });
          });
          const stillPair =
            host &&
            (host.pairs || []).some(function (item) {
              return String(item.id) === String(activePairId);
            });
          if (!stillPair) activePairId = "";
        }
        const board = this._publishedBoard(
          entry,
          boardGameIdOf(activeGameId),
          activePairId || undefined
        ) || {
          hasGames: listed.length > 0,
          gameCount: listed.length,
          players: [],
          holes: [],
          totals: [],
          pots: [],
          showPot: false,
          potRowLabel: "捐锅"
        };
        const layout = buildLayout((board.players || []).length);
        const fitted = withNumFit(board, layout.colPx);
        this._holeY = 0;
        this.setData({
          loading: false,
          loadError: "",
          hasGames: !!(board && (board.hasGames || listed.length)),
          board: fitted,
          gameOptions: options,
          activeGameId: activeGameId,
          activePairId: activePairId,
          activeGameName: optionNameOf(options, activeGameId, activePairId),
          gameSelectEnabled: gameSelectEnabled,
          gameMenuOpen: false,
          needHScroll: layout.needHScroll,
          colPx: layout.colPx,
          bodyWidthPx: layout.bodyWidthPx,
          holePx: layout.holePx,
          holeY: 0,
          dockHScrollLeft: 0,
          boardHScrollLeft: 0,
          dockFootVisible: String(this.properties.layoutMode || "fill") === "flow" && !this.properties.ctaHidden
        });
        this.syncDockFromLayout();
      } catch (e) {
        this._reloadFail(e, "reload_exception");
      } finally {
        if (this.data.loading) this.setData({ loading: false });
      }
    },

    _syncLayoutFlag() {
      const flow = String(this.properties.layoutMode || "fill") === "flow";
      if (flow !== this.data.layoutIsFlow) {
        this.setData({
          layoutIsFlow: flow,
          dockFootVisible: flow ? this.data.dockFootVisible : false
        });
      }
      if (!flow && this.data.dockFootVisible) {
        this.setData({ dockFootVisible: false });
      }
    },

    _bottomReserve() {
      try {
        return dockFootVisibility.resolveBottomReserve(wx.getSystemInfoSync());
      } catch (e) {
        return 0;
      }
    },

    syncDockFromLayout() {
      if (this._dockTicking) return;
      this._dockTicking = true;
      wx.nextTick(() => {
        this._dockTicking = false;
        this._measureDock();
      });
    },

    setFlowTabBottom(px) {
      this._flowTabBottom = Math.max(0, Number(px) || 0);
      this.syncDockFromLayout();
    },

    _measureDock() {
      const flow = String(this.properties.layoutMode || "fill") === "flow";
      const hasResults = !!(this.data.hasGames && this.data.board && (this.data.board.holes || []).length);
      const always = flowStickyChrome.shouldAlwaysDockFoot({
        layoutIsFlow: flow,
        tabIsGame: true,
        hasResults: hasResults
      }) && !this.properties.ctaHidden;
      if (!flow || !hasResults) {
        const clear = {};
        if (this.data.dockFootVisible) clear.dockFootVisible = false;
        if (this.data.flowPinStuck) clear.flowPinStuck = false;
        if (this.data.flowHeadStuck) clear.flowHeadStuck = false;
        if (this.data.flowFootSpacerPx) clear.flowFootSpacerPx = 0;
        if (Object.keys(clear).length) this.setData(clear);
        return;
      }
      const reserve = this._bottomReserve();
      this.createSelectorQuery()
        .select(".js-pin-slot")
        .boundingClientRect()
        .select(".js-board-toolbar")
        .boundingClientRect()
        .select(".js-head-slot")
        .boundingClientRect()
        .select(".js-board-head")
        .boundingClientRect()
        .select(".js-game-results")
        .boundingClientRect()
        .select(".register-cta-bar")
        .boundingClientRect()
        .exec((res) => {
          const pinBar = res && res[1];
          const headEl = res && res[3];
          const pinH = pinBar && pinBar.height ? pinBar.height : this.data.flowPinH || 0;
          const headH = headEl && headEl.height ? headEl.height : this.data.flowHeadH || 0;
          const sticky = flowStickyChrome.computeFlowSticky({
            layoutIsFlow: true,
            tabIsGame: true,
            hasResults: true,
            tabBottom: this._flowTabBottom || 0,
            pinHeight: pinH,
            headHeight: headH,
            pinSlotRect: res && res[0],
            headSlotRect: res && res[2],
            gameRect: res && res[4]
          });
          const spacer = flowStickyChrome.computeFootSpacerPx(
            always ? (res && res[5] && res[5].height) : 0,
            always ? reserve + (headH || 40) : reserve
          );
          const patch = {};
          if (always !== this.data.dockFootVisible) patch.dockFootVisible = always;
          if (sticky.pinStuck !== this.data.flowPinStuck) patch.flowPinStuck = sticky.pinStuck;
          if (sticky.headStuck !== this.data.flowHeadStuck) patch.flowHeadStuck = sticky.headStuck;
          if (sticky.pinTop !== this.data.flowPinTop) patch.flowPinTop = sticky.pinTop;
          if (sticky.headTop !== this.data.flowHeadTop) patch.flowHeadTop = sticky.headTop;
          if (pinH && pinH !== this.data.flowPinH) patch.flowPinH = pinH;
          if (headH && headH !== this.data.flowHeadH) patch.flowHeadH = headH;
          if (spacer !== this.data.flowFootSpacerPx) patch.flowFootSpacerPx = spacer;
          if (Object.keys(patch).length) this.setData(patch);
        });
    },

    toggleGameMenu() {
      if (!this.data.gameSelectEnabled) {
        this.setData({ gameMenuOpen: false });
        return;
      }
      this.setData({ gameMenuOpen: !this.data.gameMenuOpen }, () => {
        this.syncDockFromLayout();
      });
    },

    toggleFold(e) {
      const id = e.currentTarget.dataset.id;
      if (!id) return;
      const options = this.data.gameOptions || [];
      let open = false;
      options.forEach(function (item) {
        if (item.id === id) open = !!(item.fold || item.pairFold);
        (item.children || []).forEach(function (child) {
          if (child.id === id) open = !!child.pairFold;
        });
      });
      const foldIds = Object.assign({}, this.data.foldIds || {});
      foldIds[id] = !open;
      this.setData(
        {
          foldIds: foldIds,
          gameOptions: gameOptionsOf(
            this.resolveEntry(),
            this._publishedGames(this.resolveEntry()),
            this._publishedGlobal(this.resolveEntry()),
            foldIds,
            this.data.activeGameId,
            this.data.activePairId
          )
        },
        () => {
          this.syncDockFromLayout();
        }
      );
    },

    onSelectGame(e) {
      const id = e.currentTarget.dataset.id;
      if (!id) {
        this.setData({ gameMenuOpen: false });
        return;
      }
      if (id === this.data.activeGameId && !this.data.activePairId) {
        this.setData({ gameMenuOpen: false });
        return;
      }
      this.setData({ activeGameId: id, activePairId: "" }, () => {
        session.setBoardView(this.resolveEntry(), id, "");
        this.reload();
      });
    },

    onSelectPair(e) {
      const gid = e.currentTarget.dataset.gid;
      const pid = e.currentTarget.dataset.pid;
      if (!gid || !pid) return;
      if (gid === this.data.activeGameId && String(pid) === String(this.data.activePairId)) {
        this.setData({ gameMenuOpen: false });
        return;
      }
      this.setData(
        { activeGameId: gid, activePairId: pid },
        () => {
          session.setBoardView(this.resolveEntry(), gid, pid);
          this.reload();
        }
      );
    },

    onBoardHScroll(e) {
      const left = (e.detail && e.detail.scrollLeft) || 0;
      const patch = {};
      if (left !== this.data.dockHScrollLeft) patch.dockHScrollLeft = left;
      if (left !== this.data.boardHScrollLeft) patch.boardHScrollLeft = left;
      if (Object.keys(patch).length) this.setData(patch);
    },

    onBodyVScroll(e) {
      if (this.data.layoutIsFlow) return;
      if (!this.data.needHScroll) return;
      const top = e.detail.scrollTop || 0;
      this._holeY = top;
      if (this._vTicking) return;
      this._vTicking = true;
      wx.nextTick(() => {
        this._vTicking = false;
        if (this.data.holeY === this._holeY) return;
        this.setData({ holeY: this._holeY });
      });
    },

    onAddGame() {
      var host = this._host;
      if (!host || !host.matchId) {
        wx.showToast({ title: "请从比赛页面进入", icon: "none" });
        return;
      }
      session.attachHost(host);
      var ctx = pageBoot.parseQuery({
        matchId: host.matchId,
        groupId: host.groupId,
        scope: host.scope
      });
      var entry = this.resolveEntry();
      var maxPlayers =
        entry === "hub" || entry === "match"
          ? session.getRuleDesignCap(entry)
          : session.getRuleCap(entry);
      wx.navigateTo({
        url: pageBoot.pageUrl("pages/list/index", ctx, {
          entry: entry,
          maxPlayers: maxPlayers
        })
      });
    },

    onManage() {
      this.setData({ gameMenuOpen: false });
      this.onAddGame();
    }
  }
});
