/**
 * 记分格角标视觉：历史 28rpx 贴角直角三角 + 当前正式名次/分边。
 * 不包含 COLUMN_TRIANGLES 示意，不跑 settle。
 */
var VIS_BLUE = '#3b82f6';
var VIS_RED = '#ef4444';
var VIS_GOLD = '#ce9224';

var TRI_SANDBOX_BLUE = '#007AFF';
var TRI_SANDBOX_RED = '#FF3B30';
var TRI_SANDBOX_GOLD = '#ce9224';

function asString(v) {
  return v == null ? '' : String(v);
}

function emptyMark() {
  return {
    triColor: '',
    gameCornerRank: null,
    triangleClass: '',
    hasWaist: false
  };
}

function fromRank(rank) {
  var n = Number(rank);
  if (n === 1) {
    return { triColor: VIS_BLUE, gameCornerRank: 1, triangleClass: 'triangle-blue', hasWaist: false };
  }
  if (n === 2) {
    return { triColor: VIS_RED, gameCornerRank: 2, triangleClass: 'triangle-red', hasWaist: false };
  }
  if (n === 3) {
    return { triColor: VIS_RED, gameCornerRank: 3, triangleClass: 'triangle-red', hasWaist: true };
  }
  if (n === 4) {
    return { triColor: VIS_BLUE, gameCornerRank: 4, triangleClass: 'triangle-blue', hasWaist: true };
  }
  return emptyMark();
}

function fromAbSide(side) {
  var s = asString(side);
  if (s === 'flower' || s === 'gold') {
    return { triColor: VIS_GOLD, gameCornerRank: null, triangleClass: 'triangle-gold', hasWaist: false };
  }
  if (s === 'A' || s === 'blue') {
    return { triColor: VIS_BLUE, gameCornerRank: null, triangleClass: 'triangle-blue', hasWaist: false };
  }
  if (s === 'B' || s === 'red') {
    return { triColor: VIS_RED, gameCornerRank: null, triangleClass: 'triangle-red', hasWaist: false };
  }
  return emptyMark();
}

function markFromAssignment(assignment) {
  var side = asString(assignment && assignment.side);
  var role = asString(assignment && assignment.role);
  if (side === 'gold' || side === 'flower') {
    return {
      triColor: VIS_GOLD,
      gameCornerRank: null,
      triangleClass: 'triangle-gold',
      hasWaist: false
    };
  }
  var waist = role === 'secondary';
  if (side === 'blue') {
    return {
      triColor: VIS_BLUE,
      gameCornerRank: null,
      triangleClass: 'triangle-blue',
      hasWaist: waist
    };
  }
  if (side === 'red') {
    return {
      triColor: VIS_RED,
      gameCornerRank: null,
      triangleClass: 'triangle-red',
      hasWaist: waist
    };
  }
  return emptyMark();
}

function resultSnapshotOf(game) {
  return (game && (game.holeResults || game.resultSnapshot)) || {};
}

function holeAssignments(game, label) {
  var rs = resultSnapshotOf(game);
  var map = rs.assignmentsByHole;
  if (!map || typeof map !== 'object') return null;
  var key = asString(label);
  if (!Object.prototype.hasOwnProperty.call(map, key)) return null;
  var list = map[key];
  if (!Array.isArray(list)) return null;
  return list;
}

/**
 * Assignment authority for one hole.
 * If resultSnapshot.assignmentsByHole exists (new GAME / new settle), never fall back to order.
 * Legacy only when the map field is missing entirely.
 */
function resolveAssignmentForHole(game, label, playerId) {
  var rs = resultSnapshotOf(game);
  var map = rs.assignmentsByHole;
  if (!map || typeof map !== 'object') {
    return { source: 'legacy', assignment: null };
  }
  var list = holeAssignments(game, label) || [];
  var pid = asString(playerId);
  var i;
  for (i = 0; i < list.length; i++) {
    if (asString(list[i] && list[i].playerId) === pid) {
      return { source: 'assignment', assignment: list[i] };
    }
  }
  return { source: 'assignment', assignment: null };
}

function assignmentForPlayer(game, label, playerId) {
  var resolved = resolveAssignmentForHole(game, label, playerId);
  if (resolved.source !== 'assignment') {
    return { foundHole: false, assignment: null };
  }
  return { foundHole: true, assignment: resolved.assignment };
}

function toneOfColor(color) {
  var c = asString(color).toLowerCase();
  if (!c) return '';
  if (c === visBlueLower() || c === String(TRI_SANDBOX_BLUE).toLowerCase() || c === '#007aff') return 'blue';
  if (c === String(VIS_RED).toLowerCase() || c === String(TRI_SANDBOX_RED).toLowerCase() || c === '#ff3b30') return 'red';
  if (c === String(VIS_GOLD).toLowerCase()) return 'gold';
  if (c.indexOf('blue') >= 0) return 'blue';
  if (c.indexOf('red') >= 0) return 'red';
  if (c.indexOf('gold') >= 0) return 'gold';
  return '';
}

function visBlueLower() {
  return String(VIS_BLUE).toLowerCase();
}

function fromSandboxColor(color) {
  var tone = toneOfColor(color);
  if (tone === 'gold') return fromAbSide('gold');
  if (tone === 'blue') return fromAbSide('A');
  if (tone === 'red') return fromAbSide('B');
  return emptyMark();
}

function providesHoleRanks(catalogId, groupMode, orderLen) {
  var id = asString(catalogId);
  if (!id) return false;
  if (id === 'lasuo-n' || id === 'horn') return false;
  if (id === 'three-vs-one' || id === 'dizhubo-4') return false;
  if (groupMode === 'fixed') return false;
  return Number(orderLen) >= 4;
}

