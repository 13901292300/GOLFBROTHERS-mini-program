/**
 * 取消管理员：选人页确认 + 角色收回 + 云端状态幂等。
 * 运行：node scripts/teamClub.unsetAdmin.selftest.js
 */

global.__TEAM_CLUB_REPO_MODE = 'local';

var path = require('path');
var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var selectPagePath = path.join(mini, 'subpackages/player/pages/me/team-manage/select/index.js');
var cloudLib = path.join(root, 'cloudfunctions/teamClub/lib');

var passed = 0;
var failed = 0;
function assert(label, ok) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
  } else {
    failed += 1;
    console.log('FAIL  ' + label);
  }
}

var storage = {};
function installWx() {
  global.wx = {
    getStorageSync: function (k) { return storage[k]; },
    setStorageSync: function (k, v) { storage[k] = v; },
    removeStorageSync: function (k) { delete storage[k]; },
    showToast: function () {},
    showModal: function (opts) {
      if (opts && opts.success) opts.success({ confirm: true });
    },
    navigateBack: function () {},
    getWindowInfo: function () {
      return { statusBarHeight: 44, windowWidth: 375, screenWidth: 375 };
    },
    getSystemInfoSync: function () {
      return { statusBarHeight: 44, windowWidth: 375, screenWidth: 375 };
    },
    getMenuButtonBoundingClientRect: function () {
      return { top: 48, height: 32, bottom: 80, left: 279, right: 367, width: 88 };
    }
  };
}
global.getApp = function () {
  return { getTheme: function () { return 'bright'; } };
};

function clearCaches() {
  Object.keys(require.cache).forEach(function (k) {
    var n = String(k).replace(/\\/g, '/');
    if (n.indexOf('/teamClub/') >= 0 || /\/teamDirectory\.js$/.test(n) || n.indexOf('/team-manage/select/index.js') >= 0) {
      delete require.cache[k];
    }
  });
}

function restore() {
  try {
    var identity = require(path.join(mini, 'utils/teamClub/identity.js'));
    identity.setTestSession(null);
    if (identity.clearSession) identity.clearSession();
  } catch (e) { /* ignore */ }
  try {
    require(path.join(mini, 'utils/teamClub/repository.js')).resetForTests();
  } catch (e2) { /* ignore */ }
  delete global.__TEAM_CLUB_REPO_MODE;
  storage = {};
  clearCaches();
}

function waitUntil(pred) {
  return new Promise(function (resolve, reject) {
    function step(n) {
      if (pred()) return resolve(true);
      if (n <= 0) return reject(new Error('timeout'));
      setImmediate(function () { step(n - 1); });
    }
    step(40);
  });
}

function loadSelectPage() {
  var def;
  global.Page = function (d) { def = d; };
  delete require.cache[selectPagePath];
  require(selectPagePath);
  var page = Object.assign({}, def);
  page.data = Object.assign({}, def.data);
  page.setData = function (p) { Object.assign(this.data, p || {}); };
  return page;
}

function roleOf(repo, teamId, userId) {
  var row = ((repo.listMembers(teamId).data) || []).filter(function (m) {
    return m.userId === userId;
  })[0];
  return row ? row.role : '';
}

function menuHas(items, key) {
  return (items || []).some(function (i) { return i && i.key === key; });
}

function auditCount(dump, teamId, action) {
  var col = (dump && dump.team_audits) || {};
  return Object.keys(col).filter(function (id) {
    return col[id] && col[id].teamId === teamId && col[id].action === action;
  }).length;
}

