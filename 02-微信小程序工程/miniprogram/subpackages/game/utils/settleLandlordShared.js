/**
 * 三人斗地主共用：让杆、排序、2:1 分账、顶洞吃肉。
 * 「分值翻倍」与「肉含奖励」：每块肉 = 本洞分值（不是本洞×2）。
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

function winnerMul(rule, winnerRel) {
  if (((rule && rule.reward) || "none") !== "mul") return 1;
  const m = lookup(rowMap(rule.mulRows), stroke.scoreBand(winnerRel), MUL_DEFAULTS);
  return isFinite(m) && m > 0 ? m : 1;
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
  if (raw === "全部" || String(raw).toLowerCase() === "all") {
    return Math.min(3, pool);
  }
  const n = Number(raw);
  if (!isFinite(n) || n < 0) return 0;
  return n;
}

function pushEnabled(rule) {
  return (rule && rule.pushRule) !== "none";
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
  const useNet = id.indexOf("net") === 0;
  const field = useNet ? "net" : "rel";
  const stroke = rec[a][field] - rec[b][field];
  if (stroke) return stroke;
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

function nextOrder(order, rec, hist, game, rule, isPush, opts) {
  const mode = (game && game.groupMode) || "fixed";
  if (mode === "fixed") return order.slice();
  const lockNo = opts && opts.keepOrderOnPush;
  const reorderOnPush = lockNo ? false : (rule && rule.reorderOnPush) === "yes";
  if (isPush && !reorderOnPush) return order.slice();
  const rankId = (game && game.rankId) || "gross-origin";
  const cmp = function (a, b) {
    return cmpPlayers(a, b, rec, hist, rankId);
  };
  const catalogId = core.catalogIdOf(game);
  const allowSplitHigh =
    catalogId !== "landlord-mid" &&
    catalogId !== "landlord-small" &&
    catalogId !== "8421-3";
  if (allowSplitHigh && mode === "split-high" && order.length >= 3) {
    const highs = stableSort(order.slice(0, 2), cmp);
    return highs.concat(order.slice(2));
  }
  return stableSort(order, cmp);
}

function pickTeamBest(ids, rec) {
  let best = ids[0];
  ids.forEach(function (id) {
    if (rec[id].net < rec[best].net) best = id;
    else if (rec[id].net === rec[best].net && rec[id].rel < rec[best].rel) best = id;
  });
  return best;
}

/** 双人队最差成绩（最高调整后杆），斗小地主比较用。 */
function pickTeamWorst(ids, rec) {
  let worst = ids[0];
  ids.forEach(function (id) {
    if (rec[id].net > rec[worst].net) worst = id;
    else if (rec[id].net === rec[worst].net && rec[id].rel > rec[worst].rel) worst = id;
  });
  return worst;
}

function applySplit(ledger, solo, mates, sign, unit) {
  addPts(ledger, solo, sign * 2 * unit);
  mates.forEach(function (id) {
    addPts(ledger, id, -sign * unit);
  });
}

function baoTriggered(playerRec, partnerRec, soloRec, par, rule) {
  const mode = (rule && rule.baoMode) || "none";
  if (mode === "none" || !playerRec || !partnerRec || !soloRec) return false;
  if ((rule && rule.baoPre) === "ahead" && !(partnerRec.net <= soloRec.net)) return false;
  if (mode === "plus-n") {
    const n = Number(rule.baoPlusN);
    const start = isFinite(n) ? n : 4;
    return playerRec.rel >= start;
  }
  if (mode === "doublepar-n") {
    const extra = Number(rule.baoDoubleN);
    const start = par + (isFinite(extra) ? extra : 0);
    return playerRec.rel >= start;
  }
  if (mode === "partner-diff") {
    const n = Number(rule.baoDiffN);
    const need = isFinite(n) ? n : 3;
    return playerRec.net - partnerRec.net >= need;
  }
  return false;
}

