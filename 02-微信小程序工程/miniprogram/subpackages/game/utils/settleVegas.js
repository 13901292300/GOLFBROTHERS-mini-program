/**
 * 四人拉斯维加斯（V53 §4.3.5）
 *
 * 固拉：1-2 对 3-4。乱拉/高手不见面：1+4 对 2+3。
 * 调整后杆数组合成数字，小者胜；D = |差|。每人 ±D·K。
 * 翻牌：有鸟或更好则可翻对方十位个位；仅当对方数字变大才执行；双方有鸟时先胜队后负队。
 * 分值翻倍：每块肉 = 本洞分值 D·K（可分封顶）。
 * 分差≤N：得分照算并攒 1 块肉，本洞不吃肉。
 */
const core = require("./settleCore.js");

const MEAT_DEFAULTS = { "le-2": 3, m1: 2, par: 1, "ge-1": 0 };

function addPts(ledger, id, n) {
  ledger[id] = core.round1((Number(ledger[id]) || 0) + n);
}

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
  if (a === b && b === c) return Math.round(a);
  if (par === 3) return Math.round(a);
  if (par === 5) return Math.round(c);
  return Math.round(b);
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
  const strokeDiff = rec[a][field] - rec[b][field];
  if (strokeDiff) return strokeDiff;
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
  const cmp = function (x, y) {
    return cmpPlayers(x, y, rec, hist, rankId);
  };
  if (mode === "split-high" && order.length >= 4) {
    return stableSort(order.slice(0, 2), cmp).concat(stableSort(order.slice(2, 4), cmp));
  }
  return stableSort(order, cmp);
}

function teamsOf(order, mode) {
  if (mode === "fixed") {
    return {
      aTeam: [order[0], order[1]],
      bTeam: [order[2], order[3]]
    };
  }
  return {
    aTeam: [order[0], order[3]],
    bTeam: [order[1], order[2]]
  };
}

function comboOf(x, y) {
  const a = Math.min(x, y);
  const b = Math.max(x, y);
  if (b <= 9) return a * 10 + b;
  if (a >= 10) return a * 10 + b;
  return b * 10 + a;
}

function capCombo(n, rule) {
  if ((rule && rule.comboCap) !== "cap") return n;
  const cap = Number(rule.comboCapN);
  if (!isFinite(cap)) return n;
  return n > cap ? cap : n;
}

function flipCombo(n) {
  const v = Math.abs(Math.round(Number(n) || 0));
  const s = String(v);
  if (s.length < 2) return v;
  return Number(s.slice(0, -2) + s.slice(-1) + s.slice(-2, -1));
}

function flipOppIfBetter(opp) {
  const next = flipCombo(opp);
  return next > opp ? next : opp;
}

function teamHasBird(rec, team) {
  return rec[team[0]].net <= -1 || rec[team[1]].net <= -1;
}

function teamCombo(rec, team, par, rule) {
  const x = par + rec[team[0]].net;
  const y = par + rec[team[1]].net;
  return capCombo(comboOf(x, y), rule);
}

function applySides(ledger, win, lose, unit) {
  addPts(ledger, win[0], unit);
  addPts(ledger, win[1], unit);
  addPts(ledger, lose[0], -unit);
  addPts(ledger, lose[1], -unit);
}

function meatBand(diff) {
  const n = Number(diff);
  if (!isFinite(n)) return "par";
  if (n <= -2) return "le-2";
  if (n === -1) return "m1";
  if (n === 0) return "par";
  return "ge-1";
}

function meatWanted(rule, winnerNet, pool) {
  const raw = lookup(rowMap(rule && rule.meatRows), meatBand(winnerNet), MEAT_DEFAULTS);
  if (raw === "全部" || String(raw).toLowerCase() === "all") return Math.min(3, pool);
  const n = Number(raw);
  return isFinite(n) && n > 0 ? n : 0;
}

function pickBestNet(rec, team) {
  const a = team[0];
  const b = team[1];
  if (rec[a].net < rec[b].net) return rec[a].net;
  if (rec[b].net < rec[a].net) return rec[b].net;
  return rec[a].rel < rec[b].rel ? rec[a].net : rec[b].net;
}

