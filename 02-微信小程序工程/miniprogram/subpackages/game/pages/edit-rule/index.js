const { createHeaderStyle } = require("../../../../utils/headerEngine.js");
const session = require("../../utils/sideGameBind.js");
const rec = require("../../utils/sideGameRecord.js");
const catalog = require("../../utils/catalog.js");
const nav = require("../../utils/nav.js");
const numField = require("../../utils/numField.js");
const configGuard = require("../../utils/sideGameConfigGuard.js");
const ruleDefaults = require("../../utils/sideGameRuleDefaults.js");

const MUL_THUMB_LABEL = {
  m2: "鹰",
  m1: "鸟",
  par: "帕",
  p1: "+1",
  ge2: "+2及更差"
};

function rewardThumb(rows, op, identity) {
  const parts = (rows || [])
    .filter(function (row) {
      return MUL_THUMB_LABEL[row.id] && String(row.value) !== String(identity) && String(row.value) !== "";
    })
    .map(function (row) {
      return MUL_THUMB_LABEL[row.id] + op + row.value;
    });
  return parts.length ? parts.join(" · ") : "全部" + op + identity;
}

function mulThumb(rows) {
  return rewardThumb(rows, "×", "1");
}

function addThumb(rows) {
  return rewardThumb(rows, "+", "0");
}

function meatValueThumb(d) {
  if ((d && d.meatValueType) === "double") {
    const cap = d.meatCap === "cap" ? (d.meatCapN || "3") + "分封顶" : "不封顶";
    return "分值翻倍 · " + cap;
  }
  return "肉算" + ((d && d.meatValueN) || "2") + "分";
}

