'use strict';

/**
 * 球队域可信仓储契约。
 *
 * 生产实现：cloudfunctions/teamClub（OPENID 鉴权 + 事务）。
 * 本地 `repository.js` 仅用于显式 development/test，不是云端安全边界。
 * 客户端 roles.derivePermissions 仅用于按钮显隐。
 *
 * 集合：
 *   team_clubs, team_members, team_applications, team_invites,
 *   team_notices, team_audits, team_club_migrations, team_club_idempotency,
   *   user_profiles, team_application_locks, team_match_refs,
   *   team_matches, team_match_scores
 */

var METHODS = [
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
  'updateMyProfile',
  'searchUsers',
  'listInvites',
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
  'completeMatch',
  'prepareShareInvite',
  'getInviteByToken',
  'acceptInvite'
];

module.exports = {
  METHODS: METHODS,
  EXTRA_METHODS: EXTRA_METHODS
};
