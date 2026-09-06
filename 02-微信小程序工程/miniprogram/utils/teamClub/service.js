'use strict';

/**
 * 球队域页面适配层：唯一事实源为 ./repository.js。
 * 不读取 mock.js，不默认身份 me，无固定延迟。
 */

var mockAvatars = require('../mockAvatars.js');
var roles = require('./roles.js');
var memberListView = require('./memberListView.js');
var notices = require('./notices.js');
var model = require('./model.js');
var routes = require('./routes.js');
var factory = require('./repoFactory.js');
var identity = require('./identity.js');
var teamLogo = require('./teamLogo.js');

function repo() {
  return factory.get();
}

var CREATE_TEAM_PATH = '/subpackages/player/pages/me/teams/create/index';
var TEAM_EDIT_PATH = '/subpackages/player/pages/me/team-edit/index';
var TEAM_NOTICES_PATH = '/subpackages/player/pages/me/team-notices/index';
var TEAM_APPLICATIONS_PATH = '/subpackages/player/pages/me/team-applications/index';
var TEAM_DETAIL_PATH = '/subpackages/player/pages/me/team-detail/index';
var TEAM_INVITE_PATH = routes.TEAM_INVITE_PAGE;
var TEAM_MANAGE_SELECT_PATH = '/subpackages/player/pages/me/team-manage/select/index';
var TEAM_MANAGE_INVITE_PATH = '/subpackages/player/pages/me/team-manage/invite/index';
var TEAM_APPLICATION_PATH = notices.APPLICATION_DETAIL_PATH;
var TEAM_MATCH_CREATE_PATH = '/subpackages/create/pages/team-internal/index';
var MATCH_DETAIL_PATH = '/subpackages/tournament/pages/detail/index';

function resolveLogo(seed, explicit) {
  var url = String(explicit || '').trim();
  if (url) return mockAvatars.resolveAvatar(url, seed);
  return mockAvatars.pickMockAvatar(seed);
}

function decorateTeam(team) {
  if (!team) return null;
  var fullName = String(team.fullName || team.name || '').trim() || '未命名球队';
  var regionText = String(team.regionText || team.city || team.region || '').trim();
  var memberCount = Number(team.memberCount) || 0;
  var memberCountText = memberCount + '人';
  var metaParts = [];
  if (regionText) metaParts.push(regionText);
  if (memberCountText) metaParts.push(memberCountText);
  var logo = teamLogo.authorityLogo(team.logo);
  return Object.assign({}, team, {
    id: String(team.id || team.teamId || ''),
    logo: logo,
    logoSrc: team.logoSrc || (logo.indexOf('https://') === 0 ? logo : ''),
    logoPlaceholder: teamLogo.PLACEHOLDER,
    logoBroken: !!team.logoBroken,
    fullName: fullName,
    regionText: regionText,
    memberCount: memberCount,
    memberCountText: memberCountText,
    metaText: metaParts.join(' · '),
    foundedDateText: team.foundedDateText || ''
  });
}

function hydrateTeam(team) {
  if (!team) return Promise.resolve(null);
  return teamLogo.attachDisplay(decorateTeam(team));
}

function hydrateTeams(list) {
  return Promise.all((list || []).map(function (row) {
    return hydrateTeam(row);
  }));
}

function decorateMember(m) {
  if (!m) return null;
  var pinyin = String(m.sortPinyin || m.displayName || '').toLowerCase();
  return Object.assign({}, m, {
    avatar: resolveLogo(m.userId || m.displayName, m.avatar),
    sortPinyin: pinyin,
    letter: memberListView.letterFromPinyin(pinyin)
  });
}

function failEnvelope(err, extra) {
  var code = (err && (err.code || err.reason)) || 'error';
  var out = Object.assign(
    {
      ok: false,
      reason: code,
      code: code,
      message: (err && err.message) || code,
      list: [],
      team: null
    },
    extra || {}
  );
  if (err && err.currentVersion != null) out.currentVersion = err.currentVersion;
  if (err && err.current != null) out.current = err.current;
  return out;
}

function wrap(fn) {
  return Promise.resolve()
    .then(fn)
    .catch(function () {
      return failEnvelope({ code: 'adapter_error' });
    });
}

function asResult(value) {
  return Promise.resolve(value);
}

function listMyTeams() {
  return wrap(function () {
    return asResult(repo().listMyTeams()).then(function (res) {
      if (!res.ok) return failEnvelope(res);
      return hydrateTeams(res.data || []).then(function (list) {
        return { ok: true, list: list, cursor: res.cursor || '', hasMore: !!res.hasMore };
      });
    });
  });
}

function getTeamDetail(teamId) {
  return wrap(function () {
    return asResult(repo().getTeam(teamId)).then(function (res) {
      if (!res.ok) return failEnvelope(res, { team: null });
      return hydrateTeam(res.data).then(function (team) {
        return { ok: true, team: team };
      });
    });
  });
}

