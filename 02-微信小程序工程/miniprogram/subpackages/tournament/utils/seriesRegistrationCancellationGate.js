/**
 * SERIES-CANCEL-LOCK-A：Series 报名取消资格只读门闩
 * 不写 storage、不改 roster、不清理分站。
 * 成绩归属复用 P3-A；分站身份复用 verifyManagedStationForManage。
 */

var seriesStationManageGate = require('../../../utils/seriesStationManageGate.js');
var p3a = require('./removePlayerFromMatchCompetitionStructure.js');

var REASON_FINALIZED = 'finalized_score';
var REASON_STATION = 'managed_station_invalid';

var MSG_FINALIZED = '该选手已有完赛成绩，不可取消报名';

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function emptyIds() {
  return [];
}

function resultOf(cancellable, reason, message, lockedRoundIds, liveScoreRoundIds) {
  return {
    cancellable: !!cancellable,
    disabled: !cancellable,
    reason: reason || '',
    message: message || '',
    lockedRoundIds: Array.isArray(lockedRoundIds) ? lockedRoundIds.slice() : emptyIds(),
    liveScoreRoundIds: Array.isArray(liveScoreRoundIds) ? liveScoreRoundIds.slice() : emptyIds()
  };
}

function statusToken(match) {
  return asString(match && match.status).toLowerCase();
}

function isFinalizedStatus(match) {
  var s = statusToken(match);
  return s === 'finished' || s === 'completed';
}

function playerHasRealScore(match, playerId) {
  var cleaned = p3a.removePlayerFromMatchCompetitionStructure(match, playerId);
  return !!(cleaned && cleaned.blockedReason === p3a.BLOCKED_PLAYER_HAS_REAL_SCORE);
}

function indexStations(stations) {
  var byMatchId = Object.create(null);
  var byRoundId = Object.create(null);
  var list = Array.isArray(stations) ? stations : [];
  var i;
  for (i = 0; i < list.length; i++) {
    var st = list[i];
    if (!st || typeof st !== 'object') continue;
    var match = st.match && typeof st.match === 'object' ? st.match : st;
    var mid = asString(st.matchId || (match && match.matchId));
    var ctx = (match && match.seriesContext) || {};
    var rid = asString(st.roundId || ctx.roundId);
    var row = {
      match: match,
      matchId: mid,
      roundId: rid,
      index: st.index && typeof st.index === 'object' ? st.index : null
    };
    if (mid) byMatchId[mid] = row;
    if (rid) byRoundId[rid] = row;
  }
  return { byMatchId: byMatchId, byRoundId: byRoundId };
}

function deriveIndex(series, round, match) {
  var ctx = (match && match.seriesContext) || {};
  return {
    seriesId: asString(ctx.seriesId) || asString(series && series.seriesId),
    roundId: asString(ctx.roundId) || asString(round && round.roundId),
    matchId: asString(match && match.matchId) || asString(round && round.matchId)
  };
}

/**
 * @param {object} input
 * @param {object} input.series
 * @param {string} input.playerId
 * @param {Array} input.stations
 */
function resolveSeriesRegistrationCancellationGate(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series && typeof src.series === 'object' ? src.series : null;
  var playerId = asString(src.playerId);
  var catalog = indexStations(src.stations);

  if (!series || !asString(series.seriesId) || !playerId) {
    return resultOf(false, REASON_STATION, seriesStationManageGate.GATE_FAIL_MESSAGE, [], []);
  }

  var rounds = Array.isArray(series.rounds) ? series.rounds : [];
  var lockedRoundIds = [];
  var liveScoreRoundIds = [];
  var stationInvalid = false;
  var i;

  for (i = 0; i < rounds.length; i++) {
    var round = rounds[i];
    if (!round) continue;
    var roundId = asString(round.roundId);
    if (!roundId) {
      stationInvalid = true;
      continue;
    }
    var gate = seriesStationManageGate.verifyManagedStationForManage({
      series: series,
      roundId: roundId,
      getMatchById: function (id) {
        var row = catalog.byMatchId[asString(id)];
        return row && row.match ? row.match : null;
      },
      getIndexByMatchId: function (id) {
        var row = catalog.byMatchId[asString(id)];
        if (!row) return null;
        return row.index || deriveIndex(series, round, row.match);
      }
    });
    if (!gate.ok) {
      stationInvalid = true;
      continue;
    }
    if (!playerHasRealScore(gate.match, playerId)) continue;
    if (isFinalizedStatus(gate.match)) {
      lockedRoundIds.push(gate.roundId);
    } else {
      liveScoreRoundIds.push(gate.roundId);
    }
  }

  if (stationInvalid) {
    return resultOf(false, REASON_STATION, seriesStationManageGate.GATE_FAIL_MESSAGE, [], []);
  }
  if (lockedRoundIds.length) {
    return resultOf(false, REASON_FINALIZED, MSG_FINALIZED, lockedRoundIds, liveScoreRoundIds);
  }
  return resultOf(true, '', '', [], liveScoreRoundIds);
}

module.exports = {
  REASON_FINALIZED: REASON_FINALIZED,
  REASON_STATION: REASON_STATION,
  MSG_FINALIZED: MSG_FINALIZED,
  resolveSeriesRegistrationCancellationGate: resolveSeriesRegistrationCancellationGate
};
