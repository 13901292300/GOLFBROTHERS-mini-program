/**
 * outbox 生命周期：logout 保留、账号隔离、重放鉴权、冲突提示、确认清除。
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

var storage = {};
var modals = [];
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
  showModal: function (opts) {
    modals.push(opts || {});
  }
};

var engine = require(path.join(cloudLib, 'engine.js'));
var memoryStore = require(path.join(cloudLib, 'memoryStore.js'));
var identity = require(path.join(mini, 'utils', 'teamClub', 'identity.js'));
var scoreSync = require(path.join(mini, 'utils', 'teamClub', 'scoreSync.js'));

function call(store, openid, action, payload) {
  return engine.dispatch(store, { OPENID: openid }, { action: action, payload: payload || {} });
}

async function main() {
  var store = memoryStore.createMemoryStore();
  var a = await call(store, 'oid_ob_a', 'createMyProfile', { displayName: 'A' });
  var b = await call(store, 'oid_ob_b', 'createMyProfile', { displayName: 'B' });
  var created = await call(store, 'oid_ob_a', 'createTeam', { name: 'outbox队' });
  var teamId = created.data.teamId;
  await call(store, 'oid_ob_a', 'addMember', { teamId: teamId, targetUserId: b.data.userId });
  var match = {
    matchId: 'gm_ob',
    teamId: teamId,
    matchType: 'team-internal',
    roundName: 'outbox场',
    groups: [{ groupId: 'g1', players: [{ userId: a.data.userId }, { userId: b.data.userId }] }],
    registerInfo: { users: [{ userId: a.data.userId }, { userId: b.data.userId }] }
  };
  await call(store, 'oid_ob_a', 'putMatch', { teamId: teamId, matchId: 'gm_ob', operationId: 'gm_ob', match: match });

  identity.setTestSession({ userId: a.data.userId, displayName: 'A' });
  scoreSync.enqueue({
    matchId: 'gm_ob',
    hole: 2,
    entityKind: 'player',
    entityId: a.data.userId,
    strokes: 4,
    operationId: 'a-offline-h2'
  });
  var persistKey = scoreSync.PREFIX + a.data.userId;
  var hint = identity.prepareLogout();
  assert(
    '有未同步成绩时退出前提示',
    hint.shouldPrompt === true && hint.pendingCount === 1 && hint.message === identity.LOGOUT_UNSYNCED_HINT
  );
  identity.clearSession();
  assert(
    'A离线记分后退出，持久化outbox仍存在',
    Array.isArray(storage[persistKey]) && storage[persistKey].length === 1
  );
  assert('无登录身份不读取任何分桶', scoreSync.readOutbox().length === 0 && scoreSync.countPending() === 0);
  var flushNone = await scoreSync.flush({
    getMatch: function () {
      return Promise.resolve({ ok: true, match: { status: 'live' } });
    },
    submit: function () {
      throw new Error('no identity must not submit');
    }
  });
  assert('无身份不重放', flushNone.skipped === 'no_identity' && storage[persistKey].length === 1);

  identity.setTestSession({ userId: b.data.userId, displayName: 'B' });
  var bBox = scoreSync.readOutbox();
  var bFlushCalls = 0;
  await scoreSync.flush({
    getMatch: function () {
      return Promise.resolve({ ok: true, match: { status: 'live' } });
    },
    submit: function (row) {
      bFlushCalls += 1;
      return Promise.resolve({ ok: true, data: row });
    }
  });
  assert(
    'B登录看不到也不会重放A的数据',
    bBox.length === 0 &&
      bFlushCalls === 0 &&
      JSON.stringify(bBox).indexOf(String(a.data.userId)) < 0 &&
      storage[persistKey].length === 1 &&
      String(JSON.stringify(storage[persistKey][0].strokes)) === '4'
  );

  identity.setTestSession({ userId: a.data.userId, displayName: 'A' });
  var replayed = 0;
  var replay = await scoreSync.flush({
    getMatch: function () {
      return Promise.resolve({ ok: true, match: { status: 'live' } });
    },
    submit: function (row) {
      replayed += 1;
      return Promise.resolve({ ok: true, data: { score: row } });
    }
  });
  assert('A重新登录可继续同步', replayed === 1 && replay.flushed === 1 && scoreSync.readOutbox().length === 0);

  scoreSync.enqueue({
    matchId: 'gm_ob',
    hole: 3,
    entityKind: 'player',
    entityId: a.data.userId,
    strokes: 5,
    operationId: 'a-left-h3'
  });
  var deniedSubmit = 0;
  var lost = await scoreSync.flush({
    getMatch: function () {
      return Promise.resolve({ ok: false, code: 'forbidden' });
    },
    submit: function () {
      deniedSubmit += 1;
      return Promise.resolve({ ok: true });
    }
  });
  assert(
    'A权限已失效时不重放',
    deniedSubmit === 0 && lost.held === 1 && scoreSync.readOutbox().length === 0 && scoreSync.readHeld()[0].reason === 'permission_lost'
  );

  scoreSync.enqueue({
    matchId: 'gm_ob',
    hole: 4,
    entityKind: 'player',
    entityId: a.data.userId,
    strokes: 6,
    operationId: 'a-done-h4'
  });
  var closedSubmit = 0;
  var closed = await scoreSync.flush({
    getMatch: function () {
      return Promise.resolve({ ok: true, match: { status: 'finished' } });
    },
    submit: function () {
      closedSubmit += 1;
      return Promise.resolve({ ok: true });
    }
  });
  assert(
    '比赛已完成时不重放',
    closedSubmit === 0 && closed.held === 1 && scoreSync.readHeld().some(function (r) { return r.reason === 'match_closed'; })
  );

  var closedCloud = await call(store, 'oid_ob_a', 'completeMatch', { matchId: 'gm_ob', operationId: 'gm_ob:done' });
  var afterDone = await call(store, 'oid_ob_a', 'submitHoleScore', {
    matchId: 'gm_ob',
    hole: 5,
    entityKind: 'player',
    entityId: a.data.userId,
    strokes: 3,
    operationId: 'a-h5-after'
  });
  assert('云端完赛后记分被拒', closedCloud.ok && afterDone.ok === false && afterDone.code === 'match_closed');

  scoreSync.enqueue({
    matchId: 'gm_ob',
    hole: 6,
    entityKind: 'player',
    entityId: a.data.userId,
    strokes: 8,
    expectedVersion: 0,
    operationId: 'a-conflict-h6'
  });
  modals = [];
  var conflictRes = await scoreSync.flush({
    getMatch: function () {
      return Promise.resolve({
        ok: true,
        match: { status: 'live', scoreData: {} }
      });
    },
    submit: function () {
      return Promise.resolve({
        ok: false,
        code: 'conflict',
        current: { strokes: 4, putts: null, version: 2 }
      });
    }
  });
  assert(
    '同洞冲突页面出现明确提示',
    conflictRes.conflicts === 1 &&
      scoreSync.readOutbox().length === 0 &&
      modals.length >= 1 &&
      String(modals[0].content).indexOf('该洞成绩已被其他成员更新') >= 0 &&
      String(modals[0].content).indexOf('本机未同步成绩已保留') >= 0 &&
      String(modals[0].content).indexOf('不会被云端覆盖') >= 0
  );
  var leftoverOutbox = scoreSync.readOutbox();
  var conflictKept = scoreSync.readConflicts();
  var heldConflict = scoreSync.readHeld().filter(function (r) { return r && r.reason === 'conflict'; });
  assert(
    '冲突本地尝试不自动重放',
    leftoverOutbox.length === 0 && (conflictKept.length === 0 || conflictKept[0].autoReplay === false)
  );
  assert(
    '冲突后 pending 进入 durable held 且保留两端值',
    heldConflict.length >= 1 &&
      Number(heldConflict[heldConflict.length - 1].localAttempt.strokes) === 8 &&
      Number(heldConflict[heldConflict.length - 1].cloud.strokes) === 4 &&
      heldConflict[heldConflict.length - 1].autoReplay === false
  );

  var teamMatchStore = require(path.join(mini, 'utils', 'teamMatchStore.js'));
  var protection = require(path.join(mini, 'utils', 'teamClub', 'scorePendingProtection.js'));

  function holeStroke(match, gid, pid, hole) {
    var rec =
      match &&
      match.scoreData &&
      match.scoreData[gid] &&
      match.scoreData[gid].scoresByPlayer &&
      match.scoreData[gid].scoresByPlayer[pid];
    return rec && rec.scores ? rec.scores[hole - 1] : undefined;
  }
  function holePutt(match, gid, pid, hole) {
    var rec =
      match &&
      match.scoreData &&
      match.scoreData[gid] &&
      match.scoreData[gid].scoresByPlayer &&
      match.scoreData[gid].scoresByPlayer[pid];
    return rec && rec.putts ? rec.putts[hole - 1] : undefined;
  }
  function playerRecord(gid, pid, scores, putts, extra) {
    var rec = { scores: scores.slice(), putts: (putts || []).slice() };
    if (extra) Object.keys(extra).forEach(function (k) { rec[k] = extra[k]; });
    return rec;
  }
  function seedMatch(matchId, scoreData) {
    return teamMatchStore.saveMatch(
      {
        matchId: matchId,
        teamId: teamId,
        matchType: 'team-internal',
        status: 'live',
        scoreData: scoreData
      },
      { cacheOnly: true }
    );
  }
  function hydrateCloud(matchId, scoreData) {
    return teamMatchStore.saveMatch(
      {
        matchId: matchId,
        teamId: teamId,
        matchType: 'team-internal',
        status: 'live',
        scoreData: scoreData
      },
      { cacheOnly: true }
    );
  }

  var pid = a.data.userId;
  var p0gid = 'g1';

  seedMatch('gm_p0_c1', {
    g1: { scoresByPlayer: { [pid]: playerRecord(p0gid, pid, [4]) } }
  });
  scoreSync.enqueue({
    matchId: 'gm_p0_c1',
    roundId: 'r1',
    groupId: 'g1',
    hole: 1,
    entityKind: 'player',
    entityId: pid,
    strokes: 4,
    mode: 'score',
    operationId: 'gm_p0_c1:r1:1:player:' + pid + ':score'
  });
  hydrateCloud('gm_p0_c1', {});
  var c1 = teamMatchStore.getMatchById('gm_p0_c1');
  assert(
    'CASE1 pending score 不被 cloud missing 覆盖',
    Number(holeStroke(c1, 'g1', pid, 1)) === 4 &&
      scoreSync.readOutbox().some(function (r) { return r && r.matchId === 'gm_p0_c1'; })
  );

  seedMatch('gm_p0_c2', {
    g1: { scoresByPlayer: { [pid]: playerRecord(p0gid, pid, [undefined, 5]) } }
  });
  var conflictsBeforeC2 = scoreSync.readConflicts().length;
  scoreSync.enqueue({
    matchId: 'gm_p0_c2',
    roundId: 'r1',
    groupId: 'g1',
    hole: 2,
    entityKind: 'player',
    entityId: pid,
    strokes: 5,
    mode: 'score',
    operationId: 'gm_p0_c2:r1:2:player:' + pid + ':score'
  });
  hydrateCloud('gm_p0_c2', {
    g1: { scoresByPlayer: { [pid]: { scores: [null, 6], putts: [] } } }
  });
  var c2 = teamMatchStore.getMatchById('gm_p0_c2');
  assert(
    'CASE2 普通 hydrate 值不同不制造 conflict 且保留 local pending',
    Number(holeStroke(c2, 'g1', pid, 2)) === 5 &&
      scoreSync.readConflicts().length === conflictsBeforeC2 &&
      scoreSync.readOutbox().some(function (r) { return r && r.matchId === 'gm_p0_c2' && Number(r.strokes) === 5; })
  );

  seedMatch('gm_p0_c3', {
    g1: { scoresByPlayer: { [pid]: playerRecord(p0gid, pid, [undefined, undefined, 4]) } }
  });
  hydrateCloud('gm_p0_c3', {
    g1: { scoresByPlayer: { [pid]: { scores: [null, null, 5], putts: [] } } }
  });
  var c3 = teamMatchStore.getMatchById('gm_p0_c3');
  assert('CASE3 无 pending 接受 remote 明确值', Number(holeStroke(c3, 'g1', pid, 3)) === 5);

  seedMatch('gm_p0_c4', {
    g1: { scoresByPlayer: { [pid]: playerRecord(p0gid, pid, [3], [2]) } }
  });
  scoreSync.enqueue({
    matchId: 'gm_p0_c4',
    roundId: 'r1',
    groupId: 'g1',
    hole: 1,
    entityKind: 'player',
    entityId: pid,
    putts: 2,
    mode: 'putt',
    operationId: 'gm_p0_c4:r1:1:player:' + pid + ':putt'
  });
  hydrateCloud('gm_p0_c4', {
    g1: { scoresByPlayer: { [pid]: { scores: [3], putts: [null] } } }
  });
  var c4 = teamMatchStore.getMatchById('gm_p0_c4');
  assert('CASE4 pending putt 不被 remote null 覆盖', Number(holePutt(c4, 'g1', pid, 1)) === 2);

  seedMatch('gm_p0_c5', {
    g1: {
      scoresByPlayer: {
        [pid]: playerRecord(p0gid, pid, [4], [1], { puttsManual: [true] })
      }
    }
  });
  hydrateCloud('gm_p0_c5', {
    g1: { scoresByPlayer: { [pid]: { scores: [4], putts: [1] } } }
  });
  var c5 = teamMatchStore.getMatchById('gm_p0_c5');
  var c5rec = c5.scoreData.g1.scoresByPlayer[pid];
  assert(
    'CASE5 puttsManual 在 remote assemble 缺失时保留',
    Array.isArray(c5rec.puttsManual) && c5rec.puttsManual[0] === true
  );

  var scores16 = [4, 5, 4, 5, 6, 5];
  seedMatch('gm_p0_c6', {
    g1: { scoresByPlayer: { [pid]: playerRecord(p0gid, pid, scores16) } }
  });
  scores16.forEach(function (st, i) {
    scoreSync.enqueue({
      matchId: 'gm_p0_c6',
      roundId: 'r1',
      groupId: 'g1',
      hole: i + 1,
      entityKind: 'player',
      entityId: pid,
      strokes: st,
      mode: 'score',
      operationId: 'gm_p0_c6:r1:' + (i + 1) + ':player:' + pid + ':score'
    });
  });
  hydrateCloud('gm_p0_c6', {});
  var c6 = teamMatchStore.getMatchById('gm_p0_c6');
  var c6ok = true;
  for (var h6 = 1; h6 <= 6; h6++) {
    if (Number(holeStroke(c6, 'g1', pid, h6)) !== scores16[h6 - 1]) c6ok = false;
  }
  assert('CASE6 空 cloud getMatch 后 1-6 洞仍在', c6ok);

  seedMatch('gm_p0_c7', {
    g1: { scoresByPlayer: { [pid]: playerRecord(p0gid, pid, [4, 5, 4, 5, 6, 5]) } }
  });
  for (var h7i = 1; h7i <= 6; h7i++) {
    scoreSync.enqueue({
      matchId: 'gm_p0_c7',
      roundId: 'r1',
      groupId: 'g1',
      hole: h7i,
      entityKind: 'player',
      entityId: pid,
      strokes: scores16[h7i - 1],
      mode: 'score',
      operationId: 'gm_p0_c7:r1:' + h7i + ':player:' + pid + ':score'
    });
  }
  var ackOnlyHole1 = {
    g1: { scoresByPlayer: { [pid]: { scores: [4], putts: [] } } }
  };
  hydrateCloud('gm_p0_c7', ackOnlyHole1);
  var c7 = teamMatchStore.getMatchById('gm_p0_c7');
  var c7ok = Number(holeStroke(c7, 'g1', pid, 1)) === 4;
  for (var h7b = 2; h7b <= 6; h7b++) {
    if (Number(holeStroke(c7, 'g1', pid, h7b)) !== scores16[h7b - 1]) c7ok = false;
  }
  assert('CASE7 ACK hole1 不清空其余 pending 洞', c7ok);

  seedMatch('gm_p0_c8', {
    g1: { scoresByPlayer: { [pid]: playerRecord(p0gid, pid, [4]) } }
  });
  scoreSync.enqueue({
    matchId: 'gm_p0_c8',
    roundId: 'r1',
    groupId: 'g1',
    hole: 1,
    entityKind: 'player',
    entityId: pid,
    strokes: 4,
    mode: 'score',
    operationId: 'gm_p0_c8:r1:1:player:' + pid + ':score'
  });
  var flushedAck = await scoreSync.flush({
    getMatch: function () {
      return Promise.resolve({ ok: true, match: { status: 'live' } });
    },
    submit: function (row) {
      if (row && row.matchId === 'gm_p0_c8') return Promise.resolve({ ok: true, data: { score: row } });
      return Promise.resolve({ ok: false, code: 'network' });
    }
  });
  hydrateCloud('gm_p0_c8', {
    g1: { scoresByPlayer: { [pid]: { scores: [7], putts: [] } } }
  });
  var c8 = teamMatchStore.getMatchById('gm_p0_c8');
  assert(
    'CASE8 ACK 出队后可接受 remote 明确值',
    flushedAck.flushed >= 1 &&
      !scoreSync.readOutbox().some(function (r) { return r && r.matchId === 'gm_p0_c8'; }) &&
      Number(holeStroke(c8, 'g1', pid, 1)) === 7
  );

  seedMatch('gm_p0_c9', {
    g1: { scoresByPlayer: { [pid]: playerRecord(p0gid, pid, [undefined, undefined, undefined, undefined, undefined, 5]) } }
  });
  scoreSync.enqueue({
    matchId: 'gm_p0_c9',
    roundId: 'r1',
    groupId: 'g1',
    hole: 6,
    entityKind: 'player',
    entityId: pid,
    strokes: 5,
    mode: 'score',
    operationId: 'gm_p0_c9:r1:6:player:' + pid + ':score'
  });
  var c9flush = await scoreSync.flush({
    getMatch: function (matchId) {
      if (String(matchId) === 'gm_p0_c9') {
        hydrateCloud('gm_p0_c9', {
          g1: { scoresByPlayer: { [pid]: { scores: [null, null, null, null, null, 4], putts: [] } } }
        });
      }
      return Promise.resolve({ ok: true, match: { status: 'live' } });
    },
    submit: function (row) {
      if (row && row.matchId === 'gm_p0_c9') {
        return Promise.resolve({
          ok: false,
          code: 'conflict',
          current: { strokes: 4, putts: null, version: 2 }
        });
      }
      return Promise.resolve({ ok: false, code: 'network' });
    }
  });
  var c9 = teamMatchStore.getMatchById('gm_p0_c9');
  var held9 = scoreSync.readHeld().filter(function (r) {
    return r && r.reason === 'conflict' && String(r.matchId) === 'gm_p0_c9';
  });
  scoreSync.notifyConflictsOnPage('gm_p0_c9');
  hydrateCloud('gm_p0_c9', {
    g1: { scoresByPlayer: { [pid]: { scores: [null, null, null, null, null, 4], putts: [] } } }
  });
  var c9after = teamMatchStore.getMatchById('gm_p0_c9');
  var held9after = scoreSync.readHeld().filter(function (r) {
    return r && r.reason === 'conflict' && String(r.matchId) === 'gm_p0_c9';
  });
  assert(
    'CASE9 明确 conflict 保留 local 且 notification 消费后仍 durable',
    c9flush.conflicts >= 1 &&
      Number(holeStroke(c9, 'g1', pid, 6)) === 5 &&
      Number(holeStroke(c9after, 'g1', pid, 6)) === 5 &&
      held9.length >= 1 &&
      Number(held9[0].localAttempt.strokes) === 5 &&
      Number(held9[0].cloud.strokes) === 4 &&
      held9after.length >= 1 &&
      scoreSync.readConflicts().filter(function (r) { return r && r.matchId === 'gm_p0_c9'; }).length === 0
  );

  seedMatch('gm_p0_c10', {
    g1: {
      scoresByPlayer: {},
      scoresBySide: {
        sideA: { sideId: 'sideA', sideKey: 'A', scores: [4, 5], putts: [] }
      }
    }
  });
  hydrateCloud('gm_p0_c10', {
    g1: { scoresByPlayer: {}, teamScoresByEntity: [] }
  });
  var c10 = teamMatchStore.getMatchById('gm_p0_c10');
  assert(
    'CASE10 remote 缺失 scoresBySide 不删除 local',
    c10.scoreData.g1.scoresBySide &&
      c10.scoreData.g1.scoresBySide.sideA &&
      Number(c10.scoreData.g1.scoresBySide.sideA.scores[0]) === 4
  );

  seedMatch('gm_p0_c11', {
    g1: { scoresByPlayer: { [pid]: playerRecord(p0gid, pid, [6]) } }
  });
  hydrateCloud('gm_p0_c11', {
    g1: { scoresByPlayer: { [pid]: { scores: [null], putts: [] } } }
  });
  var c11 = teamMatchStore.getMatchById('gm_p0_c11');
  assert(
    'CASE11 无 tombstone 时 remote null 不删除非 pending local',
    Number(holeStroke(c11, 'g1', pid, 1)) === 6
  );

  var mergedPure = protection.mergeRemoteScoreDataWithLocalProtection(
    { g1: { scoresByPlayer: { p1: { scores: [4], putts: [2], puttsManual: [true] } } } },
    {},
    {
      matchId: 'gm_mask',
      pendingRows: [
        { matchId: 'gm_mask', hole: 1, entityKind: 'player', entityId: 'p1', strokes: 4, groupId: 'g1' }
      ]
    }
  );
  assert(
    'pending mask helper 保护 strokes/puttsManual',
    Number(mergedPure.g1.scoresByPlayer.p1.scores[0]) === 4 &&
      mergedPure.g1.scoresByPlayer.p1.puttsManual[0] === true
  );

  storage[persistKey] = [];

  scoreSync.enqueue({
    matchId: 'gm_ob',
    hole: 7,
    entityKind: 'player',
    entityId: a.data.userId,
    strokes: 3,
    operationId: 'a-clear-h7'
  });
  var refuse = identity.discardLocalAccountData();
  assert(
    '未确认不得删除未同步outbox',
    refuse.ok === false &&
      refuse.code === 'need_confirm' &&
      refuse.pendingCount === 1 &&
      scoreSync.countPending() === 1
  );
  var wiped = identity.discardLocalAccountData({ confirmed: true });
  identity.setTestSession({ userId: a.data.userId, displayName: 'A' });
  assert(
    '用户明确选择清除本机数据后才删除未同步outbox',
    wiped.ok === true && wiped.discarded === 1 && (!storage[persistKey] || storage[persistKey].length === 0)
  );

  var scorePage = fs.readFileSync(path.join(mini, 'subpackages', 'scoring', 'pages', 'score', 'index.js'), 'utf8');
  assert('记分页 onShow 消费冲突提示', scorePage.indexOf('notifyConflictsOnPage') >= 0);
  assert(
    '记分页仅当前 matchId pending 才 flush',
    scorePage.indexOf('_tryFlushPendingScoreSync') >= 0 &&
      scorePage.indexOf('hasPending(matchId)') >= 0 &&
      scorePage.indexOf("hasPending('')") < 0 &&
      scorePage.indexOf('if (this._isGameStoreContext()) return') >= 0
  );
  var appSrc = fs.readFileSync(path.join(mini, 'app.js'), 'utf8');
  assert('启动仅在云身份成功后 flush', appSrc.indexOf('if (!ident || !ident.ok) return') >= 0);
  assert(
    'App 网络恢复与 onShow 补同步且 listener 只绑一次',
    appSrc.indexOf('_scoreSyncNetworkBound') >= 0 &&
      appSrc.indexOf('wx.onNetworkStatusChange') >= 0 &&
      appSrc.indexOf('isConnected === true') >= 0 &&
      /onShow:\s*function\s*\(\)\s*\{[\s\S]*_tryFlushScoreSync/.test(appSrc)
  );

  identity.setTestSession({ userId: a.data.userId, displayName: 'A' });
  scoreSync.enqueue({
    matchId: 'gm_p2',
    hole: 1,
    entityKind: 'player',
    entityId: a.data.userId,
    strokes: 4,
    operationId: 'p2-c12'
  });
  var submitIds = [];
  var secondHandlersUsed = 0;
  var liveMatch = function () {
    return Promise.resolve({ ok: true, match: { status: 'live' } });
  };
  var flushSharedA = scoreSync.flush({
    getMatch: liveMatch,
    submit: function (row) {
      submitIds.push(row && row.operationId);
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve({ ok: true, data: { score: row } });
        }, 40);
      });
    }
  });
  var flushSharedB = scoreSync.flush({
    getMatch: liveMatch,
    submit: function () {
      secondHandlersUsed += 1;
      return Promise.resolve({ ok: true });
    }
  });
  var sharedRes = await flushSharedA;
  await flushSharedB;
  assert(
    'CASE12 并发 flush 共享 inFlight 且每 row submit 一次',
    flushSharedA === flushSharedB &&
      submitIds.length === 1 &&
      submitIds[0] === 'p2-c12' &&
      secondHandlersUsed === 0 &&
      sharedRes.flushed === 1 &&
      scoreSync.readOutbox().length === 0
  );

  scoreSync.enqueue({
    matchId: 'gm_p2',
    hole: 2,
    entityKind: 'player',
    entityId: a.data.userId,
    strokes: 5,
    operationId: 'p2-c13'
  });
  var firstFail = await scoreSync.flush({
    getMatch: liveMatch,
    submit: function () {
      return Promise.resolve({ ok: false, code: 'network' });
    }
  });
  var retryCount = 0;
  var secondOk = await scoreSync.flush({
    getMatch: liveMatch,
    submit: function (row) {
      retryCount += 1;
      return Promise.resolve({ ok: true, data: { score: row } });
    }
  });
  assert(
    'CASE13 失败后释放 inFlight 可再 flush',
    firstFail.remain === 1 &&
      retryCount === 1 &&
      secondOk.flushed === 1 &&
      scoreSync.readOutbox().length === 0
  );

  scoreSync.enqueue({
    matchId: 'gm_p2',
    hole: 3,
    entityKind: 'player',
    entityId: a.data.userId,
    strokes: 4,
    operationId: 'p2-c14-ok'
  });
  scoreSync.enqueue({
    matchId: 'gm_p2',
    hole: 4,
    entityKind: 'player',
    entityId: a.data.userId,
    strokes: 6,
    operationId: 'p2-c14-fail'
  });
  var partial = await scoreSync.flush({
    getMatch: liveMatch,
    submit: function (row) {
      if (row && row.operationId === 'p2-c14-ok') return Promise.resolve({ ok: true, data: row });
      return Promise.resolve({ ok: false, code: 'network' });
    }
  });
  assert(
    'CASE14 部分成功只 remain 失败 row',
    partial.flushed === 1 &&
      partial.remain === 1 &&
      scoreSync.readOutbox().length === 1 &&
      scoreSync.readOutbox()[0].operationId === 'p2-c14-fail'
  );

  var leftoverP2 = scoreSync.readOutbox();
  identity.clearSession();
  var skipFlush = await scoreSync.flush({
    getMatch: function () {
      throw new Error('no identity must not getMatch');
    },
    submit: function () {
      throw new Error('no identity must not submit');
    }
  });
  assert(
    'CASE15 无 uid skip 且不写匿名队列',
    skipFlush.skipped === 'no_identity' &&
      Array.isArray(storage[persistKey]) &&
      storage[persistKey].length === leftoverP2.length &&
      scoreSync.readOutbox().length === 0
  );

  identity.setTestSession({ userId: a.data.userId, displayName: 'A' });
  scoreSync.enqueue({
    matchId: 'gm_p2',
    hole: 5,
    entityKind: 'player',
    entityId: a.data.userId,
    strokes: 3,
    operationId: 'p2-c16-a'
  });
  identity.setTestSession({ userId: b.data.userId, displayName: 'B' });
  var bSubmit = 0;
  await scoreSync.flush({
    getMatch: liveMatch,
    submit: function () {
      bSubmit += 1;
      return Promise.resolve({ ok: true });
    }
  });
  identity.setTestSession({ userId: a.data.userId, displayName: 'A' });
  assert(
    'CASE16 B flush 不消费 A outbox',
    bSubmit === 0 &&
      scoreSync.readOutbox().some(function (r) {
        return r && r.operationId === 'p2-c16-a';
      })
  );

  await scoreSync.flush({
    getMatch: liveMatch,
    submit: function () {
      return Promise.resolve({ ok: true });
    }
  });
  var persistKeyB = scoreSync.PREFIX + b.data.userId;
  var heldKeyA = scoreSync.HELD_PREFIX + a.data.userId;
  var heldKeyB = scoreSync.HELD_PREFIX + b.data.userId;
  var conflictKeyA = scoreSync.CONFLICT_PREFIX + a.data.userId;
  var conflictKeyB = scoreSync.CONFLICT_PREFIX + b.data.userId;
  identity.setTestSession({ userId: a.data.userId, displayName: 'A' });
  scoreSync.enqueue({
    matchId: 'gm_p25',
    hole: 1,
    entityKind: 'player',
    entityId: a.data.userId,
    strokes: 4,
    operationId: 'p25-row-a'
  });
  identity.setTestSession({ userId: b.data.userId, displayName: 'B' });
  scoreSync.enqueue({
    matchId: 'gm_p25',
    hole: 1,
    entityKind: 'player',
    entityId: b.data.userId,
    strokes: 5,
    operationId: 'p25-row-b'
  });
  identity.setTestSession({ userId: a.data.userId, displayName: 'A' });
  var switchedToB = 0;
  var aFlushFail = scoreSync.flush({
    getMatch: liveMatch,
    submit: function () {
      identity.setTestSession({ userId: b.data.userId, displayName: 'B' });
      switchedToB += 1;
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve({ ok: false, code: 'network' });
        }, 30);
      });
    }
  });
  var bJoinedFail = scoreSync.flush({
    getMatch: liveMatch,
    submit: function () {
      throw new Error('B must share A inFlight');
    }
  });
  assert('CASEA 切换中 B 共享 A inFlight', aFlushFail === bJoinedFail);
  await aFlushFail;
  identity.setTestSession({ userId: a.data.userId, displayName: 'A' });
  var aRemain = scoreSync.readOutbox();
  identity.setTestSession({ userId: b.data.userId, displayName: 'B' });
  var bRemain = scoreSync.readOutbox();
  assert(
    'CASEA 失败 remain 仍在 A 且 B 未被污染',
    switchedToB >= 1 &&
      aRemain.length === 1 &&
      aRemain[0].operationId === 'p25-row-a' &&
      bRemain.length === 1 &&
      bRemain[0].operationId === 'p25-row-b' &&
      Array.isArray(storage[persistKeyB]) &&
      storage[persistKeyB].some(function (r) {
        return r && r.operationId === 'p25-row-b';
      })
  );

  identity.setTestSession({ userId: a.data.userId, displayName: 'A' });
  var aFlushOk = scoreSync.flush({
    getMatch: liveMatch,
    submit: function () {
      identity.setTestSession({ userId: b.data.userId, displayName: 'B' });
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve({ ok: true, data: {} });
        }, 30);
      });
    }
  });
  await aFlushOk;
  identity.setTestSession({ userId: a.data.userId, displayName: 'A' });
  var aAfterOk = scoreSync.readOutbox();
  identity.setTestSession({ userId: b.data.userId, displayName: 'B' });
  var bAfterOk = scoreSync.readOutbox();
  assert(
    'CASEB A 成功清空自己队列且不写空数组到 B',
    aAfterOk.length === 0 &&
      bAfterOk.length === 1 &&
      bAfterOk[0].operationId === 'p25-row-b'
  );

  identity.setTestSession({ userId: a.data.userId, displayName: 'A' });
  scoreSync.enqueue({
    matchId: 'gm_p25',
    hole: 2,
    entityKind: 'player',
    entityId: a.data.userId,
    strokes: 6,
    operationId: 'p25-conflict-a'
  });
  storage[heldKeyA] = [];
  storage[heldKeyB] = [{ reason: 'keep-b', matchId: 'gm_p25' }];
  storage[conflictKeyA] = [];
  storage[conflictKeyB] = [{ matchId: 'gm_keep_b' }];
  await scoreSync.flush({
    getMatch: liveMatch,
    submit: function () {
      identity.setTestSession({ userId: b.data.userId, displayName: 'B' });
      return Promise.resolve({
        ok: false,
        code: 'conflict',
        current: { strokes: 3, putts: null, version: 2 }
      });
    }
  });
  identity.setTestSession({ userId: a.data.userId, displayName: 'A' });
  var heldA = scoreSync.readHeld();
  var conflictsA = scoreSync.readConflicts();
  identity.setTestSession({ userId: b.data.userId, displayName: 'B' });
  var heldB = scoreSync.readHeld();
  var conflictsB = scoreSync.readConflicts();
  assert(
    'CASEC conflict/held 写 A 桶且不改 B',
    heldA.some(function (r) {
      return r && r.reason === 'conflict' && r.operationId === 'p25-conflict-a';
    }) &&
      conflictsA.length === 0 &&
      heldB.length === 1 &&
      heldB[0].reason === 'keep-b' &&
      conflictsB.length === 1 &&
      conflictsB[0].matchId === 'gm_keep_b'
  );

  identity.setTestSession({ userId: b.data.userId, displayName: 'B' });
  var bFlushed = await scoreSync.flush({
    getMatch: liveMatch,
    submit: function (row) {
      return Promise.resolve({ ok: true, data: { score: row } });
    }
  });
  identity.setTestSession({ userId: b.data.userId, displayName: 'B' });
  assert(
    'CASED A settle 后 B 可独立 flush',
    bFlushed.flushed === 1 && scoreSync.readOutbox().length === 0
  );

  console.log('\n---- teamClub.outbox.selftest ----');
  console.log('passed=' + passed + ' failed=' + failed + ' skipped=0');
  process.exit(failed ? 1 : 0);
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
