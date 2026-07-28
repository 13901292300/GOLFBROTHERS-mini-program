/**
 * 统计数据适配层（Stats-0.3-A1）
 *
 * 输入：match（teamMatchStore 比赛对象）
 * 输出：statistics rows（供统计页消费）
 *
 * G1：buildStatisticsRows → scoresByPlayer（个人）
 * G2/G3/G4：buildEntityStatisticsRows → scoreEntities + teamScoresByEntity（组合）
 * G5：buildMatchPlayStatisticsRows → buildStatisticsRows（个人比洞，scoresByPlayer）
 * G6/G7/G8：buildMatchPlayStatisticsRows → scoresBySide 转 Entity 视图后复用 buildEntityStatisticsRows
 *
 * 洞状态：groupsStore.getScoreStatus
 * 标准杆：holeLayout.resolveLayoutFromContext
 */

const groupsStore = require('./groupsStore.js');
const holeLayout = require('./holeLayout.js');
const halfCourse = require('./halfCourse.js');
const playerManage = require('./playerManage.js');
const tPosition = require('./tPosition.js');
const mockAvatars = require('./mockAvatars.js');
const matchStatus = require('./matchStatus.js');
const {
  resolveStrokeKind,
  resolveGameMode,
  isG5MatchPlayMode,
  isG6G7MatchPlayMode,
  isG8MatchPlayMode,
  isMatchPlayBoardMode,
  buildRegisterTeamMap,
  listFilledPlayers
} = require('./strokeEntityValidator.js');

const SCORE_CELL_COUNT = holeLayout.SCORE_CELL_COUNT || 18;

/** 与详情页 _resolveAnyPlayerId 一致 */
function resolveAnyPlayerId(raw) {
  if (!raw || typeof raw !== 'object') return '';
  const id = raw.userId || raw.playerId || raw.id || raw.uid || raw.openid;
  return id != null ? String(id).trim() : '';
}

/**
 * 与详情页 _resolveSlotScorePlayerId / teamMatchStore.resolveSlotScorePlayerId 一致：
 * scorePlayerId || slotScorePlayerId || scoreOwnerId || currentPlayerId
 */
function resolveSlotScorePlayerId(slotPlayer, currentPlayerId) {
  const p = slotPlayer || {};
  const scorePlayerId = p.scorePlayerId || p.slotScorePlayerId || p.scoreOwnerId;
  const resolved = scorePlayerId != null ? String(scorePlayerId).trim() : '';
  if (resolved) return resolved;
  return currentPlayerId != null ? String(currentPlayerId).trim() : '';
}

/** 与详情页 _resolveScoresByPlayerRecord 一致 */
function resolveScoresByPlayerRecord(scoresByPlayer, slotPlayer, currentPlayerId) {
  if (!scoresByPlayer || typeof scoresByPlayer !== 'object') return null;
  const scorePlayerId = resolveSlotScorePlayerId(slotPlayer, currentPlayerId);
  if (scorePlayerId && scoresByPlayer[scorePlayerId]) return scoresByPlayer[scorePlayerId];
  const playerId = currentPlayerId != null ? String(currentPlayerId).trim() : '';
  if (playerId && scoresByPlayer[playerId]) return scoresByPlayer[playerId];
  return null;
}

function isFilledScore(score) {
  if (typeof matchStatus.isFilledScore === 'function') {
    return matchStatus.isFilledScore(score) && !Number.isNaN(Number(score));
  }
  return score !== null && score !== undefined && score !== '' && !Number.isNaN(Number(score));
}

/** 与详情页 _getMatchHolePars 等价 */
function resolveMatchHolePars(match) {
  if (!match) return holeLayout.getLayout().holePars.slice();
  const parsed = (!match.front9Course && !match.back9Course)
    ? halfCourse.parseCourseHalfText(match.courseHalfText || match.courseHalf || match.halfText)
    : {};
  const layout = holeLayout.resolveLayoutFromContext({
    courseId: match.courseId || '',
    courseName: match.courseName || '',
    front9Course: match.front9Course || parsed.front9Course || null,
    back9Course: match.back9Course || parsed.back9Course || null
  });
  return (layout.holePars || []).slice();
}

