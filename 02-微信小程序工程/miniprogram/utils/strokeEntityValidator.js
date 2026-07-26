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

/** G6/G7 比洞：复用 G2/G3 UI/Entity 构建，合法性见专用校验（不改变 G2/G3 原规则） */
const G6_G7_MATCH_PLAY_MODES = {
  最好成绩比洞赛: true,
  四人四球比洞赛: true, // 创建页现用名，与 G6 最好成绩比洞同规则
  最佳球位比洞赛: true
};

/** G8 比洞：复用 G4 UI/Entity 构建，合法性更严（仅红2+蓝2） */
const G8_MATCH_PLAY_MODES = {
  四人两球比洞赛: true
};

/** G5 个人比洞：不进组合 family / Entity；每组恰好跨分队 1v1 */
const G5_MATCH_PLAY_MODES = {
  个人比洞赛: true
};

const G6_G7_ILLEGAL_TIP = '比洞赛组合必须由双方分队组成，且每方最多2人';
const G8_ILLEGAL_TIP = '四人两球比洞赛每组须为双方各2人';
const G5_COUNT_TIP = '个人比洞赛每组必须有且只有两名球员';
const G5_TEAM_MISSING_TIP = '个人比洞赛球员必须归属分队';
const G5_SAME_TEAM_TIP = '个人比洞赛双方球员必须来自不同分队';

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

function isG6G7MatchPlayMode(gameMode) {
  return !!G6_G7_MATCH_PLAY_MODES[String(gameMode || '').trim()];
}

function isG8MatchPlayMode(gameMode) {
  return !!G8_MATCH_PLAY_MODES[String(gameMode || '').trim()];
}

function isG5MatchPlayMode(gameMode) {
  return !!G5_MATCH_PLAY_MODES[String(gameMode || '').trim()];
}

/** G5–G8 比洞看板/得分榜：统一判断（禁止各页再写赛制字符串） */
function isMatchPlayBoardMode(gameMode) {
  const mode = String(gameMode || '').trim();
  return isG5MatchPlayMode(mode) || isG6G7MatchPlayMode(mode) || isG8MatchPlayMode(mode);
}

/** G2/G3 比杆 + G6/G7 比洞（composition UI / Entity 构建） */
function isG2G3FamilyMode(gameMode) {
  const mode = String(gameMode || '').trim();
  return !!G2_G3_MODES[mode] || isG6G7MatchPlayMode(mode);
}

/** G4 比杆 + G8 比洞 */
function isG4FamilyMode(gameMode) {
  const mode = String(gameMode || '').trim();
  return !!G4_MODES[mode] || isG8MatchPlayMode(mode);
}

function resolveStrokeKind(gameMode) {
  const mode = String(gameMode || '').trim();
  if (G1_MODES[mode]) return 'g1';
  if (isG2G3FamilyMode(mode)) return 'g2g3';
  if (isG4FamilyMode(mode)) return 'g4';
  return 'other';
}

/**
 * G5 个人比洞：每组恰好 2 人，且必须来自不同分队（不允许同分队 1v1 / 单人 / 超过 2 人）
 * @returns {string} 空串=合法；否则中文提示
 */
function validateG5MatchPlayPlayers(players, teamMap) {
  const filled = listFilledPlayers({ players: players });
  if (filled.length !== 2) {
    return G5_COUNT_TIP;
  }

  const teamIds = [];
  for (let i = 0; i < filled.length; i++) {
    const uid = filled[i].userId;
    const teamId = teamMap && teamMap[uid] != null ? String(teamMap[uid]).trim() : '';
    if (!teamId) {
      return G5_TEAM_MISSING_TIP;
    }
    teamIds.push(teamId);
  }

  if (teamIds[0] === teamIds[1]) {
    return G5_SAME_TEAM_TIP;
  }
  return '';
}

function validateG5MatchPlayGroups(match) {
  const groups = Array.isArray(match && match.groups) ? match.groups : [];
  if (!groups.length) {
    return { valid: true };
  }
  const teamMap = buildRegisterTeamMap(match);
  for (let i = 0; i < groups.length; i++) {
    const filled = listFilledPlayers(groups[i]);
    if (!filled.length) continue;
    const err = validateG5MatchPlayPlayers(groups[i].players, teamMap);
    if (err) {
      return { valid: false, reason: 'g5_illegal_split' };
    }
  }
  return { valid: true };
}

/**
 * G6/G7 报名分组：双方分队各 1–2 人（允许 1+1 / 1+2 / 2+1 / 2+2）
 * @returns {string} 空串=合法；否则中文提示
 */
