/**
 * 多人拉丝：无让杆 1V1 + 可选总杆 PK；编队与设置页一致。
 */
const core = require("./settleCore.js");

const TRI_BLUE = "#007AFF";
const TRI_RED = "#FF3B30";

function toId(v) {
  return v == null ? "" : String(v);
}

function num(v, fallback) {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function evenizeIds(ids) {
  const list = (ids || []).map(toId).filter(Boolean);
  if (list.length % 2 === 1) {
    return { active: list.slice(0, -1), bye: list[list.length - 1] };
  }
  return { active: list, bye: "" };
}

function teamByIndex(i, n, formation) {
  const form = formation === "haidao" ? "haidao" : "jianghu";
  if (form === "haidao") {
    if (i < 4) return i === 0 || i === 3 ? "A" : "B";
    return i % 2 === 0 ? "A" : "B";
  }
  const start = Math.floor(i / 4) * 4;
  const rest = n - start;
  const local = i - start;
  if (rest >= 4) {
    const odd = Math.floor(start / 4) % 2 === 0;
    if (odd) return local === 0 || local === 3 ? "A" : "B";
    return local === 1 || local === 2 ? "A" : "B";
  }
  if (start === 0) return local === 0 ? "A" : "B";
  return local === 1 ? "A" : "B";
}

function formTeamLists(ids, formation) {
  const list = (ids || []).map(toId).filter(Boolean);
  const A = [];
  const B = [];
  for (let i = 0; i < list.length; i++) {
    if (teamByIndex(i, list.length, formation) === "A") A.push(list[i]);
    else B.push(list[i]);
  }
  return { A: A, B: B };
}

function coeffAt(coeffs, i) {
  const row = (coeffs || [])[i];
  if (!row) return 1;
  const v = Number(row.value);
  return isNaN(v) ? 1 : v;
}

function mulOf(rel, rows, rewardOn) {
  if (!rewardOn) return 1;
  const map = {};
  (rows || []).forEach(function (row) {
    if (row && row.id) map[row.id] = Number(row.value);
  });
  if (rel <= -3) {
    const v = map.albatross;
    return v > 0 ? v : 10;
  }
  if (rel === -2) {
    const v = map.eagle;
    return v > 0 ? v : 5;
  }
  if (rel === -1) {
    const v = map.birdie;
    return v > 0 ? v : 2;
  }
  return 1;
}

function bandOf(bandMap, id) {
  return String((bandMap && bandMap[id]) || "low") === "high" ? "high" : "low";
}

function matchup(order, game) {
  const formation = game && game.formation === "haidao" ? "haidao" : "jianghu";
  const coeffs = (game && game.pairCoeffs) || [];
  let A = [];
  let B = [];

  if (game && game.bandMode === "split-high") {
    const L = Math.max(0, num(game.bandLow, 0));
    const H = Math.max(0, num(game.bandHigh, 0));
    const bandMap = (game && game.bandMap) || {};
    const hasMap = Object.keys(bandMap).length > 0;
    let lowIds;
    let highIds;
    if (hasMap) {
      lowIds = order.filter(function (id) {
        return bandOf(bandMap, id) === "low";
      });
      highIds = order.filter(function (id) {
        return bandOf(bandMap, id) === "high";
      });
    } else {
      lowIds = order.slice(0, L);
      highIds = order.slice(L, L + H);
    }
    const lowTake = evenizeIds(lowIds.slice(0, L || lowIds.length));
    const highTake = evenizeIds(highIds.slice(0, H || highIds.length));
    const lowTeams = formTeamLists(lowTake.active, formation);
    const highTeams = formTeamLists(highTake.active, formation);
    A = lowTeams.A.concat(highTeams.B);
    B = lowTeams.B.concat(highTeams.A);
  } else {
    const ev = evenizeIds(order);
    const lists = formTeamLists(ev.active, formation);
    A = lists.A;
    B = lists.B;
  }

  const pairs = [];
  const len = Math.min(A.length, B.length);
  for (let i = 0; i < len; i++) {
    pairs.push({ a: A[i], b: B[i], k: coeffAt(coeffs, i) });
  }
  const used = {};
  A.forEach(function (id) {
    used[id] = "A";
  });
  B.forEach(function (id) {
    used[id] = "B";
  });
  const byes = [];
  order.forEach(function (id) {
    if (!used[id]) {
      byes.push(id);
      used[id] = "bye";
    }
  });
  return { A: A, B: B, pairs: pairs, byes: byes, side: used };
}

function resultTie(rankId) {
  return String(rankId || "").indexOf("result") >= 0;
}

function walkHistory(hist, a, b, field, dir) {
  for (let i = hist.length - 1; i >= 0; i--) {
    const rec = hist[i];
    if (!rec || !rec[a] || !rec[b]) continue;
    const va = rec[a][field];
    const vb = rec[b][field];
    if (va == null || vb == null) continue;
    if (va === vb) continue;
    return dir * (va - vb);
  }
  return 0;
}

function cmpPlayers(a, b, rec, hist, rankId) {
  const field = "rel";
  const strokeDiff = rec[a][field] - rec[b][field];
  if (strokeDiff) return strokeDiff;
  if (resultTie(rankId)) {
    const pts = rec[b].pts - rec[a].pts;
    if (pts) return pts;
    return walkHistory(hist, a, b, "pts", -1);
  }
  return walkHistory(hist, a, b, field, 1);
}

function stableSort(arr, cmp) {
  const a = arr.slice();
  for (let i = 1; i < a.length; i++) {
    const x = a[i];
    let j = i - 1;
    while (j >= 0 && cmp(a[j], x) > 0) {
      a[j + 1] = a[j];
      j--;
    }
    a[j + 1] = x;
  }
  return a;
}

function nextOrder(order, rec, hist, game, isPush) {
  if ((game && game.sortUpdate) === "fixed") return order.slice();
  if (isPush) return order.slice();
  const rankId = (game && game.rankId) || "gross-origin";
  return stableSort(order, function (a, b) {
    return cmpPlayers(a, b, rec, hist, rankId);
  });
}

function readRel(scores, hole, playerId) {
  const holeCard = scores && scores[hole];
  if (!holeCard) return null;
  const v = holeCard[playerId];
  if (v == null || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function addPts(ledger, id, pts) {
  if (!id) return;
  ledger[id] = core.round1((Number(ledger[id]) || 0) + pts);
}

function applyTeam(ledger, A, B, d) {
  A.forEach(function (id) {
    addPts(ledger, id, d);
  });
  B.forEach(function (id) {
    addPts(ledger, id, -d);
  });
}

function triColor(game, order, playerId) {
  const m = matchup((order || []).map(toId), game || {});
  const side = m.side[toId(playerId)];
  if (side === "A") return TRI_BLUE;
  if (side === "B") return TRI_RED;
  return "";
}

function settle(game, payload) {
  const ids = core.playerIdsOf(game);
  const holeOrder = (payload && payload.holeOrder) || [];
  if (ids.length < 2) return core.emptyResults(game, holeOrder);

  const scores = (payload && payload.scores) || {};
  const rewardOn = !!(game && game.rewardOn);
  const mulRows = (game && game.lasuoNMulRows) || [];
  const kt = Math.max(0, num(game && game.totalPkKt, 0));
  const pushRule = game && game.pushRule;
  const meatOn = pushRule === "all-tie" || pushRule === "team-tie";
  const lastOn = core.lastOnLabel(game, holeOrder);
  const windOn = !!(payload && payload.windOn);

  let order = ((game && game.playerOrder) || []).map(toId).filter(Boolean);
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
      const rel = readRel(scores, hole, id);
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

    const m = matchup(order, game);
    if (!m.pairs.length) {
      rankedNext = false;
      return;
    }

    let teamA = 0;
    let allPairsTied = true;
    m.pairs.forEach(function (pair) {
      const ra = rec[pair.a] && rec[pair.a].rel;
      const rb = rec[pair.b] && rec[pair.b].rel;
      if (ra == null || rb == null) return;
      if (ra !== rb) allPairsTied = false;
      if (ra === rb) return;
      const winnerRel = ra < rb ? ra : rb;
      const signed = ra < rb ? pair.k : -pair.k;
      const pts = signed * mulOf(winnerRel, mulRows, rewardOn);
      teamA += pts;
    });

    let sumA = 0;
    let sumB = 0;
    m.A.forEach(function (id) {
      sumA += rec[id].rel;
    });
    m.B.forEach(function (id) {
      sumB += rec[id].rel;
    });
    const teamTied = sumA === sumB;
    if (kt > 0 && !teamTied) {
      teamA += sumA < sumB ? kt : -kt;
    }

    const isPush =
      meatOn &&
      teamTied &&
      (pushRule === "team-tie" ? teamA === 0 : allPairsTied && teamA === 0);

    ids.forEach(function (id) {
      addPts(holeBook, id, 0);
    });

    if (isPush) {
      meatPool += 1;
      hist.push(rec);
      order = nextOrder(order, rec, hist, game, true);
      rankedNext = true;
      return;
    }

    let d = teamA;
    if (d !== 0 && meatPool > 0) {
      if (windOn && lastOn && hole === lastOn) {
        meatEaten += meatPool;
        d *= Math.pow(2, meatPool);
        meatPool = 0;
      } else {
        meatEaten += 1;
        d *= 2;
        meatPool -= 1;
      }
    }

    applyTeam(holeBook, m.A, m.B, d);
    applyTeam(ledger, m.A, m.B, d);
    m.A.concat(m.B).forEach(function (id) {
      if (rec[id]) rec[id].pts = Number(holeBook[id]) || 0;
    });
    hist.push(rec);
    order = nextOrder(order, rec, hist, game, false);
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
  matchup,
  mulOf,
  evenizeIds,
  nextOrder,
  readRel,
  addPts,
  applyTeam,
  toId,
  num
};
