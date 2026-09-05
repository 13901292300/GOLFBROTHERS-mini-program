'use strict';

var SENSITIVE = {
  token: true,
  inviteToken: true,
  openid: true,
  OPENID: true,
  unionid: true,
  UNIONID: true,
  phone: true,
  tokenHash: true,
  openidHash: true,
  rawToken: true
};

function sanitize(value, depth) {
  var d = depth || 0;
  if (d > 4) return '[truncated]';
  if (value == null) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(function (item) {
      return sanitize(item, d + 1);
    });
  }
  var out = {};
  Object.keys(value).forEach(function (key) {
    if (SENSITIVE[key]) {
      out[key] = '[redacted]';
      return;
    }
    var lower = String(key).toLowerCase();
    if (lower.indexOf('token') >= 0 || lower.indexOf('openid') >= 0 || lower === 'phone') {
      out[key] = '[redacted]';
      return;
    }
    out[key] = sanitize(value[key], d + 1);
  });
  return out;
}

function info(message, meta) {
  if (meta) {
    console.log('[teamClub]', String(message || ''), sanitize(meta));
  } else {
    console.log('[teamClub]', String(message || ''));
  }
}

function error(message, meta) {
  if (meta) {
    console.error('[teamClub]', String(message || ''), sanitize(meta));
  } else {
    console.error('[teamClub]', String(message || ''));
  }
}

module.exports = {
  sanitize: sanitize,
  info: info,
  error: error
};
