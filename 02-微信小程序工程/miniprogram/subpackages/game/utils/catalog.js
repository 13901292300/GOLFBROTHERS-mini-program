const CATALOG = [
  {
    group: "2人",
    groupId: "2",
    items: [
      {
        id: "stroke-2",
        name: "比杆",
        players: 2,
        editFirst: true,
        matchupMode: "party-matchup",
        partySizeMode: "one-or-more",
        minPlayersPerParty: 1
      },
      {
        id: "match-2",
        name: "比洞",
        players: 2,
        editFirst: true,
        matchPlay: true,
        matchupMode: "party-matchup",
        partySizeMode: "one-or-more",
        minPlayersPerParty: 1
      },
      {
        id: "8421-2",
        name: "单挂8421",
        players: 2,
        editFirst: true,
        kind: "8421",
        matchupMode: "party-matchup",
        partySizeMode: "one-or-more",
        minPlayersPerParty: 1
      },
      {
        id: "three-set",
        name: "三局",
        players: 2,
        editFirst: false,
        noSettings: true,
        matchupMode: "party-matchup",
        partySizeMode: "one-or-more",
        minPlayersPerParty: 1
      },
      {
        id: "youcai",
        name: "油菜",
        players: 2,
        editFirst: false,
        noSettings: true,
        matchupMode: "party-matchup",
        partySizeMode: "one-or-more",
        minPlayersPerParty: 1
      }
    ]
  },
  {
    group: "3人",
    groupId: "3",
    items: [
      { id: "landlord-big", name: "斗大地主", players: 3, editFirst: true, kind: "landlord-big" },
      { id: "landlord-mid", name: "斗二地主", players: 3, editFirst: true, kind: "landlord-mid" },
      { id: "landlord-small", name: "斗小地主", players: 3, editFirst: true, kind: "landlord-small" },
      { id: "8421-3", name: "3人8421", players: 3, editFirst: true, kind: "8421" }
    ]
  },
  {
    group: "4人",
    groupId: "4",
    items: [
      { id: "lasuo-4", name: "四人拉丝", players: 4, editFirst: true, kind: "lasuo-4" },
      { id: "8421-4", name: "4人8421", players: 4, editFirst: true, kind: "8421" },
      {
        id: "three-vs-one",
        name: "固定三打一",
        players: 4,
        editFirst: true,
        kind: "three-vs-one",
        matchupMode: "exact-party-shape",
        partySizeMode: "exact",
        requiredPartyCount: 2,
        allowedPartyShapes: [[3, 1]]
      },
      { id: "dizhubo-4", name: "4人地主婆", players: 4, editFirst: true, kind: "dizhubo-4" },
      { id: "vegas", name: "拉斯维加斯", players: 4, editFirst: true, kind: "vegas" },
      { id: "skins", name: "狼和羊", players: 4, editFirst: true, hidden: true, unavailable: true }
    ]
  },
  {
    group: "多人",
    groupId: "multi",
    items: [
      { id: "lasuo-n", name: "多人拉丝", players: 6, editFirst: false, noSettings: true, multi: true, kind: "lasuo-n", preset: true },
      { id: "horn", name: "喇叭花", players: 5, editFirst: false, noSettings: true, multi: true, kind: "horn", preset: true }
    ]
  }
];

const HOLES = [
  "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9",
  "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9"
];

/** 沙盒球场：18 洞标准杆一律 PAR 4，便于对打测试 */
function defaultHolePars() {
  const map = {};
  HOLES.forEach(function (label) {
    map[label] = 4;
  });
  return map;
}

function holePar(label) {
  const n = Number(defaultHolePars()[String(label)]);
  return n === 3 || n === 4 || n === 5 ? n : 4;
}

const SCORE_PRESETS = ["6321", "6421", "8421", "8431", "8432", "8532", "85321"];

const RANK_OPTIONS = [
  { id: "gross-origin", label: "按真实成绩排序" },
  { id: "gross-result", label: "真实成绩相同按输赢排序" }
];

const NET_RANK_OPTIONS = [
  { id: "net-origin", label: "按受让后成绩排序" },
  { id: "net-result", label: "受让后成绩相同按输赢排序" }
];

const POINTS_RANK_OPTIONS = [
  { id: "points-origin", label: "按实际得分排序" },
  { id: "points-result", label: "实际得分相同按输赢排序" }
];

