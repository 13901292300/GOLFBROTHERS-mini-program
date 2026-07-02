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

// 当前登录用户（占位；接入真实账号体系后替换）
const CURRENT_USER = {
  userId: 'me',
  name: 'TIGERHOODS',
  phone: '13800000000',
  avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=120&h=120&q=80'
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

/** 读取某组（兼容旧单组：无 groups 时用顶层 playersSlots/scoresByPlayer 兜底） */
function getGroup(gameId, groupIndex) {
  const game = getGame(gameId);
  if (!game) return null;
  if (Array.isArray(game.groups) && game.groups.length) {
    return game.groups[groupIndex || 0] || null;
  }
  // 旧结构兜底
  return {
    groupId: game.gameId + '-g1',
    name: '第1组',
    status: game.status === 'finished' ? 'finished' : 'in_progress',
    playersSlots: game.playersSlots || [],
    scoresByPlayer: game.scoresByPlayer || {}
  };
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
  if (Array.isArray(game.groups) && game.groups[groupIndex || 0]) {
    game.groups[groupIndex || 0].status = status;
    list[idx] = game;
    _writeAll(list);
  }
  return game;
}

function isMultiGroup(game) {
  return !!(game && Array.isArray(game.groups) && game.groups.length > 1);
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
  saveGame,
  updateGame,
  getGroup,
  setGroupPlayerScores,
  setGroupTeamScores,
  updateGroupStatus,
  isMultiGroup,
  findCreatorGroupIndex,
  isCreatorInGame,
  removeGame
};
