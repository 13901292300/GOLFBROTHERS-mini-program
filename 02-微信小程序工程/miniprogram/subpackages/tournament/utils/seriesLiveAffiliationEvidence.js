/**
 * Series LIVE 换人：跨轮参赛归属证据收集与两级约束（纯函数）
 * - 只读；不写 series / match / groups / roster
 * - 不把 roster 当作正式上场证据
 * - 不把 allowRepeat / 莱德杯跨轮重复混入本推导
 */

var seriesRoundVisualState = require('../../../utils/seriesRoundVisualState.js');
var matchStatus = require('../../../utils/matchStatus.js');
var teamMatchFinish = require('../../../utils/teamMatchFinish.js');
var seriesStationMatch = require('../../../utils/seriesStationMatch.js');

var STATE = {
  unlocked: 'unlocked',
  participation_reservation: 'participation_reservation',
  confirmed_affiliation_lock: 'confirmed_affiliation_lock',
  affiliation_conflict: 'affiliation_conflict',
  projection_incomplete: 'projection_incomplete'
};

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function emptyResult(extra) {
  return Object.assign(
    {
      ok: true,
      state: STATE.unlocked,
      affiliationId: '',
      affiliationKind: '',
      evidence: [],
      invalidRounds: [],
      reason: ''
    },
    extra || {}
  );
}

function failIncomplete(invalidRounds, reason) {
  return {
    ok: false,
    state: STATE.projection_incomplete,
    affiliationId: '',
    affiliationKind: '',
    evidence: [],
    invalidRounds: Array.isArray(invalidRounds) ? invalidRounds : [],
    reason: reason || 'projection_incomplete'
  };
}

function failConflict(reason, extra) {
  return Object.assign(
    {
      ok: false,
      state: STATE.affiliation_conflict,
      affiliationId: '',
      affiliationKind: '',
      evidence: [],
      invalidRounds: [],
      reason: reason || 'affiliation_conflict'
    },
    extra || {}
  );
}

var AMBIGUOUS = { ambiguous: true };

function isCancelledRound(round, match) {
  var visual = seriesRoundVisualState.resolveSeriesRoundVisualState(round, match);
  return !!(visual && visual.state === seriesRoundVisualState.STATE.cancelled);
}

function resolveParticipantKind(series) {
  return asString(series && series.hostMode) === 'team' ? 'division' : 'team';
}

function noteUniqueKey(byKey, key, part) {
  var k = asString(key);
  if (!k || !part) return;
  var existing = byKey[k];
  if (!existing) {
    byKey[k] = part;
    return;
  }
  if (existing === AMBIGUOUS) return;
  if (asString(existing.seriesParticipantId) === asString(part.seriesParticipantId)) return;
  byKey[k] = AMBIGUOUS;
}

function indexSeriesParticipants(series) {
  var kind = resolveParticipantKind(series);
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  var byKey = Object.create(null);
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (!p || typeof p !== 'object') continue;
    var pKind = asString(p.kind) || kind;
    if (pKind && pKind !== kind) continue;
    var sid = asString(p.seriesParticipantId);
    if (!sid) continue;
    var row = {
      seriesParticipantId: sid,
      kind: pKind || kind,
      sourceTeamId: asString(p.sourceTeamId) || asString(p.teamId) || asString(p.hostTeamId),
      divisionId: asString(p.divisionId)
    };
    noteUniqueKey(byKey, sid, row);
    if (kind === 'division') {
      noteUniqueKey(byKey, row.divisionId, row);
      if (sid.indexOf('division:') === 0) {
        noteUniqueKey(byKey, sid.slice('division:'.length), row);
      }
    } else {
      noteUniqueKey(byKey, row.sourceTeamId, row);
      noteUniqueKey(byKey, asString(p.teamId), row);
    }
  }
  return { kind: kind, byKey: byKey };
}

function lookupParticipantKey(participantIndex, key) {
  var k = asString(key);
  if (!k) return { found: false, ambiguous: false, part: null };
  var hit = participantIndex && participantIndex.byKey ? participantIndex.byKey[k] : null;
  if (!hit) return { found: false, ambiguous: false, part: null };
  if (hit === AMBIGUOUS || hit.ambiguous) {
    return { found: false, ambiguous: true, part: null };
  }
  return { found: true, ambiguous: false, part: hit };
}