const GROUP_MODES = [
  { id: "random", label: "乱拉" },
  { id: "fixed", label: "固拉" },
  { id: "split-high", label: "高手不见面" }
];

const LANDLORD_GROUP_MODES = [
  { id: "random", label: "乱斗" },
  { id: "fixed", label: "固斗" },
  { id: "split-high", label: "高手不见面" }
];

const DIZHUBO_GROUP_MODES = [
  { id: "random", label: "乱斗" },
  { id: "fixed", label: "固斗" }
];

const LANDLORD_SORT_MODES = [
  { id: "random", label: "随机" },
  { id: "manual", label: "手工指定" },
  { id: "hcp", label: "按差点" }
];

const LANDLORD_RANK_OPTIONS = [
  { id: "gross-origin", label: "按真实成绩排序" },
  { id: "gross-result", label: "真实成绩相同按输赢排序" }
];

function catalogDesignCap() {
  var cap = 2;
  CATALOG.forEach(function (group) {
    (group.items || []).forEach(function (item) {
      if (!item || item.hidden || isUnavailableRule(item)) return;
      var n = Number(item.players) || 0;
      if (n > cap) cap = n;
    });
  });
  return cap;
}

function listCatalog(maxPlayers) {
  const cap = Number(maxPlayers);
  if (!(cap > 0)) return [];
  return CATALOG.map(function (group) {
    const items = group.items.filter(function (item) {
      return !item.hidden && item.players <= cap;
    });
    return { group: group.group, groupId: group.groupId, items: items };
  }).filter(function (group) {
    return group.items.length > 0;
  });
}

function listCatalogForDesign() {
  return CATALOG.map(function (group) {
    const items = group.items.filter(function (item) {
      return !item.hidden && !isUnavailableRule(item);
    });
    return { group: group.group, groupId: group.groupId, items: items };
  }).filter(function (group) {
    return group.items.length > 0;
  });
}

const UNAVAILABLE_RULE_IDS = {
  "skins": true
};

function isUnavailableRule(idOrItem) {
  const id =
    idOrItem && typeof idOrItem === "object"
      ? String(idOrItem.id || idOrItem.catalogId || idOrItem.ruleId || "")
      : String(idOrItem || "");
  return !!UNAVAILABLE_RULE_IDS[id];
}

function findRule(id) {
  for (let i = 0; i < CATALOG.length; i++) {
    const hit = CATALOG[i].items.find(function (item) {
      return item.id === id;
    });
    if (hit) return hit;
  }
  return null;
}

function is8421(id) {
  return String(id || "").indexOf("8421") >= 0;
}

function is8421Three(id) {
  return String(id || "") === "8421-3";
}

function is8421Four(id) {
  return String(id || "") === "8421-4";
}

const TRI_BLUE = "#007AFF";
const TRI_RED = "#FF3B30";

function rankComboKind(id) {
  if (isLandlordMid(id) || is8421Three(id)) return "mid";
  if (isLandlordSmall(id)) return "small";
  if (isLandlordBig(id)) return "big";
  return "";
}

function rankTriColor(catalogId, n, groupMode, i, dizhuboMode) {
  if (isThreeVsOne(catalogId)) return i === 0 ? TRI_BLUE : TRI_RED;
  if (isDizhubo4(catalogId)) {
    if (dizhuboMode === "mid") return i === 0 || i === 2 ? TRI_BLUE : TRI_RED;
    return i === 0 || i === 3 ? TRI_BLUE : TRI_RED;
  }
  const isFixed = groupMode === "fixed";
  const kind = rankComboKind(catalogId);
  if (n === 3) {
    if (kind === "mid") return i === 1 ? TRI_RED : TRI_BLUE;
    if (kind === "small") return i === 2 ? TRI_RED : TRI_BLUE;
    return i === 0 ? TRI_BLUE : TRI_RED;
  }
  if (n >= 4) {
    if (isFixed) return i < 2 ? TRI_BLUE : TRI_RED;
    return i === 0 || i === 3 ? TRI_BLUE : TRI_RED;
  }
  return i === 0 ? TRI_BLUE : TRI_RED;
}

