/**
 * 球队云建档闭环：profile_required 完善资料、校验、幂等、禁止临时头像。
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

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

var fields = require(path.join(mini, 'utils', 'teamClub', 'profileFields.js'));
var userProfileStore = require(path.join(mini, 'utils', 'userProfileStore.js'));
var mockAvatars = require(path.join(mini, 'utils', 'mockAvatars.js'));
var pageErrors = require(path.join(mini, 'utils', 'teamClub', 'pageErrors.js'));
var profileOnboard = require(path.join(mini, 'utils', 'teamClub', 'profileOnboard.js'));
var engine = require(path.join(cloudLib, 'engine.js'));
var memoryStore = require(path.join(cloudLib, 'memoryStore.js'));
var queryUtil = require(path.join(cloudLib, 'queryUtil.js'));
var C = require(path.join(cloudLib, 'constants.js'));
var ser = require(path.join(cloudLib, 'storeSerialize.js'));

function hasReserved(data) {
  return !!(data && (Object.prototype.hasOwnProperty.call(data, '_id') || Object.prototype.hasOwnProperty.call(data, '_openid')));
}

function writesOf(store, collection) {
  return (store.getLastSdkWrites() || []).filter(function (w) {
    return w.collection === collection;
  });
}

function call(store, openid, action, payload, extra) {
  return engine.dispatch(
    store,
    { OPENID: openid },
    Object.assign({ action: action, payload: payload || {} }, extra || {})
  );
}

async function main() {
  var copy = pageErrors.fromCode('profile_required');
  assert('标题为需要完善资料', copy.errorTitle === '需要完善资料');
  assert(
    '说明文案正确',
    copy.errorDesc.indexOf('完善昵称和头像后，即可创建或加入球队') >= 0
  );
  assert('profile_required 主操作是完善资料', copy.actionKind === 'completeProfile' && copy.actionLabel === '完善资料');
  assert('网络错误仍是重试', pageErrors.fromCode('network_error').actionKind === 'retry');
  assert('服务不可用仍是重试', pageErrors.fromCode('service_unavailable').actionKind === 'retry');

  var stateWxml = read(path.join(mini, 'subpackages', 'player', 'components', 'team-page-state', 'index.wxml'));
  assert('状态组件有完善资料按钮', stateWxml.indexOf('onCompleteProfile') >= 0 && stateWxml.indexOf('完善资料') >= 0);
  assert('完善资料不是默认重试分支', /showCompleteProfile[\s\S]*showRetry/.test(stateWxml.replace(/\s+/g, ' ')) || stateWxml.indexOf('showCompleteProfile') >= 0);

  var teamsJs = read(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'teams', 'index.js'));
  var teamsWxml = read(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'teams', 'index.wxml'));
  assert('列表页处理完善资料', teamsJs.indexOf('onCompleteProfile') >= 0 && teamsWxml.indexOf('completeprofile') >= 0);
  assert('未建档隐藏创建按钮', teamsWxml.indexOf('wx:if="{{showCreate}}"') >= 0 && teamsJs.indexOf('showCreate: false') >= 0);
  assert('创建入口有 showCreate 守卫', teamsJs.indexOf('if (!this.data.showCreate) return') >= 0);

  var createJs = read(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'teams', 'create', 'index.js'));
  var createWxml = read(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'teams', 'create', 'index.wxml'));
  assert('创建页未建档走完善资料', createJs.indexOf('onCompleteProfile') >= 0 && createWxml.indexOf('completeprofile') >= 0);
  assert('创建页提交守卫未建档', createJs.indexOf("pageState === 'profile_required'") >= 0);
  assert('创建页重试不覆盖完善资料', createJs.indexOf("pageState === 'profile_required') return") >= 0 || createJs.indexOf("if (this.data.pageState === 'profile_required') return") >= 0);

  var editJs = read(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'edit', 'index.js'));
  var editWxml = read(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'edit', 'index.wxml'));
  assert('复用现有资料编辑页', editJs.indexOf('from === \'teamClub\'') >= 0 || editJs.indexOf('from === "teamClub"') >= 0);
  assert('资料页使用微信昵称授权', editWxml.indexOf('type="nickname"') >= 0);
  assert('资料页使用 chooseAvatar', editWxml.indexOf('open-type="chooseAvatar"') >= 0);
  assert('资料页可完成建档', editJs.indexOf('onFinishTeamProfile') >= 0 && editWxml.indexOf('完成并用于球队') >= 0);

  assert('合法昵称通过', fields.validateNickname('球场老张').ok === true);
  assert('空白昵称拒绝', fields.validateNickname('   ').ok === false);
  assert('过长昵称拒绝', fields.validateNickname('一二三四五六七八九十一二三四五六七八九十一').ok === false);
  assert('敏感昵称拒绝', fields.validateNickname('微信官方客服').ok === false);
  assert('非法字符拒绝', fields.validateNickname('A<b>').ok === false);
  assert('https 头像可入库', fields.isDurableAvatar('https://cdn.example.com/a.jpg') === true);
  assert('cloud fileID 可入库', fields.isDurableAvatar('cloud://env.bucket/a.jpg') === true);
  var cloudSrc = 'cloud://env.bucket/a.jpg';
  assert(
    'cloud:// 可在我的页展示',
    userProfileStore.resolveDisplayAvatar({ avatar: cloudSrc }) === cloudSrc
  );
  assert(
    'https 展示保持原样',
    userProfileStore.resolveDisplayAvatar({ avatar: 'https://cdn.example.com/a.jpg' }) ===
      'https://cdn.example.com/a.jpg'
  );
  assert(
    '比赛 resolveAvatar 接受 cloud://',
    mockAvatars.resolveAvatar('cloud://env.bucket/a.jpg', 'u1') === 'cloud://env.bucket/a.jpg'
  );
  assert(
    'usr 持久文件展示保持原样',
    userProfileStore.resolveDisplayAvatar({ avatar: 'wxfile://usr/gb_avatar.jpg' }) ===
      'wxfile://usr/gb_avatar.jpg'
  );
  assert(
    '空头像仍回退默认图',
    userProfileStore.resolveDisplayAvatar({ avatar: '' }) === userProfileStore.DEFAULT_AVATAR
  );
  assert(
    'tmp 路径仍不可展示',
    userProfileStore.resolveDisplayAvatar({ avatar: 'wxfile://tmp/a.jpg' }) ===
      userProfileStore.DEFAULT_AVATAR
  );
  assert('临时路径不可入库', fields.isTempPath('wxfile://tmp_a.jpg') === true && !fields.validateAvatar('wxfile://tmp_a.jpg', true).ok);
  assert('http tmp 不可入库', !fields.validateAvatar('http://tmp/wx123.jpg', true).ok);

  var store = memoryStore.createMemoryStore();
  var noProfile = await call(store, 'oid_prof_1', 'createTeam', { name: '未建档球队' });
  assert('未建档不能创建球队', noProfile.ok === false && noProfile.code === 'profile_required');

  var made = await call(store, 'oid_prof_1', 'createMyProfile', {
    displayName: '老张',
    avatar: 'https://cdn.example.com/a.jpg'
  });
  assert('新填写资料成功建档', made.ok && made.data.userId && made.data.displayName === '老张');
  assert('建档不回写客户端 userId', made.data.userId.indexOf('u_') === 0);

  var again = await call(store, 'oid_prof_1', 'createMyProfile', {
    displayName: '另一个名字',
    avatar: 'https://cdn.example.com/b.jpg'
  });
  assert('重复提交幂等', again.ok && again.data.userId === made.data.userId && again.data.displayName === '老张');

  var forged = await call(
    store,
    'oid_prof_2',
    'createMyProfile',
    { displayName: '伪造', avatar: 'https://cdn.example.com/a.jpg' },
    { userId: made.data.userId, OPENID: 'hack' }
  );
  assert('客户端伪造 userId 无效', forged.ok && forged.data.userId !== made.data.userId);

  var tempAv = await call(store, 'oid_prof_3', 'createMyProfile', {
    displayName: '临时头',
    avatar: 'wxfile://tmp_avatar.png'
  });
  assert('头像临时路径被云端拒绝', tempAv.ok === false && (tempAv.code === 'invalid_avatar' || tempAv.code === 'invalid_args'));

  var existingStore = memoryStore.createMemoryStore();
  var first = await call(existingStore, 'oid_prof_4', 'createMyProfile', {
    displayName: '已有资料',
    avatar: 'https://cdn.screenshottocode.com/H0XDATQ7nxMnJo8KZn-wV.jpg'
  });
  var listed = await call(existingStore, 'oid_prof_4', 'listMyTeams', {});
  assert('使用已有资料建档后可进球队页', first.ok && listed.ok && Array.isArray(listed.data) && listed.data.length === 0);

  var teamsAfter = teamsJs.indexOf('loadTeams()') >= 0 && teamsJs.indexOf('submitFromLocal') >= 0;
  assert('建档成功后自动刷新列表', teamsAfter);

  var onboard = read(path.join(mini, 'utils', 'teamClub', 'profileOnboard.js'));
  var createCall = onboard.match(/createMyProfile\(\{[\s\S]*?\}\)/);
  assert(
    '建档请求不带客户端 userId',
    !!(createCall && createCall[0].indexOf('createMyProfile({') >= 0 && createCall[0].indexOf('userId:') < 0)
  );
  assert('提交锁覆盖确认弹窗', teamsJs.indexOf('beginLock()') >= 0 && teamsJs.indexOf('showModal') >= 0);
  assert('提交锁覆盖资料页返回', editJs.indexOf('keepLockOnSuccess: true') >= 0 && teamsJs.indexOf('keepLockOnSuccess: true') >= 0);
  assert('提交锁覆盖自动刷新', teamsJs.indexOf('loadTeams()') >= 0 && teamsJs.indexOf('endLock()') >= 0);
  assert('创建页忙碌时不重复进资料', createJs.indexOf('profileOnboard.isBusy()') >= 0);

  var sdkStore = memoryStore.createMemoryStore();
  var rawIdFailed = false;
  var rawOpenidFailed = false;
  try {
    await sdkStore.sdkSetRaw(C.COLLECTIONS.PROFILES, 'u_raw', { _id: 'u_raw', displayName: 'x' });
  } catch (e) {
    rawIdFailed = !!(e && (e.code === -501007 || String(e.message).indexOf('_id') >= 0));
  }
  try {
    await sdkStore.sdkSetRaw(C.COLLECTIONS.PROFILES, 'u_raw2', { _openid: 'oid', displayName: 'x' });
  } catch (e2) {
    rawOpenidFailed = !!(e2 && e2.code === -501007);
  }
  assert('memoryStore 写入含 _id 失败', rawIdFailed);
  assert('memoryStore 写入含 _openid 失败', rawOpenidFailed);

  sdkStore.clearLastSdkWrites();
  var pA = await call(sdkStore, 'oid_sdk_a', 'createMyProfile', {
    displayName: '写入甲',
    avatar: 'https://cdn.example.com/a.jpg'
  });
  var pB = await call(sdkStore, 'oid_sdk_b', 'createMyProfile', {
    displayName: '写入乙',
    avatar: 'https://cdn.example.com/b.jpg'
  });
  var profileWrites = writesOf(sdkStore, C.COLLECTIONS.PROFILES);
  assert(
    'createMyProfile 真实形态写入不含 _id',
    pA.ok &&
      profileWrites.length >= 1 &&
      profileWrites.every(function (w) {
        return !hasReserved(w.data) && !!w.data.userId;
      })
  );
  var againSdk = await call(sdkStore, 'oid_sdk_a', 'createMyProfile', {
    displayName: '不应改名',
    avatar: 'https://cdn.example.com/c.jpg'
  });
  assert('幂等重复建档仍成功', againSdk.ok && againSdk.data.userId === pA.data.userId && againSdk.data.displayName === '写入甲');

  var team = await call(sdkStore, 'oid_sdk_a', 'createTeam', { name: '适配层球队', city: '杭州' });
  assert('createTeam 成功', team.ok && team.data.teamId);
  var teamId = team.data.teamId;
  var app = await call(sdkStore, 'oid_sdk_b', 'createApplication', { teamId: teamId, message: '申请' });
  var invite = await call(sdkStore, 'oid_sdk_a', 'createInvite', { teamId: teamId });
  await call(sdkStore, 'oid_sdk_a', 'addMember', {
    teamId: teamId,
    targetUserId: pB.data.userId,
    displayName: '写入乙'
  });
  var match = await call(sdkStore, 'oid_sdk_a', 'putMatch', {
    teamId: teamId,
    matchId: 'gm_sdk_1',
    operationId: 'gm_sdk_1',
    match: {
      matchId: 'gm_sdk_1',
      teamId: teamId,
      roundName: '适配赛',
      status: 'scheduled'
    }
  });
  var score = await call(sdkStore, 'oid_sdk_a', 'submitHoleScore', {
    matchId: 'gm_sdk_1',
    groupId: 'g1',
    hole: 1,
    entityKind: 'player',
    entityId: pA.data.userId,
    strokes: 4,
    operationId: 'gm_sdk_1:h1'
  });
  assert('申请/邀请/比赛/成绩写入成功', app.ok && invite.ok && match.ok && score.ok);

  function collectionClean(name, idField) {
    var list = writesOf(sdkStore, name);
    return (
      list.length >= 1 &&
      list.every(function (w) {
        return !hasReserved(w.data) && (!idField || w.data[idField]);
      })
    );
  }
  assert('createTeam 不写保留字段', collectionClean(C.COLLECTIONS.CLUBS, 'teamId'));
  assert('member 不写保留字段', collectionClean(C.COLLECTIONS.MEMBERS, 'userId') && collectionClean(C.COLLECTIONS.MEMBERS, 'teamId'));
  assert('application 不写保留字段', collectionClean(C.COLLECTIONS.APPLICATIONS, 'teamId'));
  assert('invite 不写保留字段', collectionClean(C.COLLECTIONS.INVITES, 'teamId'));
  assert('match 不写保留字段', collectionClean(C.COLLECTIONS.MATCHES, 'matchId'));
  assert('score 分片不写保留字段', collectionClean(C.COLLECTIONS.MATCH_SCORES, 'matchId'));

  var storedProfile = await sdkStore.get(C.COLLECTIONS.PROFILES, pA.data.userId);
  assert('读取仍返回业务 _id', !!(storedProfile && storedProfile._id === pA.data.userId && storedProfile.userId === pA.data.userId));

  var page = await sdkStore.query(C.COLLECTIONS.MEMBERS, {
    where: { teamId: teamId, memberStatus: 'active' },
    orderBy: [{ field: '_id', direction: 'desc' }],
    limit: 1
  });
  var cursorObj = queryUtil.decodeCursor(page.cursor);
  assert(
    '读取后 cursor 仍包含稳定 _id',
    page.hasMore === true && cursorObj && typeof cursorObj._id === 'string' && cursorObj._id.length > 0
  );

  sdkStore.clearLastSdkWrites();
  await sdkStore.runTransaction(function (tx) {
    return tx.update(C.COLLECTIONS.CLUBS, teamId, {
      _id: teamId,
      _openid: 'should-not-write',
      city: '宁波'
    });
  });
  var updateWrites = (sdkStore.getLastSdkWrites() || []).filter(function (w) {
    return w.op === 'update';
  });
  assert(
    'update 路径不写 _id',
    updateWrites.length === 1 &&
      !hasReserved(updateWrites[0].data) &&
      updateWrites[0].data.city === '宁波' &&
      updateWrites[0].data.teamId === teamId
  );
  var afterUpdate = await sdkStore.get(C.COLLECTIONS.CLUBS, teamId);
  assert('update 后读取仍有 _id 和 teamId', afterUpdate && afterUpdate._id === teamId && afterUpdate.teamId === teamId);

  var renamed = await call(sdkStore, 'oid_sdk_a', 'updateMyProfile', {
    displayName: '新队长名',
    avatar: 'https://cdn.example.com/new-a.jpg'
  });
  assert('更新资料成功', renamed.ok && renamed.data && renamed.data.displayName === '新队长名');
  var membersAfter = await call(sdkStore, 'oid_sdk_a', 'listMembers', { teamId: teamId });
  var selfRow = ((membersAfter && membersAfter.data) || []).find(function (m) {
    return m && m.userId === pA.data.userId;
  });
  assert(
    '已建球队超管花名册跟随新头像昵称',
    !!(selfRow && selfRow.displayName === '新队长名' && String(selfRow.avatar).indexOf('new-a') >= 0)
  );
  await sdkStore.runTransaction(function (tx) {
    return tx.get(C.COLLECTIONS.PROFILES, pA.data.userId).then(function (p) {
      p.avatar = '';
      p.displayName = '';
      return tx.put(C.COLLECTIONS.PROFILES, pA.data.userId, p);
    });
  });
  var membersKeepSnap = await call(sdkStore, 'oid_sdk_a', 'listMembers', { teamId: teamId });
  var keepRow = ((membersKeepSnap && membersKeepSnap.data) || []).find(function (m) {
    return m && m.userId === pA.data.userId;
  });
  assert(
    '空 profile 字段不覆盖成员快照',
    !!(
      keepRow &&
      keepRow.displayName === '新队长名' &&
      String(keepRow.avatar).indexOf('new-a') >= 0
    )
  );
  await sdkStore.runTransaction(function (tx) {
    return tx.get(C.COLLECTIONS.PROFILES, pA.data.userId).then(function (p) {
      p.avatar = 'https://cdn.example.com/new-a.jpg';
      p.displayName = '新队长名';
      return tx.put(C.COLLECTIONS.PROFILES, pA.data.userId, p);
    });
  });
  var createStillIdempotent = await call(sdkStore, 'oid_sdk_a', 'createMyProfile', {
    displayName: '不该变',
    avatar: 'https://cdn.example.com/z.jpg'
  });
  assert(
    'createMyProfile 仍不覆盖已更新资料',
    createStillIdempotent.ok && createStillIdempotent.data.displayName === '新队长名'
  );
  assert('资料页改昵称头像会同步球队', editJs.indexOf('syncLiveProfileToTeams') >= 0);
  var onboardSrc = read(path.join(mini, 'utils', 'teamClub', 'profileOnboard.js'));
  assert(
    '同步失败打 warn 且区分原因',
    onboardSrc.indexOf("console.warn('[profileOnboard] syncLiveProfileToTeams failed'") >= 0 &&
      onboardSrc.indexOf('avatar_upload_failed') >= 0 &&
      onboardSrc.indexOf('update_profile_failed') >= 0 &&
      onboardSrc.indexOf('unknown_action') >= 0 &&
      onboardSrc.indexOf('cloud_identity_missing') >= 0
  );
  assert(
    'durable 校验后才 updateMyProfile，且回写有启动时 avatar 比对',
    onboardSrc.indexOf('resolveDurableAvatar') >= 0 &&
      onboardSrc.indexOf('writebackDurableAvatarIfUnchanged') >= 0 &&
      onboardSrc.indexOf('fields.isDurableAvatar(durable)') >= 0 &&
      onboardSrc.indexOf('currentLocalAvatar() !== String(startedAvatar') >= 0 &&
      onboardSrc.indexOf('empty: true') >= 0 &&
      onboardSrc.indexOf('payload.avatar = durableAvatar') >= 0
  );
  var detailJs = read(
    path.join(mini, 'subpackages', 'player', 'pages', 'me', 'team-detail', 'index.js')
  );
  assert(
    '成员列表先 ensureCloudIdentity 再拉成员',
    detailJs.indexOf('_ensureIdentityReady') >= 0 &&
      /loadMembers\(\)\s*\{[\s\S]*_ensureIdentityReady\(\)\.then/.test(detailJs) &&
      detailJs.indexOf('_loadMembersAfterIdentity') >= 0 &&
      detailJs.indexOf('self._identityReady = null') >= 0
  );

  var stripped = ser.toSdkWriteData({
    _id: 'doc1',
    _openid: 'oid',
    userId: 'u_keep',
    teamId: 't_keep',
    matchId: 'm_keep'
  });
  assert(
    '序列化只清保留字段',
    !hasReserved(stripped) &&
      stripped.userId === 'u_keep' &&
      stripped.teamId === 't_keep' &&
      stripped.matchId === 'm_keep'
  );

  profileOnboard._resetBusyForTest();
  assert('提交锁首次可进入', profileOnboard.beginLock() === true);
  assert('提交锁挡住重复触发', profileOnboard.beginLock() === false && profileOnboard.isBusy() === true);
  var busyCall = await profileOnboard.submitFromLocal();
  assert('忙碌时第二次 createMyProfile 被挡住', busyCall && busyCall.ok === false && busyCall.code === 'busy');
  profileOnboard.endLock();
  assert('解锁后可再次提交', profileOnboard.isBusy() === false);

  console.log('\n---- teamClub.profile.selftest ----');
  console.log('passed=' + passed + ' failed=' + failed);
  if (failed) process.exit(1);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
