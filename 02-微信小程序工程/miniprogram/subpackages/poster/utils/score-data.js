/**
 * 海报 / 成绩卡数据源：从 gameStore 读取当前用户真实 18 洞成绩。
 * 无场次、无分组或读取失败时回退 SAMPLE。
 */

const gameStore = require('../../../utils/gameStore.js');
const matchState = require('../../../utils/matchState.js');
const holeLayout = require('../../../utils/holeLayout.js');
const { remapPosterFonts } = require("./poster-data");

const HOLE_COUNT = 18;
const DEFAULT_PAR = 72;

const SAMPLE_STROKES = [
  '4', '4', '4', '3', '4', '5', '4', '3', '4',
  '4', '4', '4', '3', '4', '5', '4', '3', '4'
];
const SAMPLE_RELATIVE = [
  '0', '0', '0', '0', '0', '0', '0', '0', '0',
  '0', '0', '0', '0', '0', '0', '0', '0', '0'
];

/** 无真实数据时的演示成绩（18 洞均为标准杆） */
const SAMPLE = {
  source: 'sample',
  gameId: '',
  playerId: 'me',
  playerName: 'Ken Duan',
  nickname: 'Ken Duan',
  courseName: 'Pinehurst No. 2',
  course: 'Pinehurst No. 2',
  date: '2026-08-17',
  extra: '',
  par: DEFAULT_PAR,
  roundPar: DEFAULT_PAR,
  total: DEFAULT_PAR,
  toPar: 0,
  scoreMode: 'strokes',
  templateId: 'template1',
  photoPath: '',
  scores: SAMPLE_STROKES.slice(),
  strokes: SAMPLE_STROKES.slice(),
  relative: SAMPLE_RELATIVE.slice(),
  highlights: [],
  putts: [],
  fairways: [],
  penalties: [],
  sands: [],
  holePars: [4, 4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4]
};

/**
 * 将成绩格规范为字符串：null / undefined / '' → ''，其余转字符串。
 */
function cellToDisplay(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

/**
 * 将任意成绩数组补齐或截断为 18 洞展示值。
 */
function padScores(list) {
  const src = Array.isArray(list) ? list : [];
  const out = [];
  for (let i = 0; i < HOLE_COUNT; i++) {
    out.push(cellToDisplay(src[i]));
  }
  return out;
}

/**
 * 累加 18 洞中已填的数字杆数（忽略空格与非数字）。
 */
function sumFilledScores(scores) {
  const list = Array.isArray(scores) ? scores : [];
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    const n = Number(list[i]);
    if (list[i] === null || list[i] === undefined || list[i] === '') continue;
    if (!Number.isFinite(n)) continue;
    total += n;
  }
  return total;
}

/**
 * 时间戳 / Date / 日期字符串 → YYYY-MM-DD（本地时区）。
 */