function listTeamMembers(teamId, options) {
  return wrap(function () {
    return asResult(repo().listMembers(teamId, options)).then(function (res) {
      if (!res.ok) return failEnvelope(res);
      return { ok: true, list: (res.data || []).map(decorateMember), cursor: res.cursor || '', hasMore: !!res.hasMore };
    });
  });
}

function listTeamMatches(teamId, options) {
  return wrap(function () {
    return asResult(repo().listTeamMatches(teamId, options)).then(function (res) {
      if (!res.ok) return failEnvelope(res);
      return { ok: true, list: res.data || [], cursor: res.cursor || '', hasMore: !!res.hasMore };
    });
  });
}

function mapAction(action) {
  var key = String(action || '').trim();
  if (key === 'set_admin') return function (teamId, uid) { return repo().setAdmin(teamId, uid, true); };
  if (key === 'unset_admin') return function (teamId, uid) { return repo().unsetAdmin(teamId, uid); };
  if (key === 'set_captain') return function (teamId, uid) { return repo().setCaptain(teamId, uid); };
  if (key === 'unset_captain') return function (teamId, uid) { return repo().unsetCaptain(teamId, uid); };
  if (key === 'transfer_super') {
    return function (teamId, uid) {
      return repo().transferOwnership(teamId, uid);
    };
  }
  if (key === 'remove') return function (teamId, uid) { return repo().removeMember(teamId, uid); };
  return null;
}

function applyMemberAction(teamId, action, targetUserId) {
  return wrap(function () {
    var runner = mapAction(action);
    if (!runner) return failEnvelope({ code: 'unknown_action' });
    return asResult(runner(teamId, targetUserId)).then(function (res) {
      if (!res.ok) return failEnvelope(res);
        return Promise.all([asResult(repo().listMembers(teamId)), asResult(repo().getTeam(teamId))]).then(function (pair) {
        var members = pair[0];
        var team = pair[1];
        return hydrateTeam(team.ok ? team.data : null).then(function (deco) {
          return {
            ok: true,
            list: (members.ok ? members.data : []).map(decorateMember),
            team: deco
          };
        });
      });
    });
  });
}

function getPublicTeam(teamId) {
  return wrap(function () {
    return asResult(repo().getTeam(teamId)).then(function (res) {
      if (!res.ok) return failEnvelope(res, { team: null });
      return hydrateTeam(res.data).then(function (team) {
        return {
          ok: true,
          team: {
            id: team.id,
            logo: team.logo,
            logoSrc: team.logoSrc,
            logoPlaceholder: team.logoPlaceholder,
            logoBroken: !!team.logoBroken,
            fullName: team.fullName,
            slogan: team.slogan,
            description: team.description,
            foundedDateText: team.foundedDateText,
            regionText: team.regionText,
            memberCount: team.memberCount,
            memberCountText: team.memberCountText,
            acceptingMembers: team.acceptingMembers !== false
          }
        };
      });
    });
  });
}

function buildJoinPageView(publicTeam, isFormalMember, application) {
  if (isFormalMember) {
    return {
      ctaKey: 'enter',
      ctaLabel: '进入球队',
      ctaAction: 'enter',
      ctaDisabled: false,
      hint: '',
      canEnter: true
    };
  }
  if (!publicTeam || publicTeam.acceptingMembers === false) {
    return {
      ctaKey: 'paused',
      ctaLabel: '暂停接受新成员',
      ctaAction: '',
      ctaDisabled: true,
      hint: '该球队暂时不接受新成员申请。',
      canEnter: false
    };
  }
  var status = application ? String(application.status || '') : '';
  if (status === 'pending') {
    return {
      ctaKey: 'pending',
      ctaLabel: '申请已提交',
      ctaAction: '',
      ctaDisabled: true,
      showCancel: true,
      cancelLabel: '取消申请',
      hint: '管理员正在审核你的入队申请。',
      canEnter: false
    };
  }
  if (publicTeam && publicTeam.status === 'dissolved') {
    return {
      ctaKey: 'dissolved',
      ctaLabel: '球队已解散',
      ctaAction: '',
      ctaDisabled: true,
      hint: '该球队已解散，无法申请加入。',
      canEnter: false
    };
  }
  if (status === 'rejected') {
    return {
      ctaKey: 'reapply',
      ctaLabel: '重新申请',
      ctaAction: 'apply',
      ctaDisabled: false,
      hint: '上次申请未通过，你可以重新提交。',
      canEnter: false
    };
  }
  return {
    ctaKey: 'apply',
    ctaLabel: '申请加入',
    ctaAction: 'apply',
    ctaDisabled: false,
    hint: '',
    canEnter: false
  };
}

