'use strict';

var SCHEMA_VERSION = 1;
var ROLES = { SUPER_ADMIN: 'super_admin', ADMIN: 'admin', MEMBER: 'member' };
var TEAM_STATUS = { ACTIVE: 'active', DISSOLVED: 'dissolved' };
var APP_STATUS = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', CANCELLED: 'cancelled' };
var INVITE_STATUS = { ACTIVE: 'active', REVOKED: 'revoked', USED: 'used', EXPIRED: 'expired' };
var MEMBER_STATUS = { ACTIVE: 'active', LEFT: 'left', REMOVED: 'removed' };

function nowMs() {
  return Date.now();
}

function newId(prefix) {
  return String(prefix || 'id') + '_' + nowMs().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function randomInviteToken() {
  var hex = '';
  var i;
  for (i = 0; i < 32; i++) {
    hex += '0123456789abcdef'.charAt(Math.floor(Math.random() * 16));
  }
  return 'inv_' + nowMs().toString(36) + hex;
}

function normalizeRole(raw) {
  var r = String(raw || '').trim().toLowerCase();
  if (r === 'super_admin' || r === 'owner' || r === '超级管理员' || r === '创建者') return ROLES.SUPER_ADMIN;
  if (r === 'admin' || r === '管理员') return ROLES.ADMIN;
  return ROLES.MEMBER;
}

function createTeamRecord(input) {
  var ts = nowMs();
  var teamId = String(input.teamId || '').trim() || newId('team');
  var ownerUserId = String(input.ownerUserId || '').trim();
  return {
    teamId: teamId,
    schemaVersion: SCHEMA_VERSION,
    name: String(input.name || '').trim(),
    shortName: String(input.shortName || input.name || '').trim(),
    city: String(input.city || '').trim(),
    logo: String(input.logo || '').trim(),
    intro: String(input.intro || '').trim(),
    slogan: String(input.slogan || '').trim(),
    homeCourse: String(input.homeCourse || '').trim(),
    status: TEAM_STATUS.ACTIVE,
    ownerUserId: ownerUserId,
    createdAt: Number(input.createdAt) || ts,
    updatedAt: ts,
    version: 1,
    dissolvedAt: 0
  };
}

function createMemberRecord(input) {
  var ts = nowMs();
  var grants = Array.isArray(input.grants) ? input.grants.slice() : [];
  return {
    memberId: String(input.memberId || '').trim() || newId('tm'),
    teamId: String(input.teamId || '').trim(),
    userId: String(input.userId || '').trim(),
    displayName: String(input.displayName || '').trim(),
    avatar: String(input.avatar || '').trim(),
    role: normalizeRole(input.role),
    isCaptain: !!input.isCaptain,
    grants: grants,
    memberStatus: input.memberStatus || MEMBER_STATUS.ACTIVE,
    joinedAt: Number(input.joinedAt) || ts,
    updatedAt: ts
  };
}

function createApplicationRecord(input) {
  var ts = nowMs();
  return {
    applicationId: String(input.applicationId || '').trim() || newId('ja'),
    teamId: String(input.teamId || '').trim(),
    userId: String(input.userId || '').trim(),
    displayName: String(input.displayName || '').trim(),
    message: String(input.message || '').trim(),
    status: APP_STATUS.PENDING,
    version: 1,
    createdAt: ts,
    processedBy: '',
    processedAt: 0
  };
}

function createNoticeRecord(input) {
  var ts = nowMs();
  var nid = String(input.noticeId || input.id || '').trim() || newId('nt');
  return {
    noticeId: nid,
    id: nid,
    category: String(input.category || 'team_notice'),
    type: String(input.type || ''),
    teamId: String(input.teamId || '').trim(),
    applicationId: String(input.applicationId || '').trim(),
    recipientUserId: String(input.recipientUserId || '').trim(),
    title: String(input.title || '').trim(),
    summary: String(input.summary || '').trim(),
    createdAt: Number(input.createdAt) || ts,
    read: !!input.read,
    jump: input.jump || null
  };
}

function createEmptyStore() {
  return {
    schemaVersion: SCHEMA_VERSION,
    teams: [],
    members: [],
    applications: [],
    invites: [],
    notices: [],
    audits: [],
    matches: [],
    meta: {
      migratedAt: 0,
      sources: []
    }
  };
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  ROLES: ROLES,
  TEAM_STATUS: TEAM_STATUS,
  APP_STATUS: APP_STATUS,
  INVITE_STATUS: INVITE_STATUS,
  MEMBER_STATUS: MEMBER_STATUS,
  nowMs: nowMs,
  newId: newId,
  randomInviteToken: randomInviteToken,
  normalizeRole: normalizeRole,
  createTeamRecord: createTeamRecord,
  createMemberRecord: createMemberRecord,
  createApplicationRecord: createApplicationRecord,
  createNoticeRecord: createNoticeRecord,
  createEmptyStore: createEmptyStore
};