function collectRegisterPlayerSources(match) {
  const lists = [];
  const pushList = (arr) => {
    if (Array.isArray(arr) && arr.length) lists.push(arr);
  };
  const registerInfo = match && match.registerInfo;
  if (registerInfo && typeof registerInfo === 'object') {
    pushList(registerInfo.users);
    pushList(registerInfo.players);
  }
  pushList(match && match.participants);
  pushList(match && match.players);
  return lists;
}

/** 报名名单 lookup：昵称 / 头像 / 性别 / T台（与详情 hydrate 同源字段） */
function buildPlayerLookup(match) {
  const map = {};
  collectRegisterPlayerSources(match).forEach((users) => {
    users.forEach((u) => {
      if (!u || typeof u !== 'object') return;
      const primaryId = resolveAnyPlayerId(u);
      if (!primaryId) return;
      const gender = playerManage.resolveMatchGender
        ? playerManage.resolveMatchGender(u)
        : (playerManage.getGenderDisplay(u).gender || '');
      const teeCode = tPosition.defaultFromGender(gender);
      const entry = {
        userId: primaryId,
        nickname: playerManage.resolveMatchNickname(u) || '未知球员',
        avatar: u.avatar || u.avatarUrl || '',
        gender: gender,
        tee: teeCode,
        tPosition: u.tPosition || teeCode
      };
      const aliasIds = [u.userId, u.playerId, u.id, u.uid, u.openid]
        .map((v) => (v != null ? String(v).trim() : ''))
        .filter(Boolean);
      if (aliasIds.indexOf(primaryId) < 0) aliasIds.push(primaryId);
      aliasIds.forEach((id) => {
        if (!map[id]) map[id] = entry;
      });
    });
  });
  return map;
}

function resolveTeeColor(player, lookup) {
  if (player && player.teeColor) return String(player.teeColor);
  const tp = tPosition.resolve(
    Object.assign({}, lookup || {}, player || {})
  );
  return tp === tPosition.RED_T ? '#dc2626' : '#00aeef';
}

/**
 * 8421 单洞得分：按相对标准杆 diff
 * diff <= -3 → 32；-2→16；-1→8；0→4；1→2；2→1；3→0；>=4 → 3-diff
 */
function get8421Score(diff) {
  const d = Number(diff);
  if (!Number.isFinite(d)) return 0;
  if (d <= -3) return 32;
  if (d === -2) return 16;
  if (d === -1) return 8;
  if (d === 0) return 4;
  if (d === 1) return 2;
  if (d === 2) return 1;
  if (d === 3) return 0;
  return 3 - d;
}

/**
 * 单球员：由 scores/putts/fairways/penalties/sands + pars 计算统计
 * 同一洞循环内累加 TOTAL / PUT / GIR% / FWY% / PEN / SAND / 8421 / EAG…DBL+；未填洞不参与
 *
 * PUT：已填成绩洞对应 putts[i] 之和（默认 2，最小 0）
 * GIR：approachStrokes = score - putts；若 approachStrokes <= par - 2 则计 GIR
 *      girPercent = girCount / playedHoles * 100（仅已完成洞）
 * FWY：仅已填且 Par 4/5；fairwayHit / fairwayAttempt * 100；无有效开球洞为 '-'
 * PEN：已填成绩洞对应 penalties[i] 之和（缺省 0）；无完成洞为 0（同 PUT）
 * SAND：已填成绩洞对应 sands[i] 之和（缺省 0）；无完成洞为 0（同 PUT）
 * 8421：已填且 holePar 存在时累加 get8421Score(score - par)；无完成洞为 '-'
 */
