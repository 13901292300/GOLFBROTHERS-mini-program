'use strict';

/**
 * 本地球队仓储。实现 repository.contract.js，不是云端安全边界。
 * 写操作必须在本层（未来在云函数）校验角色；页面 permissions 只用于显隐。
 */

var identity = require('./identity.js');
var model = require('./model.js');
var errors = require('./errors.js');
var migrate = require('./migrate.js');
var roles = require('./roles.js');

var STORAGE_KEY = 'gb_team_club_v1';
var DEFAULT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

var _cache = null;
var _nowFn = function () {
  return Date.now();
};

function nowMs() {
  return _nowFn();
}

function _wx() {
  return typeof wx !== 'undefined' && wx
    ? wx
    : { getStorageSync: function () { return null; }, setStorageSync: function () {} };
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function loadStore() {
  if (_cache) return _cache;
  var raw;
  try {
    raw = _wx().getStorageSync(STORAGE_KEY);
  } catch (e) {
    raw = null;
  }
  var store;
  if (raw && typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (e2) {
      raw = null;
    }
  }
  if (raw && typeof raw === 'object' && Array.isArray(raw.teams)) {
    store = raw;
    if (!Array.isArray(store.notices)) store.notices = [];
    if (!Array.isArray(store.applications)) store.applications = [];
    if (!Array.isArray(store.invites)) store.invites = [];
    if (!Array.isArray(store.members)) store.members = [];
    if (!Array.isArray(store.audits)) store.audits = [];
    if (!store.meta) store.meta = {};
  } else {
    store = model.createEmptyStore();
  }
  store = migrate.applyMigration(store);
  _cache = store;
  persist();
  return _cache;
}

function persist() {
  if (!_cache) return;
  try {
    _wx().setStorageSync(STORAGE_KEY, JSON.stringify(_cache));
  } catch (e) {
    /* ignore */
  }
}

function resetForTests() {
  _cache = model.createEmptyStore();
  persist();
}

function reloadFromStorage() {
  _cache = null;
  return loadStore();
}

function setNowMs(fnOrNumber) {
  if (typeof fnOrNumber === 'function') _nowFn = fnOrNumber;
  else {
    var n = Number(fnOrNumber);
    _nowFn = function () {
      return n;
    };
  }
}

function resetNow() {
  _nowFn = function () {
    return Date.now();
  };
}

function failAuth(auth) {
  if (auth && auth.code) {
    return errors.fail(auth.code, auth.message || auth.code);
  }
  var err = (auth && auth.error) || {};
  return errors.fail(err.code || 'need_login', err.message || '未登录');
}

function actorFromOptions() {
  return identity.requireUser();
}

function findTeam(store, teamId) {
  var id = String(teamId || '').trim();
  if (!id) return null;
  for (var i = 0; i < store.teams.length; i++) {
    if (store.teams[i] && store.teams[i].teamId === id) return store.teams[i];
  }
  return null;
}

function activeMembers(store, teamId) {
  var id = String(teamId || '').trim();
  return store.members.filter(function (m) {
    return m && m.teamId === id && m.memberStatus === model.MEMBER_STATUS.ACTIVE;
  });
}

function findMember(store, teamId, userId) {
  var uid = String(userId || '').trim();
  var list = store.members.filter(function (m) {
    return m && m.teamId === String(teamId) && m.userId === uid;
  });
  return list.length ? list[list.length - 1] : null;
}

function roleOf(store, teamId, userId) {
  var m = findMember(store, teamId, userId);
  if (!m || m.memberStatus !== model.MEMBER_STATUS.ACTIVE) return '';
  return m.role;
}

function bumpTeam(team, expectedVersion) {
  if (expectedVersion != null && Number(expectedVersion) !== Number(team.version)) {
    return errors.fail('conflict', 'version 冲突', { currentVersion: team.version });
  }
  team.version = Number(team.version || 1) + 1;
  team.updatedAt = nowMs();
  return null;
}

function audit(store, teamId, actorUserId, action, payload) {
  store.audits.push({
    auditId: model.newId('aud'),
    teamId: String(teamId || ''),
    actorUserId: String(actorUserId || ''),
    action: String(action || ''),
    payload: payload || {},
    createdAt: nowMs()
  });
}

function assertWritable(team) {
  if (!team) return errors.fail('not_found', '球队不存在');
  if (team.status === model.TEAM_STATUS.DISSOLVED) {
    return errors.fail('team_dissolved', '球队已解散');
  }
  return null;
}

function requireRole(store, teamId, userId, allowed) {
  var role = roleOf(store, teamId, userId);
  if (!role) return errors.fail('forbidden', '不是球队成员');
  if (allowed.indexOf(role) < 0) return errors.fail('forbidden', '权限不足');
  return null;
}

function memberGrants(m) {
  var grants = Array.isArray(m.grants) ? m.grants.slice() : [];
  if (m.role === model.ROLES.ADMIN && grants.indexOf(roles.PERMISSION_KEYS.TEAM_APPLICATION_REVIEW) < 0) {
    grants.push(roles.PERMISSION_KEYS.TEAM_APPLICATION_REVIEW);
  }
  return grants;
}

function actorCanReview(store, teamId, userId) {
  var m = findMember(store, teamId, userId);
  if (!m || m.memberStatus !== model.MEMBER_STATUS.ACTIVE) return false;
  return roles.canReviewTeamApplication(m.role, memberGrants(m));
}

function mapMemberView(m) {
  var tags = m.isCaptain ? [roles.TAGS.CAPTAIN] : [];
  var grants = memberGrants(m);
  return {
    id: m.memberId,
    memberId: m.memberId,
    teamId: m.teamId,
    userId: m.userId,
    displayName: m.displayName,
    nickname: '',
    avatar: m.avatar,
    role: m.role,
    roleLabel: roles.roleLabel(m.role),
    tags: tags,
    grants: grants,
    badges: roles.buildBadges(m.role, tags),
    joinedAt: m.joinedAt,
    status: m.memberStatus === model.MEMBER_STATUS.ACTIVE ? 'active' : m.memberStatus,
    memberStatus: m.memberStatus,
    isCaptain: !!m.isCaptain,
    sortPinyin: String(m.displayName || '').toLowerCase()
  };
}

function mapTeamView(store, team, viewerId) {
  var members = activeMembers(store, team.teamId);
  var mine = null;
  var uid = String(viewerId || '').trim();
  members.forEach(function (m) {
    if (m.userId === uid) mine = m;
  });
  var captain = '';
  members.forEach(function (m) {
    if (m.isCaptain) captain = m.userId;
  });
  var currentUserRole = mine ? mine.role : '';
  var permissions = mine
    ? roles.derivePermissions(currentUserRole, { isMember: true, grants: memberGrants(mine) })
    : roles.emptyPermissions();
  return {
    id: team.teamId,
    teamId: team.teamId,
    logo: team.logo,
    fullName: team.name,
    name: team.name,
    shortName: team.shortName,
    slogan: team.slogan || '',
    description: team.intro,
    foundedDate: '',
    foundedDateText: '',
    countryCode: '',
    countryName: '',
    provinceCode: '',
    provinceName: '',
    cityCode: '',
    cityName: team.city,
    city: team.city,
    region: team.city,
    regionText: team.city,
    memberCount: members.length,
    memberCountText: members.length + '人',
    captainMemberId: captain,
    acceptingMembers: true,
    isFormalMember: !!mine,
    currentUserRole: currentUserRole,
    currentUserTags: mine && mine.isCaptain ? [roles.TAGS.CAPTAIN] : [],
    permissions: permissions,
    badges: mine ? roles.buildBadges(mine.role, mine.isCaptain ? [roles.TAGS.CAPTAIN] : []) : [],
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
    version: team.version,
    status: team.status,
    ownerUserId: team.ownerUserId,
    schemaVersion: team.schemaVersion,
    organizationType: 'team'
  };
}

function toDirectoryTeam(store, team) {
  var members = activeMembers(store, team.teamId);
  var adminUserIds = [];
  members.forEach(function (m) {
    if (m.role === model.ROLES.SUPER_ADMIN || m.role === model.ROLES.ADMIN) {
      adminUserIds.push(m.userId);
    }
  });
  var roleLabel = '成员';
  return {
    id: team.teamId,
    name: team.name,
    fullName: team.name,
    shortName: team.shortName,
    logo: team.logo,
    region: team.city,
    memberCount: members.length,
    isMine: false,
    organizationType: 'team',
    adminUserIds: adminUserIds,
    createdBy: team.ownerUserId,
    role: roleLabel,
    status: team.status,
    version: team.version,
    updatedAt: team.updatedAt
  };
}

function listAllDirectoryTeams() {
  var store = loadStore();
  return store.teams
    .filter(function (t) {
      return t && t.status !== model.TEAM_STATUS.DISSOLVED;
    })
    .map(function (t) {
      return toDirectoryTeam(store, t);
    });
}

function peekTeam(teamId) {
  var store = loadStore();
  var team = findTeam(store, teamId);
  if (!team) return null;
  return toDirectoryTeam(store, team);
}

function peekMembers(teamId) {
  var store = loadStore();
  return activeMembers(store, teamId).map(function (m) {
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
      role: m.role === model.ROLES.SUPER_ADMIN ? 'owner' : m.role,
      memberStatus: 'active',
      joinedAt: m.joinedAt,
      isCaptain: !!m.isCaptain,
      source: 'team_club',
      pickChannel: 'team_members'
    };
  });
}

