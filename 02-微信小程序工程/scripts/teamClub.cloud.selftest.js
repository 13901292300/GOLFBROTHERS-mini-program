/**
 * 球队云仓储：可注入 MemoryStore 的 service 层自动测试。
 * 不连接真实云环境，不部署。
 */

var path = require('path');
var fs = require('fs');
var root = path.join(__dirname, '..');
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

var engine = require(path.join(cloudLib, 'engine.js'));
var memoryStore = require(path.join(cloudLib, 'memoryStore.js'));
var log = require(path.join(cloudLib, 'log.js'));
var C = require(path.join(cloudLib, 'constants.js'));

var OID = {
  owner: 'oid_owner_test',
  admin: 'oid_admin_test',
  admin2: 'oid_admin2_test',
  member: 'oid_member_test',
  outsider: 'oid_outsider_test',
  outsider2: 'oid_outsider2_test'
};

function call(store, openid, action, payload, extra) {
  return engine.dispatch(
    store,
    { OPENID: openid },
    Object.assign({ action: action, payload: payload || {} }, extra || {})
  );
}

function profile(store, openid, name) {
  return call(store, openid, 'createMyProfile', { displayName: name });
}

async function main() {
  var store = memoryStore.createMemoryStore();

  var noOpen = await call(store, '', 'listMyTeams', {});
  assert('无 OPENID 返回 need_login', noOpen.ok === false && noOpen.code === 'need_login');

  var needProfile = await call(store, OID.owner, 'listMyTeams', {});
  assert('无档案返回 profile_required', needProfile.ok === false && needProfile.code === 'profile_required');

  var pOwner = await profile(store, OID.owner, '创建者');
  var pAdmin = await profile(store, OID.admin, '管理');
  var pAdmin2 = await profile(store, OID.admin2, '管理2');
  var pMember = await profile(store, OID.member, '队员');
  var pOut = await profile(store, OID.outsider, '外人');
  var pOut2 = await profile(store, OID.outsider2, '申请人2');
  assert('建档成功', pOwner.ok && pOwner.data.userId && pOwner.data.userId.indexOf('u_') === 0);

  var ident = await call(store, OID.owner, 'resolveIdentity', {});
  assert('OPENID 映射正式 userId', ident.ok && ident.data.user.userId === pOwner.data.userId);

  var created = await call(store, OID.owner, 'createTeam', { name: '云测俱乐部', city: '北京' });
  assert('创建成功且唯一 superAdmin', created.ok && created.data.currentUserRole === 'super_admin');
  var teamId = created.data.teamId;
  var members = await call(store, OID.owner, 'listMembers', { teamId: teamId });
  var supers = (members.data || []).filter(function (m) { return m.role === 'super_admin'; });
  assert('唯一超级管理员', supers.length === 1 && supers[0].userId === pOwner.data.userId);

  var forged = await call(store, OID.member, 'createTeam', { name: '伪造' }, {
    userId: pOwner.data.userId,
    role: 'super_admin',
    ownerUserId: pOwner.data.userId
  });
  assert('客户端伪造 userId/role 不能冒充创建者身份', forged.ok && forged.data.ownerUserId === pMember.data.userId);

  await call(store, OID.owner, 'addMember', { teamId: teamId, targetUserId: pMember.data.userId, displayName: '队员' });
  var steal = await call(store, OID.member, 'setAdmin', {
    teamId: teamId,
    targetUserId: pOwner.data.userId
  }, { userId: pOwner.data.userId, role: 'super_admin' });
  assert('普通成员伪造审批/管理被拒', steal.ok === false && steal.code === 'forbidden');

  await call(store, OID.owner, 'addMember', { teamId: teamId, targetUserId: pAdmin.data.userId, displayName: '管理' });
  var setAd = await call(store, OID.owner, 'setAdmin', { teamId: teamId, targetUserId: pAdmin.data.userId });
  assert('设置管理员', setAd.ok && setAd.data.role === 'admin');

  var cap1 = await call(store, OID.owner, 'setCaptain', { teamId: teamId, targetUserId: pAdmin.data.userId });
  var memsCap = await call(store, OID.owner, 'listMembers', { teamId: teamId });
  var captains = (memsCap.data || []).filter(function (m) { return m.isCaptain; });
  assert('唯一队长', cap1.ok && captains.length === 1 && captains[0].userId === pAdmin.data.userId);

  var teamNow = await call(store, OID.owner, 'getTeam', { teamId: teamId });
  var conflict = await call(store, OID.owner, 'updateTeam', {
    teamId: teamId,
    city: '上海',
    expectedVersion: teamNow.data.version - 1
  });
  assert('version 冲突', conflict.ok === false && conflict.code === 'conflict');
  var okUpdate = await call(store, OID.owner, 'updateTeam', {
    teamId: teamId,
    city: '上海',
    expectedVersion: teamNow.data.version
  });
  assert('version 匹配可更新', okUpdate.ok && okUpdate.data.city === '上海');

  var app1 = await call(store, OID.outsider, 'createApplication', { teamId: teamId, message: '想加入' });
  assert('外人可申请', app1.ok);
  var appDup = await call(store, OID.outsider, 'createApplication', { teamId: teamId, message: '再申请' });
  assert('pending 申请防重复', appDup.ok === false && appDup.code === 'already_pending');

  var adminReject = await call(store, OID.admin, 'reviewApplication', {
    applicationId: app1.data.applicationId,
    decision: 'reject'
  });
  assert('管理员可拒绝申请', adminReject.ok && adminReject.data.status === 'rejected');
  var adminRejectAgain = await call(store, OID.admin, 'reviewApplication', {
    applicationId: app1.data.applicationId,
    decision: 'reject'
  });
  assert('同一管理员重复拒绝幂等', adminRejectAgain.ok && adminRejectAgain.data.status === 'rejected');

  var appAdmin = await call(store, OID.outsider2, 'createApplication', { teamId: teamId, message: '第二份' });
  assert('第二份申请可提交', appAdmin.ok);
  var memberForge = await call(store, OID.member, 'reviewApplication', {
    applicationId: appAdmin.data.applicationId,
    decision: 'approve'
  });
  assert('普通成员伪造审批被拒', memberForge.ok === false && memberForge.code === 'forbidden');

  await call(store, OID.owner, 'addMember', { teamId: teamId, targetUserId: pAdmin2.data.userId, displayName: '管理2' });
  await call(store, OID.owner, 'setAdmin', { teamId: teamId, targetUserId: pAdmin2.data.userId });

  var firstApprove = await call(store, OID.admin, 'reviewApplication', {
    applicationId: appAdmin.data.applicationId,
    decision: 'approve'
  });
  var secondApprove = await call(store, OID.admin2, 'reviewApplication', {
    applicationId: appAdmin.data.applicationId,
    decision: 'approve'
  });
  assert('管理员可同意申请', firstApprove.ok && firstApprove.data.status === 'approved');
  assert('两名管理员并发审批仅一次生效', secondApprove.ok === false && secondApprove.code === 'already_processed');
  var afterMembers = await call(store, OID.owner, 'listMembers', { teamId: teamId });
  var joined = (afterMembers.data || []).filter(function (m) {
    return m.userId === pOut2.data.userId && m.status === 'active';
  });
  assert('并发审批只入队一次', joined.length === 1);

  var invite = await call(store, OID.owner, 'createInvite', { teamId: teamId, ttlMs: 1000 });
  assert('邀请返回明文 token 一次', invite.ok && String(invite.data.token).indexOf('inv_') === 0);
  var dump = store.dump();
  var inviteDocs = Object.keys(dump.team_invites).map(function (k) { return dump.team_invites[k]; });
  assert('云端不保存明文 token', inviteDocs.every(function (row) { return !row.token && !!row.tokenHash; }));

  store.setNowMs(Date.now() + 5000);
  var expired = await call(store, OID.outsider, 'resolveInvite', { token: invite.data.token });
  assert('邀请过期拒绝', expired.ok === false && expired.code === 'invite_expired');
  store.resetNow();

  var invite2 = await call(store, OID.owner, 'createInvite', { teamId: teamId });
  var resolved = await call(store, OID.outsider, 'resolveInvite', { token: invite2.data.token });
  assert('resolveInvite 不自动授予成员', resolved.ok && resolved.data.membershipGranted === false);
  var stillOut = await call(store, OID.outsider, 'getTeam', { teamId: teamId });
  assert('仅凭邀请/teamId 不能成为成员', stillOut.data.isFormalMember === false);

  var revoked = await call(store, OID.owner, 'revokeInvite', { token: invite2.data.token });
  var afterRevoke = await call(store, OID.outsider, 'resolveInvite', { token: invite2.data.token });
  assert('邀请可撤销', revoked.ok && afterRevoke.code === 'invite_revoked');

  var retryKey = 'idem-create-1';
  var c1 = await call(store, OID.owner, 'createTeam', { name: '幂等队', idempotencyKey: retryKey });
  var c2 = await call(store, OID.owner, 'createTeam', { name: '幂等队改名', idempotencyKey: retryKey });
  assert('重试幂等返回同一球队', c1.ok && c2.ok && c1.data.teamId === c2.data.teamId);

  var other = await call(store, OID.outsider, 'createTeam', { name: '另一支' });
  var cross = await call(store, OID.outsider, 'updateTeam', { teamId: teamId, city: '黑客市' });
  assert('多球队不串写：他队管理员不能改本队', cross.ok === false && cross.code === 'forbidden');
  assert('第二支球队独立', other.ok && other.data.teamId !== teamId);

  var matches = await call(store, OID.outsider, 'listTeamMatches', { teamId: teamId });
  assert('非成员不能列出他队比赛', matches.ok === false && matches.code === 'forbidden');

  var bodyCreate = await call(store, OID.owner, 'putMatch', {
    teamId: teamId,
    matchId: 'gm_cloud_1',
    operationId: 'gm_cloud_1',
    match: {
      matchId: 'gm_cloud_1',
      teamId: teamId,
      roundName: '云端队内赛',
      teeTime: '2026-09-05',
      courseName: '测试球场',
      matchType: 'team-internal',
      status: 'scheduled'
    }
  });
  assert('创建球队比赛正文', bodyCreate.ok && bodyCreate.data.matchId === 'gm_cloud_1');
  var timeoutRetry = await call(store, OID.owner, 'putMatch', {
    teamId: teamId,
    matchId: 'gm_cloud_1',
    operationId: 'gm_cloud_1',
    match: { matchId: 'gm_cloud_1', teamId: teamId, roundName: '不应变成第二场' }
  });
  assert('创建超时重试不产生第二场', timeoutRetry.ok && timeoutRetry.data.matchId === 'gm_cloud_1' && timeoutRetry.data.roundName === '云端队内赛');
  var opened = await call(store, OID.member, 'getMatch', { matchId: 'gm_cloud_1' });
  assert('成员可打开完整正文', opened.ok && opened.data.courseName === '测试球场' && opened.data.cloudVersion >= 1);
  var listed = await call(store, OID.member, 'listTeamMatches', { teamId: teamId });
  assert('成员可见比赛且来源为正文', listed.ok && listed.data.length === 1 && listed.data[0].source === 'team_matches' && listed.data[0].canOpen === true);
  var refs = store.dump().team_match_refs;
  var refRow = refs[Object.keys(refs).filter(function (k) { return refs[k].matchId === 'gm_cloud_1'; })[0]];
  assert('ref 由正文派生且状态一致', refRow && refRow.derivedFromMatch === true && refRow.status === 'scheduled' && refRow.version === opened.data.cloudVersion);
  var holeA = await call(store, OID.owner, 'submitHoleScore', {
    matchId: 'gm_cloud_1',
    groupId: 'g1',
    hole: 1,
    entityKind: 'player',
    entityId: pOwner.data.userId,
    strokes: 4,
    operationId: 'gm_cloud_1:h1'
  });
  var upd = await call(store, OID.owner, 'completeMatch', {
    matchId: 'gm_cloud_1',
    operationId: 'gm_cloud_1:done'
  });
  assert('完成比赛同步正文', holeA.ok && upd.ok && upd.data.status === 'finished');
  var afterFinish = await call(store, OID.owner, 'getMatch', { matchId: 'gm_cloud_1' });
  var matchConflict = await call(store, OID.owner, 'putMatch', {
    teamId: teamId,
    matchId: 'gm_cloud_1',
    writeKind: 'full',
    expectedVersion: opened.data.cloudVersion,
    match: { matchId: 'gm_cloud_1', teamId: teamId, status: 'live' }
  });
  assert('expectedVersion 冲突拒绝覆盖', matchConflict.ok === false && matchConflict.code === 'conflict');
  var cancelRef = await call(store, OID.owner, 'putMatch', {
    teamId: teamId,
    matchId: 'gm_cloud_1',
    writeKind: 'full',
    expectedVersion: upd.data.cloudVersion,
    match: { matchId: 'gm_cloud_1', teamId: teamId, status: 'cancelled' }
  });
  assert('取消比赛同步正文状态', cancelRef.ok && cancelRef.data.status === 'cancelled');
  var listedCancel = await call(store, OID.member, 'listTeamMatches', { teamId: teamId });
  assert(
    '云仓储列表仍含已取消记录（展示层再过滤）',
    listedCancel.ok &&
      (listedCancel.data || []).some(function (row) {
        return row.matchId === 'gm_cloud_1' && row.status === 'cancelled' && row.statusLabel === '已取消';
      })
  );
  var outsiderForge = await call(store, OID.outsider, 'putMatch', {
    teamId: teamId,
    matchId: 'gm_hack',
    match: { matchId: 'gm_hack', teamId: teamId, roundName: '伪造' }
  });
  assert('局外人不能写比赛正文', outsiderForge.ok === false && outsiderForge.code === 'forbidden');
  var outsiderGet = await call(store, OID.outsider, 'getMatch', { matchId: 'gm_cloud_1' });
  assert('非成员不能枚举读取私有比赛', outsiderGet.ok === false && outsiderGet.code === 'forbidden');

  var xfer = await call(store, OID.owner, 'transferOwnership', { teamId: teamId, toUserId: pAdmin.data.userId });
  assert('转让所有权', xfer.ok && xfer.data.ownerUserId === pAdmin.data.userId);

  var dissolve = await call(store, OID.admin, 'dissolveTeam', { teamId: teamId, confirmName: '云测俱乐部' });
  var writeAfter = await call(store, OID.admin, 'updateTeam', { teamId: teamId, city: '解散后' });
  assert('解散后拒绝写入', dissolve.ok && writeAfter.code === 'team_dissolved');
  var newRefAfter = await call(store, OID.admin, 'putMatch', {
    teamId: teamId,
    matchId: 'gm_after_dissolve',
    match: { matchId: 'gm_after_dissolve', teamId: teamId, roundName: '解散后新建' }
  });
  assert('解散后禁止新建比赛', newRefAfter.ok === false && newRefAfter.code === 'team_dissolved');
  var histList = await call(store, OID.member, 'listTeamMatches', { teamId: teamId });
  assert('解散后仍可列出历史比赛', histList.ok && histList.data.some(function (r) { return r.matchId === 'gm_cloud_1'; }));
  var afterGet = await call(store, OID.admin, 'getMatch', { matchId: 'gm_cloud_1' });
  var statusAfter = await call(store, OID.admin, 'putMatch', {
    teamId: teamId,
    matchId: 'gm_cloud_1',
    writeKind: 'closeout',
    expectedVersion: afterGet.data.cloudVersion,
    match: { matchId: 'gm_cloud_1', teamId: teamId, status: 'cancelled' }
  });
  assert('解散后合法负责人可收尾已有比赛', statusAfter.ok);

  var demo = await call(store, OID.owner, 'confirmMigration', {
    migrationKey: 'k1',
    teamSnapshot: { id: '1', name: '演示', createdBy: pOwner.data.userId }
  });
  assert('迁移不导入 mock 球队 id', demo.ok === false);

  var unproven = await call(store, OID.owner, 'confirmMigration', {
    teamSnapshot: { id: 'club-real-9', name: '无主队', createdBy: 'someone_else' }
  });
  assert('无法证明归属不得自动 superAdmin', unproven.ok === false && unproven.code === 'ownership_unproven');

  var migrated = await call(store, OID.owner, 'confirmMigration', {
    teamSnapshot: { id: 'club-real-9', name: '可迁队', createdBy: pOwner.data.userId }
  });
  var migrated2 = await call(store, OID.owner, 'confirmMigration', {
    teamSnapshot: { id: 'club-real-9', name: '可迁队', createdBy: pOwner.data.userId }
  });
  assert('真实候选可确认迁移且幂等', migrated.ok && migrated2.ok);

  var searchEmpty = await call(store, OID.owner, 'searchUsers', { query: '不会命中的名字xyz' });
  assert('用户搜索诚实空态', searchEmpty.ok && Array.isArray(searchEmpty.data) && searchEmpty.data.length === 0);
  var searchHit = await call(store, OID.owner, 'searchUsers', { query: pOut.data.userId });
  assert('精确 userId 可搜且无敏感字段', searchHit.ok && searchHit.data[0] && !searchHit.data[0].openid && !searchHit.data[0].phone);

  var redacted = log.sanitize({ token: 'inv_secret', OPENID: 'oXXX', phone: '13800000000', action: 'createInvite' });
  assert('日志无敏感信息', redacted.token === '[redacted]' && redacted.OPENID === '[redacted]' && redacted.phone === '[redacted]' && redacted.action === 'createInvite');

  var dirtyWrites = (store.getLastSdkWrites() || []).filter(function (w) {
    var d = w.data || {};
    return Object.prototype.hasOwnProperty.call(d, '_id') || Object.prototype.hasOwnProperty.call(d, '_openid');
  });
  assert('全部 SDK 写入不含 _id/_openid', (store.getLastSdkWrites() || []).length > 0 && dirtyWrites.length === 0);

  C.CONTRACT_METHODS.forEach(function (name) {
    assert('契约方法存在: ' + name, typeof engine.createEngine(store, { OPENID: OID.owner })[name] === 'function');
  });

  global.__TEAM_CLUB_REPO_MODE = 'cloud';
  var factory = require(path.join(root, 'miniprogram', 'utils', 'teamClub', 'repoFactory.js'));
  assert('默认/显式 cloud 模式', factory.getMode() === 'cloud');
  var cloudRepo = factory.get();
  var noFallback = await cloudRepo.listMyTeams();
  assert(
    '云失败不回落本地',
    noFallback.ok === false &&
      (noFallback.code === 'service_unavailable' ||
        noFallback.code === 'network_error' ||
        noFallback.code === 'env_unknown')
  );
  var localSrc = fs.readFileSync(path.join(root, 'miniprogram', 'utils', 'teamClub', 'cloudRepository.js'), 'utf8');
  assert('cloudRepository 不 require 本地 repository', localSrc.indexOf("require('./repository.js')") < 0);

  var mockSrc = fs.readFileSync(path.join(root, 'miniprogram', 'utils', 'teamClub', 'cloudRepository.js'), 'utf8');
  assert('云仓储不引用 mock.js', mockSrc.indexOf('mock.js') < 0);

  console.log('\n---- teamClub.cloud.selftest ----');
  console.log('passed=' + passed + ' failed=' + failed);
  process.exit(failed ? 1 : 0);
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
