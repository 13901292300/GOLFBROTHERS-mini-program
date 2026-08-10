/**
 * 普通 GAME 领先榜：个人模式 / 组合（teams）模式派生
 */
const { getProfileById, FRIEND_ID_SET } = require('./playerDirectory.js');
const mockAvatars = require('./mockAvatars.js');
const holeLayout = require('./holeLayout.js');
const playerManage = require('./playerManage.js');
const {
  formatPlayerActionMetric,
  isSameUserIdentity
} = require('./playerActionModal.js');

/**
 * 仅明确 DEMO GAME 可用的演示度量（与 playerActionModal 对齐）。
 * 真实 GAME 字段缺失时显示 --，绝不回退本表。
 */
const DEMO_PLAYER_METRICS = {
  'fr-1003': { handicap: 8.0, floatCoef: 0.6 },
  'fr-1005': { handicap: 15.6, floatCoef: 2.0 },
  'fr-1008': { handicap: 12.4, floatCoef: 1.3 }
};

/**
 * DEMO GAME 判定（显式标志或既有 demo gameId）：
 * - game.isDemo / game.demo / game.isMock === true
 * - demoWeekendAmateurGame.isDemoWeekendAmateurGameId(gameId)
 */
function isDemoLeaderboardGame(game) {
  if (!game || typeof game !== 'object') return false;
  if (game.isDemo === true || game.demo === true || game.isMock === true) {
    return true;
  }
  const gid = String(game.gameId || '').trim();
  if (!gid) return false;
  try {
    const demoWeekendAmateurGame = require('./demoWeekendAmateurGame.js');
    if (
      demoWeekendAmateurGame &&
      typeof demoWeekendAmateurGame.isDemoWeekendAmateurGameId === 'function' &&
      demoWeekendAmateurGame.isDemoWeekendAmateurGameId(gid)
    ) {
      return true;
    }
  } catch (e) { /* ignore */ }
  return false;
}

/**
 * 账号绑定 id：仅 userId → playerUserId。
 * 不含 playerId：创建流会生成 p-<timestamp> / host-* 等比赛内临时人员 ID，
 * 不得仅因字符串碰巧与登录 userId 相同而识别为本人。
 */
function resolveSlotAccountUserId(slot) {
  if (!slot || typeof slot !== 'object') return '';
  const userId = String(slot.userId || '').trim();
  if (userId) return userId;
  return String(slot.playerUserId || '').trim();
}

/**
 * DEMO 度量查找键：账号 id 优先；仅在明确 DEMO GAME 下才回退 playerId
 *（演示种子里 fr-* 常同时写在 playerId 上）。
 */
function resolveDemoMetricsLookupId(slot) {
  const accountId = resolveSlotAccountUserId(slot);
  if (accountId) return accountId;
  return String((slot && slot.playerId) || '').trim();
}

/**
 * 本人身份判定（严格）：
 * 1) slot.userId 或 slot.playerUserId 非空；且
 * 2) isSameUserIdentity(该 id, 当前登录 userId)。
 * 不使用 playerId / 昵称 / 头像 / 下标。
 */
function isLeaderboardSelfSlot(slot, metricsCtx) {
  const ctx = metricsCtx || null;
  if (!ctx || !ctx.currentUserId) return false;
  const accountId = resolveSlotAccountUserId(slot);
  if (!accountId) return false;
  try {
    return !!isSameUserIdentity(accountId, ctx.currentUserId);
  } catch (e) {
    return accountId === ctx.currentUserId;
  }
}

/** 展示格式：0→"0"；空/NaN/Infinity/非法→"--"；不转百分比 */
function formatLeaderboardMetric(value) {
  if (value == null || value === '') return '--';
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  // 有限数字走既有 formatPlayerActionMetric（与主页一致）
  return formatPlayerActionMetric(n);
}

function pickSlotMetric(slot, key) {
  if (!slot || typeof slot !== 'object') return null;
  const v = slot[key];
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return v;
}