function computePlayerHoleStats(scores, putts, pars, fairways, penalties, sands) {
  const scoreArr = Array.isArray(scores) ? scores : [];
  const puttArr = Array.isArray(putts) ? putts : [];
  const parArr = Array.isArray(pars) ? pars : [];
  const fairwayArr = Array.isArray(fairways) ? fairways : [];
  const penaltyArr = Array.isArray(penalties) ? penalties : [];
  const sandArr = Array.isArray(sands) ? sands : [];
  let eagle = 0;
  let birdie = 0;
  let par = 0;
  let bogey = 0;
  let doublePlus = 0;
  let total = 0;
  let puttsTotal = 0;
  let penaltyTotal = 0;
  let sandTotal = 0;
  let girCount = 0;
  let playedHoles = 0;
  let fairwayAttempt = 0;
  let fairwayHit = 0;
  let stat8421Sum = 0;
  const limit = Math.min(SCORE_CELL_COUNT, Math.max(scoreArr.length, parArr.length, 18));

  for (let i = 0; i < limit; i++) {
    const score = scoreArr[i];
    if (!isFilledScore(score)) continue;

    const scoreNum = Number(score);
    total += scoreNum;
    playedHoles += 1;

    const rawPutt = puttArr[i];
    const puttRawNum = (rawPutt === null || rawPutt === undefined || rawPutt === '')
      ? 2
      : Number(rawPutt);
    const puttNum = Number.isFinite(puttRawNum) && puttRawNum >= 0 ? puttRawNum : 2;
    puttsTotal += puttNum;

    penaltyTotal += Number(penaltyArr[i]) || 0;
    sandTotal += Number(sandArr[i]) || 0;

    const rawPar = parArr[i];
    const hasHolePar = rawPar !== null && rawPar !== undefined && rawPar !== '' && !Number.isNaN(Number(rawPar));
    const holePar = hasHolePar ? Number(rawPar) : Number(rawPar || 0);

    const approachStrokes = scoreNum - puttNum;
    if (approachStrokes <= holePar - 2) girCount += 1;

    if (holePar === 4 || holePar === 5) {
      fairwayAttempt += 1;
      if (fairwayArr[i] === 'fairway') fairwayHit += 1;
    }

    if (hasHolePar) {
      stat8421Sum += get8421Score(scoreNum - holePar);
    }

    const status = groupsStore.getScoreStatus(scoreNum - holePar);
    if (status === 'eagle') eagle += 1;
    else if (status === 'birdie') birdie += 1;
    else if (status === 'par') par += 1;
    else if (status === 'bogey') bogey += 1;
    else if (status === 'double-bogey') doublePlus += 1;
  }

  const girPercent = playedHoles > 0
    ? Math.round((girCount / playedHoles) * 100) + '%'
    : '-';
  const fairwayPercent = fairwayAttempt > 0
    ? Math.round((fairwayHit / fairwayAttempt) * 100) + '%'
    : '-';
  const stat8421 = playedHoles > 0 ? stat8421Sum : '-';

  return {
    eagle: eagle,
    birdie: birdie,
    par: par,
    bogey: bogey,
    doublePlus: doublePlus,
    putts: puttsTotal,
    girPercent: girPercent,
    fairwayPercent: fairwayPercent,
    penalty: penaltyTotal,
    sand: sandTotal,
    stat8421: stat8421,
    total: total
  };
}

function getGroupScoreData(match, groupId) {
  const scoreData = match && match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
    ? match.scoreData
    : null;
  const gid = groupId != null ? String(groupId).trim() : '';
  if (!scoreData || !gid) return null;
  const groupScoreData = scoreData[gid];
  return groupScoreData && typeof groupScoreData === 'object' ? groupScoreData : null;
}

/**
 * @param {object} match teamMatchStore 比赛对象
 * @returns {Array<object>} statistics rows
 */