function latestApplicationFromTeam(team, userId) {
  if (team && team.viewerApplication) return team.viewerApplication;
  var r = repo();
  if (typeof r.loadStore !== 'function') return null;
  var store = r.loadStore();
  var hit = null;
  (store.applications || []).forEach(function (row) {
    if (!row) return;
    if (String(row.teamId) !== String(team && (team.teamId || team.id)) || String(row.userId) !== String(userId)) return;
    if (!hit || Number(row.createdAt) > Number(hit.createdAt)) hit = row;
  });
  return hit;
}

function getTeamInvitePage(teamId) {
  return wrap(function () {
    return asResult(repo().getTeam(teamId)).then(function (teamRes) {
      if (!teamRes.ok) return failEnvelope(teamRes, { joinView: null });
      return hydrateTeam(teamRes.data).then(function (team) {
        var auth = identity.requireUser();
        var uid = auth.ok ? auth.user.userId : '';
        var app = uid ? latestApplicationFromTeam(teamRes.data, uid) : null;
        var joinView = buildJoinPageView(team, !!team.isFormalMember, app);
        if (joinView) joinView.applicationId = app && (app.applicationId || app.id);
        return { ok: true, team: team, joinView: joinView, isFormalMember: !!team.isFormalMember };
      });
    });
  });
}

function applyToJoinTeam(teamId, options) {
  return wrap(function () {
    return asResult(repo().createApplication(teamId, { message: options && options.message })).then(function (res) {
      if (!res.ok) {
        return asResult(repo().getTeam(teamId)).then(function (teamRes) {
          var page = null;
          if (teamRes.ok) {
            return hydrateTeam(teamRes.data).then(function (team) {
              var auth = identity.requireUser();
              var uid = auth.ok ? auth.user.userId : '';
              var app = uid ? latestApplicationFromTeam(teamRes.data, uid) : null;
              var page = buildJoinPageView(team, !!team.isFormalMember, app);
              return failEnvelope(res, { joinView: page, team: team });
            });
          }
          return failEnvelope(res, { joinView: page });
        });
      }
      if (typeof repo().loadStore === 'function') fanoutApplicationNotices(res.data);
      return asResult(repo().getTeam(teamId)).then(function (after) {
        return hydrateTeam(after.ok ? after.data : null).then(function (team2) {
          var joinView = buildJoinPageView(team2, false, res.data);
          if (joinView) joinView.applicationId = res.data.applicationId;
          return {
            ok: true,
            joinView: joinView,
            team: team2,
            applicationId: res.data.applicationId,
            notices: [],
            messageJump: notices.buildApplicationJump(
              res.data.applicationId,
              '',
              notices.TYPE.JOIN_APPLICATION_RECEIVED
            )
          };
        });
      });
    });
  });
}

function fanoutApplicationNotices(application) {
  var r = repo();
  if (typeof r.loadStore !== 'function') return;
  var app = application || {};
  var members = r.listMembers(app.teamId);
  var store = r.loadStore();
  if (!store.notices) store.notices = [];
  var teamRes = r.getTeam(app.teamId);
  var fullName = teamRes.ok ? teamRes.data.fullName || teamRes.data.name : '球队';
  (members.ok ? members.data : []).forEach(function (member) {
    if (!roles.canReviewTeamApplication(member.role, member.grants)) return;
    var recipient = String(member.userId || '').trim();
    if (!recipient) return;
    var nid = notices.noticeIdFor(app.applicationId || app.id, recipient, notices.TYPE.JOIN_APPLICATION_RECEIVED);
    store.notices.push(
      model.createNoticeRecord({
        noticeId: nid,
        category: notices.CATEGORY.TEAM_NOTICE,
        type: notices.TYPE.JOIN_APPLICATION_RECEIVED,
        applicationId: String(app.applicationId || app.id || ''),
        teamId: String(app.teamId || ''),
        recipientUserId: recipient,
        title: String(app.displayName || '有人') + ' 申请加入' + fullName,
        summary: String(app.message || ''),
        createdAt: app.createdAt || model.nowMs(),
        jump: notices.buildApplicationJump(app.applicationId || app.id, nid, notices.TYPE.JOIN_APPLICATION_RECEIVED)
      })
    );
  });
  if (typeof r.persist === 'function') r.persist();
}

function formatDateTime(value) {
  var n = Number(value);
  if (!n) return '';
  var d = new Date(n);
  if (isNaN(d.getTime())) return String(value || '');
  return (
    d.getFullYear() +
    '年' +
    (d.getMonth() + 1) +
    '月' +
    d.getDate() +
    '日 ' +
    (d.getHours() < 10 ? '0' : '') +
    d.getHours() +
    ':' +
    (d.getMinutes() < 10 ? '0' : '') +
    d.getMinutes()
  );
}

