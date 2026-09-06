'use strict';

/**
 * 球队相关页面路径。分享与跳转只引用这里的常量，禁止业务代码手写第二套 path。
 *
 * 邀请落地：主包 `pages/team-invite/index` 是分享冷启动入口；
 * 分包 `subpackages/player` + `pages/me/team-invite/index` 才是 UI 页。
 * 微信分享 path 上限 1024 字符。
 */
var TEAM_INVITE_PAGE = '/pages/team-invite/index';
var TEAM_INVITE_RUNTIME_PAGE = '/subpackages/player/pages/me/team-invite/index';
var WECHAT_SHARE_PATH_MAX = 1024;

function appendQuery(pathname, query) {
  var path = String(pathname || '');
  var q = query && typeof query === 'object' ? query : {};
  var parts = [];
  Object.keys(q).forEach(function (key) {
    var v = q[key];
    if (v === undefined || v === null || String(v).trim() === '') return;
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v).trim()));
  });
  return parts.length ? path + '?' + parts.join('&') : path;
}

function buildInviteSharePath(token) {
  var t = String(token || '').trim();
  if (!t) return '';
  return appendQuery(TEAM_INVITE_PAGE, { token: t });
}

function buildInviteRuntimeUrl(query) {
  return appendQuery(TEAM_INVITE_RUNTIME_PAGE, query);
}

function listRegisteredPagePaths(appJson) {
  var app = appJson && typeof appJson === 'object' ? appJson : {};
  var paths = [];
  (app.pages || []).forEach(function (p) {
    if (p) paths.push('/' + String(p).replace(/^\/+/, ''));
  });
  (app.subPackages || app.subpackages || []).forEach(function (sub) {
    if (!sub || !sub.root) return;
    var root = String(sub.root).replace(/^\/+|\/+$/g, '');
    (sub.pages || []).forEach(function (p) {
      if (!p) return;
      paths.push('/' + root + '/' + String(p).replace(/^\/+/, ''));
    });
  });
  return paths;
}

module.exports = {
  TEAM_INVITE_PAGE: TEAM_INVITE_PAGE,
  TEAM_INVITE_RUNTIME_PAGE: TEAM_INVITE_RUNTIME_PAGE,
  WECHAT_SHARE_PATH_MAX: WECHAT_SHARE_PATH_MAX,
  appendQuery: appendQuery,
  buildInviteSharePath: buildInviteSharePath,
  buildInviteRuntimeUrl: buildInviteRuntimeUrl,
  listRegisteredPagePaths: listRegisteredPagePaths
};
