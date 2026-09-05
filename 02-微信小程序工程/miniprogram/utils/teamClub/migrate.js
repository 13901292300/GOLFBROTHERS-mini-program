'use strict';

var model = require('./model.js');
var CREATED_TEAMS_STORAGE_KEY = 'gb_created_teams_v1';

function _wx() {
  return typeof wx !== 'undefined' && wx
    ? wx
    : { getStorageSync: function () { return null; }, setStorageSync: function () {} };
}

function isEventOrg(rec) {
  var t = String((rec && rec.organizationType) || '').trim().toLowerCase();
  return t === 'event_org' || t === 'event_organization' || t === '赛事机构';
}

function readCreatedTeamsRaw() {
  var raw;
  try {
    raw = _wx().getStorageSync(CREATED_TEAMS_STORAGE_KEY);
  } catch (e) {
    raw = null;
  }
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.teams)) return raw.teams;
  return [];
}

function readMatchTeamIds() {
  var ids = {};
  try {
    var teamMatchStore = require('../teamMatchStore.js');
    var list = (teamMatchStore.listMatches && teamMatchStore.listMatches()) || [];
    list.forEach(function (m) {
      if (!m) return;
      var tid = String(m.teamId || '').trim();
      if (tid) ids[tid] = true;
      if (Array.isArray(m.participatingTeamIds)) {
        m.participatingTeamIds.forEach(function (x) {
          var s = String(x || '').trim();
          if (s) ids[s] = true;
        });
      }
    });
  } catch (e) {
    /* ignore */
  }
  return Object.keys(ids);
}

function readDirectoryClubSeeds() {
  try {
    var teamDirectory = require('../teamDirectory.js');
    var list = teamDirectory.TEAMS || [];
    return list.filter(function (t) {
      return t && !isEventOrg(t);
    });
  } catch (e) {
    return [];
  }
}

function toMember(teamId, raw, index, fallbackRole) {
  var uid = String((raw && (raw.userId || raw.playerId || raw.id)) || '').trim();
  if (!uid || uid.toLowerCase() === 'me') return null;
  var role = model.normalizeRole((raw && raw.role) || fallbackRole || model.ROLES.MEMBER);
  var tags = raw && Array.isArray(raw.tags) ? raw.tags : [];
  var isCaptain = !!(raw && (raw.isCaptain || (tags.indexOf && tags.indexOf('captain') >= 0)));
  if (String((raw && raw.role) || '').indexOf('队长') >= 0) isCaptain = true;
  return model.createMemberRecord({
    memberId: String((raw && (raw.memberId || raw.id)) || '') || model.newId('tm'),
    teamId: teamId,
    userId: uid,
    displayName: String((raw && (raw.displayName || raw.name || raw.nickname)) || uid).trim(),
    avatar: String((raw && raw.avatar) || '').trim(),
    role: role,
    isCaptain: isCaptain,
    memberStatus: String((raw && (raw.memberStatus || raw.status)) || 'active') === 'active'
      ? model.MEMBER_STATUS.ACTIVE
      : String(raw.memberStatus || raw.status),
    joinedAt: Number((raw && raw.joinedAt) || 0) || model.nowMs()
  });
}

function mergeMembers(a, b) {
  var byUser = {};
  function add(list) {
    (list || []).forEach(function (m) {
      if (!m || !m.userId) return;
      var prev = byUser[m.userId];
      if (!prev) {
        byUser[m.userId] = m;
        return;
      }
      if (m.role === model.ROLES.SUPER_ADMIN) prev.role = model.ROLES.SUPER_ADMIN;
      else if (m.role === model.ROLES.ADMIN && prev.role === model.ROLES.MEMBER) prev.role = model.ROLES.ADMIN;
      if (m.isCaptain) prev.isCaptain = true;
      if (m.displayName && m.displayName !== m.userId) prev.displayName = m.displayName;
    });
  }
  add(a);
  add(b);
  return Object.keys(byUser).map(function (k) {
    return byUser[k];
  });
}

