/**
 * peoriaStore — 新新贝利亚净杆配置（Peoria-0.1）
 * 仅保存 peoriaConfig 到 teamMatchStore match，不计算 HDCP/NET。
 */

const teamMatchStore = require('../../../utils/teamMatchStore.js');

const HOLE_COUNT = 18;
const PICK_COUNT = 6;

function normalizeHoles(holes) {
  const seen = {};
  const list = [];
  (Array.isArray(holes) ? holes : []).forEach((h) => {
    const n = Number(h);
    if (!Number.isFinite(n) || n < 1 || n > HOLE_COUNT) return;
    if (seen[n]) return;
    seen[n] = true;
    list.push(n);
  });
  list.sort((a, b) => a - b);
  return list;
}

function pickRandomHoles(count) {
  const pool = [];
  for (let i = 1; i <= HOLE_COUNT; i++) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  return pool.slice(0, count || PICK_COUNT).sort((a, b) => a - b);
}

function buildPeoriaConfig(mode, selectedHoles) {
  const m = mode === 'manual' ? 'manual' : 'random';
  const holes = normalizeHoles(selectedHoles);
  return {
    mode: m,
    selectedHoles: holes,
    createdAt: Date.now()
  };
}

/**
 * @param {string} matchId
 * @param {{ mode: string, selectedHoles: number[] }} config
 * @returns {{ ok: boolean, peoriaConfig?: object, message?: string }}
 */
function savePeoriaConfig(matchId, config) {
  const id = matchId != null ? String(matchId).trim() : '';
  if (!id) return { ok: false, message: '缺少比赛 ID' };
  const match = teamMatchStore.getMatchById(id);
  if (!match) return { ok: false, message: '未找到比赛' };

  const mode = config && config.mode === 'manual' ? 'manual' : 'random';
  const holes = normalizeHoles(config && config.selectedHoles);
  if (holes.length !== PICK_COUNT) {
    return { ok: false, message: '请选择恰好 6 个洞' };
  }

  const peoriaConfig = buildPeoriaConfig(mode, holes);
  match.peoriaConfig = peoriaConfig;
  match.updatedAt = Date.now();
  teamMatchStore.saveMatch(match);
  return { ok: true, peoriaConfig: peoriaConfig };
}

function getPeoriaConfig(matchId) {
  const id = matchId != null ? String(matchId).trim() : '';
  if (!id) return null;
  const match = teamMatchStore.getMatchById(id);
  return match && match.peoriaConfig ? match.peoriaConfig : null;
}

/**
 * @param {string} matchId
 * @param {{ selectedHoles: number[], results: object[] }} payload
 * @returns {{ ok: boolean, peoriaResult?: object, message?: string }}
 */
function savePeoriaResult(matchId, payload) {
  const id = matchId != null ? String(matchId).trim() : '';
  if (!id) return { ok: false, message: '缺少比赛 ID' };
  const match = teamMatchStore.getMatchById(id);
  if (!match) return { ok: false, message: '未找到比赛' };

  // 已生成则冻结，禁止覆盖 / 重算
  if (match.peoriaResult && match.peoriaResult.status === 'generated') {
    return { ok: false, message: '净杆已生成，不可重新计算' };
  }

  const holes = normalizeHoles(payload && payload.selectedHoles);
  if (holes.length !== PICK_COUNT) {
    return { ok: false, message: '请选择恰好 6 个洞' };
  }
  const results = Array.isArray(payload && payload.results) ? payload.results : [];

  const peoriaResult = {
    status: 'generated',
    selectedHoles: holes,
    results: results,
    createdAt: Date.now()
  };
  match.peoriaResult = peoriaResult;
  match.updatedAt = Date.now();
  teamMatchStore.saveMatch(match);
  return { ok: true, peoriaResult: peoriaResult };
}

module.exports = {
  HOLE_COUNT,
  PICK_COUNT,
  normalizeHoles,
  pickRandomHoles,
  buildPeoriaConfig,
  savePeoriaConfig,
  getPeoriaConfig,
  savePeoriaResult
};
