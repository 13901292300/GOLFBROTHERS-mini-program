/**
 * 球队赛分组草稿纯逻辑（从 group-editor 抽出）
 * - 供 group-editor 与 Series 赛程 TAB 共用
 * - 不读写 storage；不改变既有校验语义
 */

const {
  isTeamMatchFamily,
  isInterTeamMatch
} = require('./teamMatchCapabilities.js');
const playerManage = require('./playerManage.js');
const mockAvatars = require('./mockAvatars.js');
const playerDirectory = require('./playerDirectory.js');
const tPosition = require('./tPosition.js');
const teamMatchStore = require('./teamMatchStore.js');
const {
  buildRegisterTeamMap,
  isG5MatchPlayMode,
  isG6G7MatchPlayMode,
  isG8MatchPlayMode,
  isG2G3FamilyMode,
  isG4FamilyMode,
  validateG5MatchPlayPlayers,
  validateG6G7MatchPlayPlayers,
  validateG8MatchPlayPlayers
} = require('./strokeEntityValidator.js');

function resolveSideUnitLabel(matchLike) {
  return isInterTeamMatch(matchLike) ? '球队' : '分队';
}

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
      groupName: u.groupName != null ? String(u.groupName).trim() : '',
      seriesParticipantId:
        u.seriesParticipantId != null ? String(u.seriesParticipantId).trim() : '',
      affiliationId: u.affiliationId != null ? String(u.affiliationId).trim() : '',
      participantNameSnapshot:
        u.participantNameSnapshot != null ? String(u.participantNameSnapshot).trim() : '',
      participantShortNameSnapshot:
        u.participantShortNameSnapshot != null
          ? String(u.participantShortNameSnapshot).trim()
          : '',
      participantColorSnapshot:
        u.participantColorSnapshot != null ? String(u.participantColorSnapshot).trim() : '',
      fromSeriesRoster: !!(u.fromSeriesRoster || u.isSeriesRoster)
    };
  });
  return map;
}

/** 编辑草稿：从报名名单补齐展示字段；席位归属快照必须保留（不写回正式 groups） */
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
        // 席位正式字段优先，lookup 仅补缺（Series 空 registerInfo 时靠席位快照）
        const affiliation = pickSeatAffiliationFields(Object.assign({}, src, found));
        return withScorePlayerFields(
          Object.assign(
            {
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
            },
            affiliation
          ),
          found
        );
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
      const affiliation = pickSeatAffiliationFields(found);
      return withScorePlayerFields(
        Object.assign(
          {
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
          },
          affiliation
        ),
        found
      );
    })
  }));
}

/**
 * Series 席位归属快照契约（只拷贝必要字段，不整包 participant）：
 * - seriesParticipantId
 * - matchTeamId / affiliationId（普通赛事兼容）
 * - participantNameSnapshot / participantShortNameSnapshot / participantColorSnapshot
 * 名称兼容回退：matchTeamName / groupName / shortNameSnapshot
 */
function pickSeatAffiliationFields(found) {
  if (!found || typeof found !== 'object') return {};
  const out = {};
  const seriesParticipantId =
    found.seriesParticipantId != null ? String(found.seriesParticipantId).trim() : '';
  if (seriesParticipantId) out.seriesParticipantId = seriesParticipantId;
  const matchTeamId =
    found.matchTeamId != null ? String(found.matchTeamId).trim() : '';
  if (matchTeamId) out.matchTeamId = matchTeamId;
  const affiliationId =
    found.affiliationId != null ? String(found.affiliationId).trim() : '';
  if (affiliationId) out.affiliationId = affiliationId;
  const seatGroupId = found.groupId != null ? String(found.groupId).trim() : '';
  if (seatGroupId) out.groupId = seatGroupId;
  const matchTeamName =
    found.matchTeamName != null ? String(found.matchTeamName).trim() : '';
  if (matchTeamName) out.matchTeamName = matchTeamName;
  const groupName = found.groupName != null ? String(found.groupName).trim() : '';
  if (groupName) out.groupName = groupName;

  const nameSnap =
    (found.participantNameSnapshot != null && String(found.participantNameSnapshot).trim()) ||
    (found.nameSnapshot != null && String(found.nameSnapshot).trim()) ||
    matchTeamName ||
    groupName ||
    '';
  if (nameSnap) out.participantNameSnapshot = nameSnap;

  const shortSnap =
    (found.participantShortNameSnapshot != null &&
      String(found.participantShortNameSnapshot).trim()) ||
    (found.shortNameSnapshot != null && String(found.shortNameSnapshot).trim()) ||
    (found.shortName != null && String(found.shortName).trim()) ||
    '';
  if (shortSnap) out.participantShortNameSnapshot = shortSnap;

  const colorSnap =
    (found.participantColorSnapshot != null &&
      String(found.participantColorSnapshot).trim()) ||
    (found.colorSnapshot != null && String(found.colorSnapshot).trim()) ||
    '';
  if (colorSnap) out.participantColorSnapshot = colorSnap;

  if (found.fromSeriesRoster === true) out.fromSeriesRoster = true;
  return out;
}

