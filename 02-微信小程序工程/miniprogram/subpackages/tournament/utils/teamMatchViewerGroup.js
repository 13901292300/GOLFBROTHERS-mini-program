/**
 * 球队赛：当前用户所属正式小组（G1 个人 / G2–G4 全部真实成员）。
 * 不使用组合 ID、第一成员、姓名、头像、组名或列表下标代替身份。
 */

var playerManage = require('../../../utils/playerManage.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function addId(map, raw) {
  var id = asString(raw);
  if (id) map[id] = true;
}

function collectUnitIds(raw) {
  var map = Object.create(null);
  if (raw == null || raw === '') return map;
  if (typeof raw !== 'object') {
    addId(map, raw);
    return map;
  }
  addId(map, playerManage.resolveUserId(raw));
  addId(map, raw.userId);
  addId(map, raw.playerId);
  addId(map, raw.id);
  addId(map, raw.openId);
  addId(map, raw.openid);
  return map;
}

function buildViewerIdMap(viewerUserId) {
  var map = collectUnitIds(
    typeof viewerUserId === 'object' && viewerUserId
      ? viewerUserId
      : { userId: viewerUserId }
  );
  try {
    var alias = require('../../../utils/userIdentityAlias.js');
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var canon = alias.resolveCanonicalUserId(keys[i]);
      addId(map, canon);
    }
  } catch (e) {
    /* optional */
  }
  return map;
}

function idMapsOverlap(viewerMap, unit) {
  var ids = collectUnitIds(unit);
  var keys = Object.keys(ids);
  for (var i = 0; i < keys.length; i++) {
    if (viewerMap[keys[i]]) return true;
  }
  return false;
}

function groupPlayersContainViewer(group, viewerMap) {
  var players = group && Array.isArray(group.players) ? group.players : [];
  for (var i = 0; i < players.length; i++) {
    if (players[i] && idMapsOverlap(viewerMap, players[i])) return true;
  }
  return false;
}

function entityListContainViewer(list, viewerMap) {
  var ents = Array.isArray(list) ? list : [];
  for (var i = 0; i < ents.length; i++) {
    var ent = ents[i];
    if (!ent || typeof ent !== 'object') continue;
    if (idMapsOverlap(viewerMap, ent)) return true;
    var members = Array.isArray(ent.members) ? ent.members : [];
    for (var m = 0; m < members.length; m++) {
      if (idMapsOverlap(viewerMap, members[m])) return true;
    }
    var memberIds = Array.isArray(ent.memberUserIds) ? ent.memberUserIds : [];
    for (var u = 0; u < memberIds.length; u++) {
      if (idMapsOverlap(viewerMap, memberIds[u])) return true;
    }
  }
  return false;
}

function scoreEntitiesContainViewer(match, groupId, viewerMap) {
  var se = match && match.scoreEntities;
  if (!se || typeof se !== 'object' || Array.isArray(se)) return false;
  var gid = asString(groupId);
  return entityListContainViewer(se[gid], viewerMap);
}

/**
 * @returns {string} 稳定 groupId；未参赛（含未参赛管理员）返回 ''
 */
function resolveViewerGroupId(match, viewerUserId) {
  var viewerMap = buildViewerIdMap(viewerUserId);
  if (!Object.keys(viewerMap).length) return '';
  if (!match || !Array.isArray(match.groups)) return '';
  for (var i = 0; i < match.groups.length; i++) {
    var g = match.groups[i];
    if (!g) continue;
    if (groupPlayersContainViewer(g, viewerMap)) {
      return g.groupId != null ? String(g.groupId) : '';
    }
    if (scoreEntitiesContainViewer(match, g.groupId, viewerMap)) {
      return g.groupId != null ? String(g.groupId) : '';
    }
  }
  return '';
}

function hasFormalGroups(match) {
  var groups = match && Array.isArray(match.groups) ? match.groups : [];
  for (var i = 0; i < groups.length; i++) {
    var players = (groups[i] && groups[i].players) || [];
    for (var j = 0; j < players.length; j++) {
      if (players[j] && playerManage.resolveUserId(players[j])) return true;
    }
  }
  return false;
}

module.exports = {
  MISSING_GROUP_TOAST: '当前未加入任何小组',
  resolveViewerGroupId: resolveViewerGroupId,
  hasFormalGroups: hasFormalGroups,
  collectUnitIds: collectUnitIds
};
