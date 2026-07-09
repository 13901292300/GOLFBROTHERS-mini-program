/**
 * 记分页面 — 1:1 复刻 记分及添加删除页面汇总.html
 */

const { createHeaderStyle } = require('../../utils/headerEngine.js');
const groupsStore = require('../../utils/groupsStore.js');
const playerSlots = require('../../utils/playerSlots.js');
const { FRIEND_ID_SET } = require('../../utils/playerDirectory.js');
const gameStore = require('../../utils/gameStore.js');
const weatherService = require('../../utils/weatherService.js');
const matchState = require('../../utils/matchState.js');
const gameProgress = require('../../utils/gameProgress.js');
const matchStatus = require('../../utils/matchStatus.js');
const gameLifecycle = require('../../utils/gameLifecycle.js');
const halfCourseEdit = require('../../utils/halfCourseEdit.js');
const holeLayout = require('../../utils/holeLayout.js');
const mockAvatars = require('../../utils/mockAvatars.js');

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

// pair 行 swipe indent：头像重叠块几何（用于居中 gap 计算，仅 progress>0 时启用）
const PAIR_SWIPE_GEOM = {
  AVATAR_W: 72,
  AV1_LEFT: 24,
  AV2_LEFT: 128,
  SECOND_SHIFT_MAX: 68
};

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
  { icon: '🎨', label: '风格选择', bg: 'bg-pga-blue' },
  { icon: '💬', label: '反馈', bg: 'bg-pga-blue' },
  { icon: '⏻', label: '结束比赛', bg: 'bg-gold' }
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
  { icon: '🎨', label: '风格选择', bg: 'bg-pga-blue' },
  { icon: '💬', label: '反馈', bg: 'bg-pga-blue' }
];
const MORE_MENU_LEGACY_PLACEHOLDER = { empty: true, label: '__placeholder__' };
const MORE_MENU_ITEMS_LEGACY_FOOTER = [
  { icon: '✕', label: '取消比赛', bg: 'bg-red' },
  { icon: '⏻', label: '结束比赛', bg: 'bg-gold' }
];
const MORE_MENU_ITEMS_LEGACY = MORE_MENU_ITEMS_LEGACY_MAIN
  .concat([MORE_MENU_LEGACY_PLACEHOLDER])
  .concat(MORE_MENU_ITEMS_LEGACY_FOOTER);