function buildStatisticsRows(match) {
  if (!match || typeof match !== 'object') return [];
  const pars = resolveMatchHolePars(match);
  const lookup = buildPlayerLookup(match);
  const groups = Array.isArray(match.groups) ? match.groups : [];
  const rows = [];
  const seen = {};

  groups.forEach((group) => {
    const groupId = group && group.groupId != null ? String(group.groupId).trim() : '';
    const groupScoreData = getGroupScoreData(match, groupId);
    const scoresByPlayer = groupScoreData &&
      groupScoreData.scoresByPlayer &&
      typeof groupScoreData.scoresByPlayer === 'object'
      ? groupScoreData.scoresByPlayer
      : null;
    const players = Array.isArray(group && group.players) ? group.players : [];

    players.forEach((player) => {
      const playerId = resolveAnyPlayerId(player);
      if (!playerId) return;
      const scoreOwnerId = resolveSlotScorePlayerId(player, playerId);
      const dedupeKey = scoreOwnerId || playerId;
      if (seen[dedupeKey]) return;
      seen[dedupeKey] = true;

      const record = resolveScoresByPlayerRecord(scoresByPlayer, player, playerId);
      const scores = record && Array.isArray(record.scores) ? record.scores : [];
      const putts = record && Array.isArray(record.putts) ? record.putts : [];
      const fairways = record && Array.isArray(record.fairways) ? record.fairways : [];
      const penalties = record && Array.isArray(record.penalties) ? record.penalties : [];
      const sands = record && Array.isArray(record.sands) ? record.sands : [];
      const holeStats = computePlayerHoleStats(scores, putts, pars, fairways, penalties, sands);

      const meta = lookup[playerId] || lookup[scoreOwnerId] || {};
      const genderDisplay = playerManage.getGenderDisplay(
        Object.assign({}, meta, player, {
          gender: meta.gender || player.gender
        })
      );
      const name =
        playerManage.resolveMatchNickname(Object.assign({}, meta, player)) ||
        meta.nickname ||
        '未知球员';
      const avatar = mockAvatars.resolveAvatar(
        meta.avatar || player.avatar || player.avatarUrl || '',
        playerId
      );

      rows.push({
        playerId: playerId,
        scorePlayerId: scoreOwnerId || playerId,
        groupId: groupId,
        avatar: avatar,
        name: name,
        gender: genderDisplay.gender || '',
        genderIcon: genderDisplay.icon || '',
        teeColor: resolveTeeColor(player, meta),
        eagle: holeStats.eagle,
        birdie: holeStats.birdie,
        par: holeStats.par,
        bogey: holeStats.bogey,
        doublePlus: holeStats.doublePlus,
        girPercent: holeStats.girPercent,
        putts: holeStats.putts,
        fairwayPercent: holeStats.fairwayPercent,
        sand: holeStats.sand,
        penalty: holeStats.penalty,
        stat8421: holeStats.stat8421,
        total: holeStats.total
      });
    });
  });

  return rows;
}

/**
 * 普通创建：将 game.groups[].scoresByPlayer 归一为 match.scoreData 形状，
 * 供统计页 _mapAdapterRowsToView / _countFilledHolesForStatsRow 复用。
 * @param {object} game gameStore 球局
 * @returns {{ scoreData: object }}
 */
function buildGameScoreDataContext(game) {
  const scoreData = {};
  if (!game || typeof game !== 'object') return { scoreData: scoreData };
  const groups = listGameGroups(game);
  groups.forEach((group) => {
    const groupId = group && group.groupId != null ? String(group.groupId).trim() : '';
    if (!groupId) return;
    scoreData[groupId] = {
      scoresByPlayer:
        group.scoresByPlayer && typeof group.scoresByPlayer === 'object'
          ? group.scoresByPlayer
          : {}
    };
  });
  return { scoreData: scoreData };
}

/** 组内是否存在带有效 playerId 的球员槽 */
function groupHasValidPlayerSlots(group) {
  const slots = Array.isArray(group && group.playersSlots) ? group.playersSlots : [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot && typeof slot === 'object' && resolveAnyPlayerId(slot)) return true;
  }
  return false;
}

/**
 * 顶层 playersSlots / scoresByPlayer 合成单组（历史单组兼容）。
 * groupId：优先沿用 groups[0].groupId，否则 gameId-g1，保证稳定。
 */
function buildTopLevelFallbackGroup(game) {
  const g0 = Array.isArray(game.groups) && game.groups[0] ? game.groups[0] : null;
  const fromG0 =
    g0 && g0.groupId != null && String(g0.groupId).trim() !== ''
      ? String(g0.groupId).trim()
      : '';
  const groupId = fromG0 || ((game.gameId || 'legacy') + '-g1');
  return {
    groupId: groupId,
    name: (g0 && g0.name) || '第1组',
    playersSlots: Array.isArray(game.playersSlots) ? game.playersSlots : [],
    scoresByPlayer:
      game.scoresByPlayer && typeof game.scoresByPlayer === 'object'
        ? game.scoresByPlayer
        : {}
  };
}

/**
 * 与 gameStore.listGroups 同构（避免 adapter 反向依赖 gameStore）。
 * 优先 game.groups；若 groups 存在但组内无有效 playersSlots/playerId，
 * fallback 到顶层 game.playersSlots / game.scoresByPlayer（历史单组）。
 */
function listGameGroups(game) {
  if (!game) return [];
  if (Array.isArray(game.groups) && game.groups.length) {
    let hasValidSlot = false;
    for (let i = 0; i < game.groups.length; i++) {
      if (groupHasValidPlayerSlots(game.groups[i])) {
        hasValidSlot = true;
        break;
      }
    }
    if (hasValidSlot) return game.groups;
    return [buildTopLevelFallbackGroup(game)];
  }
  return [buildTopLevelFallbackGroup(game)];
}

