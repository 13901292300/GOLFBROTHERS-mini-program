/**
 * 记分页红蓝三角：主包只做存储探测与投影着色，不跑 settle。
 */
var visual = require('./rankMarkVisual.js');
var STORAGE_KEY = 'gb_side_games_v1';

var TRI_BLUE = '#007AFF';
var TRI_RED = '#FF3B30';
var TRI_GOLD = '#ce9224';

function asString(v) {
  return v == null ? '' : String(v);
}

function toId(v) {
  return v == null ? '' : String(v);
}

function num(v, fallback) {
  var n = Number(v);
  return isNaN(n) ? fallback : n;
}

function isLandlordBig(id) {
  return asString(id) === 'landlord-big';
}
function isLandlordMid(id) {
  return asString(id) === 'landlord-mid';
}
function isLandlordSmall(id) {
  return asString(id) === 'landlord-small';
}
function isLandlordFamily(id) {
  return isLandlordBig(id) || isLandlordMid(id) || isLandlordSmall(id);
}
function is8421Three(id) {
  return asString(id) === '8421-3';
}
function is8421Four(id) {
  return asString(id) === '8421-4';
}
function isLasuo4(id) {
  return asString(id) === 'lasuo-4';
}
function isVegas(id) {
  return asString(id) === 'vegas';
}
function isThreeVsOne(id) {
  return asString(id) === 'three-vs-one';
}
function isDizhubo4(id) {
  return asString(id) === 'dizhubo-4';
}
function isLasuoN(id) {
  return asString(id) === 'lasuo-n';
}
function isHorn(id) {
  return asString(id) === 'horn';
}

function usesRankMark(id) {
  return (
    isLandlordFamily(id) ||
    is8421Three(id) ||
    is8421Four(id) ||
    isLasuo4(id) ||
    isVegas(id) ||
    isThreeVsOne(id) ||
    isDizhubo4(id) ||
    isLasuoN(id) ||
    isHorn(id)
  );
}

function rankComboKind(id) {
  if (isLandlordMid(id) || is8421Three(id)) return 'mid';
  if (isLandlordSmall(id)) return 'small';
  if (isLandlordBig(id)) return 'big';
  return '';
}

function rankTriColor(catalogId, n, groupMode, i, dizhuboMode) {
  if (isThreeVsOne(catalogId)) return i === 0 ? TRI_BLUE : TRI_RED;
  if (isDizhubo4(catalogId)) {
    if (dizhuboMode === 'mid') return i === 0 || i === 2 ? TRI_BLUE : TRI_RED;
    return i === 0 || i === 3 ? TRI_BLUE : TRI_RED;
  }
  var isFixed = groupMode === 'fixed';
  var kind = rankComboKind(catalogId);
  if (n === 3) {
    if (kind === 'mid') return i === 1 ? TRI_RED : TRI_BLUE;
    if (kind === 'small') return i === 2 ? TRI_RED : TRI_BLUE;
    return i === 0 ? TRI_BLUE : TRI_RED;
  }
  if (n >= 4) {
    if (isFixed) return i < 2 ? TRI_BLUE : TRI_RED;
    return i === 0 || i === 3 ? TRI_BLUE : TRI_RED;
  }
  return i === 0 ? TRI_BLUE : TRI_RED;
}

function evenizeIds(ids) {
  var list = (ids || []).map(toId).filter(Boolean);
  if (list.length % 2 === 1) {
    return { active: list.slice(0, -1), bye: list[list.length - 1] };
  }
  return { active: list, bye: '' };
}

function teamByIndex(i, n, formation) {
  var form = formation === 'haidao' ? 'haidao' : 'jianghu';
  if (form === 'haidao') {
    if (i < 4) return i === 0 || i === 3 ? 'A' : 'B';
    return i % 2 === 0 ? 'A' : 'B';
  }
  var start = Math.floor(i / 4) * 4;
  var rest = n - start;
  var local = i - start;
  if (rest >= 4) {
    var odd = Math.floor(start / 4) % 2 === 0;
    if (odd) return local === 0 || local === 3 ? 'A' : 'B';
    return local === 1 || local === 2 ? 'A' : 'B';
  }
  if (start === 0) return local === 0 ? 'A' : 'B';
  return local === 1 ? 'A' : 'B';
}