function listMyTeams(options) {
  var auth = actorFromOptions(options);
  if (!auth.ok) return failAuth(auth);
  var store = loadStore();
  var uid = auth.user.userId;
  var out = [];
  store.teams.forEach(function (team) {
    if (!team || team.status === model.TEAM_STATUS.DISSOLVED) return;
    var m = findMember(store, team.teamId, uid);
    if (!m || m.memberStatus !== model.MEMBER_STATUS.ACTIVE) return;
    out.push(mapTeamView(store, team, uid));
  });
  return errors.ok(out);
}

function getTeam(teamId, options) {
  var store = loadStore();
  var team = findTeam(store, teamId);
  if (!team) return errors.fail('not_found', '球队不存在');
  var viewer = '';
  var auth = actorFromOptions(options);
  if (auth.ok) viewer = auth.user.userId;
  return errors.ok(mapTeamView(store, team, viewer));
}

function createTeam(input, options) {
  var auth = actorFromOptions(options);
  if (!auth.ok) return failAuth(auth);
  var name = String((input && (input.name || input.fullName)) || '').trim();
  if (!name) return errors.fail('invalid_args', '球队名称不能为空');
  var clientOwner = String((input && (input.ownerUserId || input.createdBy || input.role)) || '');
  if (clientOwner && clientOwner !== auth.user.userId && String(input.ownerUserId || '')) {
    /* ignore untrusted ownerUserId */
  }
  var store = loadStore();
  var presetId = String((input && (input.teamId || input.id)) || '').trim();
  if (presetId && findTeam(store, presetId)) {
    return errors.fail('conflict', 'teamId 已存在');
  }
  var team = model.createTeamRecord({
    teamId: presetId,
    ownerUserId: auth.user.userId,
    name: name,
    shortName: String((input && input.shortName) || name).trim(),
    city: String((input && (input.city || input.region || input.cityName)) || '').trim(),
    logo: String((input && input.logo) || '').trim(),
    intro: String((input && (input.intro || input.desc || input.description)) || '').trim(),
    slogan: String((input && input.slogan) || '').trim(),
    homeCourse: String((input && input.homeCourse) || '').trim()
  });
  team.updatedAt = nowMs();
  var member = model.createMemberRecord({
    teamId: team.teamId,
    userId: auth.user.userId,
    displayName: auth.user.displayName,
    avatar: auth.user.avatar,
    role: model.ROLES.SUPER_ADMIN,
    isCaptain: true
  });
  store.teams.unshift(team);
  store.members.push(member);
  audit(store, team.teamId, auth.user.userId, 'create_team', { name: name });
  persist();
  return errors.ok(mapTeamView(store, team, auth.user.userId));
}

