/**
 * 轻量网络连通性：normalize + 内存订阅。不调 scoreSync / 页面 / storage / cloud。
 */

var DEFAULT_STATE = {
  networkConnected: true,
  networkType: 'unknown'
};

var _listeners = [];

function _typeOf(res) {
  var t = res && res.networkType != null ? String(res.networkType).toLowerCase().trim() : '';
  return t || 'unknown';
}

function fromGetNetworkType(res) {
  var networkType = _typeOf(res);
  if (networkType === 'none') {
    return { networkConnected: false, networkType: 'none' };
  }
  return { networkConnected: true, networkType: networkType };
}

function fromStatusChange(res) {
  var networkType = _typeOf(res);
  if (res && res.isConnected === false) {
    return { networkConnected: false, networkType: networkType === 'unknown' ? 'none' : networkType };
  }
  if (res && res.isConnected === true) {
    return { networkConnected: true, networkType: networkType === 'none' ? 'unknown' : networkType };
  }
  return fromGetNetworkType(res);
}

function writeToGlobal(globalData, state) {
  if (!globalData) return;
  var next = state && typeof state === 'object' ? state : DEFAULT_STATE;
  globalData.networkConnected = next.networkConnected !== false;
  globalData.networkType = next.networkType || 'unknown';
}

function readFromGlobal(globalData) {
  if (!globalData) {
    return { networkConnected: true, networkType: 'unknown' };
  }
  return {
    networkConnected: globalData.networkConnected !== false,
    networkType: globalData.networkType || 'unknown'
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
  publish(readFromGlobal(globalData));
  return readFromGlobal(globalData);
}

function _resetListenersForTest() {
  _listeners = [];
}

module.exports = {
  DEFAULT_STATE: DEFAULT_STATE,
  fromGetNetworkType: fromGetNetworkType,
  fromStatusChange: fromStatusChange,
  writeToGlobal: writeToGlobal,
  readFromGlobal: readFromGlobal,
  subscribe: subscribe,
  unsubscribe: unsubscribe,
  publish: publish,
  applyToGlobalAndPublish: applyToGlobalAndPublish,
  _resetListenersForTest: _resetListenersForTest
};
