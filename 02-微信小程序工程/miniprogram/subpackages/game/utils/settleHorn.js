/**
 * 喇叭花：中间位 vs 其余人 1V1，其余人再打一局多人拉丝（所有一起）。
 */
const core = require("./settleCore.js");
const lasuo = require("./settleLasuoN.js");

const TRI_BLUE = "#007AFF";
const TRI_RED = "#FF3B30";
const TRI_GOLD = "#ce9224";

function layout(order, game) {
  const ids = (order || []).map(lasuo.toId).filter(Boolean);
  const ev = lasuo.evenizeIds(ids);
  const active = ev.active;
  const m = active.length;
  const flowerPos = m > 0 ? (m + 1) / 2 : 0;
  const flower = flowerPos > 0 ? active[flowerPos - 1] : "";
  const rest = active.filter(function (_id, i) {
    return i + 1 !== flowerPos;
  });
  const lasuoM = lasuo.matchup(
    rest,
    Object.assign({}, game || {}, { bandMode: "all" })
  );
  const side = {};
  if (ev.bye) side[ev.bye] = "bye";
  if (flower) side[flower] = "flower";
  lasuoM.A.forEach(function (id) {
    side[id] = "A";
  });
  lasuoM.B.forEach(function (id) {
    side[id] = "B";
  });
  return {
    flower: flower,
    rest: rest,
    bye: ev.bye,
    active: active,
    lasuo: lasuoM,
    side: side
  };
}

function pairPts(relA, relB, k, mulRows, rewardOn) {
  if (relA == null || relB == null || relA === relB) return 0;
  const winnerRel = relA < relB ? relA : relB;
  const signed = relA < relB ? k : -k;
  return signed * lasuo.mulOf(winnerRel, mulRows, rewardOn);
}

function allSameRel(rec, ids) {
  if (!ids.length) return false;
  const first = rec[ids[0]] && rec[ids[0]].rel;
  if (first == null) return false;
  return ids.every(function (id) {
    return rec[id] && rec[id].rel === first;
  });
}

function lasuoTeamD(rec, lasuoM, mulRows, rewardOn, kt) {
  let teamA = 0;
  lasuoM.pairs.forEach(function (pair) {
    const ra = rec[pair.a] && rec[pair.a].rel;
    const rb = rec[pair.b] && rec[pair.b].rel;
    teamA += pairPts(ra, rb, pair.k, mulRows, rewardOn);
  });
  let sumA = 0;
  let sumB = 0;
  lasuoM.A.forEach(function (id) {
    sumA += rec[id].rel;
  });
  lasuoM.B.forEach(function (id) {
    sumB += rec[id].rel;
  });
  if (kt > 0 && sumA !== sumB) {
    teamA += sumA < sumB ? kt : -kt;
  }
  return teamA;
}

function triColor(game, order, playerId) {
  const m = layout((order || []).map(lasuo.toId), game || {});
  const side = m.side[lasuo.toId(playerId)];
  if (side === "flower") return TRI_GOLD;
  if (side === "A") return TRI_BLUE;
  if (side === "B") return TRI_RED;
  return "";
}

function settle(game, payload) {
  const ids = core.playerIdsOf(game);
  const holeOrder = (payload && payload.holeOrder) || [];
  if (ids.length < 5) return core.emptyResults(game, holeOrder);

  const scores = (payload && payload.scores) || {};
  const rewardOn = game && game.rewardOn !== false;
  const mulRows = (game && game.lasuoNMulRows) || [];
  const kt = Math.max(0, lasuo.num(game && game.totalPkKt, 0));
  const flowerK = lasuo.num(game && game.flowerK, 1);
  const meatOn = (game && game.pushRule) !== "none";
  const lastOn = core.lastOnLabel(game, holeOrder);
  const windOn = !!(payload && payload.windOn);

  let order = ((game && game.playerOrder) || []).map(lasuo.toId).filter(Boolean);
  if (!order.length) order = ids.slice();

  const ledger = core.emptyLedger(ids);
  const byHole = {};
  const orderByHole = {};
  const hist = [];
  let meatPool = 0;
  let meatEaten = 0;
  const isFixed = (game && game.sortUpdate) === "fixed";
  let rankedNext = false;
  let startMarked = false;

  holeOrder.forEach(function (label) {
    const hole = String(label);
    const holeBook = core.holeLedger();
    byHole[hole] = holeBook;
    if (!core.holeOn(game, hole)) return;
    if (isFixed || !startMarked || rankedNext) {
      orderByHole[hole] = order.slice();
    }
    startMarked = true;

    const rec = {};
    let ready = true;
    ids.forEach(function (id) {
      const rel = lasuo.readRel(scores, hole, id);
      if (rel == null) {
        ready = false;
        return;
      }
      rec[id] = { rel: rel, pts: 0 };
    });
    if (!ready) {
      rankedNext = false;
      return;
    }

    const lay = layout(order, game);
    if (!lay.flower || lay.active.length < 3) {
      rankedNext = false;
      return;
    }

    ids.forEach(function (id) {
      lasuo.addPts(holeBook, id, 0);
    });

    const isPush = meatOn && allSameRel(rec, lay.active);
    if (isPush) {
      meatPool += 1;
      hist.push(rec);
      order = lasuo.nextOrder(order, rec, hist, game, true);
      rankedNext = true;
      return;
    }

    const raw = {};
    ids.forEach(function (id) {
      raw[id] = 0;
    });

    lay.rest.forEach(function (opp) {
      const pts = pairPts(
        rec[lay.flower].rel,
        rec[opp].rel,
        flowerK,
        mulRows,
        rewardOn
      );
      raw[lay.flower] += pts;
      raw[opp] -= pts;
    });

    const d = lasuoTeamD(rec, lay.lasuo, mulRows, rewardOn, kt);
    lay.lasuo.A.forEach(function (id) {
      raw[id] += d;
    });
    lay.lasuo.B.forEach(function (id) {
      raw[id] -= d;
    });

    let factor = 1;
    if (meatPool > 0) {
      if (windOn && lastOn && hole === lastOn) {
        meatEaten += meatPool;
        factor = Math.pow(2, meatPool);
        meatPool = 0;
      } else {
        meatEaten += 1;
        factor = 2;
        meatPool -= 1;
      }
    }

    ids.forEach(function (id) {
      const pts = core.round1((Number(raw[id]) || 0) * factor);
      lasuo.addPts(holeBook, id, pts);
      lasuo.addPts(ledger, id, pts);
      if (rec[id]) rec[id].pts = pts;
    });

    hist.push(rec);
    order = lasuo.nextOrder(order, rec, hist, game, false);
    rankedNext = true;
  });

  return {
    byHole: byHole,
    totals: ledger,
    orderByHole: orderByHole,
    meatEatCount: meatEaten
  };
}

module.exports = {
  settle,
  triColor,
  layout
};
