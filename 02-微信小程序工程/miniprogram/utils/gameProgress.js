/**
 * 普通球局进度：根据持久化成绩计算 completedHoles 与首页卡片进度 UI。
 *
 * 状态区分：
 * - scoring_completed（派生）：18 洞成绩已记满，但 game.status 仍为 active → 进行中样式，指示器 18
 * - finished / ended：用户点击「确认结束」后 → 首页卡片置灰
 */
const gameStore = require('./gameStore.js');
const matchStatus = require('./matchStatus.js');
const scoreCompleteness = require('./scoreCompleteness.js');

const TOTAL_HOLES = 18;
// 与首页 .ds-progress-marker 宽度一致；用于 left 计算避免第18洞溢出
const MARKER_SIZE_PX = 16;
// 五角星约 18px 宽，track 右端内缩半宽与星标中心对齐
const TRACK_END_INSET_PX = 9;
/** 出发表 LIVE 角标用时展示封顶（分钟）；不改 firstScoreAt / LIVE 判定 */
const LIVE_DURATION_DISPLAY_CAP_MINUTES = 360;

/**
 * 已算好的用时分钟 → 展示值（仅封顶，不改计时源）。
 * @param {number} minutes
 * @returns {number}
 */
function capLiveDurationDisplayMinutes(minutes) {
  const n = Math.floor(Number(minutes));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > LIVE_DURATION_DISPLAY_CAP_MINUTES ? LIVE_DURATION_DISPLAY_CAP_MINUTES : n;
}

/**
 * 出发表 LIVE 角标用时后缀（如 ` 45'`）。
 * 计算仍为 floor((end-start)/60000)；仅展示封顶 360。
 * @param {number} firstScoreAt
 * @param {number} [endMs]
 * @returns {string} 无效 firstScoreAt 时返回 ''
 */
function formatLiveDurationBadgeSuffix(firstScoreAt, endMs) {
  const start = Number(firstScoreAt);
  if (!Number.isFinite(start) || start <= 0) return '';
  const endRaw = Number(endMs);
  const end = Number.isFinite(endRaw) && endRaw > 0 ? endRaw : Date.now();
  const rawMinutes = Math.floor((end - start) / 60000);
  const minutes = capLiveDurationDisplayMinutes(rawMinutes < 0 ? 0 : rawMinutes);
  return ' ' + String(minutes) + "'";
}

function buildMarkerLeft(indicatorHole) {
  const ratio = TOTAL_HOLES > 1 ? (indicatorHole - 1) / (TOTAL_HOLES - 1) : 0;
  const r = Math.min(1, Math.max(0, ratio));
  // 第18洞：左缘锚在 track 末端内侧，避免 left:100% 整颗指示器外溢
  if (indicatorHole >= TOTAL_HOLES) {
    return 'calc(100% - ' + MARKER_SIZE_PX + 'px)';
  }
  // 第1–17洞：保持原左缘比例定位 ratio * 100%
  return (r * 100).toFixed(6) + '%';
}

function isFilledScore(s) {
  return s !== null && s !== undefined && s !== '';
}

function isTeamScoringGame(game) {
  const m = game && game.gameMode;
  // 四人两球与最好/最佳球位同属 teamScoresByEntity 团队记分
  return m === '最好成绩赛' || m === '最佳球位赛' || m === '四人两球赛';
}

function isGameEnded(game) {
  const s = game && game.status;
  return s === 'finished' || s === 'ended';
}

function resolveGroup(game, groupIndex) {
  const gi = groupIndex || 0;
  if (game && Array.isArray(game.groups) && game.groups[gi]) return game.groups[gi];
  return {
    playersSlots: (game && game.playersSlots) || [],
    scoresByPlayer: (game && game.scoresByPlayer) || {},
    teamScoresByEntity: []
  };
}

