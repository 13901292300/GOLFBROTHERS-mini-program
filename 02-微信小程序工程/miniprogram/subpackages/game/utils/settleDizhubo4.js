/**
 * 四人地主婆（V53 §4.3.4）
 *
 * 最后一名固定为地主婆 D。大地主婆：第 1 名 + D vs 第 2、3 名最好；
 * 二地主婆：第 2 名 + D 最好 vs 第 1、3 名平均。低者胜。胜队每人 +K·M，负队 −K·M。
 * 比较用真实杆差；让杆只参与乱斗排序。无包洞。
 */
const core = require("./settleCore.js");
const stroke = require("./settleStroke2.js");

const MUL_DEFAULTS = { hio: 10, m2: 5, m1: 2, par: 1, p1: 1, ge2: 1 };
const MEAT_DEFAULTS = { "le-2": 3, m1: 2, par: 1, "ge-1": 0 };

function rowMap(rows) {
  const map = {};
  (rows || []).forEach(function (row) {
    if (!row || row.id == null) return;
    if (row.value == null || row.value === "") return;
    const n = Number(row.value);
    if (isFinite(n)) map[row.id] = n;
  });
  return map;
}

function lookup(map, band, fallback) {
  if (map[band] != null) return map[band];
  return fallback[band];
}

function pointValue(game) {
  const raw = game && game.multiplier;
  if (raw == null || raw === "") return 1;
  const n = Number(raw);
  return isFinite(n) ? n : 1;
}

function addPts(ledger, id, n) {
  ledger[id] = core.round1((Number(ledger[id]) || 0) + n);
}