/**
 * 正式 groups：保存 position + userId + tPosition（位号保留，含空位）；保留 teeTime / startHole。
 * 另：若 draft 已有展示快照则原样保留（昵称/性别/tee/归属），供 Series 赛程只读表复用；
 * 不新造字段语义，普通赛事仍以 userId + 报名 hydrate 为主。
 */
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
          const displayName =
            (found.displayName != null && String(found.displayName).trim()) ||
            (found.competitionName != null && String(found.competitionName).trim()) ||
            (found.name != null && String(found.name).trim()) ||
            (found.nickName != null && String(found.nickName).trim()) ||
            (found.nickname != null && String(found.nickname).trim()) ||
            (found.nameSnapshot != null && String(found.nameSnapshot).trim()) ||
            '';
          if (displayName) {
            entry.displayName = displayName;
            entry.competitionName = displayName;
          }
          const gender = found.gender != null ? String(found.gender).trim() : '';
          if (gender) entry.gender = gender;
          const avatar = found.avatar != null ? String(found.avatar).trim() : '';
          if (avatar) entry.avatar = avatar;
          const teeRaw =
            found.tPosition === tPosition.RED_T || found.tPosition === tPosition.BLUE_T
              ? found.tPosition
              : found.tee === tPosition.RED_T || found.tee === tPosition.BLUE_T
                ? found.tee
                : '';
          if (teeRaw) entry.tee = teeRaw;
          Object.assign(entry, pickSeatAffiliationFields(found));
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

/** 去掉空组：空分组不写入正式 groups（与 group-editor 原 _sanitizeGroupDraft 一致） */
function sanitizeGroupDraft(draft) {
  return (Array.isArray(draft) ? draft : [])
    .filter((g) => {
      const players = (g && g.players) || [];
      return players.some((p) => p && String(p.userId || '').trim());
    })
    .map((g, index) =>
      Object.assign({}, g, {
        groupName: g.groupName || '第' + (index + 1) + '组'
      })
    );
}

function validatePairingDraft(groups, pairingDraft) {
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
}

function validateGroupDraft(draft, pairingDraft, options) {
  const opts = options || {};
  const groups = sanitizeGroupDraft(draft);
  if (!groups.length) return '';
  const seen = {};
  const gameMode = String(opts.gameMode || '');
  const strokeCompositionMode = opts.strokeCompositionMode;
  const showCompositionMode = !!opts.showCompositionMode;
  const showPairingSection = !!opts.showPairingSection;
  const registerInfo = opts.registerInfo || { users: [] };
  const matchLike = opts.matchLike || null;
  const sideUnit = opts.sideUnit || resolveSideUnitLabel(matchLike);

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
    const teamMap = buildRegisterTeamMap({ registerInfo: registerInfo });
    const structureErr = validatePlayersForRegisterGameMode(
      g.players,
      gameMode,
      strokeCompositionMode,
      teamMap,
      {
        useComposition: true,
        showCompositionMode: showCompositionMode,
        sideUnit: sideUnit
      }
    );
    if (structureErr) return structureErr;
  }

  if (showPairingSection) {
    const pairingErr = validatePairingDraft(groups, pairingDraft);
    if (pairingErr) return pairingErr;
  }
  return '';
}

module.exports = {
  PLAYER_SLOTS: PLAYER_SLOTS,
  DEFAULT_REGISTER_GROUPS: DEFAULT_REGISTER_GROUPS,
  STROKE_ENTITY_INVALID_TIP: '当前分组不符合该比赛赛制要求，请重新分组。',
  resolveSideUnitLabel: resolveSideUnitLabel,
  resolveScorePlayerId: resolveScorePlayerId,
  withScorePlayerFields: withScorePlayerFields,
  createEmptyGroupPlayer: createEmptyGroupPlayer,
  createEmptyGroup: createEmptyGroup,
  buildRegisterPlayerLookup: buildRegisterPlayerLookup,
  hydrateDraftPlayers: hydrateDraftPlayers,
  cloneTournamentGroups: cloneTournamentGroups,
  toFormalGroups: toFormalGroups,
  pickSeatAffiliationFields: pickSeatAffiliationFields,
  buildG4RegisterTeamMap: buildG4RegisterTeamMap,
  listG4TeamOrder: listG4TeamOrder,
  hasFormalGroups: hasFormalGroups,
  buildInitialGroupDraft: buildInitialGroupDraft,
  resolvePlayerDisplayName: resolvePlayerDisplayName,
  shouldShowAvatarTeamLabel: shouldShowAvatarTeamLabel,
  mapPlayersForCard: mapPlayersForCard,
  resolveRegisterInfo: resolveRegisterInfo,
  buildRegisterTeamGroupMap: buildRegisterTeamGroupMap,
  resolvePlayerTeamGroupId: resolvePlayerTeamGroupId,
  listFilledPickPlayers: listFilledPickPlayers,
  ensurePlayersHaveTeam: ensurePlayersHaveTeam,
  allMembersSameTeam: allMembersSameTeam,
  generatePairCompositionsByTeam: generatePairCompositionsByTeam,
  validateGeneratedCompositions: validateGeneratedCompositions,
  validateG2G3TwoPlusTwoPlayers: validateG2G3TwoPlusTwoPlayers,
  validateStrokeCompositionPlayers: validateStrokeCompositionPlayers,
  validateG4GroupStructurePlayers: validateG4GroupStructurePlayers,
  validatePlayersForRegisterGameMode: validatePlayersForRegisterGameMode,
  resolveRegisterTeamId: resolveRegisterTeamId,
  buildPreviewRegisterMaps: buildPreviewRegisterMaps,
  buildMatchPlayTeamPreview: buildMatchPlayTeamPreview,
  buildCompositionPreview: buildCompositionPreview,
  buildG4CompositionPreviewFromSeats: buildG4CompositionPreviewFromSeats,
  resolveRegisterSubTabs: resolveRegisterSubTabs,
  buildPairingSlotId: buildPairingSlotId,
  resolvePairingSlotNo: resolvePairingSlotNo,
  createEmptyPairing: createEmptyPairing,
  buildAutoPairingsForGroup: buildAutoPairingsForGroup,
  sanitizeGroupDraft: sanitizeGroupDraft,
  validatePairingDraft: validatePairingDraft,
  validateGroupDraft: validateGroupDraft
};
