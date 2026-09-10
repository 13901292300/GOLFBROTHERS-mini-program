/**
 * 「我的规则库」模板默认值。唯一 canonical source。
 * 仅用于：首次空库 seed、添加规则页无 existing 时的 UI 初值。
 * 不回写、不迁移已有规则实例。
 */

var REWARD_ROW_IDS = ["hio", "m2", "m1", "par", "p1", "ge2"];
var ADD_REWARD_VALUES = ["10", "3", "1", "0", "0", "0"];
var MUL_REWARD_VALUES = ["10", "5", "2", "1", "1", "1"];
var SCORE_MAP_IDS = ["hio", "m2", "m1", "par", "p1", "p2", "p3"];
var SCORE_MAP_VALUES = ["32", "16", "8", "4", "2", "1", "0"];

var TWO_PLAYER_DEFAULT_TEMPLATE_IDS = ["stroke-2", "match-2", "8421-2"];
var THREE_PLAYER_DEFAULT_TEMPLATE_IDS = ["landlord-mid", "8421-3"];
var FOUR_PLAYER_DEFAULT_TEMPLATE_IDS = ["8421-4"];

/** 开局分组：固拉 / 乱拉 / 高手不见面（groupMode 或 lasuo-n/horn 的 sortUpdate） */
var PULL_FORMATION_TEMPLATE_IDS = ["lasuo-4", "8421-4", "vegas", "lasuo-n", "horn"];
/** 开局分组：固斗 / 乱斗 / 高手不见面（dizhubo 无高手不见面，仍用 groupMode） */
var FIGHT_FORMATION_TEMPLATE_IDS = [
  "landlord-big",
  "landlord-mid",
  "landlord-small",
  "8421-3",
  "dizhubo-4"
];

function rowsFrom(ids, values) {
  return (ids || []).map(function (id, i) {
    return { id: id, value: String(values[i]) };
  });
}

function addRewardRows() {
  return rowsFrom(REWARD_ROW_IDS, ADD_REWARD_VALUES);
}

function mulRewardRows() {
  return rowsFrom(REWARD_ROW_IDS, MUL_REWARD_VALUES);
}

function scoreMapRows() {
  return rowsFrom(SCORE_MAP_IDS, SCORE_MAP_VALUES);
}

function matchMeatRows() {
  return [
    { id: "le-2", value: "3" },
    { id: "m1", value: "2" },
    { id: "par", value: "1" },
    { id: "ge-1", value: "0" }
  ];
}

function meatRows8421AllOne() {
  return [
    { id: "le-2", value: "1" },
    { id: "m1", value: "1" },
    { id: "par", value: "1" },
    { id: "p1", value: "1" },
    { id: "ge-2", value: "1" }
  ];
}

function landlordMidMeatRows() {
  return [
    { id: "le-2", value: "3" },
    { id: "m1", value: "2" },
    { id: "par", value: "1" },
    { id: "ge-1", value: "0" }
  ];
}

function apply8421GameplayDefaults(out) {
  out.scoreCode = "8421";
  out.scoreRows = scoreMapRows();
  out.deductMode = "on";
  out.deductWay = "plus-n";
  out.deductPlusN = "4";
  out.deductCap = "cap";
  out.deductCapN = "2";
  out.pushRule = "tie";
  out.meatRows = meatRows8421AllOne();
  out.meatValueType = "double";
  out.meatCap = "none";
  out.meatEatMode = "by-score";
  return out;
}

function applyDizhuboGameplayDefaults(out) {
  out.reward = "mul";
  out.mulRows = mulRewardRows();
  out.dizhuboMode = "mid";
  out.groupMode = "random";
  return out;
}

function usesPullFormation(templateId) {
  return PULL_FORMATION_TEMPLATE_IDS.indexOf(String(templateId || "")) >= 0;
}

function usesFightFormation(templateId) {
  return FIGHT_FORMATION_TEMPLATE_IDS.indexOf(String(templateId || "")) >= 0;
}

function usesSortUpdateFormation(templateId) {
  var id = String(templateId || "");
  return id === "lasuo-n" || id === "horn";
}

function legacyMissingGroupMode(templateId) {
  var id = String(templateId || "");
  if (id === "dizhubo-4" || id === "landlord-big" || id === "landlord-small") return "fixed";
  return "random";
}