/**
 * build() 内一次性上下文：当前用户 id + profile 度量；是否允许 DEMO 表。
 * @param {object} [game]
 * @param {object} [overrides] 可选覆盖（仅供调用方注入，业务路径不传）
 */
function createMetricsContext(game, overrides) {
  let currentUserId = '';
  let meHandicap = null;
  let meFloatCoef = null;
  try {
    const gameStore = require('./gameStore.js');
    const u = gameStore.getCurrentUser() || {};
    currentUserId = String(u.userId || '').trim();
  } catch (e) { /* ignore */ }
  try {
    const userProfileStore = require('./userProfileStore.js');
    const profile = userProfileStore.loadProfile() || {};
    const pid = String(profile.userId || '').trim();
    if (pid && !currentUserId) currentUserId = pid;
    if (profile.handicap != null && profile.handicap !== '') {
      meHandicap = profile.handicap;
    }
    if (profile.floatCoef != null && profile.floatCoef !== '') {
      meFloatCoef = profile.floatCoef;
    }
  } catch (e) { /* ignore */ }
  if (!currentUserId) currentUserId = 'me';

  const base = {
    currentUserId: currentUserId,
    meHandicap: meHandicap,
    meFloatCoef: meFloatCoef,
    allowDemoMetrics: isDemoLeaderboardGame(game)
  };
  if (overrides && typeof overrides === 'object') {
    return Object.assign({}, base, overrides);
  }
  return base;
}

/**
 * 差点/浮动归属：
 * - slot 正式值优先；
 * - 仅本人 slot 可回退 profile；
 * - 他人缺字段 → null → "--"；
 * - DEMO 表仅 allowDemoMetrics 时可用。
 */
function resolvePlayerMetrics(slot, metricsCtx) {
  let handicap = pickSlotMetric(slot, 'handicap');
  let floatCoef = pickSlotMetric(slot, 'floatCoef');
  const ctx = metricsCtx || null;

  if (isLeaderboardSelfSlot(slot, ctx)) {
    if (handicap == null && ctx && ctx.meHandicap != null && ctx.meHandicap !== '') {
      handicap = ctx.meHandicap;
    }
    if (floatCoef == null && ctx && ctx.meFloatCoef != null && ctx.meFloatCoef !== '') {
      floatCoef = ctx.meFloatCoef;
    }
  } else if (ctx && ctx.allowDemoMetrics) {
    const demoKey = resolveDemoMetricsLookupId(slot);
    const demo = demoKey ? DEMO_PLAYER_METRICS[demoKey] : null;
    if (demo) {
      if (handicap == null) handicap = demo.handicap;
      if (floatCoef == null) floatCoef = demo.floatCoef;
    }
  }

  return {
    handicap: handicap,
    floatCoef: floatCoef,
    handicapText: formatLeaderboardMetric(handicap),
    floatCoefText: formatLeaderboardMetric(floatCoef)
  };
}

function holePars() {
  return holeLayout.getLayout().holePars;
}

// 姓名列约可容纳字符数（与 .lr-player 45% 宽、28rpx 字号估算）
const TEAM_NAME_MAX_UNITS = 14;

function isFilled(s) {
  return s !== null && s !== undefined && s !== '';
}

