/**
 * 队内赛分组编辑页
 * 编辑 groupDraft / pairingDraft；确定后才写入正式 groups / pairings
 */
const { createHeaderStyle } = require('../../../../utils/headerEngine.js');
const teamMatchStore = require('../../../../utils/teamMatchStore.js');
const {
  isTeamMatchFamily,
  isInterTeamMatch
} = require('../../../../utils/teamMatchCapabilities.js');
const matchManageAccess = require('../../../../utils/matchManageAccess.js');
const playerManage = require('../../../../utils/playerManage.js');
const gameStore = require('../../../../utils/gameStore.js');

/** 队际赛文案用「球队」，队内赛保持「分队」 */
function resolveSideUnitLabel(matchLike) {
  return isInterTeamMatch(matchLike) ? '球队' : '分队';
}
const mockAvatars = require('../../../../utils/mockAvatars.js');
const playerDirectory = require('../../../../utils/playerDirectory.js');
const tPosition = require('../../../../utils/tPosition.js');
const {
  validateStrokeEntities,
  buildRegisterTeamMap,
  isG5MatchPlayMode,
  isG6G7MatchPlayMode,
  isG8MatchPlayMode,
  isG2G3FamilyMode,
  isG4FamilyMode,
  validateG5MatchPlayPlayers,
  validateG6G7MatchPlayPlayers,
  validateG8MatchPlayPlayers
} = require('../../../../utils/strokeEntityValidator.js');
const { syncStrokeEntities } = require('../../../../utils/strokeEntityBuilder.js');
const { normalizeFormalGroupSeats } = require('../../../../utils/strokeGroupSeatNormalizer.js');

const STROKE_ENTITY_INVALID_TIP = '当前分组不符合该比赛赛制要求，请重新分组。';

const PLAYER_SLOTS = 4;
const DEFAULT_REGISTER_GROUPS = [
  { id: 'team-group-1', name: '正式队员' },
  { id: 'team-group-2', name: '嘉宾' }
];

function resolveScorePlayerId(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const id = entry.scorePlayerId || entry.slotScorePlayerId || entry.scoreOwnerId || '';
  return id != null ? String(id).trim() : '';
}

function withScorePlayerFields(target, source) {
  const out = target || {};
  const scorePlayerId = resolveScorePlayerId(source);
  if (scorePlayerId) out.scorePlayerId = scorePlayerId;
  if (source && source.hasHistoryScore != null) out.hasHistoryScore = !!source.hasHistoryScore;
  return out;
}

function createEmptyGroupPlayer(position, source) {
  return withScorePlayerFields({
    position: position,
    userId: '',
    avatar: '',
    displayName: '',
    gender: '',
    tee: ''
  }, source);
}

function createEmptyGroup(groupIndex) {
  const n = groupIndex + 1;
  return {
    groupId: 'group-tab-' + Date.now() + '-' + n,
    groupName: '第' + n + '组',
    players: Array.from({ length: PLAYER_SLOTS }, (_, i) => createEmptyGroupPlayer(i + 1))
  };
}

function buildRegisterPlayerLookup(registerInfo) {
  const map = {};
  const users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
  users.forEach((u) => {
    const id = u && u.userId != null ? String(u.userId).trim() : '';
    if (!id) return;
    const gender = playerDirectory.getGenderById(id, u.gender || '');
    map[id] = {
      displayName: u.competitionName || u.nickname || u.displayName || '',
      avatar: u.avatar || '',
      gender: gender,
      tee: tPosition.defaultFromGender(gender),
      matchTeamId: u.matchTeamId != null ? String(u.matchTeamId).trim() : '',
      groupId: u.groupId != null ? String(u.groupId).trim() : '',
      matchTeamName: u.matchTeamName != null ? String(u.matchTeamName).trim() : '',
      groupName: u.groupName != null ? String(u.groupName).trim() : ''
    };
  });
  return map;
}

/** 编辑草稿：从报名名单补齐展示字段（不写回正式 groups） */
function hydrateDraftPlayers(list, registerInfo) {
  const lookup = buildRegisterPlayerLookup(registerInfo);
  return (Array.isArray(list) ? list : []).map((g, index) => {
    const out = {
      groupId: g && g.groupId != null ? String(g.groupId) : ('group-tab-' + Date.now() + '-' + (index + 1)),
      groupName: g && g.groupName ? String(g.groupName) : ('第' + (index + 1) + '组'),
      players: Array.from({ length: PLAYER_SLOTS }, (_, i) => {
        const position = i + 1;
        const found = Array.isArray(g && g.players)
          ? g.players.find((p) => Number(p && p.position) === position)
          : null;
        if (!found) return createEmptyGroupPlayer(position);
        if (!found.userId) return createEmptyGroupPlayer(position, found);
        const userId = String(found.userId);
        const src = lookup[userId] || {};
        const gender = src.gender || found.gender || playerDirectory.getGenderById(userId, '');
        const tee = tPosition.resolve({
          tPosition: found.tPosition,
          tee: found.tee,
          gender: gender
        });
        return withScorePlayerFields({
          position: position,
          userId: userId,
          avatar: src.avatar || (found.avatar ? String(found.avatar) : '') || '',
          displayName: src.displayName
            || (found.displayName ? String(found.displayName) : '')
            || (found.competitionName ? String(found.competitionName) : '')
            || '',
          gender: gender,
          tee: tee,
          tPosition: tee
        }, found);
      })
    };
    const teeTime = g && g.teeTime != null ? String(g.teeTime).trim() : '';
    if (teeTime) out.teeTime = teeTime;
    const startHole = Number(g && g.startHole);
    if (Number.isFinite(startHole) && startHole >= 1 && startHole <= 18) {
      out.startHole = Math.floor(startHole);
    }
    return out;
  });
}

function cloneTournamentGroups(list) {
  if (!Array.isArray(list)) return [];
  return list.map((g, index) => ({
    groupId: g && g.groupId != null ? String(g.groupId) : ('group-tab-' + Date.now() + '-' + (index + 1)),
    groupName: g && g.groupName ? String(g.groupName) : ('第' + (index + 1) + '组'),
    players: Array.from({ length: PLAYER_SLOTS }, (_, i) => {
      const position = i + 1;
      const found = Array.isArray(g && g.players)
        ? g.players.find((p) => Number(p && p.position) === position)
        : null;
      if (!found) return createEmptyGroupPlayer(position);
      if (!found.userId) return createEmptyGroupPlayer(position, found);
      return withScorePlayerFields({
        position: position,
        userId: found.userId ? String(found.userId) : '',
        avatar: found.avatar ? String(found.avatar) : '',
        displayName: found.displayName
          ? String(found.displayName)
          : (found.competitionName ? String(found.competitionName) : ''),
        gender: found.gender ? String(found.gender) : '',
        tee: found.tee ? String(found.tee) : '',
        tPosition: found.tPosition
          ? String(found.tPosition)
          : (found.tee === tPosition.RED_T || found.tee === tPosition.BLUE_T
            ? String(found.tee)
            : '')
      }, found);
    })
  }));
}

/** 正式 groups：保存 position + userId + tPosition（位号保留，含空位）；保留 teeTime / startHole */
function toFormalGroups(list) {
  if (!Array.isArray(list)) return [];
  return list.map((g, index) => {
    const out = {
      groupId: g && g.groupId != null ? String(g.groupId) : ('group-tab-' + Date.now() + '-' + (index + 1)),
      groupName: g && g.groupName ? String(g.groupName) : ('第' + (index + 1) + '组'),
      players: Array.from({ length: PLAYER_SLOTS }, (_, i) => {
        const position = i + 1;
        const found = Array.isArray(g && g.players)
          ? g.players.find((p) => Number(p && p.position) === position)
          : null;
        const userId = found && found.userId ? String(found.userId).trim() : '';
        const entry = { position: position, userId: userId };
        if (userId && found) {
          entry.tPosition = tPosition.resolve(found);
        }
        return entry;
      })
    };
    const teeTime = g && g.teeTime != null ? String(g.teeTime).trim() : '';
    if (teeTime) out.teeTime = teeTime;
    const startHole = Number(g && g.startHole);
    if (Number.isFinite(startHole) && startHole >= 1 && startHole <= 18) {
      out.startHole = Math.floor(startHole);
    }
    return out;
  });
}

