/**
 * 三人斗二地主（V53 §4.2.2）
 *
 * 第 2 名单人队，第 1、3 名双人队。
 * 比较第 2 名调整后杆数与（第 1 名 + 第 3 名）/ 2（一位小数），低者胜。
 * 积分仍为 2K : K : K。顶洞只表示本洞打平并攒肉，乱斗下一洞仍按既定 ranking 重排。
 * 双人队负时可包洞；肉损各自承担。
 */
const core = require("./settleCore.js");
const shared = require("./settleLandlordShared.js");

function settleLandlordMid(game, ctx) {
  return shared.settleThree(game, ctx, {
    catalogId: "landlord-mid",
    soloIndex: 1,
    pushPolicy: "rerank",
    allowSplitHigh: false,
    teamNet: function (rec, solo, mates) {
      return core.round1((rec[mates[0]].net + rec[mates[1]].net) / 2);
    },
    winRel: function (rec, soloWins, solo, mates) {
      if (soloWins) return rec[solo].rel;
      return rec[shared.pickTeamBest(mates, rec)].rel;
    },
    applyBao: shared.applyBao
  });
}

module.exports = {
  settle: settleLandlordMid
};