function updateTeam(teamId, patch, options) {
  var auth = actorFromOptions(options);
  if (!auth.ok) return failAuth(auth);
  var store = loadStore();
  var team = findTeam(store, teamId);
  var dead = assertWritable(team);
  if (dead) return dead;
  var denied = requireRole(store, team.teamId, auth.user.userId, [
    model.ROLES.SUPER_ADMIN,
    model.ROLES.ADMIN
  ]);
  if (denied) return denied;
  var conflict = bumpTeam(team, options && options.expectedVersion);
  if (conflict) return conflict;
  var p = patch || {};
  if (p.name != null) team.name = String(p.name).trim() || team.name;
  if (p.shortName != null) team.shortName = String(p.shortName).trim();
  if (p.city != null || p.region != null) team.city = String(p.city || p.region || '').trim();
  if (p.logo != null) team.logo = String(p.logo).trim();
  if (p.intro != null || p.desc != null) team.intro = String(p.intro || p.desc || '').trim();
  if (p.homeCourse != null) team.homeCourse = String(p.homeCourse).trim();
  audit(store, team.teamId, auth.user.userId, 'update_team', {});
  persist();
  return errors.ok(mapTeamView(store, team, auth.user.userId));
}

function listMembers(teamId, options) {
  var store = loadStore();
  var team = findTeam(store, teamId);
  if (!team) return errors.fail('not_found', '球队不存在');
  var keyword = String((options && options.keyword) || '')
    .trim()
    .toLowerCase();
  var list = activeMembers(store, teamId)
    .map(mapMemberView)
    .filter(function (m) {
      if (!keyword) return true;
      return String(m.displayName || '')
        .toLowerCase()
        .indexOf(keyword) >= 0;
    });
  return errors.ok(list);
}

function listApplications(teamId, options) {
  var auth = actorFromOptions(options);
  if (!auth.ok) return failAuth(auth);
  var store = loadStore();
  var team = findTeam(store, teamId);
  if (!team) return errors.fail('not_found', '球队不存在');
  var denied = requireRole(store, teamId, auth.user.userId, [
    model.ROLES.SUPER_ADMIN,
    model.ROLES.ADMIN
  ]);
  if (denied) return denied;
  var status = options && options.status;
  var list = store.applications.filter(function (a) {
    if (!a || a.teamId !== String(teamId)) return false;
    if (status && a.status !== status) return false;
    return true;
  });
  return errors.ok(list);
}

function pendingApplication(store, teamId, userId) {
  for (var i = 0; i < store.applications.length; i++) {
    var a = store.applications[i];
    if (
      a &&
      a.teamId === String(teamId) &&
      a.userId === String(userId) &&
      a.status === model.APP_STATUS.PENDING
    ) {
      return a;
    }
  }
  return null;
}