function formatDateYMD(value) {
  if (value === null || value === undefined || value === '') return '';
  const d = value instanceof Date ? value : new Date(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const mm = m < 10 ? '0' + m : String(m);
  const dd = day < 10 ? '0' + day : String(day);
  return y + '-' + mm + '-' + dd;
}

/**
 * 读取全局 currentGameId（页面未传 roundId 时的第二兜底）。
 */
function readGlobalGameId() {
  try {
    const app = getApp();
    const gid = app && app.globalData && app.globalData.currentGameId;
    return gid != null ? String(gid).trim() : '';
  } catch (e) {
    return '';
  }
}

/**
 * 解析当前场次 gameId：
 * roundId → matchState.gameId → globalData.currentGameId → listGames()[0]
 */
function resolveGameId(roundId) {
  const fromArg = roundId != null ? String(roundId).trim() : '';
  if (fromArg) return fromArg;

  try {
    const ms = matchState.getMatchState();
    const fromMs = ms && (ms.gameId || ms.matchId);
    if (fromMs != null && String(fromMs).trim()) return String(fromMs).trim();
  } catch (e) {
    /* ignore */
  }

  const fromGlobal = readGlobalGameId();
  if (fromGlobal) return fromGlobal;

  const list = gameStore.listGames() || [];
  if (list.length && list[0] && list[0].gameId) return String(list[0].gameId);
  return '';
}

/**
 * 解析当前组下标：优先 matchState.groupIndex，否则 0。
 */
function resolveGroupIndex() {
  try {
    const ms = matchState.getMatchState();
    if (ms && ms.groupIndex != null && ms.groupIndex !== '') {
      const n = Number(ms.groupIndex);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  } catch (e) {
    /* ignore */
  }
  return 0;
}

/**
 * 取用于读成绩的组对象：有 groups 时按 groupIndex，否则用 game 自身（旧单组结构）。
 */
function resolveScoreGroup(game, gameId, groupIndex) {
  if (!game) return null;
  const fromStore = gameStore.getGroup(gameId, groupIndex);
  if (fromStore) return fromStore;
  if (Array.isArray(game.groups) && game.groups.length) {
    return game.groups[groupIndex] || game.groups[0] || null;
  }
  return game;
}

/**
 * 在 playersSlots 中查找当前用户槽位（跳过空位）。
 */
function findPlayerSlot(group, playerId) {
  const slots = listGroupSlots(group);
  const pid = String(playerId || '').trim();
  let slotIndex = -1;
  for (let i = 0; i < slots.length; i++) {
    const p = slots[i];
    if (!p) continue;
    if (pid && memberMatchesPlayer(p, pid)) {
      slotIndex = i;
      break;
    }
  }
  const slot = slotIndex >= 0 ? slots[slotIndex] : null;
  return { slots: slots, slotIndex: slotIndex, slot: slot };
}

const DEFAULT_NICKNAME = '球员';

function currentUserId() {
  try {
    const me = gameStore.getCurrentUser();
    return String((me && me.userId) || 'me').trim() || 'me';
  } catch (e) {
    return 'me';
  }
}

function resolveSelfNickname() {
  try {
    const userProfileStore = require('../../../utils/userProfileStore.js');
    const p = userProfileStore.loadProfile() || {};
    const nick = String(p.nickname || p.displayName || p.competitionName || '').trim();
    if (nick) return nick;
  } catch (e) {
    /* ignore */
  }
  try {
    const me = gameStore.getCurrentUser();
    const n = me && me.name ? String(me.name).trim() : '';
    if (n) return n;
  } catch (e) {
    /* ignore */
  }
  return DEFAULT_NICKNAME;
}

function isCurrentUserId(id) {
  const pid = String(id || '').trim();
  if (!pid) return false;
  const meId = currentUserId();
  return pid === meId || pid === 'me';
}

function posterDisplayName(id, fallbackName) {
  const selfName = resolveSelfNickname();
  const n = String(fallbackName || '').replace(/TIGERHOODS/g, selfName).trim();
  if (isCurrentUserId(id)) {
    if (n.indexOf('&') >= 0) return n || selfName;
    return selfName;
  }
  return n;
}

const COMBO_GAME_MODES = {
  最好成绩赛: true,
  最佳球位赛: true,
  四人两球赛: true,
  最好成绩比杆赛: true,
  四人四球比杆赛: true,
  最佳球位比杆赛: true,
  四人两球比杆赛: true,
  最好成绩比洞赛: true,
  四人四球比洞赛: true,
  最佳球位比洞赛: true,
  四人两球比洞赛: true
};

function memberIdOf(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
  return String(raw.playerId || raw.userId || raw.id || '').trim();
}

function memberNameOf(raw) {
  if (!raw || typeof raw !== 'object') return '';
  return String(raw.name || raw.nickname || raw.displayName || '').trim();
}

function formatComboNickname(names) {
  const list = (names || []).map((n) => String(n || '').trim()).filter(Boolean);
  if (list.length >= 2) return list.join('&');
  return list[0] || '';
}

function isComboGameModeName(mode) {
  return !!COMBO_GAME_MODES[String(mode || '').trim()];
}

function readGroupComposition(host, group, groupIndex) {
  const map = (host && host.groupCompositionMap) || {};
  const gid = (group && (group.groupId || group.id)) || '';
  if (gid && map[gid]) return map[gid];
  if (group && group.composition) return group.composition;
  if ((groupIndex || 0) === 0 && host && host.composition) return host.composition;
  return null;
}

function listGroupSlots(group) {
  if (!group || typeof group !== 'object') return [];
  if (Array.isArray(group.playersSlots)) return group.playersSlots;
  if (Array.isArray(group.players)) return group.players;
  return [];
}

function slotNameById(group, playerId) {
  const pid = String(playerId || '').trim();
  if (!pid) return '';
  const slots = listGroupSlots(group);
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot) continue;
    if (memberIdOf(slot) === pid) return memberNameOf(slot);
  }
  return '';
}

