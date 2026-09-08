'use strict';

/**
 * 球队比赛正文：权限、索引投影、参与者提取。
 * team_matches 为权威；team_match_refs 仅由正文写入派生。
 */

function addId(map, raw) {
  var id = String(raw || '').trim();
  if (!id || id === 'me' || id === 'mock' || id === 'demo') return;
  map[id] = true;
}

function walkPlayers(list, map) {
  if (!Array.isArray(list)) return;
  list.forEach(function (p) {
    if (!p) return;
    if (typeof p === 'string' || typeof p === 'number') {
      addId(map, p);
      return;
    }
    addId(map, p.userId || p.playerId || p.id);
    if (Array.isArray(p.members)) walkPlayers(p.members, map);
  });
}

function collectParticipantUserIds(body) {
  var map = {};
  var b = body && typeof body === 'object' ? body : {};
  addId(map, b.createdBy);
  addId(map, b.creatorId);
  var users = b.registerInfo && Array.isArray(b.registerInfo.users) ? b.registerInfo.users : [];
  walkPlayers(users, map);
  (Array.isArray(b.groups) ? b.groups : []).forEach(function (g) {
    if (!g) return;
    walkPlayers(g.players, map);
    walkPlayers(g.playersSlots, map);
  });
  var pairings = b.pairings && typeof b.pairings === 'object' ? b.pairings : {};
  Object.keys(pairings).forEach(function (gid) {
    (pairings[gid] || []).forEach(function (row) {
      walkPlayers(row && row.playerIds, map);
    });
  });
  return Object.keys(map);
}

function deriveCloudStatus(body) {
  var s = String((body && body.status) || '').toLowerCase();
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'finished' || s === 'completed' || s === 'ended') return 'finished';
  if (s === 'live' || s === 'ongoing' || s === 'playing') return 'live';
  return 'scheduled';
}

function statusLabel(status) {
  if (status === 'finished') return '已结束';
  if (status === 'cancelled') return '已取消';
  if (status === 'live') return '进行中';
  return '未开始';
}

function wasMemberWhenCreated(member, createdAt) {
  if (!member) return false;
  var ts = Number(createdAt || 0);
  var joined = Number(member.joinedAt || 0);
  var left = Number(member.leftAt || 0);
  if (joined && ts && joined > ts) return false;
  if (left && ts && left <= ts) return false;
  if (member.memberStatus === 'active' && !left) return true;
  if (member.memberStatus === 'left' || member.memberStatus === 'removed') {
    return !!(joined && (!left || left >= ts));
  }
  return false;
}

function isActiveMember(member) {
  return !!(member && member.memberStatus === 'active' && !Number(member.leftAt || 0));
}

function canReadMatch(userId, member, matchDoc, team) {
  var uid = String(userId || '');
  if (!uid || !matchDoc) return false;
  if (String(matchDoc.creatorUserId || '') === uid) return true;
  var parts = Array.isArray(matchDoc.participantUserIds) ? matchDoc.participantUserIds : [];
  if (parts.indexOf(uid) >= 0) return true;
  var dissolved = !!(team && team.status === 'dissolved');
  if (dissolved) {
    if (isActiveMember(member)) return true;
    return wasMemberWhenCreated(member, matchDoc.createdAt);
  }
  if (isActiveMember(member)) {
    if (matchDoc.visibility === 'private') {
      var role = member && member.role;
      return role === 'super_admin' || role === 'admin';
    }
    return true;
  }
  return wasMemberWhenCreated(member, matchDoc.createdAt);
}

function writeAccess(userId, member, matchDoc, team) {
  var uid = String(userId || '');
  if (!uid || !matchDoc) return 'none';
  var dissolved = team && team.status === 'dissolved';
  var isCreator = String(matchDoc.creatorUserId || '') === uid;
  var isSuper = !!(member && member.role === 'super_admin' && isActiveMember(member));
  var isAdmin = !!(member && member.role === 'admin' && isActiveMember(member));
  if (dissolved) {
    if (isCreator || isSuper) return 'closeout';
    return 'none';
  }
  if (isCreator || isSuper || isAdmin) return 'full';
  return 'none';
}

