/**
 * 分包加载：按 name 单飞 wx.loadSubpackage。
 * 不感知业务、toast、导航、网络、storage、cloud。
 */

var _inFlightByName = {};

function ensureLoaded(name) {
  var key = name == null ? '' : String(name).trim();
  if (!key) {
    return Promise.reject(new Error('missing-subpackage-name'));
  }
  if (_inFlightByName[key]) return _inFlightByName[key];

  var resolveFn;
  var rejectFn;
  var promise = new Promise(function (resolve, reject) {
    resolveFn = resolve;
    rejectFn = reject;
  });
  _inFlightByName[key] = promise;
  var clear = function () {
    if (_inFlightByName[key] === promise) delete _inFlightByName[key];
  };
  promise.then(clear, clear);

  if (typeof wx === 'undefined' || typeof wx.loadSubpackage !== 'function') {
    rejectFn(new Error('loadSubpackage-unavailable'));
    return promise;
  }
  wx.loadSubpackage({
    name: key,
    success: function () {
      resolveFn();
    },
    fail: function (err) {
      rejectFn(err || new Error('loadSubpackage-fail'));
    }
  });
  return promise;
}

function _resetInFlightForTest() {
  _inFlightByName = {};
}

function _inFlightCountForTest() {
  return Object.keys(_inFlightByName).length;
}

module.exports = {
  ensureLoaded: ensureLoaded,
  _resetInFlightForTest: _resetInFlightForTest,
  _inFlightCountForTest: _inFlightCountForTest
};
