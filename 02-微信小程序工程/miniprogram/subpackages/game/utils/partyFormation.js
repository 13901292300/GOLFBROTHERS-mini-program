/**
 * 记分页编队方模型：组合 ≡ party ≡ 一方；对决为 party vs party。
 */
var catalog = require("./catalog.js");

function asString(v) {
  return v == null ? "" : String(v).trim();
}

function partySize(party) {
  if (!party) return 0;
  var ids = party.playerIds || party.memberPlayerIds || [];
  if (Array.isArray(ids) && ids.length) return ids.length;
  return 1;
}

function sortedSizes(sizes) {
  return (sizes || [])
    .map(function (n) {
      return Number(n) || 0;
    })
    .filter(function (n) {
      return n > 0;
    })
    .sort(function (a, b) {
      return b - a;
    });
}

function shapeKey(sizes) {
  return sortedSizes(sizes).join("+");
}

function shapesEqual(a, b) {
  return shapeKey(a) === shapeKey(b);
}

function uniquePlayerIds(ids) {
  var seen = {};
  var out = [];
  (ids || []).forEach(function (id) {
    var s = asString(id);
    if (!s || seen[s]) return;
    seen[s] = true;
    out.push(s);
  });
  return out;
}

function normalizeParty(raw, order) {
  var partyId = asString(
    raw && (raw.partyId || raw.id || raw.teamId || raw.entityId)
  );
  var playerIds = uniquePlayerIds(
    (raw && (raw.playerIds || raw.memberPlayerIds)) ||
      (partyId ? [partyId] : [])
  );
  return {
    partyId: partyId,
    playerIds: playerIds,
    order: order != null ? Number(order) || 0 : 0,
    size: playerIds.length,
    displayName: asString(raw && (raw.displayName || raw.name)),
    partyType:
      asString(raw && raw.partyType) ||
      (playerIds.length > 1 ? "combination" : "player"),
    groupId: asString(raw && raw.groupId)
  };
}

function normalizeParties(list) {
  var out = [];
  var seen = {};
  var usedPlayers = {};
  (list || []).forEach(function (raw, i) {
    var p = normalizeParty(raw, i);
    if (!p.partyId || seen[p.partyId]) return;
    var overlap = p.playerIds.some(function (id) {
      return !!usedPlayers[id];
    });
    if (overlap) return;
    p.playerIds.forEach(function (id) {
      usedPlayers[id] = true;
    });
    seen[p.partyId] = true;
    out.push(p);
  });
  return out;
}

function inferFormation(parties) {
  var key = shapeKey(
    (parties || []).map(function (p) {
      return partySize(p);
    })
  );
  if (key === "2+2" || key === "3+1" || key === "2+1+1") return key;
  if (key === "4") return "4+0";
  if (key === "1+1+1+1") return "1+1+1+1";
  if (key === "1+1+1") return "1+1+1";
  if (key === "1+1") return "1+1";
  return key || "unknown";
}

function isTeamedFormation(formation) {
  var f = asString(formation);
  return f === "2+2" || f === "3+1" || f === "2+1+1";
}

/**
 * 可供选择的游戏实体数：1 名独立球员或 1 个组合各计 1。
 * 禁止用标题、TAB、比赛名或未做组合转换的原始 roster 总人数。
 */
function resolveAvailableGameEntityCount(context) {
  var ctx = context || {};
  if (typeof ctx.availablePartyCount === "number" && ctx.availablePartyCount > 0) {
    return ctx.availablePartyCount;
  }
  var parties = normalizeParties(ctx.parties || ctx.scoreParties || []);
  if (parties.length) return parties.length;
  var n = Number(ctx.entityCount);
  return n > 0 ? n : 0;
}

function buildFormationContext(rawParties, opts) {
  var parties = normalizeParties(rawParties);
  var explicit =
    asString(opts && opts.formation) || asString(opts && opts.compositionType);
  var inferred = inferFormation(parties);
  var formation = inferred;
  if (explicit === "2+2" || explicit === "3+1" || explicit === "2+1+1") {
    if (!parties.length || inferred === explicit || inferred === "unknown") {
      formation = explicit;
    } else if (isTeamedFormation(inferred)) {
      formation = inferred;
    } else {
      formation = explicit;
    }
  }
  return {
    formation: formation,
    parties: parties,
    availablePartyCount: parties.length,
    partySizes: parties.map(partySize),
    scoreKind: asString(opts && opts.scoreKind) || "",
    teamed: isTeamedFormation(formation)
  };
}

/**
 * 两方玩法：只要求方数；对决是完整组合 vs 完整组合，不拆球员。
 * exact-party-shape：固定结构（如 3+1 固定三打一）。
 */
