/**
 * 侧游戏配置：查看默认开放，编辑=创建者 / 全权管理 / 记分临管。
 */
var matchManageAccess = require('./matchManageAccess.js');
var tempAdminPermission = require('./tempAdminPermission.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function canEditSideGames(matchOrGame, userId) {
  var uid = asString(userId);
  var src = matchOrGame && typeof matchOrGame === 'object' ? matchOrGame : null;
  if (!src || !uid) return false;
  try {
    var access = matchManageAccess.resolveMatchManageAccess(src, uid);
    if (access && access.isPrivilegedUser) return true;
  } catch (e) {}
  try {
    if (tempAdminPermission.hasTempAdminPermission(src, uid, 'manage_scoring')) return true;
  } catch (e2) {}
  var creator = asString(src.createdBy || src.creatorId);
  if (creator && creator === uid) return true;
  if (!creator) return true;
  return false;
}

function resolvePageAccess(host, userId) {
  var h = host && typeof host === 'object' ? host : {};
  var uid = asString(userId || h.currentUserId);
  var canView = true;
  var canEdit;
  if (h.canEditSideGames === false) canEdit = false;
  else if (h.canEditSideGames === true) canEdit = true;
  else if (uid && (h.createdBy || h.creatorId || h.tempAdmins)) canEdit = canEditSideGames(h, uid);
  else canEdit = true;
  return {
    canView: canView,
    canEdit: canEdit,
    pageMode: canEdit ? 'edit' : 'readonly'
  };
}

module.exports = {
  canEditSideGames: canEditSideGames,
  resolvePageAccess: resolvePageAccess
};
