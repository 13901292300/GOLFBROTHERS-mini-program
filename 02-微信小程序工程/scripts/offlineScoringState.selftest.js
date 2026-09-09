/**
 * Offline V1 Phase 5：离线记分状态机 / 提示 / 恢复 / 首页 banner。
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/offlineScoringState.selftest.js
 */

var path = require('path');
var fs = require('fs');
var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');

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

function resetAll() {
  storage = {};
  offlineScoringState._resetForTest();
  offlineScoringPrompt._resetForTest();
  offlineScoringRecovery._resetForTest();
}

var offlineScoringState = require(path.join(mini, 'utils', 'offlineScoringState.js'));
var offlineScoringPrompt = require(path.join(mini, 'utils', 'offlineScoringPrompt.js'));
var offlineScoringRecovery = require(path.join(mini, 'utils', 'offlineScoringRecovery.js'));
var offlineScoringUi = require(path.join(mini, 'utils', 'offlineScoringUi.js'));

resetAll();
assert('CASE1 默认无 session → ONLINE', offlineScoringState.get().mode === 'ONLINE' && !offlineScoringState.get().session);

offlineScoringState.enter({ contextType: 'game', contextId: 'game-1', title: '周末局' });
assert(
  'CASE2 enter game-1 → OFFLINE',
  offlineScoringState.get().mode === 'OFFLINE' &&
    offlineScoringState.get().session.contextId === 'game-1'
);

var persisted = storage[offlineScoringState.STORAGE_KEY];
offlineScoringState._resetForTest();
storage[offlineScoringState.STORAGE_KEY] = persisted;
assert(
  'CASE3 persist + reload 仍 OFFLINE/game-1',
  offlineScoringState.get().mode === 'OFFLINE' &&
    offlineScoringState.get().session.contextId === 'game-1'
);

offlineScoringState.markSyncing();
assert('CASE4 markSyncing → SYNCING', offlineScoringState.get().mode === 'SYNCING');

offlineScoringState.markSyncFailed({ reason: 'pending_or_held' });
assert('CASE5 markSyncFailed → SYNC_FAILED', offlineScoringState.get().mode === 'SYNC_FAILED');

offlineScoringState.clearAfterSync();
assert('CASE6 clearAfterSync → ONLINE / session removed', offlineScoringState.get().mode === 'ONLINE' && !offlineScoringState.get().session);

resetAll();
offlineScoringState.enter({ contextType: 'game', contextId: 'game-1' });
offlineScoringState.clearAfterSync({ contextId: 'game-2' });
assert(
  'CASE7 其它 context 不误清',
  offlineScoringState.get().mode === 'OFFLINE' &&
    offlineScoringState.get().session.contextId === 'game-1'
);

resetAll();
var ctx = { contextType: 'game', contextId: 'g-1', title: 'A' };
assert(
  'CASE8 score visible + true→false → 可提示一次',
  offlineScoringPrompt.shouldProposeOffline({
    scoreVisible: true,
    networkConnected: false,
    mode: 'ONLINE',
    context: ctx
  }) === true
);
offlineScoringPrompt.markProposalShown();
assert(
  'CASE9 同一 outage 重复 false → 不重复',
  offlineScoringPrompt.shouldProposeOffline({
    scoreVisible: true,
    networkConnected: false,
    mode: 'ONLINE',
    context: ctx
  }) === false
);

assert(
  'CASE10 继续在线 → 不 enter OFFLINE',
  offlineScoringState.get().mode === 'ONLINE'
);

offlineScoringState.enter(ctx);
assert('CASE11 用户确认 → OFFLINE', offlineScoringState.get().mode === 'OFFLINE');

resetAll();
offlineScoringPrompt.shouldProposeOffline({
  scoreVisible: true,
  networkConnected: false,
  mode: 'ONLINE',
  context: ctx
});
offlineScoringPrompt.markProposalShown();
offlineScoringPrompt.markNetworkConnected(true);
assert(
  'CASE12 false→true→false 新 outage 可再提示',
  offlineScoringPrompt.shouldProposeOffline({
    scoreVisible: true,
    networkConnected: false,
    mode: 'ONLINE',
    context: ctx
  }) === true
);