function ruleCapability(catalogId) {
  var id = asString(catalogId);
  var rule = catalog.findRule(id);
  var n = Number((rule && rule.players) || 0);
  var rawMode = rule && rule.matchupMode;
  // 兼容旧字段名：cross-party-1v1 误指球员笛卡尔积，统一视为 party-matchup
  if (rawMode === "cross-party-1v1") rawMode = "party-matchup";
  var matchupMode =
    rawMode ||
    (n === 2
      ? "party-matchup"
      : id === "three-vs-one"
        ? "exact-party-shape"
        : n === 3 || n === 4
          ? "exact-party-shape"
          : n >= 5
            ? "fixed-party-count"
            : "free-player-selection");
  var partySizeMode =
    (rule && rule.partySizeMode) ||
    (matchupMode === "party-matchup" || matchupMode === "fixed-party-count"
      ? "one-or-more"
      : "exact");
  var minPlayersPerParty =
    rule && rule.minPlayersPerParty != null
      ? Number(rule.minPlayersPerParty) || 1
      : 1;
  var requiredPartyCount =
    rule && rule.requiredPartyCount != null
      ? Number(rule.requiredPartyCount) || n
      : n;
  var allowedPartyShapes = [];
  if (rule && Array.isArray(rule.allowedPartyShapes) && rule.allowedPartyShapes.length) {
    allowedPartyShapes = rule.allowedPartyShapes.map(sortedSizes);
  } else if (matchupMode === "exact-party-shape") {
    if (id === "three-vs-one") allowedPartyShapes = [[3, 1]];
    else if (n === 3) allowedPartyShapes = [[1, 1, 1], [2, 1, 1]];
    else if (n === 4) allowedPartyShapes = [[1, 1, 1, 1]];
  }
  return {
    catalogId: id,
    requiredPartyCount: requiredPartyCount > 0 ? requiredPartyCount : 0,
    matchupMode: matchupMode,
    partySizeMode: partySizeMode,
    minPlayersPerParty: minPlayersPerParty,
    allowedPartyShapes: allowedPartyShapes
  };
}

function allowedPartyShapesOf(catalogId) {
  return ruleCapability(catalogId).allowedPartyShapes;
}

function requiredPartyCountOf(catalogId) {
  return ruleCapability(catalogId).requiredPartyCount;
}

function combinations(arr, k) {
  var out = [];
  function walk(start, picked) {
    if (picked.length === k) {
      out.push(picked.slice());
      return;
    }
    var i;
    for (i = start; i < arr.length; i++) {
      picked.push(arr[i]);
      walk(i + 1, picked);
      picked.pop();
    }
  }
  if (k <= 0 || k > arr.length) return out;
  walk(0, []);
  return out;
}

function selectionMatchesShape(parties, allowedShapes) {
  var sizes = (parties || []).map(partySize);
  return (allowedShapes || []).some(function (shape) {
    return shapesEqual(shape, sizes);
  });
}

function partiesMeetMinSize(parties, minN) {
  var min = Number(minN) || 1;
  return (parties || []).every(function (p) {
    return partySize(p) >= min;
  });
}

/**
 * 唯一对决：左组合方 vs 右组合方。不拆球员、不生成笛卡尔积。
 */
function buildPartyMatchup(leftParty, rightParty) {
  var left = normalizeParty(leftParty, 0);
  var right = normalizeParty(rightParty, 1);
  if (!left.partyId || !right.partyId || left.partyId === right.partyId) return null;
  return {
    id: left.partyId + "|" + right.partyId,
    leftPartyId: left.partyId,
    rightPartyId: right.partyId,
    leftId: left.partyId,
    rightId: right.partyId,
    on: true
  };
}

/** 已选各方之间的 C(n,2) party 对决（两方玩法通常恰好 1 条） */
function buildPartyMatchups(parties) {
  var list = normalizeParties(parties);
  var out = [];
  var i;
  var j;
  for (i = 0; i < list.length; i++) {
    for (j = i + 1; j < list.length; j++) {
      var m = buildPartyMatchup(list[i], list[j]);
      if (m) out.push(m);
    }
  }
  return out;
}

function listCompatiblePartySelections(parties, catalogId) {
  var cap = ruleCapability(catalogId);
  var required = cap.requiredPartyCount;
  var list = normalizeParties(parties);
  if (!(required > 0) || list.length < required) return [];
  return combinations(list, required)
    .filter(function (combo) {
      if (!partiesMeetMinSize(combo, cap.minPlayersPerParty)) return false;
      if (cap.matchupMode === "party-matchup" || cap.matchupMode === "fixed-party-count") {
        return true;
      }
      if (cap.matchupMode === "exact-party-shape") {
        return selectionMatchesShape(combo, cap.allowedPartyShapes);
      }
      return selectionMatchesShape(
        combo,
        cap.allowedPartyShapes.length ? cap.allowedPartyShapes : [[]]
      );
    })
    .map(function (combo) {
      return {
        partyIds: combo.map(function (p) {
          return p.partyId;
        }),
        parties: combo,
        sizes: combo.map(partySize),
        shape: shapeKey(combo.map(partySize)),
        matchups: buildPartyMatchups(combo)
      };
    });
}

