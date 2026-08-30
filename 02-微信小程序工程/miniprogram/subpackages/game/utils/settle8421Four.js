/**
 * 四人 8421（V53 §4.3.2）
 *
 * 固拉：第 1、2 名对第 3、4 名（与配置页队线一致）。乱拉/高手不见面：第 1、4 名对第 2、3 名。
 * 比较两队映射得分之和，高者胜。
 * D = |A和 − B和|。胜队每人 +D·K，负队每人 −D·K。无让杆。
 * 顶洞不换组合。乱拉按排序规则重排；高手不见面只在高手区/低手区内重排后再交叉组队。
 * 包负分仅一队内恰好一人映射分为负时。分值翻倍：每块肉 = 本洞分值 D·K。
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

function byPoints(rankId) {
  return String(rankId || "").indexOf("points") === 0;
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
  if (byPoints(rankId)) {
    const d = rec[b].score - rec[a].score;
    if (d) return d;
    if (resultTie(rankId)) {
      const pts = rec[b].pts - rec[a].pts;
      if (pts) return pts;
      return walkHistory(hist, a, b, "pts", -1);
    }
    return walkHistory(hist, a, b, "score", -1);
  }
  const stroke = rec[a].rel - rec[b].rel;
  if (stroke) return stroke;
  if (resultTie(rankId)) {
    const pts = rec[b].pts - rec[a].pts;
    if (pts) return pts;
    return walkHistory(hist, a, b, "pts", -1);
  }
  return walkHistory(hist, a, b, "rel", 1);
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
  const cmp = function (a, b) {
    return cmpPlayers(a, b, rec, hist, rankId);
  };
  if (mode === "split-high" && order.length >= 4) {
    return stableSort(order.slice(0, 2), cmp).concat(stableSort(order.slice(2, 4), cmp));
  }
  return stableSort(order, cmp);
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

function applySides(ledger, win, lose, unit) {
  addPts(ledger, win[0], unit);
  addPts(ledger, win[1], unit);
  addPts(ledger, lose[0], -unit);
  addPts(ledger, lose[1], -unit);
}

function oppBest(ids, rec) {
  let best = rec[ids[0]].score;
  ids.forEach(function (id) {
    if (rec[id].score > best) best = rec[id].score;
  });
  return best;
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

function applyBaoNegTeam(ledger, team, opp, rec, rule) {
  const mode = (rule && rule.baoNeg) || "none";
  if (mode === "none") return;
  const n0 = rec[team[0]].score < 0;
  const n1 = rec[team[1]].score < 0;
  if (n0 === n1) return;
  const cover = n0 ? team[0] : team[1];
  const other = n0 ? team[1] : team[0];
  if (mode === "ahead" && !(rec[other].score >= oppBest(opp, rec))) return;
  const p = Math.abs(rec[cover].score);
  addPts(ledger, cover, -p);
  addPts(ledger, other, p);
}

function settle8421Four(game, ctx) {
  const holeOrder = (ctx && ctx.holeOrder) || [];
  const scores = (ctx && ctx.scores) || {};
  const rule = (game && game.ruleSnapshot) || {};
  const k = s8421.pointValue(game);
  let order = initialOrder(game);
  if (order.length < 4) return core.emptyResults(game, holeOrder);
  order = order.slice(0, 4);
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

    const sides = teamsOf(order, (game && game.groupMode) || "fixed");
    const aTeam = sides.aTeam;
    const bTeam = sides.bTeam;
    const aSum = rec[aTeam[0]].score + rec[aTeam[1]].score;
    const bSum = rec[bTeam[0]].score + rec[bTeam[1]].score;
    const d = Math.abs(aSum - bSum);
    const flag = s8421.classifyPush(kind, d);
    const skipMeat = !!flag.skipMeat;
    const aWins = aSum > bSum;
    const isPush = !!flag.push;
    const mult = allDouble ? comboMul : 1;
    const unit = core.round1(d * k * mult);

    if (d === 0) {
      order.forEach(function (id) {
        addPts(ledger, id, 0);
      });
      if (isPush && !skipMeat) {
        if (allDouble) comboMul = comboMul * 2;
        else meatPool += 1;
      }
    } else {
      const win = aWins ? aTeam : bTeam;
      const lose = aWins ? bTeam : aTeam;
      applySides(ledger, win, lose, unit);
      applyBaoNegTeam(ledger, aTeam, bTeam, rec, rule);
      applyBaoNegTeam(ledger, bTeam, aTeam, rec, rule);
      if (isPush) {
        if (!skipMeat) {
          if (allDouble) comboMul = comboMul * 2;
          else meatPool += 1;
        }
        if (!(windOn && isLast && !allDouble)) {
          /* 顶洞攒肉，非大风吹不吃 */
        } else if (meatPool > 0) {
          const best = pickBestOnTeam(win, rec);
          const eat = core.meatEatCount(0, meatPool, isLast, windOn);
          if (eat > 0) {
            const meatPts = core.round1(eat * s8421.meatUnit(rule, unit, k));
            applySides(ledger, win, lose, meatPts);
            meatPool -= eat;
          }
        }
      } else if (allDouble) {
        comboMul = 1;
      } else if (meatPool > 0) {
        const best = pickBestOnTeam(win, rec);
        const eat = core.meatEatCount(s8421.meatWanted(rule, rec[best].rel, meatPool), meatPool, isLast, windOn);
        if (eat > 0) {
          const meatPts = core.round1(eat * s8421.meatUnit(rule, unit, k));
          applySides(ledger, win, lose, meatPts);
          meatPool -= eat;
        }
      }
    }

    order.forEach(function (id) {
      rec[id].pts = Number(ledger[id]) || 0;
    });
    hist.push(rec);
    order = nextOrder(order, rec, hist, game, isPush);
    rankedNext = true;
    byHole[label] = ledger;
  });

  return {
    byHole: byHole,
    orderByHole: orderByHole,
    initial: core.emptyLedger(core.playerIdsOf(game)),
    catalogId: "8421-4"
  };
}

module.exports = {
  settle: settle8421Four
};
