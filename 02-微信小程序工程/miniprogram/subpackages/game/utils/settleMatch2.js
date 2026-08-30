/**
 * 两人比洞（V53 §4.1.2）
 *
 * 比较调整后杆数（实际杆数 − 逐洞让杆）。胜洞差固定为 1（不是杆差）。
 * N>0：前者让后者，后者杆数 − N；N<0：后者让前者，前者杆数 − |N|。
 * 每洞积分 = 胜洞差 × 倍数 × 每洞分值。乘法奖励只看胜者相对标准杆。
 * 顶洞（默认：调整后打平）：本洞 0，该对累积 1 块肉。
 * 非顶洞且有肉：按胜者成绩查表吃 min(表, 存量)，余肉留下。
 * 肉不含奖励：每块 = 1×K；肉含奖励 / 「分值翻倍」：每块 = 本洞分值（不是本洞×2）。
 * 每对独立攒肉；对决始终零和。
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

function pairHcapN(pair, label, par) {
  const list = (pair && pair.hcapList) || [];
  for (let i = 0; i < list.length; i++) {
    const cfg = list[i];
    if (!holeInHcap(cfg, label)) continue;
    return nByPar(cfg, par);
  }
  const s = Number(pair && pair.strokes);
  return isFinite(s) ? s : 0;
}

function netRel(rel, n, isLeft) {
  if (!n) return rel;
  if (n > 0) return isLeft ? rel : rel - n;
  return isLeft ? rel - Math.abs(n) : rel;
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

function meatWanted(rule, winnerRel) {
  const raw = lookup(rowMap(rule && rule.meatRows), meatBand(winnerRel), MEAT_DEFAULTS);
  const n = Number(raw);
  if (!isFinite(n) || n < 0) return 0;
  return n;
}

function pushEnabled(rule) {
  return (rule && rule.pushRule) !== "none";
}

function settleMatch2(game, ctx) {
  const ids = core.playerIdsOf(game);
  const holeOrder = (ctx && ctx.holeOrder) || [];
  const scores = (ctx && ctx.scores) || {};
  const rule = (game && game.ruleSnapshot) || {};
  const k = pointValue(game);
  const pairs = ((game && game.pairings) || []).filter(function (pair) {
    return pair && pair.leftId && pair.rightId && pair.on !== false;
  });
  const meatPool = {};
  pairs.forEach(function (pair, i) {
    meatPool[pair.id || i] = 0;
  });
  const lastLabel = core.lastOnLabel(game, holeOrder);
  const windOn = !!(ctx && ctx.windOn);

  const byHole = {};
  holeOrder.forEach(function (label) {
    const ledger = core.holeLedger();
    const isLast = String(label) === lastLabel;
    if (core.holeOn(game, label)) {
      const par = holePar(ctx, label);
      pairs.forEach(function (pair, i) {
        const key = pair.id || i;
        const left = String(pair.leftId);
        const right = String(pair.rightId);
        const leftRel = readRel(scores, label, left);
        const rightRel = readRel(scores, label, right);
        if (leftRel == null || rightRel == null) return;
        const n = pairHcapN(pair, label, par);
        const leftNet = netRel(leftRel, n, true);
        const rightNet = netRel(rightRel, n, false);
        if (leftNet === rightNet) {
          if (pushEnabled(rule)) meatPool[key] += 1;
          addPts(ledger, left, 0);
          addPts(ledger, right, 0);
          return;
        }
        const leftWins = leftNet < rightNet;
        const winnerRel = leftWins ? leftRel : rightRel;
        const mul = winnerMul(rule, winnerRel);
        const holePts = core.round1(1 * mul * k);
        const winner = leftWins ? left : right;
        const loser = leftWins ? right : left;
        addPts(ledger, winner, holePts);
        addPts(ledger, loser, -holePts);
        const pool = meatPool[key] || 0;
        if (pool > 0) {
          const eat = core.meatEatCount(meatWanted(rule, winnerRel), pool, isLast, windOn);
          if (eat > 0) {
            const unit = core.meatPieceValue(rule, holePts, k, { includeStyle: true });
            const meatPts = core.round1(eat * unit);
            addPts(ledger, winner, meatPts);
            addPts(ledger, loser, -meatPts);
            meatPool[key] = pool - eat;
          }
        }
      });
    }
    byHole[label] = ledger;
  });

  return {
    byHole: byHole,
    initial: core.emptyLedger(ids),
    catalogId: "match-2"
  };
}

module.exports = {
  settle: settleMatch2,
  pairHcapN,
  netRel
};