function runLocal(ids) {
  installWx();
  global.__TEAM_CLUB_REPO_MODE = 'local';
  clearCaches();
  storage = {};
  installWx();
  var identity = require(path.join(mini, 'utils/teamClub/identity.js'));
  var repo = require(path.join(mini, 'utils/teamClub/repository.js'));
  var service = require(path.join(mini, 'utils/teamClub/service.js'));
  identity.setTestSession({ userId: ids.owner, displayName: 'Owner' });
  repo.resetForTests();
  var a = repo.createTeam({ name: 'Club A', shortName: 'A' });
  var b = repo.createTeam({ name: 'Club B', shortName: 'B' });
  var idA = a.data.teamId;
  var idB = b.data.teamId;
  repo.addMember(idA, ids.admin, { displayName: 'Mgr' });
  repo.addMember(idA, ids.member, { displayName: 'Mem' });
  repo.addMember(idB, ids.admin, { displayName: 'Mgr' });
  var v0 = repo.getTeam(idA).data.version;
  var refreshHits = 0;
  global.getCurrentPages = function () {
    return [{ refreshAfterMemberAction: function () { refreshHits += 1; } }, {}];
  };

  return service.applyMemberAction(idA, 'set_admin', ids.admin).then(function (setRes) {
    assert('admin promoted', setRes.ok && roleOf(repo, idA, ids.admin) === 'admin');
    assert('club B isolated after promote', roleOf(repo, idB, ids.admin) === 'member');
    var page = loadSelectPage();
    page.onLoad({ teamId: idA, action: 'unset_admin' });
    return waitUntil(function () {
      return page.data.pageState === 'ready' && (page.data.members || []).some(function (m) {
        return m.userId === ids.admin;
      });
    }).then(function () {
      assert('super not in unset pick list', (page.data.members || []).every(function (m) {
        return m.userId !== ids.owner;
      }));
      page.onTapMember({ currentTarget: { dataset: { userId: ids.admin, name: 'Mgr' } } });
      page.onConfirm();
      return waitUntil(function () {
        return roleOf(repo, idA, ids.admin) === 'member';
      });
    }).then(function () {
      assert('page confirm demoted to member', roleOf(repo, idA, ids.admin) === 'member');
      assert('detail page refresh callback', refreshHits >= 1);
      identity.setTestSession({ userId: ids.admin, displayName: 'Mgr' });
      return service.getMemberManageMenu(idA);
    });
  }).then(function (menu) {
    assert(
      'demoted user lost admin menu',
      menu.ok && !menuHas(menu.items, 'unset_admin') && !menu.permissions.canManageAdmins
    );
    return service.applyMemberAction(idA, 'unset_admin', ids.member);
  }).then(function (denied) {
    assert('demoted caller forbidden', !denied.ok && denied.code === 'forbidden');
    identity.setTestSession({ userId: ids.member, displayName: 'Mem' });
    return service.applyMemberAction(idA, 'unset_admin', ids.admin);
  }).then(function (asMember) {
    assert('ordinary member forbidden', !asMember.ok && asMember.code === 'forbidden');
    identity.setTestSession({ userId: ids.owner, displayName: 'Owner' });
    return service.applyMemberAction(idA, 'unset_admin', ids.owner);
  }).then(function (asSuper) {
    assert('unique super refused', !asSuper.ok && asSuper.code === 'forbidden' && roleOf(repo, idA, ids.owner) === 'super_admin');
    var v1 = repo.getTeam(idA).data.version;
    var again = repo.unsetAdmin(idA, ids.admin);
    assert('repeat local unset is alreadyApplied', again.ok && again.alreadyApplied === true);
    assert('repeat local unset does not bump version', repo.getTeam(idA).data.version === v1);
    assert('club B still isolated', roleOf(repo, idB, ids.admin) === 'member');
    assert('first demote did bump version', v1 > v0);
  });
}