function createApplication(teamId, input, options) {
  var auth = actorFromOptions(options);
  if (!auth.ok) return failAuth(auth);
  var store = loadStore();
  var team = findTeam(store, teamId);
  var dead = assertWritable(team);
  if (dead) return dead;
  var existingMember = findMember(store, teamId, auth.user.userId);
  if (existingMember && existingMember.memberStatus === model.MEMBER_STATUS.ACTIVE) {
    return errors.fail('already_member', '已是球队成员');
  }
  if (pendingApplication(store, teamId, auth.user.userId)) {
    return errors.fail('already_pending', '已有待审核申请');
  }
  var app = model.createApplicationRecord({
    teamId: String(teamId),
    userId: auth.user.userId,
    displayName: auth.user.displayName,
    message: String((input && input.message) || '').trim()
  });
  store.applications.push(app);
  audit(store, teamId, auth.user.userId, 'create_application', { applicationId: app.applicationId });
  persist();
  return errors.ok(app);
}

function cancelApplication(applicationId, options) {
  var auth = actorFromOptions(options);
  if (!auth.ok) return failAuth(auth);
  var store = loadStore();
  var app = null;
  store.applications.forEach(function (a) {
    if (a && a.applicationId === String(applicationId)) app = a;
  });
  if (!app) return errors.fail('not_found', '申请不存在');
  if (app.userId !== auth.user.userId) return errors.fail('forbidden', '只能撤销自己的申请');
  var team = findTeam(store, app.teamId);
  var dead = assertWritable(team);
  if (dead) return dead;
  if (app.status !== model.APP_STATUS.PENDING) return errors.fail('conflict', '申请已处理');
  app.status = model.APP_STATUS.CANCELLED;
  persist();
  return errors.ok(app);
}

function reviewApplication(applicationId, decision, options) {
  var auth = actorFromOptions(options);
  if (!auth.ok) return failAuth(auth);
  var store = loadStore();
  var app = null;
  store.applications.forEach(function (a) {
    if (a && a.applicationId === String(applicationId)) app = a;
  });
  if (!app) return errors.fail('not_found', '申请不存在');
  var team = findTeam(store, app.teamId);
  var dead = assertWritable(team);
  if (dead) return dead;
  if (!actorCanReview(store, app.teamId, auth.user.userId)) {
    return errors.fail('forbidden', '无权审核');
  }
  var action = String(decision || '').trim();
  if (action !== 'approve' && action !== 'reject') return errors.fail('invalid_args', '未知决定');
  if (app.status !== model.APP_STATUS.PENDING) {
    var sameDecision =
      (app.status === model.APP_STATUS.APPROVED && action === 'approve') ||
      (app.status === model.APP_STATUS.REJECTED && action === 'reject');
    if (sameDecision && String(app.processedBy) === auth.user.userId) {
      return errors.ok(app);
    }
    return errors.fail('already_processed', '申请已处理');
  }
  var expectedVersion = Number(app.version || 1);
  app.processedBy = auth.user.userId;
  app.processedAt = nowMs();
  app.version = expectedVersion + 1;
  if (action === 'reject') {
    app.status = model.APP_STATUS.REJECTED;
    audit(store, app.teamId, auth.user.userId, 'reject_application', { applicationId: app.applicationId });
    persist();
    return errors.ok(app);
  }
  app.status = model.APP_STATUS.APPROVED;
  var add = addMemberInternal(store, app.teamId, {
    userId: app.userId,
    displayName: app.displayName,
    role: model.ROLES.MEMBER
  });
  if (!add.ok && add.code !== 'already_member') return add;
  audit(store, app.teamId, auth.user.userId, 'approve_application', { applicationId: app.applicationId });
  persist();
  return errors.ok(app);
}

function addMemberInternal(store, teamId, input) {
  var uid = String((input && input.userId) || '').trim();
  if (!uid || uid.toLowerCase() === 'me') return errors.fail('invalid_user', '非法用户');
  var existing = findMember(store, teamId, uid);
  if (existing && existing.memberStatus === model.MEMBER_STATUS.ACTIVE) {
    return errors.fail('already_member', '已是成员');
  }
  if (existing) {
    existing.memberStatus = model.MEMBER_STATUS.ACTIVE;
    existing.role = model.ROLES.MEMBER;
    existing.displayName = String((input && input.displayName) || existing.displayName || uid);
    existing.updatedAt = nowMs();
    return errors.ok(existing);
  }
  var row = model.createMemberRecord({
    teamId: teamId,
    userId: uid,
    displayName: String((input && input.displayName) || uid),
    avatar: String((input && input.avatar) || ''),
    role: model.ROLES.MEMBER,
    isCaptain: false
  });
  store.members.push(row);
  return errors.ok(row);
}

function addMember(teamId, userId, options) {
  var auth = actorFromOptions(options);
  if (!auth.ok) return failAuth(auth);
  var store = loadStore();
  var team = findTeam(store, teamId);
  var dead = assertWritable(team);
  if (dead) return dead;
  var denied = requireRole(store, teamId, auth.user.userId, [
    model.ROLES.SUPER_ADMIN,
    model.ROLES.ADMIN
  ]);
  if (denied) return denied;
  var clientRole = options && options.role;
  if (clientRole && model.normalizeRole(clientRole) === model.ROLES.SUPER_ADMIN) {
    /* ignore untrusted role */
  }
  var added = addMemberInternal(store, teamId, {
    userId: userId,
    displayName: (options && options.displayName) || String(userId)
  });
  if (!added.ok) return added;
  audit(store, teamId, auth.user.userId, 'add_member', { userId: String(userId) });
  persist();
  return added;
}

