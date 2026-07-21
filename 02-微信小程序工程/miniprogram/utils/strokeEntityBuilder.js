/**
 * Stroke Entity Phase1：由 groups + pairings + registerInfo + gameMode 生成 match.scoreEntities
 * G2/G3：委托 strokeCompositionResolver，每个 composition → 一个 entity
 * 不写成绩、不碰 scoreData.scoresByPlayer
 */

const {
  resolveGameMode,
  resolveStrokeKind,
  buildRegisterTeamMap,
  listFilledPlayers
} = require('./strokeEntityValidator.js');

const {
  resolveStrokeCompositions,
  resolveCompositionMode
} = require('./strokeCompositionResolver.js');

function buildStableGroupEntityId(matchId, groupId, seq) {
  const mid = matchId != null ? String(matchId).trim() : '';
  const gid = groupId != null ? String(groupId).trim() : '';
  const n = Number(seq) > 0 ? Math.floor(Number(seq)) : 1;
  return mid + '__' + gid + '__' + n;
}

/**
 * G2/G3：每个 group 调用 resolveStrokeCompositions，按返回顺序生成 entity
 * seq = resolver 返回下标 + 1（不用 Object.keys 排序）
 */
function buildG2G3Entities(match) {
  const out = {};
  const groups = Array.isArray(match && match.groups) ? match.groups : [];
  if (!groups.length) return out;

  const matchId = match && match.matchId != null ? String(match.matchId) : '';
  const compositionMode = resolveCompositionMode(match);

  groups.forEach((group) => {
    const groupId = group && group.groupId != null ? String(group.groupId) : '';
    if (!groupId) return;

    const compositions = resolveStrokeCompositions(match, group);
    if (!Array.isArray(compositions) || !compositions.length) return;

    const entities = compositions.map((combo, index) => {
      const members = Array.isArray(combo && combo.members)
        ? combo.members
            .map((m) => (m && m.userId != null ? String(m.userId).trim() : ''))
            .filter(Boolean)
        : [];
      return {
        entityId: buildStableGroupEntityId(matchId, groupId, index + 1),
        entityType: 'group',
        compositionMode: compositionMode,
        teamGroupId: combo && combo.teamId != null ? String(combo.teamId) : '',
        members: members
      };
    });

    if (entities.length) {
      out[groupId] = entities;
    }
  });

  return out;
}

function buildG4Entities(match) {
  const out = {};
  const groups = Array.isArray(match && match.groups) ? match.groups : [];
  if (!groups.length) return out;

  const pairings =
    match && match.pairings && typeof match.pairings === 'object' && !Array.isArray(match.pairings)
      ? match.pairings
      : {};
  const teamMap = buildRegisterTeamMap(match);

  groups.forEach((group) => {
    const groupId = group && group.groupId != null ? String(group.groupId) : '';
    if (!groupId) return;
    const list = Array.isArray(pairings[groupId]) ? pairings[groupId] : [];
    const entities = [];
    list.forEach((pairing) => {
      const pairingId = pairing && pairing.id != null ? String(pairing.id).trim() : '';
      if (!pairingId) return;
      const members = Array.isArray(pairing.playerIds)
        ? pairing.playerIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      if (members.length !== 2) return;
      const teamGroupId = teamMap[members[0]] || teamMap[members[1]] || '';
      entities.push({
        entityId: pairingId,
        entityType: 'pair',
        compositionMode: '',
        teamGroupId: teamGroupId ? String(teamGroupId) : '',
        members: members
      });
    });
    out[groupId] = entities;
  });

  return out;
}

/**
 * @param {object} match
 * @returns {object} scoreEntities map：{ [groupId]: Entity[] }；G1/其它赛制返回 {}
 */
function buildStrokeEntities(match) {
  const gameMode = resolveGameMode(match);
  const kind = resolveStrokeKind(gameMode);
  if (kind === 'g1' || kind === 'other') {
    return {};
  }
  if (kind === 'g2g3') {
    return buildG2G3Entities(match);
  }
  if (kind === 'g4') {
    return buildG4Entities(match);
  }
  return {};
}

module.exports = {
  buildStrokeEntities,
  buildStableGroupEntityId,
  buildG2G3Entities,
  buildG4Entities,
  listFilledPlayers
};
