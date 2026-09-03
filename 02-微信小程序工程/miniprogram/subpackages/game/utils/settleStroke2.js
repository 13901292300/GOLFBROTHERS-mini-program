/**
 * 两人比杆（V53 §4.1.1，行 199–232）
 *
 * 每洞比较真实杆数，不应用逐洞让杆。
 * 让杆为组合级总杆让杆，只进入初始分。
 * 奖励只看胜者真实成绩：加在杆差上（加法）或乘杆差（乘法），再乘每杆分值 K。
 */
const core = require("./settleCore.js");

const STROKE2_SETTLE_VERSION = "v53-4.1.1";

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

function unwrapGameplaySnapshot(raw) {
  if (raw == null || typeof raw !== "object") return raw == null ? {} : raw;
  let cur = JSON.parse(JSON.stringify(raw));
  let hops = 0;
  while (
    hops < 4 &&
    cur &&
    typeof cur === "object" &&
    cur.reward == null &&
    !(Array.isArray(cur.mulRows) && cur.mulRows.length) &&
    !(Array.isArray(cur.addRows) && cur.addRows.length) &&
    cur.ruleSnapshot &&
    typeof cur.ruleSnapshot === "object"
  ) {
    cur = JSON.parse(JSON.stringify(cur.ruleSnapshot));
    hops += 1;
  }
  return cur && typeof cur === "object" ? cur : {};
}

function mergeRuleSnapshot(capability, gameplay) {
  const cap = capability && typeof capability === "object" ? JSON.parse(JSON.stringify(capability)) : {};
  const play = unwrapGameplaySnapshot(gameplay);
  const capPlay = unwrapGameplaySnapshot(cap);
  const out = Object.assign({}, cap, play);
  if (out.reward == null && capPlay.reward != null) Object.assign(out, capPlay);
  return unwrapGameplaySnapshot(out);
}

function stroke2RewardState(rule) {
  const snap = unwrapGameplaySnapshot(rule || {});
  if (snap.reward === "mul") return "mul";
  if (snap.reward === "add") return "add";
  if (snap.reward === "none") return "none";
  return "missing";
}

function rewardMul(rule, winnerRel) {
  if (stroke2RewardState(rule) !== "mul") return 1;
  const m = lookup(rowMap(rule && rule.mulRows), scoreBand(winnerRel), MUL_DEFAULTS);
  if (!isFinite(m) || !(m > 0)) return 1;
  return m;
}

function rewardAdd(rule, winnerRel) {
  const n = lookup(rowMap(rule && rule.addRows), scoreBand(winnerRel), ADD_DEFAULTS);
  return isFinite(n) ? n : 0;
}

