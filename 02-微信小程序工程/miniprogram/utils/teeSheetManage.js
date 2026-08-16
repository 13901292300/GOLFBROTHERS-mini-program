/**
 * 出发管理：组级 teeTime / startHole 草稿编辑与批量生成。
 * 不修改分组成员、不改 position、不碰报名名单。
 */

const mockAvatars = require('./mockAvatars.js');
const playerManage = require('./playerManage.js');
const teamMatchFinish = require('./teamMatchFinish.js');

const TIME_MODE_UNIFORM = 'uniform';
const TIME_MODE_INTERVAL = 'interval';
const HOLE_MODE_MANUAL = 'manual';
const HOLE_MODE_BILATERAL = 'bilateral';

const DEFAULT_INTERVAL_MINUTES = 10;
const MINUTE_STEP = 10;
const TOTAL_HOLES = 18;

function _cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value == null ? null : value));
  } catch (e) {
    return value;
  }
}

function pad2(n) {
  const v = Number(n) || 0;
  return v < 10 ? '0' + v : String(v);
}

function normalizeTeeTime(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  const m = s.match(/(\d{1,2}):(\d{1,2})/);
  if (!m) return '';
  let h = Number(m[1]);
  let min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return '';
  h = Math.max(0, Math.min(23, Math.floor(h)));
  min = Math.max(0, Math.min(59, Math.floor(min)));
  // 对齐 10 分钟步进（就近向下）
  min = Math.floor(min / MINUTE_STEP) * MINUTE_STEP;
  return pad2(h) + ':' + pad2(min);
}

function normalizeStartHole(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const hole = Math.floor(n);
  if (hole < 1 || hole > 18) return null;
  return hole;
}

/** 读取组级开球时间（保存统一 teeTime；读取兼容旧字段） */
function resolveGroupTeeTime(group) {
  if (!group || typeof group !== 'object') return '';
  return normalizeTeeTime(
    group.teeTime != null && group.teeTime !== ''
      ? group.teeTime
      : group.tee_time != null && group.tee_time !== ''
        ? group.tee_time
        : group.startTime != null && group.startTime !== ''
          ? group.startTime
          : group.time
  );
}

/** 读取比赛级默认开球时间（创建比赛时填写的 teeTime / startTime / startAt 等） */
function resolveMatchTeeTime(matchOrGame) {
  if (!matchOrGame || typeof matchOrGame !== 'object') return '';
  return normalizeTeeTime(
    matchOrGame.teeTime != null && matchOrGame.teeTime !== ''
      ? matchOrGame.teeTime
      : matchOrGame.startTime != null && matchOrGame.startTime !== ''
        ? matchOrGame.startTime
        : matchOrGame.startAt != null && matchOrGame.startAt !== ''
          ? matchOrGame.startAt
          : matchOrGame.playTime != null && matchOrGame.playTime !== ''
            ? matchOrGame.playTime
            : matchOrGame.teeTimeText
  );
}

/** 读取正式组级出发洞号：只认 group.startHole，避免从成绩或展示字段动态推算 */
function resolveGroupStartHole(group) {
  if (!group || typeof group !== 'object') return null;
  return normalizeStartHole(group.startHole);
}

