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
  playerName: 'TIGERHOODS',
  nickname: 'TIGERHOODS',
  courseName: 'Pinehurst No. 2',
  course: 'Pinehurst No. 2',
  date: '2026-08-17',
  extra: '',
  par: DEFAULT_PAR,
  roundPar: DEFAULT_PAR,
  total: DEFAULT_PAR,
  toPar: 0,
  scoreMode: 'strokes',
  templateId: 'academy',
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
  const slots = group && Array.isArray(group.playersSlots) ? group.playersSlots : [];
  const pid = String(playerId || '').trim();
  let slotIndex = -1;
  for (let i = 0; i < slots.length; i++) {
    const p = slots[i];
    if (!p) continue;
    const id = p.playerId != null ? String(p.playerId).trim() : '';
    if (pid && id === pid) {
      slotIndex = i;
      break;
    }
  }
  const slot = slotIndex >= 0 ? slots[slotIndex] : null;
  return { slots: slots, slotIndex: slotIndex, slot: slot };
}

const DEFAULT_NICKNAME = '球员';

/**
 * 当前用户展示名：槽位 name → 当前用户 name → 「球员」。
 */
function resolvePlayerDisplayName(found, playerId) {
  const slotName = found && found.slot && found.slot.name
    ? String(found.slot.name).trim()
    : '';
  if (slotName) return slotName;

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
    return userName;
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
  const rec =
    gameStore.resolveGroupSlotScoreRecord(group, found.slotIndex, playerId) || {
      scores: [],
      putts: []
    };

  const scores = padScores(rec.scores);
  const total = sumFilledScores(rec.scores);
  const par = resolvePar(game);
  const holePars = resolveHolePars(game);
  const relative = buildRelativeScores(scores, holePars);
  const playerName = resolvePlayerDisplayName(found, playerId);
  const date = formatDateYMD(game.createdAt) || formatDateYMD(Date.now());
  const extra = game.roundName || game.gameMode || '';

  return {
    source: 'gameStore',
    gameId: gameId,
    groupIndex: groupIndex,
    slotIndex: found.slotIndex,
    playerId: playerId,
    playerName: playerName,
    nickname: playerName,
    courseName: game.courseName || '',
    course: game.courseName || '',
    date: date,
    extra: extra,
    par: par,
    roundPar: par,
    total: total,
    toPar: total - par,
    scoreMode: 'strokes',
    templateId: 'academy',
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
    if (!gameId) return Object.assign({}, SAMPLE);

    const game = gameStore.getGame(gameId) || gameStore.getGameById(gameId);
    if (!game) return Object.assign({}, SAMPLE);

    const groupIndex = resolveGroupIndex();
    const data = buildScoreDataFromGame(game, gameId, groupIndex, playerId);
    if (!data) return Object.assign({}, SAMPLE);
    return data;
  } catch (e) {
    console.warn('[score-data] getScoreData failed, fallback sample', e);
    return Object.assign({}, SAMPLE);
  }
}

/**
 * 将成绩数据写入海报 Canvas 模型（identity / scoreSets）。
 */
function applyScoreData(model, scoreData) {
  const src = scoreData || SAMPLE;
  if (!model || typeof model !== 'object') return model;

  const strokes = padScores(src.strokes || src.scores);
  const relative = padScores(src.relative);
  const playerName = String(src.nickname || src.playerName || src.name || '').trim() || DEFAULT_NICKNAME;
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
    if (!model.relativeTotalCleared) {
      const toPar = Number.isFinite(Number(src.toPar))
        ? Number(src.toPar)
        : (Number.isFinite(Number(total)) ? Number(total) - par : null);
      model.toPar = Number.isFinite(toPar) ? toPar : null;
      if (model.relativeTotal && typeof model.relativeTotal === "object") {
        if (!Number.isFinite(toPar)) model.relativeTotal.value = "";
        else model.relativeTotal.value = toPar > 0 ? "+" + toPar : String(toPar);
      }
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

  const toPar = Number.isFinite(Number(src.toPar))
    ? Number(src.toPar)
    : Number(total) - par;
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