function validateG6G7MatchPlayPlayers(players, teamMap) {
  const filled = listFilledPlayers({ players: players });
  if (!filled.length) return '';

  for (let i = 0; i < filled.length; i++) {
    const uid = filled[i].userId;
    const teamId = teamMap && teamMap[uid] != null ? String(teamMap[uid]).trim() : '';
    if (!teamId) {
      return '存在未归属分队的球员，请先完成报名分队';
    }
  }

  if (filled.length > 4) {
    return G6_G7_ILLEGAL_TIP;
  }

  const buckets = {};
  filled.forEach((p) => {
    const teamId = String(teamMap[p.userId] || '').trim();
    if (!buckets[teamId]) buckets[teamId] = [];
    buckets[teamId].push(p.userId);
  });
  const teamIds = Object.keys(buckets);
  if (teamIds.length !== 2) {
    return G6_G7_ILLEGAL_TIP;
  }
  for (let i = 0; i < teamIds.length; i++) {
    const n = buckets[teamIds[i]].length;
    if (n < 1 || n > 2) {
      return G6_G7_ILLEGAL_TIP;
    }
  }
  return '';
}

/**
 * G8 报名分组：总人数 4，且双方分队各 2 人
 * @returns {string} 空串=合法；否则中文提示
 */
function validateG8MatchPlayPlayers(players, teamMap) {
  const filled = listFilledPlayers({ players: players });
  if (!filled.length) return '';

  for (let i = 0; i < filled.length; i++) {
    const uid = filled[i].userId;
    const teamId = teamMap && teamMap[uid] != null ? String(teamMap[uid]).trim() : '';
    if (!teamId) {
      return '存在未归属分队的球员，请先完成报名分队';
    }
  }

  if (filled.length !== 4) {
    return G8_ILLEGAL_TIP;
  }

  const buckets = {};
  filled.forEach((p) => {
    const teamId = String(teamMap[p.userId] || '').trim();
    if (!buckets[teamId]) buckets[teamId] = [];
    buckets[teamId].push(p.userId);
  });
  const teamIds = Object.keys(buckets);
  if (teamIds.length !== 2) {
    return G8_ILLEGAL_TIP;
  }
  if (buckets[teamIds[0]].length !== 2 || buckets[teamIds[1]].length !== 2) {
    return G8_ILLEGAL_TIP;
  }
  return '';
}

function validateG6G7MatchPlayGroups(match) {
  const groups = Array.isArray(match && match.groups) ? match.groups : [];
  if (!groups.length) {
    return { valid: true };
  }
  const teamMap = buildRegisterTeamMap(match);
  for (let i = 0; i < groups.length; i++) {
    const filled = listFilledPlayers(groups[i]);
    if (!filled.length) continue;
    const err = validateG6G7MatchPlayPlayers(groups[i].players, teamMap);
    if (err) {
      return { valid: false, reason: 'g6g7_illegal_split' };
    }
  }
  return { valid: true };
}

