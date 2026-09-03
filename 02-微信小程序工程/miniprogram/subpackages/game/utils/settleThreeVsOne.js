/**
 * 固定三打一（V53 §4.3.3）
 *
 * 排序第一名单人队 A，后三名三人队。比较 A 的调整后杆数与三人队最好/平均/最差，低者胜。
 * A 胜：A +3K，三人各 −K；三人胜反过来。分组固定。无包洞。
 * 乘法看胜队用于比较的成绩。肉不含奖励每块 3 点（3:1:1:1）；含奖励每块 = 本洞 3M 点。
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
  const count = rule && rule.meatCount;
  if (count != null && count !== "") {
    if (count === "全部" || String(count).toLowerCase() === "all") return Math.min(3, pool);
    const n = Number(count);
    return isFinite(n) && n > 0 ? n : 0;
  }
  const raw = lookup(rowMap(rule && rule.meatRows), meatBand(winnerRel), MEAT_DEFAULTS);
  if (raw === "全部" || String(raw).toLowerCase() === "all") return Math.min(3, pool);
  const n = Number(raw);
  if (isFinite(n)) return n > 0 ? n : 0;
  return Math.min(1, pool);
}

function winnerMul(rule, winRel) {
  if (((rule && rule.reward) || "none") !== "mul") return 1;
  const m = lookup(rowMap(rule && rule.mulRows), stroke.scoreBand(winRel), MUL_DEFAULTS);
  return isFinite(m) && m > 0 ? m : 1;
}

function teamNetOf(rec, mates, mode) {
  const n0 = rec[mates[0]].net;
  const n1 = rec[mates[1]].net;
  const n2 = rec[mates[2]].net;
  if (mode === "worst") return Math.max(n0, n1, n2);
  if (mode === "avg") return core.round1((n0 + n1 + n2) / 3);
  return Math.min(n0, n1, n2);
}

function winRelOf(rec, solo, mates, mode, soloWins) {
  if (soloWins) return rec[solo].rel;
  if (mode === "avg") return Math.round(teamNetOf(rec, mates, mode));
  let id = mates[0];
  mates.forEach(function (x) {
    if (mode === "worst") {
      if (rec[x].net > rec[id].net) id = x;
      else if (rec[x].net === rec[id].net && rec[x].rel > rec[id].rel) id = x;
    } else if (rec[x].net < rec[id].net) {
      id = x;
    } else if (rec[x].net === rec[id].net && rec[x].rel < rec[id].rel) {
      id = x;
    }
  });
  return rec[id].rel;
}

function applyTvo(ledger, solo, mates, soloWins, unit) {
  if (soloWins) {
    addPts(ledger, solo, 3 * unit);
    mates.forEach(function (id) {
      addPts(ledger, id, -unit);
    });
    return;
  }
  addPts(ledger, solo, -3 * unit);
  mates.forEach(function (id) {
    addPts(ledger, id, unit);
  });
}

function settleThreeVsOne(game, ctx) {
  const holeOrder = (ctx && ctx.holeOrder) || [];
  const scores = (ctx && ctx.scores) || {};
  const rule = (game && game.ruleSnapshot) || {};
  const k = pointValue(game);
  const mode = (rule && rule.tvoCompare) || "best";
  const topHoleTracker = core.createTopHoleTracker();
  let order = initialOrder(game);
  if (order.length < 4) {
    const empty = core.emptyResults(game, holeOrder);
    empty.topHoleStates = topHoleTracker.states;
    return empty;
  }
  order = order.slice(0, 4);
  let meatPool = 0;
  const byHole = {};
  const orderByHole = {};
  const lastLabel = core.lastOnLabel(game, holeOrder);
  const windOn = !!(ctx && ctx.windOn);

  holeOrder.forEach(function (label) {
    const ledger = core.holeLedger();
    const isLast = String(label) === lastLabel;
    if (!core.holeOn(game, label)) {
      byHole[label] = ledger;
      return;
    }
    orderByHole[label] = order.slice();
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
      rec[id] = { rel: rel, net: rel - n };
    });
    if (!ready) {
      byHole[label] = ledger;
      return;
    }

    const solo = order[0];
    const mates = order.slice(1, 4);
    const soloNet = rec[solo].net;
    const teamNet = teamNetOf(rec, mates, mode);
    const tied = soloNet === teamNet;
    const pushOn = (rule && rule.pushRule) !== "none";

    if (tied) {
      order.forEach(function (id) {
        addPts(ledger, id, 0);
      });
      if (pushOn) {
        meatPool += 1;
        core.enqueueTopHole(topHoleTracker, label);
      }
    } else {
      const soloWins = soloNet < teamNet;
      const winRel = winRelOf(rec, solo, mates, mode, soloWins);
      const mul = winnerMul(rule, winRel);
      const unit = core.round1(k * mul);
      applyTvo(ledger, solo, mates, soloWins, unit);
      if (meatPool > 0) {
        const eat = core.meatEatCount(meatWanted(rule, winRel, meatPool), meatPool, isLast, windOn);
        if (eat > 0) {
          const meatUnit =
            (rule && rule.meatInclude) === "yes" ? unit : core.round1(k);
          applyTvo(ledger, solo, mates, soloWins, core.round1(eat * meatUnit));
          core.consumeTopHoles(topHoleTracker, eat);
          meatPool -= eat;
        }
      }
    }
    byHole[label] = ledger;
  });

  return {
    byHole: byHole,
    orderByHole: orderByHole,
    initial: core.emptyLedger(core.playerIdsOf(game)),
    catalogId: "three-vs-one",
    topHoleStates: topHoleTracker.states
  };
}

module.exports = {
  settle: settleThreeVsOne
};
