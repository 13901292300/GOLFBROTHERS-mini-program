/**
 * 主包 / 其它分包访问 SideGameRepository 的注入口。
 * 不含 storage key；由 game 分包 sideGameRepository 在加载时 bind。
 */
var impl = null;

function bind(next) {
  if (next && typeof next.listVisible === 'function') impl = next;
}

function get() {
  if (impl) return impl;
  try {
    if (typeof getApp === 'function') {
      var app = getApp();
      if (app && app._sideGameRepository) return app._sideGameRepository;
    }
  } catch (e0) {}
  return impl;
}

function call(name, fallback) {
  var api = get();
  if (api && typeof api[name] === 'function') {
    return api[name].apply(api, Array.prototype.slice.call(arguments, 2));
  }
  return fallback;
}

function listByMatchId(query) {
  var api = get();
  if (api && typeof api.listByMatchId === 'function') return api.listByMatchId(query);
  if (api && typeof api.listVisible === 'function') {
    return api.listVisible(query || {});
  }
  return { ok: true, reason: '', data: { items: [] }, revision: 0 };
}

function listRankMarkView(query) {
  var api = get();
  if (api && typeof api.listRankMarkView === 'function') return api.listRankMarkView(query);
  return listByMatchId(query);
}

function inspectPlayerIdsRemap(matchId, idMap) {
  var api = get();
  if (api && typeof api.inspectPlayerIdsRemap === 'function') {
    return api.inspectPlayerIdsRemap(matchId, idMap);
  }
  return { ok: true, reason: '', data: { conflictSideGameIds: [] }, revision: 0 };
}

function remapPlayerIds(matchId, idMap, profiles) {
  var api = get();
  if (api && typeof api.remapPlayerIds === 'function') {
    return api.remapPlayerIds(matchId, idMap, profiles);
  }
  return { ok: false, reason: 'no_repository', data: { updatedSideGameIds: [] }, revision: 0 };
}

function removeGamesTouchingPlayer(matchId, playerId) {
  var api = get();
  if (api && typeof api.removeGamesTouchingPlayer === 'function') {
    return api.removeGamesTouchingPlayer(matchId, playerId);
  }
  return { ok: false, reason: 'no_repository', data: { removedSideGameIds: [] }, revision: 0 };
}

function updateHoleOrderForMatch(input) {
  var api = get();
  if (api && typeof api.updateHoleOrderForMatch === 'function') {
    return api.updateHoleOrderForMatch(input);
  }
  return { ok: false, reason: 'no_repository', data: null, revision: 0 };
}

function restoreExactRecords(records) {
  var api = get();
  if (api && typeof api.restoreExactRecords === 'function') {
    return api.restoreExactRecords(records);
  }
  return { ok: false, reason: 'no_repository' };
}

function getById(sideGameId) {
  var api = get();
  if (api && typeof api.getById === 'function') return api.getById(sideGameId);
  return { ok: false, reason: 'no_repository', data: null, revision: 0 };
}

function update(sideGameId, expectedRevision, patch) {
  var api = get();
  if (api && typeof api.update === 'function') return api.update(sideGameId, expectedRevision, patch);
  return { ok: false, reason: 'no_repository', data: null, revision: 0 };
}

module.exports = {
  bind: bind,
  get: get,
  listByMatchId: listByMatchId,
  listRankMarkView: listRankMarkView,
  inspectPlayerIdsRemap: inspectPlayerIdsRemap,
  remapPlayerIds: remapPlayerIds,
  removeGamesTouchingPlayer: removeGamesTouchingPlayer,
  updateHoleOrderForMatch: updateHoleOrderForMatch,
  restoreExactRecords: restoreExactRecords,
  getById: getById,
  update: update
};