function seatCompatKeys(seat, kind) {
  var s = seat && typeof seat === 'object' ? seat : {};
  var keys = [];
  function push(v) {
    var k = asString(v);
    if (k) keys.push(k);
  }
  if (kind === 'division') {
    push(s.divisionId);
    push(s.matchTeamId);
    push(s.affiliationId);
    return keys;
  }
  push(s.sourceTeamId);
  push(s.teamId);
  push(s.matchTeamId);
  push(s.affiliationId);
  return keys;
}

function successAffiliation(part, kind) {
  return {
    ok: true,
    affiliationId: asString(part && part.seriesParticipantId),
    affiliationKind: asString(part && part.kind) || kind || ''
  };
}

/**
 * 显式 seriesParticipantId 必须在 participants 中。
 * 仅无显式 sid 时才用兼容字段；兼容 key 歧义或 host team 映射分队 → unmapped。
 */
function normalizeSeatAffiliation(seat, participantIndex) {
  var idx = participantIndex || { kind: '', byKey: Object.create(null) };
  var kind = idx.kind || '';
  var sid = asString(seat && seat.seriesParticipantId);
  if (sid) {
    var explicit = lookupParticipantKey(idx, sid);
    if (explicit.ambiguous) {
      return { ok: false, reason: 'affiliation_unmapped', affiliationId: '', affiliationKind: '' };
    }
    if (!explicit.found) {
      return { ok: false, reason: 'affiliation_unmapped', affiliationId: '', affiliationKind: '' };
    }
    var compat = seatCompatKeys(seat, kind);
    for (var i = 0; i < compat.length; i++) {
      var other = lookupParticipantKey(idx, compat[i]);
      if (other.ambiguous) {
        return { ok: false, reason: 'affiliation_unmapped', affiliationId: '', affiliationKind: '' };
      }
      if (
        other.found &&
        asString(other.part.seriesParticipantId) !== asString(explicit.part.seriesParticipantId)
      ) {
        return {
          ok: false,
          reason: 'affiliation_identity_conflict',
          affiliationId: '',
          affiliationKind: ''
        };
      }
    }
    return successAffiliation(explicit.part, kind);
  }

  var resolved = [];
  var seenSid = Object.create(null);
  var keys = seatCompatKeys(seat, kind);
  for (var j = 0; j < keys.length; j++) {
    var hit = lookupParticipantKey(idx, keys[j]);
    if (hit.ambiguous) {
      return { ok: false, reason: 'affiliation_unmapped', affiliationId: '', affiliationKind: '' };
    }
    if (!hit.found) continue;
    var id = asString(hit.part.seriesParticipantId);
    if (!id || seenSid[id]) continue;
    seenSid[id] = true;
    resolved.push(hit.part);
  }
  if (resolved.length > 1) {
    return {
      ok: false,
      reason: 'affiliation_identity_conflict',
      affiliationId: '',
      affiliationKind: ''
    };
  }
  if (resolved.length === 1) {
    return successAffiliation(resolved[0], kind);
  }
  return { ok: false, reason: 'affiliation_unmapped', affiliationId: '', affiliationKind: '' };
}

function playerIdsOfSeat(seat) {
  var ids = Object.create(null);
  function absorb(raw) {
    if (raw == null) return;
    if (typeof raw === 'string' || typeof raw === 'number') {
      var s = String(raw).trim();
      if (s) ids[s] = true;
      return;
    }
    if (typeof raw !== 'object') return;
    var uid = asString(raw.userId);
    var pid = asString(raw.playerId);
    if (uid) ids[uid] = true;
    if (pid) ids[pid] = true;
  }
  absorb(seat);
  var members = seat && Array.isArray(seat.members) ? seat.members : [];
  for (var i = 0; i < members.length; i++) absorb(members[i]);
  var memberUserIds = seat && Array.isArray(seat.memberUserIds) ? seat.memberUserIds : [];
  for (var j = 0; j < memberUserIds.length; j++) absorb(memberUserIds[j]);
  return ids;
}

function seatHasPlayerId(seat, playerId) {
  var pid = asString(playerId);
  if (!pid) return false;
  var ids = playerIdsOfSeat(seat);
  return !!ids[pid];
}

