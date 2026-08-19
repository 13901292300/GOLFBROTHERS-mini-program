/**
 * 球友圈成绩卡 → 进入比赛：
 *
 * - 普通 GAME，恰好 1 个有效组 → 正式记分页（球友圈 → Score，不经 Hub）
 * - 普通 GAME，多于 1 个有效组 → Game Hub 领先榜（球友圈 → Hub）
 * - 团体比赛 → 赛事详情（安全 TAB：leaderboard / 得分榜）
 * - 无有效组 / 数据异常 → 仅提示，不创建空 Hub / Score
 *
 * 约束：
 * - 有效组判定与 Game Hub 一致（gameStore.listGroups），不读动态旧 groupId
 * - 单组直达复用 buildFromGame → setMatchState → enterScorePage
 * - 仅 wx.navigateTo，保持来源页在栈内
 * - 短时导航锁：防止快速双击压入重复页面
 */
const gameStore = require('../../../utils/gameStore.js');
const teamMatchStore = require('../../../utils/teamMatchStore.js');
const matchStateUtil = require('../../../utils/matchState.js');

const UNAVAILABLE_TIP = '该比赛暂不可进入';
const GAME_HUB_PATH = '/subpackages/scoring/pages/hub/index';
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

/**
 * 与 Game Hub 一致的有效组列表（含真实 groupIndex）。
 * - 数据源：gameStore.listGroups（Hub / isMultiGroup 同源）
 * - 已删除组：Hub 路径下已从 groups 物理移除；若残留 deleted 标记则跳过
 * - 空占位 / null 洞：不计入
 * - 不使用动态发布时缓存的旧 groupId
 */
function listValidGroupsForMomentEntry(game) {
  const raw = gameStore.listGroups(game) || [];
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const g = raw[i];
    if (!g || typeof g !== 'object') continue;
    if (g.deleted === true || g.removed === true) continue;
    const st = _trim(g.status).toLowerCase();
    if (st === 'deleted' || st === 'removed') continue;
    // 纯 UI 占位（若误写入 groups）不计为有效组
    if (g.empty === true || g.placeholder === true) continue;
    out.push({ group: g, groupIndex: i });
  }
  return out;
}

function _fail(error, detail) {
  _navBusyUntil = 0;
  try {
    console.warn('[openMomentGameHub]', error, detail || {});
  } catch (e) { /* ignore */ }
  wx.showToast({ title: UNAVAILABLE_TIP, icon: 'none' });
  return { ok: false, error: error };
}

function _acquireNavLock() {
  const now = Date.now();
  if (now < _navBusyUntil) return false;
  _navBusyUntil = now + 1200;
  return true;
}

function _releaseNavLockSoon() {
  _navBusyUntil = Date.now() + 500;
}

function _navigateOnce(url, meta) {
  if (!_acquireNavLock()) {
    return { ok: false, error: 'nav_busy', url: url };
  }
  wx.navigateTo({
    url: url,
    fail: function () {
      _fail('navigate_fail', Object.assign({ url: url }, meta || {}));
    },
    complete: function () {
      // 成功后保留短冷却，吸收双击的第二次 tap
      _releaseNavLockSoon();
    }
  });
  return { ok: true, url: url };
}

function _restoreMatchState(prev) {
  try {
    if (prev) matchStateUtil.setMatchState(prev);
    else matchStateUtil.clearMatchState();
  } catch (e) { /* ignore */ }
}

/**
 * 单组：正式入口链路 buildFromGame → setMatchState → enterScorePage。
 * 失败时回滚 matchState，不降级打开 Hub。
 */
function _enterSingleGroupScore(game, groupIndex, open) {
  if (!_acquireNavLock()) {
    return { ok: false, error: 'nav_busy' };
  }

  const prev = matchStateUtil.getMatchState();
  let built = null;
  try {
    built = matchStateUtil.buildFromGame(game, groupIndex);
  } catch (e) {
    _navBusyUntil = 0;
    return _fail('build_throw', {
      gameId: open.gameId,
      groupIndex: groupIndex,
      message: e && e.message
    });
  }

  if (!built || !built.formatType || !_trim(built.gameId)) {
    _navBusyUntil = 0;
    return _fail('build_invalid', { gameId: open.gameId, groupIndex: groupIndex });
  }

  matchStateUtil.setMatchState(built);

  const entered = matchStateUtil.enterScorePage({
    silentToast: true,
    onFail: function (reason) {
      // 恢复 / toast 异常不得挡住立即释锁；1200ms 仅作兜底，非正常路径
      try {
        _restoreMatchState(prev);
        try {
          console.warn('[openMomentGameHub]', reason || 'enter_fail', {
            gameId: open.gameId,
            groupIndex: groupIndex
          });
        } catch (e) { /* ignore */ }
        try {
          wx.showToast({ title: UNAVAILABLE_TIP, icon: 'none' });
        } catch (e2) { /* ignore */ }
      } finally {
        _navBusyUntil = 0;
      }
    },
    onSuccess: function () {
      try {
        /* 导航已成功：无需额外业务 */
      } finally {
        // 短时冷却吸收双击；不得依赖 1200ms 超时作为正常释锁
        _releaseNavLockSoon();
      }
    }
  });

  if (!entered) {
    // enterScorePage 已通过 onFail 回滚、提示并释锁
    return { ok: false, error: 'enter_fail', groupIndex: groupIndex };
  }

  return {
    ok: true,
    sourceType: 'game',
    entry: 'score',
    gameId: open.gameId,
    groupIndex: groupIndex
  };
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

  // 以 GAME 当前有效分组为准（与 Hub 同源），忽略动态旧 groupId
  const validGroups = listValidGroupsForMomentEntry(game);
  if (!validGroups.length) {
    return _fail('no_valid_group', { gameId: open.gameId });
  }

  if (validGroups.length === 1) {
    return _enterSingleGroupScore(game, validGroups[0].groupIndex, open);
  }

  const url = buildGameHubUrl(open.gameId);
  const nav = _navigateOnce(url, { gameId: open.gameId });
  if (!nav.ok) return nav;
  return {
    ok: true,
    url: url,
    sourceType: 'game',
    entry: 'hub',
    groupCount: validGroups.length
  };
}

module.exports = {
  UNAVAILABLE_TIP: UNAVAILABLE_TIP,
  normalizeOpenInput: normalizeOpenInput,
  buildGameHubUrl: buildGameHubUrl,
  buildTournamentDetailUrl: buildTournamentDetailUrl,
  listValidGroupsForMomentEntry: listValidGroupsForMomentEntry,
  openMomentGameHub: openMomentGameHub
};
