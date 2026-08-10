/**
 * 球友圈成绩卡 → 比赛中间页（不写 matchState、不进 score/index）。
 *
 * - 普通 GAME → Game Hub（默认领先榜）
 * - 团体比赛 → 赛事详情（安全 TAB：leaderboard / 得分榜）
 * - 仅 wx.navigateTo，保持球友圈 → 中间页栈
 * - 不携带 joinToken / accessCode / 管理员令牌
 * - 短时导航锁：防止快速双击压入重复页面
 */
const gameStore = require('./gameStore.js');
const teamMatchStore = require('./teamMatchStore.js');

const UNAVAILABLE_TIP = '该比赛暂不可进入';
const GAME_HUB_PATH = '/pages/game/hub/index';
const TOURNAMENT_DETAIL_PATH = '/subpackages/tournament/pages/detail/index';

/** 导航进行中 / 冷却，避免双击重复 navigateTo */
let _navBusyUntil = 0;

function _trim(v) {
  return v == null ? '' : String(v).trim();
}

function normalizeOpenInput(input, fallbackCard) {
  const src = input && typeof input === 'object' ? input : {};
  const card = fallbackCard && typeof fallbackCard === 'object' ? fallbackCard : {};
  const related = src.relatedGame || card.relatedGame || {};
  const sc = src.scorecard || card.publicScorecard || {};
  const sourceType =
    _trim(src.sourceType || sc.sourceType || related.sourceType) === 'team_match'
      ? 'team_match'
      : 'game';
  return {
    sourceType: sourceType,
    gameId: _trim(src.gameId || sc.gameId || related.gameId) || '',
    matchId: _trim(src.matchId || sc.matchId || related.matchId) || '',
    momentId: _trim(src.momentId || card.momentId) || ''
  };
}

function buildGameHubUrl(gameId) {
  // activeTab=leaderboard：与 Hub 默认一致；Hub 无领先榜时仍由页面自身回退
  return (
    GAME_HUB_PATH +
    '?gameId=' +
    encodeURIComponent(gameId) +
    '&activeTab=leaderboard'
  );
}

function buildTournamentDetailUrl(matchId) {
  // 仅安全展示 TAB，不授予权限
  return (
    TOURNAMENT_DETAIL_PATH +
    '?matchId=' +
    encodeURIComponent(matchId) +
    '&activeTab=leaderboard'
  );
}

function _fail(error, detail) {
  _navBusyUntil = 0;
  try {
    console.warn('[openMomentGameHub]', error, detail || {});
  } catch (e) { /* ignore */ }
  wx.showToast({ title: UNAVAILABLE_TIP, icon: 'none' });
  return { ok: false, error: error };
}

function _navigateOnce(url, meta) {
  const now = Date.now();
  if (now < _navBusyUntil) {
    return { ok: false, error: 'nav_busy', url: url };
  }
  _navBusyUntil = now + 1200;
  wx.navigateTo({
    url: url,
    fail: function () {
      _fail('navigate_fail', Object.assign({ url: url }, meta || {}));
    },
    complete: function () {
      // 成功后保留短冷却，吸收双击的第二次 tap
      _navBusyUntil = Date.now() + 500;
    }
  });
  return { ok: true, url: url };
}

/**
 * @param {object} input opentap detail 或 moment 字段
 * @param {object} [fallbackCard] 动态卡片（含 relatedGame）
 * @returns {{ ok: boolean, error?: string, url?: string }}
 */
function openMomentGameHub(input, fallbackCard) {
  const open = normalizeOpenInput(input, fallbackCard);

  if (open.sourceType === 'team_match') {
    if (!open.matchId) return _fail('missing_match', open);
    const match = teamMatchStore.getMatchById(open.matchId);
    if (!match) return _fail('match_missing', { matchId: open.matchId });
    const url = buildTournamentDetailUrl(open.matchId);
    const nav = _navigateOnce(url, { matchId: open.matchId });
    if (!nav.ok) return nav;
    return { ok: true, url: url, sourceType: 'team_match' };
  }

  if (!open.gameId) return _fail('missing_game', open);
  const game = gameStore.getGame(open.gameId) || gameStore.getGameById(open.gameId);
  if (!game) return _fail('game_missing', { gameId: open.gameId });
  const url = buildGameHubUrl(open.gameId);
  const nav = _navigateOnce(url, { gameId: open.gameId });
  if (!nav.ok) return nav;
  return { ok: true, url: url, sourceType: 'game' };
}

module.exports = {
  UNAVAILABLE_TIP: UNAVAILABLE_TIP,
  normalizeOpenInput: normalizeOpenInput,
  buildGameHubUrl: buildGameHubUrl,
  buildTournamentDetailUrl: buildTournamentDetailUrl,
  openMomentGameHub: openMomentGameHub
};
