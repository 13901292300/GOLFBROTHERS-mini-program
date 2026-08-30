/**
 * 两人 8421（V53 §4.1.3）
 *
 * 各人按相对标准杆查成绩-得分映射（实例 scoreCode 或规则 scoreRows）。
 * 映射为 0 或 diff≥+4 时走扣分。双方得分差 × 每分价值 = 本洞积分。无让杆。
 * 顶洞：打平则本洞 0 并攒肉；得分≤N 则得分照算并攒肉。
 * 吃肉：按胜者成绩查表，或一次全吃连续翻倍。
 * 「分值翻倍」：每块肉 = 本洞分值（不是本洞×2）。
 */
const core = require("./settleCore.js");

const MAP_DEFAULTS = { hio: 32, m2: 16, m1: 8, par: 4, p1: 2, p2: 1, p3: 0 };
const MEAT_DEFAULTS = { "le-2": 1, m1: 1, par: 1, p1: 1, "ge-2": 1 };

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

function pointValue(game) {
  const raw = game && game.multiplier;
  if (raw == null || raw === "") return 1;
  const n = Number(raw);
  return isFinite(n) ? n : 1;
}

function playerOf(game, id) {
  return (
    ((game && game.players) || []).find(function (item) {
      return String(item.id) === String(id);
    }) || {}
  );
}

function expandScoreCode(code) {
  const digits = String(code || "")
    .replace(/\D/g, "")
    .split("")
    .map(function (ch) {
      return Number(ch);
    })
    .filter(function (n) {
      return isFinite(n);
    });
  if (!digits.length) return null;
  const m1 = digits[0];
  return {
    hio: m1 * 4,
    m2: m1 * 2,
    m1: m1,
    par: digits[1] != null ? digits[1] : 0,
    p1: digits[2] != null ? digits[2] : 0,
    p2: digits[3] != null ? digits[3] : 0,
    p3: digits[4] != null ? digits[4] : 0
  };
}

function fromScoreRows(rows) {
  const map = rowMap(rows);
  const out = {};
  Object.keys(MAP_DEFAULTS).forEach(function (key) {
    out[key] = map[key] != null ? map[key] : MAP_DEFAULTS[key];
  });
  return out;
}

function scoreMapFor(player, rule) {
  const code = String((player && player.scoreCode) || (rule && rule.scoreCode) || "8421");
  const defCode = String((rule && rule.scoreCode) || "8421");
  if (code === defCode && rule && rule.scoreRows && rule.scoreRows.length) {
    return fromScoreRows(rule.scoreRows);
  }
  return expandScoreCode(code) || fromScoreRows(rule && rule.scoreRows);
}

function deductCfg(player, rule) {
  const src =
    player && (player.deductMode != null || player.deductWay != null) ? player : rule || {};
  return {
    deductMode: src.deductMode === "none" ? "none" : "on",
    deductWay: src.deductWay === "doublepar-n" ? "doublepar-n" : "plus-n",
    deductPlusN: src.deductPlusN != null && src.deductPlusN !== "" ? Number(src.deductPlusN) : 4,
    deductDoubleN:
      src.deductDoubleN != null && src.deductDoubleN !== "" ? Number(src.deductDoubleN) : 0,
    deductCap: src.deductCap === "cap" ? "cap" : "none",
    deductCapN: src.deductCapN != null && src.deductCapN !== "" ? Number(src.deductCapN) : 3
  };
}

function deductScore(diff, deduct, par) {
  if (!deduct || deduct.deductMode === "none") return 0;
  const start =
    deduct.deductWay === "doublepar-n" ? par + (Number(deduct.deductDoubleN) || 0) : Number(deduct.deductPlusN);
  const from = isFinite(start) ? start : 4;
  if (diff < from) return 0;
  let n = diff - from + 1;
  if (deduct.deductCap === "cap") {
    const cap = Number(deduct.deductCapN);
    const max = isFinite(cap) && cap > 0 ? cap : 3;
    if (n > max) n = max;
  }
  return -n;
}

function mappedAt(diff, map) {
  if (diff <= -3) return map.hio;
  if (diff === -2) return map.m2;
  if (diff === -1) return map.m1;
  if (diff === 0) return map.par;
  if (diff === 1) return map.p1;
  if (diff === 2) return map.p2;
  if (diff === 3) return map.p3;
  return null;
}

function personalScore(diff, map, deduct, par) {
  if (diff <= 3) {
    const raw = Number(mappedAt(diff, map));
    if (isFinite(raw) && raw > 0) return raw;
    return deductScore(diff, deduct, par);
  }
  return deductScore(diff, deduct, par);
}

