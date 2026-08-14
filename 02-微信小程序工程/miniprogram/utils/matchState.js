/**
 * 统一比赛状态对象（matchState）——记分页面唯一数据源。
 *
 * 约束：
 * - 所有进入记分页面的入口，必须先写好本场景的 matchState，再统一调用 enterScorePage()。
 * - 任何页面禁止直接 navigateTo 记分页，也禁止在记分页写死赛制 / 初始化默认比赛数据。
 * - 记分页 onLoad 只读取 matchState 渲染 UI。
 *
 * 结构：
 * {
 *   mode: 'game' | 'fourball_best' | 'individual_stroke' | 'stroke_entity' | 'standard',
 *   formatType: 'best_score' | 'best_ball' | 'best_ball_4_0' | 'individual_stroke' | 'fourball_2ball' | 'standard',
 *   // Stroke Entity：用 mode='stroke_entity' 区分记分主体；formatType 保持原有语义，不新增运行字段。
 *   gameId: '',        // game 模式持久化键（gameStore）
 *   groupIndex: 0,     // game 模式当前组
 *   groupId: '',       // 当前组：普通个人记分 / Stroke Entity 组合记分均使用
 *   players: [],       // HOLE 上方名册（{ playerId, name, avatar }）
 *   course: {},        // 球场信息（courseName / teeTime / halfText / roundName ...）
 *   scores: [],        // 18 洞成绩，初始全部为 null
 *   groupCount: 1      // 总组数（返回逻辑依赖）
 * }
 */

const MATCH_STATE_KEY = 'matchState';
const SCORE_PAGE_URL = '/subpackages/scoring/pages/score/index';
const CLEAN_HOME_URL = '/pages/home/index?tab=my';
const FROM_FLOW_NORMAL_CREATE = 'normalCreate';
const gameStore = require('./gameStore.js');

function getMatchState() {
  try {
    const ms = wx.getStorageSync(MATCH_STATE_KEY);
    return ms && typeof ms === 'object' ? ms : null;
  } catch (e) {
    return null;
  }
}

function setMatchState(ms) {
  try {
    wx.setStorageSync(MATCH_STATE_KEY, ms || null);
  } catch (e) {}
}

function clearMatchState() {
  try {
    wx.removeStorageSync(MATCH_STATE_KEY);
  } catch (e) {}
}

// 空 18 洞成绩（唯一初始化来源，禁止 0 / 假数据）
function emptyScores() {
  return Array.from({ length: 18 }, () => null);
}

// 赛制（gameMode + 组合）→ formatType（与创建页 _resolveFormatType 保持一致的唯一映射）
function getGroupComposition(game, group, groupIndex) {
  const map = (game && game.groupCompositionMap) || {};
  const gid = (group && group.groupId) || (group && group.id);
  if (gid && map[gid]) return map[gid];
  if (group && group.composition) return group.composition;
  if (groupIndex === 0 && game && game.composition) return game.composition;
  return null;
}

function resolveFormatTypeFromGame(game, groupIndex) {
  const gi = Number(groupIndex) || 0;
  const groups = (game && game.groups) || [];
  const group = groups[gi];
  const comp = getGroupComposition(game, group, gi);
  const single = !!(comp && (comp.teamMode === 'single_team' || comp.single));
  const mode = game && game.gameMode;
  if (mode === '最好成绩赛') return 'best_score';
  if (mode === '最佳球位赛') return single ? 'best_ball_4_0' : 'best_ball';
  if (mode === '四人两球赛') return 'fourball_2ball';
  return 'individual_stroke';
}

// 团队类赛制 → 统一记分引擎 fourball_best；其余 → 分组记分 game
// 四人两球赛：formatType 仍为 fourball_2ball，mode 走 fourball_best（复用 pair shell）
function isTeamMode(game) {
  const m = game && game.gameMode;
  return m === '最好成绩赛' || m === '最佳球位赛' || m === '四人两球赛';
}