function registerNameById(host, playerId) {
  const pid = String(playerId || '').trim();
  if (!pid || !host) return '';
  const users =
    (host.registerInfo && Array.isArray(host.registerInfo.users) && host.registerInfo.users) ||
    [];
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (!user) continue;
    if (memberIdOf(user) === pid) return memberNameOf(user);
  }
  return '';
}

function namesFromMembers(host, group, members) {
  const list = Array.isArray(members) ? members : [];
  const names = [];
  for (let i = 0; i < list.length; i++) {
    const raw = list[i];
    const id = memberIdOf(raw);
    const fromObj = memberNameOf(raw);
    if (fromObj) {
      names.push(posterDisplayName(id, fromObj));
      continue;
    }
    const fromSlot = slotNameById(group, id);
    if (fromSlot) {
      names.push(posterDisplayName(id, fromSlot));
      continue;
    }
    const fromRegister = registerNameById(host, id);
    if (fromRegister) names.push(posterDisplayName(id, fromRegister));
  }
  return names;
}

function listScoreEntities(host, group) {
  if (group && Array.isArray(group.scoreEntities)) return group.scoreEntities;
  const map = host && host.scoreEntities;
  const gid = group && (group.groupId || group.id);
  if (map && gid && Array.isArray(map[gid])) return map[gid];
  if (map && gid && Array.isArray(map[String(gid)])) return map[String(gid)];
  return [];
}

function findComboMembersForPlayer(host, group, groupIndex, playerId) {
  const ctx = findComboTeamContext(host, group, groupIndex, playerId);
  return ctx && Array.isArray(ctx.members) ? ctx.members : [];
}

function isPairSlotComboMode(host) {
  const mode = String((host && (host.gameMode || host.selectedGameMode)) || '');
  return mode.indexOf('四人两球') >= 0;
}

function isComboHost(host) {
  const mode = (host && (host.gameMode || host.selectedGameMode)) || '';
  if (isComboGameModeName(mode)) return true;
  try {
    const teamMatchStore = require('../../../utils/teamMatchStore.js');
    if (teamMatchStore.isComboGameMode && teamMatchStore.isComboGameMode(mode)) return true;
  } catch (e) {
    /* ignore */
  }
  return false;
}

function hostUsesComboScores(host, group, groupIndex, playerId) {
  if (isComboHost(host)) return true;
  const members = findComboMembersForPlayer(host, group, groupIndex, playerId);
  return members.length >= 2;
}

function memberMatchesPlayer(raw, playerId) {
  const pid = String(playerId || '').trim();
  if (!pid || raw == null) return false;
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim() === pid;
  const ids = [raw.playerId, raw.userId, raw.playerUserId, raw.id]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean);
  return ids.indexOf(pid) >= 0;
}

function findComboTeamContext(host, group, groupIndex, playerId) {
  const pid = String(playerId || '').trim();
  if (!pid) return null;

  const comp = readGroupComposition(host, group, groupIndex);
  const teams = comp && Array.isArray(comp.teams) ? comp.teams : [];
  for (let t = 0; t < teams.length; t++) {
    const members = (teams[t] && (teams[t].members || teams[t].players)) || [];
    if (members.some((m) => memberMatchesPlayer(m, pid))) {
      return {
        teamIndex: t,
        members: members,
        teamId: String((teams[t] && (teams[t].teamId || teams[t].id || teams[t].entityId)) || '').trim()
      };
    }
  }

  const entities = listScoreEntities(host, group);
  for (let e = 0; e < entities.length; e++) {
    const entity = entities[e];
    const members = (entity && entity.members) || [];
    if (members.some((m) => memberMatchesPlayer(m, pid))) {
      return {
        teamIndex: e,
        members: members,
        teamId: String((entity && (entity.entityId || entity.teamId || entity.id)) || '').trim()
      };
    }
  }

  if (isPairSlotComboMode(host)) {
    const slots = listGroupSlots(group);
    let slotIndex = -1;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] && memberMatchesPlayer(slots[i], pid)) {
        slotIndex = i;
        break;
      }
    }
    if (slotIndex >= 0) {
      const pairStart = slotIndex < 2 ? 0 : 2;
      const pair = [slots[pairStart], slots[pairStart + 1]].filter(Boolean);
      if (pair.length >= 2) {
        return {
          teamIndex: pairStart === 0 ? 0 : 1,
          members: pair,
          teamId: ''
        };
      }
    }
  }
  return null;
}

