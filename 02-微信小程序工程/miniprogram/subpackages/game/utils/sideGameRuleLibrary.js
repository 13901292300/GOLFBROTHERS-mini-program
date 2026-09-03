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

function getById(id) {
  return current.getById(id);
}

function findByName(name) {
  return current.findByName(name);
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
  getById: getById,
  findByName: findByName,
  upsert: upsert,
  remove: remove
};