function buildApplicationActionView(app, viewerId, team) {
  var uid = String(viewerId || '').trim();
  var canReview = !!(team && team.permissions && team.permissions.canReviewJoinRequests);
  var isApplicant = String(app.userId || '') === uid;
  var status = String(app.status || 'pending');
  var processedBy = String(app.processedBy || '');
  if (status === 'pending' && canReview) {
    return {
      key: 'pending',
      showApprove: true,
      showReject: true,
      approveLabel: '同意加入',
      rejectLabel: '拒绝',
      statusLabel: '',
      hint: ''
    };
  }
  if ((status === 'approved' || status === 'rejected') && canReview && processedBy && processedBy !== uid) {
    return {
      key: 'processed_by_other',
      showApprove: false,
      showReject: false,
      statusLabel: '已由其他管理员处理',
      hint: '已由其他管理员处理'
    };
  }
  if (status === 'approved') {
    return {
      key: 'approved',
      showApprove: false,
      showReject: false,
      statusLabel: '已同意加入',
      hint: isApplicant ? '你已加入该球队。' : '申请人已以普通成员身份入队。'
    };
  }
  if (status === 'rejected') {
    return {
      key: 'rejected',
      showApprove: false,
      showReject: false,
      statusLabel: '已拒绝',
      hint: isApplicant ? '申请未通过，你可以重新提交。' : ''
    };
  }
  if (status === 'pending' && isApplicant) {
    return {
      key: 'pending_self',
      showApprove: false,
      showReject: false,
      statusLabel: '申请已提交',
      hint: '管理员正在审核你的入队申请。'
    };
  }
  return {
    key: 'no_access',
    showApprove: false,
    showReject: false,
    statusLabel: '',
    hint: '你无权处理该申请。'
  };
}

function packApplicationDetail(app, team, uid, options) {
  var actionView = buildApplicationActionView(app, uid, team);
  var deco = team ? decorateTeam(team) : null;
  return {
    ok: true,
    detail: {
      id: String(app.applicationId),
      teamId: String(app.teamId || ''),
      status: String(app.status || 'pending'),
      message: String(app.message || ''),
      appliedAt: app.createdAt || '',
      appliedAtText: formatDateTime(app.createdAt),
      processedBy: String(app.processedBy || ''),
      applicant: {
        userId: app.userId,
        displayName: app.displayName,
        nickname: '',
        avatar: resolveLogo(app.userId, '')
      },
      team: deco
        ? {
            id: deco.id,
            fullName: deco.fullName,
            logo: deco.logo,
            logoSrc: deco.logoSrc,
            logoPlaceholder: deco.logoPlaceholder
          }
        : null,
      actionView: actionView,
      jump: notices.buildApplicationJump(app.applicationId, options && options.noticeId, notices.TYPE.JOIN_APPLICATION_RECEIVED)
    }
  };
}

function getJoinApplicationDetail(applicationId, options) {
  return wrap(function () {
    var r = repo();
    if (typeof r.getApplication === 'function') {
      return asResult(r.getApplication(applicationId)).then(function (res) {
        if (!res.ok) return failEnvelope(res, { detail: null });
        var auth = identity.requireUser();
        var uid = auth.ok ? auth.user.userId : '';
        return packApplicationDetail(res.data.application, res.data.team, uid, options);
      });
    }
    var store = r.loadStore();
    var id = String(applicationId || '').trim();
    var app = null;
    (store.applications || []).forEach(function (a) {
      if (a && (a.applicationId === id || a.id === id)) app = a;
    });
    if (!app) return failEnvelope({ code: 'not_found' }, { detail: null });
    return asResult(r.getTeam(app.teamId)).then(function (publicTeam) {
      var auth = identity.requireUser();
      var uid = auth.ok ? auth.user.userId : '';
      return packApplicationDetail(app, publicTeam.ok ? publicTeam.data : null, uid, options);
    });
  });
}

function reviewJoinApplication(applicationId, decision) {
  return wrap(function () {
    return asResult(repo().reviewApplication(applicationId, decision)).then(function (res) {
      if (!res.ok) {
        return getJoinApplicationDetail(applicationId).then(function (detail) {
          return failEnvelope(res, { detail: detail && detail.detail ? detail.detail : null });
        });
      }
      return getJoinApplicationDetail(applicationId);
    });
  });
}

