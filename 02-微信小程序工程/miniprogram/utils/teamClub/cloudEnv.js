'use strict';

/**
 * 球队域唯一云环境配置。页面与其它云函数不得引用这里的测试环境 ID。
 * 正式版在 TEAM_CLUB_RELEASE_DEPLOYED=false 时不得连接测试环境。
 */

var TEST = {
  envId: 'golfbrothers-test-d1db3k1e6dcc39',
  name: 'golfbrothers-test'
};

var RELEASE = {
  envId: 'cloud1-d5gluh1ode0ef8738',
  name: 'cloud1'
};

/** 正式环境尚未上传 teamClub 前必须为 false */
var TEAM_CLUB_RELEASE_DEPLOYED = false;

var _accountReader = null;
var _releaseOverride = null;

function maskEnvId(envId) {
  var s = String(envId || '').trim();
  if (!s) return '';
  if (s.length < 16) return s.slice(0, 4) + '****';
  return s.slice(0, 12) + '****' + s.slice(-6);
}

function readEnvVersion() {
  if (typeof _accountReader === 'function') {
    try {
      return String(_accountReader() || '').trim();
    } catch (e) {
      return '';
    }
  }
  try {
    if (typeof wx === 'undefined' || typeof wx.getAccountInfoSync !== 'function') return '';
    var info = wx.getAccountInfoSync();
    var v = info && info.miniProgram && info.miniProgram.envVersion;
    return v != null ? String(v).trim() : '';
  } catch (err) {
    return '';
  }
}

function releaseDeployed() {
  if (_releaseOverride === true || _releaseOverride === false) return _releaseOverride;
  return TEAM_CLUB_RELEASE_DEPLOYED === true;
}

function resolveTeamClubCloud() {
  var envVersion = readEnvVersion();
  if (!envVersion) {
    return {
      ok: false,
      code: 'env_unknown',
      message: '无法确认小程序版本环境，已拒绝调用'
    };
  }
  if (envVersion === 'develop' || envVersion === 'trial') {
    return {
      ok: true,
      envVersion: envVersion,
      envId: TEST.envId,
      envName: TEST.name,
      maskedEnvId: maskEnvId(TEST.envId)
    };
  }
  if (envVersion === 'release') {
    if (!releaseDeployed()) {
      return {
        ok: false,
        code: 'not_open',
        message: '服务暂未开放',
        envVersion: 'release'
      };
    }
    return {
      ok: true,
      envVersion: 'release',
      envId: RELEASE.envId,
      envName: RELEASE.name,
      maskedEnvId: maskEnvId(RELEASE.envId)
    };
  }
  return {
    ok: false,
    code: 'env_unknown',
    message: '无法确认小程序版本环境，已拒绝调用',
    envVersion: envVersion
  };
}

function logRoute(action, route) {
  var meta = {
    action: String(action || ''),
    envVersion: route && route.envVersion ? route.envVersion : '',
    envName: route && route.envName ? route.envName : '',
    env: route && route.maskedEnvId ? route.maskedEnvId : '',
    code: route && route.code ? route.code : ''
  };
  try {
    console.log('[teamClub:env]', meta);
  } catch (e) {
    /* ignore */
  }
}

/** 仅测试注入 */
function setTestAccountReader(fn) {
  _accountReader = typeof fn === 'function' ? fn : null;
}

/** 仅测试注入 */
function setTestReleaseDeployed(flag) {
  if (flag === true || flag === false) _releaseOverride = flag;
  else _releaseOverride = null;
}

function resetTestHooks() {
  _accountReader = null;
  _releaseOverride = null;
}

module.exports = {
  TEST: TEST,
  RELEASE: RELEASE,
  TEAM_CLUB_RELEASE_DEPLOYED: TEAM_CLUB_RELEASE_DEPLOYED,
  FUNCTION_NAME: 'teamClub',
  maskEnvId: maskEnvId,
  readEnvVersion: readEnvVersion,
  resolveTeamClubCloud: resolveTeamClubCloud,
  logRoute: logRoute,
  setTestAccountReader: setTestAccountReader,
  setTestReleaseDeployed: setTestReleaseDeployed,
  resetTestHooks: resetTestHooks
};
