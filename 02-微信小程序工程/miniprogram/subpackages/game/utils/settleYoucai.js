/**
 * 油菜（V53 §4.1.5，行 376–413）
 *
 * 两人比洞简化版：每洞比较调整后杆数，胜洞差固定为 1，再乘每洞分值 K。
 * 无奖励、无顶洞、无吃肉、无包洞。
 * 让杆 / 有效洞与普通比洞同构：pair.hcapList[].{par3,par4,par5,hcapHoles}，
 * 经 settleMatch2.pairHcapN 解析；实例级 game.holes 仍由 core.holeOn 过滤。
 */
var core = require('./settleCore.js');
var match2 = require('./settleMatch2.js');

var YOUCAI_SETTLE_VERSION = 'v53-4.1.5';

function asId(v) {
  return v == null ? '' : String(v);
}

function parseHalfNumber(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  var n = Number(raw);
  if (!isFinite(n)) return fallback;
  return Math.round(n * 2) / 2;
}

function pointPerHoleOf(game) {
  if (game && game.pointPerHole != null && game.pointPerHole !== '') {
    return parseHalfNumber(game.pointPerHole, 1);
  }
  return parseHalfNumber(game && game.multiplier, 1);
}

/**
 * 与比洞一致：优先 hcapList + 洞号 + PAR；否则回退 pair.handicap / strokes。
 */
function pairHandicapN(pair, label, par) {
  if (arguments.length >= 2) {
    return parseHalfNumber(match2.pairHcapN(pair, label, par), 0);
  }
  if (!pair) return 0;
  if (pair.handicap != null && pair.handicap !== '') {
    return parseHalfNumber(pair.handicap, 0);
  }
  return parseHalfNumber(pair.strokes, 0);
}

/**
 * N>0：左让右，右受让；N<0：右让左，左受让 |N|。
 */
function adjustedActual(actual, n, isLeft) {
  var a = Number(actual);
  var h = Number(n) || 0;
  if (!h) return a;
  if (h > 0) return isLeft ? a : a - h;
  return isLeft ? a - Math.abs(h) : a;
}

