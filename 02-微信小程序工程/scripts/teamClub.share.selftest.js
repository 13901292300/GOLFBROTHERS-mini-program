/**
 * 微信分享邀请闭环：本地自动测试，不连真实云、不部署。
 */
global.__TEAM_CLUB_REPO_MODE = 'local';

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

var storage = {};
var redirected = [];
global.wx = {
  getStorageSync: function (key) {
    return storage[key];
  },
  setStorageSync: function (key, value) {
    storage[key] = value;
  },
  removeStorageSync: function (key) {
    delete storage[key];
  },
  redirectTo: function (opts) {
    redirected.push(opts && opts.url);
    if (opts && opts.success) opts.success();
  },
  navigateBack: function (opts) {
    if (opts && opts.fail) opts.fail();
  }
};

var engine = require(path.join(cloudLib, 'engine.js'));
var memoryStore = require(path.join(cloudLib, 'memoryStore.js'));
var log = require(path.join(cloudLib, 'log.js'));
var cloudEnv = require(path.join(mini, 'utils', 'teamClub', 'cloudEnv.js'));
var identity = require(path.join(mini, 'utils', 'teamClub', 'identity.js'));
var repo = require(path.join(mini, 'utils', 'teamClub', 'repository.js'));
var shareInvite = require(path.join(mini, 'utils', 'teamClub', 'shareInvite.js'));
var profileOnboard = require(path.join(mini, 'utils', 'teamClub', 'profileOnboard.js'));
var service = require(path.join(mini, 'utils', 'teamClub', 'service.js'));

var OID = {
  owner: 'oid_share_owner',
  admin: 'oid_share_admin',
  member: 'oid_share_member',
  b: 'oid_share_b',
  c: 'oid_share_c',
  raw: 'oid_share_raw'
};

function call(store, openid, action, payload) {
  return engine.dispatch(store, { OPENID: openid }, { action: action, payload: payload || {} });
}

function profile(store, openid, name) {
  return call(store, openid, 'createMyProfile', { displayName: name });
}

function read(rel) {
  return fs.readFileSync(path.join(mini, rel), 'utf8');
}

