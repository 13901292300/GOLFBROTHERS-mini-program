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

function scoresToRelative(absByHole, pars, holeOrder) {
  const out = {};
  (holeOrder || []).forEach(function (label) {
    const n = Number(pars && pars[label]);
    const par = n === 3 || n === 4 || n === 5 ? n : 4;
    const src = (absByHole && absByHole[label]) || {};
    const hole = {};
    Object.keys(src).forEach(function (pid) {
      const raw = src[pid];
      if (raw == null || raw === "") return;
      const v = Number(raw);
      if (!isFinite(v) || !(v > 0)) return;
      hole[pid] = v - par;
    });
    out[label] = hole;
  });
  return out;
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

function firstOnLabel(game, holeOrder) {
  const labels = holeOrder || [];
  let i;
  for (i = 0; i < labels.length; i++) {
    if (holeOn(game, labels[i])) return String(labels[i]);
  }
  return "";
}

function initialPlayerOrder(game) {
  const fromOrder = ((game && game.playerOrder) || [])
    .map(function (id) {
      return id == null ? "" : String(id);
    })
    .filter(Boolean);
  if (fromOrder.length) return fromOrder;
  return playerIdsOf(game);
}

function holePlayersReady(scores, label, ids) {
  const hole = (scores && scores[label]) || {};
  const list = ids || [];
  if (!list.length) return false;
  return list.every(function (id) {
    const v = hole[id];
    if (v == null || v === "") return false;
    return isFinite(Number(v));
  });
}

/** 新起始洞未完成：只保留起始洞初始分边，不写逐洞/合计分数。 */
function pendingStartResults(game, holeOrder) {
  const labels = holeOrder && holeOrder.length ? holeOrder : [];
  const start = firstOnLabel(game, labels);
  const byHole = {};
  labels.forEach(function (label) {
    byHole[label] = holeLedger();
  });
  const orderByHole = {};
  if (start) orderByHole[start] = initialPlayerOrder(game);
  return {
    byHole: byHole,
    initial: {},
    catalogId: catalogIdOf(game),
    orderByHole: orderByHole,
    assignmentsByHole: {},
    pendingStart: true
  };
}

function createTopHoleTracker() {
  return { queue: [], states: {} };
}

function enqueueTopHole(tracker, holeId) {
  if (!tracker || holeId == null || holeId === "") return "";
  const id = String(holeId);
  tracker.queue.push(id);
  tracker.states[id] = "pending";
  return id;
}

function consumeTopHoles(tracker, count) {
  if (!tracker) return [];
  let n = Math.max(0, Math.floor(Number(count) || 0));
  const consumed = [];
  while (n > 0 && tracker.queue.length) {
    const id = tracker.queue.shift();
    tracker.states[id] = "consumed";
    consumed.push(id);
    n -= 1;
  }
  return consumed;
}

function consumeAllTopHoles(tracker) {
  return consumeTopHoles(tracker, tracker && tracker.queue ? tracker.queue.length : 0);
}

function mergeTopHoleStates(target, source) {
  const out = target || {};
  Object.keys(source || {}).forEach(function (holeId) {
    const next = source[holeId];
    if (next === "pending" || (next === "consumed" && out[holeId] !== "pending")) {
      out[holeId] = next;
    }
  });
  return out;
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
    catalogId: catalogIdOf(game),
    orderByHole: {},
    assignmentsByHole: {}
  };
}

module.exports = {
  POT_ID,
  round1,
  formatPoints,
  formatMoney,
  scoresToRelative,
  catalogIdOf,
  playerIdsOf,
  emptyLedger,
  holeLedger,
  holeOn,
  zeroSumOk,
  meatPieceValue,
  lastOnLabel,
  firstOnLabel,
  holePlayersReady,
  pendingStartResults,
  createTopHoleTracker,
  enqueueTopHole,
  consumeTopHoles,
  consumeAllTopHoles,
  mergeTopHoleStates,
  meatEatCount,
  emptyResults
};
