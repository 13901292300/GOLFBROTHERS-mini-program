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

/** gameStore 组：是否存在至少一洞成绩 */
function hasAnyScoreInGameGroup(group) {
  if (!group) return false;
  const scoresByPlayer = group.scoresByPlayer || {};
  return (group.playersSlots || []).filter(Boolean).some((p) => {
    const rec = scoresByPlayer[p.playerId] || {};
    return (rec.scores || []).some(isFilledScore);
  });
}

function hasAnyScoreInGroup(group, source) {
  return source === 'groups'
    ? hasAnyScoreInGroupsStoreGroup(group)
    : hasAnyScoreInGameGroup(group);
}

/**
 * 统一状态计算（唯一入口）
 * @param {object} groupData - 单组数据（groupsStore 组 或 gameStore 组）
 * @param {{ source?: 'groups'|'game' }} [options]
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
  const source = (options && options.source) || 'game';
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
  if (hasAnyScoreInGroup(groupData, source)) {
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
  getMatchStatus,
  getMatchStatusForGameGroup,
  getMatchStatusForTournamentGroup,
  deriveTeeSheetStatus,
  getMatchStatusLabelZh
};