function classifyPush(rule, d) {
  const p = (rule && rule.pushRule) || "push";
  if (p === "none") return { push: false, eat: d > 0 };
  if (p === "within-n") {
    const n = Number(rule && rule.pushWithinN);
    const cap = isFinite(n) ? n : 2;
    if (d === 0) return { push: true, eat: false };
    if (d <= cap) return { push: true, eat: false };
    return { push: false, eat: true };
  }
  if (d === 0) return { push: true, eat: false };
  return { push: false, eat: true };
}

function settleVegas(game, ctx) {
  const holeOrder = (ctx && ctx.holeOrder) || [];
  const scores = (ctx && ctx.scores) || {};
  const rule = (game && game.ruleSnapshot) || {};
  const k = pointValue(game);
  const topHoleTracker = core.createTopHoleTracker();
  let order = initialOrder(game);
  if (order.length < 4) {
    const empty = core.emptyResults(game, holeOrder);
    empty.topHoleStates = topHoleTracker.states;
    return empty;
  }
  order = order.slice(0, 4);
  let meatPool = 0;
  const hist = [];
  const byHole = {};
  const orderByHole = {};
  let rankedNext = false;
  let startMarked = false;
  let prefixBlocked = false;
  const lastLabel = core.lastOnLabel(game, holeOrder);
  const windOn = !!(ctx && ctx.windOn);

  holeOrder.forEach(function (label) {
    const ledger = core.holeLedger();
    const isLast = String(label) === lastLabel;
    if (!core.holeOn(game, label)) {
      byHole[label] = ledger;
      return;
    }
    if (prefixBlocked) {
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
      prefixBlocked = true;
      rankedNext = false;
      byHole[label] = ledger;
      return;
    }

    const sides = teamsOf(order, (game && game.groupMode) || "fixed");
    const aTeam = sides.aTeam;
    const bTeam = sides.bTeam;
    let aCombo = teamCombo(rec, aTeam, par, rule);
    let bCombo = teamCombo(rec, bTeam, par, rule);

    let firstWin = "tie";
    if (aCombo < bCombo) firstWin = "a";
    else if (bCombo < aCombo) firstWin = "b";

    if (firstWin === "a") {
      if (teamHasBird(rec, aTeam)) bCombo = capCombo(flipOppIfBetter(bCombo), rule);
      if (teamHasBird(rec, bTeam)) aCombo = capCombo(flipOppIfBetter(aCombo), rule);
    } else if (firstWin === "b") {
      if (teamHasBird(rec, bTeam)) aCombo = capCombo(flipOppIfBetter(aCombo), rule);
      if (teamHasBird(rec, aTeam)) bCombo = capCombo(flipOppIfBetter(bCombo), rule);
    } else {
      if (teamHasBird(rec, aTeam)) bCombo = capCombo(flipOppIfBetter(bCombo), rule);
      if (teamHasBird(rec, bTeam)) aCombo = capCombo(flipOppIfBetter(aCombo), rule);
    }

    const d = Math.abs(aCombo - bCombo);
    const aWins = aCombo < bCombo;
    const win = aWins ? aTeam : bTeam;
    const lose = aWins ? bTeam : aTeam;
    const flag = classifyPush(rule, d);
    const isPush = !!flag.push;
    const unit = core.round1(d * k);

    if (d === 0) {
      order.forEach(function (id) {
        addPts(ledger, id, 0);
      });
      if (isPush) {
        meatPool += 1;
        core.enqueueTopHole(topHoleTracker, label);
      }
    } else {
      applySides(ledger, win, lose, unit);
      if (isPush) {
        meatPool += 1;
        core.enqueueTopHole(topHoleTracker, label);
      }
      if (meatPool > 0) {
        const eat = core.meatEatCount(
          isPush ? 0 : meatWanted(rule, pickBestNet(rec, win), meatPool),
          meatPool,
          isLast,
          windOn
        );
        if (eat > 0) {
          const piece = core.meatPieceValue(rule, unit, k);
          applySides(ledger, win, lose, core.round1(eat * piece));
          core.consumeTopHoles(topHoleTracker, eat);
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
    catalogId: "vegas",
    topHoleStates: topHoleTracker.states
  };
}

module.exports = {
  settle: settleVegas
};