function supportsWindBlow(id) {
  return (
    String(id || "") === "match-2" ||
    is8421(id) ||
    is8421Three(id) ||
    is8421Four(id) ||
    isLasuo4(id) ||
    isVegas(id) ||
    isThreeVsOne(id) ||
    isDizhubo4(id) ||
    isLandlordBig(id) ||
    isLandlordMid(id) ||
    isLandlordSmall(id) ||
    isLasuoN(id) ||
    isHorn(id)
  );
}

function usesRankMark(id) {
  return (
    isLandlordFamily(id) ||
    is8421Three(id) ||
    is8421Four(id) ||
    isLasuo4(id) ||
    isVegas(id) ||
    isThreeVsOne(id) ||
    isDizhubo4(id) ||
    isLasuoN(id) ||
    isHorn(id)
  );
}

function isLandlordBig(id) {
  return String(id || "") === "landlord-big";
}

function isLandlordMid(id) {
  return String(id || "") === "landlord-mid";
}

function isLandlordSmall(id) {
  return String(id || "") === "landlord-small";
}

function isLandlordFamily(id) {
  return isLandlordBig(id) || isLandlordMid(id) || isLandlordSmall(id);
}

function isLasuo4(id) {
  return String(id || "") === "lasuo-4";
}

function isThreeVsOne(id) {
  return String(id || "") === "three-vs-one";
}

function isDizhubo4(id) {
  return String(id || "") === "dizhubo-4";
}

function isVegas(id) {
  return String(id || "") === "vegas";
}

function isLasuoN(id) {
  return String(id || "") === "lasuo-n";
}

function isHorn(id) {
  return String(id || "") === "horn";
}

/** 多人拉丝游戏卡片「方式」缩略：乱拉/固拉 · 江湖/海岛编队（· 高手不见面） */
function lasuoNWayLabel(gameOrOpts) {
  const src = gameOrOpts || {};
  const parts = [];
  parts.push(src.sortUpdate === "fixed" ? "固拉" : "乱拉");
  parts.push(src.formation === "haidao" ? "海岛编队" : "江湖编队");
  if (src.bandMode === "split-high") parts.push("高手不见面");
  return parts.join(" · ");
}

function pkWeightTotal(rule) {
  let n = 0;
  if (!rule || rule.pkBetter !== false) n += Number((rule && rule.pkBetterW) || 1) || 0;
  if (!rule || rule.pkWorse !== false) n += Number((rule && rule.pkWorseW) || 1) || 0;
  if (!rule || rule.pkTotal !== false) n += Number((rule && rule.pkTotalW) || 1) || 0;
  return n;
}

function lasuoPkText(rule) {
  const parts = [];
  if (!rule || rule.pkBetter !== false) {
    parts.push("较好" + (Number((rule && rule.pkBetterW) || 1) || 0));
  }
  if (!rule || rule.pkWorse !== false) {
    parts.push("较差" + (Number((rule && rule.pkWorseW) || 1) || 0));
  }
  if (!rule || rule.pkTotal !== false) {
    const mode = (rule && rule.pkTotalMode) === "product" ? "总积" : "总和";
    parts.push(mode + (Number((rule && rule.pkTotalW) || 1) || 0));
  }
  return parts.join("·") || "未选";
}

const LASUO_REWARD_THUMB = {
  hio: "HIO",
  m2: "鹰",
  m1: "鸟",
  par: "帕",
  p1: "+1",
  ge2: "+2"
};

const LASUO_COMBO_THUMB = {
  "m2-m2": "双鹰",
  "m2-m1": "鹰鸟",
  "m1-m1": "双鸟"
};

function lasuoRewardParts(rows, op, identity, labels) {
  return (rows || [])
    .filter(function (row) {
      return labels[row.id] && String(row.value) !== String(identity) && String(row.value) !== "";
    })
    .map(function (row) {
      return labels[row.id] + op + row.value;
    });
}

