/**
 * Stroke Entity Phase1：分组是否符合 Entity 生成规则（仅校验，不写盘）
 * G2/G3：只依据组内球员所属分队结构；analyzeGroupComposition 仍供 builder 使用
 */

const { resolveCompositionMode } = require('./strokeCompositionResolver.js');

const G1_MODES = {
  个人比杆赛: true
};

const G2_G3_MODES = {
  最好成绩比杆赛: true,
  四人四球比杆赛: true, // 产品现用名，与 G2 最好成绩同规则
  最佳球位比杆赛: true
};

const G4_MODES = {
  四人两球比杆赛: true
};

const ALLOWED_GROUP_COMPOSITIONS = {
  '4+0': true,
  '2+2': true,
  '2+1': true,
  '1+2': true,
  '1+1': true
};

function resolveGameMode(match) {
  return String((match && (match.gameMode || match.selectedGameMode)) || '').trim();
}

function resolveStrokeKind(gameMode) {
  if (G1_MODES[gameMode]) return 'g1';
  if (G2_G3_MODES[gameMode]) return 'g2g3';
  if (G4_MODES[gameMode]) return 'g4';
  return 'other';
}

/**
 * 读取比赛声明的组合模式；未声明则返回 ''
 * @returns {''|'4+0'|'2+2'}
 */
function resolveDeclaredCompositionMode(match) {
  const raw =
    match && match.strokeCompositionMode != null
      ? String(match.strokeCompositionMode).trim()
      : '';
  if (raw === '4+0' || raw === '2+2') return raw;
  return '';
}

function resolveUserId(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
  const id = raw.userId || raw.playerId || raw.id;
  return id != null ? String(id).trim() : '';
}

function buildRegisterTeamMap(match) {
  const users =
    match && match.registerInfo && Array.isArray(match.registerInfo.users)
      ? match.registerInfo.users
      : [];
  const map = {};
  users.forEach((user) => {
    const uid = resolveUserId(user);
    if (!uid) return;
    const teamId =
      user.matchTeamId != null && String(user.matchTeamId).trim() !== ''
        ? String(user.matchTeamId).trim()
        : user.groupId != null && String(user.groupId).trim() !== ''
          ? String(user.groupId).trim()
          : '';
    if (teamId) map[uid] = teamId;
  });
  return map;
}

function listFilledPlayers(group) {
  const players = Array.isArray(group && group.players) ? group.players : [];
  return players
    .map((p) => ({
      userId: resolveUserId(p),
      position: Number(p && (p.position != null ? p.position : p.slotIndex)) || 0
    }))
    .filter((p) => p.userId)
    .sort((a, b) => a.position - b.position || String(a.userId).localeCompare(String(b.userId)));
}

/**
 * 按报名分队桶分当前组球员（供 builder / 旧 analyze 使用）
 * @returns {{ ok: boolean, buckets?: object, filled?: array, teamCount?: number, reason?: string }}
 */
function bucketGroupByTeam(group, teamMap) {
  const filled = listFilledPlayers(group);
  if (!filled.length) {
    return { ok: false, reason: 'empty_group' };
  }

  const buckets = {};
  for (let i = 0; i < filled.length; i++) {
    const uid = filled[i].userId;
    const teamId = teamMap[uid] || '';
    if (!teamId) {
      return { ok: false, reason: 'player_missing_team:' + uid };
    }
    if (!buckets[teamId]) buckets[teamId] = [];
    buckets[teamId].push(uid);
  }

  const teamIds = Object.keys(buckets);
  if (teamIds.length > 2) {
    return { ok: false, reason: 'too_many_teams' };
  }

  return {
    ok: true,
    buckets: buckets,
    filled: filled,
    teamCount: teamIds.length
  };
}

/**
 * 旧推断（供 strokeEntityBuilder 使用；G2/G3 校验入口已不再走此路径）
 * @returns {{ ok: boolean, compositionMode?: string, buckets?: object, filled?: array, reason?: string }}
 */
