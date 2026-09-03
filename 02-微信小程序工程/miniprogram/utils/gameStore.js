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
 *     scoresByPlayer: { [playerId]: { scores:[...18], putts:[...18], fairways?:[...18], penalties?:[...18], sands?:[...18] } },
 *     scoresBySlot: [ record|null, ... ]  // 与 playersSlots 下标对齐；进行中位成绩（game-single）
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
const teeSheetManage = require('./teeSheetManage.js');

// 当前登录用户（占位；接入真实账号体系后替换）
const CURRENT_USER = {
  userId: 'me',
  name: 'Ken Duan',
  gender: '男',
  phone: '13800000000',
  avatar: mockAvatars.avatarByIndex(2)
};

const USER_PHONE_OVERRIDE_KEY = 'gb_current_user_phone_v1';
const USER_IDENTITY_KEY = 'gb_current_user_identity_v1';

function _applyIdentityRaw(raw) {
  if (!raw || typeof raw !== 'object') return;
  if (raw.name != null && String(raw.name).trim()) CURRENT_USER.name = String(raw.name).trim();
  if (raw.avatar != null && String(raw.avatar).trim()) CURRENT_USER.avatar = String(raw.avatar).trim();
  if (raw.gender != null && String(raw.gender).trim()) CURRENT_USER.gender = String(raw.gender).trim();
}

function _loadIdentityOverride() {
  try {
    _applyIdentityRaw(wx.getStorageSync(USER_IDENTITY_KEY));
  } catch (e) {
    /* ignore */
  }
}

_loadIdentityOverride();

function getCurrentUser() {
  _loadIdentityOverride();
  const user = Object.assign({}, CURRENT_USER);
  try {
    const override = wx.getStorageSync(USER_PHONE_OVERRIDE_KEY);
    if (override != null && override !== undefined) {
      user.phone = String(override);
    }
  } catch (e) {
    /* ignore */
  }
  return user;
}

/** 资料编辑页确认后：更新当前用户昵称 / 头像 / 性别（本地覆盖） */
function applyCurrentUserIdentity(patch) {
  _applyIdentityRaw(patch || {});
  try {
    wx.setStorageSync(USER_IDENTITY_KEY, {
      name: CURRENT_USER.name,
      avatar: CURRENT_USER.avatar,
      gender: CURRENT_USER.gender
    });
  } catch (e) {
    /* ignore */
  }
  return getCurrentUser();
}

/** 更新当前用户手机号（本地覆盖，供绑定流程写入） */
function setCurrentUserPhone(phone) {
  const p = phone != null ? String(phone).trim() : '';
  CURRENT_USER.phone = p;
  try {
    wx.setStorageSync(USER_PHONE_OVERRIDE_KEY, p);
  } catch (e) {
    /* ignore */
  }
  return getCurrentUser();
}

/** 确保当前用户具备基础注册身份（无独立登录页时的本地兜底） */
function ensureCurrentUserRegistered() {
  if (!CURRENT_USER.userId) CURRENT_USER.userId = 'me';
  return getCurrentUser();
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
    scoresByPlayer: game.scoresByPlayer || {},
    scoresBySlot: Array.isArray(game.scoresBySlot) ? game.scoresBySlot : []
  }];
}

/** 读取某组（兼容旧单组：无 groups 时用顶层 playersSlots/scoresByPlayer 兜底） */
function getGroup(gameId, groupIndex) {
  const game = getGame(gameId);
  if (!game) return null;
  return listGroups(game)[groupIndex || 0] || null;
}

function _buildScoreRecord(prev, scores, putts, fairways, penalties, sands) {
  const rec = {
    scores: (scores || []).slice(),
    putts: (putts || []).slice()
  };
  if (fairways != null) {
    rec.fairways = (fairways || []).slice();
  } else if (prev && Array.isArray(prev.fairways)) {
    rec.fairways = prev.fairways.slice();
  }
  if (penalties != null) {
    rec.penalties = (penalties || []).slice();
  } else if (prev && Array.isArray(prev.penalties)) {
    rec.penalties = prev.penalties.slice();
  }
  if (sands != null) {
    rec.sands = (sands || []).slice();
  } else if (prev && Array.isArray(prev.sands)) {
    rec.sands = prev.sands.slice();
  }
  return rec;
}

function _cloneScoreRecord(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const out = {
    scores: Array.isArray(rec.scores) ? rec.scores.slice() : [],
    putts: Array.isArray(rec.putts) ? rec.putts.slice() : []
  };
  if (Array.isArray(rec.fairways)) out.fairways = rec.fairways.slice();
  if (Array.isArray(rec.penalties)) out.penalties = rec.penalties.slice();
  if (Array.isArray(rec.sands)) out.sands = rec.sands.slice();
  return out;
}