async function main() {
  var introWxml = read('subpackages/player/pages/me/team-detail/components/team-intro/index.wxml');
  var manageWxml = read('subpackages/player/pages/me/team-manage/invite/index.wxml');
  var detailJs = read('subpackages/player/pages/me/team-detail/index.js');
  var inviteJs = read('subpackages/player/pages/me/team-invite/index.js');
  var manageJs = read('subpackages/player/pages/me/team-manage/invite/index.js');

  assert('详情页存在 open-type="share"', introWxml.indexOf('open-type="share"') >= 0 && introWxml.indexOf('微信邀请好友') >= 0);
  assert('管理邀请页存在 open-type="share"', manageWxml.indexOf('open-type="share"') >= 0 && manageWxml.indexOf('微信邀请好友') >= 0);
  assert('详情页预签发邀请', detailJs.indexOf('shareInvite.prepare') >= 0 && detailJs.indexOf('showShareMenu') >= 0);
  assert('落地页读取 token 并 getInviteByToken', inviteJs.indexOf('onLoad(options)') >= 0 && inviteJs.indexOf('getInviteByToken') >= 0);
  assert('落地页接受邀请不传 userId', /acceptInvite\(token\)/.test(inviteJs) && inviteJs.indexOf('targetUserId') < 0);
  assert('未建档引导完善资料', inviteJs.indexOf('onCompleteProfile') >= 0 && inviteJs.indexOf('savePendingToken') >= 0);
  assert('搜索空关键字不发请求', manageJs.indexOf("if (!q)") >= 0 && manageJs.indexOf('虚拟') < 0);
  assert('无自制联系人弹窗冒充分享', manageJs.indexOf('联系人') < 0 && introWxml.indexOf('open-type="share"') >= 0);

  var store = memoryStore.createMemoryStore();
  var pOwner = await profile(store, OID.owner, '队长甲');
  var pAdmin = await profile(store, OID.admin, '管理乙');
  var pMember = await profile(store, OID.member, '队员丙');
  var pB = await profile(store, OID.b, '账号乙');
  var pC = await profile(store, OID.c, '账号丙');
  var team = await call(store, OID.owner, 'createTeam', { name: '分享测试队', shortName: '分享' });
  var teamId = team.data.teamId;
  await call(store, OID.owner, 'addMember', { teamId: teamId, targetUserId: pAdmin.data.userId, displayName: '管理乙' });
  await call(store, OID.owner, 'setAdmin', { teamId: teamId, targetUserId: pAdmin.data.userId });
  await call(store, OID.owner, 'addMember', { teamId: teamId, targetUserId: pMember.data.userId, displayName: '队员丙' });

  var prep1 = await call(store, OID.owner, 'prepareShareInvite', { teamId: teamId });
  var prep2 = await call(store, OID.owner, 'prepareShareInvite', { teamId: teamId });
  assert('分享前可预签发 token', prep1.ok && String(prep1.data.token).indexOf('inv_') === 0);
  assert('有效期内复用同一邀请', prep1.ok && prep2.ok && prep1.data.token === prep2.data.token && prep1.data.inviteId === prep2.data.inviteId);
  var dump = store.dump();
  var inviteDocs = Object.keys(dump.team_invites).map(function (k) {
    return dump.team_invites[k];
  });
  assert(
    '只存 tokenHash 不含明文/OPENID/userId 于 token',
    inviteDocs.length >= 1 &&
      inviteDocs.every(function (row) {
        return !row.token && !!row.tokenHash && String(JSON.stringify(row)).indexOf(OID.owner) < 0;
      })
  );

  var shareMsg = service.buildTeamShareMessage({ fullName: '分享测试队', logoSrc: '' }, prep1.data);
  assert(
    'onShareAppMessage 路径含非空 token 且不含 teamId',
    shareMsg.ok &&
      shareMsg.title.indexOf('分享测试队') >= 0 &&
      shareMsg.path.indexOf('/pages/team-invite/index?token=') === 0 &&
      shareMsg.path.indexOf(prep1.data.token) > 0 &&
      shareMsg.path.indexOf('teamId=') < 0
  );
  var emptyShare = service.buildTeamShareMessage({ fullName: '分享测试队' }, {});
  assert('未就绪不分享空 token', emptyShare.ok === false && emptyShare.path.indexOf('token=') < 0);

  var memberPrep = await call(store, OID.member, 'prepareShareInvite', { teamId: teamId });
  assert('普通成员不能生成邀请', memberPrep.ok === false && memberPrep.code === 'forbidden');

  var preview = await call(store, OID.b, 'getInviteByToken', { token: prep1.data.token });
  assert(
    'B 可解析真实球队与邀请人',
    preview.ok &&
      preview.data.team.name === '分享测试队' &&
      preview.data.inviter &&
      preview.data.inviter.displayName === '队长甲' &&
      preview.data.membershipGranted === false &&
      !preview.data.inviter.userId
  );

  var before = await call(store, OID.owner, 'getTeam', { teamId: teamId });
  var count0 = Number(before.data.memberCount);
  var forged = await call(store, OID.b, 'acceptInvite', {
    token: prep1.data.token,
    userId: pOwner.data.userId,
    targetUserId: pOwner.data.userId
  });
  assert('伪造目标 userId 仍按当前 OPENID 入队', forged.ok && forged.data.team.isFormalMember === true);
  var mid = await call(store, OID.owner, 'getTeam', { teamId: teamId });
  assert('B 加入后成员数 +1', Number(mid.data.memberCount) === count0 + 1);
  var again = await call(store, OID.b, 'acceptInvite', { token: prep1.data.token, targetUserId: pC.data.userId });
  var afterDup = await call(store, OID.owner, 'getTeam', { teamId: teamId });
  assert('重复接受幂等且不增加成员数', again.ok && again.data.alreadyMember === true && Number(afterDup.data.memberCount) === count0 + 1);

  var second = await call(store, OID.c, 'acceptInvite', { token: prep1.data.token });
  var afterC = await call(store, OID.owner, 'getTeam', { teamId: teamId });
  assert('同一分享可供第二人加入', second.ok && second.data.membershipGranted === true && Number(afterC.data.memberCount) === count0 + 2);

  var expiredInv = await call(store, OID.owner, 'createInvite', { teamId: teamId, ttlMs: 10 });
  store.setNowMs(Date.now() + 5000);
  var expiredAccept = await call(store, OID.b, 'acceptInvite', { token: expiredInv.data.token });
  assert('过期邀请不可接受', expiredAccept.ok === false && expiredAccept.code === 'invite_expired');
  store.resetNow();

  var rev = await call(store, OID.admin, 'createInvite', { teamId: teamId });
  await call(store, OID.admin, 'revokeInvite', { token: rev.data.token });
  var revAccept = await call(store, OID.b, 'acceptInvite', { token: rev.data.token });
  assert('撤销邀请不可接受', revAccept.ok === false && revAccept.code === 'invite_revoked');

  var usedInv = await call(store, OID.owner, 'createInvite', { teamId: teamId });
  await store.runTransaction(function (tx) {
    return tx.get('team_invites', usedInv.data.inviteId).then(function (row) {
      row.status = 'used';
      return tx.put('team_invites', usedInv.data.inviteId, row);
    });
  });
  var usedAccept = await call(store, OID.b, 'acceptInvite', { token: usedInv.data.token });
  assert('已使用邀请不可接受', usedAccept.ok === false && usedAccept.code === 'invite_used');

  var team2 = await call(store, OID.owner, 'createTeam', { name: '待解散队', shortName: '解散' });
  var invDead = await call(store, OID.owner, 'prepareShareInvite', { teamId: team2.data.teamId });
  await call(store, OID.owner, 'dissolveTeam', { teamId: team2.data.teamId, confirmName: '待解散队' });
  var deadAccept = await call(store, OID.b, 'acceptInvite', { token: invDead.data.token });
  assert('解散球队邀请不可接受', deadAccept.ok === false && deadAccept.code === 'team_dissolved');

  var rawStore = memoryStore.createMemoryStore();
  await profile(rawStore, OID.owner, '队长甲');
  var rawTeam = await call(rawStore, OID.owner, 'createTeam', { name: '未建档队', shortName: '未档' });
  var rawInv = await call(rawStore, OID.owner, 'prepareShareInvite', { teamId: rawTeam.data.teamId });
  var rawPeek = await call(rawStore, OID.raw, 'getInviteByToken', { token: rawInv.data.token });
  assert('未建档解析返回 profile_required', rawPeek.ok === false && rawPeek.code === 'profile_required');
  await profile(rawStore, OID.raw, '后来建档');
  var afterProfile = await call(rawStore, OID.raw, 'getInviteByToken', { token: rawInv.data.token });
  var afterJoin = await call(rawStore, OID.raw, 'acceptInvite', { token: rawInv.data.token });
  assert(
    '完善资料后可继续原邀请',
    afterProfile.ok && afterJoin.ok && afterJoin.data.membershipGranted === true
  );

  var searchEmpty = await call(store, OID.owner, 'searchUsers', { query: '', teamId: teamId });
  assert('空搜索不生成虚拟用户', searchEmpty.ok && Array.isArray(searchEmpty.data) && searchEmpty.data.length === 0);

  shareInvite.resetCache();
  identity.setTestSession({ userId: 'user_owner', displayName: '创建者' });
  repo.resetForTests();
  var localTeam = repo.createTeam({ name: '本地球队', shortName: '本地' });
  var s1 = await shareInvite.prepare(localTeam.data.teamId);
  var s2 = await shareInvite.prepare(localTeam.data.teamId);
  assert('客户端有效期内只创建一次邀请', s1.ok && s2.ok && s1.invite.token === s2.invite.token && s2.reused === true);
  var msg = shareInvite.buildShareMessage({ fullName: '本地球队' }, s1.invite);
  assert('分享 path 仅 token', msg.path.indexOf('?token=') > 0 && msg.path.indexOf('teamId=') < 0);

  shareInvite.savePendingToken(s1.invite.token);
  redirected = [];
  profileOnboard.returnToMyTeams();
  assert(
    '完善资料后回到邀请页携带原 token',
    redirected[0] && redirected[0].indexOf('/team-invite/index?token=') >= 0 && redirected[0].indexOf(s1.invite.token) >= 0
  );

  var leaked = log.sanitize({
    token: prep1.data.token,
    OPENID: OID.owner,
    path: '/x?token=' + prep1.data.token,
    action: 'acceptInvite'
  });
  assert(
    '日志不泄露 token 和 OPENID',
    leaked.token === '[redacted]' &&
      leaked.OPENID === '[redacted]' &&
      String(leaked.path).indexOf(prep1.data.token) < 0 &&
      leaked.action === 'acceptInvite'
  );
  var shareLog = shareInvite.logShare('create', { token: prep1.data.token, teamId: teamId });
  assert('分享日志只打脱敏摘要', shareLog.token.indexOf('****') >= 0 && shareLog.token.indexOf(prep1.data.token) < 0);

  cloudEnv.resetTestHooks();
  var captured = [];
  global.wx.cloud = {
    callFunction: function (opts) {
      captured.push(opts);
      return Promise.resolve({ result: { ok: true, data: {} } });
    }
  };
  var cloudRepo = require(path.join(mini, 'utils', 'teamClub', 'cloudRepository.js'));
  cloudEnv.setTestAccountReader(function () {
    return 'develop';
  });
  await cloudRepo.prepareShareInvite('t1');
  cloudEnv.setTestAccountReader(function () {
    return 'trial';
  });
  await cloudRepo.acceptInvite('inv_x');
  assert(
    'develop/trial 只走测试环境',
    captured.length >= 2 &&
      captured.every(function (c) {
        return c.config.env === cloudEnv.TEST.envId && c.config.env !== cloudEnv.RELEASE.envId;
      })
  );
  captured = [];
  cloudEnv.setTestAccountReader(function () {
    return 'release';
  });
  cloudEnv.setTestReleaseDeployed(false);
  var rel = await cloudRepo.prepareShareInvite('t1');
  assert(
    'release 未开放不携带测试环境',
    rel.ok === false &&
      rel.code === 'not_open' &&
      String(rel.message).indexOf('服务暂未开放') >= 0 &&
      captured.length === 0
  );
  cloudEnv.resetTestHooks();

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
