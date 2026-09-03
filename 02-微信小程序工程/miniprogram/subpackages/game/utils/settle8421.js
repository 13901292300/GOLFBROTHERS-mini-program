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
const scoreMapUtil = require("./sideGameScoreMap.js");

const SETTLE_8421_VERSION = scoreMapUtil.SETTLE_VERSION_2;
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
  return scoreMapUtil.expandScoreCode(code);
}

function fromScoreRows(rows) {
  return scoreMapUtil.mapFromLegacyRows(rows);
}

function unwrapRule(rule) {
  let snap = rule && typeof rule === "object" ? rule : {};
  let hops = 0;
  while (
    hops < 4 &&
    snap &&
    typeof snap === "object" &&
    !scoreMapUtil.hasExplicitRows(snap.scoreRows) &&
    snap.reward == null &&
    snap.ruleSnapshot &&
    typeof snap.ruleSnapshot === "object"
  ) {
    snap = snap.ruleSnapshot;
    hops += 1;
  }
  return snap || {};
}

function scoreMapFor(player, rule, game) {
  return scoreMapUtil.resolveScoreMap(game || {}, player || {}, unwrapRule(rule));
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
  return scoreMapUtil.mappedAt(diff, map);
}

function personalScore(diff, map, deduct, par) {
  if (diff <= 3) {
    const raw = mappedAt(diff, map);
    if (raw != null && raw > 0) return raw;
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
  const rule = unwrapRule((game && game.ruleSnapshot) || {});
  const k = pointValue(game);
  const pairs = ((game && game.pairings) || []).filter(function (pair) {
    return pair && pair.leftId && pair.rightId && pair.on !== false;
  });
  const meatPool = {};
  const comboMul = {};
  const topHoleTrackers = {};
  pairs.forEach(function (pair, i) {
    const key = pair.id || i;
    meatPool[key] = 0;
    comboMul[key] = 1;
    topHoleTrackers[key] = core.createTopHoleTracker();
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
          scoreMapFor(leftP, rule, game),
          deductCfg(leftP, rule),
          par
        );
        const rightScore = personalScore(
          rightRel,
          scoreMapFor(rightP, rule, game),
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
          if (flag.push) {
            bumpPush(allDouble, comboMul, meatPool, key, skipMeat);
            if (!skipMeat) core.enqueueTopHole(topHoleTrackers[key], label);
          }
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
          if (!skipMeat) core.enqueueTopHole(topHoleTrackers[key], label);
          if (!(windOn && isLast && !allDouble && spread !== 0)) return;
        }

        if (allDouble) {
          comboMul[key] = 1;
          core.consumeAllTopHoles(topHoleTrackers[key]);
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
            core.consumeTopHoles(topHoleTrackers[key], eat);
          }
        }
      });
    }
    byHole[label] = ledger;
  });

  const topHoleStates = {};
  pairs.forEach(function (pair, i) {
    const key = pair.id || i;
    core.mergeTopHoleStates(topHoleStates, topHoleTrackers[key].states);
  });

  return {
    byHole: byHole,
    initial: core.emptyLedger(core.playerIdsOf(game)),
    catalogId: "8421-2",
    settleVersion: SETTLE_8421_VERSION,
    topHoleStates: topHoleStates
  };
}

module.exports = {
  SETTLE_8421_VERSION,
  settle: settle8421,
  personalScore,
  expandScoreCode,
  scoreMapFor,
  fromScoreRows,
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