/**
 * 普通创建统计行：从 game.groups[].scoresByPlayer（及旧顶层兜底）读取成绩。
 * 输出字段与 buildStatisticsRows 一致，供 _mapAdapterRowsToView 使用。
 * @param {object} game gameStore 球局
 * @returns {Array<object>}
 */
function buildGameStatisticsRows(game) {
  if (!game || typeof game !== 'object') return [];
  const pars = resolveMatchHolePars(game);
  const groups = listGameGroups(game);
  const rows = [];
  const seen = {};

  groups.forEach((group) => {
    const groupId = group && group.groupId != null ? String(group.groupId).trim() : '';
    const scoresByPlayer =
      group && group.scoresByPlayer && typeof group.scoresByPlayer === 'object'
        ? group.scoresByPlayer
        : null;
    const slots = Array.isArray(group && group.playersSlots) ? group.playersSlots : [];

    slots.forEach((slot) => {
      if (!slot || typeof slot !== 'object') return;
      const playerId = resolveAnyPlayerId(slot);
      if (!playerId) return;
      const scoreOwnerId = resolveSlotScorePlayerId(slot, playerId);
      const dedupeKey = scoreOwnerId || playerId;
      if (seen[dedupeKey]) return;
      seen[dedupeKey] = true;

      const record = resolveScoresByPlayerRecord(scoresByPlayer, slot, playerId);
      const scores = record && Array.isArray(record.scores) ? record.scores : [];
      const putts = record && Array.isArray(record.putts) ? record.putts : [];
      const fairways = record && Array.isArray(record.fairways) ? record.fairways : [];
      const penalties = record && Array.isArray(record.penalties) ? record.penalties : [];
      const sands = record && Array.isArray(record.sands) ? record.sands : [];
      const holeStats = computePlayerHoleStats(scores, putts, pars, fairways, penalties, sands);

      const genderDisplay = playerManage.getGenderDisplay(slot);
      const name =
        playerManage.resolveMatchNickname(slot) ||
        (slot.name != null ? String(slot.name).trim() : '') ||
        '未知球员';
      const avatar = mockAvatars.resolveAvatar(
        slot.avatar || slot.avatarUrl || '',
        playerId
      );

      rows.push({
        playerId: playerId,
        scorePlayerId: scoreOwnerId || playerId,
        groupId: groupId,
        avatar: avatar,
        name: name,
        gender: genderDisplay.gender || '',
        genderIcon: genderDisplay.icon || '',
        teeColor: resolveTeeColor(slot, null),
        eagle: holeStats.eagle,
        birdie: holeStats.birdie,
        par: holeStats.par,
        bogey: holeStats.bogey,
        doublePlus: holeStats.doublePlus,
        girPercent: holeStats.girPercent,
        putts: holeStats.putts,
        fairwayPercent: holeStats.fairwayPercent,
        sand: holeStats.sand,
        penalty: holeStats.penalty,
        stat8421: holeStats.stat8421,
        total: holeStats.total
      });
    });
  });

  return rows;
}

/** G2/G3/G4：统计按 Stroke Entity；G1 / 其它：个人 */
function shouldUseEntityStatistics(match) {
  const kind = resolveStrokeKind(resolveGameMode(match));
  return kind === 'g2g3' || kind === 'g4';
}

function resolveEntityMemberId(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
  if (typeof raw !== 'object') return '';
  const id = raw.userId != null ? raw.userId : (raw.playerId != null ? raw.playerId : raw.id);
  return id != null ? String(id).trim() : '';
}

/** 与领先榜 Entity 行一致：成员昵称用 ' / ' 连接 */
function resolveEntityStatisticsDisplayName(memberIds, lookup) {
  const names = (Array.isArray(memberIds) ? memberIds : [])
    .map((uid) => {
      const meta = (lookup && lookup[uid]) || {};
      return (
        playerManage.resolveMatchNickname(meta) ||
        meta.nickname ||
        ''
      );
    })
    .map((n) => String(n || '').trim())
    .filter(Boolean);
  return names.join(' / ');
}

