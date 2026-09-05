'use strict';

var factory = require('./repoFactory.js');
var snapshot = require('./snapshot.js');

function peekTeam(teamId) {
  if (factory.getMode() === 'local') {
    return require('./repository.js').peekTeam(teamId);
  }
  var fromSnap = snapshot.peekTeam(teamId);
  if (fromSnap) {
    return {
      id: fromSnap.id || fromSnap.teamId,
      name: fromSnap.name || fromSnap.fullName,
      fullName: fromSnap.fullName || fromSnap.name,
      shortName: fromSnap.shortName,
      logo: fromSnap.logo,
      region: fromSnap.region || fromSnap.city,
      memberCount: fromSnap.memberCount,
      organizationType: 'team',
      adminUserIds: [],
      createdBy: fromSnap.ownerUserId,
      role: fromSnap.currentUserRole === 'super_admin' ? 'owner' : fromSnap.currentUserRole || '成员',
      status: fromSnap.status,
      version: fromSnap.version,
      updatedAt: fromSnap.updatedAt,
      _stale: !!fromSnap._stale,
      _asOf: fromSnap._asOf || 0
    };
  }
  return null;
}

function peekMembers(teamId) {
  if (factory.getMode() === 'local') {
    return require('./repository.js').peekMembers(teamId);
  }
  return snapshot.peekMembers(teamId).map(function (m) {
    return {
      playerId: m.userId,
      userId: m.userId,
      name: m.displayName,
      competitionName: m.displayName,
      avatar: m.avatar,
      phone: '',
      gender: '',
      pinyin: m.displayName,
      teamId: m.teamId,
      role: m.role === 'super_admin' ? 'owner' : m.role,
      memberStatus: 'active',
      joinedAt: m.joinedAt,
      isCaptain: !!m.isCaptain,
      source: 'team_club',
      pickChannel: 'team_members'
    };
  });
}

function listAllDirectoryTeams() {
  if (factory.getMode() === 'local') {
    return require('./repository.js').listAllDirectoryTeams();
  }
  return snapshot.listTeams().map(function (t) {
    return peekTeam(t.teamId || t.id);
  }).filter(Boolean);
}

function listTeamsForUser(userId) {
  if (factory.getMode() === 'local') {
    return require('./repository.js').listTeamsForUser(userId);
  }
  return require('./cloudRepository.js').listTeamsForUser(userId);
}

function reloadFromStorage() {
  if (factory.getMode() === 'local') {
    return require('./repository.js').reloadFromStorage();
  }
  return snapshot.listTeams();
}

module.exports = {
  peekTeam: peekTeam,
  peekMembers: peekMembers,
  listAllDirectoryTeams: listAllDirectoryTeams,
  listTeamsForUser: listTeamsForUser,
  reloadFromStorage: reloadFromStorage,
  isSnapshotStale: function (teamId) {
    return require('./snapshot.js').isStale(teamId);
  }
};
