'use strict';

/**
 * 生产云仓储。只通过云函数 teamClub 访问，不直写集合，不回落本地。
 */

var errors = require('./errors.js');
var snapshot = require('./snapshot.js');
var identity = require('./identity.js');
var cloudEnv = require('./cloudEnv.js');

function callCloud(action, payload) {
  var route = cloudEnv.resolveTeamClubCloud();
  cloudEnv.logRoute(action, route);
  if (!route.ok) {
    return Promise.resolve(errors.fail(route.code, route.message));
  }
  if (typeof wx === 'undefined' || !wx.cloud || typeof wx.cloud.callFunction !== 'function') {
    return Promise.resolve(errors.fail('service_unavailable', '云服务不可用'));
  }
  return wx
    .cloud.callFunction({
      name: cloudEnv.FUNCTION_NAME,
      config: { env: route.envId },
      data: {
        action: action,
        payload: payload || {}
      }
    })
    .then(function (res) {
      var result = res && res.result;
      if (!result) return errors.fail('cloud_error', '云服务返回为空');
      snapshot.applyResult(action, result);
      if (result.ok && result.data && result.data.user && result.data.source === 'cloud') {
        identity.writeSession(result.data.user);
      }
      if (result.ok && action === 'createMyProfile' && result.data) {
        identity.writeSession(result.data);
      }
      return result;
    })
    .catch(function () {
      try {
        snapshot.markStale();
      } catch (e) {
        /* ignore */
      }
      return errors.fail('network_error', '网络异常，请稍后重试');
    });
}

function invoke(name, payload) {
  return callCloud(name, payload);
}

module.exports = {
  listMyTeams: function (options) {
    return invoke('listMyTeams', options || {});
  },
  getTeam: function (teamId) {
    return invoke('getTeam', { teamId: teamId });
  },
  createTeam: function (input) {
    return invoke('createTeam', input || {});
  },
  updateTeam: function (teamId, patch, options) {
    return invoke('updateTeam', Object.assign({}, patch || {}, { teamId: teamId }, options || {}));
  },
  listMembers: function (teamId, options) {
    return invoke('listMembers', Object.assign({ teamId: teamId }, options || {})).then(function (res) {
      if (res && res.ok) snapshot.putMembers(teamId, res.data || []);
      return res;
    });
  },
  listApplications: function (teamId, options) {
    return invoke('listApplications', Object.assign({ teamId: teamId }, options || {}));
  },
  createApplication: function (teamId, input) {
    return invoke('createApplication', Object.assign({}, input || {}, { teamId: teamId }));
  },
  cancelApplication: function (applicationId) {
    return invoke('cancelApplication', { applicationId: applicationId });
  },
  reviewApplication: function (applicationId, decision) {
    return invoke('reviewApplication', { applicationId: applicationId, decision: decision });
  },
  createInvite: function (teamId, options) {
    return invoke('createInvite', Object.assign({ teamId: teamId }, options || {}));
  },
  prepareShareInvite: function (teamId, options) {
    return invoke('prepareShareInvite', Object.assign({ teamId: teamId }, options || {}));
  },
  getInviteByToken: function (token) {
    return invoke('getInviteByToken', { token: token });
  },
  acceptInvite: function (token) {
    return invoke('acceptInvite', { token: token });
  },
  revokeInvite: function (tokenOrId) {
    return invoke('revokeInvite', { token: tokenOrId, inviteId: tokenOrId });
  },
  resolveInvite: function (token) {
    return invoke('resolveInvite', { token: token });
  },
  addMember: function (teamId, userId, options) {
    return invoke('addMember', Object.assign({}, options || {}, { teamId: teamId, targetUserId: userId }));
  },
  removeMember: function (teamId, userId) {
    return invoke('removeMember', { teamId: teamId, targetUserId: userId });
  },
  setAdmin: function (teamId, userId, makeAdmin) {
    return invoke(makeAdmin === false ? 'unsetAdmin' : 'setAdmin', {
      teamId: teamId,
      targetUserId: userId
    });
  },
  unsetAdmin: function (teamId, userId) {
    return invoke('unsetAdmin', { teamId: teamId, targetUserId: userId });
  },
  setCaptain: function (teamId, userId) {
    return invoke('setCaptain', { teamId: teamId, targetUserId: userId });
  },
  unsetCaptain: function (teamId, userId) {
    return invoke('unsetCaptain', { teamId: teamId, targetUserId: userId });
  },
  transferOwnership: function (teamId, toUserId, options) {
    return invoke('transferOwnership', Object.assign({ teamId: teamId, toUserId: toUserId }, options || {}));
  },
  leaveTeam: function (teamId) {
    return invoke('leaveTeam', { teamId: teamId });
  },
  dissolveTeam: function (teamId, options) {
    return invoke('dissolveTeam', Object.assign({ teamId: teamId }, options || {}));
  },
  listTeamMatches: function (teamId, options) {
    return invoke('listTeamMatches', Object.assign({ teamId: teamId }, options || {}));
  },
  upsertMatchRef: function (payload) {
    return invoke('upsertMatchRef', payload || {});
  },
  putMatch: function (payload) {
    return invoke('putMatch', payload || {});
  },
  getMatch: function (matchId) {
    return invoke('getMatch', { matchId: matchId });
  },
  submitScore: function (payload) {
    return invoke('submitScore', payload || {});
  },
  submitHoleScore: function (payload) {
    return invoke('submitHoleScore', payload || {});
  },
  updatePutt: function (payload) {
    return invoke('updatePutt', payload || {});
  },
  correctScore: function (payload) {
    return invoke('correctScore', payload || {});
  },
  completeMatch: function (payload) {
    return invoke('completeMatch', payload || {});
  },
  confirmMatchMigration: function (payload) {
    return invoke('confirmMatchMigration', payload || {});
  },
  resolveIdentity: function () {
    return invoke('resolveIdentity', {});
  },
  createMyProfile: function (input) {
    return invoke('createMyProfile', input || {});
  },
  searchUsers: function (query, options) {
    return invoke('searchUsers', Object.assign({ query: query }, options || {}));
  },
  listNotices: function (options) {
    return invoke('listNotices', options || {});
  },
  listInvites: function (teamId, options) {
    return invoke('listInvites', Object.assign({ teamId: teamId }, options || {}));
  },
  getApplication: function (applicationId) {
    return invoke('getApplication', { applicationId: applicationId });
  },
  confirmMigration: function (payload) {
    return invoke('confirmMigration', payload || {});
  },
  peekTeam: function (teamId) {
    return snapshot.peekTeam(teamId);
  },
  peekMembers: function (teamId) {
    return snapshot.peekMembers(teamId);
  },
  listAllDirectoryTeams: function () {
    return snapshot.listTeams();
  },
  listTeamsForUser: function () {
    return snapshot.listTeams().map(function (t) {
      return {
        teamId: t.teamId || t.id,
        name: t.name || t.fullName,
        shortName: t.shortName,
        logo: t.logo,
        role: t.currentUserRole === 'super_admin' ? 'owner' : t.currentUserRole,
        memberStatus: 'active',
        organizationType: 'team'
      };
    });
  },
  reloadFromStorage: function () {
    return snapshot.listTeams();
  },
  prepareTeamAssetUpload: function (payload) {
    return invoke('prepareTeamAssetUpload', payload || {});
  },
  purgeTeamAssetOrphans: function (payload) {
    return invoke('purgeTeamAssetOrphans', payload || {});
  }
};
