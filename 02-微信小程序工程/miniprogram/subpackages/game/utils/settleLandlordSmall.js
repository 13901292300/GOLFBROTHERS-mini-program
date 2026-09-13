/**
 * 三人斗小地主（V53 §4.2.3）
 *
 * 第 3 名单人队 A，第 1、2 名双人队 B/C。
 * 比较 A 的调整后杆数与 max(B,C)（双人队最差成绩），低者胜。
 * 积分 2K : K : K。每次获胜自动吃 1 块肉。双人队负时可包洞。
 */
const shared = require("./settleLandlordShared.js");

const LANDLORD_SMALL_SETTLE_VERSION = "v53-4.2.3";

function settleLandlordSmall(game, ctx) {
  return shared.settleThree(game, ctx, {
    catalogId: "landlord-small",
    settleVersion: LANDLORD_SMALL_SETTLE_VERSION,
    returnMeatPool: true,
    collectDebug: false,
    soloIndex: 2,
    keepOrderOnPush: false,
    allowSplitHigh: false,
    autoMeatCount: 1,
    teamNet: function (rec, solo, mates) {
      return rec[shared.pickTeamWorst(mates, rec)].net;
    },
    winRel: function (rec, soloWins, solo, mates) {
      if (soloWins) return rec[solo].rel;
      return rec[shared.pickTeamWorst(mates, rec)].rel;
    },
    applyBao: shared.applyBao
  });
}

module.exports = {
  settle: settleLandlordSmall,
  LANDLORD_SMALL_SETTLE_VERSION: LANDLORD_SMALL_SETTLE_VERSION
};