function buildRefRow(matchDoc, now) {
  var body = matchDoc.body || {};
  var status = matchDoc.status || deriveCloudStatus(body);
  return {
    teamId: matchDoc.teamId,
    matchId: matchDoc.matchId,
    title: String(body.roundName || body.title || matchDoc.title || '球队比赛'),
    dateText: String(body.teeTime || body.dateText || matchDoc.dateText || ''),
    status: status,
    createdBy: matchDoc.creatorUserId,
    snapshot: {
      venue: String(body.courseName || ''),
      logo: String(body.teamLogo || body.matchLogo || ''),
      matchType: String(body.matchType || 'team-internal')
    },
    relationType: 'organizer',
    updatedAt: now || matchDoc.updatedAt,
    createdAt: matchDoc.createdAt,
    version: matchDoc.version,
    derivedFromMatch: true,
    scoreSummary: matchDoc.scoreSummary || null
  };
}

function isTeamInternalMatch(matchDoc) {
  var body = (matchDoc && matchDoc.body) || matchDoc || {};
  var t = String(body.matchType || matchDoc.matchType || 'team-internal').trim();
  return !t || t === 'team-internal';
}

function projectCard(matchDoc) {
  var body = matchDoc.body || {};
  var status = matchDoc.status || deriveCloudStatus(body);
  var matchId = String(matchDoc.matchId || '');
  return {
    canOpen: !!matchId,
    isDiagLinked: false,
    navHint: '',
    matchId: matchId,
    title: String(body.roundName || body.title || '球队比赛'),
    dateText: String(body.teeTime || body.teeTimeText || ''),
    venue: String(body.courseName || ''),
    logo: String(body.teamLogo || body.matchLogo || ''),
    relationType: 'organizer',
    relationLabel: '主办',
    status: status,
    statusLabel: statusLabel(status),
    matchType: String(body.matchType || 'team-internal'),
    matchTypeLabel: '队内赛',
    cloudSupported: true,
    navUrl: matchId
      ? '/subpackages/tournament/pages/detail/index?matchId=' + encodeURIComponent(matchId)
      : '',
    source: 'team_matches',
    createdBy: matchDoc.creatorUserId,
    updatedAt: matchDoc.updatedAt,
    version: matchDoc.version,
    teamId: matchDoc.teamId
  };
}

function toClientMatch(matchDoc) {
  var body = matchDoc.body && typeof matchDoc.body === 'object' ? matchDoc.body : {};
  var out = Object.assign({}, body);
  out.matchId = matchDoc.matchId;
  out.teamId = matchDoc.teamId;
  out.createdBy = matchDoc.creatorUserId;
  out.creatorId = matchDoc.creatorUserId;
  out.createdAt = matchDoc.createdAt;
  out.updatedAt = matchDoc.updatedAt;
  out.cloudVersion = matchDoc.version;
  out.version = matchDoc.version;
  out.status = body.status || matchDoc.status;
  out._cloudAuthority = true;
  out.scoreSchemaVersion = matchDoc.scoreSchemaVersion || 1;
  out.scoreSummary = matchDoc.scoreSummary || null;
  return out;
}

function isDemoMatchId(matchId) {
  var id = String(matchId || '');
  return id.indexOf('demo') >= 0 || id.indexOf('jiaobei') >= 0 || id === '1';
}

module.exports = {
  collectParticipantUserIds: collectParticipantUserIds,
  deriveCloudStatus: deriveCloudStatus,
  statusLabel: statusLabel,
  wasMemberWhenCreated: wasMemberWhenCreated,
  isActiveMember: isActiveMember,
  canReadMatch: canReadMatch,
  writeAccess: writeAccess,
  buildRefRow: buildRefRow,
  projectCard: projectCard,
  toClientMatch: toClientMatch,
  isDemoMatchId: isDemoMatchId,
  isTeamInternalMatch: isTeamInternalMatch
};
