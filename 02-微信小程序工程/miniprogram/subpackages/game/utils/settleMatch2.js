/**
 * 两人比洞（V53 §4.1.2，行 234–267）
 *
 * 胜负只比较 adjustedScore（实际杆数按让杆 N 调整，N 可为 0.5 / 负数）。
 * 胜洞差固定为 1。
 * 乘法奖励只看胜者真实成绩：performanceDiff = winnerActualScore − par。
 * 不得用调整后的 3.5 / 2.5 去套成绩档。
 */
const core = require("./settleCore.js");
const stroke = require("./settleStroke2.js");

const MATCH2_SETTLE_VERSION = "v53-4.1.2";

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

function adjustedActual(actual, n, isLeft) {
  const a = Number(actual);
  const h = Number(n) || 0;
  if (!h) return a;
  if (h > 0) return isLeft ? a : a - h;
  return isLeft ? a - Math.abs(h) : a;
}

function netRel(rel, n, isLeft) {
  return adjustedActual(rel, n, isLeft);
}

function winnerMul(rule, winnerRel) {
  return stroke.rewardMul(rule, winnerRel);
}

function match2MulState(rule) {
  const mode = rule && rule.reward;
  if (mode === "mul") return "mul";
  if (mode === "none") return "none";
  return "missing";
}

var SCORE_TYPE_BY_BAND = {
  hio: "albatross",
  m2: "eagle",
  m1: "birdie",
  par: "par",
  p1: "bogey",
  ge2: "doubleBogey"
};

function scoreTypeOf(rel) {
  return SCORE_TYPE_BY_BAND[stroke.scoreBand(rel)] || "par";
}

function emptyHoleResult() {
  return {
    outcome: null,
    scoreType: "par",
    baseValue: 0,
    multiplier: 1,
    multiplierKey: "par",
    winnerActualDiff: 0,
    adjustedLeft: null,
    adjustedRight: null,
    finalValue: 0,
    leftPts: 0,
    rightPts: 0,
    settleVersion: MATCH2_SETTLE_VERSION
  };
}

function calculateMatchPlayHoleResult(input) {
  input = input || {};
  const rule = input.ruleConfig || {};
  const k = pointValue({ multiplier: input.pointValue != null ? input.pointValue : 1 });
  const n = Number(input.handicapN);
  const hcap = isFinite(n) ? n : 0;
  const parRaw = Number(input.par);
  const par = parRaw === 3 || parRaw === 4 || parRaw === 5 ? parRaw : 4;
  let actualA;
  let actualB;
  if (input.playerActual != null && input.playerActual !== "" && input.opponentActual != null && input.opponentActual !== "") {
    actualA = Number(input.playerActual);
    actualB = Number(input.opponentActual);
  } else {
    if (input.playerScore == null || input.playerScore === "" || input.opponentScore == null || input.opponentScore === "") {
      return emptyHoleResult();
    }
    actualA = Number(input.playerScore) + par;
    actualB = Number(input.opponentScore) + par;
  }
  if (!isFinite(actualA) || !isFinite(actualB)) return emptyHoleResult();
  const relA = actualA - par;
  const relB = actualB - par;
  const adjA = adjustedActual(actualA, hcap, true);
  const adjB = adjustedActual(actualB, hcap, false);
  if (adjA === adjB) {
    return {
      outcome: "tie",
      scoreType: scoreTypeOf(relA),
      baseValue: 0,
      multiplier: 1,
      multiplierKey: stroke.scoreBand(relA),
      winnerActualDiff: relA,
      adjustedLeft: adjA,
      adjustedRight: adjB,
      finalValue: 0,
      leftPts: 0,
      rightPts: 0,
      settleVersion: MATCH2_SETTLE_VERSION
    };
  }
  const leftWins = adjA < adjB;
  const winnerActualDiff = leftWins ? relA : relB;
  const mulKey = stroke.scoreBand(winnerActualDiff);
  const mul = winnerMul(rule, winnerActualDiff);
  const holePts = core.round1(1 * mul * k);
  return {
    outcome: leftWins ? "win" : "lose",
    scoreType: scoreTypeOf(winnerActualDiff),
    baseValue: k,
    multiplier: mul,
    multiplierKey: mulKey,
    winnerActualDiff: winnerActualDiff,
    adjustedLeft: adjA,
    adjustedRight: adjB,
    finalValue: leftWins ? holePts : core.round1(-holePts),
    leftPts: leftWins ? holePts : core.round1(-holePts),
    rightPts: leftWins ? core.round1(-holePts) : holePts,
    settleVersion: MATCH2_SETTLE_VERSION
  };
}

const MEAT_DEFAULTS = { "le-2": 3, m1: 2, par: 1, "ge-1": 0 };

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

