/**
 * 球队域第一阶段：统一模型、身份、本地仓储、旧数据迁移。
 * 运行：node scripts/teamClub.domain.selftest.js
 */

global.__TEAM_CLUB_REPO_MODE = 'local';

var path = require('path');
var fs = require('fs');
var mini = path.join(__dirname, '..', 'miniprogram');

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
global.wx = {
  getStorageSync: function (key) {
    return storage[key];
  },
  setStorageSync: function (key, value) {
    storage[key] = value;
  },
  removeStorageSync: function (key) {
    delete storage[key];
  }
};

function resetModules() {
  Object.keys(require.cache).forEach(function (k) {
    if (k.indexOf('teamClub') >= 0 || k.indexOf('teamDirectory') >= 0 || k.indexOf('teamMatchStore') >= 0) {
      delete require.cache[k];
    }
  });
  storage = {};
  global.wx.getStorageSync = function (key) {
    return storage[key];
  };
  global.wx.setStorageSync = function (key, value) {
    storage[key] = value;
  };
}

resetModules();
var identity = require(path.join(mini, 'utils', 'teamClub', 'identity.js'));
var repo = require(path.join(mini, 'utils', 'teamClub', 'repository.js'));
var service = require(path.join(mini, 'utils', 'teamClub', 'service.js'));
var teamDirectory = require(path.join(mini, 'utils', 'teamDirectory.js'));

identity.clearSession();
repo.resetForTests();

var noLogin = repo.listMyTeams();
assert('无登录返回 need_login', noLogin.ok === false && noLogin.code === 'need_login');
assert('无登录不默认 me', identity.currentUserIdOrEmpty() === '');

identity.setTestSession({ userId: 'me', displayName: '假的' });
assert('拒绝 me 作为正式身份', identity.requireUser().ok === false);

identity.setTestSession({ userId: 'user_owner', displayName: '创建者' });
var created = repo.createTeam({ name: '迁测俱乐部', shortName: '迁测', city: '北京' });
assert('创建成功', created.ok && created.data && created.data.teamId);
assert('创建者是唯一 superAdmin', created.data.currentUserRole === 'super_admin');
var members1 = repo.listMembers(created.data.teamId).data;
var supers = members1.filter(function (m) {
  return m.role === 'super_admin';
});
assert('唯一超级管理员', supers.length === 1 && supers[0].userId === 'user_owner');
assert('captain 与 role 分离', members1[0].role === 'super_admin' && members1[0].isCaptain === true);

var dup = repo.addMember(created.data.teamId, 'user_owner');
assert('同一用户不能重复成为成员', dup.ok === false && dup.code === 'already_member');

var added = repo.addMember(created.data.teamId, 'user_member', { displayName: '队员' });
assert('添加普通成员', added.ok);

identity.setTestSession({ userId: 'user_member', displayName: '队员' });
var steal = repo.setAdmin(created.data.teamId, 'user_owner', true);
assert('普通成员越权被拒绝', steal.ok === false && steal.code === 'forbidden');
var leaveOk = repo.leaveTeam(created.data.teamId);
assert('普通成员可退队', leaveOk.ok);

identity.setTestSession({ userId: 'user_owner', displayName: '创建者' });
repo.addMember(created.data.teamId, 'user_admin', { displayName: '管理' });
repo.setAdmin(created.data.teamId, 'user_admin', true);
identity.setTestSession({ userId: 'user_admin', displayName: '管理' });
var adminTransfer = repo.transferOwnership(created.data.teamId, 'user_member');
assert('管理员不能转让所有权', adminTransfer.ok === false && adminTransfer.code === 'forbidden');
var adminDissolve = repo.dissolveTeam(created.data.teamId);
assert('管理员不能解散', adminDissolve.ok === false && adminDissolve.code === 'forbidden');
var adminInvite = repo.createInvite(created.data.teamId);
assert('管理员可发邀请', adminInvite.ok && adminInvite.data.token.indexOf('inv_') === 0);

identity.setTestSession({ userId: 'user_outsider', displayName: '外人' });
var outsiderUpdate = repo.updateTeam(created.data.teamId, { name: '黑客' });
assert('局外人写操作 forbidden', outsiderUpdate.ok === false && outsiderUpdate.code === 'forbidden');

identity.setTestSession({ userId: 'user_owner', displayName: '创建者' });
var teamNow = repo.getTeam(created.data.teamId).data;
var conflict = repo.updateTeam(created.data.teamId, { city: '上海' }, { expectedVersion: teamNow.version - 1 });
assert('version 冲突', conflict.ok === false && conflict.code === 'conflict');
var okUpdate = repo.updateTeam(created.data.teamId, { city: '上海' }, { expectedVersion: teamNow.version });
assert('version 匹配可更新', okUpdate.ok && okUpdate.data.city === '上海');