resetAll();
assert(
  'CASE13 score 已是 false 可提示一次',
  offlineScoringPrompt.shouldProposeOffline({
    scoreVisible: true,
    networkConnected: false,
    mode: 'ONLINE',
    context: ctx
  }) === true
);

resetAll();
offlineScoringState.enter(ctx);
assert(
  'CASE14 已有 OFFLINE → 不提示 proposal',
  offlineScoringPrompt.shouldProposeOffline({
    scoreVisible: true,
    networkConnected: false,
    mode: 'OFFLINE',
    context: ctx
  }) === false
);

function recoverOnline(extra) {
  var d = extra && typeof extra === 'object' ? extra : {};
  d.network = d.network || { networkStatusKnown: true, networkConnected: true };
  return d;
}

var sessionA = { contextType: 'game', contextId: 'game-A', title: 'A局' };
var sessionB = { contextType: 'game', contextId: 'game-B', title: 'B局' };

resetAll();
offlineScoringState.enter({ contextType: 'game', contextId: 'game-1' });
var syncingSnap;
offlineScoringRecovery
  .handleNetworkState(
    { networkConnected: true, networkStatusKnown: true },
    recoverOnline({
      flush: function () {
        syncingSnap = offlineScoringState.get().mode;
        return Promise.resolve({ ok: true, remain: 0 });
      },
      hasPending: function () {
        return false;
      },
      hasHeld: function () {
        return false;
      }
    })
  )
  .then(function (out) {
    assert('CASE15 OFFLINE + network true → 先 SYNCING', syncingSnap === 'SYNCING');
    assert('CASE16 flush success + no pending → ONLINE', out.mode === 'ONLINE' && !out.session);

    resetAll();
    offlineScoringState.enter({ contextType: 'game', contextId: 'game-1' });
    return offlineScoringRecovery.handleNetworkState(
      { networkConnected: true, networkStatusKnown: true },
      recoverOnline({
        flush: function () {
          return Promise.reject(new Error('net'));
        },
        hasPending: function () {
          return false;
        },
        hasHeld: function () {
          return false;
        }
      })
    );
  })
  .then(function (out) {
    assert('CASE17 flush fail → SYNC_FAILED', out.mode === 'SYNC_FAILED');

    resetAll();
    offlineScoringState.enter({ contextType: 'game', contextId: 'game-1' });
    return offlineScoringRecovery.handleNetworkState(
      { networkConnected: true, networkStatusKnown: true },
      recoverOnline({
        flush: function () {
          return Promise.resolve({ ok: true, remain: 0 });
        },
        hasPending: function () {
          return true;
        },
        hasHeld: function () {
          return false;
        }
      })
    );
  })
  .then(function (out) {
    assert('CASE18 network true 但 pending 仍在 → 不能 ONLINE', out.mode === 'SYNC_FAILED');

    return offlineScoringRecovery.retryNow(
      recoverOnline({
        flush: function () {
          return Promise.resolve({ ok: true, remain: 0 });
        },
        hasPending: function () {
          return false;
        },
        hasHeld: function () {
          return false;
        }
      })
    );
  })
  .then(function (out) {
    assert('CASE19 retry success → ONLINE', out.mode === 'ONLINE');

    resetAll();
    assert(
      'CASE20 无 session → 首页无 banner',
      offlineScoringUi.homeShouldShowBanner(offlineScoringState.get()) === false &&
        !offlineScoringUi.homeBannerText('ONLINE')
    );
    assert(
      'CASE21 设备没网但无 offline game → 仍无 banner',
      offlineScoringUi.homeShouldShowBanner({ mode: 'ONLINE', session: null }) === false
    );

    offlineScoringState.enter({ contextType: 'game', contextId: 'game-1' });
    assert(
      'CASE22 OFFLINE → 离线记分中',
      offlineScoringUi.homeBannerText(offlineScoringState.get().mode) === '离线记分中'
    );

    offlineScoringState.markSyncing();
    assert(
      'CASE23 SYNCING → 正在同步成绩',
      offlineScoringUi.homeBannerText(offlineScoringState.get().mode).indexOf('正在同步成绩') >= 0
    );

    offlineScoringState.markSyncFailed({ reason: 'x' });
    assert(
      'CASE24 SYNC_FAILED → 部分成绩尚未同步',
      offlineScoringUi.homeBannerText(offlineScoringState.get().mode) === '部分成绩尚未同步'
    );

    offlineScoringState.clearAfterSync();
    assert(
      'CASE25 ONLINE → banner 消失',
      offlineScoringUi.homeShouldShowBanner(offlineScoringState.get()) === false
    );

    resetAll();
    assert(
      'CASE26 matchesContext 需同时匹配 type+id',
      offlineScoringState.matchesContext(
        { contextType: 'game', contextId: 'game-A' },
        sessionA
      ) === true
    );
    assert(
      'CASE27 同 id 不同 type 不匹配',
      offlineScoringState.matchesContext(
        { contextType: 'game', contextId: 'x-1' },
        { contextType: 'teamMatch', contextId: 'x-1' }
      ) === false
    );

    resetAll();
    offlineScoringState.enter(sessionA);
    return offlineScoringRecovery.handleNetworkState(
      { networkConnected: true, networkStatusKnown: true },
      recoverOnline({
        flush: function () {
          return Promise.resolve({ ok: true, remain: 0 });
        },
        hasPending: function (cid) {
          return String(cid) === 'game-B';
        },
        hasHeld: function () {
          return false;
        }
      })
    );
  })
  .then(function (out) {
    assert(
      'CASE28 session A 无 pending、B 有 pending → A 可 ONLINE',
      out.mode === 'ONLINE' && !out.session
    );

    resetAll();
    offlineScoringState.enter(sessionA);
    return offlineScoringRecovery.handleNetworkState(
      { networkConnected: true, networkStatusKnown: true },
      recoverOnline({
        flush: function () {
          return Promise.resolve({ ok: true, remain: 0 });
        },
        hasPending: function (cid) {
          return String(cid) === 'game-A';
        },
        hasHeld: function () {
          return false;
        }
      })
    );
  })
  .then(function (out) {
    assert(
      'CASE29 session A 有 pending、B 无 → A 不能 ONLINE',
      out.mode === 'SYNC_FAILED' && out.session && out.session.contextId === 'game-A'
    );

    resetAll();
    offlineScoringState.enter(sessionA);
    var snapA = offlineScoringState.get();
    assert(
      'CASE30 score B 不显示 A 的 pill，首页仍提醒 A',
      offlineScoringUi.scorePillVisible(snapA, sessionB) === false &&
        offlineScoringUi.scorePillVisible(snapA, sessionA) === true &&
        offlineScoringUi.homeShouldShowBanner(snapA) === true
    );

    var enteredAt = snapA.session.enteredAt;
    var modeA = snapA.session.mode;
    var conflict = offlineScoringState.enter(sessionB);
    var afterConflict = offlineScoringState.get();
    assert(
      'CASE31 enter(B) → OTHER_CONTEXT_ACTIVE 且 A 不变',
      conflict.ok === false &&
        conflict.reason === 'OTHER_CONTEXT_ACTIVE' &&
        afterConflict.session.contextId === 'game-A' &&
        afterConflict.session.mode === modeA &&
        afterConflict.session.enteredAt === enteredAt
    );

    resetAll();
    offlineScoringState.enter(sessionA);
    return offlineScoringRecovery.handleNetworkState(
      { networkConnected: true, networkStatusKnown: false },
      recoverOnline({
        flush: function () {
          return Promise.resolve({ ok: true, remain: 0 });
        },
        hasPending: function () {
          return false;
        },
        hasHeld: function () {
          return false;
        }
      })
    );
  })
  .then(function (out) {
    assert(
      'CASE32 cold launch known=false 不 markSyncing / 不清 session',
      out.mode === 'OFFLINE' && out.session && out.session.contextId === 'game-A'
    );
    return offlineScoringRecovery.handleNetworkState(
      { networkConnected: false, networkStatusKnown: true },
      recoverOnline({
        flush: function () {
          return Promise.resolve({ ok: true, remain: 0 });
        },
        hasPending: function () {
          return false;
        },
        hasHeld: function () {
          return false;
        }
      })
    );
  })
  .then(function (out) {
    assert('CASE32b probe none 后仍 OFFLINE', out.mode === 'OFFLINE' && !!out.session);
    return offlineScoringRecovery.handleNetworkState(
      { networkConnected: true, networkStatusKnown: true },
      recoverOnline({
        flush: function () {
          return Promise.resolve({ ok: true, remain: 0 });
        },
        hasPending: function () {
          return false;
        },
        hasHeld: function () {
          return false;
        }
      })
    );
  })
  .then(function (out) {
    assert('CASE32c 确认联网后才 recovery → ONLINE', out.mode === 'ONLINE' && !out.session);

    resetAll();
    offlineScoringState.enter(sessionA);
    var phase2Settled = false;
    var phase2 = Promise.resolve({ ok: true, remain: 0 }).then(function (res) {
      phase2Settled = true;
      return res;
    });
    return offlineScoringRecovery
      .followFlush(phase2, {
        readNetwork: function () {
          return { networkStatusKnown: false, networkConnected: true };
        },
        hasPending: function () {
          return false;
        },
        hasHeld: function () {
          return false;
        }
      })
      .then(function (followOut) {
        return phase2.then(function () {
          return followOut;
        });
      });
  })
  .then(function (out) {
    assert(
      'CASE33 onShow 原 flush settle 不清 OFFLINE session',
      out.mode === 'OFFLINE' &&
        out.session &&
        out.session.contextId === 'game-A' &&
        offlineScoringState.get().mode === 'OFFLINE'
    );

    resetAll();
    offlineScoringState.enter(sessionA);
    assert(
      'CASE34 session A + score B 断网不弹普通 proposal',
      offlineScoringPrompt.shouldProposeOffline({
        scoreVisible: true,
        networkConnected: false,
        mode: 'ONLINE',
        context: sessionB
      }) === false
    );

    resetAll();
    offlineScoringState.enter(sessionA);
    var liveNet = { networkStatusKnown: true, networkConnected: true };
    var resolveFlush;
    var flushP = new Promise(function (resolve) {
      resolveFlush = resolve;
    });
    var recovering = offlineScoringRecovery.handleNetworkState(
      { networkConnected: true, networkStatusKnown: true },
      {
        network: liveNet,
        readNetwork: function () {
          return liveNet;
        },
        flush: function () {
          return flushP;
        },
        hasPending: function () {
          return false;
        },
        hasHeld: function () {
          return false;
        }
      }
    );
    assert('CASE35a 同步中先进入 SYNCING', offlineScoringState.get().mode === 'SYNCING');
    liveNet.networkConnected = false;
    resolveFlush({ ok: true, remain: 0 });
    return recovering;
  })
  .then(function (out) {
    assert(
      'CASE35 SYNCING 中掉线 + flush resolve → OFFLINE 不能 ONLINE',
      out.mode === 'OFFLINE' && out.session && out.session.contextId === 'game-A'
    );

    var courseSelect = fs.readFileSync(
      path.join(mini, 'subpackages', 'create', 'pages', 'course', 'select', 'index.js'),
      'utf8'
    );
    var stateSrc = fs.readFileSync(path.join(mini, 'utils', 'offlineScoringState.js'), 'utf8');
    assert(
      '不复用 course offlineModeConfirmed',
      stateSrc.indexOf('offlineModeConfirmed') < 0 &&
        courseSelect.indexOf('offlineScoringState') < 0
    );

    var appSrc = fs.readFileSync(path.join(mini, 'app.js'), 'utf8');
    assert(
      'App 恢复路径仍走 scoreSync.flush',
      appSrc.indexOf("require('./utils/teamClub/scoreSync.js').flush()") >= 0 &&
        appSrc.indexOf('offlineScoringRecovery.followFlush') >= 0
    );

    console.log('\n---- offlineScoringState.selftest ----');
    console.log('passed=' + passed + ' failed=' + failed);
    if (failed) process.exit(1);
  })
  .catch(function (err) {
    console.log('FAIL  async ' + (err && err.message ? err.message : err));
    process.exit(1);
  });