function readRel(scores, hole, playerId) {
  const holeCard = scores && scores[hole];
  if (!holeCard) return null;
  const v = holeCard[playerId];
  if (v == null || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function holePar(ctx, label) {
  const map = (ctx && ctx.pars) || {};
  const n = Number(map[label]);
  if (n === 3 || n === 4 || n === 5) return n;
  return 4;
}

function holeInHcap(cfg, label) {
  const holes = (cfg && cfg.hcapHoles) || [];
  if (!holes.length) return true;
  return holes.some(function (item) {
    const key = item && item.label != null ? item.label : item;
    return String(key) === String(label) && (!item || item.on !== false);
  });
}

function nByPar(cfg, par) {
  const p3 = Number(cfg && cfg.par3);
  const p4 = Number(cfg && cfg.par4);
  const p5 = Number(cfg && cfg.par5);
  const a = isFinite(p3) ? p3 : 0;
  const b = isFinite(p4) ? p4 : 0;
  const c = isFinite(p5) ? p5 : 0;
  if (a === b && b === c) return a;
  if (par === 3) return a;
  if (par === 5) return c;
  return b;
}

function playerOf(game, id) {
  return (
    ((game && game.players) || []).find(function (item) {
      return String(item.id) === String(id);
    }) || {}
  );
}

function playerHcapN(player, label, par) {
  const list = (player && player.hcapList) || [];
  for (let i = 0; i < list.length; i++) {
    const cfg = list[i];
    if (!holeInHcap(cfg, label)) continue;
    return nByPar(cfg, par);
  }
  return nByPar(
    {
      par3: player && player.hcapPar3,
      par4: player && player.hcapPar4,
      par5: player && player.hcapPar5
    },
    par
  );
}

function initialOrder(game) {
  const ids = core.playerIdsOf(game);
  const order = [];
  const seen = {};
  ((game && game.playerOrder) || []).forEach(function (id) {
    const s = String(id);
    if (ids.indexOf(s) >= 0 && !seen[s]) {
      seen[s] = true;
      order.push(s);
    }
  });
  ids.forEach(function (id) {
    if (!seen[id]) order.push(id);
  });
  return order;
}

function meatBand(diff) {
  const n = Number(diff);
  if (!isFinite(n)) return "par";
  if (n <= -2) return "le-2";
  if (n === -1) return "m1";
  if (n === 0) return "par";
  return "ge-1";
}

function meatWanted(rule, winnerRel, pool) {
  const raw = lookup(rowMap(rule && rule.meatRows), meatBand(winnerRel), MEAT_DEFAULTS);
  if (raw === "全部" || String(raw).toLowerCase() === "all") return Math.min(3, pool);
  const n = Number(raw);
  return isFinite(n) && n > 0 ? n : 0;
}

function winnerMul(rule, winRel) {
  if (((rule && rule.reward) || "none") !== "mul") return 1;
  const m = lookup(rowMap(rule && rule.mulRows), stroke.scoreBand(winRel), MUL_DEFAULTS);
  return isFinite(m) && m > 0 ? m : 1;
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
  const id = String(rankId || "gross-origin");
  const field = id.indexOf("net") === 0 ? "net" : "rel";
  const d = rec[a][field] - rec[b][field];
  if (d) return d;
  if (resultTie(id)) {
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

function nextOrder(order, rec, hist, game, rule, isPush) {
  const mode = (game && game.groupMode) || "fixed";
  if (mode === "fixed") return order.slice();
  const reorderOnPush = (rule && rule.reorderOnPush) === "yes";
  if (isPush && !reorderOnPush) return order.slice();
  const rankId = (game && game.rankId) || "gross-origin";
  const head = stableSort(order.slice(0, 3), function (a, b) {
    return cmpPlayers(a, b, rec, hist, rankId);
  });
  return head.concat(order[3]);
}

function sidesOf(order, mid) {
  const d = order[3];
  if (mid) {
    return { land: [order[1], d], farm: [order[0], order[2]] };
  }
  return { land: [order[0], d], farm: [order[1], order[2]] };
}

function bestRel(rec, ids) {
  return rec[ids[0]].rel <= rec[ids[1]].rel ? rec[ids[0]].rel : rec[ids[1]].rel;
}

function pickBestRel(rec, ids) {
  let id = ids[0];
  ids.forEach(function (x) {
    if (rec[x].rel < rec[id].rel) id = x;
    else if (rec[x].rel === rec[id].rel && rec[x].net < rec[id].net) id = x;
  });
  return rec[id].rel;
}

function applySides(ledger, win, lose, unit) {
  addPts(ledger, win[0], unit);
  addPts(ledger, win[1], unit);
  addPts(ledger, lose[0], -unit);
  addPts(ledger, lose[1], -unit);
}

function settleDizhubo4(game, ctx) {
  const holeOrder = (ctx && ctx.holeOrder) || [];
  const scores = (ctx && ctx.scores) || {};
  const rule = (game && game.ruleSnapshot) || {};
  const k = pointValue(game);
  const mid = (game && game.dizhuboMode) === "mid";
  let order = initialOrder(game);
  if (order.length < 4) return core.emptyResults(game, holeOrder);
  order = order.slice(0, 4);
  let meatPool = 0;
  const hist = [];
  const byHole = {};
  const orderByHole = {};
  let rankedNext = false;
  let startMarked = false;
  const lastLabel = core.lastOnLabel(game, holeOrder);
  const windOn = !!(ctx && ctx.windOn);

  holeOrder.forEach(function (label) {
    const ledger = core.holeLedger();
    const isLast = String(label) === lastLabel;
    if (!core.holeOn(game, label)) {
      byHole[label] = ledger;
      return;
    }
    if (!startMarked || rankedNext) orderByHole[label] = order.slice();
    startMarked = true;
    const par = holePar(ctx, label);
    const rec = {};
    let ready = true;
    order.forEach(function (id) {
      const rel = readRel(scores, label, id);
      if (rel == null) {
        ready = false;
        return;
      }
      const n = playerHcapN(playerOf(game, id), label, par);
      rec[id] = { rel: rel, net: rel - n, pts: 0 };
    });
    if (!ready) {
      rankedNext = false;
      byHole[label] = ledger;
      return;
    }

    const sides = sidesOf(order, mid);
    const land = sides.land;
    const farm = sides.farm;
    const landScore = bestRel(rec, land);
    const farmScore = mid
      ? core.round1((rec[farm[0]].rel + rec[farm[1]].rel) / 2)
      : bestRel(rec, farm);
    const tied = landScore === farmScore;
    const pushOn = (rule && rule.pushRule) !== "none";
    const isPush = tied && pushOn;

    if (tied) {
      order.forEach(function (id) {
        addPts(ledger, id, 0);
      });
      if (isPush) meatPool += 1;
    } else {
      const landWins = landScore < farmScore;
      const win = landWins ? land : farm;
      const lose = landWins ? farm : land;
      const winRel = mid && !landWins ? Math.round(farmScore) : pickBestRel(rec, win);
      const mul = winnerMul(rule, winRel);
      const unit = core.round1(k * mul);
      applySides(ledger, win, lose, unit);
      if (meatPool > 0) {
        const eat = core.meatEatCount(meatWanted(rule, pickBestRel(rec, win), meatPool), meatPool, isLast, windOn);
        if (eat > 0) {
          const meatUnit =
            (rule && rule.meatInclude) === "yes" ? unit : core.round1(k);
          applySides(ledger, win, lose, core.round1(eat * meatUnit));
          meatPool -= eat;
        }
      }
    }

    order.forEach(function (id) {
      rec[id].pts = Number(ledger[id]) || 0;
    });
    hist.push(rec);
    order = nextOrder(order, rec, hist, game, rule, isPush);
    rankedNext = true;
    byHole[label] = ledger;
  });

  return {
    byHole: byHole,
    orderByHole: orderByHole,
    initial: core.emptyLedger(core.playerIdsOf(game)),
    catalogId: "dizhubo-4"
  };
}

module.exports = {
  settle: settleDizhubo4
};
