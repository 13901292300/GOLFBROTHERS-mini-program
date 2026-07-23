/**
 * Stroke Entity：成绩行（score row）生成与合并
 * - entityId 一旦产生不因成员清空而消失
 * - G2/G3：position → slot → entityId；禁止 composition index
 * - 合并：仅按 entityId upsert；禁止成员相似度匹配
 * - 不写成绩、不碰 scoreData
 */

const {
  resolveGameMode,
  resolveStrokeKind,
  buildRegisterTeamMap
} = require('./strokeEntityValidator.js');

const { resolveCompositionMode } = require('./strokeCompositionResolver.js');

function buildStableGroupEntityId(matchId, groupId, seq) {
  const mid = matchId != null ? String(matchId).trim() : '';
  const gid = groupId != null ? String(groupId).trim() : '';
  const n = Number(seq) > 0 ? Math.floor(Number(seq)) : 1;
  return mid + '__' + gid + '__' + n;
}

function normalizeMemberIds(members) {
  if (!Array.isArray(members)) return [];
  return members
    .map((m) => {
      if (m == null) return '';
      if (typeof m === 'string' || typeof m === 'number') return String(m).trim();
      return m.userId != null ? String(m.userId).trim() : '';
    })
    .filter(Boolean);
}

function cloneEntity(entity) {
  if (!entity || typeof entity !== 'object') return null;
  const entityId = entity.entityId != null ? String(entity.entityId).trim() : '';
  if (!entityId) return null;
  return {
    entityId: entityId,
    entityType: entity.entityType != null ? String(entity.entityType) : '',
    compositionMode: entity.compositionMode != null ? String(entity.compositionMode) : '',
    teamGroupId: entity.teamGroupId != null ? String(entity.teamGroupId) : '',
    members: normalizeMemberIds(entity.members)
  };
}

function parseG2G3Seq(entityId, groupId) {
  const id = entityId != null ? String(entityId) : '';
  const gid = groupId != null ? String(groupId) : '';
  const suffix = gid ? '__' + gid + '__' : '__';
  const idx = id.lastIndexOf(suffix);
  if (idx >= 0) {
    const n = parseInt(id.slice(idx + suffix.length), 10);
    if (n >= 1) return n;
  }
  const m = /__(\d+)$/.exec(id);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1) return n;
  }
  return 0;
}

/** position 1–4 → userId（空座不入表） */
function mapUserIdByPosition(group) {
  const byPos = {};
  const players = Array.isArray(group && group.players) ? group.players : [];
  players.forEach((p) => {
    const pos = Number(p && (p.position != null ? p.position : p.slotIndex)) || 0;
    if (pos < 1 || pos > 4) return;
    const uid = p && p.userId != null ? String(p.userId).trim() : '';
    if (!uid) return;
    byPos[pos] = uid;
  });
  return byPos;
}

function membersFromPositions(byPos, positions) {
  const out = [];
  (positions || []).forEach((pos) => {
    const uid = byPos[pos];
    if (uid) out.push(uid);
  });
  return out;
}

function resolveTeamGroupIdForMembers(members, teamMap) {
  for (let i = 0; i < (members || []).length; i++) {
    const tid = teamMap[members[i]];
    if (tid) return String(tid);
  }
  return '';
}

function makeG2G3Entity(matchId, groupId, seq, members, compositionMode, teamMap) {
  const memberIds = normalizeMemberIds(members);
  return {
    entityId: buildStableGroupEntityId(matchId, groupId, seq),
    entityType: 'group',
    compositionMode: compositionMode,
    teamGroupId: resolveTeamGroupIdForMembers(memberIds, teamMap),
    members: memberIds
  };
}

/**
 * G2/G3：position → slot → entityId（禁止 composition 数组下标）
 * - 4+0：pos 1–4 → __1；首次全空可不生成
 * - 2+2：pos 1+2 → __1，pos 3+4 → __2；空 slot 也输出 members=[]
 */
function buildG2G3Entities(match) {
  const out = {};
  const groups = Array.isArray(match && match.groups) ? match.groups : [];
  if (!groups.length) return out;

  const matchId = match && match.matchId != null ? String(match.matchId) : '';
  const compositionMode = resolveCompositionMode(match);
  const teamMap = buildRegisterTeamMap(match);

  groups.forEach((group) => {
    const groupId = group && group.groupId != null ? String(group.groupId) : '';
    if (!groupId) return;

    const byPos = mapUserIdByPosition(group);

    if (compositionMode === '2+2') {
      out[groupId] = [
        makeG2G3Entity(
          matchId,
          groupId,
          1,
          membersFromPositions(byPos, [1, 2]),
          compositionMode,
          teamMap
        ),
        makeG2G3Entity(
          matchId,
          groupId,
          2,
          membersFromPositions(byPos, [3, 4]),
          compositionMode,
          teamMap
        )
      ];
      return;
    }

    // 4+0：仅 __1；全空则不输出（已有行由 merge 保留并清空 members）
    const membersAll = membersFromPositions(byPos, [1, 2, 3, 4]);
    if (!membersAll.length) {
      out[groupId] = [];
      return;
    }
    out[groupId] = [
      makeG2G3Entity(matchId, groupId, 1, membersAll, compositionMode, teamMap)
    ];
  });

  return out;
}

/**
 * G4：每个 pairing（含空 playerIds）→ 一个成绩行
 * slot id = entityId；members 可为空（不改 slot 设计）
 */
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
      const teamGroupId =
        (members[0] && teamMap[members[0]]) || (members[1] && teamMap[members[1]]) || '';
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

