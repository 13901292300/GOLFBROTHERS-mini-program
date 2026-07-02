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
 *   mode: 'game' | 'fourball_best' | 'individual_stroke' | 'standard',
 *   formatType: 'best_score' | 'best_ball' | 'best_ball_4_0' | 'individual_stroke' | 'fourball_2ball' | 'standard',
 *   gameId: '',        // game 模式持久化键（gameStore）
 *   groupIndex: 0,     // game 模式当前组
 *   groupId: '',       // individual_stroke（赛事出发表）当前组
 *   players: [],       // HOLE 上方名册（{ playerId, name, avatar }）
 *   course: {},        // 球场信息（courseName / teeTime / halfText / roundName ...）
 *   scores: [],        // 18 洞成绩，初始全部为 null
 *   groupCount: 1      // 总组数（返回逻辑依赖）
 * }
 */

const MATCH_STATE_KEY = 'matchState';
const SCORE_PAGE_URL = '/pages/score/index';

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

// 团队类赛制（最好成绩赛 / 最佳球位赛）→ 统一记分引擎；其余 → 分组记分
function isTeamMode(game) {
  const m = game && game.gameMode;
  return m === '最好成绩赛' || m === '最佳球位赛';
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
        avatar: m.avatar || ''
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
    members: [{ playerId: p.playerId, name: p.name, avatar: p.avatar || '' }]
  }));
}

// 由 game 对象 + 组序号构建 matchState（home / game hub / create 复用，保证多组各取本组球员）
function buildFromGame(game, groupIndex) {
  const gi = Number(groupIndex) || 0;
  const groups = (game && game.groups) || [];
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
      halfText: (game && game.courseHalfText) || '',
      teeTime: (game && game.teeTime) || '',
      roundName: (game && game.roundName) || (game && game.courseName) || ''
    },
    scores: emptyScores(),
    groupCount: groups.length || 1
  };
}

/**
 * 统一进入记分页面：
 * - 读取 matchState；不存在（或无 formatType）→ 提示「暂无比赛数据」，不跳转。
 * - 存在 → 进入记分页（不携带任何赛制参数，记分页只认 matchState）。
 */
function enterScorePage() {
  const ms = getMatchState();
  if (!ms || !ms.formatType) {
    wx.showToast({ title: '暂无比赛数据', icon: 'none' });
    return false;
  }
  wx.navigateTo({
    url: SCORE_PAGE_URL,
    fail: (err) =>
      wx.showToast({ title: '跳转失败：' + (err && err.errMsg ? err.errMsg : ''), icon: 'none' })
  });
  return true;
}

module.exports = {
  MATCH_STATE_KEY,
  getMatchState,
  setMatchState,
  clearMatchState,
  emptyScores,
  resolveFormatTypeFromGame,
  buildFromGame,
  enterScorePage
};
