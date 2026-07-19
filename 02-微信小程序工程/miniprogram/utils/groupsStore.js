const mockAvatars = require('./mockAvatars.js');
const playerManage = require('./playerManage.js');
/**
 * 出发表 groups — 领先榜唯一数据源（会话内 app.globalData.groups）
 * 结构：groups[].players[].holes[{ holeNo, score, putts, fairway, penalty, sand, diff }]
 */

const HOLE_PARS = [4, 4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 3, 4, 4, 5, 3, 4, 4];

/** 半场变更后仅按记分格索引 hi 重算 diff；禁止搬迁 score / putts */
function setHolePars(nextPars) {
  if (!Array.isArray(nextPars) || nextPars.length !== 18) return HOLE_PARS.slice();
  HOLE_PARS.splice(0, 18, ...nextPars);
  (_store() || []).forEach((group) => {
    (group.players || []).forEach((player) => {
      (player.holes || []).forEach((hole, hi) => {
        if (isFilledScore(hole && hole.score)) {
          hole.diff = hole.score - HOLE_PARS[hi];
        } else if (hole) {
          hole.diff = null;
        }
      });
    });
  });
  return HOLE_PARS.slice();
}

function getHolePars() {
  return HOLE_PARS.slice();
}

/* 赛事级球场名称（单一数据源，供领先榜逐洞详情标题等复用；后续接入真实赛事数据时改此处） */
const TOURNAMENT_META = {
  courseId: 'c-qhw',
  courseName: '北京清河湾高尔夫乡村俱乐部 A&B',
  courseLocation: '北京 · 昌平',
  front9Course: 'A',
  back9Course: 'B',
  courseHalfText: '（A/B）'
};

function getTournamentCourseMeta() {
  return Object.assign({}, TOURNAMENT_META);
}

function setTournamentCourseHalf(patch) {
  if (!patch || typeof patch !== 'object') return getTournamentCourseMeta();
  Object.assign(TOURNAMENT_META, patch);
  return getTournamentCourseMeta();
}

// 当前球场名称：优先取赛事 meta，无则兜底 'COURSE'（禁止在视图层写死）
function getCourseName() {
  return (TOURNAMENT_META && TOURNAMENT_META.courseName) || 'COURSE';
}

/* ===== 赛事种子（仅首次初始化 groups 时使用，非领先榜独立数据源） ===== */
const TOURNAMENT_SEED = [
  {
    groupId: 'g1', groupName: '第1组', time: '08:00', hole: '1号洞', status: '未开始',
    players: [
      { playerId: 'g1-p1', name: 'Alex', team: '红队', teamClass: 'tee-team-red', v: false, gender: 'male', flag: 'us', country: 'USA', age: 30, avatar: mockAvatars.avatarByIndex(0) },
      { playerId: 'g1-p2', name: 'TigerHoo...', team: '红队', teamClass: 'tee-team-red', v: false, gender: 'male', flag: 'us', country: 'USA', age: 45, avatar: mockAvatars.avatarByIndex(1) },
      { playerId: 'g1-p3', name: 'yan72', team: '蓝队', teamClass: 'tee-team-blue', v: false, gender: 'male', flag: 'cn', country: 'CHN', age: 33, avatar: mockAvatars.avatarByIndex(2) },
      { playerId: 'g1-p4', name: '大雷', team: '蓝队', teamClass: 'tee-team-blue', v: false, gender: 'male', flag: 'cn', country: 'CHN', age: 35, avatar: mockAvatars.avatarByIndex(3) }
    ]
  },
  {
    groupId: 'g2', groupName: '第2组', time: '08:10', hole: '1号洞', status: '未开始',
    players: [
      { playerId: 'g2-p1', name: 'awen', team: '红队', teamClass: 'tee-team-red', v: false, gender: 'female', flag: 'cn', country: 'CHN', age: 28, avatar: mockAvatars.avatarByIndex(4) },
      { playerId: 'g2-p2', name: '阿咪阿咪红', team: '红队', teamClass: 'tee-team-red', v: false, gender: 'female', flag: 'cn', country: 'CHN', age: 30, avatar: mockAvatars.avatarByIndex(5) },
      { playerId: 'g2-p3', name: '邵亮', team: '蓝队', teamClass: 'tee-team-blue', v: true, gender: 'male', flag: 'cn', country: 'CHN', age: 36, avatar: mockAvatars.avatarByIndex(6) },
      { playerId: 'g2-p4', name: '郝军峰', team: '蓝队', teamClass: 'tee-team-blue', v: true, gender: 'male', flag: 'cn', country: 'CHN', age: 38, avatar: mockAvatars.avatarByIndex(7) }
    ]
  },
  {
    groupId: 'g3', groupName: '第3组', time: '08:20', hole: '10号洞', status: '未开始',
    players: [
      { playerId: 'g3-p1', name: '淳淳', team: '红队', teamClass: 'tee-team-red', v: false, gender: 'female', flag: 'cn', country: 'CHN', age: 27, avatar: mockAvatars.avatarByIndex(8) },
      { playerId: 'g3-p2', name: '大吉', team: '红队', teamClass: 'tee-team-red', v: true, gender: 'male', flag: 'cn', country: 'CHN', age: 31, avatar: mockAvatars.avatarByIndex(9) },
      { playerId: 'g3-p3', name: 'Alexander', team: '红队', teamClass: 'tee-team-red', v: false, gender: 'male', flag: 'us', country: 'USA', age: 40, avatar: mockAvatars.avatarByIndex(0) },
      { playerId: 'g3-p4', name: 'Bogey king', team: '红队', teamClass: 'tee-team-red', v: false, gender: 'male', flag: 'us', country: 'USA', age: 34, avatar: mockAvatars.avatarByIndex(1) }
    ]
  }
];