function lasuoRewardText(rule, forSummary) {
  const reward = (rule && rule.reward) || "none";
  const skipPerson = forSummary ? { hio: true } : {};
  const skipCombo = forSummary ? { "m2-m2": true, "m2-m1": true } : {};
  const personLabels = {};
  Object.keys(LASUO_REWARD_THUMB).forEach(function (id) {
    if (!skipPerson[id]) personLabels[id] = LASUO_REWARD_THUMB[id];
  });
  const comboLabels = {};
  Object.keys(LASUO_COMBO_THUMB).forEach(function (id) {
    if (!skipCombo[id]) comboLabels[id] = LASUO_COMBO_THUMB[id];
  });
  if (reward === "add") {
    const parts = lasuoRewardParts(rule.addRows, "+", "0", personLabels);
    return parts.length ? parts.join(" · ") : "全部+0";
  }
  if (reward === "mul") {
    const parts = lasuoRewardParts(rule.mulRows, "×", "1", personLabels).concat(
      lasuoRewardParts(rule.comboMulRows, "×", "1", comboLabels)
    );
    return parts.length ? parts.join(" · ") : "全部×1";
  }
  return "无奖励";
}

function lasuoPushText(rule) {
  const push = (rule && rule.pushRule) || "push";
  if (push === "none") return "无顶洞";
  if (push === "within-n") return "得分≤" + ((rule && rule.pushWithinN) || 1);
  return "得分打平";
}

function listRewardText(rule, singleScheme) {
  if (!rule || rule.reward === "none") return "无奖励";
  if (singleScheme) return "有奖励";
  if (rule.reward === "add") return "加法奖励";
  if (rule.reward === "mul") return "乘法奖励";
  return "无奖励";
}

function listPushText(rule) {
  const push = rule && rule.pushRule;
  if (push === "none") return "无顶洞";
  if (push === "skip") return "顶洞即过";
  if (push === "within-1") return "得分≤1分";
  if (push === "within-2") return "得分≤2分";
  if (push === "within-n") return "得分≤" + ((rule && rule.pushWithinN) || 1);
  return "";
}

function meatCountThumb(rule) {
  const id = String((rule && (rule.catalogId || rule.ruleId || rule.id)) || "");
  if (isLandlordSmall(id) || (rule && rule.showLandlordAutoMeat)) return "每次吃1块肉";
  const map = {};
  ((rule && rule.meatRows) || []).forEach(function (row) {
    map[row.id] = String(row.value == null ? "" : row.value).trim();
  });
  if (is8421(id) || map["ge-2"] != null || map["p1"] != null) {
    return meatCountThumb8421(map);
  }
  const win = map["le-2"] || "3";
  const bird = map["m1"] || "2";
  const par = map["par"] || "1";
  const worse = map["ge-1"] != null && map["ge-1"] !== "" ? map["ge-1"] : "0";
  if (win === "1" && bird === "1" && par === "1" && worse === "1") return "每次吃1块肉";
  let text = "帕" + par + "鸟" + bird + "鹰" + win;
  if (worse !== "0") text += "+1及更差" + worse;
  return text;
}

const MEAT_THUMB_8421 = [
  { id: "ge-2", label: "双柏" },
  { id: "p1", label: "柏" },
  { id: "par", label: "帕" },
  { id: "m1", label: "鸟" },
  { id: "le-2", label: "鹰" }
];

function meatCountThumb8421(map) {
  const hasAny = MEAT_THUMB_8421.some(function (item) {
    return map[item.id] != null && map[item.id] !== "";
  });
  if (!hasAny) return "每次吃1块肉";
  const allOne = MEAT_THUMB_8421.every(function (item) {
    return map[item.id] === "1";
  });
  if (allOne) return "每次吃1块肉";
  const seq = MEAT_THUMB_8421.map(function (item) {
    const n = Number(map[item.id]);
    return {
      label: item.label,
      value: map[item.id] === "" || map[item.id] == null ? "0" : map[item.id],
      n: isFinite(n) ? n : 0
    };
  });
  let start = -1;
  for (let i = 0; i < seq.length; i++) {
    if (seq[i].n > 0) {
      start = i;
      break;
    }
  }
  if (start < 0) return "不吃肉";
  let end = seq.length;
  if (seq[4].n === seq[3].n) end = 4;
  const parts = [];
  for (let i = start; i < end; i++) {
    parts.push(seq[i].label + seq[i].value);
  }
  return parts.join("") || "每次吃1块肉";
}

function lasuoMeatValueText(rule) {
  if ((rule && rule.meatValueType) === "fixed") {
    return "肉算" + ((rule && rule.meatValueN) || "2") + "分";
  }
  const include = (rule && rule.meatInclude) === "yes" ? "含奖励" : "不含奖励";
  const cap = (rule && rule.meatCap) === "cap" ? (rule.meatCapN || "3") + "分封顶" : "不封顶";
  return "翻倍" + include + " · " + cap;
}