function removeMember(teamId, userId, options) {
  var auth = actorFromOptions(options);
  if (!auth.ok) return failAuth(auth);
  var store = loadStore();
  var team = findTeam(store, teamId);
  var dead = assertWritable(team);
  if (dead) return dead;
  var target = findMember(store, teamId, userId);
  if (!target || target.memberStatus !== model.MEMBER_STATUS.ACTIVE) {
    return errors.fail('not_found', '成员不存在');
  }
  if (target.role === model.ROLES.SUPER_ADMIN) {
    return errors.fail('forbidden', '不能移出超级管理员');
  }
  var actorRole = roleOf(store, teamId, auth.user.userId);
  if (actorRole !== model.ROLES.SUPER_ADMIN) {
    if (actorRole !== model.ROLES.ADMIN || target.role !== model.ROLES.MEMBER) {
      return errors.fail('forbidden', '无权移出该成员');
    }
  }
  target.memberStatus = model.MEMBER_STATUS.REMOVED;
  target.updatedAt = nowMs();
  if (target.isCaptain) target.isCaptain = false;
  bumpTeam(team);
  audit(store, teamId, auth.user.userId, 'remove_member', { userId: String(userId) });
  persist();
  return errors.ok(true);
}

function setAdmin(teamId, userId, makeAdmin, options) {
  var auth = actorFromOptions(options);
  if (!auth.ok) return failAuth(auth);
  var store = loadStore();
  var team = findTeam(store, teamId);
  var dead = assertWritable(team);
  if (dead) return dead;
  var denied = requireRole(store, teamId, auth.user.userId, [model.ROLES.SUPER_ADMIN]);
  if (denied) return denied;
  var target = findMember(store, teamId, userId);
  if (!target || target.memberStatus !== model.MEMBER_STATUS.ACTIVE) {
    return errors.fail('not_found', '成员不存在');
  }
  if (target.role === model.ROLES.SUPER_ADMIN) {
    return errors.fail('forbidden', '不能更改超级管理员角色');
  }
  target.role = makeAdmin ? model.ROLES.ADMIN : model.ROLES.MEMBER;
  target.grants = makeAdmin ? [roles.PERMISSION_KEYS.TEAM_APPLICATION_REVIEW] : [];
  target.updatedAt = nowMs();
  bumpTeam(team);
  persist();
  return errors.ok(mapMemberView(target));
}

function setCaptain(teamId, userId, options) {
  var auth = actorFromOptions(options);
  if (!auth.ok) return failAuth(auth);
  var store = loadStore();
  var team = findTeam(store, teamId);
  var dead = assertWritable(team);
  if (dead) return dead;
  var denied = requireRole(store, teamId, auth.user.userId, [model.ROLES.SUPER_ADMIN]);
  if (denied) return denied;
  var target = findMember(store, teamId, userId);
  if (!target || target.memberStatus !== model.MEMBER_STATUS.ACTIVE) {
    return errors.fail('not_found', '成员不存在');
  }
  activeMembers(store, teamId).forEach(function (m) {
    m.isCaptain = m.userId === String(userId);
  });
  bumpTeam(team);
  persist();
  return errors.ok(mapMemberView(target));
}

function unsetCaptain(teamId, userId, options) {
  var auth = actorFromOptions(options);
  if (!auth.ok) return failAuth(auth);
  var store = loadStore();
  var team = findTeam(store, teamId);
  var dead = assertWritable(team);
  if (dead) return dead;
  var denied = requireRole(store, teamId, auth.user.userId, [model.ROLES.SUPER_ADMIN]);
  if (denied) return denied;
  var target = findMember(store, teamId, userId);
  if (!target) return errors.fail('not_found', '成员不存在');
  target.isCaptain = false;
  bumpTeam(team);
  persist();
  return errors.ok(mapMemberView(target));
}

function transferOwnership(teamId, toUserId, options) {
  var auth = actorFromOptions(options);
  if (!auth.ok) return failAuth(auth);
  var store = loadStore();
  var team = findTeam(store, teamId);
  var dead = assertWritable(team);
  if (dead) return dead;
  var denied = requireRole(store, teamId, auth.user.userId, [model.ROLES.SUPER_ADMIN]);
  if (denied) return denied;
  var from = findMember(store, teamId, auth.user.userId);
  var to = findMember(store, teamId, toUserId);
  if (!to || to.memberStatus !== model.MEMBER_STATUS.ACTIVE) {
    return errors.fail('not_found', '目标不是活跃成员');
  }
  if (to.userId === from.userId) return errors.fail('invalid_args', '不能转让给自己');
  var conflict = bumpTeam(team, options && options.expectedVersion);
  if (conflict) return conflict;
  from.role = model.ROLES.ADMIN;
  to.role = model.ROLES.SUPER_ADMIN;
  team.ownerUserId = to.userId;
  audit(store, teamId, auth.user.userId, 'transfer_ownership', { toUserId: String(toUserId) });
  persist();
  return errors.ok(mapTeamView(store, team, auth.user.userId));
}