function fromLegacyTeam(rec, source) {
  if (!rec || isEventOrg(rec)) return null;
  var teamId = String(rec.id || rec.teamId || '').trim();
  if (!teamId) return null;
  var owner =
    String(rec.createdBy || rec.ownerUserId || rec.creatorId || '').trim();
  if (owner.toLowerCase() === 'me') owner = '';
  var members = [];
  if (Array.isArray(rec.members)) {
    rec.members.forEach(function (m, i) {
      var row = toMember(teamId, m, i, '');
      if (row) members.push(row);
    });
  }
  var adminIds = Array.isArray(rec.adminUserIds) ? rec.adminUserIds : [];
  adminIds.forEach(function (id) {
    var uid = String(id || '').trim();
    if (!uid || uid.toLowerCase() === 'me') return;
    var found = null;
    members.forEach(function (m) {
      if (m.userId === uid) found = m;
    });
    if (found) {
      if (found.role !== model.ROLES.SUPER_ADMIN) found.role = model.ROLES.ADMIN;
    } else {
      members.push(
        model.createMemberRecord({
          teamId: teamId,
          userId: uid,
          displayName: uid,
          role: model.ROLES.ADMIN
        })
      );
    }
  });
  if (owner) {
    var ownerRow = null;
    members.forEach(function (m) {
      if (m.userId === owner) ownerRow = m;
    });
    if (ownerRow) ownerRow.role = model.ROLES.SUPER_ADMIN;
    else {
      members.unshift(
        model.createMemberRecord({
          teamId: teamId,
          userId: owner,
          displayName: String(rec.name || owner),
          role: model.ROLES.SUPER_ADMIN,
          isCaptain: true
        })
      );
    }
  }
  var supers = members.filter(function (m) {
    return m.role === model.ROLES.SUPER_ADMIN && m.memberStatus === model.MEMBER_STATUS.ACTIVE;
  });
  if (supers.length > 1) {
    supers.slice(1).forEach(function (m) {
      m.role = model.ROLES.ADMIN;
    });
  }
  if (!owner && supers.length) owner = supers[0].userId;
  var team = model.createTeamRecord({
    teamId: teamId,
    ownerUserId: owner,
    name: String(rec.name || rec.fullName || teamId),
    shortName: String(rec.shortName || rec.name || ''),
    city: String(rec.region || rec.cityName || rec.city || ''),
    logo: String(rec.logo || ''),
    intro: String(rec.desc || rec.description || rec.slogan || ''),
    createdAt: Number(rec.createdAt) || model.nowMs()
  });
  team._migrateSources = [source];
  return { team: team, members: members };
}

function collectLegacyClubBundles() {
  var byId = {};
  function mergeBundle(bundle, source) {
    if (!bundle || !bundle.team) return;
    var id = bundle.team.teamId;
    var prev = byId[id];
    if (!prev) {
      bundle.team._migrateSources = [source];
      byId[id] = bundle;
      return;
    }
    prev.team._migrateSources.push(source);
    if (source === 'created_teams') {
      prev.team.name = bundle.team.name || prev.team.name;
      prev.team.shortName = bundle.team.shortName || prev.team.shortName;
      prev.team.city = bundle.team.city || prev.team.city;
      prev.team.logo = bundle.team.logo || prev.team.logo;
      prev.team.intro = bundle.team.intro || prev.team.intro;
      if (bundle.team.ownerUserId) prev.team.ownerUserId = bundle.team.ownerUserId;
    }
    prev.members = mergeMembers(prev.members, bundle.members);
  }

  var created = readCreatedTeamsRaw();
  var createdIds = {};
  created.forEach(function (rec) {
    var b = fromLegacyTeam(rec, 'created_teams');
    if (!b) return;
    createdIds[b.team.teamId] = true;
    mergeBundle(b, 'created_teams');
  });

  var matchIds = readMatchTeamIds();
  var seeds = readDirectoryClubSeeds();
  var seedById = {};
  seeds.forEach(function (s) {
    seedById[String(s.id)] = s;
  });

  matchIds.forEach(function (id) {
    if (byId[id]) return;
    if (seedById[id]) mergeBundle(fromLegacyTeam(seedById[id], 'directory'), 'directory');
    else {
      mergeBundle(
        {
          team: model.createTeamRecord({
            teamId: id,
            name: id,
            ownerUserId: ''
          }),
          members: []
        },
        'match_ref'
      );
    }
  });

  seeds.forEach(function (seed) {
    var id = String(seed.id);
    if (createdIds[id]) mergeBundle(fromLegacyTeam(seed, 'directory'), 'directory');
  });

  return Object.keys(byId).map(function (k) {
    return byId[k];
  });
}

