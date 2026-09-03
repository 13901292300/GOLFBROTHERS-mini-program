/**
 * 三局（V53 §4.1.4）
 *
 * 全程 18 洞分为前九 / 后九 / 全场。
 * 让杆为**组合级有符号三段**：每段一个 N。
 *   N>0：左让右 → 右受让（右总杆 - N）
 *   N<0：右让左 → 左受让（左总杆 - |N|）
 *   N=0：不让
 * 低者胜。分值与让杆均为实例配置。
 */
var core = require('./settleCore.js');

var THREE_SET_SETTLE_VERSION = 'v53-4.1.4';

function asId(v) {
  return v == null ? '' : String(v);
}

function parseHalfNumber(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  var n = Number(raw);
  if (!isFinite(n)) return fallback;
  return Math.round(n * 2) / 2;
}

function segmentValuesOf(game) {
  var src = (game && game.segmentValues) || {};
  return {
    front: parseHalfNumber(src.front, 1),
    back: parseHalfNumber(src.back, 1),
    overall: parseHalfNumber(src.overall, 1)
  };
}

/** 游戏卡片系数摘要：前9/后9/全场，直接读实例 segmentValues（非 multiplier） */
function segmentCoeffText(game) {
  if (!game || String(game.catalogId || '') !== 'three-set') return '';
  var src = game.segmentValues || {};
  function part(key) {
    if (src[key] != null && src[key] !== '') return String(src[key]);
    return '1';
  }
  return part('front') + '/' + part('back') + '/' + part('overall');
}

/** 旧球员级 → 组合有符号：N = rightHcap - leftHcap */
function migrateSignedFromPlayers(leftRow, rightRow, seg) {
  var l = parseHalfNumber(leftRow && leftRow[seg], 0);
  var r = parseHalfNumber(rightRow && rightRow[seg], 0);
  return parseHalfNumber(r - l, 0);
}

function legacyPlayerMap(game) {
  var src = (game && game.playerSegmentHandicaps) || {};
  var out = {};
  Object.keys(src).forEach(function (pid) {
    var row = src[pid] || {};
    out[asId(pid)] = {
      front: parseHalfNumber(row.front, 0),
      back: parseHalfNumber(row.back, 0),
      overall: parseHalfNumber(row.overall, 0)
    };
  });
  return out;
}

function hasOwnSeg(obj, key) {
  return obj && Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null && obj[key] !== '';
}

/**
 * 读取组合三段有符号让杆。
 * 优先 pair.segmentHandicaps / pair.seg*；否则从旧 playerSegmentHandicaps 迁移。
 */
function pairSegmentHandicapsOf(pair, legacyMap) {
  var sh = (pair && pair.segmentHandicaps) || {};
  var fromFlat =
    hasOwnSeg(pair, 'segFront') || hasOwnSeg(pair, 'segBack') || hasOwnSeg(pair, 'segOverall');
  var fromObj =
    hasOwnSeg(sh, 'front') || hasOwnSeg(sh, 'back') || hasOwnSeg(sh, 'overall');
  if (fromObj || fromFlat) {
    return {
      front: parseHalfNumber(fromFlat && hasOwnSeg(pair, 'segFront') ? pair.segFront : sh.front, 0),
      back: parseHalfNumber(fromFlat && hasOwnSeg(pair, 'segBack') ? pair.segBack : sh.back, 0),
      overall: parseHalfNumber(
        fromFlat && hasOwnSeg(pair, 'segOverall') ? pair.segOverall : sh.overall,
        0
      )
    };
  }
  var left = (legacyMap && legacyMap[asId(pair && pair.leftId)]) || {};
  var right = (legacyMap && legacyMap[asId(pair && pair.rightId)]) || {};
  return {
    front: migrateSignedFromPlayers(left, right, 'front'),
    back: migrateSignedFromPlayers(left, right, 'back'),
    overall: migrateSignedFromPlayers(left, right, 'overall')
  };
}

/** 换边时三段全部反号 */
function flipSegmentHandicaps(seg) {
  var s = seg || {};
  return {
    front: parseHalfNumber(-(Number(s.front) || 0), 0),
    back: parseHalfNumber(-(Number(s.back) || 0), 0),
    overall: parseHalfNumber(-(Number(s.overall) || 0), 0)
  };
}

/**
 * 按有符号 N 调整段总杆（只动受让方）。
 */