function leaveTeam(teamId, options) {
  var auth = actorFromOptions(options);
  if (!auth.ok) return failAuth(auth);
  var store = loadStore();
  var team = findTeam(store, teamId);
  var dead = assertWritable(team);
  if (dead) return dead;
  var me = findMember(store, teamId, auth.user.userId);
  if (!me || me.memberStatus !== model.MEMBER_STATUS.ACTIVE) {
    return errors.fail('not_found', '不是成员');
  }
  if (me.role === model.ROLES.SUPER_ADMIN) {
    return errors.fail('forbidden', '超级管理员需先转让或解散');
  }
  me.memberStatus = model.MEMBER_STATUS.LEFT;
  me.isCaptain = false;
  bumpTeam(team);
  persist();
  return errors.ok(true);
}

function dissolveTeam(teamId, options) {
  var auth = actorFromOptions(options);
  if (!auth.ok) return failAuth(auth);
  var store = loadStore();
  var team = findTeam(store, teamId);
  var dead = assertWritable(team);
  if (dead) return dead;
  var denied = requireRole(store, teamId, auth.user.userId, [model.ROLES.SUPER_ADMIN]);
  if (denied) return denied;
  var confirmName = String((options && (options.confirmName || options.teamName)) || '').trim();
  if (!confirmName || confirmName !== String(team.name || team.fullName || '').trim()) {
    return errors.fail('invalid_args', '请输入球队全称确认解散');
  }
  var conflict = bumpTeam(team, options && options.expectedVersion);
  if (conflict) return conflict;
  team.status = model.TEAM_STATUS.DISSOLVED;
  team.dissolvedAt = nowMs();
  audit(store, teamId, auth.user.userId, 'dissolve_team', {});
  persist();
  return errors.ok(true);
}

function createInvite(teamId, options) {
  var auth = actorFromOptions(options);
  if (!auth.ok) return failAuth(auth);
  var store = loadStore();
  var team = findTeam(store, teamId);
  var dead = assertWritable(team);
  if (dead) return dead;
  var denied = requireRole(store, teamId, auth.user.userId, [
    model.ROLES.SUPER_ADMIN,
    model.ROLES.ADMIN
  ]);
  if (denied) return denied;
  var ttl = Number((options && options.ttlMs) || DEFAULT_INVITE_TTL_MS);
  var invite = {
    inviteId: model.newId('inv'),
    token: model.randomInviteToken(),
    teamId: String(teamId),
    createdBy: auth.user.userId,
    status: model.INVITE_STATUS.ACTIVE,
    createdAt: nowMs(),
    expiresAt: nowMs() + ttl
  };
  store.invites.push(invite);
  persist();
  return errors.ok(invite);
}

function revokeInvite(tokenOrId, options) {
  var auth = actorFromOptions(options);
  if (!auth.ok) return failAuth(auth);
  var store = loadStore();
  var invite = findInvite(store, tokenOrId);
  if (!invite) return errors.fail('not_found', '邀请不存在');
  var denied = requireRole(store, invite.teamId, auth.user.userId, [
    model.ROLES.SUPER_ADMIN,
    model.ROLES.ADMIN
  ]);
  if (denied) return denied;
  var dead = assertWritable(findTeam(store, invite.teamId));
  if (dead) return dead;
  invite.status = model.INVITE_STATUS.REVOKED;
  persist();
  return errors.ok(invite);
}

function findInvite(store, tokenOrId) {
  var key = String(tokenOrId || '').trim();
  for (var i = 0; i < store.invites.length; i++) {
    var inv = store.invites[i];
    if (!inv) continue;
    if (inv.token === key || inv.inviteId === key) return inv;
  }
  return null;
}

function resolveInvite(token, options) {
  var auth = actorFromOptions(options);
  if (!auth.ok) return failAuth(auth);
  var store = loadStore();
  var invite = findInvite(store, token);
  if (!invite) return errors.fail('not_found', '邀请不存在');
  if (invite.status === model.INVITE_STATUS.REVOKED) {
    return errors.fail('invite_revoked', '邀请已撤销');
  }
  if (invite.status === model.INVITE_STATUS.USED) {
    return errors.fail('conflict', '邀请已使用');
  }
  if (nowMs() > Number(invite.expiresAt)) {
    invite.status = model.INVITE_STATUS.EXPIRED;
    persist();
    return errors.fail('invite_expired', '邀请已过期');
  }
  var team = findTeam(store, invite.teamId);
  var dead = assertWritable(team);
  if (dead) return dead;
  var added = addMemberInternal(store, invite.teamId, {
    userId: auth.user.userId,
    displayName: auth.user.displayName,
    avatar: auth.user.avatar
  });
  if (!added.ok && added.code !== 'already_member') return added;
  invite.status = model.INVITE_STATUS.USED;
  persist();
  return errors.ok(mapTeamView(store, team, auth.user.userId));
}