const matchStatus = require('./matchStatus');
const teeSheetManage = require('./teeSheetManage.js');

function isFilledScore(s) {
  return matchStatus.isFilledScore(s);
}

function buildEmptyHoles() {
  return HOLE_PARS.map((par, i) => ({
    holeNo: i + 1,
    score: null,
    putts: null,
    fairway: null,
    penalty: null,
    sand: null,
    diff: null
  }));
}

function _store() {
  const app = getApp();
  app.globalData = app.globalData || {};
  if (!app.globalData.groups) {
    app.globalData.groups = _initFromSeed();
  }
  return app.globalData.groups;
}

function _initFromSeed() {
  return TOURNAMENT_SEED.map((g) => ({
    groupId: g.groupId,
    groupName: g.groupName,
    time: g.time,
    hole: g.hole,
    status: g.status,
    players: g.players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      avatar: p.avatar,
      team: p.team,
      teamClass: p.teamClass,
      v: p.v,
      gender: p.gender,
      flag: p.flag,
      country: p.country,
      age: p.age,
      holes: buildEmptyHoles()
    }))
  }));
}

function ensureInitialized() {
  return _store();
}

function getGroups() {
  return _store();
}

function getGroup(groupId) {
  return _store().find((g) => g.groupId === groupId) || null;
}

/** 由 holes 派生 total / diff / thru（未录入洞不参与） */
function computePlayerStats(player) {
  if (!player) return { total: 0, diff: 0, thru: 0 };
  let total = 0;
  let parThru = 0;
  let thru = 0;
  (player.holes || []).forEach((h, i) => {
    if (isFilledScore(h.score)) {
      total += Number(h.score);
      parThru += HOLE_PARS[i];
      thru += 1;
    }
  });
  return { total, diff: total - parThru, thru };
}

/** 写入单洞成绩到 groups（score engine 统一计算 diff） */
function setPlayerHole(groupId, playerId, holeIndex, score, putts) {
  const group = getGroup(groupId);
  if (!group) return false;
  const player = group.players.find((p) => p && p.playerId === playerId);
  if (!player || !player.holes[holeIndex]) return false;
  const hole = player.holes[holeIndex];
  hole.score = isFilledScore(score) ? Number(score) : null;
  hole.putts = putts != null && putts !== '' ? Number(putts) : null;
  hole.diff = isFilledScore(hole.score) ? hole.score - HOLE_PARS[holeIndex] : null;
  return true;
}

