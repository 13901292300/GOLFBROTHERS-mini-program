/**
 * 记分页红蓝三角投影：在 game 分包内跑沙盒
 * refreshActiveGames → settle.settleGame → rankTriColorForCell。
 * 只适配正式成绩下标，不另写推进规则。
 */
var settle = require('./settle.js');
var catalog = require('./catalog.js');
var rec = require('./sideGameRecord.js');
var visual = require('../../../utils/rankMarkVisual.js');
var temporaryCourse = require('../../../utils/temporaryCourse.js');

var STORAGE_KEY = 'gb_side_games_v1';

function asString(v) {
  return v == null ? '' : String(v);
}

function jsonClone(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

function loadRecords() {
  try {
    var raw = typeof wx !== 'undefined' && wx.getStorageSync ? wx.getStorageSync(STORAGE_KEY) : null;
    if (Array.isArray(raw)) return raw;
    if (typeof global !== 'undefined' && Array.isArray(global.__gb_side_games)) return global.__gb_side_games;
    return [];
  } catch (e) {
    return [];
  }
}

function saveRecords(list) {
  try {
    if (typeof global !== 'undefined') global.__gb_side_games = list;
  } catch (e) {}
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) wx.setStorageSync(STORAGE_KEY, list);
  } catch (e) {}
}

function recordsForScorePage(records, query) {
  var matchId = asString(query && query.matchId);
  var groupId = asString(query && query.groupId);
  if (!matchId) return [];
  return (records || []).filter(function (row) {
    if (!row || row.status === 'deleted') return false;
    if (asString(row.matchId) !== matchId) return false;
    if (asString(row.groupId) !== groupId) return false;
    return true;
  });
}

function recordToGame(row) {
  var inst = (row && row.config && row.config.instance) || {};
  var parties = Array.isArray(row && row.participantParties) ? row.participantParties : [];
  var players = inst.players;
  if (!players || !players.length) {
    players = parties.map(function (p) {
      return { id: p && p.partyId };
    });
  }
  return {
    catalogId: catalogIdOf(Object.assign({}, inst, { ruleId: row && row.ruleId, ruleSnapshot: row && row.ruleSnapshot })),
    ruleId: row && row.ruleId,
    ruleSnapshot: rec.mergeRuleSnapshot(
      rec.buildRuleSnapshot(catalogIdOf(Object.assign({}, inst, { ruleId: row && row.ruleId, ruleSnapshot: row && row.ruleSnapshot }))),
      rec.pickFirstUsableGameplay([
        inst.ruleSnapshot,
        row && row.ruleSnapshot,
        row && row.resultSnapshot && row.resultSnapshot.ruleSnapshot,
        inst
      ])
    ),
    players: players,
    parties: parties,
    playerOrder: inst.playerOrder,
    pairings: inst.pairings || [],
    multiplier: inst.multiplier || 1,
    pointPerHole: inst.pointPerHole != null ? inst.pointPerHole : inst.multiplier,
    segmentValues: inst.segmentValues || null,
    playerSegmentHandicaps: inst.playerSegmentHandicaps || null,
    groupMode: inst.groupMode,
    groupMembership: inst.groupMembership,
    splitHighExpertIds: inst.splitHighExpertIds,
    dizhuboMode: inst.dizhuboMode,
    formation: inst.formation,
    bandMode: inst.bandMode,
    bandLow: inst.bandLow,
    bandHigh: inst.bandHigh,
    bandMap: inst.bandMap,
    pairCoeffs: inst.pairCoeffs,
    holes: inst.holes,
    holeOrder: inst.holeOrder,
    fullHoleOrder: inst.fullHoleOrder,
    holeResults: (row && row.resultSnapshot) || inst.holeResults || null,
    status: row && row.status,
    scoreRows: inst.scoreRows || null,
    defaultScoreCode: inst.defaultScoreCode || ""
  };
}

function catalogIdOf(game) {
  return asString(
    (game && game.catalogId) ||
      (game && game.ruleId) ||
      (game && game.ruleSnapshot && game.ruleSnapshot.catalogId)
  );
}

function holeLabelsOfGame(game) {
  if (game && Array.isArray(game.fullHoleOrder) && game.fullHoleOrder.length) {
    return game.fullHoleOrder.map(asString).filter(Boolean);
  }
  var fromHoles = [];
  if (game && Array.isArray(game.holes) && game.holes.length) {
    game.holes.forEach(function (item) {
      var key = item && item.label != null ? item.label : item;
      if (key != null && String(key)) fromHoles.push(String(key));
    });
  }
  if (fromHoles.length) return fromHoles;
  if (game && game.holeOrder && game.holeOrder.length) return game.holeOrder.map(asString);
  return [];
}

