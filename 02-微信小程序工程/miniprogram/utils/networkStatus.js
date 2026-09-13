/**
 * 轻量网络连通性：normalize + 内存订阅。不调 scoreSync / 页面 / storage / cloud。
 */

var DEFAULT_STATE = {
  networkConnected: true,
  networkType: 'unknown',
  networkStatusKnown: false
};

var _listeners = [];
var _epoch = 0;
var _inflight = null;

var SCORE_REFRESH_INTERVAL_MS = 5000;

function getEpoch() {
  return _epoch;
}

function bumpEpoch() {
  _epoch = (_epoch || 0) + 1;
  return _epoch;
}

function _sameSnap(a, b) {
  if (!a || !b) return false;
  return (
    a.networkConnected === b.networkConnected &&
    a.networkType === b.networkType &&
    a.networkStatusKnown === b.networkStatusKnown
  );
}

function _resolveGlobal(opts) {
  if (opts && opts.globalData) return opts.globalData;
  try {
    var app = typeof getApp === 'function' ? getApp() : null;
    return app && app.globalData;
  } catch (e) {
    return null;
  }
}

function _dispatchApply(opts, state) {
  if (opts && typeof opts.apply === 'function') {
    opts.apply(state);
    return;
  }
  try {
    var app = typeof getApp === 'function' ? getApp() : null;
    if (app && typeof app._applyNetworkState === 'function') {
      app._applyNetworkState(state);
      return;
    }
  } catch (eApp) {
    /* ignore */
  }
  applyToGlobalAndPublish(_resolveGlobal(opts), state);
}

function refresh(opts) {
  var options = opts && typeof opts === 'object' ? opts : {};
  if (_inflight) return _inflight;
  if (typeof wx === 'undefined' || typeof wx.getNetworkType !== 'function') {
    return Promise.resolve({ skipped: true, reason: 'no_wx' });
  }
  var probeEpoch = _epoch;
  function finish(resolve, out) {
    try {
      if (typeof options.onComplete === 'function') options.onComplete(out);
    } catch (eDone) {
      /* ignore */
    }
    resolve(out);
  }
  _inflight = new Promise(function (resolve) {
    try {
      wx.getNetworkType({
        success: function (res) {
          var out = { changed: false, failed: false, state: null };
          try {
            if (getEpoch() !== probeEpoch) {
              out.stale = true;
              finish(resolve, out);
              return;
            }
            var next = fromGetNetworkType(res);
            var gd = _resolveGlobal(options);
            var cur = readFromGlobal(gd);
            if (_sameSnap(cur, next)) {
              if (gd) gd.networkForegroundRefreshing = false;
              out.state = next;
              finish(resolve, out);
              return;
            }
            _dispatchApply(options, next);
            out.changed = true;
            out.state = next;
          } catch (eApply) {
            out.failed = true;
          }
          finish(resolve, out);
        },
        fail: function () {
          finish(resolve, { changed: false, failed: true, state: null });
        }
      });
    } catch (e) {
      finish(resolve, { changed: false, failed: true, state: null });
    }
  }).then(function (result) {
    _inflight = null;
    return result;
  });
  return _inflight;
}

function _typeOf(res) {
  var t = res && res.networkType != null ? String(res.networkType).toLowerCase().trim() : '';
  return t || 'unknown';
}

function fromGetNetworkType(res) {
  var networkType = _typeOf(res);
  if (networkType === 'none') {
    return { networkConnected: false, networkType: 'none', networkStatusKnown: true };
  }
  return { networkConnected: true, networkType: networkType, networkStatusKnown: true };
}

function fromStatusChange(res) {
  var networkType = _typeOf(res);
  if (res && res.isConnected === false) {
    return {
      networkConnected: false,
      networkType: networkType === 'unknown' ? 'none' : networkType,
      networkStatusKnown: true
    };
  }
  if (res && res.isConnected === true) {
    return {
      networkConnected: true,
      networkType: networkType === 'none' ? 'unknown' : networkType,
      networkStatusKnown: true
    };
  }
  return fromGetNetworkType(res);
}

function writeToGlobal(globalData, state) {
  if (!globalData) return;
  var next = state && typeof state === 'object' ? state : DEFAULT_STATE;
  globalData.networkConnected = next.networkConnected !== false;
  globalData.networkType = next.networkType || 'unknown';
  if (next.networkStatusKnown === true) {
    globalData.networkStatusKnown = true;
  }
}

function readFromGlobal(globalData) {
  if (!globalData) {
    return {
      networkConnected: true,
      networkType: 'unknown',
      networkStatusKnown: false,
      networkForegroundRefreshing: false
    };
  }
  return {
    networkConnected: globalData.networkConnected !== false,
    networkType: globalData.networkType || 'unknown',
    networkStatusKnown: globalData.networkStatusKnown === true,
    networkForegroundRefreshing: globalData.networkForegroundRefreshing === true
  };
}

function subscribe(fn) {
  if (typeof fn !== 'function') return;
  if (_listeners.indexOf(fn) >= 0) return;
  _listeners.push(fn);
}

function unsubscribe(fn) {
  _listeners = _listeners.filter(function (item) {
    return item !== fn;
  });
}

function publish(state) {
  var snapshot = _listeners.slice();
  var i;
  for (i = 0; i < snapshot.length; i++) {
    try {
      snapshot[i](state);
    } catch (e) {
      /* ignore subscriber errors */
    }
  }
}

function applyToGlobalAndPublish(globalData, state) {
  writeToGlobal(globalData, state);
  var snap = readFromGlobal(globalData);
  publish(snap);
  return snap;
}

function _resetListenersForTest() {
  _listeners = [];
  _resetProbeForTest();
}

function _resetProbeForTest() {
  _epoch = 0;
  _inflight = null;
}

module.exports = {
  DEFAULT_STATE: DEFAULT_STATE,
  SCORE_REFRESH_INTERVAL_MS: SCORE_REFRESH_INTERVAL_MS,
  fromGetNetworkType: fromGetNetworkType,
  fromStatusChange: fromStatusChange,
  writeToGlobal: writeToGlobal,
  readFromGlobal: readFromGlobal,
  subscribe: subscribe,
  unsubscribe: unsubscribe,
  publish: publish,
  applyToGlobalAndPublish: applyToGlobalAndPublish,
  refresh: refresh,
  getEpoch: getEpoch,
  bumpEpoch: bumpEpoch,
  _resetListenersForTest: _resetListenersForTest,
  _resetProbeForTest: _resetProbeForTest
};