/** 记分页：按球员序号批量回写 groups（先更新 holes，再由 groups 派生领先榜） */
function syncGroupFromScoring(groupId, playersSource) {
  const group = getGroup(groupId);
  if (!group || !playersSource) return false;
  // 成绩以 playerId 为唯一主键回写：优先按 id 命中球员，命中失败再按真实顺序兜底（不用裸数组 index 绑定成绩）
  const realPlayers = group.players.filter(Boolean);
  playersSource.forEach((src, i) => {
    const pid = src && (src.playerId || src.id);
    const player = (pid && realPlayers.find((p) => p.playerId === pid)) || realPlayers[i];
    if (!player) return;
    const scores = src.scores || [];
    const putts = src.putts || [];
    const fairways = src.fairways || [];
    const penalties = src.penalties || [];
    const sands = src.sands || [];
    player.holes.forEach((hole, hi) => {
      const s = scores[hi];
      const p = putts[hi];
      const fw = fairways[hi];
      const pen = penalties[hi];
      const sand = sands[hi];
      hole.score = isFilledScore(s) ? Number(s) : null;
      hole.putts = p != null && p !== '' ? Number(p) : null;
      hole.fairway = (fw === 'left' || fw === 'right' || fw === 'fairway') ? fw : null;
      hole.penalty = (pen !== null && pen !== undefined && pen !== '' && !Number.isNaN(Number(pen)))
        ? Math.max(0, Number(pen))
        : null;
      hole.sand = (sand !== null && sand !== undefined && sand !== '' && !Number.isNaN(Number(sand)))
        ? Math.max(0, Number(sand))
        : null;
      hole.diff = isFilledScore(hole.score) ? hole.score - HOLE_PARS[hi] : null;
    });
  });
  teeSheetManage.inferStartHoleIfNeededForGroupsStoreGroup(group);
  return true;
}

/** 记分页：从 groups 加载本组球员（scores/putts/fairways/penalties/sands 由 holes 派生） */
function loadGroupForScoring(groupId) {
  const group = getGroup(groupId);
  if (!group) return [];
  // flatten：空槽位不进入记分列表（记分逻辑只面向真实球员）
  return group.players.filter(Boolean).map((p) => ({
    playerId: p.playerId,
    id: p.playerId,
    name: p.name,
    avatar: mockAvatars.resolveAvatar(p.avatar, p.playerId),
    colorClass: 'border-white',
    scores: p.holes.map((h) => (isFilledScore(h.score) ? h.score : undefined)),
    putts: p.holes.map((h) => (h.putts != null && h.putts !== '' ? h.putts : undefined)),
    fairways: p.holes.map((h) => (h.fairway === 'left' || h.fairway === 'right' || h.fairway === 'fairway'
      ? h.fairway
      : undefined)),
    penalties: p.holes.map((h) => (h.penalty != null && h.penalty !== '' ? h.penalty : undefined)),
    sands: p.holes.map((h) => (h.sand != null && h.sand !== '' ? h.sand : undefined))
  }));
}

/* ===== 槽位式球员管理（全局统一规则）=====
 * groups[].players 的每个索引即一个固定槽位；删除=置空(null)，添加=补第一个空位。
 * 禁止 splice/shift/sort/push 改变顺序；只影响「人在哪个位置」，不动 score/diff。 */

// 删除：把指定槽位置空（保留 null 占位，顺序与索引不变）
// 关键：成绩不删除，先把该槽位被删球员的 holes 缓存到 group.slotCache[slotIndex]，供后续新球员继承
function removePlayerSlot(groupId, slotIndex) {
  const group = getGroup(groupId);
  if (!group) return false;
  if (slotIndex >= 0 && slotIndex < group.players.length) {
    const existing = group.players[slotIndex];
    if (existing && existing.holes) {
      group.slotCache = group.slotCache || [];
      group.slotCache[slotIndex] = {
        playerId: existing.playerId,
        name: existing.name,
        avatar: existing.avatar,
        holes: existing.holes.map((h) => Object.assign({}, h))
      };
    }
    group.players[slotIndex] = null;
    return true;
  }
  return false;
}

// 该槽位是否存在「上一位球员」的成绩缓存（供 UI 决定是否弹出继承/重置选择）
function getSlotCache(groupId, slotIndex) {
  const group = getGroup(groupId);
  if (!group || !group.slotCache) return null;
  return group.slotCache[slotIndex] || null;
}