/** 全赛球员总数 N（跨所有组） */
function countTotalPlayers(game) {
  if (!game) return 0;
  if (Array.isArray(game.groups) && game.groups.length) {
    let n = 0;
    game.groups.forEach((grp) => {
      n += (grp.playersSlots || []).filter(Boolean).length;
    });
    return n;
  }
  return (game.playersSlots || []).filter(Boolean).length;
}

/** 全赛已填成绩记录数 M（每位球员每洞计 1） */
function countTotalFilledRecords(game) {
  if (!game) return 0;
  let m = 0;
  const tallyGroup = (group) => {
    (group.playersSlots || []).filter(Boolean).forEach((p) => {
      const rec = (group.scoresByPlayer || {})[p.playerId] || {};
      const scores = rec.scores || [];
      for (let h = 0; h < TOTAL_HOLES; h++) {
        if (isFilledScore(scores[h])) m += 1;
      }
    });
  };
  if (Array.isArray(game.groups) && game.groups.length) {
    game.groups.forEach(tallyGroup);
  } else {
    tallyGroup(resolveGroup(game, 0));
  }
  return m;
}

function isMultiGroupNormalGame(game) {
  return !isTeamScoringGame(game) && !!(game && Array.isArray(game.groups) && game.groups.length > 1);
}

/**
 * 多组普通球局：progressIndicator = round(M / N)，限制在 1~18。
 * 将 N×18 总工作量映射回标准 18 洞刻度。
 */
function computeNormalizedIndicatorHole(filledRecords, playerCount) {
  const n = playerCount || 0;
  const m = filledRecords || 0;
  if (!n || m <= 0) return 1;
  const raw = Math.round(m / n);
  if (raw <= 0) return 1;
  return Math.min(TOTAL_HOLES, raw);
}

/** 已完成洞数：每洞需本组全部记分实体均有有效成绩 */
function countCompletedHoles(game, groupIndex) {
  const group = resolveGroup(game, groupIndex);

  if (isTeamScoringGame(game) && Array.isArray(group.teamScoresByEntity) && group.teamScoresByEntity.length) {
    let completed = 0;
    for (let h = 0; h < TOTAL_HOLES; h++) {
      const allDone = group.teamScoresByEntity.every((e) => isFilledScore((e.scores || [])[h]));
      if (allDone) completed++;
    }
    return completed;
  }

  const players = (group.playersSlots || []).filter(Boolean);
  if (!players.length) return 0;

  let completed = 0;
  for (let h = 0; h < TOTAL_HOLES; h++) {
    const allDone = players.every((p) => {
      const rec = (group.scoresByPlayer || {})[p.playerId] || {};
      return isFilledScore((rec.scores || [])[h]);
    });
    if (allDone) completed++;
  }
  return completed;
}

function isScoringCompleted(game, groupIndex) {
  return scoreCompleteness.isGameGroupComplete(game, groupIndex);
}

