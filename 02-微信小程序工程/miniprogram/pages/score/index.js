/**
 * 记分页面 — 1:1 复刻 记分及添加删除页面汇总.html
 */

const { createHeaderStyle } = require('../../utils/headerEngine.js');
const groupsStore = require('../../utils/groupsStore.js');
const playerSlots = require('../../utils/playerSlots.js');
const { getGenderById } = require('../../utils/playerDirectory.js');
const teamDirectory = require('../../utils/teamDirectory.js');
const gameStore = require('../../utils/gameStore.js');
const weatherService = require('../../utils/weatherService.js');
const matchState = require('../../utils/matchState.js');
const gameProgress = require('../../utils/gameProgress.js');
const matchStatus = require('../../utils/matchStatus.js');
const gameLifecycle = require('../../utils/gameLifecycle.js');
const halfCourseEdit = require('../../utils/halfCourseEdit.js');
const holeLayout = require('../../utils/holeLayout.js');
const mockAvatars = require('../../utils/mockAvatars.js');
const teamMatchStore = require('../../utils/teamMatchStore.js');
const teeSheetManage = require('../../utils/teeSheetManage.js');
const caddieScoringAccess = require('../../utils/caddieScoringAccess.js');
const userDirectory = require('../../utils/userDirectory.js');
const userStore = require('../../utils/userStore.js');
const contactStore = require('../../utils/contactStore.js');
const userIdentityAlias = require('../../utils/userIdentityAlias.js');
const { syncStrokeEntities } = require('../../utils/strokeEntityBuilder.js');
const {
  resolveStrokeKind,
  resolveGameMode,
  buildRegisterTeamMap,
  listFilledPlayers,
  isG5MatchPlayMode,
  isG6G7MatchPlayMode,
  isG8MatchPlayMode
} = require('../../utils/strokeEntityValidator.js');
const { resolveCompositionMode } = require('../../utils/strokeCompositionResolver.js');
const { normalizeFormalGroupSeats } = require('../../utils/strokeGroupSeatNormalizer.js');
const { buildMatchPlayResultSummary } = require('../../utils/matchPlayResult.js');
const {
  resolveCompositionType,
  parseCompositionParts,
  teamTypeForCapacity,
  isFourball21Shape,
  getCompositionSeats,
  deriveTeamsFromSeats
} = require('../../utils/fourballComposition.js');

const MATCH_JOIN_PENDING_BIND_KEY = 'gb_match_join_pending_bind_v1';

/** M2 A1：样例 console 只打一次，避免 refresh 刷屏 */
let _m2AdapterSampleLogged = false;

// 单组 Game 球员行配色（按槽位顺序）
const GAME_COLOR_CLASSES = ['border-red', 'border-gold', 'border-white', 'border-light'];

const SPECIAL_IDX = holeLayout.SPECIAL_IDX;

function holePars() {
  return holeLayout.getLayout().holePars;
}
function columnLabels() {
  return holeLayout.getLayout().columnLabels;
}
function columnPars() {
  return holeLayout.getLayout().columnPars;
}

function resolveCanonicalUserId(userId) {
  const id = String(userId || '').trim();
  if (!id) return '';
  try {
    return String(userIdentityAlias.resolveCanonicalUserId(id) || id).trim() || id;
  } catch (e) {
    return id;
  }
}

function isSameUserIdentity(leftUserId, rightUserId) {
  const left = String(leftUserId || '').trim();
  const right = String(rightUserId || '').trim();
  if (!left || !right) return false;
  if (left === right) return true;
  return resolveCanonicalUserId(left) === resolveCanonicalUserId(right);
}

function createIdentitySuffix() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function createGuestUserId(seed) {
  const raw = String(seed || '').trim().replace(/[^A-Za-z0-9_]/g, '_');
  return 'guest_' + (raw || createIdentitySuffix());
}

function createManualPlayerId() {
  return 'm_' + createIdentitySuffix();
}

/** P0-G1：身份 sticky 定宽（avatar+nickname；diff/T 已迁入 score-track-prefix） */
const G1_IDENTITY_COL_WIDTH = 128;

// pair 行 swipe indent：头像重叠块几何（用于居中 gap 计算，仅 progress>0 时启用）
const PAIR_SWIPE_GEOM = {
  AVATAR_W: 72,
  AV1_LEFT: 24,
  AV2_LEFT: 128,
  SECOND_SHIFT_MAX: 68
};

/** 普通创建 fourball_best 2+2 split：两阶段横滑（仅 isFourballPair22） */
const FB22_PHASE1_SCROLL_PX = 72; // 阶段1：只压缩 identity → 半遮挡
const FB22_PHASE2_SCROLL_PX = 72; // 阶段2：diff 96→0
const FB22_DIFF_W = 96;
const FB22_TEE_W = 6;
const FB22_PAD_L = 24; // 与 split padding-right:0 对齐，只计左 pad
const FB22_IDENTITY_END = 148; // 阶段1终点：identity 固定宽
/** pair22：80 头像半遮挡几何（第二中心 = 第一右缘 → shift −64；不影响 entity 72 几何） */
const FB22_PAIR_GEOM = {
  AVATAR_W: 80,
  AV1_LEFT: 24,
  AV2_LEFT: 128,
  SECOND_SHIFT_MAX: 64
};

/**
 * 普通四人两球（formatType=fourball_2ball）：从固定 4 slot 生成 team-1 / team-2 成员。
 * - 4 人：slot1+2 → team-1，slot3+4 → team-2
 * - 2 人：剩余两人 → team-1，team-2.members=[]（成绩保留、展示隐藏）
 * 不新建 teamId，不改 scores。
 */
function slotPlayerToFourballMember(slot) {
  if (!slot) return null;
  const nested = slot.player || null;
  const playerId =
    (slot.playerId != null && String(slot.playerId).trim()) ||
    (slot.id != null && String(slot.id).trim()) ||
    (nested && nested.playerId != null && String(nested.playerId).trim()) ||
    '';
  if (!playerId) return null;
  const tPosition =
    (slot.tPosition != null && String(slot.tPosition).trim()) ||
    (nested && nested.tPosition != null && String(nested.tPosition).trim()) ||
    '';
  const tee =
    (slot.tee != null && String(slot.tee).trim()) ||
    (nested && nested.tee != null && String(nested.tee).trim()) ||
    tPosition ||
    '';
  const gender =
    (slot.gender != null && String(slot.gender).trim()) ||
    (nested && nested.gender != null && String(nested.gender).trim()) ||
    '';
  return {
    playerId: playerId,
    name: (slot.name || (nested && nested.name) || '球员').trim() || '球员',
    avatar: (slot.avatar || (nested && nested.avatar) || '') || '',
    gender: gender,
    tPosition: tPosition,
    tee: tee
  };
}

function countFilledFourballSlots(slots) {
  const arr = Array.isArray(slots) ? slots : [];
  let n = 0;
  for (let i = 0; i < 4; i++) {
    if (slotPlayerToFourballMember(arr[i])) n += 1;
  }
  return n;
}

function buildOrdinaryFourball2BallTeamsFromSlots(slots) {
  const arr = Array.isArray(slots) ? slots : [];
  const s0 = slotPlayerToFourballMember(arr[0]);
  const s1 = slotPlayerToFourballMember(arr[1]);
  const s2 = slotPlayerToFourballMember(arr[2]);
  const s3 = slotPlayerToFourballMember(arr[3]);
  const filled = [s0, s1, s2, s3].filter(Boolean);
  const makeTeam = (teamIndex, members) => {
    const list = (members || []).filter(Boolean);
    return {
      teamIndex: teamIndex,
      teamId: 'team-' + teamIndex,
      name: '队伍 ' + teamIndex,
      type: 'pair',
      players: list.slice(),
      members: list.slice()
    };
  };
  if (filled.length === 4) {
    return {
      filledCount: 4,
      teams: [makeTeam(1, [s0, s1]), makeTeam(2, [s2, s3])]
    };
  }
  if (filled.length === 2) {
    return {
      filledCount: 2,
      teams: [makeTeam(1, filled), makeTeam(2, [])]
    };
  }
  return { filledCount: filled.length, teams: null };
}

function pickFourballTeamScoreRecord(teamId, engineGroups, savedEntities) {
  const tid = String(teamId || '').trim();
  if (!tid) return { scores: [], putts: [] };
  const fromEngine = (engineGroups || []).find(
    (g) => g && String(g.id || g.teamId || '').trim() === tid
  );
  if (fromEngine) {
    return {
      scores: (fromEngine.scores || []).slice(),
      putts: (fromEngine.putts || []).slice()
    };
  }
  const fromSaved = (savedEntities || []).find(
    (r) => r && String(r.teamId || '').trim() === tid
  );
  if (fromSaved) {
    return {
      scores: (fromSaved.scores || []).slice(),
      putts: (fromSaved.putts || []).slice()
    };
  }
  return { scores: [], putts: [] };
}

/**
 * fourball_best 视觉门控（不改成绩模型）
 * - 只看当前有效 members，不看 compositionType（规则字段，不驱动展示）
 * - isFourballPair22：纯 2+2
 * - isFourballPairLayout：2+2 或 2+1（有 pair 且无 ≥3 人组）→ 复用 pair22 布局/横滑
 * - 空成员组不参与门控（避免缺员扭曲 shell）
 */
function resolveFourballPairFlags(groups) {
  const list = (Array.isArray(groups) ? groups : []).filter(
    (g) => (((g && g.members) || []).length > 0)
  );
  if (!list.length) {
    return { isFourballPair22: false, isFourballPairLayout: false };
  }
  let hasPair = false;
  let allAtMostTwo = true;
  let allExactlyTwo = true;
  for (let i = 0; i < list.length; i++) {
    const n = ((list[i] && list[i].members) || []).length;
    if (n === 2) hasPair = true;
    if (n !== 2) allExactlyTwo = false;
    if (n > 2) allAtMostTwo = false;
  }
  return {
    isFourballPair22: allExactlyTwo,
    isFourballPairLayout: allAtMostTwo && hasPair
  };
}

/** fourball_best 4+0：存在成员数恰好为 4 的组（独立于 isFourballPair22 / pairLayout） */
function resolveFourballTeamLayoutFlag(groups) {
  const list = Array.isArray(groups) ? groups : [];
  for (let i = 0; i < list.length; i++) {
    if (((list[i] && list[i].members) || []).length === 4) return true;
  }
  return false;
}

/**
 * 普通创建纯 4+0 / 3+0：当前有效组成绩行均为恰好 4 人或恰好 3 人（全组同规模）。
 * 空成员组不参与判定；排除 2+2 / 2+1 / 3+1；不改成绩模型。
 */
function resolveFourball40StrokeShellFlag(groups) {
  const list = (Array.isArray(groups) ? groups : []).filter(
    (g) => (((g && g.members) || []).length > 0)
  );
  if (!list.length) return false;
  let size = 0;
  for (let i = 0; i < list.length; i++) {
    const n = ((list[i] && list[i].members) || []).length;
    if (n !== 3 && n !== 4) return false;
    if (!size) size = n;
    else if (n !== size) return false;
  }
  return size === 3 || size === 4;
}

/**
 * 普通创建 3+1：恰好两组且当前有效 members 为 3 与 1（顺序不限）。
 * 缺员后不成 3+1 形态时返回 false，改走当前 members 对应 shell。
 */
function resolveFourball31StrokeShellFlag(groups) {
  const list = (Array.isArray(groups) ? groups : []).filter(
    (g) => (((g && g.members) || []).length > 0)
  );
  if (list.length !== 2) return false;
  let hasTriple = false;
  let hasSingle = false;
  for (let i = 0; i < list.length; i++) {
    const n = ((list[i] && list[i].members) || []).length;
    if (n === 3) hasTriple = true;
    else if (n === 1) hasSingle = true;
    else return false;
  }
  return hasTriple && hasSingle;
}

/** 4+0 / 3+0 / 3+1 共用个人比杆壳门控：仅按当前有效 members（不改成绩模型） */
function resolveStrokeTeamShellFlag(groups) {
  return resolveFourball40StrokeShellFlag(groups) || resolveFourball31StrokeShellFlag(groups);
}

/**
 * fourball 缺员后无法形成任何组合时的 UI fallback（不改 compositionType / 成绩归属）。
 * 例：3+1 → team-1=A、team-2=D（1+1）→ 个人比杆壳双人展示。
 * 已是 pair / 3+1 / 3+0 / 4+0 形态时返回 false。
 */
function resolveFourballIndividualStrokeFallbackFlag(groups) {
  const list = (Array.isArray(groups) ? groups : []).filter(
    (g) => (((g && g.members) || []).length > 0)
  );
  if (!list.length) return false;
  if (resolveStrokeTeamShellFlag(groups)) return false;
  if (resolveFourballPairFlags(groups).isFourballPairLayout) return false;
  if (resolveFourballTeamLayoutFlag(groups)) return false;
  // 仅剩单人队（1 / 1+1 / 1+1+1…），无 pair/triple/quad 组合
  return list.every((g) => ((g.members || []).length === 1));
}

/**
 * 3+0：在既有 4 列 grid 上补第 4 个空白占位；4+0（已满 4）原样返回。
 * 不重算列宽、不均分 3 卡。
 */
function padBestRosterFourSlots(roster) {
  const list = Array.isArray(roster) ? roster.slice(0, 4) : [];
  while (list.length < 4) {
    list.push({
      playerId: '__empty_slot_' + list.length,
      name: '',
      avatar: '',
      tee: '',
      teeColor: 'transparent',
      groupClass: '',
      isEmpty: true
    });
  }
  return list;
}

const PLAYER_SEEDS = [
  {
    id: 'p1',
    name: 'T. WOODS',
    avatar: mockAvatars.avatarByIndex(0),
    colorClass: 'border-red',
    scores: [4, 3, 5, 3, 4, 5, 4, 2, 4, 4, 4, 4, 5, 4, 5, 3, 4, 5],
    putts: [2, 1, 2, 1, 2, 2, 1, 1, 2, 2, 1, 2, 2, 1, 2, 1, 2, 2]
  },
  {
    id: 'p2',
    name: 'S. SCHEFFLER',
    avatar: mockAvatars.avatarByIndex(1),
    colorClass: 'border-gold',
    scores: [4, 4, 4, 3, 5, 5, 4, 3, 4, 4, 5, 3, 4, 4, 5, 4, 4, 4],
    putts: [2, 2, 1, 1, 2, 3, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2]
  },
  {
    id: 'p3',
    name: 'R. MCILROY',
    avatar: mockAvatars.avatarByIndex(2),
    colorClass: 'border-white',
    scores: [5, 4, 4, 4, 4, 6, 4, 3, 5, 4, 4, 3, 5, 4, 5, 3, 5, 4],
    putts: [2, 2, 2, 2, 1, 3, 2, 1, 2, 2, 1, 1, 2, 2, 3, 1, 2, 2]
  },
  {
    id: 'p4',
    name: 'X. SCHAUFFELE',
    avatar: mockAvatars.avatarByIndex(3),
    colorClass: 'border-light',
    scores: [4, 5, 4, 3, 4, 5, 5, 4, 4, 5, 4, 4, 4, 5, 5, 4, 4, 5],
    putts: [2, 2, 1, 1, 2, 2, 3, 2, 2, 2, 2, 2, 1, 2, 3, 2, 1, 2]
  }
];

const COLUMN_TRIANGLES = columnLabels().map((_, colIdx) => {
  if (SPECIAL_IDX.includes(colIdx)) return null;
  const colors = ['triangle-red', 'triangle-red', 'triangle-blue', 'triangle-blue'];
  const j = (colIdx * 3 + 1) % 4;
  return [colors[j], colors[(j + 1) % 4], colors[(j + 2) % 4], colors[(j + 3) % 4]];
});

// 游戏角标名次（视觉测试）：红三角 → 1/4，蓝三角 → 2/3
function cornerRank(colArr, pIdx) {
  if (!colArr || !colArr[pIdx]) return null;
  const cls = colArr[pIdx];
  let redSeen = 0;
  let blueSeen = 0;
  for (let i = 0; i <= pIdx; i++) {
    if (colArr[i] === 'triangle-red') redSeen += 1;
    else if (colArr[i] === 'triangle-blue') blueSeen += 1;
  }
  if (cls === 'triangle-red') return redSeen === 1 ? 1 : 4;
  if (cls === 'triangle-blue') return blueSeen === 1 ? 2 : 3;
  return null;
}

/** 多组普通球局 / 球队赛事记分页：更多功能面板（仅此 10 项） */
const MORE_MENU_ITEMS_COMPACT = [
  { icon: '⚑', label: '修改T台', bg: 'bg-pga-blue' },
  { icon: '⌖', label: '修改半场', bg: 'bg-pga-blue' },
  { icon: '▦', label: '成绩卡', bg: 'bg-pga-blue' },
  { icon: '↗', label: '统计数据', bg: 'bg-pga-blue' },
  { icon: '👥', label: '球友圈', bg: 'bg-pga-blue' },
  { icon: '✐', label: '球童记分', bg: 'bg-pga-blue' },
  { icon: '📖', label: '记账本', bg: 'bg-pga-blue' },
  { icon: '🪪', label: '海报', bg: 'bg-pga-blue' },
  { icon: '🎨', label: '显示设置', bg: 'bg-pga-blue' },
  { icon: '💬', label: '反馈', bg: 'bg-pga-blue' },
  { icon: '⏻', label: '结束比赛', bg: 'bg-gold', action: 'finish_match' }
];

/** 演示/标准模式等其它记分场景：主功能区（原「虚拟」位留空） */
const MORE_MENU_ITEMS_LEGACY_MAIN = [
  { icon: '✎', label: '修改比赛', bg: 'bg-pga-blue' },
  { icon: '⌖', label: '修改半场', bg: 'bg-pga-blue' },
  { icon: '⚑', label: '修改T台', bg: 'bg-pga-blue' },
  { icon: '▦', label: '成绩卡', bg: 'bg-pga-blue' },
  { icon: '↗', label: '统计数据', bg: 'bg-pga-blue' },
  { icon: '👥', label: '球友圈', bg: 'bg-pga-blue' },
  { icon: '✐', label: '球童记分', bg: 'bg-pga-blue' },
  { icon: '📖', label: '记账本', bg: 'bg-pga-blue' },
  { icon: '🪪', label: '海报', bg: 'bg-pga-blue' },
  { icon: '🎨', label: '显示设置', bg: 'bg-pga-blue' },
  { icon: '💬', label: '反馈', bg: 'bg-pga-blue' }
];
const MORE_MENU_LEGACY_PLACEHOLDER = { empty: true, label: '__placeholder__' };
const MORE_MENU_ITEMS_LEGACY_FOOTER = [
  { icon: '✕', label: '取消比赛', bg: 'bg-red' },
  { icon: '⏻', label: '结束比赛', bg: 'bg-gold', action: 'finish_match' }
];
const MORE_MENU_ITEMS_LEGACY = MORE_MENU_ITEMS_LEGACY_MAIN
  .concat([MORE_MENU_LEGACY_PLACEHOLDER])
  .concat(MORE_MENU_ITEMS_LEGACY_FOOTER);

/** Team Match 空位补位：人员来源选择（player-source-sheet 选项） */
const TEAM_MATCH_PLAYER_SOURCE_OPTIONS = [
  { key: 'register', glyph: '▤', label: '报名列表', desc: '从本场已报名人员中选择' },
  { key: 'friend', glyph: '👥', label: '好友列表', desc: '从我的好友中选择球员' },
  { key: 'team', glyph: '⚑', label: '球队列表', desc: '从现有球队成员中选择' },
  { key: 'manual', glyph: '✎', label: '手工添加', desc: '手动创建球员并加入该位置' }
];

/** Normal Game / 快捷创建空位补位：不得展示 Team Match 专属报名 / 球队来源 */
const NORMAL_GAME_PLAYER_SOURCE_OPTIONS = [
  { key: 'friend', glyph: '👥', label: '好友列表', desc: '从我的好友中选择球员' },
  { key: 'combo', glyph: '★', label: '老牌组合', desc: '常用四人组 / 上次比赛组合' },
  { key: 'manual', glyph: '✎', label: '手工添加', desc: '手动创建球员并加入该位置' }
];

function resolveMoreMenuPanels(mode, options) {
  const opts = options || {};
  const groupCount = opts.groupCount != null ? Number(opts.groupCount) : 1;
  const isMultiGroup = groupCount > 1;

  let useLegacyFull = false;
  if (mode === 'game') {
    // 单组普通球局 → 完整面板；多组普通球局记分页 → 缩减面板
    useLegacyFull = !isMultiGroup;
  } else if (mode === 'fourball_best' && opts.hasRealMatch) {
    // 组合赛制单组球局与单组个人比杆赛相同：完整面板；仅多组记分页缩减
    useLegacyFull = !isMultiGroup;
  } else if (mode === 'individual_stroke') {
    useLegacyFull = false;
  } else {
    useLegacyFull = true;
  }

  if (useLegacyFull) {
    return {
      moreMenuItems: MORE_MENU_ITEMS_LEGACY.slice()
    };
  }
  return {
    moreMenuItems: MORE_MENU_ITEMS_COMPACT.slice()
  };
}

function resolveMoreMenuItems(mode, options) {
  return resolveMoreMenuPanels(mode, options).moreMenuItems;
}

/** 球队赛记分页更多菜单：隐藏与详情页重复的成绩卡/统计入口 */
const TEAM_MATCH_MORE_MENU_HIDDEN_LABELS = {
  成绩卡: true,
  统计卡: true,
  统计数据: true
};

/** G5–G8 比洞：仅菜单入口占位（action 有值但不实现修改起始洞） */
const MORE_MENU_ITEM_EDIT_START_HOLE = {
  icon: '⛳',
  label: '修改起始洞',
  bg: 'bg-pga-blue',
  action: 'changeStartHole'
};

/**
 * 队内赛记分页更多菜单过滤（G1–G8）
 * - 一律隐藏「修改半场」（赛事级 M 已承接）
 * - isMatchPlayBoard（G5–G8）：在「修改T台」后插入「修改起始洞」
 * options.isMatchPlayBoard：复用 isMatchPlayBoardMode，禁止赛制字符串判断
 */
function filterTeamMatchScoreMoreMenuItems(items, options) {
  const opts = options || {};
  const isMatchPlayBoard = !!opts.isMatchPlayBoard;
  const filtered = (Array.isArray(items) ? items : []).filter((item) => {
    if (!item || item.empty) return true;
    if (item.label === '修改半场') return false;
    if (item.label === '修改起始洞' || item.action === 'changeStartHole') return false;
    return !TEAM_MATCH_MORE_MENU_HIDDEN_LABELS[item.label];
  });
  if (!isMatchPlayBoard) return filtered;
  const startHoleItem = Object.assign({}, MORE_MENU_ITEM_EDIT_START_HOLE);
  const out = [];
  let inserted = false;
  filtered.forEach((item) => {
    out.push(item);
    if (!inserted && item && item.label === '修改T台') {
      out.push(startHoleItem);
      inserted = true;
    }
  });
  if (!inserted) out.unshift(startHoleItem);
  return out;
}

/**
 * 是否球队赛记分页上下文（与详情进记分一致：matchId + team-internal）
 * 普通 gameId 球局不走此分支
 */
function isTeamInternalScoreMatchContext(matchState) {
  const ms = matchState || null;
  if (!ms || !ms.matchId) return false;
  if (ms.gameId && gameStore.getGame(ms.gameId)) return false;
  const match = teamMatchStore.getMatchById(ms.matchId);
  if (!match) return true;
  const matchType = String(match.matchType || '').trim();
  return !matchType || matchType === 'team-internal';
}

/** 整场比赛已结束：match.status === 'finished' */
function isMatchStatusFinished(match) {
  return String((match && match.status) || '').trim().toLowerCase() === 'finished';
}

function isFinishMatchMenuItem(item) {
  if (!item || item.empty) return false;
  if (item.action === 'finish_match') return true;
  const label = item.label != null ? String(item.label) : '';
  return label === '结束比赛' || label === '已结束';
}

/**
 * finished：第一行 4 个可点项 disabled；结束比赛 → 已结束 + disabled
 * 非 finished：结束比赛保持可点
 */
function applyFinishedScoreMoreMenuState(items, matchFinished) {
  const list = Array.isArray(items) ? items : [];
  if (!matchFinished) {
    return list.map((item) => {
      if (!item || item.empty) return item;
      if (isFinishMatchMenuItem(item)) {
        return Object.assign({}, item, {
          action: 'finish_match',
          label: '结束比赛',
          disabled: false
        });
      }
      return Object.assign({}, item, { disabled: false });
    });
  }
  let firstRowUsed = 0;
  return list.map((item) => {
    if (!item || item.empty) return item;
    if (isFinishMatchMenuItem(item)) {
      return Object.assign({}, item, {
        action: 'finish_match',
        label: '已结束',
        disabled: true
      });
    }
    if (firstRowUsed < 4) {
      firstRowUsed += 1;
      return Object.assign({}, item, { disabled: true });
    }
    return Object.assign({}, item, { disabled: false });
  });
}

function resolveGroupCountFromContext(matchState, game) {
  if (matchState && matchState.groupCount != null) {
    const n = Number(matchState.groupCount);
    if (!isNaN(n) && n > 0) return n;
  }
  if (game && Array.isArray(game.groups) && game.groups.length) {
    return game.groups.length;
  }
  return 1;
}

/** 记分页「更多功能」用组数：单组固定 1，多组才解析 matchState / game.groups */
function resolveScorePageGroupCount(gameId, matchState) {
  if (!gameId) return 1;
  const game = gameStore.getGame(gameId);
  if (!game || !gameStore.isMultiGroup(game)) return 1;
  return resolveGroupCountFromContext(matchState, game);
}

/**
 * 普通球局记分页「更多功能」面板：仅以 gameStore 实际组数为准（与展示 mode 解耦）
 * - 单组 → 完整面板，保留「修改半场」
 * - 多组 → 缩减面板，隐藏「修改半场」（赛事级 Hub M 已承接）
 */
function resolveNormalGameMoreMenu(gameId, matchState) {
  const groupCount = resolveScorePageGroupCount(gameId, matchState);
  if (groupCount <= 1) {
    return { moreMenuItems: MORE_MENU_ITEMS_LEGACY.slice() };
  }
  return {
    moreMenuItems: MORE_MENU_ITEMS_COMPACT.filter((item) => item && item.label !== '修改半场')
  };
}

const GROUP_PLAYERS = [
  { slot: 1, name: '大雷', avatar: mockAvatars.avatarByIndex(0) },
  { slot: 2, name: 'Alex', avatar: mockAvatars.avatarByIndex(1) },
  { slot: 3, name: 'Bogey King', avatar: mockAvatars.avatarByIndex(2) },
  { slot: 4, name: '老周', avatar: mockAvatars.avatarByIndex(3) }
];

// 固定 1-4 槽位：统一走全局 playerSlots 模型（删除=置空、添加=补空位、顺序固定）
// player 为 { playerId, name, avatar } 或 null
function buildGroupSlots(players) {
  const norm = (players || []).map((p, i) => ({
    playerId: p.playerId || ('gm-' + (i + 1)),
    name: p.name,
    avatar: p.avatar
  }));
  return playerSlots.toSlots(norm, 4);
}

// 领先榜 / OUT·IN·TOT 习惯：到标准杆 E、正数带 +、负数带 -
function formatDiff(diff) {
  if (diff === 0) return 'E';
  return diff > 0 ? '+' + diff : String(diff);
}

// 记分格右下角 diff：统一 -N / 0 / +N（禁止 E；evenAsZero 参数已废弃，忽略）
function formatCellDiff(diff) {
  const n = Number(diff);
  if (!Number.isFinite(n) || n === 0) return '0';
  return n > 0 ? '+' + n : String(n);
}

// 杆差模式主数字：diff>0 显示 +N，diff=0 显示 0，diff<0 显示 -N
function formatDiffWithPlus(diff) {
  if (diff > 0) return '+' + diff;
  if (diff === 0) return '0';
  return String(diff);
}

// 记分面板/记分格主数字统一显示：gross→实际杆数；diff→带符号杆差
function formatMainScore(scoreVal, par, displayMode) {
  if (scoreVal === null || scoreVal === undefined || scoreVal === '') return '';
  if (displayMode === 'diff') return formatDiffWithPlus(scoreVal - par);
  return String(scoreVal);
}

/**
 * 无成绩时洞格可显示的 T 台码数提示（接口预留）。
 *
 * target：
 * - 单人：player，按 target.tPosition 取该洞距离
 * - 多人组合：target.members 存在时，遍历成员 tPosition，取每人对应距离，返回最大距离
 *
 * 当前无真实 courseData，yardage 查找恒为空，最终返回 ''。
 * @param {object} target player 或带 members 的组合实体
 * @param {number} holeIndex 0–17
 * @returns {string}
 */
function resolveHoleTeeYardage(target, holeIndex) {
  /** @returns {number|null} 有 courseData 时返回码数，否则 null */
  function yardageForTee(tPosition) {
    // TODO: courseData?.holes?.[holeIndex]?.yardages?.[tPosition]
    void holeIndex;
    void tPosition;
    return null;
  }

  if (!target) return '';

  const members = Array.isArray(target.members) ? target.members : null;
  if (members && members.length > 0) {
    let max = null;
    for (let i = 0; i < members.length; i += 1) {
      const m = members[i];
      const y = yardageForTee(m && m.tPosition);
      if (y == null || !Number.isFinite(y)) continue;
      if (max == null || y > max) max = y;
    }
    return max == null ? '' : String(max);
  }

  const y = yardageForTee(target.tPosition);
  return y == null || !Number.isFinite(y) ? '' : String(y);
}

// 成绩状态判断统一走 groupsStore.getScoreStatus（与逐洞面板同一真源），此处只做记分格 class 名映射
function scoreStyle(diff) {
  switch (groupsStore.getScoreStatus(diff)) {
    case 'eagle': return 'score-eagle';          // 老鹰及更好：圆底白字
    case 'birdie': return 'score-birdie';        // 小鸟：红圈
    case 'bogey': return 'score-bogey';          // 加一：方框
    case 'double-bogey': return 'score-double';  // 加二及更差：灰底白字
    default: return '';                          // par / empty：普通数字
  }
}

/* ===== 四人最佳球位模式（fourball_best）专用数据，复刻 HTML 原型 ===== */
const BEST_ROSTER = [
  { name: 'WOODS', avatar: mockAvatars.avatarByIndex(0), tee: '黑T', teeColor: '#dc2626' },
  { name: 'SCHEFFLER', avatar: mockAvatars.avatarByIndex(1), tee: '金T', teeColor: '#ce9224' },
  { name: 'MCILROY', avatar: mockAvatars.avatarByIndex(2), tee: '白T', teeColor: '#ffffff' },
  { name: 'SCHAUFFELE', avatar: mockAvatars.avatarByIndex(3), tee: '蓝T', teeColor: '#00aeef' }
];

// 四人最佳球位「球员名册条」T台配色（按槽位顺序分配；无 tPosition 时 fallback）
const TEE_PALETTE = [
  { tee: '黑T', teeColor: '#dc2626' },
  { tee: '金T', teeColor: '#ce9224' },
  { tee: '白T', teeColor: '#ffffff' },
  { tee: '蓝T', teeColor: '#00aeef' }
];

/** 修改T台弹层：黑 / 金 / 蓝 / 白 / 红 */
const EDIT_TEE_OPTIONS = [
  { key: 'BLACK_T', label: '黑T', color: '#111827' },
  { key: 'GOLD_T', label: '金T', color: '#ce9224' },
  { key: 'BLUE_T', label: '蓝T', color: '#00aeef' },
  { key: 'WHITE_T', label: '白T', color: '#ffffff' },
  { key: 'RED_T', label: '红T', color: '#dc2626' }
];

function isEditTeeKey(value) {
  return (
    value === 'BLACK_T' ||
    value === 'GOLD_T' ||
    value === 'BLUE_T' ||
    value === 'WHITE_T' ||
    value === 'RED_T'
  );
}

/**
 * 记分页 T 台样式。
 * 1) 显式 tPosition（黑/金/蓝/白/红）优先
 * 2) 否则 gender === female → 红T，其它 → 蓝T
 * @param {object} player
 * @param {number} [_fallbackIndex] 保留参数兼容调用方，不再参与配色
 * @returns {{ tPosition: string, tee: string, teeColor: string, colorClass: string }}
 */
function resolveScoreTeeStyle(player, _fallbackIndex) {
  let tp = '';
  if (player && isEditTeeKey(player.tPosition)) {
    tp = player.tPosition;
  } else if (player && isEditTeeKey(player.tee)) {
    tp = player.tee;
  } else {
    const gender =
      (player && (player.gender === 'female' || player.gender === 'male') && player.gender) ||
      (player && (player.matchGender === 'female' || player.matchGender === 'male') && player.matchGender) ||
      'male';
    tp = gender === 'female' ? 'RED_T' : 'BLUE_T';
  }
  if (tp === 'BLACK_T') {
    return {
      tPosition: 'BLACK_T',
      tee: '黑T',
      teeColor: '#111827',
      colorClass: 'border-black'
    };
  }
  if (tp === 'GOLD_T') {
    return {
      tPosition: 'GOLD_T',
      tee: '金T',
      teeColor: '#ce9224',
      colorClass: 'border-gold'
    };
  }
  if (tp === 'WHITE_T') {
    return {
      tPosition: 'WHITE_T',
      tee: '白T',
      teeColor: '#ffffff',
      colorClass: 'border-white'
    };
  }
  if (tp === 'RED_T') {
    return {
      tPosition: 'RED_T',
      tee: '红T',
      teeColor: '#dc2626',
      colorClass: 'border-red'
    };
  }
  return {
    tPosition: 'BLUE_T',
    tee: '蓝T',
    teeColor: '#00aeef',
    colorClass: 'border-light'
  };
}

/** 展示用性别：显式字段 / 好友目录；异常缺失一律按男性 */
function resolveScoreDisplayGender(player, playerId) {
  if (player && player.gender === 'female') return 'female';
  if (player && player.gender === 'male') return 'male';
  if (player && player.matchGender === 'female') return 'female';
  if (player && player.matchGender === 'male') return 'male';
  const id = String(
    playerId || (player && (player.playerId || player.userId || player.id)) || ''
  ).trim();
  if (id) {
    const g = getGenderById(id, 'male');
    if (g === 'female') return 'female';
  }
  return 'male';
}

/**
 * 为 individual_stroke / team_match 记分源补齐 gender / tPosition / colorClass（不写 scoreData）
 * @returns {{ gender: string, tPosition: string, colorClass: string }}
 */
function applyScorePlayerTeeFields(player, index) {
  const p = player || {};
  const playerId = p.playerId || p.id || p.userId || '';
  const rawTp = isEditTeeKey(p.tPosition)
    ? p.tPosition
    : isEditTeeKey(p.tee)
      ? p.tee
      : '';
  const gender = resolveScoreDisplayGender(p, playerId);
  const teeStyle = resolveScoreTeeStyle(
    {
      tPosition: rawTp,
      gender: gender
    },
    index
  );
  return {
    gender: gender,
    tPosition: rawTp || teeStyle.tPosition,
    colorClass: teeStyle.colorClass
  };
}

// 由当前记分页面球员(_playersSource) 派生四人最佳球位名册条（唯一数据源，增删后随之刷新）
function buildBestRoster(players) {
  return (players || []).map((p, i) => {
    const style = resolveScoreTeeStyle(p, i);
    const shortName = p && p.name && p.name.indexOf('.') >= 0 ? p.name.split('.').pop().trim() : (p && p.name);
    return {
      playerId: (p && (p.playerId || p.id)) || ('seat-' + i),
      name: shortName || (p && p.name) || '球员',
      avatar: p && p.avatar,
      tee: style.tee,
      teeColor: style.teeColor
    };
  });
}

// 逐洞球队最佳球位相对杆差（18 个可打洞），与原型一致
const BEST_PATTERN = [-1, 0, -1, 0, -2, 0, -1, 0, 0, 0, -1, 0, -1, 0, 0, -2, 0, 0];
// OUT / IN / TOT 汇总（与原型一致）
const BEST_SPECIAL = {
  9: { score: 32, putts: 13, diff: -3 },
  19: { score: 33, putts: 14, diff: -2 },
  20: { score: 65, putts: 27, diff: -5 }
};

function bestScoreClass(diff) {
  if (diff <= -1) return 'score-birdie';
  if (diff === 1) return 'score-bogey';
  if (diff >= 2) return 'score-double';
  return '';
}

// displayMode（gross/diff）统一驱动记分格主数字与右下角杆差，逻辑与 enrichPlayer 保持一致
function buildBestBallColumns(displayMode) {
  return columnLabels().map((label, idx) => {
    const isSpecial = SPECIAL_IDX.includes(idx);
    const par = columnPars()[idx];
    let score;
    let putts;
    let diff;
    if (BEST_SPECIAL[idx]) {
      score = BEST_SPECIAL[idx].score;
      putts = BEST_SPECIAL[idx].putts;
      diff = BEST_SPECIAL[idx].diff;
    } else {
      const playableIdx = idx < 9 ? idx : idx - 1;
      diff = BEST_PATTERN[playableIdx] || 0;
      score = par + diff;
      putts = Math.max(1, 2 + (idx % 2 === 0 ? 0 : -1));
    }
    return {
      colIdx: idx,
      label,
      par,
      isSpecial,
      isTot: idx === 20,
      score,
      // 记分格主数字：gross→总杆；diff→带符号本洞杆差（汇总列与个人比杆赛一致，始终显示总杆）
      mainStr: isSpecial ? String(score) : formatMainScore(score, par, displayMode),
      putts,
      diff,
      // 右下角杆差：洞格统一 formatCellDiff；汇总列仍用 formatDiff
      diffStr: isSpecial
        ? formatDiff(diff)
        : displayMode === 'diff'
          ? ''
          : formatCellDiff(diff),
      diffClass: diff < 0 ? 'diff-under' : diff > 0 ? 'diff-over' : 'diff-even',
      scoreClass: isSpecial ? '' : bestScoreClass(diff)
    };
  });
}

// 空成绩列（真实比赛进入统一模板时：18 洞默认空，UI 不显示任何 0 / 假数据）
function buildEmptyBestColumns() {
  return columnLabels().map((label, idx) => ({
    colIdx: idx,
    label,
    par: columnPars()[idx],
    isSpecial: SPECIAL_IDX.includes(idx),
    isTot: idx === 20,
    score: '',
    mainStr: '',
    putts: '',
    diff: 0,
    diffStr: '',
    diffClass: 'diff-even',
    scoreClass: ''
  }));
}

// 由「团队单一成绩」数组派生四人最佳球位/最好成绩球队记分行 + OUT/IN/TOT 汇总。
// 唯一数据源为 team scores（每洞一个成绩，不区分球员）；仅 UI 派生，不改记分结构。
function buildTeamBestColumns(scores, putts, displayMode) {
  scores = scores || [];
  putts = putts || [];
  let outSum = 0, inSum = 0, outPutts = 0, inPutts = 0, outDiff = 0, inDiff = 0, outFilled = 0, inFilled = 0;
  let holeCursor = 0;
  const columns = columnLabels().map((label, idx) => {
    const par = columnPars()[idx];
    if (SPECIAL_IDX.includes(idx)) {
      const isOut = idx === 9;
      const isIn = idx === 19;
      const sum = isOut ? outSum : isIn ? inSum : outSum + inSum;
      const puttTotal = isOut ? outPutts : isIn ? inPutts : outPutts + inPutts;
      const diffTotal = isOut ? outDiff : isIn ? inDiff : outDiff + inDiff;
      const filled = isOut ? outFilled : isIn ? inFilled : outFilled + inFilled;
      return {
        colIdx: idx, label, par, isSpecial: true, isTot: idx === 20,
        score: filled > 0 ? sum : '',
        mainStr: filled > 0 ? String(sum) : '',
        putts: filled > 0 ? puttTotal : '',
        diff: diffTotal,
        diffStr: filled > 0 ? formatDiff(diffTotal) : '',
        diffClass: diffTotal < 0 ? 'diff-under' : diffTotal > 0 ? 'diff-over' : 'diff-even',
        scoreClass: ''
      };
    }
    const hi = holeCursor;
    holeCursor += 1;
    const s = scores[hi];
    if (!isFilledScore(s)) {
      return {
        colIdx: idx, label, par, isSpecial: false, isTot: false,
        score: '', mainStr: '', putts: '', diff: 0, diffStr: '', diffClass: 'diff-even', scoreClass: ''
      };
    }
    const p = putts[hi] || 1;
    const diff = s - par;
    if (hi < 9) { outSum += s; outPutts += p; outDiff += diff; outFilled += 1; }
    else { inSum += s; inPutts += p; inDiff += diff; inFilled += 1; }
    return {
      colIdx: idx, label, par, isSpecial: false, isTot: false,
      score: s,
      mainStr: formatMainScore(s, par, displayMode),
      putts: p,
      diff,
      diffStr: displayMode === 'diff' ? '' : formatCellDiff(diff),
      diffClass: diff < 0 ? 'diff-under' : diff > 0 ? 'diff-over' : 'diff-even',
      scoreClass: bestScoreClass(diff)
    };
  });
  const relScore = outDiff + inDiff;
  const totalFilled = outFilled + inFilled;
  return {
    columns,
    teamDiffStr: totalFilled > 0 ? formatDiff(relScore) : '',
    teamDiffClass: relScore < 0 ? 'diff-under' : relScore > 0 ? 'diff-over' : 'diff-even'
  };
}

function buildColumns() {
  return columnLabels().map((label, idx) => ({
    colIdx: idx,
    label,
    par: columnPars()[idx],
    isSpecial: SPECIAL_IDX.includes(idx),
    isOut: idx === 9,
    isIn: idx === 19,
    isTot: idx === 20
  }));
}

/** G5 比洞展示列：18 洞 + FINAL（无 OUT/IN/TOT）；仅展示层，不改 holeLayout */
const G5_FINAL_COL_IDX = 18;

function g5HoleColumnLabels() {
  const full = columnLabels();
  const out = [];
  for (let i = 0; i < full.length; i++) {
    if (!SPECIAL_IDX.includes(i)) out.push(full[i]);
  }
  return out;
}

/** Phase1-D：规范化比洞起始洞（1–18）；无效则默认 1 */
function normalizeMatchPlayStartHole(startHole) {
  const n = Number(startHole);
  if (!Number.isFinite(n)) return 1;
  const h = Math.floor(n);
  return h >= 1 && h <= 18 ? h : 1;
}

/** Phase1-D：从 startHole 生成 18 洞累计顺序（例：5→5..18,1..4）；不改 scores[] 存储顺序 */
function buildMatchPlayHoleOrder(startHole) {
  const startIdx = normalizeMatchPlayStartHole(startHole) - 1;
  const order = [];
  for (let i = 0; i < 18; i++) order.push((startIdx + i) % 18);
  return order;
}

function readMatchPlayMeta(match, groupId) {
  const gid = String(groupId || '').trim();
  if (!match || !gid) return null;
  const bucket =
    match.scoreData && match.scoreData[gid] && typeof match.scoreData[gid] === 'object'
      ? match.scoreData[gid]
      : null;
  if (typeof teamMatchStore.normalizeMatchPlayMeta === 'function') {
    return teamMatchStore.normalizeMatchPlayMeta(bucket && bucket.matchPlayMeta);
  }
  const meta = bucket && bucket.matchPlayMeta;
  if (!meta || typeof meta !== 'object') return null;
  const sh = Number(meta.startHole);
  if (!Number.isFinite(sh) || sh < 1 || sh > 18) return null;
  return {
    startHole: Math.floor(sh),
    source: meta.source === 'manual' ? 'manual' : 'auto'
  };
}

/**
 * 双方同洞均有有效成绩 → 自动起始洞。
 * 已有 meta（含 source:'manual' / 'auto'）一律不覆盖；manual 优先级最高。
 */
function inferAutoMatchPlayMeta(scoresA, scoresB, existingMeta) {
  const locked =
    typeof teamMatchStore.normalizeMatchPlayMeta === 'function'
      ? teamMatchStore.normalizeMatchPlayMeta(existingMeta)
      : null;
  if (locked) return locked;
  const a = Array.isArray(scoresA) ? scoresA : [];
  const b = Array.isArray(scoresB) ? scoresB : [];
  for (let hi = 0; hi < 18; hi++) {
    if (!isFilledScore(a[hi]) || !isFilledScore(b[hi])) continue;
    const sa = Number(a[hi]);
    const sb = Number(b[hi]);
    if (!Number.isFinite(sa) || !Number.isFinite(sb)) continue;
    return { startHole: hi + 1, source: 'auto' };
  }
  return null;
}

function buildG5Columns(startHole) {
  const full = buildColumns();
  const startIdx =
    startHole != null && startHole !== ''
      ? normalizeMatchPlayStartHole(startHole) - 1
      : -1;
  const markStart = startHole != null && startHole !== '' && startIdx >= 0;
  const next = [];
  let holeCol = 0;
  full.forEach((col) => {
    if (col && col.isSpecial) {
      if (col.isTot) {
        next.push(
          Object.assign({}, col, {
            colIdx: G5_FINAL_COL_IDX,
            label: 'FINAL',
            isOut: false,
            isIn: false,
            isTot: true,
            isFinal: true,
            isStartHole: false
          })
        );
      }
      return;
    }
    next.push(
      Object.assign({}, col, {
        colIdx: holeCol,
        isStartHole: markStart && holeCol === startIdx
      })
    );
    holeCol += 1;
  });
  return next;
}

function resolveHoleIndexFromColIdx(cIdx, isG5MatchPlay) {
  const n = Number(cIdx);
  if (!Number.isFinite(n)) return -1;
  if (isG5MatchPlay) {
    if (n < 0 || n >= 18) return -1;
    return n;
  }
  if (SPECIAL_IDX.includes(n)) return -1;
  if (n < 9) return n;
  if (n > 9 && n < 19) return n - 1;
  return -1;
}

// 成绩格是否已填（空洞保持空白，不计入任何汇总）
function isFilledScore(s) {
  return s !== null && s !== undefined && s !== '';
}

/** G5 个人比洞：仅识别，不改变 individual_stroke / 不进 stroke_entity */
function isG5PersonalMatchPlayMode(gameMode) {
  return isG5MatchPlayMode(gameMode);
}

/** G6/G7/G8 组合比洞：识别用（不改 G5 识别函数） */
function isG678SideMatchPlayMode(gameMode) {
  const mode = String(gameMode || '').trim();
  return isG6G7MatchPlayMode(mode) || isG8MatchPlayMode(mode);
}

/**
 * G5–G8 比洞看板：individual_stroke + 18/FINAL + match-status-row
 * Phase1-A：G6/G7/G8 复用 G5 看板壳；G5 专用识别仍走 isG5PersonalMatchPlayMode
 */
function isMatchPlayBoardMode(gameMode) {
  return isG5PersonalMatchPlayMode(gameMode) || isG678SideMatchPlayMode(gameMode);
}

/** G5–G8 比洞赛：成绩格不展示红蓝角标（胜负由 match-status-row 表达） */
function isMatchPlayScoreMode(gameMode) {
  const mode = String(gameMode || '').trim();
  return isG5MatchPlayMode(mode) || isG6G7MatchPlayMode(mode) || isG8MatchPlayMode(mode);
}

function resolveG5PlayerId(player) {
  if (!player) return '';
  const id = player.playerId != null ? player.playerId : player.id;
  return id != null ? String(id).trim() : '';
}

function resolveG5RegisterTeamId(user) {
  if (!user || typeof user !== 'object') return '';
  if (user.matchTeamId != null && String(user.matchTeamId).trim() !== '') {
    return String(user.matchTeamId).trim();
  }
  if (user.groupId != null && String(user.groupId).trim() !== '') {
    return String(user.groupId).trim();
  }
  return '';
}

/**
 * MatchPlaySide 成员（仅展示：头像/姓名；不参与胜洞比较）
 * @returns {{ playerId: string, name: string, avatar: string, scorePlayerId: string, tPosition: string, gender: string }}
 */
function buildMatchPlaySideMember(player) {
  const playerId = resolveG5PlayerId(player);
  const scorePlayerId =
    player && (player.scorePlayerId || player.slotScorePlayerId || player.scoreOwnerId)
      ? String(player.scorePlayerId || player.slotScorePlayerId || player.scoreOwnerId).trim()
      : '';
  const tPosition = player && isEditTeeKey(player.tPosition) ? player.tPosition : '';
  return {
    playerId: playerId,
    name: (player && player.name) || '',
    avatar: (player && player.avatar) || '',
    scorePlayerId: scorePlayerId || playerId,
    tPosition: tPosition,
    gender: resolveScoreDisplayGender(player, playerId)
  };
}

/** 读取 scoreData[groupId].scoresBySide（无则 {}） */
function readMatchScoresBySide(match, groupId) {
  const gid = groupId != null ? String(groupId).trim() : '';
  if (!match || !gid) return {};
  const scoreData =
    match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : null;
  const groupScore = scoreData && scoreData[gid] && typeof scoreData[gid] === 'object' ? scoreData[gid] : null;
  const bucket =
    typeof teamMatchStore.normalizeGroupScoreBucket === 'function'
      ? teamMatchStore.normalizeGroupScoreBucket(groupScore)
      : { scoresBySide: {} };
  return bucket.scoresBySide && typeof bucket.scoresBySide === 'object' ? bucket.scoresBySide : {};
}

/**
 * 构造统一比洞 Side
 * - scoreSource='member'（G5）：scores 取首成员个人成绩（来自运行时/scoresByPlayer）
 * - scoreSource='combo'（G6/G7/G8）：scores 仅来自 scoresBySide；无则 []；禁止读成员个人分
 */
function createMatchPlaySide(sideKey, teamId, memberPlayers, scoreSource, sideScoreRecord) {
  const key = sideKey === 'B' ? 'B' : 'A';
  const tid = teamId != null ? String(teamId).trim() : '';
  const sideId = tid || key;
  const players = (Array.isArray(memberPlayers) ? memberPlayers : []).filter((p) => resolveG5PlayerId(p));
  const members = players.map(buildMatchPlaySideMember).filter((m) => m.playerId);
  let scores = [];
  let putts = [];
  let fairways = [];
  let penalties = [];
  let sands = [];
  if (scoreSource === 'member' && players[0]) {
    scores = Array.isArray(players[0].scores) ? players[0].scores.slice() : [];
  } else if (scoreSource === 'combo') {
    const rec =
      typeof teamMatchStore.normalizeSideScoreRecord === 'function'
        ? teamMatchStore.normalizeSideScoreRecord(sideId, key, sideScoreRecord || null)
        : null;
    if (rec) {
      scores = Array.isArray(rec.scores) ? rec.scores.slice() : [];
      putts = Array.isArray(rec.putts) ? rec.putts.slice() : [];
      fairways = Array.isArray(rec.fairways) ? rec.fairways.slice() : [];
      penalties = Array.isArray(rec.penalties) ? rec.penalties.slice() : [];
      sands = Array.isArray(rec.sands) ? rec.sands.slice() : [];
    }
  }
  return {
    sideId: sideId,
    sideKey: key,
    teamId: tid,
    members: members,
    scores: scores,
    putts: putts,
    fairways: fairways,
    penalties: penalties,
    sands: sands,
    scoreSource: scoreSource === 'combo' ? 'combo' : 'member',
    _players: players.slice()
  };
}

/**
 * Phase1-B/C1：统一解析比赛双方 Side
 * options.forceG5 / G5：成员成绩（运行时 scores，源自 scoresByPlayer）
 * G6/G7/G8：scoresBySide[sideId]；无则空数组；禁止读第一成员个人分
 * options.groupId：读取 scoreData[groupId].scoresBySide
 */
function resolveMatchPlaySides(playersSource, match, options) {
  const opts = options || {};
  const list = (Array.isArray(playersSource) ? playersSource : []).filter((p) => resolveG5PlayerId(p));
  if (list.length < 2) return null;

  const gameMode = String(
    opts.gameMode != null
      ? opts.gameMode
      : (match && (match.gameMode || match.selectedGameMode)) || ''
  ).trim();
  const forceG5 = !!opts.forceG5 || isG5PersonalMatchPlayMode(gameMode) || !isG678SideMatchPlayMode(gameMode);
  const maxMembers = forceG5 ? 1 : 2;
  const scoreSource = forceG5 ? 'member' : 'combo';
  const groupId = opts.groupId != null ? String(opts.groupId).trim() : '';
  const scoresBySide = scoreSource === 'combo' ? readMatchScoresBySide(match, groupId) : {};

  const users =
    match && match.registerInfo && Array.isArray(match.registerInfo.users)
      ? match.registerInfo.users
      : [];
  const teamIdByUser = {};
  users.forEach((user) => {
    const uid =
      user && (user.userId != null || user.playerId != null || user.id != null)
        ? String(user.userId || user.playerId || user.id).trim()
        : '';
    if (!uid) return;
    const tid = resolveG5RegisterTeamId(user);
    if (tid) teamIdByUser[uid] = tid;
  });

  const teamOrder = [];
  const seen = {};
  (match && Array.isArray(match.teamGroups) ? match.teamGroups : []).forEach((tg) => {
    const id = tg && tg.id != null ? String(tg.id).trim() : '';
    if (!id || seen[id]) return;
    seen[id] = true;
    teamOrder.push(id);
  });

  const sideRecord = (sideId, sideKey) => {
    if (scoreSource !== 'combo') return null;
    const id = sideId != null ? String(sideId).trim() : '';
    if (id && scoresBySide[id]) return scoresBySide[id];
    if (sideKey && scoresBySide[sideKey]) return scoresBySide[sideKey];
    return null;
  };

  if (teamOrder.length >= 2) {
    const membersByTeam = {};
    teamOrder.forEach((tid) => {
      membersByTeam[tid] = [];
    });
    list.forEach((p) => {
      const tid = teamIdByUser[resolveG5PlayerId(p)] || '';
      if (!tid || !membersByTeam[tid]) return;
      if (membersByTeam[tid].length >= maxMembers) return;
      membersByTeam[tid].push(p);
    });
    const playersA = membersByTeam[teamOrder[0]] || [];
    const playersB = membersByTeam[teamOrder[1]] || [];
    if (
      playersA.length > 0 &&
      playersB.length > 0 &&
      resolveG5PlayerId(playersA[0]) !== resolveG5PlayerId(playersB[0])
    ) {
      return {
        sideA: createMatchPlaySide(
          'A',
          teamOrder[0],
          playersA,
          scoreSource,
          sideRecord(teamOrder[0], 'A')
        ),
        sideB: createMatchPlaySide(
          'B',
          teamOrder[1],
          playersB,
          scoreSource,
          sideRecord(teamOrder[1], 'B')
        )
      };
    }
  }

  // 回退：源列表前两人各成一侧（与原 G5 回退一致）
  return {
    sideA: createMatchPlaySide('A', '', [list[0]], scoreSource, sideRecord('A', 'A')),
    sideB: createMatchPlaySide('B', '', [list[1]], scoreSource, sideRecord('B', 'B'))
  };
}

/**
 * G5 兼容适配：仍返回 { playerA, playerB }（源球员对象），供排序/旧调用
 * @returns {{ playerA: object, playerB: object }|null}
 */
function resolveG5MatchPlaySides(playersSource, match) {
  const sides = resolveMatchPlaySides(playersSource, match, { forceG5: true });
  if (!sides) return null;
  const playerA = sides.sideA && sides.sideA._players && sides.sideA._players[0];
  const playerB = sides.sideB && sides.sideB._players && sides.sideB._players[0];
  if (!playerA || !playerB) return null;
  return { playerA: playerA, playerB: playerB };
}

/** 展示层文案：红方 nUP / 蓝方 nDN / 平局 TIED（不改胜负计算） */
function formatG5MatchPlayStanding(leader, up) {
  const n = Number(up) || 0;
  if (leader === 'A') return n > 0 ? n + 'UP' : 'TIED';
  if (leader === 'B') return n > 0 ? n + 'DN' : 'TIED';
  return 'TIED';
}

/** 原型 lead 色：仅展示映射，不改胜负计算 */
function resolveG5LeadClass(leader) {
  if (leader === 'A') return 'team-a-lead';
  if (leader === 'B') return 'team-b-lead';
  return 'all-square';
}

function emptyMatchStatusView() {
  return {
    cells: [],
    rowCells: [],
    currentLabel: '',
    currentLeadClass: '',
    leader: '',
    up: 0
  };
}

function sideHasFilledScore(side) {
  const scores = Array.isArray(side && side.scores) ? side.scores : [];
  for (let i = 0; i < scores.length; i++) {
    if (isFilledScore(scores[i])) return true;
  }
  return false;
}

/**
 * Phase1-B/D：由两侧 Side.scores[] 派生比洞状态（不写盘）
 * 比较对象永远是 Side，不是球员。
 * combo 且双方均无有效成绩 → 空状态（不伪造 TIED·nUP·洞胜）
 * G5 member 路径保持原逻辑（含未开打时 FINAL TIED）
 * startHole：胜洞累计顺序起点（1–18）；scores[] 仍按洞号索引存储不变
 * result: A_WIN | B_WIN | AS | null（缺分不判定）
 */
function buildMatchStatusView(sideA, sideB, startHole) {
  const empty = emptyMatchStatusView();
  if (!sideA || !sideB) return empty;

  const comboMode =
    (sideA.scoreSource === 'combo' || sideB.scoreSource === 'combo');
  if (comboMode && !sideHasFilledScore(sideA) && !sideHasFilledScore(sideB)) {
    return empty;
  }

  const scoresA = Array.isArray(sideA.scores) ? sideA.scores : [];
  const scoresB = Array.isArray(sideB.scores) ? sideB.scores : [];
  const resolvedStart = normalizeMatchPlayStartHole(startHole);
  const holeOrder = buildMatchPlayHoleOrder(resolvedStart);
  let aWins = 0;
  let bWins = 0;
  const cells = new Array(18);

  for (let oi = 0; oi < holeOrder.length; oi++) {
    const hi = holeOrder[oi];
    const rawA = scoresA[hi];
    const rawB = scoresB[hi];
    let result = null;
    if (isFilledScore(rawA) && isFilledScore(rawB)) {
      const sa = Number(rawA);
      const sb = Number(rawB);
      if (Number.isFinite(sa) && Number.isFinite(sb)) {
        if (sa < sb) {
          result = 'A_WIN';
          aWins += 1;
        } else if (sb < sa) {
          result = 'B_WIN';
          bWins += 1;
        } else {
          result = 'AS';
        }
      }
    }
    const diff = aWins - bWins;
    let leader = 'AS';
    let up = 0;
    if (diff > 0) {
      leader = 'A';
      up = diff;
    } else if (diff < 0) {
      leader = 'B';
      up = -diff;
    }
    cells[hi] = {
      holeIndex: hi,
      result: result,
      leader: leader,
      up: up,
      standingLabel: formatG5MatchPlayStanding(leader, up),
      isStartHole: hi === resolvedStart - 1
    };
  }

  // TOTAL/FINAL：按首次「领先 > 剩余」冻结 Match Play Result（可继续记满 18 洞）
  const resultSummary = buildMatchPlayResultSummary(scoresA, scoresB, resolvedStart);
  const currentLeader = resultSummary.leader;
  const currentUp = resultSummary.up;
  const currentLabel = resultSummary.label;

  const currentLeadClass = resolveG5LeadClass(currentLeader);
  const holeLabels = g5HoleColumnLabels();
  const rowCells = [];
  for (let hi = 0; hi < 18; hi++) {
    const holeCell = cells[hi] || null;
    const result = holeCell ? holeCell.result : null;
    const hasResult = result != null;
    const holeLeader = holeCell ? holeCell.leader : 'AS';
    rowCells.push({
      colIdx: hi,
      label: holeLabels[hi] || String(hi + 1),
      isSpecial: false,
      isTot: false,
      isStartHole: hi === resolvedStart - 1,
      showFinal: false,
      result: result,
      showWinA: result === 'A_WIN',
      showWinB: result === 'B_WIN',
      showStanding: hasResult,
      standingText: hasResult && holeCell ? (holeCell.standingLabel || '') : '',
      leadClass: hasResult ? resolveG5LeadClass(holeLeader) : '',
      text: ''
    });
  }
  rowCells.push({
    colIdx: G5_FINAL_COL_IDX,
    label: 'FINAL',
    isSpecial: true,
    isTot: true,
    isStartHole: false,
    showFinal: true,
    result: null,
    showWinA: false,
    showWinB: false,
    showStanding: false,
    standingText: '',
    leadClass: currentLeadClass,
    text: currentLabel
  });

  const memberA = sideA.members && sideA.members[0];
  const memberB = sideB.members && sideB.members[0];
  return {
    cells: cells,
    rowCells: rowCells,
    currentLabel: currentLabel,
    currentLeadClass: currentLeadClass,
    leader: currentLeader,
    up: currentUp,
    aWins: aWins,
    bWins: bWins,
    startHole: resolvedStart,
    sideAId: sideA.sideId || '',
    sideBId: sideB.sideId || '',
    playerAId: memberA ? memberA.playerId : '',
    playerBId: memberB ? memberB.playerId : '',
    resultSummary: resultSummary
  };
}

/**
 * G5 兼容入口：forceG5 Side → buildMatchStatusView（页面仍调用本函数，结果与重构前一致）
 */
function buildG5MatchStatusView(playersSource, match) {
  const empty = {
    cells: [],
    rowCells: [],
    currentLabel: 'TIED',
    currentLeadClass: 'all-square',
    leader: 'AS',
    up: 0
  };
  const sides = resolveMatchPlaySides(playersSource, match, { forceG5: true });
  if (!sides) return empty;
  return buildMatchStatusView(sides.sideA, sides.sideB);
}

/** 比洞 Side pair 头像（只复用视觉字段，不读 entity / pairings） */
function buildMatchPlayPairMembers(members) {
  const PAIR_LEFT = ['24rpx', '128rpx'];
  const list = (Array.isArray(members) ? members : []).slice(0, 2);
  return list.map((m, mi) => {
    const style = resolveScoreTeeStyle(m, mi);
    const playerId = m && m.playerId ? String(m.playerId) : '';
    const name = (m && m.name) || '球员';
    return {
      name: name,
      avatar: mockAvatars.resolveAvatar(m && m.avatar, playerId || name),
      teeColor: style.teeColor,
      left: PAIR_LEFT[mi] || 24 + mi * 104 + 'rpx',
      tf: mi === 1 ? 'translateX(var(--pair-second-shift, 0rpx))' : 'none'
    };
  });
}

/**
 * 将 MatchPlaySide 转为记分行展示（cells 仅来自 side.scores）
 */
function enrichMatchPlaySide(side, sIdx, displayMode) {
  const members = Array.isArray(side && side.members) ? side.members : [];
  const scoreSource = side && side.scoreSource === 'combo' ? 'combo' : 'member';
  const kind = scoreSource === 'combo' ? 'pair' : 'single';
  const primary = (side && Array.isArray(side._players) && side._players[0]) || null;
  const scores = Array.isArray(side && side.scores) ? side.scores.slice() : [];
  const pseudo = {
    id: (side && side.sideId) || String(sIdx),
    playerId: (side && side.sideId) || String(sIdx),
    name: (members[0] && members[0].name) || '',
    avatar: (members[0] && members[0].avatar) || '',
    colorClass: 'border-white',
    scores: scores,
    putts: primary && Array.isArray(primary.putts) ? primary.putts.slice() : [],
    fairways: primary ? sliceFairways(primary.fairways) : [],
    penalties: primary ? slicePenalties(primary.penalties) : [],
    sands: primary ? sliceSands(primary.sands) : []
  };
  // combo：仅用 Side 成绩（scoresBySide）；禁止成员个人 putts/杆数冒充组合
  if (scoreSource === 'combo') {
    pseudo.putts = Array.isArray(side.putts) ? side.putts.slice() : [];
    pseudo.fairways = Array.isArray(side.fairways) ? side.fairways.slice() : [];
    pseudo.penalties = Array.isArray(side.penalties) ? side.penalties.slice() : [];
    pseudo.sands = Array.isArray(side.sands) ? side.sands.slice() : [];
  }
  // 杆差属 Side：G5/G678 均由 side.scores → enrichPlayerG5（gross-par）派生，不区分 member/combo
  const enriched = enrichPlayerG5(pseudo, sIdx, displayMode);
  const m0 = members[0] || null;
  const teeStyle = resolveScoreTeeStyle(primary || m0, sIdx);
  const relScoreStr = enriched.relScoreStr || '';
  const relClass = enriched.relClass || '';
  return {
    id: (side && side.sideId) || side.sideKey || String(sIdx),
    sideId: (side && side.sideId) || '',
    sideKey: (side && side.sideKey) || (sIdx === 1 ? 'B' : 'A'),
    kind: kind,
    members: members,
    pairMembers: kind === 'pair' ? buildMatchPlayPairMembers(members) : [],
    scores: scores,
    cells: enriched.cells || [],
    name: m0 ? m0.name || '球员' : '',
    avatar: mockAvatars.resolveAvatar(m0 && m0.avatar, (m0 && m0.playerId) || ''),
    colorClass: kind === 'single' ? teeStyle.colorClass : 'border-white',
    relScoreStr: relScoreStr,
    relClass: relClass,
    teamDiffStr: relScoreStr,
    teamDiffClass: relClass,
    scoreEditable: scoreSource === 'member',
    memberPlayerId: m0 && m0.playerId ? String(m0.playerId) : '',
    scoreSource: scoreSource
  };
}

/**
 * Phase1-B/C1：生成比洞双方展示行（固定 0–2 项）
 * G5：成员成绩；G6/G7/G8：scoresBySide（无则空）
 */
function buildMatchSidesView(playersSource, match, gameMode, displayMode, groupId) {
  const mode = String(gameMode || '').trim();
  const isG5 = isG5PersonalMatchPlayMode(mode);
  const sides = resolveMatchPlaySides(
    playersSource,
    match,
    isG5
      ? { forceG5: true, groupId: groupId }
      : { gameMode: mode, groupId: groupId }
  );
  if (!sides) return [];
  return [
    enrichMatchPlaySide(sides.sideA, 0, displayMode),
    enrichMatchPlaySide(sides.sideB, 1, displayMode)
  ];
}

/** G5：展示/点格顺序固定为 A（分队1）→ B（分队2），与胜洞行一致 */
function orderPlayersSourceForG5(playersSource, match) {
  const sides = resolveG5MatchPlaySides(playersSource, match);
  if (!sides) return playersSource;
  const aId = resolveG5PlayerId(sides.playerA);
  const bId = resolveG5PlayerId(sides.playerB);
  const rest = (Array.isArray(playersSource) ? playersSource : []).filter((p) => {
    const id = resolveG5PlayerId(p);
    return id && id !== aId && id !== bId;
  });
  return [sides.playerA, sides.playerB].concat(rest);
}

/** 开球方向：fairway | left | right；默认 fairway */
const FAIRWAY_FAIRWAY = 'fairway';
const FAIRWAY_LEFT = 'left';
const FAIRWAY_RIGHT = 'right';

function normalizeFairwayValue(v) {
  if (v === FAIRWAY_LEFT || v === FAIRWAY_RIGHT || v === FAIRWAY_FAIRWAY) return v;
  return FAIRWAY_FAIRWAY;
}

function resolveHoleFairway(fairways, holeIndex) {
  const arr = Array.isArray(fairways) ? fairways : [];
  return normalizeFairwayValue(arr[holeIndex]);
}

function sliceFairways(fairways) {
  return Array.isArray(fairways) ? fairways.slice() : [];
}

/** 罚杆：默认 0，最小 0 */
function normalizePenaltyValue(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** 打开洞回填：有值用该值（含 0），否则 0 */
function resolveHolePenalty(penalties, holeIndex) {
  const arr = Array.isArray(penalties) ? penalties : [];
  const raw = arr[holeIndex];
  if (raw === null || raw === undefined || raw === '') return 0;
  return normalizePenaltyValue(raw);
}

function slicePenalties(penalties) {
  return Array.isArray(penalties) ? penalties.slice() : [];
}

/** 沙坑：默认 0，最小 0 */
function normalizeSandValue(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** 打开洞回填：有值用该值（含 0），否则 0 → panelBunker */
function resolveHoleSand(sands, holeIndex) {
  const arr = Array.isArray(sands) ? sands : [];
  const raw = arr[holeIndex];
  if (raw === null || raw === undefined || raw === '') return 0;
  return normalizeSandValue(raw);
}

function sliceSands(sands) {
  return Array.isArray(sands) ? sands.slice() : [];
}

function enrichPlayer(player, pIdx, displayMode, options) {
  const hideCorners = !!(options && options.hideCorners);
  const scores = player.scores || [];
  const putts = player.putts || [];

  // 全部由本地 state 派生：只统计已填洞
  let outSum = 0;
  let inSum = 0;
  let outPutts = 0;
  let inPutts = 0;
  let outDiff = 0;
  let inDiff = 0;
  let outFilled = 0;
  let inFilled = 0;
  let scoreIdx = 0;

  // scores[hi] 绑定记分格索引 hi（0-17），半场变更只改 label/par，禁止按旧洞号搬迁成绩
  const cells = columnLabels().map((label, colIdx) => {
    const par = columnPars()[colIdx];
    if (SPECIAL_IDX.includes(colIdx)) {
      const isOut = colIdx === 9;
      const isIn = colIdx === 19;
      const sum = isOut ? outSum : isIn ? inSum : outSum + inSum;
      const puttTotal = isOut ? outPutts : isIn ? inPutts : outPutts + inPutts;
      const diffTotal = isOut ? outDiff : isIn ? inDiff : outDiff + inDiff;
      const filled = isOut ? outFilled : isIn ? inFilled : outFilled + inFilled;
      return {
        type: 'special',
        colIdx,
        label,
        par,
        val: filled > 0 ? sum : '',
        puttTotal: filled > 0 ? puttTotal : '',
        diffTotal,
        diffStr: filled > 0 ? formatDiff(diffTotal) : '',
        isTot: colIdx === 20,
        diffClass: diffTotal < 0 ? 'diff-under' : diffTotal > 0 ? 'diff-over' : 'diff-even'
      };
    }

    const hi = scoreIdx;
    scoreIdx += 1;
    const s = scores[hi];

    // 空洞：保持空白，不参与计算；displayHint 预留显示该洞 T 台码数
    if (!isFilledScore(s)) {
      return {
        type: 'hole',
        colIdx,
        label,
        par,
        holeIndex: hi,
        score: '',
        mainStr: '',
        displayHint: resolveHoleTeeYardage(player, hi),
        putts: '',
        diff: 0,
        diffStr: '',
        scoreClass: '',
        triangleClass:
          hideCorners || !COLUMN_TRIANGLES[colIdx] ? '' : COLUMN_TRIANGLES[colIdx][pIdx] || '',
        gameCornerRank: hideCorners ? null : cornerRank(COLUMN_TRIANGLES[colIdx], pIdx),
        diffClass: 'diff-even'
      };
    }

    const p = putts[hi] || 1;
    const diff = s - par;
    if (hi < 9) {
      outSum += s;
      outPutts += p;
      outDiff += diff;
      outFilled += 1;
    } else {
      inSum += s;
      inPutts += p;
      inDiff += diff;
      inFilled += 1;
    }

    return {
      type: 'hole',
      colIdx,
      label,
      par,
      holeIndex: hi,
      score: s,
      // 主数字显示：gross→实际杆数；diff→带符号本洞杆差（仅 UI 展示，不改底层数据）
      mainStr: formatMainScore(s, par, displayMode),
      displayHint: '',
      putts: p,
      diff,
      // 右下角杆差：杆差模式下隐藏（主数字已是杆差，避免重复）；平杆统一 0
      diffStr: displayMode === 'diff' ? '' : formatCellDiff(diff),
      scoreClass: scoreStyle(diff),
      triangleClass:
        hideCorners || !COLUMN_TRIANGLES[colIdx] ? '' : COLUMN_TRIANGLES[colIdx][pIdx] || '',
      gameCornerRank: hideCorners ? null : cornerRank(COLUMN_TRIANGLES[colIdx], pIdx),
      diffClass: diff < 0 ? 'diff-under' : diff > 0 ? 'diff-over' : 'diff-even'
    };
  });

  const totalFilled = outFilled + inFilled;
  const relScore = outDiff + inDiff;

  return Object.assign({}, player, {
    avatar: mockAvatars.resolveAvatar(player.avatar, player.playerId || player.id || player.name),
    relScoreStr: totalFilled > 0 ? formatDiff(relScore) : '-',
    relScore,
    relClass: relScore < 0 ? 'diff-under' : relScore === 0 ? 'diff-even' : '',
    cells
  });
}

/** G5：从标准 enrich 结果去掉 OUT/IN，TOT→FINAL，colIdx 重排为 0..18 */
function enrichPlayerG5(player, pIdx, displayMode) {
  const enriched = enrichPlayer(player, pIdx, displayMode, { hideCorners: true });
  const src = Array.isArray(enriched.cells) ? enriched.cells : [];
  const next = [];
  let holeCol = 0;
  src.forEach((cell) => {
    if (!cell) return;
    if (cell.type === 'special') {
      if (cell.isTot) {
        next.push(
          Object.assign({}, cell, {
            colIdx: G5_FINAL_COL_IDX,
            label: 'FINAL',
            isFinal: true
          })
        );
      }
      return;
    }
    next.push(Object.assign({}, cell, { colIdx: holeCol }));
    holeCol += 1;
  });
  return Object.assign({}, enriched, { cells: next });
}

Page({
  data: {
    headerTotalHeight: 92,
    headerPaddingTop: 52,
    headerPaddingRight: 96,
    headerContentHeight: 32,
    headerRootStyle: 'min-height:92px;height:92px;background-color:#002D62;border-bottom:2px solid var(--champion-gold);box-sizing:border-box;flex-shrink:0;',
    headerBarStyle: 'padding-top:52px;padding-right:96px;padding-bottom:16px;padding-left:16px;min-height:92px;box-sizing:border-box;display:flex;align-items:center;',

    themeClass: 'bright-mode',
    fontScale: 'normal',
    fontScaleClass: 'font-normal',
    activeTab: 'score',
    // 记分格主数字显示方式：'gross'=总杆 | 'diff'=本洞杆差（仅 UI 展示）
    scoreDisplayMode: 'gross',
    // 模式分流（仅记录元信息，不改动原有记分结构/逻辑）
    // mode / formatType 唯一来源为 matchState；禁止在此写死默认赛制
    mode: '',
    formatType: '',
    noMatch: false,
    scoringMode: 'stroke',
    layoutType: 'standard',
    playerCount: 4,
    groupId: '',
    // 四人最佳球位模式数据（仅 fourball_best 分支使用）
    bestRoster: [],
    bestColumns: [],
    bestTeamDiffStr: '',
    bestTeamDiffClass: 'diff-even',
    // 统一记分引擎按组渲染的记分行（每组一行）：多人组=球队样式，单人组=个人比杆样式
    bestTeams: [],
    // 记分表第一列标题（赛制驱动，禁止写死在 WXML）：best_score→最好成绩 / best_ball(_4_0)→最佳球位
    bestLabel: '最佳球位',
    // 是否来自真实比赛（matchState）：true→球员/成绩继承创建页且初始为空；false→首页演示原型
    bestHasMatch: false,
    scoreboardStyle:
      '--player-col-width:240rpx;--player-col-padding-x:24rpx;--player-diff-opacity:1;--player-name-width:192rpx;--bb-diff-col-w:96rpx;--bestball-label-size:30rpx;',
    /** G1 基础模型：player-column / score-track 纵滑同步 */
    identityPanelScrollTop: 0,
    scoreTrackScrollTop: 0,
    gameInfoOpen: false,
    gameInfoTop: 0,
    gameInfoMaxH: 600,
    gameGroupIndex: 0,
    gameFinished: false,
    scoresCompleted: false,
    /** 整场 match.status=finished（或本组已结束）时底部「添加/删除」冻结 */
    addDeleteDisabled: false,
    /** 记分面板只读：可进入查看，禁止改成绩 */
    isReadOnlyScore: false,
    showMoreSheet: false,
    showStyleSheet: false,
    halfSheetVisible: false,
    /** 球童记分 Sheet（本阶段仅 UI 打通，不读 store / 不生成码） */
    caddieSheetVisible: false,
    caddieSheetHasQr: false,
    caddieSheetQrUrl: '',
    caddieSheetGenerating: false,
    caddieSheetScorers: [],
    /** 修改T台弹层（第一阶段：仅 UI / 本地态，不写盘） */
    editTeeSheetVisible: false,
    editTeePlayers: [],
    /** G5–G8：修改起始洞弹层（hole=真实洞号 1–18；label=A1–B9 仅展示） */
    startHoleSheetVisible: false,
    startHoleDraft: 1,
    startHoleOptions: (function buildStartHoleOptions() {
      const list = [];
      for (let h = 1; h <= 18; h++) {
        list.push({
          hole: h,
          label: h <= 9 ? 'A' + h : 'B' + (h - 9)
        });
      }
      return list;
    })(),
    showScoreSheet: false,
    showGroupManage: false,
    scoreSheetOpen: false,
    scorePanelMode: 'tech',

    match: {
      course: 'Pinehurst No. 2',
      name: 'Tour Elite Series',
      format: '个人比杆赛',
      weather: '晴 · 22°C · 微风',
      teeTime: '08:30 AM'
    },

    // 信息继承型展开面板（Context Panel）：全部继承自 createGame，只读
    gameContext: {
      ready: false,
      // 轻量 Context Panel：单列 label + value，纯文本，数据全部继承自 createGame
      courseFull: '',  // 球场（含半场，单行展示）
      title: '',       // 比赛名称
      format: '',      // 赛制
      teeTime: '',     // 开球时间（原样展示，不拆分）
      weather: { loading: false, line: '' }, // 天气（第三方实时，单行纯文本）
      isPrivate: false, // 是否私密比赛（visibility === 'private'）
      accessCode: ''   // 围观密码（仅私密时展示，复用 createGame.accessCode）
    },

    columns: buildColumns(),
    playersView: [],
    entitiesView: [],
    /**
     * M2 Render Model（A1：仅 Adapter 产出，WXML 未接入）
     * { headerRows, scoreRows }
     */
    m2Scoreboard: { headerRows: [], scoreRows: [] },
    /** G5–G8 比洞：双方 Side 展示行（成绩主体，非 playersView） */
    matchSidesView: [],
    /** G5–G8 比洞看板开关（mode 仍为 individual_stroke；Phase1-A 复用此位给 G6/G7/G8） */
    isG5MatchPlay: false,
    /** 普通创建 + 单组 + 个人比杆：成绩槽位上下文（preferScoresBySlot）；勿当 UI shell 开关 */
    isSingleGroupGame: false,
    /** 普通创建 + 个人比杆：新版 shell UI（兼容保留；统一开关见 useStrokeScoreShell） */
    useGameStrokeShell: false,
    /** 个人比杆 UI Shell：普通创建个人比杆 + 球队赛 G1；不含 G5–G8 / 其它 individual_stroke */
    useStrokeScoreShell: false,
    /** 比洞 UI Shell：G5–G8（与 useStrokeScoreShell 独立） */
    useMatchPlayScoreShell: false,
    /** G6/G7/G8：matchSidesView 含 pair 时，身份列复用 fourball 2+2 折叠布局 */
    isMatchPlayPairLayout: false,
    /** G6/G7 pair：identity 折叠进度 0~1（对齐 fourballIdentityCollapseProgress） */
    matchPlayIdentityCollapseProgress: 0,
    /** G6/G7 pair：阶段1 track 补偿（对齐 fourballTrackInnerStyle / Phase6.1） */
    matchPlayTrackInnerStyle: 'transform: translateX(0px);',
    /** fourball UI Shell v2：fourball_best + pair 布局（全组≤2 且含双人）；单人行展示居中退化 */
    useFourballScoreShell: false,
    /** fourball shell v2 行数据适配层（由 bestTeams 派生） */
    fourballRowsView: [],
    /** fourball shell track 横滑位置（Phase4：只记录，不驱动 identity） */
    fourballScrollLeft: 0,
    /** fourball shell identity 折叠进度 0~1（Phase5.1：仅状态，不驱动 UI） */
    fourballIdentityCollapseProgress: 0,
    /** fourball shell T sticky：Phase6.2 阈值 = phase1(72) + diff(96rpx→px) */
    fourballTeeStickyVisible: false,
    /** Phase6.1：阶段1 反向补偿，阻止 lead/score 侵入 identity（transform 字符串） */
    fourballTrackInnerStyle: 'transform: translateX(0px);',
    /** Phase7.4：HOLE/PAR 阶段2 横滑 offset（px，负值左移；阶段1 为 0） */
    fourballHoleParOffsetX: 0,
    /** 普通创建 fourball_best 纯 2+2：业务判定（每组恰好 2 人） */
    isFourballPair22: false,
    /** fourball pair 视觉布局：2+2 或 2+1（有 pair 且无 ≥3）；驱动 CSS class / 横滑 */
    isFourballPairLayout: false,
    /** fourball 4+0：存在 4 人 team 组；独立 flag，不复用 isFourballPair22 */
    isFourballTeamLayout: false,
    /**
     * 普通创建纯 4+0 / 3+0 / 3+1：HOLE 以上 = 示例球员卡片（3+0/3+1 第 4 槽空白）；
     * HOLE 以下 = 个人比杆 useStrokeScoreShell；3+1 另多一行单人成绩。
     */
    isFourball40StrokeShell: false,
    strokeShellFormatLabel: '',
    /** fourball pair 布局：identity 压缩完成后切换短昵称（不影响横滑宽度） */
    isFourballPair22NamesCompact: false,
    /** match-play：T sticky overlay 是否显示（独立于 isTeeStickyVisible / useStrokeScoreShell） */
    isMatchPlayTeeStickyVisible: false,
    /** match-play：HOLE/PAR normal overlay 横向 transform（独立于 holeParNormalStyle） */
    matchPlayHoleParNormalStyle: 'transform: translateX(0px);',
    /** game-single：T sticky overlay 是否显示（scrollLeft >= diff 宽） */
    isTeeStickyVisible: false,
    /** game-single：HOLE/PAR compact 预留（Phase1 不用于显隐切换） */
    isHoleParCompact: false,
    /** game-single：hole-par-normal-container 横向 transform（Phase1） */
    holeParNormalStyle: 'transform: translateX(0px);',
    /** G5–G8：比洞赛记分页（隐藏成绩格红蓝角标） */
    isMatchPlayScoreMode: false,
    /** G5–G8：由两侧成绩派生的比洞状态（不落库） */
    matchStatusView: {
      cells: [],
      rowCells: [],
      currentLabel: 'TIED',
      currentLeadClass: 'all-square',
      leader: 'AS',
      up: 0
    },
    moreMenuItems: MORE_MENU_ITEMS_COMPACT,
    groupPlayers: GROUP_PLAYERS,
    // 占位：真正展示前由 openGroupManagePage() 用当前记分页面球员快照覆盖（唯一数据源）
    groupSlots: [],
    // 空位补位：默认普通 Game 来源；Team Match 打开添加/删除时按上下文切换
    addSheetVisible: false,
    playerSourceOptions: NORMAL_GAME_PLAYER_SOURCE_OPTIONS,
    playerSourceListVisible: false,
    playerSourceListTitle: '',
    playerSourceListOverline: 'ADD PLAYER',
    playerSourceListEmptyText: '',
    playerSourceListItems: [],
    // 手工添加底部弹窗（不跳转 pages/player/manual）
    manualSheetVisible: false,
    manualName: '',
    manualPhone: '',
    manualGender: 'male',
    joinMatchTeamSheetVisible: false,
    joinMatchPlayerName: '',
    joinMatchTeamOptions: [],

    activePlayerIdx: 0,
    /** Stroke Entity 当前编辑主体索引（与 activePlayerIdx 并存，不替代） */
    activeEntityIndex: -1,
    /** G6/G7/G8 比洞：当前编辑 Side 索引（与 entity/player 索引并存，不替代） */
    activeSideIndex: -1,
    /** 技术面板清除草稿：无选中球员，全员成绩格为空（仅 UI） */
    scoreClearDraft: false,
    /** 快捷面板清除显示草稿：本洞头像旁成绩格全空（仅 UI，不改正式 scores） */
    quickScoreClearDraft: false,
    /** 快捷清除后点球员恢复的 PAR 草稿：显示层强制 draft，不改正式 scores */
    quickScoreFreshDraft: false,
    /** 本洞已点清除但未确认：显示层忽略正式 scores，遮罩关闭则丢弃 */
    scoreHoleClearPending: false,
    /** 技术面板控件区焦点切换动画（仅 UI） */
    techPanelFocusPulse: false,
    sheetHoleLabel: 'A1',
    sheetHoleIndex: 0,
    sheetPar: 4,
    sheetYards: 422,
    panelScore: 4,
    panelMainDisplay: '4',
    panelPutt: 2,
    panelPuttTouched: false,
    panelPenalty: 0,
    panelBunker: 0,
    /** 开球方向三选一：fairway | left | right */
    panelFairway: FAIRWAY_FAIRWAY,
    quickPanelScores: [4, 4, 4, 4],
    quickPanelDisplay: ['4', '4', '4', '4'],
    sheetPlayers: [],

    watchers: [
      { name: 'TigerHoods', avatar: mockAvatars.pickMockAvatar('TigerHoods') },
      { name: 'Alex', avatar: mockAvatars.pickMockAvatar('Alex') },
      { name: '大雷', avatar: mockAvatars.pickMockAvatar('大雷') },
      { name: 'Yan', avatar: mockAvatars.pickMockAvatar('Yan') }
    ],
    chatMessages: [
      { self: false, name: 'Alex', avatar: mockAvatars.pickMockAvatar('Alex'), text: '今天果岭速度挺快，短推要保守一点。' },
      { self: true, name: '我', avatar: mockAvatars.pickMockAvatar('我'), text: '收到，A4 洞开始注意落点。' },
      { self: false, name: '大雷', avatar: mockAvatars.pickMockAvatar('大雷'), text: '前组节奏不错，我们保持就行。' }
    ]
  },

  // 记分页 onLoad 只做一件事：读取 matchState → 据此渲染 UI。
  // matchState 是唯一数据源：不读取 URL 赛制参数、不写死默认赛制、不初始化默认比赛数据。
  onLoad(options) {
    this._pageOptions = options || {};
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());

    const ms = matchState.getMatchState();
    // 无比赛数据：不初始化任何默认比赛，提示后保持空白（入口已统一拦截，此处为兜底）
    if (!ms || !ms.formatType) {
      this._playersSource = [];
      this.setData({ noMatch: true });
      wx.showToast({ title: '暂无比赛数据', icon: 'none' });
      return;
    }

    this._matchState = ms;
    const mode = this._resolvePageMode(ms);
    const gameId = ms.gameId || '';
    const groupIndex = ms.groupIndex != null ? Number(ms.groupIndex) || 0 : 0;
    const groupId = ms.groupId || gameId || '';
    this._gameGroupIndex = groupIndex;
    // 校正旧 session：match 已是 G1 但 matchState.mode 仍为 stroke_entity
    if (mode && mode !== ms.mode) {
      const nextMs = Object.assign({}, ms, { mode: mode });
      if (nextMs.course && typeof nextMs.course === 'object') {
        const liveMatch = ms.matchId ? teamMatchStore.getMatchById(ms.matchId) : null;
        const liveMode = liveMatch && (liveMatch.gameMode || liveMatch.selectedGameMode);
        if (liveMode) {
          nextMs.course = Object.assign({}, nextMs.course, { gameMode: liveMode });
        }
      }
      matchState.setMatchState(nextMs);
      this._matchState = nextMs;
    }
    this.setData({
      noMatch: false,
      mode: mode,
      formatType: ms.formatType,
      groupId: groupId,
      gameId: gameId,
      gameGroupIndex: groupIndex
    });

    this._syncHoleLayoutFromCourse({ refresh: false });

    if (mode === 'game') {
      this.initGameMode(gameId, groupIndex);
    } else if (mode === 'fourball_best') {
      this.initFourBallBestMode();
    } else if (mode === 'stroke_entity') {
      this.initStrokeEntityMode(groupId);
    } else if (mode === 'individual_stroke') {
      this.initIndividualStrokeMode(groupId);
    } else {
      this.initStandardFromMatchState(ms);
    }

    // 读取“总杆/杆差”显示偏好缓存（按比赛/球局记忆），无缓存默认总杆
    const savedDisplayMode = wx.getStorageSync(this._displayModeKey());
    // 读取“记分方式(技术/快捷)”偏好缓存（用户习惯，跨洞/球员/组别共享），无缓存默认技术
    const savedInputMode = wx.getStorageSync(this._inputModeKey());
    const inputMode = savedInputMode === 'quick' ? 'quick'
      : (savedInputMode === 'technical' || savedInputMode === 'tech') ? 'tech'
      : this.data.scorePanelMode;
    this.setData(
      {
        scoreDisplayMode: savedDisplayMode === 'diff' || savedDisplayMode === 'gross' ? savedDisplayMode : 'gross',
        scorePanelMode: inputMode
      },
      () => this.refreshPlayers()
    );

    // 会话内本地状态回灌：同一会话再次进入该球局不丢失成绩
    this.hydrateFromSession();
    this._syncMoreMenuItems();
    this._syncFontScale();
    wx.nextTick(() => this._tryApplyPendingMatchJoinBind());
  },

  // formatType → 渲染模式（仅当 matchState.mode 缺省时的兜底推导）
  _modeForFormat(formatType) {
    if (formatType === 'best_score' || formatType === 'best_ball' || formatType === 'best_ball_4_0') {
      return 'fourball_best';
    }
    if (formatType === 'individual_stroke') return 'individual_stroke';
    return 'standard';
  },

  /**
   * 队内赛记分页 mode：与 detail.resolveTournamentScorePageMode 对齐
   * G1 优先 individual_stroke；G2/G3/G4 保持 stroke_entity
   * G5 / G6/G7/G8 比洞：仍返回 individual_stroke（看板由 isMatchPlayBoardMode 叠加；禁止 stroke_entity）
   */
  _resolveTeamMatchScorePageMode(match, groupId) {
    const gameMode = String(
      (match && (match.gameMode || match.selectedGameMode)) || ''
    ).trim();
    if (gameMode === '个人比杆赛') {
      return 'individual_stroke';
    }
    // G5：明确走个人行记分，禁止落入 stroke_entity
    if (isG5PersonalMatchPlayMode(gameMode)) {
      return 'individual_stroke';
    }
    // G6/G7/G8：比洞复用 G5 看板路径；禁止因残留 scoreEntities 落入 stroke_entity
    if (isG678SideMatchPlayMode(gameMode)) {
      return 'individual_stroke';
    }
    const gid = groupId != null ? String(groupId) : '';
    const scoreEntities = match && match.scoreEntities;
    if (scoreEntities && typeof scoreEntities === 'object' && !Array.isArray(scoreEntities)) {
      const list = Array.isArray(scoreEntities[gid]) ? scoreEntities[gid] : [];
      if (list.length > 0) return 'stroke_entity';
    }
    if (
      gameMode === '最好成绩比杆赛' ||
      gameMode === '四人四球比杆赛' ||
      gameMode === '最佳球位比杆赛' ||
      gameMode === '四人两球比杆赛'
    ) {
      return 'stroke_entity';
    }
    return 'individual_stroke';
  },

  /** 当前球队赛 gameMode（match 优先，其次 matchState.course） */
  _resolveTeamMatchGameMode(match, ms) {
    if (match && (match.gameMode || match.selectedGameMode)) {
      return String(match.gameMode || match.selectedGameMode).trim();
    }
    const course = (ms && ms.course) || {};
    return String(course.gameMode || course.format || '').trim();
  },

  /**
   * Phase1-B/D：比洞状态基于 Side.scores（与 matchSidesView 同源）
   * G5：forceG5 成员成绩；G6/G7/G8：combo 空分 → 空状态，不伪造
   * startHole 来自 scoreData[groupId].matchPlayMeta（无则默认洞 1）
   */
  _syncG5MatchStatusView(match, isG5MatchPlay, gameMode) {
    const enabled = isG5MatchPlay != null ? !!isG5MatchPlay : !!this.data.isG5MatchPlay;
    if (!enabled) {
      return {
        matchStatusView: {
          cells: [],
          rowCells: [],
          currentLabel: 'TIED',
          currentLeadClass: 'all-square',
          leader: 'AS',
          up: 0
        }
      };
    }
    const ms = this._matchState || this._readMatchState();
    const mode = String(
      gameMode != null ? gameMode : this._resolveTeamMatchGameMode(match, ms)
    ).trim();
    const groupId = String(
      (this.data && this.data.groupId) || (ms && ms.groupId) || ''
    ).trim();
    const isG5 = isG5PersonalMatchPlayMode(mode);
    const sides = resolveMatchPlaySides(
      this._playersSource,
      match || null,
      isG5 ? { forceG5: true, groupId: groupId } : { gameMode: mode, groupId: groupId }
    );
    const meta = readMatchPlayMeta(match, groupId);
    const softMeta =
      meta ||
      (sides
        ? inferAutoMatchPlayMeta(sides.sideA.scores, sides.sideB.scores, null)
        : null);
    const startHole = softMeta ? softMeta.startHole : 1;
    if (!sides) {
      return {
        matchStatusView: isG5
          ? buildG5MatchStatusView(this._playersSource, match || null)
          : emptyMatchStatusView()
      };
    }
    return {
      matchStatusView: buildMatchStatusView(sides.sideA, sides.sideB, startHole)
    };
  },

  /** Phase1-D：当前组比洞起始洞（有 meta / 可推断则返回洞号，否则 null） */
  _resolveMatchPlayStartHoleForUi(match, groupId, gameMode) {
    const mode = String(gameMode || '').trim();
    if (!isMatchPlayBoardMode(mode)) return null;
    const gid = String(groupId || '').trim();
    const meta = readMatchPlayMeta(match, gid);
    if (meta) return meta.startHole;
    const isG5 = isG5PersonalMatchPlayMode(mode);
    const sides = resolveMatchPlaySides(
      this._playersSource,
      match || null,
      isG5 ? { forceG5: true, groupId: gid } : { gameMode: mode, groupId: gid }
    );
    if (!sides) return null;
    const inferred = inferAutoMatchPlayMeta(sides.sideA.scores, sides.sideB.scores, null);
    return inferred ? inferred.startHole : null;
  },

  // 有 gameId 的普通球局必须走 game 模式，避免 formatType 兜底误用球队精简面板
  // 队内赛：以最新 match.gameMode / scoreEntities 校正，覆盖旧 matchState.mode=stroke_entity
  _resolvePageMode(ms) {
    if (!ms) return 'standard';
    if (ms.matchId) {
      const match = teamMatchStore.getMatchById(ms.matchId);
      if (match) {
        return this._resolveTeamMatchScorePageMode(match, ms.groupId || '');
      }
    }
    const m = ms.mode;
    if (
      m === 'game' ||
      m === 'fourball_best' ||
      m === 'individual_stroke' ||
      m === 'stroke_entity' ||
      m === 'standard'
    ) {
      return m;
    }
    if (ms.gameId) return 'game';
    return this._modeForFormat(ms.formatType);
  },

  _resolveMoreMenuForCurrentContext() {
    const mode = this.data.mode;
    const ms = this._matchState || this._readMatchState();
    const gameId = this.data.gameId || (ms && ms.gameId) || '';

    let panels;
    // 普通球局记分页：优先按 gameStore 组数决定（单组必为完整面板，与 mode 无关）
    if (gameId && gameStore.getGame(gameId)) {
      panels = resolveNormalGameMoreMenu(gameId, ms);
    } else if (mode === 'standard') {
      panels = resolveMoreMenuPanels('standard');
    } else if (mode === 'individual_stroke') {
      panels = resolveMoreMenuPanels('individual_stroke');
    } else if (mode === 'fourball_best') {
      const hasMatch = !!(ms && Array.isArray(ms.players) && ms.players.length);
      panels = resolveMoreMenuPanels('fourball_best', { hasRealMatch: hasMatch, groupCount: 1 });
    } else if (mode === 'game') {
      panels = resolveMoreMenuPanels('game', { groupCount: 1 });
    } else {
      panels = { moreMenuItems: MORE_MENU_ITEMS_COMPACT.slice() };
    }

    // match.status === 'finished'：首行管理项 + 结束比赛冻结（生成阶段写 disabled）
    // 本页结束本组后 gameFinished 同步冻结，避免仅改组状态时菜单仍可点
    const match =
      ms && ms.matchId ? teamMatchStore.getMatchById(ms.matchId) : null;

    // 队内赛 G1–G8：隐藏成绩卡/统计/修改半场；G5–G8（isMatchPlayBoardMode）另展示「修改起始洞」
    if (isTeamInternalScoreMatchContext(ms) && panels && panels.moreMenuItems) {
      const gameMode = this._resolveTeamMatchGameMode(match, ms);
      panels = {
        moreMenuItems: filterTeamMatchScoreMoreMenuItems(panels.moreMenuItems, {
          isMatchPlayBoard: isMatchPlayBoardMode(gameMode)
        })
      };
    }

    const matchFinished = isMatchStatusFinished(match) || !!this.data.gameFinished;
    if (panels && panels.moreMenuItems) {
      panels = {
        moreMenuItems: applyFinishedScoreMoreMenuState(panels.moreMenuItems, matchFinished)
      };
    }
    return panels;
  },

  /** 底部「添加/删除」是否冻结：match.status=finished 或本组已结束 */
  _resolveAddDeleteDisabled() {
    if (this.data.gameFinished) return true;
    const ms = this._matchState || this._readMatchState();
    const matchId = (ms && ms.matchId) || '';
    if (!matchId) return false;
    const match = teamMatchStore.getMatchById(matchId);
    return isMatchStatusFinished(match);
  },

  /**
   * 记分面板只读：match.status === 'finished'
   * 普通球局无 match 时回退 gameFinished（本组已结束）
   */
  _resolveIsReadOnlyScore() {
    if (this.data.gameFinished) return true;
    const ms = this._matchState || this._readMatchState();
    const matchId = (ms && ms.matchId) || '';
    if (!matchId) return false;
    const match = teamMatchStore.getMatchById(matchId);
    return isMatchStatusFinished(match);
  },

  _syncScoreFinishedUiState() {
    const panels = this._resolveMoreMenuForCurrentContext();
    const isReadOnlyScore = this._resolveIsReadOnlyScore();
    this.data.isReadOnlyScore = isReadOnlyScore;
    const patch = {
      addDeleteDisabled: this._resolveAddDeleteDisabled(),
      isReadOnlyScore: isReadOnlyScore
    };
    if (panels && panels.moreMenuItems) {
      patch.moreMenuItems = panels.moreMenuItems;
    }
    this.setData(patch);
  },

  _syncMoreMenuItems() {
    this._syncScoreFinishedUiState();
  },

  // 标准模式：球员/球场全部来自 matchState（无球员时回退演示种子，仅用于首页原型卡片）
  initStandardFromMatchState(ms) {
    const players = (ms && ms.players) || [];
    this._playersSource = players.length
      ? players.map((p, i) => {
          const playerId = (p && (p.playerId || p.id)) || ('seat-' + i);
          const teeFields = applyScorePlayerTeeFields(
            {
              playerId: playerId,
              tPosition: (p && p.tPosition) || '',
              gender: (p && p.gender) || '',
              matchGender: (p && p.matchGender) || ''
            },
            i
          );
          return {
            id: playerId,
            playerId: playerId,
            name: (p && p.name) || '球员',
            avatar: (p && p.avatar) || '',
            gender: teeFields.gender,
            tPosition: teeFields.tPosition,
            colorClass: teeFields.colorClass,
            scores: [],
            putts: [],
            fairways: [],
            penalties: [],
            sands: []
          };
        })
      : PLAYER_SEEDS.map((p) => JSON.parse(JSON.stringify(p)));
    const course = (ms && ms.course) || {};
    const menuPanels = resolveMoreMenuPanels('standard');
    this.setData({
      mode: 'standard',
      isSingleGroupGame: false,
      useGameStrokeShell: false,
      useStrokeScoreShell: false,
      useMatchPlayScoreShell: false,
      useFourballScoreShell: this._resolveFourballScoreShell(),
      isFourballPair22: false,
      isFourballPairLayout: false,
      isFourballTeamLayout: false,
      isFourball40StrokeShell: false,
      strokeShellFormatLabel: '',
      moreMenuItems: menuPanels.moreMenuItems,
      scoringMode: 'stroke',
      layoutType: 'standard',
      playerCount: this._playersSource.length || 4,
      'match.course': course.courseName || this.data.match.course
    });
    this.refreshPlayers();
  },

  // 显示偏好缓存 key：使用稳定全局键（同一比赛各小组共享，避免随 groupId 变化丢失）
  // TODO: 接入真实 matchId 后改为 'scoreDisplayMode_' + matchId
  _displayModeKey() {
    return 'scoreDisplayMode_global';
  },

  /** 读取全局字体大小偏好（显示设置 → fontScale_global） */
  _getFontScale() {
    try {
      const value = wx.getStorageSync('fontScale_global');
      return value === 'large' ? 'large' : 'normal';
    } catch (e) {
      return 'normal';
    }
  },

  /** 写入全局字体大小，并同步本页 class */
  _setFontScale(value) {
    const next = value === 'large' ? 'large' : 'normal';
    try {
      wx.setStorageSync('fontScale_global', next);
    } catch (e) {}
    this.setData({
      fontScale: next,
      fontScaleClass: next === 'large' ? 'font-large' : 'font-normal'
    });
  },

  /** 将 fontScale_global 同步到本页 class（仅显示层） */
  _syncFontScale() {
    const fontScale = this._getFontScale();
    this.setData({
      fontScale: fontScale,
      fontScaleClass: fontScale === 'large' ? 'font-large' : 'font-normal'
    });
  },

  // 记分方式(技术/快捷)偏好缓存 key：稳定全局键，绝不绑定 hole/player/group
  // TODO: 接入真实 matchId 后改为 'scoreInputMode_' + matchId
  _inputModeKey() {
    return 'scoreInputMode_global';
  },

  // 统一比赛状态对象（页面间唯一数据通道）：{ players, course, formatType, scores, groupCount }
  _readMatchState() {
    try {
      const ms = wx.getStorageSync('matchState');
      return ms && typeof ms === 'object' ? ms : null;
    } catch (e) {
      return null;
    }
  },

  // 赛制 → 展示文案（Context 面板 / 第一列标题）；mode 仍可为 fourball_best
  // formatType 优先：fourball_2ball → 四人两球赛（勿落入最好成绩）
  _labelForFormat(formatType) {
    const ft = String(formatType || '').trim();
    if (ft === 'fourball_2ball') return '四人两球赛';
    if (ft === 'fourball_best') return '最好成绩比杆赛';
    if (ft === 'best_ball_4_0') return '最佳球位';
    return '最好成绩';
  },

  // 四人最佳球位模式初始化：
  // - 真实比赛（携带 gameId + matchState.players）→ 球员/球场继承创建页，18 洞成绩初始为空
  // - 首页演示（无 gameId）→ 保留 HTML 原型演示数据
  initFourBallBestMode() {
    const ms = this._readMatchState();
    const hasMatch = !!(this.data.gameId && ms && Array.isArray(ms.players) && ms.players.length);

    if (hasMatch) {
      const group = this._loadPlayersFromGameGroup(this.data.gameId, this._gameGroupIndex || 0);
      // matchState.players 与 gameStore 对齐（buildFromGame 入口亦会重建）
      this._syncMatchStatePlayers(group.playersSlots || []);
    } else if (!this._playersSource || !this._playersSource.length) {
      // 首页演示态（无真实比赛）：回退原型种子球员
      this._playersSource = PLAYER_SEEDS.map((p) => JSON.parse(JSON.stringify(p)));
    }

    // 统一记分引擎分组结构（scoreEngine.groups）：唯一驱动「分组高亮」与「记分控件数量」。
    // 每个 group = 一个记分实体（含 scores/putts）；不拆分球员、不生成多值数组。
    this._engineGroups = this._buildEngineGroups(ms, hasMatch);

    // 从 gameStore 回灌团队记分实体成绩（按 teamId；空成员组也保留成绩供隐藏后恢复）
    if (hasMatch && this.data.gameId) {
      const savedGroup = gameStore.getGroup(this.data.gameId, this._gameGroupIndex || 0) || {};
      const savedTeams = savedGroup.teamScoresByEntity || [];
      if (savedTeams.length && this._engineGroups.length) {
        savedTeams.forEach((rec) => {
          const tid = String((rec && rec.teamId) || '').trim();
          if (!tid) return;
          const eg = this._engineGroups.find(
            (g) => g && String(g.id || g.teamId || '').trim() === tid
          );
          if (!eg) return;
          eg.scores = (rec.scores || []).slice();
          eg.putts = (rec.putts || []).slice();
        });
      }
    }

    // 第一列标题：真实比赛由 matchState.formatType 驱动；演示态固定「最佳球位」原型
    const label = hasMatch ? this._labelForFormat(ms && ms.formatType) : '最佳球位';
    // Context 面板赛制：优先 formatType（fourball_2ball → 四人两球赛）
    const formatLabel =
      label ||
      (hasMatch &&
        ms &&
        ms.course &&
        String(ms.course.gameMode || ms.course.format || '').trim()) ||
      String((this.data.match && this.data.match.format) || '').trim() ||
      '';
    // 真实比赛：球队记分行 = 各组逐洞最佳（best across groups）派生；演示态保留原型数据
    const team = hasMatch ? this._teamBestColumns(this.data.scoreDisplayMode) : null;
    const colStartW = this._computeBestballColStartWidth();
    const groupCount = resolveScorePageGroupCount(this.data.gameId, ms);
    const menuPanels = this.data.gameId
      ? resolveNormalGameMoreMenu(this.data.gameId, ms)
      : resolveMoreMenuPanels('fourball_best', { hasRealMatch: hasMatch, groupCount: groupCount });
    // pair / team-stroke / individual-fallback：仅按当前有效 members（不改 compositionType）
    const pairFlags = resolveFourballPairFlags(this._engineGroups || []);
    const isFourballTeamLayout = resolveFourballTeamLayoutFlag(this._engineGroups || []);
    const isFourball40StrokeShell = resolveStrokeTeamShellFlag(this._engineGroups || []);
    const isFourballIndividualFallback = resolveFourballIndividualStrokeFallbackFlag(
      this._engineGroups || []
    );
    const useStrokeScoreShell = isFourball40StrokeShell || isFourballIndividualFallback;
    // Legacy 仍用 bestTeams；4+0/3+0/3+1 与 individual-fallback 走 stroke shell（playersView）
    const bestTeams = this._buildBestTeams(this.data.scoreDisplayMode, hasMatch, label);
    this.setData({
      mode: 'fourball_best',
      isSingleGroupGame: false,
      useGameStrokeShell: false,
      useStrokeScoreShell: useStrokeScoreShell,
      useMatchPlayScoreShell: false,
      useFourballScoreShell: useStrokeScoreShell ? false : this._resolveFourballScoreShell(),
      fourballTeeStickyVisible: false,
      fourballScrollLeft: 0,
      fourballIdentityCollapseProgress: 0,
      fourballTrackInnerStyle: 'transform: translateX(0px);',
      fourballHoleParOffsetX: 0,
      isTeeStickyVisible: false,
      isHoleParCompact: false,
      holeParNormalStyle: 'transform: translateX(0px);',
      isFourballPair22: pairFlags.isFourballPair22,
      isFourballPairLayout: pairFlags.isFourballPairLayout,
      isFourballTeamLayout: isFourballTeamLayout,
      moreMenuItems: menuPanels.moreMenuItems,
      playerCount: this._playersSource.length || 4,
      scoringMode: 'best_ball',
      layoutType: 'fourball',
      bestHasMatch: hasMatch,
      // 4+0 / 3+0 / 3+1：名册仅 ≥3 人组；fallback 无组合 → 名册为空
      bestRoster: (function () {
        const raw = hasMatch
          ? this._buildRosterFromGroups()
          : buildBestRoster(this._playersSource);
        return isFourball40StrokeShell ? padBestRosterFourSlots(raw) : raw;
      }.call(this)),
      bestLabel: label,
      // 记分行：按组渲染（多人组=球队样式，单人组=个人比杆样式）
      bestTeams: bestTeams,
      fourballRowsView: this._buildFourballRowsView(bestTeams),
      // 兼容字段（best across groups，供需要时读取，不再用于行渲染）
      bestColumns: hasMatch ? team.columns : buildBestBallColumns(this.data.scoreDisplayMode),
      bestTeamDiffStr: hasMatch ? team.teamDiffStr : formatDiff(BEST_SPECIAL[20].diff),
      bestTeamDiffClass: hasMatch
        ? team.teamDiffClass
        : (BEST_SPECIAL[20].diff < 0 ? 'diff-under' : BEST_SPECIAL[20].diff > 0 ? 'diff-over' : 'diff-even'),
      // stroke shell（含 individual fallback）身份列对齐个人比杆 G1
      scoreboardStyle: this._buildScoreboardStyleVars(
        useStrokeScoreShell
          ? { colWidth: G1_IDENTITY_COL_WIDTH, paddingX: 12, diffOpacity: 1, nameWidth: 96 }
          : { colWidth: colStartW, bestDiffGrow: 1 }
      ),
      'match.format': formatLabel,
      isFourball40StrokeShell: isFourball40StrokeShell,
      // TEAM SCORE 文案仅正式 4+0/3+0/3+1；fallback 用头像+昵称，不占赛制文案
      strokeShellFormatLabel: isFourball40StrokeShell ? label : '',
      playersView: isFourball40StrokeShell
        ? this._buildFourball40PlayersView(this.data.scoreDisplayMode, label, hasMatch)
        : isFourballIndividualFallback
          ? this._buildFourballIndividualFallbackPlayersView(
              this.data.scoreDisplayMode,
              hasMatch
            )
          : this.data.playersView
    });

    // 球场信息继承：球场名称 / 开球时间等全部来自 matchState.course
    if (hasMatch && ms.course) {
      const c = ms.course || {};
      this.setData({ 'match.course': c.courseName || '' });
      this.buildGameContextFromMatchState(ms);
    }
    if (hasMatch && this.data.gameId) {
      this._syncGameFinishedState();
    }
  },

  /**
   * Seat Model 读取：普通 fourball_best 且 composition.seats 存在时，
   * seats → deriveTeamsFromSeats → 作为 _engineGroups 的 members 源。
   * 无 seats / 非本赛制 → 返回 null，由调用方走旧 ms.groups（composition.teams）。
   * 不写 storage、不改 composition、不碰增删逻辑。
   */
  _resolveEngineGroupsBaseFromSeats(ms, hasMatch) {
    if (!hasMatch || !this.data.gameId) return null;
    const ft = String((ms && ms.formatType) || '').trim();
    if (ft === 'fourball_2ball') return null;
    const game = gameStore.getGame(this.data.gameId);
    if (!game) return null;
    const gm = String(game.gameMode || '').trim();
    if (gm === '四人两球赛') return null;
    const formatOk =
      ft === 'best_score' ||
      ft === 'best_ball' ||
      ft === 'best_ball_4_0' ||
      gm === '最好成绩赛' ||
      gm === '最佳球位赛';
    if (!formatOk) return null;

    const gi = this._gameGroupIndex || 0;
    const storeGroups = gameStore.listGroups(game);
    const group = storeGroups[gi] || {};
    const groupId = group.groupId || this.data.gameId + '-g' + (gi + 1);
    const prevMap =
      game.groupCompositionMap && typeof game.groupCompositionMap === 'object'
        ? game.groupCompositionMap
        : {};
    let composition =
      prevMap[groupId] ||
      group.composition ||
      (gi === 0 ? game.composition : null) ||
      null;
    // 顶层 game.composition 用 type 字段时，归一成与 map 同构以便读 seats / teams
    if (
      composition &&
      !composition.compositionType &&
      composition.type &&
      Array.isArray(composition.teams)
    ) {
      composition = Object.assign({}, composition, {
        compositionType: resolveCompositionType(composition)
      });
    }
    if (!composition || !Array.isArray(composition.teams) || !composition.teams.length) {
      return null;
    }
    // 仅 seats 已落盘时走 Seat Model；旧局无 seats → 保持 composition.teams
    if (!Array.isArray(composition.seats) || !composition.seats.length) return null;

    const seats = getCompositionSeats(composition);
    const derivedTeams = deriveTeamsFromSeats(composition, seats);
    if (!derivedTeams || !derivedTeams.length) return null;

    // 按 playerId 合并旧 teams / ms.groups 上的 tee 等展示字段（seats 暂无 tee）
    const liveById = {};
    const absorbMembers = (list) => {
      (Array.isArray(list) ? list : []).forEach((m) => {
        if (!m) return;
        const pid = String(m.playerId || m.userId || m.id || '').trim();
        if (pid) liveById[pid] = m;
      });
    };
    (composition.teams || []).forEach((t) => {
      absorbMembers((t && t.members) || (t && t.players) || []);
    });
    const scoreById = {};
    ((ms && ms.groups) || []).forEach((g) => {
      const tid = g && g.teamId != null ? String(g.teamId).trim() : '';
      if (!tid) return;
      scoreById[tid] = g;
      absorbMembers((g && g.members) || []);
    });

    return derivedTeams.map((t, ti) => {
      const tid = t.teamId || 'team-' + (ti + 1);
      const prev = scoreById[tid] || {};
      const members = (Array.isArray(t.members) ? t.members : []).map((m) => {
        if (!m || !m.playerId) return m;
        const live = liveById[String(m.playerId).trim()];
        if (!live) return m;
        return Object.assign({}, live, {
          playerId: m.playerId,
          userId: m.userId || m.playerId,
          name: m.name || live.name,
          avatar: m.avatar != null && m.avatar !== '' ? m.avatar : live.avatar || ''
        });
      });
      return {
        teamId: tid,
        name: t.name || prev.name || '队伍 ' + (ti + 1),
        members: members,
        scores: Array.isArray(prev.scores) ? prev.scores : [],
        putts: Array.isArray(prev.putts) ? prev.putts : []
      };
    });
  },

  // 构建统一记分引擎分组（scoreEngine.groups）：matchState.groups 优先；缺省则全员一组。
  // 普通 fourball_best + seats：优先 seats → deriveTeams → engineGroups；否则旧 teams。
  // 每组携带 scores/putts（每洞单一成绩），不拆分球员。
  _buildEngineGroups(ms, hasMatch) {
    let base = this._resolveEngineGroupsBaseFromSeats(ms, hasMatch);
    if (!base) {
      base = ms && Array.isArray(ms.groups) && ms.groups.length ? ms.groups : null;
    }
    if (!base) {
      // 无分组信息：全员视为一个组（4+0 等价行为）
      const members = ((ms && ms.players) || this._playersSource || []).map((p, i) => ({
        playerId: (p && (p.playerId || p.id)) || ('seat-' + i),
        name: (p && p.name) || '球员',
        avatar: (p && p.avatar) || ''
      }));
      base = [{ teamId: 'team-1', name: '队伍 1', members }];
    }
    return base.map((g, gi) => ({
      id: g.teamId || ('team-' + (gi + 1)),
      name: g.name || ('队伍 ' + (gi + 1)),
      members: g.members || [],
      avatar: (g.members && g.members[0] && g.members[0].avatar) || '',
      scores: Array.isArray(g.scores) ? g.scores.slice() : [],
      putts: Array.isArray(g.putts) ? g.putts.slice() : []
    }));
  },

  // 名册条：仅平铺当前「3 人及以上」有效成员（triple/quad）。
  // pair / single / 空队不进名册；展示跟 members，不跟 compositionType。
  _buildRosterFromGroups() {
    const groups = this._engineGroups || [];
    const roster = [];
    groups.forEach((g, gi) => {
      const members = g.members || [];
      if (members.length < 3) return;
      members.forEach((m) => {
        const i = roster.length;
        // 与 _buildEntityRosterFromEntitiesView / teeSegments 一致：显式 tPosition/tee → style；否则 palette
        const style = resolveScoreTeeStyle(m, i);
        const palette = TEE_PALETTE[i % TEE_PALETTE.length];
        const hasExplicitTee = !!(m && (isEditTeeKey(m.tPosition) || isEditTeeKey(m.tee)));
        const tee = hasExplicitTee
          ? style.tee || (palette && palette.tee) || ''
          : (palette && palette.tee) || style.tee || '';
        const teeColor = hasExplicitTee
          ? style.teeColor || (palette && palette.teeColor) || ''
          : (palette && palette.teeColor) || style.teeColor || '';
        const shortName = m.name && m.name.indexOf('.') >= 0 ? m.name.split('.').pop().trim() : m.name;
        roster.push({
          playerId: m.playerId || ('seat-' + i),
          name: shortName || m.name || '球员',
          avatar: m.avatar || '',
          tee: tee,
          teeColor: teeColor,
          groupIndex: gi,
          groupClass: 'bestball-group-' + (gi % 4)
        });
      });
    });
    return roster;
  },

  /**
   * Stroke Entity 4+0（kind=team）：复用 fourball_best「四人最佳球位挑战-18」名册条。
   * 只要 memberDisplay 有有效成员即展示（1–4 人同一模板横向排列），不要求人数===4。
   * 头像在 HOLE 上方名册；sticky 仅 TEAM SCORE。2+2（pair）不进名册。
   */
  _buildEntityRosterFromEntitiesView(entitiesView) {
    const roster = [];
    (entitiesView || []).forEach((row, gi) => {
      if (!row || row.kind !== 'team') return;
      const members = (Array.isArray(row.memberDisplay) ? row.memberDisplay : []).filter((m) => {
        if (!m) return false;
        const uid = m.userId != null ? String(m.userId).trim() : '';
        const name = m.name != null ? String(m.name).trim() : '';
        const avatar = m.avatar != null ? String(m.avatar).trim() : '';
        return !!(uid || name || avatar);
      });
      if (!members.length) return;
      members.forEach((m) => {
        const i = roster.length;
        const style = resolveScoreTeeStyle(m, i);
        const palette = TEE_PALETTE[i % TEE_PALETTE.length];
        const hasExplicitTee = !!(m && (isEditTeeKey(m.tPosition) || isEditTeeKey(m.tee)));
        // 与四段 teeSegments 同优先级：显式 tPosition/tee → style；否则 palette → style
        const tee = hasExplicitTee
          ? style.tee || (palette && palette.tee) || ''
          : (palette && palette.tee) || style.tee || '';
        const teeColor = hasExplicitTee
          ? style.teeColor || (palette && palette.teeColor) || ''
          : (palette && palette.teeColor) || style.teeColor || '';
        const rawName = (m && m.name) || '';
        const shortName =
          rawName && rawName.indexOf('.') >= 0 ? rawName.split('.').pop().trim() : rawName;
        roster.push({
          playerId: (m && m.userId) || ('seat-' + i),
          name: shortName || rawName || '球员',
          avatar: (m && m.avatar) || '',
          tee: tee,
          teeColor: teeColor,
          groupIndex: gi,
          groupClass: 'bestball-group-' + (gi % 4)
        });
      });
    });
    return roster;
  },

  // 逐洞「各组最佳」（best across groups）：球队记分行的唯一来源（单一成绩，不生成多值数组）
  // 空成员组（四人两球 2 人态隐藏的 team-2）不参与聚合，但其 scores 仍留在 _engineGroups
  _teamBestScores() {
    const groups = (this._engineGroups || []).filter(
      (g) => ((g && g.members) || []).length > 0
    );
    const scores = [];
    const putts = [];
    for (let h = 0; h < 18; h++) {
      let best = null;
      let bestPutt = null;
      groups.forEach((g) => {
        const s = (g.scores || [])[h];
        if (isFilledScore(s) && (best === null || s < best)) {
          best = s;
          bestPutt = (g.putts || [])[h];
        }
      });
      scores[h] = best;
      putts[h] = bestPutt != null ? bestPutt : 1;
    }
    return { scores, putts };
  },

  _teamBestColumns(displayMode) {
    const tb = this._teamBestScores();
    return buildTeamBestColumns(tb.scores, tb.putts, displayMode);
  },

  // 组合记分行第一列起始宽度：pair(2人)/team(4人)需容纳 identity + diff + tee
  _computeBestballColStartWidth() {
    const groups = this._engineGroups || [];
    const PAD = 24;
    const DIFF_W = 96;
    const GAP = 24;
    let need = 300;
    groups.forEach((g) => {
      const n = (g.members || []).length;
      // 2+2 / 4+0：同一初始总宽，供 _applyFourballPair22Scroll 推导 identityStart
      if (n === 2 || n === 4) {
        const avatarSpanEnd = 128 + 72;
        const inner = avatarSpanEnd + GAP + DIFF_W;
        need = Math.max(need, inner + PAD * 2);
      }
    });
    return need;
  },

  _engineHasPairGroups() {
    return (this._engineGroups || []).some((g) => (g.members || []).length === 2);
  },

  // pair swipe：双头像重叠块实际占用宽度（与居中 shift 共用）
  _computePairSwipeContentWidth(progress) {
    const G = PAIR_SWIPE_GEOM;
    const secondShift = -(G.SECOND_SHIFT_MAX * progress);
    const secondLeft = G.AV2_LEFT + secondShift;
    const contentLeft = Math.min(G.AV1_LEFT, secondLeft);
    const contentRight = Math.max(G.AV1_LEFT + G.AVATAR_W, secondLeft + G.AVATAR_W);
    return contentRight - contentLeft;
  },

  // swipe indent 第一列：内容宽 + 杆差列 + T 线 + 结构 padding（不复用未缩进列宽）
  _computePairSwipeColumnWidth(paddingX, progress, diffColW) {
    const TEE_STRIP = 8;
    const contentWidth = this._computePairSwipeContentWidth(progress);
    return contentWidth + diffColW + TEE_STRIP + 2 * paddingX;
  },

  // swipe indent：唯一间距来源 gap = (containerWidth - contentWidth) / 2
  _computePairSwipeContainerShift(colWidth, paddingX, progress) {
    if (progress <= 0) return 0;
    const containerWidth = colWidth - 2 * paddingX;
    const contentWidth = this._computePairSwipeContentWidth(progress);
    const gap = (containerWidth - contentWidth) / 2;
    const G = PAIR_SWIPE_GEOM;
    const secondShift = -(G.SECOND_SHIFT_MAX * progress);
    const secondLeft = G.AV2_LEFT + secondShift;
    const contentLeft = Math.min(G.AV1_LEFT, secondLeft);
    return gap - contentLeft;
  },

  /**
   * 2+2 split：在 identity 段宽度内居中头像组（不用 colWidth−2×pad）
   * 几何用 FB22_PAIR_GEOM（80 头像 / shift −64），不改 PAIR_SWIPE_GEOM（entity 等）
   */
  _computePair22IdentityContainerShift(identityWidth, progress) {
    if (progress <= 0) return 0;
    const G = FB22_PAIR_GEOM;
    const secondShift = -(G.SECOND_SHIFT_MAX * progress);
    const secondLeft = G.AV2_LEFT + secondShift;
    const contentLeft = Math.min(G.AV1_LEFT, secondLeft);
    const contentRight = Math.max(G.AV1_LEFT + G.AVATAR_W, secondLeft + G.AVATAR_W);
    const contentWidth = contentRight - contentLeft;
    const gap = (identityWidth - contentWidth) / 2;
    return gap - contentLeft;
  },

  /**
   * 普通创建 fourball_best pair/4+0：两阶段横滑
   * 阶段1：只压缩 identity→148（diff=96 / tee=6 固定）
   * 阶段2：identity 锁定；diff 96→0
   */
  _applyFourballPair22Scroll(scrollLeft) {
    const left = Math.max(0, Number(scrollLeft) || 0);
    const startCol = this._computeBestballColStartWidth();
    const identityStart = Math.max(
      FB22_IDENTITY_END,
      startCol - FB22_PAD_L - FB22_DIFF_W - FB22_TEE_W
    );

    const p1 = Math.min(1, Math.max(0, left / FB22_PHASE1_SCROLL_PX));
    const eased1 = 1 - Math.pow(1 - p1, 3);
    const p2 = Math.min(
      1,
      Math.max(0, (left - FB22_PHASE1_SCROLL_PX) / FB22_PHASE2_SCROLL_PX)
    );
    const eased2 = 1 - Math.pow(1 - p2, 3);

    const identityW =
      p1 <= 0
        ? identityStart
        : identityStart - (identityStart - FB22_IDENTITY_END) * eased1;

    // 阶段2：p2 0→1 → diff 96→0（与 identity 同 cubic ease-out）
    const diffProgress = eased2;
    const diffColW = FB22_DIFF_W * (1 - diffProgress);
    const diffOpacity = 1 - diffProgress;

    const colWidth = FB22_PAD_L + identityW + diffColW + FB22_TEE_W;
    const pairSecondShift = -(FB22_PAIR_GEOM.SECOND_SHIFT_MAX * p1);
    const pairContainerShift =
      p1 > 0 ? this._computePair22IdentityContainerShift(identityW, p1) : 0;

    const style = this._buildScoreboardStyleVars({
      colWidth: colWidth,
      paddingX: FB22_PAD_L,
      diffOpacity: diffOpacity,
      nameWidth: 192,
      bestDiffGrow: 1,
      diffColW: diffColW,
      pairSecondShift: pairSecondShift,
      pairContainerShift: pairContainerShift,
      labelSize: 30
    });
    // 仅展示态：identity 压到 148 后切短昵称；不改横滑宽度/CSS 变量计算
    const namesCompact = p1 >= 1;
    if (
      style !== this.data.scoreboardStyle ||
      namesCompact !== this.data.isFourballPair22NamesCompact
    ) {
      this.setData({
        scoreboardStyle: style,
        isFourballPair22NamesCompact: namesCompact
      });
    }
    return { p1: p1, p2: p2, identityW: identityW, colWidth: colWidth };
  },

  _buildScoreboardStyleVars(opts) {
    const o = opts || {};
    const f1 = (n) => Number(n).toFixed(1);
    const f3 = (n) => Number(n).toFixed(3);
    const colW = o.colWidth != null ? o.colWidth : 240;
    const paddingX = o.paddingX != null ? o.paddingX : 24;
    const diffOpacity = o.diffOpacity != null ? o.diffOpacity : 1;
    const nameWidth = o.nameWidth != null ? o.nameWidth : 192;
    const diffColW = o.diffColW != null ? o.diffColW : 96;
    const bestDiffGrow = o.bestDiffGrow != null ? o.bestDiffGrow : 1;
    const pairSecondShift = o.pairSecondShift != null ? o.pairSecondShift : 0;
    const pairContainerShift = o.pairContainerShift != null ? o.pairContainerShift : 0;
    const labelSize = o.labelSize != null ? o.labelSize : 30;
    return (
      `--player-col-width:${f1(colW)}rpx;` +
      `--player-col-padding-x:${f1(paddingX)}rpx;` +
      `--player-diff-opacity:${f3(diffOpacity)};` +
      `--player-name-width:${f1(nameWidth)}rpx;` +
      `--bestball-diff-grow:${f3(bestDiffGrow)};` +
      `--bb-diff-col-w:${f1(diffColW)}rpx;` +
      `--pair-second-shift:${f1(pairSecondShift)}rpx;` +
      `--pair-container-shift:${f1(pairContainerShift)}rpx;` +
      `--bestball-label-size:${f1(labelSize)}rpx;`
    );
  },

  // 短名（去掉「T. 」等前缀）
  _shortName(name) {
    return name && name.indexOf('.') >= 0 ? name.split('.').pop().trim() : name;
  },

  /** 从个人比杆同源席位(_playersSource)按 playerId 取球员（复用同一 name 字段，不另解昵称） */
  _findPlayersSourceById(playerId) {
    const key = String(playerId || '').trim();
    if (!key) return null;
    const list = this._playersSource || [];
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p) continue;
      const id = p.playerId || p.id || p.userId || '';
      if (id && isSameUserIdentity(id, key)) return p;
    }
    return null;
  },

  // 按组构建记分行（每组一行），按组规模分流第一列渲染方式（kind）：
  // - pair（2 人）  → 复刻「四人四球」原型：固定列内并排双头像 + 双昵称 + 双色 T 台条（无文案/无杆差列）
  // - single（1 人）→ 个人比杆样式（头像 + 昵称）
  // - team（>=3 人）→ 球队样式（TEAM SCORE + 赛制标题），并在 HOLE 上方名册条展示成员
  // 演示态（无真实比赛）→ 单行原型数据。
  _buildBestTeams(displayMode, hasMatchArg, labelArg) {
    const hasMatch = hasMatchArg != null ? hasMatchArg : this.data.bestHasMatch;
    const bestLabel = labelArg || this.data.bestLabel || '最佳球位';
    if (!hasMatch) {
      const proto = buildBestBallColumns(displayMode);
      const d = BEST_SPECIAL[20].diff;
      const demoMembers = (this._playersSource || []).slice(0, 4).map((m, mi) => {
        const name = this._shortName(m && m.name) || (m && m.name) || '球员';
        const dn = name.length > 2 ? name.charAt(0) + '…' : name;
        const palette = TEE_PALETTE[mi % TEE_PALETTE.length];
        return {
          name: name,
          displayName: dn,
          teeColor: (palette && palette.teeColor) || ''
        };
      });
      return [{
        id: 'demo-team',
        groupIndex: 0,
        kind: 'team',
        isSingle: false,
        label: bestLabel,
        name: '',
        avatar: '',
        pairMembers: [],
        teamMembers: demoMembers,
        columns: proto,
        teamDiffStr: formatDiff(d),
        teamDiffClass: d < 0 ? 'diff-under' : d > 0 ? 'diff-over' : 'diff-even'
      }];
    }
    const groups = this._engineGroups || [];
    let gpos = 0; // 全局成员序号（双色 T 台调色板按此循环）
    // 无有效 member 的组：不生成展示行（身份+成绩格）；_engineGroups 成绩槽仍保留供恢复
    return groups
      .map((g, engineIdx) => ({ g: g, engineIdx: engineIdx }))
      .filter((x) => (((x.g && x.g.members) || []).length > 0))
      .map((x) => {
      const g = x.g;
      const gi = x.engineIdx;
      const t = buildTeamBestColumns(g.scores, g.putts, displayMode);
      const members = g.members || [];
      const size = members.length;
      const kind = size === 1 ? 'single' : size === 2 ? 'pair' : 'team';
      const m0 = members[0] || {};
      let pairMembers = [];
      let teamMembers = [];
      let colorClass = 'border-white';
      let teeColor = '';
      let displayName = '';
      if (kind === 'single') {
        const style = resolveScoreTeeStyle(m0, gpos);
        colorClass = style.colorClass;
        teeColor = style.teeColor || '';
        const short = this._shortName(m0.name) || m0.name || '球员';
        displayName = short.length > 2 ? short.charAt(0) + '…' : short;
        gpos += 1;
      } else if (kind === 'pair') {
        const PAIR_LEFT = ['24rpx', '128rpx'];
        pairMembers = members.map((m, mi) => {
          const style = resolveScoreTeeStyle(m, gpos);
          gpos += 1;
          const name = this._shortName(m.name) || m.name || '球员';
          // 仅 fourball pair 展示用；原 name 保留完整短名
          const dn = name.length > 2 ? name.charAt(0) + '…' : name;
          return {
            name: name,
            displayName: dn,
            avatar: m.avatar || '',
            teeColor: style.teeColor,
            left: PAIR_LEFT[mi] || (24 + mi * 104) + 'rpx',
            tf: mi === 1 ? 'translateX(var(--pair-second-shift, 0rpx))' : 'none'
          };
        });
      } else {
        // team（含 4+0）：展示用文字名 + teeColor；与 roster 同序配色；不进 sticky 头像
        teamMembers = members.map((m, mi) => {
          const style = resolveScoreTeeStyle(m, gpos);
          const palette = TEE_PALETTE[mi % TEE_PALETTE.length];
          gpos += 1;
          const name = this._shortName(m.name) || m.name || '球员';
          const dn = name.length > 2 ? name.charAt(0) + '…' : name;
          const hasExplicitTee =
            !!(m && (isEditTeeKey(m.tPosition) || isEditTeeKey(m.tee)));
          return {
            name: name,
            displayName: dn,
            teeColor: hasExplicitTee
              ? style.teeColor || (palette && palette.teeColor) || ''
              : (palette && palette.teeColor) || style.teeColor || ''
          };
        });
      }
      const shortName = this._shortName(m0.name) || m0.name || g.name;
      return {
        id: g.id,
        groupIndex: gi,
        kind: kind,
        isSingle: kind === 'single',
        // 球队/单人标题：严格按赛制（最佳球位/最好成绩），禁止使用队伍名/索引
        label: bestLabel,
        name: shortName,
        displayName: kind === 'single' ? displayName : '',
        avatar: m0.avatar || '',
        colorClass: kind === 'single' ? colorClass : '',
        teeColor: kind === 'single' ? teeColor : '',
        pairMembers: pairMembers,
        teamMembers: teamMembers,
        columns: t.columns,
        teamDiffStr: t.teamDiffStr,
        teamDiffClass: t.teamDiffClass
      };
    });
  },

  // 单组本洞成绩（已填则取值，否则 null）
  _groupHoleScore(gi, holeIndex) {
    const g = (this._engineGroups || [])[gi];
    const s = g && (g.scores || [])[holeIndex];
    return isFilledScore(s) ? s : null;
  },

  // 由 matchState 构建只读 Context 面板（球场 / 比赛名称 / 赛制 / 开球时间 + 实时天气）
  buildGameContextFromMatchState(ms) {
    const c = (ms && ms.course) || {};
    const courseName = c.courseName || '';
    const halfText = c.halfText || '';
    const courseFull = courseName ? (courseName + (halfText || '')) : '';
    const title = c.roundName || c.eventName || c.tournamentName || c.name || courseName || '高尔夫球局';
    // 赛制展示优先 formatType（四人两球 = fourball_2ball，勿被 fourball_best 文案覆盖）
    const formatType = String((ms && ms.formatType) || '').trim();
    const format =
      (formatType ? this._labelForFormat(formatType) : '') ||
      c.gameMode ||
      c.format ||
      '';
    const teeTime = c.teeTimeText || c.teeTime || c.date || '';
    const isPrivate = c.visibility === 'private';
    this.setData({
      'match.course': courseName,
      'match.name': title,
      'match.format': format,
      'match.teeTime': teeTime,
      gameContext: {
        ready: true,
        courseFull: courseFull,
        title: title,
        format: format,
        teeTime: teeTime,
        weather: { loading: true, line: '加载中…' },
        isPrivate: isPrivate,
        accessCode: isPrivate ? (c.accessCode || '') : ''
      }
    });
    this.fetchWeather();
  },

  _buildTeamMatchIndividualPlayersFromScoreData(match, groupId, ms) {
    if (!match || !groupId) return null;
    const scoreData = match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : null;
    const groupScoreData = scoreData && scoreData[groupId] && typeof scoreData[groupId] === 'object'
      ? scoreData[groupId]
      : null;
    const scoresByPlayer = groupScoreData && groupScoreData.scoresByPlayer && typeof groupScoreData.scoresByPlayer === 'object'
      ? groupScoreData.scoresByPlayer
      : null;
    if (!scoresByPlayer) return null;
    const players = ms && Array.isArray(ms.players) ? ms.players : [];
    if (!players.length) return null;
    const group = Array.isArray(match.groups)
      ? match.groups.find((item) => String(item && item.groupId) === String(groupId || ''))
      : null;
    const groupPlayers = Array.isArray(group && group.players) ? group.players : [];
    const entryByPlayerId = {};
    groupPlayers.forEach((entry) => {
      const id = entry && (entry.userId || entry.playerId || entry.id);
      const key = id != null ? String(id).trim() : '';
      if (key && !entryByPlayerId[key]) entryByPlayerId[key] = entry;
    });
    const findEntryByPosition = (position) => {
      const pos = Number(position) || 0;
      if (!pos) return null;
      return groupPlayers.find((entry) =>
        Number(entry && (entry.position != null ? entry.position : entry.slotIndex)) === pos
      ) || null;
    };
    return players.map((player, index) => {
      const playerId = player && (player.playerId || player.id);
      const playerKey = playerId != null ? String(playerId).trim() : '';
      const position = Number(player && (player.position != null ? player.position : player.slotIndex)) || 0;
      const entry = (playerKey && entryByPlayerId[playerKey]) || findEntryByPosition(position) || findEntryByPosition(index + 1) || {};
      const scorePlayerId = entry && (entry.scorePlayerId || entry.slotScorePlayerId || entry.scoreOwnerId)
        ? String(entry.scorePlayerId || entry.slotScorePlayerId || entry.scoreOwnerId).trim()
        : '';
      const record = (scorePlayerId && scoresByPlayer[scorePlayerId]) || (playerKey && scoresByPlayer[playerKey]) || {};
      const rawTp =
        entry && isEditTeeKey(entry.tPosition)
          ? entry.tPosition
          : entry && isEditTeeKey(entry.tee)
            ? entry.tee
            : '';
      const profile = this._buildScoreTeamMatchPlayerProfile(
        match,
        playerKey,
        Object.assign({}, entry, player || {})
      );
      const teeFields = applyScorePlayerTeeFields(
        {
          playerId: playerKey,
          tPosition: rawTp,
          tee: entry && entry.tee,
          gender: profile.gender || entry.gender || (player && player.gender) || '',
          matchGender: profile.matchGender || entry.matchGender || (player && player.matchGender) || ''
        },
        index
      );
      return {
        id: playerKey || '',
        playerId: playerKey || '',
        scorePlayerId: scorePlayerId || playerKey || '',
        name: (player && player.name) || '球员',
        avatar: (player && player.avatar) || '',
        gender: teeFields.gender,
        tPosition: teeFields.tPosition,
        colorClass: teeFields.colorClass,
        scores: (record.scores || []).slice(),
        putts: (record.putts || []).slice(),
        fairways: sliceFairways(record.fairways),
        penalties: slicePenalties(record.penalties),
        sands: sliceSands(record.sands)
      };
    });
  },

  // 个人比杆赛模式：从出发表 groups 加载本组球员与 holes 成绩（唯一数据源）
  initIndividualStrokeMode(groupId) {
    groupsStore.ensureInitialized();
    const ms = this._matchState || this._readMatchState();
    const matchId = (ms && ms.matchId) || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const matchGroup = match && Array.isArray(match.groups)
      ? match.groups.find((item) => String(item && item.groupId) === String(groupId || ''))
      : null;
    const matchPlayers = this._buildTeamMatchIndividualPlayersFromScoreData(match, groupId, ms);
    const group = groupsStore.getGroup(groupId);
    const loaded = groupsStore.loadGroupForScoring(groupId);
    const statePlayers = ms && Array.isArray(ms.players) && ms.players.length
      ? ms.players.map((p, i) => {
          const playerId = p.playerId || p.id;
          const entry =
            (matchGroup &&
              Array.isArray(matchGroup.players) &&
              matchGroup.players.find((item) => {
                const id = item && (item.userId || item.playerId || item.id);
                return id != null && String(id).trim() === String(playerId || '').trim();
              })) ||
            {};
          const profile = match
            ? this._buildScoreTeamMatchPlayerProfile(match, playerId, Object.assign({}, entry, p || {}))
            : {};
          const teeFields = applyScorePlayerTeeFields(
            {
              playerId: playerId,
              tPosition: entry.tPosition || p.tPosition || '',
              tee: entry.tee || p.tee || '',
              gender: profile.gender || entry.gender || p.gender || '',
              matchGender: profile.matchGender || entry.matchGender || p.matchGender || ''
            },
            i
          );
          return {
            id: playerId,
            playerId: playerId,
            name: p.name || '球员',
            avatar: p.avatar || '',
            gender: teeFields.gender,
            tPosition: teeFields.tPosition,
            colorClass: teeFields.colorClass,
            scores: [],
            putts: [],
            fairways: [],
            penalties: [],
            sands: []
          };
        })
      : null;
    this._playersSource = matchPlayers || statePlayers || (loaded.length
      ? loaded.map((p, i) => {
          const teeFields = applyScorePlayerTeeFields(
            {
              playerId: p.playerId || p.id,
              tPosition: p.tPosition || '',
              tee: p.tee || '',
              gender: p.gender || '',
              matchGender: p.matchGender || ''
            },
            i
          );
          return {
            id: p.id,
            playerId: p.playerId || p.id,
            name: p.name,
            avatar: p.avatar,
            gender: teeFields.gender,
            tPosition: teeFields.tPosition,
            colorClass: teeFields.colorClass,
            scores: (p.scores || []).slice(),
            putts: (p.putts || []).slice(),
            fairways: sliceFairways(p.fairways),
            penalties: slicePenalties(p.penalties),
            sands: sliceSands(p.sands)
          };
        })
      : PLAYER_SEEDS.map((p) =>
          Object.assign({}, JSON.parse(JSON.stringify(p)), { scores: [], putts: [], fairways: [], penalties: [], sands: [] })
        ));
    console.log('[score-load-source]', {
      matchId: matchId,
      source: matchPlayers ? 'teamMatch.scoreData' : 'groupsStore',
      groupId: groupId || '',
      playerCount: (this._playersSource || []).length
    });
    const gameMode = this._resolveTeamMatchGameMode(match, ms);
    // Phase1-A：isG5MatchPlay 数据位兼作 G5–G8 比洞看板开关（WXML/点格复用）；G5 识别函数本身不变
    const isMatchPlayBoard = isMatchPlayBoardMode(gameMode);
    const isG5Only = isG5PersonalMatchPlayMode(gameMode);
    const matchPlayScoreMode = isMatchPlayScoreMode(gameMode);
    const formatLabel = isG5Only
      ? '个人比洞赛'
      : isMatchPlayBoard && gameMode
        ? gameMode
        : '个人比杆赛';
    // UI Shell：球队赛 G1 → stroke shell；G5–G8 比洞 → match-play shell（不进 stroke_entity）
    const isTeamG1Stroke =
      !!matchId &&
      !isMatchPlayBoard &&
      (gameMode === '个人比杆赛' || gameMode === 'individual_stroke');
    this.setData({
      mode: 'individual_stroke',
      isG5MatchPlay: isMatchPlayBoard,
      isMatchPlayScoreMode: matchPlayScoreMode,
      isSingleGroupGame: false,
      useGameStrokeShell: false,
      useStrokeScoreShell: isTeamG1Stroke,
      useMatchPlayScoreShell: isMatchPlayBoard,
      useFourballScoreShell: this._resolveFourballScoreShell(),
      isFourballPair22: false,
      isFourballPairLayout: false,
      isFourballTeamLayout: false,
      isFourball40StrokeShell: false,
      strokeShellFormatLabel: '',
      columns: isMatchPlayBoard ? buildG5Columns() : buildColumns(),
      groupId: groupId || '',
      gameFinished: matchGroup
        ? matchStatus.getMatchStatus(matchGroup, { source: 'groups' }).isCompleted
        : matchStatus.getMatchStatus(group, { source: 'groups' }).isCompleted,
      moreMenuItems: isTeamInternalScoreMatchContext(ms)
        ? filterTeamMatchScoreMoreMenuItems(
            resolveMoreMenuPanels('individual_stroke').moreMenuItems,
            { isMatchPlayBoard: isMatchPlayBoard }
          )
        : resolveMoreMenuPanels('individual_stroke').moreMenuItems,
      scoringMode: 'stroke',
      layoutType: 'standard',
      playerCount: this._playersSource.length || 4,
      bestRoster: [],
      isTeeStickyVisible: false,
      isMatchPlayTeeStickyVisible: false,
      matchPlayHoleParNormalStyle: 'transform: translateX(0px);',
      isMatchPlayPairLayout: false,
      matchPlayIdentityCollapseProgress: 0,
      matchPlayTrackInnerStyle: 'transform: translateX(0px);',
      isHoleParCompact: false,
      holeParNormalStyle: 'transform: translateX(0px);',
      // G5 显示个人比洞赛；G6/G7/G8 显示赛制名；G1 及其他个人行保持个人比杆赛
      'match.format': formatLabel
    });
    if (ms) this.buildGameContextFromMatchState(ms);
    // Context 若带回 course.gameMode，再校正一次比洞文案（避免被其它路径盖成比杆）
    if (isMatchPlayBoard) {
      this.setData({
        isG5MatchPlay: true,
        isMatchPlayScoreMode: true,
        useMatchPlayScoreShell: true,
        isMatchPlayTeeStickyVisible: false,
        matchPlayHoleParNormalStyle: 'transform: translateX(0px);',
        matchPlayIdentityCollapseProgress: 0,
        matchPlayTrackInnerStyle: 'transform: translateX(0px);',
        columns: buildG5Columns(),
        'match.format': formatLabel,
        'gameContext.format': formatLabel
      });
    }
    this.refreshPlayers();
  },

  /**
   * LIVE 改 2+2/4+0 后：按当前 match.strokeCompositionMode 重对齐 scoreEntities，
   * 与普通创建保存后的结构一致，再 hydrate → entitiesView（复用既有 team/pair UI）。
   * 不改 teamScoresByEntity 成绩内容。
   */
  _ensureG2G3ScoreEntitiesAligned(match) {
    if (!match || !match.matchId) return match;
    const kind = resolveStrokeKind(resolveGameMode(match));
    if (kind !== 'g2g3') return match;
    const prev = match.scoreEntities;
    const next = syncStrokeEntities(match);
    if (!this._scoreEntitiesMetaEqual(prev, next)) {
      match.scoreEntities = next;
      teamMatchStore.saveMatch(match);
      console.log('[stroke_entity] resync scoreEntities', {
        matchId: match.matchId,
        compositionMode: resolveCompositionMode(match)
      });
    } else {
      match.scoreEntities = next;
    }
    return match;
  },

  /** 仅比较展示相关字段：entityId / members / compositionMode / entityType */
  _scoreEntitiesMetaEqual(a, b) {
    const norm = (map) => {
      const src =
        map && typeof map === 'object' && !Array.isArray(map) ? map : {};
      const out = {};
      Object.keys(src)
        .sort()
        .forEach((gid) => {
          const list = Array.isArray(src[gid]) ? src[gid] : [];
          out[gid] = list
            .map((e) => ({
              entityId: e && e.entityId != null ? String(e.entityId) : '',
              entityType: e && e.entityType != null ? String(e.entityType) : '',
              compositionMode:
                e && e.compositionMode != null ? String(e.compositionMode) : '',
              members: (Array.isArray(e && e.members) ? e.members : [])
                .map((m) => {
                  if (m == null) return '';
                  if (typeof m === 'string' || typeof m === 'number') return String(m).trim();
                  return m.userId != null ? String(m.userId).trim() : '';
                })
                .filter(Boolean)
            }))
            .sort((x, y) => String(x.entityId).localeCompare(String(y.entityId)));
        });
      return out;
    };
    try {
      return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
    } catch (e) {
      return false;
    }
  },

  /** entity.members → 稳定 userId 字符串列表（兼容对象成员） */
  _normalizeEntityMemberIds(members) {
    if (!Array.isArray(members)) return [];
    return members
      .map((m) => {
        if (m == null) return '';
        if (typeof m === 'string' || typeof m === 'number') return String(m).trim();
        if (typeof m === 'object') {
          const id = m.userId != null ? m.userId : m.playerId != null ? m.playerId : m.id;
          return id != null ? String(id).trim() : '';
        }
        return '';
      })
      .filter(Boolean);
  },

  /**
   * Patch-02B/02C1：球队赛 Stroke Entity 记分入口（G2/G3/G4）
   * 读取 scoreEntities + teamScoresByEntity → _entitiesSource → entitiesView（本阶段仅展示）
   */
  initStrokeEntityMode(groupId) {
    const ms = this._matchState || this._readMatchState() || {};
    const matchId = (ms && ms.matchId) || '';
    const gid = groupId || (ms && ms.groupId) || this.data.groupId || '';
    let match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    match = this._ensureG2G3ScoreEntitiesAligned(match) || match;
    const gameMode = this._resolveTeamMatchGameMode(match, ms);
    this._entitiesSource = this._hydrateTeamMatchEntityFromSession(match, gid) || [];
    // G2/G3/G4 队内赛记分页：与 G1 相同隐藏「修改半场」（赛事级 M 已有）
    const entityMoreMenu = isTeamInternalScoreMatchContext(ms)
      ? filterTeamMatchScoreMoreMenuItems(MORE_MENU_ITEMS_COMPACT.slice(), {
          isMatchPlayBoard: isMatchPlayBoardMode(gameMode)
        })
      : MORE_MENU_ITEMS_COMPACT.slice();
    this.setData({
      mode: 'stroke_entity',
      groupId: gid,
      isMatchPlayScoreMode: isMatchPlayScoreMode(gameMode),
      isG5MatchPlay: false,
      isSingleGroupGame: false,
      useGameStrokeShell: false,
      useStrokeScoreShell: false,
      useMatchPlayScoreShell: false,
      useFourballScoreShell: this._resolveFourballScoreShell(),
      isFourballPair22: false,
      isFourballTeamLayout: false,
      isFourballPairLayout: false,
      isFourball40StrokeShell: false,
      strokeShellFormatLabel: '',
      matchSidesView: [],
      moreMenuItems: entityMoreMenu
    });
    // 与 individual_stroke 一致：顶栏/Context Panel 继承 matchState.course（创建时快照）
    this.buildGameContextFromMatchState(ms);
    this.refreshEntities();
    console.log('[stroke_entity] init', {
      matchId: matchId,
      groupId: gid,
      mode: 'stroke_entity',
      compositionMode: match ? resolveCompositionMode(match) : '',
      entityCount: (this._entitiesSource || []).length
    });
  },

  /** 报名名单 userId → 展示名（仅展示用） */
  _resolveEntityMemberNameMap() {
    const ms = this._matchState || this._readMatchState() || {};
    const matchId = (ms && ms.matchId) || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const users =
      match && match.registerInfo && Array.isArray(match.registerInfo.users)
        ? match.registerInfo.users
        : [];
    const map = {};
    users.forEach((user) => {
      if (!user) return;
      const uid = user.userId != null ? String(user.userId).trim() : '';
      if (!uid) return;
      const name =
        (user.competitionName && String(user.competitionName).trim()) ||
        (user.matchNickname && String(user.matchNickname).trim()) ||
        (user.nickname && String(user.nickname).trim()) ||
        (user.name && String(user.name).trim()) ||
        uid;
      map[uid] = name;
    });
    return map;
  },

  /** 队内赛记分行第一列：赛制标题（team 样式用） */
  _resolveEntityTeamLabel(match) {
    const gameMode = String(
      (match && (match.gameMode || match.selectedGameMode)) ||
        ((this._matchState || {}).course && (this._matchState || {}).course.gameMode) ||
        ''
    );
    if (gameMode.indexOf('最佳球位') >= 0) return '最佳球位';
    if (gameMode.indexOf('四人四球') >= 0) return '四人四球';
    if (gameMode.indexOf('最好成绩') >= 0) return '最好成绩';
    if (gameMode.indexOf('四人两球') >= 0) return '四人两球';
    return '组合';
  },

  /**
   * 第一列 kind：
   * - G4（entityType=pair / 四人两球）：永远 pair
   * - G2/G3：认 match.strokeCompositionMode；2+2 下按 members.length 区分 pair/single（对齐普通局面 2+1）
   *   不用旧 entity.compositionMode 覆盖当前比赛组合模式（LIVE 2+2→4+0）
   */
  _resolveEntityRowKind(entity, match) {
    const entityType = entity && entity.entityType ? String(entity.entityType) : '';
    const gameMode = String(
      (match && (match.gameMode || match.selectedGameMode)) || ''
    );
    if (entityType === 'pair' || gameMode === '四人两球比杆赛') {
      return 'pair';
    }
    const compositionMode = resolveCompositionMode(match);
    if (compositionMode === '2+2') {
      const n = Array.isArray(entity && entity.members) ? entity.members.length : 0;
      if (n === 1) return 'single';
      return 'pair';
    }
    return 'team';
  },

  /** groups.players 座位上的展示兜底（LIVE 与报名同源 userId） */
  _findGroupPlayerFallback(match, userId) {
    const uid = String(userId || '').trim();
    if (!uid || !match || !Array.isArray(match.groups)) return null;
    for (let i = 0; i < match.groups.length; i++) {
      const players = Array.isArray(match.groups[i] && match.groups[i].players)
        ? match.groups[i].players
        : [];
      for (let j = 0; j < players.length; j++) {
        const p = players[j];
        if (!p) continue;
        const id = String(p.userId || p.playerId || p.id || '').trim();
        if (id && isSameUserIdentity(id, uid)) return p;
      }
    }
    return null;
  },

  /** 成员展示列表（含头像）；空成员保留为空数组；与普通创建 / LIVE 共用 */
  _buildEntityMemberDisplay(entity, match, nameMap) {
    const members = this._normalizeEntityMemberIds(entity && entity.members);
    return members
      .map((id) => {
        const key = id != null ? String(id).trim() : '';
        if (!key) return null;
        const groupPlayer = this._findGroupPlayerFallback(match, key) || {};
        const profile = this._buildScoreTeamMatchPlayerProfile(match, key, groupPlayer);
        const name =
          (nameMap && nameMap[key]) ||
          (profile && profile.name) ||
          (groupPlayer.name || groupPlayer.nickname || groupPlayer.competitionName) ||
          key ||
          '球员';
        const avatarRaw =
          (profile && profile.avatar) ||
          groupPlayer.avatar ||
          groupPlayer.avatarUrl ||
          '';
        const tPosition = isEditTeeKey(groupPlayer.tPosition)
          ? groupPlayer.tPosition
          : isEditTeeKey(groupPlayer.tee)
            ? groupPlayer.tee
            : '';
        const gender = resolveScoreDisplayGender(
          {
            gender: (profile && profile.gender) || groupPlayer.gender || '',
            matchGender: (profile && profile.matchGender) || groupPlayer.matchGender || ''
          },
          key
        );
        return {
          userId: key,
          name: this._shortName(name) || name || '球员',
          avatar: mockAvatars.resolveAvatar(avatarRaw, key),
          tPosition: tPosition,
          gender: gender
        };
      })
      .filter(Boolean);
  },

  _buildEntityPairMembers(memberDisplay, paletteStart) {
    const PAIR_LEFT = ['24rpx', '128rpx'];
    const list = Array.isArray(memberDisplay) ? memberDisplay.slice(0, 2) : [];
    let gpos = paletteStart || 0;
    return list.map((m, mi) => {
      const style = resolveScoreTeeStyle(m, gpos);
      gpos += 1;
      return {
        name: (m && m.name) || '球员',
        avatar: (m && m.avatar) || '',
        teeColor: style.teeColor,
        left: PAIR_LEFT[mi] || 24 + mi * 104 + 'rpx',
        tf: mi === 1 ? 'translateX(var(--pair-second-shift, 0rpx))' : 'none'
      };
    });
  },

  /** @deprecated 保留兼容；展示以 kind / pairMembers / label 为准 */
  _buildEntityDisplayName(entity, index, nameMap) {
    const type = entity && entity.entityType ? String(entity.entityType) : '';
    const members = Array.isArray(entity && entity.members) ? entity.members : [];
    if (type === 'pair') {
      const names = members
        .map((id) => {
          const key = id != null ? String(id).trim() : '';
          return (nameMap && nameMap[key]) || key || '球员';
        })
        .filter(Boolean);
      return names.length ? names.join(' + ') : '组合';
    }
    const names = members
      .map((id) => {
        const key = id != null ? String(id).trim() : '';
        return (nameMap && nameMap[key]) || key || '';
      })
      .filter(Boolean);
    return names.length ? names.join(' + ') : '组合';
  },

  /**
   * Patch-02C1：_entitiesSource → entitiesView
   * 第一列复用 fourball 的 single/pair/team 视觉字段（kind / avatar / pairMembers）
   */
  refreshEntities() {
    const displayMode = this.data.scoreDisplayMode;
    const nameMap = this._resolveEntityMemberNameMap();
    const ms = this._matchState || this._readMatchState() || {};
    const matchId = (ms && ms.matchId) || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const gameMode = this._resolveTeamMatchGameMode(match, ms);
    const matchPlayScoreMode = isMatchPlayScoreMode(gameMode);
    const teamLabel = this._resolveEntityTeamLabel(match);
    let palettePos = 0;

    const entitiesView = (this._entitiesSource || []).map((entity, index) => {
      const entityId = entity && entity.entityId != null ? String(entity.entityId) : '';
      const entityType = entity && entity.entityType ? String(entity.entityType) : '';
      const members = Array.isArray(entity && entity.members) ? entity.members.slice() : [];
      const kind = this._resolveEntityRowKind(entity, match);
      const memberDisplay = this._buildEntityMemberDisplay(entity, match, nameMap);
      const memberNamesText = memberDisplay.map((m) => m.name).filter(Boolean).join(' / ');
      let pairMembers = [];
      let avatar = '';
      let name = '';
      let label = teamLabel;
      let colorClass = '';
      let isSingle = false;

      if (kind === 'pair') {
        pairMembers = this._buildEntityPairMembers(memberDisplay, palettePos);
        palettePos += Math.max(pairMembers.length, 1);
        name = memberNamesText || '组合';
        avatar = (pairMembers[0] && pairMembers[0].avatar) || '';
      } else if (kind === 'single') {
        const m0 = memberDisplay[0] || {};
        const style = resolveScoreTeeStyle(m0, palettePos);
        colorClass = style.colorClass;
        palettePos += 1;
        isSingle = true;
        name = m0.name || '球员';
        avatar = m0.avatar || '';
        label = name;
      } else {
        // team：按赛制标题，不按成员数
        palettePos += Math.max(memberDisplay.length, 1);
        name = memberNamesText || teamLabel;
        avatar = (memberDisplay[0] && memberDisplay[0].avatar) || '';
        label = teamLabel;
      }

      const displayName =
        kind === 'team'
          ? label
          : kind === 'pair'
            ? memberDisplay.map((m) => m.name).filter(Boolean).join(' + ') || '组合'
            : name;

      const scores = Array.isArray(entity && entity.scores) ? entity.scores.slice() : [];
      const putts = Array.isArray(entity && entity.putts) ? entity.putts.slice() : [];
      const enriched = enrichPlayer(
        {
          id: entityId,
          playerId: entityId,
          name: displayName,
          scores: scores,
          putts: putts,
          avatar: avatar || ''
        },
        index,
        displayMode,
        { hideCorners: matchPlayScoreMode }
      );
      let total = 0;
      let filled = 0;
      scores.forEach((s) => {
        if (isFilledScore(s)) {
          total += Number(s);
          filled += 1;
        }
      });
      const diff = enriched.relScore;
      return {
        entityId: entityId,
        entityType: entityType,
        kind: kind,
        isSingle: isSingle,
        label: label,
        name: name,
        avatar: avatar,
        colorClass: colorClass,
        pairMembers: pairMembers,
        memberDisplay: memberDisplay,
        members: memberDisplay.map((m) => ({
          userId: m.userId,
          name: m.name
        })),
        memberNamesText: memberNamesText,
        displayName: displayName,
        scores: scores,
        putts: putts,
        total: filled > 0 ? total : '',
        diff: diff,
        relScoreStr: enriched.relScoreStr,
        relClass: enriched.relClass,
        teamDiffStr: enriched.relScoreStr,
        teamDiffClass: enriched.relClass,
        cells: enriched.cells
      };
    });

    const hasPair = entitiesView.some((row) => row && row.kind === 'pair');
    const colStartW = hasPair ? 344 : 300;
    const scoreboardStyle = this._buildScoreboardStyleVars({
      colWidth: colStartW,
      bestDiffGrow: 1
    });
    const bestRoster = this._buildEntityRosterFromEntitiesView(entitiesView);
    // 4+0 → game-single fourball40；2+2/2+1 → pair shell；互斥
    const useEntityFourball40Shell = this._resolveStrokeEntityFourball40Shell(
      match,
      entitiesView
    );
    const useEntityFourballShell =
      !useEntityFourball40Shell && this._resolveStrokeEntityFourballShell(entitiesView);
    const patch = {
      entitiesView: entitiesView,
      bestRoster: bestRoster,
      scoreboardStyle: scoreboardStyle,
      isMatchPlayScoreMode: matchPlayScoreMode,
      isG5MatchPlay: false,
      matchSidesView: [],
      mode: 'stroke_entity',
      useStrokeScoreShell: useEntityFourball40Shell,
      useMatchPlayScoreShell: false,
      useFourballScoreShell: useEntityFourballShell,
      isFourball40StrokeShell: useEntityFourball40Shell,
      strokeShellFormatLabel: useEntityFourball40Shell ? teamLabel : ''
    };
    if (useEntityFourball40Shell) {
      patch.playersView = this._buildFourball40PlayersViewFromEntities(
        entitiesView,
        teamLabel,
        displayMode
      );
      patch.bestRoster = padBestRosterFourSlots(bestRoster);
      patch.scoreboardStyle = this._buildScoreboardStyleVars({
        colWidth: G1_IDENTITY_COL_WIDTH,
        paddingX: 12,
        diffOpacity: 1,
        nameWidth: 96
      });
      patch.isFourballPair22 = false;
      patch.isFourballPairLayout = false;
      patch.isTeeStickyVisible = false;
      patch.isHoleParCompact = false;
      patch.holeParNormalStyle = 'transform: translateX(0px);';
    } else if (useEntityFourballShell) {
      const entityPairFlags = resolveFourballPairFlags(
        entitiesView.map((row) => ({ members: (row && row.members) || [] }))
      );
      patch.fourballRowsView = this._buildFourballRowsViewFromEntities(entitiesView);
      patch.isFourballPair22 = entityPairFlags.isFourballPair22;
      patch.isFourballPairLayout = entityPairFlags.isFourballPairLayout;
      patch.fourballTeeStickyVisible = false;
      patch.fourballScrollLeft = 0;
      patch.fourballIdentityCollapseProgress = 0;
      patch.fourballTrackInnerStyle = 'transform: translateX(0px);';
      patch.fourballHoleParOffsetX = 0;
    }
    this.setData(this._attachM2ScoreboardToPatch(patch));
  },

  /**
   * 4+0 / 3+0 / 3+1：用个人比杆 enrichPlayer 派生成绩行（一组一行；演示态灌入原型洞差）。
   * 展示只含当前有效 members 的组：空组不生成身份行/成绩行（engine 成绩槽仍保留）。
   * 不改 _engineGroups / compositionType / teamScores。
   */
  _buildFourball40PlayersView(displayMode, formatLabel, hasMatch) {
    const groups = this._engineGroups || [];
    const label = String(formatLabel || '').trim() || '最佳球位';
    const pars = holePars();
    const demoScores = BEST_PATTERN.map((diff, hi) => Number(pars[hi]) + Number(diff));
    const demoPutts = demoScores.map(() => 2);
    const list = groups.length
      ? groups
      : [{ id: 'demo-team', members: (this._playersSource || []).slice(0, 4), scores: [], putts: [] }];
    const rows = list
      .map((g, engineIdx) => ({ g: g, engineIdx: engineIdx }))
      .filter((x) => (((x.g && x.g.members) || []).length > 0))
      .map((x) => {
      const g = x.g;
      const gi = x.engineIdx;
      let scores = Array.isArray(g.scores) ? g.scores.slice() : [];
      let putts = Array.isArray(g.putts) ? g.putts.slice() : [];
      if (!hasMatch && !scores.some(isFilledScore)) {
        scores = demoScores.slice();
        putts = demoPutts.slice();
      }
      const members = ((g && g.members) || []).slice(0, 4);
      const isSingleRow = members.length === 1;
      // 3+1 单人行：与个人比杆同一 enrichPlayer 路径——席位 name / avatar / T
      if (isSingleRow) {
        const m0 = members[0] || {};
        const pid = (m0 && (m0.playerId || m0.id || m0.userId)) || '';
        const sourcePlayer = this._findPlayersSourceById(pid) || m0;
        const sourceIdx = (this._playersSource || []).findIndex(
          (p) => p && isSameUserIdentity(p.playerId || p.id || p.userId, pid)
        );
        const style = resolveScoreTeeStyle(sourcePlayer, sourceIdx >= 0 ? sourceIdx : gi * 4);
        const enriched = enrichPlayer(
          {
            id: (g && g.id) || 'team-' + gi,
            name: (sourcePlayer && sourcePlayer.name) || (m0 && m0.name) || '球员',
            avatar: (sourcePlayer && sourcePlayer.avatar) || (m0 && m0.avatar) || '',
            colorClass: style.colorClass || 'border-light',
            tPosition: sourcePlayer.tPosition || m0.tPosition || '',
            gender: sourcePlayer.gender || m0.gender || '',
            scores: scores,
            putts: putts
          },
          gi,
          displayMode
        );
        return Object.assign({}, enriched, {
          rowKind: 'single',
          teeSegments: [],
          sourceGroupIndex: gi
        });
      }
      // 合成 T 线：复用既有 resolveScoreTeeStyle / TEE_PALETTE（与 Legacy 4+0 teamMembers 一致）
      const teeSegments = members.map((m, mi) => {
        const style = resolveScoreTeeStyle(m, gi * 4 + mi);
        const palette = TEE_PALETTE[mi % TEE_PALETTE.length];
        const hasExplicitTee = !!(m && (isEditTeeKey(m.tPosition) || isEditTeeKey(m.tee)));
        return {
          key: 'tee-' + gi + '-' + mi,
          teeColor: hasExplicitTee
            ? style.teeColor || (palette && palette.teeColor) || ''
            : (palette && palette.teeColor) || style.teeColor || ''
        };
      });
      const m0 = members[0] || {};
      const style = resolveScoreTeeStyle(m0, gi);
      const enriched = enrichPlayer(
        {
          id: (g && g.id) || 'team-' + gi,
          name: label,
          avatar: '',
          colorClass: style.colorClass || 'border-light',
          scores: scores,
          putts: putts
        },
        gi,
        displayMode
      );
      return Object.assign({}, enriched, {
        rowKind: 'team',
        teeSegments: teeSegments,
        sourceGroupIndex: gi
      });
    });
    // 3+1：TEAM SCORE 在上、单人在下（点格用 sourceGroupIndex → _engineGroups）
    const teamRows = rows.filter((r) => r && r.rowKind === 'team');
    const singleRows = rows.filter((r) => r && r.rowKind === 'single');
    return teamRows.concat(singleRows);
  },

  /**
   * fourball 无组合形态时的 UI fallback：个人比杆壳 + 每人一行（头像/昵称）。
   * 成绩仍挂原 team（sourceGroupIndex → _engineGroups）；不改 compositionType。
   */
  _buildFourballIndividualFallbackPlayersView(displayMode, hasMatch) {
    const groups = this._engineGroups || [];
    const pars = holePars();
    const demoScores = BEST_PATTERN.map((diff, hi) => Number(pars[hi]) + Number(diff));
    const demoPutts = demoScores.map(() => 2);
    return groups
      .map((g, engineIdx) => ({ g: g, engineIdx: engineIdx }))
      .filter((x) => (((x.g && x.g.members) || []).length === 1))
      .map((x) => {
        const g = x.g;
        const gi = x.engineIdx;
        let scores = Array.isArray(g.scores) ? g.scores.slice() : [];
        let putts = Array.isArray(g.putts) ? g.putts.slice() : [];
        if (!hasMatch && !scores.some(isFilledScore)) {
          scores = demoScores.slice();
          putts = demoPutts.slice();
        }
        const m0 = (g.members || [])[0] || {};
        const pid = (m0 && (m0.playerId || m0.id || m0.userId)) || '';
        const sourcePlayer = this._findPlayersSourceById(pid) || m0;
        const sourceIdx = (this._playersSource || []).findIndex(
          (p) => p && isSameUserIdentity(p.playerId || p.id || p.userId, pid)
        );
        const style = resolveScoreTeeStyle(sourcePlayer, sourceIdx >= 0 ? sourceIdx : gi * 4);
        const enriched = enrichPlayer(
          {
            id: (g && g.id) || 'team-' + gi,
            name: (sourcePlayer && sourcePlayer.name) || (m0 && m0.name) || '球员',
            avatar: (sourcePlayer && sourcePlayer.avatar) || (m0 && m0.avatar) || '',
            colorClass: style.colorClass || 'border-light',
            tPosition: sourcePlayer.tPosition || m0.tPosition || '',
            gender: sourcePlayer.gender || m0.gender || '',
            scores: scores,
            putts: putts
          },
          gi,
          displayMode
        );
        return Object.assign({}, enriched, {
          rowKind: 'single',
          teeSegments: [],
          sourceGroupIndex: gi
        });
      });
  },

  /**
   * 从 match.scoreEntities + scoreData[groupId].teamScoresByEntity 构建 _entitiesSource
   * 成绩主键：teamScoresByEntity[].teamId === scoreEntities[].entityId（兼容 Game 的 teamId 字段名）
   */
  _hydrateTeamMatchEntityFromSession(match, groupId) {
    const gid = groupId != null ? String(groupId) : '';
    if (!match || !gid) {
      console.log('[stroke_entity] hydrate', { ok: false, reason: 'missing_match_or_groupId', groupId: gid });
      return [];
    }
    const scoreEntities =
      match.scoreEntities && typeof match.scoreEntities === 'object' && !Array.isArray(match.scoreEntities)
        ? match.scoreEntities
        : {};
    // 展示层：跳过 members=[] 的空组合行；不删 scoreEntities / teamScoresByEntity
    const metaList = (Array.isArray(scoreEntities[gid]) ? scoreEntities[gid] : []).filter(
      (entity) =>
        entity && Array.isArray(entity.members) && entity.members.length > 0
    );
    const groupScoreData =
      match.scoreData && match.scoreData[gid] && typeof match.scoreData[gid] === 'object'
        ? match.scoreData[gid]
        : {};
    const teamScoresByEntity = Array.isArray(groupScoreData.teamScoresByEntity)
      ? groupScoreData.teamScoresByEntity
      : [];
    const scoreByKey = {};
    teamScoresByEntity.forEach((rec) => {
      if (!rec || typeof rec !== 'object') return;
      // 主键：teamId（与普通 Game teamScoresByEntity 字段兼容）；可选 entityId 仅作回退读取
      const key =
        rec.teamId != null && String(rec.teamId).trim() !== ''
          ? String(rec.teamId).trim()
          : rec.entityId != null && String(rec.entityId).trim() !== ''
            ? String(rec.entityId).trim()
            : '';
      if (!key) return;
      scoreByKey[key] = rec;
    });

    const entities = metaList.map((meta) => {
      const entityId = meta && meta.entityId != null ? String(meta.entityId).trim() : '';
      const rec = entityId && scoreByKey[entityId] ? scoreByKey[entityId] : {};
      const members = this._normalizeEntityMemberIds(meta && meta.members);
      return {
        entityId: entityId,
        entityType: meta && meta.entityType ? String(meta.entityType) : '',
        members: members,
        compositionMode: meta && meta.compositionMode != null ? String(meta.compositionMode) : '',
        teamGroupId: meta && meta.teamGroupId != null ? String(meta.teamGroupId) : '',
        scores: Array.isArray(rec.scores) ? rec.scores.slice() : [],
        putts: Array.isArray(rec.putts) ? rec.putts.slice() : [],
        fairways: sliceFairways(rec.fairways),
        penalties: slicePenalties(rec.penalties),
        sands: sliceSands(rec.sands)
      };
    }).filter((entity) => entity && entity.members && entity.members.length > 0);

    console.log('[stroke_entity] hydrate', {
      matchId: match.matchId || '',
      groupId: gid,
      compositionMode: resolveCompositionMode(match),
      entityCount: entities.length,
      memberCounts: entities.map((e) => (e.members || []).length),
      scoreRecordCount: teamScoresByEntity.length
    });
    return entities;
  },

  /**
   * 将 _entitiesSource 写入 match.scoreData[groupId].teamScoresByEntity
   * teamId 字段存 entityId（兼容已有 Game 结构字段名，不改模型）
   * 按 entityId merge：当前 source 覆盖；source 未含的历史行（如空 members 被 hydrate 过滤）保留。
   */
  _persistTeamMatchEntityScores(match, groupId) {
    if (!match || !match.matchId || !groupId) return false;
    match.scoreData =
      match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
        ? match.scoreData
        : {};
    const groupScoreData =
      match.scoreData[groupId] && typeof match.scoreData[groupId] === 'object'
        ? match.scoreData[groupId]
        : {};
    const scoresByPlayer =
      groupScoreData.scoresByPlayer && typeof groupScoreData.scoresByPlayer === 'object'
        ? groupScoreData.scoresByPlayer
        : {};
    const existingList = Array.isArray(groupScoreData.teamScoresByEntity)
      ? groupScoreData.teamScoresByEntity
      : [];
    const byId = {};
    existingList.forEach((rec) => {
      if (!rec || typeof rec !== 'object') return;
      const key =
        rec.teamId != null && String(rec.teamId).trim() !== ''
          ? String(rec.teamId).trim()
          : rec.entityId != null && String(rec.entityId).trim() !== ''
            ? String(rec.entityId).trim()
            : '';
      if (!key) return;
      byId[key] = {
        teamId: key,
        scores: Array.isArray(rec.scores) ? rec.scores.slice() : [],
        putts: Array.isArray(rec.putts) ? rec.putts.slice() : [],
        fairways: Array.isArray(rec.fairways) ? rec.fairways.slice() : [],
        penalties: Array.isArray(rec.penalties) ? rec.penalties.slice() : [],
        sands: Array.isArray(rec.sands) ? rec.sands.slice() : []
      };
    });
    (this._entitiesSource || []).forEach((entity) => {
      if (!entity || !entity.entityId) return;
      const key = String(entity.entityId).trim();
      if (!key) return;
      byId[key] = {
        teamId: key,
        scores: Array.isArray(entity.scores) ? entity.scores.slice() : [],
        putts: Array.isArray(entity.putts) ? entity.putts.slice() : [],
        fairways: Array.isArray(entity.fairways) ? entity.fairways.slice() : [],
        penalties: Array.isArray(entity.penalties) ? entity.penalties.slice() : [],
        sands: Array.isArray(entity.sands) ? entity.sands.slice() : []
      };
    });
    const teamScoresByEntity = Object.keys(byId).map((id) => byId[id]);
    const preserved = teamMatchStore.normalizeGroupScoreBucket(groupScoreData);
    const next = {
      scoresByPlayer: scoresByPlayer,
      teamScoresByEntity: teamScoresByEntity,
      scoresBySide: preserved.scoresBySide
    };
    if (preserved.matchPlayMeta) next.matchPlayMeta = preserved.matchPlayMeta;
    if (preserved.firstScoreAt != null) next.firstScoreAt = preserved.firstScoreAt;
    if (preserved.finishedScoreAt != null) next.finishedScoreAt = preserved.finishedScoreAt;
    teamMatchStore.ensureGroupScoreBucketFirstScoreAt(next);
    teamMatchStore.ensureGroupScoreBucketFinishedScoreAt(next);
    match.scoreData[groupId] = next;
    teamMatchStore.saveMatch(match);
    console.log('[stroke_entity] persist', {
      matchId: match.matchId || '',
      groupId: groupId,
      entityCount: teamScoresByEntity.length
    });
    return true;
  },

  // Game 模式：球员来源 = 该组 playersSlots，所有记分格初始化为空（支持单组/多组）
  initGameMode(gameId, groupIndex) {
    const game = gameStore.getGame(gameId);
    const matchState = this._matchState || this._readMatchState();
    const menuPanels = resolveNormalGameMoreMenu(gameId, matchState);
    const groupCount = resolveScorePageGroupCount(gameId, matchState);
    const gameModeLabel = String((game && game.gameMode) || '').trim();
    const formatType = String((matchState && matchState.formatType) || '').trim();
    // 个人比杆（排除四人两球 / 最佳球位等）
    const isIndividualStrokeScore =
      gameModeLabel === '个人比杆赛' || formatType === 'individual_stroke';
    // 成绩槽位：仅单组；UI shell：普通创建个人比杆（单/多组）
    const isSingleGroupGame = groupCount <= 1 && isIndividualStrokeScore;
    const useGameStrokeShell = isIndividualStrokeScore;
    const useStrokeScoreShell = isIndividualStrokeScore;
    const group = this._loadPlayersFromGameGroup(gameId, groupIndex, {
      colorClasses: true,
      preferScoresBySlot: isSingleGroupGame
    });
    const ms = matchStatus.getMatchStatus(group, { source: 'game' });
    this.setData({
      mode: 'game',
      gameId: gameId,
      gameGroupIndex: groupIndex,
      groupId: gameId + ':' + groupIndex,
      gameFinished: ms.isCompleted,
      moreMenuItems: menuPanels.moreMenuItems,
      scoresCompleted: gameProgress.isScoringCompleted(game, groupIndex),
      scoringMode: 'stroke',
      layoutType: 'standard',
      playerCount: this._playersSource.length || 4,
      isSingleGroupGame: isSingleGroupGame,
      useGameStrokeShell: useGameStrokeShell,
      useStrokeScoreShell: useStrokeScoreShell,
      useMatchPlayScoreShell: false,
      useFourballScoreShell: this._resolveFourballScoreShell(),
      isFourballPair22: false,
      isFourballPairLayout: false,
      isFourballTeamLayout: false,
      isFourball40StrokeShell: false,
      strokeShellFormatLabel: '',
      isTeeStickyVisible: false,
      isHoleParCompact: false,
      holeParNormalStyle: 'transform: translateX(0px);',
      'match.format': game && game.gameMode ? game.gameMode : '个人比杆赛',
      'match.course': game ? game.courseName || '' : ''
    });
    // 轻量 Context Panel：单组 / 多组均展示（仅 createGame metadata + 天气）
    this.buildGameContext(game);
    this.refreshPlayers();
  },

  // 构建只读 Context 面板数据（严格只读 createGame metadata：题目/球场/赛制/时间/天气）
  // 信息层级隔离：禁止读取 playersSlots / score / leaderboard 等球员相关数据
  // Context Panel 数据装配：只读取 createGame（创建时事实数据）——球场(含半场) / 比赛名称 / 赛制 / 开球时间。
  // 严禁读取 score / players runtime / group / leaderboard / UI runtime 等任何状态。
  buildGameContext(game) {
    if (!game) return;
    const courseName = game.courseName || '';
    const halfText = game.courseHalfText || '';
    // 球场含半场，单行展示，例如：北京乡村高尔夫俱乐部（A+B场）
    const courseFull = courseName
      ? (halfText ? courseName + '（' + halfText + '）' : courseName)
      : '';
    const isPrivate = game.visibility === 'private';
    this.setData({
      gameContext: {
        ready: true,
        courseFull: courseFull,
        title: game.roundName || courseName || '高尔夫球局',
        format: game.gameMode || '个人比杆赛',
        teeTime: game.teeTime || '',
        weather: { loading: true, line: '加载中…' },
        isPrivate: isPrivate,
        // 仅复用创建时生成的密码，绝不重新生成
        accessCode: isPrivate ? (game.accessCode || '') : ''
      }
    });
    this.fetchWeather();
  },

  // 实时天气（第三方 Open-Meteo）：定位 → 查询 → 单行纯文本回填；失败不伪造数据
  fetchWeather() {
    weatherService.getCurrentByLocation().then((w) => {
      if (w && w.ok) {
        let line = w.temp + '°C ' + w.text;
        if (w.wind !== null && w.wind !== undefined) line += ' · 风 ' + w.wind + 'km/h';
        if (w.humidity !== null && w.humidity !== undefined) line += ' · 湿度 ' + w.humidity + '%';
        this.setData({ 'gameContext.weather': { loading: false, line: line } });
      } else {
        this.setData({ 'gameContext.weather': { loading: false, line: '暂不可用' } });
      }
    });
  },

  // 复制围观密码：仅复制 accessCode，复制成功提示“已复制”
  copyAccessCode() {
    const code = this.data.gameContext && this.data.gameContext.accessCode;
    if (!code) return;
    wx.setClipboardData({
      data: String(code),
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  onReady() {
    this.initHeaderNav();
  },

  // 只读取全局主题并渲染，本页不允许修改主题
  onShow() {
    this.applyTheme(getApp().getTheme());
    this._syncFontScale();
    if (this.data.gameId && !this.data.noMatch) {
      this._refreshScorePageFromGame();
    } else if (this.data.gameId) {
      this._syncGameFinishedState();
      this._maybeShowEndGroupPrompt();
    } else {
      this._maybeRefreshTeamMatchScoreMode();
      this._syncScoreFinishedUiState();
    }
  },

  /**
   * 队内赛：
   * - mode 变化时切换 individual_stroke / stroke_entity
   * - 已是 stroke_entity：onShow 仍重拉 Entity（LIVE 改 2+2/4+0 后对齐创建展示）
   */
  _maybeRefreshTeamMatchScoreMode() {
    if (this.data.noMatch) return;
    const ms = this._matchState || this._readMatchState();
    if (!ms || !ms.matchId) return;
    const match = teamMatchStore.getMatchById(ms.matchId);
    if (!match) return;
    const groupId = this.data.groupId || ms.groupId || '';
    const nextMode = this._resolveTeamMatchScorePageMode(match, groupId);
    if (!nextMode) return;

    // 同为 stroke_entity：不改 mode，仍对齐 Entity + hydrate + 刷新（LIVE 改 2+2/4+0）
    if (nextMode === this.data.mode && nextMode === 'stroke_entity') {
      this._matchState = ms;
      const aligned = this._ensureG2G3ScoreEntitiesAligned(match) || match;
      this._entitiesSource = this._hydrateTeamMatchEntityFromSession(aligned, groupId) || [];
      this.refreshEntities();
      this._syncMoreMenuItems();
      return;
    }

    if (nextMode === this.data.mode) return;

    const nextMs = Object.assign({}, ms, { mode: nextMode });
    if (nextMs.course && typeof nextMs.course === 'object') {
      nextMs.course = Object.assign({}, nextMs.course, {
        gameMode: match.gameMode || match.selectedGameMode || nextMs.course.gameMode || ''
      });
    }
    matchState.setMatchState(nextMs);
    this._matchState = nextMs;
    this.setData({ mode: nextMode, groupId: groupId });

    this._syncHoleLayoutFromCourse({ refresh: false });
    if (nextMode === 'stroke_entity') {
      this.initStrokeEntityMode(groupId);
    } else if (nextMode === 'individual_stroke') {
      this.initIndividualStrokeMode(groupId);
    }
    this.hydrateFromSession();
    this._syncMoreMenuItems();
  },

  /**
   * 从 gameStore 重建 matchState 并按最新赛制重新初始化记分页（修改比赛返回 / onShow 刷新）
   */
  _refreshScorePageFromGame() {
    const gameId = this.data.gameId;
    const game = gameStore.getGame(gameId);
    if (!game) return;

    const gi = this._gameGroupIndex != null ? Number(this._gameGroupIndex) || 0 : 0;
    const ms = matchState.buildFromGame(game, gi);
    matchState.setMatchState(ms);
    this._matchState = ms;

    const nextMode = this._resolvePageMode(ms);
    this.setData({
      mode: nextMode,
      formatType: ms.formatType,
      groupId: ms.groupId || gameId + ':' + gi,
      gameGroupIndex: gi,
      gameId: ms.gameId || gameId
    });

    this._syncHoleLayoutFromCourse({ refresh: false });
    this.buildGameContext(game);

    if (nextMode === 'game') {
      this.initGameMode(gameId, gi);
    } else if (nextMode === 'fourball_best') {
      this.initFourBallBestMode();
    } else if (nextMode === 'stroke_entity') {
      // 本函数主路径服务普通 Game（buildFromGame）；补齐枚举以免将来误带 stroke_entity 时落入无 init
      this.initStrokeEntityMode(ms.groupId || '');
    } else if (nextMode === 'individual_stroke') {
      this.initIndividualStrokeMode(ms.groupId || gameId);
    }

    this.hydrateFromSession();
    this._syncGameFinishedState();
    this._maybeShowEndGroupPrompt();
    this._syncMoreMenuItems();
  },

  applyTheme(theme) {
    this.setData({
      themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode'
    });
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    this.setData({
      headerTotalHeight: header.metrics.headerTotalHeight,
      headerPaddingTop: header.metrics.headerPaddingTop,
      headerPaddingRight: header.metrics.headerPaddingRight,
      headerContentHeight: header.metrics.headerContentHeight,
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle
    });
  },

  // ===== M2 Scoreboard Render Adapter（A1：只产 m2Scoreboard，不改 WXML/保存链） =====

  _m2TeeColorFromClass(colorClass) {
    const c = String(colorClass || '');
    if (c.indexOf('red') >= 0) return '#dc2626';
    if (c.indexOf('gold') >= 0) return '#ce9224';
    if (c.indexOf('light') >= 0 || c.indexOf('blue') >= 0) return '#00aeef';
    if (c.indexOf('black') >= 0) return '#111827';
    if (c.indexOf('white') >= 0) return '#ffffff';
    return '#00aeef';
  },

  _m2CompressPairNickname(members) {
    const list = Array.isArray(members) ? members : [];
    const a = list[0] && list[0].name ? String(list[0].name).trim() : '';
    const b = list[1] && list[1].name ? String(list[1].name).trim() : '';
    const initial = (s) => (s ? s.charAt(0) : '');
    if (a && b) return initial(a) + '/' + initial(b);
    if (a) return initial(a) + '…';
    return '';
  },

  _buildM2HeaderRows(columns) {
    const cols = Array.isArray(columns) ? columns : [];
    const emptyPrefix = {
      mode: 'none',
      diff: { text: '', className: '' },
      tee: { colors: [] }
    };
    return [
      {
        role: 'hole',
        fixed: { type: 'label', text: 'HOLE', kicker: '', main: 'HOLE' },
        prefix: emptyPrefix,
        cells: cols.map((c) => ({
          colIdx: c.colIdx,
          label: c.label,
          isSpecial: !!c.isSpecial,
          isTot: !!c.isTot,
          isStartHole: !!c.isStartHole
        })),
        tapMeta: { target: 'none' }
      },
      {
        role: 'par',
        fixed: { type: 'label', text: 'PAR', kicker: '', main: 'PAR' },
        prefix: emptyPrefix,
        cells: cols.map((c) => ({
          colIdx: c.colIdx,
          par: c.par,
          isSpecial: !!c.isSpecial,
          isTot: !!c.isTot
        })),
        tapMeta: { target: 'none' }
      }
    ];
  },

  /**
   * @returns {{ type: string, avatar?: string, nickname?: string, colorClass?: string,
   *   teeColor?: string, members?: Array, kicker?: string, main?: string, text?: string }}
   */
  _buildM2Identity(kind, item) {
    const row = item || {};
    const k = kind || 'single';
    if (k === 'label') {
      return {
        type: 'label',
        text: row.text || row.main || '',
        kicker: row.kicker || '',
        main: row.main || row.text || ''
      };
    }
    if (k === 'pair') {
      const members = (Array.isArray(row.pairMembers) ? row.pairMembers : []).slice(0, 2).map((m) => ({
        name: (m && m.name) || '',
        avatar: (m && m.avatar) || '',
        teeColor: (m && m.teeColor) || '#00aeef'
      }));
      return {
        type: 'pair',
        members: members,
        nickname: this._m2CompressPairNickname(members),
        avatar: (members[0] && members[0].avatar) || row.avatar || ''
      };
    }
    if (k === 'team') {
      return {
        type: 'team',
        kicker: 'TEAM SCORE',
        main: row.label || row.name || 'TEAM',
        nickname: row.name || row.label || '',
        members: Array.isArray(row.memberDisplay)
          ? row.memberDisplay.map((m) => ({
              name: (m && m.name) || '',
              avatar: (m && m.avatar) || ''
            }))
          : [],
        avatar: row.avatar || ''
      };
    }
    return {
      type: 'single',
      avatar: row.avatar || '',
      nickname: row.name || row.displayName || '',
      colorClass: row.colorClass || '',
      teeColor: this._m2TeeColorFromClass(row.colorClass)
    };
  },

  /**
   * @returns {{ mode: string, diff: { text: string, className: string }, tee: { colors: string[] } }}
   */
  _buildM2TrackPrefix(kind, item) {
    const row = item || {};
    const k = kind || 'single';
    if (k === 'label' || k === 'none') {
      return {
        mode: 'none',
        diff: { text: '', className: '' },
        tee: { colors: [] }
      };
    }
    const diffText =
      row.relScoreStr != null && row.relScoreStr !== ''
        ? String(row.relScoreStr)
        : row.teamDiffStr != null && row.teamDiffStr !== ''
          ? String(row.teamDiffStr)
          : '-';
    const diffClass = row.relClass || row.teamDiffClass || '';
    if (k === 'pair') {
      const colors = (Array.isArray(row.pairMembers) ? row.pairMembers : [])
        .slice(0, 2)
        .map((m) => (m && m.teeColor) || '#00aeef');
      while (colors.length < 2) colors.push('#00aeef');
      return {
        mode: 'pair',
        diff: { text: diffText, className: diffClass },
        tee: { colors: colors }
      };
    }
    if (k === 'team') {
      return {
        mode: 'single',
        diff: { text: diffText, className: diffClass },
        tee: { colors: [this._m2TeeColorFromClass(row.colorClass) || '#ce9224'] }
      };
    }
    return {
      mode: 'single',
      diff: { text: diffText, className: diffClass },
      tee: { colors: [this._m2TeeColorFromClass(row.colorClass)] }
    };
  },

  _buildM2ScoreRow(item, tapMeta, options) {
    const opts = options || {};
    const kind = opts.kind || (item && item.kind) || 'single';
    const cells = Array.isArray(opts.cells)
      ? opts.cells
      : Array.isArray(item && item.cells)
        ? item.cells
        : Array.isArray(item && item.columns)
          ? item.columns
          : [];
    const key =
      opts.key ||
      (item && (item.sideId || item.entityId || item.id || item.playerId)) ||
      'row';
    return {
      key: String(key),
      rowKind: opts.rowKind || 'score',
      fixed: this._buildM2Identity(kind, item),
      prefix: this._buildM2TrackPrefix(kind === 'label' ? 'none' : kind, item),
      cells: cells,
      tapMeta: tapMeta || { target: 'none' }
    };
  },

  /**
   * 从当前（或即将 setData 的）视图拼 M2 Render Model。
   * @param {object} [override] refresh 时传入的 patch 片段
   * @returns {{ headerRows: Array, scoreRows: Array }}
   */
  _buildM2ScoreboardView(override) {
    const o = override || {};
    const mode = o.mode != null ? o.mode : this.data.mode;
    const columns = Array.isArray(o.columns) ? o.columns : this.data.columns || [];
    const headerRows = this._buildM2HeaderRows(columns);
    const scoreRows = [];

    const pushStatusRow = (matchStatusView) => {
      const msv = matchStatusView || {};
      const rowCells = Array.isArray(msv.rowCells) ? msv.rowCells : [];
      scoreRows.push(
        this._buildM2ScoreRow(
          {
            kind: 'label',
            text: '胜洞走势',
            kicker: 'MATCH',
            main: '胜洞走势'
          },
          { target: 'none' },
          {
            key: 'match-status',
            kind: 'label',
            rowKind: 'status',
            cells: rowCells
          }
        )
      );
      // label 行 prefix 应为 none
      const last = scoreRows[scoreRows.length - 1];
      last.fixed = {
        type: 'label',
        text: '胜洞走势',
        kicker: 'MATCH',
        main: '胜洞走势'
      };
      last.prefix = {
        mode: 'none',
        diff: { text: '', className: '' },
        tee: { colors: [] }
      };
    };

    if (mode === 'fourball_best') {
      const teams = Array.isArray(o.bestTeams) ? o.bestTeams : this.data.bestTeams || [];
      teams.forEach((team, gIdx) => {
        if (!team) return;
        const kind = team.kind || 'team';
        scoreRows.push(
          this._buildM2ScoreRow(team, { target: 'player', index: gIdx }, {
            key: team.id || 'best-' + gIdx,
            kind: kind,
            cells: team.columns || []
          })
        );
      });
    } else if (mode === 'stroke_entity') {
      const entities = Array.isArray(o.entitiesView)
        ? o.entitiesView
        : this.data.entitiesView || [];
      entities.forEach((entity, eIdx) => {
        if (!entity) return;
        scoreRows.push(
          this._buildM2ScoreRow(entity, { target: 'entity', index: eIdx }, {
            key: entity.entityId || 'entity-' + eIdx,
            kind: entity.kind || 'single',
            cells: entity.cells || []
          })
        );
      });
    } else {
      const isMatchPlay =
        o.isG5MatchPlay != null ? !!o.isG5MatchPlay : !!this.data.isG5MatchPlay;
      const sides = Array.isArray(o.matchSidesView)
        ? o.matchSidesView
        : this.data.matchSidesView || [];
      if (isMatchPlay && sides.length) {
        sides.forEach((side, sIdx) => {
          if (!side) return;
          scoreRows.push(
            this._buildM2ScoreRow(side, { target: 'side', index: sIdx }, {
              key: side.sideId || side.id || 'side-' + sIdx,
              kind: side.kind || 'single',
              cells: side.cells || []
            })
          );
          if (sIdx === 0) {
            pushStatusRow(
              o.matchStatusView != null ? o.matchStatusView : this.data.matchStatusView
            );
          }
        });
      } else {
        const players = Array.isArray(o.playersView)
          ? o.playersView
          : this.data.playersView || [];
        players.forEach((player, pIdx) => {
          if (!player) return;
          scoreRows.push(
            this._buildM2ScoreRow(player, { target: 'player', index: pIdx }, {
              key: player.playerId || player.id || 'player-' + pIdx,
              kind: 'single',
              cells: player.cells || []
            })
          );
        });
      }
    }

    return { headerRows: headerRows, scoreRows: scoreRows };
  },

  /** A1：开发期样例打印（G1 / G6 pair / G4 entity），只打一次，不进 WXML */
  _logM2AdapterSamples(m2, meta) {
    if (_m2AdapterSampleLogged) return;
    _m2AdapterSampleLogged = true;
    const board = m2 || { headerRows: [], scoreRows: [] };
    const firstScore = (board.scoreRows || []).find((r) => r && r.rowKind !== 'status');
    const tag = (meta && meta.sampleTag) || 'current';
    console.log('[m2Scoreboard][' + tag + '] first live row', {
      headerRoles: (board.headerRows || []).map((h) => h.role),
      scoreRowCount: (board.scoreRows || []).length,
      firstRow: firstScore
        ? {
            fixed: firstScore.fixed,
            prefix: firstScore.prefix,
            cellCount: Array.isArray(firstScore.cells) ? firstScore.cells.length : 0,
            tapMeta: firstScore.tapMeta
          }
        : null
    });
    console.log('[m2Scoreboard][examples G1/G6/G4]', {
      G1_single: {
        headerRows: [
          { role: 'hole', fixed: { type: 'label', text: 'HOLE' }, prefix: { diff: { text: '' }, tee: { colors: [] } }, cells: '…', tapMeta: { target: 'none' } },
          { role: 'par', fixed: { type: 'label', text: 'PAR' }, prefix: { diff: { text: '' }, tee: { colors: [] } }, cells: '…', tapMeta: { target: 'none' } }
        ],
        scoreRows: [
          {
            fixed: { type: 'single', avatar: '…', nickname: 'WOODS', teeColor: '#00aeef' },
            prefix: {
              mode: 'single',
              diff: { text: '-2', className: 'diff-under' },
              tee: { colors: ['#00aeef'] }
            },
            cells: 'playersView[i].cells',
            tapMeta: { target: 'player', index: 0 }
          }
        ]
      },
      G6_pair: {
        scoreRows: [
          {
            fixed: {
              type: 'pair',
              members: [
                { name: 'A', avatar: '…', teeColor: '#dc2626' },
                { name: 'B', avatar: '…', teeColor: '#00aeef' }
              ],
              nickname: 'A/B'
            },
            prefix: {
              mode: 'pair',
              diff: { text: 'E', className: 'diff-even' },
              tee: { colors: ['#dc2626', '#00aeef'] }
            },
            cells: 'matchSidesView[0].cells',
            tapMeta: { target: 'side', index: 0 }
          },
          {
            fixed: { type: 'label', text: '胜洞走势', kicker: 'MATCH', main: '胜洞走势' },
            prefix: { mode: 'none', diff: { text: '' }, tee: { colors: [] } },
            cells: 'matchStatusView.rowCells',
            tapMeta: { target: 'none' }
          },
          {
            fixed: { type: 'pair', nickname: 'C/D', members: ['…'] },
            prefix: { mode: 'pair', diff: { text: '-1' }, tee: { colors: ['#111827', '#ce9224'] } },
            cells: 'matchSidesView[1].cells',
            tapMeta: { target: 'side', index: 1 }
          }
        ]
      },
      G4_entity_pair: {
        scoreRows: [
          {
            fixed: {
              type: 'pair',
              members: [
                { name: 'P1', avatar: '…', teeColor: '#ce9224' },
                { name: 'P2', avatar: '…', teeColor: '#ffffff' }
              ],
              nickname: 'P/P'
            },
            prefix: {
              mode: 'pair',
              diff: { text: '+1', className: '' },
              tee: { colors: ['#ce9224', '#ffffff'] }
            },
            cells: 'entitiesView[i].cells',
            tapMeta: { target: 'entity', index: 0 }
          }
        ]
      }
    });
  },

  _attachM2ScoreboardToPatch(patch) {
    const p = patch || {};
    const m2 = this._buildM2ScoreboardView(p);
    p.m2Scoreboard = m2;
    let sampleTag = 'g1';
    if (p.mode === 'stroke_entity' || this.data.mode === 'stroke_entity') sampleTag = 'g4_entity';
    else if (p.isG5MatchPlay || this.data.isG5MatchPlay) {
      const sides = p.matchSidesView || this.data.matchSidesView || [];
      sampleTag = sides.some((s) => s && s.kind === 'pair') ? 'g6_pair' : 'g5_single';
    } else if (p.mode === 'fourball_best' || this.data.mode === 'fourball_best') {
      sampleTag = 'fourball';
    }
    this._logM2AdapterSamples(m2, { sampleTag: sampleTag });
    return p;
  },

  refreshPlayers() {
    if (this.data.mode === 'stroke_entity') {
      this.refreshEntities();
      return;
    }
    const displayMode = this.data.scoreDisplayMode;
    // G5–G8 比洞看板：展示主体 = matchSidesView（Side）；G5 保留 playersView 供点格/面板
    let g5Match = null;
    let isMatchPlayBoard = false;
    let isG5Only = false;
    let matchPlayScoreMode = false;
    let boardFormatLabel = '个人比洞赛';
    let boardGameMode = '';
    if (this.data.mode === 'individual_stroke') {
      const ms = this._matchState || this._readMatchState();
      const matchId = (ms && ms.matchId) || '';
      g5Match = matchId ? teamMatchStore.getMatchById(matchId) : null;
      const gameMode = this._resolveTeamMatchGameMode(g5Match, ms);
      boardGameMode = gameMode;
      isG5Only = isG5PersonalMatchPlayMode(gameMode);
      isMatchPlayBoard = isMatchPlayBoardMode(gameMode);
      matchPlayScoreMode = isMatchPlayScoreMode(gameMode);
      boardFormatLabel = isG5Only ? '个人比洞赛' : gameMode || '个人比洞赛';
      if (isMatchPlayBoard && isG5Only) {
        this._playersSource = orderPlayersSourceForG5(this._playersSource, g5Match);
      }
    }
    let players;
    const boardGroupIdEarly = String(
      this.data.groupId ||
        ((this._matchState || this._readMatchState() || {}).groupId) ||
        ''
    ).trim();
    if (isMatchPlayBoard && !isG5Only) {
      // G6/G7/G8：成绩主体 = Side；重建可写运行时（来自 scoresBySide）
      this._rebuildMatchSidesSource(g5Match, boardGameMode, boardGroupIdEarly);
      players = [];
    } else if (isMatchPlayBoard && isG5Only) {
      this._matchSidesSource = [];
      players = this._playersSource.map((p, i) => enrichPlayerG5(p, i, displayMode));
    } else {
      this._matchSidesSource = [];
      // 洞格右下角统一 formatCellDiff（0/+N/-N）；头像旁 relScore 仍用 formatDiff
      players = this._playersSource.map((p, i) =>
        enrichPlayer(p, i, displayMode, {
          hideCorners: matchPlayScoreMode
        })
      );
    }
    const patch = { playersView: players, matchSidesView: [] };
    // 四人最佳球位：真实比赛由分组结构(scoreEngine.groups)派生球队记分行（逐洞各组最佳）与高亮名册；
    // 演示态保留原型数据。
    if (this.data.mode === 'fourball_best') {
      patch.isMatchPlayScoreMode = false;
      patch.isG5MatchPlay = false;
      patch.matchSidesView = [];
      const bestTeams = this._buildBestTeams(displayMode);
      patch.bestTeams = bestTeams;
      patch.fourballRowsView = this._buildFourballRowsView(bestTeams);
      const pairFlags = resolveFourballPairFlags(this._engineGroups || []);
      patch.isFourballPair22 = pairFlags.isFourballPair22;
      patch.isFourballPairLayout = pairFlags.isFourballPairLayout;
      patch.isFourballTeamLayout = resolveFourballTeamLayoutFlag(this._engineGroups || []);
      const isFourball40StrokeShell = resolveStrokeTeamShellFlag(this._engineGroups || []);
      const isFourballIndividualFallback = resolveFourballIndividualStrokeFallbackFlag(
        this._engineGroups || []
      );
      const useStrokeScoreShell = isFourball40StrokeShell || isFourballIndividualFallback;
      const msLive = this._matchState || this._readMatchState() || {};
      const formatLabel =
        String(
          (msLive.course && (msLive.course.gameMode || msLive.course.format)) ||
            (this.data.match && this.data.match.format) ||
            this.data.bestLabel ||
            ''
        ).trim();
      if (this.data.bestHasMatch) {
        const team = this._teamBestColumns(displayMode);
        patch.bestColumns = team.columns;
        patch.bestTeamDiffStr = team.teamDiffStr;
        patch.bestTeamDiffClass = team.teamDiffClass;
        // 3+1：_buildRosterFromGroups 本就只收 ≥3 人组 → 三人 + 空位，不含单人
        patch.bestRoster = isFourball40StrokeShell
          ? padBestRosterFourSlots(this._buildRosterFromGroups())
          : this._buildRosterFromGroups();
      } else {
        patch.bestColumns = buildBestBallColumns(displayMode);
        patch.bestRoster = isFourball40StrokeShell
          ? padBestRosterFourSlots(buildBestRoster(this._playersSource))
          : buildBestRoster(this._playersSource);
      }
      patch.useStrokeScoreShell = useStrokeScoreShell;
      patch.useFourballScoreShell = useStrokeScoreShell
        ? false
        : this._resolveFourballScoreShell();
      patch.isFourball40StrokeShell = isFourball40StrokeShell;
      const identityLabel = String(this.data.bestLabel || formatLabel || '').trim() || '最佳球位';
      patch.strokeShellFormatLabel = isFourball40StrokeShell ? identityLabel : '';
      if (isFourball40StrokeShell) {
        patch.playersView = this._buildFourball40PlayersView(
          displayMode,
          identityLabel,
          !!this.data.bestHasMatch
        );
        patch.scoreboardStyle = this._buildScoreboardStyleVars({
          colWidth: G1_IDENTITY_COL_WIDTH,
          paddingX: 12,
          diffOpacity: 1,
          nameWidth: 96
        });
      } else if (isFourballIndividualFallback) {
        patch.playersView = this._buildFourballIndividualFallbackPlayersView(
          displayMode,
          !!this.data.bestHasMatch
        );
        patch.scoreboardStyle = this._buildScoreboardStyleVars({
          colWidth: G1_IDENTITY_COL_WIDTH,
          paddingX: 12,
          diffOpacity: 1,
          nameWidth: 96
        });
      }
    }
    // G5–G8：比洞状态 + 展示列（18+FINAL）；G1 恢复标准 OUT/IN/TOT 列
    if (this.data.mode === 'individual_stroke') {
      patch.isG5MatchPlay = isMatchPlayBoard;
      patch.isMatchPlayScoreMode = matchPlayScoreMode;
      // UI Shell：G5–G8 比洞均开 match-play shell；与 useStrokeScoreShell 独立，不改成绩逻辑
      patch.useMatchPlayScoreShell = isMatchPlayBoard;
      if (isMatchPlayBoard) {
        patch['match.format'] = boardFormatLabel;
        if (this.data.gameContext && this.data.gameContext.ready) {
          patch['gameContext.format'] = boardFormatLabel;
        }
        const boardGroupId = String(
          this.data.groupId ||
            ((this._matchState || this._readMatchState() || {}).groupId) ||
            ''
        ).trim();
        const startHoleUi = this._resolveMatchPlayStartHoleForUi(
          g5Match,
          boardGroupId,
          boardGameMode
        );
        patch.columns = buildG5Columns(startHoleUi);
        patch.matchSidesView = buildMatchSidesView(
          this._playersSource,
          g5Match,
          boardGameMode,
          displayMode,
          boardGroupId
        );
        Object.assign(patch, this._syncG5MatchStatusView(g5Match, true, boardGameMode));
        // G6/G7/G8 pair：复用 G2/G3 fourball 身份折叠（collapsedNameView）；不影响 G5 single
        const g678HasPair =
          !isG5Only &&
          (patch.matchSidesView || []).some((row) => row && row.kind === 'pair');
        patch.isMatchPlayPairLayout = !!g678HasPair;
        if (g678HasPair) {
          patch.matchSidesView = (patch.matchSidesView || []).map((row) => {
            if (!row || row.kind !== 'pair') return row;
            const members = Array.isArray(row.pairMembers) ? row.pairMembers : [];
            const name0 = (members[0] && members[0].name) || '';
            const name1 = (members[1] && members[1].name) || '';
            return Object.assign({}, row, {
              collapsedNameView: this._buildFourballCollapsedNameView(name0, name1)
            });
          });
        } else {
          patch.matchPlayIdentityCollapseProgress = 0;
          patch.matchPlayTrackInnerStyle = 'transform: translateX(0px);';
        }
      } else {
        patch.columns = buildColumns();
        patch.isMatchPlayPairLayout = false;
        patch.matchPlayIdentityCollapseProgress = 0;
        patch.matchPlayTrackInnerStyle = 'transform: translateX(0px);';
      }
      if (!isMatchPlayBoard && patch.isG5MatchPlay === false) {
        patch.matchSidesView = [];
        patch.isMatchPlayPairLayout = false;
        patch.matchPlayIdentityCollapseProgress = 0;
        patch.matchPlayTrackInnerStyle = 'transform: translateX(0px);';
        patch.matchStatusView = {
          cells: [],
          rowCells: [],
          currentLabel: 'TIED',
          currentLeadClass: 'all-square',
          leader: 'AS',
          up: 0
        };
      }
    }
    // G1 基础模型：左列仅头像昵称；diff 不走 compact 淡出
    if (
      this.data.mode !== 'fourball_best' &&
      this.data.mode !== 'stroke_entity' &&
      !isMatchPlayBoard
    ) {
      patch.scoreboardStyle = this._buildScoreboardStyleVars({
        colWidth: 128,
        paddingX: 12,
        diffOpacity: 1,
        nameWidth: 96
      });
    }
    this.setData(this._attachM2ScoreboardToPatch(patch));
    this.syncSheetPlayers();
  },

  // 记分链路再绑定（hydration）：slot → playerId → scoreMap(scores/putts) → UI。
  // 增删球员后统一调用，保证每个在场 playerId 都有成绩容器，并强制 UI 由 _playersSource 重建。
  rebindScoreContext() {
    (this._playersSource || []).forEach((p) => {
      if (!p) return;
      if (!p.playerId) p.playerId = p.id;
      if (!Array.isArray(p.scores)) p.scores = [];
      if (!Array.isArray(p.putts)) p.putts = [];
      if (!Array.isArray(p.fairways)) p.fairways = [];
      if (!Array.isArray(p.penalties)) p.penalties = [];
      if (!Array.isArray(p.sands)) p.sands = [];
    });
    this.refreshPlayers();
  },

  // 切换记分格主数字显示方式（总杆 / 杆差），仅 UI 展示，不改写 score 数据
  setScoreDisplayMode(e) {
    const value = e.currentTarget.dataset.value;
    if (value === this.data.scoreDisplayMode) return;
    // 1) 更新状态 2) 写入缓存（记忆偏好）3) 刷新记分格与记分面板显示
    this.setData({ scoreDisplayMode: value }, () => {
      if (this.data.mode === 'stroke_entity') this.refreshEntities();
      else this.refreshPlayers();
    });
    try {
      wx.setStorageSync(this._displayModeKey(), value);
    } catch (err) {}
  },

  // ===== 会话内本地状态存取（无后端 / 无持久化接口，仅内存） =====
  // 以 mode + groupId 作为本球局的会话键
  _sessionKey() {
    return 'score:' + (this.data.mode || 'standard') + ':' + (this.data.groupId || '');
  },

  _isGameStoreContext() {
    return !!this.data.gameId && (this.data.mode === 'game' || this.data.mode === 'fourball_best');
  },

  /** 普通创建单组个人比杆（game-single）：进行中成绩按槽位 */
  _isGameSingleScoreContext() {
    return this.data.mode === 'game' && !!this.data.isSingleGroupGame && !!this.data.gameId;
  },

  /** 运行时球员 → playersSlots 下标（供 scoresBySlot 对齐） */
  _resolvePlayerSlotIndex(player) {
    if (!player) return -1;
    if (player.slotIndex != null && player.slotIndex !== '') {
      const n = Number(player.slotIndex);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    const pid = String(player.playerId || player.id || '').trim();
    if (!pid) return -1;
    const demo = this._demoSlots || [];
    for (let i = 0; i < demo.length; i++) {
      const slot = demo[i];
      if (!slot) continue;
      if (String(slot.playerId || slot.id || '').trim() === pid) return i;
    }
    return -1;
  },

  /** game-single：某槽位 scoresBySlot 是否已有有效成绩 */
  _gameSingleSlotHasScores(slotIndex) {
    const si = Number(slotIndex);
    if (si < 0 || !Number.isFinite(si) || !this.data.gameId) return false;
    const group = gameStore.getGroup(this.data.gameId, this._gameGroupIndex || 0) || {};
    const rec = Array.isArray(group.scoresBySlot) ? group.scoresBySlot[si] : null;
    if (!rec || !Array.isArray(rec.scores)) return false;
    return rec.scores.some((s) => s !== null && s !== undefined && s !== '');
  },

  /** game-single：从 store 读取位成绩（优先 scoresBySlot，兼容 scoresByPlayer） */
  _readGameSingleSlotScores(slotIndex, playerId) {
    const group = gameStore.getGroup(this.data.gameId, this._gameGroupIndex || 0) || {};
    return gameStore.resolveGroupSlotScoreRecord(group, slotIndex, playerId);
  },

  /**
   * game-single：将当前 _playersSource 最新成绩刷入对应 scoresBySlot。
   * 删人/换人前调用，避免只存在于运行时、未落位成绩。
   */
  _flushGameSingleOccupiedScoresToStore() {
    if (!this._isGameSingleScoreContext()) return;
    const gi = this._gameGroupIndex || 0;
    (this._playersSource || []).forEach((p) => {
      if (!p) return;
      const slotIndex = this._resolvePlayerSlotIndex(p);
      if (slotIndex < 0) return;
      if (this._demoSlots && this._demoSlots[slotIndex]) {
        const slot = this._demoSlots[slotIndex];
        slot.scores = (p.scores || []).slice();
        slot.putts = (p.putts || []).slice();
        slot.fairways = sliceFairways(p.fairways);
        slot.penalties = slicePenalties(p.penalties);
        slot.sands = sliceSands(p.sands);
      }
      gameStore.setGroupSlotScores(
        this.data.gameId,
        gi,
        slotIndex,
        p.scores,
        p.putts,
        p.fairways,
        p.penalties,
        p.sands
      );
    });
  },

  /** 从 gameStore 某组 playersSlots 加载球员 + 槽位（增删后再次进入的唯一数据源） */
  _loadPlayersFromGameGroup(gameId, groupIndex, options) {
    const opts = options || {};
    const preferScoresBySlot = !!opts.preferScoresBySlot;
    const group = gameStore.getGroup(gameId, groupIndex || 0) || {
      playersSlots: [],
      scoresByPlayer: {},
      scoresBySlot: []
    };
    const slots = group.playersSlots || [];
    const scoresByPlayer = group.scoresByPlayer || {};
    const n = Math.max(playerSlots.DEFAULT_SLOT_SIZE, slots.length);
    this._demoSlots = [];
    this._demoSlotCache = [];
    for (let i = 0; i < n; i++) {
      const p = slots[i];
      if (!p) {
        this._demoSlots[i] = null;
        continue;
      }
      const saved = preferScoresBySlot
        ? gameStore.resolveGroupSlotScoreRecord(group, i, p.playerId)
        : scoresByPlayer[p.playerId] || {};
      this._demoSlots[i] = {
        id: p.playerId,
        playerId: p.playerId,
        slotIndex: i,
        name: p.name,
        avatar: mockAvatars.resolveAvatar(p.avatar, p.playerId),
        gender: p.gender || '',
        tPosition: p.tPosition || '',
        scores: (saved.scores || []).slice(),
        putts: (saved.putts || []).slice(),
        fairways: sliceFairways(saved.fairways),
        penalties: slicePenalties(saved.penalties),
        sands: sliceSands(saved.sands)
      };
    }
    let occupiedIdx = 0;
    this._playersSource = this._demoSlots.filter(Boolean).map((p) => {
      const teeFields = applyScorePlayerTeeFields(
        {
          playerId: p.playerId,
          tPosition: p.tPosition || '',
          gender: p.gender || '',
          matchGender: p.matchGender || ''
        },
        occupiedIdx
      );
      occupiedIdx += 1;
      const row = {
        id: p.playerId,
        playerId: p.playerId,
        slotIndex: p.slotIndex,
        name: p.name,
        avatar: mockAvatars.resolveAvatar(p.avatar, p.playerId),
        gender: teeFields.gender,
        tPosition: teeFields.tPosition,
        scores: (p.scores || []).slice(),
        putts: (p.putts || []).slice(),
        fairways: sliceFairways(p.fairways),
        penalties: slicePenalties(p.penalties),
        sands: sliceSands(p.sands)
      };
      // colorClasses：记分竖条 T 台色（与队内赛同一套 resolveScoreTeeStyle，不再用 GAME_COLOR_CLASSES）
      if (opts.colorClasses) {
        row.colorClass = teeFields.colorClass;
      }
      return row;
    });
    return group;
  },

  _playersSlotsPayload() {
    if (this._demoSlots && this._demoSlots.length) {
      return this._demoSlots.map((p) => {
        if (!p) return null;
        return {
          playerId: p.playerId || p.id,
          name: p.name || '球员',
          avatar: mockAvatars.resolveAvatar(p.avatar, p.playerId || p.id),
          gender: p.gender || '',
          tPosition: p.tPosition || ''
        };
      });
    }
    return (this._playersSource || []).map((p) => ({
      playerId: p.playerId || p.id,
      name: p.name || '球员',
      avatar: p.avatar || '',
      gender: p.gender || '',
      tPosition: p.tPosition || ''
    }));
  },

  _syncMatchStatePlayers(playersSlots) {
    const ms = this._matchState || matchState.getMatchState();
    if (!ms || !this.data.gameId || ms.gameId !== this.data.gameId) return;
    const players = (playersSlots || []).filter(Boolean).map((p) => ({
      playerId: p.playerId,
      name: p.name,
      avatar: p.avatar || ''
    }));
    const next = Object.assign({}, ms, { players: players });
    matchState.setMatchState(next);
    this._matchState = next;
  },

  /** 将记分页增删后的球员名单写回 gameStore（含 groups[0] 与顶层 playersSlots） */
  _persistGameRoster() {
    if (!this._isGameStoreContext()) return;
    const gi = this._gameGroupIndex || 0;
    const playersSlots = this._playersSlotsPayload();
    gameStore.setGroupPlayersSlots(this.data.gameId, gi, playersSlots);
    this._syncMatchStatePlayers(playersSlots);
  },

  _inferFormalMatchStartHoleFromScores() {
    const ms = this._matchState || this._readMatchState() || {};
    const matchId = ms.matchId || '';
    const groupId = this.data.groupId || ms.groupId || '';
    if (!matchId || !groupId) return;
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) return;
    const result = teeSheetManage.inferStartHoleIfNeededForFormalGroup(
      match,
      groupId,
      this._playersSource
    );
    if (result && result.updated) {
      teamMatchStore.saveMatch(match);
    }
  },

  _persistTeamMatchIndividualScores(match, groupId) {
    if (!match || !match.matchId || !groupId) return false;
    match.scoreData = match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : {};
    const groupScoreData = match.scoreData[groupId] && typeof match.scoreData[groupId] === 'object'
      ? match.scoreData[groupId]
      : {};
    const scoresByPlayer = groupScoreData.scoresByPlayer && typeof groupScoreData.scoresByPlayer === 'object'
      ? groupScoreData.scoresByPlayer
      : {};
    (this._playersSource || []).forEach((player) => {
      const playerId = player && (player.playerId || player.id);
      const scorePlayerId = player && player.scorePlayerId ? String(player.scorePlayerId) : '';
      const scoreOwnerId = scorePlayerId || playerId;
      if (!scoreOwnerId) return;
      scoresByPlayer[scoreOwnerId] = {
        scores: (player.scores || []).slice(),
        putts: (player.putts || []).slice(),
        fairways: sliceFairways(player.fairways),
        penalties: slicePenalties(player.penalties),
        sands: sliceSands(player.sands)
      };
    });
    const preserved = teamMatchStore.normalizeGroupScoreBucket(groupScoreData);
    const next = {
      scoresByPlayer: scoresByPlayer,
      teamScoresByEntity: preserved.teamScoresByEntity,
      scoresBySide: preserved.scoresBySide
    };
    // Phase1-D：G5 比洞自动锁定起始洞（双方同洞均有成绩）；已有 meta 不覆盖
    const ms = this._matchState || this._readMatchState();
    const gameMode = this._resolveTeamMatchGameMode(match, ms);
    let matchPlayMeta = preserved.matchPlayMeta || null;
    if (isG5PersonalMatchPlayMode(gameMode) && !matchPlayMeta) {
      const sides = resolveMatchPlaySides(this._playersSource, match, {
        forceG5: true,
        groupId: groupId
      });
      if (sides) {
        matchPlayMeta = inferAutoMatchPlayMeta(
          sides.sideA.scores,
          sides.sideB.scores,
          null
        );
      }
    }
    if (matchPlayMeta) next.matchPlayMeta = matchPlayMeta;
    if (preserved.firstScoreAt != null) next.firstScoreAt = preserved.firstScoreAt;
    if (preserved.finishedScoreAt != null) next.finishedScoreAt = preserved.finishedScoreAt;
    teamMatchStore.ensureGroupScoreBucketFirstScoreAt(next);
    teamMatchStore.ensureGroupScoreBucketFinishedScoreAt(next);
    match.scoreData[groupId] = next;
    teamMatchStore.saveMatch(match);
    return true;
  },

  /** 当前是否为 G6/G7/G8 比洞 Side 记分（individual_stroke，非 Entity） */
  _isG678MatchPlaySideScoring() {
    if (this.data.mode !== 'individual_stroke') return false;
    const ms = this._matchState || this._readMatchState();
    const matchId = (ms && ms.matchId) || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const gameMode = this._resolveTeamMatchGameMode(match, ms);
    return isG678SideMatchPlayMode(gameMode);
  },

  _cloneMatchSidesSourceSnapshot(list) {
    return (Array.isArray(list) ? list : []).map((side) => {
      if (!side || typeof side !== 'object') return side;
      return {
        sideId: side.sideId != null ? String(side.sideId) : '',
        sideKey: side.sideKey === 'B' ? 'B' : 'A',
        members: Array.isArray(side.members) ? side.members.slice() : [],
        scores: Array.isArray(side.scores) ? side.scores.slice() : [],
        putts: Array.isArray(side.putts) ? side.putts.slice() : [],
        fairways: Array.isArray(side.fairways) ? side.fairways.slice() : [],
        penalties: Array.isArray(side.penalties) ? side.penalties.slice() : [],
        sands: Array.isArray(side.sands) ? side.sands.slice() : []
      };
    });
  },

  /** 从 resolveMatchPlaySides + scoresBySide 重建可写 Side 运行时 */
  _rebuildMatchSidesSource(match, gameMode, groupId) {
    const sides = resolveMatchPlaySides(this._playersSource, match || null, {
      gameMode: gameMode,
      groupId: groupId
    });
    if (!sides) {
      this._matchSidesSource = [];
      return;
    }
    this._matchSidesSource = [
      {
        sideId: sides.sideA.sideId,
        sideKey: sides.sideA.sideKey || 'A',
        members: Array.isArray(sides.sideA.members) ? sides.sideA.members.slice() : [],
        scores: Array.isArray(sides.sideA.scores) ? sides.sideA.scores.slice() : [],
        putts: Array.isArray(sides.sideA.putts) ? sides.sideA.putts.slice() : [],
        fairways: Array.isArray(sides.sideA.fairways) ? sides.sideA.fairways.slice() : [],
        penalties: Array.isArray(sides.sideA.penalties) ? sides.sideA.penalties.slice() : [],
        sands: Array.isArray(sides.sideA.sands) ? sides.sideA.sands.slice() : []
      },
      {
        sideId: sides.sideB.sideId,
        sideKey: sides.sideB.sideKey || 'B',
        members: Array.isArray(sides.sideB.members) ? sides.sideB.members.slice() : [],
        scores: Array.isArray(sides.sideB.scores) ? sides.sideB.scores.slice() : [],
        putts: Array.isArray(sides.sideB.putts) ? sides.sideB.putts.slice() : [],
        fairways: Array.isArray(sides.sideB.fairways) ? sides.sideB.fairways.slice() : [],
        penalties: Array.isArray(sides.sideB.penalties) ? sides.sideB.penalties.slice() : [],
        sands: Array.isArray(sides.sideB.sands) ? sides.sideB.sands.slice() : []
      }
    ];
  },

  _padSideScoreArrays(side) {
    if (!side) return;
    side.scores = Array.isArray(side.scores) ? side.scores : [];
    side.putts = Array.isArray(side.putts) ? side.putts : [];
    side.fairways = Array.isArray(side.fairways) ? side.fairways : [];
    side.penalties = Array.isArray(side.penalties) ? side.penalties : [];
    side.sands = Array.isArray(side.sands) ? side.sands : [];
    while (side.scores.length < 18) side.scores.push(null);
    while (side.putts.length < 18) side.putts.push(null);
    while (side.fairways.length < 18) side.fairways.push(null);
    while (side.penalties.length < 18) side.penalties.push(0);
    while (side.sands.length < 18) side.sands.push(0);
  },

  _clearHoleScoresInMatchSidesSource(holeIndex) {
    const hi = Number(holeIndex);
    if (!Number.isFinite(hi) || hi < 0 || hi > 17) return;
    (this._matchSidesSource || []).forEach((side) => {
      this._padSideScoreArrays(side);
      side.scores[hi] = null;
      side.putts[hi] = null;
      side.fairways[hi] = null;
      side.penalties[hi] = 0;
      side.sands[hi] = 0;
    });
  },

  _resolveMatchSideSheetMeta(side, sideIdx) {
    const members = Array.isArray(side && side.members) ? side.members : [];
    const key = (side && side.sideKey) || (sideIdx === 1 ? 'B' : 'A');
    if (members.length >= 2) {
      const names = members.map((m) => (m && m.name) || '').filter(Boolean);
      const m0 = members[0] || {};
      return {
        name: names.length ? names.join(' / ') : 'Side ' + key,
        avatar: mockAvatars.resolveAvatar(m0.avatar, m0.playerId || '')
      };
    }
    const m0 = members[0] || {};
    return {
      name: m0.name || 'Side ' + key,
      avatar: mockAvatars.resolveAvatar(m0.avatar, m0.playerId || '')
    };
  },

  /**
   * G6/G7/G8：将 _matchSidesSource 写入 scoreData[groupId].scoresBySide
   * 保留 scoresByPlayer / teamScoresByEntity；不写个人分、不碰 Entity
   * Phase1-D：双方 Side 同洞均有成绩时写入 matchPlayMeta.startHole
   */
  _persistTeamMatchSideScores(match, groupId) {
    if (!match || !match.matchId || !groupId) return false;
    match.scoreData =
      match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
        ? match.scoreData
        : {};
    const groupScoreData =
      match.scoreData[groupId] && typeof match.scoreData[groupId] === 'object'
        ? match.scoreData[groupId]
        : {};
    const preserved = teamMatchStore.normalizeGroupScoreBucket(groupScoreData);
    const scoresBySide = Object.assign({}, preserved.scoresBySide);
    (this._matchSidesSource || []).forEach((side) => {
      if (!side) return;
      const sideId = side.sideId != null ? String(side.sideId).trim() : '';
      if (!sideId) return;
      const rec = teamMatchStore.normalizeSideScoreRecord(sideId, side.sideKey, side);
      scoresBySide[sideId] = rec;
    });
    const next = {
      scoresByPlayer: preserved.scoresByPlayer,
      teamScoresByEntity: preserved.teamScoresByEntity,
      scoresBySide: scoresBySide
    };
    let matchPlayMeta = preserved.matchPlayMeta || null;
    if (!matchPlayMeta) {
      const list = this._matchSidesSource || [];
      const sideA =
        list.find((s) => s && s.sideKey === 'A') || list[0] || null;
      const sideB =
        list.find((s) => s && s.sideKey === 'B') || list[1] || null;
      matchPlayMeta = inferAutoMatchPlayMeta(
        sideA && sideA.scores,
        sideB && sideB.scores,
        null
      );
    }
    if (matchPlayMeta) next.matchPlayMeta = matchPlayMeta;
    if (preserved.firstScoreAt != null) next.firstScoreAt = preserved.firstScoreAt;
    if (preserved.finishedScoreAt != null) next.finishedScoreAt = preserved.finishedScoreAt;
    teamMatchStore.ensureGroupScoreBucketFirstScoreAt(next);
    teamMatchStore.ensureGroupScoreBucketFinishedScoreAt(next);
    match.scoreData[groupId] = next;
    teamMatchStore.saveMatch(match);
    return true;
  },

  _hydrateTeamMatchIndividualFromSession() {
    const match = this._readScoreTeamMatch();
    const group = this._findScoreTeamMatchGroup(match);
    const groupId = String(this.data.groupId || ((this._matchState || {}).groupId) || '');
    const isTeamMatch = !!(match && group);
    if (!isTeamMatch) {
      console.log('[score-hydrate-migration]', {
        isTeamMatch: false,
        source: 'groupsStore',
        groupId: groupId,
        players: 0,
        scoreDataLoaded: false
      });
      return false;
    }

    const teamSlots = this._scoreTeamMatchSlotsForCurrent();
    const groupScoreData = match.scoreData && match.scoreData[groupId] && typeof match.scoreData[groupId] === 'object'
      ? match.scoreData[groupId]
      : {};
    const scoresByPlayer = groupScoreData.scoresByPlayer && typeof groupScoreData.scoresByPlayer === 'object'
      ? groupScoreData.scoresByPlayer
      : {};

    this._playersSource = ((teamSlots && teamSlots.slots) || [])
      .filter((slot) => slot && slot.status === 'occupied')
      .map((slot, index) => {
        const player = slot.player || {};
        const playerId = (player && player.playerId) || slot.playerId || '';
        const scorePlayerId = slot.scorePlayerId || '';
        const record = (scorePlayerId && scoresByPlayer[scorePlayerId]) || scoresByPlayer[playerId] || {};
        const position = Number(slot.slotId) || index + 1;
        const entry = this._findScoreTeamMatchPlayerEntry(group, position) || {};
        const profile = this._buildScoreTeamMatchPlayerProfile(
          match,
          playerId,
          Object.assign({}, entry, player)
        );
        const teeFields = applyScorePlayerTeeFields(
          {
            playerId: playerId,
            tPosition: entry.tPosition || player.tPosition || '',
            tee: entry.tee || player.tee || '',
            gender: profile.gender || entry.gender || player.gender || '',
            matchGender: profile.matchGender || entry.matchGender || player.matchGender || ''
          },
          index
        );
        return {
          id: playerId,
          playerId: playerId,
          scorePlayerId: scorePlayerId || playerId,
          name: player.name || playerId || '球员',
          avatar: player.avatar || '',
          gender: teeFields.gender,
          tPosition: teeFields.tPosition,
          colorClass: teeFields.colorClass,
          scores: (record.scores || []).slice(),
          putts: (record.putts || []).slice(),
          fairways: sliceFairways(record.fairways),
          penalties: slicePenalties(record.penalties),
          sands: sliceSands(record.sands)
        };
      });

    const patch = {
      playerCount: this._playersSource.length || 4,
      groupSlots: (teamSlots && teamSlots.slots) || []
    };
    if (this.data.activePlayerIdx >= this._playersSource.length) patch.activePlayerIdx = 0;
    this.setData(patch);
    this.refreshPlayers();
    console.log('[score-hydrate-migration]', {
      isTeamMatch: true,
      source: 'teamMatchStore',
      groupId: groupId,
      players: this._playersSource.length,
      scoreDataLoaded: !!groupScoreData.scoresByPlayer
    });
    return true;
  },

  // 将当前本地 state 写入会话：个人比杆赛 → 出发表 groups；其他模式 → scoreSessions
  persistSession() {
    if (this._isGameStoreContext()) {
      const gi = this._gameGroupIndex || 0;
      const dualWriteSlot = this._isGameSingleScoreContext();
      this._persistGameRoster();
      (this._playersSource || []).forEach((p) => {
        gameStore.setGroupPlayerScores(
          this.data.gameId,
          gi,
          p.playerId || p.id,
          p.scores,
          p.putts,
          p.fairways,
          p.penalties,
          p.sands
        );
        // game-single：进行中同时写入位成绩（与 playersSlots 下标对齐）
        if (dualWriteSlot) {
          const slotIndex = this._resolvePlayerSlotIndex(p);
          if (slotIndex >= 0) {
            gameStore.setGroupSlotScores(
              this.data.gameId,
              gi,
              slotIndex,
              p.scores,
              p.putts,
              p.fairways,
              p.penalties,
              p.sands
            );
          }
        }
      });
      if (this.data.mode === 'fourball_best') {
        this._persistTeamScores();
      }
      return;
    }
    if (this.data.mode === 'stroke_entity' && this.data.groupId) {
      const ms = this._matchState || this._readMatchState() || {};
      const matchId = ms.matchId || '';
      const groupId = this.data.groupId || ms.groupId || '';
      const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
      if (match && this._persistTeamMatchEntityScores(match, groupId)) {
        console.log('[score-save-source]', {
          matchId: matchId,
          source: 'teamMatch.scoreData.teamScoresByEntity',
          groupId: groupId,
          entityCount: (this._entitiesSource || []).length
        });
      }
      return;
    }
    if (this.data.mode === 'individual_stroke' && this.data.groupId) {
      const ms = this._matchState || this._readMatchState() || {};
      const matchId = ms.matchId || '';
      const groupId = this.data.groupId || ms.groupId || '';
      const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
      // G6/G7/G8：只写 scoresBySide，禁止 scoresByPlayer
      if (match && this._isG678MatchPlaySideScoring()) {
        if (this._persistTeamMatchSideScores(match, groupId)) {
          console.log('[score-save-source]', {
            matchId: matchId,
            source: 'teamMatch.scoreData.scoresBySide',
            groupId: groupId,
            sideCount: (this._matchSidesSource || []).length
          });
          this._inferFormalMatchStartHoleFromScores();
        }
        return;
      }
      if (match && this._persistTeamMatchIndividualScores(match, groupId)) {
        console.log('[score-save-source]', {
          matchId: matchId,
          source: 'teamMatch.scoreData',
          groupId: groupId,
          playerCount: (this._playersSource || []).length
        });
        this._inferFormalMatchStartHoleFromScores();
        return;
      }
      groupsStore.syncGroupFromScoring(this.data.groupId, this._playersSource);
      console.log('[score-save-source]', {
        matchId: matchId,
        source: 'groupsStore',
        groupId: this.data.groupId,
        playerCount: (this._playersSource || []).length
      });
      this._inferFormalMatchStartHoleFromScores();
      return;
    }
    const app = getApp();
    app.globalData = app.globalData || {};
    app.globalData.scoreSessions = app.globalData.scoreSessions || {};
    app.globalData.scoreSessions[this._sessionKey()] = (this._playersSource || []).map((p) => ({
      scores: (p.scores || []).slice(),
      putts: (p.putts || []).slice(),
      fairways: sliceFairways(p.fairways),
      penalties: slicePenalties(p.penalties),
      sands: sliceSands(p.sands)
    }));
  },

  // 回灌：个人比杆赛从 groups 读取；其他模式从 scoreSessions
  hydrateFromSession() {
    if (this._isGameStoreContext()) {
      const group = gameStore.getGroup(this.data.gameId, this._gameGroupIndex || 0) || {};
      const scoresByPlayer = group.scoresByPlayer || {};
      const preferSlot = this._isGameSingleScoreContext();
      let changed = false;
      (this._playersSource || []).forEach((p) => {
        const pid = p.playerId || p.id;
        let rec = null;
        if (preferSlot) {
          const slotIndex = this._resolvePlayerSlotIndex(p);
          const hasSlot =
            slotIndex >= 0 &&
            Array.isArray(group.scoresBySlot) &&
            !!group.scoresBySlot[slotIndex];
          const hasPlayer = !!(pid && scoresByPlayer[pid]);
          if (!hasSlot && !hasPlayer) return;
          rec = gameStore.resolveGroupSlotScoreRecord(group, slotIndex, pid);
        } else {
          rec = scoresByPlayer[pid];
        }
        if (!rec) return;
        p.scores = (rec.scores || []).slice();
        p.putts = (rec.putts || []).slice();
        p.fairways = sliceFairways(rec.fairways);
        p.penalties = slicePenalties(rec.penalties);
        p.sands = sliceSands(rec.sands);
        changed = true;
      });
      if (changed) this.refreshPlayers();
      return;
    }
    if (this.data.mode === 'stroke_entity' && this.data.groupId) {
      const ms = this._matchState || this._readMatchState() || {};
      const matchId = ms.matchId || '';
      const groupId = this.data.groupId || ms.groupId || '';
      const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
      this._entitiesSource = this._hydrateTeamMatchEntityFromSession(match, groupId) || [];
      return;
    }
    if (this.data.mode === 'individual_stroke' && this.data.groupId) {
      if (this._hydrateTeamMatchIndividualFromSession()) return;
      groupsStore.ensureInitialized();
      const loaded = groupsStore.loadGroupForScoring(this.data.groupId);
      if (!loaded.length) return;
      this._playersSource = loaded.map((p, i) => {
        const teeFields = applyScorePlayerTeeFields(
          {
            playerId: p.playerId || p.id,
            tPosition: p.tPosition || '',
            tee: p.tee || '',
            gender: p.gender || '',
            matchGender: p.matchGender || ''
          },
          i
        );
        return {
          id: p.id,
          playerId: p.playerId || p.id,
          name: p.name,
          avatar: p.avatar,
          gender: teeFields.gender,
          tPosition: teeFields.tPosition,
          colorClass: teeFields.colorClass,
          scores: (p.scores || []).slice(),
          putts: (p.putts || []).slice(),
          fairways: sliceFairways(p.fairways),
          penalties: slicePenalties(p.penalties),
          sands: sliceSands(p.sands)
        };
      });
      this.refreshPlayers();
      console.log('[score-hydrate-migration]', {
        isTeamMatch: false,
        source: 'groupsStore',
        groupId: this.data.groupId || '',
        players: this._playersSource.length,
        scoreDataLoaded: false
      });
      return;
    }
    const app = getApp();
    const store = app.globalData && app.globalData.scoreSessions;
    const saved = store && store[this._sessionKey()];
    if (!saved || !saved.length) return;
    saved.forEach((rec, i) => {
      if (this._playersSource[i]) {
        this._playersSource[i].scores = (rec.scores || []).slice();
        this._playersSource[i].putts = (rec.putts || []).slice();
        this._playersSource[i].fairways = sliceFairways(rec.fairways);
        this._playersSource[i].penalties = slicePenalties(rec.penalties);
        this._playersSource[i].sands = sliceSands(rec.sands);
      }
    });
    this.refreshPlayers();
  },

  /**
   * 记分面板侧栏：按 entity kind 生成 name / avatar（不改成绩）
   * - pair：成员头像（首成员）+ 成员姓名
   * - team：赛制/团队标题
   * - single：单人姓名 + 头像
   */
  _resolveEntitySheetSidebarMeta(entView, entity, index, nameMap) {
    const view = entView || {};
    const kind = view.kind ? String(view.kind) : 'team';
    const memberDisplay = Array.isArray(view.memberDisplay) ? view.memberDisplay : [];

    if (kind === 'pair') {
      const names = memberDisplay.map((m) => m && m.name).filter(Boolean);
      const avatar =
        (memberDisplay[0] && memberDisplay[0].avatar) ||
        (view.pairMembers && view.pairMembers[0] && view.pairMembers[0].avatar) ||
        view.avatar ||
        '';
      return {
        name: names.length
          ? names.join(' / ')
          : view.name || this._buildEntityDisplayName(entity, index, nameMap) || '组合',
        avatar: avatar
      };
    }

    if (kind === 'single') {
      const m0 = memberDisplay[0] || {};
      return {
        name: view.name || m0.name || this._buildEntityDisplayName(entity, index, nameMap) || '球员',
        avatar: view.avatar || m0.avatar || ''
      };
    }

    // team：保持团队展示（赛制标题），头像用首成员（与 fourball 组行一致，可为空）
    return {
      name: view.label || view.displayName || '组合',
      avatar: view.avatar || (memberDisplay[0] && memberDisplay[0].avatar) || ''
    };
  },

  syncSheetPlayers() {
    // G6/G7/G8 比洞：侧栏仅 Side A / Side B（不展示个人）
    if (this._isG678MatchPlaySideScoring()) {
      const {
        sheetPar,
        sheetHoleIndex,
        panelScore,
        scoreDisplayMode,
        activeSideIndex,
        scorePanelMode,
        quickPanelScores,
        quickScoreClearDraft,
        quickScoreFreshDraft,
        scoreClearDraft
      } = this.data;
      const sides = this._matchSidesSource || [];
      const sheetPlayers = sides.map((side, idx) => {
        const meta = this._resolveMatchSideSheetMeta(side, idx);
        const formal = side && Array.isArray(side.scores) ? side.scores[sheetHoleIndex] : null;
        const hasFormal = isFilledScore(formal);
        let holeScore = '';
        let isDraftScore = false;
        if (scorePanelMode === 'quick') {
          if (quickScoreClearDraft) {
            holeScore = '';
            isDraftScore = false;
          } else {
            const q =
              quickPanelScores && quickPanelScores[idx] != null
                ? quickPanelScores[idx]
                : sheetPar;
            holeScore = formatMainScore(q, sheetPar, scoreDisplayMode);
            isDraftScore = quickScoreFreshDraft ? true : !hasFormal;
          }
        } else if (scoreClearDraft) {
          holeScore = '';
          isDraftScore = false;
        } else if (idx === activeSideIndex) {
          const draft = panelScore != null && panelScore !== '' ? panelScore : sheetPar;
          if (!hasFormal) {
            holeScore = formatMainScore(draft, sheetPar, scoreDisplayMode);
            isDraftScore = true;
          } else if (Number(draft) === Number(formal)) {
            holeScore = formatMainScore(formal, sheetPar, scoreDisplayMode);
            isDraftScore = false;
          } else {
            holeScore = formatMainScore(draft, sheetPar, scoreDisplayMode);
            isDraftScore = true;
          }
        } else if (hasFormal) {
          holeScore = formatMainScore(formal, sheetPar, scoreDisplayMode);
          isDraftScore = false;
        }
        return {
          id: (side && side.sideId) || 'side_' + idx,
          name: meta.name,
          avatar: meta.avatar,
          active: idx === activeSideIndex,
          holeScore: holeScore,
          isDraftScore: isDraftScore
        };
      });
      this.setData({
        sheetPlayers,
        panelMainDisplay: formatMainScore(panelScore, sheetPar, scoreDisplayMode),
        quickPanelDisplay: (quickPanelScores || []).map((q) =>
          formatMainScore(q != null ? q : sheetPar, sheetPar, scoreDisplayMode)
        )
      });
      return;
    }

    // Stroke Entity：面板侧栏来自 entitiesView / _entitiesSource（不读 _playersSource）
    if (this.data.mode === 'stroke_entity') {
      const {
        sheetPar,
        sheetHoleIndex,
        panelScore,
        scoreDisplayMode,
        activeEntityIndex,
        scorePanelMode,
        quickPanelScores,
        entitiesView
      } = this.data;
      const entities = this._entitiesSource || [];
      const views = entitiesView || [];
      const nameMap = this._resolveEntityMemberNameMap();
      const sheetPlayers = entities.map((entity, idx) => {
        const entView = views[idx] || {};
        const meta = this._resolveEntitySheetSidebarMeta(entView, entity, idx, nameMap);
        const formal = entity && Array.isArray(entity.scores) ? entity.scores[sheetHoleIndex] : null;
        const hasFormal = isFilledScore(formal);
        let holeScore = '';
        let isDraftScore = false;
        if (scorePanelMode === 'quick') {
          const q =
            quickPanelScores && quickPanelScores[idx] != null
              ? quickPanelScores[idx]
              : sheetPar;
          holeScore = formatMainScore(q, sheetPar, scoreDisplayMode);
          isDraftScore = !hasFormal;
        } else if (idx === activeEntityIndex) {
          const draft = panelScore != null && panelScore !== '' ? panelScore : sheetPar;
          if (!hasFormal) {
            holeScore = formatMainScore(draft, sheetPar, scoreDisplayMode);
            isDraftScore = true;
          } else if (Number(draft) === Number(formal)) {
            holeScore = formatMainScore(formal, sheetPar, scoreDisplayMode);
            isDraftScore = false;
          } else {
            holeScore = formatMainScore(draft, sheetPar, scoreDisplayMode);
            isDraftScore = true;
          }
        } else if (hasFormal) {
          holeScore = formatMainScore(formal, sheetPar, scoreDisplayMode);
          isDraftScore = false;
        }
        return {
          id: (entity && entity.entityId) || 'entity_' + idx,
          name: meta.name,
          avatar: meta.avatar,
          active: idx === activeEntityIndex,
          holeScore: holeScore,
          isDraftScore: isDraftScore
        };
      });
      this.setData({
        sheetPlayers,
        panelMainDisplay: formatMainScore(panelScore, sheetPar, scoreDisplayMode),
        quickPanelDisplay: (quickPanelScores || []).map((q) =>
          formatMainScore(q != null ? q : sheetPar, sheetPar, scoreDisplayMode)
        )
      });
      return;
    }

    // 四人最佳球位 / 最好成绩：记分实体 = scoreEngine.groups，球员列表/快捷控件按组数呈现（一组一项）
    // 清除草稿 UI 对齐个人比杆：clearDraft / clearPending / quickClearDraft
    if (this.data.mode === 'fourball_best') {
      const {
        sheetPar,
        sheetHoleIndex,
        panelScore,
        scoreDisplayMode,
        activePlayerIdx,
        quickPanelScores,
        scorePanelMode,
        scoreClearDraft,
        scoreHoleClearPending,
        quickScoreClearDraft,
        quickScoreFreshDraft
      } = this.data;
      const groups = this._engineGroups || [];
      const single = groups.length <= 1;
      const clearDraft = !!scoreClearDraft && scorePanelMode === 'tech';
      const clearPending = !!scoreHoleClearPending && scorePanelMode === 'tech';
      const quickClearDraft = !!quickScoreClearDraft && scorePanelMode === 'quick';
      const quickFreshDraft = !!quickScoreFreshDraft && scorePanelMode === 'quick';
      const sheetPlayers = groups.map((g, gi) => {
        const formal = (g.scores || [])[sheetHoleIndex];
        const hasFormal = isFilledScore(formal);
        let holeScore = '';
        let isDraftScore = false;
        if (scorePanelMode === 'quick') {
          if (quickClearDraft) {
            holeScore = '';
            isDraftScore = false;
          } else {
            const q = quickPanelScores[gi] != null ? quickPanelScores[gi] : sheetPar;
            holeScore = formatMainScore(q, sheetPar, scoreDisplayMode);
            isDraftScore = quickFreshDraft ? true : !hasFormal;
          }
        } else if (clearDraft) {
          holeScore = '';
          isDraftScore = false;
        } else if (clearPending) {
          if (gi === activePlayerIdx) {
            const draft = panelScore != null && panelScore !== '' ? panelScore : sheetPar;
            holeScore = formatMainScore(draft, sheetPar, scoreDisplayMode);
            isDraftScore = true;
          }
        } else if (gi === activePlayerIdx) {
          const draft = panelScore != null && panelScore !== '' ? panelScore : sheetPar;
          if (!hasFormal) {
            holeScore = formatMainScore(draft, sheetPar, scoreDisplayMode);
            isDraftScore = true;
          } else if (Number(draft) === Number(formal)) {
            holeScore = formatMainScore(formal, sheetPar, scoreDisplayMode);
            isDraftScore = false;
          } else {
            holeScore = formatMainScore(draft, sheetPar, scoreDisplayMode);
            isDraftScore = true;
          }
        } else if (hasFormal) {
          holeScore = formatMainScore(formal, sheetPar, scoreDisplayMode);
          isDraftScore = false;
        }
        const members = (g && g.members) || [];
        const m0 = members[0] || null;
        // 单人队（含 individual fallback）：面板显示球员昵称/头像；成绩仍挂该 team
        const displayName =
          members.length === 1 && m0
            ? m0.name || g.name
            : single
              ? this.data.bestLabel || g.name
              : g.name;
        const displayAvatar =
          members.length === 1 && m0 ? m0.avatar || g.avatar || '' : g.avatar || '';
        return {
          id: g.id,
          name: displayName,
          avatar: displayAvatar,
          active: clearDraft ? false : gi === activePlayerIdx,
          holeScore,
          isDraftScore
        };
      });
      this.setData({
        sheetPlayers,
        panelMainDisplay: formatMainScore(panelScore, sheetPar, scoreDisplayMode),
        quickPanelDisplay: (quickPanelScores || []).map((q) =>
          formatMainScore(q != null ? q : sheetPar, sheetPar, scoreDisplayMode)
        )
      });
      return;
    }

    const {
      playersView,
      activePlayerIdx,
      sheetPar,
      sheetHoleIndex,
      quickPanelScores,
      scorePanelMode,
      panelScore,
      scoreDisplayMode,
      scoreClearDraft,
      scoreHoleClearPending,
      quickScoreClearDraft,
      quickScoreFreshDraft
    } = this.data;
    const clearDraft = !!scoreClearDraft && scorePanelMode === 'tech';
    const clearPending = !!scoreHoleClearPending && scorePanelMode === 'tech';
    const quickClearDraft = !!quickScoreClearDraft && scorePanelMode === 'quick';
    const quickFreshDraft = !!quickScoreFreshDraft && scorePanelMode === 'quick';
    const sheetPlayers = playersView.map((p, idx) => {
      const shortName = p.name.split('.')[1] || p.name;
      let holeScore = '';
      let isDraftScore = false;
      if (scorePanelMode === 'quick') {
        if (quickClearDraft) {
          // 快捷清除显示：成绩格全空（empty，非 draft）；不读正式 scores
          holeScore = '';
          isDraftScore = false;
        } else {
          // 快捷面板：显示待写入的快捷成绩（默认 PAR），按当前显示方式换算
          const g = quickPanelScores[idx] != null ? quickPanelScores[idx] : sheetPar;
          holeScore = formatMainScore(g, sheetPar, scoreDisplayMode);
          if (quickFreshDraft) {
            // 清除后恢复的 PAR 草稿：强制 draft，不读/不改正式 scores
            isDraftScore = true;
          } else {
            // 默认值（无正式 scores）→ draft；已有正式成绩 → 非 draft
            const formal = (p.scores || [])[sheetHoleIndex];
            isDraftScore = !isFilledScore(formal);
          }
        }
      } else if (clearDraft) {
        // 清除草稿（未选人）：本洞成绩栏全部置空（不读正式 scores）
        holeScore = '';
        isDraftScore = false;
      } else if (clearPending) {
        // 清除待确认：忽略正式 scores；仅当前编辑显示 panelScore（draft）
        if (idx === activePlayerIdx) {
          const draft = panelScore != null && panelScore !== '' ? panelScore : sheetPar;
          holeScore = formatMainScore(draft, sheetPar, scoreDisplayMode);
          isDraftScore = true;
        }
      } else {
        // 技术面板（普通单组）：active ≠ draft；仅 panel 相对正式分有改动才 draft
        const s = (p.scores || [])[sheetHoleIndex];
        const hasFormal = isFilledScore(s);
        if (idx === activePlayerIdx) {
          const draft = panelScore != null && panelScore !== '' ? panelScore : sheetPar;
          if (!hasFormal) {
            // 无正式成绩：显示 panelScore（默认 PAR）为草稿
            holeScore = formatMainScore(draft, sheetPar, scoreDisplayMode);
            isDraftScore = true;
          } else if (Number(draft) === Number(s)) {
            // 已有正式成绩且未改 panel：显示正式分，非 draft
            holeScore = formatMainScore(s, sheetPar, scoreDisplayMode);
            isDraftScore = false;
          } else {
            // 已有正式成绩但已改 panel：显示草稿
            holeScore = formatMainScore(draft, sheetPar, scoreDisplayMode);
            isDraftScore = true;
          }
        } else if (hasFormal) {
          holeScore = formatMainScore(s, sheetPar, scoreDisplayMode);
          isDraftScore = false;
        }
      }
      return {
        id: p.id,
        name: shortName,
        avatar: p.avatar,
        active: clearDraft ? false : idx === activePlayerIdx,
        holeScore: holeScore,
        isDraftScore: isDraftScore
      };
    });
    // 面板成绩控件显示值（内部仍以总杆 gross 存储；diff 模式仅转换显示）
    const panelMainDisplay = formatMainScore(panelScore, sheetPar, scoreDisplayMode);
    const quickPanelDisplay = (quickPanelScores || []).map((g) =>
      formatMainScore(g != null ? g : sheetPar, sheetPar, scoreDisplayMode)
    );
    this.setData({ sheetPlayers, panelMainDisplay, quickPanelDisplay });
  },

  _resolveScoreBackGameId() {
    const ms = this._matchState || this._readMatchState() || {};
    return (
      this.data.gameId ||
      ms.gameId ||
      (this._pageOptions && this._pageOptions.gameId) ||
      (this.options && this.options.gameId) ||
      ''
    );
  },

  onBack() {
    console.log('[SCORE_BACK_CLICKED]', {
      gameId: this.data.gameId,
      pageGameId: (this._pageOptions && this._pageOptions.gameId) || (this.options && this.options.gameId),
      currentGroupId: this.data.groupId,
      route: this.route
    });

    const matchStateForBack = this._readMatchState();
    // 队内赛 / 赛事记分：有 matchId 即回详情（含 stroke_entity，勿仅限 individual_stroke）
    if (matchStateForBack && matchStateForBack.matchId) {
      console.log('[score-back-source]', {
        source: 'teamMatch',
        matchId: matchStateForBack.matchId,
        mode: this.data.mode
      });
      this.persistSession();
      const pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack();
      } else {
        wx.redirectTo({
          url: '/pages/tournament/detail/index?matchId=' +
            encodeURIComponent(matchStateForBack.matchId)
        });
      }
      return;
    }

    if (this.data.gameId && (this.data.mode === 'game' || this.data.mode === 'fourball_best')) {
      console.log('[score-back-source]', {
        source: 'game',
        gameId: this.data.gameId
      });
      this.persistSession();
    }

    const gameId = this._resolveScoreBackGameId();
    const latestGame = gameId ? gameStore.getGameById(gameId) : null;
    const latestGroups = latestGame ? gameStore.listGroups(latestGame) : [];

    console.log('[SCORE_BACK_LATEST_GAME]', {
      gameId,
      hasGame: !!latestGame,
      groupsLength: latestGroups ? latestGroups.length : 0,
      groups: latestGroups
    });

    if (!gameId) {
      console.log('[SCORE_BACK_ACTION]', { action: 'home_no_gameId' });
      wx.reLaunch({ url: '/pages/home/index?tab=my' });
      return;
    }

    if (!latestGame) {
      console.log('[SCORE_BACK_ACTION]', { action: 'home_game_missing', gameId });
      wx.reLaunch({ url: '/pages/home/index?tab=my' });
      return;
    }

    if (latestGroups.length > 1) {
      const hubUrl =
        '/pages/game/hub/index?gameId=' + encodeURIComponent(gameId) +
        '&activeTab=teeingSheet&from=score';
      console.log('[SCORE_BACK_ACTION]', { action: 'redirectTo', hubUrl, groupsLength: latestGroups.length });
      wx.redirectTo({
        url: hubUrl,
        fail: (err) => {
          console.log('[SCORE_BACK_ACTION]', { action: 'reLaunch', hubUrl, err: err && err.errMsg });
          wx.reLaunch({ url: hubUrl });
        }
      });
      return;
    }

    console.log('[SCORE_BACK_ACTION]', { action: 'home_single_group', gameId, groupsLength: latestGroups.length });
    if (this.data.mode === 'game') {
      wx.reLaunch({ url: '/pages/home/index?tab=my' });
      return;
    }

    const ms = this._readMatchState();
    const groupCount = ms && ms.groupCount != null ? Number(ms.groupCount) : 0;
    if (groupCount <= 1) {
      wx.reLaunch({ url: '/pages/home/index' });
      return;
    }
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.reLaunch({ url: '/pages/home/index' });
  },

  switchScorecardTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  /** Phase1 shell：将纵滑位置同步到另一侧（scroll-top 需变值才生效） */
  _syncShellScrollTop(targetKey, top) {
    const next = Math.max(0, Number(top) || 0);
    const cur = Number(this.data[targetKey]) || 0;
    if (Math.abs(cur - next) < 0.5) {
      this._shellScrollLock = false;
      return;
    }
    const temp = next === 0 ? 0.01 : next + 0.01;
    this.setData({ [targetKey]: temp }, () => {
      this.setData({ [targetKey]: next }, () => {
        this._shellScrollLock = false;
      });
    });
  },

  onIdentityPanelScroll(e) {
    if (this._shellScrollLock === 'track') return;
    const top = e.detail.scrollTop || 0;
    if (this._lastIdentityScrollTop != null && Math.abs(this._lastIdentityScrollTop - top) < 0.5) {
      return;
    }
    this._lastIdentityScrollTop = top;
    this._shellScrollLock = 'identity';
    this._syncShellScrollTop('scoreTrackScrollTop', top);
  },

  /** 个人比杆新版 shell UI（普通创建 / 球队 G1）；与 _isGameSingleScoreContext 解耦 */
  _isGameSingleShell() {
    return !!this.data.useStrokeScoreShell;
  },

  /**
   * fourball score shell v2 门控。
   * 复用 isFourballPairLayout（有双人组且全组 ≤2）：纯 2+2 与含单人行的组合同壳；
   * 单人行由展示层居中退化，不另开模式。4+0 仍 Legacy。
   * 仅服务 mode === 'fourball_best'；队内 G2/G3 走 _resolveStrokeEntityFourballShell。
   */
  _resolveFourballScoreShell() {
    if (this.data.mode !== 'fourball_best') return false;
    const pairFlags = resolveFourballPairFlags(this._engineGroups || []);
    return !!pairFlags.isFourballPairLayout;
  },

  /**
   * 队内赛 G2/G3 4+0：接入普通局面 fourball40 stroke shell（useStrokeScoreShell）。
   * 不进 pair shell；不改 scoreEntities / teamScoresByEntity。
   * @param {object|null} match
   * @param {Array} [entitiesViewArg]
   */
  _resolveStrokeEntityFourball40Shell(match, entitiesViewArg) {
    const modeOk =
      this.data.mode === 'stroke_entity' || Array.isArray(entitiesViewArg);
    if (!modeOk) return false;
    const ms = this._matchState || this._readMatchState() || {};
    const gameMode = this._resolveTeamMatchGameMode(match, ms);
    if (resolveStrokeKind(gameMode) !== 'g2g3') return false;
    if (isMatchPlayBoardMode(gameMode)) return false;
    if (resolveCompositionMode(match) !== '4+0') return false;
    const rows = Array.isArray(entitiesViewArg)
      ? entitiesViewArg
      : this.data.entitiesView || [];
    if (!rows.length) return false;
    return rows.some((row) => row && row.kind === 'team');
  },

  /**
   * entitiesView → playersView（对齐 _buildFourball40PlayersView team 行）。
   * 仅展示适配；成绩仍用 entity.scores / putts。
   */
  _buildFourball40PlayersViewFromEntities(entitiesView, formatLabel, displayMode) {
    const label = String(formatLabel || '').trim() || '最佳球位';
    const rows = Array.isArray(entitiesView) ? entitiesView : [];
    return rows.map((entity, gi) => {
      const members = (
        Array.isArray(entity && entity.memberDisplay) ? entity.memberDisplay : []
      ).slice(0, 4);
      const scores = Array.isArray(entity && entity.scores) ? entity.scores.slice() : [];
      const putts = Array.isArray(entity && entity.putts) ? entity.putts.slice() : [];
      const entityId =
        (entity && entity.entityId != null && String(entity.entityId)) ||
        'entity-40-' + gi;

      const teeSegments = members.map((m, mi) => {
        const style = resolveScoreTeeStyle(m, gi * 4 + mi);
        const palette = TEE_PALETTE[mi % TEE_PALETTE.length];
        const hasExplicitTee = !!(m && (isEditTeeKey(m.tPosition) || isEditTeeKey(m.tee)));
        return {
          key: 'tee-' + gi + '-' + mi,
          teeColor: hasExplicitTee
            ? style.teeColor || (palette && palette.teeColor) || ''
            : (palette && palette.teeColor) || style.teeColor || ''
        };
      });

      const m0 = members[0] || {};
      const style = resolveScoreTeeStyle(m0, gi);
      const enriched = enrichPlayer(
        {
          id: entityId,
          playerId: entityId,
          name: label,
          avatar: '',
          colorClass: style.colorClass || 'border-light',
          scores: scores,
          putts: putts
        },
        gi,
        displayMode
      );
      return Object.assign({}, enriched, {
        rowKind: 'team',
        label: label,
        teeSegments: teeSegments,
        sourceGroupIndex: gi
      });
    });
  },

  /**
   * 队内赛 G2/G3 pair 布局（2+2 / 2+1）：接入 useFourballScoreShell（不改 fourball_best 门控）。
   * 对齐 resolveFourballPairFlags：有 pair 且全组 ≤2；3+/4+0 / G4 返回 false。
   * @param {Array} [entitiesViewArg] refreshEntities 刚生成的视图；缺省读 data.entitiesView
   */
  _resolveStrokeEntityFourballShell(entitiesViewArg) {
    // refreshEntities 同步调用时 setData(mode) 可能未落盘；传入 entitiesView 视为 entity 刷新上下文
    const modeOk =
      this.data.mode === 'stroke_entity' || Array.isArray(entitiesViewArg);
    if (!modeOk) return false;
    const ms = this._matchState || this._readMatchState() || {};
    const matchId = (ms && ms.matchId) || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const gameMode = this._resolveTeamMatchGameMode(match, ms);
    if (resolveStrokeKind(gameMode) !== 'g2g3') return false;
    if (isMatchPlayBoardMode(gameMode)) return false;
    const rows = Array.isArray(entitiesViewArg)
      ? entitiesViewArg
      : this.data.entitiesView || [];
    if (!rows.length) return false;
    const pairFlags = resolveFourballPairFlags(
      rows.map((row) => ({ members: (row && row.members) || [] }))
    );
    return !!pairFlags.isFourballPairLayout;
  },

  /**
   * entitiesView → fourballRowsView（与 _buildFourballRowsView 同构）。
   * 仅展示适配；不改 entity / scoreEntities / teamScoresByEntity / persist。
   * 支持 pair（2 人）与 single（1 人 / 2+1）。
   */
  _buildFourballRowsViewFromEntities(entitiesView) {
    const rows = Array.isArray(entitiesView) ? entitiesView : [];
    const out = [];
    const mapColumns = (entity) => {
      const cells = Array.isArray(entity && entity.cells) ? entity.cells : [];
      return cells.map((cell, colIdx) => {
        const c = cell || {};
        if (c.type === 'special') {
          return {
            colIdx: c.colIdx != null ? c.colIdx : colIdx,
            label: c.label || '',
            par: c.par,
            isSpecial: true,
            isTot: !!c.isTot,
            score: c.val,
            putts: c.puttTotal,
            diffStr: c.diffStr || '',
            diffClass: c.diffClass || 'diff-even',
            mainStr: '',
            scoreClass: '',
            holeIndex: c.holeIndex
          };
        }
        return {
          colIdx: c.colIdx != null ? c.colIdx : colIdx,
          label: c.label || '',
          par: c.par,
          isSpecial: false,
          isTot: false,
          score: c.score,
          mainStr: c.mainStr != null ? c.mainStr : '',
          putts: c.putts,
          diffStr: c.diffStr || '',
          diffClass: c.diffClass || 'diff-even',
          scoreClass: c.scoreClass || '',
          holeIndex: c.holeIndex
        };
      });
    };
    rows.forEach((entity, idx) => {
      const memberCount = Array.isArray(entity && entity.members) ? entity.members.length : 0;
      const id =
        (entity && entity.entityId != null && String(entity.entityId)) ||
        'entity-fb-' + idx;
      const diff = (entity && entity.teamDiffStr) || '';
      const diffClass = (entity && (entity.teamDiffClass || entity.relClass)) || '';
      const columns = mapColumns(entity);

      if (memberCount === 1) {
        const m0 =
          (Array.isArray(entity && entity.memberDisplay) && entity.memberDisplay[0]) || null;
        const teeStyle = resolveScoreTeeStyle(m0 || entity, idx);
        const teeColor =
          (teeStyle && teeStyle.teeColor) ||
          this._m2TeeColorFromClass(entity && entity.colorClass) ||
          '';
        const singleMember = {
          name: (entity && (entity.name || '')) || (m0 && m0.name) || '球员',
          displayName:
            (entity && (entity.displayName || entity.name || '')) ||
            (m0 && m0.name) ||
            '球员',
          avatar: (entity && (entity.avatar || '')) || (m0 && m0.avatar) || '',
          teeColor: teeColor
        };
        out.push({
          id: id,
          type: 'single',
          identity: { members: [singleMember] },
          lead: {
            diff: diff,
            diffClass: diffClass,
            tee: teeColor ? [teeColor] : []
          },
          columns: columns
        });
        return;
      }

      if (memberCount !== 2) return;
      const pairMembers = Array.isArray(entity && entity.pairMembers) ? entity.pairMembers : [];
      const identityMembers = pairMembers.slice(0, 2).map((m) => ({
        name: (m && m.name) || '球员',
        avatar: (m && m.avatar) || '',
        teeColor: (m && m.teeColor) || ''
      }));
      while (identityMembers.length < 2) {
        identityMembers.push({ name: '球员', avatar: '', teeColor: '' });
      }
      const name0 = identityMembers[0].name || '';
      const name1 = identityMembers[1].name || '';
      out.push({
        id: id,
        type: 'pair',
        identity: { members: identityMembers },
        collapsedNameView: this._buildFourballCollapsedNameView(name0, name1),
        lead: {
          diff: diff,
          diffClass: diffClass,
          tee: [identityMembers[0].teeColor, identityMembers[1].teeColor]
        },
        columns: columns
      });
    });
    return out;
  },

  /**
   * Phase5.2-d：折叠昵称可用宽（rpx）= 折叠后 identity(148) - 左右 padding(24)。
   */
  _getFourballCollapsedNameAvailableWidthRpx() {
    return 148 - 24;
  },

  /**
   * Phase5.2-d：按字估算昵称渲染宽（18rpx bold；CJK≈1em，拉丁≈0.55–0.65em）。
   */
  _estimateFourballNameTextWidthRpx(text) {
    const s = String(text || '');
    const fontSize = 18;
    let w = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charAt(i);
      const code = s.charCodeAt(i);
      if (
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3400 && code <= 0x4dbf) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xff00 && code <= 0xffef) ||
        (code >= 0x3000 && code <= 0x303f)
      ) {
        w += fontSize;
      } else if (code >= 0x41 && code <= 0x5a) {
        w += fontSize * 0.65;
      } else if (code >= 0x61 && code <= 0x7a) {
        w += fontSize * 0.55;
      } else if (code >= 0x30 && code <= 0x39) {
        w += fontSize * 0.6;
      } else if (ch === '/' || ch === '.' || ch === ' ' || ch === '·') {
        w += fontSize * 0.4;
      } else {
        w += fontSize * 0.6;
      }
    }
    return w;
  },

  /**
   * Phase5.2-d：折叠昵称布局模型。
   * combined：整串「A/B」可放得下；dual：左右分区，短侧优先内容宽，长侧吃剩余并省略。
   */
  _buildFourballCollapsedNameView(nameA, nameB) {
    const left = String(nameA || '').trim() || '—';
    const right = String(nameB || '').trim() || '—';
    const sep = '/';
    const available = this._getFourballCollapsedNameAvailableWidthRpx();
    const combined = left + sep + right;
    if (this._estimateFourballNameTextWidthRpx(combined) <= available) {
      return { mode: 'combined', text: combined };
    }

    const sepW = this._estimateFourballNameTextWidthRpx(sep);
    const rest = Math.max(0, available - sepW);
    const leftW = this._estimateFourballNameTextWidthRpx(left);
    const rightW = this._estimateFourballNameTextWidthRpx(right);
    const minSide = 24;
    const total = leftW + rightW || 1;
    let leftMax;
    let rightMax;

    if (leftW + rightW <= rest) {
      leftMax = leftW;
      rightMax = rightW;
    } else if (leftW < rightW && leftW + minSide <= rest) {
      // 左侧更短：优先完整显示短侧，长侧吃剩余并省略
      leftMax = leftW;
      rightMax = Math.max(minSide, rest - leftMax);
    } else if (rightW < leftW && rightW + minSide <= rest) {
      rightMax = rightW;
      leftMax = Math.max(minSide, rest - rightMax);
    } else {
      // 两侧都偏长或接近：按估算宽比例分，避免固定 50/50
      leftMax = Math.max(minSide, Math.floor((rest * leftW) / total));
      rightMax = Math.max(minSide, rest - leftMax);
      if (leftMax + rightMax > rest) {
        leftMax = Math.max(minSide, rest - rightMax);
      }
    }

    return {
      mode: 'dual',
      left: left,
      right: right,
      leftStyle: 'max-width:' + leftMax + 'rpx;',
      rightStyle: 'max-width:' + rightMax + 'rpx;'
    };
  },

  /**
   * bestTeams → fourballRowsView 适配层（不改 bestTeams / 不改成绩模型）。
   * columns / members 尽量保留原数组引用，供未来 shell 消费。
   */
  _buildFourballRowsView(bestTeams) {
    const rows = Array.isArray(bestTeams) ? bestTeams : [];
    return rows.map((item, idx) => {
      const kind = (item && item.kind) || 'single';
      const id = (item && item.id != null ? item.id : '') || 'fb-row-' + idx;
      const columns = item && item.columns ? item.columns : [];
      const diff = (item && item.teamDiffStr) || '';
      const diffClass = (item && (item.teamDiffClass || item.relClass)) || '';

      if (kind === 'pair') {
        const members = (item && item.pairMembers) || [];
        const tee = members.map((m) => (m && m.teeColor) || '');
        const name0 = (members[0] && (members[0].name || members[0].displayName)) || '';
        const name1 = (members[1] && (members[1].name || members[1].displayName)) || '';
        return {
          id: id,
          type: 'pair',
          identity: { members: members },
          collapsedNameView: this._buildFourballCollapsedNameView(name0, name1),
          lead: { diff: diff, diffClass: diffClass, tee: tee },
          columns: columns
        };
      }

      if (kind === 'team') {
        // teamMembers 来自 _buildBestTeams；若缺失则不猜测 roster，保持空数组
        const members = (item && Array.isArray(item.teamMembers) && item.teamMembers.length)
          ? item.teamMembers
          : [];
        const tee = members.length
          ? members.map((m) => (m && m.teeColor) || '')
          : [];
        return {
          id: id,
          type: 'team',
          identity: { members: members },
          lead: { diff: diff, diffClass: diffClass, tee: tee },
          columns: columns
        };
      }

      // single（含 2+1）：从行级字段组装单成员，避免丢行
      const singleMember = {
        name: (item && (item.name || '')) || '',
        displayName: (item && (item.displayName || item.name || '')) || '',
        avatar: (item && (item.avatar || '')) || '',
        teeColor: (item && (item.teeColor || '')) || ''
      };
      return {
        id: id,
        type: 'single',
        identity: { members: [singleMember] },
        lead: {
          diff: diff,
          diffClass: diffClass,
          tee: singleMember.teeColor ? [singleMember.teeColor] : []
        },
        columns: columns
      };
    });
  },

  /** game-single：窗口宽（rpx→px） */
  _getGameSingleWindowWidth() {
    if (this._gameSingleWindowWidthCache != null) return this._gameSingleWindowWidthCache;
    let ww = 375;
    try {
      ww = (wx.getSystemInfoSync() || {}).windowWidth || 375;
    } catch (err) {
      ww = 375;
    }
    this._gameSingleWindowWidthCache = ww;
    return ww;
  },

  /** game-single：diff 列宽 96rpx → px（T sticky 显示阈值） */
  _getGameSingleTeeStickyThresholdPx() {
    if (this._teeStickyThresholdPxCache != null) return this._teeStickyThresholdPxCache;
    this._teeStickyThresholdPxCache = (96 * this._getGameSingleWindowWidth()) / 750;
    return this._teeStickyThresholdPxCache;
  },

  /** 仅切换 T sticky overlay 显隐，不做位移补偿 */
  _syncGameSingleTeeSticky(scrollLeft) {
    if (!this._isGameSingleShell()) {
      if (this.data.isTeeStickyVisible) this.setData({ isTeeStickyVisible: false });
      return;
    }
    const left = Math.max(0, Number(scrollLeft) || 0);
    const visible = left + 0.5 >= this._getGameSingleTeeStickyThresholdPx();
    if (visible === !!this.data.isTeeStickyVisible) return;
    this.setData({ isTeeStickyVisible: visible });
  },

  /** match-play T sticky（仅 G5 single；G6/G7 pair 走 _syncMatchPlayPairShellScrollState） */
  _syncMatchPlayTeeSticky(scrollLeft) {
    if (!this.data.useMatchPlayScoreShell || this.data.isMatchPlayPairLayout) {
      if (!this.data.useMatchPlayScoreShell && this.data.isMatchPlayTeeStickyVisible) {
        this.setData({ isMatchPlayTeeStickyVisible: false });
      }
      return;
    }
    const left = Math.max(0, Number(scrollLeft) || 0);
    const visible = left + 0.5 >= this._getGameSingleTeeStickyThresholdPx();
    if (visible === !!this.data.isMatchPlayTeeStickyVisible) return;
    this.setData({ isMatchPlayTeeStickyVisible: visible });
  },

  /** match-play HOLE/PAR overlay 横移（仅 G5 single；pair 走原子同步） */
  _syncMatchPlayHoleParMove(scrollLeft) {
    if (!this.data.useMatchPlayScoreShell || this.data.isMatchPlayPairLayout) {
      if (
        !this.data.useMatchPlayScoreShell &&
        this.data.matchPlayHoleParNormalStyle !== 'transform: translateX(0px);'
      ) {
        this.setData({ matchPlayHoleParNormalStyle: 'transform: translateX(0px);' });
      }
      return;
    }
    const left = Math.max(0, Number(scrollLeft) || 0);
    const threshold = this._getGameSingleTeeStickyThresholdPx();
    const progress = threshold > 0 ? Math.min(1, left / threshold) : 0;
    const travelPx = (51 * this._getGameSingleWindowWidth()) / 750;
    const tx = -travelPx * progress;
    const style = 'transform: translateX(' + tx + 'px);';
    if (style === this.data.matchPlayHoleParNormalStyle) return;
    this.setData({ matchPlayHoleParNormalStyle: style });
  },

  /**
   * G6/G7 pair：对齐 fourball `_syncFourballShellScrollState`
   * 一次 setData：collapse + track compensate + tee sticky + hole/par
   */
  _syncMatchPlayPairShellScrollState(scrollLeft, seq) {
    if (!this.data.useMatchPlayScoreShell || !this.data.isMatchPlayPairLayout) {
      const resetStyle = 'transform: translateX(0px);';
      if (
        this.data.matchPlayIdentityCollapseProgress ||
        this.data.matchPlayTrackInnerStyle !== resetStyle
      ) {
        this.setData({
          matchPlayIdentityCollapseProgress: 0,
          matchPlayTrackInnerStyle: resetStyle
        });
      }
      return;
    }
    if (typeof seq === 'number' && seq !== this._matchPlayScrollSeq) return;

    const left = Math.max(0, Number(scrollLeft) || 0);
    const resetStyle = 'transform: translateX(0px);';
    let next;
    if (left < 1) {
      next = {
        matchPlayIdentityCollapseProgress: 0,
        isMatchPlayTeeStickyVisible: false,
        matchPlayTrackInnerStyle: resetStyle,
        matchPlayHoleParNormalStyle: resetStyle
      };
    } else {
      const progress = this._calculateFourballIdentityCollapseProgress(left);
      const compensatePx = this._calculateFourballTrackPhaseCompensatePx(left);
      const holeParTx = this._calculateFourballHoleParOffsetX(left);
      next = {
        matchPlayIdentityCollapseProgress: progress,
        isMatchPlayTeeStickyVisible: this._shouldFourballTeeStickyVisible(left),
        matchPlayTrackInnerStyle: 'transform: translateX(' + compensatePx + 'px);',
        matchPlayHoleParNormalStyle: 'transform: translateX(' + holeParTx + 'px);'
      };
    }
    const cur = this.data;
    if (
      next.matchPlayIdentityCollapseProgress === cur.matchPlayIdentityCollapseProgress &&
      next.isMatchPlayTeeStickyVisible === !!cur.isMatchPlayTeeStickyVisible &&
      next.matchPlayTrackInnerStyle === cur.matchPlayTrackInnerStyle &&
      next.matchPlayHoleParNormalStyle === cur.matchPlayHoleParNormalStyle
    ) {
      return;
    }
    if (typeof seq === 'number' && seq !== this._matchPlayScrollSeq) return;

    this.setData(next, () => {
      if (typeof seq === 'number' && seq !== this._matchPlayScrollSeq) {
        this._syncMatchPlayPairShellScrollState(
          this._matchPlayLatestScrollLeft,
          this._matchPlayScrollSeq
        );
      }
    });
  },

  /**
   * Phase1：hole-par-normal 随 scrollLeft 左移（中心 115→64rpx，行程 51rpx）
   * 进度与 T sticky 阈值对齐；不切换 compact / 不隐藏 normal
   */
  _syncGameSingleHoleParMove(scrollLeft) {
    if (!this._isGameSingleShell()) {
      if (this.data.holeParNormalStyle !== 'transform: translateX(0px);') {
        this.setData({ holeParNormalStyle: 'transform: translateX(0px);' });
      }
      return;
    }
    const left = Math.max(0, Number(scrollLeft) || 0);
    const threshold = this._getGameSingleTeeStickyThresholdPx();
    const progress = threshold > 0 ? Math.min(1, left / threshold) : 0;
    const travelPx = (51 * this._getGameSingleWindowWidth()) / 750;
    const tx = -travelPx * progress;
    const style = 'transform: translateX(' + tx + 'px);';
    if (style === this.data.holeParNormalStyle) return;
    this.setData({ holeParNormalStyle: style });
  },

  onScoreTrackScroll(e) {
    const scrollLeft = (e.detail && e.detail.scrollLeft) || 0;
    this._syncGameSingleTeeSticky(scrollLeft);
    this._syncGameSingleHoleParMove(scrollLeft);
    if (this.data.useMatchPlayScoreShell && this.data.isMatchPlayPairLayout) {
      // G6/G7：collapse + compensate + tee sticky + hole/par 原子同步（对齐 fourball）
      this._matchPlayLatestScrollLeft = scrollLeft;
      this._matchPlayScrollSeq = (this._matchPlayScrollSeq || 0) + 1;
      this._syncMatchPlayPairShellScrollState(scrollLeft, this._matchPlayScrollSeq);
    } else {
      this._syncMatchPlayTeeSticky(scrollLeft);
      this._syncMatchPlayHoleParMove(scrollLeft);
    }

    if (this._shellScrollLock === 'identity') return;
    const top = e.detail.scrollTop || 0;
    // 纯横滑时 scrollTop 不变，跳过纵同步
    if (this._lastTrackScrollTop != null && Math.abs(this._lastTrackScrollTop - top) < 0.5) {
      return;
    }
    this._lastTrackScrollTop = top;
    this._shellScrollLock = 'track';
    this._syncShellScrollTop('identityPanelScrollTop', top);
  },

  /**
   * fourball identity 折叠进度：scrollLeft / 72 → 0~1（无 easing / 无 UI 副作用）。
   */
  _calculateFourballIdentityCollapseProgress(scrollLeft) {
    const threshold = 72;
    const left = Math.max(0, Number(scrollLeft) || 0);
    return Math.min(1, Math.max(0, left / threshold));
  },

  /**
   * Phase6.1：阶段1 保护区补偿量（px）。
   * scrollLeft∈[0,72] → 全额补偿（track 视觉不动）；>72 → 封顶 72（阶段2 相对滑动）。
   */
  _calculateFourballTrackPhaseCompensatePx(scrollLeft) {
    const phase1 = 72;
    const left = Math.max(0, Number(scrollLeft) || 0);
    return Math.min(phase1, left);
  },

  /**
   * Phase7.4：HOLE/PAR 横滑 offset（px）。
   * 阶段1（≤72）：0，中心由 anchor width（identity 压缩）承担；
   * 阶段2：随 lead 左移，进度对齐 tee sticky（extra/diff宽），行程 51rpx（125→74），封顶不跟无限滚。
   */
  _calculateFourballHoleParOffsetX(scrollLeft) {
    const left = Math.max(0, Number(scrollLeft) || 0);
    const phase1Px = 72;
    if (left <= phase1Px) return 0;
    const extra = left - phase1Px;
    const diffWPx = this._getFourballDiffLeadWidthPx();
    const progress2 = diffWPx > 0 ? Math.min(1, extra / diffWPx) : 1;
    const travelPx = (51 * this._getGameSingleWindowWidth()) / 750;
    return Math.round(-travelPx * progress2 * 100) / 100;
  },

  /**
   * Phase5.3 开发期几何检查（只读 console；不改布局 / 不改业务）。
   * 用法：getCurrentPages()[0]._measureFourballIdentityGeometry()
   * 分别在 scrollLeft≈0 / ≈72 各测一次，对比 playerColumnWidth / identityWidth / leadLeft。
   */
  _measureFourballIdentityGeometry() {
    const page = this;
    const label =
      'geometry_' +
      (Number(page.data.fourballIdentityCollapseProgress) >= 0.99
        ? 'collapsed'
        : Number(page.data.fourballScrollLeft) < 1
          ? 'initial'
          : 'mid');
    wx.createSelectorQuery()
      .in(page)
      .select('.scoreboard-shell--fourball .fourball-player-column')
      .boundingClientRect()
      .select('.scoreboard-shell--fourball .fourball-pair-identity')
      .boundingClientRect()
      .select('.scoreboard-shell--fourball .fourball-pair-identity .avatar-group')
      .boundingClientRect()
      .select('.scoreboard-shell--fourball .fourball-track-lead--diff')
      .boundingClientRect()
      .exec((res) => {
        const col = res && res[0];
        const identity = res && res[1];
        const avatarGroup = res && res[2];
        const lead = res && res[3];
        const out = {
          label: label,
          scrollLeft: page.data.fourballScrollLeft,
          collapseProgress: page.data.fourballIdentityCollapseProgress,
          playerColumnWidth: col ? col.width : null,
          identityWidth: identity ? identity.width : null,
          avatarWidth: avatarGroup ? avatarGroup.width : null,
          leadLeft: lead ? lead.left : null,
          leadWidth: lead ? lead.width : null
        };
        console.log('[fourball geometry]', out);
        return out;
      });
  },

  /**
   * fourball track lead diff 宽 96rpx → px（与 identity 压缩完成后的视觉横移对齐）。
   */
  _getFourballDiffLeadWidthPx() {
    return (96 * this._getGameSingleWindowWidth()) / 750;
  },

  /**
   * fourball T sticky 是否应显示（Phase6.2 阈值；只计算，不 setData）。
   */
  _shouldFourballTeeStickyVisible(scrollLeft) {
    const left = Math.max(0, Number(scrollLeft) || 0);
    const phase1Px = 72;
    const diffWPx = this._getFourballDiffLeadWidthPx();
    return left + 0.5 >= phase1Px + diffWPx;
  },

  /**
   * fourball T sticky（兼容入口）：Phase6.5 禁止独立 setData，一律转发原子同步。
   */
  _syncFourballTeeSticky(scrollLeft) {
    this._syncFourballShellScrollState(scrollLeft);
  },

  /**
   * Phase6.5 / 7.4：由 scrollLeft 原子推导 shell 横滑派生态
   * （collapse / compensate / tee sticky / hole-par offset）。
   * scrollLeft<1 时强制归零；seq 过期则丢弃，setData 完成后若已有更新则补齐最新 scrollLeft。
   */
  _syncFourballShellScrollState(scrollLeft, seq) {
    if (typeof seq === 'number' && seq !== this._fourballScrollSeq) return;

    const left = Math.max(0, Number(scrollLeft) || 0);
    const resetStyle = 'transform: translateX(0px);';
    let next;
    if (left < 1) {
      next = {
        fourballScrollLeft: 0,
        fourballIdentityCollapseProgress: 0,
        fourballTeeStickyVisible: false,
        fourballTrackInnerStyle: resetStyle,
        fourballHoleParOffsetX: 0
      };
    } else {
      const progress = this._calculateFourballIdentityCollapseProgress(left);
      const compensatePx = this._calculateFourballTrackPhaseCompensatePx(left);
      next = {
        fourballScrollLeft: left,
        fourballIdentityCollapseProgress: progress,
        fourballTeeStickyVisible: this._shouldFourballTeeStickyVisible(left),
        fourballTrackInnerStyle: 'transform: translateX(' + compensatePx + 'px);',
        fourballHoleParOffsetX: this._calculateFourballHoleParOffsetX(left)
      };
    }
    const cur = this.data;
    if (
      next.fourballScrollLeft === cur.fourballScrollLeft &&
      next.fourballIdentityCollapseProgress === cur.fourballIdentityCollapseProgress &&
      next.fourballTeeStickyVisible === !!cur.fourballTeeStickyVisible &&
      next.fourballTrackInnerStyle === cur.fourballTrackInnerStyle &&
      next.fourballHoleParOffsetX === cur.fourballHoleParOffsetX
    ) {
      return;
    }
    if (typeof seq === 'number' && seq !== this._fourballScrollSeq) return;

    this.setData(next, () => {
      if (typeof seq === 'number' && seq !== this._fourballScrollSeq) {
        this._syncFourballShellScrollState(
          this._fourballLatestScrollLeft,
          this._fourballScrollSeq
        );
      }
    });
  },

  /**
   * fourball shell track 横滑（独立于 Legacy onScoreboardScroll / G1 onScoreTrackScroll）。
   * Phase6.5：单一写入口 + 滚动 seq，始终只应用最新 scrollLeft。
   */
  onFourballScoreTrackScroll(e) {
    const scrollLeft = Math.max(0, Number((e.detail && e.detail.scrollLeft) || 0));
    if (this.data.useFourballScoreShell) {
      this._fourballLatestScrollLeft = scrollLeft;
      this._fourballScrollSeq = (this._fourballScrollSeq || 0) + 1;
      this._syncFourballShellScrollState(scrollLeft, this._fourballScrollSeq);
    }
    if (this._shellScrollLock === 'identity') return;
    const top = (e.detail && e.detail.scrollTop) || 0;
    if (this._lastTrackScrollTop != null && Math.abs(this._lastTrackScrollTop - top) < 0.5) {
      return;
    }
    this._lastTrackScrollTop = top;
    this._shellScrollLock = 'track';
    this._syncShellScrollTop('identityPanelScrollTop', top);
  },

  // 复刻原型 updateCompactAvatarColumn：scrollLeft → progress → eased，仅更新 CSS 变量
  onScoreboardScroll(e) {
    const isBest = this.data.mode === 'fourball_best';
    const isEntity = this.data.mode === 'stroke_entity';
    // G1 已迁 scoreboard-shell，不再走本滚动缩列逻辑
    if (!isBest && !isEntity && !this.data.isG5MatchPlay) {
      return;
    }
    const scrollLeft = e.detail.scrollLeft || 0;

    // fourball pair（2+2 / 2+1）或 4+0 team：两阶段横滑（不影响 entity / G5–G8 / 3+0）
    if (isBest && (this.data.isFourballPairLayout || this.data.isFourballTeamLayout)) {
      this._applyFourballPair22Scroll(scrollLeft);
      return;
    }

    const progress = Math.min(1, Math.max(0, scrollLeft / 72));
    const eased = 1 - Math.pow(1 - progress, 3);
    const entityHasPair =
      isEntity &&
      (this.data.entitiesView || []).some((row) => row && row.kind === 'pair');
    // G6/G7/G8 比洞组合行：与 Entity pair 共用滑动缩进变量
    const matchSideHasPair =
      !!this.data.isG5MatchPlay &&
      (this.data.matchSidesView || []).some((row) => row && row.kind === 'pair');
    const hasPairSwipe =
      (isBest && progress > 0 && this._engineHasPairGroups()) ||
      (entityHasPair && progress > 0) ||
      (matchSideHasPair && progress > 0);
    const paddingX = 24 - (24 - 16) * eased;
    const diffOpacity = Math.max(0, 1 - progress * 1.35);
    const usePairDiffCol = isBest || isEntity || matchSideHasPair;
    const diffColW = usePairDiffCol ? 96 * diffOpacity : 96;
    let colWidth;
    if (hasPairSwipe) {
      colWidth = this._computePairSwipeColumnWidth(paddingX, progress, diffColW);
    } else {
      const startW = isBest
        ? this._computeBestballColStartWidth()
        : isEntity
          ? entityHasPair
            ? 344
            : 300
          : matchSideHasPair
            ? 344
            : 240;
      const minW = usePairDiffCol ? Math.max(200, Math.round(startW * 0.67)) : 128;
      colWidth = startW - (startW - minW) * eased;
    }
    const nameWidth = 192 - (192 - 88) * eased;
    const labelSize = 30 - (30 - 20) * eased;
    const bestDiffGrow = usePairDiffCol ? diffOpacity : 1;
    const pairSecondShift = -(PAIR_SWIPE_GEOM.SECOND_SHIFT_MAX * progress);
    let pairContainerShift = 0;
    if (hasPairSwipe) {
      pairContainerShift = this._computePairSwipeContainerShift(colWidth, paddingX, progress);
    }
    const style = this._buildScoreboardStyleVars({
      colWidth: colWidth,
      paddingX: paddingX,
      diffOpacity: diffOpacity,
      nameWidth: nameWidth,
      bestDiffGrow: bestDiffGrow,
      diffColW: diffColW,
      pairSecondShift: pairSecondShift,
      pairContainerShift: pairContainerShift,
      labelSize: labelSize
    });
    if (style !== this.data.scoreboardStyle) {
      this.setData({ scoreboardStyle: style });
    }
  },

  toggleGameInfo() {
    const next = !this.data.gameInfoOpen;
    if (!next) {
      this.setData({ gameInfoOpen: false });
      return;
    }
    // 先实测“球场信息行”底部位置，再展开根级 fixed 浮层，避免任何 reflow / 推挤
    this._measureGameInfoAnchor(() => {
      this.setData({ gameInfoOpen: true });
    });
  },

  // 测量 course-game-info 行底部，作为 Context Panel 的 fixed top；并据屏高约束最大高度
  _measureGameInfoAnchor(cb) {
    let winH = 0;
    try {
      const info = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
      winH = info.windowHeight || info.screenHeight || 0;
    } catch (e) { winH = 0; }
    wx.createSelectorQuery()
      .in(this)
      .select('#course-game-info')
      .boundingClientRect((rect) => {
        const top = rect ? Math.max(0, Math.round(rect.bottom)) : 0;
        const maxH = winH ? Math.max(160, Math.round(winH - top)) : Math.round((winH || 600) * 0.6);
        this.setData({ gameInfoTop: top, gameInfoMaxH: maxH });
        if (typeof cb === 'function') cb();
      })
      .exec();
  },

  closeGameInfo() {
    if (this.data.gameInfoOpen) this.setData({ gameInfoOpen: false });
  },

  toggleSheet() {
    const show = !this.data.showMoreSheet;
    if (show) {
      const panels = this._resolveMoreMenuForCurrentContext();
      this.setData({
        showMoreSheet: true,
        moreMenuItems: panels.moreMenuItems,
        addDeleteDisabled: this._resolveAddDeleteDisabled()
      });
      return;
    }
    this.setData({ showMoreSheet: false });
  },

  /** 仅重建 HOLE/PAR 显示；scores[0..17] 绑定记分格位置，禁止搬迁或清空 */
  _syncHoleLayoutFromCourse(options) {
    const opts = options || {};
    const ctx = {};
    const ms = this._matchState || this._readMatchState();

    if (this.data.gameId) {
      const game = gameStore.getGame(this.data.gameId);
      if (game) {
        ctx.courseId = game.courseId;
        ctx.courseName = game.courseName;
        ctx.front9Course = game.front9Course;
        ctx.back9Course = game.back9Course;
      }
    } else if (this.data.mode === 'individual_stroke') {
      const c = (ms && ms.course) || {};
      ctx.courseId = c.courseId;
      ctx.courseName = c.courseName;
      ctx.front9Course = c.front9Course;
      ctx.back9Course = c.back9Course;
    } else if (ms && ms.course) {
      const c = ms.course;
      ctx.courseId = c.courseId;
      ctx.courseName = c.courseName;
      ctx.front9Course = c.front9Course;
      ctx.back9Course = c.back9Course;
    }

    const layout = holeLayout.resolveLayoutFromContext(ctx);
    holeLayout.applyLayout(layout);

    if (this.data.mode === 'individual_stroke') {
      groupsStore.setHolePars(layout.holePars);
    }

    const isG5Cols = !!this.data.isG5MatchPlay;
    let g5StartHole = null;
    if (isG5Cols) {
      const msLayout = this._matchState || this._readMatchState() || {};
      const matchIdLayout = (msLayout && msLayout.matchId) || '';
      const matchLayout = matchIdLayout ? teamMatchStore.getMatchById(matchIdLayout) : null;
      const modeLayout = this._resolveTeamMatchGameMode(matchLayout, msLayout);
      g5StartHole = this._resolveMatchPlayStartHoleForUi(
        matchLayout,
        this.data.groupId || (msLayout && msLayout.groupId) || '',
        modeLayout
      );
    }
    const patch = {
      columns: isG5Cols ? buildG5Columns(g5StartHole) : buildColumns()
    };

    if (this.data.showScoreSheet) {
      const hi = this.data.sheetHoleIndex;
      if (hi >= 0 && hi < holeLayout.SCORE_CELL_COUNT) {
        const cIdx = isG5Cols ? hi : hi < 9 ? hi : hi + 1;
        patch.sheetHoleLabel = isG5Cols
          ? (g5HoleColumnLabels()[hi] || '')
          : columnLabels()[cIdx];
        patch.sheetPar = holePars()[hi];
        const p = (this._playersSource || [])[this.data.activePlayerIdx];
        const raw = p && (p.scores || [])[hi];
        if (isFilledScore(raw)) {
          patch.panelScore = raw;
          const putt = p.putts && p.putts[hi];
          if (putt != null && putt !== '') patch.panelPutt = putt;
          patch.panelFairway = resolveHoleFairway(p.fairways, hi);
          patch.panelPenalty = resolveHolePenalty(p.penalties, hi);
          patch.panelBunker = resolveHoleSand(p.sands, hi);
        }
        if (this.data.scorePanelMode === 'quick') {
          patch.quickPanelScores = this._quickDefaultsForHole(hi, holePars()[hi]);
        }
      }
    }

    if (opts.refresh === false) {
      this.setData(patch);
    } else {
      this.setData(patch, () => this.refreshPlayers());
    }
  },

  openEditHalfSheet() {
    this.setData({ halfSheetVisible: true });
  },

  closeHalfSheet() {
    this.setData({ halfSheetVisible: false });
  },

  /**
   * 修改T台：当前记分组球员列表（个人维度）。
   * - 队内赛 G1–G8：当前组 match.groups[].players
   * - 普通创建：_playersSource
   * - stroke_entity 且无 groups：铺平 Entity members
   */
  _buildEditTeeSheetPlayers() {
    const match = this._readScoreTeamMatch();
    const group = this._findScoreTeamMatchGroup(match);
    const rows = [];
    const seen = {};

    const pushPlayer = (raw) => {
      const playerId = String(
        (raw && (raw.playerId || raw.userId || raw.id)) || ''
      ).trim();
      if (!playerId || seen[playerId]) return;
      seen[playerId] = true;
      const gender = resolveScoreDisplayGender(raw, playerId);
      let tPosition = isEditTeeKey(raw && raw.tPosition)
        ? raw.tPosition
        : isEditTeeKey(raw && raw.tee)
          ? raw.tee
          : '';
      if (!tPosition) {
        tPosition = applyScorePlayerTeeFields(
          { playerId: playerId, gender: gender, tPosition: '' },
          rows.length
        ).tPosition;
      }
      const name =
        (raw && (raw.name || raw.nickname || raw.competitionName || raw.matchNickname)) ||
        playerId;
      rows.push({
        playerId: playerId,
        name: this._shortName(name) || name || '球员',
        avatar: mockAvatars.resolveAvatar(
          (raw && (raw.avatar || raw.avatarUrl)) || '',
          playerId
        ),
        gender: gender,
        tPosition: tPosition,
        teeDots: EDIT_TEE_OPTIONS.map((opt) => ({
          key: opt.key,
          label: opt.label,
          color: opt.color,
          selected: tPosition === opt.key
        }))
      });
    };

    if (group && Array.isArray(group.players) && group.players.length) {
      const filled = listFilledPlayers(group);
      filled.forEach((fp) => {
        const entry =
          (Array.isArray(group.players) &&
            group.players.find((p) => {
              const id = String((p && (p.userId || p.playerId || p.id)) || '').trim();
              return id && isSameUserIdentity(id, fp.userId);
            })) ||
          {};
        const profile = this._buildScoreTeamMatchPlayerProfile(match, fp.userId, entry);
        pushPlayer({
          playerId: fp.userId,
          userId: fp.userId,
          name: profile.name || entry.name || fp.userId,
          avatar: profile.avatar || entry.avatar || '',
          gender: profile.gender || entry.gender || '',
          matchGender: profile.matchGender || entry.matchGender || '',
          tPosition: entry.tPosition || entry.tee || '',
          tee: entry.tee || ''
        });
      });
      if (rows.length) return rows;
    }

    if (this.data.mode === 'stroke_entity') {
      const nameMap = this._resolveEntityMemberNameMap();
      (this._entitiesSource || []).forEach((entity) => {
        const members = this._buildEntityMemberDisplay(entity, match, nameMap);
        (members || []).forEach((m) => {
          pushPlayer({
            playerId: m.userId,
            userId: m.userId,
            name: m.name,
            avatar: m.avatar,
            gender: m.gender,
            tPosition: m.tPosition
          });
        });
      });
      if (rows.length) return rows;
    }

    (this._playersSource || []).forEach((p) => {
      pushPlayer(p);
    });
    return rows;
  },

  openEditTeeSheet() {
    const editTeePlayers = this._buildEditTeeSheetPlayers();
    if (!editTeePlayers.length) {
      wx.showToast({ title: '暂无球员', icon: 'none' });
      return;
    }
    this.setData({
      editTeeSheetVisible: true,
      editTeePlayers: editTeePlayers
    });
  },

  closeEditTeeSheet() {
    this.setData({
      editTeeSheetVisible: false,
      editTeePlayers: []
    });
  },

  /** 从 editTeePlayers 解析 playerId → tPosition */
  _editTeeMapFromSheet() {
    const map = {};
    (this.data.editTeePlayers || []).forEach((row) => {
      if (!row || !isEditTeeKey(row.tPosition)) return;
      const id = String(row.playerId || '').trim();
      if (!id) return;
      map[id] = row.tPosition;
    });
    return map;
  },

  _resolveEditTeeForPlayerId(teeMap, playerId) {
    const key = String(playerId || '').trim();
    if (!key || !teeMap) return '';
    if (teeMap[key]) return teeMap[key];
    const ids = Object.keys(teeMap);
    for (let i = 0; i < ids.length; i++) {
      if (isSameUserIdentity(ids[i], key)) return teeMap[ids[i]];
    }
    return '';
  },

  /** 同步内存记分源 / demoSlots 的 tPosition（不写 scoreData） */
  _syncLocalPlayersTeeFromMap(teeMap) {
    const patchOne = (p, index) => {
      if (!p) return p;
      const tee = this._resolveEditTeeForPlayerId(teeMap, p.playerId || p.id || p.userId);
      if (!tee) return p;
      const teeFields = applyScorePlayerTeeFields(
        {
          playerId: p.playerId || p.id || p.userId,
          gender: p.gender || '',
          matchGender: p.matchGender || '',
          tPosition: tee
        },
        index
      );
      return Object.assign({}, p, {
        tPosition: teeFields.tPosition,
        gender: teeFields.gender || p.gender || '',
        colorClass: teeFields.colorClass
      });
    };
    if (Array.isArray(this._playersSource)) {
      this._playersSource = this._playersSource.map(patchOne);
    }
    if (Array.isArray(this._demoSlots)) {
      this._demoSlots = this._demoSlots.map((p, i) => (p ? patchOne(p, i) : null));
    }
  },

  /**
   * 将弹层 T 台选择写入持久化（不改 scoreData / matchPlayResult）
   * - 普通创建：更新 _playersSource → persistSession → gameStore.playersSlots
   * - 队内赛：更新 match.groups[].players.tPosition → saveMatch
   */
  _applyEditTeeChanges() {
    const teeMap = this._editTeeMapFromSheet();
    if (!Object.keys(teeMap).length) {
      return { ok: false, reason: 'empty' };
    }

    const match = this._readScoreTeamMatch();
    const group = this._findScoreTeamMatchGroup(match);

    if (match && group && Array.isArray(group.players)) {
      const groupId = String(group.groupId || '');
      match.groups = (match.groups || []).map((g) => {
        if (!g || String(g.groupId || '') !== groupId) return g;
        const players = (Array.isArray(g.players) ? g.players : []).map((p) => {
          if (!p) return p;
          const id = String(p.userId || p.playerId || p.id || '').trim();
          const tee = this._resolveEditTeeForPlayerId(teeMap, id);
          if (!tee) return p;
          return Object.assign({}, p, { tPosition: tee });
        });
        return Object.assign({}, g, { players: players });
      });
      teamMatchStore.saveMatch(match);
      this._syncLocalPlayersTeeFromMap(teeMap);
      return { ok: true, path: 'teamMatch' };
    }

    this._syncLocalPlayersTeeFromMap(teeMap);
    this.persistSession();
    // 普通 fourball composition：T 台展示读 _engineGroups.members，需同步 composition
    // 覆盖：四人两球 / 最好成绩·最佳球位 4+0·2+2 等
    if (this._needsOrdinaryFourballCompositionTeeSync()) {
      this._syncOrdinaryFourball2BallTeeFromMap(teeMap);
    }
    return { ok: true, path: 'game' };
  },

  /**
   * 普通创建 fourball_best：记分页 T 台读 composition / _engineGroups.members 时需同步。
   * 四人两球 + 最好成绩/最佳球位（4+0 / 2+2 / 3+1 等有 composition.teams）。
   */
  _needsOrdinaryFourballCompositionTeeSync() {
    return (
      this._isOrdinaryFourball2BallContext() || this._isOrdinaryFourballBestCompositionContext()
    );
  },

  /**
   * 普通创建 fourball composition：按 playerId 把 T 台写回
   * composition.teams.members / matchState.groups / _engineGroups.members。
   * 覆盖四人两球、最好成绩/最佳球位 4+0·2+2 等。
   * 不改 teamId / teamScoresByEntity / 成绩数组。
   */
  _syncOrdinaryFourball2BallTeeFromMap(teeMap) {
    if (!this._needsOrdinaryFourballCompositionTeeSync() || !teeMap) return false;
    const gameId = this.data.gameId;
    const gi = this._gameGroupIndex || 0;
    const game = gameStore.getGame(gameId);
    if (!game) return false;

    const patchMember = (m) => {
      if (!m) return m;
      const id = String(m.playerId || m.userId || m.id || '').trim();
      const tee = this._resolveEditTeeForPlayerId(teeMap, id);
      if (!tee) return m;
      const slot =
        (this._demoSlots || []).find(
          (p) => p && String(p.playerId || p.id || '').trim() === id
        ) ||
        (this._playersSource || []).find(
          (p) => p && String(p.playerId || p.id || '').trim() === id
        ) ||
        null;
      const gender = (slot && slot.gender) || m.gender || '';
      return Object.assign({}, m, {
        tPosition: tee,
        tee: tee,
        gender: gender
      });
    };
    const patchTeam = (t) => {
      if (!t) return t;
      const members = (Array.isArray(t.members) ? t.members : []).map(patchMember);
      const players = Array.isArray(t.players) ? t.players.map(patchMember) : members.slice();
      return Object.assign({}, t, { members: members, players: players });
    };

    const storeGroups = gameStore.listGroups(game);
    const group = storeGroups[gi] || {};
    const groupId = group.groupId || gameId + '-g' + (gi + 1);
    const prevMap =
      game.groupCompositionMap && typeof game.groupCompositionMap === 'object'
        ? game.groupCompositionMap
        : {};
    const prevComp = prevMap[groupId] || group.composition || game.composition || null;
    if (prevComp && Array.isArray(prevComp.teams)) {
      const nextComp = Object.assign({}, prevComp, {
        teams: prevComp.teams.map(patchTeam)
      });
      game.groupCompositionMap = Object.assign({}, prevMap, { [groupId]: nextComp });
      game.composition = {
        type: nextComp.compositionType || (game.composition && game.composition.type) || '',
        single: nextComp.teamMode === 'single_team',
        teams: nextComp.teams,
        scoringTemplate:
          nextComp.scoringTemplate ||
          (game.composition && game.composition.scoringTemplate) ||
          'team_best'
      };
      if (Array.isArray(game.groups) && game.groups[gi]) {
        game.groups[gi] = Object.assign({}, game.groups[gi], { composition: nextComp });
      }
      gameStore.saveGame(game);
    } else if (this._isOrdinaryFourball2BallContext()) {
      // 四人两球无 composition 时走 slot→组合全量同步（已含 tPosition）
      this._syncOrdinaryFourball2BallCompositionFromSlots();
    }

    if (Array.isArray(this._engineGroups)) {
      this._engineGroups = this._engineGroups.map((g) => {
        if (!g) return g;
        return Object.assign({}, g, {
          members: (Array.isArray(g.members) ? g.members : []).map(patchMember)
        });
      });
    }

    const ms = this._matchState || matchState.getMatchState();
    if (ms && ms.gameId === gameId && Array.isArray(ms.groups)) {
      const nextGroups = ms.groups.map((g) => {
        if (!g) return g;
        return Object.assign({}, g, {
          members: (Array.isArray(g.members) ? g.members : []).map(patchMember)
        });
      });
      const next = Object.assign({}, ms, { groups: nextGroups });
      matchState.setMatchState(next);
      this._matchState = next;
    }
    return true;
  },

  confirmEditTeeSheet() {
    const result = this._applyEditTeeChanges();
    if (!result || !result.ok) {
      wx.showToast({ title: '请先选择T台', icon: 'none' });
      return;
    }
    this.setData(
      {
        editTeeSheetVisible: false,
        editTeePlayers: []
      },
      () => {
        if (this.data.mode === 'stroke_entity') this.refreshEntities();
        else this.refreshPlayers();
      }
    );
    wx.showToast({ title: 'T台已更新', icon: 'success' });
  },

  /** 弹层本地选中态，确认前不写盘 */
  onEditTeeDotTap(e) {
    const playerId = String((e.currentTarget.dataset && e.currentTarget.dataset.playerId) || '').trim();
    const teeKey = String((e.currentTarget.dataset && e.currentTarget.dataset.teeKey) || '').trim();
    if (!playerId || !isEditTeeKey(teeKey)) return;
    const next = (this.data.editTeePlayers || []).map((row) => {
      if (!row || String(row.playerId) !== playerId) return row;
      return Object.assign({}, row, {
        tPosition: teeKey,
        teeDots: EDIT_TEE_OPTIONS.map((opt) => ({
          key: opt.key,
          label: opt.label,
          color: opt.color,
          selected: opt.key === teeKey
        }))
      });
    });
    this.setData({ editTeePlayers: next });
  },

  /** G5–G8：打开起始洞选择（1–18） */
  openStartHoleSheet() {
    const ms = this._matchState || this._readMatchState() || {};
    const matchId = (ms && ms.matchId) || '';
    const groupId = String(this.data.groupId || (ms && ms.groupId) || '').trim();
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const gameMode = this._resolveTeamMatchGameMode(match, ms);
    if (!isMatchPlayBoardMode(gameMode)) {
      wx.showToast({ title: '当前赛制不支持修改起始洞', icon: 'none' });
      return;
    }
    if (!match || !groupId) {
      wx.showToast({ title: '无法修改起始洞', icon: 'none' });
      return;
    }
    if (typeof this._scoreEditBlocked === 'function' && this._scoreEditBlocked()) {
      wx.showToast({ title: '比赛已结束，无法修改', icon: 'none' });
      return;
    }
    const current =
      this._resolveMatchPlayStartHoleForUi(match, groupId, gameMode) || 1;
    this.setData({
      startHoleSheetVisible: true,
      startHoleDraft: normalizeMatchPlayStartHole(current)
    });
  },

  closeStartHoleSheet() {
    this.setData({ startHoleSheetVisible: false });
  },

  onStartHoleDraftSelect(e) {
    const hole = Number(e.currentTarget.dataset.hole);
    if (!Number.isFinite(hole) || hole < 1 || hole > 18) return;
    this.setData({ startHoleDraft: Math.floor(hole) });
  },

  /**
   * 确认手动起始洞 → scoreData[groupId].matchPlayMeta { startHole, source:'manual' }
   * 保存后 refreshPlayers：金标 + matchStatusView 胜洞走势
   */
  confirmStartHoleSheet() {
    const hole = normalizeMatchPlayStartHole(this.data.startHoleDraft);
    const ms = this._matchState || this._readMatchState() || {};
    const matchId = (ms && ms.matchId) || '';
    const groupId = String(this.data.groupId || (ms && ms.groupId) || '').trim();
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const gameMode = this._resolveTeamMatchGameMode(match, ms);
    if (!match || !groupId || !isMatchPlayBoardMode(gameMode)) {
      wx.showToast({ title: '无法保存起始洞', icon: 'none' });
      return;
    }
    if (typeof this._scoreEditBlocked === 'function' && this._scoreEditBlocked()) {
      wx.showToast({ title: '比赛已结束，无法修改', icon: 'none' });
      return;
    }
    match.scoreData =
      match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
        ? match.scoreData
        : {};
    const groupScoreData =
      match.scoreData[groupId] && typeof match.scoreData[groupId] === 'object'
        ? match.scoreData[groupId]
        : {};
    const preserved = teamMatchStore.normalizeGroupScoreBucket(groupScoreData);
    const nextBucket = {
      scoresByPlayer: preserved.scoresByPlayer,
      teamScoresByEntity: preserved.teamScoresByEntity,
      scoresBySide: preserved.scoresBySide,
      matchPlayMeta: {
        startHole: hole,
        source: 'manual'
      }
    };
    if (preserved.firstScoreAt != null) nextBucket.firstScoreAt = preserved.firstScoreAt;
    if (preserved.finishedScoreAt != null) nextBucket.finishedScoreAt = preserved.finishedScoreAt;
    match.scoreData[groupId] = nextBucket;
    teamMatchStore.saveMatch(match);
    this.setData({ startHoleSheetVisible: false }, () => {
      this.refreshPlayers();
    });
    wx.showToast({ title: '起始洞已设为第' + hole + '洞', icon: 'none' });
  },

  onHalfCourseConfirmed() {
    this.persistSession();
    const ms = halfCourseEdit.readMatchState();
    if (ms) {
      this._matchState = ms;
      if (!this.data.gameId) {
        this.buildGameContextFromMatchState(ms);
      }
    }
    if (this.data.gameId) {
      const game = gameStore.getGame(this.data.gameId);
      if (game) {
        this.buildGameContext(game);
        this.setData({ 'match.course': game.courseName || '' });
      }
    }
    this._syncHoleLayoutFromCourse();
  },

  onMoreMenuTap(e) {
    const dataset = (e && e.currentTarget && e.currentTarget.dataset) || {};
    const disabledAttr = dataset.disabled;
    if (
      disabledAttr === true ||
      disabledAttr === 'true' ||
      disabledAttr === 1 ||
      disabledAttr === '1'
    ) {
      return;
    }

    const label = dataset.label;
    const action = dataset.action != null ? String(dataset.action) : '';
    this.setData({ showMoreSheet: false });

    if (action === 'changeStartHole' || label === '修改起始洞') {
      this.openStartHoleSheet();
      return;
    }

    if (label === '修改T台') {
      this.openEditTeeSheet();
      return;
    }

    if (action === 'finish_match' || label === '结束比赛' || label === '已结束') {
      if (label === '已结束' || this._resolveAddDeleteDisabled()) return;
      if (this._boundToStore() && this.data.groupId) {
        wx.showModal({
          title: '结束本组比赛？',
          content: '确认结束比赛后，本组成绩将不可再修改。',
          cancelText: '暂不结束',
          confirmText: '确认结束',
          confirmColor: '#ce9224',
          success: (res) => {
            if (res.confirm) this._confirmEndGroupGame();
          }
        });
        return;
      }
      if (!this.data.gameId) {
        wx.showToast({ title: '当前为演示模式', icon: 'none' });
        return;
      }
      wx.showModal({
        title: '结束本组比赛？',
        content: '本组所有球员的所有球洞成绩均已记录完成。确认结束比赛后，所有成绩将不可再修改。',
        cancelText: '暂不结束',
        confirmText: '确认结束',
        confirmColor: '#ce9224',
        success: (res) => {
          if (res.confirm) this._confirmEndGroupGame();
        }
      });
      return;
    }

    if (label === '取消比赛') {
      if (!this.data.gameId) {
        wx.showToast({ title: '当前为演示模式', icon: 'none' });
        return;
      }
      wx.showModal({
        title: '取消比赛',
        content: '取消比赛将删除本场GAME所有数据，是否确认？',
        cancelText: '取消',
        confirmText: '确认',
        confirmColor: '#dc2626',
        success: (res) => {
          if (res.confirm) this._confirmCancelGame();
        }
      });
      return;
    }

    if (label === '修改比赛') {
      if (!this.data.gameId) {
        wx.showToast({ title: '当前为演示模式', icon: 'none' });
        return;
      }
      wx.navigateTo({
        url:
          '/subpackages/create/pages/normal/index?mode=edit&gameId=' +
          encodeURIComponent(this.data.gameId) +
          '&returnTo=score',
        fail: () => wx.showToast({ title: '页面尚未注册', icon: 'none' })
      });
      return;
    }

    if (label === '修改半场') {
      this.openEditHalfSheet();
      return;
    }

    if (label === '统计数据') {
      // 队内赛记分页菜单已过滤本项，此处不处理 matchId；仅普通创建带 gameId 进统计页
      const gameId = this.data.gameId || '';
      if (!gameId) {
        wx.showToast({ title: '当前为演示模式', icon: 'none' });
        return;
      }
      wx.navigateTo({
        url: '/pages/tournament/stats/index?gameId=' + encodeURIComponent(gameId),
        fail: () => wx.showToast({ title: '统计页面尚未注册', icon: 'none' })
      });
      return;
    }

    if (label === '球童记分') {
      this.openCaddieScoringSheet();
      return;
    }

    if (label === '显示设置') {
      this.openStyleSheet();
      return;
    }

    if (label === '反馈') {
      const ms = this._matchState || this._readMatchState() || {};
      const matchId = ms.matchId || '';
      const gameId = this.data.gameId || '';
      const qs = ['source=score'];
      if (matchId) qs.push('matchId=' + encodeURIComponent(matchId));
      if (gameId) qs.push('gameId=' + encodeURIComponent(gameId));
      wx.navigateTo({
        url: '/pages/feedback/index?' + qs.join('&'),
        fail: () => wx.showToast({ title: '反馈页面尚未注册', icon: 'none' })
      });
    }
  },

  openStyleSheet() {
    this.setData({
      showStyleSheet: true,
      fontScale: this._getFontScale()
    });
  },

  closeStyleSheet() {
    this.setData({ showStyleSheet: false });
  },

  onFontScaleChange(e) {
    const value =
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.value
        : '';
    this._setFontScale(value);
  },

  /**
   * 球童记分宿主：队内赛优先，否则普通 game；无宿主返回 null。
   * @returns {{ kind:'game'|'match', entity:object, id:string, groupId:string }|null}
   */
  _resolveCaddieScoringHost() {
    const ms = this._matchState || this._readMatchState() || null;
    if (isTeamInternalScoreMatchContext(ms)) {
      const matchId = ms && ms.matchId != null ? String(ms.matchId).trim() : '';
      const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
      if (!match) return null;
      return {
        kind: 'match',
        entity: match,
        id: String(match.matchId || matchId),
        groupId: String(this.data.groupId || (ms && ms.groupId) || '').trim()
      };
    }
    const gameId = String(this.data.gameId || '').trim();
    if (!gameId) return null;
    const game = gameStore.getGame(gameId);
    if (!game) return null;
    return {
      kind: 'game',
      entity: game,
      id: gameId,
      groupId: String(this.data.groupId || '').trim()
    };
  },

  openCaddieScoringSheet() {
    const host = this._resolveCaddieScoringHost();
    if (!host || !host.entity) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const entity = host.entity;
    const access = caddieScoringAccess.normalizeCaddieScoringAccess(entity.caddieScoringAccess);
    const hasQr = !!(access && access.qrCodeUrl && access.enabled);
    this.setData({
      caddieSheetVisible: true,
      caddieSheetHasQr: hasQr,
      caddieSheetQrUrl: hasQr ? access.qrCodeUrl : '',
      caddieSheetGenerating: false,
      caddieSheetScorers: caddieScoringAccess.listCaddieScorers(entity.tempAdmins) || []
    });
  },

  closeCaddieSheet() {
    this.setData({ caddieSheetVisible: false });
  },

  /** 将宿主 entity 上的球童授权状态同步到 Sheet data */
  _refreshCaddieSheetFromEntity(entity) {
    if (!entity) return;
    const access = caddieScoringAccess.normalizeCaddieScoringAccess(entity.caddieScoringAccess);
    const hasQr = !!(access && access.qrCodeUrl && access.enabled);
    this.setData({
      caddieSheetHasQr: hasQr,
      caddieSheetQrUrl: hasQr ? access.qrCodeUrl : '',
      caddieSheetGenerating: false,
      caddieSheetScorers: caddieScoringAccess.listCaddieScorers(entity.tempAdmins) || []
    });
  },

  onGenerateCaddieQr(e) {
    const host = this._resolveCaddieScoringHost();
    if (!host || !host.entity) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const detail = (e && e.detail) || {};
    const regenerate = !!detail.regenerate;
    if (regenerate && this.data.caddieSheetHasQr) {
      wx.showModal({
        title: '重新生成',
        content: '重新生成后，旧二维码将失效。是否继续？',
        cancelText: '取消',
        confirmText: '重新生成',
        success: (res) => {
          if (res.confirm) this._doGenerateCaddieQr(host);
        }
      });
      return;
    }
    this._doGenerateCaddieQr(host);
  },

  _doGenerateCaddieQr(host) {
    if (!host || !host.entity || !host.id) {
      wx.showToast({ title: '生成失败', icon: 'none' });
      return;
    }
    const user = gameStore.getCurrentUser() || {};
    const createdBy = String(user.userId || '');
    const groupId = String(host.groupId || '').trim();
    this.setData({ caddieSheetGenerating: true });
    try {
      let access = null;
      if (host.kind === 'match') {
        access = caddieScoringAccess.createCaddieScoringAccess({
          source: 'team_match',
          matchId: host.id,
          groupId: groupId,
          createdBy: createdBy
        });
      } else {
        access = caddieScoringAccess.createCaddieScoringAccess({
          source: 'game',
          gameId: host.id,
          groupId: groupId,
          createdBy: createdBy
        });
      }
      if (!access || !access.qrCodeUrl) {
        this.setData({ caddieSheetGenerating: false });
        wx.showToast({ title: '生成失败', icon: 'none' });
        return;
      }
      host.entity.caddieScoringAccess = access;
      if (host.kind === 'match') {
        teamMatchStore.saveMatch(host.entity);
      } else {
        gameStore.saveGame(host.entity);
      }
      this._refreshCaddieSheetFromEntity(host.entity);
      wx.showToast({ title: '二维码已生成', icon: 'success' });
    } catch (err) {
      this.setData({ caddieSheetGenerating: false });
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },

  onRemoveCaddie(e) {
    const host = this._resolveCaddieScoringHost();
    if (!host || !host.entity) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const userId =
      e && e.detail && e.detail.userId != null ? String(e.detail.userId).trim() : '';
    if (!userId) {
      wx.showToast({ title: '待删除球童', icon: 'none' });
      return;
    }
    const result = caddieScoringAccess.removeCaddieScoringPermission(host.entity, userId);
    if (!result || !result.ok) {
      wx.showToast({ title: '移除失败', icon: 'none' });
      return;
    }
    if (host.kind === 'match') {
      teamMatchStore.saveMatch(host.entity);
    } else {
      gameStore.saveGame(host.entity);
    }
    this._refreshCaddieSheetFromEntity(host.entity);
    wx.showToast({ title: '已移除', icon: 'success' });
  },

  /* ===== 普通球局：成绩全部完成 → 确认结束弹窗 ===== */
  _isNormalGameContext() {
    return !!this.data.gameId;
  },

  _syncGameFinishedState() {
    if (this._boundToStore() && this.data.groupId) {
      const match = this._readScoreTeamMatch();
      const group = this._findScoreTeamMatchGroup(match);
      const ms = group
        ? matchStatus.getMatchStatus(group, { source: 'groups' })
        : matchStatus.getMatchStatusForTournamentGroup(this.data.groupId);
      const gameFinished = !!ms.isCompleted;
      this.data.gameFinished = gameFinished;
      this.setData({
        gameFinished: gameFinished,
        scoresCompleted: this._isAllScoresCompleted()
      });
      this._syncScoreFinishedUiState();
      return;
    }
    if (!this.data.gameId) return;
    const group = gameStore.getGroup(this.data.gameId, this._gameGroupIndex || 0) || {};
    const ms = matchStatus.getMatchStatus(group, { source: 'game' });
    const gameFinished = !!ms.isCompleted;
    this.data.gameFinished = gameFinished;
    this.setData({
      gameFinished: gameFinished,
      scoresCompleted: this._isAllScoresCompleted()
    });
    this._syncScoreFinishedUiState();
  },

  _isAllScoresCompleted() {
    if (this.data.mode === 'fourball_best') {
      const groups = this._engineGroups || [];
      if (!groups.length) return false;
      for (let h = 0; h < 18; h++) {
        if (!groups.every((g) => isFilledScore((g.scores || [])[h]))) return false;
      }
      return true;
    }
    if (this.data.mode === 'game') {
      const players = this._playersSource || [];
      if (!players.length) return false;
      for (let h = 0; h < 18; h++) {
        if (!players.every((p) => isFilledScore((p.scores || [])[h]))) return false;
      }
      return true;
    }
    return false;
  },

  _completionSignature() {
    if (this.data.mode === 'fourball_best') {
      return (this._engineGroups || []).map((g) => (g.scores || []).join(',')).join('|');
    }
    if (this.data.mode === 'game') {
      return (this._playersSource || []).map((p) => (p.scores || []).join(',')).join('|');
    }
    return '';
  },

  _getDismissedCompletionSig() {
    if (!this.data.gameId) return '';
    const group = gameStore.getGroup(this.data.gameId, this._gameGroupIndex || 0) || {};
    return group.endPromptDismissedSig || '';
  },

  _saveDismissedCompletionSig(sig) {
    if (!this.data.gameId) return;
    const game = gameStore.getGame(this.data.gameId);
    if (!game) return;
    const gi = this._gameGroupIndex || 0;
    if (Array.isArray(game.groups) && game.groups[gi]) {
      const groups = game.groups.slice();
      groups[gi] = Object.assign({}, groups[gi], { endPromptDismissedSig: sig });
      gameStore.saveGame(Object.assign({}, game, { groups }));
      return;
    }
    gameStore.saveGame(Object.assign({}, game, { endPromptDismissedSig: sig }));
  },

  _scoreEditBlocked() {
    // 只读优先：finished / gameFinished / isReadOnlyScore
    if (this.data.isReadOnlyScore || this._resolveIsReadOnlyScore()) return true;
    // 无记分修改权（非本组参赛本人且无 manage_scoring/球童权）
    if (!this._canCurrentUserEditScores()) return true;
    return false;
  },

  /** 记分权限宿主：普通局 game / 队内赛 match；均无则 null（演示等） */
  _resolveScorePermissionHost() {
    const gameId = String(this.data.gameId || '').trim();
    if (gameId) {
      const game = gameStore.getGame(gameId);
      if (game) return game;
    }
    const ms = this._matchState || this._readMatchState() || {};
    const matchId = ms.matchId ? String(ms.matchId).trim() : '';
    if (matchId) return teamMatchStore.getMatchById(matchId) || null;
    return null;
  },

  /**
   * 当前用户是否为本组参赛球员：
   * - 普通创建：gameStore 当前组 playersSlots
   * - 队内赛：match.groups 当前组 players
   */
  _isCurrentUserInCurrentGroup(userId) {
    const uid = String(userId || '').trim();
    if (!uid) return false;

    const gameId = String(this.data.gameId || '').trim();
    if (gameId && gameStore.getGame(gameId)) {
      const gi = this._gameGroupIndex != null ? Number(this._gameGroupIndex) || 0 : 0;
      const group = gameStore.getGroup(gameId, gi) || {};
      const slots = Array.isArray(group.playersSlots) ? group.playersSlots : [];
      return slots.some((slot) => {
        if (!slot) return false;
        return isSameUserIdentity(slot.playerId || slot.userId || slot.id, uid);
      });
    }

    const match = this._readScoreTeamMatch();
    const group = this._findScoreTeamMatchGroup(match);
    if (match && group) {
      const players = Array.isArray(group.players) ? group.players : [];
      return players.some((p) => {
        if (!p) return false;
        return isSameUserIdentity(p.userId || p.playerId || p.id, uid);
      });
    }

    return false;
  },

  /**
   * 当前用户是否为成绩宿主创建者（game/match：createdBy，兼容 creatorId / ownerId）
   */
  _isCurrentUserScoreOwner(userId) {
    const uid = String(userId || '').trim();
    if (!uid) return false;
    const matchOrGame = this._resolveScorePermissionHost();
    if (!matchOrGame) return false;
    const ownerId = String(
      matchOrGame.createdBy || matchOrGame.creatorId || matchOrGame.ownerId || ''
    ).trim();
    if (!ownerId) return false;
    return isSameUserIdentity(ownerId, uid);
  },

  /**
   * 允许改成绩：Owner 创建者 → A 本组参赛本人 → B canManageScoring
   * 无 match/game 宿主时不额外拦截（仅 finished 控制，兼容演示）
   */
  _canCurrentUserEditScores() {
    const user = gameStore.getCurrentUser() || {};
    const userId = String(user.userId || '').trim();
    if (!userId) return false;

    if (this._isCurrentUserScoreOwner(userId)) return true;
    if (this._isCurrentUserInCurrentGroup(userId)) return true;

    const matchOrGame = this._resolveScorePermissionHost();
    if (!matchOrGame) return true;

    const ms = this._matchState || this._readMatchState() || {};
    const groupId = String(this.data.groupId || ms.groupId || '').trim();
    return !!caddieScoringAccess.canManageScoring(
      matchOrGame,
      userId,
      groupId || undefined
    );
  },

  _afterScoresPersisted() {
    const scoresCompleted = this._isAllScoresCompleted();
    this.setData({ scoresCompleted });
    this._syncGameFinishedState();
    this._maybeShowEndGroupPrompt();
  },

  _maybeShowEndGroupPrompt() {
    if (!this._isNormalGameContext()) return;
    if (this.data.gameFinished) return;
    if (!this._isAllScoresCompleted()) return;
    if (this._endPromptShowing) return;

    const sig = this._completionSignature();
    if (sig && sig === this._getDismissedCompletionSig()) return;

    this._endPromptShowing = true;
    wx.showModal({
      title: '结束本组比赛？',
      content: '本组所有球员的所有球洞成绩均已记录完成。确认结束比赛后，所有成绩将不可再修改。',
      cancelText: '暂不结束',
      confirmText: '确认结束',
      confirmColor: '#ce9224',
      success: (res) => {
        this._endPromptShowing = false;
        if (res.confirm) {
          this._confirmEndGroupGame();
        } else {
          this._saveDismissedCompletionSig(sig);
        }
      },
      fail: () => {
        this._endPromptShowing = false;
      }
    });
  },

  _finishScoreTeamMatchGroup() {
    const match = this._readScoreTeamMatch();
    const group = this._findScoreTeamMatchGroup(match);
    if (!match || !group || !Array.isArray(match.groups)) return false;
    const oldStatus = group.status || '';
    const newStatus = matchStatus.FINISHED_STORAGE_STATUS;
    const groupId = group.groupId != null ? String(group.groupId) : '';
    if (groupId) {
      match.scoreData =
        match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
          ? match.scoreData
          : {};
      const bucket =
        match.scoreData[groupId] && typeof match.scoreData[groupId] === 'object'
          ? match.scoreData[groupId]
          : null;
      if (bucket) {
        teamMatchStore.forceGroupScoreBucketFinishedScoreAt(bucket);
        match.scoreData[groupId] = bucket;
      }
    }
    match.groups = match.groups.map((item) =>
      String(item && item.groupId) === String(group.groupId)
        ? Object.assign({}, item, {
            status: newStatus,
            statusLabel: '已结束',
            updatedAt: Date.now()
          })
        : item
    );
    match.updatedAt = Date.now();
    teamMatchStore.saveMatch(match);
    console.log('[score-group-status-migration]', {
      source: 'teamMatchStore',
      matchId: match.matchId || '',
      groupId: group.groupId || this.data.groupId || '',
      oldStatus: oldStatus,
      newStatus: newStatus
    });
    return true;
  },

  _confirmEndGroupGame() {
    if (this._finishScoreTeamMatchGroup()) {
      this.data.gameFinished = true;
      this.setData({ gameFinished: true, scoresCompleted: true });
      this._syncScoreFinishedUiState();
      wx.showToast({ title: '比赛已结束', icon: 'success' });
      return;
    }
    if (this._boundToStore() && this.data.groupId) {
      const oldGroup = groupsStore.getGroup(this.data.groupId);
      const oldStatus = (oldGroup && oldGroup.status) || '';
      groupsStore.updateGroupStatus(this.data.groupId, matchStatus.FINISHED_STORAGE_STATUS);
      console.log('[score-group-status-migration]', {
        source: 'groupsStore',
        matchId: '',
        groupId: this.data.groupId || '',
        oldStatus: oldStatus,
        newStatus: matchStatus.FINISHED_STORAGE_STATUS
      });
      this.data.gameFinished = true;
      this.setData({ gameFinished: true, scoresCompleted: true });
      this._syncScoreFinishedUiState();
      wx.showToast({ title: '比赛已结束', icon: 'success' });
      return;
    }
    if (!this.data.gameId) return;
    // game-single：结束前把运行时最新分刷入 scoresBySlot，再由 confirmFinish 做归属结算
    if (this._isGameSingleScoreContext()) {
      this._flushGameSingleOccupiedScoresToStore();
    }
    gameProgress.confirmFinishGame(this.data.gameId, this._gameGroupIndex || 0);
    this.data.gameFinished = true;
    this.setData({ gameFinished: true, scoresCompleted: true });
    this._syncScoreFinishedUiState();
    wx.showToast({ title: '比赛已结束', icon: 'success' });
  },

  _confirmCancelGame() {
    const gameId = this.data.gameId;
    if (!gameId) return;

    gameLifecycle.purgeGameCompletely(gameId);
    this.setData({ gameId: '', gameFinished: false, scoresCompleted: false });
    this._matchState = null;

    wx.showToast({ title: '比赛已取消', icon: 'success', duration: 1500 });

    setTimeout(() => {
      wx.reLaunch({ url: '/pages/home/index?tab=my' });
    }, 300);
  },

  // 添加/删除草稿：深拷贝槽位快照（仅 roster 展示字段，不共享引用）
  _cloneGroupSlots(slots) {
    return (slots || []).map((s) => {
      if (!s) return s;
      const player = s.player
        ? {
            playerId: s.player.playerId,
            name: s.player.name,
            avatar: s.player.avatar,
            source: s.player.source,
            gender: s.player.gender || '',
            tPosition: s.player.tPosition || '',
            tee: s.player.tee || s.player.tPosition || '',
            teamLabel: s.player.teamLabel || s.player.teamGroupName || '',
            teamGroupName: s.player.teamGroupName || s.player.teamLabel || ''
          }
        : null;
      const seatIndex =
        s.seatIndex != null && Number(s.seatIndex) > 0 ? Number(s.seatIndex) : null;
      return {
        slotId: s.slotId,
        seatIndex: seatIndex,
        player: player,
        playerId: s.playerId != null ? s.playerId : player && player.playerId,
        status: s.status,
        source: s.source != null ? s.source : player && player.source,
        hasCache: !!s.hasCache,
        scorePlayerId: s.scorePlayerId || ''
      };
    });
  },

  /** 解析绑定用 seatIndex：显式值 → _targetSeatIndex；3+0→seat1–3；2+0→seat1–2 */
  _resolveBindSeatIndex(explicit) {
    const n = Number(explicit);
    const raw = n > 0 ? n : Number(this._targetSeatIndex) > 0 ? Number(this._targetSeatIndex) : null;
    return this._clampSeatIndexForTwoZeroBind(this._clampSeatIndexForThreeZeroBind(raw));
  },

  /** diff 用 seatIndex：draft → original → 无则 null（不按人数猜） */
  _resolveDiffSeatIndex(originalSlot, draftSlot) {
    const d =
      draftSlot && draftSlot.seatIndex != null ? Number(draftSlot.seatIndex) : 0;
    if (d > 0) return d;
    const o =
      originalSlot && originalSlot.seatIndex != null
        ? Number(originalSlot.seatIndex)
        : 0;
    if (o > 0) return o;
    return null;
  },

  /**
   * 打开添加/删除后：按 composition.seats 给 draft/original 打临时 seatIndex。
   * occupied 按 playerId 对齐；空位按 seatIndex===slotIndex+1 对齐（可被点击空座覆盖）。
   */
  _stampDraftSlotsSeatIndexFromTemplate() {
    const template = this._groupManageSeatTemplate;
    if (!Array.isArray(template) || !template.length) return;
    const byPid = {};
    template.forEach((s) => {
      if (!s) return;
      const pid =
        s.playerId != null && String(s.playerId).trim()
          ? String(s.playerId).trim()
          : '';
      const si = Number(s.seatIndex);
      if (pid && si > 0) byPid[pid] = si;
    });
    const apply = (slots) => {
      (slots || []).forEach((slot, i) => {
        if (!slot) return;
        const pid = this._slotOccupiedPlayerId(slot);
        if (pid && byPid[pid]) {
          slot.seatIndex = byPid[pid];
          return;
        }
        if (slot.seatIndex != null && Number(slot.seatIndex) > 0) return;
        const aligned = template.find((s) => s && Number(s.seatIndex) === i + 1);
        slot.seatIndex = aligned ? Number(aligned.seatIndex) : i + 1;
      });
    };
    apply(this._draftSlots);
    apply(this._originalSlots);
  },

  /** draft 中尚未占用的最小 seatIndex（多选好友续填用）；3+0→seat1–3；2+0→seat1–2 */
  _nextAvailableSeatIndexForDraft() {
    const prevComp = this._getOrdinaryFourballBestComposition();
    const compType = prevComp ? resolveCompositionType(prevComp) : '';
    if (compType === '3+0') return this._nextEmptySeatIndexInThreeZeroCapacity();
    if (compType === '2+0') return this._nextEmptySeatIndexInTwoZeroCapacity();

    const template = this._groupManageSeatTemplate;
    if (!Array.isArray(template) || !template.length) return null;
    const used = {};
    (this._draftSlots || []).forEach((s) => {
      if (!s || s.status !== 'occupied') return;
      const si = s.seatIndex != null ? Number(s.seatIndex) : 0;
      if (si > 0) used[si] = true;
    });
    let best = null;
    template.forEach((s) => {
      const si = s && s.seatIndex != null ? Number(s.seatIndex) : 0;
      if (!si || used[si]) return;
      if (best == null || si < best) best = si;
    });
    return best;
  },

  _summarizeScoreSlots(slots) {
    return (slots || []).map((slot) => ({
      slotId: slot && slot.slotId,
      status: slot && slot.status,
      playerId: slot && ((slot.player && slot.player.playerId) || slot.playerId || ''),
      hasCache: !!(slot && slot.hasCache),
      scorePlayerId: (slot && slot.scorePlayerId) || ''
    }));
  },

  _readScoreTeamMatch() {
    const ms = this._matchState || this._readMatchState() || {};
    const matchId = ms.matchId || '';
    return matchId ? teamMatchStore.getMatchById(matchId) : null;
  },

  _findScoreTeamMatchGroup(match) {
    const groupId = String(this.data.groupId || ((this._matchState || {}).groupId) || '');
    if (!match || !groupId || !Array.isArray(match.groups)) return null;
    return match.groups.find((group) => String(group && group.groupId) === groupId) || null;
  },

  _buildScoreTeamMatchPlayerLookup(match) {
    const lookup = {};
    const users = match && match.registerInfo && Array.isArray(match.registerInfo.users)
      ? match.registerInfo.users
      : [];
    users.forEach((user) => {
      if (!user) return;
      const id = String(user.userId || user.playerId || user.id || '').trim();
      if (!id) return;
      lookup[id] = {
        name: user.matchNickname || user.competitionName || user.nickname || user.name || id,
        avatar: user.avatar || user.avatarUrl || ''
      };
    });
    return lookup;
  },

  _findScoreTeamMatchRegisterUser(match, userId) {
    const uid = String(userId || '').trim();
    const canonicalUid = resolveCanonicalUserId(uid);
    const users = match && match.registerInfo && Array.isArray(match.registerInfo.users)
      ? match.registerInfo.users
      : [];
    if (!canonicalUid) return null;
    return users.find((user) => {
      const id = user && (user.userId || user.playerId || user.id);
      return isSameUserIdentity(id, canonicalUid);
    }) || null;
  },

  _findScoreTeamMatchGroupedPlayer(match, userId) {
    const uid = String(userId || '').trim();
    if (!uid || !match || !Array.isArray(match.groups)) return null;
    for (let i = 0; i < match.groups.length; i++) {
      const group = match.groups[i];
      if (!group) continue;
      const slots = teamMatchStore.resolveGroupSlots(group);
      for (let j = 0; j < slots.length; j++) {
        const slotPlayer = teamMatchStore.resolveSlotPlayer(slots[j]);
        const slotUserId = slotPlayer && (slotPlayer.userId || slotPlayer.playerId);
        if (isSameUserIdentity(slotUserId, uid)) {
          return {
            groupId: group.groupId || group.id || '',
            groupName: group.groupName || group.name || ('第' + (i + 1) + '组'),
            position: slots[j] && slots[j].position
          };
        }
      }
    }
    return null;
  },

  _ensureMatchParticipant(player, options) {
    const opts = options || {};
    const p = player || {};
    const playerId = String(p.userId || p.playerId || p.id || '').trim();
    const match = opts.match || this._readScoreTeamMatch();
    const group = opts.group || this._findScoreTeamMatchGroup(match);
    if (!match || !group) {
      return { ok: true, registered: false, skipped: true, reason: 'not_team_match', player: player };
    }
    if (!playerId) {
      return { ok: false, reason: 'no_player_id', player: player };
    }
    if (this._findScoreTeamMatchRegisterUser(match, playerId)) {
      return { ok: true, registered: true, player: player };
    }
    return {
      ok: false,
      needRegister: true,
      player: Object.assign({}, p, {
        userId: playerId,
        playerId: playerId
      })
    };
  },

  _registerMatchParticipantIfNeeded(player, options) {
    const opts = options || {};
    const checked = this._ensureMatchParticipant(player, opts);
    if (checked.ok) return checked;
    if (!checked.needRegister) return checked;

    const match = opts.match || this._readScoreTeamMatch();
    const group = opts.group || this._findScoreTeamMatchGroup(match);
    if (!match || !group) return checked;

    const p = checked.player || player || {};
    const playerId = String(p.userId || p.playerId || p.id || '').trim();
    if (!playerId) return { ok: false, reason: 'no_player_id', player: player };

    if (!match.registerInfo || typeof match.registerInfo !== 'object') {
      match.registerInfo = teamMatchStore.createDefaultRegisterInfo
        ? teamMatchStore.createDefaultRegisterInfo()
        : { totalCount: 0, users: [] };
    }
    if (!Array.isArray(match.registerInfo.users)) match.registerInfo.users = [];

    const selectedTeam = opts.teamGroup || opts.selectedTeamGroup || null;
    if (!selectedTeam) {
      return {
        ok: false,
        needRegister: true,
        needTeamGroup: true,
        player: p,
        teamGroups: Array.isArray(match.teamGroups) ? match.teamGroups : []
      };
    }
    const selectedTeamGroupId = selectedTeam.id != null ? String(selectedTeam.id) : '';
    const selectedTeamGroupName = selectedTeam.name || '';
    const rawUser = {
      userId: playerId,
      playerId: playerId,
      nickname: p.nickname || p.name || playerId,
      name: p.name || p.nickname || playerId,
      competitionName: p.competitionName || p.matchNickname || p.name || p.nickname || playerId,
      matchNickname: p.matchNickname || p.competitionName || p.name || p.nickname || playerId,
      avatar: p.avatar || '',
      gender: p.gender || '',
      phone: p.phone || '',
      source: p.registrationSource || opts.registrationSource || 'self',
      userType: p.userType || '',
      identitySource: p.identitySource || '',
      registeredAt: Date.now(),
      groupId: selectedTeamGroupId,
      groupName: selectedTeamGroupName,
      matchTeamId: selectedTeamGroupId,
      matchTeamName: selectedTeamGroupName
    };

    const normalized = teamMatchStore.normalizeRegisterUser
      ? teamMatchStore.normalizeRegisterUser(rawUser)
      : rawUser;
    match.registerInfo.users.push(normalized);
    match.registerInfo.totalCount = match.registerInfo.users.length;
    teamMatchStore.saveMatch(match);

    console.log('[join-match-before-slot]', {
      playerId: playerId,
      nickname: normalized.matchNickname || normalized.competitionName || normalized.nickname || normalized.name || '',
      selectedTeamGroupId: selectedTeamGroupId,
      selectedTeamGroupName: selectedTeamGroupName,
      registerCreated: true,
      slotIndex: opts.slotIndex != null ? opts.slotIndex : ''
    });

    return {
      ok: true,
      registered: true,
      created: true,
      player: Object.assign({}, p, {
        userId: playerId,
        playerId: playerId,
        name: normalized.matchNickname || normalized.competitionName || normalized.nickname || normalized.name || p.name || playerId,
        avatar: normalized.avatar || p.avatar || ''
      })
    };
  },

  _openJoinMatchTeamSheet(pending) {
    const match = this._readScoreTeamMatch();
    const teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    const player = pending && pending.player ? pending.player : {};
    this._pendingJoinMatchSlot = pending || null;
    this.setData({
      joinMatchTeamSheetVisible: true,
      joinMatchPlayerName: player.name || player.nickname || player.playerId || '该球员',
      joinMatchTeamOptions: teamGroups.map((team) => ({
        id: team && team.id != null ? String(team.id) : '',
        name: team && team.name ? String(team.name) : '未命名分队'
      }))
    });
  },

  closeJoinMatchTeamSheet() {
    this._pendingJoinMatchSlot = null;
    this.setData({
      joinMatchTeamSheetVisible: false,
      joinMatchPlayerName: '',
      joinMatchTeamOptions: []
    });
  },

  onJoinMatchTeamSelect(e) {
    const dataset = (e && e.currentTarget && e.currentTarget.dataset) || {};
    const teamGroupId = String(dataset.id || '');
    const teamGroupName = String(dataset.name || '');
    const pending = this._pendingJoinMatchSlot;
    if (!pending || !pending.player || pending.slotIndex == null) {
      this.closeJoinMatchTeamSheet();
      return;
    }
    const registered = this._registerMatchParticipantIfNeeded(pending.player, {
      source: pending.source,
      slotIndex: pending.slotIndex,
      teamGroup: {
        id: teamGroupId,
        name: teamGroupName
      }
    });
    if (!registered || !registered.ok) {
      wx.showToast({ title: '加入比赛失败', icon: 'none' });
      return;
    }
    const player = registered.player || pending.player;
    this.closeJoinMatchTeamSheet();
    const bindPlayer = {
      playerId: player.playerId || player.userId,
      name: player.name || player.matchNickname || player.nickname || '',
      avatar: player.avatar || '',
      phone: player.phone || '',
      gender: player.gender || ''
    };
    this._bindDraftPlayerToSlot(pending.slotIndex, bindPlayer, pending.source);
  },

  _buildScoreTeamMatchPlayerProfile(match, userId, fallback) {
    const uid = String(userId || '').trim();
    const user = this._findScoreTeamMatchRegisterUser(match, uid) || {};
    const fb = fallback || {};
    const displayName =
      user.matchNickname ||
      user.competitionName ||
      user.nickname ||
      user.name ||
      fb.name ||
      uid;
    return {
      userId: uid,
      playerId: uid,
      id: uid,
      name: displayName,
      nickname: user.nickname || displayName,
      competitionName: user.competitionName || user.matchNickname || displayName,
      matchNickname: user.matchNickname || user.competitionName || displayName,
      avatar: user.avatar || user.avatarUrl || fb.avatar || '',
      gender: user.gender || fb.gender || '',
      matchGender: user.matchGender || user.gender || fb.matchGender || '',
      handicap: user.handicap != null ? user.handicap : (fb.handicap != null ? fb.handicap : ''),
      groupId: user.groupId != null ? user.groupId : (fb.groupId != null ? fb.groupId : ''),
      groupName: user.groupName != null ? user.groupName : (fb.groupName != null ? fb.groupName : ''),
      matchTeamId: user.matchTeamId != null ? user.matchTeamId : (user.groupId != null ? user.groupId : fb.matchTeamId || ''),
      matchTeamName: user.matchTeamName != null ? user.matchTeamName : (user.groupName != null ? user.groupName : fb.matchTeamName || '')
    };
  },

  /** 添加/删除页：G2/G3/G4 且开启分队 PK 时展示分队标签 */
  _shouldShowGroupManageTeamLabel(match) {
    if (!match) return false;
    const kind = resolveStrokeKind(resolveGameMode(match));
    if (kind !== 'g2g3' && kind !== 'g4') return false;
    const competition =
      match.scoringRules && match.scoringRules.teamCompetition
        ? match.scoringRules.teamCompetition
        : null;
    return !!(competition && competition.enabled === true);
  },

  /** 分队短名（展示用）；不读 scoreEntities */
  _formatGroupManageTeamLabel(name) {
    const text = String(name || '').trim();
    if (!text) return '';
    const chars = Array.from(text);
    const hasChinese = /[\u4e00-\u9fff]/.test(text);
    const limit = hasChinese ? 4 : 8;
    return chars.slice(0, limit).join('');
  },

  _resolveGroupManageTeamLabel(match, rawPlayer, userId) {
    if (!this._shouldShowGroupManageTeamLabel(match)) return '';
    const raw = rawPlayer && typeof rawPlayer === 'object' ? rawPlayer : {};
    const direct =
      (raw.teamGroupName != null && String(raw.teamGroupName).trim()) ||
      (raw.teamLabel != null && String(raw.teamLabel).trim()) ||
      (raw.teamName != null && String(raw.teamName).trim()) ||
      (raw.matchTeamName != null && String(raw.matchTeamName).trim()) ||
      '';
    if (direct) return this._formatGroupManageTeamLabel(direct);

    const teamId =
      (raw.teamGroupId != null && String(raw.teamGroupId).trim()) ||
      (raw.teamId != null && String(raw.teamId).trim()) ||
      (raw.matchTeamId != null && String(raw.matchTeamId).trim()) ||
      '';
    const teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    if (teamId) {
      for (let i = 0; i < teamGroups.length; i++) {
        const team = teamGroups[i];
        const id = team && team.id != null ? String(team.id).trim() : '';
        if (id && id === teamId) {
          return this._formatGroupManageTeamLabel((team && team.name) || '');
        }
      }
    }

    const profile = this._buildScoreTeamMatchPlayerProfile(match, userId, raw);
    if (profile.matchTeamName) {
      return this._formatGroupManageTeamLabel(profile.matchTeamName);
    }
    if (profile.matchTeamId) {
      for (let i = 0; i < teamGroups.length; i++) {
        const team = teamGroups[i];
        const id = team && team.id != null ? String(team.id).trim() : '';
        if (id && id === String(profile.matchTeamId).trim()) {
          return this._formatGroupManageTeamLabel((team && team.name) || '');
        }
      }
    }
    return '';
  },

  _readPendingMatchJoinBind() {
    try {
      const pending = wx.getStorageSync(MATCH_JOIN_PENDING_BIND_KEY);
      return pending && typeof pending === 'object' ? pending : null;
    } catch (e) {
      return null;
    }
  },

  _clearPendingMatchJoinBind() {
    try {
      wx.removeStorageSync(MATCH_JOIN_PENDING_BIND_KEY);
    } catch (e) {
      /* ignore */
    }
  },

  _tryApplyPendingMatchJoinBind() {
    const pending = this._readPendingMatchJoinBind();
    const token = String((this._pageOptions && this._pageOptions.joinToken) || '').trim();
    if (!pending || !pending.player) {
      console.log('[match-join-flow]', {
        stage: 'pending_bind_consume',
        ok: false,
        reason: 'no_pending'
      });
      return;
    }
    if (token && String(pending.token || '') !== token) {
      console.log('[match-join-flow]', {
        stage: 'pending_bind_consume',
        ok: false,
        reason: 'token_mismatch',
        token: token,
        pendingToken: String(pending.token || '')
      });
      return;
    }
    const ms = this._matchState || this._readMatchState() || {};
    const matchId = String(ms.matchId || '').trim();
    const groupId = String(this.data.groupId || ms.groupId || '').trim();
    if (
      !matchId ||
      !groupId ||
      String(pending.matchId || '') !== matchId ||
      String(pending.groupId || '') !== groupId
    ) {
      console.log('[match-join-flow]', {
        stage: 'pending_bind_consume',
        ok: false,
        reason: 'context_mismatch',
        matchId: matchId,
        groupId: groupId,
        pendingMatchId: String(pending.matchId || ''),
        pendingGroupId: String(pending.groupId || '')
      });
      return;
    }
    if (this.data.gameFinished) {
      this._clearPendingMatchJoinBind();
      console.log('[match-join-flow]', {
        stage: 'pending_bind_consume',
        ok: false,
        reason: 'game_finished',
        matchId: matchId,
        groupId: groupId
      });
      wx.showToast({ title: '比赛已结束，不可加入', icon: 'none' });
      return;
    }

    const match = this._readScoreTeamMatch();
    const group = this._findScoreTeamMatchGroup(match);
    if (!match || !group) {
      console.log('[match-join-flow]', {
        stage: 'pending_bind_consume',
        ok: false,
        reason: 'match_or_group_missing',
        matchId: matchId,
        groupId: groupId
      });
      return;
    }
    if (this._findScoreTeamMatchGroupedPlayer(match, pending.player.userId || pending.player.playerId)) {
      this._clearPendingMatchJoinBind();
      console.log('[match-join-flow]', {
        stage: 'pending_bind_consume',
        ok: false,
        reason: 'already_grouped',
        userId: pending.player.userId || pending.player.playerId || '',
        matchId: matchId,
        groupId: groupId
      });
      wx.showToast({ title: '你已在本场比赛中', icon: 'none' });
      return;
    }

    this.openGroupManagePage();
    const slotIndex = this._firstDraftEmptySlotIndex();
    if (slotIndex < 0) {
      this._clearPendingMatchJoinBind();
      this._finalizeCloseGroupManage();
      console.log('[match-join-flow]', {
        stage: 'pending_bind_consume',
        ok: false,
        reason: 'no_empty_slot',
        userId: pending.player.userId || pending.player.playerId || '',
        matchId: matchId,
        groupId: groupId
      });
      wx.showToast({ title: '本组暂无空位', icon: 'none' });
      return;
    }
    console.log('[match-join-flow]', {
      stage: 'pending_bind_consume',
      ok: true,
      userId: pending.player.userId || pending.player.playerId || '',
      matchId: matchId,
      groupId: groupId,
      slotId: slotIndex + 1
    });

    const registered = this._registerMatchParticipantIfNeeded(pending.player, {
      source: 'scan',
      registrationSource: 'scan',
      slotIndex: slotIndex,
      teamGroup: pending.teamGroup || null
    });
    if (!registered || !registered.ok) {
      this._clearPendingMatchJoinBind();
      this._finalizeCloseGroupManage();
      console.log('[match-join-flow]', {
        stage: 'pending_bind_consume',
        ok: false,
        reason: 'register_failed',
        userId: pending.player.userId || pending.player.playerId || '',
        matchId: matchId,
        groupId: groupId
      });
      wx.showToast({ title: '加入比赛失败', icon: 'none' });
      return;
    }

    const player = registered.player || pending.player;
    const bindPlayer = {
      playerId: player.playerId || player.userId,
      userId: player.userId || player.playerId,
      name: player.name || player.matchNickname || player.competitionName || player.nickname || '',
      matchNickname: player.matchNickname || player.competitionName || player.name || '',
      nickname: player.nickname || '',
      competitionName: player.competitionName || '',
      avatar: player.avatar || '',
      phone: player.phone || '',
      gender: player.gender || '',
      userType: player.userType || '',
      identitySource: player.identitySource || '',
      source: 'scan'
    };
    this._bindDraftPlayerToSlot(slotIndex, bindPlayer, 'scan', () => {
      this._clearPendingMatchJoinBind();
      this._commitDraftSlots();
      console.log('[match-join-flow]', {
        stage: 'pending_bind_commit',
        ok: true,
        userId: bindPlayer.userId || bindPlayer.playerId || '',
        matchId: matchId,
        groupId: groupId,
        slotId: slotIndex + 1
      });
    });
  },

  // 显式高级操作预留：LIVE 添加/删除默认只改当前球员绑定，禁止调用此函数迁移成绩 key。
  _rebindTeamMatchScoreOwner(match, groupId, oldPlayerId, newPlayerId, slotPosition) {
    const oldId = String(oldPlayerId || '').trim();
    const newId = String(newPlayerId || '').trim();
    if (!match || !groupId || !oldId || !newId || oldId === newId) {
      console.log('[score-player-rebind]', {
        slotPosition: slotPosition,
        oldPlayerId: oldId,
        newPlayerId: newId,
        migratedScore: false,
        updatedProfile: !!newId
      });
      return false;
    }
    match.scoreData = match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : {};
    const groupScoreData = match.scoreData[groupId] && typeof match.scoreData[groupId] === 'object'
      ? match.scoreData[groupId]
      : {};
    const scoresByPlayer = groupScoreData.scoresByPlayer && typeof groupScoreData.scoresByPlayer === 'object'
      ? groupScoreData.scoresByPlayer
      : {};
    const oldRecord = scoresByPlayer[oldId];
    const migratedScore = !!oldRecord;
    if (oldRecord) {
      scoresByPlayer[newId] = {
        scores: (oldRecord.scores || []).slice(),
        putts: (oldRecord.putts || []).slice(),
        fairways: sliceFairways(oldRecord.fairways),
        penalties: slicePenalties(oldRecord.penalties),
        sands: sliceSands(oldRecord.sands)
      };
      delete scoresByPlayer[oldId];
      match.scoreData[groupId] = Object.assign({}, groupScoreData, {
        scoresByPlayer: scoresByPlayer
      });
    }
    console.log('[score-player-rebind]', {
      slotPosition: slotPosition,
      oldPlayerId: oldId,
      newPlayerId: newId,
      migratedScore: migratedScore,
      updatedProfile: true
    });
    return migratedScore;
  },

  _findScoreTeamMatchPlayerEntry(group, position) {
    const pos = Number(position) || 0;
    const players = Array.isArray(group && group.players) ? group.players : [];
    return players.find((player) => Number(player && (player.position != null ? player.position : player.slotIndex)) === pos) || null;
  },

  _hasScoreTeamMatchHistory(match, group, scorePlayerId) {
    const groupId = String(group && group.groupId || '');
    const pid = String(scorePlayerId || '').trim();
    const scoreData = match && match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : {};
    const groupScore = groupId && scoreData[groupId] && typeof scoreData[groupId] === 'object'
      ? scoreData[groupId]
      : null;
    const record = groupScore && groupScore.scoresByPlayer && pid
      ? groupScore.scoresByPlayer[pid]
      : null;
    const scores = record && Array.isArray(record.scores) ? record.scores : [];
    return scores.some((score) => score !== null && score !== undefined && score !== '');
  },

  _scoreTeamMatchSlotsForCurrent() {
    const match = this._readScoreTeamMatch();
    const group = this._findScoreTeamMatchGroup(match);
    if (!match || !group) return null;
    const lookup = this._buildScoreTeamMatchPlayerLookup(match);
    const showTeamLabel = this._shouldShowGroupManageTeamLabel(match);
    const slots = teamMatchStore.resolveGroupSlots(group).map((slot) => {
      const position = Number(slot.position) || 0;
      const entry = this._findScoreTeamMatchPlayerEntry(group, position);
      const userId = String(slot.userId || slot.playerId || '').trim();
      const scorePlayerId = entry && (entry.scorePlayerId || entry.slotScorePlayerId || entry.scoreOwnerId)
        ? String(entry.scorePlayerId || entry.slotScorePlayerId || entry.scoreOwnerId)
        : '';
      const hasCache = !userId && scorePlayerId
        ? this._hasScoreTeamMatchHistory(match, group, scorePlayerId)
        : false;
      const display = lookup[userId] || {};
      const entryName = entry && (entry.matchNickname || entry.competitionName || entry.nickname || entry.name);
      const entryAvatar = entry && (entry.avatar || entry.avatarUrl);
      const teamLabel = showTeamLabel
        ? this._resolveGroupManageTeamLabel(match, entry, userId)
        : '';
      return {
        slotId: position || slot.slotId,
        player: userId
          ? {
              playerId: userId,
              name: display.name || entryName || userId,
              avatar: display.avatar || entryAvatar || '',
              source: 'team_match',
              teamLabel: teamLabel,
              teamGroupName: teamLabel
            }
          : null,
        playerId: userId || null,
        status: userId ? 'occupied' : 'empty',
        source: userId ? 'team_match' : null,
        hasCache: hasCache,
        scorePlayerId: scorePlayerId
      };
    });
    return {
      matchId: match.matchId,
      groupId: group.groupId,
      slots: slots
    };
  },

  _groupsStoreSlotsForCurrent() {
    const g = this.data.groupId ? groupsStore.getGroup(this.data.groupId) : null;
    if (!g) return [];
    const players = (g.players || []).map((player) =>
      player
        ? {
            playerId: player.playerId,
            name: player.name,
            avatar: player.avatar,
            source: player.source || 'groupsStore'
          }
        : null
    );
    return playerSlots.toSlots(players, 4).map((slot, index) =>
      slot.status === 'empty'
        ? Object.assign({}, slot, { hasCache: !!groupsStore.getSlotCache(this.data.groupId, index) })
        : slot
    );
  },

  _logScoreSlotMigration(stage, extra) {
    const team = this._scoreTeamMatchSlotsForCurrent();
    const storeSlots = this._boundToStore() ? this._groupsStoreSlotsForCurrent() : [];
    console.log('[score-slot-migration]', Object.assign({
      stage: stage,
      matchId: team && team.matchId || ((this._matchState || {}).matchId || ''),
      groupId: this.data.groupId || '',
      teamMatchSlots: team ? this._summarizeScoreSlots(team.slots) : [],
      groupsStoreSlots: this._summarizeScoreSlots(storeSlots),
      synced:
        !!team &&
        this._groupSlotsRosterSignature(team.slots) === this._groupSlotsRosterSignature(storeSlots)
    }, extra || {}));
  },

  // 槽位 roster 签名：用于 dirty 判断（空位 / playerId 序列）
  _groupSlotsRosterSignature(slots) {
    return (slots || [])
      .map((s) => {
        if (!s || s.status !== 'occupied') return '-';
        const pid = (s.player && s.player.playerId) || s.playerId || '';
        return String(pid);
      })
      .join('|');
  },

  _isGroupManageDirty() {
    if (!this._originalSlots) return false;
    return (
      this._groupSlotsRosterSignature(this._originalSlots) !==
      this._groupSlotsRosterSignature(this._draftSlots)
    );
  },

  _clearGroupManageDraft() {
    this._originalSlots = null;
    this._draftSlots = null;
    this._draftSlotCache = null;
  },

  /**
   * 普通 fourball_best：打开添加/删除时固化 seats 骨架（seatIndex/teamId）。
   * 仅 UI；不改 _draftSlots / diff / composition 写盘。
   */
  _captureGroupManageSeatTemplate() {
    this._groupManageSeatTemplate = null;
    if (!this._isOrdinaryFourballBestCompositionContext()) return;
    const comp = this._getOrdinaryFourballBestComposition();
    if (!comp) return;
    const seats = getCompositionSeats(comp);
    if (!Array.isArray(seats) || !seats.length) return;
    this._groupManageSeatTemplate = seats.map((s) => ({
      seatIndex: Number(s.seatIndex) || 0,
      teamId: s.teamId != null && String(s.teamId).trim() ? String(s.teamId).trim() : null,
      playerId: s.playerId != null && String(s.playerId).trim() ? String(s.playerId).trim() : null,
      name: s.name || '',
      avatar: s.avatar || ''
    }));
  },

  /**
   * 2+0 草稿展示归位（只影响 UI 映射，不改 _draftSlots / composition）。
   * - 有效 2 人 → 显示在 seat1、seat2
   * - 有效 3 人 → 显示在 seat1、seat2、seat3（确认前预览；seat4 空）
   * @returns {{ byDisplaySeat: Object, occupiedCount: number }|null}
   */
  _normalizeOrdinaryFourballDraftSeatsForView() {
    if (!this._isOrdinaryFourballBestCompositionContext()) return null;
    const comp = this._getOrdinaryFourballBestComposition();
    if (!comp || resolveCompositionType(comp) !== '2+0') return null;

    const draft = this._draftSlots || [];
    const occupied = [];
    draft.forEach((s, i) => {
      if (!s || s.status !== 'occupied') return;
      const pid = this._slotOccupiedPlayerId(s);
      if (!pid) return;
      const si = s.seatIndex != null ? Number(s.seatIndex) : 0;
      occupied.push({
        slot: s,
        draftSlotIndex: i,
        playerId: pid,
        seatIndex: si > 0 ? si : 999
      });
    });
    // 先按原 seatIndex，再按 draft 下标，保证多次增删后相对顺序稳定
    occupied.sort((a, b) => {
      if (a.seatIndex !== b.seatIndex) return a.seatIndex - b.seatIndex;
      return a.draftSlotIndex - b.draftSlotIndex;
    });

    const n = occupied.length;
    if (n !== 2 && n !== 3) return null;

    const byDisplaySeat = {};
    for (let i = 0; i < n; i++) {
      byDisplaySeat[i + 1] = {
        slot: occupied[i].slot,
        draftSlotIndex: occupied[i].draftSlotIndex,
        playerId: occupied[i].playerId
      };
    }
    return { byDisplaySeat: byDisplaySeat, occupiedCount: n };
  },

  /**
   * Seat Model UI：展示顺序固定为 seat1→seat4（getCompositionSeats）。
   * 每行只按 seatIndex 匹配 draft（draft.seatIndex），禁止按 draft 数组序挤位。
   * 2+0 且有效 2/3 人时：先经 _normalizeOrdinaryFourballDraftSeatsForView 归位（只影响展示）。
   * @returns {Array|null} null = 非本赛制，走旧 slot 展示
   */
  _buildGroupManageSeatsViewFromDraft() {
    if (!this._groupManageSeatTemplate && !this._isOrdinaryFourballBestCompositionContext()) {
      return null;
    }
    const comp = this._getOrdinaryFourballBestComposition();
    let seats = comp ? getCompositionSeats(comp) : null;
    if (!Array.isArray(seats) || !seats.length) {
      seats = this._groupManageSeatTemplate;
    }
    if (!Array.isArray(seats) || !seats.length) return null;

    // 固定 seat1..seat4 顺序（不跟 draftSlots 下标）
    seats = seats
      .slice()
      .filter((s) => s && Number(s.seatIndex) > 0)
      .sort((a, b) => Number(a.seatIndex) - Number(b.seatIndex));

    const draft = this._draftSlots || [];
    const norm = this._normalizeOrdinaryFourballDraftSeatsForView();

    // draft 占用者：按 seatIndex 索引（权威）；2+0 归位时改用 norm.byDisplaySeat
    const draftBySeatIndex = {};
    draft.forEach((s, i) => {
      if (!s || s.status !== 'occupied') return;
      const pid = this._slotOccupiedPlayerId(s);
      if (!pid) return;
      const si = s.seatIndex != null ? Number(s.seatIndex) : 0;
      if (!si) return;
      // 同一 seatIndex 只保留第一次，避免错位覆盖
      if (!draftBySeatIndex[si]) {
        draftBySeatIndex[si] = { slot: s, draftSlotIndex: i, playerId: pid };
      }
    });

    // 无 seatIndex 的 draft：仅作 playerId 回退（旧草稿），且不得抢已有 seatIndex 行
    const byPlayerId = {};
    draft.forEach((s, i) => {
      if (!s || s.status !== 'occupied') return;
      const pid = this._slotOccupiedPlayerId(s);
      if (!pid) return;
      const si = s.seatIndex != null ? Number(s.seatIndex) : 0;
      if (si > 0) return;
      byPlayerId[String(pid).trim()] = { slot: s, draftSlotIndex: i, playerId: pid };
    });

    const usedDraft = {};
    const views = seats.map((seat) => {
      const seatIndex = Number(seat.seatIndex) || 0;
      const teamId =
        seat.teamId != null && String(seat.teamId).trim()
          ? String(seat.teamId).trim()
          : null;
      const seatPid =
        seat.playerId != null && String(seat.playerId).trim()
          ? String(seat.playerId).trim()
          : '';

      let hit = null;
      if (norm) {
        // 2+0 归位：只按 seat1..seatN 映射；禁止跟随 draft.seatIndex / 点击位漂移
        hit = norm.byDisplaySeat[seatIndex] || null;
      } else {
        // 1) 优先：draft.seatIndex === 本座
        hit = draftBySeatIndex[seatIndex] || null;
        // 2) 回退：composition 原 player 仍在 draft，且该 draft 无 seatIndex
        if (!hit && seatPid && byPlayerId[seatPid] && !usedDraft[byPlayerId[seatPid].draftSlotIndex]) {
          hit = byPlayerId[seatPid];
        }
      }

      if (hit && !usedDraft[hit.draftSlotIndex]) {
        usedDraft[hit.draftSlotIndex] = true;
        const p = (hit.slot && hit.slot.player) || null;
        return {
          seatIndex: seatIndex,
          slotId: seatIndex,
          draftSlotIndex: hit.draftSlotIndex,
          teamId: teamId,
          occupied: true,
          status: 'occupied',
          player: p,
          playerId: (p && p.playerId) || hit.playerId || seatPid,
          source: (hit.slot && hit.slot.source) || (p && p.source) || null,
          hasCache: !!(hit.slot && hit.slot.hasCache)
        };
      }

      // 空座必须保留（禁止把后面的人挤到前面空座）
      return {
        seatIndex: seatIndex,
        slotId: seatIndex,
        draftSlotIndex: -1,
        teamId: teamId,
        occupied: false,
        status: 'empty',
        player: null,
        playerId: null,
        source: null,
        hasCache: false
      };
    });

    // 空座点击：优先同 seatIndex 的 empty draft，再 seatIndex-1，再任意空 draft
    views.forEach((v) => {
      if (!v || v.status === 'occupied') return;
      const si = Number(v.seatIndex) || 0;
      let idx = draft.findIndex(
        (s) =>
          s &&
          s.status === 'empty' &&
          s.seatIndex != null &&
          Number(s.seatIndex) === si
      );
      if (idx < 0 && si > 0) {
        const prefer = si - 1;
        if (draft[prefer] && draft[prefer].status === 'empty') idx = prefer;
      }
      if (idx < 0) {
        idx = draft.findIndex((s) => s && s.status === 'empty');
      }
      v.draftSlotIndex = idx;
      if (idx >= 0 && draft[idx]) v.hasCache = !!draft[idx].hasCache;
    });

    return views;
  },

  // 添加/删除 UI：fourball_best 优先 seats 序；其它仍从 _draftSlots 刷新
  _refreshGroupManageFromDraft() {
    const seatViews = this._buildGroupManageSeatsViewFromDraft();
    if (seatViews) {
      let occupied = 0;
      seatViews.forEach((s) => {
        if (s && (s.occupied || s.status === 'occupied')) occupied += 1;
      });
      this.setData({
        groupSlots: seatViews,
        playerCount: occupied
      });
      return;
    }
    const slots = this._cloneGroupSlots(this._draftSlots || []);
    let occupied = 0;
    slots.forEach((s) => {
      if (s && s.status === 'occupied') occupied += 1;
    });
    this.setData({
      groupSlots: slots,
      playerCount: occupied
    });
  },

  // draft 专用删除：只改 _draftSlots，供添加/删除编辑期使用
  _removeDraftSlotAt(idx) {
    if (!this._draftSlots || idx == null || idx < 0) return;
    const slots = this._cloneGroupSlots(this._draftSlots);
    const cur = slots[idx];
    if (!cur || cur.status !== 'occupied') return;
    console.log('[score-slot-migration]', {
      stage: 'remove-before',
      groupId: this.data.groupId || '',
      slotIndex: idx,
      draftSlots: this._summarizeScoreSlots(slots)
    });

    this._draftSlotCache = this._draftSlotCache || [];
    this._draftSlotCache[idx] = {
      playerId: (cur.player && cur.player.playerId) || cur.playerId,
      name: (cur.player && cur.player.name) || '',
      avatar: (cur.player && cur.player.avatar) || ''
    };

    const keptSeatIndex =
      cur.seatIndex != null && Number(cur.seatIndex) > 0 ? Number(cur.seatIndex) : null;
    slots[idx] = {
      slotId: cur.slotId,
      seatIndex: keptSeatIndex,
      player: null,
      playerId: null,
      status: 'empty',
      source: null,
      hasCache: true,
      scorePlayerId: cur.scorePlayerId || (cur.player && cur.player.playerId) || cur.playerId || ''
    };
    this._draftSlots = slots;
    this._refreshGroupManageFromDraft();
    console.log('[score-slot-migration]', {
      stage: 'remove-after',
      groupId: this.data.groupId || '',
      slotIndex: idx,
      seatIndex: keptSeatIndex,
      draftSlots: this._summarizeScoreSlots(this._draftSlots)
    });
  },

  // draft 专用补位入口：人员调整只修正 Slot 当前球员绑定，不迁移成绩。
  // seatIndex：player.seatIndex → _targetSeatIndex（点击空座贯穿添加流程）
  _bindDraftPlayerToSlot(idx, player, source, done) {
    const p = Object.assign({}, player, { source: source || 'manual' });
    const seatIndex = this._resolveBindSeatIndex(p.seatIndex);
    this._doBindDraftPlayerToSlot(idx, p, source, seatIndex);
    if (typeof done === 'function') done();
  },

  // draft 专用执行绑定：只改 _draftSlots，不写 gameStore / groupsStore / _demoSlots
  // seatIndex 写入 draft 临时字段，供 diff → composition.seats 使用
  _doBindDraftPlayerToSlot(idx, p, source, seatIndex) {
    if (!this._draftSlots || idx == null || idx < 0) return;
    const slots = this._cloneGroupSlots(this._draftSlots);
    if (!slots[idx]) return;
    if (this._isGameStoreContext()) {
      const playerId = resolveCanonicalUserId(p && p.playerId);
      const currentSlotPlayerId = resolveCanonicalUserId(this._slotOccupiedPlayerId(slots[idx]));
      const used = {};
      this._otherGroupsUsedIds().forEach((id) => {
        const canonicalId = resolveCanonicalUserId(id);
        if (canonicalId) used[canonicalId] = true;
      });
      if (playerId && used[playerId] && playerId !== currentSlotPlayerId) {
        wx.showToast({ title: '该球员已在其他小组', icon: 'none' });
        return;
      }
    }
    const resolvedSeat = this._resolveBindSeatIndex(
      seatIndex != null ? seatIndex : p && p.seatIndex
    );
    console.log('[score-slot-migration]', {
      stage: 'add-before',
      groupId: this.data.groupId || '',
      slotIndex: idx,
      seatIndex: resolvedSeat,
      draftSlots: this._summarizeScoreSlots(slots)
    });
    const player = {
      playerId: p.playerId,
      name: p.name,
      avatar: p.avatar || '',
      source: source || p.source || 'manual',
      gender: p.gender || '',
      tPosition: p.tPosition || '',
      tee: p.tee || p.tPosition || '',
      teamLabel: '',
      teamGroupName: ''
    };
    const match = this._readScoreTeamMatch();
    if (this._shouldShowGroupManageTeamLabel(match)) {
      const teamLabel =
        this._resolveGroupManageTeamLabel(match, p, p.playerId) ||
        String(p.teamLabel || p.teamGroupName || '').trim();
      player.teamLabel = teamLabel;
      player.teamGroupName = teamLabel;
    }
    slots[idx] = {
      slotId: slots[idx].slotId,
      seatIndex:
        resolvedSeat > 0
          ? resolvedSeat
          : slots[idx].seatIndex != null && Number(slots[idx].seatIndex) > 0
            ? Number(slots[idx].seatIndex)
            : null,
      player: player,
      playerId: player.playerId,
      status: 'occupied',
      source: player.source,
      hasCache: false,
      scorePlayerId: slots[idx].scorePlayerId || player.playerId || ''
    };
    if (this._draftSlotCache) this._draftSlotCache[idx] = null;
    this._draftSlots = slots;
    this._refreshGroupManageFromDraft();
    if (source === 'scan') {
      console.log('[match-join-flow]', {
        stage: 'draft_bind_result',
        ok: true,
        userId: player.playerId || '',
        groupId: this.data.groupId || '',
        slotId: idx + 1,
        seatIndex: slots[idx].seatIndex
      });
    }
    console.log('[score-slot-migration]', {
      stage: 'add-after',
      groupId: this.data.groupId || '',
      slotIndex: idx,
      seatIndex: slots[idx].seatIndex,
      draftSlots: this._summarizeScoreSlots(this._draftSlots)
    });
  },

  // draft 第一个空位（编辑期以 _draftSlots 为准）
  _firstDraftEmptySlotIndex() {
    return (this._draftSlots || []).findIndex((s) => s && s.status === 'empty');
  },

  _finalizeCloseGroupManage() {
    this._targetSlotIdx = null;
    this._targetSeatIndex = null;
    this._groupManageSeatTemplate = null;
    this._clearGroupManageDraft();
    this.setData({
      showGroupManage: false,
      addSheetVisible: false,
      playerSourceListVisible: false,
      playerSourceListTitle: '',
      playerSourceListOverline: 'ADD PLAYER',
      playerSourceListEmptyText: '',
      playerSourceListItems: [],
      manualSheetVisible: false,
      manualName: '',
      manualPhone: '',
      manualGender: 'male',
      joinMatchTeamSheetVisible: false,
      joinMatchPlayerName: '',
      joinMatchTeamOptions: []
    });
    this._pendingJoinMatchSlot = null;
  },

  openGroupManagePage() {
    console.log('[group-manage] enter');
    if (this.data.addDeleteDisabled || this._resolveAddDeleteDisabled()) {
      return;
    }
    if (this.data.gameFinished) {
      wx.showToast({ title: '比赛已结束，不可修改球员', icon: 'none' });
      return;
    }
    this._logScoreSlotMigration('open-before', {
      source: this._scoreTeamMatchSlotsForCurrent() ? 'teamMatchStore' : (this._boundToStore() ? 'groupsStore' : 'scorePage')
    });
    console.log('[group-manage] before slots');
    const slots = this._groupSlotsForCurrent();
    console.log('[group-manage] slots', slots);
    const snapshot = this._cloneGroupSlots(slots);
    console.log('[score-slot-migration]', {
      stage: 'open-resolved-draft',
      groupId: this.data.groupId || '',
      draftSlots: this._summarizeScoreSlots(snapshot)
    });
    this._originalSlots = this._cloneGroupSlots(snapshot);
    this._draftSlots = this._cloneGroupSlots(snapshot);
    this._draftSlotCache = [];
    this._targetSeatIndex = null;
    // fourball_best：固化 seats 展示骨架，并给 draft 打临时 seatIndex
    this._captureGroupManageSeatTemplate();
    this._stampDraftSlotsSeatIndexFromTemplate();
    console.log('[group-manage] open modal', {
      seatTemplate: (this._groupManageSeatTemplate || []).map((s) => ({
        seatIndex: s.seatIndex,
        teamId: s.teamId,
        playerId: s.playerId
      }))
    });
    this.setData({
      showGroupManage: true,
      playerSourceOptions: this._resolvePlayerSourceOptionsForCurrentContext()
    });
    this._refreshGroupManageFromDraft();
  },

  closeGroupManagePage() {
    if (this._isGroupManageDirty()) {
      wx.showModal({
        title: '有未保存的修改',
        content: '离开将丢弃未提交的人员修改（确认提交尚未启用）。是否离开？',
        cancelText: '继续编辑',
        confirmText: '离开',
        success: (res) => {
          if (res.confirm) this._finalizeCloseGroupManage();
        }
      });
      return;
    }
    this._finalizeCloseGroupManage();
  },

  // footer「取消」：丢弃 draft、清理状态、关闭添加/删除（不提示）
  onCancelGroupManage() {
    this.setData({ addSheetVisible: false });
    this._finalizeCloseGroupManage();
  },

  // footer「确认」：进入 commit（Phase 3B-2A：gameStore/demoSession 真实写盘）
  _onConfirmGroupManage() {
    this._commitDraftSlots();
  },

  // 槽位 occupied 的 playerId（空位返回 ''）
  _slotOccupiedPlayerId(slot) {
    if (!slot || slot.status !== 'occupied') return '';
    return (slot.player && slot.player.playerId) || slot.playerId || '';
  },

  // 识别添加/删除确认后的提交路径
  _resolveGroupManageCommitPath() {
    const team = this._scoreTeamMatchSlotsForCurrent();
    if (team) {
      return {
        path: 'teamMatchStore',
        label: 'teamMatchStore提交路径',
        mode: this.data.mode || '',
        matchId: team.matchId || '',
        groupId: team.groupId || this.data.groupId || ''
      };
    }
    if (this._boundToStore()) {
      return {
        path: 'groupsStore',
        label: 'groupsStore提交路径',
        mode: this.data.mode || '',
        groupId: this.data.groupId || ''
      };
    }
    if (this._isGameStoreContext()) {
      return {
        path: 'gameStore',
        label: 'gameStore提交路径',
        mode: this.data.mode || '',
        gameId: this.data.gameId || '',
        groupIndex: this._gameGroupIndex || 0
      };
    }
    return {
      path: 'demoSession',
      label: 'demoSession提交路径',
      mode: this.data.mode || '',
      note: '无 gameId / 非 individual_stroke：写 scoreSessions'
    };
  },

  _isTeamMatchPlayerSourceContext() {
    const match = this._readScoreTeamMatch();
    const group = this._findScoreTeamMatchGroup(match);
    return !!(match && group);
  },

  _resolvePlayerSourceOptionsForCurrentContext() {
    return this._isTeamMatchPlayerSourceContext()
      ? TEAM_MATCH_PLAYER_SOURCE_OPTIONS
      : NORMAL_GAME_PLAYER_SOURCE_OPTIONS;
  },

  _isPlayerSourceAllowed(key) {
    return this._resolvePlayerSourceOptionsForCurrentContext().some((item) => item && item.key === key);
  },

  // 比较 original vs draft，生成增删替换变化列表（不写 store）
  _buildGroupManageCommitDiff() {
    const original = this._originalSlots || [];
    const draft = this._draftSlots || [];
    const n = Math.max(original.length, draft.length);
    const added = [];
    const removed = [];
    const replaced = [];
    const unchanged = [];

    for (let i = 0; i < n; i++) {
      const o = original[i];
      const d = draft[i];
      const fromId = this._slotOccupiedPlayerId(o);
      const toId = this._slotOccupiedPlayerId(d);
      const slotId = (d && d.slotId) || (o && o.slotId) || i + 1;
      const seatIndex = this._resolveDiffSeatIndex(o, d);
      const base = {
        slotIndex: i,
        slotId: slotId,
        seatIndex: seatIndex,
        fromPlayerId: fromId || null,
        toPlayerId: toId || null,
        from: o
          ? {
              status: o.status,
              playerId: fromId || null,
              name: (o.player && o.player.name) || null,
              seatIndex:
                o.seatIndex != null && Number(o.seatIndex) > 0
                  ? Number(o.seatIndex)
                  : null
            }
          : null,
        to: d
          ? {
              status: d.status,
              playerId: toId || null,
              name: (d.player && d.player.name) || null,
              source: d.source || (d.player && d.player.source) || null,
              seatIndex:
                d.seatIndex != null && Number(d.seatIndex) > 0
                  ? Number(d.seatIndex)
                  : null
            }
          : null
      };

      if (!fromId && toId) {
        added.push(
          Object.assign({}, base, {
            type: 'add',
            preserveScores: false
          })
        );
      } else if (fromId && !toId) {
        removed.push(
          Object.assign({}, base, {
            type: 'remove',
            preserveScores: false
          })
        );
      } else if (fromId && toId && fromId !== toId) {
        replaced.push(
          Object.assign({}, base, {
            type: 'replace',
            // 换人规则：playerId 替换不清除成绩
            preserveScores: true
          })
        );
      } else {
        unchanged.push({
          slotIndex: i,
          slotId: slotId,
          seatIndex: seatIndex,
          playerId: fromId || null,
          type: 'unchanged'
        });
      }
    }

    return {
      added: added,
      removed: removed,
      replaced: replaced,
      unchanged: unchanged,
      changeCount: added.length + removed.length + replaced.length
    };
  },

  /**
   * Phase 3B-2A：将 draft diff 应用到 _demoSlots（gameStore / demoSession）。
   * game-single：
   * - remove → 仅解绑显示，位成绩留在 scoresBySlot（不依赖 _demoSlotCache）
   * - add/replace → 从 scoresBySlot 恢复该位成绩
   * 其它（demo 等）：仍用 _demoSlotCache
   * 不调用 groupsStore；成功后由 _commitDraftSlots 统一 persist / rebind / 关闭。
   */
  _applyGameOrDemoCommitDiff(diff) {
    try {
      this._ensureDemoSlots();
      this._demoSlotCache = this._demoSlotCache || [];
      const useSlotScores = this._isGameSingleScoreContext();
      if (useSlotScores) {
        this._flushGameSingleOccupiedScoresToStore();
      }
      const draft = this._draftSlots || [];
      const needLen = Math.max(
        this._demoSlots.length,
        draft.length,
        playerSlots.DEFAULT_SLOT_SIZE
      );
      while (this._demoSlots.length < needLen) this._demoSlots.push(null);

      // 1) remove
      (diff.removed || []).forEach((ch) => {
        const idx = ch.slotIndex;
        if (idx == null || idx < 0) return;
        if (!useSlotScores) {
          const cur = this._demoSlots[idx];
          if (cur) {
            this._demoSlotCache[idx] = {
              playerId: cur.playerId || cur.id,
              name: cur.name,
              avatar: cur.avatar,
              scores: (cur.scores || []).slice(),
              putts: (cur.putts || []).slice(),
              fairways: sliceFairways(cur.fairways),
              penalties: slicePenalties(cur.penalties),
              sands: sliceSands(cur.sands)
            };
          }
        }
        this._demoSlots[idx] = null;
      });

      // 2) replace：原地替换身份，保留该位成绩（禁止 remove+add）
      (diff.replaced || []).forEach((ch) => {
        const idx = ch.slotIndex;
        if (idx == null || idx < 0 || !ch.toPlayerId) return;
        const draftSlot = draft[idx] || {};
        const player = draftSlot.player || {};
        const cur = this._demoSlots[idx] || {};
        let scores = (cur.scores || []).slice();
        let putts = (cur.putts || []).slice();
        let fairways = sliceFairways(cur.fairways);
        let penalties = slicePenalties(cur.penalties);
        let sands = sliceSands(cur.sands);
        if (useSlotScores) {
          const saved = this._readGameSingleSlotScores(idx, ch.toPlayerId);
          scores = (saved.scores || []).slice();
          putts = (saved.putts || []).slice();
          fairways = sliceFairways(saved.fairways);
          penalties = slicePenalties(saved.penalties);
          sands = sliceSands(saved.sands);
        }
        const teeFields = applyScorePlayerTeeFields(
          {
            playerId: ch.toPlayerId,
            tPosition: player.tPosition || '',
            gender: player.gender || '',
            matchGender: player.matchGender || ''
          },
          idx
        );
        this._demoSlots[idx] = {
          id: ch.toPlayerId,
          playerId: ch.toPlayerId,
          slotIndex: idx,
          name: player.name || (ch.to && ch.to.name) || '球员',
          avatar: player.avatar || '',
          source: draftSlot.source || (player && player.source) || 'manual',
          gender: teeFields.gender,
          tPosition: teeFields.tPosition,
          colorClass: teeFields.colorClass,
          scores: scores,
          putts: putts,
          fairways: fairways,
          penalties: penalties,
          sands: sands
        };
        if (!useSlotScores) this._demoSlotCache[idx] = null;
      });

      // 3) add
      (diff.added || []).forEach((ch) => {
        const idx = ch.slotIndex;
        if (idx == null || idx < 0 || !ch.toPlayerId) return;
        const draftSlot = draft[idx] || {};
        const player = draftSlot.player || {};
        let scores = [];
        let putts = [];
        let fairways = [];
        let penalties = [];
        let sands = [];
        if (useSlotScores) {
          const saved = this._readGameSingleSlotScores(idx, ch.toPlayerId);
          scores = (saved.scores || []).slice();
          putts = (saved.putts || []).slice();
          fairways = sliceFairways(saved.fairways);
          penalties = slicePenalties(saved.penalties);
          sands = sliceSands(saved.sands);
        } else {
          const cache = this._demoSlotCache[idx];
          scores = cache ? (cache.scores || []).slice() : [];
          putts = cache ? (cache.putts || []).slice() : [];
          fairways = cache ? sliceFairways(cache.fairways) : [];
          penalties = cache ? slicePenalties(cache.penalties) : [];
          sands = cache ? sliceSands(cache.sands) : [];
        }
        const teeFields = applyScorePlayerTeeFields(
          {
            playerId: ch.toPlayerId,
            tPosition: player.tPosition || '',
            gender: player.gender || '',
            matchGender: player.matchGender || ''
          },
          idx
        );
        this._demoSlots[idx] = {
          id: ch.toPlayerId,
          playerId: ch.toPlayerId,
          slotIndex: idx,
          name: player.name || (ch.to && ch.to.name) || '球员',
          avatar: player.avatar || '',
          source: draftSlot.source || (player && player.source) || 'manual',
          gender: teeFields.gender,
          tPosition: teeFields.tPosition,
          colorClass: teeFields.colorClass,
          scores: scores,
          putts: putts,
          fairways: fairways,
          penalties: penalties,
          sands: sands
        };
        if (!useSlotScores) this._demoSlotCache[idx] = null;
      });

      // 由 _demoSlots 派生记分列表（此处不 persist / rebind，交给 commit 收尾）
      this._playersSource = (this._demoSlots || []).filter(Boolean).map((p, i) => {
        const teeFields = applyScorePlayerTeeFields(
          {
            playerId: p.playerId || p.id,
            tPosition: p.tPosition || '',
            gender: p.gender || '',
            matchGender: p.matchGender || ''
          },
          i
        );
        return {
          id: p.playerId || p.id,
          playerId: p.playerId || p.id,
          slotIndex: p.slotIndex != null ? p.slotIndex : this._resolvePlayerSlotIndex(p),
          name: p.name,
          avatar: p.avatar,
          source: p.source || 'manual',
          gender: teeFields.gender,
          tPosition: teeFields.tPosition,
          colorClass: teeFields.colorClass,
          scores: (p.scores || []).slice(),
          putts: (p.putts || []).slice(),
          fairways: sliceFairways(p.fairways),
          penalties: slicePenalties(p.penalties),
          sands: sliceSands(p.sands)
        };
      });
      const patch = { playerCount: this._playersSource.length || 4 };
      if (this.data.activePlayerIdx >= this._playersSource.length) patch.activePlayerIdx = 0;
      this.setData(patch);
      return true;
    } catch (err) {
      console.error('[GROUP_MANAGE_COMMIT_FAIL]', err);
      return false;
    }
  },

  _syncTeamMatchGroupFromDraftSlots() {
    const match = this._readScoreTeamMatch();
    const group = this._findScoreTeamMatchGroup(match);
    if (!match || !group || !Array.isArray(match.groups)) return false;
    const draft = this._draftSlots || [];
    const basePlayers = teamMatchStore.slotsToPlayers(draft);
    const nextPlayers = basePlayers.map((player, index) => {
      const position = Number(player && player.position) || index + 1;
      const slot = draft[index] || {};
      const existing = this._findScoreTeamMatchPlayerEntry(group, position) || {};
      const userId = String((player && player.userId) || '').trim();
      const cachedScorePlayerId =
        (slot && slot.scorePlayerId) ||
        (this._draftSlotCache && this._draftSlotCache[index] && this._draftSlotCache[index].playerId) ||
        existing.scorePlayerId ||
        '';
      if (userId) {
        const profile = this._buildScoreTeamMatchPlayerProfile(match, userId, slot.player || existing);
        const scorePlayerId = cachedScorePlayerId || userId;
        console.log('[score-player-binding]', {
          slotPosition: position,
          currentUserId: userId,
          scorePlayerId: scorePlayerId,
          migratedScore: false,
          updatedProfile: true
        });
        return Object.assign({}, existing, profile, {
          position: position,
          userId: userId,
          playerId: userId,
          scorePlayerId: scorePlayerId
        });
      }
      const next = {
        position: position,
        userId: '',
        playerId: '',
        id: ''
      };
      if (cachedScorePlayerId) {
        next.scorePlayerId = cachedScorePlayerId;
      }
      return next;
    });
    match.groups = match.groups.map((item) =>
      String(item && item.groupId) === String(group.groupId)
        ? Object.assign({}, item, { players: nextPlayers })
        : item
    );
    // 2+2 双分队：先按分队归一座位（队1→1+2，队2→3+4），再 sync Entity（座位切片 → members）
    const playerByUserId = {};
    (match.groups || []).forEach((g) => {
      (Array.isArray(g && g.players) ? g.players : []).forEach((p) => {
        const uid = String((p && (p.userId || p.playerId)) || '').trim();
        if (uid) playerByUserId[uid] = p;
      });
    });
    match.groups = normalizeFormalGroupSeats(match.groups, match).map((g) => {
      const players = (Array.isArray(g && g.players) ? g.players : []).map((slot) => {
        const uid = String((slot && slot.userId) || '').trim();
        const position = Number(slot && slot.position) || 0;
        if (!uid) {
          return Object.assign({}, slot, {
            position: position,
            userId: '',
            playerId: '',
            id: ''
          });
        }
        const prev = playerByUserId[uid] || {};
        return Object.assign({}, prev, slot, {
          position: position,
          userId: uid,
          playerId: uid
        });
      });
      return Object.assign({}, g, { players: players });
    });
    // G4：Entity 来自 pairings；按当前座位重建 pairing（保留 slot id），再 sync
    // 对齐 group-editor：prune 离组球员 + 座位 1+2/3+4 → slot（空座位对应空 playerIds）
    if (resolveStrokeKind(resolveGameMode(match)) === 'g4') {
      const pairingSource =
        match.pairings && typeof match.pairings === 'object' && !Array.isArray(match.pairings)
          ? match.pairings
          : {};
      const pruned = this._prunePairingsToGroups(match.groups, pairingSource);
      match.pairings = teamMatchStore.sanitizePairings(
        this._rebuildG4PairingsFromGroupSeats(match, pruned)
      );
    }
    // 与 group-editor LIVE 一致：groups 变更后 merge members，保留 entityId / 不碰 teamScoresByEntity
    match.scoreEntities = syncStrokeEntities(match);
    teamMatchStore.saveMatch(match);
    this._logScoreSlotMigration('teamMatch-sync-after', {
      draftSlots: this._summarizeScoreSlots(this._draftSlots)
    });
    return true;
  },

  /**
   * G4：删除组/球员后清理 pairings（对齐 group-editor._prunePairingsToGroups）
   * 保留 pairing.id；playerIds 仅保留仍在当前 groups 中的球员。
   */
  _prunePairingsToGroups(groups, pairingDraft) {
    const next = {};
    (groups || []).forEach((g) => {
      const gid = String((g && g.groupId) || '');
      if (!gid) return;
      const validPlayers = {};
      (Array.isArray(g && g.players) ? g.players : []).forEach((p) => {
        const id = p && p.userId != null ? String(p.userId).trim() : '';
        if (id) validPlayers[id] = true;
      });
      const list = pairingDraft && pairingDraft[gid] ? pairingDraft[gid] : [];
      next[gid] = (Array.isArray(list) ? list : []).map((pr) => ({
        id: pr && pr.id,
        playerIds: (pr && Array.isArray(pr.playerIds) ? pr.playerIds : [])
          .map(String)
          .filter((id) => validPlayers[id])
      }));
    });
    return next;
  },

  /**
   * G4：按座位重填 pairing.playerIds，复用已有 slot id（对齐 group-editor buildAutoPairingsForGroup）
   * 1+2 → slot1，3+4 → slot2；空座位 → playerIds=[]，不删 id。
   */
  _rebuildG4PairingsFromGroupSeats(match, existingPairings) {
    const matchId = match && match.matchId != null ? String(match.matchId).trim() : '';
    const existing =
      existingPairings && typeof existingPairings === 'object' && !Array.isArray(existingPairings)
        ? existingPairings
        : {};
    const out = {};
    (Array.isArray(match && match.groups) ? match.groups : []).forEach((group) => {
      const groupId = group && group.groupId != null ? String(group.groupId) : '';
      if (!groupId) return;
      const players = (Array.isArray(group.players) ? group.players : [])
        .map((p) => ({
          userId: p && p.userId != null ? String(p.userId).trim() : '',
          position: Number(p && p.position) || 0
        }))
        .filter((p) => p.userId)
        .sort((a, b) => a.position - b.position || String(a.userId).localeCompare(String(b.userId)));

      const existingList = Array.isArray(existing[groupId]) ? existing[groupId] : [];
      const existingBySlot = {};
      existingList.forEach((pr, idx) => {
        if (!pr) return;
        const id = pr.id != null ? String(pr.id) : '';
        const m = /__slot(\d+)$/.exec(id);
        const slotNo = m ? parseInt(m[1], 10) : idx + 1;
        if (slotNo >= 1 && !existingBySlot[slotNo]) existingBySlot[slotNo] = id;
      });

      const filledBySlot = {};
      let slotNo = 1;
      for (let i = 0; i + 1 < players.length; i += 2) {
        const prevId = existingBySlot[slotNo] || '';
        const id =
          prevId ||
          matchId + '__' + groupId + '__slot' + slotNo;
        filledBySlot[slotNo] = {
          id: id,
          playerIds: [String(players[i].userId), String(players[i + 1].userId)]
        };
        slotNo += 1;
      }

      const list = [];
      const maxSlot = Math.max(
        2,
        slotNo - 1,
        ...Object.keys(existingBySlot).map((n) => Number(n) || 0)
      );
      for (let n = 1; n <= maxSlot; n++) {
        if (filledBySlot[n]) {
          list.push(filledBySlot[n]);
          continue;
        }
        if (existingBySlot[n]) {
          list.push({ id: existingBySlot[n], playerIds: [] });
        }
      }
      if (list.length) out[groupId] = list;
    });
    return out;
  },

  /**
   * LIVE 添加/删除确认前分组合法性（G2/G3 / G4）。
   * 失败返回中文错误文案；非相关赛制或空组返回 ''。
   */
  _validateTeamMatchDraftComposition() {
    const match = this._readScoreTeamMatch();
    if (!match) return '';
    const kind = resolveStrokeKind(resolveGameMode(match));
    if (kind !== 'g2g3' && kind !== 'g4') return '';

    const nextPlayers = teamMatchStore.slotsToPlayers(this._draftSlots || []);
    const filled = listFilledPlayers({ players: nextPlayers });
    if (!filled.length) return '';

    const teamMap = buildRegisterTeamMap(match);
    for (let i = 0; i < filled.length; i++) {
      const uid = filled[i].userId;
      const teamId = teamMap[uid] != null ? String(teamMap[uid]).trim() : '';
      if (!teamId) {
        return '存在未归属分队的球员，请先完成报名分队';
      }
    }

    if (kind === 'g4') {
      return this._validateG4DraftComposition(filled, teamMap);
    }

    const mode = resolveCompositionMode(match);
    if (mode === '4+0') {
      if (filled.length > 4) return '4+0模式下每组最多 4 人';
      const teamIds = {};
      filled.forEach((p) => {
        teamIds[String(teamMap[p.userId]).trim()] = true;
      });
      if (Object.keys(teamIds).length !== 1) {
        return '4+0组合不能跨分队';
      }
      return '';
    }

    // 2+2：1 分队永远合法；2 分队各 ≤2；3+ 分队非法
    if (filled.length > 4) return '2+2模式下每组最多 4 人';
    const buckets = {};
    filled.forEach((p) => {
      const teamId = String(teamMap[p.userId]).trim();
      if (!buckets[teamId]) buckets[teamId] = [];
      buckets[teamId].push(p.userId);
    });
    const teamIds = Object.keys(buckets);
    if (teamIds.length === 1) return '';
    if (teamIds.length === 2) {
      for (let i = 0; i < teamIds.length; i++) {
        if (buckets[teamIds[i]].length > 2) {
          return '2+2模式下每个组合最多 2 人，无法按分队拆成合法组合';
        }
      }
      return '';
    }
    return '2+2模式同组最多来自两个分队';
  },

  /**
   * G4：单分队 4 人，或双分队 2+2；亦允许同队 2 人（删组合后剩一组）。
   * 非法：人数非 2/4、3+1、2+1+1、3+ 分队等。
   */
  _validateG4DraftComposition(filled, teamMap) {
    const g4Err =
      '四人两球比杆赛要求4名球员来自同一分队，或两个分队各2名球员';
    const n = filled.length;
    if (n !== 2 && n !== 4) return g4Err;

    const buckets = {};
    filled.forEach((p) => {
      const teamId = String(teamMap[p.userId]).trim();
      if (!buckets[teamId]) buckets[teamId] = [];
      buckets[teamId].push(p.userId);
    });
    const teamIds = Object.keys(buckets);

    if (n === 2) {
      return teamIds.length === 1 ? '' : g4Err;
    }
    // n === 4
    if (teamIds.length === 1) return '';
    if (teamIds.length === 2) {
      if (buckets[teamIds[0]].length === 2 && buckets[teamIds[1]].length === 2) {
        return '';
      }
      return g4Err;
    }
    return g4Err;
  },

  _applyTeamMatchStoreCommitDiff(diff) {
    const ok = this._syncTeamMatchGroupFromDraftSlots();
    if (!ok) return false;

    const group = this.data.groupId ? groupsStore.getGroup(this.data.groupId) : null;
    let groupsStoreSynced = false;
    if (group && Array.isArray(group.players)) {
      groupsStoreSynced = this._applyGroupsStoreCommitDiff(diff);
      if (!groupsStoreSynced) {
        console.warn('[score-slot-migration]', {
          stage: 'groupsStore-optional-sync-failed',
          groupId: this.data.groupId || ''
        });
      }
    } else {
      console.log('[score-slot-migration]', {
        stage: 'groupsStore-optional-sync-skipped',
        groupId: this.data.groupId || '',
        reason: 'groupsStore group missing'
      });
    }

    console.log('[score-slot-migration]', {
      stage: 'teamMatch-commit-applied',
      groupId: this.data.groupId || '',
      groupsStoreSynced: groupsStoreSynced,
      draftSlots: this._summarizeScoreSlots(this._draftSlots)
    });
    return true;
  },

  /**
   * Phase 3B-2B：将 draft diff 应用到 groupsStore（individual_stroke）。
   * - remove → removePlayerSlot（holes 进 slotCache）
   * - replace → 原地换 playerId，保留 holes 与 slotCache（禁止 remove+add）
   * - add → bindPlayerToSlot（有 slotCache 时直接恢复显示）
   */
  _applyGroupsStoreCommitDiff(diff) {
    const groupId = this.data.groupId;
    if (!groupId) return false;
    try {
      this._logScoreSlotMigration('commit-before', {
        draftSlots: this._summarizeScoreSlots(this._draftSlots)
      });
      // 先把当前记分成绩 flush 进 groups，避免提交时 holes 过期
      this.persistSession();
      const group = groupsStore.getGroup(groupId);
      if (!group || !Array.isArray(group.players)) return false;
      const draft = this._draftSlots || [];

      // 1) remove
      (diff.removed || []).forEach((ch) => {
        const idx = ch.slotIndex;
        if (idx == null || idx < 0) return;
        groupsStore.removePlayerSlot(groupId, idx);
      });

      // 2) replace：原地替换身份，保留 holes；不碰 slotCache
      (diff.replaced || []).forEach((ch) => {
        const idx = ch.slotIndex;
        if (idx == null || idx < 0 || !ch.toPlayerId) return;
        if (idx >= group.players.length) return;
        const existing = group.players[idx];
        if (!existing) return;
        const draftSlot = draft[idx] || {};
        const player = draftSlot.player || {};
        const holes = (existing.holes || []).map((h) => Object.assign({}, h));
        group.players[idx] = Object.assign({}, existing, {
          playerId: ch.toPlayerId,
          name: player.name || (ch.to && ch.to.name) || existing.name || '球员',
          avatar: player.avatar != null ? player.avatar : existing.avatar || '',
          source: draftSlot.source || (player && player.source) || existing.source || 'manual',
          holes: holes
        });
        // slotCache[idx] 故意不清理，满足「保留 slotCache」
      });

      // 3) add
      (diff.added || []).forEach((ch) => {
        const idx = ch.slotIndex;
        if (idx == null || idx < 0 || !ch.toPlayerId) return;
        const draftSlot = draft[idx] || {};
        const player = draftSlot.player || {};
        const result = groupsStore.bindPlayerToSlot(
          groupId,
          idx,
          {
            playerId: ch.toPlayerId,
            name: player.name || (ch.to && ch.to.name) || '球员',
            avatar: player.avatar || '',
            source: draftSlot.source || (player && player.source) || 'manual'
          },
          true
        );
        if (!result || !result.ok) {
          throw new Error('bindPlayerToSlot failed at slot ' + idx + ': ' + ((result && result.reason) || 'unknown'));
        }
      });

      this._syncTeamMatchGroupFromDraftSlots();
      this._logScoreSlotMigration('commit-after', {
        draftSlots: this._summarizeScoreSlots(this._draftSlots)
      });
      return true;
    } catch (err) {
      console.error('[GROUP_MANAGE_GROUPS_COMMIT_FAIL]', err);
      return false;
    }
  },

  /**
   * 确认提交：
   * - 生成 diff + COMMIT_PLAN 日志
   * - gameStore / demoSession：真实写盘（Phase 3B-2A）
   * - groupsStore：真实写盘（Phase 3B-2B）
   */
  _commitDraftSlots() {
    const dirty = this._isGroupManageDirty();
    const commitPath = this._resolveGroupManageCommitPath();
    const diff = this._buildGroupManageCommitDiff();
    const plan = {
      dirty: dirty,
      commitPath: commitPath,
      originalSig: this._groupSlotsRosterSignature(this._originalSlots),
      draftSig: this._groupSlotsRosterSignature(this._draftSlots),
      diff: diff,
      rules: {
        replacePreservesScores: true,
        addUsesInheritFlag: true,
        removeCachesSlotScoresForLaterInherit: true
      },
      applyOrder: ['remove', 'replace', 'add'],
      deferredWrites: {
        gameStore: false,
        groupsStore: false,
        persistSession: false,
        rebindScoreContext: false
      }
    };

    console.log('[GROUP_MANAGE_COMMIT_PLAN]', plan);

    if (!dirty) {
      wx.showToast({ title: '没有修改', icon: 'none' });
      this._finalizeCloseGroupManage();
      return plan;
    }

    if (commitPath.path === 'teamMatchStore') {
      const compositionErr = this._validateTeamMatchDraftComposition();
      if (compositionErr) {
        wx.showToast({ title: compositionErr, icon: 'none' });
        return plan;
      }
      const ok = this._applyTeamMatchStoreCommitDiff(diff);
      if (!ok) {
        wx.showToast({ title: '提交失败', icon: 'none' });
        return plan;
      }
      plan.deferredWrites = {
        gameStore: false,
        groupsStore: !!groupsStore.getGroup(this.data.groupId),
        teamMatchStore: true,
        persistSession: false,
        rebindScoreContext: true
      };
      console.log('[GROUP_MANAGE_COMMIT_APPLIED]', {
        path: 'teamMatchStore',
        matchId: commitPath.matchId || '',
        groupId: this.data.groupId,
        changeCount: diff.changeCount
      });
      this._reloadFromTeamMatchDraft();
      this.rebindScoreContext();
      this._reloadStrokeEntitiesAfterGroupManage();
      this._finalizeCloseGroupManage();
      wx.showToast({ title: '已保存', icon: 'success' });
      return plan;
    }

    if (commitPath.path === 'groupsStore') {
      const ok = this._applyGroupsStoreCommitDiff(diff);
      if (!ok) {
        wx.showToast({ title: '提交失败', icon: 'none' });
        return plan;
      }
      plan.deferredWrites = {
        gameStore: false,
        groupsStore: true,
        persistSession: true,
        rebindScoreContext: true
      };
      console.log('[GROUP_MANAGE_COMMIT_APPLIED]', {
        path: 'groupsStore',
        groupId: this.data.groupId,
        changeCount: diff.changeCount,
        players: ((groupsStore.getGroup(this.data.groupId) || {}).players || []).map((p) =>
          p ? { playerId: p.playerId, name: p.name, holes: (p.holes || []).length } : null
        )
      });
      this._reloadFromStore();
      this.rebindScoreContext();
      this._finalizeCloseGroupManage();
      wx.showToast({ title: '已保存', icon: 'success' });
      return plan;
    }

    if (commitPath.path !== 'gameStore' && commitPath.path !== 'demoSession') {
      wx.showToast({ title: '未知提交路径', icon: 'none' });
      return plan;
    }

    // 普通四人两球：保存前校验 2/4 人（禁止 1/3）；不改球队赛路径
    if (commitPath.path === 'gameStore' && this._isOrdinaryFourball2BallContext()) {
      const compositionErr = this._validateOrdinaryFourball2BallDraft(this._draftSlots);
      if (compositionErr) {
        wx.showToast({ title: compositionErr, icon: 'none' });
        return plan;
      }
    }

    // 普通创建：全员删除 → 取消球局 / 删除分组（禁止写入空 playersSlots）
    if (commitPath.path === 'gameStore' && this._needsOrdinaryGameEmptyRosterCancel(commitPath)) {
      this._promptOrdinaryGameEmptyRosterCancel(plan);
      return plan;
    }

    // 普通 fourball_best：2+1 → 加第 4 人：先选组合，再 apply（取消则不落盘）
    if (
      commitPath.path === 'gameStore' &&
      this._isOrdinaryFourballBestCompositionContext() &&
      this._needsOrdinaryFourball21To4Transition(diff)
    ) {
      this._promptOrdinaryFourball21To4Transition(diff, plan);
      return plan;
    }

    // 普通 fourball_best：3+0 → 加第 4 人：只选 4+0 / 3+1（禁止自动保持 3+0）
    if (
      commitPath.path === 'gameStore' &&
      this._isOrdinaryFourballBestCompositionContext() &&
      this._needsOrdinaryFourball30To4Transition(diff)
    ) {
      this._promptOrdinaryFourball30To4Transition(diff, plan);
      return plan;
    }

    // 普通 fourball_best：2+0 → 加第 3 人：只选 3+0 / 2+1（不走普通 seat sync）
    if (
      commitPath.path === 'gameStore' &&
      this._isOrdinaryFourballBestCompositionContext() &&
      this._needsOrdinaryFourball20To3Transition(diff)
    ) {
      this._promptOrdinaryFourball20To3Transition(diff, plan);
      return plan;
    }

    // 普通 fourball_best：2+0 → 一次加 2 人至满 4：选 4+0 / 3+1 / 2+2 / 2+1+1
    if (
      commitPath.path === 'gameStore' &&
      this._isOrdinaryFourballBestCompositionContext() &&
      this._needsOrdinaryFourball20To4Transition(diff)
    ) {
      this._promptOrdinaryFourball20To4Transition(diff, plan);
      return plan;
    }

    const ok = this._applyGameOrDemoCommitDiff(diff);
    if (!ok) {
      wx.showToast({ title: '提交失败', icon: 'none' });
      return plan;
    }

    // 普通 fourball_best：Seat Model 同步 seats → 派生 teams → _engineGroups（保留 teamId / 成绩）
    // 四人两球：仍走 slot→team 全量重建 members
    if (commitPath.path === 'gameStore' && this._isOrdinaryFourball2BallContext()) {
      const synced = this._syncOrdinaryFourball2BallCompositionFromSlots();
      if (!synced) {
        wx.showToast({ title: '组合同步失败', icon: 'none' });
        return plan;
      }
    } else if (commitPath.path === 'gameStore' && this._isOrdinaryFourballBestCompositionContext()) {
      const synced = this._syncOrdinaryFourballCompositionFromSeats(diff);
      if (!synced) {
        wx.showToast({ title: '组合同步失败', icon: 'none' });
        return plan;
      }
    }

    plan.deferredWrites = {
      gameStore: commitPath.path === 'gameStore',
      groupsStore: false,
      persistSession: true,
      rebindScoreContext: true
    };
    console.log('[GROUP_MANAGE_COMMIT_APPLIED]', {
      path: commitPath.path,
      changeCount: diff.changeCount,
      demoSlots: (this._demoSlots || []).map((p) =>
        p ? { playerId: p.playerId || p.id, name: p.name, scoreLen: (p.scores || []).length } : null
      )
    });

    this.persistSession();
    this.rebindScoreContext();
    this._finalizeCloseGroupManage();
    wx.showToast({ title: '已保存', icon: 'success' });
    return plan;
  },

  /**
   * 普通创建 gameStore：当前 draft 有效球员为 0 → 禁止直接保存空名单。
   * 不进 teamMatchStore / groupsStore。
   */
  _needsOrdinaryGameEmptyRosterCancel(commitPath) {
    if (!commitPath || commitPath.path !== 'gameStore') return false;
    if (!this.data.gameId || !this._isGameStoreContext()) return false;
    return this._countOccupiedDraftSlots() === 0;
  },

  /**
   * 全员删除确认：单组取消球局；多组删除当前分组（删尽则取消整局）。
   * 确认前不调用 applyDiff / composition patch。
   */
  _promptOrdinaryGameEmptyRosterCancel(plan) {
    const gameId = this.data.gameId;
    const game = gameStore.getGame(gameId);
    if (!game) {
      wx.showToast({ title: '比赛不存在', icon: 'none' });
      return;
    }
    const groupCount = gameStore.listGroups(game).length;
    const isMulti = groupCount > 1;
    wx.showModal({
      title: isMulti ? '删除分组' : '取消球局',
      content: isMulti
        ? '当前分组已没有参与球员，是否删除该分组？'
        : '当前球局已没有参与球员，是否取消该球局？',
      confirmText: isMulti ? '删除' : '取消球局',
      cancelText: '再想想',
      success: (res) => {
        if (!res.confirm) {
          wx.showToast({ title: '已取消保存', icon: 'none' });
          return;
        }
        if (plan) {
          plan.deferredWrites = {
            gameStore: true,
            groupsStore: false,
            persistSession: false,
            rebindScoreContext: false,
            emptyRosterCancel: true
          };
        }
        if (!isMulti) {
          this._finalizeCloseGroupManage();
          this._confirmCancelGame();
          return;
        }
        this._removeOrdinaryEmptyGroup();
      }
    });
  },

  /**
   * 多组 Game：删除当前空名单分组（非人员解绑）。
   * 保留其它 group；删后无组则取消整局。
   */
  _removeOrdinaryEmptyGroup() {
    const gameId = this.data.gameId;
    const game = gameStore.getGame(gameId);
    if (!game) {
      wx.showToast({ title: '比赛不存在', icon: 'none' });
      return false;
    }
    const gi = this._gameGroupIndex != null ? Number(this._gameGroupIndex) || 0 : 0;
    const groups = gameStore.listGroups(game).slice();
    if (!groups.length || gi < 0 || gi >= groups.length) {
      this._finalizeCloseGroupManage();
      this._confirmCancelGame();
      return true;
    }

    const removed = groups[gi] || {};
    const removedId = String(removed.groupId || removed.id || '').trim();
    const nextGroups = groups.filter((_, i) => i !== gi);

    if (!nextGroups.length) {
      this._finalizeCloseGroupManage();
      this._confirmCancelGame();
      return true;
    }

    const prevMap =
      game.groupCompositionMap && typeof game.groupCompositionMap === 'object'
        ? game.groupCompositionMap
        : {};
    const keepIds = {};
    nextGroups.forEach((g) => {
      const id = g && (g.groupId || g.id);
      if (id) keepIds[String(id)] = true;
    });
    const nextMap = {};
    Object.keys(prevMap).forEach((k) => {
      if (removedId && String(k) === removedId) return;
      if (keepIds[String(k)]) nextMap[k] = prevMap[k];
    });
    nextGroups.forEach((g, i) => {
      const id = g && (g.groupId || g.id);
      if (!id || !nextMap[id]) return;
      nextMap[id] = Object.assign({}, nextMap[id], { groupIndex: i, groupId: id });
      nextGroups[i] = Object.assign({}, g, { composition: nextMap[id] });
    });

    const first = nextGroups[0] || {};
    const firstComp =
      (first.groupId && nextMap[first.groupId]) || first.composition || null;

    game.groups = nextGroups;
    game.groupCompositionMap = nextMap;
    game.playersSlots = Array.isArray(first.playersSlots) ? first.playersSlots.slice() : [];
    game.composition = firstComp
      ? {
          type: firstComp.compositionType || firstComp.type || '',
          single: firstComp.teamMode === 'single_team' || !!firstComp.single,
          teams: firstComp.teams || [],
          scoringTemplate: firstComp.scoringTemplate || ''
        }
      : null;
    if (firstComp && firstComp.scoringTemplate) {
      game.scoringTemplate = firstComp.scoringTemplate;
    }

    gameStore.saveGame(game);
    this._finalizeCloseGroupManage();
    console.log('[ordinary-game-empty-group-removed]', {
      gameId: gameId,
      removedIndex: gi,
      removedId: removedId,
      remaining: nextGroups.length
    });

    wx.showToast({ title: '分组已删除', icon: 'success', duration: 1200 });
    setTimeout(() => {
      if (nextGroups.length > 1) {
        wx.redirectTo({
          url: '/pages/game/hub/index?gameId=' + encodeURIComponent(gameId),
          fail: () => wx.reLaunch({ url: '/pages/home/index?tab=my' })
        });
        return;
      }
      const ms = matchState.buildFromGame(game, 0);
      matchState.setMatchState(ms);
      this._matchState = ms;
      this._gameGroupIndex = 0;
      this._refreshScorePageFromGame();
    }, 350);
    return true;
  },

  /** 普通局四人两球：formatType=fourball_2ball + fourball_best + gameStore */
  _isOrdinaryFourball2BallContext() {
    if (this.data.mode !== 'fourball_best' || !this.data.gameId) return false;
    const ms = this._matchState || matchState.getMatchState() || {};
    if (String(ms.formatType || '').trim() === 'fourball_2ball') return true;
    const game = gameStore.getGame(this.data.gameId);
    return !!(game && game.gameMode === '四人两球赛');
  },

  /**
   * 普通局最好成绩 / 最佳球位（含 2+2）：有 composition.teams 时需换人后同步 members。
   * 不含四人两球（走 _syncOrdinaryFourball2BallCompositionFromSlots）。
   */
  _isOrdinaryFourballBestCompositionContext() {
    if (this.data.mode !== 'fourball_best' || !this.data.gameId) return false;
    if (this._isOrdinaryFourball2BallContext()) return false;
    const ms = this._matchState || matchState.getMatchState() || {};
    const ft = String(ms.formatType || '').trim();
    const game = gameStore.getGame(this.data.gameId);
    const gm = game ? String(game.gameMode || '').trim() : '';
    const formatOk =
      ft === 'best_score' ||
      ft === 'best_ball' ||
      ft === 'best_ball_4_0' ||
      gm === '最好成绩赛' ||
      gm === '最佳球位赛';
    if (!formatOk || !game) return false;
    const gi = this._gameGroupIndex || 0;
    const storeGroups = gameStore.listGroups(game);
    const group = storeGroups[gi] || {};
    const groupId = group.groupId || this.data.gameId + '-g' + (gi + 1);
    const prevMap =
      game.groupCompositionMap && typeof game.groupCompositionMap === 'object'
        ? game.groupCompositionMap
        : {};
    const prevComp = prevMap[groupId] || group.composition || game.composition || null;
    return !!(prevComp && Array.isArray(prevComp.teams) && prevComp.teams.length);
  },

  /**
   * 解析当前组 composition（对齐 map key / group.composition / 顶层 game.composition）。
   * @returns {{ game, group, gi, mapKey, prevMap, comp }|null}
   */
  _resolveOrdinaryFourballCompositionRecord() {
    if (!this._isOrdinaryFourballBestCompositionContext()) return null;
    const gameId = this.data.gameId;
    const game = gameStore.getGame(gameId);
    if (!game) return null;
    const gi = this._gameGroupIndex || 0;
    const storeGroups = gameStore.listGroups(game);
    const group = storeGroups[gi] || {};
    const prevMap =
      game.groupCompositionMap && typeof game.groupCompositionMap === 'object'
        ? game.groupCompositionMap
        : {};
    const keyCandidates = [];
    if (group.groupId) keyCandidates.push(String(group.groupId));
    if (group.id) keyCandidates.push(String(group.id));
    if (group.composition && group.composition.groupId) {
      keyCandidates.push(String(group.composition.groupId));
    }
    keyCandidates.push(gameId + '-g' + (gi + 1));

    let mapKey = '';
    let comp = null;
    for (let i = 0; i < keyCandidates.length; i++) {
      const k = keyCandidates[i];
      if (k && prevMap[k] && Array.isArray(prevMap[k].teams) && prevMap[k].teams.length) {
        mapKey = k;
        comp = prevMap[k];
        break;
      }
    }
    if (!comp) {
      const keys = Object.keys(prevMap);
      for (let i = 0; i < keys.length; i++) {
        const rec = prevMap[keys[i]];
        if (rec && Number(rec.groupIndex) === gi && Array.isArray(rec.teams) && rec.teams.length) {
          mapKey = keys[i];
          comp = rec;
          break;
        }
      }
    }
    if (!comp && group.composition && Array.isArray(group.composition.teams)) {
      comp = group.composition;
      mapKey = mapKey || keyCandidates[0] || gameId + '-g' + (gi + 1);
    }
    if (!comp && gi === 0 && game.composition && Array.isArray(game.composition.teams)) {
      const gc = game.composition;
      comp = {
        compositionType: resolveCompositionType(gc),
        teamMode: gc.single || gc.teamMode === 'single_team' ? 'single_team' : 'split_team',
        teams: gc.teams,
        scoringTemplate: gc.scoringTemplate || 'team_best',
        playerCount: (gc.teams || []).reduce(
          (n, t) => n + (((t && (t.members || t.players)) || []).length),
          0
        )
      };
      mapKey = mapKey || keyCandidates[0] || gameId + '-g1';
    }
    if (!comp || !Array.isArray(comp.teams) || !comp.teams.length) return null;
    return { game: game, group: group, gi: gi, mapKey: mapKey, prevMap: prevMap, comp: comp };
  },

  _getOrdinaryFourballBestComposition() {
    const resolved = this._resolveOrdinaryFourballCompositionRecord();
    return resolved ? resolved.comp : null;
  },

  /** compositionType 权威字段（缺员时不因 members 数量推断） */
  _readOrdinaryFourballCompositionType() {
    if (this.data.mode !== 'fourball_best' || !this.data.gameId) return '';
    if (this._isOrdinaryFourball2BallContext()) return '';
    const resolved = this._resolveOrdinaryFourballCompositionRecord();
    return resolved ? resolveCompositionType(resolved.comp) : '';
  },

  _countOccupiedDraftSlots() {
    let n = 0;
    (this._draftSlots || []).forEach((s) => {
      if (this._slotOccupiedPlayerId(s)) n += 1;
    });
    return n;
  },

  /**
   * 2+1 增加第 4 人：只选组合类型（2+2/3+1/2+1+1），不重新分配已有成员。
   * 不进修改比赛 / create grouping。apply 前调用。
   */
  _needsOrdinaryFourball21To4Transition(diff) {
    if (!this._isOrdinaryFourballBestCompositionContext()) return false;
    if (!(diff && Array.isArray(diff.added) && diff.added.length)) return false;
    if (this._countOccupiedDraftSlots() !== 4) return false;
    const prevComp = this._getOrdinaryFourballBestComposition();
    if (!prevComp) return false;
    const type = resolveCompositionType(prevComp);
    // 3+1 / 2+2 缺员恢复走 patch（按 compositionType 补员），不进组合转换
    if (type === '3+1' || type === '2+2') return false;
    if (type === '2+1') return true;
    // 无 type 时仅结构 2+1 才提示转换；勿把 3+1 缺员（2+1 形态）误判进来
    return !type && isFourball21Shape(prevComp);
  },

  _promptOrdinaryFourball21To4Transition(diff, plan) {
    // 仅选组合类型；选定后按 Seat Model 改 seats 再派生 teams（无成员选择）
    const itemList = ['2+2', '3+1', '2+1+1'];
    wx.showActionSheet({
      alertText: '请选择新的组合方式',
      itemList: itemList,
      success: (res) => {
        const targetType = itemList[res.tapIndex];
        if (!targetType) return;
        const ok = this._applyGameOrDemoCommitDiff(diff);
        if (!ok) {
          wx.showToast({ title: '提交失败', icon: 'none' });
          return;
        }
        // 先落盘 roster / 个人分；组合与 teamScores 由 transition 最后写入
        this.persistSession();
        const synced = this._applyOrdinaryFourball21To4Transition(diff, targetType);
        if (!synced) {
          wx.showToast({ title: '组合同步失败', icon: 'none' });
          return;
        }
        if (plan) {
          plan.deferredWrites = {
            gameStore: true,
            groupsStore: false,
            persistSession: true,
            rebindScoreContext: true
          };
        }
        console.log('[GROUP_MANAGE_COMMIT_APPLIED]', {
          path: 'gameStore',
          fourball21To4: targetType,
          changeCount: diff && diff.changeCount
        });
        this._finalizeCloseGroupManage();
        this._refreshScorePageFromGame();
        wx.showToast({ title: '已保存', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '已取消，请选择组合后保存', icon: 'none' });
      }
    });
  },

  /**
   * 3+0 容量为 3。仅当添加后有效人数 >3（即满 4）才升级选 4+0/3+1。
   * 缺员恢复（2→3 / 1→2 / 1→3 等，draft≤3）不进 transition，走 Seat sync。
   * 一次加 2 人（如 2→4）draft===4 → 仍进 transition。
   */
  _needsOrdinaryFourball30To4Transition(diff) {
    if (!this._isOrdinaryFourballBestCompositionContext()) return false;
    if (!(diff && Array.isArray(diff.added) && diff.added.length)) return false;
    const prevComp = this._getOrdinaryFourballBestComposition();
    if (!prevComp) return false;
    if (resolveCompositionType(prevComp) !== '3+0') return false;
    // 只有有效人数将超过 3+0 容量才升级
    return this._countOccupiedDraftSlots() > 3;
  },

  /** 3+0 合法座位：seat1–seat3；seat4 在保持 3+0 时禁止写入 */
  _isOrdinaryFourball30CapacitySeat(seatIndex) {
    const si = Number(seatIndex);
    return si >= 1 && si <= 3;
  },

  /**
   * 3+0 缺员恢复：在 seat1–3 中找最小空 seatIndex（看 draft 占用）。
   * 不重排、不碰 seat4。
   */
  _nextEmptySeatIndexInThreeZeroCapacity() {
    const used = {};
    (this._draftSlots || []).forEach((s) => {
      if (!s || s.status !== 'occupied') return;
      const si = s.seatIndex != null ? Number(s.seatIndex) : 0;
      if (si >= 1 && si <= 3) used[si] = true;
    });
    for (let si = 1; si <= 3; si++) {
      if (!used[si]) return si;
    }
    return null;
  },

  /**
   * 绑定用 seatIndex：3+0 时把非法 seat4 / 越界点击折到容量内空座。
   */
  _clampSeatIndexForThreeZeroBind(seatIndex) {
    const prevComp = this._getOrdinaryFourballBestComposition();
    if (!prevComp || resolveCompositionType(prevComp) !== '3+0') {
      const n = Number(seatIndex);
      return n > 0 ? n : null;
    }
    const si = Number(seatIndex);
    if (this._isOrdinaryFourball30CapacitySeat(si)) {
      // 该座在 draft 已占用 → 改填其它空座
      const taken = (this._draftSlots || []).some(
        (s) =>
          s &&
          s.status === 'occupied' &&
          Number(s.seatIndex) === si
      );
      if (!taken) return si;
    }
    return this._nextEmptySeatIndexInThreeZeroCapacity();
  },

  /** 2+0 合法座位：seat1–seat2；seat3/4 在保持 2+0 时禁止写入 */
  _isOrdinaryFourball20CapacitySeat(seatIndex) {
    const si = Number(seatIndex);
    return si === 1 || si === 2;
  },

  /**
   * 2+0 缺员恢复：在 seat1–2 中找最小空 seatIndex（看 draft 占用）。
   * 不重排、不碰 seat3/4。
   */
  _nextEmptySeatIndexInTwoZeroCapacity() {
    const used = {};
    (this._draftSlots || []).forEach((s) => {
      if (!s || s.status !== 'occupied') return;
      const si = s.seatIndex != null ? Number(s.seatIndex) : 0;
      if (si === 1 || si === 2) used[si] = true;
    });
    if (!used[1]) return 1;
    if (!used[2]) return 2;
    return null;
  },

  /**
   * 绑定用 seatIndex：2+0 时把 seat3/4 / 越界点击折到 pair 内空座（缺员恢复保持 2+0）。
   */
  _clampSeatIndexForTwoZeroBind(seatIndex) {
    const prevComp = this._getOrdinaryFourballBestComposition();
    if (!prevComp || resolveCompositionType(prevComp) !== '2+0') {
      const n = Number(seatIndex);
      return n > 0 ? n : null;
    }
    const si = Number(seatIndex);
    if (this._isOrdinaryFourball20CapacitySeat(si)) {
      const taken = (this._draftSlots || []).some(
        (s) =>
          s &&
          s.status === 'occupied' &&
          Number(s.seatIndex) === si
      );
      if (!taken) return si;
    }
    return this._nextEmptySeatIndexInTwoZeroCapacity();
  },

  _promptOrdinaryFourball30To4Transition(diff, plan) {
    const itemList = ['4+0', '3+1'];
    wx.showActionSheet({
      alertText: '请选择新的组合方式',
      itemList: itemList,
      success: (res) => {
        const targetType = itemList[res.tapIndex];
        if (!targetType) return;
        const ok = this._applyGameOrDemoCommitDiff(diff);
        if (!ok) {
          wx.showToast({ title: '提交失败', icon: 'none' });
          return;
        }
        this.persistSession();
        const synced = this._applyOrdinaryFourball30To4Transition(diff, targetType);
        if (!synced) {
          wx.showToast({ title: '组合同步失败', icon: 'none' });
          return;
        }
        if (plan) {
          plan.deferredWrites = {
            gameStore: true,
            groupsStore: false,
            persistSession: true,
            rebindScoreContext: true
          };
        }
        console.log('[GROUP_MANAGE_COMMIT_APPLIED]', {
          path: 'gameStore',
          fourball30To4: targetType,
          changeCount: diff && diff.changeCount
        });
        this._finalizeCloseGroupManage();
        this._refreshScorePageFromGame();
        wx.showToast({ title: '已保存', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '已取消，请选择组合后保存', icon: 'none' });
      }
    });
  },

  /**
   * Seat Model：3+0 → 4 人。seat4 绑定新人；按选项写 teamId / compositionType。
   * 保留 team-1 成绩槽；3+1 时仅新 team-2 补空槽。不清 teamScoresByEntity。
   */
  _applyOrdinaryFourball30To4Transition(diff, targetType) {
    const type = String(targetType || '').trim();
    if (type !== '4+0' && type !== '3+1') return false;

    const resolved = this._resolveOrdinaryFourballCompositionRecord();
    if (!resolved) return false;
    const game = resolved.game;
    const group = resolved.group;
    const gi = resolved.gi;
    const mapKey = resolved.mapKey;
    const prevMap = resolved.prevMap;
    const prevComp = resolved.comp;

    const addedPlayers = [];
    const pushMember = (m) => {
      if (!m || !m.playerId) return;
      const pid = String(m.playerId).trim();
      if (!pid) return;
      if (addedPlayers.some((x) => String(x.playerId) === pid)) return;
      addedPlayers.push(m);
    };
    (diff && diff.added ? diff.added : []).forEach((ch) => {
      const idx = ch && ch.slotIndex;
      if (idx != null && idx >= 0) {
        pushMember(slotPlayerToFourballMember((this._demoSlots || [])[idx]));
        const draftSlot = (this._draftSlots || [])[idx];
        if (draftSlot && draftSlot.status === 'occupied') {
          const p = draftSlot.player || {};
          const pid = p.playerId || draftSlot.playerId;
          if (pid) {
            pushMember({
              playerId: String(pid).trim(),
              name: p.name || '球员',
              avatar: p.avatar || '',
              gender: p.gender || '',
              tPosition: p.tPosition || '',
              tee: p.tee || p.tPosition || ''
            });
          }
        }
      }
      const toId = ch && ch.toPlayerId != null ? String(ch.toPlayerId).trim() : '';
      if (!toId) return;
      const hit = (this._demoSlots || [])
        .map(slotPlayerToFourballMember)
        .find((m) => m && String(m.playerId) === toId);
      pushMember(hit);
    });
    if (!addedPlayers.length) return false;
    const added = addedPlayers[0];

    const seats = getCompositionSeats(prevComp);
    const seatAt = (n) => {
      const idx = Number(n);
      for (let i = 0; i < seats.length; i++) {
        if (seats[i] && Number(seats[i].seatIndex) === idx) return seats[i];
      }
      return null;
    };
    const fillSeat = (seat, member, teamId) => {
      if (!seat || !member) return;
      seat.playerId = String(member.playerId).trim();
      seat.name = member.name || '';
      seat.avatar = member.avatar || '';
      seat.gender = member.gender || '';
      seat.tPosition = member.tPosition || '';
      seat.tee = member.tee || member.tPosition || '';
      if (teamId != null) {
        seat.teamId = teamId ? String(teamId).trim() : null;
      }
    };

    // 原 3+0：seat1–3 @ team-1；seat4 空 → 写入新人
    [1, 2, 3].forEach((si) => {
      const s = seatAt(si);
      if (s) s.teamId = 'team-1';
    });
    if (type === '4+0') {
      fillSeat(seatAt(4), added, 'team-1');
    } else {
      // 3+1：seat4 = 新人 @ team-2
      fillSeat(seatAt(4), added, 'team-2');
    }

    let teamsShell = (Array.isArray(prevComp.teams) ? prevComp.teams : [])
      .filter(Boolean)
      .map((t) => Object.assign({}, t));
    if (!teamsShell.length) {
      teamsShell = [
        {
          teamIndex: 1,
          teamId: 'team-1',
          name: '队伍 1',
          type: 'triple',
          members: [],
          players: []
        }
      ];
    }
    const teamMode = type === '4+0' ? 'single_team' : 'split_team';
    if (type === '3+1') {
      const hasT2 = teamsShell.some(
        (t) => t && String(t.teamId || '').trim() === 'team-2'
      );
      if (!hasT2) {
        teamsShell.push({
          teamIndex: 2,
          teamId: 'team-2',
          name: '队伍 2',
          type: 'single',
          members: [],
          players: []
        });
      }
    } else {
      // 4+0：仅保留 team-1
      teamsShell = teamsShell
        .filter((t) => t && String(t.teamId || '').trim() === 'team-1')
        .slice(0, 1);
      if (!teamsShell.length) {
        teamsShell = [
          {
            teamIndex: 1,
            teamId: 'team-1',
            name: '队伍 1',
            type: 'quad',
            members: [],
            players: []
          }
        ];
      }
    }

    const shellComp = Object.assign({}, prevComp, {
      compositionType: type,
      teamMode: teamMode,
      teams: teamsShell
    });

    let nextTeams = deriveTeamsFromSeats(shellComp, seats);
    if (!nextTeams || !nextTeams.length) return false;

    const capacityParts = parseCompositionParts(type);
    nextTeams = nextTeams.map((t, ti) => {
      const n = ((t && t.members) || []).length;
      const cap =
        capacityParts && capacityParts[ti] != null ? capacityParts[ti] : null;
      return Object.assign({}, t, {
        type: cap != null ? teamTypeForCapacity(cap, n) : t.type,
        players: ((t && t.members) || []).slice()
      });
    });

    const slotById = {};
    (this._demoSlots || []).forEach((slot) => {
      const m = slotPlayerToFourballMember(slot);
      if (m && m.playerId) slotById[String(m.playerId)] = m;
    });
    const seatByPid = {};
    seats.forEach((s) => {
      if (!s || s.playerId == null || !String(s.playerId).trim()) return;
      seatByPid[String(s.playerId).trim()] = s;
    });
    nextTeams = nextTeams.map((t) => {
      const members = ((t && t.members) || []).map((m) => {
        if (!m || !m.playerId) return m;
        const pid = String(m.playerId).trim();
        const live = slotById[pid];
        const seat = seatByPid[pid];
        return {
          playerId: pid,
          userId: pid,
          name: (m.name || (live && live.name) || (seat && seat.name) || '球员').trim() || '球员',
          avatar: m.avatar || (live && live.avatar) || (seat && seat.avatar) || '',
          gender: (live && live.gender) || (seat && seat.gender) || '',
          tPosition:
            (live && live.tPosition) || (seat && seat.tPosition) || '',
          tee:
            (live && (live.tee || live.tPosition)) ||
            (seat && (seat.tee || seat.tPosition)) ||
            ''
        };
      });
      return Object.assign({}, t, { members: members, players: members.slice() });
    });

    const nextComp = Object.assign({}, prevComp, {
      groupId: prevComp.groupId || mapKey,
      compositionType: type,
      teamMode: teamMode,
      seats: seats,
      teams: nextTeams,
      playerCount: 4,
      scoringTemplate:
        prevComp.scoringTemplate ||
        (type === '4+0' ? 'fourball_best' : 'team_best')
    });

    game.groupCompositionMap = Object.assign({}, prevMap, { [mapKey]: nextComp });
    game.composition = {
      type: nextComp.compositionType,
      single: teamMode === 'single_team',
      teams: nextTeams,
      seats: seats,
      scoringTemplate: nextComp.scoringTemplate || ''
    };

    // 已有 teamId 成绩原样保留；仅新 teamId（3+1 的 team-2）补空槽
    const savedEntities = Array.isArray(group.teamScoresByEntity)
      ? group.teamScoresByEntity
      : [];
    const engineGroups = this._engineGroups || [];
    const scoreById = {};
    savedEntities.forEach((rec) => {
      const tid = rec && rec.teamId != null ? String(rec.teamId).trim() : '';
      if (!tid) return;
      scoreById[tid] = {
        teamId: tid,
        scores: (rec.scores || []).slice(),
        putts: (rec.putts || []).slice()
      };
    });
    nextTeams.forEach((t) => {
      const tid = String((t && t.teamId) || '').trim();
      if (!tid || scoreById[tid]) return;
      const picked = pickFourballTeamScoreRecord(tid, engineGroups, savedEntities);
      scoreById[tid] = {
        teamId: tid,
        scores: picked.scores,
        putts: picked.putts
      };
    });
    const nextScoreEntities = Object.keys(scoreById).map((id) => scoreById[id]);
    if (Array.isArray(game.groups) && game.groups[gi]) {
      game.groups[gi] = Object.assign({}, game.groups[gi], {
        composition: nextComp,
        teamScoresByEntity: nextScoreEntities
      });
    }

    gameStore.saveGame(game);
    console.log('[fourball-best-30-to-4-transition-seats]', {
      gameId: this.data.gameId,
      mapKey: mapKey,
      targetType: type,
      seats: seats.map((s) => ({
        seatIndex: s.seatIndex,
        teamId: s.teamId,
        playerId: s.playerId
      })),
      teams: nextTeams.map((t) => ({
        teamId: t.teamId,
        memberIds: (t.members || []).map((m) => m.playerId)
      }))
    });
    return true;
  },

  /**
   * 2+0 → 加第 3 人：进入 3+0 / 2+1 选择。
   * 仅 draft 有效人数 === 3（超出 2+0 容量）才触发。
   * 缺员恢复（0→1 / 1→2，draft≤2）不进 transition，走 Seat sync。
   */
  _needsOrdinaryFourball20To3Transition(diff) {
    if (!this._isOrdinaryFourballBestCompositionContext()) return false;
    if (!(diff && Array.isArray(diff.added) && diff.added.length)) return false;
    // 仅超出 pair 容量（满 3）才升级；缺员恢复 draft≤2 保持 2+0
    if (this._countOccupiedDraftSlots() !== 3) return false;
    const prevComp = this._getOrdinaryFourballBestComposition();
    if (!prevComp) return false;
    return resolveCompositionType(prevComp) === '2+0';
  },

  _promptOrdinaryFourball20To3Transition(diff, plan) {
    const itemList = ['3+0', '2+1'];
    wx.showActionSheet({
      alertText: '请选择组合方式',
      itemList: itemList,
      success: (res) => {
        const targetType = itemList[res.tapIndex];
        if (!targetType) return;
        const ok = this._applyGameOrDemoCommitDiff(diff);
        if (!ok) {
          wx.showToast({ title: '提交失败', icon: 'none' });
          return;
        }
        this.persistSession();
        const synced = this._applyOrdinaryFourball20To3Transition(diff, targetType);
        if (!synced) {
          wx.showToast({ title: '组合同步失败', icon: 'none' });
          return;
        }
        if (plan) {
          plan.deferredWrites = {
            gameStore: true,
            groupsStore: false,
            persistSession: true,
            rebindScoreContext: true
          };
        }
        console.log('[GROUP_MANAGE_COMMIT_APPLIED]', {
          path: 'gameStore',
          fourball20To3: targetType,
          changeCount: diff && diff.changeCount
        });
        this._finalizeCloseGroupManage();
        this._refreshScorePageFromGame();
        wx.showToast({ title: '已保存', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '已取消，请选择组合后保存', icon: 'none' });
      }
    });
  },

  /**
   * Seat Model：2+0 → 3 人。
   * 以 draft 最终有效 3 人为准 normalize 到 seat1–3（忽略点击位 / 不依赖 added[0]）。
   * 3+0：seat1–3 @ team-1；2+1：seat1–2 @ team-1、seat3 @ team-2。
   * 保留 team-1 成绩槽；2+1 时仅新 team-2 补空槽。不清 teamScoresByEntity。
   */
  _applyOrdinaryFourball20To3Transition(diff, targetType) {
    const type = String(targetType || '').trim();
    if (type !== '3+0' && type !== '2+1') return false;

    const resolved = this._resolveOrdinaryFourballCompositionRecord();
    if (!resolved) return false;
    const game = resolved.game;
    const group = resolved.group;
    const gi = resolved.gi;
    const mapKey = resolved.mapKey;
    const prevMap = resolved.prevMap;
    const prevComp = resolved.comp;

    // 真实来源：draft 最终有效 3 人（可含「删 1 再加 2」）；忽略 diff.added 点击位
    const draftPlayers = [];
    (this._draftSlots || []).forEach((s, i) => {
      if (!s || s.status !== 'occupied') return;
      const pid = this._slotOccupiedPlayerId(s);
      if (!pid) return;
      const p = s.player || {};
      const fromDemo = slotPlayerToFourballMember((this._demoSlots || [])[i]);
      const si = s.seatIndex != null ? Number(s.seatIndex) : 0;
      draftPlayers.push({
        member: {
          playerId: String(pid).trim(),
          name: (p.name || (fromDemo && fromDemo.name) || '球员').trim() || '球员',
          avatar: p.avatar || (fromDemo && fromDemo.avatar) || '',
          gender: p.gender || (fromDemo && fromDemo.gender) || '',
          tPosition: p.tPosition || (fromDemo && fromDemo.tPosition) || '',
          tee:
            p.tee ||
            p.tPosition ||
            (fromDemo && (fromDemo.tee || fromDemo.tPosition)) ||
            ''
        },
        seatIndex: si > 0 ? si : 999,
        draftSlotIndex: i
      });
    });
    draftPlayers.sort((a, b) => {
      if (a.seatIndex !== b.seatIndex) return a.seatIndex - b.seatIndex;
      return a.draftSlotIndex - b.draftSlotIndex;
    });
    if (draftPlayers.length !== 3) return false;
    const player1 = draftPlayers[0].member;
    const player2 = draftPlayers[1].member;
    const player3 = draftPlayers[2].member;

    const seats = getCompositionSeats(prevComp);
    const seatAt = (n) => {
      const idx = Number(n);
      for (let i = 0; i < seats.length; i++) {
        if (seats[i] && Number(seats[i].seatIndex) === idx) return seats[i];
      }
      return null;
    };
    const clearSeatPlayer = (seat) => {
      if (!seat) return;
      seat.playerId = null;
      seat.name = '';
      seat.avatar = '';
      seat.gender = '';
      seat.tPosition = '';
      seat.tee = '';
      seat.teamId = null;
    };
    const fillSeat = (seat, member, teamId) => {
      if (!seat || !member) return;
      seat.playerId = String(member.playerId).trim();
      seat.name = member.name || '';
      seat.avatar = member.avatar || '';
      seat.gender = member.gender || '';
      seat.tPosition = member.tPosition || '';
      seat.tee = member.tee || member.tPosition || '';
      if (teamId != null) {
        seat.teamId = teamId ? String(teamId).trim() : null;
      }
    };

    // 先清空再 normalize：player1→seat1，player2→seat2，player3→seat3；seat4 空
    [1, 2, 3, 4].forEach((si) => clearSeatPlayer(seatAt(si)));
    if (type === '3+0') {
      fillSeat(seatAt(1), player1, 'team-1');
      fillSeat(seatAt(2), player2, 'team-1');
      fillSeat(seatAt(3), player3, 'team-1');
    } else {
      // 2+1
      fillSeat(seatAt(1), player1, 'team-1');
      fillSeat(seatAt(2), player2, 'team-1');
      fillSeat(seatAt(3), player3, 'team-2');
    }

    let teamsShell = (Array.isArray(prevComp.teams) ? prevComp.teams : [])
      .filter(Boolean)
      .map((t) => Object.assign({}, t));
    if (!teamsShell.length) {
      teamsShell = [
        {
          teamIndex: 1,
          teamId: 'team-1',
          name: '队伍 1',
          type: 'pair',
          members: [],
          players: []
        }
      ];
    }
    const teamMode = type === '3+0' ? 'single_team' : 'split_team';
    if (type === '2+1') {
      const hasT2 = teamsShell.some(
        (t) => t && String(t.teamId || '').trim() === 'team-2'
      );
      if (!hasT2) {
        teamsShell.push({
          teamIndex: 2,
          teamId: 'team-2',
          name: '队伍 2',
          type: 'single',
          members: [],
          players: []
        });
      }
    } else {
      // 3+0：仅保留 team-1
      teamsShell = teamsShell
        .filter((t) => t && String(t.teamId || '').trim() === 'team-1')
        .slice(0, 1);
      if (!teamsShell.length) {
        teamsShell = [
          {
            teamIndex: 1,
            teamId: 'team-1',
            name: '队伍 1',
            type: 'triple',
            members: [],
            players: []
          }
        ];
      }
    }

    const shellComp = Object.assign({}, prevComp, {
      compositionType: type,
      teamMode: teamMode,
      teams: teamsShell
    });

    let nextTeams = deriveTeamsFromSeats(shellComp, seats);
    if (!nextTeams || !nextTeams.length) return false;

    const capacityParts = parseCompositionParts(type);
    nextTeams = nextTeams.map((t, ti) => {
      const n = ((t && t.members) || []).length;
      const cap =
        capacityParts && capacityParts[ti] != null ? capacityParts[ti] : null;
      return Object.assign({}, t, {
        type: cap != null ? teamTypeForCapacity(cap, n) : t.type,
        players: ((t && t.members) || []).slice()
      });
    });

    const slotById = {};
    (this._demoSlots || []).forEach((slot) => {
      const m = slotPlayerToFourballMember(slot);
      if (m && m.playerId) slotById[String(m.playerId)] = m;
    });
    const seatByPid = {};
    seats.forEach((s) => {
      if (!s || s.playerId == null || !String(s.playerId).trim()) return;
      seatByPid[String(s.playerId).trim()] = s;
    });
    nextTeams = nextTeams.map((t) => {
      const members = ((t && t.members) || []).map((m) => {
        if (!m || !m.playerId) return m;
        const pid = String(m.playerId).trim();
        const live = slotById[pid];
        const seat = seatByPid[pid];
        return {
          playerId: pid,
          userId: pid,
          name: (m.name || (live && live.name) || (seat && seat.name) || '球员').trim() || '球员',
          avatar: m.avatar || (live && live.avatar) || (seat && seat.avatar) || '',
          gender: (live && live.gender) || (seat && seat.gender) || '',
          tPosition:
            (live && live.tPosition) || (seat && seat.tPosition) || '',
          tee:
            (live && (live.tee || live.tPosition)) ||
            (seat && (seat.tee || seat.tPosition)) ||
            ''
        };
      });
      return Object.assign({}, t, { members: members, players: members.slice() });
    });

    const nextComp = Object.assign({}, prevComp, {
      groupId: prevComp.groupId || mapKey,
      compositionType: type,
      teamMode: teamMode,
      seats: seats,
      teams: nextTeams,
      playerCount: 3,
      scoringTemplate:
        prevComp.scoringTemplate ||
        (type === '3+0' ? 'fourball_best' : 'team_best')
    });

    game.groupCompositionMap = Object.assign({}, prevMap, { [mapKey]: nextComp });
    game.composition = {
      type: nextComp.compositionType,
      single: teamMode === 'single_team',
      teams: nextTeams,
      seats: seats,
      scoringTemplate: nextComp.scoringTemplate || ''
    };

    // 已有 teamId 成绩原样保留；仅新 teamId（2+1 的 team-2）补空槽
    const savedEntities = Array.isArray(group.teamScoresByEntity)
      ? group.teamScoresByEntity
      : [];
    const engineGroups = this._engineGroups || [];
    const scoreById = {};
    savedEntities.forEach((rec) => {
      const tid = rec && rec.teamId != null ? String(rec.teamId).trim() : '';
      if (!tid) return;
      scoreById[tid] = {
        teamId: tid,
        scores: (rec.scores || []).slice(),
        putts: (rec.putts || []).slice()
      };
    });
    nextTeams.forEach((t) => {
      const tid = String((t && t.teamId) || '').trim();
      if (!tid || scoreById[tid]) return;
      const picked = pickFourballTeamScoreRecord(tid, engineGroups, savedEntities);
      scoreById[tid] = {
        teamId: tid,
        scores: picked.scores,
        putts: picked.putts
      };
    });
    const nextScoreEntities = Object.keys(scoreById).map((id) => scoreById[id]);
    if (Array.isArray(game.groups) && game.groups[gi]) {
      game.groups[gi] = Object.assign({}, game.groups[gi], {
        composition: nextComp,
        teamScoresByEntity: nextScoreEntities
      });
    }

    gameStore.saveGame(game);
    console.log('[fourball-best-20-to-3-transition-seats]', {
      gameId: this.data.gameId,
      mapKey: mapKey,
      targetType: type,
      seats: seats.map((s) => ({
        seatIndex: s.seatIndex,
        teamId: s.teamId,
        playerId: s.playerId
      })),
      teams: nextTeams.map((t) => ({
        teamId: t.teamId,
        memberIds: (t.members || []).map((m) => m.playerId)
      }))
    });
    return true;
  },

  /**
   * 2+0 → 一次加满 4 人：进入 4+0 / 3+1 / 2+2 / 2+1+1 选择。
   * draft 有效人数 === 4 且存在 add 时触发；不走普通 seat sync。
   */
  _needsOrdinaryFourball20To4Transition(diff) {
    if (!this._isOrdinaryFourballBestCompositionContext()) return false;
    if (!(diff && Array.isArray(diff.added) && diff.added.length)) return false;
    if (this._countOccupiedDraftSlots() !== 4) return false;
    const prevComp = this._getOrdinaryFourballBestComposition();
    if (!prevComp) return false;
    return resolveCompositionType(prevComp) === '2+0';
  },

  _promptOrdinaryFourball20To4Transition(diff, plan) {
    const itemList = ['4+0', '3+1', '2+2', '2+1+1'];
    wx.showActionSheet({
      alertText: '请选择组合方式',
      itemList: itemList,
      success: (res) => {
        const targetType = itemList[res.tapIndex];
        if (!targetType) return;
        const ok = this._applyGameOrDemoCommitDiff(diff);
        if (!ok) {
          wx.showToast({ title: '提交失败', icon: 'none' });
          return;
        }
        this.persistSession();
        const synced = this._applyOrdinaryFourball20To4Transition(diff, targetType);
        if (!synced) {
          wx.showToast({ title: '组合同步失败', icon: 'none' });
          return;
        }
        if (plan) {
          plan.deferredWrites = {
            gameStore: true,
            groupsStore: false,
            persistSession: true,
            rebindScoreContext: true
          };
        }
        console.log('[GROUP_MANAGE_COMMIT_APPLIED]', {
          path: 'gameStore',
          fourball20To4: targetType,
          changeCount: diff && diff.changeCount
        });
        this._finalizeCloseGroupManage();
        this._refreshScorePageFromGame();
        wx.showToast({ title: '已保存', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '已取消，请选择组合后保存', icon: 'none' });
      }
    });
  },

  /**
   * Seat Model：2+0 → 4 人。seat1/2 保留；第1新人→seat3，第2新人→seat4。
   * 保留已有 teamId 成绩槽；仅新 team 补空槽。不清 teamScoresByEntity。
   */
  _applyOrdinaryFourball20To4Transition(diff, targetType) {
    const type = String(targetType || '').trim();
    if (
      type !== '4+0' &&
      type !== '3+1' &&
      type !== '2+2' &&
      type !== '2+1+1'
    ) {
      return false;
    }

    const resolved = this._resolveOrdinaryFourballCompositionRecord();
    if (!resolved) return false;
    const game = resolved.game;
    const group = resolved.group;
    const gi = resolved.gi;
    const mapKey = resolved.mapKey;
    const prevMap = resolved.prevMap;
    const prevComp = resolved.comp;

    const addedEntries = [];
    const pushMember = (m, seatIndex) => {
      if (!m || !m.playerId) return;
      const pid = String(m.playerId).trim();
      if (!pid) return;
      if (addedEntries.some((x) => String(x.player.playerId) === pid)) return;
      const si = seatIndex != null && Number(seatIndex) > 0 ? Number(seatIndex) : 0;
      addedEntries.push({ player: m, seatIndex: si });
    };
    (diff && diff.added ? diff.added : []).forEach((ch) => {
      const chSeat =
        ch && ch.seatIndex != null && Number(ch.seatIndex) > 0
          ? Number(ch.seatIndex)
          : 0;
      const idx = ch && ch.slotIndex;
      if (idx != null && idx >= 0) {
        pushMember(slotPlayerToFourballMember((this._demoSlots || [])[idx]), chSeat);
        const draftSlot = (this._draftSlots || [])[idx];
        if (draftSlot && draftSlot.status === 'occupied') {
          const p = draftSlot.player || {};
          const pid = p.playerId || draftSlot.playerId;
          if (pid) {
            const draftSeat =
              draftSlot.seatIndex != null && Number(draftSlot.seatIndex) > 0
                ? Number(draftSlot.seatIndex)
                : chSeat;
            pushMember(
              {
                playerId: String(pid).trim(),
                name: p.name || '球员',
                avatar: p.avatar || '',
                gender: p.gender || '',
                tPosition: p.tPosition || '',
                tee: p.tee || p.tPosition || ''
              },
              draftSeat
            );
          }
        }
      }
      const toId = ch && ch.toPlayerId != null ? String(ch.toPlayerId).trim() : '';
      if (!toId) return;
      const hit = (this._demoSlots || [])
        .map(slotPlayerToFourballMember)
        .find((m) => m && String(m.playerId) === toId);
      pushMember(hit, chSeat);
    });
    // 按 seatIndex 排序：优先 seat3 再 seat4；无 seatIndex 的保持相对顺序靠后
    addedEntries.sort((a, b) => {
      const sa = a.seatIndex || 999;
      const sb = b.seatIndex || 999;
      return sa - sb;
    });
    if (addedEntries.length < 2) return false;
    const added1 = addedEntries[0].player;
    const added2 = addedEntries[1].player;

    const seats = getCompositionSeats(prevComp);
    const seatAt = (n) => {
      const idx = Number(n);
      for (let i = 0; i < seats.length; i++) {
        if (seats[i] && Number(seats[i].seatIndex) === idx) return seats[i];
      }
      return null;
    };
    const fillSeat = (seat, member, teamId) => {
      if (!seat || !member) return;
      seat.playerId = String(member.playerId).trim();
      seat.name = member.name || '';
      seat.avatar = member.avatar || '';
      seat.gender = member.gender || '';
      seat.tPosition = member.tPosition || '';
      seat.tee = member.tee || member.tPosition || '';
      if (teamId != null) {
        seat.teamId = teamId ? String(teamId).trim() : null;
      }
    };

    // seat1/2 保留原玩家；第1新人→seat3，第2新人→seat4
    fillSeat(seatAt(3), added1, null);
    fillSeat(seatAt(4), added2, null);

    if (type === '4+0') {
      [1, 2, 3, 4].forEach((si) => {
        const s = seatAt(si);
        if (s) s.teamId = 'team-1';
      });
    } else if (type === '3+1') {
      [1, 2, 3].forEach((si) => {
        const s = seatAt(si);
        if (s) s.teamId = 'team-1';
      });
      const s4 = seatAt(4);
      if (s4) s4.teamId = 'team-2';
    } else if (type === '2+2') {
      [1, 2].forEach((si) => {
        const s = seatAt(si);
        if (s) s.teamId = 'team-1';
      });
      [3, 4].forEach((si) => {
        const s = seatAt(si);
        if (s) s.teamId = 'team-2';
      });
    } else {
      // 2+1+1
      [1, 2].forEach((si) => {
        const s = seatAt(si);
        if (s) s.teamId = 'team-1';
      });
      const s3 = seatAt(3);
      if (s3) s3.teamId = 'team-2';
      const s4 = seatAt(4);
      if (s4) s4.teamId = 'team-3';
    }

    let teamsShell = (Array.isArray(prevComp.teams) ? prevComp.teams : [])
      .filter(Boolean)
      .map((t) => Object.assign({}, t));
    if (!teamsShell.length) {
      teamsShell = [
        {
          teamIndex: 1,
          teamId: 'team-1',
          name: '队伍 1',
          type: 'pair',
          members: [],
          players: []
        }
      ];
    }
    const teamMode = type === '4+0' ? 'single_team' : 'split_team';
    const ensureTeam = (teamId, teamIndex, name, tType) => {
      const tid = String(teamId);
      if (teamsShell.some((t) => t && String(t.teamId || '').trim() === tid)) return;
      teamsShell.push({
        teamIndex: teamIndex,
        teamId: tid,
        name: name,
        type: tType,
        members: [],
        players: []
      });
    };
    if (type === '4+0') {
      teamsShell = teamsShell
        .filter((t) => t && String(t.teamId || '').trim() === 'team-1')
        .slice(0, 1);
      if (!teamsShell.length) {
        teamsShell = [
          {
            teamIndex: 1,
            teamId: 'team-1',
            name: '队伍 1',
            type: 'quad',
            members: [],
            players: []
          }
        ];
      }
    } else if (type === '3+1' || type === '2+2') {
      ensureTeam('team-2', 2, '队伍 2', type === '2+2' ? 'pair' : 'single');
    } else {
      ensureTeam('team-2', 2, '队伍 2', 'single');
      ensureTeam('team-3', 3, '队伍 3', 'single');
    }

    const shellComp = Object.assign({}, prevComp, {
      compositionType: type,
      teamMode: teamMode,
      teams: teamsShell
    });

    let nextTeams = deriveTeamsFromSeats(shellComp, seats);
    if (!nextTeams || !nextTeams.length) return false;

    const capacityParts = parseCompositionParts(type);
    nextTeams = nextTeams.map((t, ti) => {
      const n = ((t && t.members) || []).length;
      const cap =
        capacityParts && capacityParts[ti] != null ? capacityParts[ti] : null;
      return Object.assign({}, t, {
        type: cap != null ? teamTypeForCapacity(cap, n) : t.type,
        players: ((t && t.members) || []).slice()
      });
    });

    const slotById = {};
    (this._demoSlots || []).forEach((slot) => {
      const m = slotPlayerToFourballMember(slot);
      if (m && m.playerId) slotById[String(m.playerId)] = m;
    });
    const seatByPid = {};
    seats.forEach((s) => {
      if (!s || s.playerId == null || !String(s.playerId).trim()) return;
      seatByPid[String(s.playerId).trim()] = s;
    });
    nextTeams = nextTeams.map((t) => {
      const members = ((t && t.members) || []).map((m) => {
        if (!m || !m.playerId) return m;
        const pid = String(m.playerId).trim();
        const live = slotById[pid];
        const seat = seatByPid[pid];
        return {
          playerId: pid,
          userId: pid,
          name: (m.name || (live && live.name) || (seat && seat.name) || '球员').trim() || '球员',
          avatar: m.avatar || (live && live.avatar) || (seat && seat.avatar) || '',
          gender: (live && live.gender) || (seat && seat.gender) || '',
          tPosition:
            (live && live.tPosition) || (seat && seat.tPosition) || '',
          tee:
            (live && (live.tee || live.tPosition)) ||
            (seat && (seat.tee || seat.tPosition)) ||
            ''
        };
      });
      return Object.assign({}, t, { members: members, players: members.slice() });
    });

    const nextComp = Object.assign({}, prevComp, {
      groupId: prevComp.groupId || mapKey,
      compositionType: type,
      teamMode: teamMode,
      seats: seats,
      teams: nextTeams,
      playerCount: 4,
      scoringTemplate:
        prevComp.scoringTemplate ||
        (type === '4+0' ? 'fourball_best' : 'team_best')
    });

    game.groupCompositionMap = Object.assign({}, prevMap, { [mapKey]: nextComp });
    game.composition = {
      type: nextComp.compositionType,
      single: teamMode === 'single_team',
      teams: nextTeams,
      seats: seats,
      scoringTemplate: nextComp.scoringTemplate || ''
    };

    // 已有 teamId 成绩原样保留；仅新 teamId 补空槽
    const savedEntities = Array.isArray(group.teamScoresByEntity)
      ? group.teamScoresByEntity
      : [];
    const engineGroups = this._engineGroups || [];
    const scoreById = {};
    savedEntities.forEach((rec) => {
      const tid = rec && rec.teamId != null ? String(rec.teamId).trim() : '';
      if (!tid) return;
      scoreById[tid] = {
        teamId: tid,
        scores: (rec.scores || []).slice(),
        putts: (rec.putts || []).slice()
      };
    });
    nextTeams.forEach((t) => {
      const tid = String((t && t.teamId) || '').trim();
      if (!tid || scoreById[tid]) return;
      const picked = pickFourballTeamScoreRecord(tid, engineGroups, savedEntities);
      scoreById[tid] = {
        teamId: tid,
        scores: picked.scores,
        putts: picked.putts
      };
    });
    const nextScoreEntities = Object.keys(scoreById).map((id) => scoreById[id]);
    if (Array.isArray(game.groups) && game.groups[gi]) {
      game.groups[gi] = Object.assign({}, game.groups[gi], {
        composition: nextComp,
        teamScoresByEntity: nextScoreEntities
      });
    }

    gameStore.saveGame(game);
    console.log('[fourball-best-20-to-4-transition-seats]', {
      gameId: this.data.gameId,
      mapKey: mapKey,
      targetType: type,
      seats: seats.map((s) => ({
        seatIndex: s.seatIndex,
        teamId: s.teamId,
        playerId: s.playerId
      })),
      teams: nextTeams.map((t) => ({
        teamId: t.teamId,
        memberIds: (t.members || []).map((m) => m.playerId)
      }))
    });
    return true;
  },

  /**
   * Seat Model：2+1 → 4 人。只改 seats（teamId/playerId），再 deriveTeamsFromSeats。
   * 保留已有 teamId 成绩槽；仅新 team-3 补空槽。不清成绩。
   */
  _applyOrdinaryFourball21To4Transition(diff, targetType) {
    const type = String(targetType || '').trim();
    if (type !== '2+2' && type !== '3+1' && type !== '2+1+1') return false;

    const resolved = this._resolveOrdinaryFourballCompositionRecord();
    if (!resolved) return false;
    const game = resolved.game;
    const group = resolved.group;
    const gi = resolved.gi;
    const mapKey = resolved.mapKey;
    const prevMap = resolved.prevMap;
    const prevComp = resolved.comp;

    const addedPlayers = [];
    const pushMember = (m) => {
      if (!m || !m.playerId) return;
      const pid = String(m.playerId).trim();
      if (!pid) return;
      if (addedPlayers.some((x) => String(x.playerId) === pid)) return;
      addedPlayers.push(m);
    };
    (diff && diff.added ? diff.added : []).forEach((ch) => {
      const idx = ch && ch.slotIndex;
      if (idx != null && idx >= 0) {
        pushMember(slotPlayerToFourballMember((this._demoSlots || [])[idx]));
        const draftSlot = (this._draftSlots || [])[idx];
        if (draftSlot && draftSlot.status === 'occupied') {
          const p = draftSlot.player || {};
          const pid = p.playerId || draftSlot.playerId;
          if (pid) {
            pushMember({
              playerId: String(pid).trim(),
              name: p.name || '球员',
              avatar: p.avatar || '',
              gender: p.gender || '',
              tPosition: p.tPosition || '',
              tee: p.tee || p.tPosition || ''
            });
          }
        }
      }
      const toId = ch && ch.toPlayerId != null ? String(ch.toPlayerId).trim() : '';
      if (!toId) return;
      const hit = (this._demoSlots || [])
        .map(slotPlayerToFourballMember)
        .find((m) => m && String(m.playerId) === toId);
      pushMember(hit);
    });
    if (!addedPlayers.length) return false;
    const added = addedPlayers[0];

    const seats = getCompositionSeats(prevComp);
    const seatAt = (n) => {
      const idx = Number(n);
      for (let i = 0; i < seats.length; i++) {
        if (seats[i] && Number(seats[i].seatIndex) === idx) return seats[i];
      }
      return null;
    };
    const fillSeat = (seat, member, teamId) => {
      if (!seat || !member) return;
      seat.playerId = String(member.playerId).trim();
      seat.name = member.name || '';
      seat.avatar = member.avatar || '';
      seat.gender = member.gender || '';
      seat.tPosition = member.tPosition || '';
      seat.tee = member.tee || member.tPosition || '';
      if (teamId != null) {
        seat.teamId = teamId ? String(teamId).trim() : null;
      }
    };

    // 固定座位映射（相对 2+1：s1/s2=team-1，s3=team-2，s4 空）
    if (type === '2+2') {
      // seat4 = D @ team-2；C 仍在 seat3/team-2
      fillSeat(seatAt(4), added, 'team-2');
    } else if (type === '3+1') {
      // seat3 → team-1（C 并入三人组）；seat4 = D @ team-2
      const s3 = seatAt(3);
      if (s3) s3.teamId = 'team-1';
      fillSeat(seatAt(4), added, 'team-2');
    } else {
      // 2+1+1：seat4 = D @ team-3
      fillSeat(seatAt(4), added, 'team-3');
    }

    // derive 需要目标拓扑的 teams 壳（2+1+1 补 team-3；保留原 teamId）
    let teamsShell = (Array.isArray(prevComp.teams) ? prevComp.teams : [])
      .filter(Boolean)
      .map((t) => Object.assign({}, t));
    if (type === '2+1+1') {
      const hasT3 = teamsShell.some(
        (t) => t && String(t.teamId || '').trim() === 'team-3'
      );
      if (!hasT3) {
        teamsShell.push({
          teamIndex: 3,
          teamId: 'team-3',
          name: '队伍 3',
          type: 'single',
          members: [],
          players: []
        });
      }
    }
    const shellComp = Object.assign({}, prevComp, {
      compositionType: type,
      teamMode: 'split_team',
      teams: teamsShell
    });

    let nextTeams = deriveTeamsFromSeats(shellComp, seats);
    if (!nextTeams || !nextTeams.length) return false;

    // 按目标容量校正 type（保留 teamId；不改成绩）
    const capacityParts = parseCompositionParts(type);
    nextTeams = nextTeams.map((t, ti) => {
      const n = ((t && t.members) || []).length;
      const cap =
        capacityParts && capacityParts[ti] != null ? capacityParts[ti] : null;
      return Object.assign({}, t, {
        type: cap != null ? teamTypeForCapacity(cap, n) : t.type,
        players: ((t && t.members) || []).slice()
      });
    });

    // members 补 tee（seats / slots）
    const slotById = {};
    (this._demoSlots || []).forEach((slot) => {
      const m = slotPlayerToFourballMember(slot);
      if (m && m.playerId) slotById[String(m.playerId)] = m;
    });
    const seatByPid = {};
    seats.forEach((s) => {
      if (!s || s.playerId == null || !String(s.playerId).trim()) return;
      seatByPid[String(s.playerId).trim()] = s;
    });
    nextTeams = nextTeams.map((t) => {
      const members = ((t && t.members) || []).map((m) => {
        if (!m || !m.playerId) return m;
        const pid = String(m.playerId).trim();
        const live = slotById[pid];
        const seat = seatByPid[pid];
        return {
          playerId: pid,
          userId: pid,
          name: (m.name || (live && live.name) || (seat && seat.name) || '球员').trim() || '球员',
          avatar: m.avatar || (live && live.avatar) || (seat && seat.avatar) || '',
          gender: (live && live.gender) || (seat && seat.gender) || '',
          tPosition:
            (live && live.tPosition) || (seat && seat.tPosition) || '',
          tee:
            (live && (live.tee || live.tPosition)) ||
            (seat && (seat.tee || seat.tPosition)) ||
            ''
        };
      });
      return Object.assign({}, t, { members: members, players: members.slice() });
    });

    const nextComp = Object.assign({}, prevComp, {
      groupId: prevComp.groupId || mapKey,
      compositionType: type,
      teamMode: 'split_team',
      seats: seats,
      teams: nextTeams,
      playerCount: 4,
      scoringTemplate: prevComp.scoringTemplate || 'team_best'
    });

    game.groupCompositionMap = Object.assign({}, prevMap, { [mapKey]: nextComp });
    game.composition = {
      type: nextComp.compositionType,
      single: false,
      teams: nextTeams,
      seats: seats,
      scoringTemplate: nextComp.scoringTemplate || 'team_best'
    };

    // 已有 teamId 成绩原样保留；仅新 teamId（team-3）补空槽
    const savedEntities = Array.isArray(group.teamScoresByEntity)
      ? group.teamScoresByEntity
      : [];
    const engineGroups = this._engineGroups || [];
    const scoreById = {};
    savedEntities.forEach((rec) => {
      const tid = rec && rec.teamId != null ? String(rec.teamId).trim() : '';
      if (!tid) return;
      scoreById[tid] = {
        teamId: tid,
        scores: (rec.scores || []).slice(),
        putts: (rec.putts || []).slice()
      };
    });
    nextTeams.forEach((t) => {
      const tid = String((t && t.teamId) || '').trim();
      if (!tid || scoreById[tid]) return;
      const picked = pickFourballTeamScoreRecord(tid, engineGroups, savedEntities);
      scoreById[tid] = {
        teamId: tid,
        scores: picked.scores,
        putts: picked.putts
      };
    });
    const nextScoreEntities = Object.keys(scoreById).map((id) => scoreById[id]);
    if (Array.isArray(game.groups) && game.groups[gi]) {
      game.groups[gi] = Object.assign({}, game.groups[gi], {
        composition: nextComp,
        teamScoresByEntity: nextScoreEntities
      });
    }

    gameStore.saveGame(game);
    console.log('[fourball-best-21-to-4-transition-seats]', {
      gameId: this.data.gameId,
      mapKey: mapKey,
      targetType: type,
      seats: seats.map((s) => ({
        seatIndex: s.seatIndex,
        teamId: s.teamId,
        playerId: s.playerId
      })),
      teams: nextTeams.map((t) => ({
        teamId: t.teamId,
        memberIds: (t.members || []).map((m) => m.playerId)
      }))
    });
    return true;
  },

  _validateOrdinaryFourball2BallDraft(slots) {
    const n = countFilledFourballSlots(slots);
    if (n === 2 || n === 4) return '';
    return '四人两球赛需保留 2 人或 4 人';
  },

  /**
   * Seat Model：普通 fourball_best 增删后同步 composition.seats → 派生 teams。
   * 不改 compositionType / teamId / teamScoresByEntity / playerCount(创建值)。
   * 禁止 orphan/capacity/members.filter。
   */
  _syncOrdinaryFourballCompositionFromSeats(diff) {
    if (!this._isOrdinaryFourballBestCompositionContext()) return false;
    const resolved = this._resolveOrdinaryFourballCompositionRecord();
    if (!resolved) return false;
    const game = resolved.game;
    const gi = resolved.gi;
    const mapKey = resolved.mapKey;
    const prevMap = resolved.prevMap;
    const prevComp = resolved.comp;
    if (!prevComp || !Array.isArray(prevComp.teams) || !prevComp.teams.length) return false;

    const compositionType = resolveCompositionType(prevComp);
    const seats = getCompositionSeats(prevComp);
    if (!Array.isArray(seats) || !seats.length) return false;

    const clearSeatPlayer = (seat) => {
      if (!seat) return;
      seat.playerId = null;
      seat.name = '';
      seat.avatar = '';
      seat.gender = '';
      seat.tPosition = '';
      seat.tee = '';
      // seatIndex / teamId 保留
    };

    const fillSeatFromMember = (seat, m) => {
      if (!seat || !m || !m.playerId) return;
      seat.playerId = String(m.playerId).trim();
      seat.name = m.name || '';
      seat.avatar = m.avatar || '';
      seat.gender = m.gender || '';
      seat.tPosition = m.tPosition || '';
      seat.tee = m.tee || m.tPosition || '';
    };

    const findSeatByPlayerId = (playerId) => {
      const pid = playerId != null ? String(playerId).trim() : '';
      if (!pid) return null;
      for (let i = 0; i < seats.length; i++) {
        const s = seats[i];
        if (s && s.playerId != null && String(s.playerId).trim() === pid) return s;
      }
      return null;
    };

    const findSeatByIndex = (seatIndex) => {
      const si = Number(seatIndex);
      if (!si) return null;
      for (let i = 0; i < seats.length; i++) {
        if (seats[i] && Number(seats[i].seatIndex) === si) return seats[i];
      }
      return null;
    };

    const findEmptySeat = () => {
      let best = null;
      for (let i = 0; i < seats.length; i++) {
        const s = seats[i];
        if (!s) continue;
        const pid = s.playerId != null ? String(s.playerId).trim() : '';
        if (pid) continue;
        if (!best || Number(s.seatIndex) < Number(best.seatIndex)) best = s;
      }
      return best;
    };

    const slotById = {};
    (this._demoSlots || []).forEach((slot) => {
      const m = slotPlayerToFourballMember(slot);
      if (m && m.playerId) slotById[String(m.playerId)] = m;
    });

    const memberFromChange = (ch) => {
      if (!ch) return null;
      const idx = ch.slotIndex;
      if (idx != null && idx >= 0) {
        const fromSlot = slotPlayerToFourballMember((this._demoSlots || [])[idx]);
        if (fromSlot && fromSlot.playerId) return fromSlot;
      }
      const toId = ch.toPlayerId != null ? String(ch.toPlayerId).trim() : '';
      if (toId && slotById[toId]) return slotById[toId];
      return null;
    };

    // 1) remove：优先 seatIndex；否则按 playerId。保留 seat 槽 / teamId
    (diff && diff.removed ? diff.removed : []).forEach((ch) => {
      const si = ch && ch.seatIndex != null ? Number(ch.seatIndex) : 0;
      if (si > 0) {
        const byIndex = findSeatByIndex(si);
        if (byIndex) {
          clearSeatPlayer(byIndex);
          return;
        }
      }
      const fromId =
        ch && ch.fromPlayerId != null
          ? String(ch.fromPlayerId).trim()
          : ch && ch.playerId != null
            ? String(ch.playerId).trim()
            : '';
      const seat = findSeatByPlayerId(fromId);
      if (seat) clearSeatPlayer(seat);
    });

    // 2) replace：原 seat 原地换人，不改 seatIndex / teamId
    (diff && diff.replaced ? diff.replaced : []).forEach((ch) => {
      const fromId = ch && ch.fromPlayerId != null ? String(ch.fromPlayerId).trim() : '';
      const toId = ch && ch.toPlayerId != null ? String(ch.toPlayerId).trim() : '';
      if (!fromId || !toId) return;
      let seat = null;
      const si = ch && ch.seatIndex != null ? Number(ch.seatIndex) : 0;
      if (si > 0) seat = findSeatByIndex(si);
      if (!seat) seat = findSeatByPlayerId(fromId);
      if (!seat) return;
      const member = memberFromChange(ch) || slotById[toId];
      if (!member) return;
      fillSeatFromMember(seat, member);
    });

    // 3) add：优先 diff.seatIndex；3+0→seat1–3；2+0→seat1–2（缺员恢复禁止写 seat3/4）
    const isThreeZero = compositionType === '3+0';
    const isTwoZero = compositionType === '2+0';
    const findEmptySeatInThreeZeroCapacity = () => {
      let best = null;
      for (let i = 0; i < seats.length; i++) {
        const s = seats[i];
        if (!s) continue;
        const si = Number(s.seatIndex) || 0;
        if (si < 1 || si > 3) continue;
        const occ = s.playerId != null ? String(s.playerId).trim() : '';
        if (occ) continue;
        if (!best || si < Number(best.seatIndex)) best = s;
      }
      return best;
    };
    const findEmptySeatInTwoZeroCapacity = () => {
      let best = null;
      for (let i = 0; i < seats.length; i++) {
        const s = seats[i];
        if (!s) continue;
        const si = Number(s.seatIndex) || 0;
        if (si !== 1 && si !== 2) continue;
        const occ = s.playerId != null ? String(s.playerId).trim() : '';
        if (occ) continue;
        if (!best || si < Number(best.seatIndex)) best = s;
      }
      return best;
    };
    (diff && diff.added ? diff.added : []).forEach((ch) => {
      const member = memberFromChange(ch);
      if (!member || !member.playerId) return;
      const pid = String(member.playerId).trim();
      if (findSeatByPlayerId(pid)) return;
      const si = ch && ch.seatIndex != null ? Number(ch.seatIndex) : 0;
      let target = null;
      if (isThreeZero) {
        // 缺员恢复：优先点击的合法空座；seat4 / 越界 → 容量内最小空座
        if (si >= 1 && si <= 3) {
          const cand = findSeatByIndex(si);
          if (cand && !(cand.playerId && String(cand.playerId).trim())) {
            target = cand;
          }
        }
        if (!target) target = findEmptySeatInThreeZeroCapacity();
      } else if (isTwoZero) {
        // 2+0 缺员恢复：只填 seat1/2；点击 seat3/4 → 折到 pair 空座
        if (si === 1 || si === 2) {
          const cand = findSeatByIndex(si);
          if (cand && !(cand.playerId && String(cand.playerId).trim())) {
            target = cand;
          }
        }
        if (!target) target = findEmptySeatInTwoZeroCapacity();
      } else if (si > 0) {
        target = findSeatByIndex(si);
      } else {
        target = findEmptySeat();
      }
      if (!target) return;
      // 3+0 / 2+0 恢复时强制 team-1
      if (isThreeZero && Number(target.seatIndex) <= 3) {
        target.teamId = 'team-1';
      }
      if (isTwoZero && (Number(target.seatIndex) === 1 || Number(target.seatIndex) === 2)) {
        target.teamId = 'team-1';
      }
      fillSeatFromMember(target, member);
    });

    // 与当前 roster 对齐：slots 已无的人解绑；刷新仍在座的展示字段
    // 禁止：把未入座 orphan 自动填进其它空座
    seats.forEach((seat) => {
      if (!seat || seat.playerId == null || !String(seat.playerId).trim()) return;
      const pid = String(seat.playerId).trim();
      const live = slotById[pid];
      if (!live) {
        clearSeatPlayer(seat);
        return;
      }
      fillSeatFromMember(seat, live);
    });

    const derivedTeams = deriveTeamsFromSeats(prevComp, seats);
    if (!derivedTeams || !derivedTeams.length) return false;

    // derive 仅带基础字段：用 seat / slot 补 tee 等展示字段
    const seatByPlayerId = {};
    seats.forEach((s) => {
      if (!s || s.playerId == null || !String(s.playerId).trim()) return;
      seatByPlayerId[String(s.playerId).trim()] = s;
    });
    const nextTeams = derivedTeams.map((t) => {
      const members = ((t && t.members) || []).map((m) => {
        if (!m || !m.playerId) return m;
        const pid = String(m.playerId).trim();
        const seat = seatByPlayerId[pid];
        const live = slotById[pid];
        return {
          playerId: pid,
          userId: pid,
          name: (m.name || (live && live.name) || (seat && seat.name) || '球员').trim() || '球员',
          avatar: m.avatar || (live && live.avatar) || (seat && seat.avatar) || '',
          gender: (live && live.gender) || (seat && seat.gender) || m.gender || '',
          tPosition:
            (live && live.tPosition) || (seat && seat.tPosition) || m.tPosition || '',
          tee:
            (live && (live.tee || live.tPosition)) ||
            (seat && (seat.tee || seat.tPosition)) ||
            m.tee ||
            ''
        };
      });
      return Object.assign({}, t, {
        members: members,
        players: members.slice()
      });
    });

    const createPlayerCount =
      prevComp.playerCount != null && prevComp.playerCount !== ''
        ? Number(prevComp.playerCount)
        : null;
    const nextComp = Object.assign({}, prevComp, {
      compositionType: compositionType || prevComp.compositionType,
      seats: seats,
      teams: nextTeams,
      // 保持创建时人数，不因缺员缩小
      playerCount:
        createPlayerCount != null && !Number.isNaN(createPlayerCount)
          ? createPlayerCount
          : prevComp.playerCount
    });

    game.groupCompositionMap = Object.assign({}, prevMap, { [mapKey]: nextComp });
    game.composition = {
      type: nextComp.compositionType || (game.composition && game.composition.type) || '',
      single: nextComp.teamMode === 'single_team',
      teams: nextTeams,
      seats: seats,
      scoringTemplate:
        nextComp.scoringTemplate ||
        (game.composition && game.composition.scoringTemplate) ||
        'team_best'
    };
    if (Array.isArray(game.groups) && game.groups[gi]) {
      game.groups[gi] = Object.assign({}, game.groups[gi], { composition: nextComp });
    }
    // 不触碰 teamScoresByEntity
    gameStore.saveGame(game);

    const teamById = {};
    nextTeams.forEach((t) => {
      if (t && t.teamId) teamById[String(t.teamId)] = t;
    });
    this._engineGroups = (this._engineGroups || []).map((g) => {
      if (!g) return g;
      const tid = String(g.id || g.teamId || '').trim();
      const team = teamById[tid];
      if (!team) return g;
      const members = (team.members || []).slice();
      return Object.assign({}, g, {
        id: g.id || g.teamId || tid,
        teamId: g.teamId || g.id || tid,
        members: members,
        avatar: (members[0] && members[0].avatar) || g.avatar || ''
      });
    });

    const gameId = this.data.gameId;
    const ms = this._matchState || matchState.getMatchState();
    if (ms && ms.gameId === gameId) {
      const nextGroups = (this._engineGroups || []).map((g) => ({
        teamId: g.id || g.teamId,
        name: g.name,
        type: g.type,
        members: (g.members || []).slice(),
        scores: (g.scores || []).slice(),
        putts: (g.putts || []).slice()
      }));
      const next = Object.assign({}, ms, { groups: nextGroups });
      matchState.setMatchState(next);
      this._matchState = next;
    }

    console.log('[fourball-best-composition-seat-sync]', {
      gameId: gameId,
      mapKey: mapKey,
      compositionType: nextComp.compositionType,
      seats: seats.map((s) => ({
        seatIndex: s.seatIndex,
        teamId: s.teamId,
        playerId: s.playerId
      })),
      teams: nextTeams.map((t) => ({
        teamId: t.teamId,
        memberIds: (t.members || []).map((m) => m.playerId)
      }))
    });
    return true;
  },

  /**
   * 最好成绩/最佳球位：换人后只补丁 composition.teams.members（及展示字段）。
   * 保留 teamId / compositionType / teamScoresByEntity / _engineGroups 成绩数组。
   * @deprecated Seat Model 第一阶段改由 _syncOrdinaryFourballCompositionFromSeats；暂保留勿删。
   */
  _patchOrdinaryFourballCompositionMembersFromSlots(diff) {
    if (!this._isOrdinaryFourballBestCompositionContext()) return false;
    const gameId = this.data.gameId;
    const gi = this._gameGroupIndex || 0;
    const game = gameStore.getGame(gameId);
    if (!game) return false;

    const storeGroups = gameStore.listGroups(game);
    const group = storeGroups[gi] || {};
    const groupId = group.groupId || gameId + '-g' + (gi + 1);
    const prevMap =
      game.groupCompositionMap && typeof game.groupCompositionMap === 'object'
        ? game.groupCompositionMap
        : {};
    const prevComp = prevMap[groupId] || group.composition || null;
    if (!prevComp || !Array.isArray(prevComp.teams) || !prevComp.teams.length) return false;

    const slotById = {};
    (this._demoSlots || []).forEach((slot) => {
      const m = slotPlayerToFourballMember(slot);
      if (m && m.playerId) slotById[String(m.playerId)] = m;
    });

    const replaceMap = {};
    (diff && diff.replaced ? diff.replaced : []).forEach((ch) => {
      const fromId = ch && ch.fromPlayerId != null ? String(ch.fromPlayerId).trim() : '';
      const toId = ch && ch.toPlayerId != null ? String(ch.toPlayerId).trim() : '';
      if (!fromId || !toId) return;
      const idx = ch.slotIndex;
      const fromSlot =
        idx != null && idx >= 0 ? slotPlayerToFourballMember((this._demoSlots || [])[idx]) : null;
      const member = fromSlot && String(fromSlot.playerId) === toId ? fromSlot : slotById[toId];
      if (member) replaceMap[fromId] = member;
    });

    const patchMember = (m) => {
      if (!m) return null;
      const pid = String(m.playerId || m.userId || m.id || '').trim();
      if (!pid) return null;
      if (replaceMap[pid]) {
        const next = replaceMap[pid];
        return {
          playerId: next.playerId,
          userId: next.playerId,
          name: next.name,
          avatar: next.avatar || '',
          gender: next.gender || '',
          tPosition: next.tPosition || '',
          tee: next.tee || next.tPosition || ''
        };
      }
      const live = slotById[pid];
      if (!live) return null;
      return {
        playerId: live.playerId,
        userId: live.playerId,
        name: live.name,
        avatar: live.avatar || '',
        gender: live.gender || m.gender || '',
        tPosition: live.tPosition || m.tPosition || '',
        tee: live.tee || live.tPosition || m.tee || ''
      };
    };

    // compositionType 权威：缺员不改 type / 队结构
    const compositionType = resolveCompositionType(prevComp);
    const capacityParts = parseCompositionParts(compositionType);

    const nextTeams = prevComp.teams.map((t, ti) => {
      if (!t) return t;
      const raw = Array.isArray(t.members)
        ? t.members
        : Array.isArray(t.players)
          ? t.players
          : [];
      const members = raw.map(patchMember).filter(Boolean);
      const cap =
        capacityParts && capacityParts[ti] != null ? capacityParts[ti] : null;
      return Object.assign({}, t, {
        teamId: t.teamId,
        teamIndex: t.teamIndex,
        name: t.name,
        type:
          cap != null
            ? teamTypeForCapacity(cap, members.length)
            : members.length === 1
              ? 'single'
              : members.length === 2
                ? 'pair'
                : t.type || 'pair',
        members: members,
        players: members.slice()
      });
    });

    // 缺员恢复：按 compositionType 容量补 orphan（2+2→满 2；3+1→三人组满 3），不改 compositionType
    const filledOrphanIds = [];
    if (capacityParts && capacityParts.length === nextTeams.length) {
      const usedIds = {};
      nextTeams.forEach((t) => {
        ((t && t.members) || []).forEach((m) => {
          const pid = m && m.playerId != null ? String(m.playerId).trim() : '';
          if (pid) usedIds[pid] = true;
        });
      });
      const orphanPlayers = [];
      (this._demoSlots || []).forEach((slot) => {
        const m = slotPlayerToFourballMember(slot);
        if (!m || !m.playerId) return;
        const pid = String(m.playerId).trim();
        if (!pid || usedIds[pid]) return;
        orphanPlayers.push({
          playerId: m.playerId,
          userId: m.playerId,
          name: m.name,
          avatar: m.avatar || '',
          gender: m.gender || '',
          tPosition: m.tPosition || '',
          tee: m.tee || m.tPosition || ''
        });
        usedIds[pid] = true;
      });
      let orphanIdx = 0;
      for (let ti = 0; ti < nextTeams.length && orphanIdx < orphanPlayers.length; ti++) {
        const t = nextTeams[ti];
        if (!t || !Array.isArray(t.members)) continue;
        const cap = capacityParts[ti];
        while (t.members.length < cap && orphanIdx < orphanPlayers.length) {
          const orphan = orphanPlayers[orphanIdx++];
          t.members.push(orphan);
          filledOrphanIds.push(orphan.playerId);
        }
        t.players = t.members.slice();
        t.type = teamTypeForCapacity(cap, t.members.length);
      }
    }

    const nextComp = Object.assign({}, prevComp, {
      compositionType: compositionType || prevComp.compositionType,
      teams: nextTeams,
      playerCount: nextTeams.reduce((n, t) => n + ((t && t.members) || []).length, 0)
    });
    game.groupCompositionMap = Object.assign({}, prevMap, { [groupId]: nextComp });
    game.composition = {
      type: nextComp.compositionType || (game.composition && game.composition.type) || '',
      single: nextComp.teamMode === 'single_team',
      teams: nextTeams,
      scoringTemplate:
        nextComp.scoringTemplate ||
        (game.composition && game.composition.scoringTemplate) ||
        'team_best'
    };
    if (Array.isArray(game.groups) && game.groups[gi]) {
      game.groups[gi] = Object.assign({}, game.groups[gi], { composition: nextComp });
    }
    // 不触碰 teamScoresByEntity / scores 内容
    gameStore.saveGame(game);

    const teamById = {};
    nextTeams.forEach((t) => {
      if (t && t.teamId) teamById[String(t.teamId)] = t;
    });
    this._engineGroups = (this._engineGroups || []).map((g) => {
      if (!g) return g;
      const tid = String(g.id || g.teamId || '').trim();
      const team = teamById[tid];
      if (!team) return g;
      const members = (team.members || []).slice();
      return Object.assign({}, g, {
        id: g.id || g.teamId || tid,
        teamId: g.teamId || g.id || tid,
        members: members,
        avatar: (members[0] && members[0].avatar) || g.avatar || ''
        // scores / putts 原样保留
      });
    });

    const ms = this._matchState || matchState.getMatchState();
    if (ms && ms.gameId === gameId) {
      const nextGroups = (this._engineGroups || []).map((g) => ({
        teamId: g.id || g.teamId,
        name: g.name,
        type: g.type,
        members: (g.members || []).slice(),
        scores: (g.scores || []).slice(),
        putts: (g.putts || []).slice()
      }));
      const next = Object.assign({}, ms, { groups: nextGroups });
      matchState.setMatchState(next);
      this._matchState = next;
    }

    console.log('[fourball-best-composition-member-sync]', {
      gameId: gameId,
      groupId: groupId,
      replaced: Object.keys(replaceMap),
      filledOrphans: filledOrphanIds,
      teams: nextTeams.map((t) => ({
        teamId: t.teamId,
        memberIds: (t.members || []).map((m) => m.playerId)
      }))
    });
    return true;
  },

  /**
   * 人员调整后：只改 composition / engine 的 members，保留 team-1/team-2 与 teamScoresByEntity。
   */
  _syncOrdinaryFourball2BallCompositionFromSlots() {
    if (!this._isOrdinaryFourball2BallContext()) return false;
    const gameId = this.data.gameId;
    const gi = this._gameGroupIndex || 0;
    const game = gameStore.getGame(gameId);
    if (!game) return false;

    const built = buildOrdinaryFourball2BallTeamsFromSlots(this._demoSlots);
    if (!built || !built.teams) return false;

    const storeGroups = gameStore.listGroups(game);
    const group = storeGroups[gi] || {};
    const groupId = group.groupId || gameId + '-g' + (gi + 1);
    const prevMap = (game.groupCompositionMap && typeof game.groupCompositionMap === 'object')
      ? game.groupCompositionMap
      : {};
    const prevComp = prevMap[groupId] || group.composition || null;
    const compositionRec = {
      groupId: groupId,
      groupIndex: gi,
      playerCount: built.filledCount,
      compositionType: built.filledCount === 2 ? '2+0' : '2+2',
      teamMode: built.filledCount === 2 ? 'single_team' : 'split_team',
      teams: built.teams,
      scoringTemplate: (prevComp && prevComp.scoringTemplate) || 'team_best'
    };

    const nextMap = Object.assign({}, prevMap, { [groupId]: compositionRec });
    game.groupCompositionMap = nextMap;
    game.composition = {
      type: compositionRec.compositionType,
      single: compositionRec.teamMode === 'single_team',
      teams: built.teams,
      scoringTemplate: compositionRec.scoringTemplate
    };

    if (Array.isArray(game.groups) && game.groups[gi]) {
      game.groups[gi] = Object.assign({}, game.groups[gi], {
        composition: compositionRec
      });
    }

    // 不触碰 teamScoresByEntity / scores 内容
    gameStore.saveGame(game);

    const savedGroup = gameStore.getGroup(gameId, gi) || {};
    const savedEntities = savedGroup.teamScoresByEntity || [];
    const prevEngine = this._engineGroups || [];

    this._engineGroups = built.teams.map((t) => {
      const picked = pickFourballTeamScoreRecord(t.teamId, prevEngine, savedEntities);
      return {
        id: t.teamId,
        teamId: t.teamId,
        name: t.name || t.teamId,
        type: t.type || 'pair',
        members: (t.members || []).slice(),
        avatar: (t.members && t.members[0] && t.members[0].avatar) || '',
        scores: picked.scores,
        putts: picked.putts
      };
    });

    const ms = this._matchState || matchState.getMatchState();
    if (ms && ms.gameId === gameId) {
      const nextGroups = this._engineGroups.map((g) => ({
        teamId: g.id || g.teamId,
        name: g.name,
        type: g.type,
        members: (g.members || []).slice(),
        scores: (g.scores || []).slice(),
        putts: (g.putts || []).slice()
      }));
      const next = Object.assign({}, ms, {
        groups: nextGroups,
        formatType: 'fourball_2ball'
      });
      matchState.setMatchState(next);
      this._matchState = next;
    }

    console.log('[fourball-2ball-composition-sync]', {
      gameId: gameId,
      groupId: groupId,
      filledCount: built.filledCount,
      teams: built.teams.map((t) => ({
        teamId: t.teamId,
        memberIds: (t.members || []).map((m) => m.playerId)
      }))
    });
    return true;
  },

  // 是否绑定真实记分数据源（个人比杆赛走 groupsStore，以 playerId 为成绩主键）
  _boundToStore() {
    return this.data.mode === 'individual_stroke' && !!this.data.groupId;
  },

  // 「添加/删除页面」数据源：正式球队赛优先取 teamMatchStore Slot，兼容期回退 groupsStore。
  // - 球队赛个人比杆：取 match.groups[groupId] 并通过 resolveGroupSlots 生成固定槽位
  // - 绑定 store(个人比杆赛)：取实盘 group.players（含 null 占位，保留空位位置）
  // - 其他模式(standard/四人最佳)：取当前记分页面 _playersSource（绝不使用 GROUP_PLAYERS 等第二数据源）
  _groupSlotsForCurrent() {
    const team = this._scoreTeamMatchSlotsForCurrent();
    if (team && Array.isArray(team.slots)) return team.slots;
    if (this._boundToStore()) {
      const slots = this._groupsStoreSlotsForCurrent();
      if (slots.length) return slots;
    }
    return this._slotsFromSource();
  },

  // 非绑定模式持久槽位：以 _demoSlots(含 null 占位) 为槽位真相，_playersSource = flatten(_demoSlots)
  // 这样删除只置空、顺序不变，且可按 slotIndex 缓存历史成绩供继承
  _ensureDemoSlots() {
    if (this._demoSlots) return;
    const src = this._playersSource || [];
    const n = Math.max(playerSlots.DEFAULT_SLOT_SIZE, src.length);
    this._demoSlots = [];
    for (let i = 0; i < n; i++) this._demoSlots[i] = src[i] || null;
    this._demoSlotCache = this._demoSlotCache || [];
  },

  // 由持久 _demoSlots 生成固定槽位编辑视图（editPlayersSlots 快照），空位带 hasCache 标记
  _slotsFromSource() {
    this._ensureDemoSlots();
    const useSlotScores = this._isGameSingleScoreContext();
    return this._demoSlots.map((p, i) => {
      const slotId = i + 1;
      if (!p) {
        return {
          slotId,
          player: null,
          playerId: null,
          status: 'empty',
          source: null,
          hasCache: useSlotScores
            ? this._gameSingleSlotHasScores(i)
            : !!(this._demoSlotCache && this._demoSlotCache[i])
        };
      }
      return {
        slotId,
        player: {
          playerId: p.playerId || p.id,
          name: p.name,
          avatar: p.avatar,
          gender: p.gender || '',
          tPosition: p.tPosition || '',
          tee: p.tee || p.tPosition || ''
        },
        playerId: p.playerId || p.id,
        status: 'occupied',
        source: p.source || 'manual',
        hasCache: false
      };
    });
  },

  // 非绑定模式：由持久槽位派生记分列表并双向同步回记分层 + scoreMap + 会话
  _syncDemoFromSlots() {
    this._playersSource = (this._demoSlots || []).filter(Boolean);
    this._afterDemoSlotsChange();
  },

  // 非绑定模式：槽位编辑后双向同步回记分层 _playersSource → scoreMap(refreshPlayers) → 会话
  _afterDemoSlotsChange() {
    const patch = {
      playerCount: this._playersSource.length || 4,
      groupSlots: this._slotsFromSource()
    };
    if (this.data.activePlayerIdx >= this._playersSource.length) patch.activePlayerIdx = 0;
    this.setData(patch);
    // 强制重建记分链路（slot→playerId→scoreMap→UI），保证新增球员立即参与记分并显示
    this.rebindScoreContext();
    this.persistSession();
  },

  // 增删后从 store 重新拉取记分数据源（成绩跟随 playerId，不随槽位/顺序错位）
  _reloadFromStore() {
    const loaded = groupsStore.loadGroupForScoring(this.data.groupId);
    this._playersSource = loaded.map((p, i) => {
      const teeFields = applyScorePlayerTeeFields(
        {
          playerId: p.playerId || p.id,
          tPosition: p.tPosition || '',
          tee: p.tee || '',
          gender: p.gender || '',
          matchGender: p.matchGender || ''
        },
        i
      );
      return {
        id: p.id,
        playerId: p.playerId || p.id,
        name: p.name,
        avatar: p.avatar,
        gender: teeFields.gender,
        tPosition: teeFields.tPosition,
        colorClass: teeFields.colorClass,
        scores: (p.scores || []).slice(),
        putts: (p.putts || []).slice(),
        fairways: sliceFairways(p.fairways),
        penalties: slicePenalties(p.penalties),
        sands: sliceSands(p.sands)
      };
    });
    const patch = {
      playerCount: this._playersSource.length || 4,
      groupSlots: this._groupSlotsForCurrent()
    };
    if (this.data.activePlayerIdx >= this._playersSource.length) patch.activePlayerIdx = 0;
    this.setData(patch);
    // 强制重建记分链路（slot→playerId→scoreMap→UI），保证从 store 增删后立即同步
    this.rebindScoreContext();
  },

  _reloadFromTeamMatchDraft() {
    const match = this._readScoreTeamMatch();
    const group = this._findScoreTeamMatchGroup(match);
    const groupId = String(this.data.groupId || ((this._matchState || {}).groupId) || '');
    const groupScoreData = match && match.scoreData && match.scoreData[groupId] && typeof match.scoreData[groupId] === 'object'
      ? match.scoreData[groupId]
      : {};
    const scoresByPlayer = groupScoreData.scoresByPlayer && typeof groupScoreData.scoresByPlayer === 'object'
      ? groupScoreData.scoresByPlayer
      : {};
    const existingById = {};
    (this._playersSource || []).forEach((player) => {
      const id = player && (player.playerId || player.id);
      if (id) existingById[id] = player;
    });
    this._playersSource = (this._draftSlots || [])
      .filter((slot) => this._slotOccupiedPlayerId(slot))
      .map((slot, index) => {
        const player = slot.player || {};
        const playerId = this._slotOccupiedPlayerId(slot);
        const existing = existingById[playerId] || {};
        const scorePlayerId = slot.scorePlayerId || playerId;
        const record = scoresByPlayer[scorePlayerId] || scoresByPlayer[playerId] || {};
        const position = Number(slot.slotId) || index + 1;
        const entry = this._findScoreTeamMatchPlayerEntry(group, position) || {};
        const profile = match
          ? this._buildScoreTeamMatchPlayerProfile(
              match,
              playerId,
              Object.assign({}, entry, player, existing)
            )
          : {};
        const teeFields = applyScorePlayerTeeFields(
          {
            playerId: playerId,
            tPosition:
              player.tPosition ||
              existing.tPosition ||
              entry.tPosition ||
              '',
            tee: player.tee || existing.tee || entry.tee || '',
            gender:
              player.gender ||
              existing.gender ||
              profile.gender ||
              entry.gender ||
              '',
            matchGender:
              player.matchGender ||
              existing.matchGender ||
              profile.matchGender ||
              entry.matchGender ||
              ''
          },
          index
        );
        return {
          id: playerId,
          playerId: playerId,
          scorePlayerId: scorePlayerId,
          name: player.name || existing.name || '球员',
          avatar: player.avatar || existing.avatar || '',
          gender: teeFields.gender,
          tPosition: teeFields.tPosition,
          colorClass: teeFields.colorClass,
          scores: (record.scores || existing.scores || []).slice(),
          putts: (record.putts || existing.putts || []).slice(),
          fairways: sliceFairways(record.fairways || existing.fairways),
          penalties: slicePenalties(record.penalties || existing.penalties),
          sands: sliceSands(record.sands || existing.sands)
        };
      });
    const patch = {
      playerCount: this._playersSource.length || 4,
      groupSlots: this._groupSlotsForCurrent()
    };
    if (this.data.activePlayerIdx >= this._playersSource.length) patch.activePlayerIdx = 0;
    this.setData(patch);
  },

  /**
   * 添加/删除确认后：从最新 match.scoreEntities + teamScoresByEntity 重建 entitiesView。
   * 仅 stroke_entity；不改成绩数据（hydrate 只读）。
   */
  _reloadStrokeEntitiesAfterGroupManage() {
    if (this.data.mode !== 'stroke_entity') return;
    const ms = this._matchState || this._readMatchState() || {};
    const matchId = (ms && ms.matchId) || '';
    const gid = this.data.groupId || (ms && ms.groupId) || '';
    let match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    match = this._ensureG2G3ScoreEntitiesAligned(match) || match;
    this._entitiesSource = this._hydrateTeamMatchEntityFromSession(match, gid) || [];
    this.refreshEntities();
    console.log('[stroke_entity] reload-after-group-manage', {
      matchId: matchId,
      groupId: gid,
      compositionMode: match ? resolveCompositionMode(match) : '',
      entityCount: (this._entitiesSource || []).length
    });
  },

  // 删除球员：编辑期只改 draft；真实写盘留给后续 commit（_removeSlotAt）
  // Seat Model UI：优先 data-seat-index → 映射 draftSlotIndex
  removeGroupSlot(e) {
    const seatIndex = Number(e.currentTarget.dataset.seatIndex);
    if (!isNaN(seatIndex) && seatIndex > 0 && this._groupManageSeatTemplate) {
      const views = this._buildGroupManageSeatsViewFromDraft() || [];
      const item = views.find((v) => v && Number(v.seatIndex) === seatIndex);
      const draftIdx = item && item.draftSlotIndex != null ? Number(item.draftSlotIndex) : -1;
      if (draftIdx >= 0) {
        this._removeDraftSlotAt(draftIdx);
        return;
      }
    }
    const idx = Number(e.currentTarget.dataset.index);
    if (isNaN(idx)) return;
    this._removeDraftSlotAt(idx);
  },

  // 按下标移出某槽位（commit 用）：置空、顺序不变；game-single 位成绩留在 scoresBySlot
  _removeSlotAt(idx) {
    if (idx == null || idx < 0) return;
    if (this._boundToStore()) {
      // 先 flush 当前成绩到 store，再删除该槽位（store 内部已把 holes 缓存到 slotCache）
      this.persistSession();
      groupsStore.removePlayerSlot(this.data.groupId, idx);
      this._reloadFromStore();
    } else if (this._isGameSingleScoreContext()) {
      this._ensureDemoSlots();
      this._flushGameSingleOccupiedScoresToStore();
      this._demoSlots[idx] = null;
      this._syncDemoFromSlots();
    } else {
      // demo：成绩进 _demoSlotCache[idx]，槽位置空
      this._ensureDemoSlots();
      const cur = this._demoSlots[idx];
      if (cur) {
        this._demoSlotCache[idx] = {
          playerId: cur.playerId || cur.id,
          name: cur.name,
          avatar: cur.avatar,
          scores: (cur.scores || []).slice(),
          putts: (cur.putts || []).slice(),
          fairways: sliceFairways(cur.fairways),
          penalties: slicePenalties(cur.penalties),
          sands: sliceSands(cur.sands)
        };
      }
      this._demoSlots[idx] = null;
      this._syncDemoFromSlots();
    }
  },

  // 目标槽位是否存在历史成绩（game-single：scoresBySlot；demo：_demoSlotCache）
  _slotHasCache(idx) {
    if (this._boundToStore()) return !!groupsStore.getSlotCache(this.data.groupId, idx);
    if (this._isGameSingleScoreContext()) return this._gameSingleSlotHasScores(idx);
    this._ensureDemoSlots();
    return !!(this._demoSlotCache && this._demoSlotCache[idx]);
  },

  // 统一补位入口：不改 slot 顺序。
  _bindPlayerToSlot(idx, player, source) {
    const p = Object.assign({}, player, { source: source || 'manual' });
    this._doBindPlayerToSlot(idx, p, source);
  },

  // 执行补位绑定：game-single 从 scoresBySlot 恢复；demo 用 _demoSlotCache
  _doBindPlayerToSlot(idx, p, source) {
    if (this._boundToStore()) {
      this.persistSession();
      groupsStore.bindPlayerToSlot(this.data.groupId, idx, p, this._slotHasCache(idx));
      this._reloadFromStore();
    } else if (this._isGameSingleScoreContext()) {
      this._ensureDemoSlots();
      const saved = this._readGameSingleSlotScores(idx, p.playerId);
      const teeFields = applyScorePlayerTeeFields(
        {
          playerId: p.playerId,
          tPosition: p.tPosition || '',
          gender: p.gender || '',
          matchGender: p.matchGender || ''
        },
        idx
      );
      this._demoSlots[idx] = {
        id: p.playerId,
        playerId: p.playerId,
        slotIndex: idx,
        name: p.name,
        avatar: p.avatar,
        source: source || 'manual',
        gender: teeFields.gender,
        tPosition: teeFields.tPosition,
        colorClass: teeFields.colorClass || p.colorClass || 'border-white',
        scores: (saved.scores || []).slice(),
        putts: (saved.putts || []).slice(),
        fairways: sliceFairways(saved.fairways),
        penalties: slicePenalties(saved.penalties),
        sands: sliceSands(saved.sands)
      };
      this._syncDemoFromSlots();
    } else {
      this._ensureDemoSlots();
      const cache = this._demoSlotCache[idx];
      const newP = {
        id: p.playerId,
        playerId: p.playerId,
        name: p.name,
        avatar: p.avatar,
        source: source || 'manual',
        colorClass: p.colorClass || 'border-white',
        scores: cache ? (cache.scores || []).slice() : [],
        putts: cache ? (cache.putts || []).slice() : [],
        fairways: cache ? sliceFairways(cache.fairways) : [],
        penalties: cache ? slicePenalties(cache.penalties) : [],
        sands: cache ? sliceSands(cache.sands) : []
      };
      this._demoSlots[idx] = newP;
      this._demoSlotCache[idx] = null;
      this._syncDemoFromSlots();
    }
  },

  // 当前第一个空位索引（编辑期读 draft；无 draft 时回退 data.groupSlots）
  _firstEmptySlotIndex() {
    if (this.data.showGroupManage && this._draftSlots) {
      return this._firstDraftEmptySlotIndex();
    }
    return (this.data.groupSlots || []).findIndex((s) => s && s.status === 'empty');
  },

  // 点击空位（status=empty）：按当前比赛上下文弹出人员来源菜单
  // Seat Model：记录 _targetSeatIndex；好友/手工等仍用 _targetSlotIdx（draft 下标）
  // Team Match：报名 / 好友 / 球队 / 手工；Normal Game：好友 / 老牌组合 / 手工
  onEmptySlotTap(e) {
    const seatIndex = Number(e.currentTarget.dataset.seatIndex);
    // 3+0：点击 seat4 等非法座 → 折到容量内空座（seat1–3）
    if (!isNaN(seatIndex) && seatIndex > 0) {
      this._targetSeatIndex = this._clampSeatIndexForThreeZeroBind(seatIndex);
    } else {
      this._targetSeatIndex = this._clampSeatIndexForThreeZeroBind(null);
    }

    let idx = Number(e.currentTarget.dataset.index);
    if (isNaN(idx) || idx < 0) {
      // seats UI：用空座上的 draftSlotIndex；否则第一个空 draft
      if (!isNaN(seatIndex) && seatIndex > 0 && this._groupManageSeatTemplate) {
        const views = this._buildGroupManageSeatsViewFromDraft() || [];
        const item = views.find((v) => v && Number(v.seatIndex) === seatIndex);
        idx = item && item.draftSlotIndex != null ? Number(item.draftSlotIndex) : -1;
      }
      if (isNaN(idx) || idx < 0) idx = this._firstDraftEmptySlotIndex();
    }
    if (isNaN(idx) || idx < 0) return;
    this._targetSlotIdx = idx;
    this.setData({
      addSheetVisible: true,
      playerSourceOptions: this._resolvePlayerSourceOptionsForCurrentContext()
    });
  },

  closeAddSheet() {
    this.setData({ addSheetVisible: false });
  },

  onPlayerSourceSelect(e) {
    const key = e.detail && e.detail.key;
    if (!this._isPlayerSourceAllowed(key)) {
      wx.showToast({ title: '当前比赛不支持该添加方式', icon: 'none' });
      this.setData({ addSheetVisible: false });
      return;
    }
    if (key === 'register') this.addMethodRegister();
    else if (key === 'friend') this.addMethodFriend();
    else if (key === 'team') this.addMethodTeam();
    else if (key === 'combo') this.addMethodCombo();
    else if (key === 'manual') this.addMethodManual();
  },

  closePlayerSourceListSheet() {
    this.setData({
      playerSourceListVisible: false,
      playerSourceListTitle: '',
      playerSourceListOverline: 'ADD PLAYER',
      playerSourceListEmptyText: '',
      playerSourceListItems: []
    });
  },

  // 当前目标 slot 的上下文（matchId + slotId），随 URL 传给二级页面
  _buildSlotCtx() {
    const idx = this._targetSlotIdx;
    const slots =
      this.data.showGroupManage && this._draftSlots
        ? this._draftSlots
        : this.data.groupSlots || [];
    const slot = idx != null && idx >= 0 ? slots[idx] : null;
    const slotId = slot ? slot.slotId : idx != null && idx >= 0 ? idx + 1 : '';
    return { matchId: this.data.groupId || 'demo-match', slotId: slotId };
  },

  // 已占用 playerId：球队赛扫描 teamMatchStore；普通 Game 扫描 gameStore；旧个人比杆回退 groupsStore。
  _otherGroupsUsedIds() {
    const cur = this.data.groupId;
    const match = this._readScoreTeamMatch();
    const group = this._findScoreTeamMatchGroup(match);
    const ids = [];
    if (match && group && Array.isArray(match.groups)) {
      match.groups.forEach((g) => {
        if (!g) return;
        // 当前组占用由 _currentGroupUsedIds（编辑期 draft）负责，此处只扫其它组
        if (cur && String(g.groupId) === String(cur)) return;
        teamMatchStore.resolveGroupSlots(g).forEach((slot) => {
          const player = teamMatchStore.resolveSlotPlayer(slot);
          const id = player && (player.userId || player.playerId);
          if (id) ids.push(id);
        });
      });
      console.log('[score-player-occupancy]', {
        source: 'teamMatchStore',
        groupId: cur || '',
        usedIds: ids
      });
      return ids;
    }

    if (this._isGameStoreContext()) {
      const game = gameStore.getGame(this.data.gameId);
      const groups = gameStore.listGroups(game);
      const curGi =
        this._gameGroupIndex != null ? Number(this._gameGroupIndex) || 0 : 0;
      // 当前组占用由 _currentGroupUsedIds（编辑期 draft）负责；勿扫本组已落盘 playersSlots
      groups.forEach((g, gi) => {
        if (!g) return;
        if (gi === curGi) return;
        if (cur) {
          const gid = String(g.groupId || g.id || '').trim();
          if (gid && gid === String(cur)) return;
          // matchState.groupId 形如 gameId:index
          if (String(cur) === String(this.data.gameId) + ':' + gi) return;
        }
        const collect = (player) => {
          const playerId = player && (player.playerId || player.userId || player.id);
          if (playerId) ids.push(playerId);
        };
        (Array.isArray(g.playersSlots) ? g.playersSlots : []).forEach(collect);
        (Array.isArray(g.players) ? g.players : []).forEach(collect);
      });
      console.log('[score-player-occupancy]', {
        source: 'gameStore',
        gameId: this.data.gameId || '',
        groupIndex: curGi,
        usedIds: ids
      });
      return ids;
    }

    if (!this._boundToStore()) {
      console.log('[score-player-occupancy]', {
        source: 'groupsStore',
        groupId: cur || '',
        usedIds: ids
      });
      return ids;
    }
    (groupsStore.getGroups() || []).forEach((g) => {
      if (!g || g.id === cur) return;
      (g.players || []).forEach((p) => {
        if (p && p.playerId) ids.push(p.playerId);
      });
    });
    console.log('[score-player-occupancy]', {
      source: 'groupsStore',
      groupId: cur || '',
      usedIds: ids
    });
    return ids;
  },

  // 当前组已占用 playerId（各来源补空位时不可与本组重复；编辑期以 draft 为准）
  _currentGroupUsedIds() {
    const ids = [];
    const slots =
      this.data.showGroupManage && this._draftSlots
        ? this._draftSlots
        : this.data.groupSlots || [];
    slots.forEach((s) => {
      if (s && s.status === 'occupied' && s.player && s.player.playerId) ids.push(s.player.playerId);
    });
    return ids;
  },

  _usedCanonicalPlayerMap() {
    const used = {};
    this._otherGroupsUsedIds().concat(this._currentGroupUsedIds()).forEach((id) => {
      const canonicalId = resolveCanonicalUserId(id);
      if (canonicalId) used[canonicalId] = true;
    });
    return used;
  },

  _sourcePlayerDisplayName(player) {
    const p = player || {};
    return p.matchNickname || p.competitionName || p.nickname || p.name || p.displayName || '';
  },

  _normalizeRegisterSourcePlayer(user) {
    const u = user || {};
    const userId = String(u.userId || u.playerId || u.id || '').trim();
    if (!userId) return null;
    const name = this._sourcePlayerDisplayName(u) || userId;
    return {
      userId: userId,
      playerId: userId,
      id: userId,
      name: name,
      matchNickname: u.matchNickname || u.competitionName || u.nickname || u.name || name,
      nickname: u.nickname || '',
      competitionName: u.competitionName || '',
      avatar: u.avatar || u.avatarUrl || '',
      phone: u.phone || '',
      gender: u.gender || u.matchGender || '',
      userType: u.userType || '',
      identitySource: u.identitySource || '',
      source: 'register'
    };
  },

  _normalizeTeamSourcePlayer(member, team) {
    const m = member || {};
    const playerId = String(m.userId || m.playerId || m.id || '').trim();
    if (!playerId) return null;
    const name = this._sourcePlayerDisplayName(m) || playerId;
    return {
      userId: playerId,
      playerId: playerId,
      id: playerId,
      name: name,
      matchNickname: m.matchNickname || m.competitionName || m.nickname || m.name || name,
      nickname: m.nickname || '',
      competitionName: m.competitionName || m.name || '',
      avatar: m.avatar || m.avatarUrl || '',
      phone: m.phone || '',
      gender: m.gender || '',
      userType: m.userType || '',
      identitySource: m.identitySource || 'team_directory',
      source: 'team',
      teamId: m.teamId || (team && team.id) || '',
      teamName: (team && team.name) || ''
    };
  },

  _sourcePlayerToListItem(player, source, extra) {
    const p = player || {};
    const id = String(p.userId || p.playerId || p.id || '').trim();
    if (!id) return null;
    const title = this._sourcePlayerDisplayName(p) || id;
    const meta = extra || p.phone || p.teamName || p.identitySource || '';
    return {
      id: id,
      title: title,
      subtitle: meta,
      avatar: p.avatar || mockAvatars.pickMockAvatar(id || title),
      source: source,
      player: p
    };
  },

  _openPlayerSourceListSheet(config) {
    const cfg = config || {};
    this.setData({
      addSheetVisible: false,
      playerSourceListVisible: true,
      playerSourceListTitle: cfg.title || '选择人员',
      playerSourceListOverline: cfg.overline || 'ADD PLAYER',
      playerSourceListEmptyText: cfg.emptyText || '暂无可添加人员',
      playerSourceListItems: Array.isArray(cfg.items) ? cfg.items : []
    });
  },

  // 【1】报名列表：本页二级列表，数据源为 match.registerInfo.users
  addMethodRegister() {
    if (!this._isTeamMatchPlayerSourceContext()) {
      this.setData({ addSheetVisible: false });
      wx.showToast({ title: '当前比赛无报名列表', icon: 'none' });
      return;
    }
    const match = this._readScoreTeamMatch();
    const used = this._usedCanonicalPlayerMap();
    const users = match && match.registerInfo && Array.isArray(match.registerInfo.users)
      ? match.registerInfo.users
      : [];
    const items = [];
    users.forEach((user) => {
      const player = this._normalizeRegisterSourcePlayer(user);
      if (!player) return;
      const canonicalId = resolveCanonicalUserId(player.userId || player.playerId);
      if (canonicalId && used[canonicalId]) return;
      const groupText = user && (user.matchTeamName || user.groupName) ? String(user.matchTeamName || user.groupName) : '';
      const phoneText = user && user.phone ? String(user.phone) : '';
      const meta = [groupText, phoneText].filter(Boolean).join(' · ');
      const item = this._sourcePlayerToListItem(player, 'register', meta || '已报名');
      if (item) items.push(item);
    });
    this._openPlayerSourceListSheet({
      title: '报名列表',
      overline: 'REGISTERED',
      emptyText: users.length ? '报名人员均已在分组中' : '本场暂无报名人员',
      items: items
    });
  },

  // 【2】好友列表：第二层 → 跳转「好友选择页」（多选，已在组默认选中、可取消）
  addMethodFriend() {
    this.setData({ addSheetVisible: false });
    const slots =
      this.data.showGroupManage && this._draftSlots
        ? this._draftSlots
        : this.data.groupSlots || [];
    const groupPlayerIds = [];
    let emptyCount = 0;
    slots.forEach((s) => {
      if (!s) return;
      if (s.status === 'occupied' && s.player && s.player.playerId) {
        groupPlayerIds.push(s.player.playerId);
      } else if (s.status === 'empty') {
        emptyCount += 1;
      }
    });
    const ctx = this._buildSlotCtx();
    const usedIds = this._otherGroupsUsedIds();
    const url =
      '/subpackages/player/pages/friends/index?matchId=' +
      encodeURIComponent(ctx.matchId) +
      '&slotId=' +
      encodeURIComponent(ctx.slotId) +
      '&emptyCount=' +
      emptyCount +
      '&groupPlayers=' +
      encodeURIComponent(groupPlayerIds.join(',')) +
      '&used=' +
      encodeURIComponent(usedIds.join(','));
    wx.navigateTo({
      url: url,
      events: {
        friendsSelected: (payload) => this._onFriendsSelected(payload && payload.friends)
      },
      fail: (err) => wx.showToast({ title: '跳转失败：' + (err && err.errMsg ? err.errMsg : ''), icon: 'none' })
    });
  },

  // 好友选择返回：只写 draft（新增补空位 + 取消选中移出）
  _onFriendsSelected(friends) {
    if (!Array.isArray(friends)) return;
    if (!this._draftSlots) return;
    const otherUsed = {};
    this._otherGroupsUsedIds().forEach((id) => { otherUsed[resolveCanonicalUserId(id)] = true; });
    const selectedSet = {};
    friends.forEach((f) => { selectedSet[resolveCanonicalUserId(f.playerId)] = f; });
    const slots = this._draftSlots || [];
    const currentGroupSlots = {};
    slots.forEach((s, i) => {
      if (s && s.status === 'occupied' && s.player && s.player.playerId) {
        currentGroupSlots[resolveCanonicalUserId(s.player.playerId)] = i;
      }
    });
    // 1) 取消选中 → draft 移出
    Object.keys(currentGroupSlots).forEach((pid) => {
      if (!selectedSet[pid]) this._removeDraftSlotAt(currentGroupSlots[pid]);
    });
    // 2) 新增选中 → draft 补空位；首人用 _targetSeatIndex，其后用下一空 seat
    let seatCursor =
      Number(this._targetSeatIndex) > 0 ? Number(this._targetSeatIndex) : null;
    friends
      .filter((f) => {
        const canonicalPlayerId = resolveCanonicalUserId(f.playerId);
        return currentGroupSlots[canonicalPlayerId] == null && !otherUsed[canonicalPlayerId];
      })
      .forEach((f) => {
        const idx = this._firstDraftEmptySlotIndex();
        if (idx < 0) return;
        const source = f.playerId === 'me' ? 'host' : 'friend';
        const player = { playerId: f.playerId, name: f.name, avatar: f.avatar };
        const seatIndex =
          seatCursor || this._nextAvailableSeatIndexForDraft() || null;
        seatCursor = null;
        const participant = this._ensureMatchParticipant(player);
        if (participant && participant.needRegister) {
          this._openJoinMatchTeamSheet({
            slotIndex: idx,
            player: participant.player || player,
            source: source
          });
          return;
        }
        this._doBindDraftPlayerToSlot(idx, player, source, seatIndex);
      });
  },

  // 【3】球队列表：本页二级列表，数据源为 teamDirectory/team成员 mock
  addMethodTeam() {
    if (!this._isTeamMatchPlayerSourceContext()) {
      this.setData({ addSheetVisible: false });
      wx.showToast({ title: '当前比赛无球队列表', icon: 'none' });
      return;
    }
    const match = this._readScoreTeamMatch();
    const matchTeamId = match && match.teamId ? String(match.teamId).trim() : '';
    const teams = matchTeamId
      ? [teamDirectory.getTeamById(matchTeamId)].filter(Boolean)
      : (teamDirectory.listTeamsForSelect('') || []);
    const used = this._usedCanonicalPlayerMap();
    const seen = {};
    const items = [];
    let memberCount = 0;
    teams.forEach((team) => {
      const members = teamDirectory.getTeamMembers(team && team.id) || [];
      memberCount += members.length;
      members.forEach((member) => {
        const player = this._normalizeTeamSourcePlayer(member, team);
        if (!player) return;
        const canonicalId = resolveCanonicalUserId(player.userId || player.playerId);
        if (!canonicalId || seen[canonicalId] || used[canonicalId]) return;
        seen[canonicalId] = true;
        const meta = [player.teamName, player.phone].filter(Boolean).join(' · ');
        const item = this._sourcePlayerToListItem(player, 'team', meta || '球队成员');
        if (item) items.push(item);
      });
    });
    this._openPlayerSourceListSheet({
      title: '球队列表',
      overline: 'TEAM',
      emptyText: memberCount ? '球队成员均已在分组中' : '暂无球队成员',
      items: items
    });
  },

  // Normal Game / 快捷创建：老牌组合一键按空位顺序填充
  addMethodCombo() {
    if (this._isTeamMatchPlayerSourceContext()) {
      this.setData({ addSheetVisible: false });
      wx.showToast({ title: '球队赛请使用报名或球队列表', icon: 'none' });
      return;
    }
    this.setData({ addSheetVisible: false });
    const usedIds = this._otherGroupsUsedIds().concat(this._currentGroupUsedIds());
    const ctx = this._buildSlotCtx();
    wx.navigateTo({
      url:
        '/subpackages/player/pages/combos/index?matchId=' +
        encodeURIComponent(ctx.matchId || '') +
        '&slotId=' +
        encodeURIComponent(ctx.slotId || '') +
        '&used=' +
        encodeURIComponent(usedIds.join(',')),
      events: {
        comboSelected: (payload) => this._onComboSelected(payload && payload.combo)
      },
      fail: (err) => wx.showToast({ title: '跳转失败：' + (err && err.errMsg ? err.errMsg : ''), icon: 'none' })
    });
  },

  _onComboSelected(combo) {
    if (!combo || !Array.isArray(combo.players)) return;
    if (!this._draftSlots) return;
    if (this._isTeamMatchPlayerSourceContext()) return;
    const used = {};
    this._otherGroupsUsedIds().concat(this._currentGroupUsedIds()).forEach((id) => {
      if (id) used[String(id)] = true;
    });
    let target = this._targetSlotIdx != null && this._targetSlotIdx >= 0 ? this._targetSlotIdx : -1;
    let seatCursor =
      Number(this._targetSeatIndex) > 0 ? Number(this._targetSeatIndex) : null;
    combo.players.forEach((src) => {
      const playerId = String((src && src.playerId) || '').trim();
      if (!playerId || used[playerId]) return;
      let idx = -1;
      if (target >= 0 && this._draftSlots[target] && this._draftSlots[target].status === 'empty') {
        idx = target;
      } else {
        idx = this._firstDraftEmptySlotIndex();
      }
      target = -1;
      if (idx < 0) return;
      const seatIndex = seatCursor || this._nextAvailableSeatIndexForDraft() || null;
      seatCursor = null;
      this._doBindDraftPlayerToSlot(
        idx,
        {
          playerId: playerId,
          name: src.name || playerId,
          avatar: src.avatar || '',
          source: 'combo'
        },
        'combo',
        seatIndex
      );
      used[playerId] = true;
    });
  },

  onPlayerSourceListItemTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.playerSourceListItems[index];
    if (!item || !item.player) return;
    const target = this._targetSlotIdx;
    this.closePlayerSourceListSheet();
    this._onPlayerPicked(item.player, target);
  },

  // 【4】手工添加：本页底部弹窗（姓名必填 / 手机选填 / 性别），不跳转独立页
  addMethodManual() {
    this.setData({
      addSheetVisible: false,
      manualSheetVisible: true,
      manualName: '',
      manualPhone: '',
      manualGender: 'male'
    });
  },

  closeManualSheet() {
    this.setData({
      manualSheetVisible: false,
      manualName: '',
      manualPhone: '',
      manualGender: 'male'
    });
  },

  onManualNameInput(e) {
    this.setData({ manualName: (e.detail && e.detail.value) || '' });
  },

  onManualPhoneInput(e) {
    this.setData({ manualPhone: (e.detail && e.detail.value) || '' });
  },

  onManualGenderSelect(e) {
    const gender = e.currentTarget.dataset.gender;
    if (gender !== 'male' && gender !== 'female') return;
    this.setData({ manualGender: gender });
  },

  _tryCreateManualContacts(targetUserId, phone, remarkName) {
    const currentUser = gameStore.getCurrentUser() || {};
    const ownerUserId = String(currentUser.userId || '').trim();
    const targetId = String(targetUserId || '').trim();
    if (!ownerUserId || !targetId) {
      console.log('[contact-auto-create]', {
        ownerUserId: ownerUserId,
        targetUserId: targetId,
        action: 'skip_missing_user'
      });
      return;
    }
    try {
      const ownerContact = contactStore.addContact({
        ownerUserId: ownerUserId,
        targetUserId: targetId,
        phone: phone || '',
        remarkName: remarkName || '',
        source: 'manual_add'
      });
      const targetContact = contactStore.addContact({
        ownerUserId: targetId,
        targetUserId: ownerUserId,
        phone: currentUser.phone || '',
        remarkName: '',
        source: 'manual_add'
      });
      console.log('[contact-auto-create]', {
        ownerUserId: ownerUserId,
        targetUserId: targetId,
        ownerContactId: ownerContact && ownerContact.contactId,
        targetContactId: targetContact && targetContact.contactId,
        action: 'upsert_bidirectional'
      });
    } catch (err) {
      console.warn('[contact-auto-create]', {
        ownerUserId: ownerUserId,
        targetUserId: targetId,
        action: 'failed',
        error: err && err.message ? err.message : err
      });
    }
  },

  confirmManualSheet() {
    const name = (this.data.manualName || '').trim();
    const phone = (this.data.manualPhone || '').trim();
    const gender = this.data.manualGender === 'female' ? 'female' : 'male';
    if (!name) {
      wx.showToast({ title: '请输入选手姓名', icon: 'none' });
      return;
    }
    if (phone && !/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }
    const target = this._targetSlotIdx;
    const player = {
      userId: '',
      playerId: createManualPlayerId(),
      name: name,
      matchNickname: name,
      phone: phone || '',
      gender: gender,
      avatar: mockAvatars.pickMockAvatar(name),
      source: 'manual',
      _manualIdentity: {
        phoneProvided: !!phone,
        userFound: false
      }
    };
    if (phone) {
      const identity = userDirectory.resolveUserIdentityByPhone(phone);
      if (identity && identity.found && identity.source === 'mini_program' && identity.user) {
        const user = identity.user;
        const displayName = user.competitionName || user.nickname || user.userId;
        player.userId = user.userId;
        player.playerId = user.userId;
        player.name = displayName;
        player.matchNickname = displayName;
        player.nickname = user.nickname || '';
        player.competitionName = user.competitionName || '';
        player.avatar = user.avatar || '';
        player.phone = user.phone || phone;
        player.gender = user.gender || gender;
        player.userType = identity.userType || 'registered';
        player.identitySource = identity.source || 'mini_program';
        player._manualRemarkName = name;
        player._manualIdentity.userFound = true;
        player._manualIdentity.source = identity.source;
        player._manualIdentity.userType = identity.userType;
        console.log('[manual-user-identity]', {
          phone: phone,
          source: identity.source,
          userType: identity.userType,
          userId: user.userId,
          action: 'use_mini_program_user'
        });
        this._tryCreateManualContacts(user.userId, phone, name);
      } else {
        const appUser = identity && identity.found && identity.source === 'app' && identity.user
          ? identity.user
          : null;
        const phoneUser = userStore.createPhoneUser({
          phone: phone,
          nickname: appUser ? (appUser.nickname || phone) : name,
          avatar: appUser ? (appUser.avatar || '') : '',
          gender: appUser ? (appUser.gender || gender) : gender,
          source: appUser ? 'app_import' : 'manual_add'
        });
        if (phoneUser) {
          player.userId = phoneUser.userId;
          player.playerId = phoneUser.userId;
          player.name = phoneUser.nickname;
          player.matchNickname = phoneUser.nickname;
          player.nickname = phoneUser.nickname;
          player.avatar = phoneUser.avatar || '';
          player.phone = phoneUser.phone || phone;
          player.gender = phoneUser.gender || gender;
          player.userType = phoneUser.userType || 'phone';
          player.identitySource = phoneUser.source || (appUser ? 'app_import' : 'manual_add');
          player._manualRemarkName = appUser ? name : '';
          player._manualIdentity.userFound = !!appUser;
          player._manualIdentity.source = appUser ? 'app' : null;
          player._manualIdentity.userType = phoneUser.userType || 'phone';
          console.log('[manual-user-identity]', {
            phone: phone,
            source: appUser ? 'app' : null,
            userType: phoneUser.userType || 'phone',
            userId: phoneUser.userId,
            action: appUser ? 'create_phone_user_from_app' : 'create_phone_user_manual'
          });
          this._tryCreateManualContacts(phoneUser.userId, phone, name);
        }
      }
    } else {
      player.userId = createGuestUserId(player.playerId);
      player.userType = 'guest';
      player.identitySource = 'manual_add';
      console.log('[manual-user-identity]', {
        phone: '',
        source: null,
        userType: 'guest',
        userId: player.userId,
        action: 'use_guest_user'
      });
    }
    this.closeManualSheet();
    this._onPlayerPicked(player, target);
  },

  // 手工添加返回：只写 draft（目标 slot 或第一个空位）
  _onPlayerPicked(player, target) {
    if (!player) return;
    if (!this._draftSlots) return;
    let userId = String(player.userId || '').trim();
    const slotPlayerId = String(player.playerId || player.id || userId || '').trim();
    if (!userId && player.userType === 'guest') {
      userId = createGuestUserId(slotPlayerId);
      player.userId = userId;
    }
    const identityId = userId || slotPlayerId;
    const identity = player._manualIdentity || {};
    const match = this._readScoreTeamMatch();
    const registeredUser = userId ? this._findScoreTeamMatchRegisterUser(match, userId) : null;
    // draft 编辑态：当前组占用以 _draftSlots 为准，他组以 match.groups 为准；
    // 不读 _findScoreTeamMatchGroupedPlayer（正式 groups，含尚未提交的删除）。
    const used = {};
    this._otherGroupsUsedIds().concat(this._currentGroupUsedIds()).forEach((id) => {
      used[resolveCanonicalUserId(id)] = true;
    });
    const canonicalPlayerId = resolveCanonicalUserId(identityId);
    if (identityId && used[canonicalPlayerId]) {
      console.log('[manual-player-identity]', {
        source: player.source || 'manual',
        phoneProvided: !!identity.phoneProvided || !!player.phone,
        userFound: !!identity.userFound,
        registered: !!registeredUser,
        grouped: true,
        action: 'block_grouped'
      });
      wx.showToast({ title: '该用户已经在本组或其他组比赛中', icon: 'none' });
      return;
    }
    if (registeredUser && player.matchNickname && match && match.registerInfo && Array.isArray(match.registerInfo.users)) {
      match.registerInfo.users = match.registerInfo.users.map((user) => {
        const uid = String((user && (user.userId || user.playerId || user.id)) || '').trim();
        return isSameUserIdentity(uid, userId)
          ? Object.assign({}, user, { matchNickname: player.matchNickname })
          : user;
      });
      teamMatchStore.saveMatch(match);
    }
    const slots = this._draftSlots || [];
    let idx = target != null && target >= 0 ? target : this._firstDraftEmptySlotIndex();
    if (idx < 0 || (slots[idx] && slots[idx].status === 'occupied')) idx = this._firstDraftEmptySlotIndex();
    if (idx < 0) {
      wx.showToast({ title: '本组已满（4 人）', icon: 'none' });
      return;
    }
    const bindPlayer = {
      playerId: slotPlayerId || userId,
      userId: userId,
      name: player.matchNickname || player.name,
      matchNickname: player.matchNickname || player.name || '',
      nickname: player.nickname || '',
      competitionName: player.competitionName || '',
      avatar: player.avatar,
      phone: player.phone || '',
      gender: player.gender || '',
      userType: player.userType || '',
      identitySource: player.identitySource || '',
      source: player.source || 'manual'
    };
    const participant = userId
      ? this._ensureMatchParticipant(bindPlayer)
      : { ok: true, registered: false, skipped: true, reason: 'no_stable_user_id', player: bindPlayer };
    if (participant && participant.needRegister) {
      console.log('[manual-player-identity]', {
        source: player.source || 'manual',
        phoneProvided: !!identity.phoneProvided || !!player.phone,
        userFound: !!identity.userFound,
        registered: false,
        grouped: false,
        action: 'open_team_sheet'
      });
      this._openJoinMatchTeamSheet({
        slotIndex: idx,
        player: participant.player || bindPlayer,
        source: player.source || 'manual',
        bindMode: 'draftDirectBind'
      });
      return;
    }
    console.log('[manual-player-identity]', {
      source: player.source || 'manual',
      phoneProvided: !!identity.phoneProvided || !!player.phone,
      userFound: !!identity.userFound,
      registered: !!(participant && participant.registered),
      grouped: false,
      action: 'bind_slot'
    });
    this._bindDraftPlayerToSlot(idx, bindPlayer, player.source || 'manual');
  },

  // 兼容旧 footer 入口（若仍被调用）：打开手工弹窗，目标=第一个空位
  addGroupPlayer() {
    this._targetSlotIdx = this._firstEmptySlotIndex();
    if (this._targetSlotIdx < 0) {
      wx.showToast({ title: '本组已满（4 人）', icon: 'none' });
      return;
    }
    this.addMethodManual();
  },

  // footer「好友选择」遗留入口（底部已改为取消/确认，保留方法以免其它调用报错）
  onFooterFriend() {
    if (this._firstEmptySlotIndex() < 0) {
      wx.showToast({ title: '本组已满（4 人）', icon: 'none' });
      return;
    }
    this.addMethodFriend();
  },

  // 阻止面板点击穿透
  noop() {},

  /**
   * Patch-02C2A-V2 / 02C2B1：Entity 成绩格点击 → 打开现有记分面板（本阶段不写成绩）
   */
  onEntityScoreCellTap(e) {
    if (this.data.mode !== 'stroke_entity') return;
    const entityIndex = Number(e.currentTarget.dataset.entityIndex);
    const holeIndex = Number(e.currentTarget.dataset.holeIndex);
    if (!Number.isFinite(entityIndex) || entityIndex < 0) return;
    if (!Number.isFinite(holeIndex) || holeIndex < 0 || holeIndex > 17) return;
    console.log({
      mode: 'stroke_entity',
      entityIndex: entityIndex,
      holeIndex: holeIndex
    });
    this.openEntityScoreInput(entityIndex, holeIndex);
  },

  /**
   * Patch-02C2B1：用 _entitiesSource 初始化面板并打开 score-input-sheet（不写成绩、不改 activePlayerIdx）
   */
  openEntityScoreInput(entityIndex, holeIndex) {
    // finished：仍允许打开面板查看；改分由 _scoreEditBlocked 拦截
    if (this.data.mode !== 'stroke_entity') return;
    const entities = this._entitiesSource || [];
    const entity = entities[entityIndex];
    if (!entity) return;

    const par = holePars()[holeIndex];
    const label =
      holeIndex < 9 ? columnLabels()[holeIndex] : columnLabels()[holeIndex + 1];
    const scores = Array.isArray(entity.scores) ? entity.scores : [];
    const putts = Array.isArray(entity.putts) ? entity.putts : [];
    const rawScore = scores[holeIndex];
    const hasScore = isFilledScore(rawScore);
    // 空洞：与现有面板一致，默认填标准杆便于录入（本 Patch 仍不落盘）
    const score = hasScore ? rawScore : par;
    const putt = putts[holeIndex] || 2;
    const fairway = resolveHoleFairway(entity.fairways, holeIndex);
    const penalty = resolveHolePenalty(entity.penalties, holeIndex);
    const sand = resolveHoleSand(entity.sands, holeIndex);

    const quick = entities.map((ent, idx) => {
      if (idx === entityIndex) return score;
      const s = ent && Array.isArray(ent.scores) ? ent.scores[holeIndex] : null;
      return isFilledScore(s) ? s : par;
    });

    const openPatch = {
      activeEntityIndex: entityIndex,
      scoreClearDraft: false,
      scoreHoleClearPending: false,
      quickScoreClearDraft: false,
      quickScoreFreshDraft: false,
      sheetHoleLabel: label,
      sheetHoleIndex: holeIndex,
      sheetPar: par,
      panelScore: score,
      panelPutt: putt,
      panelPuttTouched: hasScore,
      panelFairway: fairway,
      panelPenalty: penalty,
      panelBunker: sand,
      quickPanelScores: quick,
      showScoreSheet: true
    };
    this._scoreSheetEntrySnapshot = {
      activeEntityIndex: entityIndex,
      entitiesSource: this._cloneEntitiesSourceSnapshot(entities),
      scoreClearDraft: false,
      scoreHoleClearPending: false,
      quickScoreClearDraft: false,
      quickScoreFreshDraft: false,
      sheetHoleLabel: label,
      sheetHoleIndex: holeIndex,
      sheetPar: par,
      panelScore: score,
      panelPutt: putt,
      panelPuttTouched: hasScore,
      panelFairway: fairway,
      panelPenalty: penalty,
      panelBunker: sand,
      quickPanelScores: quick.slice()
    };
    this.setData(openPatch, () => {
      this.syncSheetPlayers();
      setTimeout(() => this.setData({ scoreSheetOpen: true }), 30);
    });
  },

  /**
   * 比洞 Side 行点格：
   * G5 → 映射唯一成员后走个人录入；
   * G6/G7/G8 → openMatchSideScoreInput（组合 Side，不进 Entity / 不写个人分）
   */
  onMatchSideScoreCellTap(e) {
    const sideIdx = Number(e.currentTarget.dataset.sideIdx);
    const colIdx = Number(e.currentTarget.dataset.colIdx);
    const cIdx = Number(colIdx);
    if (!this.data.isG5MatchPlay) return;
    if (cIdx === G5_FINAL_COL_IDX) return;

    const ms = this._matchState || this._readMatchState();
    const matchId = (ms && ms.matchId) || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const gameMode = this._resolveTeamMatchGameMode(match, ms);
    if (isG678SideMatchPlayMode(gameMode)) {
      const holeIndex = resolveHoleIndexFromColIdx(cIdx, true);
      if (holeIndex < 0) return;
      this.openMatchSideScoreInput(sideIdx, holeIndex);
      return;
    }
    if (!isG5PersonalMatchPlayMode(gameMode)) return;

    const side = (this.data.matchSidesView || [])[sideIdx];
    if (!side || !side.scoreEditable) return;
    const memberId = side.memberPlayerId || (side.members && side.members[0] && side.members[0].playerId) || '';
    if (!memberId) return;
    const pIdx = (this._playersSource || []).findIndex((p) => resolveG5PlayerId(p) === String(memberId));
    if (pIdx < 0) return;

    this.onScoreCellTap({
      currentTarget: {
        dataset: {
          playerIdx: pIdx,
          colIdx: cIdx
        }
      }
    });
  },

  /**
   * G6/G7/G8：打开 score-input-sheet，主体为 Side（镜像 openEntityScoreInput，不进 stroke_entity）
   */
  openMatchSideScoreInput(sideIndex, holeIndex) {
    if (!this._isG678MatchPlaySideScoring()) return;
    const ms = this._matchState || this._readMatchState();
    const matchId = (ms && ms.matchId) || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const gameMode = this._resolveTeamMatchGameMode(match, ms);
    const groupId = String(this.data.groupId || (ms && ms.groupId) || '').trim();
    if (!Array.isArray(this._matchSidesSource) || this._matchSidesSource.length < 2) {
      this._rebuildMatchSidesSource(match, gameMode, groupId);
    }
    const sides = this._matchSidesSource || [];
    const side = sides[sideIndex];
    if (!side) return;

    const par = holePars()[holeIndex];
    const label =
      (this.data.columns[holeIndex] && this.data.columns[holeIndex].label) ||
      g5HoleColumnLabels()[holeIndex] ||
      String(holeIndex + 1);
    this._padSideScoreArrays(side);
    const scores = side.scores;
    const putts = side.putts;
    const rawScore = scores[holeIndex];
    const hasScore = isFilledScore(rawScore);
    const score = hasScore ? rawScore : par;
    const putt = putts[holeIndex] || 2;
    const fairway = resolveHoleFairway(side.fairways, holeIndex);
    const penalty = resolveHolePenalty(side.penalties, holeIndex);
    const sand = resolveHoleSand(side.sands, holeIndex);

    const quick = sides.map((s, idx) => {
      if (idx === sideIndex) return score;
      this._padSideScoreArrays(s);
      const sv = s && Array.isArray(s.scores) ? s.scores[holeIndex] : null;
      return isFilledScore(sv) ? sv : par;
    });

    const openPatch = {
      activeSideIndex: sideIndex,
      scoreClearDraft: false,
      scoreHoleClearPending: false,
      quickScoreClearDraft: false,
      quickScoreFreshDraft: false,
      sheetHoleLabel: label,
      sheetHoleIndex: holeIndex,
      sheetPar: par,
      panelScore: score,
      panelPutt: putt,
      panelPuttTouched: hasScore,
      panelFairway: fairway,
      panelPenalty: penalty,
      panelBunker: sand,
      quickPanelScores: quick,
      showScoreSheet: true
    };
    this._scoreSheetEntrySnapshot = {
      activeSideIndex: sideIndex,
      matchSidesSource: this._cloneMatchSidesSourceSnapshot(sides),
      scoreClearDraft: false,
      scoreHoleClearPending: false,
      quickScoreClearDraft: false,
      quickScoreFreshDraft: false,
      sheetHoleLabel: label,
      sheetHoleIndex: holeIndex,
      sheetPar: par,
      panelScore: score,
      panelPutt: putt,
      panelPuttTouched: hasScore,
      panelFairway: fairway,
      panelPenalty: penalty,
      panelBunker: sand,
      quickPanelScores: quick.slice()
    };
    this.setData(openPatch, () => {
      this.syncSheetPlayers();
      setTimeout(() => this.setData({ scoreSheetOpen: true }), 30);
    });
  },

  _focusSheetSide(idx) {
    if (!this._isG678MatchPlaySideScoring()) return;
    const holeIndex = this.data.sheetHoleIndex;
    const par = this.data.sheetPar;
    const side = (this._matchSidesSource || [])[idx];
    if (!side) return;
    const switched = Number(this.data.activeSideIndex) !== Number(idx);
    if (this.data.scoreHoleClearPending) {
      this.setData({
        scoreClearDraft: false,
        activeSideIndex: idx,
        panelScore: par,
        panelPutt: 2,
        panelPuttTouched: false,
        panelFairway: FAIRWAY_FAIRWAY,
        panelPenalty: 0,
        panelBunker: 0
      }, () => {
        this.syncSheetPlayers();
        if (switched) this._pulseTechPanelFocus();
      });
      return;
    }
    this._padSideScoreArrays(side);
    const raw = side.scores[holeIndex];
    const hasScore = isFilledScore(raw);
    this.setData({
      scoreClearDraft: false,
      activeSideIndex: idx,
      panelScore: hasScore ? raw : par,
      panelPutt: side.putts[holeIndex] || 2,
      panelPuttTouched: hasScore,
      panelFairway: resolveHoleFairway(side.fairways, holeIndex),
      panelPenalty: resolveHolePenalty(side.penalties, holeIndex),
      panelBunker: resolveHoleSand(side.sands, holeIndex)
    }, () => {
      this.syncSheetPlayers();
      if (switched) this._pulseTechPanelFocus();
    });
  },

  /**
   * G6/G7/G8 确认：写 _matchSidesSource → persistSession → scoresBySide
   */
  confirmMatchSideScoreInput() {
    if (this._scoreEditBlocked()) return;
    if (!this._isG678MatchPlaySideScoring()) return;

    if (this.data.scorePanelMode === 'quick') {
      if (this.data.quickScoreClearDraft) {
        const holeIndex = this.data.sheetHoleIndex;
        this._clearHoleScoresInMatchSidesSource(holeIndex);
        this.setData({ quickScoreClearDraft: false });
        this.persistSession();
        this.refreshPlayers();
        this._hideScoreSheet();
        return;
      }
      return this.confirmMatchSideQuickScore();
    }

    const {
      activeSideIndex,
      sheetHoleIndex,
      panelScore,
      panelPutt,
      panelFairway,
      panelPenalty,
      panelBunker,
      sheetPar,
      scoreClearDraft,
      scoreHoleClearPending
    } = this.data;

    if (scoreClearDraft) {
      this._clearHoleScoresInMatchSidesSource(sheetHoleIndex);
      this.setData({ scoreClearDraft: false, scoreHoleClearPending: false });
      this.persistSession();
      this.refreshPlayers();
      this._hideScoreSheet();
      return;
    }

    const sIdx = Number(activeSideIndex);
    const side =
      Number.isFinite(sIdx) && sIdx >= 0 && this._matchSidesSource
        ? this._matchSidesSource[sIdx]
        : null;
    if (!side) return;

    if (scoreHoleClearPending) {
      this._clearHoleScoresInMatchSidesSource(sheetHoleIndex);
    }

    let newScore = panelScore;
    if (newScore === null || newScore === undefined || newScore === '') {
      newScore = sheetPar;
    }
    this._padSideScoreArrays(side);
    side.scores[sheetHoleIndex] = newScore;
    if (panelPutt !== null && panelPutt !== undefined && panelPutt !== '') {
      side.putts[sheetHoleIndex] = panelPutt;
    }
    side.fairways[sheetHoleIndex] = normalizeFairwayValue(panelFairway);
    side.penalties[sheetHoleIndex] = normalizePenaltyValue(panelPenalty);
    side.sands[sheetHoleIndex] = normalizeSandValue(panelBunker);

    this.setData({ scoreHoleClearPending: false, scoreClearDraft: false });
    this.persistSession();
    this.refreshPlayers();

    const next = (this._matchSidesSource || []).findIndex(
      (s) => !isFilledScore((s && s.scores ? s.scores : [])[sheetHoleIndex])
    );
    if (next !== -1) {
      this._focusSheetSide(next);
    } else {
      this._hideScoreSheet();
    }
  },

  /** G6/G7/G8 快捷：本洞一次写满 Side A / Side B */
  confirmMatchSideQuickScore() {
    if (this._scoreEditBlocked()) return;
    if (!this._isG678MatchPlaySideScoring()) return;

    const { sheetHoleIndex, sheetPar, quickPanelScores } = this.data;
    const sides = this._matchSidesSource || [];
    const quick = quickPanelScores || [];

    sides.forEach((side, i) => {
      if (!side) return;
      let s = quick[i];
      if (s === null || s === undefined || s === '') s = sheetPar;
      const diff = s - sheetPar;
      this._padSideScoreArrays(side);
      side.scores[sheetHoleIndex] = s;
      side.putts[sheetHoleIndex] = diff < 0 ? 1 : 2;
      if (side.fairways[sheetHoleIndex] == null || side.fairways[sheetHoleIndex] === '') {
        side.fairways[sheetHoleIndex] = FAIRWAY_FAIRWAY;
      }
      if (side.penalties[sheetHoleIndex] == null || side.penalties[sheetHoleIndex] === '') {
        side.penalties[sheetHoleIndex] = 0;
      }
      if (side.sands[sheetHoleIndex] == null || side.sands[sheetHoleIndex] === '') {
        side.sands[sheetHoleIndex] = 0;
      }
    });

    this.setData({ quickScoreClearDraft: false, quickScoreFreshDraft: false });
    this.persistSession();
    this.refreshPlayers();
    this._hideScoreSheet();
  },

  onScoreCellTap(e) {
    // finished：仍允许进入记分面板查看
    const { playerIdx, colIdx } = e.currentTarget.dataset;
    const cIdx = Number(colIdx);
    const isG5MatchPlay = !!this.data.isG5MatchPlay;
    if (isG5MatchPlay) {
      if (cIdx === G5_FINAL_COL_IDX) return;
    } else if (SPECIAL_IDX.includes(cIdx)) {
      return;
    }

    // 队内 G2/G3：pair shell / fourball40 stroke shell 点格均走 Entity 记分
    if (
      this.data.mode === 'stroke_entity' &&
      (this.data.useFourballScoreShell || this.data.isFourball40StrokeShell)
    ) {
      const entityIndex = Number(playerIdx);
      const holeIndex = resolveHoleIndexFromColIdx(cIdx, false);
      if (!Number.isFinite(entityIndex) || entityIndex < 0) return;
      if (holeIndex < 0) return;
      this.openEntityScoreInput(entityIndex, holeIndex);
      return;
    }

    // 四人最佳球位 / 最好成绩：复用个人比杆赛记分面板；点击的行 = 对应 group（多人组=组记分，单人组=个人比杆）
    if (this.data.mode === 'fourball_best') {
      if (!this.data.bestHasMatch) return; // 演示态不可编辑
      this.openTeamScoreInput(cIdx, Number(playerIdx) || 0);
      return;
    }

    const pIdx = Number(playerIdx);
    const holeIndex = resolveHoleIndexFromColIdx(cIdx, isG5MatchPlay);
    if (holeIndex < 0) return;
    const label = isG5MatchPlay
      ? ((this.data.columns[cIdx] && this.data.columns[cIdx].label) || g5HoleColumnLabels()[holeIndex] || '')
      : columnLabels()[cIdx];

    const par = holePars()[holeIndex];
    // G5 比洞：以 _playersSource 为准（matchSidesView 为主展示，playersView 可能仅作面板索引）
    const srcPlayer = (this._playersSource || [])[pIdx];
    const player = this.data.playersView[pIdx] || srcPlayer;
    if (!player) return;
    const live = srcPlayer || player;
    const rawScore = (Array.isArray(live.scores) ? live.scores : [])[holeIndex];
    const hasScore = rawScore !== null && rawScore !== undefined && rawScore !== '';
    const score = hasScore ? rawScore : par; // 空洞默认填标准杆，便于直接录入
    const putt = (Array.isArray(live.putts) ? live.putts : [])[holeIndex] || 2;
    const fairway = resolveHoleFairway(live.fairways, holeIndex);
    const penalty = resolveHolePenalty(live.penalties, holeIndex);
    const sand = resolveHoleSand(live.sands, holeIndex);

    let quick = this.data.quickPanelScores.slice();
    quick[pIdx] = score;
    // 快捷模式：本洞全组默认 PAR（仅 quick 分支，不影响技术面板）
    if (this.data.scorePanelMode === 'quick') {
      quick = this._quickDefaultsForHole(holeIndex, par);
    }

    const openPatch = {
      activePlayerIdx: pIdx,
      scoreClearDraft: false,
      scoreHoleClearPending: false,
      quickScoreClearDraft: false,
      quickScoreFreshDraft: false,
      sheetHoleLabel: label,
      sheetHoleIndex: holeIndex,
      sheetPar: par,
      panelScore: score,
      panelPutt: putt,
      // 已有成绩的洞：视推杆为既有用户输入，不被自动值覆盖；空洞允许智能默认
      panelPuttTouched: hasScore,
      panelFairway: fairway,
      panelPenalty: penalty,
      panelBunker: sand,
      quickPanelScores: quick,
      showScoreSheet: true
    };
    // 遮罩关闭时恢复进入弹窗前面板状态（清除草稿不落盘）
    this._scoreSheetEntrySnapshot = {
      activePlayerIdx: pIdx,
      scoreClearDraft: false,
      scoreHoleClearPending: false,
      quickScoreClearDraft: false,
      quickScoreFreshDraft: false,
      sheetHoleLabel: label,
      sheetHoleIndex: holeIndex,
      sheetPar: par,
      panelScore: score,
      panelPutt: putt,
      panelPuttTouched: hasScore,
      panelFairway: fairway,
      panelPenalty: penalty,
      panelBunker: sand,
      quickPanelScores: quick.slice()
    };
    this.setData(openPatch, () => {
      this.syncSheetPlayers();
      setTimeout(() => this.setData({ scoreSheetOpen: true }), 30);
    });
  },

  // 四人最佳球位 / 最好成绩：打开个人比杆赛记分面板。记分实体 = scoreEngine.groups（每组一个控件）。
  // 复用同一面板：技术面板逐组录入；快捷面板按组数渲染 N 个控件（不新增 UI 结构）。
  openTeamScoreInput(cIdx, groupIndex) {
    // finished：仍允许打开面板查看
    const label = columnLabels()[cIdx];
    let holeIndex = 0;
    if (cIdx < 9) holeIndex = cIdx;
    else if (cIdx > 9 && cIdx < 19) holeIndex = cIdx - 1;

    const par = holePars()[holeIndex];
    const groups = this._engineGroups || [];
    // 聚焦被点击的组（行级绑定）；越界则回退第一个未填组
    let active = groupIndex != null && groups[groupIndex] ? groupIndex : -1;
    if (active < 0) active = groups.findIndex((g) => !isFilledScore((g.scores || [])[holeIndex]));
    if (active < 0) active = 0;
    const raw = this._groupHoleScore(active, holeIndex);
    const hasScore = raw !== null;
    const score = hasScore ? raw : par; // 空洞默认 PAR，便于直接录入
    const putt = (groups[active] && (groups[active].putts || [])[holeIndex]) || 2;
    const fairway = resolveHoleFairway(groups[active] && groups[active].fairways, holeIndex);
    const penalty = resolveHolePenalty(groups[active] && groups[active].penalties, holeIndex);
    const sand = resolveHoleSand(groups[active] && groups[active].sands, holeIndex);

    this.setData({
      activePlayerIdx: active,
      sheetHoleLabel: label,
      sheetHoleIndex: holeIndex,
      sheetPar: par,
      panelScore: score,
      panelPutt: putt,
      panelPuttTouched: hasScore,
      panelFairway: fairway,
      panelPenalty: penalty,
      panelBunker: sand,
      // 记分控件数量 = 组数（每组一个快捷控件）；UI 结构不变
      quickPanelScores: this._quickDefaultsForHole(holeIndex, par),
      showScoreSheet: true
    }, () => {
      this.syncSheetPlayers();
      setTimeout(() => this.setData({ scoreSheetOpen: true }), 30);
    });
  },

  /** 仅收起面板（确认保存后用）；不回滚进入时快照 */
  _hideScoreSheet() {
    this.setData({
      scoreSheetOpen: false,
      scoreClearDraft: false,
      scoreHoleClearPending: false,
      quickScoreClearDraft: false,
      quickScoreFreshDraft: false
    });
    setTimeout(() => this.setData({ showScoreSheet: false }), 300);
  },

  /** 遮罩关闭：恢复进入弹窗前面板状态，不写正式成绩 */
  closeScoreInput() {
    // G6/G7/G8：回滚 _matchSidesSource 快照（不碰 Entity / scoresByPlayer）
    if (this._isG678MatchPlaySideScoring()) {
      const snap = this._scoreSheetEntrySnapshot;
      const patch = {
        scoreSheetOpen: false,
        scoreClearDraft: false,
        scoreHoleClearPending: false,
        quickScoreClearDraft: false,
        quickScoreFreshDraft: false
      };
      if (snap) {
        if (Array.isArray(snap.matchSidesSource)) {
          this._matchSidesSource = this._cloneMatchSidesSourceSnapshot(snap.matchSidesSource);
        }
        if (snap.activeSideIndex != null) {
          patch.activeSideIndex = snap.activeSideIndex;
        }
        patch.sheetHoleLabel = snap.sheetHoleLabel;
        patch.sheetHoleIndex = snap.sheetHoleIndex;
        patch.sheetPar = snap.sheetPar;
        patch.panelScore = snap.panelScore;
        patch.panelPutt = snap.panelPutt;
        patch.panelPuttTouched = snap.panelPuttTouched;
        patch.panelFairway = snap.panelFairway;
        patch.panelPenalty = snap.panelPenalty;
        patch.panelBunker = snap.panelBunker;
        if (Array.isArray(snap.quickPanelScores)) {
          patch.quickPanelScores = snap.quickPanelScores.slice();
        }
      }
      this.setData(patch);
      this.refreshPlayers();
      setTimeout(() => this.setData({ showScoreSheet: false }), 300);
      return;
    }

    // Stroke Entity：回滚面板草稿 + _entitiesSource 快照（不碰 _playersSource / activePlayerIdx）
    if (this.data.mode === 'stroke_entity') {
      const snap = this._scoreSheetEntrySnapshot;
      const patch = {
        scoreSheetOpen: false,
        scoreClearDraft: false,
        scoreHoleClearPending: false,
        quickScoreClearDraft: false,
        quickScoreFreshDraft: false
      };
      if (snap) {
        if (Array.isArray(snap.entitiesSource)) {
          this._entitiesSource = this._cloneEntitiesSourceSnapshot(snap.entitiesSource);
        }
        if (snap.activeEntityIndex != null) {
          patch.activeEntityIndex = snap.activeEntityIndex;
        }
        patch.sheetHoleLabel = snap.sheetHoleLabel;
        patch.sheetHoleIndex = snap.sheetHoleIndex;
        patch.sheetPar = snap.sheetPar;
        patch.panelScore = snap.panelScore;
        patch.panelPutt = snap.panelPutt;
        patch.panelPuttTouched = snap.panelPuttTouched;
        patch.panelFairway = snap.panelFairway;
        patch.panelPenalty = snap.panelPenalty;
        patch.panelBunker = snap.panelBunker;
        if (Array.isArray(snap.quickPanelScores)) {
          patch.quickPanelScores = snap.quickPanelScores.slice();
        }
      }
      this.setData(patch);
      this.refreshEntities();
      setTimeout(() => this.setData({ showScoreSheet: false }), 300);
      return;
    }

    const snap = this._scoreSheetEntrySnapshot;
    const patch = {
      scoreSheetOpen: false,
      scoreClearDraft: false,
      scoreHoleClearPending: false,
      quickScoreClearDraft: false,
      quickScoreFreshDraft: false
    };
    if (snap && this.data.mode !== 'fourball_best') {
      patch.activePlayerIdx = snap.activePlayerIdx;
      patch.sheetHoleLabel = snap.sheetHoleLabel;
      patch.sheetHoleIndex = snap.sheetHoleIndex;
      patch.sheetPar = snap.sheetPar;
      patch.panelScore = snap.panelScore;
      patch.panelPutt = snap.panelPutt;
      patch.panelPuttTouched = snap.panelPuttTouched;
      patch.panelFairway = snap.panelFairway;
      patch.panelPenalty = snap.panelPenalty;
      patch.panelBunker = snap.panelBunker;
      if (Array.isArray(snap.quickPanelScores)) {
        patch.quickPanelScores = snap.quickPanelScores.slice();
      }
    }
    this.setData(patch);
    setTimeout(() => this.setData({ showScoreSheet: false }), 300);
  },

  /** 深拷贝 _entitiesSource（供面板打开快照 / 取消回滚） */
  _cloneEntitiesSourceSnapshot(list) {
    return (list || []).map((entity) => {
      if (!entity || typeof entity !== 'object') return entity;
      return {
        entityId: entity.entityId,
        entityType: entity.entityType,
        members: Array.isArray(entity.members) ? entity.members.slice() : [],
        compositionMode: entity.compositionMode,
        teamGroupId: entity.teamGroupId,
        scores: Array.isArray(entity.scores) ? entity.scores.slice() : [],
        putts: Array.isArray(entity.putts) ? entity.putts.slice() : [],
        fairways: Array.isArray(entity.fairways) ? entity.fairways.slice() : [],
        penalties: Array.isArray(entity.penalties) ? entity.penalties.slice() : [],
        sands: Array.isArray(entity.sands) ? entity.sands.slice() : []
      };
    });
  },

  /** 本洞全组清空写入 _playersSource（仅确认路径调用） */
  _clearHoleScoresInPlayersSource(holeIndex) {
    (this._playersSource || []).forEach((p) => {
      if (!p) return;
      p.scores = p.scores || [];
      p.putts = p.putts || [];
      p.fairways = p.fairways || [];
      p.penalties = p.penalties || [];
      p.sands = p.sands || [];
      p.scores[holeIndex] = null;
      p.putts[holeIndex] = null;
      p.fairways[holeIndex] = null;
      p.penalties[holeIndex] = 0;
      p.sands[holeIndex] = 0;
    });
  },

  /** Stroke Entity：本洞全部 Entity 清空写入 _entitiesSource（不碰 _playersSource，不 splice） */
  _clearHoleScoresInEntitiesSource(holeIndex) {
    const hi = Number(holeIndex);
    if (!Number.isFinite(hi) || hi < 0 || hi > 17) return;
    (this._entitiesSource || []).forEach((entity) => {
      if (!entity) return;
      entity.scores = Array.isArray(entity.scores) ? entity.scores : [];
      entity.putts = Array.isArray(entity.putts) ? entity.putts : [];
      entity.fairways = Array.isArray(entity.fairways) ? entity.fairways : [];
      entity.penalties = Array.isArray(entity.penalties) ? entity.penalties : [];
      entity.sands = Array.isArray(entity.sands) ? entity.sands : [];
      while (entity.scores.length < 18) entity.scores.push(null);
      while (entity.putts.length < 18) entity.putts.push(null);
      while (entity.fairways.length < 18) entity.fairways.push(null);
      while (entity.penalties.length < 18) entity.penalties.push(0);
      while (entity.sands.length < 18) entity.sands.push(0);
      entity.scores[hi] = null;
      entity.putts[hi] = null;
      entity.fairways[hi] = null;
      entity.penalties[hi] = 0;
      entity.sands[hi] = 0;
    });
  },

  /** fourball_best：本洞全部组合清空写入 _engineGroups（不碰 _playersSource） */
  _clearHoleScoresInEngineGroups(holeIndex) {
    const hi = Number(holeIndex);
    if (!Number.isFinite(hi) || hi < 0 || hi > 17) return;
    (this._engineGroups || []).forEach((g) => {
      if (!g) return;
      g.scores = Array.isArray(g.scores) ? g.scores : [];
      g.putts = Array.isArray(g.putts) ? g.putts : [];
      g.fairways = Array.isArray(g.fairways) ? g.fairways : [];
      g.penalties = Array.isArray(g.penalties) ? g.penalties : [];
      g.sands = Array.isArray(g.sands) ? g.sands : [];
      while (g.scores.length < 18) g.scores.push(null);
      while (g.putts.length < 18) g.putts.push(null);
      while (g.fairways.length < 18) g.fairways.push(null);
      while (g.penalties.length < 18) g.penalties.push(0);
      while (g.sands.length < 18) g.sands.push(0);
      g.scores[hi] = null;
      g.putts[hi] = null;
      g.fairways[hi] = null;
      g.penalties[hi] = 0;
      g.sands[hi] = 0;
    });
  },

  /**
   * 普通单组技术面板：清除当前洞草稿 UI（不写 _playersSource / 不 persist）
   * 快捷面板：独立清除显示状态（头像旁成绩格全空，不关弹窗、不改正式成绩）
   * fourball_best：对齐个人比杆 — 清除草稿 UI，确认后才落盘（清除 ≠ 关闭）
   * stroke_entity：清洞正式成绩 + 落盘 + 关面板（不改 activePlayerIdx）
   */
  clearScoreInput() {
    if (this._scoreEditBlocked()) return;
    if (this.data.mode === 'stroke_entity') {
      const holeIndex = this.data.sheetHoleIndex;
      const par = this.data.sheetPar;
      this._clearHoleScoresInEntitiesSource(holeIndex);
      this.setData({
        panelScore: par,
        panelPutt: 2,
        panelPuttTouched: false,
        panelFairway: FAIRWAY_FAIRWAY,
        panelPenalty: 0,
        panelBunker: 0,
        scoreClearDraft: false,
        scoreHoleClearPending: false,
        quickScoreClearDraft: false,
        quickScoreFreshDraft: false
      });
      this.refreshEntities();
      this.persistSession();
      this._hideScoreSheet();
      return;
    }
    // G6/G7/G8：清除草稿 UI（确认后才落盘）；快捷=侧栏清空显示
    if (this._isG678MatchPlaySideScoring()) {
      if (this.data.scorePanelMode === 'quick') {
        this.setData({ quickScoreClearDraft: true }, () => this.syncSheetPlayers());
        return;
      }
      const par = this.data.sheetPar;
      this.setData({
        scoreClearDraft: true,
        scoreHoleClearPending: true,
        activeSideIndex: -1,
        panelScore: par,
        panelPutt: 2,
        panelPuttTouched: false,
        panelFairway: FAIRWAY_FAIRWAY,
        panelPenalty: 0,
        panelBunker: 0
      }, () => this.syncSheetPlayers());
      return;
    }
    // fourball_best：对齐个人比杆清除草稿（不关面板、不立刻 persist）
    if (this.data.mode === 'fourball_best') {
      if (this.data.scorePanelMode === 'quick') {
        this.setData({ quickScoreClearDraft: true }, () => this.syncSheetPlayers());
        return;
      }
      const par = this.data.sheetPar;
      this.setData({
        scoreClearDraft: true,
        scoreHoleClearPending: true,
        activePlayerIdx: -1,
        panelScore: par,
        panelPutt: 2,
        panelPuttTouched: false,
        panelFairway: FAIRWAY_FAIRWAY,
        panelPenalty: 0,
        panelBunker: 0
      }, () => this.syncSheetPlayers());
      return;
    }
    if (this.data.scorePanelMode === 'quick') {
      this.setData({ quickScoreClearDraft: true }, () => this.syncSheetPlayers());
      return;
    }
    const par = this.data.sheetPar;
    this.setData({
      scoreClearDraft: true,
      scoreHoleClearPending: true,
      activePlayerIdx: -1,
      panelScore: par,
      panelPutt: 2,
      panelPuttTouched: false,
      panelFairway: FAIRWAY_FAIRWAY,
      panelPenalty: 0,
      panelBunker: 0
    }, () => this.syncSheetPlayers());
  },

  // 快捷面板：本洞各记分实体默认成绩（已填取原值，空洞默认 PAR）。
  // fourball_best → groups；stroke_entity → _entitiesSource；G6/G7/G8 → _matchSidesSource；其余 → _playersSource。
  _quickDefaultsForHole(holeIndex, par) {
    let src;
    if (this.data.mode === 'fourball_best') {
      src = this._engineGroups || [];
    } else if (this.data.mode === 'stroke_entity') {
      src = this._entitiesSource || [];
    } else if (this._isG678MatchPlaySideScoring()) {
      src = this._matchSidesSource || [];
    } else {
      src = this._playersSource || [];
    }
    return src.map((p) => {
      const s = (p.scores || [])[holeIndex];
      return s === null || s === undefined || s === '' ? par : s;
    });
  },

  switchScorePanelMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode !== 'quick' && mode !== 'tech') return;
    const patch = { scorePanelMode: mode, quickScoreClearDraft: false, quickScoreFreshDraft: false };
    // 切换到快捷面板时：本洞全组默认 PAR（仅 quick 分支）
    if (mode === 'quick') {
      patch.quickPanelScores = this._quickDefaultsForHole(this.data.sheetHoleIndex, this.data.sheetPar);
    }
    // 记忆用户的记分方式偏好（与 scoreDisplayMode 相互独立）
    try {
      wx.setStorageSync(this._inputModeKey(), mode === 'quick' ? 'quick' : 'technical');
    } catch (err) {}
    this.setData(patch, () => this.syncSheetPlayers());
  },

  onSheetPlayerTap(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    // Stroke Entity：侧栏切换走 activeEntityIndex，禁止落入 _focusSheetPlayer
    if (this.data.mode === 'stroke_entity') {
      if (this.data.scorePanelMode === 'quick') {
        if (!this.data.quickScoreClearDraft) return;
        this._resumeQuickEditAfterClearEntity(idx);
        return;
      }
      this._focusSheetEntity(idx);
      return;
    }
    // G6/G7/G8：侧栏仅 Side A / B
    if (this._isG678MatchPlaySideScoring()) {
      if (this.data.scorePanelMode === 'quick') {
        if (!this.data.quickScoreClearDraft) return;
        this._resumeQuickEditAfterClearSide(idx);
        return;
      }
      this._focusSheetSide(idx);
      return;
    }
    // fourball_best：组侧栏（快捷清除恢复走 groups，禁止落入个人 _playersSource）
    if (this.data.mode === 'fourball_best') {
      if (this.data.scorePanelMode === 'quick') {
        if (!this.data.quickScoreClearDraft) return;
        this._resumeQuickEditAfterClearGroup(idx);
        return;
      }
      this._focusSheetGroup(idx);
      return;
    }
    // 快捷清除草稿中：点头像退出清除 → 本洞默认 PAR 草稿（不恢复清除前正式分）
    if (this.data.scorePanelMode === 'quick') {
      if (!this.data.quickScoreClearDraft) return;
      this._resumeQuickEditAfterClear(idx);
      return;
    }
    this._focusSheetPlayer(idx);
  },

  /** 快捷清除显示中点 Side：退出清除 UI，仅恢复面板草稿 */
  _resumeQuickEditAfterClearSide(sideIdx) {
    if (!this._isG678MatchPlaySideScoring()) return;
    const par = this.data.sheetPar;
    const sides = this._matchSidesSource || [];
    const quick = sides.map(() => par);
    this.setData({
      quickScoreClearDraft: false,
      quickScoreFreshDraft: true,
      activeSideIndex: sideIdx,
      panelScore: par,
      panelPutt: 2,
      panelPuttTouched: false,
      panelFairway: FAIRWAY_FAIRWAY,
      panelPenalty: 0,
      panelBunker: 0,
      quickPanelScores: quick
    }, () => this.syncSheetPlayers());
  },

  /** 快捷清除显示中点 Entity：退出清除 UI，仅恢复面板草稿（不写正式成绩） */
  _resumeQuickEditAfterClearEntity(entityIdx) {
    if (this.data.mode !== 'stroke_entity') return;
    const par = this.data.sheetPar;
    const entities = this._entitiesSource || [];
    const quick = entities.map(() => par);
    this.setData({
      quickScoreClearDraft: false,
      quickScoreFreshDraft: true,
      activeEntityIndex: entityIdx,
      panelScore: par,
      panelPutt: 2,
      panelPuttTouched: false,
      panelFairway: FAIRWAY_FAIRWAY,
      panelPenalty: 0,
      panelBunker: 0,
      quickPanelScores: quick
    }, () => this.syncSheetPlayers());
  },

  /** 快捷清除显示中点组合：退出清除 UI，仅恢复面板草稿（不写 _engineGroups） */
  _resumeQuickEditAfterClearGroup(groupIdx) {
    if (this.data.mode !== 'fourball_best') return;
    const par = this.data.sheetPar;
    const groups = this._engineGroups || [];
    const quick = groups.map(() => par);
    this.setData({
      quickScoreClearDraft: false,
      quickScoreFreshDraft: true,
      activePlayerIdx: groupIdx,
      panelScore: par,
      panelPutt: 2,
      panelPuttTouched: false,
      panelFairway: FAIRWAY_FAIRWAY,
      panelPenalty: 0,
      panelBunker: 0,
      quickPanelScores: quick
    }, () => this.syncSheetPlayers());
  },

  /** 快捷清除显示中点球员：退出清除 UI，仅恢复面板草稿（不写 _playersSource） */
  _resumeQuickEditAfterClear(playerIdx) {
    const par = this.data.sheetPar;
    const quick = (this._playersSource || []).map(() => par);
    this.setData({
      quickScoreClearDraft: false,
      quickScoreFreshDraft: true,
      activePlayerIdx: playerIdx,
      panelScore: par,
      panelPutt: 2,
      panelPuttTouched: false,
      panelFairway: FAIRWAY_FAIRWAY,
      panelPenalty: 0,
      panelBunker: 0,
      quickPanelScores: quick
    }, () => this.syncSheetPlayers());
  },

  // 技术面板：聚焦到指定组（载入其本洞成绩/推杆），保持面板打开
  _focusSheetGroup(gi) {
    const holeIndex = this.data.sheetHoleIndex;
    const par = this.data.sheetPar;
    const g = (this._engineGroups || [])[gi];
    if (!g) return;
    // 清除待确认：不回填旧正式成绩，控件用默认值（对齐 _focusSheetPlayer）
    if (this.data.scoreHoleClearPending) {
      this.setData({
        scoreClearDraft: false,
        activePlayerIdx: gi,
        panelScore: par,
        panelPutt: 2,
        panelPuttTouched: false,
        panelFairway: FAIRWAY_FAIRWAY,
        panelPenalty: 0,
        panelBunker: 0
      }, () => this.syncSheetPlayers());
      return;
    }
    const raw = (g.scores || [])[holeIndex];
    const hasScore = isFilledScore(raw);
    const score = hasScore ? raw : par;
    const putt = (g.putts || [])[holeIndex] || 2;
    const fairway = resolveHoleFairway(g.fairways, holeIndex);
    const penalty = resolveHolePenalty(g.penalties, holeIndex);
    const sand = resolveHoleSand(g.sands, holeIndex);
    this.setData({
      scoreClearDraft: false,
      activePlayerIdx: gi,
      panelScore: score,
      panelPutt: putt,
      panelPuttTouched: hasScore,
      panelFairway: fairway,
      panelPenalty: penalty,
      panelBunker: sand
    }, () => this.syncSheetPlayers());
  },

  // 技术面板智能默认推杆：score-par <= -1（小鸟或更好）→ 1，否则 → 2
  _autoPutts(score, par) {
    return (score - par) <= -1 ? 1 : 2;
  },

  /** 开球方向三选一 */
  selectPanelFairway(e) {
    if (this._scoreEditBlocked()) return;
    const value = normalizeFairwayValue(e.currentTarget.dataset.value);
    this.setData({ panelFairway: value });
  },

  adjustSheetVal(e) {
    if (this._scoreEditBlocked()) return;
    const type = e.currentTarget.dataset.type;
    const delta = Number(e.currentTarget.dataset.delta);
    const key = type === 'score' ? 'panelScore' : type === 'putt' ? 'panelPutt' : type === 'penalty' ? 'panelPenalty' : 'panelBunker';
    const val = Math.max(0, (this.data[key] || 0) + delta);
    const patch = { [key]: val };
    if (type === 'putt') {
      // 用户手动修改推杆 → 优先级最高，之后不再被自动值覆盖
      patch.panelPuttTouched = true;
    } else if (type === 'score' && !this.data.panelPuttTouched) {
      // 成绩变化且推杆未被手动修改 → 写入智能默认推杆（仅作默认值）
      patch.panelPutt = this._autoPutts(val, this.data.sheetPar);
    }
    // 成绩变化需刷新面板主数字显示（杆差模式下显示换算后的杆差）
    this.setData(patch, () => {
      if (type === 'score') this.syncSheetPlayers();
    });
  },

  adjustQuickPanelScore(e) {
    if (this._scoreEditBlocked()) return;
    const idx = Number(e.currentTarget.dataset.idx);
    const delta = Number(e.currentTarget.dataset.delta);
    const quick = this.data.quickPanelScores.slice();
    quick[idx] = Math.max(1, (quick[idx] || this.data.sheetPar) + delta);
    this.setData({ quickPanelScores: quick, quickScoreClearDraft: false }, () => this.syncSheetPlayers());
  },

  confirmScoreInput() {
    if (this._scoreEditBlocked()) return;
    // Stroke Entity：早分流，禁止落入 confirmQuickScore / _playersSource
    if (this.data.mode === 'stroke_entity') {
      return this.confirmEntityScoreInput();
    }
    // G6/G7/G8 比洞 Side：写 scoresBySide，禁止 scoresByPlayer / Entity
    if (this._isG678MatchPlaySideScoring()) {
      return this.confirmMatchSideScoreInput();
    }
    // 四人最佳球位 / 最好成绩：只写入一个团队成绩到当前洞（不生成球员级成绩、不拆分球员）
    if (this.data.mode === 'fourball_best') {
      this.confirmTeamScore();
      return;
    }
    // 快捷面板：清除草稿确认 → 整组本洞清空；否则一键写入全组（默认 PAR）
    if (this.data.scorePanelMode === 'quick') {
      if (this.data.quickScoreClearDraft) {
        const holeIndex = this.data.sheetHoleIndex;
        this._clearHoleScoresInPlayersSource(holeIndex);
        this.setData({ quickScoreClearDraft: false });
        this.refreshPlayers();
        this.persistSession();
        this._hideScoreSheet();
        this._afterScoresPersisted();
        return;
      }
      this.confirmQuickScore();
      return;
    }

    // ===== 技术面板：逐人录入，全部记录完才允许关闭 =====
    const {
      activePlayerIdx,
      sheetHoleIndex,
      panelScore,
      panelPutt,
      panelFairway,
      panelPenalty,
      panelBunker,
      sheetPar,
      scoreClearDraft,
      scoreHoleClearPending
    } = this.data;

    // 清除草稿确认（未选人）：整组本洞清空 → 原 persistSession
    if (scoreClearDraft) {
      this._clearHoleScoresInPlayersSource(sheetHoleIndex);
      this.setData({ scoreClearDraft: false, scoreHoleClearPending: false });
      this.refreshPlayers();
      this.persistSession();
      this._hideScoreSheet();
      this._afterScoresPersisted();
      return;
    }

    if (activePlayerIdx == null || activePlayerIdx < 0 || !this._playersSource[activePlayerIdx]) {
      return;
    }

    // 清除待确认 + 已选球员：先整组清空，再写入当前球员面板值
    if (scoreHoleClearPending) {
      this._clearHoleScoresInPlayersSource(sheetHoleIndex);
    }

    let newScore = panelScore;
    if (newScore === null || newScore === undefined || newScore === '') {
      newScore = sheetPar;
    }
    // 1) 写入当前球员本地 state（成绩 / 推杆 / 开球方向 / 罚杆 / 沙坑）
    const src = this._playersSource[activePlayerIdx];
    src.scores[sheetHoleIndex] = newScore;
    if (panelPutt !== null && panelPutt !== undefined && panelPutt !== '') {
      src.putts = src.putts || [];
      src.putts[sheetHoleIndex] = panelPutt;
    }
    src.fairways = src.fairways || [];
    src.fairways[sheetHoleIndex] = normalizeFairwayValue(panelFairway);
    src.penalties = src.penalties || [];
    src.penalties[sheetHoleIndex] = normalizePenaltyValue(panelPenalty);
    src.sands = src.sands || [];
    src.sands[sheetHoleIndex] = normalizeSandValue(panelBunker);
    this.setData({ scoreHoleClearPending: false, scoreClearDraft: false });
    // 2) 由本地 state 即时派生 UI（OUT / IN / TOT / 杆差）
    this.refreshPlayers();
    // 3) 会话内本地留存，离开再进入不丢失
    this.persistSession();

    // 4) 查找本洞是否还有未记录成绩的球员
    const next = this._playersSource.findIndex(
      (p) => !isFilledScore((p.scores || [])[sheetHoleIndex])
    );
    if (next !== -1) {
      // 存在未记录球员：自动切换到该球员，不关闭面板
      this._focusSheetPlayer(next);
    } else {
      // 全部球员均已记录：才允许关闭
      this._hideScoreSheet();
      this._afterScoresPersisted();
    }
  },

  /**
   * Patch-02C2B2 / 02C2C2：Entity 确认入口（技术 / 快捷）
   * 禁止落入 confirmQuickScore / _playersSource
   */
  confirmEntityScoreInput() {
    if (this._scoreEditBlocked()) return;
    if (this.data.mode !== 'stroke_entity') return;

    if (this.data.scorePanelMode === 'quick') {
      if (this.data.quickScoreClearDraft) {
        const holeIndex = this.data.sheetHoleIndex;
        this._clearHoleScoresInEntitiesSource(holeIndex);
        this.setData({ quickScoreClearDraft: false });
        this.refreshEntities();
        this.persistSession();
        this._hideScoreSheet();
        return;
      }
      return this.confirmEntityQuickScore();
    }

    const {
      activeEntityIndex,
      sheetHoleIndex,
      panelScore,
      panelPutt,
      panelFairway,
      panelPenalty,
      panelBunker,
      sheetPar,
      scoreClearDraft,
      scoreHoleClearPending
    } = this.data;

    if (scoreClearDraft) {
      this._clearHoleScoresInEntitiesSource(sheetHoleIndex);
      this.setData({ scoreClearDraft: false, scoreHoleClearPending: false });
      this.refreshEntities();
      this.persistSession();
      this._hideScoreSheet();
      return;
    }

    const eIdx = Number(activeEntityIndex);
    const entity =
      Number.isFinite(eIdx) && eIdx >= 0 && this._entitiesSource
        ? this._entitiesSource[eIdx]
        : null;
    if (!entity) return;

    if (scoreHoleClearPending) {
      this._clearHoleScoresInEntitiesSource(sheetHoleIndex);
    }

    let newScore = panelScore;
    if (newScore === null || newScore === undefined || newScore === '') {
      newScore = sheetPar;
    }

    entity.scores = entity.scores || [];
    entity.putts = entity.putts || [];
    entity.fairways = entity.fairways || [];
    entity.penalties = entity.penalties || [];
    entity.sands = entity.sands || [];

    entity.scores[sheetHoleIndex] = newScore;
    if (panelPutt !== null && panelPutt !== undefined && panelPutt !== '') {
      entity.putts[sheetHoleIndex] = panelPutt;
    }
    entity.fairways[sheetHoleIndex] = normalizeFairwayValue(panelFairway);
    entity.penalties[sheetHoleIndex] = normalizePenaltyValue(panelPenalty);
    entity.sands[sheetHoleIndex] = normalizeSandValue(panelBunker);

    this.setData({ scoreHoleClearPending: false, scoreClearDraft: false });
    this.refreshEntities();
    this.persistSession();

    // 技术面板：对齐 G1 — 本洞还有未填 entity 则切换并保持面板；全部填完才关闭
    const next = (this._entitiesSource || []).findIndex(
      (ent) => !isFilledScore((ent && ent.scores ? ent.scores : [])[sheetHoleIndex])
    );
    if (next !== -1) {
      this._focusSheetEntity(next);
    } else {
      this._hideScoreSheet();
    }
  },

  /**
   * Patch-02C2C2：Entity 快捷确认 → 按 quickPanelScores 写满本洞全部 Entity
   */
  confirmEntityQuickScore() {
    if (this._scoreEditBlocked()) return;
    if (this.data.mode !== 'stroke_entity') return;

    const { sheetHoleIndex, sheetPar, quickPanelScores } = this.data;
    const entities = this._entitiesSource || [];
    const quick = quickPanelScores || [];

    entities.forEach((entity, i) => {
      if (!entity) return;
      let s = quick[i];
      if (s === null || s === undefined || s === '') s = sheetPar;
      const diff = s - sheetPar;
      entity.scores = entity.scores || [];
      entity.putts = entity.putts || [];
      entity.fairways = entity.fairways || [];
      entity.penalties = entity.penalties || [];
      entity.sands = entity.sands || [];
      while (entity.scores.length < 18) entity.scores.push(null);
      while (entity.putts.length < 18) entity.putts.push(null);
      while (entity.fairways.length < 18) entity.fairways.push(null);
      while (entity.penalties.length < 18) entity.penalties.push(0);
      while (entity.sands.length < 18) entity.sands.push(0);
      entity.scores[sheetHoleIndex] = s;
      entity.putts[sheetHoleIndex] = diff < 0 ? 1 : 2;
      if (entity.fairways[sheetHoleIndex] == null || entity.fairways[sheetHoleIndex] === '') {
        entity.fairways[sheetHoleIndex] = FAIRWAY_FAIRWAY;
      }
      if (entity.penalties[sheetHoleIndex] == null || entity.penalties[sheetHoleIndex] === '') {
        entity.penalties[sheetHoleIndex] = 0;
      }
      if (entity.sands[sheetHoleIndex] == null || entity.sands[sheetHoleIndex] === '') {
        entity.sands[sheetHoleIndex] = 0;
      }
    });

    this.setData({ quickScoreClearDraft: false, quickScoreFreshDraft: false });
    this.refreshEntities();
    this.persistSession();
    this._hideScoreSheet();
  },

  // 四人最佳球位 / 最好成绩：每个记分实体（组）写入一个成绩；不拆分球员、不生成多值数组。
  // 清除确认：对齐个人比杆 — clear draft / quick clear → 清空本洞组合成绩后 persist。
  confirmTeamScore() {
    const {
      sheetHoleIndex,
      sheetPar,
      scorePanelMode,
      scoreClearDraft,
      scoreHoleClearPending,
      activePlayerIdx,
      quickScoreClearDraft
    } = this.data;
    const groups = this._engineGroups || [];

    if (scorePanelMode === 'quick') {
      if (quickScoreClearDraft) {
        this._clearHoleScoresInEngineGroups(sheetHoleIndex);
        this.setData({ quickScoreClearDraft: false, quickScoreFreshDraft: false });
        this._persistAndRefreshTeamBoard();
        this.closeScoreInput();
        this._afterScoresPersisted();
        return;
      }
      // 快捷面板：按组数一次写入各组本洞成绩
      const quick = this.data.quickPanelScores || [];
      groups.forEach((g, gi) => {
        let s = quick[gi];
        if (!isFilledScore(s)) s = sheetPar;
        g.scores[sheetHoleIndex] = s;
        if (!isFilledScore((g.putts || [])[sheetHoleIndex])) {
          g.putts = g.putts || [];
          g.putts[sheetHoleIndex] = this._autoPutts(s, sheetPar);
        }
      });
      this._finalizeTeamHole();
      return;
    }

    // 清除草稿确认（未选组）：本洞全部组合成绩清空 → persist
    if (scoreClearDraft) {
      this._clearHoleScoresInEngineGroups(sheetHoleIndex);
      this.setData({ scoreClearDraft: false, scoreHoleClearPending: false });
      this._persistAndRefreshTeamBoard();
      this.closeScoreInput();
      this._afterScoresPersisted();
      return;
    }

    const gi = activePlayerIdx;
    const g = groups[gi];
    if (!g) return;

    // 清除待确认 + 已选组：先整组清空，再写入当前组面板值
    if (scoreHoleClearPending) {
      this._clearHoleScoresInEngineGroups(sheetHoleIndex);
    }

    // 技术面板：写入当前组，未填组自动切换，全部填完才关闭
    let newScore = this.data.panelScore;
    if (!isFilledScore(newScore)) newScore = sheetPar;
    g.scores[sheetHoleIndex] = newScore;
    if (isFilledScore(this.data.panelPutt)) {
      g.putts = g.putts || [];
      g.putts[sheetHoleIndex] = this.data.panelPutt;
    }
    g.fairways = g.fairways || [];
    g.fairways[sheetHoleIndex] = normalizeFairwayValue(this.data.panelFairway);
    g.penalties = g.penalties || [];
    g.penalties[sheetHoleIndex] = normalizePenaltyValue(this.data.panelPenalty);
    g.sands = g.sands || [];
    g.sands[sheetHoleIndex] = normalizeSandValue(this.data.panelBunker);

    this.setData({ scoreHoleClearPending: false, scoreClearDraft: false });
    this._persistAndRefreshTeamBoard();

    const next = groups.findIndex((gr) => !isFilledScore((gr.scores || [])[sheetHoleIndex]));
    if (next !== -1) {
      this._focusSheetGroup(next);
    } else {
      this.closeScoreInput();
      this._afterScoresPersisted();
    }
  },

  // 各组本洞成绩写完后：派生球队记分行 + 持久化
  _finalizeTeamHole() {
    this._persistAndRefreshTeamBoard();
    this.closeScoreInput();
    this._afterScoresPersisted();
  },

  /**
   * fourball_best 确认后落盘 + 看板刷新。
   * 4+0 / 3+0 / 3+1（isFourball40StrokeShell，含 3+1）：persist → refreshPlayers → playersView
   * 2+2 等：保持原 refreshTeamColumns → persist
   */
  _persistAndRefreshTeamBoard() {
    if (this.data.isFourball40StrokeShell) {
      this._persistTeamScores();
      this.refreshPlayers();
      return;
    }
    this.refreshTeamColumns();
    this._persistTeamScores();
  },

  // 重建按组记分行（每组一行）+ 兼容字段（best across groups）
  refreshTeamColumns() {
    const displayMode = this.data.scoreDisplayMode;
    const team = this._teamBestColumns(displayMode);
    const bestTeams = this._buildBestTeams(displayMode);
    this.setData({
      bestTeams: bestTeams,
      fourballRowsView: this._buildFourballRowsView(bestTeams),
      bestColumns: team.columns,
      bestTeamDiffStr: team.teamDiffStr,
      bestTeamDiffClass: team.teamDiffClass
    });
  },

  // 持久化：各组成绩写回 matchState.groups[i].scores；球队逐洞最佳写入 matchState.scores（唯一数据源）
  _persistTeamScores() {
    const ms = matchState.getMatchState();
    if (!ms) return;
    const groups = this._engineGroups || [];
    if (Array.isArray(ms.groups)) {
      ms.groups = ms.groups.map((g, gi) => Object.assign({}, g, {
        scores: (groups[gi] && groups[gi].scores || []).slice(),
        putts: (groups[gi] && groups[gi].putts || []).slice()
      }));
    }
    ms.scores = this._teamBestScores().scores.slice();
    matchState.setMatchState(ms);
    if (this.data.gameId) {
      const gi = this._gameGroupIndex || 0;
      gameStore.setGroupTeamScores(this.data.gameId, gi, groups);
    }
  },

  /** 技术面板控件区焦点转移动画（打开/关面板/清除/切洞不调用） */
  _pulseTechPanelFocus() {
    if (this.data.scorePanelMode !== 'tech' || this.data.mode === 'fourball_best') return;
    if (this._techFocusPulseTimer) {
      clearTimeout(this._techFocusPulseTimer);
      this._techFocusPulseTimer = null;
    }
    // 先摘掉 class 再挂上，保证连续切换可重播
    this.setData({ techPanelFocusPulse: false }, () => {
      this.setData({ techPanelFocusPulse: true });
      this._techFocusPulseTimer = setTimeout(() => {
        this.setData({ techPanelFocusPulse: false });
        this._techFocusPulseTimer = null;
      }, 500);
    });
  },

  // 技术面板：聚焦到指定球员（载入其本洞成绩/推杆/开球方向/罚杆/沙坑），保持面板打开
  _focusSheetPlayer(idx) {
    const holeIndex = this.data.sheetHoleIndex;
    const par = this.data.sheetPar;
    const player = this.data.playersView[idx];
    if (!player) return;
    const switched = Number(this.data.activePlayerIdx) !== Number(idx);
    // 清除待确认：不回填旧正式成绩，控件用默认值
    if (this.data.scoreHoleClearPending) {
      this.setData({
        scoreClearDraft: false,
        activePlayerIdx: idx,
        panelScore: par,
        panelPutt: 2,
        panelPuttTouched: false,
        panelFairway: FAIRWAY_FAIRWAY,
        panelPenalty: 0,
        panelBunker: 0
      }, () => {
        this.syncSheetPlayers();
        if (switched) this._pulseTechPanelFocus();
      });
      return;
    }
    const raw = player.scores[holeIndex];
    const hasScore = isFilledScore(raw);
    const score = hasScore ? raw : par;
    const putt = player.putts[holeIndex] || 2;
    const fairway = resolveHoleFairway(player.fairways, holeIndex);
    const penalty = resolveHolePenalty(player.penalties, holeIndex);
    const sand = resolveHoleSand(player.sands, holeIndex);
    this.setData({
      scoreClearDraft: false,
      activePlayerIdx: idx,
      panelScore: score,
      panelPutt: putt,
      panelPuttTouched: hasScore,
      panelFairway: fairway,
      panelPenalty: penalty,
      panelBunker: sand
    }, () => {
      this.syncSheetPlayers();
      if (switched) this._pulseTechPanelFocus();
    });
  },

  /**
   * 技术面板：聚焦到指定 Entity（对称 _focusSheetPlayer）
   * 使用 activeEntityIndex + _entitiesSource，不碰 _playersSource / activePlayerIdx
   */
  _focusSheetEntity(idx) {
    if (this.data.mode !== 'stroke_entity') return;
    const holeIndex = this.data.sheetHoleIndex;
    const par = this.data.sheetPar;
    const entity = (this._entitiesSource || [])[idx];
    if (!entity) return;
    const switched = Number(this.data.activeEntityIndex) !== Number(idx);

    if (this.data.scoreHoleClearPending) {
      this.setData({
        scoreClearDraft: false,
        activeEntityIndex: idx,
        panelScore: par,
        panelPutt: 2,
        panelPuttTouched: false,
        panelFairway: FAIRWAY_FAIRWAY,
        panelPenalty: 0,
        panelBunker: 0
      }, () => {
        this.syncSheetPlayers();
        if (switched) this._pulseTechPanelFocus();
      });
      return;
    }

    const raw = Array.isArray(entity.scores) ? entity.scores[holeIndex] : null;
    const hasScore = isFilledScore(raw);
    const score = hasScore ? raw : par;
    const putt = (Array.isArray(entity.putts) && entity.putts[holeIndex]) || 2;
    const fairway = resolveHoleFairway(entity.fairways, holeIndex);
    const penalty = resolveHolePenalty(entity.penalties, holeIndex);
    const sand = resolveHoleSand(entity.sands, holeIndex);
    this.setData({
      scoreClearDraft: false,
      activeEntityIndex: idx,
      panelScore: score,
      panelPutt: putt,
      panelPuttTouched: hasScore,
      panelFairway: fairway,
      panelPenalty: penalty,
      panelBunker: sand
    }, () => {
      this.syncSheetPlayers();
      if (switched) this._pulseTechPanelFocus();
    });
  },

  // 快捷面板确认：遍历当前组全部球员 → 写入本洞 score 与规则 putts → 关闭
  // 规则：小鸟/老鹰(低于标准杆) putts=1；PAR/Bogey 及更差(不低于标准杆) putts=2
  confirmQuickScore() {
    const { sheetHoleIndex, sheetPar, quickPanelScores } = this.data;
    this._playersSource.forEach((p, i) => {
      let s = quickPanelScores[i];
      if (s === null || s === undefined || s === '') s = sheetPar;
      const diff = s - sheetPar;
      p.scores = p.scores || [];
      p.putts = p.putts || [];
      p.fairways = p.fairways || [];
      p.penalties = p.penalties || [];
      p.sands = p.sands || [];
      p.scores[sheetHoleIndex] = s;
      p.putts[sheetHoleIndex] = diff < 0 ? 1 : 2; // diff 由 score-par 推导，putts 按规则写入
      // 快捷录入未选手动方向：缺省 fairway；已有值保留
      if (p.fairways[sheetHoleIndex] == null || p.fairways[sheetHoleIndex] === '') {
        p.fairways[sheetHoleIndex] = FAIRWAY_FAIRWAY;
      }
      // 快捷录入未设罚杆：缺省 0；已有值保留
      if (p.penalties[sheetHoleIndex] == null || p.penalties[sheetHoleIndex] === '') {
        p.penalties[sheetHoleIndex] = 0;
      }
      // 快捷录入未设沙坑：缺省 0；已有值保留
      if (p.sands[sheetHoleIndex] == null || p.sands[sheetHoleIndex] === '') {
        p.sands[sheetHoleIndex] = 0;
      }
    });
    // 本洞 score/putts 写入后由 score engine 统一派生 diff 与 OUT/IN/TOT
    this.refreshPlayers();
    this.persistSession();
    this._hideScoreSheet();
    this._afterScoresPersisted();
  },

  sheetPrevHole() {
    const idx = this.data.sheetHoleIndex;
    if (idx <= 0) return;
    this._jumpSheetHole(idx - 1);
  },

  sheetNextHole() {
    const idx = this.data.sheetHoleIndex;
    if (idx >= 17) return;
    this._jumpSheetHole(idx + 1);
  },

  _jumpSheetHole(holeIndex) {
    const { activePlayerIdx, playersView, scoreClearDraft, scorePanelMode, activeSideIndex } = this.data;
    const par = holePars()[holeIndex];

    // G6/G7/G8：按 Side 切洞（列标签用 G5 18 洞）
    if (this._isG678MatchPlaySideScoring()) {
      const label =
        (this.data.columns[holeIndex] && this.data.columns[holeIndex].label) ||
        g5HoleColumnLabels()[holeIndex] ||
        String(holeIndex + 1);
      const side = (this._matchSidesSource || [])[activeSideIndex];
      if (
        scoreClearDraft ||
        activeSideIndex == null ||
        activeSideIndex < 0 ||
        !side
      ) {
        this.setData({
          sheetHoleLabel: label,
          sheetHoleIndex: holeIndex,
          sheetPar: par,
          panelScore: par,
          panelPutt: 2,
          panelPuttTouched: false,
          panelFairway: FAIRWAY_FAIRWAY,
          panelPenalty: 0,
          panelBunker: 0,
          quickScoreClearDraft: false,
          quickScoreFreshDraft: false,
          quickPanelScores: scorePanelMode === 'quick'
            ? this._quickDefaultsForHole(holeIndex, par)
            : this.data.quickPanelScores
        }, () => this.syncSheetPlayers());
        return;
      }
      this._padSideScoreArrays(side);
      const score = side.scores[holeIndex];
      const hasScore = isFilledScore(score);
      let quick = (this.data.quickPanelScores || []).slice();
      quick[activeSideIndex] = hasScore ? score : par;
      if (scorePanelMode === 'quick') {
        quick = this._quickDefaultsForHole(holeIndex, par);
      }
      this.setData({
        sheetHoleLabel: label,
        sheetHoleIndex: holeIndex,
        sheetPar: par,
        panelScore: hasScore ? score : par,
        panelPutt: side.putts[holeIndex] || 2,
        panelPuttTouched: hasScore,
        panelFairway: resolveHoleFairway(side.fairways, holeIndex),
        panelPenalty: resolveHolePenalty(side.penalties, holeIndex),
        panelBunker: resolveHoleSand(side.sands, holeIndex),
        quickScoreClearDraft: false,
        quickScoreFreshDraft: false,
        quickPanelScores: quick
      }, () => this.syncSheetPlayers());
      return;
    }

    const label = holePars().length && (holeIndex < 9 ? columnLabels()[holeIndex] : columnLabels()[holeIndex + 1]);
    // 清除草稿或无选中球员：只切洞，保持默认控件 / 空成绩栏
    if (scoreClearDraft || activePlayerIdx == null || activePlayerIdx < 0 || !playersView[activePlayerIdx]) {
      this.setData({
        sheetHoleLabel: label,
        sheetHoleIndex: holeIndex,
        sheetPar: par,
        panelScore: par,
        panelPutt: 2,
        panelPuttTouched: false,
        panelFairway: FAIRWAY_FAIRWAY,
        panelPenalty: 0,
        panelBunker: 0,
        quickScoreClearDraft: false,
        quickScoreFreshDraft: false,
        quickPanelScores: scorePanelMode === 'quick'
          ? this._quickDefaultsForHole(holeIndex, par)
          : this.data.quickPanelScores
      }, () => this.syncSheetPlayers());
      return;
    }
    const player = playersView[activePlayerIdx];
    const score = player.scores[holeIndex];
    const hasScore = isFilledScore(score);
    const putt = player.putts[holeIndex] || 2;
    const fairway = resolveHoleFairway(player.fairways, holeIndex);
    const penalty = resolveHolePenalty(player.penalties, holeIndex);
    const sand = resolveHoleSand(player.sands, holeIndex);
    let quick = this.data.quickPanelScores.slice();
    quick[activePlayerIdx] = score;
    // 快捷模式：切换洞时本洞全组默认 PAR（仅 quick 分支）
    if (scorePanelMode === 'quick') {
      quick = this._quickDefaultsForHole(holeIndex, par);
    }
    this.setData({
      sheetHoleLabel: label,
      sheetHoleIndex: holeIndex,
      sheetPar: par,
      panelScore: score,
      panelPutt: putt,
      panelPuttTouched: hasScore,
      panelFairway: fairway,
      panelPenalty: penalty,
      panelBunker: sand,
      quickScoreClearDraft: false,
      quickScoreFreshDraft: false,
      quickPanelScores: quick
    }, () => this.syncSheetPlayers());
  }
});
