/**
 * Series managed 分站管理核验（只读）
 * 失败不得重建/覆盖/修复分站
 */

function asString(v) {
  return v == null ? '' : String(v).trim();
}

var GATE_FAIL_MESSAGE = '本轮比赛数据异常';

function failGate(reason, extra) {
  extra = extra || {};
  return { ok: false, reason: reason, message: GATE_FAIL_MESSAGE };
}

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
    return failGate('series_required', {});
  }
  if (!roundId) {
    return failGate('round_id_required', {});
  }
  if (!getMatchById || !getIndexByMatchId) {
    return failGate('deps_required', {});
  }

  var seriesId = asString(series.seriesId);
  var publishToken = asString(series.publishToken);
  if (!seriesId || !publishToken) {
    return failGate('series_incomplete', { seriesId: seriesId, roundId: roundId });
  }

  var rounds = Array.isArray(series.rounds) ? series.rounds : [];
  var round = null;
  var roundIndex = -1;
  for (var i = 0; i < rounds.length; i++) {
    if (asString(rounds[i] && rounds[i].roundId) === roundId) {
      round = rounds[i];
      roundIndex = i;
      break;
    }
  }
  if (!round) {
    return failGate('round_not_in_series', {
      seriesId: seriesId,
      roundId: roundId,
      roundIndex: roundIndex
    });
  }

  var matchId = asString(round.matchId);
  if (!matchId) {
    return failGate('match_id_missing', {
      seriesId: seriesId,
      roundId: roundId,
      roundIndex: roundIndex
    });
  }

  var match = null;
  try {
    match = getMatchById(matchId);
  } catch (e) {
    match = null;
  }
  var ctx = match && match.seriesContext && typeof match.seriesContext === 'object'
    ? match.seriesContext
    : null;
  if (!match || !ctx || ctx.managed !== true) {
    try {
      var teamMatchStore = require('./teamMatchStore.js');
      if (typeof teamMatchStore.adoptLegacySeriesStationIfSafe === 'function') {
        teamMatchStore.adoptLegacySeriesStationIfSafe({
          matchId: matchId,
          seriesId: seriesId,
          roundId: roundId,
          publishToken: publishToken
        });
      }
    } catch (eAdopt) {
      /* ignore */
    }
    try {
      match = getMatchById(matchId);
    } catch (e2) {
      match = null;
    }
  }
  if (!match || typeof match !== 'object') {
    return failGate('match_not_found', {
      seriesId: seriesId,
      roundId: roundId,
      roundIndex: roundIndex,
      matchId: matchId,
      matchHit: false
    });
  }

  ctx = match.seriesContext && typeof match.seriesContext === 'object'
    ? match.seriesContext
    : null;
  if (!ctx || ctx.managed !== true) {
    return failGate('not_managed', {
      seriesId: seriesId,
      roundId: roundId,
      roundIndex: roundIndex,
      matchId: matchId,
      matchHit: true,
      managed: !!(ctx && ctx.managed === true)
    });
  }
  if (asString(ctx.seriesId) !== seriesId) {
    return failGate('series_id_mismatch', {
      seriesId: seriesId,
      roundId: roundId,
      roundIndex: roundIndex,
      matchId: matchId,
      matchHit: true,
      managed: true
    });
  }
  if (asString(ctx.roundId) !== roundId) {
    return failGate('round_id_mismatch', {
      seriesId: seriesId,
      roundId: roundId,
      roundIndex: roundIndex,
      matchId: matchId,
      matchHit: true,
      managed: true
    });
  }
  if (asString(ctx.publishToken) !== publishToken) {
    return failGate('publish_token_mismatch', {
      seriesId: seriesId,
      roundId: roundId,
      roundIndex: roundIndex,
      matchId: matchId,
      matchHit: true,
      managed: true
    });
  }

  var indexRow = null;
  try {
    indexRow = getIndexByMatchId(matchId);
  } catch (e2) {
    indexRow = null;
  }
  if (!indexRow || typeof indexRow !== 'object') {
    return failGate('index_missing', {
      seriesId: seriesId,
      roundId: roundId,
      roundIndex: roundIndex,
      matchId: matchId,
      matchHit: true,
      managed: true
    });
  }
  if (asString(indexRow.seriesId) !== seriesId) {
    return failGate('index_series_mismatch', {
      seriesId: seriesId,
      roundId: roundId,
      roundIndex: roundIndex,
      matchId: matchId,
      matchHit: true,
      managed: true
    });
  }
  if (asString(indexRow.roundId) !== roundId) {
    return failGate('index_round_mismatch', {
      seriesId: seriesId,
      roundId: roundId,
      roundIndex: roundIndex,
      matchId: matchId,
      matchHit: true,
      managed: true
    });
  }
  if (asString(indexRow.matchId) && asString(indexRow.matchId) !== matchId) {
    return failGate('index_match_mismatch', {
      seriesId: seriesId,
      roundId: roundId,
      roundIndex: roundIndex,
      matchId: matchId,
      matchHit: true,
      managed: true
    });
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