function readRel(scores, hole, playerId) {
  var holeCard = scores && scores[hole];
  if (!holeCard) return null;
  var v = holeCard[playerId];
  if (v == null || v === '') return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

function holeParOf(par) {
  var n = Number(par);
  if (n === 3 || n === 4 || n === 5) return n;
  return 4;
}

function holePar(pars, label) {
  return holeParOf(pars && pars[label]);
}

/**
 * 左右交换时让杆反号，保持语义。
 * A-B N=+1  ⇔  B-A N=-1
 */
function flipHandicapForSwap(n) {
  var h = parseHalfNumber(n, 0);
  return core.round1(-h);
}

/**
 * 纯函数：单洞油菜结果。
 * 输入可用 actual 绝对杆，或 relative+par。
 */
function calculateYoucaiHoleResult(input) {
  input = input || {};
  var k = parseHalfNumber(input.pointPerHole != null ? input.pointPerHole : input.pointValue, 1);
  var hcap = parseHalfNumber(input.handicap != null ? input.handicap : input.handicapN, 0);
  var par = holeParOf(input.par);

  var leftActual;
  var rightActual;
  if (
    input.leftActualScore != null &&
    input.leftActualScore !== '' &&
    input.rightActualScore != null &&
    input.rightActualScore !== ''
  ) {
    leftActual = Number(input.leftActualScore);
    rightActual = Number(input.rightActualScore);
  } else if (
    input.playerActual != null &&
    input.playerActual !== '' &&
    input.opponentActual != null &&
    input.opponentActual !== ''
  ) {
    leftActual = Number(input.playerActual);
    rightActual = Number(input.opponentActual);
  } else {
    if (
      input.leftRel == null ||
      input.leftRel === '' ||
      input.rightRel == null ||
      input.rightRel === ''
    ) {
      if (
        input.playerScore == null ||
        input.playerScore === '' ||
        input.opponentScore == null ||
        input.opponentScore === ''
      ) {
        return {
          status: 'pending',
          leftActualScore: null,
          rightActualScore: null,
          handicap: hcap,
          leftAdjustedScore: null,
          rightAdjustedScore: null,
          winner: null,
          leftValue: null,
          rightValue: null
        };
      }
      leftActual = Number(input.playerScore) + par;
      rightActual = Number(input.opponentScore) + par;
    } else {
      leftActual = Number(input.leftRel) + par;
      rightActual = Number(input.rightRel) + par;
    }
  }
  if (!isFinite(leftActual) || !isFinite(rightActual)) {
    return {
      status: 'pending',
      leftActualScore: null,
      rightActualScore: null,
      handicap: hcap,
      leftAdjustedScore: null,
      rightAdjustedScore: null,
      winner: null,
      leftValue: null,
      rightValue: null
    };
  }

  var leftAdj = core.round1(adjustedActual(leftActual, hcap, true));
  var rightAdj = core.round1(adjustedActual(rightActual, hcap, false));
  var leftValue = 0;
  var rightValue = 0;
  var winner = 'tie';
  if (leftAdj < rightAdj) {
    leftValue = k;
    rightValue = core.round1(-k);
    winner = 'left';
  } else if (rightAdj < leftAdj) {
    leftValue = core.round1(-k);
    rightValue = k;
    winner = 'right';
  }
  return {
    status: 'settled',
    leftActualScore: leftActual,
    rightActualScore: rightActual,
    handicap: hcap,
    leftAdjustedScore: leftAdj,
    rightAdjustedScore: rightAdj,
    winner: winner,
    leftValue: core.round1(leftValue),
    rightValue: core.round1(rightValue)
  };
}

function activePairs(game) {
  return ((game && game.pairings) || []).filter(function (p) {
    return p && p.on !== false && p.leftId && p.rightId;
  });
}

function pairKeyOf(pair) {
  return asId(pair.id) || asId(pair.leftId) + '|' + asId(pair.rightId);
}

function addPts(ledger, id, n) {
  var key = asId(id);
  if (!key) return;
  ledger[key] = core.round1((Number(ledger[key]) || 0) + (Number(n) || 0));
}

/**
 * @param {object} game
 * @param {object} ctx { scores, holeOrder, pars }
 */
function settleYoucai(game, ctx) {
  var ids = core.playerIdsOf(game);
  var holeOrder = (ctx && ctx.holeOrder) || [];
  var scores = (ctx && ctx.scores) || {};
  var pars = (ctx && ctx.pars) || {};
  var k = pointPerHoleOf(game);
  var pairs = activePairs(game);

  var byHole = {};
  var byHolePairs = {};
  var pairTotals = {};
  var playerTotals = {};
  ids.forEach(function (id) {
    playerTotals[id] = 0;
  });
  pairs.forEach(function (pair) {
    pairTotals[pairKeyOf(pair)] = { leftValue: 0, rightValue: 0 };
  });

  holeOrder.forEach(function (label) {
    var ledger = core.holeLedger();
    var pairBag = {};
    // 与比洞同语义：先实例级有效洞；再按组合 hcapList 解析 N
    // 未结算不得写入球员 0（避免看板把 pending 显示成 0）
    if (core.holeOn(game, label)) {
      var par = holePar(pars, label);
      pairs.forEach(function (pair) {
        var leftId = asId(pair.leftId);
        var rightId = asId(pair.rightId);
        var key = pairKeyOf(pair);
        var leftRel = readRel(scores, label, leftId);
        var rightRel = readRel(scores, label, rightId);
        var hn = pairHandicapN(pair, label, par);
        var holeRes;
        if (leftRel == null || rightRel == null) {
          holeRes = {
            status: 'pending',
            leftActualScore: null,
            rightActualScore: null,
            handicap: hn,
            leftAdjustedScore: null,
            rightAdjustedScore: null,
            winner: null,
            leftValue: null,
            rightValue: null
          };
        } else {
          holeRes = calculateYoucaiHoleResult({
            leftRel: leftRel,
            rightRel: rightRel,
            par: par,
            handicap: hn,
            pointPerHole: k
          });
        }
        pairBag[key] = Object.assign(
          {
            leftPlayerId: leftId,
            rightPlayerId: rightId
          },
          holeRes
        );
        if (holeRes.status === 'settled') {
          addPts(ledger, leftId, holeRes.leftValue);
          addPts(ledger, rightId, holeRes.rightValue);
          addPts(playerTotals, leftId, holeRes.leftValue);
          addPts(playerTotals, rightId, holeRes.rightValue);
          pairTotals[key].leftValue = core.round1(
            pairTotals[key].leftValue + holeRes.leftValue
          );
          pairTotals[key].rightValue = core.round1(
            pairTotals[key].rightValue + holeRes.rightValue
          );
        }
      });
    }
    byHole[label] = ledger;
    byHolePairs[label] = pairBag;
  });

  return {
    byHole: byHole,
    byHolePairs: byHolePairs,
    pairTotals: pairTotals,
    playerTotals: playerTotals,
    // 无初始分；不得预填球员 0
    initial: {},
    catalogId: 'youcai',
    settleVersion: YOUCAI_SETTLE_VERSION,
    pointPerHole: k
  };
}

module.exports = {
  YOUCAI_SETTLE_VERSION: YOUCAI_SETTLE_VERSION,
  calculateYoucaiHoleResult: calculateYoucaiHoleResult,
  adjustedActual: adjustedActual,
  pairHandicapN: pairHandicapN,
  pointPerHoleOf: pointPerHoleOf,
  flipHandicapForSwap: flipHandicapForSwap,
  settle: settleYoucai
};