function findTeamScoreByEntityId(groupScoreData, entityId) {
  const eid = entityId != null ? String(entityId).trim() : '';
  if (!eid) return null;
  const list = Array.isArray(groupScoreData && groupScoreData.teamScoresByEntity)
    ? groupScoreData.teamScoresByEntity
    : [];
  for (let i = 0; i < list.length; i++) {
    const rec = list[i];
    if (!rec || typeof rec !== 'object') continue;
    const key =
      rec.teamId != null && String(rec.teamId).trim() !== ''
        ? String(rec.teamId).trim()
        : rec.entityId != null && String(rec.entityId).trim() !== ''
          ? String(rec.entityId).trim()
          : '';
    if (key === eid) return rec;
  }
  return null;
}

/**
 * G2/G3/G4：按 scoreEntities + teamScoresByEntity 生成组合统计行
 * 禁止从 scoresByPlayer 反推
 */
function buildEntityStatisticsRows(match) {
  if (!match || typeof match !== 'object') return [];
  const pars = resolveMatchHolePars(match);
  const lookup = buildPlayerLookup(match);
  const scoreEntities =
    match.scoreEntities && typeof match.scoreEntities === 'object' && !Array.isArray(match.scoreEntities)
      ? match.scoreEntities
      : {};
  const rows = [];
  const seen = {};

  Object.keys(scoreEntities).forEach((groupId) => {
    const gid = String(groupId);
    const entities = Array.isArray(scoreEntities[gid]) ? scoreEntities[gid] : [];
    const groupScoreData = getGroupScoreData(match, gid);

    entities.forEach((entity) => {
      if (!entity) return;
      const entityId = entity.entityId != null ? String(entity.entityId).trim() : '';
      if (!entityId || seen[entityId]) return;

      const memberIds = (Array.isArray(entity.members) ? entity.members : [])
        .map(resolveEntityMemberId)
        .filter(Boolean);
      // 空占用行不进统计（与领先榜一致）
      if (!memberIds.length) return;
      seen[entityId] = true;

      const rec = findTeamScoreByEntityId(groupScoreData, entityId);
      const scores = rec && Array.isArray(rec.scores) ? rec.scores : [];
      const putts = rec && Array.isArray(rec.putts) ? rec.putts : [];
      const fairways = rec && Array.isArray(rec.fairways) ? rec.fairways : [];
      const penalties = rec && Array.isArray(rec.penalties) ? rec.penalties : [];
      const sands = rec && Array.isArray(rec.sands) ? rec.sands : [];
      const holeStats = computePlayerHoleStats(scores, putts, pars, fairways, penalties, sands);

      const name = resolveEntityStatisticsDisplayName(memberIds, lookup) || '组合';
      const members = memberIds.map((uid) => {
        const meta = lookup[uid] || {};
        return {
          userId: uid,
          name: playerManage.resolveMatchNickname(meta) || meta.nickname || '',
          avatar: mockAvatars.resolveAvatar(meta.avatar || '', uid)
        };
      });
      const avatar = (members[0] && members[0].avatar) || '';

      rows.push({
        isEntity: true,
        entityId: entityId,
        playerId: '',
        scorePlayerId: '',
        groupId: gid,
        memberIds: memberIds.slice(),
        members: members,
        avatar: avatar,
        name: name,
        gender: '',
        genderIcon: '',
        teeColor: resolveTeeColor(null, lookup[memberIds[0]] || {}),
        eagle: holeStats.eagle,
        birdie: holeStats.birdie,
        par: holeStats.par,
        bogey: holeStats.bogey,
        doublePlus: holeStats.doublePlus,
        girPercent: holeStats.girPercent,
        putts: holeStats.putts,
        fairwayPercent: holeStats.fairwayPercent,
        sand: holeStats.sand,
        penalty: holeStats.penalty,
        stat8421: holeStats.stat8421,
        total: holeStats.total
      });
    });
  });

  return rows;
}

/** 分队顺序（红/蓝）：来自 match.teamGroups */
function resolveMatchPlayTeamOrder(match) {
  const order = [];
  const seen = {};
  (Array.isArray(match && match.teamGroups) ? match.teamGroups : []).forEach((tg) => {
    const id = tg && tg.id != null ? String(tg.id).trim() : '';
    if (!id || seen[id]) return;
    seen[id] = true;
    order.push(id);
  });
  return order;
}

/**
 * 运行时解析一组比洞双方：sideId / sideKey / memberIds
 * maxMembers：G6–G8 每方最多 2
 */