/** G4：userId → 报名分队（matchTeamId || groupId） */
function buildG4RegisterTeamMap(match) {
  const users =
    match && match.registerInfo && Array.isArray(match.registerInfo.users)
      ? match.registerInfo.users
      : [];
  const map = {};
  users.forEach((user) => {
    const uid = user && user.userId != null ? String(user.userId).trim() : '';
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

function listG4TeamOrder(match) {
  const list = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
  const order = [];
  const seen = {};
  list.forEach((g) => {
    const id = g && g.id != null ? String(g.id).trim() : '';
    if (!id || seen[id]) return;
    seen[id] = true;
    order.push(id);
  });
  return order;
}

function hasFormalGroups(match) {
  return !!(match && Array.isArray(match.groups) && match.groups.length > 0);
}

function buildInitialGroupDraft(match) {
  const registerInfo = resolveRegisterInfo(match);
  if (hasFormalGroups(match)) {
    return hydrateDraftPlayers(match.groups, registerInfo);
  }
  return [createEmptyGroup(0)];
}

function resolvePlayerDisplayName(p) {
  if (!p) return '';
  if (p.displayName) return String(p.displayName);
  if (p.competitionName) return String(p.competitionName);
  if (p.name) return String(p.name);
  return '';
}

/**
 * 头像下球队/分队标签：队内/队际有 teamGroups 即展示。
 * @param {object|null|undefined} matchLike
 * @returns {boolean}
 */
function shouldShowAvatarTeamLabel(matchLike) {
  if (!isTeamMatchFamily(matchLike)) return false;
  const teamGroups = matchLike && Array.isArray(matchLike.teamGroups) ? matchLike.teamGroups : [];
  return teamGroups.length >= 1;
}

/**
 * @param {Array} players
 * @param {{ teamGroups?: Array, registerLookup?: object, showTeamLabel?: boolean }=} options
 */
function mapPlayersForCard(players, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const teamGroups = Array.isArray(opts.teamGroups) ? opts.teamGroups : [];
  const registerLookup = opts.registerLookup || {};
  const showTeamLabel = opts.showTeamLabel != null ? !!opts.showTeamLabel : teamGroups.length >= 1;
  return (players || []).map((p) => {
    const displayName = resolvePlayerDisplayName(p);
    const tee = p.tee === tPosition.RED_T ? tPosition.RED_T
      : (p.tee === tPosition.BLUE_T ? tPosition.BLUE_T : '');
    const teeText = tee === tPosition.RED_T ? '红T' : (tee === tPosition.BLUE_T ? '蓝T' : '');
    const userId = p && p.userId ? String(p.userId) : '';
    let teamLabel = '';
    if (showTeamLabel && userId) {
      const reg = registerLookup[userId] || {};
      const rawForLabel = Object.assign({}, reg, p || {});
      teamLabel = playerManage.resolveAvatarTeamLabel(rawForLabel, teamGroups) || '';
    }
    return withScorePlayerFields({
      position: p.position,
      userId: userId,
      name: displayName,
      displayName: displayName,
      nickname: displayName,
      avatar: p.avatar ? mockAvatars.resolveAvatar(p.avatar, p.userId) : (p.userId ? mockAvatars.resolveAvatar('', p.userId) : ''),
      tee: teeText,
      teeText: teeText,
      teeLabel: teeText,
      teeMarkerClass: tee === tPosition.RED_T
        ? 'tee-marker-dot--female'
        : (tee === tPosition.BLUE_T ? 'tee-marker-dot--male' : ''),
      teamLabel: teamLabel
    }, p);
  });
}

function resolveRegisterInfo(match) {
  if (!match || !match.registerInfo) return { totalCount: 0, users: [] };
  return teamMatchStore.normalizeRegisterInfo
    ? teamMatchStore.normalizeRegisterInfo(match.registerInfo)
    : match.registerInfo;
}

/** userId → 报名分队 groupId */
function buildRegisterTeamGroupMap(registerInfo) {
  const map = {};
  const users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
  users.forEach((u) => {
    const id = u && u.userId != null ? String(u.userId).trim() : '';
    if (!id) return;
    map[id] = u.groupId != null ? String(u.groupId).trim() : '';
  });
  return map;
}

function resolvePlayerTeamGroupId(userId, teamMap) {
  const id = userId != null ? String(userId).trim() : '';
  if (!id) return '';
  return teamMap && teamMap[id] != null ? String(teamMap[id]) : '';
}

/**
 * 选人返回/草稿：按分队生成 pair 组合后校验（与 group-pick 同规则）
 */
function listFilledPickPlayers(players) {
  return (Array.isArray(players) ? players : [])
    .map((p) => ({
      userId: p && p.userId != null ? String(p.userId).trim() : '',
      position: Number(p && p.position) || 0
    }))
    .filter((p) => p.userId)
    .sort((a, b) => a.position - b.position || String(a.userId).localeCompare(String(b.userId)));
}

function ensurePlayersHaveTeam(filled, teamMap, sideUnit) {
  const unit = sideUnit || '分队';
  for (let i = 0; i < filled.length; i++) {
    const uid = filled[i].userId;
    const teamId = teamMap && teamMap[uid] != null ? String(teamMap[uid]).trim() : '';
    if (!teamId) {
      return '存在未归属' + unit + '的球员，请先完成报名' + unit;
    }
  }
  return '';
}

function allMembersSameTeam(userIds, teamMap) {
  let first = '';
  for (let i = 0; i < userIds.length; i++) {
    const teamId = teamMap && teamMap[userIds[i]] != null ? String(teamMap[userIds[i]]).trim() : '';
    if (!teamId) return false;
    if (!first) first = teamId;
    else if (teamId !== first) return false;
  }
  return true;
}

function generatePairCompositionsByTeam(filled, teamMap) {
  const buckets = {};
  const teamOrder = [];
  filled.forEach((p) => {
    const teamId = teamMap && teamMap[p.userId] != null ? String(teamMap[p.userId]).trim() : '';
    const key = teamId || '__unknown__';
    if (!buckets[key]) {
      buckets[key] = [];
      teamOrder.push(key);
    }
    buckets[key].push(p);
  });

  const compositions = [];
  teamOrder.forEach((teamId) => {
    const list = (buckets[teamId] || []).slice().sort(
      (a, b) => a.position - b.position || String(a.userId).localeCompare(String(b.userId))
    );
    for (let i = 0; i < list.length; i += 2) {
      const chunk = list.slice(i, i + 2);
      compositions.push({
        teamId: teamId === '__unknown__' ? '' : teamId,
        members: chunk.map((p) => p.userId)
      });
    }
  });
  return compositions;
}

function validateGeneratedCompositions(compositions, teamMap, options) {
  const requirePairSize = !!(options && options.requirePairSize);
  const expectedCount = options && options.expectedCount != null ? Number(options.expectedCount) : -1;
  const sideUnit = (options && options.sideUnit) || '分队';

  for (let i = 0; i < compositions.length; i++) {
    const members = compositions[i].members || [];
    if (requirePairSize && members.length !== 2) {
      return '无法形成合法同队两人组合';
    }
    if (!allMembersSameTeam(members, teamMap)) {
      return '成绩组合不能跨' + sideUnit;
    }
  }
  if (expectedCount >= 0 && compositions.length !== expectedCount) {
    return '无法形成赛制要求的合法组合';
  }
  return '';
}

/**
 * G2/G3 2+2：按分队/球队数量与各队人数判断能否拆成两个组合（每组合最多 2 人）
 */
function validateG2G3TwoPlusTwoPlayers(filled, teamMap, sideUnit) {
  const unit = sideUnit || '分队';
  if (!filled.length) return '';
  if (filled.length > 4) {
    return '2+2模式下每组最多 4 人';
  }

  const buckets = {};
  filled.forEach((p) => {
    const teamId = teamMap && teamMap[p.userId] != null ? String(teamMap[p.userId]).trim() : '';
    if (!buckets[teamId]) buckets[teamId] = [];
    buckets[teamId].push(p.userId);
  });
  const teamIds = Object.keys(buckets);
  const teamCount = teamIds.length;

  if (teamCount === 1) {
    return '';
  }
  if (teamCount === 2) {
    for (let i = 0; i < teamIds.length; i++) {
      if (buckets[teamIds[i]].length > 2) {
        return '2+2模式下每个组合最多 2 人，无法按' + unit + '拆成合法组合';
      }
    }
    return '';
  }
  return '2+2模式同组最多来自两个' + unit;
}

/**
 * 报名期 G2/G3：先按模式生成组合，再验组合内是否同队
 */
function validateStrokeCompositionPlayers(players, compositionMode, teamMap, sideUnit) {
  const mode = compositionMode === '2+2' ? '2+2' : '4+0';
  const unit = sideUnit || '分队';
  const filled = listFilledPickPlayers(players);
  if (!filled.length) return '';

  const teamErr = ensurePlayersHaveTeam(filled, teamMap, unit);
  if (teamErr) return teamErr;

  if (mode === '4+0') {
    if (filled.length > 4) {
      return '4+0模式下每组最多 4 人';
    }
    if (!allMembersSameTeam(filled.map((p) => p.userId), teamMap)) {
      return '4+0组合不能跨' + unit;
    }
    return '';
  }

  return validateG2G3TwoPlusTwoPlayers(filled, teamMap, unit);
}

/**
 * G4 选人写回：生成 pair 组合后验组合内同队（不对 pairing / entity）
 */
function validateG4GroupStructurePlayers(players, teamMap, sideUnit) {
  const filled = listFilledPickPlayers(players);
  if (!filled.length) return '';

  const teamErr = ensurePlayersHaveTeam(filled, teamMap, sideUnit);
  if (teamErr) return teamErr;

  const n = filled.length;
  if (n !== 2 && n !== 4) {
    return '四人两球每组须为 2 人或 4 人';
  }

  const compositions = generatePairCompositionsByTeam(filled, teamMap);
  return validateGeneratedCompositions(compositions, teamMap, {
    requirePairSize: true,
    expectedCount: n / 2,
    sideUnit: sideUnit || '分队'
  }) || '';
}

/**
 * 报名分组球员校验：G5/G6/G7、G8 走专用规则；G2/G3、G4 保持原逻辑
 */
function validatePlayersForRegisterGameMode(players, gameMode, compositionMode, teamMap, options) {
  const mode = String(gameMode || '').trim();
  const opts = options || {};
  const sideUnit = opts.sideUnit || '分队';
  if (isG5MatchPlayMode(mode)) {
    return validateG5MatchPlayPlayers(players, teamMap);
  }
  if (isG6G7MatchPlayMode(mode)) {
    return validateG6G7MatchPlayPlayers(players, teamMap);
  }
  if (isG8MatchPlayMode(mode)) {
    return validateG8MatchPlayPlayers(players, teamMap);
  }
  if (isG4FamilyMode(mode)) {
    return validateG4GroupStructurePlayers(players, teamMap, sideUnit);
  }
  if (opts.showCompositionMode) {
    return validateStrokeCompositionPlayers(players, compositionMode, teamMap, sideUnit);
  }
  return '';
}

/**
 * 报名分队 id：matchTeamId || groupId（与保存后 TAB / teamMap 一致）
 */
function resolveRegisterTeamId(user) {
  if (!user) return '';
  if (user.matchTeamId != null && String(user.matchTeamId).trim() !== '') {
    return String(user.matchTeamId).trim();
  }
  if (user.groupId != null && String(user.groupId).trim() !== '') {
    return String(user.groupId).trim();
  }
  return '';
}

function buildPreviewRegisterMaps(matchLike) {
  const users =
    matchLike && matchLike.registerInfo && Array.isArray(matchLike.registerInfo.users)
      ? matchLike.registerInfo.users
      : [];
  const teamIdByUser = {};
  const nameByUser = {};
  users.forEach((user) => {
    const uid = user && user.userId != null ? String(user.userId).trim() : '';
    if (!uid) return;
    const teamId = resolveRegisterTeamId(user);
    if (teamId) teamIdByUser[uid] = teamId;
    const nick =
      (user.competitionName && String(user.competitionName).trim())
      || (user.displayName && String(user.displayName).trim())
      || (user.nickname && String(user.nickname).trim())
      || uid;
    nameByUser[uid] = nick;
  });

  const teamNameById = {};
  const teamOrder = [];
  const sideUnit = resolveSideUnitLabel(matchLike);
  const teamGroups = matchLike && Array.isArray(matchLike.teamGroups) ? matchLike.teamGroups : [];
  teamGroups.forEach((g, index) => {
    const id = g && g.id != null ? String(g.id).trim() : '';
    if (!id) return;
    teamOrder.push(id);
    teamNameById[id] = String((g && g.name) || '').trim() || (sideUnit + (index + 1));
  });
  users.forEach((user) => {
    const tid = resolveRegisterTeamId(user);
    if (!tid || teamNameById[tid]) return;
    const tname =
      (user.matchTeamName && String(user.matchTeamName).trim())
      || (user.groupName && String(user.groupName).trim())
      || '';
    if (tname) teamNameById[tid] = tname;
  });

  return {
    teamIdByUser: teamIdByUser,
    nameByUser: nameByUser,
    teamNameById: teamNameById,
    teamOrder: teamOrder,
    sideUnit: sideUnit
  };
}

/**
 * G5 个人比洞：按分队展示 1v1 行（players + registerInfo + teamGroups）
 * 不读 pairings，不走 buildCompositionPreview / 组合赛逻辑。
 * @returns {array|null} [{ teamName, namesText }, ...]
 */
function buildMatchPlayTeamPreview(group, matchLike) {
  const maps = buildPreviewRegisterMaps(matchLike || {});
  const filled = ((group && group.players) || [])
    .map((p) => ({
      userId: p && p.userId != null ? String(p.userId).trim() : '',
      position: Number(p && p.position) || 0,
      displayName: resolvePlayerDisplayName(p)
    }))
    .filter((p) => p.userId);
  if (!filled.length) return null;

  const buckets = {};
  filled.forEach((p) => {
    const teamId = maps.teamIdByUser[p.userId] || '__unknown__';
    if (!buckets[teamId]) buckets[teamId] = [];
    buckets[teamId].push(p);
  });
  Object.keys(buckets).forEach((key) => {
    buckets[key].sort(
      (a, b) => a.position - b.position || String(a.userId).localeCompare(String(b.userId))
    );
  });

  const orderedTeamIds = [];
  const used = {};
  (maps.teamOrder || []).forEach((id) => {
    if (buckets[id] && buckets[id].length && !used[id]) {
      orderedTeamIds.push(id);
      used[id] = true;
    }
  });
  Object.keys(buckets).forEach((id) => {
    if (!used[id] && buckets[id] && buckets[id].length) {
      orderedTeamIds.push(id);
      used[id] = true;
    }
  });

  const lines = [];
  orderedTeamIds.forEach((teamId) => {
    const members = buckets[teamId] || [];
    const names = members
      .map((m) => m.displayName || maps.nameByUser[m.userId] || m.userId)
      .filter(Boolean);
    if (!names.length) return;
    const sideUnit = maps.sideUnit || '分队';
    lines.push({
      teamName:
        teamId === '__unknown__'
          ? sideUnit
          : maps.teamNameById[teamId] || teamId || sideUnit,
      namesText: names.join(' / ')
    });
  });
  return lines.length ? lines : null;
}

/**
 * G2/G3 只读预览：按分队归属生成组合（禁止按座位 1+2 / 3+4）
 * 2+2 双分队：每个分队一个组合；单分队：稳定序每 2 人切
 * 4+0：每个分队一个组合（同组应仅一分队）
 */
function buildCompositionPreview(matchLike, group) {
  const mode =
    matchLike && matchLike.strokeCompositionMode === '2+2' ? '2+2' : '4+0';
  const maps = buildPreviewRegisterMaps(matchLike);
  const filled = ((group && group.players) || [])
    .map((p) => ({
      userId: p && p.userId != null ? String(p.userId).trim() : '',
      position: Number(p && p.position) || 0,
      displayName: resolvePlayerDisplayName(p)
    }))
    .filter((p) => p.userId)
    .slice(0, 4);
  if (!filled.length) return null;

  const buckets = {};
  filled.forEach((p) => {
    const teamId = maps.teamIdByUser[p.userId] || '__unknown__';
    if (!buckets[teamId]) buckets[teamId] = [];
    buckets[teamId].push(p);
  });
  Object.keys(buckets).forEach((key) => {
    buckets[key].sort(
      (a, b) => a.position - b.position || String(a.userId).localeCompare(String(b.userId))
    );
  });

  const orderedTeamIds = [];
  const used = {};
  (maps.teamOrder || []).forEach((id) => {
    if (buckets[id] && buckets[id].length && !used[id]) {
      orderedTeamIds.push(id);
      used[id] = true;
    }
  });
  Object.keys(buckets).forEach((id) => {
    if (!used[id] && buckets[id] && buckets[id].length) {
      orderedTeamIds.push(id);
      used[id] = true;
    }
  });

  const compositions = [];
  const sideUnit = maps.sideUnit || '分队';
  const pushCombo = (teamId, members) => {
    if (!members || !members.length) return;
    const label =
      teamId === '__unknown__'
        ? sideUnit
        : maps.teamNameById[teamId] || teamId || sideUnit;
    const names = members
      .map((m) => m.displayName || maps.nameByUser[m.userId] || m.userId)
      .filter(Boolean);
    if (!names.length) return;
    compositions.push({
      label: label,
      text: names.join(' / ')
    });
  };

  if (mode === '4+0') {
    orderedTeamIds.forEach((teamId) => {
      pushCombo(teamId, buckets[teamId] || []);
    });
  } else if (orderedTeamIds.length === 1) {
    // 单分队 2+2：按稳定序每 2 人切成最多两个组合（不用座位 1+2/3+4）
    const list = buckets[orderedTeamIds[0]] || [];
    for (let i = 0; i < list.length && compositions.length < 2; i += 2) {
      pushCombo(orderedTeamIds[0], list.slice(i, i + 2));
    }
  } else {
    // 双分队及以上：每个分队对应一个组合（最多展示两行）
    orderedTeamIds.slice(0, 2).forEach((teamId) => {
      pushCombo(teamId, buckets[teamId] || []);
    });
  }

  if (!compositions.length) return null;
  const combo1 = compositions[0] || { label: '', text: '' };
  const combo2 = compositions[1] || { label: '', text: '' };
  return {
    title: '',
    combos: compositions,
    showCombo1: !!combo1.text,
    showCombo2: !!combo2.text,
    combo1Label: combo1.label || '',
    combo1Text: combo1.text || '',
    combo2Label: combo2.label || '',
    combo2Text: combo2.text || ''
  };
}

/**
 * G4 报名/编辑：由座位推导只读预览（与 G2/G3 compositionPreview 同结构）
 * 组合 = position 1+2 / 3+4；标签取该组合球员所属分队名
 * 不写 pairing、不改座位
 */
function buildG4CompositionPreviewFromSeats(group, match, registerInfo) {
  const matchLike = Object.assign({}, match || {}, {
    registerInfo: registerInfo || (match && match.registerInfo) || { totalCount: 0, users: [] }
  });
  const teamIdByUser = buildG4RegisterTeamMap(matchLike);
  const teamNameById = {};
  const teamGroups = Array.isArray(matchLike.teamGroups) ? matchLike.teamGroups : [];
  const sideUnit = resolveSideUnitLabel(matchLike);
  teamGroups.forEach((g, index) => {
    const id = g && g.id != null ? String(g.id).trim() : '';
    if (!id) return;
    teamNameById[id] = String((g && g.name) || '').trim() || (sideUnit + (index + 1));
  });
  const users =
    (registerInfo && Array.isArray(registerInfo.users) && registerInfo.users)
    || (matchLike.registerInfo && Array.isArray(matchLike.registerInfo.users) && matchLike.registerInfo.users)
    || [];
  users.forEach((u) => {
    if (!u) return;
    const tid =
      u.matchTeamId != null && String(u.matchTeamId).trim() !== ''
        ? String(u.matchTeamId).trim()
        : u.groupId != null && String(u.groupId).trim() !== ''
          ? String(u.groupId).trim()
          : '';
    const tname =
      (u.matchTeamName != null && String(u.matchTeamName).trim())
      || (u.groupName != null && String(u.groupName).trim())
      || '';
    if (tid && tname && !teamNameById[tid]) teamNameById[tid] = tname;
  });

  const byPos = {};
  ((group && group.players) || []).forEach((p) => {
    const uid = p && p.userId != null ? String(p.userId).trim() : '';
    if (!uid) return;
    const pos = Number(p && p.position) || 0;
    if (pos < 1 || pos > 4) return;
    byPos[pos] = {
      userId: uid,
      name: resolvePlayerDisplayName(p) || uid
    };
  });

  const resolveComboLabel = (members) => {
    for (let i = 0; i < members.length; i++) {
      const tid = teamIdByUser[members[i].userId] || '';
      if (tid && teamNameById[tid]) return teamNameById[tid];
      if (tid) return tid;
    }
    return sideUnit;
  };

  const buildSeatCombo = (posA, posB) => {
    const members = [];
    if (byPos[posA]) members.push(byPos[posA]);
    if (byPos[posB]) members.push(byPos[posB]);
    if (!members.length) {
      return { label: '', text: '' };
    }
    return {
      label: resolveComboLabel(members),
      text: members.map((m) => m.name).filter(Boolean).join(' / ')
    };
  };

  // 四人两球：座位 1+2 / 3+4 各为一组合（单分队 4 人亦拆两行，不按队聚合）
  const combo1 = buildSeatCombo(1, 2);
  const combo2 = buildSeatCombo(3, 4);
  if (!combo1.text && !combo2.text) return null;

  return {
    title: '',
    combos: [],
    showCombo1: !!combo1.text,
    showCombo2: !!combo2.text,
    combo1Label: combo1.label,
    combo1Text: combo1.text,
    combo2Label: combo2.label,
    combo2Text: combo2.text
  };
}

function resolveRegisterSubTabs(match, registerInfo) {
  const source = match && Array.isArray(match.teamGroups) && match.teamGroups.length
    ? match.teamGroups
    : DEFAULT_REGISTER_GROUPS;
  const users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
  return source.map((g, idx) => {
    const id = g && g.id != null ? String(g.id) : ('group-' + (idx + 1));
    const name = String((g && g.name) || '').trim() || ('分组' + (idx + 1));
    const count = users.filter((u) => String(u && u.groupId) === id).length;
    return { id: id, name: name, count: count };
  });
}

/** G4 Score Slot：{matchId}__{groupId}__slot1 | slot2 */
function buildPairingSlotId(matchId, groupId, slotNo) {
  const mid = matchId != null ? String(matchId).trim() : '';
  const gid = groupId != null ? String(groupId).trim() : '';
  const n = Number(slotNo) >= 1 ? Math.floor(Number(slotNo)) : 1;
  return mid + '__' + gid + '__slot' + n;
}

function resolvePairingSlotNo(pairingId, fallbackIndex) {
  const id = pairingId != null ? String(pairingId) : '';
  const m = /__slot(\d+)$/.exec(id);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1) return n;
  }
  return Number(fallbackIndex) >= 0 ? Math.floor(Number(fallbackIndex)) + 1 : 1;
}

/**
 * 创建空组合槽位（稳定 Score Slot ID，不用 Date.now）
 * @param {string} matchId
 * @param {string} groupId
 * @param {number} slotNo 1-based：1 → slot1，2 → slot2
 */
function createEmptyPairing(matchId, groupId, slotNo) {
  const n = Number(slotNo) >= 1 ? Math.floor(Number(slotNo)) : 1;
  return {
    id: buildPairingSlotId(matchId, groupId, n),
    playerIds: []
  };
}

/**
 * 按组内座位顺序：优先占用空闲成绩行 slot（1+2 → slot1，3+4 → slot2）
 * 若已有 slot：保留 id，只更新 playerIds；未被占用的已有 slot 保留为空行
 */
function buildAutoPairingsForGroup(group, matchId, existingList) {
  const groupId = group && group.groupId != null ? String(group.groupId) : '';
  const players = ((group && group.players) || [])
    .map((p) => ({
      userId: p && p.userId != null ? String(p.userId).trim() : '',
      position: Number(p && p.position) || 0
    }))
    .filter((p) => p.userId)
    .sort((a, b) => a.position - b.position || String(a.userId).localeCompare(String(b.userId)));

  const existingBySlot = {};
  (Array.isArray(existingList) ? existingList : []).forEach((pr, idx) => {
    if (!pr) return;
    const slotNo = resolvePairingSlotNo(pr.id, idx);
    if (!existingBySlot[slotNo]) {
      existingBySlot[slotNo] = pr.id != null ? String(pr.id) : '';
    }
  });

  const filledBySlot = {};
  let slotNo = 1;
  for (let i = 0; i + 1 < players.length; i += 2) {
    const prevId = existingBySlot[slotNo] || '';
    const id = prevId || buildPairingSlotId(matchId, groupId, slotNo);
    filledBySlot[slotNo] = {
      id: id,
      playerIds: [String(players[i].userId), String(players[i + 1].userId)]
    };
    slotNo += 1;
  }

  const list = [];
  const maxSlot = Math.max(2, ...Object.keys(existingBySlot).map((n) => Number(n) || 0), slotNo - 1);
  for (let n = 1; n <= maxSlot; n++) {
    if (filledBySlot[n]) {
      list.push(filledBySlot[n]);
      continue;
    }
    if (existingBySlot[n]) {
      list.push({ id: existingBySlot[n], playerIds: [] });
    }
  }
  return list;
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    matchId: '',
    mode: 'create',
    headerTitle: '开始分组',
    gameMode: '',
    showPairingSection: false,
    showCompositionMode: false,
    /** G2/G3/G6/G7 组合预览；与 showCompositionMode（2+2/4+0 选择）分离 */
    showCompositionPreview: false,
    /** 非 G4：显示「自动组合 / 添加组合」；G4 由分队规则生成 pairing，不展示 */
    showPairingComposeTools: false,
    pairingSectionTitle: '组合',
    groupDraft: [],
    pairingDraft: {},
    draftCards: [],
    groupDeleteModalVisible: false,
    groupDeleteTargetId: '',
    groupDeleteTargetName: '',
    pairingEditVisible: false,
    editingPairingGroupId: '',
    editingPairingId: '',
    editingPairingSelectedIds: [],
    pairingEditTitle: '修改组合',
    pairingEditOptions: [],
    strokeCompositionMode: '2+2',
    saving: false
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const matchId = options && options.matchId ? decodeURIComponent(options.matchId) : '';
    const modeOpt = options && options.mode ? String(options.mode) : '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    if (match) {
      const user = gameStore.getCurrentUser() || {};
      const canEdit =
        matchManageAccess.hasMatchManagePermission(match, user, 'edit_groups') ||
        matchManageAccess.hasMatchManagePermission(match, user, 'manage_groups');
      if (!canEdit) {
        wx.showToast({ title: '暂无分组管理权限', icon: 'none' });
        setTimeout(() => {
          wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/home/index' }) });
        }, 500);
        return;
      }
    }
    const formalExists = hasFormalGroups(match);
    const mode = modeOpt === 'edit' || modeOpt === 'create' || modeOpt === 'live'
      ? modeOpt
      : (formalExists ? 'edit' : 'create');
    const gameMode = match && match.gameMode ? String(match.gameMode) : '';
    const matchType = match && match.matchType ? String(match.matchType) : 'team-internal';
    // G2/G3 比杆 + G6/G7 比洞 → 组合编辑器；G4 比杆 + G8 比洞 → G4 preview/pairing
    const isG2G3 = isG2G3FamilyMode(gameMode) || teamMatchStore.isPairingStrokeFormat(gameMode);
    const isG6G7 = isG6G7MatchPlayMode(gameMode);
    const isG4 = isG4FamilyMode(gameMode);
    // 仅 G2/G3 比杆显示「2+2 / 4+0」选择；G6/G7 复用编辑器但不复用该选择规则
    const showCompositionMode = isTeamMatchFamily(matchType) && isG2G3 && !isG6G7;
    // G2/G3/G6/G7：组合预览（G6/G7 无模式选择，预览按分队自动按 2+2 展示）
    const showCompositionPreview = isTeamMatchFamily(matchType) && isG2G3;
    // G4/G8 create/edit/live：统一报名期 UI（composition-preview）；不展示旧 pairing 编辑区
    // pairing 数据仍保留在 pairingDraft / 保存链路，仅隐藏编辑入口
    const showPairingSection = false;
    // G2/G3：已有 4+0 / 2+2 保持；G6/G7：不依赖用户选择，固定按双方分队结构 → 2+2
    const rawComposition =
      match && match.strokeCompositionMode != null && String(match.strokeCompositionMode).trim() !== ''
        ? String(match.strokeCompositionMode).trim()
        : '';
    const resolvedMode = isG6G7 ? '2+2' : (rawComposition === '4+0' ? '4+0' : '2+2');
    const draft = buildInitialGroupDraft(match);
    // G4 保留 pairingDraft，供保存时复用 slot id（不展示 pairing 操作区）
    const pairingDraft = isG4
      ? teamMatchStore.clonePairings(match && match.pairings)
      : {};
    this._registerInfo = resolveRegisterInfo(match);
    this._registerTeamMap = buildRegisterTeamGroupMap(this._registerInfo);
    this._registerSubTabs = resolveRegisterSubTabs(match, this._registerInfo);
    this._matchSnapshot = match || null;
    this._leavingConfirmed = false;
    this._pairingIdSeq = 1;
    this.setData({
      matchId: matchId,
      mode: mode,
      headerTitle: mode === 'create' ? '开始分组' : '修改分组',
      gameMode: gameMode,
      showPairingSection: showPairingSection,
      showCompositionMode: showCompositionMode,
      showCompositionPreview: showCompositionPreview,
      showPairingComposeTools: false,
      pairingSectionTitle: teamMatchStore.getPairingStrokeLabel(gameMode),
      strokeCompositionMode: resolvedMode,
      groupDraft: draft,
      pairingDraft: pairingDraft,
      draftCards: this._buildDraftCards(
        draft,
        pairingDraft,
        showPairingSection,
        gameMode,
        showCompositionPreview,
        resolvedMode
      )
    });
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
    this._applyGroupPickResultIfAny();
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle
    });
  },

  /** 预览用 match 上下文：用当前 UI 的 strokeCompositionMode，不改写 store */
  _buildCompositionMatchContext(compositionMode) {
    const stored = this.data.matchId
      ? teamMatchStore.getMatchById(this.data.matchId)
      : null;
    const base = stored || this._matchSnapshot || {};
    const mode = compositionMode === '2+2' ? '2+2' : '4+0';
    return Object.assign({}, base, {
      gameMode: this.data.gameMode || base.gameMode || '',
      strokeCompositionMode: mode,
      registerInfo: this._registerInfo || base.registerInfo || { totalCount: 0, users: [] },
      teamGroups: Array.isArray(base.teamGroups) ? base.teamGroups : []
    });
  },

  _buildDraftCards(groups, pairingDraft, showPairing, gameMode, showCompositionPreviewFlag, strokeCompositionMode) {
    const title = teamMatchStore.getPairingStrokeLabel(gameMode || this.data.gameMode);
    const resolvedGameMode = String(gameMode || this.data.gameMode || '');
    const isG4 = isG4FamilyMode(resolvedGameMode);
    const isG5 = isG5MatchPlayMode(resolvedGameMode);
    const isG6G7 = isG6G7MatchPlayMode(resolvedGameMode);
    // 第 5 参：组合预览开关（G2/G3/G6/G7）；不再与「2+2/4+0 选择」绑死
    const showCompositionPreview = showCompositionPreviewFlag != null
      ? !!showCompositionPreviewFlag
      : !!this.data.showCompositionPreview;
    // G6/G7：不读用户 compositionMode，按双方分队结构固定 2+2 预览
    const compositionMode = isG6G7
      ? '2+2'
      : (strokeCompositionMode != null
        ? String(strokeCompositionMode)
        : String(this.data.strokeCompositionMode || ''));
    const matchLike = showCompositionPreview
      ? this._buildCompositionMatchContext(compositionMode)
      : null;
    const g5MatchLike = isG5
      ? {
          registerInfo: this._registerInfo || { totalCount: 0, users: [] },
          teamGroups: Array.isArray(this._matchSnapshot && this._matchSnapshot.teamGroups)
            ? this._matchSnapshot.teamGroups
            : []
        }
      : null;
    const teamGroups = Array.isArray(this._matchSnapshot && this._matchSnapshot.teamGroups)
      ? this._matchSnapshot.teamGroups
      : [];
    const showTeamLabel = shouldShowAvatarTeamLabel(this._matchSnapshot);
    const registerLookup = buildRegisterPlayerLookup(
      this._registerInfo || (this._matchSnapshot && this._matchSnapshot.registerInfo)
    );
    return (groups || []).map((g) => {
      const players = mapPlayersForCard(g.players, {
        teamGroups: teamGroups,
        registerLookup: registerLookup,
        showTeamLabel: showTeamLabel
      });
      const card = {
        groupId: g.groupId,
        badge: g.groupName,
        players: players
      };
      if (showPairing) {
        card.pairingBlock = this._buildPairingBlockView(g, pairingDraft, title);
      }
      if (isG5 && g5MatchLike) {
        // G5：独立 1v1 分队行；不进 composition / pairings
        const lines = buildMatchPlayTeamPreview(g, g5MatchLike);
        if (lines && lines.length) card.matchPlayTeamPreview = lines;
      } else if (showCompositionPreview && matchLike) {
        const preview = buildCompositionPreview(matchLike, g);
        if (preview) card.compositionPreview = preview;
      } else if (isG4 && !showPairing) {
        // G4 报名/编辑：与 G2/G3 同款 composition-preview（座位+分队，只读）
        const preview = buildG4CompositionPreviewFromSeats(
          g,
          this._matchSnapshot,
          this._registerInfo
        );
        if (preview) card.compositionPreview = preview;
      }
      return card;
    });
  },

  _buildPairingBlockView(group, pairingDraft, sectionTitle) {
    const groupId = String(group.groupId || '');
    const isG4 = isG4FamilyMode(this.data.gameMode);
    const players = ((group && group.players) || []).filter((p) => p && String(p.userId || '').trim());
    const playerMap = {};
    players.forEach((p) => {
      playerMap[String(p.userId)] = p;
    });
    const teamIdByUser = isG4
      ? buildG4RegisterTeamMap({
          registerInfo: this._registerInfo || (this._matchSnapshot && this._matchSnapshot.registerInfo)
        })
      : {};
    const teamNameById = {};
    const sideUnit = resolveSideUnitLabel(this._matchSnapshot);
    if (isG4) {
      const match = this._matchSnapshot || {};
      const teamGroups = Array.isArray(match.teamGroups) ? match.teamGroups : [];
      teamGroups.forEach((g, index) => {
        const id = g && g.id != null ? String(g.id).trim() : '';
        if (!id) return;
        teamNameById[id] = String((g && g.name) || '').trim() || (sideUnit + (index + 1));
      });
      const users =
        (this._registerInfo && Array.isArray(this._registerInfo.users) && this._registerInfo.users)
        || (match.registerInfo && Array.isArray(match.registerInfo.users) && match.registerInfo.users)
        || [];
      users.forEach((u) => {
        if (!u) return;
        const tid =
          u.matchTeamId != null && String(u.matchTeamId).trim() !== ''
            ? String(u.matchTeamId).trim()
            : u.groupId != null && String(u.groupId).trim() !== ''
              ? String(u.groupId).trim()
              : '';
        const tname =
          (u.matchTeamName != null && String(u.matchTeamName).trim())
          || (u.groupName != null && String(u.groupName).trim())
          || '';
        if (tid && tname && !teamNameById[tid]) teamNameById[tid] = tname;
      });
    }
    const rawList = (pairingDraft && pairingDraft[groupId]) ? pairingDraft[groupId] : [];
    const pairings = rawList.map((pairing, idx) => {
      const ids = Array.isArray(pairing.playerIds) ? pairing.playerIds.map(String) : [];
      const members = ids.map((id) => {
        const p = playerMap[id];
        return {
          userId: id,
          name: resolvePlayerDisplayName(p) || id,
          avatar: p && p.avatar ? mockAvatars.resolveAvatar(p.avatar) : ''
        };
      });
      let label = '组合' + (idx + 1);
      let namesText = members.map((m) => m.name).filter(Boolean).join(' / ') || '暂无球员';
      if (isG4) {
        let teamLabel = '';
        for (let i = 0; i < ids.length; i++) {
          const tid = teamIdByUser[ids[i]] || '';
          if (tid && teamNameById[tid]) {
            teamLabel = teamNameById[tid];
            break;
          }
        }
        if (!teamLabel) teamLabel = sideUnit;
        // wxml 为 label + names 分行；label 带冒号以贴近「分队/球队：球员」
        label = teamLabel + '：';
        namesText = members.map((m) => m.name).filter(Boolean).join('、') || '暂无球员';
      }
      return {
        id: pairing.id || ('pairing_' + (idx + 1)),
        label: label,
        playerIds: ids,
        members: members,
        namesText: namesText,
        isEmpty: members.length === 0
      };
    });
    const paired = {};
    pairings.forEach((pr) => {
      (pr.playerIds || []).forEach((id) => { paired[id] = true; });
    });
    const incomplete = players
      .filter((p) => !paired[String(p.userId)])
      .map((p) => ({
        userId: String(p.userId),
        name: resolvePlayerDisplayName(p),
        avatar: p.avatar ? mockAvatars.resolveAvatar(p.avatar) : ''
      }));
    return {
      // G4：隐藏「四人两球组合」标题；其它赛制保持原 title
      title: isG4 ? '' : (sectionTitle || '组合'),
      pairings: pairings,
      incompletePlayers: incomplete,
      incompleteNamesText: incomplete.map((p) => p.name).filter(Boolean).join('、'),
      hasIncomplete: incomplete.length > 0
    };
  },

  _refreshCards() {
    this.setData({
      draftCards: this._buildDraftCards(
        this.data.groupDraft,
        this.data.pairingDraft,
        this.data.showPairingSection,
        this.data.gameMode
      )
    });
  },

  _setGroupDraft(draft, pairingDraft) {
    const nextGroups = cloneTournamentGroups(draft);
    let nextPairings = pairingDraft != null
      ? teamMatchStore.clonePairings(pairingDraft)
      : teamMatchStore.clonePairings(this.data.pairingDraft);
    const isG4 = isG4FamilyMode(this.data.gameMode);
    if (this.data.showPairingSection || isG4) {
      // G4/G8：无编辑区也 prune 保留 slot id，供保存 rebuild 复用
      nextPairings = this._prunePairingsToGroups(nextGroups, nextPairings);
    } else {
      nextPairings = {};
    }
    this.setData({
      groupDraft: nextGroups,
      pairingDraft: nextPairings,
      draftCards: this._buildDraftCards(
        nextGroups,
        nextPairings,
        this.data.showPairingSection,
        this.data.gameMode
      )
    });
  },

  _setPairingDraft(pairingDraft) {
    const next = teamMatchStore.clonePairings(pairingDraft);
    this.setData({
      pairingDraft: next,
      draftCards: this._buildDraftCards(
        this.data.groupDraft,
        next,
        this.data.showPairingSection,
        this.data.gameMode
      )
    });
  },

  /** 删除组或球员变更后，清理无效 pairings */
  _prunePairingsToGroups(groups, pairingDraft) {
    const next = {};
    const groupIds = {};
    (groups || []).forEach((g) => {
      const gid = String(g.groupId || '');
      groupIds[gid] = true;
      const validPlayers = {};
      ((g.players || [])).forEach((p) => {
        const id = p && p.userId ? String(p.userId).trim() : '';
        if (id) validPlayers[id] = true;
      });
      const list = (pairingDraft && pairingDraft[gid]) ? pairingDraft[gid] : [];
      next[gid] = list.map((pr) => ({
        id: pr.id,
        playerIds: (pr.playerIds || []).map(String).filter((id) => validPlayers[id])
      }));
    });
    // 丢弃已删除组的 pairings
    Object.keys(pairingDraft || {}).forEach((gid) => {
      if (!groupIds[gid]) return;
    });
    return next;
  },

  onStrokeCompositionModeTap(e) {
    // G6/G7 不展示该入口；仅 G2/G3 比杆可切换
    if (!this.data.showCompositionMode) return;
    const mode = String((e.currentTarget.dataset.mode != null ? e.currentTarget.dataset.mode : ''));
    if (mode !== '4+0' && mode !== '2+2') return;
    if (mode === this.data.strokeCompositionMode) return;

    // 切到 2+2：直接切换
    if (mode !== '4+0') {
      this.setData({ strokeCompositionMode: mode }, () => {
        this._refreshCards();
      });
      return;
    }

    // 2+2 → 4+0：同组必须同一分队/球队；非法组需确认后清空球员
    const sideUnit = resolveSideUnitLabel(this._matchSnapshot);
    const teamMap = buildRegisterTeamMap({
      registerInfo: this._registerInfo || { users: [] }
    });
    const draft = this.data.groupDraft || [];
    const illegal = [];
    draft.forEach((g, i) => {
      const err = validateStrokeCompositionPlayers(
        g && g.players,
        '4+0',
        teamMap,
        sideUnit
      );
      if (!err) return;
      illegal.push({
        groupId: g && g.groupId != null ? String(g.groupId) : '',
        label: (g && g.groupName) ? String(g.groupName) : ('第' + (i + 1) + '组')
      });
    });

    if (!illegal.length) {
      this.setData({ strokeCompositionMode: '4+0' }, () => {
        this._refreshCards();
      });
      return;
    }

    const names = illegal.map((x) => x.label).join('、');
    wx.showModal({
      title: '提示',
      content:
        '4+0模式下，同组球员必须来自同一' + sideUnit + '。\n当前' +
        names +
        '不符合要求，是否清除该组重新配置？',
      confirmText: '确定',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) {
          // 取消：保持 2+2，不改分组
          return;
        }
        const illegalIds = {};
        illegal.forEach((x) => {
          if (x.groupId) illegalIds[x.groupId] = true;
        });
        const next = draft.map((g) => {
          const gid = g && g.groupId != null ? String(g.groupId) : '';
          if (!gid || !illegalIds[gid]) return g;
          return Object.assign({}, g, {
            players: Array.from({ length: PLAYER_SLOTS }, (_, i) =>
              createEmptyGroupPlayer(i + 1)
            )
          });
        });
        this.setData({ strokeCompositionMode: '4+0' }, () => {
          this._setGroupDraft(next);
        });
      }
    });
  },

  onAddGroup() {
    const draft = (this.data.groupDraft || []).slice();
    draft.push(createEmptyGroup(draft.length));
    this._setGroupDraft(draft);
  },

  onDeleteGroupTap(e) {
    const groupId = String((e.currentTarget.dataset.groupId != null ? e.currentTarget.dataset.groupId : ''));
    const groupName = String((e.currentTarget.dataset.groupName != null ? e.currentTarget.dataset.groupName : ''));
    if (!groupId) return;
    this.setData({
      groupDeleteModalVisible: true,
      groupDeleteTargetId: groupId,
      groupDeleteTargetName: groupName || '该组'
    });
  },

  closeGroupDeleteModal() {
    this.setData({
      groupDeleteModalVisible: false,
      groupDeleteTargetId: '',
      groupDeleteTargetName: ''
    });
  },

  confirmDeleteGroup() {
    const targetId = String(this.data.groupDeleteTargetId || '');
    if (!targetId) {
      this.closeGroupDeleteModal();
      return;
    }
    const next = (this.data.groupDraft || [])
      .filter((g) => String(g && g.groupId) !== targetId)
      .map((g, index) => Object.assign({}, g, {
        groupName: '第' + (index + 1) + '组'
      }));
    const pairingDraft = teamMatchStore.clonePairings(this.data.pairingDraft);
    delete pairingDraft[targetId];
    this._setGroupDraft(next, pairingDraft);
    this.setData({
      groupDeleteModalVisible: false,
      groupDeleteTargetId: '',
      groupDeleteTargetName: ''
    });
  },

  onGroupCardTap(e) {
    const groupId = String((e.currentTarget.dataset.groupId != null ? e.currentTarget.dataset.groupId : ''));
    const groupName = String((e.currentTarget.dataset.groupName != null ? e.currentTarget.dataset.groupName : ''));
    if (!groupId) return;
    const draft = this.data.groupDraft || [];
    const currentGroup = draft.find((g) => String(g.groupId) === groupId) || null;
    const app = getApp();
    app.globalData = app.globalData || {};
    app.globalData.tournamentGroupPickResult = null;
    app.globalData.tournamentGroupPickPayload = {
      matchId: this.data.matchId || '',
      groupId: groupId,
      groupName: groupName,
      gameMode: this.data.gameMode || '',
      // G6/G7：固定 2+2，且不开启 G2/G3 的 4+0 选人分队锁
      strokeCompositionMode: isG6G7MatchPlayMode(this.data.gameMode)
        ? '2+2'
        : (this.data.strokeCompositionMode === '2+2' ? '2+2' : '4+0'),
      showCompositionMode: !!this.data.showCompositionMode,
      players: currentGroup && Array.isArray(currentGroup.players) ? currentGroup.players : [],
      groups: draft.map((g) => ({
        groupId: g && g.groupId ? String(g.groupId) : '',
        groupName: g && g.groupName ? String(g.groupName) : '',
        players: Array.isArray(g && g.players)
          ? g.players.map((p) => ({
            userId: p && p.userId ? String(p.userId) : '',
            position: Number(p && p.position) || 0
          }))
          : []
      })),
      registerInfo: this._registerInfo || { totalCount: 0, users: [] },
      registerSubTabs: this._registerSubTabs || []
    };
    wx.navigateTo({
      url: '/subpackages/tournament/pages/group-pick/index?matchId=' + encodeURIComponent(this.data.matchId || '') +
        '&groupId=' + encodeURIComponent(groupId) +
        '&groupName=' + encodeURIComponent(groupName)
    });
  },

  _applyGroupPickResultIfAny() {
    const app = getApp();
    const result = app && app.globalData ? app.globalData.tournamentGroupPickResult : null;
    if (!result || !result.groupId) return;
    if (app && app.globalData) app.globalData.tournamentGroupPickResult = null;

    const draft = (this.data.groupDraft || []).slice();
    const idx = draft.findIndex((g) => String(g.groupId) === String(result.groupId));
    if (idx < 0) return;

    const lookup = buildRegisterPlayerLookup(this._registerInfo || { users: [] });
    const previousPlayers = Array.isArray(draft[idx] && draft[idx].players) ? draft[idx].players : [];
    const previousByPosition = {};
    previousPlayers.forEach((player) => {
      const position = Number(player && player.position) || 0;
      if (position) previousByPosition[position] = player;
    });
    const players = Array.from({ length: PLAYER_SLOTS }, (_, i) => {
      const position = i + 1;
      const previous = previousByPosition[position] || null;
      const found = Array.isArray(result.players)
        ? result.players.find((p) => Number(p && p.position) === position)
        : null;
      if (!found || !found.userId) {
        return createEmptyGroupPlayer(position, previous);
      }
      const userId = String(found.userId);
      const src = lookup[userId] || {};
      const gender = found.gender || src.gender || playerDirectory.getGenderById(userId, '');
      const tee = tPosition.resolve({
        tPosition: found.tPosition,
        tee: found.tee,
        gender: gender
      });
      return withScorePlayerFields({
        position: position,
        userId: userId,
        avatar: found.avatar || src.avatar || '',
        displayName: found.displayName
          || found.competitionName
          || src.displayName
          || '',
        gender: gender,
        tee: tee,
        tPosition: tee
      }, previous || found);
    });

    // 报名期：坐入前校验（与 group-pick 同规则）；失败则禁止写回
    const pickTeamMap = buildRegisterTeamMap({
      registerInfo: this._registerInfo || { users: [] }
    });
    const gameMode = String(this.data.gameMode || '');
    const pickErr = validatePlayersForRegisterGameMode(
      players,
      gameMode,
      this.data.strokeCompositionMode,
      pickTeamMap,
      {
        useComposition: true,
        showCompositionMode: !!this.data.showCompositionMode,
        sideUnit: resolveSideUnitLabel(this._matchSnapshot)
      }
    );
    if (pickErr) {
      wx.showToast({ title: pickErr, icon: 'none' });
      return;
    }

    draft[idx] = Object.assign({}, draft[idx], {
      groupName: result.groupName || draft[idx].groupName,
      players: players
    });
    this._setGroupDraft(draft);
  },

  /* ===== 组合分配 ===== */

  onAutoPairTap(e) {
    if (!this.data.showPairingSection || !this.data.showPairingComposeTools) return;
    const groupId = String((e.currentTarget.dataset.groupId != null ? e.currentTarget.dataset.groupId : ''));
    if (!groupId) return;
    const existing = (this.data.pairingDraft && this.data.pairingDraft[groupId]) || [];
    if (existing.length > 0) {
      wx.showModal({
        title: '提示',
        content: '当前组已有组合，自动组合将覆盖当前组合，是否继续？',
        confirmText: '继续',
        cancelText: '取消',
        success: (res) => {
          if (!res.confirm) return;
          this._applyAutoPair(groupId);
        }
      });
      return;
    }
    this._applyAutoPair(groupId);
  },

  _applyAutoPair(groupId) {
    const group = (this.data.groupDraft || []).find((g) => String(g.groupId) === String(groupId));
    if (!group) return;
    const pairingDraft = teamMatchStore.clonePairings(this.data.pairingDraft);
    const existing = (pairingDraft[String(groupId)] || []).slice();
    const list = buildAutoPairingsForGroup(group, this.data.matchId, existing);
    pairingDraft[String(groupId)] = list;
    this._setPairingDraft(pairingDraft);
  },

  onAddPairingTap(e) {
    if (!this.data.showPairingSection || !this.data.showPairingComposeTools) return;
    const groupId = String((e.currentTarget.dataset.groupId != null ? e.currentTarget.dataset.groupId : ''));
    if (!groupId) return;
    const pairingDraft = teamMatchStore.clonePairings(this.data.pairingDraft);
    const list = (pairingDraft[groupId] || []).slice();
    const usedSlots = {};
    list.forEach((pr, idx) => {
      const slotNo = resolvePairingSlotNo(pr && pr.id, idx);
      usedSlots[slotNo] = true;
    });
    // 优先占用已有空成绩行（playerIds=[]）；否则取最小缺失 slot（最多 slot1/slot2）
    const emptyIdx = list.findIndex(
      (pr) => pr && (!Array.isArray(pr.playerIds) || pr.playerIds.filter(Boolean).length === 0)
    );
    if (emptyIdx >= 0) {
      wx.showToast({ title: '请先使用空闲组合位', icon: 'none' });
      return;
    }
    let nextSlot = 0;
    for (let n = 1; n <= 2; n++) {
      if (!usedSlots[n]) {
        nextSlot = n;
        break;
      }
    }
    if (!nextSlot) {
      wx.showToast({ title: '最多两个组合', icon: 'none' });
      return;
    }
    list.push(createEmptyPairing(this.data.matchId, groupId, nextSlot));
    // 按 slot 序号排列，保证第一组合=slot1、第二组合=slot2
    list.sort(
      (a, b) =>
        resolvePairingSlotNo(a && a.id, 0) - resolvePairingSlotNo(b && b.id, 0)
    );
    pairingDraft[groupId] = list;
    this._setPairingDraft(pairingDraft);
  },

  onDeletePairingTap(e) {
    if (!this.data.showPairingSection) return;
    const groupId = String((e.currentTarget.dataset.groupId != null ? e.currentTarget.dataset.groupId : ''));
    const pairingId = String((e.currentTarget.dataset.pairingId != null ? e.currentTarget.dataset.pairingId : ''));
    if (!groupId || !pairingId) return;
    const pairingDraft = teamMatchStore.clonePairings(this.data.pairingDraft);
    // 删除成员：清空 playerIds，保留稳定 slot id（不删槽位对象）
    pairingDraft[groupId] = (pairingDraft[groupId] || []).map((p) => {
      if (!p || String(p.id) !== pairingId) return p;
      return Object.assign({}, p, { playerIds: [] });
    });
    this._setPairingDraft(pairingDraft);
  },

  /* ===== 组合分配：修改组合弹窗 ===== */

  /**
   * 其它组合占用表（排除当前正在编辑的组合）
   * disabled 只允许来自这里，绝不能来自当前组合原始 playerIds / selectedIds
   */
  _getOtherPairingsOccupiedMap(groupId, editingPairingId) {
    const occupied = {};
    const list = (this.data.pairingDraft && this.data.pairingDraft[groupId]) || [];
    list.forEach((pr, idx) => {
      if (!pr || String(pr.id) === String(editingPairingId)) return;
      const label = '组合' + (idx + 1);
      (pr.playerIds || []).forEach((id) => {
        const uid = String(id || '').trim();
        if (uid) occupied[uid] = label;
      });
    });
    return occupied;
  },

  /**
   * 根据弹窗临时 selectedIds + 其它组合占用，重建列表
   * checked / disabled 完全解耦
   */
  _buildPairingPlayerOptions(groupId, editingPairingId, selectedIds) {
    const group = (this.data.groupDraft || []).find((g) => String(g.groupId) === String(groupId));
    if (!group) return [];
    const selectedSet = {};
    (selectedIds || []).forEach((id) => {
      const uid = String(id || '').trim();
      if (uid) selectedSet[uid] = true;
    });
    const occupiedByOther = this._getOtherPairingsOccupiedMap(groupId, editingPairingId);

    return ((group.players || []).filter((p) => p && p.userId)).map((p, index) => {
      const uid = String(p.userId);
      const occupiedLabel = occupiedByOther[uid] || '';
      const checked = !!selectedSet[uid];
      // disabled 只看其它组合；与 checked、当前组合原始 playerIds 无关
      const disabled = !!occupiedLabel;
      return {
        index: index,
        userId: uid,
        name: resolvePlayerDisplayName(p),
        avatar: p.avatar ? mockAvatars.resolveAvatar(p.avatar) : '',
        checked: checked,
        disabled: disabled,
        occupiedTip: occupiedLabel ? ('已在' + occupiedLabel) : ''
      };
    });
  },

  onEditPairingTap(e) {
    if (!this.data.showPairingSection) return;
    const groupId = String((e.currentTarget.dataset.groupId != null ? e.currentTarget.dataset.groupId : ''));
    const pairingId = String((e.currentTarget.dataset.pairingId != null ? e.currentTarget.dataset.pairingId : ''));
    if (!groupId || !pairingId) return;
    const list = (this.data.pairingDraft && this.data.pairingDraft[groupId]) || [];
    const current = list.find((p) => String(p.id) === pairingId) || { playerIds: [] };
    // 打开时：仅用当前组合 playerIds 初始化临时选中；之后不再读 current.playerIds
    const selectedIds = (current.playerIds || []).map((id) => String(id || '').trim()).filter(Boolean);
    const options = this._buildPairingPlayerOptions(groupId, pairingId, selectedIds);
    this.setData({
      pairingEditVisible: true,
      editingPairingGroupId: groupId,
      editingPairingId: pairingId,
      editingPairingSelectedIds: selectedIds,
      pairingEditTitle: '修改组合',
      pairingEditOptions: options
    });
  },

  onTogglePairingEditPlayer(e) {
    const groupId = this.data.editingPairingGroupId;
    const pairingId = this.data.editingPairingId;
    if (!groupId || !pairingId) return;

    const index = Number(e.currentTarget.dataset.index);
    const opt = (this.data.pairingEditOptions || [])[index];
    if (!opt) return;
    // disabled 球员不可点
    if (opt.disabled) return;

    const userId = String(opt.userId || '');
    if (!userId) return;

    // 再次确认：仅其它组合占用才拦截（不看当前组合）
    const occupiedByOther = this._getOtherPairingsOccupiedMap(groupId, pairingId);
    if (occupiedByOther[userId]) return;

    const beforeSelectedIds = (this.data.editingPairingSelectedIds || []).map(String);
    const exists = beforeSelectedIds.indexOf(userId) >= 0;
    const afterSelectedIds = exists
      ? beforeSelectedIds.filter((id) => id !== userId)
      : beforeSelectedIds.concat([userId]);

    // 先更新临时选中，再整表重建 —— checked/disabled 重新计算
    const options = this._buildPairingPlayerOptions(groupId, pairingId, afterSelectedIds);
    this.setData({
      editingPairingSelectedIds: afterSelectedIds,
      pairingEditOptions: options
    });
  },

  closePairingEditSheet() {
    this.setData({
      pairingEditVisible: false,
      editingPairingGroupId: '',
      editingPairingId: '',
      editingPairingSelectedIds: [],
      pairingEditOptions: []
    });
  },

  confirmPairingEdit() {
    const groupId = this.data.editingPairingGroupId;
    const pairingId = this.data.editingPairingId;
    if (!groupId || !pairingId) {
      this.closePairingEditSheet();
      return;
    }
    // 以弹窗临时 selectedIds 为准；过滤掉仍被其它组合占用的异常项
    const occupiedByOther = this._getOtherPairingsOccupiedMap(groupId, pairingId);
    const selectedIds = (this.data.editingPairingSelectedIds || [])
      .map((id) => String(id || '').trim())
      .filter((id) => id && !occupiedByOther[id]);

    const pairingDraft = teamMatchStore.clonePairings(this.data.pairingDraft);
    const list = (pairingDraft[groupId] || []).slice();
    const idx = list.findIndex((p) => String(p.id) === String(pairingId));
    if (idx < 0) {
      this.closePairingEditSheet();
      return;
    }
    list[idx] = Object.assign({}, list[idx], { playerIds: selectedIds });
    pairingDraft[groupId] = list;
    this._setPairingDraft(pairingDraft);
    this.closePairingEditSheet();
  },

  /** 去掉空组：空分组不写入正式 groups */
  _sanitizeGroupDraft(draft) {
    return (Array.isArray(draft) ? draft : []).filter((g) => {
      const players = (g && g.players) || [];
      return players.some((p) => p && String(p.userId || '').trim());
    }).map((g, index) => Object.assign({}, g, {
      groupName: g.groupName || ('第' + (index + 1) + '组')
    }));
  },

  /**
   * 确定分组校验：
   * - 组内/跨组球员不重复
   * - 组合内球员不跨组合重复
   * - 允许未完成组合、允许 1 人组合、允许部分报名未入组
   */
  _validateGroupDraft(draft, pairingDraft) {
    const groups = this._sanitizeGroupDraft(draft);
    if (!groups.length) return '';

    const seen = {};
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i] || {};
      const players = (g.players || []).filter((p) => p && String(p.userId || '').trim());
      if (players.length > PLAYER_SLOTS) {
        return (g.groupName || ('第' + (i + 1) + '组')) + '人数超过 ' + PLAYER_SLOTS + ' 人';
      }
      const localSeen = {};
      for (let j = 0; j < players.length; j++) {
        const id = String(players[j].userId || '').trim();
        if (!id) continue;
        if (localSeen[id]) return '同一分组内存在重复球员';
        localSeen[id] = true;
        if (seen[id]) return '存在重复球员，请检查分组';
        seen[id] = true;
      }
      const teamMap = buildRegisterTeamMap({
        registerInfo: this._registerInfo || { users: [] }
      });
      const gameMode = String(this.data.gameMode || '');
      const structureErr = validatePlayersForRegisterGameMode(
        g.players,
        gameMode,
        this.data.strokeCompositionMode,
        teamMap,
        {
          useComposition: true,
          showCompositionMode: !!this.data.showCompositionMode,
          sideUnit: resolveSideUnitLabel(this._matchSnapshot)
        }
      );
      if (structureErr) return structureErr;
    }

    if (this.data.showPairingSection) {
      const pairingErr = this._validatePairingDraft(groups, pairingDraft);
      if (pairingErr) return pairingErr;
    }

    return '';
  },

  _validatePairingDraft(groups, pairingDraft) {
    const groupPlayerSet = {};
    (groups || []).forEach((g) => {
      const gid = String(g.groupId || '');
      groupPlayerSet[gid] = {};
      ((g.players || [])).forEach((p) => {
        const id = p && p.userId ? String(p.userId).trim() : '';
        if (id) groupPlayerSet[gid][id] = true;
      });
    });

    const globalPairSeen = {};
    const draft = pairingDraft || {};
    const groupIds = Object.keys(draft);
    for (let gi = 0; gi < groupIds.length; gi++) {
      const gid = groupIds[gi];
      const list = draft[gid] || [];
      const localPairSeen = {};
      for (let i = 0; i < list.length; i++) {
        const ids = (list[i] && list[i].playerIds) || [];
        for (let j = 0; j < ids.length; j++) {
          const id = String(ids[j] || '').trim();
          if (!id) continue;
          if (groupPlayerSet[gid] && !groupPlayerSet[gid][id]) {
            return '组合中存在不属于当前出发组的球员';
          }
          if (localPairSeen[id]) return '同一球员不能属于多个组合';
          localPairSeen[id] = true;
          if (globalPairSeen[id]) return '同一球员不能属于多个组合';
          globalPairSeen[id] = true;
        }
      }
    }
    return '';
  },

  _clearGroupDerivedFields(matchPatch) {
    const next = matchPatch || {};
    next.pairings = {};
    // 清空分组：成绩行保留 entityId，members 置空；不删 teamScoresByEntity / scoreData
    const se =
      next.scoreEntities && typeof next.scoreEntities === 'object' && !Array.isArray(next.scoreEntities)
        ? next.scoreEntities
        : null;
    if (se) {
      const cleared = {};
      Object.keys(se).forEach((groupId) => {
        const list = Array.isArray(se[groupId]) ? se[groupId] : [];
        cleared[groupId] = list
          .filter((e) => e && e.entityId != null && String(e.entityId).trim() !== '')
          .map((e) =>
            Object.assign({}, e, {
              entityId: String(e.entityId).trim(),
              members: [],
              teamGroupId: ''
            })
          );
      });
      next.scoreEntities = cleared;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'groupCount')) next.groupCount = 0;
    if (Object.prototype.hasOwnProperty.call(next, 'teeGroups')) next.teeGroups = [];
    if (Object.prototype.hasOwnProperty.call(next, 'groupSummary')) next.groupSummary = null;
    if (Object.prototype.hasOwnProperty.call(next, 'pairingMap')) next.pairingMap = {};
    return next;
  },

  _validateLiveGroupDraft(draft) {
    const groups = Array.isArray(draft) ? draft : [];
    const seen = {};
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i] || {};
      const players = Array.isArray(g.players) ? g.players : [];
      const localSeen = {};
      for (let j = 0; j < players.length; j++) {
        const id = String((players[j] && players[j].userId) || '').trim();
        if (!id) continue;
        if (localSeen[id]) return '同一分组内存在重复球员';
        localSeen[id] = true;
        if (seen[id]) return '存在重复球员，请检查分组';
        seen[id] = true;
      }
    }
    return '';
  },

  _findPlayerEntryByPosition(group, position) {
    const pos = Number(position) || 0;
    const players = Array.isArray(group && group.players) ? group.players : [];
    return players.find((player) =>
      Number(player && (player.position != null ? player.position : player.slotIndex)) === pos
    ) || null;
  },

  _buildLivePlayerEntry(oldEntry, draftEntry, position) {
    const oldUserId = oldEntry && (oldEntry.userId || oldEntry.playerId || oldEntry.id)
      ? String(oldEntry.userId || oldEntry.playerId || oldEntry.id).trim()
      : '';
    const nextUserId = draftEntry && draftEntry.userId ? String(draftEntry.userId).trim() : '';
    const scorePlayerId = resolveScorePlayerId(oldEntry) || resolveScorePlayerId(draftEntry) || oldUserId || nextUserId;
    if (!nextUserId) {
      const empty = { position: position, userId: '', playerId: '', id: '' };
      if (scorePlayerId) empty.scorePlayerId = scorePlayerId;
      return empty;
    }
    const next = Object.assign({}, oldEntry || {}, {
      position: position,
      userId: nextUserId,
      playerId: nextUserId,
      id: nextUserId
    });
    if (draftEntry && draftEntry.avatar) next.avatar = draftEntry.avatar;
    if (draftEntry && draftEntry.displayName) next.displayName = draftEntry.displayName;
    if (draftEntry && draftEntry.gender) next.gender = draftEntry.gender;
    if (draftEntry && (draftEntry.tPosition || draftEntry.tee || draftEntry.gender)) {
      next.tPosition = tPosition.resolve(draftEntry);
      next.tee = next.tPosition;
    } else if (oldEntry && (oldEntry.tPosition || oldEntry.tee)) {
      next.tPosition = tPosition.resolve(oldEntry);
      next.tee = next.tPosition;
    }
    if (scorePlayerId) next.scorePlayerId = scorePlayerId;
    return next;
  },

  _buildLiveGroupFromDraft(oldGroup, draftGroup, index) {
    const base = oldGroup || {};
    const groupId = draftGroup && draftGroup.groupId
      ? String(draftGroup.groupId)
      : (base.groupId ? String(base.groupId) : ('group-tab-' + Date.now() + '-' + (index + 1)));
    const next = Object.assign({}, base, {
      groupId: groupId,
      groupName: draftGroup && draftGroup.groupName ? String(draftGroup.groupName) : (base.groupName || ('第' + (index + 1) + '组')),
      players: Array.from({ length: PLAYER_SLOTS }, (_, i) => {
        const position = i + 1;
        const oldEntry = this._findPlayerEntryByPosition(base, position);
        const draftEntry = this._findPlayerEntryByPosition(draftGroup, position);
        return this._buildLivePlayerEntry(oldEntry, draftEntry, position);
      })
    });
    const teeTime = draftGroup && draftGroup.teeTime != null ? String(draftGroup.teeTime).trim() : '';
    if (teeTime) next.teeTime = teeTime;
    const startHole = Number(draftGroup && draftGroup.startHole);
    if (Number.isFinite(startHole) && startHole >= 1 && startHole <= 18) {
      next.startHole = Math.floor(startHole);
    }
    return next;
  },

  /**
   * normalize 后按 userId / 座位回填 LIVE 的 scorePlayerId 等字段（normalize 只产出 position+userId）
   */
  _rematerializeLivePlayersAfterNormalize(normalizedGroups, liveGroupsBefore) {
    const byGroupUser = {};
    const byGroupPos = {};
    (Array.isArray(liveGroupsBefore) ? liveGroupsBefore : []).forEach((g) => {
      const gid = g && g.groupId != null ? String(g.groupId) : '';
      if (!gid) return;
      if (!byGroupUser[gid]) byGroupUser[gid] = {};
      if (!byGroupPos[gid]) byGroupPos[gid] = {};
      (Array.isArray(g.players) ? g.players : []).forEach((p) => {
        if (!p) return;
        const pos = Number(p.position) || 0;
        const uid = p.userId != null ? String(p.userId).trim() : '';
        const scorePlayerId = resolveScorePlayerId(p);
        if (uid) {
          byGroupUser[gid][uid] = p;
        } else if (pos >= 1) {
          byGroupPos[gid][pos] = p;
        }
      });
    });

    return (Array.isArray(normalizedGroups) ? normalizedGroups : []).map((g) => {
      const gid = g && g.groupId != null ? String(g.groupId) : '';
      const players = (Array.isArray(g.players) ? g.players : []).map((slot) => {
        const position = Number(slot && slot.position) || 0;
        const uid = slot && slot.userId != null ? String(slot.userId).trim() : '';
        if (uid) {
          const prev = (byGroupUser[gid] && byGroupUser[gid][uid]) || {};
          return withScorePlayerFields(
            Object.assign({}, prev, slot, {
              position: position,
              userId: uid,
              playerId: uid,
              id: uid
            }),
            prev
          );
        }
        const prevEmpty = (byGroupPos[gid] && byGroupPos[gid][position]) || {};
        return withScorePlayerFields(
          {
            position: position,
            userId: '',
            playerId: '',
            id: ''
          },
          prevEmpty
        );
      });
      return Object.assign({}, g, { players: players });
    });
  },

  _confirmLiveGroups(match, rawDraft, pairingDraft) {
    const oldGroups = Array.isArray(match && match.groups) ? match.groups : [];
    const sanitized = this._sanitizeGroupDraft(rawDraft);
    const isClear = sanitized.length === 0;
    const oldById = {};
    oldGroups.forEach((group) => {
      const groupId = group && group.groupId ? String(group.groupId) : '';
      if (groupId) oldById[groupId] = group;
    });
    const draftIds = {};
    sanitized.forEach((group) => {
      const groupId = group && group.groupId ? String(group.groupId) : '';
      if (groupId) draftIds[groupId] = true;
    });
    const deletedGroupIds = Object.keys(oldById).filter((groupId) => !draftIds[groupId]);

    // 先按座位合并，保留 scorePlayerId（LIVE 换人继承）
    let nextGroups = sanitized.map((group, index) => {
      const groupId = group && group.groupId ? String(group.groupId) : '';
      return this._buildLiveGroupFromDraft(groupId ? oldById[groupId] : null, group, index);
    });

    const nextScoreData = match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? Object.assign({}, match.scoreData)
      : {};
    deletedGroupIds.forEach((groupId) => {
      delete nextScoreData[groupId];
    });

    const matchId = match && match.matchId != null ? String(match.matchId).trim() : '';
    const gameMode = String(match.gameMode || this.data.gameMode || '');
    const isG4Stroke = isG4FamilyMode(gameMode);
    const isG2G3Stroke = isG2G3FamilyMode(gameMode);
    const isG5MatchPlay = isG5MatchPlayMode(gameMode);

    // 与报名一致：座位规范化；再回填 LIVE scorePlayerId（G5 复用现有 normalize，不进组合逻辑）
    if (!isClear && (isG4Stroke || isG2G3Stroke || isG5MatchPlay)) {
      const beforeNormalize = nextGroups;
      nextGroups = this._rematerializeLivePlayersAfterNormalize(
        normalizeFormalGroupSeats(nextGroups, match),
        beforeNormalize
      );
    }

    // 与报名一致：G4/G8 按座位重建 pairings（复用 slot id）
    const shouldPersistPairings = this.data.showPairingSection || isG4Stroke;
    let nextPairings = {};
    if (!isClear && shouldPersistPairings) {
      if (isG4Stroke) {
        const matchPairings =
          match.pairings && typeof match.pairings === 'object' && !Array.isArray(match.pairings)
            ? match.pairings
            : {};
        const draftSource = pairingDraft != null ? pairingDraft : (this.data.pairingDraft || {});
        const rebuilt = {};
        nextGroups.forEach((group) => {
          const gid = group && group.groupId != null ? String(group.groupId) : '';
          if (!gid) return;
          const fromDraft = draftSource && Object.prototype.hasOwnProperty.call(draftSource, gid)
            ? draftSource[gid]
            : null;
          const existingList = Array.isArray(fromDraft)
            ? fromDraft
            : (Array.isArray(matchPairings[gid]) ? matchPairings[gid] : []);
          rebuilt[gid] = buildAutoPairingsForGroup(group, matchId, existingList);
        });
        nextPairings = teamMatchStore.sanitizePairings(rebuilt);
      } else {
        const pairingSource = this.data.showPairingSection
          ? (pairingDraft != null ? pairingDraft : (this.data.pairingDraft || {}))
          : (match.pairings || {});
        let draftPairings = teamMatchStore.clonePairings(pairingSource);
        deletedGroupIds.forEach((groupId) => {
          delete draftPairings[groupId];
        });
        nextPairings = teamMatchStore.sanitizePairings(
          this._prunePairingsToGroups(nextGroups, draftPairings)
        );
      }
    }

    let next = Object.assign({}, match, {
      groups: nextGroups,
      pairings: isClear ? {} : (shouldPersistPairings ? nextPairings : {}),
      scoreData: nextScoreData,
      updatedAt: Date.now()
    });
    if (this.data.showCompositionMode) {
      next.strokeCompositionMode = this.data.strokeCompositionMode === '2+2' ? '2+2' : '4+0';
    } else if (isG6G7MatchPlayMode(gameMode) && !isClear) {
      // G6/G7：不依赖用户选择；双方分队结构对应 2+2 Entity 切分
      next.strokeCompositionMode = '2+2';
    }
    if (isClear) {
      next = this._clearGroupDerivedFields(next);
    } else if (!shouldPersistPairings) {
      next.pairings = {};
    }

    // 与报名一致：stroke entity 校验 + sync（不碰 teamScoresByEntity）
    if (!isClear) {
      const check = validateStrokeEntities(next);
      if (!check || check.valid !== true) {
        console.warn('[stroke-entity-validate]', check && check.reason ? check.reason : 'invalid');
        this.setData({ saving: false });
        wx.showToast({ title: STROKE_ENTITY_INVALID_TIP, icon: 'none' });
        return;
      }
      next.scoreEntities = syncStrokeEntities(next);
    }

    teamMatchStore.saveMatch(next);
    this._leavingConfirmed = true;
    wx.showToast({ title: isClear ? '分组已清空' : '分组已保存', icon: 'success' });
    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 400);
  },

  onCancel() {
    this._leavingConfirmed = true;
    wx.navigateBack({ delta: 1 });
  },

  onBack() {
    this.onCancel();
  },

  onConfirm() {
    if (this.data.saving) return;
    const rawDraft = Array.isArray(this.data.groupDraft) ? this.data.groupDraft : [];
    const pairingDraft = this.data.pairingDraft || {};
    // create / edit / live：同一套分组校验（含 G4）
    const err = this._validateGroupDraft(rawDraft, pairingDraft);
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    if (!match) {
      wx.showToast({ title: '未找到比赛信息', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    if (this.data.mode === 'live') {
      this._confirmLiveGroups(match, rawDraft, pairingDraft);
      return;
    }
    const sanitized = this._sanitizeGroupDraft(rawDraft);
    const isClear = sanitized.length === 0;
    // 正式 groups 只持久化 position + userId；展示字段由详情页 hydrate
    // 按 groupId 合并保留已有出发信息（teeTime / startHole）
    const teeSheetManage = require('../../../../utils/teeSheetManage.js');
    let formal = isClear ? [] : toFormalGroups(sanitized);
    if (!isClear) {
      formal = teeSheetManage.mergeTeeFieldsByGroupId(match.groups, formal);
    }

    const gameMode = String(match.gameMode || this.data.gameMode || '');
    const isG4Stroke = isG4FamilyMode(gameMode);
    const isG2G3Stroke = isG2G3FamilyMode(gameMode);
    const isG5MatchPlay = isG5MatchPlayMode(gameMode);
    // 报名保存：统一正式座位规范化（position ≠ 选人顺序）；不碰 pairing / entity / score
    // G5：复用现有 normalizeFormalGroupSeats，不进 composition / pairings
    if (!isClear && (isG4Stroke || isG2G3Stroke || isG5MatchPlay)) {
      formal = normalizeFormalGroupSeats(formal, match);
    }
    // G4/G8 成绩主体来自 pairings；即使 UI 组合区未开，保存时仍保留/写入 pairings
    const shouldPersistPairings = this.data.showPairingSection || isG4Stroke;

    let formalPairings = {};
    if (!isClear && shouldPersistPairings) {
      if (isG4Stroke) {
        // normalize 后按座位重建 pairing，复用已有 slot id（draft 优先，否则 match）
        const matchPairings =
          match.pairings && typeof match.pairings === 'object' && !Array.isArray(match.pairings)
            ? match.pairings
            : {};
        const rebuilt = {};
        formal.forEach((group) => {
          const gid = group && group.groupId != null ? String(group.groupId) : '';
          if (!gid) return;
          const fromDraft = pairingDraft && Object.prototype.hasOwnProperty.call(pairingDraft, gid)
            ? pairingDraft[gid]
            : null;
          const existingList = Array.isArray(fromDraft)
            ? fromDraft
            : (Array.isArray(matchPairings[gid]) ? matchPairings[gid] : []);
          rebuilt[gid] = buildAutoPairingsForGroup(group, matchId, existingList);
        });
        formalPairings = teamMatchStore.sanitizePairings(rebuilt);
      } else {
        const pairingSource = this.data.showPairingSection
          ? pairingDraft
          : (match.pairings || {});
        const pruned = this._prunePairingsToGroups(formal, pairingSource);
        formalPairings = teamMatchStore.sanitizePairings(pruned);
      }
    }

    let next = Object.assign({}, match, {
      groups: formal,
      pairings: isClear ? {} : (shouldPersistPairings ? formalPairings : {}),
      updatedAt: Date.now()
    });
    if (this.data.showCompositionMode) {
      next.strokeCompositionMode = this.data.strokeCompositionMode === '2+2' ? '2+2' : '4+0';
    } else if (isG6G7MatchPlayMode(gameMode) && !isClear) {
      // G6/G7：不依赖用户选择；双方分队结构对应 2+2 Entity 切分
      next.strokeCompositionMode = '2+2';
    }
    if (isClear) {
      next = this._clearGroupDerivedFields(next);
    } else if (!shouldPersistPairings) {
      next.pairings = {};
    }

    // 报名期：合并成绩行（已有 entityId 只更新 members；新增主体才新建；不清 teamScoresByEntity）
    if (!isClear) {
      const check = validateStrokeEntities(next);
      if (!check || check.valid !== true) {
        console.warn('[stroke-entity-validate]', check && check.reason ? check.reason : 'invalid');
        this.setData({ saving: false });
        wx.showToast({ title: STROKE_ENTITY_INVALID_TIP, icon: 'none' });
        return;
      }
      next.scoreEntities = syncStrokeEntities(next);
    }

    teamMatchStore.saveMatch(next);
    this._leavingConfirmed = true;
    wx.showToast({
      title: isClear ? '分组已清空' : '分组已保存',
      icon: 'success'
    });
    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 400);
  },

  stopPropagation() {}
});