function lasuoMeatText(rule) {
  return meatCountThumb(rule) + " · " + lasuoMeatValueText(rule);
}

function lasuoBaoText(rule) {
  const mode = (rule && rule.baoMode) || "none";
  if (mode === "none") return "不包洞";
  const pre = (rule && rule.baoPre) === "ignore" ? "" : "顶头·";
  return pre + baoSummary(rule);
}

function lasuoDefaultName(rule) {
  const head = !rule || rule.pkBetter !== false;
  const tail = !rule || rule.pkWorse !== false;
  const tot = !rule || rule.pkTotal !== false;
  const hw = Number((rule && rule.pkBetterW) || 1) || 0;
  const tw = Number((rule && rule.pkWorseW) || 1) || 0;
  const zw = Number((rule && rule.pkTotalW) || 1) || 0;
  const picked = [];
  if (head) picked.push({ key: "头", w: hw, one: "最好成绩一点" });
  if (tail) picked.push({ key: "尾", w: tw, one: "最差成绩一点" });
  if (tot) picked.push({ key: "总", w: zw, one: "总成绩一点" });
  if (!picked.length) return "四人拉丝";
  if (picked.length === 1) return picked[0].one;
  const same = picked.every(function (item) {
    return item.w === picked[0].w;
  });
  if (picked.length === 3) {
    if (same) return "拉丝三点";
    return String(hw) + String(tw) + String(zw);
  }
  if (same) return picked[0].key + picked[1].key + "两点";
  return picked[0].key + String(picked[0].w) + picked[1].key + String(picked[1].w);
}

function lasuoHubSummaries(rule) {
  return {
    pkWeightTotal: pkWeightTotal(rule),
    lasuoPkText: lasuoPkText(rule),
    lasuoRewardText: lasuoRewardText(rule),
    lasuoPushText: lasuoPushText(rule),
    lasuoMeatCountText: meatCountThumb(rule),
    lasuoMeatValueText: lasuoMeatValueText(rule),
    lasuoMeatText: lasuoMeatText(rule),
    lasuoBaoText: lasuoBaoText(rule)
  };
}

function doubleParMark(n) {
  const v = String(n != null && n !== "" ? n : "0");
  return v === "0" ? "双帕" : "双帕+" + v;
}

function baoSummary(rule) {
  const mode = (rule && rule.baoMode) || "none";
  if (mode === "plus-n") return "从+" + ((rule && rule.baoPlusN) || 4) + "包洞";
  if (mode === "doublepar-n") return doubleParMark(rule && rule.baoDoubleN) + "包洞";
  if (mode === "partner-diff") return "同伴杆差" + ((rule && rule.baoDiffN) || 3) + "杆包洞";
  return "不包洞";
}

function pushLabel(rule) {
  const map = {
    skip: "顶洞即过",
    none: "无顶洞",
    tie: "得分打平",
    push: "得分打平",
    "within-1": "得分1分及以内",
    "within-2": "得分2分及以内"
  };
  return map[rule && rule.pushRule] || "";
}

function meatIncludeSuffix(rule) {
  return (rule && rule.meatInclude) === "yes" ? "（肉含奖励）" : "（肉不含奖励）";
}

function capSuffix(capped, n, noneLabel) {
  if (capped) return "（" + (n || "3") + "分封顶）";
  return "（" + (noneLabel || "不封顶") + "）";
}

function listDeductText(rule) {
  if ((rule && rule.deductMode) === "none") return "不扣分";
  let text;
  if ((rule && rule.deductWay) === "doublepar-n") {
    text = doubleParMark(
      rule && rule.deductDoubleN != null && rule.deductDoubleN !== "" ? rule.deductDoubleN : "0"
    ) + "开始扣";
  } else {
    const n = String(rule && rule.deductPlusN != null && rule.deductPlusN !== "" ? rule.deductPlusN : "4");
    text = "+" + n + "开始扣";
  }
  return text + capSuffix((rule && rule.deductCap) === "cap", (rule && rule.deductCapN) || "3");
}