function resolveGroupMatchPlaySideMeta(match, group, maxMembers) {
  const cap = maxMembers > 0 ? maxMembers : 2;
  const teamMap = buildRegisterTeamMap(match);
  const filled = listFilledPlayers(group);
  const teamOrder = resolveMatchPlayTeamOrder(match);
  const sides = [];

  if (teamOrder.length >= 2) {
    const byTeam = {};
    teamOrder.forEach((tid) => {
      byTeam[tid] = [];
    });
    filled.forEach((p) => {
      const tid = teamMap[p.userId] || '';
      if (!tid || !byTeam[tid]) return;
      if (byTeam[tid].length >= cap) return;
      byTeam[tid].push(p.userId);
    });
    const aId = teamOrder[0];
    const bId = teamOrder[1];
    const membersA = byTeam[aId] || [];
    const membersB = byTeam[bId] || [];
    if (membersA.length && membersB.length) {
      sides.push({ sideId: aId, sideKey: 'A', memberIds: membersA.slice() });
      sides.push({ sideId: bId, sideKey: 'B', memberIds: membersB.slice() });
      return sides;
    }
  }

  // 无分队顺序时：按出场序拆成 A/B
  if (filled.length >= 2) {
    const membersA = filled.slice(0, Math.min(cap, filled.length - 1)).map((p) => p.userId);
    const membersB = filled
      .slice(membersA.length, membersA.length + cap)
      .map((p) => p.userId);
    if (membersA.length && membersB.length) {
      sides.push({
        sideId: teamMap[membersA[0]] || 'A',
        sideKey: 'A',
        memberIds: membersA
      });
      sides.push({
        sideId: teamMap[membersB[0]] || 'B',
        sideKey: 'B',
        memberIds: membersB
      });
    }
  }
  return sides;
}

function readScoresBySideRecord(scoresBySide, sideId, sideKey) {
  const map =
    scoresBySide && typeof scoresBySide === 'object' && !Array.isArray(scoresBySide)
      ? scoresBySide
      : null;
  if (!map) return null;
  const id = sideId != null ? String(sideId).trim() : '';
  const key = sideKey != null ? String(sideKey).trim() : '';
  if (id && map[id]) return map[id];
  if (key && map[key]) return map[key];
  if (key) {
    const lower = key.toLowerCase();
    if (map[lower]) return map[lower];
  }
  return null;
}

/**
 * Match Play 临时统计 entityId：groupId + sideId，避免跨组 sideId 撞车。
 * 仅用于统计视图，不写回原始 scoreData。
 */
function buildMatchPlayTempEntityId(groupId, sideId) {
  const gid = groupId != null ? String(groupId).trim() : '';
  const sid = sideId != null ? String(sideId).trim() : '';
  if (!gid || !sid) return '';
  return 'mp_' + gid + '_' + sid;
}

/**
 * G6/G7/G8：将 scoresBySide 只读转换为 Entity 统计视图（不写盘）。
 * scoreEntities / teamScoresByEntity.entityId = mp_${groupId}_${sideId}；
 * 成绩仍按原始 sideId 从 scoresBySide 读取。
 */
