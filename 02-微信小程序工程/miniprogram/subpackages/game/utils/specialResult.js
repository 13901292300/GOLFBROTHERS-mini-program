/**
 * PAR5 HIO 等 special-event 适配（Phase 0）。
 * 不产生事件、不改 settle。只读 specialByHole 快照，JSON 安全。
 */
function asId(v) {
  return v == null ? "" : String(v);
}

function asInfSign(v) {
  var n = Number(v);
  if (n === 1) return 1;
  if (n === -1) return -1;
  return 0;
}

function specialByHoleOf(source) {
  if (!source || typeof source !== "object") return {};
  var bag = source.specialByHole;
  if (!bag || typeof bag !== "object" || Array.isArray(bag)) return {};
  return bag;
}

function collectSpecialEvents(specialByHole, holeLabel) {
  var bag = specialByHoleOf({ specialByHole: specialByHole });
  var raw = bag[String(holeLabel == null ? "" : holeLabel)];
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter(function (item) {
      return item && typeof item === "object";
    });
  }
  if (typeof raw === "object") return [raw];
  return [];
}

function idListHas(list, playerId) {
  var want = asId(playerId);
  if (!want) return false;
  var i;
  for (i = 0; i < (list || []).length; i++) {
    if (asId(list[i]) === want) return true;
  }
  return false;
}

function infSignFromEvent(event, playerId) {
  if (!event || typeof event !== "object") return 0;
  if (idListHas(event.plusIds, playerId)) return 1;
  if (idListHas(event.minusIds, playerId)) return -1;
  return 0;
}

function infSignForPlayer(specialByHole, holeLabel, playerId) {
  var events = collectSpecialEvents(specialByHole, holeLabel);
  var i;
  var sign = 0;
  for (i = 0; i < events.length; i++) {
    var next = infSignFromEvent(events[i], playerId);
    if (next === 1 || next === -1) {
      if (!sign) sign = next;
      else if (sign !== next) return 0;
    }
  }
  return sign;
}

function resolvePlayerInfinitySign(specialByHole, playerId, holeLabel) {
  return infSignForPlayer(specialByHole, holeLabel, playerId);
}

function liveSnapshotEqual(prev, next) {
  var a = prev && typeof prev === "object" ? prev : {};
  var b = next && typeof next === "object" ? next : {};
  return (
    JSON.stringify(a.byHole || {}) === JSON.stringify(b.byHole || {}) &&
    JSON.stringify(a.specialByHole || {}) === JSON.stringify(b.specialByHole || {})
  );
}

function infText(infSign) {
  var s = asInfSign(infSign);
  if (s === 1) return "∞";
  if (s === -1) return "-∞";
  return "";
}

module.exports = {
  asInfSign: asInfSign,
  specialByHoleOf: specialByHoleOf,
  collectSpecialEvents: collectSpecialEvents,
  infSignForPlayer: infSignForPlayer,
  resolvePlayerInfinitySign: resolvePlayerInfinitySign,
  liveSnapshotEqual: liveSnapshotEqual,
  infText: infText
};
