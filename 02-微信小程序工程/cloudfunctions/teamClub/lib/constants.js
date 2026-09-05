'use strict';

var COLLECTIONS = {
  CLUBS: 'team_clubs',
  MEMBERS: 'team_members',
  APPLICATIONS: 'team_applications',
  INVITES: 'team_invites',
  NOTICES: 'team_notices',
  AUDITS: 'team_audits',
  MIGRATIONS: 'team_club_migrations',
  IDEMPOTENCY: 'team_club_idempotency',
  PROFILES: 'user_profiles',
  PENDING_LOCKS: 'team_application_locks',
    MATCH_REFS: 'team_match_refs',
    MATCHES: 'team_matches',
    MATCH_SCORES: 'team_match_scores'
};

var ROLES = { SUPER_ADMIN: 'super_admin', ADMIN: 'admin', MEMBER: 'member' };
var TEAM_STATUS = { ACTIVE: 'active', DISSOLVED: 'dissolved' };
var APP_STATUS = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', CANCELLED: 'cancelled' };
var INVITE_STATUS = { ACTIVE: 'active', REVOKED: 'revoked', USED: 'used', EXPIRED: 'expired' };
var MEMBER_STATUS = { ACTIVE: 'active', LEFT: 'left', REMOVED: 'removed' };

var GRANT_REVIEW = 'team_application.review';
var DEFAULT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
var SCHEMA_VERSION = 1;

var CONTRACT_METHODS = [
  'listMyTeams',
  'getTeam',
  'createTeam',
  'updateTeam',
  'listMembers',
  'listApplications',
  'createApplication',
  'cancelApplication',
  'reviewApplication',
  'createInvite',
  'revokeInvite',
  'resolveInvite',
  'addMember',
  'removeMember',
  'setAdmin',
  'unsetAdmin',
  'setCaptain',
  'unsetCaptain',
  'transferOwnership',
  'leaveTeam',
  'dissolveTeam',
  'listTeamMatches'
];

var EXTRA_METHODS = [
  'resolveIdentity',
  'createMyProfile',
  'searchUsers',
  'listNotices',
  'getApplication',
  'confirmMigration',
  'upsertMatchRef',
  'putMatch',
  'getMatch',
  'confirmMatchMigration',
  'submitScore',
  'submitHoleScore',
  'updatePutt',
  'correctScore',
  'completeMatch'
];

function memberDocId(teamId, userId) {
  return String(teamId || '') + '__' + String(userId || '');
}

function pendingLockId(teamId, userId) {
  return 'pending__' + String(teamId || '') + '__' + String(userId || '');
}

function matchRefDocId(teamId, matchId) {
  return String(teamId || '') + '__' + String(matchId || '');
}

function scoreDocId(matchId, roundId, hole, entityKind, entityId) {
  return [String(matchId || ''), String(roundId || 'r1'), String(Number(hole) || 0), String(entityKind || 'player'), String(entityId || '')].join('__');
}

function normalizeRole(raw) {
  var r = String(raw || '').trim().toLowerCase();
  if (r === 'super_admin' || r === 'owner' || r === '超级管理员' || r === '创建者') return ROLES.SUPER_ADMIN;
  if (r === 'admin' || r === '管理员') return ROLES.ADMIN;
  return ROLES.MEMBER;
}

module.exports = {
  COLLECTIONS: COLLECTIONS,
  ROLES: ROLES,
  TEAM_STATUS: TEAM_STATUS,
  APP_STATUS: APP_STATUS,
  INVITE_STATUS: INVITE_STATUS,
  MEMBER_STATUS: MEMBER_STATUS,
  GRANT_REVIEW: GRANT_REVIEW,
  DEFAULT_INVITE_TTL_MS: DEFAULT_INVITE_TTL_MS,
  SCHEMA_VERSION: SCHEMA_VERSION,
  CONTRACT_METHODS: CONTRACT_METHODS,
  EXTRA_METHODS: EXTRA_METHODS,
  memberDocId: memberDocId,
  pendingLockId: pendingLockId,
  matchRefDocId: matchRefDocId,
  scoreDocId: scoreDocId,
  normalizeRole: normalizeRole
};
