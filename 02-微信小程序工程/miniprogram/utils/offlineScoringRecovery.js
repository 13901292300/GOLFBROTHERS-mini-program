/**
 * 网络恢复后跟随现有 scoreSync.flush（single-flight），更新离线记分 session。
 * 不实现第二套上传。
 */

const offlineScoringState = require('./offlineScoringState.js');
const offlineScoringPrompt = require('./offlineScoringPrompt.js');

var _recovering = null;

function _scoreSync() {
  return require('./teamClub/scoreSync.js');
}

function _readNet(deps) {
  var d = deps && typeof deps === 'object' ? deps : {};
  if (typeof d.readNetwork === 'function') {
    return _normalizeNet(d.readNetwork());
  }
  if (d.network && typeof d.network === 'object') {
    return _normalizeNet(d.network);
  }
  try {
    var app = typeof getApp === 'function' ? getApp() : null;
    return require('./networkStatus.js').readFromGlobal(app && app.globalData);
  } catch (e) {
    return { networkStatusKnown: false, networkConnected: true, networkForegroundRefreshing: false };
  }
}

function _normalizeNet(raw) {
  var n = raw && typeof raw === 'object' ? raw : {};
  return {
    networkStatusKnown: n.networkStatusKnown === true,
    networkConnected: n.networkConnected !== false,
    networkForegroundRefreshing: n.networkForegroundRefreshing === true
  };
}

function _canRecover(net) {
  var n = _normalizeNet(net);
  return (
    n.networkStatusKnown === true &&
    n.networkConnected === true &&
    n.networkForegroundRefreshing !== true
  );
}

function hasBlockedLocal(contextId, deps) {
  var id = String(contextId || '').trim();
  var d = deps && typeof deps === 'object' ? deps : {};
  var hasPending = d.hasPending;
  var hasHeld = d.hasHeld;
  if (typeof hasPending !== 'function') {
    hasPending = function (cid) {
      return !!_scoreSync().hasPending(cid);
    };
  }
  if (typeof hasHeld !== 'function') {
    hasHeld = function (cid) {
      var rows = _scoreSync().readHeld() || [];
      return rows.some(function (row) {
        return row && String(row.matchId) === String(cid);
      });
    };
  }
  if (!id) return false;
  return !!(hasPending(id) || hasHeld(id));
}

function finishAfterFlush(result, deps) {
  var snap = offlineScoringState.get();
  var session = snap.session;
  if (!session) return snap;
  var net = _readNet(deps);
  if (!net.networkStatusKnown) return snap;
  if (net.networkForegroundRefreshing) return snap;
  if (!net.networkConnected) {
    return offlineScoringState.revertToOffline(session);
  }
  var blocked = hasBlockedLocal(session.contextId, deps);
  var threw = result && result._error;
  if (threw || blocked) {
    return offlineScoringState.markSyncFailed(
      { reason: threw ? 'flush_error' : blocked ? 'pending_or_held' : 'incomplete' },
      session
    );
  }
  return offlineScoringState.clearAfterSync(session);
}

function followFlush(promise, deps) {
  var snap = offlineScoringState.get();
  if (!snap.session) return Promise.resolve(snap);
  if (!_canRecover(_readNet(deps))) return Promise.resolve(snap);
  if (_recovering) return _recovering;
  if (snap.mode !== offlineScoringState.MODE_SYNCING) {
    snap = offlineScoringState.markSyncing(snap.session);
  }
  _recovering = Promise.resolve(promise)
    .then(
      function (res) {
        return finishAfterFlush(res, deps);
      },
      function () {
        return finishAfterFlush({ _error: true }, deps);
      }
    )
    .then(function (out) {
      _recovering = null;
      return out;
    });
  return _recovering;
}

function handleNetworkState(state, deps) {
  var net = _normalizeNet(state);
  if (net.networkStatusKnown) {
    offlineScoringPrompt.markNetworkConnected(net.networkConnected);
  }
  var snap = offlineScoringState.get();
  if (!snap.session) return Promise.resolve(snap);
  if (!net.networkStatusKnown) return Promise.resolve(snap);
  if (net.networkForegroundRefreshing) return Promise.resolve(snap);
  if (!net.networkConnected) {
    if (snap.mode === offlineScoringState.MODE_SYNCING) {
      return Promise.resolve(offlineScoringState.revertToOffline(snap.session));
    }
    return Promise.resolve(snap);
  }
  var d = _withNet(deps, net);
  var flushFn = d.flush;
  if (typeof flushFn !== 'function') {
    flushFn = function () {
      return _scoreSync().flush();
    };
  }
  if (snap.mode !== offlineScoringState.MODE_SYNCING) {
    offlineScoringState.markSyncing(snap.session);
  }
  return followFlush(flushFn(), d);
}

function _withNet(deps, fallbackNet) {
  var d = {};
  var src = deps && typeof deps === 'object' ? deps : {};
  var key;
  for (key in src) {
    if (Object.prototype.hasOwnProperty.call(src, key)) d[key] = src[key];
  }
  if (typeof d.readNetwork !== 'function' && !d.network) {
    d.network = fallbackNet;
  }
  return d;
}

function retryNow(deps) {
  var snap = offlineScoringState.get();
  if (!snap.session) return Promise.resolve(snap);
  var d = _withNet(deps, _readNet(deps));
  if (!_canRecover(_readNet(d))) return Promise.resolve(snap);
  var flushFn = d.flush;
  if (typeof flushFn !== 'function') {
    flushFn = function () {
      return _scoreSync().flush();
    };
  }
  offlineScoringState.markSyncing(snap.session);
  return followFlush(flushFn(), d);
}

function _resetForTest() {
  _recovering = null;
}

module.exports = {
  hasBlockedLocal: hasBlockedLocal,
  finishAfterFlush: finishAfterFlush,
  followFlush: followFlush,
  handleNetworkState: handleNetworkState,
  retryNow: retryNow,
  _resetForTest: _resetForTest
};
