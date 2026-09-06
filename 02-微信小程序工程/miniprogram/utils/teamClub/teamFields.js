'use strict';

var SHORT_MAX = 4;
var SHORT_ERROR = '简称最多4个字';

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
  sanitizeShortName: sanitizeShortName
};
