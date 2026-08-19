/**
 * 球友圈发布：记分页短期可信 context + 参赛资格校验。
 *
 * 审计结论（成绩卡码）：
 * - 工程内无独立 scorecardCode / 成绩卡码产品字段。
 * - scorecardKey（teamId:playerId）仅为领先榜展开 UI 键，含身份、非公开码。
 * - joinToken / accessCode / tempAdminAccess 含加入或管理能力，禁止写入公开动态。
 * - 本模块生成无权限公开标识 publicScorecardId（仅展示/回看定位，不授予编辑管理）。
 */

const playerIdentityGuard = require('./playerIdentityGuard.js');
const socialRelationStore = require('./socialRelationStore.js');
const gameStore = require('./gameStore.js');
const teamMatchStore = require('./teamMatchStore.js');

const CONTEXT_TTL_MS = 3 * 60 * 1000;
const CONTEXT_STORAGE_PREFIX = 'moment-publish-context:';
const memoryContexts = {};
let contextSeq = 0;

const FORBIDDEN_RELATED_KEYS = {
  joinToken: true,
  accessCode: true,
  tempAdminAccess: true,
  tempAdminToken: true,
  manageToken: true,
  inviteToken: true,
  permissionToken: true,
  qrCodeUrl: true
};

function _trim(v) {
  return v == null ? '' : String(v).trim();
}

function _now() {
  return Date.now();
}

function _canon(userId) {
  return socialRelationStore.resolveCanonicalUserId(
    playerIdentityGuard.normalizePlayerUserId(userId)
  );
}

function _sameUser(a, b) {
  const ca = _canon(a);
  const cb = _canon(b);
  return !!(ca && cb && ca === cb);
}

function _isActableUser(userId) {
  const id = playerIdentityGuard.normalizePlayerUserId(userId);
  if (!playerIdentityGuard.isStablePublicUserId(id)) return false;
  if (playerIdentityGuard.isGuestPlayerId(id)) return false;
  if (playerIdentityGuard.isMaskedPlayerId(id)) return false;
  return true;
}