function buildMatchPlaySideEntityViewMatch(match) {
  const groups = Array.isArray(match && match.groups) ? match.groups : [];
  const scoreEntities = {};
  const nextScoreData = {};
  const srcScoreData =
    match && match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : {};

  groups.forEach((group) => {
    const groupId = group && group.groupId != null ? String(group.groupId).trim() : '';
    if (!groupId) return;
    const bucket = getGroupScoreData(match, groupId) || {};
    const scoresBySide =
      bucket.scoresBySide && typeof bucket.scoresBySide === 'object' ? bucket.scoresBySide : {};
    const sides = resolveGroupMatchPlaySideMeta(match, group, 2);
    const entities = [];
    const teamScoresByEntity = [];
    const seen = {};

    sides.forEach((side) => {
      if (!side || !side.sideId) return;
      const sideId = String(side.sideId).trim();
      const entityId = buildMatchPlayTempEntityId(groupId, sideId);
      if (!entityId || seen[entityId]) return;
      const memberIds = Array.isArray(side.memberIds) ? side.memberIds.filter(Boolean) : [];
      if (!memberIds.length) return;
      seen[entityId] = true;
      entities.push({
        entityId: entityId,
        members: memberIds.slice()
      });
      const rec = readScoresBySideRecord(scoresBySide, sideId, side.sideKey) || {};
      teamScoresByEntity.push({
        teamId: entityId,
        entityId: entityId,
        scores: Array.isArray(rec.scores) ? rec.scores.slice() : [],
        putts: Array.isArray(rec.putts) ? rec.putts.slice() : [],
        fairways: Array.isArray(rec.fairways) ? rec.fairways.slice() : [],
        penalties: Array.isArray(rec.penalties) ? rec.penalties.slice() : [],
        sands: Array.isArray(rec.sands) ? rec.sands.slice() : []
      });
    });

    // 仅有成绩、分队解析失败时：按 scoresBySide 键 + 组内同分队成员补实体
    const teamMap = buildRegisterTeamMap(match);
    const filled = listFilledPlayers(group);
    Object.keys(scoresBySide).forEach((key) => {
      const sideId = String(key).trim();
      if (!sideId || sideId === 'A' || sideId === 'B' || sideId === 'a' || sideId === 'b') return;
      const entityId = buildMatchPlayTempEntityId(groupId, sideId);
      if (!entityId || seen[entityId]) return;
      const rec = scoresBySide[key];
      if (!rec || typeof rec !== 'object') return;
      const memberIds = filled
        .filter((p) => (teamMap[p.userId] || '') === sideId)
        .map((p) => p.userId);
      if (!memberIds.length) return;
      seen[entityId] = true;
      entities.push({ entityId: entityId, members: memberIds.slice() });
      teamScoresByEntity.push({
        teamId: entityId,
        entityId: entityId,
        scores: Array.isArray(rec.scores) ? rec.scores.slice() : [],
        putts: Array.isArray(rec.putts) ? rec.putts.slice() : [],
        fairways: Array.isArray(rec.fairways) ? rec.fairways.slice() : [],
        penalties: Array.isArray(rec.penalties) ? rec.penalties.slice() : [],
        sands: Array.isArray(rec.sands) ? rec.sands.slice() : []
      });
    });

    scoreEntities[groupId] = entities;
    const prev = srcScoreData[groupId] && typeof srcScoreData[groupId] === 'object'
      ? srcScoreData[groupId]
      : {};
    nextScoreData[groupId] = Object.assign({}, prev, {
      teamScoresByEntity: teamScoresByEntity,
      scoresBySide: scoresBySide
    });
  });

  return Object.assign({}, match, {
    scoreEntities: scoreEntities,
    scoreData: nextScoreData
  });
}

/**
 * G5–G8 Match Play 统计行（展示层，不含 UP/DN / Match Result）。
 * - G5 → 复用 buildStatisticsRows（scoresByPlayer）
 * - G6/G7/G8 → scoresBySide 转 Entity 视图后复用 buildEntityStatisticsRows
 */
function buildMatchPlayStatisticsRows(match) {
  if (!match || typeof match !== 'object') return [];
  const mode = resolveGameMode(match);
  if (isG5MatchPlayMode(mode)) {
    return buildStatisticsRows(match);
  }
  if (isG6G7MatchPlayMode(mode) || isG8MatchPlayMode(mode)) {
    return buildEntityStatisticsRows(buildMatchPlaySideEntityViewMatch(match));
  }
  if (isMatchPlayBoardMode(mode)) {
    return buildStatisticsRows(match);
  }
  return [];
}

/**
 * Match Play 映射用 score 上下文：供 _mapAdapterRowsToView / filledHoles 识别成绩。
 * G5：原 match；G6–G8：含合成 teamScoresByEntity 的视图。
 */
function buildMatchPlayScoreDataContext(match) {
  if (!match || typeof match !== 'object') return match;
  const mode = resolveGameMode(match);
  if (isG6G7MatchPlayMode(mode) || isG8MatchPlayMode(mode)) {
    return buildMatchPlaySideEntityViewMatch(match);
  }
  return match;
}

module.exports = {
  buildStatisticsRows,
  buildEntityStatisticsRows,
  buildGameStatisticsRows,
  buildGameScoreDataContext,
  buildMatchPlayStatisticsRows,
  buildMatchPlayScoreDataContext,
  shouldUseEntityStatistics,
  computePlayerHoleStats,
  get8421Score,
  resolveMatchHolePars,
  resolveSlotScorePlayerId,
  resolveScoresByPlayerRecord,
  resolveAnyPlayerId
};