/** 首页 GAME 卡片进度条字段 */
function buildProgressUi(game, groupIndex) {
  // 仅用户确认结束后才使用已结束置灰样式
  if (isGameEnded(game)) {
    return {
      progressFinish: true,
      progressWidth: '100%',
      progressMarkerLeft: '',
      progressMarkerText: 'F',
      completedHoles: TOTAL_HOLES,
      indicatorHole: TOTAL_HOLES,
      scoringCompleted: true
    };
  }

  // 多组普通球局：全赛 M/N 归一化到 18 洞刻度（不复用单组 completedHoles 曲线）
  if (isMultiGroupNormalGame(game)) {
    const playerCount = countTotalPlayers(game);
    const filledRecords = countTotalFilledRecords(game);
    const scoringCompleted = playerCount > 0 && filledRecords >= playerCount * TOTAL_HOLES;
    const normalizedCompleted =
      filledRecords <= 0 ? 0 : Math.min(TOTAL_HOLES, Math.round(filledRecords / playerCount) || 0);
    const indicatorHole = scoringCompleted
      ? TOTAL_HOLES
      : computeNormalizedIndicatorHole(filledRecords, playerCount);
    const fillPct = (normalizedCompleted / TOTAL_HOLES) * 100;

    return {
      progressFinish: false,
      progressWidth: fillPct.toFixed(2) + '%',
      progressMarkerLeft: buildMarkerLeft(indicatorHole),
      progressMarkerText: indicatorHole < 10 ? '0' + indicatorHole : String(indicatorHole),
      completedHoles: normalizedCompleted,
      indicatorHole: indicatorHole,
      scoringCompleted: scoringCompleted
    };
  }

  const completedHoles = countCompletedHoles(game, groupIndex);

  // 进行中：18 洞记满但未确认结束 → 指示器仍为 18，不显示 19
  const indicatorHole =
    completedHoles >= TOTAL_HOLES ? TOTAL_HOLES : Math.min(completedHoles + 1, TOTAL_HOLES);
  const effectiveCompleted = Math.min(completedHoles, TOTAL_HOLES);
  const fillPct = (effectiveCompleted / TOTAL_HOLES) * 100;

  return {
    progressFinish: false,
    progressWidth: fillPct.toFixed(2) + '%',
    progressMarkerLeft: buildMarkerLeft(indicatorHole),
    progressMarkerText: indicatorHole < 10 ? '0' + indicatorHole : String(indicatorHole),
    completedHoles: completedHoles,
    indicatorHole: indicatorHole,
    scoringCompleted: completedHoles >= TOTAL_HOLES
  };
}

/**
 * 记分页「结束本组比赛」：
 * game.status = finished + 指定 group.status = finished
 */
function confirmFinishGame(gameId, groupIndex) {
  if (!gameId) return null;
  const game = gameStore.getGame(gameId);
  if (!game || isGameEnded(game)) return game;
  const gi = groupIndex || 0;
  // 单组个人比杆：结束时确认位成绩归属 / 删除无绑定位成绩
  if (typeof gameStore.finalizeSingleGroupIndividualStrokeScores === 'function') {
    gameStore.finalizeSingleGroupIndividualStrokeScores(gameId, gi);
  }
  gameStore.updateGame(gameId, { status: matchStatus.FINISHED_STORAGE_STATUS });
  gameStore.updateGroupStatus(gameId, gi, matchStatus.FINISHED_STORAGE_STATUS);
  return gameStore.getGame(gameId);
}

/**
 * HUB M「结束比赛」：结束整场 GAME
 * game.status = finished + 全部 groups[].status = finished
 * 不改成绩数据；不替代 confirmFinishGame（记分页仍用后者）
 */
function confirmFinishWholeGame(gameId) {
  if (!gameId) return null;
  const game = gameStore.getGame(gameId);
  if (!game || isGameEnded(game)) return game;

  gameStore.updateGame(gameId, { status: matchStatus.FINISHED_STORAGE_STATUS });

  const latest = gameStore.getGame(gameId) || game;
  const groups = gameStore.listGroups(latest);
  const n = Array.isArray(groups) ? groups.length : 0;
  if (n > 0) {
    for (let gi = 0; gi < n; gi++) {
      gameStore.updateGroupStatus(gameId, gi, matchStatus.FINISHED_STORAGE_STATUS);
    }
  } else {
    gameStore.updateGroupStatus(gameId, 0, matchStatus.FINISHED_STORAGE_STATUS);
  }

  return gameStore.getGame(gameId);
}

module.exports = {
  TOTAL_HOLES,
  MARKER_SIZE_PX,
  TRACK_END_INSET_PX,
  LIVE_DURATION_DISPLAY_CAP_MINUTES,
  isFilledScore,
  isTeamScoringGame,
  isGameEnded,
  isScoringCompleted,
  countCompletedHoles,
  countTotalPlayers,
  countTotalFilledRecords,
  isMultiGroupNormalGame,
  computeNormalizedIndicatorHole,
  buildMarkerLeft,
  buildProgressUi,
  confirmFinishGame,
  confirmFinishWholeGame,
  capLiveDurationDisplayMinutes,
  formatLiveDurationBadgeSuffix
};