function applyReward(rawDiff, winnerRel, rule) {
  const mode = stroke2RewardState(rule);
  if (!(rawDiff > 0) || mode === "none" || mode === "missing") return rawDiff;
  if (mode === "mul") return rawDiff * rewardMul(rule, winnerRel);
  if (mode === "add") return rawDiff + rewardAdd(rule, winnerRel);
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

function holePar(ctx, label) {
  const map = (ctx && ctx.pars) || {};
  const n = Number(map[label]);
  if (n === 3 || n === 4 || n === 5) return n;
  return 4;
}

function emptyHoleResult() {
  return {
    winner: "",
    baseGap: 0,
    winnerActualDiff: 0,
    rewardMode: "none",
    rewardKey: "par",
    rewardValue: 0,
    adjustedGap: 0,
    finalValue: 0,
    leftValue: 0,
    rightValue: 0,
    settleVersion: STROKE2_SETTLE_VERSION
  };
}

function calculateStrokePlayHoleResult(input) {
  input = input || {};
  const rule = unwrapGameplaySnapshot(input.ruleSnapshot || input.ruleConfig || {});
  const k = pointValue({
    multiplier: input.pointPerStroke != null ? input.pointPerStroke : input.pointValue != null ? input.pointValue : 1
  });
  const parRaw = Number(input.par);
  const par = parRaw === 3 || parRaw === 4 || parRaw === 5 ? parRaw : 4;
  let actualA;
  let actualB;
  if (
    input.leftActualScore != null &&
    input.leftActualScore !== "" &&
    input.rightActualScore != null &&
    input.rightActualScore !== ""
  ) {
    actualA = Number(input.leftActualScore);
    actualB = Number(input.rightActualScore);
  } else if (
    input.leftScore != null &&
    input.leftScore !== "" &&
    input.rightScore != null &&
    input.rightScore !== ""
  ) {
    actualA = Number(input.leftScore) + par;
    actualB = Number(input.rightScore) + par;
  } else if (
    input.playerActual != null &&
    input.playerActual !== "" &&
    input.opponentActual != null &&
    input.opponentActual !== ""
  ) {
    actualA = Number(input.playerActual);
    actualB = Number(input.opponentActual);
  } else if (
    input.playerScore != null &&
    input.playerScore !== "" &&
    input.opponentScore != null &&
    input.opponentScore !== ""
  ) {
    actualA = Number(input.playerScore) + par;
    actualB = Number(input.opponentScore) + par;
  } else {
    return emptyHoleResult();
  }
  if (!isFinite(actualA) || !isFinite(actualB)) return emptyHoleResult();
  const relA = actualA - par;
  const relB = actualB - par;
  const baseGap = Math.abs(actualA - actualB);
  const rewardMode = stroke2RewardState(rule);
  if (actualA === actualB) {
    return {
      winner: "",
      baseGap: 0,
      winnerActualDiff: relA,
      rewardMode: rewardMode === "missing" ? "none" : rewardMode,
      rewardKey: scoreBand(relA),
      rewardValue: 0,
      adjustedGap: 0,
      finalValue: 0,
      leftValue: 0,
      rightValue: 0,
      settleVersion: STROKE2_SETTLE_VERSION
    };
  }
  const leftWins = actualA < actualB;
  const winnerActualDiff = leftWins ? relA : relB;
  const rewardKey = scoreBand(winnerActualDiff);
  let rewardValue = 0;
  let adjustedGap = baseGap;
  if (rewardMode === "mul") {
    rewardValue = rewardMul(rule, winnerActualDiff);
    adjustedGap = baseGap * rewardValue;
  } else if (rewardMode === "add") {
    rewardValue = rewardAdd(rule, winnerActualDiff);
    adjustedGap = baseGap + rewardValue;
  }
  const finalValue = core.round1(adjustedGap * k);
  return {
    winner: leftWins ? "left" : "right",
    baseGap: baseGap,
    winnerActualDiff: winnerActualDiff,
    rewardMode: rewardMode === "missing" ? "none" : rewardMode,
    rewardKey: rewardKey,
    rewardValue: rewardMode === "none" || rewardMode === "missing" ? 0 : rewardValue,
    adjustedGap: adjustedGap,
    finalValue: finalValue,
    leftValue: leftWins ? finalValue : core.round1(-finalValue),
    rightValue: leftWins ? core.round1(-finalValue) : finalValue,
    settleVersion: STROKE2_SETTLE_VERSION
  };
}

function resolveStroke2RuleSnapshot(game, librarySnap) {
  const merged = mergeRuleSnapshot((game && game.ruleSnapshot) || {}, librarySnap || {});
  const snap = unwrapGameplaySnapshot(merged);
  const state = stroke2RewardState(snap);
  if (state !== "missing") return { ruleSnapshot: snap, rewardState: state };
  if (librarySnap && typeof librarySnap === "object") {
    const fromLib = mergeRuleSnapshot(snap, librarySnap);
    const next = stroke2RewardState(fromLib);
    if (next !== "missing") return { ruleSnapshot: unwrapGameplaySnapshot(fromLib), rewardState: next };
  }
  return {
    ruleSnapshot: Object.assign({}, snap, { reward: "none" }),
    rewardState: "none"
  };
}

function settleStroke2(game, ctx) {
  const ids = core.playerIdsOf(game);
  const holeOrder = (ctx && ctx.holeOrder) || [];
  const scores = (ctx && ctx.scores) || {};
  const resolved = resolveStroke2RuleSnapshot(game, ctx && ctx.libraryRuleSnapshot);
  if (resolved.rewardState === "missing") {
    return {
      byHole: {},
      initial: core.emptyLedger(ids),
      catalogId: "stroke-2",
      settleVersion: STROKE2_SETTLE_VERSION,
      rewardMissing: true,
      rewardState: "missing",
      resultSource: "reward_config_missing"
    };
  }
  const rule = resolved.ruleSnapshot || {};
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

  let firstTrace = null;
  const byHole = {};
  holeOrder.forEach(function (label) {
    const ledger = core.holeLedger();
    if (core.holeOn(game, label)) {
      const par = holePar(ctx, label);
      pairs.forEach(function (pair) {
        const left = String(pair.leftId);
        const right = String(pair.rightId);
        const leftRel = readRel(scores, label, left);
        const rightRel = readRel(scores, label, right);
        if (leftRel == null || rightRel == null) return;
        const holeRes = calculateStrokePlayHoleResult({
          leftScore: leftRel,
          rightScore: rightRel,
          par: par,
          pointPerStroke: k,
          ruleSnapshot: rule
        });
        if (!firstTrace) {
          firstTrace = {
            settleVersion: STROKE2_SETTLE_VERSION,
            resultSource: "settleStroke2",
            reward: rule.reward || "",
            mulRows: rule.mulRows || null,
            addRows: rule.addRows || null,
            pair: { leftId: left, rightId: right, strokes: pairStrokeN(pair) },
            par: par,
            actualScores: { left: leftRel + par, right: rightRel + par },
            winner: holeRes.winner === "left" ? left : holeRes.winner === "right" ? right : "",
            baseGap: holeRes.baseGap,
            winnerActualDiff: holeRes.winnerActualDiff,
            rewardMode: holeRes.rewardMode,
            rewardKey: holeRes.rewardKey,
            rewardValue: holeRes.rewardValue,
            adjustedGap: holeRes.adjustedGap,
            K: k,
            finalScores: { left: holeRes.leftValue, right: holeRes.rightValue }
          };
        }
        addPts(ledger, left, holeRes.leftValue);
        addPts(ledger, right, holeRes.rightValue);
      });
    }
    byHole[label] = ledger;
  });

  if (typeof global !== "undefined" && global.__STROKE2_DEBUG__ && firstTrace) {
    global.__STROKE2_LAST_TRACE__ = firstTrace;
  }

  return {
    byHole: byHole,
    initial: initial,
    catalogId: "stroke-2",
    settleVersion: STROKE2_SETTLE_VERSION,
    rewardState: resolved.rewardState
  };
}

module.exports = {
  STROKE2_SETTLE_VERSION,
  settle: settleStroke2,
  scoreBand,
  applyReward,
  rewardMul,
  stroke2RewardState,
  resolveStroke2RuleSnapshot,
  calculateStrokePlayHoleResult
};