function _hashKey(s) {
  let h = 5381;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

/**
 * 无权限公开成绩卡标识：仅由参赛绑定信息派生，不含 join/access/admin 令牌。
 */
function buildPublicScorecardId(input) {
  const src = input && typeof input === 'object' ? input : {};
  const sourceType = _trim(src.sourceType) === 'team_match' ? 'team_match' : 'game';
  const gameId = _trim(src.gameId);
  const matchId = _trim(src.matchId);
  const groupId = _trim(src.groupId);
  const slotId = _trim(src.slotId);
  const userId = _canon(src.userId);
  if (!userId || !slotId) return '';
  if (sourceType === 'team_match' && !matchId) return '';
  if (sourceType === 'game' && !gameId) return '';
  const raw = [
    sourceType,
    gameId || '-',
    matchId || '-',
    groupId || '-',
    slotId,
    userId
  ].join('|');
  return 'PSC_' + _hashKey(raw).toUpperCase();
}

function buildRelatedGameViewUrl(related) {
  const r = related && typeof related === 'object' ? related : {};
  if (_trim(r.sourceType) === 'team_match' && _trim(r.matchId)) {
    return (
      '/subpackages/tournament/pages/detail/index?matchId=' +
      encodeURIComponent(_trim(r.matchId)) +
      '&activeTab=leaderboard'
    );
  }
  if (_trim(r.gameId)) {
    return (
      '/subpackages/scoring/pages/hub/index?gameId=' +
      encodeURIComponent(_trim(r.gameId)) +
      '&activeTab=leaderboard'
    );
  }
  return '';
}

function _stripForbidden(obj) {
  const out = {};
  Object.keys(obj || {}).forEach(function (k) {
    if (FORBIDDEN_RELATED_KEYS[k]) return;
    out[k] = obj[k];
  });
  return out;
}

function normalizeRelatedGame(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const cleaned = _stripForbidden(raw);
  const sourceType =
    _trim(cleaned.sourceType) === 'team_match' ? 'team_match' : 'game';
  const gameId = _trim(cleaned.gameId);
  const matchId = _trim(cleaned.matchId);
  const groupId = _trim(cleaned.groupId);
  const slotId = _trim(cleaned.slotId);
  const userId = _canon(cleaned.userId);
  let publicScorecardId = _trim(cleaned.publicScorecardId);
  if (!publicScorecardId) {
    publicScorecardId = buildPublicScorecardId({
      sourceType: sourceType,
      gameId: gameId,
      matchId: matchId,
      groupId: groupId,
      slotId: slotId,
      userId: userId
    });
  }
  if (!publicScorecardId || !slotId || !userId) return null;
  if (sourceType === 'team_match' && !matchId) return null;
  if (sourceType === 'game' && !gameId) return null;
  const related = {
    sourceType: sourceType,
    gameId: gameId || null,
    matchId: matchId || null,
    groupId: groupId || null,
    slotId: slotId,
    userId: userId,
    publicScorecardId: publicScorecardId,
    matchName: _trim(cleaned.matchName),
    gameMode: _trim(cleaned.gameMode),
    viewUrl: _trim(cleaned.viewUrl) || ''
  };
  if (!related.viewUrl) related.viewUrl = buildRelatedGameViewUrl(related);
  return related;
}

/**
 * 从记分页运行时解析：当前用户是否持有本场有效参赛槽位。
 * @param {{
 *   currentUserId?: string,
 *   gameId?: string,
 *   matchId?: string,
 *   groupId?: string,
 *   slots?: array,
 *   players?: array,
 *   matchName?: string,
 *   gameMode?: string,
 *   sourceHint?: string
 * }} runtime
 */
function resolveScorePublishEligibility(runtime) {
  const src = runtime && typeof runtime === 'object' ? runtime : {};
  const currentUserId = _canon(
    src.currentUserId || socialRelationStore.resolveCurrentUserId()
  );
  if (!_isActableUser(currentUserId)) {
    return { ok: false, error: 'invalid_user' };
  }

  const gameId = _trim(src.gameId);
  const matchId = _trim(src.matchId);
  const groupId = _trim(src.groupId);
  const hasGame = !!gameId && !!gameStore.getGame(gameId);
  const hasMatch = !!matchId && !!teamMatchStore.getMatchById(matchId);
  if (!hasGame && !hasMatch) {
    return { ok: false, error: 'no_active_game' };
  }

  const sourceType =
    _trim(src.sourceHint) === 'team_match' || (hasMatch && !hasGame)
      ? 'team_match'
      : 'game';

  if (sourceType === 'game' && !hasGame) {
    return { ok: false, error: 'not_in_game' };
  }
  if (sourceType === 'team_match' && !hasMatch) {
    return { ok: false, error: 'not_in_game' };
  }

  let slotId = '';
  const slots = Array.isArray(src.slots) ? src.slots : [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot || slot.status !== 'occupied') continue;
    const pid =
      (slot.player && (slot.player.playerId || slot.player.userId)) ||
      slot.playerId ||
      '';
    if (_sameUser(pid, currentUserId)) {
      slotId = _trim(slot.slotId) || String(i + 1);
      break;
    }
  }

  if (!slotId) {
    const players = Array.isArray(src.players) ? src.players : [];
    for (let j = 0; j < players.length; j++) {
      const p = players[j];
      if (!p) continue;
      const pid = p.playerId || p.userId || p.id || '';
      if (_sameUser(pid, currentUserId)) {
        slotId = _trim(p.slotId) || String(j + 1);
        break;
      }
    }
  }

  if (!slotId) {
    return { ok: false, error: 'not_in_slot' };
  }

  const publicScorecardId = buildPublicScorecardId({
    sourceType: sourceType,
    gameId: gameId,
    matchId: matchId,
    groupId: groupId,
    slotId: slotId,
    userId: currentUserId
  });
  if (!publicScorecardId) {
    return { ok: false, error: 'no_public_scorecard_id' };
  }

  let matchName = _trim(src.matchName);
  let gameMode = _trim(src.gameMode);
  if (sourceType === 'game' && hasGame) {
    const g = gameStore.getGame(gameId) || {};
    if (!matchName) matchName = _trim(g.name || g.title || g.courseName);
    if (!gameMode) gameMode = _trim(g.mode || g.gameMode || src.gameMode);
  }
  if (sourceType === 'team_match' && hasMatch) {
    const m = teamMatchStore.getMatchById(matchId) || {};
    if (!matchName) matchName = _trim(m.name || m.title || m.matchName);
    if (!gameMode) gameMode = _trim(m.mode || m.gameMode || m.playMode);
  }

  const relatedGame = normalizeRelatedGame({
    sourceType: sourceType,
    gameId: sourceType === 'game' ? gameId : gameId || null,
    matchId: sourceType === 'team_match' ? matchId : matchId || null,
    groupId: groupId || null,
    slotId: slotId,
    userId: currentUserId,
    publicScorecardId: publicScorecardId,
    matchName: matchName || '本场比赛',
    gameMode: gameMode
  });
  if (!relatedGame) {
    return { ok: false, error: 'related_game_invalid' };
  }

  return {
    ok: true,
    currentUserId: currentUserId,
    relatedGame: relatedGame
  };
}

/**
 * Store 层再次校验 relatedGame（结构 + 作者绑定 + 比赛仍存在 + 槽位仍属该用户）。
 */