function listTeamNotices(options) {
  return wrap(function () {
    var r = repo();
    if (typeof r.listNotices === 'function') {
      return asResult(r.listNotices(options)).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        return {
          ok: true,
          category: notices.CATEGORY.TEAM_NOTICE,
          categoryLabel: '球队通知',
          list: res.data || [],
          cursor: res.cursor || '',
          hasMore: !!res.hasMore
        };
      });
    }
    var auth = identity.requireUser();
    if (!auth.ok) return failEnvelope(auth);
    var uid = auth.user.userId;
    var store = r.loadStore();
    var list = (store.notices || []).filter(function (row) {
      return row && String(row.recipientUserId) === uid;
    });
    return {
      ok: true,
      category: notices.CATEGORY.TEAM_NOTICE,
      categoryLabel: '球队通知',
      list: list
    };
  });
}

function searchInviteCandidates(teamId, options) {
  return wrap(function () {
    var r = repo();
    var query = options && (options.keyword || options.query);
    if (typeof r.searchUsers === 'function') {
      return asResult(r.searchUsers(query, { teamId: teamId })).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        return { ok: true, list: res.data || [], cursor: res.cursor || '', hasMore: !!res.hasMore };
      });
    }
    return { ok: true, list: [] };
  });
}

function addTeamMember(teamId, userId, options) {
  return wrap(function () {
    return asResult(repo().addMember(teamId, userId, options)).then(function (res) {
      if (!res.ok) return failEnvelope(res);
      return Promise.all([asResult(repo().listMembers(teamId)), asResult(repo().getTeam(teamId))]).then(function (pair) {
        var members = pair[0];
        var team = pair[1];
        return hydrateTeam(team.ok ? team.data : null).then(function (deco) {
          return {
            ok: true,
            reason: '',
            list: (members.ok ? members.data : []).map(decorateMember),
            team: deco
          };
        });
      });
    });
  });
}

function getMemberManageMenu(teamId) {
  return wrap(function () {
    return asResult(repo().getTeam(teamId)).then(function (team) {
      if (!team.ok) return { ok: false, showManageButton: false, items: [] };
      var permissions = team.data.permissions || roles.emptyPermissions();
      var items = roles.buildManageMenuItems(permissions);
      if (permissions.canReviewJoinRequests && team.data.status !== 'dissolved') {
        var pending = Number(team.data.pendingApplicationCount || 0);
        items.unshift({
          key: 'review_applications',
          label: '入队申请',
          badge: pending ? String(pending) : '',
          needsMemberPick: false
        });
      }
      return {
        ok: true,
        showManageButton: roles.canOpenMemberManageMenu(permissions) || !!permissions.canReviewJoinRequests,
        items: items,
        permissions: permissions,
        pendingApplicationCount: Number(team.data.pendingApplicationCount || 0)
      };
    });
  });
}

function listMembersForManageAction(teamId, action) {
  return wrap(function () {
    return Promise.all([asResult(repo().getTeam(teamId)), asResult(repo().listMembers(teamId))]).then(function (pair) {
      var team = pair[0];
      var members = pair[1];
      var permissions = (team.ok && team.data.permissions) || roles.emptyPermissions();
      var uid = identity.currentUserIdOrEmpty();
      var list = (members.ok ? members.data : []).map(decorateMember);
      return {
        ok: team.ok,
        action: String(action || ''),
        meta: roles.getManageActionMeta(action),
        list: roles.filterMembersForAction(list, action, uid, permissions)
      };
    });
  });
}

function filterMembersLocal(list, keyword) {
  return memberListView.filterMembersByKeyword(list, keyword);
}

function buildTeamDetailUrl(teamId) {
  return TEAM_DETAIL_PATH + '?teamId=' + encodeURIComponent(String(teamId || ''));
}

function buildCreateTeamUrl() {
  return CREATE_TEAM_PATH;
}

function buildEditTeamUrl(teamId) {
  return TEAM_EDIT_PATH + '?teamId=' + encodeURIComponent(String(teamId || ''));
}

function buildNoticesUrl() {
  return TEAM_NOTICES_PATH;
}

function buildApplicationsUrl(teamId) {
  return TEAM_APPLICATIONS_PATH + '?teamId=' + encodeURIComponent(String(teamId || ''));
}

function buildMatchDetailUrl(matchId) {
  var id = String(matchId || '').trim();
  return id ? MATCH_DETAIL_PATH + '?matchId=' + encodeURIComponent(id) : '';
}

function buildCreateTeamMatchUrl(teamId) {
  var id = String(teamId || '').trim();
  return id
    ? TEAM_MATCH_CREATE_PATH + '?teamId=' + encodeURIComponent(id)
    : TEAM_MATCH_CREATE_PATH;
}

function buildTeamInviteUrl(teamId) {
  return TEAM_INVITE_PATH + '?teamId=' + encodeURIComponent(String(teamId || ''));
}

function buildManageSelectUrl(teamId, action) {
  return (
    TEAM_MANAGE_SELECT_PATH +
    '?teamId=' +
    encodeURIComponent(String(teamId || '')) +
    '&action=' +
    encodeURIComponent(String(action || ''))
  );
}