function sortG4Entities(list) {
  return (list || []).slice().sort((a, b) => {
    const idA = a && a.entityId != null ? String(a.entityId) : '';
    const idB = b && b.entityId != null ? String(b.entityId) : '';
    const mA = /__slot(\d+)$/.exec(idA);
    const mB = /__slot(\d+)$/.exec(idB);
    const nA = mA ? parseInt(mA[1], 10) : 0;
    const nB = mB ? parseInt(mB[1], 10) : 0;
    if (nA && nB && nA !== nB) return nA - nB;
    return idA.localeCompare(idB);
  });
}

function sortG2G3Entities(list, groupId) {
  return (list || []).slice().sort((a, b) => {
    const sa = parseG2G3Seq(a && a.entityId, groupId);
    const sb = parseG2G3Seq(b && b.entityId, groupId);
    if (sa && sb && sa !== sb) return sa - sb;
    const idA = a && a.entityId != null ? String(a.entityId) : '';
    const idB = b && b.entityId != null ? String(b.entityId) : '';
    return idA.localeCompare(idB);
  });
}

/**
 * 统一按 entityId 合并成绩行（G2/G3/G4）
 * - existing 为底：不因空 members 删除
 * - desired 有同 id：只 patch members 及非成绩字段
 * - desired 新 id：新增
 * - existing 有、desired 无：保留，members=[]
 */
function mergeEntitiesById(existingList, desiredList, sortFn) {
  const byId = {};
  (existingList || []).forEach((raw) => {
    const e = cloneEntity(raw);
    if (e) byId[e.entityId] = e;
  });

  const desiredIds = {};
  (desiredList || []).forEach((raw) => {
    const d = cloneEntity(raw);
    if (!d) return;
    desiredIds[d.entityId] = true;
    if (byId[d.entityId]) {
      byId[d.entityId] = Object.assign({}, byId[d.entityId], {
        members: d.members.slice(),
        teamGroupId: d.teamGroupId,
        entityType: d.entityType || byId[d.entityId].entityType,
        compositionMode:
          d.compositionMode != null && d.compositionMode !== ''
            ? d.compositionMode
            : byId[d.entityId].compositionMode != null
              ? byId[d.entityId].compositionMode
              : d.compositionMode
      });
    } else {
      byId[d.entityId] = d;
    }
  });

  Object.keys(byId).forEach((id) => {
    if (!desiredIds[id]) {
      byId[id] = Object.assign({}, byId[id], { members: [], teamGroupId: '' });
    }
  });

  const list = Object.keys(byId).map((id) => byId[id]);
  return typeof sortFn === 'function' ? sortFn(list) : list;
}

/** G4：复用统一 mergeEntitiesById */
function mergeG4GroupEntities(existingList, desiredList) {
  return mergeEntitiesById(existingList, desiredList, sortG4Entities);
}

/**
 * 将期望占用合并进已有成绩行：不删已有 entityId
 * @param {object} existingMap match.scoreEntities
 * @param {object} desiredMap buildG2G3Entities / buildG4Entities 结果
 * @param {{ kind: string, matchId?: string }} options
 */
function mergeStrokeEntities(existingMap, desiredMap, options) {
  const opts = options || {};
  const kind = opts.kind || '';
  const existing =
    existingMap && typeof existingMap === 'object' && !Array.isArray(existingMap) ? existingMap : {};
  const desired =
    desiredMap && typeof desiredMap === 'object' && !Array.isArray(desiredMap) ? desiredMap : {};

  const groupIds = {};
  Object.keys(existing).forEach((g) => {
    groupIds[String(g)] = true;
  });
  Object.keys(desired).forEach((g) => {
    groupIds[String(g)] = true;
  });

  const out = {};
  Object.keys(groupIds).forEach((groupId) => {
    const exList = Array.isArray(existing[groupId]) ? existing[groupId] : [];
    const deList = Array.isArray(desired[groupId]) ? desired[groupId] : [];
    if (kind === 'g4') {
      const merged = mergeG4GroupEntities(exList, deList);
      if (merged.length) out[groupId] = merged;
      return;
    }
    if (kind === 'g2g3') {
      const merged = mergeEntitiesById(exList, deList, (list) =>
        sortG2G3Entities(list, groupId)
      );
      if (merged.length) out[groupId] = merged;
    }
  });
  return out;
}

/**
 * 从当前 groups/pairings 计算期望占用，再与已有 scoreEntities 合并
 */
function syncStrokeEntities(match) {
  const gameMode = resolveGameMode(match);
  const kind = resolveStrokeKind(gameMode);
  if (kind === 'g1' || kind === 'other') {
    return {};
  }
  const desired = kind === 'g4' ? buildG4Entities(match) : buildG2G3Entities(match);
  const existing =
    match && match.scoreEntities && typeof match.scoreEntities === 'object' && !Array.isArray(match.scoreEntities)
      ? match.scoreEntities
      : {};
  const matchId = match && match.matchId != null ? String(match.matchId) : '';
  return mergeStrokeEntities(existing, desired, { kind: kind, matchId: matchId });
}

/**
 * @param {object} match
 * @returns {object} scoreEntities map：{ [groupId]: Entity[] }；G1/其它赛制返回 {}
 * @deprecated 新保存路径请用 syncStrokeEntities（保留已有行）
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
  syncStrokeEntities,
  mergeStrokeEntities,
  mergeEntitiesById,
  buildStableGroupEntityId,
  buildG2G3Entities,
  buildG4Entities
};
