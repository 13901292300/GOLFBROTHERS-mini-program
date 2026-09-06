'use strict';

/**
 * 球队 LOGO：logo 为权威 fileID；logoSrc 仅为展示派生值。
 */

var fields = require('./profileFields.js');
var teamCloud = require('./teamCloud.js');
var mockAvatars = require('../mockAvatars.js');

var PLACEHOLDER = mockAvatars.DEFAULT_AVATAR;
var _tmpCache = {};

function maskFileID(fileID) {
  var s = String(fileID || '');
  if (!s) return '';
  if (s.indexOf('cloud://') === 0) {
    return teamCloud.envIdFromFileID(s)
      ? 'cloud://' + teamCloud.envIdFromFileID(s).slice(0, 12) + '****/' + s.split('/').slice(-1)[0]
      : 'cloud://****';
  }
  if (s.indexOf('https://') === 0) return 'https://****/' + s.split('/').slice(-1)[0];
  return '[redacted]';
}

function isHttpTemp(url) {
  var s = String(url || '');
  return /^https?:\/\/tmp\//i.test(s) || (/tcb\.qcloud\.la\//i.test(s) && /[?&]sign=/.test(s));
}

function persistLogo(raw) {
  var s = String(raw || '').trim();
  if (!s) return { ok: true, logo: '' };
  if (fields.isTempPath(s) || isHttpTemp(s) || !fields.isDurableAvatar(s)) {
    return { ok: false, code: 'invalid_logo', message: 'LOGO 未上传成功，不能使用临时路径' };
  }
  if (s.indexOf('cloud://') === 0) {
    var route = teamCloud.getRoute();
    var envId = route && route.ok ? String(route.envId || '') : '';
    var fileEnv = teamCloud.envIdFromFileID(s);
    if (envId && !teamCloud.fileIdMatchesEnv(s, envId)) {
      return { ok: false, code: 'env_mismatch', message: '文件不属于当前云环境' };
    }
    if ((!envId || String(envId).indexOf('golfbrothers-test') === 0) && String(fileEnv).indexOf('cloud1-') === 0) {
      return { ok: false, code: 'env_mismatch', message: '文件不属于当前云环境' };
    }
  }
  return { ok: true, logo: s };
}

function authorityLogo(raw) {
  var s = String(raw || '').trim();
  if (!s) return '';
  if (fields.isTempPath(s) || isHttpTemp(s)) return '';
  if (s.indexOf('https://') === 0) return s;
  if (s.indexOf('cloud://') !== 0) return '';
  var route = teamCloud.getRoute();
  if (route && route.ok && route.envId && !teamCloud.fileIdMatchesEnv(s, route.envId)) {
    return '';
  }
  if (route && route.ok === false && s.indexOf('cloud://cloud1-') === 0) {
    return '';
  }
  return s;
}

function logDiag(info) {
  var row = {
    stage: info && info.stage ? String(info.stage) : '',
    upload: maskFileID(info && info.upload),
    saved: maskFileID(info && info.saved),
    bound: (info && info.boundField) || 'logoSrc',
    authority: (info && info.authorityField) || 'logo',
    match: !!(info && info.upload && info.saved && String(info.upload) === String(info.saved)),
    env: (info && info.route && info.route.maskedEnvId) || '',
    envName: (info && info.route && info.route.envName) || ''
  };
  try {
    console.log('[teamClub:logo]', row);
  } catch (e) {
    /* ignore */
  }
  return row;
}

function displaySrc(logo) {
  var auth = authorityLogo(logo);
  if (!auth) {
    return Promise.resolve({ logo: '', logoSrc: PLACEHOLDER, placeholder: PLACEHOLDER });
  }
  if (auth.indexOf('https://') === 0) {
    return Promise.resolve({ logo: auth, logoSrc: auth, placeholder: PLACEHOLDER });
  }
  if (_tmpCache[auth] && _tmpCache[auth].exp > Date.now()) {
    return Promise.resolve({
      logo: auth,
      logoSrc: _tmpCache[auth].src,
      placeholder: PLACEHOLDER
    });
  }
  return teamCloud.getTempFileURL(auth).then(function (got) {
    var src = got && got.ok && got.src ? got.src : auth;
    if (got && got.ok && got.src && got.src.indexOf('http') === 0) {
      _tmpCache[auth] = { src: got.src, exp: Date.now() + 50 * 60 * 1000 };
    }
    return { logo: auth, logoSrc: src, placeholder: PLACEHOLDER };
  });
}

function attachDisplay(team) {
  if (!team) return Promise.resolve(null);
  return displaySrc(team.logo).then(function (d) {
    team.logo = d.logo;
    team.logoSrc = d.logoSrc;
    team.logoPlaceholder = d.placeholder;
    team.logoBroken = false;
    return team;
  });
}

function markBroken(team) {
  if (!team) return team;
  team.logoBroken = true;
  return team;
}

function bindSrc(view) {
  if (!view) return PLACEHOLDER;
  if (view.logoBroken) return view.logoPlaceholder || PLACEHOLDER;
  if (view.logoSrc) return view.logoSrc;
  return PLACEHOLDER;
}

function resetCache() {
  _tmpCache = {};
}

module.exports = {
  PLACEHOLDER: PLACEHOLDER,
  authorityLogo: authorityLogo,
  persistLogo: persistLogo,
  displaySrc: displaySrc,
  attachDisplay: attachDisplay,
  markBroken: markBroken,
  bindSrc: bindSrc,
  logDiag: logDiag,
  maskFileID: maskFileID,
  resetCache: resetCache
};