function buildManageInviteUrl(teamId) {
  return TEAM_MANAGE_INVITE_PATH + '?teamId=' + encodeURIComponent(String(teamId || ''));
}

function buildApplicationDetailUrl(applicationId, noticeId) {
  return notices.buildApplicationDetailUrl(applicationId, noticeId);
}

function buildTeamShareMessage(team, invite) {
  var row = team && typeof team === 'object' ? team : {};
  var name = String(row.fullName || row.name || '').trim();
  var token = invite && invite.token ? String(invite.token).trim() : '';
  var share = {
    title: name ? '邀请你加入「' + name + '」' : '邀请你加入球队',
    path: token ? routes.buildInviteSharePath(token) : routes.TEAM_INVITE_PAGE
  };
  share.ok = !!token;
  var imageUrl = String(row.logoSrc || '').trim();
  if (imageUrl.indexOf('https://') !== 0 || imageUrl === teamLogo.PLACEHOLDER) imageUrl = '';
  if (imageUrl) share.imageUrl = imageUrl;
  return share;
}

function fetchMyTeams() {
  return listMyTeams().then(function (res) {
    if (!res || !res.ok) return Promise.reject(res || { ok: false, code: 'error' });
    return res.list || [];
  });
}

function fetchTeamDetail(teamId) {
  return getTeamDetail(teamId).then(function (res) {
    if (!res || !res.ok) return Promise.reject(res || { ok: false, code: 'error' });
    return res.team;
  });
}

function noticeOpenUrl(row) {
  if (!row) return '';
  if (row.jump && row.jump.url) return row.jump.url;
  if (row.applicationId) return buildApplicationDetailUrl(row.applicationId, row.noticeId || row.id);
  if (row.teamId) return buildTeamDetailUrl(row.teamId);
  return '';
}

function fetchTeamMembers(teamId, keyword) {
  return asResult(repo().listMembers(teamId, { keyword: keyword })).then(function (res) {
    return res.ok ? (res.data || []).map(decorateMember) : [];
  });
}

function fetchTeamMatches(teamId) {
  return listTeamMatches(teamId).then(function (res) {
    return res && res.ok ? res.list || [] : [];
  });
}

