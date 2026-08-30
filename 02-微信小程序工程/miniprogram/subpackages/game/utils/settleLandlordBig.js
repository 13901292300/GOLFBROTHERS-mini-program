/**
 * 三人斗大地主（V53 §4.2.1）
 * 第 1 名单人队，比较单人与搭档最低调整后杆。无包洞。
 */
const shared = require("./settleLandlordShared.js");

function settleLandlordBig(game, ctx) {
  return shared.settleThree(game, ctx, {
    catalogId: "landlord-big",
    soloIndex: 0,
    keepOrderOnPush: false,
    teamNet: function (rec, solo, mates) {
      const best = shared.pickTeamBest(mates, rec);
      return rec[best].net;
    },
    winRel: function (rec, soloWins, solo, mates) {
      if (soloWins) return rec[solo].rel;
      return rec[shared.pickTeamBest(mates, rec)].rel;
    }
  });
}

module.exports = {
  settle: settleLandlordBig
};