function parseTimeToMinutes(teeTime) {
  const t = normalizeTeeTime(teeTime);
  if (!t) return null;
  const parts = t.split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function minutesToTeeTime(totalMinutes) {
  let m = Number(totalMinutes);
  if (!Number.isFinite(m)) return '';
  m = ((Math.floor(m) % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const min = m % 60;
  return pad2(h) + ':' + pad2(min);
}

function normalizeIntervalMinutes(raw) {
  if (raw == null || raw === '') return DEFAULT_INTERVAL_MINUTES;
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_INTERVAL_MINUTES;
  return n;
}

/** 时间选择器选项（每 10 分钟） */
function buildTimeOptions() {
  const out = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += MINUTE_STEP) {
      out.push(pad2(h) + ':' + pad2(m));
    }
  }
  return out;
}

function buildHoleOptions() {
  const out = [];
  for (let i = 1; i <= 18; i++) {
    out.push({ value: i, label: i + '号洞' });
  }
  return out;
}

function resolveGroupId(g, index) {
  if (g && g.groupId != null && String(g.groupId).trim() !== '') {
    return String(g.groupId).trim();
  }
  return 'group-' + (index + 1);
}

function resolveGroupName(g, index) {
  if (g && g.groupName) return String(g.groupName);
  if (g && g.name) return String(g.name);
  return '第' + (index + 1) + '组';
}

function resolvePlayerDisplayName(raw) {
  return playerManage.resolveMatchNickname(raw) || '未知球员';
}

/**
 * 从正式 group + lookup 解析展示球员（只读，不改 players）
 */
function resolveGroupDisplayPlayers(group, playerLookup) {
  const lookup = playerLookup || {};
  const out = [];
  const seen = {};
  const push = (raw) => {
    if (!raw || typeof raw !== 'object') return;
    const userId = playerManage.resolveUserId(raw);
    if (!userId || seen[userId]) return;
    const src = lookup[userId] || raw;
    const name = resolvePlayerDisplayName(src);
    const avatar = mockAvatars.resolveAvatar(
      (src && (src.avatar || src.avatarUrl)) || (raw && (raw.avatar || raw.avatarUrl)) || '',
      userId
    );
    seen[userId] = true;
    out.push({
      userId: userId,
      displayName: name,
      nickname: name,
      name: name,
      avatar: avatar
    });
  };

  const slots = Array.isArray(group && group.players) ? group.players.slice() : [];
  slots.sort((a, b) => (Number(a && a.position) || 0) - (Number(b && b.position) || 0));
  slots.forEach((p) => {
    if (!p) return;
    const uid = playerManage.resolveUserId(p);
    if (!uid) return;
    push(Object.assign({}, lookup[uid] || {}, p, { userId: uid }));
  });

  (Array.isArray(group && group.playersSlots) ? group.playersSlots : []).forEach((p) => {
    if (!p) return;
    push(p);
  });

  return out;
}

function formatHoleLabel(startHole) {
  const hole = normalizeStartHole(startHole);
  return hole != null ? hole + '号洞' : '';
}

function formatTeeMetaLine(teeTime, startHole) {
  const t = normalizeTeeTime(teeTime);
  const h = formatHoleLabel(startHole);
  if (t && h) return t + ' · ' + h + '出发';
  if (t) return t + ' · 待分配';
  if (h) return h + '出发';
  return '待分配';
}

function hasTeeInfo(teeTime, startHole) {
  return !!(normalizeTeeTime(teeTime) || normalizeStartHole(startHole) != null);
}

function isFilledScoreValue(score) {
  const matchStatus = require('./matchStatus.js');
  if (matchStatus && typeof matchStatus.isFilledScore === 'function') {
    return matchStatus.isFilledScore(score);
  }
  return score !== null && score !== undefined && score !== '';
}

function resolveAnyPlayerId(raw) {
  return playerManage.resolveUserId(raw);
}

function _validGroupPlayerIdsFromPlayers(players) {
  const out = [];
  const seen = {};
  (Array.isArray(players) ? players : []).forEach((p) => {
    if (!p) return;
    const id = resolveAnyPlayerId(p);
    if (!id || seen[id]) return;
    seen[id] = true;
    out.push(id);
  });
  return out;
}

function _validGamePlayerIds(group) {
  return _validGroupPlayerIdsFromPlayers(group && group.playersSlots);
}

function _validFormalPlayerIds(group) {
  return _validGroupPlayerIdsFromPlayers(group && group.players);
}

function _findFirstCompletedHole(playerIds, getScoreAtHole) {
  if (!Array.isArray(playerIds) || !playerIds.length) return null;
  for (let hi = 0; hi < TOTAL_HOLES; hi++) {
    const allDone = playerIds.every((id) => isFilledScoreValue(getScoreAtHole(id, hi)));
    if (allDone) return hi + 1;
  }
  return null;
}

/**
 * 团队记分（四人两球等）：第一洞「全部 entity 均有有效成绩」。
 * 与 gameProgress.countCompletedHoles 的 entity 规则一致。
 */
function _findFirstCompletedEntityHole(entities) {
  const list = (Array.isArray(entities) ? entities : []).filter(
    (e) => e && Array.isArray(e.scores)
  );
  if (!list.length) return null;
  for (let hi = 0; hi < TOTAL_HOLES; hi++) {
    const allDone = list.every((e) => isFilledScoreValue((e.scores || [])[hi]));
    if (allDone) return hi + 1;
  }
  return null;
}

function _setAutoStartHole(group, holeNo, options) {
  const hole = normalizeStartHole(holeNo);
  if (!group || hole == null) {
    return { updated: false, holeNo: null };
  }
  const allowOverwrite = !!(options && options.allowOverwrite);
  const current = resolveGroupStartHole(group);
  if (current != null && !allowOverwrite) {
    return { updated: false, holeNo: null };
  }
  if (current === hole && String(group.startHoleSource || '').trim() === 'score_auto') {
    return { updated: false, holeNo: hole };
  }
  group.startHole = hole;
  group.startHoleSource = 'score_auto';
  return { updated: true, holeNo: hole };
}

/**
 * 普通 Game：自动反推 startHole。
 * - 优先 teamScoresByEntity（四人两球等团队记分）：第一完整组合洞 → 可覆盖创建/计划 startHole
 * - 否则 scoresByPlayer（个人比杆）：仅在尚无 startHole 时写入
 */
function inferStartHoleIfNeededForGameGroup(group) {
  if (!group) return { updated: false, holeNo: null };

  const entities = Array.isArray(group.teamScoresByEntity) ? group.teamScoresByEntity : [];
  if (entities.length) {
    const holeNo = _findFirstCompletedEntityHole(entities);
    return _setAutoStartHole(group, holeNo, { allowOverwrite: true });
  }

  if (resolveGroupStartHole(group) != null) {
    return { updated: false, holeNo: null };
  }
  const playerIds = _validGamePlayerIds(group);
  const scoresByPlayer = group.scoresByPlayer || {};
  const holeNo = _findFirstCompletedHole(playerIds, (playerId, hi) => {
    const rec = scoresByPlayer[playerId] || {};
    return (rec.scores || [])[hi];
  });
  return _setAutoStartHole(group, holeNo);
}

/** 赛事会话 groupsStore：从 players[].holes 自动反推 startHole */
function inferStartHoleIfNeededForGroupsStoreGroup(group) {
  if (!group || resolveGroupStartHole(group) != null) {
    return { updated: false, holeNo: null };
  }
  const players = (Array.isArray(group.players) ? group.players : []).filter(Boolean);
  const playerIds = _validGroupPlayerIdsFromPlayers(players);
  const byId = {};
  players.forEach((p) => {
    const id = resolveAnyPlayerId(p);
    if (id) byId[id] = p;
  });
  const holeNo = _findFirstCompletedHole(playerIds, (playerId, hi) => {
    const p = byId[playerId] || {};
    const hole = (p.holes || [])[hi] || {};
    return hole.score;
  });
  return _setAutoStartHole(group, holeNo);
}

/** 正式 match.groups：从记分页 playersSource.scores 自动反推 startHole */
function inferStartHoleIfNeededForFormalGroup(match, groupId, playersSource) {
  if (!match || !Array.isArray(match.groups) || !groupId) {
    return { updated: false, holeNo: null };
  }
  const group = match.groups.find((g) => String(g && g.groupId) === String(groupId));
  if (!group || resolveGroupStartHole(group) != null) {
    return { updated: false, holeNo: null };
  }
  const playerIds = _validFormalPlayerIds(group);
  const byId = {};
  (Array.isArray(playersSource) ? playersSource : []).forEach((p) => {
    const id = resolveAnyPlayerId(p);
    if (id) byId[id] = p;
  });
  const holeNo = _findFirstCompletedHole(playerIds, (playerId, hi) => {
    const p = byId[playerId] || {};
    return (p.scores || [])[hi];
  });
  return _setAutoStartHole(group, holeNo);
}

/**
 * 打开弹屏时：clone groups → draft
 */
function buildTeeSheetDraft(matchOrGame, playerLookup) {
  const groups = Array.isArray(matchOrGame && matchOrGame.groups)
    ? matchOrGame.groups
    : [];
  const matchTeeTime = resolveMatchTeeTime(matchOrGame);
  const draftGroups = groups.map((g, index) => {
    const cloned = _cloneJson(g) || {};
    const teeTime = normalizeTeeTime(cloned.teeTime) || resolveGroupTeeTime(cloned) || matchTeeTime;
    const startHole = resolveGroupStartHole(cloned);
    const displayPlayers = resolveGroupDisplayPlayers(cloned, playerLookup);
    return {
      groupId: resolveGroupId(cloned, index),
      groupName: resolveGroupName(cloned, index),
      teeTime: teeTime,
      startHole: startHole,
      teeTimeLabel: teeTime || '待设置',
      startHoleLabel: startHole != null ? startHole + '号洞' : '待分配',
      playersText: displayPlayers.map((p) => p.displayName).join(' / ') || '暂无球员',
      displayPlayers: displayPlayers,
      // 保留原始 players / playersSlots 引用结构供 commit 时写回字段
      _rawPlayers: cloned.players,
      _rawPlayersSlots: cloned.playersSlots,
      _rawExtra: cloned
    };
  });

  let unifiedTime = '';
  if (draftGroups.length) {
    const first = draftGroups[0].teeTime;
    if (first && draftGroups.every((g) => g.teeTime === first)) {
      unifiedTime = first;
    } else if (first) {
      unifiedTime = first;
    }
  }
  if (!unifiedTime) unifiedTime = matchTeeTime || '08:00';

  return {
    timeMode: TIME_MODE_UNIFORM,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    unifiedTime: unifiedTime,
    holeMode: HOLE_MODE_MANUAL,
    groups: draftGroups,
    hasGroups: draftGroups.length > 0
  };
}

function applyBilateralHoles(groups) {
  const list = Array.isArray(groups) ? groups : [];
  const total = list.length;
  const frontCount = Math.ceil(total / 2);
  return list.map((g, index) => {
    const startHole = index < frontCount ? 1 : 10;
    return Object.assign({}, g, {
      startHole: startHole,
      startHoleLabel: startHole + '号洞'
    });
  });
}

function applyUniformTime(groups, teeTime) {
  const t = normalizeTeeTime(teeTime);
  if (!t) return groups;
  return (groups || []).map((g) =>
    Object.assign({}, g, {
      teeTime: t,
      teeTimeLabel: t
    })
  );
}

/**
 * 从 fromIndex 起按间隔链式递增（含 fromIndex 自身已设好的时间）
 */
function cascadeIntervalFrom(groups, fromIndex, intervalMinutes) {
  const list = (groups || []).map((g) => Object.assign({}, g));
  const step = normalizeIntervalMinutes(intervalMinutes);
  if (fromIndex < 0 || fromIndex >= list.length) return list;
  const base = parseTimeToMinutes(list[fromIndex].teeTime);
  if (base == null) return list;
  for (let i = fromIndex + 1; i < list.length; i++) {
    const next = minutesToTeeTime(base + (i - fromIndex) * step);
    list[i].teeTime = next;
    list[i].teeTimeLabel = next;
  }
  return list;
}

/**
 * 间隔变化后：以第一组已有时间为起点重算后续
 */
function recomputeIntervalChain(groups, intervalMinutes) {
  const list = (groups || []).map((g) => Object.assign({}, g));
  if (!list.length) return list;
  const first = parseTimeToMinutes(list[0].teeTime);
  if (first == null) return list;
  return cascadeIntervalFrom(list, 0, intervalMinutes);
}

function setGroupTeeTime(draft, groupIndex, teeTime) {
  if (!draft || !Array.isArray(draft.groups)) return draft;
  const idx = Number(groupIndex);
  if (!Number.isFinite(idx) || idx < 0 || idx >= draft.groups.length) return draft;
  const t = normalizeTeeTime(teeTime);
  const groups = draft.groups.map((g, i) => {
    if (i !== idx) return g;
    return Object.assign({}, g, {
      teeTime: t,
      teeTimeLabel: t || '待设置'
    });
  });
  let nextGroups = groups;
  if (draft.timeMode === TIME_MODE_INTERVAL && t) {
    nextGroups = cascadeIntervalFrom(groups, idx, draft.intervalMinutes);
  }
  return Object.assign({}, draft, { groups: nextGroups });
}

function setGroupStartHole(draft, groupIndex, startHole) {
  if (!draft || !Array.isArray(draft.groups)) return draft;
  const idx = Number(groupIndex);
  if (!Number.isFinite(idx) || idx < 0 || idx >= draft.groups.length) return draft;
  const hole = normalizeStartHole(startHole);
  const groups = draft.groups.map((g, i) => {
    if (i !== idx) return g;
    return Object.assign({}, g, {
      startHole: hole,
      startHoleLabel: hole != null ? hole + '号洞' : '待分配'
    });
  });
  return Object.assign({}, draft, { groups: groups });
}

function setTimeMode(draft, timeMode) {
  if (!draft) return draft;
  const mode = timeMode === TIME_MODE_INTERVAL ? TIME_MODE_INTERVAL : TIME_MODE_UNIFORM;
  let next = Object.assign({}, draft, { timeMode: mode });
  if (mode === TIME_MODE_INTERVAL) {
    // 选择「每 N 分钟」时，发球台默认切到双边逐组
    next.holeMode = HOLE_MODE_BILATERAL;
    next.groups = applyBilateralHoles(next.groups);
    if (next.groups.length && next.groups[0].teeTime) {
      next.groups = recomputeIntervalChain(next.groups, next.intervalMinutes);
    }
  } else if (normalizeTeeTime(next.unifiedTime)) {
    next.groups = applyUniformTime(next.groups, next.unifiedTime);
  }
  return next;
}

function setUnifiedTime(draft, teeTime) {
  if (!draft) return draft;
  const t = normalizeTeeTime(teeTime) || draft.unifiedTime;
  let groups = draft.groups;
  if (draft.timeMode === TIME_MODE_UNIFORM) {
    groups = applyUniformTime(draft.groups, t);
  }
  return Object.assign({}, draft, { unifiedTime: t, groups: groups });
}

function setIntervalMinutes(draft, minutes) {
  if (!draft) return draft;
  const intervalMinutes = normalizeIntervalMinutes(minutes);
  let groups = draft.groups;
  if (draft.timeMode === TIME_MODE_INTERVAL) {
    groups = recomputeIntervalChain(draft.groups, intervalMinutes);
  }
  return Object.assign({}, draft, { intervalMinutes: intervalMinutes, groups: groups });
}

function setHoleMode(draft, holeMode) {
  if (!draft) return draft;
  const mode = holeMode === HOLE_MODE_BILATERAL ? HOLE_MODE_BILATERAL : HOLE_MODE_MANUAL;
  let groups = draft.groups;
  if (mode === HOLE_MODE_BILATERAL) {
    groups = applyBilateralHoles(draft.groups);
  }
  return Object.assign({}, draft, { holeMode: mode, groups: groups });
}

/**
 * 将 draft 写回 match.groups：仅更新 teeTime / startHole，保留其余字段与 players
 */
function commitTeeSheetDraft(matchOrGame, draft) {
  if (!matchOrGame || !draft || !Array.isArray(draft.groups)) {
    return { ok: false, reason: 'invalid' };
  }
  if (teamMatchFinish.isMatchCompleted(matchOrGame)) {
    return {
      ok: false,
      reason: 'match_finished',
      message: teamMatchFinish.MATCH_FINISHED_TOAST
    };
  }
  var seriesTeeGuard = teamMatchFinish.assertWritable(matchOrGame);
  if (!seriesTeeGuard.ok) {
    return {
      ok: false,
      reason: seriesTeeGuard.reason,
      message: seriesTeeGuard.message
    };
  }
  const byId = {};
  draft.groups.forEach((g) => {
    if (g && g.groupId) byId[String(g.groupId)] = g;
  });
  const source = Array.isArray(matchOrGame.groups) ? matchOrGame.groups : [];
  const matchTeeTime = resolveMatchTeeTime(matchOrGame);
  matchOrGame.groups = source.map((g, index) => {
    const gid = resolveGroupId(g, index);
    const d = byId[gid] || draft.groups[index];
    const next = Object.assign({}, g);
    if (d) {
      const t = normalizeTeeTime(d.teeTime) || resolveGroupTeeTime(d) || matchTeeTime;
      const h = normalizeStartHole(d.startHole);
      const previousStartHole = resolveGroupStartHole(g);
      const previousSource = String((g && g.startHoleSource) || '').trim();
      if (t) next.teeTime = t;
      else delete next.teeTime;
      if (h != null) next.startHole = h;
      else delete next.startHole;
      if (h != null) {
        next.startHoleSource =
          previousStartHole === h && previousSource
            ? previousSource
            : 'manual';
      }
      else delete next.startHoleSource;
      // 清理可能冲突的旧字段，避免双数据源
      delete next.tee_time;
      delete next.startTime;
      delete next.start_hole;
      delete next.startHoleNo;
      delete next.teeHole;
      delete next.holeNo;
    }
    return next;
  });
  return { ok: true, groups: matchOrGame.groups };
}

/**
 * 分组保存时按 groupId 合并保留 teeTime / startHole
 */
function mergeTeeFieldsByGroupId(prevGroups, nextGroups) {
  const prev = Array.isArray(prevGroups) ? prevGroups : [];
  const next = Array.isArray(nextGroups) ? nextGroups : [];
  const map = {};
  prev.forEach((g, i) => {
    const id = resolveGroupId(g, i);
    map[id] = {
      teeTime: resolveGroupTeeTime(g),
      startHole: resolveGroupStartHole(g)
    };
  });
  return next.map((g, i) => {
    const id = resolveGroupId(g, i);
    const keep = map[id];
    if (!keep) return g;
    const out = Object.assign({}, g);
    if (keep.teeTime) out.teeTime = keep.teeTime;
    if (keep.startHole != null) out.startHole = keep.startHole;
    return out;
  });
}

/**
 * 出发表 TAB 视图（正式 groups）
 */
function buildTeeSheetTabView(matchOrGame, options) {
  const opts = options || {};
  const playerLookup = opts.playerLookup || {};
  const groups = Array.isArray(matchOrGame && matchOrGame.groups)
    ? matchOrGame.groups
    : [];
  const matchTeeTime = resolveMatchTeeTime(matchOrGame);
  const matchStatus = require('./matchStatus.js');
  return groups.map((g, index) => {
    const teeTime = resolveGroupTeeTime(g) || matchTeeTime;
    const startHole = resolveGroupStartHole(g);
    const displayPlayers = resolveGroupDisplayPlayers(g, playerLookup);
    const source = opts.source || 'match';
    // 球队赛 source:'match'：把 match.scoreData 传入状态中心；普通局 source:'game' 不传，逻辑不变
    const statusOpts =
      source === 'match'
        ? {
            source: 'match',
            scoreData:
              (matchOrGame && matchOrGame.scoreData) ||
              opts.scoreData ||
              null
          }
        : { source: source };
    const ms = matchStatus.getMatchStatus
      ? matchStatus.getMatchStatus(g, statusOpts)
      : { statusBadge: '', statusKey: '', status: '' };
    return {
      id: resolveGroupId(g, index),
      groupId: resolveGroupId(g, index),
      badge: resolveGroupName(g, index),
      name: resolveGroupName(g, index),
      time: teeTime || '待设置',
      hole: startHole != null ? startHole + '号洞' : '待分配',
      teeTime: teeTime,
      startHole: startHole,
      teeMetaLine: formatTeeMetaLine(teeTime, startHole),
      hasTeeInfo: hasTeeInfo(teeTime, startHole),
      statusBadge: (ms && ms.statusBadge) || '',
      statusKey: (ms && ms.statusKey) || '',
      matchStatus: (ms && ms.status) || '',
      players: displayPlayers.map((p) => ({
        playerId: p.userId,
        userId: p.userId,
        displayName: p.displayName,
        nickname: p.nickname,
        name: p.name,
        avatar: p.avatar
      }))
    };
  });
}

function _resolveTeeCardPlayerId(player) {
  if (!player || typeof player !== 'object') return '';
  const id = player.userId || player.playerId || player.id || player.uid || player.openid;
  return id != null ? String(id).trim() : '';
}

function _resolveTeeSheetLiveHoleCount(match, group) {
  if (!match || !group) return 0;
  const personalLeaderboardBoard = require('./personalLeaderboardBoard.js');
  const players = Array.isArray(group.players) ? group.players.filter(Boolean) : [];
  let maxThru = 0;
  players.forEach((p) => {
    const pid = _resolveTeeCardPlayerId(p);
    const thru =
      (personalLeaderboardBoard.computePlayerStats(match, group, p, pid) || {}).thru || 0;
    if (thru > maxThru) maxThru = thru;
  });
  return maxThru;
}

/**
 * 出发表 LIVE 角标：洞数 + 可选用时（如 3H 45'）。
 * 与赛事详情出发表同一投影：仅覆盖 statusKey==='live' 的组；不改 statusKey / matchStatus。
 */
function applyLiveHoleStatusBadgeToTeeGroups(match, teeGroups) {
  const list = Array.isArray(teeGroups) ? teeGroups : [];
  if (!list.length) return list;
  const gameProgress = require('./gameProgress.js');
  const groups = match && Array.isArray(match.groups) ? match.groups : [];
  const groupById = {};
  groups.forEach((g) => {
    if (!g || g.groupId == null) return;
    groupById[String(g.groupId)] = g;
  });
  const scoreData =
    match && match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : null;
  return list.map((card) => {
    if (!card || card.statusKey !== 'live') return card;
    const groupId =
      card.groupId != null || card.id != null ? String(card.groupId || card.id) : '';
    let holeCount = 0;
    if (match) {
      holeCount = _resolveTeeSheetLiveHoleCount(match, groupById[groupId] || null);
    }
    let statusBadge = String(holeCount) + 'H';
    const bucket =
      scoreData && groupId && scoreData[groupId] && typeof scoreData[groupId] === 'object'
        ? scoreData[groupId]
        : null;
    const firstScoreAt = bucket ? Number(bucket.firstScoreAt) : NaN;
    if (Number.isFinite(firstScoreAt) && firstScoreAt > 0) {
      const finishedScoreAt = bucket ? Number(bucket.finishedScoreAt) : NaN;
      const endMs =
        Number.isFinite(finishedScoreAt) && finishedScoreAt > 0
          ? finishedScoreAt
          : Date.now();
      statusBadge =
        statusBadge + gameProgress.formatLiveDurationBadgeSuffix(firstScoreAt, endMs);
    }
    return Object.assign({}, card, { statusBadge: statusBadge });
  });
}

function canManageTeeSheet(matchOrGame, userId, isPrivileged) {
  if (isPrivileged) return true;
  const uid = String(userId || '').trim();
  if (!uid || !matchOrGame) return false;
  const creatorId = String(
    matchOrGame.createdBy || matchOrGame.creatorId || ''
  ).trim();
  if (creatorId && creatorId === uid) return true;
  const tempAdminPermission = require('./tempAdminPermission.js');
  return (
    tempAdminPermission.hasTempAdminPermission(matchOrGame, uid, 'manage_tee_sheet') ||
    tempAdminPermission.hasTempAdminPermission(matchOrGame, uid, 'tee_management')
  );
}

module.exports = {
  TIME_MODE_UNIFORM,
  TIME_MODE_INTERVAL,
  HOLE_MODE_MANUAL,
  HOLE_MODE_BILATERAL,
  DEFAULT_INTERVAL_MINUTES,
  MINUTE_STEP,
  normalizeTeeTime,
  normalizeStartHole,
  resolveGroupTeeTime,
  resolveMatchTeeTime,
  resolveGroupStartHole,
  normalizeIntervalMinutes,
  buildTimeOptions,
  buildHoleOptions,
  formatHoleLabel,
  formatTeeMetaLine,
  buildTeeSheetDraft,
  setTimeMode,
  setUnifiedTime,
  setIntervalMinutes,
  setHoleMode,
  setGroupTeeTime,
  setGroupStartHole,
  applyBilateralHoles,
  cascadeIntervalFrom,
  recomputeIntervalChain,
  commitTeeSheetDraft,
  mergeTeeFieldsByGroupId,
  buildTeeSheetTabView,
  applyLiveHoleStatusBadgeToTeeGroups,
  resolveGroupDisplayPlayers,
  inferStartHoleIfNeededForGameGroup,
  inferStartHoleIfNeededForGroupsStoreGroup,
  inferStartHoleIfNeededForFormalGroup,
  canManageTeeSheet
};
