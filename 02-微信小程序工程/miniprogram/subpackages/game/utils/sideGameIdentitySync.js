/**
 * GAME 人员调整：身份更正 / 纯删除 与 side-game 实例同步。
 * 完整 ID 映射一次提交，不对中间迁移态做占用校验。
 * 不改结算公式，不改变实例 scope/groupId。
 */
var rec = require('./sideGameRecord.js');
var repository = require('./sideGameRepository.js');

function asId(v) {
  return rec.asString(v);
}

function buildRemapTable(replaced) {
  var map = {};
  (Array.isArray(replaced) ? replaced : []).forEach(function (ch) {
    var fromId = asId(ch && ch.fromPlayerId);
    var toId = asId(ch && ch.toPlayerId);
    if (fromId && toId && fromId !== toId) map[fromId] = toId;
  });
  return map;
}

function profileOfReplace(change) {
  var to = (change && change.to) || {};
  var name = rec.asString(to.name);
  return {
    displayName: name,
    name: name,
    avatar: to.avatar != null ? to.avatar : ''
  };
}

function inspectGroupManageDiff(matchId, diff) {
  var mid = asId(matchId);
  if (!mid) return { ok: false, reason: 'invalid_args', message: '缺少比赛' };
  var idMap = buildRemapTable((diff && diff.replaced) || []);
  if (!Object.keys(idMap).length) return { ok: true, reason: '' };
  var inspected = repository.inspectPlayerIdsRemap(mid, idMap);
  if (!inspected.ok) {
    return {
      ok: false,
      reason: inspected.reason || 'identity_conflict',
      message: '目标球员已在本场比赛中',
      conflictSideGameIds: (inspected.data && inspected.data.conflictSideGameIds) || []
    };
  }
  return { ok: true, reason: '' };
}

function applyGroupManageDiff(matchId, diff, opts) {
  opts = opts || {};
  var mid = asId(matchId);
  if (!mid) return { ok: false, reason: 'invalid_args', updatedSideGameIds: [], removedSideGameIds: [] };
  var inspected = inspectGroupManageDiff(mid, diff);
  if (!inspected.ok) {
    return {
      ok: false,
      reason: inspected.reason,
      updatedSideGameIds: [],
      removedSideGameIds: [],
      conflictSideGameIds: inspected.conflictSideGameIds || []
    };
  }
  var updated = [];
  var removed = [];
  var idMap = buildRemapTable((diff && diff.replaced) || []);
  var profiles = Object.assign({}, opts.profiles || {});
  ((diff && diff.replaced) || []).forEach(function (ch) {
    var toId = asId(ch && ch.toPlayerId);
    if (!toId) return;
    if (!profiles[toId]) profiles[toId] = profileOfReplace(ch);
  });
  if (Object.keys(idMap).length) {
    var out = repository.remapPlayerIds(mid, idMap, profiles);
    if (!out.ok) {
      return {
        ok: false,
        reason: out.reason,
        updatedSideGameIds: [],
        removedSideGameIds: []
      };
    }
    (out.data && out.data.updatedSideGameIds ? out.data.updatedSideGameIds : []).forEach(function (id) {
      if (updated.indexOf(id) < 0) updated.push(id);
    });
  }
  var stillPresent = opts.stillPresentIds || {};
  var dropped = (diff && diff.removed) || [];
  var i;
  for (i = 0; i < dropped.length; i++) {
    var pid = asId(dropped[i].fromPlayerId);
    if (!pid || stillPresent[pid]) continue;
    var del = repository.removeGamesTouchingPlayer(mid, pid);
    if (!del.ok) {
      return {
        ok: false,
        reason: del.reason,
        updatedSideGameIds: updated,
        removedSideGameIds: removed
      };
    }
    (del.data && del.data.removedSideGameIds ? del.data.removedSideGameIds : []).forEach(function (id) {
      if (removed.indexOf(id) < 0) removed.push(id);
    });
  }
  return {
    ok: true,
    reason: '',
    updatedSideGameIds: updated,
    removedSideGameIds: removed
  };
}

module.exports = {
  inspectGroupManageDiff: inspectGroupManageDiff,
  applyGroupManageDiff: applyGroupManageDiff,
  buildRemapTable: buildRemapTable
};
