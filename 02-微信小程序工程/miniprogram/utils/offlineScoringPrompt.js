/**
 * 离线记分「是否建议进入」策略。不 showModal。
 */

const offlineScoringState = require('./offlineScoringState.js');

var _shownThisOutage = false;

function markNetworkConnected(connected) {
  if (connected) _shownThisOutage = false;
}

function markProposalShown() {
  _shownThisOutage = true;
}

function shouldProposeOffline(input) {
  var src = input && typeof input === 'object' ? input : {};
  if (!src.scoreVisible) return false;
  if (src.networkConnected !== false) return false;
  var ctx = src.context;
  if (!ctx || !String(ctx.contextId || '').trim()) return false;
  var existing = offlineScoringState.get().session;
  if (existing) return false;
  var mode = src.mode;
  if (mode == null) mode = offlineScoringState.get().mode;
  if (offlineScoringState.isActiveMode(mode)) return false;
  if (_shownThisOutage) return false;
  return true;
}

function _resetForTest() {
  _shownThisOutage = false;
}

module.exports = {
  shouldProposeOffline: shouldProposeOffline,
  markNetworkConnected: markNetworkConnected,
  markProposalShown: markProposalShown,
  _resetForTest: _resetForTest
};