// 统一记分引擎分组结构（scoreEngine.groups）：优先本组 composition.teams
function resolveGroupsFromGame(game, group, groupIndex) {
  const gi = Number(groupIndex) || 0;
  const comp = getGroupComposition(game, group, gi);
  if (comp && Array.isArray(comp.teams) && comp.teams.length) {
    return comp.teams.map((t) => ({
      teamId: t.teamId,
      name: t.name,
      type: t.type,
      members: (t.members || t.players || []).map((m) => ({
        playerId: m.playerId,
        name: m.name,
        avatar: m.avatar || '',
        gender: m.gender || '',
        tPosition: m.tPosition || '',
        tee: m.tee || m.tPosition || ''
      }))
    }));
  }
  if (game && game.composition && Array.isArray(game.composition.teams) && game.composition.teams.length && gi === 0) {
    return game.composition.teams;
  }
  const slots = (group && group.playersSlots) || [];
  return slots.filter(Boolean).map((p, i) => ({
    teamId: 'team-' + (i + 1),
    name: '队伍 ' + (i + 1),
    members: [{
      playerId: p.playerId,
      name: p.name,
      avatar: p.avatar || '',
      gender: p.gender || '',
      tPosition: p.tPosition || '',
      tee: p.tee || p.tPosition || ''
    }]
  }));
}

// 由 game 对象 + 组序号构建 matchState（home / game hub / create 复用，保证多组各取本组球员）
function buildFromGame(game, groupIndex) {
  const gi = Number(groupIndex) || 0;
  const groups = gameStore.listGroups(game);
  const group = groups[gi] || { playersSlots: [] };
  const players = (group.playersSlots || [])
    .filter(Boolean)
    .map((p) => ({ playerId: p.playerId, name: p.name, avatar: p.avatar || '' }));
  const formatType = resolveFormatTypeFromGame(game, gi);
  // 团队类赛制走统一记分引擎（fourball_best），由 scoreEngine.groups 驱动分组高亮/控件数量
  const unified = isTeamMode(game);
  return {
    mode: unified ? 'fourball_best' : 'game',
    formatType: formatType,
    gameId: (game && game.gameId) || '',
    groupIndex: gi,
    groupId: ((game && game.gameId) || '') + ':' + gi,
    players: players,
    groups: unified ? resolveGroupsFromGame(game, group, gi) : undefined,
    course: {
      courseId: (game && game.courseId) || '',
      courseName: (game && game.courseName) || '',
      courseLocation: (game && game.courseLocation) || '',
      halfText: (game && game.courseHalfText) || '',
      teeTime: (game && game.teeTime) || '',
      roundName: (game && game.roundName) || (game && game.courseName) || '',
      front9Course: (game && game.front9Course) || null,
      back9Course: (game && game.back9Course) || null
    },
    scores: emptyScores(),
    groupCount: groups.length || 1
  };
}

/** 开发诊断：enterScorePage 回调异常；默认关闭，不向用户抛错 */
const ENTER_SCORE_DEBUG_LOG = false;
function enterScoreDebugLog() {
  if (!ENTER_SCORE_DEBUG_LOG) return;
  try {
    console['warn'].apply(console, arguments);
  } catch (e) { /* ignore */ }
}

/**
 * 安全执行可选回调：仅函数、try/catch 隔离、异常不外抛。
 * 不挂 complete，保证 success/fail 各自至多触发一次业务回调。
 */
function _safeEnterScoreCallback(fn, args, label) {
  if (typeof fn !== 'function') return;
  try {
    fn.apply(null, args || []);
  } catch (err) {
    enterScoreDebugLog('[enterScorePage]', label || 'callback_error', err);
  }
}

/**
 * 普通创建成功后的导航与返回计划（明确来源标记，不按栈长度猜测）。
 * - 单组：redirect 记分页；Score 返回 reLaunch 干净首页
 * - 多组参赛：redirect Hub（带 fromFlow）再进记分；Score 回 Hub；Hub 返回 reLaunch 干净首页
 * - 多组未参赛：只 redirect Hub（带 fromFlow）；Hub 返回干净首页
 */
