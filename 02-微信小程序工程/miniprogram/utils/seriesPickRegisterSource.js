/**
 * Series 已报名名单只读投影（主包共享）
 * - 权威：series.roster（非 match.registerInfo）
 * - 只 require 主包 utils
 * - 不写 Series / 不写 Match
 */

var seriesStore = require('./seriesStore.js');
var seriesStationIndex = require('./seriesStationIndex.js');
var seriesStationMatch = require('./seriesStationMatch.js');
var seriesNoRepeatLineup = require('./seriesNoRepeatLineup.js');

var STATION_DATA_INVALID_MSG =
  seriesNoRepeatLineup.STATION_DATA_INVALID_MSG || '本轮比赛数据异常';
var SCORE_REGISTER_READ_FAIL_MSG = '系列赛报名数据读取失败，请返回后重试';
var SCORE_ROSTER_STALE_MSG = '报名信息已变化，请重新选择';
var SOURCE_KIND_SERIES_ROSTER = 'series_roster';

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function resolveParticipantMode(series) {
  return asString(series && series.hostMode) === 'team' ? 'division' : 'team';
}

function resolveParticipantDisplayName(p) {
  if (!p || typeof p !== 'object') return '';
  return (
    asString(p.shortNameSnapshot) ||
    asString(p.nameSnapshot) ||
    asString(p.fullNameSnapshot) ||
    asString(p.sourceTeamId) ||
    asString(p.divisionId) ||
    asString(p.seriesParticipantId) ||
    '未命名'
  );
}

/** teamGroups.id：organization → sourceTeamId；team → divisionId */
function resolveTeamGroupId(participant, mode) {
  if (!participant) return '';
  if (mode === 'division') {
    return (
      asString(participant.divisionId) ||
      asString(participant.seriesParticipantId).replace(/^division:/, '') ||
      asString(participant.seriesParticipantId)
    );
  }
  return (
    asString(participant.sourceTeamId) || asString(participant.seriesParticipantId)
  );
}

function indexParticipants(series) {
  var mode = resolveParticipantMode(series);
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  var byId = Object.create(null);
  var tabs = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i] || {};
    var kind = asString(p.kind);
    if (kind && kind !== mode) continue;
    var sid = asString(p.seriesParticipantId);
    if (!sid || byId[sid]) continue;
    var name = resolveParticipantDisplayName(p);
    var teamGroupId = resolveTeamGroupId(p, mode);
    byId[sid] = {
      seriesParticipantId: sid,
      kind: mode,
      name: name,
      shortName: asString(p.shortNameSnapshot) || name,
      teamGroupId: teamGroupId,
      sourceTeamId: asString(p.sourceTeamId),
      divisionId: asString(p.divisionId)
    };
    tabs.push({ id: sid, name: name, count: 0 });
  }
  return { mode: mode, byId: byId, tabs: tabs };
}

function resolveRosterPlayerId(entry) {
  return asString(entry && entry.playerId) || asString(entry && entry.userId);
}

function resolveRosterDisplayName(entry) {
  return (
    asString(entry && entry.nameSnapshot) ||
    asString(entry && entry.playerNameSnapshot) ||
    asString(entry && entry.competitionName) ||
    asString(entry && entry.matchNickname) ||
    asString(entry && entry.nickname) ||
    asString(entry && entry.displayName) ||
    ''
  );
}

function resolveRosterAvatar(entry) {
  return (
    asString(entry && entry.avatarSnapshot) ||
    asString(entry && entry.playerAvatarSnapshot) ||
    asString(entry && entry.avatar) ||
    ''
  );
}

function resolveRosterGender(entry) {
  return (
    asString(entry && entry.genderSnapshot) ||
    asString(entry && entry.gender) ||
    asString(entry && entry.sex) ||
    ''
  );
}

function resolveRosterHandicap(entry) {
  if (entry && entry.handicapSnapshot != null && entry.handicapSnapshot !== '') {
    return String(entry.handicapSnapshot);
  }
  if (entry && entry.handicap != null && entry.handicap !== '') {
    return String(entry.handicap);
  }
  return '-';
}

function isRegisteredRosterEntry(entry, participantById) {
  if (!entry || typeof entry !== 'object') return false;
  var playerId = resolveRosterPlayerId(entry);
  if (!playerId) return false;
  var status = asString(entry.registrationStatus).toLowerCase();
  if (status && status !== 'registered') return false;
  var sid = asString(entry.seriesParticipantId);
  if (!sid || !participantById[sid]) return false;
  return true;
}

