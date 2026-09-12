/**
 * Order → holeSides. Same grouping settle uses when stamping assignmentsByHole.
 * Does not settle scores. Incomplete order → null (no guessed teams).
 */
function asString(v) {
  return v == null ? '' : String(v);
}

function toId(v) {
  return v == null ? '' : String(v);
}

function catalogIdOf(game) {
  return asString(
    (game && game.catalogId) ||
      (game && game.ruleId) ||
      (game && game.ruleSnapshot && game.ruleSnapshot.catalogId)
  );
}

function idList(src) {
  if (!Array.isArray(src)) return [];
  return src.map(asString).filter(Boolean);
}

function pairFour(order, mode) {
  var o = idList(order);
  if (o.length < 4) return null;
  o = o.slice(0, 4);
  if (mode === 'fixed') {
    return { aTeam: [o[0], o[1]], bTeam: [o[2], o[3]] };
  }
  return {
    aTeam: [o[0], o[3]],
    bTeam: [o[1], o[2]]
  };
}

function dizhuboSides(order, mid) {
  var o = idList(order);
  if (o.length < 4) return null;
  o = o.slice(0, 4);
  var d = o[3];
  if (mid) {
    return { land: [o[1], d], farm: [o[0], o[2]] };
  }
  return { land: [o[0], d], farm: [o[1], o[2]] };
}

/** Visual only. Mid: farm=blue, land=red. Scoring still uses land/farm. */
function dizhuboAssignmentSides(sides, mid) {
  if (!sides) return sides;
  if (!mid) return sides;
  return { aTeam: sides.farm, bTeam: sides.land };
}

function landlordSides(order, soloIndex) {
  var o = idList(order);
  if (o.length < 3) return null;
  o = o.slice(0, 3);
  var solo = o[soloIndex];
  if (!solo) return null;
  var mates = o.filter(function (id) {
    return id !== solo;
  });
  if (soloIndex === 0) return { aTeam: [solo], bTeam: mates };
  return { aTeam: mates, bTeam: [solo] };
}

function num(v, fallback) {
  var n = Number(v);
  return isNaN(n) ? fallback : n;
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

function bandOf(bandMap, id) {
  return String((bandMap && bandMap[id]) || 'low') === 'high' ? 'high' : 'low';
}

function lasuoMatchup(order, game) {
  var formation = game && game.formation === 'haidao' ? 'haidao' : 'jianghu';
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
  var byes = [];
  A.forEach(function (id) {
    used[id] = 'A';
  });
  B.forEach(function (id) {
    used[id] = 'B';
  });
  order.forEach(function (id) {
    if (!used[id]) {
      byes.push(id);
      used[id] = 'bye';
    }
  });
  return { A: A, B: B, byes: byes, side: used };
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
  return { A: lasuoM.A, B: lasuoM.B, flower: flower, byes: ev.bye ? [ev.bye] : [], side: side };
}

function holeSidesFromOrder(game, order) {
  var id = catalogIdOf(game);
  var seq = idList(order);
  var mode = (game && game.groupMode) || 'fixed';
  if (id === 'lasuo-4' || id === 'vegas' || id === '8421-4') {
    return pairFour(seq, mode);
  }
  if (id === 'dizhubo-4') {
    var mid = (game && game.dizhuboMode) === 'mid';
    return dizhuboAssignmentSides(dizhuboSides(seq, mid), mid);
  }
  if (id === 'landlord-big') return landlordSides(seq, 0);
  if (id === 'landlord-mid') return landlordSides(seq, 1);
  if (id === 'landlord-small') return landlordSides(seq, 2);
  if (id === '8421-3') {
    if (seq.length < 3) return null;
    return { aTeam: [seq[0], seq[2]], bTeam: [seq[1]] };
  }
  if (id === 'three-vs-one') {
    if (seq.length < 4) return null;
    return { aTeam: [seq[0]], bTeam: seq.slice(1, 4) };
  }
  if (id === 'lasuo-n') {
    if (seq.length < 2) return null;
    return lasuoMatchup(seq, game || {});
  }
  if (id === 'horn') {
    if (seq.length < 2) return null;
    return hornLayout(seq, game || {});
  }
  return null;
}

module.exports = {
  holeSidesFromOrder: holeSidesFromOrder,
  pairFour: pairFour,
  dizhuboSides: dizhuboSides,
  dizhuboAssignmentSides: dizhuboAssignmentSides,
  landlordSides: landlordSides,
  lasuoMatchup: lasuoMatchup,
  hornLayout: hornLayout
};