function excludeKey(roundId, matchId, groupId, position) {
  return (
    asString(roundId) +
    '|' +
    asString(matchId) +
    '|' +
    asString(groupId) +
    '|' +
    String(Number(position) || 0)
  );
}

function verifyStation(series, round, match, indexRow) {
  var roundId = asString(round && round.roundId);
  var seriesId = asString(series && series.seriesId);
  var expectedMatchId = asString(round && round.matchId);
  if (!roundId) {
    return { ok: false, reason: 'round_id_missing' };
  }
  if (!expectedMatchId) {
    return { ok: false, reason: 'match_missing' };
  }
  if (!match || typeof match !== 'object') {
    return { ok: false, reason: 'match_missing' };
  }
  if (!seriesStationMatch.isSeriesManagedMatch(match) || !match.seriesContext || match.seriesContext.managed !== true) {
    return { ok: false, reason: 'not_managed' };
  }
  var ctx = match.seriesContext;
  var matchId = asString(match.matchId);
  if (!seriesId || asString(ctx.seriesId) !== seriesId) {
    return { ok: false, reason: 'series_id_conflict' };
  }
  if (asString(ctx.roundId) !== roundId) {
    return { ok: false, reason: 'round_id_conflict' };
  }
  if (!matchId || matchId !== expectedMatchId) {
    return { ok: false, reason: 'match_id_conflict' };
  }
  if (asString(ctx.matchId) && asString(ctx.matchId) !== matchId) {
    return { ok: false, reason: 'match_id_conflict' };
  }
  var seriesToken = asString(series && series.publishToken);
  var ctxToken = asString(ctx.publishToken);
  if (!seriesToken || !ctxToken) {
    return { ok: false, reason: 'publish_token_missing' };
  }
  if (seriesToken !== ctxToken) {
    return { ok: false, reason: 'publish_token_conflict' };
  }
  if (!indexRow || typeof indexRow !== 'object') {
    return { ok: false, reason: 'index_missing' };
  }
  if (asString(indexRow.seriesId) !== seriesId) {
    return { ok: false, reason: 'index_series_conflict' };
  }
  if (asString(indexRow.roundId) !== roundId) {
    return { ok: false, reason: 'index_round_conflict' };
  }
  if (asString(indexRow.matchId) !== matchId) {
    return { ok: false, reason: 'index_match_conflict' };
  }
  if (!Array.isArray(match.groups)) {
    return { ok: false, reason: 'groups_unreadable' };
  }
  return { ok: true, matchId: matchId, roundId: roundId };
}

/**
 * @param {object} input
 * @param {object} input.series
 * @param {string} input.playerId
 * @param {{ seriesId, roundId, matchId, groupId, position }} input.currentTarget
 * @param {function} input.getMatchById
 * @param {function} input.getIndexByMatchId
 * @param {function} [input.isGroupConfirmedFinished]
 * @param {function} [input.isMatchCompleted]
 */
