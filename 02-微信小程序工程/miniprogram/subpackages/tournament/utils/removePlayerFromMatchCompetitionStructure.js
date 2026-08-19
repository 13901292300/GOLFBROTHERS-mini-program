/**
 * REG-P3-A：从单个 match 的竞赛结构中移除一名球员（纯函数）
 * 复用普通单场 clearUserFromFormalGroups / clearUserFromPairings。
 * 只处理单个 match 内存对象：不落盘、不碰 Series、不扫多轮。
 */

const teamMatchStore = require('../../../utils/teamMatchStore.js');

const BLOCKED_PLAYER_HAS_REAL_SCORE = 'player_has_real_score';

function emptySummary() {
  return {
    groupsCleared: 0,
    playersSlotsCleared: 0,
    pairingsCleared: 0,
    entitiesCleared: 0
  };
}

function unchangedResult(match) {
  return {
    match: match,
    changed: false,
    summary: emptySummary(),
    blockedReason: ''
  };
}

function cloneMatch(match) {
  return JSON.parse(JSON.stringify(match));
}

function asId(raw) {
  return raw == null ? '' : String(raw).trim();
}

function resolveSlotPlayerId(player) {
  if (player == null) return '';
  if (typeof player === 'string' || typeof player === 'number') {
    return String(player).trim();
  }
  if (typeof player !== 'object') return '';
  const id = player.userId || player.playerId || player.id;
  return id != null ? String(id).trim() : '';
}

function memberMatches(member, uid) {
  if (!uid) return false;
  if (member == null) return false;
  if (typeof member === 'string' || typeof member === 'number') {
    return String(member).trim() === uid;
  }
  if (typeof member !== 'object') return false;
  return (
    asId(member.userId) === uid ||
    asId(member.playerId) === uid ||
    asId(member.id) === uid
  );
}

function hasMeaningfulScores(rec) {
  if (!rec || typeof rec !== 'object') return false;
  const scores = rec.scores;
  if (!Array.isArray(scores) || !scores.length) return false;
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    if (s == null || s === '') continue;
    if (typeof s === 'number' && isNaN(s)) continue;
    return true;
  }
  return false;
}

function collectScoreDataBuckets(match) {
  const scoreData = match && match.scoreData;
  if (!scoreData || typeof scoreData !== 'object' || Array.isArray(scoreData)) return [];
  const out = [];
  Object.keys(scoreData).forEach((key) => {
    const bucket = scoreData[key];
    if (bucket && typeof bucket === 'object' && !Array.isArray(bucket)) out.push(bucket);
  });
  return out;
}

function playerHasPersonalScore(match, uid) {
  const buckets = collectScoreDataBuckets(match);
  for (let i = 0; i < buckets.length; i++) {
    const byPlayer = buckets[i].scoresByPlayer;
    if (!byPlayer || typeof byPlayer !== 'object' || Array.isArray(byPlayer)) continue;
    if (hasMeaningfulScores(byPlayer[uid])) return true;
    const keys = Object.keys(byPlayer);
    for (let k = 0; k < keys.length; k++) {
      if (asId(keys[k]) === uid && hasMeaningfulScores(byPlayer[keys[k]])) return true;
    }
  }
  return false;
}

function entityHasRealScore(match, entityId) {
  const eid = asId(entityId);
  if (!eid) return false;
  const buckets = collectScoreDataBuckets(match);
  for (let i = 0; i < buckets.length; i++) {
    const rows = buckets[i].teamScoresByEntity;
    if (!Array.isArray(rows)) continue;
    for (let r = 0; r < rows.length; r++) {
      const rec = rows[r];
      if (!rec) continue;
      const recId = asId(rec.teamId || rec.entityId || rec.id);
      if (recId === eid && hasMeaningfulScores(rec)) return true;
    }
  }
  return false;
}

function playerHasEntityScore(match, uid) {
  const catalog = match && match.scoreEntities;
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) return false;
  const groupIds = Object.keys(catalog);
  for (let i = 0; i < groupIds.length; i++) {
    const list = catalog[groupIds[i]];
    if (!Array.isArray(list)) continue;
    for (let j = 0; j < list.length; j++) {
      const entity = list[j];
      if (!entity || !Array.isArray(entity.members)) continue;
      const hit = entity.members.some((m) => memberMatches(m, uid));
      if (hit && entityHasRealScore(match, entity.entityId)) return true;
    }
  }
  return false;
}

function playerHasRealScore(match, uid) {
  return playerHasPersonalScore(match, uid) || playerHasEntityScore(match, uid);
}

