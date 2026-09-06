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

function redactScalar(value) {
  if (typeof value !== 'string') return value;
  var s = value;
  if (/^inv_[0-9a-f]{8,}$/i.test(s)) return '[redacted]';
  s = s.replace(/inv_[0-9a-f]{12,}/gi, 'inv_****');
  s = s.replace(/([?&]token=)[^&\s]+/gi, '$1[redacted]');
  if (s.indexOf('oid_') === 0 && s.length > 12) return '[redacted]';
  return s;
}

function sanitize(value, depth) {
  var d = depth || 0;
  if (d > 4) return '[truncated]';
  if (value == null) return value;
  if (typeof value !== 'object') return redactScalar(value);
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