function meatBand(diff) {
  const n = Number(diff);
  if (n <= -2) return "le-2";
  if (n === -1) return "m1";
  if (n === 0) return "par";
  if (n === 1) return "p1";
  return "ge-2";
}

function meatWanted(rule, winnerRel, pool) {
  const map = rowMap(rule && rule.meatRows);
  const band = meatBand(winnerRel);
  const raw = map[band] != null ? map[band] : MEAT_DEFAULTS[band];
  if (raw === "全部" || String(raw).toLowerCase() === "all") return Math.min(3, pool);
  const n = Number(raw);
  return isFinite(n) && n > 0 ? n : 0;
}

function pushKind(rule) {
  const p = (rule && rule.pushRule) || "tie";
  if (p === "none" || p === "skip") return p;
  if (p === "within-1") return "within-1";
  if (p === "within-2") return "within-2";
  if (p === "within-n") {
    const n = Number(rule.pushWithinN);
    return n === 2 ? "within-2" : "within-1";
  }
  return "tie";
}

function classifyPush(kind, spread) {
  if (kind === "none") return { push: false, zeroHole: false };
  if (kind === "skip") return { push: spread === 0, zeroHole: spread === 0, skipMeat: true };
  if (kind === "tie") return { push: spread === 0, zeroHole: spread === 0 };
  if (kind === "within-1") return { push: spread <= 1, zeroHole: spread === 0 };
  if (kind === "within-2") return { push: spread <= 2, zeroHole: spread === 0 };
  return { push: false, zeroHole: false };
}

function meatUnit(rule, holePts, k) {
  return core.meatPieceValue(rule, holePts, k);
}

function bumpPush(allDouble, comboMul, meatPool, key, skipMeat) {
  if (skipMeat) return;
  if (allDouble) comboMul[key] = (comboMul[key] || 1) * 2;
  else meatPool[key] = (meatPool[key] || 0) + 1;
}

function settle8421(game, ctx) {
  const holeOrder = (ctx && ctx.holeOrder) || [];
  const scores = (ctx && ctx.scores) || {};
  const rule = (game && game.ruleSnapshot) || {};
  const k = pointValue(game);
  const pairs = ((game && game.pairings) || []).filter(function (pair) {
    return pair && pair.leftId && pair.rightId && pair.on !== false;
  });
  const meatPool = {};
  const comboMul = {};
  pairs.forEach(function (pair, i) {
    meatPool[pair.id || i] = 0;
    comboMul[pair.id || i] = 1;
  });
  const kind = pushKind(rule);
  const allDouble = (rule && rule.meatEatMode) === "all-double";

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
        const leftP = playerOf(game, left);
        const rightP = playerOf(game, right);
        const leftScore = personalScore(
          leftRel,
          scoreMapFor(leftP, rule),
          deductCfg(leftP, rule),
          par
        );
        const rightScore = personalScore(
          rightRel,
          scoreMapFor(rightP, rule),
          deductCfg(rightP, rule),
          par
        );
        const spread = Math.abs(leftScore - rightScore);
        const flag = classifyPush(kind, spread);
        const skipMeat = !!flag.skipMeat;
        const mult = allDouble ? comboMul[key] || 1 : 1;

        if (spread === 0) {
          addPts(ledger, left, 0);
          addPts(ledger, right, 0);
          if (flag.push) bumpPush(allDouble, comboMul, meatPool, key, skipMeat);
          return;
        }

        const leftWins = leftScore > rightScore;
        const winner = leftWins ? left : right;
        const loser = leftWins ? right : left;
        const winnerRel = leftWins ? leftRel : rightRel;
        const holePts = core.round1(spread * k * mult);
        addPts(ledger, winner, holePts);
        addPts(ledger, loser, -holePts);

        if (flag.push) {
          bumpPush(allDouble, comboMul, meatPool, key, skipMeat);
          if (!(windOn && isLast && !allDouble && spread !== 0)) return;
        }

        if (allDouble) {
          comboMul[key] = 1;
          return;
        }

        const pool = meatPool[key] || 0;
        if (pool > 0) {
          const eat = core.meatEatCount(meatWanted(rule, winnerRel, pool), pool, isLast, windOn);
          if (eat > 0) {
            const meatPts = core.round1(eat * meatUnit(rule, holePts, k));
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
    initial: core.emptyLedger(core.playerIdsOf(game)),
    catalogId: "8421-2"
  };
}

module.exports = {
  settle: settle8421,
  personalScore,
  expandScoreCode,
  scoreMapFor,
  deductCfg,
  meatWanted,
  meatUnit,
  classifyPush,
  pushKind,
  holePar,
  pointValue,
  playerOf,
  readRel
};