function summarizeRule(rule) {
  const catalogId = String((rule && rule.catalogId) || (rule && rule.id) || "");
  if (catalogId === "three-set") {
    return "前9总杆/后9总杆/全场18洞总杆";
  }
  if (catalogId === "youcai") {
    return "逐洞比洞顶洞过";
  }
  if (isNoSettings(rule) || isNoSettings(rule && rule.catalogId)) {
    return "无模板约定，开局时再配";
  }
  const parts = [];
    if (is8421(rule && rule.catalogId)) {
      parts.push(listDeductText(rule));
      if ((rule && rule.pushRule) === "none") parts.push("无顶洞");
      else if ((rule && rule.pushRule) === "within-1") parts.push("得分≤1分");
      else if ((rule && rule.pushRule) === "within-2") parts.push("得分≤2分");
      else if ((rule && rule.pushRule) === "skip") parts.push("顶洞即过");
      if ((rule && rule.pushRule) !== "none") {
      if ((rule && rule.meatEatMode) === "all-double") {
        parts.push("一次全吃连续翻倍");
      } else {
        parts.push(meatCountThumb(rule));
        if ((rule && rule.meatValueType) === "double") {
          parts.push(
            "分值翻倍" + capSuffix((rule && rule.meatCap) === "cap", (rule && rule.meatCapN) || "3")
          );
        } else {
          parts.push("肉算" + ((rule && rule.meatValueN) || 2) + "分");
        }
      }
    }
    if (is8421Three(rule && rule.catalogId) || is8421Four(rule && rule.catalogId)) {
      if ((rule && rule.baoNeg) === "ahead") parts.push("同伴顶头才包负分");
      else if ((rule && rule.baoNeg) === "ignore") parts.push("始终包自己产生的负分");
    }
    return parts.join(" · ");
  }
  if (isLandlordFamily(rule && rule.catalogId)) {
    parts.push(listRewardText(rule, true));
    const push = listPushText(rule);
    if (push) parts.push(push);
    if ((rule && rule.reorderOnPush) === "yes") parts.push("顶洞换组合");
    if (isLandlordSmall(rule && rule.catalogId)) {
      parts.push("每次吃1块肉" + meatIncludeSuffix(rule));
    } else {
      parts.push(meatCountThumb(rule) + meatIncludeSuffix(rule));
    }
    if (isLandlordMid(rule && rule.catalogId) || isLandlordSmall(rule && rule.catalogId)) {
      parts.push(baoSummary(rule));
      if ((rule && rule.baoMode) && rule.baoMode !== "none") {
        parts.push((rule && rule.baoPre) === "ahead" ? "同伴顶头才包" : "包洞与同伴无关");
      }
    }
    return parts.join(" · ");
  }
  if (isThreeVsOne(rule && rule.catalogId)) {
    const cmp = {
      best: "最好成绩",
      avg: "平均成绩",
      worst: "最差成绩"
    };
    parts.push(cmp[(rule && rule.tvoCompare) || "best"] || "最好成绩");
    parts.push(listRewardText(rule, true));
    const tvoPush = listPushText(rule);
    if (tvoPush) parts.push(tvoPush);
    parts.push(meatCountThumb(rule) + meatIncludeSuffix(rule));
    return parts.join(" · ");
  }
  if (isDizhubo4(rule && rule.catalogId)) {
    parts.push(listRewardText(rule, true));
    const dzPush = listPushText(rule);
    if (dzPush) parts.push(dzPush);
    if ((rule && rule.reorderOnPush) === "yes") parts.push("顶洞换组合");
    parts.push(meatCountThumb(rule) + meatIncludeSuffix(rule));
    return parts.join(" · ");
  }
  if (isVegas(rule && rule.catalogId)) {
    const push = (rule && rule.pushRule) || "push";
    if (push === "none") parts.push("无顶洞");
    else if (push === "within-n") parts.push("分差≤" + ((rule && rule.pushWithinN) || 2));
    if ((rule && rule.reorderOnPush) === "yes") parts.push("顶洞换组合");
    parts.push(meatCountThumb(rule));
    if ((rule && rule.meatValueType) === "double") {
      parts.push(
        "分值翻倍" + capSuffix((rule && rule.comboCap) === "cap", (rule && rule.comboCapN) || "99", "组合不封顶")
      );
    } else {
      parts.push(
        "肉算" +
          ((rule && rule.meatValueN) || 10) +
          "分" +
          capSuffix((rule && rule.comboCap) === "cap", (rule && rule.comboCapN) || "99", "组合不封顶")
      );
    }
    return parts.join(" · ");
  }
  if (isHorn(rule && rule.catalogId)) {
    return "开局时配置排序、编队、系数与奖励";
  }
  if (isLasuoN(rule && rule.catalogId)) {
    return "开局时配置排序、编队、分档、系数与奖励";
  }
  if (isLasuo4(rule && rule.catalogId)) {
    const pk = [];
    if (!rule || rule.pkBetter !== false) pk.push("较好");
    if (!rule || rule.pkWorse !== false) pk.push("较差");
    if (!rule || rule.pkTotal !== false) {
      pk.push((rule && rule.pkTotalMode) === "product" ? "总成绩积" : "总成绩和");
    }
    parts.push((pk.join("/") || "指标") + pkWeightTotal(rule) + "分");
    parts.push(lasuoRewardText(rule, true));
    const lasuoPush = listPushText(rule);
    if (lasuoPush) parts.push(lasuoPush);
    parts.push(meatCountThumb(rule));
    parts.push(lasuoBaoText(rule));
    return parts.filter(Boolean).join(" · ");
  }
  if (rule && rule.matchPlay) {
    parts.push(listRewardText(rule, true));
    const matchPush = listPushText(rule);
    if (matchPush) parts.push(matchPush);
    if (rule.pushRule !== "none") {
      parts.push(meatCountThumb(rule) + meatIncludeSuffix(rule));
    }
    return parts.filter(Boolean).join(" · ") || "已保存的约定";
  } else if ((rule && rule.reward) === "add") parts.push("加法奖励");
  else if ((rule && rule.reward) === "mul") parts.push("乘法奖励");
  else parts.push("无奖励");
  return parts.filter(Boolean).join(" · ") || "已保存的约定";
}

