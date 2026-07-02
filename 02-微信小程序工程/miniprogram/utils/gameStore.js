/**
 * gameStore — 单组 Game 的持久化数据源（wx.Storage 持久化，刷新/重启可恢复）
 *
 * 数据结构（统一）：
 * {
 *   gameId,
 *   courseId, courseName, courseLocation, front9Course, back9Course,
 *   roundName, gameMode,
 *   playersSlots: [ { playerId, name, avatar } | null ],  // = groups[0].playersSlots（首页卡片头像用）
 *   groups: [ {
 *     groupId, name,
 *     status: 'not_started' | 'in_progress' | 'finished',
 *     playersSlots: [ { playerId, name, avatar } | null ],
 *     scoresByPlayer: { [playerId]: { scores:[...18], putts:[...18] } }
 *   } ],
 *   status: 'active' | 'finished',
 *   currentRound: 1,
 *   createdBy: userId,
 *   creatorId: userId,           // 与 createdBy 一致，用于判断是否参赛
 *   creatorGroupIndex: 0 | -1,   // 创建者所在组；-1 表示未参赛
 *   creatorInGame: true | false,
 *   createdAt
 * }
 */

const STORAGE_KEY = 'gb_games_v1';
const matchStatus = require('./matchStatus.js');
const mockAvatars = require('./mockAvatars.js');

// 当前登录用户（占位；接入真实账号体系后替换）
const CURRENT_USER = {
  userId: 'me',
  name: 'TIGERHOODS',
  phone: '13800000000',
  avatar: mockAvatars.avatarByIndex(2)
};

function getCurrentUser() {
  return CURRENT_USER;
}