function formTeamLists(ids, formation) {
  var list = (ids || []).map(toId).filter(Boolean);
  var A = [];
  var B = [];
  var i;
  for (i = 0; i < list.length; i++) {
    if (teamByIndex(i, list.length, formation) === 'A') A.push(list[i]);
    else B.push(list[i]);
  }
  return { A: A, B: B };
}

function coeffAt(coeffs, i) {
  var row = (coeffs || [])[i];
  if (!row) return 1;
  var v = Number(row.value);
  return isNaN(v) ? 1 : v;
}

function bandOf(bandMap, id) {
  return String((bandMap && bandMap[id]) || 'low') === 'high' ? 'high' : 'low';
}

function lasuoMatchup(order, game) {
  var formation = game && game.formation === 'haidao' ? 'haidao' : 'jianghu';
  var coeffs = (game && game.pairCoeffs) || [];
  var A = [];
  var B = [];
  if (game && game.bandMode === 'split-high') {
    var L = Math.max(0, num(game.bandLow, 0));
    var H = Math.max(0, num(game.bandHigh, 0));
    var bandMap = (game && game.bandMap) || {};
    var hasMap = Object.keys(bandMap).length > 0;
    var lowIds;
    var highIds;
    if (hasMap) {
      lowIds = order.filter(function (id) {
        return bandOf(bandMap, id) === 'low';
      });
      highIds = order.filter(function (id) {
        return bandOf(bandMap, id) === 'high';
      });
    } else {
      lowIds = order.slice(0, L);
      highIds = order.slice(L, L + H);
    }
    var lowTake = evenizeIds(lowIds.slice(0, L || lowIds.length));
    var highTake = evenizeIds(highIds.slice(0, H || highIds.length));
    var lowTeams = formTeamLists(lowTake.active, formation);
    var highTeams = formTeamLists(highTake.active, formation);
    A = lowTeams.A.concat(highTeams.B);
    B = lowTeams.B.concat(highTeams.A);
  } else {
    var ev = evenizeIds(order);
    var lists = formTeamLists(ev.active, formation);
    A = lists.A;
    B = lists.B;
  }
  var used = {};
  A.forEach(function (id) {
    used[id] = 'A';
  });
  B.forEach(function (id) {
    used[id] = 'B';
  });
  order.forEach(function (id) {
    if (!used[id]) used[id] = 'bye';
  });
  return { A: A, B: B, side: used };
}

function hornLayout(order, game) {
  var ids = (order || []).map(toId).filter(Boolean);
  var ev = evenizeIds(ids);
  var active = ev.active;
  var m = active.length;
  var flowerPos = m > 0 ? (m + 1) / 2 : 0;
  var flower = flowerPos > 0 ? active[flowerPos - 1] : '';
  var rest = active.filter(function (_id, i) {
    return i + 1 !== flowerPos;
  });
  var lasuoM = lasuoMatchup(rest, Object.assign({}, game || {}, { bandMode: 'all' }));
  var side = {};
  if (ev.bye) side[ev.bye] = 'bye';
  if (flower) side[flower] = 'flower';
  lasuoM.A.forEach(function (id) {
    side[id] = 'A';
  });
  lasuoM.B.forEach(function (id) {
    side[id] = 'B';
  });
  return { side: side };
}

function lasuoNTriColor(game, order, playerId) {
  var m = lasuoMatchup((order || []).map(toId), game || {});
  var side = m.side[toId(playerId)];
  if (side === 'A') return TRI_BLUE;
  if (side === 'B') return TRI_RED;
  return '';
}

