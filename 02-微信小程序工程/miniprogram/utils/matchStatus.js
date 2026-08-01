/**
 * 比赛状态中心（Match Status Source of Truth）
 *
 * 全项目唯一状态语义：UPCOMING | LIVE | COMPLETED
 * 优先级：COMPLETED > LIVE > UPCOMING
 *
 * 所有页面（出发表 / 记分 / 领先榜 Hub / 赛事中间页）必须通过本模块读取状态，
 * 禁止在 UI 层或各页面重复推导。
 */

const UPCOMING = 'UPCOMING';
const LIVE = 'LIVE';
const COMPLETED = 'COMPLETED';

/** 持久化字段：用户确认「结束比赛」后写入 group.status / game.status */
const FINISHED_STORAGE_STATUS = 'finished';

const STATUS_LABEL_ZH = {
  upcoming: '未开始',
  live: '进行中',
  completed: '已结束'
};

function isFilledScore(s) {
  return s !== null && s !== undefined && s !== '';
}

/** 是否已执行结束比赛确认（读取存储字段，不推导） */
function isGroupConfirmedFinished(status) {
  const s = String(status || '').toLowerCase();
  return s === 'finished' || s === 'completed' || s === '已结束' || s === '已完成';
}

/** 赛事出发表 groupsStore 组：是否存在至少一洞成绩 */
function hasAnyScoreInGroupsStoreGroup(group) {
  if (!group) return false;
  return (group.players || []).filter(Boolean).some((p) =>
    (p.holes || []).some((h) => isFilledScore(h.score))
  );
}

/** gameStore 组：是否存在至少一洞成绩（个人分 / 团队 entity，对齐队内赛 G2 entity 语义） */
function hasAnyScoreInGameGroup(group) {
  if (!group) return false;
  const scoresByPlayer = group.scoresByPlayer || {};
  const hasPlayer = (group.playersSlots || []).filter(Boolean).some((p) => {
    const rec = scoresByPlayer[p.playerId] || {};
    return (rec.scores || []).some(isFilledScore);
  });
  if (hasPlayer) {
    // TEMP DIAG
    console.log('[HUB_TEE_STATUS_DIAG] hasAnyScoreInGameGroup', {
      path: 'scoresByPlayer',
      result: true,
      groupId: group.groupId || ''
    });
    return true;
  }
  // 四人两球等：成绩在 teamScoresByEntity（与 match.scoreData.teamScoresByEntity 同规则）
  const entities = group.teamScoresByEntity;
  const entityHit =
    Array.isArray(entities) &&
    entities.some((e) => hasAnyFilledScoreInArray(e && e.scores));
  // TEMP DIAG：返回前打印 entity 结构与判定
  console.log('[HUB_TEE_STATUS_DIAG] hasAnyScoreInGameGroup', {
    path: 'teamScoresByEntity',
    result: !!entityHit,
    groupId: group.groupId || '',
    hasTeamScoresByEntity: Array.isArray(entities),
    entityCount: Array.isArray(entities) ? entities.length : -1,
    // G2 期望：[{ teamId, scores:[18], putts:[18] }, ...]
    entities: Array.isArray(entities)
      ? entities.map((e, ei) => {
          const scores = e && e.scores;
          const filledIdx = [];
          if (Array.isArray(scores)) {
            for (let i = 0; i < scores.length; i++) {
              if (isFilledScore(scores[i])) filledIdx.push(i);
            }
          }
          return {
            index: ei,
            teamId: e && e.teamId,
            entityId: e && e.entityId,
            rawType: e == null ? 'nullish' : typeof e,
            keys: e && typeof e === 'object' ? Object.keys(e) : [],
            scoresType: scores == null ? 'nullish' : Array.isArray(scores) ? 'array' : typeof scores,
            scoresLen: Array.isArray(scores) ? scores.length : -1,
            filledHoleIndexes: filledIdx,
            filledCount: filledIdx.length,
            // 若 scores 不是数组，把原值打出来（结构偏差定位）
            scoresPreview: Array.isArray(scores)
              ? scores.slice(0, 8)
              : scores
          };
        })
      : entities,
    failReason: !Array.isArray(entities)
      ? 'teamScoresByEntity_not_array'
      : !entities.length
        ? 'teamScoresByEntity_empty'
        : !entityHit
          ? 'no_filled_score_in_entity_scores'
          : ''
  });
  if (entityHit) return true;
  return false;
}

/** 成绩数组是否含任意有效洞 */
function hasAnyFilledScoreInArray(scores) {
  return Array.isArray(scores) && scores.some(isFilledScore);
}

/**
 * 球队比赛：是否存在至少一洞成绩（只读 match.scoreData[groupId]）
 * 覆盖 scoresByPlayer / teamScoresByEntity / scoresBySide，不碰 game 组字段。
 */