function _readAll() {
  try {
    const list = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function _writeAll(list) {
  try {
    wx.setStorageSync(STORAGE_KEY, list || []);
  } catch (e) {
    // 忽略写入异常
  }
}

function listGames() {
  return _readAll();
}

function getActiveGames() {
  return _readAll().filter((g) => g && g.status === 'active');
}

function getGame(gameId) {
  if (!gameId) return null;
  return _readAll().find((g) => g && g.gameId === gameId) || null;
}

/** getGame 别名（调试 / 外部调用统一命名） */
function getGameById(gameId) {
  return getGame(gameId);
}

/** 新建或覆盖保存一个 game（按 gameId 去重；新 game 置顶） */
function saveGame(game) {
  if (!game || !game.gameId) return game;
  const list = _readAll();
  const idx = list.findIndex((g) => g && g.gameId === game.gameId);
  if (idx >= 0) list[idx] = game;
  else list.unshift(game);
  _writeAll(list);
  return game;
}

/** 局部更新 game 字段 */
function updateGame(gameId, patch) {
  const list = _readAll();
  const idx = list.findIndex((g) => g && g.gameId === gameId);
  if (idx < 0) return null;
  list[idx] = Object.assign({}, list[idx], patch || {});
  _writeAll(list);
  return list[idx];
}

// ===== 多组 Game 支持 =====

/** 统一解析球局内全部分组（单组 / 多组 / 旧结构兼容） */
function listGroups(game) {
  if (!game) return [];
  if (Array.isArray(game.groups) && game.groups.length) {
    return game.groups;
  }
  return [{
    groupId: (game.gameId || 'legacy') + '-g1',
    name: '第1组',
    status: game.status === 'finished' || game.status === 'ended'
      ? matchStatus.FINISHED_STORAGE_STATUS
      : 'not_started',
    playersSlots: game.playersSlots || [],
    scoresByPlayer: game.scoresByPlayer || {}
  }];
}

/** 读取某组（兼容旧单组：无 groups 时用顶层 playersSlots/scoresByPlayer 兜底） */
function getGroup(gameId, groupIndex) {
  const game = getGame(gameId);
  if (!game) return null;
  return listGroups(game)[groupIndex || 0] || null;
}

/** 写入某组某球员逐洞成绩（持久化，刷新可恢复） */
function setGroupPlayerScores(gameId, groupIndex, playerId, scores, putts) {
  const list = _readAll();
  const idx = list.findIndex((g) => g && g.gameId === gameId);
  if (idx < 0) return null;
  const game = list[idx];
  if (!Array.isArray(game.groups) || !game.groups.length) {
    // 旧结构：写顶层
    game.scoresByPlayer = game.scoresByPlayer || {};
    game.scoresByPlayer[playerId] = { scores: (scores || []).slice(), putts: (putts || []).slice() };
  } else {
    const gi = groupIndex || 0;
    const grp = game.groups[gi];
    if (!grp) return null;
    grp.scoresByPlayer = grp.scoresByPlayer || {};
    grp.scoresByPlayer[playerId] = { scores: (scores || []).slice(), putts: (putts || []).slice() };
  }
  list[idx] = game;
  _writeAll(list);
  return game;
}

/** 按 playersSlots 合并成绩：保留仍在名单中的球员；移除已删除球员 */
function mergeScoresForPlayersSlots(oldScores, playersSlots) {
  const prev = oldScores || {};
  const next = {};
  (playersSlots || []).filter(Boolean).forEach((p) => {
    if (prev[p.playerId]) {
      next[p.playerId] = {
        scores: (prev[p.playerId].scores || []).slice(),
        putts: (prev[p.playerId].putts || []).slice()
      };
    }
  });
  return next;
}

/**
 * 写入某组球员槽位（记分页增删球员后同步 GAME 数据源）
 * - 更新 groups[gi].playersSlots / scoresByPlayer
 * - 第 1 组同步顶层 playersSlots（首页卡片头像）
 */
function setGroupPlayersSlots(gameId, groupIndex, playersSlots) {
  const list = _readAll();
  const idx = list.findIndex((g) => g && g.gameId === gameId);
  if (idx < 0) return null;
  const game = list[idx];
  const gi = groupIndex || 0;
  const slots = (playersSlots || []).map((p) => {
    if (!p) return null;
    return {
      playerId: p.playerId,
      name: p.name || '球员',
      avatar: p.avatar || ''
    };
  });

  if (!Array.isArray(game.groups) || !game.groups.length) {
    if (gi !== 0) return null;
    game.playersSlots = slots.slice();
    game.scoresByPlayer = mergeScoresForPlayersSlots(game.scoresByPlayer, slots);
  } else if (game.groups[gi]) {
    game.groups[gi].playersSlots = slots;
    game.groups[gi].scoresByPlayer = mergeScoresForPlayersSlots(game.groups[gi].scoresByPlayer, slots);
    if (gi === 0) {
      game.playersSlots = slots.slice();
    }
  } else {
    return null;
  }

  list[idx] = game;
  _writeAll(list);
  return game;
}

/** 写入某组团队记分实体成绩（最好成绩 / 最佳球位统一引擎） */
function setGroupTeamScores(gameId, groupIndex, engineGroups) {
  const list = _readAll();
  const idx = list.findIndex((g) => g && g.gameId === gameId);
  if (idx < 0) return null;
  const game = list[idx];
  const gi = groupIndex || 0;
  const entities = (engineGroups || []).map((g) => ({
    teamId: g.id || g.teamId || '',
    scores: (g.scores || []).slice(),
    putts: (g.putts || []).slice()
  }));
  if (!Array.isArray(game.groups) || !game.groups.length) {
    game.teamScoresByEntity = entities;
  } else if (game.groups[gi]) {
    game.groups[gi].teamScoresByEntity = entities;
  } else {
    return null;
  }
  list[idx] = game;
  _writeAll(list);
  return game;
}

/** 更新某组状态：not_started | in_progress | finished */
function updateGroupStatus(gameId, groupIndex, status) {
  const list = _readAll();
  const idx = list.findIndex((g) => g && g.gameId === gameId);
  if (idx < 0) return null;
  const game = list[idx];
  const gi = groupIndex || 0;
  if (Array.isArray(game.groups) && game.groups.length) {
    if (game.groups[gi]) {
      game.groups[gi].status = status;
    }
  } else if (gi === 0 && status === matchStatus.FINISHED_STORAGE_STATUS) {
    game.status = matchStatus.FINISHED_STORAGE_STATUS;
  }
  list[idx] = game;
  _writeAll(list);
  return game;
}

function isMultiGroup(game) {
  if (!game) return false;
  return listGroups(game).length > 1;
}

/** 创建者所在组下标；不在任何组则 -1 */
function findCreatorGroupIndex(game) {
  if (!game) return -1;
  if (typeof game.creatorGroupIndex === 'number' && game.creatorGroupIndex >= 0) {
    return game.creatorGroupIndex;
  }
  const creatorId = game.creatorId || game.createdBy;
  if (!creatorId) return -1;
  if (Array.isArray(game.groups) && game.groups.length) {
    for (let gi = 0; gi < game.groups.length; gi++) {
      const slots = (game.groups[gi].playersSlots || []).filter(Boolean);
      if (slots.some((p) => p.playerId === creatorId)) return gi;
    }
    return -1;
  }
  const slots = (game.playersSlots || []).filter(Boolean);
  return slots.some((p) => p.playerId === creatorId) ? 0 : -1;
}

function isCreatorInGame(game) {
  return findCreatorGroupIndex(game) >= 0;
}

function removeGame(gameId) {
  const list = _readAll().filter((g) => g && g.gameId !== gameId);
  _writeAll(list);
}

module.exports = {
  getCurrentUser,
  listGames,
  getActiveGames,
  getGame,
  getGameById,
  saveGame,
  updateGame,
  getGroup,
  listGroups,
  setGroupPlayerScores,
  setGroupPlayersSlots,
  setGroupTeamScores,
  updateGroupStatus,
  isMultiGroup,
  findCreatorGroupIndex,
  isCreatorInGame,
  removeGame
};