function formatDiffWithPlus(diff) {
  if (diff > 0) return '+' + diff;
  if (diff === 0) return '0';
  return String(diff);
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

function getGroupComposition(game, group, groupIndex) {
  const map = (game && game.groupCompositionMap) || {};
  const gid = (group && group.groupId) || (group && group.id);
  if (gid && map[gid]) return map[gid];
  if (group && group.composition) return group.composition;
  if (groupIndex === 0 && game && game.composition) return game.composition;
  return null;
}

function enrichPlayerIdentity(m, metricsCtx) {
  const prof = getProfileById(m.playerId, m);
  const hasRawGender = !!(m && (m.gender || m.sex || m.matchGender));
  const genderSource = hasRawGender || FRIEND_ID_SET[m.playerId] ? prof : m;
  const genderDisplay = playerManage.getGenderDisplay(genderSource);
  const metrics = resolvePlayerMetrics(m, metricsCtx);
  return {
    playerId: m.playerId,
    // 与 playerId 同源稳定身份；供主页入口解析（勿用 slot/name）
    userId: m.userId || m.playerUserId || m.playerId || '',
    userType: m.userType || '',
    identitySource: m.identitySource || '',
    name: m.name || '',
    avatar: mockAvatars.resolveAvatar(m.avatar, m.playerId || m.name),
    flag: prof.flag || '',
    country: prof.country || '',
    age: prof.age || '',
    isFemale: genderDisplay.gender === 'female',
    genderIcon: genderDisplay.icon,
    genderClass: genderDisplay.className,
    handicap: metrics.handicap,
    floatCoef: metrics.floatCoef,
    handicapText: metrics.handicapText,
    floatCoefText: metrics.floatCoefText
  };
}

function normalizeMembers(team, metricsCtx) {
  return ((team && (team.members || team.players)) || []).map(function (m) {
    return enrichPlayerIdentity(m, metricsCtx);
  });
}

/** 是否存在球员组合（teams）数据 */
function gameHasComposition(game) {
  if (!game) return false;
  const mode = game.gameMode || '';
  // 四人两球与最好/最佳球位同走组合榜（buildTeamRows + teamScoresByEntity）
  if (mode !== '最好成绩赛' && mode !== '最佳球位赛' && mode !== '四人两球赛') return false;
  const map = game.groupCompositionMap || {};
  const mapTeams = Object.keys(map).some((gid) => {
    const c = map[gid];
    return c && Array.isArray(c.teams) && c.teams.length > 0;
  });
  if (mapTeams) return true;

  const top = game.composition;
  if (top && Array.isArray(top.teams) && top.teams.length) {
    if (top.teamMode === 'single_team' || top.teamMode === 'split_team') return true;
    if (top.teams.length > 1) return true;
    if (normalizeMembers(top.teams[0]).length > 1) return true;
  }

  return (game.groups || []).some((g, gi) => {
    const c = getGroupComposition(game, g, gi);
    if (!c || !Array.isArray(c.teams) || !c.teams.length) return false;
    if (c.teamMode === 'single_team' || c.teamMode === 'split_team') return true;
    if (c.teams.length > 1) return true;
    return normalizeMembers(c.teams[0]).length > 1;
  });
}

/**
 * 组合名：昵称用 `/` 连接；超长时每名球员相同前缀 N + `…`
 */
function formatTeamDisplayName(names, maxUnits) {
  const list = (names || []).map((n) => String(n || '').trim()).filter(Boolean);
  if (!list.length) return '—';
  const limit = maxUnits || TEAM_NAME_MAX_UNITS;
  const full = list.join('/');
  if (full.length <= limit) return full;

  for (let n = 12; n >= 1; n--) {
    const parts = list.map((name) => (name.length <= n ? name : name.slice(0, n) + '…'));
    const joined = parts.join('/');
    if (joined.length <= limit) return joined;
  }
  return list.map((name) => name.slice(0, 1) + '…').join('/');
}

/** 逐洞取组合成绩：各成员该洞最低有效杆数（最好成绩 / 最佳球位统一引擎） */
function computeTeamHoleScores(members, scoresByPlayer) {
  const memberScores = (members || []).map(
    (m) => ((scoresByPlayer || {})[m.playerId] || {}).scores || []
  );
  const scores = [];
  for (let h = 0; h < 18; h++) {
    let best = null;
    memberScores.forEach((arr) => {
      const s = arr[h];
      if (isFilled(s) && (best === null || Number(s) < best)) best = Number(s);
    });
    scores[h] = best;
  }
  return scores;
}

function resolveTeamScores(group, teamIndex, team, metricsCtx) {
  const entities = (group && group.teamScoresByEntity) || [];
  const entity = entities[teamIndex];
  if (entity && Array.isArray(entity.scores) && entity.scores.some(isFilled)) {
    return entity.scores.slice();
  }
  return computeTeamHoleScores(
    normalizeMembers(team, metricsCtx),
    group.scoresByPlayer || {}
  );
}

function aggregateScores(scores) {
  let total = 0;
  let parThru = 0;
  let thru = 0;
  (scores || []).forEach((s, i) => {
    if (isFilled(s)) {
      total += Number(s);
      parThru += holePars()[i];
      thru += 1;
    }
  });
  return { total, diff: total - parThru, thru };
}

function buildTeamRows(game, metricsCtx) {
  const flat = [];
  (game.groups || []).forEach((grp, gi) => {
    const comp = getGroupComposition(game, grp, gi);
    if (!comp || !Array.isArray(comp.teams) || !comp.teams.length) return;

    comp.teams.forEach((team, ti) => {
      const members = normalizeMembers(team, metricsCtx);
      if (!members.length) return;
      const scores = resolveTeamScores(grp, ti, team, metricsCtx);
      const agg = aggregateScores(scores);
      const names = members.map((m) => m.name);
      const teamId = team.teamId || team.id || 'team-' + (ti + 1);
      const rowId = (grp.groupId || 'g-' + gi) + ':' + teamId;

      flat.push({
        rowId,
        isTeam: true,
        teamId,
        groupId: grp.groupId,
        groupIndex: gi,
        name: formatTeamDisplayName(names),
        nameFull: names.join('/'),
        avatar: members[0].avatar || '',
        members,
        total: agg.total,
        diff: agg.diff,
        thru: agg.thru,
        scores
      });
    });
  });
  return flat;
}

function buildPlayerRows(game, metricsCtx) {
  const flat = [];
  (game.groups || []).forEach((grp) => {
    (grp.playersSlots || []).filter(Boolean).forEach((p) => {
      const rec = (grp.scoresByPlayer || {})[p.playerId] || {};
      const scores = (rec.scores || []).slice();
      const agg = aggregateScores(scores);
      const prof = getProfileById(p.playerId, p);
      const hasRawGender = !!(p && (p.gender || p.sex || p.matchGender));
      const genderSource = hasRawGender || FRIEND_ID_SET[p.playerId] ? prof : p;
      const genderDisplay = playerManage.getGenderDisplay(genderSource);
      const playerVm = enrichPlayerIdentity(p, metricsCtx);
      flat.push({
        rowId: p.playerId,
        isTeam: false,
        playerId: p.playerId,
        name: p.name,
        avatar: mockAvatars.resolveAvatar(p.avatar, p.playerId),
        isFemale: genderDisplay.gender === 'female',
        genderIcon: genderDisplay.icon,
        genderClass: genderDisplay.className,
        flag: prof.flag,
        country: prof.country,
        age: prof.age,
        player: playerVm,
        total: agg.total,
        diff: agg.diff,
        thru: agg.thru,
        scores
      });
    });
  });
  return flat;
}

function sortAndRank(flat) {
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
    return Object.assign({}, p, {
      pos,
      thru: started ? thruLabel(p.thru) : '-',
      scoreStr: started ? formatDiffWithPlus(p.diff) : '-',
      scoreClass: started ? totalClass(p.diff) : 'score-even'
    });
  });
}

/**
 * 构建领先榜行 + scoresIndex（rowId → 18 洞成绩数组）
 */
function build(game, openIndex) {
  const metricsCtx = createMetricsContext(game);
  const hasComp = gameHasComposition(game);
  const raw = hasComp
    ? buildTeamRows(game, metricsCtx)
    : buildPlayerRows(game, metricsCtx);
  const ranked = sortAndRank(raw);

  const scoresIndex = {};
  ranked.forEach((row) => {
    scoresIndex[row.rowId] = row.scores || [];
  });

  const leaderboard = ranked.map((row, i) =>
    Object.assign({}, row, {
      expanded: openIndex === i
    })
  );

  return { leaderboard, scoresIndex, hasComposition: hasComp };
}

module.exports = {
  holePars,
  gameHasComposition,
  formatTeamDisplayName,
  enrichPlayerIdentity,
  build,
  isDemoLeaderboardGame,
  isLeaderboardSelfSlot,
  resolveSlotAccountUserId,
  resolvePlayerMetrics,
  createMetricsContext,
  formatLeaderboardMetric
};
