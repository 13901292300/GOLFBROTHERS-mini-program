/**
 * 三人 8421（V53 §4.2.4）
 *
 * 第 1、3 名双人队，第 2 名单人队。比较（1+3）与（第 2 名 × 2），大者胜。
 * D = |队和 − 单人×2|。双人胜：各 +D·K，单人 −2D·K；单人胜反过来。无让杆。
 * 顶洞不换组合。乱斗按本洞映射得分从高到低排。包负分仅双人队、仅一人扣成负分时。
 * 「分值翻倍」：每块肉 = 本洞分值 D·K（不是×2）。
 */
const core = require("./settleCore.js");
const s8421 = require("./settle8421.js");

function addPts(ledger, id, n) {
  ledger[id] = core.round1((Number(ledger[id]) || 0) + n);
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

function cmpByScore(a, b, rec, hist, rankId) {
  const d = rec[b].score - rec[a].score;
  if (d) return d;
  if (resultTie(rankId)) {
    const pts = rec[b].pts - rec[a].pts;
    if (pts) return pts;
    return walkHistory(hist, a, b, "pts", -1);
  }
  return walkHistory(hist, a, b, "score", -1);
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
  const mode = (game && game.groupMode) || "fixed";
  if (mode === "fixed") return order.slice();
  if (isPush) return order.slice();
  const rankId = (game && game.rankId) || "gross-origin";
  return stableSort(order, function (a, b) {
    return cmpByScore(a, b, rec, hist, rankId);
  });
}

function mapScore(game, rule, id, rel, par) {
  const player = s8421.playerOf(game, id);
  return s8421.personalScore(rel, s8421.scoreMapFor(player, rule), s8421.deductCfg(player, rule), par);
}

function pickBestOnTeam(ids, rec) {
  let best = ids[0];
  ids.forEach(function (id) {
    if (rec[id].score > rec[best].score) best = id;
    else if (rec[id].score === rec[best].score && rec[id].rel < rec[best].rel) best = id;
  });
  return best;
}

function applyTeam(ledger, solo, mates, dualWins, unit) {
  if (dualWins) {
    addPts(ledger, mates[0], unit);
    addPts(ledger, mates[1], unit);
    addPts(ledger, solo, -2 * unit);
    return;
  }
  addPts(ledger, solo, 2 * unit);
  addPts(ledger, mates[0], -unit);
  addPts(ledger, mates[1], -unit);
}

function applyBaoNeg(ledger, solo, mates, rec, rule) {
  const mode = (rule && rule.baoNeg) || "none";
  if (mode === "none") return;
  const n0 = rec[mates[0]].score < 0;
  const n1 = rec[mates[1]].score < 0;
  if (n0 === n1) return;
  const cover = n0 ? mates[0] : mates[1];
  const other = n0 ? mates[1] : mates[0];
  if (mode === "ahead" && !(rec[other].score >= rec[solo].score)) return;
  const p = Math.abs(rec[cover].score);
  addPts(ledger, cover, -p);
  addPts(ledger, other, p);
}

function settle8421Three(game, ctx) {
  const holeOrder = (ctx && ctx.holeOrder) || [];
  const scores = (ctx && ctx.scores) || {};
  const rule = (game && game.ruleSnapshot) || {};
  const k = s8421.pointValue(game);
  let order = initialOrder(game);
  if (order.length < 3) return core.emptyResults(game, holeOrder);
  order = order.slice(0, 3);
  const kind = s8421.pushKind(rule);
  const allDouble = (rule && rule.meatEatMode) === "all-double";
  let meatPool = 0;
  let comboMul = 1;
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
    const par = s8421.holePar(ctx, label);
    const rec = {};
    let ready = true;
    order.forEach(function (id) {
      const rel = s8421.readRel(scores, label, id);
      if (rel == null) {
        ready = false;
        return;
      }
      rec[id] = { rel: rel, score: mapScore(game, rule, id, rel, par), pts: 0 };
    });
    if (!ready) {
      rankedNext = false;
      byHole[label] = ledger;
      return;
    }

    const solo = order[1];
    const mates = [order[0], order[2]];
    const teamSum = rec[mates[0]].score + rec[mates[1]].score;
    const soloTwice = rec[solo].score * 2;
    const d = Math.abs(teamSum - soloTwice);
    const flag = s8421.classifyPush(kind, d);
    const skipMeat = !!flag.skipMeat;
    const dualWins = teamSum > soloTwice;
    const isPush = !!flag.push;
    const mult = allDouble ? comboMul : 1;
    const unit = core.round1(d * k * mult);

    if (d === 0) {
      addPts(ledger, solo, 0);
      addPts(ledger, mates[0], 0);
      addPts(ledger, mates[1], 0);
      if (isPush && !skipMeat) {
        if (allDouble) comboMul = comboMul * 2;
        else meatPool += 1;
      }
    } else {
      applyTeam(ledger, solo, mates, dualWins, unit);
      if (!dualWins) applyBaoNeg(ledger, solo, mates, rec, rule);
      if (isPush) {
        if (!skipMeat) {
          if (allDouble) comboMul = comboMul * 2;
          else meatPool += 1;
        }
        if (windOn && isLast && !allDouble && meatPool > 0) {
          const winIds = dualWins ? mates : [solo];
          const best = pickBestOnTeam(winIds, rec);
          const eat = core.meatEatCount(0, meatPool, isLast, windOn);
          if (eat > 0) {
            const meatPts = core.round1(eat * s8421.meatUnit(rule, unit, k));
            applyTeam(ledger, solo, mates, dualWins, meatPts);
            meatPool -= eat;
          }
        }
      } else if (allDouble) {
        comboMul = 1;
      } else if (meatPool > 0) {
        const winIds = dualWins ? mates : [solo];
        const best = pickBestOnTeam(winIds, rec);
        const eat = core.meatEatCount(s8421.meatWanted(rule, rec[best].rel, meatPool), meatPool, isLast, windOn);
        if (eat > 0) {
          const meatPts = core.round1(eat * s8421.meatUnit(rule, unit, k));
          applyTeam(ledger, solo, mates, dualWins, meatPts);
          meatPool -= eat;
        }
      }
    }

    rec[solo].pts = Number(ledger[solo]) || 0;
    rec[mates[0]].pts = Number(ledger[mates[0]]) || 0;
    rec[mates[1]].pts = Number(ledger[mates[1]]) || 0;
    hist.push(rec);
    order = nextOrder(order, rec, hist, game, isPush);
    rankedNext = true;
    byHole[label] = ledger;
  });

  return {
    byHole: byHole,
    orderByHole: orderByHole,
    initial: core.emptyLedger(core.playerIdsOf(game)),
    catalogId: "8421-3"
  };
}

module.exports = {
  settle: settle8421Three
};
