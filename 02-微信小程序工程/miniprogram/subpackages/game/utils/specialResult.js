/**
 * PAR5 HIO 等 special-event 适配。
 * JSON 安全：不存 Infinity / -Infinity / NaN；"∞" 只用于展示。
 */
var KIND_NORMAL = "NORMAL";
var KIND_ALBATROSS_TIER = "ALBATROSS_TIER";
var KIND_PAR5_HIO_INFINITY = "PAR5_HIO_INFINITY";

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

function resolveGrossScoreSpecial(input) {
  input = input || {};
  var rel = Number(input.rel);
  var par = Number(input.par);
  if (!isFinite(rel)) return { kind: KIND_NORMAL };
  if (par !== 3 && par !== 4 && par !== 5) return { kind: KIND_NORMAL };
  if (rel + par !== 1) return { kind: KIND_NORMAL };
  if (par === 5) return { kind: KIND_PAR5_HIO_INFINITY };
  return { kind: KIND_ALBATROSS_TIER };
}

function asIdList(list) {
  var out = [];
  var i;
  for (i = 0; i < (list || []).length; i++) {
    var id = asId(list[i]);
    if (id) out.push(id);
  }
  return out;
}

function makePar5HioEvent(opts) {
  opts = opts || {};
  var matchup = opts.matchup && typeof opts.matchup === "object" ? opts.matchup : {};
  return {
    kind: "par5_hio",
    hole: String(opts.hole == null ? "" : opts.hole),
    plusIds: asIdList(opts.plusIds),
    minusIds: asIdList(opts.minusIds),
    matchup: {
      type: matchup.type ? String(matchup.type) : "pair",
      sideAIds: asIdList(matchup.sideAIds),
      sideBIds: asIdList(matchup.sideBIds)
    },
    meatAllEaten: opts.meatAllEaten !== false
  };
}

function netInfinitySign(plusCount, minusCount) {
  var plus = Number(plusCount) || 0;
  var minus = Number(minusCount) || 0;
  if (plus > minus) return 1;
  if (minus > plus) return -1;
  return 0;
}

function netInfinitySignForPlayer(specialByHole, playerId) {
  var bag = specialByHoleOf({ specialByHole: specialByHole });
  var plus = 0;
  var minus = 0;
  var holes = Object.keys(bag);
  var i;
  var j;
  for (i = 0; i < holes.length; i++) {
    var events = collectSpecialEvents(bag, holes[i]);
    for (j = 0; j < events.length; j++) {
      if (idListHas(events[j].plusIds, playerId)) plus += 1;
      if (idListHas(events[j].minusIds, playerId)) minus += 1;
    }
  }
  return netInfinitySign(plus, minus);
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
  KIND_NORMAL: KIND_NORMAL,
  KIND_ALBATROSS_TIER: KIND_ALBATROSS_TIER,
  KIND_PAR5_HIO_INFINITY: KIND_PAR5_HIO_INFINITY,
  asInfSign: asInfSign,
  specialByHoleOf: specialByHoleOf,
  collectSpecialEvents: collectSpecialEvents,
  infSignForPlayer: infSignForPlayer,
  resolvePlayerInfinitySign: resolvePlayerInfinitySign,
  resolveGrossScoreSpecial: resolveGrossScoreSpecial,
  makePar5HioEvent: makePar5HioEvent,
  netInfinitySign: netInfinitySign,
  netInfinitySignForPlayer: netInfinitySignForPlayer,
  liveSnapshotEqual: liveSnapshotEqual,
  infText: infText
};