identity.setTestSession({ userId: 'user_outsider', displayName: '外人' });
var app1 = repo.createApplication(created.data.teamId, { message: '想加入' });
assert('外人可申请', app1.ok);
var app2 = repo.createApplication(created.data.teamId, { message: '再申请' });
assert('pending 申请防重复', app2.ok === false && app2.code === 'already_pending');

identity.setTestSession({ userId: 'user_admin', displayName: '管理' });
var adminReject = repo.reviewApplication(app1.data.applicationId, 'reject');
assert('管理员可拒绝申请', adminReject.ok && adminReject.data.status === 'rejected');
var adminRejectAgain = repo.reviewApplication(app1.data.applicationId, 'reject');
assert('同一管理员重复拒绝幂等', adminRejectAgain.ok && adminRejectAgain.data.status === 'rejected');

identity.setTestSession({ userId: 'user_outsider2', displayName: '申请人2' });
var appAdmin = repo.createApplication(created.data.teamId, { message: '第二份' });
assert('第二份申请可提交', appAdmin.ok);
identity.setTestSession({ userId: 'user_owner', displayName: '创建者' });
repo.addMember(created.data.teamId, 'user_member', { displayName: '队员' });
identity.setTestSession({ userId: 'user_member', displayName: '队员' });
var memberForge = repo.reviewApplication(appAdmin.data.applicationId, 'approve');
assert('普通成员伪造审批被拒', memberForge.ok === false && memberForge.code === 'forbidden');

identity.setTestSession({ userId: 'user_owner', displayName: '创建者' });
repo.addMember(created.data.teamId, 'user_admin2', { displayName: '管理2' });
repo.setAdmin(created.data.teamId, 'user_admin2', true);
identity.setTestSession({ userId: 'user_admin', displayName: '管理' });
var firstApprove = repo.reviewApplication(appAdmin.data.applicationId, 'approve');
assert('管理员可同意申请', firstApprove.ok && firstApprove.data.status === 'approved');
identity.setTestSession({ userId: 'user_admin2', displayName: '管理2' });
var secondApprove = repo.reviewApplication(appAdmin.data.applicationId, 'approve');
assert('两名管理员并发审批仅一次生效', secondApprove.ok === false && secondApprove.code === 'already_processed');
var membersAfter = repo.listMembers(created.data.teamId).data.filter(function (m) {
  return m.userId === 'user_outsider2' && m.status === 'active';
});
assert('并发审批只入队一次', membersAfter.length === 1);

identity.setTestSession({ userId: 'user_owner', displayName: '创建者' });
var invite = repo.createInvite(created.data.teamId, { ttlMs: 1000 });
repo.setNowMs(Date.now() + 5000);
identity.setTestSession({ userId: 'user_late', displayName: '迟到' });
var expired = repo.resolveInvite(invite.data.token);
assert('invite 过期拒绝', expired.ok === false && expired.code === 'invite_expired');
repo.resetNow();

identity.setTestSession({ userId: 'user_owner', displayName: '创建者' });
var dissolved = repo.dissolveTeam(created.data.teamId, { confirmName: '迁测俱乐部' });
assert('超级管理员可解散', dissolved.ok);
var writeAfter = repo.addMember(created.data.teamId, 'user_x');
assert('dissolved 禁止新写', writeAfter.ok === false && writeAfter.code === 'team_dissolved');

resetModules();
identity = require(path.join(mini, 'utils', 'teamClub', 'identity.js'));
repo = require(path.join(mini, 'utils', 'teamClub', 'repository.js'));
teamDirectory = require(path.join(mini, 'utils', 'teamDirectory.js'));
service = require(path.join(mini, 'utils', 'teamClub', 'service.js'));

storage.gb_created_teams_v1 = {
  version: 1,
  teams: [
    {
      id: '1',
      name: '北京湘鹰高尔夫俱乐部',
      shortName: '湘鹰',
      organizationType: 'team',
      createdBy: 'user_mig',
      adminUserIds: ['user_mig'],
      members: [{ userId: 'user_mig', name: '迁移人', role: 'owner', memberStatus: 'active' }]
    }
  ]
};
storage.gb_team_matches_v1 = [
  { matchId: 'hist-match-1', teamId: '1', matchType: 'team-internal', roundName: '历史队内赛', createdAt: 1 }
];

