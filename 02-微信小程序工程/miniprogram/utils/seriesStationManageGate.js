/**
 * Series managed 分站管理核验（只读）
 * 失败不得重建/覆盖/修复分站
 */

function asString(v) {
  return v == null ? '' : String(v).trim();
}

var GATE_FAIL_MESSAGE = '本轮比赛数据异常';

/**
 * @param {object} input
 * @param {object} input.series
 * @param {string} input.roundId
 * @param {function} input.getMatchById
 * @param {function} input.getIndexByMatchId
 * @returns {{ ok: boolean, reason?: string, message?: string, round?: object, match?: object, matchId?: string }}
 */
function verifyManagedStationForManage(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series && typeof src.series === 'object' ? src.series : null;
  var roundId = asString(src.roundId);
  var getMatchById =
    typeof src.getMatchById === 'function' ? src.getMatchById : null;
  var getIndexByMatchId =
    typeof src.getIndexByMatchId === 'function' ? src.getIndexByMatchId : null;

  if (!series) {
    return { ok: false, reason: 'series_required', message: GATE_FAIL_MESSAGE };
  }
  if (!roundId) {
    return { ok: false, reason: 'round_id_required', message: GATE_FAIL_MESSAGE };
  }
  if (!getMatchById || !getIndexByMatchId) {
    return { ok: false, reason: 'deps_required', message: GATE_FAIL_MESSAGE };
  }

  var seriesId = asString(series.seriesId);
  var publishToken = asString(series.publishToken);
  if (!seriesId || !publishToken) {
    return { ok: false, reason: 'series_incomplete', message: GATE_FAIL_MESSAGE };
  }

  var rounds = Array.isArray(series.rounds) ? series.rounds : [];
  var round = null;
  for (var i = 0; i < rounds.length; i++) {
    if (asString(rounds[i] && rounds[i].roundId) === roundId) {
      round = rounds[i];
      break;
    }
  }
  if (!round) {
    return { ok: false, reason: 'round_not_in_series', message: GATE_FAIL_MESSAGE };
  }

  var matchId = asString(round.matchId);
  if (!matchId) {
    return { ok: false, reason: 'match_id_missing', message: GATE_FAIL_MESSAGE };
  }

  var match = null;
  try {
    match = getMatchById(matchId);
  } catch (e) {
    match = null;
  }
  if (!match || typeof match !== 'object') {
    return { ok: false, reason: 'match_not_found', message: GATE_FAIL_MESSAGE };
  }

  var ctx = match.seriesContext && typeof match.seriesContext === 'object'
    ? match.seriesContext
    : null;
  if (!ctx || ctx.managed !== true) {
    return { ok: false, reason: 'not_managed', message: GATE_FAIL_MESSAGE };
  }
  if (asString(ctx.seriesId) !== seriesId) {
    return { ok: false, reason: 'series_id_mismatch', message: GATE_FAIL_MESSAGE };
  }
  if (asString(ctx.roundId) !== roundId) {
    return { ok: false, reason: 'round_id_mismatch', message: GATE_FAIL_MESSAGE };
  }
  if (asString(ctx.publishToken) !== publishToken) {
    return { ok: false, reason: 'publish_token_mismatch', message: GATE_FAIL_MESSAGE };
  }

  var indexRow = null;
  try {
    indexRow = getIndexByMatchId(matchId);
  } catch (e2) {
    indexRow = null;
  }
  if (!indexRow || typeof indexRow !== 'object') {
    return { ok: false, reason: 'index_missing', message: GATE_FAIL_MESSAGE };
  }
  if (asString(indexRow.seriesId) !== seriesId) {
    return { ok: false, reason: 'index_series_mismatch', message: GATE_FAIL_MESSAGE };
  }
  if (asString(indexRow.roundId) !== roundId) {
    return { ok: false, reason: 'index_round_mismatch', message: GATE_FAIL_MESSAGE };
  }
  if (asString(indexRow.matchId) && asString(indexRow.matchId) !== matchId) {
    return { ok: false, reason: 'index_match_mismatch', message: GATE_FAIL_MESSAGE };
  }

  return {
    ok: true,
    seriesId: seriesId,
    roundId: roundId,
    matchId: matchId,
    round: round,
    match: match
  };
}

module.exports = {
  GATE_FAIL_MESSAGE: GATE_FAIL_MESSAGE,
  verifyManagedStationForManage: verifyManagedStationForManage
};