function analyzeGroupComposition(group, teamMap) {
  const bucketed = bucketGroupByTeam(group, teamMap);
  if (!bucketed.ok) {
    return { ok: false, reason: bucketed.reason || 'g2g3_invalid' };
  }

  const buckets = bucketed.buckets;
  const filled = bucketed.filled;
  const teamIds = Object.keys(buckets);

  const counts = teamIds
    .map((id) => buckets[id].length)
    .sort((a, b) => b - a);

  let compositionMode = '';
  if (teamIds.length === 1) {
    if (counts[0] < 1 || counts[0] > 4) {
      return { ok: false, reason: 'single_team_count' };
    }
    compositionMode = '4+0';
  } else {
    const a = counts[0];
    const b = counts[1];
    if (a > 2 || b > 2) {
      return { ok: false, reason: 'illegal_split:' + a + '+' + b };
    }
    if ((a === 3 && b === 1) || (a === 1 && b === 3)) {
      return { ok: false, reason: 'illegal_3_1' };
    }
    if (a === 2 && b === 2) compositionMode = '2+2';
    else if (a === 2 && b === 1) compositionMode = '2+1';
    else if (a === 1 && b === 2) compositionMode = '1+2';
    else if (a === 1 && b === 1) compositionMode = '1+1';
    else compositionMode = a + '+' + b;
  }

  if (!ALLOWED_GROUP_COMPOSITIONS[compositionMode]) {
    return { ok: false, reason: 'composition_not_allowed:' + compositionMode };
  }

  return { ok: true, compositionMode: compositionMode, buckets: buckets, filled: filled };
}

/**
 * 单组 G2/G3：只依据组内球员所属分队结构（不读 position / resolver 组合结果）
 * @returns {{ ok: boolean, reason?: string }}
 */
function validateG2G3GroupWithResolver(match, group) {
  const groupId = group && group.groupId != null ? String(group.groupId) : '';
  if (!groupId) {
    return { ok: false, reason: 'missing_groupId' };
  }

  const filled = listFilledPlayers(group);
  if (!filled.length) {
    return { ok: false, reason: 'empty_group' };
  }

  const teamMap = buildRegisterTeamMap(match);
  const buckets = {};
  for (let i = 0; i < filled.length; i++) {
    const uid = filled[i].userId;
    const teamId = teamMap[uid] || '';
    if (!teamId) {
      return { ok: false, reason: 'player_missing_team:' + uid };
    }
    if (!buckets[teamId]) buckets[teamId] = [];
    buckets[teamId].push(uid);
  }

  const teamIds = Object.keys(buckets);
  const teamCount = teamIds.length;
  const mode = resolveCompositionMode(match);

  if (mode === '4+0') {
    // 4+0：组内必须同一分队
    if (teamCount !== 1) {
      return { ok: false, reason: '4_0_multi_team' };
    }
    return { ok: true };
  }

  // 2+2：按分队数量与各队人数判断
  if (teamCount === 1) {
    return { ok: true };
  }
  if (teamCount === 2) {
    for (let i = 0; i < teamIds.length; i++) {
      if (buckets[teamIds[i]].length >= 3) {
        return { ok: false, reason: '2_2_team_size:' + buckets[teamIds[i]].length };
      }
    }
    return { ok: true };
  }

  // 3 个及以上分队
  return { ok: false, reason: 'too_many_teams:' + teamCount };
}

function validateG2G3(match) {
  const groups = Array.isArray(match && match.groups) ? match.groups : [];
  if (!groups.length) {
    return { valid: true };
  }
  for (let i = 0; i < groups.length; i++) {
    const checked = validateG2G3GroupWithResolver(match, groups[i]);
    if (!checked.ok) {
      return { valid: false, reason: checked.reason || 'g2g3_invalid' };
    }
  }
  return { valid: true };
}