/** 新建无 existing → random（乱拉/乱斗）。已有实例沿用 groupMode；缺字段保持旧 implicit。 */
function defaultGroupMode(templateId, existing) {
  if (existing && existing.groupMode) return existing.groupMode;
  if (existing) return legacyMissingGroupMode(templateId);
  return "random";
}

function defaultDizhuboMode(existing) {
  if (existing) return existing.dizhuboMode === "mid" ? "mid" : "big";
  return "mid";
}

function defaultSortUpdate(existing) {
  if (existing && existing.sortUpdate === "fixed") return "fixed";
  return "dynamic";
}

function applyLasuoThreePointDefaults(out) {
  out.pkBetter = true;
  out.pkWorse = true;
  out.pkTotal = true;
  out.pkBetterW = "1";
  out.pkWorseW = "1";
  out.pkTotalW = "1";
  out.pkTotalMode = "sum";
  out.reward = "add";
  out.addRows = addRewardRows();
  out.addPre = "win";
  out.pushRule = "push";
  out.meatRows = landlordMidMeatRows();
  out.meatValueType = "double";
  out.meatInclude = "no";
  out.meatCap = "none";
  out.baoMode = "none";
  return out;
}

function defaultGameplaySnapshot(templateId, base) {
  var id = String(templateId || "");
  var out = Object.assign({}, base && typeof base === "object" ? base : {});
  if (id === "stroke-2") {
    out.reward = "none";
    out.addRows = addRewardRows();
    out.mulRows = mulRewardRows();
    return out;
  }
  if (id === "match-2") {
    out.reward = "mul";
    out.mulRows = mulRewardRows();
    out.pushRule = "push";
    out.meatInclude = "no";
    out.meatRows = matchMeatRows();
    return out;
  }
  if (id === "8421-2") {
    return apply8421GameplayDefaults(out);
  }
  if (id === "8421-3" || id === "8421-4") {
    apply8421GameplayDefaults(out);
    out.baoNeg = "none";
    return out;
  }
  if (id === "landlord-mid") {
    out.reward = "mul";
    out.mulRows = mulRewardRows();
    out.pushRule = "push";
    out.meatInclude = "no";
    out.meatRows = landlordMidMeatRows();
    out.baoMode = "none";
    return out;
  }
  if (id === "lasuo-4") {
    return applyLasuoThreePointDefaults(out);
  }
  if (id === "dizhubo-4") {
    return applyDizhuboGameplayDefaults(out);
  }
  if (usesPullFormation(id) && usesSortUpdateFormation(id)) {
    out.sortUpdate = "dynamic";
    return out;
  }
  if (usesPullFormation(id) || usesFightFormation(id)) {
    out.groupMode = "random";
    return out;
  }
  return out;
}

module.exports = {
  TWO_PLAYER_DEFAULT_TEMPLATE_IDS: TWO_PLAYER_DEFAULT_TEMPLATE_IDS,
  THREE_PLAYER_DEFAULT_TEMPLATE_IDS: THREE_PLAYER_DEFAULT_TEMPLATE_IDS,
  FOUR_PLAYER_DEFAULT_TEMPLATE_IDS: FOUR_PLAYER_DEFAULT_TEMPLATE_IDS,
  ADD_REWARD_VALUES: ADD_REWARD_VALUES,
  MUL_REWARD_VALUES: MUL_REWARD_VALUES,
  SCORE_MAP_VALUES: SCORE_MAP_VALUES,
  addRewardRows: addRewardRows,
  mulRewardRows: mulRewardRows,
  scoreMapRows: scoreMapRows,
  matchMeatRows: matchMeatRows,
  meatRows8421AllOne: meatRows8421AllOne,
  landlordMidMeatRows: landlordMidMeatRows,
  apply8421GameplayDefaults: apply8421GameplayDefaults,
  applyDizhuboGameplayDefaults: applyDizhuboGameplayDefaults,
  applyLasuoThreePointDefaults: applyLasuoThreePointDefaults,
  PULL_FORMATION_TEMPLATE_IDS: PULL_FORMATION_TEMPLATE_IDS,
  FIGHT_FORMATION_TEMPLATE_IDS: FIGHT_FORMATION_TEMPLATE_IDS,
  usesPullFormation: usesPullFormation,
  usesFightFormation: usesFightFormation,
  usesSortUpdateFormation: usesSortUpdateFormation,
  defaultGroupMode: defaultGroupMode,
  defaultDizhuboMode: defaultDizhuboMode,
  defaultSortUpdate: defaultSortUpdate,
  defaultGameplaySnapshot: defaultGameplaySnapshot
};
