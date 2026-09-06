'use strict';

var C = require('./constants.js');

function canReviewTeamApplication(role) {
  var r = C.normalizeRole(role);
  return r === C.ROLES.SUPER_ADMIN || r === C.ROLES.ADMIN;
}

function emptyPermissions() {
  return {
    canEditTeamProfile: false,
    canInviteMember: false,
    canCreateTeamMatch: false,
    canManageAdmins: false,
    canTransferSuperAdmin: false,
    canSetCaptain: false,
    canRemoveMember: false,
    canRemoveOrdinaryMember: false,
    canReviewJoinRequests: false,
    canShareTeam: false
  };
}

function derivePermissions(role, isMember) {
  if (isMember === false) return emptyPermissions();
  var r = C.normalizeRole(role);
  var isSuper = r === C.ROLES.SUPER_ADMIN;
  var isAdmin = r === C.ROLES.ADMIN;
  var canManage = isSuper || isAdmin;
  return {
    canEditTeamProfile: canManage,
    canInviteMember: canManage,
    canCreateTeamMatch: canManage,
    canManageAdmins: isSuper,
    canTransferSuperAdmin: isSuper,
    canSetCaptain: isSuper,
    canRemoveMember: isSuper,
    canRemoveOrdinaryMember: canManage,
    canReviewJoinRequests: canReviewTeamApplication(r),
    canShareTeam: canManage
  };
}

function memberGrants(member) {
  var grants = Array.isArray(member && member.grants) ? member.grants.slice() : [];
  if (member && member.role === C.ROLES.ADMIN && grants.indexOf(C.GRANT_REVIEW) < 0) {
    grants.push(C.GRANT_REVIEW);
  }
  return grants;
}

module.exports = {
  canReviewTeamApplication: canReviewTeamApplication,
  emptyPermissions: emptyPermissions,
  derivePermissions: derivePermissions,
  memberGrants: memberGrants
};
