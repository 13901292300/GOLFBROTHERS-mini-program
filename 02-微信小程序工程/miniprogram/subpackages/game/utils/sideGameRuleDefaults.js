/**
 * 「我的规则库」2 人玩法模板默认值。唯一 canonical source。
 * 仅用于：首次空库 seed、添加规则页无 existing 时的 UI 初值。
 * 不回写、不迁移已有规则实例。
 */

var REWARD_ROW_IDS = ["hio", "m2", "m1", "par", "p1", "ge2"];
var ADD_REWARD_VALUES = ["10", "3", "1", "0", "0", "0"];
var MUL_REWARD_VALUES = ["10", "5", "2", "1", "1", "1"];
var SCORE_MAP_IDS = ["hio", "m2", "m1", "par", "p1", "p2", "p3"];
var SCORE_MAP_VALUES = ["32", "16", "8", "4", "2", "1", "0"];

var TWO_PLAYER_DEFAULT_TEMPLATE_IDS = ["stroke-2", "match-2", "8421-2"];

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
  return out;
}

module.exports = {
  TWO_PLAYER_DEFAULT_TEMPLATE_IDS: TWO_PLAYER_DEFAULT_TEMPLATE_IDS,
  ADD_REWARD_VALUES: ADD_REWARD_VALUES,
  MUL_REWARD_VALUES: MUL_REWARD_VALUES,
  SCORE_MAP_VALUES: SCORE_MAP_VALUES,
  addRewardRows: addRewardRows,
  mulRewardRows: mulRewardRows,
  scoreMapRows: scoreMapRows,
  matchMeatRows: matchMeatRows,
  meatRows8421AllOne: meatRows8421AllOne,
  defaultGameplaySnapshot: defaultGameplaySnapshot
};