/**
 * 读取某槽位成绩：优先 scoresBySlot[slotIndex]，否则回退 scoresByPlayer[playerId]（旧数据兼容）。
 */
function resolveGroupSlotScoreRecord(group, slotIndex, playerId) {
  const si = Number(slotIndex);
  if (group && Array.isArray(group.scoresBySlot) && si >= 0 && group.scoresBySlot[si]) {
    return _cloneScoreRecord(group.scoresBySlot[si]) || { scores: [], putts: [] };
  }
  const pid = playerId != null ? String(playerId).trim() : '';
  if (pid && group && group.scoresByPlayer && group.scoresByPlayer[pid]) {
    return _cloneScoreRecord(group.scoresByPlayer[pid]) || { scores: [], putts: [] };
  }
  return { scores: [], putts: [] };
}

/** 写入某组某球员逐洞成绩（持久化，刷新可恢复） */
function setGroupPlayerScores(gameId, groupIndex, playerId, scores, putts, fairways, penalties, sands) {
  const list = _readAll();
  const idx = list.findIndex((g) => g && g.gameId === gameId);
  if (idx < 0) return null;
  const game = list[idx];
  if (!Array.isArray(game.groups) || !game.groups.length) {
    // 旧结构：写顶层
    game.scoresByPlayer = game.scoresByPlayer || {};
    game.scoresByPlayer[playerId] = _buildScoreRecord(
      game.scoresByPlayer[playerId],
      scores,
      putts,
      fairways,
      penalties,
      sands
    );
    teeSheetManage.inferStartHoleIfNeededForGameGroup(game);
  } else {
    const gi = groupIndex || 0;
    const grp = game.groups[gi];
    if (!grp) return null;
    grp.scoresByPlayer = grp.scoresByPlayer || {};
    grp.scoresByPlayer[playerId] = _buildScoreRecord(
      grp.scoresByPlayer[playerId],
      scores,
      putts,
      fairways,
      penalties,
      sands
    );
    teeSheetManage.inferStartHoleIfNeededForGameGroup(grp);
  }
  list[idx] = game;
  _writeAll(list);
  return game;
}

/**
 * 写入某组某槽位成绩（与 playersSlots 下标对齐；不改绑定球员）。
 * 用于 game-single 进行中「成绩属于位置」。
 */
function setGroupSlotScores(gameId, groupIndex, slotIndex, scores, putts, fairways, penalties, sands) {
  const list = _readAll();
  const idx = list.findIndex((g) => g && g.gameId === gameId);
  if (idx < 0) return null;
  const game = list[idx];
  const si = Number(slotIndex);
  if (si < 0 || !Number.isFinite(si)) return null;

  const writeSlot = (target) => {
    const arr = Array.isArray(target.scoresBySlot) ? target.scoresBySlot.slice() : [];
    while (arr.length <= si) arr.push(null);
    arr[si] = _buildScoreRecord(arr[si], scores, putts, fairways, penalties, sands);
    target.scoresBySlot = arr;
  };

  if (!Array.isArray(game.groups) || !game.groups.length) {
    if ((groupIndex || 0) !== 0) return null;
    writeSlot(game);
    teeSheetManage.inferStartHoleIfNeededForGameGroup(game);
  } else {
    const gi = groupIndex || 0;
    const grp = game.groups[gi];
    if (!grp) return null;
    writeSlot(grp);
    teeSheetManage.inferStartHoleIfNeededForGameGroup(grp);
  }
  list[idx] = game;
  _writeAll(list);
  return game;
}

/**
 * 按 playersSlots 合并 scoresByPlayer：保留仍在名单中的球员；移除已删除球员。
 * 仅处理 scoresByPlayer，禁止用于裁剪 scoresBySlot（位成绩与绑定无关）。
 */
function mergeScoresForPlayersSlots(oldScores, playersSlots) {
  const prev = oldScores || {};
  const next = {};
  (playersSlots || []).filter(Boolean).forEach((p) => {
    if (prev[p.playerId]) {
      const rec = {
        scores: (prev[p.playerId].scores || []).slice(),
        putts: (prev[p.playerId].putts || []).slice()
      };
      if (Array.isArray(prev[p.playerId].fairways)) {
        rec.fairways = prev[p.playerId].fairways.slice();
      }
      if (Array.isArray(prev[p.playerId].penalties)) {
        rec.penalties = prev[p.playerId].penalties.slice();
      }
      if (Array.isArray(prev[p.playerId].sands)) {
        rec.sands = prev[p.playerId].sands.slice();
      }
      next[p.playerId] = rec;
    }
  });
  return next;
}