function isNoSettings(idOrItem) {
  if (idOrItem && typeof idOrItem === "object") {
    return !!idOrItem.noSettings || idOrItem.editFirst === false;
  }
  const hit = findRule(idOrItem);
  return !!(hit && (hit.noSettings || hit.editFirst === false));
}

/** 组合逐洞让杆（比洞 / 油菜）：每洞调整受让方后再判胜负 */
function supportsPairHoleHandicap(id) {
  return usesMatchPlayPairSettings(id);
}

/** 比洞式组合设置（让杆弹窗 / 有效洞 / 保存回显）：比洞与油菜共享 */
function usesMatchPlayPairSettings(id) {
  const s = String(id || "");
  return s === "match-2" || s === "youcai";
}

/** 组合总杆让杆（比杆）：只进初始总分，不进逐洞 */
function supportsTotalStrokeHandicap(id) {
  return String(id || "") === "stroke-2";
}

module.exports = {
  CATALOG,
  HOLES,
  HOLES: HOLES,
  defaultHolePars,
  holePar,
  SCORE_PRESETS,
  SCORE_PRESETS: SCORE_PRESETS,
  RANK_OPTIONS,
  RANK_OPTIONS: RANK_OPTIONS,
  NET_RANK_OPTIONS,
  POINTS_RANK_OPTIONS,
  GROUP_MODES,
  GROUP_MODES: GROUP_MODES,
  LANDLORD_GROUP_MODES,
  DIZHUBO_GROUP_MODES,
  LANDLORD_SORT_MODES,
  LANDLORD_RANK_OPTIONS,
  listCatalog,
  listCatalog: listCatalog,
  listCatalogForDesign,
  catalogDesignCap,
  findRule,
  is8421,
  is8421Three,
  is8421Four,
  isLandlordBig,
  isLandlordMid,
  isLandlordSmall,
  isLandlordFamily,
  isLasuo4,
  isThreeVsOne,
  isDizhubo4,
  isVegas,
  isLasuoN,
  isHorn,
  rankTriColor,
  usesRankMark,
  supportsWindBlow,
  lasuoNWayLabel,
  lasuoHubSummaries,
  lasuoDefaultName,
  isNoSettings,
  supportsPairHoleHandicap,
  usesMatchPlayPairSettings,
  supportsTotalStrokeHandicap,
  isUnavailableRule,
  UNAVAILABLE_RULE_IDS,
  summarizeRule,
  doubleParMark,
  meatCountThumb
};