function clientMatchFromDoc(doc) {
  var body = doc && doc.body && typeof doc.body === 'object' ? doc.body : {};
  var out = Object.assign({}, body);
  out.matchId = doc.matchId;
  out.teamId = doc.teamId;
  out.createdBy = doc.creatorUserId;
  out.creatorId = doc.creatorUserId;
  out.createdAt = doc.createdAt;
  out.updatedAt = doc.updatedAt;
  out.cloudVersion = doc.version;
  out.version = doc.version;
  out.status = body.status || doc.status;
  out._cloudAuthority = true;
  return out;
}

function getMatch(matchId) {
  var id = String(matchId || '').trim();
  if (!id) return errors.fail('invalid_args', '缺少 matchId');
  var store = loadStore();
  var docs = store.matches || [];
  var doc = null;
  docs.forEach(function (row) {
    if (row && row.matchId === id) doc = row;
  });
  if (doc) return errors.ok(clientMatchFromDoc(doc));
  try {
    var local = require('../teamMatchStore.js').getMatchById(id);
    if (local) return errors.ok(local);
  } catch (e) {
    /* ignore */
  }
  return errors.fail('not_found', '比赛不存在');
}

function putMatch(payload) {
  var auth = identity.requireUser();
  if (!auth.ok) return auth;
  var body = (payload && (payload.match || payload.body || payload.matchSnapshot)) || {};
  var matchId = String((payload && payload.matchId) || body.matchId || '').trim();
  var teamId = String((payload && payload.teamId) || body.teamId || '').trim();
  var writeKind = String((payload && payload.writeKind) || '').trim();
  if (!matchId || !teamId) return errors.fail('invalid_args', '缺少 matchId 或 teamId');
  var store = loadStore();
  if (!store.matches) store.matches = [];
  var existing = null;
  store.matches.forEach(function (row) {
    if (row && row.matchId === matchId) existing = row;
  });
  var now = nowMs();
  var team = findTeam(store, teamId);
  if (!existing) {
    var dead = assertWritable(team);
    if (dead) return dead;
    var doc = {
      matchId: matchId,
      teamId: teamId,
      creatorUserId: auth.user.userId,
      createdAt: Number(body.createdAt || now),
      updatedAt: now,
      version: 1,
      status: body.status || 'scheduled',
      visibility: body.visibility === 'private' ? 'private' : 'team',
      participantUserIds: [],
      body: body
    };
    store.matches.push(doc);
    existing = doc;
  } else {
    if (String(existing.teamId) !== teamId) return errors.fail('forbidden', '比赛不属于该球队');
    var treatingCreate = writeKind !== 'full' && writeKind !== 'closeout' && writeKind !== 'score';
    if (treatingCreate && payload.expectedVersion == null) {
      return errors.ok(clientMatchFromDoc(existing));
    }
    var dissolved = team && team.status === model.TEAM_STATUS.DISSOLVED;
    if (dissolved && writeKind !== 'closeout' && existing.creatorUserId !== auth.user.userId) {
      return errors.fail('forbidden', '无权修改该比赛');
    }
    if (payload && payload.expectedVersion != null && Number(payload.expectedVersion) !== Number(existing.version)) {
      return errors.fail('conflict', 'version 冲突', { currentVersion: existing.version });
    }
    existing.body = Object.assign({}, existing.body || {}, body);
    existing.body.matchId = existing.matchId;
    existing.body.teamId = existing.teamId;
    existing.status = body.status || existing.status;
    existing.version = Number(existing.version || 1) + 1;
    existing.updatedAt = now;
  }
  upsertMatchRef({
    teamId: teamId,
    matchId: matchId,
    title: body.roundName || body.title || existing.body.roundName,
    dateText: body.teeTime || body.dateText || '',
    status: existing.status,
    snapshot: { venue: body.courseName || '', matchType: body.matchType || 'team-internal' }
  });
  persist();
  var client = clientMatchFromDoc(existing);
  try {
    require('../teamMatchStore.js').saveMatch(client, { cacheOnly: true });
  } catch (e2) {
    /* ignore */
  }
  return errors.ok(client);
}

function confirmMatchMigration(payload) {
  var snap = (payload && (payload.matchSnapshot || payload.match)) || {};
  var matchId = String(snap.matchId || (payload && payload.matchId) || '').trim();
  var teamId = String(snap.teamId || (payload && payload.teamId) || '').trim();
  if (!matchId || !teamId) return errors.fail('invalid_args', '缺少 matchId 或 teamId');
  if (matchId.indexOf('demo') >= 0 || /^(1|2|3|4|5)$/.test(teamId)) {
    return errors.fail('invalid_args', '拒绝导入演示比赛');
  }
  return putMatch({
    matchId: matchId,
    teamId: teamId,
    match: snap,
    operationId: String((payload && payload.migrationKey) || matchId)
  });
}

