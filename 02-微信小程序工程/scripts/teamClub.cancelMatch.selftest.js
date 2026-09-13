/**
 * 球队比赛取消：云端 cancelled 为事实源；失败不得本地伪装成功。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/teamClub.cancelMatch.selftest.js
 */

global.__TEAM_CLUB_REPO_MODE = 'local';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var cloudLib = path.join(root, 'cloudfunctions', 'teamClub', 'lib');

var passed = 0;
var failed = 0;

function assert(label, ok) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
    return;
  }
  failed += 1;
  console.log('FAIL  ' + label);
}

var __wxStorage = {};
global.wx = {
  getStorageSync: function (key) {
    return __wxStorage[key];
  },
  setStorageSync: function (key, value) {
    __wxStorage[key] = value;
  },
  removeStorageSync: function (key) {
    delete __wxStorage[key];
  }
};

var cancelTeamMatch = require(path.join(mini, 'utils', 'teamClub', 'cancelTeamMatch.js'));
var identity = require(path.join(mini, 'utils', 'teamClub', 'identity.js'));
var repo = require(path.join(mini, 'utils', 'teamClub', 'repository.js'));
var service = require(path.join(mini, 'utils', 'teamClub', 'service.js'));
var engine = require(path.join(cloudLib, 'engine.js'));
var memoryStore = require(path.join(cloudLib, 'memoryStore.js'));

function call(store, openid, action, payload) {
  return engine.dispatch(store, { OPENID: openid }, { action: action, payload: payload || {} });
}

var helperSrc = fs.readFileSync(path.join(mini, 'utils', 'teamClub', 'cancelTeamMatch.js'), 'utf8');

assert('helper 不删除云文档', helperSrc.indexOf('removeMatch') < 0);
assert('helper 只写 cancelled + writeKind full', helperSrc.indexOf("status: 'cancelled'") >= 0 && helperSrc.indexOf("writeKind: 'full'") >= 0);
assert('helper 不写 canceled 美式拼写', helperSrc.indexOf("status: 'canceled'") < 0);
assert('helper 不含 toast/navigate', helperSrc.indexOf('showToast') < 0 && helperSrc.indexOf('navigate') < 0);

identity.setTestSession({ userId: 'user_owner', displayName: 'Owner' });
var teamA = repo.createTeam({ name: '取消测球队', shortName: '取消', city: '杭州', acceptingMembers: true });
assert('本地可建队', teamA.ok);
var teamId = teamA.data.teamId;

var putLive = repo.putMatch({
  teamId: teamId,
  matchId: 'gm_cancel_live',
  match: {
    matchId: 'gm_cancel_live',
    teamId: teamId,
    matchType: 'team-internal',
    roundName: '进行中应展示',
    status: 'live'
  }
});
var putFin = repo.putMatch({
  teamId: teamId,
  matchId: 'gm_cancel_fin',
  match: {
    matchId: 'gm_cancel_fin',
    teamId: teamId,
    matchType: 'team-internal',
    roundName: '已结束应展示',
    status: 'finished'
  }
});
var putSched = repo.putMatch({
  teamId: teamId,
  matchId: 'gm_cancel_sched',
  match: {
    matchId: 'gm_cancel_sched',
    teamId: teamId,
    matchType: 'team-internal',
    roundName: '未开始后取消',
    teeTime: '2026-10-01',
    courseName: '保留球场',
    status: 'scheduled'
  }
});
var putKeep = repo.putMatch({
  teamId: teamId,
  matchId: 'gm_cancel_keep',
  match: {
    matchId: 'gm_cancel_keep',
    teamId: teamId,
    matchType: 'team-internal',
    roundName: '未开始应展示',
    status: 'scheduled'
  }
});
assert('写入 live/finished/scheduled', putLive.ok && putFin.ok && putSched.ok && putKeep.ok);