function isSplitHighGroupMode(groupMode) {
  return asString(groupMode) === 'split-high';
}

function idList(src) {
  if (!Array.isArray(src)) return [];
  return src.map(asString).filter(Boolean);
}

function splitHighExpertSet(game, holeOrder) {
  var set = {};
  var count = 0;
  function add(id) {
    var s = asString(id);
    if (!s || set[s]) return;
    set[s] = true;
    count += 1;
  }
  var membership = game && (game.groupMembership || game.splitHighMembership);
  if (membership && typeof membership === 'object' && !Array.isArray(membership)) {
    Object.keys(membership).forEach(function (id) {
      if (asString(membership[id]) === 'expert') add(id);
    });
    if (count >= 1) return set;
  }
  var experts = game && (game.splitHighExpertIds || game.expertIds);
  if (Array.isArray(experts) && experts.length) {
    experts.forEach(add);
    if (count >= 1) return set;
  }
  var bandMap = game && game.bandMap;
  if (bandMap && typeof bandMap === 'object') {
    var sawExpert = false;
    Object.keys(bandMap).forEach(function (id) {
      if (asString(bandMap[id]) === 'expert') {
        sawExpert = true;
        add(id);
      }
    });
    if (sawExpert && count >= 1) return set;
  }
  var saved = idList(game && game.playerOrder);
  if (saved.length >= 2) {
    add(saved[0]);
    add(saved[1]);
    return set;
  }
  var seq = idList(holeOrder);
  if (seq.length >= 2) {
    add(seq[0]);
    add(seq[1]);
  }
  return set;
}

function splitHighDisplayRank(game, holeOrder, orderId) {
  var pid = asString(orderId);
  var seq = idList(holeOrder);
  var expertSet = splitHighExpertSet(game, seq);
  var experts = [];
  var regulars = [];
  seq.forEach(function (id) {
    if (expertSet[id]) experts.push(id);
    else regulars.push(id);
  });
  var ei = experts.indexOf(pid);
  if (ei === 0 || ei === 1) return ei + 1;
  var ri = regulars.indexOf(pid);
  if (ri === 0 || ri === 1) return ri + 3;
  return 0;
}

function normalizeMark(v) {
  if (v == null || v === false || v === '') return emptyMark();
  if (typeof v === 'string') return fromSandboxColor(v);
  if (typeof v !== 'object') return emptyMark();
  var cls = asString(v.triangleClass);
  var rank = v.gameCornerRank;
  if (rank === '' || rank == null) rank = null;
  else {
    rank = Number(rank);
    if (!isFinite(rank) || rank < 1) rank = null;
  }
  var color = asString(v.triColor);
  if (!cls && color) {
    return Object.assign(fromSandboxColor(color), {
      gameCornerRank: rank,
      hasWaist: !!(v.hasWaist && (color || cls))
    });
  }
  if (!cls) return emptyMark();
  return {
    triColor: color || classToColor(cls),
    gameCornerRank: rank,
    triangleClass: cls,
    hasWaist: !!(v.hasWaist && cls)
  };
}

function classToColor(cls) {
  if (cls.indexOf('gold') >= 0) return VIS_GOLD;
  if (cls.indexOf('red') >= 0) return VIS_RED;
  if (cls.indexOf('blue') >= 0) return VIS_BLUE;
  return '';
}

function toneOfMark(mark) {
  var m = normalizeMark(mark);
  if (m.triangleClass.indexOf('gold') >= 0) return 'gold';
  if (m.triangleClass.indexOf('red') >= 0) return 'red';
  if (m.triangleClass.indexOf('blue') >= 0) return 'blue';
  return toneOfColor(m.triColor);
}

function isEmptyMark(mark) {
  var m = normalizeMark(mark);
  return !m.triColor && !m.triangleClass && !m.hasWaist && (m.gameCornerRank == null);
}

function applyMarkFields(cell, mark) {
  var next = Object.assign({}, cell || {}, emptyMark());
  if (cell && (cell.type === 'special' || cell.isSpecial)) return next;
  if (!cell || (cell.holeIndex == null && cell.holeIndex !== 0)) return next;
  return Object.assign(next, normalizeMark(mark));
}

module.exports = {
  VIS_BLUE: VIS_BLUE,
  VIS_RED: VIS_RED,
  VIS_GOLD: VIS_GOLD,
  TRI_SANDBOX_BLUE: TRI_SANDBOX_BLUE,
  TRI_SANDBOX_RED: TRI_SANDBOX_RED,
  TRI_SANDBOX_GOLD: TRI_SANDBOX_GOLD,
  emptyMark: emptyMark,
  fromRank: fromRank,
  fromAbSide: fromAbSide,
  markFromAssignment: markFromAssignment,
  holeAssignments: holeAssignments,
  resolveAssignmentForHole: resolveAssignmentForHole,
  assignmentForPlayer: assignmentForPlayer,
  fromSandboxColor: fromSandboxColor,
  providesHoleRanks: providesHoleRanks,
  isSplitHighGroupMode: isSplitHighGroupMode,
  splitHighExpertSet: splitHighExpertSet,
  splitHighDisplayRank: splitHighDisplayRank,
  normalizeMark: normalizeMark,
  toneOfMark: toneOfMark,
  toneOfColor: toneOfColor,
  isEmptyMark: isEmptyMark,
  applyMarkFields: applyMarkFields
};
