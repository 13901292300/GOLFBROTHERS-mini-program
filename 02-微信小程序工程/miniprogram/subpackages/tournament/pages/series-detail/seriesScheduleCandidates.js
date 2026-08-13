/**
 * Series 赛程 TAB：选人候选与归属选项
 * - 大名单优先但非硬门槛；不写 series.roster
 * - 归属：组织型→参赛球队；队内→分队
 */

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function resolveHostParticipantKind(series) {
  var hostMode = asString(series && series.hostMode);
  return hostMode === 'team' ? 'division' : 'team';
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

/**
 * 归属选项
 * - organization：participants kind=team
 * - team：participants kind=division
 */
function listAffiliationOptions(series) {
  var kind = resolveHostParticipantKind(series);
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  var out = [];
  var seen = Object.create(null);
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (!p || typeof p !== 'object') continue;
    if (asString(p.kind) !== kind) continue;
    var seriesParticipantId = asString(p.seriesParticipantId);
    var sourceTeamId = asString(p.sourceTeamId);
    var divisionId = asString(p.divisionId);
    // 与分站 teamGroups.id 口径对齐：org 用 sourceTeamId；team 用 divisionId
    var id =
      kind === 'team'
        ? sourceTeamId || seriesParticipantId
        : divisionId || seriesParticipantId.replace(/^division:/, '') || seriesParticipantId;
    if (!id || seen[id]) continue;
    seen[id] = true;
    out.push({
      id: id,
      seriesParticipantId: seriesParticipantId,
      kind: kind,
      sourceTeamId: sourceTeamId,
      divisionId: divisionId,
      name: resolveParticipantDisplayName(p),
      shortName: asString(p.shortNameSnapshot) || resolveParticipantDisplayName(p),
      logo: asString(p.logoSnapshot)
    });
  }
  return out;
}

/**
 * @returns {{ ok: boolean, reason?: string, option?: object }}
 */
function assertAffiliationChoice(series, affiliationId) {
  var id = asString(affiliationId);
  if (!id) {
    return { ok: false, reason: 'affiliation_required' };
  }
  var options = listAffiliationOptions(series);
  for (var i = 0; i < options.length; i++) {
    var opt = options[i];
    if (
      asString(opt.id) === id ||
      asString(opt.seriesParticipantId) === id ||
      asString(opt.sourceTeamId) === id ||
      asString(opt.divisionId) === id
    ) {
      return { ok: true, option: opt };
    }
  }
  return { ok: false, reason: 'affiliation_invalid' };
}

function markUsed(list, usedPlayerIds) {
  var used = Object.create(null);
  var ids = Array.isArray(usedPlayerIds) ? usedPlayerIds : [];
  for (var i = 0; i < ids.length; i++) {
    var uid = asString(ids[i]);
    if (uid) used[uid] = true;
  }
  return (Array.isArray(list) ? list : []).map(function (item) {
    var playerId = asString(item && item.playerId);
    return Object.assign({}, item, {
      used: !!(playerId && used[playerId])
    });
  });
}

function dedupeByPlayerId(list) {
  var seen = Object.create(null);
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    var id = asString(item && item.playerId);
    if (!id || seen[id]) continue;
    seen[id] = true;
    out.push(item);
  }
  return out;
}

function mapRosterCandidates(series) {
  var roster = Array.isArray(series && series.roster) ? series.roster : [];
  var out = [];
  for (var i = 0; i < roster.length; i++) {
    var e = roster[i];
    if (!e) continue;
    if (asString(e.registrationStatus).toLowerCase() === 'cancelled') continue;
    var playerId = asString(e.playerId) || asString(e.userId);
    if (!playerId) continue;
    out.push({
      playerId: playerId,
      name:
        asString(e.playerNameSnapshot) ||
        asString(e.displayName) ||
        asString(e.competitionName) ||
        asString(e.nickname) ||
        playerId,
      avatar: asString(e.playerAvatarSnapshot) || asString(e.avatar),
      handicap: e.handicapSnapshot != null ? e.handicapSnapshot : e.handicap,
      gender: asString(e.genderSnapshot) || asString(e.gender),
      suggestedParticipantId: asString(e.seriesParticipantId),
      source: 'roster'
    });
  }
  return out;
}

function mapTeamMemberCandidates(match, getTeamMembers) {
  if (typeof getTeamMembers !== 'function') return [];
  var groups = Array.isArray(match && match.teamGroups) ? match.teamGroups : [];
  var out = [];
  var seenTeam = Object.create(null);
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i] || {};
    var sourceTeamId = asString(g.sourceTeamId);
    if (!sourceTeamId || seenTeam[sourceTeamId]) continue;
    seenTeam[sourceTeamId] = true;
    var members = [];
    try {
      members = getTeamMembers(sourceTeamId) || [];
    } catch (e) {
      members = [];
    }
    if (!Array.isArray(members)) continue;
    for (var j = 0; j < members.length; j++) {
      var m = members[j];
      if (!m) continue;
      var playerId = asString(m.userId) || asString(m.playerId) || asString(m.id);
      if (!playerId) continue;
      out.push({
        playerId: playerId,
        name:
          asString(m.displayName) ||
          asString(m.competitionName) ||
          asString(m.nickname) ||
          asString(m.name) ||
          playerId,
        avatar: asString(m.avatar),
        handicap: m.handicap,
        gender: asString(m.gender),
        suggestedParticipantId: '',
        sourceTeamId: sourceTeamId,
        source: 'team'
      });
    }
  }
  return out;
}

function mapFriendCandidates(listFriends) {
  if (typeof listFriends !== 'function') return [];
  var friends = [];
  try {
    friends = listFriends() || [];
  } catch (e) {
    friends = [];
  }
  if (!Array.isArray(friends)) return [];
  var out = [];
  for (var i = 0; i < friends.length; i++) {
    var f = friends[i];
    if (!f) continue;
    var playerId = asString(f.userId) || asString(f.playerId) || asString(f.id);
    if (!playerId) continue;
    out.push({
      playerId: playerId,
      name:
        asString(f.displayName) ||
        asString(f.nickname) ||
        asString(f.name) ||
        playerId,
      avatar: asString(f.avatar),
      handicap: f.handicap,
      gender: asString(f.gender),
      suggestedParticipantId: '',
      source: 'friend'
    });
  }
  return out;
}

/**
 * @param {object} input
 * @param {object} input.series
 * @param {object} [input.match]
 * @param {'roster'|'team'|'friend'|'manual'} input.source
 * @param {Array<string>} [input.usedPlayerIds]
 * @param {Function} [input.getTeamMembers]
 * @param {Function} [input.listFriends]
 */
function listScheduleCandidatePlayers(input) {
  var src = input && typeof input === 'object' ? input : {};
  var source = asString(src.source) || 'roster';
  if (source === 'manual') {
    return [];
  }

  var raw = [];
  if (source === 'roster') {
    raw = mapRosterCandidates(src.series);
  } else if (source === 'team') {
    raw = mapTeamMemberCandidates(src.match, src.getTeamMembers);
  } else if (source === 'friend') {
    raw = mapFriendCandidates(src.listFriends);
  }

  return markUsed(dedupeByPlayerId(raw), src.usedPlayerIds);
}

module.exports = {
  listScheduleCandidatePlayers: listScheduleCandidatePlayers,
  listAffiliationOptions: listAffiliationOptions,
  assertAffiliationChoice: assertAffiliationChoice,
  resolveHostParticipantKind: resolveHostParticipantKind
};
