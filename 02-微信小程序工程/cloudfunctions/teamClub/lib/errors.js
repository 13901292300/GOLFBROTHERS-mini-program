'use strict';

function fail(code, message, extra) {
  var err = { ok: false, code: code, message: message || code };
  if (extra && typeof extra === 'object') {
    Object.keys(extra).forEach(function (k) {
      err[k] = extra[k];
    });
  }
  return err;
}

function ok(data) {
  return { ok: true, data: data };
}

module.exports = {
  fail: fail,
  ok: ok
};
