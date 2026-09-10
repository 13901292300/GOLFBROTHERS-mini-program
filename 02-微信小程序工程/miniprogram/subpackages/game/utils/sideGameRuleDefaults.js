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

function applyLasuoThreePointDefaults(out) {
  out.pkBetter = true;
  out.pkWorse = true;
  out.pkTotal = true;
  out.pkBetterW = "1";
  out.pkWorseW = "1";
  out.pkTotalW = "1";
  out.pkTotalMode = "sum";
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
  applyLasuoThreePointDefaults: applyLasuoThreePointDefaults,
  defaultGameplaySnapshot: defaultGameplaySnapshot
};
