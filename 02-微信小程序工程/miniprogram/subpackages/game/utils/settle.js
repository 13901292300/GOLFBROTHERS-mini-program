/**
 * 结算总入口。
 *
 * 零和（贯穿全部玩法）：
 * - 无捐锅：同一游戏同一洞，所有参与者损益之和为 0。
 * - 有捐锅：同一洞「所有参与者损益 + 本洞锅损益」为 0。
 * - 汇总：所有参与者累计 + 锅累计 为 0。
 *
 * 进行中：用当前成绩 + 当前规则（active 会跟规则库同步）。
 * 已结束：只用开局/结束时锁住的 holeResults，不再重算。
 */
const core = require("./settleCore.js");
const settleStroke2 = require("./settleStroke2.js");
const settleMatch2 = require("./settleMatch2.js");
const settle8421 = require("./settle8421.js");
const settleLandlordBig = require("./settleLandlordBig.js");
const settleLandlordMid = require("./settleLandlordMid.js");
const settle8421Three = require("./settle8421Three.js");
const settle8421Four = require("./settle8421Four.js");
const settleLasuo4 = require("./settleLasuo4.js");
const settleThreeVsOne = require("./settleThreeVsOne.js");
const settleDizhubo4 = require("./settleDizhubo4.js");
const settleVegas = require("./settleVegas.js");
const settleLasuoN = require("./settleLasuoN.js");
const settleHorn = require("./settleHorn.js");
const settlePot = require("./settlePot.js");

function settleGame(game, ctx) {
  const holeOrder = (ctx && ctx.holeOrder) || [];
  const scores = (ctx && ctx.scores) || {};
  const payload = {
    scores: scores,
    holeOrder: holeOrder,
    pars: (ctx && ctx.pars) || {},
    windOn: !!(ctx && ctx.windOn)
  };
  const id = core.catalogIdOf(game);
  if (id === "stroke-2") return settleStroke2.settle(game, payload);
  if (id === "match-2") return settleMatch2.settle(game, payload);
  if (id === "8421-2") return settle8421.settle(game, payload);
  if (id === "landlord-big") return settleLandlordBig.settle(game, payload);
  if (id === "landlord-mid") return settleLandlordMid.settle(game, payload);
  if (id === "8421-3") return settle8421Three.settle(game, payload);
  if (id === "8421-4") return settle8421Four.settle(game, payload);
  if (id === "lasuo-4") return settleLasuo4.settle(game, payload);
  if (id === "three-vs-one") return settleThreeVsOne.settle(game, payload);
  if (id === "dizhubo-4") return settleDizhubo4.settle(game, payload);
  if (id === "vegas") return settleVegas.settle(game, payload);
  if (id === "lasuo-n") return settleLasuoN.settle(game, payload);
  if (id === "horn") return settleHorn.settle(game, payload);
  return core.emptyResults(game, holeOrder);
}

module.exports = {
  POT_ID: core.POT_ID,
  round1: core.round1,
  formatPoints: core.formatPoints,
  formatMoney: core.formatMoney,
  catalogIdOf: core.catalogIdOf,
  playerIdsOf: core.playerIdsOf,
  emptyLedger: core.emptyLedger,
  holeLedger: core.holeLedger,
  holeOn: core.holeOn,
  zeroSumOk: core.zeroSumOk,
  emptyResults: core.emptyResults,
  settleGame,
  lasuoNTriColor: settleLasuoN.triColor,
  hornTriColor: settleHorn.triColor,
  applyHolePot: settlePot.applyHolePot,
  bigPotMoney: settlePot.bigPotMoney
};
