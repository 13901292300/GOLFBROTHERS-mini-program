'use strict';

var cryptoUtil = require('./cryptoUtil.js');

var ALLOWED = {
  jpg: 'jpg',
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp'
};

function normalizeExt(raw) {
  var e = String(raw || '')
    .toLowerCase()
    .replace(/^\./, '')
    .trim();
  return ALLOWED[e] || '';
}

function tmpPrefix(openidHash) {
  return 'team-club/' + String(openidHash || '') + '/tmp/';
}

function isOwnTmpFile(fileID, openidHash) {
  var s = String(fileID || '');
  if (s.indexOf('cloud://') !== 0) return false;
  var marker = '/' + tmpPrefix(openidHash);
  if (s.indexOf(marker) < 0 && s.indexOf(tmpPrefix(openidHash)) < 0) return false;
  if (s.indexOf('/logo/') >= 0) return false;
  return true;
}

function normalizeUploadId(raw) {
  var s = String(raw || '').replace(/[^a-zA-Z0-9]/g, '');
  if (s.length > 32) s = s.slice(0, 32);
  return s.length >= 8 ? s : '';
}

function envIdFromFileID(fileID) {
  var m = String(fileID || '').match(/^cloud:\/\/([a-zA-Z0-9-]+)/);
  return m ? m[1] : '';
}

function fileIdMatchesEnv(fileID, envId) {
  var got = envIdFromFileID(fileID);
  if (!got || !envId) return false;
  return got === String(envId);
}

function prepare(openid, payload) {
  var ext = normalizeExt(payload && payload.ext);
  if (!ext) {
    return { ok: false, code: 'invalid_file', message: '仅支持 jpg/png/webp' };
  }
  var uploadId = normalizeUploadId(payload && payload.uploadId);
  if (!uploadId) {
    return { ok: false, code: 'invalid_args', message: '缺少 uploadId' };
  }
  var kind = payload && payload.kind === 'avatar' ? 'avatar' : 'logo';
  var hash = cryptoUtil.hashOpenid(openid);
  return {
    ok: true,
    uploadId: uploadId,
    cloudPath: tmpPrefix(hash) + kind + '-' + uploadId + '.' + ext
  };
}

function filterOwnTmp(fileIDs, openid) {
  var hash = cryptoUtil.hashOpenid(openid);
  var safe = [];
  var skipped = 0;
  (Array.isArray(fileIDs) ? fileIDs : []).forEach(function (id) {
    if (isOwnTmpFile(id, hash)) safe.push(String(id));
    else skipped += 1;
  });
  return { safe: safe, skipped: skipped, hash: hash };
}

module.exports = {
  ALLOWED: ALLOWED,
  normalizeExt: normalizeExt,
  normalizeUploadId: normalizeUploadId,
  tmpPrefix: tmpPrefix,
  isOwnTmpFile: isOwnTmpFile,
  envIdFromFileID: envIdFromFileID,
  fileIdMatchesEnv: fileIdMatchesEnv,
  prepare: prepare,
  filterOwnTmp: filterOwnTmp
};