// 绑定到「指定」槽位（手动/好友/扫码补位回原 slot）
// 成绩归属规则（slot 复用 + 成绩继承）：
//  - player.holes 显式给定 → 直接用（调用方已决定）
//  - 同 playerId 重新进入 → 复用其原 holes
//  - inherit=true 且该槽位有缓存 → 继承上一位球员成绩（策略A）
//  - 否则 → 空 holes（策略B，从零开始）
// 绑定完成后清除该槽位缓存（已被消费）
function bindPlayerToSlot(groupId, slotIndex, player, inherit) {
  const group = getGroup(groupId);
  if (!group || !player) return { ok: false, reason: 'no-group' };
  if (slotIndex < 0 || slotIndex >= group.players.length) return { ok: false, reason: 'bad-slot' };
  const existing = group.players[slotIndex];
  const cache = group.slotCache && group.slotCache[slotIndex];
  let holes;
  if (player.holes) {
    holes = player.holes;
  } else if (existing && existing.playerId === player.playerId && existing.holes) {
    holes = existing.holes;
  } else if (inherit && cache && cache.holes) {
    holes = cache.holes.map((h) => Object.assign({}, h));
  } else {
    holes = buildEmptyHoles();
  }
  group.players[slotIndex] = Object.assign({}, player, { holes });
  if (group.slotCache) group.slotCache[slotIndex] = null;
  return { ok: true, index: slotIndex, inherited: !!(inherit && cache && !player.holes) };
}

// 添加：填入第一个空槽位；无空位且已达上限返回 {ok:false}
function addPlayerToGroup(groupId, player, maxSlots) {
  const group = getGroup(groupId);
  if (!group) return { ok: false, reason: 'no-group' };
  const cap = maxSlots || 4;
  let idx = group.players.findIndex((p) => !p);
  if (idx === -1) {
    if (group.players.length >= cap) return { ok: false, reason: 'full' };
    idx = group.players.length;
  }
  group.players[idx] = Object.assign({}, player, {
    holes: (player && player.holes) || buildEmptyHoles()
  });
  return { ok: true, index: idx };
}

/** @deprecated 请使用 matchStatus.getMatchStatus */
function deriveTeeSheetStatus(group, source) {
  return matchStatus.deriveTeeSheetStatus(group, source);
}

/** @deprecated 请使用 matchStatus.getMatchStatus */
function mapTeeSheetStatusBadge(status) {
  if (matchStatus.isGroupConfirmedFinished(status)) return matchStatus.COMPLETED;
  return matchStatus.UPCOMING;
}

/** 写入本组 status（结束比赛确认等场景） */
function updateGroupStatus(groupId, status) {
  const group = getGroup(groupId);
  if (!group) return false;
  group.status = status;
  return true;
}

/** 普通球局出发表视图（单组 / 多组统一：deriveTeeSheetStatus + 球员 enrich） */
function buildGameTeeSheetView(game) {
  const gameStore = require('./gameStore');
  const tPositionUtil = require('./tPosition');
  if (!game) return [];
  return gameStore.listGroups(game).map((grp, gi) => {
    const ms = matchStatus.getMatchStatus(grp, { source: 'game' });
    const players = (grp.playersSlots || []).filter(Boolean).map((p) => {
      const enriched = tPositionUtil.enrichPlayer(p);
      return {
        playerId: enriched.playerId,
        name: enriched.name,
        avatar: enriched.avatar,
        v: enriched.v,
        teeMarkerClass: enriched.teeMarkerClass
      };
    });
    return {
      groupIndex: gi,
      groupId: grp.groupId || ('g-' + (gi + 1)),
      name: grp.name || ('第' + (gi + 1) + '组'),
      status: grp.status || 'not_started',
      statusBadge: ms.statusBadge,
      statusKey: ms.statusKey,
      matchStatus: ms.status,
      playerCount: players.length,
      players: players,
      teeTime: grp.teeTime || '',
      startHole: grp.startHole != null ? grp.startHole : null
    };
  });
}

/** 出发表 WXML 视图（直接映射 groups，无独立数据） */
function getTeeGroupsView() {
  const tPositionUtil = require('./tPosition');
  return getGroups().map((g) => {
    const ms = matchStatus.getMatchStatus(g, { source: 'groups' });
    const teeTime = teeSheetManage.resolveGroupTeeTime(g);
    const startHole = teeSheetManage.resolveGroupStartHole(g);
    return {
      id: g.groupId,
      badge: g.groupName,
      time: teeTime || g.time,
      hole: startHole != null ? startHole + '号洞' : '待分配',
      teeTime: teeTime || g.time,
      startHole: startHole,
      teeMetaLine: teeSheetManage.formatTeeMetaLine(teeTime || g.time, startHole),
      status: g.status,
      statusBadge: ms.statusBadge,
      statusKey: ms.statusKey,
      matchStatus: ms.status,
      players: g.players.filter(Boolean).map((p) => {
        const enriched = tPositionUtil.enrichPlayer(p);
        return {
          playerId: enriched.playerId,
          name: enriched.name,
          avatar: enriched.avatar,
          team: enriched.team,
          teamClass: enriched.teamClass,
          v: enriched.v,
          teeMarkerClass: enriched.teeMarkerClass
        };
      })
    };
  });
}