function applyBao(ledger, solo, mates, rec, par, rule, unit) {
  if ((rule && rule.baoMode) === "none" || !rule || !rule.baoMode) return;
  const t0 = baoTriggered(rec[mates[0]], rec[mates[1]], rec[solo], par, rule);
  const t1 = baoTriggered(rec[mates[1]], rec[mates[0]], rec[solo], par, rule);
  if (t0 === t1) return;
  const cover = t0 ? mates[0] : mates[1];
  const other = t0 ? mates[1] : mates[0];
  addPts(ledger, cover, -unit);
  addPts(ledger, other, unit);
}

function settleThree(game, ctx, spec) {
  const holeOrder = (ctx && ctx.holeOrder) || [];
  const scores = (ctx && ctx.scores) || {};
  const rule = (game && game.ruleSnapshot) || {};
  const k = pointValue(game);
  const topHoleTracker = core.createTopHoleTracker();
  let order = initialOrder(game);
  if (order.length < 3) {
    const empty = core.emptyResults(game, holeOrder);
    empty.topHoleStates = topHoleTracker.states;
    return empty;
  }
  order = order.slice(0, 3);
  let meatPool = 0;
  const hist = [];
  const byHole = {};
  const orderByHole = {};
  const holeDebug = {};
  const orderHistory = [];
  const soloIndex = spec && spec.soloIndex != null ? spec.soloIndex : 0;
  const autoMeat =
    spec && spec.autoMeatCount != null && isFinite(Number(spec.autoMeatCount))
      ? Math.max(0, Number(spec.autoMeatCount))
      : null;
  const collectDebug = !!(spec && spec.collectDebug);
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
    const orderBefore = order.slice();
    if (!startMarked || rankedNext) orderByHole[label] = orderBefore;
    startMarked = true;
    const par = holePar(ctx, label);
    const rec = {};
    const handicaps = {};
    let ready = true;
    order.forEach(function (id) {
      const rel = readRel(scores, label, id);
      if (rel == null) {
        ready = false;
        return;
      }
      const n = playerHcapN(playerOf(game, id), label, par);
      handicaps[id] = n;
      rec[id] = { rel: rel, net: rel - n, pts: 0 };
    });
    if (!ready) {
      rankedNext = false;
      prefixBlocked = true;
      byHole[label] = ledger;
      if (collectDebug) {
        holeDebug[label] = {
          status: "pending",
          orderBefore: orderBefore,
          actualScores: null,
          handicaps: handicaps,
          adjustedScores: null,
          winner: null,
          finalScores: ledger
        };
      }
      return;
    }

    const solo = order[soloIndex];
    const mates = order.filter(function (id) {
      return id !== solo;
    });
    const teamNet = spec.teamNet(rec, solo, mates);
    const soloNet = rec[solo].net;
    const tied = soloNet === teamNet;
    const isPush = tied && pushEnabled(rule);
    let winner = "tie";
    let mul = 1;
    let meatBefore = meatPool;
    let meatTaken = 0;
    let packageTriggers = [false, false];
    const baseScores = {};
    const normalScores = {};
    const meatScores = {};

    if (tied) {
      addPts(ledger, solo, 0);
      addPts(ledger, mates[0], 0);
      addPts(ledger, mates[1], 0);
      if (isPush) {
        meatPool += 1;
        core.enqueueTopHole(topHoleTracker, label);
      }
    } else {
      const soloWins = soloNet < teamNet;
      winner = soloWins ? "A" : "BC";
      const winRel = spec.winRel(rec, soloWins, solo, mates);
      mul = winnerMul(rule, winRel);
      const unit = core.round1(k * mul);
      const sign = soloWins ? 1 : -1;
      applySplit(ledger, solo, mates, sign, unit);
      baseScores[solo] = sign * 2 * unit;
      baseScores[mates[0]] = -sign * unit;
      baseScores[mates[1]] = -sign * unit;
      normalScores[solo] = Number(ledger[solo]) || 0;
      normalScores[mates[0]] = Number(ledger[mates[0]]) || 0;
      normalScores[mates[1]] = Number(ledger[mates[1]]) || 0;
      if (spec.applyBao && soloWins) {
        packageTriggers = [
          baoTriggered(rec[mates[0]], rec[mates[1]], rec[solo], par, rule),
          baoTriggered(rec[mates[1]], rec[mates[0]], rec[solo], par, rule)
        ];
        spec.applyBao(ledger, solo, mates, rec, par, rule, unit);
        normalScores[solo] = Number(ledger[solo]) || 0;
        normalScores[mates[0]] = Number(ledger[mates[0]]) || 0;
        normalScores[mates[1]] = Number(ledger[mates[1]]) || 0;
      }
      if (meatPool > 0) {
        const wanted =
          autoMeat != null ? autoMeat : meatWanted(rule, winRel, meatPool);
        const eat = core.meatEatCount(wanted, meatPool, isLast, windOn);
        if (eat > 0) {
          const meatUnit = core.meatPieceValue(rule, unit, k, { includeStyle: true });
          const beforeMeat = {
            a: Number(ledger[solo]) || 0,
            b: Number(ledger[mates[0]]) || 0,
            c: Number(ledger[mates[1]]) || 0
          };
          applySplit(ledger, solo, mates, sign, core.round1(eat * meatUnit));
          meatTaken = eat;
          meatScores[solo] = core.round1((Number(ledger[solo]) || 0) - beforeMeat.a);
          meatScores[mates[0]] = core.round1((Number(ledger[mates[0]]) || 0) - beforeMeat.b);
          meatScores[mates[1]] = core.round1((Number(ledger[mates[1]]) || 0) - beforeMeat.c);
          core.consumeTopHoles(topHoleTracker, eat);
          meatPool -= eat;
        }
      }
    }

    rec[solo].pts = Number(ledger[solo]) || 0;
    rec[mates[0]].pts = Number(ledger[mates[0]]) || 0;
    rec[mates[1]].pts = Number(ledger[mates[1]]) || 0;
    hist.push(rec);
    const orderAfter = nextOrder(order, rec, hist, game, rule, isPush, spec);
    orderHistory.push({ hole: label, orderBefore: orderBefore, orderAfter: orderAfter.slice() });
    order = orderAfter;
    rankedNext = true;
    byHole[label] = ledger;
    if (collectDebug) {
      const adjusted = {};
      const actual = {};
      orderBefore.forEach(function (id) {
        actual[id] = rec[id].rel;
        adjusted[id] = rec[id].net;
      });
      holeDebug[label] = {
        status: "settled",
        orderBefore: orderBefore,
        roles: { A: solo, B: mates[0], C: mates[1] },
        actualScores: actual,
        handicaps: handicaps,
        adjustedScores: adjusted,
        singleCompareScore: soloNet,
        doubleCompareScore: teamNet,
        winner: winner,
        rewardKey: tied ? null : stroke.scoreBand(spec.winRel(rec, winner === "A", solo, mates)),
        multiplier: mul,
        baseScores: baseScores,
        normalScores: normalScores,
        meatBefore: meatBefore,
        meatTaken: meatTaken,
        meatScores: meatScores,
        packageTriggers: packageTriggers,
        finalScores: {
          a: Number(ledger[solo]) || 0,
          b: Number(ledger[mates[0]]) || 0,
          c: Number(ledger[mates[1]]) || 0
        },
        orderAfter: order.slice()
      };
    }
  });

  const out = {
    byHole: byHole,
    orderByHole: orderByHole,
    initial: core.emptyLedger(core.playerIdsOf(game)),
    catalogId: (spec && spec.catalogId) || core.catalogIdOf(game),
    topHoleStates: topHoleTracker.states
  };
  if (spec && spec.settleVersion) out.settleVersion = spec.settleVersion;
  if (spec && spec.returnMeatPool) out.meatPool = meatPool;
  if (collectDebug) out.holeDebug = holeDebug;
  if (spec && (spec.settleVersion || spec.returnMeatPool || collectDebug)) {
    out.orderHistory = orderHistory;
    const totals = core.emptyLedger(core.playerIdsOf(game));
    Object.keys(byHole).forEach(function (label) {
      const led = byHole[label] || {};
      Object.keys(led).forEach(function (id) {
        if (id === core.POT_ID) return;
        addPts(totals, id, Number(led[id]) || 0);
      });
    });
    out.playerTotals = totals;
  }
  return out;
}

module.exports = {
  pickTeamBest,
  pickTeamWorst,
  applyBao,
  settleThree
};
