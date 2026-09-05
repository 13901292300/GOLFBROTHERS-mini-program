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
      String(modals[0].content).indexOf('当前显示已刷新为云端最新值') >= 0 &&
      String(modals[0].content).indexOf('没有覆盖云端') >= 0
  );
  var leftoverOutbox = scoreSync.readOutbox();
  var conflictKept = scoreSync.readConflicts();
  assert(
    '冲突本地尝试不自动重放',
    leftoverOutbox.length === 0 && (conflictKept.length === 0 || conflictKept[0].autoReplay === false)
  );

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
  var appSrc = fs.readFileSync(path.join(mini, 'app.js'), 'utf8');
  assert('启动仅在云身份成功后 flush', appSrc.indexOf('if (!ident || !ident.ok) return') >= 0);

  console.log('\n---- teamClub.outbox.selftest ----');
  console.log('passed=' + passed + ' failed=' + failed + ' skipped=0');
  process.exit(failed ? 1 : 0);
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
