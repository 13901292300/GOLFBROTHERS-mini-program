/**
 * 结算共用：精度与零和账本。
 * 无捐锅时一洞所有参与者之和为 0；有捐锅时参与者 + 锅为 0。
 */
const POT_ID = "__pot__";

function round1(n) {
  const v = Number(n);
  if (!isFinite(v)) return 0;
  return Math.round(v * 10) / 10;
}

function formatPoints(n) {
  const v = round1(n);
  if (!v) return "0";
  const abs = Math.abs(v);
  const body = abs === Math.round(abs) ? String(abs) : abs.toFixed(1);
  return v > 0 ? "+" + body : "-" + body;
}

function formatMoney(n) {
  const v = round1(n);
  const body = Math.abs(v).toFixed(1);
  if (!v) return "0.0";
  return v > 0 ? "+" + body : "-" + body;
}

function catalogIdOf(game) {
  return String(
    (game && game.catalogId) ||
      (game && game.ruleSnapshot && game.ruleSnapshot.catalogId) ||
      (game && game.ruleId) ||
      ""
  );
}

function playerIdsOf(game) {
  return ((game && game.players) || [])
    .map(function (item) {
      return item && item.id != null ? String(item.id) : "";
    })
    .filter(Boolean);
}

function emptyLedger(ids) {
  const out = {};
  (ids || []).forEach(function (id) {
    out[id] = 0;
  });
  out[POT_ID] = 0;
  return out;
}

function holeLedger() {
  const out = {};
  out[POT_ID] = 0;
  return out;
}

function holeOn(game, label) {
  const holes = (game && game.holes) || [];
  if (!holes.length) return true;
  return holes.some(function (item) {
    const key = item && item.label != null ? item.label : item;
    return String(key) === String(label) && (!item || item.on !== false);
  });
}

function zeroSumOk(ledger, ids) {
  let sum = 0;
  (ids || []).forEach(function (id) {
    sum += Number(ledger[id]) || 0;
  });
  sum += Number(ledger[POT_ID]) || 0;
  return Math.abs(round1(sum)) < 0.05;
}

/** 每块肉的分值。「分值翻倍」= 本洞分值，不是本洞×2。 */
function meatPieceValue(rule, holePts, k, opts) {
  const kk = isFinite(Number(k)) ? Number(k) : 1;
  const hole = round1(holePts);
  if ((rule && rule.meatValueType) === "double") {
    let v = hole;
    if (rule.meatCap === "cap") {
      const cap = Number(rule.meatCapN);
      const max = isFinite(cap) ? round1(cap * kk) : v;
      if (v > max) v = max;
    }
    return v;
  }
  if (opts && opts.includeStyle) {
    if ((rule && rule.meatInclude) === "yes") return hole;
    return round1(kk);
  }
  const n = Number(rule && rule.meatValueN);
  return round1((isFinite(n) ? n : 2) * kk);
}

function lastOnLabel(game, holeOrder) {
  const labels = (holeOrder || []).filter(function (label) {
    return holeOn(game, label);
  });
  return labels.length ? String(labels[labels.length - 1]) : "";
}

/** 大风吹：最后一洞有胜者时吃掉全部余肉，不看成绩表。 */
function meatEatCount(wanted, pool, isLast, windOn) {
  const p = Number(pool) || 0;
  if (!(p > 0)) return 0;
  if (windOn && isLast) return p;
  const w = Number(wanted);
  if (!isFinite(w) || w <= 0) return 0;
  return w < p ? w : p;
}

function emptyResults(game, holeOrder) {
  const ids = playerIdsOf(game);
  const labels = holeOrder && holeOrder.length ? holeOrder : [];
  const byHole = {};
  labels.forEach(function (label) {
    byHole[label] = holeLedger();
  });
  return {
    byHole: byHole,
    initial: emptyLedger(ids),
    catalogId: catalogIdOf(game)
  };
}

module.exports = {
  POT_ID,
  round1,
  formatPoints,
  formatMoney,
  catalogIdOf,
  playerIdsOf,
  emptyLedger,
  holeLedger,
  holeOn,
  zeroSumOk,
  meatPieceValue,
  lastOnLabel,
  meatEatCount,
  emptyResults
};