function resolveMatch2RuleSnapshot(game, librarySnap) {
  const raw = (game && game.ruleSnapshot) || {};
  let snap = raw;
  let hops = 0;
  while (
    hops < 4 &&
    snap &&
    typeof snap === "object" &&
    snap.reward == null &&
    !(Array.isArray(snap.mulRows) && snap.mulRows.length) &&
    snap.ruleSnapshot &&
    typeof snap.ruleSnapshot === "object"
  ) {
    snap = snap.ruleSnapshot;
    hops += 1;
  }
  const state = match2MulState(snap);
  if (state !== "missing") return { ruleSnapshot: snap, mulState: state };
  if (librarySnap && typeof librarySnap === "object") {
    let lib = librarySnap;
    let lh = 0;
    while (
      lh < 4 &&
      lib &&
      typeof lib === "object" &&
      lib.reward == null &&
      !(Array.isArray(lib.mulRows) && lib.mulRows.length) &&
      lib.ruleSnapshot &&
      typeof lib.ruleSnapshot === "object"
    ) {
      lib = lib.ruleSnapshot;
      lh += 1;
    }
    const merged = Object.assign({}, snap, lib);
    if (snap.requiredPartyCount != null) merged.requiredPartyCount = snap.requiredPartyCount;
    if (Array.isArray(snap.scoreFields)) merged.scoreFields = snap.scoreFields;
    const next = match2MulState(merged);
    if (next !== "missing") return { ruleSnapshot: merged, mulState: next };
  }
  return { ruleSnapshot: snap, mulState: "missing" };
}

function settleMatch2(game, ctx) {
  const ids = core.playerIdsOf(game);
  const holeOrder = (ctx && ctx.holeOrder) || [];
  const scores = (ctx && ctx.scores) || {};
  const resolved = resolveMatch2RuleSnapshot(game, ctx && ctx.libraryRuleSnapshot);
  if (resolved.mulState === "missing") {
    return {
      byHole: {},
      initial: core.emptyLedger(ids),
      catalogId: "match-2",
      settleVersion: MATCH2_SETTLE_VERSION,
      mulMissing: true,
      mulState: "missing",
      resultSource: "mul_config_missing",
      topHoleStates: {}
    };
  }
  const rule = resolved.ruleSnapshot || {};
  const k = pointValue(game);
  const pairs = ((game && game.pairings) || []).filter(function (pair) {
    return pair && pair.leftId && pair.rightId && pair.on !== false;
  });
  const meatPool = {};
  const topHoleTrackers = {};
  pairs.forEach(function (pair, i) {
    const key = pair.id || i;
    meatPool[key] = 0;
    topHoleTrackers[key] = core.createTopHoleTracker();
  });
  const lastLabel = core.lastOnLabel(game, holeOrder);
  const windOn = !!(ctx && ctx.windOn);
  let firstTrace = null;

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
        const hn = pairHcapN(pair, label, par);
        const holeRes = calculateMatchPlayHoleResult({
          playerScore: leftRel,
          opponentScore: rightRel,
          par: par,
          ruleConfig: rule,
          pointValue: k,
          handicapN: hn
        });
        if (!firstTrace) {
          firstTrace = {
            settleVersion: MATCH2_SETTLE_VERSION,
            resultSource: "settleMatch2",
            reward: rule.reward || "",
            mulRows: rule.mulRows || null,
            pair: { leftId: left, rightId: right, handicap: hn },
            par: par,
            actualScores: { left: leftRel + par, right: rightRel + par },
            adjustedScores: { left: holeRes.adjustedLeft, right: holeRes.adjustedRight },
            winner: holeRes.outcome === "tie" ? "" : holeRes.outcome === "win" ? left : right,
            winnerActualDiff: holeRes.winnerActualDiff,
            multiplierKey: holeRes.multiplierKey,
            multiplier: holeRes.multiplier,
            K: k,
            finalScores: { left: holeRes.leftPts, right: holeRes.rightPts }
          };
        }
        if (holeRes.outcome === "tie") {
          if (pushEnabled(rule)) {
            meatPool[key] += 1;
            core.enqueueTopHole(topHoleTrackers[key], label);
          }
          addPts(ledger, left, 0);
          addPts(ledger, right, 0);
          return;
        }
        const leftWins = holeRes.outcome === "win";
        const winnerRel = leftWins ? leftRel : rightRel;
        const holePts = Math.abs(Number(holeRes.leftPts) || 0);
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
            core.consumeTopHoles(topHoleTrackers[key], eat);
          }
        }
      });
    }
    byHole[label] = ledger;
  });

  if (typeof global !== "undefined" && global.__MATCH2_DEBUG__ && firstTrace) {
    global.__MATCH2_LAST_TRACE__ = firstTrace;
  }

  const topHoleStates = {};
  pairs.forEach(function (pair, i) {
    const key = pair.id || i;
    core.mergeTopHoleStates(topHoleStates, topHoleTrackers[key].states);
  });

  return {
    byHole: byHole,
    initial: core.emptyLedger(ids),
    catalogId: "match-2",
    settleVersion: MATCH2_SETTLE_VERSION,
    mulState: resolved.mulState,
    topHoleStates: topHoleStates
  };
}

module.exports = {
  MATCH2_SETTLE_VERSION,
  settle: settleMatch2,
  pairHcapN,
  netRel,
  winnerMul,
  match2MulState,
  resolveMatch2RuleSnapshot,
  calculateMatchPlayHoleResult
};