module.exports = {
  CREATE_TEAM_PATH: CREATE_TEAM_PATH,
  TEAM_DETAIL_PATH: TEAM_DETAIL_PATH,
  TEAM_INVITE_PATH: TEAM_INVITE_PATH,
  TEAM_MANAGE_SELECT_PATH: TEAM_MANAGE_SELECT_PATH,
  TEAM_MANAGE_INVITE_PATH: TEAM_MANAGE_INVITE_PATH,
  TEAM_EDIT_PATH: TEAM_EDIT_PATH,
  TEAM_NOTICES_PATH: TEAM_NOTICES_PATH,
  TEAM_APPLICATIONS_PATH: TEAM_APPLICATIONS_PATH,
  TEAM_MATCH_CREATE_PATH: TEAM_MATCH_CREATE_PATH,
  MATCH_DETAIL_PATH: MATCH_DETAIL_PATH,
  resolveCurrentUserId: function () {
    return identity.currentUserIdOrEmpty();
  },
  listMyTeams: listMyTeams,
  getTeamDetail: getTeamDetail,
  listTeamMembers: listTeamMembers,
  listTeamMatches: listTeamMatches,
  applyMemberAction: applyMemberAction,
  getPublicTeam: getPublicTeam,
  getTeamInvitePage: getTeamInvitePage,
  applyToJoinTeam: applyToJoinTeam,
  listTeamNotices: listTeamNotices,
  getJoinApplicationDetail: getJoinApplicationDetail,
  reviewJoinApplication: reviewJoinApplication,
  searchInviteCandidates: searchInviteCandidates,
  addTeamMember: addTeamMember,
  getMemberManageMenu: getMemberManageMenu,
  listMembersForManageAction: listMembersForManageAction,
  createMyProfile: function (input) {
    return wrap(function () {
      var r = repo();
      if (typeof r.createMyProfile !== 'function') {
        return failEnvelope({ code: 'unsupported', message: '当前仓储不支持建档' });
      }
      var body = input && typeof input === 'object' ? input : {};
      return asResult(
        r.createMyProfile({
          displayName: body.displayName,
          avatar: body.avatar
        })
      ).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        return { ok: true, user: res.data };
      });
    });
  },
  createTeam: function (input) {
    return wrap(function () {
      return asResult(repo().createTeam(input || {})).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        return hydrateTeam(res.data).then(function (team) {
          return { ok: true, team: team };
        });
      });
    });
  },
  updateTeam: function (teamId, patch, options) {
    return wrap(function () {
      return asResult(repo().updateTeam(teamId, patch, options)).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        return hydrateTeam(res.data).then(function (team) {
          return { ok: true, team: team };
        });
      });
    });
  },
  createInvite: function (teamId, options) {
    return wrap(function () {
      return asResult(repo().createInvite(teamId, options)).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        return { ok: true, invite: res.data };
      });
    });
  },
  prepareShareInvite: function (teamId, options) {
    return wrap(function () {
      var r = repo();
      var fn = typeof r.prepareShareInvite === 'function' ? r.prepareShareInvite : r.createInvite;
      return asResult(fn.call(r, teamId, options)).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        return { ok: true, invite: res.data };
      });
    });
  },
  revokeInvite: function (token, options) {
    return wrap(function () {
      return asResult(repo().revokeInvite(token, options)).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        return { ok: true, invite: res.data };
      });
    });
  },
  resolveInvite: function (token, options) {
    return wrap(function () {
      return asResult(repo().resolveInvite(token, options)).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        var team = res.data && res.data.team ? res.data.team : res.data;
        return hydrateTeam(team).then(function (deco) {
          return {
            ok: true,
            team: deco,
            invite: res.data && res.data.invite,
            inviter: res.data && res.data.inviter,
            alreadyMember: !!(res.data && res.data.alreadyMember),
            membershipGranted: !!(res.data && res.data.membershipGranted)
          };
        });
      });
    });
  },
  getInviteByToken: function (token, options) {
    return wrap(function () {
      var r = repo();
      var fn = typeof r.getInviteByToken === 'function' ? r.getInviteByToken : r.resolveInvite;
      return asResult(fn.call(r, token, options)).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        var team = res.data && res.data.team ? res.data.team : res.data;
        return hydrateTeam(team).then(function (deco) {
          return {
            ok: true,
            team: deco,
            invite: res.data && res.data.invite,
            inviter: res.data && res.data.inviter,
            alreadyMember: !!(res.data && res.data.alreadyMember),
            membershipGranted: !!(res.data && res.data.membershipGranted)
          };
        });
      });
    });
  },
  acceptInvite: function (token) {
    return wrap(function () {
      var r = repo();
      if (typeof r.acceptInvite !== 'function') {
        return failEnvelope({ code: 'unsupported', message: '当前仓储不支持接受邀请' });
      }
      return asResult(r.acceptInvite(token)).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        var team = res.data && res.data.team ? res.data.team : res.data;
        return hydrateTeam(team).then(function (deco) {
          return {
            ok: true,
            team: deco,
            invite: res.data && res.data.invite,
            alreadyMember: !!(res.data && res.data.alreadyMember),
            membershipGranted: !!(res.data && res.data.membershipGranted)
          };
        });
      });
    });
  },
  leaveTeam: function (teamId) {
    return wrap(function () {
      return asResult(repo().leaveTeam(teamId)).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        return { ok: true };
      });
    });
  },
  dissolveTeam: function (teamId, options) {
    return wrap(function () {
      return asResult(repo().dissolveTeam(teamId, options)).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        return { ok: true };
      });
    });
  },
  buildTeamDetailUrl: buildTeamDetailUrl,
  buildCreateTeamUrl: buildCreateTeamUrl,
  buildEditTeamUrl: buildEditTeamUrl,
  buildNoticesUrl: buildNoticesUrl,
  buildApplicationsUrl: buildApplicationsUrl,
  publishTeamMatchRef: function (match, extra) {
    return module.exports.putMatch(match, extra);
  },
  putMatch: function (match, options) {
    return wrap(function () {
      var r = repo();
      if (typeof r.putMatch !== 'function') {
        return failEnvelope({ code: 'unsupported', message: '当前仓储不支持比赛正文' });
      }
      var m = match || {};
      var opts = options || {};
      return asResult(
        r.putMatch({
          teamId: m.teamId || opts.teamId,
          matchId: m.matchId || opts.matchId,
          match: m,
          operationId: opts.operationId,
          expectedVersion: opts.expectedVersion,
          writeKind: opts.writeKind,
          idempotencyKey: opts.operationId
        })
      ).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        var data = res.data || {};
        try {
          var teamMatchStore = require('../teamMatchStore.js');
          teamMatchStore.saveMatch(data, { cacheOnly: true });
        } catch (e) {
          /* cache optional */
        }
        try {
          require('./matchSync.js').remove(opts.operationId || m.matchId);
        } catch (e2) {
          /* ignore */
        }
        return { ok: true, match: data };
      });
    });
  },
  getMatch: function (matchId) {
    return wrap(function () {
      var r = repo();
      if (typeof r.getMatch !== 'function') {
        return failEnvelope({ code: 'unsupported' });
      }
      return asResult(r.getMatch(matchId)).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        try {
          require('../teamMatchStore.js').saveMatch(res.data, { cacheOnly: true });
        } catch (e) {
          /* ignore */
        }
        return { ok: true, match: res.data };
      });
    });
  },
  submitHoleScore: function (payload) {
    return wrap(function () {
      var r = repo();
      if (typeof r.submitHoleScore !== 'function') {
        return failEnvelope({ code: 'unsupported', message: '当前仓储不支持分片记分' });
      }
      return asResult(r.submitHoleScore(payload || {})).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        try {
          if (payload && payload.matchId && res.data) {
            var store = require('../teamMatchStore.js');
            var cached = store.getMatchById(payload.matchId);
            if (cached) {
              if (res.data.scoreData) cached.scoreData = res.data.scoreData;
              if (res.data.scoreVersions) cached.scoreVersions = res.data.scoreVersions;
              if (res.data.scoreSummary) cached.scoreSummary = res.data.scoreSummary;
              store.saveMatch(cached, { cacheOnly: true });
            }
          }
        } catch (eCache) {
          /* cache optional */
        }
        return { ok: true, data: res.data, score: res.data && res.data.score };
      });
    });
  },
  submitScore: function (payload) {
    return module.exports.submitHoleScore(payload);
  },
  updatePutt: function (payload) {
    return wrap(function () {
      var r = repo();
      if (typeof r.updatePutt !== 'function') {
        return failEnvelope({ code: 'unsupported' });
      }
      return asResult(r.updatePutt(payload || {})).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        return { ok: true, data: res.data, score: res.data && res.data.score };
      });
    });
  },
  correctScore: function (payload) {
    return wrap(function () {
      var r = repo();
      if (typeof r.correctScore !== 'function') {
        return failEnvelope({ code: 'unsupported' });
      }
      return asResult(r.correctScore(payload || {})).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        return { ok: true, data: res.data, score: res.data && res.data.score };
      });
    });
  },
  completeMatch: function (payload) {
    return wrap(function () {
      var scoreSync = require('./scoreSync.js');
      var matchId = payload && payload.matchId;
      if (matchId && scoreSync.hasPending(matchId)) {
        return failEnvelope({ code: 'unsynced_scores', message: '还有未同步的成绩，暂时不能完赛' });
      }
      var r = repo();
      if (typeof r.completeMatch !== 'function') {
        return failEnvelope({ code: 'unsupported' });
      }
      return asResult(r.completeMatch(payload || {})).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        try {
          require('../teamMatchStore.js').saveMatch(res.data, { cacheOnly: true });
        } catch (e) {
          /* ignore */
        }
        return { ok: true, match: res.data };
      });
    });
  },
  confirmMatchMigration: function (payload) {
    return wrap(function () {
      var r = repo();
      if (typeof r.confirmMatchMigration !== 'function') {
        return failEnvelope({ code: 'unsupported' });
      }
      return asResult(r.confirmMatchMigration(payload || {})).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        return { ok: true, match: res.data };
      });
    });
  },
  listJoinApplications: function (teamId, options) {
    return wrap(function () {
      return asResult(repo().listApplications(teamId, options)).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        return { ok: true, list: res.data || [], cursor: res.cursor || '', hasMore: !!res.hasMore };
      });
    });
  },
  cancelJoinApplication: function (applicationId) {
    return wrap(function () {
      return asResult(repo().cancelApplication(applicationId)).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        return { ok: true, application: res.data };
      });
    });
  },
  buildCreateTeamMatchUrl: buildCreateTeamMatchUrl,
  buildMatchDetailUrl: buildMatchDetailUrl,
  buildTeamInviteUrl: buildTeamInviteUrl,
  buildManageSelectUrl: buildManageSelectUrl,
  buildManageInviteUrl: buildManageInviteUrl,
  buildApplicationDetailUrl: buildApplicationDetailUrl,
  buildTeamShareMessage: buildTeamShareMessage,
  filterMembersLocal: filterMembersLocal,
  noticeOpenUrl: noticeOpenUrl,
  fetchMyTeams: fetchMyTeams,
  fetchTeamDetail: fetchTeamDetail,
  fetchTeamMembers: fetchTeamMembers,
  fetchTeamMatches: fetchTeamMatches,
  listConfirmableClubCandidates: function () {
    var migrate = require('./migrate.js');
    return migrate.listConfirmableClubCandidates(identity.currentUserIdOrEmpty());
  },
  confirmLocalClubMigration: function (teamSnapshot) {
    return wrap(function () {
      var r = repo();
      if (typeof r.confirmMigration !== 'function') {
        return failEnvelope({ code: 'unsupported', message: '本地仓储不走云迁移确认' });
      }
      return asResult(r.confirmMigration({ teamSnapshot: teamSnapshot })).then(function (res) {
        if (!res.ok) return failEnvelope(res);
        return { ok: true, team: res.data };
      });
    });
  }
};