function applySignedHandicap(leftRaw, rightRaw, signedN) {
  var n = parseHalfNumber(signedN, 0);
  var leftAdj = leftRaw;
  var rightAdj = rightRaw;
  if (n > 0) rightAdj = core.round1(rightRaw - n);
  else if (n < 0) leftAdj = core.round1(leftRaw - Math.abs(n));
  return { left: leftAdj, right: rightAdj, n: n };
}

function activePairs(game) {
  return ((game && game.pairings) || []).filter(function (p) {
    return p && p.on !== false && p.leftId && p.rightId;
  });
}

function pairKeyOf(pair) {
  return asId(pair.id) || asId(pair.leftId) + '__' + asId(pair.rightId);
}

function readAbsStroke(scores, hole, playerId, pars) {
  var holeCard = scores && scores[hole];
  if (!holeCard) return null;
  var v = holeCard[playerId];
  if (v == null || v === '') return null;
  var rel = Number(v);
  if (!isFinite(rel)) return null;
  var parN = Number(pars && pars[hole]);
  var par = parN === 3 || parN === 4 || parN === 5 ? parN : 4;
  var abs = rel + par;
  if (!(abs > 0)) return null;
  return abs;
}

function sumSegment(playerId, holeIds, scores, pars) {
  var total = 0;
  var i;
  for (i = 0; i < holeIds.length; i++) {
    var abs = readAbsStroke(scores, holeIds[i], playerId, pars);
    if (abs == null) return null;
    total += abs;
  }
  return core.round1(total);
}

function settleSegment(leftRaw, rightRaw, signedN, value) {
  var n = parseHalfNumber(signedN, 0);
  if (leftRaw == null || rightRaw == null) {
    return {
      status: 'pending',
      leftRawTotal: leftRaw,
      rightRawTotal: rightRaw,
      signedHandicap: n,
      leftAdjustedTotal: null,
      rightAdjustedTotal: null,
      leftValue: 0,
      rightValue: 0
    };
  }
  var adj = applySignedHandicap(leftRaw, rightRaw, n);
  var pts = parseHalfNumber(value, 1);
  var leftValue = 0;
  var rightValue = 0;
  if (adj.left < adj.right) {
    leftValue = pts;
    rightValue = -pts;
  } else if (adj.right < adj.left) {
    leftValue = -pts;
    rightValue = pts;
  }
  return {
    status: 'settled',
    leftRawTotal: leftRaw,
    rightRawTotal: rightRaw,
    signedHandicap: n,
    leftAdjustedTotal: adj.left,
    rightAdjustedTotal: adj.right,
    leftValue: core.round1(leftValue),
    rightValue: core.round1(rightValue)
  };
}

function splitHoleOrder(holeOrder) {
  var order = (holeOrder || []).map(asId).filter(Boolean);
  return {
    ok: order.length === 18,
    all: order,
    front: order.slice(0, 9),
    back: order.slice(9, 18)
  };
}

function addPts(ledger, id, n) {
  var key = asId(id);
  if (!key) return;
  ledger[key] = core.round1((Number(ledger[key]) || 0) + (Number(n) || 0));
}