function meatRuleThumb(d) {
  return catalog.meatCountThumb(d) + " · " + meatValueThumb(d);
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

function baoFoldThumb(d) {
  const mode = (d && d.baoMode) || "none";
  if (mode === "none") return "";
  const pre = (d && d.baoPre) === "ahead" ? "顶头 · " : "";
  if (mode === "plus-n") return pre + "从+" + ((d && d.baoPlusN) || 4) + "包洞";
  if (mode === "doublepar-n") return pre + catalog.doubleParMark(d && d.baoDoubleN) + "包洞";
  if (mode === "partner-diff") return pre + "同伴杆差" + ((d && d.baoDiffN) || 3) + "杆包洞";
  return "";
}

function baoNegFoldThumb(d) {
  if (!d || d.baoNeg === "none") return "";
  if (d.baoNeg === "ignore") return "始终包自己产生的负分";
  return "同伴顶头才包负分";
}

function pushThumb8421(pushRule) {
  if (pushRule === "none") return "无顶洞";
  if (pushRule === "skip") return "顶洞即过";
  if (pushRule === "within-1") return "得分≤1分";
  if (pushRule === "within-2") return "得分≤2分";
  if (pushRule === "tie" || pushRule === "push") return "得分打平";
  return "有顶洞";
}

const SCORE_MAP_ROWS = [
  { id: "hio", label: "-3 / HIO" },
  { id: "m2", label: "-2" },
  { id: "m1", label: "-1" },
  { id: "par", label: "帕" },
  { id: "p1", label: "+1" },
  { id: "p2", label: "+2" },
  { id: "p3", label: "+3" }
];

const SCORE_MAP_DEFAULTS = ruleDefaults.SCORE_MAP_VALUES;

function hydrateScoreMapRows(saved) {
  return SCORE_MAP_ROWS.map(function (row, i) {
    const hit = (saved || []).find(function (item) {
      return item.id === row.id;
    });
    return Object.assign({}, row, {
      value:
        hit && hit.value != null && hit.value !== ""
          ? String(hit.value)
          : SCORE_MAP_DEFAULTS[i]
    });
  });
}

function scoreMapThumb(rows) {
  const vals = (rows && rows.length ? rows : hydrateScoreMapRows(null)).map(function (row) {
    return row.value;
  });
  return vals.join("/");
}

const REWARD_ROWS = [
  { id: "hio", label: "-3 / HIO" },
  { id: "m2", label: "-2" },
  { id: "m1", label: "-1" },
  { id: "par", label: "帕" },
  { id: "p1", label: "+1" },
  { id: "ge2", label: "+2及更差" }
];

const PUSH_OPTIONS_8421 = [
  { id: "skip", title: "顶洞即过" },
  { id: "tie", title: "得分打平" },
  { id: "within-1", title: "得分1分及以内" },
  { id: "within-2", title: "得分2分及以内" }
];

const MEAT_ROWS_8421 = [
  { id: "le-2", label: "-2及更好" },
  { id: "m1", label: "-1" },
  { id: "par", label: "帕" },
  { id: "p1", label: "+1" },
  { id: "ge-2", label: "+2及更差" }
];

function defaultMeatRows() {
  const seeded = ruleDefaults.meatRows8421AllOne();
  return MEAT_ROWS_8421.map(function (row) {
    const hit = seeded.find(function (item) {
      return item.id === row.id;
    });
    return Object.assign({}, row, { value: hit ? String(hit.value) : "1" });
  });
}

function hydrateRewardRows(saved, fallbackValues) {
  return REWARD_ROWS.map(function (row, i) {
    const hit = (saved || []).find(function (item) {
      return item.id === row.id;
    });
    return Object.assign({}, row, {
      value:
        hit && hit.value != null && hit.value !== ""
          ? String(hit.value)
          : fallbackValues[i]
    });
  });
}

const COMBO_MUL_ROWS = [
  { id: "m2-m2", label: "(-2) & (-2)" },
  { id: "m2-m1", label: "(-2) & (-1)" },
  { id: "m1-m1", label: "(-1) & (-1)" }
];

function hydrateComboMulRows(saved) {
  const defaults = ["25", "10", "4"];
  return COMBO_MUL_ROWS.map(function (row, i) {
    const hit = (saved || []).find(function (item) {
      return item.id === row.id;
    });
    return Object.assign({}, row, {
      value: hit && hit.value != null && hit.value !== "" ? String(hit.value) : defaults[i]
    });
  });
}

const MEAT_ROWS_LANDLORD = [
  { id: "le-2", label: "-2及更好" },
  { id: "m1", label: "-1" },
  { id: "par", label: "帕" },
  { id: "ge-1", label: "+1及更差" }
];

function defaultLandlordMeatRows() {
  const values = ["3", "2", "1", "0"];
  return MEAT_ROWS_LANDLORD.map(function (row, i) {
    return Object.assign({}, row, { value: values[i] });
  });
}

function normalizeMeatCount(value, fallback) {
  const raw = String(value == null ? "" : value).trim();
  if (raw === "全部") return "3";
  if (raw === "") return fallback;
  return raw;
}

const MEAT_ROWS_MATCH = [
  { id: "le-2", label: "鹰" },
  { id: "m1", label: "鸟" },
  { id: "par", label: "帕" },
  { id: "ge-1", label: "+1及更差" }
];

function defaultMatchMeatRows() {
  const seeded = ruleDefaults.matchMeatRows();
  return MEAT_ROWS_MATCH.map(function (row, i) {
    const hit = seeded.find(function (item) {
      return item.id === row.id;
    });
    return Object.assign({}, row, { value: hit ? String(hit.value) : ["3", "2", "1", "0"][i] });
  });
}

function hydrateMatchMeatRows(saved) {
  const fallback = defaultMatchMeatRows();
  if (!saved || !saved.length) return fallback;
  const allOne = saved.every(function (row) {
    return String(row.value == null ? "" : row.value).trim() === "1";
  });
  const hasMatchWorse = saved.some(function (row) {
    return row.id === "ge-1";
  });
  if (allOne || !hasMatchWorse) return fallback;
  return fallback.map(function (row, i) {
    const hit =
      saved.find(function (item) {
        return item.id === row.id;
      }) || saved[i];
    return Object.assign({}, row, {
      value: normalizeMeatCount(hit && hit.value, fallback[i].value)
    });
  });
}

function matchMeatThumb(d) {
  return (
    catalog.meatCountThumb(d) +
    " · " +
    ((d && d.meatInclude) === "yes" ? "肉含奖励" : "肉不含奖励")
  );
}

function vegasPushThumb(d) {
  let t = "得分打平";
  if (d && d.pushRule === "none") t = "无顶洞";
  else if (d && d.pushRule === "within-n") t = "分差≤" + ((d && d.pushWithinN) || 2);
  if (d && d.pushRule !== "none") {
    t += (d && d.reorderOnPush) === "yes" ? " · 顶洞换组合" : " · 顶洞不换组合";
  }
  return t;
}

function comboCapThumb(d) {
  if ((d && d.comboCap) === "cap") return "封顶至" + ((d && d.comboCapN) || "99");
  return "不封顶";
}

function tvoCompareThumb(value) {
  if (value === "avg") return "平均成绩";
  if (value === "worst") return "最差成绩";
  return "最好成绩";
}

function hydrateLandlordMeatRows(saved) {
  const fallback = defaultLandlordMeatRows();
  if (!saved || !saved.length) return fallback;
  return fallback.map(function (row, i) {
    const hit = saved.find(function (item) {
      return item.id === row.id;
    }) || saved[i];
    return Object.assign({}, row, {
      value: normalizeMeatCount(hit && hit.value, fallback[i].value)
    });
  });
}

function hydrateTvoMeatRows(saved, meatCount) {
  if (saved && saved.length) return hydrateLandlordMeatRows(saved);
  const n = normalizeMeatCount(meatCount, "");
  if (n !== "" && isNonNegInt(n)) {
    return defaultLandlordMeatRows().map(function (row) {
      return Object.assign({}, row, { value: n });
    });
  }
  return defaultLandlordMeatRows();
}

function hydrateMeatRows(saved) {
  const fallback = defaultMeatRows();
  if (!saved || !saved.length) return fallback;
  return fallback.map(function (row) {
    const hit = saved.find(function (item) {
      return item.id === row.id;
    });
    return Object.assign({}, row, {
      value: hit && hit.value != null && hit.value !== "" ? String(hit.value) : "1"
    });
  });
}

function positivePlayers() {
  for (let i = 0; i < arguments.length; i++) {
    const n = Number(arguments[i]);
    if (n > 0) return n;
  }
  return 2;
}

function normalizePushRule(value, is8421, is8421Two) {
  if (is8421Two) {
    if (value === "skip") return "none";
    if (value === "none" || value === "tie" || value === "within-1" || value === "within-2") return value;
    if (value === "push") return "tie";
    return "tie";
  }
  if (value === "none") return "skip";
  if (value === "push") return "tie";
  if (value === "skip" || value === "tie" || value === "within-1" || value === "within-2") {
    return value;
  }
  return is8421 ? "tie" : "skip";
}

function isNonNegInt(value) {
  return /^(0|[1-9]\d*)$/.test(String(value == null ? "" : value).trim());
}

const PARENT_FOLD_FIELDS = [
  "lasuoFoldPk",
  "lasuoFoldCompare",
  "lasuoFoldReward",
  "lasuoFoldPush",
  "lasuoFoldMeat",
  "lasuoFoldBao",
  "lasuoFoldCap",
  "lasuoFoldScore",
  "lasuoFoldDeduct",
  "lasuoFoldBaoNeg"
];

const NESTED_FOLD_FIELDS = [
  "matchFoldMul",
  "foldAdd",
  "foldScore",
  "foldDeduct",
  "foldPush",
  "foldMeat",
  "foldMeatValue",
  "foldBao",
  "foldBaoNeg"
];

const NESTED_PARENT = {
  matchFoldMul: "lasuoFoldReward",
  foldAdd: "lasuoFoldReward",
  foldMeat: "lasuoFoldMeat",
  foldMeatValue: "lasuoFoldMeat",
  foldBao: "lasuoFoldBao",
  foldDeduct: "lasuoFoldDeduct",
  foldPush: "lasuoFoldPush",
  foldBaoNeg: "lasuoFoldBaoNeg"
};

function exclusiveFoldPatch(data, field) {
  const nested = NESTED_FOLD_FIELDS.indexOf(field) >= 0;
  const opening = !data[field];
  if (!opening) {
    const patch = {};
    patch[field] = false;
    return patch;
  }
  const patch = {};
  PARENT_FOLD_FIELDS.forEach(function (key) {
    patch[key] = false;
  });
  NESTED_FOLD_FIELDS.forEach(function (key) {
    patch[key] = false;
  });
  patch[field] = true;
  if (nested && (data.showLasuo || data.showLandlordBig || data.showDizhubo || data.showThreeVsOne || data.show8421Three || data.showReward || data.matchPlay || data.showPush8421 || data.showVegas)) {
    if (data.show8421Three && field === "foldMeatValue") {
      patch.foldMeat = true;
      patch.lasuoFoldMeat = true;
    } else {
      const parent = NESTED_PARENT[field];
      if (parent) patch[parent] = true;
    }
  }
  return patch;
}

Page({
  data: {
    headerRootStyle: "",
    headerBarStyle: "",
    entry: "score",
    maxPlayers: 4,
    ruleId: "",
    ruleName: "比杆",
    nameDirty: false,
    headerTitle: "规则配置",
    players: 2,
    matchPlay: false,
    reward: "none",
    addRows: hydrateRewardRows(null, ["10", "4", "1", "0", "0", "0"]),
    mulRows: hydrateRewardRows(null, ["10", "5", "2", "1", "1", "1"]),
    pushRule: "none",
    meatInclude: "no",
    libId: "",
    showReward: true,
    showPush8421: false,
    noSettings: false,
    fromInstance: false,
    isEditing: false,
    pushOptions: PUSH_OPTIONS_8421,
    meatRows: [
      { id: "le-2", label: "-2及更好", value: "1" },
      { id: "m1", label: "-1", value: "1" },
      { id: "par", label: "帕", value: "1" },
      { id: "p1", label: "+1", value: "1" },
      { id: "ge-2", label: "+2及更差", value: "1" }
    ],
    meatValueType: "fixed",
    meatValueN: "2",
    meatEatMode: "by-score",
    showLandlord: false,
    showLandlordBig: false,
    showLandlordReorder: false,
    showLandlordMeatTable: false,
    showLandlordAutoMeat: false,
    showDizhubo: false,
    showVegas: false,
    comboCap: "none",
    comboCapN: "99",
    showBaoHole: false,
    reorderOnPush: "no",
    baoMode: "none",
    baoPlusN: "4",
    baoDoubleN: "0",
    baoDiffN: "3",
    baoPre: "ignore",
    showBaoNeg: false,
    baoNeg: "none",
    showLasuo: false,
    showThreeVsOne: false,
    tvoCompare: "best",
    tvoCompareText: "最好成绩",
    meatCount: "1",
    lasuoFoldPk: false,
    lasuoFoldCompare: false,
    lasuoFoldReward: false,
    lasuoFoldPush: false,
    lasuoFoldMeat: false,
    lasuoFoldBao: false,
    lasuoFoldCap: false,
    comboCapText: "不封顶",
    lasuoFoldScore: false,
    lasuoFoldDeduct: false,
    lasuoFoldBaoNeg: false,
    show8421Three: false,
    pkBetter: true,
    pkWorse: true,
    pkTotal: true,
    pkBetterW: "1",
    pkWorseW: "1",
    pkTotalW: "1",
    pkTotalMode: "sum",
    pkWeightTotal: 3,
    pkBoxShow: true,
    comboMulRows: hydrateComboMulRows(null),
    addPre: "win",
    pushWithinN: "1",
    meatCap: "none",
    meatCapN: "3",
    lasuoPkText: "较好1·较差1·总和1",
    lasuoRewardText: "无奖励",
    lasuoPushText: "得分打平",
    lasuoMeatText: "",
    lasuoMeatCountText: "",
    lasuoMeatValueText: "",
    lasuoBaoText: "不包洞",
    matchFoldMul: false,
    matchMulText: "",
    foldAdd: false,
    addText: "",
    show8421Two: false,
    foldMeat: false,
    foldMeatValue: false,
    meatText: "",
    deductMode: "on",
    deductWay: "plus-n",
    deductPlusN: "4",
    deductDoubleN: "0",
    deductCap: "none",
    deductCapN: "3",
    foldDeduct: false,
    deductText: "",
    scoreRows: hydrateScoreMapRows(null),
    foldScore: false,
    scoreText: scoreMapThumb(null),
    foldPush: false,
    pushText: "",
    foldBao: false,
    baoText: "",
    foldBaoNeg: false,
    baoNegText: "",
    numEditing: false,
    numEditList: "",
    numEditId: "",
    numEditField: "",
    numEditDraft: "",
    canEdit: true,
    canView: true,
    pageMode: "edit",
    readonlyHint: ""
  },

  onNumFocus: numField.onNumFocus,
  onNumInput: numField.onNumInput,
  onNumBlur: numField.onNumBlur,

  onLoad(query) {
    if (!session.ensureHost(query)) return;
    const libId = decodeURIComponent((query && query.libId) || "");
    const entry = (query && query.entry) || "score";
    if (!session.requireSetupDraft(entry)) return;
    const header = createHeaderStyle();
    const row = session.getMyRuleById(libId);
    const existing = row ? rec.draftFromLibraryRow(row, decodeURIComponent((query && query.ruleId) || "")) : null;
    const ruleId = (existing && existing.catalogId) || decodeURIComponent((query && query.ruleId) || "");
    if (catalog.isUnavailableRule(ruleId)) {
      wx.showToast({ title: "玩法尚未开放", icon: "none" });
      nav.navigateBackSafe(1);
      return;
    }
    const is8421 = catalog.is8421(ruleId);
    const is8421Two = String(ruleId) === "8421-2";
    const is8421Three = catalog.is8421Three(ruleId);
    const is8421Fold = is8421;
    const isLandlord = catalog.isLandlordFamily(ruleId);
    const isMid = catalog.isLandlordMid(ruleId);
    const isSmall = catalog.isLandlordSmall(ruleId);
    const isLasuo = catalog.isLasuo4(ruleId);
    const isTvo = catalog.isThreeVsOne(ruleId);
    const isDizhubo = catalog.isDizhubo4(ruleId);
    const isVegas = catalog.isVegas(ruleId);
    const addRows = hydrateRewardRows(existing && existing.addRows, ruleDefaults.ADD_REWARD_VALUES);
    const catalogItem = catalog.findRule(ruleId);
    const matchPlay =
      String(ruleId) === "match-2" ||
      !!(catalogItem && catalogItem.matchPlay) ||
      !!(existing && existing.matchPlay) ||
      (query && query.matchPlay) === "1";
    const noSettings = catalog.isNoSettings(catalogItem || ruleId) || !!(existing && existing.noSettings);
    const mulRows = hydrateRewardRows(existing && existing.mulRows, ruleDefaults.MUL_REWARD_VALUES);
    const scoreRows = hydrateScoreMapRows(existing && existing.scoreRows);
    const comboMulRows = hydrateComboMulRows(existing && existing.comboMulRows);
    const landlordPush = (existing && existing.pushRule) || "push";
    const lasuoPush =
      existing && existing.pushRule === "none"
        ? "none"
        : existing && existing.pushRule === "within-n"
          ? "within-n"
          : "push";
    const lasuoDraft = {
      pkBetter: !existing || existing.pkBetter !== false,
      pkWorse: !existing || existing.pkWorse !== false,
      pkTotal: !existing || existing.pkTotal !== false,
      pkBetterW: existing && existing.pkBetterW != null && existing.pkBetterW !== "" ? String(existing.pkBetterW) : "1",
      pkWorseW: existing && existing.pkWorseW != null && existing.pkWorseW !== "" ? String(existing.pkWorseW) : "1",
      pkTotalW: existing && existing.pkTotalW != null && existing.pkTotalW !== "" ? String(existing.pkTotalW) : "1",
      pkTotalMode: existing && existing.pkTotalMode === "product" ? "product" : "sum",
      reward: existing ? existing.reward : "none",
      pushRule: lasuoPush,
      pushWithinN: existing && existing.pushWithinN != null && existing.pushWithinN !== "" ? String(existing.pushWithinN) : "1",
      meatRows: isLasuo
        ? hydrateLandlordMeatRows(existing && existing.meatRows)
        : hydrateMeatRows(existing && existing.meatRows),
      baoMode: (existing && existing.baoMode) || "none",
      baoPlusN: existing && existing.baoPlusN != null && existing.baoPlusN !== "" ? String(existing.baoPlusN) : "4",
      baoDoubleN: existing && existing.baoDoubleN != null && existing.baoDoubleN !== "" ? String(existing.baoDoubleN) : "0",
      baoDiffN: existing && existing.baoDiffN != null && existing.baoDiffN !== "" ? String(existing.baoDiffN) : "3",
      baoPre: isLasuo
        ? existing && existing.baoPre === "ignore"
          ? "ignore"
          : "ahead"
        : existing && existing.baoPre === "ahead"
          ? "ahead"
          : "ignore"
    };
    const lasuoUi = catalog.lasuoHubSummaries(lasuoDraft);
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle,
      entry: (query && query.entry) || "score",
      maxPlayers: Number((query && query.maxPlayers) || 4),
      libId: existing ? existing.id : "",
      isEditing: !!existing,
      fromInstance: (query && query.from) === "instance",
      nameDirty: !!existing,
      ruleId: ruleId,
      ruleName: existing
        ? existing.name
        : isLasuo
          ? catalog.lasuoDefaultName(lasuoDraft)
          : decodeURIComponent((query && query.ruleName) || "比杆"),
      players: positivePlayers(
        existing && existing.players,
        query && query.players,
        catalogItem && catalogItem.players,
        2
      ),
      headerTitle: "规则配置",
      matchPlay: matchPlay,
      showReward: !is8421 && !matchPlay && !isLandlord && !isLasuo && !isTvo && !isDizhubo && !isVegas && !noSettings,
      showThreeVsOne: isTvo,
      tvoCompare:
        existing && (existing.tvoCompare === "avg" || existing.tvoCompare === "worst")
          ? existing.tvoCompare
          : "best",
      tvoCompareText: tvoCompareThumb(
        existing && (existing.tvoCompare === "avg" || existing.tvoCompare === "worst")
          ? existing.tvoCompare
          : "best"
      ),
      meatCount: "1",
      showLandlord: isLandlord || isDizhubo,
      showLandlordBig: isLandlord,
      showLandlordReorder: (isLandlord && !isMid) || isDizhubo,
      showLandlordMeatTable: (isLandlord && !isSmall) || isDizhubo,
      showLandlordAutoMeat: isSmall,
      showDizhubo: isDizhubo,
      showVegas: isVegas,
      showBaoHole: isMid || isSmall,
      showBaoNeg: is8421 && !is8421Two,
      showLasuo: isLasuo,
      showPush8421: is8421 && !is8421Fold,
      show8421Two: is8421Fold,
      show8421Three: is8421Fold,
      noSettings: noSettings,
      pushOptions: PUSH_OPTIONS_8421,
      reward: isVegas
        ? "none"
        : isLandlord || isTvo || isDizhubo
          ? ((existing && existing.reward) === "mul" ? "mul" : "none")
          : isLasuo
            ? lasuoDraft.reward
            : matchPlay
              ? ((existing && existing.reward) === "none" ? "none" : "mul")
              : ((existing && existing.reward) || "none"),
      addRows: addRows,
      mulRows: mulRows,
      matchMulText: mulThumb(mulRows),
      matchFoldMul: false,
      addText: addThumb(addRows),
      foldAdd: false,
      scoreRows: scoreRows,
      foldScore: false,
      scoreText: scoreMapThumb(scoreRows),
      foldPush: false,
      meatText: "",
      foldMeat: false,
      foldMeatValue: false,
      deductMode: is8421Fold && existing && existing.deductMode === "none" ? "none" : "on",
      deductWay: existing && existing.deductWay === "doublepar-n" ? "doublepar-n" : "plus-n",
      deductPlusN:
        existing && existing.deductPlusN != null && existing.deductPlusN !== ""
          ? String(existing.deductPlusN)
          : "4",
      deductDoubleN:
        existing && existing.deductDoubleN != null && existing.deductDoubleN !== ""
          ? String(existing.deductDoubleN)
          : "0",
      deductCap: existing
        ? existing.deductCap === "cap"
          ? "cap"
          : "none"
        : is8421Two
          ? "cap"
          : "none",
      deductCapN:
        existing && existing.deductCapN != null && existing.deductCapN !== ""
          ? String(existing.deductCapN)
          : is8421Two
            ? "2"
            : "3",
      foldDeduct: false,
      deductText: deductThumb({
        deductMode: is8421Fold && existing && existing.deductMode === "none" ? "none" : "on",
        deductWay: existing && existing.deductWay === "doublepar-n" ? "doublepar-n" : "plus-n",
        deductPlusN:
          existing && existing.deductPlusN != null && existing.deductPlusN !== ""
            ? String(existing.deductPlusN)
            : "4",
        deductDoubleN:
          existing && existing.deductDoubleN != null && existing.deductDoubleN !== ""
            ? String(existing.deductDoubleN)
            : "0",
        deductCap: existing
          ? existing.deductCap === "cap"
            ? "cap"
            : "none"
          : is8421Two
            ? "cap"
            : "none",
        deductCapN:
          existing && existing.deductCapN != null && existing.deductCapN !== ""
            ? String(existing.deductCapN)
            : is8421Two
              ? "2"
              : "3"
      }),
      comboMulRows: comboMulRows,
      pushRule: is8421
        ? normalizePushRule(existing && existing.pushRule, true, is8421Fold)
        : isLandlord || isDizhubo
          ? landlordPush === "none"
            ? "none"
            : "push"
        : isLasuo || isVegas
          ? lasuoPush
          : isTvo
            ? landlordPush === "none"
              ? "none"
              : "push"
            : matchPlay
              ? ((existing && existing.pushRule) === "none" ? "none" : "push")
              : ((existing && existing.pushRule) || "none"),
      foldBao: false,
      baoText: "",
      foldBaoNeg: false,
      baoNegText: "",
      foldPush: false,
      pushText: is8421Fold
        ? pushThumb8421(normalizePushRule(existing && existing.pushRule, true, true))
        : "",
      reorderOnPush: isMid
        ? "no"
        : (existing && existing.reorderOnPush) === "yes"
          ? "yes"
          : "no",
      meatInclude: (existing && existing.meatInclude) || "no",
      meatRows: isTvo
        ? hydrateTvoMeatRows(existing && existing.meatRows, existing && existing.meatCount)
        : matchPlay
          ? hydrateMatchMeatRows(existing && existing.meatRows)
          : (isLandlord && !isSmall) || isLasuo || isDizhubo || isVegas
            ? hydrateLandlordMeatRows(existing && existing.meatRows)
            : hydrateMeatRows(existing && existing.meatRows),
      baoMode: (existing && existing.baoMode) || "none",
      baoPlusN: existing && existing.baoPlusN != null && existing.baoPlusN !== ""
        ? String(existing.baoPlusN)
        : "4",
      baoDoubleN: existing && existing.baoDoubleN != null && existing.baoDoubleN !== ""
        ? String(existing.baoDoubleN)
        : "0",
      baoDiffN: existing && existing.baoDiffN != null && existing.baoDiffN !== ""
        ? String(existing.baoDiffN)
        : "3",
      baoPre: lasuoDraft.baoPre,
      baoNeg:
        existing && existing.baoNeg === "ahead"
          ? "ahead"
          : existing && existing.baoNeg === "ignore"
            ? "ignore"
            : "none",
      meatValueType: isLasuo
        ? (existing && existing.meatValueType === "fixed" ? "fixed" : "double")
        : existing
          ? existing.meatValueType === "double"
            ? "double"
            : "fixed"
          : is8421Two
            ? "double"
            : "fixed",
      meatValueN: existing && existing.meatValueN != null && existing.meatValueN !== ""
        ? String(existing.meatValueN)
        : isVegas
          ? "10"
          : "2",
      meatEatMode: (existing && existing.meatEatMode) === "all-double" ? "all-double" : "by-score",
      pkBetter: lasuoDraft.pkBetter,
      pkWorse: lasuoDraft.pkWorse,
      pkTotal: lasuoDraft.pkTotal,
      pkBetterW: lasuoDraft.pkBetterW,
      pkWorseW: lasuoDraft.pkWorseW,
      pkTotalW: lasuoDraft.pkTotalW,
      pkTotalMode: lasuoDraft.pkTotalMode,
      pkWeightTotal: lasuoUi.pkWeightTotal,
      addPre: (existing && existing.addPre) || "win",
      pushWithinN: isVegas
        ? existing && existing.pushWithinN != null && existing.pushWithinN !== ""
          ? String(existing.pushWithinN)
          : "2"
        : lasuoDraft.pushWithinN,
      comboCap: existing && existing.comboCap === "cap" ? "cap" : "none",
      comboCapN: existing && existing.comboCapN != null && existing.comboCapN !== ""
        ? String(existing.comboCapN)
        : "99",
      meatCap: existing && existing.meatCap === "cap" ? "cap" : "none",
      meatCapN: existing && existing.meatCapN != null && existing.meatCapN !== ""
        ? String(existing.meatCapN)
        : "3",
      lasuoPkText: lasuoUi.lasuoPkText,
      lasuoRewardText: lasuoUi.lasuoRewardText,
      lasuoPushText: lasuoUi.lasuoPushText,
      lasuoMeatText: lasuoUi.lasuoMeatText,
      lasuoMeatCountText: lasuoUi.lasuoMeatCountText,
      lasuoMeatValueText: lasuoUi.lasuoMeatValueText,
      lasuoBaoText: lasuoUi.lasuoBaoText
    });
    this.refreshMeat();
    this.refreshBao();
    this.refreshBaoNeg();
    this.refreshLasuo();
    this._bootConfigGuard();
  },

  _bootConfigGuard() {
    configGuard.attach(this, {});
    if (this._captureInitialSnapshot) this._captureInitialSnapshot();
  },

  onBack() {
    if (this._leaveIfClean) {
      this._leaveIfClean(function () {
        nav.navigateBackSafe(1);
      });
      return;
    }
    nav.navigateBackSafe(1);
  },

  stopTap() {},

  onName(e) {
    this.setData({
      ruleName: e.detail.value,
      nameDirty: true
    });
  },

  setReward(e) {
    const value = e.currentTarget.dataset.value;
    if ((this.data.showLandlord || this.data.showThreeVsOne || this.data.matchPlay) && value === "add") return;
    const patch = { reward: value };
    if (value !== "mul") patch.matchFoldMul = false;
    if (value !== "add") patch.foldAdd = false;
    this.setData(patch);
    this.refreshLasuo();
  },

  setReorder(e) {
    this.setData({ reorderOnPush: e.currentTarget.dataset.value });
    this.refreshLasuo();
  },

  setBaoMode(e) {
    this.setData({ baoMode: e.currentTarget.dataset.value });
    this.refreshBao();
    this.refreshLasuo();
  },

  keepBaoMode(e) {
    this.setData({ baoMode: e.currentTarget.dataset.value });
    this.refreshBao();
    this.refreshLasuo();
  },

  setBaoOnOff(e) {
    const value = e.currentTarget.dataset.value;
    if (value === "none") {
      this.setData({ baoMode: "none", foldBao: false });
      this.refreshBao();
      this.refreshLasuo();
      return;
    }
    if (this.data.baoMode !== "none") {
      this.toggleExclusiveFold("foldBao");
      return;
    }
    const patch = exclusiveFoldPatch(this.data, "foldBao");
    patch.baoMode = "plus-n";
    this.setData(patch);
    this.refreshBao();
    this.refreshLasuo();
  },

  toggleFoldBao() {
    this.toggleExclusiveFold("foldBao");
  },

  refreshBao() {
    this.setData({ baoText: baoFoldThumb(this.data) });
  },

  setBaoPre(e) {
    this.setData({ baoPre: e.currentTarget.dataset.value });
    this.refreshBao();
    this.refreshLasuo();
  },

  setBaoNeg(e) {
    this.setData({ baoNeg: e.currentTarget.dataset.value });
    this.refreshBaoNeg();
    this.refreshLasuo();
  },

  setBaoNegOnOff(e) {
    const value = e.currentTarget.dataset.value;
    if (value === "none") {
      this.setData({ baoNeg: "none", foldBaoNeg: false });
      this.refreshBaoNeg();
      this.refreshLasuo();
      return;
    }
    const next = this.data.baoNeg === "none" ? "ahead" : this.data.baoNeg;
    if (this.data.baoNeg !== "none") {
      this.toggleExclusiveFold("foldBaoNeg");
      return;
    }
    const patch = exclusiveFoldPatch(this.data, "foldBaoNeg");
    patch.baoNeg = next;
    this.setData(patch);
    this.refreshBaoNeg();
    this.refreshLasuo();
  },

  toggleFoldBaoNeg() {
    this.toggleExclusiveFold("foldBaoNeg");
  },

  refreshBaoNeg() {
    this.setData({
      baoNegText: this.data.baoNeg === "none" ? "不包负分" : baoNegFoldThumb(this.data)
    });
  },

  onBaoPlusN(e) {
    this.setData({
      baoMode: "plus-n",
      baoPlusN: e.detail.value
    });
    this.refreshBao();
  },

  onBaoDoubleN(e) {
    this.setData({
      baoMode: "doublepar-n",
      baoDoubleN: e.detail.value
    });
    this.refreshBao();
  },

  onBaoDiffN(e) {
    this.setData({
      baoMode: "partner-diff",
      baoDiffN: e.detail.value
    });
    this.refreshBao();
  },

  setPush(e) {
    const value = e.currentTarget.dataset.value;
    const patch = { pushRule: value, pushText: pushThumb8421(value) };
    if (value === "none") {
      patch.foldMeat = false;
      patch.foldMeatValue = false;
      patch.foldPush = false;
      patch.lasuoFoldMeat = false;
    }
    this.setData(patch);
    this.refreshLasuo();
  },

  setPushMode(e) {
    const value = e.currentTarget.dataset.value;
    if (value === "none") {
      this.setData({
        pushRule: "none",
        foldPush: false,
        foldMeat: false,
        foldMeatValue: false,
        lasuoFoldMeat: false,
        pushText: "无顶洞"
      });
      this.refreshLasuo();
      return;
    }
    if (this.data.pushRule !== "none") {
      this.toggleExclusiveFold("foldPush");
      return;
    }
    const patch = exclusiveFoldPatch(this.data, "foldPush");
    patch.pushRule = this.data.showVegas ? "push" : "tie";
    patch.pushText = pushThumb8421(patch.pushRule);
    this.setData(patch);
    this.refreshLasuo();
  },

  toggleExclusiveFold(field) {
    if (PARENT_FOLD_FIELDS.indexOf(field) < 0 && NESTED_FOLD_FIELDS.indexOf(field) < 0) return;
    this.setData(exclusiveFoldPatch(this.data, field));
  },

  toggleFoldPush() {
    this.toggleExclusiveFold("foldPush");
  },

  setMeatEatMode(e) {
    const value = e.currentTarget.dataset.value;
    const patch = { meatEatMode: value };
    if (value !== "by-score") {
      patch.foldMeat = false;
      patch.foldMeatValue = false;
    }
    this.setData(patch);
    this.refreshMeat();
    this.refreshLasuo();
  },

  setMeat(e) {
    this.setData({ meatInclude: e.currentTarget.dataset.value });
    this.refreshLasuo();
    this.refreshMeat();
  },

  setMeatValueType(e) {
    this.setData({ meatValueType: e.currentTarget.dataset.value });
    this.refreshLasuo();
    this.refreshMeat();
  },

  setLasuoMeatValue(e) {
    this.setData({
      meatValueType: e.currentTarget.dataset.type,
      meatInclude: e.currentTarget.dataset.include || "no"
    });
    this.refreshLasuo();
    this.refreshMeat();
  },

  keepFixedMeat() {
    this.setData({ meatValueType: "fixed" });
    this.refreshMeat();
    this.refreshLasuo();
  },

  keepMeatCap() {
    this.setData({ meatCap: "cap" });
    this.refreshMeat();
    this.refreshLasuo();
  },

  onMeatValueN(e) {
    this.setData({
      meatValueType: "fixed",
      meatValueN: e.detail.value
    });
    this.refreshLasuo();
    this.refreshMeat();
  },

  onAddRow(e) {
    const id = e.currentTarget.dataset.id;
    const addRows = this.data.addRows.map(function (row) {
      if (row.id !== id) return row;
      return Object.assign({}, row, { value: e.detail.value });
    });
    this.setData({ addRows: addRows, addText: addThumb(addRows) });
    this.refreshLasuo();
  },

  onMeatRow(e) {
    const id = e.currentTarget.dataset.id;
    const meatRows = this.data.meatRows.map(function (row) {
      if (row.id !== id) return row;
      return Object.assign({}, row, { value: e.detail.value });
    });
    this.setData({ meatRows: meatRows });
    this.refreshMeat();
    this.refreshLasuo();
  },

  onMulRow(e) {
    const id = e.currentTarget.dataset.id;
    const mulRows = this.data.mulRows.map(function (row) {
      if (row.id !== id) return row;
      return Object.assign({}, row, { value: e.detail.value });
    });
    this.setData({ mulRows: mulRows, matchMulText: mulThumb(mulRows) });
    this.refreshLasuo();
  },

  onScoreRow(e) {
    const id = e.currentTarget.dataset.id;
    const scoreRows = this.data.scoreRows.map(function (row) {
      if (row.id !== id) return row;
      return Object.assign({}, row, { value: e.detail.value });
    });
    this.setData({ scoreRows: scoreRows, scoreText: scoreMapThumb(scoreRows) });
  },

  onComboMulRow(e) {
    const id = e.currentTarget.dataset.id;
    const comboMulRows = this.data.comboMulRows.map(function (row) {
      if (row.id !== id) return row;
      return Object.assign({}, row, { value: e.detail.value });
    });
    this.setData({ comboMulRows: comboMulRows });
    this.refreshLasuo();
  },

  refreshLasuo() {
    if (this.data.showVegas) {
      const extra = catalog.lasuoHubSummaries(this.data);
      extra.lasuoPushText = vegasPushThumb(this.data);
      extra.lasuoMeatValueText = meatValueThumb(this.data);
      extra.lasuoMeatText = extra.lasuoMeatCountText + " · " + extra.lasuoMeatValueText;
      extra.comboCapText = comboCapThumb(this.data);
      this.setData(extra);
      return;
    }
    if (this.data.showLasuo) {
      const extra = catalog.lasuoHubSummaries(this.data);
      if (!this.data.nameDirty) extra.ruleName = catalog.lasuoDefaultName(this.data);
      this.setData(extra);
      return;
    }
    if (this.data.showLandlordBig || this.data.showDizhubo || this.data.showThreeVsOne) {
      const extra = catalog.lasuoHubSummaries(this.data);
      extra.lasuoRewardText =
        this.data.reward === "mul" ? mulThumb(this.data.mulRows) : "无奖励";
      extra.lasuoMeatValueText = this.data.meatInclude === "yes" ? "肉含奖励" : "肉不含奖励";
      extra.lasuoMeatText = extra.lasuoMeatCountText + " · " + extra.lasuoMeatValueText;
      if (this.data.showThreeVsOne) {
        extra.tvoCompareText = tvoCompareThumb(this.data.tvoCompare);
      }
      this.setData(extra);
    }
    if (this.data.showReward || this.data.matchPlay) {
      const extra = {
        lasuoRewardText:
          this.data.reward === "add"
            ? addThumb(this.data.addRows)
            : this.data.reward === "mul"
              ? mulThumb(this.data.mulRows)
              : "无奖励"
      };
      if (this.data.matchPlay) {
        extra.lasuoPushText = catalog.lasuoHubSummaries(this.data).lasuoPushText;
        extra.lasuoMeatCountText = catalog.meatCountThumb(this.data);
        extra.lasuoMeatValueText = this.data.meatInclude === "yes" ? "肉含奖励" : "肉不含奖励";
        extra.lasuoMeatText = extra.lasuoMeatCountText + " · " + extra.lasuoMeatValueText;
      }
      this.setData(extra);
    }
    if (this.data.show8421Three || this.data.showPush8421) {
      this.setData({
        scoreText: scoreMapThumb(this.data.scoreRows),
        deductText: this.data.deductMode === "none" ? "不扣分" : deductThumb(this.data),
        pushText: pushThumb8421(this.data.pushRule),
        meatText:
          this.data.meatEatMode === "all-double" ? "一次全吃，连续翻倍" : meatRuleThumb(this.data),
        lasuoMeatCountText: catalog.meatCountThumb(this.data),
        lasuoMeatValueText: meatValueThumb(this.data),
        baoNegText: this.data.baoNeg === "none" ? "不包负分" : baoNegFoldThumb(this.data) || "包负分"
      });
    }
  },

  toggleMatchMulFold() {
    this.toggleExclusiveFold("matchFoldMul");
  },

  toggleFoldAdd() {
    this.toggleExclusiveFold("foldAdd");
  },

  toggleFoldMeat() {
    this.toggleExclusiveFold("foldMeat");
  },

  toggleFoldMeatValue() {
    this.toggleExclusiveFold("foldMeatValue");
  },

  refreshMeat() {
    let text = meatRuleThumb(this.data);
    if (this.data.showLandlordAutoMeat) {
      text =
        "每次吃1块肉 · " + (this.data.meatInclude === "yes" ? "肉含奖励" : "肉不含奖励");
    } else if (this.data.matchPlay || this.data.showLandlordBig || this.data.showDizhubo || this.data.showThreeVsOne) {
      text = matchMeatThumb(this.data);
    }
    this.setData({ meatText: text });
  },

  toggleFoldDeduct() {
    this.toggleExclusiveFold("foldDeduct");
  },

  toggleFoldScore() {
    this.toggleExclusiveFold("foldScore");
  },

  refreshDeduct() {
    this.setData({
      deductText: this.data.deductMode === "none" ? "不扣分" : deductThumb(this.data)
    });
  },

  setDeductMode(e) {
    const value = e.currentTarget.dataset.value;
    if (value !== "on") {
      this.setData({ deductMode: "none", foldDeduct: false });
      this.refreshDeduct();
      this.refreshLasuo();
      return;
    }
    if (this.data.deductMode === "on") {
      this.toggleExclusiveFold("foldDeduct");
      return;
    }
    const patch = exclusiveFoldPatch(this.data, "foldDeduct");
    patch.deductMode = "on";
    this.setData(patch);
    this.refreshDeduct();
    this.refreshLasuo();
  },

  setDeductWay(e) {
    this.setData({ deductWay: e.currentTarget.dataset.value });
    this.refreshDeduct();
  },

  keepDeductWay(e) {
    this.setData({ deductWay: e.currentTarget.dataset.value });
    this.refreshDeduct();
  },

  onDeductPlusN(e) {
    this.setData({
      deductWay: "plus-n",
      deductPlusN: e.detail.value
    });
    this.refreshDeduct();
  },

  onDeductDoubleN(e) {
    this.setData({
      deductWay: "doublepar-n",
      deductDoubleN: e.detail.value
    });
    this.refreshDeduct();
  },

  setDeductCap(e) {
    this.setData({ deductCap: e.currentTarget.dataset.value });
    this.refreshDeduct();
  },

  keepDeductCap() {
    this.setData({ deductCap: "cap" });
    this.refreshDeduct();
  },

  onDeductCapN(e) {
    this.setData({
      deductCap: "cap",
      deductCapN: e.detail.value
    });
    this.refreshDeduct();
  },

  toggleLasuoFold(e) {
    const key = e.currentTarget.dataset.key;
    const map = {
      pk: "lasuoFoldPk",
      compare: "lasuoFoldCompare",
      reward: "lasuoFoldReward",
      push: "lasuoFoldPush",
      meat: "lasuoFoldMeat",
      bao: "lasuoFoldBao",
      cap: "lasuoFoldCap",
      score: "lasuoFoldScore",
      deduct: "lasuoFoldDeduct",
      baoneg: "lasuoFoldBaoNeg"
    };
    this.toggleExclusiveFold(map[key]);
  },

  onPkChange(e) {
    const vals = e.detail.value || [];
    if (!vals.length) {
      wx.showToast({ title: "至少选一项指标", icon: "none" });
      this.setData({ pkBoxShow: false });
      const self = this;
      setTimeout(function () {
        self.setData({ pkBoxShow: true });
      }, 0);
      return;
    }
    this.setData({
      pkBetter: vals.indexOf("better") >= 0,
      pkWorse: vals.indexOf("worse") >= 0,
      pkTotal: vals.indexOf("total") >= 0
    });
    this.refreshLasuo();
  },

  onPkWeight(e) {
    const key = e.currentTarget.dataset.key;
    const patch = {};
    patch[key] = e.detail.value;
    this.setData(patch);
    this.refreshLasuo();
  },

  togglePkTotalMode() {
    this.setData({
      pkTotalMode: this.data.pkTotalMode === "product" ? "sum" : "product"
    });
    this.refreshLasuo();
  },

  setAddPre(e) {
    this.setData({ addPre: e.currentTarget.dataset.value });
  },

  setPushWithinN(e) {
    this.setData({
      pushRule: "within-n",
      pushWithinN: e.detail.value
    });
    this.refreshLasuo();
  },

  keepPushWithin() {
    this.setData({ pushRule: "within-n" });
    this.refreshLasuo();
  },

  setTvoCompare(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({
      tvoCompare: value,
      tvoCompareText: tvoCompareThumb(value)
    });
  },

  setMeatCap(e) {
    this.setData({ meatCap: e.currentTarget.dataset.value });
    this.refreshMeat();
    this.refreshLasuo();
  },

  onMeatCapN(e) {
    this.setData({
      meatCap: "cap",
      meatCapN: e.detail.value
    });
    this.refreshMeat();
    this.refreshLasuo();
  },

  setComboCap(e) {
    this.setData({ comboCap: e.currentTarget.dataset.value });
    this.refreshLasuo();
  },

  onComboCapN(e) {
    this.setData({
      comboCap: "cap",
      comboCapN: e.detail.value
    });
    this.refreshLasuo();
  },

  persistRule(existing) {
    if (this._assertCanEdit && !this._assertCanEdit()) return null;
    const name = String(this.data.ruleName || "").trim();
    if (!name) {
      wx.showToast({ title: "请填写规则名称", icon: "none" });
      return null;
    }
    if (
      (this.data.showThreeVsOne || this.data.showLandlordMeatTable || this.data.showVegas || this.data.matchPlay) &&
      (this.data.meatRows || []).some(function (row) {
        return !isNonNegInt(row.value);
      })
    ) {
      wx.showToast({ title: "吃肉数量须为非负整数", icon: "none" });
      return null;
    }
    if (this.data.showVegas) {
      if (this.data.pushRule === "within-n" && !isNonNegInt(this.data.pushWithinN)) {
        wx.showToast({ title: "分差 N 须为非负整数", icon: "none" });
        return null;
      }
      if (this.data.meatValueType === "fixed" && !isNonNegInt(this.data.meatValueN)) {
        wx.showToast({ title: "肉分值须为非负整数", icon: "none" });
        return null;
      }
      if (this.data.comboCap === "cap" && !isNonNegInt(this.data.comboCapN)) {
        wx.showToast({ title: "封顶须为非负整数", icon: "none" });
        return null;
      }
      if (
        this.data.meatValueType === "double" &&
        this.data.meatCap === "cap" &&
        !isNonNegInt(this.data.meatCapN)
      ) {
        wx.showToast({ title: "肉值封顶须为非负整数", icon: "none" });
        return null;
      }
    }
    if (this.data.show8421Two) {
      if (
        (this.data.scoreRows || []).some(function (row) {
          return !isNonNegInt(row.value);
        })
      ) {
        wx.showToast({ title: "得分须为非负整数", icon: "none" });
        return null;
      }
    }
    if (this.data.show8421Two && this.data.deductMode !== "none") {
      if (this.data.deductWay !== "doublepar-n" && !isNonNegInt(this.data.deductPlusN)) {
        wx.showToast({ title: "扣分起点须为非负整数", icon: "none" });
        return null;
      }
      if (this.data.deductWay === "doublepar-n" && !isNonNegInt(this.data.deductDoubleN)) {
        wx.showToast({ title: "双帕加数须为非负整数", icon: "none" });
        return null;
      }
      if (this.data.deductCap === "cap" && !isNonNegInt(this.data.deductCapN)) {
        wx.showToast({ title: "扣分封顶须为非负整数", icon: "none" });
        return null;
      }
    }
    if (
      this.data.show8421Two &&
      this.data.meatEatMode !== "all-double" &&
      this.data.meatValueType === "double" &&
      this.data.meatCap === "cap" &&
      !isNonNegInt(this.data.meatCapN)
    ) {
      wx.showToast({ title: "肉值封顶须为非负整数", icon: "none" });
      return null;
    }
    const catalogItem = catalog.findRule(this.data.ruleId);
    const rewardMode = this.data.showVegas
      ? "none"
      : (this.data.showLandlord || this.data.showThreeVsOne || this.data.matchPlay) &&
          rec.normalizeRewardMode(this.data.reward) !== "mul"
        ? "none"
        : rec.normalizeRewardMode(this.data.reward) || "none";
    const rule = {
      id: existing && existing.id ? existing.id : "my-" + Date.now(),
      name: name,
      players: positivePlayers(this.data.players, catalogItem && catalogItem.players, 2),
      catalogId: this.data.ruleId,
      ruleId: this.data.ruleId,
      sourceTemplateId: (existing && existing.sourceTemplateId) || this.data.ruleId,
      reward: rewardMode,
      addRows: this.data.addRows,
      mulRows: this.data.mulRows,
      comboMulRows: this.data.comboMulRows,
      scoreRows: this.data.scoreRows,
      matchPlay: this.data.matchPlay,
      pushRule: this.data.pushRule,
      pushWithinN:
        this.data.pushWithinN != null && this.data.pushWithinN !== ""
          ? String(this.data.pushWithinN)
          : this.data.showVegas
            ? "2"
            : "1",
      reorderOnPush: this.data.showLandlordReorder || this.data.showLasuo || this.data.showVegas ? this.data.reorderOnPush || "no" : "no",
      meatInclude: this.data.meatInclude,
      meatRows: this.data.meatRows,
      meatValueType: this.data.meatValueType,
      meatValueN:
        this.data.meatValueN != null && this.data.meatValueN !== ""
          ? String(this.data.meatValueN)
          : this.data.showVegas
            ? "10"
            : "2",
      meatEatMode: this.data.meatEatMode || "by-score",
      meatCap: this.data.meatCap || "none",
      meatCapN: this.data.meatCapN != null && this.data.meatCapN !== "" ? String(this.data.meatCapN) : "3",
      deductMode: this.data.show8421Two ? (this.data.deductMode === "none" ? "none" : "on") : "on",
      deductWay: this.data.deductWay === "doublepar-n" ? "doublepar-n" : "plus-n",
      deductPlusN: this.data.deductPlusN != null && this.data.deductPlusN !== "" ? String(this.data.deductPlusN) : "4",
      deductDoubleN:
        this.data.deductDoubleN != null && this.data.deductDoubleN !== "" ? String(this.data.deductDoubleN) : "0",
      deductCap: this.data.deductCap === "cap" ? "cap" : "none",
      deductCapN: this.data.deductCapN != null && this.data.deductCapN !== "" ? String(this.data.deductCapN) : "3",
      baoMode: this.data.showBaoHole || this.data.showLasuo ? this.data.baoMode || "none" : "none",
      baoPlusN: this.data.baoPlusN != null && this.data.baoPlusN !== "" ? String(this.data.baoPlusN) : "4",
      baoDoubleN: this.data.baoDoubleN != null && this.data.baoDoubleN !== "" ? String(this.data.baoDoubleN) : "0",
      baoDiffN: this.data.baoDiffN != null && this.data.baoDiffN !== "" ? String(this.data.baoDiffN) : "3",
      baoPre: (this.data.showBaoHole || this.data.showLasuo) && this.data.baoMode !== "none" ? this.data.baoPre || (this.data.showLasuo ? "ahead" : "ignore") : (this.data.showLasuo ? "ahead" : "ignore"),
      baoNeg: this.data.showBaoNeg ? this.data.baoNeg || "none" : "none",
      pkBetter: !!this.data.pkBetter,
      pkWorse: !!this.data.pkWorse,
      pkTotal: !!this.data.pkTotal,
      pkBetterW: this.data.pkBetterW != null && this.data.pkBetterW !== "" ? String(this.data.pkBetterW) : "1",
      pkWorseW: this.data.pkWorseW != null && this.data.pkWorseW !== "" ? String(this.data.pkWorseW) : "1",
      pkTotalW: this.data.pkTotalW != null && this.data.pkTotalW !== "" ? String(this.data.pkTotalW) : "1",
      pkTotalMode: this.data.pkTotalMode || "sum",
      addPre: this.data.addPre || "win",
      tvoCompare: this.data.showThreeVsOne ? this.data.tvoCompare || "best" : "best",
      comboCap: this.data.showVegas ? this.data.comboCap || "none" : "none",
      comboCapN: this.data.comboCapN != null && this.data.comboCapN !== "" ? String(this.data.comboCapN) : "99",
      noSettings: !!this.data.noSettings,
      scoreCode: catalog.is8421(this.data.ruleId) ? "8421" : ""
    };
    rule.ruleSnapshot = rec.stripLibraryMeta(rule);
    return session.upsertMyRule(rule);
  },

  confirmThenSave(done) {
    const name = String(this.data.ruleName || "").trim();
    if (!name) {
      wx.showToast({ title: "请填写规则名称", icon: "none" });
      return;
    }
    const editing = session.getMyRuleById(this.data.libId);
    const existingByName = session.findMyRuleByName(name);
    const self = this;
    if (editing) {
      const rule = self.persistRule(editing);
      if (rule) done(rule);
      return;
    }
    if (existingByName && existingByName.id !== (this.data.libId || "")) {
      wx.showModal({
        title: "覆盖已有规则",
        content:
          "规则库已有「" +
          name +
          "」，仍保存为这条规则，不会另建一条。进行中的本场游戏会改用新配置；已经结束的比赛仍按当时规则，结果不变。",
        confirmText: "覆盖保存",
        cancelText: "取消",
        success: function (res) {
          if (!res.confirm) return;
          const rule = self.persistRule(existingByName);
          if (rule) done(rule);
        }
      });
      return;
    }
    const rule = this.persistRule(null);
    if (rule) done(rule);
  },

  saveOnly() {
    const self = this;
    this.confirmThenSave(function (rule) {
      if (rule && rule.id) {
        var draft = rec.draftFromLibraryRow(rule, self.data.ruleId);
        self.setData({
          libId: rule.id,
          isEditing: true,
          reward: draft.reward
        });
      }
      if (self._markSaved) self._markSaved();
      nav.callOnPage("pages/rules/index", "reloadRules", rule && rule.id);
      wx.showToast({ title: "已保存到规则库", icon: "success" });
      if (self.data.fromInstance) {
        wx.navigateBack({ delta: 1 });
        return;
      }
      nav.navigateBackTo(
        "pages/rules/index",
        session.withHost(
          "/subpackages/game/pages/rules/index?entry=" +
            self.data.entry +
            "&maxPlayers=" +
            self.data.maxPlayers
        )
      );
    });
  },

  saveAndUse() {
    const self = this;
    if (self.data.fromInstance) {
      self.saveOnly();
      return;
    }
    this.confirmThenSave(function (rule) {
      if (rule && rule.id) {
        var draft = rec.draftFromLibraryRow(rule, self.data.ruleId);
        self.setData({
          libId: rule.id,
          isEditing: true,
          reward: draft.reward
        });
      }
      if (self._markSaved) self._markSaved();
      wx.navigateTo({
        url: session.configUrl(self.data.entry, self.data.maxPlayers, rule)
      });
    });
  }
});
