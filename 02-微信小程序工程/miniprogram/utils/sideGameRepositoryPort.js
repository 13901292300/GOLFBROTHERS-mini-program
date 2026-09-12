/**
 * 主包 / 其它分包访问 SideGameRepository 的注入口。
 * 不含 storage key；由 game 分包 sideGameRepository 在加载时 bind。
 */
var impl = null;
var readyFns = [];

function logFirstPaint(payload) {
  try {
    console.log('[side-game-first-paint]', payload);
  } catch (eLog) {}
}

function bind(next) {
  if (!next) {
    impl = null;
    return;
  }
  if (typeof next.listVisible !== 'function') return;
  var wasBound = !!get();
  impl = next;
  logFirstPaint({ stage: 'port-bind' });
  if (!wasBound) notifyReady();
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

function isBound() {
  return !!get();
}

function notifyReady() {
  var i;
  var list = readyFns.slice();
  for (i = 0; i < list.length; i++) {
    try {
      list[i]();
    } catch (e1) {}
  }
}

function subscribeReady(fn) {
  if (typeof fn === 'function' && readyFns.indexOf(fn) < 0) {
    readyFns.push(fn);
  }
  return isBound();
}

function unsubscribeReady(fn) {
  if (typeof fn !== 'function') return;
  readyFns = readyFns.filter(function (item) {
    return item !== fn;
  });
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
  var bound = !!api;
  var listed;
  if (api && typeof api.listRankMarkView === 'function') listed = api.listRankMarkView(query);
  else listed = listByMatchId(query);
  var items =
    listed && listed.data && Array.isArray(listed.data.items) ? listed.data.items : [];
  logFirstPaint({
    stage: 'port-read',
    bound: bound,
    resultCount: items.length
  });
  return listed;
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
  isBound: isBound,
  subscribeReady: subscribeReady,
  unsubscribeReady: unsubscribeReady,
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