/** 深拷贝 scoresBySlot，供名单变更时原样保留 */
function _cloneScoresBySlot(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((rec) => (rec ? _cloneScoreRecord(rec) : null));
}

/**
 * 写入某组球员槽位（记分页增删球员后同步 GAME 数据源）
 * - 更新 groups[gi].playersSlots / scoresByPlayer
 * - 保留 scoresBySlot（无人绑定时不得删除位成绩）
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
      avatar: p.avatar || '',
      gender: p.gender || '',
      tPosition: p.tPosition || ''
    };
  });

  if (!Array.isArray(game.groups) || !game.groups.length) {
    if (gi !== 0) return null;
    const keptSlotScores = _cloneScoresBySlot(game.scoresBySlot);
    game.playersSlots = slots.slice();
    game.scoresByPlayer = mergeScoresForPlayersSlots(game.scoresByPlayer, slots);
    game.scoresBySlot = keptSlotScores;
  } else if (game.groups[gi]) {
    const keptSlotScores = _cloneScoresBySlot(game.groups[gi].scoresBySlot);
    game.groups[gi].playersSlots = slots;
    game.groups[gi].scoresByPlayer = mergeScoresForPlayersSlots(game.groups[gi].scoresByPlayer, slots);
    game.groups[gi].scoresBySlot = keptSlotScores;
    if (gi === 0) {
      game.playersSlots = slots.slice();
      // 顶层仅同步名单头像；位成绩以组内为准，避免误清
      if (!Array.isArray(game.scoresBySlot) || !game.scoresBySlot.length) {
        game.scoresBySlot = _cloneScoresBySlot(keptSlotScores);
      }
    }
  } else {
    return null;
  }

  list[idx] = game;
  _writeAll(list);
  return game;
}

function _isFilledTeamScore(s) {
  return s !== null && s !== undefined && s !== '';
}

/** teamScoresByEntity 是否含任意有效洞成绩 */
function _teamEntitiesHaveAnyFilledScore(entities) {
  return (
    Array.isArray(entities) &&
    entities.some(
      (e) => Array.isArray(e && e.scores) && e.scores.some(_isFilledTeamScore)
    )
  );
}

/**
 * 首次有效团队成绩时写入 firstScoreAt（对齐队内赛 scoreData.firstScoreAt）；已有不覆盖。
 */
