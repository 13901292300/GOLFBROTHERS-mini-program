/**
 * SERIES 全局报名取消资格（只读）
 * A. Eligibility：本人是否参加过已结束分站
 * B. Ownership：未结束分站是否可安全清理
 * 不写 storage、不改 roster、不清理分站。
 * 不把 managed===true 当作取消资格。
 */

var seriesStationManageGate = require('../../../utils/seriesStationManageGate.js');
var teamMatchFinish = require('../../../utils/teamMatchFinish.js');
var p3a = require('./removePlayerFromMatchCompetitionStructure.js');

var REASON_FINALIZED = 'finalized_score';
var REASON_STATION = 'managed_station_invalid';
var REASON_COMPLETED = 'completed_station_participation';

var MSG_FINALIZED = '该选手已有完赛成绩，不可取消报名';
var MSG_COMPLETED = '你已参加过已结束的分站比赛，无法取消报名';

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function emptyIds() {
  return [];
}

function resultOf(cancellable, reason, message, lockedRoundIds, liveScoreRoundIds, extra) {
  var out = {
    cancellable: !!cancellable,
    disabled: !cancellable,
    reason: reason || '',
    message: message || '',
    lockedRoundIds: Array.isArray(lockedRoundIds) ? lockedRoundIds.slice() : emptyIds(),
    liveScoreRoundIds: Array.isArray(liveScoreRoundIds) ? liveScoreRoundIds.slice() : emptyIds()
  };
  extra = extra && typeof extra === 'object' ? extra : {};
  if (extra.roundId) out.roundId = extra.roundId;
  if (extra.matchId) out.matchId = extra.matchId;
  if (extra.roundIndex != null && extra.roundIndex !== '') out.roundIndex = extra.roundIndex;
  return out;
}

function playerHasParticipatedInStation(match, playerId) {
  var uid = asString(playerId);
  if (!match || typeof match !== 'object' || !uid) return false;
  var structure =
    typeof p3a.inspectStructure === 'function' ? p3a.inspectStructure(match, uid) : { hasAny: false };
  var hasScore =
    typeof p3a.playerHasRealScore === 'function' ? p3a.playerHasRealScore(match, uid) : false;
  return !!(structure && structure.hasAny) || !!hasScore;
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

function ownershipPointsElsewhere(series, round, match, indexRow) {
  var seriesId = asString(series && series.seriesId);
  var roundId = asString(round && round.roundId);
  var matchId = asString(round && round.matchId) || asString(match && match.matchId);
  if (match && asString(match.matchId) && matchId && asString(match.matchId) !== matchId) {
    return true;
  }
  var ctx = match && match.seriesContext && typeof match.seriesContext === 'object' ? match.seriesContext : null;
  if (ctx) {
    if (asString(ctx.seriesId) && seriesId && asString(ctx.seriesId) !== seriesId) return true;
    if (asString(ctx.roundId) && roundId && asString(ctx.roundId) !== roundId) return true;
    if (
      asString(ctx.publishToken) &&
      asString(series && series.publishToken) &&
      asString(ctx.publishToken) !== asString(series.publishToken)
    ) {
      return true;
    }
  }
  if (indexRow && typeof indexRow === 'object') {
    if (asString(indexRow.seriesId) && seriesId && asString(indexRow.seriesId) !== seriesId) return true;
    if (asString(indexRow.roundId) && roundId && asString(indexRow.roundId) !== roundId) return true;
    if (asString(indexRow.matchId) && matchId && asString(indexRow.matchId) !== matchId) return true;
  }
  return false;
}

/**
 * 解析某 round 对应分站：无 matchId / match 不存在则 skip。
 * managed 标志不参与资格。ownership 指向其它 series/round 则失败。
 */
function resolveSeriesCancelStation(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series && typeof src.series === 'object' ? src.series : null;
  var round = src.round && typeof src.round === 'object' ? src.round : null;
  var roundIndex = src.roundIndex;
  var roundId = asString(round && round.roundId);
  var matchId = asString(round && round.matchId);
  if (!matchId) {
    return {
      ok: true,
      skip: true,
      diagnostic: 'match_id_missing',
      roundId: roundId,
      roundIndex: roundIndex
    };
  }
  var match = null;
  try {
    match = typeof src.getMatchById === 'function' ? src.getMatchById(matchId) : null;
  } catch (eGet) {
    match = null;
  }
  if (!match || typeof match !== 'object') {
    return {
      ok: true,
      skip: true,
      diagnostic: 'match_not_found',
      roundId: roundId,
      matchId: matchId,
      roundIndex: roundIndex
    };
  }
  var indexRow = null;
  try {
    indexRow = typeof src.getIndexByMatchId === 'function' ? src.getIndexByMatchId(matchId) : null;
  } catch (eIdx) {
    indexRow = null;
  }
  if (ownershipPointsElsewhere(series, round, match, indexRow)) {
    return {
      ok: false,
      skip: false,
      reason: REASON_STATION,
      message: seriesStationManageGate.GATE_FAIL_MESSAGE,
      roundId: roundId,
      matchId: matchId,
      roundIndex: roundIndex
    };
  }
  return {
    ok: true,
    skip: false,
    match: match,
    matchId: asString(match.matchId) || matchId,
    roundId: roundId,
    roundIndex: roundIndex
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
  var blocking = null;
  var i;

  for (i = 0; i < rounds.length; i++) {
    var round = rounds[i];
    if (!round) continue;
    var roundIndex = round.index != null ? round.index : i + 1;
    var resolved = resolveSeriesCancelStation({
      series: series,
      round: round,
      roundIndex: roundIndex,
      getMatchById: function (id) {
        var row = catalog.byMatchId[asString(id)];
        return row && row.match ? row.match : null;
      },
      getIndexByMatchId: function (id) {
        var row = catalog.byMatchId[asString(id)];
        return row && row.index ? row.index : null;
      }
    });
    if (resolved.skip) continue;
    if (!resolved.ok) {
      return resultOf(false, resolved.reason || REASON_STATION, resolved.message || seriesStationManageGate.GATE_FAIL_MESSAGE, [], [], {
        roundId: resolved.roundId,
        matchId: resolved.matchId,
        roundIndex: resolved.roundIndex
      });
    }
    var hasParticipated = playerHasParticipatedInStation(resolved.match, playerId);
    if (!hasParticipated) continue;
    var completed = teamMatchFinish.isMatchCompleted(resolved.match);
    if (completed) {
      lockedRoundIds.push(resolved.roundId);
      if (!blocking) {
        blocking = {
          roundId: resolved.roundId,
          matchId: resolved.matchId,
          roundIndex: resolved.roundIndex
        };
      }
    } else {
      liveScoreRoundIds.push(resolved.roundId);
    }
  }

  if (lockedRoundIds.length) {
    return resultOf(false, REASON_COMPLETED, MSG_COMPLETED, lockedRoundIds, liveScoreRoundIds, blocking || {});
  }
  return resultOf(true, '', '', [], liveScoreRoundIds);
}

module.exports = {
  REASON_FINALIZED: REASON_FINALIZED,
  REASON_STATION: REASON_STATION,
  REASON_COMPLETED: REASON_COMPLETED,
  MSG_FINALIZED: MSG_FINALIZED,
  MSG_COMPLETED: MSG_COMPLETED,
  playerHasParticipatedInStation: playerHasParticipatedInStation,
  resolveSeriesCancelStation: resolveSeriesCancelStation,
  resolveSeriesRegistrationCancellationGate: resolveSeriesRegistrationCancellationGate
};
