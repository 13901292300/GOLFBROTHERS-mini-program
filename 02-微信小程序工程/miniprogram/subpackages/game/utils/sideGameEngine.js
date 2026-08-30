/**
 * 纯结算入口：按 ruleId 查找规则、校验输入、调用 settle。
 * 不读 wx / getApp / 页面 / Storage / 用户 / 权限。
 */
var catalog = require('./catalog.js');
var settle = require('./settle.js');
var holeOrderUtil = require('./holeOrder.js');

function jsonClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function listRules() {
  var out = [];
  (catalog.CATALOG || []).forEach(function (group) {
    (group.items || []).forEach(function (item) {
      out.push(item);
    });
  });
  return out;
}

function findRule(ruleId) {
  return catalog.findRule(ruleId) || null;
}

function uniqueLabels(raw) {
  return holeOrderUtil.uniqueLabels(raw);
}

function validateSettleInput(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, reason: 'invalid_input' };
  }
  var sideGame = input.sideGame && typeof input.sideGame === 'object' ? input.sideGame : {};
  var ruleId = String(input.ruleId || settle.catalogIdOf(sideGame) || '').trim();
  if (!ruleId) return { ok: false, reason: 'missing_rule_id' };
  if (!findRule(ruleId)) return { ok: false, reason: 'unknown_rule' };
  var holeOrder = uniqueLabels(input.holeOrder);
  if (!holeOrder.length) return { ok: false, reason: 'missing_hole_order' };
  if (input.scores != null && (typeof input.scores !== 'object' || Array.isArray(input.scores))) {
    return { ok: false, reason: 'invalid_scores' };
  }
  return { ok: true, ruleId: ruleId, holeOrder: holeOrder, sideGame: sideGame };
}

function settleSideGame(input) {
  var checked = validateSettleInput(input);
  if (!checked.ok) {
    return { ok: false, reason: checked.reason };
  }
  var game = jsonClone(checked.sideGame);
  game.catalogId = checked.ruleId;
  game.ruleId = checked.ruleId;
  if (!game.ruleSnapshot || typeof game.ruleSnapshot !== 'object') {
    game.ruleSnapshot = {};
  }
  game.ruleSnapshot.catalogId = checked.ruleId;
  var ctx = {
    holeOrder: checked.holeOrder.slice(),
    scores: jsonClone(input.scores || {}),
    pars: jsonClone(input.pars && typeof input.pars === 'object' ? input.pars : {}),
    windOn: !!input.windOn
  };
  var result = settle.settleGame(game, ctx);
  return {
    ok: true,
    ruleId: checked.ruleId,
    matchId: input.matchId != null ? String(input.matchId) : '',
    sideGameId: input.sideGameId != null ? String(input.sideGameId) : '',
    result: result
  };
}

module.exports = {
  findRule: findRule,
  listRules: listRules,
  validateSettleInput: validateSettleInput,
  settle: settleSideGame,
  catalogIdOf: settle.catalogIdOf,
  playerIdsOf: settle.playerIdsOf,
  zeroSumOk: settle.zeroSumOk,
  POT_ID: settle.POT_ID,
  applyHolePot: settle.applyHolePot,
  bigPotMoney: settle.bigPotMoney,
  uniqueLabels: uniqueLabels,
  TEST_HOLE_ORDER: (catalog.HOLES || []).slice()
};