repo.reloadFromStorage();
var migrated = repo.peekTeam('1');
assert('迁移保留旧 teamId', !!(migrated && migrated.id === '1'));
var sameIdCount = repo.loadStore().teams.filter(function (t) {
  return t.teamId === '1';
}).length;
assert('两套旧目录合并后只有一条球队', sameIdCount === 1);
identity.setTestSession({ userId: 'user_mig', displayName: '迁移人' });
var matches = repo.listTeamMatches('1');
assert('旧 teamId 与历史比赛可关联', matches.ok && matches.data.some(function (m) {
  return m.matchId === 'hist-match-1';
}));
var leftoverClubs = (storage.gb_created_teams_v1 && storage.gb_created_teams_v1.teams) || [];
assert(
  'gb_created_teams_v1 迁移后只留赛事机构',
  leftoverClubs.every(function (t) {
    return t && t.organizationType === 'event_org';
  })
);
var dirHit = teamDirectory.getTeamById('1');
assert('teamDirectory 适配读取同一记录', !!(dirHit && dirHit.name.indexOf('湘鹰') >= 0));
var profileList = teamDirectory.listActiveClubTeamsForUser('user_mig');
assert('资料页同源 listActiveClubTeamsForUser', profileList.length === 1 && profileList[0].teamId === '1');

var json1 = storage.gb_team_club_v1;
repo.reloadFromStorage();
var json2 = storage.gb_team_club_v1;
assert('重启后仓储仍在', typeof json1 === 'string' && json1 === json2 && repo.peekTeam('1'));

identity.setTestSession({ userId: 'user_owner2', displayName: 'B' });
var t2 = repo.createTeam({ name: '第二支', ownerUserId: 'hacker' });
assert('客户端 ownerUserId 不被信任', t2.ok && t2.data.ownerUserId === 'user_owner2');

service.listMyTeams().then(function (res) {
  assert('service listMyTeams 读仓储', res.ok && res.list.some(function (t) {
    return t.fullName === '第二支';
  }));
  return service.getTeamDetail(t2.data.teamId);
}).then(function (res) {
  assert('首页/详情同源 getTeamDetail', res.ok && res.team.id === t2.data.teamId);
}).then(function () {
  var prodFiles = [
    'utils/teamClub/service.js',
    'utils/teamClub/repository.js',
    'utils/teamClub/identity.js',
    'utils/teamClub/migrate.js',
    'utils/teamDirectory.js',
    'subpackages/player/pages/me/teams/index.js',
    'subpackages/player/pages/me/team-detail/index.js',
    'subpackages/player/pages/me/team-invite/index.js',
    'subpackages/player/pages/me/team-manage/select/index.js',
    'subpackages/player/pages/me/team-manage/invite/index.js',
    'subpackages/create/pages/team-internal/index.js'
  ];
  var leftovers = [];
  prodFiles.forEach(function (rel) {
    var text = fs.readFileSync(path.join(mini, rel), 'utf8');
    if (rel.indexOf('teamDirectory') >= 0) return;
    if (text.indexOf("require('./mock.js')") >= 0 || text.indexOf("require('./mock.js')") >= 0) leftovers.push(rel + ':mock');
    if (text.indexOf('TODO: GET /api') >= 0 || text.indexOf('TODO: POST /api') >= 0) leftovers.push(rel + ':TODO');
    if (rel.indexOf('pages') >= 0 && text.indexOf('SHOW_DIAG') >= 0) leftovers.push(rel + ':DIAG');
    if (rel.indexOf('pages') >= 0 && text.indexOf('[DIAG-') >= 0) leftovers.push(rel + ':DIAGlog');
    if (rel.indexOf('service.js') >= 0 && text.indexOf("CURRENT_USER_ID") >= 0) leftovers.push(rel + ':me');
    if (rel.indexOf('repository.js') >= 0 && text.indexOf("CURRENT_USER_ID = 'me'") >= 0) leftovers.push(rel + ':me');
  });
  var serviceJs = fs.readFileSync(path.join(mini, 'utils/teamClub/service.js'), 'utf8');
  var model = require(path.join(mini, 'utils', 'teamClub', 'model.js'));
  var contract = require(path.join(mini, 'utils', 'teamClub', 'repository.contract.js'));
  var emptyStore = model.createEmptyStore();
  assert('notices 在 schema 中', Array.isArray(emptyStore.notices));
  assert(
    '云契约方法均挂在 repository',
    contract.METHODS.every(function (name) {
      return typeof repo[name] === 'function';
    })
  );
  assert('生产 service 不引用 mock.js', serviceJs.indexOf("require('./mock.js')") < 0);
  assert('生产 service 无 TODO API', serviceJs.indexOf('TODO:') < 0);
  assert('生产无 DIAG 残留(页面)', leftovers.filter(function (x) { return x.indexOf('DIAG') >= 0; }).length === 0);
  if (leftovers.length) console.log('leftovers', leftovers);

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}).catch(function (err) {
  console.log('FAIL  async', err && err.message);
  process.exit(1);
});
