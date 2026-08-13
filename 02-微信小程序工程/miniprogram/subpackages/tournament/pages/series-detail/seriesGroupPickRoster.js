/**
 * Series → group-pick「已报名人员」只读投影
 * - 数据源：series.roster（非 match.registerInfo）
 * - 不写 Series / 不写 match.registerInfo
 */

var seriesStore = require('../../../../utils/seriesStore.js');
var seriesStationIndex = require('../../../../utils/seriesStationIndex.js');
var seriesScheduleGroupWrite = require('./seriesScheduleGroupWrite.js');

var STATION_DATA_INVALID_MSG =
  seriesScheduleGroupWrite.STATION_DATA_INVALID_MSG || '本轮比赛数据异常';

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

/**
 * 合法 roster 归属 → 不弹归属选择；非 roster / 归属失效 → 须手选
 */
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

function verifySeriesPickContext(input) {
  var src = input && typeof input === 'object' ? input : {};
  if (!(src.fromSeries === true || src.fromSeries === 1 || String(src.fromSeries) === '1')) {
    return { ok: false, reason: 'not_from_series', message: STATION_DATA_INVALID_MSG };
  }
  var seriesId = asString(src.seriesId);
  var roundId = asString(src.roundId);
  var matchId = asString(src.matchId);
  var match = src.match || null;
  var series =
    src.series ||
    (seriesId && typeof seriesStore.getSeriesById === 'function'
      ? seriesStore.getSeriesById(seriesId)
      : null);
  if (!seriesId || !roundId || !matchId || !match || !series) {
    return { ok: false, reason: 'args_required', message: STATION_DATA_INVALID_MSG };
  }
  if (asString(series.seriesId) !== seriesId) {
    return { ok: false, reason: 'series_id_mismatch', message: STATION_DATA_INVALID_MSG };
  }
  var getIndexByMatchId =
    typeof src.getIndexByMatchId === 'function'
      ? src.getIndexByMatchId
      : function (id) {
          return seriesStationIndex.getByMatchId(id);
        };
  var check = seriesScheduleGroupWrite.verifySeriesContext(match, series, {
    roundId: roundId,
    getIndexByMatchId: getIndexByMatchId
  });
  if (!check || !check.ok) {
    return {
      ok: false,
      reason: (check && check.reason) || 'context_invalid',
      message: STATION_DATA_INVALID_MSG
    };
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

function loadSeriesPickRegisterSource(input) {
  var verified = verifySeriesPickContext(input);
  if (!verified.ok) return verified;
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
    emptyText: projection.emptyText
  };
}

module.exports = {
  STATION_DATA_INVALID_MSG: STATION_DATA_INVALID_MSG,
  verifySeriesPickContext: verifySeriesPickContext,
  buildSeriesPickRegisterProjection: buildSeriesPickRegisterProjection,
  loadSeriesPickRegisterSource: loadSeriesPickRegisterSource,
  needsAffiliationSelection: needsAffiliationSelection,
  hasValidSeriesAffiliation: hasValidSeriesAffiliation,
  resolveRosterPlayerId: resolveRosterPlayerId,
  resolveRosterDisplayName: resolveRosterDisplayName
};