var captured = null;
var purgedIds = [];
cancelTeamMatch
  .confirmTeamMatchCancel(
    { matchId: 'gm_cancel_sched', teamId: teamId, cloudVersion: putSched.data.cloudVersion },
    {
      putMatch: function (match, opts) {
        captured = { match: match, opts: opts };
        return service.putMatch(match, opts);
      },
      purgeLocal: function (id) {
        purgedIds.push(id);
        return true;
      },
      deleteSchedules: function () {}
    }
  )
  .then(function (res) {
    assert(
      'Case1 云 putMatch 收到 cancelled 且 writeKind=full',
      res.ok &&
        captured &&
        captured.match.status === 'cancelled' &&
        captured.match.matchId === 'gm_cancel_sched' &&
        captured.opts.writeKind === 'full'
    );
    assert('Case1 云成功后才本地清理', res.ok && purgedIds.length === 1 && purgedIds[0] === 'gm_cancel_sched');
    var opened = repo.getMatch('gm_cancel_sched');
    assert(
      'Case1 正文其它字段未清空',
      opened.ok &&
        opened.data.status === 'cancelled' &&
        opened.data.roundName === '未开始后取消' &&
        opened.data.courseName === '保留球场'
    );
    captured = null;
    return cancelTeamMatch.confirmTeamMatchCancel(
      { matchId: 'gm_cancel_sched', teamId: teamId },
      {
        putMatch: function (match, opts) {
          captured = { match: match, opts: opts };
          return service.putMatch(match, opts);
        },
        purgeLocal: function () {}
      }
    );
  })
  .then(function (againRes) {
    assert(
      '已 cancelled 再取消仍写 cancelled 且不失败',
      againRes.ok && captured && captured.match.status === 'cancelled'
    );
    var keep = repo.getMatch('gm_cancel_keep');
    assert('不误改无关比赛', keep.ok && String(keep.data.status) === 'scheduled');
    purgedIds = [];
    captured = null;
    return cancelTeamMatch.confirmTeamMatchCancel(
      { matchId: 'gm_cancel_live', teamId: teamId },
      {
        putMatch: function () {
          return Promise.resolve({ ok: false, code: 'network_error', message: '网络异常' });
        },
        purgeLocal: function (id) {
          purgedIds.push(id);
          return true;
        }
      }
    );
  })
  .then(function (failRes) {
    assert(
      'Case2 云失败不 purge 且不成功',
      failRes.ok === false && purgedIds.length === 0 && failRes.message.indexOf('取消失败') >= 0
    );
    var stillLive = repo.getMatch('gm_cancel_live');
    assert('Case2 本地比赛仍在', stillLive.ok && String(stillLive.data.status) === 'live');
    return service.listTeamMatches(teamId, { immediate: true });
  })
  .then(function (listed) {
    var ids = (listed.list || []).map(function (row) {
      return row.matchId;
    });
    assert('Case3 已取消不展示', listed.ok && ids.indexOf('gm_cancel_sched') < 0);
    assert(
      'Case4 scheduled/live/finished 仍展示',
      ids.indexOf('gm_cancel_keep') >= 0 &&
        ids.indexOf('gm_cancel_live') >= 0 &&
        ids.indexOf('gm_cancel_fin') >= 0
    );
    return runEngineMerge();
  })
  .then(function () {
    console.log('\n---- teamClub.cancelMatch.selftest ----');
    console.log('passed=' + passed + ' failed=' + failed);
    process.exit(failed ? 1 : 0);
  })
  .catch(function (err) {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });

async function runEngineMerge() {
  var store = memoryStore.createMemoryStore();
  await call(store, 'oid_cancel_owner', 'createMyProfile', { displayName: '取消者' });
  var created = await call(store, 'oid_cancel_owner', 'createTeam', { name: '云取消队' });
  var cloudTeamId = created.data.teamId;
  var made = await call(store, 'oid_cancel_owner', 'putMatch', {
    teamId: cloudTeamId,
    matchId: 'gm_cloud_cancel',
    operationId: 'gm_cloud_cancel',
    match: {
      matchId: 'gm_cloud_cancel',
      teamId: cloudTeamId,
      roundName: '云端保留标题',
      courseName: '云端球场',
      status: 'scheduled'
    }
  });
  assert('云端创建 scheduled', made.ok);
  var opened = await call(store, 'oid_cancel_owner', 'getMatch', { matchId: 'gm_cloud_cancel' });
  var cancelled = await call(store, 'oid_cancel_owner', 'putMatch', {
    teamId: cloudTeamId,
    matchId: 'gm_cloud_cancel',
    writeKind: 'full',
    expectedVersion: opened.data.cloudVersion,
    operationId: 'gm_cloud_cancel:cancel',
    match: { matchId: 'gm_cloud_cancel', teamId: cloudTeamId, status: 'cancelled' }
  });
  assert('云端 putMatch cancelled 成功', cancelled.ok && cancelled.data.status === 'cancelled');
  var after = await call(store, 'oid_cancel_owner', 'getMatch', { matchId: 'gm_cloud_cancel' });
  assert(
    '云端只改 status 不清空正文',
    after.ok && after.data.status === 'cancelled' && after.data.roundName === '云端保留标题' && after.data.courseName === '云端球场'
  );
  var listed = await call(store, 'oid_cancel_owner', 'listTeamMatches', { teamId: cloudTeamId });
  assert(
    '云仓储仍返回 cancelled 记录',
    listed.ok &&
      (listed.data || []).some(function (row) {
        return row.matchId === 'gm_cloud_cancel' && (row.status === 'cancelled' || row.statusLabel === '已取消');
      })
  );
}