function hasAnyScoreInMatchScoreData(group, scoreData) {
  if (!group || !scoreData || typeof scoreData !== 'object' || Array.isArray(scoreData)) {
    return false;
  }
  const groupId = group.groupId != null ? String(group.groupId) : '';
  if (!groupId) return false;
  const bucket = scoreData[groupId];
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return false;

  const scoresByPlayer = bucket.scoresByPlayer;
  if (scoresByPlayer && typeof scoresByPlayer === 'object' && !Array.isArray(scoresByPlayer)) {
    const hasPlayer = Object.keys(scoresByPlayer).some((pid) => {
      const rec = scoresByPlayer[pid];
      return hasAnyFilledScoreInArray(rec && rec.scores);
    });
    if (hasPlayer) return true;
  }

  const entities = bucket.teamScoresByEntity;
  if (Array.isArray(entities) && entities.some((e) => hasAnyFilledScoreInArray(e && e.scores))) {
    // TEMP DIAG：队内赛 G2 命中 entity 时的结构对照
    console.log('[HUB_TEE_STATUS_DIAG] hasAnyScoreInMatchScoreData(G2)', {
      path: 'match.scoreData.teamScoresByEntity',
      result: true,
      groupId: groupId,
      entityCount: entities.length,
      entities: entities.map((e, ei) => ({
        index: ei,
        teamId: e && e.teamId,
        entityId: e && e.entityId,
        keys: e && typeof e === 'object' ? Object.keys(e) : [],
        scoresIsArray: !!(e && Array.isArray(e.scores)),
        scoresLen: e && Array.isArray(e.scores) ? e.scores.length : -1,
        filledCount: e && Array.isArray(e.scores)
          ? e.scores.filter((s) => isFilledScore(s)).length
          : 0,
        sampleScores: e && Array.isArray(e.scores) ? e.scores.slice(0, 6) : null
      }))
    });
    return true;
  }

  const scoresBySide = bucket.scoresBySide;
  if (scoresBySide && typeof scoresBySide === 'object' && !Array.isArray(scoresBySide)) {
    const hasSide = Object.keys(scoresBySide).some((sideId) => {
      const rec = scoresBySide[sideId];
      return hasAnyFilledScoreInArray(rec && rec.scores);
    });
    if (hasSide) return true;
  }

  return false;
}

function hasAnyScoreInGroup(group, source, options) {
  if (source === 'groups') return hasAnyScoreInGroupsStoreGroup(group);
  if (source === 'match') {
    return hasAnyScoreInMatchScoreData(group, options && options.scoreData);
  }
  return hasAnyScoreInGameGroup(group);
}

/**
 * 统一状态计算（唯一入口）
 * @param {object} groupData - 单组数据（groupsStore 组 / gameStore 组 / 球队赛正式组）
 * @param {{ source?: 'groups'|'game'|'match', scoreData?: object }} [options]
 *   - game：读 scoresByPlayer + teamScoresByEntity（普通球局；entity 对齐队内赛 G2）
 *   - groups：读 groupsStore players.holes
 *   - match：读 options.scoreData[groupId]（球队比赛）
 * @returns {{
 *   status: string,
 *   statusKey: 'upcoming'|'live'|'completed',
 *   statusBadge: string,
 *   isCompleted: boolean,
 *   isLive: boolean,
 *   isUpcoming: boolean
 * }}
 */
function getMatchStatus(groupData, options) {
  const opts = options || {};
  const source = opts.source || 'game';
  if (!groupData) {
    return {
      status: UPCOMING,
      statusKey: 'upcoming',
      statusBadge: UPCOMING,
      isCompleted: false,
      isLive: false,
      isUpcoming: true
    };
  }
  if (isGroupConfirmedFinished(groupData.status)) {
    return {
      status: COMPLETED,
      statusKey: 'completed',
      statusBadge: COMPLETED,
      isCompleted: true,
      isLive: false,
      isUpcoming: false
    };
  }
  if (hasAnyScoreInGroup(groupData, source, opts)) {
    return {
      status: LIVE,
      statusKey: 'live',
      statusBadge: LIVE,
      isCompleted: false,
      isLive: true,
      isUpcoming: false
    };
  }
  return {
    status: UPCOMING,
    statusKey: 'upcoming',
    statusBadge: UPCOMING,
    isCompleted: false,
    isLive: false,
    isUpcoming: true
  };
}

/** gameStore 球局 + 组下标 */
function getMatchStatusForGameGroup(game, groupIndex) {
  const gameStore = require('./gameStore');
  if (!game) {
    return getMatchStatus(null, { source: 'game' });
  }
  const group = gameStore.getGroup(game.gameId, groupIndex || 0)
    || gameStore.listGroups(game)[groupIndex || 0]
    || null;
  return getMatchStatus(group, { source: 'game' });
}

/** groupsStore 赛事组 */
function getMatchStatusForTournamentGroup(groupId) {
  const groupsStore = require('./groupsStore');
  return getMatchStatus(groupsStore.getGroup(groupId), { source: 'groups' });
}

/** 出发表 badge 兼容结构 */
function deriveTeeSheetStatus(group, source) {
  const ms = getMatchStatus(group, { source: source || 'game' });
  return { statusBadge: ms.statusBadge, statusKey: ms.statusKey };
}

function getMatchStatusLabelZh(statusKey) {
  return STATUS_LABEL_ZH[statusKey] || STATUS_LABEL_ZH.upcoming;
}

module.exports = {
  UPCOMING,
  LIVE,
  COMPLETED,
  FINISHED_STORAGE_STATUS,
  STATUS_LABEL_ZH,
  isFilledScore,
  isGroupConfirmedFinished,
  hasAnyScoreInGroup,
  hasAnyScoreInMatchScoreData,
  getMatchStatus,
  getMatchStatusForGameGroup,
  getMatchStatusForTournamentGroup,
  deriveTeeSheetStatus,
  getMatchStatusLabelZh
};