function totalClass(diff) {
  if (diff < 0) return 'score-under';
  if (diff === 0) return 'score-even';
  return 'score-over';
}

function thruLabel(thru) {
  if (!thru) return '-';
  return thru >= 18 ? 'F' : String(thru);
}

// 杆差带符号：>0 → +N，=0 → 0，<0 → -N
function formatDiffWithPlus(diff) {
  if (diff > 0) return '+' + diff;
  if (diff === 0) return '0';
  return String(diff);
}

function findPlayer(playerId) {
  const groups = getGroups();
  for (let i = 0; i < groups.length; i++) {
    const p = groups[i].players.find((x) => x && x.playerId === playerId);
    if (p) return p;
  }
  return null;
}

// 全局统一的成绩状态判断（唯一真源，记分格与逐洞面板共用，区别仅在尺寸/类名）
// 入参为本洞杆差 diff；未录入返回 'empty'
// eagle: diff<=-2 圆底白字 / birdie: -1 红圈 / par: 0 普通 / bogey: 1 方框 / double-bogey: >=2 灰底白字
function getScoreStatus(diff) {
  if (diff === null || diff === undefined || diff === '') return 'empty';
  if (diff <= -2) return 'eagle';
  if (diff === -1) return 'birdie';
  if (diff === 0) return 'par';
  if (diff === 1) return 'bogey';
  if (diff >= 2) return 'double-bogey';
  return 'empty';
}

// 逐洞面板：把统一状态映射为本面板渲染所需的 圈/框形状 + 颜色 class
function statusToMarker(status) {
  switch (status) {
    case 'eagle': return { m: 'circle', c: 'score-eagle' };        // 圆底白字
    case 'birdie': return { m: 'circle', c: 'score-birdie' };      // 红圈
    case 'bogey': return { m: 'square', c: 'score-bogey' };        // 方框
    case 'double-bogey': return { m: 'square', c: 'score-double-bogey' }; // 灰底白字
    default: return { m: '', c: '' };                              // par / empty：普通数字
  }
}

// 单洞成绩格：成绩状态统一走 getScoreStatus；尺寸由逐洞面板专用 class（ld-score-*）控制
function holeScoreCell(score, par, mode) {
  // 未录入：显示 '-'（不显示空白/0），无圈无框，不参与汇总
  if (!isFilledScore(score)) return { t: '-', m: '', c: '' };
  const diff = score - par;
  const t = mode === 'diff' ? formatDiffWithPlus(diff) : String(score);
  const marker = statusToMarker(getScoreStatus(diff));
  return { t, m: marker.m, c: marker.c };
}

// 段汇总格（OUT/IN/TOTAL）：仅统计已录入洞
function sumScoreCell(holes, from, to, mode) {
  let gross = 0;
  let diff = 0;
  let filled = 0;
  for (let i = from; i < to; i++) {
    const h = holes[i];
    if (h && isFilledScore(h.score)) {
      gross += Number(h.score);
      diff += Number(h.score) - HOLE_PARS[i];
      filled += 1;
    }
  }
  if (filled === 0) return { t: '', m: '', c: '' };
  return { t: mode === 'diff' ? formatDiffWithPlus(diff) : String(gross), m: '', c: '' };
}

function sumPar(from, to) {
  let n = 0;
  for (let i = from; i < to; i++) n += HOLE_PARS[i];
  return n;
}