function listTeamMatches(teamId) {
  var id = String(teamId || '').trim();
  var out = [];
  try {
    var teamMatchStore = require('../teamMatchStore.js');
    var organized = (teamMatchStore.listMatches && teamMatchStore.listMatches()) || [];
    organized.forEach(function (match) {
      if (!match) return;
      if (String(match.teamId || '').trim() !== id) return;
      var type = String(match.matchType || '').trim();
      if (type && type !== 'team-internal') return;
      out.push({ match: match, relationType: 'organizer' });
    });
    return errors.ok(
      out.map(function (entry) {
        var match = entry.match;
        var matchId = String(match.matchId || '').trim();
        var card = teamMatchStore.toTournamentCard && teamMatchStore.toTournamentCard(match);
        return {
          canOpen: !!matchId,
          isDiagLinked: false,
          navHint: '',
          matchId: matchId,
          title: String((card && card.title) || match.roundName || '球队比赛'),
          dateText: String((card && card.dateText) || ''),
          venue: String((card && card.venue) || ''),
          logo: (card && card.clubLogo) || '',
          relationType: entry.relationType,
          relationLabel: entry.relationType === 'organizer' ? '主办' : '参赛',
          statusLabel: String((card && card.statusLabel) || ''),
          matchType: String(match.matchType || ''),
          matchTypeLabel: String((card && card.matchTypeLabel) || ''),
          navUrl: matchId
            ? '/subpackages/tournament/pages/detail/index?matchId=' + encodeURIComponent(matchId)
            : '',
          source: 'store'
        };
      })
    );
  } catch (e) {
    return errors.ok([]);
  }
}

function upsertMatchRef(payload) {
  var store = loadStore();
  if (!store.matchRefs) store.matchRefs = [];
  var teamId = String((payload && payload.teamId) || '').trim();
  var matchId = String((payload && (payload.matchId || payload.gameId)) || '').trim();
  if (!teamId || !matchId) return errors.fail('invalid_args', '缺少 teamId 或 matchId');
  var existing = null;
  store.matchRefs.forEach(function (row) {
    if (row && row.teamId === teamId && row.matchId === matchId) existing = row;
  });
  var now = nowMs();
  var row = {
    teamId: teamId,
    matchId: matchId,
    title: String((payload && payload.title) || (existing && existing.title) || '球队比赛'),
    dateText: String((payload && payload.dateText) || (existing && existing.dateText) || ''),
    status: String((payload && payload.status) || (existing && existing.status) || 'scheduled'),
    createdBy: existing ? existing.createdBy : (identity.currentUserIdOrEmpty() || ''),
    snapshot: (payload && payload.snapshot) || (existing && existing.snapshot) || {},
    relationType: (payload && payload.relationType) || (existing && existing.relationType) || 'organizer',
    updatedAt: now,
    createdAt: existing ? existing.createdAt : now,
    version: existing ? Number(existing.version || 1) + 1 : 1
  };
  store.matchRefs = store.matchRefs.filter(function (r) {
    return !(r && r.teamId === teamId && r.matchId === matchId);
  });
  store.matchRefs.push(row);
  persist();
  return errors.ok(row);
}

function listTeamsForUser(userId) {
  var uid = String(userId || '').trim();
  if (!uid || uid.toLowerCase() === 'me') return [];
  var store = loadStore();
  var out = [];
  store.teams.forEach(function (team) {
    if (!team || team.status === model.TEAM_STATUS.DISSOLVED) return;
    var m = findMember(store, team.teamId, uid);
    if (!m || m.memberStatus !== model.MEMBER_STATUS.ACTIVE) return;
    out.push({
      teamId: team.teamId,
      name: team.name,
      shortName: team.shortName,
      logo: team.logo,
      role: m.role === model.ROLES.SUPER_ADMIN ? 'owner' : m.role,
      memberStatus: 'active',
      joinedAt: m.joinedAt,
      organizationType: 'team'
    });
  });
  return out;
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  loadStore: loadStore,
  persist: persist,
  resetForTests: resetForTests,
  reloadFromStorage: reloadFromStorage,
  setNowMs: setNowMs,
  resetNow: resetNow,
  peekTeam: peekTeam,
  peekMembers: peekMembers,
  listAllDirectoryTeams: listAllDirectoryTeams,
  listMyTeams: listMyTeams,
  getTeam: getTeam,
  createTeam: createTeam,
  updateTeam: updateTeam,
  listMembers: listMembers,
  listApplications: listApplications,
  createApplication: createApplication,
  cancelApplication: cancelApplication,
  reviewApplication: reviewApplication,
  createInvite: createInvite,
  revokeInvite: revokeInvite,
  resolveInvite: resolveInvite,
  addMember: addMember,
  removeMember: removeMember,
  setAdmin: setAdmin,
  unsetAdmin: function (teamId, userId, options) {
    return setAdmin(teamId, userId, false, options);
  },
  setCaptain: setCaptain,
  unsetCaptain: unsetCaptain,
  transferOwnership: transferOwnership,
  leaveTeam: leaveTeam,
  dissolveTeam: dissolveTeam,
  listTeamMatches: listTeamMatches,
  getMatch: getMatch,
  putMatch: putMatch,
  confirmMatchMigration: confirmMatchMigration,
  upsertMatchRef: upsertMatchRef,
  listTeamsForUser: listTeamsForUser,
  mapTeamView: mapTeamView,
  mapMemberView: mapMemberView
};