function _ensureGroupFirstScoreAt(group, entities) {
  if (!group || typeof group !== 'object') return;
  const existing = Number(group.firstScoreAt);
  if (Number.isFinite(existing) && existing > 0) return;
  if (!_teamEntitiesHaveAnyFilledScore(entities)) return;
  group.firstScoreAt = Date.now();
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
    if ((gi || 0) !== 0) return null;
    game.teamScoresByEntity = entities;
    _ensureGroupFirstScoreAt(game, entities);
    // 团队记分写盘后反推实际出发洞（四人两球等）
    teeSheetManage.inferStartHoleIfNeededForGameGroup(game);
  } else if (game.groups[gi]) {
    game.groups[gi].teamScoresByEntity = entities;
    _ensureGroupFirstScoreAt(game.groups[gi], entities);
    teeSheetManage.inferStartHoleIfNeededForGameGroup(game.groups[gi]);
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

/** 普通创建单组个人比杆（非多组、非团队/最佳球位等） */
function isSingleGroupIndividualStrokeGame(game) {
  if (!game) return false;
  if (isMultiGroup(game)) return false;
  const mode = String(game.gameMode || '').trim();
  return mode === '个人比杆赛' || mode === 'individual_stroke';
}

/**
 * 比赛结束：确认位成绩归属（仅单组个人比杆）。
 * - 有绑定球员：scoresBySlot[i] → scoresByPlayer[playerId]（最终成绩）
 * - 无绑定：删除该位成绩
 * - 结算后清空 scoresBySlot，不保留无主成绩
 */
function finalizeSingleGroupIndividualStrokeScores(gameId, groupIndex) {
  const list = _readAll();
  const idx = list.findIndex((g) => g && g.gameId === gameId);
  if (idx < 0) return null;
  const game = list[idx];
  if (!isSingleGroupIndividualStrokeGame(game)) return game;

  const gi = groupIndex || 0;
  const applyFinalize = (target) => {
    if (!target || typeof target !== 'object') return;
    const playersSlots = Array.isArray(target.playersSlots) ? target.playersSlots : [];
    const scoresBySlot = Array.isArray(target.scoresBySlot) ? target.scoresBySlot : [];
    const prevByPlayer =
      target.scoresByPlayer && typeof target.scoresByPlayer === 'object'
        ? target.scoresByPlayer
        : {};
    const len = Math.max(playersSlots.length, scoresBySlot.length);
    const nextByPlayer = {};
    const view = {
      scoresBySlot: scoresBySlot,
      scoresByPlayer: prevByPlayer
    };

    for (let i = 0; i < len; i++) {
      const binding = playersSlots[i];
      const pid =
        binding && (binding.playerId != null || binding.id != null)
          ? String(binding.playerId || binding.id).trim()
          : '';
      if (!pid) {
        // 无绑定：丢弃该位成绩
        continue;
      }
      const rec = resolveGroupSlotScoreRecord(view, i, pid);
      nextByPlayer[pid] = _cloneScoreRecord(rec) || { scores: [], putts: [] };
    }

    target.scoresByPlayer = nextByPlayer;
    target.scoresBySlot = [];
  };

  if (!Array.isArray(game.groups) || !game.groups.length) {
    if (gi !== 0) return game;
    applyFinalize(game);
  } else {
    const grp = game.groups[gi];
    if (!grp) return game;
    applyFinalize(grp);
    if (gi === 0) {
      // 顶层与第 1 组最终成绩对齐，避免遗留无主位成绩
      game.scoresByPlayer = Object.assign({}, grp.scoresByPlayer || {});
      game.scoresBySlot = [];
      if (Array.isArray(grp.playersSlots)) {
        game.playersSlots = grp.playersSlots.slice();
      }
    }
  }

  list[idx] = game;
  _writeAll(list);
  return game;
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

function permutePlayerScoreMap(scoresByPlayer, idMap) {
  const src = scoresByPlayer && typeof scoresByPlayer === 'object' ? scoresByPlayer : {};
  const next = {};
  const keys = Object.keys(src);
  for (let i = 0; i < keys.length; i++) {
    const from = keys[i];
    const to = idMap && idMap[from] ? String(idMap[from]).trim() : from;
    if (Object.prototype.hasOwnProperty.call(next, to) && next[to] !== src[from]) {
      return { ok: false, next: src };
    }
    next[to] = src[from];
  }
  return { ok: true, next: next };
}

function rekeyGroupPlayerScoresMap(gameId, groupIndex, idMap) {
  const map = {};
  Object.keys(idMap || {}).forEach((key) => {
    const from = key != null ? String(key).trim() : '';
    const to = idMap[key] != null ? String(idMap[key]).trim() : '';
    if (from && to && from !== to) map[from] = to;
  });
  if (!Object.keys(map).length) return true;
  const list = _readAll();
  const idx = list.findIndex((g) => g && g.gameId === gameId);
  if (idx < 0) return false;
  const game = list[idx];
  const move = (target) => {
    if (!target) return false;
    const current = target.scoresByPlayer && typeof target.scoresByPlayer === 'object'
      ? target.scoresByPlayer
      : {};
    const out = permutePlayerScoreMap(current, map);
    if (!out.ok) return false;
    target.scoresByPlayer = out.next;
    return true;
  };
  let changed = false;
  if (!Array.isArray(game.groups) || !game.groups.length) {
    changed = move(game);
  } else {
    const gi = groupIndex || 0;
    changed = move(game.groups[gi]);
  }
  if (!changed) return false;
  list[idx] = game;
  _writeAll(list);
  return true;
}

function rekeyGroupPlayerScores(gameId, groupIndex, fromId, toId) {
  const from = fromId != null ? String(fromId).trim() : '';
  const to = toId != null ? String(toId).trim() : '';
  if (!from || !to || from === to) return false;
  const map = {};
  map[from] = to;
  return rekeyGroupPlayerScoresMap(gameId, groupIndex, map);
}

function removeGame(gameId) {
  const list = _readAll().filter((g) => g && g.gameId !== gameId);
  _writeAll(list);
}

module.exports = {
  getCurrentUser,
  applyCurrentUserIdentity,
  setCurrentUserPhone,
  ensureCurrentUserRegistered,
  listGames,
  getActiveGames,
  getGame,
  getGameById,
  saveGame,
  updateGame,
  getGroup,
  listGroups,
  setGroupPlayerScores,
  setGroupSlotScores,
  rekeyGroupPlayerScores,
  rekeyGroupPlayerScoresMap,
  resolveGroupSlotScoreRecord,
  setGroupPlayersSlots,
  setGroupTeamScores,
  updateGroupStatus,
  isMultiGroup,
  isSingleGroupIndividualStrokeGame,
  finalizeSingleGroupIndividualStrokeScores,
  findCreatorGroupIndex,
  isCreatorInGame,
  removeGame
};
