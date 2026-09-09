/**
 * 正式 HostContext 内存桥。只缓存宿主传入的真实比赛上下文。
 * 不读写 storage，不含假人员、假成绩或游戏实例。
 */
var rec = require('./sideGameRecord.js');
var derivedNotify = require('../../../utils/sideGameDerivedNotify.js');

var bag = {};

function hostPublicFp(ctx) {
  var c = ctx || {};
  var labels = Array.isArray(c.holeOrder) ? c.holeOrder.map(String) : [];
  var pars = c.pars && typeof c.pars === 'object' ? c.pars : {};
  var compact = {};
  labels.forEach(function (label) {
    var n = Number(pars[label]);
    compact[label] = n === 3 || n === 4 || n === 5 ? n : 4;
  });
  return JSON.stringify({ holeOrder: labels, pars: compact });
}

function asScope(scope) {
  return rec.asString(scope) === 'match' ? 'match' : 'group';
}

function queryOf(input) {
  var q = input && typeof input === 'object' ? input : {};
  var scope = asScope(q.scope);
  return {
    matchId: rec.asString(q.matchId),
    groupId: scope === 'group' ? rec.asString(q.groupId) : '',
    scope: scope
  };
}

function keyOf(query) {
  var q = queryOf(query);
  return q.matchId + '::' + q.scope + '::' + q.groupId;
}

function setHostContext(context) {
  if (!context || typeof context !== 'object') return false;
  var q = queryOf(context);
  if (!q.matchId) return false;
  var key = keyOf(q);
  var prev = bag[key];
  var next = rec.jsonClone(context);
  bag[key] = next;
  if (prev && hostPublicFp(prev) !== hostPublicFp(next)) {
    derivedNotify.notifyAllGamesReplay('host-structure');
  }
  return true;
}

function getHostContext(query) {
  var q = queryOf(query);
  if (!q.matchId) return null;
  var hit = bag[keyOf(q)];
  if (hit) return rec.jsonClone(hit);
  return null;
}

function clearHostContext(query) {
  if (query == null) {
    bag = {};
    return;
  }
  var q = queryOf(query);
  if (!q.matchId) return;
  delete bag[keyOf(q)];
}

function hasHostContext(query) {
  return !!getHostContext(query);
}

module.exports = {
  queryOf: queryOf,
  keyOf: keyOf,
  setHostContext: setHostContext,
  getHostContext: getHostContext,
  clearHostContext: clearHostContext,
  hasHostContext: hasHostContext
};
