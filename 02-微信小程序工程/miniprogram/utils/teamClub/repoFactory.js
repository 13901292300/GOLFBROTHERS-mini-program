'use strict';

/**
 * 仓储实现选择。
 * 默认 cloud。仅显式 development/test 使用 local。
 * 云失败不得回落到本地仓储。
 */

function getMode() {
  if (typeof global !== 'undefined' && global.__TEAM_CLUB_REPO_MODE) {
    var g = String(global.__TEAM_CLUB_REPO_MODE);
    if (g === 'local' || g === 'cloud') return g;
  }
  try {
    if (typeof process !== 'undefined' && process.env && process.env.TEAM_CLUB_REPO) {
      return process.env.TEAM_CLUB_REPO === 'local' ? 'local' : 'cloud';
    }
  } catch (e) {
    /* ignore */
  }
  try {
    var flags = require('./devFlags.js');
    if (flags && flags.USE_LOCAL_REPOSITORY === true) return 'local';
  } catch (e2) {
    /* ignore */
  }
  return 'cloud';
}

function get() {
  if (getMode() === 'local') {
    return require('./repository.js');
  }
  return require('./cloudRepository.js');
}

module.exports = {
  getMode: getMode,
  get: get
};
