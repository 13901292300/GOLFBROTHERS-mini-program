/**
 * Next-hole participant order.
 * Ranking is independent of hole result (win / loss / push).
 * Does not know triangle, color, assignment, payout, or catalogId.
 */
function asString(v) {
  return v == null ? '' : String(v);
}

function idList(src) {
  if (!Array.isArray(src)) return [];
  return src.map(function (id) {
    return asString(id);
  }).filter(Boolean);
}

function rankingPolicyOf(game, override) {
  if (override) return asString(override);
  if (game && game.sortUpdate === 'fixed') return 'fixed';
  var mode = asString(game && game.groupMode);
  if (mode === 'fixed') return 'fixed';
  if (mode === 'split-high') return 'split-high';
  return 'dynamic';
}

/** Missing / unknown / failed read → rerank. Only explicit keep-combination freezes. */
function pushPolicyOf(raw) {
  return asString(raw) === 'keep-combination' ? 'keep-combination' : 'rerank';
}

/** Settlement mapper: rule.reorderOnPush === 'no' only. Absent field → rerank. */
function pushPolicyFromReorderOnPush(rule) {
  return asString(rule && rule.reorderOnPush) === 'no' ? 'keep-combination' : 'rerank';
}

function resultTie(rankId) {
  return String(rankId || '').indexOf('result') >= 0;
}

function walkHistory(hist, a, b, field, dir) {
  var i;
  var rec;
  var va;
  var vb;
  for (i = (hist || []).length - 1; i >= 0; i--) {
    rec = hist[i];
    if (!rec || !rec[a] || !rec[b]) continue;
    va = rec[a][field];
    vb = rec[b][field];
    if (va == null || vb == null) continue;
    if (va === vb) continue;
    return dir * (va - vb);
  }
  return 0;
}

function metricOf(rule) {
  var explicit = asString(rule && rule.metric);
  if (explicit) return explicit;
  var rankId = String((rule && rule.rankId) || '');
  if (rankId.indexOf('points') === 0) return 'score';
  if (rankId.indexOf('net') === 0) return 'net';
  return 'rel';
}

function cmpPlayers(a, b, rec, hist, rule) {
  var rankId = (rule && rule.rankId) || 'gross-origin';
  var metric = metricOf(rule);
  var ra = rec && rec[a];
  var rb = rec && rec[b];
  if (!ra || !rb) return 0;
  if (metric === 'score') {
    var d = rec[b].score - rec[a].score;
    if (d) return d;
    if (resultTie(rankId)) {
      var pts = rec[b].pts - rec[a].pts;
      if (pts) return pts;
      return walkHistory(hist, a, b, 'pts', -1);
    }
    return walkHistory(hist, a, b, 'score', -1);
  }
  var field = metric === 'net' ? 'net' : 'rel';
  var stroke = rec[a][field] - rec[b][field];
  if (stroke) return stroke;
  if (resultTie(rankId)) {
    var p = rec[b].pts - rec[a].pts;
    if (p) return p;
    return walkHistory(hist, a, b, 'pts', -1);
  }
  return walkHistory(hist, a, b, field, 1);
}

function stableSort(arr, cmp) {
  var a = arr.slice();
  var i;
  var j;
  var x;
  for (i = 1; i < a.length; i++) {
    x = a[i];
    j = i - 1;
    while (j >= 0 && cmp(a[j], x) > 0) {
      a[j + 1] = a[j];
      j--;
    }
    a[j + 1] = x;
  }
  return a;
}

function resolveNextHoleOrder(input) {
  var order = idList(input && input.currentOrder);
  var policy = asString((input && input.rankingPolicy) || 'dynamic') || 'dynamic';
  if (!order.length) return [];
  if (policy === 'fixed') return order.slice();
  if (pushPolicyOf(input && input.pushPolicy) === 'keep-combination' && input && input.isPush === true) {
    return order.slice();
  }

  var rec = (input && input.holeScores) || {};
  var hist =
    (input && input.tieBreakContext && (input.tieBreakContext.history || input.tieBreakContext.hist)) ||
    [];
  var rule = (input && input.rankingRule) || {};
  var cmp = function (a, b) {
    return cmpPlayers(a, b, rec, hist, rule);
  };
  var pinLast = Math.max(0, Math.floor(Number(rule.pinLast) || 0));
  var body = order;
  var tail = [];
  if (pinLast > 0 && order.length > pinLast) {
    body = order.slice(0, order.length - pinLast);
    tail = order.slice(order.length - pinLast);
  }

  if (policy === 'split-high' && body.length >= 3) {
    var highs = stableSort(body.slice(0, 2), cmp);
    if (body.length >= 4) {
      return highs.concat(stableSort(body.slice(2, 4), cmp)).concat(body.slice(4)).concat(tail);
    }
    return highs.concat(body.slice(2)).concat(tail);
  }

  return stableSort(body, cmp).concat(tail);
}

module.exports = {
  rankingPolicyOf: rankingPolicyOf,
  pushPolicyOf: pushPolicyOf,
  pushPolicyFromReorderOnPush: pushPolicyFromReorderOnPush,
  resolveNextHoleOrder: resolveNextHoleOrder
};
