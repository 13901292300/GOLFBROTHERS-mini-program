/**
 * 记分页组成绩完整度投影（普通单场 / 队际 / Series 共用）。
 * 不遍历页面输入框；只根据持久化成绩与实际赛制/洞数判断必填格。
 */

var matchStatus = require('./matchStatus.js');
var strokeEntityValidator = require('./strokeEntityValidator.js');

var FRONT9 = [0, 1, 2, 3, 4, 5, 6, 7, 8];
var BACK9 = [9, 10, 11, 12, 13, 14, 15, 16, 17];
var ALL18 = FRONT9.concat(BACK9);

var EXEMPT_STATUS = {
  wd: true,
  withdrawn: true,
  dq: true,
  disqualified: true,
  dns: true,
  dnf: true,
  bye: true,
  cancelled: true,
  canceled: true,
  retired: true,
  ns: true,
  退赛: true,
  轮空: true,
  取消: true,
  免记: true
};

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function asLower(v) {
  return asString(v).toLowerCase();
}

/** 与现有记分格规则对齐：0 有效；空串/null 无效；占位符无效。不用 truthy。 */
function isFilledRequiredScore(s) {
  if (!matchStatus.isFilledScore(s)) return false;
  if (typeof s === 'string') {
    var t = s.trim();
    if (!t) return false;
    if (t === '-' || t === '--' || t === '—' || t === '*' || t === '/') return false;
    if (Number.isNaN(Number(t))) return false;
  }
  return true;
}

function isExemptStatus(raw) {
  var s = asString(raw);
  if (!s) return false;
  return !!(EXEMPT_STATUS[s] || EXEMPT_STATUS[asLower(s)]);
}

function isExemptUnit(unit) {
  if (!unit || typeof unit !== 'object') return false;
  if (
    unit.withdrawn === true ||
    unit.disqualified === true ||
    unit.scoreExempt === true ||
    unit.bye === true ||
    unit.exempt === true
  ) {
    return true;
  }
  return isExemptStatus(
    unit.scoreStatus || unit.resultStatus || unit.status || unit.finishStatus || unit.playerStatus
  );
}

function isExemptGroup(group) {
  if (!group || typeof group !== 'object') return false;
  return isExemptUnit(group);
}

function resolveRequiredHoleIndexes(host) {
  var src = host && typeof host === 'object' ? host : {};
  var nine = asLower(src.nineSide || src.playNine || src.nineHoles || src.scoringNine || src.nine);
  if (nine === 'front' || nine === 'out' || nine === '前九') return FRONT9.slice();
  if (nine === 'back' || nine === 'in' || nine === '后九') return BACK9.slice();
  var n = Number(src.requiredHoleCount != null ? src.requiredHoleCount : src.holeCount != null ? src.holeCount : src.holes);
  if (n === 9) return FRONT9.slice();
  return ALL18.slice();
}

function scoresCompleteAtHoles(scores, holeIndexes) {
  if (!Array.isArray(scores)) return false;
  var holes = Array.isArray(holeIndexes) ? holeIndexes : ALL18;
  for (var i = 0; i < holes.length; i++) {
    if (!isFilledRequiredScore(scores[holes[i]])) return false;
  }
  return true;
}

function playerIdOf(p) {
  return asString(p && (p.playerId || p.userId || p.id || p.openId));
}

function listPlayerScoreArrays(group, bucketScoresByPlayer) {
  var slots = [];
  if (group && Array.isArray(group.playersSlots) && group.playersSlots.length) {
    slots = group.playersSlots;
  } else if (group && Array.isArray(group.players) && group.players.length) {
    slots = group.players;
  }
  var map =
    bucketScoresByPlayer && typeof bucketScoresByPlayer === 'object' && !Array.isArray(bucketScoresByPlayer)
      ? bucketScoresByPlayer
      : (group && group.scoresByPlayer) || {};
  var out = [];
  for (var i = 0; i < slots.length; i++) {
    var p = slots[i];
    if (!p) continue;
    if (isExemptUnit(p)) continue;
    var pid = playerIdOf(p);
    if (!pid) continue;
    var rec = map[pid] || {};
    out.push({ kind: 'player', id: pid, scores: rec.scores, unit: p });
  }
  return out;
}

function listEntityScoreArrays(entities) {
  var list = Array.isArray(entities) ? entities : [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e || typeof e !== 'object') continue;
    if (isExemptUnit(e)) continue;
    var id = asString(e.teamId || e.entityId || e.id);
    if (!id) continue;
    out.push({ kind: 'entity', id: id, scores: e.scores, unit: e });
  }
  return out;
}

function listSideScoreArrays(scoresBySide) {
  if (!scoresBySide || typeof scoresBySide !== 'object' || Array.isArray(scoresBySide)) return [];
  var keys = Object.keys(scoresBySide);
  var out = [];
  for (var i = 0; i < keys.length; i++) {
    var rec = scoresBySide[keys[i]];
    if (!rec || typeof rec !== 'object') continue;
    if (isExemptUnit(rec)) continue;
    out.push({ kind: 'side', id: asString(rec.sideId || keys[i]), scores: rec.scores, unit: rec });
  }
  return out;
}