/** 领先榜逐洞详情：由 groups[].players[].holes 派生（只读，无 mock，无副本） */
function buildPlayerScorecard(playerId, mode) {
  const player = findPlayer(playerId);
  if (!player) return null;
  const holes = player.holes || [];
  const parCell = (v) => ({ t: String(v), m: '', c: '' });

  const frontHead = ['Hole', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Out', ''];
  const backHead = ['Hole', '10', '11', '12', '13', '14', '15', '16', '17', '18', 'In', 'Tot'];

  const frontPar = ['Par'].map((t) => ({ t, m: '', c: '' }));
  for (let i = 0; i < 9; i++) frontPar.push(parCell(HOLE_PARS[i]));
  frontPar.push(parCell(sumPar(0, 9)));
  frontPar.push({ t: '', m: '', c: '' });

  const backPar = ['Par'].map((t) => ({ t, m: '', c: '' }));
  for (let i = 9; i < 18; i++) backPar.push(parCell(HOLE_PARS[i]));
  backPar.push(parCell(sumPar(9, 18)));
  backPar.push(parCell(sumPar(0, 18)));

  const frontScore = [{ t: '', m: '', c: '' }];
  for (let i = 0; i < 9; i++) frontScore.push(holeScoreCell(holes[i] && holes[i].score, HOLE_PARS[i], mode));
  frontScore.push(sumScoreCell(holes, 0, 9, mode));
  frontScore.push({ t: '', m: '', c: '' });

  const backScore = [{ t: '', m: '', c: '' }];
  for (let i = 9; i < 18; i++) backScore.push(holeScoreCell(holes[i] && holes[i].score, HOLE_PARS[i], mode));
  backScore.push(sumScoreCell(holes, 9, 18, mode));
  backScore.push(sumScoreCell(holes, 0, 18, mode));

  return { frontHead, frontPar, frontScore, backHead, backPar, backScore };
}

/** 领先榜：完全由 groups 派生，无独立数据源
 *  排序与展示一律基于全场杆差 totalDiff(=sum(hole.diff))，与 scoreDisplayMode 无关；
 *  第一个参数（旧 scoringDisplay）已废弃，保留签名兼容调用方。 */
function buildLeaderboard(_deprecatedDisplay, openIndex) {
  const groups = getGroups();
  const flat = [];

  groups.forEach((g) => {
    // 领先榜不直接依赖槽位：先 flatten 剔除空位再统计
    g.players.filter(Boolean).forEach((p) => {
      const stat = computePlayerStats(p);
      const genderDisplay = playerManage.getGenderDisplay(p);
      flat.push({
        playerId: p.playerId,
        name: p.name,
        group: g.groupName,
        groupId: g.groupId,
        avatar: p.avatar,
        isFemale: genderDisplay.gender === 'female',
        genderIcon: genderDisplay.icon,
        genderClass: genderDisplay.className,
        flag: p.flag || '',
        country: p.country || '',
        age: p.age || '',
        total: stat.total,
        diff: stat.diff,
        thru: stat.thru
      });
    });
  });

  flat.sort((a, b) => {
    if (a.thru === 0 && b.thru === 0) return 0;
    if (a.thru === 0) return 1;
    if (b.thru === 0) return -1;
    if (a.diff !== b.diff) return a.diff - b.diff;
    return b.thru - a.thru;
  });

  return flat.map((p, i) => {
    const started = p.thru > 0;
    const firstIndex = flat.findIndex((x) => x.thru > 0 && x.diff === p.diff);
    const tied = flat.filter((x) => x.thru > 0 && x.diff === p.diff).length > 1;
    const pos = !started ? '-' : tied ? 'T' + (firstIndex + 1) : String(i + 1);

    // 领先榜 TOTAL 永远显示全场杆差（正数带 +，0 显示 0），不随任何记分显示模式变化
    let scoreStr;
    let scoreClass;
    if (!started) {
      scoreStr = '-';
      scoreClass = 'score-even';
    } else {
      scoreStr = formatDiffWithPlus(p.diff);
      scoreClass = totalClass(p.diff);
    }

    return {
      pos,
      name: p.name,
      group: p.group,
      groupId: p.groupId,
      playerId: p.playerId,
      isFemale: p.isFemale,
      genderIcon: p.genderIcon,
      genderClass: p.genderClass,
      thru: thruLabel(p.thru),
      total: p.total,
      diff: p.diff,
      scoreStr,
      scoreClass,
      avatar: p.avatar,
      country: p.country,
      age: p.age,
      flag: p.flag,
      expanded: i === openIndex
    };
  });
}

module.exports = {
  HOLE_PARS,
  ensureInitialized,
  getGroups,
  getGroup,
  computePlayerStats,
  setPlayerHole,
  syncGroupFromScoring,
  loadGroupForScoring,
  removePlayerSlot,
  addPlayerToGroup,
  bindPlayerToSlot,
  getSlotCache,
  getTeeGroupsView,
  buildGameTeeSheetView,
  deriveTeeSheetStatus,
  mapTeeSheetStatusBadge,
  updateGroupStatus,
  buildLeaderboard,
  buildPlayerScorecard,
  getScoreStatus,
  getCourseName,
  getTournamentCourseMeta,
  setTournamentCourseHalf,
  setHolePars,
  getHolePars
};