function holeLabelAtIndex(game, holeIndex) {
  var i = Number(holeIndex);
  if (!isFinite(i) || i < 0 || i > 17) return '';
  var labels = holeLabelsOfGame(game);
  return asString(labels[i]) || '';
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
  var labels = holeLabelsOfGame(game);
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

function resolveOrderId(game, playerId) {
  var pid = asString(playerId);
  if (!pid) return '';
  var players = (game && game.players) || [];
  if (
    players.some(function (item) {
      return asString(item && item.id) === pid;
    })
  ) {
    return pid;
  }
  var parties = (game && game.parties) || [];
  var i;
  var mem;
  for (i = 0; i < parties.length; i++) {
    if (asString(parties[i] && parties[i].partyId) === pid) return pid;
    mem = (parties[i] && parties[i].memberPlayerIds) || [];
    if (
      mem.some(function (m) {
        return asString(m) === pid;
      })
    ) {
      return asString(parties[i].partyId);
    }
  }
  return '';
}

function colorForGameCell(game, label, playerId) {
  var id = catalogIdOf(game);
  if (!catalog.usesRankMark(id)) return '';
  var orderId = resolveOrderId(game, playerId);
  if (!orderId) return '';
  if (!holeOn(game, label)) return '';
  var order = gameOrderForHole(game, label);
  if (!order || !order.length) return '';
  var idx = order.indexOf(orderId);
  if (idx < 0) return '';
  if (catalog.isLasuoN(id)) return settle.lasuoNTriColor(game, order, orderId);
  if (catalog.isHorn(id)) return settle.hornTriColor(game, order, orderId);
  return catalog.rankTriColor(id, order.length, game.groupMode, idx, game.dizhuboMode);
}

function markForGameCell(game, label, playerId) {
  var id = catalogIdOf(game);
  if (!catalog.usesRankMark(id)) return visual.emptyMark();
  var orderId = resolveOrderId(game, playerId);
  if (!orderId) return visual.emptyMark();
  if (!holeOn(game, label)) return visual.emptyMark();
  var order = gameOrderForHole(game, label);
  if (!order || !order.length) return visual.emptyMark();
  var idx = order.indexOf(orderId);
  if (idx < 0) return visual.emptyMark();
  if (catalog.isLasuoN(id)) return visual.fromSandboxColor(settle.lasuoNTriColor(game, order, orderId));
  if (catalog.isHorn(id)) return visual.fromSandboxColor(settle.hornTriColor(game, order, orderId));
  if (visual.providesHoleRanks(id, game.groupMode, order.length)) {
    var rank = visual.isSplitHighGroupMode(game.groupMode)
      ? visual.splitHighDisplayRank(game, order, orderId)
      : idx + 1;
    if (rank >= 1 && rank <= 4) return visual.fromRank(rank);
  }
  return visual.fromSandboxColor(
    catalog.rankTriColor(id, order.length, game.groupMode, idx, game.dizhuboMode)
  );
}

function colorForGameCellAtIndex(game, holeIndex, playerId) {
  return colorForGameCell(game, holeLabelAtIndex(game, holeIndex), playerId);
}

function markForGameCellAtIndex(game, holeIndex, playerId) {
  return markForGameCell(game, holeLabelAtIndex(game, holeIndex), playerId);
}

function relScorecard(game, official) {
  if (official && official.relScores && typeof official.relScores === 'object') {
    return official.relScores;
  }
  var labels = holeLabelsOfGame(game);
  var out = {};
  var pars = (official && official.pars) || [];
  var players = (official && official.players) || [];
  labels.forEach(function (label, i) {
    var hole = {};
    var par = 4;
    if (Array.isArray(pars)) par = Number(pars[i]);
    else if (pars && pars[label] != null) par = Number(pars[label]);
    if (!temporaryCourse.isValidPar(par)) par = 4;
    players.forEach(function (p) {
      var pid = asString(p && (p.playerId || p.id));
      if (!pid) return;
      var scores = (p && p.scores) || [];
      var g = scores[i];
      if (g == null || g === '') return;
      var n = Number(g);
      if (!isFinite(n)) return;
      hole[pid] = n - par;
    });
    out[label] = hole;
  });
  return out;
}

function parsMap(game, official) {
  var labels = holeLabelsOfGame(game);
  var src = (official && official.pars) || [];
  var out = {};
  labels.forEach(function (label, i) {
    var n = Array.isArray(src) ? Number(src[i]) : Number(src && src[label]);
    out[label] = temporaryCourse.keepStandardPar(n);
  });
  return out;
}

function isEndedGame(game, row) {
  return asString((game && game.status) || (row && row.status)) === 'ended';
}

function refreshGameResults(row, official) {
  var game = recordToGame(row);
  if (isEndedGame(game, row)) return game;
  var prev = game.holeResults;
  var next = null;
  try {
    next = settle.settleGame(game, {
      scores: relScorecard(game, official),
      holeOrder: holeLabelsOfGame(game),
      pars: parsMap(game, official),
      windOn: !!(official && official.windOn)
    });
  } catch (e) {
    next = null;
  }
  if (next && (next.mulMissing || next.mulState === 'missing' || next.rewardMissing || next.rewardState === 'missing')) {
    game.holeResults = prev;
    return game;
  }
  if (next && next.byHole) {
    game.holeResults = next;
    row.resultSnapshot = jsonClone(next);
    row.resultRevision = (Number(row.resultRevision) || 0) + 1;
  } else {
    game.holeResults = prev;
  }
  return game;
}

function refreshActiveGames(query, official) {
  var all = loadRecords();
  var matched = recordsForScorePage(all, query);
  var games = [];
  matched.forEach(function (row) {
    games.push(refreshGameResults(row, official || {}));
  });
  saveRecords(all);
  return games;
}

function collectPlayerIds(games, official) {
  var seen = {};
  var out = [];
  function add(id) {
    var s = asString(id);
    if (!s || seen[s]) return;
    seen[s] = true;
    out.push(s);
  }
  (games || []).forEach(function (game) {
    ((game && game.players) || []).forEach(function (p) {
      add(p && p.id);
    });
    ((game && game.parties) || []).forEach(function (p) {
      add(p && p.partyId);
      ((p && p.memberPlayerIds) || []).forEach(add);
    });
  });
  ((official && official.players) || []).forEach(function (p) {
    add(p && (p.playerId || p.id));
  });
  return out;
}

function holeFullyScored(game, official, holeIndex) {
  var ids = ((game && game.players) || [])
    .map(function (p) {
      return asString(p && p.id);
    })
    .filter(Boolean);
  if (!ids.length) return false;
  var label = holeLabelAtIndex(game, holeIndex);
  var relHole = official && official.relScores && official.relScores[label];
  if (relHole && typeof relHole === 'object') {
    return ids.every(function (id) {
      var v = relHole[id];
      if (v == null || v === '') return false;
      return isFinite(Number(v));
    });
  }
  var byId = {};
  ((official && official.players) || []).forEach(function (p) {
    var id = asString(p && (p.playerId || p.id));
    if (id) byId[id] = p;
  });
  return ids.every(function (id) {
    var scores = (byId[id] && byId[id].scores) || [];
    var g = scores[holeIndex];
    if (g == null || g === '') return false;
    return isFinite(Number(g));
  });
}

function chainAllowByGame(games, official) {
  return (games || []).map(function (game) {
    var flags = [];
    var chain = true;
    var hi;
    for (hi = 0; hi < 18; hi++) {
      var label = holeLabelAtIndex(game, hi);
      if (!holeOn(game, label)) {
        flags[hi] = chain;
        continue;
      }
      flags[hi] = chain;
      if (!holeFullyScored(game, official, hi)) chain = false;
    }
    return flags;
  });
}

function project(input) {
  var query = {
    matchId: asString(input && input.matchId),
    groupId: asString(input && input.groupId)
  };
  var official = input || {};
  var games = refreshActiveGames(query, official);
  var pids = collectPlayerIds(games, official);
  var allow = chainAllowByGame(games, official);
  var projection = {};
  pids.forEach(function (pid) {
    var holes = {};
    var hi;
    for (hi = 0; hi < 18; hi++) {
      var mark = visual.emptyMark();
      var gi;
      for (gi = 0; gi < games.length; gi++) {
        if (!(allow[gi] && allow[gi][hi])) continue;
        mark = markForGameCellAtIndex(games[gi], hi, pid);
        if (mark && mark.triangleClass) break;
      }
      holes[String(hi)] = visual.normalizeMark(mark);
    }
    projection[pid] = holes;
  });
  return projection;
}

function markAt(projection, playerId, holeIndex) {
  var pid = asString(playerId);
  var map = projection && projection[pid];
  if (!map) return visual.emptyMark();
  if (Object.prototype.hasOwnProperty.call(map, holeIndex)) return visual.normalizeMark(map[holeIndex]);
  if (Object.prototype.hasOwnProperty.call(map, String(holeIndex))) {
    return visual.normalizeMark(map[String(holeIndex)]);
  }
  return visual.emptyMark();
}

function colorAt(projection, playerId, holeIndex) {
  return markAt(projection, playerId, holeIndex).triColor;
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  project: project,
  refreshActiveGames: refreshActiveGames,
  refreshGameResults: refreshGameResults,
  colorAt: colorAt,
  markAt: markAt,
  markForGameCellAtIndex: markForGameCellAtIndex,
  recordToGame: recordToGame,
  colorForGameCellAtIndex: colorForGameCellAtIndex
};
