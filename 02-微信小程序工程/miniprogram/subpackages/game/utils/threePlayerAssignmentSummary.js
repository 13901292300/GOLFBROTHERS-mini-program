/**
 * game-tab 三人玩法逐洞「单/双」文案。只读 assignmentsByHole，不结算、不猜比分。
 * 单/双按该洞各 side 人数识别（1=单，2=双），不把蓝色当作单方。
 */
var comboName = require("../../../utils/comboDisplayName.js");

var THREE_PLAYER_ASSIGNMENT_CATALOGS = {
  "landlord-big": true,
  "landlord-mid": true,
  "landlord-small": true,
  "8421-3": true
};

function asString(v) {
  return v == null ? "" : String(v);
}

function isThreePlayerAssignmentCatalog(catalogId) {
  return !!THREE_PLAYER_ASSIGNMENT_CATALOGS[asString(catalogId)];
}

function catalogIdOf(game) {
  return asString(
    (game && game.catalogId) ||
      (game && game.ruleId) ||
      (game && game.ruleSnapshot && game.ruleSnapshot.catalogId)
  );
}

function lookupFace(playerMap, id) {
  var sid = asString(id);
  if (!sid) return null;
  if (typeof playerMap === "function") {
    try {
      return playerMap(sid) || null;
    } catch (e) {
      return null;
    }
  }
  if (Array.isArray(playerMap)) {
    var i;
    for (i = 0; i < playerMap.length; i++) {
      var row = playerMap[i];
      if (!row) continue;
      if (asString(row.id) === sid || asString(row.playerId) === sid || asString(row.subjectId) === sid) {
        return row;
      }
    }
    return null;
  }
  if (playerMap && typeof playerMap === "object") {
    return playerMap[sid] || playerMap[id] || null;
  }
  return null;
}

function displayNameOf(playerMap, id) {
  var sid = asString(id);
  var face = lookupFace(playerMap, sid);
  var n = comboName.pickPublicName([
    face && face.displayName,
    face && face.name,
    face && face.matchNickname,
    face && face.nickname
  ]);
  if (n === sid) n = "";
  return n || "球员";
}

function emptySummary() {
  return {
    soloPlayerId: "",
    pairPlayerIds: [],
    soloName: "",
    pairNames: [],
    text: ""
  };
}

/**
 * @param {Array<{playerId?: string, side?: string}>} assignments
 * @param {object|Array|function} playerMap
 */
function buildThreePlayerAssignmentText(assignments, playerMap) {
  if (!Array.isArray(assignments) || !assignments.length) return emptySummary();
  var bySide = {};
  var sideOrder = [];
  assignments.forEach(function (row) {
    var side = asString(row && row.side);
    if (side !== "blue" && side !== "red") return;
    var pid = asString(row && row.playerId);
    if (!pid) return;
    if (!bySide[side]) {
      bySide[side] = [];
      sideOrder.push(side);
    }
    if (bySide[side].indexOf(pid) < 0) bySide[side].push(pid);
  });
  var soloIds = null;
  var pairIds = null;
  sideOrder.forEach(function (side) {
    var ids = bySide[side] || [];
    if (ids.length === 1) soloIds = ids;
    else if (ids.length === 2) pairIds = ids;
  });
  if (!soloIds || !pairIds) return emptySummary();
  var soloPlayerId = soloIds[0];
  var pairPlayerIds = pairIds.slice();
  var soloName = displayNameOf(playerMap, soloPlayerId);
  var pairNames = pairPlayerIds.map(function (pid) {
    return displayNameOf(playerMap, pid);
  });
  return {
    soloPlayerId: soloPlayerId,
    pairPlayerIds: pairPlayerIds,
    soloName: soloName,
    pairNames: pairNames,
    text: "单 " + soloName + " · 双 " + pairNames.join("/")
  };
}

function assignmentListForHole(game, label) {
  var key = asString(label);
  if (!key || !game) return null;
  var map =
    (game.holeResults && game.holeResults.assignmentsByHole) ||
    (game.resultSnapshot && game.resultSnapshot.assignmentsByHole) ||
    null;
  if (!map || typeof map !== "object") return null;
  if (!Object.prototype.hasOwnProperty.call(map, key)) return null;
  var list = map[key];
  return Array.isArray(list) ? list : null;
}

function summaryForHole(game, label, playerMap) {
  if (!isThreePlayerAssignmentCatalog(catalogIdOf(game))) return emptySummary();
  var list = assignmentListForHole(game, label);
  if (!list) return emptySummary();
  return buildThreePlayerAssignmentText(list, playerMap);
}

function assignmentTextForHole(game, label, playerMap) {
  return summaryForHole(game, label, playerMap).text || "";
}

module.exports = {
  THREE_PLAYER_ASSIGNMENT_CATALOGS: THREE_PLAYER_ASSIGNMENT_CATALOGS,
  isThreePlayerAssignmentCatalog: isThreePlayerAssignmentCatalog,
  buildThreePlayerAssignmentText: buildThreePlayerAssignmentText,
  summaryForHole: summaryForHole,
  assignmentTextForHole: assignmentTextForHole
};