function listTeamScoreRecords(host, group) {
  const out = [];
  const seen = [];
  const pushList = (arr) => {
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i++) {
      const rec = arr[i];
      if (!rec || typeof rec !== 'object') continue;
      if (seen.indexOf(rec) >= 0) continue;
      seen.push(rec);
      out.push(rec);
    }
  };
  pushList(group && group.teamScoresByEntity);
  pushList(host && host.teamScoresByEntity);
  const gid = group && (group.groupId || group.id);
  const scoreData = host && host.scoreData;
  if (scoreData && gid != null && gid !== '') {
    const bucket = scoreData[gid] || scoreData[String(gid)];
    if (bucket) pushList(bucket.teamScoresByEntity);
  }
  return out;
}

function recordTeamKey(rec) {
  if (!rec || typeof rec !== 'object') return '';
  return String(rec.teamId || rec.entityId || rec.id || '').trim();
}

function pickTeamEntityScores(records, ctx) {
  if (!Array.isArray(records) || !records.length) return null;
  const tid = ctx ? String(ctx.teamId || '').trim() : '';
  if (tid) {
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (recordTeamKey(rec) === tid) return Array.isArray(rec.scores) ? rec.scores : [];
    }
  }
  if (ctx && Number.isFinite(Number(ctx.teamIndex)) && records[ctx.teamIndex]) {
    const byIndex = records[ctx.teamIndex];
    return Array.isArray(byIndex.scores) ? byIndex.scores : [];
  }
  return null;
}

function toParFromFilledHoles(scores, holePars) {
  const list = Array.isArray(scores) ? scores : [];
  const pars = Array.isArray(holePars) ? holePars : [];
  let total = 0;
  let parThru = 0;
  let count = 0;
  for (let i = 0; i < HOLE_COUNT; i++) {
    const n = Number(list[i]);
    if (list[i] === '' || list[i] === null || list[i] === undefined || !Number.isFinite(n)) continue;
    const par = Number(pars[i]);
    parThru += Number.isFinite(par) && par > 0 ? par : 4;
    total += n;
    count += 1;
  }
  if (!count) return { total: '', toPar: null };
  return { total: total, toPar: total - parThru };
}

function resolvePosterStrokeScores(host, group, groupIndex, playerId, personalScores) {
  if (hostUsesComboScores(host, group, groupIndex, playerId)) {
    const ctx = findComboTeamContext(host, group, groupIndex, playerId);
    const entityScores = pickTeamEntityScores(listTeamScoreRecords(host, group), ctx);
    return padScores(entityScores || []);
  }
  return padScores(personalScores);
}

/**
 * 组合成绩昵称：两名（或以上）球员用 & 连接，如 A&B。
 */
function resolveComboNickname(host, group, groupIndex, playerId, fallbackName) {
  if (!hostUsesComboScores(host, group, groupIndex, playerId)) return fallbackName;
  const members = findComboMembersForPlayer(host, group, groupIndex, playerId);
  const nick = formatComboNickname(namesFromMembers(host, group, members));
  return nick || fallbackName;
}

/**
 * 「我」生成海报时用个人资料昵称；他人仍用槽位 name。
 */
function resolvePlayerDisplayName(found, playerId) {
  const slotId = memberIdOf(found && found.slot) || playerId;
  if (isCurrentUserId(playerId) || isCurrentUserId(slotId)) {
    return resolveSelfNickname();
  }

  const slotName = memberNameOf(found && found.slot);
  if (slotName) return posterDisplayName(slotId, slotName);

  let userName = '';
  try {
    const me = gameStore.getCurrentUser();
    userName = me && me.name ? String(me.name).trim() : '';
  } catch (e) {
    /* ignore */
  }
  if (userName) {
    console.warn('[score-data] slot name missing, use current user name', {
      playerId: playerId,
      slotIndex: found && found.slotIndex
    });
    return posterDisplayName(playerId, userName);
  }

  console.warn('[score-data] nickname missing, fallback 球员', {
    playerId: playerId,
    slotIndex: found && found.slotIndex
  });
  return DEFAULT_NICKNAME;
}

/**
 * 标准杆：game.par → 球场 holeLayout 18 洞合计 → 记分页当前 layout 的 TOT → 72。
 */
function resolvePar(game) {
  const direct = Number(game && game.par);
  if (Number.isFinite(direct) && direct > 0) return direct;

  try {
    const layout = holeLayout.resolveLayoutFromContext({
      courseId: game && game.courseId,
      courseName: game && game.courseName,
      front9Course: game && game.front9Course,
      back9Course: game && game.back9Course
    });
    const pars = layout && Array.isArray(layout.holePars) ? layout.holePars : [];
    if (pars.length) {
      let sum = 0;
      for (let i = 0; i < pars.length; i++) sum += Number(pars[i]) || 0;
      if (sum > 0) return sum;
    }
  } catch (e) {
    /* ignore */
  }

  try {
    const active = holeLayout.getLayout();
    const tot = active && Array.isArray(active.columnPars) ? Number(active.columnPars[20]) : 0;
    if (Number.isFinite(tot) && tot > 0) return tot;
  } catch (e) {
    /* ignore */
  }

  return DEFAULT_PAR;
}

