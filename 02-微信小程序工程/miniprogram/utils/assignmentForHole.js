/**
 * Canonical assignment for one hole.
 * Settled resultSnapshot.assignmentsByHole wins.
 * Else preview from canonical order. Never writes resultSnapshot.
 */
var visual = require('./rankMarkVisual.js');
var assign = require('./assignmentNormalize.js');

function asString(v) {
  return v == null ? '' : String(v);
}

function holeOn(game, label) {
  var holes = (game && game.holes) || [];
  if (!holes.length) return true;
  return holes.some(function (item) {
    var key = item && item.label != null ? item.label : item;
    return String(key) === String(label) && item && item.on !== false;
  });
}

function gameStartHole(game) {
  var labels =
    Array.isArray(game && game.fullHoleOrder) && game.fullHoleOrder.length
      ? game.fullHoleOrder
      : Array.isArray(game && game.holeOrder) && game.holeOrder.length
        ? game.holeOrder
        : ((game && game.holes) || []).map(function (item) {
            return item && item.label != null ? item.label : item;
          });
  var i;
  for (i = 0; i < labels.length; i++) {
    if (holeOn(game, labels[i])) return String(labels[i]);
  }
  return '';
}

function gameOrderForHole(game, label) {
  if (game && game.holeResults && game.holeResults.pendingStart) {
    var pending =
      game.holeResults.orderByHole && game.holeResults.orderByHole[label];
    return pending && pending.length ? pending.map(String) : null;
  }
  var frozen =
    game &&
    game.holeResults &&
    game.holeResults.orderByHole &&
    game.holeResults.orderByHole[label];
  if (frozen && frozen.length) return frozen.map(String);
  if (String(label) === gameStartHole(game)) {
    var order = ((game && game.playerOrder) || []).map(String).filter(Boolean);
    if (order.length) return order;
    return ((game && game.players) || [])
      .map(function (item) {
        return item && item.id != null ? String(item.id) : '';
      })
      .filter(Boolean);
  }
  return null;
}

function findPlayer(list, playerId) {
  var pid = asString(playerId);
  var i;
  for (i = 0; i < (list || []).length; i++) {
    if (asString(list[i] && list[i].playerId) === pid) return list[i];
  }
  return null;
}

function settledListForHole(game, label) {
  var list = visual.holeAssignments(game, label);
  if (!Array.isArray(list) || !list.length) return null;
  return list;
}

function previewListForHole(game, label) {
  var order = gameOrderForHole(game, label);
  if (!order || !order.length) return [];
  return assign.deriveAssignmentsFromOrder(game, order);
}

function assignmentsListForHole(game, label) {
  var settled = settledListForHole(game, label);
  if (settled) return { source: 'settled', list: settled };
  var preview = previewListForHole(game, label);
  if (preview && preview.length) return { source: 'preview', list: preview };
  return { source: 'none', list: [] };
}

function resolveAssignmentForHole(game, label, playerId) {
  var resolved = assignmentsListForHole(game, label);
  return {
    source: resolved.source,
    assignment: findPlayer(resolved.list, playerId)
  };
}

module.exports = {
  holeOn: holeOn,
  gameStartHole: gameStartHole,
  gameOrderForHole: gameOrderForHole,
  settledListForHole: settledListForHole,
  previewListForHole: previewListForHole,
  assignmentsListForHole: assignmentsListForHole,
  resolveAssignmentForHole: resolveAssignmentForHole
};