function hasValidSeriesAffiliation(entry, series) {
  var indexed = indexParticipants(series);
  var sid = asString(entry && entry.seriesParticipantId);
  return !!(sid && indexed.byId[sid]);
}

function needsAffiliationSelection(playerLike, series) {
  if (!playerLike || typeof playerLike !== 'object') return true;
  if (playerLike.fromSeriesRoster === true || playerLike.isSeriesRoster === true) {
    return !hasValidSeriesAffiliation(playerLike, series);
  }
  var sid = asString(playerLike.seriesParticipantId);
  if (!sid) return true;
  var indexed = indexParticipants(series);
  return !indexed.byId[sid];
}

function buildSeriesPickRegisterProjection(series) {
  var indexed = indexParticipants(series);
  var roster = Array.isArray(series && series.roster) ? series.roster : [];
  var users = [];
  var counts = Object.create(null);
  for (var t = 0; t < indexed.tabs.length; t++) {
    counts[indexed.tabs[t].id] = 0;
  }

  for (var i = 0; i < roster.length; i++) {
    var entry = roster[i];
    if (!isRegisteredRosterEntry(entry, indexed.byId)) continue;
    var playerId = resolveRosterPlayerId(entry);
    var sid = asString(entry.seriesParticipantId);
    var part = indexed.byId[sid];
    var teamGroupId = asString(part.teamGroupId) || sid;
    var teamName = asString(part.name);
    var shortName = asString(part.shortName) || teamName;
    var partRaw = null;
    var parts = Array.isArray(series && series.participants) ? series.participants : [];
    for (var pi = 0; pi < parts.length; pi++) {
      if (asString(parts[pi] && parts[pi].seriesParticipantId) === sid) {
        partRaw = parts[pi];
        break;
      }
    }
    var nameSnap =
      asString(partRaw && partRaw.nameSnapshot) ||
      asString(partRaw && partRaw.fullNameSnapshot) ||
      teamName;
    var shortSnap = asString(partRaw && partRaw.shortNameSnapshot) || shortName;
    var colorSnap = asString(partRaw && partRaw.colorSnapshot);
    counts[sid] = (counts[sid] || 0) + 1;
    users.push({
      userId: playerId,
      playerId: playerId,
      rosterEntryId: asString(entry.rosterEntryId),
      competitionName: resolveRosterDisplayName(entry) || playerId,
      displayName: resolveRosterDisplayName(entry) || playerId,
      nickname: resolveRosterDisplayName(entry) || playerId,
      avatar: resolveRosterAvatar(entry),
      gender: resolveRosterGender(entry),
      handicap: resolveRosterHandicap(entry),
      groupId: sid,
      groupName: shortSnap || teamName,
      matchTeamId: teamGroupId,
      matchTeamName: shortSnap || teamName,
      seriesParticipantId: sid,
      affiliationId: teamGroupId,
      participantNameSnapshot: nameSnap,
      participantShortNameSnapshot: shortSnap,
      participantColorSnapshot: colorSnap,
      shortNameSnapshot: shortSnap,
      colorSnapshot: colorSnap,
      fromSeriesRoster: true,
      isSeriesRoster: true
    });
  }

  var tabs = indexed.tabs.map(function (tab) {
    return {
      id: tab.id,
      name: tab.name,
      count: counts[tab.id] || 0
    };
  });

  return {
    registerInfo: {
      totalCount: users.length,
      users: users
    },
    registerSubTabs: tabs,
    emptyText: '暂无报名人员'
  };
}

function looksLikeSeriesStation(match) {
  if (seriesStationMatch.isSeriesManagedMatch(match)) return true;
  var ctx = match && match.seriesContext;
  if (!ctx || typeof ctx !== 'object') return false;
  return !!(asString(ctx.seriesId) || ctx.managed === true);
}

function defaultGetSeriesById(seriesId) {
  return typeof seriesStore.getSeriesById === 'function'
    ? seriesStore.getSeriesById(seriesId)
    : null;
}

function defaultGetIndexByMatchId(matchId) {
  return typeof seriesStationIndex.getByMatchId === 'function'
    ? seriesStationIndex.getByMatchId(matchId)
    : null;
}