/** 空位补位：人员来源选择（player-source-sheet 选项） */
const PLAYER_SOURCE_OPTIONS = [
  { key: 'friends', glyph: '👥', label: '好友列表', desc: '从我的好友中选择球员' },
  { key: 'combo', glyph: '⭐', label: '老牌组合', desc: '常用四人组 / 上次比赛组合' },
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
 * - 单组 → 完整面板（含修改比赛 / 取消比赛）
 * - 多组 → 缩减面板（管理功能由 Hub M 按钮承接）
 */
function resolveNormalGameMoreMenu(gameId, matchState) {
  const groupCount = resolveScorePageGroupCount(gameId, matchState);
  if (groupCount <= 1) {
    return { moreMenuItems: MORE_MENU_ITEMS_LEGACY.slice() };
  }
  return { moreMenuItems: MORE_MENU_ITEMS_COMPACT.slice() };
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

// 记分格右下角 diff 规则：负数带 -，正数不带符号，平标准杆显示 E
function formatCellDiff(diff) {
  if (diff === 0) return 'E';
  return String(diff);
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

// 四人最佳球位「球员名册条」T台配色（按槽位顺序分配，新增球员复用同一调色板）
const TEE_PALETTE = [
  { tee: '黑T', teeColor: '#dc2626' },
  { tee: '金T', teeColor: '#ce9224' },
  { tee: '白T', teeColor: '#ffffff' },
  { tee: '蓝T', teeColor: '#00aeef' }
];

// 由当前记分页面球员(_playersSource) 派生四人最佳球位名册条（唯一数据源，增删后随之刷新）
function buildBestRoster(players) {
  return (players || []).map((p, i) => {
    const tp = TEE_PALETTE[i % TEE_PALETTE.length];
    const shortName = p && p.name && p.name.indexOf('.') >= 0 ? p.name.split('.').pop().trim() : (p && p.name);
    return {
      playerId: (p && (p.playerId || p.id)) || ('seat-' + i),
      name: shortName || (p && p.name) || '球员',
      avatar: p && p.avatar,
      tee: tp.tee,
      teeColor: tp.teeColor
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
      // 右下角杆差：洞格在 diff 模式下隐藏（主数字已是杆差）；汇总列始终展示
      diffStr: isSpecial ? formatDiff(diff) : (displayMode === 'diff' ? '' : formatDiff(diff)),
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

// 成绩格是否已填（空洞保持空白，不计入任何汇总）
function isFilledScore(s) {
  return s !== null && s !== undefined && s !== '';
}

function enrichPlayer(player, pIdx, displayMode) {
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

    // 空洞：保持空白，不参与计算
    if (!isFilledScore(s)) {
      return {
        type: 'hole',
        colIdx,
        label,
        par,
        holeIndex: hi,
        score: '',
        mainStr: '',
        putts: '',
        diff: 0,
        diffStr: '',
        scoreClass: '',
        triangleClass: COLUMN_TRIANGLES[colIdx] ? COLUMN_TRIANGLES[colIdx][pIdx] : '',
        gameCornerRank: cornerRank(COLUMN_TRIANGLES[colIdx], pIdx),
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
      putts: p,
      diff,
      // 右下角杆差：杆差模式下隐藏（主数字已是杆差，避免重复）
      diffStr: displayMode === 'diff' ? '' : formatCellDiff(diff),
      scoreClass: scoreStyle(diff),
      triangleClass: COLUMN_TRIANGLES[colIdx] ? COLUMN_TRIANGLES[colIdx][pIdx] : '',
      gameCornerRank: cornerRank(COLUMN_TRIANGLES[colIdx], pIdx),
      diffClass: diff < 0 ? 'diff-under' : diff > 0 ? 'diff-over' : 'diff-even'
    };
  });

  const totalFilled = outFilled + inFilled;
  const relScore = outDiff + inDiff;

  return Object.assign({}, player, {
    avatar: mockAvatars.resolveAvatar(player.avatar, player.playerId || player.id || player.name),
    relScoreStr: totalFilled > 0 ? formatDiff(relScore) : '',
    relScore,
    relClass: relScore < 0 ? 'diff-under' : relScore === 0 ? 'diff-even' : '',
    cells
  });
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
    gameInfoOpen: false,
    gameInfoTop: 0,
    gameInfoMaxH: 600,
    gameGroupIndex: 0,
    gameFinished: false,
    scoresCompleted: false,
    showMoreSheet: false,
    halfSheetVisible: false,
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
    moreMenuItems: MORE_MENU_ITEMS_COMPACT,
    groupPlayers: GROUP_PLAYERS,
    // 占位：真正展示前由 openGroupManagePage() 用当前记分页面球员快照覆盖（唯一数据源）
    groupSlots: [],
    // 空位补位：仅一级底部动作弹窗（入口选择器）；好友/组合/手工均跳转独立页面
    addSheetVisible: false,
    playerSourceOptions: PLAYER_SOURCE_OPTIONS,

    activePlayerIdx: 0,
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
  },

  // formatType → 渲染模式（仅当 matchState.mode 缺省时的兜底推导）
  _modeForFormat(formatType) {
    if (formatType === 'best_score' || formatType === 'best_ball' || formatType === 'best_ball_4_0') {
      return 'fourball_best';
    }
    if (formatType === 'individual_stroke') return 'individual_stroke';
    return 'standard';
  },

  // 有 gameId 的普通球局必须走 game 模式，避免 formatType 兜底误用球队精简面板
  _resolvePageMode(ms) {
    if (!ms) return 'standard';
    const m = ms.mode;
    if (m === 'game' || m === 'fourball_best' || m === 'individual_stroke' || m === 'standard') {
      return m;
    }
    if (ms.gameId) return 'game';
    return this._modeForFormat(ms.formatType);
  },

  _resolveMoreMenuForCurrentContext() {
    const mode = this.data.mode;
    const ms = this._matchState || this._readMatchState();
    const gameId = this.data.gameId || (ms && ms.gameId) || '';

    // 普通球局记分页：优先按 gameStore 组数决定（单组必为完整面板，与 mode 无关）
    if (gameId && gameStore.getGame(gameId)) {
      return resolveNormalGameMoreMenu(gameId, ms);
    }

    if (mode === 'standard') return resolveMoreMenuPanels('standard');
    if (mode === 'individual_stroke') return resolveMoreMenuPanels('individual_stroke');
    if (mode === 'fourball_best') {
      const hasMatch = !!(ms && Array.isArray(ms.players) && ms.players.length);
      return resolveMoreMenuPanels('fourball_best', { hasRealMatch: hasMatch, groupCount: 1 });
    }
    if (mode === 'game') {
      return resolveMoreMenuPanels('game', { groupCount: 1 });
    }
    return { moreMenuItems: MORE_MENU_ITEMS_COMPACT.slice() };
  },

  _syncMoreMenuItems() {
    const panels = this._resolveMoreMenuForCurrentContext();
    if (panels && panels.moreMenuItems) {
      this.setData({ moreMenuItems: panels.moreMenuItems });
    }
  },

  // 标准模式：球员/球场全部来自 matchState（无球员时回退演示种子，仅用于首页原型卡片）
  initStandardFromMatchState(ms) {
    const players = (ms && ms.players) || [];
    this._playersSource = players.length
      ? players.map((p, i) => ({
          id: (p && (p.playerId || p.id)) || ('seat-' + i),
          playerId: (p && (p.playerId || p.id)) || ('seat-' + i),
          name: (p && p.name) || '球员',
          avatar: (p && p.avatar) || '',
          colorClass: GAME_COLOR_CLASSES[i % GAME_COLOR_CLASSES.length],
          scores: [],
          putts: []
        }))
      : PLAYER_SEEDS.map((p) => JSON.parse(JSON.stringify(p)));
    const course = (ms && ms.course) || {};
    const menuPanels = resolveMoreMenuPanels('standard');
    this.setData({
      mode: 'standard',
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

  // 赛制 → 第一列标题（变量驱动，唯一映射）
  // 记分表第一列文案：严格按赛制。仅 best_ball_4_0 → 最佳球位；其余（best_ball / best_score）→ 最好成绩
  _labelForFormat(formatType) {
    return formatType === 'best_ball_4_0' ? '最佳球位' : '最好成绩';
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

    // 从 gameStore 回灌团队记分实体成绩（返回首页进度条依赖此数据）
    if (hasMatch && this.data.gameId) {
      const savedGroup = gameStore.getGroup(this.data.gameId, this._gameGroupIndex || 0) || {};
      const savedTeams = savedGroup.teamScoresByEntity || [];
      if (savedTeams.length && this._engineGroups.length) {
        savedTeams.forEach((rec, gi) => {
          if (!this._engineGroups[gi]) return;
          this._engineGroups[gi].scores = (rec.scores || []).slice();
          this._engineGroups[gi].putts = (rec.putts || []).slice();
        });
      }
    }

    // 第一列标题：真实比赛由 matchState.formatType 驱动；演示态固定「最佳球位」原型
    const label = hasMatch ? this._labelForFormat(ms && ms.formatType) : '最佳球位';
    // 真实比赛：球队记分行 = 各组逐洞最佳（best across groups）派生；演示态保留原型数据
    const team = hasMatch ? this._teamBestColumns(this.data.scoreDisplayMode) : null;
    const colStartW = this._computeBestballColStartWidth();
    const groupCount = resolveScorePageGroupCount(this.data.gameId, ms);
    const menuPanels = this.data.gameId
      ? resolveNormalGameMoreMenu(this.data.gameId, ms)
      : resolveMoreMenuPanels('fourball_best', { hasRealMatch: hasMatch, groupCount: groupCount });
    this.setData({
      mode: 'fourball_best',
      moreMenuItems: menuPanels.moreMenuItems,
      playerCount: this._playersSource.length || 4,
      scoringMode: 'best_ball',
      layoutType: 'fourball',
      bestHasMatch: hasMatch,
      // 名册条：真实比赛由分组结构派生（带 groupClass 高亮）；演示态走原型
      bestRoster: hasMatch ? this._buildRosterFromGroups() : buildBestRoster(this._playersSource),
      bestLabel: label,
      // 记分行：按组渲染（每组一行）；多人组=球队样式，单人组=个人比杆样式
      bestTeams: this._buildBestTeams(this.data.scoreDisplayMode, hasMatch, label),
      // 兼容字段（best across groups，供需要时读取，不再用于行渲染）
      bestColumns: hasMatch ? team.columns : buildBestBallColumns(this.data.scoreDisplayMode),
      bestTeamDiffStr: hasMatch ? team.teamDiffStr : formatDiff(BEST_SPECIAL[20].diff),
      bestTeamDiffClass: hasMatch
        ? team.teamDiffClass
        : (BEST_SPECIAL[20].diff < 0 ? 'diff-under' : BEST_SPECIAL[20].diff > 0 ? 'diff-over' : 'diff-even'),
      scoreboardStyle: this._buildScoreboardStyleVars({ colWidth: colStartW, bestDiffGrow: 1 }),
      'match.format': label
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

  // 构建统一记分引擎分组（scoreEngine.groups）：matchState.groups 优先；缺省则全员一组。
  // 每组携带 scores/putts（每洞单一成绩），不拆分球员。
  _buildEngineGroups(ms, hasMatch) {
    let base = ms && Array.isArray(ms.groups) && ms.groups.length ? ms.groups : null;
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

  // 名册条：仅平铺「3 人及以上」组成员（triple/quad），每组独立高亮。
  // pair（2人）→ 在记分行内以并排双头像呈现（复刻四人四球原型），不进名册；single（1人）→ 个人记分行。
  // 4+0/3+0 → 唯一组；3+1 → 仅 triple 组；2+2 / 2+1+1 → 名册为空（隐藏名册条）。仅视觉高亮，不改排列/昵称/T台位置。
  _buildRosterFromGroups() {
    const groups = this._engineGroups || [];
    const roster = [];
    groups.forEach((g, gi) => {
      const members = g.members || [];
      if (members.length < 3) return;
      members.forEach((m) => {
        const i = roster.length;
        const tp = TEE_PALETTE[i % TEE_PALETTE.length];
        const shortName = m.name && m.name.indexOf('.') >= 0 ? m.name.split('.').pop().trim() : m.name;
        roster.push({
          playerId: m.playerId || ('seat-' + i),
          name: shortName || m.name || '球员',
          avatar: m.avatar || '',
          tee: tp.tee,
          teeColor: tp.teeColor,
          groupIndex: gi,
          groupClass: 'bestball-group-' + (gi % 4)
        });
      });
    });
    return roster;
  },

  // 逐洞「各组最佳」（best across groups）：球队记分行的唯一来源（单一成绩，不生成多值数组）
  _teamBestScores() {
    const groups = this._engineGroups || [];
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

  // 组合记分行第一列起始宽度：pair(2人)需容纳双头像 + 杆差列间距
  _computeBestballColStartWidth() {
    const groups = this._engineGroups || [];
    const PAD = 24;
    const DIFF_W = 96;
    const GAP = 24;
    let need = 300;
    groups.forEach((g) => {
      const n = (g.members || []).length;
      if (n === 2) {
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
      return [{
        id: 'demo-team',
        groupIndex: 0,
        kind: 'team',
        isSingle: false,
        label: bestLabel,
        name: '',
        avatar: '',
        pairMembers: [],
        columns: proto,
        teamDiffStr: formatDiff(d),
        teamDiffClass: d < 0 ? 'diff-under' : d > 0 ? 'diff-over' : 'diff-even'
      }];
    }
    const groups = this._engineGroups || [];
    let gpos = 0; // 全局成员序号（双色 T 台调色板按此循环）
    return groups.map((g, gi) => {
      const t = buildTeamBestColumns(g.scores, g.putts, displayMode);
      const members = g.members || [];
      const size = members.length;
      const kind = size === 1 ? 'single' : size === 2 ? 'pair' : 'team';
      const m0 = members[0] || {};
      let pairMembers = [];
      let colorClass = 'border-white';
      if (kind === 'single') {
        colorClass = GAME_COLOR_CLASSES[gpos % GAME_COLOR_CLASSES.length];
        gpos += 1;
      } else if (kind === 'pair') {
        const PAIR_LEFT = ['24rpx', '128rpx'];
        pairMembers = members.map((m, mi) => {
          const tp = TEE_PALETTE[gpos % TEE_PALETTE.length];
          gpos += 1;
          return {
            name: this._shortName(m.name) || m.name || '球员',
            avatar: m.avatar || '',
            teeColor: tp.teeColor,
            left: PAIR_LEFT[mi] || (24 + mi * 104) + 'rpx',
            tf: mi === 1 ? 'translateX(var(--pair-second-shift, 0rpx))' : 'none'
          };
        });
      } else {
        gpos += size;
      }
      return {
        id: g.id,
        groupIndex: gi,
        kind: kind,
        isSingle: kind === 'single',
        // 球队/单人标题：严格按赛制（最佳球位/最好成绩），禁止使用队伍名/索引
        label: bestLabel,
        name: this._shortName(m0.name) || m0.name || g.name,
        avatar: m0.avatar || '',
        colorClass: kind === 'single' ? colorClass : '',
        pairMembers: pairMembers,
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
    this.setData({
      gameContext: {
        ready: true,
        courseFull: courseFull,
        title: c.roundName || courseName || '高尔夫球局',
        format: this._labelForFormat(ms && ms.formatType),
        teeTime: c.teeTime || '',
        weather: { loading: true, line: '加载中…' },
        isPrivate: false,
        accessCode: ''
      }
    });
    this.fetchWeather();
  },

  // 个人比杆赛模式：从出发表 groups 加载本组球员与 holes 成绩（唯一数据源）
  initIndividualStrokeMode(groupId) {
    groupsStore.ensureInitialized();
    const group = groupsStore.getGroup(groupId);
    const loaded = groupsStore.loadGroupForScoring(groupId);
    this._playersSource = loaded.length
      ? loaded.map((p) => ({
          id: p.id,
          playerId: p.playerId || p.id,
          name: p.name,
          avatar: p.avatar,
          colorClass: p.colorClass || 'border-white',
          scores: (p.scores || []).slice(),
          putts: (p.putts || []).slice()
        }))
      : PLAYER_SEEDS.map((p) =>
          Object.assign({}, JSON.parse(JSON.stringify(p)), { scores: [], putts: [] })
        );
    this.setData({
      mode: 'individual_stroke',
      groupId: groupId || '',
      gameFinished: matchStatus.getMatchStatus(group, { source: 'groups' }).isCompleted,
      moreMenuItems: resolveMoreMenuPanels('individual_stroke').moreMenuItems,
      scoringMode: 'stroke',
      layoutType: 'standard',
      playerCount: this._playersSource.length || 4,
      'match.format': '个人比杆赛'
    });
    const ms = this._matchState || this._readMatchState();
    if (ms) this.buildGameContextFromMatchState(ms);
    this.refreshPlayers();
  },

  // Game 模式：球员来源 = 该组 playersSlots，所有记分格初始化为空（支持单组/多组）
  initGameMode(gameId, groupIndex) {
    const game = gameStore.getGame(gameId);
    const group = this._loadPlayersFromGameGroup(gameId, groupIndex, { colorClasses: true });
    const ms = matchStatus.getMatchStatus(group, { source: 'game' });
    const menuPanels = resolveNormalGameMoreMenu(gameId, this._matchState || this._readMatchState());
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
    if (this.data.gameId && !this.data.noMatch) {
      this._refreshScorePageFromGame();
    } else if (this.data.gameId) {
      this._syncGameFinishedState();
      this._maybeShowEndGroupPrompt();
    }
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

  refreshPlayers() {
    const displayMode = this.data.scoreDisplayMode;
    const players = this._playersSource.map((p, i) => enrichPlayer(p, i, displayMode));
    const patch = { playersView: players };
    // 四人最佳球位：真实比赛由分组结构(scoreEngine.groups)派生球队记分行（逐洞各组最佳）与高亮名册；
    // 演示态保留原型数据。
    if (this.data.mode === 'fourball_best') {
      patch.bestTeams = this._buildBestTeams(displayMode);
      if (this.data.bestHasMatch) {
        const team = this._teamBestColumns(displayMode);
        patch.bestColumns = team.columns;
        patch.bestTeamDiffStr = team.teamDiffStr;
        patch.bestTeamDiffClass = team.teamDiffClass;
        patch.bestRoster = this._buildRosterFromGroups();
      } else {
        patch.bestColumns = buildBestBallColumns(displayMode);
        patch.bestRoster = buildBestRoster(this._playersSource);
      }
    }
    this.setData(patch);
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
    });
    this.refreshPlayers();
  },

  // 切换记分格主数字显示方式（总杆 / 杆差），仅 UI 展示，不改写 score 数据
  setScoreDisplayMode(e) {
    const value = e.currentTarget.dataset.value;
    if (value === this.data.scoreDisplayMode) return;
    // 1) 更新状态 2) 写入缓存（记忆偏好）3) 刷新记分格与记分面板显示
    this.setData({ scoreDisplayMode: value }, () => this.refreshPlayers());
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

  /** 从 gameStore 某组 playersSlots 加载球员 + 槽位（增删后再次进入的唯一数据源） */
  _loadPlayersFromGameGroup(gameId, groupIndex, options) {
    const opts = options || {};
    const group = gameStore.getGroup(gameId, groupIndex || 0) || { playersSlots: [], scoresByPlayer: {} };
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
      const saved = scoresByPlayer[p.playerId] || {};
      this._demoSlots[i] = {
        id: p.playerId,
        playerId: p.playerId,
        name: p.name,
        avatar: mockAvatars.resolveAvatar(p.avatar, p.playerId),
        scores: (saved.scores || []).slice(),
        putts: (saved.putts || []).slice()
      };
    }
    let colorIdx = 0;
    this._playersSource = this._demoSlots.filter(Boolean).map((p) => {
      const row = {
        id: p.playerId,
        playerId: p.playerId,
        name: p.name,
        avatar: mockAvatars.resolveAvatar(p.avatar, p.playerId),
        scores: (p.scores || []).slice(),
        putts: (p.putts || []).slice()
      };
      if (opts.colorClasses) {
        row.colorClass = GAME_COLOR_CLASSES[colorIdx % GAME_COLOR_CLASSES.length];
        colorIdx++;
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
          avatar: mockAvatars.resolveAvatar(p.avatar, p.playerId || p.id)
        };
      });
    }
    return (this._playersSource || []).map((p) => ({
      playerId: p.playerId || p.id,
      name: p.name || '球员',
      avatar: p.avatar || ''
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

  // 将当前本地 state 写入会话：个人比杆赛 → 出发表 groups；其他模式 → scoreSessions
  persistSession() {
    if (this._isGameStoreContext()) {
      const gi = this._gameGroupIndex || 0;
      this._persistGameRoster();
      (this._playersSource || []).forEach((p) => {
        gameStore.setGroupPlayerScores(this.data.gameId, gi, p.playerId || p.id, p.scores, p.putts);
      });
      if (this.data.mode === 'fourball_best') {
        this._persistTeamScores();
      }
      return;
    }
    if (this.data.mode === 'individual_stroke' && this.data.groupId) {
      groupsStore.syncGroupFromScoring(this.data.groupId, this._playersSource);
      return;
    }
    const app = getApp();
    app.globalData = app.globalData || {};
    app.globalData.scoreSessions = app.globalData.scoreSessions || {};
    app.globalData.scoreSessions[this._sessionKey()] = (this._playersSource || []).map((p) => ({
      scores: (p.scores || []).slice(),
      putts: (p.putts || []).slice()
    }));
  },

  // 回灌：个人比杆赛从 groups 读取；其他模式从 scoreSessions
  hydrateFromSession() {
    if (this._isGameStoreContext()) {
      const group = gameStore.getGroup(this.data.gameId, this._gameGroupIndex || 0) || {};
      const scoresByPlayer = group.scoresByPlayer || {};
      let changed = false;
      (this._playersSource || []).forEach((p) => {
        const rec = scoresByPlayer[p.playerId || p.id];
        if (rec) {
          p.scores = (rec.scores || []).slice();
          p.putts = (rec.putts || []).slice();
          changed = true;
        }
      });
      if (changed) this.refreshPlayers();
      return;
    }
    if (this.data.mode === 'individual_stroke' && this.data.groupId) {
      groupsStore.ensureInitialized();
      const loaded = groupsStore.loadGroupForScoring(this.data.groupId);
      if (!loaded.length) return;
      this._playersSource = loaded.map((p) => ({
        id: p.id,
        playerId: p.playerId || p.id,
        name: p.name,
        avatar: p.avatar,
        colorClass: p.colorClass || 'border-white',
        scores: (p.scores || []).slice(),
        putts: (p.putts || []).slice()
      }));
      this.refreshPlayers();
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
      }
    });
    this.refreshPlayers();
  },

  syncSheetPlayers() {
    // 四人最佳球位 / 最好成绩：记分实体 = scoreEngine.groups，球员列表/快捷控件按组数呈现（一组一项）
    if (this.data.mode === 'fourball_best') {
      const { sheetPar, sheetHoleIndex, panelScore, scoreDisplayMode, activePlayerIdx, quickPanelScores, scorePanelMode } = this.data;
      const groups = this._engineGroups || [];
      const single = groups.length <= 1;
      const sheetPlayers = groups.map((g, gi) => {
        let holeScore;
        if (scorePanelMode === 'quick') {
          const q = quickPanelScores[gi] != null ? quickPanelScores[gi] : sheetPar;
          holeScore = formatMainScore(q, sheetPar, scoreDisplayMode);
        } else {
          const s = (g.scores || [])[sheetHoleIndex];
          holeScore = isFilledScore(s) ? formatMainScore(s, sheetPar, scoreDisplayMode) : '';
        }
        return {
          id: g.id,
          // 单组时沿用赛制标题（最佳球位/最好成绩）；多组时显示队伍名
          name: single ? (this.data.bestLabel || g.name) : g.name,
          avatar: g.avatar || '',
          active: gi === activePlayerIdx,
          holeScore
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

    const { playersView, activePlayerIdx, sheetPar, sheetHoleIndex, quickPanelScores, scorePanelMode, panelScore, scoreDisplayMode } = this.data;
    const sheetPlayers = playersView.map((p, idx) => {
      const shortName = p.name.split('.')[1] || p.name;
      let holeScore;
      if (scorePanelMode === 'quick') {
        // 快捷面板：显示待写入的快捷成绩（默认 PAR），按当前显示方式换算
        const g = quickPanelScores[idx] != null ? quickPanelScores[idx] : sheetPar;
        holeScore = formatMainScore(g, sheetPar, scoreDisplayMode);
      } else {
        // 技术面板：头像右侧成绩 = players[idx].scores[currentHole]，按当前显示方式换算；空则为空
        const s = (p.scores || [])[sheetHoleIndex];
        holeScore = isFilledScore(s) ? formatMainScore(s, sheetPar, scoreDisplayMode) : '';
      }
      return {
        id: p.id,
        name: shortName,
        avatar: p.avatar,
        active: idx === activePlayerIdx,
        holeScore
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

    if (this.data.gameId && (this.data.mode === 'game' || this.data.mode === 'fourball_best')) {
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

  // 复刻原型 updateCompactAvatarColumn：scrollLeft → progress → eased，仅更新 CSS 变量
  onScoreboardScroll(e) {
    const scrollLeft = e.detail.scrollLeft || 0;
    const progress = Math.min(1, Math.max(0, scrollLeft / 72));
    const eased = 1 - Math.pow(1 - progress, 3);
    const isBest = this.data.mode === 'fourball_best';
    const hasPairSwipe = isBest && progress > 0 && this._engineHasPairGroups();
    const paddingX = 24 - (24 - 16) * eased;
    const diffOpacity = Math.max(0, 1 - progress * 1.35);
    const diffColW = isBest ? 96 * diffOpacity : 96;
    let colWidth;
    if (hasPairSwipe) {
      colWidth = this._computePairSwipeColumnWidth(paddingX, progress, diffColW);
    } else {
      const startW = isBest ? this._computeBestballColStartWidth() : 240;
      const minW = isBest ? Math.max(200, Math.round(startW * 0.67)) : 128;
      colWidth = startW - (startW - minW) * eased;
    }
    const nameWidth = 192 - (192 - 88) * eased;
    const labelSize = 30 - (30 - 20) * eased;
    const bestDiffGrow = isBest ? diffOpacity : 1;
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
      this.setData({ showMoreSheet: true, moreMenuItems: panels.moreMenuItems });
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
      const meta = groupsStore.getTournamentCourseMeta();
      ctx.courseId = meta.courseId;
      ctx.courseName = meta.courseName;
      ctx.front9Course = meta.front9Course;
      ctx.back9Course = meta.back9Course;
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

    const patch = { columns: buildColumns() };

    if (this.data.showScoreSheet) {
      const hi = this.data.sheetHoleIndex;
      if (hi >= 0 && hi < holeLayout.SCORE_CELL_COUNT) {
        const cIdx = hi < 9 ? hi : hi + 1;
        patch.sheetHoleLabel = columnLabels()[cIdx];
        patch.sheetPar = holePars()[hi];
        const p = (this._playersSource || [])[this.data.activePlayerIdx];
        const raw = p && (p.scores || [])[hi];
        if (isFilledScore(raw)) {
          patch.panelScore = raw;
          const putt = p.putts && p.putts[hi];
          if (putt != null && putt !== '') patch.panelPutt = putt;
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
    const label = e.currentTarget.dataset.label;
    this.setData({ showMoreSheet: false });

    if (label === '结束比赛') {
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
          '/pages/create/normal/index?mode=edit&gameId=' +
          encodeURIComponent(this.data.gameId) +
          '&returnTo=score',
        fail: () => wx.showToast({ title: '页面尚未注册', icon: 'none' })
      });
      return;
    }

    if (label === '修改半场') {
      this.openEditHalfSheet();
    }
  },

  /* ===== 普通球局：成绩全部完成 → 确认结束弹窗 ===== */
  _isNormalGameContext() {
    return !!this.data.gameId;
  },

  _syncGameFinishedState() {
    if (this._boundToStore() && this.data.groupId) {
      const ms = matchStatus.getMatchStatusForTournamentGroup(this.data.groupId);
      this.setData({
        gameFinished: ms.isCompleted,
        scoresCompleted: this._isAllScoresCompleted()
      });
      return;
    }
    if (!this.data.gameId) return;
    const group = gameStore.getGroup(this.data.gameId, this._gameGroupIndex || 0) || {};
    const ms = matchStatus.getMatchStatus(group, { source: 'game' });
    this.setData({
      gameFinished: ms.isCompleted,
      scoresCompleted: this._isAllScoresCompleted()
    });
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
    if (!this.data.gameFinished) return false;
    wx.showToast({ title: '比赛已结束，成绩不可修改', icon: 'none' });
    return true;
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

  _confirmEndGroupGame() {
    if (this._boundToStore() && this.data.groupId) {
      groupsStore.updateGroupStatus(this.data.groupId, matchStatus.FINISHED_STORAGE_STATUS);
      this.setData({ gameFinished: true, scoresCompleted: true });
      wx.showToast({ title: '比赛已结束', icon: 'success' });
      return;
    }
    if (!this.data.gameId) return;
    gameProgress.confirmFinishGame(this.data.gameId, this._gameGroupIndex || 0);
    this.setData({ gameFinished: true, scoresCompleted: true });
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

  openGroupManagePage() {
    if (this.data.gameFinished) {
      wx.showToast({ title: '比赛已结束，不可修改球员', icon: 'none' });
      return;
    }
    this.setData({ showGroupManage: true, groupSlots: this._groupSlotsForCurrent() });
  },

  closeGroupManagePage() {
    this._targetSlotIdx = null;
    this.setData({ showGroupManage: false, addSheetVisible: false });
  },

  // 是否绑定真实记分数据源（个人比杆赛走 groupsStore，以 playerId 为成绩主键）
  _boundToStore() {
    return this.data.mode === 'individual_stroke' && !!this.data.groupId;
  },

  // 「添加/删除页面」唯一数据源：当前记分页面球员快照。
  // - 绑定 store(个人比杆赛)：取实盘 group.players（含 null 占位，保留空位位置）
  // - 其他模式(standard/四人最佳)：取当前记分页面 _playersSource（绝不使用 GROUP_PLAYERS 等第二数据源）
  _groupSlotsForCurrent() {
    if (this._boundToStore()) {
      const g = groupsStore.getGroup(this.data.groupId);
      if (g) {
        const players = (g.players || []).map((p) =>
          p ? { playerId: p.playerId, name: p.name, avatar: p.avatar, source: p.source || 'manual' } : null
        );
        const slots = playerSlots.toSlots(players, 4);
        // 标注空位是否存在「上一位球员」成绩缓存（供 UI 提示「可继承」）
        return slots.map((s, i) =>
          s.status === 'empty'
            ? Object.assign({}, s, { hasCache: !!groupsStore.getSlotCache(this.data.groupId, i) })
            : s
        );
      }
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
    return this._demoSlots.map((p, i) => {
      const slotId = i + 1;
      if (!p) {
        return {
          slotId,
          player: null,
          playerId: null,
          status: 'empty',
          source: null,
          hasCache: !!(this._demoSlotCache && this._demoSlotCache[i])
        };
      }
      return {
        slotId,
        player: { playerId: p.playerId || p.id, name: p.name, avatar: p.avatar },
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
    this._playersSource = loaded.map((p) => ({
      id: p.id,
      playerId: p.playerId || p.id,
      name: p.name,
      avatar: p.avatar,
      colorClass: p.colorClass || 'border-white',
      scores: (p.scores || []).slice(),
      putts: (p.putts || []).slice()
    }));
    const patch = {
      playerCount: this._playersSource.length || 4,
      groupSlots: this._groupSlotsForCurrent()
    };
    if (this.data.activePlayerIdx >= this._playersSource.length) patch.activePlayerIdx = 0;
    this.setData(patch);
    // 强制重建记分链路（slot→playerId→scoreMap→UI），保证从 store 增删后立即同步
    this.rebindScoreContext();
  },

  // 删除球员：槽位置空(status=empty)、顺序不变；成绩不删除而是缓存到该 slot，供后续新球员继承
  removeGroupSlot(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (isNaN(idx)) return;
    this._removeSlotAt(idx);
  },

  // 按下标移出某槽位（供删除按钮 / 好友取消选中复用）：置空、顺序不变、成绩缓存到该 slot
  _removeSlotAt(idx) {
    if (idx == null || idx < 0) return;
    if (this._boundToStore()) {
      // 先 flush 当前成绩到 store，再删除该槽位（store 内部已把 holes 缓存到 slotCache）
      this.persistSession();
      groupsStore.removePlayerSlot(this.data.groupId, idx);
      this._reloadFromStore();
    } else {
      // 非绑定模式：把被删球员成绩缓存到 _demoSlotCache[idx]，槽位置空（不动其它槽位顺序）
      this._ensureDemoSlots();
      const cur = this._demoSlots[idx];
      if (cur) {
        this._demoSlotCache[idx] = {
          playerId: cur.playerId || cur.id,
          name: cur.name,
          avatar: cur.avatar,
          scores: (cur.scores || []).slice(),
          putts: (cur.putts || []).slice()
        };
      }
      this._demoSlots[idx] = null;
      this._syncDemoFromSlots();
    }
  },

  // 目标槽位是否存在「上一位球员」可继承成绩
  _slotHasCache(idx) {
    if (this._boundToStore()) return !!groupsStore.getSlotCache(this.data.groupId, idx);
    this._ensureDemoSlots();
    return !!(this._demoSlotCache && this._demoSlotCache[idx]);
  },

  // 统一补位入口：成绩以 playerId 为主键、不改 slot 顺序。
  // 策略C：若该槽位有历史成绩 → 弹窗让用户选择「继承」或「从零开始」；否则直接空成绩进入。
  _bindPlayerToSlot(idx, player, source) {
    const p = Object.assign({}, player, { source: source || 'manual' });
    if (this._slotHasCache(idx)) {
      wx.showModal({
        title: '该位置有历史成绩',
        content: '是否让新球员继承上一位球员的成绩？\n选择「从零开始」将以空成绩记分（旧成绩不会被删除）。',
        confirmText: '继承成绩',
        cancelText: '从零开始',
        success: (res) => this._doBindPlayerToSlot(idx, p, source, !!res.confirm)
      });
      return;
    }
    this._doBindPlayerToSlot(idx, p, source, false);
  },

  // 执行补位绑定：inherit=true 继承该 slot 历史成绩；否则空成绩。slot 顺序与 playerId 主键不变。
  _doBindPlayerToSlot(idx, p, source, inherit) {
    if (this._boundToStore()) {
      this.persistSession();
      groupsStore.bindPlayerToSlot(this.data.groupId, idx, p, inherit);
      this._reloadFromStore();
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
        scores: inherit && cache ? (cache.scores || []).slice() : [],
        putts: inherit && cache ? (cache.putts || []).slice() : []
      };
      this._demoSlots[idx] = newP;
      this._demoSlotCache[idx] = null;
      this._syncDemoFromSlots();
    }
  },

  // 当前第一个空位索引（footer 的「手工添加/好友选择」补第一个空位）
  _firstEmptySlotIndex() {
    return (this.data.groupSlots || []).findIndex((s) => s && s.status === 'empty');
  },

  // 点击空位（status=empty）：弹出底部 Action Sheet（好友列表 / 老牌组合 / 手工添加）
  // 记录目标 slot，所有补位方式都只回填「该」slot（仅当前 matchId 的 playersSlots）
  onEmptySlotTap(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (isNaN(idx)) return;
    this._targetSlotIdx = idx;
    this.setData({ addSheetVisible: true });
  },

  closeAddSheet() {
    this.setData({ addSheetVisible: false });
  },

  onPlayerSourceSelect(e) {
    const key = e.detail && e.detail.key;
    if (key === 'friends') this.addMethodFriend();
    else if (key === 'combo') this.addMethodCombo();
    else if (key === 'manual') this.addMethodManual();
  },

  // 当前目标 slot 的上下文（matchId + slotId），随 URL 传给二级页面
  _buildSlotCtx() {
    const idx = this._targetSlotIdx;
    const slots = this.data.groupSlots || [];
    const slot = idx != null && idx >= 0 ? slots[idx] : null;
    const slotId = slot ? slot.slotId : idx != null && idx >= 0 ? idx + 1 : '';
    return { matchId: this.data.groupId || 'demo-match', slotId: slotId };
  },

  // 本 Game 其它组已占用 playerId（绑定 store 时跨组生效；demo 单组为空）
  _otherGroupsUsedIds() {
    if (!this._boundToStore()) return [];
    const cur = this.data.groupId;
    const ids = [];
    (groupsStore.getGroups() || []).forEach((g) => {
      if (!g || g.id === cur) return;
      (g.players || []).forEach((p) => {
        if (p && p.playerId) ids.push(p.playerId);
      });
    });
    return ids;
  },

  // 当前组已占用 playerId（组合/手工补空位时不可与本组重复）
  _currentGroupUsedIds() {
    const ids = [];
    (this.data.groupSlots || []).forEach((s) => {
      if (s && s.status === 'occupied' && s.player && s.player.playerId) ids.push(s.player.playerId);
    });
    return ids;
  },

  // 【1】好友列表：第二层 → 跳转「好友选择页」（多选，已在组默认选中、可取消）
  addMethodFriend() {
    this.setData({ addSheetVisible: false });
    const slots = this.data.groupSlots || [];
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
      '/pages/player/friends/index?matchId=' +
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

  // 好友选择返回：调和「新增（补空位，从前往后）+ 取消（移出已在组好友）」，只动当前比赛 slot
  _onFriendsSelected(friends) {
    if (!Array.isArray(friends)) return;
    const otherUsed = {};
    this._otherGroupsUsedIds().forEach((id) => { otherUsed[id] = true; });
    const selectedSet = {};
    friends.forEach((f) => { selectedSet[f.playerId] = f; });
    const slots = this.data.groupSlots || [];
    const currentGroupSlots = {};
    slots.forEach((s, i) => {
      if (s && s.status === 'occupied' && s.player && s.player.playerId) {
        currentGroupSlots[s.player.playerId] = i;
      }
    });
    // 1) 取消选中 → 移出（置空、顺序不变；含「我」与普通好友）
    Object.keys(currentGroupSlots).forEach((pid) => {
      if (!selectedSet[pid]) this._removeSlotAt(currentGroupSlots[pid]);
    });
    // 2) 新增选中 → 从前往后补空位（playerId 强绑定；全局去重：跳过其它组已用）
    friends
      .filter((f) => currentGroupSlots[f.playerId] == null && !otherUsed[f.playerId])
      .forEach((f) => {
        const idx = this._firstEmptySlotIndex();
        if (idx < 0) return;
        const source = f.playerId === 'me' ? 'host' : 'friend';
        this._doBindPlayerToSlot(idx, { playerId: f.playerId, name: f.name, avatar: f.avatar }, source, false);
      });
  },

  // 【2】老牌组合：第二层 → 跳转「组合选择页」（高频组合，一键按顺序填充）
  addMethodCombo() {
    this.setData({ addSheetVisible: false });
    const ctx = this._buildSlotCtx();
    const usedIds = this._otherGroupsUsedIds().concat(this._currentGroupUsedIds());
    wx.navigateTo({
      url:
        '/pages/player/combos/index?matchId=' +
        encodeURIComponent(ctx.matchId) +
        '&slotId=' +
        encodeURIComponent(ctx.slotId) +
        '&used=' +
        encodeURIComponent(usedIds.join(',')),
      events: {
        comboSelected: (payload) => this._onComboSelected(payload && payload.combo)
      },
      fail: (err) => wx.showToast({ title: '跳转失败：' + (err && err.errMsg ? err.errMsg : ''), icon: 'none' })
    });
  },

  // 组合选择返回：按 slot 顺序批量补当前比赛空位（不动已占用、不改顺序；全局去重跳过已用）
  _onComboSelected(combo) {
    if (!combo || !Array.isArray(combo.players)) return;
    const used = {};
    this._otherGroupsUsedIds().concat(this._currentGroupUsedIds()).forEach((id) => { used[id] = true; });
    const emptyIdx = [];
    (this.data.groupSlots || []).forEach((s, i) => {
      if (s && s.status === 'empty') emptyIdx.push(i);
    });
    if (!emptyIdx.length) {
      wx.showToast({ title: '本组已满（4 人）', icon: 'none' });
      return;
    }
    let slot = 0;
    combo.players.forEach((pl) => {
      const pid = pl.playerId || 'cb-' + Date.now() + '-' + slot;
      if (used[pid]) return; // 全局去重：跳过本场已用
      if (slot >= emptyIdx.length) return;
      this._doBindPlayerToSlot(emptyIdx[slot], { playerId: pid, name: pl.name, avatar: pl.avatar }, 'combo', false);
      used[pid] = true;
      slot += 1;
    });
  },

  // 【3】手工添加：第二层 → 跳转「手工添加页」（搜索/新建，单人绑定当前 slot 或第一个空位）
  addMethodManual() {
    this.setData({ addSheetVisible: false });
    const target = this._targetSlotIdx;
    const ctx = this._buildSlotCtx();
    const usedIds = this._otherGroupsUsedIds().concat(this._currentGroupUsedIds());
    wx.navigateTo({
      url:
        '/pages/player/manual/index?matchId=' +
        encodeURIComponent(ctx.matchId) +
        '&slotId=' +
        encodeURIComponent(ctx.slotId) +
        '&used=' +
        encodeURIComponent(usedIds.join(',')),
      events: {
        playerPicked: (payload) => this._onPlayerPicked(payload && payload.player, target)
      },
      fail: (err) => wx.showToast({ title: '跳转失败：' + (err && err.errMsg ? err.errMsg : ''), icon: 'none' })
    });
  },

  // 手工添加返回：单人绑定到目标 slot（被占用则退到第一个空位；全局去重拦截）
  _onPlayerPicked(player, target) {
    if (!player) return;
    const used = {};
    this._otherGroupsUsedIds().concat(this._currentGroupUsedIds()).forEach((id) => { used[id] = true; });
    if (player.playerId && used[player.playerId]) return; // 已在本场使用：拦截
    const slots = this.data.groupSlots || [];
    let idx = target != null && target >= 0 ? target : this._firstEmptySlotIndex();
    if (idx < 0 || (slots[idx] && slots[idx].status === 'occupied')) idx = this._firstEmptySlotIndex();
    if (idx < 0) {
      wx.showToast({ title: '本组已满（4 人）', icon: 'none' });
      return;
    }
    this._bindPlayerToSlot(
      idx,
      { playerId: player.playerId, name: player.name, avatar: player.avatar },
      player.source || 'manual'
    );
  },

  // footer「手工添加」：统一跳转「手工添加页」，目标=第一个空位
  addGroupPlayer() {
    this._targetSlotIdx = this._firstEmptySlotIndex();
    if (this._targetSlotIdx < 0) {
      wx.showToast({ title: '本组已满（4 人）', icon: 'none' });
      return;
    }
    this.addMethodManual();
  },

  // footer「好友选择」：统一跳转「好友选择页」
  onFooterFriend() {
    if (this._firstEmptySlotIndex() < 0) {
      wx.showToast({ title: '本组已满（4 人）', icon: 'none' });
      return;
    }
    this.addMethodFriend();
  },

  // 阻止面板点击穿透
  noop() {},

  onScoreCellTap(e) {
    if (this._scoreEditBlocked()) return;
    const { playerIdx, colIdx } = e.currentTarget.dataset;
    const cIdx = Number(colIdx);
    if (SPECIAL_IDX.includes(cIdx)) return;

    // 四人最佳球位 / 最好成绩：复用个人比杆赛记分面板；点击的行 = 对应 group（多人组=组记分，单人组=个人比杆）
    if (this.data.mode === 'fourball_best') {
      if (!this.data.bestHasMatch) return; // 演示态不可编辑
      this.openTeamScoreInput(cIdx, Number(playerIdx) || 0);
      return;
    }

    const pIdx = Number(playerIdx);

    const label = columnLabels()[cIdx];
    let holeIndex = 0;
    if (cIdx < 9) holeIndex = cIdx;
    else if (cIdx > 9 && cIdx < 19) holeIndex = cIdx - 1;

    const par = holePars()[holeIndex];
    const player = this.data.playersView[pIdx];
    const rawScore = player.scores[holeIndex];
    const hasScore = rawScore !== null && rawScore !== undefined && rawScore !== '';
    const score = hasScore ? rawScore : par; // 空洞默认填标准杆，便于直接录入
    const putt = player.putts[holeIndex] || 2;

    let quick = this.data.quickPanelScores.slice();
    quick[pIdx] = score;
    // 快捷模式：本洞全组默认 PAR（仅 quick 分支，不影响技术面板）
    if (this.data.scorePanelMode === 'quick') {
      quick = this._quickDefaultsForHole(holeIndex, par);
    }

    this.setData({
      activePlayerIdx: pIdx,
      sheetHoleLabel: label,
      sheetHoleIndex: holeIndex,
      sheetPar: par,
      panelScore: score,
      panelPutt: putt,
      // 已有成绩的洞：视推杆为既有用户输入，不被自动值覆盖；空洞允许智能默认
      panelPuttTouched: hasScore,
      quickPanelScores: quick,
      showScoreSheet: true
    }, () => {
      this.syncSheetPlayers();
      setTimeout(() => this.setData({ scoreSheetOpen: true }), 30);
    });
  },

  // 四人最佳球位 / 最好成绩：打开个人比杆赛记分面板。记分实体 = scoreEngine.groups（每组一个控件）。
  // 复用同一面板：技术面板逐组录入；快捷面板按组数渲染 N 个控件（不新增 UI 结构）。
  openTeamScoreInput(cIdx, groupIndex) {
    if (this._scoreEditBlocked()) return;
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

    this.setData({
      activePlayerIdx: active,
      sheetHoleLabel: label,
      sheetHoleIndex: holeIndex,
      sheetPar: par,
      panelScore: score,
      panelPutt: putt,
      panelPuttTouched: hasScore,
      // 记分控件数量 = 组数（每组一个快捷控件）；UI 结构不变
      quickPanelScores: this._quickDefaultsForHole(holeIndex, par),
      showScoreSheet: true
    }, () => {
      this.syncSheetPlayers();
      setTimeout(() => this.setData({ scoreSheetOpen: true }), 30);
    });
  },

  closeScoreInput() {
    this.setData({ scoreSheetOpen: false });
    setTimeout(() => this.setData({ showScoreSheet: false }), 300);
  },

  // 快捷面板：本洞各记分实体默认成绩（已填取原值，空洞默认 PAR）。
  // 四人最佳球位 → 记分实体为 scoreEngine.groups（每组一个控件）；其余 → 球员。
  _quickDefaultsForHole(holeIndex, par) {
    const src = this.data.mode === 'fourball_best' ? (this._engineGroups || []) : (this._playersSource || []);
    return src.map((p) => {
      const s = (p.scores || [])[holeIndex];
      return (s === null || s === undefined || s === '') ? par : s;
    });
  },

  switchScorePanelMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode !== 'quick' && mode !== 'tech') return;
    const patch = { scorePanelMode: mode };
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
    // 快捷模式不进行逐项选择（不影响技术面板）
    if (this.data.scorePanelMode === 'quick') return;
    const idx = Number(e.currentTarget.dataset.idx);
    // 四人最佳球位：切换记分实体=切换「组」，载入该组本洞成绩
    if (this.data.mode === 'fourball_best') {
      this._focusSheetGroup(idx);
      return;
    }
    this.setData({ activePlayerIdx: idx }, () => this.syncSheetPlayers());
  },

  // 技术面板：聚焦到指定组（载入其本洞成绩/推杆），保持面板打开
  _focusSheetGroup(gi) {
    const holeIndex = this.data.sheetHoleIndex;
    const par = this.data.sheetPar;
    const g = (this._engineGroups || [])[gi];
    const raw = g && (g.scores || [])[holeIndex];
    const hasScore = isFilledScore(raw);
    const score = hasScore ? raw : par;
    const putt = (g && (g.putts || [])[holeIndex]) || 2;
    this.setData({
      activePlayerIdx: gi,
      panelScore: score,
      panelPutt: putt,
      panelPuttTouched: hasScore
    }, () => this.syncSheetPlayers());
  },

  // 技术面板智能默认推杆：score-par <= -1（小鸟或更好）→ 1，否则 → 2
  _autoPutts(score, par) {
    return (score - par) <= -1 ? 1 : 2;
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
    this.setData({ quickPanelScores: quick }, () => this.syncSheetPlayers());
  },

  confirmScoreInput() {
    if (this._scoreEditBlocked()) return;
    // 四人最佳球位 / 最好成绩：只写入一个团队成绩到当前洞（不生成球员级成绩、不拆分球员）
    if (this.data.mode === 'fourball_best') {
      this.confirmTeamScore();
      return;
    }
    // 快捷面板：一键写入全组（默认 PAR），仅新增分支
    if (this.data.scorePanelMode === 'quick') {
      this.confirmQuickScore();
      return;
    }

    // ===== 技术面板：逐人录入，全部记录完才允许关闭 =====
    const { activePlayerIdx, sheetHoleIndex, panelScore, panelPutt, sheetPar } = this.data;
    let newScore = panelScore;
    if (newScore === null || newScore === undefined || newScore === '') {
      newScore = sheetPar;
    }
    // 1) 写入当前球员本地 state（成绩 / 推杆）
    const src = this._playersSource[activePlayerIdx];
    src.scores[sheetHoleIndex] = newScore;
    if (panelPutt !== null && panelPutt !== undefined && panelPutt !== '') {
      src.putts = src.putts || [];
      src.putts[sheetHoleIndex] = panelPutt;
    }
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
      this.closeScoreInput();
      this._afterScoresPersisted();
    }
  },

  // 四人最佳球位 / 最好成绩：每个记分实体（组）写入一个成绩；不拆分球员、不生成多值数组。
  confirmTeamScore() {
    const { sheetHoleIndex, sheetPar, scorePanelMode } = this.data;
    const groups = this._engineGroups || [];

    if (scorePanelMode === 'quick') {
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

    // 技术面板：写入当前组，未填组自动切换，全部填完才关闭
    const gi = this.data.activePlayerIdx;
    const g = groups[gi];
    if (g) {
      let newScore = this.data.panelScore;
      if (!isFilledScore(newScore)) newScore = sheetPar;
      g.scores[sheetHoleIndex] = newScore;
      if (isFilledScore(this.data.panelPutt)) {
        g.putts = g.putts || [];
        g.putts[sheetHoleIndex] = this.data.panelPutt;
      }
    }
    this.refreshTeamColumns();
    this._persistTeamScores();

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
    this.refreshTeamColumns();
    this._persistTeamScores();
    this.closeScoreInput();
    this._afterScoresPersisted();
  },

  // 重建按组记分行（每组一行）+ 兼容字段（best across groups）
  refreshTeamColumns() {
    const displayMode = this.data.scoreDisplayMode;
    const team = this._teamBestColumns(displayMode);
    this.setData({
      bestTeams: this._buildBestTeams(displayMode),
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

  // 技术面板：聚焦到指定球员（载入其本洞成绩/推杆），保持面板打开
  _focusSheetPlayer(idx) {
    const holeIndex = this.data.sheetHoleIndex;
    const par = this.data.sheetPar;
    const player = this.data.playersView[idx];
    const raw = player.scores[holeIndex];
    const hasScore = isFilledScore(raw);
    const score = hasScore ? raw : par;
    const putt = player.putts[holeIndex] || 2;
    this.setData({
      activePlayerIdx: idx,
      panelScore: score,
      panelPutt: putt,
      panelPuttTouched: hasScore
    }, () => this.syncSheetPlayers());
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
      p.scores[sheetHoleIndex] = s;
      p.putts[sheetHoleIndex] = diff < 0 ? 1 : 2; // diff 由 score-par 推导，putts 按规则写入
    });
    // 本洞 score/putts 写入后由 score engine 统一派生 diff 与 OUT/IN/TOT
    this.refreshPlayers();
    this.persistSession();
    this.closeScoreInput();
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
    const { activePlayerIdx, playersView } = this.data;
    const label = holePars().length && (holeIndex < 9 ? columnLabels()[holeIndex] : columnLabels()[holeIndex + 1]);
    const par = holePars()[holeIndex];
    const player = playersView[activePlayerIdx];
    const score = player.scores[holeIndex];
    const hasScore = isFilledScore(score);
    const putt = player.putts[holeIndex] || 2;
    let quick = this.data.quickPanelScores.slice();
    quick[activePlayerIdx] = score;
    // 快捷模式：切换洞时本洞全组默认 PAR（仅 quick 分支）
    if (this.data.scorePanelMode === 'quick') {
      quick = this._quickDefaultsForHole(holeIndex, par);
    }
    this.setData({
      sheetHoleLabel: label,
      sheetHoleIndex: holeIndex,
      sheetPar: par,
      panelScore: score,
      panelPutt: putt,
      panelPuttTouched: hasScore,
      quickPanelScores: quick
    }, () => this.syncSheetPlayers());
  }
});