function runCloud() {
  var engine = require(path.join(cloudLib, 'engine.js'));
  var memoryStore = require(path.join(cloudLib, 'memoryStore.js'));
  var store = memoryStore.createMemoryStore();
  function call(openid, action, payload) {
    return engine.dispatch(store, { OPENID: openid }, { action: action, payload: payload || {} });
  }
  var oid = { owner: 'oid_ua_owner', admin: 'oid_ua_mgr', member: 'oid_ua_mem' };
  var teamId = '';
  var adminUid = '';
  var ownerUid = '';
  return call(oid.owner, 'createMyProfile', { displayName: 'Owner' }).then(function (p) {
    ownerUid = p.data.userId;
    return call(oid.admin, 'createMyProfile', { displayName: 'Manager' });
  }).then(function (p) {
    adminUid = p.data.userId;
    return call(oid.member, 'createMyProfile', { displayName: 'Member' });
  }).then(function () {
    return call(oid.owner, 'createTeam', { name: 'Cloud Unset Club' });
  }).then(function (created) {
    teamId = created.data.teamId;
    return call(oid.owner, 'addMember', { teamId: teamId, targetUserId: adminUid, displayName: 'Manager' });
  }).then(function () {
    return call(oid.owner, 'setAdmin', {
      teamId: teamId,
      targetUserId: adminUid,
      operationId: 'op-set-1'
    });
  }).then(function (setAd) {
    assert('cloud setAdmin', setAd.ok && setAd.data.role === 'admin' && !setAd.alreadyApplied);
    return call(oid.owner, 'getTeam', { teamId: teamId }).then(function (tSet) {
      var vSet = tSet.data.version;
      var nSet = auditCount(store.dump(), teamId, 'set_admin');
      assert('cloud first setAdmin one audit', nSet === 1);
      return call(oid.owner, 'setAdmin', {
        teamId: teamId,
        targetUserId: adminUid,
        operationId: 'op-set-1'
      }).then(function (sameSet) {
        assert(
          'repeat setAdmin same operationId alreadyApplied',
          sameSet.ok && sameSet.alreadyApplied === true && sameSet.data.role === 'admin'
        );
        return call(oid.owner, 'setAdmin', {
          teamId: teamId,
          targetUserId: adminUid,
          operationId: 'op-set-2'
        });
      }).then(function (diffSet) {
        assert('repeat setAdmin different operationId alreadyApplied', diffSet.ok && diffSet.alreadyApplied === true);
        return call(oid.owner, 'getTeam', { teamId: teamId }).then(function (tSet2) {
          assert('repeat setAdmin does not bump version', tSet2.data.version === vSet);
          assert('repeat setAdmin does not add audit', auditCount(store.dump(), teamId, 'set_admin') === nSet);
          return call(oid.member, 'unsetAdmin', { teamId: teamId, targetUserId: adminUid });
        });
      });
    });
  }).then(function (denied) {
    assert('cloud member forbidden', !denied.ok && denied.code === 'forbidden');
    return call(oid.admin, 'unsetAdmin', { teamId: teamId, targetUserId: adminUid });
  }).then(function (deniedAdmin) {
    assert('cloud admin forbidden', !deniedAdmin.ok && deniedAdmin.code === 'forbidden');
    return call(oid.owner, 'unsetAdmin', { teamId: teamId, targetUserId: ownerUid });
  }).then(function (deniedSuper) {
    assert('cloud super refused', !deniedSuper.ok && deniedSuper.code === 'forbidden');
    return call(oid.owner, 'getTeam', { teamId: teamId });
  }).then(function (before) {
    var vBefore = before.data.version;
    return call(oid.owner, 'unsetAdmin', {
      teamId: teamId,
      targetUserId: adminUid,
      operationId: 'op-unset-1'
    }).then(function (first) {
      assert('cloud first unset ok', first.ok && first.data.role === 'member' && !first.alreadyApplied);
      return call(oid.owner, 'getTeam', { teamId: teamId }).then(function (mid) {
        var n1 = auditCount(store.dump(), teamId, 'unset_admin');
        var v1 = mid.data.version;
        var club = (store.dump().team_clubs || {})[teamId] || {};
        var admins = club.adminUserIds || [];
        assert('cloud first unset bumps version', v1 === vBefore + 1);
        assert('cloud first unset one audit', n1 === 1);
        assert('cloud adminUserIds dropped target', admins.indexOf(adminUid) < 0);
        return call(oid.owner, 'unsetAdmin', {
          teamId: teamId,
          targetUserId: adminUid,
          operationId: 'op-unset-1'
        }).then(function (sameOp) {
          assert('same operationId alreadyApplied', sameOp.ok && sameOp.alreadyApplied === true && sameOp.data.role === 'member');
          return call(oid.owner, 'unsetAdmin', {
            teamId: teamId,
            targetUserId: adminUid,
            operationId: 'op-unset-2'
          });
        }).then(function (diffOp) {
          assert('different operationId alreadyApplied', diffOp.ok && diffOp.alreadyApplied === true);
          return call(oid.owner, 'getTeam', { teamId: teamId }).then(function (after) {
            assert('repeat does not bump version', after.data.version === v1);
            assert('repeat does not add audit', auditCount(store.dump(), teamId, 'unset_admin') === n1);
          });
        });
      });
    });
  });
}

installWx();
var ids1 = { owner: 'ua_owner', admin: 'ua_mgr', member: 'ua_mem' };
var ids2 = { owner: 'ub_owner', admin: 'ub_mgr', member: 'ub_mem' };

runLocal(ids1)
  .then(function () {
    restore();
    global.__TEAM_CLUB_REPO_MODE = 'local';
    installWx();
    return runLocal(ids2);
  })
  .then(function () {
    restore();
    return runCloud();
  })
  .then(function () {
    restore();
    console.log('\n---- teamClub.unsetAdmin.selftest ----');
    console.log('passed=' + passed + ' failed=' + failed);
    process.exit(failed ? 1 : 0);
  })
  .catch(function (err) {
    failed += 1;
    console.log('FAIL  suite', err && err.message);
    restore();
    console.log('\n---- teamClub.unsetAdmin.selftest ----');
    console.log('passed=' + passed + ' failed=' + failed);
    process.exit(1);
  });
