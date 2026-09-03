/**
 * SideGame 当前用户身份。页面不得写死 'me'。
 * 本机实现读取 gameStore 占位用户；可 setImplementation 替换。
 */
var gameStore = require('../../../utils/gameStore.js');
var rec = require('./sideGameRecord.js');

function localGetCurrentUserId() {
  try {
    var user = gameStore.getCurrentUser && gameStore.getCurrentUser();
    return rec.asString(user && user.userId) || 'me';
  } catch (e) {
    return 'me';
  }
}

var impl = {
  implementation: 'local-preview',
  getCurrentUserId: localGetCurrentUserId
};

function setImplementation(next) {
  if (!next || typeof next.getCurrentUserId !== 'function') {
    throw new Error('invalid_identity_provider');
  }
  impl = next;
}

function getImplementation() {
  return impl;
}

function getCurrentUserId() {
  return rec.asString(impl.getCurrentUserId());
}

module.exports = {
  getCurrentUserId: getCurrentUserId,
  setImplementation: setImplementation,
  getImplementation: getImplementation,
  localGetCurrentUserId: localGetCurrentUserId
};