/**
 * 读取 18 洞标准杆数组，供杆差换算。
 */
function resolveHolePars(game) {
  try {
    const layout = holeLayout.resolveLayoutFromContext({
      courseId: game && game.courseId,
      courseName: game && game.courseName,
      front9Course: game && game.front9Course,
      back9Course: game && game.back9Course
    });
    if (layout && Array.isArray(layout.holePars) && layout.holePars.length === HOLE_COUNT) {
      return layout.holePars.slice();
    }
  } catch (e) {
    /* ignore */
  }
  try {
    const active = holeLayout.getLayout();
    if (active && Array.isArray(active.holePars) && active.holePars.length === HOLE_COUNT) {
      return active.holePars.slice();
    }
  } catch (e) {
    /* ignore */
  }
  return [4, 4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4];
}

/**
 * 总杆数组 → 相对标准杆（空洞保持空串）。
 */
function buildRelativeScores(scores, holePars) {
  const out = [];
  const pars = Array.isArray(holePars) ? holePars : [];
  for (let i = 0; i < HOLE_COUNT; i++) {
    const raw = scores[i];
    const n = Number(raw);
    if (raw === '' || raw === null || raw === undefined || !Number.isFinite(n)) {
      out.push('');
      continue;
    }
    const par = Number(pars[i]);
    const holePar = Number.isFinite(par) && par > 0 ? par : 4;
    const diff = n - holePar;
    out.push(diff === 0 ? '0' : diff > 0 ? '+' + diff : String(diff));
  }
  return out;
}

/**
 * 把 gameStore 成绩记录组装为海报数据；无效则返回 null（由调用方回退 SAMPLE）。
 */
function buildScoreDataFromGame(game, gameId, groupIndex, playerId) {
  if (!game) return null;
  const group = resolveScoreGroup(game, gameId, groupIndex);
  if (!group) return null;

  const found = findPlayerSlot(group, playerId);
  const comboPlayerId = memberIdOf(found.slot) || playerId;
  const rec =
    gameStore.resolveGroupSlotScoreRecord(group, found.slotIndex, comboPlayerId) || {
      scores: [],
      putts: []
    };

  const scores = resolvePosterStrokeScores(game, group, groupIndex, comboPlayerId, rec.scores);
  const holePars = resolveHolePars(game);
  const agg = toParFromFilledHoles(scores, holePars);
  const total = agg.total;
  const par = resolvePar(game);
  const relative = buildRelativeScores(scores, holePars);
  const playerName = resolvePlayerDisplayName(found, playerId);
  const nickname = resolveComboNickname(game, group, groupIndex, comboPlayerId, playerName);
  const date = formatDateYMD(game.createdAt) || formatDateYMD(Date.now());
  const extra = game.roundName || game.gameMode || '';

  return {
    source: 'gameStore',
    gameId: gameId,
    groupIndex: groupIndex,
    slotIndex: found.slotIndex,
    playerId: playerId,
    playerName: playerName,
    nickname: nickname,
    courseName: game.courseName || '',
    course: game.courseName || '',
    date: date,
    extra: extra,
    par: par,
    roundPar: par,
    total: total,
    toPar: agg.toPar,
    scoreMode: 'strokes',
    templateId: 'template1',
    photoPath: '',
    scores: scores,
    strokes: scores.slice(),
    relative: relative,
    highlights: [],
    putts: Array.isArray(rec.putts) ? rec.putts.slice() : [],
    fairways: Array.isArray(rec.fairways) ? rec.fairways.slice() : [],
    penalties: Array.isArray(rec.penalties) ? rec.penalties.slice() : [],
    sands: Array.isArray(rec.sands) ? rec.sands.slice() : [],
    holePars: holePars
  };
}

function cloneSampleScoreData() {
  const name = resolveSelfNickname();
  return Object.assign({}, SAMPLE, {
    playerName: name,
    nickname: name,
    scores: SAMPLE_STROKES.slice(),
    strokes: SAMPLE_STROKES.slice(),
    relative: SAMPLE_RELATIVE.slice()
  });
}

