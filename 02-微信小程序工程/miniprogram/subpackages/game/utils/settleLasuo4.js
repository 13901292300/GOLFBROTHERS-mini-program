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
const assignmentNormalize = require("./assignmentNormalize.js");
const assignmentHoleSides = require("../../../utils/assignmentHoleSides.js");
const holeOrder = require("./resolveNextHoleOrder.js");
const catalog = require("./catalog.js");

const ADD_DEFAULTS = { hio: 10, m2: 4, m1: 1, par: 0, p1: 0, ge2: 0 };
const MUL_DEFAULTS = { hio: 10, m2: 5, m1: 2, par: 1, p1: 1, ge2: 1 };
const MEAT_DEFAULTS = { "le-2": 3, m1: 2, par: 1, "ge-1": 0 };
const COMBO_DEFAULTS = { "m2-m2": 25, "m2-m1": 10, "m1-m1": 4 };

function unwrapRule(raw) {
  var cur = raw && typeof raw === "object" ? raw : {};
  var hops = 0;
  while (
    hops < 4 &&
    cur &&
    typeof cur === "object" &&
    cur.reward == null &&
    !(Array.isArray(cur.addRows) && cur.addRows.length) &&
    !(Array.isArray(cur.mulRows) && cur.mulRows.length) &&
    cur.ruleSnapshot &&
    typeof cur.ruleSnapshot === "object"
  ) {
    cur = cur.ruleSnapshot;
    hops += 1;
  }
  return cur && typeof cur === "object" ? cur : {};
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

function indicatorParts(rule, rec, aTeam, bTeam, par) {
  const bw = weightOf(rule, "pkBetter", "pkBetterW");
  const ww = weightOf(rule, "pkWorse", "pkWorseW");
  const tw = weightOf(rule, "pkTotal", "pkTotalW");
  const better = bw ? bw * cmpVal(teamBest(rec, aTeam), teamBest(rec, bTeam)) : 0;
  const worse = ww ? ww * cmpVal(teamWorst(rec, aTeam), teamWorst(rec, bTeam)) : 0;
  let total = 0;
  if (tw) {
    const product = (rule && rule.pkTotalMode) === "product";
    total = tw * cmpVal(teamTotal(rec, aTeam, par, product), teamTotal(rec, bTeam, par, product));
  }
  return { better: better, worse: worse, total: total, sum: better + worse + total };
}

function rawCompare(rule, rec, aTeam, bTeam, par) {
  return indicatorParts(rule, rec, aTeam, bTeam, par).sum;
}

const SETTLE_LASUO4_VERSION = "v53-4.3.1";

function bandValue(rows, rel, defaults) {
  const band = stroke.scoreBand(rel);
  const map = rowMap(rows);
  if (map[band] != null) return map[band];
  const fb = defaults && defaults[band];
  return fb != null && isFinite(Number(fb)) ? Number(fb) : 0;
}

function addValueOf(rel, rule) {
  return bandValue(rule && rule.addRows, rel, ADD_DEFAULTS);
}

function weightedAddReward(rel, rule, weight) {
  const w = Number(weight);
  if (!isFinite(w) || w <= 0) return 0;
  return addValueOf(rel, rule) * w;
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

function rewardModeOf(rule) {
  const raw = rule && rule.reward;
  const s = String(raw == null ? "" : raw).trim().toLowerCase();
  if (s === "add" || s === "additive") return "add";
  if (s === "mul" || s === "multiply" || s === "multi") return "mul";
  if (s === "none" || s === "off") return "none";
  return "none";
}

function totalCmp(rule, rec, aTeam, bTeam, par) {
  if (!weightOf(rule, "pkTotal", "pkTotalW")) return 0;
  const product = (rule && rule.pkTotalMode) === "product";
  return cmpVal(teamTotal(rec, aTeam, par, product), teamTotal(rec, bTeam, par, product));
}

function addEligible(rule, totalSelected, teamTotalSign) {
  if (!totalSelected) return true;
  const pre = (rule && rule.addPre) || "win";
  if (pre === "ignore") return true;
  if (pre === "not-lose") return teamTotalSign >= 0;
  return teamTotalSign > 0;
}

function teamAddReward(rule, rec, team) {
  const bw = weightOf(rule, "pkBetter", "pkBetterW");
  const ww = weightOf(rule, "pkWorse", "pkWorseW");
  const tw = weightOf(rule, "pkTotal", "pkTotalW");
  const bestId = pickSlotPlayer(rec, team, false);
  const worstId = pickSlotPlayer(rec, team, true);
  let sum = 0;
  team.forEach(function (id) {
    const v = addValueOf(rec[id].rel, rule);
    if (!v) return;
    let w = 0;
    if (String(id) === String(bestId) && bw) w = bw;
    else if (String(id) === String(worstId) && ww) w = ww;
    else if (tw) w = tw;
    if (w) sum += v * w;
  });
  return sum;
}

function headTailPersonalAdds(rule, rec, team) {
  const bw = weightOf(rule, "pkBetter", "pkBetterW");
  const ww = weightOf(rule, "pkWorse", "pkWorseW");
  let bestId = pickSlotPlayer(rec, team, false);
  let worstId = pickSlotPlayer(rec, team, true);
  if (String(bestId) === String(worstId) && team[1] != null) {
    worstId = String(team[0]) === String(bestId) ? team[1] : team[0];
  }
  const personal = {};
  personal[bestId] = weightedAddReward(rec[bestId].rel, rule, bw);
  personal[worstId] = (personal[worstId] || 0) + weightedAddReward(rec[worstId].rel, rule, ww);
  return personal;
}

function addRewards(rule, rec, aTeam, bTeam, par) {
  if (rewardModeOf(rule) !== "add") return { a: 0, b: 0, personal: null };
  if (catalog.isLasuoHeadTailTwoPoint(rule)) {
    const personal = Object.assign(
      {},
      headTailPersonalAdds(rule, rec, aTeam),
      headTailPersonalAdds(rule, rec, bTeam)
    );
    return {
      a: personal[aTeam[0]] + personal[aTeam[1]],
      b: personal[bTeam[0]] + personal[bTeam[1]],
      personal: personal
    };
  }
  const totalW = weightOf(rule, "pkTotal", "pkTotalW");
  const tot = totalCmp(rule, rec, aTeam, bTeam, par);
  const signA = totalSign(tot);
  const aOn = addEligible(rule, !!totalW, signA);
  const bOn = addEligible(rule, !!totalW, -signA);
  return {
    a: aOn ? teamAddReward(rule, rec, aTeam) : 0,
    b: bOn ? teamAddReward(rule, rec, bTeam) : 0,
    personal: null
  };
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

function personalMulOf(rel, rule) {
  const band = stroke.scoreBand(rel);
  const map = rowMap(rule && rule.mulRows);
  if (map[band] != null) return map[band];
  const fb = MUL_DEFAULTS[band];
  return fb != null && isFinite(Number(fb)) ? Number(fb) : 1;
}

function resolveBestPersonalMultiplier(rule, rec, winTeam) {
  let best = null;
  winTeam.forEach(function (id) {
    const m = personalMulOf(rec[id].rel, rule);
    if (best == null || m > best) best = m;
  });
  if (best == null) return { m: 1, source: "default" };
  return { m: best, source: "personal" };
}

function resolveWorstPersonalMultiplier(rule, rec, winTeam) {
  const worstId = pickSlotPlayer(rec, winTeam, true);
  return { m: personalMulOf(rec[worstId].rel, rule), source: "worst" };
}

function resolveComboThenPersonalProduct(rule, rec, winTeam) {
  const idA = winTeam[0];
  const idB = winTeam[1];
  const ck = comboKey(rec[idA].rel, rec[idB].rel);
  const comboMap = rowMap(rule && rule.comboMulRows);
  if (ck && comboMap[ck] != null) {
    return { m: comboMap[ck], source: ck };
  }
  const m = personalMulOf(rec[idA].rel, rule) * personalMulOf(rec[idB].rel, rule);
  return { m: m, source: "personal-product" };
}

function resolveHeadTotalMultiplier(rule, rec, winTeam) {
  let best = null;
  winTeam.forEach(function (id) {
    const m = personalMulOf(rec[id].rel, rule);
    if (best == null || m > best) best = m;
  });
  if (best == null) return { m: 1, source: "default" };
  return { m: best, source: "head-total-max" };
}

function resolveMultiplier(rule, rec, winTeam) {
  if (rewardModeOf(rule) !== "mul") return { m: 1, source: "none" };
  if (rule && rule.pkBetter !== false && rule.pkWorse === false && rule.pkTotal !== false) {
    return resolveHeadTotalMultiplier(rule, rec, winTeam);
  }
  if (rule && rule.pkBetter !== false && rule.pkWorse === false && rule.pkTotal === false) {
    return resolveBestPersonalMultiplier(rule, rec, winTeam);
  }
  if (rule && rule.pkBetter === false && rule.pkWorse !== false && rule.pkTotal === false) {
    return resolveWorstPersonalMultiplier(rule, rec, winTeam);
  }
  if (rule && rule.pkBetter === false && rule.pkWorse === false && rule.pkTotal !== false) {
    return resolveComboThenPersonalProduct(rule, rec, winTeam);
  }
  if (rule && rule.pkBetter !== false && rule.pkWorse !== false && rule.pkTotal === false) {
    return resolveComboThenPersonalProduct(rule, rec, winTeam);
  }
  const ck = comboKey(rec[winTeam[0]].rel, rec[winTeam[1]].rel);
  const comboMap = rowMap(rule && rule.comboMulRows);
  if (ck && comboMap[ck] != null) {
    return { m: comboMap[ck], source: ck };
  }
  let best = null;
  winTeam.forEach(function (id) {
    const m = personalMulOf(rec[id].rel, rule);
    if (best == null || m > best) best = m;
  });
  if (best == null) return { m: 1, source: "default" };
  return { m: best, source: "personal" };
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

function nextOrder(order, rec, hist, game, isPush) {
  return holeOrder.resolveNextHoleOrder({
    currentOrder: order,
    holeScores: rec,
    rankingPolicy: holeOrder.rankingPolicyOf(game),
    rankingRule: { rankId: (game && game.rankId) || "gross-origin" },
    pushPolicy: "rerank",
    isPush: isPush === true,
    tieBreakContext: { history: hist }
  });
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
  const rule = unwrapRule((game && game.ruleSnapshot) || {});
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
  const assignmentsByHole = {};
  const holeDebug = {};
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
    if (!startMarked || rankedNext) {
      assignmentNormalize.stamp(
        orderByHole,
        assignmentsByHole,
        label,
        order,
        assignmentHoleSides.holeSidesFromOrder(game, order),
        game
      );
    }
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
    const parts = indicatorParts(rule, rec, aTeam, bTeam, par);
    const rawCmp = parts.sum;
    const mode = rewardModeOf(rule);
    const adds = addRewards(rule, rec, aTeam, bTeam, par);
    let rewardedPts = rawCmp;
    let mulInfo = { m: 1, source: "none" };
    let winTeam = aTeam;
    let winningTeam = "none";
    if (rawCmp > 0) {
      winningTeam = "A";
      winTeam = aTeam;
    } else if (rawCmp < 0) {
      winningTeam = "B";
      winTeam = bTeam;
    }
    if (mode === "add") {
      rewardedPts = rawCmp + adds.a - adds.b;
    } else if (mode === "mul") {
      if (rawCmp > 0) {
        mulInfo = resolveMultiplier(rule, rec, aTeam);
        rewardedPts = rawCmp * mulInfo.m;
      } else if (rawCmp < 0) {
        mulInfo = resolveMultiplier(rule, rec, bTeam);
        rewardedPts = rawCmp * mulInfo.m;
      } else {
        rewardedPts = 0;
        mulInfo = { m: 1, source: "tie" };
      }
    }
    const aPts = core.round1(rewardedPts * k);
    const normalPts = core.round1(rawCmp * k);
    const rawAbs = core.round1(Math.abs(normalPts));
    const rewardedAbs = core.round1(Math.abs(aPts));
    const aWins = aPts > 0;
    if (aPts > 0) winTeam = aTeam;
    else if (aPts < 0) winTeam = bTeam;
    const flag = classifyPush(rule, rewardedAbs);
    const isPush = !!flag.push;
    holeDebug[label] = {
      selectedIndicators: {
        better: weightOf(rule, "pkBetter", "pkBetterW") > 0,
        worse: weightOf(rule, "pkWorse", "pkWorseW") > 0,
        total: weightOf(rule, "pkTotal", "pkTotalW") > 0
      },
      indicatorWeights: {
        better: weightOf(rule, "pkBetter", "pkBetterW"),
        worse: weightOf(rule, "pkWorse", "pkWorseW"),
        total: weightOf(rule, "pkTotal", "pkTotalW")
      },
      indicatorResults: parts,
      baseTeamScore: rawCmp,
      rewardMode: mode,
      addRewardA: adds.a,
      addRewardB: adds.b,
      addByPlayer: adds.personal || null,
      winningTeam: winningTeam,
      multiplierSource: mulInfo.source,
      multiplier: mulInfo.m,
      rewardedTeamScore: rewardedPts,
      K: k,
      finalTeamScore: aPts,
      settleVersion: SETTLE_LASUO4_VERSION
    };

    if (aPts === 0) {
      order.forEach(function (id) {
        addPts(ledger, id, 0);
      });
      if (isPush) {
        meatPool += 1;
        core.enqueueTopHole(topHoleTracker, label);
      }
    } else {
      applySides(ledger, aTeam, bTeam, aPts);
      if (normalPts < 0) applyBao(ledger, aTeam, rec, oppBestNet(rec, bTeam), par, rule, normalPts);
      else if (normalPts > 0) applyBao(ledger, bTeam, rec, oppBestNet(rec, aTeam), par, rule, -normalPts);
      if (isPush) {
        meatPool += 1;
        core.enqueueTopHole(topHoleTracker, label);
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
          holeDebug[label].meatScore = core.round1(eat * piece);
          core.consumeTopHoles(topHoleTracker, eat);
        }
      }
    }

    const personalScores = {};
    order.forEach(function (id) {
      rec[id].pts = Number(ledger[id]) || 0;
      personalScores[id] = rec[id].pts;
    });
    holeDebug[label].personalScores = personalScores;
    hist.push(rec);
    order = nextOrder(order, rec, hist, game, isPush === true);
    rankedNext = true;
    byHole[label] = ledger;
  });

  return {
    byHole: byHole,
    orderByHole: orderByHole,
    assignmentsByHole: assignmentsByHole,
    initial: core.emptyLedger(core.playerIdsOf(game)),
    catalogId: "lasuo-4",
    settleVersion: SETTLE_LASUO4_VERSION,
    topHoleStates: topHoleTracker.states,
    holeDebug: holeDebug
  };
}

module.exports = {
  settle: settleLasuo4,
  SETTLE_LASUO4_VERSION: SETTLE_LASUO4_VERSION
};