function validateG4(match) {
  const groups = Array.isArray(match && match.groups) ? match.groups : [];
  if (!groups.length) {
    return { valid: true };
  }
  const pairings =
    match && match.pairings && typeof match.pairings === 'object' && !Array.isArray(match.pairings)
      ? match.pairings
      : {};
  const teamMap = buildRegisterTeamMap(match);

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const groupId = group && group.groupId != null ? String(group.groupId) : '';
    if (!groupId) {
      return { valid: false, reason: 'missing_groupId' };
    }
    const filled = listFilledPlayers(group);
    // 空组允许，不参与非法判断
    if (!filled.length) {
      continue;
    }

    const n = filled.length;
    if (n !== 2 && n !== 4) {
      return { valid: false, reason: 'g4_player_count:' + n };
    }

    // 分队结构：所有人必须有分队归属
    const buckets = {};
    for (let f = 0; f < filled.length; f++) {
      const uid = filled[f].userId;
      const teamId = teamMap[uid] || '';
      if (!teamId) {
        return { valid: false, reason: 'g4_player_missing_team:' + uid };
      }
      if (!buckets[teamId]) buckets[teamId] = [];
      buckets[teamId].push(uid);
    }
    const teamIds = Object.keys(buckets);
    if (n === 2) {
      // 2 人组：必须同一分队
      if (teamIds.length !== 1) {
        return { valid: false, reason: 'g4_2_cross_team' };
      }
    } else {
      // 4 人组：单分队，或两个分队且 2+2
      if (teamIds.length === 1) {
        // ok
      } else if (teamIds.length === 2) {
        if (buckets[teamIds[0]].length !== 2 || buckets[teamIds[1]].length !== 2) {
          return { valid: false, reason: 'g4_illegal_split' };
        }
      } else {
        return { valid: false, reason: 'g4_too_many_teams:' + teamIds.length };
      }
    }

    const list = Array.isArray(pairings[groupId]) ? pairings[groupId] : [];
    // 允许空成绩行槽位（playerIds=[]）；占用组合仍须合法
    const occupied = [];
    for (let p = 0; p < list.length; p++) {
      const pairing = list[p];
      const pairingId = pairing && pairing.id != null ? String(pairing.id).trim() : '';
      if (!pairingId) {
        return { valid: false, reason: 'g4_missing_pairing_id' };
      }
      const ids = Array.isArray(pairing.playerIds)
        ? pairing.playerIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      if (ids.length === 0) {
        // 空成绩行：保留 slot，不参与占用校验
        continue;
      }
      occupied.push({ pairingId: pairingId, ids: ids });
    }

    const expectedPairs = n / 2;
    if (!occupied.length) {
      return { valid: false, reason: 'g4_missing_pairings:' + groupId };
    }
    if (occupied.length !== expectedPairs) {
      return { valid: false, reason: 'g4_pairing_count' };
    }

    const covered = {};
    for (let p = 0; p < occupied.length; p++) {
      const ids = occupied[p].ids;
      if (ids.length !== 2) {
        return { valid: false, reason: 'g4_pair_size:' + ids.length };
      }
      if (ids[0] === ids[1]) {
        return { valid: false, reason: 'g4_duplicate_member' };
      }
      const teamA = teamMap[ids[0]] || '';
      const teamB = teamMap[ids[1]] || '';
      if (!teamA || !teamB || teamA !== teamB) {
        return { valid: false, reason: 'g4_pair_cross_team' };
      }
      for (let k = 0; k < ids.length; k++) {
        if (covered[ids[k]]) {
          return { valid: false, reason: 'g4_player_multi_pair' };
        }
        covered[ids[k]] = true;
      }
    }

    for (let f = 0; f < filled.length; f++) {
      if (!covered[filled[f].userId]) {
        return { valid: false, reason: 'g4_player_not_in_pair:' + filled[f].userId };
      }
    }
  }
  return { valid: true };
}

/**
 * @param {object} match 已含 groups / pairings / registerInfo / gameMode 的待保存对象
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateStrokeEntities(match) {
  const gameMode = resolveGameMode(match);
  const kind = resolveStrokeKind(gameMode);
  if (kind === 'g1' || kind === 'other') {
    return { valid: true };
  }
  if (kind === 'g2g3') {
    return validateG2G3(match);
  }
  if (kind === 'g4') {
    return validateG4(match);
  }
  return { valid: true };
}

module.exports = {
  validateStrokeEntities,
  resolveStrokeKind,
  resolveGameMode,
  resolveDeclaredCompositionMode,
  analyzeGroupComposition,
  bucketGroupByTeam,
  buildRegisterTeamMap,
  listFilledPlayers,
  G1_MODES,
  G2_G3_MODES,
  G4_MODES,
  ALLOWED_GROUP_COMPOSITIONS
};