/**
 * 获取海报用成绩数据。
 * @param {string} [roundId] 页面参数中的场次 ID（即 gameId）
 * @returns {object} 真实数据或 SAMPLE
 */
function getScoreData(roundId) {
  try {
    const me = gameStore.getCurrentUser();
    const playerId = (me && me.userId) || 'me';
    const gameId = resolveGameId(roundId);
    if (!gameId) return cloneSampleScoreData();

    const game = gameStore.getGame(gameId) || gameStore.getGameById(gameId);
    let host = game;
    if (!host) {
      try {
        const teamMatchStore = require('../../../utils/teamMatchStore.js');
        host = teamMatchStore.getMatchById(gameId);
      } catch (e) {
        host = null;
      }
    }
    if (!host) return cloneSampleScoreData();

    const groupIndex = resolveGroupIndex();
    const data = buildScoreDataFromGame(host, gameId, groupIndex, playerId);
    if (!data) return cloneSampleScoreData();
    return data;
  } catch (e) {
    console.warn('[score-data] getScoreData failed, fallback sample', e);
    return cloneSampleScoreData();
  }
}

/**
 * 将成绩数据写入海报 Canvas 模型（identity / scoreSets）。
 */
function applyScoreData(model, scoreData) {
  const src = scoreData || cloneSampleScoreData();
  if (!model || typeof model !== 'object') return model;

  const strokes = padScores(src.strokes || src.scores);
  const relative = padScores(src.relative);
  const playerName =
    posterDisplayName(src.playerId, src.nickname || src.playerName || src.name) || DEFAULT_NICKNAME;
  if (!String(src.nickname || src.playerName || src.name || '').trim()) {
    console.warn('[score-data] applyScoreData nickname empty, fallback 球员', src.gameId, src.playerId);
  }
  const courseName = src.course || src.courseName || '';
  const date = src.date || '';
  const extra = src.extra || '';
  const par = Number(src.roundPar || src.par) > 0 ? Number(src.roundPar || src.par) : DEFAULT_PAR;
  const total = src.total == null || src.total === ''
    ? sumFilledScores(strokes)
    : src.total;
  const scoreMode = src.scoreMode === 'relative' ? 'relative' : 'strokes';

  if (model.identity && model.scoreSets) {
    model.scoreMode = scoreMode;
    // 将字符串成绩转换为数字，空字符串转为 null
    model.scoreSets.strokes = (strokes || []).map((s) => {
      if (s === '' || s === null || s === undefined) return null;
      const num = Number(s);
      return isNaN(num) ? null : num;
    });
    model.scoreSets.relative = relative;
    model.holePars = padScores(src.holePars || SAMPLE.holePars);
    model.highlights = Array.isArray(src.highlights) ? src.highlights.slice() : [];
    model.roundPar = par;
    if (model.total && typeof model.total === 'object') {
      model.total.value = total === '' || total == null ? '' : String(total);
    }
    if (model.relativeTotal && typeof model.relativeTotal === "object") {
      const explicitToPar = src.toPar === null || src.toPar === undefined || src.toPar === ''
        ? null
        : Number(src.toPar);
      const toPar = Number.isFinite(explicitToPar)
        ? explicitToPar
        : null;
      model.toPar = Number.isFinite(toPar) ? toPar : null;
      if (!Number.isFinite(toPar)) model.relativeTotal.value = "";
      else model.relativeTotal.value = toPar > 0 ? "+" + toPar : String(toPar);
    }
    model.identity.nickname.value = playerName;
    if (courseName) model.identity.course.value = courseName;
    if (date) model.identity.date.value = date;
    if (extra) model.identity.extra.value = extra;
    model.photoPath = src.photoPath || '';
    model.previewSubject = src.source === 'sample' && !model.photoPath;
    remapPosterFonts(model);
    return model;
  }

  const explicitToPar = src.toPar === null || src.toPar === undefined || src.toPar === ''
    ? null
    : Number(src.toPar);
  const toPar = Number.isFinite(explicitToPar) ? explicitToPar : null;
  model.playerName = playerName;
  model.nickname = playerName;
  model.courseName = courseName;
  model.course = courseName;
  model.date = date;
  model.par = par;
  model.total = total;
  model.scores = strokes;
  model.source = src.source || '';
  model.toPar = toPar;
  remapPosterFonts(model);
  return model;
}

module.exports = {
  HOLE_COUNT,
  SAMPLE,
  getScoreData,
  applyScoreData
};
