/**
 * 正式 HostContext 内存桥。只缓存宿主传入的真实比赛上下文。
 * 不读写 storage，不含假人员、假成绩或游戏实例。
 */
var rec = require('./sideGameRecord.js');

var bag = {};

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
  bag[keyOf(q)] = rec.jsonClone(context);
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
