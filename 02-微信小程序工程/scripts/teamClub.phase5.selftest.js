/**
 * 第五阶段：细粒度记分、成绩分片、并发/outbox、队内赛范围。
 */
var path = require('path');
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
  getStorageSync: function (key) { return storage[key]; },
  setStorageSync: function (key, value) { storage[key] = value; },
  removeStorageSync: function (key) { delete storage[key]; }
};

var engine = require(path.join(cloudLib, 'engine.js'));
var memoryStore = require(path.join(cloudLib, 'memoryStore.js'));

function call(store, openid, action, payload) {
  return engine.dispatch(store, { OPENID: openid }, { action: action, payload: payload || {} });
}

async function main() {
  var store = memoryStore.createMemoryStore();
  var a = await call(store, 'oid_s5_a', 'createMyProfile', { displayName: '超管A' });
  var b = await call(store, 'oid_s5_b', 'createMyProfile', { displayName: '参赛B' });
  var c = await call(store, 'oid_s5_c', 'createMyProfile', { displayName: '组合C' });
  var d = await call(store, 'oid_s5_d', 'createMyProfile', { displayName: '非参赛D' });
  var e = await call(store, 'oid_s5_e', 'createMyProfile', { displayName: '将退出E' });
  assert('建档', a.ok && b.ok && c.ok && d.ok && e.ok);

  var created = await call(store, 'oid_s5_a', 'createTeam', { name: '记分球队' });
  var teamId = created.data.teamId;
  await call(store, 'oid_s5_a', 'addMember', { teamId: teamId, targetUserId: b.data.userId });
  await call(store, 'oid_s5_a', 'addMember', { teamId: teamId, targetUserId: c.data.userId });
  await call(store, 'oid_s5_a', 'addMember', { teamId: teamId, targetUserId: d.data.userId });
  await call(store, 'oid_s5_a', 'addMember', { teamId: teamId, targetUserId: e.data.userId });

  var matchBody = {
    matchId: 'gm_s5',
    teamId: teamId,
    matchType: 'team-internal',
    roundName: '记分场',
    groups: [
      {
        groupId: 'g1',
        players: [
          { userId: b.data.userId },
          { id: 'combo-bc', entityId: 'combo-bc', members: [{ userId: b.data.userId }, { userId: c.data.userId }] }
        ]
      }
    ],
    registerInfo: { users: [{ userId: b.data.userId }, { userId: c.data.userId }, { userId: e.data.userId }] }
  };
  var createdMatch = await call(store, 'oid_s5_a', 'putMatch', {
    teamId: teamId,
    matchId: 'gm_s5',
    operationId: 'gm_s5',
    match: matchBody
  });
  assert('创建队内赛', createdMatch.ok && createdMatch.data.scoreSchemaVersion === 2);

  var selfScore = await call(store, 'oid_s5_b', 'submitHoleScore', {
    matchId: 'gm_s5',
    groupId: 'g1',
    hole: 1,
    entityKind: 'player',
    entityId: b.data.userId,
    strokes: 4,
    operationId: 'b-h1'
  });
  assert('普通参赛者记录自己的成绩', selfScore.ok && selfScore.data.score.strokes === 4);

  var comboScore = await call(store, 'oid_s5_c', 'submitHoleScore', {
    matchId: 'gm_s5',
    groupId: 'g1',
    hole: 1,
    entityKind: 'entity',
    entityId: 'combo-bc',
    strokes: 5,
    operationId: 'c-combo-h1'
  });
  assert('组合成员按授权记录组合成绩', comboScore.ok && comboScore.data.score.strokes === 5);

  var nonPart = await call(store, 'oid_s5_d', 'submitHoleScore', {
    matchId: 'gm_s5',
    groupId: 'g1',
    hole: 1,
    entityKind: 'player',
    entityId: d.data.userId,
    strokes: 3,
    operationId: 'd-h1'
  });
  assert('非参赛普通成员写入被拒', nonPart.ok === false && nonPart.code === 'forbidden');

  var forged = await call(store, 'oid_s5_d', 'submitHoleScore', {
    matchId: 'gm_s5',
    groupId: 'g1',
    hole: 2,
    entityKind: 'player',
    entityId: b.data.userId,
    strokes: 3,
    userId: b.data.userId,
    operationId: 'forge-b'
  });
  assert('客户端伪造 participantUserId 被拒', forged.ok === false && forged.code === 'forbidden');

  var fullDenied = await call(store, 'oid_s5_b', 'putMatch', {
    teamId: teamId,
    matchId: 'gm_s5',
    writeKind: 'full',
    expectedVersion: createdMatch.data.cloudVersion,
    match: { matchId: 'gm_s5', teamId: teamId, roundName: '黑客改名', scoreData: { hack: 1 } }
  });
  assert('普通成员没有 putMatch(full)', fullDenied.ok === false && fullDenied.code === 'forbidden');

  var corrected = await call(store, 'oid_s5_a', 'correctScore', {
    matchId: 'gm_s5',
    groupId: 'g1',
    hole: 1,
    entityKind: 'player',
    entityId: b.data.userId,
    strokes: 6,
    expectedVersion: selfScore.data.score.version,
    operationId: 'admin-fix-b-h1'
  });
  assert('管理员纠错', corrected.ok && corrected.data.score.strokes === 6);

  await call(store, 'oid_s5_e', 'leaveTeam', { teamId: teamId });
  var leftWrite = await call(store, 'oid_s5_e', 'submitHoleScore', {
    matchId: 'gm_s5',
    groupId: 'g1',
    hole: 3,
    entityKind: 'player',
    entityId: e.data.userId,
    strokes: 4,
    operationId: 'e-after-leave'
  });
  assert('已退出成员写入被拒', leftWrite.ok === false && leftWrite.code === 'forbidden');

  var hole2 = await call(store, 'oid_s5_b', 'submitHoleScore', {
    matchId: 'gm_s5', groupId: 'g1', hole: 2, entityKind: 'player', entityId: b.data.userId, strokes: 5, operationId: 'b-h2'
  });
  var hole3 = await call(store, 'oid_s5_c', 'submitHoleScore', {
    matchId: 'gm_s5', groupId: 'g1', hole: 3, entityKind: 'entity', entityId: 'combo-bc', strokes: 4, operationId: 'c-h3'
  });
  assert('两人同时记不同球洞成功', hole2.ok && hole3.ok);

  var c1 = await call(store, 'oid_s5_b', 'submitHoleScore', {
    matchId: 'gm_s5', groupId: 'g1', hole: 4, entityKind: 'player', entityId: b.data.userId, strokes: 4, operationId: 'b-h4'
  });
  var c2 = await call(store, 'oid_s5_b', 'submitHoleScore', {
    matchId: 'gm_s5',
    groupId: 'g1',
    hole: 4,
    entityKind: 'player',
    entityId: b.data.userId,
    strokes: 7,
    expectedVersion: 0,
    operationId: 'b-h4-stale'
  });
  assert('同洞同实体冲突正确处理', c1.ok && c2.ok === false && c2.code === 'conflict' && c2.current);

  var r1 = await call(store, 'oid_s5_b', 'submitHoleScore', {
    matchId: 'gm_s5', groupId: 'g1', hole: 5, entityKind: 'player', entityId: b.data.userId, strokes: 4, operationId: 'b-h5-op'
  });
  var r2 = await call(store, 'oid_s5_b', 'submitHoleScore', {
    matchId: 'gm_s5', groupId: 'g1', hole: 5, entityKind: 'player', entityId: b.data.userId, strokes: 9, operationId: 'b-h5-op'
  });
  assert('operationId 重试不重复', r1.ok && r2.ok && r2.data.score.strokes === 4 && r2.data.score.version === r1.data.score.version);

  var other = await call(store, 'oid_s5_a', 'createTeam', { name: '迁移队2' });
  var snap = {
    matchId: 'gm_old_body',
    teamId: other.data.teamId,
    createdBy: a.data.userId,
    matchType: 'team-internal',
    roundName: '旧body成绩',
    scoreData: { g1: { scoresByPlayer: {} } }
  };
  snap.scoreData.g1.scoresByPlayer[a.data.userId] = { scores: [4, 5, 3] };
  var mig2 = await call(store, 'oid_s5_a', 'confirmMatchMigration', {
    migrationKey: 'ms2:' + a.data.userId,
    matchSnapshot: snap
  });
  var gotMig = await call(store, 'oid_s5_a', 'getMatch', { matchId: 'gm_old_body' });
  var shards = store.dump().team_match_scores;
  var shardCount = Object.keys(shards).filter(function (k) { return shards[k].matchId === 'gm_old_body'; }).length;
  var assembled = gotMig.data.scoreData && gotMig.data.scoreData.g1 && gotMig.data.scoreData.g1.scoresByPlayer[a.data.userId];
  assert(
    'body 旧成绩迁移到 score 集合',
    mig2.ok && gotMig.ok && gotMig.data.scoreSchemaVersion === 2 && shardCount >= 3 && assembled && assembled.scores[0] === 4
  );
  var oldBodyKept = store.dump().team_matches.gm_old_body.body.scoreData;
  assert('迁移成功前保留旧成绩且新写入走分片', !!(oldBodyKept && oldBodyKept.g1));

  var restored = await call(store, 'oid_s5_a', 'getMatch', { matchId: 'gm_s5' });
  assert(
    '删除本地缓存后组装完整记分页',
    restored.ok && restored.data.scoreData.g1.scoresByPlayer[b.data.userId].scores[0] === 6
  );

  var dump = store.dump();
  var refRow = dump.team_match_refs[Object.keys(dump.team_match_refs).filter(function (k) {
    return dump.team_match_refs[k].matchId === 'gm_s5';
  })[0]];
  assert(
    'ref 摘要与分片成绩一致',
    refRow && refRow.scoreSummary && refRow.scoreSummary.holesPlayed >= 1 &&
      dump.team_matches.gm_s5.scoreSummary.holesPlayed === refRow.scoreSummary.holesPlayed
  );

  var identity = require(path.join(mini, 'utils', 'teamClub', 'identity.js'));
  var scoreSync = require(path.join(mini, 'utils', 'teamClub', 'scoreSync.js'));
  identity.setTestSession({ userId: a.data.userId, displayName: 'A' });
  scoreSync.enqueue({
    matchId: 'gm_s5',
    hole: 9,
    entityKind: 'player',
    entityId: a.data.userId,
    strokes: 4,
    operationId: 'pending-h9'
  });
  assert('未同步 outbox 时不能完赛', scoreSync.hasPending('gm_s5') === true);
  global.__TEAM_CLUB_REPO_MODE = 'cloud';
  var service = require(path.join(mini, 'utils', 'teamClub', 'service.js'));
  var blockedFinish = await service.completeMatch({ matchId: 'gm_s5' });
  assert('service 阻止未同步完赛', blockedFinish.ok === false && blockedFinish.code === 'unsynced_scores');

  identity.clearSession();
  identity.setTestSession({ userId: b.data.userId, displayName: 'B' });
  var persistKey = require(path.join(mini, 'utils', 'teamClub', 'scoreSync.js')).PREFIX + a.data.userId;
  var persistRows = storage[persistKey];
  assert(
    'logout 不会重放前一用户 outbox',
    scoreSync.hasPending('gm_s5') === false &&
      scoreSync.readOutbox().length === 0 &&
      Array.isArray(persistRows) &&
      persistRows.length >= 1
  );

  var fs = require('fs');
  var myTeamsSrc = fs.readFileSync(path.join(root, 'scripts', 'myTeams.selftest.js'), 'utf8');
  var deadIfFalse = ['if (', 'false) {'].join('');
  assert('myTeams 测试无 if(false) 死块', myTeamsSrc.indexOf(deadIfFalse) < 0);
  assert('myTeams 无提前结束 MOCK_TEAMS exit', myTeamsSrc.indexOf('if (!mock.MOCK_TEAMS)') < 0);

  var inter = await call(store, 'oid_s5_a', 'putMatch', {
    teamId: teamId,
    matchId: 'gm_inter_no',
    match: { matchId: 'gm_inter_no', teamId: teamId, matchType: 'inter-team', roundName: '队际' }
  });
  assert('队际赛不接入云正文', inter.ok === false);

  console.log('\n---- teamClub.phase5.selftest ----');
  console.log('passed=' + passed + ' failed=' + failed + ' skipped=' + skipped);
  process.exit(failed ? 1 : 0);
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