function assertRelatedGameForCreate(relatedGame, authorUserId) {
  const related = normalizeRelatedGame(relatedGame);
  if (!related) return { ok: false, error: 'related_game_required' };
  if (!_sameUser(related.userId, authorUserId)) {
    return { ok: false, error: 'related_user_mismatch' };
  }
  const expected = buildPublicScorecardId(related);
  if (!expected || expected !== related.publicScorecardId) {
    return { ok: false, error: 'public_scorecard_mismatch' };
  }

  if (related.sourceType === 'team_match') {
    const match = teamMatchStore.getMatchById(related.matchId);
    if (!match) return { ok: false, error: 'match_missing' };
  } else {
    const game = gameStore.getGame(related.gameId);
    if (!game) return { ok: false, error: 'game_missing' };
    // 尽量核验用户仍在该球局 occupied 槽位；无槽位结构可扫描时不误杀
    const groups = Array.isArray(game.groups) ? game.groups : [];
    let scanned = false;
    let found = false;
    const markPlayer = function (pid) {
      if (!pid) return;
      scanned = true;
      if (_sameUser(pid, authorUserId)) found = true;
    };
    groups.forEach(function (g) {
      const slots = (g && (g.slots || g.playerSlots)) || [];
      (Array.isArray(slots) ? slots : []).forEach(function (slot) {
        if (!slot) return;
        const pid =
          (slot.player && (slot.player.playerId || slot.player.userId)) ||
          slot.playerId ||
          '';
        if (pid) markPlayer(pid);
      });
      const players = (g && g.players) || [];
      (Array.isArray(players) ? players : []).forEach(function (p) {
        if (p) markPlayer(p.playerId || p.userId || p.id);
      });
    });
    if (Array.isArray(game.players)) {
      game.players.forEach(function (p) {
        if (p) markPlayer(p.playerId || p.userId || p.id);
      });
    }
    if (scanned && !found) {
      return { ok: false, error: 'not_in_game_slots' };
    }
  }

  return { ok: true, relatedGame: related };
}

function _purgeExpired() {
  const ts = _now();
  Object.keys(memoryContexts).forEach(function (token) {
    const row = memoryContexts[token];
    if (!row || !row.expiresAt || row.expiresAt <= ts) {
      delete memoryContexts[token];
      try {
        wx.removeStorageSync(CONTEXT_STORAGE_PREFIX + token);
      } catch (e) { /* ignore */ }
    }
  });
}

function createMomentPublishContext(payload) {
  _purgeExpired();
  const src = payload && typeof payload === 'object' ? payload : {};
  const eligibility = resolveScorePublishEligibility(src);
  if (!eligibility.ok) return { ok: false, error: eligibility.error };

  // 强制 context 用户 = 当前登录用户
  const me = _canon(socialRelationStore.resolveCurrentUserId());
  if (!_sameUser(me, eligibility.currentUserId)) {
    return { ok: false, error: 'user_mismatch' };
  }

  contextSeq += 1;
  const token = 'mpc_' + _now().toString(36) + '_' + contextSeq;
  const row = {
    token: token,
    expiresAt: _now() + CONTEXT_TTL_MS,
    currentUserId: me,
    relatedGame: eligibility.relatedGame
  };
  memoryContexts[token] = row;
  try {
    wx.setStorageSync(CONTEXT_STORAGE_PREFIX + token, row);
  } catch (e) { /* ignore */ }
  return { ok: true, token: token, relatedGame: eligibility.relatedGame };
}

function takeMomentPublishContext(token, options) {
  _purgeExpired();
  const key = _trim(token);
  if (!key) return null;
  const consume = !(options && options.consume === false);
  let row = memoryContexts[key];
  if (!row) {
    try {
      row = wx.getStorageSync(CONTEXT_STORAGE_PREFIX + key);
    } catch (e) {
      row = null;
    }
  }
  if (!row || typeof row !== 'object') return null;
  if (!row.expiresAt || row.expiresAt <= _now()) {
    delete memoryContexts[key];
    try {
      wx.removeStorageSync(CONTEXT_STORAGE_PREFIX + key);
    } catch (e) { /* ignore */ }
    return null;
  }
  const me = _canon(socialRelationStore.resolveCurrentUserId());
  if (!_sameUser(me, row.currentUserId)) return null;
  const related = normalizeRelatedGame(row.relatedGame);
  if (!related || !_sameUser(related.userId, me)) return null;
  if (consume) {
    delete memoryContexts[key];
    try {
      wx.removeStorageSync(CONTEXT_STORAGE_PREFIX + key);
    } catch (e) { /* ignore */ }
  }
  return {
    currentUserId: me,
    relatedGame: related
  };
}

function projectRelatedGameForViewer(relatedGame) {
  const related = normalizeRelatedGame(relatedGame);
  if (!related) return null;
  return {
    sourceType: related.sourceType,
    gameId: related.gameId,
    matchId: related.matchId,
    groupId: related.groupId,
    slotId: related.slotId,
    publicScorecardId: related.publicScorecardId,
    matchName: related.matchName || '本场比赛',
    gameMode: related.gameMode || '',
    viewUrl: related.viewUrl || buildRelatedGameViewUrl(related),
    scorecardLabel: related.publicScorecardId
  };
}

module.exports = {
  FORBIDDEN_RELATED_KEYS: FORBIDDEN_RELATED_KEYS,
  buildPublicScorecardId: buildPublicScorecardId,
  buildRelatedGameViewUrl: buildRelatedGameViewUrl,
  normalizeRelatedGame: normalizeRelatedGame,
  resolveScorePublishEligibility: resolveScorePublishEligibility,
  assertRelatedGameForCreate: assertRelatedGameForCreate,
  createMomentPublishContext: createMomentPublishContext,
  takeMomentPublishContext: takeMomentPublishContext,
  projectRelatedGameForViewer: projectRelatedGameForViewer
};
