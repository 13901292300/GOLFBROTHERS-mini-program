'use strict';

var profileFields = require('./profileFields.js');
var teamAssets = require('./teamAssets.js');

var SHORT_MAX = 4;
var SHORT_ERROR = '简称最多4个字';

function isSignedTempHttps(url) {
  var s = String(url || '');
  return /tcb\.qcloud\.la\//i.test(s) && /[?&]sign=/.test(s);
}

function persistStoredLogo(raw, envId) {
  var s = String(raw || '').trim();
  if (!s) return { ok: true, logo: '' };
  if (profileFields.isTempPath(s) || isSignedTempHttps(s) || !profileFields.isDurableAvatar(s)) {
    return { ok: false, code: 'invalid_logo', message: 'LOGO 未上传成功，不能使用临时路径' };
  }
  if (s.indexOf('cloud://') === 0) {
    var fileEnv = teamAssets.envIdFromFileID(s);
    var current = String(envId || '').trim();
    if (current && !teamAssets.fileIdMatchesEnv(s, current)) {
      return { ok: false, code: 'env_mismatch', message: '文件不属于当前云环境' };
    }
    if (!current && String(fileEnv).indexOf('cloud1-') === 0) {
      return { ok: false, code: 'env_mismatch', message: '文件不属于当前云环境' };
    }
  }
  return { ok: true, logo: s };
}

function visibleChars(raw) {
  return Array.from(String(raw || ''));
}

function visibleLength(raw) {
  return visibleChars(raw).length;
}

function sliceVisible(raw, max) {
  var n = Number(max);
  if (!n || n < 0) return '';
  return visibleChars(raw).slice(0, n).join('');
}

function sanitizeShortName(raw, options) {
  options = options || {};
  var s = String(raw || '').trim();
  if (!s && options.fallback) {
    s = sliceVisible(String(options.fallback).trim(), SHORT_MAX);
  }
  if (visibleLength(s) > SHORT_MAX) {
    return { ok: false, code: 'invalid_short_name', message: SHORT_ERROR };
  }
  return { ok: true, shortName: s };
}

module.exports = {
  SHORT_MAX: SHORT_MAX,
  SHORT_ERROR: SHORT_ERROR,
  visibleLength: visibleLength,
  sliceVisible: sliceVisible,
  sanitizeShortName: sanitizeShortName,
  persistStoredLogo: persistStoredLogo
};