function resolveGameMode(host, group) {
  return strokeEntityValidator.resolveGameMode(host) || asString(group && group.gameMode);
}

function isOrdinaryTeamScoringMode(gameMode) {
  var m = asString(gameMode);
  return m === '最好成绩赛' || m === '最佳球位赛' || m === '四人两球赛';
}

function listScoringUnits(ctx) {
  var host = ctx && (ctx.match || ctx.game || ctx.host) ? ctx.match || ctx.game || ctx.host : ctx;
  var group = (ctx && ctx.group) || null;
  var bucket = (ctx && ctx.bucket) || null;
  if (!bucket && host && host.scoreData && group && group.groupId != null) {
    var gid = String(group.groupId);
    bucket =
      host.scoreData[gid] && typeof host.scoreData[gid] === 'object' ? host.scoreData[gid] : null;
  }
  if (!bucket && group) {
    bucket = {
      scoresByPlayer: group.scoresByPlayer,
      teamScoresByEntity: group.teamScoresByEntity,
      scoresBySide: group.scoresBySide
    };
  }
  bucket = bucket && typeof bucket === 'object' ? bucket : {};
  var mode = resolveGameMode(host, group);

  if (strokeEntityValidator.isG6G7MatchPlayMode(mode) || strokeEntityValidator.isG8MatchPlayMode(mode)) {
    var sides = listSideScoreArrays(bucket.scoresBySide);
    if (sides.length) return sides;
  }

  var useEntity =
    strokeEntityValidator.isG2G3FamilyMode(mode) ||
    strokeEntityValidator.isG4FamilyMode(mode) ||
    isOrdinaryTeamScoringMode(mode);
  if (useEntity && !strokeEntityValidator.isG6G7MatchPlayMode(mode) && !strokeEntityValidator.isG8MatchPlayMode(mode)) {
    var ents = listEntityScoreArrays(bucket.teamScoresByEntity);
    if (ents.length) return ents;
    ents = listEntityScoreArrays(group && group.teamScoresByEntity);
    if (ents.length) return ents;
    return [];
  }

  var sideFallback = listSideScoreArrays(bucket.scoresBySide);
  if (sideFallback.length) return sideFallback;
  var entityFallback = listEntityScoreArrays(bucket.teamScoresByEntity);
  if (entityFallback.length && useEntity) return entityFallback;

  return listPlayerScoreArrays(group, bucket.scoresByPlayer);
}

function projectGroupCompleteness(ctx) {
  var input = ctx && typeof ctx === 'object' ? ctx : {};
  var host = input.match || input.game || input.host || null;
  var group = input.group || null;
  var holes = resolveRequiredHoleIndexes(host);
  if (isExemptGroup(group)) {
    return {
      complete: true,
      exempt: true,
      holeIndexes: holes,
      unitCount: 0,
      filledUnitCount: 0
    };
  }
  var units = listScoringUnits(input);
  if (!units.length) {
    return {
      complete: false,
      exempt: false,
      holeIndexes: holes,
      unitCount: 0,
      filledUnitCount: 0
    };
  }
  var filled = 0;
  for (var i = 0; i < units.length; i++) {
    if (scoresCompleteAtHoles(units[i].scores, holes)) filled += 1;
  }
  return {
    complete: filled === units.length,
    exempt: false,
    holeIndexes: holes,
    unitCount: units.length,
    filledUnitCount: filled
  };
}

function isComplete(ctx) {
  return !!projectGroupCompleteness(ctx).complete;
}

function isGameGroupComplete(game, groupIndex) {
  if (!game) return false;
  var gi = groupIndex || 0;
  var group =
    game && Array.isArray(game.groups) && game.groups[gi]
      ? game.groups[gi]
      : {
          playersSlots: (game && game.playersSlots) || [],
          scoresByPlayer: (game && game.scoresByPlayer) || {},
          teamScoresByEntity: (game && game.teamScoresByEntity) || []
        };
  return isComplete({ game: game, group: group, host: game });
}

function buildHostKey(matchId, groupId) {
  return asString(matchId) + '|' + asString(groupId);
}

module.exports = {
  FRONT9: FRONT9,
  BACK9: BACK9,
  ALL18: ALL18,
  isFilledRequiredScore: isFilledRequiredScore,
  isFilledScore: isFilledRequiredScore,
  isExemptStatus: isExemptStatus,
  isExemptUnit: isExemptUnit,
  isExemptGroup: isExemptGroup,
  resolveRequiredHoleIndexes: resolveRequiredHoleIndexes,
  scoresCompleteAtHoles: scoresCompleteAtHoles,
  listScoringUnits: listScoringUnits,
  projectGroupCompleteness: projectGroupCompleteness,
  isComplete: isComplete,
  isGameGroupComplete: isGameGroupComplete,
  buildHostKey: buildHostKey
};