function defaultCompatibleSelection(parties, catalogId) {
  var list = listCompatiblePartySelections(parties, catalogId);
  return list.length ? list[0] : null;
}

function resolveAvailableGameCatalog(input) {
  var ctx = buildFormationContext(input && input.parties, {
    formation: input && input.formation,
    compositionType: input && input.compositionType,
    scoreKind: input && input.scoreKind
  });
  var groups = (input && input.catalogGroups) || catalog.listCatalogForDesign();
  var visible = [];
  (groups || []).forEach(function (group) {
    var items = [];
    (group.items || []).forEach(function (item) {
      if (!item || item.hidden || catalog.isUnavailableRule(item)) return;
      var hit = resolveRuleCompatibility(ctx, item.id);
      if (!hit.visible) return;
      items.push(
        Object.assign({}, item, {
          compatiblePartySelections: hit.compatiblePartySelections,
          defaultPartyIds: hit.defaultPartyIds,
          matchupMode: hit.matchupMode
        })
      );
    });
    if (items.length) {
      visible.push({
        group: group.group,
        groupId: group.groupId,
        items: items
      });
    }
  });
  return {
    formation: ctx.formation,
    parties: ctx.parties,
    availablePartyCount: ctx.availablePartyCount,
    partySizes: ctx.partySizes,
    teamed: ctx.teamed,
    visible: visible,
    resolveRule: function (catalogId) {
      return resolveRuleCompatibility(ctx, catalogId);
    }
  };
}

function resolveRuleCompatibility(formationCtxOrParties, catalogId) {
  var ctx =
    formationCtxOrParties && formationCtxOrParties.parties
      ? formationCtxOrParties
      : buildFormationContext(formationCtxOrParties);
  var cap = ruleCapability(catalogId);
  var base = {
    formation: ctx.formation,
    availablePartyCount: ctx.availablePartyCount,
    partySizes: ctx.partySizes || (ctx.parties || []).map(partySize),
    catalogId: cap.catalogId,
    requiredPartyCount: cap.requiredPartyCount,
    partySizeMode: cap.partySizeMode,
    matchupMode: cap.matchupMode,
    compatible: false,
    visible: false,
    compatiblePartySelections: [],
    disabledReason: "",
    defaultPartyIds: [],
    matchups: []
  };
  if (!(cap.requiredPartyCount > 0)) {
    return Object.assign(base, { disabledReason: "unknown_rule" });
  }
  if (ctx.availablePartyCount < cap.requiredPartyCount) {
    return Object.assign(base, { disabledReason: "party_count" });
  }
  var selections = listCompatiblePartySelections(ctx.parties, catalogId);
  if (!selections.length) {
    return Object.assign(base, { disabledReason: "party_shape" });
  }
  var locked =
    selections.length === 1 &&
    selections[0].partyIds.length === ctx.availablePartyCount;
  return Object.assign(base, {
    compatible: true,
    visible: true,
    compatiblePartySelections: selections,
    defaultPartyIds: selections[0].partyIds.slice(),
    matchups: selections[0].matchups || [],
    locked: locked,
    disabledReason: ""
  });
}

function isSelectionCompatible(parties, selectedIds, catalogId) {
  var want = {};
  (selectedIds || []).forEach(function (id) {
    want[asString(id)] = true;
  });
  var picked = normalizeParties(parties).filter(function (p) {
    return want[p.partyId];
  });
  var cap = ruleCapability(catalogId);
  if (picked.length !== cap.requiredPartyCount) return false;
  if (!partiesMeetMinSize(picked, cap.minPlayersPerParty)) return false;
  if (cap.matchupMode === "party-matchup" || cap.matchupMode === "fixed-party-count") {
    return true;
  }
  if (cap.matchupMode === "exact-party-shape") {
    return selectionMatchesShape(picked, cap.allowedPartyShapes);
  }
  return true;
}

function inspectCompatibility(formationCtx, catalogId) {
  return resolveRuleCompatibility(formationCtx, catalogId);
}

module.exports = {
  asString: asString,
  partySize: partySize,
  shapeKey: shapeKey,
  shapesEqual: shapesEqual,
  normalizeParty: normalizeParty,
  normalizeParties: normalizeParties,
  inferFormation: inferFormation,
  isTeamedFormation: isTeamedFormation,
  buildFormationContext: buildFormationContext,
  ruleCapability: ruleCapability,
  allowedPartyShapesOf: allowedPartyShapesOf,
  requiredPartyCountOf: requiredPartyCountOf,
  buildPartyMatchup: buildPartyMatchup,
  buildPartyMatchups: buildPartyMatchups,
  listCompatiblePartySelections: listCompatiblePartySelections,
  defaultCompatibleSelection: defaultCompatibleSelection,
  resolveAvailableGameEntityCount: resolveAvailableGameEntityCount,
  resolveAvailableGameCatalog: resolveAvailableGameCatalog,
  resolveRuleCompatibility: resolveRuleCompatibility,
  isSelectionCompatible: isSelectionCompatible,
  inspectCompatibility: inspectCompatibility
};