function collectSeriesLiveAffiliationEvidence(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series;
  var playerId = asString(src.playerId);
  var target = src.currentTarget && typeof src.currentTarget === 'object' ? src.currentTarget : {};
  var skip = excludeKey(target.roundId, target.matchId, target.groupId, target.position);
  var getMatchById = src.getMatchById;
  var getIndexByMatchId = src.getIndexByMatchId;
  var isGroupFinished =
    typeof src.isGroupConfirmedFinished === 'function'
      ? src.isGroupConfirmedFinished
      : matchStatus.isGroupConfirmedFinished;
  var isMatchDone =
    typeof src.isMatchCompleted === 'function'
      ? src.isMatchCompleted
      : teamMatchFinish.isMatchCompleted;

  if (typeof getMatchById !== 'function' || typeof getIndexByMatchId !== 'function') {
    return failIncomplete([], 'projection_incomplete');
  }
  if (!series || typeof series !== 'object') {
    return failIncomplete([], 'projection_incomplete');
  }
  var targetSeriesId = asString(target.seriesId);
  if (targetSeriesId && targetSeriesId !== asString(series.seriesId)) {
    return failIncomplete([], 'series_id_conflict');
  }

  var participantIndex = indexSeriesParticipants(series);
  var rounds = Array.isArray(series.rounds) ? series.rounds : [];
  var evidence = [];
  var invalidRounds = [];

  for (var i = 0; i < rounds.length; i++) {
    var round = rounds[i] || {};
    var roundId = asString(round.roundId);
    var matchId = asString(round.matchId);
    var match = null;
    try {
      match = matchId ? getMatchById(matchId) : null;
    } catch (eGet) {
      match = null;
    }
    if (isCancelledRound(round, match)) continue;

    var indexRow = null;
    try {
      indexRow = matchId ? getIndexByMatchId(matchId) : null;
    } catch (eIdx) {
      indexRow = null;
    }
    var station = verifyStation(series, round, match, indexRow);
    if (!station.ok) {
      invalidRounds.push({
        roundId: roundId,
        matchId: matchId,
        reason: station.reason || 'projection_incomplete'
      });
      return failIncomplete(invalidRounds, station.reason || 'projection_incomplete');
    }

    var matchCompleted = !!isMatchDone(match);
    var groups = Array.isArray(match.groups) ? match.groups : [];
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g] || {};
      var groupId = asString(group.groupId);
      var groupFinished = !!isGroupFinished(group && group.status);
      var players = Array.isArray(group.players) ? group.players : [];
      for (var p = 0; p < players.length; p++) {
        var seat = players[p];
        if (!seat || typeof seat !== 'object') continue;
        var pos = Number(seat.position != null ? seat.position : seat.slotIndex);
        if (!pos) pos = p + 1;
        if (excludeKey(roundId, matchId, groupId, pos) === skip) continue;
        if (!seatHasPlayerId(seat, playerId)) continue;
        var aff = normalizeSeatAffiliation(seat, participantIndex);
        if (aff && aff.reason === 'affiliation_identity_conflict') {
          return failConflict('affiliation_identity_conflict', {
            invalidRounds: [
              {
                roundId: roundId,
                matchId: matchId,
                reason: 'affiliation_identity_conflict'
              }
            ]
          });
        }
        if (!aff || !aff.ok || !aff.affiliationId) {
          invalidRounds.push({
            roundId: roundId,
            matchId: matchId,
            reason: (aff && aff.reason) || 'affiliation_unmapped'
          });
          return failIncomplete(invalidRounds, (aff && aff.reason) || 'affiliation_unmapped');
        }
        var level = groupFinished || matchCompleted
          ? STATE.confirmed_affiliation_lock
          : STATE.participation_reservation;
        evidence.push({
          roundId: roundId,
          matchId: matchId,
          groupId: groupId,
          position: pos,
          affiliationId: aff.affiliationId,
          affiliationKind: aff.affiliationKind,
          level: level
        });
      }
    }
  }

  return deriveConstraint(evidence, participantIndex.kind);
}

function deriveConstraint(evidence, defaultKind) {
  var list = Array.isArray(evidence) ? evidence : [];
  if (!list.length) {
    return emptyResult({ affiliationKind: defaultKind || '' });
  }
  var byAff = Object.create(null);
  var order = [];
  for (var i = 0; i < list.length; i++) {
    var row = list[i];
    var id = asString(row && row.affiliationId);
    if (!id) continue;
    if (!byAff[id]) {
      byAff[id] = {
        affiliationId: id,
        affiliationKind: asString(row.affiliationKind),
        hasLock: false,
        hasReserve: false
      };
      order.push(id);
    }
    if (row.level === STATE.confirmed_affiliation_lock) byAff[id].hasLock = true;
    if (row.level === STATE.participation_reservation) byAff[id].hasReserve = true;
  }
  if (order.length > 1) {
    return {
      ok: false,
      state: STATE.affiliation_conflict,
      affiliationId: '',
      affiliationKind: '',
      evidence: list.slice(),
      invalidRounds: [],
      reason: 'affiliation_conflict'
    };
  }
  var only = byAff[order[0]];
  var state = only.hasLock ? STATE.confirmed_affiliation_lock : STATE.participation_reservation;
  return {
    ok: true,
    state: state,
    affiliationId: only.affiliationId,
    affiliationKind: only.affiliationKind || defaultKind || '',
    evidence: list.slice(),
    invalidRounds: [],
    reason: state
  };
}

module.exports = {
  STATE: STATE,
  collectSeriesLiveAffiliationEvidence: collectSeriesLiveAffiliationEvidence,
  deriveConstraint: deriveConstraint,
  normalizeSeatAffiliation: normalizeSeatAffiliation,
  indexSeriesParticipants: indexSeriesParticipants
};
