'use strict';

var errors = require('./errors.js');
var cryptoUtil = require('./cryptoUtil.js');
var log = require('./log.js');
var C = require('./constants.js');
var permissions = require('./permissions.js');
var matchDoc = require('./matchDoc.js');
var scoreShards = require('./scoreShards.js');

function roleLabel(role) {
  if (role === C.ROLES.SUPER_ADMIN) return '超级管理员';
  if (role === C.ROLES.ADMIN) return '管理员';
  return '成员';
}

function publicUser(profile) {
  if (!profile) return null;
  return {
    userId: profile.userId,
    displayName: profile.displayName || profile.userId,
    avatar: profile.avatar || ''
  };
}

function mapMemberView(m) {
  var tags = m.isCaptain ? ['captain'] : [];
  var grants = permissions.memberGrants(m);
  return {
    id: m.memberId,
    memberId: m.memberId,
    teamId: m.teamId,
    userId: m.userId,
    displayName: m.displayName,
    nickname: '',
    avatar: m.avatar || '',
    role: m.role,
    roleLabel: roleLabel(m.role),
    tags: tags,
    grants: grants,
    badges: [{ key: m.role, label: roleLabel(m.role) }].concat(
      m.isCaptain ? [{ key: 'captain', label: '队长' }] : []
    ),
    joinedAt: m.joinedAt,
    status: m.memberStatus === C.MEMBER_STATUS.ACTIVE ? 'active' : m.memberStatus,
    memberStatus: m.memberStatus,
    isCaptain: !!m.isCaptain,
    sortPinyin: String(m.displayName || '').toLowerCase()
  };
}

function mapTeamView(team, members, viewerId) {
  var mine = null;
  var captain = '';
  (members || []).forEach(function (m) {
    if (m.memberStatus !== C.MEMBER_STATUS.ACTIVE) return;
    if (m.userId === String(viewerId || '')) mine = m;
    if (m.isCaptain) captain = m.userId;
  });
  var activeCount = (members || []).filter(function (m) {
    return m.memberStatus === C.MEMBER_STATUS.ACTIVE;
  }).length;
  var currentUserRole = mine ? mine.role : '';
  var perms = mine
    ? permissions.derivePermissions(currentUserRole, true)
    : permissions.emptyPermissions();
  if (team.status === C.TEAM_STATUS.DISSOLVED) {
    perms = permissions.emptyPermissions();
  }
  var hist = findMemberRecord(members, viewerId);
  return {
    id: team.teamId,
    teamId: team.teamId,
    logo: team.logo || '',
    fullName: team.name,
    name: team.name,
    shortName: team.shortName,
    slogan: team.slogan || '',
    description: team.intro || '',
    city: team.city || '',
    cityName: team.city || '',
    region: team.city || '',
    regionText: team.city || '',
    memberCount: activeCount,
    memberCountText: activeCount + '人',
    captainMemberId: captain,
    acceptingMembers: team.acceptingMembers !== false,
    pendingApplicationCount: Number(team.pendingApplicationCount) || 0,
    isFormalMember: !!mine,
    isHistoricalMember: !!(hist && hist.memberStatus !== C.MEMBER_STATUS.ACTIVE),
    currentUserRole: currentUserRole,
    currentUserTags: mine && mine.isCaptain ? ['captain'] : [],
    permissions: perms,
    badges: mine ? [{ key: mine.role, label: roleLabel(mine.role) }] : [],
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
    version: team.version,
    status: team.status,
    ownerUserId: team.ownerUserId,
    schemaVersion: team.schemaVersion || C.SCHEMA_VERSION,
    organizationType: 'team'
  };
}

function assertWritable(team) {
  if (!team) return errors.fail('not_found', '球队不存在');
  if (team.status === C.TEAM_STATUS.DISSOLVED) {
    return errors.fail('team_dissolved', '球队已解散');
  }
  return null;
}

function bumpTeam(team, expectedVersion, now) {
  if (expectedVersion != null && Number(expectedVersion) !== Number(team.version)) {
    return errors.fail('conflict', 'version 冲突', { currentVersion: team.version });
  }
  team.version = Number(team.version || 1) + 1;
  team.updatedAt = now;
  return null;
}

function ignoreClientClaims(payload) {
  var p = payload && typeof payload === 'object' ? payload : {};
  return {
    name: p.name || p.fullName,
    shortName: p.shortName,
    city: p.city || p.region || p.cityName,
    logo: p.logo,
    intro: p.intro || p.desc || p.description,
    homeCourse: p.homeCourse,
    teamId: p.teamId || p.id,
    message: p.message,
    keyword: p.keyword || p.query,
    status: p.status,
    ttlMs: p.ttlMs,
    expectedVersion: p.expectedVersion,
    displayName: p.displayName,
    avatar: p.avatar,
    applicationId: p.applicationId,
    decision: p.decision,
    token: p.token,
    inviteId: p.inviteId,
    userId: p.targetUserId || p.memberUserId,
    makeAdmin: p.makeAdmin,
    toUserId: p.toUserId,
    idempotencyKey: p.idempotencyKey,
    migrationKey: p.migrationKey,
    teamSnapshot: p.teamSnapshot || p.team,
    noticeId: p.noticeId,
    slogan: p.slogan,
    acceptingMembers: p.acceptingMembers,
    matchId: p.matchId || p.gameId,
    title: p.title,
    dateText: p.dateText,
    snapshot: p.snapshot,
    relationType: p.relationType,
    confirmName: p.confirmName || p.teamName
  };
}

function resolveActor(tx, wxCtx) {
  var openid = wxCtx && wxCtx.OPENID ? String(wxCtx.OPENID).trim() : '';
  if (!openid) return Promise.resolve(errors.fail('need_login', '未登录'));
  var openidHash = cryptoUtil.hashOpenid(openid);
  return tx.query(C.COLLECTIONS.PROFILES, function (row) {
    return row && row.openidHash === openidHash;
  }).then(function (rows) {
    if (!rows.length) {
      return errors.fail('profile_required', '请先完善用户档案');
    }
    var profile = rows[0];
    return {
      ok: true,
      user: {
        userId: profile.userId,
        displayName: profile.displayName || profile.userId,
        avatar: profile.avatar || ''
      }
    };
  });
}

function requireActor(tx, wxCtx) {
  return resolveActor(tx, wxCtx).then(function (auth) {
    if (!auth || auth.ok === false) return auth;
    return auth;
  });
}

function getTeamMembers(tx, teamId) {
  return tx.query(C.COLLECTIONS.MEMBERS, function (row) {
    return row && row.teamId === String(teamId);
  });
}

function findMemberRecord(members, userId) {
  var uid = String(userId || '');
  for (var i = 0; i < members.length; i++) {
    if (members[i].userId === uid) return members[i];
  }
  return null;
}

function findActiveMember(members, userId) {
  var m = findMemberRecord(members, userId);
  if (!m || m.memberStatus !== C.MEMBER_STATUS.ACTIVE) return null;
  if (Number(m.leftAt || 0)) return null;
  return m;
}

function putNotice(tx, input) {
  var nid = String(input.noticeId || cryptoUtil.newId('nt'));
  return tx.put(C.COLLECTIONS.NOTICES, nid, {
    noticeId: nid,
    id: nid,
    category: 'team_notice',
    type: String(input.type || ''),
    teamId: String(input.teamId || ''),
    applicationId: String(input.applicationId || ''),
    recipientUserId: String(input.recipientUserId || ''),
    title: String(input.title || ''),
    summary: String(input.summary || ''),
    createdAt: tx.nowMs(),
    read: false,
    jump: input.jump || null
  });
}

function requireRole(member, allowed) {
  if (!member) return errors.fail('forbidden', '不是球队成员');
  if (allowed.indexOf(member.role) < 0) return errors.fail('forbidden', '权限不足');
  return null;
}

function writeAudit(tx, teamId, actorUserId, action, payload) {
  var id = cryptoUtil.newId('aud');
  return tx.put(C.COLLECTIONS.AUDITS, id, {
    auditId: id,
    teamId: String(teamId || ''),
    actorUserId: String(actorUserId || ''),
    action: String(action || ''),
    payload: payload || {},
    createdAt: tx.nowMs(),
    clientForged: false
  });
}

function readIdempotency(tx, key) {
  if (!key) return Promise.resolve(null);
  return tx.get(C.COLLECTIONS.IDEMPOTENCY, String(key));
}

function writeIdempotency(tx, key, result) {
  if (!key) return Promise.resolve(null);
  return tx.put(C.COLLECTIONS.IDEMPOTENCY, String(key), {
    key: String(key),
    result: result,
    createdAt: tx.nowMs()
  });
}

function isDemoTeamId(teamId) {
  var id = String(teamId || '').trim();
  return /^(1|2|3|4|5)$/.test(id);
}

function addMemberRow(tx, team, input, now) {
  var uid = String((input && input.userId) || '').trim();
  if (!uid || uid.toLowerCase() === 'me') return Promise.resolve(errors.fail('invalid_user', '非法用户'));
  var docId = C.memberDocId(team.teamId, uid);
  return tx.get(C.COLLECTIONS.MEMBERS, docId).then(function (existing) {
    if (existing && existing.memberStatus === C.MEMBER_STATUS.ACTIVE) {
      return errors.fail('already_member', '已是成员');
    }
    if (existing) {
      existing.memberStatus = C.MEMBER_STATUS.ACTIVE;
      existing.role = C.ROLES.MEMBER;
      existing.displayName = String((input && input.displayName) || existing.displayName || uid);
      existing.joinedAt = now;
      existing.leftAt = 0;
      existing.updatedAt = now;
      return tx.put(C.COLLECTIONS.MEMBERS, docId, existing).then(function () {
        return errors.ok(existing);
      });
    }
    var row = {
      memberId: cryptoUtil.newId('tm'),
      teamId: team.teamId,
      userId: uid,
      displayName: String((input && input.displayName) || uid),
      avatar: String((input && input.avatar) || ''),
      role: C.ROLES.MEMBER,
      isCaptain: false,
      grants: [],
      memberStatus: C.MEMBER_STATUS.ACTIVE,
      joinedAt: now,
      leftAt: 0,
      updatedAt: now
    };
    return tx.put(C.COLLECTIONS.MEMBERS, docId, row).then(function () {
      return errors.ok(row);
    });
  });
}

