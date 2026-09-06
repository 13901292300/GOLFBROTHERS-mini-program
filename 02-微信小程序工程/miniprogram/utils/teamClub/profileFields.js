'use strict';

var NICK_MIN = 1;
var NICK_MAX = 20;
var BLOCK = ['微信官方', '腾讯官方', '系统通知', 'administrator', 'admin'];

function isTempPath(url) {
  var s = String(url || '').trim();
  if (!s) return false;
  return (
    /^wxfile:\/\//i.test(s) ||
    /^file:\/\//i.test(s) ||
    /^http:\/\/tmp\//i.test(s) ||
    /^https:\/\/tmp\//i.test(s) ||
    s.indexOf('tmp/') === 0 ||
    /^http:\/\/127\.0\.0\.1/i.test(s) ||
    /^http:\/\/localhost/i.test(s)
  );
}

function isDurableAvatar(url) {
  var s = String(url || '').trim();
  if (!s || isTempPath(s)) return false;
  return /^cloud:\/\//i.test(s) || /^https:\/\//i.test(s);
}

function validateNickname(raw) {
  var name = String(raw || '').trim();
  if (!name) return { ok: false, code: 'invalid_nickname', message: '请填写昵称' };
  if (name.length < NICK_MIN || name.length > NICK_MAX) {
    return { ok: false, code: 'invalid_nickname', message: '昵称长度为 1–20 个字' };
  }
  if (/[\u0000-\u001f\u007f<>]/.test(name)) {
    return { ok: false, code: 'invalid_nickname', message: '昵称包含非法字符' };
  }
  var lower = name.toLowerCase();
  for (var i = 0; i < BLOCK.length; i++) {
    if (name.indexOf(BLOCK[i]) >= 0 || lower.indexOf(String(BLOCK[i]).toLowerCase()) >= 0) {
      return { ok: false, code: 'invalid_nickname', message: '昵称包含敏感内容' };
    }
  }
  return { ok: true, displayName: name };
}

function validateAvatar(raw, required) {
  var s = String(raw || '').trim();
  if (!s) {
    if (required) return { ok: false, code: 'invalid_avatar', message: '请设置头像' };
    return { ok: true, avatar: '' };
  }
  if (isTempPath(s) || !isDurableAvatar(s)) {
    return { ok: false, code: 'invalid_avatar', message: '头像未上传成功，不能使用临时路径' };
  }
  return { ok: true, avatar: s };
}

function validateProfileInput(input, opts) {
  opts = opts || {};
  var nick = validateNickname(input && input.displayName);
  if (!nick.ok) return nick;
  var av = validateAvatar(input && input.avatar, !!opts.requireAvatar);
  if (!av.ok) return av;
  return { ok: true, displayName: nick.displayName, avatar: av.avatar };
}

module.exports = {
  NICK_MAX: NICK_MAX,
  isTempPath: isTempPath,
  isDurableAvatar: isDurableAvatar,
  validateNickname: validateNickname,
  validateAvatar: validateAvatar,
  validateProfileInput: validateProfileInput
};
