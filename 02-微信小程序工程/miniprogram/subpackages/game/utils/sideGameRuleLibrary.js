/**
 * SideGame 规则库门面。页面只依赖本文件。
 */
var localMod = require('./localSideGameRuleLibrary.js');

var current = localMod.getDefault();

function setImplementation(next) {
  if (!next || typeof next.list !== 'function' || typeof next.upsert !== 'function') {
    throw new Error('invalid_rule_library');
  }
  current = next;
}

function getImplementation() {
  return current;
}

function list(maxPlayers) {
  return current.list(maxPlayers);
}

function listAll() {
  if (typeof current.listAll === 'function') return current.listAll();
  return current.list({ all: true });
}

function listCompatible(participantCount) {
  if (typeof current.listCompatible === 'function') return current.listCompatible(participantCount);
  return current.list(participantCount);
}

function getById(id) {
  return current.getById(id);
}

function findByName(name) {
  return current.findByName(name);
}

function findBySourceTemplateId(templateId) {
  if (typeof current.findBySourceTemplateId === 'function') {
    return current.findBySourceTemplateId(templateId);
  }
  return { ok: false, reason: 'not_found', data: null, revision: 0 };
}

function upsert(input) {
  return current.upsert(input);
}

function remove(id) {
  return current.remove(id);
}

module.exports = {
  setImplementation: setImplementation,
  getImplementation: getImplementation,
  list: list,
  listAll: listAll,
  listCompatible: listCompatible,
  getById: getById,
  findByName: findByName,
  findBySourceTemplateId: findBySourceTemplateId,
  upsert: upsert,
  remove: remove
};