/**
 * 记分页 Series 分站身份：seriesContext + Series + station index + publishToken。
 * 缺字段或冲突 → fail closed。
 */
function verifyScoreSeriesStationIdentity(input) {
  var src = input && typeof input === 'object' ? input : {};
  var match = src.match && typeof src.match === 'object' ? src.match : null;
  if (!match) {
    return { ok: false, reason: 'match_required', message: SCORE_REGISTER_READ_FAIL_MSG };
  }
  var ctx = match.seriesContext && typeof match.seriesContext === 'object' ? match.seriesContext : null;
  if (!ctx) {
    return { ok: false, reason: 'series_context_missing', message: SCORE_REGISTER_READ_FAIL_MSG };
  }
  var seriesId = asString(ctx.seriesId);
  var roundId = asString(ctx.roundId);
  var matchId = asString(match.matchId);
  var ctxToken = asString(ctx.publishToken);
  if (!seriesId || !roundId || !matchId || !ctxToken) {
    return { ok: false, reason: 'series_identity_incomplete', message: SCORE_REGISTER_READ_FAIL_MSG };
  }
  if (ctx.managed !== true) {
    return { ok: false, reason: 'not_managed', message: SCORE_REGISTER_READ_FAIL_MSG };
  }

  var getSeriesById =
    typeof src.getSeriesById === 'function' ? src.getSeriesById : defaultGetSeriesById;
  var series = null;
  try {
    series = getSeriesById(seriesId);
  } catch (e) {
    series = null;
  }
  if (!series || typeof series !== 'object') {
    return { ok: false, reason: 'series_not_found', message: SCORE_REGISTER_READ_FAIL_MSG };
  }
  if (asString(series.seriesId) !== seriesId) {
    return { ok: false, reason: 'series_id_mismatch', message: SCORE_REGISTER_READ_FAIL_MSG };
  }
  var seriesToken = asString(series.publishToken);
  if (!seriesToken || seriesToken !== ctxToken) {
    return { ok: false, reason: 'publish_token_mismatch', message: SCORE_REGISTER_READ_FAIL_MSG };
  }

  var rounds = Array.isArray(series.rounds) ? series.rounds : [];
  var roundOk = false;
  for (var i = 0; i < rounds.length; i++) {
    if (
      asString(rounds[i] && rounds[i].roundId) === roundId &&
      asString(rounds[i] && rounds[i].matchId) === matchId
    ) {
      roundOk = true;
      break;
    }
  }
  if (!roundOk) {
    return { ok: false, reason: 'round_match_mismatch', message: SCORE_REGISTER_READ_FAIL_MSG };
  }

  var getIndexByMatchId =
    typeof src.getIndexByMatchId === 'function' ? src.getIndexByMatchId : defaultGetIndexByMatchId;
  var indexRow = null;
  try {
    indexRow = getIndexByMatchId(matchId);
  } catch (e2) {
    indexRow = null;
  }
  if (
    !indexRow ||
    typeof indexRow !== 'object' ||
    asString(indexRow.seriesId) !== seriesId ||
    asString(indexRow.roundId) !== roundId ||
    asString(indexRow.matchId) !== matchId
  ) {
    return { ok: false, reason: 'station_index_invalid', message: SCORE_REGISTER_READ_FAIL_MSG };
  }

  return {
    ok: true,
    series: series,
    match: match,
    seriesId: seriesId,
    roundId: roundId,
    matchId: matchId
  };
}

function collectPickNoRepeat(verified, src) {
  var input = src && typeof src === 'object' ? src : {};
  return seriesNoRepeatLineup.collectOtherRoundOccupancy({
    fromSeries: true,
    series: verified.series,
    seriesId: verified.seriesId,
    currentRoundId: verified.roundId,
    getMatchById: input.getMatchById,
    getIndexByMatchId: input.getIndexByMatchId
  });
}

function completeVerifiedPickRegisterSource(verified, src) {
  if (!verified || !verified.ok) {
    return verified || { ok: false, reason: 'unverified', message: STATION_DATA_INVALID_MSG };
  }
  var noRepeat = collectPickNoRepeat(verified, src);
  if (!noRepeat.ok) {
    return {
      ok: false,
      reason: noRepeat.reason,
      message: noRepeat.message || STATION_DATA_INVALID_MSG
    };
  }
  var projection = buildSeriesPickRegisterProjection(verified.series);
  return {
    ok: true,
    series: verified.series,
    match: verified.match,
    seriesId: verified.seriesId,
    roundId: verified.roundId,
    matchId: verified.matchId,
    registerInfo: projection.registerInfo,
    registerSubTabs: projection.registerSubTabs,
    emptyText: projection.emptyText,
    noRepeat: noRepeat
  };
}