function fanoutApplicationNotices(tx, team, app, members, now) {
  var jobs = [];
  members.forEach(function (m) {
    if (m.memberStatus !== C.MEMBER_STATUS.ACTIVE) return;
    if (!permissions.canReviewTeamApplication(m.role)) return;
    var nid = ['tn', 'join_application_received', app.applicationId, m.userId].join('-');
    jobs.push(
      tx.put(C.COLLECTIONS.NOTICES, nid, {
        noticeId: nid,
        id: nid,
        category: 'team_notice',
        type: 'join_application_received',
        teamId: team.teamId,
        applicationId: app.applicationId,
        recipientUserId: m.userId,
        title: String(app.displayName || '有人') + ' 申请加入' + team.name,
        summary: String(app.message || ''),
        createdAt: now,
        read: false,
        jump: {
          category: 'team_notice',
          type: 'join_application_received',
          applicationId: app.applicationId,
          noticeId: nid,
          url:
            '/subpackages/player/pages/me/team-application/index?applicationId=' +
            encodeURIComponent(app.applicationId)
        }
      })
    );
  });
  return Promise.all(jobs);
}

function createEngine(store, wxCtx) {
  function run(fn) {
    return store.runTransaction(function (tx) {
      return fn(tx);
    });
  }

  function resolveIdentity() {
    return run(function (tx) {
      var openid = wxCtx && wxCtx.OPENID ? String(wxCtx.OPENID).trim() : '';
      if (!openid) return errors.fail('need_login', '未登录');
      return resolveActor(tx, wxCtx).then(function (auth) {
        if (auth && auth.ok) {
          return errors.ok({ user: auth.user, source: 'cloud' });
        }
        return auth;
      });
    });
  }

  function createMyProfile(payload) {
    return run(function (tx) {
      var openid = wxCtx && wxCtx.OPENID ? String(wxCtx.OPENID).trim() : '';
      if (!openid) return errors.fail('need_login', '未登录');
      var openidHash = cryptoUtil.hashOpenid(openid);
      var userId = cryptoUtil.userIdFromOpenid(openid);
      return tx.query(C.COLLECTIONS.PROFILES, function (row) {
        return row && row.openidHash === openidHash;
      }).then(function (rows) {
        if (rows.length) {
          return errors.ok(publicUser(rows[0]));
        }
        var displayName = String((payload && payload.displayName) || '').trim() || userId;
        var avatar = String((payload && payload.avatar) || '').trim();
        var profile = {
          userId: userId,
          openidHash: openidHash,
          displayName: displayName,
          avatar: avatar,
          searchKey: displayName.toLowerCase(),
          createdAt: tx.nowMs()
        };
        return tx.put(C.COLLECTIONS.PROFILES, userId, profile).then(function () {
          return errors.ok(publicUser(profile));
        });
      });
    });
  }

  function listMyTeams() {
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return tx.query(C.COLLECTIONS.MEMBERS, function (row) {
          return row && row.userId === auth.user.userId;
        }).then(function (memberships) {
          var jobs = memberships.map(function (m) {
            return tx.get(C.COLLECTIONS.CLUBS, m.teamId).then(function (team) {
              if (!team) return null;
              return getTeamMembers(tx, team.teamId).then(function (members) {
                return mapTeamView(team, members, auth.user.userId);
              });
            });
          });
          return Promise.all(jobs).then(function (list) {
            return errors.ok(list.filter(Boolean));
          });
        });
      });
    });
  }

  function getTeam(payload) {
    var teamId = String((payload && (payload.teamId || payload.id)) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        if (!teamId) return errors.fail('invalid_args', '缺少 teamId');
        return tx.get(C.COLLECTIONS.CLUBS, teamId).then(function (team) {
          if (!team) return errors.fail('not_found', '球队不存在');
          return getTeamMembers(tx, teamId).then(function (members) {
            return tx.query(C.COLLECTIONS.APPLICATIONS, function (a) {
              return a && a.teamId === teamId && a.userId === auth.user.userId;
            }).then(function (apps) {
              var view = mapTeamView(team, members, auth.user.userId);
              var latest = null;
              apps.forEach(function (row) {
                if (!latest || Number(row.createdAt) > Number(latest.createdAt)) latest = row;
              });
              view.viewerApplication = latest;
              var canReview = !!(view.permissions && view.permissions.canReviewJoinRequests);
              if (!canReview) {
                view.pendingApplicationCount = 0;
                return errors.ok(view);
              }
              return tx.query(C.COLLECTIONS.APPLICATIONS, function (a) {
                return a && a.teamId === teamId && a.status === C.APP_STATUS.PENDING;
              }).then(function (pending) {
                view.pendingApplicationCount = (pending || []).length;
                return errors.ok(view);
              });
            });
          });
        });
      });
    });
  }

  function createTeam(payload) {
    var p = ignoreClientClaims(payload);
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        var name = String(p.name || '').trim();
        if (!name) return errors.fail('invalid_args', '球队名称不能为空');
        var idem = p.idempotencyKey ? String(auth.user.userId + ':createTeam:' + p.idempotencyKey) : '';
        return readIdempotency(tx, idem).then(function (hit) {
          if (hit && hit.result) return hit.result;
          var presetId = String(p.teamId || '').trim();
          if (isDemoTeamId(presetId)) return errors.fail('invalid_args', '拒绝导入演示球队');
          var check = presetId ? tx.get(C.COLLECTIONS.CLUBS, presetId) : Promise.resolve(null);
          return check.then(function (exists) {
            if (exists) return errors.fail('conflict', 'teamId 已存在');
            var now = tx.nowMs();
            var teamId = presetId || cryptoUtil.newId('team');
            var team = {
              teamId: teamId,
              schemaVersion: C.SCHEMA_VERSION,
              name: name,
              shortName: String(p.shortName || name).trim(),
              city: String(p.city || '').trim(),
              logo: String(p.logo || '').trim(),
              intro: String(p.intro || '').trim(),
              homeCourse: String(p.homeCourse || '').trim(),
              slogan: String(p.slogan || '').trim(),
              status: C.TEAM_STATUS.ACTIVE,
              ownerUserId: auth.user.userId,
              createdAt: now,
              updatedAt: now,
              version: 1,
              dissolvedAt: 0,
              acceptingMembers: payload && payload.acceptingMembers === false ? false : true
            };
            var member = {
              memberId: cryptoUtil.newId('tm'),
              teamId: teamId,
              userId: auth.user.userId,
              displayName: auth.user.displayName,
              avatar: auth.user.avatar,
              role: C.ROLES.SUPER_ADMIN,
              isCaptain: true,
              grants: [],
              memberStatus: C.MEMBER_STATUS.ACTIVE,
              joinedAt: now,
              leftAt: 0,
              updatedAt: now
            };
            return tx
              .put(C.COLLECTIONS.CLUBS, teamId, team)
              .then(function () {
                return tx.put(C.COLLECTIONS.MEMBERS, C.memberDocId(teamId, auth.user.userId), member);
              })
              .then(function () {
                return writeAudit(tx, teamId, auth.user.userId, 'create_team', { name: name });
              })
              .then(function () {
                var result = errors.ok(mapTeamView(team, [member], auth.user.userId));
                return writeIdempotency(tx, idem, result).then(function () {
                  return result;
                });
              });
          });
        });
      });
    });
  }

  function updateTeam(payload) {
    var p = ignoreClientClaims(payload);
    var teamId = String((payload && (payload.teamId || payload.id)) || p.teamId || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return tx.get(C.COLLECTIONS.CLUBS, teamId).then(function (team) {
          var dead = assertWritable(team);
          if (dead) return dead;
          return getTeamMembers(tx, teamId).then(function (members) {
            var mine = findActiveMember(members, auth.user.userId);
            var denied = requireRole(mine, [C.ROLES.SUPER_ADMIN, C.ROLES.ADMIN]);
            if (denied) return denied;
            var conflict = bumpTeam(team, p.expectedVersion != null ? p.expectedVersion : payload && payload.expectedVersion, tx.nowMs());
            if (conflict) return conflict;
            if (p.name != null) team.name = String(p.name).trim() || team.name;
            if (p.shortName != null) team.shortName = String(p.shortName).trim();
            if (payload && (payload.city != null || payload.region != null || p.city != null)) {
              team.city = String(p.city || '').trim();
            }
            if (p.logo != null) team.logo = String(p.logo).trim();
            if (payload && (payload.intro != null || payload.desc != null || p.intro != null)) {
              team.intro = String(p.intro || '').trim();
            }
            if (payload && payload.slogan != null) team.slogan = String(payload.slogan || '').trim();
            if (payload && payload.acceptingMembers != null) team.acceptingMembers = payload.acceptingMembers !== false;
            return tx.put(C.COLLECTIONS.CLUBS, teamId, team).then(function () {
              return writeAudit(tx, teamId, auth.user.userId, 'update_team', {});
            }).then(function () {
              return errors.ok(mapTeamView(team, members, auth.user.userId));
            });
          });
        });
      });
    });
  }

  function listMembers(payload) {
    var teamId = String((payload && payload.teamId) || '').trim();
    var keyword = String((payload && (payload.keyword || payload.query)) || '').trim().toLowerCase();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return tx.get(C.COLLECTIONS.CLUBS, teamId).then(function (team) {
          if (!team) return errors.fail('not_found', '球队不存在');
          return getTeamMembers(tx, teamId).then(function (members) {
            var list = members
              .filter(function (m) {
                return m.memberStatus === C.MEMBER_STATUS.ACTIVE;
              })
              .map(mapMemberView)
              .filter(function (m) {
                if (!keyword) return true;
                return String(m.displayName || '').toLowerCase().indexOf(keyword) >= 0;
              });
            return errors.ok(list);
          });
        });
      });
    });
  }

  function listApplications(payload) {
    var teamId = String((payload && payload.teamId) || '').trim();
    var status = payload && payload.status;
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return getTeamMembers(tx, teamId).then(function (members) {
          var mine = findActiveMember(members, auth.user.userId);
          var denied = requireRole(mine, [C.ROLES.SUPER_ADMIN, C.ROLES.ADMIN]);
          if (denied) return denied;
          return tx.query(C.COLLECTIONS.APPLICATIONS, function (a) {
            if (!a || a.teamId !== teamId) return false;
            if (status && a.status !== status) return false;
            return true;
          }).then(function (list) {
            return errors.ok(list);
          });
        });
      });
    });
  }

  function createApplication(payload) {
    var teamId = String((payload && payload.teamId) || '').trim();
    var p = ignoreClientClaims(payload);
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return tx.get(C.COLLECTIONS.CLUBS, teamId).then(function (team) {
          var dead = assertWritable(team);
          if (dead) return dead;
          if (team.acceptingMembers === false) {
            return errors.fail('paused', '该球队暂时不接受新成员申请');
          }
          var lockId = C.pendingLockId(teamId, auth.user.userId);
          return Promise.all([
            getTeamMembers(tx, teamId),
            tx.get(C.COLLECTIONS.PENDING_LOCKS, lockId)
          ]).then(function (pair) {
            var members = pair[0];
            var lock = pair[1];
            if (findActiveMember(members, auth.user.userId)) {
              return errors.fail('already_member', '已是球队成员');
            }
            if (lock) return errors.fail('already_pending', '已有待审核申请');
            var now = tx.nowMs();
            var app = {
              applicationId: cryptoUtil.newId('ja'),
              teamId: teamId,
              userId: auth.user.userId,
              displayName: auth.user.displayName,
              message: String(p.message || '').trim(),
              status: C.APP_STATUS.PENDING,
              version: 1,
              createdAt: now,
              processedBy: '',
              processedAt: 0
            };
            return tx
              .put(C.COLLECTIONS.APPLICATIONS, app.applicationId, app)
              .then(function () {
                return tx.put(C.COLLECTIONS.PENDING_LOCKS, lockId, {
                  teamId: teamId,
                  userId: auth.user.userId,
                  applicationId: app.applicationId,
                  createdAt: now
                });
              })
              .then(function () {
                return fanoutApplicationNotices(tx, team, app, members, now);
              })
              .then(function () {
                return writeAudit(tx, teamId, auth.user.userId, 'create_application', {
                  applicationId: app.applicationId
                });
              })
              .then(function () {
                return errors.ok(app);
              });
          });
        });
      });
    });
  }

  function cancelApplication(payload) {
    var applicationId = String((payload && payload.applicationId) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return tx.get(C.COLLECTIONS.APPLICATIONS, applicationId).then(function (app) {
          if (!app) return errors.fail('not_found', '申请不存在');
          if (app.userId !== auth.user.userId) return errors.fail('forbidden', '只能撤销自己的申请');
          return tx.get(C.COLLECTIONS.CLUBS, app.teamId).then(function (team) {
            var dead = assertWritable(team);
            if (dead) return dead;
            if (app.status !== C.APP_STATUS.PENDING) return errors.fail('conflict', '申请已处理');
            app.status = C.APP_STATUS.CANCELLED;
            return tx.put(C.COLLECTIONS.APPLICATIONS, applicationId, app).then(function () {
              return tx.remove(C.COLLECTIONS.PENDING_LOCKS, C.pendingLockId(app.teamId, app.userId));
            }).then(function () {
              return errors.ok(app);
            });
          });
        });
      });
    });
  }

  function reviewApplication(payload) {
    var applicationId = String((payload && payload.applicationId) || '').trim();
    var action = String((payload && payload.decision) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        if (action !== 'approve' && action !== 'reject') return errors.fail('invalid_args', '未知决定');
        return tx.get(C.COLLECTIONS.APPLICATIONS, applicationId).then(function (app) {
          if (!app) return errors.fail('not_found', '申请不存在');
          return tx.get(C.COLLECTIONS.CLUBS, app.teamId).then(function (team) {
            var dead = assertWritable(team);
            if (dead) return dead;
            return getTeamMembers(tx, app.teamId).then(function (members) {
              var mine = findActiveMember(members, auth.user.userId);
              if (!mine || !permissions.canReviewTeamApplication(mine.role)) {
                return errors.fail('forbidden', '无权审核');
              }
              if (app.status !== C.APP_STATUS.PENDING) {
                var sameDecision =
                  (app.status === C.APP_STATUS.APPROVED && action === 'approve') ||
                  (app.status === C.APP_STATUS.REJECTED && action === 'reject');
                if (sameDecision && String(app.processedBy) === auth.user.userId) {
                  return errors.ok(app);
                }
                return errors.fail('already_processed', '申请已处理');
              }
              var now = tx.nowMs();
              app.processedBy = auth.user.userId;
              app.processedAt = now;
              app.version = Number(app.version || 1) + 1;
              app.status = action === 'approve' ? C.APP_STATUS.APPROVED : C.APP_STATUS.REJECTED;
              var next = tx.put(C.COLLECTIONS.APPLICATIONS, applicationId, app).then(function () {
                return tx.remove(C.COLLECTIONS.PENDING_LOCKS, C.pendingLockId(app.teamId, app.userId));
              });
              if (action === 'approve') {
                next = next.then(function () {
                  return addMemberRow(tx, team, { userId: app.userId, displayName: app.displayName }, now);
                }).then(function (added) {
                  if (!added.ok && added.code !== 'already_member') return added;
                  return writeAudit(tx, app.teamId, auth.user.userId, 'approve_application', {
                    applicationId: app.applicationId
                  }).then(function () {
                    return putNotice(tx, {
                      noticeId: ['tn', 'join_application_result', app.applicationId, app.userId].join('-'),
                      type: 'join_application_result',
                      teamId: app.teamId,
                      applicationId: app.applicationId,
                      recipientUserId: app.userId,
                      title: '入队申请已通过',
                      summary: (team && team.name ? team.name : '球队') + ' 已同意你的申请',
                      jump: {
                        category: 'team_notice',
                        type: 'join_application_result',
                        applicationId: app.applicationId,
                        url:
                          '/subpackages/player/pages/me/team-application/index?applicationId=' +
                          encodeURIComponent(app.applicationId)
                      }
                    });
                  }).then(function () {
                    return errors.ok(app);
                  });
                });
              } else {
                next = next.then(function () {
                  return writeAudit(tx, app.teamId, auth.user.userId, 'reject_application', {
                    applicationId: app.applicationId
                  });
                }).then(function () {
                  return putNotice(tx, {
                    noticeId: ['tn', 'join_application_result', app.applicationId, app.userId].join('-'),
                    type: 'join_application_result',
                    teamId: app.teamId,
                    applicationId: app.applicationId,
                    recipientUserId: app.userId,
                    title: '入队申请未通过',
                    summary: (team && team.name ? team.name : '球队') + ' 未通过你的申请',
                    jump: {
                      category: 'team_notice',
                      type: 'join_application_result',
                      applicationId: app.applicationId,
                      url:
                        '/subpackages/player/pages/me/team-application/index?applicationId=' +
                        encodeURIComponent(app.applicationId)
                    }
                  });
                }).then(function () {
                  return errors.ok(app);
                });
              }
              return next;
            });
          });
        });
      });
    });
  }

  function addMember(payload) {
    var teamId = String((payload && payload.teamId) || '').trim();
    var targetUserId = String((payload && (payload.targetUserId || payload.userId || payload.memberUserId)) || '').trim();
    var p = ignoreClientClaims(payload);
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return tx.get(C.COLLECTIONS.CLUBS, teamId).then(function (team) {
          var dead = assertWritable(team);
          if (dead) return dead;
          return getTeamMembers(tx, teamId).then(function (members) {
            var mine = findActiveMember(members, auth.user.userId);
            var denied = requireRole(mine, [C.ROLES.SUPER_ADMIN, C.ROLES.ADMIN]);
            if (denied) return denied;
            if (payload && C.normalizeRole(payload.role) === C.ROLES.SUPER_ADMIN) {
              /* ignore untrusted role */
            }
            return addMemberRow(
              tx,
              team,
              { userId: targetUserId, displayName: p.displayName || targetUserId, avatar: p.avatar },
              tx.nowMs()
            ).then(function (added) {
              if (!added.ok) return added;
              return writeAudit(tx, teamId, auth.user.userId, 'add_member', { userId: targetUserId }).then(function () {
                return putNotice(tx, {
                  noticeId: ['tn', 'member_added', teamId, targetUserId].join('-'),
                  type: 'member_added',
                  teamId: teamId,
                  recipientUserId: targetUserId,
                  title: '你已加入' + (team.name || '球队'),
                  summary: '管理员已将你添加为普通成员',
                  jump: { url: '/subpackages/player/pages/me/team-detail/index?teamId=' + encodeURIComponent(teamId) }
                });
              }).then(function () {
                return errors.ok(mapMemberView(added.data));
              });
            });
          });
        });
      });
    });
  }

  function removeMember(payload) {
    var teamId = String((payload && payload.teamId) || '').trim();
    var targetUserId = String((payload && (payload.targetUserId || payload.userId)) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return tx.get(C.COLLECTIONS.CLUBS, teamId).then(function (team) {
          var dead = assertWritable(team);
          if (dead) return dead;
          return getTeamMembers(tx, teamId).then(function (members) {
            var actor = findActiveMember(members, auth.user.userId);
            var target = findActiveMember(members, targetUserId);
            if (!target) return errors.fail('not_found', '成员不存在');
            if (target.role === C.ROLES.SUPER_ADMIN) return errors.fail('forbidden', '不能移出超级管理员');
            if (!actor) return errors.fail('forbidden', '不是球队成员');
            if (actor.role !== C.ROLES.SUPER_ADMIN) {
              if (actor.role !== C.ROLES.ADMIN || target.role !== C.ROLES.MEMBER) {
                return errors.fail('forbidden', '无权移出该成员');
              }
            }
            target.memberStatus = C.MEMBER_STATUS.REMOVED;
            target.isCaptain = false;
            target.leftAt = tx.nowMs();
            target.updatedAt = tx.nowMs();
            var conflict = bumpTeam(team, null, tx.nowMs());
            if (conflict) return conflict;
            return tx
              .put(C.COLLECTIONS.MEMBERS, C.memberDocId(teamId, targetUserId), target)
              .then(function () {
                return tx.put(C.COLLECTIONS.CLUBS, teamId, team);
              })
              .then(function () {
                return writeAudit(tx, teamId, auth.user.userId, 'remove_member', { userId: targetUserId });
              })
              .then(function () {
                return putNotice(tx, {
                  noticeId: ['tn', 'member_removed', teamId, targetUserId, String(tx.nowMs())].join('-'),
                  type: 'member_removed',
                  teamId: teamId,
                  recipientUserId: targetUserId,
                  title: '你已离开' + (team.name || '球队'),
                  summary: '管理员已将你移出球队',
                  jump: { url: '/subpackages/player/pages/me/teams/index' }
                });
              })
              .then(function () {
                return errors.ok(true);
              });
          });
        });
      });
    });
  }

  function setAdmin(payload, makeAdminFlag) {
    var teamId = String((payload && payload.teamId) || '').trim();
    var targetUserId = String((payload && (payload.targetUserId || payload.userId)) || '').trim();
    var makeAdmin = makeAdminFlag != null ? !!makeAdminFlag : payload && payload.makeAdmin !== false;
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return tx.get(C.COLLECTIONS.CLUBS, teamId).then(function (team) {
          var dead = assertWritable(team);
          if (dead) return dead;
          return getTeamMembers(tx, teamId).then(function (members) {
            var actor = findActiveMember(members, auth.user.userId);
            var denied = requireRole(actor, [C.ROLES.SUPER_ADMIN]);
            if (denied) return denied;
            var target = findActiveMember(members, targetUserId);
            if (!target) return errors.fail('not_found', '成员不存在');
            if (target.role === C.ROLES.SUPER_ADMIN) return errors.fail('forbidden', '不能更改超级管理员角色');
            target.role = makeAdmin ? C.ROLES.ADMIN : C.ROLES.MEMBER;
            target.grants = makeAdmin ? [C.GRANT_REVIEW] : [];
            target.updatedAt = tx.nowMs();
            bumpTeam(team, null, tx.nowMs());
            return tx
              .put(C.COLLECTIONS.MEMBERS, C.memberDocId(teamId, targetUserId), target)
              .then(function () {
                return tx.put(C.COLLECTIONS.CLUBS, teamId, team);
              })
              .then(function () {
                return writeAudit(tx, teamId, auth.user.userId, makeAdmin ? 'set_admin' : 'unset_admin', {
                  userId: targetUserId
                });
              })
              .then(function () {
                return errors.ok(mapMemberView(target));
              });
          });
        });
      });
    });
  }

  function setCaptain(payload) {
    var teamId = String((payload && payload.teamId) || '').trim();
    var targetUserId = String((payload && (payload.targetUserId || payload.userId)) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return tx.get(C.COLLECTIONS.CLUBS, teamId).then(function (team) {
          var dead = assertWritable(team);
          if (dead) return dead;
          return getTeamMembers(tx, teamId).then(function (members) {
            var actor = findActiveMember(members, auth.user.userId);
            var denied = requireRole(actor, [C.ROLES.SUPER_ADMIN]);
            if (denied) return denied;
            var target = findActiveMember(members, targetUserId);
            if (!target) return errors.fail('not_found', '成员不存在');
            var jobs = [];
            members.forEach(function (m) {
              if (m.memberStatus !== C.MEMBER_STATUS.ACTIVE) return;
              var nextCap = m.userId === targetUserId;
              if (!!m.isCaptain === nextCap) return;
              m.isCaptain = nextCap;
              jobs.push(tx.put(C.COLLECTIONS.MEMBERS, C.memberDocId(teamId, m.userId), m));
            });
            bumpTeam(team, null, tx.nowMs());
            return Promise.all(jobs)
              .then(function () {
                return tx.put(C.COLLECTIONS.CLUBS, teamId, team);
              })
              .then(function () {
                return writeAudit(tx, teamId, auth.user.userId, 'set_captain', { userId: targetUserId });
              })
              .then(function () {
                return errors.ok(mapMemberView(target));
              });
          });
        });
      });
    });
  }

  function unsetCaptain(payload) {
    var teamId = String((payload && payload.teamId) || '').trim();
    var targetUserId = String((payload && (payload.targetUserId || payload.userId)) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return tx.get(C.COLLECTIONS.CLUBS, teamId).then(function (team) {
          var dead = assertWritable(team);
          if (dead) return dead;
          return getTeamMembers(tx, teamId).then(function (members) {
            var actor = findActiveMember(members, auth.user.userId);
            var denied = requireRole(actor, [C.ROLES.SUPER_ADMIN]);
            if (denied) return denied;
            var target = findActiveMember(members, targetUserId) || members.filter(function (m) {
              return m.userId === targetUserId;
            })[0];
            if (!target) return errors.fail('not_found', '成员不存在');
            target.isCaptain = false;
            bumpTeam(team, null, tx.nowMs());
            return tx
              .put(C.COLLECTIONS.MEMBERS, C.memberDocId(teamId, targetUserId), target)
              .then(function () {
                return tx.put(C.COLLECTIONS.CLUBS, teamId, team);
              })
              .then(function () {
                return errors.ok(mapMemberView(target));
              });
          });
        });
      });
    });
  }

  function transferOwnership(payload) {
    var teamId = String((payload && payload.teamId) || '').trim();
    var toUserId = String((payload && (payload.toUserId || payload.targetUserId || payload.userId)) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return tx.get(C.COLLECTIONS.CLUBS, teamId).then(function (team) {
          var dead = assertWritable(team);
          if (dead) return dead;
          return getTeamMembers(tx, teamId).then(function (members) {
            var from = findActiveMember(members, auth.user.userId);
            var denied = requireRole(from, [C.ROLES.SUPER_ADMIN]);
            if (denied) return denied;
            var to = findActiveMember(members, toUserId);
            if (!to) return errors.fail('not_found', '目标不是活跃成员');
            if (to.userId === from.userId) return errors.fail('invalid_args', '不能转让给自己');
            var conflict = bumpTeam(team, payload && payload.expectedVersion, tx.nowMs());
            if (conflict) return conflict;
            from.role = C.ROLES.ADMIN;
            from.grants = [C.GRANT_REVIEW];
            to.role = C.ROLES.SUPER_ADMIN;
            team.ownerUserId = to.userId;
            return tx
              .put(C.COLLECTIONS.MEMBERS, C.memberDocId(teamId, from.userId), from)
              .then(function () {
                return tx.put(C.COLLECTIONS.MEMBERS, C.memberDocId(teamId, to.userId), to);
              })
              .then(function () {
                return tx.put(C.COLLECTIONS.CLUBS, teamId, team);
              })
              .then(function () {
                return writeAudit(tx, teamId, auth.user.userId, 'transfer_ownership', { toUserId: toUserId });
              })
              .then(function () {
                return errors.ok(mapTeamView(team, members, auth.user.userId));
              });
          });
        });
      });
    });
  }

  function leaveTeam(payload) {
    var teamId = String((payload && payload.teamId) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return tx.get(C.COLLECTIONS.CLUBS, teamId).then(function (team) {
          var dead = assertWritable(team);
          if (dead) return dead;
          return getTeamMembers(tx, teamId).then(function (members) {
            var me = findActiveMember(members, auth.user.userId);
            if (!me) return errors.fail('not_found', '不是成员');
            if (me.role === C.ROLES.SUPER_ADMIN) {
              return errors.fail('forbidden', '超级管理员需先转让或解散');
            }
            me.memberStatus = C.MEMBER_STATUS.LEFT;
            me.isCaptain = false;
            me.role = me.role === C.ROLES.ADMIN ? C.ROLES.MEMBER : me.role;
            me.leftAt = tx.nowMs();
            bumpTeam(team, null, tx.nowMs());
            return tx
              .put(C.COLLECTIONS.MEMBERS, C.memberDocId(teamId, me.userId), me)
              .then(function () {
                return tx.put(C.COLLECTIONS.CLUBS, teamId, team);
              })
              .then(function () {
                return writeAudit(tx, teamId, auth.user.userId, 'leave_team', {});
              })
              .then(function () {
                return errors.ok(true);
              });
          });
        });
      });
    });
  }

  function dissolveTeam(payload) {
    var teamId = String((payload && payload.teamId) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return tx.get(C.COLLECTIONS.CLUBS, teamId).then(function (team) {
          var dead = assertWritable(team);
          if (dead) return dead;
          return getTeamMembers(tx, teamId).then(function (members) {
            var me = findActiveMember(members, auth.user.userId);
            var denied = requireRole(me, [C.ROLES.SUPER_ADMIN]);
            if (denied) return denied;
            var confirmName = String((payload && (payload.confirmName || payload.teamName)) || '').trim();
            if (!confirmName || confirmName !== String(team.name || '').trim()) {
              return errors.fail('invalid_args', '请输入球队全称确认解散');
            }
            var conflict = bumpTeam(team, payload && payload.expectedVersion, tx.nowMs());
            if (conflict) return conflict;
            team.status = C.TEAM_STATUS.DISSOLVED;
            team.dissolvedAt = tx.nowMs();
            return tx.put(C.COLLECTIONS.CLUBS, teamId, team).then(function () {
              return writeAudit(tx, teamId, auth.user.userId, 'dissolve_team', {});
            }).then(function () {
              return errors.ok(true);
            });
          });
        });
      });
    });
  }

  function createInvite(payload) {
    var teamId = String((payload && payload.teamId) || '').trim();
    var ttl = Number((payload && payload.ttlMs) || C.DEFAULT_INVITE_TTL_MS);
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        var idem = payload && payload.idempotencyKey
          ? String(auth.user.userId + ':createInvite:' + payload.idempotencyKey)
          : '';
        return readIdempotency(tx, idem).then(function (hit) {
          if (hit && hit.result) return hit.result;
          return tx.get(C.COLLECTIONS.CLUBS, teamId).then(function (team) {
            var dead = assertWritable(team);
            if (dead) return dead;
            return getTeamMembers(tx, teamId).then(function (members) {
              var me = findActiveMember(members, auth.user.userId);
              var denied = requireRole(me, [C.ROLES.SUPER_ADMIN, C.ROLES.ADMIN]);
              if (denied) return denied;
              var token = cryptoUtil.randomInviteToken();
              var now = tx.nowMs();
              var inviteId = cryptoUtil.newId('inv');
              var row = {
                inviteId: inviteId,
                tokenHash: cryptoUtil.hashToken(token),
                teamId: teamId,
                createdBy: auth.user.userId,
                inviterUserId: auth.user.userId,
                status: C.INVITE_STATUS.ACTIVE,
                createdAt: now,
                expiresAt: now + ttl
              };
              return tx.put(C.COLLECTIONS.INVITES, inviteId, row).then(function () {
                return writeAudit(tx, teamId, auth.user.userId, 'create_invite', { inviteId: inviteId });
              }).then(function () {
                var result = errors.ok({
                  inviteId: inviteId,
                  token: token,
                  teamId: teamId,
                  status: row.status,
                  createdAt: now,
                  expiresAt: row.expiresAt
                });
                return writeIdempotency(tx, idem, result).then(function () {
                  return result;
                });
              });
            });
          });
        });
      });
    });
  }

  function findInviteByTokenOrId(tx, tokenOrId) {
    var key = String(tokenOrId || '').trim();
    if (!key) return Promise.resolve(null);
    return tx.get(C.COLLECTIONS.INVITES, key).then(function (byId) {
      if (byId) return byId;
      var tokenHash = cryptoUtil.hashToken(key);
      return tx.query(C.COLLECTIONS.INVITES, function (row) {
        return row && row.tokenHash === tokenHash;
      }).then(function (rows) {
        return rows[0] || null;
      });
    });
  }

  function revokeInvite(payload) {
    var tokenOrId = String((payload && (payload.token || payload.inviteId)) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return findInviteByTokenOrId(tx, tokenOrId).then(function (invite) {
          if (!invite) return errors.fail('not_found', '邀请不存在');
          return tx.get(C.COLLECTIONS.CLUBS, invite.teamId).then(function (team) {
            var dead = assertWritable(team);
            if (dead) return dead;
            return getTeamMembers(tx, invite.teamId).then(function (members) {
              var me = findActiveMember(members, auth.user.userId);
              var denied = requireRole(me, [C.ROLES.SUPER_ADMIN, C.ROLES.ADMIN]);
              if (denied) return denied;
              invite.status = C.INVITE_STATUS.REVOKED;
              return tx.put(C.COLLECTIONS.INVITES, invite.inviteId, invite).then(function () {
                return writeAudit(tx, invite.teamId, auth.user.userId, 'revoke_invite', {
                  inviteId: invite.inviteId
                });
              }).then(function () {
                return errors.ok({
                  inviteId: invite.inviteId,
                  teamId: invite.teamId,
                  status: invite.status,
                  expiresAt: invite.expiresAt
                });
              });
            });
          });
        });
      });
    });
  }

  function resolveInvite(payload) {
    var token = String((payload && payload.token) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return findInviteByTokenOrId(tx, token).then(function (invite) {
          if (!invite) return errors.fail('not_found', '邀请不存在');
          if (invite.status === C.INVITE_STATUS.REVOKED) {
            return errors.fail('invite_revoked', '邀请已撤销');
          }
          if (tx.nowMs() > Number(invite.expiresAt)) {
            invite.status = C.INVITE_STATUS.EXPIRED;
            return tx.put(C.COLLECTIONS.INVITES, invite.inviteId, invite).then(function () {
              return errors.fail('invite_expired', '邀请已过期');
            });
          }
          return tx.get(C.COLLECTIONS.CLUBS, invite.teamId).then(function (team) {
            var dead = assertWritable(team);
            if (dead) return dead;
            return getTeamMembers(tx, invite.teamId).then(function (members) {
              var view = mapTeamView(team, members, auth.user.userId);
              return errors.ok({
                team: view,
                invite: {
                  inviteId: invite.inviteId,
                  teamId: invite.teamId,
                  status: invite.status,
                  expiresAt: invite.expiresAt
                },
                membershipGranted: false,
                canApply: !view.isFormalMember
              });
            });
          });
        });
      });
    });
  }

  function persistMatchAndRef(tx, doc, now, actorUserId, auditAction) {
    var ref = matchDoc.buildRefRow(doc, now);
    return tx.put(C.COLLECTIONS.MATCHES, doc.matchId, doc).then(function () {
      return tx.put(C.COLLECTIONS.MATCH_REFS, C.matchRefDocId(doc.teamId, doc.matchId), ref);
    }).then(function () {
      return writeAudit(tx, doc.teamId, actorUserId, auditAction, {
        matchId: doc.matchId,
        status: doc.status,
        version: doc.version
      });
    }).then(function () {
      return errors.ok(matchDoc.toClientMatch(doc));
    });
  }

  function loadScoreRows(tx, matchId) {
    return tx.query(C.COLLECTIONS.MATCH_SCORES, function (row) {
      return row && row.matchId === String(matchId);
    });
  }

  function migrateScoresIfNeeded(tx, doc, actorUserId) {
    if (Number(doc.scoreSchemaVersion || 0) >= scoreShards.SCORE_SCHEMA_VERSION) {
      return Promise.resolve(doc);
    }
    var flats = scoreShards.flattenScoreData(doc.matchId, doc.teamId, doc.body && doc.body.scoreData, 'r1');
    var chain = Promise.resolve();
    flats.forEach(function (row) {
      chain = chain.then(function () {
        var id = scoreShards.scoreDocId(row.matchId, row.roundId, row.hole, row.entityKind, row.entityId);
        return tx.get(C.COLLECTIONS.MATCH_SCORES, id).then(function (existing) {
          if (existing) return existing;
          var now = tx.nowMs();
          return tx.put(
            C.COLLECTIONS.MATCH_SCORES,
            id,
            Object.assign({}, row, {
              scoreId: id,
              version: 1,
              updatedBy: actorUserId,
              updatedAt: now,
              migratedFromBody: true
            })
          );
        });
      });
    });
    return chain.then(function () {
      return loadScoreRows(tx, doc.matchId).then(function (rows) {
        doc.scoreSchemaVersion = scoreShards.SCORE_SCHEMA_VERSION;
        doc.scoreSummary = scoreShards.computeSummary(rows);
        return tx.put(C.COLLECTIONS.MATCHES, doc.matchId, doc).then(function () {
          return doc;
        });
      });
    });
  }

  function hydrateClientMatch(tx, doc) {
    return migrateScoresIfNeeded(tx, doc, doc.creatorUserId).then(function (fresh) {
      return loadScoreRows(tx, fresh.matchId).then(function (rows) {
        var client = matchDoc.toClientMatch(fresh);
        if (Number(fresh.scoreSchemaVersion || 0) >= scoreShards.SCORE_SCHEMA_VERSION) {
          client.scoreData = scoreShards.assembleScoreData(rows);
          client.scoreVersions = scoreShards.assembleScoreVersions(rows);
        }
        return errors.ok(client);
      });
    });
  }

  function applyScorePatch(tx, auth, payload, mode) {
    var matchId = String((payload && payload.matchId) || '').trim();
    var operationId = String((payload && (payload.operationId || payload.idempotencyKey)) || '').trim();
    var hole = Number(payload && payload.hole);
    var entityKind = String((payload && payload.entityKind) || 'player').trim() || 'player';
    var entityId = String((payload && (payload.entityId || payload.playerId)) || '').trim();
    var groupId = String((payload && payload.groupId) || '').trim();
    var roundId = String((payload && payload.roundId) || 'r1').trim() || 'r1';
    if (!matchId || !entityId || !hole) return Promise.resolve(errors.fail('invalid_args', '缺少 matchId/entityId/hole'));
    var idem = operationId ? String(auth.user.userId + ':' + mode + ':' + operationId) : '';
    return readIdempotency(tx, idem).then(function (hit) {
      if (hit && hit.result) return hit.result;
      return tx.get(C.COLLECTIONS.MATCHES, matchId).then(function (doc) {
        if (!doc) return errors.fail('not_found', '比赛不存在');
        return Promise.all([
          getTeamMembers(tx, doc.teamId),
          tx.get(C.COLLECTIONS.CLUBS, doc.teamId)
        ]).then(function (pair) {
          var rec = findMemberRecord(pair[0] || [], auth.user.userId);
          var team = pair[1];
          var denied = scoreShards.assertScoreWrite(
            auth.user.userId,
            rec,
            doc,
            team,
            { entityKind: entityKind, entityId: entityId, groupId: groupId, playerId: entityId },
            mode,
            matchDoc
          );
          if (denied) return errors.fail(denied.code, denied.message);
          return migrateScoresIfNeeded(tx, doc, auth.user.userId).then(function (fresh) {
            var scoreId = scoreShards.scoreDocId(matchId, roundId, hole, entityKind, entityId);
            return tx.get(C.COLLECTIONS.MATCH_SCORES, scoreId).then(function (existing) {
              if (payload.expectedVersion != null && existing && Number(payload.expectedVersion) !== Number(existing.version)) {
                return errors.fail('conflict', '成绩版本冲突', {
                  currentVersion: existing.version,
                  current: existing
                });
              }
              if (payload.expectedVersion != null && !existing && Number(payload.expectedVersion) !== 0) {
                return errors.fail('conflict', '成绩版本冲突', { currentVersion: 0 });
              }
              var now = tx.nowMs();
              var next = existing
                ? Object.assign({}, existing)
                : {
                    scoreId: scoreId,
                    matchId: matchId,
                    teamId: fresh.teamId,
                    roundId: roundId,
                    hole: hole,
                    entityKind: entityKind,
                    entityId: entityId,
                    groupId: groupId,
                    strokes: null,
                    putts: null,
                    version: 0
                  };
              if (mode !== 'putt' && payload.strokes != null) next.strokes = Number(payload.strokes);
              if (payload.putts != null) next.putts = Number(payload.putts);
              if (mode === 'putt' && payload.putts == null && payload.strokes != null) next.putts = Number(payload.strokes);
              next.version = Number(next.version || 0) + 1;
              next.updatedBy = auth.user.userId;
              next.updatedAt = now;
              next.operationId = operationId || next.operationId;
              return tx.put(C.COLLECTIONS.MATCH_SCORES, scoreId, next).then(function () {
                return loadScoreRows(tx, matchId).then(function (rows) {
                  fresh.scoreSummary = scoreShards.computeSummary(rows);
                  fresh.scoreSchemaVersion = scoreShards.SCORE_SCHEMA_VERSION;
                  if (fresh.status === 'scheduled') fresh.status = 'live';
                  var ref = matchDoc.buildRefRow(fresh, now);
                  return tx.put(C.COLLECTIONS.MATCHES, matchId, fresh).then(function () {
                    return tx.put(C.COLLECTIONS.MATCH_REFS, C.matchRefDocId(fresh.teamId, matchId), ref);
                  }).then(function () {
                    var result = errors.ok({
                      score: next,
                      scoreSummary: fresh.scoreSummary,
                      matchId: matchId,
                      scoreData: scoreShards.assembleScoreData(rows),
                      scoreVersions: scoreShards.assembleScoreVersions(rows)
                    });
                    return writeIdempotency(tx, idem, result).then(function () {
                      return result;
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }

  function listTeamMatches(payload) {
    var teamId = String((payload && payload.teamId) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        if (!teamId) return errors.fail('invalid_args', '缺少 teamId');
        return tx.get(C.COLLECTIONS.CLUBS, teamId).then(function (team) {
          if (!team) return errors.fail('not_found', '球队不存在');
          return getTeamMembers(tx, teamId).then(function (members) {
            var rec = findMemberRecord(members, auth.user.userId);
            if (!rec) return errors.fail('forbidden', '无权查看球队比赛');
            return tx.query(C.COLLECTIONS.MATCHES, function (row) {
              return row && row.teamId === teamId;
            }).then(function (rows) {
              var list = [];
              (rows || []).forEach(function (doc) {
                if (!matchDoc.isTeamInternalMatch(doc)) return;
                if (!matchDoc.canReadMatch(auth.user.userId, rec, doc, team)) return;
                list.push(matchDoc.projectCard(doc));
              });
              list.sort(function (a, b) {
                return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
              });
              return errors.ok(list);
            });
          });
        });
      });
    });
  }

  function getMatch(payload) {
    var matchId = String((payload && (payload.matchId || payload.gameId)) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        if (!matchId) return errors.fail('invalid_args', '缺少 matchId');
        return tx.get(C.COLLECTIONS.MATCHES, matchId).then(function (doc) {
          if (!doc) return errors.fail('not_found', '比赛不存在');
          return Promise.all([
            getTeamMembers(tx, doc.teamId),
            tx.get(C.COLLECTIONS.CLUBS, doc.teamId)
          ]).then(function (pair) {
            var rec = findMemberRecord(pair[0] || [], auth.user.userId);
            if (!matchDoc.canReadMatch(auth.user.userId, rec, doc, pair[1])) {
              return errors.fail('forbidden', '无权查看该比赛');
            }
            return hydrateClientMatch(tx, doc);
          });
        });
      });
    });
  }

  function putMatch(payload) {
    var body = (payload && (payload.match || payload.body || payload.matchSnapshot)) || {};
    var matchId = String((payload && payload.matchId) || body.matchId || '').trim();
    var teamId = String((payload && payload.teamId) || body.teamId || '').trim();
    var operationId = String((payload && (payload.operationId || payload.idempotencyKey)) || '').trim();
    var writeKind = String((payload && payload.writeKind) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        if (!matchId || !teamId) return errors.fail('invalid_args', '缺少 matchId 或 teamId');
        if (matchDoc.isDemoMatchId(matchId)) return errors.fail('invalid_args', '拒绝演示比赛');
        var idem = operationId ? String(auth.user.userId + ':putMatch:' + operationId) : '';
        return readIdempotency(tx, idem).then(function (hit) {
          if (hit && hit.result) {
            return tx.get(C.COLLECTIONS.MATCHES, matchId).then(function (doc) {
              if (doc) return errors.ok(matchDoc.toClientMatch(doc));
              return hit.result;
            });
          }
          return tx.get(C.COLLECTIONS.CLUBS, teamId).then(function (team) {
            if (!team) return errors.fail('not_found', '球队不存在');
            return Promise.all([
              getTeamMembers(tx, teamId),
              tx.get(C.COLLECTIONS.MATCHES, matchId)
            ]).then(function (pair) {
              var members = pair[0] || [];
              var existing = pair[1];
              var rec = findMemberRecord(members, auth.user.userId);
              var now = tx.nowMs();
              if (!existing) {
                var dead = assertWritable(team);
                if (dead) return dead;
                var mine = findActiveMember(members, auth.user.userId);
                if (!mine || !permissions.derivePermissions(mine.role, true).canCreateTeamMatch) {
                  return errors.fail('forbidden', '无权创建球队比赛');
                }
                if (!matchDoc.isTeamInternalMatch({ body: body, matchType: body.matchType })) {
                  return errors.fail('invalid_args', '当前仅支持队内赛云端正文');
                }
                var createdAt = Number(body.createdAt || now);
                var safeBody = scoreShards.stripClientScoreData(body);
                var doc = {
                  matchId: matchId,
                  teamId: teamId,
                  creatorUserId: auth.user.userId,
                  createdAt: createdAt,
                  updatedAt: now,
                  version: 1,
                  status: matchDoc.deriveCloudStatus(safeBody),
                  visibility: body.visibility === 'private' ? 'private' : 'team',
                  participantUserIds: matchDoc.collectParticipantUserIds(body),
                  body: safeBody,
                  scoreSchemaVersion: scoreShards.SCORE_SCHEMA_VERSION,
                  scoreSummary: { holesPlayed: 0, playerGross: {}, lastUpdatedAt: 0 }
                };
                doc.participantUserIds = doc.participantUserIds.concat([auth.user.userId]).filter(function (id, i, arr) {
                  return arr.indexOf(id) === i;
                });
                return persistMatchAndRef(tx, doc, now, auth.user.userId, 'create_match').then(function (result) {
                  return writeIdempotency(tx, idem, result).then(function () {
                    return result;
                  });
                });
              }
              if (String(existing.teamId) !== teamId) {
                return errors.fail('forbidden', '比赛不属于该球队');
              }
              var treatingCreate =
                writeKind !== 'full' && writeKind !== 'closeout' && writeKind !== 'score';
              if (treatingCreate && payload.expectedVersion == null) {
                return errors.ok(matchDoc.toClientMatch(existing));
              }
              var access = matchDoc.writeAccess(auth.user.userId, rec, existing, team);
              if (access === 'none') return errors.fail('forbidden', '无权修改该比赛');
              var wantKind = writeKind === 'closeout' ? 'closeout' : 'full';
              if (access === 'closeout') wantKind = 'closeout';
              if (payload && payload.expectedVersion != null && Number(payload.expectedVersion) !== Number(existing.version)) {
                return errors.fail('conflict', 'version 冲突', { currentVersion: existing.version });
              }
              var nextBody = existing.body && typeof existing.body === 'object' ? Object.assign({}, existing.body) : {};
              if (wantKind === 'closeout') {
                if (body.status != null) nextBody.status = body.status;
                if (body.statusLabel != null) nextBody.statusLabel = body.statusLabel;
                if (body.groups != null) nextBody.groups = body.groups;
                if (body.pairings != null) nextBody.pairings = body.pairings;
                if (body.registerInfo != null) nextBody.registerInfo = body.registerInfo;
              } else {
                nextBody = scoreShards.stripClientScoreData(Object.assign({}, nextBody, body));
              }
              nextBody.matchId = existing.matchId;
              nextBody.teamId = existing.teamId;
              nextBody.createdBy = existing.creatorUserId;
              nextBody.creatorId = existing.creatorUserId;
              existing.body = nextBody;
              existing.status = matchDoc.deriveCloudStatus(nextBody);
              existing.participantUserIds = matchDoc.collectParticipantUserIds(nextBody);
              existing.version = Number(existing.version || 1) + 1;
              existing.updatedAt = now;
              if (!existing.scoreSchemaVersion) existing.scoreSchemaVersion = scoreShards.SCORE_SCHEMA_VERSION;
              var auditName = team.status === C.TEAM_STATUS.DISSOLVED ? 'closeout_match_dissolved' : 'update_match';
              return persistMatchAndRef(tx, existing, now, auth.user.userId, auditName).then(function (result) {
                return writeIdempotency(tx, idem, result).then(function () {
                  return result;
                });
              });
            });
          });
        });
      });
    });
  }

  function submitHoleScore(payload) {
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return applyScorePatch(tx, auth, payload || {}, 'score');
      });
    });
  }

  function submitScore(payload) {
    return submitHoleScore(payload);
  }

  function updatePutt(payload) {
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return applyScorePatch(tx, auth, payload || {}, 'putt');
      });
    });
  }

  function correctScore(payload) {
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return applyScorePatch(tx, auth, payload || {}, 'correct');
      });
    });
  }

  function completeMatch(payload) {
    var matchId = String((payload && payload.matchId) || '').trim();
    var operationId = String((payload && (payload.operationId || payload.idempotencyKey)) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        if (!matchId) return errors.fail('invalid_args', '缺少 matchId');
        var idem = operationId ? String(auth.user.userId + ':completeMatch:' + operationId) : '';
        return readIdempotency(tx, idem).then(function (hit) {
          if (hit && hit.result) {
            return tx.get(C.COLLECTIONS.MATCHES, matchId).then(function (doc) {
              if (doc) return hydrateClientMatch(tx, doc);
              return hit.result;
            });
          }
          return tx.get(C.COLLECTIONS.MATCHES, matchId).then(function (doc) {
            if (!doc) return errors.fail('not_found', '比赛不存在');
            return Promise.all([
              getTeamMembers(tx, doc.teamId),
              tx.get(C.COLLECTIONS.CLUBS, doc.teamId)
            ]).then(function (pair) {
              var rec = findMemberRecord(pair[0] || [], auth.user.userId);
              var denied = scoreShards.assertScoreWrite(auth.user.userId, rec, doc, pair[1], {}, 'complete', matchDoc);
              if (denied) return errors.fail(denied.code, denied.message);
              return migrateScoresIfNeeded(tx, doc, auth.user.userId).then(function (fresh) {
                return loadScoreRows(tx, matchId).then(function (rows) {
                  var summary = scoreShards.computeSummary(rows);
                  var now = tx.nowMs();
                  fresh.status = 'finished';
                  if (!fresh.body || typeof fresh.body !== 'object') fresh.body = {};
                  fresh.body.status = 'finished';
                  fresh.body.statusLabel = '已结束';
                  fresh.scoreSummary = summary;
                  fresh.version = Number(fresh.version || 1) + 1;
                  fresh.updatedAt = now;
                  return persistMatchAndRef(tx, fresh, now, auth.user.userId, pair[1] && pair[1].status === C.TEAM_STATUS.DISSOLVED ? 'closeout_match_dissolved' : 'complete_match').then(function (result) {
                    return writeIdempotency(tx, idem, result).then(function () {
                      return hydrateClientMatch(tx, fresh);
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }

  function upsertMatchRef(payload) {
    var matchId = String((payload && (payload.matchId || payload.gameId)) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        if (!matchId) return errors.fail('invalid_args', '缺少 matchId');
        return tx.get(C.COLLECTIONS.MATCHES, matchId).then(function (doc) {
          if (!doc) return errors.fail('not_found', '比赛正文不存在，不能单独写索引');
          return getTeamMembers(tx, doc.teamId).then(function (members) {
            var rec = findMemberRecord(members, auth.user.userId);
            return tx.get(C.COLLECTIONS.CLUBS, doc.teamId).then(function (team) {
              var access = matchDoc.writeAccess(auth.user.userId, rec, doc, team);
              if (access === 'none') return errors.fail('forbidden', '无权刷新比赛索引');
              var now = tx.nowMs();
              var ref = matchDoc.buildRefRow(doc, now);
              return tx.put(C.COLLECTIONS.MATCH_REFS, C.matchRefDocId(doc.teamId, matchId), ref).then(function () {
                return errors.ok(ref);
              });
            });
          });
        });
      });
    });
  }

  function confirmMatchMigration(payload) {
    var snap = (payload && (payload.matchSnapshot || payload.match)) || {};
    var matchId = String(snap.matchId || (payload && payload.matchId) || '').trim();
    var teamId = String(snap.teamId || (payload && payload.teamId) || '').trim();
    var claimed = String(snap.createdBy || snap.creatorId || snap.ownerUserId || '').trim();
    var key = String((payload && payload.migrationKey) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        if (!matchId || !teamId) return errors.fail('invalid_args', '缺少 matchId 或 teamId');
        if (matchDoc.isDemoMatchId(matchId) || isDemoTeamId(teamId)) {
          return errors.fail('invalid_args', '拒绝导入演示比赛');
        }
        var mig = key || cryptoUtil.migrationKeyFor(matchId, auth.user.userId);
        return tx.get(C.COLLECTIONS.MIGRATIONS, mig).then(function (existing) {
          if (existing && existing.status === 'success' && existing.result) return existing.result;
          if (claimed && claimed !== auth.user.userId) {
            return errors.fail('ownership_unproven', '无法证明比赛归属');
          }
          return tx.get(C.COLLECTIONS.MATCHES, matchId).then(function (exists) {
            if (exists) {
              var reused = errors.ok(matchDoc.toClientMatch(exists));
              return tx.put(C.COLLECTIONS.MIGRATIONS, mig, {
                migrationKey: mig,
                matchId: matchId,
                actorUserId: auth.user.userId,
                status: 'success',
                result: reused,
                createdAt: tx.nowMs()
              }).then(function () {
                return reused;
              });
            }
            return tx.get(C.COLLECTIONS.CLUBS, teamId).then(function (team) {
              if (!team) return errors.fail('ownership_unproven', '球队不存在，无法迁移比赛');
              return getTeamMembers(tx, teamId).then(function (members) {
                var mine = findActiveMember(members, auth.user.userId);
                if (!mine || (mine.role !== C.ROLES.SUPER_ADMIN && claimed !== auth.user.userId)) {
                  return errors.fail('ownership_unproven', '无法证明可迁移该比赛');
                }
                var now = tx.nowMs();
                var doc = {
                  matchId: matchId,
                  teamId: teamId,
                  creatorUserId: auth.user.userId,
                  createdAt: Number(snap.createdAt || now),
                  updatedAt: now,
                  version: 1,
                  status: matchDoc.deriveCloudStatus(snap),
                  visibility: 'team',
                  participantUserIds: matchDoc.collectParticipantUserIds(snap),
                  body: snap,
                  migratedFrom: 'teamMatchStore',
                  scoreSchemaVersion: 1
                };
                return persistMatchAndRef(tx, doc, now, auth.user.userId, 'migrate_match').then(function (result) {
                  return migrateScoresIfNeeded(tx, doc, auth.user.userId).then(function () {
                    return tx.put(C.COLLECTIONS.MIGRATIONS, mig, {
                      migrationKey: mig,
                      matchId: matchId,
                      actorUserId: auth.user.userId,
                      status: 'success',
                      result: result,
                      createdAt: now
                    }).then(function () {
                      return result;
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }

  function searchUsers(payload) {
    var query = String((payload && (payload.query || payload.keyword)) || '').trim();
    var teamId = String((payload && payload.teamId) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        if (!query) return errors.ok([]);
        return Promise.all([
          tx.query(C.COLLECTIONS.PROFILES, function (row) {
            if (!row) return false;
            if (row.userId === query) return true;
            if (query.length < 2) return false;
            return String(row.searchKey || row.displayName || '').toLowerCase().indexOf(query.toLowerCase()) >= 0;
          }),
          teamId ? getTeamMembers(tx, teamId) : Promise.resolve([]),
          teamId
            ? tx.query(C.COLLECTIONS.APPLICATIONS, function (a) {
                return a && a.teamId === teamId && a.status === C.APP_STATUS.PENDING;
              })
            : Promise.resolve([])
        ]).then(function (triple) {
          var profiles = triple[0] || [];
          var members = triple[1] || [];
          var apps = triple[2] || [];
          var memberIds = {};
          members.forEach(function (m) {
            if (m.memberStatus === C.MEMBER_STATUS.ACTIVE) memberIds[m.userId] = true;
          });
          var pendingIds = {};
          apps.forEach(function (a) {
            pendingIds[a.userId] = true;
          });
          var list = [];
          profiles.forEach(function (p) {
            if (p.userId === auth.user.userId) return;
            if (memberIds[p.userId] || pendingIds[p.userId]) return;
            list.push(publicUser(p));
          });
          return errors.ok(list.slice(0, 8));
        });
      });
    });
  }

  function listNotices() {
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return tx.query(C.COLLECTIONS.NOTICES, function (row) {
          return row && row.recipientUserId === auth.user.userId;
        }).then(function (list) {
          return errors.ok(list);
        });
      });
    });
  }

  function getApplication(payload) {
    var applicationId = String((payload && payload.applicationId) || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        return tx.get(C.COLLECTIONS.APPLICATIONS, applicationId).then(function (app) {
          if (!app) return errors.fail('not_found', '申请不存在');
          return tx.get(C.COLLECTIONS.CLUBS, app.teamId).then(function (team) {
            if (!team) return errors.fail('not_found', '球队不存在');
            return getTeamMembers(tx, app.teamId).then(function (members) {
              var view = mapTeamView(team, members, auth.user.userId);
              var canReview = !!(view.permissions && view.permissions.canReviewJoinRequests);
              if (app.userId !== auth.user.userId && !canReview) {
                return errors.fail('forbidden', '无权查看该申请');
              }
              return errors.ok({
                application: app,
                team: view
              });
            });
          });
        });
      });
    });
  }

  function confirmMigration(payload) {
    var snap = (payload && (payload.teamSnapshot || payload.team)) || {};
    var teamId = String(snap.teamId || snap.id || '').trim();
    var claimedOwner = String(snap.createdBy || snap.ownerUserId || snap.createdByUserId || '').trim();
    return run(function (tx) {
      return requireActor(tx, wxCtx).then(function (auth) {
        if (!auth.ok) return auth;
        if (!teamId) return errors.fail('invalid_args', '缺少 teamId');
        if (isDemoTeamId(teamId)) return errors.fail('invalid_args', '拒绝导入演示球队');
        var key = String((payload && payload.migrationKey) || cryptoUtil.migrationKeyFor(teamId, auth.user.userId));
        return tx.get(C.COLLECTIONS.MIGRATIONS, key).then(function (existing) {
          if (existing && existing.status === 'success' && existing.result) {
            return existing.result;
          }
          if (claimedOwner !== auth.user.userId) {
            return errors.fail('ownership_unproven', '无法证明归属，未授予 superAdmin');
          }
          return tx.get(C.COLLECTIONS.CLUBS, teamId).then(function (exists) {
            if (exists) {
              var reused = errors.ok({ teamId: teamId, reused: true });
              return tx.put(C.COLLECTIONS.MIGRATIONS, key, {
                migrationKey: key,
                teamId: teamId,
                actorUserId: auth.user.userId,
                status: 'success',
                result: reused,
                createdAt: tx.nowMs()
              }).then(function () {
                return reused;
              });
            }
            var now = tx.nowMs();
            var name = String(snap.name || snap.fullName || '').trim();
            if (!name) return errors.fail('invalid_args', '球队名称不能为空');
            var team = {
              teamId: teamId,
              schemaVersion: C.SCHEMA_VERSION,
              name: name,
              shortName: String(snap.shortName || name).trim(),
              city: String(snap.region || snap.city || '').trim(),
              logo: String(snap.logo || '').trim(),
              intro: String(snap.desc || snap.intro || '').trim(),
              homeCourse: '',
              status: C.TEAM_STATUS.ACTIVE,
              ownerUserId: auth.user.userId,
              createdAt: now,
              updatedAt: now,
              version: 1,
              dissolvedAt: 0,
              acceptingMembers: true,
              migratedFrom: 'gb_created_teams_v1'
            };
            var member = {
              memberId: cryptoUtil.newId('tm'),
              teamId: teamId,
              userId: auth.user.userId,
              displayName: auth.user.displayName,
              avatar: auth.user.avatar,
              role: C.ROLES.SUPER_ADMIN,
              isCaptain: true,
              grants: [],
              memberStatus: C.MEMBER_STATUS.ACTIVE,
              joinedAt: now,
              leftAt: 0,
              updatedAt: now
            };
            return tx
              .put(C.COLLECTIONS.CLUBS, teamId, team)
              .then(function () {
                return tx.put(C.COLLECTIONS.MEMBERS, C.memberDocId(teamId, auth.user.userId), member);
              })
              .then(function () {
                return writeAudit(tx, teamId, auth.user.userId, 'migrate_team', { migrationKey: key });
              })
              .then(function () {
                var created = errors.ok(mapTeamView(team, [member], auth.user.userId));
                return tx
                  .put(C.COLLECTIONS.MIGRATIONS, key, {
                    migrationKey: key,
                    teamId: teamId,
                    actorUserId: auth.user.userId,
                    status: 'success',
                    result: created,
                    createdAt: now
                  })
                  .then(function () {
                    return created;
                  });
              });
          });
        });
      });
    });
  }

  var api = {
    resolveIdentity: resolveIdentity,
    createMyProfile: createMyProfile,
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
    setAdmin: function (payload) {
      return setAdmin(payload, true);
    },
    unsetAdmin: function (payload) {
      return setAdmin(payload, false);
    },
    setCaptain: setCaptain,
    unsetCaptain: unsetCaptain,
    transferOwnership: transferOwnership,
    leaveTeam: leaveTeam,
    dissolveTeam: dissolveTeam,
    listTeamMatches: listTeamMatches,
    getMatch: getMatch,
    putMatch: putMatch,
    submitScore: submitScore,
    submitHoleScore: submitHoleScore,
    updatePutt: updatePutt,
    correctScore: correctScore,
    completeMatch: completeMatch,
    upsertMatchRef: upsertMatchRef,
    confirmMatchMigration: confirmMatchMigration,
    searchUsers: searchUsers,
    listNotices: listNotices,
    getApplication: getApplication,
    confirmMigration: confirmMigration,
    setNowMs: function (n) {
      if (store.setNowMs) store.setNowMs(n);
    }
  };

  return api;
}

function stripClientIdentity(event) {
  var e = event && typeof event === 'object' ? event : {};
  var payload = e.payload && typeof e.payload === 'object' ? Object.assign({}, e.payload) : Object.assign({}, e);
  delete payload.action;
  delete payload.type;
  delete payload.OPENID;
  delete payload.openid;
  delete payload.userId;
  delete payload.role;
  delete payload.ownerUserId;
  delete payload.currentUserRole;
  if (e.payload && typeof e.payload === 'object') {
    payload.teamId = e.payload.teamId || payload.teamId;
    payload.applicationId = e.payload.applicationId || payload.applicationId;
    payload.decision = e.payload.decision || payload.decision;
    payload.token = e.payload.token || payload.token;
    payload.targetUserId =
      e.payload.targetUserId || e.payload.memberUserId || e.payload.userId || payload.targetUserId;
    payload.toUserId = e.payload.toUserId || e.payload.targetUserId || payload.toUserId;
    payload.keyword = e.payload.keyword || payload.keyword;
    payload.query = e.payload.query || payload.query;
    payload.message = e.payload.message || payload.message;
    payload.expectedVersion = e.payload.expectedVersion != null ? e.payload.expectedVersion : payload.expectedVersion;
    payload.ttlMs = e.payload.ttlMs || payload.ttlMs;
    payload.idempotencyKey = e.payload.idempotencyKey || payload.idempotencyKey;
    payload.migrationKey = e.payload.migrationKey || payload.migrationKey;
    payload.teamSnapshot = e.payload.teamSnapshot || e.payload.team || payload.teamSnapshot;
    payload.name = e.payload.name || payload.name;
    payload.displayName = e.payload.displayName || payload.displayName;
    payload.inviteId = e.payload.inviteId || payload.inviteId;
    payload.makeAdmin = e.payload.makeAdmin;
    payload.slogan = e.payload.slogan != null ? e.payload.slogan : payload.slogan;
    payload.acceptingMembers =
      e.payload.acceptingMembers != null ? e.payload.acceptingMembers : payload.acceptingMembers;
    payload.matchId = e.payload.matchId || e.payload.gameId || payload.matchId;
    payload.title = e.payload.title || payload.title;
    payload.dateText = e.payload.dateText || payload.dateText;
    payload.status = e.payload.status || payload.status;
    payload.snapshot = e.payload.snapshot || payload.snapshot;
    payload.relationType = e.payload.relationType || payload.relationType;
    payload.confirmName = e.payload.confirmName || e.payload.teamName || payload.confirmName;
    payload.match = e.payload.match || e.payload.body || payload.match;
    payload.body = e.payload.body || payload.body;
    payload.operationId = e.payload.operationId || payload.operationId;
    payload.writeKind = e.payload.writeKind || payload.writeKind;
    payload.matchSnapshot = e.payload.matchSnapshot || payload.matchSnapshot;
    payload.hole = e.payload.hole != null ? e.payload.hole : payload.hole;
    payload.entityId = e.payload.entityId || e.payload.playerId || payload.entityId;
    payload.entityKind = e.payload.entityKind || payload.entityKind;
    payload.groupId = e.payload.groupId || payload.groupId;
    payload.roundId = e.payload.roundId || payload.roundId;
    payload.strokes = e.payload.strokes != null ? e.payload.strokes : payload.strokes;
    payload.putts = e.payload.putts != null ? e.payload.putts : payload.putts;
  }
  return payload;
}

function dispatch(store, wxCtx, event) {
  var action = String((event && (event.action || event.type)) || '').trim();
  var payload = stripClientIdentity(event);
  var engine = createEngine(store, wxCtx || {});
  log.info('dispatch', { action: action });
  if (!action) return Promise.resolve(errors.fail('invalid_args', '缺少 action'));
  if (typeof engine[action] !== 'function') {
    return Promise.resolve(errors.fail('unknown_action', '未知方法'));
  }
  return Promise.resolve(engine[action](payload)).catch(function (err) {
    log.error('engine_error', { action: action, message: err && err.message });
    return errors.fail('internal_error', '服务异常');
  });
}

module.exports = {
  createEngine: createEngine,
  dispatch: dispatch,
  stripClientIdentity: stripClientIdentity,
  CONTRACT_METHODS: C.CONTRACT_METHODS,
  EXTRA_METHODS: C.EXTRA_METHODS
};
