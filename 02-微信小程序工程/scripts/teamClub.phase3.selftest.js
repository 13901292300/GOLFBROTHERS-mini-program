/**
 * 第三阶段：页面接云、球队比赛索引、snapshot 边界、无 mock/DIAG 生产残留。
 * 运行：ELECTRON_RUN_AS_NODE=1 Cursor.exe scripts/teamClub.phase3.selftest.js
 */
var path = require('path');
var fs = require('fs');
var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var cloudLib = path.join(root, 'cloudfunctions', 'teamClub', 'lib');

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

function read(rel) {
  return fs.readFileSync(path.join(mini, rel), 'utf8');
}

var engine = require(path.join(cloudLib, 'engine.js'));
var memoryStore = require(path.join(cloudLib, 'memoryStore.js'));

function call(store, openid, action, payload) {
  return engine.dispatch(store, { OPENID: openid }, { action: action, payload: payload || {} });
}

async function main() {
  var store = memoryStore.createMemoryStore();
  var owner = await call(store, 'oid_p3_owner', 'createMyProfile', { displayName: 'P3创建者' });
  var admin = await call(store, 'oid_p3_admin', 'createMyProfile', { displayName: 'P3管理' });
  var member = await call(store, 'oid_p3_member', 'createMyProfile', { displayName: 'P3队员' });
  var applicant = await call(store, 'oid_p3_app', 'createMyProfile', { displayName: 'P3申请人' });
  var spy = await call(store, 'oid_p3_spy', 'createMyProfile', { displayName: 'P3窥探' });
  assert('建档', owner.ok && admin.ok && member.ok);

  var created = await call(store, 'oid_p3_owner', 'createTeam', {
    name: '阶段三球队',
    shortName: '三队',
    city: '杭州',
    slogan: '一起下场',
    intro: '简介',
    acceptingMembers: true
  });
  assert('创建球队且唯一超管', created.ok && created.data.currentUserRole === 'super_admin');
  var teamId = created.data.teamId;

  var leaveSuper = await call(store, 'oid_p3_owner', 'leaveTeam', { teamId: teamId });
  assert('超管不能直接退出', leaveSuper.ok === false && leaveSuper.code === 'forbidden');

  await call(store, 'oid_p3_owner', 'addMember', { teamId: teamId, targetUserId: admin.data.userId });
  await call(store, 'oid_p3_owner', 'setAdmin', { teamId: teamId, targetUserId: admin.data.userId });
  await call(store, 'oid_p3_owner', 'addMember', { teamId: teamId, targetUserId: member.data.userId });

  var v1 = await call(store, 'oid_p3_owner', 'getTeam', { teamId: teamId });
  var conflict = await call(store, 'oid_p3_owner', 'updateTeam', {
    teamId: teamId,
    slogan: '被覆盖',
    expectedVersion: v1.data.version - 1
  });
  assert('编辑 version 冲突', conflict.code === 'conflict');
  var edited = await call(store, 'oid_p3_owner', 'updateTeam', {
    teamId: teamId,
    slogan: '新口号',
    expectedVersion: v1.data.version
  });
  assert('编辑成功', edited.ok && edited.data.slogan === '新口号');

  var spyEdit = await call(store, 'oid_p3_spy', 'updateTeam', { teamId: teamId, slogan: '黑客' });
  assert('手工构造路由仍无法越权编辑', spyEdit.ok === false && spyEdit.code === 'forbidden');

  var app1 = await call(store, 'oid_p3_app', 'createApplication', { teamId: teamId, message: '申请' });
  assert('邀请申请可提交', app1.ok);
  var pending = await call(store, 'oid_p3_admin', 'listApplications', { teamId: teamId, status: 'pending' });
  assert('管理员可见待审', pending.ok && pending.data.length === 1);
  var spyReview = await call(store, 'oid_p3_spy', 'reviewApplication', {
    applicationId: app1.data.applicationId,
    decision: 'approve'
  });
  assert('无权限审批被拒', spyReview.code === 'forbidden');
  var approved = await call(store, 'oid_p3_admin', 'reviewApplication', {
    applicationId: app1.data.applicationId,
    decision: 'approve'
  });
  assert('管理员审批通过', approved.ok && approved.data.status === 'approved');
  var notices = await call(store, 'oid_p3_app', 'listNotices', {});
  assert('申请人收到结果通知', notices.ok && notices.data.some(function (n) {
    return n.type === 'join_application_result';
  }));

  var invite = await call(store, 'oid_p3_owner', 'createInvite', { teamId: teamId, ttlMs: 10 });
  store.setNowMs(Date.now() + 1000);
  var expired = await call(store, 'oid_p3_spy', 'resolveInvite', { token: invite.data.token });
  assert('邀请过期', expired.code === 'invite_expired');
  store.resetNow();

  var matchDoc = await call(store, 'oid_p3_owner', 'putMatch', {
    teamId: teamId,
    matchId: 'gm_p3',
    operationId: 'gm_p3',
    match: {
      matchId: 'gm_p3',
      teamId: teamId,
      roundName: '队内公开赛',
      status: 'scheduled'
    }
  });
  assert('比赛正文创建', matchDoc.ok);
  var listed = await call(store, 'oid_p3_member', 'listTeamMatches', { teamId: teamId });
  assert('无本地 teamMatchStore 仍可列出', listed.ok && listed.data[0].matchId === 'gm_p3' && listed.data[0].source === 'team_matches');
  var openedP3 = await call(store, 'oid_p3_member', 'getMatch', { matchId: 'gm_p3' });
  assert('跨身份可打开完整正文', openedP3.ok && openedP3.data.roundName === '队内公开赛');
  await call(store, 'oid_p3_owner', 'putMatch', {
    teamId: teamId,
    matchId: 'gm_p3',
    writeKind: 'full',
    expectedVersion: openedP3.data.cloudVersion,
    match: { matchId: 'gm_p3', teamId: teamId, status: 'finished' }
  });
  var afterFinish = await call(store, 'oid_p3_owner', 'getMatch', { matchId: 'gm_p3' });
  await call(store, 'oid_p3_owner', 'putMatch', {
    teamId: teamId,
    matchId: 'gm_p3',
    writeKind: 'full',
    expectedVersion: afterFinish.data.cloudVersion,
    match: { matchId: 'gm_p3', teamId: teamId, status: 'cancelled' }
  });
  var afterCancel = await call(store, 'oid_p3_member', 'listTeamMatches', { teamId: teamId });
  assert('正文完成/取消可更新', afterCancel.data[0].statusLabel === '已取消');

  var xfer = await call(store, 'oid_p3_owner', 'transferOwnership', {
    teamId: teamId,
    toUserId: admin.data.userId
  });
  assert('转让超管', xfer.ok && xfer.data.ownerUserId === admin.data.userId);

  var dissolveBad = await call(store, 'oid_p3_admin', 'dissolveTeam', { teamId: teamId, confirmName: '错名' });
  assert('解散需输入正确全称', dissolveBad.ok === false);
  var dissolve = await call(store, 'oid_p3_admin', 'dissolveTeam', { teamId: teamId, confirmName: '阶段三球队' });
  assert('解散成功', dissolve.ok);
  var hist = await call(store, 'oid_p3_member', 'listTeamMatches', { teamId: teamId });
  assert('解散后保留历史比赛', hist.ok && hist.data[0].matchId === 'gm_p3');
  var blockedApp = await call(store, 'oid_p3_spy', 'createApplication', { teamId: teamId });
  var blockedMatch = await call(store, 'oid_p3_admin', 'putMatch', {
    teamId: teamId,
    matchId: 'gm_new',
    match: { matchId: 'gm_new', teamId: teamId, roundName: '新赛' }
  });
  assert('解散后禁止申请和新建比赛', blockedApp.code === 'team_dissolved' && blockedMatch.code === 'team_dissolved');

  global.__TEAM_CLUB_REPO_MODE = 'cloud';
  var factory = require(path.join(mini, 'utils', 'teamClub', 'repoFactory.js'));
  assert('生产默认 cloud', factory.getMode() === 'cloud');
  var cloudRepo = factory.get();
  var failList = await cloudRepo.listMyTeams();
  assert('云失败不回落本地', failList.ok === false && failList.code === 'service_unavailable');

  var identity = require(path.join(mini, 'utils', 'teamClub', 'identity.js'));
  var snapshot = require(path.join(mini, 'utils', 'teamClub', 'snapshot.js'));
  identity.setTestSession({ userId: 'u_a', displayName: 'A' });
  snapshot.putTeam({ teamId: 't1', name: '甲队', ownerUserId: 'u_a' });
  identity.setTestSession({ userId: 'u_b', displayName: 'B' });
  snapshot.putTeam({ teamId: 't1', name: '乙队', ownerUserId: 'u_b' });
  assert('多球队/用户缓存隔离', snapshot.peekTeam('t1').name === '乙队');
  identity.setTestSession({ userId: 'u_a', displayName: 'A' });
  assert('切回用户 A 不串缓存', snapshot.peekTeam('t1').name === '甲队');
  snapshot.markStale('t1');
  assert('失败后标记 stale', snapshot.peekTeam('t1')._stale === true);
  identity.clearSession();
  identity.setTestSession({ userId: 'u_a', displayName: 'A' });
  assert('logout 清理用户级 snapshot', snapshot.peekTeam('t1') == null);

  var flags = require(path.join(mini, 'utils', 'teamClub', 'devFlags.js'));
  assert('生产不自动启用 local repository', flags.USE_LOCAL_REPOSITORY === false);

  var pages = [
    'subpackages/player/pages/me/teams/index.js',
    'subpackages/player/pages/me/teams/create/index.js',
    'subpackages/player/pages/me/team-detail/index.js',
    'subpackages/player/pages/me/team-edit/index.js',
    'subpackages/player/pages/me/team-invite/index.js',
    'subpackages/player/pages/me/team-notices/index.js',
    'subpackages/player/pages/me/team-applications/index.js',
    'subpackages/player/pages/me/team-application/index.js',
    'subpackages/player/pages/me/team-manage/select/index.js',
    'subpackages/player/pages/me/team-manage/invite/index.js'
  ];
  var leftovers = [];
  pages.forEach(function (rel) {
    var text = read(rel);
    if (text.indexOf('即将开放') >= 0) leftovers.push(rel + ':即将开放');
    if (text.indexOf('SHOW_DIAG') >= 0 || text.indexOf('[DIAG-') >= 0) leftovers.push(rel + ':DIAG');
    if (text.indexOf("userId: 'me'") >= 0 || text.indexOf('CURRENT_USER_ID') >= 0) leftovers.push(rel + ':me');
    if (text.indexOf("require('./mock.js')") >= 0 || text.indexOf('MOCK_TEAMS') >= 0) leftovers.push(rel + ':mock');
    if (text.indexOf('模拟申请') >= 0) leftovers.push(rel + ':模拟');
  });
  var createWxml = read('subpackages/player/pages/me/teams/create/index.wxml');
  assert('创建页无即将开放', createWxml.indexOf('即将开放') < 0 && createWxml.indexOf('form.name') >= 0);
  var detailJs = read('subpackages/player/pages/me/team-detail/index.js');
  assert('详情 onShow 重新拉取', detailJs.indexOf('onShow') >= 0 && detailJs.indexOf('loadIntro(true)') >= 0);
  var appJson = JSON.parse(read('app.json'));
  var player = appJson.subPackages.filter(function (s) { return s.root === 'subpackages/player'; })[0];
  assert(
    '注册编辑/通知/申请列表页',
    player.pages.indexOf('pages/me/team-edit/index') >= 0 &&
      player.pages.indexOf('pages/me/team-notices/index') >= 0 &&
      player.pages.indexOf('pages/me/team-applications/index') >= 0
  );
  var engineSrc = fs.readFileSync(path.join(cloudLib, 'engine.js'), 'utf8');
  assert('listTeamMatches 不是固定空数组实现', engineSrc.indexOf('COLLECTIONS.MATCHES') >= 0 || engineSrc.indexOf("MATCHES") >= 0);
  assert('生产页面无占位/mock/DIAG/me 残留', leftovers.length === 0);
  if (leftovers.length) console.log(leftovers);

  var access = read('utils/teamClub/access.js');
  assert('snapshot 带 stale 标记', access.indexOf('_stale') >= 0);
  var snapSrc = read('utils/teamClub/snapshot.js');
  assert('snapshot 注释禁止作为写依据', snapSrc.indexOf('不是写依据') >= 0);

  console.log('\n---- teamClub.phase3.selftest ----');
  console.log('passed=' + passed + ' failed=' + failed);
  process.exit(failed ? 1 : 0);
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