function pruneCreatedTeamsToEventOrgs() {
  var raw = readCreatedTeamsRaw();
  if (!raw.length) return;
  var events = [];
  var clubs = [];
  raw.forEach(function (rec) {
    if (isEventOrg(rec)) events.push(rec);
    else clubs.push(rec);
  });
  if (!clubs.length) return;
  var wxapi = _wx();
  var backupKey = 'gb_created_teams_v1_pre_club_migrate';
  try {
    if (!wxapi.getStorageSync(backupKey)) {
      wxapi.setStorageSync(backupKey, wxapi.getStorageSync(CREATED_TEAMS_STORAGE_KEY));
    }
  } catch (e) {
    /* ignore */
  }
  try {
    wxapi.setStorageSync(CREATED_TEAMS_STORAGE_KEY, { version: 1, teams: events });
  } catch (e2) {
    /* ignore */
  }
}

function applyMigration(store) {
  var target = store || model.createEmptyStore();
  var importedSet = {};
  (target.teams || []).forEach(function (t) {
    if (t && t.teamId) importedSet[t.teamId] = true;
  });
  var bundles = collectLegacyClubBundles();
  var importedNew = 0;
  bundles.forEach(function (b) {
    if (!b || !b.team || importedSet[b.team.teamId]) return;
    importedSet[b.team.teamId] = true;
    importedNew += 1;
    var sources = b.team._migrateSources || [];
    delete b.team._migrateSources;
    target.teams.push(b.team);
    (b.members || []).forEach(function (m) {
      target.members.push(m);
    });
    target.audits.push({
      auditId: model.newId('aud'),
      teamId: b.team.teamId,
      actorUserId: 'system',
      action: 'migrate_import',
      payload: { sources: sources },
      createdAt: model.nowMs()
    });
  });
  target.schemaVersion = model.SCHEMA_VERSION;
  target.meta = target.meta || {};
  if (!target.meta.migratedCreatedTeams || importedNew) {
    target.meta.migratedCreatedTeams = true;
    target.meta.migratedAt = model.nowMs();
    target.meta.sources = ['gb_created_teams_v1', 'teamDirectory.TEAMS', 'teamMatchStore'];
  }
  target.meta.importedTeamIds = Object.keys(importedSet);
  pruneCreatedTeamsToEventOrgs();
  return target;
}

function listConfirmableClubCandidates(userId) {
  var uid = String(userId || '').trim();
  if (!uid) return [];
  return readCreatedTeamsRaw().filter(function (t) {
    if (!t || isEventOrg(t)) return false;
    var id = String(t.id || t.teamId || '').trim();
    if (!id || /^(1|2|3|4|5)$/.test(id)) return false;
    var owner = String(t.createdBy || t.ownerUserId || t.createdByUserId || '').trim();
    return owner === uid;
  });
}

module.exports = {
  CREATED_TEAMS_STORAGE_KEY: CREATED_TEAMS_STORAGE_KEY,
  isEventOrg: isEventOrg,
  readCreatedTeamsRaw: readCreatedTeamsRaw,
  collectLegacyClubBundles: collectLegacyClubBundles,
  applyMigration: applyMigration,
  pruneCreatedTeamsToEventOrgs: pruneCreatedTeamsToEventOrgs,
  listConfirmableClubCandidates: listConfirmableClubCandidates
};
