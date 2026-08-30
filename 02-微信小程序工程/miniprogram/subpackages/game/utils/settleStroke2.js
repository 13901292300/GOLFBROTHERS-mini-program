/**
 * 两人比杆（V53 §4.1.1）
 *
 * 每洞比较真实杆数（沙盒记分为相对标准杆，杆差 = 相对杆差）。
 * 让杆为总杆让杆：只进入初始分，不改逐洞杆数。
 *   N>0 前者让后者：前者初始 -N×K，后者 +N×K
 *   N<0 后者让前者：后者初始 -|N|×K，前者 +|N|×K
 * 累计 = 初始分 + 各洞损益。
 * 奖励只作用在胜者成绩上，用来调整杆差（加法加在杆差上，乘法乘杆差）。
 * 每对对决零和，多对叠加后整局仍零和。
 */
const core = require("./settleCore.js");

const ADD_DEFAULTS = { hio: 10, m2: 4, m1: 1, par: 0, p1: 0, ge2: 0 };
const MUL_DEFAULTS = { hio: 10, m2: 5, m1: 2, par: 1, p1: 1, ge2: 1 };

function scoreBand(diff) {
  const n = Number(diff);
  if (!isFinite(n)) return "par";
  if (n <= -3) return "hio";
  if (n === -2) return "m2";
  if (n === -1) return "m1";
  if (n === 0) return "par";
  if (n === 1) return "p1";
  return "ge2";
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

function pairStrokeN(pair) {
  const n = Number(pair && pair.strokes);
  if (!isFinite(n)) return 0;
  return Math.round(n);
}

function addPts(ledger, id, n) {
  ledger[id] = core.round1((Number(ledger[id]) || 0) + n);
}

function applyReward(rawDiff, winnerRel, rule) {
  const mode = (rule && rule.reward) || "none";
  if (!(rawDiff > 0) || mode === "none") return rawDiff;
  const band = scoreBand(winnerRel);
  if (mode === "mul") {
    const mul = lookup(rowMap(rule.mulRows), band, MUL_DEFAULTS);
    return rawDiff * (isFinite(mul) ? mul : 1);
  }
  if (mode === "add") {
    const add = lookup(rowMap(rule.addRows), band, ADD_DEFAULTS);
    return rawDiff + (isFinite(add) ? add : 0);
  }
  return rawDiff;
}

function readRel(scores, hole, playerId) {
  const holeCard = scores && scores[hole];
  if (!holeCard) return null;
  const v = holeCard[playerId];
  if (v == null || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function settleStroke2(game, ctx) {
  const ids = core.playerIdsOf(game);
  const holeOrder = (ctx && ctx.holeOrder) || [];
  const scores = (ctx && ctx.scores) || {};
  const rule = (game && game.ruleSnapshot) || {};
  const k = pointValue(game);
  const pairs = ((game && game.pairings) || []).filter(function (pair) {
    return pair && pair.leftId && pair.rightId && pair.on !== false;
  });

  const initial = core.emptyLedger(ids);
  pairs.forEach(function (pair) {
    const n = pairStrokeN(pair);
    if (!n) return;
    const amt = core.round1(Math.abs(n) * k);
    const left = String(pair.leftId);
    const right = String(pair.rightId);
    if (n > 0) {
      addPts(initial, left, -amt);
      addPts(initial, right, amt);
    } else {
      addPts(initial, left, amt);
      addPts(initial, right, -amt);
    }
  });

  const byHole = {};
  holeOrder.forEach(function (label) {
    const ledger = core.holeLedger();
    if (core.holeOn(game, label)) {
      pairs.forEach(function (pair) {
        const left = String(pair.leftId);
        const right = String(pair.rightId);
        const leftRel = readRel(scores, label, left);
        const rightRel = readRel(scores, label, right);
        if (leftRel == null || rightRel == null) return;
        const raw = rightRel - leftRel;
        if (!raw) {
          addPts(ledger, left, 0);
          addPts(ledger, right, 0);
          return;
        }
        if (raw > 0) {
          const pts = core.round1(applyReward(raw, leftRel, rule) * k);
          addPts(ledger, left, pts);
          addPts(ledger, right, -pts);
        } else {
          const pts = core.round1(applyReward(-raw, rightRel, rule) * k);
          addPts(ledger, right, pts);
          addPts(ledger, left, -pts);
        }
      });
    }
    byHole[label] = ledger;
  });

  return {
    byHole: byHole,
    initial: initial,
    catalogId: "stroke-2"
  };
}

module.exports = {
  settle: settleStroke2,
  scoreBand,
  applyReward
};