function hornTriColor(game, order, playerId) {
  var m = hornLayout((order || []).map(toId), game || {});
  var side = m.side[toId(playerId)];
  if (side === 'flower') return TRI_GOLD;
  if (side === 'A') return TRI_BLUE;
  if (side === 'B') return TRI_RED;
  return '';
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

function instanceHoleLabel(game, officialLabel, officialHoleOrder) {
  var want = asString(officialLabel);
  if (!want) return '';
  var holes = (game && game.holes) || [];
  if (
    holes.some(function (item) {
      var key = item && item.label != null ? item.label : item;
      return String(key) === want;
    })
  ) {
    return want;
  }
  var order = Array.isArray(game && game.holeOrder) && game.holeOrder.length
    ? game.holeOrder.map(asString)
    : holes.map(function (item) {
        return asString(item && item.label != null ? item.label : item);
      });
  var official = (officialHoleOrder || []).map(asString).filter(Boolean);
  var idx = official.indexOf(want);
  if (idx < 0) return want;
  return order[idx] || want;
}

function catalogIdOf(game) {
  return asString(
    (game && game.catalogId) ||
      (game && game.ruleId) ||
      (game && game.ruleSnapshot && game.ruleSnapshot.catalogId)
  );
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

function defaultAbLabels() {
  var out = [];
  var n;
  for (n = 1; n <= 9; n++) out.push('A' + n);
  for (n = 1; n <= 9; n++) out.push('B' + n);
  return out;
}

function holeLabelAtIndex(game, holeIndex) {
  var i = Number(holeIndex);
  if (!isFinite(i) || i < 0 || i > 17) return '';
  var holes = (game && game.holes) || [];
  var order =
    Array.isArray(game && game.holeOrder) && game.holeOrder.length
      ? game.holeOrder.map(asString)
      : holes.map(function (item) {
          return asString(item && item.label != null ? item.label : item);
        });
  if (asString(order[i])) return asString(order[i]);
  if (holes[i] && holes[i].label != null) return asString(holes[i].label);
  return defaultAbLabels()[i] || '';
}

function colorForGameCell(game, label, playerId) {
  var id = catalogIdOf(game);
  if (!usesRankMark(id)) return '';
  var orderId = resolveOrderId(game, playerId);
  if (!orderId) return '';
  if (!holeOn(game, label)) return '';
  var order = gameOrderForHole(game, label);
  if (!order || !order.length) return '';
  var idx = order.indexOf(orderId);
  if (idx < 0) return '';
  if (isLasuoN(id)) return lasuoNTriColor(game, order, orderId);
  if (isHorn(id)) return hornTriColor(game, order, orderId);
  return rankTriColor(id, order.length, game.groupMode, idx, game.dizhuboMode);
}

function markForGameCell(game, label, playerId) {
  var id = catalogIdOf(game);
  if (!usesRankMark(id)) return visual.emptyMark();
  var orderId = resolveOrderId(game, playerId);
  if (!orderId) return visual.emptyMark();
  if (!holeOn(game, label)) return visual.emptyMark();
  var order = gameOrderForHole(game, label);
  if (!order || !order.length) return visual.emptyMark();
  var idx = order.indexOf(orderId);
  if (idx < 0) return visual.emptyMark();
  if (isLasuoN(id)) return visual.fromSandboxColor(lasuoNTriColor(game, order, orderId));
  if (isHorn(id)) return visual.fromSandboxColor(hornTriColor(game, order, orderId));
  if (visual.providesHoleRanks(id, game.groupMode, order.length)) {
    var rank = visual.isSplitHighGroupMode(game.groupMode)
      ? visual.splitHighDisplayRank(game, order, orderId)
      : idx + 1;
    if (rank >= 1 && rank <= 4) return visual.fromRank(rank);
  }
  return visual.fromSandboxColor(
    rankTriColor(id, order.length, game.groupMode, idx, game.dizhuboMode)
  );
}

function colorForGameCellAtIndex(game, holeIndex, playerId) {
  return colorForGameCell(game, holeLabelAtIndex(game, holeIndex), playerId);
}

function markForGameCellAtIndex(game, holeIndex, playerId) {
  return markForGameCell(game, holeLabelAtIndex(game, holeIndex), playerId);
}

function colorForCell(games, label, playerId) {
  var list = games || [];
  var i;
  var color;
  for (i = 0; i < list.length; i++) {
    color = colorForGameCell(list[i], label, playerId);
    if (color) return color;
  }
  return '';
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
    players: players,
    parties: parties,
    playerOrder: inst.playerOrder,
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
    holeResults: (row && row.resultSnapshot) || inst.holeResults || null
  };
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

function loadRecords() {
  try {
    var raw = typeof wx !== 'undefined' && wx.getStorageSync ? wx.getStorageSync(STORAGE_KEY) : null;
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function gamesForScorePage(query, records) {
  return recordsForScorePage(records || loadRecords(), query).map(recordToGame);
}

function hasRankMarkGames(query) {
  var matched = recordsForScorePage(loadRecords(), query);
  var i;
  for (i = 0; i < matched.length; i++) {
    var row = matched[i];
    var id = asString((row && row.ruleId) || (row && row.config && row.config.instance && row.config.instance.catalogId));
    if (usesRankMark(id)) return true;
  }
  return false;
}

function completePlayerHoles(src) {
  var holes = {};
  var hi;
  var v;
  for (hi = 0; hi < 18; hi++) {
    v = src ? src[hi] : null;
    if (v == null) v = src ? src[String(hi)] : null;
    holes[String(hi)] = visual.normalizeMark(v);
  }
  return holes;
}

function completeProjection(projection, playerIds) {
  var out = {};
  var seen = {};
  function add(pid) {
    var id = asString(pid);
    if (!id || seen[id]) return;
    seen[id] = true;
    out[id] = completePlayerHoles(projection && projection[id]);
  }
  (playerIds || []).forEach(add);
  Object.keys(projection || {}).forEach(add);
  return out;
}

function markFromProjection(projection, playerId, holeIndex) {
  var pid = asString(playerId);
  var map = projection && projection[pid];
  if (!map) return visual.emptyMark();
  if (Object.prototype.hasOwnProperty.call(map, holeIndex)) return visual.normalizeMark(map[holeIndex]);
  if (Object.prototype.hasOwnProperty.call(map, String(holeIndex))) {
    return visual.normalizeMark(map[String(holeIndex)]);
  }
  return visual.emptyMark();
}

function colorFromProjection(projection, playerId, holeIndex) {
  return markFromProjection(projection, playerId, holeIndex).triColor;
}

function paintCellsFromProjection(cells, playerId, projection) {
  return (cells || []).map(function (cell) {
    if (!cell) return cell;
    return visual.applyMarkFields(cell, markFromProjection(projection, playerId, cell.holeIndex));
  });
}

function blankThenPaintCells(cells, playerId, projection) {
  var blanked = (cells || []).map(function (cell) {
    if (!cell) return cell;
    return Object.assign({}, cell, visual.emptyMark());
  });
  return paintCellsFromProjection(blanked, playerId, projection);
}

function makeLookup(query) {
  var games = gamesForScorePage(query);
  return function (playerId, holeIndex) {
    var i;
    var color;
    for (i = 0; i < games.length; i++) {
      color = colorForGameCellAtIndex(games[i], holeIndex, playerId);
      if (color) return color;
    }
    return '';
  };
}

function markAtStoredGames(games, holeIndex, playerId, holeLabel) {
  var list = games || [];
  var label = asString(holeLabel);
  var i;
  var mark;
  for (i = 0; i < list.length; i++) {
    mark = label
      ? markForGameCell(list[i], label, playerId)
      : markForGameCellAtIndex(list[i], holeIndex, playerId);
    if (mark && mark.triColor) return mark;
  }
  return visual.emptyMark();
}

function authoritySignature(query, official) {
  var records = recordsForScorePage(loadRecords(), query);
  var parts = records.map(function (row) {
    var inst = (row && row.config && row.config.instance) || {};
    return [
      asString(row && row.sideGameId),
      asString(row && row.revision),
      asString(row && row.resultRevision),
      asString(inst.groupMode),
      asString(inst.dizhuboMode),
      JSON.stringify(inst.fullHoleOrder || inst.holeOrder || []),
      asString(inst.fullHoleOrderRevision),
      JSON.stringify(inst.playerOrder || []),
      JSON.stringify(inst.splitHighExpertIds || []),
      JSON.stringify(inst.groupMembership || null)
    ].join('~');
  });
  var players = ((official && official.players) || []).map(function (p) {
    return asString(p && p.playerId) + ':' + JSON.stringify((p && p.scores) || []);
  });
  return [
    asString(query && query.matchId),
    asString(query && query.groupId),
    parts.join('|'),
    players.join('|'),
    JSON.stringify((official && official.pars) || []),
    JSON.stringify((official && official.holeLabels) || [])
  ].join('::');
}

/** 主包同步投影：读当前比赛 storage 权威实例，不跑 settle、不进游戏分包。 */
function projectFromStorage(official) {
  var query = {
    matchId: official && official.matchId,
    groupId: official && official.groupId
  };
  var ids = ((official && official.players) || [])
    .map(function (p) {
      return asString(p && p.playerId);
    })
    .filter(Boolean);
  var games = gamesForScorePage(query);
  var proj = {};
  ids.forEach(function (pid) {
    var holes = {};
    var hi;
    for (hi = 0; hi < 18; hi++) {
      var layoutLabel =
        official && Array.isArray(official.holeLabels) ? asString(official.holeLabels[hi]) : '';
      holes[String(hi)] = markAtStoredGames(games, hi, pid, layoutLabel);
    }
    proj[pid] = holes;
  });
  return completeProjection(proj, ids);
}

function inspect(query, sample) {
  var s = sample || {};
  var stored = loadRecords();
  var matched = recordsForScorePage(stored, query);
  var games = matched.map(recordToGame);
  var ruleIds = [];
  var eligible = [];
  games.forEach(function (g) {
    var rid = catalogIdOf(g);
    if (rid) ruleIds.push(rid);
    if (usesRankMark(rid)) eligible.push(g);
  });
  var holeIndex = s.holeIndex != null ? Number(s.holeIndex) : 0;
  var playerPresent = !!asString(s.scorePlayerId);
  var lookup = makeLookup(query);
  var color = playerPresent ? lookup(s.scorePlayerId, holeIndex) : '';
  var game = eligible[0] || games[0] || null;
  return {
    matchId: asString(query && query.matchId),
    groupId: asString(query && query.groupId),
    storedGameCount: stored.length,
    matchedGameCount: matched.length,
    eligibleGameCount: eligible.length,
    ruleIds: ruleIds,
    lookupSize: eligible.length,
    scorePlayerCount: Number(s.scorePlayerCount) || 0,
    scoreHoleCount: Number(s.scoreHoleCount) || 0,
    sample: {
      scorePlayerIdPresent: playerPresent,
      scoreHoleLabel: asString(s.scoreHoleLabel),
      scoreHoleIndex: holeIndex,
      gamePlayerMatched: !!(game && resolveOrderId(game, s.scorePlayerId)),
      gameHoleLabel: game ? holeLabelAtIndex(game, holeIndex) : '',
      gameHoleIndex: holeIndex,
      triColor: color
    }
  };
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  TRI_BLUE: TRI_BLUE,
  TRI_RED: TRI_RED,
  TRI_GOLD: TRI_GOLD,
  VIS_BLUE: visual.VIS_BLUE,
  VIS_RED: visual.VIS_RED,
  VIS_GOLD: visual.VIS_GOLD,
  usesRankMark: usesRankMark,
  rankTriColor: rankTriColor,
  lasuoNTriColor: lasuoNTriColor,
  hornTriColor: hornTriColor,
  holeOn: holeOn,
  gameOrderForHole: gameOrderForHole,
  instanceHoleLabel: instanceHoleLabel,
  colorForGameCell: colorForGameCell,
  markForGameCell: markForGameCell,
  markForGameCellAtIndex: markForGameCellAtIndex,
  colorForCell: colorForCell,
  recordToGame: recordToGame,
  recordsForScorePage: recordsForScorePage,
  gamesForScorePage: gamesForScorePage,
  loadRecords: loadRecords,
  hasRankMarkGames: hasRankMarkGames,
  colorFromProjection: colorFromProjection,
  markFromProjection: markFromProjection,
  completeProjection: completeProjection,
  paintCellsFromProjection: paintCellsFromProjection,
  blankThenPaintCells: blankThenPaintCells,
  makeLookup: makeLookup,
  projectFromStorage: projectFromStorage,
  authoritySignature: authoritySignature,
  holeLabelAtIndex: holeLabelAtIndex,
  colorForGameCellAtIndex: colorForGameCellAtIndex,
  emptyMark: visual.emptyMark,
  normalizeMark: visual.normalizeMark,
  fromRank: visual.fromRank,
  inspect: inspect
};