function settleThreeSet(game, ctx) {
  var holeOrder = (ctx && ctx.holeOrder) || [];
  var scores = (ctx && ctx.scores) || {};
  var pars = (ctx && ctx.pars) || {};
  var ids = core.playerIdsOf(game);
  var split = splitHoleOrder(holeOrder);
  var values = segmentValuesOf(game);
  var legacy = legacyPlayerMap(game);
  var pairs = activePairs(game);
  var playerTotals = core.emptyLedger(ids);
  delete playerTotals[core.POT_ID];
  ids.forEach(function (id) {
    playerTotals[id] = 0;
  });

  var byPair = {};
  var byHole = {};

  if (!split.ok) {
    return {
      byHole: byHole,
      initial: {},
      catalogId: 'three-set',
      settleVersion: THREE_SET_SETTLE_VERSION,
      rejectReason: 'require_18_holes',
      byPair: byPair,
      playerTotals: playerTotals,
      segmentValues: values
    };
  }

  pairs.forEach(function (pair) {
    var leftId = asId(pair.leftId);
    var rightId = asId(pair.rightId);
    var key = pairKeyOf(pair);
    var segs = pairSegmentHandicapsOf(pair, legacy);
    var front = settleSegment(
      sumSegment(leftId, split.front, scores, pars),
      sumSegment(rightId, split.front, scores, pars),
      segs.front,
      values.front
    );
    var back = settleSegment(
      sumSegment(leftId, split.back, scores, pars),
      sumSegment(rightId, split.back, scores, pars),
      segs.back,
      values.back
    );
    var overall = settleSegment(
      sumSegment(leftId, split.all, scores, pars),
      sumSegment(rightId, split.all, scores, pars),
      segs.overall,
      values.overall
    );
    var leftTotal = core.round1(
      (front.status === 'settled' ? front.leftValue : 0) +
        (back.status === 'settled' ? back.leftValue : 0) +
        (overall.status === 'settled' ? overall.leftValue : 0)
    );
    var rightTotal = core.round1(
      (front.status === 'settled' ? front.rightValue : 0) +
        (back.status === 'settled' ? back.rightValue : 0) +
        (overall.status === 'settled' ? overall.rightValue : 0)
    );
    byPair[key] = {
      leftPlayerId: leftId,
      rightPlayerId: rightId,
      segmentHandicaps: segs,
      front: front,
      back: back,
      overall: overall,
      total: { leftValue: leftTotal, rightValue: rightTotal }
    };
    addPts(playerTotals, leftId, leftTotal);
    addPts(playerTotals, rightId, rightTotal);
  });

  function segmentHoleLedger(segResult, leftId, rightId) {
    var ledger = core.holeLedger();
    if (segResult.status !== 'settled') return ledger;
    ledger[leftId] = segResult.leftValue;
    ledger[rightId] = segResult.rightValue;
    return ledger;
  }

  pairs.forEach(function (pair) {
    var key = pairKeyOf(pair);
    var row = byPair[key];
    if (!row) return;
    var frontLabel = split.front[0];
    var backLabel = split.back[0];
    var overallLabel = split.all[17];
    if (!byHole[frontLabel]) byHole[frontLabel] = core.holeLedger();
    if (!byHole[backLabel]) byHole[backLabel] = core.holeLedger();
    if (!byHole[overallLabel]) byHole[overallLabel] = core.holeLedger();
    var fl = segmentHoleLedger(row.front, row.leftPlayerId, row.rightPlayerId);
    var bl = segmentHoleLedger(row.back, row.leftPlayerId, row.rightPlayerId);
    var ol = segmentHoleLedger(row.overall, row.leftPlayerId, row.rightPlayerId);
    Object.keys(fl).forEach(function (pid) {
      if (pid === core.POT_ID) return;
      byHole[frontLabel][pid] = core.round1(
        (Number(byHole[frontLabel][pid]) || 0) + (Number(fl[pid]) || 0)
      );
    });
    Object.keys(bl).forEach(function (pid) {
      if (pid === core.POT_ID) return;
      byHole[backLabel][pid] = core.round1(
        (Number(byHole[backLabel][pid]) || 0) + (Number(bl[pid]) || 0)
      );
    });
    Object.keys(ol).forEach(function (pid) {
      if (pid === core.POT_ID) return;
      byHole[overallLabel][pid] = core.round1(
        (Number(byHole[overallLabel][pid]) || 0) + (Number(ol[pid]) || 0)
      );
    });
  });

  return {
    byHole: byHole,
    initial: {},
    catalogId: 'three-set',
    settleVersion: THREE_SET_SETTLE_VERSION,
    byPair: byPair,
    playerTotals: playerTotals,
    segmentValues: values,
    fullHoleOrder: split.all.slice()
  };
}

module.exports = {
  THREE_SET_SETTLE_VERSION: THREE_SET_SETTLE_VERSION,
  settle: settleThreeSet,
  settleThreeSet: settleThreeSet,
  settleSegment: settleSegment,
  sumSegment: sumSegment,
  segmentValuesOf: segmentValuesOf,
  segmentCoeffText: segmentCoeffText,
  pairSegmentHandicapsOf: pairSegmentHandicapsOf,
  flipSegmentHandicaps: flipSegmentHandicaps,
  applySignedHandicap: applySignedHandicap,
  migrateSignedFromPlayers: migrateSignedFromPlayers,
  splitHoleOrder: splitHoleOrder,
  parseHalfNumber: parseHalfNumber
};