function inspectStructure(match, uid) {
  const summary = emptySummary();
  const groups = Array.isArray(match && match.groups) ? match.groups : [];
  groups.forEach((g) => {
    if (!g) return;
    if (Array.isArray(g.players) && g.players.some((p) => resolveSlotPlayerId(p) === uid)) {
      summary.groupsCleared += 1;
    }
    if (Array.isArray(g.playersSlots)) {
      g.playersSlots.forEach((p) => {
        if (resolveSlotPlayerId(p) === uid) summary.playersSlotsCleared += 1;
      });
    }
  });
  if (Array.isArray(match && match.playersSlots)) {
    match.playersSlots.forEach((p) => {
      if (resolveSlotPlayerId(p) === uid) summary.playersSlotsCleared += 1;
    });
  }
  const pairings =
    match && match.pairings && typeof match.pairings === 'object' && !Array.isArray(match.pairings)
      ? match.pairings
      : {};
  Object.keys(pairings).forEach((gid) => {
    const list = Array.isArray(pairings[gid]) ? pairings[gid] : [];
    list.forEach((row) => {
      const ids = row && Array.isArray(row.playerIds) ? row.playerIds : [];
      if (ids.some((id) => asId(id) === uid)) summary.pairingsCleared += 1;
    });
  });
  const catalog = match && match.scoreEntities;
  if (catalog && typeof catalog === 'object' && !Array.isArray(catalog)) {
    Object.keys(catalog).forEach((gid) => {
      const list = Array.isArray(catalog[gid]) ? catalog[gid] : [];
      list.forEach((entity) => {
        const members = entity && Array.isArray(entity.members) ? entity.members : [];
        if (members.some((m) => memberMatches(m, uid))) summary.entitiesCleared += 1;
      });
    });
  }
  const hasAny =
    summary.groupsCleared +
      summary.playersSlotsCleared +
      summary.pairingsCleared +
      summary.entitiesCleared >
    0;
  return { summary: summary, hasAny: hasAny };
}

function clearSlotList(list, uid) {
  return (Array.isArray(list) ? list : []).map((p) => {
    if (resolveSlotPlayerId(p) !== uid) return p;
    if (typeof p === 'string' || typeof p === 'number') return '';
    const next = Object.assign({}, p);
    next.userId = '';
    if (Object.prototype.hasOwnProperty.call(next, 'playerId')) next.playerId = '';
    if (Object.prototype.hasOwnProperty.call(next, 'id') && String(next.id) === uid) {
      next.id = '';
    }
    return next;
  });
}

function clearUserFromPlayersSlots(match, uid) {
  if (!match || !uid) return match;
  if (Array.isArray(match.playersSlots)) {
    match.playersSlots = clearSlotList(match.playersSlots, uid);
  }
  if (!Array.isArray(match.groups)) return match;
  match.groups = match.groups.map((g) => {
    if (!g || !Array.isArray(g.playersSlots)) return g;
    return Object.assign({}, g, { playersSlots: clearSlotList(g.playersSlots, uid) });
  });
  return match;
}

function clearUserFromScoreEntities(match, uid) {
  const catalog = match && match.scoreEntities;
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) return match;
  Object.keys(catalog).forEach((gid) => {
    const list = catalog[gid];
    if (!Array.isArray(list)) return;
    catalog[gid] = list.map((entity) => {
      if (!entity || !Array.isArray(entity.members)) return entity;
      const nextMembers = entity.members.filter((m) => !memberMatches(m, uid));
      if (nextMembers.length === entity.members.length) return entity;
      return Object.assign({}, entity, { members: nextMembers });
    });
  });
  return match;
}

function removePlayerFromMatchCompetitionStructure(match, playerId) {
  const uid = asId(playerId);
  if (!match || typeof match !== 'object' || !uid) {
    return unchangedResult(match);
  }
  if (playerHasRealScore(match, uid)) {
    return {
      match: match,
      changed: false,
      summary: emptySummary(),
      blockedReason: BLOCKED_PLAYER_HAS_REAL_SCORE
    };
  }
  const preview = inspectStructure(match, uid);
  if (!preview.hasAny) {
    return unchangedResult(match);
  }
  const next = cloneMatch(match);
  teamMatchStore.clearUserFromFormalGroups(next, uid);
  teamMatchStore.clearUserFromPairings(next, uid);
  clearUserFromPlayersSlots(next, uid);
  clearUserFromScoreEntities(next, uid);
  return {
    match: next,
    changed: true,
    summary: preview.summary,
    blockedReason: ''
  };
}

module.exports = {
  BLOCKED_PLAYER_HAS_REAL_SCORE: BLOCKED_PLAYER_HAS_REAL_SCORE,
  removePlayerFromMatchCompetitionStructure: removePlayerFromMatchCompetitionStructure
};
