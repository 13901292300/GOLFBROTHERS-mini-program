/**
 * peoriaCalculator — 新新贝利亚（New New Peoria）净杆计算
 * 仅负责计算，不含页面 / 存盘逻辑。
 *
 * 公式（禁止其他变体）：
 *   S  = 抽出 6 洞原始成绩总和（不含 6H / 六洞标准杆）
 *   adjustedTotal = 18 洞按 2·3·4 制封顶后总和
 *   HDCP = ((adjustedTotal - S) * 1.5 - 72) * 0.8 ；上限 36
 *   NET  = TOTAL - HDCP（TOTAL 为 18 洞原始总杆）
 */

const HOLE_COUNT = 18;
const PICK_COUNT = 6;
const COURSE_PAR = 72;
const HDCP_MAX = 36;

/** PAR3→5 / PAR4→7 / PAR5→9 */
function maxScoreForPar(par) {
  const p = Number(par);
  if (!Number.isFinite(p) || p <= 0) return 7;
  if (p <= 3) return 5;
  if (p === 4) return 7;
  return 9;
}

function toScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeSelectedHoles(selectedHoles) {
  const seen = {};
  const list = [];
  (Array.isArray(selectedHoles) ? selectedHoles : []).forEach((h) => {
    const n = Number(h);
    if (!Number.isFinite(n) || n < 1 || n > HOLE_COUNT) return;
    if (seen[n]) return;
    seen[n] = true;
    list.push(n);
  });
  list.sort((a, b) => a - b);
  return list;
}

function resolveHolePars(holeLayout) {
  const pars = holeLayout && Array.isArray(holeLayout.holePars)
    ? holeLayout.holePars
    : [];
  const out = [];
  for (let i = 0; i < HOLE_COUNT; i++) {
    const p = Number(pars[i]);
    out.push(Number.isFinite(p) && p > 0 ? p : 4);
  }
  return out;
}

/**
 * @param {object} player { playerId, scores: number[] }
 * @param {number[]} selectedHoles 1–18
 * @param {number[]} holePars length 18
 * @returns {object|null}
 */
function calculatePlayerPeoria(player, selectedHoles, holePars) {
  const playerId = player && player.playerId != null ? String(player.playerId).trim() : '';
  if (!playerId) return null;
  const scores = Array.isArray(player.scores) ? player.scores : [];

  let total = 0;
  let adjustedTotal = 0;
  for (let i = 0; i < HOLE_COUNT; i++) {
    const raw = toScore(scores[i]);
    if (raw === null) return null;
    total += raw;
    const capped = Math.min(raw, maxScoreForPar(holePars[i]));
    adjustedTotal += capped;
  }

  let sixHoleSum = 0;
  for (let i = 0; i < selectedHoles.length; i++) {
    const hole = selectedHoles[i];
    const raw = toScore(scores[hole - 1]);
    if (raw === null) return null;
    sixHoleSum += raw;
  }

  let handicap = ((adjustedTotal - sixHoleSum) * 1.5 - COURSE_PAR) * 0.8;
  if (handicap > HDCP_MAX) handicap = HDCP_MAX;
  handicap = Math.round(handicap * 100) / 100;

  const net = Math.round((total - handicap) * 100) / 100;

  return {
    playerId: playerId,
    total: total,
    adjustedTotal: adjustedTotal,
    sixHoleSum: sixHoleSum,
    handicap: handicap,
    net: net
  };
}

/**
 * @param {{ players: Array<{playerId:string, scores:number[]}>, selectedHoles: number[], holeLayout: { holePars?: number[] } }} input
 * @returns {Array<object>}
 */
function calculatePeoriaResults(input) {
  const src = input || {};
  const selectedHoles = normalizeSelectedHoles(src.selectedHoles);
  if (selectedHoles.length !== PICK_COUNT) return [];

  const holePars = resolveHolePars(src.holeLayout);
  const players = Array.isArray(src.players) ? src.players : [];
  const results = [];
  const seen = {};

  players.forEach((player) => {
    const row = calculatePlayerPeoria(player, selectedHoles, holePars);
    if (!row) return;
    if (seen[row.playerId]) return;
    seen[row.playerId] = true;
    results.push(row);
  });

  return results;
}

module.exports = {
  HOLE_COUNT,
  PICK_COUNT,
  COURSE_PAR,
  HDCP_MAX,
  maxScoreForPar,
  calculatePlayerPeoria,
  calculatePeoriaResults
};
