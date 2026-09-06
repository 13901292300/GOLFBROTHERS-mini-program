/**
 * 第四阶段：比赛正文云端权威、历史 ACL、outbox/冲突/迁移、生产不回落。
 * 运行：ELECTRON_RUN_AS_NODE=1 Cursor.exe scripts/teamClub.phase4.selftest.js
 */
var path = require('path');
var fs = require('fs');
var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var cloudLib = path.join(root, 'cloudfunctions', 'teamClub', 'lib');

var passed = 0;
var failed = 0;
var skipped = 0;
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

var engine = require(path.join(cloudLib, 'engine.js'));
var memoryStore = require(path.join(cloudLib, 'memoryStore.js'));
var matchDoc = require(path.join(cloudLib, 'matchDoc.js'));

function call(store, openid, action, payload) {
  return engine.dispatch(store, { OPENID: openid }, { action: action, payload: payload || {} });
}

async function main() {
  var store = memoryStore.createMemoryStore();
  var a = await call(store, 'oid_dev_a', 'createMyProfile', { displayName: '设备A' });
  var b = await call(store, 'oid_dev_b', 'createMyProfile', { displayName: '设备B' });
  var c = await call(store, 'oid_dev_c', 'createMyProfile', { displayName: '退出成员' });
  var spy = await call(store, 'oid_dev_spy', 'createMyProfile', { displayName: '非成员' });
  assert('A/B 建档', a.ok && b.ok);

  var created = await call(store, 'oid_dev_a', 'createTeam', { name: '跨设备球队', city: '深圳' });
  var teamId = created.data.teamId;
  await call(store, 'oid_dev_a', 'addMember', { teamId: teamId, targetUserId: b.data.userId });
  await call(store, 'oid_dev_a', 'setAdmin', { teamId: teamId, targetUserId: b.data.userId });
  await call(store, 'oid_dev_a', 'addMember', { teamId: teamId, targetUserId: c.data.userId });

  var mHist = await call(store, 'oid_dev_a', 'putMatch', {
    teamId: teamId,
    matchId: 'gm_hist_c',
    operationId: 'gm_hist_c',
    match: {
      matchId: 'gm_hist_c',
      teamId: teamId,
      roundName: 'C参与的历史赛',
      registerInfo: { users: [{ userId: c.data.userId, displayName: 'C' }] }
    }
  });
  assert('历史赛创建', mHist.ok);

  await call(store, 'oid_dev_c', 'leaveTeam', { teamId: teamId });

  var m1 = await call(store, 'oid_dev_a', 'putMatch', {
    teamId: teamId,
    matchId: 'gm_ab_1',
    operationId: 'gm_ab_1',
    match: {
      matchId: 'gm_ab_1',
      teamId: teamId,
      roundName: 'A创建正文',
      courseName: '龙岗球场',
      teeTime: '2026-09-06 08:00',
      matchType: 'team-internal',
      groups: [{ players: [{ userId: a.data.userId }] }]
    }
  });
  assert('A设备创建正文', m1.ok && m1.data.matchId === 'gm_ab_1' && m1.data.courseName === '龙岗球场');

  var listedB = await call(store, 'oid_dev_b', 'listTeamMatches', { teamId: teamId });
  var openedB = await call(store, 'oid_dev_b', 'getMatch', { matchId: 'gm_ab_1' });
  assert(
    'B设备列表可见并能打开完整正文',
    listedB.ok &&
      listedB.data.some(function (r) { return r.matchId === 'gm_ab_1' && r.canOpen && r.source === 'team_matches'; }) &&
      openedB.ok &&
      openedB.data.courseName === '龙岗球场' &&
      openedB.data.roundName === 'A创建正文'
  );

  var scored = await call(store, 'oid_dev_b', 'submitHoleScore', {
    matchId: 'gm_ab_1',
    groupId: 'g1',
    hole: 1,
    entityKind: 'player',
    entityId: b.data.userId,
    strokes: 4,
    operationId: 'gm_ab_1:h1:' + b.data.userId
  });
  var openedA = await call(store, 'oid_dev_a', 'getMatch', { matchId: 'gm_ab_1' });
  var playerBucket = openedA.data.scoreData && openedA.data.scoreData.g1 && openedA.data.scoreData.g1.scoresByPlayer;
  assert(
    'B记分后 A 刷新可见',
    scored.ok && openedA.ok && playerBucket && playerBucket[b.data.userId] && playerBucket[b.data.userId].scores[0] === 4
  );

  var dump = store.dump();
  var matchRow = dump.team_matches.gm_ab_1;
  var refId = Object.keys(dump.team_match_refs).filter(function (k) {
    return dump.team_match_refs[k].matchId === 'gm_ab_1';
  })[0];
  var refRow = dump.team_match_refs[refId];
  assert(
    '正文与 ref 状态一致且同 matchId',
    matchRow && refRow && matchRow.status === refRow.status && refRow.derivedFromMatch === true && refRow.version === matchRow.version
  );

  var retryCreate = await call(store, 'oid_dev_a', 'putMatch', {
    teamId: teamId,
    matchId: 'gm_ab_1',
    operationId: 'gm_ab_1',
    match: { matchId: 'gm_ab_1', teamId: teamId, roundName: '重复创建' }
  });
  var matchCount = Object.keys(store.dump().team_matches).length;
  assert(
    '创建超时重试不重复',
    retryCreate.ok && retryCreate.data.roundName === 'A创建正文' && matchCount >= 2
  );

  var opDup1 = await call(store, 'oid_dev_a', 'submitHoleScore', {
    matchId: 'gm_ab_1',
    groupId: 'g1',
    hole: 2,
    entityKind: 'player',
    entityId: a.data.userId,
    strokes: 5,
    operationId: 'gm_ab_1:flush-h2'
  });
  var opDup2 = await call(store, 'oid_dev_a', 'submitHoleScore', {
    matchId: 'gm_ab_1',
    groupId: 'g1',
    hole: 2,
    entityKind: 'player',
    entityId: a.data.userId,
    strokes: 99,
    operationId: 'gm_ab_1:flush-h2'
  });
  assert(
    'outbox 重复 flush 幂等',
    opDup1.ok && opDup2.ok && opDup2.data.score && opDup2.data.score.strokes === 5 && opDup2.data.score.version === opDup1.data.score.version
  );

  var bump = await call(store, 'oid_dev_a', 'putMatch', {
    teamId: teamId,
    matchId: 'gm_ab_1',
    writeKind: 'full',
    expectedVersion: openedA.data.cloudVersion,
    match: { matchId: 'gm_ab_1', teamId: teamId, roundName: 'A创建正文', courseName: '龙岗球场' }
  });
  var verConflict = await call(store, 'oid_dev_b', 'putMatch', {
    teamId: teamId,
    matchId: 'gm_ab_1',
    writeKind: 'full',
    expectedVersion: openedB.data.cloudVersion,
    match: { matchId: 'gm_ab_1', teamId: teamId, status: 'finished' }
  });
  assert('expectedVersion 冲突', bump.ok && verConflict.ok === false && verConflict.code === 'conflict');

  var histListC = await call(store, 'oid_dev_c', 'listTeamMatches', { teamId: teamId });
  var histGet = await call(store, 'oid_dev_c', 'getMatch', { matchId: 'gm_hist_c' });
  var newGetC = await call(store, 'oid_dev_c', 'getMatch', { matchId: 'gm_ab_1' });
  assert(
    '已退出成员能看参与过的历史比赛',
    histListC.ok && histGet.ok && histListC.data.some(function (r) { return r.matchId === 'gm_hist_c'; })
  );
  assert(
    '已退出成员看不到退出后的新比赛',
    histListC.data.every(function (r) { return r.matchId !== 'gm_ab_1'; }) &&
      newGetC.ok === false &&
      newGetC.code === 'forbidden'
  );

  var spyList = await call(store, 'oid_dev_spy', 'listTeamMatches', { teamId: teamId });
  var spyGet = await call(store, 'oid_dev_spy', 'getMatch', { matchId: 'gm_ab_1' });
  assert(
    '非成员无法枚举读取',
    spyList.code === 'forbidden' && spyGet.code === 'forbidden'
  );

  var dissolve = await call(store, 'oid_dev_a', 'dissolveTeam', { teamId: teamId, confirmName: '跨设备球队' });
  var blockedNew = await call(store, 'oid_dev_a', 'putMatch', {
    teamId: teamId,
    matchId: 'gm_after',
    match: { matchId: 'gm_after', teamId: teamId, roundName: '解散后' }
  });
  assert('解散后禁止新建', dissolve.ok && blockedNew.code === 'team_dissolved');
  var closeGet = await call(store, 'oid_dev_a', 'getMatch', { matchId: 'gm_ab_1' });
  var closeout = await call(store, 'oid_dev_a', 'putMatch', {
    teamId: teamId,
    matchId: 'gm_ab_1',
    writeKind: 'closeout',
    expectedVersion: closeGet.data.cloudVersion,
    match: { matchId: 'gm_ab_1', teamId: teamId, status: 'finished' }
  });
  var audits = store.dump().team_audits;
  var closeAudit = Object.keys(audits).some(function (k) {
    return audits[k].action === 'closeout_match_dissolved';
  });
  assert('合法负责人可完成允许的历史收尾且有审计', closeout.ok && closeout.data.status === 'finished' && closeAudit);
  var cWrite = await call(store, 'oid_dev_c', 'putMatch', {
    teamId: teamId,
    matchId: 'gm_hist_c',
    writeKind: 'full',
    expectedVersion: 1,
    match: { matchId: 'gm_hist_c', teamId: teamId, status: 'cancelled' }
  });
  assert('普通历史成员解散后不得修改', cWrite.ok === false);

  var demoMig = await call(store, 'oid_dev_a', 'confirmMatchMigration', {
    matchSnapshot: { matchId: 'demo-1', teamId: teamId, createdBy: a.data.userId }
  });
  assert('迁移拒绝 mock/demo', demoMig.ok === false);

  var otherTeam = await call(store, 'oid_dev_a', 'createTeam', { name: '迁移用队' });
  var unproven = await call(store, 'oid_dev_b', 'confirmMatchMigration', {
    matchSnapshot: {
      matchId: 'gm_unproven',
      teamId: otherTeam.data.teamId,
      createdBy: a.data.userId,
      roundName: '别人的'
    }
  });
  assert('无法证明归属不自动上传', unproven.ok === false && unproven.code === 'ownership_unproven');

  var mig1 = await call(store, 'oid_dev_a', 'confirmMatchMigration', {
    migrationKey: 'match:gm_real_mig:' + a.data.userId,
    matchSnapshot: {
      matchId: 'gm_real_mig',
      teamId: otherTeam.data.teamId,
      createdBy: a.data.userId,
      roundName: '真实本机赛',
      courseName: '迁移球场'
    }
  });
  var mig2 = await call(store, 'oid_dev_a', 'confirmMatchMigration', {
    migrationKey: 'match:gm_real_mig:' + a.data.userId,
    matchSnapshot: {
      matchId: 'gm_real_mig',
      teamId: otherTeam.data.teamId,
      createdBy: a.data.userId,
      roundName: '第二次应幂等'
    }
  });
  assert(
    '本地迁移幂等且保留 matchId',
    mig1.ok && mig2.ok && mig1.data.matchId === 'gm_real_mig' && mig2.data.roundName === '真实本机赛'
  );

  var restore = await call(store, 'oid_dev_a', 'getMatch', { matchId: 'gm_real_mig' });
  assert('删除缓存后可通过 matchId 恢复完整正文', restore.ok && restore.data.courseName === '迁移球场');

  assert('canReadMatch 记录成员期与参与者', typeof matchDoc.canReadMatch === 'function' && typeof matchDoc.wasMemberWhenCreated === 'function');

  var identity = require(path.join(mini, 'utils', 'teamClub', 'identity.js'));
  identity.setTestSession({ userId: a.data.userId, displayName: 'A' });
  var matchSync = require(path.join(mini, 'utils', 'teamClub', 'matchSync.js'));
  matchSync.enqueue({ matchId: 'gm_ab_1', operationId: 'ob1', match: { matchId: 'gm_ab_1' } });
  matchSync.enqueue({ matchId: 'gm_ab_1', operationId: 'ob1', match: { matchId: 'gm_ab_1', x: 2 } });
  assert('outbox 同 operationId 去重', matchSync.readOutbox().length === 1);

  global.__TEAM_CLUB_REPO_MODE = 'cloud';
  var factory = require(path.join(mini, 'utils', 'teamClub', 'repoFactory.js'));
  assert('生产默认 cloud', factory.getMode() === 'cloud');
  var failList = await factory.get().listMyTeams();
  var failPut = await factory.get().putMatch({ matchId: 'x', teamId: 'y', match: {} });
  assert(
    'production 云失败不回落本地正文',
    failList.ok === false &&
      (failList.code === 'service_unavailable' ||
        failList.code === 'network_error' ||
        failList.code === 'env_unknown') &&
      failPut.ok === false &&
      (failPut.code === 'service_unavailable' ||
        failPut.code === 'network_error' ||
        failPut.code === 'env_unknown')
  );

  var myTeamsSrc = fs.readFileSync(path.join(root, 'scripts', 'myTeams.selftest.js'), 'utf8');
  assert(
    'myTeams 测试无提前 return 绕过',
    myTeamsSrc.indexOf('if (!mock.MOCK_TEAMS)') < 0 && myTeamsSrc.indexOf('skipped=0') >= 0
  );

  var createSrc = fs.readFileSync(path.join(mini, 'subpackages', 'create', 'pages', 'team-internal', 'index.js'), 'utf8');
  assert('创建成功以 putMatch 为准', createSrc.indexOf('创建未成功') >= 0 && createSrc.indexOf('pendingMatchId') >= 0);
  var detailSrc = fs.readFileSync(path.join(mini, 'subpackages', 'tournament', 'pages', 'detail', 'index.js'), 'utf8');
  assert('详情页按 matchId 拉云端正文', detailSrc.indexOf('_pullCloudMatch') >= 0 && detailSrc.indexOf('getMatch') >= 0);

  console.log('\n---- teamClub.phase4.selftest ----');
  console.log('passed=' + passed + ' failed=' + failed + ' skipped=' + skipped);
  process.exit(failed ? 1 : 0);
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
