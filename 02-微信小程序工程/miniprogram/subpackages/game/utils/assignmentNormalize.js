/**
 * Settlement hole-sides → canonical assignmentsByHole.
 *
 * Field mapping only. Callers pass already-formed side groups.
 * Does not rank, push, or pair players.
 *
 * Schema:
 *   { playerId, side: 'blue' | 'red' | 'gold', role: 'primary' | 'secondary' }
 * `gold` is optional (flower). Bye is omitted.
 *
 * Role (PATCH 2C):
 *   by-index     — first on a side is primary, rest secondary (default / random)
 *   all-primary  — every player on a side is primary (fixed pairing)
 *   primary-set  — ids in primaryIds are primary, others secondary (split-high)
 */
function asString(v) {
  return v == null ? '' : String(v);
}

function idList(src) {
  if (!Array.isArray(src)) return [];
  return src.map(asString).filter(Boolean);
}

function rolePolicyOf(game) {
  if (!game) return { roleMode: 'by-index' };
  var mode = asString(game.groupMode);
  var sortUpdate = asString(game.sortUpdate);
  var band = asString(game.bandMode);
  if (mode === 'fixed' || sortUpdate === 'fixed') {
    return { roleMode: 'all-primary' };
  }
  if (mode === 'split-high' || band === 'split-high') {
    return { roleMode: 'primary-set', primaryIds: expertIdsOf(game) };
  }
  return { roleMode: 'by-index' };
}

function expertIdsOf(game) {
  var out = [];
  var seen = {};
  function add(id) {
    var s = asString(id);
    if (!s || seen[s]) return;
    seen[s] = true;
    out.push(s);
  }
  var membership = game && (game.groupMembership || game.splitHighMembership);
  if (membership && typeof membership === 'object' && !Array.isArray(membership)) {
    Object.keys(membership).forEach(function (id) {
      if (asString(membership[id]) === 'expert') add(id);
    });
    if (out.length) return out;
  }
  var experts = game && (game.splitHighExpertIds || game.expertIds);
  if (Array.isArray(experts) && experts.length) {
    experts.forEach(add);
    if (out.length) return out;
  }
  var bandMap = game && game.bandMap;
  if (bandMap && typeof bandMap === 'object') {
    var saw = false;
    Object.keys(bandMap).forEach(function (id) {
      var tag = asString(bandMap[id]);
      if (tag === 'expert' || tag === 'high') {
        saw = true;
        add(id);
      }
    });
    if (saw && out.length) return out;
  }
  idList(game && game.playerOrder)
    .slice(0, 2)
    .forEach(add);
  return out;
}

function withRolePolicy(sides, policy) {
  if (!sides || typeof sides !== 'object') return sides;
  if (!policy) return sides;
  var out = Object.assign({}, sides);
  if (!out.roleMode) out.roleMode = policy.roleMode;
  if (!out.primaryIds && policy.primaryIds) out.primaryIds = policy.primaryIds;
  return out;
}

function policyFromSides(sides) {
  if (!sides || typeof sides !== 'object') return { roleMode: 'by-index' };
  if (sides.roleMode || sides.primaryIds) {
    return {
      roleMode: asString(sides.roleMode) || (sides.primaryIds ? 'primary-set' : 'by-index'),
      primaryIds: sides.primaryIds
    };
  }
  return { roleMode: 'by-index' };
}

function primarySetOf(policy) {
  var set = {};
  idList(policy && policy.primaryIds).forEach(function (id) {
    set[id] = true;
  });
  return set;
}

function roleFor(id, indexInSide, policy) {
  var mode = asString(policy && policy.roleMode) || 'by-index';
  if (mode === 'all-primary') return 'primary';
  if (mode === 'primary-set') {
    return primarySetOf(policy)[asString(id)] ? 'primary' : 'secondary';
  }
  return indexInSide === 0 ? 'primary' : 'secondary';
}

function fromAbTeams(aTeam, bTeam, policy) {
  var pol = policy || { roleMode: 'by-index' };
  var out = [];
  idList(aTeam).forEach(function (id, i) {
    out.push({ playerId: id, side: 'blue', role: roleFor(id, i, pol) });
  });
  idList(bTeam).forEach(function (id, i) {
    out.push({ playerId: id, side: 'red', role: roleFor(id, i, pol) });
  });
  return out;
}

function fromSoloMates(solo, mates, policy) {
  return fromAbTeams([solo], mates, policy);
}

function fromAbLists(teamA, teamB, flower, byes, policy) {
  var pol = policy || { roleMode: 'by-index' };
  var skip = {};
  idList(byes).forEach(function (id) {
    skip[id] = true;
  });
  var flowerId = asString(flower);
  var out = [];
  if (flowerId && !skip[flowerId]) {
    out.push({ playerId: flowerId, side: 'gold', role: 'primary' });
    skip[flowerId] = true;
  }
  idList(teamA).forEach(function (id, i) {
    if (skip[id]) return;
    out.push({ playerId: id, side: 'blue', role: roleFor(id, i, pol) });
  });
  idList(teamB).forEach(function (id, i) {
    if (skip[id]) return;
    out.push({ playerId: id, side: 'red', role: roleFor(id, i, pol) });
  });
  return out;
}

function fromSideMap(side, policy) {
  var map = side && typeof side === 'object' ? side : {};
  var A = [];
  var B = [];
  var byes = [];
  var flower = '';
  Object.keys(map).forEach(function (id) {
    var tag = asString(map[id]);
    if (tag === 'flower' || tag === 'gold') flower = id;
    else if (tag === 'A' || tag === 'blue') A.push(id);
    else if (tag === 'B' || tag === 'red') B.push(id);
    else if (tag === 'bye') byes.push(id);
  });
  return fromAbLists(A, B, flower, byes, policy);
}

function fromHoleSides(sides) {
  if (!sides || typeof sides !== 'object') return [];
  var policy = policyFromSides(sides);
  if (Array.isArray(sides.aTeam) && Array.isArray(sides.bTeam)) {
    return fromAbTeams(sides.aTeam, sides.bTeam, policy);
  }
  if (Array.isArray(sides.land) && Array.isArray(sides.farm)) {
    return fromAbTeams(sides.land, sides.farm, policy);
  }
  if (sides.solo != null && Array.isArray(sides.mates)) {
    return fromSoloMates(sides.solo, sides.mates, policy);
  }
  if (Array.isArray(sides.A) && Array.isArray(sides.B)) {
    return fromAbLists(sides.A, sides.B, sides.flower, sides.byes, policy);
  }
  if (sides.leftId && sides.rightId) {
    return fromAbTeams([sides.leftId], [sides.rightId], policy);
  }
  if (sides.side && typeof sides.side === 'object' && !Array.isArray(sides.side)) {
    return fromSideMap(sides.side, policy);
  }
  return [];
}

function stamp(orderByHole, assignmentsByHole, label, order, holeSides, game) {
  var key = asString(label);
  if (!key) return;
  orderByHole[key] = idList(order);
  assignmentsByHole[key] = fromHoleSides(withRolePolicy(holeSides, rolePolicyOf(game)));
}

module.exports = {
  rolePolicyOf: rolePolicyOf,
  expertIdsOf: expertIdsOf,
  withRolePolicy: withRolePolicy,
  fromAbTeams: fromAbTeams,
  fromSoloMates: fromSoloMates,
  fromAbLists: fromAbLists,
  fromSideMap: fromSideMap,
  fromHoleSides: fromHoleSides,
  stamp: stamp
};
