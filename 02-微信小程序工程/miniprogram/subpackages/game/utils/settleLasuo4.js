/**
 * 四人拉丝（V53 §4.3.1）
 *
 * 每洞比两队较好 / 较差 / 总成绩（可多选、各有权重；总成绩可和或积）。
 * 每项胜 +1、负 −1、平 0，乘权重后求和为本洞团队点，再 ×K。
 * 固拉：前两人对后两人（与配置队线一致）。乱拉/高手不见面：1+4 对 2+3。
 * 分值翻倍：每块肉 = 本洞分值（不含奖励用比较点，含奖励用加奖后）。
 */
const core = require("./settleCore.js");
const stroke = require("./settleStroke2.js");

const ADD_DEFAULTS = { hio: 10, m2: 4, m1: 1, par: 0, p1: 0, ge2: 0 };
const MUL_DEFAULTS = { hio: 10, m2: 5, m1: 2, par: 1, p1: 1, ge2: 1 };
const MEAT_DEFAULTS = { "le-2": 3, m1: 2, par: 1, "ge-1": 0 };
const COMBO_DEFAULTS = { "m2-m2": 25, "m2-m1": 10, "m1-m1": 4 };

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

function weightOf(rule, onKey, wKey) {
  if (rule && rule[onKey] === false) return 0;
  const n = Number(rule && rule[wKey]);
  return isFinite(n) && n > 0 ? n : 1;
}

function cmpVal(a, b) {
  if (a < b) return 1;
  if (a > b) return -1;
  return 0;
}

function teamBest(rec, team) {
  return Math.min(rec[team[0]].net, rec[team[1]].net);
}

function teamWorst(rec, team) {
  return Math.max(rec[team[0]].net, rec[team[1]].net);
}

function netStrokes(rec, id, par) {
  return par + rec[id].net;
}

function teamTotal(rec, team, par, product) {
  const x = netStrokes(rec, team[0], par);
  const y = netStrokes(rec, team[1], par);
  return product ? x * y : x + y;
}

function rawCompare(rule, rec, aTeam, bTeam, par) {
  let pts = 0;
  const bw = weightOf(rule, "pkBetter", "pkBetterW");
  if (bw) pts += bw * cmpVal(teamBest(rec, aTeam), teamBest(rec, bTeam));
  const ww = weightOf(rule, "pkWorse", "pkWorseW");
  if (ww) pts += ww * cmpVal(teamWorst(rec, aTeam), teamWorst(rec, bTeam));
  const tw = weightOf(rule, "pkTotal", "pkTotalW");
  if (tw) {
    const product = (rule && rule.pkTotalMode) === "product";
    pts += tw * cmpVal(teamTotal(rec, aTeam, par, product), teamTotal(rec, bTeam, par, product));
  }
  return pts;
}

function addValueOf(rel, rule) {
  const n = lookup(rowMap(rule && rule.addRows), stroke.scoreBand(rel), ADD_DEFAULTS);
  return isFinite(n) ? n : 0;
}

function pickSlotPlayer(rec, team, worst) {
  let id = team[0];
  team.forEach(function (x) {
    if (worst) {
      if (rec[x].net > rec[id].net) id = x;
      else if (rec[x].net === rec[id].net && rec[x].rel > rec[id].rel) id = x;
    } else if (rec[x].net < rec[id].net) {
      id = x;
    } else if (rec[x].net === rec[id].net && rec[x].rel < rec[id].rel) {
      id = x;
    }
  });
  return id;
}

function totalSign(rawCmp) {
  if (rawCmp > 0) return 1;
  if (rawCmp < 0) return -1;
  return 0;
}

function addBonus(rule, rec, aTeam, bTeam, rawCmp, k) {
  if (((rule && rule.reward) || "none") !== "add") return 0;
  const pre = (rule && rule.addPre) || "win";
  let bonus = 0;
  const sides = [
    { team: aTeam, sign: 1 },
    { team: bTeam, sign: -1 }
  ];
  sides.forEach(function (side) {
    const tot = totalSign(rawCmp) * side.sign;
    const bw = weightOf(rule, "pkBetter", "pkBetterW");
    if (bw) {
      const add = addValueOf(rec[pickSlotPlayer(rec, side.team, false)].rel, rule);
      if (add > 0) bonus += add * bw * side.sign;
    }
    const ww = weightOf(rule, "pkWorse", "pkWorseW");
    if (ww) {
      const add = addValueOf(rec[pickSlotPlayer(rec, side.team, true)].rel, rule);
      if (add > 0) bonus += add * ww * side.sign;
    }
    const tw = weightOf(rule, "pkTotal", "pkTotalW");
    if (tw) {
      if (pre === "win" && tot <= 0) return;
      if (pre === "not-lose" && tot < 0) return;
      side.team.forEach(function (id) {
        const add = addValueOf(rec[id].rel, rule);
        if (add > 0) bonus += add * tw * side.sign;
      });
    }
  });
  return core.round1(bonus * k);
}

function comboKey(relA, relB) {
  const x = [relA, relB].sort(function (a, b) {
    return a - b;
  });
  if (x[0] <= -2 && x[1] <= -2) return "m2-m2";
  if (x[0] <= -2 && x[1] === -1) return "m2-m1";
  if (x[0] === -1 && x[1] === -1) return "m1-m1";
  return "";
}

