/**
 * SideGameRepository 正式门面。页面只依赖本文件。
 * 替换本机实现：setImplementation(cloudRepo)，无需改页面。
 */
var localMod = require('./localSideGameRepository.js');

var current = localMod.getDefault();

function bindPort() {
  try {
    var port = require('../../../utils/sideGameRepositoryPort.js');
    port.bind(module.exports);
    if (typeof getApp === 'function') {
      var app = getApp();
      if (app) app._sideGameRepository = module.exports;
    }
  } catch (eBind) {}
}

function setImplementation(next) {
  if (!next || typeof next.listVisible !== 'function' || typeof next.create !== 'function') {
    throw new Error('invalid_repository');
  }
  current = next;
  bindPort();
}

function getImplementation() {
  return current;
}

function hasImplementation() {
  return !!(current && typeof current.listVisible === 'function');
}

function listVisible(query) {
  return current.listVisible(query);
}

function getById(sideGameId) {
  return current.getById(sideGameId);
}

function create(input) {
  return current.create(input);
}

function update(sideGameId, expectedRevision, patch) {
  return current.update(sideGameId, expectedRevision, patch);
}

function remove(sideGameId, expectedRevision) {
  return current.remove(sideGameId, expectedRevision);
}

function refreshResult(sideGameId, hostContext) {
  return current.refreshResult(sideGameId, hostContext);
}

function remapPlayerId(matchId, fromId, toId, profile) {
  return current.remapPlayerId(matchId, fromId, toId, profile);
}

function inspectPlayerIdRemap(matchId, fromId, toId) {
  if (!current || typeof current.inspectPlayerIdRemap !== 'function') {
    return { ok: true, reason: '', data: { conflictSideGameIds: [] }, revision: 0 };
  }
  return current.inspectPlayerIdRemap(matchId, fromId, toId);
}

function inspectPlayerIdsRemap(matchId, idMap) {
  if (!current || typeof current.inspectPlayerIdsRemap !== 'function') {
    if (current && typeof current.inspectPlayerIdRemap === 'function') {
      var keys = Object.keys(idMap || {});
      if (keys.length === 1) {
        return current.inspectPlayerIdRemap(matchId, keys[0], idMap[keys[0]]);
      }
    }
    return { ok: true, reason: '', data: { conflictSideGameIds: [] }, revision: 0 };
  }
  return current.inspectPlayerIdsRemap(matchId, idMap);
}

function remapPlayerIds(matchId, idMap, profiles) {
  if (!current || typeof current.remapPlayerIds !== 'function') {
    return { ok: false, reason: 'unsupported', data: { updatedSideGameIds: [] }, revision: 0 };
  }
  return current.remapPlayerIds(matchId, idMap, profiles);
}

function removeGamesTouchingPlayer(matchId, playerId) {
  if (!current || typeof current.removeGamesTouchingPlayer !== 'function') {
    return { ok: false, reason: 'unsupported', data: { removedSideGameIds: [] }, revision: 0 };
  }
  return current.removeGamesTouchingPlayer(matchId, playerId);
}

function commitSetupDraft(input) {
  if (!current || typeof current.commitSetupDraft !== 'function') {
    return {
      ok: false,
      reason: 'unsupported',
      data: null,
      revision: 0
    };
  }
  return current.commitSetupDraft(input);
}

function listByMatchId(query) {
  if (!current || typeof current.listByMatchId !== 'function') {
    return { ok: true, reason: '', data: { items: [] }, revision: 0 };
  }
  return current.listByMatchId(query);
}

function listRankMarkView(query) {
  if (!current || typeof current.listRankMarkView !== 'function') {
    return listByMatchId(query);
  }
  return current.listRankMarkView(query);
}

function updateHoleOrderForMatch(input) {
  if (!current || typeof current.updateHoleOrderForMatch !== 'function') {
    return { ok: false, reason: 'unsupported', data: null, revision: 0 };
  }
  return current.updateHoleOrderForMatch(input);
}

function restoreExactRecords(records) {
  if (!current || typeof current.restoreExactRecords !== 'function') {
    return { ok: false, reason: 'unsupported' };
  }
  return current.restoreExactRecords(records);
}

function subscribe(query, callback) {
  return current.subscribe(query, callback);
}

function unsubscribe(handle) {
  return current.unsubscribe(handle);
}

module.exports = {
  setImplementation: setImplementation,
  getImplementation: getImplementation,
  hasImplementation: hasImplementation,
  listVisible: listVisible,
  getById: getById,
  create: create,
  update: update,
  remove: remove,
  refreshResult: refreshResult,
  remapPlayerId: remapPlayerId,
  remapPlayerIds: remapPlayerIds,
  inspectPlayerIdRemap: inspectPlayerIdRemap,
  inspectPlayerIdsRemap: inspectPlayerIdsRemap,
  removeGamesTouchingPlayer: removeGamesTouchingPlayer,
  commitSetupDraft: commitSetupDraft,
  listByMatchId: listByMatchId,
  listRankMarkView: listRankMarkView,
  updateHoleOrderForMatch: updateHoleOrderForMatch,
  restoreExactRecords: restoreExactRecords,
  subscribe: subscribe,
  unsubscribe: unsubscribe
};

bindPort();