function filterUsersByNoRepeat(users, noRepeat) {
  var list = Array.isArray(users) ? users : [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var user = list[i];
    var id = asString(user && (user.userId || user.playerId));
    var blocked = seriesNoRepeatLineup.shouldBlockNoRepeatAdd(id, noRepeat);
    if (blocked && blocked.blocked) continue;
    out.push(user);
  }
  return out;
}

function stampScoreSeriesRosterUsers(users, verified) {
  var list = Array.isArray(users) ? users : [];
  var seriesId = asString(verified && verified.seriesId);
  var roundId = asString(verified && verified.roundId);
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var user = list[i] && typeof list[i] === 'object' ? list[i] : {};
    out.push(
      Object.assign({}, user, {
        sourceKind: SOURCE_KIND_SERIES_ROSTER,
        seriesId: seriesId,
        roundId: roundId,
        seriesParticipantId: asString(user.seriesParticipantId),
        rosterEntryId: asString(user.rosterEntryId)
      })
    );
  }
  return out;
}

function assertUniqueRegisteredRosterPair(series, rosterEntryId, playerId) {
  var wantEntry = asString(rosterEntryId);
  var wantPlayer = asString(playerId);
  if (!wantEntry || !wantPlayer) {
    return { ok: false, reason: 'pick_identity_incomplete', message: SCORE_ROSTER_STALE_MSG };
  }
  var indexed = indexParticipants(series);
  var roster = Array.isArray(series && series.roster) ? series.roster : [];
  var byEntry = [];
  var pairHits = [];
  for (var i = 0; i < roster.length; i++) {
    var entry = roster[i];
    if (asString(entry && entry.rosterEntryId) !== wantEntry) continue;
    byEntry.push(entry);
    if (
      isRegisteredRosterEntry(entry, indexed.byId) &&
      resolveRosterPlayerId(entry) === wantPlayer
    ) {
      pairHits.push(entry);
    }
  }
  if (byEntry.length !== 1) {
    return { ok: false, reason: 'roster_entry_conflict', message: SCORE_ROSTER_STALE_MSG };
  }
  var status = asString(byEntry[0] && byEntry[0].registrationStatus).toLowerCase();
  if (status && status !== 'registered') {
    return { ok: false, reason: 'roster_cancelled', message: SCORE_ROSTER_STALE_MSG };
  }
  if (pairHits.length !== 1) {
    return { ok: false, reason: 'roster_player_conflict', message: SCORE_ROSTER_STALE_MSG };
  }
  return { ok: true, entry: pairHits[0] };
}

/**
 * 点击 Series roster 候选后的只读复核。不写 Series / Match。
 */
function assertScoreSeriesRosterPick(input) {
  var src = input && typeof input === 'object' ? input : {};
  var player = src.player && typeof src.player === 'object' ? src.player : null;
  if (!player || asString(player.sourceKind) !== SOURCE_KIND_SERIES_ROSTER) {
    return { ok: false, reason: 'not_series_roster_pick', message: SCORE_ROSTER_STALE_MSG };
  }

  var verified = verifyScoreSeriesStationIdentity(src);
  if (!verified.ok) {
    return {
      ok: false,
      reason: verified.reason || 'station_invalid',
      message: SCORE_ROSTER_STALE_MSG
    };
  }
  if (
    asString(player.seriesId) !== verified.seriesId ||
    asString(player.roundId) !== verified.roundId
  ) {
    return { ok: false, reason: 'pick_station_mismatch', message: SCORE_ROSTER_STALE_MSG };
  }

  var playerId = asString(player.playerId) || asString(player.userId);
  var unique = assertUniqueRegisteredRosterPair(
    verified.series,
    player.rosterEntryId,
    playerId
  );
  if (!unique.ok) return unique;

  var used = src.usedPlayerIds && typeof src.usedPlayerIds === 'object' ? src.usedPlayerIds : {};
  if (used[playerId]) {
    return { ok: false, reason: 'already_in_round', message: SCORE_ROSTER_STALE_MSG };
  }

  return {
    ok: true,
    wrote: false,
    series: verified.series,
    match: verified.match,
    seriesId: verified.seriesId,
    roundId: verified.roundId,
    matchId: verified.matchId,
    entry: unique.entry,
    bindPlayer: {
      playerId: playerId,
      userId: playerId,
      name:
        asString(player.matchNickname) ||
        asString(player.name) ||
        resolveRosterDisplayName(unique.entry) ||
        playerId,
      avatar: asString(player.avatar) || resolveRosterAvatar(unique.entry),
      gender: asString(player.gender) || resolveRosterGender(unique.entry),
      sourceKind: SOURCE_KIND_SERIES_ROSTER,
      seriesId: verified.seriesId,
      roundId: verified.roundId,
      seriesParticipantId: asString(unique.entry.seriesParticipantId),
      rosterEntryId: asString(unique.entry.rosterEntryId),
      source: 'register'
    }
  };
}