function winMul(rule, rec, winTeam) {
  if (((rule && rule.reward) || "none") !== "mul") return 1;
  const person = rowMap(rule && rule.mulRows);
  let best = 1;
  winTeam.forEach(function (id) {
    const m = lookup(person, stroke.scoreBand(rec[id].rel), MUL_DEFAULTS);
    if (isFinite(m) && m > best) best = m;
  });
  const ck = comboKey(rec[winTeam[0]].rel, rec[winTeam[1]].rel);
  if (ck) {
    const combo = lookup(rowMap(rule && rule.comboMulRows), ck, COMBO_DEFAULTS);
    if (isFinite(combo) && combo > 1) return combo;
  }
  return best > 0 ? best : 1;
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

function classifyPush(rule, absPts) {
  const p = (rule && rule.pushRule) || "push";
  if (p === "none") return { push: false };
  if (p === "within-n") {
    const n = Number(rule && rule.pushWithinN);
    const cap = isFinite(n) && n > 0 ? n : 1;
    return { push: absPts <= cap };
  }
  return { push: absPts === 0 };
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
  const cmp = function (a, b) {
    return cmpPlayers(a, b, rec, hist, rankId);
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

function applySides(ledger, aTeam, bTeam, aPts) {
  addPts(ledger, aTeam[0], aPts);
  addPts(ledger, aTeam[1], aPts);
  addPts(ledger, bTeam[0], -aPts);
  addPts(ledger, bTeam[1], -aPts);
}

function oppBestNet(rec, team) {
  return Math.min(rec[team[0]].net, rec[team[1]].net);
}

function baoTriggered(playerRec, partnerRec, oppBest, par, rule) {
  const mode = (rule && rule.baoMode) || "none";
  if (mode === "none") return false;
  if ((rule && rule.baoPre) === "ahead" && !(partnerRec.net <= oppBest)) return false;
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

function applyBao(ledger, lose, rec, oppBest, par, rule, personPts) {
  if ((rule && rule.baoMode) === "none" || !rule || !rule.baoMode) return;
  if (!(personPts < 0)) return;
  const t0 = baoTriggered(rec[lose[0]], rec[lose[1]], oppBest, par, rule);
  const t1 = baoTriggered(rec[lose[1]], rec[lose[0]], oppBest, par, rule);
  if (t0 === t1) return;
  const cover = t0 ? lose[0] : lose[1];
  const other = t0 ? lose[1] : lose[0];
  addPts(ledger, cover, personPts);
  addPts(ledger, other, -personPts);
}

function pickBestRel(rec, team) {
  const a = team[0];
  const b = team[1];
  if (rec[a].net < rec[b].net) return rec[a].rel;
  if (rec[b].net < rec[a].net) return rec[b].rel;
  return rec[a].rel < rec[b].rel ? rec[a].rel : rec[b].rel;
}

function settleLasuo4(game, ctx) {
  const holeOrder = (ctx && ctx.holeOrder) || [];
  const scores = (ctx && ctx.scores) || {};
  const rule = (game && game.ruleSnapshot) || {};
  const k = pointValue(game);
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

    const sides = teamsOf(order, (game && game.groupMode) || "fixed");
    const aTeam = sides.aTeam;
    const bTeam = sides.bTeam;
    const rawCmp = rawCompare(rule, rec, aTeam, bTeam, par);
    let aPts = core.round1(rawCmp * k);
    const rawAbs = core.round1(Math.abs(aPts));
    aPts = core.round1(aPts + addBonus(rule, rec, aTeam, bTeam, rawCmp, k));
    const aWins = aPts > 0;
    const winTeam = aWins ? aTeam : bTeam;
    if (aPts !== 0) {
      const mul = winMul(rule, rec, winTeam);
      if (mul !== 1) aPts = core.round1(aPts * mul);
    }
    const rewardedAbs = core.round1(Math.abs(aPts));
    const flag = classifyPush(rule, rewardedAbs);
    const isPush = !!flag.push;

    if (aPts === 0) {
      order.forEach(function (id) {
        addPts(ledger, id, 0);
      });
      if (isPush) meatPool += 1;
    } else {
      applySides(ledger, aTeam, bTeam, aPts);
      if (aPts < 0) applyBao(ledger, aTeam, rec, oppBestNet(rec, bTeam), par, rule, aPts);
      else applyBao(ledger, bTeam, rec, oppBestNet(rec, aTeam), par, rule, -aPts);
      if (isPush) {
        meatPool += 1;
      }
      if (meatPool > 0) {
        const eat = core.meatEatCount(
          isPush ? 0 : meatWanted(rule, pickBestRel(rec, winTeam), meatPool),
          meatPool,
          isLast,
          windOn
        );
        if (eat > 0) {
          const holeForMeat =
            (rule && rule.meatInclude) === "yes" ? rewardedAbs : rawAbs;
          const piece = core.meatPieceValue(rule, holeForMeat, k);
          applySides(ledger, aTeam, bTeam, aWins ? core.round1(eat * piece) : core.round1(-eat * piece));
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
    catalogId: "lasuo-4"
  };
}

module.exports = {
  settle: settleLasuo4
};