function planNormalCreateSuccessNav(input) {
  const src = input && typeof input === 'object' ? input : {};
  const isMulti = !!src.isMulti;
  const creatorInGame = !!src.creatorInGame;
  if (isMulti && !creatorInGame) {
    return {
      kind: 'replace_hub',
      fromFlow: FROM_FLOW_NORMAL_CREATE,
      fromPage: 'gameHub',
      enterScore: false,
      scoreReplace: false,
      scoreBack: 'hub',
      hubBack: 'relaunch_clean_home'
    };
  }
  if (isMulti && creatorInGame) {
    return {
      kind: 'replace_hub_then_score',
      fromFlow: FROM_FLOW_NORMAL_CREATE,
      fromPage: 'gameHub',
      enterScore: true,
      scoreReplace: false,
      scoreBack: 'hub',
      hubBack: 'relaunch_clean_home'
    };
  }
  return {
    kind: 'replace_score',
    fromFlow: FROM_FLOW_NORMAL_CREATE,
    fromPage: 'home',
    enterScore: true,
    scoreReplace: true,
    scoreBack: 'relaunch_clean_home',
    hubBack: null
  };
}

function buildNormalCreateHubUrl(gameId, startGroupIndex, creatorInGame) {
  const gid = gameId != null ? encodeURIComponent(String(gameId)) : '';
  const base =
    '/pages/game/hub/index?gameId=' +
    gid +
    '&activeTab=group&fromFlow=' +
    FROM_FLOW_NORMAL_CREATE;
  if (creatorInGame) {
    return base + '&currentGroup=' + (Number(startGroupIndex) || 0);
  }
  return base;
}

function isNormalCreateSuccessFlow(ms) {
  return !!(ms && ms.fromFlow === FROM_FLOW_NORMAL_CREATE);
}

function shouldRelaunchCleanHomeFromScore(ms) {
  return isNormalCreateSuccessFlow(ms) && ms && ms.fromPage === 'home';
}

function isHubOpenedFromNormalCreate(query) {
  const src = query && typeof query === 'object' ? query : {};
  return src.fromFlow === FROM_FLOW_NORMAL_CREATE;
}

/**
 * 统一进入记分页面：
 * - 读取 matchState；不存在（或无 formatType）→ 提示「暂无比赛数据」，不跳转。
 * - 存在 → 进入记分页（不携带任何赛制参数，记分页只认 matchState）。
 * - 默认 navigateTo；options.replace=true 时 redirectTo（用于普通单组创建成功，清掉创建页）。
 * @param {object} [options]
 * @param {function} [options.onFail] 失败回调（reason）；传入后可由调用方统一提示/回滚
 * @param {function} [options.onSuccess] 导航成功回调
 * @param {boolean} [options.silentToast] 为 true 时不弹默认 toast（需配合 onFail）
 * @param {boolean} [options.replace] 为 true 时 redirectTo，替换当前页
 */
function enterScorePage(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const ms = getMatchState();
  if (!ms || !ms.formatType) {
    if (typeof opts.onFail === 'function') {
      _safeEnterScoreCallback(opts.onFail, ['no_match_state'], 'onFail');
    } else if (!opts.silentToast) {
      wx.showToast({ title: '暂无比赛数据', icon: 'none' });
    }
    return false;
  }
  const navOpts = {
    url: SCORE_PAGE_URL,
    success: function () {
      _safeEnterScoreCallback(opts.onSuccess, [], 'onSuccess');
    },
    fail: function (err) {
      if (typeof opts.onFail === 'function') {
        _safeEnterScoreCallback(opts.onFail, ['navigate_fail', err], 'onFail');
      } else if (!opts.silentToast) {
        wx.showToast({
          title: '跳转失败：' + (err && err.errMsg ? err.errMsg : ''),
          icon: 'none'
        });
      }
    }
  };
  if (opts.replace === true && typeof wx.redirectTo === 'function') {
    wx.redirectTo(navOpts);
  } else {
    wx.navigateTo(navOpts);
  }
  return true;
}

module.exports = {
  MATCH_STATE_KEY,
  SCORE_PAGE_URL,
  CLEAN_HOME_URL,
  FROM_FLOW_NORMAL_CREATE,
  getMatchState,
  setMatchState,
  clearMatchState,
  emptyScores,
  resolveFormatTypeFromGame,
  buildFromGame,
  planNormalCreateSuccessNav,
  buildNormalCreateHubUrl,
  isNormalCreateSuccessFlow,
  shouldRelaunchCleanHomeFromScore,
  isHubOpenedFromNormalCreate,
  enterScorePage
};