/**
 * 记分页报名列表数据源（只读）。
 * - 普通单场：match.registerInfo.users
 * - Series 分站：最新 series.roster 投影 + no-repeat 排除；失败不回退 registerInfo
 */
function loadScoreRegisterCandidates(input) {
  var src = input && typeof input === 'object' ? input : {};
  var match = src.match && typeof src.match === 'object' ? src.match : null;
  if (!match) {
    return { ok: false, reason: 'match_required', message: SCORE_REGISTER_READ_FAIL_MSG };
  }
  if (!looksLikeSeriesStation(match)) {
    var ordinary =
      match.registerInfo && Array.isArray(match.registerInfo.users) ? match.registerInfo.users : [];
    return {
      ok: true,
      kind: 'ordinary',
      users: ordinary,
      wrote: false
    };
  }

  var verified = verifyScoreSeriesStationIdentity(src);
  if (!verified.ok) {
    return {
      ok: false,
      reason: verified.reason,
      message: SCORE_REGISTER_READ_FAIL_MSG,
      kind: 'series'
    };
  }

  var noRepeat = collectPickNoRepeat(verified, src);
  if (!noRepeat || !noRepeat.ok) {
    return {
      ok: false,
      reason: (noRepeat && noRepeat.reason) || 'no_repeat_invalid',
      message: SCORE_REGISTER_READ_FAIL_MSG,
      kind: 'series'
    };
  }

  var projection = buildSeriesPickRegisterProjection(verified.series);
  var users = stampScoreSeriesRosterUsers(
    filterUsersByNoRepeat(projection.registerInfo.users, noRepeat),
    verified
  );
  return {
    ok: true,
    kind: 'series',
    users: users,
    noRepeat: noRepeat,
    seriesId: verified.seriesId,
    roundId: verified.roundId,
    matchId: verified.matchId,
    wrote: false
  };
}

module.exports = {
  STATION_DATA_INVALID_MSG: STATION_DATA_INVALID_MSG,
  SCORE_REGISTER_READ_FAIL_MSG: SCORE_REGISTER_READ_FAIL_MSG,
  looksLikeSeriesStation: looksLikeSeriesStation,
  indexParticipants: indexParticipants,
  resolveRosterPlayerId: resolveRosterPlayerId,
  resolveRosterDisplayName: resolveRosterDisplayName,
  isRegisteredRosterEntry: isRegisteredRosterEntry,
  hasValidSeriesAffiliation: hasValidSeriesAffiliation,
  needsAffiliationSelection: needsAffiliationSelection,
  buildSeriesPickRegisterProjection: buildSeriesPickRegisterProjection,
  verifyScoreSeriesStationIdentity: verifyScoreSeriesStationIdentity,
  completeVerifiedPickRegisterSource: completeVerifiedPickRegisterSource,
  filterUsersByNoRepeat: filterUsersByNoRepeat,
  loadScoreRegisterCandidates: loadScoreRegisterCandidates,
  stampScoreSeriesRosterUsers: stampScoreSeriesRosterUsers,
  assertScoreSeriesRosterPick: assertScoreSeriesRosterPick,
  SOURCE_KIND_SERIES_ROSTER: SOURCE_KIND_SERIES_ROSTER,
  SCORE_ROSTER_STALE_MSG: SCORE_ROSTER_STALE_MSG
};