function validateG8MatchPlayGroups(match) {
  const groups = Array.isArray(match && match.groups) ? match.groups : [];
  if (!groups.length) {
    return { valid: true };
  }
  const teamMap = buildRegisterTeamMap(match);
  for (let i = 0; i < groups.length; i++) {
    const filled = listFilledPlayers(groups[i]);
    if (!filled.length) continue;
    const err = validateG8MatchPlayPlayers(groups[i].players, teamMap);
    if (err) {
      return { valid: false, reason: 'g8_illegal_split' };
    }
  }
  // 结构合法后再走 G4 pairing 一致性（G8 保存会重建 pairings）
  return validateG4(match);
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
 * G4 仅校验组内球员分队结构（不含 pairings；供改赛制逐组保留用）
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateG4GroupPlayersOnly(group, teamMap) {
  const filled = listFilledPlayers(group);
  if (!filled.length) {
    return { valid: true };
  }
  const n = filled.length;
  if (n !== 2 && n !== 4) {
    return { valid: false, reason: 'g4_player_count:' + n };
  }
  const buckets = {};
  for (let f = 0; f < filled.length; f++) {
    const uid = filled[f].userId;
    const teamId = teamMap && teamMap[uid] ? String(teamMap[uid]).trim() : '';
    if (!teamId) {
      return { valid: false, reason: 'g4_player_missing_team:' + uid };
    }
    if (!buckets[teamId]) buckets[teamId] = [];
    buckets[teamId].push(uid);
  }
  const teamIds = Object.keys(buckets);
  if (n === 2) {
    if (teamIds.length !== 1) {
      return { valid: false, reason: 'g4_2_cross_team' };
    }
    return { valid: true };
  }
  if (teamIds.length === 1) {
    return { valid: true };
  }
  if (teamIds.length === 2) {
    if (buckets[teamIds[0]].length !== 2 || buckets[teamIds[1]].length !== 2) {
      return { valid: false, reason: 'g4_illegal_split' };
    }
    return { valid: true };
  }
  return { valid: false, reason: 'g4_too_many_teams:' + teamIds.length };
}

/**
 * 单组相对「目标赛制」合法性（报名态改赛制 / 分组保留）。
 * 包装已有 G1–G8 校验，不改动原函数契约。
 * @param {string} targetGameMode
 * @param {object} group
 * @param {object} [matchLike] 提供 registerInfo / strokeCompositionMode
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateGroupForTargetGameMode(targetGameMode, group, matchLike) {
  const mode = String(targetGameMode || '').trim();
  if (!mode) {
    return { valid: false, reason: 'missing_mode' };
  }
  if (!group || typeof group !== 'object') {
    return { valid: false, reason: 'invalid_group' };
  }
  const filled = listFilledPlayers(group);
  // 空组占位：改赛制时保留
  if (!filled.length) {
    return { valid: true };
  }

  // 个人比杆：保留已有组
  if (G1_MODES[mode]) {
    return { valid: true };
  }

  const teamMap = buildRegisterTeamMap(matchLike || {});
  const players = filled.map((p) => ({ userId: p.userId }));

  // G5 个人比洞：跨分队 1v1（不进组合 family）
  if (isG5MatchPlayMode(mode)) {
    const tip = validateG5MatchPlayPlayers(players, teamMap);
    return tip ? { valid: false, reason: tip } : { valid: true };
  }
  if (isG6G7MatchPlayMode(mode)) {
    const tip = validateG6G7MatchPlayPlayers(players, teamMap);
    return tip ? { valid: false, reason: tip } : { valid: true };
  }
  if (isG8MatchPlayMode(mode)) {
    const tip = validateG8MatchPlayPlayers(players, teamMap);
    return tip ? { valid: false, reason: tip } : { valid: true };
  }
  if (G4_MODES[mode]) {
    return validateG4GroupPlayersOnly(group, teamMap);
  }
  if (G2_G3_MODES[mode]) {
    let compositionMode = resolveDeclaredCompositionMode(matchLike);
    if (!compositionMode) compositionMode = '2+2';
    const probe = Object.assign({}, matchLike || {}, {
      gameMode: mode,
      strokeCompositionMode: compositionMode
    });
    const checked = validateG2G3GroupWithResolver(probe, group);
    if (!checked.ok) {
      return { valid: false, reason: checked.reason || 'g2g3_invalid' };
    }
    return { valid: true };
  }

  // 未知赛制：保守保留
  return { valid: true };
}

/**
 * @param {object} match 已含 groups / pairings / registerInfo / gameMode 的待保存对象
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateStrokeEntities(match) {
  const gameMode = resolveGameMode(match);
  // G5：个人比洞结构校验（不生成组合 Entity）
  if (isG5MatchPlayMode(gameMode)) {
    return validateG5MatchPlayGroups(match);
  }
  // G6/G7/G8：专用合法性（识别赛制 + 阻止非法组合进入异常态）；Entity 构建仍走 g2g3/g4
  if (isG6G7MatchPlayMode(gameMode)) {
    return validateG6G7MatchPlayGroups(match);
  }
  if (isG8MatchPlayMode(gameMode)) {
    return validateG8MatchPlayGroups(match);
  }
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
  validateGroupForTargetGameMode,
  resolveStrokeKind,
  resolveGameMode,
  resolveDeclaredCompositionMode,
  analyzeGroupComposition,
  bucketGroupByTeam,
  buildRegisterTeamMap,
  listFilledPlayers,
  isG5MatchPlayMode,
  isG6G7MatchPlayMode,
  isG8MatchPlayMode,
  isMatchPlayBoardMode,
  isG2G3FamilyMode,
  isG4FamilyMode,
  validateG5MatchPlayPlayers,
  validateG6G7MatchPlayPlayers,
  validateG8MatchPlayPlayers,
  G1_MODES,
  G2_G3_MODES,
  G4_MODES,
  G5_MATCH_PLAY_MODES,
  G6_G7_MATCH_PLAY_MODES,
  G8_MATCH_PLAY_MODES,
  ALLOWED_GROUP_COMPOSITIONS
};
